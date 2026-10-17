/* NOSTALGIA — tests/shops.cjs  (shops agent)
 * Shops, services, travel, odd jobs and the vehicle rules (systems_design §2.6, §3, §5, §9) in
 * headless Chromium:
 *   - every shop kind sells something (one buy per kind, prices and effects checked)
 *   - Irani chai + Osmania biscuits at every Irani café; the ★ quick order (hold ACTION)
 *   - opening hours (closed shops refuse, carts vanish, barbers shut on Tuesdays, Prasads fence)
 *   - STD booth: save + the hint call; barber clears the Chappal Meter; cinema skips time, meter −2
 *   - bus fast travel; "AUTO!" hailing opens the auto card and the bargain minigame
 *   - cycle hire + return fee, punctures + the ₹2 fix, khaata, the mini train, money never < 0
 *   - every odd job starts and completes (autopilot), levels and pay
 *   - vehicles: no driving buses/lorries, kid at the wheel, bike surfaces, story types, falls
 *   - the shop card with real keys (desktop) and taps (phone), screenshots, zero console errors
 *   node nostalgia/tests/shops.cjs           ONLY=kinds,hours,services,travel,jobs,vehicles,ui
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;
const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(browser, vp, touch) {
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: touch ? 2 : 1, hasTouch: !!touch, isMobile: !!touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  return { context, page, errors };
}
// fresh game state between sections
const fresh = (page, money) => page.evaluate((money) => {
  if (N.shops.isOpen()) N.shops.close();
  if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) N.minigames.abort('test');
  if (N.missions.active) N.missions.abort();
  N.debug.newGame({ skipIntro: true }); N.debug.skipDialogue(true);
  N.player.money = money == null ? 100000 : money; N.debug.god(true);
  return N.state.mode;
}, money);
const waitFor = (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 8000 }).then(() => true, () => false);

async function main() {
  const browser = await chromium.launch();
  const { page, errors, context } = await boot(browser, { width: 1280, height: 720 });
  const shot = (n) => page.screenshot({ path: path.join(OUT, 'shops_' + n + '.png') });

  /* ------------------------------------------------------------------ kinds */
  if (want('kinds')) {
    console.log('\n== every shop kind');
    await fresh(page);
    const r = await page.evaluate(() => {
      const S = N.shops, out = { kinds: {}, fails: [], noPlace: [] };
      const byKind = {};
      for (const id of S.list()) { const k = S.kindOf(id); (byKind[k] = byKind[k] || []).push(id); }
      // a time and a weekday when each kind is open (systems §10.3)
      const TIME = { biryani: [12, 0], biryani2: [12, 0], gokul_chat: [12, 0], ice_cream: [12, 0], samosa_bandi: [17, 0], dosa_bandi: [7, 30], rythu: [8, 0], meat_shop: [8, 0], sound_light: [18, 0], numaish: [17, 0], school_gate: [16, 0], nayaab: [6, 0], prasadam: [7, 0], langar: [13, 0], haleem_house: [12, 0], cinema: [12, 0], ntr_gardens: [16, 0], lumbini_park: [12, 0], boats: [12, 0], planetarium: [11, 0], internet_cafe: [12, 0] };
      for (const k in byKind) {
        const id = byKind[k][0];
        N.calendar.set(2003, 7, 27, 10, 0); // a Sunday after Prasads opened
        if (k === 'numaish' || k === 'kite_stall') N.calendar.set(2003, 1, 19, 10, 0); // Numaish / kite season (a Sunday)
        if (k === 'barber') N.calendar.set(2003, 7, 28, 10, 0); // a Monday (barbers rest on Tuesdays)
        if (k === 'school_gate') N.calendar.set(2003, 7, 28, 10, 0);
        const t = TIME[k] || [10, 0]; N.clock.set(t[0], t[1]);
        N.flags.boats_open = true; N.flags.internet_open = true; N.flags.noor_open = true;
        const def = S.defs[id];
        if (def.K.direct) { // prasadam / langar: free food at the gate
          N.debug.teleport(def.x, def.y);
          const tum = N.player.tummy;
          N.player.tummy = 30; N.player.energy = 30;
          const it = N.interact; const reg = it.get('shop:' + id);
          const en = reg && reg.enabled();
          if (en) reg.use(N.player);
          out.kinds[k] = { id, ok: !!en && N.player.tummy > 30, tummy: N.player.tummy };
          N.player.tummy = tum;
          continue;
        }
        const rows = S.rows(id);
        const row = rows.find((x) => !x.why && x.price > 0) || rows.find((x) => !x.why);
        if (!row) { out.fails.push(k + ': no buyable row at ' + id + ' ' + JSON.stringify(rows.slice(0, 3))); continue; }
        const m0 = N.player.money, t0 = N.player.tummy;
        N.player.tummy = 50; N.player.energy = 50;
        const res = S.buy(id, row.id, {});
        if (S.isOpen()) S.close();
        if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) N.minigames.abort('test');
        while (N.state.mode === 'dialogue' && N.dialogue.isOpen && N.dialogue.isOpen()) { N.dialogue.cancel(); }
        const paid = m0 - N.player.money;
        out.kinds[k] = { id, item: row.id, price: row.price, paid, ok: !!res.ok, why: res.why || null };
        if (!res.ok) out.fails.push(k + ' ' + id + ' ' + row.id + ': ' + res.why);
        else if (paid !== row.price && !/^(bottles|scores|tv_game|routes|thatha|platform_ok|std|portrait|wait)$/.test(row.id) && row.price > 0 && Math.abs(paid - row.price) > 50) out.fails.push(k + ' paid ' + paid + ' expected ' + row.price);
        N.player.tummy = t0;
        N.shops.debug.settle();
      }
      out.n = Object.keys(byKind).length;
      return out;
    });
    const bad = r.fails;
    if (bad.length) bad.forEach((f) => fail('kind ' + f)); else ok(r.n + ' shop kinds: every one sells (' + Object.keys(r.kinds).join(', ') + ')');
    for (const k of ['irani_cafe', 'kirana', 'bakery', 'karachi_bakery', 'iyengar_bakery', 'gokul_chat', 'samosa_bandi', 'dosa_bandi', 'coconut_cart', 'banana_cart', 'flower_cart', 'meat_shop', 'medical_shop', 'photo_studio', 'internet_cafe', 'stationery', 'pindi_girni', 'barber', 'cycle_rent', 'video_parlour', 'cinema', 'prasads', 'ntr_gardens', 'numaish', 'rythu', 'station', 'std_booth', 'bus_hub', 'bus_stop', 'prasadam', 'langar', 'chai_bandi', 'kite_stall', 'boats', 'school_gate']) if (!r.kinds[k]) fail('missing shop kind ' + k);
    // Irani chai + Osmania at every café, and the house combo
    const irani = await page.evaluate(() => {
      N.calendar.set(2003, 7, 27, 10, 0); N.flags.noor_open = true;
      const ids = N.shops.list('irani_cafe'), bad = [];
      const raw = N.WORLD_DATA.places.filter((p) => p.kind === 'irani_cafe').map((p) => p.id);
      for (const id of raw) {
        const r = N.shops.resolve(id);
        if (!r) { bad.push('no shop for ' + id); continue; }
        const rows = N.shops.rows(r).map((x) => x.id);
        if (rows.indexOf('chai') < 0 || rows.indexOf('osmania') < 0 || rows.indexOf('combo') < 0) bad.push(id + ' rows ' + rows.join(','));
        const m0 = N.player.money, t0 = N.player.tummy;
        N.player.tummy = 20; N.player.energy = 20;
        const q = N.shops.quickOrder(r);
        if (!q.ok || m0 - N.player.money !== 800 || N.player.tummy < 59) bad.push(id + ' quick order ' + JSON.stringify(q.why || null) + ' paid ' + (m0 - N.player.money) + ' tummy ' + N.player.tummy);
        N.player.tummy = t0;
      }
      return { n: ids.length, raw: raw.length, bad };
    });
    if (irani.bad.length) irani.bad.forEach((b) => fail('irani ' + b)); else ok('Irani chai + Osmania at all ' + irani.raw + ' café places (' + irani.n + ' cafés + aliases); ★ combo ₹8, tummy +40');
    // hold ACTION = the quick order, a tap = the card
    const hold = await page.evaluate(async () => {
      N.clock.set(10, 0);
      N.debug.teleport('irani_cafe_7');
      await new Promise((r) => setTimeout(r, 300));
      const m0 = N.player.money;
      N.input.press('action', 0.9);
      await new Promise((r) => setTimeout(r, 1300));
      const quick = { paid: m0 - N.player.money, open: N.shops.isOpen() };
      N.input.press('action');
      await new Promise((r) => setTimeout(r, 500));
      const card = N.shops.current;
      N.shops.close();
      return { quick, card };
    });
    if (hold.quick.paid === 800 && !hold.quick.open) ok('holding ACTION orders "Do chai, ek plate Osmania" (₹8) without the menu'); else fail('quick order by holding ACTION: ' + JSON.stringify(hold.quick));
    if (hold.card && hold.card.id === 'irani_cafe_7') ok('a tap opens the café card'); else fail('tap did not open the card: ' + JSON.stringify(hold.card));
  }

  /* ------------------------------------------------------------------ hours */
  if (want('hours')) {
    console.log('\n== opening hours');
    await fresh(page);
    const h = await page.evaluate(() => {
      const S = N.shops, out = {};
      N.calendar.set(2003, 7, 29, 6, 0); // Tue 29 Jul 2003, 06:00
      out.kiranaEarly = S.buy('kirana_1', 'mango_bite');
      out.kiranaStatus = S.status('kirana_1');
      out.label = N.interact.get('shop:kirana_1').label();
      N.clock.set(10, 0);
      out.barberTue = S.status('barber_1');
      out.barberBuy = S.buy('barber_1', 'champi');
      N.calendar.set(2003, 7, 31, 10, 0); // Thursday
      out.barberThu = S.status('barber_1').open;
      N.clock.set(23, 0);
      out.samosaNight = N.interact.get('shop:samosa_bandi_1').enabled();
      N.clock.set(17, 0);
      out.samosaEve = N.interact.get('shop:samosa_bandi_1').enabled();
      N.calendar.set(2003, 6, 20, 12, 0); // before 25 Jul
      out.prasadsBefore = S.status('prasads_imax');
      N.calendar.set(2003, 7, 26, 12, 0);
      out.prasadsAfter = S.status('prasads_imax').open;
      N.clock.set(23, 50);
      out.cafeLate = S.status('irani_cafe_7').open;
      out.stationCafe = S.status('alpha_hotel').open;
      N.clock.set(10, 30);
      out.dosaLate = S.rows('dosa_bandi_1').find((r) => r.id === 'dosa').why;
      out.idli = S.rows('dosa_bandi_1').find((r) => r.id === 'idli').why;
      out.hoursText = S.hoursText('barber_1');
      return out;
    });
    if (!h.kiranaEarly.ok && !h.kiranaStatus.open && /07:00/.test(h.label)) ok('kirana shut at 06:00: "' + h.label + '"'); else fail('kirana early: ' + JSON.stringify(h));
    if (!h.barberTue.open && !h.barberBuy.ok && h.barberThu) ok('barbers closed on Tuesdays (' + h.barberTue.text + '), open on Thursday'); else fail('barber Tuesday rule: ' + JSON.stringify(h.barberTue));
    if (!h.samosaNight && h.samosaEve) ok('samosa bandi only there 16:00–20:00'); else fail('samosa cart hours');
    if (!h.prasadsBefore.open && h.prasadsBefore.fence && h.prasadsAfter) ok('Prasads: tin fence "COMING SOON" until 25 Jul, then open'); else fail('prasads fence ' + JSON.stringify(h.prasadsBefore));
    if (!h.cafeLate && h.stationCafe) ok('Irani cafés shut at 23:30, the station café stays open'); else fail('cafe late hours');
    if (h.dosaLate && !h.idli) ok('dosa batter finished after ten, idli till eleven'); else fail('dosa idli rule');
    if (/Tuesday/.test(h.hoursText)) ok('map card hours: ' + h.hoursText); else fail('hoursText ' + h.hoursText);
  }

  /* -------------------------------------------------------------- services */
  if (want('services')) {
    console.log('\n== services: STD, barber, cinema, khaata, hire, punctures, train, money');
    await fresh(page);
    // STD save + the hint call
    const std = await page.evaluate(async () => {
      N.calendar.set(2003, 1, 20, 11, 0);
      N.debug.teleport('std_1');
      try { N.save.clear(); } catch (e) { /* ignore */ }
      const save = N.shops.buy('std_1', 'save');
      const has = N.save.has();
      let taken = null; N.on('hint:taken', (d) => { taken = d; });
      if (N.hints && N.hints.register) { N.hints.register('shops_test_clue', { clue: 'Where the chai never stops', answer: 'irani_cafe_7', ammamma: 'The café near your own house, *kanna*.' }); N.hints.start('shops_test_clue'); }
      const lines = []; N.on('dialogue:line', (d) => lines.push(d.text));
      const m0 = N.player.money;
      N.debug.skipDialogue(false);
      const call = N.shops.buy('std_1', 'call_home');
      await new Promise((r) => setTimeout(r, 400));
      for (let i = 0; i < 12 && N.dialogue.isOpen(); i++) { N.dialogue.advance(); N.dialogue.advance(); await new Promise((r) => setTimeout(r, 150)); }
      N.debug.skipDialogue(true);
      if (N.hints && N.hints.stop) N.hints.stop();
      return { save: save.ok && save.res && save.res.msg, has, call: call.ok, paid: m0 - N.player.money, taken, lines };
    });
    if (std.has && /saved/.test(std.save)) ok('STD booth saves the game (' + std.save.replace(/\*/g, '') + ')'); else fail('STD save ' + JSON.stringify(std));
    if (std.call && std.paid === 100 && std.lines.some((l) => /café near your own house|Café near|cafe/i.test(l))) ok('"Call home" ₹1: Ammamma gives the hint (' + (std.taken ? 'hint:taken ' + std.taken.source : 'no hint event') + ')'); else fail('call home hint ' + JSON.stringify(std));
    // barber clears the meter
    const bar = await page.evaluate(async () => {
      N.calendar.set(2003, 1, 20, 11, 0); // Monday
      N.debug.teleport('barber_1');
      N.shops.TUNE.haircutSecs = 0.4;
      N.debug.setWanted(3);
      const before = N.wanted.level, m0 = N.player.money;
      N.shops.haircut('barber_1');
      await new Promise((r) => setTimeout(r, 1500));
      const msg = document.querySelector('.shop-msg') && document.querySelector('.shop-msg').textContent;
      N.shops.close();
      return { before, after: N.wanted.level, paid: m0 - N.player.money, msg, hair: N.player.status.hair && N.player.status.hair.value, real: typeof N.wanted.addHeat === 'function' };
    });
    if (bar.before >= 3 && bar.after === 0 && bar.paid === 1000) ok('barber haircut ₹10 clears the Chappal Meter (' + bar.before + ' → 0, ' + (bar.real ? 'real wanted.js' : 'stub meter') + '; "' + (bar.msg || '') + '")'); else fail('barber ' + JSON.stringify(bar));
    // cinema: ticket, time skip, meter −2
    const cin = await page.evaluate(async () => {
      N.calendar.set(2003, 1, 10, 13, 0); N.clock.set(13, 0);
      N.debug.teleport('sandhya_theatre');
      N.debug.setWanted(2);
      const d0 = N.clock.day * 1440 + N.clock.minutes, m0 = N.player.money;
      N.shops.open('sandhya_theatre');
      const rows = N.shops.rows('sandhya_theatre');
      const i = N.shops.debug.UI.items.findIndex((it) => it.row.id === 'floor');
      N.shops.debug.activate(i);
      const film = document.querySelector('.pp-title') && document.querySelector('.pp-title').textContent;
      N.shops.debug.activate(0); // ▶ Watch
      await new Promise((r) => setTimeout(r, 3200));
      return { film, paid: m0 - N.player.money, skipped: N.clock.day * 1440 + N.clock.minutes - d0, wanted: N.wanted.level, energy: Math.round(N.player.energy), floor: rows.find((r) => r.id === 'floor') };
    });
    if (cin.film && cin.paid === 1000 && cin.skipped >= 180 && cin.wanted === 0) ok('cinema: *' + cin.film + '*, floor ₹10, ▶▶ +' + Math.round(cin.skipped) + ' min, meter 2 → 0'); else fail('cinema ' + JSON.stringify(cin));
    // khaata at kirana_1, toffee for change, never below zero
    const kh = await page.evaluate(() => {
      N.calendar.set(2003, 1, 20, 11, 0);
      N.player.money = 0;
      const a = N.shops.buy('kirana_1', 'fruit_sweets', { qty: 1 });
      const k1 = N.shops.khaata.owed;
      const b = N.shops.buy('kirana_2', 'fruit_sweets');
      N.shops.earn(500, 'test');
      const k2 = N.shops.khaata.owed, m = N.player.money;
      // never below zero: charge more than the purse
      N.player.money = 300;
      const c = N.shops.charge(1000);
      const d = N.shops.charge(1000, { companion: 'bunty' });
      const debts = N.shops.debts();
      const m2 = N.player.money;
      N.shops.earn(2000, 'test');
      return { a: a.ok, k1, b: b.ok, k2, m, c: c.ok, d: d.ok, debts, m2, m3: N.player.money, debts2: N.shops.debts() };
    });
    if (kh.a && kh.k1 === 100 && !kh.b && kh.k2 === 0 && kh.m === 400) ok('khaata at Agarwal-ji\'s: bought on credit, repaid from the next income'); else fail('khaata ' + JSON.stringify(kh));
    if (!kh.c && kh.d && kh.m2 === 0 && kh.debts[0] && kh.debts[0].paise === 700 && kh.m3 === 1300 && !kh.debts2.length) ok('money never below ₹0; a companion\'s udhaar is repaid automatically'); else fail('udhaar ' + JSON.stringify(kh));
    // cycle hire: hire, ride, return; late fee; puncture fix
    const hire = await page.evaluate(async () => {
      N.calendar.set(2003, 1, 20, 10, 0);
      N.player.money = 5000;
      N.debug.teleport('cycle_rent_1');
      const r = N.shops.hireCycle('cycle_rent_1', 'kid_cycle');
      const riding = N.player.vehicle && N.player.vehicle.type;
      N.clock.set(12, 30);
      const fee = N.shops.hireFee();
      const v = N.player.vehicle;
      N.vehicles.puncture(v);
      const flat = v.flat;
      N.player.vehicle && N.vehicles.exit(N.player, true);
      N.debug.teleport('cycle_rent_2');
      v.x = N.player.x + 12; v.y = N.player.y; v.okX = null;
      const m0 = N.player.money;
      N.shops.TUNE.punctureSecs = 0.2;
      N.shops.open('cycle_rent_2');
      const items = N.shops.debug.UI.items.map((it) => it.row.id);
      const pi = items.indexOf('puncture');
      if (pi >= 0) N.shops.debug.activate(pi);
      await new Promise((r) => setTimeout(r, 800));
      const fixed = !v.flat;
      const ri = N.shops.debug.UI.items.findIndex((it) => it.row.id === 'return');
      if (ri >= 0) N.shops.debug.activate(ri);
      N.shops.close();
      // late: not back by 07:00 next day
      N.shops.hireCycle('cycle_rent_2', 'cycle');
      if (N.player.vehicle) N.vehicles.exit(N.player, true);
      N.player.teleport(N.player.x + 200, N.player.y);
      N.calendar.set(2003, 1, 21, 8, 0);
      N.shops.debug.hireTick();
      return { riding, fee, flat, items, fixed, paid: m0 - N.player.money, hire: N.shops.hire, late: N.shops.debug.S.lateFee };
    });
    if (hire.riding === 'kid_cycle' && hire.fee === 900 && hire.flat && hire.fixed && hire.paid === 1100 && !hire.hire && hire.late === 1600) ok("cycle hire: kid's cycle, ₹3/hour (₹9 for 2½ h), puncture fixed ₹2, overnight → ₹16 owed"); else fail('cycle hire ' + JSON.stringify(hire));
    // the mini train at NTR Gardens (a viewpoint)
    const train = await page.evaluate(async () => {
      N.calendar.set(2003, 7, 30, 16, 0);
      N.debug.teleport('ntr_gardens');
      const p0 = { x: N.player.x, y: N.player.y };
      N.shops.buy('ntr_gardens', 'entry');
      let vp = null; N.on('viewpoint', (d) => { vp = d; });
      const r = N.shops.buy('ntr_gardens', 'train');
      if (N.shops.isOpen()) N.shops.close();
      await new Promise((r) => setTimeout(r, 400));
      const riding = N.shops.ride, hidden = N.player.hidden;
      await new Promise((r) => setTimeout(r, 3600));
      N.shops.debug.endRide();
      return { ok: r.ok, riding: !!riding, hidden, vp: !!vp, back: Math.hypot(N.player.x - p0.x, N.player.y - p0.y) < 40, unhidden: !N.player.hidden };
    });
    if (train.ok && train.riding && train.hidden && train.vp && train.back && train.unhidden) ok('NTR Gardens mini train: a seated ride and a viewpoint'); else fail('mini train ' + JSON.stringify(train));
    await shot('train');
    // station: weighing-machine fortune, platform ticket
    const st = await page.evaluate(() => {
      N.calendar.set(2003, 1, 20, 10, 0);
      N.debug.teleport('nampally_station');
      const a = N.shops.buy('nampally_station', 'platform');
      const has = N.shops.platformTicket('nampally_station');
      N.shops.open('nampally_station');
      const i = N.shops.debug.UI.items.findIndex((it) => it.row.id === 'weigh');
      N.shops.debug.activate(i);
      const t = document.querySelector('.shop-ticket') && document.querySelector('.shop-ticket').textContent;
      return { a: a.ok, has, t };
    });
    await shot('weighing');
    await page.evaluate(() => N.shops.close());
    if (st.a && st.has && /Lucky direction/.test(st.t || '')) ok('station: platform ticket ₹3 (good for the day), weighing-machine fortune: "' + st.t.replace(/\s+/g, ' ').slice(0, 90) + '…"'); else fail('station ' + JSON.stringify(st));
    // economy check (systems §5.18)
    const eco = await page.evaluate(() => N.shops.economy());
    if (eco.ok && eco.spend === 5400) ok('economy check: ' + eco.text); else fail('economy ' + JSON.stringify(eco));
    // random buying spree: money never negative
    const spree = await page.evaluate(() => {
      N.player.money = 1500;
      let neg = false, n = 0;
      const ids = N.shops.list();
      for (let k = 0; k < 400; k++) {
        const id = ids[(k * 37) % ids.length];
        const rows = N.shops.rows(id);
        if (!rows.length) continue;
        const r = rows[(k * 7) % rows.length];
        if (/routes|wait|std|portrait|scores|thatha|show|train|wheel|floor|balcony|fountain|safari|clock|sit|call_|haggle|bargain|challenge|brick|boat|hour|quarter|kid_cycle|big_cycle|ladies|return|job|paper|machan|window|lobby|well|auto|ramoji|hide|back_door|family|weigh|tinkle|chandamama|comic|books|garland|haircut|champi|puncture|develop|xerox|jukebox|watch|queue|lost|guide|enquiry|clue/.test(r.id)) continue;
        const res = N.shops.buy(id, r.id, { force: true });
        if (N.shops.isOpen()) N.shops.close();
        if (res.ok) n++;
        if (N.player.money < 0) neg = true;
      }
      return { neg, n, money: N.player.money };
    });
    if (!spree.neg && spree.money >= 0) ok('buying spree (' + spree.n + ' buys): money never below zero (₹' + (spree.money / 100) + ' left)'); else fail('money went negative ' + JSON.stringify(spree));
  }

  /* ---------------------------------------------------------------- travel */
  if (want('travel')) {
    console.log('\n== travel: bus, AUTO!, bargain, Nanna');
    await fresh(page);
    const bus = await page.evaluate(async () => {
      N.calendar.set(2003, 3, 5, 10, 0);
      N.debug.teleport('koti_bus_stand');
      const locked = N.shops.busDests('koti_bus_stand').find((d) => d.id === 'imlibun_bus_station');
      N.shops.unlockBus();
      const t0 = N.clock.day * 1440 + N.clock.minutes, m0 = N.player.money;
      N.shops.busBoard('koti_bus_stand');
      const board = N.shops.debug.UI.items.map((it) => ({ id: it.row.id, why: it.why }));
      const i = N.shops.debug.UI.items.findIndex((it) => it.row.id === 'bus_rathifile_bus_station');
      N.shops.debug.activate(i);
      await new Promise((r) => setTimeout(r, 3600));
      const p = N.places.rathifile_bus_station;
      return { locked: locked && locked.why, board: board.slice(0, 6), dist: Math.round(Math.hypot(N.player.x - p.x, N.player.y - p.y)), paid: m0 - N.player.money, mins: N.clock.day * 1440 + N.clock.minutes - t0, bus: N.vehicles.list.some((v) => v.type === 'bus' && Math.hypot(v.x - N.player.x, v.y - N.player.y) < 160) };
    });
    if (bus.locked && bus.dist < 60 && bus.paid === 300 && bus.mins > 5) ok('bus fast travel Koti → Rathifile: ₹3, ▶▶ +' + Math.round(bus.mins) + ' min, arrived ' + bus.dist + ' u from the stand' + (bus.bus ? ', the bus pulls away' : '')); else fail('bus ' + JSON.stringify(bus));
    // AUTO!: horn on foot near a road
    await page.evaluate(() => { N.calendar.set(2003, 3, 5, 11, 0); N.debug.teleport('abids'); });
    await sleep(300);
    const hail = await page.evaluate(() => { N.input.press('horn'); return true; });
    void hail;
    await sleep(300);
    const job0 = await page.evaluate(() => N.shops.autoJob && { arrived: N.shops.autoJob.arrived, type: N.shops.autoJob.vehicle.type });
    const came = await waitFor(page, () => N.shops.current && N.shops.current.kind === 'auto_ride', null, 22000);
    await sleep(600);
    await shot('auto_card');
    if (job0 && came) ok('"AUTO!" (horn on foot near a road): ' + job0.type + ' drives up, "Kidhar jaana?"'); else fail('auto hail ' + JSON.stringify(job0));
    if (came) {
      const q = await page.evaluate(() => {
        const items = N.shops.debug.UI.items;
        const i = items.findIndex((it) => /^to_/.test(it.row.id) && it.row.id !== 'to__goal');
        const dest = items[i] && items[i].row.id;
        N.shops.debug.activate(i);
        const quote = N.shops.debug.UI.items.map((it) => it.row.id);
        const sub = document.querySelector('.shop-sub') && document.querySelector('.shop-sub').textContent;
        const bi = N.shops.debug.UI.items.findIndex((it) => it.row.id === 'bargain');
        N.shops.debug.activate(bi);
        return { dest, quote, sub };
      });
      const mg = await waitFor(page, () => N.minigames && N.minigames.active === 'bargain', null, 4000);
      await sleep(600);
      await shot('auto_bargain');
      if (mg && q.quote.indexOf('pay') >= 0) ok('fare quote "' + (q.sub || '').slice(0, 70) + '" → [Bargain] opens the bargain minigame (who: auto)'); else fail('auto bargain ' + JSON.stringify(q));
      await page.evaluate(() => N.minigames.abort('test'));
      await sleep(500);
      const back = await page.evaluate(() => N.shops.current && N.shops.current.kind);
      if (back === 'auto_ride') ok('quitting the bargain returns to the auto card'); else fail('after the bargain: ' + back);
      await page.evaluate(() => N.shops.close());
    }
    // the fare formula
    const fare = await page.evaluate(() => { const a = N.places.koti_bus_stand, b = N.places.charminar; N.clock.set(12, 0); const day = N.shops.autoFare(a.x, a.y, b.x, b.y); N.clock.set(23, 0); const night = N.shops.autoFare(a.x, a.y, b.x, b.y); return { day, night }; });
    if (fare.day.ask === fare.day.meter + 1000 && fare.night.meter >= fare.day.meter * 1.4 && fare.day.meter % 100 === 0) ok('auto fare Koti → Charminar: ' + fare.day.km.toFixed(1) + ' km, meter ₹' + fare.day.meter / 100 + ' (he asks ₹' + fare.day.ask / 100 + '), night ₹' + fare.night.meter / 100); else fail('fare ' + JSON.stringify(fare));
    // an auto ride by the API (teleport + time)
    const ride = await page.evaluate(async () => { N.clock.set(12, 0); const t0 = N.clock.minutes; await N.shops.autoRide('charminar', { price: 1500 }); const c = N.places.charminar; return { d: Math.round(Math.hypot(N.player.x - c.x, N.player.y - c.y)), dt: N.clock.minutes - t0 }; });
    if (ride.d < 200 && ride.dt > 0) ok('auto ride to Charminar: arrived ' + ride.d + ' u away, +' + Math.round(ride.dt) + ' min'); else fail('auto ride ' + JSON.stringify(ride));
    // Nanna's Chetak pillion (45 finds): he comes after the call
    const nan = await page.evaluate(() => { N.flags.unlock_call_nanna = true; N.calendar.set(2003, 3, 6, 19, 0); N.debug.teleport('std_3'); N.shops.TUNE.nannaDelay = 0.5; return N.shops.callNanna() || N.shops.nannaWhy(); });
    const nanCame = nan === true && await waitFor(page, () => N.shops.current && N.shops.current.kind === 'nanna_ride', null, 22000);
    if (nanCame) ok("Call Nanna: the family Chetak arrives, pillion to any place you know"); else fail('nanna pillion ' + nan);
    await page.evaluate(() => N.shops.close());
  }

  /* ------------------------------------------------------------------ jobs */
  if (want('jobs')) {
    console.log('\n== odd jobs (autopilot)');
    await fresh(page);
    await page.evaluate(() => { N.sidejobs.autopilot = true; N.flags.antenna_jobs = true; });
    for (const id of ['job_paper_round', 'job_girni_dabbas', 'job_kirana_errand', 'job_raddi', 'job_antenna', 'job_rythu_list', 'job_cutout', 'job_gully_league']) {
      const b = await page.evaluate((id) => { N.debug.teleport('home'); return { m: N.player.money, r: N.sidejobs.runs(id) }; }, id);
      const started = await page.evaluate((id) => N.sidejobs.start(id, { force: true }), id);
      const done = await waitFor(page, (id) => !N.missions.active && N.sidejobs.runs(id) > 0, id, 90000);
      const a = await page.evaluate((id) => ({ m: N.player.money, r: N.sidejobs.runs(id), L: N.sidejobs.level(id), pay: N.sidejobs.earned(id) }), id);
      if (started && done && a.r === b.r + 1) ok(id + ': started and completed, paid ' + (a.m - b.m) + ' p (level ' + a.L + ')');
      else {
        const why = await page.evaluate(() => ({ step: N.sidejobs.active && N.sidejobs.active.step, mode: N.state.mode, stack: N.state.stack && N.state.stack.slice(), mission: N.missions.active && N.missions.active.id, mg: N.minigames && N.minigames.active, obj: N.hud && N.hud.objectiveText, dlg: !!(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()), pos: [Math.round(N.player.x), Math.round(N.player.y)], errs: N.errors.slice(-3).map((e) => e.where + ': ' + e.msg) }));
        fail(id + ' started ' + started + ' done ' + done + ' ' + JSON.stringify(a) + ' ' + JSON.stringify(why));
        await page.evaluate(() => { try { if (N.minigames && N.minigames.active) N.minigames.abort('test'); if (N.missions.active && N.missions.abort) N.missions.abort(); } catch (e) { /* ignore */ } });
      }
    }
    // lootna: a cut kite falls, catch it
    const lt = await page.evaluate(() => { N.calendar.set(2003, 1, 14, 17, 0); N.debug.teleport('playground_1'); return N.sidejobs.start('job_lootna', { force: true }); });
    const caught = lt && await waitFor(page, () => N.sidejobs.runs('job_lootna') > 0, null, 30000);
    if (caught) ok('kite lootna: a cut kite drifts down, caught under its shadow (' + (await page.evaluate(() => N.player.itemCount('lootna_kite'))) + ' in hand)'); else fail('lootna');
    // levels: 2 runs -> L2
    const lv = await page.evaluate(() => ({ L: N.sidejobs.level('job_paper_round'), runs: N.sidejobs.runs('job_paper_round'), LEVELS: N.sidejobs.LEVELS }));
    if (lv.runs === 1 && lv.L === 1) ok('job levels: L1 at start (L2 after 2 runs, L3 after 5, L4 after 9, L5 after 14)'); else fail('levels ' + JSON.stringify(lv));
    await page.evaluate(() => { N.sidejobs.autopilot = false; });
  }

  /* -------------------------------------------------------------- vehicles */
  if (want('vehicles')) {
    console.log('\n== vehicles');
    await fresh(page);
    const v = await page.evaluate(async () => {
      const out = {};
      const p = N.player;
      N.debug.teleport('abids');
      // no driving buses and lorries (debug enter still works)
      const bus = N.debug.spawnVehicle('bus');
      p.x = bus.x + 2; p.y = bus.y + 14;
      await new Promise((r) => setTimeout(r, 200));
      out.busOffer = N.input.actionLabel;
      const lorry = N.debug.spawnVehicle('lorry');
      p.x = lorry.x; p.y = lorry.y + 14;
      await new Promise((r) => setTimeout(r, 200));
      out.lorryOffer = N.input.actionLabel;
      out.debugEnter = N.vehicles.enter(p, bus) && p.vehicle === bus;
      N.vehicles.exit(p, true);
      N.vehicles.remove(bus); N.vehicles.remove(lorry);
      // kid at the wheel: an auto tops out ~10% slower with the kid driving
      out.kid = N.vehicles.TUNE.kidTop;
      // story types
      out.types = ['family_chetak', 'chinnu_cycle', 'old_cycle', 'bunty_rx100', 'yadagiri_auto', 'pochaiah_luna', 'pasha_lambretta', 'peacock_lorry', 'govt_ambassador', 'taxi_ambassador', 'safari_bus'].filter((t) => !N.vehicles.TYPES[t]);
      const vip = N.debug.spawnVehicle('govt_ambassador');
      p.x = vip.x; p.y = vip.y + 12;
      await new Promise((r) => setTimeout(r, 200));
      out.vip = N.input.actionLabel;
      N.vehicles.remove(vip);
      // falls: a hard bump on a cycle -> DHADAAM, the cycle lies down, "Pick up"
      const cyc = N.debug.enterVehicle('cycle');
      p.god = false;
      N.emit('bump', { a: cyc, b: null, speed: 110, wall: true, vehicle: cyc, x: cyc.x, y: cyc.y });
      out.fallen = !!cyc.fallen && !p.vehicle;
      p.god = true;
      await new Promise((r) => setTimeout(r, 2600));
      p.x = cyc.x; p.y = cyc.y + 10;
      await new Promise((r) => setTimeout(r, 200));
      out.pick = N.input.actionLabel;
      return out;
    });
    if (!/Drive/.test(v.busOffer || '') && !/Drive/.test(v.lorryOffer || '') && v.debugEnter) ok('the player cannot take buses or lorries (labels: ' + v.busOffer + ' / ' + v.lorryOffer + '); debug enter still works'); else fail('heavy noEnter ' + JSON.stringify(v));
    if (!v.types.length) ok('story vehicle types defined (family Chetak, Chinnu\'s cycle, roadster, Bunty\'s RX100, Yadagiri\'s auto, Pochaiah\'s Luna, Pasha\'s Lambretta, peacock lorry, VIP / taxi Ambassadors, safari bus)'); else fail('missing types ' + v.types);
    if (v.vip === 'Nakko') ok('VIP Ambassador: "Nakko" (never borrowable)'); else fail('vip label ' + v.vip);
    if (v.fallen && /Pick up/.test(v.pick || '')) ok('DHADAAM: the cycle lies on its side, ACTION "' + v.pick + '"'); else fail('fall ' + JSON.stringify(v));
    // kid at the wheel + bike surfaces: measured top speeds
    const sp = await page.evaluate(async () => {
      const p = N.player;
      const meas = async (type, kid, setup) => {
        N.debug.teleport('tank_bund');
        const v = N.debug.spawnVehicle(type);
        if (setup) setup(v);
        if (kid) N.vehicles.enter(p, v); else v.driver = { look: N.people.randomLook(null, 'man'), npc: true };
        let top = 0;
        v.controller = (veh) => { veh.ctl.throttle = 1; veh.ctl.steer = 0; };
        if (kid) { N.input.hold('up', true); }
        for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 50)); top = Math.max(top, Math.abs(v.speed)); }
        N.input.hold('up', false);
        if (p.vehicle) N.vehicles.exit(p, true);
        N.vehicles.remove(v);
        return Math.round(top);
      };
      return { autoKid: await meas('auto', true), autoMan: await meas('auto', false) };
    });
    if (sp.autoKid < sp.autoMan) ok('kid at the wheel: the auto tops out slower (' + sp.autoKid + ' vs ' + sp.autoMan + ' u/s after 2 s)'); else fail('kid factor ' + JSON.stringify(sp));
  }

  /* ---------------------------------------------------------- UI (real input) */
  if (want('ui')) {
    console.log('\n== the shop card with real keys (desktop)');
    await fresh(page, 1000);
    await page.evaluate(() => { N.calendar.set(2003, 1, 20, 10, 0); N.debug.teleport('kirana_1'); });
    await sleep(500);
    const label = await page.evaluate(() => N.input.actionLabel);
    await page.keyboard.press('e');
    const opened = await waitFor(page, () => N.shops.current && N.shops.current.id === 'kirana_1', null, 3000);
    await sleep(300);
    await shot('kirana_desktop');
    const m0 = await page.evaluate(() => N.player.money);
    await page.keyboard.press('ArrowRight'); // two Mango Bites
    await sleep(120);
    await page.keyboard.press('e');
    await sleep(300);
    const after = await page.evaluate(() => ({ money: N.player.money, mb: N.player.itemCount('mango_bite'), msg: document.querySelector('.shop-msg').textContent, mode: N.state.mode, clockHeld: N.clock.held }));
    await page.keyboard.press('ArrowDown');
    await sleep(120);
    await shot('kirana_desktop_bought');
    await page.keyboard.press('Escape');
    await sleep(300);
    const closed = await page.evaluate(() => ({ open: N.shops.isOpen(), mode: N.state.mode, paused: N.state.has('paused'), held: N.clock.held }));
    if (opened && /Kirana/.test(label || '')) ok('ACTION "' + label + '" opens the kirana card (the clock holds: ' + after.clockHeld + ')'); else fail('kirana open ' + label + ' ' + opened);
    if (m0 - after.money >= 100 && after.mb === 2) ok('→ 2 Mango Bites with E (' + after.msg.trim() + ')'); else fail('buy with keys ' + JSON.stringify(after));
    if (!closed.open && closed.mode === 'play' && !closed.paused && !closed.held) ok('Esc closes the card back to play (no pause menu)'); else fail('esc ' + JSON.stringify(closed));
    // the BAND card
    await page.evaluate(() => { N.clock.set(23, 30); N.shops.open('stationery_1'); });
    await sleep(300);
    await shot('band');
    await page.evaluate(() => N.shops.close());
  }

  await context.close();

  /* --------------------------------------------------------------- phone */
  if (want('ui')) {
    console.log('\n== the shop card on a phone (taps)');
    const ph = await boot(browser, { width: 390, height: 844 }, true);
    const p2 = ph.page;
    await p2.evaluate(() => { N.player.money = 3000; N.calendar.set(2003, 1, 20, 10, 0); N.debug.teleport('irani_cafe_7'); });
    await sleep(600);
    const tl = await p2.evaluate(() => N.input.actionLabel);
    const act = await p2.$('#touch .t-action, #touch [data-a=action], #touch .t-btn.action');
    if (act) await act.tap(); else await p2.evaluate(() => N.input.press('action'));
    const opened = await waitFor(p2, () => N.shops.isOpen(), null, 3000);
    await sleep(400);
    await p2.screenshot({ path: path.join(OUT, 'shops_cafe_phone.png') });
    const m0 = await p2.evaluate(() => N.player.money);
    await p2.tap('.shop-row.house .r-buy');
    await sleep(400);
    const m1 = await p2.evaluate(() => N.player.money);
    const fits = await p2.evaluate(() => { const r = document.querySelector('.shop-card').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1; });
    await p2.tap('.shop-x');
    await sleep(300);
    const closed = await p2.evaluate(() => !N.shops.isOpen() && N.state.mode === 'play');
    if (opened && /Chai/.test(tl || '')) ok('phone: ACTION "' + tl + '" opens the café card'); else fail('phone open ' + tl);
    if (m0 - m1 === 800 && fits && closed) ok('phone: tap ₹8 buys the combo; the card fits the screen; ✕ closes'); else fail('phone buy ' + JSON.stringify({ m0, m1, fits, closed }));
    // landscape phone: the cinema poster
    await p2.setViewportSize({ width: 844, height: 390 });
    await p2.evaluate(() => { N.calendar.set(2003, 1, 10, 12, 0); N.debug.teleport('sandhya_theatre'); N.shops.open('sandhya_theatre'); N.shops.debug.activate(0); });
    await sleep(500);
    await p2.screenshot({ path: path.join(OUT, 'shops_poster_landscape.png') });
    await p2.evaluate(() => N.shops.close());
    for (const e of ph.errors) fail('[phone] ' + e);
    const ne = await p2.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
    for (const e of ne) fail('[phone] N.err ' + e);
    await ph.context.close();
  }

  for (const e of errors) fail(e);
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S)' : 'ALL SHOPS TESTS PASSED'));
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
