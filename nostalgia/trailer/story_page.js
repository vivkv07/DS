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
      'html.sp-ff body{visibility:hidden!important}',
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

  /** a fresh game (no prologue) in the 3D third-person view at full device resolution */
  SP.start3D = async function (scale, css) {
    if (!SP.started3D) {
      SP.started3D = true;
      SP.setup({ hud: true, css });
      N.menus.quickStart = true;
      N.debug.newGame({ skipIntro: true });
      SP.setup({ hud: true, money: 1850, css }); // after newGame: no god mode, a believable ₹18.50 in the pocket
      N.view3d.setQuality({ adaptive: false, pixelRatio: scale || 1, maxPixelRatio: scale || 1, drawDist: 1500 });
      N.view.set('tps', { noSave: true });
      for (let k = 0; k < 3000 && !(N.view3d.active && N.models3d && N.models3d.ready); k++) await SP.step(1, 1 / 30);
    }
    return { active: N.view3d.active, models: !!(N.models3d && N.models3d.ready) };
  };
  /** stream the chunks / landmarks around the player, then let traffic, people and the camera settle */
  SP.settle3D = async function (frames) {
    for (let k = 0; k < 3; k++) N.view3d.settle(30000);
    await SP.step(frames || 45, 1 / 30);
    N.view3d.settle(30000);
  };

  /* ---- the cold open's framing (trailer camera on the game's own cutscene) */
  /** a short tap on the cutscene layer: exactly what a player's tap does (menus.js: < 320 ms -> next card / line) */
  SP.csTap = function () {
    const r = document.querySelector('#overlay .mn-cs');
    if (!r) return false;
    // a tap goes to the dialogue box while it is open: the box of a finished say step closes 30 ms (real time) later,
    // which fast virtual frames can outrun — close the idle box first
    try { if (N.dialogue.isOpen() && !N.dialogue.current) N.dialogue.cancel(); } catch (e) { /* ignore */ }
    r.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, bubbles: true }));
    r.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, bubbles: true }));
    return true;
  };
  /** The prologue's cassette art writes 'SIDE A - HYDERABAD 2003' in a 7px monospace font that is ~8 art px wider
   *  than the label it sits on (story.js prologueArt 'cassette'), so '03' is drawn off the label, dark on dark. For a
   *  close-up the line is fitted to the label (canvas fillText maxWidth); same font, same place. */
  SP.fixLabel = function () {
    const P = CanvasRenderingContext2D.prototype;
    if (P.fillText.__sp) return;
    const ft = P.fillText;
    const f = function (t, x, y, mw) {
      if (mw == null && t === 'SIDE A - HYDERABAD 2003' && this.canvas && this.canvas.classList && this.canvas.classList.contains('st-art')) return ft.call(this, t, x, y, 205 - x);
      return mw == null ? ft.call(this, t, x, y) : ft.call(this, t, x, y, mw);
    };
    f.__sp = true;
    P.fillText = f;
  };
  /** framing of the prologue art (320x180 pixel art, scaled to the screen): {s, o: 'x% y%'} | null (as the game shows it).
   *  Also sets body[data-spcut] so the trailer CSS can scope rules to one cut. */
  SP.frameArt = function (cut, F) {
    document.body.dataset.spcut = cut || '';
    const c = document.querySelector('#overlay canvas.st-art');
    if (!c) return false;
    c.style.transformOrigin = F ? F.o : '';
    c.style.transform = F && F.s !== 1 ? 'scale(' + F.s + ')' : '';
    return true;
  };
  /** hide the cutscene's current text card (a card the trailer cuts out) */
  SP.hideCard = function () { const b = document.querySelector('#overlay .cs-stage > .cs-text:last-child'); if (b) b.classList.add('sp-hide'); return !!b; };
  /** ◀◀ REWIND on the score's year ticks. The game's vhs step shows round(2026 - 23 * ease(p)) with p = its tween
   *  time / 2.6 s (menus.js STEPS.vhs, cubic in-out). Given the frames F[j] (cut-relative) where the year should become
   *  2026 - j, plan p for every frame of the cut, then each frame set N.time.scale so the cutscene clock lands on it:
   *  the year shown is still computed and drawn by the game. */
  const easeInv = (e) => (e < 0.5 ? Math.cbrt(e / 4) : 1 - Math.cbrt(2 * (1 - e)) / 2);
  SP.rewindPlan = function (F, n, pEnd) {
    const P = [];
    const last = F.length - 1; // F[0] = the first tick (still 2026), F[last] = the landing (2026 - last)
    for (let c = 0; c <= n; c++) {
      let q;
      if (c >= F[last]) q = null;
      else {
        let j = 0; while (j + 1 <= last && F[j + 1] <= c) j++;
        // year 2026 - j is on screen: 23 * ease(p) in [j - 0.5, j + 0.5)
        const a = j === 0 ? 0 : F[j], b = F[j + 1];
        const u = (c - a) / Math.max(1, b - a);
        q = j === 0 ? 0.45 * u : j - 0.45 + 0.9 * u; // (clear of the .5 rounding edges)
      }
      P.push(q == null ? null : easeInv(Math.min(0.9999, q / 23)));
    }
    // after the landing: from the landing value on to pEnd (2003 stays, the VHS envelope runs out)
    const c0 = F[last], p0 = easeInv((23 - 0.45) / 23);
    for (let c = c0; c <= n; c++) P[c] = p0 + (pEnd - p0) * Math.min(1, (c - c0) / Math.max(1, n - c0));
    SP.rw = { P, i: 0 };
    return P.map((x) => +x.toFixed(4));
  };
  SP.rewindStep = function (i) { const R = SP.rw; if (!R) return; N.time.scale = Math.max(0, (R.P[i + 1] - R.P[i]) * 2.6 * 30); };
  SP.rewindEnd = function () { N.time.scale = 1; SP.rw = null; };

  // the world canvases (2D #game and the 3D canvas): hidden while the prologue art covers them anyway — a visible
  // canvas is re-composited at every yield, which makes stepping ~30x slower
  SP.world = function (on) {
    for (const c of document.querySelectorAll('canvas#game, canvas#game3d, #game3d canvas')) c.style.visibility = on ? '' : 'hidden';
    // ... and not drawn at all (the 2D city draw is most of a frame's cost; the game itself keeps running)
    if (!on && !SP.draws) { SP.draws = [N.world.draw, N.entities.draw]; N.world.draw = () => {}; N.entities.draw = () => {}; }
    else if (on && SP.draws) { N.world.draw = SP.draws[0]; N.entities.draw = SP.draws[1]; SP.draws = null; }
    return Array.from(document.querySelectorAll('canvas')).map((c) => (c.id || c.className) + ':' + c.width + 'x' + c.height + ':' + getComputedStyle(c).visibility);
  };
  SP.status = function () {
    const d = N.dialogue && N.dialogue.current;
    const osd = document.querySelector('.cs-osd.show');
    const toast = Array.from(document.querySelectorAll('.hud-toast')).map((e) => e.textContent).join(' | ');
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
  /** step until a story moment begins: {cs: i} (cutscene step i starts), {line: 'text'} (a dialogue line containing
   *  text is on screen), {typed: 'text'} (that line has finished typing), {chars: n} (the line on screen has typed n
   *  characters), {fn: 'js expr'}; -> frames stepped | -1 */
  SP.until = async function (spec, dt, max) {
    const hit = () => { // every condition given must hold
      const d = N.dialogue && N.dialogue.current;
      if (spec.cs != null && !(SP.csStep && SP.csStep.i >= spec.cs)) return false;
      if (spec.line != null && !(d && String(d.text || '').indexOf(spec.line) >= 0)) return false;
      if (spec.typed != null && !(d && !d.typing && String(d.text || '').indexOf(spec.typed) >= 0)) return false;
      if (spec.chars != null && !(d && (!d.typing || document.querySelectorAll('.dlg.show .dlg-text .c.on').length >= spec.chars))) return false;
      if (spec.fn && !(0, eval)(spec.fn)) return false;
      return true;
    };
    for (let k = 0; k < (max || 4000); k++) { if (hit()) return k; await one(dt); }
    return -1;
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
