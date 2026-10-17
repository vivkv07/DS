/* NOSTALGIA — worlddata.js
 * MAP_PLAN_FINAL — the whole of Hyderabad + Secunderabad as N.WORLD_DATA.
 * Owner: map maker. Authored from design/map_plan.md (ARCHITECTURE.md §7 format).
 *
 * World: 8000 x 6000 u, north up, +y south. Compressed but topologically faithful
 * (piecewise-linear squeeze of real km offsets from Charminar, ~0.43 u/m in the core).
 *
 * Conventions (read before editing):
 *  - landmarks[]: {id, name, draw, x, y, w, d, h, face?, solid?, sign?, ...}.
 *    x,y = CENTRE of the footprint; w = east-west size, d = north-south size.
 *    face = 'n'|'s'|'e'|'w' = side the main entrance / shopfront looks at.
 *    solid:false = decoration the player can walk/drive under (arches, gateways).
 *  - buildings[].rect, blocks[].rect, districts[].rect = [x, y, w, h] (top-left + size).
 *  - places[]: {id, name, x, y, r, district, kind}. Always on a walkable cell (footpath,
 *    plaza, park) right next to the thing it names, never inside a footprint or water.
 *  - roads[].pts are centrelines. kind: arterial|street|lane|bund|bridge|path.
 *    Extra optional fields: median (bool, painted divider), trees (avenue tree kind).
 *  - rails[] (new data kind, painted + made walkable by src/world_extras.js):
 *    {id, name, pts, w}. Stations are landmarks; platforms are 'plaza' parks.
 *  - parks[].kind: grass|garden|ground|plaza|rock. Optional surface:'sand' (riverbed).
 *  - noFill[] (new, optional): rects kept as open land by the block filler below.
 *
 * Not "pure literal" data: a small deterministic expansion step at the bottom
 * (no Math.random, no DOM, ~60 ms) fills in each place's district, plants avenue trees,
 * scatters Deccan boulders (D._rockFields) away from everything, and derives blocks[] from
 * the free land between roads: square-ish rectangles on a 16 u raster, tile-aligned, only
 * within ~230 u of a road (the fringe stays open fields). Same input -> same output.
 * World.js snaps T-junctions itself. Helpers used below: road, rail, water, park, lm, site
 * (landmark + place at its entrance), S / shop (shop beside a road), place, alias, laneV,
 * laneH, compound (paved/garden forecourt around a landmark). Validate with
 * `node tools/validate_map.cjs`; preview with `node tests/map_preview.cjs`.
 * Story reconcile (world-reconcile agent): the bible's NEW ids (irani_cafe_19 / cafe_noor_e_iran,
 * recording_centre_1, electronics_shop_1, charminar_gallery), roofs[] + planks[] (walkable terraces,
 * ARCHITECTURE §7 "Roof zones"), podium junctions (places with podium: true), respect[] (worship
 * compounds + forecourts, §19 N.respect). `node tools/check_registry.cjs` diffs every place id
 * the design documents use against this file.
 */
