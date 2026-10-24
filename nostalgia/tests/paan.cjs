/* NOSTALGIA — tests/paan.cjs  (paan.js: the paan shops beside the cafés)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/breakers.cjs).
 *  1. placement: a paan shop beside (nearly) every Irani café, bakery, chai bandi, restaurant, food place and
 *     Banjara / Jubilee coffee bar; each kiosk on the collision grid (solid), its customer spot open ground (not the
 *     road), its counter facing the nearest road, 12-60 u from its café, none within 18 u of another, clear of the
 *     places' own spots (a mission giver 36 u: one stood on the Himayatnagar giver's spot); deterministic
 *  2. the shop: N.shops 'paan_shop' at every one (the card's rows: meetha paan ★ ₹4, goli soda...), buying a meetha
 *     paan takes ₹4 and feeds him; closed at 03:00, open at noon; nothing with tobacco on the card
 *  3. life round it: the crowd zone (men standing about) fills near one; the paan-wala stands behind the counter while
 *     the shop is open and he is near, and is gone when it shuts
 *  4. 3D: the kiosk and its painted board in the chunk (the 'paan-sign' mesh where the board is)
 *  5. screenshots: 2D and 3D (tests/out/paan)
 *  6. zero console errors, page errors and N.err
 *   node nostalgia/tests/paan.cjs        (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'paan');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 600) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    N.debug.setTime(12, 0);
    window.__errs = []; const e0 = N.err; N.err = function (k, e) { window.__errs.push(k + ': ' + (e && e.message)); return e0.apply(this, arguments); };
    window.__rw = (secs) => new Promise((res) => { const r0 = N.time.real, t0 = performance.now(); (function chk() { if (N.time.real - r0 >= secs || performance.now() - t0 > 120000) res(N.time.real - r0); else setTimeout(chk, 50); })(); });
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });
  await page.waitForFunction(() => N.time.real > 1.5, null, { timeout: 240000, polling: 500 });

  console.log('\n== 1. placement');
  const d1 = await page.evaluate(() => {
    const P = N.paan, st = P.stats(), W = N.world, S = N.SURF, list = P.list;
    const anchorKinds = { irani_cafe: 1, bakery: 1, iyengar_bakery: 1, chai_bandi: 1, restaurant: 1, food: 1 };
    const raw = N.WORLD_DATA.places.filter((p) => anchorKinds[p.kind] && !p.alias && !p.paan);
    let bad = [];
    for (const sh of list) {
      const solid = W.surfaceAt(sh.cx, sh.cy) === S.SOLID;
      const spot = W.surfaceAt(sh.x, sh.y);
      const rp = W.nearestRoadPoint(sh.cx, sh.cy), toRoad = rp ? ((rp.x - sh.cx) * sh.ox + (rp.y - sh.cy) * sh.oy) / Math.max(1, Math.hypot(rp.x - sh.cx, rp.y - sh.cy)) : -1;
      const anc = sh.anchor.indexOf('hills:') === 0 ? null : N.places[sh.anchor];
      const dA = anc ? Math.hypot(anc.x - sh.cx, anc.y - sh.cy) : 30;
      const close = list.some((q) => q !== sh && Math.hypot(q.cx - sh.cx, q.cy - sh.cy) < 17.9);
      if (!solid || spot === S.ROAD || spot === S.SOLID || toRoad < 0.99 || dA < 11 || dA > 62 || close) bad.push({ id: sh.id, solid, spot, toRoad: +toRoad.toFixed(2), dA: Math.round(dA), close });
    }
    // clear of the places' own spots: givers / home 36 u, stairs / terraces 24, any other 14 (its own café excepted)
    const K = P.TUNE.keep, clearBad = [];
    for (const sh of list) for (const id in N.places) {
      const p = N.places[id]; if (!p || p.kind === 'paan_shop' || id === sh.anchor) continue;
      const r = K[p.kind] || (/^giver_/.test(id) ? K.giver : K.place), d = Math.hypot(p.x - sh.cx, p.y - sh.cy);
      if (d < r - 0.01) clearBad.push(sh.id + ' ' + id + ' ' + d.toFixed(1) + '<' + r);
    }
    const h0 = list.map((s) => s.id + ':' + Math.round(s.cx) + ',' + Math.round(s.cy)).join('|');
    P._build();
    const h1 = P.list.map((s) => s.id + ':' + Math.round(s.cx) + ',' + Math.round(s.cy)).join('|');
    return { st, anchors: raw.length, bad: bad.slice(0, 5), nbad: bad.length, same: h0 === h1, n: list.length, clearBad };
  });
  check(d1.st.shops >= 40 && d1.st.missed.length <= 4, `${d1.st.shops} paan shops (${Object.entries(d1.st.byAnchor).map((e) => e[0] + ' ' + e[1]).join(', ')}; without a spot: ${d1.st.missed.length})`, d1.st);
  check(['irani_cafe', 'bakery', 'chai_bandi', 'coffee'].every((k) => d1.st.byAnchor[k] > 0), 'beside Irani cafés, bakeries, chai bandis and the Banjara / Jubilee coffee bars', d1.st.byAnchor);
  check(d1.nbad === 0, 'every kiosk solid, its customer spot open ground, its counter facing the nearest road, 12-60 u from its café, none within 18 u of another', d1.bad);
  check(d1.clearBad.length === 0, 'clear of the places: none within 36 u of a mission giver or home, 24 of stairs, 14 of any other spot', d1.clearBad.slice(0, 6));
  check(d1.same, 'deterministic: a rebuild puts them in the same places');

  console.log('\n== 2. the shop');
  const d2 = await page.evaluate(async () => {
    const sh = N.paan.list[0], id = sh.id, def = N.shops.defs[id];
    const K = N.shops.KINDS.paan_shop;
    const rows = K.rows.map((r) => r.id + ':' + r.price);
    const tobacco = K.rows.some((r) => /cigarette|gutka|tobacco|zarda|beedi/i.test(r.name + ' ' + (r.sub || '')));
    N.clock.set(3, 0); const night = N.shops.status(id);
    N.clock.set(12, 0); const noon = N.shops.status(id);
    N.player.teleport(sh.x, sh.y);
    await window.__rw(0.3);
    const m0 = N.player.money, e0 = N.player.energy;
    N.player.tummy = 100; N.player.energy = 40;
    const eB = N.player.energy;
    const r = N.shops.buy(id, 'meetha_paan');
    return { kind: def && def.kind, rows, tobacco, night: night.open, noon: noon.open, buy: r, paid: m0 - N.player.money, fed: N.player.energy - eB, e0, label: N.interact && N.interact.current ? String(typeof N.interact.current.label === 'function' ? N.interact.current.label() : N.interact.current.label) : null };
  });
  check(d2.kind === 'paan_shop' && d2.rows.indexOf('meetha_paan:400') === 0, `a shop at every paan kiosk (rows ${d2.rows.join(', ')})`, d2);
  check(!d2.tobacco, 'nothing with tobacco on the card');
  check(!d2.night && d2.noon, 'closed at 03:00, open at noon', d2);
  check(d2.buy && d2.buy.ok && d2.paid === 400 && d2.fed > 0, `a meetha paan: ₹4 paid, energy +${d2.fed}`, d2);
  check(/paan/i.test(d2.label || ''), `at the counter: "${d2.label}"`, d2);

  console.log('\n== 3. life round it');
  const d3 = await page.evaluate(async () => {
    const sh = N.paan.list.find((q) => q.anchor === 'grand_hotel') || N.paan.list[0];
    N.clock.set(19, 0);
    N.player.teleport(sh.x + sh.ox * 30, sh.y + sh.oy * 30);
    await window.__rw(8);
    const zone = !!N.traffic.TUNE.zones.paan_shop;
    const crowd = N.traffic.peds.filter((p) => p.alive && p.zone && p.zone.place && p.zone.place.id === sh.id).length;
    const k = N.npcs.get('paan:' + sh.id);
    const keeper = k ? { inside: Math.hypot(k.x - sh.cx, k.y - sh.cy) < 3, id: k.npcId } : null;
    N.clock.set(23, 50);
    await window.__rw(1.5);
    const after = !!N.npcs.get('paan:' + sh.id);
    N.clock.set(12, 0);
    return { zone, crowd, keeper, after, keepers: N.paan.stats().keepers };
  });
  check(d3.zone && d3.crowd >= 1, `men standing about at the paan shop (${d3.crowd} in its crowd zone)`, d3);
  check(d3.keeper && d3.keeper.inside, `the paan-wala behind his counter (${d3.keeper && d3.keeper.id})`, d3);
  check(!d3.after, 'the shop shut at 23:50: he has gone home', d3);

  console.log('\n== 4. 3D');
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 0.5 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
  const d4 = await page.evaluate(async () => {
    const sh = N.paan.list.find((q) => q.anchor === 'grand_hotel') || N.paan.list[0];
    N.clock.set(18, 40);
    const px = sh.x + sh.ox * 16 + sh.ux * 3, py = sh.y + sh.oy * 16 + sh.uy * 3;
    N.player.teleport(px, py);
    N.view3d.setCamera({ yaw: Math.atan2(sh.cy - py, sh.cx - px), pitch: 0.16, snap: true }); N.view3d.settle(30000);
    await window.__rw(2);
    const E = N.view3d.engine; let sign = null;
    E.scene.traverse((o) => { if (o.name === 'paan-sign') { const p = new N.view3d.THREE.Vector3(); o.getWorldPosition(p); const d = Math.hypot(p.x - (sh.cx + sh.ox * 3.96), p.z - (sh.cy + sh.oy * 3.96)); if (!sign || d < sign.d) sign = { d, y: p.y }; } });
    return { name: sh.name, sign };
  });
  check(d4.sign && d4.sign.d < 1.5, `the painted board (${d4.name}) over the counter in 3D (${d4.sign ? d4.sign.d.toFixed(2) : '-'} u from where it belongs)`, d4);
  if (SHOTS) {
    await sleep(8000);
    await page.screenshot({ path: path.join(OUT, 'paan_3d_grand_hotel.png'), timeout: 300000 });
    await page.evaluate(() => N.view.set('top'));
    await sleep(4000);
    await page.screenshot({ path: path.join(OUT, 'paan_2d_grand_hotel.png'), timeout: 300000 });
    ok('screenshots in tests/out/paan');
  }

  console.log('\n== 6. errors');
  const errs = await page.evaluate(() => window.__errs);
  check(!errors.length && !errs.length, 'zero console errors, page errors and N.err', { errors: errors.slice(0, 5), errs: errs.slice(0, 5) });
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAIL' : 'all ok'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
