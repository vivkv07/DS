/* NOSTALGIA trailer — page-side helper for the story UI shots (story_shots.cjs). Injected into the running game;
 * uses the game as-is (no game source changes): the real prologue cutscene (N.story.prologue), the real dialogue
 * box (N.dialogue) and the real ● REC moment (N.tape.rec).
 *   SP.setup({hud})      UI visible (cutscene layer, dialogue, HUD when hud), but never the #debug box, the touch pad,
 *                        barks or testing-build toasts; no god mode, a believable pocket-money amount
 *   SP.step(n, dt)       advance the virtual clock n frames -> SP.status()
 *   SP.status()          {mode, cs (cutscene step), dlg (current line + typing), osd, rec, counter, toast}
 * CSS transitions / animations normally run on real time (a 4K capture takes ~1 s per frame, so every fade would
 * jump); here every document animation is paused and driven from the virtual clock instead, so the game's own
 * fades (cards, lines, the art crossfade, the blinking OSD) play at their true speed in the 30 fps frames.
 */
(() => {
  'use strict';
  const N = window.N;
  const SP = (window.SP = { log: [], csStep: null });

  // ---- CSS animations on the virtual clock
  const VT = '__spvt';
  function syncAnims(dt) {
    let list;
    try { list = document.getAnimations(); } catch (e) { return; }
    for (const a of list) {
      try {
        if (a[VT] == null) { a[VT] = 0; a.pause(); a.currentTime = 0; continue; }
        a[VT] += dt * 1000;
        a.currentTime = a[VT];
      } catch (e) { /* ignore */ }
    }
  }
  if (!window.__step.__sp) {
    const step0 = window.__step;
    const f = (dt) => { step0(dt); syncAnims(dt); };
    f.__sp = true;
    window.__step = f;
  }

  N.on('cutscene:step', (d) => { SP.csStep = d; SP.log.push({ t: +(window.__vt() / 1000).toFixed(3), ev: 'cs', i: d.i, type: d.type }); });
  N.on('cutscene:end', (d) => { SP.log.push({ t: +(window.__vt() / 1000).toFixed(3), ev: 'cs:end', id: d.id }); });
  N.on('dialogue:line', (d) => { SP.log.push({ t: +(window.__vt() / 1000).toFixed(3), ev: 'line', s: d.speaker, text: String(d.text || '').slice(0, 60) }); });
  N.on('tape:rec', (d) => { SP.log.push({ t: +(window.__vt() / 1000).toFixed(3), ev: 'rec', id: d.id, counter: d.counter }); });
  N.on('tape:token', (d) => { SP.log.push({ t: +(window.__vt() / 1000).toFixed(3), ev: 'token', id: d.id }); });

  SP.setup = function (o) {
    o = o || {};
    // lib-style boots hide the whole UI: drop that
    for (const st of document.querySelectorAll('style')) {
      if (/#overlay/.test(st.textContent) && /#debug/.test(st.textContent) && st.textContent.length < 200) st.remove();
    }
    let st = document.getElementById('sp-style');
    if (!st) { st = document.createElement('style'); st.id = 'sp-style'; document.head.appendChild(st); }
    st.textContent = [
      '#debug,#touch,.bark{display:none!important}',
      o.hud === false ? '#ui{display:none!important}' : '',
      // the cutscene SKIP pill is a hover/hold affordance: not part of the picture
      '.cs-skip{display:none!important}',
      // the world canvas is oversized for camera shake: pin the overlay/UI to the viewport
      '#overlay{position:fixed!important;inset:0!important}',
      o.css || '',
    ].join('\n');
    try { if (N.debug && N.debug.show) N.debug.show(false); } catch (e) { /* ignore */ }
    // no god mode, no testing-build money
    try { if (N.testing) N.testing.unlimitedMoney = false; } catch (e) { /* ignore */ }
    try { N.debug.god(false); } catch (e) { /* ignore */ }
    if (o.money != null) N.player.money = o.money;
    return SP.status();
  };

  /* ---- the story in gameplay: put Chinnu where (and when) a story beat happens, with the people who are there
   * o = {date: [y, m, d, h, mi], at: placeId | [x, y], roof: roof id, angle, npcs: [[id, target, opts]], view,
   *      yaw, pitch, seasons: {name: on}, money (paise)} */
  SP.scene = function (o) {
    const p = N.player;
    try { if (N.dialogue.isOpen()) N.dialogue.cancel(); } catch (e) { /* ignore */ }
    if (o.date) N.calendar.set(o.date[0], o.date[1], o.date[2], o.date[3], o.date[4]);
    N.debug.freezeClock(true);
    if (o.seasons) for (const k in o.seasons) N.seasons.set(k, o.seasons[k]);
    const P = Array.isArray(o.at) ? { x: o.at[0], y: o.at[1] } : N.places[o.at];
    if (o.roof) {
      const RF = N.world.roofs, r = RF.get(o.roof);
      const tx = P ? P.x : r.rect[0] + r.rect[2] / 2, ty = P ? P.y : r.rect[1] + r.rect[3] / 2;
      p.teleport(tx, ty);
      if (p.level !== o.roof) RF.climb(o.roof, 0, p, { instant: true });
      if (P && (Math.abs(p.x - P.x) > 1 || Math.abs(p.y - P.y) > 1)) { p.x = P.x; p.y = P.y; }
    } else if (P) p.teleport(P.x, P.y);
    if (o.angle != null) { p.angle = o.angle; p.facing = o.angle; }
    p.vx = p.vy = 0;
    for (const n of o.npcs || []) { try { N.npcs.spawn(n[0], n[1], Object.assign({ idle: 'stand', talk: false }, n[2] || {})); } catch (e) { console.error('npc', n[0], e); } }
    if (o.money != null) p.money = o.money;
    if (o.view) N.view.set(o.view, { noSave: true });
    if (N.view3d && N.view3d.setCamera) N.view3d.setCamera({ yaw: o.yaw != null ? o.yaw : o.angle, pitch: o.pitch != null ? o.pitch : 0.3, snap: true });
    if (N.render.snapCamera) N.render.snapCamera();
    return { x: Math.round(p.x), y: Math.round(p.y), level: p.level || null, mode: N.state.mode, view: N.view.mode, date: N.calendar.date.label, time: N.clock.label() };
  };

  // the world canvases (2D #game and the 3D canvas): hidden while the prologue art covers them anyway — a visible
  // canvas is re-composited at every yield, which makes stepping ~30x slower
  SP.world = function (on) {
    for (const c of document.querySelectorAll('canvas#game, canvas#game3d, #game3d canvas')) c.style.visibility = on ? '' : 'hidden';
    return Array.from(document.querySelectorAll('canvas')).map((c) => (c.id || c.className) + ':' + c.width + 'x' + c.height + ':' + getComputedStyle(c).visibility);
  };
  SP.status = function () {
    const d = N.dialogue && N.dialogue.current;
    const osd = document.querySelector('.cs-osd.show');
    const toast = Array.from(document.querySelectorAll('.toast')).map((e) => e.textContent).join(' | ');
    let rec = null;
    try { rec = N.tape && N.tape.recState; } catch (e) { /* ignore */ }
    return {
      vt: +(window.__vt() / 1000).toFixed(3), mode: N.state.mode,
      cs: SP.csStep ? SP.csStep.i + ':' + SP.csStep.type : null,
      dlg: d ? { s: d.speaker, typing: !!d.typing, text: String(d.text || '').slice(0, 50) } : null,
      osd: osd ? osd.textContent : null,
      stage: (document.querySelector('.cs-stage') || {}).textContent || '',
      rec: rec ? rec.phase : null, counter: N.tape ? N.tape.shown : null, toast,
    };
  };
  // pacing (the player's ACTION presses): a finished dialogue line is advanced after `line` s, the ▶ PLAY prompt is
  // pressed after `prompt` s; set SP.pace = null to drive it by hand
  SP.pace = { line: 1.6, prompt: 1.6 };
  SP.frame = 0;
  let doneT = 0, promptT = 0;
  function pace(dt) {
    const P = SP.pace;
    if (!P) return;
    const d = N.dialogue && N.dialogue.current;
    if (d && !d.typing && !(d.choices && d.choices.length)) { doneT += dt; if (doneT >= P.line) { doneT = 0; N.dialogue.advance(); } } else doneT = 0;
    const pr = document.querySelector('.cs-card.k-prompt');
    if (pr) { promptT += dt; if (promptT >= P.prompt) { promptT = -1e9; N.input.press('action'); } } else promptT = 0;
  }
  // Every frame is its own task in the real game, so promise chains (cutscene steps, dialogue lines, missions)
  // advance between frames. A synchronous loop of __step calls would starve them: yield a macrotask per frame.
  const mc = new MessageChannel(); let mres = null;
  mc.port1.onmessage = () => { const r = mres; mres = null; if (r) r(); };
  const tick = () => new Promise((r) => { mres = r; mc.port2.postMessage(0); });
  SP.tick = tick;
  async function one(dt) { window.__step(dt); pace(dt); SP.frame++; await tick(); }
  SP.step = async function (n, dt) {
    for (let i = 0; i < n; i++) await one(dt);
    return SP.status();
  };
  // step n frames, returning every status change as [frame, status] (frames counted by SP.frame)
  let lastKey = '';
  SP.run = async function (n, dt) {
    const out = [];
    for (let i = 0; i < n; i++) {
      await one(dt);
      const st = SP.status();
      const key = JSON.stringify([st.mode, st.cs, st.dlg && st.dlg.text, st.dlg && st.dlg.typing, st.osd, st.rec, st.stage.slice(0, 40), st.toast]);
      if (key !== lastKey) { lastKey = key; out.push([SP.frame, st]); }
    }
    return out;
  };
})();
