#!/usr/bin/env node
/* NOSTALGIA — tests/map_preview.cjs
 * 1. Renders N.WORLD_DATA into a 2000 x 1500 top-down overview PNG with labels for every
 *    landmark and must-have place: tests/out/map_overview.png (+ zoomed crops map_*.png).
 *    Map v2: the world size comes from WORLD_DATA.size; districts are drawn from their polygons.
 * 2. If the real engine exists (index.html + src/world.js + src/main.js), opens
 *    index.html#debug, starts a game, teleports to 30+ landmarks and screenshots each
 *    (tests/out/map_tp_<id>.png). Fails on any page/console error.
 * Usage: node tests/map_preview.cjs [--no-engine] [--only-engine] [--overview-only]
 *   WORLDDATA=path/to/worlddata.js  preview (and serve to the engine) a candidate map instead of
 *                                   src/worlddata.js (the builder writes src/.worlddata.next.js)
 *   TP=id,id                        limit the teleports
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { loadWorldData, MUST, HERITAGE_DRAWS } = require('../tools/validate_map.cjs');
const WD_FILE = process.env.WORLDDATA ? path.resolve(process.env.WORLDDATA) : undefined;

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);

const MUST_IDS = new Set(MUST.filter((m) => !m.includes('*')));

// Drawn in the page. data = WORLD_DATA; view = {x, y, w, h, scale, labels:'major'|'all'}
function renderPage(data, view, MUSTARR) {
  const MUSTSET = new Set(MUSTARR);
  const cv = document.getElementById('c');
  cv.width = Math.round(view.w * view.scale); cv.height = Math.round(view.h * view.scale);
  const g = cv.getContext('2d');
  const S = view.scale;
  g.setTransform(S, 0, 0, S, -view.x * S, -view.y * S);
  const WW = (data.size || [8000, 6000])[0], WH = (data.size || [8000, 6000])[1];
  g.fillStyle = '#6b5a48'; g.fillRect(0, 0, WW, WH);
  const poly = (p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); };
  if (data.districtGrid) { // exact gap-free district ground from the run-length grid
    const dg = data.districtGrid; let k = 0, cell = 0;
    for (let r = 0; r < dg.rle.length; r += 2) { const d = data.districts[dg.rle[r]], n = dg.rle[r + 1]; g.fillStyle = d ? d.ground : '#6b5a48'; let left = n; while (left > 0) { const i = cell % dg.w, j = (cell - i) / dg.w, run = Math.min(left, dg.w - i); g.fillRect(i * dg.cell, j * dg.cell, run * dg.cell + 1.5 / S, dg.cell + 1.5 / S); cell += run; left -= run; } k++; }
  } else for (const d of data.districts) { g.fillStyle = d.ground; g.fillRect(...d.rect); }
  if (data.districts.some((d) => d.poly)) { g.strokeStyle = 'rgba(40,25,15,0.35)'; g.lineWidth = 2 / S; for (const d of data.districts) for (const p of d.polys || [d.poly]) { poly(p); g.stroke(); } }
  const line = (p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); };
  const PK = { grass: '#5b8a3c', garden: '#4f8a3a', ground: '#c09468', plaza: '#ddd0b2', rock: '#a28468' };
  for (const p of data.parks) { g.fillStyle = p.surface === 'sand' ? '#d6bd8a' : PK[p.kind] || '#5b8a3c'; poly(p.poly); g.fill('evenodd'); }
  for (const w of data.water) {
    if (w.bank) { poly(w.poly); g.strokeStyle = '#cdb489'; g.lineWidth = w.bank * 2; g.lineJoin = 'round'; g.stroke(); }
    g.fillStyle = w.color || '#2f7f86'; poly(w.poly); g.fill('evenodd');
  }
  // blocks
  for (const b of data.blocks) { g.fillStyle = 'rgba(120,96,80,0.32)'; g.fillRect(...b.rect); g.strokeStyle = 'rgba(80,60,50,0.35)'; g.lineWidth = 1 / S; g.strokeRect(...b.rect); }
  // roads
  const FOOT = { arterial: 10, street: 7, bund: 9 };
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (S < 0.2) for (const r of data.roads) if (r.src === 'osm' || r.src === 'grid') r._thin = true;
  for (const r of data.roads) { if (FOOT[r.kind] && !r._thin) { g.strokeStyle = '#a89a86'; g.lineWidth = r.w + FOOT[r.kind] * 2; line(r.pts); g.stroke(); } }
  const RC = { arterial: '#3e3d44', street: '#55535a', lane: '#8a7c6a', bund: '#4c4b52', bridge: '#7a6a5a', path: '#d8c8a0' };
  for (const r of data.roads) { g.strokeStyle = r._thin ? 'rgba(120,108,92,0.9)' : RC[r.kind] || '#555'; g.lineWidth = r._thin ? Math.max(r.w * 0.6, 1.2 / S) : r.w; line(r.pts); g.stroke(); }
  for (const r of data.roads) if (r.kind === 'arterial' && S > 0.3) { g.strokeStyle = 'rgba(240,220,120,0.6)'; g.lineWidth = 1.2; g.setLineDash([10, 8]); line(r.pts); g.stroke(); g.setLineDash([]); }
  // rails
  for (const r of data.rails || []) {
    g.strokeStyle = '#4a3a30'; g.lineWidth = r.w || 16; line(r.pts); g.stroke();
    g.strokeStyle = '#c8c0b0'; g.lineWidth = 2; g.setLineDash([3, 3]); line(r.pts); g.stroke(); g.setLineDash([]);
  }
  // buildings
  for (const b of data.buildings) { g.fillStyle = b.color || '#d8c8a8'; g.fillRect(...b.rect); g.strokeStyle = '#5a4030'; g.lineWidth = 1 / S; g.strokeRect(...b.rect); }
  // rocks, trees
  for (const r of data.rocks) { g.fillStyle = '#8f8a86'; g.beginPath(); g.arc(r.x, r.y, r.r, 0, 7); g.fill(); }
  for (const t of data.trees) { g.fillStyle = t.kind === 'palm' || t.kind === 'coconut' ? '#7aa040' : '#2f6a2a'; g.beginPath(); g.arc(t.x, t.y, Math.max(3, t.r * 0.8), 0, 7); g.fill(); }
  // landmarks
  const HERITAGE = new Set(view.heritage);
  for (const l of data.landmarks) {
    const her = HERITAGE.has(l.draw);
    g.fillStyle = her ? 'rgba(200,60,50,0.85)' : 'rgba(40,90,180,0.85)';
    if (l.noSolid) g.fillStyle = her ? 'rgba(200,60,50,0.35)' : 'rgba(40,90,180,0.35)';
    g.fillRect(l.x - l.w / 2, l.y - l.d / 2, l.w, l.d);
    if (l.solids) { g.fillStyle = 'rgba(0,0,0,0.5)'; for (const s of l.solids) g.fillRect(...s); }
    if (l.face && S >= 0.5) { // entrance tick
      const f = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[l.face];
      g.strokeStyle = '#fff'; g.lineWidth = 2 / S; g.beginPath(); g.moveTo(l.x + f[0] * l.w / 2 * 0.6, l.y + f[1] * l.d / 2 * 0.6); g.lineTo(l.x + f[0] * (l.w / 2 + 4), l.y + f[1] * (l.d / 2 + 4)); g.stroke();
    }
  }
  // places
  const KC = { landmark: '#ffd84a', kirana: '#ff8a3a', irani_cafe: '#2ad0b8', school: '#ffffff', playground: '#b8ff6a', std_booth: '#ffe000',
    banana_cart: '#ffe060', flower_cart: '#ff60c0', stationery: '#80a0ff', pindi_girni: '#f0f0f0', giver: '#ff3030', hidden: '#c060ff', bus_stop: '#ff4040' };
  const labels = [];
  for (const p of data.places) {
    const must = MUSTSET.has(p.id);
    g.fillStyle = KC[p.kind] || (must ? '#ffd84a' : '#f0e0c0');
    const r = (must ? 5 : 3) / S;
    g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1 / S; g.stroke();
    if (view.labels === 'all' || must) labels.push({ x: p.x, y: p.y, t: view.labels === 'all' ? p.id : p.name.replace(/\s*\(.*\)/, ''), must });
  }
  if (view.labels === 'all') for (const l of data.landmarks) if (!data.places.some((p) => p.id === l.id)) labels.push({ x: l.x, y: l.y, t: '[' + l.id + ']', lm: true });
  // labels in screen space with simple collision avoidance
  g.setTransform(1, 0, 0, 1, 0, 0);
  const fs = view.labels === 'all' ? 11 : 12;
  g.font = (view.labels === 'all' ? '' : 'bold ') + fs + 'px sans-serif'; g.textBaseline = 'middle';
  const boxes = [];
  labels.sort((a, b) => (b.must ? 1 : 0) - (a.must ? 1 : 0));
  for (const L of labels) {
    const sx = (L.x - view.x) * S, sy = (L.y - view.y) * S; const w = g.measureText(L.t).width;
    let placed = null;
    for (const [dx, dy] of [[6, 0], [6, -12], [6, 12], [-w - 6, 0], [-w - 6, -12], [-w - 6, 12], [-w / 2, -16], [-w / 2, 16], [6, -24], [6, 24], [-w - 6, 24], [-w - 6, -24]]) {
      const bx = sx + dx, by = sy + dy - fs / 2, bw = w, bh = fs;
      if (!boxes.some((b) => bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + b[3] && by + bh > b[1])) { placed = [bx, by, bw, bh]; break; }
    }
    if (!placed) placed = [sx + 6, sy - fs / 2, w, fs];
    boxes.push(placed);
    g.fillStyle = 'rgba(20,14,10,0.62)'; g.fillRect(placed[0] - 2, placed[1] - 1, placed[2] + 4, placed[3] + 2);
    g.fillStyle = L.lm ? '#9cc8ff' : L.must ? '#ffe680' : '#fff';
    g.fillText(L.t, placed[0], placed[1] + fs / 2 + 0.5);
  }
  // district names (overview): at the polygon's centroid
  if (view.labels !== 'all') {
    g.font = 'italic 13px serif'; g.fillStyle = 'rgba(40,25,15,0.6)';
    for (const d of data.districts) {
      let cx, cy;
      if (d.poly) { let a = 0, x = 0, y = 0; const p = d.poly; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const f = p[j][0] * p[i][1] - p[i][0] * p[j][1]; a += f; x += (p[j][0] + p[i][0]) * f; y += (p[j][1] + p[i][1]) * f; } cx = x / (3 * a); cy = y / (3 * a); }
      else { cx = d.rect[0] + 30; cy = d.rect[1] + 30; }
      const t = d.name.split(' & ')[0], w = g.measureText(t).width; g.fillText(t, (cx - view.x) * S - w / 2, (cy - view.y) * S);
    }
  }
  // title + legend
  if (view.title) {
    g.fillStyle = 'rgba(20,14,10,0.8)'; g.fillRect(8, cv.height - 64, 900, 56);
    g.fillStyle = '#ffe680'; g.font = 'bold 16px sans-serif'; g.fillText(view.title, 16, cv.height - 46);
    g.font = '12px sans-serif'; g.fillStyle = '#fff';
    g.fillText('red = heritage art (landmarks.js)   blue = civic/everyday art (places_art.js)   yellow dots = must-have places   ' + (view.credit || ''), 16, cv.height - 26);
  }
}

async function overview(browser, D) {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1500 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.setContent('<html><body style="margin:0;background:#111"><canvas id="c"></canvas></body></html>');
  const heritage = HERITAGE_DRAWS;
  const [WW, WH] = D.size || [8000, 6000];
  const v2 = WW > 8000;
  const P = (id) => { const p = D.places.find((q) => q.id === id); return p ? [p.x, p.y] : [WW / 2, WH / 2]; };
  const around = (file, id, w, h, scale) => { const [x, y] = P(id); return { file, x: Math.max(0, Math.round(x - w / 2)), y: Math.max(0, Math.round(y - h / 2)), w, h, scale, labels: 'all' }; };
  const shots = (v2 ? [
    { file: 'map_overview.png', x: 0, y: 0, w: WW, h: WH, scale: 2000 / WW, labels: 'major', title: `NOSTALGIA Map v2 — the real Hyderabad & Secunderabad (${WW} x ${WH} u)`, credit: 'Map: DataMeet Municipal Spatial Data (CC BY 4.0), © OpenStreetMap contributors (ODbL)' },
    around('map_core.png', 'abids', 2600, 1900, 0.62),
    around('map_oldcity.png', 'charminar', 1900, 1500, 0.85),
    around('map_lake.png', 'buddha_statue', 3600, 2800, 0.42),
    around('map_colony.png', 'home', 1500, 1100, 1),
    around('map_secunderabad.png', 'secunderabad_clock_tower', 2600, 1900, 0.6),
    { file: 'map_east.png', x: 10000, y: 1500, w: 5000, h: 8000, scale: 0.25, labels: 'all' },
    { file: 'map_west.png', x: 0, y: 0, w: 7000, h: 8000, scale: 0.25, labels: 'all' },
    { file: 'map_south.png', x: 3000, y: 7000, w: 12000, h: 4250, scale: 0.16, labels: 'all' },
  ] : [
    { file: 'map_overview.png', x: 0, y: 0, w: 8000, h: 6000, scale: 0.25, labels: 'major', title: 'NOSTALGIA — Hyderabad & Secunderabad (8000 x 6000 u)' },
    { file: 'map_core.png', x: 3150, y: 1950, w: 2350, h: 1650, scale: 0.85, labels: 'all' },
    { file: 'map_oldcity.png', x: 2900, y: 3550, w: 2200, h: 1650, scale: 0.85, labels: 'all' },
    { file: 'map_lake.png', x: 3000, y: 500, w: 2600, h: 1700, scale: 0.75, labels: 'all' },
    { file: 'map_east.png', x: 4600, y: 1100, w: 3400, h: 3600, scale: 0.5, labels: 'all' },
    { file: 'map_west.png', x: 0, y: 0, w: 3400, h: 4000, scale: 0.5, labels: 'all' },
    { file: 'map_south.png', x: 1400, y: 3700, w: 6600, h: 2300, scale: 0.4, labels: 'all' },
  ]).filter((s) => !args.includes('--overview-only') || s.file === 'map_overview.png');
  for (const s of shots) {
    await page.setViewportSize({ width: Math.round(s.w * s.scale), height: Math.round(s.h * s.scale) });
    await page.evaluate(([d, v, m, fn]) => { eval('(' + fn + ')')(d, v, m); }, [D, Object.assign({ heritage }, s), [...MUST_IDS], renderPage.toString()]);
    const el = await page.$('#c');
    await el.screenshot({ path: path.join(OUT, s.file) });
    console.log('wrote', path.join('tests/out', s.file));
  }
  if (errs.length) throw new Error('preview page errors: ' + errs.join('\n'));
  await page.close();
}

async function engineShots(browser, D) {
  const need = ['index.html', 'src/world.js', 'src/main.js'].every((f) => fs.existsSync(path.join(ROOT, f)));
  if (!need) { console.log('engine not present yet; skipping teleport shots'); return; }
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  const errs = [];
  // world_extras.js (rails) is loaded right after world.js; inject it if index.html does not list it yet
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!/world_extras\.js/.test(html)) {
    console.log('note: index.html does not load src/world_extras.js yet; injecting it for this test');
    await page.route(/index\.html/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html.replace('<script src="src/world.js"></script>', '<script src="src/world.js"></script>\n<script src="src/world_extras.js"></script>') }));
  }
  if (process.env.WORLDDATA) {
    const cand = fs.readFileSync(path.resolve(process.env.WORLDDATA), 'utf8');
    await page.route(/src\/worlddata\.js$/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: cand }));
    console.log('engine: serving the candidate map', process.env.WORLDDATA);
  }
  page.on('pageerror', (e) => errs.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html') + '#debug');
  await page.waitForFunction(() => window.N && N.world && N.world.built && N.debug, null, { timeout: 90000 });
  await page.evaluate(() => { try { N.debug.newGame({ skipIntro: true }); } catch (e) { console.warn(e); } });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({ world: [N.WORLD_W, N.WORLD_H], buildMs: N.world.buildMs, phases: N.world.buildPhases, structures: N.world.structures.length, lots: N.world.lots.length, nodes: N.world.roads.nodes.length, edges: N.world.roads.edges.length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, state: N.debug.state() }));
  console.log('engine', JSON.stringify(info));
  const ids = (process.env.TP || 'charminar,gulzar_houz,mecca_masjid,laad_bazaar,naya_pul,salar_jung_museum,high_court,imlibun_bus_station,koti_bus_stand,gokul_chat,abids,mozamjahi_market,nampally_station,nampally_exhibition,public_gardens,assembly,lb_stadium,birla_mandir,lumbini_park,buddha_statue,tank_bund,necklace_road,prasads_imax,ntr_gardens,sanjeevaiah_park,indira_park,rtc_x_roads,home,kachiguda_station,secunderabad_clock_tower,secunderabad_station,paradise,parade_grounds,begumpet_airport,cyber_towers,golconda_fort,qutb_shahi_tombs,dilsukhnagar_sai_temple,osmania_university,falaknuma_palace,mir_alam_tank,rythu_bazaar_erragadda').split(',');
  for (const id of ids) {
    const ok = await page.evaluate((id) => { const r = N.debug.teleport(id); N.debug.setTime(16, 30); if (N.render.snapCamera) N.render.snapCamera(); if (N.render.warmChunks) N.render.warmChunks(N.player.x, N.player.y, 700); return r; }, id);
    if (!ok) { errs.push('teleport failed: ' + id); continue; }
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, 'map_tp_' + id + '.png') });
    const st = await page.evaluate(() => N.debug.state());
    console.log('tp', id.padEnd(26), JSON.stringify(st.player), st.district, st.surface);
  }
  const st = await page.evaluate(() => N.debug.state());
  if (st.errors && st.errors.length) errs.push(...st.errors.map((e) => 'N.errors: ' + e));
  await page.close();
  if (errs.length) { console.log('ENGINE ERRORS:\n' + errs.join('\n')); process.exitCode = 1; }
}

(async () => {
  const D = loadWorldData(WD_FILE);
  const browser = await chromium.launch();
  try {
    if (!args.includes('--only-engine')) await overview(browser, D);
    if (!args.includes('--no-engine') && !args.includes('--overview-only')) await engineShots(browser, D);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
