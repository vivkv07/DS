/* NOSTALGIA — paan.js  (N.paan: the paan shops of 2003 Hyderabad, one beside every café)
 *
 * No Irani café without its paan shop: a painted wooden kiosk on the footpath a few steps from the café door, its
 * counter open to the street, the paan-wala behind it folding leaves (the betel leaves stacked under a wet red cloth,
 * the steel tins of katha, chuna, gulkand, saunf, a small mirror, strings of foil sachets hanging in front, a bulb at
 * night), a hand-painted board over it (SHAHI PAAN HOUSE, BANARAS PAAN BHANDAR... fictional names), red paan stains on
 * the ground beside it, and three or four men standing about with their tea, a paan or the cricket score.
 *
 * Placed on 'world:built' (deterministic: U.rng('paan:v1')) next to every Irani café, bakery, Iyengar bakery, chai
 * bandi, restaurant and food place of the map, and every coffee bar on the Banjara / Jubilee strip (hills.js): the
 * kiosk on open ground or footpath 12-34 u from the café's own spot (never on its doorstep), its counter 6-18 u back
 * from the nearest road's kerb and facing it, its footprint and the customers' patch in front open ground, nothing
 * standing there (a tree, a lamp, a wall, a hoarding), at least 18 u from the next paan shop (a tight corner gets a
 * second look 14 u further out with the counter 4.5-26 u from the kerb). Each is
 *   - a shop (N.shops, kind 'paan_shop', place id paan_<n>): meetha paan (★ ₹4), saunf-mishri, goli soda, toffees,
 *     bubble gum; 09:00-23:30 (nothing with tobacco: he is twelve, and the paan-wala says so);
 *   - a 'custom' world structure (2D: the kiosk, its striped tin roof with the green leaf, the stains; 3D: the kiosk
 *     with its counter things, the board with its painted name, the sachet strings, the bulb (a glow and a lamp at
 *     night), the stains), solid on the collision grid (the grid cells under its turned footprint and a step round
 *     it: never the customers' patch; put back first when they are placed again on the same grid);
 *   - a crowd zone for traffic.js (N.traffic.TUNE.zones.paan_shop: men, youths, uncles standing about, 08:00-23:30);
 *   - the paan-wala (N.npcs 'paanwala_1'..'paanwala_4', four looks) standing behind his counter while the shop is
 *     open and he is near (TUNE.near; at most TUNE.keepers at once).
 *
 * API  N.paan = {list [{id, x, y, cx, cy, ox, oy, w, d, name, paint, anchor}], TUNE, stats() -> {shops, byAnchor,
 *   keepers, missed (anchors without a spot), why (candidate spots turned down, by reason)}, nearest(x, y) -> shop | null,
 *   _build()}
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  const TUNE = {
    w: 8, d: 6,                         // the kiosk: along the street, deep (2D units; 3D x N.view3d.VS in height)
    h: 10.5, counter: 4.2, open: 9.0, sign: [11.2, 13.8], over: 1.6,
    ring: [12, 34], step: 3, angles: 28, gap: 18, kerb: [6, 18], kerbLoose: [4.5, 26], want: { r: 18, kerb: 9 },
    near: 320, far: 440, keepers: 4,    // the paan-walas behind their counters near him
    crowd: { n: 3, r: 14, hours: [8 * 60, 23 * 60 + 30], roles: { man: 3, youth: 2, uncle: 2, old: 1 } },
  };
  const NAMES = ['SHAHI PAAN HOUSE', 'BANARAS PAAN BHANDAR', 'MUMTAZ PAAN SHOP', 'LUCKY PAAN CENTRE', 'GULSHAN PAAN',
    'PAAN MAHAL', 'SULTAN PAAN CORNER', 'BOMBAY PAAN STALL', 'CALCUTTA MEETHA PAAN', 'MOTI PAAN', 'RAJA PAAN SHOP',
    'NOOR PAAN DAAN', 'TAJ PAAN HOUSE', 'CHAND PAAN CENTRE', 'DILKHUSH PAAN', 'NAWAB PAAN', 'SAIBABA PAAN SHOP',
    'GOLDEN PAAN CORNER', 'BAHAR PAAN', 'MAHARAJA PAAN'];
  const PAINT = [
    { body: '#2a7a4a', trim: '#f2c230', roof: '#c8402a', roof2: '#f2e6c8', bg: '#1f5a36', fg: '#ffe680' },
    { body: '#2a5a9a', trim: '#f4f2ea', roof: '#2a8c82', roof2: '#f4f2ea', bg: '#c8202a', fg: '#fff4d8' },
    { body: '#c8862a', trim: '#5a2a14', roof: '#7a3a8a', roof2: '#f2c230', bg: '#f2c230', fg: '#5a1a14' },
    { body: '#3a8a8a', trim: '#f2e6c8', roof: '#d8402a', roof2: '#f2e6c8', bg: '#14141a', fg: '#7af07a' },
    { body: '#8a2a3a', trim: '#f2c230', roof: '#2a6a3a', roof2: '#f2e6c8', bg: '#f4f2ea', fg: '#8a1a24' },
    { body: '#5a7a2a', trim: '#f4f2ea', roof: '#2a4a8a', roof2: '#f2c230', bg: '#2a8c3a', fg: '#ffffff' },
  ];
  const SACHETS = ['#e8203a', '#f2c230', '#2a8cd8', '#30a050', '#f08a24', '#c0c4cc', '#8a3ad8', '#f06aa0'];
  const STAIN = '#7a1a14', STAIN2 = '#5a120e';
  // the places a paan shop stands beside
  const ANCHOR_KINDS = { irani_cafe: 1, bakery: 1, iyengar_bakery: 1, chai_bandi: 1, restaurant: 1, food: 1 };

  const A = { list: [], keepers: new Map(), t: 0, built: false, why: {}, miss: [], cells: [] };
  const no = (k) => { A.why[k] = (A.why[k] || 0) + 1; };

  /* ================================================================ the shop (N.shops kind 'paan_shop') */
  const KIND = {
    title: 'Paan shop', verb: 'Meetha paan ₹4', keeper: 'paanwala_1', icon: 'cart', hours: [['09:00', '23:30']], quick: 'meetha_paan',
    lines: ['*Kya chahiye, beta?* Meetha paan for you, the other kind is for elders.', 'Gulkand from Lucknow, saunf from Gujarat, the leaf from Mahoba. *Ekdum* first class.',
      "Don't spit on my wall. That red is not paint.", 'Score kitna? The radio says the second wicket fell.', '*Kal aana*, a new stock of eclairs is coming.',
      'Cigarette? *Chal hatt!* Go home, your Amma will break my counter.'],
    rows: [
      { id: 'meetha_paan', name: '*Meetha paan*', sub: 'gulkand, saunf, coconut, a cherry on top', price: 400, feed: 10, house: true, line: '*Meetha paan*, extra gulkand. Open wide, *beta*. Lips red for an hour.' },
      { id: 'saunf', name: 'Saunf-mishri twist', price: 100, feed: 2, line: 'For the breath. After the biryani, two pinches.' },
      { id: 'goli_soda', name: 'Goli soda', sub: 'pop the marble', price: 300, feed: 8, line: '*Tak!* The marble drops. Drink slowly, it fights back.' },
      { id: 'toffee', name: 'Toffees (two)', sub: 'the gold-wrapper kind', price: 100, feed: 3 },
      { id: 'bubble_gum', name: 'Bubble gum', sub: 'with a tattoo inside', price: 100, feed: 1, line: 'Tattoo inside. Lick and stick, not on the school shirt.' },
    ],
  };

  /* ================================================================ placement */
  function front(b, side) {
    if (side === 'N') return { x: b.x + b.w / 2, y: b.y - 4, ox: 0, oy: -1 };
    if (side === 'S') return { x: b.x + b.w / 2, y: b.y + b.d + 4, ox: 0, oy: 1 };
    if (side === 'W') return { x: b.x - 4, y: b.y + b.d / 2, ox: -1, oy: 0 };
    return { x: b.x + b.w + 4, y: b.y + b.d / 2, ox: 1, oy: 0 };
  }
  function anchors() {
    const raw = (N.WORLD_DATA && N.WORLD_DATA.places) || [], out = [];
    for (const p of raw) {
      if (!p || p.paan || p.alias || !ANCHOR_KINDS[p.kind] || !N.places[p.id]) continue;
      if (out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 8)) continue; // one café under two ids
      out.push({ id: p.id, x: p.x, y: p.y, kind: p.kind, r: p.r || 0 });
    }
    const H = N.hills;
    if (H && H.dressed) for (const s of H.dressed) {
      if (s.dead || s.kind !== 'shop' || !s.shop || s.shop.k !== 'coffee' || !s.b) continue;
      const f = front(s.b, s.side);
      out.push({ id: 'hills:' + s.id, x: f.x, y: f.y, kind: 'coffee', hills: true });
    }
    return out;
  }
  function openSurf() {
    const S = N.SURF, ok = new Set();
    for (const k of ['GROUND', 'FOOTPATH', 'PLAZA', 'SAND', 'GRASS']) if (S[k] != null) ok.add(S[k]);
    return ok;
  }
  function spotFor(a, rng, taken, OK, loose) {
    const W = N.world, hw = TUNE.w / 2, hd = TUNE.d / 2, KB = loose ? TUNE.kerbLoose : TUNE.kerb;
    const free = (x, y) => OK.has(W.surfaceAt(x, y));
    const r1 = Math.max(TUNE.ring[1], (a.r || 0) + 16) + (loose ? 14 : 0);
    let best = null, bs = Infinity;
    for (let r = TUNE.ring[0]; r <= r1; r += TUNE.step) {
      for (let k = 0; k < TUNE.angles; k++) {
        const ang = (k + rng.next() * 0.5) / TUNE.angles * TAU;
        const x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r;
        if (!free(x, y)) { no('ground'); continue; }
        if (taken.some((q) => Math.hypot(q.cx - x, q.cy - y) < TUNE.gap)) { no('gap'); continue; }
        // facing the street: the counter to the nearest road, the kiosk a few steps back from its kerb
        const rp = W.nearestRoadPoint(x, y);
        if (!rp) { no('road'); continue; }
        const rd = Math.hypot(rp.x - x, rp.y - y), kerb = rd - ((rp.road && rp.road.w) || 30) / 2;
        if (rd < 1 || kerb < KB[0] || kerb > KB[1]) { no('road'); continue; }
        const ox = (rp.x - x) / rd, oy = (rp.y - y) / rd, ux = -oy, uy = ox;
        // its own footprint open ground (its back may touch a wall), the customers' patch in front of the counter too
        let ok = true;
        for (const u of [-hw, 0, hw]) for (const o of [-hd + 0.6, 0, hd, hd + 2.5, hd + 4.5]) if (ok && !free(x + ux * u + ox * o, y + uy * u + oy * o)) ok = false;
        if (!ok) { no('foot'); continue; }
        // nothing standing there (a tree, a lamp, a wall, a hoarding, a landmark: the buildings are the grid's own; a
        // structure gone dead (an old kiosk, placed again) stays in the index but is not there)
        let hit = false;
        W.queryStructures(x - hw - 0.5, y - hw - 0.5, x + hw + 0.5, y + hw + 0.5, (st) => { if (!st.dead && st.t !== 'bldg' && st.t !== 'landmark' && !(st.t === 'custom' && (st.hills || st.breaker))) hit = true; });
        if (hit) { no('built'); continue; }
        const sc = Math.abs(r - TUNE.want.r) * 0.4 + Math.abs(kerb - TUNE.want.kerb) + rng.next() * 0.5;
        if (sc < bs) { bs = sc; best = { cx: x, cy: y, ox, oy, rd, r }; }
      }
    }
    return best;
  }
  // the kiosk solid on the grid like a building (collision, the walkers' grid paths, audio occlusion): the cells whose
  // centre is under its turned footprint and a step round it (never the customers' patch, 4.5 u in front of the
  // counter); each cell's old surface kept in A.cells to put back if they are placed again on the same grid
  function solidify(sh) {
    const W = N.world, grid = W.grid, GW = W.GW, GH = W.GH, C = N.CELL || 4, SOL = N.SURF.SOLID;
    if (!grid || !GW) return;
    const hw = TUNE.w / 2 + 1.5, hd = TUNE.d / 2 + 1.4, R = Math.hypot(hw, hd);
    for (let j = Math.max(0, Math.floor((sh.cy - R) / C)), j1 = Math.min(GH - 1, Math.floor((sh.cy + R) / C)); j <= j1; j++) {
      for (let i = Math.max(0, Math.floor((sh.cx - R) / C)), i1 = Math.min(GW - 1, Math.floor((sh.cx + R) / C)); i <= i1; i++) {
        const dx = (i + 0.5) * C - sh.cx, dy = (j + 0.5) * C - sh.cy, k = j * GW + i;
        if (Math.abs(dx * sh.ux + dy * sh.uy) > hw || Math.abs(dx * sh.ox + dy * sh.oy) > hd || grid[k] === SOL) continue;
        A.cells.push(k, grid[k]); grid[k] = SOL;
      }
    }
  }
  function unsolidify() {
    const grid = N.world && N.world.grid, SOL = N.SURF.SOLID;
    if (grid) for (let n = A.cells.length - 2; n >= 0; n -= 2) if (grid[A.cells[n]] === SOL) grid[A.cells[n]] = A.cells[n + 1];
    A.cells = [];
  }
  function districtId(x, y) { try { const d = N.world.districtAt(x, y); return d ? d.id : null; } catch (e) { return null; } }

  function build() {
    const W = N.world;
    if (!W || !W.built || !W.addStructure || !W.nearestRoadPoint) return;
    // (placed again: drop the old ones, their cells back as they were (a rebuilt world has a fresh grid: none kept))
    for (const s of A.list) if (s.st) s.st.dead = true;
    unsolidify();
    A.list = []; A.why = {}; A.miss = [];
    for (const k of Array.from(A.keepers.keys())) dropKeeper(k);
    const raw = N.WORLD_DATA && N.WORLD_DATA.places;
    if (raw) for (let i = raw.length - 1; i >= 0; i--) if (raw[i] && raw[i].paan) raw.splice(i, 1);
    for (const id of Object.keys(N.places)) if (N.places[id] && N.places[id].kind === 'paan_shop') delete N.places[id];
    const rng = U.rng('paan:v1'), OK = openSurf();
    const list = anchors();
    for (const a of list) {
      // (a tight corner: a second look further out, the counter nearer the kerb or further back)
      const sp = spotFor(a, rng, A.list, OK) || spotFor(a, rng, A.list, OK, true);
      if (!sp) { A.miss.push(a.id); continue; }
      const n = A.list.length, id = 'paan_' + (n + 1);
      const shop = {
        id, n, cx: sp.cx, cy: sp.cy, ox: sp.ox, oy: sp.oy, ux: -sp.oy, uy: sp.ox, w: TUNE.w, d: TUNE.d,
        name: NAMES[(rng.next() * NAMES.length) | 0], paint: PAINT[(rng.next() * PAINT.length) | 0], anchor: a.id,
        keeper: 1 + ((rng.next() * 4) | 0), stains: [], sachets: [], seed: (rng.next() * 1e9) | 0,
      };
      // where the customer stands (the shop's spot), the stains beside the kiosk (the side away from the café)
      shop.x = sp.cx + sp.ox * (TUNE.d / 2 + 4.5); shop.y = sp.cy + sp.oy * (TUNE.d / 2 + 4.5);
      const side = ((sp.cx - a.x) * shop.ux + (sp.cy - a.y) * shop.uy) >= 0 ? 1 : -1;
      for (let k = 0; k < 4; k++) {
        const along = side * (TUNE.w / 2 + 1.2 + rng.next() * 2.4), out = -TUNE.d / 2 + rng.next() * (TUNE.d + 2);
        shop.stains.push({ x: sp.cx + shop.ux * along + sp.ox * out, y: sp.cy + shop.uy * along + sp.oy * out, r: 0.6 + rng.next() * 0.9, c: rng.next() < 0.5 ? STAIN : STAIN2 });
      }
      for (let k = 0; k < 9; k++) shop.sachets.push(SACHETS[(rng.next() * SACHETS.length) | 0]);
      A.list.push(shop);
      const R = 11;
      shop.st = W.addStructure({ t: 'custom', paan: true, terrSelf: true, x0: sp.cx - R, y0: sp.cy - R, x1: sp.cx + R, y1: sp.cy + R, cx: sp.cx, cy: sp.cy, shop, draw: draw2D, build3d });
      solidify(shop);
      const place = { id, name: titleCase(shop.name), kind: 'paan_shop', x: shop.x, y: shop.y, r: 12, district: districtId(shop.x, shop.y), paan: true };
      if (raw) raw.push(place);
      N.places[id] = { id, name: place.name, x: place.x, y: place.y, r: place.r, district: place.district, kind: 'paan_shop' };
    }
    // the shop kind, the crowd zone, the shop list again
    try { if (N.shops && N.shops.KINDS && !N.shops.KINDS.paan_shop) N.shops.KINDS.paan_shop = KIND; } catch (e) { N.err('paan.kind', e); }
    try { if (N.traffic && N.traffic.TUNE && N.traffic.TUNE.zones && !N.traffic.TUNE.zones.paan_shop) N.traffic.TUNE.zones.paan_shop = TUNE.crowd; } catch (e) { N.err('paan.zone', e); }
    try { if (N.shops && N.shops.rebuild) N.shops.rebuild(); } catch (e) { N.err('paan.shops', e); }
    A.built = true;
    N.emit('paan:built', { count: A.list.length });
  }
  const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  /* ================================================================ 2D */
  // the corners of a box in the kiosk's frame: centre (x, y), a half-length along the street, a half-depth out to it
  function corners(sh, x, y, hu, ho) {
    const ux = sh.ux, uy = sh.uy, ox = sh.ox, oy = sh.oy;
    return [[x - ux * hu - ox * ho, y - uy * hu - oy * ho], [x + ux * hu - ox * ho, y + uy * hu - oy * ho], [x + ux * hu + ox * ho, y + uy * hu + oy * ho], [x - ux * hu + ox * ho, y - uy * hu + oy * ho]];
  }
  function draw2D(ctx, s) {
    if (s.dead) return;
    const D = N.draw, sh = s.shop, P = sh.paint, night = (N.render && N.render.night) || 0;
    const cx = sh.cx, cy = sh.cy, hw = sh.w / 2, hd = sh.d / 2;
    for (const st of sh.stains) D.disc(st.x, st.y, st.r, 0.02, st.c);
    D.poly(corners(sh, cx, cy, hw + 0.3, hd + 0.3), 0, 0.6, { wall: '#8a857a', roof: '#9a958a' });
    // the body to the counter, the back and side walls to the roof, the fascia over the opening
    D.poly(corners(sh, cx, cy, hw, hd), 0.6, TUNE.counter, { wall: P.body, roof: '#6a4a2a' });
    D.poly(corners(sh, cx - sh.ox * (hd - 0.4), cy - sh.oy * (hd - 0.4), hw, 0.4), TUNE.counter, TUNE.h, { wall: P.body, roof: P.body });
    for (const k of [-1, 1]) D.poly(corners(sh, cx + sh.ux * k * (hw - 0.3), cy + sh.uy * k * (hw - 0.3), 0.3, hd), TUNE.counter, TUNE.h, { wall: P.body, roof: P.body });
    // the striped tin roof, out over the counter, the green betel leaf painted on it, the board along the front
    const rx = cx + sh.ox * TUNE.over / 2, ry = cy + sh.oy * TUNE.over / 2;
    D.poly(corners(sh, rx, ry, hw + 0.6, hd + TUNE.over / 2 + 0.3), TUNE.h, TUNE.h + 0.5, { wall: P.roof, roof: P.roof });
    D.plane(TUNE.h + 0.5, (g) => {
      g.save();
      g.translate(rx, ry); g.rotate(Math.atan2(sh.uy, sh.ux));
      g.fillStyle = P.roof2;
      for (let k = -2; k <= 2; k += 2) g.fillRect(k * 1.6 - 0.6, -(hd + TUNE.over / 2 + 0.3), 1.2, (hd + TUNE.over / 2 + 0.3) * 2);
      // the leaf: a heart, its tip to the street
      g.fillStyle = '#2f8a2a'; g.beginPath();
      g.moveTo(0, 2.4); g.bezierCurveTo(-3.2, 0.4, -2.4, -2.6, 0, -1.2); g.bezierCurveTo(2.4, -2.6, 3.2, 0.4, 0, 2.4); g.fill();
      g.strokeStyle = '#bfe08a'; g.lineWidth = 0.25; g.beginPath(); g.moveTo(0, 2.2); g.lineTo(0, -1.0); g.stroke();
      g.restore();
    });
    const bx = cx + sh.ox * (hd + 0.7), by = cy + sh.oy * (hd + 0.7);
    D.poly(corners(sh, bx, by, hw + 0.3, 0.25), TUNE.sign[0], TUNE.sign[1], { wall: P.bg, roof: P.trim });
    if (night > 0.15) D.disc(cx + sh.ox * (hd - 0.2), cy + sh.oy * (hd - 0.2), 1.6 + night, TUNE.open, 'rgba(255,220,140,' + (0.35 * night).toFixed(3) + ')');
    void ctx;
  }

  /* ================================================================ 3D */
  const TEX = new Map();
  function signMat(THREE, sh) {
    const key = sh.name + '|' + sh.paint.bg;
    let m = TEX.get(key);
    if (m) return m;
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d'), P = sh.paint;
    g.fillStyle = P.bg; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = P.trim; g.lineWidth = 8; g.strokeRect(6, 6, 500, 116);
    // the leaf at the left, the name painted across
    g.fillStyle = '#2f8a2a'; g.beginPath(); g.moveTo(58, 104); g.bezierCurveTo(14, 70, 24, 22, 58, 42); g.bezierCurveTo(92, 22, 102, 70, 58, 104); g.fill();
    g.strokeStyle = '#bfe08a'; g.lineWidth = 3; g.beginPath(); g.moveTo(58, 100); g.lineTo(58, 46); g.stroke();
    g.fillStyle = P.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 60; g.font = "800 " + fs + "px 'Baloo 2', 'Arial Black', sans-serif";
    while (g.measureText(sh.name).width > 380 && fs > 26) { fs -= 2; g.font = "800 " + fs + "px 'Baloo 2', 'Arial Black', sans-serif"; }
    g.fillText(sh.name, 300, 70);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    m = new THREE.MeshLambertMaterial({ map: tex });
    TEX.set(key, m);
    return m;
  }
  function build3d(THREE, s, H, gb, J) {
    const sh = s.shop;
    if (s.dead || !sh) return null;
    const VS = H.VS || 1.5, ox = J.ox, oz = J.oz, P = sh.paint;
    const T = (x, y) => (H.terrainAt ? H.terrainAt(x, y) || 0 : 0);
    const hw = sh.w / 2, hd = sh.d / 2;
    // the kiosk sits on the low side of its footprint (the plinth takes up the slope)
    let base = Infinity;
    for (const c of corners(sh, sh.cx, sh.cy, hw + 0.3, hd + 0.3)) base = Math.min(base, T(c[0], c[1]));
    if (!isFinite(base)) base = 0;
    const ang = Math.atan2(sh.uy, sh.ux);
    const at = (u, o) => [sh.cx + sh.ux * u + sh.ox * o - ox, sh.cy + sh.uy * u + sh.oy * o - oz];
    const Y = (h) => base + h * VS;
    const box = (u, o, lu, lo, h0, h1, col) => { const p = at(u, o); gb.color(col).obox(p[0], p[1], lu, lo, Y(h0), Y(h1), ang); };
    gb.plain();
    box(0, 0, sh.w + 0.6, sh.d + 0.6, -0.4, 0.6, '#8a857a');                 // the plinth
    box(0, 0, sh.w, sh.d, 0.6, TUNE.counter, P.body);                        // the body up to the counter
    box(0, -(hd - 0.3), sh.w, 0.6, TUNE.counter, TUNE.h, P.body);             // the back wall
    for (const k of [-1, 1]) box(k * (hw - 0.3), 0, 0.6, sh.d, TUNE.counter, TUNE.h, P.body); // the side walls
    box(0, hd - 0.3, sh.w, 0.6, TUNE.open, TUNE.h, P.trim);                   // the fascia over the opening
    box(0, hd + 0.05, sh.w + 0.2, 0.2, 1.4, 1.8, P.trim);                     // a painted band on the front
    // inside: the shelves on the back wall with their jars, the mirror on a side wall
    for (const h of [5.4, 7.2]) {
      box(0, -(hd - 1.0), sh.w - 1.4, 1.0, h, h + 0.25, '#7a5a3a');
      for (let k = 0; k < 6; k++) box(-hw + 1.3 + k * (sh.w - 2.6) / 5, -(hd - 1.0), 0.6, 0.6, h + 0.25, h + 1.1, SACHETS[(sh.seed + k * 3 + h) % SACHETS.length | 0]);
    }
    box(hw - 0.65, -0.4, 0.08, 1.6, 6.0, 8.2, '#bcd8e4');
    // the counter: the top sticking out, the leaves under the red cloth, the steel tins, the brass lota
    box(0, hd - 0.4, sh.w - 0.2, 1.6, TUNE.counter, TUNE.counter + 0.3, '#c8a878');
    box(-1.6, hd - 0.6, 2.4, 1.2, TUNE.counter + 0.3, TUNE.counter + 0.6, '#3f8a2a');
    box(-1.6, hd - 0.6, 2.2, 1.0, TUNE.counter + 0.6, TUNE.counter + 0.75, '#b8202a');
    for (let k = 0; k < 4; k++) { const p = at(0.6 + k * 0.85, hd - 0.7); gb.color('#c8ccd2').cyl(p[0], Y(TUNE.counter + 0.3), p[1], 0.32, 0.32, 0.55 * VS, 8); }
    { const p = at(hw - 1.0, hd - 0.7); gb.color('#c8962a').cyl(p[0], Y(TUNE.counter + 0.3), p[1], 0.35, 0.45, 0.7 * VS, 8); }
    // the striped tin roof out over the counter, the board on top along the front
    box(0, TUNE.over / 2, sh.w + 1.2, sh.d + TUNE.over + 0.6, TUNE.h, TUNE.h + 0.45, P.roof);
    for (let k = -2; k <= 2; k += 2) box(k * 1.6, TUNE.over / 2, 1.2, sh.d + TUNE.over + 0.62, TUNE.h + 0.02, TUNE.h + 0.47, P.roof2);
    box(0, hd + 0.7, sh.w + 0.6, 0.45, TUNE.sign[0], TUNE.sign[1], P.bg);
    box(0, hd + 0.7, sh.w + 0.8, 0.5, TUNE.sign[1], TUNE.sign[1] + 0.25, P.trim);
    // the strings of foil sachets hanging in the opening, at both ends
    for (let k = 0; k < sh.sachets.length; k++) {
      const end = k < 5 ? -1 : 1, i = k < 5 ? k : k - 5;
      const u = end * (hw - 0.8 - i * 0.55);
      box(u, hd + 0.15, 0.42, 0.08, TUNE.open - 3.2 + (i % 2) * 0.4, TUNE.open - 0.1, sh.sachets[k]);
    }
    // the stains on the ground beside it (paan, spat)
    for (const st of sh.stains) {
      const x = st.x - ox, z = st.y - oz, y = T(st.x, st.y) + 0.06, r = st.r;
      gb.color(st.c).quad(x - r, y, z - r * 0.7, x - r, y, z + r * 0.7, x + r, y, z + r, x + r, y, z - r);
    }
    // the bulb under the roof's edge: a glow and a lamp at night
    { const p = at(0, hd + 0.2), h = Y(TUNE.open - 0.4); gb.color('#fff4cc').sphere(p[0], h, p[1], 0.45, 0.55, 0.45, 8, 5); J.glows.push([p[0], h, p[1], 1.0, 0.86, 0.55, 0.9]); J.lamps.push([p[0] + ox, h, p[1] + oz, 0xffd890]); }
    // the painted name on the board's face
    try {
      const geo = new THREE.PlaneGeometry(sh.w + 0.2, (TUNE.sign[1] - TUNE.sign[0]) * VS - 0.3);
      const mesh = new THREE.Mesh(geo, signMat(THREE, sh));
      const p = at(0, hd + 0.96);
      mesh.position.set(p[0] + ox, Y((TUNE.sign[0] + TUNE.sign[1]) / 2), p[1] + oz); // (world: the core makes a returned object chunk-local)
      mesh.rotation.y = Math.atan2(sh.ox, sh.oy);
      mesh.name = 'paan-sign';
      mesh.userData.noShadow = true;
      return mesh;
    } catch (e) { N.err('paan.sign', e); return null; }
  }
  if (N.view3d && N.view3d.registerStructure && !N.ameerpet && !N.hills && !N.breakers) {
    N.view3d.registerStructure('custom', (THREE, s, H, gb, J) => (typeof s.build3d === 'function' ? s.build3d(THREE, s, H, gb, J) : null));
  }

  /* ================================================================ the paan-walas */
  const KEEPER_LOOKS = [
    { look: { kind: 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#f4f2ea', pants: '#f4f2ea', hat: 'skull' }, portrait: { kind: 'man', skin: '#a0683f', cap: 'skull', moustache: 'thick', shirt: '#f4f2ea', collar: 'band' } },
    { look: { kind: 'man', skin: '#8d5a3b', hair: '#1a1412', shirt: '#e8dcc0', pants: '#4a4a4a', hat: 'gandhi' }, portrait: { kind: 'man', skin: '#8d5a3b', cap: 'gandhi', moustache: 'huge', shirt: '#e8dcc0', collar: 'v' } },
    { look: { kind: 'man', skin: '#c68b5e', hair: '#d8d4c8', shirt: '#f4f2ea', pants: '#f4f2ea', beard: '#c8642a' }, portrait: { kind: 'man', age: 'old', skin: '#c68b5e', hair: '#e8e4dc', beard: 'trim', beardColor: '#c8642a', shirt: '#f4f2ea', collar: 'band' } },
    { look: { kind: 'man', skin: '#9a6040', hair: '#1a1412', shirt: '#2a6a5a', pants: '#3a3a4a' }, portrait: { kind: 'man', skin: '#9a6040', moustache: 'thin', shirt: '#2a6a5a', collar: 'v' } },
  ];
  function defineKeepers() {
    const P = N.npcs;
    if (!P || !P.define || A.defined) return;
    KEEPER_LOOKS.forEach((k, i) => { try { P.define('paanwala_' + (i + 1), { name: 'Paan-wala', color: '#2f8a2a', voice: 0.92 + i * 0.04, look: k.look, portrait: k.portrait }); } catch (e) { N.err('paan.define', e); } });
    A.defined = true;
  }
  function dropKeeper(id) {
    const key = A.keepers.get(id);
    A.keepers.delete(id);
    try { if (key && N.npcs && N.npcs.despawn) N.npcs.despawn(key); } catch (e) { N.err('paan.keeper', e); }
  }
  function openNow(id) {
    try { if (N.shops && N.shops.status) return !!N.shops.status(id).open; } catch (e) { /* ignore */ }
    const m = N.clock ? N.clock.minutes : 720;
    return m >= 9 * 60 && m < 23 * 60 + 30;
  }
  function keepers() {
    const p = N.player;
    if (!p || !N.npcs || !N.npcs.spawn) return;
    defineKeepers();
    for (const id of Array.from(A.keepers.keys())) {
      const sh = A.list.find((q) => q.id === id);
      if (!sh || Math.hypot(sh.cx - p.x, sh.cy - p.y) > TUNE.far || !openNow(id)) dropKeeper(id);
    }
    if (A.keepers.size >= TUNE.keepers) return;
    const near = A.list.filter((sh) => !A.keepers.has(sh.id) && Math.hypot(sh.cx - p.x, sh.cy - p.y) < TUNE.near && openNow(sh.id))
      .sort((a, b) => Math.hypot(a.cx - p.x, a.cy - p.y) - Math.hypot(b.cx - p.x, b.cy - p.y));
    for (const sh of near) {
      if (A.keepers.size >= TUNE.keepers) break;
      const key = 'paan:' + sh.id;
      try {
        // behind the counter, facing the street (he never leaves it: no world collision for him inside the kiosk)
        const a = N.npcs.spawn('paanwala_' + sh.keeper, { x: sh.cx - sh.ox * 0.6, y: sh.cy - sh.oy * 0.6 }, { key, idle: 'work', talk: false, free: false, angle: Math.atan2(sh.oy, sh.ox), owner: 'paan' });
        if (a) { a.noWorld = true; a.paan = sh.id; A.keepers.set(sh.id, key); }
      } catch (e) { N.err('paan.keeper', e); }
    }
  }

  /* ================================================================ system, API */
  N.addSystem({
    id: 'paan', order: 62, runIn: ['play'],
    update(dt) {
      if (!A.built) return;
      A.t -= dt;
      if (A.t > 0) return;
      A.t = 0.5;
      keepers();
    },
    reset() { for (const k of Array.from(A.keepers.keys())) dropKeeper(k); },
  });
  N.on('world:built', () => { A.cells = []; try { build(); } catch (e) { N.err('paan.build', e); } });
  N.on('game:new', () => { for (const k of Array.from(A.keepers.keys())) dropKeeper(k); });

  N.paan = {
    get list() { return A.list; },
    TUNE, KIND,
    stats() {
      const byAnchor = {};
      for (const sh of A.list) { const k = sh.anchor.indexOf('hills:') === 0 ? 'coffee' : (N.places[sh.anchor] && N.places[sh.anchor].kind) || '?'; byAnchor[k] = (byAnchor[k] || 0) + 1; }
      return { shops: A.list.length, byAnchor, keepers: A.keepers.size, missed: A.miss.slice(), why: Object.assign({}, A.why) };
    },
    nearest(x, y) { let b = null, bd = Infinity; for (const sh of A.list) { const d = Math.hypot(sh.cx - x, sh.cy - y); if (d < bd) { bd = d; b = sh; } } return b; },
    _build: build,
  };
})();
