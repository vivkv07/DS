/* NOSTALGIA — marker.js: the pointer over Chinnu (owner request 2026-10-22: "add a triangle or pointer to the character
 * so it is easy to identify in the crowd").
 *
 * A yellow triangle with a dark rim, point down, floating over his head (or over the cycle / auto / bus he is on), bobbing
 * gently (still with reduced motion). Drawn in the top-down view on the 'fx' layer (above roofs, kites, crowds and the
 * night's darkness, so it keeps its colour at dawn and at night) and in
 * the 3D views as a camera-facing sprite that keeps its size on screen and is never hidden behind a wall or a crowd (none
 * in first person: you are him).
 *
 * Setting (Settings > Screen > "Pointer over you"), localStorage 'nostalgia.marker.v1':
 *   always   (default) always there while you play
 *   crowds   the old behaviour: after 2.5 s standing still, or in a crowd (entities.js idleT / inCrowd)
 *   off
 * Shown only in 'play' (not in cutscenes, dialogue, menus or minigames) and never while he is hidden.
 *
 * API  N.marker = {mode ('always' | 'crowds' | 'off'), setMode(m), alpha() -> 0..1 now, state() -> {mode, alpha, x, y, h, sprite3d}}
 * Hooks in files this module does not own (marked "[marker hook]"): index.html (script tag), entities.js (the old idle
 * chevron moved here).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const LS_KEY = 'nostalgia.marker.v1';
  const MODES = ['always', 'crowds', 'off'];
  const lsGet = () => { try { return window.localStorage.getItem(LS_KEY); } catch (e) { return null; } };
  const lsSet = (v) => { try { window.localStorage.setItem(LS_KEY, v); } catch (e) { /* storage off: this session only */ } };
  const stored = lsGet();
  const reduced = () => !!(document.body && document.body.classList.contains('reduced-motion'));
  const is3D = () => !!(N.view3d && N.view3d.active);
  const firstPerson = () => !!(N.view && N.view.mode === 'fps');

  const M = (N.marker = {
    mode: MODES.indexOf(stored) >= 0 ? stored : 'always',
    setMode(m) { if (MODES.indexOf(m) < 0) return M.mode; M.mode = m; lsSet(m); return m; },
    alpha,
    state() { const a = anchor(); return { mode: M.mode, alpha: +alpha().toFixed(2), x: a ? Math.round(a.x) : null, y: a ? Math.round(a.y) : null, h: a ? a.h : null, sprite3d: !!(L3.sprite && L3.sprite.visible) }; },
  });

  /** where the pointer sits: over his head on foot, over the roof of what he rides; h = height above the ground (u) */
  function anchor() {
    const p = N.player;
    if (!p || p.hidden) return null;
    const v = p.vehicle;
    if (v) return { x: v.x, y: v.y, h: ((v.T && v.T.h) || 11) + 9, v };
    return { x: p.x, y: p.y, h: 15 + (p.roofH || 0), v: null };
  }
  function alpha() {
    if (M.mode === 'off' || !N.state || N.state.mode !== 'play') return 0;
    const p = N.player;
    if (!p || p.hidden) return 0;
    if (M.mode === 'always') return 0.95;
    // 'crowds': the old idle chevron (2.5 s still, fading in over 0.6 s) or a crowd round him
    return Math.max(Math.min(1, Math.max(0, ((p.idleT || 0) - 2.5) / 0.6)), p.inCrowd ? 0.75 : 0) * 0.95;
  }
  const bob = () => (reduced() ? 0 : Math.sin(((N.time && N.time.real) || 0) * 4.2) * 1.4);

  /* ================================================================ top-down */
  function draw2D() {
    if (is3D()) return;
    const a = alpha();
    const A = a > 0 ? anchor() : null;
    if (!A) return;
    const R = N.render;
    if (!R || !R.inView || !R.inView(A.x, A.y, 40)) return;
    // on 'fx', after the light layer: the same bright yellow at dawn, at night and under the colour grade
    R.queue('fx', 1, (ctx) => {
      // seen from straight above, height barely moves a thing up the screen: lift the point clear of his head
      const k = R.k(A.h), X = R.sx(A.x, k), Y = R.sy(A.y, k) - (A.v ? 9 : 11) - bob();
      // a dark rim, then the yellow point (Chinnu's auto-yellow), one pixel of shine on the top edge
      ctx.globalAlpha = a;
      ctx.fillStyle = '#1a1214';
      ctx.beginPath(); ctx.moveTo(X - 6.5, Y - 7.5); ctx.lineTo(X + 6.5, Y - 7.5); ctx.lineTo(X, Y + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.moveTo(X - 4.6, Y - 6.3); ctx.lineTo(X + 4.6, Y - 6.3); ctx.lineTo(X, Y - 0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,214,0.85)'; ctx.fillRect(Math.round(X - 3.5), Math.round(Y - 6.3), 7, 1);
      ctx.globalAlpha = 1;
    });
  }

  /* ================================================================ 3D */
  const L3 = { sprite: null, mat: null, tex: null };
  function init3D(THREE, H) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1a1214';
    g.beginPath(); g.moveTo(6, 8); g.lineTo(58, 8); g.lineTo(32, 58); g.closePath(); g.fill();
    g.fillStyle = '#f2c230';
    g.beginPath(); g.moveTo(15, 14); g.lineTo(49, 14); g.lineTo(32, 46); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,248,214,0.9)'; g.fillRect(17, 14, 30, 3);
    L3.tex = new THREE.CanvasTexture(c);
    if ('colorSpace' in L3.tex && THREE.SRGBColorSpace) L3.tex.colorSpace = THREE.SRGBColorSpace;
    // constant size on screen, drawn over everything (a wall or a crowd never hides him), no fog
    L3.mat = new THREE.SpriteMaterial({ map: L3.tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false });
    L3.sprite = new THREE.Sprite(L3.mat);
    L3.sprite.name = 'player-marker';
    L3.sprite.renderOrder = 999;
    L3.sprite.center.set(0.5, 0);
    L3.sprite.scale.set(0.075, 0.075, 1); // ~3.5 % of the screen's height, whatever the distance
    L3.sprite.visible = false;
    L3.sprite.frustumCulled = false;
    H.layer.add(L3.sprite);
  }
  function update3D(H) {
    const S = L3.sprite;
    if (!S) return;
    const a = firstPerson() ? 0 : alpha();
    const A = a > 0 ? anchor() : null;
    S.visible = !!A;
    if (!A) return;
    let ground = 0;
    try { ground = H && H.elev ? H.elev(A.v || N.player) || 0 : 0; } catch (e) { ground = 0; }
    // just over his head (the kid model is 7.4 u tall) or over the roof of what he rides
    const h3 = A.v ? ((A.v.T && A.v.T.h) || 11) + 4 : 10 + (N.player.roofH || 0);
    S.position.set(A.x, ground + h3 + bob() * 0.3, A.y);
    L3.mat.opacity = a;
  }
  function dispose3D(H) {
    if (L3.sprite && H && H.layer) H.layer.remove(L3.sprite);
    if (L3.mat) L3.mat.dispose();
    if (L3.tex) L3.tex.dispose();
    L3.sprite = L3.mat = L3.tex = null;
  }
  let reg3d = false;
  function register3D() {
    const V = N.view3d;
    if (reg3d || !V || typeof V.registerLayer !== 'function') return;
    reg3d = true;
    V.registerLayer('marker3d', {
      order: 90,
      init(THREE, H) { try { init3D(THREE, H); } catch (e) { N.err('marker.init3d', e); } },
      update(dt, H) { try { update3D(H); } catch (e) { N.err('marker.update3d', e); } },
      dispose(H) { try { dispose3D(H); } catch (e) { N.err('marker.dispose3d', e); } },
    });
  }

  /* ================================================================ settings row + system */
  function addRow() {
    if (!N.menus || typeof N.menus.addSettingsRow !== 'function') return;
    N.menus.addSettingsRow({
      id: 'marker', label: 'Pointer over you', type: 'seg', section: 'Screen',
      opts: [['always', 'Always'], ['crowds', 'In crowds'], ['off', 'Off']],
      help: 'A yellow triangle over {nick} (and over what he rides), so you find him in a busy bazaar.',
      get: () => M.mode, set: (v) => M.setMode(v),
    });
  }
  N.addSystem({
    id: 'marker', order: 81, runIn: ['play'],
    init() { addRow(); register3D(); },
    draw() { try { draw2D(); } catch (e) { N.err('marker.draw', e); } },
  });
  N.on('boot', () => { addRow(); register3D(); });
})();
