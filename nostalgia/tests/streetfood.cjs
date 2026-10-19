/* NOSTALGIA — tests/streetfood.cjs (street-food scenes, src/streetfood.js, design/atmosphere.md)
 *
 *   top    desktop 800x450, top-down: the spot catalogue (every food kind on the map + the extra carts),
 *          the crowd schedules (morning / late-night dosa, evening samosa, chai all day, bhutta at dusk),
 *          then live scenes: a dosa bandi at 07:30 and 22:30 (night shift open, lights), a samosa bandi at
 *          17:00, a chai bandi at 08:00, a bhutta cart on Necklace Road at dusk (sparks, its own buy
 *          interaction), Gokul Chat at 19:00, the Paradise queue, a haleem bhatti in Ramzan and a dosa bandi
 *          in the rain (tarp, shelter, umbrellas); crowd members are real 'ped' entities that hold plates,
 *          the vendor's work loop runs and serves, steam / smoke / embers are emitted, places_art's painted
 *          crowd gives way; Chinnu walks into the crowd with real input and buys through the shops.js card.
 *   3d     640x360, third person (three.js from vendor/, SwiftShader): the same scenes, the vendor actor
 *          renderer + the layer's props / particles, screenshots.
 *   phone  390x844 touch: three busy scenes on screen at once; frame / module timings (2D) and the 3D JS
 *          time on the low tier.
 * Screenshots: tests/out/streetfood_*.png. Fails on any console error / page error / N.err.
 *   node nostalgia/tests/streetfood.cjs        ONLY=top|3d|phone   SHOTS=0   SMOKE=1 (run tests/smoke.cjs after)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });

const ONLY = process.env.ONLY;
const SHOTS = process.env.SHOTS !== '0';
const failures = [];
const report = [];
let cur = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg + (detail ? '  (' + detail + ')' : '')); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };

async function open(browser, V) {
  const context = await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr || 1, hasTouch: !!V.touch, isMobile: !!V.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    if (N.seasons) N.seasons.set('sankranti', false); // no kites over the scenes in the screenshots
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    window.__sf = { serve: 0, order: 0, scene: 0, buy: [] };
    N.on('streetfood:serve', () => { window.__sf.serve++; });
    N.on('streetfood:order', () => { window.__sf.order++; });
    N.on('streetfood:scene', () => { window.__sf.scene++; });
    N.on('shop:buy', (d2) => { window.__sf.buy.push(d2 && d2.place); });
  });
  return { context, page, errors };
}
/** stand on the customer side of a spot at a time of day (the spot's crowd pinned to its schedule or a level) */
async function visit(page, spot, h, m, o) {
  o = o || {};
  return page.evaluate(([spot, h, m, o]) => {
    N.render.baseZoom = 1;
    if (o.rain) N.flags.rain = true; else delete N.flags.rain;
    if (N.seasons) { N.seasons.set('ramzan', o.ramzan ? true : null); if (o.summer) N.seasons.set('summer', true); }
    N.debug.setTime(h, m);
    N.streetfood.force(null);
    if (o.level != null) N.streetfood.force(spot, { level: o.level });
    const s = N.streetfood.spot(spot);
    if (!s) return null;
    const d = o.dist || 34;
    N.debug.teleport(s.x + (s.frame.nx || 0) * d, s.y + (s.frame.ny || 0) * d);
    return { x: s.x, y: s.y, kind: s.kind };
  }, [spot, h, m, o]);
}
const scene = (page, spot) => page.evaluate((spot) => N.streetfood.active().find((a) => a.id === spot) || null, spot);
/** wait for `secs` of SIMULATION time (the machine may be very busy: frames can take a second), capped in real time */
async function simWait(page, secs, capMs) {
  const t0 = await page.evaluate(() => N.time.now);
  const cap = Date.now() + (capMs || secs * 9000 + 30000);
  while (Date.now() < cap) {
    await sleep(400);
    const t = await page.evaluate(() => N.time.now);
    if (t - t0 >= secs) return true;
  }
  return false;
}
async function shot(page, name, spot, zoom) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(OUT, 'streetfood_' + name + '.png'), timeout: 180000 });
  if (!spot || !zoom) return;
  await page.evaluate((z) => { N.render.baseZoom = z; }, zoom);
  await simWait(page, 1, 20000);
  const clip = await page.evaluate((spot) => {
    const s = N.streetfood.spot(spot), R = N.render, k = R.k(0), cv = R.canvas.getBoundingClientRect();
    const X = R.sx(s.x, k) * cv.width / R.W + cv.left, Y = R.sy(s.y, k) * cv.height / R.H + cv.top;
    const w = Math.min(420, cv.width), h = Math.min(280, cv.height);
    return { x: Math.max(0, Math.min(cv.width - w, X - w / 2)), y: Math.max(0, Math.min(cv.height - h, Y - h / 2)), width: w, height: h };
  }, spot);
  await page.screenshot({ path: path.join(OUT, 'streetfood_' + name + '_close.png'), clip, timeout: 180000 });
  await page.evaluate(() => { N.render.baseZoom = 1; });
}
/** sample a scene for a while: vendor phases seen, max particles by kind, max crowd */
async function sample(page, spot, secs) {
  const res = { phases: {}, pk: [0, 0, 0, 0], crowd: 0, holding: 0, n: 0 };
  const t0 = await page.evaluate(() => N.time.now), cap = Date.now() + secs * 9000 + 30000;
  while (Date.now() < cap && (await page.evaluate(() => N.time.now)) - t0 < secs) {
    const r = await page.evaluate((spot) => {
      const a = N.streetfood.active().find((q) => q.id === spot);
      const P = N.streetfood._debug.P, sc = N.streetfood.scene(spot), pk = [0, 0, 0, 0];
      for (let i = 0; i < P.n; i++) if (sc && P.sc[i] === sc.uid) pk[P.kind[i]]++;
      return a ? { ph: a.vendor && a.vendor.ph, pk, crowd: a.crowd, holding: a.holding } : null;
    }, spot);
    if (r) {
      if (r.ph) res.phases[r.ph] = (res.phases[r.ph] || 0) + 1;
      for (let k = 0; k < 4; k++) res.pk[k] = Math.max(res.pk[k], r.pk[k]);
      res.crowd = Math.max(res.crowd, r.crowd); res.holding = Math.max(res.holding, r.holding); res.n++;
    }
    await sleep(250);
  }
  return res;
}
async function noErrors(page, errors, label) {
  const ne = await page.evaluate(() => (N.errors || []).map((e) => (e.where || '') + ': ' + String(e.msg || e.message || e.error || JSON.stringify(e)).slice(0, 240)));
  check(errors.length === 0, label + ': no console / page errors', errors.slice(0, 3).join(' | '));
  check(ne.length === 0, label + ': no N.err reports', ne.slice(0, 3).join(' | '));
}

