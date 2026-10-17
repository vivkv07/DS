/* NOSTALGIA — input.js
 * Keyboard + gamepad + touch (floating joystick, ACTION/RUN/HORN, MAP/PAUSE) -> N.input.
 * Edges (pressed/released) are computed once per update step by the 'input' system
 * (order 0, runs in every mode). Contract: ARCHITECTURE.md §9.
 * 3D view (ARCHITECTURE §20): action 'view' (V / pad R3 / the touch VIEW pill) cycles the view;
 * while N.view.is3D() in 'play', N.input.move is rotated by the camera yaw (N.view.yaw) so "up" is
 * forward (N.input.rawMove keeps the screen-relative vector). Look input for the 3D camera:
 * mouse drag or pointer lock on canvas#game3d, the right-half touch look zone (.t-look) and the
 * gamepad right stick -> N.input.look {dx, dy (px since the last takeLook()), stickX, stickY,
 * dragging, locked}; N.input.takeLook() returns and clears the accumulated deltas.
 */
(() => {
  'use strict';
  const N = window.N;
  const { clamp } = N.util;

  const ACTIONS = ['up', 'down', 'left', 'right', 'action', 'run', 'horn', 'map', 'journal', 'pause', 'radio', 'view'];
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyE: 'action', KeyF: 'action', Enter: 'action', NumpadEnter: 'action',
    ShiftLeft: 'run', ShiftRight: 'run', Space: 'horn',
    KeyM: 'map', KeyJ: 'journal', Escape: 'pause', KeyP: 'pause', KeyQ: 'radio', KeyR: 'radio',
    KeyV: 'view',
  };
  // Gamepad "standard" mapping (11 = right-stick click cycles the 3D view)
  const PADMAP = { 0: 'action', 1: 'horn', 2: 'run', 3: 'radio', 4: 'journal', 5: 'run', 7: 'run', 8: 'map', 9: 'pause', 11: 'view', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

  const keyDown = Object.create(null);   // code -> bool
  const touchDown = Object.create(null); // action -> bool
  const padDown = Object.create(null);   // action -> bool
  const synHold = Object.create(null);   // action -> seconds remaining (Infinity = held)
  const pendingPress = Object.create(null);
  const prevDown = Object.create(null);
  const cur = { down: Object.create(null), pressed: Object.create(null), released: Object.create(null), consumed: Object.create(null) };

  const stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 }; // touch joystick (-1..1)
  const padMove = { x: 0, y: 0 };
  let synMove = null;
  // 3D camera look input (consumed by view3d.js each frame)
  const look = { dx: 0, dy: 0, stickX: 0, stickY: 0, dragging: false, locked: false, source: null };

  const input = {
    ACTIONS, KEYMAP,
    move: { x: 0, y: 0 },
    rawMove: { x: 0, y: 0 }, // move before the 3D camera rotation (screen-relative)
    look,
    /** Accumulated look deltas (px) since the last call, then cleared. */
    takeLook() { const r = { dx: look.dx, dy: look.dy }; look.dx = look.dy = 0; return r; },
    addLook(dx, dy) { look.dx += +dx || 0; look.dy += +dy || 0; }, // synthetic look (tests, scripts)
    analog: false,          // true when move came from joystick/gamepad stick this step
    device: 'keyboard',
    touchUI: false,         // touch controls visible
    actionLabel: null,
    down: (a) => !!cur.down[a] && !cur.consumed[a],
    pressed: (a) => !!cur.pressed[a] && !cur.consumed[a],
    released: (a) => !!cur.released[a] && !cur.consumed[a],
    consume(a) { cur.consumed[a] = true; },
    anyPressed() { for (const a of ACTIONS) if (input.pressed(a)) return true; return false; },
    // Synthetic input for tests/cutscenes: press(a) = one tap; press(a, sec) holds for sec.
    press(a, sec) { pendingPress[a] = (pendingPress[a] || 0) + 1; synHold[a] = Math.max(synHold[a] || 0, sec || 0.05); },
    hold(a, on) { if (on) { synHold[a] = Infinity; pendingPress[a] = (pendingPress[a] || 0) + 1; } else synHold[a] = 0; },
    // setMove(x, y, analog=true) overrides the move vector until setMove(null)
    setMove(x, y, analog) { synMove = x == null ? null : { x: clamp(x, -1, 1), y: clamp(y == null ? 0 : y, -1, 1), analog: analog !== false }; },
    clear() {
      for (const k in keyDown) keyDown[k] = false;
      for (const k in touchDown) touchDown[k] = false;
      for (const k in synHold) synHold[k] = 0;
      synMove = null;
      resetStick();
    },
    setActionLabel(text) {
      text = text || null;
      if (text === input.actionLabel) return;
      input.actionLabel = text;
      if (dom.actLabel) {
        dom.actLabel.textContent = text || 'ACTION';
        dom.act.classList.toggle('has-ctx', !!text);
      }
      if (dom.prompt) {
        dom.promptText.textContent = text || '';
        dom.prompt.classList.toggle('show', !!text);
      }
    },
    // Relabel a touch button, e.g. setLabel('run', 'BRAKE') in vehicles. null restores default.
    setLabel(action, text) {
      const b = dom.btns && dom.btns[action]; if (!b) return;
      b.querySelector('.t-txt').textContent = text || b.dataset.def;
    },
    showTouch(on) {
      input.touchUI = !!on;
      document.body.classList.toggle('touch-on', !!on);
    },
    update(dt) {
      pollGamepad();
      for (const a of ACTIONS) {
        if (synHold[a] > 0) synHold[a] -= dt;
        const d = keyDownFor(a) || !!touchDown[a] || !!padDown[a] || synHold[a] > 0;
        const p = (pendingPress[a] || 0) > 0 || (d && !prevDown[a]);
        cur.pressed[a] = p;
        cur.released[a] = !d && !!prevDown[a];
        cur.down[a] = d;
        cur.consumed[a] = false;
        prevDown[a] = d;
        pendingPress[a] = 0;
      }
      computeMove();
    },
  };
  N.input = input;

  function keyDownFor(a) {
    for (const code in KEYMAP) if (KEYMAP[code] === a && keyDown[code]) return true;
    return false;
  }

  function computeMove() {
    let x = 0, y = 0, analog = false;
    if (synMove) { x = synMove.x; y = synMove.y; analog = synMove.analog; }
    else if (stick.active && (stick.x || stick.y)) { x = stick.x; y = stick.y; analog = true; }
    else if (padMove.x || padMove.y) { x = padMove.x; y = padMove.y; analog = true; }
    else {
      x = (keyDownFor('right') || padDown.right ? 1 : 0) - (keyDownFor('left') || padDown.left ? 1 : 0);
      y = (keyDownFor('down') || padDown.down ? 1 : 0) - (keyDownFor('up') || padDown.up ? 1 : 0);
      if (synHold.right > 0) x += 1; if (synHold.left > 0) x -= 1;
      if (synHold.down > 0) y += 1; if (synHold.up > 0) y -= 1;
      x = clamp(x, -1, 1); y = clamp(y, -1, 1);
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    input.rawMove.x = x; input.rawMove.y = y;
    // 3D view: "up" means the camera's forward direction (world angle N.view.yaw)
    const V = N.view;
    if (V && V.is3D && V.is3D() && N.state.mode === 'play' && isFinite(V.yaw) && (x || y)) {
      const c = Math.cos(V.yaw), s = Math.sin(V.yaw), f = -y, r = x;
      x = f * c - r * s; y = f * s + r * c;
    }
    input.move.x = x; input.move.y = y; input.analog = analog;
  }

  function setDevice(d) {
    if (input.device === d) return;
    input.device = d;
    document.body.classList.toggle('dev-touch', d === 'touch');
    document.body.classList.toggle('dev-pad', d === 'gamepad');
    if (d === 'touch') input.showTouch(true);
    N.emit('input:device', d);
  }

  /* ------------------------------------------------------------- keyboard */
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    if (!e.repeat) {
      if (!keyDown[e.code] && !keyDownFor(a)) pendingPress[a] = (pendingPress[a] || 0) + 1;
      setDevice('keyboard');
    }
    keyDown[e.code] = true;
    // stop the page from scrolling; outside of play let focused buttons keep Enter/Space
    const onButton = e.target && e.target.closest && e.target.closest('button,a,[role=button]');
    if (N.state.mode === 'play' || !onButton) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) keyDown[e.code] = false;
  });
  // Losing focus (alt-tab, app switch, notification shade) never delivers the matching keyup /
  // pointerup, so drop every *physical* input; synthetic holds (tests, cutscenes) are kept.
  function releasePhysical() {
    for (const k in keyDown) keyDown[k] = false;
    for (const k in touchDown) touchDown[k] = false;
    for (const k in padDown) padDown[k] = false;
    padMove.x = padMove.y = 0;
    if (dom.btns) for (const a in dom.btns) dom.btns[a].classList.remove('on');
    resetStick();
    endLookDrag();
    look.stickX = look.stickY = 0;
  }
  input.releaseAll = releasePhysical;
  window.addEventListener('blur', releasePhysical);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releasePhysical(); });

  /* -------------------------------------------------------------- gamepad */
  function pollGamepad() {
    if (!navigator.getGamepads) return;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return; }
    let gp = null;
    for (const p of pads || []) if (p && p.connected) { gp = p; break; }
    for (const k in padDown) padDown[k] = false;
    padMove.x = padMove.y = 0;
    look.stickX = look.stickY = 0;
    if (!gp) return;
    let active = false;
    gp.buttons.forEach((b, i) => {
      const a = PADMAP[i];
      if (a && (b.pressed || b.value > 0.5)) { padDown[a] = true; active = true; }
    });
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const m = Math.hypot(ax, ay);
    if (m > 0.18) {
      const s = Math.min(1, (m - 0.18) / 0.82) / m;
      padMove.x = ax * s; padMove.y = ay * s; active = true;
    }
    // right stick: 3D camera look
    const lx = gp.axes[2] || 0, ly = gp.axes[3] || 0, lm = Math.hypot(lx, ly);
    if (lm > 0.16) {
      const s = Math.min(1, (lm - 0.16) / 0.84) / lm;
      look.stickX = lx * s; look.stickY = ly * s; look.source = 'pad'; active = true;
    }
    if (active) setDevice('gamepad');
  }

  /* ------------------------------------------------- 3D look: mouse + touch */
  // Desktop: drag on canvas#game3d to look; a click (no drag) requests pointer lock (Esc releases).
  // Touch: the .t-look zone (right half, shown in 3D) turns finger drags into look deltas.
  const drag = { id: -1, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: 0, el: null };
  function endLookDrag() {
    if (drag.el && drag.id >= 0) { try { drag.el.releasePointerCapture(drag.id); } catch (_) { /* ignore */ } }
    drag.id = -1; drag.el = null; look.dragging = false;
  }
  function lookTarget(e) {
    const t = e.target;
    return !!(t && (t.id === 'game3d' || (t.classList && t.classList.contains('t-look'))));
  }
  window.addEventListener('pointerdown', (e) => {
    if (!lookTarget(e) || drag.id >= 0) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    if (look.locked) return;
    drag.id = e.pointerId; drag.el = e.target; drag.x = drag.sx = e.clientX; drag.y = drag.sy = e.clientY;
    drag.t = performance.now(); drag.moved = 0;
    look.dragging = true; look.source = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (e.cancelable) e.preventDefault();
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    look.dx += dx; look.dy += dy;
  }, true);
  const lookUp = (e) => {
    if (e.pointerId !== drag.id) return;
    const click = e.type === 'pointerup' && e.pointerType === 'mouse' && drag.moved < 5 && performance.now() - drag.t < 350;
    const el = drag.el;
    endLookDrag();
    // a plain click on the 3D view captures the mouse for free look (desktop only)
    if (click && el && el.id === 'game3d' && el.requestPointerLock && N.state.mode === 'play' && !(N.view && N.view.noPointerLock)) {
      try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ }
    }
  };
  window.addEventListener('pointerup', lookUp, true);
  window.addEventListener('pointercancel', lookUp, true);
  window.addEventListener('lostpointercapture', (e) => { if (e.pointerId === drag.id) endLookDrag(); }, true);
  document.addEventListener('pointerlockchange', () => {
    const el = document.pointerLockElement;
    look.locked = !!(el && el.id === 'game3d');
    if (look.locked) look.source = 'mouse';
  });
  document.addEventListener('mousemove', (e) => {
    if (!look.locked) return;
    look.dx += e.movementX || 0; look.dy += e.movementY || 0;
  });
  input.exitPointerLock = () => { try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (_) { /* ignore */ } };

  /* ---------------------------------------------------------------- touch */
  const dom = {};
  const STICK_R = 52; // px radius of knob travel

  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }

  function buildTouchUI() {
    let root = document.getElementById('touch');
    if (!root) { root = el('div', '', document.body); root.id = 'touch'; }
    root.innerHTML = '';
    root.setAttribute('aria-hidden', 'true');
    dom.root = root;
    dom.look = el('div', 't-look', root); // 3D camera look zone (CSS shows it only in 3D views)
    dom.zone = el('div', 't-zone', root);
    dom.stick = el('div', 't-stick', root);
    dom.knob = el('div', 't-knob', dom.stick);
    dom.btns = {};
    const mk = (a, cls, label) => {
      const b = el('div', 't-btn ' + cls, root, '<span class="t-txt"></span>');
      b.dataset.a = a; b.dataset.def = label;
      b.querySelector('.t-txt').textContent = label;
      dom.btns[a] = b;
      return b;
    };
    dom.act = mk('action', 't-action', 'ACTION');
    dom.actLabel = dom.act.querySelector('.t-txt');
    mk('run', 't-run', 'RUN');
    mk('horn', 't-horn', 'HORN');
    mk('map', 't-top t-map', 'MAP');
    mk('pause', 't-top t-pause', '‖');
    mk('view', 't-top t-view', (N.view && N.view.shortLabel && N.view.shortLabel()) || '3D');
    input.setActionLabel(input.actionLabel);

    // Buttons: pointer events, multi-touch safe
    for (const a in dom.btns) {
      const b = dom.btns[a];
      let pid = -1;
      const down = (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (!touchDown[a]) pendingPress[a] = (pendingPress[a] || 0) + 1;
        touchDown[a] = true; b.classList.add('on'); pid = e.pointerId;
        setDevice('touch');
      };
      const release = () => { touchDown[a] = false; b.classList.remove('on'); pid = -1; };
      const up = (e) => { release(); if (e && e.cancelable) e.preventDefault(); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', release);
      const anyUp = (e) => { if (e.pointerId === pid) release(); };
      window.addEventListener('pointerup', anyUp, true);
      window.addEventListener('pointercancel', anyUp, true);
    }

    // Floating joystick on the left half
    dom.zone.addEventListener('pointerdown', (e) => {
      if (stick.active) return;
      e.preventDefault();
      try { dom.zone.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      stick.active = true; stick.id = e.pointerId;
      stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
      setDevice(e.pointerType === 'mouse' ? input.device : 'touch');
      updateStickDom();
    });
    dom.zone.addEventListener('pointermove', (e) => {
      if (!stick.active || e.pointerId !== stick.id) return;
      e.preventDefault();
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
      const m = Math.hypot(dx, dy);
      // drag the base along when the finger travels far (feels better on small phones)
      if (m > STICK_R * 1.6) {
        const k = (m - STICK_R * 1.6) / m;
        stick.ox += dx * k; stick.oy += dy * k;
        dx = e.clientX - stick.ox; dy = e.clientY - stick.oy;
      }
      const mm = Math.hypot(dx, dy);
      const dead = 0.12;
      let mag = Math.min(1, mm / STICK_R);
      mag = mag < dead ? 0 : (mag - dead) / (1 - dead);
      stick.x = mm > 0 ? (dx / mm) * mag : 0;
      stick.y = mm > 0 ? (dy / mm) * mag : 0;
      updateStickDom(dx, dy);
    });
    const end = (e) => { if (stick.active && e.pointerId === stick.id) resetStick(); };
    dom.zone.addEventListener('pointerup', end);
    dom.zone.addEventListener('pointercancel', end);
    // capture can be lost (OS gesture, element hidden) or fail to start: the finger lifting
    // anywhere on the page must still release the stick and the buttons
    dom.zone.addEventListener('lostpointercapture', end);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);

    // Desktop prompt "E — Ride Chetak"
    let prompt = document.getElementById('prompt');
    if (!prompt) { prompt = el('div', '', document.getElementById('ui') || document.body); prompt.id = 'prompt'; }
    prompt.innerHTML = '<kbd>E</kbd><span></span>';
    dom.prompt = prompt; dom.promptText = prompt.querySelector('span');
    input.setActionLabel(input.actionLabel);
  }

  function resetStick() {
    stick.active = false; stick.id = -1; stick.x = stick.y = 0;
    updateStickDom();
  }

  function updateStickDom(dx, dy) {
    if (!dom.stick) return;
    if (stick.active) {
      dom.stick.classList.add('on');
      dom.stick.style.transform = 'translate(' + (stick.ox - 60) + 'px,' + (stick.oy - 60) + 'px)';
      const m = Math.hypot(dx || 0, dy || 0);
      const k = m > STICK_R ? STICK_R / m : 1;
      dom.knob.style.transform = 'translate(' + ((dx || 0) * k) + 'px,' + ((dy || 0) * k) + 'px)';
    } else {
      dom.stick.classList.remove('on');
      dom.stick.style.transform = '';
      dom.knob.style.transform = '';
    }
  }

  // Block page scroll / pinch-zoom / double-tap zoom (allow scrolling inside .scroll panels)
  const allowScroll = (e) => e.target && e.target.closest && e.target.closest('.scroll');
  document.addEventListener('touchmove', (e) => { if (!allowScroll(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => { if (!allowScroll(e)) e.preventDefault(); });
  document.addEventListener('contextmenu', (e) => { if (e.target && e.target.closest && e.target.closest('#touch,#game')) e.preventDefault(); });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setDevice('touch'); }, true);

  // Mode classes on <body> so CSS can show/hide controls per state
  N.on('state', ({ mode }) => {
    document.body.dataset.mode = mode;
    if (mode !== 'play') {
      resetStick();
      endLookDrag();
      for (const k in touchDown) touchDown[k] = false;
      if (dom.btns) for (const a in dom.btns) dom.btns[a].classList.remove('on');
      // menus need the cursor back (the 3D view's pointer lock stays only in play/dialogue/cutscene)
      if (mode !== 'dialogue' && mode !== 'cutscene') input.exitPointerLock();
    }
  });

  function init() {
    buildTouchUI();
    let coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    if (coarse || 'ontouchstart' in window && navigator.maxTouchPoints > 0) setDevice('touch');
    if (coarse) input.showTouch(true);
    document.body.dataset.mode = N.state.mode;
  }

  N.addSystem({ id: 'input', order: 0, runIn: ['*'], init, update: (dt) => input.update(dt) });
})();
