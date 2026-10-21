/* NOSTALGIA — main.js
 * Boot (fonts with a 1.5 s timeout, world build, systems init), title -> play, the
 * requestAnimationFrame loop with a semi-fixed update step (equal sub-steps of at most
 * 1/60 s, at most 2 (low tier) / 3 sub-steps of real time per frame, the rest of a slow frame dropped) and the
 * per-frame draw order (ARCHITECTURE §6),
 * pause (and a silent save when allowed) on visibility change / pagehide, and N.game (newGame / continueGame / quitToTitle / snapshot).
 */
(() => {
  'use strict';
  const N = window.N;

  const MAX_STEP = 1 / 60;
  const TIME_MODES = { play: 1, dialogue: 1, cutscene: 1, minigame: 1, gameover: 1 }; // modes where game time advances
  const PAUSABLE = { play: 1, dialogue: 1 }; // N.game.pause() works here (cutscenes/minigames run their own)

  const perf = { fps: 60, frameMs: 0, updateMs: 0, drawMs: 0, steps: 1, slow: 0, frames: 0, _acc: 0, _n: 0, _work: 0, _upd: 0, _drw: 0, _steps: 0, _drop: 0, hist: [] };
  N.perf = perf;

  /* ------------------------------------------------------------- game */
  const game = (N.game = {
    started: false,
    /** Start a fresh game. opts: {skipIntro} — story listens to 'game:new' to run the intro. */
    newGame(opts) {
      opts = opts || {};
      for (const k of Object.keys(N.flags)) delete N.flags[k];
      N.clock.day = 0; N.clock.set(opts.hour == null ? 16 : opts.hour, opts.minute == null ? 40 : opts.minute);
      N.clock.frozen = false;
      N.time.now = 0;
      N.render.camOverride = null; N.render.follow = null;
      N.render.fx.vhs = 0; N.render.fx.fade = 0; N.render.fx.flash = 0;
      N.systems.reset();
      N.state.set('play');
      if (N.menus && N.menus.hideAll) { try { N.menus.hideAll(); } catch (e) { N.err('menus.hideAll', e); } }
      N.render.snapCamera();
      N.render.warmChunks(N.player.x, N.player.y, 520);
      game.started = true;
      N.emit('game:new', opts);
      return true;
    },
    continueGame() {
      let ok = false;
      try { ok = !!(N.save && N.save.has && N.save.has() && N.save.load()); } catch (e) { N.err('continue', e); }
      if (!ok) return game.newGame({});
      N.state.set('play');
      if (N.menus && N.menus.hideAll) N.menus.hideAll();
      N.render.camOverride = null;
      N.render.snapCamera();
      N.render.warmChunks(N.player.x, N.player.y, 520);
      game.started = true;
      N.emit('game:continue', {});
      return true;
    },
    quitToTitle() {
      N.state.set('title');
      N.emit('game:quit', {});
      if (N.menus && N.menus.title) N.menus.title();
    },
    /** Pause from free roam or mid-conversation (PAUSABLE); resume() returns to that mode. */
    pause() {
      if (!PAUSABLE[N.state.mode]) return false;
      N.state.push('paused');
      N.emit('game:pause', {});
      if (N.menus && N.menus.pause) { try { N.menus.pause(); } catch (e) { N.err('menus.pause', e); } }
      return true;
    },
    resume() {
      if (N.state.mode !== 'paused') return false;
      N.state.pop();
      N.emit('game:resume', {});
      return true;
    },
    /** Small state blob for hot reload (window.claude.hot). */
    snapshot() {
      return {
        mode: N.state.mode === 'title' || N.state.mode === 'boot' ? 'title' : 'play',
        player: N.player && N.player.serialize ? N.player.serialize() : null,
        clock: N.clock.serialize(), flags: Object.assign({}, N.flags),
      };
    },
  });

  /* ------------------------------------------------------------- loop */
  let last = 0;
  function step(h) {
    N.time.dt = h;
    N.time.frame++;
    if (TIME_MODES[N.state.mode]) N.time.now += h;
    N.systems.update(h);
  }

  function render(dt) {
    const R = N.render, ms = R.stats.ms;
    let t = performance.now(), t1;
    // 3D view (ARCHITECTURE §20): no 2D world / entity draw; systems still draw (HUD minimap,
    // dialogue barks; their 2D queue items are dropped by view3d), then the WebGL scene renders.
    const V3 = N.view3d;
    if (V3 && V3.active) {
      try { R.begin(); } catch (e) { N.err('render.begin', e); }
      try { V3.beginFrame(dt); } catch (e) { N.err('view3d.beginFrame', e); }
      N.systems.draw();
      try { V3.render(dt); } catch (e) { N.err('view3d.render', e); }
      ms.flush = performance.now() - t;
      return;
    }
    try { R.begin(); } catch (e) { N.err('render.begin', e); }
    try { N.world.draw(); } catch (e) { N.err('world.draw', e); }
    t1 = performance.now(); ms.enqWorld = t1 - t; t = t1;
    try { N.entities.draw(); } catch (e) { N.err('entities.draw', e); }
    N.systems.draw();
    t1 = performance.now(); ms.enqOther = t1 - t; t = t1;
    try { R.flush(dt); } catch (e) { N.err('render.flush', e); }
    ms.flush = performance.now() - t;
  }

  // Sub-step cap (audit PERF-07): a slow frame used to buy up to 6 sub-steps (0.1 s / (1/60)), which made the next
  // frame slower still (5-6 steps per frame on a 4x-throttled phone). At most MAX_SUB steps of real time are now
  // simulated per frame — 2 on the low tier (phones: view3d's tier, else a coarse pointer), 3 elsewhere — and the
  // rest of a long frame is dropped (game time runs slower than the wall clock below 30 / 20 fps instead of
  // spiralling). N.time.scale still multiplies the simulated time (slow motion, test fast-forward). The step size
  // stays <= 1/60 s, so physics / collision behave as before. N.time.maxSub (tests) overrides the cap.
  let lowTier = null, tierAt = -1e9;
  function maxSub(now) {
    if (N.time.maxSub > 0) return N.time.maxSub;
    if (now - tierAt > 2000) { // cheap, but no need to ask matchMedia every frame
      tierAt = now;
      const q = N.view3d && N.view3d.quality;
      if (q && q.tier) lowTier = q.tier === 'low';
      else { try { lowTier = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { lowTier = false; } }
    }
    return lowTier ? 2 : 3;
  }

  // Layout read phase (audit PERF-15): systems that measure the DOM (speech-bubble sizes, the canvas rect, the HUD
  // keep-out rects) do it in read(), here, before this frame's updates and draws write anything, while the layout
  // the browser computed for the last frame is still valid. A getBoundingClientRect / offsetWidth after a style
  // write forces a synchronous style + layout pass (one per bubble per frame before this).
  function readLayout() {
    const L = N.systems.list;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (s.read) { try { s.read(); } catch (e) { N.err('read:' + s.id, e); } }
    }
  }

  function frame(t) {
    requestAnimationFrame(frame);
    let dt = last ? (t - last) / 1000 : 1 / 60;
    last = t;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    const t0 = performance.now();
    readLayout();
    // the frame's simulated span (real seconds, before N.time.scale): the camera, render effects and N.time.real
    // use it too, so a capped frame looks like a frame of a slower game (no camera lurch against the world)
    let sim = dt;
    if (dt > 0) {
      const cap = maxSub(t0) * MAX_STEP;
      if (dt > cap + 1e-4) sim = cap;
      if (sim < dt && TIME_MODES[N.state.mode]) perf._drop += dt - sim;
      const scaled = sim * (N.time.scale == null ? 1 : N.time.scale);
      const n = Math.max(1, Math.ceil(scaled / MAX_STEP - 1e-3));
      const h = scaled / n;
      for (let i = 0; i < n; i++) step(h);
      perf._steps += n;
    }
    const t1 = performance.now();
    render(sim);
    const t2 = performance.now();
    N.time.real += sim;
    // perf stats (1 s window)
    perf.frames++;
    perf._acc += dt; perf._n++; perf._work += t2 - t0; perf._upd += t1 - t0; perf._drw += t2 - t1;
    if (perf._acc >= 1) {
      perf.fps = Math.round(perf._n / perf._acc);
      perf.frameMs = +(perf._work / perf._n).toFixed(2);
      perf.updateMs = +(perf._upd / perf._n).toFixed(2);
      perf.drawMs = +(perf._drw / perf._n).toFixed(2);
      perf.steps = +(perf._steps / perf._n).toFixed(2); // sub-steps per frame (capped: see maxSub)
      perf.slow = +(perf._drop / perf._acc).toFixed(3); // share of wall time not simulated (0 = full speed)
      perf.hist.push(perf.frameMs); if (perf.hist.length > 30) perf.hist.shift();
      perf._acc = perf._n = perf._work = perf._upd = perf._drw = perf._steps = perf._drop = 0;
    }
  }

  /* ------------------------------------------------------------- boot */
  const nextTask = () => new Promise((r) => setTimeout(r, 0));
  function waitFonts(timeout) {
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      setTimeout(fin, timeout);
      try {
        if (document.fonts && document.fonts.load) {
          // Telugu: load the glyph subset the district card's subtitle uses (unicode-range)
          Promise.all([["16px 'Yatra One'"], ["16px 'Baloo 2'"], ["16px 'VT323'"], ["700 16px 'Noto Sans Telugu'", 'తెలుగు']].map((f) => document.fonts.load(f[0], f[1]).catch(() => null)))
            .then(() => document.fonts.ready).then(fin, fin);
        } else fin();
      } catch (e) { fin(); }
    });
  }

  async function start(hotData) {
    hotData = hotData || {};
    N.state.set('boot');
    document.body.classList.add('booting');
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.body.classList.add('reduced-motion');
    } catch (e) { /* ignore */ }
    N.render.init();
    // (audit round 2, PERF-08) the world is built in ~40 ms slices while the fonts load (it needs no fonts): the
    // main thread is never blocked for the whole 0.5-3.7 s build, and the splash counts up
    const fonts = waitFonts(1500);
    const osd = document.querySelector('#boot .boot-osd');
    const onProg = (d) => { if (osd && d && d.done > 0) osd.textContent = '\u25B6 LOADING\u2026 ' + Math.round(d.done * 100) + '%'; };
    N.on('world:progress', onProg);
    try {
      if (N.world.buildAsync) await N.world.buildAsync(40, fonts); else { await fonts; N.world.build(); }
    } catch (e) { N.err('world.build', e); }
    N.off('world:progress', onProg);
    await fonts;
    await nextTask(); // the build's last slice ran the 'world:built' listeners: let the browser breathe
    N.systems.init();
    await nextTask();
    N.player.reset();
    N.render.cam.x = N.player.x; N.render.cam.y = N.player.y;
    N.render.snapCamera();
    document.body.classList.remove('booting');
    document.body.classList.add('booted');
    N.emit('boot', {});

    if (hotData.mode === 'play' && hotData.player) {
      // hot reload: drop straight back into play where we were
      game.newGame({ skipIntro: true });
      try {
        N.player.deserialize(hotData.player);
        N.clock.deserialize(hotData.clock);
        Object.assign(N.flags, hotData.flags || {});
        N.player.teleport(N.player.x, N.player.y);
      } catch (e) { N.err('hot.restore', e); }
    } else {
      N.state.set('title');
      if (N.menus && N.menus.title) { try { N.menus.title(); } catch (e) { N.err('menus.title', e); } }
    }
    requestAnimationFrame(frame);
    afterBoot();
  }

  // Work that used to run before the title screen and is only needed once play starts: the ground
  // chunks around the player (newGame / continueGame warm them again anyway; this just makes that
  // instant) and the minimap image (~3000 x 2250 px, a ~0.25 s paint that otherwise lands on the
  // first play frame). Done in idle slices while the title screen is up, one chunk per slice.
  function afterBoot() {
    const ric = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 }) : (fn) => setTimeout(() => fn({ timeRemaining: () => 8, didTimeout: false }), 50);
    const R = N.render, CH = 256, r = 520, px = N.player.x, py = N.player.y;
    const todo = [];
    const i0 = Math.max(0, Math.floor((px - r) / CH)), i1 = Math.min(Math.ceil(N.WORLD_W / CH) - 1, Math.floor((px + r) / CH));
    const j0 = Math.max(0, Math.floor((py - r) / CH)), j1 = Math.min(Math.ceil(N.WORLD_H / CH) - 1, Math.floor((py + r) / CH));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) todo.push(i, j);
    let k = 0, mapDone = false;
    const slice = (dl) => {
      if (game.started || N.state.mode !== 'title') return; // play began: newGame / continueGame did their own warm-up
      try {
        while (k < todo.length && (dl.didTimeout || dl.timeRemaining() > 4)) { R.warmChunks((todo[k] + 0.5) * CH, (todo[k + 1] + 0.5) * CH, 1); k += 2; }
        if (k >= todo.length && !mapDone && (dl.didTimeout || dl.timeRemaining() > 8)) { mapDone = true; if (N.hud && N.hud.mapImage) N.hud.mapImage(); }
      } catch (e) { N.err('boot.idle', e); mapDone = true; k = todo.length; }
      if (k < todo.length || !mapDone) ric(slice);
    };
    setTimeout(() => ric(slice), 1000);
  }

  // Save (silently, when allowed) as the tab is hidden or the page goes away: mobile browsers
  // kill background tabs without warning. hide + pagehide usually fire together: save once.
  let lastHideSave = 0;
  function saveOnHide(why) {
    try {
      const now = Date.now();
      if (now - lastHideSave < 1000 || !game.started || !N.save || !N.save.autosave) return;
      lastHideSave = now;
      N.save.autosave('autosave');
    } catch (e) { N.err('save.' + why, e); }
  }
  // Pause when the tab is hidden; resync the clock when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveOnHide('hidden'); game.pause(); }
    last = 0;
  });
  window.addEventListener('pagehide', () => saveOnHide('pagehide'));

  // Hot-reload support (optional runtime): provide a snapshot, then boot.
  try {
    const hot = window.claude?.hot;
    if (hot && typeof hot === 'object' && !hot.snapshot) hot.snapshot = () => game.snapshot();
  } catch (e) { /* runtime may freeze it; that's fine */ }

  const boot = () => (window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {}));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
