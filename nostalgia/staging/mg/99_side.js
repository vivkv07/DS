
  /* ======================================================= side activities */
  // Free-roam access to the minigames at the must-have places, before/alongside the story.
  // Story interactions win over these (priority -1). Turn off with N.minigames.side(false) or
  // N.flags.mg_side_off = true. match: exact place ids, or prefixes ending with '_'.
  const SIDE = (MG.SIDE = [
    { id: 'kite', match: ['home_terrace', 'gulzar_houz'], label: 'Fly a patang', params: { difficulty: 0.35 }, reward: 300 },
    { id: 'antenna', match: ['home', 'friend_home'], label: 'Fix the TV antenna', params: { difficulty: 0.35 }, reward: 200, dx: 14 },
    { id: 'clap', match: ['golconda_fateh_darwaza'], label: 'Clap under the dome', params: { difficulty: 0.4 }, reward: 300 },
    { id: 'brickgame', match: ['video_parlour_'], label: 'Brick game (₹1)', cost: 100, params: { difficulty: 0.4 }, reward: 300 },
    { id: 'cricket', match: ['playground_', 'victory_playground'], label: 'Join gully cricket', params: { difficulty: 0.4 }, reward: 300 },
    { id: 'marbles', match: ['playground_', 'victory_playground'], label: 'Play goli', params: { difficulty: 0.4 }, reward: 200, dx: 22 },
    { id: 'panipuri', match: ['gokul_chat'], label: 'Pani puri challenge (₹5)', cost: 500, params: { difficulty: 0.4 }, reward: 0 },
    { id: 'bargain', match: ['koti_bus_stand', 'rtc_x_roads', 'nampally_station', 'kachiguda_station', 'imlibun_bus_station'], label: 'Haggle with an auto', params: { who: 'auto' }, reward: 0, dx: -18 },
    { id: 'bargain', match: ['banana_cart_'], label: 'Haggle for bananas', params: { who: 'banana' }, reward: 0 },
    { id: 'bargain', match: ['flower_cart_'], label: 'Haggle for flowers', params: { who: 'flower' }, reward: 0 },
  ]);
  const sideIds = [];
  function placeMatches(id, m) { return m.slice(-1) === '_' ? id.indexOf(m) === 0 : id === m; }
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
          enabled: (pl) => !N.flags.mg_side_off && !cur && !(s.cost && (pl.money || 0) < s.cost),
          use: (pl) => {
            if (s.cost) { pl.money -= s.cost; N.emit('money', { delta: -s.cost, total: pl.money }); }
            MG.play(s.id, Object.assign({ reward: s.reward || 0, place: id }, s.params || {})).then((r) => {
              try {
                if (r && r.win && s.reward && N.hud && N.hud.toast) N.hud.toast('+' + U.fmtMoney(s.reward) + ' · ' + (defs[s.id].title || s.id), 2500);
                if (r && r.win && r.savedPaise && N.hud && N.hud.toast) N.hud.toast('Saved ' + U.fmtMoney(r.savedPaise) + '!', 2500);
              } catch (e) { /* ignore */ }
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
          serialize: () => JSON.parse(JSON.stringify(stats)),
          deserialize: (o) => { if (o && typeof o === 'object') for (const k of ['best', 'plays', 'wins']) if (o[k]) Object.assign(stats[k], o[k]); },
        });
      }
    } catch (e) { N.err('minigames.save', e); }
    try { MG.side(true); } catch (e) { N.err('minigames.side', e); }
  }
  N.on('boot', onBoot);
  N.on('world:built', () => { if (sideIds.length) MG.side(true); });
  if (N.world && N.world.built) onBoot();
})();
