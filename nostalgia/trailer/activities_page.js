/* NOSTALGIA trailer — page-side helper for the full-screen minigame clips (activities.cjs).
 * Injected into the running game; uses N.minigames as-is (no game source changes).
 *   ACT.setup()            show #overlay (openGame hides it) but keep HUD / touch / debug / toasts hidden,
 *                          and hide the minigame key-hint strip + pause pill
 *   ACT.start(id, params)  open a minigame with the test bot (autoplay 'win'), no how-to
 *   ACT.step(n, dt)        advance the virtual clock n frames; returns a short status line
 *   ACT.status()           {phase, t, hud}
 *   ACT.end()              close the open minigame immediately
 */
(() => {
  'use strict';
  const ACT = (window.ACT = {});
  ACT.setup = function () {
    // openGame() appended a style that hides #overlay (the minigames render into it): replace it
    for (const st of document.querySelectorAll('style')) {
      if (/#overlay/.test(st.textContent) && /#debug/.test(st.textContent) && st.textContent.length < 200) st.remove();
    }
    const st = document.createElement('style');
    st.id = 'act-style';
    st.textContent = [
      '#ui,#touch,#debug,.toast,.bark{display:none!important}',
      '#overlay>*:not(.mg-screen){display:none!important}',
      // the world canvas is oversized for camera shake, so <body> can scroll by a few px and let the world
      // peek under the overlay's bottom edge: pin the overlay to the viewport and hide the world canvas
      '#overlay{position:fixed!important;inset:0!important}',
      '#game{visibility:hidden!important}',
      '.mg-hint,.mg-pausebtn{display:none!important}',
      // the opacity fade-in runs on real time: snap it
      '#overlay .mg-screen{transition:none!important;opacity:1!important}',
      '.mg-scan::after{display:none!important}',
      // touch pad (portrait): purely decorative here — no pressed-state jitter from the bot
      'body.act-nopad .mg-pad{display:none!important}',
    ].join('\n');
    document.head.appendChild(st);
    // make sure nothing debug-ish is on screen
    try { if (N.debug && N.debug.show) N.debug.show(false); } catch (e) { /* ignore */ }
  };
  // Determinism: some games (antenna crows, kite falls, sfx jitter) use Math.random. While a minigame frame
  // runs, swap in a seeded PRNG of its own so a low-res survey and the 4K capture play out identically.
  let rs = 1;
  const prng = () => { rs = (rs + 0x6d2b79f5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const G = N.minigames.Game;
  if (G && !G.prototype.frame.__act) {
    const orig = G.prototype.frame;
    const f = function (now) { const mr = Math.random; Math.random = prng; try { return orig.call(this, now); } finally { Math.random = mr; } };
    f.__act = true;
    G.prototype.frame = f;
  }
  // tune: optional per-game overrides of N.minigames.TUNE[id] for this run (restored by ACT.end)
  ACT.start = function (id, params, tune) {
    ACT.untune = null;
    if (tune && N.minigames.TUNE[id]) {
      const T = N.minigames.TUNE[id], old = {};
      for (const k in tune) { old[k] = T[k]; T[k] = tune[k]; }
      ACT.untune = () => Object.assign(T, old);
    }
    const p = Object.assign({ autoplay: 'win', skipHowto: true, noQuit: true, noRetry: true, difficulty: 0.4, timeScale: 1, seed: 7, autoClose: false }, params || {});
    rs = (p.seed | 0) * 7919 + 13;
    ACT.result = null;
    const mr = Math.random; Math.random = prng;
    try { N.minigames.play(id, p).then((r) => { ACT.result = r; }); } finally { Math.random = mr; }
    const g = N.minigames.game;
    return { id: g && g.id, touch: g && g.touch, W: g && g.W, H: g && g.H, dpr: g && g.dpr, portrait: g && g.portrait };
  };
  // Fast pre-roll: point the minigame's 2D context at a 1x1 canvas, so every draw call still runs (same order,
  // same Math.random draws: the game plays out identically) but nothing is rasterised at 4K. off -> real canvas.
  let tiny = null;
  ACT.fast = function (on) {
    const g = N.minigames.game;
    if (!g) return false;
    if (on) {
      if (!tiny) { const c = document.createElement('canvas'); c.width = 1; c.height = 1; tiny = c.getContext('2d'); }
      if (g.ctx !== tiny) { g.realCtx = g.ctx; g.ctx = tiny; }
    } else if (g.realCtx) { g.ctx = g.realCtx; g.realCtx = null; }
    return true;
  };
  ACT.status = function () {
    const g = N.minigames.game;
    if (!g) return { phase: 'none', result: ACT.result };
    let hud = '';
    try { hud = ((g.def.hud && g.def.hud(g)) || []).map((i) => (i.k ? i.k + ' ' : '') + i.v).join(' | '); } catch (e) { hud = 'err'; }
    return { phase: g.phase, t: Math.round(g.t * 100) / 100, over: !!g.over, hud };
  };
  ACT.step = function (n, dt) {
    for (let i = 0; i < n; i++) window.__step(dt);
    return ACT.status();
  };
  ACT.end = function () {
    const g = N.minigames.game;
    if (g) { g.params.instantClose = true; N.minigames.abort('trailer'); }
    if (ACT.untune) { ACT.untune(); ACT.untune = null; }
  };
})();