/* ======================================================================= top-down */
async function partTop(browser) {
  cur = 'top'; console.log('\n== top-down 800x450');
  const { context, page, errors } = await open(browser, { viewport: { width: 800, height: 450 } });
  await sleep(1500);
  // ---- the catalogue
  const cat = await page.evaluate(() => {
    const S = N.streetfood.stats();
    const neck = N.places.necklace_road;
    const bh = N.streetfood.spots.filter((s) => s.kind === 'bhutta');
    const nearNeck = neck ? bh.filter((s) => Math.hypot(s.x - neck.x, s.y - neck.y) < 1200).length : 0;
    return { kinds: S.kinds, spots: S.spots, nearNeck, extraEnt: N.streetfood.spots.filter((s) => s.cartE).length, kinds2: Object.keys(N.streetfood.KINDS) };
  });
  report.push(['spots', JSON.stringify(cat.kinds)]);
  check(cat.kinds.dosa >= 7 && cat.kinds.samosa >= 7 && cat.kinds.chai >= 8, 'every dosa / samosa / chai bandi on the map is a spot', JSON.stringify(cat.kinds));
  check(cat.kinds.coconut >= 7 && cat.kinds.banana >= 10 && cat.kinds.flower >= 12, 'coconut / banana / flower carts are spots');
  check(cat.kinds.gokul === 1 && cat.kinds.irani >= 15 && cat.kinds.biryani >= 2 && cat.kinds.haleem >= 4, 'Gokul Chat, Irani cafe fronts, the biryani queue and the haleem bhattis are spots');
  check(cat.kinds.bhutta >= 5 && cat.nearNeck >= 3 && cat.kinds.panipuri >= 6 && cat.kinds.gola >= 2 && cat.kinds.gate >= 10, 'extra carts placed: bhutta on Necklace Road / Tank Bund, pani puri by markets, ice gola, school gates', 'bhutta near Necklace Road ' + cat.nearNeck);
  // ---- schedules (the director's crowd level by time of day)
  const lv = await page.evaluate(() => {
    const D = N.streetfood._debug, at = (id, h, m) => { N.debug.setTime(h, m); const s = N.streetfood.spot(id); return +D.levelOf({ spot: s, K: s.K, rain: 0 }).toFixed(2); };
    const neck = N.streetfood.spots.find((s) => s.kind === 'bhutta');
    const r = {
      dosa0730: at('dosa_bandi_1', 7, 30), dosa1400: at('dosa_bandi_1', 14, 0), dosa2230: at('dosa_bandi_1', 22, 30), dosa0300: at('dosa_bandi_1', 3, 0),
      samosa1700: at('samosa_bandi_1', 17, 0), samosa1000: at('samosa_bandi_1', 10, 0),
      chai0800: at('chai_bandi_1', 8, 0), chai1330: at('chai_bandi_1', 13, 30),
      bhutta1830: at(neck.id, 18, 30), bhutta1200: at(neck.id, 12, 0),
      gokul1930: at('gokul_chat', 19, 30), gokul0900: at('gokul_chat', 9, 0),
      haleemOff: at('shadab_hotel:haleem', 19, 0),
    };
    N.seasons.set('ramzan', true); r.haleemRamzan = at('shadab_hotel:haleem', 19, 0); N.seasons.set('ramzan', null);
    return r;
  });
  report.push(['levels', JSON.stringify(lv)]);
  check(lv.dosa0730 > 0.6 && lv.dosa2230 > 0.45 && lv.dosa1400 < 0.15 && lv.dosa0300 < 0.15, 'dosa bandi: busy at morning tiffin and late night, quiet at 14:00 / 03:00', JSON.stringify([lv.dosa0730, lv.dosa1400, lv.dosa2230, lv.dosa0300]));
  check(lv.samosa1700 > 0.6 && lv.samosa1000 < 0.05, 'samosa bandi: the evening rush only');
  check(lv.chai0800 > 0.6 && lv.chai1330 >= 0.2, 'chai bandi: a morning peak, people at all hours');
  check(lv.bhutta1830 > 0.6 && lv.bhutta1200 === 0, 'bhutta cart: evening on the lake front');
  check(lv.gokul1930 > 0.6 && lv.gokul1930 > lv.gokul0900, 'Gokul Chat: busiest in the evening');
  check(lv.haleemOff === 0 && lv.haleemRamzan > 0.5, 'haleem bhattis only in Ramzan');
  const nightShop = await page.evaluate(() => { N.debug.setTime(22, 30); const s = N.shops.status('dosa_bandi_1'); N.debug.setTime(14, 0); const s2 = N.shops.status('dosa_bandi_1'); return { night: !!s.open, noon: !!s2.open }; });
  check(nightShop.night && !nightShop.noon, 'the dosa shop serves the late-night shift (21:00-01:00), closed at 14:00', JSON.stringify(nightShop));

  // ---- dosa bandi 07:30 (schedule, not forced)
  console.log(' -- dosa bandi 07:30');
  await visit(page, 'dosa_bandi_1', 7, 30);
  await simWait(page, 7);
  let a = await scene(page, 'dosa_bandi_1');
  check(!!a, 'the dosa bandi scene is active near the player');
  const ent = await page.evaluate(() => {
    const sc = N.streetfood.scene('dosa_bandi_1');
    if (!sc) return null;
    const all = N.entities.all;
    return { peds: sc.patrons.filter((p) => p.kind === 'ped' && all.indexOf(p) >= 0).length, n: sc.patrons.length, vendorEnt: !!(sc.vendor && all.indexOf(sc.vendor) >= 0 && sc.vendor.view3d === 'sf:vendor'), looks: new Set(sc.patrons.map((p) => p.look0 && p.look0.kind)).size, roles: Array.from(new Set(sc.patrons.map((p) => p.role))) };
  });
  check(ent && ent.n >= 5 && ent.peds === ent.n, 'the crowd is real pedestrians (kind ped entities)', ent && (ent.peds + '/' + ent.n + ' roles ' + ent.roles.join(',')));
  check(ent && ent.vendorEnt, 'the vendor is an entity with the 3D vendor renderer key');
  check(ent && ent.looks >= 2, 'mixed looks in the crowd', ent && ent.looks + ' body kinds');
  let smp = await sample(page, 'dosa_bandi_1', 11);
  const ph = Object.keys(smp.phases);
  check(['spread', 'cook', 'fold', 'serve'].filter((p) => ph.indexOf(p) >= 0).length >= 3, 'the vendor loops the dosa work (spread / cook / fold / serve)', ph.join(','));
  check(smp.pk[0] >= 5, 'steam rises off the tawa', 'max puffs ' + smp.pk[0]);
  check(smp.holding >= 2, 'people eat from steel plates', 'holding ' + smp.holding);
  const art = await page.evaluate(() => { const lm = N.WORLD_DATA.landmarks.find((l) => l.id === 'dosa_bandi_1'); const A = lm && lm._pa; return A && A.count ? A.count(A) : null; });
  check(art === 0 || art === null, 'places_art painted customers give way to the real crowd', 'painted count ' + art);
  const ev = await page.evaluate(() => Object.assign({}, window.__sf, { st: N.streetfood.stats() }));
  check(ev.serve >= 1 && ev.order >= 1, 'orders are placed and served', 'orders ' + ev.order + ', served ' + ev.serve);
  report.push(['dosa 07:30', JSON.stringify({ crowd: smp.crowd, phases: smp.phases, puffs: smp.pk, recruited: ev.st.recruited, veh: ev.st.vehicles })]);
  await shot(page, 'dosa_0730', 'dosa_bandi_1', 5);

  // ---- walk into the crowd and buy (real input, the shops.js interaction)
  console.log(' -- walk into the crowd and buy');
  const buy0 = await page.evaluate(() => window.__sf.buy.length);
  await page.evaluate(() => { const s = N.streetfood.spot('dosa_bandi_1'); N.debug.teleport(s.x + s.frame.nx * 30, s.y + s.frame.ny * 30); });
  await simWait(page, 1, 20000);
  let label = '', reached = false;
  const walkCap = Date.now() + 150000;
  for (let i = 0; i < 400 && Date.now() < walkCap; i++) {
    const st = await page.evaluate(() => {
      const pl = N.places.dosa_bandi_1, p = N.player, dx = pl.x - p.x, dy = pl.y - p.y, d = Math.hypot(dx, dy);
      if (d > 9) N.input.setMove(dx / d, dy / d); else N.input.setMove(null);
      const cur2 = N.interact.current;
      return { d, label: cur2 ? String(typeof cur2.label === 'function' ? cur2.label(N.player) : cur2.label || '') : '' };
    });
    label = st.label;
    if (st.d <= 12 && /dosa/i.test(label)) { reached = true; break; }
    await sleep(300);
  }
  await page.evaluate(() => N.input.setMove(null));
  const aside = await page.evaluate(() => { const sc = N.streetfood.scene('dosa_bandi_1'); return sc ? sc.patrons.filter((p) => Math.hypot(p.ofx, p.ofy) > 0.8).length : 0; });
  check(reached, 'Chinnu walks through the crowd to the counter (real input) and the shop is offered', 'label "' + label + '", people who shuffled aside ' + aside);
  await page.keyboard.press('e');
  await simWait(page, 0.6, 20000);
  const card = await page.evaluate(() => !!(N.shops && N.shops.isOpen && N.shops.isOpen()));
  check(card, 'ACTION opens the shops.js card at the cart');
  await shot(page, 'buy_card');
  await page.evaluate(() => { const r = N.shops.buy('dosa_bandi_1', 'dosa'); window.__sf.lastBuy = r; if (N.shops.close) N.shops.close(); });
  await sleep(500);
  const bought = await page.evaluate(() => ({ r: window.__sf.lastBuy, n: window.__sf.buy.length, v: (() => { const sc = N.streetfood.scene('dosa_bandi_1'); return sc && sc.vendor ? sc.vendor.servePl : -1; })() }));
  check(bought.r && bought.r.ok && bought.n > buy0, 'the purchase goes through shops.js (shop:buy)', JSON.stringify(bought.r));
  check(bought.v > 0, 'the vendor turns and serves Chinnu');

  // ---- dosa bandi 22:30 (night shift)
  console.log(' -- dosa bandi 22:30');
  await visit(page, 'dosa_bandi_1', 22, 30);
  await simWait(page, 7);
  smp = await sample(page, 'dosa_bandi_1', 5);
  const night = await page.evaluate(() => ({ night: N.render.night, lights: N.streetfood.stats().lights }));
  check(smp.crowd >= 4, 'late-night crowd at the dosa bandi', 'crowd ' + smp.crowd);
  check(night.night > 0.5 && night.lights >= 1, 'night: the stove glow / lamps light the scene', JSON.stringify(night));
  await shot(page, 'dosa_2230', 'dosa_bandi_1', 5);

  // ---- samosa bandi 17:00
  console.log(' -- samosa bandi 17:00');
  await visit(page, 'samosa_bandi_1', 17, 0);
  await simWait(page, 7);
  smp = await sample(page, 'samosa_bandi_1', 6);
  check(smp.crowd >= 5, 'evening rush at the samosa bandi', 'crowd ' + smp.crowd);
  check(smp.pk[0] + smp.pk[1] >= 5 && smp.pk[1] >= 1, 'the kadai steams and smokes', 'steam ' + smp.pk[0] + ' smoke ' + smp.pk[1]);
  check(Object.keys(smp.phases).some((p) => /fry|stir|drop|lift/.test(p)), 'samosas are fried in batches', Object.keys(smp.phases).join(','));
  await shot(page, 'samosa_1700', 'samosa_bandi_1', 5);

  // ---- chai bandi 08:00
  console.log(' -- chai bandi 08:00');
  await visit(page, 'chai_bandi_1', 8, 0);
  await simWait(page, 7);
  smp = await sample(page, 'chai_bandi_1', 6);
  const glass = await page.evaluate(() => { const sc = N.streetfood.scene('chai_bandi_1'); return sc ? sc.patrons.filter((p) => p.hold === 'glass').length : 0; });
  check(smp.crowd >= 4, 'men standing at the chai bandi', 'crowd ' + smp.crowd);
  check(Object.keys(smp.phases).some((p) => /pour/.test(p)) && glass >= 1, 'the long pour, small glasses in hand', Object.keys(smp.phases).join(',') + ' glasses ' + glass);
  await shot(page, 'chai_0800', 'chai_bandi_1', 5);

  // ---- bhutta cart on Necklace Road at dusk
  console.log(' -- bhutta cart, Necklace Road, 18:30');
  const bid = await page.evaluate(() => { const n = N.places.necklace_road; let b = null, bd = 1e9; for (const s of N.streetfood.spots) if (s.kind === 'bhutta') { const d = Math.hypot(s.x - n.x, s.y - n.y); if (d < bd) { bd = d; b = s; } } return b.id; });
  await visit(page, bid, 18, 30);
  await simWait(page, 7);
  smp = await sample(page, bid, 6);
  const bh = await page.evaluate((bid) => { const s = N.streetfood.spot(bid); const cur2 = N.interact.current; return { cart: !!(s.cartE && s.cartE.alive && N.entities.all.indexOf(s.cartE) >= 0), road: (N.world.nearestRoadPoint(s.x, s.y) || {}).road && N.world.nearestRoadPoint(s.x, s.y).road.id }; }, bid);
  check(bh.cart, 'the bhutta cart is there in the evening (a solid prop entity)', bid + ' by ' + bh.road);
  check(smp.crowd >= 3, 'people gather round the bhutta cart', 'crowd ' + smp.crowd);
  check(smp.pk[2] >= 1 && smp.pk[1] >= 1, 'the hand fan throws sparks and charcoal smoke', 'embers ' + smp.pk[2] + ' smoke ' + smp.pk[1]);
  await shot(page, 'bhutta_1830', bid, 5);
  // its own buy interaction (bought through shops.js at the Hussain Sagar bhutta cart)
  const bb0 = await page.evaluate(() => window.__sf.buy.length);
  await page.evaluate((bid) => { const s = N.streetfood.spot(bid); N.debug.teleport(s.x + s.frame.nx * 8, s.y + s.frame.ny * 8); }, bid);
  await simWait(page, 0.8, 20000);
  const lbl = await page.evaluate(() => { const c = N.interact.current; return c ? String(typeof c.label === 'function' ? c.label(N.player) : c.label || '') : ''; });
  await page.keyboard.press('e');
  await simWait(page, 0.6, 20000);
  const bb = await page.evaluate(() => window.__sf.buy.slice(-1)[0]);
  check(/bhutta/i.test(lbl) && (await page.evaluate(() => window.__sf.buy.length)) > bb0, 'buy a bhutta at the extra cart (ACTION -> N.shops.buy)', 'label "' + lbl + '" -> ' + bb);

  // ---- Gokul Chat 19:00
  console.log(' -- Gokul Chat 19:00');
  await visit(page, 'gokul_chat', 19, 0);
  await simWait(page, 7);
  smp = await sample(page, 'gokul_chat', 5);
  const gz = await page.evaluate(() => (N.traffic && N.traffic.crowd ? N.traffic.crowd('gokul_chat') : null));
  check(smp.crowd >= 6, 'a big crowd at Gokul Chat', 'ours ' + smp.crowd + ', traffic zone ' + JSON.stringify(gz));
  check(smp.holding >= 3, 'leaf plates of pani puri in hand', 'holding ' + smp.holding);
  await shot(page, 'gokul_1900', 'gokul_chat', 3.5);

  // ---- the Paradise queue at lunch
  console.log(' -- Paradise 13:00');
  await visit(page, 'paradise', 13, 0);
  await simWait(page, 7);
  a = await scene(page, 'paradise');
  check(a && (a.states.queue || 0) >= 4, 'the biryani queue forms at Paradise', a && JSON.stringify(a.states));
  await shot(page, 'paradise_1300', 'paradise', 2.6);

  // ---- Ramzan haleem bhatti
  console.log(' -- haleem bhatti in Ramzan, 19:00');
  await visit(page, 'shadab_hotel:haleem', 19, 0, { ramzan: true });
  await simWait(page, 7);
  smp = await sample(page, 'shadab_hotel:haleem', 4);
  check(smp.crowd >= 5 && smp.pk[0] + smp.pk[1] >= 4, 'the haleem bhatti draws a crowd and steams', 'crowd ' + smp.crowd + ' puffs ' + (smp.pk[0] + smp.pk[1]));
  await shot(page, 'haleem_ramzan', 'shadab_hotel:haleem', 4);

  // ---- rain at a dosa bandi
  console.log(' -- dosa bandi in the rain, 08:00');
  await visit(page, 'dosa_bandi_1', 8, 0, { rain: true });
  await simWait(page, 9);
  a = await scene(page, 'dosa_bandi_1');
  check(a && a.tarp > 0.5, 'a tarpaulin goes up over the cart', a && 'tarp ' + a.tarp);
  check(a && a.umbrellas + a.sheltered >= 2, 'people crowd under it / open umbrellas', a && ('sheltered ' + a.sheltered + ', umbrellas ' + a.umbrellas));
  await shot(page, 'dosa_rain', 'dosa_bandi_1', 5);
  await page.evaluate(() => { delete N.flags.rain; });

  const st = await page.evaluate(() => N.streetfood.stats());
  report.push(['top stats', JSON.stringify({ ms: st.ms, msAvg: st.msAvg, ms2d: st.ms2d, patrons: st.patrons, recruited: st.recruited, handedBack: st.handedBack, served: st.served, activations: st.activations })]);
  check(st.recruited + st.handedBack > 0, 'passers-by join the crowds and leave as walkers again (traffic.js handover)', 'recruited ' + st.recruited + ', handed back ' + st.handedBack);
  await noErrors(page, errors, 'top');
  await context.close();
}

