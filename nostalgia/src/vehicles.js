/* NOSTALGIA — vehicles.js
 * Vehicle types (cycle, ladies cycle, Luna, Chetak, RX100, auto, Ambassador, Maruti 800,
 * Padmini, city bus, lorry, boat), arcade physics (throttle / brake / reverse, speed-
 * dependent steering, lateral grip + handbrake drift, surface slow-down, wall bounce and
 * scrape, vehicle-vehicle and vehicle-ped pushes), procedural pseudo-3D drawing (rotated
 * extruded prisms that lean like GTA2 buildings), skid marks, exhaust/dust/spark/foam
 * particles, headlights at night, enter / exit / borrow, horn and radio events.
 * Contract: ARCHITECTURE.md §8 (extended there: "vehicles.js implementation notes").
 *
 * A3 age-appropriate vehicles (design/amendments.md, binding): Chinnu is 11. TYPES[t].kidOk types are
 * the ones he may drive: cycles (hero_cycle — black Hero roadster, rod brakes, carrier, chain guard,
 * dynamo lamp, THE bell, ridden *kainchi* style; hercules_cycle — the sporty one, fat tyres, flat bar,
 * better on rough ground; cycle (BSA SLR) / bsa_cycle, ladiescycle, kid_cycle, his own chinnu_cycle,
 * hercules_gears), the scooty (akka_scooty from 30 finds) and the auto (kid: slower, peeking over the
 * bar, autowalas shout). Everything else (luna, chetak, rx100, cars, bus, lorry, boats) offers a seat
 * behind the NPC driver ("Sit pillion" / "Ride as passenger" / "Board bus ₹3" / "Ride auto (fare)" via
 * N.shops.rideVehicle) or a kid-flavoured refusal (TYPES[t].refuse). N.vehicles.allowHeavy (debug) or
 * ageRules = false lifts the rule; N.debug.enterVehicle always works. API: canDrive(v | type),
 * offerFor(v) -> {kind, label}, ride(actor, v, {as, fare, lock}) (pillion / passenger; ACTION "Get off"
 * asks the driver to stop), isPassenger(), boardBus, trafficMix(style, base) (+ TYPES[t].spawn weights;
 * patches N.traffic.TUNE.mix once unless N.traffic.readsTypeWeights), seedHome(). Events:
 * 'vehicle:ride' {vehicle, actor, as, fare}, 'vehicle:refused' {vehicle, type, line}, 'bus:board',
 * 'vehicle:autoShout'; player:enter/exitVehicle carry {passenger} when riding along.
 * A2 potholes: every frame each moving vehicle near the view (and always the player's) checks
 * N.world.potholeAt(x, y) -> {depth, r, wet?} | null under its front and rear wheels (missing API: no
 * potholes). On entry: speed x0.82 at full depth and top speed, v.jolt = 1 (decays; 2D bob here, 3D
 * reads it), N.render.shake(1.5) for the player, sfx 'pothole' (louder with speed, variant 'wet' after
 * rain), dust / muddy drops, 2.5% x depth puncture (pedal cycles; 60 s grace), 2% x depth comic fall
 * above 80% of top speed (bikes, player.fall: DHADAAM, never hurt; 45 s grace). On foot: a tiny stumble (+ splash when wet), 'player:stumble'.
 * Events: 'vehicle:pothole' {vehicle, speed, depth, severity, wet, wheel, x, y, player} once per pothole (the
 * rear wheel dropping into the same one is 'vehicle:potholeRear', a softer thump with no second penalty).
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

  // Tunables (systems §2.6, §3.1, §5.6; amendments A2 potholes, A3 age-appropriate vehicles).
  const TUNE = {
    kidTop: 0.9, kidAccel: 0.85, kidTopAuto: 0.8, kidAccelAuto: 0.8, flatTop: 0.55, punctureRate: 0.003,
    pickupAfter: 1.5, rightAfter: 8, rainGrip: 0.8, rainGripBike: 0.7, witnessR: 120,
    ownerShout: 0.25, heatParked: 40, heatWitnessed: 100, heatCycle: 30, heatChetakNanna: 100, heatChetak: 40,
    // A2 potholes: speed x0.82 at full depth + top speed, a jolt, shake 1.5 (player), 2.5% flats on cycles,
    // 2% comic falls above 80% of top speed; walking through one is a tiny stumble
    // (measured on world.js' real potholes, flat out on a Hero: ~5 hits/min in a colony, ~13 round Tank Bund,
    // ~19 in the Old City; 2.5% x depth per hit + 60 s of grace = a flat every few minutes at worst)
    potholeLoss: 0.18, potholeShake: 1.5, potholePuncture: 0.025, potholePunctureCD: 60, potholeFall: 0.02, potholeFallAt: 0.8,
    potholeMinSpeed: 6, potholeView: 90, joltDecay: 2.8, stumble: 0.45,
    // the rear wheel dropping into the pothole the front wheel just hit: a softer second thump (no second
    // speed loss / puncture / fall roll); swept wheel samples every 2 u; no second comic fall for 45 s
    potholeRear: 0.25, potholeStep: 2, potholeFallCD: 45,
    // A3: the kid on a Scooty wobbles above 78% of top speed; autowalas shout at a kid driving an auto
    wobbleFrom: 0.78, autoShout: [7, 13], autoShoutR: 170, fareAutos: true, busFare: 300, footboard: 50,
    // seats / lifts / fares only while the vehicle is slower than walking; a bus up to 60 u/s (footboard);
    // "no" offers within 10 u at priority -2 (below side activities), one refusal per 1.5 s
    seatMaxSpeed: 35, busMaxBoard: 60, noR: 10, noPriority: -2, noCD: 1.5, lockStuck: 8,
    // the "Get off / Get out" prompt goes quiet (no desktop prompt, no glow) above this speed (u/s)
    exitQuietSpeed: 25,
  };
  // bike surface factors (cls 'bike'); everything else uses world.js SPEED.drive. A type's `rough`
  // ({surf: factor}) overrides them (the Hercules' fat tyres, the Scooty's small wheels).
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
    // A3: kidOk = Chinnu (11) may drive it; otherwise ACTION offers a ride with its NPC driver
    // (pillion / passenger / fare) or says `refuse` (a kid-flavoured line). sound / bell: audio.js
    // engine profile and bell voice. spawn: traffic weight per district style (N.vehicles.trafficMix).
    kidOk: false, refuse: null, sound: null, bell: null, spawn: null, rough: null,
    // fare: a working one (NPC at the controls) is hired for a fare ride via N.shops.rideVehicle
    // (the cycle-rickshaw: its rickshaw-wala pedals, Chinnu sits behind)
    fare: false,
  };
  const TYPES = {};
  // A3 rules for types other modules define: traffic.js' cycle-rickshaw is based on 'cycle' (kidOk) but
  // is a fare ride with the rickshaw-wala pedalling; Chinnu never sits at its pedals.
  const TYPE_RULES = {
    rickshaw: { kidOk: false, fare: true, refuse: ["The rickshaw-wala's seat is up there, the pedals way down there. *Nakko.*", 'Pedal a whole rickshaw, with people in it? Wait for the rickshaw-wala, *baba*.'] },
  };

  /** Define (or redefine) a vehicle type. spec.base inherits from another type (story vehicles). */
  function define(id, spec) {
    const base = spec.base && TYPES[spec.base] ? TYPES[spec.base] : DEFAULTS;
    const t = Object.assign({}, base, spec, TYPE_RULES[id] || null, { id });
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

  // Refusal lines (A3): Chinnu is 11. He rides cycles, the Scooty and the auto; everything else is
  // pillion / passenger with a grown-up at the controls.
  const REFUSE = {
    luna: ['A Luna? Pedal, pedal, then WHOOSH. Amma would see it from the terrace. *Nakko.*', "Feet don't even reach the stand, *baba*."],
    chetak: ["A Chetak? You kick-start it tilted sideways. Feet don't even reach, *baba*.", 'Chetak gears are on the handle. My hands are too small. *Nakko.*'],
    family_chetak: ['Nanna will kill me if I touch his Chetak!', "Nanna's Chetak. He counts the scratches. *Nakko!*"],
    rx100: ["RX100? Bunty-anna says it's \"not for kids, for legends\". Feet don't even reach, *baba*.", 'That thing goes *DHOOM*. Amma would go *DHOOM* too. *Nakko.*'],
    car: ["Feet don't even reach, *baba*. And the steering is bigger than me.", 'Drive a CAR? I can see over the dashboard only if I stand. *Nakko.*'],
    bus: ['A whole BUS? Conductor uncle would pull my ear. Board one at a stop, three rupees.', 'The bus steering is as big as a *thali*. *Nakko.*'],
    lorry: ['Horn OK Please. Driving NOT OK, please.', 'The lorry has a ladder to get in. A LADDER. *Nakko.*'],
    boat: ['Boats only at the jetty, with the boatman. Ten rupees.', 'I can\'t even swim properly. *Nakko.*'],
  };
  define('cycle', {
    name: 'BSA SLR cycle', short: 'cycle', verb: 'Ride', cls: 'bike', w: 15, d: 5, h: 6,
    maxSpeed: 115, accel: 62, brake: 170, reverse: 0.12, drag: 24, turn: 3.4, turnLow: 0.5, turnHigh: 0.62,
    grip: 13, drift: 3.2, mass: 1.2, seats: 1, lights: false, rider: true, pedal: true, door: false, bikeLook: 'cycle',
    kidOk: true, sound: 'cycle', bell: 'plain',
    colors: ['#1d1d22', '#2f6a3a', '#24479a', '#9a2424', '#1d1d22'], draw: (ctx, v) => drawCycle2(ctx, v),
  });
  define('bsa_cycle', { base: 'cycle', name: 'BSA SLR', short: 'BSA SLR', colors: ['#24479a', '#9a2424', '#2f6a3a', '#1d1d22'] });
  define('ladiescycle', {
    base: 'cycle', name: 'Ladies cycle', short: 'ladies cycle', maxSpeed: 108, accel: 58, basket: true,
    colors: ['#8a2a4a', '#c05a8a', '#3a7ab0', '#6a3a8a', '#2a8a7a'],
  });
  // The classic black Hero roadster: rod brakes, rear carrier, chain guard, dynamo lamp and THE bell.
  // Heavy and steady: slow to spin up, coasts for ever, brakes like a thought. A kid rides it *kainchi*
  // style (one leg through the frame) because the saddle is miles up.
  define('hero_cycle', {
    base: 'cycle', name: 'Hero cycle', short: 'Hero cycle', w: 16, d: 5, h: 6.5, bikeLook: 'hero',
    maxSpeed: 110, accel: 55, brake: 150, reverse: 0.1, drag: 21, turn: 3.1, turnLow: 0.45, turnHigh: 0.58, steerResp: 8,
    grip: 14, drift: 3.4, mass: 1.6, bounce: 0.24, carrier: 0.85, dynamo: true, kainchi: true, bell: 'hero',
    colors: ['#141418', '#141418', '#141418', '#16213e', '#3a1618'],
    spawn: { colony: 10, market: 6, oldcity: 10, colonial: 4, posh: 2, cantonment: 7, hitec: 2, rocky: 6, osmania: 10 },
    draw: (ctx, v) => drawCycle2(ctx, v),
  });
  // The sporty Hercules: bright frame, flat bar, fat knobbly tyres. Lighter and quicker, and it
  // shrugs off rough ground and potholes better than the roadster.
  define('hercules_cycle', {
    base: 'cycle', name: 'Hercules', short: 'Hercules', w: 14.5, d: 5, h: 6, bikeLook: 'hercules',
    maxSpeed: 120, accel: 68, brake: 185, reverse: 0.12, drag: 25, turn: 3.6, turnLow: 0.55, turnHigh: 0.66, steerResp: 13,
    grip: 12.5, drift: 3, mass: 1.1, punctureMul: 0.5, potholeMul: 0.65, bell: 'hercules',
    rough: { [N.SURF.GROUND]: 0.94, [N.SURF.GRASS]: 0.86, [N.SURF.SAND]: 0.68 },
    colors: ['#d8262a', '#1f6fd0', '#f0b818', '#26a050', '#e8601a', '#b82884'], colors2: ['#f4f2ea', '#1a1a1e', '#ffe14a'],
    spawn: { colony: 5, market: 2, oldcity: 3, colonial: 3, posh: 3, cantonment: 4, hitec: 2, rocky: 4, osmania: 8 },
    draw: (ctx, v) => drawCycle2(ctx, v),
  });
  define('hercules_gears', {
    base: 'hercules_cycle', name: 'Hercules with gears', short: 'Hercules (gears)', maxSpeed: 132, accel: 74, gears: true,
    colors: ['#1f6fd0'], colors2: ['#ffe14a'], spawn: null,
  });
  // The Scooty: a small step-through scooter in a bright colour. Light and nimble; with an
  // 11-year-old perched on the front of the seat it gets wobbly near the top speed.
  define('scooty', {
    name: 'Scooty', short: 'Scooty', verb: 'Ride', cls: 'bike', w: 14.5, d: 5.6, h: 7.2,
    maxSpeed: 122, accel: 84, brake: 195, reverse: 0.08, drag: 26, turn: 3.4, turnLow: 0.5, turnHigh: 0.56, steerResp: 12,
    grip: 10.5, drift: 2.6, mass: 1.7, seats: 2, lights: true, rider: true, door: false, smoke: 'light', bikeLook: 'scooty',
    kidOk: true, kidWobble: 0.6, sound: 'scooty', potholeMul: 1.15,
    rough: { [N.SURF.GROUND]: 0.78, [N.SURF.GRASS]: 0.66, [N.SURF.SAND]: 0.45 },
    colors: ['#e8323c', '#f07aa0', '#2e9ad8', '#f2c418', '#8cc63e', '#ff7a1a', '#c6ccd2', '#7a4ac0'],
    spawn: { colony: 7, market: 5, oldcity: 3, colonial: 5, posh: 7, cantonment: 6, hitec: 4, rocky: 4, osmania: 9 },
    draw: (ctx, v) => drawScooty(ctx, v),
  });
  define('luna', {
    name: 'TVS Luna', short: 'Luna', verb: 'Ride', cls: 'bike', w: 15, d: 5.5, h: 7,
    maxSpeed: 120, accel: 70, brake: 190, reverse: 0.1, drag: 26, turn: 3.2, turnLow: 0.45, turnHigh: 0.6,
    grip: 12, drift: 3, mass: 2, seats: 1, lights: true, rider: true, door: false, smoke: 'light', bikeLook: 'luna',
    refuse: REFUSE.luna, sound: 'luna',
    colors: ['#b82a2a', '#2a4a9a', '#2a2a30', '#3a7a4a'], draw: (ctx, v) => drawBike(ctx, v),
  });
  define('chetak', {
    name: 'Bajaj Chetak', short: 'Chetak', verb: 'Ride', cls: 'bike', w: 17, d: 7, h: 8,
    maxSpeed: 150, accel: 95, brake: 210, reverse: 0.1, drag: 28, turn: 3.0, turnLow: 0.42, turnHigh: 0.58,
    grip: 11, drift: 2.6, mass: 3, seats: 2, lights: true, rider: true, door: false, smoke: '2t', bikeLook: 'chetak',
    refuse: REFUSE.chetak, sound: 'chetak',
    colors: ['#86b9c9', '#ddd2b2', '#b9483b', '#6f8d68', '#e9e4d8', '#4f6fa8'], draw: (ctx, v) => drawBike(ctx, v),
  });
  define('rx100', {
    name: 'Yamaha RX100', short: 'RX100', verb: 'Ride', cls: 'bike', w: 18, d: 6, h: 8,
    maxSpeed: 180, accel: 150, brake: 230, reverse: 0.1, drag: 28, turn: 3.1, turnLow: 0.4, turnHigh: 0.52,
    grip: 11, drift: 2.4, mass: 3, seats: 2, lights: true, rider: true, door: false, smoke: '2t', bikeLook: 'rx100',
    refuse: REFUSE.rx100, sound: 'rx100',
    colors: ['#1c1c22', '#a01e2a', '#1e3c8a', '#5a1a3a'], draw: (ctx, v) => drawBike(ctx, v),
  });
  define('auto', {
    name: 'Auto-rickshaw', short: 'auto', verb: 'Drive', cls: 'auto', w: 22, d: 13, h: 14.5,
    maxSpeed: 135, accel: 80, brake: 210, reverse: 0.3, drag: 32, turn: 2.7, turnLow: 0.12, turnHigh: 0.6,
    grip: 7.5, drift: 1.6, mass: 5, seats: 3, radio: true, smoke: '2t', door: false, kidOk: true, sound: 'auto',
    colors: ['#f2c230'], colors2: ['#1c1a1c', '#1c1a1c', '#2a4a2a'], draw: (ctx, v) => drawAuto(ctx, v),
  });
  DEFAULTS.refuse = REFUSE.car; // cars (and any story type without its own lines)
  define('ambassador', {
    name: 'Ambassador', short: 'Ambassador', w: 30, d: 14, h: 12.5, sound: 'ambassador',
    maxSpeed: 165, accel: 88, turn: 2.2, grip: 8.5, mass: 10, radio: true,
    colors: ['#efeae0', '#efeae0', '#1e1e24', '#e0d3ae', '#6a1e26', '#7d8b93'],
    car: { body: [2, 7.4], rf: 5, rr: 5, cab: [-9.5, 5.5], cabInset: 1.2, cabH: 12.5, cabR: 3, slopeF: 3.4, slopeR: 2.6, slopeS: 1.3, bumper: '#c9c9c4', curvy: true },
    draw: (ctx, v) => drawCar(ctx, v),
  });
  define('maruti800', {
    name: 'Maruti 800', short: 'Maruti 800', w: 24, d: 12, h: 11.5, sound: 'maruti800',
    maxSpeed: 165, accel: 110, turn: 2.6, grip: 8.5, mass: 6, radio: true,
    colors: ['#f2f0ea', '#c8322a', '#2a4c8a', '#b8bcc0', '#8ab8d8', '#f2f0ea'],
    car: { body: [2, 7], rf: 3.6, rr: 2.6, cab: [-10.6, 4.4], cabInset: 1, cabH: 11.5, cabR: 2, slopeF: 3.6, slopeR: 1.4, slopeS: 1.1, bumper: '#3a3a3e' },
    draw: (ctx, v) => drawCar(ctx, v),
  });
  define('padmini', {
    name: 'Premier Padmini', short: 'Padmini', w: 26, d: 12, h: 11, sound: 'padmini',
    maxSpeed: 158, accel: 92, turn: 2.4, grip: 8.5, mass: 7, radio: true,
    colors: ['#8fb0c8', '#7a9a6a', '#ece6d8', '#c8b48a', '#1e1e24', '#a8443a'],
    car: { body: [2, 7], rf: 3, rr: 3, cab: [-8, 5], cabInset: 1.1, cabH: 11, cabR: 1.6, slopeF: 3, slopeR: 2, slopeS: 1.1, bumper: '#c9c9c4' },
    draw: (ctx, v) => drawCar(ctx, v),
  });
  define('bus', {
    name: 'City bus', short: 'bus', verb: 'Drive', cls: 'heavy', w: 62, d: 18, h: 19.5,
    maxSpeed: 115, accel: 42, brake: 150, reverse: 0.25, drag: 30, turn: 1.25, turnLow: 0, turnHigh: 0.7,
    grip: 10, drift: 3, bounce: 0.18, mass: 40, seats: 50, radio: true, camZoom: 0.86, smoke: 'diesel', playerNoEnter: true,
    refuse: REFUSE.bus, sound: 'bus', colors: ['#b22b2b'], routes: ['127K', '8A', '9X', '49M', '5K', '1Z', '65G', '219'], draw: (ctx, v) => drawBus(ctx, v),
  });
  define('lorry', {
    name: 'Lorry', short: 'lorry', verb: 'Drive', cls: 'heavy', w: 46, d: 16, h: 16,
    maxSpeed: 110, accel: 40, brake: 150, reverse: 0.25, drag: 30, turn: 1.2, turnLow: 0, turnHigh: 0.7,
    grip: 10, drift: 3, bounce: 0.18, mass: 45, seats: 2, radio: true, camZoom: 0.88, smoke: 'diesel', playerNoEnter: true,
    refuse: REFUSE.lorry, sound: 'lorry', colors: ['#e0782a', '#2a6ab8', '#3a8a5a', '#c03030', '#d8a020'], colors2: ['#e8c060', '#3aa0a0', '#e86a3a', '#8ac04a'],
    draw: (ctx, v) => drawLorry(ctx, v),
  });
  define('boat', {
    name: 'Boat', short: 'boat', verb: 'Steer', cls: 'boat', mode: 'boat', w: 28, d: 11, h: 6,
    maxSpeed: 60, accel: 28, brake: 40, reverse: 0.4, drag: 14, turn: 1.1, turnLow: 0.35, turnHigh: 0.8,
    grip: 2.2, drift: 1.2, bounce: 0.15, mass: 12, seats: 6, door: false, refuse: REFUSE.boat, sound: 'boat',
    colors: ['#f2efe6', '#e8e2d0'], colors2: ['#c0392b', '#2a8c82', '#2a5cb8', '#e0a020'], draw: (ctx, v) => drawBoat(ctx, v),
  });

  /* ------------------------------------------- story and special types (systems §3.2) */
  // nakko: the player can't take it; ACTION near it shows "Nakko" and says this line instead.
  // allow(): when present, the nakko applies only until it returns true (unlocks).
  // rideOk: an NPC at its controls (story, family) offers the player a pillion / passenger seat.
  define('family_chetak', { base: 'chetak', name: "Nanna's Chetak", short: 'Chetak', colors: ['#7d9ab0'], refuse: REFUSE.family_chetak, rideOk: true });
  // Chinnu's own second-hand roadster (12 finds): a Hero with the saddle let right down (no kainchi)
  define('chinnu_cycle', { base: 'hero_cycle', name: "Chinnu's cycle", short: 'cycle', maxSpeed: 122, accel: 66, carrier: 0.75, kainchi: false, colors: ['#17171c'], spawn: null });
  define('old_cycle', { base: 'hero_cycle', name: "Nanna's roadster", short: 'roadster', maxSpeed: 105, turn: 3.0, colors: ['#121214'], spawn: null });
  define('kid_cycle', { base: 'cycle', name: "Kid's hire cycle", short: 'cycle', maxSpeed: 110, turn: 3.6, w: 13.5, bikeLook: 'kid', colors: ['#9a2424', '#2f6a3a', '#24479a'] });
  define('bunty_rx100', {
    base: 'rx100', name: "Bunty-anna's RX100", short: 'RX100', colors: ['#1c1c22'], seats: 2, rideOk: true,
    refuse: ["Bunty-anna's RX100? Only pillion, only with a helmet, only behind Bunty-anna.", 'Bunty-anna: "Touch it and I tell Mummy about the broken window."'],
  });
  // A3 + the ladder (30 finds): Akka next door lends her Scooty (backward-compatible with unlock_chetak)
  define('akka_scooty', {
    base: 'scooty', name: "Akka's Scooty", short: 'Scooty', colors: ['#e2486c'], colors2: ['#f4f0e8'], spawn: null,
    nakko: 'Akka\'s Scooty. "When you\'re older," she says. ...Maybe if I find enough things for my diary?',
    allow: () => unlocked('scooty', 30) || unlocked('chetak', 30),
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
      this.flat = false; this.fallen = null; this.pillion = null;
      // A2: jolt = 1 on hitting a pothole, decays to 0 (renderers bob the body: 2D here, 3D view3d_actors)
      this.jolt = 0; this.joltSide = 0; this.potF = false; this.potR = false; this.potCD = 0;
      // passengers riding along with the NPC driver (A3 pillion / passenger rides)
      this.passenger = null; this.stopReq = 0; this.rideOk = !!(opts.rideOk != null ? opts.rideOk : T.rideOk);
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
      // bikes keep their speed on footpaths and plazas and lose less on dirt (systems §3.1);
      // a type's own `rough` table wins (Hercules fat tyres, Scooty small wheels)
      const bs = T.cls === 'bike' ? (T.rough && T.rough[surf] != null ? T.rough[surf] : BIKE_SURF[surf]) : undefined;
      sMul = bs != null ? bs : W.surfaceSpeed(surf, 'drive');
    }
    let top = T.maxSpeed * sMul * (v.boost || 1);
    let accel = T.accel;
    if (v.flat) top *= TUNE.flatTop;
    const pl = N.player;
    const kid = !!pl && v.driver === pl;
    if (kid) {
      // kid at the wheel: perched on the seat edge to reach the pedals (an auto: peeking over the bar)
      if (T.cls === 'auto') { top *= TUNE.kidTopAuto; accel *= TUNE.kidAccelAuto; }
      else if (T.cls === 'car' || T.cls === 'heavy') { top *= TUNE.kidTop; accel *= TUNE.kidAccel; }
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
    // A3: an 11-year-old on a Scooty near its top speed: the handlebar wobbles (gently, two beats)
    v.wobble = 0;
    if (kid && T.kidWobble && sn > TUNE.wobbleFrom && vf > 0) {
      const amp = U.clamp((sn - TUNE.wobbleFrom) / (1 - TUNE.wobbleFrom), 0, 1) * T.kidWobble;
      v.wobble = amp * Math.sin(v.age * 6.6 + Math.sin(v.age * 2.1) * 1.6);
      tav += v.wobble;
    }
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
    const leanT = T.cls === 'bike' ? U.clamp(v.av * sn * 0.9 + (v.wobble || 0) * 0.35, -0.6, 0.6) : 0;
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
  // (scratch result arrays filled by N.entities.queryN: no array per vehicle / person per step, audit PERF-16; a
  // 'bump' listener that re-enters a pass gets a fresh one)
  const NEAR_V = [], NEAR_P = [];
  let nearVBusy = false, nearPBusy = false;
  function collideVehicles() {
    const E = N.entities, own = !nearVBusy, near = own ? NEAR_V : [];
    nearVBusy = true;
    try {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!a.alive || a.asleep) continue;
        const n = E.queryN(a.x, a.y, a.T.w / 2 + 34, null, near, 'vehicle');
        if (n > 1) collideVehicle(a, near, n);
      }
    } finally { if (own) nearVBusy = false; }
  }
  function collideVehicle(a, near, n) {
    const Ta = a.T;
    {
      for (let k = 0; k < n; k++) {
        const b = near[k];
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
    const rr = Ta.cr + Tb.cr, ax0 = a.x, ay0 = a.y, bx0 = b.x, by0 = b.y; // positions read once (boxed loads)
    let best = 0, bnx = 0, bny = 0, bpx = 0, bpy = 0, boa = 0, bob = 0;
    for (let i = 0; i < Ta.co.length; i++) {
      const ax = ax0 + ca * Ta.co[i], ay = ay0 + sa * Ta.co[i];
      for (let j = 0; j < Tb.co.length; j++) {
        const bx = bx0 + cb * Tb.co[j], by = by0 + sb * Tb.co[j];
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
    const E = N.entities, all = E.all, own = !nearPBusy, near = own ? NEAR_P : [];
    nearPBusy = true;
    try {
      for (let i = 0; i < all.length; i++) {
        const q = all[i];
        if (!q.alive || q.kind === 'vehicle' || q.kind === 'prop' || q.kind === 'pickup' || !q.solid || q.noCollide || q.hidden || q.vehicle) continue;
        const n = E.queryN(q.x, q.y, (q.r || 4) + 34, null, near, 'vehicle'); // = isVehicle
        if (n) collidePerson(q, near, n);
      }
    } finally { if (own) nearPBusy = false; }
  }
  function collidePerson(q, near, n) {
    const E = N.entities, p = N.player;
    {
      for (let k = 0; k < n; k++) {
        const v = near[k];
        if (v.driver === q) continue;
        const T = v.T, c = Math.cos(v.angle), s = Math.sin(v.angle);
        const qx = q.x, qy = q.y, dx = qx - v.x, dy = qy - v.y;
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
        const want = pen * ratio, qx0 = qx, qy0 = qy;
        E.pushTo(q, qx + nx * want, qy + ny * want);
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
    // an aunty / friend riding pillion gets off too (and has words): never left sitting behind the kid
    const pl = v.pillion;
    if (pl && pl !== actor && !(pl instanceof N.Actor)) {
      const look = pl.look || pl;
      v.pillion = null;
      if (look && typeof look === 'object') { const q = N.entities.add(new AngryDriver(spot.x + 5, spot.y + 2, v, look)); q.shout = 'BESHARAM!'; }
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

  /* ------------------------------------------- riding along (A3: pillion / passenger) */
  /**
   * Sit the actor (the player) behind / beside the NPC driver of v. The driver's controller keeps
   * driving (traffic route, story script, N.vehicles.driveTo); ACTION "Get off" asks him to stop.
   * opts: {as: 'pillion'|'passenger', fare (paise, charged via N.shops.charge), lock (no getting off),
   * quiet}. Returns true when seated. Story: N.vehicles.ride(N.player, nannaChetak, {lock: true}).
   */
  function ride(actor, v, opts) {
    opts = opts || {};
    if (!actor || !v || !v.alive || actor.vehicle || v.passenger || !v.driver || v.driver === actor) return false;
    if (v.T.mode === 'boat' && !opts.force) return false;
    if (opts.fare > 0 && actor === N.player && N.shops && typeof N.shops.charge === 'function') {
      const r = N.shops.charge(opts.fare, { why: opts.why || 'fare' });
      if (r && r.ok === false) { if (!opts.quiet) toast('No money for the ticket! (₹' + (opts.fare / 100) + ')', 2400); return false; }
    }
    const as = opts.as || (v.T.cls === 'bike' ? 'pillion' : 'passenger');
    actor.vehicle = v; actor.passenger = as;
    actor.mode = 'drive';
    actor._noCollideWas = actor.noCollide; actor.noCollide = true;
    actor.x = v.x; actor.y = v.y; actor.vx = v.vx; actor.vy = v.vy; actor.angle = v.angle;
    v.passenger = actor; v.lockPassenger = !!opts.lock; v.stopReq = 0; v.rideStill = 0;
    // a locked ride belongs to the mission that asked for it: when that mission ends (done, failed,
    // aborted, a load) the lock goes, so he can never be stuck on the back of a parked scooter
    v.lockRun = (opts.lock && N.missions && N.missions.active) || null;
    if (as === 'pillion') { v._pillionWas = v.pillion; v.pillion = actor; }
    v.wake();
    if (actor === N.player) {
      N.emit('player:enterVehicle', { vehicle: v, passenger: as });
      if (v.T.radio) N.emit('radio:enter', { vehicle: v });
    }
    N.emit('vehicle:enter', { vehicle: v, actor, passenger: as });
    N.emit('vehicle:ride', { vehicle: v, actor, as, fare: opts.fare || 0 });
    return true;
  }
  function passengerExit(actor, instant) {
    const v = actor.vehicle;
    let spot = exitSpot(v, 'walk');
    if (!spot) {
      if (!instant) { if (actor === N.player) toast('No room to get down here!', 1800); return false; }
      spot = N.world.findFree(v.x, v.y, 'walk', 260) || { x: v.x, y: v.y };
    }
    actor.vehicle = null; actor.passenger = null;
    actor.mode = 'foot';
    actor.noCollide = !!actor._noCollideWas;
    actor.x = spot.x; actor.y = spot.y;
    actor.vx = v.vx * 0.2; actor.vy = v.vy * 0.2;
    if (v.passenger === actor) v.passenger = null;
    if (v.pillion === actor) v.pillion = v._pillionWas || null;
    v._pillionWas = null; v.stopReq = 0; v.lockPassenger = false;
    if (actor === N.player) {
      N.emit('player:exitVehicle', { vehicle: v, passenger: true });
      if (v.T.radio) N.emit('radio:exit', { vehicle: v });
      if (zoomOwned) { N.render.baseZoom = 1; zoomOwned = false; }
    }
    N.emit('vehicle:exit', { vehicle: v, actor, passenger: true });
    if (v.rideRestored) leaveRestored(v);
    return true;
  }

  /* ---------------------------- A3: riding along survives a checkpoint retry and a save / load */
  /** What the actor (default player) rides along in: {type, as, look, angle, color, color2, seed} | null. */
  function rideState(a) {
    a = a || N.player;
    const v = a && a.vehicle;
    if (!v || !a.passenger || v.driver === a) return null;
    const d = v.driver;
    let look = null;
    try { look = d && d.look && typeof d.look === 'object' ? JSON.parse(JSON.stringify(d.look)) : null; } catch (e) { look = null; }
    return { type: v.type, as: a.passenger, look, angle: v.angle || 0, color: v.color, color2: v.color2, seed: v.seed };
  }
  /**
   * Seat the actor riding along with an NPC driver, never at the wheel: s = rideState() (+ opts {x, y}
   * spawns a new vehicle there; opts.vehicle uses that one, moving him to the back seat if a load put him
   * at its wheel). The restored ride has no route of its own: it waits for "Get off", then the driver rides
   * off and the vehicle goes once out of view. opts.lock: the running mission holds the seat. -> vehicle | null
   */
  function restoreRide(actor, s, opts) {
    opts = opts || {};
    if (!actor || !s || !TYPES[s.type]) return null;
    let v = opts.vehicle && opts.vehicle.alive ? opts.vehicle : null;
    if (v && actor.vehicle === v && v.driver === actor) {
      // a load spawned it with him at the wheel: hand the wheel back (no exit: he stays aboard)
      actor.vehicle = null; v.driver = null; actor.passenger = null;
      actor.mode = 'foot'; actor.noCollide = !!actor._noCollideWas;
    } else if (v && actor.vehicle) return null;
    if (!v) {
      if (actor.vehicle) exit(actor, true);
      const T = TYPES[s.type], x = opts.x != null ? opts.x : actor.x, y = opts.y != null ? opts.y : actor.y;
      const f = N.world.findFree(x, y, T.mode === 'boat' ? 'boat' : 'drive', 24) || { x, y };
      v = spawn(s.type, f.x, f.y, isFinite(s.angle) ? s.angle : 0, { color: s.color, color2: s.color2, seed: s.seed });
      if (!v) return null;
    }
    v.controller = null; v.autopilot = false;
    if (!npcDriven(v)) {
      const rng = U.rng ? U.rng((v.seed || 1) + 77) : null;
      v.driver = { look: s.look || N.people.randomLook(rng, 'man'), npc: true };
    }
    v.rideRestored = true;
    if (!ride(actor, v, { as: s.as === 'pillion' || s.as === 'passenger' ? s.as : undefined, lock: !!opts.lock, quiet: true, force: true })) {
      if (!v.seeded && !v.owned) remove(v);
      return null;
    }
    return v;
  }
  // a restored ride (no route of its own) rides off once he is down, and goes when nobody sees it
  function leaveRestored(v) {
    v.rideRestored = false;
    if (!v.alive || !npcDriven(v) || v.seeded || v.owned || v.special) return;
    const R = N.world.roads, n = R && R.nearestNode(v.x + Math.cos(v.angle) * 60, v.y + Math.sin(v.angle) * 60);
    const route = n ? R.randomRoute(n, 6) : [];
    const pts = [[v.x, v.y]].concat(route.map((q) => [q.x, q.y]));
    const gone = () => { if (v.alive && v.driver !== N.player && !v.passenger && !(N.render.inView && N.render.inView(v.x, v.y, 60))) remove(v); };
    if (pts.length > 1) driveTo(v, pts, { timeout: 30, speed: 60, warp: false, stop: true }).then(gone, gone);
  }
  // save section 'ride': applied after every section is in (save:loaded), before healAge looks at the seat
  let pendingRide = null;
  function applyPendingRide() {
    const s = pendingRide, p = N.player;
    pendingRide = null;
    if (!s || !p || !p.vehicle || p.passenger || p.vehicle.type !== s.type) return;
    restoreRide(p, s, { vehicle: p.vehicle });
  }

  /** "Board bus ₹3": a traffic bus (systems §3.6 hop-on). Moving > 15 u/s = footboard (+heat, scolding). */
  function boardBus(p, v) {
    const moving = Math.abs(v.speed) > 15, fare = busFare();
    if (!ride(p, v, { as: 'passenger', fare, why: 'bus' })) return false;
    if (moving) {
      if (N.wanted && typeof N.wanted.addHeat === 'function') N.wanted.addHeat(TUNE.footboard, 'footboard');
      toast('The conductor hauls you in by the collar: "*Footboard pe nakko!*"', 2800);
    } else toast(fare ? '"Right, right!" Conductor uncle punches your ticket. Three rupees.' : 'You show Ticket Thatha\'s punch. Conductor uncle salutes: "Free, free!"', 2600);
    N.emit('bus:board', { vehicle: v, footboard: moving, fare });
    return true;
  }
  /** Each frame while the player rides along: honour "Ask to stop" and drop him when it is slow. */
  function passengerTick(p, v, dt) {
    const d = v.driver;
    if (!v.alive || !d || d === p || d.alive === false) { passengerExit(p, true); return; } // nobody driving any more
    if (v.lockPassenger) {
      // the mission that locked the seat has ended, or (free roam) the ride has sat still for 8 s of play
      // (cutscenes and conversations don't count)
      v.rideStill = Math.abs(v.speed) < 3 ? (v.rideStill || 0) + (N.state.mode === 'play' && !p.controlsLocked ? dt : 0) : 0;
      const M = N.missions;
      if (v.lockRun ? !(M && M.active === v.lockRun) : v.rideStill > TUNE.lockStuck) { v.lockPassenger = false; v.lockRun = null; }
    }
    if (v.stopReq > 0) {
      v.ctl.throttle = 0; v.ctl.brake = true; v.ctl.steer *= 0.5; v.ctl.handbrake = false;
      // stopped: get down (squeezed between walls: the nearest free spot instead of waiting for ever)
      if (Math.abs(v.speed) < 6) passengerExit(p, true);
    }
  }

  /** Get an actor out of its vehicle (instant = no checks, used by teleports). */
  function exit(actor, instant) {
    const v = actor && actor.vehicle;
    if (!v) return false;
    if (actor.passenger || (v.passenger === actor && v.driver !== actor)) {
      // a story holds the seat (ride(.., {lock})): only a forced exit (teleport, despawn, a fall) gets him off
      if (!instant && v.lockPassenger) return false;
      // riding along: get down at once when slow (or forced), otherwise ask the driver to stop
      if (!instant && Math.abs(v.speed) > 20 && v.driver && v.driver !== actor) {
        if (!v.stopReq) { v.stopReq = 1; if (actor === N.player) toast(v.T.cls === 'heavy' ? '"Stop, stop! Getting down!" The conductor whistles twice.' : '"Uncle, stop here please!"', 1800); }
        return false;
      }
      return passengerExit(actor, instant);
    }
    // the driver gets out: anyone riding along gets down too
    if (v.passenger && v.passenger !== actor && v.passenger.vehicle === v) passengerExit(v.passenger, true);
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

  function npcDriven(v) { const d = v.driver; return !!d && d !== N.player && d.alive !== false && !!(d.npc || d instanceof N.Actor); }
  /** Can ACTION do anything with v at all? (pursuers' and roadblock vehicles never offer a seat) */
  function enterable(v, p) {
    if (!v.alive || v.driver === p || v.fallen || v.summoned || v.passenger || v.pursuitVehicle || v.roadblock) return false;
    // story / family vehicles are noEnter, but with an NPC at the controls and rideOk they offer a seat
    if (v.noEnter && !(v.rideOk && npcDriven(v))) return false;
    if (v.driver && !npcDriven(v)) return false;
    return true;
  }
  // "No" offers only show up close by (10 u). The generic ones (any Chetak, car, lorry; no lifts) sit below
  // every other interaction (shops, NPCs, side activities and "Namaste" at -1) and never hide a rideable
  // vehicle within reach; a named "Nakko" (Akka's Scooty before 30 finds, the VIP car, Yadagiri's auto)
  // carries a hint, so it keeps the vehicle priority and competes by distance.
  const NO_KINDS = { refuse: 1, nakko: 1, nolift: 1 };
  const SHY_KINDS = { refuse: 1, nolift: 1 };
  function bestOffer(p) {
    const near = N.entities.query(p.x, p.y, 18 + 34, isVehicle);
    let yes = null, yd = 18, no = null, nd = TUNE.noR;
    for (const v of near) {
      if (!enterable(v, p)) continue;
      const d = distTo(v, p.x, p.y);
      if (d >= yd && d >= nd) continue;
      const o = offerFor(v);
      if (!o || (NO_KINDS[o.kind] && d >= TUNE.noR)) continue;
      if (SHY_KINDS[o.kind]) { if (d < nd) { nd = d; no = { v, d, o }; } } else if (d < yd) { yd = d; yes = { v, d, o }; }
    }
    return yes || no;
  }

  /* -------------------------------------------- A3: who may drive what (Chinnu is 11) */
  /** May the player drive this vehicle? (cycles, the Scooty, the auto; debug: N.vehicles.allowHeavy) */
  function canDrive(v) {
    const T = v.T || TYPES[v.type] || DEFAULTS;
    return !!(V.allowHeavy || V.ageRules === false || v.allowPlayer || T.kidOk);
  }
  function lineOf(lines, seed) {
    if (!lines) return null;
    if (typeof lines === 'string') return lines;
    return lines[Math.abs(seed | 0) % lines.length];
  }
  /** The kid-flavoured refusal for a vehicle he may not drive. */
  function refusalFor(v) {
    const T = v.T;
    const k = (refusalFor.n = (refusalFor.n || 0) + 1);
    return lineOf(T.refuse || REFUSE[T.cls === 'heavy' ? 'bus' : 'car'], (v.seed || 0) + k);
  }
  const LIFT_LINES = ['"Lift? Okay, sit behind. Hold tight, legs away from the silencer."', '"Where to? ...Okay, okay, hop on. Don\'t wriggle."', '"Sit, sit. Both hands on my shoulders, *beta*."'];
  const NO_CAR_LIFT = ['"Lift? Ask your Nanna, *beta*. Go home." (Amma said: never get into a stranger\'s car.)', 'Uncle shakes his head: "Small boys don\'t take lifts. Walk home, *beta*."'];
  const NO_ROOM = ['"Three on one scooter? Pochaiah would LOVE that. *Nakko*, *beta*."', 'Aunty on the back gives you a look. No room, *beta*.'];
  /**
   * What ACTION does next to vehicle v (player on foot). kind: 'drive' | 'borrow' | 'hire' | 'nakko'
   * | 'pillion' | 'passenger' | 'bus' | 'fare' | 'refuse'.
   */
  function offerFor(v) {
    const T = v.T, name = v.label && !T.label ? v.label : T.short;
    const nk = nakkoFor(v);
    if (nk) return { kind: 'nakko', label: 'Nakko' };
    if (v.hire && !v.hired) return { kind: 'hire', label: T.mode === 'boat' ? 'Hire boat' : 'Hire cycle' };
    const drv = npcDriven(v);
    // seats and fares only while the vehicle is (nearly) stopped: no hopping onto passing traffic, and no
    // labels flickering as it goes by. A bus pulling away can still be caught (footboard, systems §3.6).
    const sp = Math.abs(v.speed || 0);
    const seat = (k, label) => (sp < TUNE.seatMaxSpeed ? { kind: k, label } : null);
    const full = T.cls === 'bike' && v.pillion && v.pillion !== N.player;
    if (canDrive(v)) {
      // a working traffic auto (or taxi) plying for hire: ride it as a passenger, the fare via shops.js
      if (drv && TUNE.fareAutos && (T.cls === 'auto' || v.taxi) && (v.trafficOwned || v.tr) && N.shops && typeof N.shops.rideVehicle === 'function') return seat('fare', 'Ride ' + name + ' (fare)');
      if (v.noEnter) return drv ? (full ? seat('nolift', 'Ask for a lift') : seat(T.cls === 'bike' ? 'pillion' : 'passenger', T.cls === 'bike' ? 'Sit pillion' : 'Ride as passenger')) : null;
      return { kind: drv ? 'borrow' : 'drive', label: (drv ? 'Borrow ' : T.verb + ' ') + name };
    }
    // he may not drive it: a seat with the grown-up at the controls, or a refusal
    if (drv && T.mode !== 'boat') {
      if (full) return seat('nolift', 'Ask for a lift');
      if (v.rideOk || v.npcKey) return seat(T.cls === 'bike' ? 'pillion' : 'passenger', T.cls === 'bike' ? 'Sit pillion' : 'Ride as passenger');
      // a cycle-rickshaw plying for hire: a fare ride, the rickshaw-wala pedals (shops.js)
      if (T.fare && N.shops && typeof N.shops.rideVehicle === 'function') return seat('fare', 'Ride ' + name + ' (fare)');
      if (T.cls === 'heavy' && /bus/.test(T.id)) return sp < TUNE.busMaxBoard ? { kind: 'bus', label: 'Board bus ' + (busFare() ? '₹' + (busFare() / 100) : '(ticket punch)') } : null;
      if (v.taxi && N.shops && typeof N.shops.rideVehicle === 'function') return seat('fare', 'Ride taxi (fare)');
      if (T.cls === 'bike') return seat('pillion', 'Ask for a lift');
      return seat('nolift', 'Ask for a lift');
    }
    if (drv) return null; // the boatman's boat on the lake
    return { kind: 'refuse', label: 'Too small to drive' };
  }
  /** Bus fare in paise: ₹3, free with Ticket Thatha's punch (systems §2.7). */
  function busFare() { const inv = N.player && N.player.inventory; return inv && typeof inv.has === 'function' && inv.has('ticket_punch') ? 0 : TUNE.busFare; }

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
    // the player aboard (driving or riding along) gets down first: never left riding a removed vehicle
    if (N.player && N.player.vehicle === v) exit(N.player, true);
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
      else if (p.kind === 'drop') p.z = 0.5 + Math.sin(Math.min(1, p.t / p.life) * Math.PI) * 5; // a splash arcs up and falls
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
      if (p.kind === 'drop') { // muddy rain water out of a pothole
        ctx.globalAlpha = 0.85 * (1 - f * 0.6);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(X, Y, Math.max(0.6, p.r * (1 - f * 0.4) * k), 0, TAU); ctx.fill();
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
    if (night < 0.05) return;
    // a dynamo lamp (Hero roadsters) glows only while the wheel turns, brighter with speed; the
    // player's own needs the ladder's dynamo unlock (20 finds: Nanna fits it)
    const sp = Math.abs(v.speed || 0);
    const dyn = !T.lights && T.dynamo && !!v.driver && sp > 10 && (v.driver !== N.player || unlocked('dynamo', 20));
    if (!(T.lights || dyn)) return;
    const on = !!v.driver || v.controller || v.lightsOn;
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    const fx = v.x + c * T.w / 2, fy = v.y + s * T.w / 2;
    if (on) {
      const reach = (T.cls === 'bike' ? 0.75 : T.cls === 'heavy' ? 1.25 : 1) * (dyn ? 0.85 : 1);
      const k = dyn ? U.clamp(sp / 80, 0.3, 1) : 1;
      R.lights.push({ x: fx + c * 16 * reach, y: fy + s * 16 * reach, r: 26 * reach, color: dyn ? '#ffe6a8' : '#fff2c8', intensity: 0.85 * k, glow: false });
      R.lights.push({ x: fx + c * 40 * reach, y: fy + s * 40 * reach, r: 38 * reach, color: dyn ? '#ffe6a8' : '#fff2c8', intensity: 0.75 * k });
      // lamp bulbs
      const hw = T.cls === 'bike' || T.cls === 'auto' ? 0 : T.d / 2 - 2.6;
      const h = T.cls === 'bike' ? (dyn ? 5.5 : 7) : T.cls === 'heavy' ? 5 : 5;
      if (hw) { glows.push(fx - s * hw, fy + c * hw, h, 5, 0, fx + s * hw, fy - c * hw, h, 5, 0); }
      else glows.push(fx, fy, T.cls === 'auto' ? 4 : h, dyn ? 3.4 * k + 0.8 : 4.5, 0);
    }
    // tail lamps (also when parked-but-occupied); pedal cycles only have a red reflector
    if (on && T.cls !== 'boat' && !T.pedal) {
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
  function begin(v) {
    fc = Math.cos(v.angle); fs = Math.sin(v.angle); fx0 = v.x; fy0 = v.y; fz = v.z || 0;
    // A2 pothole jolt: the body drops, bounces and wiggles (decays with v.jolt)
    const j = v.jolt;
    if (j > 0) {
      const ph = (1 - j) * Math.PI * 3.2, big = v.T.cls === 'bike' ? 1 : 0.7;
      fz += -Math.sin(ph) * j * 1.6 * big;
      fy0 += Math.sin(ph) * j * 0.9 * big;
      const sh = Math.sin(ph * 1.7) * j * 0.6 * big * (v.joltSide || 1);
      fx0 += -fs * sh; fy0 += fc * sh;
    }
  }
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
    // A3: Chinnu at the wheel peeks out under the front of the canopy (drawn before it, so it covers him)
    if (v.driver && v.driver === N.player) kidInAuto(ctx, v);
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
  /** A3: Chinnu at the wheel of an auto: perched on a folded gunny sack, peeking over the handlebar. */
  function kidInAuto(ctx, v) {
    const look = riderLook(v), skin = (look && look.skin) || '#a0683f', hair = (look && look.hair) || '#1a1412';
    const steer = v.steerVis * 0.5, bob = Math.sin((v.age || 0) * 9) * Math.min(1, Math.abs(v.speed) / 60) * 0.25;
    top(ctx, 9.4, (g) => {
      g.translate(7.7 + bob, 0); g.rotate(steer);
      // knuckles on the far ends of the bar, poking out under the canopy
      g.fillStyle = skin; g.beginPath(); g.arc(-0.6, -3.5, 0.7, 0, TAU); g.arc(-0.6, 3.5, 0.7, 0, TAU); g.fill();
      // shoulders, then the head craning over the handlebar: hair, forehead, two eyes on the road
      g.fillStyle = (look && look.shirt) || '#e8e0d0'; g.beginPath(); g.ellipse(-1.6, 0, 1.4, 2.6, 0, 0, TAU); g.fill();
      g.fillStyle = hair; g.beginPath(); g.ellipse(-0.2, 0, 1.6, 1.8, 0, 0, TAU); g.fill();
      g.fillStyle = skin; g.beginPath(); g.ellipse(0.75, 0, 0.8, 1.25, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a1214'; g.fillRect(1.05, -0.7, 0.36, 0.34); g.fillRect(1.05, 0.36, 0.36, 0.34);
    });
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

  // ------------------------------------------- A3 cycles: Hero roadster, Hercules, BSA, kid, ladies
  // Stacked horizontal planes at their real heights (tyres 0.9, chain guard 2.3, mudguards 3.3, frame
  // 4.2, carrier 5.1, saddle 5.8, handlebar 6.3) so they shear apart in the pseudo-3D projection.
  const CYC = {
    hero: { R: 3.05, tyre: 0.95, guard: '#121214', tail: '#f2efe6', pin: '#c9a24a', chain: true, carrier: true, rods: true, bar: 'swept', saddle: 'sprung', lamp: 'dynamo', grips: '#e9e2cf', tube: 1.0, at: -1.7, gx: 3.0, gy: 2.9 },
    cycle: { R: 2.95, tyre: 0.95, guard: null, tail: '#f2efe6', pin: '#e8e2cc', chain: true, carrier: true, rods: true, bar: 'swept', saddle: 'sprung', lamp: null, grips: '#2a2426', tube: 1.0, at: -1.5, gx: 3.1, gy: 2.8 },
    hercules: { R: 2.9, tyre: 1.4, knobs: true, guard: null, tail: null, pin: null, chain: false, carrier: false, rods: false, bar: 'flat', saddle: 'sport', lamp: null, grips: '#1a1a1e', tube: 1.35, at: -1.3, gx: 3.6, gy: 3.1 },
    kid: { R: 2.35, tyre: 1.0, guard: null, tail: '#f2efe6', pin: null, chain: true, carrier: false, rods: false, bar: 'swept', saddle: 'sport', lamp: null, grips: '#d8402a', tube: 0.95, at: -1.0, gx: 2.6, gy: 2.4 },
  };
  const riderArms = { phase: 0, speed: 0, run: false };
  function drawCycle2(ctx, v) {
    const T = v.T, L = T.w;
    const st = CYC[T.bikeLook] || CYC.cycle;
    begin(v);
    const lie = !!v.fallen, riding = !!v.driver && !lie;
    const kid = riding && v.driver === N.player;
    const kainchi = kid && T.kainchi;
    const col = v.color, col2 = v.color2 || '#f4f2ea';
    const tilt = riding ? v.lean || 0 : lie ? 1.25 : 0.2;
    const ox = -Math.sin(tilt) * (lie ? 4.6 : 2.2) + (kainchi ? 0.35 : 0);
    const top = lie ? (c2, h, fn) => topRaw(c2, Math.min(h, 1.6) * 0.6 + 0.2, fn) : topRaw;
    const R = st.R, wb = L - R * 2 - 0.3, rx = -wb / 2, fxw = wb / 2;
    const steer = v.steerVis * 0.9, ph = v.wheelPhase || 0;
    const ladies = !!T.basket;
    // 1. tyres + rims + spoke glints (the front one turns with the bar)
    top(ctx, 0.9, (g) => {
      const tyre = (cx, rot) => {
        g.save(); g.translate(cx, 0); if (rot) g.rotate(rot);
        g.fillStyle = '#1b191b'; rrectPath(g, -R, -st.tyre / 2, R * 2, st.tyre, st.tyre / 2); g.fill();
        if (st.knobs) { g.fillStyle = '#0c0b0c'; for (let x = -R + 0.4; x < R - 0.2; x += 0.75) { g.fillRect(x, -st.tyre / 2 - 0.12, 0.38, 0.24); g.fillRect(x + 0.35, st.tyre / 2 - 0.12, 0.38, 0.24); } }
        g.fillStyle = '#b8b8b2'; g.fillRect(-R + 0.35, -0.12, R * 2 - 0.7, 0.24); // rim seen edge-on
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let k = 0; k < 2; k++) { const sx = Math.cos(ph * 1.7 + k * Math.PI) * (R - 0.6); g.fillRect(sx - 0.2, -0.22, 0.4, 0.44); }
        g.fillStyle = '#d8d8d2'; g.fillRect(-0.35, -0.5, 0.7, 1.0); // hub
        g.restore();
      };
      tyre(rx, 0); tyre(fxw, steer);
    });
    // 2. drive side: chainwheel, chain guard (roadsters), cranks + pedals turning with the wheels
    const bb = rx * 0.08 + 0.2;
    top(ctx, 2.2, (g) => {
      g.translate(0, ox * 0.35);
      const crank = ph * 0.62, pc = Math.cos(crank) * 1.25;
      g.fillStyle = '#2a2a2c';
      g.fillRect(bb + pc - 0.6, -2.75, 1.2, 0.85); g.fillRect(bb - pc - 0.6, 1.9, 1.2, 0.85); // pedals
      g.fillStyle = '#9a9a96'; g.fillRect(bb + pc * 0.5 - 0.2, -1.95, 0.4, 1.0); g.fillRect(bb - pc * 0.5 - 0.2, 0.95, 0.4, 1.0); // cranks
      if (st.chain) {
        // the long teardrop chain guard on the right side, gold pinstriped
        g.fillStyle = T.bikeLook === 'kid' ? col : '#141416';
        g.beginPath(); g.moveTo(bb + 1.6, 1.0); g.quadraticCurveTo(bb + 1.4, 2.0, bb - 0.2, 2.05); g.lineTo(rx + 0.3, 1.6); g.quadraticCurveTo(rx - 0.4, 1.3, rx + 0.3, 1.0); g.closePath(); g.fill();
        if (st.pin) { g.strokeStyle = st.pin; g.lineWidth = 0.16; g.beginPath(); g.moveTo(bb + 1.1, 1.75); g.lineTo(rx + 0.6, 1.45); g.stroke(); }
      } else {
        g.fillStyle = '#c8c8c2'; g.beginPath(); g.arc(bb, 1.3, 1.25, 0, TAU); g.fill();       // chainring
        g.fillStyle = '#6a6a66'; g.beginPath(); g.arc(bb, 1.3, 0.55, 0, TAU); g.fill();
        g.strokeStyle = '#4a4a48'; g.lineWidth = 0.22; g.beginPath(); g.moveTo(bb, 0.55 + 1.3 - 0.75); g.lineTo(rx, 1.0); g.moveTo(bb, 2.0); g.lineTo(rx, 1.6); g.stroke(); // chain
        if (T.gears) { g.fillStyle = '#d8d8d2'; g.beginPath(); g.arc(rx, 1.3, 0.9, 0, TAU); g.fill(); g.fillStyle = '#8a8a86'; for (let r = 0.75; r > 0.2; r -= 0.18) { g.beginPath(); g.arc(rx, 1.3, r, 0, TAU); g.stroke(); } g.fillStyle = '#2a2a2c'; g.fillRect(rx - 1.1, 1.6, 1.0, 0.5); }
      }
    });
    // 3. mudguards (black on the Hero, with the white-painted tail and a red reflector) / the
    //    ladies' dress guard
    if (st.guard || st.tail || ladies) {
      top(ctx, 3.3, (g) => {
        g.translate(0, ox * 0.55);
        const gc = st.guard || col;
        g.fillStyle = gc;
        rrectPath(g, rx - R + 0.2, -0.75, R * 1.75, 1.5, 0.7); g.fill();
        g.save(); g.translate(fxw, 0); g.rotate(steer); rrectPath(g, -R * 0.7, -0.72, R * 1.6, 1.44, 0.7); g.fill(); g.restore();
        if (st.tail) { g.fillStyle = st.tail; rrectPath(g, rx - R + 0.2, -0.75, 1.5, 1.5, 0.6); g.fill(); }
        g.fillStyle = '#d0281e'; g.fillRect(rx - R + 0.3, -0.35, 0.55, 0.7); // reflector
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(rx - R + 1.8, -0.55, R * 1.2, 0.3);
        if (ladies) { g.strokeStyle = 'rgba(240,236,220,0.75)'; g.lineWidth = 0.18; g.beginPath(); for (let k = 0; k < 5; k++) { g.moveTo(rx + 0.4 - k * 0.5, -0.7); g.lineTo(rx - 0.2 - k * 0.45, -2.0); } g.stroke(); }
      });
    }
    // 4. frame: head tube -> seat cluster (top + down tube), stays to the rear hub, fork, pinstripe,
    //    rod brakes along the frame (roadsters)
    const seatX = st.at + 0.15, head = fxw - 1.2;
    top(ctx, 4.2, (g) => {
      g.translate(0, ox * 0.75);
      g.lineCap = 'round';
      g.strokeStyle = U.shade(col, 0.72); g.lineWidth = st.tube * 0.8;
      g.beginPath(); g.moveTo(seatX, 0); g.lineTo(rx, -0.55); g.moveTo(seatX, 0); g.lineTo(rx, 0.55); g.stroke(); // stays
      g.strokeStyle = col; g.lineWidth = st.tube;
      g.beginPath();
      if (ladies) { g.moveTo(head, 0); g.quadraticCurveTo(bb + 0.5, 0.25, seatX, 0); }
      else { g.moveTo(head, 0); g.lineTo(seatX, 0); }
      g.stroke();
      // fork legs to the front hub (turn with the bar)
      g.save(); g.translate(head, 0); g.rotate(steer * 0.6);
      g.strokeStyle = st.rods ? '#cfcfc8' : U.shade(col, 0.85); g.lineWidth = 0.55;
      g.beginPath(); g.moveTo(0, -0.45); g.lineTo(fxw - head, -0.6); g.moveTo(0, 0.45); g.lineTo(fxw - head, 0.6); g.stroke();
      g.restore();
      // highlight along the top of the tube
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.22;
      g.beginPath(); g.moveTo(head - 0.3, -st.tube * 0.25); g.lineTo(seatX + 0.5, -st.tube * 0.25); g.stroke();
      if (st.pin) { g.strokeStyle = st.pin; g.lineWidth = 0.14; g.beginPath(); g.moveTo(head - 0.4, st.tube * 0.22); g.lineTo(seatX + 0.6, st.tube * 0.22); g.stroke(); }
      if (T.bikeLook === 'hercules') { // the sporty decal band + a second contrasting stripe
        g.strokeStyle = col2; g.lineWidth = st.tube * 0.55; g.beginPath(); g.moveTo(head - 1.0, 0); g.lineTo(head - 3.0, 0); g.stroke();
        g.strokeStyle = '#1a1a1e'; g.lineWidth = 0.18; g.beginPath(); g.moveTo(head - 3.3, -0.4); g.lineTo(head - 3.3, 0.4); g.stroke();
      }
      if (st.rods) { // rod brakes: thin silver rods beside the top tube
        g.strokeStyle = '#d4d4ce'; g.lineWidth = 0.2;
        g.beginPath(); g.moveTo(head + 0.4, -0.75); g.lineTo(rx + 0.8, -0.85); g.moveTo(head + 0.4, 0.75); g.lineTo(head + 1.6, 0.8); g.stroke();
      }
      if (T.dynamo) { g.fillStyle = '#c8c8c2'; g.fillRect(rx + 0.6, 0.85, 1.1, 0.6); g.fillStyle = '#2a2a2c'; g.fillRect(rx + 1.5, 0.95, 0.3, 0.4); } // dynamo on the rear tyre
    });
    // 5. rear carrier (silver rack over the rear wheel; NPC riders sometimes carry a tiffin or a bundle)
    if (st.carrier) {
      top(ctx, 5.1, (g) => {
        g.translate(0, ox * 0.85);
        const x0 = rx - R + 0.6, x1 = seatX - 0.9;
        g.fillStyle = '#a2a29c';
        g.fillRect(x0, -1.45, x1 - x0, 0.3); g.fillRect(x0, 1.15, x1 - x0, 0.3); g.fillRect(x0, -0.15, x1 - x0, 0.3);
        g.fillRect(x0, -1.45, 0.3, 2.9); g.fillRect(x0 + (x1 - x0) * 0.55, -1.45, 0.28, 2.9);
        g.fillStyle = '#6e6e6a'; g.fillRect(x1 - 0.6, -1.2, 0.5, 2.4); // spring clamp
        if (!kid && riding && v.seed % 5 === 1) { g.fillStyle = '#d8d8d4'; g.beginPath(); g.arc((x0 + x1) / 2, 0, 1.25, 0, TAU); g.fill(); g.fillStyle = '#9a9a96'; g.fillRect((x0 + x1) / 2 - 1.3, -0.15, 2.6, 0.3); } // steel tiffin
        else if (!kid && riding && v.seed % 5 === 3) { g.fillStyle = '#c8b48a'; rrectPath(g, x0 - 0.2, -1.7, x1 - x0 + 0.2, 3.4, 0.8); g.fill(); g.strokeStyle = '#7a5a3a'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(x0 + 0.8, -1.7); g.lineTo(x0 + 0.8, 1.7); g.stroke(); } // gunny bundle
      });
    }
    // 6. saddle: sprung leather (roadsters) or a narrow sport saddle
    if (!kainchi || !riding) top(ctx, 5.8, (g) => {
      g.translate(0, ox);
      const sx = st.at;
      if (st.saddle === 'sprung') {
        g.fillStyle = '#9a9a96'; g.beginPath(); g.arc(sx - 1.0, -0.8, 0.42, 0, TAU); g.arc(sx - 1.0, 0.8, 0.42, 0, TAU); g.fill();
        g.fillStyle = '#4a2c1e'; g.beginPath(); g.moveTo(sx + 1.5, 0); g.quadraticCurveTo(sx + 0.2, -1.0, sx - 1.2, -1.2); g.quadraticCurveTo(sx - 1.6, 0, sx - 1.2, 1.2); g.quadraticCurveTo(sx + 0.2, 1.0, sx + 1.5, 0); g.fill();
        g.fillStyle = 'rgba(255,230,200,0.22)'; g.beginPath(); g.ellipse(sx - 0.2, -0.35, 0.9, 0.3, 0, 0, TAU); g.fill();
      } else {
        g.fillStyle = '#18181a'; g.beginPath(); g.moveTo(sx + 1.6, 0); g.quadraticCurveTo(sx, -0.75, sx - 1.0, -0.85); g.lineTo(sx - 1.0, 0.85); g.quadraticCurveTo(sx, 0.75, sx + 1.6, 0); g.fill();
        g.fillStyle = col2; g.fillRect(sx - 0.9, -0.12, 2.2, 0.24);
      }
    });
    // 7. handlebar: swept-back roadster bar (white grips, chrome bell, rod levers, dynamo lamp) or
    //    the Hercules' flat bar (black foam grips, small bell, caliper levers)
    top(ctx, 6.3, (g) => {
      g.translate(fxw - 0.9, ox);
      g.rotate(steer);
      g.lineCap = 'round';
      if (st.bar === 'flat') {
        g.strokeStyle = '#2a2a2e'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(0.2, -st.gy); g.lineTo(0.2, st.gy); g.stroke();
        g.fillStyle = st.grips; g.fillRect(-0.35, -st.gy - 0.3, 1.1, 1.3); g.fillRect(-0.35, st.gy - 1.0, 1.1, 1.3);
        g.strokeStyle = '#3a3a3e'; g.lineWidth = 0.28; g.beginPath(); g.moveTo(0.3, -st.gy + 1.2); g.lineTo(1.1, -st.gy + 0.6); g.moveTo(0.3, st.gy - 1.2); g.lineTo(1.1, st.gy - 0.6); g.stroke();
        if (T.gears) { g.fillStyle = '#d8d8d2'; g.fillRect(-0.2, st.gy - 1.9, 0.6, 0.5); }
        g.fillStyle = '#c8c8c2'; g.beginPath(); g.arc(0.5, -st.gy + 1.7, 0.42, 0, TAU); g.fill(); // mini bell
        g.fillStyle = '#f4f2ec'; g.fillRect(0.9, -0.35, 0.5, 0.7); // front reflector
      } else {
        g.strokeStyle = '#d6d6d0'; g.lineWidth = 0.42;
        g.beginPath(); g.moveTo(0.6, 0); g.quadraticCurveTo(0.9, -st.gy, -0.9 - (3.0 - st.gx) * 0.3, -st.gy); g.moveTo(0.6, 0); g.quadraticCurveTo(0.9, st.gy, -0.9 - (3.0 - st.gx) * 0.3, st.gy); g.stroke();
        g.fillStyle = st.grips; g.fillRect(-1.7, -st.gy - 0.32, 1.1, 0.64); g.fillRect(-1.7, st.gy - 0.32, 1.1, 0.64);
        if (st.rods) { g.strokeStyle = '#c8c8c2'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(-0.6, -st.gy + 0.6); g.lineTo(-1.4, -st.gy + 0.9); g.moveTo(-0.6, st.gy - 0.6); g.lineTo(-1.4, st.gy - 0.9); g.stroke(); }
        // THE bell (chrome dome on the left)
        g.fillStyle = '#c9c9c2'; g.beginPath(); g.arc(0.0, -1.55, 0.62, 0, TAU); g.fill();
        g.fillStyle = '#f8f8f2'; g.beginPath(); g.arc(-0.15, -1.7, 0.22, 0, TAU); g.fill();
        if (st.lamp) { // dynamo headlamp on its bracket
          g.fillStyle = '#9a9a96'; g.fillRect(0.6, -0.15, 0.7, 0.3);
          g.fillStyle = '#d8d8d2'; g.beginPath(); g.arc(1.55, 0, 0.72, 0, TAU); g.fill();
          g.fillStyle = (N.render.night || 0) > 0.2 && Math.abs(v.speed) > 10 ? '#fff4c0' : '#efe8cc'; g.beginPath(); g.arc(1.75, 0, 0.42, 0, TAU); g.fill();
        }
      }
      if (ladies) { g.fillStyle = '#a07838'; g.fillRect(0.9, -1.9, 2.8, 3.8); g.strokeStyle = '#6a4a20'; g.lineWidth = 0.35; g.strokeRect(0.9, -1.9, 2.8, 3.8); g.beginPath(); g.moveTo(2.3, -1.9); g.lineTo(2.3, 1.9); g.moveTo(0.9, 0); g.lineTo(3.7, 0); g.stroke(); }
      if (T.id === 'chinnu_cycle' && unlocked('streamers', 75)) { g.strokeStyle = '#ffd84a'; g.lineWidth = 0.5; g.beginPath(); for (const y of [-st.gy, st.gy]) { g.moveTo(-1.4, y); g.lineTo(-3.8, y * 1.25); g.moveTo(-1.4, y); g.lineTo(-4.2, y * 0.9); } g.stroke(); }
    });
    if (!riding) return;
    // the rider: seated, or (a kid on a big Hero roadster) standing *kainchi* style, one leg through the frame
    const look = riderLook(v);
    riderArms.phase = ph * 0.6; riderArms.speed = Math.min(0.7, Math.abs(v.speed) / 60); riderArms.run = false;
    const stemX = fxw - 0.9, gxl = st.bar === 'flat' ? 0.15 : -1.15;
    if (kainchi) {
      const sway = Math.sin(ph * 0.62) * 0.35;
      const ry = -2.6 + ox + sway, rx0 = bb + 0.6;
      armsTo(ctx, look, 7.4, rx0 + 0.6, ry, stemX, gxl, st.gy, steer, ox);
      top(ctx, 7.6, (g) => { g.translate(rx0, ry); g.rotate(0.22); N.people.draw(g, look, riderArms); });
    } else {
      const ry = ox * 1.2;
      armsTo(ctx, look, 8.0, st.at + 1.0, ry, stemX, gxl, st.gy, steer, ox);
      top(ctx, 8.4, (g) => { g.translate(st.at, ry); N.people.draw(g, look, riderArms); });
    }
    if (v.pillion) drawPillion(ctx, v, ox, rx - 0.6);
  }
  /**
   * Forearms from the rider's shoulders (sx, sy ± shoulder) to the grips: the bar's stem sits at
   * (stemX, oy), grips at (gxl, ±gy) in the bar's own frame, rotated by the steering.
   */
  function armsTo(ctx, look, h, sx, sy, stemX, gxl, gy, steer, oy) {
    const kidish = !!look && (look.kind === 'kid' || look.kind === 'student');
    const bare = !!look && (look.kind === 'saree' || look.kind === 'aunty' || look.kind === 'uncle');
    const skin = (look && look.skin) || '#a0683f';
    const sleeve = bare ? skin : (look && look.shirt) || '#e8e0d0';
    const sh = kidish ? 3.0 : 3.6;
    const c = Math.cos(steer), s = Math.sin(steer);
    top(ctx, h, (g) => {
      g.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        const ly = side * gy;
        const px = stemX + gxl * c - ly * s, py = oy + gxl * s + ly * c;
        const ax = sx, ay = sy + side * sh;
        const mx = ax + (px - ax) * 0.45, my = ay + (py - ay) * 0.45;
        g.strokeStyle = sleeve; g.lineWidth = kidish ? 1.05 : 1.25;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(mx, my); g.stroke();
        g.strokeStyle = skin; g.lineWidth = kidish ? 0.85 : 1.0;
        g.beginPath(); g.moveTo(mx, my); g.lineTo(px, py); g.stroke();
        g.fillStyle = skin; g.beginPath(); g.arc(px, py, kidish ? 0.55 : 0.65, 0, TAU); g.fill();
      }
    });
  }
  function rrectPath(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
    g.closePath();
  }

  // ------------------------------------------------------------ A3: the Scooty
  // A small step-through scooter: two little wheels, a bright rear body with a chrome grab rail,
  // a ribbed floorboard, the curved front apron, a round headlamp nacelle and two mirrors on stalks.
  const SC_BODY = [-1.0, -2.0, -1.0, 2.0, -3.4, 2.35, -5.8, 2.25, -7.0, 1.5, -7.35, 0, -7.0, -1.5, -5.8, -2.25, -3.4, -2.35];
  const SC_SEAT = [-1.4, -1.2, -1.4, 1.2, -3.4, 1.45, -5.4, 1.35, -6.15, 0.85, -6.15, -0.85, -5.4, -1.35, -3.4, -1.45];
  const SC_APRON = [5.3, -0.9, 5.3, 0.9, 4.9, 2.0, 4.2, 2.8, 3.45, 2.65, 3.55, 1.6, 3.75, 0, 3.55, -1.6, 3.45, -2.65, 4.2, -2.8, 4.9, -2.0];
  const SC_FENDER = [7.0, -0.85, 7.0, 0.85, 4.8, 1.05, 4.8, -1.05];
  function drawScooty(ctx, v) {
    const T = v.T;
    begin(v);
    const lie = !!v.fallen, riding = !!v.driver && !lie;
    const kid = riding && v.driver === N.player;
    const col = v.color, col2 = v.color2 || '#f4f0e8', dark = U.shade(col, 0.62), hi = U.shade(col, 1.2);
    const tilt = riding ? v.lean || 0 : lie ? 1.25 : 0.18;
    const ox = -Math.sin(tilt) * (lie ? 4.4 : 2.0);
    if (lie) fz -= 2.2;
    const steer = v.steerVis * 0.9;
    const rw = -4.9, fw = 5.2;
    // wheels: small fat tyres with alloy hubs
    topRaw(ctx, 0.8, (g) => {
      const wheel = (cx, rot) => {
        g.save(); g.translate(cx, 0); if (rot) g.rotate(rot);
        g.fillStyle = '#18171a'; rrectPath(g, -1.95, -0.8, 3.9, 1.6, 0.8); g.fill();
        g.fillStyle = '#b8bcc0'; g.fillRect(-1.0, -0.22, 2.0, 0.44);
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(Math.cos((v.wheelPhase || 0) * 2.4) * 0.7 - 0.15, -0.3, 0.3, 0.6);
        g.restore();
      };
      wheel(rw, 0); wheel(fw, steer);
    });
    const shift = (pts, k) => { const o = []; for (let i = 0; i < pts.length; i += 2) o.push(pts[i], pts[i + 1] + ox * k); return o; };
    // front fender (turns with the bar)
    topRaw(ctx, 2.4, (g) => {
      g.translate(fw - 0.4, ox * 0.35); g.rotate(steer); g.translate(-(fw - 0.4), 0);
      g.fillStyle = col; g.beginPath(); for (let i = 0; i < SC_FENDER.length; i += 2) { if (i) g.lineTo(SC_FENDER[i], SC_FENDER[i + 1]); else g.moveTo(SC_FENDER[i], SC_FENDER[i + 1]); } g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(5.0, -0.25, 1.7, 0.4);
    });
    // floorboard: dark rubber mat with ribs between the apron and the seat
    topRaw(ctx, 2.3, (g) => {
      g.translate(0, ox * 0.4);
      g.fillStyle = col; rrectPath(g, -1.4, -2.1, 5.3, 4.2, 0.9); g.fill();
      g.fillStyle = '#34343a'; rrectPath(g, -1.0, -1.6, 4.5, 3.2, 0.6); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)'; for (let x = -0.6; x < 3.3; x += 0.75) g.fillRect(x, -1.35, 0.3, 2.7);
    });
    // rear body: a solid, sun-shaded shell with a contrasting side stripe and a chrome strip
    prism(ctx, shift(SC_BODY, 0.5), 1.6, 5.0, col, col, (c2, i, ax, ay, bx, by, nx, ny) => {
      band(c2, ax, ay, bx, by, 0, 1, 2.6, 3.2, col2, nx, ny);
      band(c2, ax, ay, bx, by, 0, 1, 1.6, 2.0, dark, nx, ny);
      if (i === 5 || i === 4 || i === 6) band(c2, ax, ay, bx, by, 0.25, 0.75, 3.4, 4.3, '#c82a20'); // tail lamp
    }, (g) => {
      g.translate(0, ox * 0.5);
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(-4.4, -1.6, 2.2, 0.45, 0, 0, TAU); g.fill();
      g.fillStyle = '#f2d23a'; g.fillRect(-7.15, -1.0, 0.5, 2.0); // number plate edge
    });
    // the seat on top, with a chrome grab rail round the back
    prism(ctx, shift(SC_SEAT, 0.62), 5.0, 6.1, '#1c1a1e', '#26232a', null, (g) => {
      g.translate(0, ox * 0.62);
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(-1.4, 0); g.lineTo(-6.0, 0); g.stroke();
      g.strokeStyle = '#cfd2d4'; g.lineWidth = 0.38; g.beginPath(); g.moveTo(-5.4, -2.05); g.quadraticCurveTo(-7.4, -2.0, -7.0, 0); g.quadraticCurveTo(-7.4, 2.0, -5.4, 2.05); g.stroke();
    });
    // the curved front apron (leg shield)
    prism(ctx, shift(SC_APRON, 0.55), 2.0, 6.5, (i) => (i < 2 || i > 7 ? hi : col), col, (c2, i, ax, ay, bx, by, nx, ny) => {
      if (i >= 3 && i <= 6) band(c2, ax, ay, bx, by, 0, 1, 2.0, 2.5, dark, nx, ny);
    }, (g) => {
      g.translate(0, ox * 0.55);
      g.fillStyle = 'rgba(255,255,255,0.32)'; g.beginPath(); g.moveTo(5.0, -0.7); g.quadraticCurveTo(4.7, -2.0, 4.1, -2.5); g.lineTo(3.9, -2.2); g.quadraticCurveTo(4.4, -1.6, 4.6, -0.6); g.closePath(); g.fill();
      g.fillStyle = col2; g.fillRect(4.6, -0.3, 0.7, 0.6);
    });
    // handlebar + headlamp nacelle + mirrors (turn with the steering)
    topRaw(ctx, 7.2, (g) => {
      g.translate(4.4, ox * 0.9); g.rotate(steer);
      g.lineCap = 'round';
      g.strokeStyle = '#2a2a2e'; g.lineWidth = 0.55; g.beginPath(); g.moveTo(-0.2, -2.7); g.lineTo(-0.2, 2.7); g.stroke();
      g.fillStyle = '#16161a'; g.fillRect(-0.7, -3.0, 1.1, 1.0); g.fillRect(-0.7, 2.0, 1.1, 1.0); // grips
      g.fillStyle = col; rrectPath(g, -0.9, -1.25, 2.3, 2.5, 1.0); g.fill();                     // nacelle
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-0.6, -0.9, 1.4, 0.35);
      g.fillStyle = '#e9edf0'; g.beginPath(); g.arc(1.3, 0, 0.85, 0, TAU); g.fill();             // headlamp
      g.fillStyle = (N.render.night || 0) > 0.2 ? '#fff6c8' : '#cfdce4'; g.beginPath(); g.arc(1.4, 0, 0.55, 0, TAU); g.fill();
      g.fillStyle = '#ffb030'; g.fillRect(0.9, -1.6, 0.5, 0.4); g.fillRect(0.9, 1.2, 0.5, 0.4);  // indicators
    });
    topRaw(ctx, 8.6, (g) => {
      g.translate(4.4, ox); g.rotate(steer);
      g.strokeStyle = '#3a3a3e'; g.lineWidth = 0.22; g.beginPath(); g.moveTo(-0.3, -1.7); g.lineTo(-0.9, -2.5); g.moveTo(-0.3, 1.7); g.lineTo(-0.9, 2.5); g.stroke();
      for (const y of [-2.75, 2.75]) { g.fillStyle = '#c8ccd0'; g.beginPath(); g.arc(-1.0, y, 0.62, 0, TAU); g.fill(); g.fillStyle = '#7fa6c0'; g.beginPath(); g.arc(-1.0, y, 0.4, 0, TAU); g.fill(); }
    });
    if (!riding) return;
    const look = riderLook(v);
    riderArms.phase = 0; riderArms.speed = 0; riderArms.run = false;
    if (kid) {
      // perched right on the front of the seat, arms straight out, toes stretching for the floorboard
      const ry = ox * 1.1, sx = -1.9;
      topRaw(ctx, 4.0, (g) => {
        g.lineCap = 'round'; g.strokeStyle = (look && look.skin) || '#a0683f'; g.lineWidth = 0.75;
        g.beginPath(); g.moveTo(sx + 0.6, ry - 0.9); g.lineTo(1.9, ry * 0.5 - 1.25); g.moveTo(sx + 0.6, ry + 0.9); g.lineTo(1.9, ry * 0.5 + 1.25); g.stroke();
        g.fillStyle = '#2a2220'; g.beginPath(); g.ellipse(2.3, ry * 0.5 - 1.25, 0.55, 0.38, 0, 0, TAU); g.ellipse(2.3, ry * 0.5 + 1.25, 0.55, 0.38, 0, 0, TAU); g.fill();
      });
      armsTo(ctx, look, 8.2, sx + 1.0, ry, 4.4, -0.15, 2.5, steer, ox * 0.9);
      top(ctx, 8.6, (g) => { g.translate(sx, ry); N.people.draw(g, look, riderArms); });
    } else {
      const ry = ox * 1.15, sx = -3.0;
      armsTo(ctx, look, 8.0, sx + 1.0, ry, 4.4, -0.15, 2.5, steer, ox * 0.9);
      top(ctx, 8.4, (g) => { g.translate(sx, ry); N.people.draw(g, look, riderArms); });
    }
    if (v.pillion) drawPillion(ctx, v, ox, -5.6);
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
    // A2: N.world.potholeAt(x, y) -> {depth, r} | null (world.js). Missing: potholes do nothing.
    potAt = N.world && typeof N.world.potholeAt === 'function' ? N.world.potholeAt : null;
    for (let i = list.length - 1; i >= 0; i--) if (!list[i].alive) { if (list[i] === p.vehicle) exit(p, true); list.splice(i, 1); }
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.bumpT > 0) v.bumpT -= dt;
      if (v.doorT > 0) v.doorT -= dt;
      if (v.jolt > 0) v.jolt = Math.max(0, v.jolt - dt * TUNE.joltDecay);
      if (v.potCD > 0) v.potCD -= dt;
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
      if (v.passenger === p && p.vehicle === v) passengerTick(p, v, dt);
      // sleep parked vehicles so hundreds of them cost nothing
      if (!v.driver && !v.controller && Math.abs(v.vx) + Math.abs(v.vy) < 0.6 && Math.abs(v.av) < 0.03) {
        v.sleepT += dt;
        if (v.sleepT > 0.4 && !v.asleep) { v.asleep = true; v.vx = v.vy = v.av = 0; v.speed = 0; v.skL = v.skR = null; }
      } else { v.sleepT = 0; v.asleep = false; }
      if (!v.asleep) { simulate(v, dt); if (potAt) potholes(v, dt, p); }
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
    // ACTION offers: get in / get out (A3: drive, borrow, a seat behind a grown-up, or a refusal)
    if (!pv && p.mode !== 'busy' && !p.controlsLocked) {
      const n = bestOffer(p);
      if (n) {
        const o = n.o;
        offerSpec.label = o.label; offerSpec.kind = o.kind; offerSpec.use = useOffer;
        offerSpec.priority = SHY_KINDS[o.kind] ? TUNE.noPriority : 0;
        offerSpec.dist = n.d; offerSpec.target = n.v;
        N.interact.offer(offerSpec);
      }
      // a bike lying on its side after a fall: pick it up (systems §2.6)
      const fb = nearestFallen(p);
      if (fb) { pickSpec.label = 'Pick up ' + fb.v.T.short; pickSpec.dist = fb.d; pickSpec.target = fb.v; N.interact.offer(pickSpec); }
    } else if (pv && p.passenger) {
      // riding along: "Get off" (asks the driver to stop first when moving); none while a story locks the seat
      if (!p.controlsLocked && !pv.lockPassenger) {
        exitSpec.label = Math.abs(pv.speed) > 20 && !pv.stopReq ? 'Ask to stop' : 'Get off';
        exitSpec.use = useExit; exitSpec.quiet = false;
        N.interact.offer(exitSpec);
      }
    } else if (pv && !pv.locked && !p.controlsLocked) {
      exitSpec.label = pv.T.cls === 'bike' ? 'Get off' : pv.T.cls === 'boat' ? 'Get out' : 'Get out';
      exitSpec.use = useExit;
      // riding along: "E Get off" in the middle of the screen the whole ride is clutter; it shows once
      // the vehicle slows to a walk (ACTION still gets off at any speed)
      exitSpec.quiet = Math.abs(pv.speed) > TUNE.exitQuietSpeed;
      N.interact.offer(exitSpec);
    }
    if (pv && pv.driver === p) kidAtWheelTick(pv, dt);
    if (!pv) footPotholes(p, dt);
    // horn (whistle on foot); held car horns repeat
    const I = N.input;
    if (pv && p.passenger) return;
    if (I.pressed('horn')) { emitHorn(pv); hornHold = 0; }
    else if (I.down('horn') && pv && pv.T.cls !== 'bike') { hornHold += dt; if (hornHold > 0.42) { hornHold = 0; emitHorn(pv); } }
  }
  function useEnter() { if (offerSpec.target) enter(N.player, offerSpec.target); }
  function useExit() { exit(N.player, false); }
  let noT = -1e9, noV = null;
  function useOffer() {
    const v = offerSpec.target; if (!v || !v.alive) return;
    const o = offerFor(v); if (!o) return;
    const p = N.player;
    // mashing ACTION next to a car he can't drive: one line per 1.5 s, not a queue of them
    if (NO_KINDS[o.kind]) { if (noV === v && N.time.real - noT < TUNE.noCD) return; noV = v; noT = N.time.real; }
    switch (o.kind) {
      case 'nakko': useNakko(); return;
      case 'hire': useHire(); return;
      case 'drive': case 'borrow': enter(p, v); return;
      case 'fare': if (!N.shops.rideVehicle(v)) toast('"*Nakko*, not going that side."', 2200); return;
      case 'bus': boardBus(p, v); return;
      case 'pillion': case 'passenger': {
        if (ride(p, v, { as: o.kind })) {
          const named = v.driver && v.driver.npcId;
          if (!named && !v.rideOk) toast(lineOf(LIFT_LINES, v.seed + (N.time.frame | 0)), 2600);
        }
        return;
      }
      case 'nolift': refuseToast(v, lineOf(v.T.cls === 'bike' && v.pillion ? NO_ROOM : v.T.cls === 'heavy' ? ['The lorry-wala laughs: "Next time, *chhotu*! Horn OK Please!"'] : NO_CAR_LIFT, v.seed + (N.time.frame | 0))); return;
      default: refuseToast(v, refusalFor(v));
    }
  }
  function toast(t, ms, key) { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2400, key ? { key } : undefined); }
  function refuseToast(v, line) {
    toast(line, 3000, 'vehicles:no'); // keyed: a new refusal replaces the last one instead of queueing
    N.emit('vehicle:refused', { vehicle: v, type: v.type, line });
  }
  function useNakko() {
    const v = offerSpec.target; if (!v) return;
    const line = nakkoFor(v);
    if (line) toast(line, 2600, 'vehicles:no');
    if (N.audio && N.audio.horn && v.T.cls !== 'bike') { try { N.audio.horn(v, { x: v.x, y: v.y }); } catch (e) { /* ignore */ } }
  }
  /** A rental cycle / jetty boat: the stall's menu decides (N.shops); without shops it is just ridden. */
  function useHire() {
    const v = offerSpec.target; if (!v) return;
    if (N.shops && typeof N.shops.open === 'function' && N.shops.open(v.hire, { vehicle: v })) return;
    v.hired = true; enter(N.player, v);
  }
  // picking up a fallen bike gets him back on it, but only one he may drive (A3: a Chetak he fell off
  // after allowHeavy / debug is just stood back up on its stand)
  const pickSpec = { label: 'Pick up cycle', priority: 1, dist: 0, target: null, use: () => {
    const v = pickSpec.target;
    if (!v || !v.fallen) return;
    v.fallen = null; N.emit('vehicle:pickup', { vehicle: v });
    if (!v.driver && canDrive(v)) enter(N.player, v, { quiet: true });
  } };
  function nearestFallen(p) {
    let best = null, bd = 18;
    for (const v of list) {
      if (!v.fallen || v.fallen.t < TUNE.pickupAfter || !v.alive || v.driver) continue;
      const d = distTo(v, p.x, p.y);
      if (d < bd) { bd = d; best = v; }
    }
    return best ? { v: best, d: bd } : null;
  }
  // the player went DHADAAM (entities.js player.fall): the bike stays down until picked up. Thrown off
  // the back of a pillion ride, the grown-up rides on (he stops, see passengerExit): the bike never lies
  // down with its rider still on it, and the kid can't "pick up" somebody's Chetak and ride away on it.
  N.on('player:fall', (d) => {
    const v = d && d.vehicle;
    if (!v || !v.T || v.T.cls !== 'bike' || !v.alive) return;
    if (v.driver && v.driver !== N.player) { v.stopReq = 0; return; }
    v.fallen = { t: 0, angle: v.angle };
    v.vx *= 0.3; v.vy *= 0.3; v.av = 0;
    N.emit('vehicle:fallen', { vehicle: v });
  });
  /** Punctures off-road for the cycle the player rides (systems §5.6). Potholes: see potholes(). */
  function bikeHazards(v, dt) {
    const T = v.T, S = N.SURF;
    const surf = N.world.surfaceAt(v.x, v.y), sp = Math.abs(v.speed);
    const dirt = surf === S.GROUND || surf === S.SAND;
    if (T.pedal && !v.flat && dirt && sp > 25 && Math.random() < dt * TUNE.punctureRate * (T.punctureMul || 1)) V.puncture(v);
  }

  /* ============================================================ potholes (A2) */
  let potAt = null;
  const reducedMotion = () => !!(document.body && document.body.classList.contains('reduced-motion'));
  function potQuery(x, y) {
    let ph = null;
    try { ph = potAt(x, y); } catch (e) { N.err('world.potholeAt', e); potAt = null; return null; }
    return ph && typeof ph === 'object' ? ph : null;
  }
  /** Pothole severity 0.15..1.5 from {depth}: depth <= 1 reads as a 0..1 severity, larger as world units (/3). */
  function potSeverity(ph) {
    const d = +ph.depth;
    if (!isFinite(d) || d <= 0) return 0.5;
    return d <= 1 ? U.clamp(d, 0.15, 1) : U.clamp(d / 3, 0.15, 1.5);
  }
  function potWet(ph) {
    if (ph.wet != null) return !!ph.wet;
    if (ph.water != null) return !!ph.water;
    const f = N.flags || {};
    return raining() || !!(f.wet_roads || f.puddles || f.monsoon_wet);
  }
  /** A pothole's identity: world.js id, else its centre, else none (then contact continuity decides). */
  function potKey(ph) {
    if (ph.id != null) return 'i' + ph.id;
    const x = +ph.x, y = +ph.y;
    return isFinite(x) && isFinite(y) ? Math.round(x * 2) + ':' + Math.round(y * 2) : null;
  }
  /**
   * One wheel: sweep its contact point from where it was last step to where it is now (every 2 u, so a
   * small pothole is never jumped at speed) and report the first pothole it ENTERS. state = the key of
   * the pothole it is in (true when the pothole has no key) or null; continuous contact never re-hits.
   */
  const wheelHit = { ph: null, x: 0, y: 0 };
  function sweepWheel(x0, y0, x1, y1, state) {
    const L = Math.hypot(x1 - x0, y1 - y0);
    const n = !(L > 0) || L > 60 ? 1 : Math.min(6, Math.max(1, Math.ceil(L / TUNE.potholeStep)));
    let cur = state, hit = null;
    for (let i = 1; i <= n; i++) {
      const f = i / n, x = n === 1 ? x1 : x0 + (x1 - x0) * f, y = n === 1 ? y1 : y0 + (y1 - y0) * f;
      const ph = potQuery(x, y);
      if (!potAt) return { state: null, hit: null };
      if (!ph) { cur = null; continue; }
      const k = potKey(ph);
      const entered = cur == null || (k != null && cur !== true && k !== cur);
      if (entered && !hit) { hit = ph; wheelHit.x = x; wheelHit.y = y; }
      cur = k != null ? k : cur == null ? true : cur;
    }
    return { state: cur, hit };
  }
  /**
   * Every step for each moving vehicle near the camera (and always the player's): sweep the front and
   * rear wheels; on entering a pothole: speed loss, jolt, shake + sound (player), splash when wet, and
   * for the player's bike a small puncture / comic-fall chance. The rear wheel dropping into the same
   * pothole the front one just hit is a softer second thump ("dha-DAK"), never a second penalty.
   */
  function potholes(v, dt, p) {
    const T = v.T;
    if (T.mode === 'boat' || v.fallen || v.kin) { v.potF = v.potR = false; v._potF = v._potR = null; v._pw = null; return; }
    const sp = Math.abs(v.speed);
    const mine = v.driver === p || v.passenger === p;
    // slow (parked, creeping, waiting at a junction): no query; a wheel that stopped in a pothole stays in it
    if (!(sp >= TUNE.potholeMinSpeed)) { v._pw = null; return; }
    if (!mine && !N.render.inView(v.x, v.y, TUNE.potholeView)) { v._pw = null; v._potF = v._potR = null; v.potF = v.potR = false; return; }
    const c = Math.cos(v.angle), s = Math.sin(v.angle), ax = T.w / 2 - Math.min(3, T.w * 0.18);
    const fx = v.x + c * ax, fy = v.y + s * ax, rx = v.x - c * ax, ry = v.y - s * ax;
    const pw = v._pw || (v._pw = [fx, fy, rx, ry]);
    const F = sweepWheel(pw[0], pw[1], fx, fy, v._potF == null ? (v.potF ? true : null) : v._potF);
    if (!potAt) return;
    const fhx = wheelHit.x, fhy = wheelHit.y;
    const R = sweepWheel(pw[2], pw[3], rx, ry, v._potR == null ? (v.potR ? true : null) : v._potR);
    pw[0] = fx; pw[1] = fy; pw[2] = rx; pw[3] = ry;
    v._potF = F.state; v._potR = R.state; v.potF = F.state != null; v.potR = R.state != null;
    // the leading wheel (front, or rear when reversing) takes the hit; the trailing one dropping into the same
    // pothole a moment later is the follow-through
    const wheelIn = (ph, wheel, off, hx, hy) => {
      const L = v._potLast, k = potKey(ph);
      const same = !!L && L.w !== wheel && v.age - L.t < (2 * ax) / Math.max(4, sp) + 0.6 &&
        ((k != null && k === L.k) || Math.hypot(hx - L.x, hy - L.y) < L.r * 1.25 + 3);
      if (same) { v._potLast = null; rearThump(v, ph, mine, p, hx, hy, v.age - L.t, wheel); return; }
      if (v.potCD <= 0) hitPothole(v, ph, wheel, off, mine, p, hx, hy);
      v._potLast = { w: wheel, k, x: hx, y: hy, r: +ph.r || 5, t: v.age };
    };
    if (F.hit) wheelIn(F.hit, 'front', ax, fhx, fhy);
    if (R.hit) wheelIn(R.hit, 'rear', -ax, wheelHit.x, wheelHit.y);
  }
  function potSev(v, ph) {
    const T = v.T;
    return potSeverity(ph) * (T.potholeMul || 1) * (T.cls === 'heavy' ? 0.45 : T.cls === 'car' ? 0.75 : T.cls === 'auto' ? 0.9 : 1);
  }
  let potFallAt = -1e9, potFlatAt = -1e9;
  function hitPothole(v, ph, wheel, off, mine, p, hx, hy) {
    const T = v.T, sp = Math.abs(v.speed);
    if (!(sp >= 0) || !isFinite(sp)) return;
    const sev = potSev(v, ph);
    const spf = U.clamp(sp / Math.max(1, T.maxSpeed), 0, 1.2);
    const wet = potWet(ph);
    v.potCD = 0.12;
    // speed: x0.82 at full depth and top speed, less for shallow ones and slow riding
    const keep = 1 - U.clamp(TUNE.potholeLoss * Math.min(1.4, sev) * (0.45 + 0.55 * spf), 0, 0.4);
    v.vx *= keep; v.vy *= keep; v.speed *= keep;
    // a twitch: two-wheelers get knocked sideways a little
    if (T.cls === 'bike') v.av += (Math.random() - 0.5) * 1.1 * Math.min(1, sev) * (0.5 + spf);
    v.jolt = Math.max(v.jolt || 0, U.clamp(0.55 + 0.45 * sev, 0.55, 1));
    v.joltSide = Math.random() < 0.5 ? -1 : 1;
    const c = Math.cos(v.angle), s = Math.sin(v.angle);
    const x = isFinite(hx) ? hx : v.x + c * off, y = isFinite(hy) ? hy : v.y + s * off;
    potholeFx(x, y, wet, sev, sp);
    const vol = U.clamp(0.3 + 0.7 * spf, 0.25, 1) * (mine ? 1 : 0.7);
    if (N.audio && N.audio.sfx) N.audio.sfx('pothole', { x, y, vol, variant: wet ? 'wet' : null, pitch: T.cls === 'heavy' ? 0.7 : T.cls === 'bike' ? 1.15 : 1, key: v.sid });
    N.emit('vehicle:pothole', { vehicle: v, speed: sp, depth: ph.depth, severity: sev, wet, wheel, x, y, player: mine });
    if (!mine) return;
    if (N.render && N.render.shake && !reducedMotion()) N.render.shake(TUNE.potholeShake * U.clamp(sev * (0.45 + 0.55 * spf), 0.35, 1), 0.22);
    if (v.driver !== p || N.state.mode !== 'play') return;
    // the rolls scale with the pothole: a shallow arterial dip rarely flats a tyre or throws him
    const k = Math.min(1, sev);
    if (T.pedal && !v.flat && N.time.now - potFlatAt > TUNE.potholePunctureCD && Math.random() < TUNE.potholePuncture * (T.punctureMul || 1) * k) {
      if (V.puncture(v)) potFlatAt = N.time.now;
    }
    // a comic fall (never hurt), at speed only, and never twice in a row: 45 s of grace after one
    if (T.cls === 'bike' && spf > TUNE.potholeFallAt && N.time.now - potFallAt > TUNE.potholeFallCD && Math.random() < TUNE.potholeFall * k && p.fall) {
      if (p.fall(v, { speed: sp, pothole: true })) potFallAt = N.time.now;
    }
  }
  /** The rear wheel follows the front one into the same pothole: a smaller jolt and a softer "-dak". */
  function rearThump(v, ph, mine, p, x, y, after, wheel) {
    const T = v.T, sp = Math.abs(v.speed);
    if (!(sp >= 0)) return;
    const sev = potSev(v, ph), spf = U.clamp(sp / Math.max(1, T.maxSpeed), 0, 1.2);
    const keep = 1 - U.clamp(TUNE.potholeLoss * TUNE.potholeRear * Math.min(1.4, sev) * (0.45 + 0.55 * spf), 0, 0.1);
    v.vx *= keep; v.vy *= keep; v.speed *= keep;
    v.jolt = Math.max(v.jolt || 0, U.clamp(0.3 + 0.3 * sev, 0.3, 0.6));
    const wet = potWet(ph);
    // a bike's two drops come ~0.1 s apart: the pothole sound already has its second "dak" in it
    if (after > 0.16 && N.audio && N.audio.sfx) N.audio.sfx('pothole', { x, y, vol: U.clamp(0.2 + 0.5 * spf, 0.18, 0.7) * (mine ? 1 : 0.7), variant: wet ? 'wet' : null, pitch: T.cls === 'heavy' ? 0.62 : T.cls === 'bike' ? 1.25 : 0.9, key: v.sid });
    if (wet) potholeFx(x, y, true, sev * 0.5, sp);
    // its own event: one pothole stays ONE 'vehicle:pothole' for listeners that count them (cargo meters)
    N.emit('vehicle:potholeRear', { vehicle: v, speed: sp, depth: ph.depth, severity: sev * TUNE.potholeRear, wet, wheel: wheel || 'rear', follow: true, x, y, player: mine });
    if (mine && N.render && N.render.shake && !reducedMotion()) N.render.shake(TUNE.potholeShake * 0.4 * U.clamp(sev, 0.35, 1), 0.15);
  }
  function potholeFx(x, y, wet, sev, sp) {
    const n = Math.round(3 + sev * 4 + sp / 40);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, k = 10 + Math.random() * (20 + sp * 0.25);
      if (wet) particle('drop', x, y, Math.cos(a) * k, Math.sin(a) * k, 0.35 + Math.random() * 0.3, 0.7 + Math.random() * 0.6, Math.random() < 0.5 ? '#9fb2b8' : '#7a7462', 1);
      else particle('dust', x, y, Math.cos(a) * k * 0.6, Math.sin(a) * k * 0.6, 0.5 + Math.random() * 0.4, 1.4, '#a8916e', 1);
    }
  }
  /** Walking through a pothole: a tiny stumble (and a splash when it's full of rain water). */
  let footWas = false;
  function footPotholes(p, dt) {
    if (!potAt || p.level || p.downT > 0 || p.mode !== 'foot') { footWas = false; return; }
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    const ph = sp > 12 ? potQuery(p.x, p.y) : null;
    if (ph && !footWas) {
      const wet = potWet(ph);
      p.vx *= TUNE.stumble; p.vy *= TUNE.stumble;
      p.stumbleT = 0.35;
      if (N.render && N.render.shake && !reducedMotion()) N.render.shake(0.3, 0.12);
      if (wet) { potholeFx(p.x, p.y, true, 0.4, sp); if (N.audio && N.audio.sfx) N.audio.sfx('splash', { x: p.x, y: p.y, vol: 0.35 }); }
      N.emit('player:stumble', { x: p.x, y: p.y, wet, pothole: ph });
    }
    footWas = !!ph;
  }

  /* ============================================ A3: kid at the wheel of an auto */
  const AUTO_SHOUTS = [
    'Oye *chhotu*! Do your feet even reach the pedal?!', '*Arre!* A BACHCHA driving an auto! *Kalyug!*', 'Whose auto is that, *beta*? Your Nanna\'s?',
    'L-board! Side lo, side!', 'I\'ll complain to the union, *haan*!', '*Meter* down kar, *chhote*! Ha ha!', 'Go home and do your homework, auto-*wale*!',
  ];
  let shoutT = 4;
  function kidAtWheelTick(v, dt) {
    if (v.T.cls !== 'auto' || N.state.mode !== 'play') return;
    shoutT -= dt;
    if (shoutT > 0) return;
    shoutT = U.randRange(TUNE.autoShout[0], TUNE.autoShout[1]);
    let best = null, bd = TUNE.autoShoutR;
    for (const o of N.entities.query(v.x, v.y, TUNE.autoShoutR, isVehicle)) {
      if (o === v || !o.alive || o.T.cls !== 'auto' || !npcDriven(o)) continue;
      const d = Math.hypot(o.x - v.x, o.y - v.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return;
    const line = AUTO_SHOUTS[(Math.random() * AUTO_SHOUTS.length) | 0];
    try { if (N.dialogue && N.dialogue.bark) N.dialogue.bark(best, line, { name: false, blip: true, secs: 2.4 }); else toast(line, 2000); } catch (e) { N.err('vehicles.autoShout', e); }
    if (N.audio && N.audio.horn) { try { N.audio.horn(best, { x: best.x, y: best.y }); } catch (e) { /* ignore */ } }
    N.emit('vehicle:autoShout', { vehicle: best, at: v, line });
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
  function seedPut(type, x, y, a, opts) {
    const T = TYPES[type];
    if (!T) return null;
    const W = N.world;
    let f;
    if (T.mode === 'boat') f = waterSpot(x, y);
    else if (W.isDrivable(x, y) && !W.collide(x, y, T.cr + 0.5, 'drive').hit) f = { x, y }; // keep the exact spot (rows of cycles)
    else f = W.findFree(x, y, 'drive', 12);
    if (!f) return null;
    if (T.mode !== 'boat' && W.collide(f.x, f.y, T.cr + 0.5, 'drive').hit) return null;
    // never stack two parked vehicles on one spot
    if (N.entities.query(f.x, f.y, T.d / 2 + 3, isVehicle).some((o) => o.alive && distTo(o, f.x, f.y) < T.d / 2 - 0.6)) return null;
    return spawn(type, f.x, f.y, a, Object.assign({ seeded: true }, opts || {}));
  }
  function seedParked() {
    if (V.autoSeed === false || !N.world.built) return;
    const P = N.places;
    const put = seedPut;
    for (const id in P) {
      const pl = P[id];
      // rental cycles and jetty boats belong to their stall: ACTION opens the stall's menu (shops.js)
      if (pl.kind === 'cycle_rent') {
        // a row of four in front of the stall (kid, big black Hero, Hercules, ladies); squeezed stalls
        // try the other side and further along
        const row = [['kid_cycle', 2, 0.15], ['hero_cycle', 0, 0.2], ['hercules_cycle', 3, 0.1], ['ladiescycle', 1, 0.25]];
        const spots = [];
        for (const dy of [6, -6, 14, -14, 22]) for (const dx of [2, 9, 16, 23, -5, -12, 30]) spots.push([dx, dy]);
        let k = 0;
        for (const r0 of row) {
          let v = null;
          while (!v && k < spots.length) { const s0 = spots[k++]; v = put(r0[0], pl.x + s0[0], pl.y + s0[1], Math.PI / 2 + r0[2], { seed: U.strHash(id) + r0[1], hire: id }); }
        }
      } else if (pl.kind === 'jetty' && !/_boat$/.test(id)) {
        put('boat', pl.x, pl.y, -Math.PI / 2, { seed: U.strHash(id), hire: id });
        put('boat', pl.x + 24, pl.y + 10, -Math.PI / 2 + 0.3, { seed: U.strHash(id) + 7, hire: id });
      }
    }
    if (V.seedStands !== false) seedStands();
    seedHome();
  }
  /** Home: Nanna's Chetak (pillion only), Akka's Scooty next door, and the ladder's rewards. */
  function seedHome() {
    const home = (N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.home) || null;
    if (!home || V.autoSeed === false || !N.world.built) return;
    const have = (type) => list.some((v) => v.alive && v.type === type && v.seeded);
    // Parking (journey audit J10): the strip between the road and the house fronts (home y -4 .. +10) is the
    // footpath line through the gate, so nothing parks across it any more: the family vehicles stand nose-in
    // in the gaps between the houses (the east gap is the lane to the home stairs: kept clear) and the
    // late unlocks fill the back of those gaps. Each spot is [dx, dy, angle]; the first whose whole body is
    // clear wins, the old strip spot is the last resort.
    const fits = (T, x, y, a) => {
      const W = N.world, c = Math.cos(a), si = Math.sin(a);
      if (!W.isDrivable(x, y)) return false;
      for (const off of T.co) if (W.collide(x + c * off, y + si * off, T.cr + 0.5, 'drive').hit) return false;
      return true;
    };
    const put = (type, spots, opts) => {
      if (have(type) || !TYPES[type]) return null;
      const T = TYPES[type];
      for (const [dx, dy, a] of spots) {
        const x = home[0] + dx, y = home[1] + dy;
        if (!fits(T, x, y, a)) continue;
        const c = Math.cos(a), si = Math.sin(a);
        if (N.entities.query(x, y, T.w / 2 + 40, isVehicle).some((o) => o.alive && T.co.some((off) => distTo(o, x + c * off, y + si * off) < T.cr + 1))) continue;
        return spawn(type, x, y, a, Object.assign({ seeded: true }, opts || {}));
      }
      const last = spots[spots.length - 1];
      return seedPut(type, home[0] + last[0], home[1] + last[1], last[2], opts);
    };
    const S_ = Math.PI / 2, NO = -Math.PI / 2;
    // the family Chetak, nose-in in the gap two doors down (Nanna backs it out; Diwali's "garage" is beside it)
    put('family_chetak', [[-58, 17, S_], [-58, 2, S_]], { seed: 1999, color: '#7d9ab0', special: 'family' });
    // A3: Akka's Scooty in the narrow gap beyond, facing the street so he can ride straight out (30 finds)
    put('akka_scooty', [[-84, 16, NO], [-84, 30, NO], [26, 4, S_]], { seed: 1717, owned: true, special: 'akka' });
    // Chinnu's own cycle (12 finds) and Nanna's roadster (after M6) wait at home each morning
    if (unlocked('own_cycle', 12)) put('chinnu_cycle', [[-56, 36, NO], [-72, 26, 0], [44, 4, S_]], { seed: 2003, owned: true, label: 'my cycle' });
    if (N.flags.old_cycle || (N.missions && N.missions.isDone && N.missions.isDone('ammammas_thursday'))) put('old_cycle', [[-84, 34, NO], [-72, 26, 0], [-76, 2, S_]], { seed: 1983, owned: true });
    // 60 finds: Bunty-anna lends his old Hercules with gears (and pillion rides on the RX100); it used to stand in the road
    if (unlocked('rx100', 60) || unlocked('hercules_gears', 60)) put('hercules_gears', [[-72, 26, 0], [-110, 22, NO], [62, 4, S_]], { seed: 1960, owned: true, label: "Bunty-anna's Hercules" });
  }
  /**
   * Cycle stands (A3: the city rides Heroes, Hercules and Scooties): a few parked at schools,
   * cinemas, Irani cafés, kiranas, the OU campus and the Ameerpet coaching centres. Deterministic
   * per place; they are somebody's (parked: borrowing follows systems §3.3).
   */
  const STANDS = {
    school: { n: 2, p: 1, mix: ['hero_cycle', 'hercules_cycle', 'ladiescycle', 'hero_cycle'] },
    cinema: { n: 2, p: 1, mix: ['hero_cycle', 'scooty', 'hercules_cycle'] },
    irani_cafe: { n: 1, p: 0.35, mix: ['hero_cycle', 'scooty', 'hero_cycle'] },
    kirana: { n: 1, p: 0.25, mix: ['hero_cycle', 'scooty'] },
    osmania_university: { n: 4, p: 1, mix: ['scooty', 'hercules_cycle', 'scooty', 'hero_cycle'] },
    ameerpet_coaching: { n: 3, p: 1, mix: ['scooty', 'hercules_cycle', 'scooty'] },
  };
  function seedStands() {
    const P = N.places;
    for (const id in P) {
      const pl = P[id], st = STANDS[id] || STANDS[pl.kind];
      if (!st || pl.level || pl.virtual) continue;
      const r = U.rng('stand:' + id);
      if (r.next() > st.p) continue;
      const a = r.next() * TAU, d = (pl.r || 14) + 8;
      const bx = pl.x + Math.cos(a) * d, by = pl.y + Math.sin(a) * d;
      const head = r.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      for (let i = 0; i < st.n; i++) {
        const type = st.mix[(i + r.int(0, 9)) % st.mix.length];
        const v = seedPut(type, bx + i * 6.5, by + r.range(-1, 1), head + r.range(-0.18, 0.18), { seed: (U.strHash(id) + i * 7919) | 0, parked: true });
        if (v) v.stand = id;
      }
    }
  }

  /* ---------------------------------------------- traffic mix (A3 types for traffic.js) */
  /**
   * The traffic mix for a district style with the A3 types blended in: the old 'cycle' share is
   * split Hero 45% / Hercules 25% / BSA 30%, and the Scooty adds its own TYPES.scooty.spawn weight.
   * traffic.js can call this (or read TYPES[t].spawn) and set N.traffic.readsTypeWeights = true;
   * until then vehicles.js patches N.traffic.TUNE.mix in place once.
   */
  function trafficMix(style, base) {
    const mix = Object.assign({}, base || {});
    if (mix.hero_cycle != null) return mix;
    const cyc = +mix.cycle || 0;
    const sp = (t) => (TYPES[t] && TYPES[t].spawn && TYPES[t].spawn[style] != null ? TYPES[t].spawn[style] : 0);
    if (cyc > 0) {
      const hero = Math.round(cyc * 0.45), herc = Math.round(cyc * 0.25);
      mix.hero_cycle = hero; mix.hercules_cycle = herc; mix.cycle = Math.max(0, cyc - hero - herc);
    } else { mix.hero_cycle = sp('hero_cycle'); mix.hercules_cycle = sp('hercules_cycle'); }
    mix.scooty = (mix.scooty || 0) + sp('scooty');
    return mix;
  }
  const patchedMix = new WeakSet();
  function patchTraffic() {
    const TR = N.traffic;
    if (!TR || TR.readsTypeWeights || !TR.TUNE || !TR.TUNE.mix || V.patchTraffic === false) return;
    const M = TR.TUNE.mix;
    for (const style in M) {
      const m = M[style];
      if (!m || typeof m !== 'object' || patchedMix.has(m) || m.hero_cycle != null) continue;
      const nm = trafficMix(style, m);
      for (const k in nm) m[k] = nm[k];
      patchedMix.add(m);
    }
  }
  // who rides what: Scooties are mostly college girls and aunties, Hercules students and boys
  function restyleRider(v) {
    const d = v && v.driver;
    if (!d || !d.npc || d instanceof N.Actor || !v.T) return;
    if (N.traffic && N.traffic.styledRiders) return; // traffic.js driverLook dresses these riders itself
    const r = U.rng((v.seed | 0) + 77);
    const T = (N.traffic && N.traffic.makeLook) || null;
    const mk = (role, girl) => {
      let look = null;
      try { look = T ? T(role).look : null; } catch (e) { look = null; }
      if (!look) look = N.people.randomLook(r, role === 'student' ? 'student' : role);
      if (girl && look) { look.girl = true; if (look.kind === 'burqa' && r.chance(0.5)) look.kind = 'woman'; }
      return look;
    };
    if (v.T.bikeLook === 'scooty') d.look = r.chance(0.45) ? mk('student', true) : r.chance(0.6) ? mk('woman') : mk(r.chance(0.5) ? 'man' : 'youth');
    else if (v.T.bikeLook === 'hercules') d.look = mk(r.chance(0.6) ? 'student' : 'youth');
    else if (v.T.bikeLook === 'hero' && r.chance(0.3)) d.look = mk(r.chance(0.5) ? 'uncle' : 'man');
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
  // A* over the road graph (every incident edge: scripted drivers may ignore one-way rules; no
  // dirt paths, every road kind at its length). N.world.roads.route is a heap A* sized for the
  // 15k-node map: a cross-city fare (Charminar -> Cyber Towers) expands a few thousand nodes.
  const DRIVE_ROUTE = { walk: true, costs: {}, maxExpand: 40000 };
  function astar(a, b) {
    if (!a || !b) return null;
    return N.world.roads.route(a, b, DRIVE_ROUTE);
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
    /** debug: let the player drive anything (buses, lorries, Chetaks, cars) through the normal ACTION offer */
    allowHeavy: false,
    /** A3 age rules on (default). false = the old free-for-all (tests / debug). */
    ageRules: true,
    seedStands: true, seedHome, trafficMix, patchTraffic, REFUSE,
    finds, unlocked,
    /** A3: may the player drive this vehicle (or type)? */
    canDrive: (v) => canDrive(typeof v === 'string' ? { T: TYPES[v] || DEFAULTS } : v),
    /** What ACTION would do next to v: {kind, label} (drive | borrow | hire | nakko | pillion | passenger | bus | fare | nolift | refuse). */
    offerFor: (v) => (v ? offerFor(v) : null),
    refusalFor: (v) => (v ? refusalFor(v) : null),
    /** Ride along with v's NPC driver (pillion / passenger): ride(N.player, v, {as, fare, lock}). */
    ride, boardBus,
    /** Is the actor (default player) riding along rather than driving? -> 'pillion' | 'passenger' | null */
    isPassenger(a) { a = a || N.player; return (a && a.vehicle && a.passenger) || null; },
    /** A3 retry / load: rideState(actor) -> {type, as, look, ...} | null; restoreRide(actor, state, {x, y, vehicle, lock}). */
    rideState, restoreRide,
    /** A2 hooks (tests, debug): hit a pothole now; the walking stumble check. */
    hitPothole(v, ph) { if (!v) return false; hitPothole(v, ph || { depth: 0.8, r: 6 }, 'front', v.T.w / 2 - 2, v.driver === N.player || v.passenger === N.player, N.player); return true; },
    potSeverity,
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

  N.on('game:new', () => { try { patchTraffic(); seedParked(); } catch (e) { N.err('vehicles.seed', e); } });
  N.on('game:continue', () => { try { patchTraffic(); if (!list.some((v) => v.alive && v.seeded)) seedParked(); else seedHome(); healAge(); } catch (e) { N.err('vehicles.seed', e); } });
  N.on('save:loaded', () => { try { applyPendingRide(); healAge(); } catch (e) { N.err('vehicles.heal', e); } });
  // a ladder unlock appears at home at once (Akka's Scooty, Chinnu's cycle, Bunty-anna's Hercules)
  N.on('collectible:threshold', (d) => { if (d && d.series === 'total') { try { seedHome(); } catch (e) { N.err('vehicles.seedHome', e); } } });
  // traffic riders: Scooties are college girls and aunties, Hercules students and boys
  N.on('vehicle:spawn', (v) => { if (v && v.driver && v.T && v.T.bikeLook && /scooty|hercules|hero/.test(v.T.bikeLook)) Promise.resolve().then(() => { if (v.trafficOwned || v.tr) restyleRider(v); }).catch(() => {}); });
  /** A3 after a load: a save made while riding along (or a heavy vehicle) never seats him at the wheel. */
  function healAge() {
    const p = N.player, v = p && p.vehicle;
    if (!v || canDrive(v) || p.passenger || (N.missions && N.missions.active)) return;
    exit(p, true);
    // save.js re-spawned it from the save under him: a stray copy (a second family Chetak, a bus parked
    // across the road) goes away; the seeded / hired / owned originals stay
    if (!v.seeded && !v.hire && !v.owned && !v.special && !v.driver) remove(v);
  }

  N.addSystem({
    id: 'vehicles', order: 30, runIn: ['play', 'dialogue', 'cutscene'],
    update,
    draw() {
      const R = N.render;
      if (skidN) R.queue('ground', 1, drawSkids);
      R.queue('actors', R.view.y1 + 400, drawParticles);
      if (glows.length) R.queue('light', 5, drawGlows);
    },
    init() {
      patchTraffic();
      // A3: a save made while riding along loads him riding along again (save.js 'player' re-seats him at
      // the wheel of a fresh copy; applyPendingRide hands the wheel back to an NPC driver)
      if (N.save && N.save.register) N.save.register('ride', { serialize: () => rideState() || null, deserialize: (o) => { pendingRide = o && typeof o === 'object' && typeof o.type === 'string' ? o : null; } });
    },
    reset() {
      for (const v of list.slice()) { N.entities.remove(v); }
      list.length = 0;
      V.clearDecals();
      if (zoomOwned) { N.render.baseZoom = 1; zoomOwned = false; }
      if (N.player) { N.player.noCollide = false; N.player.passenger = null; }
      footWas = false; shoutT = 4; potFallAt = -1e9; potFlatAt = -1e9; noT = -1e9; noV = null;
      N.input.setLabel('run', null);
    },
  });
})();