// MAP_PLAN_FINAL
(() => {
  'use strict';
  const N = (window.N = window.N || {});

  const D = {
    version: 1,
    size: [8000, 6000],
    districts: [], water: [], roads: [], rails: [], parks: [], rocks: [], blocks: [],
    buildings: [], landmarks: [], trees: [], places: [], noFill: [], spawns: {},
  };
  const ROAD = {};
  const PL = {};

  /* ------------------------------------------------------------ helpers */
  const rectPoly = (r) => [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0] + r[2], r[1] + r[3]], [r[0], r[1] + r[3]]];
  function road(id, name, kind, w, pts, o) {
    const r = Object.assign({ id, name, kind, w, pts }, o || {});
    D.roads.push(r); ROAD[id] = r; return r;
  }
  function rail(id, name, pts, o) { const r = Object.assign({ id, name, pts, w: 16 }, o || {}); D.rails.push(r); return r; }
  function water(id, name, poly, o) { D.water.push(Object.assign({ id, name, poly }, o || {})); }
  function park(id, name, kind, shape, o) {
    const poly = typeof shape[0] === 'number' ? rectPoly(shape) : shape;
    D.parks.push(Object.assign({ id, name, kind, poly }, o || {}));
  }
  function lm(id, name, draw, x, y, w, d, h, o) {
    const L = Object.assign({ id, name, draw, x, y, w, d, h }, o || {});
    D.landmarks.push(L); return L;
  }
  function bld(id, rect, h, style, sign, o) {
    const b = Object.assign({ rect, h, style }, o || {});
    if (id) b.id = id;
    if (sign) b.sign = typeof sign === 'string' ? { text: sign, color: '#f2c230' } : sign;
    D.buildings.push(b); return b;
  }
  function place(id, name, kind, x, y, r, o) {
    const p = Object.assign({ id, name, x: Math.round(x), y: Math.round(y), r: r || 24, district: null, kind }, o || {});
    D.places.push(p); PL[id] = p; return p;
  }
  function rock(x, y, r, h) { D.rocks.push({ x, y, r, h: h || Math.round(r * 1.1) }); }
  function tree(x, y, kind, r) { D.trees.push({ x, y, r: r || 9, kind: kind || 'neem' }); }
  function noFill(rect, why) { D.noFill.push({ rect, why }); }

  // point at fraction t (0..1) along a road's polyline + unit direction
  function at(id, t) {
    const pts = ROAD[id].pts;
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let want = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < seg.length; i++) {
      if (want <= seg[i] || i === seg.length - 1) {
        const k = seg[i] ? Math.min(1, want / seg[i]) : 0;
        const a = pts[i], b = pts[i + 1];
        return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: (b[0] - a[0]) / (seg[i] || 1), dy: (b[1] - a[1]) / (seg[i] || 1) };
      }
      want -= seg[i];
    }
    return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
  }
  // footpath spot beside a road. s = 'L' or 'R' (looking along pts order). gap = beyond the kerb.
  function side(id, t, s, gap) {
    const p = at(id, t), w = ROAD[id].w;
    const nx = s === 'R' ? -p.dy : p.dy, ny = s === 'R' ? p.dx : -p.dx;
    const off = w / 2 + (gap == null ? 7 : gap);
    const x = p.x + nx * off, y = p.y + ny * off;
    // the thing at this spot faces back towards the road
    const face = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'w' : 'e') : (ny > 0 ? 'n' : 's');
    return { x: Math.round(x), y: Math.round(y), face };
  }
  const FACE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

  // Shop / stall kinds: [frontage, depth, height, draw]
  const KIND = {
    kirana: [26, 20, 22, 'kirana'], irani_cafe: [44, 30, 26, 'irani_cafe'], stationery: [24, 18, 22, 'stationery'],
    pindi_girni: [30, 24, 24, 'pindi_girni'], std_booth: [12, 12, 15, 'std_booth'], barber: [22, 18, 22, 'barber'],
    cycle_rent: [28, 20, 20, 'cycle_rent'], video_parlour: [30, 22, 24, 'video_parlour'], bakery: [28, 22, 24, 'bakery'],
    iyengar_bakery: [30, 22, 24, 'iyengar_bakery'], meat_shop: [22, 18, 20, 'meat_shop'], medical_shop: [24, 18, 22, 'medical_shop'],
    photo_studio: [24, 18, 24, 'photo_studio'], restaurant: [44, 30, 26, 'restaurant'], sweet_shop: [28, 20, 22, 'sweet_shop'],
    banana_cart: [16, 9, 12, 'banana_cart'], flower_cart: [16, 9, 12, 'flower_cart'], samosa_bandi: [16, 9, 12, 'samosa_bandi'],
    dosa_bandi: [16, 9, 12, 'dosa_bandi'], coconut_cart: [16, 9, 12, 'coconut_cart'], chai_bandi: [14, 9, 12, 'chai_bandi'],
    bus_stop: [32, 10, 16, 'bus_stop'], kite_stall: [20, 12, 14, 'kite_stall'], book_stall: [24, 10, 12, 'book_stall'],
    paan_shop: [12, 10, 14, 'paan_shop'], puncture_shop: [16, 12, 14, 'puncture_shop'], tiffin_centre: [30, 22, 22, 'tiffin_centre'],
    cable_office: [20, 16, 22, 'cable_office'], milk_booth: [12, 12, 14, 'milk_booth'],
    internet_cafe: [32, 22, 24, 'internet_cafe'],
  };
  // A shop/stall: landmark behind a footpath spot (pos from side() or {x,y,face}); place on the spot.
  function shop(id, kind, name, sign, pos, o) {
    o = o || {};
    const k = KIND[kind];
    const fw = o.fw || k[0], fd = o.fd || k[1], h = o.h || k[2];
    const f = FACE[pos.face];
    const gap = o.gap == null ? 5 : o.gap;
    const cx = pos.x - f[0] * (gap + fd / 2), cy = pos.y - f[1] * (gap + fd / 2);
    const ns = pos.face === 'n' || pos.face === 's';
    lm(id, name, o.draw || k[3], Math.round(cx), Math.round(cy), ns ? fw : fd, ns ? fd : fw, h,
      Object.assign({ face: pos.face }, sign ? { sign } : {}, o.lm || {}));
    return place(id, name, o.kind || kind, pos.x, pos.y, o.r || 18, o.place || {});
  }

  /* ---------------------------------------------------------- districts */
  // Non-overlapping rectangles that tile the whole 8000 x 6000 world.
  // fill = share of free land the block filler builds on; lot = [min, max] block size (u).
  function district(id, name, nameTe, x0, y0, x1, y1, style, ground, fill, lot) {
    D.districts.push({ id, name, nameTe, rect: [x0, y0, x1 - x0, y1 - y0], ground, style, fill, lot: lot || [28, 110] });
  }
  district('hitec', 'Madhapur & HITEC City', 'మాదాపూర్ & హైటెక్ సిటీ', 0, 0, 1500, 1250, 'hitec', '#b39b74', 0.5, [40, 140]);
  district('erragadda', 'Erragadda & Sanathnagar', 'ఎర్రగడ్డ', 1500, 0, 2650, 760, 'colony', '#ad9670', 0.9);
  district('begumpet', 'Begumpet', 'బేగంపేట', 2650, 0, 4300, 760, 'posh', '#a39b72', 0.8, [36, 130]);
  district('secunderabad', 'Secunderabad', 'సికింద్రాబాద్', 4300, 0, 5700, 1250, 'cantonment', '#a49d74', 0.9, [30, 120]);
  district('marredpally', 'Marredpally & Malkajgiri', 'మారేడ్‌పల్లి', 5700, 0, 8000, 1250, 'cantonment', '#a19c70', 0.7, [36, 120]);
  district('ameerpet', 'Ameerpet & SR Nagar', 'అమీర్‌పేట', 1500, 760, 3300, 1250, 'colony', '#ac9670', 0.94);
  district('hussain_sagar', 'Hussain Sagar & Necklace Road', 'హుస్సేన్ సాగర్', 3300, 760, 4300, 2080, 'colonial', '#9fa071', 0.6, [36, 120]);
  district('jubilee', 'Jubilee Hills & Film Nagar', 'జూబ్లీ హిల్స్', 0, 1250, 1700, 2150, 'rocky', '#a8936f', 0.5, [40, 150]);
  district('banjara', 'Banjara Hills', 'బంజారా హిల్స్', 1700, 1250, 2850, 2150, 'posh', '#a19970', 0.75, [40, 150]);
  district('khairatabad', 'Panjagutta & Khairatabad', 'ఖైరతాబాద్', 2850, 1250, 3300, 2150, 'colony', '#ab9670', 0.94);
  district('musheerabad', 'Musheerabad & Indira Park', 'ముషీరాబాద్', 4300, 1250, 5300, 2080, 'colony', '#ab9670', 0.94);
  district('osmania', 'Osmania University & Tarnaka', 'ఉస్మానియా యూనివర్సిటీ', 5300, 1250, 8000, 2700, 'rocky', '#a59a6e', 0.5, [36, 130]);
  district('golconda', 'Golconda & Qutb Shahi Tombs', 'గోల్కొండ', 0, 2150, 1450, 3450, 'rocky', '#b0946c', 0.35, [32, 110]);
  district('tolichowki', 'Tolichowki & Mehdipatnam', 'టోలిచౌకి & మెహదీపట్నం', 1450, 2150, 2600, 3300, 'colony', '#ae966f', 0.9);
  district('masab_tank', 'Masab Tank & Lakdikapul', 'మాసాబ్ ట్యాంక్', 2600, 2150, 3300, 3350, 'colony', '#ac9670', 0.94);
  district('basheerbagh', 'Public Gardens & Basheerbagh', 'బషీర్‌బాగ్', 3300, 2080, 4080, 2760, 'colonial', '#a49c72', 0.85);
  district('himayatnagar', 'Himayatnagar & Narayanguda', 'హిమాయత్‌నగర్', 4080, 2080, 4760, 2760, 'colony', '#ad9771', 0.96);
  district('rtc_x', 'RTC X Roads & Chikkadpally', 'ఆర్టీసీ క్రాస్ రోడ్స్', 4760, 2080, 5300, 2760, 'market', '#b09a7a', 0.96);
  district('nampally', 'Nampally & Mozamjahi Market', 'నాంపల్లి', 3300, 2760, 3880, 3350, 'market', '#b19a7c', 0.96);
  district('abids', 'Abids', 'ఆబిడ్స్', 3880, 2760, 4200, 3350, 'market', '#b29b7e', 0.97);
  district('koti', 'Koti & Sultan Bazaar', 'కోఠి', 4200, 2760, 4700, 3350, 'market', '#b39b7d', 0.97);
  district('kachiguda', 'Kachiguda & Barkatpura', 'కాచిగూడ', 4700, 2760, 5300, 3350, 'colony', '#ad9771', 0.94);
  district('amberpet', 'Amberpet & Nallakunta', 'అంబర్‌పేట', 5300, 2700, 8000, 3350, 'colony', '#ab9670', 0.8);
  district('langar_houz', 'Langar Houz & Attapur', 'లంగర్ హౌస్', 1450, 3300, 2600, 4800, 'colony', '#ae956c', 0.7);
  district('puranapul', 'Puranapul & Dhoolpet', 'పురానాపూల్', 2600, 3350, 3550, 3950, 'oldcity', '#b5a081', 0.96);
  district('afzalgunj', 'Afzalgunj & the Musi', 'అఫ్జల్‌గంజ్', 3550, 3350, 4150, 3950, 'colonial', '#b19d7e', 0.9);
  district('chaderghat', 'Chaderghat & Imlibun', 'చాదర్‌ఘాట్', 4150, 3350, 4800, 3950, 'market', '#b09a7b', 0.95);
  district('malakpet', 'Malakpet', 'మలక్‌పేట', 4800, 3350, 5700, 4300, 'colony', '#ad9771', 0.92);
  district('dilsukhnagar', 'Dilsukhnagar & Kothapet', 'దిల్‌సుఖ్‌నగర్', 5700, 3350, 7000, 4400, 'colony', '#ae9771', 0.92);
  district('lb_nagar', 'LB Nagar & Nagole', 'ఎల్బీ నగర్', 7000, 3350, 8000, 6000, 'colony', '#ad966e', 0.6);
  district('charminar', 'Charminar', 'చార్మినార్', 3550, 3950, 4250, 4800, 'oldcity', '#b8a384', 0.98, [22, 90]);
  district('bahadurpura', 'Bahadurpura & Hussaini Alam', 'బహదూర్‌పురా', 2600, 3950, 3550, 4800, 'oldcity', '#b5a082', 0.92, [24, 100]);
  district('dabeerpura', 'Purani Haveli & Dabeerpura', 'దబీర్‌పురా', 4250, 3950, 4800, 4800, 'oldcity', '#b6a183', 0.96, [24, 100]);
  district('saidabad', 'Saidabad', 'సైదాబాద్', 4800, 4300, 5700, 4800, 'colony', '#ad966f', 0.85);
  district('rajendranagar', 'Rajendranagar Fields', 'రాజేంద్రనగర్', 0, 3450, 1450, 6000, 'rocky', '#ad9468', 0.22, [40, 120]);
  district('zoo', 'Nehru Zoo & Mir Alam Tank', 'మీర్ ఆలం', 1450, 4800, 3300, 6000, 'rocky', '#a99a6c', 0.3);
  district('falaknuma', 'Falaknuma', 'ఫలక్‌నుమా', 3300, 4800, 4400, 6000, 'oldcity', '#b39c7c', 0.75, [26, 100]);
  district('chandrayangutta', 'Chandrayangutta & Santoshnagar', 'చాంద్రాయణగుట్ట', 4400, 4800, 5700, 6000, 'colony', '#ae956d', 0.7);
  district('saroornagar', 'Saroornagar', 'సరూర్‌నగర్', 5700, 4400, 7000, 6000, 'colony', '#ad966e', 0.65);

  /* -------------------------------------------------------------- water */
  // ribbon polygon along a centreline (hw = half width)
  function ribbon(pts, hw) {
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      L.push([Math.round(p[0] - (dy / l) * hw), Math.round(p[1] + (dx / l) * hw)]);
      R.push([Math.round(p[0] + (dy / l) * hw), Math.round(p[1] - (dx / l) * hw)]);
    }
    return L.concat(R.reverse());
  }
  // circle polygon (n points); ccw=true traces it the other way (for keyhole islands)
  function circ(cx, cy, r, n, ccw, start) {
    const out = []; const a0 = start == null ? Math.PI / 2 : start;
    for (let i = 0; i <= n; i++) { const a = a0 + (ccw ? -1 : 1) * (i / n) * Math.PI * 2; out.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]); }
    return out;
  }
  // Hussain Sagar: clockwise from the south tip (Lumbini). The Buddha's Gibraltar Rock is a
  // keyhole hole (slit up from the south tip, island traced the other way) so it is dry land.
  const BUDDHA = [3880, 1790];
  const LAKE = [[3880, 1990], [3790, 1962], [3655, 1912], [3530, 1838], [3445, 1735], [3398, 1585], [3388, 1405], [3420, 1245],
    [3478, 1128], [3560, 1065], [3680, 1025], [3850, 1005], [4040, 1005], [4215, 1025], [4330, 1060], [4400, 1105], [4393, 1172],
    [4323, 1332], [4228, 1527], [4108, 1757], [3975, 1965]];
  water('hussain_sagar', 'Hussain Sagar', LAKE.concat([[3880, 1990], [BUDDHA[0], BUDDHA[1] + 34]], circ(BUDDHA[0], BUDDHA[1], 34, 20, true), [[BUDDHA[0], BUDDHA[1] + 34]]), { bank: 0, color: '#2f7f86' });
  // The Musi: narrow channel in a wide sandy bed (bank = sand on both sides)
  const MUSI = [[-60, 3860], [600, 3830], [1100, 3810], [1650, 3770], [2150, 3880], [2700, 3925], [3200, 3905], [3610, 3835],
    [3915, 3800], [4130, 3760], [4330, 3690], [4520, 3600], [4800, 3610], [5050, 3640], [5580, 3745], [6000, 3730], [6600, 3650],
    [7300, 3625], [8060, 3600]];
  water('musi', 'Musi River', ribbon(MUSI, 30), { bank: 42, color: '#3d7a72' });
  water('mir_alam_tank', 'Mir Alam Tank', [[2150, 5030], [2320, 4990], [2520, 5010], [2680, 5060], [2740, 5150], [2690, 5250], [2540, 5300], [2380, 5330], [2220, 5300], [2110, 5210], [2100, 5100]], { bank: 8 });
  water('durgam_cheruvu', 'Durgam Cheruvu (the secret lake)', [[690, 1080], [760, 1060], [800, 1120], [790, 1230], [740, 1330], [690, 1350], [660, 1270], [665, 1160]], { bank: 4, color: '#2a6f78' });
  water('saroornagar_lake', 'Saroornagar Lake', [[6260, 4720], [6380, 4690], [6520, 4710], [6600, 4780], [6560, 4870], [6420, 4900], [6290, 4870], [6240, 4790]], { bank: 6 });
  water('safilguda_lake', 'Safilguda Lake', [[6620, 400], [6720, 380], [6800, 430], [6780, 520], [6680, 540], [6610, 490]], { bank: 4 });
  water('banjara_lake', 'Banjara Lake', [[2330, 1870], [2410, 1850], [2460, 1900], [2430, 1960], [2350, 1965], [2310, 1920]], { bank: 4 });
  water('mecca_masjid_houz', 'Mecca Masjid pond', [[3800, 4568], [3830, 4568], [3830, 4592], [3800, 4592]], { bank: 0 });

  /* -------------------------------------------------------------- roads */
  // Key junctions (world units). Real names; see design/map_plan.md for the full table.
  const J = {
    CHARMINAR: [3900, 4360], GULZAR: [3900, 4120], MADINA: [3903, 3995], AFZALGUNJ: [3922, 3700],
    PURANAPUL_S: [3200, 4005], PURANAPUL_N: [3200, 3800], KHILWAT: [3520, 4430], BAHADURPURA: [3330, 4560],
    KOTLA_ALIJAH: [4255, 4320], CHADERGHAT_N: [4515, 3495], CHADERGHAT_S: [4525, 3702],
    ABIDS: [3962, 2950], MJ: [3800, 3215], NAMPALLY: [3700, 2950], GUNFOUNDRY: [4080, 2720], BASHEERBAGH: [4160, 2440],
    LIBERTY: [4170, 2290], TELUGU_TALLI: [4000, 2125], KOTI: [4330, 3240], KING_KOTI: [4250, 2860],
    NARAYANGUDA: [4500, 2730], HIMAYATNAGAR: [4450, 2460], CHIKKADPALLY: [4880, 2440], RTC: [4915, 2230],
    BARKATPURA: [4890, 2760], KACHIGUDA_X: [4900, 3000], VIDYANAGAR: [5380, 2440], NALLAKUNTA: [5380, 2790],
    LAKDIKAPUL: [3380, 2345], KHAIRATABAD: [3220, 1992], IMAX: [3462, 2008], MASAB_TANK: [2930, 2500],
    MEHDIPATNAM: [2250, 2880], TOLICHOWKI: [1520, 2560], SHAIKPET: [1300, 2330], LANGAR_HOUZ: [1650, 3350],
    PANJAGUTTA: [2800, 1445], AMEERPET: [2720, 970], SR_NAGAR: [2500, 790], ERRAGADDA: [2120, 330],
    BEGUMPET: [3300, 680], PARADISE: [4500, 720], RANIGUNJ: [4720, 1060], TANKBUND_N: [4442, 1125], KAVADIGUDA: [4570, 1250],
    JUBILEE_CP: [1430, 1300], MADHAPUR: [850, 950], CYBER_JN: [520, 640], RAIDURG: [850, 1950],
    MALAKPET: [5060, 3842], DILSUKHNAGAR: [6250, 3920], KOTHAPET: [6700, 3942], LB_NAGAR: [7150, 4300],
    TARNAKA: [6430, 1330], AMBERPET: [5830, 3110], UPPAL: [7350, 2920],
  };
  const A = 'arterial', ST = 'street', LN = 'lane', BR = 'bridge', PA = 'path';

  // --- Old City (south of the Musi)
  road('charminar_circle', 'Charminar Circle', ST, 34, [[3780, 4280], [3820, 4240], [3980, 4240], [4020, 4280], [4020, 4440], [3980, 4480], [3820, 4480], [3780, 4440], [3780, 4280]]);
  road('pathergatti_rd', 'Pathergatti Road', ST, 36, [[3900, 4240], [3900, 4156]]);
  road('gulzar_houz_loop', 'Gulzar Houz', LN, 24, [[3864, 4084], [3936, 4084], [3936, 4156], [3864, 4156], [3864, 4084]]);
  road('pathergatti_n', 'Pathergatti Road', ST, 36, [[3900, 4084], [3901, 4040], J.MADINA, [3906, 3878]]);
  road('naya_pul', 'Naya Pul', BR, 40, [[3906, 3878], [3922, 3722]]);
  road('musi_south_rd', 'Musi South Bank Road', ST, 40, [J.PURANAPUL_S, [3420, 4002], [3612, 3998], J.MADINA, [4150, 3985], [4330, 3880], J.CHADERGHAT_S]);
  road('laad_bazaar', 'Laad Bazaar', LN, 22, [[3780, 4360], [3640, 4362], [3570, 4380], J.KHILWAT]);
  road('gulzar_houz_w', 'Gulzar Houz West Lane', LN, 22, [[3864, 4120], [3720, 4126], [3600, 4150], [3440, 4235]]);
  road('gulzar_houz_e', 'Gulzar Houz East Lane', LN, 22, [[3936, 4120], [4100, 4120], [4245, 4108]]);
  road('sardar_mahal_rd', 'Sardar Mahal Road', ST, 34, [[4020, 4360], [4150, 4350], J.KOTLA_ALIJAH]);
  road('shah_ali_banda_rd', 'Shah Ali Banda Road', ST, 36, [[3900, 4480], [3905, 4620], [3915, 4760], [3880, 4950], [3780, 5120], [3700, 5260]]);
  road('hussaini_alam_rd', 'Hussaini Alam Road', ST, 34, [J.KHILWAT, [3440, 4235], [3330, 4100], J.PURANAPUL_S]);
  road('khilwat_rd', 'Khilwat Road', ST, 32, [J.KHILWAT, [3420, 4500], J.BAHADURPURA]);
  road('darulshifa_rd', 'Darulshifa Road', ST, 34, [J.KOTLA_ALIJAH, [4245, 4110], [4186, 3966]]);
  road('dabeerpura_rd', 'Dabeerpura Road', ST, 36, [J.KOTLA_ALIJAH, [4400, 4230], [4480, 4090], [4650, 3990], [4860, 3905], J.MALAKPET]);
  road('yakutpura_rd', 'Yakutpura Road', ST, 34, [J.KOTLA_ALIJAH, [4450, 4400], [4700, 4520], [5000, 4520], [5350, 4500]]);
  road('lal_darwaza_rd', 'Lal Darwaza Road', LN, 24, [[3905, 4620], [4050, 4640], [4200, 4650], [4450, 4400]]);
  road('bahadurpura_rd', 'Bahadurpura Road', A, 52, [J.PURANAPUL_S, [3260, 4250], J.BAHADURPURA, [3150, 4700], [2985, 4770], [2860, 4990], [2760, 5400], [2700, 6040]]);
  road('falaknuma_rd', 'Falaknuma Road', ST, 36, [[3700, 5260], [3655, 5330]], { spur: true });
  road('chandrayangutta_rd', 'Chandrayangutta Road', A, 52, [[3700, 5260], [4150, 5290], [4600, 5280], [5200, 5150], [5550, 5050], [6100, 4850], [6450, 4620], J.LB_NAGAR]);
  road('saidabad_rd', 'Saidabad Road', ST, 36, [[5550, 5050], [5420, 4800], [5350, 4500], [5300, 4200], J.MALAKPET]);
  road('puranapul', 'Purana Pul', BR, 30, [J.PURANAPUL_S, [3200, 3970], [3200, 3830], J.PURANAPUL_N]);
  road('musallam_jung_bridge', 'Musallam Jung Bridge', BR, 34, [[3612, 3998], [3612, 3738]]);
  road('afzalgunj_bridge_rd', 'Salar Jung Museum Road', ST, 36, [[4150, 3985], [4150, 3842]]);
  road('afzalgunj_bridge', 'Afzalgunj Bridge (Salar Jung Pul)', BR, 36, [[4150, 3842], [4148, 3660]]);
  road('chaderghat_bridge', 'Chaderghat Bridge', BR, 48, [J.CHADERGHAT_S, [4521, 3660], [4517, 3530], J.CHADERGHAT_N]);
  road('moosarambagh_bridge', 'Moosarambagh Bridge', BR, 40, [[5580, 3898], [5580, 3815], [5578, 3680], [5578, 3640]]);
  road('nagole_bridge', 'Nagole Bridge', BR, 40, [[7262, 3720], [7300, 3540]]);

  // --- North bank, Afzalgunj, Abids, Koti, Nampally
  road('afzalgunj_rd', 'Afzalgunj Road', ST, 44, [J.PURANAPUL_N, [3420, 3768], [3612, 3738], J.AFZALGUNJ, [4148, 3660], [4330, 3590], J.CHADERGHAT_N]);
  road('siddiamber_rd', 'Siddiamber Bazaar Road', A, 52, [J.AFZALGUNJ, [3935, 3480], [3950, 3300]]);
  road('abids_rd', 'Abids Road', A, 52, [[3950, 3300], [3960, 3110], J.ABIDS]);
  road('gunfoundry_rd', 'Gunfoundry Road', A, 52, [J.ABIDS, J.GUNFOUNDRY, J.BASHEERBAGH]);
  road('basheerbagh_rd', 'Basheerbagh Road', A, 52, [J.BASHEERBAGH, J.LIBERTY]);
  road('liberty_rd', 'Liberty Road', A, 52, [J.LIBERTY, [4090, 2200], J.TELUGU_TALLI]);
  road('nampally_rd', 'Nampally Station Road', ST, 40, [J.ABIDS, [3830, 2950], J.NAMPALLY, [3620, 2950], [3470, 2960]]);
  road('mj_market_rd', 'Mozamjahi Market Road', ST, 40, [J.NAMPALLY, [3712, 3090], J.MJ]);
  road('jambagh_rd', 'Jambagh Road', ST, 36, [J.MJ, [3880, 3262], [3950, 3300]]);
  road('begum_bazaar_rd', 'Begum Bazaar Road', ST, 36, [J.MJ, [3720, 3380], [3650, 3540], [3612, 3738]]);
  road('mangalhat_rd', 'Mangalhat Road', ST, 34, [[3470, 2960], [3420, 3100], [3360, 3250], [3260, 3500], J.PURANAPUL_N]);
  road('bank_st', 'Bank Street', ST, 40, [J.ABIDS, [4100, 3080], [4220, 3170], J.KOTI]);
  road('king_koti_rd', 'King Koti Road', ST, 40, [J.GUNFOUNDRY, [4140, 2800], J.KING_KOTI, [4380, 2790], J.NARAYANGUDA]);
  road('hanuman_tekdi_rd', 'Hanuman Tekdi Road', ST, 34, [J.KING_KOTI, [4290, 3050], J.KOTI]);
  road('gowliguda_rd', 'Gowliguda Road', ST, 36, [J.KOTI, [4332, 3330], [4332, 3405]], { spur: true });
  road('chaderghat_rd', 'Koti–Chaderghat Road', A, 52, [J.KOTI, [4440, 3370], J.CHADERGHAT_N]);
  road('sultan_bazaar_ln', 'Sultan Bazaar', LN, 22, [[4100, 3080], [4140, 3000], [4250, 2980], [4290, 3050]]);
  road('koti_kachiguda_rd', 'Koti–Kachiguda Road', ST, 40, [J.KOTI, [4600, 3110], J.KACHIGUDA_X]);
  road('putlibowli_rd', 'Putlibowli Road', LN, 24, [[3950, 3300], [4100, 3330], [4180, 3420], [4148, 3660]]);

  // --- Public Gardens, Basheerbagh, Naubat Pahad, Saifabad, Khairatabad
  road('assembly_rd', 'Public Gardens Road', ST, 40, [[3828, 2730], [3828, 2420]]);
  road('nampally_assembly_rd', 'Nampally–Assembly Road', ST, 36, [J.NAMPALLY, [3700, 2830], [3790, 2760], [3828, 2730], J.GUNFOUNDRY]);
  road('saifabad_rd', 'Saifabad Road', A, 52, [J.LAKDIKAPUL, [3560, 2392], [3828, 2420], J.BASHEERBAGH]);
  road('secretariat_rd', 'Secretariat Road', A, 56, [J.TELUGU_TALLI, [3880, 2112], [3760, 2098], [3640, 2072], [3540, 2042], J.IMAX, [3340, 1996], J.KHAIRATABAD]);
  road('khairatabad_rd', 'Khairatabad Road', A, 56, [J.KHAIRATABAD, [3230, 2160], [3300, 2260], J.LAKDIKAPUL]);
  road('naubat_pahad_rd', 'Naubat Pahad Road', LN, 22, [[3560, 2392], [3575, 2330], [3610, 2290]], { spur: true });
  road('birla_mandir_steps', 'Birla Mandir steps', PA, 14, [[3730, 2410], [3730, 2340], [3722, 2290], [3722, 2248]]);

  // --- Hussain Sagar ring: Tank Bund, Necklace Road, Lower Tank Bund
  road('tank_bund', 'Tank Bund Road', 'bund', 60, [J.TELUGU_TALLI, [4012, 2040], [4030, 1985], [4135, 1770], [4255, 1540], [4350, 1345], [4418, 1188], J.TANKBUND_N]);
  road('necklace_rd', 'Necklace Road', A, 48, [J.IMAX, [3395, 1945], [3352, 1835], [3338, 1700], [3333, 1560], [3336, 1400], [3362, 1245], [3420, 1125],
    [3500, 1040], [3620, 985], [3800, 960], [4040, 960], [4230, 975], [4360, 1010], [4430, 1068], J.TANKBUND_N], { trees: 'coconut' });
  road('lower_tank_bund', 'Lower Tank Bund Road', A, 48, [J.LIBERTY, [4205, 2150], [4228, 2050], [4260, 1980], [4350, 1790], [4450, 1560], [4530, 1360], J.KAVADIGUDA, J.RANIGUNJ]);
  road('kavadiguda_rd', 'Kavadiguda Road', ST, 40, [J.TANKBUND_N, [4500, 1170], J.KAVADIGUDA]);
  road('indira_park_rd', 'Indira Park Road', ST, 44, [[4228, 2050], [4560, 2110], [4760, 2190], J.RTC]);
  road('lumbini_rd', 'Lumbini Park Lane', LN, 22, [[3880, 2112], [3885, 2085]]);

  // --- Himayatnagar, Narayanguda, RTC X Roads, Kachiguda, Vidyanagar
  road('himayatnagar_rd', 'Himayatnagar Main Road', A, 52, [J.LIBERTY, [4280, 2370], J.HIMAYATNAGAR, [4490, 2600], J.NARAYANGUDA]);
  road('himayat_chikkadpally_rd', 'Himayatnagar–Chikkadpally Road', ST, 40, [J.HIMAYATNAGAR, [4680, 2452], J.CHIKKADPALLY]);
  road('chikkadpally_rd', 'Chikkadpally Road', A, 52, [J.RTC, J.CHIKKADPALLY, J.BARKATPURA, J.KACHIGUDA_X]);
  road('narayanguda_rd', 'Narayanguda Road', ST, 40, [J.NARAYANGUDA, [4700, 2745], J.BARKATPURA, [5150, 2775], J.NALLAKUNTA, [5620, 2800], [5830, 2950], J.AMBERPET]);
  road('vidyanagar_rd', 'Vidyanagar Road', A, 52, [J.RTC, [5140, 2330], J.VIDYANAGAR, [5600, 2380], [5850, 2300]]);
  road('nallakunta_rd', 'Nallakunta Road', ST, 34, [J.VIDYANAGAR, J.NALLAKUNTA, [5400, 3060]]);
  road('amberpet_rd', 'Amberpet Road', A, 52, [J.KACHIGUDA_X, [5150, 3040], [5400, 3060], [5600, 3080], J.AMBERPET, [6200, 3150], [6600, 3080], [7000, 2980], J.UPPAL, [8060, 2900]]);
  road('kachiguda_station_rd', 'Kachiguda Station Road', ST, 36, [J.KACHIGUDA_X, [4925, 3100], [4930, 3200], [4880, 3320], [4700, 3420], J.CHADERGHAT_N]);
  road('musheerabad_rd', 'Musheerabad Road', A, 52, [J.RTC, [4895, 1950], [4880, 1650], [4900, 1400], [4990, 1250], [5060, 1150]]);
  road('moosarambagh_rd', 'Moosarambagh Road', ST, 40, [[5578, 3640], [5600, 3400], [5620, 3200], [5600, 3080]]);

  // --- Secunderabad
  road('mg_rd', 'MG Road', A, 52, [J.TANKBUND_N, [4600, 1080], J.RANIGUNJ, [4620, 900], J.PARADISE]);
  road('sp_rd', 'Sardar Patel Road', A, 56, [J.PARADISE, [4100, 690], [3700, 655], J.BEGUMPET]);
  road('sd_rd', 'Sarojini Devi Road', A, 52, [J.PARADISE, [4760, 775], [5060, 780], [5420, 770], [5800, 700], [6500, 620], [7300, 560], [8060, 520]]);
  road('rp_rd', 'Rashtrapati Road', ST, 40, [J.RANIGUNJ, [4900, 1080], [5060, 1100], [5400, 1100], [5700, 1180], [6050, 1260], J.TARNAKA]);
  road('station_rd', 'Clock Tower Road', ST, 36, [[5060, 780], [5040, 900], [5060, 1100]]);
  road('musheerabad_link', 'Bholakpur Road', ST, 36, [[5060, 1150], [5060, 1100]]);
  road('marredpally_rd', 'Marredpally Road', ST, 36, [[5420, 770], [5450, 450], [5480, 120], [5500, -40]]);
  road('trimulgherry_rd', 'Trimulgherry Road', ST, 36, [J.PARADISE, [4560, 450], [4600, 150], [4620, -40]]);

  // --- Begumpet, Ameerpet, Erragadda, Panjagutta, Banjara
  road('begumpet_rd', 'Begumpet Road', A, 52, [J.BEGUMPET, [3180, 900], [3060, 1150], [2930, 1330], J.PANJAGUTTA]);
  road('begumpet_ameerpet_rd', 'Ameerpet Road', ST, 40, [J.BEGUMPET, [3200, 760], [3080, 840], [2900, 900], J.AMEERPET]);
  road('airport_rd', 'Airport Road', ST, 40, [J.BEGUMPET, [3400, 570], [3480, 532]], { spur: true });
  road('mumbai_hwy', 'Mumbai Highway (NH 9)', A, 56, [J.PANJAGUTTA, [2760, 1200], J.AMEERPET, J.SR_NAGAR, [2300, 560], J.ERRAGADDA, [1900, 120], [1790, -40]]);
  road('raj_bhavan_rd', 'Raj Bhavan Road', A, 56, [J.PANJAGUTTA, [2930, 1640], [3050, 1800], J.KHAIRATABAD]);
  road('banjara_rd1', 'Road No. 1, Banjara Hills', A, 52, [J.PANJAGUTTA, [2600, 1520], [2400, 1580], [2150, 1560], [1960, 1500], [1700, 1400], J.JUBILEE_CP]);
  road('banjara_rd2', 'Road No. 2, Banjara Hills', ST, 40, [[2400, 1580], [2420, 1800], [2520, 2000], [2700, 2250], J.MASAB_TANK]);
  road('banjara_rd12', 'Road No. 12, Banjara Hills', ST, 40, [[2520, 2000], [2200, 2080], [1900, 2200], J.SHAIKPET]);
  road('jubilee_rd36', 'Road No. 36, Jubilee Hills', A, 52, [J.JUBILEE_CP, [1150, 1170], J.MADHAPUR]);
  road('film_nagar_rd', 'Film Nagar Road', ST, 40, [J.JUBILEE_CP, [1350, 1600], [1230, 1900], J.SHAIKPET]);
  road('mehdipatnam_rd', 'Mehdipatnam Road', A, 56, [J.LAKDIKAPUL, [3150, 2420], J.MASAB_TANK, [2700, 2620], [2450, 2760], J.MEHDIPATNAM]);

  // --- West: Tolichowki, Golconda, Langar Houz, Gandipet, HITEC City
  road('old_mumbai_rd', 'Old Mumbai Road', A, 52, [J.MEHDIPATNAM, [1950, 2700], J.TOLICHOWKI, J.SHAIKPET, J.RAIDURG, [500, 1760], [-40, 1660]]);
  road('golconda_rd', 'Golconda Fort Road', ST, 40, [J.MEHDIPATNAM, [1950, 3080], J.LANGAR_HOUZ, [1420, 3300], [1335, 3300]], { spur: true });
  road('tombs_rd', 'Seven Tombs Road', ST, 36, [J.TOLICHOWKI, [1300, 2640], [1140, 2700], [1100, 2860], [1000, 3016]], { spur: true });
  road('gandipet_rd', 'Gandipet Road', ST, 40, [J.LANGAR_HOUZ, [1350, 3620], [900, 3690], [400, 3710], [-40, 3720]]);
  road('raidurg_rd', 'Raidurg Road', ST, 40, [J.RAIDURG, [900, 1500], [880, 1200], J.MADHAPUR]);
  road('hitec_rd', 'HITEC City Road', A, 56, [J.MADHAPUR, [680, 790], J.CYBER_JN, [330, 640], [-40, 600]]);
  road('hitec_n_rd', 'Kondapur Road', ST, 40, [J.CYBER_JN, [560, 450], [560, -40]]);

  // --- East: Malakpet, Dilsukhnagar, LB Nagar, OU, Tarnaka, Uppal
  road('malakpet_rd', 'Malakpet Road', A, 56, [J.CHADERGHAT_S, [4700, 3780], J.MALAKPET, [5400, 3882], [5580, 3898], [5800, 3905], J.DILSUKHNAGAR, J.KOTHAPET, J.LB_NAGAR, [7600, 4650], [8060, 4900]]);
  road('ou_rd', 'Osmania University Road', ST, 40, [[5850, 2300], [6100, 2150], [6262, 2085], [6420, 2075], [6440, 1900], [6430, 1600], [6428, 1450], J.TARNAKA], { trees: 'neem' });
  road('uppal_rd', 'Uppal Road', A, 52, [J.TARNAKA, [6800, 1800], [6950, 2250], J.UPPAL]);
  road('tarnaka_e_rd', 'Habsiguda Road', ST, 40, [J.TARNAKA, [7000, 1200], [7600, 1100], [8060, 1060]]);
  road('nagole_rd', 'Nagole Road', ST, 40, [J.LB_NAGAR, [7250, 3900], [7262, 3720]]);
  road('nagole_n_rd', 'Nagole–Uppal Road', ST, 40, [[7300, 3540], [7330, 3200], J.UPPAL]);
  road('lb_nagar_s_rd', 'Sagar Road', ST, 40, [J.LB_NAGAR, [7300, 4800], [7400, 5400], [7450, 6040]]);
  road('kothapet_rd', 'Kothapet Road', ST, 36, [J.KOTHAPET, [6720, 4300], [6600, 4560], [6450, 4620]]);

  /* -------------------------------------------------------------- rails */
  // Mainline railway (painted by world_extras.js, walkable ground). Stations are landmarks.
  rail('rail_hyd_sec', 'Hyderabad–Secunderabad line', [[3560, 2836], [3500, 2770], [3420, 2620], [3355, 2440], [3335, 2300], [3318, 2100], [3300, 1900],
    [3285, 1700], [3272, 1450], [3285, 1290], [3335, 1130], [3440, 975], [3560, 885], [3720, 840], [3900, 825], [4100, 835], [4300, 880], [4500, 935],
    [4800, 958], [5060, 960], [5360, 960]]);
  rail('rail_sec_yard', 'Secunderabad station loop', [[5040, 990], [5100, 984], [5360, 984], [5400, 975]]);
  rail('rail_wadi', 'Secunderabad–Wadi line', [[3720, 840], [3500, 790], [3330, 755], [3150, 720], [2950, 700], [2700, 680], [2200, 640], [1700, 560], [1100, 400], [500, 250], [-40, 180]]);
  rail('rail_bolarum', 'Bolarum line', [[5360, 960], [5440, 900], [5500, 600], [5540, 200], [5550, -40]]);
  rail('rail_kazipet', 'Kazipet line', [[5360, 960], [5600, 880], [6200, 760], [7000, 620], [8060, 450]]);
  rail('rail_kachiguda', 'Secunderabad–Kachiguda line', [[5360, 984], [5420, 1000], [5600, 1200], [5720, 1330], [5950, 1600], [6120, 1860], [6000, 2150], [5650, 2400],
    [5420, 2600], [5150, 2780], [5052, 2950], [5050, 3200], [4980, 3450], [4900, 3620], [4870, 3800], [4800, 3960], [4620, 4100], [4560, 4500], [4480, 4900],
    [4300, 5150], [4150, 5350], [4000, 5700], [3950, 6040]]);

  /* ------------------------------------------- content helpers (places) */
  // landmark + a place in front of its entrance (face side)
  function site(id, name, draw, x, y, w, d, h, face, kind, o) {
    o = o || {};
    lm(id, name, draw, x, y, w, d, h, Object.assign({ face }, o.lm || {}));
    const f = FACE[face];
    const off = (face === 'n' || face === 's' ? d : w) / 2 + (o.gap == null ? 10 : o.gap);
    return place(o.pid || id, o.pname || name, kind, x + f[0] * off, y + f[1] * off, o.r || 30, o.place || {});
  }
  // shop beside a road: S(id, kind, name, sign, road, t, 'L'|'R', opts)
  const FOOTK = { arterial: 10, street: 7, bund: 9, lane: 0, bridge: 0, path: 0 };
  function S(id, kind, name, sign, rid, t, s, o) { o = o || {}; return shop(id, kind, name, sign, side(rid, t, s, o.sgap == null ? (FOOTK[ROAD[rid].kind] || 0) + 3 : o.sgap), o); }
  const alias = (id, of, kind, name) => { const p = PL[of]; return place(id, name || p.name, kind || p.kind, p.x, p.y, p.r, { alias: of }); };
  const laneV = (id, name, x, y0, y1, w) => road(id, name, LN, w || 22, [[x, y0], [x, y1]]);
  const laneH = (id, name, y, x0, x1, w) => road(id, name, LN, w || 22, [[x0, y], [x1, y]]);
  const giver = (district, name, x, y) => place('giver_' + district, name, 'giver', x, y, 22);
  const hide = (id, name, x, y) => place('hide_' + id, name, 'hidden', x, y, 12);

  /* ============================================ OLD CITY & CHARMINAR */
  park('charminar_plaza', 'Charminar Plaza', 'plaza', [3738, 4198, 324, 324]);
  park('gulzar_houz_sq', 'Gulzar Houz Square', 'plaza', [3836, 4056, 128, 128]);
  park('mecca_masjid_courtyard', 'Mecca Masjid Courtyard', 'plaza', [3782, 4520, 94, 132]);
  lm('charminar', 'Charminar', 'charminar', 3900, 4360, 64, 64, 90, { face: 'n', era: '1591', note: 'four arches N/S/E/W, four 56 m minarets, clock faces (1889)' });
  place('charminar', 'Charminar', 'landmark', 3900, 4290, 70, { final: true });
  place('charminar_plaza', 'Charminar Plaza (finale)', 'plaza', 3990, 4420, 60);
  lm('gulzar_houz', 'Gulzar Houz fountain', 'gulzar_houz', 3900, 4120, 22, 22, 10, {});
  place('gulzar_houz', 'Gulzar Houz', 'landmark', 3900, 4072, 30);
  place('patang_bazaar', 'Patang Bazaar (kite stalls)', 'market', 3952, 4176, 20);
  // Char Kaman: four arches over the four approaches of Gulzar Houz (walk/drive under)
  const kaman = (id, name, x, y, ns) => lm(id, name, 'kaman', x, y, ns ? 72 : 12, ns ? 12 : 72, 52,
    { noSolid: true, axis: ns ? 'ew' : 'ns', solids: ns ? [[x - 36, y - 6, 12, 12], [x + 24, y - 6, 12, 12]] : [[x - 6, y - 36, 12, 12], [x - 6, y + 24, 12, 12]] });
  kaman('kaman_machli', 'Machli Kaman', 3900, 4048, true);
  kaman('kaman_charminar', 'Charminar Kaman', 3900, 4192, true);
  kaman('kaman_kali', 'Kali Kaman', 3826, 4120, false);
  kaman('kaman_sher_e_batil', 'Sher-e-Batil ki Kaman', 3974, 4120, false);
  site('mecca_masjid', 'Mecca Masjid', 'mecca_masjid', 3735, 4586, 90, 132, 50, 'e', 'mosque', { gap: 60, r: 30 });
  lm('chowmahalla_palace', 'Chowmahalla Palace (closed for restoration)', 'chowmahalla', 3608, 4550, 150, 170, 30, { face: 'n', gated: true });
  road('chowmahalla_ln', 'Khilwat Lane', LN, 20, [[3606, 4366], [3606, 4450]], { spur: true });
  place('chowmahalla_palace', 'Chowmahalla Palace gate', 'landmark', 3628, 4452, 22);
  place('laad_bazaar', 'Laad Bazaar (Chudi Bazaar)', 'market', 3700, 4348, 30);
  for (let k = 0; k < 4; k++) lm('bangle_shop_' + (k + 1), 'Bangle shop', 'bangle_shop', 3664 + k * 26, 4386, 22, 16, 20, { face: 'n', sign: ['LAAD BANGLES', 'CHUDI MAHAL', 'NOOR BANGLES', 'RANI CHUDI'][k] });
  lm('pathergatti_arcade_w', 'Pathergatti arcades', 'pathergatti_arcade', 3852, 4038, 44, 32, 26, { face: 'e' });
  site('madina_building', 'Madina Building', 'madina_building', 3992, 4052, 80, 44, 28, 'w', 'market', { pid: 'pathergatti', pname: 'Pathergatti & Madina Building', gap: 34 });
  site('nimrah_cafe', 'Nimrah Cafe', 'irani_cafe', 3998, 4206, 40, 26, 22, 'w', 'irani_cafe', { gap: 30, r: 22, lm: { sign: 'NIMRAH CAFE & BAKERY' } });
  alias('irani_cafe_1', 'nimrah_cafe', 'irani_cafe', 'Nimrah Cafe (facing Charminar)');
  S('shadab_hotel', 'restaurant', 'Hotel Shadab', 'HOTEL SHADAB', 'musi_south_rd', 0.66, 'R', { fw: 44, fd: 28 });
  S('pista_house', 'restaurant', 'Pista House', 'PISTA HOUSE', 'shah_ali_banda_rd', 0.5, 'L', { fw: 36, fd: 28 });
  S('shah_ghouse', 'restaurant', 'Shah Ghouse Cafe', 'SHAH GHOUSE CAFE', 'shah_ali_banda_rd', 0.47, 'R', { fw: 36, fd: 28 });
  site('lal_darwaza_temple', 'Lal Darwaza Mahankali Temple', 'mahankali_temple', 4060, 4700, 40, 40, 34, 'n', 'temple', { gap: 9, r: 26 });
  site('purani_haveli', "Purani Haveli (Nizam's Museum)", 'purani_haveli', 4342, 4140, 128, 66, 26, 'w', 'museum', { pid: 'nizams_museum', pname: "Nizam's Museum, Purani Haveli", gap: 18 });
  site('high_court', 'High Court', 'high_court', 3740, 3935, 168, 62, 36, 's', 'landmark', { gap: 8 });
  site('salar_jung_museum', 'Salar Jung Museum', 'salar_jung_museum', 4040, 3910, 150, 76, 30, 's', 'museum', { gap: 16, r: 30, place: { clock: 'musical clock strikes on the hour' } });
  place('naya_pul', 'Naya Pul', 'bridge', 3914, 3800, 28);
  place('purana_pul', 'Purana Pul & Jumerat Bazaar', 'bridge', 3200, 3790, 30, { thursday: 'Jumerat Bazaar flea market' });
  lm('puranapul_arches', 'Purana Pul arches', 'puranapul_arches', 3200, 3900, 44, 150, 6, { noSolid: true, inWater: true });
  place('chaderghat_bridge', 'Chaderghat Bridge', 'bridge', 4520, 3600, 28);
  place('afzalgunj_bridge', 'Afzalgunj Bridge', 'bridge', 4149, 3750, 24);
  place('musallam_jung_bridge', 'Musallam Jung Bridge', 'bridge', 3612, 3866, 22);
  park('mecca_masjid_pigeons', 'Mecca Masjid pigeon square', 'plaza', [3880, 4655, 60, 40]);

  /* ============================================ AFZALGUNJ, IMLIBUN, KOTI */
  site('osmania_hospital', 'Osmania General Hospital', 'osmania_hospital', 3762, 3640, 194, 76, 34, 's', 'landmark', { gap: 6 });
  site('state_central_library', 'State Central Library', 'state_central_library', 4040, 3612, 100, 62, 30, 's', 'landmark', { gap: 6 });
  park('imlibun_bays', 'Imlibun bus bays', 'plaza', [4196, 3470, 208, 88]);
  lm('imlibun_bus_station', 'Imlibun Bus Station (MGBS)', 'mgbs', 4300, 3492, 204, 120, 22, { face: 'n', solids: [[4198, 3432, 204, 34]], note: 'terminal block north, curved canopies over bays south' });
  place('imlibun_bus_station', 'Imlibun Bus Station (MGBS)', 'transport', 4300, 3515, 40);
  lm('cbs_hangar', 'Gowliguda City Bus Station (the old hangar)', 'cbs_hangar', 4250, 3346, 110, 70, 26, { face: 'e', noSolid: true, solids: [[4195, 3311, 110, 6], [4195, 3375, 110, 6]] });
  place('cbs_hangar', 'Gowliguda Hangar (City Bus Station)', 'transport', 4250, 3346, 26);
  park('koti_bus_bays', 'Koti bus bays', 'plaza', [4386, 3226, 92, 72]);
  lm('koti_bus_stand', 'Koti Bus Stand', 'bus_terminus', 4430, 3262, 92, 62, 18, { face: 'w', noSolid: true, solids: [[4392, 3233, 80, 8]] });
  place('koti_bus_stand', 'Koti Bus Stand', 'transport', 4430, 3268, 36);
  park('koti_womens_college_grounds', "Koti Women's College lawns", 'garden', [4500, 3262, 168, 128]);
  site('koti_womens_college', "Koti Women's College (British Residency)", 'british_residency', 4585, 3318, 110, 60, 34, 'n', 'landmark', { gap: 16 });
  S('gokul_chat', 'restaurant', 'Gokul Chat', 'GOKUL CHAT', 'bank_st', 0.7, 'L', { fw: 34, fd: 24, draw: 'gokul_chat', kind: 'food' });
  place('sultan_bazaar', 'Sultan Bazaar', 'market', 4200, 2992, 30);
  place('koti', 'Koti', 'junction', 4330, 3240, 40);
  place('king_koti', 'King Koti', 'junction', 4250, 2860, 30);
  S('hotel_niagara', 'restaurant', 'Hotel Niagara', 'HOTEL NIAGARA', 'chaderghat_rd', 0.82, 'L', { fw: 40, fd: 26 });
  place('begum_bazaar', 'Begum Bazaar', 'market', 3700, 3420, 30);

  /* ============================================ ABIDS, NAMPALLY, MJ MARKET */
  place('abids', 'Abids Circle', 'junction', 3962, 2950, 40, { sunday: 'Abids Sunday book market' });
  site('abids_gpo', 'General Post Office, Abids', 'gpo', 4062, 2905, 60, 50, 30, 'w', 'landmark', { gap: 8, pid: 'gpo' });
  place('abids_book_market', 'Abids Sunday book market', 'market', 3994, 3040, 26);
  S('grand_hotel', 'irani_cafe', 'Grand Hotel', 'GRAND HOTEL', 'abids_rd', 0.5, 'R', { fw: 44, fd: 30 });
  alias('irani_cafe_2', 'grand_hotel', 'irani_cafe', 'Grand Hotel, Abids');
  site('ramakrishna_theatre', 'Ramakrishna 70mm', 'cinema', 3880, 3030, 64, 52, 32, 'e', 'cinema', { gap: 24, lm: { films: ['RANGULA PATANG', 'TOOFAN EXPRESS'] } });
  site('church_st_josephs', "St. Joseph's Cathedral", 'church', 3940, 2812, 50, 70, 44, 'e', 'church', { gap: 10, r: 22 });
  site('mozamjahi_market', 'Mozamjahi Market', 'mozamjahi_market', 3850, 3160, 70, 70, 30, 'w', 'market', { gap: 12, r: 30 });
  site('karachi_bakery', 'Karachi Bakery', 'bakery', 3850, 3105, 36, 24, 22, 'w', 'bakery', { gap: 22, r: 18, lm: { sign: 'KARACHI BAKERY' } });
  place('famous_ice_cream', 'Famous Ice Cream', 'food', 3818, 3240, 16);
  park('nampally_platforms', 'Nampally station platforms', 'plaza', [3478, 2790, 172, 74]);
  site('nampally_station', 'Nampally Station (Hyderabad Deccan)', 'railway_station', 3580, 2895, 110, 50, 30, 's', 'transport', { gap: 18, lm: { variant: 'nampally' } });
  park('exhibition_grounds', 'Exhibition Grounds (Numaish)', 'ground', [3495, 2985, 186, 205]);
  lm('numaish_gate', 'Numaish gate', 'numaish_gate', 3684, 3088, 12, 60, 34, { noSolid: true, solids: [[3678, 3058, 12, 10], [3678, 3108, 12, 10]], face: 'e' });
  lm('giant_wheel', 'Numaish giant wheel', 'giant_wheel', 3540, 3035, 34, 14, 70, { face: 's' });
  lm('maut_ka_kuan', 'Maut ka Kuan (well of death)', 'maut_ka_kuan', 3625, 3150, 40, 40, 22, { face: 'n' });
  lm('numaish_stalls_1', 'Numaish stalls', 'numaish_stalls', 3580, 3080, 110, 18, 14, { face: 's' });
  lm('numaish_stalls_2', 'Numaish stalls', 'numaish_stalls', 3560, 3120, 90, 18, 14, { face: 'n' });
  place('nampally_exhibition', 'Nampally Exhibition (Numaish)', 'landmark', 3655, 3060, 60, { season: 'Jan 1 - mid Feb' });
  alias('exhibition_grounds', 'nampally_exhibition', 'park', 'Exhibition Grounds');
  S('subhan_bakery', 'bakery', 'Subhan Bakery', 'SUBHAN BAKERY', 'nampally_rd', 0.6, 'L', {});
  alias('bakery_1', 'subhan_bakery', 'bakery', 'Subhan Bakery, Nampally');

  /* ============================================ PUBLIC GARDENS, LB STADIUM, BASHEERBAGH */
  park('public_gardens', 'Public Gardens (Bagh-e-Aam)', 'garden', [3605, 2500, 190, 222]);
  road('public_gardens_path', 'Public Gardens walk', PA, 12, [[3612, 2602], [3700, 2606], [3800, 2610]]);
  road('public_gardens_path2', 'Public Gardens walk', PA, 12, [[3700, 2606], [3700, 2716]]);
  site('assembly', 'Legislative Assembly', 'assembly', 3755, 2552, 66, 70, 40, 'e', 'landmark', { gap: 16, r: 26 });
  lm('jubilee_hall', 'Jubilee Hall', 'jubilee_hall', 3648, 2545, 48, 34, 22, { face: 'e' });
  lm('gandhi_statue_assembly', 'Seated Gandhi statue', 'statue', 3770, 2600, 8, 8, 16, { variant: 'gandhi_seated', pad: 2 });
  place('gandhi_statue_assembly', 'Gandhi statue, Assembly lawn', 'landmark', 3770, 2616, 12);
  site('state_museum', 'State Archaeology Museum', 'museum', 3650, 2652, 58, 40, 24, 'n', 'museum', { gap: 8, r: 20, lm: { variant: 'state_museum' } });
  place('public_gardens', 'Public Gardens', 'park', 3700, 2610, 60);
  park('gun_park', 'Gun Park', 'garden', [3740, 2462, 54, 34]);
  lm('gun_park', 'Gun Park martyrs memorial', 'gun_park', 3767, 2479, 14, 14, 26, {});
  place('gun_park', 'Gun Park', 'park', 3748, 2490, 14);
  park('lb_stadium_field', 'LB Stadium field', 'grass', [3894, 2502, 134, 156]);
  lm('lb_stadium', 'Lal Bahadur Stadium', 'lb_stadium', 3961, 2580, 198, 220, 30, { face: 'w',
    solids: [[3862, 2470, 198, 30], [3862, 2500, 30, 58], [3862, 2602, 30, 58], [4030, 2500, 30, 160], [3862, 2660, 78, 30], [3982, 2660, 78, 30]],
    note: 'stands ring; gaps W (y 2558-2602) and S (x 3940-3982); floodlight towers at the corners' });
  place('lb_stadium', 'Lal Bahadur Stadium (west gate)', 'landmark', 3851, 2580, 30);
  place('fateh_maidan', 'Fateh Maidan (LB Stadium field)', 'park', 3961, 2580, 50);
  site('nizam_college', 'Nizam College', 'nizam_college', 4232, 2560, 90, 58, 30, 'w', 'landmark', { gap: 26, r: 22 });
  S('cafe_bahar', 'irani_cafe', 'Cafe Bahar', 'CAFE BAHAR', 'basheerbagh_rd', 0.45, 'L', { fw: 40, fd: 28 });
  alias('irani_cafe_3', 'cafe_bahar', 'irani_cafe', 'Cafe Bahar, Basheerbagh');
  site('liberty_theatre', 'Liberty Theatre', 'cinema', 4262, 2262, 66, 64, 30, 'w', 'cinema', { gap: 20, lm: { films: ['MEGHA GARJANA'] } });
  place('basheerbagh', 'Basheerbagh', 'junction', 4160, 2440, 30);
  place('liberty', 'Liberty junction', 'junction', 4170, 2290, 30);

  /* ============================================ NAUBAT PAHAD, SAIFABAD, KHAIRATABAD */
  park('naubat_pahad', 'Naubat Pahad', 'rock', [[3585, 2150], [3700, 2135], [3800, 2160], [3846, 2245], [3800, 2348], [3640, 2352], [3590, 2300], [3570, 2210]]);
  site('birla_mandir', 'Birla Mandir', 'birla_mandir', 3722, 2212, 64, 56, 52, 's', 'temple', { gap: 24, r: 30, lm: { hill: 'naubat_pahad', note: 'white marble, no bells; stairs from Saifabad Road' } });
  site('birla_planetarium', 'Birla Planetarium & Science Museum', 'birla_planetarium', 3505, 2296, 58, 58, 36, 's', 'museum', { gap: 12 });
  site('ravindra_bharathi', 'Ravindra Bharathi', 'auditorium', 3505, 2452, 80, 52, 30, 'n', 'landmark', { gap: 8, r: 22 });
  site('all_india_radio', 'All India Radio, Saifabad', 'radio_station', 3420, 2214, 48, 40, 24, 'w', 'landmark', { gap: 12, r: 18, lm: { mast: true } });
  site('secretariat', 'Secretariat', 'secretariat', 3930, 2190, 118, 58, 34, 'n', 'landmark', { gap: 6, r: 24 });
  park('khairatabad_ganesh_ground', 'Khairatabad Ganesh ground', 'ground', [3086, 2028, 98, 76]);
  lm('khairatabad_ganesh', 'Khairatabad Ganesh pandal', 'khairatabad_ganesh', 3132, 2056, 46, 36, 50, { face: 'e', seasonal: 'ganesh' });
  place('khairatabad_ganesh', 'Khairatabad Ganesh', 'temple', 3132, 2090, 30, { festival: 'ganesh_immersion' });
  place('khairatabad', 'Khairatabad', 'junction', 3220, 1992, 30);
  place('lakdikapul', 'Lakdikapul', 'junction', 3380, 2345, 30);
  site('niloufer_cafe', 'Niloufer Cafe', 'irani_cafe', 3420, 2400, 40, 28, 22, 'n', 'irani_cafe', { gap: 18, lm: { sign: 'NILOUFER CAFE' } });
  alias('irani_cafe_4', 'niloufer_cafe', 'irani_cafe', 'Niloufer Cafe, Lakdikapul');
  park('raj_bhavan_grounds', 'Raj Bhavan grounds', 'garden', [2862, 1690, 118, 140]);
  site('raj_bhavan', 'Raj Bhavan', 'raj_bhavan', 2915, 1752, 80, 54, 30, 'e', 'landmark', { gap: 24, r: 20 });

  /* ============================================ HUSSAIN SAGAR RING */
  lm('buddha_statue', 'Buddha Statue (Gibraltar Rock)', 'buddha_statue', BUDDHA[0], BUDDHA[1], 20, 20, 60, { face: 's', island: 34 });
  place('buddha_statue', 'Buddha Statue', 'landmark', BUDDHA[0], BUDDHA[1] + 22, 14, { boat: true });
  place('hussain_sagar', 'Hussain Sagar (Lumbini shore)', 'landmark', 3820, 1995, 200, { boat: true, lake: 'hussain_sagar' });
  park('lumbini_park', 'Lumbini Park', 'garden', [[3792, 1978], [3880, 2002], [3962, 1978], [3978, 2056], [3794, 2056]]);
  lm('musical_fountain', 'Lumbini musical fountain', 'musical_fountain', 3842, 2036, 26, 18, 6, {});
  lm('lumbini_jetty', 'Lumbini boat jetty', 'boat_jetty', 3880, 1980, 14, 26, 4, { noSolid: true, inWater: true });
  place('lumbini_park', 'Lumbini Park', 'park', 3905, 2030, 36);
  place('lumbini_jetty', 'Lumbini boat jetty', 'jetty', 3880, 2002, 14, { boat: true });
  park('ntr_gardens', 'NTR Gardens', 'garden', [[3550, 1868], [3655, 1928], [3780, 1972], [3776, 2044], [3640, 2026], [3554, 1996]]);
  lm('ntr_memorial', 'NTR Ghat', 'ntr_memorial', 3672, 1980, 40, 28, 18, { face: 's' });
  place('ntr_gardens', 'NTR Gardens', 'park', 3720, 2010, 40, { era: 'opened c. 2000' });
  site('prasads_imax', 'Prasads IMAX', 'prasads_imax', 3480, 1914, 78, 68, 44, 's', 'cinema', { gap: 18, r: 30, lm: { era: 'opened July 2003; show as opening/new' } });
  place('necklace_road', 'Necklace Road', 'landmark', 3345, 1650, 40);
  park('sanjeevaiah_park', 'Sanjeevaiah Park', 'grass', [[3582, 905], [3720, 860], [3900, 847], [4080, 857], [4080, 918], [3800, 918], [3640, 940], [3592, 955]]);
  place('sanjeevaiah_park', 'Sanjeevaiah Park', 'park', 3800, 895, 40);
  place('tank_bund', 'Tank Bund', 'landmark', 4200, 1655, 40);
  place('ganesh_immersion_point', 'Tank Bund immersion cranes', 'festival', 4110, 1800, 30, { festival: 'ganesh_immersion' });
  // the row of statues on tall plinths along the lake-side footpath of the bund
  {
    const tb = ROAD.tank_bund;
    for (let k = 0; k < 12; k++) {
      const p = at('tank_bund', 0.16 + k * 0.064);
      const nx = p.dy, ny = -p.dx; // left of travel (north-bound) = lake side
      lm('tank_bund_statue_' + (k + 1), 'Tank Bund statue', 'tank_bund_statue', Math.round(p.x + nx * (tb.w / 2 + 4)), Math.round(p.y + ny * (tb.w / 2 + 4)), 8, 8, 30, { idx: k, faceAngle: Math.atan2(-ny, -nx), over: true, pad: 0, inWater: true });
    }
  }
  place('tank_bund_statues', 'Tank Bund statues', 'landmark', 4188, 1690, 30);
  { const a = side('tank_bund', 0.07, 'R', 16), b = side('tank_bund', 0.9, 'R', 16);
    lm('kakatiya_arch_s', 'Kakatiya arch (south)', 'kakatiya_arch', a.x, a.y, 20, 10, 30, { pad: 2 });
    lm('kakatiya_arch_n', 'Kakatiya arch (north)', 'kakatiya_arch', b.x, b.y, 20, 10, 30, { pad: 2 }); }
  park('indira_park', 'Indira Park', 'garden', [[4300, 2042], [4332, 1960], [4402, 1790], [4472, 1622], [4618, 1640], [4660, 1900], [4600, 2072], [4400, 2064]]);
  road('indira_park_path', 'Indira Park walk', PA, 12, [[4420, 2055], [4470, 1900], [4560, 1780], [4600, 1660]]);
  place('indira_park', 'Indira Park', 'park', 4440, 2040, 40);
  place('lower_tank_bund', 'Lower Tank Bund', 'landmark', 4392, 1700, 30);

  /* ============================================ SECUNDERABAD & BEGUMPET */
  park('parade_grounds', 'Parade Grounds', 'ground', [4620, 430, 300, 300]);
  place('parade_grounds', 'Parade Grounds', 'park', 4770, 600, 60);
  park('clock_tower_park', 'Clock Tower park', 'garden', [4900, 816, 110, 92]);
  lm('secunderabad_clock_tower', 'Secunderabad Clock Tower', 'clock_tower', 4955, 862, 18, 18, 72, {});
  place('secunderabad_clock_tower', 'Secunderabad Clock Tower', 'landmark', 4955, 892, 26);
  site('garden_cafe', 'Garden Cafe', 'irani_cafe', 4960, 721, 44, 30, 22, 's', 'irani_cafe', { gap: 6, lm: { sign: 'GARDEN CAFE' } });
  alias('irani_cafe_5', 'garden_cafe', 'irani_cafe', 'Garden Cafe, Clock Tower');
  park('secunderabad_platforms', 'Secunderabad platforms', 'plaza', [5070, 940, 300, 58]);
  site('secunderabad_station', 'Secunderabad Station', 'railway_station', 5200, 1030, 180, 48, 32, 's', 'transport', { gap: 12, lm: { variant: 'secunderabad' } });
  S('alpha_hotel', 'irani_cafe', 'Alpha Hotel', 'ALPHA HOTEL', 'rp_rd', 0.36, 'R', { fw: 44, fd: 30 });
  alias('irani_cafe_6', 'alpha_hotel', 'irani_cafe', 'Alpha Hotel, Secunderabad');
  S('sangeet_theatre', 'restaurant', 'Sangeet 70mm', 'SANGEET 70MM', 'rp_rd', 0.49, 'R', { fw: 66, fd: 50, draw: 'cinema', kind: 'cinema', lm: { films: ['GOLCONDA DIAMOND'] } });
  site('monda_market', 'Monda Market', 'market_hall', 5308, 862, 136, 80, 22, 'n', 'market', { gap: 14 });
  site('church_wesley', 'Wesley Church', 'church', 5118, 862, 48, 60, 40, 'w', 'church', { gap: 18, r: 20 });
  site('church_st_marys', "St. Mary's Church", 'church', 4590, 1005, 56, 56, 46, 's', 'church', { gap: 14, r: 22 });
  road('general_bazaar_ln', 'General Bazaar', LN, 22, [[4900, 1085], [4930, 1180], [4990, 1250]]);
  place('general_bazaar', 'General Bazaar', 'market', 4922, 1150, 26);
  site('ujjaini_mahankali_temple', 'Ujjaini Mahankali Temple', 'mahankali_temple', 4862, 1172, 40, 40, 34, 'e', 'temple', { gap: 32, r: 26, place: { festival: 'bonalu' } });
  site('paradise', 'Paradise', 'restaurant', 4440, 786, 60, 40, 26, 'n', 'food', { gap: 14, r: 26, lm: { sign: 'PARADISE' } });
  place('ranigunj', 'Ranigunj', 'junction', 4720, 1060, 26);
  lm('james_street_station', 'James Street station', 'halt_station', 4800, 920, 60, 28, 16, { face: 'n' });
  // Begumpet airport
  park('begumpet_runway', 'Begumpet runway', 'plaza', [2900, 330, 1350, 56]);
  park('begumpet_apron', 'Begumpet apron', 'plaza', [3290, 400, 330, 52]);
  noFill([2860, 260, 1440, 210], 'airport');
  site('begumpet_airport', 'Begumpet Airport', 'airport_terminal', 3480, 484, 120, 36, 22, 's', 'transport', { gap: 18, r: 30 });
  lm('atc_tower', 'Begumpet control tower', 'control_tower', 3640, 478, 18, 18, 52, {});
  lm('aeroplane_1', 'Parked plane', 'aeroplane', 3330, 426, 46, 40, 14, { face: 'e', pad: 2 });
  site('spanish_mosque', 'Spanish Mosque', 'spanish_mosque', 3740, 590, 40, 40, 44, 's', 'mosque', { gap: 14, r: 20 });
  lm('begumpet_station', 'Begumpet station', 'halt_station', 3420, 800, 60, 24, 16, { face: 's' });
  lm('sanjeevaiah_park_station', 'Sanjeevaiah Park station', 'halt_station', 3900, 800, 60, 26, 16, { face: 'n' });
  lm('necklace_road_station', 'Necklace Road station', 'halt_station', 3236, 1450, 26, 60, 16, { face: 'w' });
  lm('khairatabad_station', 'Khairatabad station', 'halt_station', 3266, 1880, 26, 50, 16, { face: 'w' });

  /* ============================================ RTC X ROADS & CINEMAS */
  place('rtc_x_roads', 'RTC X Roads', 'junction', 4915, 2230, 60);
  site('sandhya_theatre', 'Sandhya 70mm & 35mm', 'cinema', 5004, 2172, 96, 68, 34, 'w', 'cinema', { gap: 12, lm: { variant: 'sandhya', films: ['CHARMINAR CHINNODU', 'RANGULA PATANG'] } });
  site('bawarchi', 'Bawarchi', 'restaurant', 4990, 2100, 52, 36, 24, 'w', 'food', { gap: 26, lm: { sign: 'BAWARCHI' } });
  site('odeon_theatre', 'Odeon', 'cinema', 4824, 2140, 88, 64, 32, 's', 'cinema', { gap: 12, lm: { variant: 'odeon', films: ['PREMA PANDAGA'] } });
  site('sudarshan_theatre', 'Sudarshan 35mm', 'cinema', 4818, 2282, 84, 66, 30, 'e', 'cinema', { gap: 16, lm: { variant: 'sudarshan', films: ['GULLY SIMHAM'] } });
  site('devi_theatre', 'Devi 70mm', 'cinema', 4992, 2346, 100, 66, 34, 'n', 'cinema', { gap: 8, lm: { variant: 'devi', films: ['TOOFAN EXPRESS', 'JAI HYDERABAD'] } });
  lm('hoarding_rtc_1', 'Film hoarding', 'film_hoarding', 4870, 2186, 30, 6, 40, { noSolid: true, solids: [[4858, 2184, 4, 4], [4878, 2184, 4, 4]], film: 'CHARMINAR CHINNODU', pad: 2 });
  lm('hoarding_rtc_2', 'Film hoarding', 'film_hoarding', 4962, 2274, 30, 6, 40, { noSolid: true, solids: [[4950, 2272, 4, 4], [4970, 2272, 4, 4]], film: 'GULLY SIMHAM', pad: 2 });
  place('shanti_theatre', 'Shanti Theatre', 'cinema', 4560, 2770, 24);
  lm('shanti_theatre', 'Shanti Theatre', 'cinema', 4560, 2806, 76, 54, 30, { face: 'n', films: ['PREMA PANDAGA'] });

  /* ============================================ KACHIGUDA, OU, TARNAKA */
  park('kachiguda_platforms', 'Kachiguda platforms', 'plaza', [5062, 3060, 30, 130]);
  place('chappal_bazar', 'Chappal Bazar (by Kachiguda station)', 'market', 4900, 3240, 24);
  site('kachiguda_station', 'Kachiguda Station', 'railway_station', 4997, 3136, 76, 96, 34, 'w', 'transport', { gap: 18, lm: { variant: 'kachiguda', note: 'Gothic, 1916, twin towers' } });
  park('osmania_campus', 'Osmania University campus', 'grass', [[5880, 1480], [6380, 1460], [6560, 1700], [6600, 2100], [6420, 2360], [5960, 2340], [5880, 2200], [6000, 2000], [5900, 1800]]);
  site('osmania_university', 'Osmania University Arts College', 'ou_arts_college', 6262, 1990, 200, 70, 40, 's', 'landmark', { gap: 26, r: 40 });
  place('tarnaka', 'Tarnaka', 'junction', 6430, 1330, 30);
  site('doordarshan_kendra', 'Doordarshan Kendra, Ramanthapur', 'tv_tower', 6560, 3010, 40, 40, 120, 's', 'landmark', { gap: 50, r: 24 });
  place('ramoji_film_city', 'To Ramoji Film City (bus trip)', 'edge', 7980, 4890, 30, { offMap: true, via: ['imlibun_bus_station', 'koti_bus_stand'] });
  place('uppal', 'Uppal', 'junction', 7350, 2920, 30);

  /* ============================================ MALAKPET, DILSUKHNAGAR, LB NAGAR */
  place('malakpet', 'Malakpet', 'junction', 5060, 3842, 30);
  site('dilsukhnagar_sai_temple', 'Sai Baba Temple, Dilsukhnagar', 'sai_temple', 6300, 3998, 70, 48, 34, 'n', 'temple', { gap: 18, r: 30, lm: { note: 'Thursday crowds, flower sellers outside' } });
  place('dilsukhnagar', 'Dilsukhnagar', 'junction', 6250, 3920, 30);
  place('lb_nagar', 'LB Nagar', 'junction', 7150, 4300, 30);
  place('vijayawada_highway', 'NH 9 to Vijayawada', 'edge', 7950, 4840, 30);

  /* ============================================ WEST: GOLCONDA, TOMBS, ZOO, HITEC */
  // Golconda: hill (rock park), curtain walls with bastions, Fateh Darwaza (east), Bala Hissar on top.
  park('golconda_hill', 'Golconda hill', 'rock', [[880, 3110], [1080, 3070], [1260, 3120], [1290, 3300], [1240, 3480], [1060, 3520], [880, 3460], [850, 3280]]);
  park('golconda_inner', 'Golconda inner court', 'ground', [[1180, 3240], [1270, 3240], [1270, 3360], [1180, 3360]]);
  {
    const fw = (id, x, y, w, d) => lm(id, 'Golconda fort wall', 'fort_wall', x + w / 2, y + d / 2, w, d, 28, { pad: 3 });
    fw('golconda_wall_n', 840, 3040, 470, 16); fw('golconda_wall_s', 840, 3540, 470, 16);
    fw('golconda_wall_w', 824, 3040, 16, 516);
    fw('golconda_wall_e1', 1302, 3056, 16, 214); fw('golconda_wall_e2', 1302, 3330, 16, 210);
  }
  lm('golconda_fateh_darwaza', 'Fateh Darwaza', 'fort_gate', 1310, 3300, 22, 60, 44, { noSolid: true, solids: [[1299, 3270, 22, 6], [1299, 3324, 22, 6]], face: 'e', clap: true });
  place('golconda_fort', 'Golconda Fort', 'landmark', 1352, 3270, 30);
  place('golconda_fateh_darwaza', 'Fateh Darwaza (clap here)', 'landmark', 1284, 3300, 16, { minigame: 'golconda_clap' });
  road('golconda_steps', 'Steps to Bala Hissar', PA, 12, [[1284, 3300], [1200, 3300], [1140, 3330], [1080, 3330], [1060, 3290]]);
  site('golconda_bala_hissar', 'Bala Hissar pavilion', 'golconda_bala_hissar', 1040, 3240, 84, 64, 46, 's', 'landmark', { gap: 14, r: 22, lm: { summit: true } });
  lm('banjara_darwaza', 'Banjara Darwaza', 'fort_gate', 990, 3048, 60, 22, 40, { noSolid: true, solids: [[960, 3037, 6, 22], [1014, 3037, 6, 22]], face: 'n' });
  place('golconda_sound_light', 'Sound & light show seats', 'landmark', 1225, 3395, 20);
  park('qutb_shahi_gardens', 'Qutb Shahi Tombs gardens', 'garden', [760, 2660, 330, 300]);
  {
    const tomb = (k, x, y, s, h) => lm('qutb_tomb_' + k, 'Qutb Shahi tomb', 'qutb_tomb', x, y, s, s, h, { idx: k });
    tomb(1, 830, 2720, 56, 50); tomb(2, 930, 2712, 62, 58); tomb(3, 1030, 2740, 50, 44);
    tomb(4, 820, 2840, 46, 40); tomb(5, 920, 2850, 70, 64); tomb(6, 1030, 2880, 44, 38);
  }
  place('qutb_shahi_tombs', 'Qutb Shahi Tombs', 'landmark', 1100, 2780, 30);
  site('taramati_baradari', 'Taramati Baradari', 'taramati_baradari', 660, 3620, 60, 44, 26, 's', 'landmark', { gap: 14, r: 20 });
  place('gandipet', 'Gandipet (Osman Sagar) road', 'edge', 30, 3720, 30, { offMap: true });
  park('nehru_zoo', 'Nehru Zoological Park', 'garden', [[2480, 4640], [2930, 4640], [2950, 4700], [2860, 4960], [2700, 5000], [2480, 4990]]);
  lm('zoo_gate', 'Nehru Zoo gate', 'zoo_gate', 2934, 4740, 16, 50, 24, { face: 'e', noSolid: true, solids: [[2926, 4716, 16, 8], [2926, 4758, 16, 8]] });
  place('nehru_zoo', 'Nehru Zoological Park', 'park', 2900, 4740, 36);
  park('falaknuma_hill', 'Falaknuma hill', 'rock', [[3380, 5300], [3560, 5280], [3700, 5330], [3720, 5480], [3620, 5600], [3420, 5590], [3340, 5460]]);
  lm('falaknuma_palace', 'Falaknuma Palace (closed)', 'falaknuma', 3530, 5450, 170, 110, 36, { face: 'e', gated: true });
  place('falaknuma_palace', 'Falaknuma Palace gate', 'landmark', 3646, 5362, 24);
  park('cyber_towers_plaza', 'Cyber Towers forecourt', 'plaza', [366, 436, 150, 162]);
  lm('cyber_towers', 'Cyber Towers', 'cyber_towers', 430, 500, 96, 96, 90, { face: 's', era: 'opened Nov 1998' });
  place('cyber_towers', 'Cyber Towers', 'landmark', 450, 580, 30);
  place('hitec_city', 'HITEC City', 'landmark', 640, 700, 50);
  park('shilparamam', 'Shilparamam crafts village', 'garden', [600, 470, 160, 126]);
  lm('shilparamam_gate', 'Shilparamam gate', 'shilparamam_gate', 680, 596, 40, 12, 22, { noSolid: true, solids: [[660, 590, 6, 12], [694, 590, 6, 12]], face: 's' });
  place('shilparamam', 'Shilparamam', 'park', 680, 580, 30);
  place('durgam_cheruvu', 'Durgam Cheruvu (secret lake)', 'park', 812, 1190, 20);
  site('gachibowli_stadium', 'Gachibowli Stadium', 'stadium', 390, 1890, 200, 150, 30, 'n', 'landmark', { gap: 12, r: 30 });
  park('kbr_park', 'KBR Park', 'rock', [[1560, 1580], [1900, 1560], [1940, 1700], [1880, 1880], [1600, 1880], [1540, 1720]]);
  place('kbr_park', 'KBR Park', 'park', 1760, 1590, 30);
  lm('chiran_palace', 'Chiran Palace', 'palace', 1740, 1740, 60, 40, 22, { face: 'n' });
  place('film_nagar', 'Film Nagar', 'landmark', 1230, 1900, 30);
  site('annapurna_studios', 'Annapurna Studios', 'film_studio', 2300, 1450, 120, 70, 30, 's', 'landmark', { gap: 26, r: 26 });
  site('peddamma_temple', 'Peddamma Temple', 'temple', 1210, 1266, 40, 36, 32, 'n', 'temple', { gap: 12, r: 22 });
  place('jubilee_hills', 'Jubilee Hills Check Post', 'junction', 1430, 1300, 30);
  place('banjara_hills', 'Banjara Hills Road No. 1', 'junction', 2400, 1580, 30);
  place('panjagutta', 'Panjagutta', 'junction', 2800, 1445, 30);
  place('masab_tank', 'Masab Tank', 'junction', 2930, 2500, 30);
  place('mehdipatnam', 'Mehdipatnam', 'junction', 2250, 2880, 30);
  place('tolichowki', 'Tolichowki', 'junction', 1520, 2560, 30);
  place('ameerpet', 'Ameerpet', 'junction', 2720, 970, 30);
  place('ameerpet_coaching', 'Ameerpet computer coaching lane', 'school', 2640, 1060, 26);
  place('erragadda', 'Erragadda', 'junction', 2120, 330, 30);
  place('begumpet', 'Begumpet', 'junction', 3300, 680, 30);
  site('moula_ali_dargah', 'Moula Ali Dargah', 'dargah', 7420, 760, 44, 44, 40, 's', 'landmark', { gap: 20, r: 20, lm: { hill: true } });
  park('moula_ali_hill', 'Moula Ali hill', 'rock', [[7300, 640], [7540, 640], [7580, 800], [7480, 860], [7320, 840]]);

  /* ============================================ EXTRA STREETS (west-central) */
  road('asif_nagar_rd', 'Asif Nagar Road', ST, 36, [J.MASAB_TANK, [2960, 2780], [3010, 3060], [3080, 3350], [3150, 3600], J.PURANAPUL_N]);
  road('mallepally_rd', 'Mallepally Road', ST, 36, [[3470, 2960], [3250, 2900], [2960, 2780]]);
  road('karwan_rd', 'Karwan Road', ST, 36, [[3010, 3060], [2700, 3100], [2300, 3090], [1950, 3080]]);
  road('sanathnagar_rd', 'Sanathnagar Road', ST, 36, [J.ERRAGADDA, [1800, 300], [1500, 260], [1200, 240], [900, 300], [560, 300]]);

  /* ============================================ COLONIES: lanes + everyday life */
  // ---- Lakshmi Nagar Colony, Himayatnagar (the player's home)
  laneV('ln_lakshmi_v1', 'Lakshmi Nagar Street 1', 4640, 2453, 2741);
  laneV('ln_lakshmi_v2', 'Lakshmi Nagar Street 2', 4760, 2449, 2749);
  laneH('ln_lakshmi_h1', 'Lakshmi Nagar Main Street', 2600, 4490, 4885);
  lm('home', 'Home (Lakshmi Nivas)', 'home_house', 4580, 2645, 40, 34, 22, { face: 'n', terrace: true, sign: 'LAKSHMI NIVAS' });
  place('home', 'Home (Lakshmi Nivas, Lakshmi Nagar Colony)', 'home', 4580, 2619, 20);
  // home_terrace is ON the roof (level 'home_terrace', see ROOF ZONES below); the stairs are home_stairs
  place('home_terrace', 'Home terrace (kites, sleeping under the stars)', 'terrace', 4574, 2644, 12, { level: 'home_terrace', roof: 'home' });
  park('playground_home', 'Lakshmi Nagar colony ground', 'ground', [4656, 2616, 88, 90]);
  lm('playground_kit_home', 'Swings & slide', 'playground_kit', 4730, 2630, 18, 10, 14, { pad: 2 });
  place('playground_home', 'Lakshmi Nagar colony ground', 'playground', 4696, 2666, 34);
  alias('playground_1', 'playground_home', 'playground', 'Lakshmi Nagar colony ground (home)');
  lm('friend_home', "Friend's house", 'home_house', 4808, 2652, 34, 30, 22, { face: 'w', variant: 'friend' });
  place('friend_home', "Best friend's house", 'home', 4779, 2652, 16);
  lm('water_tank_1', 'Colony water tank', 'water_tank', 4808, 2530, 22, 22, 60, {});
  for (const [k, x, y] of [[2, 5175, 2470], [3, 4820, 1380], [4, 5030, 4100], [5, 6400, 4100], [6, 6100, 380], [7, 2330, 900]]) lm('water_tank_' + k, 'Colony water tank', 'water_tank', x, y, 22, 22, 60, {});
  site('temple_1', 'Sri Venkateswara Temple', 'temple', 4546, 2520, 30, 30, 30, 'w', 'temple', { gap: 8, r: 18 });
  shop('flower_cart_1', 'flower_cart', 'Jasmine & marigold cart', null, { x: 4519, y: 2562, face: 'w' });
  S('kirana_1', 'kirana', 'Sri Lakshmi Kirana & General Stores', 'SRI LAKSHMI KIRANA', 'ln_lakshmi_h1', 0.53, 'L');
  S('pindi_girni_1', 'pindi_girni', 'Hanuman Pindi Girni', 'HANUMAN PINDI GIRNI', 'ln_lakshmi_h1', 0.86, 'L');
  S('std_1', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'himayat_chikkadpally_rd', 0.3, 'R');
  S('chai_bandi_1', 'chai_bandi', "Raju's chai bandi", null, 'ln_lakshmi_v1', 0.93, 'L');
  S('medical_shop_8', 'medical_shop', 'Sai Medical & General Stores', 'SAI MEDICAL', 'ln_lakshmi_h1', 0.86, 'R');
  S('barber_7', 'barber', 'New Style Hair Dressers', 'NEW STYLE HAIR', 'ln_lakshmi_v2', 0.3, 'L');
  S('cycle_rent_5', 'cycle_rent', 'Chinna Cycle Taxi', 'CYCLE TAXI', 'ln_lakshmi_v1', 0.25, 'R');
  hide('home_lane', 'Behind the colony water tank', 4785, 2556);

  // ---- Hyderguda (west of Himayatnagar Main Road)
  laneH('ln_hyderguda_h1', 'Hyderguda Main Street', 2650, 4101, 4494);
  laneV('ln_hyderguda_v1', 'Hyderguda Street 2', 4330, 2396, 2817);
  park('school_1_ground', 'Saraswati Vidya Mandir ground', 'ground', [4160, 2712, 150, 60]);
  site('school_1', 'Saraswati Vidya Mandir High School', 'school', 4210, 2690, 80, 30, 28, 'n', 'school', { gap: 11, r: 26, lm: { sign: 'SARASWATI VIDYA MANDIR' } });
  S('stationery_1', 'stationery', 'Vidya Stationery & Book Depot', 'VIDYA STATIONERY', 'ln_hyderguda_h1', 0.27, 'L');
  S('kirana_2', 'kirana', 'Balaji General Stores', 'BALAJI STORES', 'ln_hyderguda_v1', 0.3, 'R');
  S('barber_1', 'barber', 'Lucky Hair Cutting Saloon', 'LUCKY SALOON', 'ln_hyderguda_h1', 0.81, 'L');
  S('medical_shop_1', 'medical_shop', 'Life Line Medicals', 'LIFE LINE MEDICALS', 'ln_hyderguda_h1', 0.7, 'R');
  S('std_2', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'himayatnagar_rd', 0.71, 'R');
  S('internet_cafe_1', 'internet_cafe', 'Cyber Zone Browsing Centre', 'CYBER ZONE', 'ln_hyderguda_v1', 0.16, 'L', { fw: 32, fd: 22, draw: 'internet_cafe' });
  S('photo_studio_1', 'photo_studio', 'Raj Colour Lab & Studio', 'RAJ COLOUR LAB', 'himayatnagar_rd', 0.3, 'R');
  // Base café (bible §3.1): the sign reads Café Gulistan (invented; renamed from the map's "Hotel Sarvar")
  S('irani_cafe_7', 'irani_cafe', 'Café Gulistan', 'CAFE GULISTAN', 'himayatnagar_rd', 0.93, 'R', { place: { std: true } });
  S('bus_stop_10', 'bus_stop', 'Himayatnagar bus stop', 'HIMAYATNAGAR', 'himayatnagar_rd', 0.52, 'L');

  // ---- Domalguda & Ashok Nagar (between Indira Park Road and Himayatnagar)
  laneV('ln_domalguda_v1', 'Domalguda Street 1', 4500, 2099, 2458);
  laneV('ln_domalguda_v2', 'Domalguda Street 2', 4680, 2158, 2452);
  laneH('ln_domalguda_h1', 'Ashok Nagar Main Street', 2345, 4245, 4896);
  park('playground_14', 'Ashok Nagar ground', 'ground', [4520, 2182, 140, 146]);
  lm('playground_kit_14', 'Swings & slide', 'playground_kit', 4640, 2200, 18, 10, 14, { pad: 2 });
  place('playground_14', 'Ashok Nagar ground', 'playground', 4590, 2255, 34);
  site('temple_2', 'Hanuman Temple', 'temple', 4590, 2400, 30, 28, 28, 'n', 'temple', { gap: 30, r: 18 });
  S('flower_cart_2', 'flower_cart', 'Flower cart', null, 'ln_domalguda_h1', 0.48, 'R');
  S('kirana_3', 'kirana', 'Ganesh Provisions', 'GANESH PROVISIONS', 'ln_domalguda_v2', 0.5, 'L');
  S('dosa_bandi_1', 'dosa_bandi', 'Dosa bandi', null, 'ln_domalguda_h1', 0.62, 'L');
  S('cycle_rent_1', 'cycle_rent', 'Lakshmi Cycle Stores (on hire)', 'CYCLES ON HIRE', 'ln_domalguda_v1', 0.45, 'R');
  S('irani_cafe_8', 'irani_cafe', 'Cafe Shalimar', 'CAFE SHALIMAR', 'chikkadpally_rd', 0.202, 'R', { fw: 40 });
  S('bus_stop_19', 'bus_stop', 'Chikkadpally bus stop', 'CHIKKADPALLY', 'chikkadpally_rd', 0.34, 'L');
  S('std_7', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'indira_park_rd', 0.6, 'R');
  S('church_2', 'restaurant', 'CSI Church, Chikkadpally', null, 'ln_domalguda_h1', 0.73, 'R', { fw: 34, fd: 40, h: 36, draw: 'church', kind: 'church' });

  // ---- Vidyanagar (east of RTC X Roads)
  laneV('ln_vidyanagar_v1', 'Vidyanagar Street 1', 5100, 2312, 2772);
  laneV('ln_vidyanagar_v2', 'Vidyanagar Street 2', 5250, 2380, 2781);
  laneH('ln_vidyanagar_h1', 'Vidyanagar Main Street', 2560, 4885, 5380);
  park('school_2_ground', 'Vivekananda school ground', 'ground', [4926, 2390, 158, 54]);
  site('school_2', 'Vivekananda High School', 'school', 5000, 2470, 80, 30, 28, 's', 'school', { gap: 62, r: 26, lm: { sign: 'VIVEKANANDA HIGH SCHOOL' } });
  S('stationery_2', 'stationery', 'Navyuga Stationers', 'NAVYUGA STATIONERS', 'ln_vidyanagar_h1', 0.27, 'R');
  park('playground_2', 'Vidyanagar colony ground', 'ground', [5116, 2590, 120, 96]);
  place('playground_2', 'Vidyanagar colony ground', 'playground', 5176, 2638, 34);
  S('kirana_4', 'kirana', 'Durga Kirana', 'DURGA KIRANA', 'ln_vidyanagar_v1', 0.66, 'R');
  S('pindi_girni_2', 'pindi_girni', 'Lakshmi Flour Mill', 'LAKSHMI FLOUR MILL', 'ln_vidyanagar_v2', 0.3, 'L');
  S('meat_shop_1', 'meat_shop', 'Fresh Chicken & Mutton', 'FRESH CHICKEN & MUTTON', 'ln_vidyanagar_h1', 0.8, 'L');
  S('bus_stop_9', 'bus_stop', 'RTC X Roads bus stop', 'RTC X ROADS', 'vidyanagar_rd', 0.2, 'L');

  // ---- Barkatpura & Kachiguda
  laneH('ln_barkatpura_h1', 'Barkatpura Main Street', 2890, 4895, 5387);
  laneV('ln_barkatpura_v1', 'Barkatpura Street 2', 5250, 2782, 3048);
  park('school_3_ground', 'Kachiguda school ground', 'ground', [5135, 2970, 100, 32]);
  site('school_3', 'Government High School, Kachiguda', 'school', 5180, 2950, 80, 30, 28, 'n', 'school', { gap: 30, r: 24, lm: { sign: 'GOVT HIGH SCHOOL' } });
  S('stationery_3', 'stationery', 'Student Book House', 'STUDENT BOOK HOUSE', 'ln_barkatpura_h1', 0.62, 'L');
  S('kirana_5', 'kirana', 'Annapurna Kirana', 'ANNAPURNA KIRANA', 'ln_barkatpura_v1', 0.62, 'L');
  S('iyengar_bakery_1', 'iyengar_bakery', 'Sri Krishna Iyengar Bakery', 'IYENGAR BAKERY', 'narayanguda_rd', 0.32, 'R');
  S('irani_cafe_9', 'irani_cafe', 'Cafe Kohinoor', 'CAFE KOHINOOR', 'chikkadpally_rd', 0.93, 'L');
  S('video_parlour_1', 'video_parlour', 'Super Video Games', 'SUPER VIDEO GAMES', 'ln_barkatpura_h1', 0.26, 'R');
  S('barber_2', 'barber', 'Sundar Hair Saloon', 'SUNDAR SALOON', 'ln_barkatpura_v1', 0.75, 'R');
  S('banana_cart_1', 'banana_cart', 'Banana cart', null, 'kachiguda_station_rd', 0.12, 'L');

  // ---- Nallakunta & Amberpet
  laneV('ln_nallakunta_v1', 'Nallakunta Street', 5620, 2802, 3081);
  laneH('ln_nallakunta_h1', 'Nallakunta Main Street', 2940, 5391, 5815);
  park('playground_3', 'Nallakunta ground', 'ground', [5420, 2956, 178, 72]);
  place('playground_3', 'Nallakunta ground', 'playground', 5508, 2992, 34);
  site('temple_3', 'Shankar Mutt', 'temple', 5520, 2866, 40, 34, 30, 's', 'temple', { gap: 45, r: 20 });
  S('flower_cart_3', 'flower_cart', 'Flower cart', null, 'ln_nallakunta_h1', 0.48, 'L');
  S('kirana_6', 'kirana', 'Sai Ram Kirana', 'SAI RAM KIRANA', 'ln_nallakunta_v1', 0.3, 'L');
  S('samosa_bandi_1', 'samosa_bandi', 'Samosa bandi', null, 'ln_nallakunta_h1', 0.75, 'R');
  park('playground_11', 'Amberpet ground', 'ground', [5900, 3180, 160, 100]);
  place('playground_11', 'Amberpet ground', 'playground', 5980, 3230, 34);

  // ---- Koti, Sultan Bazaar, Abids markets
  S('stationery_4', 'stationery', 'Koti textbook stall', 'TEXT BOOKS', 'bank_st', 0.62, 'L');
  S('photo_studio_2', 'photo_studio', 'Studio Lakshmi', 'STUDIO LAKSHMI', 'bank_st', 0.4, 'R');
  S('medical_shop_2', 'medical_shop', 'Sri Venkateswara Medical Hall', 'MEDICAL HALL', 'koti_kachiguda_rd', 0.3, 'L');
  S('bus_stop_1', 'bus_stop', 'Koti bus stop', 'KOTI', 'bank_st', 0.95, 'R');
  S('video_parlour_2', 'video_parlour', 'Champion Video Games', 'CHAMPION GAMES', 'hanuman_tekdi_rd', 0.5, 'L');
  S('cycle_rent_2', 'cycle_rent', 'Mohan Cycle Taxi', 'MOHAN CYCLE TAXI', 'king_koti_rd', 0.55, 'R');
  S('std_3', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'koti_kachiguda_rd', 0.15, 'R');
  S('banana_cart_2', 'banana_cart', 'Banana cart', null, 'chaderghat_rd', 0.45, 'R');
  S('medical_shop_3', 'medical_shop', 'Care Medicals', 'CARE MEDICALS', 'abids_rd', 0.25, 'R');
  S('photo_studio_3', 'photo_studio', 'Prince Photo Studio', 'PRINCE STUDIO', 'nampally_rd', 0.12, 'L');
  S('internet_cafe_2', 'internet_cafe', 'Netway Internet Browsing', 'NETWAY BROWSING', 'abids_rd', 0.3, 'L', { fw: 32, fd: 22, draw: 'internet_cafe' });
  S('std_4', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'gunfoundry_rd', 0.2, 'R');
  S('bus_stop_2', 'bus_stop', 'Abids bus stop', 'ABIDS', 'abids_rd', 0.38, 'R');
  S('bus_stop_3', 'bus_stop', 'Nampally bus stop', 'NAMPALLY', 'nampally_rd', 0.35, 'L');
  S('banana_cart_3', 'banana_cart', 'Banana cart', null, 'jambagh_rd', 0.4, 'L');
  S('bus_stop_17', 'bus_stop', 'Afzalgunj bus stop', 'AFZALGUNJ', 'afzalgunj_rd', 0.25, 'L');
  S('mosque_8', 'restaurant', 'Begum Bazaar Masjid', null, 'begum_bazaar_rd', 0.6, 'L', { fw: 34, fd: 34, h: 34, draw: 'mosque', kind: 'mosque' });

  // ---- Vijayanagar Colony & Mallepally (west of Nampally)
  laneV('ln_vijayanagar_v1', 'Vijayanagar Colony Road', 3150, 2420, 2859);
  laneV('ln_vijayanagar_v2', 'Mallepally Street', 3300, 2371, 2640);
  laneH('ln_vijayanagar_h1', 'Vijayanagar Main Street', 2640, 2945, 3300);
  park('school_4_ground', 'Vijayanagar school ground', 'ground', [3000, 2660, 135, 90]);
  site('school_4', 'Nalanda Public School', 'school', 3060, 2770, 80, 28, 28, 's', 'school', { gap: 20, r: 24, lm: { sign: 'NALANDA PUBLIC SCHOOL' } });
  S('stationery_5', 'stationery', 'Bharat Book & Stationery', 'BHARAT STATIONERY', 'mallepally_rd', 0.6, 'L');
  S('kirana_7', 'kirana', 'Hanuman Kirana', 'HANUMAN KIRANA', 'ln_vijayanagar_v1', 0.3, 'R');
  S('pindi_girni_3', 'pindi_girni', 'Ganesh Flour Mill', 'GANESH FLOUR MILL', 'ln_vijayanagar_h1', 0.5, 'L');
  S('barber_3', 'barber', 'Raja Hair Cutting', 'RAJA HAIR CUTTING', 'ln_vijayanagar_v1', 0.6, 'L');
  S('std_5', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'mehdipatnam_rd', 0.12, 'R');
  S('mosque_1', 'restaurant', 'Mallepally Masjid', null, 'mallepally_rd', 0.25, 'R', { fw: 36, fd: 36, h: 36, draw: 'mosque', kind: 'mosque' });
  S('bus_stop_4', 'bus_stop', 'Lakdikapul bus stop', 'LAKDIKAPUL', 'mehdipatnam_rd', 0.3, 'L');

  // ---- Masab Tank, Humayun Nagar, Mehdipatnam (Rythu Bazaar)
  laneV('ln_humayun_v1', 'Humayun Nagar Road', 2700, 2620, 3100);
  laneH('ln_mehdipatnam_h1', 'Mehdipatnam Main Street', 2900, 2222, 2981);
  lm('rythu_bazaar_mehdipatnam', 'Rythu Bazaar, Mehdipatnam', 'rythu_bazaar', 2480, 2846, 150, 72, 14, { noSolid: true, solids: [[2412, 2822, 136, 8], [2412, 2856, 136, 8]], face: 's' });
  place('rythu_bazaar_mehdipatnam', 'Rythu Bazaar, Mehdipatnam', 'market', 2480, 2878, 30, { era: 'Rythu Bazaars since 1999' });
  S('irani_cafe_16', 'irani_cafe', 'Cafe Sohrab', 'CAFE SOHRAB', 'mehdipatnam_rd', 0.82, 'R');
  S('bus_stop_5', 'bus_stop', 'Mehdipatnam bus stop', 'MEHDIPATNAM', 'mehdipatnam_rd', 0.9, 'L');
  S('banana_cart_4', 'banana_cart', 'Banana cart', null, 'ln_mehdipatnam_h1', 0.25, 'R');
  site('temple_6', 'Ayyappa Temple', 'temple', 2800, 2980, 34, 30, 28, 'w', 'temple', { gap: 80, r: 18 });
  S('flower_cart_9', 'flower_cart', 'Flower cart', null, 'ln_humayun_v1', 0.72, 'L');
  park('playground_12', 'Masab Tank ground', 'ground', [2830, 2600, 110, 80]);
  place('playground_12', 'Masab Tank ground', 'playground', 2885, 2640, 30);

  // ---- Tolichowki
  laneV('ln_tolichowki_v1', 'Tolichowki Street 1', 1900, 2684, 3125);
  laneV('ln_tolichowki_v2', 'Tolichowki Street 2', 1660, 2605, 3340);
  laneH('ln_tolichowki_h1', 'Tolichowki Main Street', 2880, 1660, 2250);
  park('school_5_ground', 'Tolichowki school ground', 'ground', [1700, 2930, 150, 90]);
  site('school_5', 'Al-Ameen High School', 'school', 1775, 2905, 80, 28, 28, 'n', 'school', { gap: 6, r: 22, lm: { sign: 'AL-AMEEN HIGH SCHOOL' } });
  S('irani_cafe_10', 'irani_cafe', 'Hotel Sohail', 'HOTEL SOHAIL', 'old_mumbai_rd', 0.12, 'R');
  S('mosque_2', 'restaurant', 'Tolichowki Masjid', null, 'ln_tolichowki_h1', 0.75, 'R', { fw: 36, fd: 36, h: 36, draw: 'mosque', kind: 'mosque' });
  S('kirana_8', 'kirana', 'Noor Kirana & Provisions', 'NOOR KIRANA', 'ln_tolichowki_v1', 0.35, 'L');
  S('meat_shop_2', 'meat_shop', 'Al-Habeeb Chicken Centre', 'AL-HABEEB CHICKEN', 'ln_tolichowki_h1', 0.3, 'L');
  S('samosa_bandi_2', 'samosa_bandi', 'Samosa bandi', null, 'ln_tolichowki_h1', 0.55, 'R');
  park('playground_10', 'Tolichowki maidan', 'ground', [1700, 2700, 150, 110]);
  place('playground_10', 'Tolichowki maidan', 'playground', 1775, 2755, 34);
  S('bus_stop_15', 'bus_stop', 'Tolichowki bus stop', 'TOLICHOWKI', 'old_mumbai_rd', 0.2, 'L');
  S('std_8', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'old_mumbai_rd', 0.1, 'R');

  // ---- Ameerpet & SR Nagar (computer coaching)
  laneH('ln_srnagar_h1', 'SR Nagar Main Road', 1000, 2200, 2725);
  laneH('ln_srnagar_h2', 'SR Nagar Street', 1200, 2200, 2760);
  laneV('ln_srnagar_v1', 'SR Nagar Cross Road', 2450, 733, 1200);
  laneV('ln_srnagar_v2', 'Yousufguda Road', 2200, 1000, 1562);
  laneV('ln_ameerpet_v1', 'Kumar Basti Road', 2900, 900, 1357);
  laneH('ln_ameerpet_h1', 'Ameerpet Street', 1100, 2742, 3084);
  lm('coaching_1', 'Computer coaching centre', 'coaching_centre', 2640, 1036, 60, 34, 30, { face: 's', sign: 'C  C++  JAVA  ORACLE' });
  lm('coaching_2', 'Computer coaching centre', 'coaching_centre', 2560, 1036, 60, 34, 30, { face: 's', sign: 'LEARN JAVA - Y2K READY' });
  park('school_6_ground', 'SR Nagar school ground', 'ground', [2280, 1030, 140, 100]);
  site('school_6', 'Sri Chaitanya Vidyalayam', 'school', 2350, 1150, 80, 28, 28, 's', 'school', { gap: 25, r: 24, lm: { sign: 'VIDYALAYAM HIGH SCHOOL' } });
  S('stationery_6', 'stationery', 'Gita Stationery', 'GITA STATIONERY', 'ln_srnagar_h2', 0.45, 'R');
  S('internet_cafe_3', 'internet_cafe', 'Info Highway Browsing Centre', 'INFO HIGHWAY', 'ln_srnagar_h1', 0.78, 'L', { fw: 32, fd: 22, draw: 'internet_cafe' });
  S('irani_cafe_11', 'irani_cafe', 'Cafe Firdaus', 'CAFE FIRDAUS', 'mumbai_hwy', 0.22, 'R');
  S('kirana_9', 'kirana', 'Mahalakshmi General Stores', 'MAHALAKSHMI STORES', 'ln_srnagar_v1', 0.72, 'L');
  S('photo_studio_4', 'photo_studio', 'Sri Sai Photo Studio', 'SAI PHOTO STUDIO', 'ln_srnagar_h1', 0.62, 'L');
  S('bakery_2', 'bakery', 'New Deccan Bakery', 'DECCAN BAKERY', 'ln_ameerpet_h1', 0.2, 'L');
  S('iyengar_bakery_4', 'iyengar_bakery', 'Bangalore Iyengar Bakery', 'IYENGAR BAKERY', 'ln_ameerpet_v1', 0.72, 'R');
  S('video_parlour_4', 'video_parlour', 'Game Zone Video Parlour', 'GAME ZONE', 'ln_srnagar_h1', 0.35, 'R');
  S('bus_stop_6', 'bus_stop', 'Ameerpet bus stop', 'AMEERPET', 'mumbai_hwy', 0.31, 'L');
  S('banana_cart_5', 'banana_cart', 'Banana cart', null, 'ln_ameerpet_h1', 0.7, 'R');
  park('playground_9', 'SR Nagar park ground', 'ground', [2470, 1030, 110, 90]);
  place('playground_9', 'SR Nagar park ground', 'playground', 2525, 1075, 30);
  S('std_9', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'ln_srnagar_h2', 0.8, 'L');

  // ---- Erragadda (Rythu Bazaar)
  laneH('ln_erragadda_h1', 'Erragadda Street', 470, 2230, 2600);
  laneV('ln_erragadda_v1', 'Erragadda Cross Road', 2600, 470, 872);
  lm('rythu_bazaar_erragadda', 'Rythu Bazaar, Erragadda', 'rythu_bazaar', 2310, 400, 150, 70, 14, { noSolid: true, solids: [[2244, 378, 132, 8], [2244, 410, 132, 8]], face: 's' });
  place('rythu_bazaar_erragadda', 'Rythu Bazaar, Erragadda', 'market', 2310, 430, 30, { era: 'Rythu Bazaars since 1999' });
  S('kirana_10', 'kirana', 'Raju Kirana', 'RAJU KIRANA', 'ln_erragadda_h1', 0.6, 'R');
  S('pindi_girni_4', 'pindi_girni', 'Sri Rama Flour Mill', 'SRI RAMA FLOUR MILL', 'ln_erragadda_v1', 0.4, 'L');
  S('meat_shop_3', 'meat_shop', 'New Mutton Shop', 'MUTTON SHOP', 'ln_erragadda_h1', 0.35, 'L');
  site('temple_4', 'Pochamma Temple', 'temple', 2520, 580, 30, 30, 28, 'w', 'temple', { gap: 75, r: 18 });
  S('banana_cart_6', 'banana_cart', 'Banana cart', null, 'mumbai_hwy', 0.57, 'R');
  S('chai_bandi_2', 'chai_bandi', 'Chai bandi', null, 'ln_erragadda_h1', 0.85, 'L');

  // ---- Musheerabad, Bholakpur, Gandhinagar
  laneV('ln_musheerabad_v1', 'Bholakpur Road', 4760, 1064, 2190);
  laneH('ln_musheerabad_h1', 'Gandhinagar Road', 1450, 4494, 4896);
  laneH('ln_musheerabad_h2', 'Musheerabad Street', 1850, 4760, 4890);
  park('school_7_ground', 'Musheerabad school ground', 'ground', [4775, 1480, 100, 120]);
  site('school_7', 'Government High School, Musheerabad', 'school', 4672, 1520, 30, 74, 26, 'e', 'school', { gap: 74, r: 22, lm: { sign: 'GOVT HIGH SCHOOL' } });
  S('kirana_12', 'kirana', 'Ali Kirana & Provisions', 'ALI KIRANA', 'ln_musheerabad_v1', 0.2, 'L');
  S('pindi_girni_5', 'pindi_girni', 'Noor Atta Chakki', 'NOOR ATTA CHAKKI', 'ln_musheerabad_v1', 0.68, 'R');
  S('mosque_3', 'restaurant', 'Musheerabad Jama Masjid', null, 'ln_musheerabad_h2', 0.5, 'L', { fw: 36, fd: 36, h: 36, draw: 'mosque', kind: 'mosque' });
  S('irani_cafe_12', 'irani_cafe', 'Cafe Bholakpur', 'CAFE BHOLAKPUR', 'musheerabad_rd', 0.35, 'R');
  S('bakery_3', 'bakery', 'Golden Bakery', 'GOLDEN BAKERY', 'musheerabad_rd', 0.55, 'R');
  S('barber_4', 'barber', 'Famous Saloon', 'FAMOUS SALOON', 'ln_musheerabad_h1', 0.4, 'L');
  S('std_6', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'musheerabad_rd', 0.15, 'R');
  S('samosa_bandi_3', 'samosa_bandi', 'Samosa bandi', null, 'ln_musheerabad_h1', 0.86, 'R');
  S('cycle_rent_3', 'cycle_rent', 'Raju Cycle Taxi', 'RAJU CYCLE TAXI', 'ln_musheerabad_v1', 0.86, 'L');
  park('playground_4', 'Bholakpur ground', 'ground', [4775, 1660, 100, 150]);
  place('playground_4', 'Bholakpur ground', 'playground', 4825, 1735, 34);
  S('meat_shop_7', 'meat_shop', 'Bholakpur Chicken Centre', 'CHICKEN CENTRE', 'ln_musheerabad_v1', 0.45, 'L');
  S('bus_stop_14', 'bus_stop', 'Tank Bund bus stop', 'TANK BUND', 'lower_tank_bund', 0.45, 'R');

  // ---- Secunderabad: Marredpally, Padmarao Nagar
  laneV('ln_marredpally_v1', 'Marredpally Street 1', 5800, 250, 700);
  laneH('ln_marredpally_h0', 'East Marredpally Road', 250, 5468, 5800);
  laneH('ln_marredpally_h1', 'West Marredpally Road', 450, 5450, 6200);
  laneV('ln_marredpally_v2', 'Marredpally Street 2', 6200, 450, 654);
  park('school_8_ground', 'Holy Family school ground', 'ground', [5830, 470, 140, 160]);
  site('school_8', 'Holy Family Convent School', 'school', 6050, 545, 30, 80, 30, 'w', 'school', { gap: 80, r: 24, lm: { sign: 'HOLY FAMILY CONVENT' } });
  site('church_1', 'Methodist Church, Marredpally', 'church', 5600, 560, 40, 56, 40, 'e', 'church', { gap: 22, r: 20 });
  S('kirana_13', 'kirana', 'Joseph General Stores', 'JOSEPH STORES', 'ln_marredpally_h1', 0.5, 'L');
  S('iyengar_bakery_2', 'iyengar_bakery', 'Sri Iyengar Bakery', 'SRI IYENGAR BAKERY', 'sd_rd', 0.3, 'L');
  S('medical_shop_4', 'medical_shop', 'Marredpally Medicals', 'MEDICALS', 'ln_marredpally_h1', 0.8, 'R');
  S('cycle_rent_4', 'cycle_rent', 'Peter Cycle Works (hire)', 'CYCLES ON HIRE', 'ln_marredpally_v1', 0.5, 'L');
  S('samosa_bandi_4', 'samosa_bandi', 'Samosa bandi', null, 'ln_marredpally_v2', 0.3, 'R');
  park('playground_5', 'Marredpally ground', 'ground', [6250, 300, 150, 120]);
  place('playground_5', 'Marredpally ground', 'playground', 6325, 360, 34);
  S('internet_cafe_4', 'internet_cafe', 'Sify iWay-style Browsing Centre', 'BROWSING CENTRE', 'sd_rd', 0.34, 'R', { fw: 32, fd: 22, draw: 'internet_cafe' });
  S('bus_stop_7', 'bus_stop', 'Paradise bus stop', 'PARADISE', 'sp_rd', 0.14, 'L');
  S('bus_stop_8', 'bus_stop', 'Secunderabad bus stop', 'SECUNDERABAD', 'rp_rd', 0.3, 'L');
  S('banana_cart_7', 'banana_cart', 'Banana cart', null, 'station_rd', 0.15, 'R');
  S('std_10', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'rp_rd', 0.42, 'L');
  shop('flower_cart_4', 'flower_cart', 'Flower cart (Mahankali)', null, side('general_bazaar_ln', 0.7, 'R', 3));

  // ---- Tarnaka, Lalaguda railway colony, OU
  laneH('ln_lalaguda_h1', 'Lalaguda Road', 1100, 5800, 6400);
  laneV('ln_lalaguda_v1', 'Lalaguda Street 1', 5800, 1100, 1203);
  laneV('ln_lalaguda_v2', 'Lalaguda Street 2', 6100, 1100, 1269);
  laneV('ln_lalaguda_v3', 'Tarnaka Street', 6400, 1100, 1324);
  park('school_9_ground', 'Railway school ground', 'ground', [5830, 1125, 150, 70]);
  site('school_9', 'Railway High School, Lalaguda', 'school', 5905, 1060, 90, 26, 28, 's', 'school', { gap: 2, r: 20, lm: { sign: 'RAILWAY HIGH SCHOOL' } });
  park('playground_6', 'Lalaguda railway ground', 'ground', [6125, 1120, 120, 110]);
  place('playground_6', 'Lalaguda railway ground', 'playground', 6185, 1175, 34);
  S('kirana_14', 'kirana', 'Railway Colony Stores', 'RAILWAY STORES', 'ln_lalaguda_h1', 0.85, 'R');
  S('photo_studio_5', 'photo_studio', 'Tarnaka Photo Studio', 'PHOTO STUDIO', 'rp_rd', 0.92, 'L');
  S('internet_cafe_5', 'internet_cafe', 'Campus Net Cafe', 'CAMPUS NET CAFE', 'rp_rd', 0.86, 'L', { fw: 32, fd: 22, draw: 'internet_cafe' });
  S('chai_bandi_3', 'chai_bandi', 'OU canteen chai', null, 'ou_rd', 0.35, 'L');
  S('bus_stop_16', 'bus_stop', 'Tarnaka bus stop', 'TARNAKA', 'uppal_rd', 0.1, 'L');
  site('temple_5', 'Sri Rama Temple, Tarnaka', 'temple', 6620, 1430, 32, 30, 28, 'w', 'temple', { gap: 40, r: 18 });

  // ---- Malakpet
  road('malakpet_race_rd', 'Race Course Road', ST, 36, [[5450, 3886], [5420, 4200], [5350, 4500]]);
  laneV('ln_malakpet_v1', 'Malakpet Street', 4950, 3823, 4520);
  laneH('ln_malakpet_h1', 'Malakpet Colony Road', 4200, 4950, 5420);
  park('malakpet_race_course', 'Malakpet race course', 'ground', [[5120, 3955], [5380, 3955], [5395, 4030], [5380, 4150], [5120, 4150], [5100, 4050]]);
  place('malakpet_race_course', 'Malakpet race course', 'park', 5250, 4050, 40);
  park('school_10_ground', 'Malakpet school ground', 'ground', [4975, 4260, 130, 100]);
  site('school_10', 'Malakpet High School', 'school', 5170, 4310, 30, 80, 28, 'w', 'school', { gap: 10, r: 22, lm: { sign: 'MALAKPET HIGH SCHOOL' } });
  S('stationery_8', 'stationery', 'Sri Sai Stationery', 'SAI STATIONERY', 'ln_malakpet_h1', 0.55, 'L');
  S('irani_cafe_13', 'irani_cafe', 'Hotel Daulat', 'HOTEL DAULAT', 'malakpet_rd', 0.2, 'R');
  S('kirana_15', 'kirana', 'Laxmi Narasimha Kirana', 'LAXMI KIRANA', 'ln_malakpet_v1', 0.25, 'L');
  S('meat_shop_4', 'meat_shop', 'Malakpet Mutton Shop', 'MUTTON SHOP', 'ln_malakpet_v1', 0.6, 'R');
  S('medical_shop_5', 'medical_shop', 'Malakpet Medicals', 'MEDICALS', 'malakpet_rd', 0.22, 'L');
  S('dosa_bandi_2', 'dosa_bandi', 'Dosa bandi', null, 'ln_malakpet_h1', 0.8, 'R');
  S('mosque_4', 'restaurant', 'Malakpet Masjid', null, 'ln_malakpet_v1', 0.45, 'L', { fw: 36, fd: 36, h: 36, draw: 'mosque', kind: 'mosque' });
  S('bakery_4', 'bakery', 'Malakpet Bakery', 'BAKERY', 'dabeerpura_rd', 0.8, 'R');
  S('bus_stop_12', 'bus_stop', 'Malakpet bus stop', 'MALAKPET', 'malakpet_rd', 0.2, 'L');

  // ---- Dilsukhnagar & Kothapet (Sai Baba temple, Rythu Bazaar)
  laneV('ln_dilsukh_v1', 'Dilsukhnagar Street 1', 5950, 3910, 4380);
  laneV('ln_dilsukh_v2', 'Dilsukhnagar Street 2', 6450, 3930, 4380);
  laneH('ln_dilsukh_h1', 'Dilsukhnagar Colony Road', 4150, 5425, 6712);
  laneH('ln_dilsukh_h2', 'Chaitanyapuri Road', 4380, 5950, 6683);
  // Sai Baba temple lane (west of the temple compound): rose-garland carts 5..8, the banana cart (bible M6)
  laneV('ln_sai_temple', 'Sai Baba Temple Lane', 6212, 3944, 4150);
  for (let k = 0; k < 4; k++) S('flower_cart_' + (5 + k), 'flower_cart', 'Flower cart (Sai Baba temple lane)', null, 'ln_sai_temple', 0.17 + k * 0.105, 'R', { sgap: 3 });
  S('banana_cart_8', 'banana_cart', 'Banana cart (outside the Sai Baba temple lane)', null, 'ln_sai_temple', 0.62, 'R', { sgap: 3 });
  S('coconut_cart_6', 'coconut_cart', 'Tender coconut cart', null, 'malakpet_rd', 0.66, 'R', { sgap: 2 });
  park('school_11_ground', 'Dilsukhnagar school ground', 'ground', [5975, 3975, 150, 160]);
  site('school_11', 'Dilsukhnagar Public School', 'school', 6060, 4200, 80, 28, 28, 's', 'school', { gap: 60, r: 24, lm: { sign: 'DILSUKHNAGAR PUBLIC SCHOOL' } });
  S('stationery_7', 'stationery', 'Saraswati Book Depot', 'SARASWATI BOOK DEPOT', 'ln_dilsukh_h1', 0.52, 'L');
  park('playground_7', 'Chaitanyapuri ground', 'ground', [6180, 4170, 150, 100]);
  place('playground_7', 'Chaitanyapuri ground', 'playground', 6255, 4220, 34);
  lm('rythu_bazaar_saroornagar', 'Rythu Bazaar, Kothapet', 'rythu_bazaar', 6560, 4262, 140, 70, 14, { noSolid: true, solids: [[6498, 4240, 124, 8], [6498, 4272, 124, 8]], face: 'n' });
  place('rythu_bazaar_saroornagar', 'Rythu Bazaar, Kothapet', 'market', 6560, 4296, 30, { era: 'Rythu Bazaars since 1999' });
  S('kirana_16', 'kirana', 'Sri Venkateshwara Kirana', 'VENKATESHWARA KIRANA', 'ln_dilsukh_v2', 0.3, 'R');
  S('irani_cafe_14', 'irani_cafe', 'Cafe Golden Star', 'CAFE GOLDEN STAR', 'malakpet_rd', 0.55, 'R');
  S('internet_cafe_6', 'internet_cafe', 'Dial-Up Dreams Net Cafe', 'NET CAFE', 'ln_dilsukh_h1', 0.7, 'L', { fw: 32, fd: 22, draw: 'internet_cafe' });
  S('iyengar_bakery_3', 'iyengar_bakery', 'Sri Venkateswara Iyengar Bakery', 'IYENGAR BAKERY', 'ln_dilsukh_v1', 0.3, 'R');
  S('photo_studio_6', 'photo_studio', 'Colour Lab & Studio', 'COLOUR LAB', 'ln_dilsukh_h1', 0.32, 'R');
  S('medical_shop_6', 'medical_shop', 'Sri Sai Medicals', 'SAI MEDICALS', 'ln_dilsukh_v1', 0.2, 'R');
  S('meat_shop_5', 'meat_shop', 'Kothapet Chicken & Mutton', 'CHICKEN & MUTTON', 'ln_dilsukh_h2', 0.4, 'L');
  S('samosa_bandi_5', 'samosa_bandi', 'Samosa bandi', null, 'ln_dilsukh_h1', 0.86, 'R');
  S('dosa_bandi_3', 'dosa_bandi', 'Dosa bandi', null, 'ln_dilsukh_v2', 0.62, 'L');
  S('video_parlour_3', 'video_parlour', 'Rocky Video Games', 'ROCKY VIDEO GAMES', 'ln_dilsukh_h1', 0.6, 'R');
  S('barber_5', 'barber', 'Hero Hair Cutting', 'HERO HAIR CUTTING', 'ln_dilsukh_v2', 0.15, 'L');
  S('pindi_girni_7', 'pindi_girni', 'Durga Pindi Girni', 'DURGA PINDI GIRNI', 'ln_dilsukh_h2', 0.7, 'R');
  S('bus_stop_11', 'bus_stop', 'Dilsukhnagar bus stop', 'DILSUKHNAGAR', 'malakpet_rd', 0.52, 'L');
  S('std_11', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'malakpet_rd', 0.5, 'R');
  S('kirana_20', 'kirana', 'Kothapet Kirana', 'KOTHAPET KIRANA', 'kothapet_rd', 0.3, 'R');

  // ---- Saidabad & Santoshnagar
  laneV('ln_saidabad_v1', 'Saidabad Street', 5150, 4520, 5161);
  laneH('ln_saidabad_h1', 'Saidabad Colony Road', 4800, 5150, 5420);
  park('school_12_ground', 'Saidabad school ground', 'ground', [5170, 4560, 150, 120]);
  site('school_12', 'Saidabad Government School', 'school', 5245, 4720, 80, 28, 26, 's', 'school', { gap: 70, r: 22, lm: { sign: 'GOVT SCHOOL SAIDABAD' } });
  park('playground_8', 'Saidabad maidan', 'ground', [5180, 4830, 140, 110]);
  place('playground_8', 'Saidabad maidan', 'playground', 5250, 4885, 34);
  S('kirana_17', 'kirana', 'Saidabad Kirana', 'SAIDABAD KIRANA', 'ln_saidabad_v1', 0.6, 'R');
  S('mosque_5', 'restaurant', 'Saidabad Masjid', null, 'ln_saidabad_v1', 0.85, 'L', { fw: 36, fd: 36, h: 36, draw: 'mosque', kind: 'mosque' });
  S('dosa_bandi_4', 'dosa_bandi', 'Dosa bandi', null, 'saidabad_rd', 0.35, 'L');

  // ---- Old City mohallas
  road('ln_ghansi_bazaar', 'Ghansi Bazaar', LN, 22, [[3640, 3999], [3640, 4066], [3882, 4066]]);
  road('ln_kotla_alijah', 'Kotla Alijah Lane', LN, 22, [[4020, 4300], [4150, 4252], [4248, 4232]]);
  road('ln_mitti_ka_sher', 'Mitti ka Sher Lane', LN, 22, [[4020, 4440], [4160, 4470], [4330, 4520]]);
  road('ln_shah_ali_banda_e', 'Shah Ali Banda East Lane', LN, 22, [[3915, 4760], [4100, 4760], [4250, 4600]]);
  road('ln_shah_ali_banda_w', 'Shah Ali Banda West Lane', LN, 22, [[3912, 4700], [3700, 4705], [3500, 4700], [3150, 4700]]);
  for (let k = 0; k < 3; k++) S('kite_stall_' + (k + 1), 'kite_stall', 'Kite stall', ['PATANG HOUSE', 'MANJA & PATANG', 'KITE BAZAAR'][k], 'gulzar_houz_e', 0.15 + k * 0.22, k % 2 ? 'R' : 'L', { kind: 'kite_stall' });
  S('irani_cafe_15', 'irani_cafe', 'Cafe Gulzar', 'CAFE GULZAR', 'gulzar_houz_w', 0.3, 'R');
  S('kirana_18', 'kirana', 'Hyderabad Kirana', 'KIRANA', 'ln_ghansi_bazaar', 0.3, 'R');
  S('meat_shop_6', 'meat_shop', 'Murgi Chowk Chicken Centre', 'CHICKEN CENTRE', 'ln_kotla_alijah', 0.82, 'R');
  S('pindi_girni_6', 'pindi_girni', 'Noor Pindi Girni', 'NOOR PINDI GIRNI', 'ln_mitti_ka_sher', 0.6, 'L');
  S('samosa_bandi_6', 'samosa_bandi', 'Samosa bandi', null, 'sardar_mahal_rd', 0.5, 'R');
  S('chai_bandi_4', 'chai_bandi', 'Chai bandi', null, 'shah_ali_banda_rd', 0.12, 'R');
  S('banana_cart_9', 'banana_cart', 'Banana cart', null, 'musi_south_rd', 0.63, 'R');
  S('barber_6', 'barber', 'Taj Hair Saloon', 'TAJ SALOON', 'ln_shah_ali_banda_e', 0.3, 'L');
  S('std_12', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'shah_ali_banda_rd', 0.25, 'L');
  S('mosque_6', 'restaurant', 'Shah Ali Banda Masjid', null, 'ln_shah_ali_banda_e', 0.6, 'R', { fw: 36, fd: 36, h: 36, draw: 'mosque', kind: 'mosque' });
  park('school_13_ground', 'Shah Ali Banda school ground', 'ground', [3940, 4790, 140, 90]);
  site('school_13', 'Government Urdu High School, Shah Ali Banda', 'school', 4010, 4905, 80, 28, 26, 's', 'school', { gap: 10, r: 20, lm: { sign: 'GOVT URDU HIGH SCHOOL' } });
  park('playground_13', 'Shah Ali Banda maidan', 'ground', [3720, 4730, 150, 90]);
  place('playground_13', 'Shah Ali Banda maidan', 'playground', 3795, 4775, 34);
  S('flower_cart_10', 'flower_cart', 'Flower cart (Lal Darwaza)', null, 'lal_darwaza_rd', 0.42, 'L');
  S('bus_stop_13', 'bus_stop', 'Charminar bus stop', 'CHARMINAR', 'sardar_mahal_rd', 0.75, 'R');
  S('mosque_7', 'restaurant', 'Falaknuma Masjid', null, 'chandrayangutta_rd', 0.12, 'L', { fw: 36, fd: 36, h: 36, draw: 'mosque', kind: 'mosque' });
  S('kirana_19', 'kirana', 'Chandrayangutta Kirana', 'KIRANA', 'chandrayangutta_rd', 0.3, 'R');
  S('chai_bandi_5', 'chai_bandi', 'Chai bandi', null, 'bahadurpura_rd', 0.2, 'R');
  S('std_13', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'bahadurpura_rd', 0.26, 'L');

  // ---- Lakeside & parks: coconut carts, chai, bhutta
  S('coconut_cart_1', 'coconut_cart', 'Tender coconut cart', null, 'necklace_rd', 0.18, 'L', { sgap: 2 });
  S('coconut_cart_2', 'coconut_cart', 'Tender coconut cart', null, 'necklace_rd', 0.42, 'L', { sgap: 2 });
  S('coconut_cart_3', 'coconut_cart', 'Tender coconut cart', null, 'necklace_rd', 0.64, 'R', { sgap: 2 });
  S('coconut_cart_4', 'coconut_cart', 'Tender coconut cart', null, 'tank_bund', 0.45, 'R', { sgap: 2 });
  S('coconut_cart_5', 'coconut_cart', 'Tender coconut cart', null, 'banjara_rd1', 0.72, 'L', { sgap: 2 });
  S('coconut_cart_7', 'coconut_cart', 'Tender coconut cart', null, 'lower_tank_bund', 0.55, 'L', { sgap: 2 });
  S('chai_bandi_6', 'chai_bandi', 'Bhutta & chai cart', null, 'tank_bund', 0.6, 'R', { sgap: 2 });
  S('chai_bandi_7', 'chai_bandi', 'Construction-site chai', null, 'hitec_rd', 0.55, 'L', { sgap: 2 });
  S('chai_bandi_8', 'chai_bandi', 'Chai bandi', null, 'necklace_rd', 0.8, 'L', { sgap: 2 });
  S('dosa_bandi_5', 'dosa_bandi', 'Dosa bandi', null, 'secretariat_rd', 0.55, 'R', { sgap: 2 });
  S('samosa_bandi_7', 'samosa_bandi', 'Samosa bandi', null, 'mumbai_hwy', 0.15, 'L', { sgap: 2 });
  S('dosa_bandi_6', 'dosa_bandi', 'Dosa bandi', null, 'mg_rd', 0.5, 'R', { sgap: 2 });
  S('dosa_bandi_7', 'dosa_bandi', 'Dosa bandi', null, 'amberpet_rd', 0.2, 'L', { sgap: 2 });
  S('banana_cart_10', 'banana_cart', 'Banana cart', null, 'sd_rd', 0.18, 'R', { sgap: 2 });
  S('flower_cart_11', 'flower_cart', 'Flower cart (Birla Mandir steps)', null, 'saifabad_rd', 0.62, 'R', { sgap: 2 });
  S('flower_cart_12', 'flower_cart', 'Flower cart (Peddamma Temple)', null, 'jubilee_rd36', 0.2, 'R', { sgap: 2 });
  S('medical_shop_7', 'medical_shop', 'Banjara Medicals', 'BANJARA MEDICALS', 'banjara_rd1', 0.25, 'R');
  S('std_14', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'raj_bhavan_rd', 0.3, 'R');
  S('std_15', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'jubilee_rd36', 0.5, 'L');
  S('std_16', 'std_booth', 'STD/ISD/PCO', 'STD ISD PCO', 'hitec_rd', 0.3, 'R');
  S('bus_stop_18', 'bus_stop', 'Khairatabad bus stop', 'KHAIRATABAD', 'raj_bhavan_rd', 0.85, 'L');
  S('bus_stop_20', 'bus_stop', 'HITEC City bus stop', 'HITEC CITY', 'hitec_rd', 0.4, 'L');
  S('bus_stop_21', 'bus_stop', 'Uppal bus stop', 'UPPAL', 'amberpet_rd', 0.8, 'R');
  S('bus_stop_22', 'bus_stop', 'LB Nagar bus stop', 'LB NAGAR', 'malakpet_rd', 0.78, 'R');
  S('kirana_11', 'kirana', 'Prakash Nagar Stores', 'PRAKASH STORES', 'begumpet_rd', 0.4, 'L');

  /* ============================================ COMPLETENESS SWEEP (research_all_places.md) */
  // A. Secunderabad & the Cantonment
  road('bolarum_rd', 'Bolarum Road', ST, 36, [[4597, 200], [5000, 200], [5300, 220], [5467, 260]]);
  road('club_rd', 'Secunderabad Club Road', LN, 24, [[5160, 776], [5160, 460]], { spur: true });
  S('blue_sea_cafe', 'irani_cafe', 'Blue Sea Tea & Snacks', 'BLUE SEA', 'rp_rd', 0.55, 'R', { fw: 40, fd: 28 });
  alias('irani_cafe_17', 'blue_sea_cafe', 'irani_cafe', 'Blue Sea Tea & Snacks, Regimental Bazaar');
  S('secunderabad_ganesh_temple', 'restaurant', 'Sri Ganesh Temple (Secunderabad station)', null, 'station_rd', 0.72, 'R', { fw: 30, fd: 30, h: 30, draw: 'temple', kind: 'temple' });
  S('st_johns_church_secunderabad', 'restaurant', "St. John's Church", null, 'sd_rd', 0.42, 'L', { fw: 44, fd: 52, h: 42, draw: 'church', kind: 'church' });
  alias('church_st_johns', 'st_johns_church_secunderabad', 'church');
  site('holy_trinity_church_bolarum', 'Holy Trinity Church, Bolarum', 'church', 4700, 125, 44, 60, 42, 's', 'church', { gap: 30, r: 20 });
  alias('church_holy_trinity', 'holy_trinity_church_bolarum', 'church');
  site('rashtrapati_nilayam', 'Rashtrapati Nilayam (gated)', 'palace', 5000, 110, 180, 96, 26, 's', 'landmark', { gap: 14, r: 22, lm: { gated: true } });
  park('gymkhana_ground_secunderabad', 'Gymkhana Ground', 'grass', [4950, 452, 180, 150]);
  place('gymkhana_ground_secunderabad', 'Gymkhana Ground', 'park', 5040, 527, 40);
  park('secunderabad_club_lawns', 'Secunderabad Club lawns', 'garden', [5180, 470, 150, 200]);
  site('secunderabad_club', 'Secunderabad Club (members only)', 'club_house', 5262, 560, 110, 60, 26, 'w', 'landmark', { gap: 50, r: 18, lm: { gated: true } });
  park('rathifile_bays', 'Rathifile bus bays', 'plaza', [5298, 1006, 90, 66]);
  lm('rathifile_bus_station', 'Rathifile City Bus Station', 'bus_terminus', 5343, 1039, 90, 66, 16, { noSolid: true, solids: [[5300, 1008, 86, 8]], face: 's' });
  place('rathifile_bus_station', 'Rathifile City Bus Station', 'transport', 5343, 1058, 28);
  site('chenoy_trade_centre', 'Chenoy Trade Centre (CTC)', 'market_hall', 4652, 840, 60, 40, 24, 'w', 'market', { gap: 6, r: 18, lm: { sign: 'CHENOY TRADE CENTRE' } });
  site('anand_theatre', 'Anand Theatre', 'cinema', 5320, 708, 76, 54, 30, 's', 'cinema', { gap: 4, lm: { films: ['JAI HYDERABAD'] } });

  // B. Begumpet, Ameerpet, Balkampet
  site('shoppers_stop_begumpet', 'Trendz Department Store, Begumpet', 'department_store', 3512, 735, 80, 46, 30, 'n', 'shop', { gap: 2, r: 20, lm: { sign: 'TRENDZ DEPARTMENT STORE' } });
  road('hps_ln', 'HPS Road', LN, 24, [J.BEGUMPET, [3196, 600], [3196, 512]], { spur: true });
  park('hps_campus', 'Hyderabad Public School grounds', 'ground', [2960, 552, 220, 110]);
  site('hyderabad_public_school', 'The Hyderabad Public School', 'school', 3070, 520, 120, 36, 30, 's', 'school', { gap: 30, r: 26, lm: { variant: 'hps', sign: 'THE HYDERABAD PUBLIC SCHOOL' } });
  site('balkampet_yellamma_temple', 'Balkampet Yellamma Temple', 'mahankali_temple', 2936, 948, 34, 34, 30, 'w', 'temple', { gap: 4, r: 22, place: { festival: 'bonalu' } });
  site('sarathi_studios', 'Sarathi Studios', 'film_studio', 2535, 1157, 120, 50, 28, 's', 'landmark', { gap: 22, r: 20 });

  // C. Naubat Pahad, Khairatabad, Panjagutta
  lm('hill_fort_palace', 'Hill Fort Palace (locked)', 'palace', 3790, 2290, 60, 44, 30, { face: 's', gated: true });
  place('hill_fort_palace', 'Hill Fort Palace (locked)', 'landmark', 3790, 2330, 18);
  site('khairatabad_mosque', 'Khairatabad Mosque', 'mosque', 3090, 1975, 36, 36, 38, 'e', 'mosque', { gap: 8, r: 18 });
  alias('mosque_9', 'khairatabad_mosque', 'mosque');
  site('errum_manzil', 'Errum Manzil (gate)', 'palace', 2790, 1570, 70, 48, 30, 'e', 'landmark', { gap: 14, r: 18, lm: { gated: true } });
  site('nims_hospital', 'NIMS Hospital', 'hospital', 3002, 1482, 100, 66, 30, 'w', 'landmark', { gap: 18, r: 22 });

  // D. East of the lake
  S('katta_maisamma_temple', 'restaurant', 'Katta Maisamma Temple', null, 'lower_tank_bund', 0.33, 'L', { fw: 30, fd: 30, h: 28, draw: 'temple', kind: 'temple', place: { festival: 'bonalu' } });
  site('ramakrishna_math', 'Ramakrishna Math, Domalguda', 'ashram', 4400, 2200, 70, 50, 26, 'e', 'landmark', { gap: 50, r: 20 });
  place('narayanguda_ymca', 'Narayanguda YMCA (Sadar festival)', 'junction', 4528, 2712, 24);
  site('city_central_library', 'City Central Library, Chikkadpally', 'library', 4640, 2405, 46, 40, 24, 's', 'landmark', { gap: 2, r: 16 });
  alias('shankar_mutt_nallakunta', 'temple_3', 'temple', 'Sringeri Shankar Mutt, Nallakunta');

  // E. Abids, Nampally, Gunfoundry, Koti, King Koti
  alias('grand_hotel_abids', 'grand_hotel', 'irani_cafe', 'Grand Hotel, Abids');
  S('taj_mahal_hotel_abids', 'restaurant', 'Taj Mahal Hotel, Abids', 'TAJ MAHAL HOTEL', 'nampally_rd', 0.1, 'R', { fw: 40, fd: 26 });
  S('chermas_abids', 'restaurant', "Cherma's", 'CHERMAS', 'bank_st', 0.3, 'L', { fw: 34, fd: 24, draw: 'clothes_store', kind: 'shop' });
  site('st_georges_church_abids', "St. George's Church", 'church', 4060, 3172, 44, 56, 40, 'n', 'church', { gap: 6, r: 18 });
  alias('church_st_georges', 'st_georges_church_abids', 'church');
  alias('st_josephs_cathedral', 'church_st_josephs', 'church', "St. Joseph's Cathedral");
  S('iskcon_abids', 'restaurant', 'ISKCON Temple, Abids', null, 'nampally_rd', 0.42, 'R', { fw: 40, fd: 34, h: 32, draw: 'temple', kind: 'temple' });
  alias('temple_7', 'iskcon_abids', 'temple');
  S('dargah_yousufain', 'restaurant', 'Dargah Yousufain', null, 'mallepally_rd', 0.2, 'L', { fw: 40, fd: 40, h: 30, draw: 'dargah', kind: 'dargah' });
  lm('jawahar_bal_bhavan', 'Jawahar Bal Bhavan', 'bal_bhavan', 3760, 2680, 50, 38, 20, { face: 'n' });
  place('jawahar_bal_bhavan', 'Jawahar Bal Bhavan', 'landmark', 3760, 2650, 18);
  site('king_kothi', 'King Kothi Palace (gated)', 'palace', 4180, 2900, 80, 50, 26, 'n', 'landmark', { gap: 26, r: 18, lm: { gated: true } });
  S('koti_book_bazaar', 'book_stall', 'Koti pavement book bazaar', 'OLD BOOKS', 'bank_st', 0.55, 'R', { kind: 'market' });

  // F. The Musi and its banks
  place('musi_riverbed', 'Musi riverbed & dhobi ghat', 'park', 3780, 3765, 40);
  lm('dhobi_ghat_1', 'Dhobi ghat (washing lines)', 'dhobi_ghat', 3450, 3912, 80, 26, 6, { noSolid: true });
  site('city_college', 'Government City College', 'college', 3420, 4066, 110, 60, 32, 'n', 'landmark', { gap: 6, r: 20 });
  alias('gowliguda_hangar', 'cbs_hangar', 'transport', 'Gowliguda "Mississippi" hangar');
  site('gurudwara_gowliguda', 'Central Gurudwara Sahib, Gowliguda', 'gurudwara', 4060, 3392, 50, 50, 32, 'n', 'temple', { gap: 18, r: 18 });
  place('dhoolpet', 'Dhoolpet (Ganesh idol lanes, manja makers)', 'market', 3282, 3450, 30);
  lm('idol_workshop_1', 'Ganesh idol workshop', 'idol_workshop', 3240, 3420, 30, 40, 22, { face: 'e', seasonal: 'ganesh' });
  lm('idol_workshop_2', 'Ganesh idol workshop', 'idol_workshop', 3226, 3480, 30, 40, 22, { face: 'e', seasonal: 'ganesh' });
  park('victory_playground', 'Victory Playground', 'ground', [4690, 3210, 130, 100]);
  place('victory_playground', 'Victory Playground (VPG)', 'playground', 4755, 3260, 40);

  // G. Old City
  lm('mahboob_chowk_clock_tower', 'Mahboob Chowk Clock Tower', 'clock_tower', 3600, 4335, 16, 16, 52, { variant: 'mahboob_chowk' });
  lm('murgi_chowk', 'Murgi Chowk market', 'market_hall', 3555, 4300, 50, 40, 18, { face: 's' });
  place('mahboob_chowk_clock_tower', 'Mahboob Chowk & Murgi Chowk', 'market', 3580, 4352, 20);
  site('badshahi_ashurkhana', 'Badshahi Ashurkhana', 'ashurkhana', 3700, 4182, 50, 40, 26, 'n', 'landmark', { gap: 6, r: 16 });
  site('jama_masjid_charminar', 'Jama Masjid (Charminar)', 'mosque', 4095, 4308, 30, 30, 34, 's', 'mosque', { gap: 6, r: 14 });
  alias('mosque_10', 'jama_masjid_charminar', 'mosque');
  alias('hotel_madina', 'pathergatti', 'food', 'Hotel Madina');
  S('hotel_nayaab', 'restaurant', 'Hotel Nayaab', 'HOTEL NAYAAB', 'ln_ghansi_bazaar', 0.66, 'R', { fw: 34, fd: 26 });
  S('akkanna_madanna_temple', 'restaurant', 'Akkanna Madanna Mahankali Temple', null, 'ln_shah_ali_banda_e', 0.2, 'L', { fw: 30, fd: 30, h: 30, draw: 'mahankali_temple', kind: 'temple', place: { festival: 'bonalu' } });
  site('paigah_tombs', 'Paigah Tombs', 'paigah_tombs', 4900, 5145, 90, 60, 22, 's', 'landmark', { gap: 4, r: 18 });
  place('barkas', 'Barkas (the Arab quarter)', 'district', 4700, 5345, 40);

  // H. West: Zoo side, Mehdipatnam, Shaikpet, Golconda, Langar Houz
  place('mir_alam_tank', 'Mir Alam Tank', 'park', 2300, 4978, 40);
  S('sarojini_devi_eye_hospital', 'restaurant', 'Sarojini Devi Eye Hospital', 'SAROJINI DEVI EYE HOSPITAL', 'mehdipatnam_rd', 0.6, 'R', { fw: 90, fd: 44, h: 26, draw: 'hospital', kind: 'landmark' });
  park('mehdipatnam_depot_bays', 'Mehdipatnam bus bays', 'plaza', [2170, 2730, 130, 46]);
  lm('mehdipatnam_bus_terminus', 'Mehdipatnam Bus Depot', 'bus_terminus', 2235, 2753, 130, 46, 16, { noSolid: true, solids: [[2172, 2732, 126, 6]], face: 's' });
  place('mehdipatnam_bus_terminus', 'Mehdipatnam Bus Depot', 'transport', 2235, 2766, 24);
  site('hussain_shah_wali_dargah', 'Hussain Shah Wali Dargah & Shaikpet Sarai', 'dargah', 1460, 2385, 40, 40, 30, 's', 'dargah', { gap: 8, r: 18 });
  lm('golconda_jagadamba_temple', 'Jagadamba Temple, Golconda', 'mahankali_temple', 1150, 3440, 30, 30, 26, { face: 's' });
  place('golconda_jagadamba_temple', 'Jagadamba Temple, Golconda', 'temple', 1150, 3466, 16, { festival: 'bonalu' });
  road('bapu_ghat_rd', 'Bapu Ghat Road', LN, 22, [J.LANGAR_HOUZ, [1730, 3480], [1800, 3600]], { spur: true });
  site('bapu_ghat', 'Bapu Ghat (Gandhi memorial)', 'memorial', 1800, 3650, 50, 40, 20, 'n', 'landmark', { gap: 8, r: 18 });

  // I. Banjara Hills, Jubilee Hills, Film Nagar
  S('sarvi', 'irani_cafe', 'Sarvi', 'SARVI', 'banjara_rd1', 0.42, 'L', { fw: 44, fd: 30 });
  alias('irani_cafe_18', 'sarvi', 'irani_cafe', 'Sarvi, Banjara Hills');
  alias('jubilee_hills_check_post', 'jubilee_hills', 'junction');
  site('apollo_hospital_jubilee_hills', 'Apollo Hospital, Jubilee Hills', 'hospital', 1462, 1500, 90, 60, 34, 'w', 'landmark', { gap: 12, r: 20 });
  site('ramanaidu_studios', 'Ramanaidu Studios', 'film_studio', 1120, 1850, 120, 60, 28, 'e', 'landmark', { gap: 20, r: 20 });

  // J. North-west: HITEX, UoH, Kukatpally
  site('hitex', 'HITEX Exhibition Centre (opens Jan 2003)', 'exhibition_hall', 900, 700, 160, 100, 24, 's', 'landmark', { gap: 14, r: 30, lm: { era: 'construction site before 14 Jan 2003' } });
  road('uoh_rd', 'University Road', LN, 24, [[150, 1689], [150, 1880]], { spur: true });
  site('university_of_hyderabad', 'University of Hyderabad (gate)', 'campus_gate', 120, 1905, 60, 30, 20, 'e', 'landmark', { gap: 6, r: 20 });
  site('jntu_kukatpally', 'JNTU, Kukatpally', 'college', 1700, 150, 120, 56, 30, 's', 'landmark', { gap: 14, r: 22 });
  place('kphb_colony', 'KPHB Colony, Kukatpally', 'district', 1420, 200, 40);

  // K. East and south-east
  site('ashtalakshmi_temple', 'Ashtalakshmi Temple, Kothapet', 'temple', 6790, 4180, 50, 50, 40, 'w', 'temple', { gap: 22, r: 22 });
  alias('temple_8', 'ashtalakshmi_temple', 'temple');
  place('saroornagar_lake', 'Saroornagar Lake', 'park', 6430, 4682, 30);
  site('karmanghat_hanuman_temple', 'Karmanghat Hanuman Temple', 'temple', 6900, 4482, 40, 40, 34, 'n', 'temple', { gap: 4, r: 20 });
  site('gaddiannaram_fruit_market', 'Gaddiannaram Fruit Market', 'market_hall', 6300, 4462, 140, 70, 16, 'n', 'market', { gap: 16, r: 26, lm: { variant: 'fruit' } });
  park('harina_vanasthali', 'Mahavir Harina Vanasthali', 'rock', [[7420, 5000], [7950, 5000], [7950, 5700], [7450, 5700], [7400, 5300]]);
  place('harina_vanasthali', 'Mahavir Harina Vanasthali (deer park)', 'park', 7440, 5150, 30);

  // L. Off-map west (reached by the Gandipet road / a bus-trip scene)
  place('chilkur_balaji', 'To Chilkur Balaji', 'edge', 40, 3708, 16, { offMap: true });
  place('mrugavani_park', 'To Mrugavani deer park', 'edge', 70, 3730, 16, { offMap: true });
  place('himayat_sagar', 'To Himayat Sagar', 'edge', 100, 3712, 16, { offMap: true });

  // festival anchors (story flags switch the decorations on)
  alias('ganesh_immersion', 'ganesh_immersion_point', 'festival', 'Ganesh Nimajjanam on Tank Bund');
  alias('bonalu', 'ujjaini_mahankali_temple', 'festival', 'Lashkar Bonalu, Ujjaini Mahankali');
  alias('lumbini_boat', 'lumbini_jetty', 'jetty');

  /* ============================================ STORY RECONCILE (story_bible §3.1-§3.2, §12; systems §15 #6) */
  // Owner: world-reconcile agent. New ids the story needs, roof zones, podium junctions.
  KIND.recording_centre = [30, 16, 22, 'video_parlour']; // no cassette-shop art yet: video_parlour + variant
  KIND.electronics_shop = [30, 8, 14, 'video_parlour'];  // a bunk shop in the LB Stadium outer row
  // Café Noor-e-Iran (Faramarz uncle, invented): west of the Charminar–Gulzar Houz road, facing east
  // to the monument; not next to Nimrah Café's door. Teal, bentwood chairs, a storeroom one step down.
  lm('irani_cafe_19', 'Café Noor-e-Iran', 'irani_cafe', 3844, 4196, 30, 32, 24, { face: 'e', sign: 'CAFE NOOR-E-IRAN', variant: 'noor_e_iran', era: 'invented' });
  place('irani_cafe_19', 'Café Noor-e-Iran', 'irani_cafe', 3868, 4206, 18, { story: 'faramarz', std: false });
  alias('cafe_noor_e_iran', 'irani_cafe_19', 'irani_cafe', 'Café Noor-e-Iran (Faramarz uncle)');
  // Raag Recording Centre: "Recording Done Here" cassette shop at the Laad Bazaar mouth (C07, M12)
  S('recording_centre_1', 'recording_centre', 'Raag Recording Centre', 'RAAG RECORDING', 'laad_bazaar', 0.15, 'R', { lm: { variant: 'recording', sign2: 'RECORDING DONE HERE' } });
  // Vijaya TV & Radio: TV in the window, the World Cup final crowd on the footpath (M4)
  lm('electronics_shop_1', 'Vijaya TV & Radio', 'video_parlour', 4004, 2696, 30, 8, 14, { face: 's', sign: 'VIJAYA TV & RADIO', variant: 'tv_radio' });
  place('electronics_shop_1', 'Vijaya TV & Radio', 'electronics_shop', 4004, 2702, 18, { tvCrowd: true });
  // Charminar first gallery: a camera-only viewpoint INSIDE the monument (no walkable floor)
  place('charminar_gallery', 'Charminar first gallery (viewpoint)', 'viewpoint', 3900, 4360, 20, { virtual: true, h: 34, view: true, of: 'charminar' });
  // two more colony grounds (systems §16 lists playground_1..16)
  park('playground_15', 'Erragadda colony ground', 'ground', [2484, 638, 92, 54]);
  lm('playground_kit_15', 'Swings & slide', 'playground_kit', 2562, 650, 18, 10, 14, { pad: 2 });
  place('playground_15', 'Erragadda colony ground', 'playground', 2524, 666, 30);
  park('playground_16', 'KPHB colony ground', 'ground', [1336, 162, 112, 54]);
  lm('playground_kit_16', 'Swings & slide', 'playground_kit', 1436, 172, 18, 10, 14, { pad: 2 });
  place('playground_16', 'KPHB colony ground', 'playground', 1384, 192, 30);
  // coconut palms in colony compounds (registry round 2; Necklace Road has its own avenue)
  for (const [x, y] of [[4556, 2618], [4626, 2614], [4600, 2618], [4784, 2626], [5120, 2585], [5842, 600], [6230, 4160], [6460, 3970],
    [5000, 4390], [1704, 2918], [2412, 740], [3040, 2652]]) tree(x, y, 'coconut');

  // ---- podium junctions: a traffic constable on a painted podium, 08:00-21:00 (systems §4.4, §11)
  for (const id of ['rtc_x_roads', 'abids', 'koti', 'basheerbagh', 'liberty', 'khairatabad', 'lakdikapul', 'panjagutta', 'ameerpet', 'begumpet',
    'ranigunj', 'masab_tank', 'mehdipatnam', 'malakpet', 'dilsukhnagar', 'jubilee_hills', 'tarnaka', 'tolichowki', 'erragadda']) if (PL[id]) PL[id].podium = true;
  PL.rtc_x_roads.podiumHome = 'pochaiah'; // Havaldar Pochaiah's home podium

  /* ============================================ ROOF ZONES (ARCHITECTURE §7 "Roof zones") */
  // Walled terraces the player can walk on (no edges, no falls: parapet all round). Each roof:
  //   {id, name, rect:[x,y,w,d] (footprint), h (floor height), building: landmark id whose top this
  //    is (null = world.js builds a colony house under it), group, tags, solids: [[x,y,w,d]] (blocked
  //    spots on the roof: stair room, tank), stairs: [{place, x, y (ground foot), tx, ty (landing on
  //    the roof), face (wall with the door)}]}
  // planks: {id, a, b (roof ids), rect:[x,y,w,d]} axis-aligned planked gaps with railings.
  // Places on a roof carry `level: <roof id>`; stairs places carry `roof: <roof id>`.
  D.roofs = []; D.planks = [];
  const RF = {};
  function roof(id, name, rect, h, o) {
    const r = Object.assign({ id, name, rect, h, building: null, group: null, tags: [], solids: [], stairs: [] }, o || {});
    D.roofs.push(r); RF[id] = r; return r;
  }
  function stairs(rid, pid, fx, fy, tx, ty, face) {
    const r = RF[rid];
    r.stairs.push({ place: pid, x: fx, y: fy, tx, ty, face });
    place(pid, r.name + ': stairs', 'stairs', fx, fy, 10, { roof: rid });
  }
  const plank = (id, a, b, rect) => D.planks.push({ id, a, b, rect });
  const LOOT = ['colony', 'lootna', 'antenna', 'candles'];
  // Lakshmi Nagar Colony: home + five neighbours = the M1 lootna route (six walled terraces,
  // planks with handrails): home -> t2 -> t3 -> t4 -> t5 -> t6, stairs down at t6 by the street.
  roof('home_terrace', 'Home terrace (Lakshmi Nivas)', [4560, 2628, 40, 34], 22, { building: 'home', group: 'lakshmi_lootna', tags: ['home', 'kites'].concat(LOOT), solids: [[4590, 2652, 8, 8]], order: 1 });
  roof('lakshmi_t2', "Reddy-garu's terrace", [4528, 2628, 24, 36], 20, { group: 'lakshmi_lootna', tags: LOOT, wall: '#e8b4b8', order: 2 });
  roof('lakshmi_t3', "Sharma-ji's terrace", [4532, 2672, 28, 28], 22, { group: 'lakshmi_lootna', tags: LOOT, wall: '#a8d0c8', order: 3 });
  roof('lakshmi_t4', "the Naidus' terrace", [4568, 2672, 24, 28], 25, { group: 'lakshmi_lootna', tags: LOOT, wall: '#f0d890', order: 4 });
  roof('lakshmi_t5', "Pinto aunty's terrace", [4600, 2672, 24, 28], 21, { group: 'lakshmi_lootna', tags: LOOT, wall: '#b8c8e8', order: 5 });
  roof('lakshmi_t6', "the corner house terrace", [4608, 2628, 20, 36], 23, { group: 'lakshmi_lootna', tags: LOOT, wall: '#f2c6a0', order: 6, lootnaEnd: true });
  plank('plank_home_t2', 'home_terrace', 'lakshmi_t2', [4548, 2640, 16, 12]);
  plank('plank_t2_t3', 'lakshmi_t2', 'lakshmi_t3', [4536, 2660, 12, 16]);
  plank('plank_t3_t4', 'lakshmi_t3', 'lakshmi_t4', [4556, 2680, 16, 12]);
  plank('plank_t4_t5', 'lakshmi_t4', 'lakshmi_t5', [4588, 2680, 16, 12]);
  plank('plank_t5_t6', 'lakshmi_t5', 'lakshmi_t6', [4608, 2660, 12, 16]);
  stairs('home_terrace', 'home_stairs', 4604, 2650, 4583, 2655, 'e');
  stairs('lakshmi_t2', 'lakshmi_t2_stairs', 4540, 2622, 4540, 2637, 'n');
  stairs('lakshmi_t3', 'lakshmi_t3_stairs', 4546, 2703, 4546, 2693, 's');
  stairs('lakshmi_t4', 'lakshmi_t4_stairs', 4580, 2703, 4580, 2693, 's');
  stairs('lakshmi_t5', 'lakshmi_t5_stairs', 4612, 2703, 4612, 2693, 's');
  stairs('lakshmi_t6', 'lakshmi_t6_stairs', 4618, 2622, 4618, 2637, 'n');
  // Immu's terrace across the colony ground (M1: "Immu on his own terrace across the ground")
  roof('friend_terrace', "Immu's terrace", [4791, 2637, 34, 30], 22, { building: 'friend_home', group: 'lakshmi_friend', tags: ['friend', 'colony', 'antenna', 'candles'], solids: [[4815, 2657, 8, 8]] });
  stairs('friend_terrace', 'friend_stairs', 4808, 2632, 4806, 2645, 'n');
  // Ashok Nagar (near Cable Babji's kirana_3): antenna-job terraces
  roof('ashok_t1', 'Ashok Nagar terrace (1)', [4700, 2244, 28, 28], 21, { group: 'ashok_nagar', tags: ['colony', 'antenna'], wall: '#d8b0d8' });
  roof('ashok_t2', 'Ashok Nagar terrace (2)', [4736, 2244, 28, 28], 24, { group: 'ashok_nagar', tags: ['colony', 'antenna'], wall: '#c8e0a8' });
  roof('ashok_t3', 'Ashok Nagar terrace (3)', [4736, 2280, 28, 28], 22, { group: 'ashok_nagar', tags: ['colony', 'antenna'], wall: '#f4d0c0' });
  stairs('ashok_t1', 'ashok_t1_stairs', 4696, 2258, 4709, 2258, 'w');
  stairs('ashok_t2', 'ashok_t2_stairs', 4750, 2240, 4750, 2253, 'n');
  stairs('ashok_t3', 'ashok_t3_stairs', 4768, 2294, 4755, 2294, 'e');
  // Patang Chacha's roof by the Char Kaman (bible §9.1: the kite train rises from here)
  roof('patang_chacha_roof', "Patang Chacha's roof", [3984, 4136, 40, 32], 26, { group: 'gulzar_houz', tags: ['ending', 'kites', 'oldcity'], wall: '#e8d9b5', style: 'oldcity' });
  stairs('patang_chacha_roof', 'patang_chacha_stairs', 4016, 4133, 4016, 4147, 'n');
  place('patang_chacha_roof', "Patang Chacha's roof", 'terrace', 4002, 4156, 12, { level: 'patang_chacha_roof' });

  /* ============================================ COMPOUNDS around places of worship & palaces */
  // Paved / garden forecourts so generated houses keep a respectful distance and crowds
  // (Thursday at the Sai Baba temple, Bonalu, Christmas, Friday prayers) have room.
  const LMI = {}; for (const l of D.landmarks) LMI[l.id] = l;
  const compound = (id, pad, kind, extra) => {
    const l = LMI[id]; if (!l) return;
    const e = extra || [0, 0, 0, 0]; // extra [left, top, right, bottom]
    park(id + '_compound', l.name + ' compound', kind || 'plaza',
      [Math.round(l.x - l.w / 2 - pad - e[0]), Math.round(l.y - l.d / 2 - pad - e[1]), Math.round(l.w + pad * 2 + e[0] + e[2]), Math.round(l.d + pad * 2 + e[1] + e[3])]);
  };
  compound('dilsukhnagar_sai_temple', 22, 'plaza', [10, 0, 10, 10]);
  compound('ujjaini_mahankali_temple', 16, 'plaza');
  compound('lal_darwaza_temple', 14, 'plaza');
  compound('temple_1', 10, 'plaza'); compound('temple_2', 10, 'plaza'); compound('temple_3', 14, 'plaza');
  compound('temple_4', 12, 'plaza'); compound('temple_5', 12, 'plaza'); compound('temple_6', 12, 'plaza');
  compound('peddamma_temple', 16, 'plaza'); compound('karmanghat_hanuman_temple', 16, 'plaza'); compound('ashtalakshmi_temple', 16, 'plaza');
  compound('balkampet_yellamma_temple', 12, 'plaza'); compound('akkanna_madanna_temple', 8, 'plaza'); compound('katta_maisamma_temple', 8, 'plaza');
  compound('iskcon_abids', 10, 'plaza'); compound('secunderabad_ganesh_temple', 8, 'plaza');
  compound('spanish_mosque', 16, 'garden'); compound('jama_masjid_charminar', 6, 'plaza'); compound('khairatabad_mosque', 10, 'plaza');
  for (let k = 1; k <= 8; k++) compound('mosque_' + k, 8, 'plaza');
  compound('dargah_yousufain', 10, 'plaza'); compound('hussain_shah_wali_dargah', 14, 'plaza'); compound('moula_ali_dargah', 12, 'plaza');
  compound('church_st_josephs', 14, 'garden'); compound('church_st_marys', 16, 'garden'); compound('church_wesley', 12, 'garden');
  compound('church_1', 12, 'garden'); compound('church_2', 8, 'garden'); compound('st_johns_church_secunderabad', 12, 'garden');
  compound('st_georges_church_abids', 10, 'garden'); compound('holy_trinity_church_bolarum', 14, 'garden');
  compound('gurudwara_gowliguda', 10, 'plaza'); compound('ramakrishna_math', 14, 'garden');
  compound('purani_haveli', 12, 'garden'); compound('king_kothi', 14, 'garden'); compound('errum_manzil', 16, 'garden');
  compound('hill_fort_palace', 10, 'garden'); compound('rashtrapati_nilayam', 18, 'garden'); compound('falaknuma_palace', 16, 'garden');
  compound('chowmahalla_palace', 6, 'garden'); compound('high_court', 8, 'garden'); compound('salar_jung_museum', 6, 'garden');
  compound('osmania_hospital', 8, 'garden'); compound('state_central_library', 8, 'garden'); compound('nizam_college', 14, 'grass');
  compound('city_college', 10, 'grass'); compound('secretariat', 12, 'garden'); compound('kachiguda_station', 10, 'plaza');
  compound('nampally_station', 10, 'plaza'); compound('secunderabad_station', 6, 'plaza');

  /* ============================================ RESPECT ZONES (bible §1.5 rule 3, systems §4.8) */
  // Every temple / mosque / dargah / church / gurudwara / ashurkhana / tomb compound (the
  // `<id>_compound` park, else the footprint + 6 u) plus a 30 u forecourt at its gate (the face
  // side), and Charminar's interior (footprint only). src/seasons.js indexes these (N.respect.at)
  // and adds procession paths at runtime. Zone: {id, name, kind, place, rects: [[x,y,w,h]],
  // polys: [[[x,y]...]], lines: [{pts, r}], forecourt: [[x,y,w,h]], gate: {x, y}}.
  D.respect = [];
  {
    const PK = {}; for (const p of D.parks) PK[p.id] = p;
    const LM = {}; for (const l of D.landmarks) LM[l.id] = l;
    const bb = (poly) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); } return [x0, y0, x1 - x0, y1 - y0]; };
    const RK = { temple: 'temple', mahankali_temple: 'temple', sai_temple: 'temple', birla_mandir: 'temple', khairatabad_ganesh: 'temple',
      mosque: 'mosque', spanish_mosque: 'mosque', mecca_masjid: 'mosque', dargah: 'dargah', church: 'church', gurudwara: 'gurudwara', ashurkhana: 'ashurkhana' };
    const FC = 30; // forecourt depth
    const zone = (id, kind, l, o) => {
      o = o || {};
      const cp = PK[id + '_compound'];
      const core = o.rect || (cp ? bb(cp.poly) : [l.x - l.w / 2 - 6, l.y - l.d / 2 - 6, l.w + 12, l.d + 12]);
      const rects = [core.map(Math.round)].concat(o.rects || []);
      const p = PL[o.place || id];
      const face = o.face || l.face || null;
      const [x, y, w, h] = core;
      let fc = [], gate = p ? { x: p.x, y: p.y } : { x: l.x, y: l.y };
      if (o.forecourt !== false) {
        if (face === 'n') { fc = [[x - 10, y - FC, w + 20, FC]]; gate = { x: x + w / 2, y }; }
        else if (face === 's') { fc = [[x - 10, y + h, w + 20, FC]]; gate = { x: x + w / 2, y: y + h }; }
        else if (face === 'w') { fc = [[x - FC, y - 10, FC, h + 20]]; gate = { x, y: y + h / 2 }; }
        else if (face === 'e') { fc = [[x + w, y - 10, FC, h + 20]]; gate = { x: x + w, y: y + h / 2 }; }
        else fc = [[x - FC, y - FC, w + FC * 2, FC], [x - FC, y + h, w + FC * 2, FC], [x - FC, y, FC, h], [x + w, y, FC, h]];
      }
      D.respect.push({ id, name: o.name || l.name, kind, place: p ? (p.alias || p.id) : null, rects, polys: o.polys || [], lines: o.lines || [], forecourt: fc.map((r) => r.map(Math.round)), gate: { x: Math.round(gate.x), y: Math.round(gate.y) } });
    };
    for (const l of D.landmarks) {
      const k = RK[l.draw];
      if (!k || l.id === 'mecca_masjid' || l.id === 'birla_mandir' || l.id === 'moula_ali_dargah') continue;
      zone(l.id, k, l);
    }
    const mm = LM.mecca_masjid, cy = PK.mecca_masjid_courtyard;
    zone('mecca_masjid', 'mosque', mm, { rects: cy ? [bb(cy.poly)] : [], face: 'e', rect: [mm.x - mm.w / 2 - 4, mm.y - mm.d / 2 - 4, mm.w + 8 + (cy ? bb(cy.poly)[2] : 0), mm.d + 8] });
    const bm = LM.birla_mandir, steps = ROAD.birla_mandir_steps;
    zone('birla_mandir', 'temple', bm, { lines: steps ? [{ pts: steps.pts, r: steps.w / 2 + 4 }] : [] });
    const ma = LM.moula_ali_dargah, hill = PK.moula_ali_hill;
    zone('moula_ali_dargah', 'dargah', ma, { polys: hill ? [hill.poly] : [] }); // no collectible on the hill (bible)
    const ch = LM.charminar;
    zone('charminar', 'charminar', ch, { rect: [ch.x - ch.w / 2, ch.y - ch.d / 2, ch.w, ch.d], forecourt: false, name: "Charminar (interior; the top-floor mosque)" });
    const qs = PK.qutb_shahi_gardens;
    if (qs) zone('qutb_shahi_tombs', 'tomb', { x: 925, y: 2810, w: 330, d: 300, name: 'Qutb Shahi Tombs', face: null }, { rect: bb(qs.poly), forecourt: false });
    if (LM.paigah_tombs) zone('paigah_tombs', 'tomb', LM.paigah_tombs);
  }

  /* ============================================ MISSION GIVER ANCHORS (one per district) */
  // Footpath spots where story NPCs can stand; the story decides who stands where.
  const G2 = (district, name, rid, t, s) => { const p = side(rid, t, s, -4); giver(district, name, p.x, p.y); };
  G2('himayatnagar', 'Himayatnagar: outside Café Gulistan', 'himayatnagar_rd', 0.9, 'R');
  G2('rtc_x', 'RTC X Roads: under the film hoardings', 'indira_park_rd', 0.9, 'L');
  G2('koti', 'Koti: by the bus stand', 'koti_kachiguda_rd', 0.08, 'R');
  G2('abids', 'Abids: GPO corner', 'gunfoundry_rd', 0.12, 'R');
  G2('nampally', 'Nampally: station road', 'nampally_rd', 0.75, 'L');
  G2('basheerbagh', 'Basheerbagh: Cafe Bahar corner', 'basheerbagh_rd', 0.75, 'R');
  G2('hussain_sagar', 'Tank Bund: by the statues', 'tank_bund', 0.5, 'R');
  G2('khairatabad', 'Khairatabad: Ganesh ground', 'khairatabad_rd', 0.2, 'R');
  G2('masab_tank', 'Masab Tank junction', 'mehdipatnam_rd', 0.4, 'L');
  G2('tolichowki', 'Tolichowki: Hotel Sohail', 'old_mumbai_rd', 0.15, 'L');
  G2('golconda', 'Golconda: Fateh Darwaza approach', 'golconda_rd', 0.92, 'L');
  G2('banjara', 'Banjara Hills Road No. 1', 'banjara_rd1', 0.4, 'R');
  G2('jubilee', 'Jubilee Hills Check Post', 'jubilee_rd36', 0.08, 'L');
  G2('hitec', 'Cyber Towers road', 'hitec_rd', 0.62, 'R');
  G2('ameerpet', 'Ameerpet coaching lane', 'ln_srnagar_h1', 0.85, 'R');
  G2('erragadda', 'Erragadda Rythu Bazaar', 'ln_erragadda_h1', 0.2, 'R');
  G2('begumpet', 'Begumpet airport road', 'airport_rd', 0.5, 'L');
  G2('secunderabad', 'Clock Tower road', 'station_rd', 0.35, 'R');
  G2('marredpally', 'Marredpally', 'ln_marredpally_h1', 0.3, 'R');
  G2('musheerabad', 'Musheerabad', 'musheerabad_rd', 0.5, 'L');
  G2('osmania', 'OU Arts College road', 'ou_rd', 0.25, 'R');
  G2('kachiguda', 'Kachiguda station road', 'kachiguda_station_rd', 0.25, 'L');
  G2('amberpet', 'Amberpet', 'amberpet_rd', 0.45, 'R');
  G2('chaderghat', 'Chaderghat: Imlibun gate', 'afzalgunj_rd', 0.85, 'L');
  G2('afzalgunj', 'Afzalgunj: library steps', 'afzalgunj_rd', 0.62, 'L');
  G2('puranapul', 'Purana Pul: Jumerat Bazaar', 'mangalhat_rd', 0.9, 'L');
  G2('charminar', 'Charminar: Laad Bazaar mouth', 'charminar_circle', 0.86, 'L');
  G2('bahadurpura', 'Bahadurpura: zoo road', 'bahadurpura_rd', 0.55, 'L');
  G2('dabeerpura', 'Purani Haveli gate', 'darulshifa_rd', 0.45, 'L');
  G2('falaknuma', 'Falaknuma: palace road', 'shah_ali_banda_rd', 0.9, 'L');
  G2('malakpet', 'Malakpet: Hotel Daulat', 'malakpet_rd', 0.25, 'L');
  G2('dilsukhnagar', 'Dilsukhnagar: Sai Baba temple road', 'malakpet_rd', 0.57, 'L');
  G2('saidabad', 'Saidabad', 'saidabad_rd', 0.6, 'R');
  G2('lb_nagar', 'LB Nagar circle', 'malakpet_rd', 0.83, 'L');
  G2('chandrayangutta', 'Chandrayangutta', 'chandrayangutta_rd', 0.32, 'L');
  G2('langar_houz', 'Langar Houz', 'golconda_rd', 0.6, 'R');

  /* ============================================ HIDDEN SPOTS (collectibles) */
  hide('lumbini_hedge', 'Lumbini Park hedge maze corner', 3812, 2048);
  hide('ntr_lawn', 'NTR Gardens, under the big tree', 3600, 1990);
  hide('sanjeevaiah_bench', 'Sanjeevaiah Park, last bench', 4060, 900);
  hide('indira_rock', 'Indira Park rock garden', 4610, 1700);
  hide('public_gardens_tree', 'Public Gardens, banyan roots', 3625, 2700);
  hide('lb_stand', 'LB Stadium, behind the west stand', 3850, 2520);
  hide('numaish_corner', 'Numaish grounds, behind the giant wheel', 3510, 3005);
  hide('mj_steps', 'Mozamjahi Market back steps', 3890, 3205);
  hide('nayapul_sand', 'Under Naya Pul, on the sand', 3870, 3730);
  hide('puranapul_sand', 'Purana Pul riverbed', 3160, 3850);
  hide('chaderghat_sand', 'Chaderghat riverbed', 4570, 3540);
  hide('charminar_corner', 'Charminar plaza, south-east corner', 4045, 4505);
  hide('gulzar_houz_ledge', 'Gulzar Houz, fountain ledge', 3920, 4142);
  hide('mecca_masjid_pigeons', 'Pigeon square by Mecca Masjid', 3910, 4672);
  hide('chowmahalla_wall', 'Chowmahalla outer wall', 3520, 4600);
  hide('falaknuma_hill', 'Falaknuma hill path', 3700, 5440);
  hide('zoo_pond', 'Nehru Zoo, by the pond', 2560, 4720);
  hide('golconda_bastion', 'Golconda, a quiet bastion', 880, 3480);
  hide('golconda_court', 'Golconda inner court', 1220, 3350);
  hide('tombs_garden', 'Qutb Shahi Tombs garden', 980, 2960);
  hide('durgam_rocks', 'Durgam Cheruvu rocks', 830, 1290);
  hide('kbr_trail', 'KBR Park trail', 1700, 1820);
  hide('banjara_lake', 'Banjara Lake edge', 2480, 1920);
  hide('cyber_fountain', 'Cyber Towers forecourt', 380, 580);
  hide('shilparamam_hut', 'Shilparamam craft hut', 640, 850);
  hide('airport_fence', 'Begumpet airport fence', 3820, 520);
  hide('parade_grounds', 'Parade Grounds, far corner', 4640, 450);
  hide('clock_tower_park', 'Clock Tower park bench', 4915, 830);
  hide('ou_campus', 'OU campus boulder', 6450, 1700);
  hide('nallakunta_ground', 'Nallakunta ground, behind the stumps', 5585, 3015);
  hide('race_course', 'Malakpet race course rail', 5130, 4130);
  hide('saroornagar_lake', 'Saroornagar Lake bank', 6620, 4800);
  hide('mir_alam', 'Mir Alam Tank bank', 2120, 5320);
  hide('moula_ali', 'Moula Ali hill steps', 7350, 820);
  hide('taramati', 'Taramati Baradari steps', 620, 3660);
  hide('gachibowli', 'Gachibowli stadium car park', 520, 1980);
  hide('home_colony_ground', 'Colony ground, under the slide', 4734, 2700);
  hide('ashok_nagar_ground', 'Ashok Nagar ground corner', 4535, 2320);
  hide('vidyanagar_ground', 'Vidyanagar ground corner', 5230, 2680);
  hide('safilguda', 'Safilguda lake bank', 6760, 560);

  /* ============================================ BOULDERS, TREES, SPAWNS */
  D._rockFields = [
    { rect: [0, 0, 1500, 1250], n: 90, rmin: 7, rmax: 22, seed: 1 },          // Madhapur / HITEC scrub
    { rect: [560, 980, 360, 440], n: 40, rmin: 6, rmax: 20, seed: 2 },        // around Durgam Cheruvu
    { rect: [0, 1250, 1700, 900], n: 110, rmin: 6, rmax: 22, seed: 3 },       // Jubilee Hills, Film Nagar
    { rect: [1700, 1250, 1150, 900], n: 55, rmin: 6, rmax: 20, seed: 4 },     // Banjara Hills
    { rect: [1520, 1540, 440, 360], n: 40, rmin: 6, rmax: 18, seed: 5 },      // KBR Park
    { rect: [0, 2150, 1450, 1300], n: 80, rmin: 6, rmax: 22, seed: 6 },       // Golconda
    { rect: [850, 3080, 440, 440], n: 26, rmin: 6, rmax: 16, seed: 7 },       // Golconda hill
    { rect: [1450, 2150, 700, 450], n: 18, rmin: 6, rmax: 16, seed: 8 },      // Tolichowki fringe
    { rect: [0, 3450, 1450, 2550], n: 60, rmin: 7, rmax: 22, seed: 9 },       // Rajendranagar fields
    { rect: [1450, 4800, 1850, 1200], n: 35, rmin: 6, rmax: 18, seed: 10 },   // Mir Alam / zoo fringe
    { rect: [3570, 2130, 290, 230], n: 12, rmin: 5, rmax: 12, seed: 11 },     // Naubat Pahad
    { rect: [3330, 5270, 400, 340], n: 14, rmin: 5, rmax: 14, seed: 12 },     // Falaknuma hill
    { rect: [7290, 630, 300, 240], n: 10, rmin: 5, rmax: 14, seed: 13 },      // Moula Ali hill
    { rect: [6600, 1250, 1400, 1450], n: 35, rmin: 6, rmax: 18, seed: 14 },   // Habsiguda rocks
    { rect: [6600, 0, 1400, 1250], n: 18, rmin: 6, rmax: 16, seed: 15 },      // Malkajgiri
    { rect: [6800, 4400, 1200, 1600], n: 25, rmin: 6, rmax: 16, seed: 16 },   // LB Nagar outskirts
    { rect: [4400, 5300, 1300, 700], n: 18, rmin: 6, rmax: 16, seed: 17 },    // Chandrayangutta hills
  ];
  for (const [x, y, r] of [[6000, 1560, 14], [6080, 1640, 10], [6480, 1560, 16], [6510, 2150, 12], [6050, 2260, 14], [6400, 2280, 9], [5980, 2050, 11]]) rock(x, y, r); // OU campus
  for (const [x, y, r] of [[4620, 1680, 12], [4600, 1720, 8], [4640, 1880, 9]]) rock(x, y, r); // Indira Park rock garden

  // Coconut palms along Necklace Road (both sides), palms in Lumbini / NTR, banyans in old gardens
  D._avenues = [
    { road: 'necklace_rd', kind: 'coconut', every: 46, off: 8 },
    { road: 'tank_bund', kind: 'palm', every: 70, off: 6, sides: [-1] },
    { road: 'ou_rd', kind: 'banyan', every: 80, off: 10 },
    { road: 'secretariat_rd', kind: 'palm', every: 70, off: 8 },
    { road: 'raj_bhavan_rd', kind: 'gulmohar', every: 70, off: 8 },
    { road: 'sp_rd', kind: 'gulmohar', every: 80, off: 8 },
    { road: 'jubilee_rd36', kind: 'palm', every: 80, off: 8 },
    { road: 'banjara_rd1', kind: 'gulmohar', every: 80, off: 8 },
  ];
  for (const [x, y, k, r] of [[3830, 2010, 'palm'], [3935, 2015, 'palm'], [3600, 1960, 'coconut'], [3740, 1995, 'coconut'], [3640, 2690, 'banyan', 20],
    [3790, 2712, 'banyan', 16], [3620, 2530, 'banyan', 18], [4500, 1900, 'banyan', 20], [4560, 2020, 'gulmohar'], [4950, 880, 'banyan', 16],
    [4585, 3360, 'banyan', 18], [4650, 3280, 'gulmohar'], [4662, 2700, 'neem', 12], [4620, 2712, 'neem', 11],
    [6300, 2160, 'banyan', 22], [6150, 1700, 'banyan', 20], [2880, 1812, 'palm'], [2950, 1812, 'palm'],
    [630, 500, 'coconut'], [720, 520, 'coconut'], [2560, 4800, 'banyan', 20], [2700, 4900, 'neem', 14]]) tree(x, y, k, r);

  D.spawns = { player: [4580, 2619], home: [4580, 2619], title: [3900, 4300] };


  /* =================================================== expansion step */
  const tExp0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  // Deterministic 0..1 hash (no Math.random anywhere in this file).
  const hash = (x, y, s) => {
    let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(((y | 0) + 0x9e3779b9) ^ (s | 0), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  const distOf = (x, y) => {
    for (const d of D.districts) { const r = d.rect; if (x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return d.id; }
    return null;
  };
  for (const p of D.places) if (!p.district) p.district = distOf(p.x, p.y);

  // Coarse occupancy raster (8 u) used to scatter boulders and derive building blocks.
  const G = 8, GW = 1000, GH = 750;
  const occ = new Uint8Array(GW * GH); // 0 free, 1 blocked (block filler)
  let T = occ; // raster the mark* helpers write into
  const markThick = (pts, hw) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - hw) / G)), i1 = Math.min(GW - 1, Math.floor((Math.max(a[0], b[0]) + hw) / G));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - hw) / G)), j1 = Math.min(GH - 1, Math.floor((Math.max(a[1], b[1]) + hw) / G));
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * G, py = (j + 0.5) * G;
        let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a[0] + dx * t - px, qy = a[1] + dy * t - py;
        if (qx * qx + qy * qy <= hw * hw) T[j * GW + i] = 1;
      }
    }
  };
  const markPoly = (poly, grow) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    for (let j = Math.max(0, Math.floor((y0 - grow) / G)); j <= Math.min(GH - 1, Math.floor((y1 + grow) / G)); j++) {
      const y = (j + 0.5) * G, xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const ya = poly[a][1], yb = poly[b][1];
        if ((ya > y) !== (yb > y)) xs.push(poly[a][0] + ((y - ya) / (yb - ya)) * (poly[b][0] - poly[a][0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let i = Math.max(0, Math.floor((xs[k] - grow) / G)); i <= Math.min(GW - 1, Math.floor((xs[k + 1] + grow) / G)); i++) T[j * GW + i] = 1;
      }
    }
    if (grow > 0) { const c = poly.concat([poly[0]]); markThick(c, grow); }
  };
  const markRect = (x, y, w, h, m) => {
    for (let j = Math.max(0, Math.floor((y - m) / G)); j <= Math.min(GH - 1, Math.floor((y + h + m - 0.01) / G)); j++)
      for (let i = Math.max(0, Math.floor((x - m) / G)); i <= Math.min(GW - 1, Math.floor((x + w + m - 0.01) / G)); i++) T[j * GW + i] = 1;
  };
  const markCircle = (x, y, r) => markRect(x - r, y - r, r * 2, r * 2, 0);
  const FOOTW = { arterial: 10, street: 7, bund: 9, lane: 0, bridge: 0, path: 0 };
  for (const r of D.roads) markThick(r.pts, r.w / 2 + (FOOTW[r.kind] || 0) + 2);
  for (const r of D.rails) markThick(r.pts, 16);
  for (const w of D.water) markPoly(w.poly, (w.bank || 0) + 4);
  // Simple solid footprints need no reservation: world.js trims lots against SOLID cells and
  // keeps places clear. Walk-through / multi-part landmarks (arches, bus bays, stadium, market
  // sheds) and big set-pieces are reserved in full so no houses grow inside them.
  for (const l of D.landmarks) {
    if (l.noSolid || l.solids || l.w * l.d > 9000 || l.reserve) markRect(l.x - l.w / 2, l.y - l.d / 2, l.w, l.d, l.pad == null ? 4 : l.pad);
  }
  for (const b of D.buildings) markRect(b.rect[0], b.rect[1], b.rect[2], b.rect[3], 3);
  for (const r of D.roofs) if (!r.building) markRect(r.rect[0], r.rect[1], r.rect[2], r.rect[3], 3);
  for (const p of D.places) if (p.kind === 'playground' || p.kind === 'park' || p.kind === 'home' || p.kind === 'terrace') markCircle(p.x, p.y, 12);
  for (const t of D.trees) markCircle(t.x, t.y, 5);
  // strict raster (all footprints + all places) for avenue trees and boulders
  const occR = occ.slice();
  T = occR;
  for (const l of D.landmarks) markRect(l.x - l.w / 2, l.y - l.d / 2, l.w, l.d, 4);
  for (const p of D.places) markCircle(p.x, p.y, 10);
  const markBoth = (fn) => { T = occ; fn(); T = occR; fn(); };

  // Avenue trees: {road, kind, every, off (beyond the footpath), sides?} on free ground only.
  for (const a of D._avenues || []) {
    const r = ROAD[a.road]; if (!r) continue;
    const off = r.w / 2 + (FOOTW[r.kind] || 0) + (a.off || 8);
    for (const sd of a.sides || [-1, 1]) {
      let acc = a.every * 0.5;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const p0 = r.pts[s], p1 = r.pts[s + 1];
        const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, ux = (p1[0] - p0[0]) / L, uy = (p1[1] - p0[1]) / L;
        for (; acc < L; acc += a.every) {
          const x = p0[0] + ux * acc - uy * off * sd, y = p0[1] + uy * acc + ux * off * sd;
          const i = Math.floor(x / G), j = Math.floor(y / G);
          if (i < 1 || j < 1 || i >= GW - 1 || j >= GH - 1) continue;
          if (occR[j * GW + i] || occR[j * GW + i + 1] || occR[j * GW + i - 1] || occR[(j + 1) * GW + i] || occR[(j - 1) * GW + i]) continue;
          tree(Math.round(x), Math.round(y), a.kind, a.kind === 'banyan' ? 16 : a.kind === 'palm' || a.kind === 'coconut' ? 9 : 11);
          markBoth(() => markCircle(x, y, 6));
        }
        acc -= L;
      }
    }
  }
  delete D._avenues;
  markBoth(() => {
    for (const p of D.parks) if (p.kind !== 'rock') markPoly(p.poly, 2);
    for (const n of D.noFill) markRect(n.rect[0], n.rect[1], n.rect[2], n.rect[3], 0);
    if (D.spawns.player) markCircle(D.spawns.player[0], D.spawns.player[1], 24);
  });

  // Boulder fields: {rect, n, rmin, rmax} scattered on free cells (deterministic).
  for (const f of D._rockFields || []) {
    const [x, y, w, h] = f.rect;
    let placed = 0;
    for (let k = 0; k < f.n * 4 && placed < f.n; k++) {
      const cx = x + hash(k, f.seed, 11) * w, cy = y + hash(k, f.seed, 23) * h;
      const r = Math.round(f.rmin + hash(k, f.seed, 37) * (f.rmax - f.rmin));
      const i0 = Math.floor((cx - r - 6) / G), i1 = Math.floor((cx + r + 6) / G), j0 = Math.floor((cy - r - 6) / G), j1 = Math.floor((cy + r + 6) / G);
      let free = i0 >= 0 && j0 >= 0 && i1 < GW && j1 < GH;
      for (let j = j0; free && j <= j1; j++) for (let i = i0; i <= i1; i++) if (occR[j * GW + i]) { free = false; break; }
      if (!free) continue;
      rock(Math.round(cx), Math.round(cy), r);
      markBoth(() => markCircle(cx, cy, r + 4));
      placed++;
      // a balancing companion now and then
      if (hash(k, f.seed, 41) < 0.45) {
        const a = hash(k, f.seed, 43) * 6.283, rr = Math.max(5, Math.round(r * 0.6));
        const bx = cx + Math.cos(a) * (r + rr - 2), by = cy + Math.sin(a) * (r + rr - 2);
        const bi = Math.floor(bx / G), bj = Math.floor(by / G);
        if (bi > 0 && bj > 0 && bi < GW && bj < GH && !occR[bj * GW + bi]) { rock(Math.round(bx), Math.round(by), rr); markBoth(() => markCircle(bx, by, rr + 3)); }
      }
    }
  }
  delete D._rockFields;
  T = occ;
  for (const p of D.parks) if (p.kind === 'rock') markPoly(p.poly, 2);

  // Building blocks: greedy square-ish rectangles of free land inside each district, found on a
  // 16 u raster (2x2 of the 8 u one). world.js splits them into lots, styles them per district
  // and trims anything that touches a road, water or a footprint.
  const C2 = 16, W2 = GW / 2, H2 = GH / 2;
  const occ2 = new Uint8Array(W2 * H2), near = new Uint8Array(W2 * H2);
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
    const o = (j * 2) * GW + i * 2;
    occ2[j * W2 + i] = occ[o] | occ[o + 1] | occ[o + GW] | occ[o + GW + 1];
  }
  // Only build within reach of a street: beyond ~230 u from any road the fringe stays open
  // fields and scrub (the dense core is all within reach anyway).
  const REACH = 230, C3 = 32, W3 = W2 / 2, H3 = Math.ceil(H2 / 2);
  for (const r of D.roads) {
    if (r.kind === 'path') continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - REACH) / C3)), i1 = Math.min(W3 - 1, Math.floor((Math.max(a[0], b[0]) + REACH) / C3));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - REACH) / C3)), j1 = Math.min(H3 - 1, Math.floor((Math.max(a[1], b[1]) + REACH) / C3));
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const o = j * W3 + i; if (near[o]) continue;
        const px = (i + 0.5) * C3, py = (j + 0.5) * C3;
        let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a[0] + dx * t - px, qy = a[1] + dy * t - py;
        if (qx * qx + qy * qy <= REACH * REACH) near[o] = 1;
      }
    }
  }
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) if (!near[(j >> 1) * W3 + (i >> 1)]) occ2[j * W2 + i] = 1;
  const used = new Uint8Array(W2 * H2), used2 = new Uint8Array(W2 * H2);
  for (const d of D.districts) {
    if (!d.fill) continue;
    const [dx, dy, dw, dh] = d.rect;
    const maxC = Math.max(2, Math.round((d.lot[1] * 1.5) / C2)), minC = Math.max(2, Math.ceil(d.lot[0] / C2));
    const i0 = Math.ceil(dx / C2), i1 = Math.min(W2, Math.floor((dx + dw) / C2)), j0 = Math.ceil(dy / C2), j1 = Math.min(H2, Math.floor((dy + dh) / C2));
    // Work tile by tile (tiles of maxC x maxC cells on a global grid) so blocks line up in
    // neat rows instead of pinching each other into strips; inside a tile grow greedily.
    for (let tj = Math.floor(j0 / maxC) * maxC; tj < j1; tj += maxC) {
      for (let ti = Math.floor(i0 / maxC) * maxC; ti < i1; ti += maxC) {
        const ta = Math.max(ti, i0), tb = Math.min(ti + maxC, i1), tc = Math.max(tj, j0), td = Math.min(tj + maxC, j1);
        for (let j = tc; j < td; j++) {
          for (let i = ta; i < tb; i++) {
            const o = j * W2 + i;
            if (occ2[o] || used[o]) continue;
            let fits = i + minC <= tb && j + minC <= td;
            for (let jj = j; fits && jj < j + minC; jj++) for (let ii = i; ii < i + minC; ii++) { const q = jj * W2 + ii; if (occ2[q] || used[q]) { fits = false; break; } }
            if (!fits) { used[o] = 1; continue; }
            let w = minC, h = minC;
            for (;;) {
              let cw = i + w < tb, ch = j + h < td;
              for (let k = 0; cw && k < h; k++) { const q = (j + k) * W2 + i + w; if (occ2[q] || used[q]) cw = false; }
              for (let k = 0; ch && k < w; k++) { const q = (j + h) * W2 + i + k; if (occ2[q] || used[q]) ch = false; }
              if (!cw && !ch) break;
              if (cw && (!ch || w <= h)) w++; else h++;
            }
            for (let jj = j; jj < j + h; jj++) for (let k = 0; k < w; k++) { used[jj * W2 + i + k] = 1; used2[jj * W2 + i + k] = 1; }
            if (hash(i, j, 7) > d.fill) continue; // open plot
            D.blocks.push({ rect: [i * C2, j * C2, w * C2, h * C2], style: d.style, seed: (i * 7349 + j * 131) % 100000 });
          }
        }
      }
    }
  }
  // Second pass: free land the tiles cut too thin (it straddles a tile edge) joins up here.
  for (const d of D.districts) {
    if (!d.fill) continue;
    const [dx, dy, dw, dh] = d.rect;
    const maxC = Math.max(2, Math.round((d.lot[1] * 1.5) / C2)), minC = Math.max(2, Math.ceil(d.lot[0] / C2));
    const i0 = Math.ceil(dx / C2), i1 = Math.min(W2, Math.floor((dx + dw) / C2)), j0 = Math.ceil(dy / C2), j1 = Math.min(H2, Math.floor((dy + dh) / C2));
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const o = j * W2 + i;
        if (occ2[o] || used2[o]) continue;
        let fits = i + minC <= i1 && j + minC <= j1;
        for (let jj = j; fits && jj < j + minC; jj++) for (let ii = i; ii < i + minC; ii++) { const q = jj * W2 + ii; if (occ2[q] || used2[q]) { fits = false; break; } }
        if (!fits) { used2[o] = 1; continue; }
        let w = minC, h = minC;
        for (;;) {
          let cw = i + w < i1 && w < maxC, ch = j + h < j1 && h < maxC;
          for (let k = 0; cw && k < h; k++) { const q = (j + k) * W2 + i + w; if (occ2[q] || used2[q]) cw = false; }
          for (let k = 0; ch && k < w; k++) { const q = (j + h) * W2 + i + k; if (occ2[q] || used2[q]) ch = false; }
          if (!cw && !ch) break;
          if (cw && (!ch || w <= h)) w++; else h++;
        }
        for (let jj = j; jj < j + h; jj++) for (let k = 0; k < w; k++) used2[jj * W2 + i + k] = 1;
        if (hash(i, j, 9) > d.fill) continue;
        D.blocks.push({ rect: [i * C2, j * C2, w * C2, h * C2], style: d.style, seed: (i * 7349 + j * 131 + 7) % 100000 });
      }
    }
  }

  D.meta = { expandMs: Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : 0) - tExp0), blocks: D.blocks.length, rocks: D.rocks.length, trees: D.trees.length };
  if (window.__MAPDEBUG) D._occ = occ;
  N.WORLD_DATA = D;
})();
