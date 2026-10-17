/* NOSTALGIA — input.js
 * Keyboard + gamepad + touch (floating joystick, ACTION/RUN/HORN, MAP/PAUSE) -> N.input.
 * Edges (pressed/released) are computed once per update step by the 'input' system
 * (order 0, runs in every mode). Contract: ARCHITECTURE.md §9.
 */
(() => {
  'use strict';
  const N = window.N;
  const { clamp } = N.util;

  const ACTIONS = ['up', 'down', 'left', 'right', 'action', 'run', 'horn', 'map', 'journal', 'pause', 'radio'];
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyE: 'action', KeyF: 'action', Enter: 'action', NumpadEnter: 'action',
    ShiftLeft: 'run', ShiftRight: 'run', Space: 'horn',
    KeyM: 'map', KeyJ: 'journal', Escape: 'pause', KeyP: 'pause', KeyQ: 'radio', KeyR: 'radio',
  };
  // Gamepad "standard" mapping
  const PADMAP = { 0: 'action', 1: 'horn', 2: 'run', 3: 'radio', 4: 'journal', 5: 'run', 7: 'run', 8: 'map', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

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

  const input = {
    ACTIONS, KEYMAP,
    move: { x: 0, y: 0 },
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
    if (active) setDevice('gamepad');
  }

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
      for (const k in touchDown) touchDown[k] = false;
      if (dom.btns) for (const a in dom.btns) dom.btns[a].classList.remove('on');
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
