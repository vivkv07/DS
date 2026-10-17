/* NOSTALGIA — worlddata.js (PLACEHOLDER MAP)
 * Written by the engine agent so the game runs end to end. The real map is authored
 * from design/map_plan.md by the map agent and REPLACES this file entirely (the real one
 * carries the MAP_PLAN_FINAL marker). Geography is roughly right (Old City south, the
 * Musi, Abids/Koti, Hussain Sagar, Secunderabad north-east, the rocky west) but compressed.
 * Shape of the data: ARCHITECTURE.md §7.
 */
(() => {
  'use strict';
  const N = window.N;

  // Deterministic helpers (data generation only)
  const R = N.util.rng(1999);

  // Build a river polygon from a centreline and width
  function ribbon(pts, w) {
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      left.push([Math.round(p[0] + nx * w / 2), Math.round(p[1] + ny * w / 2)]);
      right.push([Math.round(p[0] - nx * w / 2), Math.round(p[1] - ny * w / 2)]);
    }
    return left.concat(right.reverse());
  }

  // Boulder clusters inside a rect
  function rockField(x, y, w, h, clusters) {
    const out = [];
    for (let c = 0; c < clusters; c++) {
      const cx = x + R.range(0, w), cy = y + R.range(0, h);
      const n = R.int(1, 5);
      for (let i = 0; i < n; i++) {
        const r = R.range(5, i === 0 ? 22 : 13);
        out.push({ x: Math.round(cx + R.range(-28, 28)), y: Math.round(cy + R.range(-28, 28)), r: Math.round(r), h: Math.round(r * R.range(0.9, 1.6)) });
      }
    }
    return out;
  }

  const musi = [[0, 4120], [900, 4160], [1800, 4100], [2700, 4170], [3500, 4140], [4300, 4180], [5100, 4150], [5900, 4200], [6800, 4160], [8000, 4200]];

  N.WORLD_DATA = {
    districts: [
      { id: 'hitec', name: 'HITEC City', nameTe: 'హైటెక్ సిటీ', rect: [0, 0, 2000, 1400], ground: '#b5764f', style: 'hitec' },
      { id: 'banjara', name: 'Banjara Hills', nameTe: 'బంజారా హిల్స్', rect: [0, 1400, 3200, 1400], ground: '#a98263', style: 'posh' },
      { id: 'begumpet', name: 'Begumpet', nameTe: 'బేగంపేట', rect: [2000, 0, 2700, 1250], ground: '#b08d68', style: 'colony' },
      { id: 'secunderabad', name: 'Secunderabad', nameTe: 'సికింద్రాబాద్', rect: [4700, 0, 3300, 1500], ground: '#a39069', style: 'cantonment' },
      { id: 'lake', name: 'Hussain Sagar', nameTe: 'హుస్సేన్ సాగర్', rect: [3200, 1250, 1500, 1450], ground: '#a88f6e', style: 'colonial' },
      { id: 'musheerabad', name: 'Musheerabad', nameTe: 'ముషీరాబాద్', rect: [4700, 1500, 3300, 1250], ground: '#b39272', style: 'colony' },
      { id: 'golconda', name: 'Golconda', nameTe: 'గోల్కొండ', rect: [0, 2800, 2300, 1350], ground: '#a48466', style: 'rocky' },
      { id: 'mehdipatnam', name: 'Mehdipatnam', nameTe: 'మెహదీపట్నం', rect: [2300, 2800, 1300, 1300], ground: '#b08d68', style: 'colony' },
      { id: 'abids', name: 'Abids', nameTe: 'ఆబిడ్స్', rect: [3600, 2750, 1300, 1350], ground: '#ad9070', style: 'colonial' },
      { id: 'koti', name: 'Koti', nameTe: 'కోఠి', rect: [4900, 2750, 1700, 1350], ground: '#b09070', style: 'market' },
      { id: 'dilsukhnagar', name: 'Dilsukhnagar', nameTe: 'దిల్‌సుఖ్‌నగర్', rect: [6600, 2750, 1400, 1400], ground: '#b39272', style: 'colony' },
      { id: 'musi', name: 'Musi River', nameTe: 'మూసీ నది', rect: [0, 4020, 8000, 300], ground: '#b59a74', style: 'colony' },
      { id: 'bahadurpura', name: 'Bahadurpura', nameTe: 'బహదూర్‌పురా', rect: [0, 4250, 2300, 1750], ground: '#ad8a62', style: 'rocky' },
      { id: 'oldcity', name: 'Old City', nameTe: 'పాతబస్తీ', rect: [2300, 4250, 3500, 1750], ground: '#c2a27a', style: 'oldcity' },
      { id: 'charminar', name: 'Charminar', nameTe: 'చార్మినార్', rect: [3700, 4600, 1300, 800], ground: '#c6a77e', style: 'market' },
      { id: 'malakpet', name: 'Malakpet', nameTe: 'మలక్‌పేట', rect: [5800, 4250, 2200, 1750], ground: '#b39272', style: 'colony' },
    ],

    water: [
      { id: 'hussain_sagar', name: 'Hussain Sagar', bank: 10, poly: [[3650, 1400], [3850, 1290], [4200, 1260], [4520, 1320], [4700, 1450], [4740, 1650], [4650, 1900], [4520, 2150], [4380, 2380], [4260, 2520], [4120, 2480], [3950, 2330], [3780, 2150], [3640, 1900], [3580, 1650]] },
      { id: 'musi', name: 'Musi', bank: 46, color: '#3d7a72', poly: ribbon(musi, 84) },
      { id: 'golconda_pond', name: 'Katora Houz', bank: 6, poly: [[1180, 3620], [1300, 3600], [1340, 3700], [1250, 3760], [1160, 3710]] },
    ],

    roads: [
      // arterials
      { id: 'begumpet_rd', name: 'Begumpet Road', kind: 'arterial', w: 58, pts: [[100, 900], [2000, 900], [3300, 950], [4500, 1000], [4900, 1150]] },
      { id: 'sp_rd', name: 'Secunderabad Road', kind: 'arterial', w: 58, pts: [[4800, 1400], [4900, 1150], [5600, 900], [6500, 810], [7900, 800]] },
      { id: 'tank_bund', name: 'Tank Bund', kind: 'bund', w: 46, pts: [[4800, 1400], [4810, 1650], [4720, 1920], [4590, 2180], [4450, 2420], [4330, 2590]] },
      { id: 'mg_rd', name: 'Mehdipatnam–Koti Road', kind: 'arterial', w: 60, pts: [[1200, 2700], [2300, 2750], [3300, 2800], [3700, 2800], [4300, 2790], [5100, 2800], [6000, 2800], [7900, 2800]] },
      { id: 'khairatabad_rd', name: 'Khairatabad Road', kind: 'arterial', w: 54, pts: [[3700, 2800], [3700, 2580], [3300, 2300], [3000, 1900], [2800, 1500], [2700, 900]] },
      { id: 'nayapul_rd', name: 'Abids Road', kind: 'arterial', w: 56, pts: [[4330, 2590], [4300, 2790], [4300, 3400], [4300, 4050]] },
      { id: 'nayapul', name: 'Naya Pul', kind: 'bridge', w: 50, pts: [[4300, 4050], [4300, 4310]] },
      { id: 'pathergatti', name: 'Pathergatti', kind: 'arterial', w: 50, pts: [[4300, 4310], [4300, 4860]] },
      { id: 'hitec_rd', name: 'HITEC Road', kind: 'arterial', w: 52, pts: [[1400, 900], [1100, 1300], [700, 1500]] },
      // streets
      { id: 'necklace_rd', name: 'Necklace Road', kind: 'street', w: 38, pts: [[3700, 2580], [3560, 2200], [3500, 1900], [3520, 1550], [3640, 1300], [3900, 1190], [4300, 1170], [4700, 1250], [4800, 1400]] },
      { id: 'charminar_w', name: 'Charminar Road', kind: 'street', w: 36, pts: [[3300, 4960], [4200, 4960]] },
      { id: 'charminar_e', name: 'Gulzar Houz Road', kind: 'street', w: 36, pts: [[4400, 4960], [5800, 4960], [6600, 4960], [7600, 5200]] },
      { id: 'charminar_s', name: 'Falaknuma Road', kind: 'street', w: 36, pts: [[4300, 5060], [4300, 5950]] },
      { id: 'puranapul_n', name: 'Begum Bazaar Road', kind: 'street', w: 36, pts: [[3300, 2800], [3300, 4040]] },
      { id: 'puranapul', name: 'Purana Pul', kind: 'bridge', w: 34, pts: [[3300, 4040], [3300, 4300]] },
      { id: 'puranapul_s', name: 'Puranapul Road', kind: 'street', w: 36, pts: [[3300, 4300], [3300, 4960]] },
      { id: 'koti_main', name: 'Koti Main Road', kind: 'street', w: 36, pts: [[3700, 3300], [5900, 3300]] },
      { id: 'abids_lane', name: 'Bank Street', kind: 'street', w: 34, pts: [[3700, 3700], [5300, 3700]] },
      { id: 'abids_n', name: 'Nampally Road', kind: 'street', w: 34, pts: [[3700, 2800], [3700, 3700]] },
      { id: 'koti_n', name: 'Sultan Bazaar', kind: 'street', w: 34, pts: [[4800, 2800], [4800, 3700]] },
      { id: 'chaderghat_rd', name: 'Chaderghat Road', kind: 'street', w: 34, pts: [[5300, 2800], [5300, 3990]] },
      { id: 'koti_e', name: 'Kachiguda Road', kind: 'street', w: 34, pts: [[5900, 2800], [5900, 3800]] },
      { id: 'rtc_rd', name: 'RTC X Roads', kind: 'street', w: 38, pts: [[5400, 1000], [5400, 2800]] },
      { id: 'vidyanagar_rd', name: 'Vidyanagar Road', kind: 'street', w: 36, pts: [[4720, 1920], [5400, 1900], [6500, 1900], [7900, 1900]] },
      { id: 'tarnaka_rd', name: 'Tarnaka Road', kind: 'street', w: 36, pts: [[6500, 200], [6500, 810], [6500, 2800]] },
      { id: 'osmania_rd', name: 'Osmania Road', kind: 'street', w: 34, pts: [[7300, 800], [7300, 2800]] },
      { id: 'sec_n', name: 'Paradise Road', kind: 'street', w: 34, pts: [[5600, 900], [5600, 200]] },
      { id: 'sec_e', name: 'MG Road', kind: 'street', w: 34, pts: [[5600, 450], [6500, 450], [7600, 450]] },
      { id: 'begumpet_s1', name: 'Ameerpet Road', kind: 'street', w: 34, pts: [[2600, 300], [2600, 900]] },
      { id: 'begumpet_s2', name: 'Prakash Nagar Road', kind: 'street', w: 34, pts: [[3300, 300], [3300, 950]] },
      { id: 'begumpet_ew', name: 'Airport Road', kind: 'street', w: 34, pts: [[2000, 600], [4400, 600], [4500, 1000]] },
      { id: 'road12', name: 'Road No. 12', kind: 'street', w: 36, pts: [[2900, 1700], [2300, 1500], [1500, 1450], [700, 1500]] },
      { id: 'road36', name: 'Road No. 36', kind: 'street', w: 36, pts: [[2300, 1500], [2100, 2000], [1600, 2400], [1200, 2700]] },
      { id: 'golconda_rd', name: 'Golconda Road', kind: 'street', w: 36, pts: [[1200, 2700], [900, 3000], [800, 3220]] },
      { id: 'tolichowki_rd', name: 'Tolichowki Road', kind: 'street', w: 34, pts: [[1500, 3200], [2300, 3200], [3300, 3200]] },
      { id: 'mehdi_n', name: 'Masab Tank Road', kind: 'street', w: 34, pts: [[2300, 2750], [2300, 3600]] },
      { id: 'zoo_rd', name: 'Zoo Road', kind: 'street', w: 34, pts: [[3300, 4600], [2300, 4600], [1300, 4900]] },
      { id: 'dsnr_n', name: 'Dilsukhnagar Road', kind: 'street', w: 34, pts: [[6600, 2800], [6600, 4000]] },
      { id: 'dsnr_ew', name: 'Malakpet Road', kind: 'street', w: 34, pts: [[6000, 3400], [7900, 3400]] },
      { id: 'malakpet_n', name: 'Saidabad Road', kind: 'street', w: 34, pts: [[6600, 4300], [6600, 4960], [6600, 5800]] },
      // lanes (gallis)
      { id: 'galli_1', name: 'Laad Bazaar', kind: 'lane', w: 18, pts: [[3800, 4960], [3800, 5500], [4200, 5600]] },
      { id: 'galli_2', name: 'Mecca Galli', kind: 'lane', w: 18, pts: [[3600, 4500], [4300, 4500]] },
      { id: 'galli_3', name: 'Gulzar Galli', kind: 'lane', w: 18, pts: [[4300, 4650], [4900, 4650], [4900, 4960]] },
      { id: 'galli_4', name: 'Shah Ali Banda Galli', kind: 'lane', w: 18, pts: [[4300, 5300], [4800, 5300], [5500, 5300]] },
      { id: 'colony_l1', name: 'Street No. 1', kind: 'lane', w: 22, pts: [[5400, 1450], [6500, 1450], [7300, 1450]] },
      { id: 'colony_l2', name: 'Street No. 2', kind: 'lane', w: 22, pts: [[5400, 2350], [6500, 2350], [7300, 2350]] },
      { id: 'colony_l3', name: 'Street No. 3', kind: 'lane', w: 22, pts: [[5950, 1450], [5950, 2350]] },
      { id: 'colony_l4', name: 'Street No. 4', kind: 'lane', w: 22, pts: [[6900, 1900], [6900, 2800]] },
      { id: 'colony_l5', name: 'Street No. 5', kind: 'lane', w: 22, pts: [[5400, 1680], [5950, 1680]] },
      // footpath through the gardens
      { id: 'indira_path', name: 'Indira Park walk', kind: 'path', w: 10, pts: [[4920, 2120], [5100, 2050], [5280, 2150]] },
    ],

    parks: [
      { id: 'indira_park', name: 'Indira Park', kind: 'garden', poly: [[4900, 1960], [5300, 1960], [5300, 2300], [4880, 2300]] },
      { id: 'lumbini_park', name: 'Lumbini Park', kind: 'garden', poly: [[4120, 2560], [4260, 2560], [4270, 2680], [4120, 2680]] },
      { id: 'public_gardens', name: 'Public Gardens', kind: 'garden', poly: [[3800, 2900], [4150, 2900], [4150, 3250], [3800, 3250]] },
      { id: 'lb_stadium', name: 'LB Stadium', kind: 'ground', poly: [[4400, 2880], [4700, 2880], [4700, 3200], [4400, 3200]] },
      { id: 'parade_grounds', name: 'Parade Grounds', kind: 'ground', poly: [[5700, 500], [6400, 500], [6400, 790], [5700, 820]] },
      { id: 'kbr_park', name: 'KBR Park', kind: 'rock', poly: [[1500, 1600], [2000, 1600], [2000, 2000], [1500, 2000]] },
      { id: 'exhibition_grounds', name: 'Exhibition Grounds', kind: 'ground', poly: [[3760, 3350], [4200, 3350], [4200, 3640], [3760, 3640]] },
      { id: 'zoo', name: 'Nehru Zoological Park', kind: 'garden', poly: [[1200, 5000], [2200, 5000], [2200, 5600], [1200, 5600]] },
      { id: 'golconda_ground', name: 'Golconda', kind: 'rock', poly: [[300, 3050], [1400, 3050], [1450, 3900], [250, 3900]] },
      { id: 'playground_1', name: 'Colony Ground', kind: 'ground', poly: [[5990, 1990], [6200, 1990], [6200, 2160], [5990, 2160]] },
      { id: 'airport', name: 'Begumpet Airport', kind: 'plaza', poly: [[2100, 110], [3900, 110], [3900, 230], [2100, 230]] },
      { id: 'birla_hill', name: 'Naubat Pahad', kind: 'rock', poly: [[3820, 2600], [4080, 2600], [4080, 2760], [3820, 2760]] },
    ],

    rocks: [].concat(
      rockField(200, 1420, 2900, 1300, 70),
      rockField(100, 2900, 2100, 1100, 55),
      rockField(100, 100, 1800, 1250, 30),
      rockField(250, 4350, 1900, 1500, 30),
      rockField(3850, 2610, 220, 140, 5),
    ),

    blocks: [
      { rect: [3700, 4600, 1300, 800], style: 'market', seed: 11 },
      { rect: [4900, 2750, 1700, 1300], style: 'market', seed: 12 },
      { rect: [0, 0, 2000, 1400], style: 'hitec', seed: 13 },
      { rect: [0, 1400, 3200, 1400], style: 'posh', seed: 14 },
      { rect: [2000, 0, 2700, 1250], style: 'colony', seed: 15 },
      { rect: [4700, 0, 3300, 1500], style: 'cantonment', seed: 16 },
      { rect: [3200, 1250, 1500, 1450], style: 'colonial', seed: 17 },
      { rect: [4700, 1500, 3300, 1250], style: 'colony', seed: 18 },
      { rect: [0, 2800, 2300, 1300], style: 'rocky', seed: 19 },
      { rect: [2300, 2800, 1300, 1250], style: 'colony', seed: 20 },
      { rect: [3600, 2750, 1300, 1300], style: 'colonial', seed: 21 },
      { rect: [6600, 2750, 1400, 1300], style: 'colony', seed: 22 },
      { rect: [2300, 4250, 3500, 1750], style: 'oldcity', seed: 23 },
      { rect: [5800, 4250, 2200, 1750], style: 'colony', seed: 24 },
      { rect: [0, 4250, 2300, 1750], style: 'rocky', seed: 25 },
    ],

    buildings: [
      { id: 'irani_cafe_1_bldg', rect: [5424, 1924, 44, 36], h: 20, style: 'market', sign: { text: 'NEW GRAND CAFE', color: '#2a8c82' } },
      { id: 'kirana_1_bldg', rect: [5640, 1560, 30, 26], h: 10, style: 'market', sign: { text: 'SRI SAI KIRANA', color: '#d8402a' } },
    ],

    landmarks: [
      { id: 'charminar', name: 'Charminar', x: 4300, y: 4960, w: 60, d: 60, h: 56, draw: 'charminar', plaza: 100 },
      { id: 'buddha_statue', name: 'Buddha Statue', x: 4060, y: 2150, w: 14, d: 14, h: 52, draw: 'buddha', plaza: 34 },
      { id: 'golconda', name: 'Golconda Fort', x: 700, y: 3420, w: 320, d: 260, h: 40, draw: 'golconda' },
      { id: 'cyber_towers', name: 'Cyber Towers', x: 750, y: 1200, w: 90, d: 70, h: 110, draw: 'cybertowers' },
      { id: 'clock_tower', name: 'Secunderabad Clock Tower', x: 6200, y: 1000, w: 16, d: 16, h: 45, draw: 'clocktower', plaza: 30 },
      { id: 'birla_mandir', name: 'Birla Mandir', x: 3950, y: 2680, w: 50, d: 40, h: 30, draw: 'birlamandir', plaza: 40 },
    ],

    trees: [
      { x: 4980, y: 2000, r: 18, kind: 'banyan' },
      { x: 5200, y: 2250, r: 14, kind: 'gulmohar' },
      { x: 5680, y: 1650, r: 13, kind: 'neem' },
    ],

    places: [
      { id: 'home', name: 'Home (Musheerabad colony)', x: 5700, y: 1700, r: 26, district: 'musheerabad', kind: 'home' },
      { id: 'irani_cafe_1', name: 'New Grand Cafe', x: 5446, y: 1975, r: 20, district: 'musheerabad', kind: 'shop' },
      { id: 'kirana_1', name: 'Sri Sai Kirana', x: 5655, y: 1600, r: 16, district: 'musheerabad', kind: 'shop' },
      { id: 'rtc_x_roads', name: 'RTC X Roads', x: 5400, y: 1900, r: 40, district: 'musheerabad', kind: 'junction' },
      { id: 'playground_1', name: 'Colony Ground', x: 6095, y: 2075, r: 40, district: 'musheerabad', kind: 'playground' },
      { id: 'tank_bund', name: 'Tank Bund', x: 4720, y: 1920, r: 40, district: 'lake', kind: 'landmark' },
      { id: 'buddha_statue', name: 'Buddha Statue', x: 4060, y: 2185, r: 20, district: 'lake', kind: 'landmark' },
      { id: 'hussain_sagar', name: 'Hussain Sagar', x: 4150, y: 1800, r: 200, district: 'lake', kind: 'landmark' },
      { id: 'lumbini_park', name: 'Lumbini Park', x: 4195, y: 2620, r: 40, district: 'lake', kind: 'park' },
      { id: 'birla_mandir', name: 'Birla Mandir', x: 3950, y: 2620, r: 30, district: 'lake', kind: 'landmark' },
      { id: 'public_gardens', name: 'Public Gardens', x: 3975, y: 3075, r: 60, district: 'abids', kind: 'park' },
      { id: 'lb_stadium', name: 'LB Stadium', x: 4550, y: 3040, r: 60, district: 'abids', kind: 'landmark' },
      { id: 'exhibition_grounds', name: 'Numaish', x: 3980, y: 3500, r: 80, district: 'abids', kind: 'landmark' },
      { id: 'koti_bus_stand', name: 'Koti Bus Stand', x: 5300, y: 3300, r: 40, district: 'koti', kind: 'landmark' },
      { id: 'gokul_chat', name: 'Gokul Chat', x: 5100, y: 3330, r: 20, district: 'koti', kind: 'shop' },
      { id: 'charminar', name: 'Charminar', x: 4300, y: 4880, r: 40, district: 'charminar', kind: 'landmark' },
      { id: 'golconda', name: 'Golconda Fort', x: 820, y: 3240, r: 40, district: 'golconda', kind: 'landmark' },
      { id: 'cyber_towers', name: 'Cyber Towers', x: 750, y: 1290, r: 40, district: 'hitec', kind: 'landmark' },
      { id: 'clock_tower', name: 'Clock Tower', x: 6200, y: 960, r: 30, district: 'secunderabad', kind: 'landmark' },
      { id: 'parade_grounds', name: 'Parade Grounds', x: 6050, y: 650, r: 80, district: 'secunderabad', kind: 'park' },
      { id: 'zoo', name: 'Nehru Zoo Park', x: 1700, y: 5300, r: 80, district: 'bahadurpura', kind: 'park' },
      { id: 'nayapul', name: 'Naya Pul', x: 4300, y: 4180, r: 30, district: 'musi', kind: 'bridge' },
    ],

    spawns: { player: [5700, 1712], home: [5700, 1700] },
  };
})();
