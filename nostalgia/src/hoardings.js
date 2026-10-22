/* NOSTALGIA — hoardings.js  (N.hoardings: advertisement hoardings in the busy centres, 2003)
 *
 * Hyderabad's junctions in 2003 were walled with hoardings: cola bottles sweating in the sun, soap and
 * washing-powder boards, tea, biscuits, the new 100 cc bikes, prepaid mobiles ("Incoming FREE!", new that
 * year), and hand-painted film boards for the Friday releases. This module puts them in the busy centres:
 *   - standalone roadside billboards on two lattice legs at the corners of each centre's junction, facing
 *     the road (some double-sided);
 *   - rooftop hoardings on the road-facing flat roofs round it.
 * Every brand, slogan and film is invented (bible rule: no real brands); a few boards advertise the game's own
 * fictional world (Professor Pasha's Khazana Hunt on Channel Seven, Deccan Vani 101.2, Pop Patang 104.8).
 * Film boards use places_art's hand-painted film painter (N.placesArt.filmBoard) and its fictional titles.
 *
 * Art: one poster atlas (canvas, 4 x 8 cells of 384 x 192 px) painted once, procedurally (gradient, a product
 * drawing, the brand, the slogan, a price burst), repainted once the web fonts arrive. 2D draws its cells; 3D
 * uses it as one texture (one material, floodlit at night through a 3D layer).
 *
 * Deterministic: the boards, their places and their ads come from N.util.rng seeds of the centre / building.
 *
 * Hooks (no core file is edited):
 *  - 'world:built' (after src/ameerpet.js, whose dressed buildings are left alone): placement + one
 *    N.world.addStructure({t: 'custom', draw, build3d}) per hoarding.
 *  - system 'hoardings' (draw(): 2D cast shadows + night floodlights of the boards in view).
 *  - 3D: custom structures with `build3d` are built through src/ameerpet.js's N.view3d.registerStructure('custom')
 *    dispatcher (registered here only when that module is absent). Legs and frames go in the chunk's facade
 *    mesh, posters in one atlas mesh per chunk. Layer 'hoardings3d' lights the posters at night.
 *
 * API  N.hoardings = {ADS, FILMS(), CENTRES, TUNE, list (structures), stats() -> {billboards, rooftop, centres,
 *   ads: {id: n}}, atlas() -> {canvas, cells}, cellOf(id)}
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================ the ads (fictional, 2003) */
  // c: background gradient, fg: brand colour, art: product drawing, a: its colours, sub: the small line over the brand
  const ADS = [
    { id: 'chill_cola', brand: 'CHILL COLA', line: 'Ek ghoont, garmi gayab!', price: 'Rs 7', c: ['#d8102e', '#6a0614'], fg: '#ffffff', art: 'bottle', a: ['#3a0a0a', '#ffffff'] },
    { id: 'lemojo', brand: 'LEMOJO', sub: 'CLEAR LEMON SODA', line: 'Nimbu ka josh!', price: 'Rs 6', c: ['#e8e43a', '#1f8a30'], fg: '#ffffff', art: 'bottle', a: ['#c8f0a8', '#2f8a3a'] },
    { id: 'mango_masti', brand: 'MANGO MASTI', sub: 'NOW IN A BOTTLE', line: 'Aam ka asli maza', c: ['#ffb020', '#e8600a'], fg: '#ffffff', art: 'bottle', a: ['#ffc040', '#2f8a3a'] },
    { id: 'chandana', brand: 'CHANDANA', sub: 'SANDAL SOAP', line: 'Asli chandan ki khushboo', c: ['#f6e6c0', '#c8903a'], fg: '#6a3a14', art: 'soap', a: ['#e8b878', '#8a4a1a'] },
    { id: 'neem_guard', brand: 'NEEM GUARD', sub: 'SOAP', line: 'Poore parivar ki suraksha', c: ['#2f9a40', '#0c4424'], fg: '#ffffff', art: 'soap', a: ['#8ad870', '#1a5a2a'] },
    { id: 'gulaab', brand: 'GULAAB', sub: 'BEAUTY SOAP', line: 'Gulaab jaisi komal twacha', c: ['#fbb8d0', '#c8306a'], fg: '#ffffff', art: 'soap', a: ['#ff8ab8', '#ffffff'] },
    { id: 'safedi', brand: 'SAFEDI', sub: 'WASHING POWDER', line: 'Dhoop jaisi safedi!', price: 'Rs 10', c: ['#2a62e0', '#0a2470'], fg: '#ffffff', art: 'box', a: ['#ffffff', '#2a5cd8'] },
    { id: 'dantmani', brand: 'DANTMANI', sub: 'TOOTHPASTE', line: 'Dant majboot, muskaan pakki', c: ['#ffffff', '#d8e4f0'], fg: '#c8202a', art: 'tube', a: ['#1a4ab8', '#c8202a'] },
    { id: 'chai_bahar', brand: 'CHAI BAHAR', sub: 'TEA', line: 'Kadak chai, kadak din', c: ['#8a2010', '#300804'], fg: '#f2c230', art: 'cup', a: ['#f4f0e8', '#b8702a'] },
    { id: 'gluco_bite', brand: 'GLUCO BITE', sub: 'BISCUITS', line: 'Chai ke saath, har baat', price: 'Rs 2', c: ['#f6c830', '#e8700a'], fg: '#7a1a10', art: 'biscuit', a: ['#e8b060', '#c8202a'] },
    { id: 'amma_avakaya', brand: "AMMA'S AVAKAYA", sub: 'MANGO PICKLE', line: 'Ammamma recipe, every jar', c: ['#d03a2a', '#6a140a'], fg: '#fff4c0', art: 'jar', a: ['#e8402a', '#f4e8c8'] },
    { id: 'sawari', brand: 'SAWARI 100', sub: 'MOTORCYCLE', line: '80 KM A LITRE! Easy EMI', c: ['#20202e', '#3a3a5c'], fg: '#f2c230', art: 'bike', a: ['#d8202a', '#2a2a2a'] },
    { id: 'hello_one', brand: 'HELLO ONE', sub: 'PREPAID MOBILE', line: 'Incoming FREE! Recharge Rs 300', c: ['#009aa8', '#003e4a'], fg: '#ffffff', art: 'phone', a: ['#2a2a32', '#9ae0c0'] },
    { id: 'purvai_fans', brand: 'PURVAI', sub: 'CEILING FANS', line: 'Garmi ka pakka jawab', c: ['#eef4fa', '#6a98d0'], fg: '#163a7a', art: 'fan', a: ['#8a8a92', '#3a3a42'] },
    { id: 'majboot_cement', brand: 'MAJBOOT CEMENT', line: 'Pakka ghar, pakka bharosa', c: ['#9a9aa2', '#46464e'], fg: '#ffffff', art: 'bag', a: ['#ece4d4', '#c8202a'] },
    { id: 'khazana_hunt', brand: 'KHAZANA HUNT', sub: 'SUNDAYS 9 PM - CHANNEL SEVEN', line: 'Professor Pasha finds the tunnel!', c: ['#1a1a2e', '#6a2ac8'], fg: '#f2c230', art: 'tv', a: ['#3a3a42', '#40e0ff'] },
    { id: 'deccan_vani', brand: 'DECCAN VANI 101.2', sub: 'AAPKI FARMAISH', line: 'Shabnam Aapa, every evening', c: ['#f49a28', '#c8302a'], fg: '#ffffff', art: 'radio', a: ['#4a2e1a', '#f2c230'] },
    { id: 'pop_patang', brand: 'POP PATANG 104.8', sub: 'COUNTDOWN EXPRESS', line: 'RJ Rocket Ravi, 5 to 8 PM', c: ['#2ac0a0', '#2a44b8'], fg: '#ffffff', art: 'kite', a: ['#e8302a', '#f2c230'] },
  ];
  const FILM_FALLBACK = ['TOOFAN TAMMUDU', 'MASS MAHARAJU', 'GULLY SIMHAM', 'PREMA PANDAGA', 'RANGULA PATANG', 'JAI HYDERABAD', 'CHARMINAR CHINNODU', 'MEGHA GARJANA'];
  const FILMS = () => ((N.placesArt && N.placesArt.FILMS) || FILM_FALLBACK).slice(0, 32 - ADS.length);

  // the busy centres (place ids): bb = standalone billboards, roof = rooftop hoardings at most, film = share of film boards
  const CENTRES = [
    { place: 'abids', bb: 3, roof: 6, film: 0.25 }, { place: 'koti', bb: 3, roof: 6, film: 0.3 },
    { place: 'sultan_bazaar', bb: 2, roof: 4, film: 0.2 }, { place: 'king_koti', bb: 2, roof: 3, film: 0.3 },
    { place: 'rtc_x_roads', bb: 2, roof: 5, film: 0.7 }, { place: 'narayanguda_ymca', bb: 2, roof: 4, film: 0.5 },
    { place: 'basheerbagh', bb: 2, roof: 4, film: 0.2 }, { place: 'liberty', bb: 2, roof: 3, film: 0.25 },
    { place: 'lakdikapul', bb: 2, roof: 4, film: 0.2 }, { place: 'khairatabad', bb: 2, roof: 4, film: 0.25 },
    { place: 'panjagutta', bb: 2, roof: 3, film: 0.2 }, { place: 'ameerpet', bb: 2, roof: 3, film: 0.2 },
    { place: 'begumpet', bb: 2, roof: 3, film: 0.2 }, { place: 'secunderabad_clock_tower', bb: 3, roof: 5, film: 0.3 },
    { place: 'paradise', bb: 2, roof: 4, film: 0.25 }, { place: 'secunderabad_station', bb: 2, roof: 4, film: 0.25 },
    { place: 'mehdipatnam', bb: 2, roof: 4, film: 0.3 }, { place: 'dilsukhnagar', bb: 3, roof: 5, film: 0.45 },
    { place: 'malakpet', bb: 2, roof: 4, film: 0.3 }, { place: 'masab_tank', bb: 2, roof: 3, film: 0.2 },
    { place: 'nampally_station', bb: 2, roof: 3, film: 0.25 }, { place: 'kachiguda_station', bb: 2, roof: 3, film: 0.25 },
    { place: 'tarnaka', bb: 2, roof: 3, film: 0.25 }, { place: 'erragadda', bb: 2, roof: 3, film: 0.25 },
    { place: 'banjara_hills', bb: 1, roof: 2, film: 0.2 }, { place: 'tolichowki', bb: 2, roof: 3, film: 0.3 },
    { place: 'lb_nagar', bb: 2, roof: 3, film: 0.3 }, { place: 'uppal', bb: 1, roof: 2, film: 0.25 },
  ];
  const TUNE = { ring: [46, 60, 76, 94, 114], minGap: 44, bbW: [30, 38], legH: 14, roofR: 210, roofP: 0.4, roofMinH: 18, night: 0.65 };

  /* ================================================================ the poster atlas */
  const CW = 384, CHH = 192, COLS = 4, ROWS = 8;
  let ATL = null;
  const FONT = "'Baloo 2', 'Yatra One', 'Arial Black', system-ui, sans-serif";
  const fontsIn = () => { try { return !!(document.fonts && document.fonts.check && document.fonts.check("800 40px 'Baloo 2'")); } catch (e) { return false; } };
  function atlas() {
    if (ATL) return ATL;
    const cv = N.render && N.render.makeCanvas ? N.render.makeCanvas(CW * COLS, CHH * ROWS) : Object.assign(document.createElement('canvas'), { width: CW * COLS, height: CHH * ROWS });
    ATL = { canvas: cv, cells: new Map(), fonts: false, version: 0 };
    paintAll();
    // web fonts usually arrive after boot: paint once more with them (2D reads the canvas every frame; 3D re-uploads)
    try { if (!ATL.fonts && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!ATL.fonts && fontsIn()) { paintAll(); if (MAT3 && MAT3.map) MAT3.map.needsUpdate = true; } }); } catch (e) { /* no font API */ }
    return ATL;
  }
  function paintAll() {
    const g = ATL.canvas.getContext('2d');
    ATL.fonts = fontsIn();
    ATL.version++;
    g.clearRect(0, 0, ATL.canvas.width, ATL.canvas.height);
    const ids = ADS.map((a) => a.id).concat(FILMS().map((t) => 'film:' + t));
    ids.forEach((id, i) => {
      const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CHH;
      g.save(); g.beginPath(); g.rect(x, y, CW, CHH); g.clip();
      try { if (id.indexOf('film:') === 0) paintFilm(g, x, y, CW, CHH, id.slice(5)); else paintAd(g, x, y, CW, CHH, ADS.find((a) => a.id === id)); } catch (e) { N.err('hoardings.paint', e); }
      g.restore();
      const W = ATL.canvas.width, H = ATL.canvas.height;
      ATL.cells.set(id, { x, y, w: CW, h: CHH, u0: (x + 1) / W, u1: (x + CW - 1) / W, v0: 1 - (y + CHH - 1) / H, v1: 1 - (y + 1) / H });
    });
  }
  function cellOf(id) { return atlas().cells.get(id) || null; }

  // ---- lettering
  function fitText(g, text, x, y, maxW, size, opts) {
    let fs = size;
    g.font = (opts.italic ? 'italic ' : '') + (opts.w || 800) + ' ' + fs + 'px ' + FONT;
    const tw = g.measureText(text).width;
    if (tw > maxW) { fs = Math.max(8, Math.floor(fs * maxW / tw)); g.font = (opts.italic ? 'italic ' : '') + (opts.w || 800) + ' ' + fs + 'px ' + FONT; }
    g.textAlign = opts.align || 'center'; g.textBaseline = 'middle';
    if (opts.stroke) { g.lineJoin = 'round'; g.lineWidth = Math.max(2, fs * 0.16); g.strokeStyle = opts.stroke; g.strokeText(text, x, y); }
    if (opts.shadow) { g.fillStyle = opts.shadow; g.fillText(text, x + fs * 0.05, y + fs * 0.06); }
    g.fillStyle = opts.fill; g.fillText(text, x, y);
    return fs;
  }
  function burst(g, cx, cy, r, col, text, fg) {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.74 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    fitText(g, text, cx, cy + 1, r * 1.35, r * 0.62, { fill: fg, w: 800 });
  }

  // ---- product drawings (centre cx, cy; s = the art's height)
  const ART = {
    bottle(g, cx, cy, s, a) {
      const w = s * 0.3, top = cy - s / 2, neck = s * 0.32;
      const gr = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      gr.addColorStop(0, shade(a[0], 0.7)); gr.addColorStop(0.35, shade(a[0], 1.35)); gr.addColorStop(1, shade(a[0], 0.6));
      g.fillStyle = gr; g.beginPath();
      g.moveTo(cx - w * 0.18, top + s * 0.05); g.lineTo(cx - w * 0.18, top + neck); g.quadraticCurveTo(cx - w / 2, top + neck + s * 0.1, cx - w / 2, top + neck + s * 0.22);
      g.lineTo(cx - w / 2, cy + s / 2 - s * 0.04); g.quadraticCurveTo(cx - w / 2, cy + s / 2, cx - w / 2 + 4, cy + s / 2); g.lineTo(cx + w / 2 - 4, cy + s / 2); g.quadraticCurveTo(cx + w / 2, cy + s / 2, cx + w / 2, cy + s / 2 - s * 0.04);
      g.lineTo(cx + w / 2, top + neck + s * 0.22); g.quadraticCurveTo(cx + w / 2, top + neck + s * 0.1, cx + w * 0.18, top + neck); g.lineTo(cx + w * 0.18, top + s * 0.05); g.closePath(); g.fill();
      g.fillStyle = '#c8c8c0'; g.fillRect(cx - w * 0.22, top, w * 0.44, s * 0.06); // crown cap
      g.fillStyle = a[1]; g.fillRect(cx - w / 2, cy + s * 0.02, w, s * 0.2); // label
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(cx - w * 0.3, top + neck + s * 0.1, w * 0.08, s * 0.5); // shine
      g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + (i % 3 - 1) * w * 0.25, cy - s * 0.12 + Math.floor(i / 3) * s * 0.35, s * 0.014, 0, TAU); g.fill(); } // cold drops
    },
    soap(g, cx, cy, s, a) {
      const w = s * 0.86, h = s * 0.46;
      g.fillStyle = shade(a[0], 0.75); rr(g, cx - w / 2 + 4, cy - h / 2 + 6, w, h, h * 0.3); g.fill();
      const gr = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); gr.addColorStop(0, shade(a[0], 1.25)); gr.addColorStop(1, a[0]);
      g.fillStyle = gr; rr(g, cx - w / 2, cy - h / 2, w, h, h * 0.3); g.fill();
      g.strokeStyle = shade(a[0], 0.8); g.lineWidth = 2; rr(g, cx - w * 0.36, cy - h * 0.3, w * 0.72, h * 0.6, h * 0.22); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(cx - w * 0.4 + i * w * 0.14, cy - h / 2 - s * 0.1 - (i % 3) * s * 0.07, s * (0.03 + (i % 3) * 0.015), 0, TAU); g.fill(); }
      g.fillStyle = a[1]; g.beginPath(); g.ellipse(cx, cy, w * 0.16, h * 0.18, 0, 0, TAU); g.fill(); // emblem
    },
    box(g, cx, cy, s, a) {
      const w = s * 0.56, h = s * 0.78, d = s * 0.14;
      g.fillStyle = shade(a[1], 0.6); g.beginPath(); g.moveTo(cx + w / 2, cy - h / 2); g.lineTo(cx + w / 2 + d, cy - h / 2 - d * 0.6); g.lineTo(cx + w / 2 + d, cy + h / 2 - d * 0.6); g.lineTo(cx + w / 2, cy + h / 2); g.fill();
      g.fillStyle = shade(a[1], 0.85); g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2); g.lineTo(cx - w / 2 + d, cy - h / 2 - d * 0.6); g.lineTo(cx + w / 2 + d, cy - h / 2 - d * 0.6); g.lineTo(cx + w / 2, cy - h / 2); g.fill();
      g.fillStyle = a[0]; g.fillRect(cx - w / 2, cy - h / 2, w, h);
      g.fillStyle = a[1]; g.fillRect(cx - w / 2, cy - h / 2, w, h * 0.28); g.fillRect(cx - w / 2, cy + h * 0.3, w, h * 0.2);
      g.fillStyle = '#f2c230'; g.beginPath(); for (let i = 0; i < 16; i++) { const t = (i / 16) * TAU, r = i % 2 ? w * 0.18 : w * 0.3; g.lineTo(cx + Math.cos(t) * r, cy + h * 0.02 + Math.sin(t) * r); } g.fill();
    },
    tube(g, cx, cy, s, a) {
      // a tube lying aslant, crimped end at the back, a ribbon of paste out of the cap
      g.save(); g.translate(cx - s * 0.06, cy + s * 0.06); g.rotate(-0.42);
      const w = s * 0.28, L = s * 0.72;
      g.fillStyle = shade(a[1], 0.86); g.beginPath(); g.moveTo(-L / 2, -w * 0.62);
      for (let i = 0; i <= 6; i++) g.lineTo(-L / 2 - (i % 2 ? s * 0.03 : 0), -w * 0.62 + i * w * 1.24 / 6);
      g.lineTo(-L * 0.42, w * 0.62); g.lineTo(-L * 0.42, -w * 0.62); g.closePath(); g.fill(); // the crimp
      g.fillStyle = a[1]; g.beginPath(); g.moveTo(-L * 0.42, -w * 0.62); g.lineTo(L * 0.3, -w / 2); g.quadraticCurveTo(L * 0.4, -w * 0.4, L * 0.4, -w * 0.18);
      g.lineTo(L * 0.4, w * 0.18); g.quadraticCurveTo(L * 0.4, w * 0.4, L * 0.3, w / 2); g.lineTo(-L * 0.42, w * 0.62); g.closePath(); g.fill();
      g.fillStyle = a[0]; g.fillRect(-L * 0.36, -w * 0.3, L * 0.6, w * 0.6); // the band
      g.fillStyle = a[1]; g.fillRect(-L * 0.28, -w * 0.08, L * 0.44, w * 0.16);
      g.fillStyle = a[0]; g.fillRect(L * 0.4, -w * 0.24, L * 0.13, w * 0.48); // the cap
      g.fillStyle = '#ffffff'; g.strokeStyle = shade(a[0], 1.1); g.lineWidth = s * 0.012;
      g.beginPath(); g.moveTo(L * 0.53, -w * 0.12); g.bezierCurveTo(L * 0.72, -w * 0.5, L * 0.82, w * 0.3, L * 0.66, w * 0.5); g.lineTo(L * 0.6, w * 0.3); g.bezierCurveTo(L * 0.7, w * 0.1, L * 0.64, -w * 0.1, L * 0.53, w * 0.12); g.closePath(); g.fill(); g.stroke(); // the paste
      g.restore();
    },
    cup(g, cx, cy, s, a) {
      const w = s * 0.62, h = s * 0.42;
      g.fillStyle = shade(a[0], 0.85); g.beginPath(); g.ellipse(cx, cy + h * 0.62, w * 0.72, h * 0.16, 0, 0, TAU); g.fill(); // saucer
      g.fillStyle = a[0]; g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy - h / 2); g.quadraticCurveTo(cx + w * 0.45, cy + h / 2, cx, cy + h * 0.55); g.quadraticCurveTo(cx - w * 0.45, cy + h / 2, cx - w / 2, cy - h / 2); g.fill();
      g.strokeStyle = a[0]; g.lineWidth = s * 0.05; g.beginPath(); g.arc(cx + w * 0.52, cy - h * 0.05, h * 0.24, -1.2, 1.4); g.stroke();
      g.fillStyle = a[1]; g.beginPath(); g.ellipse(cx, cy - h / 2, w / 2, h * 0.14, 0, 0, TAU); g.fill(); // the tea
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = s * 0.025;
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(cx + i * w * 0.2, cy - h * 0.7); g.bezierCurveTo(cx + i * w * 0.2 + s * 0.06, cy - h * 0.95, cx + i * w * 0.2 - s * 0.06, cy - h * 1.1, cx + i * w * 0.2, cy - h * 1.35); g.stroke(); } // steam
    },
    biscuit(g, cx, cy, s, a) {
      const w = s * 0.7, h = s * 0.44;
      g.fillStyle = a[1]; rr(g, cx - w / 2, cy - h / 2 + s * 0.12, w, h, 6); g.fill(); // packet
      g.fillStyle = '#ffffff'; g.fillRect(cx - w / 2 + 6, cy + s * 0.12 - h * 0.12, w - 12, h * 0.24);
      for (let i = 0; i < 3; i++) {
        const bx = cx - w * 0.28 + i * w * 0.28, by = cy - s * 0.14 - (i === 1 ? s * 0.06 : 0);
        g.fillStyle = a[0]; g.beginPath(); g.arc(bx, by, s * 0.16, 0, TAU); g.fill();
        g.fillStyle = shade(a[0], 0.75); for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(bx + Math.cos(k) * s * 0.08, by + Math.sin(k) * s * 0.08, s * 0.014, 0, TAU); g.fill(); }
      }
    },
    jar(g, cx, cy, s, a) {
      const w = s * 0.5, h = s * 0.64;
      g.fillStyle = 'rgba(255,255,255,0.35)'; rr(g, cx - w / 2, cy - h / 2, w, h, 10); g.fill();
      g.fillStyle = a[0]; rr(g, cx - w / 2 + 4, cy - h / 2 + h * 0.18, w - 8, h * 0.78, 8); g.fill();
      g.fillStyle = '#f2c230'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(cx - w * 0.3 + (i % 3) * w * 0.3, cy - h * 0.12 + Math.floor(i / 3) * h * 0.22, s * 0.035, 0, TAU); g.fill(); } // mango pieces
      g.fillStyle = '#7a1a1a'; g.fillRect(cx - w * 0.42, cy - h / 2 - s * 0.08, w * 0.84, s * 0.1); // lid
      g.fillStyle = a[1]; g.fillRect(cx - w / 2 + 2, cy - s * 0.02, w - 4, h * 0.22); // label
    },
    bike(g, cx, cy, s, a) {
      s *= 0.78; // wider than tall: kept inside the art's third of the board
      const r = s * 0.2, x0 = cx - s * 0.42, x1 = cx + s * 0.42, y = cy + s * 0.22;
      g.strokeStyle = '#1a1a1a'; g.lineWidth = s * 0.06; for (const x of [x0, x1]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
      g.strokeStyle = '#b8b8c0'; g.lineWidth = s * 0.015; for (const x of [x0, x1]) for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(k) * r, y + Math.sin(k) * r); g.stroke(); }
      g.fillStyle = a[0]; g.beginPath(); g.moveTo(x0 + r * 0.6, y - r * 0.4); g.lineTo(cx - s * 0.08, y - r * 1.5); g.lineTo(cx + s * 0.22, y - r * 1.55); g.lineTo(x1 - r * 0.2, y - r * 0.5); g.lineTo(cx + s * 0.05, y - r * 0.2); g.closePath(); g.fill(); // tank + body
      g.fillStyle = a[1]; g.fillRect(cx - s * 0.22, y - r * 1.9, s * 0.3, r * 0.4); // seat
      g.strokeStyle = '#8a8a92'; g.lineWidth = s * 0.03; g.beginPath(); g.moveTo(cx + s * 0.22, y - r * 1.55); g.lineTo(x1 - r * 0.1, y - r * 2.3); g.lineTo(x1 + r * 0.2, y - r * 2.3); g.stroke(); // handle
      g.fillStyle = '#c8c8d0'; g.fillRect(x0 - r * 0.2, y - r * 0.15, s * 0.3, r * 0.25); // exhaust
    },
    phone(g, cx, cy, s, a) {
      const w = s * 0.34, h = s * 0.84;
      g.fillStyle = a[0]; rr(g, cx - w / 2, cy - h / 2, w, h, w * 0.3); g.fill();
      g.fillRect(cx + w * 0.18, cy - h / 2 - s * 0.08, w * 0.12, s * 0.12); // stub antenna
      g.fillStyle = a[1]; g.fillRect(cx - w * 0.36, cy - h * 0.36, w * 0.72, h * 0.3); // screen
      g.fillStyle = '#1a3a2a'; g.fillRect(cx - w * 0.28, cy - h * 0.28, w * 0.4, h * 0.03);
      g.fillStyle = '#d8d8e0'; for (let i = 0; i < 12; i++) { g.beginPath(); g.ellipse(cx - w * 0.24 + (i % 3) * w * 0.24, cy + h * 0.06 + Math.floor(i / 3) * h * 0.09, w * 0.08, h * 0.03, 0, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = s * 0.02; for (let k = 1; k <= 3; k++) { g.beginPath(); g.arc(cx + w * 0.24, cy - h / 2 - s * 0.06, k * s * 0.07, -1.2, -0.2); g.stroke(); } // signal
    },
    fan(g, cx, cy, s, a) {
      g.fillStyle = a[1]; g.fillRect(cx - s * 0.02, cy - s * 0.48, s * 0.04, s * 0.3);
      g.fillStyle = a[0];
      for (let k = 0; k < 3; k++) { const t = k * TAU / 3 - 0.3; g.save(); g.translate(cx, cy - s * 0.12); g.rotate(t); g.beginPath(); g.ellipse(s * 0.28, 0, s * 0.27, s * 0.06, 0, 0, TAU); g.fill(); g.restore(); }
      g.fillStyle = a[1]; g.beginPath(); g.arc(cx, cy - s * 0.12, s * 0.09, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = s * 0.02; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx, cy - s * 0.12, s * (0.4 + k * 0.05), 0.6 + k * 0.2, 1.4 + k * 0.2); g.stroke(); } // breeze
    },
    bag(g, cx, cy, s, a) {
      const w = s * 0.62, h = s * 0.76;
      g.fillStyle = a[0]; g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2 + 6); g.quadraticCurveTo(cx, cy - h / 2 - 6, cx + w / 2, cy - h / 2 + 6); g.quadraticCurveTo(cx + w / 2 + 6, cy, cx + w / 2, cy + h / 2 - 6); g.quadraticCurveTo(cx, cy + h / 2 + 6, cx - w / 2, cy + h / 2 - 6); g.quadraticCurveTo(cx - w / 2 - 6, cy, cx - w / 2, cy - h / 2 + 6); g.fill();
      g.fillStyle = a[1]; g.fillRect(cx - w / 2 + 2, cy - h * 0.18, w - 4, h * 0.14); g.fillRect(cx - w / 2 + 2, cy + h * 0.12, w - 4, h * 0.06);
      g.fillStyle = '#6a6a72'; g.beginPath(); g.moveTo(cx - w * 0.3, cy + h / 2 + 4); g.lineTo(cx - w * 0.6, cy + h / 2 + 4); g.lineTo(cx - w * 0.45, cy + h / 2 - s * 0.12); g.fill(); // a little heap
    },
    tv(g, cx, cy, s, a) {
      const w = s * 0.8, h = s * 0.6;
      g.strokeStyle = '#8a8a92'; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(cx, cy - h / 2); g.lineTo(cx - s * 0.2, cy - h / 2 - s * 0.24); g.moveTo(cx, cy - h / 2); g.lineTo(cx + s * 0.22, cy - h / 2 - s * 0.22); g.stroke();
      g.fillStyle = a[0]; rr(g, cx - w / 2, cy - h / 2, w, h, 8); g.fill();
      g.fillStyle = a[1]; rr(g, cx - w * 0.42, cy - h * 0.38, w * 0.66, h * 0.76, 10); g.fill();
      g.fillStyle = '#1a1a2a'; g.beginPath(); g.ellipse(cx - w * 0.09, cy + h * 0.1, w * 0.16, h * 0.22, 0, Math.PI, 0); g.fill(); // a tunnel mouth on screen
      g.fillStyle = '#c8c8d0'; for (let k = 0; k < 2; k++) { g.beginPath(); g.arc(cx + w * 0.36, cy - h * 0.15 + k * h * 0.3, s * 0.035, 0, TAU); g.fill(); }
    },
    radio(g, cx, cy, s, a) {
      const w = s * 0.82, h = s * 0.5;
      g.strokeStyle = '#c8c8d0'; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(cx + w * 0.3, cy - h / 2); g.lineTo(cx + w * 0.5, cy - h / 2 - s * 0.36); g.stroke();
      g.fillStyle = a[0]; rr(g, cx - w / 2, cy - h / 2, w, h, 10); g.fill();
      g.fillStyle = shade(a[0], 0.6); for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(cx - w * 0.32 + i * w * 0.08, cy - h * 0.2 + j * h * 0.14, s * 0.018, 0, TAU); g.fill(); }
      g.fillStyle = a[1]; g.fillRect(cx + w * 0.05, cy - h * 0.25, w * 0.36, h * 0.2);
      g.fillStyle = '#c81a1a'; g.fillRect(cx + w * 0.18, cy - h * 0.27, s * 0.012, h * 0.24);
      g.fillStyle = '#d8d8e0'; g.beginPath(); g.arc(cx + w * 0.23, cy + h * 0.2, s * 0.06, 0, TAU); g.fill();
    },
    kite(g, cx, cy, s, a) {
      g.fillStyle = a[0]; g.beginPath(); g.moveTo(cx, cy - s * 0.45); g.lineTo(cx + s * 0.3, cy - s * 0.05); g.lineTo(cx, cy + s * 0.35); g.lineTo(cx - s * 0.3, cy - s * 0.05); g.closePath(); g.fill();
      g.fillStyle = a[1]; g.beginPath(); g.moveTo(cx, cy - s * 0.45); g.lineTo(cx + s * 0.3, cy - s * 0.05); g.lineTo(cx, cy - s * 0.05); g.closePath(); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(cx, cy + s * 0.35); g.bezierCurveTo(cx - s * 0.2, cy + s * 0.5, cx + s * 0.1, cy + s * 0.55, cx - s * 0.15, cy + s * 0.7); g.stroke();
      g.fillStyle = '#ffffff'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(cx - s * 0.36 - k * s * 0.08, cy - s * 0.25 + k * s * 0.15); g.lineTo(cx - s * 0.3 - k * s * 0.08, cy - s * 0.22 + k * s * 0.15); g.lineTo(cx - s * 0.36 - k * s * 0.08, cy - s * 0.19 + k * s * 0.15); g.fill(); } // music notes, sort of
    },
  };
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
  function shade(hex, f) { return U.shade ? U.shade(hex, f) : hex; }

  function paintAd(g, x, y, w, h, ad) {
    const bg = g.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, ad.c[0]); bg.addColorStop(1, ad.c[1]);
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    // rays behind the product
    const ox = x + w * 0.2, oy = y + h * 0.5;
    g.save(); g.globalAlpha = 0.14; g.fillStyle = '#ffffff';
    for (let i = 0; i < 18; i += 2) { const a0 = (i / 18) * TAU, a1 = ((i + 1) / 18) * TAU; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a0) * w, oy + Math.sin(a0) * w); g.lineTo(ox + Math.cos(a1) * w, oy + Math.sin(a1) * w); g.fill(); }
    g.restore();
    (ART[ad.art] || ART.bottle)(g, x + w * 0.2, y + h * 0.52, h * 0.78, ad.a);
    // the words, on the right
    const tx = x + w * 0.64, tw = w * 0.6;
    const dark = shade(ad.c[1], 0.45);
    // the sub line steps left of the price burst when there is one
    if (ad.sub) fitText(g, ad.sub, ad.price ? x + w * 0.56 : tx, y + h * 0.2, ad.price ? w * 0.44 : tw, h * 0.12, { fill: ad.fg, w: 700, shadow: 'rgba(0,0,0,0.22)' });
    fitText(g, ad.brand, tx, y + h * (ad.sub ? 0.44 : 0.38), tw, h * 0.3, { fill: ad.fg, stroke: dark, shadow: 'rgba(0,0,0,0.35)' });
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + w * 0.33, y + h * 0.66, w * 0.63, h * 0.2);
    fitText(g, ad.line, tx, y + h * 0.76, tw, h * 0.11, { fill: '#ffffff', italic: true, w: 700 });
    if (ad.price) burst(g, x + w * 0.88, y + h * 0.17, h * 0.15, '#f2c230', ad.price, '#c81a1a');
    frame(g, x, y, w, h, '#f2f0e8');
  }
  function paintFilm(g, x, y, w, h, title) {
    const PA = N.placesArt;
    const src = PA && PA.filmBoard ? PA.filmBoard(title, w / 4, h / 4) : null;
    if (src) g.drawImage(src, x, y, w, h);
    else { g.fillStyle = '#c8202a'; g.fillRect(x, y, w, h); }
    const band = h * 0.24;
    g.fillStyle = '#1a1018'; g.fillRect(x, y + h - band, w, band);
    fitText(g, title, x + w / 2, y + h - band / 2, w * 0.9, band * 0.78, { fill: '#ffe23a', stroke: '#7a1a1a' });
    fitText(g, 'NOW SHOWING', x + w * 0.83, y + h * 0.1, w * 0.3, h * 0.09, { fill: '#ffffff', stroke: '#1a1018', w: 800 });
    frame(g, x, y, w, h, '#f2c230');
  }
  function frame(g, x, y, w, h, col) {
    g.strokeStyle = '#1a1a1e'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(x + 7, y + 7, w - 14, h - 14);
  }

  /* ================================================================ placement */
  const H = (N.hoardings = { ADS, FILMS, CENTRES, TUNE, list: [], stats, atlas, cellOf });
  const ST = { billboards: 0, rooftop: 0, centres: 0, ads: {} };
  function stats() { return { billboards: ST.billboards, rooftop: ST.rooftop, centres: ST.centres, ads: Object.assign({}, ST.ads) }; }
  const OUT = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  function faceSegW(b, f) {
    const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.d;
    switch (f) { case 'N': return [x1, y0, x0, y0]; case 'S': return [x0, y1, x1, y1]; case 'E': return [x1, y1, x1, y0]; default: return [x0, y0, x0, y1]; }
  }
  function pickAd(rng, filmShare) {
    if (rng.next() < filmShare) { const F = FILMS(); return 'film:' + F[(rng.next() * F.length) | 0]; }
    return ADS[(rng.next() * ADS.length) | 0].id;
  }
  /** is the ground at (x, y) free for a hoarding leg (open dirt or grass, not a road, a footpath or a building)? */
  function groundOK(x, y) {
    const S = N.SURF, v = N.world.surfaceAt(x, y);
    return v === S.GROUND || v === S.GRASS || v === S.SAND;
  }
  function nearLandmark(x, y, pad) {
    for (const l of (N.WORLD_DATA && N.WORLD_DATA.landmarks) || []) if (Math.abs(x - l.x) < l.w / 2 + pad && Math.abs(y - l.y) < l.d / 2 + pad) return true;
    return false;
  }
  function nearPlace(x, y, r) {
    const P = N.places;
    for (const k in P) { const p = P[k]; if (Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r) return true; }
    return false;
  }
  /** a standalone billboard near centre c: on open ground by a road, facing it, clear of buildings and landmarks */
  function findBillboard(c, rng, taken) {
    const W = N.world, R = N.respect;
    const a0 = rng.next() * TAU;
    for (const r of TUNE.ring) {
      for (let k = 0; k < 24; k++) {
        const ang = a0 + (k / 24) * TAU, x = c.x + Math.cos(ang) * r, y = c.y + Math.sin(ang) * r;
        if (!groundOK(x, y)) continue;
        const rp = W.nearestRoadPoint(x, y);
        if (!rp || rp.dist < 14 || rp.dist > 42) continue;
        let nx = rp.x - x, ny = rp.y - y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const ax = -ny, ay = nx; // along the road
        const bw = TUNE.bbW[0] + rng.next() * (TUNE.bbW[1] - TUNE.bbW[0]);
        let ok = true;
        for (let t = -bw / 2; t <= bw / 2 && ok; t += 3) for (const o of [-2, 0, 2]) { if (!groundOK(x + ax * t + nx * o, y + ay * t + ny * o)) { ok = false; break; } }
        if (!ok) continue;
        if (taken.some((q) => Math.hypot(q.x - x, q.y - y) < TUNE.minGap)) continue;
        if (nearLandmark(x, y, 12) || nearPlace(x, y, 16)) continue;
        try { if (R && R.at && (R.at(x, y) || R.at(x + ax * bw / 2, y + ay * bw / 2) || R.at(x - ax * bw / 2, y - ay * bw / 2))) continue; } catch (e) { /* no respect zones */ }
        return { x, y, nx, ny, ax, ay, bw };
      }
    }
    return null;
  }
  /** what a building's front looks onto: true if a road is within 26 u of it */
  function frontOnRoad(b) {
    const S = N.SURF, s = faceSegW(b, b.front), o = OUT[b.front];
    const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
    for (const d of [5, 11, 18, 26]) {
      const v = N.world.surfaceAt(mx + o[0] * d, my + o[1] * d);
      if (v === S.ROAD || v === S.FOOTPATH || v === S.PLAZA || v === S.BRIDGE) return true;
      if (v === S.SOLID && d > 5) return false;
    }
    return false;
  }

  function place() {
    const W = N.world;
    H.list.length = 0;
    ST.billboards = ST.rooftop = ST.centres = 0; ST.ads = {};
    if (!W || !W.built || !W.queryStructures) return;
    const taken = [];
    const count = (id) => { ST.ads[id] = (ST.ads[id] || 0) + 1; };
    for (const C of CENTRES) {
      const p = N.places && N.places[C.place];
      if (!p) continue;
      ST.centres++;
      const rng = U.rng('hoardings:' + C.place);
      // standalone billboards
      for (let i = 0; i < C.bb; i++) {
        const spot = findBillboard(p, rng, taken);
        if (!spot) break;
        taken.push(spot);
        const front = pickAd(rng, C.film), back = rng.next() < 0.5 ? pickAd(rng, C.film) : null;
        const hw = spot.bw / 2 + 3; // the board turns with the road: a square round it holds it either way
        const s = W.addStructure({ t: 'custom', hoarding: 'bb', x0: spot.x - hw, y0: spot.y - hw, x1: spot.x + hw, y1: spot.y + hw, cx: spot.x, cy: spot.y,
          spot, ad: front, back, centre: C.place, draw: drawBillboard2D, build3d });
        H.list.push(s); ST.billboards++; count(front); if (back) count(back);
      }
      // rooftop hoardings on the road-facing flat roofs round it
      const cand = [];
      W.queryStructures(p.x - TUNE.roofR, p.y - TUNE.roofR, p.x + TUNE.roofR, p.y + TUNE.roofR, (b) => {
        if (b.t !== 'bldg' || !b.front || b.mosque || b.roofType === 'hip' || b.roofType === 'gable' || b.roofType === 'frame') return;
        if (!(b.h >= TUNE.roofMinH)) return;
        if (N.ameerpet && N.ameerpet.dressOf && N.ameerpet.dressOf(b)) return; // the coaching belt's own boards
        const d = Math.hypot(b.x + b.w / 2 - p.x, b.y + b.d / 2 - p.y);
        if (d > TUNE.roofR) return;
        cand.push({ b, d });
      });
      cand.sort((a, b) => a.d - b.d || a.b.x - b.b.x || a.b.y - b.b.y);
      let n = 0;
      for (const { b } of cand) {
        if (n >= C.roof) break;
        if (b._hoarding) continue;
        const L = b.front === 'N' || b.front === 'S' ? b.w : b.d;
        if (L < 20) continue;
        const r2 = U.rng('hoarding-roof:' + Math.round(b.x) + ',' + Math.round(b.y));
        if (r2.next() > TUNE.roofP) continue;
        if (!frontOnRoad(b)) continue;
        const ad = pickAd(r2, C.film);
        b._hoarding = true;
        const s = W.addStructure({ t: 'custom', hoarding: 'roof', x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.d, cx: b.cx != null ? b.cx : b.x + b.w / 2, cy: b.cy != null ? b.cy : b.y + b.d / 2,
          b, face: b.front, bw: Math.min(L - 2, 36), ad, centre: C.place, draw: drawRoof2D, build3d });
        H.list.push(s); ST.rooftop++; n++; count(ad);
      }
    }
  }
  N.on('world:built', () => { try { place(); } catch (e) { N.err('hoardings.place', e); } });

  /* ================================================================ 2D */
  // the poster lies flat at the board's top (top-down convention, as places_art's film hoardings): w x w/2, its long
  // side along the road (u), turned the way a map label is so it never reads upside down
  function poster2D(R, id, cx, cy, ux, uy, w, h) {
    const A = atlas(), c = A.cells.get(id);
    if (!c) return;
    const k = R.k(h), d = w / 2, ctx = R.ctx;
    let a = Math.atan2(uy, ux);
    if (a > Math.PI / 2 + 0.01) a -= Math.PI; else if (a <= -Math.PI / 2 + 0.01) a += Math.PI;
    ctx.save();
    ctx.translate(R.sx(cx, k), R.sy(cy, k)); ctx.rotate(a);
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(-(w / 2 + 0.6) * k, -(d / 2 + 0.6) * k, (w + 1.2) * k, (d + 1.2) * k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(A.canvas, c.x, c.y, c.w, c.h, -w / 2 * k, -d / 2 * k, w * k, d * k);
    ctx.restore();
  }
  function drawBillboard2D(ctx, s) {
    const R = N.render, D = N.draw, sp = s.spot, top = TUNE.legH + sp.bw / 3; // 2D heights: the 3D board (bw / 2) over VS
    for (const t of [-0.36, 0.36]) {
      const x = sp.x + sp.ax * sp.bw * t, y = sp.y + sp.ay * sp.bw * t;
      D.box(x - 1.3, y - 1.3, 2.6, 2.6, 0, 2, { wall: '#8a8680', roof: '#9a968e' });
      D.box(x - 0.6, y - 0.6, 1.2, 1.2, 2, top - 0.5, { wall: '#5a5a62', roof: '#6a6a72' });
    }
    poster2D(R, s.ad, sp.x, sp.y, sp.ax, sp.ay, sp.bw, top);
  }
  function drawRoof2D(ctx, s) {
    const R = N.render, D = N.draw, b = s.b, sg = faceSegW(b, s.face), o = OUT[s.face];
    const mx = (sg[0] + sg[2]) / 2 - o[0] * 3, my = (sg[1] + sg[3]) / 2 - o[1] * 3;
    const top = b.h + (b.parapet ? 2 : 0) + 3 + s.bw / 3;
    const L = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]), ux = (sg[2] - sg[0]) / L, uy = (sg[3] - sg[1]) / L;
    for (const t of [-0.35, 0.35]) D.box(mx + ux * s.bw * t - 0.5, my + uy * s.bw * t - 0.5, 1, 1, b.h, top - 0.5, { wall: '#5a5a62', roof: '#6a6a72' });
    // flat on the roof (the half towards the street): drawn from the board's middle, inside the roof
    poster2D(R, s.ad, mx - o[0] * s.bw / 4, my - o[1] * s.bw / 4, ux, uy, s.bw, top);
  }
  // shadows of the boards and their floodlights at night (queued while the frame is built)
  const lightRecs = [];
  N.addSystem({
    id: 'hoardings', order: 43.6, runIn: ['*'],
    draw() {
      const R = N.render;
      if (!R || !R.view || !H.list.length || (N.view3d && N.view3d.active)) return;
      const v = R.view, night = R.night || 0;
      let nl = 0;
      for (const s of H.list) {
        if (s.x1 < v.x0 - 40 || s.x0 > v.x1 + 40 || s.y1 < v.y0 - 40 || s.y0 > v.y1 + 40) continue;
        if (s.hoarding === 'bb') {
          const sp = s.spot, top = TUNE.legH + sp.bw / 3;
          // a thin board: its shadow is a band along the road (axis-aligned to the nearer axis)
          if (N.draw.castBox) { const wx = Math.abs(sp.ax) >= Math.abs(sp.ay) ? sp.bw : 1.5, wy = wx === 1.5 ? sp.bw : 1.5; N.draw.castBox(sp.x - wx / 2, sp.y - wy / 2, wx, wy, top); }
          if (night > 0.25 && R.lights) {
            const L = lightRecs[nl] || (lightRecs[nl] = { x: 0, y: 0, r: 0, color: '#fff2d0', intensity: 0, h: 0 });
            nl++; L.x = sp.x + sp.nx * 6; L.y = sp.y + sp.ny * 6; L.r = sp.bw * 0.9; L.intensity = 0.7; L.h = top;
            R.lights.push(L);
          }
        }
      }
    },
  });

  /* ================================================================ 3D */
  let MAT3 = null;
  function material(THREE) {
    if (MAT3) return MAT3;
    const A = atlas();
    const tex = new THREE.CanvasTexture(A.canvas);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.userData.shared = true;
    MAT3 = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0 });
    MAT3.userData.shared = true;
    return MAT3;
  }
  /** the poster quad of id on the vertical plane through a..b (ground points, chunk-local), from y0 to y1 */
  function posterQuad(gp, id, ax, az, bx, bz, y0, y1) {
    const c = atlas().cells.get(id); if (!c) return;
    gp.color('#ffffff');
    gp.quad(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az, [c.u0, c.v0, c.u1, c.v1]);
  }
  function addBoard3D(H3, gb, gp, J, cx, cz, ux, uz, nx, nz, bw, y0, legs, front, back) {
    const y1 = y0 + bw / 2, half = bw / 2; // 3D units are the same across and up: the poster keeps its 2:1
    gb.plain();
    if (legs) {
      for (const t of [-0.36, 0.36]) {
        const lx = cx + ux * bw * t, lz = cz + uz * bw * t;
        gb.color('#8a8680').box(lx - 1.4, 0, lz - 1.4, lx + 1.4, 2, lz + 1.4);
        gb.color('#5a5a62').box(lx - 0.5, 2, lz - 0.5, lx + 0.5, y0 + 1, lz + 0.5);
      }
      gb.color('#6a6a72').obox(cx + nx * 1.4, cz + nz * 1.4, bw + 1, 2.4, y0 - 0.8, y0 - 0.2, Math.atan2(uz, ux)); // the catwalk, in front
    } else {
      for (const t of [-0.38, 0, 0.38]) { const lx = cx + ux * bw * t - nx * 1, lz = cz + uz * bw * t - nz * 1; gb.color('#5a5a62').box(lx - 0.35, y0 - 4, lz - 0.35, lx + 0.35, y1 + 0.3, lz + 0.35); }
    }
    // the board: a galvanised box frame, posters on its faces; a single-sided board shows its rails at the back
    const yaw = Math.atan2(uz, ux);
    gb.color('#4a4a50').obox(cx, cz, bw + 0.8, 0.8, y0 - 0.4, y1 + 0.4, yaw);
    if (!back) {
      gb.color('#8a8a8e').obox(cx - nx * 0.45, cz - nz * 0.45, bw + 0.2, 0.1, y0 - 0.2, y1 + 0.2, yaw); // the sheet
      gb.color('#5e5e64');
      for (const f of [0.15, 0.5, 0.85]) { const y = y0 + (y1 - y0) * f; gb.obox(cx - nx * 0.75, cz - nz * 0.75, bw, 0.5, y - 0.3, y + 0.3, yaw); }
    }
    const ax = cx - ux * half, az = cz - uz * half, bx = cx + ux * half, bz = cz + uz * half;
    posterQuad(gp, front, ax + nx * 0.45, az + nz * 0.45, bx + nx * 0.45, bz + nz * 0.45, y0, y1);
    if (back) posterQuad(gp, back, bx - nx * 0.45, bz - nz * 0.45, ax - nx * 0.45, az - nz * 0.45, y0, y1);
    // floodlights on brackets over the front
    for (const t of [-0.3, 0, 0.3]) {
      const lx = cx + ux * bw * t + nx * 2.2, lz = cz + uz * bw * t + nz * 2.2;
      gb.color('#2a2a2e').box(lx - 0.3, y1 + 0.4, lz - 0.3, lx + 0.3, y1 + 1.2, lz + 0.3);
      J.glows.push([lx, y1 + 0.8, lz, 1.0, 0.94, 0.78, 0.8]);
    }
  }
  function build3d(THREE, s, H3, gb, J) {
    if (!J || !J.detail) return null;
    let C = J._hoardings;
    if (!C) {
      let last = -1;
      if (Array.isArray(J.list)) for (let i = 0; i < J.list.length; i++) if (J.list[i] && J.list[i].hoarding) last = i;
      C = J._hoardings = { last, gp: null };
    }
    if (!C.gp) C.gp = H3.builder({ facade: true });
    const ox = J.ox, oz = J.oz, VS = H3.VS;
    try {
      if (s.hoarding === 'bb') {
        const sp = s.spot;
        // the board's front faces the road (+n); u runs left to right for someone on the road looking at it, so that
        // A->B along u has n on its right seen from above, the GB wall convention: u = (nz, -nx)
        const nx = sp.nx, nz = sp.ny;
        addBoard3D(H3, gb, C.gp, J, sp.x - ox, sp.y - oz, nz, -nx, nx, nz, sp.bw, TUNE.legH * VS, true, s.ad, s.back);
      } else {
        const b = s.b, sg = faceSegW(b, s.face), o = OUT[s.face];
        const L = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]), ux = (sg[2] - sg[0]) / L, uz = (sg[3] - sg[1]) / L;
        const mx = (sg[0] + sg[2]) / 2 - o[0] * 2.2 - ox, mz = (sg[1] + sg[3]) / 2 - o[1] * 2.2 - oz;
        const roof = b.h * VS + (b.parapet ? (b.parapet === 2 ? 4.2 : 3) : 0);
        addBoard3D(H3, gb, C.gp, J, mx, mz, ux, uz, o[0], o[1], s.bw, roof + 4, false, s.ad, null);
      }
    } catch (e) { N.err('hoardings.3d', e); }
    const idx = typeof J.i === 'number' ? J.i - 1 : -1;
    if (C.last >= 0 && idx >= 0 && idx < C.last) return null; // more hoardings to come in this chunk
    const geo = C.gp.build(); C.gp = null;
    if (!geo) return null;
    if (geo.getAttribute('facade')) geo.deleteAttribute('facade');
    if (geo.getAttribute('color')) geo.deleteAttribute('color');
    const m = new THREE.Mesh(geo, material(THREE));
    m.name = 'hoardings'; m.castShadow = false; m.receiveShadow = false;
    const grp = new THREE.Group(); grp.name = 'hoardings'; grp.add(m);
    grp.position.set(ox, 0, oz); // the chunk subtracts its origin from a returned object's position
    return grp;
  }
  if (N.view3d) {
    // the 'custom' dispatcher is src/ameerpet.js's (loaded first); registered here only for a build without it
    if (N.view3d.registerStructure && !N.ameerpet) N.view3d.registerStructure('custom', (THREE, s, H3, gb, J) => (typeof s.build3d === 'function' ? s.build3d(THREE, s, H3, gb, J) : null));
    // floodlit at night: the posters glow a little (the same material everywhere)
    if (N.view3d.registerLayer) N.view3d.registerLayer('hoardings3d', { update() { if (MAT3) MAT3.emissiveIntensity = Math.min(1, Math.max(0, ((N.render && N.render.night) || 0) - 0.15)) * TUNE.night; } });
  }
})();
