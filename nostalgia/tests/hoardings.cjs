/* NOSTALGIA — tests/hoardings.cjs  (src/hoardings.js: advertisement hoardings in the busy centres, 2003)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/ameerpet.cjs).
 *  1. placed: roadside billboards and rooftop boards above minimums, at every busy centre; a mix of ads and films;
 *     every ad and film fictional (no real brand), nothing from after 2003
 *  2. deterministic: a reload puts the same boards in the same places with the same ads
 *  3. sane places: billboard legs on open ground off the road, facing a road 14-42 u away, no two too close, none
 *     inside a building; rooftop boards on flat roofs, one per building, none on the Ameerpet belt's buildings
 *  4. the poster atlas: one painted cell per ad and film
 *  5. 2D: Abids at noon and RTC X Roads at night draw with no error (screenshots tests/out/hoardings/)
 *  6. 3D: the boards built at Abids, one atlas mesh per chunk on one shared material, floodlit at night
 *  7. zero console errors, page errors and N.err
 *
 *   node nostalgia/tests/hoardings.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'hoardings');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 400) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// real brands of the boards' trades (drinks, soap, detergent, toothpaste, tea, biscuits, bikes, phones, fans,
// cement, TV, radio, cinemas) that must not appear, and what only came after 2003
const BANNED = /\b(COCA|COKE|PEPSI|THUMS|LIMCA|SPRITE|FANTA|MIRINDA|MAAZA|FROOTI|SLICE|LUX|LIFEBUOY|HAMAM|MEDIMIX|CINTHOL|SANTOOR|DETTOL|PEARS|MYSORE SANDAL|NIRMA|SURF|TIDE|ARIEL|RIN|WHEEL|COLGATE|PEPSODENT|CLOSE ?UP|BABOOL|BROOKE BOND|RED LABEL|TATA|LIPTON|PARLE|BRITANNIA|SUNFEAST|PRIYA|HERO|HONDA|BAJAJ|TVS|YAMAHA|SUZUKI|AIRTEL|HUTCH|IDEA|BSNL|CELLONE|RELIANCE|NOKIA|MOTOROLA|SAMSUNG|USHA|KHAITAN|ORIENT|CROMPTON|ACC|ULTRATECH|DECCAN CEMENTS?|SPEEDO|ZEE|SONY|ETV|GEMINI|DOORDARSHAN|MIRCHI|RED FM|BIG FM|RADIO CITY|PVR|INOX)\b/;
const LATER = /\b(SMARTPHONE|3G|4G|WHATSAPP|FACEBOOK|TOUCHSCREEN|LED|LCD|PLASMA|WWW|DTH|ONLINE|APP)\b/;

async function boot(page) {
  // a second boot must reload: goto() to the same URL (only a #hash) is a same-document jump that reloads nothing
  if (page.url() === URL) await page.reload(); else await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
}
const info = () => {
  const H = N.hoardings, st = H.stats();
  const ids = new Set(H.ADS.map((a) => a.id).concat(H.FILMS().map((t) => 'film:' + t)));
  const per = {}, unknown = [];
  let sig = 0;
  for (const s of H.list) {
    per[s.centre] = (per[s.centre] || 0) + 1;
    for (const a of [s.ad, s.back]) if (a && !ids.has(a)) unknown.push(a);
    const x = s.hoarding === 'bb' ? s.spot.x : s.b.x, y = s.hoarding === 'bb' ? s.spot.y : s.b.y;
    sig = (sig * 31 + Math.round(x * 10) + Math.round(y * 10) * 7 + s.ad.length + (s.back ? s.back.length * 3 : 0)) % 1000000007;
  }
  const words = [];
  for (const a of H.ADS) words.push(a.brand, a.sub || '', a.line, a.price || '');
  for (const t of H.FILMS()) words.push(t);
  const ads = Object.keys(st.ads);
  return { st, sig, per, unknown, words, centres: H.CENTRES.map((c) => c.place), nAds: ads.filter((a) => a.indexOf('film:') !== 0).length, nFilms: ads.filter((a) => a.indexOf('film:') === 0).length,
    first: H.list.slice(0, 8).map((s) => [s.hoarding, s.centre, s.ad, s.hoarding === 'bb' ? Math.round(s.spot.x) : Math.round(s.b.x)]) };
};

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {})); // (leave-page prompts on a reload)
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));

  console.log('\n== 1. placed');
  await boot(page);
  const d1 = await page.evaluate(info);
  const st = d1.st;
  check(st.billboards >= 40 && st.rooftop >= 30, `${st.billboards} roadside billboards and ${st.rooftop} rooftop boards`, st);
  check(st.centres === d1.centres.length, `every listed centre is a place of the map (${st.centres}/${d1.centres.length})`, d1.centres);
  const bare = d1.centres.filter((c) => !d1.per[c]);
  check(bare.length === 0, 'every busy centre has at least one hoarding', bare);
  check(d1.nAds >= 12 && d1.nFilms >= 4, `${d1.nAds} different ads and ${d1.nFilms} different films on the boards`, st.ads);
  check(d1.unknown.length === 0, 'every board shows an ad or film from the module', d1.unknown.slice(0, 5));
  const bad = d1.words.filter((t) => BANNED.test(t.toUpperCase()) || LATER.test(t.toUpperCase()));
  check(bad.length === 0, `ads and films (${d1.words.length} lines) name no real brand and nothing after 2003`, bad);

  console.log('\n== 2. deterministic');
  await boot(page);
  const d2 = await page.evaluate(info);
  check(d2.sig === d1.sig && JSON.stringify(d2.first) === JSON.stringify(d1.first), `a reload puts the same ${d2.st.billboards + d2.st.rooftop} boards in the same places`, { a: d1.first.slice(0, 2), b: d2.first.slice(0, 2) });

  console.log('\n== 3. sane places');
  const pl = await page.evaluate(() => {
    const H = N.hoardings, W = N.world, S = N.SURF, T = H.TUNE;
    const open = (x, y) => { const v = W.surfaceAt(x, y); return v === S.GROUND || v === S.GRASS || v === S.SAND; };
    const bbBad = [], close = [], inBldg = [], roofBad = [], twice = [], belt = [];
    const bbs = H.list.filter((s) => s.hoarding === 'bb');
    for (const s of bbs) {
      const p = s.spot, rp = W.nearestRoadPoint(p.x, p.y);
      const legs = [-0.36, 0.36].map((t) => [p.x + p.ax * p.bw * t, p.y + p.ay * p.bw * t]);
      const faces = rp && ((rp.x - p.x) * p.nx + (rp.y - p.y) * p.ny) > 0;
      if (!legs.every(([x, y]) => open(x, y)) || !rp || rp.dist < 14 || rp.dist > 42 || !faces) bbBad.push([s.centre, Math.round(p.x), Math.round(p.y), rp && Math.round(rp.dist)]);
      W.queryStructures(p.x - 2, p.y - 2, p.x + 2, p.y + 2, (b) => { if (b.t === 'bldg' && p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.d) inBldg.push(s.centre); });
    }
    for (let i = 0; i < bbs.length; i++) for (let j = i + 1; j < bbs.length; j++) if (Math.hypot(bbs[i].spot.x - bbs[j].spot.x, bbs[i].spot.y - bbs[j].spot.y) < T.minGap) close.push([bbs[i].centre, bbs[j].centre]);
    const seen = new Set();
    for (const s of H.list) {
      if (s.hoarding !== 'roof') continue;
      const b = s.b;
      if (b.t !== 'bldg' || !(b.h >= T.roofMinH) || b.mosque || ['hip', 'gable', 'frame'].includes(b.roofType) || s.face !== b.front) roofBad.push([s.centre, b.x, b.y, b.roofType]);
      if (seen.has(b)) twice.push(s.centre); seen.add(b);
      if (N.ameerpet && N.ameerpet.dressOf(b)) belt.push(s.centre);
    }
    return { n: bbs.length, bbBad, close, inBldg, roofBad, twice, belt };
  });
  check(pl.bbBad.length === 0, `${pl.n} billboards stand on open ground, 14-42 u off a road, facing it`, pl.bbBad.slice(0, 5));
  check(pl.close.length === 0 && pl.inBldg.length === 0, 'no two billboards crowd each other and none stands in a building', { close: pl.close.slice(0, 3), inBldg: pl.inBldg.slice(0, 3) });
  check(pl.roofBad.length === 0 && pl.twice.length === 0 && pl.belt.length === 0, 'rooftop boards: flat road-facing roofs, one per building, none on the coaching belt', pl);

  console.log('\n== 4. the poster atlas');
  const at = await page.evaluate(() => {
    const H = N.hoardings, A = H.atlas(), g = A.canvas.getContext('2d');
    const want = H.ADS.map((a) => a.id).concat(H.FILMS().map((t) => 'film:' + t));
    const blank = [];
    for (const id of want) {
      const c = H.cellOf(id);
      if (!c) { blank.push(id + ':missing'); continue; }
      const px = g.getImageData(c.x + 40, c.y + c.h / 2, c.w - 80, 1).data;
      let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 200) lit++;
      if (lit < (c.w - 80) * 0.9) blank.push(id);
    }
    return { cells: A.cells.size, want: want.length, blank };
  });
  check(at.cells === at.want && at.blank.length === 0, `atlas: ${at.cells} painted cells, one per ad and film`, at);

  console.log('\n== 5. 2D');
  await page.mouse.click(2, 2);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true; const d = document.getElementById('debug'); if (d) d.style.display = 'none'; });
  await sleep(800);
  for (const [name, at2, h] of [['abids_2d_noon', 'abids', 12], ['rtc_2d_night', 'rtc_x_roads', 21]]) {
    const e0 = errors.length;
    const n0 = await page.evaluate(([at2, h]) => { const p = N.places[at2]; N.player.teleport(p.x, p.y); N.debug.setTime(h, 0); N.render.baseZoom = 1.4; if (N.hud && N.hud.hide) N.hud.hide(); return N.errors.length; }, [at2, h]);
    await sleep(1800);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 });
    const n1 = await page.evaluate(() => N.errors.length);
    check(n1 === n0 && errors.length === e0, `2D ${name}: drawn with no error`, errors.slice(e0, e0 + 3));
  }
  await page.evaluate(() => { N.render.baseZoom = 1; });

  console.log('\n== 6. 3D');
  await page.evaluate(() => { const p = N.places.abids; N.player.teleport(p.x, p.y); N.debug.setTime(12, 0); N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 300000 });
  await page.evaluate(() => { N.view3d.setCamera({ yaw: 0.6, pitch: 0.12, snap: true }); N.view3d.settle(30000); });
  await sleep(2500);
  const v3 = await page.evaluate(() => {
    N.view3d.settle(30000);
    let groups = 0, meshes = 0, quads = 0;
    const mats = new Set();
    N.view3d.engine.city.traverse((o) => {
      if (o.name !== 'hoardings' || o.type !== 'Group') return;
      groups++; meshes += o.children.length;
      for (const m of o.children) { mats.add(m.material); const g = m.geometry; if (g && g.index) quads += g.index.count / 6; }
    });
    const near = N.hoardings.list.filter((s) => Math.hypot(s.cx - N.places.abids.x, s.cy - N.places.abids.y) < 260).length;
    return { groups, meshes, quads: Math.round(quads), mats: mats.size, near, signs: N.view3d.signCheck() };
  });
  check(v3.groups >= 1 && v3.quads >= v3.near, `3D: ${v3.quads} poster faces built round Abids (${v3.near} boards), in ${v3.groups} chunks`, v3);
  check(v3.meshes === v3.groups && v3.mats === 1, `3D: one atlas mesh per chunk on one shared material (${v3.meshes} meshes)`, v3);
  check(v3.signs.stale === 0 && v3.signs.negative === 0 && v3.signs.dropped === 0, 'sign atlas untouched: no stale, negative or dropped boards', v3.signs);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'abids_3d.png'), timeout: 240000 });
  await page.evaluate(() => { N.debug.setTime(22, 0); });
  await page.waitForFunction(() => { let m = null; N.view3d.engine.city.traverse((o) => { if (!m && o.name === 'hoardings' && o.type === 'Mesh') m = o; }); return !!(m && m.material.emissiveIntensity > 0.2); }, null, { timeout: 90000, polling: 500 }).catch(() => {});
  const glow = await page.evaluate(() => { let m = null; N.view3d.engine.city.traverse((o) => { if (!m && o.name === 'hoardings' && o.type === 'Mesh') m = o; }); return m ? +m.material.emissiveIntensity.toFixed(2) : null; });
  check(glow > 0.2, `3D: posters floodlit at night (emissive ${glow})`, glow);

  console.log('\n== 7. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 5));

  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
