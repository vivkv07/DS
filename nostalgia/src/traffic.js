/* NOSTALGIA — traffic.js  (owner: city-life + wanted agent)
 *
 * Ambient city life around the player (ARCHITECTURE §8, systems_design §3.4, §10.2, §11):
 *  - VEHICLES on the road graph, driving on the LEFT in lane offsets (bikes hug the kerb), pure-pursuit
 *    steering along a rolling waypoint list with smoothed junction corners, speed planning (cruise per
 *    road kind, junction slow-down, corner limits), car-following with a sensing corridor, yielding at
 *    junction boxes (a vehicle already in the box has right of way), podium junctions where the traffic
 *    constable holds one axis for 6 s then the other (08:00–21:00), honking when blocked, swerving round
 *    lying cows / parked vehicles, buses stopping 4 s at every bus_stop_* on their side of the road, autos
 *    pulling over to drop passengers, reacting to the player's horn (sidestep left + slow, autos honk
 *    back), never ramming the player. Type mix per district style (systems §3.4) incl. cycle-rickshaws
 *    (type 'rickshaw', defined here) in the old city, lorries at night / in HITEC City, boats on Hussain Sagar.
 *  - PEDESTRIANS on footpaths (walk along the road graph's footpath lines, cross at junction mouths where
 *    the zebras are, jaywalk now and then, wait at the kerb for traffic), crowds wandering at bus stands,
 *    stations, cinemas (show times), temples, markets, Gokul Chat, Charminar, Irani cafes, school gates at
 *    the bells and colony playgrounds; district looks (old city burqas, skull caps and henna beards, sherwanis
 *    on Fridays; colony aunties in cotton sarees with jasmine, lungi uncles with towels, school kids in
 *    uniform in school hours, students at Osmania, office-goers in HITEC City, porters at stations);
 *    pushcart vendors with calls; balloon sellers in the parks at dusk; umbrellas in the rain.
 *    They jump aside from fast vehicles, get knocked down by bumps (and always get up, dust off and bark),
 *    turn to look at a commotion, and show Hyderabadi bark lines (story bible §8.1) as speech bubbles
 *    (N.dialogue.bark) when bumped, honked at, run past or stood next to.
 *  - ANIMALS: cows lying on medians / road edges (immovable: vehicles stop or go round, horns make them
 *    amble off), stray dogs (nap by day, packs at night, chase bikes, can be fed a biscuit and then bark at
 *    foot pursuers), goats in the old city, pigeon flocks that burst into flight (systems §11.3) — plus
 *    horn-scaring for the landmark flocks at Charminar / Mecca Masjid / Gulzar Houz (N.landmarks.flocks).
 *  - CONSTABLES on the podium junctions (N.world.podiums), whistling and directing the two axes.
 * Caps (TUNE.caps): desktop 28 vehicles / 45 peds / 12 animals, touch devices 20 / 32 / 9. Spawns happen
 * just outside the view, at most 2 per frame (8 right after a teleport), despawn out of view and far away.
 *
 * API  N.traffic = {
 *   enabled (false: no new spawns; clear() removes what exists), density (0..2 multiplier), setDensity(d),
 *   clear(pred?), TUNE, stats() -> {vehicles, peds, animals, flocks, ms}, vehicles [], peds [], animals [],
 *   constables [] (podium actors; wanted.js uses them as spotters), claimAuto(x, y, r) -> an empty ambient
 *   auto released from traffic control (shops.js "AUTO!"), release(v) (stop controlling a vehicle),
 *   busAt(x, y, r) -> a bus stopped at a stop near (x, y) | null, spawnVehicle(type, {x, y, angle?, to?} | null),
 *   spawnPed(role?, {x, y, zone?}), bark(ped, text | situation), crowd(placeId) -> zone info,
 *   friendlyDogs() -> fed dogs following the player, closeRoads(id, {x, y, r} | null) (no traffic there),
 *   sense(v) -> nearest obstacle ahead {e, gap, sp} (shared with wanted.js pursuer vehicles),
 *   scarePigeons(x, y, r), typeWeights(style, {kind, minutes, x, y}) (spawn weights: TUNE.mix overridden by
 *   N.vehicles.TYPES[t].spawn; readsTypeWeights = true), pickType(style, kind), driverLook(type, style),
 *   quietAt(x, y) (respect zones: no horns within TUNE.respectR, traffic crawls at TUNE.respectCruise) }
 * Ped flags other modules may set: ped.spotter = {stick: bool} | null (wanted.js: stands, faces Chinnu,
 *   the stick aunty walks after him waving it; drawn with a red "!" pip), ped.hold = true (freeze it).
 * Events: 'ped:knocked' {ped, by, speed}, 'ped:dodge' {ped, vehicle}, 'traffic:honk' {vehicle},
 *   'cow:bump' {cow, vehicle}, 'dog:chase' {dog, target}, 'dog:fed' {dog}, 'pigeons:scatter' {x, y}.
 * Hooks: defines vehicle type 'rickshaw' (cycle-rickshaw) at boot; marks traffic vehicles `parked` when
 *   they end up abandoned (vehicles.js then applies the borrow heat of systems §3.3); listens to 'horn',
 *   'bump', 'player:teleport', 'game:new', 'save:loaded'. No core file is edited.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[(rnd() * a.length) | 0];
  function wpick(obj) {
    let tot = 0;
    for (const k in obj) if (obj[k] > 0) tot += obj[k];
    if (tot <= 0) return null;
    let r = rnd() * tot;
    for (const k in obj) { if (obj[k] > 0) { r -= obj[k]; if (r <= 0) return k; } }
    for (const k in obj) if (obj[k] > 0) return k;
    return null;
  }

  /* ================================================================ tuning (systems §3.4, §11) */
  const TUNE = {
    caps: { desk: { veh: 28, ped: 45, ani: 12, flocks: 4 }, mobile: { veh: 20, ped: 32, ani: 9, flocks: 3 } },
    // share of the vehicle cap by district style (systems §3.4 day targets 18/14/14/12/12/10/6/6, market = 1)
    vehStyle: { market: 1, oldcity: 0.8, colonial: 0.8, colony: 0.68, cantonment: 0.68, posh: 0.56, hitec: 0.38, rocky: 0.36, osmania: 0.5 },
    // share of the ped cap (systems §11.2: 34/30/18/16/14/8/6/5, old city = 1)
    pedStyle: { oldcity: 1, market: 0.9, colony: 0.56, cantonment: 0.5, colonial: 0.44, posh: 0.26, hitec: 0.2, rocky: 0.18, osmania: 0.5 },
    mix: {
      colony: { cycle: 22, ladiescycle: 8, luna: 10, chetak: 16, rx100: 6, auto: 18, ambassador: 4, maruti800: 8, padmini: 3, bus: 4, lorry: 1, rickshaw: 2 },
      market: { cycle: 12, ladiescycle: 4, luna: 6, chetak: 14, rx100: 6, auto: 26, ambassador: 6, maruti800: 8, padmini: 4, bus: 10, lorry: 4, rickshaw: 4 },
      oldcity: { cycle: 20, ladiescycle: 3, luna: 10, chetak: 18, rx100: 8, auto: 28, ambassador: 3, maruti800: 4, padmini: 2, bus: 3, lorry: 1, rickshaw: 9 },
      colonial: { cycle: 10, ladiescycle: 4, luna: 4, chetak: 14, rx100: 6, auto: 18, ambassador: 14, maruti800: 12, padmini: 6, bus: 10, lorry: 2 },
      posh: { cycle: 6, ladiescycle: 4, luna: 3, chetak: 12, rx100: 8, auto: 14, ambassador: 12, maruti800: 24, padmini: 10, bus: 4, lorry: 3 },
      cantonment: { cycle: 16, ladiescycle: 8, luna: 6, chetak: 14, rx100: 6, auto: 18, ambassador: 8, maruti800: 10, padmini: 4, bus: 9, lorry: 1, rickshaw: 1 },
      hitec: { cycle: 6, ladiescycle: 2, luna: 6, chetak: 10, rx100: 10, auto: 12, ambassador: 6, maruti800: 22, padmini: 4, bus: 4, lorry: 18 },
      rocky: { cycle: 14, ladiescycle: 4, luna: 8, chetak: 14, rx100: 10, auto: 14, ambassador: 6, maruti800: 12, padmini: 4, bus: 6, lorry: 8 },
      osmania: { cycle: 26, ladiescycle: 8, luna: 6, chetak: 18, rx100: 12, auto: 10, ambassador: 4, maruti800: 6, padmini: 2, bus: 6, lorry: 2 },
    },
    govtAmbassador: 0.03,
    cruise: { arterial: [0.75, 120], street: [0.6, 95], lane: [0.4, 60], bund: [0.7, 120], bridge: [0.65, 110] },
    junctionSlow: 0.4, yieldMax: 3.5, hornAfter: 1.5, hornEvery: [2.5, 4.5], hornBudget: 3, followGap: 5, followK: 1.4,
    swerveSpeed: 20, swerveAfter: 1.0, wobble: 2,
    busStop: 4, busStopR: 46, autoPullover: 0.15, pulloverSecs: 3,
    playerHornR: 70, playerHornCone: 0.87, hornSidestep: 6, hornSlowSecs: 2, autoHonkBack: 0.2,
    pedSpd: { kid: 50, student: 44, man: 42, woman: 38, aunty: 34, uncle: 36, old: 26, porter: 40, vendor: 22, police: 40 },
    dodgeSpeed: 85, dodgeSecs: 0.35, crossWait: 6, jaywalk: 0.06,
    barkCooldown: 8, barkGap: 0.6, runPastBark: 0.2, nearBark: 0.25, nearBarkAfter: 3, dodgeBark: 0.35, hornBark: 0.3,
    cows: { oldcity: 3, colony: 2, market: 2, colonial: 1, cantonment: 1, rocky: 2, osmania: 1, posh: 0, hitec: 0 },
    cowHornR: 60, cowGetUp: [1.5, 3], cowAmble: 40, cowAmbleSpeed: 25, cowLieAgain: [20, 40],
    dogs: { day: 2, night: 4 }, dogChase: { trigger: 50, r: 45, speed: 90, secs: 4 }, dogFollowSecs: 120, dogScareR: 80, dogScareSecs: 1.5,
    goats: { oldcity: 4, rajendranagar: 3, langar_houz: 3, golconda: 2 },
    pigeonPlaces: ['tank_bund_statues', 'secunderabad_station', 'abids', 'mozamjahi_market', 'nampally_station'],
    pigeonScare: { speed: 50, r: 40, near: 14, hornR: 80, landAfter: [6, 10] },
    podiumHours: [8 * 60, 21 * 60], podiumPhase: 6, podiumGap: 1,
    // respect zones (systems §4.8): no horns within respectR of one, and traffic slows to respectCruise
    respectR: 40, respectCruise: 40,
    // spawn rings are offsets beyond the view's half-diagonal; despawn needs out-of-view AND beyond these
    ringPed: [20, 170], ringVeh: [30, 210], ringAni: [24, 220], despawnPed: 330, despawnVeh: 440, despawnAni: 380,
    spawnPerFrame: 2, fillPerFrame: 8, fillSecs: 0.9,
    // crowd zones: place kind / id -> {n: max wanderers, r, hours [from, to] (minutes), roles}
    zones: {
      transport: { n: 9, r: 46, hours: [5 * 60, 23 * 60], roles: { man: 4, uncle: 2, aunty: 2, woman: 1, porter: 2, student: 1, kid: 1 } },
      bus_stop: { n: 3, r: 16, hours: [6 * 60, 22 * 60], roles: { man: 3, aunty: 2, student: 2, uncle: 1 } },
      cinema: { n: 8, r: 34, hours: [10 * 60 + 30, 23 * 60 + 30], roles: { youth: 6, man: 2, student: 2, woman: 1 } },
      temple: { n: 6, r: 34, hours: [5 * 60 + 30, 21 * 60], roles: { pilgrim: 4, aunty: 3, uncle: 2, old: 1 } },
      mosque: { n: 4, r: 30, hours: [5 * 60, 21 * 60 + 30], roles: { elder: 4, man: 2 } },
      church: { n: 2, r: 26, hours: [7 * 60, 19 * 60], roles: { man: 2, woman: 2, aunty: 1 } },
      market: { n: 10, r: 52, hours: [8 * 60, 22 * 60], roles: { aunty: 3, uncle: 2, man: 3, woman: 2, kid: 1, vendor: 1 } },
      food: { n: 7, r: 30, hours: [11 * 60, 23 * 60], roles: { youth: 2, man: 2, aunty: 2, kid: 2, student: 2 } },
      plaza: { n: 12, r: 64, hours: [6 * 60, 23 * 60 + 30], roles: { man: 3, woman: 2, elder: 2, kid: 2, youth: 2, aunty: 1, vendor: 1 } },
      irani_cafe: { n: 3, r: 18, hours: [5 * 60, 23 * 60 + 30], roles: { man: 3, uncle: 2, old: 1, youth: 2 } },
      school: { n: 10, r: 34, hours: [7 * 60 + 30, 9 * 60], hours2: [15 * 60 + 30, 17 * 60], roles: { student: 10, aunty: 1 } },
      playground: { n: 6, r: 30, hours: [16 * 60, 18 * 60 + 45], roles: { kid: 6, student: 2 } },
      osmania_university: { n: 10, r: 80, hours: [8 * 60, 18 * 60], roles: { college: 8, man: 1 } },
    },
    // festival / day multipliers (systems §11.2, §3.4)
    events: [
      { flag: 'numaish', place: 'nampally_exhibition', r: 520, ped: 2.0, hours: [16 * 60, 22 * 60 + 30] },
      { flag: 'ramzan', style: 'oldcity', ped: 1.6, hours: [20 * 60, 24 * 60] },
      { flag: 'ganesh_immersion', place: 'tank_bund', r: 800, ped: 2.5, veh: 1.6, idolLorries: true },
      { flag: 'bonalu', place: 'ujjaini_mahankali_temple', r: 600, ped: 2.0 },
      { dow: 4, place: 'dilsukhnagar_sai_temple', r: 300, ped: 1.8 },
      { flag: 'sankranti', style: 'colony', ped: 1.3 },
      { flag: 'chand_raat', place: 'charminar', r: 500, ped: 1.8 },
    ],
  };

  /* ================================================================ small helpers */
  const isVeh = (e) => e.kind === 'vehicle';
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  function inHours(h, m) { if (!h) return true; m = m == null ? mins() : m; return h[0] <= h[1] ? m >= h[0] && m < h[1] : m >= h[0] || m < h[1]; }
  function night() { try { return !!(N.clock && N.clock.isNight && N.clock.isNight()); } catch (e) { return false; } }
  function flagOn(id) {
    const F = N.flags || {};
    if (F[id]) return true;
    if (F.festival === id) return true;
    if (Array.isArray(F.festivals) && F.festivals.indexOf(id) >= 0) return true;
    try { if (N.seasons && typeof N.seasons.is === 'function' && N.seasons.is(id)) return true; } catch (e) { /* stub */ }
    return false;
  }
  function calDate() {
    try { if (N.calendar && N.calendar.date) return N.calendar.date; } catch (e) { /* stub */ }
    const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
    const d = new Date(Date.UTC(b[0], b[1], b[2] + ((N.clock && N.clock.day) || 0)));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
  }
  function schoolDay() { try { if (N.calendar && N.calendar.isSchoolDay) return N.calendar.isSchoolDay(); } catch (e) { /* stub */ } return calDate().dow !== 0; }
  const raining = () => !!(N.flags && (N.flags.raining || N.flags.rain === true));
  const summer = () => { const d = calDate(); const v = d.m * 100 + d.d; return v >= 424 && v <= 611; };
  function mobile() {
    try { if (N.input && N.input.device === 'touch') return true; } catch (e) { /* ignore */ }
    return !!(document.body && document.body.classList.contains('touch-on'));
  }
  const caps = () => (mobile() ? TUNE.caps.mobile : TUNE.caps.desk);
  function styleOf(d) { if (!d) return 'colony'; if (d.id === 'osmania') return 'osmania'; return d.style || 'colony'; }
  function districtAt(x, y) { try { return N.world.districtAt(x, y); } catch (e) { return null; } }
  function respectAt(x, y) { try { return N.respect && N.respect.at ? N.respect.at(x, y) : null; } catch (e) { return null; } }
  /** In or near (TUNE.respectR) a temple / mosque / church / procession: no horns, traffic crawls (systems §4.8). */
  function quietAt(x, y) {
    try { return !!(N.respect && (N.respect.at && N.respect.at(x, y) || N.respect.near && N.respect.near(x, y, TUNE.respectR))); } catch (e) { return false; }
  }
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, o || {}); } catch (e) { /* audio never breaks traffic */ } }
  function viewR() { const v = N.render.view; return Math.hypot(v.x1 - v.x0, v.y1 - v.y0) / 2; }
  function camC() { const v = N.render.view; return { x: (v.x0 + v.x1) / 2, y: (v.y0 + v.y1) / 2 }; }
  const S = () => N.SURF;
  function walkSurfOk(x, y, allowRoad) {
    const s = N.world.surfaceAt(x, y), SU = S();
    if (s === SU.VOID || s === SU.WATER || s === SU.ROCK || s === SU.SOLID) return false;
    if (!allowRoad && (s === SU.ROAD || s === SU.BRIDGE)) return false;
    return true;
  }

  /* ================================================================ road index */
  const RI = { built: false, nodes: null, edges: null, grid: null, G: 192, gw: 0, stops: null, podium: null, closures: new Map() };
  function buildIndex() {
    const R = N.world && N.world.roads;
    if (!R || !R.nodes || !R.nodes.length) return false;
    RI.nodes = R.nodes; RI.edges = R.edges;
    RI.gw = Math.ceil(N.WORLD_W / RI.G);
    RI.grid = new Map();
    for (const n of R.nodes) {
      if (!n.inc || !n.inc.length) continue;
      const k = Math.floor(n.y / RI.G) * RI.gw + Math.floor(n.x / RI.G);
      const l = RI.grid.get(k); if (l) l.push(n); else RI.grid.set(k, [n]);
    }
    // bus stops: the nearest graph edge within busStopR of each bus_stop_* place
    RI.stops = new Map();
    for (const id in N.places) {
      const p = N.places[id];
      if (p.kind !== 'bus_stop') continue;
      let best = null, bd = TUNE.busStopR;
      for (const n of nodesNear(p.x, p.y, 260)) for (const eid of n.inc) {
        const e = RI.edges[eid], A = RI.nodes[e.a], B = RI.nodes[e.b];
        if (e.kind === 'lane') continue;
        const q = U.closestOnSeg(p.x, p.y, A.x, A.y, B.x, B.y);
        const d = Math.sqrt(q.d2);
        if (d < bd && q.t > 0.08 && q.t < 0.92) { bd = d; best = { e, t: q.t, side: (p.x - A.x) * (B.y - A.y) - (p.y - A.y) * (B.x - A.x) }; }
      }
      if (best) {
        // side: the stop is on the LEFT of a->b when the cross product is negative (+y south)
        const l = RI.stops.get(best.e.id) || []; l.push({ place: p, t: best.t, leftOfAB: best.side < 0 }); RI.stops.set(best.e.id, l);
      }
    }
    RI.podium = new Map();
    for (const pod of (N.world.podiums || [])) {
      const n = R.nearestNode(pod.x, pod.y);
      if (n && Math.hypot(n.x - pod.x, n.y - pod.y) < 10) RI.podium.set(n.id, pod);
    }
    RI.built = true;
    return true;
  }
  function nodesNear(x, y, r) {
    const out = [], G = RI.G;
    if (!RI.grid) return out;
    const i0 = Math.floor((x - r) / G), i1 = Math.floor((x + r) / G), j0 = Math.floor((y - r) / G), j1 = Math.floor((y + r) / G);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = RI.grid.get(j * RI.gw + i); if (!l) continue;
      for (const n of l) if ((n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) <= r * r) out.push(n);
    }
    return out;
  }
  /** A random graph node in the ring [r0, r1] around (x, y). */
  function ringNode(x, y, r0, r1, pred) {
    for (let k = 0; k < 7; k++) {
      const a = rnd() * TAU, d = rr(r0, r1);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      const l = RI.grid.get(Math.floor(py / RI.G) * RI.gw + Math.floor(px / RI.G));
      if (!l || !l.length) continue;
      const n = pick(l);
      const dd = Math.hypot(n.x - x, n.y - y);
      if (dd < r0 * 0.85 || dd > r1 * 1.2) continue;
      if (pred && !pred(n)) continue;
      return n;
    }
    return null;
  }
  function edgeAny(A, B) {
    for (const eid of A.inc) { const e = RI.edges[eid]; if ((e.a === A.id && e.b === B.id) || (e.b === A.id && e.a === B.id)) return e; }
    return null;
  }
  function geom(A, B) { const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1; return { ux: dx / L, uy: dy / L, L }; }
  // left normal of (ux, uy) is (uy, -ux) (+y is south): positive offsets are on the LEFT of travel
  function lanePt(A, g, d, off) { return { x: A.x + g.ux * d + g.uy * off, y: A.y + g.uy * d - g.ux * off }; }
  function laneOffset(e, lane) { const lanes = e.lanes || 1; return ((Math.min(lane || 0, lanes - 1) + 0.5) * (e.w / 2)) / lanes; }
  const RANK = { lane: 0, path: 0, street: 1, bund: 2, bridge: 2, arterial: 3 };
  function closedAt(x, y) {
    for (const c of RI.closures.values()) if ((x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) < c.r * c.r) return true;
    const z = respectAt(x, y);
    return !!(z && z.part === 'compound');
  }
  function autoClosures() {
    // systems §3.4: Chand Raat lanes, the 2026 epilogue plaza, the processions (respect zones)
    const F = N.flags || {};
    const want = new Map();
    const P = N.places;
    if ((F.year === 2026 || F.year2026 || flagOn('year2026')) && P.charminar_plaza) want.set('_epilogue', { x: P.charminar_plaza.x, y: P.charminar_plaza.y, r: 230 });
    if (flagOn('chand_raat') && P.laad_bazaar) want.set('_chandraat', { x: P.laad_bazaar.x, y: P.laad_bazaar.y, r: 170 });
    for (const k of Array.from(RI.closures.keys())) if (k[0] === '_' && !want.has(k)) RI.closures.delete(k);
    for (const [k, v] of want) RI.closures.set(k, v);
  }

  /* ================================================================ cycle-rickshaw type */
  function defineTypes() {
    const V = N.vehicles;
    if (!V || !V.define || V.TYPES.rickshaw) return;
    V.define('rickshaw', {
      base: 'cycle', name: 'Cycle-rickshaw', short: 'rickshaw', verb: 'Pedal', cls: 'car', w: 24, d: 11, h: 13,
      maxSpeed: 70, accel: 34, brake: 150, reverse: 0.15, drag: 26, turn: 2.2, turnLow: 0.4, turnHigh: 0.6,
      grip: 10, drift: 2, mass: 4, seats: 3, rider: true, pedal: true, lights: false, door: false, radio: false, smoke: null,
      colors: ['#2a5cb8', '#b22b2b', '#2f7a4a', '#7a3a8a', '#1d1d22'], colors2: ['#f2c230', '#e8e0d0', '#d8402a'],
      draw: (ctx, v) => drawRickshaw(ctx, v),
    });
  }
  const rkAnim = { phase: 0, speed: 0.7, run: false };
  function drawRickshaw(ctx, v) {
    const D = N.draw, col = v.color, col2 = v.color2 || '#f2c230';
    const ph = (v.wheelPhase || 0);
    // wheels + frame (ground plane)
    D.sprite(v.x, v.y, v.angle, 0.8, (g) => {
      g.fillStyle = '#1a1a1e';
      g.fillRect(7.5, -0.6, 4.6, 1.2);           // front wheel
      g.fillRect(-9.6, -6.0, 4.4, 1.2); g.fillRect(-9.6, 4.8, 4.4, 1.2); // rear pair
      g.strokeStyle = '#3a3a40'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(9.8, 0); g.lineTo(-2, 0); g.moveTo(-7.4, -5.4); g.lineTo(-7.4, 5.4); g.stroke();
      g.strokeStyle = 'rgba(200,200,200,0.5)'; g.lineWidth = 0.35; g.beginPath();
      for (const wx of [9.8, -7.4]) { const a = ph * 2; g.moveTo(wx + Math.cos(a) * 2.1, Math.sin(a) * 0.5); g.lineTo(wx - Math.cos(a) * 2.1, -Math.sin(a) * 0.5); }
      g.stroke();
    });
    // passenger box + seat
    D.sprite(v.x, v.y, v.angle, 4.5, (g) => {
      g.fillStyle = U.shade(col, 0.8); g.fillRect(-11, -5.4, 8.6, 10.8);
      g.fillStyle = '#c8302a'; g.fillRect(-10.2, -4.6, 6.4, 9.2);  // red rexine seat
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-10.2, -4.6, 6.4, 1.4);
      g.strokeStyle = 'rgba(20,10,10,0.6)'; g.lineWidth = 0.5; g.strokeRect(-11, -5.4, 8.6, 10.8);
    });
    // the rider (pedalling) at the front
    rkAnim.phase = ph * 0.7; rkAnim.speed = Math.min(0.7, Math.abs(v.speed || 0) / 40);
    const look = (v.driver && v.driver.look) || (v._rkLook || (v._rkLook = N.people.randomLook(U.rng(v.seed || 1), 'uncle')));
    D.sprite(v.x, v.y, v.angle, 8.4, (g) => { g.translate(2.4, 0); N.people.draw(g, look, rkAnim); });
    // folding hood (canopy) over the seat, tilted back
    D.sprite(v.x, v.y, v.angle, 13, (g) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo(-3.2, -5.8); g.quadraticCurveTo(-1.6, 0, -3.2, 5.8); g.lineTo(-11.4, 5.4); g.quadraticCurveTo(-12.4, 0, -11.4, -5.4); g.closePath(); g.fill();
      g.strokeStyle = col2; g.lineWidth = 0.7; g.beginPath();
      for (const x of [-5.4, -7.8, -10]) { g.moveTo(x, -5.6); g.quadraticCurveTo(x + 1.4, 0, x, 5.6); }
      g.stroke();
      g.strokeStyle = 'rgba(20,10,20,0.55)'; g.lineWidth = 0.5; g.stroke();
    });
  }

  /* ================================================================ looks */
  const P_SKIN = ['#8d5a3b', '#a0683f', '#b97a4f', '#c68b5e', '#7a4a30', '#d29a6a', '#9a6040'];
  const SHIRT_PALE = ['#e8e0d0', '#dfe8f2', '#c8d8e8', '#efe6d0', '#d8e0c8', '#e8d8c8', '#f4f2ea', '#bcd0e0'];
  const SHIRT_LOUD = ['#d8402a', '#2a5cb8', '#3a8a3a', '#f2c230', '#7a3a8a', '#2a8c82', '#c86a2a', '#e88aa8', '#8a2a2a', '#3a3a8a'];
  const SAREE = ['#d8402a', '#2a8c82', '#f2c230', '#c03a8a', '#3a8a3a', '#f08a24', '#7a3a8a', '#e85a7a', '#2a5cb8', '#8a2a3a', '#3a6a3a', '#c8a020'];
  const PANTS = ['#3a3a4a', '#5a4a3a', '#2a3a5a', '#7a6a5a', '#4a4a4a', '#6a6a70'];
  const LUNGI = ['#2a5cb8', '#3a8a3a', '#7a3a3a', '#efe9dc', '#5a3a8a', '#2a6a7a'];
  const UNIFORM = [['#f2f0ea', '#2a3a6a', '#2a3a6a'], ['#f2f0ea', '#7a6a4a', '#7a2a2a'], ['#f2f0ea', '#3a5a3a', '#3a5a3a'], ['#e8f0f8', '#2a4a8a', '#b22b2b'], ['#f4f2e8', '#5a2a3a', '#5a2a3a']];
  const RIBBON = ['#d8202a', '#2a5cb8', '#f2f0ea', '#3a8a3a'];
  const skin = () => pick(P_SKIN);

  /** A look for a role. Returns {look, lang ('te'|'dk'|'any'), spd}. */
  function makeLook(role, style) {
    const dk = style === 'oldcity';
    const L = { kind: 'man', skin: skin(), hair: '#1a1412', shirt: pick(SHIRT_PALE), pants: pick(PANTS), cast: 'amb' };
    let lang = dk ? 'dk' : 'te', spd = TUNE.pedSpd.man;
    switch (role) {
      case 'student': {
        const u = pick(UNIFORM);
        L.kind = 'student'; L.shirt = u[0]; L.pants = u[1]; L.tie = u[2]; L.girl = rnd() < 0.45;
        L.bag = pick(['#2a5cb8', '#b22b2b', '#3a8a3a', '#7a3a8a', '#d8402a', '#2a2a30']);
        if (L.girl) { L.plaits = pick(RIBBON); L.pants = u[1]; }
        spd = TUNE.pedSpd.student; lang = 'any';
        break;
      }
      case 'kid': {
        L.kind = 'kid'; L.girl = rnd() < 0.4;
        L.shirt = pick(SHIRT_LOUD); L.pants = L.girl ? L.shirt : pick(['#7a6a4a', '#2a3a6a', '#5a4a3a']);
        if (!L.girl && rnd() < 0.35) L.stripes = pick(SHIRT_LOUD);
        if (L.girl) L.ponytails = pick(RIBBON);
        if (!L.girl && rnd() < 0.15) { L.cap = 'cricket'; L.capColor = pick(['#2a5cb8', '#c03030', '#f2c230']); }
        if (rnd() < 0.2) L.prop = pick(['ball', 'bat', 'wrapper']);
        spd = TUNE.pedSpd.kid; lang = 'any';
        break;
      }
      case 'uncle': { // half-sleeve shirt tucked in, trousers, moustache, a bag or newspaper
        L.kind = 'man'; L.shirt = pick(SHIRT_PALE); L.pants = pick(['#5a5a62', '#6a5a4a', '#3a3a4a', '#7a7068']);
        if (rnd() < 0.45) L.belly = true; if (rnd() < 0.35) L.specs = true; if (rnd() < 0.3) L.hair = '#8a8680';
        if (rnd() < 0.35) L.prop = pick(['clothbag', 'packet', 'radio']); if (rnd() < 0.3) L.oiled = true;
        if (dk && rnd() < 0.35) { L.hat = 'skull'; L.hatColor = '#f4f2ea'; }
        spd = TUNE.pedSpd.uncle;
        break;
      }
      case 'lungi': {
        L.kind = 'uncle'; L.lungi = pick(LUNGI); L.hair = rnd() < 0.4 ? '#8a8680' : '#1a1412';
        if (rnd() < 0.6) L.towel = pick(['#efe6d0', '#c03030', '#2a6a8a', '#e8d8a8']);
        if (rnd() < 0.25) L.prop = pick(['clothbag', 'basket']);
        spd = TUNE.pedSpd.uncle;
        break;
      }
      case 'aunty': { // cotton saree, bun with jasmine, steel tiffin / vegetable bag
        L.kind = rnd() < 0.7 ? 'aunty' : 'saree'; L.saree = pick(SAREE); L.border = pick(['#f2c230', '#e8c060', '#d8402a', '#efe9dc', '#7a1f2b']);
        L.blouse = U.shade(L.saree, 0.7);
        if (rnd() < 0.55) L.prop = pick(['clothbag', 'basket', 'clothbag', 'tray']);
        if (rnd() < 0.15) L.specs = true;
        if (dk && rnd() < 0.5) { L.kind = 'burqa'; lang = 'dk'; }
        else lang = 'te';
        spd = TUNE.pedSpd.aunty;
        break;
      }
      case 'woman': { // salwar kameez with a dupatta (over the head in the old city), or a burqa
        L.kind = 'woman'; L.shirt = pick(SAREE); L.pants = pick(['#efe9dc', '#f2c230', '#2a5cb8', L.shirt]); L.dupatta = pick(SAREE);
        if (dk) { if (rnd() < 0.55) L.kind = 'burqa'; else L.headCover = L.dupatta; }
        if (rnd() < 0.4) L.prop = pick(['clothbag', 'basket']);
        spd = TUNE.pedSpd.woman;
        break;
      }
      case 'youth': { // printed shirt, bell-ish jeans, side parting / puff
        L.kind = 'man'; L.shirt = pick(SHIRT_LOUD); L.pants = pick(['#3a4a6a', '#2a3a5a', '#4a4a5a', '#6a5a4a']);
        if (rnd() < 0.35) L.puff = true; else L.oiled = rnd() < 0.5;
        if (rnd() < 0.2) L.specs = '#2a2a36';
        if (rnd() < 0.15) { L.hat = 'backcap'; L.hatColor = pick(['#c03030', '#2a5cb8', '#f2f0ea']); }
        spd = TUNE.pedSpd.man + 4; lang = dk ? 'dk' : 'any';
        break;
      }
      case 'college': { // Osmania: jeans, kurtas, files to the chest
        if (rnd() < 0.45) { L.kind = 'woman'; L.shirt = pick(SAREE); L.pants = pick(['#efe9dc', '#2a3a5a']); L.dupatta = pick(SAREE); }
        else { L.kind = 'man'; L.shirt = pick(SHIRT_LOUD.concat(SHIRT_PALE)); L.pants = pick(['#3a4a6a', '#2a3a5a']); if (rnd() < 0.3) L.puff = true; }
        L.prop = 'notebook'; if (rnd() < 0.2) L.specs = true;
        spd = TUNE.pedSpd.student; lang = 'any';
        break;
      }
      case 'office': { // formal shirt, lanyard ID (no logo), lunch bag
        L.kind = 'man'; L.shirt = pick(['#dfe8f2', '#f4f2ea', '#c8d8e8', '#e8dcc8']); L.pants = pick(['#3a3a4a', '#4a4a52', '#5a5a62']);
        L.lanyardDot = pick(['#2a5cb8', '#c03030', '#3a8a3a']); L.prop = 'packet'; if (rnd() < 0.4) L.specs = true;
        spd = TUNE.pedSpd.man + 4; lang = 'any';
        break;
      }
      case 'old': { // white kurta-pyjama or dhoti, walking stick, a cap
        L.kind = 'man'; L.shirt = '#f4f2ea'; L.pants = '#efe9dc'; L.hair = '#e8e4dc'; L.prop = rnd() < 0.65 ? 'stick' : null;
        L.hat = pick(['gandhi', 'topi', null]); L.hatColor = '#f4f2ea'; if (rnd() < 0.5) L.specs = 'round';
        if (dk) { L.hat = 'skull'; L.beard = rnd() < 0.5 ? '#c8642a' : '#e8e4dc'; }
        spd = TUNE.pedSpd.old;
        break;
      }
      case 'elder': { // old-city elders: white kurta, skull cap, henna-orange beard; sherwani on Fridays
        L.kind = 'man'; L.shirt = '#f4f2ea'; L.pants = '#f4f2ea'; L.hat = 'skull'; L.hatColor = '#f4f2ea';
        L.beard = rnd() < 0.55 ? '#c8642a' : rnd() < 0.5 ? '#e8e4dc' : '#2a201a'; if (rnd() < 0.4) L.longBeard = true;
        if (calDate().dow === 5 && rnd() < 0.6) L.shirt = pick(['#2a2a3a', '#3a2a2a', '#2a3a3a']);
        if (rnd() < 0.3) L.prop = 'stick';
        spd = TUNE.pedSpd.old + 6; lang = 'dk';
        break;
      }
      case 'porter': { // red shirt, brass armband, cloth on the head, a trunk
        L.kind = 'man'; L.shirt = '#c03030'; L.pants = '#5a4a3a'; L.towel = '#efe6d0'; L.prop = rnd() < 0.6 ? 'trunk' : null; L.badgeDot = '#c9a227';
        spd = TUNE.pedSpd.porter; lang = 'any';
        break;
      }
      case 'pilgrim': { // marigold garlands, coconuts, prasad bags
        if (rnd() < 0.6) { L.kind = 'aunty'; L.saree = pick(SAREE); L.border = '#f2c230'; L.blouse = U.shade(L.saree, 0.7); }
        else { L.kind = 'man'; L.shirt = '#f4f2ea'; L.pants = '#f4f2ea'; }
        L.prop = pick(['basket', 'tray', 'clothbag']);
        spd = TUNE.pedSpd.aunty; lang = 'te';
        break;
      }
      case 'worker': { // HITEC City building sites
        if (rnd() < 0.35) { L.kind = 'saree'; L.saree = pick(['#c8a020', '#d8402a', '#3a6a9a']); L.prop = 'basket'; }
        else { L.kind = 'man'; L.shirt = pick(['#7a6a5a', '#5a6a7a', '#8a5a3a']); L.hat = 'backcap'; L.hatColor = '#f2c230'; }
        spd = TUNE.pedSpd.man - 6; lang = 'te';
        break;
      }
      case 'vendor': {
        L.kind = rnd() < 0.5 ? 'man' : 'uncle'; L.lungi = pick(LUNGI); L.towel = pick(['#efe6d0', '#c03030']); L.prop = 'basket';
        spd = TUNE.pedSpd.vendor + 8;
        break;
      }
      case 'police': {
        L.kind = 'man'; L.shirt = '#f4f2ea'; L.pants = '#a89060'; L.cap = 'police'; if (rnd() < 0.5) L.belly = true;
        spd = TUNE.pedSpd.police; lang = 'any';
        break;
      }
      default: { // 'man'
        L.kind = 'man'; L.shirt = rnd() < 0.5 ? pick(SHIRT_PALE) : pick(SHIRT_LOUD);
        if (rnd() < 0.2) L.prop = pick(['clothbag', 'packet', 'radio']);
        if (dk && rnd() < 0.4) { L.hat = 'skull'; L.hatColor = '#f4f2ea'; if (rnd() < 0.5) L.beard = '#2a201a'; }
        if (rnd() < 0.15) L.oiled = true;
      }
    }
    return { look: L, lang, spd: spd * rr(0.88, 1.1) };
  }
  /** Role by district style and time (systems §11.2 shares). */
  function pickRole(style, did) {
    const m = mins();
    const schoolT = schoolDay() && (inHours([7 * 60 + 30, 9 * 60], m) || inHours([15 * 60 + 30, 17 * 60], m));
    let w;
    switch (style) {
      case 'oldcity': w = { aunty: 18, woman: 8, elder: 12, uncle: 10, youth: 14, kid: 10, lungi: 10, man: 10, old: 4, student: schoolT ? 8 : 1, vendor: 3 }; break;
      case 'market': w = { uncle: 14, aunty: 16, youth: 14, woman: 8, man: 14, student: schoolT ? 8 : 2, kid: 4, old: 5, vendor: 4, lungi: 4 }; break;
      case 'colonial': w = { uncle: 14, office: 10, aunty: 12, man: 14, youth: 8, woman: 8, student: schoolT ? 8 : 2, old: 6 }; break;
      case 'posh': w = { office: 20, man: 14, woman: 14, aunty: 8, youth: 8, kid: 4, old: 4 }; break;
      case 'cantonment': w = { uncle: 14, aunty: 14, man: 14, youth: 10, woman: 8, student: schoolT ? 12 : 3, kid: 6, old: 6, lungi: 4 }; break;
      case 'hitec': w = { office: 50, worker: 30, man: 10, youth: 6, lungi: 4 }; break;
      case 'rocky': w = { lungi: 10, kid: 10, man: 16, youth: 10, aunty: 10, uncle: 8, old: 6, college: did === 'osmania' ? 30 : 0 }; break;
      case 'osmania': w = { college: 40, man: 10, youth: 10, aunty: 6, uncle: 6, lungi: 4 }; break;
      default: w = { student: schoolT ? 18 : 3, kid: 14, uncle: 12, lungi: 6, aunty: 20, man: 10, youth: 8, old: 6, woman: 4 }; // colony
    }
    if (night()) { w.kid = (w.kid || 0) * 0.2; w.student = 0; w.aunty = (w.aunty || 0) * 0.5; w.youth = (w.youth || 0) * 1.5; }
    if (did === 'ameerpet') w.college = (w.college || 0) + 25;
    return wpick(w) || 'man';
  }

  /* ================================================================ people sprites (cached) */
  const PRES = 2.5, PSZ = 48, PH = PSZ / 2;
  const sprMap = new WeakMap();
  let sprMade = 0;
  function personFrame(look, fi) {
    let fr = sprMap.get(look);
    if (!fr) { fr = new Array(17); sprMap.set(look, fr); }
    let c = fr[fi];
    if (c) return c;
    c = N.render.makeCanvas(PSZ, PSZ);
    const g = c.getContext('2d');
    g.setTransform(PRES, 0, 0, PRES, PH, PH);
    const anim = fi === 0 ? { phase: 0, speed: 0, run: false } : { phase: (((fi - 1) % 8) / 8) * TAU, speed: 1, run: fi > 8 };
    try { N.people.draw(g, look, anim); } catch (e) { N.err('traffic.person', e); }
    fr[fi] = c; sprMade++;
    return c;
  }
  function frameOf(anim) {
    if (!anim || anim.speed < 0.15) return 0;
    const ph = ((anim.phase % TAU) + TAU) % TAU;
    return 1 + (Math.floor((ph / TAU) * 8) % 8) + (anim.run ? 8 : 0);
  }
  function blitPerson(ctx, look, x, y, angle, anim, h) {
    const R = N.render, k = R.k(h == null ? 0.6 : h);
    const img = personFrame(look, frameOf(anim));
    const c = (Math.cos(angle) * k) / PRES, s = (Math.sin(angle) * k) / PRES;
    ctx.setTransform(c, s, -s, c, R.sx(x, k), R.sy(y, k));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, -PH, -PH);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ================================================================ state */
  const T = {
    vehicles: [], peds: [], animals: [], flocks: [], constables: [], boats: [],
    fillT: 0, hornLog: [], barkT: 0, lastBark: '', ms: 0, statT: 0, targets: { veh: 0, ped: 0, ani: 0 }, targetT: 0,
    zoneT: 0, zoneList: [], ready: false, cleanT: 0,
  };

  /* ================================================================ vehicles: AI */
  const F_ENTRY = 1, F_BOX = 2, F_EXIT = 4, F_STOP = 8;
  function wp(x, y, lim, node, f, extra) { const o = { x, y, lim: lim == null ? 1e9 : lim, node: node == null ? -1 : node, f: f || 0 }; if (extra) Object.assign(o, extra); return o; }
  function junctionR(n) { return n.deg >= 3 ? n.w / 2 + 4 : 5; }
  function cornerLim(th) { const a = Math.abs(th); return a < 0.2 ? 1e9 : 14 + 46 * (1 - Math.min(1, a / 1.8)); }
  function vclass(v) { return v.T.cls; }
  function edgeAllowed(v, e) {
    const c = vclass(v);
    if (e.kind === 'path') return false;
    if (e.kind === 'lane' && (c === 'heavy' || v.type === 'ambassador' || v.type === 'govt_ambassador')) return false;
    if (v.tr && v.tr.pursuit) return true;
    const mid = { x: (RI.nodes[e.a].x + RI.nodes[e.b].x) / 2, y: (RI.nodes[e.a].y + RI.nodes[e.b].y) / 2 };
    if (closedAt(mid.x, mid.y)) return false;
    return true;
  }
  function laneOff(v, e) {
    const lanes = e.lanes || 1, c = vclass(v), tr = v.tr;
    let lane = lanes > 1 ? (tr.fast ? 0 : 1) : 0;
    let off = laneOffset(e, lane);
    if (c === 'bike') off += 3.5; else if (c === 'auto') off += 1;
    const half = v.T.d / 2;
    const maxOff = e.w / 2 - half - 0.5, minOff = half * 0.6;
    if (maxOff > minOff) off = clamp(off, minOff, maxOff); else off = e.w / 4;
    return off;
  }
  function chooseNext(v, A, B) {
    const tr = v.tr, opts = [];
    const p = N.player, c = vclass(v);
    for (const l of B.links) {
      const e = RI.edges[l.edge];
      if (!edgeAllowed(v, e)) continue;
      const C = RI.nodes[l.to];
      let w = 1;
      if (c === 'heavy') w = { arterial: 3, bund: 2.5, bridge: 3, street: 0.8, lane: 0 }[e.kind] || 1;
      else if (c === 'car') w = { arterial: 2, bund: 2, bridge: 2, street: 2, lane: 0.35 }[e.kind] || 1;
      else if (c === 'auto') w = { arterial: 1.5, bund: 1.5, bridge: 1.5, street: 2, lane: 0.9 }[e.kind] || 1;
      else w = { arterial: 1, bund: 1.2, bridge: 1, street: 2, lane: 1.5 }[e.kind] || 1;
      if (C === A) w *= 0.02;
      // keep traffic near the player (the rest despawns anyway)
      if (p && Math.hypot(C.x - p.x, C.y - p.y) > viewR() + TUNE.despawnVeh * 0.8) w *= 0.3;
      // straight on is a little more likely than turning
      const g1 = geom(A, B), g2 = geom(B, C), dot = g1.ux * g2.ux + g1.uy * g2.uy;
      if (dot > 0.85) w *= 1.6;
      if (w > 0) opts.push([C, w]);
    }
    if (!opts.length) {
      // dead end (or everything closed): U-turn if that is allowed at all
      const back = edgeAny(B, A);
      return back && B.links.some((l) => l.to === A.id) ? A : null;
    }
    let tot = 0; for (const o of opts) tot += o[1];
    let r = rnd() * tot;
    for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
    return opts[0][0];
  }
  function startRoute(v, A, B, d0) {
    const tr = v.tr, e = edgeAny(A, B), g = geom(A, B);
    tr.A = A; tr.B = B; tr.e = e; tr.g = g; tr.off = laneOff(v, e);
    tr.wp = [];
    const p0 = lanePt(A, g, clamp(d0, 0, g.L), tr.off);
    tr.wp.push(wp(p0.x, p0.y));
    tr.i = 1;
    tr.inBox = -1;
    addStops(v, A, B, e, g, tr.off, clamp(d0, 0, g.L) + 30);
    extend(v);
  }
  /** Append the turn at tr.B onto the next edge (X before the junction, corner, E after it). */
  function extend(v) {
    const tr = v.tr, A = tr.A, B = tr.B;
    const C = chooseNext(v, A, B);
    const g1 = tr.g, off1 = tr.off;
    if (!C) { // nowhere to go: end of the line (stop at the end, then despawn)
      const end = lanePt(A, g1, g1.L - 4, off1);
      tr.wp.push(wp(end.x, end.y, 0, -1, F_STOP, { dead: true }));
      tr.deadEnd = true;
      return false;
    }
    const e2 = edgeAny(B, C), g2 = geom(B, C), off2 = laneOff(v, e2);
    let r = junctionR(B);
    r = Math.min(r, g1.L * 0.45, g2.L * 0.45);
    const X = lanePt(A, g1, g1.L - r, off1), E = lanePt(B, g2, r, off2);
    const cross = g1.ux * g2.uy - g1.uy * g2.ux, dot = g1.ux * g2.ux + g1.uy * g2.uy;
    const th = Math.atan2(cross, dot);
    const junc = B.deg >= 3;
    const cl = cornerLim(th);
    const jl = junc ? Math.min(cl, tr.cruise * TUNE.junctionSlow + 12) : cl;
    tr.wp.push(wp(X.x, X.y, jl, junc ? B.id : -1, junc ? F_ENTRY : 0, { ang: Math.atan2(g1.uy, g1.ux) }));
    if (Math.abs(th) > 0.2) {
      let K = null;
      if (Math.abs(th) > 2.6) K = { x: B.x - g1.uy * off1 * 0.2, y: B.y + g1.ux * off1 * 0.2 }; // U-turn round the node
      else {
        const det = cross;
        if (Math.abs(det) > 0.12) {
          const dx = E.x - X.x, dy = E.y - X.y;
          const t = (dx * g2.uy - dy * g2.ux) / det, s = (g1.ux * dy - g1.uy * dx) / det;
          if (t > -2 && s > -2 && t < r * 3 + 30 && s < r * 3 + 30) K = { x: X.x + g1.ux * t, y: X.y + g1.uy * t };
        }
      }
      if (!K) K = { x: (X.x + E.x) / 2, y: (X.y + E.y) / 2 };
      if (RI.podium && RI.podium.has(B.id)) { // keep clear of the podium in the middle
        const kx = K.x - B.x, ky = K.y - B.y, kd = Math.hypot(kx, ky);
        if (kd < 11) { const f = 11 / (kd || 1); K = { x: B.x + (kd ? kx * f : -g1.uy * 11), y: B.y + (kd ? ky * f : g1.ux * 11) }; }
      }
      for (const t of [0.34, 0.67]) {
        const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        tr.wp.push(wp(a * X.x + b * K.x + c * E.x, a * X.y + b * K.y + c * E.y, cl, junc ? B.id : -1, junc ? F_BOX : 0));
      }
    }
    const crE = cruiseFor(v, e2);
    tr.wp.push(wp(E.x, E.y, crE, junc ? B.id : -1, junc ? F_EXIT : 0, { cr: crE }));
    addStops(v, B, C, e2, g2, off2, r + 8);
    tr.A = B; tr.B = C; tr.e = e2; tr.g = g2; tr.off = off2;
    return true;
  }
  /** Bus stops on edge A->B on the left of travel, from distance dMin up to short of B's junction mouth. */
  function addStops(v, A, B, e, g, off, dMin) {
    const tr = v.tr;
    if (v.type !== 'bus' || tr.pursuit) return;
    const st = RI.stops.get(e.id);
    if (!st) return;
    const forward = e.a === A.id, dMax = g.L - Math.max(20, Math.min(junctionR(B), g.L * 0.45) + 6);
    const list = [];
    for (const s of st) {
      const t = forward ? s.t : 1 - s.t, onLeft = forward ? s.leftOfAB : !s.leftOfAB;
      if (!onLeft) continue;
      const d = t * g.L;
      if (d < dMin || d > dMax) continue;
      list.push({ d, s });
    }
    list.sort((a, b) => a.d - b.d);
    for (const { d, s } of list) {
      const q = lanePt(A, g, d, Math.min(e.w / 2 - v.T.d / 2 + 2, off + 4));
      tr.wp.push(wp(q.x, q.y, 0, -1, F_STOP, { stop: TUNE.busStop, place: s.place.id }));
    }
  }

  /** Nearest thing ahead of v inside its corridor: {e, gap, sp, ly, er, static}. */
  function sense(v, dirx, diry) {
    const T2 = v.T, sp = Math.max(0, v.speed || 0);
    if (dirx == null) { dirx = Math.cos(v.angle); diry = Math.sin(v.angle); }
    const look = 24 + sp * 0.9 + T2.w / 2;
    const cx = v.x + dirx * look * 0.5, cy = v.y + diry * look * 0.5;
    const near = N.entities.query(cx, cy, look * 0.5 + 12);
    const hw = T2.d / 2 + 1;
    const tr = v.tr;
    const onRoad = roadSurf(N.world.surfaceAt(v.x, v.y));
    let best = null, bg = Infinity;
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (e === v || !e.alive || e.hidden || e === v.driver) continue;
      let er, elen, esp;
      let thr = 0;
      if (e.kind === 'vehicle') {
        if (e.T.mode !== T2.mode) continue;
        if (tr && tr.ghost > 0 && e.tr && tr.ghostOf === e) continue;
        // parked bikes / cars on the footpath are not in the way of road traffic
        if (!e.tr && e.driver !== N.player && onRoad && (e.asleep || Math.abs(e.speed || 0) < 2) && !roadSurf(N.world.surfaceAt(e.x, e.y))) continue;
        const rel = U.angleDiff(Math.atan2(diry, dirx), e.angle), ar = Math.abs(rel);
        const ca = Math.abs(Math.cos(rel)), sa = Math.abs(Math.sin(rel));
        elen = (e.T.w * ca + e.T.d * sa) / 2; er = (e.T.w * sa + e.T.d * ca) / 2;
        esp = e.vx * dirx + e.vy * diry;
        if (ar > 2.4) thr = (T2.d / 2 + e.T.d / 2) * 0.55;            // oncoming: only a real head-on
        else if (ar < 0.7) thr = T2.d / 2 + e.T.d / 2 * 0.85 + 0.3;    // same way: the next lane is fine
        else thr = hw + er;                                               // crossing
      } else if (e.kind === 'ped' || e.kind === 'npc' || e.kind === 'animal') {
        if (e.vehicle) continue;
        if ((e.noCollide || !e.solid) && !e.blocksTraffic) continue;
        if (e.roofH || e.level) continue;
        // people and dogs on the footpath beside the road are not in the way
        if (onRoad && !roadSurf(N.world.surfaceAt(e.x, e.y))) continue;
        // the constable on a podium stands above the traffic
        if (onPodium(e)) continue;
        er = (e.r || 4) * (e.kind === 'animal' ? 1 : 0.8); elen = er; esp = (e.vx || 0) * dirx + (e.vy || 0) * diry;
        thr = hw + er;
      } else continue;
      const dx = e.x - v.x, dy = e.y - v.y;
      const lx = dx * dirx + dy * diry;
      if (lx <= T2.w * 0.2) continue; // beside or behind: the physics sorts that out
      const ly = -dx * diry + dy * dirx;
      if (Math.abs(ly) > thr) continue;
      const gap = lx - T2.w / 2 - elen;
      if (gap < bg) { bg = gap; best = { e, gap, sp: esp, ly, er, elen, lx }; }
    }
    return best;
  }
  const roadSurf = (s) => s === N.SURF.ROAD || s === N.SURF.BRIDGE;
  function onPodium(e) {
    const pods = N.world.podiums;
    if (!pods) return false;
    for (let i = 0; i < pods.length; i++) { const p = pods[i]; if (Math.abs(p.x - e.x) < 8 && Math.abs(p.y - e.y) < 8) return true; }
    return false;
  }
  function isStatic(e) {
    if (e.kind === 'animal') return e.species === 'cow' ? !e.moving : Math.hypot(e.vx || 0, e.vy || 0) < 4;
    if (e.kind === 'vehicle') return !e.tr && (e.asleep || Math.abs(e.speed || 0) < 2);
    if (e === N.player) return Math.hypot(e.vx || 0, e.vy || 0) < 6;
    return Math.hypot(e.vx || 0, e.vy || 0) < 4;
  }
  /** Signal / box rule at junction node J for a vehicle approaching with heading ang. */
  function mustYield(v, J, ang) {
    const pod = RI.podium.get(J.id);
    if (pod && pod.active) {
      const axis = Math.abs(Math.cos(ang - pod.axisA)) > 0.7071 ? 0 : 1;
      if (pod.green !== axis) return 'signal';
    }
    const r = J.w / 2 + 6;
    const near = N.entities.query(J.x, J.y, r, isVeh);
    for (const o of near) {
      if (o === v || !o.alive) continue;
      const inBox = o.tr ? o.tr.inBox === J.id : Math.hypot(o.x - J.x, o.y - J.y) < r - 4 && Math.abs(o.speed || 0) > 4;
      if (!inBox) continue;
      const da = Math.abs(U.angleDiff(o.angle, ang));
      if (da < 0.5) continue;
      return 'box';
    }
    return null;
  }

  function honk(v, why) {
    const tr = v.tr;
    if (tr && tr.hornCD > 0) return false;
    if (tr ? tr.quiet : quietAt(v.x, v.y)) return false; // nobody honks outside a temple or a mosque
    const now = N.time.real || 0;
    while (T.hornLog.length && now - T.hornLog[0] > 2) T.hornLog.shift();
    if (T.hornLog.length >= TUNE.hornBudget) return false;
    T.hornLog.push(now);
    if (tr) tr.hornCD = rr(TUNE.hornEvery[0], TUNE.hornEvery[1]);
    N.emit('horn', { x: v.x, y: v.y, type: v.type, vehicle: v, who: v.driver || null, dur: v.T.cls === 'bike' ? 0.2 : rr(0.25, 0.5), ai: true, why: why || null });
    N.emit('traffic:honk', { vehicle: v, why });
    return true;
  }

  function trafficCtl(v, dt) {
    const tr = v.tr, ctl = v.ctl, T2 = v.T;
    if (!tr || !tr.wp) { ctl.throttle = 0; ctl.brake = true; return; }
    tr.t += dt;
    if (tr.hornCD > 0) tr.hornCD -= dt;
    if (tr.ghost > 0) tr.ghost -= dt;
    if (tr.yieldT > 0) tr.yieldT -= dt;
    // respect zones nearby (checked twice a second): no horn, crawl past
    tr.quietT = (tr.quietT || 0) - dt;
    if (tr.quietT <= 0) { tr.quietT = 0.5; tr.quiet = T2.mode !== 'boat' && quietAt(v.x, v.y); }
    // boats wander the lake
    if (T2.mode === 'boat') { boatCtl(v, dt); return; }
    // keep enough route ahead
    let guard = 0;
    while (tr.wp.length - tr.i < 6 && !tr.deadEnd && guard++ < 4) { if (!extend(v)) break; }
    const W = tr.wp;
    // advance past reached waypoints
    while (tr.i < W.length) {
      const a = W[tr.i - 1], b = W[tr.i];
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      const t = ((v.x - a.x) * dx + (v.y - a.y) * dy) / L2;
      const db = Math.hypot(b.x - v.x, b.y - v.y);
      if ((t >= 1 || db < 3) && !(b.f & F_STOP && tr.stopT == null && db > 2.5)) { passWaypoint(v, tr, b); tr.i++; continue; }
      if (b.f & F_STOP && tr.stopT != null) break;
      break;
    }
    if (tr.i >= W.length) { // ran out (dead end): stop, then despawn when nobody sees
      ctl.throttle = 0; ctl.brake = true; tr.deadT = (tr.deadT || 0) + dt;
      if (tr.deadT > 3 && !N.render.inView(v.x, v.y, 60)) despawnVehicle(v);
      return;
    }
    if (tr.i > 14) { W.splice(0, tr.i - 1); tr.i = 1; }
    const sp = v.speed || 0, asp = Math.abs(sp);
    // pure pursuit: a look-ahead point along the waypoint polyline
    const look = 9 + asp * 0.32 + T2.w * 0.3;
    let j = tr.i, a = W[j - 1], b = W[j];
    let dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    let t = clamp(((v.x - a.x) * dx + (v.y - a.y) * dy) / (L * L), 0, 1);
    let px = a.x + dx * t, py = a.y + dy * t;
    let rem = look, tx = b.x, ty = b.y, segUx = dx / L, segUy = dy / L;
    // off-route? (pushed by a crash) -> rebuild from the nearest node
    const offD = Math.hypot(v.x - px, v.y - py);
    if (offD > 46) { reroute(v); return; }
    for (;;) {
      const sl = Math.hypot(b.x - px, b.y - py);
      if (sl >= rem || j >= W.length - 1 || (b.f & F_STOP)) {
        const k = Math.min(rem, sl) / (sl || 1);
        tx = px + (b.x - px) * k; ty = py + (b.y - py) * k;
        if (sl > 0.01) { segUx = (b.x - px) / sl; segUy = (b.y - py) / sl; }
        break;
      }
      rem -= sl; px = b.x; py = b.y; j++; a = b; b = W[j];
    }
    // lateral shift (swerve / horn sidestep / cycle wobble): positive = towards the left kerb
    const latT = (tr.swerve ? tr.swerve.lat : 0) + (tr.yieldT > 0 ? TUNE.hornSidestep : 0) + (tr.pull || 0);
    tr.lat += clamp(latT - tr.lat, -12 * dt, 12 * dt);
    let lat = tr.lat;
    if (T2.cls === 'bike' && asp < 40 && T2.pedal) lat += Math.sin(tr.t * 2.3 + v.seed * 0.01) * TUNE.wobble * (1 - asp / 40);
    tx += segUy * lat; ty += -segUx * lat;
    // ---- speed planning
    let want = tr.cruise * (tr.yieldT > 0 ? 0.55 : 1);
    if (tr.quiet) want = Math.min(want, TUNE.respectCruise);
    const dec = T2.brake * 0.42;
    let acc = Math.hypot(W[tr.i].x - v.x, W[tr.i].y - v.y);
    let stopping = false;
    for (let k = tr.i; k < Math.min(W.length, tr.i + 7); k++) {
      if (k > tr.i) acc += Math.hypot(W[k].x - W[k - 1].x, W[k].y - W[k - 1].y);
      const q = W[k];
      if (acc > 160) break;
      let lim = q.lim;
      if (q.f & F_ENTRY && tr.cleared !== q.node && acc < 70) {
        const J = RI.nodes[q.node];
        const why = J ? mustYield(v, J, q.ang) : null;
        if (why) {
          lim = 0;
          if (acc < 10 && asp < 3) {
            tr.waitT = (tr.waitT || 0) + dt;
            if (why === 'box' && tr.waitT > TUNE.yieldMax) { tr.cleared = q.node; tr.waitT = 0; if (rnd() < 0.5) honk(v, 'junction'); }
            if (why === 'signal' && tr.waitT > 24) { tr.cleared = q.node; tr.waitT = 0; }
          }
          stopping = true;
        } else if (acc < 14) tr.cleared = q.node;
      }
      if (q.f & F_STOP) {
        if (q.dead) lim = 0;
        else if (tr.stopDone !== q) lim = 0;
      }
      if (lim < 1e8) {
        const vmax = Math.sqrt(lim * lim + 2 * dec * Math.max(0, acc - (lim === 0 ? 2.5 : 0)));
        if (vmax < want) want = vmax;
      }
    }
    // a stop (bus stop / pull-over) in progress
    if (tr.stopT != null) {
      tr.stopT -= dt; want = 0;
      if (tr.stopT <= 0) { tr.stopT = null; tr.stopDone = tr.stopAt; tr.stopAt = null; tr.pull = 0; }
    }
    // occasional auto pull-over (a passenger gets out, systems §3.4)
    if (v.type === 'auto' && !tr.pursuit && tr.stopT == null && asp > 20 && tr.e && tr.e.kind !== 'arterial') {
      if (rnd() < (TUNE.autoPullover / 60) * dt * 2) { tr.pull = 4; tr.pullT = 1.2; }
    }
    if (tr.pullT != null) {
      tr.pullT -= dt; want = Math.min(want, Math.max(0, tr.pullT) * 25);
      if (tr.pullT <= 0 && asp < 3) { tr.pullT = null; tr.stopT = TUNE.pulloverSecs; tr.stopAt = null; dropPassenger(v); }
    }
    // ---- following / obstacles
    const dl = Math.hypot(tx - v.x, ty - v.y) || 1;
    // off-screen (kinematic) vehicles look ahead 4x less often
    let ob;
    if (v.kin && tr.senseT > 0) { tr.senseT -= dt; ob = tr.ob; if (ob && !ob.e.alive) ob = null; }
    else { ob = sense(v, (tx - v.x) / dl, (ty - v.y) / dl); tr.senseT = v.kin ? 0.06 : 0; }
    tr.ob = ob;
    let blocked = false;
    if (ob) {
      const s0 = TUNE.followGap + asp * 0.2;
      const vf = Math.max(0, ob.sp) + (ob.gap - s0) * TUNE.followK;
      if (vf < want) { want = Math.max(0, vf); }
      if (ob.gap < 1.2) want = 0;
      blocked = want < 4 && tr.cruise > 10;
      // two vehicles nose to nose inside the same junction, or tangled after a bump: the lower id goes
      if (blocked && ob.e.tr && tr.blockT > 1.2 && v.id < ob.e.id && ((ob.e.tr.inBox >= 0 && ob.e.tr.inBox === tr.inBox) || ob.gap < -1.5)) { tr.ghost = 1.5; tr.ghostOf = ob.e; }
      // round a lying cow / parked vehicle / standing person
      if (blocked && !tr.swerve && tr.blockT > TUNE.swerveAfter && isStatic(ob.e)) trySwerve(v, tr, ob, segUx, segUy);
    }
    if (tr.swerve) {
      want = Math.min(want, Math.max(TUNE.swerveSpeed, ob && ob.e === tr.swerve.e ? 0 : TUNE.swerveSpeed));
      tr.swerve.t -= dt;
      const se = tr.swerve.e;
      const passed = !se.alive || ((se.x - v.x) * Math.cos(v.angle) + (se.y - v.y) * Math.sin(v.angle) < -(T2.w / 2 + (se.r || 6) + 4));
      if (passed || tr.swerve.t <= 0) tr.swerve = null;
    }
    if (blocked) {
      tr.blockT += dt;
      if (tr.blockT > 10 && !N.render.inView(v.x, v.y, 60)) { despawnVehicle(v); return; }
      if (!tr.swerve && tr.blockT > 4 && ob.e.kind === 'vehicle' && ob.e.tr && ob.e.tr.blockT > 3) trySwerve(v, tr, ob, segUx, segUy);
      if (tr.blockT > TUNE.hornAfter && (ob.e === N.player || ob.e.kind !== 'vehicle' || !ob.e.tr || ob.e.tr.blockT < 0.5)) honk(v, 'blocked');
    } else tr.blockT = Math.max(0, tr.blockT - dt * 2);
    void stopping;
    // ---- steering + pedals
    const diff = U.angleDiff(v.angle, Math.atan2(ty - v.y, tx - v.x));
    if (tr.rev > 0) {
      tr.rev -= dt; ctl.brake = false; ctl.handbrake = false; ctl.throttle = -0.6; ctl.steer = clamp(-diff * 2, -1, 1);
      return;
    }
    if (Math.abs(diff) > 1.1) want = Math.min(want, 22);
    else if (Math.abs(diff) > 0.5) want = Math.min(want, 45);
    ctl.steer = clamp(diff * 2.4, -1, 1);
    ctl.handbrake = false;
    if (want < 0.6 && asp < 2) { ctl.throttle = 0; ctl.brake = true; }
    else if (sp < want - 2) { ctl.brake = false; ctl.throttle = clamp((want - sp) / 18, 0.08, 1); }
    else if (sp > want + 10) { ctl.brake = sp > want + 35; ctl.throttle = ctl.brake ? 0 : -clamp((sp - want) / 40, 0.15, 1); }
    else if (sp > want + 2) { ctl.brake = false; ctl.throttle = 0; }
    else { ctl.brake = false; ctl.throttle = 0.04; }
    // stuck?
    tr.chk -= dt;
    if (tr.chk <= 0) {
      tr.chk = 1.2;
      const moved = Math.hypot(v.x - tr.cx, v.y - tr.cy); tr.cx = v.x; tr.cy = v.y;
      if (moved < 2.5 && want > 15) {
        tr.stuck++;
        tr.rev = 0.8;
        if (tr.stuck >= 3) { if (!N.render.inView(v.x, v.y, 60)) despawnVehicle(v); else { tr.stuck = 0; reroute(v); } }
      } else tr.stuck = 0;
    }
  }
  function passWaypoint(v, tr, q) {
    if (q.cr) tr.cruise = q.cr;
    if (q.f & F_ENTRY) { tr.inBox = q.node; tr.cleared = q.node; tr.waitT = 0; }
    else if (q.f & F_EXIT) { tr.inBox = -1; tr.cleared = -1; }
    if (q.f & F_STOP && !q.dead && tr.stopDone !== q) {
      tr.stopT = q.stop || TUNE.busStop; tr.stopAt = q;
      if (v.type === 'bus') busArrive(v, q);
    }
  }
  function trySwerve(v, tr, ob, ux, uy) {
    const need = (v.T.d / 2 + ob.er + 3) - Math.abs(ob.ly);
    if (need <= 0) return false;
    const pref = ob.ly > 0 ? 1 : -1; // obstacle on my right -> go left (+)
    for (const s of [pref, -pref]) {
      const lat = tr.lat + s * need;
      if (Math.abs(lat) > (tr.e ? tr.e.w * 0.75 : 24)) continue;
      // the passing line beside the obstacle must be drivable and free
      const px = ob.e.x + uy * s * (need + 1) * 1, py = ob.e.y - ux * s * (need + 1);
      if (!N.world.isDrivable(px, py) || N.world.collide(px, py, v.T.d / 2, 'drive').hit) continue;
      const others = N.entities.query(px + ux * 20, py + uy * 20, 26, isVeh);
      if (others.some((o) => o !== v && o !== ob.e && o.tr && Math.abs(U.angleDiff(o.angle, v.angle)) > 2)) continue;
      tr.swerve = { e: ob.e, lat, t: 6 };
      return true;
    }
    return false;
  }
  function reroute(v) {
    const tr = v.tr;
    const n = RI.nodes && N.world.roads.nearestNode(v.x, v.y);
    if (!n) { despawnVehicle(v); return; }
    const opts = n.links.map((l) => RI.nodes[l.to]).filter((C) => edgeAllowed(v, edgeAny(n, C)));
    if (!opts.length) { if (!N.render.inView(v.x, v.y, 60)) despawnVehicle(v); return; }
    // prefer the direction we're facing
    let best = opts[0], bd = -2;
    for (const C of opts) { const d = Math.cos(Math.atan2(C.y - n.y, C.x - n.x) - v.angle); if (d > bd) { bd = d; best = C; } }
    const g = geom(n, best);
    const d0 = clamp((v.x - n.x) * g.ux + (v.y - n.y) * g.uy, 0, g.L * 0.9);
    tr.swerve = null; tr.stopT = null; tr.deadEnd = false; tr.lat = 0;
    startRoute(v, n, best, d0);
  }

  function boatCtl(v, dt) {
    const tr = v.tr, ctl = v.ctl;
    if (!tr.goal || Math.hypot(tr.goal.x - v.x, tr.goal.y - v.y) < 30 || tr.t > tr.goalT) {
      tr.goal = lakePoint(v.x, v.y, 260) || tr.goal; tr.goalT = tr.t + rr(25, 45);
    }
    if (!tr.goal) { ctl.throttle = 0; ctl.brake = true; return; }
    const ahead = N.world.raycast(v.x, v.y, v.x + Math.cos(v.angle) * 40, v.y + Math.sin(v.angle) * 40, 'boat');
    let diff = U.angleDiff(v.angle, Math.atan2(tr.goal.y - v.y, tr.goal.x - v.x));
    if (ahead.hit) { diff = 1.4; tr.goal = null; }
    ctl.steer = clamp(diff * 1.8, -1, 1); ctl.brake = false; ctl.handbrake = false;
    ctl.throttle = Math.abs(diff) > 1 ? 0.25 : 0.5;
  }
  let lakePts = null;
  function lakePoint(x, y, maxD) {
    if (!lakePts) {
      lakePts = [];
      const w = ((N.WORLD_DATA && N.WORLD_DATA.water) || []).find((q) => q.id === 'hussain_sagar') || ((N.WORLD_DATA && N.WORLD_DATA.water) || [])[0];
      if (w && w.poly) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const p of w.poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        lakePts.bb = [x0, y0, x1, y1];
        for (let i = 0; i < 400 && lakePts.length < 60; i++) {
          const px = rr(x0, x1), py = rr(y0, y1);
          if (N.world.isWater(px, py) && !N.world.collide(px, py, 12, 'boat').hit) lakePts.push({ x: px, y: py });
        }
      }
    }
    const c = lakePts.filter((p) => Math.hypot(p.x - x, p.y - y) < maxD && Math.hypot(p.x - x, p.y - y) > 40 && !N.world.raycast(x, y, p.x, p.y, 'boat').hit);
    return c.length ? pick(c) : null;
  }

  /* ---------------------------------------------------------------- driver looks */
  function driverLook(type, style) {
    const dk = style === 'oldcity';
    const L = { kind: 'man', skin: skin(), hair: '#1a1412', shirt: pick(SHIRT_PALE), pants: pick(PANTS), cast: 'drv' };
    switch (type) {
      case 'auto': case 'yadagiri_auto': L.shirt = '#a08a5a'; L.pants = '#a08a5a'; if (rnd() < 0.5) L.towel = pick(['#c03030', '#efe6d0']); L.oiled = rnd() < 0.5; break;
      case 'bus': case 'lorry': L.shirt = type === 'bus' ? '#a08a5a' : pick(SHIRT_LOUD); L.pants = type === 'bus' ? '#a08a5a' : pick(PANTS); break;
      case 'cycle': return makeLook(pick(night() ? ['man', 'lungi', 'youth'] : ['student', 'man', 'kid', 'lungi', 'youth', 'uncle', 'student']), style).look;
      case 'ladiescycle': { const r = makeLook(rnd() < 0.6 && !night() ? 'student' : 'woman', style).look; if (r.kind === 'student') { r.girl = true; r.plaits = pick(RIBBON); } if (r.kind === 'burqa') r.kind = 'woman'; return r; }
      // the black Hero roadster: grown men only (the saddle is miles up) - the milkman on his dawn round
      // (white vest, lungi, towel), the office-goer (tucked-in shirt, tiffin), colony uncles; night shift at night
      case 'hero_cycle': case 'old_cycle': {
        const m = mins(), dawn = m >= 5 * 60 && m < 10 * 60;
        if (night()) { const r = makeLook(pick(['lungi', 'man', 'uncle']), style).look; r.rider = 'nightshift'; return r; }
        if (rnd() < (dawn ? 0.55 : 0.2)) {
          L.kind = 'uncle'; L.rider = 'milkman'; L.shirt = '#f4f2ea'; L.lungi = pick(['#efe9dc', '#efe9dc', '#2a5cb8', '#3a8a3a']);
          L.towel = pick(['#efe6d0', '#c03030']); L.hair = rnd() < 0.35 ? '#8a8680' : '#1a1412'; L.oiled = rnd() < 0.5;
          if (dk && rnd() < 0.3) { L.hat = 'skull'; L.hatColor = '#f4f2ea'; }
          return L;
        }
        if (rnd() < 0.55) { const r = makeLook('office', style).look; r.lanyardDot = null; r.rider = 'office'; r.oiled = rnd() < 0.6; return r; }
        const r = makeLook(rnd() < 0.6 ? 'uncle' : 'lungi', style).look; r.rider = 'uncle'; return r;
      }
      // the sporty Hercules: office-goers and young men on their way, schoolboys in uniform by day
      case 'hercules_cycle': case 'hercules_gears': {
        if (night()) { const r = makeLook(pick(['man', 'youth']), style).look; r.rider = 'man'; return r; }
        const q = rnd();
        if (q < 0.4) { const r = makeLook('office', style).look; r.lanyardDot = null; r.rider = 'office'; return r; }
        if (q < 0.7) { const r = makeLook('student', style).look; r.girl = false; r.plaits = null; r.rider = 'student'; return r; }
        const r = makeLook('youth', style).look; r.rider = 'youth'; return r;
      }
      // the Scooty: college girls with files on the footboard, women in salwar kameez, the odd aunty in a saree
      case 'scooty': case 'akka_scooty': {
        const q = night() ? 0.5 + rnd() * 0.5 : rnd();
        let r;
        if (q < 0.45) { r = makeLook('college', style).look; if (r.kind !== 'woman') { r.kind = 'woman'; r.shirt = pick(SAREE); r.pants = pick(['#efe9dc', '#2a3a5a']); r.dupatta = pick(SAREE); r.puff = false; } r.rider = 'college'; }
        else if (q < 0.85) { r = makeLook('woman', style).look; r.rider = 'woman'; }
        else { r = makeLook('aunty', style).look; r.rider = 'aunty'; }
        return r;
      }
      case 'luna': L.kind = 'man'; L.shirt = pick(SHIRT_PALE); L.hair = rnd() < 0.5 ? '#8a8680' : '#1a1412'; if (rnd() < 0.4) L.towel = '#efe6d0'; break;
      case 'rx100': return makeLook('youth', style).look;
      case 'rickshaw': L.kind = 'uncle'; L.lungi = pick(LUNGI); L.towel = pick(['#efe6d0', '#c03030']); break;
      default: if (dk && rnd() < 0.3) { L.hat = 'skull'; L.hatColor = '#f4f2ea'; } if (rnd() < 0.3) L.specs = true;
    }
    return L;
  }
  /**
   * Spawn weights for a district style: TUNE.mix for the classic types, overridden by every vehicle type
   * that carries its own TYPES[t].spawn table (Hero / Hercules cycles, the Scooty...). The generic
   * 'cycle' share gives way to the pedal types that now have their own weights (never below a quarter
   * of it: the BSAs and the hire cycles). opts: {kind: road edge kind, minutes, x, y}.
   */
  function typeWeights(style, opts) {
    opts = opts || {};
    const TY = (N.vehicles && N.vehicles.TYPES) || {};
    const mix = Object.assign({}, TUNE.mix[style] || TUNE.mix.colony);
    const st = TUNE.mix[style] ? style : 'colony';
    let pedalOwn = 0;
    for (const t in TY) {
      const sp = TY[t] && TY[t].spawn;
      if (!sp || typeof sp !== 'object') continue;
      const w = +sp[st] || 0;
      mix[t] = w;
      if (TY[t].pedal && t !== 'cycle') pedalOwn += w;
    }
    if (pedalOwn > 0 && mix.cycle > 0) mix.cycle = Math.max(mix.cycle * 0.25, mix.cycle - pedalOwn);
    const m = opts.minutes != null ? opts.minutes : mins();
    // late night (23:00-05:00): lorries double, buses thin out and every pedal type halves (ladies cycles x0.3)
    if (m >= 23 * 60 || m < 5 * 60) {
      mix.lorry = (mix.lorry || 0) * 2; mix.bus = (mix.bus || 0) * 0.2;
      for (const t in mix) if (TY[t] && TY[t].pedal) mix[t] *= t === 'ladiescycle' ? 0.3 : 0.5;
    }
    const kind = opts.kind;
    if (kind === 'lane') { mix.bus = 0; mix.lorry = 0; mix.ambassador = 0; mix.padmini = (mix.padmini || 0) * 0.3; mix.maruti800 = (mix.maruti800 || 0) * 0.4; }
    if (kind === 'arterial') { mix.rickshaw = (mix.rickshaw || 0) * 0.4; }
    if (opts.x != null) for (const ev of activeEvents(opts.x, opts.y)) if (ev.idolLorries) { if (TY.peacock_lorry) mix.peacock_lorry = (mix.peacock_lorry || 0) + 40; else mix.lorry = (mix.lorry || 0) + 40; }
    for (const t in mix) if (!TY[t]) delete mix[t];
    return mix;
  }
  function pickType(style, e, x, y) {
    const t = wpick(typeWeights(style, { kind: e && e.kind, x, y })) || 'auto';
    return N.vehicles.TYPES[t] ? t : 'auto';
  }

  /* ---------------------------------------------------------------- spawn / despawn */
  function spawnTrafficVehicle(force) {
    if (!RI.built || !N.vehicles || !N.vehicles.spawn) return null;
    const c = camC(), vr = viewR();
    const r0 = vr + TUNE.ringVeh[0], r1 = vr + TUNE.ringVeh[1];
    const n = ringNode(c.x, c.y, force ? Math.max(60, vr * 0.3) : r0, r1, (q) => q.links.length > 0);
    if (!n) return null;
    const link = pick(n.links);
    const B = RI.nodes[link.to], e = RI.edges[link.edge];
    if (!e || e.kind === 'path' || e.len < 34) return null;
    const d = edgeDistrict(n, B), style = styleOf(d);
    const type = pickType(style, e, n.x, n.y);
    const Ty = N.vehicles.TYPES[type];
    // a temporary vehicle-like stub to compute the lane (cars mostly in the inner lane, slow traffic keeps left)
    const fastP = Ty.cls === 'car' ? 0.6 : Ty.cls === 'auto' ? 0.3 : Ty.cls === 'bike' && !Ty.pedal ? 0.2 : 0;
    const stub = { T: Ty, type, tr: { fast: rnd() < fastP } };
    if (!edgeAllowed(stub, e)) return null;
    const g = geom(n, B), off = laneOff(stub, e);
    const d0 = clamp(e.len * rr(0.25, 0.65), 10, e.len - 10);
    const pos = lanePt(n, g, d0, off);
    if (!force && N.render.inView(pos.x, pos.y, 50)) return null;
    if (force && N.render.inView(pos.x, pos.y, -40) && Math.hypot(pos.x - N.player.x, pos.y - N.player.y) < 90) return null;
    if (closedAt(pos.x, pos.y)) return null;
    if (!N.world.isDrivable(pos.x, pos.y) || N.world.collide(pos.x, pos.y, Ty.d / 2, 'drive').hit) return null;
    if (N.entities.query(pos.x, pos.y, Ty.w / 2 + 16, (q) => q.kind === 'vehicle' || q === N.player || q.kind === 'animal' || (q.kind === 'ped' && roadSurf(N.world.surfaceAt(q.x, q.y)))).length) return null;
    const look = driverLook(type, style);
    let spawnType = type;
    if (type === 'ambassador' && style === 'colonial' && rnd() < TUNE.govtAmbassador * 6 && N.vehicles.TYPES.govt_ambassador) spawnType = 'govt_ambassador';
    const v = N.vehicles.spawn(spawnType, pos.x, pos.y, Math.atan2(g.uy, g.ux), { driver: { look, npc: true }, seed: (rnd() * 1e9) | 0 });
    if (!v) return null;
    setupTraffic(v, n, B, d0, stub.tr.fast, style);
    // pillions: families on Chetaks, friends on bikes, a kid on the cycle carrier
    try {
      if (N.vehicles.setPillion) {
        if (type === 'chetak' && rnd() < 0.45) N.vehicles.setPillion(v, makeLook('aunty', style).look);
        else if (type === 'rx100' && rnd() < 0.25) N.vehicles.setPillion(v, makeLook('youth', style).look);
        else if (type === 'cycle' && rnd() < 0.08) N.vehicles.setPillion(v, makeLook('kid', style).look);
      }
    } catch (err) { /* optional */ }
    return v;
  }
  function edgeDistrict(A, B) { return districtAt((A.x + B.x) / 2, (A.y + B.y) / 2); }
  function setupTraffic(v, A, B, d0, fast, style) {
    const T2 = v.T, e = edgeAny(A, B);
    const persona = v.type === 'auto' ? rr(0.95, 1.12) : T2.cls === 'heavy' ? rr(0.82, 0.95) : T2.pedal ? rr(0.7, 0.95) : rr(0.85, 1.08);
    v.tr = {
      t: 0, A, B, e, g: null, off: 0, wp: null, i: 1, lat: 0, swerve: null, stopT: null, stopAt: null, stopDone: null, pull: 0, pullT: null,
      cruise: 60, persona, fast: !!fast, hornCD: rr(0, 2), blockT: 0, waitT: 0, cleared: -1,
      inBox: -1, chk: 1.2, cx: v.x, cy: v.y, stuck: 0, rev: 0, yieldT: 0, ghost: 0, deadEnd: false, style, fare: rnd() < 0.5,
      idol: activeEvents(v.x, v.y).some((ev) => ev.idolLorries) && v.T.cls === 'heavy',
    };
    v.tr.cruise = cruiseFor(v, e);
    startRoute(v, A, B, d0);
    v.tr.cruiseBase = v.tr.cruise;
    v.controller = trafficCtl;
    v.trafficOwned = true;
    const sp = v.tr.cruise * 0.7;
    v.vx = Math.cos(v.angle) * sp; v.vy = Math.sin(v.angle) * sp; v.speed = sp;
    T.vehicles.push(v);
    return v;
  }
  /** Cruise speed of a vehicle on an edge (systems §3.4: arterial 0.75 x top cap 120, street 0.6 cap 95, ...). */
  function cruiseFor(v, e) {
    const tr = v.tr;
    const cr = TUNE.cruise[e.kind] || TUNE.cruise.street;
    let c = Math.min(cr[1], v.T.maxSpeed * cr[0]) * (tr ? tr.persona : 1);
    if (v.T.cls === 'heavy') c = Math.min(c, 92);
    if (v.T.pedal) c = Math.min(c, v.T.maxSpeed * 0.62);
    if (tr && tr.idol) c = Math.min(c, 30);
    if (tr && tr.pursuit && tr.pursuitCruise) c = tr.pursuitCruise;
    return c;
  }
  /* Off-screen traffic runs kinematically: it is taken out of N.vehicles.list (so vehicles.js does no
   * physics / collisions for it) and moved along its route by the same controller with a simple model;
   * it is handed back to vehicles.js before it can come into view. */
  const KIN_OUT = 70, KIN_IN = 40;
  function setKinematic(v, on) {
    const L = N.vehicles && N.vehicles.list;
    if (!L || !!v.kin === !!on) return;
    const i = L.indexOf(v);
    if (on) { if (i >= 0) L.splice(i, 1); v.kin = true; v.asleep = false; }
    else { if (i < 0 && v.alive) L.push(v); v.kin = false; v.okX = null; v.asleep = false; v.sleepT = 0; }
  }
  function kinStep(v, dt) {
    const T2 = v.T, ctl = v.ctl;
    try { trafficCtl(v, dt); } catch (e) { N.err('traffic.kin', e); }
    if (!v.alive || !v.kin) return;
    let sp = v.speed || 0;
    const thr = clamp(+ctl.throttle || 0, -1, 1);
    if (ctl.brake) sp = Math.max(0, sp - T2.brake * dt);
    else if (thr > 0.02) sp = Math.min(T2.maxSpeed, sp + T2.accel * thr * dt);
    else if (thr < -0.02) sp = Math.max(0, sp + T2.brake * thr * dt);
    else sp = Math.max(0, sp - T2.drag * dt);
    const turnF = clamp(sp / 30, 0.25, 1);
    v.angle = U.wrapAngle(v.angle + clamp(+ctl.steer || 0, -1, 1) * T2.turn * turnF * dt);
    const c = Math.cos(v.angle), s2 = Math.sin(v.angle);
    v.x += c * sp * dt; v.y += s2 * sp * dt;
    v.vx = c * sp; v.vy = s2 * sp; v.av = 0; v.speed = sp; v.slip = 0; v.throttle = thr;
    v.wheelPhase = (v.wheelPhase || 0) + sp * dt * 0.5;
  }
  function kinPass(dt) {
    for (const v of T.vehicles) {
      if (!v.alive || !v.tr || v.driver === N.player || v.T.mode === 'boat') { if (v.kin) setKinematic(v, false); continue; }
      if (v.kin) {
        if (N.render.inView(v.x, v.y, KIN_IN + v.T.w)) setKinematic(v, false);
        else kinStep(v, dt);
      } else if (!N.render.inView(v.x, v.y, KIN_OUT + v.T.w) && !v.bumpT) setKinematic(v, true);
    }
  }
  function despawnVehicle(v) {
    if (v.kin) setKinematic(v, false);
    const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1);
    if (v.driver === N.player) return;
    try { N.vehicles.remove(v); } catch (e) { v.alive = false; }
  }
  /** Stop controlling a vehicle (the player borrowed it, a story script wants it, ...). */
  function release(v, opts) {
    if (!v) return v;
    if (v.kin) setKinematic(v, false);
    const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1);
    const j = T.boats.indexOf(v); if (j >= 0) T.boats.splice(j, 1);
    if (v.controller === trafficCtl) v.controller = null;
    v.tr = null; v.trafficOwned = false;
    if (opts && opts.parked) v.parked = true;
    return v;
  }
  function dropPassenger(v) {
    if (!N.render.inView(v.x, v.y, 40) || T.peds.length >= caps().ped) return;
    const s = N.vehicles.exitSpot ? N.vehicles.exitSpot(v, 'walk') : null;
    if (!s) return;
    const ped = spawnPedAt(s.x, s.y, pickRole(v.tr.style), v.tr.style, { mode: 'walk' });
    if (ped) { ped.angle = v.angle + Math.PI / 2; ped.say = 0; }
  }
  /* ---------------------------------------------------------------- buses at stops */
  function busArrive(v, q) {
    N.emit('bus:stop', { vehicle: v, place: q.place || null });
    sfx('air_brake', { x: v.x, y: v.y, vol: 0.6 });
    if (rnd() < 0.6) sfx('conductor', { x: v.x, y: v.y });
    // waiting people board, a couple get off
    const door = { x: v.x + Math.cos(v.angle) * (v.T.w * 0.25) + Math.sin(v.angle) * (v.T.d / 2 + 4), y: v.y + Math.sin(v.angle) * (v.T.w * 0.25) - Math.cos(v.angle) * (v.T.d / 2 + 4) };
    let boarded = 0;
    for (const p of T.peds) {
      if (boarded >= 3 || p.down || p.hold || p.spotter) continue;
      if (p.zone && p.zone.kind === 'bus_stop' && Math.hypot(p.x - door.x, p.y - door.y) < 60) { p.mode = 'board'; p.boardV = v; p.tgt = door; boarded++; }
    }
    const n = rnd() < 0.7 ? 1 + ((rnd() * 2) | 0) : 0;
    for (let k = 0; k < n; k++) {
      if (T.peds.length >= caps().ped || !N.world.isWalkable(door.x, door.y)) break;
      spawnPedAt(door.x + rr(-3, 3), door.y + rr(-3, 3), pickRole(v.tr.style), v.tr.style, { mode: 'walk', delay: k * 0.6 });
    }
    if (q.place && rnd() < 0.3) { const near = T.peds.find((p) => p.zone && p.zone.place === q.place && !p.down); if (near) bark(near, 'bus'); }
  }

  /* ================================================================ pedestrians */
  class Ped extends N.Actor {
    constructor(o) {
      super({ kind: 'ped', x: o.x, y: o.y, r: 3.4, mass: 1, solid: true });
      this.amb = true; this.look = o.look; this.role = o.role; this.lang = o.lang || 'any'; this.style = o.style || 'colony';
      this.anim = { phase: rnd() * TAU, speed: 0, run: false };
      this.angle = o.angle != null ? o.angle : rnd() * TAU; this.spd = o.spd || 40;
      this.mode = o.mode || 'walk'; this.w = null; this.zone = o.zone || null; this.tgt = null;
      this.barkCD = rr(1, 5); this.knockT = 0; this.getupT = 0; this.dodgeT = 0; this.lookT = 0; this.idleT = o.delay || 0;
      this.thinkT = rnd() * 0.15; this.stuckT = 0; this.life = 0; this.ttl = rr(40, 110); this.down = false;
      this.nearT = 0; this.ranPast = 0; this.hornHits = null; this.umb = raining() && rnd() < 0.65 ? pick(['#1a1a22', '#2a2a6a', '#6a1a2a', '#2a5a3a']) : null;
      this.dust = 0; this.cart = o.cart || null; this.balloons = o.balloons || null; this.callT = rr(4, 10);
      this._fn = (ctx) => drawPed(ctx, this);
    }
    update(dt) { try { pedUpdate(this, dt); } catch (e) { N.err('traffic.ped', e); this.alive = false; } }
    draw() {
      const R = N.render;
      R.queue('actors', this.y, this._fn);
      if (this.cart || this.balloons || this.spotter || this.down) R.queue('sky', 0, this._skyFn || (this._skyFn = (ctx) => drawPedSky(ctx, this)));
    }
    onBump(other, info) { try { pedBumped(this, other, info); } catch (e) { N.err('traffic.pedBump', e); } }
  }
  function spawnPedAt(x, y, role, style, o) {
    o = o || {};
    if (!N.world.isWalkable(x, y)) { const f = N.world.findFree(x, y, 'walk', 8); if (!f) return null; x = f.x; y = f.y; }
    const L = o.look ? { look: o.look, lang: o.lang || 'any', spd: o.spd || 40 } : makeLook(role, style);
    const p = new Ped({ x, y, look: L.look, lang: L.lang, spd: L.spd, role, style, mode: o.mode || 'walk', zone: o.zone || null, angle: o.angle, delay: o.delay, cart: o.cart, balloons: o.balloons });
    if (p.mode === 'walk' && !attachNearestWalk(p)) { if (p.zone) p.mode = 'wander'; else return null; }
    N.entities.add(p);
    T.peds.push(p);
    return p;
  }
  function footOff(e, side) { const f = (N.world.FOOT && N.world.FOOT[e.kind]) || 0; return side * (f >= 4 ? e.w / 2 + f / 2 : e.w / 2 - 2.5); }
  function cornerR(n, e) { const f = (N.world.FOOT && N.world.FOOT[e.kind]) || 0; return n.deg >= 3 ? n.w / 2 + Math.max(4, f) : 2; }
  function attachWalk(p, A, B, side) {
    const e = edgeAny(A, B);
    if (!e) return false;
    p.w = { a: A, b: B, e, g: geom(A, B), side, off: footOff(e, side), cross: null, waitT: 0, jay: rnd() < TUNE.jaywalk && e.kind !== 'arterial' ? rr(0.3, 0.7) : null };
    return true;
  }
  function attachNearestWalk(p) {
    const ns = nodesNear(p.x, p.y, 220);
    let best = null, bd = 1e9;
    for (const n of ns) for (const eid of n.inc) {
      const e = RI.edges[eid];
      if (e.kind === 'path') continue;
      const A = RI.nodes[e.a], B = RI.nodes[e.b];
      const q = U.closestOnSeg(p.x, p.y, A.x, A.y, B.x, B.y);
      if (q.d2 < bd) { bd = q.d2; best = { e, A, B }; }
    }
    if (!best || bd > 120 * 120) return false;
    const { A, B } = best;
    const fwd = rnd() < 0.5;
    const a = fwd ? A : B, b = fwd ? B : A;
    const g = geom(a, b);
    const side = ((p.x - a.x) * g.uy - (p.y - a.y) * g.ux) >= 0 ? 1 : -1;
    attachWalk(p, a, b, side);
    p.mode = 'walk';
    return true;
  }
  function moveToward(p, tx, ty, speed, dt, arrive) {
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    let vx = 0, vy = 0;
    if (d > (arrive || 1.2)) { const s = Math.min(speed, d * 5); vx = (dx / d) * s; vy = (dy / d) * s; }
    // a vehicle right ahead (a stopped bus, a parked car): wait, then step round it
    if (vx || vy) {
      p.vbT = (p.vbT || 0) - dt;
      if (p.vbT <= 0) {
        p.vbT = 0.2;
        const sp = Math.hypot(vx, vy), ax = p.x + (vx / sp) * 7, ay = p.y + (vy / sp) * 7;
        p.vblock = !!(N.vehicles && N.vehicles.nearest && N.vehicles.nearest(ax, ay, 3.5));
      }
      if (p.vblock) {
        p.waitV = (p.waitV || 0) + dt;
        if (p.waitV < 1.5) { vx *= 0.05; vy *= 0.05; }
        else { const s2 = Math.hypot(vx, vy) || 1, side = (p.id & 1) ? 1 : -1; const nx = -vy / s2 * side, ny = vx / s2 * side; vx = nx * speed * 0.8 + vx * 0.2; vy = ny * speed * 0.8 + vy * 0.2; }
      } else p.waitV = 0;
    }
    const a = 1 - Math.exp(-dt * 8);
    p.vx += (vx - p.vx) * a; p.vy += (vy - p.vy) * a;
    integrate(p, dt);
    return d;
  }
  function integrate(p, dt) {
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    const c = N.world.collide(nx, ny, p.r, 'walk');
    if (!c.bad) {
      if (c.hit) { const dot = p.vx * c.nx + p.vy * c.ny; if (dot < 0) { p.vx -= dot * c.nx; p.vy -= dot * c.ny; } }
      p.x = c.x; p.y = c.y;
    }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 3 && p.lookT <= 0) { const ta = Math.atan2(p.vy, p.vx); p.angle += U.angleDiff(p.angle, ta) * Math.min(1, dt * 10); }
    p.anim.speed = Math.min(1, sp / 45); p.anim.run = sp > 62;
    p.anim.phase += sp * dt * (p.anim.run ? 0.2 : 0.26);
    return sp;
  }
  function faceTo(p, x, y, dt) { p.angle += U.angleDiff(p.angle, Math.atan2(y - p.y, x - p.x)) * Math.min(1, dt * 8); }

  function pedUpdate(p, dt) {
    p.life += dt;
    if (p.bumpT > 0) p.bumpT -= dt;
    if (p.barkCD > 0) p.barkCD -= dt;
    if (p.lookT > 0) p.lookT -= dt;
    if (p.dust > 0) p.dust -= dt;
    // knocked down (vehicles.js sets knockT and a velocity kick on a hit; bumps on foot too)
    if (p.knockT > 0) {
      if (!p.down) { p.down = true; p.dust = 0.6; p.vx = p.vx || 0; p.vy = p.vy || 0; }
      p.knockT -= dt;
      const f = Math.exp(-dt * 7); p.vx *= f; p.vy *= f;
      integrate(p, dt);
      p.anim.speed = 0;
      if (p.knockT <= 0) p.getupT = 0.7;
      return;
    }
    if (p.getupT > 0) {
      p.getupT -= dt; p.vx = p.vy = 0;
      if (p.getupT <= 0) { p.down = false; p.dust = 0.3; afterGetUp(p); }
      return;
    }
    if (p.hold) { p.vx *= 0.8; p.vy *= 0.8; integrate(p, dt); p.anim.speed = 0; return; }
    if (p.dodgeT > 0) {
      p.dodgeT -= dt;
      p.vx = p.dvx; p.vy = p.dvy;
      integrate(p, dt);
      return;
    }
    p.thinkT -= dt;
    if (p.thinkT <= 0) { p.thinkT = 0.12 + rnd() * 0.06; threatCheck(p); playerCheck(p, 0.15); }
    if (p.dodgeT > 0) return;
    if (p.lookT > 0 && p.lookAt) { p.vx *= 0.85; p.vy *= 0.85; integrate(p, dt); faceTo(p, p.lookAt.x, p.lookAt.y, dt); return; }
    if (p.spotter) { spotterMove(p, dt); return; }
    if (p.idleT > 0 && p.mode !== 'wander') { p.idleT -= dt; p.vx *= 0.8; p.vy *= 0.8; integrate(p, dt); return; }
    switch (p.mode) {
      case 'walk': walkStep(p, dt); break;
      case 'wander': wanderStep(p, dt); break;
      case 'goto': gotoStep(p, dt); break;
      case 'board': boardStep(p, dt); break;
      case 'stand': p.vx *= 0.8; p.vy *= 0.8; integrate(p, dt); if (p.faceA != null) p.angle += U.angleDiff(p.angle, p.faceA) * Math.min(1, dt * 4); break;
      default: walkStep(p, dt);
    }
    // vendors call out now and then
    if (p.cart || p.role === 'vendor' || p.balloons) {
      p.callT -= dt;
      if (p.callT <= 0) { p.callT = rr(8, 15); if (Math.hypot(p.x - N.player.x, p.y - N.player.y) < 320) { sfx('vendor_call', { x: p.x, y: p.y, variant: p.cart ? p.cart.kind : 'fruit' }); if (rnd() < 0.5) bark(p, 'vendor'); } }
    }
  }
  function walkStep(p, dt) {
    const w = p.w;
    if (!w) { if (!attachNearestWalk(p)) { p.mode = 'wander'; p.zone = p.zone || { x: p.x, y: p.y, r: 30 }; } return; }
    if (w.cross) {
      if (!w.crossGo) {
        if (trafficComing(w.cross) && w.waitT < TUNE.crossWait) { w.waitT += dt; p.vx *= 0.7; p.vy *= 0.7; integrate(p, dt); faceTo(p, w.cross.x1, w.cross.y1, dt); return; }
        w.crossGo = true;
      }
      const d = moveToward(p, w.cross.x1, w.cross.y1, p.spd * 1.25, dt, 1.5);
      stuckCheck(p, dt);
      if (d < 2.5) {
        if (!w.cross.keep) { w.side = -w.side; w.off = footOff(w.e, w.side); }
        if (w.cross.then) { const t2 = w.cross.then; w.cross = null; attachWalk(p, t2.B, t2.C, w.side); }
        else w.cross = null;
        if (p.w) { p.w.crossGo = false; p.w.waitT = 0; }
      }
      return;
    }
    const g = w.g, A = w.a;
    const s = (p.x - A.x) * g.ux + (p.y - A.y) * g.uy;
    const endR = cornerR(w.b, w.e);
    if (w.jay != null && s > g.L * w.jay) {
      // jaywalk straight across (Hyderabad)
      w.jay = null;
      const q = lanePt(A, g, s + 6, -w.off);
      if (walkSurfOk(q.x, q.y, false)) { w.cross = { x0: p.x, y0: p.y, x1: q.x, y1: q.y }; return; }
    }
    if (s >= g.L - endR) { nextEdge(p); return; }
    const ahead = Math.min(g.L - endR + 1, s + 12);
    const tp = lanePt(A, g, ahead, w.off);
    moveToward(p, tp.x, tp.y, p.spd, dt, 1);
    stuckCheck(p, dt);
  }
  function nextEdge(p) {
    const w = p.w, A = w.a, B = w.b;
    const opts = [];
    for (const eid of B.inc) {
      const e = RI.edges[eid]; if (e.kind === 'path') continue;
      const C = RI.nodes[e.a === B.id ? e.b : e.a];
      if (C === A) continue;
      opts.push(C);
    }
    if (!opts.length) { attachWalk(p, B, A, -w.side); return; }
    const g = w.g;
    // prefer straight a little
    let C = pick(opts);
    for (const o of opts) { const g2 = geom(B, o); if (g.ux * g2.ux + g.uy * g2.uy > 0.85 && rnd() < 0.4) { C = o; break; } }
    const g2 = geom(B, C);
    const cross = g.ux * g2.uy - g.uy * g2.ux, dot = g.ux * g2.ux + g.uy * g2.uy;
    const inside = (w.side > 0 && cross < -0.35) || (w.side < 0 && cross > 0.35);
    const straight = Math.abs(cross) <= 0.35 && dot > 0;
    if (inside || B.deg < 3) { attachWalk(p, B, C, w.side); return; }
    const e2 = edgeAny(B, C);
    if (straight) {
      // straight on: cross the side road along our footpath line, then carry on
      const st = lanePt(B, g2, cornerR(B, e2), footOff(e2, w.side));
      w.cross = { x0: p.x, y0: p.y, x1: st.x, y1: st.y, keep: true, then: { B, C } };
      return;
    }
    // an outside turn: first cross our own road at the junction mouth (the zebra), then it is an inside turn
    const sAt = Math.max(0, g.L - cornerR(B, w.e) - 2);
    const q = lanePt(A, g, sAt, -w.off);
    w.cross = { x0: p.x, y0: p.y, x1: q.x, y1: q.y };
  }
  function trafficComing(cr) {
    const mx = (cr.x0 + cr.x1) / 2, my = (cr.y0 + cr.y1) / 2;
    for (const v of N.entities.query(mx, my, 95, isVeh)) {
      const sp = Math.hypot(v.vx, v.vy); if (sp < 15) continue;
      const dx = mx - v.x, dy = my - v.y;
      const along = (dx * v.vx + dy * v.vy) / sp; if (along < -12) continue;
      const lat = Math.abs(dx * v.vy - dy * v.vx) / sp; if (lat > 26) continue;
      if (along / sp < 2.4) return true;
    }
    return false;
  }
  function stuckCheck(p, dt) {
    const sp = Math.hypot(p.vx, p.vy);
    if (sp < 4) { p.stuckT += dt; if (p.stuckT > 3) { p.stuckT = 0; if (!N.render.inView(p.x, p.y, 30)) { p.alive = false; } else { p.w = null; p.mode = 'wander'; p.zone = { x: p.x, y: p.y, r: 24 }; p.ttl = p.life + 8; } } }
    else p.stuckT = 0;
  }
  function zonePoint(z) {
    for (let k = 0; k < 10; k++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * z.r;
      const x = z.x + Math.cos(a) * d, y = z.y + Math.sin(a) * d;
      if (!walkSurfOk(x, y, !!z.road)) continue;
      if (N.world.collide(x, y, 3.6, 'walk').hit) continue;
      if (k < 8 && N.entities.query(x, y, 5.5, (e) => e.kind === 'ped' || e.kind === 'npc').length) continue; // a little personal space
      if (!N.world.raycast(z.x, z.y, x, y, 'walk').hit || k > 6) return { x, y };
    }
    return null;
  }
  function wanderStep(p, dt) {
    const z = p.zone || (p.zone = { x: p.x, y: p.y, r: 30 });
    if (p.idleT > 0) {
      p.idleT -= dt; p.vx *= 0.8; p.vy *= 0.8; integrate(p, dt);
      if (p.faceA != null) p.angle += U.angleDiff(p.angle, p.faceA) * Math.min(1, dt * 3);
      p.anim.phase += dt * 0.6; // a little shuffle
      return;
    }
    if (!p.tgt) {
      p.tgt = zonePoint(z);
      if (!p.tgt) { p.idleT = rr(2, 4); return; }
    }
    const d = moveToward(p, p.tgt.x, p.tgt.y, p.spd * 0.6, dt, 1.5);
    const sp = Math.hypot(p.vx, p.vy);
    if (sp < 3) p.stuckT += dt; else p.stuckT = 0;
    if (d < 2.5 || p.stuckT > 1.6) {
      p.tgt = null; p.stuckT = 0; p.idleT = rr(2, 7);
      // face a neighbour (chatting) or the place
      const o = T.peds.find((q) => q !== p && q.zone === z && Math.hypot(q.x - p.x, q.y - p.y) < 14);
      p.faceA = o ? Math.atan2(o.y - p.y, o.x - p.x) : Math.atan2(z.y - p.y, z.x - p.x) + rr(-1, 1);
    }
    if (p.life > p.ttl && !N.render.inView(p.x, p.y, 20)) { if (!attachNearestWalk(p)) p.ttl += 20; }
  }
  function gotoStep(p, dt) {
    if (!p.tgt) { p.mode = p.zone ? 'wander' : 'walk'; return; }
    const d = moveToward(p, p.tgt.x, p.tgt.y, p.spd, dt, 2);
    stuckCheck(p, dt);
    if (d < 4) { p.tgt = null; p.mode = p.zone ? 'wander' : 'walk'; p.idleT = rr(1, 3); }
  }
  function boardStep(p, dt) {
    const v = p.boardV;
    if (!v || !v.alive || !v.tr || v.tr.stopT == null) { p.mode = p.zone ? 'wander' : 'walk'; p.boardV = null; return; }
    const d = moveToward(p, p.tgt.x, p.tgt.y, p.spd * 1.3, dt, 2);
    if (d < 5) { p.alive = false; }
  }
  function spotterMove(p, dt) {
    const pl = N.player;
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (p.spotter.stick && d > 34 && d < 300) moveToward(p, pl.x, pl.y, 20, dt, 2);
    else { p.vx *= 0.8; p.vy *= 0.8; integrate(p, dt); }
    faceTo(p, pl.x, pl.y, dt);
    if (p.spotter.stick) p.anim.phase += dt * 9; // waving the stick
  }
  function threatCheck(p) {
    if (p.down || p.zone && p.zone.still) return;
    const near = N.entities.query(p.x, p.y, 70, isVeh);
    for (const v of near) {
      const sp = Math.hypot(v.vx, v.vy); if (sp < 40) continue;
      const c = v.vx / sp, s = v.vy / sp;
      const dx = p.x - v.x, dy = p.y - v.y;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      const reach = v.T.w / 2 + 8 + sp * 0.42;
      if (lx < 0 || lx > reach || Math.abs(ly) > v.T.d / 2 + 6) continue;
      const side = Math.abs(ly) < 0.6 ? (rnd() < 0.5 ? 1 : -1) : Math.sign(ly);
      let nx = -s * side, ny = c * side;
      // jump the other way if that side is a wall
      if (!N.world.isWalkable(p.x + nx * 14, p.y + ny * 14)) { nx = -nx; ny = -ny; }
      p.dodgeT = TUNE.dodgeSecs; p.dvx = nx * TUNE.dodgeSpeed + c * 12; p.dvy = ny * TUNE.dodgeSpeed + s * 12;
      p.anim.run = true;
      if (rnd() < TUNE.dodgeBark) bark(p, 'dodge');
      N.emit('ped:dodge', { ped: p, vehicle: v });
      return;
    }
  }
  function playerCheck(p, dt) {
    const pl = N.player;
    if (!pl || pl.hidden) return;
    if ((pl.level || null) !== (p.level || null)) { p.nearT = 0; return; } // he is up on a roof
    const d = Math.hypot(pl.x - p.x, pl.y - p.y);
    if (d > 26) { p.nearT = 0; return; }
    const sp = Math.hypot(pl.vx || 0, pl.vy || 0);
    if (!pl.vehicle && sp > 62 && d < 10 && p.ranPast <= p.life) {
      p.ranPast = p.life + 10;
      if (rnd() < TUNE.runPastBark) bark(p, 'runPast');
      return;
    }
    if (!pl.vehicle && sp < 6 && d < 18) {
      p.nearT += dt;
      if (p.nearT > TUNE.nearBarkAfter && !p.nearDone) { p.nearDone = true; if (rnd() < TUNE.nearBark) { bark(p, 'idle'); p.lookT = 1.6; p.lookAt = pl; } }
    } else p.nearT = 0;
  }
  function pedBumped(p, other, info) {
    if (!other || p.down) return;
    const sp = info && info.speed || 0;
    if (other === N.player && sp > 30 && !(p.bumpT > 0)) {
      p.bumpT = 1.2;
      if (sp < 55) { // brushing past at a walk: a stumble, a look, maybe a word
        p.lookT = 1.4; p.lookAt = N.player; p.vx = (info.a === p ? -info.nx : info.nx) * 30; p.vy = (info.a === p ? -info.ny : info.ny) * 30;
        if (rnd() < 0.35) bark(p, 'bumped');
        return;
      }
      p.knockT = clamp(0.4 + sp / 200, 0.6, 1.0);
      p.vx = (info.a === p ? -info.nx : info.nx) * sp * 0.5; p.vy = (info.a === p ? -info.ny : info.ny) * sp * 0.5;
      p.hitBy = 'foot';
      N.emit('ped:knocked', { ped: p, by: N.player, speed: sp });
      lookers(p.x, p.y);
    }
  }
  function afterGetUp(p) {
    const situ = p.hitBy === 'vehicle' ? 'hitVehicle' : 'bumped';
    p.hitBy = null;
    bark(p, situ, true);
    p.lookT = 1.2; p.lookAt = N.player;
  }
  function lookers(x, y) {
    for (const q of T.peds) {
      if (q.down || q.hold || q.spotter) continue;
      const d = Math.hypot(q.x - x, q.y - y);
      if (d > 4 && d < 60) { q.lookT = rr(1, 1.8); q.lookAt = { x, y }; }
    }
  }

  /* ---------------------------------------------------------------- drawing peds */
  function drawPed(ctx, p) {
    const R = N.render;
    if (p.down) {
      // lying on the side (knocked down), then sitting up
      const k = R.k(0.4), ang = p.angle + (p.getupT > 0 ? Math.PI / 4 : Math.PI / 2);
      blitPerson(ctx, p.look, p.x, p.y, ang, null, 0.3);
      void k;
      return;
    }
    if (p.cart) drawCart(ctx, p);
    blitPerson(ctx, p.look, p.x, p.y, p.angle, p.anim, 0.6);
    if (p.umb) {
      const k = R.k(11), X = R.sx(p.x, k), Y = R.sy(p.y, k), r = 6.2 * k;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(X, Y); ctx.arc(X, Y, r, (i / 8) * TAU + p.angle, ((i + 1) / 8) * TAU + p.angle); ctx.closePath();
        ctx.fillStyle = i % 2 ? p.umb : U.shade(p.umb, 1.25); ctx.fill();
      }
      ctx.fillStyle = '#c8c8c8'; ctx.fillRect(X - 0.5, Y - 0.5, 1, 1);
    }
  }
  function drawCart(ctx, p) {
    const c = p.cart;
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
    const cx = p.x + ca * 11.5, cy = p.y + sa * 11.5;
    c.x = cx; c.y = cy;
    try { if (N.placesArt && N.placesArt.drawProp) { if (N.placesArt.drawProp(c.kind, cx, cy, p.angle, { seed: c.seed })) return; } } catch (e) { /* fall back */ }
    N.draw.sprite(cx, cy, p.angle, 5, (g) => {
      g.fillStyle = '#6a4a2a'; g.fillRect(-8, -4.5, 16, 9);
      g.fillStyle = c.kind === 'flower_cart' ? '#f4f0e8' : '#f2d23a'; g.fillRect(-7, -3.5, 14, 7);
    });
  }
  function drawPedSky(ctx, p) {
    const R = N.render;
    if (p.spotter) {
      const k = R.k(17), X = Math.round(R.sx(p.x, k)), Y = Math.round(R.sy(p.y, k));
      const bob = Math.round(Math.sin((N.time.real || 0) * 6) * 1);
      ctx.fillStyle = '#1a1214'; ctx.fillRect(X - 2, Y - 8 + bob, 4, 9);
      ctx.fillStyle = '#ff4a3a'; ctx.fillRect(X - 1, Y - 7 + bob, 2, 5); ctx.fillRect(X - 1, Y - 1 + bob, 2, 1.5);
    }
    if (p.balloons) {
      const hk = R.k(9), hx = R.sx(p.x + Math.sin(p.angle) * 3, hk), hy = R.sy(p.y - Math.cos(p.angle) * 3, hk);
      const t = N.time.real || 0;
      for (let i = 0; i < p.balloons.length; i++) {
        const a = (i / p.balloons.length) * TAU + Math.sin(t * 0.7 + i) * 0.2;
        const bk = R.k(24 + (i % 3) * 3), bx = R.sx(p.x + Math.cos(a) * 5, bk), by = R.sy(p.y + Math.sin(a) * 5, bk);
        ctx.strokeStyle = 'rgba(240,240,240,0.55)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.fillStyle = p.balloons[i]; ctx.beginPath(); ctx.ellipse(bx, by, 2.6 * bk, 3.1 * bk, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(bx - bk, by - 2 * bk, Math.max(1, bk), Math.max(1, bk));
      }
    }
    if (p.down && p.dust > 0) {
      const k = R.k(0), X = R.sx(p.x, k), Y = R.sy(p.y, k), a = Math.min(1, p.dust * 1.6);
      ctx.fillStyle = 'rgba(214,190,150,' + (0.5 * a).toFixed(3) + ')';
      for (let i = 0; i < 5; i++) { const an = i * 1.26 + p.angle, r = (6 + (1 - a) * 8) * k; ctx.beginPath(); ctx.arc(X + Math.cos(an) * r, Y + Math.sin(an) * r, (2 + (1 - a) * 2.5) * k, 0, TAU); ctx.fill(); }
    }
  }

  /* ---------------------------------------------------------------- spawning peds */
  function spawnWalker(force) {
    if (!RI.built) return null;
    const c = camC(), vr = viewR();
    const n = ringNode(c.x, c.y, force ? 40 : vr + TUNE.ringPed[0], vr + TUNE.ringPed[1]);
    if (!n || !n.inc.length) return null;
    const e = RI.edges[pick(n.inc)];
    if (!e || e.kind === 'path' || e.len < 20) return null;
    const A = RI.nodes[e.a], B = RI.nodes[e.b];
    const fwd = rnd() < 0.5, a = fwd ? A : B, b = fwd ? B : A;
    const g = geom(a, b), side = rnd() < 0.5 ? 1 : -1, off = footOff(e, side);
    const d0 = clamp(g.L * rr(0.2, 0.8), 4, g.L - 4);
    const pos = lanePt(a, g, d0, off);
    if (!force && N.render.inView(pos.x, pos.y, 30)) return null;
    if (force && Math.hypot(pos.x - N.player.x, pos.y - N.player.y) < 30) return null;
    if (!walkSurfOk(pos.x, pos.y, true) || N.world.collide(pos.x, pos.y, 3.6, 'walk').hit) return null;
    if (respectAt(pos.x, pos.y)) return null;
    const d = districtAt(pos.x, pos.y), style = styleOf(d);
    const role = pickRole(style, d && d.id);
    // pushcart vendors in markets / colonies by day
    let cart = null, balloons = null;
    const m = mins();
    if ((style === 'market' || style === 'colony' || style === 'oldcity') && !night() && rnd() < 0.05 && m > 7 * 60 && m < 20 * 60) cart = { kind: pick(['banana_cart', 'flower_cart', 'coconut_cart', 'banana_cart']), seed: (rnd() * 1e5) | 0 };
    const p = new Ped({ x: pos.x, y: pos.y, ...makeLookArgs(cart ? 'vendor' : role, style), role: cart ? 'vendor' : role, style, mode: 'walk', cart, balloons });
    if (cart) { p.r = 5; p.mass = 3; p.blocksTraffic = true; p.spd = TUNE.pedSpd.vendor; }
    attachWalk(p, a, b, side);
    N.entities.add(p); T.peds.push(p);
    return p;
  }
  function makeLookArgs(role, style) { const L = makeLook(role, style); return { look: L.look, lang: L.lang, spd: L.spd }; }

  /* ---------------------------------------------------------------- crowd zones */
  function zoneFor(place) {
    const Z = TUNE.zones;
    let spec = Z[place.id] || null, kind = place.id;
    if (!spec) {
      kind = place.kind;
      if (/^irani_cafe/.test(place.id)) kind = 'irani_cafe';
      else if (place.id === 'gokul_chat' || place.kind === 'food') kind = 'food';
      else if (place.id === 'charminar_plaza') kind = 'plaza';
      spec = Z[kind] || null;
    }
    if (!spec) return null;
    return { spec, kind };
  }
  function zoneActive(z) {
    const s = z.spec, m = mins();
    let on = inHours(s.hours, m) || (s.hours2 && inHours(s.hours2, m));
    if (z.kind === 'school' && !schoolDay()) on = false;
    if (z.kind === 'cinema') { // the 30 min before each show (11:00 14:30 18:00 21:15) and the let-out
      const shows = [11 * 60, 14 * 60 + 30, 18 * 60, 21 * 60 + 15];
      on = shows.some((t) => m >= t - 35 && m <= t + 8) || shows.some((t) => m >= t + 160 && m <= t + 175);
    }
    if (z.kind === 'temple' && z.place.id === 'birla_mandir') on = on && true;
    return on;
  }
  function refreshZones() {
    const c = camC(), vr = viewR(), out = [];
    const R2 = vr + 240;
    for (const id in N.places) {
      const pl = N.places[id];
      if (Math.abs(pl.x - c.x) > R2 || Math.abs(pl.y - c.y) > R2) continue;
      if (pl.level || pl.roof) continue;
      let z = T.zoneCache.get(id);
      if (z === undefined) {
        const f = zoneFor(pl);
        z = f ? { place: pl, x: pl.x, y: pl.y, r: Math.max(f.spec.r, (pl.r || 0) + 10), spec: f.spec, kind: f.kind } : null;
        if (z && z.kind === 'bus_stop') { z.r = 14; }
        T.zoneCache.set(id, z);
      }
      if (z && zoneActive(z)) out.push(z);
    }
    T.zoneList = out;
  }
  function zoneCount(z) { let n = 0; for (const p of T.peds) if (p.zone === z && p.alive) n++; return n; }
  function zoneWant(z) {
    let n = z.spec.n;
    const m = mins();
    if (z.kind === 'temple' && z.place.id === 'dilsukhnagar_sai_temple' && calDate().dow === 4) n *= 1.8;
    if (z.kind === 'temple' && (m < 6 * 60 + 30 || (m > 17 * 60 && m < 20 * 60 + 30))) n *= 1.3;
    if (night() && z.kind !== 'cinema' && z.kind !== 'irani_cafe' && z.kind !== 'plaza') n *= 0.5;
    return Math.round(n * (T.pedMul || 1));
  }
  function spawnZonePed(z, force) {
    // out of view near the zone (walk in), or right in it after a teleport
    let pos = null;
    if (force || !N.render.inView(z.x, z.y, z.r + 20)) pos = zonePoint(z);
    if (!pos || (!force && N.render.inView(pos.x, pos.y, 20))) {
      // enter from outside the view on the footpath network, heading for the zone
      const a = rnd() * TAU, d = viewR() + 20;
      const c = camC();
      let ex = c.x + Math.cos(a) * d, ey = c.y + Math.sin(a) * d;
      if (Math.hypot(ex - z.x, ey - z.y) > 420) return null;
      const f = N.world.findFree(ex, ey, 'walk', 10);
      if (!f || !walkSurfOk(f.x, f.y, false) || N.render.inView(f.x, f.y, 10)) return null;
      const role = wpick(z.spec.roles) || 'man';
      const p = spawnPedAt(f.x, f.y, role, styleOf(districtAt(z.x, z.y)), { mode: 'goto', zone: z });
      if (p) { p.tgt = zonePoint(z) || { x: z.x, y: z.y }; p.mode = 'goto'; }
      return p;
    }
    const role = wpick(z.spec.roles) || 'man';
    const p = spawnPedAt(pos.x, pos.y, role, styleOf(districtAt(z.x, z.y)), { mode: 'wander', zone: z });
    if (p) { p.idleT = rr(0, 3); p.ttl = rr(60, 160); }
    return p;
  }

  /* ================================================================ constables at podium junctions */
  class Constable extends N.Actor {
    constructor(pod) {
      super({ kind: 'ped', x: pod.x, y: pod.y, r: 3.4, mass: 50, solid: false, noCollide: true });
      this.constable = true; this.pod = pod; this.look = makeLook('police', 'colonial').look;
      this.anim = { phase: 0, speed: 0, run: false }; this.angle = 0; this.whT = rr(4, 12);
      this._fn = (ctx) => {
        const R = N.render;
        const t = (N.time.real || 0);
        const ang = (pod.axisA || 0) + (pod.green ? Math.PI / 2 : 0) + Math.sin(t * 2) * 0.3;
        this.angle = ang;
        blitPerson(ctx, this.look, this.x, this.y, ang, { phase: t * 5, speed: 0.35, run: false }, 2.8);
        // white glove waving the green axis on
        const k = R.k(9), sw = Math.sin(t * 5) * 3;
        const hx = this.x + Math.cos(ang) * 1 + Math.cos(ang + Math.PI / 2) * (5 + sw * 0.4), hy = this.y + Math.sin(ang) * 1 + Math.sin(ang + Math.PI / 2) * (5 + sw * 0.4);
        ctx.fillStyle = '#f4f2ea'; ctx.fillRect(Math.round(R.sx(hx, k)) - 1, Math.round(R.sy(hy, k)) - 1, 2, 2);
      };
    }
    update(dt) {
      const pod = this.pod;
      this.whT -= dt;
      if (this.whT <= 0) { this.whT = rr(9, 16); if (Math.hypot(this.x - N.player.x, this.y - N.player.y) < 360) sfx('whistle', { x: this.x, y: this.y, vol: 0.5 }); }
      void pod;
    }
    draw() { N.render.queue('actors', this.y + 1, this._fn); }
  }
  function updatePodiums(dt) {
    const m = mins(), on = inHours(TUNE.podiumHours, m);
    const c = camC(), vr = viewR();
    const t = N.time.now || 0, P = TUNE.podiumPhase, G = TUNE.podiumGap;
    for (const [nid, pod] of RI.podium) {
      if (pod.axisA == null) {
        const n = RI.nodes[nid];
        let wide = null;
        for (const eid of n.inc) { const e = RI.edges[eid]; if (!wide || RANK[e.kind] > RANK[wide.kind] || e.w > wide.w) wide = e; }
        const o = wide ? RI.nodes[wide.a === nid ? wide.b : wide.a] : null;
        pod.axisA = o ? Math.atan2(o.y - n.y, o.x - n.x) : 0;
      }
      const near = Math.hypot(pod.x - c.x, pod.y - c.y) < vr + 500;
      // Pochaiah himself stands on his own podium (npcs.js schedule) — no second constable there
      const poch = N.npcs && N.npcs.get ? N.npcs.get('pochaiah') : null;
      const pochHere = !!(poch && poch.alive !== false && !poch.hidden && Math.hypot(poch.x - pod.x, poch.y - pod.y) < 40);
      pod.active = on && near && (pochHere || !!pod.cop);
      const cyc = (t % (2 * P + 2 * G));
      pod.green = cyc < P ? 0 : cyc < P + G ? -1 : cyc < 2 * P + G ? 1 : -1;
      const wantCop = on && near && !pochHere && !(N.wanted && N.wanted.podiumOff && N.wanted.podiumOff(pod));
      if (wantCop && !pod.cop) {
        if (!N.render.inView(pod.x, pod.y, 20) || T.fillT > 0) { pod.cop = new Constable(pod); N.entities.add(pod.cop); T.constables.push(pod.cop); }
      } else if (!wantCop && pod.cop && (!N.render.inView(pod.x, pod.y, 20) || !on)) {
        N.entities.remove(pod.cop); const i = T.constables.indexOf(pod.cop); if (i >= 0) T.constables.splice(i, 1); pod.cop = null;
      }
    }
  }

  /* ================================================================ animals */
  class Animal extends N.Actor {
    constructor(species, x, y, o) {
      super({ kind: 'animal', x, y, r: species === 'cow' ? 7 : species === 'goat' ? 3.5 : 3, mass: species === 'cow' ? 60 : 2, solid: species !== 'dog' });
      this.species = species; this.type = species; this.angle = rnd() * TAU; this.t = rnd() * 10;
      this.state = 'idle'; this.stT = rr(2, 8); this.home = { x, y }; this.anim = 0;
      this.col = o && o.col || pickAnimalColor(species); this.seed = (rnd() * 1e5) | 0;
      if (species === 'cow') { this.fixed = true; this.state = rnd() < 0.6 ? 'lie' : 'stand'; this.ax = x; this.ay = y; this.blocksTraffic = true; }
      if (species === 'dog') { this.noCollide = true; this.blocksTraffic = true; this.state = night() ? 'wander' : (rnd() < 0.6 ? 'nap' : 'wander'); }
      if (species === 'goat') { this.state = 'graze'; }
      this._fn = (ctx) => drawAnimal(ctx, this);
    }
    update(dt) { try { animalUpdate(this, dt); } catch (e) { N.err('traffic.animal', e); this.alive = false; } }
    draw() { N.render.queue('actors', this.y, this._fn); }
    onBump(other, info) {
      if (this.species === 'goat' && other === N.player && info && info.speed > 20 && !(this.bleatT > 0)) { this.bleatT = 2; sfx('goat_bleat', { x: this.x, y: this.y }); bubble(this, 'Meh-eh-eh!'); }
    }
  }
  function pickAnimalColor(sp) {
    if (sp === 'cow') return pick([['#ece6da', '#c8bfae'], ['#e8e0d0', '#8a6a4a'], ['#d8cfc0', '#4a3a30'], ['#c8b8a0', '#a08060']]);
    if (sp === 'dog') return pick([['#b8864a', '#8a6030'], ['#2a2420', '#5a4a3a'], ['#d8c8a8', '#a08a6a'], ['#9a6a3a', '#e8d8c0']]);
    return pick([['#f0ece4', '#c8c0b0'], ['#4a3a30', '#2a201a'], ['#8a5a3a', '#f0e8d8'], ['#2a2420', '#f0ece4']]);
  }
  function animalUpdate(a, dt) {
    a.t += dt;
    if (a.bleatT > 0) a.bleatT -= dt;
    if (a.species === 'cow') cowUpdate(a, dt);
    else if (a.species === 'dog') dogUpdate(a, dt);
    else goatUpdate(a, dt);
  }
  function stepAnimal(a, tx, ty, speed, dt, mode) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 1) { a.vx = a.vy = 0; return d; }
    const s = Math.min(speed, d * 4);
    a.vx = (dx / d) * s; a.vy = (dy / d) * s;
    const c = N.world.collide(a.x + a.vx * dt, a.y + a.vy * dt, a.r, mode || 'walk');
    if (!c.bad) { a.x = c.x; a.y = c.y; if (c.hit) a.stuck = (a.stuck || 0) + dt; else a.stuck = 0; }
    a.angle += U.angleDiff(a.angle, Math.atan2(dy, dx)) * Math.min(1, dt * 5);
    a.anim += s * dt * 0.3;
    return d;
  }
  function cowUpdate(a, dt) {
    a.moving = false;
    switch (a.state) {
      case 'lie': case 'stand':
        a.vx = a.vy = 0;
        if (a.getUpT != null) { a.getUpT -= dt; if (a.getUpT <= 0) { a.getUpT = null; a.state = 'amble'; a.goal = cowSpot(a); if (rnd() < 0.5) sfx('cow_moo', { x: a.x, y: a.y }); } }
        else if (a.state === 'stand') { a.stT -= dt; if (a.stT <= 0) { a.state = 'lie'; } }
        break;
      case 'amble': {
        if (!a.goal) { a.state = 'stand'; a.stT = rr(TUNE.cowLieAgain[0], TUNE.cowLieAgain[1]); break; }
        a.moving = true;
        const d = stepAnimal(a, a.goal.x, a.goal.y, TUNE.cowAmbleSpeed, dt);
        a.ax = a.x; a.ay = a.y;
        if (d < 2 || (a.stuck || 0) > 1.5) { a.goal = null; a.state = 'stand'; a.stT = rr(TUNE.cowLieAgain[0], TUNE.cowLieAgain[1]); a.vx = a.vy = 0; }
        break;
      }
      default: a.state = 'lie';
    }
  }
  function cowSpot(a) {
    // amble ~40 u away towards the road edge / footpath
    for (let k = 0; k < 10; k++) {
      const an = rnd() * TAU, d = TUNE.cowAmble * rr(0.7, 1.2);
      const x = a.x + Math.cos(an) * d, y = a.y + Math.sin(an) * d;
      if (!N.world.isWalkable(x, y) || N.world.collide(x, y, 7, 'walk').hit || N.world.raycast(a.x, a.y, x, y, 'walk').hit) continue;
      const s = N.world.surfaceAt(x, y);
      if (s === N.SURF.ROAD && k < 7) continue;
      return { x, y };
    }
    return null;
  }
  function wakeCow(a, delay) { if (a.species !== 'cow' || a.state === 'amble' || a.getUpT != null) return; a.getUpT = delay != null ? delay : rr(TUNE.cowGetUp[0], TUNE.cowGetUp[1]); }
  function dogUpdate(a, dt) {
    const pl = N.player;
    if (a.fedT > 0) {
      a.fedT -= dt;
      a.state = 'follow';
      if (a.barkAt && a.barkAt.alive && a.barkT > 0) { a.barkT -= dt; stepAnimal(a, a.barkAt.x, a.barkAt.y, 40, dt); if (rnd() < dt * 3) sfx('dog_bark', { x: a.x, y: a.y }); return; }
      const fx = pl.x - Math.cos(pl.angle || 0) * 14, fy = pl.y - Math.sin(pl.angle || 0) * 14;
      const d = Math.hypot(fx - a.x, fy - a.y);
      stepAnimal(a, fx, fy, d > 30 ? 95 : 50, dt);
      if (a.fedT <= 0) { a.state = 'wander'; a.home = { x: a.x, y: a.y }; }
      return;
    }
    // chase bikes
    if (a.state === 'chase') {
      a.chaseT -= dt;
      const tg = a.target;
      if (!tg || !tg.alive || a.chaseT <= 0) { a.state = 'return'; a.target = null; return; }
      const sp = Math.hypot(tg.vx || 0, tg.vy || 0);
      if (sp < 10 && Math.hypot(tg.x - a.x, tg.y - a.y) < 18) { a.state = 'sniff'; a.stT = 1.5; return; }
      const side = Math.sin(a.t * 2) * 6;
      const tx = tg.x - Math.cos(tg.angle || 0) * 10 + Math.cos((tg.angle || 0) + Math.PI / 2) * side, ty = tg.y - Math.sin(tg.angle || 0) * 10 + Math.sin((tg.angle || 0) + Math.PI / 2) * side;
      stepAnimal(a, tx, ty, TUNE.dogChase.speed, dt);
      a.barkT = (a.barkT || 0) - dt;
      if (a.barkT <= 0) { a.barkT = rr(0.5, 1.1); sfx('dog_bark', { x: a.x, y: a.y }); }
      return;
    }
    if (a.state === 'sniff') { a.vx = a.vy = 0; a.stT -= dt; if (a.stT <= 0) a.state = 'return'; return; }
    if (a.state === 'return') { const d = stepAnimal(a, a.home.x, a.home.y, 40, dt); if (d < 6) { a.state = night() ? 'wander' : 'nap'; a.stT = rr(5, 15); } return; }
    // dodge vehicles
    for (const v of N.entities.query(a.x, a.y, 40, isVeh)) {
      const sp = Math.hypot(v.vx, v.vy); if (sp < 30) continue;
      const c = v.vx / sp, s = v.vy / sp, dx = a.x - v.x, dy = a.y - v.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
      if (lx > 0 && lx < v.T.w / 2 + 10 + sp * 0.3 && Math.abs(ly) < v.T.d / 2 + 6) {
        const side = Math.sign(ly) || 1; a.state = 'wander'; a.goal = { x: a.x - s * side * 20, y: a.y + c * side * 20 }; break;
      }
    }
    // start a chase: a bike passing fast (the player always; ambient cyclists at night now and then)
    const trig = TUNE.dogChase;
    const pv = pl.vehicle;
    if (pv && pv.T.cls === 'bike' && Math.hypot(pv.vx, pv.vy) > trig.trigger && Math.hypot(pv.x - a.x, pv.y - a.y) < trig.r && (night() || rnd() < 0.5) && !(a.chaseCD > a.t)) {
      a.state = 'chase'; a.target = pv; a.chaseT = trig.secs; a.chaseCD = a.t + 12; sfx('dog_bark', { x: a.x, y: a.y }); N.emit('dog:chase', { dog: a, target: pv }); return;
    }
    if (night() && rnd() < dt * 0.05) {
      const cyc = N.entities.nearest(a.x, a.y, 50, (e) => e.kind === 'vehicle' && e.T.pedal && e.tr && Math.hypot(e.vx, e.vy) > 30);
      if (cyc && !(a.chaseCD > a.t)) { a.state = 'chase'; a.target = cyc; a.chaseT = trig.secs * 0.7; a.chaseCD = a.t + 15; sfx('dog_bark', { x: a.x, y: a.y }); return; }
    }
    if (a.state === 'nap') { a.vx = a.vy = 0; a.stT -= dt; if (a.stT <= 0) { a.state = 'wander'; a.stT = rr(8, 20); } return; }
    // wander near home; bark at passers at night
    a.stT -= dt;
    if (!a.goal || a.stT <= 0) {
      a.stT = rr(4, 10);
      const an = rnd() * TAU, d = rr(10, 50);
      const gx = a.home.x + Math.cos(an) * d, gy = a.home.y + Math.sin(an) * d;
      a.goal = N.world.isWalkable(gx, gy) ? { x: gx, y: gy } : null;
      if (!night() && rnd() < 0.3) { a.state = 'nap'; a.stT = rr(8, 20); a.goal = null; return; }
    }
    if (a.goal) { const d = stepAnimal(a, a.goal.x, a.goal.y, 22, dt); if (d < 2) a.goal = null; }
    if (night() && Math.hypot(pl.x - a.x, pl.y - a.y) < 50 && rnd() < dt * 0.25) sfx('dog_bark', { x: a.x, y: a.y });
  }
  function goatUpdate(a, dt) {
    a.stT -= dt;
    if (a.state === 'nibble') { a.vx = a.vy = 0; a.anim += dt * 4; if (a.stT <= 0) { a.state = 'graze'; a.stT = rr(3, 8); } return; }
    if (!a.goal || a.stT <= 0) {
      a.stT = rr(3, 9);
      const an = rnd() * TAU, d = rr(6, 30);
      const gx = a.home.x + Math.cos(an) * d, gy = a.home.y + Math.sin(an) * d;
      a.goal = N.world.isWalkable(gx, gy) ? { x: gx, y: gy } : null;
    }
    if (a.goal) {
      const d = stepAnimal(a, a.goal.x, a.goal.y, 12, dt);
      if (d < 1.5 || (a.stuck || 0) > 0.6) {
        a.goal = null;
        // facing a wall: nibble the posters on it
        if ((a.stuck || 0) > 0.6 || rnd() < 0.3) { a.state = 'nibble'; a.stT = rr(3, 7); a.stuck = 0; }
      }
    }
  }
  function spawnAnimal(force) {
    const c = camC(), vr = viewR();
    const d = districtAt(c.x, c.y), style = styleOf(d), did = d && d.id;
    const counts = { cow: 0, dog: 0, goat: 0 };
    for (const a of T.animals) counts[a.species]++;
    const nightNow = night();
    const want = {
      cow: TUNE.cows[style] != null ? TUNE.cows[style] : 1,
      dog: nightNow ? TUNE.dogs.night : TUNE.dogs.day,
      goat: !nightNow ? (TUNE.goats[did] || TUNE.goats[style] || 0) : 0,
    };
    let sp = null;
    for (const k of ['cow', 'dog', 'goat']) if (counts[k] < want[k]) { sp = k; break; }
    if (!sp) return null;
    const n = ringNode(c.x, c.y, force ? 50 : vr + TUNE.ringAni[0], vr + TUNE.ringAni[1]);
    if (!n || !n.inc.length) return null;
    const e = RI.edges[pick(n.inc)];
    if (!e || e.kind === 'path' || e.len < 40) return null;
    const A = RI.nodes[e.a], B = RI.nodes[e.b], g = geom(A, B);
    let pos;
    if (sp === 'cow') {
      // median of an arterial, or the road edge
      const median = e.kind === 'arterial' || e.kind === 'bund';
      const off = median ? 0 : (rnd() < 0.5 ? 1 : -1) * (e.w / 2 - 7);
      pos = lanePt(A, g, g.L * rr(0.3, 0.7), off);
      if (e.kind === 'bridge') return null;
    } else {
      const side = rnd() < 0.5 ? 1 : -1;
      pos = lanePt(A, g, g.L * rr(0.2, 0.8), footOff(e, side) + side * 3);
    }
    if (!force && N.render.inView(pos.x, pos.y, 40)) return null;
    if (force && Math.hypot(pos.x - N.player.x, pos.y - N.player.y) < 60) return null;
    if (!N.world.isWalkable(pos.x, pos.y) || N.world.collide(pos.x, pos.y, sp === 'cow' ? 7 : 3.5, 'walk').hit) return null;
    if (respectAt(pos.x, pos.y) || N.entities.query(pos.x, pos.y, 26, (q) => q.kind === 'vehicle' || q === N.player).length) return null;
    const a = new Animal(sp, pos.x, pos.y);
    if (sp === 'cow') a.angle = Math.atan2(g.uy, g.ux) + (rnd() < 0.5 ? 0 : Math.PI) + rr(-0.3, 0.3);
    N.entities.add(a); T.animals.push(a);
    // goats come in little herds; dogs in packs at night
    if (sp === 'goat' || (sp === 'dog' && nightNow)) {
      const extra = sp === 'goat' ? 1 + ((rnd() * 2) | 0) : (rnd() < 0.6 ? 1 : 0);
      for (let i = 0; i < extra && T.animals.length < caps().ani; i++) {
        const x = pos.x + rr(-10, 10), y = pos.y + rr(-10, 10);
        if (!N.world.isWalkable(x, y)) continue;
        const b = new Animal(sp, x, y); b.home = a.home; N.entities.add(b); T.animals.push(b);
      }
    }
    return a;
  }
  /** Cows are immovable: undo any shove from vehicles.js and stop the vehicle that did it. */
  function holdCows() {
    for (const a of T.animals) {
      if (a.species !== 'cow' || !a.alive || a.moving) continue;
      const dx = a.x - a.ax, dy = a.y - a.ay;
      if (dx * dx + dy * dy < 0.0004) { a.vx = a.vy = 0; continue; }
      for (const v of N.entities.query(a.ax, a.ay, a.r + 34, isVeh)) {
        if (N.vehicles.distTo(v, a.ax, a.ay) > a.r + 1.5) continue;
        const ox = v.x, oy = v.y;
        v.x -= dx; v.y -= dy;
        if (N.world.collide(v.x, v.y, v.T.cr || v.T.d / 2, 'drive').hit) { v.x = ox; v.y = oy; }
        const sp = Math.hypot(v.vx, v.vy);
        v.vx *= 0.1; v.vy *= 0.1; v.av = 0;
        if (sp > 15 && !(a.mooT > a.t)) {
          a.mooT = a.t + 2.5; sfx('cow_moo', { x: a.x, y: a.y });
          N.emit('cow:bump', { cow: a, vehicle: v, speed: sp });
          if (v.driver === N.player) bubble(a, 'MOOO!');
        }
      }
      a.x = a.ax; a.y = a.ay; a.vx = a.vy = 0; a.knockT = 0;
    }
  }
  function drawAnimal(ctx, a) {
    const D = N.draw;
    if (a.species === 'cow') {
      const lying = a.state === 'lie' && a.getUpT == null;
      const [c1, c2] = a.col;
      D.sprite(a.x, a.y, a.angle, lying ? 2 : 4, (g) => {
        // legs (standing)
        if (!lying) {
          g.fillStyle = '#3a3028';
          const sw = Math.sin(a.anim * 2) * (a.moving ? 1.2 : 0);
          for (const [lx, ly, s] of [[5.5, -3.2, 1], [5.5, 3.2, -1], [-6, -3.2, -1], [-6, 3.2, 1]]) g.fillRect(lx + sw * s - 0.8, ly - 0.7, 1.6, 1.4);
        }
        // tail
        g.strokeStyle = c2; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-9.5, 0); g.quadraticCurveTo(-12, Math.sin(a.t * 1.7) * 2, -12.5, Math.sin(a.t * 1.7 + 1) * 2.4); g.stroke();
        // body
        g.fillStyle = c1; g.beginPath(); g.ellipse(-0.5, 0, 9.5, lying ? 5.2 : 4.4, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(40,30,25,0.55)'; g.lineWidth = 0.6; g.stroke();
        g.fillStyle = c2; g.beginPath(); g.ellipse(-3.5, -1.2, 2.6, 1.8, 0.4, 0, TAU); g.fill(); g.beginPath(); g.ellipse(2.5, 1.8, 1.8, 1.2, -0.3, 0, TAU); g.fill();
        // hump + spine
        g.fillStyle = U.shade(c1, 0.92); g.beginPath(); g.ellipse(4.5, 0, 2.6, 2.6, 0, 0, TAU); g.fill();
        // head (chewing bob)
        const hb = Math.sin(a.t * 3) * 0.35;
        g.fillStyle = U.shade(c1, 0.95); g.beginPath(); g.ellipse(10 + hb, 0, 2.8, 2.2, 0, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = '#d8a8a0'; g.beginPath(); g.ellipse(12.2 + hb, 0, 1.1, 1.4, 0, 0, TAU); g.fill();
        // horns + ears
        g.strokeStyle = '#d8cfb8'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(9 + hb, -1.6); g.quadraticCurveTo(8.5, -3.8, 9.8, -4.4); g.moveTo(9 + hb, 1.6); g.quadraticCurveTo(8.5, 3.8, 9.8, 4.4); g.stroke();
        g.fillStyle = c2; g.fillRect(8.4 + hb, -3.2, 1.2, 1.1); g.fillRect(8.4 + hb, 2.1, 1.2, 1.1);
      });
    } else if (a.species === 'dog') {
      const [c1, c2] = a.col;
      const nap = a.state === 'nap' || a.state === 'sniff' && false;
      D.sprite(a.x, a.y, a.angle, 1.5, (g) => {
        if (nap) {
          g.fillStyle = c1; g.beginPath(); g.ellipse(0, 0, 4, 3.4, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(30,20,15,0.5)'; g.lineWidth = 0.5; g.stroke();
          g.fillStyle = c2; g.beginPath(); g.ellipse(2.2, 1.2, 1.6, 1.3, 0, 0, TAU); g.fill();
          return;
        }
        const sw = Math.sin(a.anim * 3) * 0.9;
        g.fillStyle = '#2a2018'; for (const [lx, ly, s] of [[2.6, -1.4, 1], [2.6, 1.4, -1], [-2.6, -1.4, -1], [-2.6, 1.4, 1]]) g.fillRect(lx + sw * s - 0.5, ly - 0.45, 1, 0.9);
        g.strokeStyle = c1; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-4, 0); g.quadraticCurveTo(-6, -1.5 + Math.sin(a.t * 9) * 1, -5.4, -2.6); g.stroke();
        g.fillStyle = c1; g.beginPath(); g.ellipse(0, 0, 4.2, 1.8, 0, 0, TAU); g.fill();
        g.fillStyle = c2; g.beginPath(); g.ellipse(-1, 0.4, 1.6, 1.1, 0, 0, TAU); g.fill();
        g.fillStyle = c1; g.beginPath(); g.ellipse(4.6, 0, 1.7, 1.4, 0, 0, TAU); g.fill();
        g.fillStyle = '#1a1412'; g.fillRect(6, -0.35, 0.7, 0.7);
        g.fillStyle = c2; g.fillRect(3.8, -1.8, 1.1, 0.8); g.fillRect(3.8, 1, 1.1, 0.8);
      });
    } else {
      const [c1, c2] = a.col;
      D.sprite(a.x, a.y, a.angle, 2, (g) => {
        const sw = Math.sin(a.anim * 3) * 0.7;
        g.fillStyle = '#2a2018'; for (const [lx, ly, s] of [[2.2, -1.3, 1], [2.2, 1.3, -1], [-2.2, -1.3, -1], [-2.2, 1.3, 1]]) g.fillRect(lx + sw * s - 0.45, ly - 0.4, 0.9, 0.8);
        g.fillStyle = c1; g.beginPath(); g.ellipse(0, 0, 3.8, 1.9, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(30,20,15,0.45)'; g.lineWidth = 0.45; g.stroke();
        g.fillStyle = c2; g.beginPath(); g.ellipse(-1.2, 0, 1.4, 1.1, 0, 0, TAU); g.fill();
        const nb = a.state === 'nibble' ? Math.sin(a.anim * 3) * 0.5 : 0;
        g.fillStyle = c1; g.beginPath(); g.ellipse(4.2 + nb, 0, 1.4, 1.1, 0, 0, TAU); g.fill();
        g.strokeStyle = '#8a7a60'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(3.6 + nb, -0.6); g.lineTo(2.8, -1.4); g.moveTo(3.6 + nb, 0.6); g.lineTo(2.8, 1.4); g.stroke();
        g.fillStyle = c2; g.fillRect(-4.2, -0.3, 0.8, 0.6);
      });
    }
  }

  /* ================================================================ pigeons */
  const PCOL = [['#a3a6ad', '#7e828c', '#4d5560'], ['#e4e1da', '#bdb9b1', '#77736e'], ['#9a7f6c', '#76604f', '#4f3c33']];
  function makeFlock(place) {
    const birds = [], n = 14 + ((rnd() * 10) | 0);
    const spots = [];
    for (let k = 0; k < 40 && spots.length < 4; k++) {
      const a = rnd() * TAU, d = rr(10, (place.r || 30) + 30);
      const x = place.x + Math.cos(a) * d, y = place.y + Math.sin(a) * d;
      if (walkSurfOk(x, y, false) && !N.world.collide(x, y, 3, 'walk').hit) spots.push([x, y, 14]);
    }
    if (!spots.length) return null;
    for (let i = 0; i < n; i++) {
      const s = spots[i % spots.length];
      const x = s[0] + (rnd() - 0.5) * s[2], y = s[1] + (rnd() - 0.5) * s[2];
      birds.push({ x, y, hx: x, hy: y, h: 0, vx: 0, vy: 0, st: 0, t: rnd() * 3, a: rnd() * TAU, ph: rnd() * TAU, col: rnd() < 0.15 ? 1 : rnd() < 0.1 ? 2 : 0 });
    }
    return { id: place.id, cx: place.x, cy: place.y, birds, spots, cool: 0 };
  }
  function scareFlock(f, sx, sy, r) {
    let n = 0;
    for (const b of f.birds) {
      if (b.st !== 0) continue;
      const d = Math.hypot(b.x - sx, b.y - sy);
      if (d > (r || 70)) continue;
      b.st = 1; n++;
      const a = Math.atan2(b.y - sy, b.x - sx) + (rnd() - 0.5) * 0.8;
      const sp = 60 + rnd() * 40;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.vh = 45 + rnd() * 25;
      b.t = 0; b.or = 50 + rnd() * 60; b.ow = (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.5);
      b.orb = Math.atan2(b.y - f.cy, b.x - f.cx); b.ft = rr(TUNE.pigeonScare.landAfter[0], TUNE.pigeonScare.landAfter[1]); b.alt = 30 + rnd() * 50;
    }
    if (n > 3 && !(f.cool > 0)) { f.cool = 4; sfx('pigeons', { x: f.cx, y: f.cy }); N.emit('pigeons:scatter', { x: f.cx, y: f.cy, n }); }
    return n;
  }
  function updateFlock(f, dt) {
    const p = N.player;
    f.cool -= dt;
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    const PS = TUNE.pigeonScare;
    for (const b of f.birds) {
      if (b.st === 0) {
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if ((sp > PS.speed && d < PS.r) || d < PS.near) { scareFlock(f, p.x, p.y, 70); break; }
      }
    }
    for (const b of f.birds) {
      b.ph += dt * (b.st ? 18 : 2);
      if (b.st === 0) {
        b.t -= dt;
        if (b.t < 0) { b.t = 0.6 + rnd() * 2.5; if (rnd() < 0.5) { b.a += (rnd() - 0.5) * 2; const nx = b.x + Math.cos(b.a) * 3, ny = b.y + Math.sin(b.a) * 3; if (Math.hypot(nx - b.hx, ny - b.hy) < 14) { b.x = nx; b.y = ny; } } }
      } else if (b.st === 1) {
        b.t += dt;
        b.h = Math.min(b.alt, b.h + b.vh * dt);
        b.orb += b.ow * dt * 0.9;
        const tx = f.cx + Math.cos(b.orb) * b.or, ty = f.cy + Math.sin(b.orb) * b.or;
        const blend = Math.min(1, b.t * 0.6);
        b.vx += ((tx - b.x) * 1.6 * blend - b.vx * blend * 0.9) * dt * 2.2; b.vy += ((ty - b.y) * 1.6 * blend - b.vy * blend * 0.9) * dt * 2.2;
        b.x += b.vx * dt; b.y += b.vy * dt; b.a = Math.atan2(b.vy, b.vx);
        if (b.t > b.ft) { const s = pick(f.spots); b.hx = s[0] + (rnd() - 0.5) * s[2]; b.hy = s[1] + (rnd() - 0.5) * s[2]; b.st = 2; }
      } else {
        const dx = b.hx - b.x, dy = b.hy - b.y, d = Math.hypot(dx, dy) || 1;
        const v = Math.min(70, d * 2.2 + 8);
        b.vx += ((dx / d) * v - b.vx) * Math.min(1, dt * 3); b.vy += ((dy / d) * v - b.vy) * Math.min(1, dt * 3);
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.h = Math.max(0, b.h - dt * Math.max(12, b.h * 1.1) * (d < 30 ? 2 : 0.8));
        b.a = Math.atan2(b.vy, b.vx);
        if ((d < 2 && b.h < 0.5) || (b.h <= 0 && d < 6)) { b.st = 0; b.h = 0; b.vx = b.vy = 0; b.t = 1 + rnd() * 2; }
      }
    }
  }
  function drawFlockGround(ctx, f) {
    const R = N.render, k = R.Z || 1;
    for (const b of f.birds) {
      if (b.st !== 0) continue;
      const X = R.sx(b.x, k), Y = R.sy(b.y, k);
      if (X < -4 || Y < -4 || X > R.W + 4 || Y > R.H + 4) continue;
      const c = PCOL[b.col], ca = Math.cos(b.a), sa = Math.sin(b.a);
      const peck = Math.sin(b.ph) > 0.6 ? 0.6 : 0;
      ctx.fillStyle = c[1]; ctx.fillRect(Math.round(X - ca * 1.2 * k) - 1, Math.round(Y - sa * 1.2 * k) - 1, 2, 2);
      ctx.fillStyle = c[0]; ctx.fillRect(Math.round(X) - 1, Math.round(Y) - 1, 2, 2);
      ctx.fillStyle = c[2]; ctx.fillRect(Math.round(X + ca * (1.6 + peck) * k), Math.round(Y + sa * (1.6 + peck) * k), 1, 1);
    }
  }
  function drawFlockSky(ctx, f) {
    const R = N.render;
    for (const b of f.birds) {
      if (b.st === 0) continue;
      const k = R.k(b.h), X = R.sx(b.x, k), Y = R.sy(b.y, k);
      if (X < -8 || Y < -8 || X > R.W + 8 || Y > R.H + 8) continue;
      const c = PCOL[b.col], ca = Math.cos(b.a), sa = Math.sin(b.a);
      const flap = Math.sin(b.ph) * 2.2 * k, wx = -sa, wy = ca;
      ctx.strokeStyle = c[1]; ctx.lineWidth = Math.max(1, 0.9 * k);
      ctx.beginPath();
      ctx.moveTo(X + wx * 3 * k - ca * flap * 0.4, Y + wy * 3 * k - sa * flap * 0.4); ctx.lineTo(X, Y); ctx.lineTo(X - wx * 3 * k - ca * flap * 0.4, Y - wy * 3 * k - sa * flap * 0.4);
      ctx.stroke();
      ctx.fillStyle = c[0]; ctx.fillRect(Math.round(X) - 1, Math.round(Y) - 1, 2, 2);
    }
  }
  /** Scare every flock (ours and the landmark flocks) within r of (x, y). */
  function scarePigeons(x, y, r) {
    let n = 0;
    for (const f of T.flocks) if (Math.hypot(f.cx - x, f.cy - y) < r + 120) n += scareFlock(f, x, y, r);
    // N.landmarks.flocks (Charminar, Mecca Masjid, Gulzar Houz) share the bird record format
    const LF = N.landmarks && N.landmarks.flocks;
    if (LF && LF.length) {
      for (const f of LF) {
        if (!f || !f.birds || Math.hypot(f.cx - x, f.cy - y) > r + 160) continue;
        let m = 0;
        for (const b of f.birds) {
          if (b.st !== 0 || Math.hypot(b.x - x, b.y - y) > r) continue;
          b.st = 1; m++;
          const a = Math.atan2(b.y - y, b.x - x) + (rnd() - 0.5) * 0.8, sp = 60 + rnd() * 40;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.vh = 45 + rnd() * 25; b.t = 0;
          b.or = 50 + rnd() * 60; b.ow = (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.5); b.orb = Math.atan2(b.y - f.cy, b.x - f.cx); b.ft = rr(5, 10); b.alt = 30 + rnd() * 50;
        }
        if (m > 3 && !(f.cool > 0)) { f.cool = 4; sfx('pigeons', { x: f.cx, y: f.cy }); }
        n += m;
      }
    }
    return n;
  }
  function updateFlocks(dt) {
    const p = N.player;
    const cap = caps().flocks;
    // activate flocks near the player
    let active = 0;
    for (const f of T.flocks) if (Math.hypot(f.cx - p.x, f.cy - p.y) < 1100) active++;
    if (active < cap && T.flockT <= 0) {
      T.flockT = 1;
      for (const id of TUNE.pigeonPlaces) {
        const pl = N.places[id];
        if (!pl || T.flocks.some((f) => f.id === id)) continue;
        if (Math.hypot(pl.x - p.x, pl.y - p.y) > 900) continue;
        const f = makeFlock(pl); if (f) { T.flocks.push(f); active++; }
        if (active >= cap) break;
      }
    }
    T.flockT -= dt;
    for (let i = T.flocks.length - 1; i >= 0; i--) {
      const f = T.flocks[i];
      if (Math.hypot(f.cx - p.x, f.cy - p.y) > 1400) { T.flocks.splice(i, 1); continue; }
      if (Math.hypot(f.cx - p.x, f.cy - p.y) < 900) updateFlock(f, dt);
    }
  }

  /* ================================================================ barks (story bible §8.1 + more) */
  const BARKS = [
    // [text, situations, predicate(ctx)?]
    ['*Hallu chalao, mamu!*', 'idle runPast hitVehicle horn'],
    ['*Kaiku itta bhaagra?* Train *chhoot ri kya?*', 'runPast'],
    ['*Hau hau, aara!*', 'idle'],
    ['*Nakko re baba, dhoop bhot hai.*', 'idle', (c) => c.m > 11 * 60 && c.m < 16 * 60 && c.summer],
    ['Current *gaya kya* phir se?', 'idle', (c) => c.style === 'colony' && c.m > 17 * 60 && c.m < 22 * 60],
    ['*Bo kaata! Lapet, lapet!*', 'idle', (c) => c.mon === 1],
    ['Chai *ku chalte kya?*', 'idle'],
    ['Score *kitta hua?*', 'idle', (c) => c.mon === 2 || c.mon === 3],
    ['*Kya bolte miyan*, this heat!', 'idle', (c) => c.lang !== 'te' && (c.summer || c.m > 11 * 60 && c.m < 16 * 60)],
    ['*Ainvayich ghoomra.* Just roaming.', 'idle'],
    ['*Light le, mamu.*', 'bumped'],
    ['*Emaindi ra?*', 'idle bumped', (c) => c.lang === 'te'],
    ['*Abba!* *Choosi nadavu!*', 'bumped hitVehicle', (c) => c.lang === 'te'],
    ['*Ammo*, late *ayipoyindi!*', 'idle', (c) => c.m > 6 * 60 && c.m < 10 * 60 && c.lang === 'te'],
    ['*Meri chappal kidhar gayi?*', 'idle bumped'],
    ['Bus *aayi! Bhaago!*', 'idle bus', (c) => c.near.bus_stop || c.near.transport],
    ['*Tondaraga raa*, cinema starts!', 'idle', (c) => c.did === 'rtc_x' || c.near.cinema],
    ['*Paani aara!* Motor on *karo!*', 'idle', (c) => c.style === 'colony'],
    ['India *jeeta kya?*', 'idle', (c) => c.mon === 3 && c.day === 23 && c.m > 17 * 60],
    ['*Chalo ghar ku, andhera hora.*', 'idle', (c) => c.m > 17 * 60 + 30 && c.m < 19 * 60 + 45],
    ['*Baigan!* I don\'t believe it.', 'idle'],
    ['*Pakka promise*, I\'ll return it tomorrow.', 'idle', (c) => c.style === 'colony'],
    ['*Abbo, enta traffic!*', 'idle', (c) => c.style === 'market' || c.style === 'colonial'],
    ['*Gaay hatao re*, road is blocked!', 'idle', (c) => c.cowNear],
    ['Exam *kab se?* *Baap re!*', 'idle', (c) => c.mon === 3 && (c.role === 'student' || c.role === 'college')],
    ['*Thinnava?* *Raa*, eat something.', 'idle wave', (c) => c.role === 'aunty' && c.lang === 'te'],
    ['*Kya re*, chhote, lost?', 'idle wave', (c) => c.style === 'oldcity'],
    ['Hotel Madina\'s haleem has started, *miyan!*', 'idle', (c) => c.style === 'oldcity' && c.ramzan],
    ['*Chand dikha kya?*', 'idle', (c) => c.ramzan && c.night],
    ['Our Ganesh is taller than theirs. By one inch.', 'idle', (c) => c.ganesh],
    ['*Ganpati Bappa Morya!*', 'idle', (c) => c.ganesh],
    ['Make way for the *bonam*, *amma*.', 'idle', (c) => c.bonalu],
    ['Numaish *chalre kya*, this Sunday?', 'idle', (c) => c.numaish],
    ['Delhi papad! Biggest papad in the world!', 'idle vendor', (c) => c.numaish && c.near.festival],
    ['Software job, *re*. Onsite. America.', 'idle', (c) => c.style === 'hitec'],
    ['Five years ago, goats. Now, glass.', 'idle', (c) => c.style === 'hitec'],
    ['*Ek pauna*, quick, I have a bus.', 'idle', (c) => c.near.irani_cafe],
    ['Paper boats! Drain race at four o\'clock!', 'idle', (c) => c.rain && (c.role === 'kid' || c.role === 'student')],
    ['*Baarish aari*, cover the cycle seat!', 'idle', (c) => c.monsoon],
    ['Last over! Only last over! ...Then one more.', 'idle', (c) => c.role === 'kid'],
    ['*Doodh-bhaat* bats last!', 'idle', (c) => c.role === 'kid'],
    ['Clock Tower *ke paas milo*, six o\'clock.', 'idle', (c) => c.did === 'secunderabad'],
    ['*Footboard nakko*, inside, inside!', 'bus', (c) => c.did === 'koti' || c.near.bus_stop],
    ['Professor Pasha says the tunnel is real. My uncle says Pasha is real. Both are lying.', 'idle', (c) => rnd() < 0.3],
    ['*Mee abbayi* EAMCET rank *entha?*', 'idle', (c) => c.role === 'aunty' && c.lang === 'te'],
    ['In our time, one rupee was a rupee.', 'idle', (c) => c.role === 'old' || c.role === 'elder'],
    ['Bhutta! *Garam garam* bhutta! Lemon-chilli!', 'idle vendor', (c) => c.near.tank && c.m > 16 * 60],
    ['Pigeons! Mind your head, *miyan*, they have no manners.', 'idle', (c) => c.near.charminar],
    // reactions
    ['*Arre!*', 'dodge'], ['*Abba!*', 'dodge', (c) => c.lang === 'te'], ['*Dekh ke!*', 'dodge'], ['*Ayyo!*', 'dodge', (c) => c.lang === 'te'],
    ['*Hallu, hallu!*', 'dodge horn'], ['*Arey baba!*', 'dodge'], ['*Ya Allah!*', 'dodge', (c) => c.lang === 'dk'],
    ['*Kya re*, eyes at home?', 'bumped hitVehicle'], ['Who taught you to drive, *mamu*?', 'hitVehicle'], ['*Nakko re*, slowly!', 'bumped hitVehicle'],
    ['*Ayyo*, my vegetables!', 'bumped hitVehicle', (c) => c.role === 'aunty'], ['Sorry *bolo*, at least!', 'bumped'],
    ['*Kaiku horn bajare?*', 'horn hornSpam'], ['Horn OK please. Not horn ALL please!', 'horn hornSpam'], ['*Arre*, I heard, I heard!', 'horn'],
    ['Namaste, *beta*!', 'wave', (c) => c.lang !== 'dk'], ['*Salaam*, *chhote*!', 'wave', (c) => c.lang === 'dk'], ['Hi hi! *Bagunnava?*', 'wave', (c) => c.lang === 'te'],
    ['*Khuda hafiz*, *beta*.', 'wave', (c) => c.lang === 'dk'],
    // vendors / porters / buses
    ['*Arati pandlu! Chakkarakeli!*', 'vendor', (c) => c.cart === 'banana_cart'], ['*Mallepoolu!* Two rupees a *moora*!', 'vendor', (c) => c.cart === 'flower_cart'],
    ['*Kobbari bondam!* Water is sweet!', 'vendor', (c) => c.cart === 'coconut_cart'], ['Balloon! Balloon! Two rupees!', 'vendor', (c) => c.balloons],
    ['Raddi paper! Old newspaper, bottle!', 'vendor', (c) => !c.cart && !c.balloons], ['*Chakku saan!* Knives sharpened!', 'vendor', (c) => !c.cart && !c.balloons],
    ['*Coolie? Coolie?*', 'idle', (c) => c.role === 'porter'], ['127K *kab aayegi*?', 'bus idle', (c) => c.near.bus_stop],
  ].map((b) => ({ t: b[0], s: b[1].split(' '), ok: b[2] || null }));
  function barkCtx(p) {
    const d = calDate(), m = mins();
    const near = {};
    for (const z of T.zoneList) if (Math.hypot(z.x - p.x, z.y - p.y) < z.r + 90) near[z.kind] = true;
    if (N.places.charminar_plaza && Math.hypot(N.places.charminar_plaza.x - p.x, N.places.charminar_plaza.y - p.y) < 260) near.charminar = true;
    if (N.places.tank_bund && Math.hypot(N.places.tank_bund.x - p.x, N.places.tank_bund.y - p.y) < 500) near.tank = true;
    if (N.places.nampally_exhibition && Math.hypot(N.places.nampally_exhibition.x - p.x, N.places.nampally_exhibition.y - p.y) < 400) near.festival = true;
    const dist = districtAt(p.x, p.y);
    return {
      m, mon: d.m, day: d.d, dow: d.dow, night: night(), summer: summer(), rain: raining(), monsoon: d.m >= 6 && d.m <= 9,
      style: styleOf(dist), did: dist && dist.id, near, role: p.role, lang: p.lang,
      ramzan: flagOn('ramzan'), ganesh: flagOn('ganesh') || flagOn('ganesh_immersion'), bonalu: flagOn('bonalu'), numaish: flagOn('numaish'),
      cowNear: T.animals.some((a) => a.species === 'cow' && Math.hypot(a.x - p.x, a.y - p.y) < 120),
      cart: p.cart && p.cart.kind, balloons: !!p.balloons,
    };
  }
  function bubble(target, text, opts) {
    try { if (N.dialogue && N.dialogue.bark) return N.dialogue.bark(target, text, Object.assign({ name: false, blip: false }, opts || {})); } catch (e) { N.err('traffic.bark', e); }
    return null;
  }
  /** A bark line by situation ('idle' 'runPast' 'bumped' 'hitVehicle' 'dodge' 'horn' 'hornSpam' 'wave' 'vendor' 'bus') or text. */
  function bark(p, situ, force) {
    if (!p || !p.alive) return false;
    const now = N.time.real || 0;
    if (!force && (p.barkCD > 0 || now - T.barkT < TUNE.barkGap)) return false;
    const pl = N.player;
    if (Math.hypot(p.x - pl.x, p.y - pl.y) > 340 || !N.render.inView(p.x, p.y, 20)) return false;
    const z = respectAt(p.x, p.y);
    if (z && z.part === 'compound' && situ !== 'wave') return false;
    let text = null;
    if (BARK_SITU.has(situ)) {
      const c = barkCtx(p);
      const pool = BARKS.filter((b) => b.s.indexOf(situ) >= 0 && b.t !== T.lastBark && (!b.ok || b.ok(c)));
      if (!pool.length) return false;
      // prefer specific (tagged) lines over generic ones a bit
      const spec = pool.filter((b) => b.ok);
      text = (spec.length && rnd() < 0.6 ? pick(spec) : pick(pool)).t;
    } else text = String(situ || '');
    if (!text) return false;
    T.lastBark = text; T.barkT = now; p.barkCD = TUNE.barkCooldown;
    const loud = situ === 'bumped' || situ === 'hitVehicle' || situ === 'dodge';
    bubble(p, text, { blip: loud || situ === 'wave', secs: loud ? 2.2 : undefined });
    return true;
  }
  const BARK_SITU = new Set(['idle', 'runPast', 'bumped', 'hitVehicle', 'dodge', 'horn', 'hornSpam', 'wave', 'vendor', 'bus']);

  /* ================================================================ reactions to horns and bumps */
  function onHorn(d) {
    if (!d || !T.ready) return;
    const pl = N.player;
    const fromPlayer = d.who === pl || (d.vehicle && d.vehicle === pl.vehicle);
    if (!fromPlayer) {
      // a traffic horn: people in front of that vehicle step aside
      const v = d.vehicle;
      if (v && v.tr) {
        const c = Math.cos(v.angle), s = Math.sin(v.angle);
        for (const p of T.peds) {
          if (p.down || p.hold) continue;
          const dx = p.x - v.x, dy = p.y - v.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
          if (lx > 0 && lx < 50 && Math.abs(ly) < v.T.d / 2 + 6 && N.world.surfaceAt(p.x, p.y) === N.SURF.ROAD) {
            const side = Math.sign(ly) || 1; p.dodgeT = 0.3; p.dvx = -s * side * 60; p.dvy = c * side * 60;
          }
        }
      }
      return;
    }
    const x = d.x != null ? d.x : pl.x, y = d.y != null ? d.y : pl.y;
    const pv = pl.vehicle;
    const reach = (N.flags && (N.flags.unlock_bell || N.flags.double_bell)) && pv && pv.T.pedal ? 80 : TUNE.cowHornR;
    // pigeons, cows, dogs
    scarePigeons(x, y, TUNE.pigeonScare.hornR);
    for (const a of T.animals) {
      const dd = Math.hypot(a.x - x, a.y - y);
      if (a.species === 'cow' && dd < reach) wakeCow(a);
      else if (a.species === 'dog' && dd < 90 && rnd() < 0.6) sfx('dog_bark', { x: a.x, y: a.y, delay: rr(0.1, 0.5) });
      else if (a.species === 'goat' && dd < 40 && a.state === 'nibble') { a.state = 'graze'; a.goal = null; }
    }
    if (pv) {
      // the vehicle ahead moves over and slows; autos honk back; people in front step aside
      const c = Math.cos(pv.angle), s = Math.sin(pv.angle);
      for (const v of T.vehicles) {
        if (!v.tr) continue;
        const dx = v.x - pv.x, dy = v.y - pv.y, dd = Math.hypot(dx, dy);
        if (dd > TUNE.playerHornR + v.T.w / 2 || dd < 1) continue;
        if ((dx * c + dy * s) / dd < TUNE.playerHornCone) continue;
        if (Math.abs(U.angleDiff(v.angle, pv.angle)) > 1.2) continue;
        v.tr.yieldT = TUNE.hornSlowSecs;
        if (v.type === 'auto' && rnd() < TUNE.autoHonkBack) setTimeout(() => { if (v.alive && v.tr) { v.tr.hornCD = 0; honk(v, 'honkback'); } }, 400);
      }
      for (const p of T.peds) {
        if (p.down || p.hold || p.spotter) continue;
        const dx = p.x - pv.x, dy = p.y - pv.y, dd = Math.hypot(dx, dy);
        if (dd > TUNE.playerHornR || dd < 1) continue;
        if ((dx * c + dy * s) / dd < TUNE.playerHornCone) continue;
        const ly = -dx * s + dy * c, side = Math.sign(ly) || 1;
        const tx = p.x - s * side * rr(12, 20), ty = p.y + c * side * rr(12, 20);
        if (N.world.isWalkable(tx, ty)) { p.dodgeT = 0.28; p.dvx = (tx - p.x) / 0.28; p.dvy = (ty - p.y) / 0.28; }
        hornHit(p);
        if (rnd() < TUNE.hornBark) bark(p, 'horn');
      }
    } else {
      // on foot: "Oye!" — people within 40 u turn to look (shops.js may treat it as "AUTO!")
      for (const p of T.peds) {
        if (p.down || p.hold) continue;
        const dd = Math.hypot(p.x - x, p.y - y);
        if (dd < 40) { p.lookT = rr(1, 2); p.lookAt = pl; if (dd < 30 && (p.level || null) === (pl.level || null)) hornHit(p); }
      }
    }
  }
  function hornHit(p) {
    const now = N.time.real || 0;
    p.hornHits = (p.hornHits || []).filter((t) => now - t < 3);
    p.hornHits.push(now);
    if (p.hornHits.length >= 3) {
      p.hornHits = [];
      bark(p, 'hornSpam', true);
      try { if (N.wanted && typeof N.wanted.addHeat === 'function') N.wanted.addHeat(10, 'horn'); } catch (e) { N.err('traffic.horn', e); }
    }
  }
  function onBump(d) {
    if (!d || !T.ready) return;
    const q = d.b;
    if (q && q.amb && d.vehicle && d.ped) {
      // a vehicle knocked a pedestrian down (vehicles.js gave it knockT + a kick): longer for harder hits
      q.knockT = Math.max(q.knockT || 0, clamp(0.6 + (d.speed || 0) / 300, 0.6, 1.0));
      q.hitBy = 'vehicle';
      N.emit('ped:knocked', { ped: q, by: d.vehicle, speed: d.speed });
      lookers(q.x, q.y);
    } else if (q && q.kind === 'animal' && q.species === 'dog' && d.vehicle) {
      q.state = 'wander'; q.goal = null;
    }
  }

  /* ================================================================ player offers: wave, feed a dog */
  const waveSpec = { label: 'Namaste', priority: -1, dist: 0, use: null, target: null };
  const feedSpec = { label: 'Feed dog', priority: 2, dist: 0, use: null, target: null };
  function playerOffers() {
    const pl = N.player;
    if (!pl || pl.vehicle || pl.controlsLocked || pl.hidden || N.state.mode !== 'play') return;
    const sp = Math.hypot(pl.vx || 0, pl.vy || 0);
    // feed a stray a biscuit (systems §11.3)
    const food = (pl.itemCount && (pl.itemCount('biscuits') > 0 ? 'biscuits' : pl.itemCount('osmania_packet') > 0 ? 'osmania_packet' : null)) || null;
    if (food) {
      let best = null, bd = 18;
      for (const a of T.animals) if (a.species === 'dog' && !(a.fedT > 0)) { const d = Math.hypot(a.x - pl.x, a.y - pl.y); if (d < bd) { bd = d; best = a; } }
      if (best) { feedSpec.dist = bd; feedSpec.target = best; feedSpec.food = food; feedSpec.use = useFeed; N.interact.offer(feedSpec); }
    }
    if (sp > 30) return;
    let best = null, bd = 16;
    for (const p of T.peds) {
      if (p.down || p.hold || p.spotter || p.mode === 'board') continue;
      const d = Math.hypot(p.x - pl.x, p.y - pl.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) {
      waveSpec.label = best.lang === 'dk' ? '*Salaam*' : '*Namaste*';
      waveSpec.label = waveSpec.label.replace(/\*/g, '');
      waveSpec.dist = bd; waveSpec.target = best; waveSpec.use = useWave;
      N.interact.offer(waveSpec);
    }
  }
  function useWave() {
    const p = waveSpec.target; if (!p || !p.alive) return;
    p.lookT = 2.2; p.lookAt = N.player;
    bubble('player', p.lang === 'dk' ? '*Salaam!*' : '*Namaste!*', { secs: 1.4 });
    setTimeout(() => { if (p.alive) bark(p, 'wave', true); }, 650);
    N.emit('ped:wave', { ped: p });
  }
  function useFeed() {
    const a = feedSpec.target, pl = N.player; if (!a || !a.alive) return;
    if (pl.addItem) pl.addItem(feedSpec.food, -1);
    a.fedT = TUNE.dogFollowSecs; a.state = 'follow'; a.target = null;
    sfx('munch', { x: a.x, y: a.y }); sfx('dog_bark', { x: a.x, y: a.y, delay: 0.5, vol: 0.5 });
    if (N.hud) N.hud.toast('The dog wags its whole body. A friend for a while!', 2400);
    N.emit('dog:fed', { dog: a });
  }
  /** Fed dogs bark at foot pursuers within 80 u (they stop for 1.5 s): wanted.js calls this. */
  function dogScare(pursuer) {
    for (const a of T.animals) {
      if (a.species !== 'dog' || !(a.fedT > 0)) continue;
      if (Math.hypot(a.x - pursuer.x, a.y - pursuer.y) < TUNE.dogScareR) { a.barkAt = pursuer; a.barkT = TUNE.dogScareSecs; return TUNE.dogScareSecs; }
    }
    return 0;
  }

  /* ================================================================ density + events */
  function activeEvents(x, y) {
    const out = [];
    const d = calDate();
    for (const ev of TUNE.events) {
      if (ev.flag && !flagOn(ev.flag)) continue;
      if (ev.dow != null && d.dow !== ev.dow) continue;
      if (ev.hours && !inHours(ev.hours)) continue;
      if (ev.place) { const pl = N.places[ev.place]; if (!pl || Math.hypot(pl.x - x, pl.y - y) > ev.r) continue; }
      if (ev.style && styleOf(districtAt(x, y)) !== ev.style) continue;
      out.push(ev);
    }
    return out;
  }
  function vehTimeMul(m) {
    if (m >= 23 * 60 || m < 5 * 60) return 0.25;
    if (m < 7 * 60) return 0.55;
    if (m >= 8 * 60 && m < 10 * 60) return 1.3;
    if (m >= 17 * 60 + 30 && m < 20 * 60) return 1.3;
    if (m >= 20 * 60) return 0.5;
    return 1;
  }
  function pedTimeMul(m) {
    if (m < 4 * 60 + 30) return 0.1;
    if (m < 5 * 60 + 30) return 0.15;
    if (m < 6 * 60 + 30) return 0.45;
    if (m < 12 * 60) return 1;
    if (m < 15 * 60 + 30) return summer() ? 0.6 : 0.85;
    if (m < 16 * 60 + 30) return 1.15;
    if (m < 19 * 60 + 45) return 1.05;
    if (m < 22 * 60) return 0.75;
    return 0.3;
  }
  function updateTargets() {
    const c = camC(), d = districtAt(c.x, c.y), style = styleOf(d), m = mins(), cp = caps();
    let vm = vehTimeMul(m), pm = pedTimeMul(m);
    for (const ev of activeEvents(c.x, c.y)) { if (ev.veh) vm *= ev.veh; if (ev.ped) pm *= ev.ped; }
    // Charminar after 22:00 (buses stop circling) and the closures
    if (N.places.charminar_plaza && Math.hypot(N.places.charminar_plaza.x - c.x, N.places.charminar_plaza.y - c.y) < 500 && (m >= 22 * 60 || m < 5 * 60)) vm *= 0.3;
    if (raining()) pm *= 0.6;
    const dens = clamp(+API.density || 0, 0, 2);
    T.targets.veh = Math.round(clamp(cp.veh * (TUNE.vehStyle[style] || 0.6) * vm * dens, 0, cp.veh));
    T.targets.ped = Math.round(clamp(cp.ped * (TUNE.pedStyle[style] || 0.5) * pm * dens, 0, cp.ped));
    T.targets.ani = cp.ani;
    T.pedMul = clamp(pm, 0.2, 2);
    T.style = style;
  }

  /* ================================================================ system */
  function cleanup() {
    const vr = viewR(), c = camC();
    for (let i = T.vehicles.length - 1; i >= 0; i--) {
      const v = T.vehicles[i];
      if (!v.alive) { T.vehicles.splice(i, 1); continue; }
      if (v.driver === N.player || v.controller !== trafficCtl) { // borrowed / taken over
        if (v.kin) setKinematic(v, false);
        T.vehicles.splice(i, 1); if (v.tr) v.tr = null; v.trafficOwned = false;
        if (v.driver === N.player) { v.wasTraffic = true; T.abandoned.push(v); }
        continue;
      }
      const d = Math.hypot(v.x - c.x, v.y - c.y);
      if (d > vr + TUNE.despawnVeh && !N.render.inView(v.x, v.y, 80)) { despawnVehicle(v); }
    }
    for (let i = T.boats.length - 1; i >= 0; i--) {
      const v = T.boats[i];
      if (!v.alive || v.driver === N.player) { T.boats.splice(i, 1); continue; }
      if (Math.hypot(v.x - c.x, v.y - c.y) > vr + 900 && !N.render.inView(v.x, v.y, 80)) { T.boats.splice(i, 1); try { N.vehicles.remove(v); } catch (e) { v.alive = false; } }
    }
    // traffic vehicles the player rode and left behind: tidy them away once far and unseen
    for (let i = T.abandoned.length - 1; i >= 0; i--) {
      const v = T.abandoned[i];
      if (!v.alive) { T.abandoned.splice(i, 1); continue; }
      if (v.driver === N.player) continue;
      if (!v.parked) v.parked = true; // borrowing it again counts as taking a parked vehicle
      if (Math.hypot(v.x - c.x, v.y - c.y) > vr + 1400 && !N.render.inView(v.x, v.y, 80)) { T.abandoned.splice(i, 1); try { N.vehicles.remove(v); } catch (e) { v.alive = false; } }
    }
    for (let i = T.peds.length - 1; i >= 0; i--) {
      const p = T.peds[i];
      if (!p.alive) { T.peds.splice(i, 1); continue; }
      if (p.spotter || p.hold) continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d > vr + TUNE.despawnPed && !N.render.inView(p.x, p.y, 40)) { p.alive = false; N.entities.remove(p); T.peds.splice(i, 1); }
    }
    for (let i = T.animals.length - 1; i >= 0; i--) {
      const a = T.animals[i];
      if (!a.alive) { T.animals.splice(i, 1); continue; }
      if (a.fedT > 0) continue;
      const d = Math.hypot(a.x - c.x, a.y - c.y);
      if (d > vr + TUNE.despawnAni && !N.render.inView(a.x, a.y, 40)) { N.entities.remove(a); T.animals.splice(i, 1); }
    }
  }
  function spawnBoats() {
    const c = camC();
    if (!lakePts) lakePoint(c.x, c.y, 1);
    if (!lakePts || !lakePts.bb) return;
    const bb = lakePts.bb;
    const near = c.x > bb[0] - 700 && c.x < bb[2] + 700 && c.y > bb[1] - 700 && c.y < bb[3] + 700;
    if (!near || T.boats.length >= 3 || !N.vehicles.TYPES.boat || !lakePts.length) return;
    const m = mins();
    if (m < 9 * 60 || m > 19 * 60 + 30) return;
    const p = pick(lakePts);
    if (N.render.inView(p.x, p.y, 40) && T.fillT <= 0) return;
    if (N.entities.query(p.x, p.y, 40, isVeh).length) return;
    const v = N.vehicles.spawn('boat', p.x, p.y, rnd() * TAU, { driver: { look: makeLook('lungi', 'colonial').look, npc: true } });
    if (!v) return;
    v.tr = { t: 0, goal: null, goalT: 0, boat: true };
    v.controller = trafficCtl; v.trafficOwned = true; v.noEnter = true;
    T.boats.push(v);
  }
  let spawnRR = 0;
  function update(dt) {
    if (!N.world || !N.world.built) return;
    if (!RI.built) { if (!buildIndex()) return; defineTypes(); }
    const t0 = performance.now();
    T.ready = true;
    if (T.fillT > 0) T.fillT -= dt;
    T.targetT -= dt;
    if (T.targetT <= 0) { T.targetT = 0.5; updateTargets(); autoClosures(); }
    T.zoneT -= dt;
    if (T.zoneT <= 0) { T.zoneT = 1.0; refreshZones(); }
    T.cleanT -= dt;
    if (T.cleanT <= 0) { T.cleanT = 0.25; cleanup(); }
    kinPass(dt);
    holdCows();
    updatePodiums(dt);
    updateFlocks(dt);
    // spawning
    if (API.enabled !== false && N.state.mode === 'play') {
      const cp = caps();
      let budget = T.fillT > 0 ? TUNE.fillPerFrame : TUNE.spawnPerFrame;
      const force = T.fillT > 0;
      let tries = budget * 3;
      while (budget > 0 && tries-- > 0) {
        spawnRR = (spawnRR + 1) % 4;
        let made = null;
        if (spawnRR === 0 && T.vehicles.length < Math.min(cp.veh, T.targets.veh)) made = spawnTrafficVehicle(force);
        else if (spawnRR === 1 && T.peds.length < Math.min(cp.ped, T.targets.ped)) {
          // crowd zones first (the nearest under-filled one), then footpath walkers
          let z = null;
          for (const q of T.zoneList) if (zoneCount(q) < zoneWant(q)) { if (!z || Math.hypot(q.x - N.player.x, q.y - N.player.y) < Math.hypot(z.x - N.player.x, z.y - N.player.y)) z = q; }
          made = z && rnd() < 0.65 ? spawnZonePed(z, force) : spawnWalker(force);
        } else if (spawnRR === 2 && T.animals.length < cp.ani) made = spawnAnimal(force);
        else if (spawnRR === 3) { spawnBoats(); spawnSpecialPeds(force); }
        if (made) budget--;
      }
    }
    if (N.state.mode === 'play') playerOffers();
    T.ms = performance.now() - t0;
  }
  // balloon sellers in the parks at dusk
  function spawnSpecialPeds(force) {
    const m = mins();
    if (m < 16 * 60 + 30 || m > 20 * 60 + 30 || T.peds.length >= caps().ped) return;
    for (const id of ['lumbini_park', 'ntr_gardens', 'public_gardens', 'necklace_road', 'tank_bund', 'indira_park', 'sanjeevaiah_park', 'nampally_exhibition']) {
      const pl = N.places[id];
      if (!pl || Math.hypot(pl.x - N.player.x, pl.y - N.player.y) > viewR() + 220) continue;
      if (T.peds.some((p) => p.balloons && p.zone && p.zone.place === pl)) continue;
      const z = { place: pl, x: pl.x, y: pl.y, r: Math.max(40, pl.r || 40), spec: TUNE.zones.plaza, kind: 'park' };
      const pos = zonePoint(z);
      if (!pos || (!force && N.render.inView(pos.x, pos.y, 20))) continue;
      const cols = []; for (let i = 0; i < 7; i++) cols.push(pick(['#e8203a', '#f2c230', '#30a050', '#2a6ad8', '#f06aa0', '#f08a24', '#8a3ad8']));
      const p = spawnPedAt(pos.x, pos.y, 'vendor', 'colony', { mode: 'wander', zone: z, balloons: cols });
      if (p) { p.look = Object.assign({}, p.look, { prop: null }); p.spd = 20; }
      return;
    }
  }
  function draw() {
    if (!T.ready) return;
    const R = N.render, v = R.view;
    // one batched contact-shadow fill for every visible ped and animal
    R.queue('shadow', 1, drawShadows);
    for (const f of T.flocks) {
      if (f.cx < v.x0 - 260 || f.cx > v.x1 + 260 || f.cy < v.y0 - 260 || f.cy > v.y1 + 260) continue;
      if (!f._g) { f._g = (ctx) => drawFlockGround(ctx, f); f._s = (ctx) => drawFlockSky(ctx, f); }
      R.queue('actors', f.cy - 4000, f._g);
      if (f.birds.some((b) => b.st !== 0)) R.queue('sky', 0, f._s);
    }
  }
  function drawShadows(ctx) {
    const R = N.render, s = R.sun, Z = R.Z || 1, v = R.view;
    const ox = s.sx * 1.6, oy = s.sy * 1.6;
    ctx.globalAlpha = 0.28 * s.strength + 0.08;
    ctx.fillStyle = '#1a1020';
    ctx.beginPath();
    const add = (e, rx, ry) => {
      if (e.x < v.x0 - 10 || e.x > v.x1 + 10 || e.y < v.y0 - 10 || e.y > v.y1 + 10) return;
      const X = R.sx(e.x + ox, Z), Y = R.sy(e.y + oy, Z);
      ctx.moveTo(X + rx * Z, Y); ctx.ellipse(X, Y, rx * Z, ry * Z, e.angle || 0, 0, TAU);
    };
    for (const p of T.peds) if (p.alive && !p.hidden) add(p, p.down ? 5 : 3.4, p.down ? 2.6 : 2.6);
    for (const a of T.animals) if (a.alive) add(a, a.species === 'cow' ? 10 : 4.4, a.species === 'cow' ? 5 : 2.2);
    for (const c of T.constables) if (c.alive) add(c, 3.2, 2.4);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function clearAll(pred) {
    for (const v of T.vehicles.slice()) if (!pred || pred(v)) despawnVehicle(v);
    const L = N.vehicles && N.vehicles.list;
    if (L && !pred) for (const v of T.vehicles) if (v.kin) setKinematic(v, false);
    for (const v of T.boats.slice()) if (!pred || pred(v)) { try { N.vehicles.remove(v); } catch (e) { v.alive = false; } T.boats.splice(T.boats.indexOf(v), 1); }
    for (const p of T.peds.slice()) if (!pred || pred(p)) { N.entities.remove(p); T.peds.splice(T.peds.indexOf(p), 1); }
    for (const a of T.animals.slice()) if (!pred || pred(a)) { N.entities.remove(a); T.animals.splice(T.animals.indexOf(a), 1); }
    if (!pred) {
      for (const c of T.constables) N.entities.remove(c);
      T.constables.length = 0;
      if (RI.podium) for (const pod of RI.podium.values()) pod.cop = null;
      T.flocks.length = 0;
    }
  }
  function resetAll() {
    clearAll();
    T.abandoned = [];
    T.vehicles.length = 0; T.peds.length = 0; T.animals.length = 0; T.boats.length = 0;
    T.zoneCache = new Map(); T.zoneList = []; T.fillT = TUNE.fillSecs; T.flockT = 0;
  }
  T.abandoned = []; T.zoneCache = new Map(); T.flockT = 0;

  const API = (N.traffic = {
    enabled: true, density: 1, TUNE,
    // spawn weights come from N.vehicles.TYPES[t].spawn (typeWeights): vehicles.js leaves TUNE.mix alone,
    // and the Hero / Hercules / Scooty riders get their looks from driverLook (vehicles.js does not restyle them)
    readsTypeWeights: true, styledRiders: true,
    get vehicles() { return T.vehicles; }, get peds() { return T.peds; }, get animals() { return T.animals; },
    get constables() { return T.constables; }, get flocks() { return T.flocks; }, get boats() { return T.boats; },
    setDensity(d) { API.density = clamp(+d || 0, 0, 2); T.targetT = 0; return API.density; },
    clear(pred) { clearAll(typeof pred === 'function' ? pred : null); },
    stats() { return { vehicles: T.vehicles.length, peds: T.peds.length, animals: T.animals.length, flocks: T.flocks.length, boats: T.boats.length, constables: T.constables.length, targets: Object.assign({}, T.targets), zones: T.zoneList.length, ms: +T.ms.toFixed(3), sprites: sprMade }; },
    /** An empty ambient auto near (x, y), released from traffic control (shops.js "AUTO!"). */
    claimAuto(x, y, r) {
      let best = null, bd = r || 260;
      for (const v of T.vehicles) {
        if (v.type !== 'auto' || !v.tr || v.tr.fare || !v.alive || v.driver === N.player) continue;
        const d = Math.hypot(v.x - x, v.y - y);
        if (d < bd) { bd = d; best = v; }
      }
      return best ? release(best) : null;
    },
    release,
    busAt(x, y, r) {
      for (const v of T.vehicles) if (v.type === 'bus' && v.tr && v.tr.stopT != null && Math.hypot(v.x - x, v.y - y) < (r || 60)) return v;
      return null;
    },
    spawnVehicle(type, at) {
      if (!RI.built && !buildIndex()) return null;
      if (!at) return spawnTrafficVehicle(true);
      const n = N.world.roads.nearestNode(at.x, at.y);
      if (!n || !n.links.length) return null;
      // head along the link that best matches at.angle (or at.to: a node id), else the first link
      let lk = n.links[0];
      if (at.to != null) lk = n.links.find((l) => l.to === at.to) || lk;
      else if (at.angle != null) {
        let bd = -2;
        for (const l of n.links) { const o = RI.nodes[l.to], L = Math.hypot(o.x - n.x, o.y - n.y) || 1, dd = ((o.x - n.x) * Math.cos(at.angle) + (o.y - n.y) * Math.sin(at.angle)) / L; if (dd > bd) { bd = dd; lk = l; } }
      }
      const B = RI.nodes[lk.to], g = geom(n, B);
      const v = N.vehicles.spawn(type, at.x, at.y, at.angle != null ? at.angle : Math.atan2(g.uy, g.ux), { driver: { look: driverLook(type, styleOf(districtAt(at.x, at.y))), npc: true } });
      if (!v) return null;
      const d0 = clamp((at.x - n.x) * g.ux + (at.y - n.y) * g.uy, 0, g.L);
      return setupTraffic(v, n, B, d0, true, styleOf(districtAt(at.x, at.y)));
    },
    spawnPed(role, at) {
      at = at || {};
      const x = at.x != null ? at.x : N.player.x + 20, y = at.y != null ? at.y : N.player.y;
      const style = styleOf(districtAt(x, y));
      return spawnPedAt(x, y, role || pickRole(style), style, { mode: at.zone ? 'wander' : 'walk', zone: at.zone || null, look: at.look });
    },
    bark, bubble, sense, scarePigeons, wakeCow, dogScare,
    friendlyDogs() { return T.animals.filter((a) => a.species === 'dog' && a.fedT > 0); },
    closeRoads(id, c) { if (!c) RI.closures.delete(id); else RI.closures.set(id, { x: c.x, y: c.y, r: c.r || 120 }); },
    crowd(placeId) { const z = T.zoneCache.get(placeId); return z ? { kind: z.kind, r: z.r, n: zoneCount(z), want: zoneWant(z), active: zoneActive(z) } : null; },
    /** Is (x, y) inside a crowd zone right now? (wanted.js: sight x0.6, unseen x2) */
    inCrowd(x, y) {
      for (const z of T.zoneList) if ((z.kind === 'market' || z.kind === 'plaza' || z.kind === 'transport' || z.kind === 'cinema') && Math.hypot(z.x - x, z.y - y) < z.r + 10 && zoneCount(z) >= 4) return true;
      return false;
    },
    /** spawn weights {type: w} for a district style; opts {kind: edge kind, minutes, x, y} */
    typeWeights, pickType: (style, kind) => pickType(style, { kind: kind || 'street' }), driverLook,
    /** is (x, y) in or within TUNE.respectR of a respect zone (no horns, traffic crawls)? */
    quietAt,
    makeLook, pickRole, blitPerson, laneOffset, edgeAny, geom, lanePt, ringNode, nodesNear,
    get index() { return RI; },
    // debug / tests
    _T: T,
    fill() { T.fillT = TUNE.fillSecs; },
  });

  N.on('horn', (d) => { try { onHorn(d); } catch (e) { N.err('traffic.horn', e); } });
  N.on('bump', (d) => { try { onBump(d); } catch (e) { N.err('traffic.bump', e); } });
  N.on('player:teleport', () => { T.fillT = TUNE.fillSecs; T.zoneT = 0; T.targetT = 0; });
  N.on('game:new', () => { T.fillT = TUNE.fillSecs; });
  N.on('save:loaded', () => { T.fillT = TUNE.fillSecs; });
  N.on('world:built', () => { RI.built = false; lakePts = null; });

  N.addSystem({
    id: 'traffic', order: 40, runIn: ['play', 'dialogue', 'cutscene'],
    init() { if (N.world && N.world.built) { buildIndex(); defineTypes(); } },
    update(dt) { update(dt); },
    draw() { try { draw(); } catch (e) { N.err('traffic.draw', e); } },
    reset() { resetAll(); },
  });
})();