/* ======================================================================= 3D */
async function part3d(browser) {
  cur = '3d'; console.log('\n== 3D third person 640x360');
  const { context, page, errors } = await open(browser, { viewport: { width: 640, height: 360 } });
  await page.evaluate(() => { N.view.noPointerLock = true; N.view3d.setQuality({ adaptive: false, pixelRatio: 0.8 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
  const stops = [['dosa_bandi_1', 7, 30, {}, 'dosa_0730'], ['dosa_bandi_1', 22, 30, {}, 'dosa_2230'], ['samosa_bandi_1', 17, 0, {}, 'samosa_1700'], ['chai_bandi_1', 8, 0, {}, 'chai_0800'], ['@bhutta', 18, 30, {}, 'bhutta_1830'], ['gokul_chat', 19, 0, { dist: 40 }, 'gokul_1900'], ['dosa_bandi_1', 8, 0, { rain: true }, 'dosa_rain']];
  for (const [spot0, h, m, o, name] of stops) {
    const spot = spot0 === '@bhutta' ? await page.evaluate(() => { const n = N.places.necklace_road; let b = null, bd = 1e9; for (const s of N.streetfood.spots) if (s.kind === 'bhutta') { const d = Math.hypot(s.x - n.x, s.y - n.y); if (d < bd) { bd = d; b = s; } } return b.id; }) : spot0;
    console.log(' -- ' + name);
    await visit(page, spot, h, m, Object.assign({ dist: 18 }, o));
    await simWait(page, 3);
    const aim = () => page.evaluate((spot) => { const s = N.streetfood.spot(spot), p = N.player, a = Math.atan2(s.y - p.y, s.x - p.x); p.facing = a; N.view3d.setCamera({ yaw: a, pitch: 0.36, snap: true }); }, spot);
    await aim();
    await page.evaluate(() => N.view3d.settle(4000));
    await simWait(page, 2.5, 90000);
    await aim();
    await simWait(page, 0.6, 40000);
    await page.evaluate(() => document.querySelectorAll('.hud-toasts').forEach((e) => { e.style.visibility = 'hidden'; }));
    const r = await page.evaluate((spot) => {
      const S = N.streetfood.stats(), a = N.streetfood.active().find((q) => q.id === spot), v = N.view3d.stats();
      return { s3d: S.s3d, pts: S.pts3d, layer: S.layer3d, ms3d: S.ms3d, crowd: a && a.crowd, ph: a && a.vendor && a.vendor.ph, calls: v.calls, jsAvg: v.jsAvg, actors: v.actors };
    }, spot);
    check(r.layer && r.s3d >= 1 && r.crowd >= 2, name + ': scene props + crowd in 3D', JSON.stringify(r));
    if (!/coconut|banana|flower/.test(spot)) check(r.pts > 0, name + ': steam / smoke points drawn', 'points ' + r.pts);
    report.push(['3d ' + name, JSON.stringify({ calls: r.calls, jsAvg: r.jsAvg, ms3d: r.ms3d, crowd: r.crowd })]);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'streetfood_3d_' + name + '.png'), timeout: 240000 });
  }
  await page.evaluate(() => { delete N.flags.rain; });
  await noErrors(page, errors, '3d');
  await context.close();
}

/* ======================================================================= phone: three busy scenes at once */
async function partPhone(browser) {
  cur = 'phone'; console.log('\n== phone 390x844 (touch): three busy scenes on screen');
  const { context, page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, dpr: 2, touch: true });
  // the tightest triple of busy spots that fits on a portrait screen
  const tri = await page.evaluate(() => {
    const busy = N.streetfood.spots.filter((s) => /dosa|samosa|chai|bhutta|panipuri|coconut|banana|flower|irani/.test(s.kind));
    let best = null, bs = 1e9;
    for (let i = 0; i < busy.length; i++) for (let j = i + 1; j < busy.length; j++) {
      const a = busy[i], b = busy[j]; if (Math.abs(a.x - b.x) > 150 || Math.abs(a.y - b.y) > 320) continue;
      for (let k = j + 1; k < busy.length; k++) {
        const c = busy[k];
        const w = Math.max(a.x, b.x, c.x) - Math.min(a.x, b.x, c.x), h = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y);
        if (w > 150 || h > 320) continue;
        const kinds = new Set([a.kind, b.kind, c.kind]).size;
        const sc = w + h * 0.3 - kinds * 40 + (Math.min(w, h) < 25 ? 200 : 0);
        if (sc < bs) { bs = sc; best = [a, b, c]; }
      }
    }
    return best ? best.map((s) => ({ id: s.id, kind: s.kind, x: s.x, y: s.y })) : null;
  });
  check(!!tri, 'found three food spots that fit on one phone screen', tri && tri.map((s) => s.id).join(', '));
  if (tri) {
    const cx = (tri[0].x + tri[1].x + tri[2].x) / 3, cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
    await page.evaluate(([tri, cx, cy]) => {
      N.debug.setTime(17, 30);
      N.streetfood.force(null);
      for (const s of tri) N.streetfood.force(s.id, { level: 1 });
      N.debug.teleport(cx + 10, cy);
    }, [tri, cx, cy]);
    await simWait(page, 8);
    const onScreen = await page.evaluate((tri) => tri.filter((s) => N.render.inView(s.x, s.y, 0)).length, tri);
    const act = await page.evaluate((tri) => N.streetfood.active().filter((a) => tri.some((s) => s.id === a.id)).map((a) => a.id + ':' + a.crowd), tri);
    check(onScreen === 3 && act.length === 3, 'three busy scenes on screen', 'on screen ' + onScreen + ', ' + act.join(' '));
    // in-page timing over 4 s (2D)
    const perf = await page.evaluate(() => new Promise((res) => {
      const fr = [], sf = [], d2 = [], dms = []; let last = performance.now();
      const t0 = last;
      function tick() {
        const t = performance.now(); fr.push(t - last); last = t;
        const st = N.streetfood.stats(); sf.push(st.ms); d2.push(st.ms2d);
        const p = N.debug.perf(); dms.push((p.drawMs || 0) + (p.updateMs || 0));
        if (t - t0 < 4000) requestAnimationFrame(tick);
        else {
          const avg = (a) => +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2);
          const p95 = (a) => +a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)].toFixed(2);
          res({ frames: fr.length, frameAvg: avg(fr), frameP95: p95(fr), jsAvg: avg(dms), sfUpdate: avg(sf), sfDraw2d: avg(d2), st: N.streetfood.stats() });
        }
      }
      requestAnimationFrame(tick);
    }));
    report.push(['phone 2D perf', JSON.stringify({ frames: perf.frames, frameAvg: perf.frameAvg, frameP95: perf.frameP95, gameJsAvg: perf.jsAvg, streetfoodUpdate: perf.sfUpdate, streetfood2D: perf.sfDraw2d, patrons: perf.st.patrons, particles: perf.st.particles })]);
    check(perf.sfUpdate + perf.sfDraw2d < 4, 'street-food cost per frame with three busy scenes (phone, 2D)', 'update ' + perf.sfUpdate + ' ms + draw ' + perf.sfDraw2d + ' ms; game JS ' + perf.jsAvg + ' ms; frame ' + perf.frameAvg + ' ms (machine load ' + require('os').loadavg()[0].toFixed(1) + ')');
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'streetfood_phone_three.png'), timeout: 180000 });
    if (process.env.SKIP3D !== '1') {
      await page.evaluate(() => { N.view.noPointerLock = true; N.view3d.setQuality({ adaptive: false, pixelRatio: 0.8 }); N.view.set('tps'); });
      await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
      await page.evaluate(([cx, cy]) => { const p = N.player; const a = Math.atan2(cy - p.y, cx - p.x); N.view3d.setCamera({ yaw: a, pitch: 0.5, snap: true }); N.view3d.settle(4000); }, [cx, cy]);
      await simWait(page, 4, 120000);
      await page.evaluate(() => document.querySelectorAll('.hud-toasts').forEach((e) => { e.style.visibility = 'hidden'; }));
      const p3 = await page.evaluate(() => { const v = N.view3d.stats(), s = N.streetfood.stats(); return { tier: v.tier, calls: v.calls, jsAvg: v.jsAvg, sf3d: s.ms3d, sf: s.ms, s3d: s.s3d }; });
      report.push(['phone 3D perf', JSON.stringify(p3)]);
      check(p3.s3d >= 3 && p3.sf3d + p3.sf < 4, 'phone 3D: the three scenes + their cost', JSON.stringify(p3));
      if (SHOTS) await page.screenshot({ path: path.join(OUT, 'streetfood_phone_three_3d.png'), timeout: 240000 });
    }
  }
  await noErrors(page, errors, 'phone');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (!ONLY || ONLY === 'top') await partTop(browser);
    if (!ONLY || ONLY === '3d') await part3d(browser);
    if (!ONLY || ONLY === 'phone') await partPhone(browser);
  } catch (e) { failures.push('[' + cur + '] exception: ' + (e.stack || e.message)); console.log(e); }
  await browser.close();
  if (process.env.SMOKE === '1') {
    cur = 'smoke'; console.log('\n== tests/smoke.cjs');
    try { execFileSync('node', [path.join(__dirname, 'smoke.cjs')], { stdio: 'inherit' }); ok('smoke passes'); } catch (e) { fail('smoke failed'); }
  }
  console.log('\n== report');
  for (const [k, v] of report) console.log('  ' + k.padEnd(16) + v);
  if (failures.length) { console.log('\nFAILURES (' + failures.length + '):\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('\nALL STREET-FOOD CHECKS PASSED');
})();
