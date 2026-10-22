/* NOSTALGIA — hills.js  (N.hills: Banjara Hills and Jubilee Hills, 2003: where the city's money lived)
 *
 * In 2003 Banjara and Jubilee Hills were the flashiest addresses in the city: film stars', industrialists' and
 * politicians' bungalows behind granite compound walls on the granite ridge, Road No. 1 / 2 / 3 lined with glass-
 * fronted coffee bars, boutiques, jewellers and car showrooms, neon over the pubs at night. This module dresses the
 * generic buildings (world.js `t:'bldg'`) of the `banjara` and `jubilee` districts:
 *   - bungalows (a lot with its own yard, or a big detached house in Jubilee): richer walls (white, ivory, blush,
 *     granite tan), tinted glass bands or wide windows, Mangalore-tile or green-glazed hip roofs, two or three
 *     floors, more windows lit at night; and round each: a portico on columns at the front door, a polished
 *     granite plinth, gold balcony rails on the upper floors, gate pillars with globe lamps and a black-and-gold
 *     gate slid open in the compound wall's gap, a granite name plate, bougainvillea spilling over the wall
 *     (magenta, orange, white), royal palms at the gate, garden lamps along the drive, and a car in the drive (a
 *     "foreign car", an SUV, or a white Ambassador with a beacon at a politician's house; parked vehicles, spawned
 *     while the player is near);
 *   - the strip: buildings facing Road No. 1, 2, 3, 10, 12, Road No. 36 and Film Nagar Road become coffee bars,
 *     boutiques, jewellers, sundae parlours, car showrooms, pubs: a backlit sign (the core's shop board), a glass
 *     shopfront lit warm from inside, a canopy in the shop's colour, potted palms at the door and a neon strip over
 *     the sign at night.
 * Every name is invented (bible rule: no real brands).
 *
 * Deterministic: each building's dress comes from N.util.rng('hills:' + x + ',' + y).
 * Hooks (no core file is edited): 'world:built' (after hoardings.js) restyles the buildings and adds one
 *   N.world.addStructure({t: 'custom', draw, build3d}) per dressed building; 3D through the 'custom' structure
 *   dispatcher of ameerpet.js (registered here only if that module is absent): boxes in the chunk builder, palms
 *   as the core's instanced trunks / crowns, lamps and neon as the chunk's glows and lamps (so the night lighting's
 *   point lights and lamp pools pick them up); system 'hills' (order 43.8): the 2D night lights of the dress in
 *   view, and the parked cars in the drives near the player.
 *
 * API N.hills = {SHOPS, TUNE, dressed (structures), stats() -> {bungalows, shops, cars, byKind}, dressOf(b)}
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;

  /* ================================================================ vocabulary */
  const DISTRICTS = { banjara: 1, jubilee: 1 };
  const STRIP = ['banjara_rd1', 'banjara_rd2', 'banjara_rd3', 'banjara_rd10', 'banjara_rd12', 'jubilee_rd36', 'film_nagar_rd', 'kbr_jubilee_rd'];
  const RICH = {
    walls: ['#f7f4ec', '#f3ead8', '#efe2cf', '#f2d9c6', '#e9e6e1', '#dccaa8', '#f5efe0', '#e8dcd0'],
    tile: '#a85a44', glaze: '#3e7a5c', granite: ['#232326', '#4f3f33', '#3a3634', '#6a5a4a'],
    gold: '#c9a227', bar: '#141214', boug: ['#d6247a', '#e8458f', '#f07a2a', '#f4f0ec', '#c21868'],
    leaf: '#3f7a32', glass: '#7fb2c0', glassNight: '#ffd99a',
  };
  // shops of the strip (invented names; kind -> look). Colours: board bg / fg, canopy, neon
  const SHOPS = [
    { n: 'CAFE KAHWA', k: 'coffee', bg: '#3a2418', fg: '#f2d8a0', can: '#5a3420', neon: '#ff9a40' },
    { n: 'BEAN JUNCTION', k: 'coffee', bg: '#1d1d1f', fg: '#e8c070', can: '#7a2a1a', neon: '#ffb050' },
    { n: 'DECCAN DURBAR', k: 'restaurant', bg: '#6a1424', fg: '#f2d48a', can: '#6a1424', neon: '#ffd060' },
    { n: 'GOLCONDA GRILL', k: 'restaurant', bg: '#2a1a12', fg: '#ff9a3a', can: '#3a2418', neon: '#ff7a2a' },
    { n: 'DRAGON WOK', k: 'restaurant', bg: '#b0141a', fg: '#ffd84a', can: '#b0141a', neon: '#ff3a3a' },
    { n: 'RUCHI ANDHRA MEALS', k: 'restaurant', bg: '#2f7a2f', fg: '#fff4c0', can: '#2f7a2f', neon: '#7aff7a' },
    { n: 'SNOWPEAK SUNDAES', k: 'icecream', bg: '#f6f2ff', fg: '#d6247a', can: '#e8458f', neon: '#ff7ad0' },
    { n: 'NAWAB BAKERS', k: 'bakery', bg: '#f2e2c0', fg: '#6a3a1a', can: '#c9a227', neon: '#ffd890' },
    { n: 'BASEMENT 12', k: 'pub', bg: '#0e0e14', fg: '#4ad8ff', can: '#1a1a2a', neon: '#3ad0ff' },
    { n: 'EXCALIBUR PUB', k: 'pub', bg: '#1a0e1e', fg: '#ff4ad8', can: '#2a1030', neon: '#ff3ae0' },
    { n: 'ZARDOZI STUDIO', k: 'boutique', bg: '#4a1a3a', fg: '#f2d48a', can: '#6a1a4a', neon: '#ff8ae0' },
    { n: 'SILK AVENUE', k: 'boutique', bg: '#f4ece0', fg: '#8a1a3a', can: '#8a1a3a', neon: '#ff9ac0' },
    { n: 'NAVRATNA PEARLS', k: 'jewellers', bg: '#0f2a4a', fg: '#f2d48a', can: '#0f2a4a', neon: '#ffe08a' },
    { n: 'BANJARA MOTOR PLAZA', k: 'cars', bg: '#e8e8ec', fg: '#b0141a', can: '#3a3a44', neon: '#ffffff' },
    { n: 'SILVERLINE AUTOS', k: 'cars', bg: '#1a2a4a', fg: '#e8eef8', can: '#1a2a4a', neon: '#a0d0ff' },
    { n: 'GLAMOUR ZONE', k: 'parlour', bg: '#f2c2d8', fg: '#7a1a4a', can: '#d6247a', neon: '#ff7ab0' },
    { n: 'IRON TEMPLE GYM', k: 'gym', bg: '#1a1a1a', fg: '#ffd23a', can: '#2a2a2a', neon: '#ffd23a' },
    { n: 'REEL WORLD VIDEO', k: 'video', bg: '#1d4e8a', fg: '#ffffff', can: '#1d4e8a', neon: '#4aa0ff' },
    { n: 'SAI KRUPA STD ISD', k: 'std', bg: '#f2c230', fg: '#b0141a', can: '#f2c230', neon: '#ffd23a' },
    { n: 'PETALS & PEARLS', k: 'florist', bg: '#f4f0e6', fg: '#2f7a2f', can: '#2f7a2f', neon: '#9aff9a' },
    // short boards for the narrow fronts (a converted bungalow's 20-odd u)
    { n: 'KAHWA', k: 'coffee', bg: '#2a1a12', fg: '#f2c070', can: '#5a3420', neon: '#ffa040' },
    { n: 'BREW 36', k: 'coffee', bg: '#f2ead8', fg: '#5a2a14', can: '#5a2a14', neon: '#ffc070' },
    { n: 'ZEST', k: 'restaurant', bg: '#1a3a1a', fg: '#c8f070', can: '#2a5a2a', neon: '#a0ff60' },
    { n: 'MOTI', k: 'jewellers', bg: '#1a1a2a', fg: '#f2d48a', can: '#1a1a2a', neon: '#fff0b0' },
    { n: 'SAJNA', k: 'boutique', bg: '#7a1a4a', fg: '#ffd8ea', can: '#7a1a4a', neon: '#ff8ad0' },
    { n: 'CHILL', k: 'icecream', bg: '#e8f6ff', fg: '#1a6ab0', can: '#4aa0e0', neon: '#7ad0ff' },
    { n: 'BAR 9', k: 'pub', bg: '#120a1a', fg: '#ff5ad0', can: '#2a1030', neon: '#ff40d0' },
    { n: 'ROOP', k: 'parlour', bg: '#f8d8e8', fg: '#a01a5a', can: '#d6247a', neon: '#ff80c0' },
  ];
  const TUNE = {
    bungalowP: 0.92, shopP: 0.85, stripR: 34, stripLot: 56, carNear: 520, carFar: 760, carP: 0.7, politicianP: 0.08,
    porticoD: 7, porticoH: 10, plinthH: 2.6, railH: 1.1, gateLeaf: 8.6, gateH: 6.8, pillar: 2.4, pillarH: 8.2,
    palmH: 30, palmR: 8, lamps: 2, neonR: 34, lampR: 30,
  };
  // the cars in the drives: a "foreign car" (what a kid called any imported sedan) and an SUV, beside the white
  // Ambassador with a beacon of a politician's house (2D: the core's car drawing from these shapes; 3D: the
  // luxsedan / suv models of view3d_actors.js)
  if (N.vehicles && N.vehicles.define && N.vehicles.TYPES && !N.vehicles.TYPES.lux_sedan) {
    N.vehicles.define('lux_sedan', {
      base: 'ambassador', name: 'Foreign car', short: 'foreign car', w: 34, d: 13.5, h: 11.5, sound: 'ambassador',
      maxSpeed: 190, accel: 118, turn: 2.3, grip: 9.5, mass: 12, radio: true, spawn: { posh: 6, rocky: 2.5, hitec: 3, colonial: 1.5 },
      colors: ['#1a1a1e', '#f4f4f2', '#9aa0a8', '#5a0f1a', '#1f2f4a'],
      car: { body: [1.8, 6.4], rf: 4.4, rr: 3.8, cab: [-11.5, 5.2], cabInset: 1.5, cabH: 11.5, cabR: 3.4, slopeF: 4.8, slopeR: 3.8, slopeS: 1.5, bumper: '#d8d8d4', curvy: true },
    });
    N.vehicles.define('suv', {
      base: 'ambassador', name: 'SUV', short: 'SUV', w: 30, d: 14.5, h: 15, sound: 'ambassador',
      maxSpeed: 150, accel: 82, turn: 2.1, grip: 8.5, mass: 14, radio: true, spawn: { posh: 4, rocky: 3, hitec: 3, colony: 0.5 },
      colors: ['#f4f4f2', '#2a3a2a', '#5a5a60', '#7a1a1a', '#c8c0b0'],
      car: { body: [2.6, 8.6], rf: 2.6, rr: 2.2, cab: [-13, 6.6], cabInset: 1, cabH: 15, cabR: 1.5, slopeF: 2.4, slopeR: 0.8, slopeS: 1.0, bumper: '#2a2a2e' },
    });
  }
  const A = { dressed: [], byKind: {}, ST: { bungalows: 0, shops: 0, cars: 0 } };
  const BY_BLDG = new Map();
  const dressOf = (b) => BY_BLDG.get(b) || null;

  /* ================================================================ geometry helpers */
  const OUT = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  /** a building face: its two ends (a -> b along the face, left to right seen from outside) */
  function faceOf(b, side) {
    switch (side) {
      case 'N': return [b.x + b.w, b.y, b.x, b.y];
      case 'S': return [b.x, b.y + b.d, b.x + b.w, b.y + b.d];
      case 'W': return [b.x, b.y, b.x, b.y + b.d];
      default: return [b.x + b.w, b.y + b.d, b.x + b.w, b.y];
    }
  }
  function nearestRoadSide(b) {
    // the side whose midpoint is nearest a strip road (for strip shops without a front)
    let best = null;
    for (const side of ['N', 'S', 'W', 'E']) {
      const f = faceOf(b, side), mx = (f[0] + f[2]) / 2 + OUT[side][0] * 4, my = (f[1] + f[3]) / 2 + OUT[side][1] * 4;
      const d = stripDist(mx, my);
      if (!best || d < best.d) best = { side, d };
    }
    return best;
  }
  let stripRoads = [];
  function stripDist(x, y) {
    let best = Infinity;
    for (const r of stripRoads) {
      const P = r.pts;
      for (let k = 1; k < P.length; k++) {
        const ax = P[k - 1][0], ay = P[k - 1][1], bx = P[k][0], by = P[k][1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)), d = Math.hypot(ax + dx * t - x, ay + dy * t - y) - (r.w || 36) / 2;
        if (d < best) best = d;
      }
    }
    return best;
  }

  /* ================================================================ dressing */
  function restyleBungalow(b, rng) {
    b.wall = rng.pick(RICH.walls);
    b.trim = rng.next() < 0.3 ? RICH.gold : '#ffffff';
    const floors = rng.next() < 0.55 ? 2 : 3;
    b.h = Math.max(b.h || 0, floors * 10 + 2);
    if (rng.next() < 0.45) { b.win = 'glass'; b.winSp = 7; } else { b.win = 'rect'; b.winW = 5; b.winSp = 8.5; }
    const r = rng.next();
    if (r < 0.32) { b.roofType = 'hip'; b.roof = RICH.tile; } else if (r < 0.46) { b.roofType = 'hip'; b.roof = RICH.glaze; } else b.roofType = 'flat';
    b.lit = 0.6 + rng.next() * 0.3;
    b._items = null;
    return floors;
  }
  function dressBungalow(b, rng) {
    const floors = restyleBungalow(b, rng);
    const side = b.front || (b.yard ? nearestYardSide(b) : 'S');
    const f = faceOf(b, side), o = OUT[side], L = Math.hypot(f[2] - f[0], f[3] - f[1]);
    const ux = (f[2] - f[0]) / (L || 1), uy = (f[3] - f[1]) / (L || 1);
    const pw = Math.max(10, Math.min(18, L * 0.38)), mid = [(f[0] + f[2]) / 2, (f[1] + f[3]) / 2];
    const d = {
      kind: 'bungalow', side, floors, granite: rng.pick(RICH.granite),
      portico: { cx: mid[0] + o[0] * TUNE.porticoD / 2, cy: mid[1] + o[1] * TUNE.porticoD / 2, w: Math.abs(ux) > 0.5 ? pw : TUNE.porticoD, d: Math.abs(ux) > 0.5 ? TUNE.porticoD : pw, ux, uy, o, pw, mid },
      rails: [], gate: null, boug: [], palms: [], lamps: [], car: null, politician: rng.next() < TUNE.politicianP,
    };
    for (let fl = 1; fl < floors; fl++) d.rails.push(fl * 10);
    const Y = b.yard;
    if (Y) {
      // the gate: in the middle of the yard's road side (world.js wallSegments: an 18 u gap)
      const ys = Y.side || side, g = 18;
      let gx, gy, gux, guy;
      if (ys === 'N' || ys === 'S') { gx = Y.x + Y.w / 2; gy = ys === 'N' ? Y.y + 1 : Y.y + Y.h - 1; gux = 1; guy = 0; }
      else { gx = ys === 'W' ? Y.x + 1 : Y.x + Y.w - 1; gy = Y.y + Y.h / 2; gux = 0; guy = 1; }
      const go = OUT[ys];
      d.gate = { x: gx, y: gy, ux: gux, uy: guy, o: go, g, plate: rng.next() < 0.7 };
      // bougainvillea along the wall (not over the gate), the palms flanking the gate inside, lamps up the drive
      const nB = 3 + (rng.next() * 4 | 0);
      for (let k = 0; k < nB; k++) {
        const t = rng.next(), onSide = rng.pick(['N', 'S', 'W', 'E']);
        let x, y;
        if (onSide === 'N' || onSide === 'S') { x = Y.x + 4 + t * (Y.w - 8); y = onSide === 'N' ? Y.y + 1 : Y.y + Y.h - 1; } else { y = Y.y + 4 + t * (Y.h - 8); x = onSide === 'W' ? Y.x + 1 : Y.x + Y.w - 1; }
        if (Math.hypot(x - gx, y - gy) < g * 0.9) continue;
        d.boug.push({ x, y, r: 2.4 + rng.next() * 1.8, c: rng.pick(RICH.boug) });
      }
      for (const s of [-1, 1]) d.palms.push({ x: gx + gux * s * (g / 2 + 4) - go[0] * 5, y: gy + guy * s * (g / 2 + 4) - go[1] * 5 });
      // the drive: from the gate in towards the portico
      const px = d.portico.cx, py = d.portico.cy, dl = Math.hypot(px - gx, py - gy);
      if (dl > 14) {
        for (let k = 1; k <= TUNE.lamps; k++) { const t = k / (TUNE.lamps + 1); d.lamps.push({ x: gx + (px - gx) * t + gux * 6, y: gy + (py - gy) * t + guy * 6 }); }
        if (rng.next() < TUNE.carP) {
          // parked in the front garden beside the gate, along the house front (if it fits between the wall and the
          // house: a car spawned into the house is pushed out into the street)
          const depth = ys === 'N' ? b.y - Y.y : ys === 'S' ? Y.y + Y.h - (b.y + b.d) : ys === 'W' ? b.x - Y.x : Y.x + Y.w - (b.x + b.w);
          const type = carFor(rng, d.politician), CT = (N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[type]) || { w: 30, d: 14 };
          const off = g / 2 + 6 + CT.w / 2, room = (gux ? Y.w : Y.h) / 2 - 3, sd = rng.next() < 0.5 ? -1 : 1, dd = depth / 2 + 0.5;
          // (a shallow front garden: outside the gate instead, along the compound wall, as the street does it)
          const inside = depth >= CT.d + 5, out = CT.d / 2 + 3.5;
          if (off + CT.w / 2 <= room) d.car = { x: gx + gux * sd * off + go[0] * (inside ? -dd : out), y: gy + guy * sd * off + go[1] * (inside ? -dd : out), a: Math.atan2(guy * sd, gux * sd), type, color: rng.pick(['#f4f4f2', '#1a1a1e', '#9aa0a8', '#5a0f1a', '#1f2f4a', '#c8c0b0']), v: null, inside };
        }
      }
    }
    return d;
  }
  function nearestYardSide(b) {
    const Y = b.yard; if (!Y) return 'S';
    const gaps = { N: b.y - Y.y, S: Y.y + Y.h - (b.y + b.d), W: b.x - Y.x, E: Y.x + Y.w - (b.x + b.w) };
    return Object.keys(gaps).sort((p, q) => gaps[q] - gaps[p])[0];
  }
  function carFor(rng, politician) {
    const T = (N.vehicles && N.vehicles.TYPES) || {};
    if (politician && T.govt_ambassador) return 'govt_ambassador';
    const want = [T.lux_sedan && 'lux_sedan', T.lux_sedan && 'lux_sedan', T.suv && 'suv', 'ambassador', 'maruti800'].filter(Boolean);
    return rng.pick(want);
  }
  function dressShop(b, rng, side) {
    const W = N.world, D = N.draw;
    const f = faceOf(b, side), L = Math.hypot(f[2] - f[0], f[3] - f[1]);
    if (L < 14) return null;
    // a name that fits the board (the 3x5 pixel font is ~1 px per unit at zoom 1)
    const fits = SHOPS.filter((s) => !D || !D.pixelTextWidth || D.pixelTextWidth(s.n) <= (L - 4) * 1.05);
    if (!fits.length) return null;
    const shop = rng.pick(fits);
    b.wall = rng.pick(['#f4f2ee', '#e9e6e1', '#2a2a2e', '#d8d2c8', '#f3ead8']);
    b.trim = rng.next() < 0.4 ? RICH.gold : '#ffffff';
    b.win = rng.next() < 0.65 ? 'glass' : 'rect';
    b.lit = 0.85; b.front = side; b._items = null;
    b.h = Math.max(b.h || 0, 22); // (a shop on the strip: two storeys, the board over the glass front)
    b.sign = { text: shop.n, bg: shop.bg, fg: shop.fg };
    if (W && W.signs && W.signs.add) { /* (the core keeps no separate sign list) */ }
    return { kind: 'shop', side, shop, granite: rng.pick(RICH.granite), pots: rng.next() < 0.8, valet: shop.k === 'restaurant' || shop.k === 'pub' };
  }

  function redress() {
    const W = N.world;
    if (!W || !W.built || !W.queryStructures || !W.districtAt) return 0;
    for (const s of A.dressed) s.dead = true;
    A.dressed.length = 0; BY_BLDG.clear();
    A.ST.bungalows = A.ST.shops = 0; A.byKind = {};
    stripRoads = ((W.data && W.data.roads) || (N.WORLD_DATA && N.WORLD_DATA.roads) || []).filter((r) => STRIP.indexOf(r.id) >= 0 && r.pts && r.pts.length > 1);
    // the districts' bounding box, then each building's district
    const D = ((N.WORLD_DATA && N.WORLD_DATA.districts) || []).filter((d) => DISTRICTS[d.id]);
    if (!D.length) return 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of D) { const r = d.rect; x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); }
    const list = [];
    W.queryStructures(x0, y0, x1, y1, (s) => { if (s.t === 'bldg' && !s.landmark) list.push(s); });
    list.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const seen = new Set();
    for (const b of list) {
      if (seen.has(b)) continue; seen.add(b);
      const dist = W.districtAt(b.x + b.w / 2, b.y + b.d / 2);
      if (!dist || !DISTRICTS[dist.id]) continue;
      if (N.ameerpet && N.ameerpet.dressOf && N.ameerpet.dressOf(b)) continue;
      const rng = U.rng('hills:' + Math.round(b.x) + ',' + Math.round(b.y));
      let dress = null;
      try {
        // on the strip (a lot's house set back behind its lawn counts too: Road No. 1's bungalows were turning
        // into showrooms and coffee bars, the lawn paved for the cars), else a bungalow
        const nr = nearestRoadSide(b);
        if (nr && nr.d < (b.yard ? TUNE.stripLot : TUNE.stripR) && rng.next() < TUNE.shopP) dress = dressShop(b, rng, nr.side);
        if (!dress && (b.yard || (dist.id === 'jubilee' && b.w * b.d > 500 && !b.sign)) && rng.next() < TUNE.bungalowP) dress = dressBungalow(b, rng);
      } catch (e) { N.err('hills.dress', e); }
      if (!dress) continue;
      const s = W.addStructure(Object.assign({ t: 'custom', hills: true, terrSelf: true, x0: b.x - 30, y0: b.y - 30, x1: b.x + b.w + 30, y1: b.y + b.d + 30, cx: b.x + b.w / 2, cy: b.y + b.d / 2, b, draw: draw2D, build3d }, dress));
      BY_BLDG.set(b, s);
      A.dressed.push(s);
      if (dress.kind === 'shop') { A.ST.shops++; A.byKind[dress.shop.k] = (A.byKind[dress.shop.k] || 0) + 1; } else A.ST.bungalows++;
    }
    return A.dressed.length;
  }
  N.on('world:built', () => { try { redress(); } catch (e) { N.err('hills.redress', e); } });

  /* ================================================================ 2D */
  function draw2D(ctx, s) {
    const D = N.draw, b = s.b;
    if (s.kind === 'shop') return shop2D(ctx, D, s, b);
    // the granite plinth round the house, the portico, the gold rails, the gate, bougainvillea, lamps, palms
    D.box(b.x - 0.3, b.y - 0.3, b.w + 0.6, b.d + 0.6, 0, TUNE.plinthH, { wall: s.granite, roof: false });
    const P = s.portico, pc = '#ffffff', ph = TUNE.porticoH;
    const x0 = P.cx - P.w / 2, y0 = P.cy - P.d / 2;
    const cs = [[x0, y0], [x0 + P.w - 1.4, y0], [x0, y0 + P.d - 1.4], [x0 + P.w - 1.4, y0 + P.d - 1.4]];
    for (const c of cs) {
      const back = (c[0] + 0.7 - P.mid[0]) * P.o[0] + (c[1] + 0.7 - P.mid[1]) * P.o[1] < 1.5; // (the two at the wall are inside it)
      if (!back) D.box(c[0], c[1], 1.4, 1.4, 0, ph, { wall: pc, roof: pc });
    }
    D.box(x0, y0, P.w, P.d, ph, ph + 1.2, { wall: b.trim || pc, roof: b.trim === RICH.gold ? '#e8d9a8' : '#f4f2ee' });
    for (const h of s.rails) railOnFace2D(D, b, s.side, h);
    if (s.gate) gate2D(ctx, D, s);
    for (const g of s.boug) { D.disc(g.x, g.y, g.r * 1.15, 6.6, RICH.leaf); D.disc(g.x + 0.4, g.y - 0.3, g.r * 0.85, 7.0, g.c); }
    const night = N.render.night || 0;
    for (const l of s.lamps) { D.box(l.x - 0.4, l.y - 0.4, 0.8, 0.8, 0, 3.6, { wall: '#2a2a2a', roof: '#2a2a2a' }); D.disc(l.x, l.y, 0.9, 3.9, night > 0.1 ? '#fff2c0' : '#e8e4d8'); }
    for (const p of s.palms) palm2D(D, p.x, p.y);
  }
  function railOnFace2D(D, b, side, h) {
    const f = faceOf(b, side), o = OUT[side], t = 0.35;
    const xa = Math.min(f[0], f[2]), xb = Math.max(f[0], f[2]), ya = Math.min(f[1], f[3]), yb = Math.max(f[1], f[3]);
    const L = Math.max(xb - xa, yb - ya), m = L * 0.14;
    if (side === 'N' || side === 'S') D.box(xa + m, (side === 'N' ? ya - t : ya), xb - xa - 2 * m, t, h, h + TUNE.railH, { wall: RICH.gold, roof: RICH.gold });
    else D.box((side === 'W' ? xa - t : xa), ya + m, t, yb - ya - 2 * m, h, h + TUNE.railH, { wall: RICH.gold, roof: RICH.gold });
    void o;
  }
  function gate2D(ctx, D, s) {
    const G = s.gate, half = G.g / 2, pw = TUNE.pillar, ph = TUNE.pillarH;
    // pillars either side of the gap, a globe lamp on each
    for (const k of [-1, 1]) {
      const cx = G.x + G.ux * k * (half + pw / 2), cy = G.y + G.uy * k * (half + pw / 2);
      D.box(cx - pw / 2, cy - pw / 2, pw, pw, 0, ph, { wall: s.granite, roof: '#3a3634' });
      D.disc(cx, cy, 1.0, ph + 1.0, (N.render.night || 0) > 0.1 ? '#fff4cc' : '#f4f0e6');
    }
    // the gate slid open behind one pillar: black bars, a gold top rail
    const lx = G.x + G.ux * (half + pw) - G.o[0] * 1.2, ly = G.y + G.uy * (half + pw) - G.o[1] * 1.2;
    const w = G.ux ? TUNE.gateLeaf : 0.6, d = G.uy ? TUNE.gateLeaf : 0.6;
    D.box(lx - (G.ux ? 0 : w / 2), ly - (G.uy ? 0 : d / 2), w, d, 0, TUNE.gateH, { wall: RICH.bar, roof: RICH.gold });
    if (G.plate) { const k = -1, cx = G.x + G.ux * k * (half + pw / 2) + G.o[0] * (pw / 2 + 0.15), cy = G.y + G.uy * k * (half + pw / 2) + G.o[1] * (pw / 2 + 0.15); D.box(cx - 0.8, cy - 0.8, 1.6, 1.6, 3.2, 4.6, { wall: '#141214', roof: RICH.gold }); }
    void ctx;
  }
  function palm2D(D, x, y) {
    const h = TUNE.palmH, r = TUNE.palmR;
    D.box(x - 0.45, y - 0.45, 0.9, 0.9, 0, h * 0.9, { wall: '#7a6448', roof: '#7a6448' });
    D.plane(h, (g) => {
      g.strokeStyle = '#3f7a32'; g.lineWidth = 1.3; g.lineCap = 'round';
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2 + (x * 0.13) % 1; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6 - 0.8, x + Math.cos(a) * r, y + Math.sin(a) * r + 0.6); g.stroke(); }
      g.fillStyle = '#5a7a2a'; g.beginPath(); g.arc(x, y, 1.1, 0, Math.PI * 2); g.fill();
    });
  }
  function shop2D(ctx, D, s, b) {
    const f = faceOf(b, s.side), o = OUT[s.side], night = N.render.night || 0;
    const xa = Math.min(f[0], f[2]), xb = Math.max(f[0], f[2]), ya = Math.min(f[1], f[3]), yb = Math.max(f[1], f[3]);
    const glass = night > 0.15 ? RICH.glassNight : RICH.glass, t = 0.35, cd = 3.6;
    D.box(b.x - 0.3, b.y - 0.3, b.w + 0.6, b.d + 0.6, 0, 1.6, { wall: s.granite, roof: false });
    if (s.side === 'N' || s.side === 'S') {
      const y = s.side === 'N' ? ya - t : ya;
      D.box(xa + 1.5, y, xb - xa - 3, t, 1.2, 8.2, { wall: glass, roof: glass });
      D.box(xa + 1, s.side === 'N' ? ya - cd : ya, xb - xa - 2, cd, 8.6, 9.4, { wall: s.shop.can, roof: s.shop.can });
    } else {
      const x = s.side === 'W' ? xa - t : xa;
      D.box(x, ya + 1.5, t, yb - ya - 3, 1.2, 8.2, { wall: glass, roof: glass });
      D.box(s.side === 'W' ? xa - cd : xa, ya + 1, cd, yb - ya - 2, 8.6, 9.4, { wall: s.shop.can, roof: s.shop.can });
    }
    if (s.pots) for (const k of [0.18, 0.82]) {
      const px = f[0] + (f[2] - f[0]) * k + o[0] * (cd + 1.4), py = f[1] + (f[3] - f[1]) * k + o[1] * (cd + 1.4);
      D.box(px - 0.8, py - 0.8, 1.6, 1.6, 0, 1.6, { wall: '#8a5a3a', roof: '#3f7a32' });
      D.disc(px, py, 1.6, 2.6, '#3f7a32');
    }
    void ctx;
  }

  /* ================================================================ 3D */
  // (terrSelf: the parts stand on the terrain themselves: the house's on the house's base, as the core puts the
  // building, the gate's, the palms' and the lamps' on the ground under them, out at the compound wall)
  function build3d(THREE, s, H, gb, J) {
    if (s.dead) return null;
    const b = s.b, ox = J.ox, oz = J.oz;
    const X = (x) => x - ox, Z = (z) => z - oz, VS = H.VS || 1.5;
    const T = (x, y) => (H.terrainAt ? H.terrainAt(x, y) : 0), base = H.terrainBase ? H.terrainBase(b.x, b.y, b.x + b.w, b.y + b.d) : 0;
    if (s.kind === 'shop') return shop3D(s, b, gb, J, X, Z, VS, base, H.FLOOR_H || 10 * VS);
    gb.plain();
    gb.color(s.granite).box(X(b.x - 0.3), base, Z(b.y - 0.3), X(b.x + b.w + 0.3), base + TUNE.plinthH * VS, Z(b.y + b.d + 0.3));
    const P = s.portico, ph = TUNE.porticoH * VS, x0 = P.cx - P.w / 2, y0 = P.cy - P.d / 2;
    gb.color('#f4f2ee');
    for (const c of [[x0, y0], [x0 + P.w - 1.4, y0], [x0, y0 + P.d - 1.4], [x0 + P.w - 1.4, y0 + P.d - 1.4]]) gb.cyl(X(c[0] + 0.7), base, Z(c[1] + 0.7), 0.7, 0.7, ph, 10);
    gb.color(b.trim || '#ffffff').box(X(x0), base + ph, Z(y0), X(x0 + P.w), base + ph + 1.2 * VS, Z(y0 + P.d));
    gb.color(RICH.gold);
    for (const h of s.rails) {
      const f = faceOf(b, s.side), xa = Math.min(f[0], f[2]), xb = Math.max(f[0], f[2]), ya = Math.min(f[1], f[3]), yb = Math.max(f[1], f[3]), m = Math.max(xb - xa, yb - ya) * 0.14, t = 0.35, y = base + h * VS;
      if (s.side === 'N' || s.side === 'S') { const yy = s.side === 'N' ? ya - t : ya; gb.box(X(xa + m), y, Z(yy), X(xb - m), y + TUNE.railH * VS, Z(yy + t)); }
      else { const xx = s.side === 'W' ? xa - t : xa; gb.box(X(xx), y, Z(ya + m), X(xx + t), y + TUNE.railH * VS, Z(yb - m)); }
    }
    if (s.gate) {
      const G = s.gate, half = G.g / 2, pw = TUNE.pillar, phh = TUNE.pillarH * VS;
      const tg = T(G.x, G.y);
      for (const k of [-1, 1]) {
        const cx = G.x + G.ux * k * (half + pw / 2), cy = G.y + G.uy * k * (half + pw / 2);
        gb.color(s.granite).box(X(cx - pw / 2), tg, Z(cy - pw / 2), X(cx + pw / 2), tg + phh, Z(cy + pw / 2));
        gb.color('#f4f0e6').sphere(X(cx), tg + phh + 1.1, Z(cy), 1.0, 1.0, 1.0, 8, 5);
        J.glows.push([X(cx), tg + phh + 1.1, Z(cy), 1.0, 0.86, 0.6, 0.9]);
        J.lamps.push([cx, tg + phh + 1.0, cy, 0xffd890]);
      }
      const lx = G.x + G.ux * (half + pw) - G.o[0] * 1.2, ly = G.y + G.uy * (half + pw) - G.o[1] * 1.2;
      const w = G.ux ? TUNE.gateLeaf : 0.6, d = G.uy ? TUNE.gateLeaf : 0.6, gx0 = lx - (G.ux ? 0 : w / 2), gy0 = ly - (G.uy ? 0 : d / 2);
      gb.color(RICH.bar);
      const n = 9;
      for (let k = 0; k <= n; k++) { const t = k / n; const bx = gx0 + (G.ux ? w * t : w / 2), by = gy0 + (G.uy ? d * t : d / 2); gb.box(X(bx - 0.15), tg + 0.3, Z(by - 0.15), X(bx + 0.15), tg + TUNE.gateH * VS, Z(by + 0.15)); }
      gb.box(X(gx0), tg + 0.3, Z(gy0), X(gx0 + w), tg + 0.9, Z(gy0 + d));
      gb.color(RICH.gold).box(X(gx0), tg + TUNE.gateH * VS - 0.6, Z(gy0), X(gx0 + w), tg + TUNE.gateH * VS, Z(gy0 + d));
      if (G.plate) { const cx = G.x - G.ux * (half + pw / 2) + G.o[0] * (pw / 2 + 0.15), cy = G.y - G.uy * (half + pw / 2) + G.o[1] * (pw / 2 + 0.15); gb.color('#141214').box(X(cx - 0.8), tg + 3.2 * VS, Z(cy - 0.8), X(cx + 0.8), tg + 4.6 * VS, Z(cy + 0.8)); gb.color(RICH.gold).box(X(cx - 0.6), tg + 3.9 * VS, Z(cy - 0.85), X(cx + 0.6), tg + 4.2 * VS, Z(cy + 0.85)); }
    }
    // bougainvillea over the wall: a green clump and its flowers (the core's canopy blobs)
    for (const g of s.boug) { const tb = T(g.x, g.y); J.blobs.push([X(g.x), tb + 6.2 * VS, Z(g.y), g.r * 1.1, g.r * 0.8, g.r * 1.1, 0, RICH.leaf]); J.blobs.push([X(g.x + 0.4), tb + 6.9 * VS, Z(g.y - 0.3), g.r * 0.9, g.r * 0.6, g.r * 0.9, 0, g.c]); }
    // royal palms at the gate (the core's palm: a trunk and a crown)
    for (const p of s.palms) { const th = TUNE.palmH * VS * 0.92, tp = T(p.x, p.y); J.trunks.push([X(p.x), tp, Z(p.y), 0.6, th, 0.6, 0, 0, '#8a7a62']); J.crowns.push([X(p.x), tp + th, Z(p.y), TUNE.palmR, TUNE.palmR * 0.75, TUNE.palmR, (p.x * 0.7) % 6.28, '#3f7a32']); }
    // garden lamps up the drive
    for (const l of s.lamps) { const tl = T(l.x, l.y); gb.color('#2a2a2a').box(X(l.x - 0.3), tl, Z(l.y - 0.3), X(l.x + 0.3), tl + 3.6 * VS, Z(l.y + 0.3)); gb.color('#fff2c0').sphere(X(l.x), tl + 3.9 * VS, Z(l.y), 0.75, 0.75, 0.75, 8, 5); J.glows.push([X(l.x), tl + 3.9 * VS, Z(l.y), 1.0, 0.9, 0.65, 0.8]); J.lamps.push([l.x, tl + 3.9 * VS, l.y, 0xffe0a0]); }
    return null;
  }
  function shop3D(s, b, gb, J, X, Z, VS, base, FH) {
    base = base || 0;
    const f = faceOf(b, s.side), o = OUT[s.side], t = 0.35, cd = 3.6;
    const xa = Math.min(f[0], f[2]), xb = Math.max(f[0], f[2]), ya = Math.min(f[1], f[3]), yb = Math.max(f[1], f[3]);
    // the core's board on the front (view3d.js addSigns): from 0.7 of a storey up, 3.2-5.2 tall; the glass and the
    // canopy under it, the neon over it
    const L0 = Math.hypot(f[2] - f[0], f[3] - f[1]), sw = Math.min(L0 - 1.2, 40), sy0 = base + FH * 0.7, sy1 = sy0 + Math.min(5.2, Math.max(3.2, sw / 5));
    const g0 = base + 1.2 * VS, g1 = sy0 - 1.0, c0 = sy0 - 1.0, c1 = sy0 - 0.25;
    gb.plain();
    gb.color(s.granite).box(X(b.x - 0.3), base, Z(b.y - 0.3), X(b.x + b.w + 0.3), base + 1.6 * VS, Z(b.y + b.d + 0.3));
    const hz = s.side === 'N' || s.side === 'S';
    // the glass shopfront (lit warm from inside at night: the glows along it), the canopy, the neon over the sign
    if (hz) {
      const y = s.side === 'N' ? ya - t : ya;
      gb.color('#9fc6d0').box(X(xa + 1.5), g0, Z(y), X(xb - 1.5), g1, Z(y + t));
      gb.color(s.shop.can).box(X(xa + 1), c0, Z(s.side === 'N' ? ya - cd : ya), X(xb - 1), c1, Z(s.side === 'N' ? ya : ya + cd));
    } else {
      const x = s.side === 'W' ? xa - t : xa;
      gb.color('#9fc6d0').box(X(x), g0, Z(ya + 1.5), X(x + t), g1, Z(yb - 1.5));
      gb.color(s.shop.can).box(X(s.side === 'W' ? xa - cd : xa), c0, Z(ya + 1), X(s.side === 'W' ? xa : xa + cd), c1, Z(yb - 1));
    }
    const L = Math.hypot(f[2] - f[0], f[3] - f[1]), n = Math.max(2, Math.round(L / 8));
    const nc = colorOf(s.shop.neon), wc = [1.0, 0.82, 0.52];
    for (let k = 0; k < n; k++) {
      const tt = (k + 0.5) / n, px = f[0] + (f[2] - f[0]) * tt + o[0] * 0.8, py = f[1] + (f[3] - f[1]) * tt + o[1] * 0.8;
      J.glows.push([X(px), base + 4.5 * VS, Z(py), wc[0], wc[1], wc[2], 0.55]); // the warm shop light through the glass
      J.glows.push([X(px + o[0] * 0.2), sy1 + 0.6, Z(py + o[1] * 0.2), nc[0], nc[1], nc[2], 0.9]); // the neon strip over the sign
    }
    const mx = (f[0] + f[2]) / 2 + o[0] * 2, my = (f[1] + f[3]) / 2 + o[1] * 2;
    J.lamps.push([mx, (sy0 + sy1) / 2, my, parseInt(s.shop.neon.slice(1), 16)]);
    if (s.pots) for (const k of [0.18, 0.82]) {
      const px = f[0] + (f[2] - f[0]) * k + o[0] * (cd + 1.4), py = f[1] + (f[3] - f[1]) * k + o[1] * (cd + 1.4);
      gb.color('#8a5a3a').cyl(X(px), base, Z(py), 0.9, 0.7, 1.6 * VS, 8);
      J.blobs.push([X(px), base + 2.6 * VS, Z(py), 1.6, 1.4, 1.6, 0, RICH.leaf]);
    }
    return null;
  }
  function colorOf(hex) { const v = parseInt(hex.slice(1), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
  if (N.view3d && N.view3d.registerStructure && !N.ameerpet) {
    N.view3d.registerStructure('custom', (THREE, s, H, gb, J) => (typeof s.build3d === 'function' ? s.build3d(THREE, s, H, gb, J) : null));
  }

  /* ================================================================ per frame: 2D night lights, cars in the drives */
  function update() {
    const p = N.player, V = N.vehicles;
    if (!p || !V || !V.spawn) return;
    let cars = 0;
    for (const s of A.dressed) {
      const c = s.car; if (!c) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (!c.v && d < TUNE.carNear) {
        try { c.v = V.spawn(c.type, c.x, c.y, c.a, { parked: true, color: c.color }); if (c.v && c.color && c.type !== 'govt_ambassador') c.v.color = c.color; } catch (e) { c.v = null; }
      } else if (c.v && d > TUNE.carFar) {
        if (c.v.alive && !c.v.driver && !c.v.borrowedBy) { try { V.remove ? V.remove(c.v) : (c.v.alive = false); } catch (e) { /* ignore */ } } // (one he took is his to leave about)
        c.v = null;
      }
      if (c.v && c.v.alive) cars++;
    }
    A.ST.cars = cars;
  }
  function draw() {
    const R = N.render;
    if (!R || !(R.night > 0.05) || (N.view && N.view.is3D && N.view.is3D())) return;
    const v = R.view; if (!v) return;
    for (const s of A.dressed) {
      if (s.cx < v.x0 - 60 || s.cx > v.x1 + 60 || s.cy < v.y0 - 60 || s.cy > v.y1 + 60) continue;
      if (s.kind === 'shop') {
        const f = faceOf(s.b, s.side), o = OUT[s.side];
        R.lights.push({ x: (f[0] + f[2]) / 2 + o[0] * 6, y: (f[1] + f[3]) / 2 + o[1] * 6, r: TUNE.neonR, color: s.shop.neon, intensity: 0.9 });
      } else {
        if (s.gate) for (const k of [-1, 1]) R.lights.push({ x: s.gate.x + s.gate.ux * k * (s.gate.g / 2 + 1.2), y: s.gate.y + s.gate.uy * k * (s.gate.g / 2 + 1.2), r: TUNE.lampR, color: '#ffd890', intensity: 0.8 });
        for (const l of s.lamps) R.lights.push({ x: l.x, y: l.y, r: TUNE.lampR * 0.8, color: '#ffe0a0', intensity: 0.7 });
      }
    }
  }
  N.addSystem({ id: 'hills', order: 43.8, runIn: ['play', 'dialogue', 'cutscene'], update() { try { update(); } catch (e) { N.err('hills.update', e); } }, draw() { try { draw(); } catch (e) { N.err('hills.draw', e); } } });

  N.hills = {
    SHOPS, TUNE, RICH,
    get dressed() { return A.dressed; },
    stats() { return { bungalows: A.ST.bungalows, shops: A.ST.shops, cars: A.ST.cars, byKind: Object.assign({}, A.byKind) }; },
    dressOf, redress,
  };
})();
