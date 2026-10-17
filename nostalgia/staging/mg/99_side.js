
  /* ======================================================= side activities */
  // Free-roam access to the minigames at the must-have places (systems_design §2.4, §8). Story
  // interactions win over these (priority -1). Turn off with N.minigames.side(false) or
  // N.flags.mg_side_off = true. match: exact place ids, or prefixes ending with '_'.
  // Money: at most 3 paid wins per minigame per game-day; cricket ₹2 (₹5 for 3 stars), marbles ₹2
  // (₹5 against Tiger), kite ₹2 a cut (max ₹10 a day), brick game refunds its ₹1 on a win, pani puri
  // gives a free plate (tummy +15), antenna / clap / bargain pay nothing. A lost free-roam bargain
  // closes that seller for 10 game minutes.
  const SIDE = (MG.SIDE = [
    { id: 'kite', match: ['home_terrace', 'gulzar_houz'], label: 'Fly a patang', params: { difficulty: 0.35 }, when: kiteOpen },
    { id: 'antenna', match: ['home', 'friend_home'], label: 'Fix the TV antenna', params: { difficulty: 0.35 }, dx: 14 },
    { id: 'clap', match: ['golconda_fateh_darwaza'], label: 'Clap under the dome', params: { difficulty: 0.4, skin: 'golconda' }, when: () => between(9 * 60, 17 * 60 + 30) },
    { id: 'brickgame', match: ['video_parlour_'], label: 'Brick game (₹1)', cost: 100, params: { difficulty: 0.4 } },
    { id: 'cricket', match: ['playground_', 'victory_playground', 'musi_riverbed'], label: 'Join gully cricket', params: { difficulty: 0.4 }, when: cricketOpen },
    { id: 'marbles', match: ['playground_', 'victory_playground'], label: 'Play goli', params: { difficulty: 0.4 }, dx: 22 },
    { id: 'marbles', match: ['playground_14'], label: 'Goli vs Tiger', params: { difficulty: 0.5, rival: 'tiger' }, dx: -22, when: tigerOpen },
    { id: 'panipuri', match: ['gokul_chat'], label: 'Pani puri challenge (₹5)', cost: 500, params: { difficulty: 0.4 } },
    { id: 'bargain', match: ['koti_bus_stand', 'rtc_x_roads', 'nampally_station', 'kachiguda_station', 'imlibun_bus_station'], label: 'Haggle with an auto', params: { who: 'auto' }, dx: -18 },
    { id: 'bargain', match: ['banana_cart_'], label: 'Haggle for bananas', params: { who: 'banana' } },
    { id: 'bargain', match: ['flower_cart_'], label: 'Haggle for flowers', params: { who: 'flower' } },
    { id: 'bargain', match: ['rythu_bazaar_'], label: 'Haggle at the stall', params: { who: 'farmer' }, dx: 16 },
  ]);
  const PAY = (MG.TUNE.pay = Object.assign({ cricket: 200, cricket3: 500, marbles: 200, tiger: 500, kiteCut: 200, kiteDay: 1000, dailyWins: 3, bargainOff: 10, panipuriTummy: 15 }, MG.TUNE.pay || {}));
  // the day ledger (saved with the game, not in localStorage)
  const ledger = (MG.ledger = { day: null, paid: {}, kite: 0, off: {} });

  /* ---------------------------------------------------------- time rules */
  function cal() { return N.calendar && N.calendar.inRange ? N.calendar : null; }
  function minutes() { return N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 12 * 60; }
  function between(a, b) { const m = minutes(); return m >= a && m <= b; }
  function absMin() { return ((N.clock && N.clock.day) || 0) * 1440 + minutes(); }
  function kiteOpen() {
    if (N.flags && N.flags.sankranti) return true;
    const C = cal(); if (!C) return true;
    try { return C.inRange('01-13', '01-15') || (C.inRange('01-01', '02-29') && between(16 * 60 + 30, 18 * 60 + 30)); } catch (e) { return true; }
  }
  function cricketOpen() {
    const C = cal(); if (!C || !C.isSchoolDay) return true;
    try { return C.isSchoolDay() ? between(16 * 60, 18 * 60 + 30) : between(8 * 60, 18 * 60 + 30); } catch (e) { return true; }
  }
  function golis() {
    const C = N.collectibles; if (!C) return 0;
    try { if (typeof C.count === 'function') for (const k of ['goli', 'golis']) { const n = C.count(k); if (typeof n === 'number' && isFinite(n) && n > 0) return n; } } catch (e) { /* ignore */ }
    try { let n = 0; if (C.found && C.found.forEach) C.found.forEach((id) => { if (/^(g\d|goli)/i.test(String(id))) n++; }); return n; } catch (e) { return 0; }
  }
  function tigerOpen() { return !!(N.flags && N.flags.marbles_tiger) || golis() >= 10; }

  /* --------------------------------------------------------------- money */
  function today() {
    const d = (N.clock && N.clock.day) || 0;
    if (ledger.day !== d) { ledger.day = d; ledger.paid = {}; ledger.kite = 0; }
    return ledger;
  }
  function give(paise, why) {
    const pl = N.player; if (!pl || !(paise > 0)) return 0;
    pl.money = (pl.money || 0) + paise;
    try { N.emit('money', { delta: paise, total: pl.money, why }); } catch (e) { /* ignore */ }
    return paise;
  }
  function toast(t) { try { if (N.hud && N.hud.toast) N.hud.toast(t, 2600); } catch (e) { /* ignore */ } }
  /** Pay out a free-roam result (systems_design §2.4). Returns the paise paid. */
  function pay(s, r, place) {
    if (!r || r.aborted || r.error) return 0;
    const L = today(), title = (defs[s.id] && defs[s.id].title) || s.id;
    if (s.id === 'bargain') {
      if (r.win) { if (r.savedPaise) toast('Saved ' + U.fmtMoney(r.savedPaise) + '!'); }
      else if (!r.quit) L.off[sideKey(s, place)] = absMin() + PAY.bargainOff;
      return 0;
    }
    if (s.id === 'clap') { if (r.win) toast('Golconda heard you.'); return 0; }
    if (s.id === 'panipuri') {
      if (r.win) { try { N.player && N.player.feed && N.player.feed(PAY.panipuriTummy); } catch (e) { /* ignore */ } toast('Free plate! ' + (r.eaten || r.score || '') + ' puris, Bhaiya is impressed.'); }
      return 0;
    }
    if (s.id === 'brickgame') { if (r.win && s.cost) { give(s.cost, 'brickgame'); toast('FREE GAME! ' + U.fmtMoney(s.cost) + ' back'); } return 0; }
    if (s.id === 'kite') {
      const cuts = Math.max(0, r.cuts | 0); if (!cuts) return 0;
      const amt = Math.min(cuts * PAY.kiteCut, Math.max(0, PAY.kiteDay - L.kite));
      if (amt <= 0) { toast('Bo kaata! (no more prize money today)'); return 0; }
      L.kite += amt; give(amt, 'kite'); toast('+' + U.fmtMoney(amt) + ' · ' + cuts + ' cut' + (cuts > 1 ? 's' : ''));
      return amt;
    }
    if (!r.win) return 0;
    let amt = 0;
    if (s.id === 'cricket') amt = r.stars >= 3 ? PAY.cricket3 : PAY.cricket;
    else if (s.id === 'marbles') amt = r.opponent === 'tiger' ? PAY.tiger : PAY.marbles;
    if (!amt) return 0;
    const n = L.paid[s.id] || 0;
    if (n >= PAY.dailyWins) { toast(title + ': no more prize money today. Play for fun!'); return 0; }
    L.paid[s.id] = n + 1;
    give(amt, s.id); toast('+' + U.fmtMoney(amt) + ' · ' + title);
    return amt;
  }
  MG.pay = pay;

  /* --------------------------------------------------------------- install */
  const sideIds = [];
  function placeMatches(id, m) { return m.slice(-1) === '_' ? id.indexOf(m) === 0 : id === m; }
  function sideKey(s, place) { return s.id + ':' + ((s.params && s.params.who) || '') + ':' + place; }
  MG.side = function (on) {
    const I = N.interact;
    for (const k of sideIds) { try { I && I.remove(k); } catch (e) { /* ignore */ } }
    sideIds.length = 0;
    if (on === false || !I || !I.add || !N.places) return 0;
    // places that carry a `minigame` field in the map data get it too (unless SIDE already covers them)
    try {
      const raw = (N.WORLD_DATA && N.WORLD_DATA.places) || [];
      for (const rp of raw) {
        const gid = rp && rp.minigame && MG.resolve(rp.minigame);
        if (!gid || !N.places[rp.id] || SIDE.some((s) => s.id === gid && s.match.some((m) => placeMatches(rp.id, m)))) continue;
        const p = N.places[rp.id], key = 'mg:' + gid + ':data:' + rp.id;
        sideIds.push(key);
        I.add(key, { x: p.x, y: p.y, r: Math.max(14, Math.min(26, (p.r || 20) * 0.6)), priority: -1, label: 'Play: ' + (defs[gid].title || gid),
          enabled: () => !N.flags.mg_side_off && !cur, use: () => { MG.play(gid, { place: rp.id }); } });
      }
    } catch (e) { N.err('minigames.side.data', e); }
    for (const id of Object.keys(N.places)) {
      const p = N.places[id];
      SIDE.forEach((s, si) => {
        if (!defs[s.id] || !s.match.some((m) => placeMatches(id, m))) return;
        const key = 'mg:' + s.id + ':' + si + ':' + id;
        sideIds.push(key);
        I.add(key, {
          x: p.x + (s.dx || 0), y: p.y + (s.dy || 0), r: Math.max(14, Math.min(26, (p.r || 20) * 0.6)), priority: -1,
          label: s.label,
          enabled: (pl) => {
            if (N.flags.mg_side_off || cur || (s.cost && ((pl && pl.money) || 0) < s.cost)) return false;
            const off = ledger.off[sideKey(s, id)]; if (off && absMin() < off) return false;
            try { return !s.when || !!s.when(); } catch (e) { return true; }
          },
          use: (pl) => {
            if (s.cost) { pl.money -= s.cost; N.emit('money', { delta: -s.cost, total: pl.money }); }
            MG.play(s.id, Object.assign({ place: id, side: true }, s.params || {})).then((r) => {
              try { pay(s, r, id); } catch (e) { N.err('minigames.pay', e); }
            });
          },
        });
      });
    }
    return sideIds.length;
  };

  /* ================================================================ boot */
  function onBoot() {
    try {
      if (N.save && N.save.register) {
        N.save.register('minigames', {
          serialize: () => Object.assign(JSON.parse(JSON.stringify(stats)), { ledger: JSON.parse(JSON.stringify(ledger)) }),
          deserialize: (o) => {
            if (!o || typeof o !== 'object') return;
            for (const k of ['best', 'plays', 'wins']) if (o[k] && typeof o[k] === 'object') Object.assign(stats[k], o[k]);
            const l = o.ledger;
            if (l && typeof l === 'object') { ledger.day = l.day == null ? null : l.day; ledger.paid = Object.assign({}, l.paid); ledger.kite = +l.kite || 0; ledger.off = Object.assign({}, l.off); }
          },
        });
      }
    } catch (e) { N.err('minigames.save', e); }
    try { MG.side(true); } catch (e) { N.err('minigames.side', e); }
  }
  N.on('boot', onBoot);
  N.on('world:built', () => { if (sideIds.length) MG.side(true); });
  if (N.world && N.world.built) onBoot();
})();
