/* NOSTALGIA — debug.js
 * Test hooks used by every agent's Playwright tests (always present) and the #debug
 * overlay (only with location.hash === '#debug'). Contract: ARCHITECTURE.md §13.
 */
(() => {
  'use strict';
  const N = window.N;
  const SURF_NAMES = Object.keys(N.SURF).reduce((o, k) => { o[N.SURF[k]] = k; return o; }, {});

  const dbg = (N.debug = {
    errors: N.errors,
    newGame(opts) {
      N.game.newGame(Object.assign({ skipIntro: true }, opts || {}));
      return dbg.state();
    },
    /** teleport('charminar') or teleport(x, y). Returns the final {x, y} or null. */
    teleport(a, b) {
      let x, y;
      if (typeof a === 'string') {
        const p = N.places[a];
        if (!p) {
          const lm = (N.WORLD_DATA && N.WORLD_DATA.landmarks || []).find((l) => l.id === a);
          if (!lm) return null;
          x = lm.x; y = lm.y + lm.d / 2 + 16;
        } else { x = p.x; y = p.y; }
      } else { x = +a; y = +b; }
      N.player.teleport(x, y);
      return { x: N.player.x, y: N.player.y };
    },
    give(paise) { N.player.money += Math.round(paise || 0); N.emit('money', { delta: paise, total: N.player.money }); return N.player.money; },
    heal() { N.player.energy = 100; N.player.exhausted = false; return 100; },
    setTime(h, m) { N.clock.set(h, m || 0); return N.clock.label(); },
    freezeClock(on) { N.clock.frozen = on !== false; },
    setWanted(n) { if (N.wanted && N.wanted.set) N.wanted.set(n); return N.wanted ? N.wanted.level : 0; },
    spawnVehicle(type, opts) {
      if (!N.vehicles || !N.vehicles.spawn) return null;
      const p = N.player;
      const a = p.angle || 0;
      let x = p.x + Math.cos(a) * 26, y = p.y + Math.sin(a) * 26;
      const f = N.world.findFree(x, y, 'drive', 20); if (f) { x = f.x; y = f.y; }
      return N.vehicles.spawn(type || 'chetak', x, y, a, opts || {}) || null;
    },
    enterVehicle(type) {
      const v = dbg.spawnVehicle(type);
      if (v && N.vehicles.enter) N.vehicles.enter(N.player, v);
      return v;
    },
    startMission(id) { return N.missions && N.missions.start ? N.missions.start(id) : false; },
    completeMission() { return N.missions && N.missions.complete ? N.missions.complete() : false; },
    skipDialogue(on) { if (N.dialogue) N.dialogue.skip = on !== false; return !!(N.dialogue && N.dialogue.skip); },
    collectAll() { return N.collectibles && N.collectibles.collectAll ? N.collectibles.collectAll() : 0; },
    god(on) { N.player.god = on !== false; return N.player.god; },
    fps() { return N.perf ? N.perf.fps : 0; },
    /** {fps, frameMs (avg CPU ms per frame: update + draw), updateMs, drawMs, chunks, entities, structuresQueued} */
    perf() {
      const p = N.perf || {};
      return { fps: p.fps, frameMs: p.frameMs, updateMs: p.updateMs, drawMs: p.drawMs, chunks: N.render.chunkCount(), entities: N.entities.count(), queued: N.render.stats.queued, chunkBuilds: N.render.stats.chunkBuilds, buildMs: N.world.buildMs };
    },
    state() {
      const p = N.player;
      const m = N.missions && N.missions.active;
      return {
        mode: N.state.mode,
        mission: m ? (m.id || m.def && m.def.id || null) : null,
        objective: (N.hud && N.hud.objectiveText) || null,
        player: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, mode: p.mode, vehicle: p.vehicle ? p.vehicle.type || true : null, energy: Math.round(p.energy), money: p.money },
        clock: N.clock.label(), day: N.clock.day,
        district: (N.world.districtAt(p.x, p.y) || {}).id || null,
        surface: SURF_NAMES[N.world.surfaceAt(p.x, p.y)],
        wanted: N.wanted ? N.wanted.level || 0 : 0,
        errors: N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]),
      };
    },
    surfaceName: (s) => SURF_NAMES[s],
  });

  /* ---------------------------------------------------------- overlay */
  let el = null, timer = 0;
  function buildOverlay() {
    el = document.createElement('div');
    el.id = 'debug';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    setInterval(updateOverlay, 250);
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Backquote') el.classList.toggle('hide');
      if (!e.altKey) return; // Alt+1..4 time presets, Alt+G god mode
      if (e.code === 'Digit1') N.clock.set(7, 0);
      if (e.code === 'Digit2') N.clock.set(12, 0);
      if (e.code === 'Digit3') N.clock.set(17, 30);
      if (e.code === 'Digit4') N.clock.set(21, 0);
      if (e.code === 'KeyG') dbg.god(!N.player.god);
    });
  }
  function updateOverlay() {
    if (!el || el.classList.contains('hide')) return;
    timer++;
    const p = N.player, perf = N.perf || {};
    const d = N.world.built ? N.world.districtAt(p.x, p.y) : null;
    const last = N.errors[N.errors.length - 1];
    el.textContent =
      'FPS ' + perf.fps + '  ' + perf.frameMs + 'ms (u ' + perf.updateMs + ' d ' + perf.drawMs + ')\n' +
      'POS ' + Math.round(p.x) + ',' + Math.round(p.y) + '  ' + (SURF_NAMES[N.world.built ? N.world.surfaceAt(p.x, p.y) : 0] || '?') + '\n' +
      'DST ' + (d ? d.name : '-') + '  ' + N.state.mode + '  ' + N.clock.label() + '\n' +
      'ENT ' + N.entities.count() + '  CHK ' + N.render.chunkCount() + '  Q ' + N.render.stats.queued + '  Z ' + N.render.cam.zoom.toFixed(2) + '\n' +
      'ERR ' + N.errors.length + (last ? '  ' + last.where + ': ' + last.msg.split('\n')[0].slice(0, 80) : '');
    el.classList.toggle('has-err', N.errors.length > 0);
  }
  if (N.DEBUG) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildOverlay);
    else buildOverlay();
  }
})();
