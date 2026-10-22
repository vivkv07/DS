/* NOSTALGIA — tests/ameerpet.cjs  (src/ameerpet.js: the Ameerpet coaching belt; the Panjagutta mall site)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/view3d_landmarks.cjs).
 *  1. the belt is dressed: buildings / wall banners / rooftop hoardings / signboards above minimums, every banner
 *     line and signboard from the module's vocabulary, no real coaching brand and nothing taught only after 2003
 *  2. deterministic: a reload dresses the same buildings with the same lines
 *  3. 2D: the coaching lane and the Panjagutta site draw with no error (screenshots tests/out/ameerpet/)
 *  4. the Panjagutta site: landmark `panjagutta_mall_site` (draw mall_site) on the junction's corner, clear of
 *     the curated arterials, art registered in places_art (2D) and view3d_landmarks (3D)
 *  5. 3D: banner groups built in the coaching chunks, the sign atlas healthy (no stale / negative / dropped boards)
 *  6. 3D: the site's frame follows the calendar (3rd floor hidden in March 2003, up in October 2003)
 *  7. zero console errors, page errors and N.err
 *
 *   node nostalgia/tests/ameerpet.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'ameerpet');
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

// real coaching / IT brands that must not appear, and what Ameerpet only taught after 2003
const BANNED = /\b(NIIT|APTECH|SSI|INFOSYS|WIPRO|TCS|SATHYA|NARESH|DURGA|PEERS|IGROW|SRIHITHA|PVR|INOX)\b/;
const LATER = /\b(PYTHON|ANDROID|IPHONE|CLOUD|DEVOPS|SELENIUM|HADOOP|SALESFORCE|AWS|AZURE|ANGULAR|REACT|SPRING BOOT|DATA SCIENCE|BLOCKCHAIN|AI|MACHINE LEARNING|DOCKER|KUBERNETES)\b/;

async function boot(page) {
  // a second boot must reload: goto() to the same URL (only a #hash) is a same-document jump that reloads nothing
  if (page.url() === URL) await page.reload(); else await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
}
const dressInfo = () => {
  const A = N.ameerpet;
  const vocab = new Set();
  for (const i of A.INSTITUTES) { vocab.add(i.n); vocab.add(i.s); }
  for (const c of A.COURSES) { vocab.add(c.t); vocab.add(c.w); }
  for (const t of A.TAGS) vocab.add(t);
  const lines = [], foreign = [];
  let sig = 0;
  for (const s of A.dressed) {
    for (const bn of s.banners) for (const l of bn.lines) { lines.push(l.text); if (!vocab.has(l.text)) foreign.push(l.text); sig = (sig * 31 + l.text.length + Math.round(bn.t0 * 1000) + Math.round(s.b.x)) % 1000000007; }
    if (s.hoard) for (const l of s.hoard.lines) { lines.push(l.text); if (!vocab.has(l.text)) foreign.push(l.text); }
  }
  return { stats: A.stats(), sig, n: A.dressed.length, lines: Array.from(new Set(lines)), foreign, vocab: Array.from(vocab), first: A.dressed.slice(0, 8).map((s) => [Math.round(s.b.x), Math.round(s.b.y), s.banners.length, !!s.hoard, s.banners[0] ? s.banners[0].lines[0].text : '']) };
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

  console.log('\n== 1. the belt is dressed');
  await boot(page);
  const d1 = await page.evaluate(dressInfo);
  const st = d1.stats;
  check(st.buildings >= 40 && st.banners >= 80 && st.hoardings >= 15, `dressed ${st.buildings} buildings: ${st.banners} wall banners, ${st.hoardings} hoardings, ${st.signs} signboards`, st);
  check(d1.foreign.length === 0, 'every banner line comes from the vocabulary', d1.foreign.slice(0, 5));
  const bad = d1.vocab.filter((t) => BANNED.test(t) || LATER.test(t));
  check(bad.length === 0, `vocabulary (${d1.vocab.length} lines) has no real brand and nothing taught only after 2003`, bad);

  console.log('\n== 2. deterministic');
  await boot(page);
  const d2 = await page.evaluate(dressInfo);
  check(d2.sig === d1.sig && d2.n === d1.n && JSON.stringify(d2.first) === JSON.stringify(d1.first), `a reload dresses the same ${d2.n} buildings with the same lines`, { a: d1.first.slice(0, 2), b: d2.first.slice(0, 2) });

  console.log('\n== 3-4. 2D and the Panjagutta site');
  await page.mouse.click(2, 2);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true; const d = document.getElementById('debug'); if (d) d.style.display = 'none'; });
  await sleep(800);
  const site = await page.evaluate(() => {
    const lm = N.WORLD_DATA.landmarks.find((l) => l.id === 'panjagutta_mall_site'), J = N.places.panjagutta;
    if (!lm) return null;
    const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2, x1 = x0 + lm.w, y1 = y0 + lm.d;
    // no curated arterial / street (non-OSM) crosses the site
    const crossing = [];
    for (const r of N.WORLD_DATA.roads) {
      if (r.src === 'osm' || /^ln_o/.test(r.id) || r.kind === 'path') continue;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        for (let t = 0; t <= 1; t += 0.05) { const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (x > x0 - r.w / 2 && x < x1 + r.w / 2 && y > y0 - r.w / 2 && y < y1 + r.w / 2) { crossing.push(r.id); break; } }
      }
    }
    return { draw: lm.draw, d: Math.round(Math.hypot(lm.x - J.x, lm.y - J.y)), crossing: Array.from(new Set(crossing)), art2d: !!(N.placesArt && N.placesArt.defs && N.placesArt.defs.mall_site), art3d: !!(N.view3dLandmarks && N.view3dLandmarks.DEFS && N.view3dLandmarks.DEFS.has('mall_site')) };
  });
  check(site && site.draw === 'mall_site' && site.d < 140, 'panjagutta_mall_site is a mall_site landmark on the junction corner', site);
  check(site && !site.crossing.length, 'no curated road runs through the site', site && site.crossing);
  check(site && site.art2d && site.art3d, 'mall_site art is registered in 2D (places_art) and 3D (view3d_landmarks)', site);
  for (const [name, at, date] of [['coaching_2d', 'ameerpet_coaching', [2003, 6, 7]], ['site_2d_mar', '#panjagutta_mall_site', [2003, 3, 10]], ['site_2d_oct', '#panjagutta_mall_site', [2003, 10, 10]]]) {
    const e0 = errors.length;
    const n0 = await page.evaluate(([at, date]) => {
      if (at[0] === '#') { const lm = N.WORLD_DATA.landmarks.find((l) => l.id === at.slice(1)); N.player.teleport(lm.x - lm.w / 2 - 40, lm.y); } else N.debug.teleport(at);
      N.calendar.set(date[0], date[1], date[2], 12, 0);
      if (N.hud && N.hud.hide) N.hud.hide();
      return N.errors.length;
    }, [at, date]);
    await sleep(1800);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 });
    const n1 = await page.evaluate(() => N.errors.length);
    check(n1 === n0 && errors.length === e0, `2D ${name}: drawn with no error`, errors.slice(e0, e0 + 3));
  }

  console.log('\n== 5. 3D banners and the sign atlas');
  await page.evaluate(() => { N.debug.teleport('ameerpet_coaching'); N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 300000 });
  await page.evaluate(() => { const p = N.places.ameerpet_coaching; N.player.teleport(p.x, p.y + 60); N.view3d.setCamera({ yaw: -1.2, pitch: 0.12, snap: true }); N.view3d.settle(30000); });
  await sleep(2500);
  const v3 = await page.evaluate(() => {
    N.view3d.settle(30000);
    let groups = 0, meshes = 0, quads = 0;
    N.view3d.engine.city.traverse((o) => {
      if (o.name !== 'ameerpet_banners') return;
      groups++; meshes += o.children.length;
      for (const m of o.children) { const p = m.geometry && m.geometry.getAttribute('position'); if (p) quads += (m.geometry.index ? m.geometry.index.count / 6 : p.count / 6); }
    });
    return { groups, meshes, quads: Math.round(quads), signs: N.view3d.signCheck() };
  });
  check(v3.groups >= 2 && v3.quads >= 100, `3D: ${v3.quads} banner / hoarding boards built near the coaching lane, in ${v3.groups} chunks`, v3);
  check(v3.meshes <= v3.groups * 3, `3D: boards batched per chunk and sign page (${v3.meshes} meshes for ${v3.groups} chunks)`, v3);
  check(v3.signs.stale === 0 && v3.signs.negative === 0 && v3.signs.dropped === 0, 'sign atlas: no stale, negative or dropped boards', v3.signs);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'coaching_3d.png'), timeout: 240000 });

  console.log('\n== 6. 3D: the site follows the calendar');
  const lv = [];
  for (const [date, want] of [[[2003, 3, 10], 1], [[2003, 10, 10], 3]]) {
    await page.evaluate((date) => {
      const lm = N.WORLD_DATA.landmarks.find((l) => l.id === 'panjagutta_mall_site');
      N.calendar.set(date[0], date[1], date[2], 12, 0);
      N.player.teleport(lm.x - lm.w / 2 - 60, lm.y + 10); N.view3d.setCamera({ yaw: 0.1, pitch: 0.12, snap: true }); N.view3d.settle(30000);
    }, date);
    // the model's tick applies the level on its next 3D frame (SwiftShader: well under one frame a second)
    await page.waitForFunction((want) => {
      const o = N.view3d.engine.lmGroup.children.find((c) => c.name === 'lm3d:panjagutta_mall_site');
      return !!(o && o.userData.lm3d && o.userData.lm3d.lv === want);
    }, want, { timeout: 90000, polling: 500 }).catch(() => {});
    lv.push(await page.evaluate(() => {
      N.view3d.settle(30000);
      const o = N.view3d.engine.lmGroup.children.find((c) => c.name === 'lm3d:panjagutta_mall_site');
      if (!o) return null;
      const l2 = o.getObjectByName('l2'), l3 = o.getObjectByName('l3');
      return { l2: !!(l2 && l2.visible), l3: !!(l3 && l3.visible) };
    }));
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'site_3d_' + date[1] + '.png'), timeout: 240000 });
  }
  check(lv[0] && lv[1] && !lv[0].l2 && !lv[0].l3 && lv[1].l2 && lv[1].l3, 'the frame is one floor in March 2003 and three in October 2003', lv);

  console.log('\n== 7. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 5));

  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
