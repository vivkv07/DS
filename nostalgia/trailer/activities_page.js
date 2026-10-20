/* NOSTALGIA trailer — page-side helper for the full-screen minigame clips (activities.cjs).
 * Injected into the running game; uses N.minigames as-is (no game source changes).
 *   ACT.setup()            show #overlay (openGame hides it) but keep HUD / touch / debug / toasts hidden,
 *                          and hide the minigame key-hint strip + pause pill
 *   ACT.start(id, params)  open a minigame with the test bot (autoplay 'win'), no how-to
 *   ACT.step(n, dt)        advance the virtual clock n frames; returns a short status line
 *   ACT.status()           {phase, t, hud}
 *   ACT.end()              close the open minigame immediately
 *   ACT.start(id, params, tune, script)  script: [{at: frame, kind, ...}] actions run just before frame `at`
 *                          is stepped (frames counted from start), e.g. a scripted goli shot (see mbShot)
 *   ACT.mbSearch(params, cands)  try scripted marbles shots on fresh games (simulation only) -> outcomes
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
      // the 3-2-1 / "MAARO!" countdown pops (a CSS animation on real time, so it could leak into an early frame)
      '.mg-count{display:none!important}',
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
  ACT.start = function (id, params, tune, script) {
    ACT.untune = null;
    ACT.n = 0; ACT.log = []; drag = null;
    ACT.script = (script || []).slice().sort((a, b) => a.at - b.at);
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
    // a scripted shot replaces the bot's next move: keep the bot's hands off until the script has run
    if (g && g.S && ACT.script.some((a) => a.kind === 'mbShoot' || a.kind === 'mbRelease')) g.S.botT = -1e9;
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
    for (let i = 0; i < n; i++) {
      while (ACT.script && ACT.script.length && ACT.script[0].at <= ACT.n) runAction(ACT.script.shift());
      window.__step(dt);
      ACT.n++;
    }
    return ACT.status();
  };
  function runAction(a) {
    const g = N.minigames.game;
    if (!g) return;
    let r = null;
    if (a.kind === 'mbPos') r = mbPos(g, a.pos);
    else if (a.kind === 'mbShoot') r = mbShoot(g, a.aimOff, a.power);
    else if (a.kind === 'mbDrag') r = mbDrag(g, a.aimOff, a.power);
    else if (a.kind === 'mbRelease') r = mbRelease(g);
    (ACT.log || (ACT.log = [])).push({ n: ACT.n, kind: a.kind, r });
  }

  /* ---- goli (marbles): a scripted shot through the game's own pointer input (tap outside the ring = move the
   * shooting spot; drag back from the striker + let go = flick), as a player would do it. World units: ring
   * radius 16, the shooting spot sits on R + 2.2. */
  const MB_R = 16;
  function mbScr(S, wx, wy) { return [S.L.cx + wx * S.L.s, S.L.cy + wy * S.L.s]; }
  function mbPos(g, pos) {
    const S = g.S, def = g.def;
    if (!S || S.turn !== 'me' || S.stage !== 'aim' || S.again) return { err: 'not aiming from the edge' };
    const tx = Math.cos(pos) * (MB_R + 6), ty = Math.sin(pos) * (MB_R + 6), st = S.striker;
    if (Math.hypot(tx - st.x, ty - st.y) <= 3.2) { // a tap that close to the striker would start a drag: hop via the far side
      const [hx, hy] = mbScr(S, -tx, -ty); def.pointer(g, 'down', hx, hy, 901); def.pointer(g, 'up', hx, hy, 901);
    }
    const [x, y] = mbScr(S, tx, ty); def.pointer(g, 'down', x, y, 902); def.pointer(g, 'up', x, y, 902);
    return { pos: S.pos };
  }
  function mbShoot(g, aimOff, power) {
    const S = g.S, def = g.def;
    if (!S || S.turn !== 'me' || S.stage !== 'aim') return { err: 'not aiming' };
    const st = S.striker, [x0, y0] = mbScr(S, st.x, st.y);
    const aim = Math.atan2(-st.y, -st.x) + (aimOff || 0), len = Math.max(0.1, Math.min(1, power)) * S.L.dragMax;
    def.pointer(g, 'down', x0, y0, 903);
    def.pointer(g, 'move', x0 - Math.cos(aim) * len, y0 - Math.sin(aim) * len, 903);
    const a = S.aim, pw = S.power;
    def.pointer(g, 'up', x0 - Math.cos(aim) * len, y0 - Math.sin(aim) * len, 903);
    S.botT = 0; // the bot plays on from here ("PHIR SE MAARO" = it shoots again)
    return { aim: a, power: pw, rolling: S.stage === 'roll' };
  }
  // the same flick in slow motion: drag back over a few frames (slingshot band + power bar show), then let go
  let drag = null;
  function mbDrag(g, aimOff, power) {
    const S = g.S, def = g.def;
    if (!S || S.turn !== 'me' || S.stage !== 'aim') return { err: 'not aiming' };
    const st = S.striker, [x0, y0] = mbScr(S, st.x, st.y);
    if (!drag) { def.pointer(g, 'down', x0, y0, 904); drag = { x0, y0 }; }
    const aim = Math.atan2(-st.y, -st.x) + (aimOff || 0), len = Math.max(0.1, Math.min(1, power)) * S.L.dragMax;
    drag.x = drag.x0 - Math.cos(aim) * len; drag.y = drag.y0 - Math.sin(aim) * len;
    def.pointer(g, 'move', drag.x, drag.y, 904);
    return { aim: S.aim, power: S.power };
  }
  function mbRelease(g) {
    const S = g.S, def = g.def;
    if (!drag || !S) return { err: 'no drag' };
    const a = S.aim, pw = S.power;
    def.pointer(g, 'up', drag.x, drag.y, 904);
    drag = null;
    S.botT = 0;
    return { aim: a, power: pw, rolling: S.stage === 'roll' };
  }
  // try shots on fresh games, simulating only the minigame (its update at 60 Hz, as the frame loop does)
  ACT.mbSearch = function (params, cands, opt) {
    opt = opt || {};
    const out = [];
    for (const c of cands) {
      ACT.start('marbles', params, null, [{ at: 0, kind: 'mbShoot' }]);
      const g = N.minigames.game, S = g.S;
      const p0 = S.balls.map((b) => [b.x, b.y]);
      if (c.pos != null) mbPos(g, c.pos);
      mbShoot(g, c.aimOff, c.power);
      let n = 0, firstOut = -1;
      const h = (opt.h || 1 / 60) * (1 + (c.eps || 0)); // = the frame loop's substep: dt * timeScale / ceil(dt * timeScale * 60)
      while (S.stage === 'roll' && n < (opt.max || 900)) {
        g.def.update(g, h); n++;
        if (firstOut < 0 && S.balls.some((b) => Math.hypot(b.x, b.y) > MB_R + b.r * 0.2)) firstOut = n;
      }
      out.push({ c, me: S.me, again: !!S.again, stage: S.stage, sub: n, firstOut, left: S.balls.length, over: !!g.over,
        jack: !S.balls.some((b) => b.jack), sr: S.striker ? +Math.hypot(S.striker.x, S.striker.y).toFixed(2) : null });
      ACT.end();
    }
    return out;
  };
  ACT.end = function () {
    const g = N.minigames.game;
    if (g) { g.params.instantClose = true; N.minigames.abort('trailer'); }
    if (ACT.untune) { ACT.untune(); ACT.untune = null; }
  };
})();
