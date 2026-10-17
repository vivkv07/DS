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
 * (no Math.random, no DOM) snaps road junctions (shared vertices for the road graph),
 * fills in each place's district, plants avenue trees, scatters Deccan boulders and
 * derives blocks[] from the free land between roads. Same input -> same output.
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
  district('hitec', 'Madhapur & HITEC City', 'మాదాపూర్ & హైటెక్ సిటీ', 0, 0, 1500, 1250, 'hitec', '#b39b74', 0.10, [40, 140]);
  district('erragadda', 'Erragadda & Sanathnagar', 'ఎర్రగడ్డ', 1500, 0, 2650, 760, 'colony', '#ad9670', 0.62);
  district('begumpet', 'Begumpet', 'బేగంపేట', 2650, 0, 4300, 760, 'posh', '#a39b72', 0.45, [36, 130]);
  district('secunderabad', 'Secunderabad', 'సికింద్రాబాద్', 4300, 0, 5700, 1250, 'cantonment', '#a49d74', 0.62, [30, 120]);
  district('marredpally', 'Marredpally & Malkajgiri', 'మారేడ్‌పల్లి', 5700, 0, 8000, 1250, 'cantonment', '#a19c70', 0.40, [36, 120]);
  district('ameerpet', 'Ameerpet & SR Nagar', 'అమీర్‌పేట', 1500, 760, 3300, 1250, 'colony', '#ac9670', 0.66);
  district('hussain_sagar', 'Hussain Sagar & Necklace Road', 'హుస్సేన్ సాగర్', 3300, 760, 4300, 2080, 'colonial', '#9fa071', 0.30, [36, 120]);
  district('jubilee', 'Jubilee Hills & Film Nagar', 'జూబ్లీ హిల్స్', 0, 1250, 1700, 2150, 'rocky', '#a8936f', 0.22, [40, 150]);
  district('banjara', 'Banjara Hills', 'బంజారా హిల్స్', 1700, 1250, 2850, 2150, 'posh', '#a19970', 0.34, [40, 150]);
  district('khairatabad', 'Panjagutta & Khairatabad', 'ఖైరతాబాద్', 2850, 1250, 3300, 2150, 'colony', '#ab9670', 0.66);
  district('musheerabad', 'Musheerabad & Indira Park', 'ముషీరాబాద్', 4300, 1250, 5300, 2080, 'colony', '#ab9670', 0.64);
  district('osmania', 'Osmania University & Tarnaka', 'ఉస్మానియా యూనివర్సిటీ', 5300, 1250, 8000, 2700, 'rocky', '#a59a6e', 0.30, [36, 130]);
  district('golconda', 'Golconda & Qutb Shahi Tombs', 'గోల్కొండ', 0, 2150, 1450, 3450, 'rocky', '#b0946c', 0.18, [32, 110]);
  district('tolichowki', 'Tolichowki & Mehdipatnam', 'టోలిచౌకి & మెహదీపట్నం', 1450, 2150, 2600, 3300, 'colony', '#ae966f', 0.60);
  district('masab_tank', 'Masab Tank & Lakdikapul', 'మాసాబ్ ట్యాంక్', 2600, 2150, 3300, 3350, 'colony', '#ac9670', 0.68);
  district('basheerbagh', 'Public Gardens & Basheerbagh', 'బషీర్‌బాగ్', 3300, 2080, 4080, 2760, 'colonial', '#a49c72', 0.55);
  district('himayatnagar', 'Himayatnagar & Narayanguda', 'హిమాయత్‌నగర్', 4080, 2080, 4760, 2760, 'colony', '#ad9771', 0.72);
  district('rtc_x', 'RTC X Roads & Chikkadpally', 'ఆర్టీసీ క్రాస్ రోడ్స్', 4760, 2080, 5300, 2760, 'market', '#b09a7a', 0.74);
  district('nampally', 'Nampally & Mozamjahi Market', 'నాంపల్లి', 3300, 2760, 3880, 3350, 'market', '#b19a7c', 0.76);
  district('abids', 'Abids', 'ఆబిడ్స్', 3880, 2760, 4200, 3350, 'market', '#b29b7e', 0.80);
  district('koti', 'Koti & Sultan Bazaar', 'కోఠి', 4200, 2760, 4700, 3350, 'market', '#b39b7d', 0.80);
  district('kachiguda', 'Kachiguda & Barkatpura', 'కాచిగూడ', 4700, 2760, 5300, 3350, 'colony', '#ad9771', 0.70);
  district('amberpet', 'Amberpet & Nallakunta', 'అంబర్‌పేట', 5300, 2700, 8000, 3350, 'colony', '#ab9670', 0.50);
  district('langar_houz', 'Langar Houz & Attapur', 'లంగర్ హౌస్', 1450, 3300, 2600, 4800, 'colony', '#ae956c', 0.40);
  district('puranapul', 'Puranapul & Dhoolpet', 'పురానాపూల్', 2600, 3350, 3550, 3950, 'oldcity', '#b5a081', 0.74);
  district('afzalgunj', 'Afzalgunj & the Musi', 'అఫ్జల్‌గంజ్', 3550, 3350, 4150, 3950, 'colonial', '#b19d7e', 0.70);
  district('chaderghat', 'Chaderghat & Imlibun', 'చాదర్‌ఘాట్', 4150, 3350, 4800, 3950, 'market', '#b09a7b', 0.72);
  district('malakpet', 'Malakpet', 'మలక్‌పేట', 4800, 3350, 5700, 4300, 'colony', '#ad9771', 0.64);
  district('dilsukhnagar', 'Dilsukhnagar & Kothapet', 'దిల్‌సుఖ్‌నగర్', 5700, 3350, 7000, 4400, 'colony', '#ae9771', 0.64);
  district('lb_nagar', 'LB Nagar & Nagole', 'ఎల్బీ నగర్', 7000, 3350, 8000, 6000, 'colony', '#ad966e', 0.34);
  district('charminar', 'Charminar', 'చార్మినార్', 3550, 3950, 4250, 4800, 'oldcity', '#b8a384', 0.88, [22, 90]);
  district('bahadurpura', 'Bahadurpura & Hussaini Alam', 'బహదూర్‌పురా', 2600, 3950, 3550, 4800, 'oldcity', '#b5a082', 0.70, [24, 100]);
  district('dabeerpura', 'Purani Haveli & Dabeerpura', 'దబీర్‌పురా', 4250, 3950, 4800, 4800, 'oldcity', '#b6a183', 0.78, [24, 100]);
  district('saidabad', 'Saidabad', 'సైదాబాద్', 4800, 4300, 5700, 4800, 'colony', '#ad966f', 0.55);
  district('rajendranagar', 'Rajendranagar Fields', 'రాజేంద్రనగర్', 0, 3450, 1450, 6000, 'rocky', '#ad9468', 0.08, [40, 120]);
  district('zoo', 'Nehru Zoo & Mir Alam Tank', 'మీర్ ఆలం', 1450, 4800, 3300, 6000, 'rocky', '#a99a6c', 0.12);
  district('falaknuma', 'Falaknuma', 'ఫలక్‌నుమా', 3300, 4800, 4400, 6000, 'oldcity', '#b39c7c', 0.50, [26, 100]);
  district('chandrayangutta', 'Chandrayangutta & Santoshnagar', 'చాంద్రాయణగుట్ట', 4400, 4800, 5700, 6000, 'colony', '#ae956d', 0.40);
  district('saroornagar', 'Saroornagar', 'సరూర్‌నగర్', 5700, 4400, 7000, 6000, 'colony', '#ad966e', 0.40);

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
  water('hussain_sagar', 'Hussain Sagar', LAKE.concat([[3880, 1990], [BUDDHA[0], BUDDHA[1] + 34]], circ(BUDDHA[0], BUDDHA[1], 34, 20, true), [[BUDDHA[0], BUDDHA[1] + 34]]), { bank: 4, color: '#2f7f86' });
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
    JUBILEE_CP: [1430, 1300], MADHAPUR: [850, 950], CYBER_JN: [470, 610], RAIDURG: [850, 1950],
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
  road('falaknuma_rd', 'Falaknuma Road', ST, 36, [[3700, 5260], [3655, 5330]]);
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
  road('gowliguda_rd', 'Gowliguda Road', ST, 36, [J.KOTI, [4332, 3330], [4332, 3405]]);
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
  road('naubat_pahad_rd', 'Naubat Pahad Road', LN, 22, [[3560, 2392], [3575, 2330], [3610, 2290]]);
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
  road('begumpet_ameerpet_rd', 'Ameerpet Road', ST, 40, [J.BEGUMPET, [3000, 780], [2850, 880], J.AMEERPET]);
  road('airport_rd', 'Airport Road', ST, 40, [J.BEGUMPET, [3400, 570], [3480, 532]]);
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
  road('golconda_rd', 'Golconda Fort Road', ST, 40, [J.MEHDIPATNAM, [1950, 3080], J.LANGAR_HOUZ, [1420, 3300], [1335, 3300]]);
  road('tombs_rd', 'Seven Tombs Road', ST, 36, [J.TOLICHOWKI, [1300, 2640], [1120, 2690], [1000, 2860], [990, 3010]]);
  road('gandipet_rd', 'Gandipet Road', ST, 40, [J.LANGAR_HOUZ, [1350, 3620], [900, 3690], [400, 3710], [-40, 3720]]);
  road('raidurg_rd', 'Raidurg Road', ST, 40, [J.RAIDURG, [900, 1500], [880, 1200], J.MADHAPUR]);
  road('hitec_rd', 'HITEC City Road', A, 56, [J.MADHAPUR, [640, 760], J.CYBER_JN, [300, 500], [-40, 360]]);
  road('hitec_n_rd', 'Kondapur Road', ST, 40, [J.CYBER_JN, [480, 300], [500, -40]]);

  // --- East: Malakpet, Dilsukhnagar, LB Nagar, OU, Tarnaka, Uppal
  road('malakpet_rd', 'Malakpet Road', A, 56, [J.CHADERGHAT_S, [4700, 3780], J.MALAKPET, [5400, 3882], [5580, 3898], [5800, 3905], J.DILSUKHNAGAR, J.KOTHAPET, J.LB_NAGAR, [7600, 4650], [8060, 4900]]);
  road('ou_rd', 'Osmania University Road', ST, 40, [[5850, 2300], [6100, 2080], [6260, 2050], [6350, 1800], [6400, 1500], J.TARNAKA], { trees: 'neem' });
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
  rail('rail_wadi', 'Secunderabad–Wadi line', [[3720, 840], [3500, 790], [3330, 760], [3000, 740], [2700, 700], [2200, 640], [1700, 560], [1100, 400], [500, 250], [-40, 180]]);
  rail('rail_bolarum', 'Bolarum line', [[5360, 960], [5440, 900], [5500, 600], [5540, 200], [5550, -40]]);
  rail('rail_kazipet', 'Kazipet line', [[5360, 960], [5600, 880], [6200, 760], [7000, 620], [8060, 450]]);
  rail('rail_kachiguda', 'Secunderabad–Kachiguda line', [[5360, 984], [5420, 1000], [5600, 1200], [5720, 1330], [5950, 1600], [6120, 1860], [6000, 2150], [5650, 2400],
    [5420, 2600], [5150, 2780], [5052, 2950], [5050, 3200], [4980, 3450], [4900, 3620], [4870, 3800], [4800, 3960], [4620, 4100], [4560, 4500], [4480, 4900],
    [4300, 5150], [4150, 5350], [4000, 5700], [3950, 6040]]);

  //@@SECTIONS@@

  /* =================================================== expansion step */
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
  const occ = new Uint8Array(GW * GH); // 0 free, 1 blocked
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
        if (qx * qx + qy * qy <= hw * hw) occ[j * GW + i] = 1;
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
        for (let i = Math.max(0, Math.floor((xs[k] - grow) / G)); i <= Math.min(GW - 1, Math.floor((xs[k + 1] + grow) / G)); i++) occ[j * GW + i] = 1;
      }
    }
    if (grow > 0) { const c = poly.concat([poly[0]]); markThick(c, grow); }
  };
  const markRect = (x, y, w, h, m) => {
    for (let j = Math.max(0, Math.floor((y - m) / G)); j <= Math.min(GH - 1, Math.floor((y + h + m - 0.01) / G)); j++)
      for (let i = Math.max(0, Math.floor((x - m) / G)); i <= Math.min(GW - 1, Math.floor((x + w + m - 0.01) / G)); i++) occ[j * GW + i] = 1;
  };
  const markCircle = (x, y, r) => markRect(x - r, y - r, r * 2, r * 2, 0);
  const FOOTW = { arterial: 10, street: 7, bund: 9, lane: 0, bridge: 0, path: 0 };
  for (const r of D.roads) markThick(r.pts, r.w / 2 + (FOOTW[r.kind] || 0) + 3);
  for (const r of D.rails) markThick(r.pts, 16);
  for (const w of D.water) markPoly(w.poly, (w.bank || 0) + 4);
  for (const p of D.parks) markPoly(p.poly, 2);
  for (const l of D.landmarks) markRect(l.x - l.w / 2, l.y - l.d / 2, l.w, l.d, l.pad == null ? 6 : l.pad);
  for (const b of D.buildings) markRect(b.rect[0], b.rect[1], b.rect[2], b.rect[3], 3);
  for (const p of D.places) markCircle(p.x, p.y, Math.min(30, Math.max(12, (p.r || 20) * 0.6)));
  for (const n of D.noFill) markRect(n.rect[0], n.rect[1], n.rect[2], n.rect[3], 0);
  if (D.spawns.player) markCircle(D.spawns.player[0], D.spawns.player[1], 24);

  // Boulder fields: {rect, n, rmin, rmax} scattered on free cells (deterministic).
  for (const f of D._rockFields || []) {
    const [x, y, w, h] = f.rect;
    let placed = 0;
    for (let k = 0; k < f.n * 4 && placed < f.n; k++) {
      const cx = x + hash(k, f.seed, 11) * w, cy = y + hash(k, f.seed, 23) * h;
      const r = Math.round(f.rmin + hash(k, f.seed, 37) * (f.rmax - f.rmin));
      const i0 = Math.floor((cx - r - 6) / G), i1 = Math.floor((cx + r + 6) / G), j0 = Math.floor((cy - r - 6) / G), j1 = Math.floor((cy + r + 6) / G);
      let free = i0 >= 0 && j0 >= 0 && i1 < GW && j1 < GH;
      for (let j = j0; free && j <= j1; j++) for (let i = i0; i <= i1; i++) if (occ[j * GW + i]) { free = false; break; }
      if (!free) continue;
      rock(Math.round(cx), Math.round(cy), r);
      markCircle(cx, cy, r + 4);
      placed++;
      // a balancing companion now and then
      if (hash(k, f.seed, 41) < 0.45) {
        const a = hash(k, f.seed, 43) * 6.283, rr = Math.max(5, Math.round(r * 0.6));
        const bx = cx + Math.cos(a) * (r + rr - 2), by = cy + Math.sin(a) * (r + rr - 2);
        const bi = Math.floor(bx / G), bj = Math.floor(by / G);
        if (bi > 0 && bj > 0 && bi < GW && bj < GH && !occ[bj * GW + bi]) { rock(Math.round(bx), Math.round(by), rr); markCircle(bx, by, rr + 3); }
      }
    }
  }
  delete D._rockFields;

  // Building blocks: greedy rectangles of free land inside each district (world.js splits
  // them into lots, styles them per district and trims anything that touches a road).
  const used = new Uint8Array(GW * GH);
  for (const d of D.districts) {
    if (!d.fill) continue;
    const [dx, dy, dw, dh] = d.rect;
    const maxC = Math.round((d.lot[1] * 2.2) / G), minC = Math.max(2, Math.round(d.lot[0] / G));
    const i0 = Math.floor(dx / G), i1 = Math.min(GW, Math.floor((dx + dw) / G)), j0 = Math.floor(dy / G), j1 = Math.min(GH, Math.floor((dy + dh) / G));
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const o = j * GW + i;
        if (occ[o] || used[o]) continue;
        // grow a square-ish rectangle: add a column or a row (whichever side is shorter)
        let w = 1, h = 1;
        const colFree = () => { if (i + w >= i1 || w >= maxC) return false; for (let k = 0; k < h; k++) { const q = (j + k) * GW + i + w; if (occ[q] || used[q]) return false; } return true; };
        const rowFree = () => { if (j + h >= j1 || h >= maxC) return false; for (let k = 0; k < w; k++) { const q = (j + h) * GW + i + k; if (occ[q] || used[q]) return false; } return true; };
        for (;;) {
          const cw = colFree(), ch = rowFree();
          if (!cw && !ch) break;
          if (cw && (!ch || w <= h)) w++; else h++;
        }
        for (let jj = j; jj < j + h; jj++) for (let k = 0; k < w; k++) used[jj * GW + i + k] = 1;
        if (w < minC || h < minC) continue;
        if (hash(i, j, 7) > d.fill) continue; // open plot
        D.blocks.push({ rect: [i * G, j * G, w * G, h * G], style: d.style, seed: (i * 7349 + j * 131) % 100000 });
      }
    }
  }

  N.WORLD_DATA = D;
})();
