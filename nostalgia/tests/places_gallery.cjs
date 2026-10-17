#!/usr/bin/env node
/* NOSTALGIA — tests/places_gallery.cjs  (owner: street-life artist)
 * Boots the real game (index.html#debug) and frames one landmark of every draw id registered by
 * src/places_art.js (or all of them with --all), every place-driven decoration (colony
 * playgrounds, NTR Gardens, street markets) and the story variants (Prasads fence / opening /
 * open, NTR Gardens open / work in progress, Numaish on / off, Ganesh pandals, Ramzan haleem
 * bhattis, Chand Raat bangles, Sankranti kites, summer ice-gola carts), at noon and at night.
 * Screenshots go to tests/out/places/<id>[_variant]_<noon|night>.png plus contact sheets
 * tests/out/places/sheet_<n>.png. Exits 1 on any page error, console error or N.errors entry,
 * or when a draw id of the places_art catalogue (design/map_plan.md §4b) has no art.
 *
 * Usage: node tests/places_gallery.cjs [--all] [--close] [--no-night] [--no-sheets] [--no-variants]
 *   env IDS=gokul_chat,koti_bus_stand    only these landmark / place ids
 *   env DRAWS=kirana,cinema              only these draw ids
 *   env TIMES=12:00,21:00                times to shoot (default noon + night)
 *   env ZOOM=1                           camera zoom (default 1; --close = 2.1)
 *   env VIEW=1280x720                    browser viewport
 *   env PERF=1                           also measure in-page draw time per shot
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'places');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const has = (f) => args.includes(f);

// design/map_plan.md §4b: draw ids drawn by places_art.js (landmarks.js keeps the five civic
// ids it already draws: mozamjahi_market, railway_station, lb_stadium, airport_terminal, control_tower)
const CATALOGUE = ['aeroplane', 'ashram', 'auditorium', 'bakery', 'bal_bhavan', 'banana_cart', 'bangle_shop', 'barber',
  'boat_jetty', 'book_stall', 'bus_stop', 'bus_terminus', 'campus_gate', 'cbs_hangar', 'chai_bandi', 'cinema', 'clothes_store',
  'club_house', 'coaching_centre', 'coconut_cart', 'college', 'cycle_rent', 'department_store', 'dhobi_ghat', 'dosa_bandi',
  'exhibition_hall', 'film_hoarding', 'film_studio', 'flower_cart', 'giant_wheel', 'gokul_chat', 'gpo', 'halt_station',
  'home_house', 'hospital', 'idol_workshop', 'internet_cafe', 'irani_cafe', 'iyengar_bakery', 'kirana', 'kite_stall', 'library',
  'market_hall', 'maut_ka_kuan', 'meat_shop', 'medical_shop', 'mgbs', 'musical_fountain', 'numaish_gate', 'numaish_stalls',
  'photo_studio', 'pindi_girni', 'playground_kit', 'prasads_imax', 'radio_station', 'restaurant', 'rythu_bazaar', 'samosa_bandi',
  'school', 'shilparamam_gate', 'stadium', 'stationery', 'std_booth', 'tv_tower', 'video_parlour', 'water_tank', 'zoo_gate'];
// must-have showcase ids that get a shot even in one-per-draw mode
const SHOWCASE = ['koti_bus_stand', 'imlibun_bus_station', 'gokul_chat', 'prasads_imax', 'sandhya_theatre', 'sudarshan_theatre',
  'odeon_theatre', 'devi_theatre', 'bawarchi', 'paradise', 'nimrah_cafe', 'rythu_bazaar_erragadda', 'giant_wheel', 'school_1', 'kirana_1',
  'pindi_girni_1', 'home', 'cbs_hangar', 'hoarding_rtc_1'];
// [label, fx overrides, ids to shoot]
const VARIANTS = [
  ['fence', { prasads: 'fence' }, ['prasads_imax']],
  ['opening', { prasads: 'opening' }, ['prasads_imax']],
  ['open', { prasads: 'open' }, ['prasads_imax']],
  ['construction', { ntr: 'construction' }, ['ntr_gardens']],
  ['closed', { numaish: false }, ['giant_wheel', 'numaish_stalls_1']],
  ['ganesh', { ganesh: true }, ['playground_home', 'idol_workshop_1']],
  ['ramzan', { ramzan: true }, ['shah_ghouse']],
  ['chandraat', { chandRaat: true }, ['bangle_shop_1']],
  ['sankranti', { sankranti: true }, ['home', 'kite_stall_1']],
  ['summer', { summer: true }, ['school_1']],
];

(async () => {
  const [vw, vh] = (process.env.VIEW || '1280x720').split('x').map(Number);
  const times = (process.env.TIMES || (has('--no-night') ? '12:00' : '12:00,21:00')).split(',').map((t) => t.split(':').map(Number));
  const zoom = process.env.ZOOM ? +process.env.ZOOM : has('--close') ? 2.1 : 1;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html') + '#debug');
  await page.waitForFunction(() => window.N && N.world && N.world.built && N.debug && N.placesArt, null, { timeout: 30000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    if (N.hud && N.hud.hide) N.hud.hide();
  });
  await page.waitForTimeout(400);

  const info = await page.evaluate((CAT) => {
    const mine = Object.keys(N.placesArt.defs);
    const lms = N.WORLD_DATA.landmarks.filter((l) => mine.includes(l.draw)).map((l) => ({ id: l.id, draw: l.draw, x: l.x, y: l.y, w: l.w, d: l.d, h: l.h, face: l.face || '' }));
    const decor = (N.placesArt.decorList ? N.placesArt.decorList() : []).map((d) => ({ id: d.id, draw: 'decor:' + d.kind, x: d.x, y: d.y, w: d.w, d: d.d, h: 10, face: '' }));
    const missing = CAT.filter((d) => !mine.includes(d) && !(N.landmarks.defs[d]));
    return { lms, decor, missing, mine };
  }, CATALOGUE);
  if (info.missing.length) errs.push('catalogue draw ids without art: ' + info.missing.join(', '));
  console.log('places_art draw ids:', info.mine.length, '| landmarks:', info.lms.length, '| decorations:', info.decor.length);

  const ids = process.env.IDS ? process.env.IDS.split(',') : null;
  const draws = process.env.DRAWS ? process.env.DRAWS.split(',') : null;
  const all = info.lms.concat(info.decor);
  let list;
  if (ids) list = all.filter((l) => ids.includes(l.id));
  else if (draws) {
    const seen = new Set();
    list = all.filter((l) => (draws.includes(l.draw) || draws.includes(l.draw.replace('decor:', ''))) && (has('--all') || (seen.has(l.draw) ? false : seen.add(l.draw))));
  }
  else if (has('--all')) list = all;
  else {
    const seen = new Set();
    list = all.filter((l) => SHOWCASE.includes(l.id) || (seen.has(l.draw) ? false : seen.add(l.draw)));
    // one decoration per kind
  }
  const shots = [];
  for (const l of list) shots.push({ lm: l, label: '', fx: null });
  if (!has('--no-variants') && !ids && !draws) {
    for (const [label, fx, vids] of VARIANTS) for (const id of vids) { const l = all.find((q) => q.id === id); if (l) shots.push({ lm: l, label, fx }); }
  } else if (ids && !has('--no-variants')) {
    for (const [label, fx, vids] of VARIANTS) for (const id of vids) { if (!ids.includes(id)) continue; const l = all.find((q) => q.id === id); if (l) shots.push({ lm: l, label, fx }); }
  }
  console.log('shots:', shots.length, 'x', times.length, 'times');

  const files = [];
  const perf = [];
  for (const s of shots) {
    const lm = s.lm;
    for (const [hh, mm] of times) {
      const tag = hh >= 19 || hh < 6 ? 'night' : hh >= 16 ? 'eve' : hh < 9 ? 'morning' : 'noon';
      await page.evaluate(([lm, zoom, hh, mm, fx]) => {
        const PA = N.placesArt;
        for (const k of Object.keys(PA.fx)) PA.fx[k] = null;
        if (fx) Object.assign(PA.fx, fx);
        const R = N.render;
        // camera on the front side so the shopfront walls show; big things centred
        const big = Math.max(lm.w, lm.d);
        const f = lm.face || '';
        const ox = f === 'e' ? 1 : f === 'w' ? -1 : 0, oy = f === 's' ? 1 : f === 'n' ? -1 : 0;
        const off = Math.min(140, big * 0.5 + 40) / zoom;
        const cx = lm.x + ox * off + (ox || oy ? 0 : 30 / zoom), cy = lm.y + oy * off + (ox || oy ? 0 : 24 / zoom);
        const p = N.world.findFree(cx + 420, cy + 260, 'walk', 60) || { x: cx + 420, y: cy + 260 };
        N.player.teleport(p.x, p.y);
        R.camOverride = { x: cx, y: cy, zoom, snap: true };
        N.debug.setTime(hh, mm);
        R.warmChunks(cx, cy, 700);
      }, [lm, zoom, hh, mm, s.fx]);
      await page.waitForTimeout(240);
      const name = lm.id + (s.label ? '_' + s.label : '') + (zoom !== 1 ? '_z' : '') + '_' + tag + '.png';
      await page.screenshot({ path: path.join(OUT, name) });
      files.push([name, lm.id + (s.label ? ' [' + s.label + ']' : '') + ' ' + tag]);
      if (process.env.PERF) {
        const ms = await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 900)); const p = N.debug.perf(); return [p.drawMs, p.queued, (N.render.stats.ms.structures || 0).toFixed(2), (N.render.stats.ms.actors || 0).toFixed(2)]; });
        perf.push([name, ms]);
      }
      process.stdout.write('.');
    }
  }
  process.stdout.write('\n');
  await page.evaluate(() => { for (const k of Object.keys(N.placesArt.fx)) N.placesArt.fx[k] = null; });
  if (perf.length) for (const [n, m] of perf) console.log('perf', n.padEnd(44), 'draw', m[0], 'ms  queued', m[1], ' structures', m[2], 'actors', m[3]);
  const st = await page.evaluate(() => N.debug.state());
  if (st.errors && st.errors.length) errs.push(...st.errors.map((e) => 'N.errors: ' + e));

  // contact sheets (4 x 3 thumbnails each)
  if (!has('--no-sheets') && files.length) {
    const per = 12, cols = 4, tw = 480, th = 270;
    const sheet = await browser.newPage({ viewport: { width: cols * tw, height: 3 * (th + 18) } });
    for (let i = 0, n = 0; i < files.length; i += per, n++) {
      const chunk = files.slice(i, i + per).map(([f, label]) => ({ src: 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, f)).toString('base64'), label }));
      await sheet.setContent('<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(' + cols + ',' + tw + 'px);gap:0">' +
        chunk.map((c) => '<div style="width:' + tw + 'px;height:' + (th + 18) + 'px;overflow:hidden"><div style="font:12px monospace;color:#ffd;height:18px;background:#222;padding-left:4px">' + c.label + '</div><img src="' + c.src + '" style="width:' + tw + 'px;height:' + th + 'px;display:block"></div>').join('') + '</body>');
      await sheet.waitForTimeout(150);
      await sheet.screenshot({ path: path.join(OUT, 'sheet_' + String(n + 1).padStart(2, '0') + '.png') });
    }
  }
  await browser.close();
  if (errs.length) { console.log('ERRORS:\n' + errs.join('\n')); process.exit(1); }
  console.log('OK: ' + files.length + ' screenshots in tests/out/places/');
})().catch((e) => { console.error(e); process.exit(1); });
