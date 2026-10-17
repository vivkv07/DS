/* NOSTALGIA — shops.js  (owner: shops agent)
 * Every shop and service of systems_design §5 at every place of that kind in worlddata, with
 * prices (paise), opening hours, menus and effects; the tin-sign shop card (DOM, #overlay);
 * travel (city bus hubs + stops, "AUTO!" hailing with fare haggling, Nanna's pillion, boats, the
 * NTR mini train); cinemas, Prasads, Numaish, museums, stations, STD booths (save + hint calls),
 * barbers (clear the Chappal Meter), cycle hire, khaata and udhaar; visited-place tracking.
 * Contract: ARCHITECTURE.md §19; design/systems_design.md §1.4, §2.4, §3.3, §3.6, §3.7, §4.6, §5,
 * §13.6; story_bible §8.4 (shopkeeper lines). Robust when wanted / traffic / collectibles /
 * minigames / hints / menus are still stubs (every call is feature-checked).
 *
 * ================================================================ API (story.js / story2.js use these)
 *   N.shops.open(placeId, {focus, vehicle}) -> bool     opens the shop card (aliases resolve)
 *   N.shops.close()    isOpen()    current -> {id, kind, name} | null
 *   N.shops.buy(placeId, itemId, {qty, free, quiet, force}) -> {ok, why, paid}   (no UI; hours/money
 *       respected unless force; free = no charge). Food is eaten, carry items go to N.player.items.
 *   N.shops.quickOrder(placeId) -> result   the ★ house item (also: hold ACTION 0.5 s at the shop)
 *   N.shops.defs {placeId: def}  kindOf(id)  resolve(id) -> canonical id  list(kind?) -> [ids]
 *   N.shops.KINDS (catalogue), N.shops.PRICES {kind: {itemId: paise}}, N.shops.TUNE
 *   N.shops.status(id, minutes?) -> {open, reason, opens, closes, text}   isOpenNow(id)
 *   N.shops.hours(id) -> [[open, close], ...] (minutes)   hoursText(id) -> 'Open 05:00–23:30' (map cards)
 *   N.shops.addRow(placeId | kind, row) / removeRow(rowId)   scripted mission rows, e.g. M2's tin:
 *       {id, name, price, give: {tin: 1}, when: () => null | 'reason', hidden: () => bool, act(ctx, qty)}
 *   N.shops.lock(on, reason) — scripts can lock every shop (also N.flags.lock_shops / def.lockShops)
 *   Money (systems §2.4: never below 0, no soft-locks):
 *     charge(paise, {why, companion: 'bunty'|'immu'|'amma'|'ammi', khaata}) -> {ok, paid, udhaar}
 *       a companion pays the difference ("Udhaar") and is repaid from the next income
 *     earn(paise, why)   debts() -> [{who, paise}]   khaata -> {owed, limit}
 *   Travel:
 *     busBoard(fromId) (opens the route board), busTo(destId, {free}) -> Promise, busUnlocked(),
 *     unlockBus(hub?) (M5: koti/imlibun/rathifile/gowliguda; 'mehdipatnam', 'golconda' in M7),
 *     busStops() -> [{id, ticket, found}]
 *     hailAuto({yadagiri, stand}) -> bool (horn on foot near a road does this), autoFare(x0, y0, x1, y1)
 *       -> {meter, ask, dist} (paise), autoRide(destId | {x, y, name}, {price}) -> Promise
 *     callNanna() (STD, 45 finds) / nannaWhy() -> reason|null, travelTo(dest, {mode, minutes}) -> Promise (VHS ▶▶ + teleport)
 *     A3 (amendments): callBunty() / buntyWhy() / buntyJob — Bunty-anna's RX100 pillion (60 finds; STD row
 *       "Call Bunty-anna", or "Pillion with Bunty-anna" at chai_bandi_3 11-16 h / ameerpet_coaching 18-21 h);
 *       rideVehicle(v) — a traffic auto / taxi with its driver as a passenger with the fare card (vehicles.js
 *       offers "Ride auto (fare)"). Cycle hire: kid / big black Hero / Hercules (₹4 an hour, cap ₹12) / ladies.
 *     ffwd(minutes, {ms, label, mid}) -> Promise   pass game time with the VHS ▶▶ look
 *   Services: stdSave(), callHome(), haircut(placeId), trainRide(placeId, {secs}) -> Promise,
 *     viewpoint(id, x, y, {zoom, secs}), fortune(x, y) -> text (weighing machine),
 *     platformTicket(stationId) -> bool (bought today), hireCycle(placeId, type), returnCycle(placeId),
 *     hire -> {place, type, start, day} | null, addEmail({id, from, to, subject, body, when})
 *   N.shops.visited(id) -> bool (also N.flags.visited[id]); markVisited(id)
 *   N.shops.economy() -> the systems §5.18 one-hour check from the live prices
 * Events: 'shop:open' {place, kind}, 'shop:close', 'shop:buy' {place, item, price, qty}, 'money'
 *   {delta, total, why}, 'shop:service' {place, service}, 'auto:hail' {x, y, vehicle, yadagiri},
 *   'auto:ride' {to, price}, 'bus:ride' {from, to}, 'travel' {mode, to, minutes}, 'time:skip'
 *   {minutes, why}, 'viewpoint' {id, x, y, r}, 'udhaar' {who, paise}, 'udhaar:repaid' {who, paise}.
 * Save section 'shops' (khaata, debts, hire, daily uses, platform tickets, parlour scores, emails).
 *
 * Coordination (other agents): wanted.js — barbers call N.wanted.clear('barber'), cool-downs
 * N.wanted.set(level, reason); shop menus call N.wanted.freeze(true|false, 'shop'); the kirana
 * "Hide" / parlour "Back door" rows call N.wanted.hide(kind, placeId) when it exists.
 * traffic.js — shops owns the "AUTO!" call (horn on foot near a road): it asks
 * N.traffic.claimAuto(x, y, r) -> vehicle | null for an ambient auto first, else spawns its own.
 * collectibles.js — develop(), nearestUnfound(x, y, series), reveal(x, y, r, sec), triviaFor(id).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================== helpers */
  const hm = (s) => { if (typeof s === 'number') return s; const r = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return r ? +r[1] * 60 + +r[2] : 0; };
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const absMin = () => ((N.clock && N.clock.day) || 0) * 1440 + mins();
  const day = () => (N.clock && N.clock.day) || 0;
  const fmtHM = (m) => U.fmtClock(((Math.round(m) % 1440) + 1440) % 1440);
  /** "₹4", "₹2.50", "50 p", "free" */
  function rs(p) {
    p = Math.round(p || 0);
    if (p <= 0) return 'free';
    if (p < 100) return p + ' p';
    return '₹' + (p % 100 ? (p / 100).toFixed(2) : String(p / 100));
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const emph = (s) => esc(s).replace(/\*([^*]+)\*/g, '<i>$1</i>');
  const plain = (s) => String(s == null ? '' : s).replace(/\*([^*]+)\*/g, '$1');
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, Object.assign({ ui: true }, o || {})); } catch (e) { /* audio never breaks shops */ } }
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600); } catch (e) { /* ignore */ } }
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const pick = (arr, seed) => arr[Math.abs(seed == null ? (Math.random() * 1e9) | 0 : seed) % arr.length];
  function date() {
    try { if (N.calendar && N.calendar.date) return N.calendar.date; } catch (e) { /* stub */ }
    const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
    const d = new Date(Date.UTC(b[0], b[1], b[2] + day()));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
  }
  const dow = () => date().dow;
  function inMD(from, to) {
    const md = (s) => { const r = /^(\d{1,2})-(\d{1,2})$/.exec(s); return r ? +r[1] * 100 + +r[2] : 0; };
    const d = date(), v = d.m * 100 + d.d, a = md(from), b = md(to);
    return a <= b ? v >= a && v <= b : v >= a || v <= b;
  }
  function season(name) {
    try { if (N.seasons && typeof N.seasons.is === 'function' && N.seasons.is(name)) return true; } catch (e) { /* stub */ }
    return !!(N.flags && N.flags[name]);
  }
  const ramzan = () => season('ramzan') || (date().y === 2003 && inMD('10-27', '11-25'));
  const numaishOn = () => season('numaish') || inMD('01-01', '02-15');
  const summer = () => season('summer') || inMD('04-24', '06-11');
  const december = () => date().m === 12;
  function prasadsOpen() {
    if (season('prasads_open') || (N.flags && N.flags.prasads_open)) return true;
    const d = date();
    return d.y > 2003 || (d.y === 2003 && (d.m > 7 || (d.m === 7 && d.d >= 25)));
  }
  function schoolDay() { try { if (N.calendar && N.calendar.isSchoolDay) return N.calendar.isSchoolDay(); } catch (e) { /* stub */ } const w = dow(); return w !== 0 && !summer(); }
  const isDone = (id) => { try { return !!(N.missions && N.missions.isDone && N.missions.isDone(id)); } catch (e) { return false; } };
  const wanted = () => (N.wanted && (N.wanted.level | 0)) || 0;
  function finds() {
    const C = N.collectibles;
    try { if (C && typeof C.total === 'function') { const n = +C.total(); if (isFinite(n)) return n; } } catch (e) { /* stub */ }
    try { if (C && C.found && typeof C.found.size === 'number') return C.found.size; } catch (e) { /* stub */ }
    return 0;
  }
  function colHas(ids) {
    const C = N.collectibles;
    for (const id of ids) {
      if (N.flags && N.flags['found_' + id]) return true;
      if (!C) continue;
      try { if (typeof C.isFound === 'function' && C.isFound(id)) return true; } catch (e) { /* ignore */ }
      try { if (typeof C.has === 'function' && C.has(id)) return true; } catch (e) { /* ignore */ }
      try { if (C.found && typeof C.found.has === 'function' && C.found.has(id)) return true; } catch (e) { /* ignore */ }
    }
    return false;
  }
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const mod = (n, m) => ((Math.floor(n) % m) + m) % m;
  const respectAt = (x, y) => { try { return !!(N.respect && typeof N.respect.at === 'function' && N.respect.at(x, y)); } catch (e) { return false; } };
  const reduced = () => !!(document.body && document.body.classList.contains('reduced-motion'));
  function inv(id) { const p = N.player; return !!(p && ((p.inventory && p.inventory.has(id)) || (p.items && p.items[id] > 0))); }
  function itemCount(id) { const p = N.player; return (p && p.items && p.items[id]) | 0; }
  function addItem(id, n) {
    const p = N.player; if (!p) return 0;
    if (typeof p.addItem === 'function') return p.addItem(id, n);
    p.items = p.items || {}; p.items[id] = Math.max(0, (p.items[id] | 0) + (n == null ? 1 : n)); return p.items[id];
  }
  function giveInv(id) { const p = N.player; if (p && p.inventory) { p.inventory.add(id); N.emit('item:give', { id, shop: true }); } }
  function feed(n, o) {
    const p = N.player; if (!p) return;
    if (typeof p.feed === 'function') { p.feed(n, o); return; }
    // entities.js without tummy (old engine): energy only
    p.energy = U.clamp((p.energy || 0) + (o && o.energy != null ? o.energy : n), 0, 100);
  }
  function status(id, dur, o) { const p = N.player; if (p && typeof p.addStatus === 'function') { try { p.addStatus(id, dur, o); } catch (e) { N.err('shops.status', e); } } }
  function clearStatus(id) { const p = N.player; return !!(p && typeof p.clearStatus === 'function' && p.clearStatus(id)); }
  function hasStatus(id) { const p = N.player; return !!(p && typeof p.hasStatus === 'function' && p.hasStatus(id)); }
  function meterDown(n, why) {
    const W = N.wanted, l = wanted();
    if (!W || l <= 0) return 0;
    const to = Math.max(0, l - n);
    try { if (to === 0 && typeof W.clear === 'function') W.clear(why); else if (typeof W.set === 'function') W.set(to, why); } catch (e) { N.err('shops.meter', e); }
    return l - wanted();
  }
  /** A chaser within r u that has seen Chinnu (barber / family room / cinema refuse then). */
  function chaserNear(r) {
    const W = N.wanted, p = N.player;
    if (!W || !W.chaser || !p) return false;
    const c = W.chaser;
    if (!isFinite(c.x)) return false;
    return Math.hypot(c.x - p.x, c.y - p.y) < r && W.seen !== false;
  }
  function speakerName(id) {
    try { if (N.npcs && N.npcs.displayName) { const n = N.npcs.displayName(id); if (n) return n; } } catch (e) { /* ignore */ }
    const s = N.dialogue && N.dialogue.speakers && N.dialogue.speakers[id];
    return (s && s.name) || ({ waiter: 'Waiter', cashier: 'Cashier' }[id]) || String(id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function subst(t) { try { return N.menus && N.menus.subst ? N.menus.subst(t) : String(t).replace(/\{nick\}/g, (N.player && N.player.name) || 'Chinnu'); } catch (e) { return t; } }

  /* =================================================================== tuning */
  const TUNE = {
    r: 18, rBig: 30, quickHold: 0.5, lineCooldown: 10, toffeeChance: 0.3, khaataLimit: 1000, khaataLimitL5: 2000,
    busPrice: 300, busSpeed: 115, busFxMs: 2500, autoFirst: 600, autoPerKm: 400, mapKm: 430, autoAsk: 1000, autoNight: 1.5,
    autoSpeed: 135, autoFxMs: 3000, autoReach: 40, autoSpawnR: 260, autoTimeout: 14, hireHour: 300, hireCap: 1000, hireLate: 300, hireLost: 1600,
    puncture: 200, cinemaFloor: 1000, cinemaBalcony: 2500, prasads: 5000, boat: 1000, boatSecs: 120, trainSecs: 45, nannaDelay: 20, buntyDelay: 15,
    familyRoomSecs: 10, haircutSecs: 8, champiSecs: 6, punctureSecs: 2, hideSecs: 8, lobbySecs: 10,
  };

  /* ==================================================================== state */
  const S = {
    khaata: 0, debts: [], hire: null, lateFee: 0, ledger: { day: -1, used: {} }, platform: {}, parlour: {}, beaten: {},
    lastOrder: null, emails: [], read: {}, lineT: {}, locks: new Set(), stats: { spent: 0, earned: 0, buys: 0 },
    hail: null, nanna: null, boat: null, ride: null, ff: null, hold: null, gokulBest: 0, sticker: {},
  };
  function used(key) { const L = S.ledger; if (L.day !== day()) { L.day = day(); L.used = {}; } return !!L.used[key]; }
  function use(key) { used(key); S.ledger.used[key] = absMin() + 1; }

  /* ==================================================================== money */
  // Every rupee moves through N.player.money and emits 'money' (the HUD and audio listen).
  function emitMoney(delta, why, extra) { N.emit('money', Object.assign({ delta, total: N.player.money, why: why || 'shop' }, extra || {})); }
  /** Pay `paise`. Never below zero; a companion can cover the gap as udhaar (systems §2.4). */
  function charge(paise, o) {
    o = o || {};
    const p = N.player;
    paise = Math.max(0, Math.round(paise || 0));
    if (!p) return { ok: false, paid: 0 };
    if (!paise) return { ok: true, paid: 0 };
    const have = Math.max(0, p.money | 0);
    if (have >= paise) { p.money = have - paise; S.stats.spent += paise; emitMoney(-paise, o.why); return { ok: true, paid: paise }; }
    if (o.khaata) {
      const lim = khaataLimit();
      if (S.khaata + paise <= lim) { S.khaata += paise; N.emit('udhaar', { who: 'agarwal', paise }); return { ok: true, paid: 0, khaata: paise }; }
      return { ok: false, paid: 0, why: 'Khaata is full. *Aaj nakad, kal udhaar.*' };
    }
    if (o.companion) {
      const gap = paise - have;
      if (have) { p.money = 0; S.stats.spent += have; emitMoney(-have, o.why); }
      addDebt(o.companion, gap);
      return { ok: true, paid: have, udhaar: gap };
    }
    return { ok: false, paid: 0, why: '*Paise kam hain, beta.*' };
  }
  function khaataLimit() {
    let lvl = 0;
    try { lvl = N.sidejobs && N.sidejobs.level ? N.sidejobs.level('job_kirana_errand') : 0; } catch (e) { lvl = 0; }
    return lvl >= 5 ? TUNE.khaataLimitL5 : TUNE.khaataLimit;
  }
  const WHO = { bunty: 'Bunty-anna', immu: 'Immu', amma: 'Amma', ammi: 'Ammi', agarwal: 'Agarwal-ji', cycle_shop: 'the cycle shop' };
  function addDebt(who, paise) {
    if (!(paise > 0)) return;
    const d = S.debts.find((x) => x.who === who);
    if (d) d.paise += paise; else S.debts.push({ who, paise });
    toast('*Udhaar.* ' + (WHO[who] || who) + ' paid ' + rs(paise) + '. "Pay me back in Sankranti kites."', 3200);
    N.emit('udhaar', { who, paise });
  }
  function earn(paise, why) {
    const p = N.player; paise = Math.round(paise || 0);
    if (!p || paise <= 0) return 0;
    p.money = (p.money | 0) + paise; S.stats.earned += paise;
    emitMoney(paise, why);
    return paise;
  }
  // repaid automatically from the next income (khaata first, then the companions)
  let repaying = false;
  function repay() {
    const p = N.player;
    if (repaying || !p || !(p.money > 0)) return;
    repaying = true;
    try {
      if (S.khaata > 0) {
        const x = Math.min(S.khaata, p.money);
        if (x > 0) { S.khaata -= x; p.money -= x; emitMoney(-x, 'khaata', { repay: true }); toast('*Aaj nakad, kal udhaar.* Khaata paid: ' + rs(x) + ' to Agarwal-ji.', 2800); N.emit('udhaar:repaid', { who: 'agarwal', paise: x }); }
      }
      for (const d of S.debts) {
        if (!(p.money > 0)) break;
        const x = Math.min(d.paise, p.money);
        if (x > 0) { d.paise -= x; p.money -= x; emitMoney(-x, 'udhaar', { repay: true }); toast('*Udhaar chukaya:* ' + rs(x) + ' to ' + (WHO[d.who] || d.who) + '.', 2800); N.emit('udhaar:repaid', { who: d.who, paise: x }); }
      }
      S.debts = S.debts.filter((d) => d.paise > 0);
    } finally { repaying = false; }
  }
  N.on('money', (d) => { if (d && d.delta > 0 && !d.repay && d.why !== 'refund' && (S.khaata > 0 || S.debts.length)) repay(); });

  /* ================================================================ catalogue */
  // Row fields: id, name, sub, price (paise, or fn(ctx)), house (★, the quick order), feed (n | {tummy,
  // energy}), status ('warm' | ['warm', secs]), give {item: n} (N.player.items), inv 'id' (inventory),
  // cap {item: max}, max (qty per purchase), hidden(ctx), when(ctx) -> null | 'greyed reason',
  // act(ctx, qty) -> string | {msg, close} | Promise (services; runs after the price is paid unless
  // payLater), line (keeper reply), fx [[icon, text]] (chips), mission (story row look).
  const OLD_CITY = new Set(['charminar', 'puranapul', 'bahadurpura', 'dabeerpura', 'falaknuma']);
  const haleemTime = () => ramzan() && (mins() >= hm('17:30') || mins() < 60);
  const STD_LINES = ['Come at night, the rate is less.', 'Check the meter, take the bill, next!'];
  const FILMS = [
    { t: 'Toofan Tammudu', s: 'The storm brother is back. Whistles allowed.', c: ['#c8231d', '#f2c230'], cert: 'U/A' },
    { t: 'Mass Maharaju', s: '100 DAYS! Houseful every show.', c: ['#1e5aa8', '#f2a72f'], cert: 'U/A' },
    { t: 'Dum Dum Dosa', s: 'A cook, a cart, a city that never sleeps.', c: ['#2a8c82', '#f4e8c8'], cert: 'U' },
    { t: 'Pyaar Ka Pressure Cooker', s: 'Love whistles three times.', c: ['#d24d57', '#ffd95a'], cert: 'U' },
    { t: 'Kabaddi Kalyan', s: 'One breath. One raid. One hero.', c: ['#3a7d4f', '#efe9dc'], cert: 'U' },
    { t: 'Monsoon Mamu', s: 'He brought an umbrella to a cricket match.', c: ['#3a5a8a', '#a8d0e0'], cert: 'U' },
    { t: 'Chalo Charminar', s: 'Four friends, four minarets, one summer.', c: ['#b98f5e', '#e8d9b5'], cert: 'U' },
    { t: 'Rickshaw Rani', s: 'Meter down. Heart up.', c: ['#f2c230', '#1a1214'], cert: 'U' },
  ];
  const DOCS = [
    { t: 'Giants of the Deep', s: 'The screen so big it has no edges. Whales the size of buses.', c: ['#0e3a5a', '#7ad0e0'], cert: 'U' },
    { t: 'Planet of Ice', s: 'Penguins, glaciers, and the whole hall shivering in the AC.', c: ['#e8f4ff', '#3a7ab8'], cert: 'U' },
    { t: 'Into the Volcano', s: 'Red rivers of rock. Ammamma would cover her eyes.', c: ['#7a1a10', '#ff8a30'], cert: 'U' },
  ];
  const SHOWS = ['11:00', '14:30', '18:00', '21:00'];

  const KINDS = {
    /* ---------------------------------------------------------- Irani cafés (§5.2) */
    irani_cafe: {
      title: 'Irani café', verb: 'Chai', keeper: 'waiter', icon: 'cup', hours: [['05:00', '23:30']], quick: 'combo', big: false,
      lines: ['*Do pauna, ek plate Osmania*, table *teen*!', '*Paani-kam*? Piping hot, coming.', 'Bun-maska finished, samosa is there.', 'Family room is upstairs, aunties please.', "Dunk the biscuit, don't drown it. Osmania is delicate.", 'Pay at the *galla*. The bill is in my head.', 'Score? Ask the radio. I am counting.'],
      rows: [
        { id: 'combo', name: '*Do chai, ek plate Osmania*', sub: 'the house combo: Irani chai + Osmania biscuits', price: 800, feed: 40, status: 'warm', house: true, line: '*Do pauna, ek plate Osmania*, table *teen*!' },
        { id: 'chai', name: 'Irani chai (*pauna*)', price: 400, feed: 20, status: 'warm' },
        { id: 'paani_kam', name: '*Paani-kam* chai', sub: 'less water, more chai', price: 500, feed: 22, status: ['warm', 90], line: '*Paani-kam*? Piping hot, coming.' },
        { id: 'osmania', name: 'Osmania biscuits, plate of 4', price: 400, feed: 20, line: "Dunk the biscuit, don't drown it." },
        { id: 'bun_maska', name: 'Bun-maska', price: 500, feed: 25 },
        { id: 'samosa', name: 'Samosa', price: 100, feed: 10 },
        { id: 'lukmi', name: 'Lukmi', sub: 'Old City special', price: 300, feed: 15, hidden: (c) => !(c.oldCity || c.id === 'irani_cafe_19') },
        { id: 'dil_pasand', name: 'Dil pasand', price: 300, feed: 15 },
        { id: 'cool_drink', name: 'Cool drink, at the counter', sub: 'glass bottle, no brand', price: 700, feed: 15 },
        { id: 'cool_drink_carry', name: 'Cool drink, take away', sub: '₹1 back for the bottle at any kirana', price: 800, feed: 15, give: { cool_drink_bottle: 1 } },
        { id: 'glucose_water', name: 'Glucose water', price: 100, feed: 40 },
        { id: 'osmania_packet', name: 'Osmania packet, take away', sub: '3 helpings for the road', price: 1000, give: { osmania_packet: 3 }, max: 2 },
        { id: 'haleem', name: 'Haleem plate', price: 2000, feed: 60, status: ['coma', 30], hidden: (c) => !c.oldCity, when: () => (haleemTime() ? null : 'Only in Ramzan, 17:30–01:00') },
        { id: 'biryani', name: 'Biryani plate', price: 2800, feed: 70, status: ['coma', 45], hidden: (c) => !/^(cafe_bahar|alpha_hotel)$/.test(c.id) },
        { id: 'family_room', name: 'Sit in the family room (10 s)', sub: 'aunties, curtains, nobody looks', price: 0, fx: [['meter', '−2']], hidden: () => wanted() <= 0,
          when: (c) => (!orderedHere(c.id) ? 'Order something first (₹4 or more)' : used('family:' + c.id) ? 'Once a day per café' : chaserNear(40) ? 'Not with a chaser at the door!' : null),
          act: (c) => progress(c, 'Family room', TUNE.familyRoomSecs, 'Behind the curtain: steel glasses, aunties, a ceiling fan. Nobody looks at you.', () => { use('family:' + c.id); const n = meterDown(wanted() >= 5 ? 1 : 2, 'family_room'); return n ? 'Chappal Meter −' + n + '. *Bach gaya!*' : 'Safe. For now.'; }) },
        { id: 'sit', name: 'Sit with one chai', sub: '▶▶ one hour per chai (max 3)', price: 400, max: 3, fx: [['time', '+1h each']], line: "Two hours you'll sit for one chai? ...Okay, for you, one hour.",
          act: (c, q) => { feed(20, { status: 'warm' }); closeShop(); ffwd(60 * q, { label: 'SITTING' }).then(() => { const p = N.player; if (p) p.energy = Math.min(100, p.tummy != null ? p.tummy : 100); toast(q + (q > 1 ? ' hours' : ' hour') + ' of chai, fan and gossip. Energy full.', 2600); }); return { close: true }; } },
        { id: 'jukebox', name: 'Jukebox', sub: 'one song from your cassettes', price: 100, act: () => jukebox() },
        { id: 'std', name: 'STD booth by the counter', sub: 'save · calls', price: 0, hidden: (c) => !c.def.std, act: (c) => { setView(stdView(c)); return { keep: true }; } },
      ],
    },
    /* ---------------------------------------------------------- kirana (§5.3) */
    kirana: {
      title: 'Kirana store', verb: 'Kirana', keeper: 'kirana', icon: 'jar', hours: [['07:00', '22:00']], quick: 'mango_bite', toffee: true,
      lines: ['No change. Take two toffees.', "Don't put your hand in the jar! Say how many.", 'Bottle back, or no deposit.', 'Mango Bite, fifty paise. For Chitti? Then two.'],
      rows: [
        { id: 'mango_bite', name: 'Mango Bite (toffee)', sub: 'eat it, or bribe Chitti', price: 50, give: { mango_bite: 1 }, cap: { mango_bite: 9 }, max: 9, house: true, line: 'Mango Bite, fifty paise. For Chitti? Then two.' },
        { id: 'fruit_sweets', name: 'Fruit sweets, a roll', price: 100, feed: 4 },
        { id: 'biscuits', name: 'Glucose biscuits, small pack', sub: 'carry · dogs love them', price: 200, give: { biscuits: 1 }, max: 3 },
        { id: 'cool_drink', name: 'Cool drink + bottle deposit', sub: '₹7 + ₹1, the ₹1 comes back', price: 800, feed: 15, give: { cool_drink_bottle: 1 } },
        { id: 'bottles', name: 'Return empty bottles', sub: '+₹1 each', price: 0, hidden: () => itemCount('cool_drink_bottle') <= 0, line: 'Bottle back, deposit back.',
          act: () => { const n = itemCount('cool_drink_bottle'); addItem('cool_drink_bottle', -n); earn(100 * n, 'bottles'); return '+' + rs(100 * n) + ' for ' + n + (n > 1 ? ' bottles' : ' bottle'); } },
        { id: 'candles', name: 'Candles, pack of 4', price: 500, give: { candles: 1 }, line: 'Light one for your Nanna. He works in the dark so we don\'t sit in it.' },
        { id: 'torch', name: 'Torch', sub: 'needs batteries', price: 2000, inv: 'torch', hidden: () => inv('torch') },
        { id: 'batteries', name: 'Batteries, a pair', sub: 'for the torch', price: 800, inv: 'batteries', hidden: () => inv('batteries') || !inv('torch') },
        { id: 'tennis_ball', name: 'Tennis ball', sub: 'owner of the ball bats first', price: 1000, inv: 'cricket_ball', hidden: () => inv('cricket_ball') },
        { id: 'turmeric', name: 'Turmeric packet', price: 300, give: { turmeric: 1 } },
        { id: 'khaata', name: 'Pay off the khaata', sub: 'credit with Agarwal-ji', price: 0, hidden: (c) => c.id !== 'kirana_1' || S.khaata <= 0, fx: [['bag', () => rs(S.khaata) + ' owed']],
          act: () => { const x = Math.min(S.khaata, N.player.money | 0); if (!x) return { msg: '*Paise kam hain.* Next time.' }; charge(x, { why: 'khaata' }); S.khaata -= x; return 'Khaata: ' + (S.khaata ? rs(S.khaata) + ' still owed.' : 'all clear! *Aaj nakad, kal udhaar.*'); } },
        { id: 'hide', name: 'Hide behind the rice sacks (8 s)', sub: 'Chappal Meter −1', price: 0, fx: [['meter', '−1']], hidden: () => wanted() < 1,
          when: (c) => (used('hide:' + c.id) ? 'Agarwal-ji: "Once a day, beta. My rice is not a hotel."' : null),
          act: (c) => hideAt(c, 'kirana') },
      ],
    },
    /* ---------------------------------------------------------- STD booth (§5.4) */
    std_booth: { title: 'STD / ISD / PCO', verb: 'Save / Call', keeper: 'std', icon: 'phone', hours: [['07:00', '23:00']], quick: 'save', lines: STD_LINES, rows: null /* stdRows() */ },
    /* ---------------------------------------------------------- barber (§5.5) */
    barber: {
      title: 'Hair cutting saloon', verb: 'Haircut ₹10', keeper: 'barber', icon: 'scissors', hours: [['08:00', '20:30']], closedDow: [2], closedWhy: 'Closed on Tuesdays', quick: 'haircut',
      lines: ['Haircut, ten rupees. Nobody will recognise you. Not even your Mummy.', 'Sit straight. Head down. Down, I said.', 'Army cut or film-hero cut? You get the one that fits.'],
      rows: [
        { id: 'haircut', name: 'Haircut', sub: 'clears the Chappal Meter · new hairstyle', price: 1000, house: true, fx: [['meter', 'clear']], line: 'Nobody will recognise you. Not even your Mummy.',
          when: () => (chaserNear(40) ? 'Not with a chaser at the door!' : null), act: (c) => haircut(c) },
        { id: 'champi', name: '*Champi* (head massage)', sub: 'energy +30', price: 500, fx: [['energy', '+30']],
          act: (c) => progress(c, '*Champi*', TUNE.champiSecs, 'Tap-tap-tap-tap. Coconut oil. Your eyes close by themselves.', () => { feed(0, { energy: 30 }); return 'Energy +30. *Ekdum fresh.*'; }) },
      ],
    },
    /* ---------------------------------------------------------- cycle hire (§5.6) */
    cycle_rent: { title: 'Cycle hire', verb: 'Cycle hire', keeper: 'cycle_man', icon: 'cycle', hours: [['07:00', '21:00']], quick: 'kid_cycle', lines: ['Three rupees an hour. Late means double.', 'Puncture? That\'s your problem now.', '*Poora din*, ten rupees.'], rows: null /* hireRows() */ },
    /* ---------------------------------------------------------- video parlour (§5.7) */
    video_parlour: {
      title: 'Video games parlour', verb: 'Brick game ₹1', keeper: 'parlour', icon: 'tv', hours: [['10:00', '21:00']], quick: 'brick_a',
      lines: ['One rupee, one game. Stand in line.', 'No banging the buttons!', 'Your Amma is outside? ...Back door is there.'],
      rows: [
        { id: 'brick_a', name: 'Brick game: Game A (bricks)', sub: 'win = free game (₹1 back)', price: 100, house: true, act: (c) => brickGame(c, 'blocks') },
        { id: 'brick_b', name: 'Brick game: Game B (race)', sub: 'win = free game (₹1 back)', price: 100, act: (c) => brickGame(c, 'race') },
        { id: 'scores', name: 'High-score board', sub: 'painted by the colony kids', price: 0, act: (c) => { setView(scoreView(c)); return { keep: true }; } },
        { id: 'tv_game', name: 'The TV-game corner', sub: 'a famiclone, one controller, ten kids', price: 0, act: () => ({ msg: 'Ten kids, one TV, one controller. You watch someone else\'s Mario die. Twice. It is still the best.' }) },
        { id: 'back_door', name: 'Back door', sub: 'out by the rear lane', price: 0, hidden: () => wanted() < 1, fx: [['meter', 'lose them']], when: (c) => (used('back:' + c.id) ? 'Once a day per parlour' : null), act: (c) => backDoor(c) },
      ],
    },
    /* ---------------------------------------------------------- bakeries (§5.8) */
    iyengar_bakery: {
      title: 'Iyengar bakery', verb: 'Bakery', keeper: 'bakery_lady', icon: 'bun', hours: [['07:00', '22:00']], quick: 'honey_cake',
      lines: ['Honey cake just out!', 'Egg puff or veg puff? Straight from the oven.', 'Cream roll in your pocket? It will melt!'],
      rows: [
        { id: 'honey_cake', name: 'Honey cake', price: 400, feed: 15, house: true, line: 'Honey cake just out! Look at that jam!' },
        { id: 'veg_puff', name: 'Veg puff', price: 400, feed: 20 },
        { id: 'egg_puff', name: 'Egg puff', price: 500, feed: 22 },
        { id: 'cream_roll', name: 'Cream roll', price: 300, feed: 12, line: 'Cream roll in your pocket? It will melt!' },
        { id: 'fruit_bread', name: 'Fruit bread, take away', sub: '2 helpings', price: 800, give: { fruit_bread: 2 } },
        { id: 'dil_pasand', name: 'Dil pasand', price: 300, feed: 15 },
        { id: 'plum_cake', name: 'Small plum cake', sub: 'carry · Christmas tables like these', price: 500, give: { plum_cake: 1 }, max: 4 },
      ],
    },
    karachi_bakery: {
      title: 'Karachi Bakery', verb: 'Bakery', keeper: 'bakery_man', icon: 'bun', hours: [['09:00', '22:00']], quick: 'fruit_biscuits',
      lines: ['Fruit biscuit, Osmania, dil khush, plum cake. For which relative?'],
      rows: [
        { id: 'fruit_biscuits', name: 'Fruit biscuits, ¼ kg', sub: 'carry · a gift for any errand', price: 2000, give: { fruit_biscuits: 1 }, house: true },
        { id: 'fruit_tin', name: 'Fruit biscuits, ½ kg tin', sub: 'a proper tin, with a lid', price: 4000, give: { fruit_biscuit_tin: 1 } },
        { id: 'osmania_qtr', name: 'Osmania biscuits, ¼ kg', sub: 'carry · 4 helpings', price: 1500, give: { osmania_packet: 4 } },
        { id: 'dil_khush', name: 'Dil khush', price: 300, feed: 15 },
        { id: 'plum_cake', name: 'Plum cake', price: 1500, feed: 30, hidden: () => !december(), sub: 'December only' },
      ],
    },
    subhan_bakery: {
      title: 'Subhan Bakery', verb: 'Bakery', keeper: 'bakery_man', icon: 'bun', hours: [['08:00', '21:00']], quick: 'osmania_tin',
      lines: ['Osmania by the tin, cheaper than anywhere.', 'Fresh batch at four. Come at four.'],
      rows: [
        { id: 'osmania_tin', name: 'Osmania biscuits, ¼ kg', sub: 'carry · 4 helpings, cheaper by the tin', price: 1200, give: { osmania_packet: 4 }, house: true },
        { id: 'fine_biscuits', name: 'Fine biscuits, ¼ kg', sub: 'carry · 4 helpings', price: 1000, give: { fine_biscuits: 4 } },
      ],
    },
    bakery: {
      title: 'Bakery', verb: 'Bakery', keeper: 'bakery_man', icon: 'bun', hours: [['08:00', '21:00']], quick: 'puff',
      lines: ['Bun, cake, puff. All fresh. Mostly.'],
      rows: [
        { id: 'bun', name: 'Bun', price: 200, feed: 12 },
        { id: 'cake_slice', name: 'Cake slice', price: 300, feed: 12 },
        { id: 'puff', name: 'Puff', price: 400, feed: 20, house: true },
      ],
    },
    /* ---------------------------------------------------------- carts (§5.9) */
    chai_bandi: {
      title: 'Chai bandi', verb: 'Chai ₹2', keeper: 'chai_man', icon: 'cart', hours: [['05:30', '22:00']], cart: true, quick: 'chai',
      lines: ['*Garam chai!* Two rupees.', 'Glass back, please. I have only twelve.'],
      rows: [
        { id: 'chai', name: 'Chai', price: 200, feed: 12, house: true },
        { id: 'bun', name: 'Bun', price: 200, feed: 12 },
        { id: 'glucose_biscuit', name: 'Glucose biscuit', price: 100, feed: 6 },
        { id: 'bhutta', name: '*Bhutta* (lemon-chilli corn)', price: 300, feed: 15, hidden: (c) => !/^chai_bandi_(6|8)$/.test(c.id), when: () => (mins() >= hm('16:00') && mins() < hm('21:00') ? null : 'Bhutta from 16:00 to 21:00'), line: 'Bhutta! *Garam garam* bhutta! Lemon-chilli!' },
      ],
    },
    samosa_bandi: {
      title: 'Samosa bandi', verb: 'Samosa ₹1', keeper: 'samosa_man', icon: 'cart', hours: [['16:00', '20:00']], cart: true, quick: 'samosa',
      lines: ['*Garam samose!* Small onion ones, five rupees a dozen!', "Don't come near the *kadai*, oil jumps."],
      rows: [
        { id: 'samosa', name: 'Samosa', price: 100, feed: 10, house: true },
        { id: 'mirchi', name: 'Mirchi bajji', price: 100, feed: 8 },
        { id: 'samosa_dozen', name: 'Dozen small onion samosas', sub: 'carry · 3 helpings', price: 500, give: { samosa_dozen: 3 } },
      ],
    },
    dosa_bandi: {
      title: 'Dosa bandi', verb: 'Dosa ₹6', keeper: 'dosa_man', icon: 'cart', hours: [['06:30', '11:00']], cart: true, quick: 'dosa',
      lines: ['Idli, vada, dosa: *tondaraga cheppandi!*', '*Karam podi* with ghee? A bit spicy.', 'After ten, only idli. Dosa batter is finished.'],
      rows: [
        { id: 'dosa', name: 'Plain dosa', price: 600, feed: 25, house: true, when: () => batter() },
        { id: 'idli', name: 'Idli (two)', price: 300, feed: 15 },
        { id: 'vada', name: 'Vada', price: 200, feed: 10, when: () => batter() },
        { id: 'podi_dosa', name: '*Karam podi* ghee dosa', price: 800, feed: 30, when: () => batter(), line: '*Karam podi* with ghee? A bit spicy.' },
        { id: 'pesarattu', name: '*Pesarattu*', price: 700, feed: 28, when: () => batter() },
      ],
    },
    coconut_cart: {
      title: 'Coconut cart', verb: 'Coconut ₹6', keeper: 'coconut_man', icon: 'cart', hours: [['09:00', '19:00']], cart: true, quick: 'coconut',
      lines: ['*Kobbari bondam!* Water is sweet!', 'Watery one or one with *malai*?', 'I made you a spoon from the husk.'],
      rows: [
        { id: 'coconut', name: 'Tender coconut', price: 600, feed: 20, status: 'cool', house: true },
        { id: 'malai', name: 'Tender coconut with *malai*', price: 700, feed: 25, status: 'cool', line: 'I made you a spoon from the husk.' },
      ],
    },
    banana_cart: {
      title: 'Banana cart', verb: 'Banana ₹1', keeper: 'banana_man', icon: 'cart', hours: [['07:00', '20:00']], cart: true, quick: 'banana',
      lines: ['*Arati pandlu! Chakkarakeli!*', 'One *kosaru* for the little one.', 'Peel in the bin, not on the road. Somebody will slip.'],
      rows: [
        { id: 'banana', name: 'One banana', sub: 'keeps the peel for 60 s', price: 100, feed: 8, house: true, act: () => { addItem('banana_peel', 1); setTimeout(() => { if (itemCount('banana_peel') > 0) addItem('banana_peel', -1); }, 60000); return 'Peel in hand. In the bin, not on the road!'; } },
        { id: 'dozen', name: 'A dozen bananas', sub: 'for errands · bargain it down', price: 1200, give: { banana_dozen: 1 }, line: 'One *kosaru* for the little one.', act: () => { feed(8); return 'One extra banana, *kosaru*, eaten on the spot.'; } },
        { id: 'haggle', name: '*Mol-bhaav*: a dozen, haggled', sub: 'start ₹15-18 · target ₹10', price: 0, act: (c) => haggle(c, 'banana', { what: 'one dozen bananas' }, (r) => { addItem('banana_dozen', 1); return r; }) },
      ],
    },
    flower_cart: {
      title: 'Flower cart', verb: 'Jasmine ₹2', keeper: 'flower_aunty', icon: 'cart', hours: [['06:00', '20:00']], cart: true, quick: 'jasmine',
      lines: ['*Mallepoolu!* Two rupees a *moora*!', "For your Amma's braid? Jasmine. Always jasmine.", 'I sprinkle water; fresh till evening.'],
      rows: [
        { id: 'jasmine', name: 'Jasmine, one *moora*', sub: 'for Mummy (works on Mummy only)', price: 200, give: { jasmine: 1 }, cap: { jasmine: 3 }, max: 3, house: true, line: "For your Amma's braid? Jasmine. Always jasmine." },
        { id: 'garland', name: 'Marigold and rose garland', price: 800, give: { garland: 1 } },
        { id: 'big_garland', name: '*Mol-bhaav*: the big jasmine-marigold garland', sub: 'start ₹20-24 · target ₹12', price: 0, act: (c) => haggle(c, 'flower', { what: 'the big garland' }, (r) => { addItem('garland', 1); return r; }) },
        { id: 'neem', name: 'Neem bundle', price: 100, give: { neem: 1 } },
      ],
    },
    /* ---------------------------------------------------------- Gokul Chat (§5.10): pure joy */
    gokul_chat: {
      title: 'Gokul Chat', verb: 'Pani puri ₹5', keeper: 'gokul_man', icon: 'plate', hours: [['11:00', '22:30']], quick: 'pani_puri',
      lines: ['*Teekha ya meetha?* One extra, *phokat!*', 'Samosa-ragda, double chutney.'],
      rows: [
        { id: 'pani_puri', name: 'Pani puri (6)', price: 500, feed: 15, house: true, line: '*Teekha ya meetha?* One extra, *phokat!*' },
        { id: 'samosa_ragda', name: 'Samosa-ragda', sub: 'double chutney', price: 600, feed: 20 },
        { id: 'ragda_parcel', name: 'Samosa-ragda parcel', sub: 'carry · for someone special', price: 600, give: { samosa_ragda_parcel: 1 } },
        { id: 'bhel', name: 'Bhel puri', price: 500, feed: 15 },
        { id: 'dahi_puri', name: 'Dahi puri', price: 600, feed: 18 },
        { id: 'kulfi', name: 'Kulfi', price: 500, feed: 15 },
        { id: 'challenge', name: 'Pani-puri challenge', sub: () => (S.gokulBest ? 'your record: ' + S.gokulBest + ' puris' : 'win = a free plate'), price: 500, act: (c) => panipuri(c) },
      ],
    },
    ice_cream: {
      title: 'Famous Ice Cream', verb: 'Scoop ₹8', keeper: 'ice_man', icon: 'plate', hours: [['11:00', '23:00']], quick: 'scoop',
      lines: ['One scoop or two? One. You are eleven.', 'Sitaphal season! Seeds removed by hand.'],
      rows: [
        { id: 'scoop', name: () => iceFlavour() + ' ice cream, a scoop', sub: 'Chappal Meter −1 (once in 10 min)', price: 800, feed: 20, house: true, fx: [['meter', '−1']],
          act: () => { if (wanted() > 0 && !used('ice:' + Math.floor(absMin() / 10))) { use('ice:' + Math.floor(absMin() / 10)); const n = meterDown(1, 'ice_cream'); if (n) return 'Brain-freeze. Chappal Meter −1.'; } return null; } },
      ],
    },
    biryani: {
      title: 'Biryani house', verb: 'Biryani ₹30', keeper: 'paradise_man', icon: 'plate', hours: [['11:00', '23:00']], quick: 'biryani',
      lines: ['Family pack? Fifteen minutes. The smell is free.'],
      rows: [
        { id: 'biryani', name: 'Biryani plate', price: 3000, feed: 70, status: ['coma', 45], house: true },
        { id: 'family_pack', name: 'Family pack (parcel)', sub: 'carry · the smell is free', price: 4000, give: { biryani_parcel: 1 }, line: 'Family pack? Fifteen minutes. The smell is free.' },
      ],
    },
    biryani2: {
      title: 'Hotel', verb: 'Biryani ₹28', keeper: 'waiter', icon: 'plate', hours: [['11:00', '23:00']], quick: 'biryani',
      lines: ['One plate biryani, one *mirchi ka salan*, coming!'],
      rows: [
        { id: 'biryani', name: 'Biryani plate', price: 2800, feed: 70, status: ['coma', 45], house: true },
        { id: 'chai', name: 'Irani chai', price: 400, feed: 20, status: 'warm' },
        { id: 'haleem', name: 'Haleem plate', price: 2000, feed: 60, status: ['coma', 30], hidden: (c) => c.id !== 'shah_ghouse', when: () => (haleemTime() ? null : 'Only in Ramzan, 17:30–01:00') },
      ],
    },
    haleem_house: {
      title: 'Haleem house', verb: 'Haleem', keeper: 'waiter', icon: 'plate', hours: [['11:00', '23:00']], quick: 'haleem', ramzanHours: true,
      lines: ['Haleem has started, *miyan!* The bhatti is lit.', 'Stand in the line. The haleem is worth it.'],
      rows: [
        { id: 'haleem', name: 'Haleem plate', price: 2000, feed: 60, status: ['coma', 30], house: true, when: () => (haleemTime() ? null : 'Only in Ramzan, 17:30–01:00') },
        { id: 'chai', name: 'Irani chai', price: 400, feed: 20, status: 'warm' },
        { id: 'osmania', name: 'Osmania biscuits, plate of 4', price: 400, feed: 20 },
      ],
    },
    nayaab: {
      title: 'Hotel Nayaab', verb: 'Nihari', keeper: 'waiter', icon: 'plate', hours: [['05:00', '23:00']], quick: 'nihari', ramzanHours: true,
      lines: ['Nihari only in the morning. After eight, come tomorrow.'],
      rows: [
        { id: 'nihari', name: 'Nihari with bread', price: 1500, feed: 50, house: true, when: () => (mins() < hm('08:00') ? null : 'Nihari only 05:00–08:00') },
        { id: 'chai', name: 'Irani chai', price: 400, feed: 20, status: 'warm' },
        { id: 'haleem', name: 'Haleem plate', price: 2000, feed: 60, status: ['coma', 30], when: () => (haleemTime() ? null : 'Only in Ramzan, 17:30–01:00') },
      ],
    },
    tiffin: {
      title: 'Veg tiffin hotel', verb: 'Tiffin', keeper: 'waiter', icon: 'plate', hours: [['06:30', '21:30']], quick: 'dosa',
      lines: ['Idli, dosa, filter coffee. Sit, sit.'],
      rows: [
        { id: 'idli', name: 'Idli (two)', price: 300, feed: 15 },
        { id: 'dosa', name: 'Plain dosa', price: 600, feed: 25, house: true },
        { id: 'masala_dosa', name: 'Masala dosa', price: 800, feed: 30 },
        { id: 'coffee', name: 'Filter coffee', price: 400, feed: 15, status: 'warm' },
      ],
    },
    /* ---------------------------------------------------------- Rythu Bazaar (§5.13) */
    rythu: {
      title: 'Rythu Bazaar', verb: 'Vegetables', keeper: 'farmer', icon: 'market', hours: [['06:00', '13:00']], big: true, quick: 'tomato',
      lines: ['*Tamata kilo aaru!*', '*Kosaru kaavala, babu?*', 'Straight from my field, no middleman.'],
      rows: [
        { id: 'tomato', name: 'Tomatoes, 1 kg', sub: 'bruise easily: carry gently', price: 600, give: { veg_tomato: 1 }, house: true, line: '*Tamata kilo aaru!*' },
        { id: 'onion', name: 'Onions, 1 kg', price: 800, give: { veg_onion: 1 } },
        { id: 'potato', name: 'Potatoes, 1 kg', price: 700, give: { veg_potato: 1 } },
        { id: 'brinjal', name: 'Brinjal, 1 kg', price: 600, give: { veg_brinjal: 1 } },
        { id: 'cucumber', name: 'Cucumber', price: 100, feed: 8 },
        { id: 'guava', name: 'Guava', price: 200, feed: 10 },
        { id: 'mango', name: 'Mango', price: 500, feed: 20, when: () => (inMD('05-01', '06-30') ? null : 'Mangoes only in May and June') },
        { id: 'haggle', name: '*Mol-bhaav*: a bag of vegetables', sub: 'list ₹36 · bargain who: farmer', price: 0, act: (c) => haggle(c, 'farmer', { list: 36, what: 'a bag of vegetables' }, (r) => { addItem('veg_bag', 1); return r; }) },
      ],
    },
    /* ---------------------------------------------------------- everyday services (§5.14) */
    pindi_girni: {
      title: 'Pindi girni (flour mill)', verb: 'Girni', keeper: 'ramulu', icon: 'gear', hours: [['08:00', '19:00']], quick: 'atta',
      lines: ['*Dabba* in the line, number coming.', 'Keep away from the belt, *baba*. The machine is hungry.', "My hair isn't white. It's *atta*."],
      rows: [
        { id: 'grind', name: 'Grind wheat, 1 kg', sub: 'bring the dabba back for Amma', price: 200, give: { atta_ground: 1 }, max: 5 },
        { id: 'atta', name: 'Fresh atta, 1 kg', price: 1000, give: { atta: 1 }, house: true },
        { id: 'chilli', name: 'Chilli day', sub: 'Tuesdays: stand back!', price: 0, hidden: () => dow() !== 2, act: () => ({ msg: '*Aaachhoo!* "Chilli day today. Stand back, you\'ll sneeze."' }) },
        { id: 'job', name: 'Odd job: dabba deliveries', sub: () => jobSub('job_girni_dabbas'), price: 0, hidden: () => !jobRow('job_girni_dabbas'), when: () => jobWhy('job_girni_dabbas'), act: () => startJob('job_girni_dabbas') },
      ],
    },
    stationery: {
      title: 'Stationery', verb: 'Stationery', keeper: 'stationery_man', icon: 'pencil', hours: [['08:00', '20:30']], quick: 'city_map',
      lines: ['Long notebook or short? Ruled or plain?', 'Brown cover, how many sheets?', 'Compass broken? Sold separately.', 'Xerox one rupee a page. Current gone? Come tomorrow.'],
      rows: [
        { id: 'city_map', name: '"Guide Map of Twin Cities"', sub: 'every shop and service on your map, with hours', price: 1000, inv: 'city_map', house: true, hidden: () => inv('city_map'), act: () => cityMap() },
        { id: 'notebook', name: 'Long notebook', price: 1000, give: { notebook: 1 } },
        { id: 'pencil', name: 'Pencil', price: 100, give: { pencil: 1 } },
        { id: 'eraser', name: 'Eraser', price: 50, give: { eraser: 1 } },
        { id: 'sharpener', name: 'Sharpener', price: 100, give: { sharpener: 1 } },
        { id: 'brown_cover', name: 'Brown cover paper, 10 sheets', price: 1000, give: { brown_cover: 1 } },
        { id: 'labels', name: 'Name labels', price: 200, give: { labels: 1 } },
        { id: 'geometry', name: 'Geometry box', price: 3000, give: { geometry_box: 1 } },
        { id: 'sketch_pens', name: 'Sketch pens (12)', price: 1500, give: { sketch_pens: 1 } },
        { id: 'slam_book', name: 'Slam book', sub: '"My favourite hero: ____"', price: 2500, give: { slam_book: 1 } },
        { id: 'xerox', name: 'Xerox, a page', price: 100, max: 5, act: () => (Math.random() < 0.2 ? { msg: 'Current gone. *Come tomorrow.* (He gives your rupee back.)', refund: true } : 'Warm paper, smells of toner.') },
        { id: 'poster_colours', name: 'Poster colours', sub: 'for cut-out painters', price: 500, give: { poster_colours: 1 } },
      ],
    },
    medical_shop: {
      title: 'Medical shop', verb: 'Medical', keeper: 'chemist', icon: 'cross', hours: [['08:00', '22:30']], quick: 'plaster',
      lines: ["Doctor's *chitti* first.", 'Hajmola, one rupee. Not the whole packet!', 'Take a plaster. Cricket knee?'],
      rows: [
        { id: 'plaster', name: 'Plaster', sub: 'cures a scraped knee', price: 100, house: true, line: 'Take a plaster. Cricket knee?', act: () => (clearStatus('knee') ? 'Knee fixed. Run free.' : 'One plaster, for later.') },
        { id: 'digestive', name: 'Digestive candy (5)', price: 100, feed: 2, line: 'Hajmola, one rupee. Not the whole packet!' },
        { id: 'glucose', name: 'Glucose powder', sub: 'carry · 3 spoons', price: 1000, give: { glucose: 3 } },
        { id: 'balm', name: 'Balm', sub: 'for Ammamma\'s knees', price: 500, give: { balm: 1 } },
      ],
    },
    photo_studio: {
      title: 'Photo studio', verb: 'Photo studio', keeper: 'photo_uncle', icon: 'camera', hours: [['09:30', '20:30']], quick: 'develop',
      lines: ['Sit straight, chin up, *thoda left*... smile please!', 'Ready day after tomorrow.', "Don't open the darkroom door! The photos will burn!"],
      rows: [
        { id: 'develop', name: 'Develop your frames', sub: () => { const n = undeveloped().length; return n ? n + ' frame' + (n > 1 ? 's' : '') + ' on the roll · ₹2 each' : 'nothing on the roll yet'; }, price: () => 200 * Math.max(1, undeveloped().length), house: true,
          when: () => (undeveloped().length ? null : 'No frames to develop'), act: () => develop() },
        { id: 'passport', name: 'Passport photo', sub: 'four copies, white background', price: 1500, give: { passport_photo: 1 } },
        { id: 'portrait', name: 'Studio portrait', sub: 'painted backdrop: Kashmir lake, Taj, Charminar', price: 1000, act: (c) => { setView(backdropView(c)); return { keep: true, refund: true }; } },
      ],
    },
    internet_cafe: {
      title: 'Internet café', verb: 'Internet ₹20/hr', keeper: 'net_uncle', icon: 'at', hours: [['10:00', '22:00']], quick: 'hour',
      lines: ['Twenty rupees an hour. Timer is on.', 'No chat rooms. Emails, yes.', '*Kirrr-kshhh*... that\'s the modem. It\'s thinking.'],
      closed: () => (netOpen() ? null : 'Server down, *beta*. Come back after the rains.'),
      rows: [
        { id: 'quarter', name: '15 minutes: browse', sub: 'a page about a place you have seen', price: 500, act: (c) => netSession(c, 15) },
        { id: 'hour', name: '1 hour: emails + browse', sub: 'read your emails · search the city guide', price: 2000, house: true, act: (c) => netSession(c, 60) },
      ],
    },
    chappal_bazar: {
      title: 'Chappal Bazar', verb: 'Chappals', keeper: 'chappal_man', icon: 'shop', hours: [['09:00', '21:00']], quick: 'kotha',
      lines: ['Hawai or ladies? Size? Show your foot.', 'For Mummy? Then the best one. Mummies know.'],
      rows: [
        { id: 'hawai', name: 'Hawai chappals, a pair', sub: 'cures a limp', price: 1500, act: () => { clearStatus('limp'); giveInv('hawai_chappals'); return 'New chappals! Walking properly again.'; } },
        { id: 'kotha', name: "Ladies' *kotha chappal* for Mummy", sub: 'clears a full Chappal Meter (one use)', price: 2500, give: { kotha_chappal: 1 }, cap: { kotha_chappal: 1 }, house: true, line: 'For Mummy? Then the best one. Mummies know.' },
      ],
    },
    kite_stall: {
      title: 'Kite stall', verb: 'Kites', keeper: 'kite_chacha', icon: 'kite', hours: [['08:00', '20:00']], quick: 'charkhi',
      lines: ['*Saddi mazboot.* Won\'t snap in a *pech.*', 'Cotton only. Glass manja cuts fingers and birds.'],
      rows: [
        { id: 'tukkal', name: 'Tukkal', sub: '+1 kite-fight life (max 5)', price: 200, give: { kite: 1 }, cap: { kite: 5 } },
        { id: 'patang', name: 'Patang', sub: '+1 kite-fight life (max 5)', price: 300, give: { kite: 1 }, cap: { kite: 5 } },
        { id: 'big_kite', name: 'Big kite', sub: '+1 kite-fight life (max 5)', price: 500, give: { kite: 1 }, cap: { kite: 5 } },
        { id: 'charkhi', name: 'Charkhi of cotton *saddi*', sub: 'a stronger kite fight', price: 1000, inv: 'charkhi', house: true, hidden: () => inv('charkhi'), line: 'Cotton only. Glass manja cuts fingers and birds.' },
        { id: 'sell', name: 'Sell your *lootna* kites', sub: () => itemCount('lootna_kite') + ' in hand · +₹1 each', price: 0, hidden: () => itemCount('lootna_kite') <= 0,
          act: () => { const n = itemCount('lootna_kite'); addItem('lootna_kite', -n); earn(100 * n, 'lootna'); return '+' + rs(100 * n) + '. "Good kites. Who cut them?"'; } },
      ],
    },
    recording_centre: {
      title: 'Raag Recording Centre', verb: 'Recording', keeper: 'recording_man', icon: 'tv', hours: [['10:00', '23:00']], quick: 'copy',
      lines: ['Copy, both sides, Dolby? Dolby is extra. We don\'t have Dolby.', 'Blank cassettes, sixty minutes, ninety minutes.'],
      rows: [
        { id: 'copy', name: 'Copy a cassette', sub: 'both sides, ready while you wait', price: 3000, give: { cassette_copy: 1 }, house: true },
        { id: 'blank', name: 'Blank cassette, 60 min', price: 1500, give: { blank_cassette: 1 } },
      ],
    },
    meat_shop: {
      title: 'Chicken & mutton shop', verb: 'Sunday queue', keeper: 'meat_man', icon: 'shop', hours: [['07:00', '12:00']], openDow: [0], closedWhy: 'Sundays only, 07:00–12:00',
      lines: ['Sunday queue is long. Come at seven.', "Don't touch the cage, the hen gets cross.", 'Wait outside, I\'ll bring it.'],
      rows: [
        { id: 'queue', name: 'The Sunday queue', sub: 'uncles discuss the score; you hold the place', price: 0, act: () => ({ msg: 'You stand outside with the uncles. "Wait outside, I\'ll bring it." (Only grown-ups buy here.)' }) },
      ],
    },
    book_bazaar: {
      title: 'Pavement book bazaar', verb: 'Old books', keeper: 'book_man', icon: 'book', hours: [['10:00', '20:00']], quick: 'comic',
      lines: ['Seventh class, full set, half price. Guide also? Guide is extra, but guide has the answers.'],
      rows: [
        { id: 'comic', name: 'Old comic', sub: 'a page of trivia', price: 200, act: (c) => trivia(c, 'comic') },
        { id: 'books', name: '*Mol-bhaav*: class VII textbook set', sub: 'start ₹90 · target ₹60', price: 0, act: (c) => haggle(c, 'books', { what: 'the class VII set' }, (r) => { giveInv('class7_books'); return r; }) },
      ],
    },
    tv_window: {
      title: 'TV & radio shop window', verb: 'Watch TV', keeper: 'crowd', icon: 'tv', hours: [['09:00', '22:00']], big: true,
      lines: ['Score? *Score kitta hua?*', 'Move, move, I can\'t see!'],
      rows: [{ id: 'watch', name: 'Watch the window TV', sub: 'with the crowd on the footpath', price: 0, act: () => ({ msg: tvLine() }) }],
    },
    school_gate: {
      title: 'School gate carts', verb: 'Gate carts', keeper: 'gola_man', icon: 'cart', hours: [['11:00', '19:00']], cart: true, quick: 'pani_puri',
      present: () => gateCarts(),
      lines: ['Pani puri, three rupees! After school only.', 'Gola! Rose or kala khatta?'],
      rows: [
        { id: 'pani_puri', name: 'Small plate pani puri', price: 300, feed: 12, house: true, when: () => (schoolDay() && mins() >= hm('15:30') ? null : 'After school, 15:30–19:00') },
        { id: 'gola', name: 'Ice gola', sub: 'your tongue turns colours', price: 100, feed: 8, status: 'cool', when: () => (summer() && mins() < hm('18:00') ? null : 'Summer only, 11:00–18:00'), act: () => { status('gola'); return null; } },
        { id: 'kulfi', name: 'Kulfi', price: 500, feed: 15, when: () => (summer() && mins() < hm('18:00') ? null : 'Summer only, 11:00–18:00') },
      ],
    },
    /* ---------------------------------------------------------- places of worship: free food only (§2.2, §5.17) */
    prasadam: { title: 'Temple gate', verb: 'Prasadam', direct: true, hours: [['06:00', '12:00'], ['17:00', '20:30']] },
    langar: { title: 'Gurudwara', verb: 'Langar', direct: true, hours: [['12:00', '15:00'], ['19:00', '21:00']] },
    /* ---------------------------------------------------------- cinemas and shows (§5.15) */
    cinema: {
      title: 'Cinema hall', verb: 'Tickets', keeper: 'ticket_man', icon: 'film', big: true, quick: 'floor',
      hoursFor: () => (dow() === 5 ? [['05:30', '21:30']] : [['10:00', '21:30']]),
      lines: ['Floor ten rupees, balcony twenty-five. No pushing!', 'Line mein! Line mein!', 'HOUSEFULL board is ready, just in case.'],
      rows: [
        { id: 'floor', name: 'Floor ticket', sub: (c) => filmSub(c), price: 1000, house: true, fx: [['time', '+3h'], ['meter', '−2']], when: (c) => showWhy(c), act: (c) => watchFilm(c, 'floor') },
        { id: 'balcony', name: 'Balcony ticket', sub: 'the good seats, a fan above', price: 2500, fx: [['time', '+3h'], ['meter', '−2']], when: (c) => showWhy(c), act: (c) => watchFilm(c, 'balcony') },
        { id: 'popcorn', name: 'Canteen: popcorn', price: 500, feed: 12 },
        { id: 'samosa', name: 'Canteen: samosa', price: 200, feed: 10 },
        { id: 'cool_drink', name: 'Canteen: cool drink', price: 700, feed: 15 },
        { id: 'black', name: 'The man by the gate', sub: '"Ticket? Ticket?"', price: 0, hidden: (c) => c.id !== 'odeon_theatre', act: () => ({ msg: '"Black ticket? ...For you, no. Go to the counter like a good boy." (Black tickets are never for sale.)' }) },
      ],
    },
    prasads: {
      title: 'Prasads', verb: 'Giant screen', keeper: 'ticket_man', icon: 'film', big: true, hours: [['10:00', '23:00']], quick: 'show',
      closed: () => (prasadsOpen() ? null : 'COMING SOON — THE GIANT SCREEN · opens Friday 25 July'), fence: true,
      lines: ['The screen is so big it has no edges.', 'Shoes clean? This is Prasads.'],
      rows: [
        { id: 'show', name: () => 'Giant-screen show: *' + docToday().t + '*', sub: '+1 hour · energy +20', price: TUNE.prasads, house: true, fx: [['time', '+1h']], act: (c) => watchDoc(c) },
        { id: 'lobby', name: 'Stand in the lobby AC (10 s)', sub: 'cool · Chappal Meter −1 (once a day)', price: 0, fx: [['meter', '−1']], when: () => (used('lobby') ? 'Once a day' : null),
          act: (c) => progress(c, 'Lobby AC', TUNE.lobbySecs, 'Cold air. A marble floor. Everybody whispers, like it is a temple of cinema.', () => { use('lobby'); status('cool', { gm: 5 }); const n = meterDown(1, 'prasads'); return n ? 'Cool! Chappal Meter −1.' : 'Cool! *Ahh.*'; }) },
        { id: 'window', name: 'Look out of the lobby window', sub: 'a viewpoint over the lake', price: 0, act: (c) => { closeShop(); viewpoint('prasads_imax', c.place.x, c.place.y); return { close: true }; } },
        { id: 'popcorn', name: 'Food counter: popcorn', price: 1000, feed: 12 },
        { id: 'cold_coffee', name: 'Food counter: cold coffee', price: 1500, feed: 15, status: 'cool' },
      ],
    },
    ntr_gardens: {
      title: 'NTR Gardens', verb: 'NTR Gardens', keeper: 'ticket_man', icon: 'tree', big: true, quick: 'train',
      hoursFor: () => (dow() === 0 || dow() === 6 ? [['10:00', '21:00']] : [['15:00', '21:00']]),
      lines: ['Mini train every half hour. Hands inside!', 'The Machan tree is concrete. Don\'t tell anyone.'],
      rows: [
        { id: 'entry', name: 'Entry ticket', price: 500, hidden: () => used('entry:ntr_gardens'), act: () => { use('entry:ntr_gardens'); return 'Entry stamp on your hand. Good for today.'; } },
        { id: 'train', name: 'Mini train ride', sub: 'round the gardens · a viewpoint', price: 500, house: true, when: () => entryWhy('ntr_gardens'), act: (c) => { closeShop(); trainRide(c.id, { secs: TUNE.trainSecs, viewpoint: true }); return { close: true }; } },
        { id: 'machan', name: 'Climb the Machan tree', sub: 'a viewpoint (once a day)', price: 0, when: () => entryWhy('ntr_gardens') || (used('vp:machan') ? 'Once a day' : null), act: (c) => { use('vp:machan'); closeShop(); viewpoint('ntr_machan', c.place.x, c.place.y); return { close: true }; } },
        { id: 'corn', name: 'Snack kiosk: corn', price: 300, feed: 15 },
        { id: 'ice_cream', name: 'Snack kiosk: ice cream', price: 800, feed: 20 },
      ],
    },
    lumbini_park: {
      title: 'Lumbini Park', verb: 'Lumbini Park', keeper: 'ticket_man', icon: 'tree', big: true, hours: [['09:00', '21:00']], quick: 'fountain',
      lines: ['Fountain at seven and eight. Sit on the steps.', 'Balloon? Two rupees. Don\'t let it go over the lake.'],
      rows: [
        { id: 'entry', name: 'Entry ticket', price: 200, hidden: () => used('entry:lumbini_park'), act: () => { use('entry:lumbini_park'); return 'In you go.'; } },
        { id: 'fountain', name: 'Watch the musical fountain', sub: () => 'next show ' + nextOf(['19:00', '20:00']) + ' · energy fills', price: 0, house: true, when: () => entryWhy('lumbini_park') || (nextOf(['19:00', '20:00']) ? null : 'Shows at 19:00 and 20:00'),
          act: (c) => showCard(c, { poster: { t: 'The Musical Fountain', s: 'Water dances in pink and green to a tune you almost know.', c: ['#1e3a6a', '#ff5fb0'], cert: 'U' }, at: nextOf(['19:00', '20:00']), minutes: 2, sfx: 'fountain', after: () => { feed(0, { energy: 40 }); return 'Two minutes of coloured water. Energy up.'; } }) },
        { id: 'balloon', name: 'Balloon', price: 200, act: () => { status('balloon'); return 'A red balloon on a string. Don\'t let go!'; } },
        { id: 'ice_cream', name: 'Ice cream', price: 800, feed: 20 },
      ],
    },
    zoo: {
      title: 'Nehru Zoological Park', verb: 'Zoo', keeper: 'ticket_man', icon: 'tree', big: true, hours: [['08:30', '17:00']], closedDow: [1], closedWhy: 'Closed on Mondays', quick: 'entry',
      lines: ['Don\'t feed the animals. Don\'t feed the uncles either.'],
      rows: [
        { id: 'entry', name: 'Entry ticket', price: 500, house: true, hidden: () => used('entry:nehru_zoo'), act: () => { use('entry:nehru_zoo'); return 'The lions are asleep. As usual.'; } },
        { id: 'safari', name: 'Safari bus ride', sub: 'caged windows · +30 min', price: 1000, when: () => entryWhy('nehru_zoo'), act: (c) => showCard(c, { poster: { t: 'Lion Safari', s: 'Behind the bus wire: a lion yawns. A bear waves. Everybody screams anyway.', c: ['#3a6a3a', '#e8c060'], cert: 'U' }, minutes: 30 }) },
        { id: 'train', name: 'Toy train', price: 300, when: () => entryWhy('nehru_zoo'), act: (c) => { closeShop(); trainRide(c.id, { secs: 30 }); return { close: true }; } },
      ],
    },
    museum: {
      title: 'Museum', verb: 'Museum', keeper: 'guard', icon: 'museum', big: true, hours: [['10:00', '17:00']], closedDow: [5], closedWhy: 'Closed on Fridays', quick: 'entry',
      lines: ['Running in the museum? *Nakko.* Walk fast, but walk.', 'No touching the glass.'],
      rows: [
        { id: 'entry', name: 'Entry ticket', sub: 'walk only inside', price: (c) => (c.id === 'state_museum' ? 200 : 500), house: true, hidden: (c) => used('entry:' + c.id), act: (c) => { use('entry:' + c.id); return museumLine(c.id); } },
        { id: 'clock', name: 'Wait for the musical clock', sub: () => '▶▶ to ' + fmtHM(Math.ceil((mins() + 1) / 60) * 60), price: 0, hidden: (c) => c.id !== 'salar_jung_museum', when: (c) => entryWhy(c.id) || (mins() >= hm('16:30') ? 'The last strike is at 17:00. Come earlier.' : null), act: (c) => musicalClock(c) },
      ],
    },
    planetarium: {
      title: 'Birla Planetarium', verb: 'Sky show', keeper: 'ticket_man', icon: 'museum', big: true, hours: [['10:00', '18:30']], quick: 'show',
      lines: ['Show starts on time. The stars don\'t wait.'],
      rows: [
        { id: 'show', name: 'Sky show', sub: () => (nextOf(['11:30', '16:00', '18:00']) ? 'next show ' + nextOf(['11:30', '16:00', '18:00']) + ' · +30 min' : 'shows at 11:30, 16:00, 18:00'), price: 1000, house: true, when: () => (nextOf(['11:30', '16:00', '18:00']) ? null : 'No more shows today'),
          act: (c) => showCard(c, { poster: { t: 'Stars over the Deccan', s: 'The dome goes dark. Saturn turns. A whole hall of children says "Ooooh" together.', c: ['#0a0a2a', '#a8c0ff'], cert: 'U' }, at: nextOf(['11:30', '16:00', '18:00']), minutes: 30 }) },
      ],
    },
    golconda: {
      title: 'Golconda Fort', verb: 'Fort tickets', keeper: 'guide', icon: 'monument', big: true, hours: [['09:00', '17:30']], quick: 'entry',
      lines: ['Clap under the dome, and they hear it at the top. Try. Everybody tries.', 'Guide? Fifty rupees. For you, a story for free.'],
      rows: [
        { id: 'entry', name: 'Entry ticket', price: 500, house: true, hidden: () => used('entry:golconda_fort'), act: () => { use('entry:golconda_fort'); giveInv('golconda_ticket'); return 'A paper ticket with a little stamp of the fort.'; } },
        { id: 'guide', name: "The guide's story", sub: 'free, if you listen', price: 0, act: () => ({ msg: '"Clap at the Fateh Darwaza and the king at the top of Bala Hissar hears you. That is how they rang the doorbell, four hundred years ago." He waits for you to clap.' }) },
      ],
    },
    sound_light: {
      title: 'Sound and light show', verb: 'Show ₹10', keeper: 'ticket_man', icon: 'monument', big: true, hours: [['17:30', '19:00']], quick: 'show',
      lines: ['Show at six-thirty. Sit on the lawn.'],
      rows: [
        { id: 'show', name: 'Sound and light show', sub: '18:30 · one hour on the lawn', price: 1000, house: true, when: () => (mins() <= hm('18:40') ? null : 'Tonight\'s show has started'),
          act: (c) => showCard(c, { poster: { t: 'The Fort Speaks', s: 'Coloured lights on old walls, a deep voice, bats overhead. The fort tells its own story.', c: ['#2a1a3a', '#e8a040'], cert: 'U' }, at: '18:30', minutes: 60 }) },
      ],
    },
    tombs: {
      title: 'Qutb Shahi Tombs', verb: 'Tombs', keeper: 'guard', icon: 'monument', big: true, hours: [['09:30', '17:30']], quick: 'entry',
      lines: ['Walk slowly here, *beta*. Kings are sleeping.'],
      rows: [{ id: 'entry', name: 'Entry ticket', sub: 'walk only · quiet please', price: 200, house: true, hidden: () => used('entry:qutb_shahi_tombs'), act: () => { use('entry:qutb_shahi_tombs'); return 'Domes in rows, pigeons, a cool breeze. Everybody whispers.'; } }],
    },
    numaish: {
      title: 'Numaish', verb: 'Numaish', keeper: 'loudspeaker', icon: 'star', big: true, hours: [['16:00', '22:30']], quick: 'wheel',
      closed: () => (numaishOn() ? null : 'Numaish is from 1 January to 15 February'),
      lines: ['Delhi papad! Biggest papad in the world!', 'Attention please: a small boy is lost near the giant wheel. Answers to "Bunty".'],
      rows: [
        { id: 'entry', name: 'Entry ticket', price: 500, hidden: () => used('entry:numaish'), act: () => { use('entry:numaish'); return 'Lights, loudspeakers, a thousand stalls. Hold your money tight.'; } },
        { id: 'wheel', name: 'Giant wheel', sub: 'a viewpoint over the whole fair', price: 500, house: true, when: () => entryWhy('numaish'), act: (c) => { closeShop(); viewpoint('numaish_wheel', c.place.x, c.place.y, { sfx: 'giant_wheel' }); return { close: true }; } },
        { id: 'train', name: 'Toy train', price: 300, when: () => entryWhy('numaish'), act: (c) => { closeShop(); trainRide(c.id, { secs: 30, r: 0.3 }); return { close: true }; } },
        { id: 'well', name: '*Maut ka kuan* (watch)', sub: 'motorcycles on the walls of a wooden well', price: 500, when: () => entryWhy('numaish'), act: (c) => showCard(c, { poster: { t: 'Maut ka Kuan', s: 'Two motorcycles ride round and round the walls of a wooden well. The whole well shakes. So do you.', c: ['#5a2a1a', '#f2c230'], cert: 'U' }, minutes: 15, shake: true }) },
        { id: 'mirror', name: 'Mirror house', price: 300, when: () => entryWhy('numaish'), act: () => 'In one mirror you are seven feet tall. In the next, two feet. In the last, a balloon with chappals.' },
        { id: 'papad', name: 'Delhi papad', price: 1000, feed: 20, line: 'Delhi papad! Biggest papad in the world!' },
        { id: 'candy', name: 'Cotton candy', price: 300, feed: 8, status: 'sugar' },
        { id: 'goggles', name: 'Toy goggles', price: 500, act: () => { status('goggles'); return 'Cool goggles. Very cool. Too cool.'; } },
        { id: 'balloon', name: 'Balloon', price: 500, act: () => { status('balloon'); return 'A Numaish balloon, shaped like a parrot.'; } },
        { id: 'lost', name: 'Lost-and-found counter', price: 0, act: () => ({ msg: 'A tired uncle with a microphone and a box of single chappals. "Lost something? Say it into the mic."' }) },
      ],
    },
    boats: {
      title: 'Lumbini boat jetty', verb: 'Boats ₹10', keeper: 'boatman', icon: 'boat', hours: [['10:00', '19:30']], quick: 'boat',
      lines: ['Two hours on my watch, *beta*. My watch is fast.', 'Sit in the middle. The Buddha doesn\'t like splashing.'],
      rows: [
        { id: 'boat', name: 'Hire a boat', sub: 'round the Buddha · you steer', price: TUNE.boat, house: true, when: () => (boatsOpen() ? null : 'Boats after the immersion festival'), act: (c) => hireBoat(c) },
      ],
    },
    /* ---------------------------------------------------------- bus hubs, stations, stops (§3.6, §5.16) */
    bus_hub: {
      title: 'City bus station', verb: 'Bus routes', keeper: 'conductor', icon: 'bus', big: true, hours: [['05:00', '23:00']], quick: 'routes',
      lines: ['*Right, right!*', '*Footboard pe nakko!* Inside!'],
      rows: [
        { id: 'routes', name: 'Bus routes', sub: () => (busUnlocked() ? 'fast travel · ' + rs(TUNE.busPrice) + (inv('ticket_punch') ? ' (free with the punch)' : '') : 'ride with Ticket Thatha first'), price: 0, house: true, act: (c) => { setView(busView(c)); return { keep: true }; } },
        { id: 'thatha', name: "Ticket Thatha's bench", sub: () => ticketsFound() + ' of 12 tickets', price: 0, hidden: (c) => c.id !== 'koti_bus_stand', act: (c) => { setView(thathaView(c)); return { keep: true }; } },
        { id: 'enquiry', name: 'Long-distance enquiry window', price: 0, hidden: (c) => c.id !== 'imlibun_bus_station', act: () => ({ msg: pick(['"Kurnool? Bay 12."', '"Vijayawada, eleven-thirty. Bay 4. Next!"', '"Tirupati? Full. Tomorrow."']) }) },
        { id: 'ramoji', name: 'Day trip: Film City', sub: 'a whole day of fake streets · +10 h', price: 1000, hidden: (c) => !(N.flags && (N.flags.credits_seen || N.flags.post_game)) || !/^(imlibun_bus_station|koti_bus_stand)$/.test(c.id),
          act: (c) => showCard(c, { poster: { t: 'Film City', s: 'A whole day of fake streets: a Mumbai lane, a London bridge, a village made of plywood. You come home dusty and famous.', c: ['#3a2a5a', '#f2c230'], cert: 'U' }, minutes: 600, home: true }) },
        { id: 'chai', name: 'Platform chai', price: 200, feed: 12, hidden: (c) => c.id !== 'imlibun_bus_station' },
        { id: 'auto', name: 'Auto stand', sub: '"Kidhar jaana?"', price: 0, hidden: (c) => !/^(koti_bus_stand|imlibun_bus_station)$/.test(c.id), act: () => autoStand() },
      ],
    },
    station: {
      title: 'Railway station', verb: 'Station', keeper: 'gate_checker', icon: 'bus', big: true, hours: [['00:00', '24:00']], quick: 'platform',
      lines: ['Platform ticket, *beta*. Three rupees.', '*Coolie? Coolie?*'],
      rows: [
        { id: 'platform', name: 'Platform ticket', sub: () => 'the platform shortcut, all day', price: 300, house: true, hidden: (c) => platformTicket(c.id), act: (c) => { S.platform[c.id] = day(); return 'Punched. The platform is yours till midnight.'; } },
        { id: 'platform_ok', name: 'Platform ticket ✓', sub: 'good for today', price: 0, hidden: (c) => !platformTicket(c.id), when: () => 'Already bought today' },
        { id: 'weigh', name: 'Weighing machine', sub: 'weight + a printed fortune', price: 100, act: (c) => weigh(c) },
        { id: 'tinkle', name: 'Book stall: Tinkle', sub: 'a comic page of trivia', price: 800, act: (c) => trivia(c, 'tinkle') },
        { id: 'chandamama', name: 'Book stall: Chandamama', sub: 'a story page of trivia', price: 600, act: (c) => trivia(c, 'chandamama') },
        { id: 'tea', name: 'Railway tea', price: 200, feed: 12 },
        { id: 'auto', name: 'Auto stand', sub: '"Kidhar jaana?"', price: 0, act: () => autoStand() },
      ],
    },
    bus_stop: {
      title: 'Bus stop', verb: 'Bus stop', keeper: 'conductor', icon: 'bus', hours: [['05:30', '23:00']], quick: 'wait',
      lines: ['Bus *aayi! Bhaago!*'],
      rows: [
        { id: 'wait', name: 'Wait for the bus', sub: () => (busUnlocked() ? 'to a hub or an unlocked stage · ' + rs(TUNE.busPrice) : 'Ticket Thatha at Koti knows every stage'), price: 0, house: true, act: (c) => { setView(busView(c)); return { keep: true }; } },
        { id: 'riddle', name: "Ticket Thatha's riddle for this stage", sub: 'something is hidden behind the board', price: 0, hidden: (c) => !stageOf(c.id) || stageFound(stageOf(c.id)) || !ticketsOn(), act: (c) => ({ msg: '"' + stageOf(c.id).riddle + '"' }) },
      ],
    },
  };
  // std rows are shared by booths and the booth inside Café Gulistan
  function stdRows() {
    return [
      { id: 'save', name: 'Save the game', sub: 'free · "Check the meter, take the bill, next!"', price: 0, house: true, act: () => stdSave() },
      { id: 'call_home', name: 'Call home', sub: 'Ammamma picks up · a proverb, then a hint', price: 100, act: (c) => callHome(c) },
      { id: 'call_yadagiri', name: "Call Yadagiri-anna's auto stand", sub: 'his auto comes to the nearest road', price: 100, when: () => (wanted() >= 3 ? 'He won\'t come during a chase' : S.hail ? 'An auto is already coming' : null), act: (c) => { closeShop(); setTimeout(() => hailAuto({ yadagiri: true, called: true }), 600); return { close: true, msg: '"Five minutes, *tammudu*." The line crackles.' }; } },
        { id: 'call_nanna', name: 'Call Nanna', sub: 'pillion on the Chetak to any place you know', price: 100, hidden: () => !(finds() >= 45 || (N.flags && N.flags.unlock_call_nanna)), when: () => nannaWhy(), act: () => callNanna() },
      { id: 'call_bunty', name: 'Call Bunty-anna', sub: 'pillion on the RX100 (helmet!) to any place you know', price: 100, hidden: () => !buntyUnlocked(), when: () => buntyWhy(), act: () => callBunty() },
      { id: 'call_vani', name: "Call Deccan Vani's request line", sub: 'a farmaish for a found song', price: 100, hidden: () => cassettes() < 3, act: () => callVani() },
      { id: 'call_kurnool', name: 'Trunk call to Kurnool (Immu\'s Nani)', sub: () => (mins() >= hm('21:00') ? 'night rate' : '"Come at night, the rate is less."'), price: () => (mins() >= hm('21:00') ? 200 : 500), hidden: () => !isDone('right_right'), act: () => callKurnool() },
    ];
  }
  KINDS.std_booth.rows = null;
  // cycle hire rows depend on the hire state (§5.6)
  function hireRows() {
    return [
      { id: 'kid_cycle', name: "Kid's cycle (small frame)", sub: '₹3 an hour, pay when you return', price: 0, house: true, hidden: () => !!S.hire, when: (c) => hireWhy(c), act: (c) => hireCycle(c.id, 'kid_cycle') },
      { id: 'big_cycle', name: 'Big black Hero (*kainchi* style)', sub: '₹3 an hour · carrier, rod brakes, the bell', price: 0, hidden: () => !!S.hire, when: (c) => hireWhy(c), act: (c) => hireCycle(c.id, 'hero_cycle') },
      { id: 'big_cycle_hercules', name: 'Hercules (the sporty one)', sub: '₹4 an hour · fat tyres, flat handle', price: 0, hidden: () => !!S.hire, when: (c) => hireWhy(c), act: (c) => hireCycle(c.id, 'hercules_cycle') },
      { id: 'ladies_cycle', name: 'Ladies cycle with basket', sub: '₹3 an hour · gentle on cargo', price: 0, hidden: () => !!S.hire, when: (c) => hireWhy(c), act: (c) => hireCycle(c.id, 'ladiescycle') },
      { id: 'return', name: 'Return the cycle', sub: () => (S.hire ? 'pay ' + rs(hireFee(S.hire, absMin())) + ' for ' + hireHours() : ''), price: 0, hidden: () => !S.hire, when: (c) => returnWhy(c), act: (c) => returnCycle(c.id) },
      { id: 'late', name: 'Pay the old hire (the boy fetched the cycle)', sub: () => rs(S.lateFee), price: () => S.lateFee, hidden: () => !(S.lateFee > 0), act: () => { S.lateFee = 0; return 'All square. "Next time, return it."'; } },
      { id: 'puncture', name: 'Puncture fix', sub: 'a tub of water, a chalk mark, two minutes', price: TUNE.puncture, hidden: (c) => !flatNear(c), act: (c) => progress(c, 'Puncture fix', TUNE.punctureSecs, 'Tyre in the tub. Bubbles! A chalk mark, a patch, a pump.', () => { const v = flatNear(c); if (v && N.vehicles.fixPuncture) N.vehicles.fixPuncture(v); return 'Fixed. "Puncture? That\'s your problem now." Not any more.'; }) },
    ];
  }
  // per-place hours that differ from their kind (systems §5.2, §5.14)
  const HOURS = {
    alpha_hotel: [['04:30', '01:00']], blue_sea_cafe: [['04:30', '01:00']],
  };
  KINDS.kite_stall.hoursFor = (c) => (inMD('01-01', '02-15') ? [['08:00', '20:00']] : c.id === 'kite_stall_1' ? [['10:00', '18:00']] : []);
  KINDS.kite_stall.closedWhy = 'Kite season is January to mid-February';
  KINDS.haleem_house.hoursFor = () => (ramzan() ? [['11:00', '01:00']] : [['11:00', '23:00']]);
  KINDS.nayaab.hoursFor = () => (ramzan() ? [['05:00', '01:00']] : [['05:00', '23:00']]);
  KINDS.cycle_rent.rowsFn = hireRows;
  KINDS.std_booth.rowsFn = stdRows;

  /* ============================================================ places -> shops */
  const ID_KIND = {
    karachi_bakery: 'karachi_bakery', subhan_bakery: 'subhan_bakery', gokul_chat: 'gokul_chat', famous_ice_cream: 'ice_cream',
    paradise: 'biryani', bawarchi: 'biryani', pathergatti: 'haleem_house', hotel_madina: 'haleem_house', pista_house: 'haleem_house',
    shadab_hotel: 'biryani2', hotel_niagara: 'biryani2', shah_ghouse: 'biryani2', taj_mahal_hotel_abids: 'tiffin', hotel_nayaab: 'nayaab',
    chappal_bazar: 'chappal_bazar', koti_book_bazaar: 'book_bazaar',
    koti_bus_stand: 'bus_hub', imlibun_bus_station: 'bus_hub', rathifile_bus_station: 'bus_hub', mehdipatnam_bus_terminus: 'bus_hub', cbs_hangar: 'bus_hub', gowliguda_hangar: 'bus_hub',
    nampally_station: 'station', kachiguda_station: 'station', secunderabad_station: 'station',
    prasads_imax: 'prasads', ntr_gardens: 'ntr_gardens', lumbini_park: 'lumbini_park', nehru_zoo: 'zoo',
    state_museum: 'museum', salar_jung_museum: 'museum', nizams_museum: 'museum', birla_planetarium: 'planetarium',
    golconda_fort: 'golconda', golconda_sound_light: 'sound_light', qutb_shahi_tombs: 'tombs', nampally_exhibition: 'numaish',
    lumbini_jetty: 'boats', electronics_shop_1: 'tv_window', gurudwara_gowliguda: 'langar',
  };
  const PRASADAM = /^(temple_\d+|birla_mandir|dilsukhnagar_sai_temple|ujjaini_mahankali_temple|karmanghat_hanuman_temple|ashtalakshmi_temple|peddamma_temple|iskcon_abids)$/;
  const NO_SHOP = new Set(['prasadam', 'langar']);
  function kindFor(p) {
    if (ID_KIND[p.id]) return ID_KIND[p.id];
    if (/^rythu_bazaar_/.test(p.id)) return 'rythu';
    if (p.kind === 'temple' && PRASADAM.test(p.id)) return 'prasadam';
    if (p.kind === 'school' && /^school_\d+$/.test(p.id)) return 'school_gate';
    if (KINDS[p.kind] && !NO_SHOP.has(p.kind)) return p.kind;
    return null;
  }
  const defs = {};
  const aliasOf = {};
  function build() {
    for (const k of Object.keys(defs)) delete defs[k];
    for (const k of Object.keys(aliasOf)) delete aliasOf[k];
    const raw = (N.WORLD_DATA && N.WORLD_DATA.places) || [];
    const resp = (N.WORLD_DATA && N.WORLD_DATA.respect) || [];
    for (const p of raw) if (p && p.alias && p.alias !== p.id) aliasOf[p.id] = p.alias;
    for (const p of raw) {
      if (!p || aliasOf[p.id] || !N.places[p.id]) continue;
      const kind = kindFor(p);
      if (!kind) continue;
      const K = KINDS[kind];
      let x = p.x, y = p.y;
      if (kind === 'prasadam' || kind === 'langar') {
        const z = resp.find((q) => q.place === p.id);
        if (z && z.gate && isFinite(z.gate.x)) { x = z.gate.x; y = z.gate.y + 10; }
      }
      const big = K.big || (p.r || 18) > 26;
      defs[p.id] = {
        id: p.id, kind, K, raw: p, place: N.places[p.id], name: p.name || p.id, x, y,
        r: big ? U.clamp((p.r || 30) * 0.8, 20, TUNE.rBig) : TUNE.r,
        std: !!p.std, oldCity: OLD_CITY.has(p.district), aliases: raw.filter((q) => q.alias === p.id).map((q) => q.id),
      };
    }
    installInteracts();
  }
  function resolve(id) { let k = id, n = 0; while (aliasOf[k] && n++ < 4) k = aliasOf[k]; return defs[k] ? k : null; }
  function defOf(id) { const k = resolve(id); return k ? defs[k] : null; }
  function ctxOf(def) { return { def, id: def.id, kind: def.kind, K: def.K, place: def.place, oldCity: def.oldCity, x: def.x, y: def.y }; }

  /* =============================================================== hours */
  function hoursOf(def) {
    const K = def.K;
    if (HOURS[def.id]) return HOURS[def.id];
    if (K.hoursFor) { try { return K.hoursFor(ctxOf(def)) || []; } catch (e) { return K.hours || []; } }
    return K.hours || [];
  }
  function inSpan(m, a, b) { const A = hm(a), B = hm(b); return A <= B ? m >= A && m < B : m >= A || m < B; }
  function statusOf(def, m) {
    m = m == null ? mins() : m;
    const K = def.K, c = ctxOf(def);
    let why = null;
    try { why = (K.closed && K.closed(c)) || null; } catch (e) { why = null; }
    if (!why && def.id === 'irani_cafe_19' && !(isDone('bo_kaata') || (N.flags && (N.flags.noor_open || N.flags.cafe_noor_open)))) why = 'Faramarz uncle opens the shutters soon. *Thoda sabr.*';
    if (!why && def.kind === 'internet_cafe' && !netOpen()) why = 'Server down, *beta*. Come back later.';
    if (!why && def.kind === 'pindi_girni' && N.flags && N.flags.power_cut) why = 'Power cut. The belt is still.';
    if (why) return { open: false, reason: why, text: plain(why), fence: !!K.fence };
    const d = dow();
    if ((K.openDow && K.openDow.indexOf(d) < 0) || (K.closedDow && K.closedDow.indexOf(d) >= 0)) return { open: false, reason: K.closedWhy || 'Closed today', text: K.closedWhy || 'Closed today' };
    if (K.present) { let here = true; try { here = !!K.present(c); } catch (e) { here = true; } if (!here) return { open: false, reason: 'The cart is not here now', text: 'Not here right now', absent: true }; }
    const H = hoursOf(def);
    if (!H.length) return { open: false, reason: K.closedWhy || 'Closed today', text: K.closedWhy || 'Closed today' };
    if (H.some((h) => hm(h[0]) === 0 && hm(h[1]) >= 1440)) return { open: true, closes: null, allDay: true, text: 'Open all day' };
    for (const h of H) if (inSpan(m, h[0], h[1])) return { open: true, closes: hm(h[1]) % 1440, text: 'Open till ' + fmtHM(hm(h[1])) };
    let best = null, bd = 1e9;
    for (const h of H) { const A = hm(h[0]); const dd = (A - m + 1440) % 1440; if (dd < bd) { bd = dd; best = A; } }
    return { open: false, reason: 'BAND', opens: best, text: '*Band.* Opens at ' + fmtHM(best) };
  }
  function hoursText(id) {
    const def = defOf(id); if (!def) return null;
    const H = hoursOf(def), K = def.K;
    let t = H.length ? H.map((h) => h[0] === '00:00' && h[1] === '24:00' ? 'open all day' : h[0] + '–' + (h[1] === '24:00' ? '00:00' : h[1])).join(', ') : (K.closedWhy || 'closed');
    if (K.openDow) t = 'Sundays ' + t;
    if (K.closedDow) t += ' · ' + (K.closedWhy || 'closed some days');
    const st = statusOf(def);
    return 'Hours ' + t + (st.open ? ' · open now' : ' · ' + plain(st.text).toLowerCase());
  }
  function batter() { return mins() < hm('10:00') ? null : 'After ten, only idli. Dosa batter is finished.'; }
  function gateCarts() {
    const m = mins();
    return (schoolDay() && m >= hm('15:30') && m < hm('19:00')) || (summer() && m >= hm('11:00') && m < hm('18:00'));
  }
  function netOpen() { return isDone('opening_day') || !!(N.flags && (N.flags.internet_open || N.flags.prasads_open)) || prasadsOpen(); }
  function boatsOpen() { return isDone('agle_baras') || !!(N.flags && (N.flags.boats_open || N.flags.boats)); }
  function entryWhy(id) { return used('entry:' + id) ? null : 'Buy the entry ticket first'; }
  function nextOf(list) {
    const m = mins();
    for (const t of list) if (hm(t) >= m - 5) return t;
    return null;
  }
  function orderedHere(id) { const o = S.lastOrder; return !!(o && o.place === id && o.paise >= 400 && absMin() - o.at <= 2); }
  function iceFlavour() { const mo = date().m; return mo >= 9 ? 'Sitaphal' : mo === 5 || mo === 6 ? 'Mango' : mod(day(), 2) ? 'Kesar' : 'Vanilla'; }
  function cassettes() { try { const W = N.walkman; return W && W.cassettes ? (W.cassettes.size || W.cassettes.length || 0) : 0; } catch (e) { return 0; } }

  /* ================================================================ interacts */
  const IDS = [];
  const touchDev = () => !!(N.input && N.input.device === 'touch');
  function locked() {
    if (S.locks.size || (N.flags && N.flags.lock_shops)) return true;
    const a = N.missions && N.missions.active;
    return !!(a && (a.lockShops || (a.def && a.def.lockShops) || (a.m && a.m.data && a.m.data.lockShops)));
  }
  function installInteracts() {
    const I = N.interact; if (!I) return;
    for (const k of IDS) I.remove(k);
    IDS.length = 0;
    for (const id in defs) {
      const def = defs[id], key = 'shop:' + id;
      IDS.push(key);
      I.add(key, { x: def.x, y: def.y, r: def.r, priority: 3, label: () => labelFor(def), enabled: () => enabledFor(def), use: () => pressShop(def) });
    }
  }
  function enabledFor(def) {
    if (UI.open || S.ride || S.ff || S.hold || locked()) return false;
    if (def.K.direct) return directOk(def);
    if (def.K.cart && !statusOf(def).open) return false;       // carts are only there during their hours
    return true;
  }
  function labelFor(def) {
    const st = statusOf(def);
    if (!st.open) {
      if (st.fence) return 'COMING SOON';
      if (st.opens != null) return touchDev() ? 'Band · ' + fmtHM(st.opens) : 'Closed till ' + fmtHM(st.opens);
      return touchDev() ? 'Band' : 'Closed';
    }
    if (def.kind === 'irani_cafe') return touchDev() ? 'Chai (hold ★)' : 'Chai · hold for the ★ combo';
    return def.K.verb || 'Shop';
  }
  function pressShop(def) {
    if (def.K.direct) { directUse(def); return; }
    // tap = open the card; hold ACTION 0.5 s = quick order of the ★ house item (systems §1.1, §5.1)
    S.hold = { id: def.id, t: 0 };
  }

  /* ============================================== prasadam and langar (free, respectful) */
  function directOk(def) {
    const st = statusOf(def);
    return st.open && !used('food:' + def.id);
  }
  function directUse(def) {
    if (!directOk(def)) return;
    use('food:' + def.id);
    if (def.kind === 'langar') {
      feed(50);
      toast('*Langar*: dal, roti and kheer, served to everyone. Head covered with Amma\'s hankie. Tummy +50.', 3600);
    } else {
      const sai = def.id === 'dilsukhnagar_sai_temple' && dow() === 4;
      feed(sai ? 15 : 10);
      toast('*Prasadam* at the gate: a spoon of sweet pongal on a leaf. Tummy +' + (sai ? 15 : 10) + '.', 3200);
    }
    N.emit('shop:service', { place: def.id, service: def.kind });
  }

  /* ======================================================================== UI */
  const UI = { root: null, dom: {}, open: false, pushed: false, def: null, ctx: null, view: null, stack: [], sel: 0, qty: {}, items: [], msg: '', msgKind: '', who: '', line: '', busy: false, opened: 0 };
  function ensureDom() {
    if (UI.root) return;
    const ov = document.getElementById('overlay') || el('div', '', document.body);
    if (!ov.id) ov.id = 'overlay';
    const r = UI.root = el('div', 'screen shop-screen', ov);
    r.id = 'shop';
    r.innerHTML =
      '<div class="shop-card" role="dialog" aria-modal="true" aria-labelledby="shop-name">' +
      '<div class="shop-sign"><span class="shop-ico" aria-hidden="true"></span><div class="shop-title"><b class="shop-name" id="shop-name"></b><span class="shop-kind"></span></div>' +
      '<div class="shop-purse"></div><button type="button" class="shop-x" aria-label="Close">✕</button></div>' +
      '<div class="shop-say"><span class="shop-who"></span><span class="shop-line"></span></div>' +
      '<div class="shop-sub"></div>' +
      '<div class="shop-body scroll"></div>' +
      '<div class="shop-foot"><span class="shop-msg" aria-live="polite"></span><span class="shop-keys"></span></div></div>';
    const q = (s) => r.querySelector(s);
    UI.dom = { card: q('.shop-card'), ico: q('.shop-ico'), name: q('.shop-name'), kind: q('.shop-kind'), purse: q('.shop-purse'), who: q('.shop-who'), line: q('.shop-line'), say: q('.shop-say'), sub: q('.shop-sub'), body: q('.shop-body'), msg: q('.shop-msg'), keys: q('.shop-keys') };
    q('.shop-x').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); back(true); });
    UI.dom.body.addEventListener('pointerdown', onBodyPointer);
    // a tap outside the card closes it (like Esc)
    r.addEventListener('pointerdown', (e) => { if (e.target === r) { e.preventDefault(); back(true); } });
  }
  function onBodyPointer(e) {
    const t = e.target;
    const row = t.closest && t.closest('[data-i]');
    if (!row) return;
    e.preventDefault(); e.stopPropagation();
    const i = +row.dataset.i;
    const q = t.closest('[data-q]');
    if (q) { setSel(i); changeQty(q.dataset.q === '+' ? 1 : -1); return; }
    if (t.closest('[data-go]') || UI.sel === i || e.pointerType === 'mouse') { setSel(i); activate(i); return; }
    setSel(i);
  }
  function freeze(on) { const W = N.wanted; if (W && typeof W.freeze === 'function') { try { W.freeze(!!on, 'shop'); } catch (e) { N.err('shops.freeze', e); } } }
  function openShop(id, opts) {
    const def = defOf(id);
    if (!def || def.K.direct) return false;
    const md = N.state.mode;
    if (md !== 'play' && !(md === 'dialogue' && UI.pushed)) return false;
    if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) return false;
    if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) return false;
    ensureDom();
    if (UI.open) closeShop(true);
    opts = opts || {};
    UI.open = true; UI.def = def; UI.ctx = Object.assign(ctxOf(def), { opts }); UI.view = null; UI.stack = []; UI.sel = 0; UI.qty = {};
    UI.msg = ''; UI.msgKind = ''; UI.busy = false; UI.opened = N.time.real || 0;
    keeperLine(def, null, true);
    if (N.state.mode === 'play') { N.state.push('dialogue'); UI.pushed = true; }
    N.clock.hold('shop', true);
    freeze(true);
    markVisited(def.id);
    UI.root.classList.add('show');
    document.body.classList.add('shop-open');
    render();
    if (opts.focus) { const i = UI.items.findIndex((it) => it.row && it.row.id === opts.focus); if (i >= 0) setSel(i); }
    else { const i = UI.items.findIndex((it) => it.row && it.row.house && !it.why); if (i >= 0) setSel(i); }
    if (opts.vehicle && def.kind === 'cycle_rent') { const want = { ladiescycle: 'ladies_cycle', cycle: 'big_cycle', hero_cycle: 'big_cycle', hercules_cycle: 'big_cycle_hercules' }[opts.vehicle.type] || 'kid_cycle'; const i = UI.items.findIndex((it) => it.row && it.row.id === want); if (i >= 0) setSel(i); }
    sfx('shop_bell');
    N.emit('shop:open', { place: def.id, kind: def.kind });
    return true;
  }
  function closeShop(silent) {
    if (!UI.open) return false;
    const def = UI.def;
    UI.open = false; UI.busy = false; UI.view = null; UI.stack = [];
    UI.root.classList.remove('show');
    document.body.classList.remove('shop-open');
    N.clock.hold('shop', false);
    freeze(false);
    if (UI.pushed) { UI.pushed = false; if (N.state.has ? N.state.has('dialogue') : N.state.mode === 'dialogue') N.state.remove('dialogue'); }
    if (N.input) { N.input.consume('action'); N.input.consume('pause'); N.input.consume('horn'); }
    if (!silent) sfx('ui_back');
    // a ride card (auto / taxi / Nanna / Bunty-anna) closed without choosing: the driver waits, the card
    // stays shut until he asks again (hailTick)
    if (def && def.virtual && /^(auto|nanna|bunty)_ride$/.test(def.kind || '')) for (const key of ['hail', 'nannaJob', 'buntyJob']) { const j = S[key]; if (j && !j.riding) j.dismissed = true; }
    N.emit('shop:close', { place: def && def.id });
    return true;
  }
  function setView(v) { if (!UI.open) return; if (UI.view) UI.stack.push(UI.view); else UI.stack.push(null); UI.view = v; UI.sel = 0; UI.msg = ''; render(); }
  function back(all) {
    if (UI.busy) return;
    // backing out of a show poster returns the ticket money
    const pv = UI.view;
    if (pv && pv.refund > 0) { const r = pv.refund; pv.refund = 0; N.player.money = (N.player.money | 0) + r; S.stats.spent -= r; emitMoney(r, 'refund'); if (!all) flash('Ticket returned. ' + rs(r) + ' back.', 'ok'); }
    if (!all && UI.view) { UI.view = UI.stack.pop() || null; UI.sel = 0; render(); sfx('ui_back'); return; }
    if (UI.view && UI.view.onBack) { try { UI.view.onBack(); } catch (e) { N.err('shops.back', e); } }
    closeShop();
  }
  function flash(text, kind) { UI.msg = text || ''; UI.msgKind = kind || 'ok'; if (UI.open) { UI.dom.msg.innerHTML = emph(UI.msg); UI.dom.msg.className = 'shop-msg ' + UI.msgKind; } }
  const SAY_WHO = { waiter: (d) => (d.id === 'irani_cafe_7' ? 'salim' : d.id === 'irani_cafe_19' ? 'faramarz' : 'waiter'), kirana: (d) => (d.id === 'kirana_1' ? 'agarwal' : 'kirana_kid'), ramulu: (d) => (d.id === 'pindi_girni_1' ? 'ramulu' : 'girni_man'), flower_aunty: (d) => (/^flower_cart_[12]$/.test(d.id) ? 'flower_aunty' : 'flower_seller'), photo_uncle: (d) => (d.id === 'photo_studio_1' ? 'photo_uncle' : 'studio_man'), net_uncle: (d) => (d.id === 'internet_cafe_1' ? 'net_uncle' : 'net_man'), kite_chacha: (d) => (d.id === 'kite_stall_1' ? 'kite_chacha' : 'kite_seller') };
  const KEEPER_NAME = { waiter: 'Waiter', kirana_kid: 'Shop boy', girni_man: 'Girni uncle', flower_seller: 'Flower aunty', studio_man: 'Studio uncle', net_man: 'Net uncle', kite_seller: 'Kite seller', std: 'Booth uncle', barber: 'Barber', cycle_man: 'Cycle-shop uncle', parlour: 'Parlour owner', chai_man: 'Chai-wala', samosa_man: 'Samosa-wala', ice_man: 'Counter uncle', gate_checker: 'Gate checker', gola_man: 'Gola-wala', ticket_man: 'Ticket counter', crowd: 'The crowd' };
  function keeperLine(def, line, greet) {
    const K = def.K;
    const sp = SAY_WHO[K.keeper] ? SAY_WHO[K.keeper](def) : K.keeper || 'waiter';
    const now = N.time.real || 0;
    if (!greet && line == null && S.lineT[def.id] && now - S.lineT[def.id] < TUNE.lineCooldown) return;
    let t = line;
    if (t == null) {
      const L = def.id === 'irani_cafe_19' ? ['*Do chai, ek plate Osmania!*', 'One chai, one hour? No. One chai, twenty minutes.', 'My father came from Yazd with one tin and one recipe.'] : K.lines || [];
      if (def.id === 'kirana_1' && S.khaata > 0) t = '*Khaate mein likh diya.* Tell your Nanna.';
      else t = L.length ? L[Math.floor(Math.random() * L.length)] : '';
    }
    S.lineT[def.id] = now;
    UI.who = KEEPER_NAME[sp] || speakerName(sp);
    UI.line = subst(t || '');
  }

  /* -------------------------------------------------------------- rows */
  function rowsOf(def) {
    const K = def.K;
    let rows = K.rowsFn ? K.rowsFn(def) : K.rows || [];
    const extra = EXTRA.filter((x) => x.target === def.id || x.target === def.kind).map((x) => x.row);
    if (extra.length) rows = extra.concat(rows);
    return rows;
  }
  const val = (v, c) => (typeof v === 'function' ? v(c) : v);
  function priceOf(c, row) { const p = val(row.price, c); return Math.max(0, Math.round(p || 0)); }
  function maxQty(c, row) {
    let m = row.max || 1;
    if (row.cap) for (const k in row.cap) { const per = (row.give && row.give[k]) || 1; m = Math.min(m, Math.max(0, Math.floor((row.cap[k] - itemCount(k)) / per))); }
    return Math.max(1, m);
  }
  function rowWhy(c, row, qty, o) {
    o = o || {};
    if (!o.force) {
      if (locked()) return 'Not now — the mission needs you.';
      if (c.def) { const st = statusOf(c.def); if (!st.open) return st.opens != null ? '*Band.* Opens at ' + fmtHM(st.opens) : plain(st.reason); }
    }
    if (row.when) { let w = null; try { w = row.when(c); } catch (e) { w = null; } if (w) return w; }
    if (row.cap) for (const k in row.cap) { const per = (row.give && row.give[k]) || 1; if (itemCount(k) + per * qty > row.cap[k]) return itemCount(k) >= row.cap[k] ? 'You can carry only ' + row.cap[k] : 'You can carry ' + Math.max(0, row.cap[k] - itemCount(k)) + ' more'; }
    if (!o.free && !row.payLater) {
      const p = priceOf(c, row) * qty;
      if (p > (N.player.money | 0) && !(c.id === 'kirana_1' && S.khaata + p <= khaataLimit())) return '*Paise kam hain, beta.*';
    }
    return null;
  }
  function visibleItems(c, rows) {
    const out = [];
    for (const row of rows) {
      let hide = false;
      try { hide = !!(row.hidden && row.hidden(c)); } catch (e) { hide = true; }
      if (hide) continue;
      const q = Math.min(UI.qty[row.id] || 1, maxQty(c, row));
      out.push({ row, qty: q, why: rowWhy(c, row, q) });
    }
    return out;
  }
  function chips(c, row) {
    const out = [];
    if (row.feed != null) { const f = typeof row.feed === 'object' ? row.feed : { tummy: row.feed, energy: row.feed }; if (f.tummy) out.push(['chai', '+' + f.tummy]); else if (f.energy) out.push(['energy', '+' + f.energy]); }
    if (row.status) { const s = Array.isArray(row.status) ? row.status[0] : row.status; if (s === 'warm') out.push(['warm', 'warm']); else if (s === 'cool') out.push(['cool', 'cool']); else if (s === 'coma') out.push(['sleep', 'sleepy']); else if (s === 'sugar') out.push(['energy', 'sugar']); }
    if (row.give || row.inv) out.push(['bag', 'carry']);
    if (row.fx) for (const f of row.fx) out.push([f[0], val(f[1], c)]);
    return out;
  }
  const ICON_CH = { time: '▶▶' }; // the other chip icons are drawn in CSS (no emoji fonts needed)

  function render() {
    if (!UI.open) return;
    const D = UI.dom, def = UI.def, c = UI.ctx, st = statusOf(def), v = UI.view;
    D.card.className = 'shop-card k-' + def.kind + ' i-' + (def.K.icon || 'shop') + (st.open ? '' : ' closed') + (st.fence ? ' fence' : '') + (v ? ' v-' + v.type : '');
    D.name.innerHTML = emph(def.name.replace(/\s*\((on hire|finale|home)\)\s*$/i, ''));
    D.kind.innerHTML = def.virtual || def.K.virtual ? esc(def.K.title) + ' · <span class="ok">at the kerb</span>'
      : esc(def.K.title) + ' · ' + (st.open ? '<span class="ok">' + (st.allDay ? 'open all day' : 'open till ' + fmtHM(st.closes)) + '</span>' : '<span class="no">' + emph(st.text) + '</span>');
    D.purse.textContent = U.fmtMoney(N.player.money | 0);
    D.who.textContent = UI.who ? UI.who + ':' : '';
    D.line.innerHTML = UI.line ? '“' + emph(UI.line) + '”' : '';
    D.say.hidden = !UI.line;
    let sub = '';
    if (!v && def.kind === 'kirana' && def.id === 'kirana_1') sub = 'Khaata: ' + (S.khaata ? rs(S.khaata) + ' owed' : 'clear') + ' · limit ' + rs(khaataLimit());
    if (!v && st.fence) sub = '<b class="shop-fence">PRASADS — COMING SOON — THE GIANT SCREEN</b>';
    if (!v && !st.open && !st.fence) sub = '<b class="shop-band">BAND</b> ' + emph(st.text);
    if (v && v.title) sub = '<b>' + emph(v.title) + '</b>' + (v.sub ? ' · ' + emph(val(v.sub, c)) : '');
    D.sub.innerHTML = sub; D.sub.hidden = !sub;
    if (!v || v.type === 'list') renderList(v ? v.rows : rowsOf(def));
    else if (v.type === 'progress') renderProgress(v);
    else if (v.type === 'poster') renderPoster(v);
    else if (v.type === 'info') renderInfo(v);
    D.msg.innerHTML = emph(UI.msg); D.msg.className = 'shop-msg ' + (UI.msgKind || '');
    D.keys.innerHTML = touchDev() ? '' : (v && v.type === 'progress' ? '' : '<kbd>↑</kbd><kbd>↓</kbd> choose · ' + (UI.items.some((it) => it.row.max > 1) ? '<kbd>←</kbd><kbd>→</kbd> how many · ' : '') + '<kbd>E</kbd> buy · <kbd>Esc</kbd> ' + (v ? 'back' : 'close'));
  }
  function renderList(rows) {
    const c = UI.ctx;
    UI.items = visibleItems(c, rows || []);
    if (UI.sel >= UI.items.length) UI.sel = Math.max(0, UI.items.length - 1);
    const h = [];
    UI.items.forEach((it, i) => {
      const r = it.row, p = priceOf(c, r) * it.qty;
      const name = val(r.name, c), sub = val(r.sub, c);
      const lbl = r.priceLabel ? val(r.priceLabel, c) : r.price == null && !r.act ? '' : p ? rs(p) : r.go || (r.act && !r.feed ? 'Go' : 'Free');
      const ch = chips(c, r).map((x) => '<i class="chip c-' + x[0] + '"><s>' + (ICON_CH[x[0]] || '') + '</s>' + esc(x[1]) + '</i>').join('');
      const qty = r.max > 1 && !it.why ? '<span class="r-qty"><b data-q="-" aria-label="one less">−</b><span>' + it.qty + '</span><b data-q="+" aria-label="one more">+</b></span>' : '';
      h.push('<div class="shop-row' + (i === UI.sel ? ' sel' : '') + (it.why ? ' dis' : '') + (r.house ? ' house' : '') + (r.mission ? ' mission' : '') + '" data-i="' + i + '" role="button" tabindex="-1">' +
        '<span class="r-main"><span class="r-name">' + (r.house ? '<em class="star" title="house item: hold ACTION to order">★</em>' : '') + emph(name) + '</span>' +
        (it.why ? '<span class="r-why">' + emph(it.why) + '</span>' : sub ? '<span class="r-sub">' + emph(sub) + '</span>' : '') + '</span>' +
        '<span class="r-fx">' + ch + '</span>' + qty +
        '<span class="r-buy" data-go="1">' + esc(lbl || 'Go') + '</span></div>');
    });
    if (!UI.items.length) h.push('<p class="shop-empty">' + emph(UI.view && UI.view.empty ? UI.view.empty : 'Nothing for sale right now.') + '</p>');
    UI.dom.body.innerHTML = h.join('');
    const s = UI.dom.body.querySelector('.sel');
    if (s && s.scrollIntoView) { try { s.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
  }
  function renderProgress(v) {
    const k = v.secs > 0 ? U.clamp(v.t / v.secs, 0, 1) : 1;
    UI.items = [];
    UI.dom.body.innerHTML = '<div class="shop-progress"><p>' + emph(v.text || '') + '</p><div class="bar"><b style="width:' + Math.round(k * 100) + '%"></b></div><p class="secs">' + Math.max(0, Math.ceil(v.secs - v.t)) + ' s</p></div>';
  }
  function renderPoster(v) {
    const P = v.poster || {}, c1 = (P.c && P.c[0]) || '#c8231d', c2 = (P.c && P.c[1]) || '#f2c230';
    UI.items = [{ row: { id: '_go', name: v.goLabel || '▶ Watch', act: () => { v.go(); return { close: true }; } }, qty: 1, why: null }];
    UI.sel = 0;
    UI.dom.body.innerHTML =
      '<div class="shop-poster" style="--p1:' + c1 + ';--p2:' + c2 + '"><div class="pp-rays"></div><span class="pp-cert">' + esc(P.cert || 'U') + '</span>' +
      '<b class="pp-title">' + esc(P.t || '') + '</b><span class="pp-tag">' + esc(P.s || '') + '</span><span class="pp-stars">★ ★ ★ ★</span></div>' +
      '<p class="shop-note">' + emph(v.note || '') + '</p>' +
      '<div class="shop-row sel" data-i="0" role="button"><span class="r-main"><span class="r-name">' + esc(v.goLabel || '▶ Watch') + '</span></span><span class="r-buy" data-go="1">' + esc(v.goShort || '▶') + '</span></div>';
  }
  function renderInfo(v) {
    const rows = v.rows || [];
    UI.items = visibleItems(UI.ctx, rows);
    const h = ['<div class="shop-info">' + (v.html || '') + '</div>'];
    UI.items.forEach((it, i) => { h.push('<div class="shop-row' + (i === UI.sel ? ' sel' : '') + (it.why ? ' dis' : '') + '" data-i="' + i + '" role="button"><span class="r-main"><span class="r-name">' + emph(val(it.row.name, UI.ctx)) + '</span>' + (it.why ? '<span class="r-why">' + emph(it.why) + '</span>' : '') + '</span><span class="r-buy" data-go="1">' + esc(it.row.go || 'OK') + '</span></div>'); });
    UI.dom.body.innerHTML = h.join('');
  }
  function setSel(i) { if (!UI.items.length) return; UI.sel = U.clamp(i, 0, UI.items.length - 1); UI.dom.body.querySelectorAll('.shop-row').forEach((r) => r.classList.toggle('sel', +r.dataset.i === UI.sel)); const s = UI.dom.body.querySelector('.sel'); if (s && s.scrollIntoView) { try { s.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } } }
  function changeQty(d) {
    const it = UI.items[UI.sel]; if (!it || !(it.row.max > 1)) return;
    const m = maxQty(UI.ctx, it.row);
    UI.qty[it.row.id] = U.clamp((UI.qty[it.row.id] || 1) + d, 1, m);
    sfx('ui_click'); render();
  }
  function activate(i) {
    const it = UI.items[i];
    if (!it || UI.busy) return;
    if (it.why) { flash(it.why, 'warn'); sfx('ui_back'); return; }
    const r = buyRow(UI.ctx, it.row, it.qty, { ui: true });
    handleResult(r);
  }
  function handleResult(r) {
    if (!r) return;
    if (!r.ok) { if (UI.open) { flash(r.why || 'Not now.', 'warn'); render(); } else toast(plain(r.why || 'Not now.')); sfx('ui_back'); return; }
    const res = r.res;
    const note = r.toffee ? ' "No change. Take a toffee."' : r.khaata ? ' (on the khaata)' : '';
    const done = (m) => {
      if (m && typeof m === 'object') {
        if (m.close) { closeShop(true); if (m.msg) toast(plain(m.msg), 3200); return; }
        if (m.keep) { if (m.msg) flash(m.msg); return; }
        m = m.msg;
      }
      const text = (m || r.summary || '') + note;
      if (UI.open) { if (UI.view && UI.view.type === 'progress') { UI.view = UI.stack.pop() || null; } flash(text, 'ok'); render(); } else if (text) toast(plain(text), 2800);
    };
    if (res && typeof res.then === 'function') { res.then(done, (e) => { N.err('shops.act', e); done('Something went wrong.'); }); }
    else done(res);
  }

  /* ================================================================= buying */
  function applyEffects(row, k) {
    if (row.feed != null) { if (typeof row.feed === 'object') feed(0, Object.assign({ quiet: k > 0 }, row.feed)); else feed(row.feed, { quiet: k > 0 }); }
    if (row.status) { const st = Array.isArray(row.status) ? row.status : [row.status]; status(st[0], st[1]); }
    if (row.give) for (const id in row.give) addItem(id, row.give[id]);
    if (row.inv) giveInv(row.inv);
  }
  function summaryOf(c, row, qty, price) {
    let t = (qty > 1 ? qty + ' × ' : '') + plain(val(row.name, c)) + (price ? ' — ' + rs(price) : '');
    if (row.feed != null) { const f = typeof row.feed === 'object' ? row.feed : { tummy: row.feed }; if (f.tummy > 0) t += ' · tummy +' + f.tummy * qty; else if (f.energy > 0) t += ' · energy +' + f.energy * qty; }
    if (row.give) for (const id in row.give) { const n = itemCount(id); t += ' · ' + id.replace(/_/g, ' ') + ' ×' + n; break; }
    return t;
  }
  /** Buy one row (no UI needed): hours, caps and money are checked; returns {ok, why, paid, res}. */
  function buyRow(c, row, qty, o) {
    o = o || {};
    qty = U.clamp((qty | 0) || 1, 1, maxQty(c, row));
    const why = rowWhy(c, row, qty, o);
    if (why) return { ok: false, why };
    let price = o.free ? 0 : priceOf(c, row) * qty;
    let toffee = false;
    // the toffee-for-change gag (systems §2.4): 50 p of change becomes a toffee
    if (c.K && c.K.toffee && price % 100 === 50 && Math.random() < TUNE.toffeeChance && (N.player.money | 0) >= price + 50) { price += 50; toffee = true; }
    let pay = { ok: true, paid: 0 };
    if (price > 0 && !row.payLater) {
      pay = charge(price, { why: c.id + ':' + row.id, khaata: c.id === 'kirana_1' });
      if (!pay.ok) return { ok: false, why: pay.why };
    }
    c.lastPrice = price;
    for (let k = 0; k < qty; k++) applyEffects(row, k);
    if (toffee) feed(0, { energy: 2, quiet: true });
    let res = null;
    if (row.act) { try { res = row.act(c, qty); } catch (e) { N.err('shops.act:' + row.id, e); res = 'Something went wrong.'; } }
    if (res && res.refund && price > 0 && !row.payLater) { N.player.money += price; S.stats.spent -= price; emitMoney(price, 'refund'); price = 0; }
    if (price > 0) { S.lastOrder = { place: c.id, paise: price, at: absMin() }; S.stats.buys++; }
    N.emit('shop:buy', { place: c.id, item: row.id, price: row.payLater ? 0 : price, qty, kind: c.kind });
    if (price > 0) sfx(price >= 1000 ? 'cash' : 'coin');
    if (c.def && !(res && res.close)) keeperLine(c.def, row.line || null);
    return { ok: true, paid: price, res, toffee, khaata: pay.khaata, summary: summaryOf(c, row, qty, price) };
  }
  function findRow(def, itemId) { return rowsOf(def).find((r) => r.id === itemId) || null; }
  /** Scripted / test purchase without the card: N.shops.buy('irani_cafe_7', 'combo', {qty, free, force}). */
  function buy(id, itemId, o) {
    const def = defOf(id);
    if (!def) return { ok: false, why: 'unknown shop ' + id };
    const row = findRow(def, itemId);
    if (!row) return { ok: false, why: 'unknown item ' + itemId };
    const c = ctxOf(def);
    const r = buyRow(c, row, (o && o.qty) || 1, o || {});
    if (r.ok && r.res && r.res.then) r.res.catch(() => {});
    return r;
  }
  /** The ★ house item, no menu (hold ACTION). Services that need the card open it instead. */
  function quickOrder(id) {
    const def = defOf(id);
    if (!def) return { ok: false, why: 'unknown shop' };
    const rows = rowsOf(def), c = ctxOf(def);
    const row = rows.find((r) => r.house && !(r.hidden && r.hidden(c))) || rows.find((r) => r.id === def.K.quick);
    if (!row) { openShop(id); return { ok: true, opened: true }; }
    const st = statusOf(def);
    if (!st.open) { toast(plain(st.opens != null ? '*Band.* Opens at ' + fmtHM(st.opens) : st.text)); return { ok: false, why: st.text }; }
    if (row.act) {
      openShop(def.id, { focus: row.id });
      const i = UI.items.findIndex((it) => it.row.id === row.id);
      if (i >= 0) activate(i);
      return { ok: true, opened: true };
    }
    const r = buyRow(c, row, 1, {});
    if (!r.ok) { toast(plain(r.why)); return r; }
    toast('★ ' + plain(val(row.name, c)) + '!' + (r.paid ? ' −' + rs(r.paid) : '') + (row.feed ? ' · tummy +' + (typeof row.feed === 'object' ? row.feed.tummy || 0 : row.feed) : '') + (r.toffee ? ' · a toffee for change' : ''), 2600);
    N.emit('shop:quick', { place: def.id, item: row.id });
    return r;
  }

  /* ============================================================ services */
  function progress(c, title, secs, text, done, o) {
    if (!UI.open) { let m = null; try { m = done(); } catch (e) { N.err('shops.progress', e); } return Promise.resolve(m); } // no card (API / quick use): at once
    return new Promise((resolve) => {
      UI.busy = false;
      setView({ type: 'progress', title, text, secs: Math.max(0, secs), t: 0, sfx: o && o.sfx, every: (o && o.every) || 1.4, sT: 0, done: () => { let m = null; try { m = done(); } catch (e) { N.err('shops.progress', e); } resolve(m); } });
      UI.busy = true;
    });
  }
  const HAIR = ['spiky', 'army cut', 'oiled side parting', 'puff'];
  function haircut(c) {
    return progress(c, 'Haircut', TUNE.haircutSecs, 'Water spray. Snip, snip, snip. The mirror shows a boy you almost recognise.', () => {
      const st = N.player.status && N.player.status.hair;
      const cur = st && typeof st.value === 'number' ? st.value : 0;
      const next = (cur + 1) % HAIR.length;
      status('hair', { value: next });
      const had = wanted();
      const W = N.wanted;
      if (had > 0) { try { if (W && typeof W.clear === 'function') W.clear('barber'); else meterDown(5, 'barber'); } catch (e) { N.err('shops.barber', e); } }
      N.emit('shop:service', { place: c.id, service: 'haircut', style: HAIR[next] });
      return 'New hairstyle: ' + HAIR[next] + '.' + (had ? ' Chappal Meter cleared! "Nobody will recognise you. Not even your Mummy."' : '');
    }, { sfx: 'scissors', every: 0.9 });
  }
  function hideAt(c, kind) {
    const W = N.wanted;
    if (kind === 'kirana' && wanted() >= 5) { use('hide:' + c.id); return { msg: 'Mummy, at the counter: "Agarwal-ji, is he behind the rice?" ...He is. Out you come.' }; }
    if (W && typeof W.hide === 'function') {
      use('hide:' + c.id);
      closeShop(true);
      let r = null;
      try { r = W.hide(kind, c.id); } catch (e) { N.err('shops.hide', e); }
      // wanted.hide -> {ok, line} (older stubs return a bool)
      const ok = r && typeof r === 'object' ? !!r.ok : r !== false;
      const line = r && typeof r === 'object' && r.line ? r.line : ok ? 'Behind the rice sacks. Do not sneeze.' : '';
      return { close: true, msg: line };
    }
    return progress(c, 'Hiding', TUNE.hideSecs, 'Behind the rice sacks. It smells of jute and washing powder. Do not sneeze.', () => {
      use('hide:' + c.id);
      const n = meterDown(1, 'hide');
      if (W && 'unseenT' in W) W.unseenT = Math.max(+W.unseenT || 0, 12);
      return n ? 'They walked right past! Chappal Meter −1.' : 'Nobody came. Out you come.';
    });
  }
  function backDoor(c) {
    use('back:' + c.id);
    const W = N.wanted;
    closeShop(true);
    if (W && typeof W.hide === 'function') { try { W.hide('backdoor', c.id, { teleport: true }); } catch (e) { N.err('shops.backdoor', e); } }
    else {
      const rp = N.world.nearestRoadPoint(c.x, c.y);
      let ax = 0, ay = 1;
      if (rp) { const dx = c.x - rp.x, dy = c.y - rp.y, dl = Math.hypot(dx, dy) || 1; ax = dx / dl; ay = dy / dl; }
      const f = N.world.findFree(c.x + ax * 40, c.y + ay * 40, 'walk', 30);
      if (f) N.player.teleport(f.x, f.y);
      if (W && 'unseenT' in W) W.unseenT = Math.max(+W.unseenT || 0, 6);
    }
    return { close: true, msg: '"Your Amma is outside? ...Back door is there." Out into the rear lane.' };
  }
  function brickGame(c, mode) {
    const MG = N.minigames;
    if (!MG || typeof MG.play !== 'function') return { msg: 'The machine is broken today. (Rupee back.)', refund: true };
    closeShop(true);
    MG.play('brickgame', { mode, place: c.id, difficulty: 0.4 }).then((r) => {
      if (!r || r.error || r.aborted) return;
      if (r.win) { earn(100, 'brickgame'); toast('FREE GAME! ₹1 back.', 2400); }
      const sc = r.score | 0, top = parlourTop(c.id);
      S.parlour[c.id] = Math.max(S.parlour[c.id] | 0, sc);
      if (sc > top[1] && !S.beaten[c.id]) { S.beaten[c.id] = true; goliTip(c); }
    }).catch((e) => N.err('shops.brick', e));
    return { close: true };
  }
  const PARLOUR = {
    video_parlour_1: [['TGR', 2140], ['PPU', 1650], ['AYS', 1420]],
    video_parlour_2: [['BLU', 1880], ['TGR', 1500], ['RKY', 990]],
    video_parlour_3: [['SNU', 1720], ['GLU', 1310], ['TGR', 1200]],
    video_parlour_4: [['AYS', 2010], ['TGR', 1960], ['MNI', 870]],
  };
  function parlourTop(id) { return (PARLOUR[id] || [['TGR', 1500]])[0]; }
  function scoreView(c) {
    const L = (PARLOUR[c.id] || [['TGR', 1500]]).slice();
    const mine = S.parlour[c.id] | 0;
    if (mine) L.push(['YOU', mine]);
    L.sort((a, b) => b[1] - a[1]);
    return { type: 'info', title: 'High-score board', html: '<ol class="shop-board">' + L.map((r) => '<li' + (r[0] === 'YOU' ? ' class="you"' : '') + '><b>' + esc(r[0]) + '</b><span>' + String(r[1]).padStart(4, '0') + '</span></li>').join('') + '</ol><p class="shop-note">Beat the top score and a parlour kid tells you where a goli is.</p>' };
  }
  function nearestUnfound(x, y, series) {
    const C = N.collectibles;
    if (!C || typeof C.nearestUnfound !== 'function') return null;
    let t = null;
    try { t = series ? C.nearestUnfound(x, y, series) : C.nearestUnfound(x, y); } catch (e) { t = null; }
    if (t && typeof t === 'string') { const it = (C.items && (C.items[t] || (Array.isArray(C.items) && C.items.find((q) => q.id === t)))) || null; t = it; }
    return t && isFinite(t.x) && isFinite(t.y) ? t : null;
  }
  function goliTip(c) {
    const t = nearestUnfound(c.x, c.y, 'golis') || nearestUnfound(c.x, c.y, 'goli') || nearestUnfound(c.x, c.y);
    if (!t) { toast('New top score! The parlour kids clap. (No goli tips left.)'); return; }
    try { N.hud.blip('shop:goli', { x: t.x, y: t.y }, { color: '#6fbf5a', icon: 'star', label: 'Goli tip', pulse: true }); } catch (e) { /* ignore */ }
    S.tipT = 60;
    toast('New top score! A parlour kid whispers where a goli is. (On your map for 60 s.)', 3600);
  }
  function panipuri(c) {
    const MG = N.minigames;
    if (!MG || typeof MG.play !== 'function') return { msg: 'Bhaiya is busy. (Money back.)', refund: true };
    closeShop(true);
    MG.play('panipuri', { place: 'gokul_chat', difficulty: 0.4 }).then((r) => {
      if (!r || r.error || r.aborted) return;
      const n = r.eaten || r.score || 0;
      if (n > S.gokulBest) S.gokulBest = n;
      if (N.flags) N.flags.gokul_record = S.gokulBest;
      if (r.win) { feed(15); toast('Free plate! ' + n + ' puris. Bhaiya is impressed. Record: ' + S.gokulBest + '.', 3200); }
      else toast('PAANI! PAANI! ' + n + ' puris this time.', 2600);
    }).catch((e) => N.err('shops.panipuri', e));
    return { close: true };
  }
  function haggle(c, who, params, onWin) {
    const MG = N.minigames;
    if (!MG || typeof MG.play !== 'function') return { msg: 'He is busy right now.' };
    const key = 'haggle:' + who + ':' + c.id;
    if (S.off && S.off[key] && absMin() < S.off[key]) return { msg: 'He is still sulking. Come back in a little while.' };
    const need = { banana: 1000, flower: 1200, books: 6000, farmer: ((params && params.list) || 36) * 100 }[who] || 1000;
    if ((N.player.money | 0) < need) return { msg: 'Bring at least ' + rs(need) + ' to haggle.' };
    closeShop(true);
    MG.play('bargain', Object.assign({ who, place: c.id }, params || {})).then((r) => {
      if (!r || r.error || r.aborted || r.quit) return;
      if (r.win) {
        const pay = r.pricePaise || (r.price | 0) * 100;
        const ch = charge(pay, { why: 'bargain' });
        if (!ch.ok) { toast('*Paise kam hain!* The deal is off.'); return; }
        if (onWin) onWin(r);
        N.emit('shop:buy', { place: c.id, item: 'bargain_' + who, price: pay, qty: 1, kind: c.kind });
        toast('Deal at ' + rs(pay) + '!' + (r.savedPaise ? ' Saved ' + rs(r.savedPaise) + '.' : ''), 3000);
      } else { S.off = S.off || {}; S.off[key] = absMin() + 10; toast('He waves you off. No deal for a while.', 2600); }
    }).catch((e) => N.err('shops.haggle', e));
    return { close: true };
  }
  function jukebox() {
    sfx('jukebox');
    const W = N.walkman;
    let songs = [];
    try { songs = W && typeof W.songs === 'function' ? W.songs() || [] : []; } catch (e) { songs = []; }
    if (songs.length && W && typeof W.play === 'function') {
      const s = songs[Math.floor(Math.random() * songs.length)];
      try { W.play(s && s.id ? s.id : s); } catch (e) { N.err('shops.jukebox', e); }
      return 'The jukebox arm clunks... and plays ' + (s && s.title ? '*' + s.title + '*' : 'one of your songs') + ' for the whole café.';
    }
    return 'The jukebox arm clunks and the whole café hums along. (Find cassettes to hear your own songs here.)';
  }
  function undeveloped() {
    const C = N.collectibles;
    try { if (C && typeof C.undeveloped === 'function') return C.undeveloped() || []; } catch (e) { /* stub */ }
    return [];
  }
  function develop() {
    const C = N.collectibles, ids = undeveloped();
    try { if (C && typeof C.develop === 'function') C.develop(ids, { place: UI.def && UI.def.id }); } catch (e) { N.err('shops.develop', e); }
    N.emit('shop:service', { place: UI.def && UI.def.id, service: 'develop', frames: ids.length });
    return '"Ready day after tomorrow." ' + ids.length + ' frame' + (ids.length === 1 ? '' : 's') + ' in the darkroom.';
  }
  const SHOP_KINDS = ['irani_cafe', 'bakery', 'iyengar_bakery', 'chai_bandi', 'samosa_bandi', 'dosa_bandi', 'coconut_cart', 'banana_cart', 'flower_cart', 'kite_stall', 'kirana', 'stationery', 'medical_shop', 'photo_studio', 'meat_shop', 'pindi_girni', 'shop', 'std_booth', 'barber', 'cycle_rent', 'internet_cafe', 'video_parlour', 'bus_stop'];
  function cityMap() {
    if (N.flags) N.flags.city_map = true;
    try {
      if (N.settings && typeof N.settings.set === 'function') {
        const K = Object.assign({}, (N.settings.get && N.settings.get('mapKinds')) || {});
        for (const k of SHOP_KINDS) if (!(k in K)) K[k] = true;
        N.settings.set('mapKinds', K);
      }
    } catch (e) { N.err('shops.citymap', e); }
    return 'A folded guide map with every shop on it. Open your map (M): shops and services are marked, with their hours.';
  }
  const TRIVIA = [
    'Numaish began in 1938 at Public Gardens and moved to the Nampally grounds in 1946.',
    'Secunderabad station opened on 9 October 1874.',
    'Hussain Sagar was built in 1562, almost thirty years before Charminar.',
    "Charminar's four clocks were added in 1889, about 300 years after it was built.",
    'The State Museum keeps one Egyptian mummy, over 2,000 years old.',
    'Birla Mandir was built with no bells, for quiet.',
    'The Buddha in Hussain Sagar is carved from a single block of white granite.',
    'Lakdikapul means "wooden bridge".',
    'Rythu Bazaars opened on Republic Day 1999 so farmers could sell straight to shoppers.',
    'Khairatabad is named after Princess Khairunnisa, who completed its mosque in 1626.',
    'Every Sunday the pavements of Abids become a second-hand book market.',
    "The High Court on the Musi's south bank opened on 20 April 1920.",
    'The marble Veiled Rebecca at the Salar Jung Museum was bought in Rome in 1876.',
  ];
  function triviaFact(seed) {
    const C = N.collectibles, vis = (N.flags && N.flags.visited) || {};
    if (C && typeof C.triviaFor === 'function') {
      const ids = Object.keys(vis).sort();
      for (let k = 0; k < ids.length; k++) {
        const id = ids[mod(seed + k, ids.length)];
        try { const t = C.triviaFor(id); if (t && typeof t === 'string') { if (typeof C.unlockTrivia === 'function') C.unlockTrivia(id); return { place: id, text: t }; } } catch (e) { /* ignore */ }
      }
    }
    return { place: null, text: TRIVIA[mod(seed, TRIVIA.length)] };
  }
  function trivia(c, kind) {
    const f = triviaFact((day() * 7 + (S.stats.buys | 0)) | 0);
    const head = kind === 'tinkle' ? 'A comic page: "Did you know?"' : kind === 'chandamama' ? 'A story page ends with a fact box:' : 'An old comic, page torn:';
    N.emit('trivia', { place: f.place, text: f.text, source: kind });
    setView({ type: 'info', title: kind === 'tinkle' ? 'Tinkle' : kind === 'chandamama' ? 'Chandamama' : 'Old comic', html: '<p class="shop-note">' + esc(head) + '</p><blockquote class="shop-fact">' + esc(f.text) + '</blockquote>' });
    return { keep: true };
  }
  function tvLine() {
    const d = date();
    if (d.y === 2003 && ((d.m === 2 && d.d >= 9) || (d.m === 3 && d.d <= 23))) {
      if (d.m === 3 && d.d === 23) return 'The World Cup final. The whole footpath has gone quiet. Nobody even says "Score?".';
      return pick(['Cricket! The crowd counts every run out loud. "Score? *Score kitta hua?*"', 'A boundary! Twenty strangers cheer like cousins.', 'A wicket falls. An uncle covers his eyes. A kid asks "Score?" anyway.']);
    }
    if (isDone('chand_raat')) return '*Khazana Hunt* special: "The Real Treasure Is Haleem." Professor Pasha eats a whole plate on camera.';
    return pick(['Professor Pasha: "Is there a tunnel from Charminar to Golconda? The Professor will find out! Sunday, Channel Seven!"', '*Khazana Hunt* promo: "Last week: no treasure. This week: MAYBE treasure!"', 'The Sunday film\'s title card. Everybody on the footpath reads it aloud together.']);
  }
  function museumLine(id) {
    if (id === 'state_museum') return 'Glass cases, stone gods, old coins. In one room, the mummy: two thousand years asleep. Walk, don\'t run.';
    if (id === 'salar_jung_museum') return 'Room after room of treasures. The marble Veiled Rebecca, bought in Rome in 1876. And the musical clock, waiting for the hour.';
    return 'Gifts and treasures of the Nizams, room after room. Walk slowly.';
  }
  function musicalClock(c) {
    const at = Math.ceil((mins() + 1) / 60) * 60;
    const strikes = ((Math.floor(at / 60) % 12) || 12);
    closeShop(true);
    ffwd(at - mins(), { label: 'THE CLOCK', ms: 1400 }).then(() => {
      for (let i = 0; i < strikes; i++) setTimeout(() => sfx('gong', { vol: 0.8 }), 400 + i * 650);
      toast('The little man comes out and strikes ' + strikes + '. The whole hall claps.', 4000);
      N.emit('shop:service', { place: c.id, service: 'musical_clock', strikes });
    });
    return { close: true };
  }
  const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const SERIES_COLOUR = { kite: 'kite-paper red', goli: 'marble green', cassette: 'cassette black', ticket: 'bus-ticket pink', frame: 'camera silver' };
  function seriesOf(t) {
    const s = String(t.series || t.id || '').toLowerCase();
    if (/kite/.test(s) || /^k\d/.test(s)) return 'kite';
    if (/goli/.test(s) || /^g\d/.test(s)) return 'goli';
    if (/cass/.test(s) || /^c\d/.test(s)) return 'cassette';
    if (/ticket/.test(s) || /^t\d/.test(s)) return 'ticket';
    if (/frame/.test(s) || /^f\d/.test(s)) return 'frame';
    return 'goli';
  }
  /** The weighing machine's printed fortune: the direction and series colour of the nearest unfound collectible. */
  function fortune(x, y) {
    const t = nearestUnfound(x, y);
    if (!t) return 'Your fortune: a good day for chai. Lucky direction: home. Lucky colour: Osmania-biscuit gold.';
    const a = Math.atan2(t.y - y, t.x - x);
    const dir = COMPASS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
    return 'Your fortune: something small and lost is waiting for you. Lucky direction: ' + dir + '. Lucky colour: ' + (SERIES_COLOUR[seriesOf(t)] || 'green') + '.';
  }
  function weigh(c) {
    sfx('weigh_machine');
    const kg = (30.4 + ((N.player.tummy == null ? 80 : N.player.tummy) / 100) * 1.6 + mod(day(), 3) * 0.1).toFixed(1);
    const f = fortune(c.x, c.y);
    N.emit('shop:service', { place: c.id, service: 'weigh', fortune: f });
    setView({ type: 'info', title: 'Weighing machine', html: '<div class="shop-ticket"><b>WEIGHT ' + kg + ' KG</b><span>' + esc(f) + '</span><i>Thank you. Visit again.</i></div>' });
    return { keep: true };
  }
  function platformTicket(id) { const k = resolve(id) || id; return S.platform[k] === day(); }

  /* ------------------------------------------------------------ internet café */
  const EMAILS = [
    { id: 'bunty_java', from: 'bunty_vamsi_2003', subject: 'Java notes (DO NOT PRINT)', body: 'Chinnu, if Mummy asks, I was at Ameerpet till nine. public static void main... sleep. Word of the day: nostalgia. Means a free email account. — Bunty-anna' },
    { id: 'chain_mail', from: 'forward_forward_99', subject: 'FW: FW: FW: send to 10 friends!!!', body: 'Send this to 10 friends or your cycle gets a puncture tomorrow. ...You have three friends with email. Your cycle is doomed.' },
    { id: 'vani_news', from: 'deccan_vani_fans', subject: 'Aapki Farmaish weekly', body: 'This week\'s top farmaish: "From the Amberpet Gully Cricket Club to their ball, lost in Sharma-garu\'s compound. RIP, ball." Postcards still welcome. Neat handwriting, please.' },
    { id: 'dallas', from: 'cousin_in_dallas', subject: 'Snow!!', body: 'It snowed here. Everything is white and nobody honks. I miss Osmania biscuits. Please send some. Customs will eat them, but please send.' },
  ];
  function inbox() {
    const out = [];
    for (const e of S.emails.concat(EMAILS)) {
      let ok = true;
      try { ok = !e.when || !!e.when(); } catch (er) { ok = false; }
      if (ok && !out.some((x) => x.id === e.id)) out.push(e);
    }
    return out;
  }
  function netSession(c, minutes) {
    const v = { type: 'list', title: 'Cyber Zone · ' + (minutes >= 60 ? '1 hour' : '15 minutes'), left: minutes, net: minutes, rows: null, empty: 'Timer is on.' };
    v.sub = () => 'timer ' + Math.max(0, Math.ceil(v.left)) + ' s · *kirrr-kshhh*';
    v.rows = netRows(c, v);
    sfx('dialup');
    setView(v);
    return { keep: true };
  }
  function netRows(c, v) {
    const rows = [];
    rows.push({ id: 'browse', name: 'Browse: a page about a place you have seen', price: 0, go: 'Open', act: () => { const f = triviaFact((S.stats.buys | 0) + day()); setView({ type: 'info', title: 'Hyderabad city guide (a very slow page)', html: '<blockquote class="shop-fact">' + esc(f.text) + '</blockquote>', net: true }); return { keep: true }; } });
    if (v.net >= 60) {
      rows.push({ id: 'search', name: 'Search the city guide for your clue', sub: 'a nudge in the right direction', price: 0, go: 'Search', act: () => { setView({ type: 'info', title: 'Search results', html: '<p class="shop-fact">' + esc(netHint()) + '</p>', net: true }); return { keep: true }; } });
      for (const e of inbox()) rows.push({ id: 'mail_' + e.id, name: (S.read[e.id] ? '' : '● ') + esc(e.subject), sub: 'from ' + e.from, price: 0, go: 'Read', act: () => { S.read[e.id] = true; N.emit('email:read', { id: e.id }); setView({ type: 'info', title: e.subject, html: '<p class="shop-mail-from">From: ' + esc(e.from) + '<br>To: chinnu_charminar2</p><p class="shop-mail">' + esc(subst(e.body)) + '</p>', net: true }); return { keep: true }; } });
    }
    return rows;
  }
  function netHint() {
    const H = N.hints, A = H && H.active;
    if (!A) return 'Search: "Hyderabad". 1,240 results. Page 1 is still loading. (No clue to look for right now.)';
    try {
      const spec = H.defs && H.defs[A.id];
      const t = (spec && (Array.isArray(spec) ? spec[0] : spec.ammamma)) || null;
      if (t) return 'Top result: ' + t;
    } catch (e) { /* ignore */ }
    const pl = A.answer && N.places[A.answer];
    return pl ? 'Top result: a page about the ' + pl.district.replace(/_/g, ' ') + ' area. (Promising.)' : 'Search: no results. The modem sighs.';
  }
  function netTick(dt) {
    let v = UI.view, k = UI.stack.length;
    let base = null;
    if (v && v.net) base = v;
    for (let i = UI.stack.length - 1; !base && i >= 0; i--) if (UI.stack[i] && UI.stack[i].net >= 15) base = UI.stack[i];
    void k;
    if (!base || !(base.net >= 15) || base.left == null) return;
    const before = Math.ceil(base.left);
    base.left -= dt;
    if (base.left <= 0 && !base.over) {
      base.over = true;
      UI.view = base; UI.stack = UI.stack.filter((x) => x !== base);
      base.rows = [
        { id: 'extra', name: 'Extra 15 minutes', price: 500, act: () => { base.left = 15; base.over = false; base.rows = netRows(UI.ctx, base); render(); return { keep: true, msg: '"Timer is on."' }; } },
        { id: 'logoff', name: 'Log off', price: 0, go: 'Bye', act: () => { UI.view = null; UI.stack = []; return 'Logged off. "Reading is free. Crying is also free."'; } },
      ];
      UI.sel = 0; flash('Time up! Extra 15 minutes is ₹5.', 'warn'); render();
    } else if (Math.ceil(base.left) !== before && UI.view === base) UI.dom.sub.innerHTML = '<b>' + emph(base.title) + '</b> · ' + emph(base.sub());
  }
  function backdropView(c) {
    const B = [['kashmir', 'Kashmir lake'], ['taj', 'The Taj'], ['charminar', 'Charminar at dusk']];
    return { type: 'list', title: 'Choose a painted backdrop', rows: B.map((b) => ({ id: 'bd_' + b[0], name: b[1], sub: S.sticker[b[0]] ? 'you have this sticker' : 'a Journal sticker', price: 1000,
      act: (cc) => progress(cc, 'Studio portrait', 3, '"Sit straight, chin up, *thoda left*... smile please!" FLASH.', () => { S.sticker[b[0]] = true; if (N.flags) N.flags['sticker_' + b[0]] = true; sfx('camera_flash'); N.emit('shop:service', { place: cc.id, service: 'portrait', backdrop: b[0] }); return '"Ready day after tomorrow." A sticker for your Journal: ' + b[1] + '.'; }) })) };
  }

  /* ------------------------------------------------------------ STD calls (§5.4) */
  const FAMILY = [
    'In a queue even God waits, *kanna*. Eat something and come home before the street lights.',
    'Your Amma made pulihora. If you are late, Chitti will eat your share. She is small, but she is fast.',
    'The kite flies because the string holds it, *kanna*. Come home on time.',
    '*Kanna*, this call costs a rupee. Say something useful. ...Okay. Love you also.',
  ];
  const NANI = [
    '*Hai Allah*, {nick}! Is Imran eating properly? Tell him Nani said eat.',
    'Kurnool is hot. Hotter than your Hyderabad. Don\'t argue, I have a thermometer.',
    'The samosa-ragda reached safely. The bus conductor ate one. I forgave him.',
    'Look after my Imran. And yourself. And your Amma\'s chappals, I hear they fly.',
    'When I was a girl, a trunk call meant somebody was getting married. Now you call to say hello. Good.',
    '*Khuda hafiz*, *beta*. Put the receiver down gently, these booth uncles get angry.',
  ];
  function playCall(lines) {
    sfx('radio_static', { vol: 0.22 });
    if (N.dialogue && typeof N.dialogue.play === 'function') { try { return Promise.resolve(N.dialogue.play(lines.map((l) => ({ s: l.s, t: subst(l.t) })))).catch(() => {}); } catch (e) { N.err('shops.call', e); } }
    toast(plain(lines.map((l) => subst(l.t)).join(' ')), 5000);
    return Promise.resolve();
  }
  function stdView(c) { return { type: 'list', title: 'STD / ISD / PCO', sub: 'the red meter counts the pulses', rows: stdRows() }; }
  function stdSave() {
    if (wanted() >= 3) return { msg: '"*Pehle* Mummy *ko sambhalo*, then save."' };
    if (N.missions && N.missions.active) return { msg: '"Save after the mission, *beta*."' };
    if (!N.save || typeof N.save.save !== 'function') return { msg: 'The booth\'s register is full today.' };
    let ok = false;
    try { ok = !!N.save.save({ reason: 'booth', toast: false }); } catch (e) { N.err('shops.save', e); }
    sfx(ok ? 'std_ring' : 'ui_back');
    if (ok) N.emit('shop:service', { place: UI.def && UI.def.id, service: 'save' });
    return { msg: ok ? 'SIDE A saved ●' + (N.save.available === false ? ' (this session only)' : '') + ' "Check the meter, take the bill, next!"' : '"Not now, *beta*."' };
  }
  function callHome(c) {
    closeShop(true);
    sfx('std_ring');
    const lines = [{ s: 'you', t: 'Hello? Ammamma? It\'s me, from a booth.' }];
    let h = null;
    try { if (N.hints && typeof N.hints.next === 'function') h = N.hints.next('std'); } catch (e) { h = null; }
    if (h && h.text) lines.push({ s: 'ammamma', t: h.text });
    else lines.push({ s: 'ammamma', t: FAMILY[mod(day(), FAMILY.length)] });
    const l = wanted();
    let down = false;
    if (l >= 1 && l <= 2 && !used('callhome')) { use('callhome'); down = true; lines.push({ s: 'you', t: '*Haan Mummy*, I\'m at Immu\'s. Doing homework.' }); }
    playCall(lines).then(() => { if (down && meterDown(1, 'phone_home')) toast('Chappal Meter −1. (For now.)', 2400); });
    N.emit('shop:service', { place: c.id, service: 'call_home', hint: !!(h && h.text) });
    return { close: true };
  }
  function callKurnool() {
    closeShop(true);
    sfx('std_ring');
    playCall([{ s: 'you', t: 'Trunk call to Kurnool, please. ...Nani? Salaam!' }, { s: 'nani', t: NANI[mod(day() + (S.stats.buys | 0), NANI.length)] }]);
    return { close: true };
  }
  function callVani() {
    closeShop(true);
    sfx('std_ring');
    let songs = [];
    try { songs = N.walkman && N.walkman.songs ? N.walkman.songs() || [] : []; } catch (e) { songs = []; }
    const s = songs.length ? songs[mod(day(), songs.length)] : null;
    toast('Deccan Vani: "A *farmaish* from {nick} of Lakshmi Nagar! This one is for the whole colony."'.replace('{nick}', (N.player && N.player.name) || 'Chinnu'), 4200);
    if (s && N.walkman && N.walkman.play) { try { N.walkman.play(s.id || s); } catch (e) { N.err('shops.vani', e); } }
    return { close: true };
  }
  function nannaWhy() {
    if (used('nanna')) return 'Once a day. "Don\'t tell Amma I said yes."';
    if (S.nanna || S.hail) return 'Someone is already on the way';
    const m = mins(), sun = dow() === 0 || !!(N.flags && N.flags.holiday);
    if (sun ? m < hm('07:00') || m > hm('21:30') : m < hm('18:30') || m > hm('21:30')) return sun ? 'Nanna comes 07:00–21:30 on Sundays' : 'Nanna is at the current office till 18:30';
    return null;
  }
  /* ---- A3: Bunty-anna's RX100, pillion only (the ladder's 60 finds: unlock_rx100) */
  const BUNTY_SPOTS = { chai_bandi_3: ['11:00', '16:00'], ameerpet_coaching: ['18:00', '21:00'] };
  function buntyUnlocked() { const F = N.flags || {}; return !!(F.unlock_rx100 || F.unlock_bunty_pillion || F.bunty_rx100 || finds() >= 60); }
  function buntyWhy() {
    if (used('bunty')) return 'Once a day. "Petrol is not free, *mamu*."';
    if (S.bunty || S.buntyJob || S.hail || S.nanna) return 'Someone is already on the way';
    if (wanted() >= 3) return 'Bunty-anna: "Police? *Nakko*, *mamu*."';
    const m = mins(), sun = dow() === 0 || !!(N.flags && N.flags.holiday);
    if (sun ? m < hm('09:00') || m > hm('21:30') : m < hm('16:00') || m > hm('21:30')) return sun ? 'Bunty-anna sleeps till nine on Sundays' : 'Bunty-anna is in college till four';
    return null;
  }
  function callBunty() {
    use('bunty');
    closeShop(true);
    sfx('std_ring');
    playCall([{ s: 'you', t: 'Bunty-anna? Can you pick me up? ...On the RX100?' }, { s: 'bunty', t: '*Tension nakko*, I\'m coming. Word of the day: nostalgia. Means "waiting for Bunty". Fifteen minutes.' }]).then(() => { S.bunty = { t: TUNE.buntyDelay }; });
    return { close: true };
  }
  function buntyArrive(near) {
    const look = N.npcs && N.npcs.look ? (() => { try { return N.npcs.look('bunty'); } catch (e) { return null; } })() : null;
    const job = summon({ type: 'bunty_rx100', look, bunty: true, near: !!near });
    if (!job) { toast('Bunty-anna couldn\'t find the road. Try another booth.', 2400); return null; }
    job.wait = 30;
    S.buntyJob = job;
    toast('*Dhug-dhug-DHOOM.* Bunty-anna\'s RX100 rattles round the corner.', 2400);
    return job;
  }
  function buntyRows() {
    const job = S.buntyJob, rows = [];
    for (const d of destinations()) rows.push({ id: 'to_' + d.id, name: d.name, sub: d.top ? 'the mission' : 'pillion, free · hold tight', price: 0, go: 'Go', mission: !!d.top, act: () => { autoGo(job, d, 0); return { close: true }; } });
    rows.push({ id: 'nakko', name: 'Never mind, Bunty-anna', price: 0, go: 'Bye', act: () => { autoLeave(job, 'Bunty-anna: "Okay, *mamu*. Nostalgia means \'never mind\'."'); return { close: true }; } });
    return rows;
  }
  /** Bunty's spots (his college chai in the day, the Java class in the evening): "Pillion with Bunty-anna". */
  function buntySpotTick() {
    const p = N.player;
    if (!p || p.vehicle || p.controlsLocked || S.ff || !buntyUnlocked() || N.state.mode !== 'play') return;
    for (const id in BUNTY_SPOTS) {
      const pl = N.places[id]; if (!pl) continue;
      const dist = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (dist > (pl.r || 20) + 24) continue;
      const hrs = BUNTY_SPOTS[id], m = mins();
      if (m < hm(hrs[0]) || m > hm(hrs[1]) || dow() === 0) continue;
      if (used('bunty') || S.bunty || S.buntyJob || S.hail || S.nanna || wanted() >= 3) continue;
      N.interact.offer({ label: 'Pillion with Bunty-anna', priority: 1, dist, use: () => { use('bunty'); toast('Bunty-anna: "Oye, *mamu*! Hop on. Helmet. HELMET."', 2400); buntyArrive(true); } });
      return;
    }
  }
  /**
   * A3: ride a working auto (or taxi) from the traffic as a passenger. vehicles.js offers "Ride auto
   * (fare)" next to a traffic auto with its driver; the auto card opens with the meter and "das upar".
   */
  function rideVehicle(v) {
    const p = N.player;
    if (!v || !v.alive || !p || p.vehicle || N.state.mode !== 'play' || UI.open || S.hail || S.ff || S.ride) return false;
    if (wanted() >= 3) { toast('The driver sees the chase... "Pochaiah is my cousin\'s friend. *Nakko.*"', 2800); return false; }
    if (N.traffic && typeof N.traffic.release === 'function') { try { N.traffic.release(v); } catch (e) { N.err('shops.release', e); } }
    if (N.vehicles && N.vehicles.stopDriving) N.vehicles.stopDriving(v);
    v.controller = null; v.noEnter = true; v.summoned = true;
    const job = { v, pick: { x: v.x, y: v.y }, t: 0, arrived: true, yada: v.type === 'yadagiri_auto', nanna: false, taxi: !!(v.taxi || (v.T && v.T.cls === 'car')), wait: 25 };
    S.hail = job;
    N.emit('auto:hail', { x: p.x, y: p.y, vehicle: v, yadagiri: job.yada, flagged: true });
    return openAuto(job) || true;
  }
  function callNanna() {
    use('nanna');
    closeShop(true);
    sfx('std_ring');
    playCall([{ s: 'you', t: 'Nanna? Can you come and get me? ...Please?' }, { s: 'nanna', t: '*Chuddam.* ...Stay there. Twenty minutes. Don\'t tell Amma I said yes.' }]).then(() => { S.nanna = { t: TUNE.nannaDelay }; });
    return { close: true };
  }

  /* ------------------------------------------------------------ cinemas (§5.15) */
  function filmFor(c) {
    const d = date();
    if (c.id === 'sandhya_theatre') return d.y === 2003 && (d.m < 2 || (d.m === 2 && d.d < 8)) ? FILMS[4] : FILMS[0];
    if (c.id === 'devi_theatre') return FILMS[1];
    const others = FILMS.slice(2), wk = Math.floor((day() + 3) / 7);
    return others[mod(U.strHash(c.id) + wk, others.length)];
  }
  function showsToday() { const L = SHOWS.slice(); if (dow() === 5) L.unshift('06:00'); return L; }
  function housefull(c, t) { if (!(dow() === 0 || dow() === 6)) return false; return U.hash2(Math.abs(U.strHash(c.id)) % 1009, day() * 31 + hm(t)) < 0.3; }
  function showFor(c) { const m = mins(); for (const t of showsToday()) if (hm(t) >= m - 15 && !housefull(c, t)) return t; return null; }
  function showWhy(c) {
    if (showFor(c)) return null;
    const m = mins();
    return showsToday().some((t) => hm(t) >= m - 15) ? 'HOUSEFULL! Every show today.' : 'No more shows today. First show 11:00' + (dow() === 4 ? ' (06:00 tomorrow, release day)' : '');
  }
  function filmSub(c) {
    const f = filmFor(c), t = showFor(c), m = mins();
    const full = showsToday().filter((x) => hm(x) >= m - 15 && housefull(c, x));
    return '*' + f.t + '*' + (t ? ' · ' + (hm(t) < m ? 'started ' + t : 'show at ' + t) : '') + (full.length && t && hm(full[0]) < hm(t) ? ' (' + full[0] + ' HOUSEFULL)' : '');
  }
  function watchFilm(c, seat) {
    const t = showFor(c), f = filmFor(c);
    return showCard(c, { poster: f, at: t, minutes: 180, note: (seat === 'balcony' ? 'Balcony' : 'Floor') + ' ticket · show at ' + t + ' · three hours in the dark', after: () => {
      const p = N.player;
      feed(0, { tummy: -15, quiet: true });
      if (p) p.energy = Math.min(100, p.tummy != null ? p.tummy : 100);
      let m = '*' + f.t + '*: whistles, popcorn, a hero who never misses. Energy full, tummy −15.';
      const l = wanted();
      if (l >= 1 && l <= 3 && !chaserNear(200)) { const n = meterDown(2, 'cinema'); if (n) m += ' Chappal Meter −' + n + '.'; }
      N.emit('shop:service', { place: c.id, service: 'film', film: f.t, seat });
      return m;
    } });
  }
  function docToday() { return DOCS[mod(day(), DOCS.length)]; }
  function watchDoc(c) {
    const f = docToday();
    return showCard(c, { poster: f, minutes: 60, note: 'The giant screen · one hour', after: () => { feed(0, { energy: 20, quiet: true }); N.emit('shop:service', { place: c.id, service: 'imax', film: f.t }); return '*' + f.t + '*: the screen so big it has no edges. Energy +20.'; } });
  }
  /** A show behind a painted poster: ▶ Watch passes the time (VHS ▶▶) and runs `after`. Backing out refunds. */
  function showCard(c, o) {
    const wait = o.at ? Math.max(0, hm(o.at) - mins()) : 0;
    const v = {
      type: 'poster', poster: o.poster, refund: c.lastPrice || 0, goLabel: '▶ ' + (o.goLabel || 'Watch'), goShort: '▶',
      note: o.note || ((o.at ? 'Show at ' + o.at + ' · ' : '') + (o.minutes >= 60 ? Math.round(o.minutes / 60) + (o.minutes >= 120 ? ' hours' : ' hour') : o.minutes + ' minutes')),
      go: () => {
        v.refund = 0;
        closeShop(true);
        if (o.sfx) sfx(o.sfx);
        if (o.shake && N.render && N.render.shake && !reduced()) N.render.shake(2.2, 1.2);
        ffwd(wait + o.minutes, { label: o.poster && o.poster.t, ms: 2200, mid: o.home ? () => { const h = N.places.home; if (h) N.player.teleport(h.x, h.y); } : null }).then(() => {
          let m = null;
          try { m = o.after ? o.after() : null; } catch (e) { N.err('shops.show', e); }
          if (m) toast(plain(m), 4200);
        });
      },
    };
    if (!UI.open) { v.go(); return null; } // bought without the card (N.shops.buy): straight in
    setView(v);
    return { keep: true };
  }

  /* ============================================================ fast-forward */
  function passMinutes(n) {
    let m = N.clock.minutes + n;
    while (m >= 1440) { m -= 1440; N.clock.minutes = 0; N.clock.nextDay(); }
    N.clock.minutes = m;
    N.emit('clock:set', N.clock.minutes);
  }
  let ffEl = null;
  function ffOverlay(on, label) {
    const ui = document.getElementById('ui');
    if (!ffEl && ui) ffEl = el('div', 'shop-ff', ui, '<b>▶▶ FF</b><span class="ff-lbl"></span><span class="ff-clock"></span>');
    if (!ffEl) return;
    ffEl.querySelector('.ff-lbl').textContent = label ? String(label).toUpperCase() : '';
    ffEl.classList.toggle('show', !!on);
  }
  /** Pass `minutes` of game time with the VHS ▶▶ look; o.mid() runs halfway (teleports). */
  function ffwd(minutes, o) {
    o = o || {};
    minutes = Math.max(0, Math.round(minutes || 0));
    if (S.ff) { passMinutes(minutes); if (o.mid) { try { o.mid(); } catch (e) { N.err('shops.ffmid', e); } } return Promise.resolve(true); }
    return new Promise((resolve) => {
      const p = N.player;
      S.ff = { t: 0, ms: Math.max(300, o.ms || 1800), minutes, from: mins(), mid: o.mid, applied: false, resolve, locked: !!(p && p.controlsLocked), vhs0: (N.render && N.render.fx && N.render.fx.vhs) || 0 };
      if (p) p.controlsLocked = true;
      N.clock.hold('shops-ff', true);
      ffOverlay(true, o.label);
      sfx('rewind', { pitch: 1.15 });
      N.emit('time:skip', { minutes, why: o.label || 'ff' });
    });
  }
  function ffTick(dt) {
    const F = S.ff; if (!F) return;
    F.t += dt * 1000;
    const k = U.clamp(F.t / F.ms, 0, 1);
    if (N.render && N.render.fx) N.render.fx.vhs = reduced() ? F.vhs0 : Math.max(F.vhs0, Math.sin(k * Math.PI) * 0.8);
    if (ffEl) ffEl.querySelector('.ff-clock').textContent = fmtHM(F.from + F.minutes * (F.applied ? 1 : Math.min(1, k * 2)));
    if (!F.applied && k >= 0.5) { F.applied = true; passMinutes(F.minutes); if (F.mid) { try { F.mid(); } catch (e) { N.err('shops.ffmid', e); } } }
    if (k >= 1) {
      S.ff = null;
      if (N.render && N.render.fx) N.render.fx.vhs = F.vhs0;
      N.clock.hold('shops-ff', false);
      const p = N.player; if (p && !F.locked) p.controlsLocked = false;
      ffOverlay(false);
      F.resolve(true);
    }
  }

  /* ================================================================ travel */
  const TRIVIA_BY_STAGE = {
    1: "Koti gets its name from the British Residency's kothi (mansion) of 1803, a women's college since 1949.",
    2: 'Every Sunday the pavements of Abids become a second-hand book market.',
    3: 'Numaish began in 1938 at Public Gardens and moved to the Nampally grounds in 1946.',
    4: 'Lakdikapul means "wooden bridge", after a bridge over the railway partly made of wood.',
    5: 'Rythu Bazaars opened on Republic Day 1999 so farmers could sell straight to shoppers.',
    6: 'Paradise began in 1953 as a canteen beside the Paradise cinema, and the junction took its name.',
    7: 'Secunderabad station opened on 9 October 1874, built by the Nizam\'s Guaranteed State Railway.',
    8: "RTC X Roads takes its name from Bus Bhavan, the bus corporation's headquarters nearby.",
    9: "Charminar's four clocks were added in 1889, about 300 years after it was built.",
    10: 'Hussain Sagar was built in 1562, almost thirty years before Charminar.',
    11: "The High Court on the Musi's south bank opened on 20 April 1920.",
    12: 'Khairatabad is named after Princess Khairunnisa, who completed its mosque in 1626.',
  };
  const HUBS = ['koti_bus_stand', 'imlibun_bus_station', 'rathifile_bus_station', 'cbs_hangar', 'mehdipatnam_bus_terminus'];
  // Ticket Thatha's twelve stages (bible §6.4): ticket n unlocks its stop for bus fast travel
  const STAGES = [
    [1, 'bus_stop_1', 'Stage 1: where a British mansion became a college.'], [2, 'bus_stop_2', 'Stage 2: where the footpath turns into a library every Sunday.'],
    [3, 'bus_stop_3', 'Stage 3: where the fair moved to in 1946.'], [4, 'bus_stop_4', 'Stage 4: the bridge named after wood.'],
    [5, 'bus_stop_5', 'Stage 5: where farmers sell with no middlemen.'], [6, 'bus_stop_7', 'Stage 6: named after a canteen next to a cinema.'],
    [7, 'bus_stop_8', 'Stage 7: the station older than every bus.'], [8, 'bus_stop_9', 'Stage 8: named after my own office.'],
    [9, 'bus_stop_13', 'Stage 9: where four clocks came three hundred years late.'], [10, 'bus_stop_14', 'Stage 10: a lake older than Charminar.'],
    [11, 'bus_stop_17', 'Stage 11: where the judges sit in striped stone.'], [12, 'bus_stop_18', 'Stage 12: the place named after a princess.'],
  ].map((s) => ({ n: s[0], stop: s[1], riddle: s[2], trivia: TRIVIA_BY_STAGE[s[0]] || '' }));
  function stageOf(stopId) { return STAGES.find((s) => s.stop === stopId) || null; }
  function stageFound(st) { const n = st.n; return colHas(['ticket_' + n, 'ticket_' + pad2(n), 'T' + pad2(n), 't' + pad2(n), 'T' + n]) || !!(N.flags && N.flags['ticket_' + n]); }
  function ticketsFound() { return STAGES.filter(stageFound).length; }
  function ticketsOn() { return busUnlocked() || !!(N.flags && N.flags.tickets_unlocked); }
  function busUnlocked() { return !!(N.flags && (N.flags.bus_unlocked || N.flags.unlock_bus)) || isDone('right_right'); }
  function hubOpen(id) {
    if (!busUnlocked()) return false;
    if (id === 'mehdipatnam_bus_terminus') return !!(N.flags && N.flags.bus_mehdipatnam) || isDone('the_clap');
    return true;
  }
  function golcondaBus() { return busUnlocked() && (!!(N.flags && N.flags.bus_golconda) || isDone('the_clap')); }
  function unlockBus(which) {
    if (!N.flags) return;
    if (!which || which === 'all') N.flags.bus_unlocked = true;
    else if (/mehdi/.test(which)) N.flags.bus_mehdipatnam = true;
    else if (/golconda/.test(which)) N.flags.bus_golconda = true;
    if (!which) toast('Bus fast travel unlocked: Koti, Imlibun, Rathifile, Gowliguda.', 3200);
  }
  function busFare() { return inv('ticket_punch') ? 0 : TUNE.busPrice; }
  function busDests(fromId) {
    const out = [];
    for (const h of HUBS) {
      const p = N.places[h]; if (!p || h === fromId) continue;
      out.push({ id: h, name: p.name.replace(/\s*\(.*\)\s*$/, ''), sub: 'bus station', why: hubOpen(h) ? null : h === 'mehdipatnam_bus_terminus' ? 'Opens after Golconda' : 'Ride with Ticket Thatha first' });
    }
    if (N.places.golconda_fort && fromId !== 'golconda_fort') out.push({ id: 'golconda_fort', name: 'Golconda Fort gate', sub: 'the fort bus', why: golcondaBus() ? null : 'After Golconda (the clap)' });
    for (const st of STAGES) {
      const p = N.places[st.stop]; if (!p || st.stop === fromId) continue;
      const found = stageFound(st);
      out.push({ id: st.stop, name: found ? 'Stage ' + st.n + ': ' + p.name : 'Stage ' + st.n + ': ?', sub: found ? 'a stage you unlocked' : "find Ticket Thatha's ticket at this stop", why: !busUnlocked() ? 'Ride with Ticket Thatha first' : found ? null : 'Locked: find the ticket behind its board' });
    }
    return out;
  }
  function busView(c) {
    const fare = busFare();
    return {
      type: 'list', title: 'Route board', sub: busUnlocked() ? (fare ? rs(fare) + ' a ride' : 'free rides: Thatha\'s punch') + ' · ▶▶ to the stop' : 'Ticket Thatha at Koti knows every stage',
      empty: 'No routes from here yet.',
      rows: busDests(c.id).map((d) => ({ id: 'bus_' + d.id, name: d.name, sub: d.sub, price: fare, go: fare ? rs(fare) : 'Ride', when: () => d.why, act: () => { busTo(d.id, { from: c.id, paid: true }); return { close: true }; } })),
    };
  }
  /** Ride a bus to a hub / stop (fast travel). The fare is charged here unless opts.paid / opts.free. */
  function busTo(destId, o) {
    o = o || {};
    const p = N.places[destId];
    if (!p) return Promise.resolve(false);
    if (!o.paid && !o.free) { const ch = charge(busFare(), { why: 'bus' }); if (!ch.ok) { toast(plain(ch.why)); return Promise.resolve(false); } }
    closeShop(true);
    const route = pick(['127K', '8A', '9X', '49M', '5K', '1Z', '65G', '219'], U.strHash(destId));
    sfx('conductor');
    N.emit('bus:ride', { from: o.from || null, to: destId, route });
    return travelTo({ id: destId, x: p.x, y: p.y, name: p.name }, { mode: 'bus', label: 'BUS ' + route + ' → ' + p.name.replace(/\s*\(.*\)\s*$/, ''), route }).then((ok) => { toast('"*Right, right!*" ' + p.name.replace(/\s*\(.*\)\s*$/, '') + '.', 2400); return ok; });
  }
  function laneSpot(rp, side) {
    const a = rp.angle, w = (rp.road && rp.road.w) || 32;
    const lx = Math.sin(a), ly = -Math.cos(a); // left of travel
    return { x: rp.x + lx * (w / 4) * (side || 1), y: rp.y + ly * (w / 4) * (side || 1), angle: a };
  }
  /** Teleport with the VHS ▶▶: dest {x, y, name, id}; o.mode 'bus' | 'auto' | 'nanna'; o.vehicle pulls away. */
  function travelTo(dest, o) {
    o = o || {};
    const p = N.player;
    const V = N.vehicles;
    const dist = V && V.roadDistance ? V.roadDistance(p.x, p.y, dest.x, dest.y) : Math.hypot(dest.x - p.x, dest.y - p.y) * 1.3;
    const speed = o.mode === 'bus' ? TUNE.busSpeed : o.mode === 'nanna' ? 128 : o.mode === 'bunty' ? 150 : TUNE.autoSpeed;
    const minutes = o.minutes != null ? o.minutes : Math.max(2, Math.round(dist / speed));
    if (UI.open) closeShop(true);
    if (p.vehicle && V) V.exit(p, true);
    // another ride: an auto (or Nanna) still waiting at the kerb gives up
    for (const key of ['hail', 'nannaJob', 'buntyJob']) { const j = S[key]; if (j && !j.riding && j.v !== o.vehicle) autoLeave(j); }
    return ffwd(minutes, { ms: o.mode === 'bus' ? TUNE.busFxMs : TUNE.autoFxMs, label: o.label, mid: () => arrive(dest, o) }).then(() => {
      N.emit('travel', { mode: o.mode || 'auto', to: dest.id || null, minutes });
      return true;
    });
  }
  function arrive(dest, o) {
    const p = N.player, W = N.world;
    const rp = W.nearestRoadPoint(dest.x, dest.y);
    let ax = dest.x, ay = dest.y;
    if (o.mode !== 'bus' && rp && rp.dist < 160 && rp.dist > 1) {
      const dx = dest.x - rp.x, dy = dest.y - rp.y, dl = Math.hypot(dx, dy) || 1, off = Math.min(dl, ((rp.road && rp.road.w) || 32) / 2 + 6);
      ax = rp.x + (dx / dl) * off; ay = rp.y + (dy / dl) * off;
    }
    p.teleport(ax, ay);
    if (!rp || !N.vehicles) return;
    const q = W.nearestRoadPoint(p.x, p.y) || rp;
    const s = laneSpot(q, 1);
    let v = o.vehicle && o.vehicle.alive ? o.vehicle : null;
    if (v) { v.x = s.x; v.y = s.y; v.angle = s.angle; v.vx = v.vy = v.av = 0; v.okX = null; }
    else if (o.mode === 'bus') v = N.vehicles.spawn('bus', s.x, s.y, s.angle, { driver: true, route: o.route });
    if (v) depart(v);
  }
  // a vehicle that drops the player off drives away along the roads and disappears out of view
  function depart(v) {
    const R = N.world.roads;
    if (!R || !N.vehicles.driveTo) { S.leaving.push({ v, t: 0 }); return; }
    const n = R.nearestNode(v.x + Math.cos(v.angle) * 60, v.y + Math.sin(v.angle) * 60);
    const route = n ? R.randomRoute(n, 6) : [];
    const pts = [[v.x, v.y]].concat(route.map((q) => [q.x, q.y]));
    if (pts.length > 1) N.vehicles.driveTo(v, pts, { timeout: 30, speed: 70, warp: false, stop: true });
    S.leaving.push({ v, t: 0 });
  }

  /* ---------------------------------------------------- "AUTO!" (systems §1.5, §3.6) */
  KINDS.auto_ride = {
    title: 'Auto-rickshaw', verb: 'Auto', keeper: 'auto_driver', icon: 'auto', hours: [['00:00', '24:00']], virtual: true,
    lines: ['*Kidhar jaana?*', 'Meter? Meter is sleeping. *Das upar*, chalo.', 'Sit, sit. Mind the rod.'],
    rowsFn: (def) => autoRows(def),
  };
  KINDS.bunty_ride = {
    title: "Bunty-anna's RX100", verb: 'Bunty', keeper: 'bunty', icon: 'cycle', hours: [['00:00', '24:00']], virtual: true,
    lines: ['Helmet. Always. Sit BEHIND me, *mamu*.', 'Word of the day: nostalgia. Means "pillion". *Kidhar?*', 'Hold my jacket, not my hair.'],
    rowsFn: () => buntyRows(),
  };
  KINDS.nanna_ride = {
    title: "Nanna's Chetak", verb: 'Nanna', keeper: 'nanna', icon: 'cycle', hours: [['00:00', '24:00']], virtual: true,
    lines: ['Sit properly. Hold my shoulder. *Ekkadiki?*', 'Not too far. Your Amma thinks I went for milk.'],
    rowsFn: (def) => nannaRows(def),
  };
  const NOT_DEST = new Set(['hidden', 'giver', 'junction', 'stairs', 'terrace', 'district', 'edge', 'festival', 'bus_stop', 'viewpoint']);
  const DEST_RANK = { home: 0, landmark: 1, market: 1, park: 1, transport: 1, museum: 1, plaza: 1, cinema: 2, food: 2, irani_cafe: 2, temple: 3, mosque: 3, church: 3, dargah: 3 };
  function missionTarget() {
    try { const m = N.missions && N.missions.markers ? N.missions.markers() : []; const g = m.find((x) => x.kind === 'goal'); if (g) return { id: '_goal', name: 'Where the mission wants you', x: g.x, y: g.y, top: true }; } catch (e) { /* ignore */ }
    return null;
  }
  function destinations() {
    const p = N.player, out = [];
    const tg = missionTarget(); if (tg) out.push(tg);
    try { const wp = N.menus && N.menus.waypointPos; if (wp) out.push({ id: '_wp', name: 'Your map waypoint', x: wp.x, y: wp.y, top: true }); } catch (e) { /* ignore */ }
    const vis = (N.flags && N.flags.visited) || {};
    const cand = [];
    const add = (id) => {
      const pl = N.places[id];
      if (!pl || NOT_DEST.has(pl.kind) || aliasOf[id]) return;
      if (Math.hypot(pl.x - p.x, pl.y - p.y) < 240) return;
      cand.push({ id, name: pl.name.replace(/\s*\(.*\)\s*$/, ''), x: pl.x, y: pl.y, rank: DEST_RANK[pl.kind] != null ? DEST_RANK[pl.kind] : 4 });
    };
    add('home');
    for (const id in vis) if (id !== 'home') add(id);
    cand.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return out.concat(cand.slice(0, 60));
  }
  /** Meter = ₹6 for the first map-km + ₹4 per extra map-km (rounded up to ₹1), ×1.5 at night; he asks meter + ₹10. */
  function autoFare(x0, y0, x1, y1) {
    const V = N.vehicles;
    const dist = V && V.roadDistance ? V.roadDistance(x0, y0, x1, y1) : Math.hypot(x1 - x0, y1 - y0) * 1.3;
    const km = dist / TUNE.mapKm;
    let meter = TUNE.autoFirst + Math.max(0, km - 1) * TUNE.autoPerKm;
    const m = mins();
    if (m >= hm('22:00') || m < hm('05:00')) meter *= TUNE.autoNight;
    meter = Math.ceil(meter / 100) * 100;
    return { meter, ask: meter + TUNE.autoAsk, dist, km };
  }
  function autoRows(def) {
    const job = S.hail;
    const rows = [];
    if (job && job.yada && N.hints && N.hints.active) {
      rows.push({ id: 'clue_drop', name: 'Clue drop: "Meter nakko, for you *paanch*."', sub: 'near the answer to your clue', price: 500, house: true, mission: true,
        when: () => (wanted() >= 3 ? 'Not during a chase' : null),
        act: () => {
          let h = null;
          try { h = N.hints.next('auto'); } catch (e) { h = null; }
          const t = h && (h.target || h.place);
          const pt = t && (typeof t === 'string' ? N.places[t] : t);
          if (!h || h.refused || !pt || !isFinite(pt.x)) return { msg: (h && h.text) || '"Even Yadagiri doesn\'t know this one."', refund: true };
          autoGo(job, { id: '_clue', name: 'near the answer', x: pt.x, y: pt.y }, 0, h.text);
          return { close: true };
        } });
    }
    for (const d of destinations()) {
      const f = autoFare(N.player.x, N.player.y, d.x, d.y);
      rows.push({ id: 'to_' + d.id, name: d.name, sub: (d.top ? 'mission · ' : '') + f.km.toFixed(1) + ' km · meter ' + rs(f.meter), price: 0, go: 'Go', mission: !!d.top, act: () => { setView(quoteView(job, d)); return { keep: true }; } });
    }
    rows.push({ id: 'nakko', name: '*Nakko* (send him away)', price: 0, go: 'Bye', act: () => { autoLeave(job, 'Okay, okay. *Chalo.*'); return { close: true }; } });
    return rows;
  }
  function quoteView(job, d) {
    const f = autoFare(N.player.x, N.player.y, d.x, d.y);
    const yada = job && job.yada;
    const ask = yada ? f.meter : f.ask;
    return {
      type: 'list', title: 'To ' + d.name, sub: f.km.toFixed(1) + ' km · meter ' + rs(f.meter) + (yada ? ' · Yadagiri goes by the meter' : ' · he asks ' + rs(f.ask) + ', "*Meter nakko, das upar*"'),
      rows: [
        { id: 'pay', name: 'Pay ' + rs(ask) + (yada ? ' (by the meter)' : ' (*das upar*)'), price: ask, house: true, act: () => { autoGo(job, d, ask); return { close: true }; } },
        { id: 'bargain', name: '*Mol-bhaav*: bargain him to the meter', sub: 'he likes people from his own area', price: 0, hidden: () => !!yada || !(N.minigames && N.minigames.play), act: () => { autoBargain(job, d, f); return { close: true }; } },
        { id: 'nakko', name: '*Nakko*', sub: 'walk away', price: 0, go: 'Bye', act: () => { autoLeave(job, '"*Jao jao.* Bahut auto hai."'); return { close: true }; } },
      ],
    };
  }
  function autoBargain(job, d, f) {
    closeShop(true);
    // the scene's stand board: the nearest big stand the minigame knows (it falls back to KOTI)
    let stand = 'koti_bus_stand', sd = 1e18;
    for (const id of ['koti_bus_stand', 'rtc_x_roads', 'nampally_station', 'kachiguda_station', 'imlibun_bus_station']) {
      const P = N.places && N.places[id]; if (!P) continue;
      const dd = (P.x - N.player.x) ** 2 + (P.y - N.player.y) ** 2; if (dd < sd) { sd = dd; stand = id; }
    }
    N.minigames.play('bargain', { who: 'auto', meter: Math.round(f.meter / 100), dest: d.name, place: stand, what: 'the ride to ' + d.name }).then((r) => {
      if (!job || !job.v || !job.v.alive) return;
      if (r && r.win) {
        const price = r.pricePaise || (r.price | 0) * 100 || f.meter;
        const ch = charge(price, { why: 'auto' });
        if (!ch.ok) { autoLeave(job, '"No money? *Chal hatt.*"'); return; }
        autoGo(job, d, price);
      } else if (r && (r.quit || r.aborted || r.error)) { openAuto(job); }
      else autoLeave(job, '"*Chal hatt!* Mera time kharab kiya."');
    }).catch((e) => N.err('shops.autoBargain', e));
  }
  function autoGo(job, d, price, note) {
    closeShop(true);
    if (!job || !job.v) return;
    job.riding = true;
    N.emit('auto:ride', { to: d.id, price, yadagiri: !!job.yada });
    travelTo(d, { mode: job.nanna ? 'nanna' : job.bunty ? 'bunty' : 'auto', vehicle: job.v, label: (job.nanna ? 'NANNA' : job.bunty ? 'BUNTY-ANNA' : job.taxi ? 'TAXI' : 'AUTO') + ' → ' + d.name }).then(() => {
      if (job.bunty) {
        toast('Bunty-anna: "Reached! Don\'t tell Mummy. Word of the day: nostalgia. Means a free ride."', 3200);
      } else if (job.nanna) {
        const l = wanted();
        if (l >= 1 && l <= 3) { meterDown(3, 'nanna'); toast('Nanna: "Your Amma doesn\'t need to know." ...She will know.', 3600); }
        else toast('Nanna: "Go. Come home before the street lights."', 2800);
      } else toast((price ? rs(price) + '. ' : '') + (note ? plain(note) : '"*Chalo*, here you are."'), 3000);
      if (S.hail === job) S.hail = null;
      if (S.nannaJob === job) S.nannaJob = null;
      if (S.buntyJob === job) S.buntyJob = null;
    });
  }
  function autoLeave(job, line) {
    if (!job) return;
    if (line) toast(plain(line), 2400);
    if (job.v && job.v.alive) depart(job.v);
    if (S.hail === job) S.hail = null;
    if (S.nannaJob === job) S.nannaJob = null;
    if (S.buntyJob === job) S.buntyJob = null;
  }
  function openAuto(job) {
    if (!job || !job.v || !job.v.alive) return false;
    const kind = job.nanna ? 'nanna_ride' : job.bunty ? 'bunty_ride' : 'auto_ride';
    const def = { id: job.nanna ? 'nanna' : job.bunty ? 'bunty' : 'auto', kind, K: KINDS[kind], place: { x: job.v.x, y: job.v.y }, name: job.nanna ? "Nanna's Chetak" : job.bunty ? "Bunty-anna's RX100" : job.yada ? "Yadagiri-anna's auto" : job.taxi ? 'Taxi' : 'Auto-rickshaw', x: job.v.x, y: job.v.y, r: 30, virtual: true };
    if (job.taxi) def.K = Object.assign({}, KINDS.auto_ride, { title: 'Taxi', lines: ['*Kahan jaana*, *beta*? Meter is honest. Mostly.', 'Sit at the back. Don\'t touch the trunks.'] });
    if (job.yada) def.K = Object.assign({}, KINDS.auto_ride, { keeper: 'yadagiri', lines: ['*Meter nakko*, for you *paanch*.', 'Exact change, *tammudu*. Always exact change.'] });
    return openVirtual(def);
  }
  function openVirtual(def) {
    const md = N.state.mode;
    if (md !== 'play') return false;
    if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) return false;
    ensureDom();
    if (UI.open) closeShop(true);
    UI.open = true; UI.def = def; UI.ctx = Object.assign(ctxOf(def), { opts: {} }); UI.view = null; UI.stack = []; UI.sel = 0; UI.qty = {}; UI.msg = ''; UI.busy = false;
    keeperLine(def, null, true);
    N.state.push('dialogue'); UI.pushed = true;
    N.clock.hold('shop', true); freeze(true);
    UI.root.classList.add('show'); document.body.classList.add('shop-open');
    render();
    sfx('auto_horn', { vol: 0.5 });
    N.emit('shop:open', { place: def.id, kind: def.kind });
    return true;
  }
  /** Find a spot on a road out of view, ~r u from the player, for a summoned vehicle to start from. */
  function startSpot(p, pick, near) {
    const W = N.world;
    if (near) {
      const rp = W.nearestRoadPoint(pick.x, pick.y);
      if (rp) { const s = laneSpot(rp, 1); const bx = s.x - Math.cos(rp.angle) * 50, by = s.y - Math.sin(rp.angle) * 50; if (W.isDrivable(bx, by) && !W.collide(bx, by, 8, 'drive').hit) return { x: bx, y: by, angle: rp.angle }; }
      return { x: pick.x, y: pick.y, angle: 0 };
    }
    const a0 = Math.random() * TAU;
    for (let k = 0; k < 20; k++) {
      const a = a0 + (k / 20) * TAU, r = TUNE.autoSpawnR + (k % 3) * 60;
      const q = W.nearestRoadPoint(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      if (!q || q.dist > 60) continue;
      const s = laneSpot(q, 1);
      if (N.render.inView(s.x, s.y, 30) || Math.hypot(s.x - p.x, s.y - p.y) < 150) continue;
      if (!W.isDrivable(s.x, s.y) || W.collide(s.x, s.y, 8, 'drive').hit) continue;
      const toP = Math.atan2(pick.y - s.y, pick.x - s.x);
      return { x: s.x, y: s.y, angle: Math.abs(U.angleDiff(q.angle, toP)) < Math.PI / 2 ? q.angle : q.angle + Math.PI };
    }
    return null;
  }
  function summon(o) {
    const p = N.player, W = N.world, V = N.vehicles;
    if (!V || !V.spawn) return null;
    const rp = W.nearestRoadPoint(p.x, p.y);
    if (!rp) return null;
    const dx = p.x - rp.x, dy = p.y - rp.y, dl = Math.hypot(dx, dy) || 1;
    const edge = Math.max(0, Math.min(dl, ((rp.road && rp.road.w) || 32) / 2 - 7));
    let pick = { x: rp.x + (dx / dl) * edge, y: rp.y + (dy / dl) * edge };
    if (!W.isDrivable(pick.x, pick.y) || W.collide(pick.x, pick.y, 6, 'drive').hit) pick = { x: rp.x, y: rp.y };
    let st = startSpot(p, pick, o.near) || startSpot(p, pick, true);
    if (!st) return null;
    let v = null;
    if (!o.near && !o.type && N.traffic && typeof N.traffic.claimAuto === 'function') { try { v = N.traffic.claimAuto(p.x, p.y, 250, { yadagiri: !!o.yada }); } catch (e) { v = null; } }
    if (!v) v = V.spawn(o.type || 'auto', st.x, st.y, st.angle, { driver: { look: o.look || N.people.randomLook(null, 'man'), npc: true }, owned: true, label: o.label || null });
    if (!v) return null;
    v.noEnter = true; v.summoned = true;
    const job = { v, pick, t: 0, arrived: false, yada: !!o.yada, nanna: !!o.nanna, bunty: !!o.bunty, wait: 25 };
    const go = V.driveTo ? V.driveTo(v, pick, { r: 16, timeout: TUNE.autoTimeout, speed: o.near ? 40 : 85 }) : Promise.resolve(false);
    go.then((ok) => {
      if (!v.alive) return;
      if (!ok && Math.hypot(v.x - pick.x, v.y - pick.y) > 40) { const f = W.findFree(pick.x, pick.y, 'drive', 12); if (f && !W.collide(f.x, f.y, v.T.cr, 'drive').hit) { v.x = f.x; v.y = f.y; v.okX = null; v.vx = v.vy = 0; } }
      job.arrived = true;
      if (N.audio && N.audio.horn) { try { N.audio.horn(v, { x: v.x, y: v.y }); } catch (e) { /* ignore */ } }
    });
    return job;
  }
  /** "AUTO!": hail an auto to the nearest road (horn on foot within 40 u of a road). */
  function hailAuto(o) {
    o = o || {};
    const p = N.player;
    if (!p || p.vehicle || N.state.mode !== 'play' || S.hail || S.ride || S.ff) return false;
    if (respectAt(p.x, p.y)) return false;
    const rp = N.world.nearestRoadPoint(p.x, p.y);
    if (!rp || (rp.dist > TUNE.autoReach && !o.stand)) return false;
    if (wanted() >= 3) { toast('An auto slows down... sees the chase... "Pochaiah is my cousin\'s friend. *Nakko.*"', 3000); return false; }
    let yada = !!o.yadagiri;
    try { if (!yada && N.hints && N.hints.active && !N.hints.active.off) yada = true; } catch (e) { /* ignore */ }
    const look = yada && N.npcs && N.npcs.look ? (() => { try { return N.npcs.look('yadagiri'); } catch (e) { return null; } })() : null;
    const job = summon({ type: yada ? 'yadagiri_auto' : 'auto', yada, look, near: !!o.stand });
    if (!job) { toast('No autos around here. Try a bigger road.', 2200); return false; }
    S.hail = job;
    N.emit('auto:hail', { x: p.x, y: p.y, vehicle: job.v, yadagiri: yada });
    if (!o.stand) toast(yada ? 'AUTO! ...a yellow-black auto with YADAGIRI on the back turns towards you.' : 'AUTO! ...one is turning round for you.', 2400);
    return true;
  }
  function autoStand() { closeShop(true); setTimeout(() => hailAuto({ stand: true }), 50); return { close: true }; }
  function nannaRows() {
    const job = S.nannaJob, rows = [];
    for (const d of destinations()) rows.push({ id: 'to_' + d.id, name: d.name, sub: d.top ? 'the mission' : 'pillion, free', price: 0, go: 'Go', mission: !!d.top, act: () => { autoGo(job, d, 0); return { close: true }; } });
    rows.push({ id: 'nakko', name: 'Never mind, Nanna', price: 0, go: 'Bye', act: () => { autoLeave(job, 'Nanna: "Okay. Home before the street lights."'); return { close: true }; } });
    return rows;
  }
  function nannaArrive() {
    const look = N.npcs && N.npcs.look ? (() => { try { return N.npcs.look('nanna'); } catch (e) { return null; } })() : null;
    const job = summon({ type: 'family_chetak', look, nanna: true });
    if (!job) { toast('Nanna couldn\'t find the road. Try another booth.', 2400); return; }
    S.nannaJob = job;
    toast('*Putt-putt-putt.* Nanna\'s Chetak turns into the road.', 2400);
  }
  function hailTick(dt) {
    const p = N.player;
    for (const key of ['hail', 'nannaJob', 'buntyJob']) {
      const job = S[key];
      if (!job) continue;
      if (!job.v || !job.v.alive) { S[key] = null; continue; }
      if (job.riding) continue;
      job.t += dt;
      const d = Math.hypot(job.v.x - p.x, job.v.y - p.y);
      if (!job.arrived) { if (d > 700 || job.t > 40) { autoLeave(job); } continue; }
      job.wait -= dt;
      if (job.wait <= 0 || d > 260) { autoLeave(job, key === 'nannaJob' ? 'Nanna waited, then went for milk.' : key === 'buntyJob' ? 'Bunty-anna waited, then went to Ameerpet.' : null); continue; }
      // closed with Escape: the card doesn't pop straight back up. It reopens when he walks off and comes
      // back, or with ACTION next to the vehicle (until the driver gives up waiting)
      if (job.dismissed) {
        if (d > 60) job.dismissed = false;
        else if (d < 46 && !p.vehicle && N.state.mode === 'play' && !UI.open && N.interact && N.interact.offer) {
          N.interact.offer({ label: job.nanna ? 'Nanna is waiting' : job.bunty ? 'Bunty-anna is waiting' : job.taxi ? 'Ride taxi (fare)' : 'Ride auto (fare)', priority: 1, dist: d, use: () => { job.dismissed = false; openAuto(job); } });
        }
        continue;
      }
      if (d < 46 && !p.vehicle && N.state.mode === 'play' && !UI.open && !(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen())) openAuto(job);
    }
    if (S.nanna) { S.nanna.t -= dt; if (S.nanna.t <= 0) { S.nanna = null; nannaArrive(); } }
    if (S.bunty) { S.bunty.t -= dt; if (S.bunty.t <= 0) { S.bunty = null; buntyArrive(false); } }
  }

  /* ============================================== rides: the mini / toy trains */
  class MiniTrain extends N.Actor {
    constructor(T) { super({ kind: 'prop', x: T.cx, y: T.cy, r: 6, solid: false, noCollide: true }); this.T = T; this.cars = []; }
    update() { /* moved by the shops system */ }
    draw() {
      const R = N.render, D = N.draw, T = this.T;
      for (let i = this.cars.length - 1; i >= 0; i--) {
        const c = this.cars[i];
        if (!R.inView(c.x, c.y, 20)) continue;
        R.queue('shadow', 0, () => D.shadow(c.x, c.y, 13, 8, c.a, 3));
        R.queue('actors', c.y + 2, () => D.sprite(c.x, c.y, c.a, 5, (g) => drawCar(g, i, T)));
      }
    }
  }
  function drawCar(g, i, T) {
    if (i === 0) { // the engine: red, a black funnel, a brass bell
      g.fillStyle = '#1a1214'; g.fillRect(-7.5, -4.5, 15, 9);
      g.fillStyle = '#c8231d'; g.fillRect(-7, -4, 14, 8);
      g.fillStyle = '#f2c230'; g.fillRect(-7, -4, 14, 1.4); g.fillRect(-7, 2.6, 14, 1.4);
      g.fillStyle = '#1a1214'; g.beginPath(); g.arc(3.5, 0, 2.2, 0, TAU); g.fill();
      g.fillStyle = '#e8d9b5'; g.beginPath(); g.arc(-3.5, 0, 1.5, 0, TAU); g.fill();
      return;
    }
    const col = ['#2a5cb8', '#2a8c82', '#f2c230'][(i - 1) % 3];
    g.fillStyle = '#1a1214'; g.fillRect(-6.5, -4.5, 13, 9);
    g.fillStyle = col; g.fillRect(-6, -4, 12, 8);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-6, -4, 12, 1.3);
    // passengers: little heads (the player is in the first coach)
    const heads = i === 1 && T.withPlayer ? 2 : 2;
    for (let k = 0; k < heads; k++) { g.fillStyle = '#1a1412'; g.beginPath(); g.arc(-2.5 + k * 5, 0, 1.6, 0, TAU); g.fill(); }
  }
  function rideLoop(id, o) {
    const pl = N.places[id] || (defOf(id) || {}).place;
    let cx = pl ? pl.x : N.player.x, cy = pl ? pl.y : N.player.y, rx = 80, ry = 56;
    const park = ((N.WORLD_DATA && N.WORLD_DATA.parks) || []).find((q) => q.id === id || q.id === id + '_park' || (q.id && id.indexOf(q.id) === 0));
    if (park && park.poly && park.poly.length > 2) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of park.poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
      const f = (o && o.r) || 0.34;
      rx = U.clamp((x1 - x0) * f, 40, 170); ry = U.clamp((y1 - y0) * f, 34, 140);
    } else if (o && o.r && pl) { rx = Math.max(40, (pl.r || 60) * 1.3); ry = rx * 0.7; }
    return { cx, cy, rx, ry };
  }
  /** A seated ride on a little train round a park (NTR Gardens, Numaish, the zoo). ACTION gets off early. */
  function trainRide(id, o) {
    o = o || {};
    const p = N.player;
    if (!p || S.ride) return Promise.resolve(false);
    const L = rideLoop(id, o);
    return new Promise((resolve) => {
      const T = Object.assign(L, { id, a: Math.atan2(p.y - L.cy, p.x - L.cx), secs: o.secs || TUNE.trainSecs, t: 0, resolve, from: { x: p.x, y: p.y }, vp: !!o.viewpoint, vpDone: false, locked: !!p.controlsLocked, withPlayer: true, zoom: N.render.baseZoom });
      const ent = new MiniTrain(T);
      T.ent = ent;
      N.entities.add(ent);
      S.ride = T;
      p.hidden = true; p.controlsLocked = true; p.mode = 'busy';
      sfx('train_horn', { vol: 0.35 });
      toast('All aboard! (ACTION to get off)', 2600);
      N.emit('shop:service', { place: id, service: 'train' });
      rideTick(0);
    });
  }
  function rideTick(dt) {
    const T = S.ride; if (!T) return;
    const p = N.player;
    T.t += dt;
    const avg = (T.rx + T.ry) / 2;
    T.a += (30 / avg) * dt;
    const cars = [];
    for (let i = 0; i < 4; i++) {
      const a = T.a - i * (15 / avg);
      const x = T.cx + Math.cos(a) * T.rx, y = T.cy + Math.sin(a) * T.ry;
      const tx = -Math.sin(a) * T.rx, ty = Math.cos(a) * T.ry;
      cars.push({ x, y, a: Math.atan2(ty, tx) });
    }
    T.ent.cars = cars; T.ent.x = cars[0].x; T.ent.y = cars[0].y;
    p.x = cars[1].x; p.y = cars[1].y; p.vx = p.vy = 0;
    if (T.vp && !T.vpDone && T.t > 3) { T.vpDone = true; revealAround(T.id, T.cx, T.cy); }
    if (N.render && !N.render.camOverride) N.render.baseZoom = T.vp ? 0.72 : 0.85;
    const off = N.input && N.state.mode === 'play' && N.input.pressed('action');
    if (off) N.input.consume('action');
    if (T.t >= T.secs || off) endRide();
  }
  function endRide() {
    const T = S.ride; if (!T) return;
    S.ride = null;
    const p = N.player;
    N.entities.remove(T.ent);
    p.hidden = false; p.mode = 'foot'; if (!T.locked) p.controlsLocked = false;
    if (N.render) N.render.baseZoom = T.zoom || 1;
    p.teleport(T.from.x, T.from.y);
    toast('The train whistles to a stop. Everybody claps for the driver.', 2400);
    T.resolve(true);
  }
  /* --------------------------------------------------------------- viewpoints (W6) */
  function revealAround(id, x, y) {
    if (used('vp:' + id)) return 0;
    use('vp:' + id);
    let n = 0;
    const C = N.collectibles;
    try { if (C && typeof C.reveal === 'function') n = C.reveal(x, y, 900, 180) || 0; } catch (e) { N.err('shops.reveal', e); }
    N.emit('viewpoint', { id, x, y, r: 900, secs: 180 });
    return n;
  }
  function viewpoint(id, x, y, o) {
    o = o || {};
    const R = N.render, p = N.player;
    if (!R || S.vp) return false;
    S.vp = { t: o.secs || 3, locked: !!p.controlsLocked, id };
    p.controlsLocked = true;
    R.camOverride = { x, y, zoom: o.zoom || 0.55, rate: 2 };
    if (o.sfx) sfx(o.sfx);
    const n = revealAround(id, x, y);
    toast('From up here you can see half the city.' + (n ? ' Something glints, ' + n + ' places. (On your map.)' : ''), 3200);
    return true;
  }
  function vpTick(dt) {
    const V = S.vp; if (!V) return;
    V.t -= dt;
    if (V.t <= 0) { S.vp = null; if (N.render) N.render.camOverride = null; const p = N.player; if (p && !V.locked) p.controlsLocked = false; }
  }

  /* ================================================================== boats (§3.7) */
  function waterNear(x, y) {
    for (let r = 0; r < 160; r += 6) for (let a = 0; a < TAU; a += TAU / Math.max(6, r / 3)) {
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (N.world.isWater(px, py) && !N.world.collide(px, py, 7, 'boat').hit) return { x: px, y: py };
    }
    return null;
  }
  function hireBoat(c) {
    const V = N.vehicles;
    if (!V) return { msg: 'No boats today.', refund: true };
    let v = V.list.find((b) => b.alive && b.type === 'boat' && b.hire === c.id && !b.driver);
    if (!v) { const f = waterNear(c.x, c.y); if (!f) return { msg: 'No boat free right now.', refund: true }; v = V.spawn('boat', f.x, f.y, -Math.PI / 2, { hire: c.id }); }
    if (!v) return { msg: 'No boat free right now.', refund: true };
    v.hired = true;
    closeShop(true);
    V.enter(N.player, v, { quiet: true });
    S.boat = { v, left: TUNE.boatSecs, place: c.id };
    toast('"Two hours on my watch, *beta*." You steer. (Get off only at the jetty.)', 3400);
    N.emit('shop:service', { place: c.id, service: 'boat' });
    return { close: true };
  }
  function boatTick(dt) {
    const B = S.boat; if (!B) return;
    const p = N.player, v = B.v;
    if (!v || !v.alive || p.vehicle !== v) { if (v) { v.hired = false; v.autopilot = false; if (N.vehicles.stopDriving) N.vehicles.stopDriving(v); } S.boat = null; if (N.hud) N.hud.timer(null); return; }
    B.left -= dt;
    if (N.hud) N.hud.timer('BOAT', Math.max(0, B.left), { countdown: false });
    const jet = N.places[B.place];
    const far = jet ? Math.hypot(v.x - jet.x, v.y - jet.y) > 70 : true;
    if (far && !S.ff) N.interact.offer({ label: v.autopilot ? "I'll steer" : 'Boatman rows', priority: 1, dist: 0, use: () => toggleBoatman(B) });
    if (B.left <= 0 && !B.ending) {
      B.ending = true;
      toast('"Time up, *beta*." The boatman takes the oars.', 2800);
      ffwd(20, { label: 'BACK TO THE JETTY', ms: 1600, mid: () => {
        const w = jet ? waterNear(jet.x, jet.y) : null;
        if (w) { v.x = w.x; v.y = w.y; v.vx = v.vy = 0; v.okX = null; }
        if (N.vehicles.stopDriving) N.vehicles.stopDriving(v);
        v.autopilot = false;
        N.vehicles.exit(p, true);
        v.hired = false;
      } }).then(() => { S.boat = null; if (N.hud) N.hud.timer(null); });
    }
  }
  function toggleBoatman(B) {
    const v = B.v, V = N.vehicles;
    if (v.autopilot) { v.autopilot = false; if (V.stopDriving) V.stopDriving(v); toast('You take the oars again.', 1800); return; }
    const lm = ((N.WORLD_DATA && N.WORLD_DATA.landmarks) || []).find((l) => l.id === 'buddha_statue') || N.places.buddha_statue;
    if (!lm || !V.driveTo) return;
    const pts = [];
    const a0 = Math.atan2(v.y - lm.y, v.x - lm.x);
    for (let k = 0; k <= 16; k++) { const a = a0 + (k / 16) * TAU; pts.push([lm.x + Math.cos(a) * 70, lm.y + Math.sin(a) * 70]); }
    const jet = N.places[B.place], w = jet ? waterNear(jet.x, jet.y) : null;
    if (w) pts.push([w.x, w.y]);
    v.autopilot = true;
    V.driveTo(v, pts, { road: false, speed: 40, r: 18, warp: false }).then(() => { v.autopilot = false; });
    toast('The boatman rows, humming. Round the Buddha, then back.', 2400);
  }

  /* =========================================================== cycle hire (§5.6) */
  function hireWhy() { return S.lateFee > 0 ? 'Pay the old hire first' : null; }
  function hiredVehicle() {
    const v = S.hireV;
    if (v && v.alive && v.hired) return v;
    const sid = S.hire && S.hire.sid;
    return (N.vehicles && N.vehicles.list.find((b) => b.alive && b.hired && b.sid === sid)) || null;
  }
  // A3: the sporty Hercules costs a rupee more an hour (day cap ₹12)
  const HIRE_RATE = { hercules_cycle: [400, 1200] };
  function hireFee(h, now) {
    const deadline = h.day * 1440 + hm('21:00');
    const hours = Math.max(1, Math.ceil(Math.max(0, Math.min(now, deadline) - h.start) / 60));
    const rate = HIRE_RATE[h.type] || [TUNE.hireHour, TUNE.hireCap];
    let fee = Math.min(hours * rate[0], rate[1]);
    if (now > deadline) fee += Math.ceil((now - deadline) / 60) * TUNE.hireLate;
    return fee;
  }
  function hireHours() { const m = absMin() - S.hire.start; return m < 60 ? 'under an hour' : Math.ceil(m / 60) + ' hours'; }
  function returnWhy(c) {
    const v = hiredVehicle();
    if (!v) return null;
    return Math.hypot(v.x - c.x, v.y - c.y) > 60 && N.player.vehicle !== v ? 'Bring the cycle here first' : null;
  }
  function hireCycle(placeId, type) {
    const def = defOf(placeId), V = N.vehicles;
    if (!def || !V) return { msg: 'No cycles today.' };
    if (S.hire) return { msg: 'One cycle at a time!' };
    let v = V.list.find((b) => b.alive && b.hire === def.id && !b.hired && !b.driver && !b.fallen && b.type === type);
    if (!v) { const f = N.world.findFree(def.x + 10, def.y + 8, 'drive', 16) || { x: def.x, y: def.y }; v = V.spawn(type, f.x, f.y, Math.PI / 2, { hire: def.id }); }
    if (!v) return { msg: 'No cycle free right now.' };
    v.hire = def.id; v.hired = true;
    S.hire = { place: def.id, type, start: absMin(), day: day(), sid: v.sid };
    S.hireV = v;
    closeShop(true);
    if (N.player.vehicle) V.exit(N.player, true);
    V.enter(N.player, v, { quiet: true });
    N.emit('shop:service', { place: def.id, service: 'hire', type });
    return { close: true, msg: '"Three rupees an hour. Late means double." Return it at any cycle shop.' };
  }
  function returnCycle(placeId) {
    const def = defOf(placeId);
    if (!def || !S.hire) return { msg: 'No cycle hired.' };
    const fee = hireFee(S.hire, absMin());
    const p = N.player, v = hiredVehicle();
    if (v && p.vehicle === v) { if (!N.vehicles.exit(p)) N.vehicles.exit(p, true); }
    charge(fee, { why: 'hire', companion: (p.money | 0) < fee ? 'cycle_shop' : null });
    if (v) { v.hired = false; v.hire = def.id; }
    S.hire = null; S.hireV = null;
    N.emit('shop:service', { place: def.id, service: 'return', fee });
    return 'Paid ' + rs(fee) + '. "Bring it back in one piece next time also."';
  }
  function hireTick() {
    const H = S.hire; if (!H) return;
    // not back by 07:00 the next morning: the shop boy fetches it; ₹16 at the next visit
    if (absMin() > (H.day + 1) * 1440 + hm('07:00')) {
      const v = hiredVehicle();
      if (v && N.player.vehicle === v) return;
      if (v && N.vehicles.remove) N.vehicles.remove(v);
      S.hire = null; S.hireV = null; S.lateFee = TUNE.hireLost;
      toast('The cycle-shop boy took the cycle back. You owe ' + rs(TUNE.hireLost) + ' at any cycle shop.', 3400);
    }
  }
  function flatNear(c) {
    const p = N.player;
    if (p.vehicle && p.vehicle.flat) return p.vehicle;
    return N.vehicles && N.vehicles.nearestCycle ? N.vehicles.nearestCycle(c.x, c.y, 50, (v) => v.flat) : null;
  }

  /* ============================================================ odd jobs hooks */
  function jobRow(id) { return !!(N.sidejobs && N.sidejobs.defs && N.sidejobs.defs[id]); }
  function jobWhy(id) { try { return N.sidejobs && N.sidejobs.why ? N.sidejobs.why(id) : null; } catch (e) { return null; } }
  function jobSub(id) { try { const L = N.sidejobs.level(id); return 'level ' + L + ' · ' + (N.sidejobs.payText ? N.sidejobs.payText(id) : ''); } catch (e) { return ''; } }
  function startJob(id) { closeShop(true); setTimeout(() => { try { if (N.sidejobs && N.sidejobs.start) N.sidejobs.start(id); } catch (e) { N.err('shops.job', e); } }, 30); return { close: true }; }
  // job rows in the shops that give the jobs (systems §9)
  KINDS.kirana.rows.push({ id: 'job', name: 'Odd job: errands for the shop', sub: () => jobSub('job_kirana_errand'), price: 0, hidden: (c) => !jobRow('job_kirana_errand') || !(c.id === 'kirana_1' || (N.sidejobs && N.sidejobs.level && N.sidejobs.level('job_kirana_errand') >= 3)), when: () => jobWhy('job_kirana_errand'), act: () => startJob('job_kirana_errand') });
  KINDS.kirana.rows.push({ id: 'paper', name: 'Odd job: the morning paper round', sub: () => jobSub('job_paper_round'), price: 0, hidden: (c) => c.id !== 'kirana_2' || !jobRow('job_paper_round'), when: () => jobWhy('job_paper_round'), act: () => startJob('job_paper_round') });
  KINDS.rythu.rows.push({ id: 'job', name: "Odd job: an aunty's shopping list", sub: () => jobSub('job_rythu_list'), price: 0, hidden: () => !jobRow('job_rythu_list'), when: () => jobWhy('job_rythu_list'), act: () => startJob('job_rythu_list') });
  KINDS.cinema.rows.push({ id: 'job', name: "Odd job: help Bomma-uncle with the cut-out", sub: () => jobSub('job_cutout'), price: 0, hidden: (c) => c.id !== 'sudarshan_theatre' || !jobRow('job_cutout'), when: () => jobWhy('job_cutout'), act: () => startJob('job_cutout') });
  KINDS.kite_stall.rows.push({ id: 'job', name: 'Odd job: chase *lootna* kites', sub: () => jobSub('job_lootna'), price: 0, hidden: () => !jobRow('job_lootna'), when: () => jobWhy('job_lootna'), act: () => startJob('job_lootna') });

  /* ========================================================= visited places */
  let visT = 0;
  function markVisited(id) {
    if (!N.flags) return;
    const v = N.flags.visited && typeof N.flags.visited === 'object' ? N.flags.visited : (N.flags.visited = {});
    if (!v[id]) { v[id] = 1; N.emit('place:visited', { id }); }
  }
  function visitTick(dt) {
    visT -= dt; if (visT > 0) return; visT = 0.5;
    const p = N.player; if (!p) return;
    for (const id in N.places) {
      const q = N.places[id];
      if (q.kind === 'hidden' || q.kind === 'giver') continue;
      const r = (q.r || 20) + 10;
      if (Math.abs(q.x - p.x) < r && Math.abs(q.y - p.y) < r && Math.hypot(q.x - p.x, q.y - p.y) < r) markVisited(id);
    }
  }

  /* ================================================================== system */
  S.leaving = []; S.off = {}; S.tipT = 0;
  function cardInput(dt) {
    const I = N.input; if (!I) return;
    const v = UI.view;
    if (v && v.type === 'progress') {
      v.t += dt;
      if (v.sfx) { v.sT -= dt; if (v.sT <= 0) { v.sT = v.every; sfx(v.sfx, { vol: 0.6 }); } }
      if (v.t >= v.secs) { UI.busy = false; const done = v.done; v.done = null; if (done) done(); }
      else renderProgress(v);
      for (const a of ['action', 'pause', 'horn', 'up', 'down', 'left', 'right']) I.consume(a);
      return;
    }
    netTick(dt);
    if (I.pressed('up')) { I.consume('up'); setSel(UI.sel - 1); sfx('ui_click', { vol: 0.5 }); }
    if (I.pressed('down')) { I.consume('down'); setSel(UI.sel + 1); sfx('ui_click', { vol: 0.5 }); }
    if (I.pressed('left')) { I.consume('left'); changeQty(-1); }
    if (I.pressed('right')) { I.consume('right'); changeQty(1); }
    if (I.pressed('action')) { I.consume('action'); activate(UI.sel); return; }
    if (I.pressed('pause') || I.pressed('horn')) { I.consume('pause'); I.consume('horn'); back(false); return; }
    // keep the purse current (money can change under the card: refunds, repayments)
    UI.purseT = (UI.purseT || 0) - dt;
    if (UI.purseT <= 0) { UI.purseT = 0.4; if (UI.dom.purse) UI.dom.purse.textContent = U.fmtMoney(N.player.money | 0); }
  }
  function holdTick(dt) {
    const H = S.hold; if (!H) return;
    const I = N.input;
    H.t += dt;
    if (I && I.down('action')) {
      if (H.t >= TUNE.quickHold) { S.hold = null; I.consume('action'); quickOrder(H.id); }
      return;
    }
    S.hold = null;
    openShop(H.id);
  }
  function offersTick() {
    const p = N.player, v = p && p.vehicle;
    if (!p || !v || p.controlsLocked || S.ff) return;
    const sp = Math.hypot(v.vx || 0, v.vy || 0);
    // a hired cycle comes back at any cycle stall (priority 1 beats "Get off")
    if (v.hired && S.hire && v.T && v.T.pedal) {
      for (const id in defs) {
        const d = defs[id]; if (d.kind !== 'cycle_rent') continue;
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist < d.r + 16) { N.interact.offer({ label: 'Return cycle', priority: 1, dist, use: () => { const m = returnCycle(id); toast(plain(typeof m === 'string' ? m : m.msg || ''), 3000); } }); return; }
      }
    }
    // stopped next to a shop on wheels: "Get off to buy" (systems §1.4); not off a seat a story has locked
    if (sp < 10 && !v.hire && !(p.passenger && v.lockPassenger)) {
      for (const id in defs) {
        const d = defs[id]; if (d.K.direct || d.K.virtual) continue;
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist < d.r + 8 && statusOf(d).open) { N.interact.offer({ label: 'Get off to buy', priority: 0, dist: -1, use: () => { if (N.vehicles) N.vehicles.exit(p, false); } }); return; }
      }
    }
  }
  function leavingTick(dt) {
    for (let i = S.leaving.length - 1; i >= 0; i--) {
      const L = S.leaving[i]; L.t += dt;
      const v = L.v;
      if (!v || !v.alive) { S.leaving.splice(i, 1); continue; }
      if ((L.t > 4 && !N.render.inView(v.x, v.y, 60)) || L.t > 45) { if (N.player.vehicle !== v && N.vehicles.remove) N.vehicles.remove(v); S.leaving.splice(i, 1); }
    }
  }
  // the girni's chilli day: standing near a pindi girni on a Tuesday makes Chinnu sneeze
  let sneezeT = 6;
  function sneezeTick(dt) {
    if (dow() !== 2) return;
    const p = N.player;
    let near = false;
    for (const id in defs) { const d = defs[id]; if (d.kind === 'pindi_girni' && Math.hypot(d.x - p.x, d.y - p.y) < 20 && statusOf(d).open) { near = true; break; } }
    if (!near) { sneezeT = Math.min(sneezeT, 2); return; }
    sneezeT -= dt;
    if (sneezeT <= 0) { sneezeT = 6; toast('*Aaachhoo!* "Chilli day today. Stand back, you\'ll sneeze."', 1800); N.emit('caption', { text: 'sneeze', kind: 'self', ms: 1200 }); }
  }
  function update(dt) {
    const md = N.state.mode;
    ffTick(dt);
    if (UI.open) {
      if (md === 'dialogue') cardInput(dt);
      else if (md === 'play') closeShop(true); // the state was popped under us (load, script): drop the card
      return;
    }
    if (md !== 'play') return;
    rideTick(dt);
    vpTick(dt);
    holdTick(dt);
    hailTick(dt);
    boatTick(dt);
    hireTick();
    leavingTick(dt);
    offersTick();
    buntySpotTick();
    visitTick(dt);
    sneezeTick(dt);
    if (S.tipT > 0) { S.tipT -= dt; if (S.tipT <= 0 && N.hud) N.hud.unblip('shop:goli'); }
  }
  // the horn on foot near a road is "AUTO!" (systems §1.5)
  N.on('horn', (d) => {
    try {
      if (!d || d.vehicle || d.type !== 'foot' || (d.who && d.who !== N.player)) return;
      if (N.state.mode !== 'play' || UI.open) return;
      hailAuto({});
    } catch (e) { N.err('shops.hail', e); }
  });
  function resetAll() {
    if (UI.open) closeShop(true);
    if (S.ride) { try { N.entities.remove(S.ride.ent); } catch (e) { /* ignore */ } const p = N.player; if (p) { p.hidden = false; p.mode = 'foot'; } }
    if (S.ff) { N.clock.hold('shops-ff', false); ffOverlay(false); if (N.render && N.render.fx) N.render.fx.vhs = S.ff.vhs0; }
    if (S.vp && N.render) N.render.camOverride = null;
    N.clock.hold('shop', false);
    S.khaata = 0; S.debts = []; S.hire = null; S.hireV = null; S.lateFee = 0; S.ledger = { day: -1, used: {} }; S.platform = {}; S.parlour = {}; S.beaten = {};
    S.lastOrder = null; S.read = {}; S.lineT = {}; S.stats = { spent: 0, earned: 0, buys: 0 }; S.hail = null; S.nanna = null; S.nannaJob = null; S.bunty = null; S.buntyJob = null; S.boat = null; S.ride = null; S.ff = null; S.vp = null; S.hold = null;
    S.gokulBest = 0; S.sticker = {}; S.leaving = []; S.off = {}; S.tipT = 0;
  }
  function serialize() {
    return { khaata: S.khaata, debts: S.debts.map((d) => ({ who: d.who, paise: d.paise })), hire: S.hire ? Object.assign({}, S.hire) : null, lateFee: S.lateFee, ledger: { day: S.ledger.day, used: Object.assign({}, S.ledger.used) },
      platform: Object.assign({}, S.platform), parlour: Object.assign({}, S.parlour), beaten: Object.assign({}, S.beaten), read: Object.assign({}, S.read), gokulBest: S.gokulBest, sticker: Object.assign({}, S.sticker), stats: Object.assign({}, S.stats) };
  }
  function deserialize(o) {
    if (!o || typeof o !== 'object') return;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    S.khaata = Math.max(0, num(o.khaata, 0) | 0);
    S.debts = Array.isArray(o.debts) ? o.debts.filter((d) => d && typeof d.who === 'string' && num(d.paise, 0) > 0).map((d) => ({ who: d.who, paise: d.paise | 0 })) : [];
    const h = o.hire;
    S.hire = h && typeof h === 'object' && typeof h.place === 'string' && isFinite(h.start) ? { place: h.place, type: String(h.type || 'cycle'), start: +h.start, day: num(h.day, day()) | 0, sid: null } : null;
    S.hireV = null;
    S.lateFee = Math.max(0, num(o.lateFee, 0) | 0);
    const L = obj(o.ledger); S.ledger = { day: num(L.day, -1), used: Object.assign({}, obj(L.used)) };
    S.platform = Object.assign({}, obj(o.platform)); S.parlour = Object.assign({}, obj(o.parlour)); S.beaten = Object.assign({}, obj(o.beaten)); S.read = Object.assign({}, obj(o.read));
    S.gokulBest = Math.max(0, num(o.gokulBest, 0) | 0); S.sticker = Object.assign({}, obj(o.sticker));
    const st = obj(o.stats); S.stats = { spent: num(st.spent, 0), earned: num(st.earned, 0), buys: num(st.buys, 0) };
  }
  // after a load the ridden cycle is a fresh vehicle: it is the hired one again
  N.on('save:loaded', () => {
    setTimeout(() => {
      const p = N.player, v = p && p.vehicle;
      if (S.hire && v && v.T && v.T.pedal) { v.hired = true; v.hire = S.hire.place; S.hire.sid = v.sid; S.hireV = v; }
    }, 0);
  });

  /* ===================================================================== API */
  function prices() { const out = {}; for (const k in KINDS) { const rows = KINDS[k].rows || []; out[k] = {}; for (const r of rows) if (typeof r.price === 'number') out[k][r.id] = r.price; } return out; }
  const EXTRA = [];
  const SH = (N.shops = {
    KINDS, TUNE, defs, FILMS, DOCS, STAGES,
    get PRICES() { return prices(); },
    open: (id, o) => openShop(id, o), close: () => closeShop(), isOpen: () => UI.open,
    get current() { return UI.open && UI.def ? { id: UI.def.id, kind: UI.def.kind, name: UI.def.name, view: UI.view ? UI.view.type : 'list' } : null; },
    buy, quickOrder, resolve, kindOf: (id) => { const d = defOf(id); return d ? d.kind : null; },
    list: (kind) => Object.keys(defs).filter((id) => !kind || defs[id].kind === kind),
    rows: (id) => { const d = defOf(id); return d ? visibleItems(ctxOf(d), rowsOf(d)).map((it) => ({ id: it.row.id, name: plain(val(it.row.name, ctxOf(d))), price: priceOf(ctxOf(d), it.row), why: it.why ? plain(it.why) : null, house: !!it.row.house })) : []; },
    status: (id, m) => { const d = defOf(id); return d ? statusOf(d, m) : null; },
    isOpenNow: (id) => { const d = defOf(id); return !!(d && statusOf(d).open); },
    hours: (id) => { const d = defOf(id); return d ? hoursOf(d).map((h) => [hm(h[0]), hm(h[1])]) : null; },
    hoursText,
    addRow(target, row) { if (!row || !row.id) return false; EXTRA.push({ target, row }); if (UI.open) render(); return true; },
    removeRow(rowId) { for (let i = EXTRA.length - 1; i >= 0; i--) if (EXTRA[i].row.id === rowId) EXTRA.splice(i, 1); if (UI.open) render(); },
    lock(on, reason) { if (on === false) S.locks.delete(reason || 'script'); else S.locks.add(reason || 'script'); if (on !== false && UI.open) closeShop(true); return S.locks.size > 0; },
    charge, earn, debts: () => S.debts.map((d) => ({ who: d.who, paise: d.paise })),
    get khaata() { return { owed: S.khaata, limit: khaataLimit() }; },
    busBoard: (from) => { const d = defOf(from) || defOf('koti_bus_stand'); if (!d || !openShop(d.id)) return false; setView(busView(UI.ctx)); return true; },
    busTo, busUnlocked, unlockBus, busStops: () => STAGES.map((s) => ({ id: s.stop, ticket: s.n, found: stageFound(s) })), busDests: (from) => busDests(from || null),
    hailAuto, autoFare, autoRide: (dest, o) => { const d = typeof dest === 'string' ? Object.assign({ id: dest }, N.places[dest]) : dest; if (!d || !isFinite(d.x)) return Promise.resolve(false); if (o && o.price) { const ch = charge(o.price, { why: 'auto' }); if (!ch.ok) return Promise.resolve(false); } return travelTo(d, { mode: 'auto', label: 'AUTO → ' + (d.name || '') }); },
    get autoJob() { return S.hail ? { arrived: S.hail.arrived, yadagiri: S.hail.yada, vehicle: S.hail.v } : null; },
    nannaWhy: () => nannaWhy(),
    callNanna: () => { if (nannaWhy()) return false; use('nanna'); S.nanna = { t: TUNE.nannaDelay }; return true; },
    get nannaJob() { return S.nannaJob ? { arrived: S.nannaJob.arrived, vehicle: S.nannaJob.v } : S.nanna ? { coming: true } : null; },
    /** A3: Bunty-anna's RX100 pillion (60 finds): buntyWhy() -> reason | null, callBunty() (STD, 15 s), buntyJob */
    buntyWhy: () => (buntyUnlocked() ? buntyWhy() : 'Needs 60 finds'), callBunty: () => { if (!buntyUnlocked() || buntyWhy()) return false; use('bunty'); S.bunty = { t: TUNE.buntyDelay }; return true; },
    get buntyJob() { return S.buntyJob ? { arrived: S.buntyJob.arrived, vehicle: S.buntyJob.v } : S.bunty ? { coming: true } : null; },
    /** A3: a traffic auto / taxi with its driver as a passenger with a fare (vehicles.js "Ride auto (fare)") */
    rideVehicle,
    travelTo, ffwd, passMinutes,
    stdSave: () => stdSave(), callHome: () => callHome(ctxOf(defOf('std_1') || { id: 'std', K: KINDS.std_booth })),
    haircut: (id) => { const d = defOf(id || 'barber_1'); if (!d || !openShop(d.id, { focus: 'haircut' })) return false; const i = UI.items.findIndex((it) => it.row.id === 'haircut'); if (i >= 0) activate(i); return true; },
    trainRide, viewpoint, fortune, platformTicket,
    hireCycle: (id, type) => { const d = defOf(id); return d ? hireCycle(d.id, type || 'kid_cycle') : { msg: 'no stall' }; },
    returnCycle: (id) => returnCycle(id), hireFee: (now) => (S.hire ? hireFee(S.hire, now == null ? absMin() : now) : 0),
    get hire() { return S.hire ? Object.assign({}, S.hire) : null; },
    get ride() { return S.ride ? { id: S.ride.id, t: S.ride.t, secs: S.ride.secs } : null; },
    get busy() { return !!(S.ff || S.ride || S.vp || UI.open); },
    addEmail(e) { if (e && e.id && !S.emails.some((x) => x.id === e.id)) S.emails.push(e); },
    visited: (id) => !!(N.flags && N.flags.visited && N.flags.visited[id]), markVisited,
    economy() {
      // systems §5.18: one real hour of normal play, from the live prices
      const P = prices();
      const spend = 4 * P.irani_cafe.combo + 4 * TUNE.busPrice + P.barber.haircut;
      const earn2 = 2500 + 2000 + 800 + 500;
      return { spend, earn: earn2, result: earn2 - spend, ok: earn2 >= spend && earn2 - spend < 1000, text: 'Earn ≈ ' + rs(earn2) + ' · spend ≈ ' + rs(spend) + ' · ' + (earn2 >= spend ? 'a little ahead' : 'behind') };
    },
    /** debug / tests */
    debug: { S, UI, render, activate: (i) => activate(i), setSel, back, statusOf: (id, m) => statusOf(defOf(id), m), hireTick, rideTick, endRide,
      finishFF() { const F = S.ff; if (F) { F.t = F.ms; ffTick(0); } }, settle() { if (S.ff) { S.ff.t = S.ff.ms; ffTick(0); } if (S.ride) endRide(); if (S.vp) { S.vp.t = 0; vpTick(0); } } },
  });

  N.addSystem({
    id: 'shops', order: 57, runIn: ['play', 'dialogue'],
    init() {
      try { if (N.save && N.save.register) N.save.register('shops', { serialize, deserialize }); } catch (e) { N.err('shops.save', e); }
      try {
        const E = N.player && N.player.EDIBLES;
        if (E) {
          E.fine_biscuits = E.fine_biscuits || { name: 'Fine biscuits', short: 'Biscuits', feed: 10, icon: 'biscuit' };
          E.fruit_biscuits = E.fruit_biscuits || { name: 'Fruit biscuits', short: 'Fruit biscuits', feed: 30, icon: 'biscuit' };
          E.fruit_bread = E.fruit_bread || { name: 'Fruit bread', short: 'Fruit bread', feed: 12, icon: 'biscuit' };
        }
      } catch (e) { N.err('shops.edibles', e); }
    },
    update,
    reset() { resetAll(); },
  });
  N.on('world:built', () => { try { build(); } catch (e) { N.err('shops.build', e); } });
  N.on('boot', () => { try { if (!Object.keys(defs).length) build(); } catch (e) { N.err('shops.build', e); } });
  N.on('game:quit', () => { if (UI.open) closeShop(true); });
  if (N.world && N.world.built) { try { build(); } catch (e) { N.err('shops.build', e); } }
})();
