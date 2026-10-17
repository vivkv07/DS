/* NOSTALGIA — menus.js (STUB)
 * Minimal title overlay (START unlocks audio and starts a new game), a minimal pause
 * overlay, and a slow attract-mode camera over the city behind the title. Replaced by the
 * menus agent (title / pause / map / journal / settings / credits / cutscenes).
 */
(() => {
  'use strict';
  const N = window.N;

  let root = null, titleEl = null, pauseEl = null, attractT = 0;

  function host() {
    let o = document.getElementById('overlay');
    if (!o) { o = document.createElement('div'); o.id = 'overlay'; document.body.appendChild(o); }
    return o;
  }

  function buildTitle() {
    titleEl = document.createElement('div');
    titleEl.className = 'screen title-screen';
    titleEl.innerHTML =
      '<div class="title-card">' +
      '<div class="osd-line"><span class="rec">&#9654; PLAY</span><span>HYDERABAD &middot; 1999</span></div>' +
      '<h1 class="logo">Nostalgia</h1>' +
      '<p class="tagline">Run the gallis. Find the clues. Remember the city.</p>' +
      '<div class="title-buttons">' +
      '<button type="button" id="title-start" class="sign-btn">Start</button>' +
      '</div>' +
      '<p class="keys-hint"><kbd>WASD</kbd> move &nbsp; <kbd>Shift</kbd> run &nbsp; <kbd>E</kbd> action</p>' +
      '</div>';
    root.appendChild(titleEl);
    titleEl.querySelector('#title-start').addEventListener('click', startGame);
  }

  function buildPause() {
    pauseEl = document.createElement('div');
    pauseEl.className = 'screen pause-screen';
    pauseEl.innerHTML =
      '<div class="pause-card"><div class="osd-line"><span class="rec">&#10074;&#10074; PAUSE</span></div>' +
      '<button type="button" class="sign-btn" data-act="resume">Resume</button>' +
      '<button type="button" class="sign-btn alt" data-act="quit">Quit to title</button></div>';
    root.appendChild(pauseEl);
    pauseEl.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'resume') M.resume();
      if (b.dataset.act === 'quit') { M.hideAll(); N.game.quitToTitle(); }
    });
  }

  function startGame() {
    try { N.audio && N.audio.unlock && N.audio.unlock(); } catch (e) { N.err('audio.unlock', e); }
    N.game.newGame({ skipIntro: false });
  }

  function show(el, on) { if (el) el.classList.toggle('show', !!on); }

  const M = (N.menus = {
    title() {
      if (!root) return;
      show(pauseEl, false);
      show(titleEl, true);
      attractT = 0;
      N.render.camOverride = { x: N.render.cam.x, y: N.render.cam.y, zoom: 0.9, rate: 2 };
      const b = titleEl.querySelector('#title-start');
      if (b) setTimeout(() => { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
    },
    pause() { show(pauseEl, true); },
    resume() { show(pauseEl, false); N.game.resume(); },
    hideAll() { show(titleEl, false); show(pauseEl, false); N.render.camOverride = null; },
    cutscene(steps) { void steps; return Promise.resolve(); },
    isOpen() { return !!(titleEl && titleEl.classList.contains('show')) || !!(pauseEl && pauseEl.classList.contains('show')); },
  });

  // Attract path: slow drift past the lake, Tank Bund and the city
  function attract(dt) {
    attractT += dt;
    const D = N.WORLD_DATA || {};
    let pts = (D.places || []).filter((p) => p.kind === 'landmark').slice(0, 6);
    if (!pts.length) pts = (D.landmarks || []).slice(0, 6);
    if (!pts.length) pts = [{ x: N.player.x, y: N.player.y }];
    if (!N.render.camOverride) return;
    const seg = 14; // seconds per hop
    const i = Math.floor(attractT / seg) % pts.length, j = (i + 1) % pts.length;
    const t = N.util.smooth((attractT % seg) / seg);
    const a = pts[i], b = pts[j];
    // stay near the first point but wander gently towards the next one
    N.render.camOverride.x = a.x + (b.x - a.x) * t * 0.12 + Math.sin(attractT * 0.2) * 60;
    N.render.camOverride.y = a.y + (b.y - a.y) * t * 0.12 + Math.cos(attractT * 0.15) * 40;
    if (Math.floor((attractT - dt) / seg) !== Math.floor(attractT / seg)) N.render.camOverride.snap = false;
  }

  N.addSystem({
    id: 'menus', order: 85, runIn: ['title', 'play', 'paused'],
    init() {
      root = host();
      buildTitle();
      buildPause();
    },
    update(dt) {
      const I = N.input, mode = N.state.mode;
      if (mode === 'title') {
        attract(dt);
        const ae = document.activeElement;
        if (I.pressed('action') && !(ae && ae.tagName === 'BUTTON')) { I.consume('action'); startGame(); }
      } else if (mode === 'play') {
        if (I.pressed('pause')) { I.consume('pause'); N.game.pause(); }
      } else if (mode === 'paused') {
        if (I.pressed('pause')) { I.consume('pause'); M.resume(); }
      }
    },
  });
})();
