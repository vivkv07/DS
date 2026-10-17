/* NOSTALGIA — minigames.js  (owner: minigame developer)
 * Eight self-contained minigames, each in a full-screen DOM overlay with its own canvas:
 *   kite      Sankranti kite fight ("Bo kaata!") on the terrace sky: pull/release manja, cross, cut
 *   clap      Golconda Fateh Darwaza clap: call-and-echo rhythm up to Bala Hissar
 *   brickgame the 9999-in-1 handheld LCD: falling blocks (A) + car dodge race (B)
 *   cricket   gully cricket batting: timing + direction, one-tip-one-hand, house = out
 *   antenna   rotate the terrace TV antenna to tune Doordarshan before the Sunday show
 *   panipuri  the Gokul Chat pani puri challenge: eat in rhythm, dodge the teekha one
 *   bargain   haggle with an auto driver / banana or flower vendor (lines + timing)
 *   marbles   goli / kanche: flick your striker, knock marbles out of the ring vs a rival
 * Contract: ARCHITECTURE.md §3 (src/minigames.js -> N.minigames), §11 (m.minigame(id, params)).
 *
 * PUBLIC API — N.minigames
 *   play(id, params) -> Promise<result>   open a minigame; resolves when the player leaves it
 *                                          (never rejects; unknown id / busy -> {win:false, error})
 *   start(id, params)                     alias of play() (engine stub name)
 *   list() -> [{id, title, sub, place, places, secs}]
 *   register(def) | register(id, def)     add a minigame (DEF below)
 *   active (id | null), isOpen(), abort(reason)   abort resolves the open game {win:false, aborted:true}
 *   stats {best, plays, wins} (per id)    persisted in localStorage + N.save key 'minigames'
 *   SIDE / side(on)                       free-roam side activities via N.interact (default on)
 *   covering                              true while the opaque overlay hides the world
 *   helpers                               drawing helpers shared by the games (H below)
 *
 * params (all optional)
 *   difficulty 0..1 (default 0.4) · seed · autoplay 'win' | 'lose' | true (built-in bot, tests)
 *   · timeScale (simulation speed; autoplay defaults to 2.5) · noRetry · noQuit · skipHowto
 *   · intro (a story line shown on the how-to card) · title · reward (paise, paid on a win)
 *   game specific: kite.target · clap.rounds · brickgame.mode 'blocks'|'race', .target ·
 *   cricket.target/.overs/.wickets · antenna.time · panipuri.target · bargain.who
 *   'auto'|'banana'|'flower', .start, .target · marbles.count
 * result {id, win, score, stars 0..3, quit, aborted, attempts, time, difficulty, ...game fields}
 *
 * DEF (register): {id, title, sub, place, places, secs, keys {code: action}, buttons(g) ->
 *   [{a, label, sub, hold, cls, w}], howto(g) -> {lines, goal, keys, touch}, setup(g), update(g, dt)
 *   (play only), idle(g, dt) (other phases), draw(g, ctx), pointer(g, type, x, y, id), bot(g, dt,
 *   want), hud(g) -> [{k, v, warn}], result(g, r) -> {title, line, rows}, stars(g, r), music,
 *   cleanup(g)}. Inside a game: g.W/g.H (CSS px), g.area {x,y,w,h} (free of the bars), g.rng,
 *   g.diff, g.t, g.rt, g.down(a)/pressed(a)/released(a), g.finish(win, extra), g.pop(text,x,y,o),
 *   g.burst(x,y,n,o), g.shake(a), g.flash(c,a), g.sfx(name,o), g.tone(f,dur,o), g.noise(dur,o).
 *
 * HOOKS INTO OTHER MODULES (added from this file, per ARCHITECTURE §0 "add hooks from your own file")
 *   - N.state.push('minigame') while open, pop() on close; emits 'minigame:start' {id, params} and
 *     'minigame:end' {id, result}. N.input.clear() on close so held keys don't leak into play.
 *   - N.world.draw and N.entities.draw (pure enqueue calls made by main.js) are wrapped lazily on
 *     the first play(): they return early while N.minigames.covering is true (overlay is opaque).
 *   - N.audio: sfx(name, {ui:true}); music.mood(def.music) during a game (cleared after); duck()
 *     for the brick game. Small custom voices (LCD beeps, TV static) are synthesised on
 *     N.audio.ctx and routed to N.audio._internal.bus().ui when present (else ctx.destination).
 *   - N.interact.add('mg:<placeId>', ...) side activities at places (see SIDE) on 'boot'.
 *   - N.save.register('minigames', {serialize, deserialize}) for stats.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const clamp = U.clamp, lerp = U.lerp, TAU = Math.PI * 2;

  /* ================================================================ helpers */
  const FONTS = {
    display: "'Yatra One', 'Baloo 2', system-ui, sans-serif",
    body: "'Baloo 2', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    osd: "'VT323', ui-monospace, 'Courier New', monospace",
  };
  const H = {
    clamp, lerp, TAU,
    // VT323 is a small pixel face: OSD text is drawn 20% larger so it reads like the other fonts
    font(kind, px, weight) { return (weight ? weight + ' ' : '') + Math.max(1, Math.round(kind === 'osd' ? px * 1.2 : px)) + 'px ' + (FONTS[kind] || FONTS.body); },
    ease: {
      out: (t) => 1 - (1 - t) * (1 - t),
      in: (t) => t * t,
      inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
      outBack: (t) => { const c = 1.70158; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; },
      outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
    },
    approach(v, target, d) { return v < target ? Math.min(target, v + d) : Math.max(target, v - d); },
    mix: (a, b, t) => U.mix(a, b, clamp(t, 0, 1)),
    shade: (c, f) => U.shade(c, f),
    hash: (x, y) => U.hash2(x, y),
    /** rounded-rect path */
    rr(ctx, x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },
    /** text with optional outline / drop shadow. o: {font, size, weight, color, align, base, outline, stroke, shadow, sx, sy, alpha, maxW} */
    text(ctx, s, x, y, o) {
      o = o || {};
      ctx.font = H.font(o.font || 'body', o.size || 16, o.weight);
      ctx.textAlign = o.align || 'center';
      ctx.textBaseline = o.base || 'middle';
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      const mw = o.maxW || undefined;
      if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fillText(s, x + (o.sx == null ? 2 : o.sx), y + (o.sy == null ? 2 : o.sy), mw); }
      if (o.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = o.outline; ctx.strokeStyle = o.stroke || '#1a1214'; ctx.strokeText(s, x, y, mw); }
      ctx.fillStyle = o.color || '#fff';
      ctx.fillText(s, x, y, mw);
      if (o.alpha != null) ctx.globalAlpha = 1;
    },
    /** hand-painted tin signboard panel. o: {fill, edge, bolts, shadow, r, rot, text, size, color, font} */
    sign(ctx, x, y, w, h, o) {
      o = o || {};
      ctx.save();
      if (o.rot) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.rot); ctx.translate(-x - w / 2, -y - h / 2); }
      const r = o.r == null ? 4 : o.r;
      if (o.shadow !== false) { ctx.fillStyle = o.shadow || 'rgba(0,0,0,0.35)'; H.rr(ctx, x + 3, y + 4, w, h, r); ctx.fill(); }
      ctx.fillStyle = o.fill || '#f2c230'; H.rr(ctx, x, y, w, h, r); ctx.fill();
      // brush-stroke sheen + worn edge
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g; H.rr(ctx, x, y, w, h, r); ctx.fill();
      ctx.lineWidth = Math.max(2, Math.min(4, h * 0.06)); ctx.strokeStyle = o.edge || '#1a1214';
      H.rr(ctx, x, y, w, h, r); ctx.stroke();
      if (o.inner) { ctx.lineWidth = 1.5; ctx.strokeStyle = o.inner; H.rr(ctx, x + 5, y + 5, w - 10, h - 10, Math.max(0, r - 2)); ctx.stroke(); }
      if (o.bolts !== false && w > 40 && h > 22) {
        ctx.fillStyle = 'rgba(40,30,30,0.55)';
        const b = Math.max(1.6, Math.min(3, h * 0.07)), m = b + 4;
        for (const [bx, by] of [[x + m, y + m], [x + w - m, y + m], [x + m, y + h - m], [x + w - m, y + h - m]]) { ctx.beginPath(); ctx.arc(bx, by, b, 0, TAU); ctx.fill(); }
      }
      if (o.text) H.text(ctx, o.text, x + w / 2, y + h / 2 + (o.dy || 1), { font: o.font || 'display', size: o.size || h * 0.55, color: o.color || '#1a1214', maxW: w - 12 });
      ctx.restore();
    },
    /** star path */
    star(ctx, cx, cy, r, ri, n) {
      n = n || 5; ri = ri || r * 0.45;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / n, rad = i % 2 ? ri : r;
        if (i) ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); else ctx.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
    },
    /** word-wrap into lines (uses the current ctx.font) */
    wrap(ctx, s, maxW) {
      const words = String(s).split(/\s+/), out = [];
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
      }
      if (line) out.push(line);
      return out;
    },
    /** offscreen canvas helper */
    canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; },
    /** a tile of TV-snow noise (cached by size) */
    noiseTile: (() => {
      const cache = {};
      return (n, seed) => {
        const k = n + ':' + (seed || 0);
        if (cache[k]) return cache[k];
        const c = H.canvas(n, n), x = c.getContext('2d');
        const img = x.createImageData(n, n), d = img.data;
        let s = (seed || 1) * 2654435761 >>> 0;
        for (let i = 0; i < n * n; i++) {
          s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
          const v = s & 255;
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
        }
        x.putImageData(img, 0, 0);
        return (cache[k] = c);
      };
    })(),
    /** a person seen from behind / the side, drawn as soft painted shapes. o: {skin, hair, shirt, pants, scale, arm} */
    kidBack(ctx, x, y, s, o) {
      o = o || {};
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = o.pants || '#3b4a6b';
      ctx.fillRect(-8, -22, 7, 22); ctx.fillRect(1, -22, 7, 22);
      ctx.fillStyle = o.shirt || '#d8402a'; H.rr(ctx, -11, -46, 22, 27, 6); ctx.fill();
      if (o.stripes) { ctx.fillStyle = o.stripes; for (let i = 0; i < 3; i++) ctx.fillRect(-11, -41 + i * 8, 22, 3); }
      ctx.fillStyle = o.skin || '#a8703f'; ctx.beginPath(); ctx.arc(0, -53, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = o.hair || '#1a1412'; ctx.beginPath(); ctx.arc(0, -55, 9.4, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -53, 9.2, Math.PI * 1.05, Math.PI * 1.95, true); ctx.fill();
      ctx.restore();
    },
  };

  /* ===================================================== tiny synth voices */
  // Custom voices that the shared SFX bank doesn't have (LCD piezo beeps, TV static). Never throws.
  const synth = {
    ac() { try { const A = N.audio; return A && A.ready && A.ctx ? A.ctx : null; } catch (e) { return null; } },
    out(ac) {
      try { const b = N.audio._internal && N.audio._internal.bus && N.audio._internal.bus(); if (b && b.ui) return b.ui; } catch (e) { /* ignore */ }
      return ac.destination;
    },
    tone(f, dur, o) {
      const ac = synth.ac(); if (!ac) return false;
      o = o || {};
      try {
        const t = ac.currentTime + (o.delay || 0) + 0.005;
        const osc = ac.createOscillator(), g = ac.createGain();
        osc.type = o.type || 'square';
        osc.frequency.setValueAtTime(Math.max(20, f), t);
        if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
        const v = o.vol == null ? 0.08 : o.vol;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.004);
        g.gain.setValueAtTime(v, t + Math.max(0.006, dur * 0.7));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(synth.out(ac));
        osc.start(t); osc.stop(t + dur + 0.03);
        return true;
      } catch (e) { return false; }
    },
    nbuf: null,
    noiseBuffer(ac) {
      if (synth.nbuf && synth.nbuf.sampleRate === ac.sampleRate) return synth.nbuf;
      const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return (synth.nbuf = b);
    },
    noise(dur, o) {
      const ac = synth.ac(); if (!ac) return false;
      o = o || {};
      try {
        const t = ac.currentTime + (o.delay || 0) + 0.005;
        const s = ac.createBufferSource(); s.buffer = synth.noiseBuffer(ac); s.loop = true;
        const f = ac.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 2000, t); f.Q.value = o.q || 0.8;
        if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
        const g = ac.createGain(), v = o.vol == null ? 0.1 : o.vol;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (o.a || 0.005));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(synth.out(ac));
        s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
        return true;
      } catch (e) { return false; }
    },
    /** continuous noise bed: returns {set(vol, freq), stop()} (no-op object when audio is off) */
    loop(o) {
      const ac = synth.ac();
      const dummy = { set() {}, stop() {} };
      if (!ac) return dummy;
      o = o || {};
      try {
        const s = ac.createBufferSource(); s.buffer = synth.noiseBuffer(ac); s.loop = true;
        const f = ac.createBiquadFilter(); f.type = o.ft || 'highpass'; f.frequency.value = o.f || 1200; f.Q.value = o.q || 0.5;
        const g = ac.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(synth.out(ac)); s.start();
        let dead = false;
        return {
          set(v, freq) { if (dead) return; const t = ac.currentTime; g.gain.setTargetAtTime(Math.max(0, v), t, 0.06); if (freq) f.frequency.setTargetAtTime(freq, t, 0.08); },
          stop() { if (dead) return; dead = true; const t = ac.currentTime; g.gain.setTargetAtTime(0, t, 0.05); try { s.stop(t + 0.3); } catch (e) { /* ignore */ } },
        };
      } catch (e) { return dummy; }
    },
  };
  H.synth = synth;

  /* ================================================================ registry */
  const defs = Object.create(null);
  const STORE = 'nostalgia.minigames.v1';
  const stats = { best: {}, plays: {}, wins: {} };
  try {
    const raw = window.localStorage && window.localStorage.getItem(STORE);
    if (raw) { const o = JSON.parse(raw); if (o && typeof o === 'object') for (const k of ['best', 'plays', 'wins']) if (o[k] && typeof o[k] === 'object') Object.assign(stats[k], o[k]); }
  } catch (e) { /* storage blocked */ }
  function saveStats() { try { window.localStorage && window.localStorage.setItem(STORE, JSON.stringify(stats)); } catch (e) { /* storage blocked */ } }

  // Tunables (systems_design §0.2 / §8 / §14). Each game adds its own block (TUNE.kite, ...).
  // assist / offset: null = read the settings (N.settings.minigameAssist|assist, N.settings.difficulty
  // 'relaxed'|'normal'|'hard'); set them here to override.
  const TUNE = {
    assist: null, offset: null,
    assistWindow: 1.5, assistDiff: 0.15, presetOffset: { relaxed: -0.15, aaram: -0.15, easy: -0.15, normal: 0, hard: 0.15, full: 0.15 },
    diffMin: 0.05, diffMax: 0.95,
    payCap: 3, // paid free-play wins per minigame per game-day
  };
  function settings() { try { return N.settings || (N.menus && N.menus.settings) || {}; } catch (e) { return {}; } }
  function assistOn(params) {
    if (params.assist != null) return !!params.assist;
    if (TUNE.assist != null) return !!TUNE.assist;
    const s = settings();
    return !!(s.minigameAssist || s.assist || (N.flags && N.flags.minigame_assist));
  }
  function presetOffset() {
    if (TUNE.offset != null) return +TUNE.offset || 0;
    const p = settings().difficulty != null ? settings().difficulty : settings().preset;
    if (typeof p === 'number') return p < 0 ? -0.15 : p > 0 ? 0.15 : 0;
    return TUNE.presetOffset[String(p || 'normal').toLowerCase()] || 0;
  }
  function reducedMotion() {
    try { return document.body.classList.contains('reduced-motion') || !!settings().reducedMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function hasItem(id) { try { const inv = N.player && N.player.inventory; return !!(inv && (inv.has ? inv.has(id) : inv[id])); } catch (e) { return false; } }

  let cur = null; // the open Game

  const MG = (N.minigames = {
    VERSION: 1,
    defs,
    stats,
    TUNE,
    helpers: H,
    hasItem,
    covering: false,
    register(id, def) {
      if (typeof id === 'object') { def = id; id = def.id; }
      if (!id || !def) return null;
      def.id = id;
      defs[id] = def;
      return def;
    },
    // ids used elsewhere (map data, story drafts) -> our ids
    alias: { golconda_clap: 'clap', fateh_darwaza_clap: 'clap', kite_fight: 'kite', pech: 'kite', patang: 'kite', brick: 'brickgame', brick_game: 'brickgame', gully_cricket: 'cricket', tv_antenna: 'antenna', pani_puri: 'panipuri', gokul_chat: 'panipuri', haggle: 'bargain', mol_bhaav: 'bargain', goli: 'marbles', kanche: 'marbles' },
    resolve(id) { return defs[id] ? id : MG.alias[id] && defs[MG.alias[id]] ? MG.alias[id] : null; },
    has(id) { return !!MG.resolve(id); },
    list() {
      return Object.keys(defs).map((id) => {
        const d = defs[id];
        return { id, title: d.title || id, sub: d.sub || '', place: d.place || null, places: d.places || [], secs: d.secs || 60 };
      });
    },
    play(id, params) { return open(id, params); },
    start(id, params) { return open(id, params); },
    get active() { return cur ? cur.id : null; },
    get game() { return cur; },
    isOpen() { return !!cur; },
    abort(reason) { if (cur) { cur.close(Object.assign(cur.baseResult(), { win: false, aborted: true, reason: reason || null })); return true; } return false; },
  });

  function open(id, params) {
    params = Object.assign({}, params || {});
    const def = defs[MG.resolve(id)];
    if (!def) {
      try { console.warn('[minigames] unknown minigame "' + id + '"'); } catch (e) { /* ignore */ }
      return Promise.resolve({ id, win: false, score: 0, stars: 0, error: 'unknown' });
    }
    if (cur) return Promise.resolve({ id, win: false, score: 0, stars: 0, error: 'busy' });
    wrapWorldDraw();
    return new Promise((resolve) => {
      try {
        cur = new Game(def, params, resolve);
        cur.open();
      } catch (e) {
        N.err('minigames.open:' + id, e);
        try { if (cur) cur.teardown(); } catch (e2) { /* ignore */ }
        cur = null;
        resolve({ id, win: false, score: 0, stars: 0, error: String((e && e.message) || e) });
      }
    });
  }

  // Skip the (invisible) world enqueue work while an opaque minigame covers the screen.
  function wrapWorldDraw() {
    const wrap = (obj, key) => {
      if (!obj || typeof obj[key] !== 'function' || obj[key].__mgWrap) return;
      const orig = obj[key];
      const f = function () { if (MG.covering) return undefined; return orig.apply(this, arguments); };
      f.__mgWrap = true; f.__orig = orig;
      obj[key] = f;
    };
    try { wrap(N.world, 'draw'); wrap(N.entities, 'draw'); wrap(N.render, 'queue'); } catch (e) { /* ignore */ }
    // flush: nothing was queued, so just drop this frame's lights (flush is what clears them)
    try {
      const R = N.render;
      if (R && typeof R.flush === 'function' && !R.flush.__mgWrap) {
        const orig = R.flush;
        const f = function () { if (MG.covering) { if (R.lights) R.lights.length = 0; return undefined; } return orig.apply(this, arguments); };
        f.__mgWrap = true; f.__orig = orig;
        R.flush = f;
      }
    } catch (e) { /* ignore */ }
  }

  /* ================================================================== DOM */
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function isTouchDevice() {
    try {
      if (N.input && N.input.device === 'touch') return true;
      if (document.body.classList.contains('touch-on')) return true;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) { /* ignore */ }
    return false;
  }
  const EMPTY = Object.freeze({});
  // gamepad (standard mapping) -> key codes the games map: A main (Space), B secondary (KeyX), X (KeyZ),
  // Y (KeyC), LB/RB (BracketLeft/Right), LT/RT (ShiftLeft/Right), Start = pause, d-pad/stick = arrows
  const PAD_CODES = { 0: 'Space', 1: 'KeyX', 2: 'KeyZ', 3: 'KeyC', 4: 'BracketLeft', 5: 'BracketRight', 6: 'ShiftLeft', 7: 'ShiftRight', 9: 'Escape', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };

  /* ================================================================= Game */
  class Game {
    constructor(def, params, resolve) {
      this.def = def; this.id = def.id; this.params = params; this.resolveFn = resolve;
      this.assist = assistOn(params);
      this.winMul = this.assist ? TUNE.assistWindow : 1;           // every timing window x1.5 with Assist
      const base = params.difficulty == null ? 0.4 : +params.difficulty || 0;
      this.diff = clamp(base + presetOffset() - (this.assist ? TUNE.assistDiff : 0), TUNE.diffMin, TUNE.diffMax);
      this.reduced = reducedMotion();
      const ap = params.autoplay;
      this.auto = ap === true ? 'win' : ap === 'win' || ap === 'lose' ? ap : null;
      this.timeScale = +params.timeScale > 0 ? +params.timeScale : this.auto ? 2.5 : 1;
      this.baseSeed = params.seed != null ? (typeof params.seed === 'string' ? U.strHash(params.seed) : params.seed >>> 0) : (Math.random() * 4294967295) >>> 0;
      this.attempts = 0;
      this.phase = 'init';
      this.rt = 0; this.t = 0; this.playTime = 0;
      this.fx = []; this.pops = [];
      this.shakeA = 0; this.flashA = 0; this.flashC = '#fff';
      this.src = Object.create(null);      // action -> Set of sources holding it
      this.pendP = Object.create(null); this.pendR = Object.create(null);
      this.stepP = EMPTY; this.stepR = EMPTY;
      this.botHeldA = Object.create(null); this.botTapT = Object.create(null);
      this.touch = !!params.touch || isTouchDevice();
      this.S = null;
      this.closed = false;
      this.hudKey = '';
      this.hudT = 0;
      this.listeners = [];
      this.dpr = 1;
      this.frameBound = (t) => this.frame(t);
      this.padPrev = Object.create(null);
    }

    /* ---------------------------------------------------------- lifecycle */
    open() {
      const def = this.def;
      // DOM
      const host = document.getElementById('overlay') || document.body;
      const root = (this.root = el('div', 'screen show mg-screen', host));
      root.dataset.mg = this.id;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', def.title || this.id);
      this.canvas = el('canvas', 'mg-canvas', root);
      this.canvas.setAttribute('aria-hidden', 'true');
      this.ctx = this.canvas.getContext('2d');
      el('div', 'mg-scan', root);
      const top = (this.topEl = el('div', 'mg-top', root));
      this.nameEl = el('div', 'mg-name', top, esc(this.params.title || def.title || this.id));
      this.statsEl = el('div', 'mg-stats', top);
      this.pauseBtn = el('button', 'mg-pausebtn', top, '&#10074;&#10074;');
      this.pauseBtn.type = 'button';
      this.pauseBtn.setAttribute('aria-label', 'Pause');
      this.padEl = el('div', 'mg-pad', root);
      this.hintEl = el('div', 'mg-hint', root);
      this.cdEl = el('div', 'mg-count', root);
      this.cardWrap = el('div', 'mg-card-wrap', root);
      this.on(this.pauseBtn, 'click', (e) => { e.preventDefault(); this.togglePause(); });

      // input
      this.on(window, 'keydown', (e) => this.onKey(e, true), true);
      this.on(window, 'keyup', (e) => this.onKey(e, false), true);
      this.on(window, 'blur', () => this.releaseAll());
      this.on(document, 'visibilitychange', () => { if (document.hidden && this.phase === 'play' && !this.over) this.pause(true); });
      this.on(window, 'resize', () => this.resize());
      this.on(window, 'orientationchange', () => this.resize());
      const cv = this.canvas;
      const ptr = (type) => (e) => {
        if (type === 'down') {
          if (e.pointerType === 'touch' && !this.touch) { this.touch = true; this.buildPad(); this.resize(); }
          try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        }
        if (this.phase !== 'play' || this.over || !this.def.pointer) return;
        e.preventDefault();
        if (type === 'down') this.inputs = (this.inputs || 0) + 1;
        const r = cv.getBoundingClientRect();
        try { this.def.pointer(this, type, e.clientX - r.left, e.clientY - r.top, e.pointerId, e); } catch (err) { N.err('minigame.pointer:' + this.id, err); }
      };
      this.on(cv, 'pointerdown', ptr('down'));
      this.on(cv, 'pointermove', ptr('move'));
      this.on(cv, 'pointerup', ptr('up'));
      this.on(cv, 'pointercancel', ptr('up'));
      this.on(root, 'contextmenu', (e) => e.preventDefault());

      // state + audio
      if (N.state && N.state.mode !== 'minigame') { try { N.state.push('minigame'); this.pushed = true; } catch (e) { N.err('minigame.state', e); } }
      try { const ae = document.activeElement; if (ae && ae.blur && ae !== document.body) ae.blur(); } catch (e) { /* ignore */ }
      if (N.input && N.input.clear) N.input.clear();
      this.sfx('tape_click');
      try { if (def.music && N.audio && N.audio.music && N.audio.music.mood) { N.audio.music.mood(def.music); this.moodSet = true; } } catch (e) { /* ignore */ }
      try { if (def.duck != null && N.audio && N.audio.duck) { N.audio.duck(true, def.duck); this.ducked = true; } } catch (e) { /* ignore */ }

      this.buildPad();
      this.resize();
      this.setup();
      requestAnimationFrame(() => root.classList.add('mg-in'));
      N.emit('minigame:start', { id: this.id, params: this.params });
      if (this.params.skipHowto) this.startCountdown(); else this.showHowto();
      this.last = 0;
      this.raf = requestAnimationFrame(this.frameBound);
    }
    on(target, type, fn, opt) { target.addEventListener(type, fn, opt); this.listeners.push([target, type, fn, opt]); }

    setup() {
      this.attempts++;
      this.rng = U.rng((this.baseSeed + this.attempts * 7919) >>> 0);
      this.t = 0; this.over = false; this.result = null;
      this.fx.length = 0; this.pops.length = 0;
      this.shakeA = 0; this.flashA = 0;
      this.releaseAll();
      this.S = {};
      try { this.def.setup(this); } catch (e) { N.err('minigame.setup:' + this.id, e); }
      try { this.def.layout && this.def.layout(this); } catch (e) { N.err('minigame.layout:' + this.id, e); }
      this.updateHud(true);
    }

    baseResult() {
      const S = this.S || {};
      return { id: this.id, win: false, score: Math.round(S.score || 0), stars: 0, quit: false, aborted: false, attempts: this.attempts, time: Math.round(this.playTime * 10) / 10, difficulty: Math.round(this.diff * 100) / 100, assist: this.assist };
    }

    close(result) {
      if (this.closed) return;
      this.closed = true;
      this.phase = 'closing';
      MG.covering = false;
      this.root.classList.remove('mg-in');
      this.root.classList.add('mg-out');
      this.releaseAll();
      const fin = () => {
        this.teardown();
        // bookkeeping
        try {
          const id = this.id;
          stats.plays[id] = (stats.plays[id] || 0) + 1;
          if (result.win) {
            stats.wins[id] = (stats.wins[id] || 0) + 1;
            if (!(stats.best[id] >= result.score)) stats.best[id] = result.score;
            const rw = Math.round(+this.params.reward || 0);
            if (rw > 0 && N.player) { N.player.money = (N.player.money || 0) + rw; N.emit('money', { delta: rw, total: N.player.money }); }
          }
          saveStats();
        } catch (e) { N.err('minigame.stats', e); }
        N.emit('minigame:end', { id: this.id, result });
        try { this.resolveFn(result); } catch (e) { N.err('minigame.resolve', e); }
      };
      if (this.params.instantClose) fin(); else setTimeout(fin, 230);
    }

    teardown() {
      this.dead = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      for (const [t, ty, fn, opt] of this.listeners) { try { t.removeEventListener(ty, fn, opt); } catch (e) { /* ignore */ } }
      this.listeners.length = 0;
      try { this.def.cleanup && this.def.cleanup(this); } catch (e) { N.err('minigame.cleanup:' + this.id, e); }
      if (this.loops) for (const l of this.loops) { try { l.stop(); } catch (e) { /* ignore */ } }
      try { if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root); } catch (e) { /* ignore */ }
      try { if (this.moodSet && N.audio && N.audio.music) N.audio.music.mood(null); } catch (e) { /* ignore */ }
      try { if (this.ducked && N.audio && N.audio.duck) N.audio.duck(false); } catch (e) { /* ignore */ }
      if (N.input && N.input.clear) N.input.clear();
      if (this.pushed && N.state && N.state.mode === 'minigame') { try { N.state.pop(); } catch (e) { N.err('minigame.state', e); } }
      if (cur === this) cur = null;
      MG.covering = false;
    }

    /* ------------------------------------------------------------- layout */
    resize() {
      if (this.dead) return;
      const r = this.root.getBoundingClientRect();
      const W = Math.max(200, Math.round(r.width || window.innerWidth)), Hh = Math.max(200, Math.round(r.height || window.innerHeight));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = W; this.H = Hh; this.dpr = dpr;
      this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(Hh * dpr);
      this.portrait = Hh > W * 1.1;
      this.small = Math.min(W, Hh) < 480;
      const topH = this.topEl.offsetHeight || 48;
      const padH = this.touch && this.padEl.childElementCount ? this.padEl.offsetHeight || 0 : this.hintEl.offsetHeight || 0;
      this.area = { x: 0, y: topH, w: W, h: Math.max(100, Hh - topH - padH) };
      this.topH = topH; this.padH = padH;
      this.hudKey = null; // refit the stats row on the next HUD tick
      if (this.S) { try { this.def.layout && this.def.layout(this); } catch (e) { N.err('minigame.layout:' + this.id, e); } }
      this.drawnPaused = false;
    }

    buildPad() {
      const pad = this.padEl;
      pad.innerHTML = '';
      this.btnEls = Object.create(null);
      const list = (this.def.buttons && this.def.buttons(this)) || [];
      this.root.classList.toggle('mg-touch', this.touch);
      if (this.touch) {
        for (const b of list) {
          if (b.gap) { el('div', 'mg-gap', pad).style.flexGrow = b.w || 1; continue; }
          const e = el('button', 'mg-btn ' + (b.cls || ''), pad, esc(b.label) + (b.sub ? '<small>' + esc(b.sub) + '</small>' : ''));
          e.type = 'button';
          e.dataset.a = b.a;
          if (b.w) e.style.flexGrow = b.w;
          this.btnEls[b.a] = e;
          const sid = (ev) => 'p' + ev.pointerId;
          this.on(e, 'pointerdown', (ev) => {
            ev.preventDefault();
            try { e.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
            e.classList.add('on');
            if (this.phase === 'play' && !this.over) this.press(b.a, sid(ev));
          });
          const up = (ev) => { e.classList.remove('on'); this.release(b.a, sid(ev)); };
          this.on(e, 'pointerup', up);
          this.on(e, 'pointercancel', up);
          this.on(e, 'lostpointercapture', up);
        }
        this.hintEl.innerHTML = '';
      } else {
        const keys = this.def.keyHint ? this.def.keyHint(this) : '';
        this.hintEl.innerHTML = keys ? keys + ' &nbsp;<span class="mg-dim"><kbd>Esc</kbd> pause</span>' : '';
      }
    }

    /* -------------------------------------------------------------- input */
    onKey(e, down) {
      if (this.dead) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const code = e.code;
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault(); e.stopPropagation();
        if (down && !e.repeat) {
          if (this.phase === 'play' || this.phase === 'countdown') this.togglePause();
          else if (this.phase === 'paused') this.resume();
        }
        return;
      }
      if (this.phase === 'howto' || this.phase === 'result' || this.phase === 'paused') {
        if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
          const ae = document.activeElement;
          if (ae && ae.tagName === 'BUTTON' && this.root.contains(ae)) return; // the focused button handles it
          e.preventDefault(); e.stopPropagation();
          if (down && !e.repeat && this.rt - (this.cardAt || 0) > 0.3) this.cardPrimary();
        } else if (down && !e.repeat && this.phase === 'result' && code === 'KeyR' && !this.params.noRetry) { e.preventDefault(); this.retry(); }
        return;
      }
      const a = this.def.keys && this.def.keys[code];
      if (!a) {
        // the overlay owns the keyboard: nothing leaks to the game underneath (keyups still do)
        if (down && !e.ctrlKey && !e.metaKey && !e.altKey && code !== 'Tab' && code !== 'Backquote' && !/^F\d+$/.test(code)) { e.stopPropagation(); if (/^Arrow|^Space$/.test(code)) e.preventDefault(); }
        return;
      }
      e.preventDefault();
      if (down) { e.stopPropagation(); if (!e.repeat && this.phase === 'play' && !this.over) this.press(a, 'k' + code); } else this.release(a, 'k' + code);
    }
    press(a, src) {
      this.inputs = (this.inputs || 0) + 1;
      let s = this.src[a];
      if (!s) s = this.src[a] = new Set();
      if (s.size === 0 && !this.botHeldA[a]) this.pendP[a] = true;
      s.add(src || 'x');
    }
    release(a, src) {
      const s = this.src[a];
      if (!s || !s.size) return;
      s.delete(src || 'x');
      if (s.size === 0 && !this.botHeldA[a]) this.pendR[a] = true;
    }
    releaseAll() {
      for (const a in this.src) this.src[a].clear();
      for (const a in this.botHeldA) this.botHeldA[a] = false;
      this.pendP = Object.create(null); this.pendR = Object.create(null);
      if (this.btnEls) for (const k in this.btnEls) this.btnEls[k].classList.remove('on');
    }
    down(a) { const s = this.src[a]; return !!((s && s.size) || this.botHeldA[a] || this.botTapT[a] > 0); }
    pressed(a) { return !!this.stepP[a]; }
    released(a) { return !!this.stepR[a]; }
    // test bot helpers
    // (inside a simulation step the edge is visible to update() in the same step)
    botEdge(map, pend, a) { if (map === EMPTY) pend[a] = true; else map[a] = true; }
    botPress(a, dur) { this.botEdge(this.stepP, this.pendP, a); this.botTapT[a] = dur || 0.06; }
    botHold(a, on) {
      on = !!on;
      if (on && !this.botHeldA[a] && !this.down(a)) this.botEdge(this.stepP, this.pendP, a);
      if (!on && this.botHeldA[a]) { this.botHeldA[a] = false; if (!this.down(a)) this.botEdge(this.stepR, this.pendR, a); return; }
      this.botHeldA[a] = on;
    }
    pollPad() {
      if (!navigator.getGamepads) return;
      let gp = null;
      try { for (const p of navigator.getGamepads() || []) if (p && p.connected) { gp = p; break; } } catch (e) { return; }
      if (!gp) return;
      const now = Object.create(null);
      gp.buttons.forEach((b, i) => { const c = PAD_CODES[i]; if (c && (b.pressed || b.value > 0.5)) now[c] = true; });
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -0.5) now.ArrowLeft = true; if (ax > 0.5) now.ArrowRight = true;
      if (ay < -0.5) now.ArrowUp = true; if (ay > 0.5) now.ArrowDown = true;
      const fake = (code, down) => this.onKey({ code, repeat: false, target: null, preventDefault() {}, stopPropagation() {} }, down);
      for (const c in now) if (!this.padPrev[c]) fake(c, true);
      for (const c in this.padPrev) if (this.padPrev[c] && !now[c]) fake(c, false);
      this.padPrev = now;
    }

    /* -------------------------------------------------------------- cards */
    showCard(html, cls) {
      this.cardWrap.innerHTML = '<div class="mg-card scroll ' + (cls || '') + '">' + html + '</div>';
      this.cardWrap.classList.add('show');
      this.cardAt = this.rt;
      this.cardWrap.querySelectorAll('button[data-do]').forEach((b) => {
        this.on(b, 'click', (e) => { e.preventDefault(); this.cardDo(b.dataset.do); });
      });
    }
    hideCard() { this.cardWrap.classList.remove('show'); this.cardWrap.innerHTML = ''; }
    cardPrimary() {
      const b = this.cardWrap.querySelector('button.primary');
      if (b) this.cardDo(b.dataset.do);
    }
    cardDo(what) {
      if (this.closed) return;
      if (this.rt - (this.cardAt || 0) < 0.15) return;
      this.sfx('ui_select');
      if (what === 'start') { this.hideCard(); this.startCountdown(); }
      else if (what === 'resume') this.resume();
      else if (what === 'retry') this.retry();
      else if (what === 'quit') this.close(Object.assign(this.baseResult(), { win: false, quit: true }));
      else if (what === 'done') this.close(this.result || Object.assign(this.baseResult(), { win: false }));
    }
    showHowto() {
      this.phase = 'howto';
      const d = this.def, h = (d.howto && d.howto(this)) || {};
      const lines = (h.lines || []).map((l, i) => '<li><span class="mg-num">' + (i + 1) + '</span><span>' + l + '</span></li>').join('');
      const ctrl = this.touch ? h.touch || h.keys || '' : h.keys || h.touch || '';
      const intro = this.params.intro ? '<p class="mg-intro">' + esc(this.params.intro) + '</p>' : '';
      const best = (stats.best[this.id] ? '<span class="mg-best">BEST ' + stats.best[this.id] + '</span>' : '') + (this.assist ? '<span class="mg-best">ASSIST</span>' : '');
      this.showCard(
        '<div class="mg-howto">' +
          '<div class="mg-howto-head"><div class="osd-line mg-osd"><span class="rec">&#9654;</span><span>' + esc(h.osd || d.osd || 'HOW TO PLAY') + '</span>' + best + '</div>' +
          '<h2>' + esc(h.title || this.params.title || d.title) + '</h2>' + ((h.sub || d.sub) ? '<p class="mg-sub">' + esc(h.sub || d.sub) + '</p>' : '') + intro + '</div>' +
          '<div class="mg-howto-body"><ol class="mg-rules">' + lines + '</ol>' +
          (h.goal ? '<div class="mg-goal">' + h.goal + '</div>' : '') +
          (ctrl ? '<div class="mg-ctrl">' + ctrl + '</div>' : '') +
          '<div class="mg-actions"><button type="button" class="sign-btn primary" data-do="start">' + esc(d.startLabel || 'Shuru karo!') + '</button>' +
          (this.params.noQuit ? '' : '<button type="button" class="sign-btn alt" data-do="quit">Not now</button>') + '</div></div>' +
        '</div>', 'mg-card-howto');
    }
    startCountdown() {
      this.phase = 'countdown';
      this.cdT = this.def.noCountdown ? 0 : this.auto ? 0.6 : 2.1;
      this.cdShown = null;
      this.root.classList.add('mg-playing');
    }
    togglePause() { if (this.phase === 'paused') this.resume(); else this.pause(); }
    pause(auto) {
      if (this.phase !== 'play' && this.phase !== 'countdown') return;
      this.prevPhase = this.phase;
      this.phase = 'paused';
      this.releaseAll();
      this.sfx('ui_click');
      this.showCard(
        '<div class="mg-pause"><div class="osd-line mg-osd"><span class="rec">&#10074;&#10074; PAUSE</span>' + (auto ? '<span>TAB HIDDEN</span>' : '') + '</div>' +
        '<h2>' + esc(this.nameEl.textContent || this.params.title || this.def.title) + '</h2>' +
        '<div class="mg-actions col"><button type="button" class="sign-btn primary" data-do="resume">Resume</button>' +
        (this.params.noRetry ? '' : '<button type="button" class="sign-btn alt" data-do="retry">Restart</button>') +
        (this.params.noQuit ? '' : '<button type="button" class="sign-btn alt" data-do="quit">Quit</button>') + '</div></div>', 'mg-card-pause');
    }
    resume() {
      if (this.phase !== 'paused') return;
      this.hideCard();
      this.phase = this.prevPhase || 'play';
      this.last = 0;
    }
    retry() {
      this.hideCard();
      this.root.classList.remove('mg-result-on');
      this.setup();
      this.startCountdown();
    }
    finish(win, extra) {
      if (this.over) return;
      this.over = true;
      extra = Object.assign({}, extra || {});
      const delay = extra.delay != null ? extra.delay : 1.3;
      delete extra.delay;
      this.result = Object.assign(this.baseResult(), { score: Math.round((this.S && this.S.score) || 0) }, extra, { win: !!win });
      this.overT = delay;
      this.releaseAll();
    }
    showResult() {
      const r = this.result;
      r.time = Math.round(this.playTime * 10) / 10;
      r.attempts = this.attempts;
      try { r.stars = clamp(Math.round(this.def.stars ? this.def.stars(this, r) : r.win ? 1 : 0), 0, 3); } catch (e) { r.stars = r.win ? 1 : 0; }
      this.phase = 'result';
      this.root.classList.add('mg-result-on');
      let info = {};
      try { info = (this.def.result && this.def.result(this, r)) || {}; } catch (e) { N.err('minigame.result:' + this.id, e); }
      const title = info.title || (r.win ? 'Shabash!' : 'Arre yaar!');
      const rows = (info.rows || [['Score', r.score]]).map((x) => '<div class="mg-row"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>').join('');
      const prevBest = stats.best[this.id];
      const newBest = r.win && !(prevBest >= r.score) && r.score > 0;
      let stars = '';
      for (let i = 0; i < 3; i++) stars += '<i class="mg-star' + (i < r.stars ? ' on' : '') + '" style="animation-delay:' + (0.25 + i * 0.18) + 's"></i>';
      const canRetry = !this.params.noRetry;
      const primaryDone = r.win || !canRetry;
      this.showCard(
        '<div class="mg-result ' + (r.win ? 'win' : 'lose') + '"><div class="mg-res-a">' +
          '<div class="osd-line mg-osd"><span class="rec">&#9632; STOP</span><span>' + (r.win ? 'JEET GAYE' : 'HAAR GAYE') + '</span>' + (newBest ? '<span class="mg-best">NEW BEST</span>' : '') + '</div>' +
          '<h2>' + esc(title) + '</h2>' + (info.line ? '<p class="mg-sub">' + esc(info.line) + '</p>' : '') +
          '<div class="mg-stars">' + stars + '</div></div><div class="mg-res-b"><div class="mg-rows">' + rows + '</div>' +
          '<div class="mg-actions">' +
            '<button type="button" class="sign-btn' + (primaryDone ? ' primary' : ' alt') + '" data-do="done">' + (r.win ? 'Aage chalo' : 'Chhodo') + '</button>' +
            (canRetry ? '<button type="button" class="sign-btn' + (primaryDone ? ' alt' : ' primary') + '" data-do="retry">Phir se</button>' : '') +
          '</div></div></div>', 'mg-card-result');
      this.sfx(r.win ? 'mission_passed' : 'mission_failed');
      if (this.auto) setTimeout(() => { if (!this.closed && this.phase === 'result' && this.params.autoClose !== false) this.cardDo('done'); }, 900);
    }

    /* --------------------------------------------------------- the loop */
    frame(now) {
      if (this.dead) return;
      this.raf = requestAnimationFrame(this.frameBound);
      let dt = this.last ? (now - this.last) / 1000 : 1 / 60;
      this.last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.05) dt = 0.05;
      this.rt += dt;
      if (!MG.covering && this.rt > 0.25 && !this.closed) MG.covering = true;
      try { this.pollPad(); } catch (e) { /* ignore */ }
      try { this.tick(dt); } catch (e) { N.err('minigame.update:' + this.id, e); }
      if (this.phase === 'paused' && this.drawnPaused) return;
      try { this.render(dt); } catch (e) { N.err('minigame.draw:' + this.id, e); }
      this.drawnPaused = this.phase === 'paused';
    }
    tick(dt) {
      const def = this.def;
      for (const a in this.botTapT) if (this.botTapT[a] > 0) this.botTapT[a] -= dt * this.timeScale;
      if (this.phase === 'countdown') {
        this.cdT -= dt * (this.auto ? 2 : 1);
        const n = this.cdT > 1.4 ? '3' : this.cdT > 0.7 ? '2' : this.cdT > 0 ? '1' : null;
        const label = n || (def.goLabel || 'SHURU!');
        if (def.noCountdown) this.cdShown = label;
        if (label !== this.cdShown) {
          this.cdShown = label;
          this.cdEl.textContent = label;
          this.cdEl.classList.remove('pop'); void this.cdEl.offsetWidth; this.cdEl.classList.add('pop');
          if (n) this.tone(660, 0.08, { type: 'triangle', vol: 0.07 }); else this.tone(990, 0.22, { type: 'triangle', vol: 0.08 });
        }
        if (this.cdT <= 0) { this.phase = 'play'; this.pendP = Object.create(null); this.pendR = Object.create(null); setTimeout(() => { if (this.cdShown === label) this.cdEl.classList.remove('pop'); }, 500); }
        if (def.idle) def.idle(this, dt);
        this.updateFx(dt);
      } else if (this.phase === 'play') {
        const sim = dt * this.timeScale;
        const n = Math.max(1, Math.ceil(sim / (1 / 60) - 1e-3)), h = sim / n;
        const P = this.pendP, R = this.pendR;
        this.pendP = Object.create(null); this.pendR = Object.create(null);
        for (let i = 0; i < n; i++) {
          this.stepP = i === 0 ? P : Object.create(null); this.stepR = i === 0 ? R : Object.create(null);
          if (this.auto && !this.over && def.bot) { try { def.bot(this, h, this.auto); } catch (e) { N.err('minigame.bot:' + this.id, e); } }
          this.t += h;
          if (!this.over) this.playTime += h;
          def.update(this, h);
          this.updateFx(h);
          if (this.phase !== 'play') break;
        }
        this.stepP = EMPTY; this.stepR = EMPTY;
        if (this.over && this.phase === 'play') { this.overT -= dt; if (this.overT <= 0) this.showResult(); }
      } else if (this.phase === 'howto' || this.phase === 'result') {
        if (def.idle) def.idle(this, dt);
        this.updateFx(dt);
      }
      this.hudT -= dt;
      if (this.hudT <= 0) { this.hudT = 0.1; this.updateHud(); }
    }
    updateHud(force) {
      let items = [];
      try { items = (this.def.hud && this.S && this.def.hud(this)) || []; } catch (e) { N.err('minigame.hud:' + this.id, e); }
      const key = items.map((i) => i.k + '|' + i.v + '|' + (i.warn ? 1 : 0)).join('~');
      if (!force && key === this.hudKey) return;
      this.hudKey = key;
      this.statsEl.innerHTML = items.map((i) => '<span class="mg-stat' + (i.warn ? ' warn' : '') + (i.good ? ' good' : '') + '">' + (i.k ? esc(i.k) + ' ' : '') + '<b>' + esc(i.v) + '</b></span>').join('');
      // narrow phones keep the stats on one row: shrink the OSD text to fit rather than clip it
      const se = this.statsEl; se.style.fontSize = '';
      if (se.scrollWidth > se.clientWidth + 1 && se.clientWidth > 0) {
        const fs = parseFloat(getComputedStyle(se).fontSize) || 21;
        se.style.fontSize = Math.max(12, Math.floor(fs * (se.clientWidth / se.scrollWidth) * 0.97)) + 'px';
      }
      if (this.topEl.offsetHeight !== this.topH) this.resize(); // the stats row can change the bar height
    }
    render(dt) {
      const ctx = this.ctx, d = this.dpr;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (this.shakeA > 0.2) {
        const a = this.shakeA;
        ctx.translate((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
        this.shakeA *= Math.pow(0.02, dt);
      } else this.shakeA = 0;
      this.def.draw(this, ctx);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      this.drawFx(ctx);
      if (this.flashA > 0.01) {
        ctx.globalAlpha = Math.min(1, this.flashA); ctx.fillStyle = this.flashC; ctx.fillRect(0, 0, this.W, this.H); ctx.globalAlpha = 1;
        this.flashA *= Math.pow(0.01, dt);
      }
    }

    /* ------------------------------------------------- juice: fx + text */
    shake(a) { if (!this.reduced) this.shakeA = Math.max(this.shakeA, a); }
    flash(c, a) { this.flashC = c || '#fff'; this.flashA = Math.min(this.reduced ? 0.3 : 1, a == null ? 0.5 : a); }
    pop(text, x, y, o) {
      o = o || {};
      this.pops.push({ text, x, y, t: 0, life: o.life || 1.1, color: o.color || '#f2c230', size: o.size || 26, font: o.font || 'display', rise: o.rise == null ? 36 : o.rise, outline: o.outline == null ? 5 : o.outline });
      if (this.pops.length > 24) this.pops.shift();
    }
    /** particles: o {color|colors, speed, spread, angle, life, size, grav, drag, kind 'dot'|'spark'|'paper'|'smoke'} */
    burst(x, y, n, o) {
      o = o || {};
      const cols = o.colors || [o.color || '#f2c230'];
      for (let i = 0; i < n; i++) {
        const ang = (o.angle == null ? Math.random() * TAU : o.angle + (Math.random() - 0.5) * (o.spread == null ? TAU : o.spread));
        const sp = (o.speed || 120) * (0.35 + Math.random() * 0.65);
        this.fx.push({
          x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, t: 0, life: (o.life || 0.8) * (0.6 + Math.random() * 0.6),
          size: (o.size || 4) * (0.6 + Math.random() * 0.8), color: cols[(Math.random() * cols.length) | 0], grav: o.grav == null ? 260 : o.grav,
          drag: o.drag == null ? 1.5 : o.drag, kind: o.kind || 'dot', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
        });
      }
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
    }
    updateFx(dt) {
      const fx = this.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        const p = fx[i];
        p.t += dt;
        if (p.t >= p.life) { fx.splice(i, 1); continue; }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
      for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; if (p.t >= p.life) this.pops.splice(i, 1); }
    }
    drawFx(ctx) {
      for (const p of this.fx) {
        const a = 1 - p.t / p.life;
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.fillStyle = p.color;
        if (p.kind === 'spark') {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
        } else if (p.kind === 'paper') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7)); ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); ctx.restore();
        } else if (p.kind === 'smoke') {
          ctx.globalAlpha = a * 0.45; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + p.t / p.life * 2), 0, TAU); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      for (const p of this.pops) {
        const k = p.t / p.life, s = k < 0.15 ? H.ease.outBack(k / 0.15) : 1;
        const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        ctx.save();
        ctx.translate(p.x, p.y - p.rise * H.ease.out(k));
        ctx.scale(s, s);
        H.text(ctx, p.text, 0, 0, { font: p.font, size: p.size, color: p.color, outline: p.outline, alpha: a });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    /* ---------------------------------------------------------- sound */
    sfx(name, o) {
      try { if (N.audio && N.audio.sfx) return N.audio.sfx(name, Object.assign({ ui: true }, o || {})); } catch (e) { /* ignore */ }
      return false;
    }
    tone(f, dur, o) { return synth.tone(f, dur, o); }
    noise(dur, o) { return synth.noise(dur, o); }
    loop(o) { const l = synth.loop(o); (this.loops || (this.loops = [])).push(l); return l; }
  }
  MG.Game = Game;

  /* =================================================================== KITE */
  // Sankranti terrace kite fight. Rotate the patang (◀ ▶), PULL to make it dart where its nose
  // points; let go and it drifts with the wind. Cross a rival's manja to start a *pech*: keep your
  // tension in the green (pull / release in pulses). Over-pull and your manja snaps. "Bo kaata!"
  {
    const KITE_SKINS = [
      { a: '#f2c230', b: '#d8402a', pat: 'half', line: '#ff3f7a' },     // the player's: yellow/red
      { a: '#2f9e5b', b: '#f4efe2', pat: 'chand', line: '#f4efe2' },
      { a: '#7a3db8', b: '#f2c230', pat: 'band', line: '#e9e17a' },
      { a: '#1f6fc4', b: '#f4efe2', pat: 'eye', line: '#bfe6ff' },
      { a: '#ef7d1a', b: '#1a1214', pat: 'half', line: '#ffd2a6' },
      { a: '#e8487c', b: '#2f9e5b', pat: 'band', line: '#b8f0c2' },
      { a: '#1a1214', b: '#f2c230', pat: 'chand', line: '#ffe9a8' },
    ];
    // systems_design §8.1: green band width (35% - 15%*d) of the gauge (0..1.1), higher kite x1.3,
    // snap after 0.4 s in the red, gusts every 6-10 s, 3 patangs (+1 charkhi, max 5)
    const T = (MG.TUNE.kite = Object.assign({ lives: 3, maxLives: 5, band0: 0.35, band1: 0.15, bandCenter: 0.74, charkhiBand: 0.1, highBonus: 1.3, snapGrace: 0.4,
      gustMin: 6, gustMax: 10, time0: 95, time1: 15, target0: 2, target1: 3, pechRate: 0.95 }, MG.TUNE.kite || {}));
    let SWEET0 = 0.62, SWEET1 = 0.86;
    function setBand(g) {
      const w = (T.band0 - T.band1 * g.diff) * 1.1 * (g.S && g.S.charkhi ? 1 + T.charkhiBand : 1) * (g.assist ? 1.25 : 1);
      SWEET0 = Math.max(0.3, T.bandCenter - w / 2); SWEET1 = Math.min(0.97, T.bandCenter + w / 2);
    }

    function drawKite(ctx, x, y, s, ang, skin, o) {
      o = o || {};
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + Math.PI / 2);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      const t = -s * 1.05, r = s * 0.86, b = s * 0.92, l = -s * 0.86;
      // body
      ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(r, 0); ctx.lineTo(0, b); ctx.lineTo(l, 0); ctx.closePath();
      ctx.fillStyle = skin.a; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = skin.b;
      if (skin.pat === 'half') ctx.fillRect(0, t, r, b - t);
      else if (skin.pat === 'band') ctx.fillRect(l, -s * 0.18, r - l, s * 0.36);
      else if (skin.pat === 'chand') { ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.34, 0, TAU); ctx.fill(); ctx.fillStyle = skin.a; ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.18, s * 0.28, 0, TAU); ctx.fill(); }
      else if (skin.pat === 'eye') { ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.42, 0); ctx.lineTo(0, s * 0.46); ctx.lineTo(-s * 0.42, 0); ctx.closePath(); ctx.fill(); }
      // paper sheen
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(l, t, -l, b - t);
      ctx.restore();
      ctx.lineWidth = Math.max(1, s * 0.07); ctx.strokeStyle = 'rgba(26,18,20,0.75)';
      ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(r, 0); ctx.lineTo(0, b); ctx.lineTo(l, 0); ctx.closePath(); ctx.stroke();
      // spars: the straight spine and the bowed kamaan
      ctx.strokeStyle = 'rgba(70,45,25,0.85)'; ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(0, b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(l, 0); ctx.quadraticCurveTo(0, -s * 0.62, r, 0); ctx.stroke();
      // the little tail (puchhi)
      ctx.fillStyle = skin.b === '#f4efe2' ? skin.a : skin.b;
      ctx.beginPath(); ctx.moveTo(0, b - s * 0.08); ctx.lineTo(s * 0.3, b + s * 0.32); ctx.lineTo(-s * 0.3, b + s * 0.32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(26,18,20,0.6)'; ctx.lineWidth = Math.max(0.8, s * 0.04); ctx.stroke();
      if (o.glow) { ctx.globalAlpha = o.glow; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(r, 0); ctx.lineTo(0, b); ctx.lineTo(l, 0); ctx.closePath(); ctx.stroke(); }
      ctx.restore();
    }

    function segX(ax, ay, bx, by, cx, cy, dx, dy) {
      const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
      const den = rX * sY - rY * sX;
      if (Math.abs(den) < 1e-6) return null;
      const t = ((cx - ax) * sY - (cy - ay) * sX) / den, u = ((cx - ax) * rY - (cy - ay) * rX) / den;
      if (t < 0.18 || t > 0.97 || u < 0.18 || u > 0.97) return null;
      return { x: ax + rX * t, y: ay + rY * t, t, u };
    }

    function newKite(S, anchor, skin, isMe) {
      return { ax: anchor.x, ay: anchor.y, x: anchor.x, y: anchor.y - 4, vx: 0, vy: -26, a: -Math.PI / 2, spin: 0, T: 0.3, skin, me: !!isMe,
        state: 'launch', st: 0, wob: Math.random() * TAU, fall: null, pull: false, steer: 0, aiT: 0, tx: anchor.x, ty: anchor.y - 30, shake: 0 };
    }

    function kiteStep(S, k, dt) {
      const pull = k.pull, steer = k.steer;
      // nose
      if (steer) k.spin = H.approach(k.spin, steer * 2.9, 14 * dt);
      else {
        k.spin = H.approach(k.spin, 0, 8 * dt);
        if (!pull) k.a += U.angleDiff(k.a, -Math.PI / 2 + Math.sin(S.time * 1.7 + k.wob) * 0.35) * 0.9 * dt; // settle nose-up, a lazy wobble
      }
      k.a = U.wrapAngle(k.a + k.spin * dt);
      // forces
      const nx = Math.cos(k.a), ny = Math.sin(k.a);
      if (pull) { k.vx += nx * 62 * dt; k.vy += ny * 62 * dt; }
      else k.vy += 7 * dt; // sink when slack
      k.vx += (S.wind - k.vx) * (pull ? 0.25 : 0.7) * dt;
      const drag = Math.exp(-1.45 * dt);
      k.vx *= drag; k.vy *= drag;
      k.x += k.vx * dt; k.y += k.vy * dt;
      // sky bounds (soft)
      const m = 4;
      if (k.x < m) { k.x = m; k.vx = Math.abs(k.vx) * 0.4; }
      if (k.x > S.Wu - m) { k.x = S.Wu - m; k.vx = -Math.abs(k.vx) * 0.4; }
      if (k.y < m + 1) { k.y = m + 1; k.vy = Math.abs(k.vy) * 0.4; }
      const floor = S.roofY - 5;
      if (k.y > floor) { k.y = floor; k.vy = -Math.abs(k.vy) * 0.5 - 6; if (k.me && !S.over) S.lowWarnT = 1.2; }
      // manja length (charkhi limit)
      const dx = k.x - k.ax, dy = k.y - k.ay, d = Math.hypot(dx, dy);
      if (d > S.Lmax) { k.x = k.ax + (dx / d) * S.Lmax; k.y = k.ay + (dy / d) * S.Lmax; const vr = (k.vx * dx + k.vy * dy) / d; if (vr > 0) { k.vx -= (vr * dx) / d; k.vy -= (vr * dy) / d; } }
    }

    function tensionStep(S, k, dt, inPech) {
      if (k.pull) {
        k.T += (inPech ? 0.46 : 0.95) * dt;
        if (!inPech && k.T > 0.9) k.T = Math.max(0.9, k.T - 1.2 * dt);
        if (S.gust > 0) k.T += 0.55 * dt; // a gust yanks a taut line
      } else k.T -= (inPech ? 0.55 : 0.85) * dt;
      if (k.T < 0.08) k.T = 0.08;
    }
    function quality(T) {
      if (T < SWEET0) return 0.12 + 0.88 * Math.pow(U.smooth(T / SWEET0), 1.4);
      if (T <= SWEET1) return 1;
      return Math.max(0.3, 1 - ((T - SWEET1) / (1 - SWEET1)) * 0.5);
    }

    function cutKite(g, S, k, how) {
      k.state = 'fall'; k.st = 0; k.pull = false; k.steer = 0;
      k.fall = { vr: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3), how };
      k.vy = -4; k.vx = S.wind * 0.6;
      const p = toPx(S, k.x, k.y);
      g.burst(p.x, p.y, 16, { colors: [k.skin.a, k.skin.b, '#fff6c8'], kind: 'paper', speed: 120, grav: 120, life: 1.3, size: 3.5 });
    }

    function toPx(S, x, y) { return { x: S.ox + x * S.U, y: S.oy + y * S.U }; }

    function pickAnchor(g, S, side) {
      const list = S.anchors.filter((a) => (side ? a.side === side : true) && !S.rivals.some((r) => r.anchor === a && r.state !== 'gone'));
      return list.length ? list[(g.rng.next() * list.length) | 0] : S.anchors[(g.rng.next() * S.anchors.length) | 0];
    }
    function spawnRival(g, S) {
      const side = S.rivals.filter((r) => r.state !== 'gone' && r.anchor.side === 'L').length > S.rivals.filter((r) => r.state !== 'gone' && r.anchor.side === 'R').length ? 'R' : 'L';
      const anchor = pickAnchor(g, S, side);
      S.skinI = (S.skinI % (KITE_SKINS.length - 1)) + 1;
      const k = newKite(S, anchor, KITE_SKINS[S.skinI], false);
      k.anchor = anchor;
      k.aggr = 0.35 + g.diff * 0.45 + g.rng.next() * 0.15;
      k.st = -g.rng.next() * 0.6;
      S.rivals.push(k);
      return k;
    }

    function rivalAI(g, S, k, dt) {
      const me = S.me;
      k.aiT -= dt;
      if (k.aiT <= 0) {
        k.aiT = 2 + g.rng.next() * 2.5;
        if (me.state === 'fly' && g.rng.next() < k.aggr) {
          // go for the player's line: aim at a point just across it
          const t = 0.45 + g.rng.next() * 0.35;
          const px = me.ax + (me.x - me.ax) * t, py = me.ay + (me.y - me.ay) * t;
          const lx = me.x - me.ax, ly = me.y - me.ay, ll = Math.hypot(lx, ly) || 1;
          let nx = -ly / ll, ny = lx / ll;
          const side = Math.sign((k.x - me.ax) * ny * -1 + (k.y - me.ay) * nx) || 1; // which side we are on
          nx *= -side * 10; ny *= -side * 10;
          k.tx = U.clamp(px + nx, 6, S.Wu - 6); k.ty = U.clamp(py + ny, 8, S.roofY - 12);
        } else {
          k.tx = 8 + g.rng.next() * (S.Wu - 16);
          k.ty = 8 + g.rng.next() * (S.roofY * 0.6);
        }
      }
      const want = Math.atan2(k.ty - k.y, k.tx - k.x), dist = Math.hypot(k.tx - k.x, k.ty - k.y);
      const diff = U.angleDiff(k.a, want);
      k.steer = Math.abs(diff) > 0.2 ? Math.sign(diff) : 0;
      k.pull = Math.abs(diff) < 0.55 && dist > 5 && g.rng.next() > 0.04;
      if (dist < 5) k.aiT = Math.min(k.aiT, 0.4);
    }

    function startPech(g, S, k, pt) {
      S.pech = { k, P: 0, t: 0, above: S.me.y < k.y - 1.5, pt, burst: 0, burstIn: 1.2 + g.rng.next() * 1.4, warn: 0, ph: g.rng.next() * TAU };
      S.me.spin = 0; k.spin = 0;
      const p = toPx(S, pt.x, pt.y);
      g.pop(S.pech.above ? 'UPAR SE PECH!' : 'PECH!', p.x, p.y - 20, { size: 30, color: S.pech.above ? '#ffd84a' : '#fff' });
      g.sfx('kite_wind', { vol: 0.9 });
      g.tone(330, 0.12, { type: 'sawtooth', vol: 0.05, f2: 520 });
      g.shake(3);
    }

    function endPech(S, k) {
      if (S.pech) { S.pech = null; }
      if (k && k.state === 'pech') k.state = 'fly';
      if (S.me.state === 'pech') S.me.state = 'fly';
    }

    const def = {
      id: 'kite',
      title: 'Patang Pech',
      sub: 'Sankranti on the terrace. The whole sky is a battlefield.',
      osd: 'SANKRANTI · TERRACE',
      place: 'home_terrace', places: ['home_terrace', 'gulzar_houz', 'playground_'],
      secs: 90,
      music: 'kites',
      goLabel: 'UDAAO!',
      keys: { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'pull', ArrowUp: 'pull', KeyW: 'pull', ShiftLeft: 'pull' },
      buttons: () => [
        { a: 'left', label: '◀', sub: 'TURN' }, { a: 'right', label: '▶', sub: 'TURN' }, { gap: true, w: 0.4 },
        { a: 'pull', label: 'KHENCH', sub: 'HOLD = PULL', cls: 'big' },
      ],
      keyHint: () => '<kbd>←</kbd><kbd>→</kbd> turn the patang &nbsp; hold <kbd>Space</kbd> pull (khench) &nbsp; let go = dheel',
      howto(g) {
        const n = targetCuts(g);
        return {
          lines: [
            '<b>Turn</b> your patang, then <b>pull</b> to make it dart where its nose points. Let go and it drifts with the hawa.',
            'Fly across a rival\'s manja to start a <b>pech</b>. Then pulse the pull: keep the tension needle in the <b>green</b>.',
            'Too much pull (needle in the red) and your manja <b>snaps</b>. When a gust comes, give it dheel (let go). The higher kite cuts faster.' + (g.S.charkhi ? ' Your new <b>charkhi</b> gives an extra patang.' : ''),
          ],
          goal: 'CUT ' + n + ' KITE' + (n > 1 ? 'S' : '') + ' &middot; ' + g.S.livesMax + ' PATANGS &middot; ' + timeLimit(g) + 's',
          keys: '<kbd>←</kbd> <kbd>→</kbd> turn &nbsp;·&nbsp; hold <kbd>Space</kbd> to pull',
          touch: 'Tap <b>◀ ▶</b> to turn &nbsp;·&nbsp; hold <b>KHENCH</b> to pull',
        };
      },
      setup(g) {
        const S = g.S;
        S.charkhi = !!(g.params.charkhi || MG.hasItem('charkhi'));
        S.lives = Math.min(T.maxLives, (g.params.lives || T.lives) + (S.charkhi ? 1 : 0)); S.livesMax = S.lives;
        setBand(g);
        S.score = 0; S.cuts = 0; S.lost = 0; S.time = 0; S.left = timeLimit(g); S.target = targetCuts(g); S.redT = 0; S.latch = false;
        S.wind = (g.rng.next() < 0.5 ? -1 : 1) * (3 + g.rng.next() * 3); S.windT = 8 + g.rng.next() * 4;
        S.gust = 0; S.gustWarn = 0; S.gustIn = T.gustMin + g.rng.next() * (T.gustMax - T.gustMin); S.gustDir = 1;
        S.rivals = []; S.skinI = 0; S.pech = null; S.respawn = 0; S.lowWarnT = 0; S.over = false; S.banner = null;
        S.maxRivals = 2 + (g.diff > 0.45 ? 1 : 0) + (g.diff > 0.8 && !g.portrait ? 1 : 0);
        S.decor = []; S.clouds = []; S.birds = [];
        for (let i = 0; i < 16; i++) S.decor.push({ x: g.rng.next(), y: g.rng.next() * 0.55, s: 0.35 + g.rng.next() * 0.5, sk: KITE_SKINS[1 + ((g.rng.next() * 6) | 0)], ph: g.rng.next() * TAU, sp: 0.004 + g.rng.next() * 0.01 });
        for (let i = 0; i < 6; i++) S.clouds.push({ x: g.rng.next(), y: 0.06 + g.rng.next() * 0.4, s: 0.6 + g.rng.next() * 0.9, sp: 0.004 + g.rng.next() * 0.006 });
        for (let i = 0; i < 3; i++) S.birds.push({ cx: 0.2 + g.rng.next() * 0.6, cy: 0.12 + g.rng.next() * 0.2, r: 0.06 + g.rng.next() * 0.06, ph: g.rng.next() * TAU, sp: 0.4 + g.rng.next() * 0.3 });
        S.cityKey = null;
        S.rasp = g.loop({ ft: 'bandpass', f: 2600, q: 1.4 });
      },
      layout(g) {
        const S = g.S, A = g.area;
        setBand(g);
        const U0 = Math.sqrt(A.w * A.h) / 100;
        S.U = U0; S.ox = A.x; S.oy = A.y; S.Wu = A.w / U0; S.Hu = A.h / U0;
        S.roofY = S.Hu * (g.portrait ? 0.8 : 0.76);
        S.ks = g.portrait ? 3.4 : 3.2; // kite half-size (u)
        S.kidS = Math.min(0.24, S.Hu * 0.0042); // u per kid-sprite unit (the kid is ~60 units tall)
        const feet = S.Hu - 1.2;
        const meAnchor = { x: S.Wu * 0.5, y: feet - 66 * S.kidS };
        S.meFeet = feet;
        // rooftops (two layers) — the near layer's roofs are where the rival kids stand
        const rng = U.rng(g.baseSeed ^ 0x51ed);
        S.roofs = [];
        const layers = [{ y: S.roofY, hmin: 3, hmax: 8, tank: 0.35, near: false }, { y: S.roofY + 4, hmin: 2, hmax: 6, tank: 0.5, near: true }];
        for (const L of layers) {
          let x = -2;
          while (x < S.Wu) {
            const w = 6 + rng.next() * 12, h = L.hmin + rng.next() * (L.hmax - L.hmin);
            S.roofs.push({ x, w, top: L.y - h, near: L.near, r1: rng.next(), r2: rng.next(), r3: rng.next(), r4: rng.next(), r5: rng.next(), seed: (rng.next() * 1e9) | 0 });
            x += w + rng.next() * 1.5;
          }
        }
        S.anchors = [];
        S.tinyS = Math.min(0.32, S.Hu * 0.0056);
        const nSide = g.portrait ? 2 : 3;
        for (const side of ['L', 'R']) {
          for (let i = 0; i < nSide; i++) {
            const f = (i + 0.5) / nSide;
            const want = side === 'L' ? S.Wu * (0.05 + f * 0.3) : S.Wu * (0.95 - f * 0.3);
            const roof = S.roofs.filter((r) => r.near && r.x + 2 < want && r.x + r.w - 2 > want)[0] || S.roofs.filter((r) => r.near).sort((a, b) => Math.abs(a.x + a.w / 2 - want) - Math.abs(b.x + b.w / 2 - want))[0];
            const x = U.clamp(want, roof.x + 1.5, roof.x + roof.w - 1.5);
            S.anchors.push({ x, y: roof.top - 21 * S.tinyS, feet: roof.top, side, look: rng.next() });
          }
        }
        S.Lmax = Math.hypot(S.Wu * 0.55, S.Hu) * 1.05;
        if (!S.me) { S.me = newKite(S, meAnchor, KITE_SKINS[0], true); S.me.state = 'launch'; }
        S.me.ax = meAnchor.x; S.me.ay = meAnchor.y;
        S.me.x = U.clamp(S.me.x, 4, S.Wu - 4); S.me.y = U.clamp(S.me.y, 5, S.roofY - 5);
        for (const r of S.rivals) { const a = r.anchor; if (!S.anchors.includes(a)) { const n = pickAnchor(g, S, a.side); r.anchor = n; r.ax = n.x; r.ay = n.y; } r.x = U.clamp(r.x, 4, S.Wu - 4); r.y = U.clamp(r.y, 5, S.roofY - 5); }
        S.cityKey = null;
        if (S.rivals.length === 0) for (let i = 0; i < S.maxRivals; i++) { const k = spawnRival(g, S); k.st = -0.4 - i * 0.9; }
      },
      update(g, dt) {
        const S = g.S, me = S.me;
        S.time += dt;
        if (!g.over) {
          S.left -= dt;
          if (S.left <= 0) { S.left = 0; S.over = true; endPech(S, S.pech && S.pech.k); g.finish(false, { cuts: S.cuts, lost: S.lost, reason: 'time', delay: 1 }); }
        }
        // wind + gusts
        S.windT -= dt;
        if (S.windT <= 0) { S.windT = 9 + g.rng.next() * 5; S.wind = (g.rng.next() < 0.5 ? -1 : 1) * (2 + g.rng.next() * 4); }
        if (S.gust > 0) S.gust -= dt;
        if (S.gustWarn > 0) {
          S.gustWarn -= dt;
          if (S.gustWarn <= 0) { S.gust = 1.7; S.windSave = S.wind; g.sfx('kite_wind', { vol: 1 }); }
        } else if (S.gust <= 0) {
          S.gustIn -= dt;
          if (S.gustIn <= 0) { S.gustIn = T.gustMin + g.rng.next() * (T.gustMax - T.gustMin); S.gustWarn = 1.1; S.gustDir = g.rng.next() < 0.5 ? -1 : 1; }
        }
        const windNow = S.wind + (S.gust > 0 ? S.gustDir * 15 * Math.sin(Math.min(1, (1.7 - S.gust) / 0.4) * Math.PI * 0.5) : 0);
        const baseWind = S.wind; S.wind = windNow;
        if (S.gust > 0 && g.rng.next() < 0.5) {
          const y = S.oy + g.rng.next() * S.roofY * S.U;
          g.fx.push({ x: S.gustDir > 0 ? -10 : g.W + 10, y, vx: S.gustDir * (500 + g.rng.next() * 300), vy: 0, t: 0, life: 1.2, size: 2, color: 'rgba(255,255,255,0.7)', grav: 0, drag: 0, kind: 'spark', rot: 0, vr: 0 });
        }

        // player control
        if (me.state === 'fly' || me.state === 'pech') {
          if (g.assist) { // Assist: a quick tap latches the pull on/off (hold still works)
            if (g.pressed('pull')) S.pullT = 0;
            if (g.down('pull')) S.pullT = (S.pullT || 0) + dt;
            if (g.released('pull') && S.pullT < 0.22) S.latch = !S.latch;
          }
          me.pull = !g.over && (g.down('pull') || (g.assist && S.latch));
          me.steer = g.over || me.state === 'pech' ? 0 : (g.down('right') ? 1 : 0) - (g.down('left') ? 1 : 0);
        } else { me.pull = false; me.steer = 0; }

        // kites
        const all = [me].concat(S.rivals);
        for (const k of all) {
          k.st += dt;
          if (k.state === 'launch') {
            if (k.st < 0) continue;
            k.vy = Math.min(k.vy, -20); k.pull = false; k.steer = 0;
            kiteStep(S, k, dt);
            if (k.y < k.ay - 16 || k.st > 2) { k.state = 'fly'; k.st = 0; }
          } else if (k.state === 'fly') {
            if (!k.me) rivalAI(g, S, k, dt);
            kiteStep(S, k, dt);
            tensionStep(S, k, dt, false);
            if (k.me) S.redT = k.T > 1 ? S.redT + dt : 0;
            if (k.me && S.redT > T.snapGrace) { // a gust snapped it
              S.lives--; S.lost++; cutKite(g, S, k, 'snap');
              g.pop('MANJA TOOT GAYA!', g.W / 2, S.oy + S.roofY * S.U * 0.45, { color: '#ff8a7a', size: 28 });
              g.sfx('kite_cut'); g.shake(6);
            }
          } else if (k.state === 'pech') {
            const jit = Math.sin(S.time * 31 + k.wob) * 0.12;
            k.vx *= Math.exp(-5 * dt); k.vy *= Math.exp(-5 * dt);
            k.x += k.vx * dt + jit * (k.me ? 1 : -1) * dt * 6; k.y += k.vy * dt + Math.sin(S.time * 7 + k.wob) * dt * 1.5;
            k.a += U.angleDiff(k.a, Math.atan2(k.y - k.ay, k.x - k.ax)) * 1.5 * dt;
            if (!k.me) tensionStep(S, k, dt, true);
          } else if (k.state === 'fall') {
            k.vy = Math.min(k.vy + 9 * dt, 16); k.vx += (S.wind * 0.8 - k.vx) * 0.6 * dt;
            k.x += k.vx * dt + Math.sin(k.st * 3) * 4 * dt; k.y += k.vy * dt; k.a += k.fall.vr * dt;
            if (k.y > S.Hu + 10 || k.st > 7) { k.state = 'gone'; k.st = 0; }
          }
        }
        S.wind = baseWind;
        // kites don't overlap
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          if ((a.state !== 'fly' && a.state !== 'launch') || (b.state !== 'fly' && b.state !== 'launch')) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = S.ks * 2.2;
          if (d < m && d > 0.01) { const p = ((m - d) / d) * 0.5; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
        }

        // pech detection
        if (!S.pech && me.state === 'fly' && !g.over) {
          for (const k of S.rivals) {
            if (k.state !== 'fly') continue;
            const pt = segX(me.ax, me.ay, me.x, me.y, k.ax, k.ay, k.x, k.y);
            if (pt) { me.state = 'pech'; k.state = 'pech'; startPech(g, S, k, pt); break; }
          }
        }
        // the duel
        const P = S.pech;
        if (P) {
          const k = P.k;
          P.t += dt;
          tensionStep(S, me, dt, true);
          const live = segX(me.ax, me.ay, me.x, me.y, k.ax, k.ay, k.x, k.y);
          if (live) P.pt = live;
          // rival effort: a wavering pull plus telegraphed "khench" bursts
          P.burstIn -= dt;
          if (P.burstIn <= 0 && P.burst <= 0 && P.warn <= 0) { P.warn = 0.55; }
          if (P.warn > 0) { P.warn -= dt; k.shake = 1; if (P.warn <= 0) { P.burst = 0.75; P.burstIn = 1.6 + g.rng.next() * 1.8 - g.diff * 0.6; } }
          if (P.burst > 0) P.burst -= dt;
          const base = 0.36 + g.diff * 0.36;
          const rival = base * (0.85 + 0.25 * Math.sin(P.t * 2.3 + P.ph)) + (P.burst > 0 ? 0.42 + g.diff * 0.2 : 0);
          const you = quality(me.T) * (P.above ? T.highBonus : 1);
          P.you = you; P.rival = rival;
          P.P += (you - rival) * T.pechRate * dt;
          S.redT = me.T > 1 ? S.redT + dt : 0;
          if (S.rasp) S.rasp.set(0.02 + 0.05 * Math.min(1, you + rival) * (me.pull ? 1 : 0.5), 1800 + me.T * 2000);
          // the manja creaks when it is about to snap
          S.creakT = (S.creakT || 0) - dt;
          if (me.T > 0.92 && S.creakT <= 0) { S.creakT = 0.16; g.tone(1400 + me.T * 900, 0.05, { type: 'sawtooth', vol: 0.035 }); }
          const pp = toPx(S, P.pt.x, P.pt.y);
          if (g.rng.next() < 0.6) g.burst(pp.x, pp.y, 1, { colors: ['#fff6c8', '#ffd84a', '#ff9a4a'], kind: 'spark', speed: 140, grav: 200, life: 0.35, size: 2.2 });
          if (S.redT > T.snapGrace) {
            S.redT = 0; S.latch = false;
            S.lives--; S.lost++; cutKite(g, S, me, 'snap'); endPech(S, k);
            g.pop('MANJA TOOT GAYA!', pp.x, pp.y - 24, { color: '#ff8a7a', size: 28 });
            g.sfx('kite_cut'); g.shake(7); g.flash('#ff5a3a', 0.25);
          } else if (P.P >= 1) {
            S.cuts++;
            const quick = Math.max(0, Math.round(60 - P.t * 12));
            S.score += 100 + (P.above ? 50 : 0) + quick;
            cutKite(g, S, k, 'cut'); endPech(S, null); me.state = 'fly';
            g.pop('BO KAATA!', pp.x, pp.y - 24, { size: 40, color: '#ffd84a', life: 1.5 });
            g.burst(pp.x, pp.y, 26, { colors: ['#ffd84a', '#fff6c8', '#ff7a4a', k.skin.a], kind: 'paper', speed: 200, grav: 160, life: 1.4, size: 3 });
            g.sfx('kite_cut'); g.sfx('bo_kaata', { delay: 0.2 });
            g.shake(5); g.flash('#fff6c8', 0.3);
            N.emit('minigame:event', { id: 'kite', type: 'cut', cuts: S.cuts });
            if (S.cuts >= S.target && !g.over) {
              S.score += Math.round(S.left) * 5 + S.lives * 100;
              g.finish(true, { cuts: S.cuts, lost: S.lost, livesLeft: S.lives, delay: 1.8 });
            }
          } else if (P.P <= -1) {
            S.lives--; S.lost++; cutKite(g, S, me, 'cut'); endPech(S, k);
            g.pop('KAT GAYI!', pp.x, pp.y - 24, { color: '#ff8a7a', size: 32 });
            g.sfx('kite_cut'); g.shake(6);
          } else if (!live && P.t > 0.6) {
            endPech(S, k); g.pop('chhoot gaya', pp.x, pp.y - 16, { size: 20, color: '#eaf2ff', font: 'body' });
          } else if (P.t > 9) {
            endPech(S, k); me.vy = 10; k.vy = 10;
            g.pop('BARABAR!', pp.x, pp.y - 16, { size: 24, color: '#eaf2ff' });
          }
        } else if (S.rasp) S.rasp.set(0);
        if (!P) { for (const k of S.rivals) k.shake = 0; }

        // lives / respawns
        if (me.state === 'gone' || (me.state === 'fall' && me.st > 1.4)) {
          if (S.lives <= 0) { if (!g.over) g.finish(false, { cuts: S.cuts, lost: S.lost, reason: 'kites', delay: 0.8 }); }
          else if (me.state !== 'launch') { const nk = newKite(S, { x: me.ax, y: me.ay }, KITE_SKINS[0], true); S.me = nk; g.pop('nayi patang!', toPx(S, nk.ax, nk.ay).x, toPx(S, nk.ax, nk.ay).y - 30, { size: 20, color: '#fff', font: 'body' }); }
        }
        for (let i = S.rivals.length - 1; i >= 0; i--) if (S.rivals[i].state === 'gone') S.rivals.splice(i, 1);
        const flying = S.rivals.filter((r) => r.state !== 'fall').length;
        if (flying < S.maxRivals && !g.over) { S.respawn -= dt; if (S.respawn <= 0) { const k = spawnRival(g, S); k.st = -0.2; S.respawn = 2.5 + g.rng.next() * 2; } }
        if (S.lowWarnT > 0) S.lowWarnT -= dt;
      },
      idle(g, dt) { const S = g.S; if (S) S.time = (S.time || 0) + dt; },
      bot(g, dt, want) {
        const S = g.S, me = S.me;
        if (me.state !== 'fly' && me.state !== 'pech') { g.botHold('pull', false); g.botHold('left', false); g.botHold('right', false); return; }
        if (S.pech) {
          g.botHold('left', false); g.botHold('right', false);
          if (want === 'lose') { g.botHold('pull', true); return; }
          if (me.T < (SWEET0 + T.bandCenter) / 2) g.botHold('pull', true); else if (me.T > (T.bandCenter + SWEET1) / 2) g.botHold('pull', false);
          return;
        }
        let best = null, bd = 1e9;
        for (const k of S.rivals) { if (k.state !== 'fly') continue; const d = Math.hypot(k.x - me.x, k.y - me.y); if (d < bd) { bd = d; best = k; } }
        let tx = S.Wu / 2, ty = S.roofY * 0.4;
        if (best) {
          const t = 0.6, px = best.ax + (best.x - best.ax) * t, py = best.ay + (best.y - best.ay) * t;
          const lx = best.x - best.ax, ly = best.y - best.ay, ll = Math.hypot(lx, ly) || 1;
          const nx = -ly / ll, ny = lx / ll;
          const side = Math.sign((me.x - px) * nx + (me.y - py) * ny) || 1;
          tx = px - nx * side * 9; ty = Math.min(S.roofY - 10, py - ny * side * 9 - 3);
        }
        const want_ = Math.atan2(ty - me.y, tx - me.x), diff = U.angleDiff(me.a, want_);
        g.botHold('left', diff < -0.18); g.botHold('right', diff > 0.18);
        const gusty = S.gust > 0 || S.gustWarn > 0;
        g.botHold('pull', want === 'lose' ? true : !gusty && Math.abs(diff) < 0.7 && me.T < 0.88);
      },
      hud(g) {
        const S = g.S;
        return [
          { k: 'CUT', v: S.cuts + '/' + S.target, good: S.cuts > 0 },
          { k: 'PATANG', v: String(S.lives), warn: S.lives === 1 },
          { k: '', v: fmtT(S.left), warn: S.left < 15 },
        ];
      },
      draw(g, ctx) {
        const S = g.S, W = g.W, Hh = g.H;
        if (S.cityKey !== W + 'x' + Hh + ':' + g.dpr) paintCity(g, S);
        const u = S.U;
        // sky
        ctx.drawImage(S.skyC, 0, 0, W, Hh);
        // clouds
        for (const c of S.clouds) {
          const cx = (((c.x + S.time * c.sp) % 1.3) - 0.15) * W, cy = S.oy + c.y * S.roofY * u;
          cloud(ctx, cx, cy, c.s * u * 9);
        }
        // the sky full of kites (far)
        for (const d of S.decor) {
          const x = (((d.x + S.time * d.sp) % 1.2) - 0.1) * W, y = S.oy + d.y * S.roofY * u + Math.sin(S.time * 0.9 + d.ph) * u;
          drawKite(ctx, x, y, d.s * u * 1.9, -Math.PI / 2 + Math.sin(S.time * 1.3 + d.ph) * 0.35, d.sk, { alpha: 0.55 });
        }
        // cheel birds circling
        ctx.strokeStyle = 'rgba(40,30,40,0.7)'; ctx.lineWidth = Math.max(1.2, u * 0.25);
        for (const b of S.birds) {
          const a = S.time * b.sp + b.ph, x = (b.cx + Math.cos(a) * b.r) * W, y = S.oy + (b.cy + Math.sin(a) * b.r * 0.4) * S.roofY * u;
          const f = Math.sin(S.time * 6 + b.ph) * u * 0.6;
          ctx.beginPath(); ctx.moveTo(x - u * 1.6, y - f); ctx.quadraticCurveTo(x - u * 0.6, y - u * 0.8, x, y); ctx.quadraticCurveTo(x + u * 0.6, y - u * 0.8, x + u * 1.6, y - f); ctx.stroke();
        }
        // city
        ctx.drawImage(S.cityC, 0, 0, W, Hh);
        // wind flag on the player's terrace
        drawFlag(ctx, S, g);
        // rival kids on their roofs
        for (const a of S.anchors) {
          const owner = S.rivals.find((r) => r.anchor === a && r.state !== 'gone');
          const p = toPx(S, a.x, a.feet);
          tinyKid(ctx, p.x, p.y, u * S.tinyS, a.look, owner && (owner.pull || owner.state === 'pech') ? 1 : 0, S.time);
        }
        // lines then kites
        const all = S.rivals.concat([S.me]);
        for (const k of all) drawLine(ctx, S, k);
        for (const k of all) {
          if (k.state === 'gone' || (k.state === 'launch' && k.st < 0)) continue;
          const p = toPx(S, k.x, k.y);
          const sh = k.shake ? Math.sin(S.time * 60) * u * 0.25 : 0;
          drawKite(ctx, p.x + sh, p.y, S.ks * u, k.a, k.skin, { glow: k.me && k.state !== 'fall' ? 0.25 + 0.15 * Math.sin(S.time * 5) : 0 });
        }
        // the crossing point
        if (S.pech) {
          const pp = toPx(S, S.pech.pt.x, S.pech.pt.y);
          const gr = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, u * 3.2);
          gr.addColorStop(0, 'rgba(255,246,200,0.95)'); gr.addColorStop(0.35, 'rgba(255,190,80,0.45)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(pp.x, pp.y, u * 3.2, 0, TAU); ctx.fill();
          if (S.pech.warn > 0 || S.pech.burst > 0) {
            const kp = toPx(S, S.pech.k.x, S.pech.k.y);
            H.text(ctx, S.pech.burst > 0 ? 'KHENCH!' : '!', kp.x, kp.y - S.ks * u * 1.9, { font: 'display', size: Math.max(18, u * 3), color: '#ff6a4a', outline: 4 });
          }
        }
        // the player's terrace: kid + friend with the charkhi
        drawMe(ctx, S, g);
        // gauges
        drawGauges(ctx, S, g);
        // messages
        if (S.gustWarn > 0 || S.gust > 0) {
          const a = S.gustWarn > 0 ? 0.6 + 0.4 * Math.sin(g.rt * 18) : 1;
          H.text(ctx, S.gustDir > 0 ? 'HAWA ⟶' : '⟵ HAWA', W / 2, S.oy + u * 7, { font: 'display', size: Math.max(20, u * 3.6), color: '#eaf2ff', outline: 5, stroke: '#1b2a78', alpha: a });
          if (S.me.T > 0.75 && S.me.pull) H.text(ctx, 'dheel do! (let go)', W / 2, S.oy + u * 7 + Math.max(22, u * 3.6), { font: 'body', size: Math.max(14, u * 2), weight: 700, color: '#ffd2c8', outline: 4, alpha: a });
        }
        if (S.lowWarnT > 0) H.text(ctx, 'Arre! antenna se bachao!', W / 2, S.oy + S.roofY * u - u * 9, { font: 'body', weight: 700, size: Math.max(14, u * 2.2), color: '#fff', outline: 4, alpha: Math.min(1, S.lowWarnT) });
      },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? 'Bo kaata!' : r.reason === 'time' ? 'Andhera ho gaya!' : 'Saari patang kat gayi!',
          line: r.win ? 'The whole colony heard you. Immu is already running to lootna the cut kites.' : r.reason === 'time' ? 'Amma is calling everyone down from the terrace.' : 'Ammamma says: pull too hard and it snaps. Let it go a little.',
          rows: [['Kites cut', S.cuts + ' / ' + S.target], ['Patangs lost', S.lost], ['Score', r.score]],
        };
      },
      stars(g, r) { return r.win ? 1 + (g.S.lost === 0 ? 1 : 0) + (g.S.left > timeLimit(g) * 0.35 ? 1 : 0) : 0; },
      cleanup(g) { if (g.S && g.S.rasp) g.S.rasp.stop(); },
    };
    function targetCuts(g) { return g.params.target || Math.round(T.target0 + g.diff * T.target1); }
    function timeLimit(g) { return g.params.time || Math.round(T.time0 - g.diff * T.time1); }
    function fmtT(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

    function cloud(ctx, x, y, s) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.32, 0, 0, TAU);
      ctx.ellipse(x - s * 0.45, y + s * 0.05, s * 0.5, s * 0.26, 0, 0, TAU);
      ctx.ellipse(x + s * 0.2, y - s * 0.16, s * 0.5, s * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,215,235,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.14, s * 0.9, s * 0.13, 0, 0, TAU); ctx.fill();
    }

    function drawLine(ctx, S, k) {
      if (k.state === 'gone' || (k.state === 'launch' && k.st < 0)) return;
      const u = S.U;
      const a = toPx(S, k.ax, k.ay);
      let kx, ky;
      if (k.state === 'fall') {
        // cut: the loose manja droops from the hand
        const t = Math.min(1, k.st / 1.2);
        kx = a.x + (toPx(S, k.x, k.y).x - a.x) * (1 - t * 0.7); ky = a.y + u * 4 + t * u * 6;
        ctx.strokeStyle = k.skin.line; ctx.globalAlpha = 0.6 * (1 - t); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + kx) / 2, ky + u * 8, kx, ky); ctx.stroke(); ctx.globalAlpha = 1;
        return;
      }
      const p = toPx(S, k.x, k.y);
      kx = p.x + Math.cos(k.a + Math.PI) * 0; ky = p.y + S.ks * u * 0.15;
      const sag = (1 - Math.min(1, k.T)) * Math.hypot(kx - a.x, ky - a.y) * 0.16;
      const mx = (a.x + kx) / 2 + S.wind * u * 0.6, my = (a.y + ky) / 2 + sag;
      const taut = Math.min(1, k.T);
      ctx.lineWidth = k.me ? 1.6 + taut * 1.2 : 1.3;
      ctx.strokeStyle = k.me && k.T > SWEET1 ? H.mix(k.skin.line, '#ffffff', (k.T - SWEET1) * 4) : k.skin.line;
      ctx.globalAlpha = k.me ? 0.95 : 0.75;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, kx, ky); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function tinyKid(ctx, x, y, s, look, pulling, t) {
      const shirts = ['#2a8c82', '#d8402a', '#3b6fc4', '#7a3db8', '#e8d9b5', '#ef7d1a'];
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = '#2b2430';
      ctx.fillRect(-2.2, -6, 1.8, 6); ctx.fillRect(0.4, -6, 1.8, 6);
      ctx.fillStyle = shirts[(look * shirts.length) | 0];
      H.rr(ctx, -3, -12, 6, 7, 1.5); ctx.fill();
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(0, -14.5, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -15.2, 2.5, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      const yk = pulling ? Math.sin(t * 14) * 1.1 : 0;
      ctx.beginPath(); ctx.moveTo(-2.6, -11); ctx.lineTo(-1.4, -20 + yk); ctx.moveTo(2.6, -11); ctx.lineTo(1.6, -19 + yk * 0.6); ctx.stroke();
      ctx.restore();
    }

    function drawMe(ctx, S, g) {
      const u = S.U, me = S.me;
      const a = toPx(S, me.ax, me.ay);
      const s = u * S.kidS, feetY = S.oy + S.meFeet * u;
      // friend with the charkhi (spool), to the left
      const fx = a.x - s * 34, fy = feetY + s * 2;
      H.kidBack(ctx, fx, fy, s * 0.9, { shirt: '#2a8c82', pants: '#4a3f35', skin: '#8a5a35' });
      const cx = fx + s * 13, cy = fy - s * 34;
      ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = Math.max(2, s * 4); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx + s * 7, fy - s * 38); ctx.lineTo(cx - s * 2, cy + s * 2); ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.time * (me.pull ? -9 : 2.5));
      const R = s * 7;
      ctx.fillStyle = '#b5844a'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = Math.max(1, s * 1.2);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff3f7a'; ctx.beginPath(); ctx.arc(0, 0, R * 0.68, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-R * 0.2, -R * 0.2, R * 0.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5a3a1a'; ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
      ctx.restore();
      // manja from the charkhi to the player's hands
      ctx.strokeStyle = 'rgba(255,63,122,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo((cx + a.x) / 2, (cy + a.y) / 2 + s * 10, a.x, a.y); ctx.stroke();
      // the player (from behind), arms up holding the manja
      const px = a.x + s * 2, py = feetY;
      const pull = me.pull && (me.state === 'fly' || me.state === 'pech');
      const yank = pull ? Math.sin(S.time * 18) * s * 1.2 : 0;
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = Math.max(2, s * 4.4); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - s * 8, py - s * 42); ctx.lineTo(a.x - s * 3, a.y + s * 3 + yank);
      ctx.moveTo(px + s * 8, py - s * 42); ctx.lineTo(a.x + s * (pull ? 7 : 3), a.y + s * (pull ? 10 : 5) + yank);
      ctx.stroke();
      H.kidBack(ctx, px, py, s, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
    }

    function drawFlag(ctx, S, g) {
      const u = S.U;
      const base = toPx(S, S.me.ax + (g.portrait ? 12 : 18), S.me.ay + 6);
      const top = base.y - u * 13;
      ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = Math.max(1.5, u * 0.35);
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(base.x, top); ctx.stroke();
      const w = S.wind + (S.gust > 0 ? S.gustDir * 12 : 0);
      const len = u * (2.5 + Math.min(6, Math.abs(w) * 0.45)), dir = w >= 0 ? 1 : -1;
      const flap = Math.sin(g.rt * (6 + Math.abs(w))) * u * 0.6;
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.moveTo(base.x, top); ctx.quadraticCurveTo(base.x + dir * len * 0.5, top - flap, base.x + dir * len, top + u * 0.6 + flap * 0.5);
      ctx.lineTo(base.x + dir * len * 0.9, top + u * 2.4 + flap * 0.3); ctx.quadraticCurveTo(base.x + dir * len * 0.4, top + u * 2.2 + flap, base.x, top + u * 2.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(26,18,20,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }

    function drawGauges(ctx, S, g) {
      const u = S.U, me = S.me;
      // tension gauge: right edge, above the roofs
      const gh = Math.min(g.area.h * 0.42, 220), gw = Math.max(16, Math.min(22, u * 2.4));
      const gx = g.W - gw - 24, gy = S.oy + Math.max(12, (S.roofY * u - gh) * 0.5);
      ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, gx - 4, gy - 4, gw + 8, gh + 8, 6); ctx.fill();
      ctx.fillStyle = '#2a2234'; ctx.fillRect(gx, gy, gw, gh);
      const yOf = (t) => gy + gh - (t / 1.1) * gh;
      ctx.fillStyle = 'rgba(111,191,90,0.85)'; ctx.fillRect(gx, yOf(SWEET1), gw, yOf(SWEET0) - yOf(SWEET1));
      ctx.fillStyle = me.T > 0.92 && Math.floor(g.rt * 10) % 2 ? 'rgba(255,120,100,1)' : 'rgba(226,72,58,0.85)'; ctx.fillRect(gx, gy, gw, yOf(1) - gy);
      const T = Math.min(1.1, me.T);
      ctx.fillStyle = me.T > 1 ? '#ff4a3a' : me.T > SWEET1 ? '#ffb04a' : me.T >= SWEET0 ? '#d8ffd0' : '#eaf2ff';
      ctx.fillRect(gx + gw * 0.3, yOf(T), gw * 0.4, gy + gh - yOf(T));
      ctx.fillStyle = '#fff'; ctx.fillRect(gx - 3, yOf(T) - 1.5, gw + 6, 3);
      H.text(ctx, 'MANJA', gx + gw / 2, gy + gh + 14, { font: 'osd', size: 16, color: '#eaf2ff', outline: 3, stroke: '#1b2a78' });
      // the pech tug bar
      const P = S.pech;
      if (P) {
        const bw = Math.min(g.W * 0.7, 360), bh = 16, bx = (g.W - bw) / 2, by = S.oy + 10;
        ctx.fillStyle = 'rgba(18,13,22,0.8)'; H.rr(ctx, bx - 30, by - 8, bw + 60, bh + 16, 8); ctx.fill();
        ctx.fillStyle = '#3a2f44'; ctx.fillRect(bx, by, bw, bh);
        const mid = bx + bw / 2, pos = mid + (P.P * bw) / 2;
        ctx.fillStyle = P.P >= 0 ? '#6fbf5a' : '#e2483a';
        ctx.fillRect(Math.min(mid, pos), by, Math.abs(pos - mid), bh);
        ctx.fillStyle = '#fff'; ctx.fillRect(mid - 1, by - 3, 2, bh + 6);
        drawKite(ctx, bx - 15, by + bh / 2, 8, -Math.PI / 2, P.k.skin);
        drawKite(ctx, bx + bw + 15, by + bh / 2, 8, -Math.PI / 2, S.me.skin);
        H.text(ctx, P.you > P.rival ? 'KAT RAHI HAI...' : 'ZOR LAGAO!', mid, by + bh + 16, { font: 'osd', size: 18, color: P.you > P.rival ? '#b9ffb0' : '#ffb4a6', outline: 3, stroke: '#120d16' });
      }
    }

    function paintCity(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, u = S.U;
      S.cityKey = W + 'x' + Hh + ':' + d;
      // sky
      const sky = (S.skyC = S.skyC || H.canvas(1, 1)); sky.width = Math.round(W * d); sky.height = Math.round(Hh * d);
      let c = sky.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const roofPx = S.oy + S.roofY * u;
      let gr = c.createLinearGradient(0, 0, 0, roofPx);
      gr.addColorStop(0, '#4f9fd6'); gr.addColorStop(0.55, '#9fd0ea'); gr.addColorStop(0.85, '#f3dcae'); gr.addColorStop(1, '#f7c98c');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      const sx = W * 0.82, sy = S.oy + roofPx * 0.18;
      gr = c.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, Hh) * 0.35);
      gr.addColorStop(0, 'rgba(255,250,220,0.95)'); gr.addColorStop(0.08, 'rgba(255,240,190,0.75)'); gr.addColorStop(0.3, 'rgba(255,230,170,0.15)'); gr.addColorStop(1, 'rgba(255,230,170,0)');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      // city
      const city = (S.cityC = S.cityC || H.canvas(1, 1)); city.width = Math.round(W * d); city.height = Math.round(Hh * d);
      c = city.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, Hh);
      const rng = U.rng(g.baseSeed ^ 0xc17e);
      // far skyline (hazy): domes, minarets, water tanks
      const far = roofPx - u * 5;
      c.fillStyle = '#b9a9c9';
      c.beginPath(); c.moveTo(0, Hh);
      let x = 0;
      while (x < W) {
        const w = u * (3 + rng.next() * 7), h = u * (2 + rng.next() * 6);
        c.lineTo(x, far - h); c.lineTo(x + w, far - h); x += w;
      }
      c.lineTo(W, Hh); c.closePath(); c.fill();
      for (let i = 0; i < 4; i++) {
        const mx = W * (0.1 + rng.next() * 0.8), mh = u * (9 + rng.next() * 7);
        c.beginPath(); c.moveTo(mx - u * 0.75, far); c.lineTo(mx - u * 0.55, far - mh); c.lineTo(mx + u * 0.55, far - mh); c.lineTo(mx + u * 0.75, far); c.fill();
        c.fillRect(mx - u * 1, far - mh * 0.62, u * 2, u * 0.45); c.fillRect(mx - u * 0.9, far - mh, u * 1.8, u * 0.4);
        c.beginPath(); c.moveTo(mx - u * 0.75, far - mh); c.quadraticCurveTo(mx - u * 0.8, far - mh - u * 1.6, mx, far - mh - u * 2.4); c.quadraticCurveTo(mx + u * 0.8, far - mh - u * 1.6, mx + u * 0.75, far - mh); c.fill();
        c.fillRect(mx - u * 0.08, far - mh - u * 3.2, u * 0.16, u * 0.9);
      }
      for (let i = 0; i < 2; i++) {
        const dx = W * (0.15 + rng.next() * 0.7), dr = u * (3 + rng.next() * 2);
        c.beginPath(); c.arc(dx, far - u * 4, dr, Math.PI, TAU); c.fill(); c.fillRect(dx - dr, far - u * 4, dr * 2, u * 4);
      }
      // rooftops: flat terraces with parapets, Sintex tanks, antennas, clotheslines
      for (const R of S.roofs) {
        const x = R.x * u, w = R.w * u, top = S.oy + R.top * u;
        const col = R.near ? (R.r1 < 0.5 ? '#e2c7a2' : '#c9a27a') : (R.r1 < 0.5 ? '#c79a7a' : '#a87a62');
        const tint = ['#e8d9b5', '#d9c3a0', '#c7b9d6', '#bcd3c4', '#e9c6b6', col][(R.r2 * 6) | 0];
        c.fillStyle = H.mix(col, tint, 0.35); c.fillRect(x, top, w, Hh - top);
        c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x, top, w, u * 0.7);
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x + w - u * 0.6, top, u * 0.6, Hh - top);
        const wr = U.rng(R.seed);
        c.fillStyle = 'rgba(60,40,50,0.35)';
        for (let wy = top + u * 2.5; wy < Hh - u; wy += u * 4) for (let wx = x + u * 1.5; wx < x + w - u * 2; wx += u * 3.5) if (wr.next() < 0.7) c.fillRect(wx, wy, u * 1.4, u * 1.8);
        const hasKid = S.anchors.some((a) => a.feet === R.top && a.x * u > x && a.x * u < x + w);
        if (R.r3 < (R.near ? 0.5 : 0.35)) { // black Sintex tank
          let tx = x + u * 1.5 + R.r4 * (w - u * 5);
          if (hasKid) tx = x + u * 0.8;
          c.fillStyle = '#26222a'; H.rr(c, tx, top - u * 3.4, u * 3, u * 3.4, u * 0.6); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(tx + u * 0.4, top - u * 3.2, u * 0.5, u * 3);
          c.fillStyle = '#1a1214'; c.fillRect(tx + u * 0.6, top - u * 3.9, u * 1.8, u * 0.6);
        }
        if (R.r4 < 0.45 && !hasKid) { // fishbone TV antenna
          const ax = x + u + R.r5 * (w - u * 2), ah = u * (5 + R.r2 * 4);
          c.strokeStyle = '#4a4450'; c.lineWidth = Math.max(1, u * 0.2);
          c.beginPath(); c.moveTo(ax, top); c.lineTo(ax, top - ah);
          for (let k = 0; k < 5; k++) { const yy = top - ah + k * u * 0.8, ww = u * (2.2 - k * 0.25); c.moveTo(ax - ww, yy); c.lineTo(ax + ww, yy); }
          c.stroke();
        }
        if (R.r5 < 0.3) { // clothesline
          const cx0 = x + u, cx1 = x + w - u, cy = top - u * 2.2;
          c.strokeStyle = 'rgba(60,50,50,0.6)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(cx0, cy); c.quadraticCurveTo((cx0 + cx1) / 2, cy + u * 0.8, cx1, cy); c.stroke();
          const cols = ['#d8402a', '#2a8c82', '#f2c230', '#efe9dc', '#7a3db8'];
          for (let k = 0; k < 4; k++) { const t = 0.15 + k * 0.22; c.fillStyle = cols[(wr.next() * cols.length) | 0]; c.fillRect(cx0 + (cx1 - cx0) * t, cy + u * 0.45, u * 1.4, u * 2); }
        }
        // parapet lip
        c.fillStyle = 'rgba(40,25,20,0.25)'; c.fillRect(x, top + u * 0.7, w, u * 0.35);
      }
      // the player's own terrace parapet (front), whitewashed, across the bottom
      const py = S.oy + (S.meFeet - 9 * S.kidS * 4) * u;
      gr = c.createLinearGradient(0, py, 0, Hh);
      gr.addColorStop(0, '#efe9dc'); gr.addColorStop(0.2, '#ddd2bd'); gr.addColorStop(1, '#a89880');
      c.fillStyle = gr; c.fillRect(0, py, W, Hh - py);
      c.fillStyle = '#c9bca4'; c.fillRect(0, py, W, u * 0.9);
      c.fillStyle = 'rgba(80,60,40,0.18)';
      for (let i = 0; i < 40; i++) c.fillRect(rng.next() * W, py + u + rng.next() * (Hh - py), u * (0.5 + rng.next() * 2), u * 0.3);
      // a potted plant + a red-oxide water pipe on the parapet
      const pot = py;
      c.fillStyle = '#b5694a'; c.fillRect(W * 0.86, pot - u * 2.4, u * 3, u * 2.4);
      c.fillStyle = '#4f7a3a'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(W * 0.86 + u * 1.5 + (i - 2.5) * u * 0.5, pot - u * 3.4 - (i % 2) * u, u * 0.5, u * 1.6, (i - 2.5) * 0.3, 0, TAU); c.fill(); }
    }

    MG.register(def);
  }

  /* =================================================================== CLAP */
  // Call and echo rhythm (systems_design §8.2). SUNO: the guide claps n notes on an 8/16-slot bar;
  // 4 count-in ticks; AB AAP: clap the same slots on time. A mistake (miss or extra clap) costs one
  // of 3 *mauke* and the round replays. Skins: 'golconda' (Fateh Darwaza; each clean round lights a
  // lamp up to Bala Hissar, the echo comes back), 'drums' (keep step with the Bonalu dappu drummers;
  // no fail: Amma's bonam wobbles and the round replays), 'doorway' (clap the remembered Golconda
  // rhythm at the storeroom door; Immu answers from inside).
  {
    const T = (MG.TUNE.clap = Object.assign({ bpm0: 90, bpm1: 30, perfect: 0.045, good: 0.09, ok: 0.14, chances: 3, echoDelay: 0.35, pts: { perfect: 100, good: 70, ok: 40 } }, MG.TUNE.clap || {}));
    const SKINS = {
      golconda: {
        title: 'Golconda Taali', sub: 'Clap under the Fateh Darwaza dome. They hear it at the very top.', osd: 'GOLCONDA · FATEH DARWAZA', go: 'SUNO!',
        lines: (g) => [
          '<b>SUNO</b>: the guide claps a rhythm under the dome. Watch the strip and listen to the beat.',
          '<b>AB AAP</b>: after the 4 ticks, clap the same rhythm back, on time. Extra claps count as mistakes.',
          'Every clean echo climbs the hill and lights a lamp on the way to <b>Bala Hissar</b>.' + (hideNotes(g) ? ' At this level the notes hide on your turn: remember them!' : ''),
        ],
        win: 'Bala Hissar ne suna!', winLine: 'Your claps climbed 400 years of granite and came back. Immu is waving from the top.',
        lose: 'Echo kho gaya...', loseLine: 'The guide smiles: "Dome ko sunao, apne aap ko nahi." Listen to the beat, then clap.',
      },
      drums: {
        title: 'Bonalu Dappu', sub: 'Walk with Amma\'s bonam. Keep step with the drums.', osd: 'BONALU · PROCESSION', go: 'SUNO!', noFail: true,
        lines: (g) => [
          '<b>SUNO</b>: the dappu drummers play a beat. Watch the strip and feel it.',
          '<b>AB AAP</b>: after the 4 ticks, step with the same beat, on time.',
          'Miss a step and Amma\'s bonam wobbles: no harm, the drummers simply play it again.',
        ],
        win: 'Ekdum taal mein!', winLine: 'The drummers grin and play louder. Amma\'s bonam never wobbled.',
        lose: 'Taal toot gaya', loseLine: 'Amma steadies the bonam: "Dheere, kanna. Drums ke saath."',
      },
      doorway: {
        title: 'Darwaza Taali', sub: 'The storeroom door. The Golconda rhythm. Will he answer?', osd: 'THE STOREROOM DOOR', go: 'YAAD HAI?', recall: true,
        lines: () => [
          'The strip shows the <b>Golconda rhythm</b> you clapped with Immu. Remember it.',
          'After the 4 ticks, <b>clap it</b> at the door, on time.',
          'Clap it right and Immu answers from inside.',
        ],
        win: 'Immu ne jawab diya!', winLine: 'Behind the door, the same rhythm comes back. Then the latch.',
        lose: 'Darwaza band hai', loseLine: 'Silence from the storeroom. Try the rhythm again, slower.',
      },
    };
    const RECALL_SLOTS = [0, 2, 3, 6]; // ta . ta ta . . ta . : the rhythm from Golconda

    const def = {
      id: 'clap',
      title: 'Golconda Taali',
      sub: SKINS.golconda.sub,
      osd: SKINS.golconda.osd,
      place: 'golconda_fateh_darwaza', places: ['golconda_fateh_darwaza', 'golconda_fort'],
      secs: 70,
      goLabel: 'SUNO!',
      keys: { Space: 'clap', KeyJ: 'clap', KeyF: 'clap', KeyK: 'clap', KeyD: 'clap', ArrowUp: 'clap', ArrowDown: 'clap', Enter: 'clap', NumpadEnter: 'clap', KeyX: 'clap', KeyZ: 'clap', KeyC: 'clap' },
      buttons: (g) => [{ gap: true }, { a: 'clap', label: skinOf(g) === SKINS.drums ? 'THAP!' : 'TAALI', sub: skinOf(g) === SKINS.drums ? 'TAP TO STEP' : 'TAP TO CLAP', cls: 'big' }, { gap: true }],
      keyHint: (g) => '<kbd>Space</kbd> ' + (skinOf(g) === SKINS.drums ? 'step' : 'clap') + ' (or <kbd>F</kbd> <kbd>J</kbd>, or click) &nbsp; listen first, then echo it on the beat',
      howto(g) {
        const K = skinOf(g), n = rounds(g);
        return {
          title: g.params.title || K.title, sub: K.sub, osd: K.osd,
          lines: K.lines(g),
          goal: (K.recall ? 'CLAP THE RHYTHM' : n + ' RHYTHM' + (n > 1 ? 'S' : '')) + ' &middot; ' + (noFail(g) ? 'NO FAIL' : T.chances + ' MAUKE (CHANCES)'),
          keys: '<kbd>Space</kbd> ' + (K === SKINS.drums ? 'step' : 'clap') + ' &nbsp;·&nbsp; or click the screen',
          touch: 'Tap <b>' + (K === SKINS.drums ? 'THAP!' : 'TAALI') + '</b> or anywhere on the screen',
        };
      },
      setup(g) {
        const S = g.S;
        S.K = skinOf(g); S.skin = skinName(g);
        if (g.nameEl && !g.params.title) g.nameEl.textContent = S.K.title;
        S.score = 0; S.round = 0; S.rounds = rounds(g); S.chances = T.chances; S.noFail = noFail(g); S.fails = 0; S.perfects = 0; S.notesTotal = 0;
        S.bpm = Math.round(T.bpm0 + g.diff * T.bpm1);
        S.beat = 60 / S.bpm; S.slot = S.beat / 2;
        S.winP = T.perfect * g.winMul; S.winG = T.good * g.winMul; S.winO = T.ok * g.winMul;
        S.hide = hideNotes(g) && !g.assist;
        S.rings = []; S.orbs = []; S.marks = []; S.lit = 0; S.litT = 0; S.wave = 0; S.guideClap = 0; S.kidClap = 0; S.wobble = 0; S.door = 0; S.doorT = 0;
        S.stars = []; for (let i = 0; i < 60; i++) S.stars.push({ x: g.rng.next(), y: g.rng.next() * 0.55, r: 0.5 + g.rng.next() * 1.2, ph: g.rng.next() * TAU });
        S.bats = []; S.msg = null;
        S.clock = 0;
        newRound(g, S, 0.6);
      },
      layout(g) { g.S.bgKey = null; },
      update(g, dt) {
        const S = g.S;
        S.clock += dt;
        const R = S.R;
        const t = S.clock - R.t0;
        // scheduled sounds: ticks + the guide's notes
        while (R.ev.length && R.ev[0].t <= t) {
          const e = R.ev.shift();
          if (e.k === 'tick') { g.tone(e.acc ? 1560 : 1180, 0.045, { type: 'sine', vol: e.soft ? 0.05 : 0.09 }); g.tone(e.acc ? 3100 : 2400, 0.012, { type: 'square', vol: 0.02 }); S.tickT = 0.12; S.tickAcc = e.acc; }
          else if (e.k === 'demo') { guideSound(g, S, false); S.guideClap = 0.18; ring(S, 'guide'); R.shown[e.i] = true; }
          else if (e.k === 'answer') { guideSound(g, S, true); S.guideClap = 0.18; ring(S, 'guide'); }
          else if (e.k === 'stage') { R.stage = e.s; if (e.s === 'you') S.msg = { text: S.K === SKINS.drums ? 'AB CHALO!' : 'AB AAP!', t: 0, col: '#ffd84a' }; if (e.s === 'listen') S.msg = { text: S.K.recall ? 'YAAD HAI?' : 'SUNO...', t: 0, col: '#eaf2ff' }; }
          else if (e.k === 'done') finishRound(g, S);
        }
        // the player's claps
        if (!g.over && g.pressed('clap')) clap(g, S, t);
        // misses: expected notes whose window has passed
        if (R.stage === 'you' || R.stage === 'judge') {
          for (const n of R.notes) {
            if (n.res || t < R.pB + n.s * S.slot + S.winO) continue;
            n.res = 'miss'; R.errors++;
            mark(g, S, n.s, 'miss');
            g.tone(140, 0.12, { type: 'triangle', vol: 0.06 });
            if (S.K === SKINS.drums) S.wobble = 1;
          }
        }
        if (R.stage === 'you' && t > R.pB + R.L * S.slot + S.winO) { R.stage = 'judge'; judge(g, S); }
        if (R.stage === 'next' && t > R.nextAt) {
          if (S.round >= S.rounds) { if (!g.over) { S.score += S.chances * 150; g.finish(true, { skin: S.skin, rounds: S.round, fails: S.fails, perfects: S.perfects, delay: 1.6 }); } }
          else newRound(g, S, 0);
        }
        animate(g, S, dt);
      },
      idle(g, dt) { const S = g.S; if (!S) return; S.clock += dt; if (S.R) S.R.t0 += dt; animate(g, S, dt); },
      pointer(g, type) { if (type === 'down') g.press('clap', 'ptr'); else if (type === 'up') g.release('clap', 'ptr'); },
      bot(g, dt, want) {
        const S = g.S, R = S.R;
        if (R.stage !== 'you') return;
        const t = S.clock - R.t0 + dt;
        for (const n of R.notes) {
          if (n.bot) continue;
          const nt = R.pB + n.s * S.slot + (want === 'lose' ? 0.32 : 0);
          if (t >= nt) { n.bot = true; g.botPress('clap'); break; }
        }
      },
      hud(g) {
        const S = g.S;
        return [{ k: S.K === SKINS.drums ? 'TAAL' : 'TAAL', v: Math.min(S.round, S.rounds) + '/' + S.rounds }, S.noFail ? { k: 'GALTI', v: String(S.fails) } : { k: 'MAUKE', v: String(S.chances), warn: S.chances === 1 }, { k: 'SCORE', v: String(S.score) }];
      },
      draw(g, ctx) { const S = g.S; if (S.K === SKINS.drums) drawDrums(g, ctx, S); else if (S.K === SKINS.doorway) drawDoorway(g, ctx, S); else drawClap(g, ctx, S); },
      result(g, r) {
        const S = g.S, K = S.K;
        return {
          title: r.win ? K.win : K.lose,
          line: r.win ? K.winLine : K.loseLine,
          rows: [['Rhythms', Math.min(S.round, S.rounds) + ' / ' + S.rounds], ['Perfect ' + (K === SKINS.drums ? 'steps' : 'claps'), S.perfects + ' / ' + S.notesTotal], ['Mistakes', S.fails], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.fails === 0 ? 1 : 0) + (S.perfects >= S.notesTotal * 0.7 ? 1 : 0) : 0; },
    };
    function skinName(g) { return SKINS[g.params.skin] ? g.params.skin : 'golconda'; }
    function skinOf(g) { return SKINS[skinName(g)]; }
    function noFail(g) { return g.params.noFail != null ? !!g.params.noFail : !!skinOf(g).noFail; }
    function hideNotes(g) { return g.diff >= 0.55; }
    function rounds(g) { return g.params.rounds || (skinOf(g).recall ? 1 : Math.round(4 + g.diff * 2)); }

    function guideSound(g, S, answer) {
      if (S.K === SKINS.drums) { // dappu: a low thump with a skin slap
        g.tone(96, 0.14, { type: 'sine', vol: 0.2, f2: 58 }); g.noise(0.07, { f: 850, q: 1.2, vol: 0.12 });
      } else if (S.K === SKINS.doorway && answer) { // Immu's claps, muffled through the door
        g.sfx('clap', { pitch: 0.7, vol: 0.45, key: 'door' }); g.noise(0.05, { ft: 'lowpass', f: 700, vol: 0.06 });
      } else g.sfx('clap', { pitch: 0.82, vol: 0.9 });
    }
    function playerSound(g, S) {
      if (S.K === SKINS.drums) { g.noise(0.09, { f: 6200, q: 3, vol: 0.07 }); g.tone(150, 0.06, { type: 'sine', vol: 0.08, f2: 90 }); } // ghungroo + a stamp
      else g.sfx('clap', { pitch: 1.08 });
    }

    function newRound(g, S, lead) {
      const k = S.round; // 0-based index of this rhythm
      let notes, L;
      if (S.K.recall) { L = 8; notes = RECALL_SLOTS.map((s) => ({ s, res: null })); }
      else {
        const n = Math.min(9, 3 + k + (g.diff > 0.7 ? 1 : 0));
        L = n >= 6 ? 16 : 8;
        const slots = new Set([0]);
        const minGap = g.diff < 0.35 && L === 8 && n <= 4 ? 2 : 1;
        let guard = 0;
        while (slots.size < n && guard++ < 200) {
          const s = (g.rng.next() * L) | 0;
          let ok = true;
          for (const o of slots) if (Math.abs(o - s) < minGap) ok = false;
          if (ok) slots.add(s);
        }
        notes = Array.from(slots).sort((a, b) => a - b).map((s) => ({ s, res: null }));
      }
      const b = S.beat, sl = S.slot;
      const pA = lead + 4 * b, pB = pA + L * sl + 4 * b;
      const ev = [];
      ev.push({ t: lead - 0.01, k: 'stage', s: 'listen' });
      for (let i = 0; i < 4; i++) ev.push({ t: lead + i * b, k: 'tick', acc: i === 0 });
      if (S.K.recall) notes.forEach((nn, i) => ev.push({ t: pA + nn.s * sl, k: 'show', i })); // recall: shown, not played
      else notes.forEach((nn, i) => ev.push({ t: pA + nn.s * sl, k: 'demo', i }));
      if (g.diff < 0.5) for (let i = 0; i < L / 2; i++) ev.push({ t: pA + i * b, k: 'tick', soft: true, acc: i % 4 === 0 });
      ev.push({ t: pA + L * sl - 0.02, k: 'stage', s: 'ready' });
      for (let i = 0; i < 4; i++) ev.push({ t: pA + L * sl + i * b, k: 'tick', acc: i === 0 });
      ev.push({ t: pB - S.winO, k: 'stage', s: 'you' });
      if (g.diff < 0.75) for (let i = 0; i < L / 2; i++) ev.push({ t: pB + i * b, k: 'tick', soft: true, acc: i % 4 === 0 });
      ev.sort((a, c) => a.t - c.t);
      const shown = {};
      if (S.K.recall) notes.forEach((nn, i) => { shown[i] = true; });
      S.R = { t0: S.clock, notes, L, pA, pB, ev, stage: 'pre', errors: 0, extras: 0, shown, claps: [] };
      S.marks = [];
    }

    function clap(g, S, t) {
      const R = S.R;
      S.kidClap = 0.16; S.clapsTotal = (S.clapsTotal || 0) + 1;
      playerSound(g, S);
      ring(S, 'kid');
      if (R.stage !== 'you') {
        if (R.stage === 'listen' || R.stage === 'ready') { S.msg = { text: S.K.recall ? 'Ruko, ticks ke baad!' : 'Pehle suno!', t: 0, col: '#ffb4a6', small: true }; }
        return;
      }
      // match the nearest unjudged note
      let best = null, bd = 1e9;
      for (const n of R.notes) {
        if (n.res) continue;
        const d = Math.abs(t - (R.pB + n.s * S.slot));
        if (d < bd) { bd = d; best = n; }
      }
      const relSlot = (t - R.pB) / S.slot;
      if (best && bd <= S.winO) {
        best.res = bd <= S.winP ? 'perfect' : bd <= S.winG ? 'good' : 'ok';
        S.notesTotal++;
        if (best.res === 'perfect') S.perfects++;
        S.score += T.pts[best.res];
        mark(g, S, relSlot, best.res);
        S.orbs.push({ t: 0, ok: true });
        if (S.K === SKINS.golconda) g.sfx('clap', { pitch: 0.9, vol: 0.35, delay: T.echoDelay, key: 'echo' });
      } else {
        R.extras++; R.errors++;
        mark(g, S, relSlot, 'extra');
        g.tone(180, 0.1, { type: 'triangle', vol: 0.05 });
        if (S.K === SKINS.drums) S.wobble = 1;
      }
    }

    function judge(g, S) {
      const R = S.R;
      for (const n of R.notes) if (!n.res) { n.res = 'miss'; R.errors++; }
      const ok = R.errors === 0;
      if (ok) {
        if (S.K.recall) { // Immu answers through the door, then the round is won
          const b = S.beat, base = S.clock - R.t0 + b * 1.2;
          R.notes.forEach((nn) => R.ev.push({ t: base + nn.s * S.slot, k: 'answer' }));
          R.ev.push({ t: base + R.L * S.slot + 0.2, k: 'done' });
          R.ev.sort((a, c) => a.t - c.t);
          R.stage = 'answer';
          S.msg = { text: 'Suno... andar se!', t: 0, col: '#eaf2ff', big: false };
          return;
        }
        finishRound(g, S);
        return;
      }
      S.fails++;
      if (!S.noFail) S.chances--;
      S.msg = { text: S.noFail ? (S.K === SKINS.drums ? 'Phir se, taal mein!' : 'PHIR SE') : S.chances > 0 ? 'PHIR SE SUNO' : 'BAS!', t: 0, col: '#ffb4a6', big: true };
      g.shake(4);
      if (!S.noFail && S.chances <= 0 && !g.over) { R.stage = 'done'; g.finish(false, { skin: S.skin, rounds: S.round, fails: S.fails, perfects: S.perfects, delay: 1.4 }); return; }
      R.stage = 'next';
      R.nextAt = S.clock - R.t0 + 1.25;
    }
    function finishRound(g, S) {
      const R = S.R;
      S.round++;
      S.score += 100 * S.round;
      S.msg = { text: S.K.recall ? 'DARWAZA KHULA!' : S.K === SKINS.drums ? ['EKDUM TAAL!', 'WAAH!', 'JHOOM!'][(S.round - 1) % 3] : ['WAAH!', 'SHABASH!', 'ZABARDAST!', 'KYA BAAT!'][(S.round - 1) % 4], t: 0, col: '#b9ffb0', big: true };
      if (S.K === SKINS.golconda) g.sfx('clap_echo', { delay: 0.15 });
      else if (S.K === SKINS.drums) { for (let i = 0; i < 6; i++) g.tone(96, 0.12, { type: 'sine', vol: 0.16, f2: 60, delay: i * 0.11 }); }
      else { g.sfx('door_creak', { vol: 0.8 }); S.doorT = 1; }
      S.litTarget = S.round / S.rounds;
      S.wave = 1.4;
      if (S.round >= S.rounds) { g.sfx('applause', { delay: 0.5, vol: S.K === SKINS.doorway ? 0.3 : 1 }); if (S.K === SKINS.golconda) for (let i = 0; i < 8; i++) S.bats.push({ t: -i * 0.08, x: 0, y: 0, vx: (Math.random() - 0.5) * 2, ph: Math.random() * TAU }); }
      R.stage = 'next';
      R.nextAt = S.clock - R.t0 + 1.25;
    }

    function mark(g, S, slot, res) {
      S.marks.push({ slot, res, t: 0 });
      const L = S.lane;
      if (L) {
        const x = L.x + L.pad + (slot / S.R.L) * L.inner;
        const txt = { perfect: 'PERFECT', good: 'ACCHA', ok: 'THEEK', miss: 'MISS', extra: 'EXTRA' }[res];
        const col = { perfect: '#ffd84a', good: '#b9ffb0', ok: '#eaf2ff', miss: '#ff8a7a', extra: '#ffb04a' }[res];
        g.pop(txt, U.clamp(x, 40, g.W - 40), L.y - 8, { size: 18, color: col, font: 'osd', outline: 4, rise: 22, life: 0.8 });
      }
    }
    function ring(S, who) { S.rings.push({ t: 0, who }); if (S.rings.length > 12) S.rings.shift(); }

    function animate(g, S, dt) {
      for (const r of S.rings) r.t += dt;
      while (S.rings.length && S.rings[0].t > 1.2) S.rings.shift();
      for (const o of S.orbs) o.t += dt;
      while (S.orbs.length && S.orbs[0].t > 1.3) S.orbs.shift();
      for (const m of S.marks) m.t += dt;
      if (S.msg) S.msg.t += dt;
      S.guideClap = Math.max(0, S.guideClap - dt); S.kidClap = Math.max(0, S.kidClap - dt);
      S.tickT = Math.max(0, (S.tickT || 0) - dt);
      S.wave = Math.max(0, S.wave - dt);
      S.wobble = Math.max(0, S.wobble - dt * 0.8);
      if (S.doorT > 0) S.door = Math.min(1, S.door + dt * 0.7);
      if (S.litTarget != null) S.lit = H.approach(S.lit, S.litTarget, dt * 0.6);
      for (const b of S.bats) b.t += dt;
    }

    /* ------------------------------------------------------------- drawing */
    function geo(g, S) {
      const W = g.W, Hh = g.H, A = g.area;
      const u = Math.min(W, A.h * 1.2) / 100;
      // hill: base across the middle, summit up-right (portrait: centered)
      const P = g.portrait, short = !P && A.h < 420;
      const sumX = P ? W * 0.62 : W * 0.57, sumY = A.y + A.h * (P ? 0.16 : short ? 0.14 : 0.2);
      const baseY = A.y + A.h * (P ? 0.54 : short ? 0.42 : 0.5);
      const gateX = W * 0.5, gateY = A.y + A.h * (P ? 0.86 : 0.97);
      const charS = (A.h * (P ? 0.13 : short ? 0.24 : 0.22)) / 75;
      // the path: zigzags from the gate up to the summit
      const pts = [[gateX, baseY + (gateY - baseY) * 0.25]];
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const zig = (i % 2 ? -1 : 1) * W * (g.portrait ? 0.16 : 0.12) * (1 - f * 0.7);
        pts.push([lerp(gateX, sumX, f) + zig * (i < steps ? 1 : 0), lerp(baseY - u * 2, sumY + u * 4, f)]);
      }
      const lane = { w: Math.min(W - 40, 560), h: Math.max(46, Math.min(70, A.h * (short ? 0.17 : 0.1))) };
      lane.x = (W - lane.w) / 2; lane.y = P ? A.y + A.h * 0.6 : A.y + A.h * (short ? 0.44 : 0.56); lane.pad = 22; lane.inner = lane.w - lane.pad * 2;
      return { u, sumX, sumY, baseY, gateX, gateY, pts, lane, charS };
    }

    function pathPoint(pts, f) {
      let total = 0; const seg = [];
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
      let want = f * total;
      for (let i = 0; i < seg.length; i++) {
        if (want <= seg[i]) { const k = want / seg[i]; return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]; }
        want -= seg[i];
      }
      return pts[pts.length - 1];
    }

    function paintBg(g, S) {
      const G = (S.G = geo(g, S));
      const W = g.W, Hh = g.H, d = g.dpr, u = G.u;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + g.area.h;
      S.lane = G.lane;
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      // dusk sky
      let gr = c.createLinearGradient(0, 0, 0, G.baseY);
      gr.addColorStop(0, '#1d1840'); gr.addColorStop(0.45, '#4a2f62'); gr.addColorStop(0.8, '#b8607a'); gr.addColorStop(1, '#f0a066');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      // far city haze
      c.fillStyle = 'rgba(80,50,90,0.6)';
      const rng = U.rng(77);
      for (let x = 0; x < W; x += u * 3) c.fillRect(x, G.baseY - u * (1 + rng.next() * 3), u * 3.2, u * 6);
      // the plain outside the fort: dusk ground + a few early lights
      gr = c.createLinearGradient(0, G.baseY, 0, Hh);
      gr.addColorStop(0, '#6a4650'); gr.addColorStop(0.35, '#3e2c36'); gr.addColorStop(1, '#241a22');
      c.fillStyle = gr; c.fillRect(0, G.baseY - u, W, Hh - G.baseY + u);
      for (let i = 0; i < 40; i++) {
        const x = rng.next() * W, y = G.baseY + u * 2 + rng.next() * (G.gateY - G.baseY) * 0.8;
        c.fillStyle = rng.next() < 0.6 ? 'rgba(255,190,110,0.8)' : 'rgba(255,240,200,0.6)';
        c.fillRect(x, y, Math.max(1.5, u * 0.35), Math.max(1.5, u * 0.35));
      }
      // the hill
      c.beginPath();
      c.moveTo(-10, G.baseY + u * 4);
      const hillL = G.sumX - W * 0.55, hillR = G.sumX + W * 0.5;
      c.lineTo(hillL, G.baseY);
      const bumps = 9;
      for (let i = 0; i <= bumps; i++) {
        const f = i / bumps, x = lerp(hillL, hillR, f);
        const hh = Math.sin(f * Math.PI) ** 1.4;
        c.lineTo(x, G.baseY - (G.baseY - G.sumY - u * 3) * hh + (rng.next() - 0.5) * u * 2.5);
      }
      c.lineTo(W + 10, G.baseY + u * 4); c.closePath();
      gr = c.createLinearGradient(0, G.sumY, 0, G.baseY);
      gr.addColorStop(0, '#7d6a66'); gr.addColorStop(1, '#4e3f45');
      c.fillStyle = gr; c.fill();
      // granite boulders
      for (let i = 0; i < 26; i++) {
        const f = rng.next(), x = lerp(hillL + W * 0.08, hillR - W * 0.08, f);
        const top = G.baseY - (G.baseY - G.sumY) * Math.sin(f * Math.PI) ** 1.4;
        const y = lerp(top + u * 2, G.baseY, rng.next() * 0.9), r = u * (1 + rng.next() * 2.4);
        c.fillStyle = rng.next() < 0.5 ? '#8f7f7a' : '#6e5e60';
        c.beginPath(); c.ellipse(x, y, r * 1.3, r, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,220,190,0.18)'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.35, r * 0.6, r * 0.35, 0, 0, TAU); c.fill();
      }
      // crenellated fort walls (three tiers) with round bastions
      for (let tier = 0; tier < 3; tier++) {
        const f0 = 0.12 + tier * 0.09, y0 = lerp(G.baseY, G.sumY, 0.18 + tier * 0.28);
        const xl = lerp(hillL, G.sumX, f0 + tier * 0.25), xr = lerp(hillR, G.sumX, f0 + tier * 0.22);
        const wh = u * (2.6 - tier * 0.5);
        c.fillStyle = tier === 0 ? '#a07e5c' : tier === 1 ? '#8e6f52' : '#7f6249';
        c.fillRect(xl, y0 - wh, xr - xl, wh + u * 0.6);
        for (let x = xl; x < xr; x += u * 1.4) c.fillRect(x, y0 - wh - u * 0.7, u * 0.8, u * 0.7);
        for (let b = 0; b < 3; b++) {
          const bx = lerp(xl, xr, (b + 0.5) / 3);
          c.beginPath(); c.ellipse(bx, y0 - wh * 0.5, u * 1.8, wh * 0.9, 0, Math.PI, TAU); c.lineTo(bx + u * 1.8, y0 + u * 0.5); c.lineTo(bx - u * 1.8, y0 + u * 0.5); c.fill();
          for (let k = -1; k <= 1; k++) c.fillRect(bx + k * u * 1.1 - u * 0.35, y0 - wh * 1.4 - u * 0.6, u * 0.7, u * 0.6);
        }
        c.fillStyle = 'rgba(255,200,150,0.12)'; c.fillRect(xl, y0 - wh, xr - xl, u * 0.35);
      }
      // the path
      c.strokeStyle = 'rgba(214,180,140,0.55)'; c.lineWidth = u * 0.9; c.lineJoin = 'round'; c.lineCap = 'round';
      c.setLineDash([u * 0.9, u * 0.9]);
      c.beginPath(); G.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      c.setLineDash([]);
      // Bala Hissar baradari at the summit
      const bx = G.sumX, by = G.sumY, bw = u * 14, bh = u * 7;
      c.fillStyle = '#b48f68'; c.fillRect(bx - bw / 2, by - bh, bw, bh);
      c.fillStyle = '#9b7856'; c.fillRect(bx - bw / 2 - u * 0.5, by - bh - u * 0.8, bw + u, u * 0.9);
      c.fillRect(bx - bw / 2 - u * 0.5, by - bh * 0.5, bw + u, u * 0.6);
      for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) {
        const ax = bx - bw / 2 + u * 1.2 + i * (bw - u * 2.4) / 4.4, ay = by - bh + u * 1.2 + row * bh * 0.5, aw = u * 1.6, ah = bh * 0.32;
        c.fillStyle = '#3a2a30';
        c.beginPath(); c.moveTo(ax, ay + ah); c.lineTo(ax, ay + aw * 0.4); c.quadraticCurveTo(ax + aw / 2, ay - aw * 0.4, ax + aw, ay + aw * 0.4); c.lineTo(ax + aw, ay + ah); c.fill();
      }
      for (let k = -1; k <= 1; k += 2) { c.fillStyle = '#9b7856'; c.fillRect(bx + k * bw * 0.5 - u * 0.5, by - bh - u * 2.6, u, u * 2); c.beginPath(); c.arc(bx + k * bw * 0.5, by - bh - u * 2.6, u * 0.9, Math.PI, TAU); c.fill(); }
      // the gate arch framing (foreground): a dark sandstone wall with a pointed arch opening
      const archW = Math.min(W * (g.portrait ? 0.96 : 0.7), Hh * 1.1), archX = (W - archW) / 2, springY = g.area.y + g.area.h * (g.portrait ? 0.26 : 0.3), apexY = g.area.y + g.area.h * 0.02;
      c.save();
      c.beginPath();
      c.rect(0, 0, W, Hh);
      c.moveTo(archX, Hh); c.lineTo(archX, springY);
      c.quadraticCurveTo(archX, apexY + (springY - apexY) * 0.25, W / 2, apexY);
      c.quadraticCurveTo(archX + archW, apexY + (springY - apexY) * 0.25, archX + archW, springY);
      c.lineTo(archX + archW, Hh); c.closePath();
      gr = c.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, '#2c1f24'); gr.addColorStop(0.5, '#3a2a2c'); gr.addColorStop(1, '#2a1d22');
      c.fillStyle = gr; c.fill('evenodd');
      c.restore();
      // arch rim (dressed sandstone voussoirs)
      c.strokeStyle = '#7a5a40'; c.lineWidth = Math.max(4, u * 1.4);
      c.beginPath(); c.moveTo(archX, Hh); c.lineTo(archX, springY); c.quadraticCurveTo(archX, apexY + (springY - apexY) * 0.25, W / 2, apexY); c.quadraticCurveTo(archX + archW, apexY + (springY - apexY) * 0.25, archX + archW, springY); c.lineTo(archX + archW, Hh); c.stroke();
      c.strokeStyle = 'rgba(255,210,160,0.25)'; c.lineWidth = Math.max(1, u * 0.3); c.stroke();
      // stone courses on the wall
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
      for (let y = u * 5; y < Hh; y += u * 4.5) { c.beginPath(); c.moveTo(0, y); c.lineTo(archX - u, y); c.moveTo(archX + archW + u, y); c.lineTo(W, y); c.stroke(); }
      // the floor of the portico (lit by the dusk outside)
      const floorY = G.gateY - G.charS * 24;
      gr = c.createLinearGradient(0, floorY, 0, Hh);
      gr.addColorStop(0, '#6a5444'); gr.addColorStop(1, '#2a1f22');
      c.fillStyle = gr; c.fillRect(archX, floorY, archW, Hh - floorY);
      S.arch = { archX, archW, springY, apexY, floorY };
    }

    function drawClap(g, ctx, S) {
      const W = g.W, Hh = g.H;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      const G = S.G, u = G.u;
      // stars come out as rounds progress (inside the arch only: drawn before the bg's wall? the bg covers the sky -> draw stars after with clip)
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const A = S.arch;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(A.archX, Hh); ctx.lineTo(A.archX, A.springY); ctx.quadraticCurveTo(A.archX, A.apexY + (A.springY - A.apexY) * 0.25, W / 2, A.apexY); ctx.quadraticCurveTo(A.archX + A.archW, A.apexY + (A.springY - A.apexY) * 0.25, A.archX + A.archW, A.springY); ctx.lineTo(A.archX + A.archW, Hh); ctx.closePath(); ctx.clip();
      const starA = 0.25 + 0.75 * (S.lit || 0);
      ctx.fillStyle = '#fff8e0';
      for (const s of S.stars) {
        const y = g.area.y + s.y * (G.sumY - g.area.y) * 1.6;
        if (y > G.sumY + u * 2) continue;
        ctx.globalAlpha = starA * (0.5 + 0.5 * Math.sin(S.clock * 2 + s.ph));
        ctx.fillRect(s.x * W, y, s.r, s.r);
      }
      ctx.globalAlpha = 1;
      // lamps along the path: lit up to S.lit
      const nl = 10;
      for (let i = 0; i < nl; i++) {
        const f = (i + 0.5) / nl, p = pathPoint(G.pts, f), on = f <= (S.lit || 0) + 0.001;
        ctx.fillStyle = '#3a2a24'; ctx.fillRect(p[0] - 1, p[1] - u * 2.2, 2, u * 2.2);
        if (on) {
          const gr = ctx.createRadialGradient(p[0], p[1] - u * 2.4, 0, p[0], p[1] - u * 2.4, u * 3.2);
          gr.addColorStop(0, 'rgba(255,220,140,0.95)'); gr.addColorStop(0.3, 'rgba(255,170,64,0.45)'); gr.addColorStop(1, 'rgba(255,170,64,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1] - u * 2.4, u * 3.2, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = on ? '#ffe7a8' : '#5a4a44'; ctx.beginPath(); ctx.arc(p[0], p[1] - u * 2.4, u * 0.55, 0, TAU); ctx.fill();
      }
      // Bala Hissar glow when all done + the friend waving at the top
      if (S.lit > 0.99) {
        const gr = ctx.createRadialGradient(G.sumX, G.sumY - u * 4, 0, G.sumX, G.sumY - u * 4, u * 16);
        gr.addColorStop(0, 'rgba(255,230,160,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(G.sumX, G.sumY - u * 4, u * 16, 0, TAU); ctx.fill();
      }
      const fx = G.sumX + u * 9, fy = G.sumY;
      const wave = S.wave > 0 || S.orbs.some((o) => o.t > 0.9);
      ctx.fillStyle = '#1e1622';
      ctx.fillRect(fx - u * 0.5, fy - u * 2.4, u, u * 2.4);
      ctx.beginPath(); ctx.arc(fx, fy - u * 2.9, u * 0.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1e1622'; ctx.lineWidth = Math.max(1, u * 0.35);
      const wa = wave ? Math.sin(S.clock * 16) * 0.6 : 0;
      ctx.beginPath(); ctx.moveTo(fx, fy - u * 2); ctx.lineTo(fx + Math.cos(-1.2 + wa) * u * 1.8, fy - u * 2 + Math.sin(-1.2 + wa) * u * 1.8); ctx.stroke();
      // echo orbs climbing the path
      for (const o of S.orbs) {
        const f = Math.min(1, o.t / 0.95), p = pathPoint(G.pts, f);
        const a = o.t > 0.95 ? Math.max(0, 1 - (o.t - 0.95) / 0.35) : 1;
        for (let k = 0; k < 5; k++) {
          const q = pathPoint(G.pts, Math.max(0, f - k * 0.03));
          ctx.globalAlpha = a * (0.5 - k * 0.09); ctx.fillStyle = '#ffe9a8';
          ctx.beginPath(); ctx.arc(q[0], q[1] - u, u * (0.9 - k * 0.12), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = a; ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(p[0], p[1] - u, u * 0.8, 0, TAU); ctx.fill();
        if (o.t > 0.95) { ctx.strokeStyle = 'rgba(255,240,190,' + a + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(G.sumX, G.sumY - u * 4, u * (2 + (o.t - 0.95) * 30), 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      // bats leave the fort on the final echo
      for (const b of S.bats) {
        if (b.t < 0) continue;
        const x = G.sumX + Math.sin(b.ph) * u * 4 + b.t * u * 18 * b.vx, y = G.sumY - u * 6 - b.t * u * 14 + Math.sin(b.t * 9 + b.ph) * u;
        const f = Math.sin(b.t * 30 + b.ph) * u * 0.8;
        ctx.strokeStyle = '#1a1214'; ctx.lineWidth = Math.max(1, u * 0.3);
        ctx.beginPath(); ctx.moveTo(x - u * 1.2, y - f); ctx.lineTo(x, y); ctx.lineTo(x + u * 1.2, y - f); ctx.stroke();
      }
      ctx.restore();
      // sound rings under the dome
      for (const r of S.rings) {
        const k = r.t / 1.2, cx = r.who === 'guide' ? S.guideX || W / 2 : W / 2, cy = G.gateY - G.charS * 70;
        ctx.strokeStyle = r.who === 'guide' ? 'rgba(234,242,255,' + (1 - k) * 0.6 + ')' : 'rgba(255,216,74,' + (1 - k) * 0.75 + ')';
        ctx.lineWidth = Math.max(1.5, u * 0.5 * (1 - k));
        ctx.beginPath(); ctx.ellipse(cx, cy, u * (3 + k * 40), u * (1.5 + k * 22), 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      }
      // the guide (left) and the kid (centre), under the arch
      const s = G.charS;
      const floorY = G.gateY;
      S.guideX = W / 2 - u * (g.portrait ? 24 : 20);
      drawGuide(ctx, S.guideX, floorY, s * 0.95, S.guideClap > 0, S.R && (S.R.stage === 'listen'), S.clock);
      drawKidClap(ctx, W / 2 + u * 2, floorY, s, S.kidClap > 0);
      // the beat lane
      drawLane(g, ctx, S);
      drawMsg(g, ctx, S);
    }

    function drawMsg(g, ctx, S) {
      const W = g.W, u = S.G ? S.G.u : Math.min(W, g.area.h * 1.2) / 100;
      if (S.msg && S.msg.t < 1.6) {
        const m = S.msg, k = Math.min(1, m.t / 0.18), a = m.t > 1.2 ? 1 - (m.t - 1.2) / 0.4 : 1;
        const L = S.lane;
        ctx.save(); ctx.translate(W / 2, S.msgY || L.y - (m.big ? u * 9 : u * 6)); ctx.scale(0.6 + 0.4 * H.ease.outBack(k), 0.6 + 0.4 * H.ease.outBack(k));
        H.text(ctx, m.text, 0, 0, { font: m.small ? 'body' : 'display', weight: m.small ? 700 : null, size: m.big ? Math.max(30, u * 5.5) : Math.max(22, u * 3.8), color: m.col, outline: 6, alpha: a });
        ctx.restore();
      }
    }

    function drawLane(g, ctx, S) {
      const L = S.lane, R = S.R;
      if (!R) return;
      const t = S.clock - R.t0;
      H.sign(ctx, L.x, L.y, L.w, L.h, { fill: '#1f1830', edge: '#0d0a14', inner: 'rgba(242,194,48,0.35)', shadow: 'rgba(0,0,0,0.45)' });
      const x0 = L.x + L.pad, iw = L.inner, cy = L.y + L.h / 2;
      const slots = R.L;
      // beat ticks
      for (let i = 0; i <= slots; i++) {
        const x = x0 + (i / slots) * iw, beat = i % 2 === 0, bar = i % 8 === 0;
        ctx.fillStyle = bar ? 'rgba(242,194,48,0.7)' : beat ? 'rgba(234,242,255,0.45)' : 'rgba(234,242,255,0.18)';
        ctx.fillRect(x - (bar ? 1.5 : 1), cy - (bar ? L.h * 0.34 : beat ? L.h * 0.22 : L.h * 0.12), bar ? 3 : 2, bar ? L.h * 0.68 : beat ? L.h * 0.44 : L.h * 0.24);
      }
      // stage label
      const lab = { pre: 'TAIYAAR', listen: S.K.recall ? 'YAAD KARO' : 'SUNO', ready: 'TAIYAAR...', you: S.K === SKINS.drums ? 'AB CHALO' : 'AB AAP', judge: 'AB AAP', answer: 'SUNO... ANDAR SE', next: '', done: '' }[R.stage] || '';
      H.text(ctx, lab, L.x + 10, L.y - 10, { font: 'osd', size: 20, align: 'left', color: R.stage === 'you' ? '#ffd84a' : '#eaf2ff', outline: 4, stroke: '#120d16' });
      // count-in dots
      const cin = R.stage === 'pre' || R.stage === 'listen' ? (t - (R.pA - 4 * S.beat)) / S.beat : R.stage === 'ready' ? (t - (R.pB - 4 * S.beat)) / S.beat : -1;
      if (cin >= 0 && cin < 4.2 && (R.stage === 'ready' || t < R.pA)) {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i < Math.floor(cin) + 1 ? '#ffd84a' : 'rgba(234,242,255,0.25)';
          ctx.beginPath(); ctx.arc(L.x + L.w - 16 - (3 - i) * 16, L.y - 10, 5, 0, TAU); ctx.fill();
        }
      }
      // notes: shown while the guide claps them; ghosts on your turn (unless hidden)
      const showGhost = !S.hide || R.stage === 'next';
      R.notes.forEach((n, i) => {
        const x = x0 + (n.s / slots) * iw;
        const demoShown = R.shown[i];
        if (R.stage === 'listen' || R.stage === 'ready' || R.stage === 'pre') {
          if (!demoShown) return;
          const age = t - (R.pA + n.s * S.slot);
          drawPalm(ctx, x, cy, L.h * 0.28 * (age >= 0 && age < 0.15 ? 1 + (0.15 - age) * 3 : 1), '#eaf2ff', 1);
        } else if (showGhost || n.res) {
          const col = n.res === 'perfect' ? '#ffd84a' : n.res === 'good' ? '#b9ffb0' : n.res === 'miss' ? '#ff6a5a' : 'rgba(234,242,255,0.35)';
          drawPalm(ctx, x, cy, L.h * 0.26, col, n.res ? 1 : 0.6);
        }
      });
      // your claps
      for (const m of S.marks) {
        if (m.res === 'miss') continue;
        const x = x0 + U.clamp(m.slot / slots, -0.02, 1.02) * iw;
        ctx.fillStyle = m.res === 'extra' ? '#ffb04a' : '#fff';
        ctx.fillRect(x - 1.5, cy + L.h * 0.2, 3, L.h * 0.2);
      }
      // playhead
      let ph = null;
      if (R.stage === 'listen' && t >= R.pA) ph = (t - R.pA) / S.slot;
      if ((R.stage === 'you' || R.stage === 'judge') && t >= R.pB) ph = (t - R.pB) / S.slot;
      if (ph != null && ph <= slots + 0.5) {
        const x = x0 + (ph / slots) * iw;
        ctx.fillStyle = R.stage === 'listen' ? 'rgba(234,242,255,0.9)' : 'rgba(255,216,74,0.95)';
        ctx.fillRect(x - 1.5, L.y + 4, 3, L.h - 8);
        ctx.beginPath(); ctx.moveTo(x - 6, L.y + 2); ctx.lineTo(x + 6, L.y + 2); ctx.lineTo(x, L.y + 9); ctx.fill();
      }
      if (S.tickT > 0) { ctx.fillStyle = S.tickAcc ? 'rgba(242,194,48,' + S.tickT * 3 + ')' : 'rgba(234,242,255,' + S.tickT * 2 + ')'; ctx.fillRect(L.x + 4, L.y + L.h - 7, L.w - 8, 3); }
    }

    function drawPalm(ctx, x, y, r, col, a) {
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.save(); ctx.translate(x, y);
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.rotate(sgn * 0.42);
        ctx.beginPath(); ctx.ellipse(sgn * r * 0.3, r * 0.05, r * 0.3, r * 0.72, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(sgn * r * 0.62, r * 0.2, r * 0.12, r * 0.3, sgn * -0.6, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, r * 0.12); ctx.lineCap = 'round';
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * 0.95, -r * 0.55); ctx.lineTo(sgn * r * 1.25, -r * 0.8); ctx.moveTo(sgn * r * 1.05, -r * 0.1); ctx.lineTo(sgn * r * 1.4, -r * 0.15); ctx.stroke(); }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawGuide(ctx, x, y, s, clapping, talking, t) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8e2d2'; ctx.fillRect(-9, -30, 18, 30); // white pyjama
      ctx.fillStyle = '#5a6b8a'; H.rr(ctx, -12, -62, 24, 36, 6); ctx.fill(); // safari shirt
      ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(0, -70, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d8d0c4'; ctx.beginPath(); ctx.arc(0, -73, 9.3, Math.PI, TAU); ctx.fill(); // grey hair
      ctx.fillStyle = '#2a1d1a'; ctx.fillRect(-5, -66, 10, 2.2); // moustache
      ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      const k = clapping ? 0 : 6;
      ctx.beginPath(); ctx.moveTo(-10, -56); ctx.lineTo(-4 - k, -76 - (talking ? Math.sin(t * 8) * 2 : 0)); ctx.moveTo(10, -56); ctx.lineTo(4 + k, -76); ctx.stroke();
      if (clapping) { ctx.fillStyle = '#fff6c8'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.45; ctx.fillRect(Math.cos(a) * 14 - 1, -80 + Math.sin(a) * 14, 2.5, 5); } }
      ctx.restore();
    }
    function drawKidClap(ctx, x, y, s, clapping) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
      const k = clapping ? 0 : 7;
      ctx.beginPath(); ctx.moveTo(-8, -42); ctx.lineTo(-2 - k, -64); ctx.moveTo(8, -42); ctx.lineTo(2 + k, -64); ctx.stroke();
      ctx.restore();
      H.kidBack(ctx, x, y, s, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
      if (clapping) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#ffd84a'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.45; ctx.fillRect(Math.cos(a) * 15 - 1, -70 + Math.sin(a) * 15, 2.5, 6); } ctx.restore(); }
    }


    /* ------------------------------------------- skin: drums (Bonalu procession) */
    function laneFor(g) {
      const A = g.area, W = g.W, P = g.portrait, short = !P && A.h < 420;
      const lane = { w: Math.min(W - 40, 560), h: Math.max(46, Math.min(70, A.h * (short ? 0.17 : 0.1))) };
      lane.x = (W - lane.w) / 2; lane.y = P ? A.y + A.h * 0.56 : A.y + A.h * (short ? 0.4 : 0.5); lane.pad = 22; lane.inner = lane.w - lane.pad * 2;
      return lane;
    }
    function personFront(ctx, x, y, h, o) {
      const s = h / 64;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = o.lower || '#e8e2d2'; ctx.fillRect(-9, -28, 8, 28); ctx.fillRect(1, -28, 8, 28);
      ctx.fillStyle = o.shirt || '#f4efe2'; H.rr(ctx, -11, -54, 22, 28, 6); ctx.fill();
      if (o.scarf) { ctx.fillStyle = o.scarf; ctx.beginPath(); ctx.moveTo(-11, -52); ctx.lineTo(11, -40); ctx.lineTo(11, -34); ctx.lineTo(-11, -46); ctx.fill(); }
      ctx.fillStyle = o.skin || '#7a4a2a'; ctx.beginPath(); ctx.arc(0, -61, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -63, 8.3, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      if (o.band) { ctx.fillStyle = o.band; ctx.fillRect(-8, -66, 16, 3); }
      ctx.fillStyle = '#1a1412'; ctx.fillRect(-4, -62, 2, 2); ctx.fillRect(2, -62, 2, 2);
      if (o.moustache) ctx.fillRect(-4, -57.5, 8, 1.8);
      ctx.strokeStyle = o.skin || '#7a4a2a'; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
      if (o.drum) {
        // the dappu: a big round frame drum held on the left, a stick in the right hand
        const hit = o.hit || 0;
        ctx.beginPath(); ctx.moveTo(-10, -48); ctx.lineTo(-17, -36); ctx.stroke();
        ctx.fillStyle = '#e8d6a8'; ctx.beginPath(); ctx.ellipse(-16, -34, 14, 16, -0.2, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = 'rgba(178,43,43,0.6)'; ctx.beginPath(); ctx.arc(-16, -34, 5, 0, TAU); ctx.fill();
        ctx.strokeStyle = o.skin || '#7a4a2a'; ctx.lineWidth = 4.4;
        const ax = 10 + (1 - hit) * 6, ay = -58 + hit * 20;
        ctx.beginPath(); ctx.moveTo(10, -48); ctx.lineTo(ax, ay); ctx.stroke();
        ctx.strokeStyle = '#d9c08a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 16 + hit * 6, ay + 6 + hit * 6); ctx.stroke();
        if (hit > 0.5) { ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 1.5; for (let i = 0; i < 4; i++) { const a = -2.4 + i * 0.4; ctx.beginPath(); ctx.moveTo(-16 + Math.cos(a) * 18, -34 + Math.sin(a) * 20); ctx.lineTo(-16 + Math.cos(a) * 24, -34 + Math.sin(a) * 26); ctx.stroke(); } }
      } else { ctx.beginPath(); ctx.moveTo(-10, -48); ctx.lineTo(-13, -30); ctx.moveTo(10, -48); ctx.lineTo(13, -30); ctx.stroke(); }
      ctx.restore();
    }
    function ammaBonam(ctx, x, y, h, wob, t) {
      const s = h / 70;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2f8a3a'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-11, -46); ctx.lineTo(11, -46); ctx.lineTo(15, 0); ctx.closePath(); ctx.fill(); // green saree (back)
      ctx.fillStyle = '#f2c230'; ctx.fillRect(-14, -5, 29, 4);
      ctx.fillStyle = '#d8402a'; H.rr(ctx, -10, -60, 20, 16, 4); ctx.fill();
      ctx.fillStyle = '#2f8a3a'; ctx.beginPath(); ctx.moveTo(-10, -60); ctx.lineTo(10, -58); ctx.lineTo(12, -36); ctx.lineTo(-2, -40); ctx.fill(); // pallu
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -68, 8, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -61, 4.5, 0, TAU); ctx.fill(); // hair + bun
      ctx.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-4 + i * 2, -58 + (i % 2), 1.4, 0, TAU); ctx.fill(); } // jasmine
      // arms up, steadying the bonam
      ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, -56); ctx.lineTo(-11, -78); ctx.moveTo(9, -56); ctx.lineTo(10, -78); ctx.stroke();
      // the bonam: brass pot, turmeric + kumkum dots, neem leaves, a small lamp on top
      const w = Math.sin(t * 14) * wob * 0.25;
      ctx.save(); ctx.translate(0, -80); ctx.rotate(w);
      const gr = ctx.createRadialGradient(-4, -10, 1, 0, -8, 14);
      gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.6, '#d9a030'); gr.addColorStop(1, '#a8701a');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, -8, 12, 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c8901a'; ctx.fillRect(-6, -20, 12, 4);
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(-5, -8, 1.8, 0, TAU); ctx.arc(5, -8, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c8203a'; ctx.beginPath(); ctx.arc(0, -6, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3f7a2a'; for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(-5 + i * 2, -21); ctx.rotate(-0.8 + i * 0.32); ctx.beginPath(); ctx.ellipse(0, -5, 1.8, 5, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = '#e8c070'; ctx.beginPath(); ctx.ellipse(0, -26, 4, 1.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.moveTo(0, -34 - Math.sin(t * 11) * 1.2); ctx.quadraticCurveTo(2.5, -28, 0, -27); ctx.quadraticCurveTo(-2.5, -28, 0, -34 - Math.sin(t * 11) * 1.2); ctx.fill();
      ctx.restore();
      ctx.restore();
    }
    function paintDrums(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, A = g.area;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + A.h;
      const lane = (S.lane = laneFor(g));
      const u = Math.min(W, A.h * 1.2) / 100;
      const hor = A.y + A.h * (g.portrait ? 0.3 : 0.26), floorY = A.y + A.h;
      S.G = { u, hor, charS: (A.h * (g.portrait ? 0.15 : 0.26)) / 70 };
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      let gr = c.createLinearGradient(0, 0, 0, hor);
      gr.addColorStop(0, '#22285a'); gr.addColorStop(0.6, '#7a4a7a'); gr.addColorStop(1, '#e8905a');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      // the street in perspective
      const vx = W / 2;
      gr = c.createLinearGradient(0, hor, 0, floorY);
      gr.addColorStop(0, '#6a5a58'); gr.addColorStop(1, '#3a302e');
      c.fillStyle = gr; c.fillRect(0, hor, W, Hh - hor);
      // old-city facades on both sides, converging
      const rng = U.rng(4141);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const f0 = i / 6, f1 = (i + 1) / 6;
          const x0 = vx + side * lerp(W * 0.08, W * 0.62, f0 * f0), x1 = vx + side * lerp(W * 0.08, W * 0.62, f1 * f1);
          const top0 = hor - lerp(u * 6, u * 34, f0 * f0), top1 = hor - lerp(u * 6, u * 34, f1 * f1);
          const bot0 = hor + lerp(u * 1, u * 40, f0 * f0), bot1 = hor + lerp(u * 1, u * 40, f1 * f1);
          c.fillStyle = ['#d9c3a0', '#c7b9d6', '#e9c6b6', '#bcd3c4', '#e8d9b5', '#d0a888'][(rng.next() * 6) | 0];
          c.beginPath(); c.moveTo(x0, top0); c.lineTo(x1, top1); c.lineTo(x1, bot1); c.lineTo(x0, bot0); c.closePath(); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.12)'; c.fill();
          // arched doorway
          const ax = lerp(x0, x1, 0.5), ay = lerp(bot0, bot1, 0.5), ah = (lerp(bot0, bot1, 0.5) - lerp(top0, top1, 0.5)) * 0.45, aw = Math.abs(x1 - x0) * 0.32;
          c.fillStyle = '#3a2a24'; c.beginPath(); c.moveTo(ax - aw / 2, ay); c.lineTo(ax - aw / 2, ay - ah * 0.7); c.quadraticCurveTo(ax, ay - ah * 1.15, ax + aw / 2, ay - ah * 0.7); c.lineTo(ax + aw / 2, ay); c.fill();
          c.fillStyle = 'rgba(255,200,120,0.35)'; c.fillRect(ax - aw * 0.3, ay - ah * 0.6, aw * 0.6, ah * 0.6);
        }
      }
      // the temple gopuram at the end of the street (silhouette, respectfully distant)
      const gx = vx, gy = hor + u * 1, gw = u * 9;
      c.fillStyle = '#f0e2c8';
      for (let k = 0; k < 5; k++) { const w = gw * (1 - k * 0.17), h = u * 2.4; c.fillRect(gx - w / 2, gy - u * 4 - k * h, w, h + 1); }
      c.beginPath(); c.arc(gx, gy - u * 4 - 5 * u * 2.4, gw * 0.12, Math.PI, TAU); c.fill();
      c.strokeStyle = '#6a5a4a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx, gy - u * 4 - 5 * u * 2.4 - gw * 0.12); c.lineTo(gx, gy - u * 20); c.stroke();
      c.fillStyle = '#ef8a2a'; c.beginPath(); c.moveTo(gx, gy - u * 20); c.lineTo(gx + u * 2.4, gy - u * 19.2); c.lineTo(gx, gy - u * 18.4); c.fill();
      c.fillStyle = 'rgba(80,50,40,0.35)'; c.fillRect(gx - gw / 2, gy - u * 4, gw, u * 4);
      // neem-leaf torans strung across
      for (let k = 0; k < 3; k++) {
        const y = hor - u * (12 - k * 4) - k * u * 3, x0 = vx - W * (0.18 + k * 0.17), x1 = vx + W * (0.18 + k * 0.17), sag = u * (2 + k * 1.5);
        c.strokeStyle = 'rgba(60,40,30,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo(vx, y + sag * 2, x1, y); c.stroke();
        for (let i = 1; i < 14; i++) { const f = i / 14, x = lerp(x0, x1, f), yy = y + Math.sin(f * Math.PI) * sag; c.fillStyle = i % 3 ? '#3f7a2a' : '#5a9a3a'; c.beginPath(); c.ellipse(x, yy + u * (0.8 + k * 0.3), u * (0.35 + k * 0.12), u * (0.9 + k * 0.3), 0, 0, TAU); c.fill(); }
      }
      // marigold petals on the road
      for (let i = 0; i < 70; i++) { const y = hor + u * 3 + rng.next() * (Hh - hor), x = rng.next() * W, r = u * (0.2 + (y - hor) / (Hh - hor) * 0.4); c.fillStyle = rng.next() < 0.6 ? '#ef8a2a' : '#f2c230'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      S.festoon = [];
      for (let k = 0; k < 2; k++) S.festoon.push({ y: hor - u * (18 - k * 7), x0: vx - W * (0.3 + k * 0.25), x1: vx + W * (0.3 + k * 0.25), sag: u * (3 + k * 2) });
    }
    function drawDrums(g, ctx, S) {
      const W = g.W, Hh = g.H, A = g.area;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + A.h) paintDrums(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const G = S.G, u = G.u;
      // festoon bulbs twinkling
      const cols = ['#ff5a4a', '#ffd84a', '#6fdc5a', '#4ac8ff', '#ff7ae0'];
      for (const f of S.festoon) {
        ctx.strokeStyle = 'rgba(30,20,20,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x0, f.y); ctx.quadraticCurveTo(W / 2, f.y + f.sag * 2, f.x1, f.y); ctx.stroke();
        for (let i = 1; i < 22; i++) {
          const k = i / 22, x = lerp(f.x0, f.x1, k), y = f.y + Math.sin(k * Math.PI) * f.sag;
          const on = (i + Math.floor(S.clock * 4)) % 3 !== 0;
          ctx.fillStyle = on ? cols[i % cols.length] : 'rgba(80,60,60,0.8)';
          ctx.beginPath(); ctx.arc(x, y + 2, Math.max(1.5, u * 0.45), 0, TAU); ctx.fill();
        }
      }
      // drummers ahead, facing the procession
      const dy = G.hor + (S.lane.y - G.hor) * 0.92, dh = A.h * (g.portrait ? 0.13 : 0.22);
      const hit = Math.min(1, S.guideClap / 0.12);
      [[-0.22, '#d8402a', '#f2c230'], [0, '#ef8a2a', '#d8402a'], [0.22, '#2a8c82', '#f2c230']].forEach(([fx, sc, band], i) => {
        personFront(ctx, W / 2 + fx * Math.min(W, 700), dy + (i === 1 ? 4 : 0), dh, { shirt: '#f4efe2', lower: '#e8e2d2', scarf: sc, band, drum: true, hit: i === 1 ? hit : hit * 0.8, moustache: true });
      });
      // sound rings from the drums
      for (const r of S.rings) {
        const k = r.t / 1.2, cx = W / 2, cy = dy - dh * 0.5;
        ctx.strokeStyle = r.who === 'guide' ? 'rgba(255,220,160,' + (1 - k) * 0.5 + ')' : 'rgba(255,216,74,' + (1 - k) * 0.6 + ')';
        ctx.lineWidth = Math.max(1.5, u * 0.5 * (1 - k));
        ctx.beginPath(); ctx.ellipse(cx, r.who === 'guide' ? cy : Hh - dh * 0.6, u * (3 + k * 34), u * (1.5 + k * 14), 0, 0, TAU); ctx.stroke();
      }
      drawLane(g, ctx, S);
      // the family from behind: Amma with the bonam, Chinnu, Immu with neem branches
      const fy = A.y + A.h * (g.portrait ? 0.95 : 0.99), s = G.charS;
      ammaBonam(ctx, W / 2 - 8 * s * 4, fy, 70 * s * 1.15, S.wobble, S.clock);
      const step = S.kidClap > 0 ? -3 * s : 0;
      H.kidBack(ctx, W / 2 + 9 * s * 4, fy + step, s * 1.0, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
      H.kidBack(ctx, W / 2 + 26 * s * 4, fy, s * 1.02, { shirt: '#f4efe2', pants: '#2a8c82', skin: '#8a5a35' });
      ctx.save(); ctx.translate(W / 2 + 26 * s * 4 + 9 * s, fy - 60 * s); ctx.rotate(-0.3 + Math.sin(S.clock * 3) * 0.08);
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(0, 20 * s); ctx.lineTo(0, -16 * s); ctx.stroke();
      ctx.fillStyle = '#3f7a2a'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(Math.sin(i * 1.7) * 5 * s, -16 * s + i * 2.2 * s, 1.8 * s, 4.2 * s, Math.sin(i) * 0.9, 0, TAU); ctx.fill(); }
      ctx.restore();
      // diyas along the road: one more lit per clean round
      const n = Math.max(3, S.rounds * 2);
      for (let i = 0; i < n; i++) {
        const x = W * (0.08 + (i / (n - 1)) * 0.84), y = A.y + A.h * (g.portrait ? 0.72 : 0.7) + Math.abs(i - (n - 1) / 2) * u * 0.6, on = (i + 1) / n <= S.lit + 0.001;
        ctx.fillStyle = '#a8582a'; ctx.beginPath(); ctx.ellipse(x, y, u * 1.2, u * 0.5, 0, 0, Math.PI); ctx.fill();
        if (on) {
          const gr = ctx.createRadialGradient(x, y - u, 0, x, y - u, u * 3);
          gr.addColorStop(0, 'rgba(255,220,140,0.9)'); gr.addColorStop(1, 'rgba(255,170,64,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y - u, u * 3, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(x, y - u * 1.6 - Math.sin(S.clock * 9 + i) * u * 0.2); ctx.quadraticCurveTo(x + u * 0.4, y - u * 0.6, x, y - u * 0.4); ctx.quadraticCurveTo(x - u * 0.4, y - u * 0.6, x, y - u * 1.6); ctx.fill();
        }
      }
      drawMsg(g, ctx, S);
    }

    /* ---------------------------------------------- skin: doorway (the storeroom) */
    function paintDoorway(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, A = g.area;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + A.h;
      const lane = (S.lane = laneFor(g));
      lane.y = A.y + Math.max(34, A.h * 0.08); // the strip sits above the door, never across it
      const u = Math.min(W, A.h * 1.2) / 100;
      S.msgY = lane.y + lane.h + u * 9;
      const floorY = A.y + A.h * (g.portrait ? 0.78 : 0.82);
      const dw = Math.min(W * 0.34, A.h * 0.42), dh = Math.min(floorY - (lane.y + lane.h + u * 16), dw * 2.1), dx = W / 2 - dw / 2, dTop = floorY - dh;
      S.G = { u, floorY, door: { x: dx, y: dTop, w: dw, h: dh }, charS: (A.h * (g.portrait ? 0.15 : 0.26)) / 70 };
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      // lime-washed wall with a darker dado, a tube light, red-oxide floor
      c.fillStyle = '#9cc7d4'; c.fillRect(0, 0, W, Hh);
      c.fillStyle = '#6a9aae'; c.fillRect(0, floorY - A.h * 0.12, W, A.h * 0.12);
      c.fillStyle = 'rgba(255,255,255,0.08)'; const rng = U.rng(9); for (let i = 0; i < 40; i++) c.fillRect(rng.next() * W, rng.next() * floorY, 20 + rng.next() * 50, 2);
      let gr = c.createLinearGradient(0, floorY, 0, Hh); gr.addColorStop(0, '#9a3f2c'); gr.addColorStop(1, '#6a2a1e');
      c.fillStyle = gr; c.fillRect(0, floorY, W, Hh - floorY);
      c.fillStyle = 'rgba(255,240,220,0.9)'; H.rr(c, W * 0.06, A.y + A.h * 0.3, 6, A.h * 0.18, 3); c.fill();
      gr = c.createRadialGradient(W * 0.06, A.y + A.h * 0.39, 0, W * 0.06, A.y + A.h * 0.39, W * 0.5); gr.addColorStop(0, 'rgba(255,250,230,0.3)'); gr.addColorStop(1, 'rgba(255,250,230,0)');
      c.fillStyle = gr; c.fillRect(0, 0, W, floorY);
      // the storeroom door frame
      const D = S.G.door;
      c.fillStyle = '#5a3a24'; c.fillRect(D.x - u * 1.4, D.y - u * 1.4, D.w + u * 2.8, D.h + u * 1.4);
      c.fillStyle = '#2a1a14'; c.fillRect(D.x, D.y, D.w, D.h);
      // flour sacks + a tin trunk beside it
      for (let i = 0; i < 3; i++) { const sx = D.x + D.w + u * 3 + i * u * 7, sw = u * 7, sh = u * 9; c.fillStyle = '#d9c8a0'; H.rr(c, sx, floorY - sh, sw, sh, u * 2); c.fill(); c.fillStyle = '#b22b2b'; H.text(c, 'ATTA', sx + sw / 2, floorY - sh * 0.5, { font: 'osd', size: u * 2.2, color: '#b22b2b' }); }
      c.fillStyle = '#7a8a9a'; c.fillRect(D.x - u * 16, floorY - u * 8, u * 13, u * 8); c.fillStyle = '#5a6a7a'; c.fillRect(D.x - u * 16, floorY - u * 8, u * 13, u * 1.4);
      c.fillStyle = '#c8b070'; c.fillRect(D.x - u * 10, floorY - u * 6.4, u * 1.4, u * 1.6);
      // a calendar
      { const cx = W * 0.8, cy = A.y + A.h * 0.32; c.fillStyle = '#f4efe2'; c.fillRect(cx, cy, u * 9, u * 12); c.fillStyle = '#2a8c82'; c.fillRect(cx, cy, u * 9, u * 5); c.fillStyle = '#f2c230'; c.beginPath(); c.arc(cx + u * 4.5, cy + u * 2.5, u * 1.4, 0, TAU); c.fill(); c.fillStyle = 'rgba(40,30,30,0.45)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) c.fillRect(cx + u * (1 + j * 2), cy + u * (6.2 + i * 1.4), u * 1.3, u * 0.4); }
    }
    function drawDoorway(g, ctx, S) {
      const W = g.W, Hh = g.H, A = g.area;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + A.h) paintDoorway(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const G = S.G, u = G.u, D = G.door;
      // warm light from inside when Immu answers / the door opens
      const glow = Math.max(S.guideClap * 4, S.door);
      // door leaves (they swing open as S.door rises)
      const open = H.ease.out(S.door), lw = D.w / 2;
      for (const side of [-1, 1]) {
        const w = lw * (1 - open * 0.75), x = side < 0 ? D.x : D.x + D.w - w;
        const gr = ctx.createLinearGradient(x, 0, x + w, 0);
        gr.addColorStop(0, '#8a5a34'); gr.addColorStop(1, '#6a4024');
        ctx.fillStyle = gr; ctx.fillRect(x, D.y, w, D.h);
        ctx.strokeStyle = 'rgba(40,20,10,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, D.y + 6, w - 8, D.h * 0.42); ctx.strokeRect(x + 4, D.y + D.h * 0.5, w - 8, D.h * 0.45);
      }
      // the gap of light (and Immu's shadow moving in it when he claps)
      const gapX = D.x + lw * (1 - open * 0.75), gapW = Math.max(3, D.w - 2 * lw * (1 - open * 0.75));
      const gr = ctx.createLinearGradient(gapX, 0, gapX + gapW, 0);
      gr.addColorStop(0, 'rgba(255,200,120,' + (0.35 + glow * 0.5) + ')'); gr.addColorStop(0.5, 'rgba(255,230,170,' + (0.55 + glow * 0.45) + ')'); gr.addColorStop(1, 'rgba(255,200,120,' + (0.35 + glow * 0.5) + ')');
      ctx.fillStyle = gr; ctx.fillRect(gapX, D.y, gapW, D.h);
      if (S.door > 0.2) personFront(ctx, D.x + D.w / 2, D.y + D.h, D.h * 0.6, { shirt: '#f4efe2', lower: '#2a8c82', skin: '#8a5a35' });
      else if (S.guideClap > 0) { ctx.fillStyle = 'rgba(40,20,10,0.5)'; ctx.fillRect(gapX + gapW * 0.2, D.y + D.h * 0.3, gapW * 0.6, D.h * 0.5); }
      // iron latch
      if (S.door < 0.05) { ctx.fillStyle = '#3a3a40'; ctx.fillRect(D.x + D.w / 2 - u * 2, D.y + D.h * 0.48, u * 4, u * 1.2); }
      // light spilling onto the floor
      ctx.fillStyle = 'rgba(255,220,150,' + (0.08 + glow * 0.18) + ')';
      ctx.beginPath(); ctx.moveTo(gapX, D.y + D.h); ctx.lineTo(gapX + gapW, D.y + D.h); ctx.lineTo(gapX + gapW + u * 10, Hh); ctx.lineTo(gapX - u * 10, Hh); ctx.fill();
      // rings: the answer comes from the door, your claps from the front
      for (const r of S.rings) {
        const k = r.t / 1.2, cy = r.who === 'guide' ? D.y + D.h * 0.45 : A.y + A.h * 0.9;
        ctx.strokeStyle = r.who === 'guide' ? 'rgba(255,230,170,' + (1 - k) * 0.6 + ')' : 'rgba(255,216,74,' + (1 - k) * 0.6 + ')';
        ctx.lineWidth = Math.max(1.5, u * 0.5 * (1 - k));
        ctx.beginPath(); ctx.ellipse(W / 2, cy, u * (3 + k * 30), u * (1.5 + k * 14), 0, 0, TAU); ctx.stroke();
      }
      drawLane(g, ctx, S);
      // Chinnu, from behind, clapping at the door
      const s = G.charS, fy = A.y + A.h * (g.portrait ? 0.97 : 1.0);
      ctx.save(); ctx.translate(W / 2 + u * 6, fy); ctx.scale(s, s);
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
      const k = S.kidClap > 0 ? 0 : 7;
      ctx.beginPath(); ctx.moveTo(-8, -42); ctx.lineTo(-2 - k, -64); ctx.moveTo(8, -42); ctx.lineTo(2 + k, -64); ctx.stroke();
      ctx.restore();
      H.kidBack(ctx, W / 2 + u * 6, fy, s, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
      drawMsg(g, ctx, S);
    }

    MG.register(def);
  }

  /* ============================================================= BRICKGAME */
  // The 90s "Brick Game 9999-in-1" handheld: grey-green LCD, black pixel bricks, piezo beeps.
  // Game A: falling blocks (clear N lines). Game B: car-dodge race (pass N cars). Buttons are on
  // the device itself (canvas hit-tested), so the same big buttons work for mouse and touch.
  {
    const COLS = 10, ROWS = 20;
    const T = (MG.TUNE.brickgame = Object.assign({ linesPerLevel: 5, lives: 3, lines0: 5, lines1: 7, cars0: 22, cars1: 25 }, MG.TUNE.brickgame || {}));
    const LCD_BG = '#9fae8c', LCD_OFF = 'rgba(40,52,30,0.11)', LCD_ON = '#141a10';
    // pieces as cells in a 4x4 (I) or 3x3 box
    const PIECES = {
      I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
      O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
      T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
      S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
      Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
      J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
      L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    };
    const KINDS = Object.keys(PIECES);
    function rotCells(kind, r) {
      const P = PIECES[kind];
      let c = P.c.map((p) => p.slice());
      if (kind === 'O') return c;
      for (let i = 0; i < (r & 3); i++) c = c.map(([x, y]) => [P.n - 1 - y, x]);
      return c;
    }
    const CAR = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [0, 3], [2, 3]];
    // 5x7 letters for the mode screen
    const GLYPH = {
      A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
      B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    };
    const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };

    const def = {
      id: 'brickgame',
      title: 'Brick Game',
      sub: '9999-in-1. Two pencil batteries. Hours of joy.',
      osd: 'HANDHELD · 9999 IN 1',
      place: 'video_parlour_', places: ['video_parlour_', 'stationery_', 'home'],
      secs: 80,
      noCountdown: true,
      duck: 0.12,
      keys: {
        ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down',
        ArrowUp: 'rotate', KeyW: 'rotate', Space: 'rotate', KeyZ: 'rotate', KeyK: 'rotate', KeyX: 'down', Enter: 'start', NumpadEnter: 'start', KeyM: 'sound',
      },
      buttons: () => [],
      keyHint: () => '<kbd>←</kbd><kbd>→</kbd> move &nbsp; <kbd>↓</kbd> drop &nbsp; <kbd>↑</kbd>/<kbd>Space</kbd> rotate · turbo &nbsp; <kbd>M</kbd> sound',
      howto(g) {
        const m = g.params.mode;
        return {
          lines: [
            '<b>Game A — Bricks:</b> rotate and drop the falling bricks; fill a whole row to clear it. Don\'t let them reach the top.',
            '<b>Game B — Race:</b> switch lanes to dodge the oncoming cars. Hold rotate for turbo.',
            m ? 'Today: <b>Game ' + (m === 'race' ? 'B' : 'A') + '</b>.' : 'Pick <b>A</b> or <b>B</b> on the screen with ◀ ▶, then press ROTATE.',
          ],
          goal: (m !== 'race' ? 'A: CLEAR ' + targetLines(g) + ' LINES' : '') + (m ? '' : ' &middot; ') + (m !== 'blocks' ? 'B: PASS ' + targetCars(g) + ' CARS' : ''),
          keys: '<kbd>←</kbd> <kbd>→</kbd> move · <kbd>↓</kbd> drop · <kbd>↑</kbd> or <kbd>Space</kbd> rotate',
          touch: 'Press the buttons on the handheld: <b>◀ ▶ ▼</b> and the big red <b>ROTATE</b>',
        };
      },
      setup(g) {
        const S = g.S;
        S.score = 0; S.sound = true;
        S.mode = g.params.mode === 'race' ? 'race' : g.params.mode === 'blocks' ? 'blocks' : null;
        S.sel = S.mode === 'race' ? 1 : 0;
        S.stage = 'boot'; S.st = 0;
        S.board = new Uint8Array(COLS * ROWS);
        S.fade = new Float32Array(COLS * ROWS);
        S.lit = new Uint8Array(COLS * ROWS);
        S.next = new Uint8Array(16);
        S.hi = Math.max(+(MG.stats.best.brickgame || 0), 0);
        S.held = {}; S.press = {};
        S.btnDown = {};
        S.ptrs = {};
        S.lives = 3;
      },
      layout(g) { layoutDevice(g, g.S); },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) for (let i = 0; i < S.fade.length; i++) S.fade[i] = Math.max(0, S.fade[i] - dt * 12); },
      pointer(g, type, x, y, id) {
        const S = g.S;
        if (type === 'down') {
          const b = hitBtn(S, x, y);
          if (!b) return;
          S.ptrs[id] = b.a;
          if (b.a === 'pause') { g.togglePause(); return; }
          if (b.a === 'sound') { S.sound = !S.sound; beep(g, S, 1800, 0.05); return; }
          g.press(b.a, 'p' + id);
        } else if (type === 'up') {
          const a = S.ptrs[id];
          if (a) { g.release(a, 'p' + id); delete S.ptrs[id]; }
        }
      },
      bot(g, dt, want) { botPlay(g, g.S, dt, want); },
      hud(g) {
        const S = g.S;
        if (S.mode === 'race') return [{ k: 'CARS', v: S.cars + '/' + S.target }, { k: 'LIVES', v: String(S.lives), warn: S.lives === 1 }, { k: 'SCORE', v: String(S.score) }];
        if (S.mode === 'blocks') return [{ k: 'LINES', v: S.lines + '/' + S.target }, { k: 'SPEED', v: String(S.speed) }, { k: 'SCORE', v: String(S.score) }];
        return [{ k: 'GAME', v: S.sel ? 'B' : 'A' }, { k: 'HI', v: String(S.hi) }];
      },
      draw(g, ctx) { drawDevice(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        const race = S.mode === 'race';
        return {
          title: r.win ? (race ? 'Finish line!' : 'Line clear!') : (race ? 'Dhadaam!' : 'Bricks to the top!'),
          line: r.win ? 'FREE GAME! Nobody touch it, the high score is still on the screen.' : 'Batteries still good. One more game?',
          rows: race ? [['Cars passed', S.cars + ' / ' + S.target], ['Score', r.score]] : [['Lines', S.lines + ' / ' + S.target], ['Speed', S.speed], ['Score', r.score]],
        };
      },
      stars(g, r) {
        const S = g.S;
        if (!r.win) return 0;
        if (S.mode === 'race') return 1 + (S.lives >= 3 ? 1 : 0) + (S.lives >= 2 ? 1 : 0);
        return 1 + (S.score >= S.target * 180 ? 1 : 0) + (S.maxHeight <= 12 ? 1 : 0);
      },
    };
    function targetLines(g) { return g.params.mode !== 'race' && g.params.target ? g.params.target : Math.round(T.lines0 + g.diff * T.lines1); }
    function targetCars(g) { return g.params.mode === 'race' && g.params.target ? g.params.target : Math.round(T.cars0 + g.diff * T.cars1); }

    function beep(g, S, f, d, o) { if (S.sound) g.tone(f, d, Object.assign({ type: 'square', vol: 0.045 }, o || {})); }
    function melody(g, S, notes, gap, o) { notes.forEach((f, i) => beep(g, S, f, gap * 0.9, Object.assign({ delay: i * gap }, o || {}))); }

    /* ------------------------------------------------------------- logic */
    function startMode(g, S, mode) {
      S.mode = mode; S.stage = 'curtain'; S.st = 0; S.curtainNext = 'play';
      S.board.fill(0);
      if (mode === 'blocks') {
        S.target = targetLines(g); S.lines = 0; S.speed = 1 + Math.round(g.diff * 3); S.level = S.speed; S.maxHeight = 0;
        S.bag = []; S.nextKind = drawPiece(g, S); S.piece = null; S.drop = 0; S.flash = null;
        const garbage = g.diff >= 0.6 ? Math.round((g.diff - 0.5) * 8) : 0;
        for (let r = ROWS - garbage; r < ROWS; r++) { const hole = (g.rng.next() * COLS) | 0; for (let c = 0; c < COLS; c++) if (c !== hole && g.rng.next() < 0.8) S.board[r * COLS + c] = 1; }
      } else {
        S.target = targetCars(g); S.cars = 0; S.lane = 0; S.enemies = []; S.scroll = 0; S.rowT = 0; S.spawnIn = 2; S.crash = null; S.speed = 1 + Math.round(g.diff * 2); S.lives = T.lives;
      }
      melody(g, S, [1568, 1976, 2349, 3136], 0.07);
    }
    function drawPiece(g, S) {
      if (!S.bag.length) { S.bag = KINDS.slice(); for (let i = S.bag.length - 1; i > 0; i--) { const j = (g.rng.next() * (i + 1)) | 0; [S.bag[i], S.bag[j]] = [S.bag[j], S.bag[i]]; } }
      return S.bag.pop();
    }
    function fits(S, kind, r, px, py) {
      for (const [x, y] of rotCells(kind, r)) {
        const cx = px + x, cy = py + y;
        if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
        if (cy >= 0 && S.board[cy * COLS + cx]) return false;
      }
      return true;
    }
    function spawn(g, S) {
      const kind = S.nextKind; S.nextKind = drawPiece(g, S);
      const n = PIECES[kind].n;
      S.piece = { kind, r: 0, x: Math.floor((COLS - n) / 2), y: kind === 'I' ? -1 : 0 };
      S.drop = 0; S.lockT = 0;
      if (!fits(S, kind, 0, S.piece.x, S.piece.y)) gameOver(g, S);
    }
    function gravity(S) { return Math.max(0.07, 0.72 - (S.speed - 1) * 0.075); }
    function lockPiece(g, S) {
      const P = S.piece;
      for (const [x, y] of rotCells(P.kind, P.r)) { const cx = P.x + x, cy = P.y + y; if (cy >= 0) S.board[cy * COLS + cx] = 1; }
      S.piece = null;
      const full = [];
      for (let r = 0; r < ROWS; r++) { let f = true; for (let c = 0; c < COLS; c++) if (!S.board[r * COLS + c]) { f = false; break; } if (f) full.push(r); }
      let h = 0; for (let r = 0; r < ROWS; r++) { let any = false; for (let c = 0; c < COLS; c++) if (S.board[r * COLS + c]) any = true; if (any) { h = ROWS - r; break; } }
      S.maxHeight = Math.max(S.maxHeight, h);
      if (full.length) {
        S.flash = { rows: full, t: 0 };
        S.score += [0, 100, 300, 700, 1500][full.length] * (1 + (S.speed - 1) * 0.1) | 0;
        melody(g, S, full.length >= 4 ? [1568, 2093, 2637, 3136, 4186] : [1760, 2217, 2637], 0.05);
        if (full.length >= 2) g.pop(['', '', 'DOUBLE!', 'TRIPLE!', 'BRICK GAME!'][full.length], S.L.fx + S.L.fw / 2, S.L.fy + S.L.fh * 0.4, { size: 26, color: '#ffd84a' });
      } else beep(g, S, 880, 0.03);
    }
    function clearRows(g, S) {
      const rows = S.flash.rows;
      for (const r of rows) { S.board.copyWithin(COLS, 0, r * COLS); S.board.fill(0, 0, COLS); }
      S.lines += rows.length;
      S.flash = null;
      const lvl = 1 + Math.round(g.diff * 3) + Math.floor(S.lines / T.linesPerLevel);
      if (lvl > S.speed) { S.speed = Math.min(9, lvl); melody(g, S, [2093, 2637], 0.06); }
      if (S.lines >= S.target && !g.over) { S.score += 500; win(g, S); }
    }
    function gameOver(g, S) {
      if (g.over) return;
      S.stage = 'curtain'; S.st = 0; S.curtainNext = 'over';
      melody(g, S, [1568, 1319, 1047, 784, 523], 0.11, { vol: 0.05 });
      g.finish(false, { mode: S.mode, lines: S.lines, cars: S.cars, delay: 1.8 });
    }
    function win(g, S) {
      S.stage = 'won'; S.st = 0;
      melody(g, S, [2093, 2637, 3136, 4186, 3136, 4186], 0.09);
      if (S.score > S.hi) S.hi = S.score;
      g.finish(true, { mode: S.mode, lines: S.lines, cars: S.cars, delay: 1.6 });
    }

    function repeatKey(g, S, a, dt, first, rate) {
      S.rep = S.rep || {};
      if (g.pressed(a)) { S.held[a] = 0; S.rep[a] = 0; return true; }
      if (!g.down(a)) { S.held[a] = -1; return false; }
      if (!(S.held[a] >= 0)) { S.held[a] = 0; S.rep[a] = 0; return false; }
      S.held[a] += dt;
      if (S.held[a] < first) return false;
      S.rep[a] += dt;
      if (S.rep[a] >= rate) { S.rep[a] -= rate; return true; }
      return false;
    }

    function step(g, S, dt) {
      S.st += dt;
      for (const k of ['left', 'right', 'down', 'rotate', 'start']) S.btnDown[k] = g.down(k);
      if (g.pressed('sound')) S.sound = !S.sound;
      if (S.stage === 'boot') {
        if (S.st > 0.05 && !S.bootBeep) { S.bootBeep = true; melody(g, S, [3136, 2637, 3136, 3951], 0.06); }
        if (S.st > 1.3) { if (S.mode) startMode(g, S, S.mode); else { S.stage = 'select'; S.st = 0; } }
      } else if (S.stage === 'select') {
        if (g.pressed('left') || g.pressed('right')) { S.sel ^= 1; beep(g, S, 2349, 0.04); }
        if (g.pressed('rotate') || g.pressed('start') || g.pressed('down')) startMode(g, S, S.sel ? 'race' : 'blocks');
      } else if (S.stage === 'curtain') {
        if (S.st > 1.25) { if (S.curtainNext === 'play') { S.stage = 'play'; S.st = 0; if (S.mode === 'blocks') spawn(g, S); } else { S.stage = 'dead'; } }
      } else if (S.stage === 'play') {
        if (S.mode === 'blocks') stepBlocks(g, S, dt); else stepRace(g, S, dt);
      }
      // LCD persistence
      renderLit(S);
      for (let i = 0; i < S.fade.length; i++) S.fade[i] = S.lit[i] ? 1 : Math.max(0, S.fade[i] - dt * 11);
    }

    function stepBlocks(g, S, dt) {
      if (S.flash) { S.flash.t += dt; if (S.flash.t > 0.42) clearRows(g, S); return; }
      if (!S.piece) { spawn(g, S); if (!S.piece) return; }
      const P = S.piece;
      if (g.over) return;
      if (repeatKey(g, S, 'left', dt, 0.17, 0.05) && fits(S, P.kind, P.r, P.x - 1, P.y)) { P.x--; beep(g, S, 2093, 0.012); }
      if (repeatKey(g, S, 'right', dt, 0.17, 0.05) && fits(S, P.kind, P.r, P.x + 1, P.y)) { P.x++; beep(g, S, 2093, 0.012); }
      if (g.pressed('rotate')) {
        const nr = (P.r + 1) & 3;
        for (const k of [0, -1, 1, -2, 2]) if (fits(S, P.kind, nr, P.x + k, P.y)) { P.r = nr; P.x += k; beep(g, S, 2637, 0.015); break; }
      }
      const soft = g.down('down');
      S.drop += dt;
      const iv = soft ? Math.min(0.035, gravity(S)) : gravity(S);
      while (S.drop >= iv && S.piece) {
        S.drop -= iv;
        if (fits(S, P.kind, P.r, P.x, P.y + 1)) { P.y++; if (soft) S.score += 1; }
        else { lockPiece(g, S); break; }
      }
    }

    function carCells(lane, top) { const x0 = lane ? 5 : 2; return CAR.map(([x, y]) => [x0 + x, top + y]); }
    function stepRace(g, S, dt) {
      if (S.crash) {
        S.crash.t += dt;
        if (S.crash.t > 1.4) {
          S.crash = null; S.enemies = [];
          if (S.lives <= 0) gameOver(g, S);
        }
        return;
      }
      if (g.over) return;
      if (g.pressed('left') && S.lane !== 0) { S.lane = 0; beep(g, S, 2093, 0.015); }
      if (g.pressed('right') && S.lane !== 1) { S.lane = 1; beep(g, S, 2093, 0.015); }
      const turbo = g.down('rotate') || g.down('down');
      const lvl = S.speed + Math.floor(S.cars / 8);
      const iv = Math.max(0.045, (0.16 - lvl * 0.012) * (turbo ? 0.55 : 1));
      S.rowT += dt;
      while (S.rowT >= iv) {
        S.rowT -= iv;
        S.scroll = (S.scroll + 1) % 4;
        for (const e of S.enemies) e.y++;
        // passed
        for (let i = S.enemies.length - 1; i >= 0; i--) {
          if (S.enemies[i].y >= ROWS) { S.enemies.splice(i, 1); S.cars++; S.score += turbo ? 150 : 100; beep(g, S, 1568, 0.02); if (S.cars >= S.target) { win(g, S); return; } }
        }
        S.spawnIn--;
        if (S.spawnIn <= 0) {
          const last = S.enemies[S.enemies.length - 1];
          let lane = (g.rng.next() * 2) | 0;
          // never two cars in a wall: keep a gap of at least 5 rows when switching lanes
          if (last && last.lane !== lane && last.y < 5) lane = last.lane;
          S.enemies.push({ lane, y: -4 });
          S.spawnIn = Math.max(5, Math.round(9 - g.diff * 2 - Math.min(2, S.cars / 12) + g.rng.next() * 4));
        }
        if (turbo) beep(g, S, 220 + S.scroll * 20, 0.02, { vol: 0.02 });
      }
      // collision
      const me = carCells(S.lane, ROWS - 4);
      for (const e of S.enemies) {
        if (e.lane !== S.lane) continue;
        const cells = carCells(e.lane, e.y);
        let hit = false;
        for (const [x, y] of cells) for (const [mx, my] of me) if (x === mx && y === my) hit = true;
        if (hit) {
          S.lives--; S.crash = { t: 0, x: S.lane ? 5 : 2 };
          melody(g, S, [523, 392, 262, 196], 0.08, { vol: 0.06 });
          g.noise(0.4, { f: 1200, vol: 0.06 });
          g.shake(5);
          break;
        }
      }
    }

    /* ---------------------------------------------------- the LCD image */
    function renderLit(S) {
      const L = S.lit;
      L.fill(0);
      const set = (x, y) => { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) L[y * COLS + x] = 1; };
      S.next.fill(0);
      if (S.stage === 'boot' || S.stage === 'select') {
        const letter = S.stage === 'boot' ? null : S.sel ? 'B' : 'A';
        if (S.stage === 'boot') { // spiral-ish boot pattern
          const k = Math.min(1, S.st / 1.1), n = Math.floor(k * ROWS);
          for (let y = ROWS - n; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((x + y) % 2 === 0 || k > 0.8) set(x, y);
          return;
        }
        const gl = GLYPH[letter];
        for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (gl[y][x] === '1') set(2 + x, 2 + y);
        if (Math.floor(S.st * 3) % 2 === 0) { set(0, 5); set(1, 4); set(1, 6); set(9, 5); set(8, 4); set(8, 6); }
        if (letter === 'A') { for (const [x, y] of rotCells('T', 0)) set(3 + x, 13 + y); for (const [x, y] of rotCells('I', 0)) set(3 + x, 15 + y); for (let x = 0; x < COLS; x++) if (x !== 6) set(x, 18), set(x, 19); }
        else { for (const [x, y] of carCells(0, 11)) set(x, y); for (const [x, y] of carCells(1, 15)) set(x, y); for (let y = 10; y < ROWS; y++) if ((y + Math.floor(S.st * 8)) % 4 !== 3) { set(0, y); set(9, y); } }
        return;
      }
      if (S.stage === 'curtain') {
        const k = S.st / 1.25;
        const n = k < 0.5 ? Math.floor((k / 0.5) * ROWS) : Math.floor((1 - (k - 0.5) / 0.5) * ROWS);
        for (let y = ROWS - n; y < ROWS; y++) for (let x = 0; x < COLS; x++) set(x, y);
        return;
      }
      if (S.stage === 'dead') { for (let i = 0; i < L.length; i++) L[i] = 1; return; }
      if (S.mode === 'blocks') {
        for (let i = 0; i < L.length; i++) L[i] = S.board[i];
        if (S.flash && Math.floor(S.flash.t / 0.07) % 2 === 0) for (const r of S.flash.rows) for (let x = 0; x < COLS; x++) L[r * COLS + x] = 0;
        if (S.piece) for (const [x, y] of rotCells(S.piece.kind, S.piece.r)) set(S.piece.x + x, S.piece.y + y);
        if (S.nextKind) { const n = PIECES[S.nextKind].n; for (const [x, y] of rotCells(S.nextKind, 0)) S.next[(y + (n === 2 ? 1 : n === 4 ? 0 : 1)) * 4 + x + (n === 2 ? 1 : n === 3 ? 0 : 0)] = 1; }
      } else if (S.mode === 'race') {
        for (let y = 0; y < ROWS; y++) if ((y + S.scroll) % 4 !== 3) { set(0, y); set(9, y); }
        for (const e of S.enemies) for (const [x, y] of carCells(e.lane, e.y)) set(x, y);
        if (S.crash) {
          const t = S.crash.t, f = Math.floor(t / 0.12) % 2;
          for (let y = ROWS - 4; y < ROWS; y++) for (let x = S.crash.x - 1; x < S.crash.x + 4; x++) if (((x + y + f) % 2) === 0) set(x, y);
        } else for (const [x, y] of carCells(S.lane, ROWS - 4)) set(x, y);
        for (let i = 0; i < S.lives && i < 4; i++) S.next[12 + i] = 1;
      }
      if (S.stage === 'won' && Math.floor(S.st / 0.16) % 2) L.fill(0);
    }

    /* ----------------------------------------------------------- the bot */
    function botPlay(g, S, dt, want) {
      S.botT = (S.botT || 0) - dt;
      if (S.stage === 'select') { if (S.botT <= 0) { g.botPress('rotate'); S.botT = 0.3; } return; }
      if (S.stage !== 'play') { g.botHold('down', false); g.botHold('rotate', false); return; }
      if (want === 'lose') { g.botHold('down', S.mode === 'blocks'); return; }
      if (S.mode === 'race') {
        if (S.crash) return;
        const danger = (lane) => S.enemies.some((e) => e.lane === lane && e.y > ROWS - 13 && e.y < ROWS);
        if (danger(S.lane) && !S.enemies.some((e) => e.lane !== S.lane && e.y > ROWS - 9 && e.y < ROWS + 1)) { if (S.botT <= 0) { g.botPress(S.lane ? 'left' : 'right'); S.botT = 0.08; } }
        g.botHold('rotate', !danger(S.lane) && !danger(S.lane ^ 1));
        return;
      }
      const P = S.piece;
      if (!P || S.flash) { g.botHold('down', false); return; }
      if (!S.plan || S.plan.piece !== P) S.plan = { piece: P, ...bestMove(S, P.kind) };
      const pl = S.plan;
      if (S.botT > 0) return;
      if (P.r !== pl.r) { g.botPress('rotate'); S.botT = 0.07; return; }
      if (P.x < pl.x) { g.botPress('right'); S.botT = 0.06; return; }
      if (P.x > pl.x) { g.botPress('left'); S.botT = 0.06; return; }
      g.botHold('down', true);
    }
    function bestMove(S, kind) {
      let best = { r: 0, x: 3, s: -1e9 };
      const tmp = new Uint8Array(S.board.length);
      for (let r = 0; r < 4; r++) {
        for (let x = -2; x < COLS; x++) {
          if (!fits(S, kind, r, x, 0)) continue;
          let y = 0; while (fits(S, kind, r, x, y + 1)) y++;
          tmp.set(S.board);
          for (const [cx, cy] of rotCells(kind, r)) if (y + cy >= 0) tmp[(y + cy) * COLS + x + cx] = 1;
          let lines = 0, holes = 0, agg = 0, bump = 0, prevH = -1;
          for (let rr = 0; rr < ROWS; rr++) { let f = true; for (let c = 0; c < COLS; c++) if (!tmp[rr * COLS + c]) f = false; if (f) lines++; }
          for (let c = 0; c < COLS; c++) {
            let h = 0, seen = false;
            for (let rr = 0; rr < ROWS; rr++) { if (tmp[rr * COLS + c]) { if (!seen) { h = ROWS - rr; seen = true; } } else if (seen) holes++; }
            agg += h; if (prevH >= 0) bump += Math.abs(h - prevH); prevH = h;
          }
          const sc = lines * 0.76 - agg * 0.51 - holes * 0.36 - bump * 0.18;
          if (sc > best.s) best = { r, x, s: sc };
        }
      }
      return best;
    }

    /* ------------------------------------------------------------- drawing */
    function layoutDevice(g, S) {
      const A = g.area, W = g.W;
      const land = !g.portrait;
      const L = (S.L = { land });
      // body
      const bw = land ? Math.min(W - 16, A.h * 2.05) : Math.min(W - 16, A.h * 0.62);
      const bh = land ? Math.min(A.h - 12, bw * 0.5) : Math.min(A.h - 12, bw * 1.75);
      L.bx = (W - bw) / 2; L.by = A.y + (A.h - bh) / 2; L.bw = bw; L.bh = bh;
      // LCD (playfield 10x20 + 5-col side panel)
      const lcdH = land ? bh * 0.84 : bh * 0.52;
      const cell = Math.floor(Math.min((lcdH - 16) / ROWS, (land ? bw * 0.42 : bw * 0.8) / 15.6));
      L.cell = cell;
      L.lw = cell * 15.6 + 14; L.lh = cell * ROWS + 16;
      L.lx = L.bx + (bw - L.lw) / 2; L.ly = land ? L.by + (bh - L.lh) / 2 + bh * 0.02 : L.by + bh * 0.09;
      L.fx = L.lx + 8; L.fy = L.ly + 8; L.fw = cell * COLS; L.fh = cell * ROWS;
      L.px = L.fx + L.fw + cell * 0.6;
      // buttons
      const r = land ? Math.min(bh * 0.13, (L.lx - L.bx) * 0.16) : Math.min(bw * 0.085, (bh - (L.ly - L.by) - L.lh) * 0.14);
      const big = r * 1.55;
      let dcx, dcy, rcx, rcy, sy;
      if (land) {
        dcx = L.bx + (L.lx - L.bx) * 0.5; dcy = L.by + bh * 0.56;
        rcx = L.lx + L.lw + (L.bx + bw - L.lx - L.lw) * 0.5; rcy = L.by + bh * 0.56;
        sy = L.by + bh * 0.18;
      } else {
        const below = L.ly + L.lh, room = L.by + bh - below;
        dcx = L.bx + bw * 0.3; dcy = below + room * 0.6;
        rcx = L.bx + bw * 0.76; rcy = below + room * 0.62;
        sy = below + room * 0.17;
      }
      const gap = r * 1.35;
      S.btns = [
        { a: 'rotate', x: dcx, y: dcy - gap, r, icon: 'up', col: '#2b2b33' },
        { a: 'down', x: dcx, y: dcy + gap, r, icon: 'down', col: '#2b2b33' },
        { a: 'left', x: dcx - gap, y: dcy, r, icon: 'left', col: '#2b2b33' },
        { a: 'right', x: dcx + gap, y: dcy, r, icon: 'right', col: '#2b2b33' },
        { a: 'rotate', x: rcx, y: rcy, r: big, icon: 'rot', col: '#c8322a', label: 'ROTATE' },
      ];
      const sr = Math.max(8, r * 0.36);
      const small = [['pause', 'START'], ['sound', 'SOUND'], ['pause', 'ON/OFF'], ['pause', 'RESET']];
      if (land) small.forEach((s, i) => S.btns.push({ a: s[0], x: i < 2 ? L.bx + (L.lx - L.bx) * (0.3 + i * 0.4) : L.lx + L.lw + (L.bx + bw - L.lx - L.lw) * (0.3 + (i - 2) * 0.4), y: sy, r: sr, small: true, label: s[1], col: '#3a3a44' }));
      else small.forEach((s, i) => S.btns.push({ a: s[0], x: L.bx + bw * (0.2 + i * 0.2), y: sy, r: sr, small: true, label: s[1], col: '#3a3a44' }));
      S.offKey = null;
    }
    function hitBtn(S, x, y) {
      let best = null, bd = 1e9;
      for (const b of S.btns) { const d = Math.hypot(x - b.x, y - b.y); if (d < b.r * (b.small ? 1.6 : 1.3) && d < bd) { bd = d; best = b; } }
      return best;
    }

    function cellPath(ctx, x, y, c) {
      const m = Math.max(1, c * 0.1), w = c - m * 2, lw = Math.max(1, c * 0.12);
      ctx.rect(x + m, y + m, w, lw); ctx.rect(x + m, y + m + w - lw, w, lw); ctx.rect(x + m, y + m + lw, lw, w - lw * 2); ctx.rect(x + m + w - lw, y + m + lw, lw, w - lw * 2);
      const ii = c * 0.3; ctx.rect(x + ii, y + ii, c - ii * 2, c - ii * 2);
    }
    function paintOff(g, S) {
      const L = S.L, d = g.dpr;
      const c0 = (S.offC = S.offC || H.canvas(1, 1));
      c0.width = Math.ceil(L.fw * d); c0.height = Math.ceil(L.fh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = LCD_OFF; c.beginPath();
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) cellPath(c, x * L.cell, y * L.cell, L.cell);
      c.fill();
      S.offKey = L.cell + ':' + d;
    }
    function seg7(ctx, x, y, h, ch, on) {
      const w = h * 0.52, t = Math.max(1.2, h * 0.13), segs = SEG[ch] || '';
      const S_ = {
        a: [x + t * 0.6, y, w - t * 1.2, t], d: [x + t * 0.6, y + h - t, w - t * 1.2, t], g: [x + t * 0.6, y + h / 2 - t / 2, w - t * 1.2, t],
        f: [x, y + t * 0.6, t, h / 2 - t * 0.9], b: [x + w - t, y + t * 0.6, t, h / 2 - t * 0.9],
        e: [x, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9], c: [x + w - t, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9],
      };
      for (const k in S_) { ctx.fillStyle = segs.indexOf(k) >= 0 && on ? LCD_ON : LCD_OFF; const r = S_[k]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
      return w + h * 0.16;
    }
    function num(ctx, x, y, h, v, digits) {
      const s = String(Math.max(0, Math.floor(v))).padStart(digits, ' ').slice(-digits);
      for (const ch of s) x += seg7(ctx, x, y, h, ch === ' ' ? '8' : ch, ch !== ' ');
    }

    function drawDevice(g, ctx, S) {
      const L = S.L, W = g.W, Hh = g.H;
      if (S.offKey !== L.cell + ':' + g.dpr) paintOff(g, S);
      // table top behind the handheld (a school desk with doodles)
      let gr = ctx.createLinearGradient(0, 0, 0, Hh);
      gr.addColorStop(0, '#5a3a2a'); gr.addColorStop(1, '#3a241a');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, Hh);
      ctx.strokeStyle = 'rgba(255,220,180,0.06)'; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(0, (i / 14) * Hh + Math.sin(i) * 8); ctx.bezierCurveTo(W * 0.3, (i / 14) * Hh + 12, W * 0.6, (i / 14) * Hh - 10, W, (i / 14) * Hh + 6); ctx.stroke(); }
      // body
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; H.rr(ctx, L.bx + 6, L.by + 10, L.bw, L.bh, L.bw * 0.08); ctx.fill();
      gr = ctx.createLinearGradient(L.bx, L.by, L.bx + L.bw, L.by + L.bh);
      gr.addColorStop(0, '#ffd84a'); gr.addColorStop(0.5, '#f2c230'); gr.addColorStop(1, '#d9a51a');
      ctx.fillStyle = gr; H.rr(ctx, L.bx, L.by, L.bw, L.bh, Math.min(L.bw, L.bh) * 0.1); ctx.fill();
      ctx.strokeStyle = '#a87a10'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; H.rr(ctx, L.bx + 5, L.by + 5, L.bw - 10, L.bh - 10, Math.min(L.bw, L.bh) * 0.08); ctx.stroke();
      // bezel
      const bz = 10, tz = L.land ? 0 : L.cell * 1.4;
      ctx.fillStyle = '#2a2a33'; H.rr(ctx, L.lx - bz, L.ly - bz - tz, L.lw + bz * 2, L.lh + bz * 2 + tz, 10); ctx.fill();
      // rainbow title on the bezel (generic, no brand)
      const title = L.land ? 'BRICK GAME · 9999 IN 1' : 'BRICK GAME', cols = ['#ff5a4a', '#ffb43a', '#ffe14a', '#6fdc5a', '#4ac8ff', '#b07aff'];
      const ty = L.land ? L.ly - bz - L.cell * 0.9 : L.ly - bz - tz * 0.45, tsz = Math.max(11, L.cell * (L.land ? 0.85 : 0.95));
      ctx.font = H.font('display', tsz); ctx.textBaseline = 'middle';
      let tw = 0; for (const ch of title) tw += ctx.measureText(ch).width;
      let tx = L.lx + L.lw / 2 - tw / 2;
      const tcol = L.land ? '#1a1214' : null;
      [...title].forEach((ch, i) => { ctx.fillStyle = tcol || cols[i % cols.length]; ctx.textAlign = 'left'; ctx.fillText(ch, tx, ty); tx += ctx.measureText(ch).width; });
      // the LCD glass
      gr = ctx.createLinearGradient(L.lx, L.ly, L.lx, L.ly + L.lh);
      gr.addColorStop(0, '#a9b896'); gr.addColorStop(1, '#93a382');
      ctx.fillStyle = gr; ctx.fillRect(L.lx, L.ly, L.lw, L.lh);
      ctx.strokeStyle = 'rgba(20,26,16,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(L.fx - 2.5, L.fy - 2.5, L.fw + 5, L.fh + 5);
      ctx.drawImage(S.offC, L.fx, L.fy, L.fw, L.fh);
      // lit cells (with a little LCD persistence)
      const c = L.cell;
      ctx.fillStyle = LCD_ON;
      ctx.beginPath();
      for (let i = 0; i < S.fade.length; i++) if (S.fade[i] >= 0.99) cellPath(ctx, L.fx + (i % COLS) * c, L.fy + Math.floor(i / COLS) * c, c);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      for (let i = 0; i < S.fade.length; i++) if (S.fade[i] > 0.05 && S.fade[i] < 0.99) cellPath(ctx, L.fx + (i % COLS) * c, L.fy + Math.floor(i / COLS) * c, c);
      ctx.fill();
      ctx.globalAlpha = 1;
      // side panel
      const px = L.px, lab = (t, y) => H.text(ctx, t, px, y, { font: 'osd', size: Math.max(10, c * 0.72), color: '#28331f', align: 'left' });
      const dh = c * 1.05;
      lab('SCORE', L.fy + c * 0.45);
      num(ctx, px, L.fy + c * 1.0, dh, S.score, 5);
      lab('HI-SCORE', L.fy + c * 2.75);
      num(ctx, px, L.fy + c * 3.3, dh, Math.max(S.hi, S.score), 5);
      lab(S.mode === 'race' ? 'LIVES' : 'NEXT', L.fy + c * 5.2);
      const nc = c * 0.92;
      ctx.fillStyle = LCD_OFF; ctx.beginPath(); for (let i = 0; i < 16; i++) cellPath(ctx, px + (i % 4) * nc, L.fy + c * 5.8 + Math.floor(i / 4) * nc, nc); ctx.fill();
      ctx.fillStyle = LCD_ON; ctx.beginPath(); for (let i = 0; i < 16; i++) if (S.next[i]) cellPath(ctx, px + (i % 4) * nc, L.fy + c * 5.8 + Math.floor(i / 4) * nc, nc); ctx.fill();
      lab(S.mode === 'race' ? 'CARS' : 'LINES', L.fy + c * 10.3);
      num(ctx, px, L.fy + c * 10.85, dh, S.mode === 'race' ? S.cars || 0 : S.lines || 0, 2);
      num(ctx, px + c * 2.15, L.fy + c * 10.85, dh, S.target || 0, 2);
      ctx.fillStyle = LCD_ON; ctx.fillRect(px + c * 1.6, L.fy + c * 11.3, c * 0.4, c * 0.12);
      lab('SPEED', L.fy + c * 13.1);
      num(ctx, px, L.fy + c * 13.65, dh, S.speed || 1, 1);
      lab('LEVEL', L.fy + c * 15.4);
      num(ctx, px, L.fy + c * 15.95, dh, S.mode === 'race' ? 2 : 1, 1);
      // little icons: pause cup + sound note
      H.text(ctx, g.phase === 'paused' ? 'PAUSE' : '', px, L.fy + c * 18.1, { font: 'osd', size: Math.max(10, c * 0.72), color: '#28331f', align: 'left' });
      H.text(ctx, S.sound ? '♪' : '', px + c * 3.2, L.fy + c * 19.2, { font: 'body', size: c * 1.2, color: '#28331f', align: 'left' });
      // glass glare
      ctx.save(); ctx.beginPath(); ctx.rect(L.lx, L.ly, L.lw, L.lh); ctx.clip();
      gr = ctx.createLinearGradient(L.lx, L.ly, L.lx + L.lw, L.ly + L.lh);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.04)'); gr.addColorStop(0.36, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = gr; ctx.fillRect(L.lx, L.ly, L.lw, L.lh);
      ctx.restore();
      // "9999 IN 1" under the screen
      if (!L.land) H.text(ctx, '9999 IN 1', L.lx + L.lw / 2, L.ly + L.lh + bz + Math.max(10, c * 0.8), { font: 'display', size: Math.max(11, c * 0.85), color: '#7a5408' });
      // buttons
      for (const b of S.btns) {
        const down = b.small ? false : S.btnDown[b.a];
        const off = down ? 2 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(b.x + 2, b.y + 4, b.r, 0, TAU); ctx.fill();
        gr = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35 + off, b.r * 0.1, b.x, b.y + off, b.r);
        gr.addColorStop(0, H.shade(b.col, 1.35)); gr.addColorStop(1, b.col);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y + off, b.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const ir = b.r * 0.38, x = b.x, y = b.y + off;
        ctx.beginPath();
        if (b.icon === 'up') { ctx.moveTo(x, y - ir); ctx.lineTo(x + ir, y + ir * 0.6); ctx.lineTo(x - ir, y + ir * 0.6); }
        else if (b.icon === 'down') { ctx.moveTo(x, y + ir); ctx.lineTo(x + ir, y - ir * 0.6); ctx.lineTo(x - ir, y - ir * 0.6); }
        else if (b.icon === 'left') { ctx.moveTo(x - ir, y); ctx.lineTo(x + ir * 0.6, y - ir); ctx.lineTo(x + ir * 0.6, y + ir); }
        else if (b.icon === 'right') { ctx.moveTo(x + ir, y); ctx.lineTo(x - ir * 0.6, y - ir); ctx.lineTo(x - ir * 0.6, y + ir); }
        ctx.fill();
        if (b.icon === 'rot') { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(2, b.r * 0.12); ctx.beginPath(); ctx.arc(x, y, b.r * 0.42, -Math.PI * 0.2, Math.PI * 1.35); ctx.stroke(); ctx.beginPath(); const ex = x + Math.cos(-Math.PI * 0.2) * b.r * 0.42, ey = y + Math.sin(-Math.PI * 0.2) * b.r * 0.42; ctx.moveTo(ex + b.r * 0.15, ey - b.r * 0.2); ctx.lineTo(ex + b.r * 0.12, ey + b.r * 0.12); ctx.lineTo(ex - b.r * 0.2, ey + b.r * 0.02); ctx.fill(); }
        if (b.label) H.text(ctx, b.label, b.x, b.y + b.r + Math.max(9, b.r * (b.small ? 0.9 : 0.32)), { font: 'osd', size: Math.max(11, b.small ? b.r * 1.05 : b.r * 0.34), color: '#5a3a08' });
      }
      // speaker grille
      const gx = L.land ? L.lx + L.lw + (L.bx + L.bw - L.lx - L.lw) * 0.5 : L.bx + L.bw * 0.5, gy = L.land ? L.by + L.bh * 0.88 : L.by + L.bh - 20;
      ctx.fillStyle = 'rgba(90,60,8,0.55)';
      for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.arc(gx + i * 7, gy + j * 7, 2, 0, TAU); ctx.fill(); }
    }

    MG.register(def);
  }

  /* ================================================================ CRICKET */
  // Gully cricket in the colony lane, seen from behind the batter. Time your swing as the tennis ball
  // reaches you and pick a direction. House rules: one-tip-one-hand is out, and anything that lands
  // in Aunty's compound (left) is OUT. The low wall on the right is a six. Chase the target.
  {
    const G = 9.8;
    const LW = -4, RW = 4;           // compound walls (x, metres)
    const LWH = 1.9, RWH = 1.05;     // wall heights
    const FAR = 23;                  // the crossroads
    const HIT_Z = 0.25;
    const T = (MG.TUNE.cricket = Object.assign({ perfect: [0.045, 0.02], good: [0.095, 0.03], edge: [0.15, 0.03], overs: 2, target0: 13, target1: 14, catchFull: [0.62, 0.25], catchTip: [0.45, 0.3], maliPause: 3 }, MG.TUNE.cricket || {}));

    const def = {
      id: 'cricket',
      title: 'Gully Cricket',
      sub: 'Tennis ball, three bricks for stumps, and Aunty\'s window on the left.',
      osd: 'COLONY LANE · EVENING',
      place: 'playground_', places: ['playground_', 'playground_home', 'lb_stadium', 'victory_playground'],
      secs: 75,
      goLabel: 'PLAY!',
      keys: { ArrowLeft: 'pull', KeyA: 'pull', KeyZ: 'pull', ArrowUp: 'drive', KeyW: 'drive', Space: 'drive', ArrowRight: 'cut', KeyD: 'cut', KeyX: 'cut' },
      buttons: () => [
        { a: 'pull', label: '◀ PULL', sub: 'LEFT' },
        { a: 'drive', label: '▲ DRIVE', sub: 'STRAIGHT', cls: 'big' },
        { a: 'cut', label: 'CUT ▶', sub: 'RIGHT' },
      ],
      keyHint: () => 'swing as the ball reaches you: <kbd>←</kbd> pull · <kbd>↑</kbd>/<kbd>Space</kbd> drive · <kbd>→</kbd> cut',
      howto(g) {
        const S = g.S;
        return {
          lines: [
            'Swing when the ball reaches the <b>glowing ring</b> at your feet. Perfect timing goes up and over; good timing runs along the ground.',
            'Play the line: <b>◀ pull</b> balls on the left, <b>cut ▶</b> balls on the right, <b>▲ drive</b> straight ones. Hit a wall hard = <b>four</b>; over the low right wall = <b>six</b>.',
            'House rules: <b>one-tip-one-hand</b> is out, a catch is out, and anything into <b>Aunty\'s compound</b> (left wall) is OUT.',
          ],
          goal: S.target + ' RUNS IN ' + S.balls + ' BALLS &middot; ' + S.wkts + ' WICKET' + (S.wkts > 1 ? 'S' : '') + (S.bowlerName ? ' &middot; AYESHA BOWLS' : '') + (S.trial ? ' &middot; TRIAL BALL' : ''),
          keys: '<kbd>←</kbd> pull &nbsp;·&nbsp; <kbd>↑</kbd> / <kbd>Space</kbd> drive &nbsp;·&nbsp; <kbd>→</kbd> cut',
          touch: 'Tap <b>◀ PULL</b>, <b>▲ DRIVE</b> or <b>CUT ▶</b> as the ball arrives',
        };
      },
      setup(g) {
        const S = g.S, d = g.diff;
        S.score = 0; S.runs = 0;
        S.overs = g.params.overs || T.overs;
        S.balls = S.overs * 6; S.ballsLeft = S.balls; S.bowled = 0;
        S.wkts = g.params.wickets || (d > 0.75 ? 1 : 2); S.wktsLeft = S.wkts;
        S.target = g.params.target || Math.round(T.target0 + d * T.target1);
        S.winP = (T.perfect[0] + (1 - d) * T.perfect[1]) * g.winMul; S.winG = (T.good[0] + (1 - d) * T.good[1]) * g.winMul; S.winE = (T.edge[0] + (1 - d) * T.edge[1]) * g.winMul;
        S.bowlerName = g.params.bowler === 'ayesha' ? 'Ayesha' : null;
        S.trial = !!(g.params.trialBall != null ? g.params.trialBall : !g.params.story && MG.hasItem('cricket_ball'));
        S.mali = (g.params.mali || g.params.place === 'public_gardens') ? { at: 2 + ((g.rng.next() * Math.max(1, S.balls - 4)) | 0), t: -1 } : null;
        S.fours = 0; S.sixes = 0; S.log = [];
        S.stage = 'wait'; S.st = 0; S.clock = 0;
        S.ball = null; S.swing = null; S.msg = null; S.aunty = 0; S.bricks = null;
        S.fieldPos = [[-2.6, 8.5], [2.6, 7.5], [0.6, 16.5]].concat(d > 0.5 ? [[-1.8, 13]] : []);
        S.fielders = S.fieldPos.map((p, i) => ({ x: p[0], z: p[1], hx: p[0], hz: p[1], run: 0, ph: i, look: i }));
        S.bowler = { z: 21, x: 0.3, ph: 0, arm: 0 };
        S.trail = [];
      },
      layout(g) {
        const S = g.S, A = g.area, W = g.W, P = g.portrait;
        const camY = P ? 5.4 : 3.4, camZ = P ? -7.2 : -8.5;
        const hy = A.y + A.h * (P ? 0.17 : 0.25);
        const feet = A.y + A.h * (P ? 0.94 : 0.96);
        const f = ((feet - hy) * (-0.3 - camZ)) / camY;
        S.cam = { x: P ? -0.45 : 0, y: camY, z: camZ, f, cx: W / 2, hy };
        S.bgKey = null;
      },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (!S) return; S.clock += dt; if (S.msg) S.msg.t += dt; },
      bot(g, dt, want) {
        const S = g.S, b = S.ball;
        if (!b || b.hit || S.swing || S.stage !== 'flight') return;
        const lead = want === 'lose' ? 0.14 : 0;
        if (S.clock + dt >= b.tArrive + lead - 0.004) {
          if (b.wide && want === 'win') return;
          const dir = want === 'lose' ? 'pull' : (S.bowled % 2 ? 'cut' : 'drive');
          g.botPress(dir);
        }
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'RUNS', v: S.runs + '/' + S.target, good: S.runs >= S.target }, { k: 'BALLS', v: String(S.ballsLeft), warn: S.ballsLeft <= 3 }, { k: 'WKTS', v: String(S.wktsLeft), warn: S.wktsLeft === 1 }];
      },
      draw(g, ctx) { drawCricket(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? 'Match jeet liya!' : r.reason === 'allout' ? 'All out!' : 'Overs khatam!',
          line: r.win ? 'The colony will talk about that six for a week.' : 'Next time the bat-owner rule might save you.',
          rows: [['Runs', S.runs + ' / ' + S.target], ['Balls', (S.balls - S.ballsLeft) + ' / ' + S.balls], ['Fours · Sixes', S.fours + ' · ' + S.sixes], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.wktsLeft === S.wkts ? 1 : 0) + (S.ballsLeft >= 3 ? 1 : 0) : 0; },
    };

    /* ------------------------------------------------------------ physics */
    function newBall(g, S) {
      const d = g.diff, r = g.rng;
      const wide = d > 0.25 && r.next() < 0.07;
      const lines = [-0.32, -0.12, 0.05, 0.2, 0.38];
      const xc = wide ? (r.next() < 0.5 ? -1 : 1) * 1.35 : lines[(r.next() * lines.length) | 0] + (r.next() - 0.5) * 0.1;
      const slow = r.next() < 0.18;
      const T = (slow ? 1.18 : 0.98 - d * 0.22) + r.next() * 0.08;
      const zb = 2.4 + r.next() * 5.2;
      const xr = 0.35 + (r.next() - 0.5) * 0.3;
      return { x: xr, y: 2.05, z: 13.6, rel: { x: xr, z: 13.6 }, xc, zb, T, tRel: S.clock, tArrive: S.clock + T, wide, slow, hit: false, bounces: 0, vx: 0, vy: 0, vz: 0, done: false };
    }
    // the delivery path is scripted (release -> bounce -> crease) so its arrival time is exact
    function deliveryPos(b, t) {
      const k = U.clamp((t - b.tRel) / b.T, 0, 1.4);
      const zr = b.rel.z, zc = HIT_Z;
      const z = zr + (zc - zr) * k;
      const x = b.rel.x + (b.xc - b.rel.x) * k;
      const kb = (zr - b.zb) / (zr - zc); // fraction at the bounce
      let y;
      if (k <= kb) { const u = k / kb; y = lerp(2.05, 0, u) + 0.21 * Math.sin(u * Math.PI); }
      else { const u = (k - kb) / (1 - kb); y = Math.sin(Math.min(1.25, u) * Math.PI * 0.55) * (0.55 + (b.zb - 2.4) * 0.07); }
      return { x, y: Math.max(0.035, y), z, bounced: k > kb };
    }

    function swing(g, S, dir) {
      if (S.swing) return;
      S.swing = { t: 0, dir }; S.swings = (S.swings || 0) + 1;
      const b = S.ball;
      if (!b || b.hit || S.stage !== 'flight') return;
      const e = S.clock - b.tArrive;
      const ae = Math.abs(e);
      if (ae > S.winE) { b.missed = e < 0 ? 'early' : 'late'; return; }
      let q = ae <= S.winP ? 'perfect' : ae <= S.winG ? 'good' : 'edge';
      // play the line: a cut to a leg-side ball or a pull to an off-side ball is a cross-bat risk
      const mismatch = (dir === 'cut' && b.xc < -0.15) || (dir === 'pull' && b.xc > 0.22);
      if (mismatch) q = q === 'perfect' ? 'good' : 'edge';
      launch(g, S, b, dir, q, e);
    }

    function launch(g, S, b, dir, q, e) {
      const r = g.rng;
      const base = dir === 'pull' ? -0.85 : dir === 'cut' ? 0.8 : 0;
      let az = base - (e / S.winG) * 0.32 + (r.next() - 0.5) * 0.12;
      let el, v;
      if (q === 'perfect') { el = 0.48 + r.next() * 0.16; v = 18 + r.next() * 3; if (dir === 'pull') { el = 0.08; v = 19; az = -0.55 - r.next() * 0.2; } }
      else if (q === 'good') { el = 0.06 + r.next() * 0.12; v = 14 + r.next() * 3.5; }
      else { el = 0.75 + r.next() * 0.45; v = 7 + r.next() * 4; az = base * 0.5 + (r.next() - 0.5) * 1.6; if (dir === 'pull' && r.next() < 0.6) { az = -1.1; el = 0.6; v = 10; } }
      const p = deliveryPos(b, S.clock);
      b.hit = true; b.q = q; b.dir = dir;
      b.x = p.x; b.y = Math.max(0.4, p.y); b.z = p.z;
      b.vx = Math.sin(az) * Math.cos(el) * v; b.vz = Math.cos(az) * Math.cos(el) * v; b.vy = Math.sin(el) * v;
      b.bounces = 0; b.t = 0; b.firstBounceZ = null;
      S.stage = 'hit'; S.st = 0;
      g.sfx('bat_hit', { vol: q === 'edge' ? 0.6 : 1, pitch: q === 'perfect' ? 1.1 : q === 'edge' ? 0.8 : 1 });
      if (q === 'perfect') { g.shake(4); g.flash('#fff6c8', 0.18); }
      const pp = proj(S, b.x, b.y, b.z);
      g.burst(pp.x, pp.y, q === 'perfect' ? 16 : 8, { colors: ['#fff6c8', '#d8f05a'], kind: 'spark', speed: 220, grav: 0, life: 0.35, size: 2.4 });
      g.pop(q === 'perfect' ? 'PERFECT!' : q === 'good' ? 'Accha shot' : 'edge!', pp.x, pp.y - 30, { size: q === 'perfect' ? 26 : 19, color: q === 'perfect' ? '#ffd84a' : '#fff', font: q === 'perfect' ? 'display' : 'body', life: 0.8 });
    }

    function outcome(g, S, kind, runs, text, col) {
      if (S.stage === 'result') return;
      S.stage = 'result'; S.st = 0;
      const b = S.ball;
      if (b) b.done = true;
      let line = '';
      if (kind === 'out' && S.trial) { // the owner of the ball bats first: the first dismissal is a trial ball
        S.trial = false;
        g.sfx('whistle', { vol: 0.5 });
        S.msg = { text: text, col: '#ffb4a6', t: 0, sub: 'TRIAL BALL! Ball tumhari, toh out nahi.', big: true };
        S.log.push('T'); S.nextAt = 2.0;
        return;
      }
      if (kind === 'out') {
        S.wktsLeft--;
        g.sfx('howzat'); g.shake(5);
        line = S.wktsLeft > 0 ? (S.wktsLeft === 1 ? 'Last man batting!' : '') : '';
        if (S.bowlerName && text === 'BOWLED!') line = (line ? line + ' ' : '') + 'Ayesha ki yorker!';
      } else if (kind === 'wide') {
        S.runs += 1; S.ballsLeft++;
      } else {
        S.runs += runs;
        if (runs === 4) { S.fours++; g.sfx('kids'); }
        if (runs === 6) { S.sixes++; g.sfx('crowd_cheer', { vol: 0.7 }); g.burst(g.W / 2, g.area.y + g.area.h * 0.3, 36, { colors: ['#ffd84a', '#ff5a4a', '#4ac8ff', '#6fdc5a', '#fff'], kind: 'paper', speed: 300, grav: 200, life: 1.6, size: 4 }); }
        if (runs === 0) g.tone(300, 0.08, { type: 'triangle', vol: 0.04 });
      }
      S.score = S.runs * 10;
      S.msg = { text, col: col || (kind === 'out' ? '#ff6a5a' : runs >= 4 ? '#ffd84a' : '#fff'), t: 0, sub: line, big: kind === 'out' || runs >= 4 };
      S.log.push(kind === 'out' ? 'W' : kind === 'wide' ? 'wd' : String(runs));
      S.nextAt = kind === 'out' ? 2.0 : runs >= 4 ? 1.8 : 1.3;
    }

    function step(g, S, dt) {
      S.clock += dt; S.st += dt;
      if (S.msg) S.msg.t += dt;
      if (S.swing) { S.swing.t += dt; if (S.swing.t > 0.55 && S.stage !== 'flight') S.swing = null; }
      if (S.aunty > 0) S.aunty -= dt;
      if (S.bricks) S.bricks.t += dt;
      // input
      if (!g.over) for (const a of ['pull', 'drive', 'cut']) if (g.pressed(a) && (S.stage === 'flight' || S.stage === 'runup')) { swing(g, S, a); break; }
      const bw = S.bowler;
      if (S.mali && S.mali.t >= 0) {
        S.mali.t += dt;
        if (S.mali.t > T.maliPause) { S.mali.t = -2; S.mali.done = true; }
        return;
      }
      if (S.stage === 'wait' && S.mali && !S.mali.done && S.bowled === S.mali.at && S.mali.t === -1) { S.mali.t = 0; g.sfx('whistle', { vol: 0.6 }); return; }
      if (S.stage === 'wait') {
        if (S.st > (S.bowled === 0 ? 0.4 : 0.15)) { S.stage = 'runup'; S.st = 0; bw.z = 20.5; S.swing = null; S.bricks = null; resetFielders(S); }
      } else if (S.stage === 'runup') {
        const k = Math.min(1, S.st / 1.15);
        bw.z = lerp(20.5, 14.2, k); bw.ph += dt * 11; bw.arm = 0;
        if (k >= 1) { S.stage = 'flight'; S.st = 0; S.ball = newBall(g, S); bw.arm = 1; g.tone(520, 0.03, { type: 'triangle', vol: 0.03 }); }
      } else if (S.stage === 'flight') {
        bw.arm = Math.max(0, bw.arm - dt * 2);
        const b = S.ball;
        const p = deliveryPos(b, S.clock);
        if (p.bounced && !b.bounced) { b.bounced = true; g.tone(180, 0.04, { type: 'sine', vol: 0.05 }); }
        b.x = p.x; b.y = p.y; b.z = p.z;
        trail(S, b);
        if (S.clock > b.tArrive + S.winE + 0.02) {
          // the ball went past the bat
          if (b.wide) { if (!S.swing) { outcome(g, S, 'wide', 1, 'WIDE! +1'); return; } }
          if (Math.abs(b.xc) < 0.3) {
            S.bricks = { t: 0 };
            g.sfx('chop', { vol: 0.8 });
            outcome(g, S, 'out', 0, 'BOWLED!');
          } else outcome(g, S, 'dot', 0, S.swing ? (b.missed === 'early' ? 'Too early!' : 'Too late!') : 'Dot ball', '#eaf2ff');
          S.ballsLeft--; S.bowled++;
        }
      } else if (S.stage === 'hit') {
        bw.arm = 0;
        flyBall(g, S, dt);
        moveFielders(S, dt);
      } else if (S.stage === 'result') {
        if (S.ball && !S.ball.done) flyBall(g, S, dt);
        moveFielders(S, dt);
        if (S.st > S.nextAt) {
          S.ball = null; S.trail.length = 0;
          if (!g.over) {
            if (S.runs >= S.target) { S.score = S.runs * 10 + S.wktsLeft * 60 + S.ballsLeft * 25; g.finish(true, { runs: S.runs, balls: S.balls - S.ballsLeft, wickets: S.wkts - S.wktsLeft, delay: 0.3 }); return; }
            if (S.wktsLeft <= 0) { g.finish(false, { runs: S.runs, reason: 'allout', delay: 0.3 }); return; }
            if (S.ballsLeft <= 0) { g.finish(false, { runs: S.runs, reason: 'balls', delay: 0.3 }); return; }
          }
          S.stage = 'wait'; S.st = 0;
        }
      }
      if (S.stage === 'hit' && S.runs + 0 >= S.target) { /* resolved in result */ }
    }

    function trail(S, b) { S.trail.push({ x: b.x, y: b.y, z: b.z }); if (S.trail.length > 7) S.trail.shift(); }

    function flyBall(g, S, dt) {
      const b = S.ball;
      if (!b || b.done) return;
      const prev = { x: b.x, y: b.y, z: b.z };
      b.t += dt;
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      trail(S, b);
      // ground
      if (b.y <= 0.035) {
        b.y = 0.035;
        if (b.vy < -1.2) {
          b.bounces++;
          if (b.bounces === 1) b.firstBounceZ = b.z;
          b.vy = -b.vy * 0.48; b.vx *= 0.78; b.vz *= 0.78;
          g.tone(160, 0.035, { type: 'sine', vol: 0.04 });
        } else { b.vy = 0; const k = Math.exp(-1.6 * dt); b.vx *= k; b.vz *= k; }
      }
      if (S.stage !== 'hit') return;
      // walls
      if (b.x < LW && prev.x >= LW) {
        if (b.y > LWH && b.bounces === 0 || b.y > LWH + 0.3) { // into Aunty's compound
          S.aunty = 2.4; b.done = true;
          g.sfx('door_creak', { vol: 0.6 });
          outcome(g, S, 'out', 0, 'AUNTY KE GHAR!', '#ff6a5a');
          S.msg.sub = 'Ball gaya... aur aap bhi OUT!';
          S.ballsLeft--; S.bowled++;
          return;
        }
        if (Math.hypot(b.vx, b.vz) > 10.5 && b.bounces <= 1) { b.done = true; g.sfx('bump', { vol: 0.7 }); outcome(g, S, 'runs', 4, 'DEEWAR PE FOUR!'); S.ballsLeft--; S.bowled++; return; }
        b.x = LW; b.vx = -b.vx * 0.4; b.vz *= 0.6; g.tone(120, 0.05, { type: 'square', vol: 0.03 });
      }
      if (b.x > RW && prev.x <= RW) {
        if (b.y > RWH) {
          b.done = true;
          outcome(g, S, 'runs', b.bounces === 0 ? 6 : 4, b.bounces === 0 ? 'SIX! Plot mein!' : 'FOUR!');
          S.ballsLeft--; S.bowled++;
          return;
        }
        if (Math.hypot(b.vx, b.vz) > 10.5 && b.bounces <= 1) { b.done = true; g.sfx('bump', { vol: 0.7 }); outcome(g, S, 'runs', 4, 'DEEWAR PE FOUR!'); S.ballsLeft--; S.bowled++; return; }
        b.x = RW; b.vx = -b.vx * 0.4; b.vz *= 0.6; g.tone(120, 0.05, { type: 'square', vol: 0.03 });
      }
      if (b.z > FAR) {
        b.done = true;
        outcome(g, S, 'runs', b.bounces === 0 ? 6 : 4, b.bounces === 0 ? 'SIX! Main road tak!' : 'FOUR!');
        S.ballsLeft--; S.bowled++;
        return;
      }
      if (b.z < -1.5) { b.done = true; outcome(g, S, 'runs', 1, '1 run'); S.ballsLeft--; S.bowled++; return; }
      // fielders: catch (on the full / one tip one hand) or stop it
      for (const f of S.fielders) {
        const dxz = Math.hypot(b.x - f.x, b.z - f.z);
        if (dxz > 0.75 || b.y > 1.75) continue;
        const r = g.rng.next();
        if (b.bounces === 0 && b.t > 0.12) {
          if (r < T.catchFull[0] + g.diff * T.catchFull[1]) { catchBall(g, S, f, 'CAUGHT!'); return; }
          dropped(g, S, f); return;
        }
        if (b.bounces === 1 && b.y > 0.15) {
          if (r < T.catchTip[0] + g.diff * T.catchTip[1]) { catchBall(g, S, f, 'ONE TIP ONE HAND!'); return; }
          dropped(g, S, f); return;
        }
        if (b.bounces >= 1) { fielded(g, S, f); return; }
      }
      // ball stops rolling
      const sp = Math.hypot(b.vx, b.vz);
      if (b.bounces > 0 && b.y <= 0.04 && sp < 1.2) {
        const dist = Math.hypot(b.x, b.z);
        const runs = dist < 4 ? 0 : dist < 10 ? 1 : dist < 16 ? 2 : 3;
        outcome(g, S, 'runs', runs, runs ? runs + (runs === 1 ? ' run' : ' runs') : 'No run');
        S.ballsLeft--; S.bowled++;
      }
    }
    function catchBall(g, S, f, text) {
      const b = S.ball;
      b.done = true; b.x = f.x; b.z = f.z; b.y = 1.1; f.catch = 1;
      outcome(g, S, 'out', 0, text);
      S.ballsLeft--; S.bowled++;
    }
    function dropped(g, S, f) {
      const b = S.ball;
      b.vx *= -0.2; b.vz *= -0.15; b.vy = 1.5; f.drop = 1;
      const pp = proj(S, f.x, 1.2, f.z);
      g.pop('chhoot gaya!', pp.x, pp.y - 20, { size: 18, color: '#b9ffb0', font: 'body' });
      fielded(g, S, f, true);
    }
    function fielded(g, S, f, wasDrop) {
      const b = S.ball;
      const dist = Math.hypot(f.x, f.z);
      const runs = wasDrop ? (dist > 12 ? 2 : 1) : dist > 14 ? 2 : dist > 6 ? 1 : 0;
      b.done = true;
      outcome(g, S, 'runs', runs, runs ? runs + (runs === 1 ? ' run' : ' runs') : 'Fielded. No run');
      S.ballsLeft--; S.bowled++;
    }
    function resetFielders(S) { for (const f of S.fielders) { f.x = f.hx; f.z = f.hz; f.run = 0; f.catch = 0; f.drop = 0; } }
    function moveFielders(S, dt) {
      const b = S.ball;
      for (const f of S.fielders) {
        f.ph += dt * 10;
        if (!b || b.done || S.stage !== 'hit') { f.run = Math.max(0, f.run - dt * 3); continue; }
        // run towards where the ball will come down / is rolling
        let tx = b.x, tz = b.z;
        if (b.vy > 0 || b.y > 0.3) { const tt = (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * G * b.y))) / G; tx = b.x + b.vx * tt; tz = b.z + b.vz * tt; }
        const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
        if (d > 7) { f.run = Math.max(0, f.run - dt * 3); continue; }
        const sp = Math.min(d, 3.6 * dt);
        if (d > 0.05) { f.x += (dx / d) * sp; f.z += (dz / d) * sp; f.run = 1; }
      }
    }

    /* ------------------------------------------------------------- drawing */
    function proj(S, x, y, z) {
      const C = S.cam, d = Math.max(0.15, z - C.z);
      return { x: C.cx + ((x - C.x) * C.f) / d, y: C.hy + ((C.y - y) * C.f) / d, k: C.f / d };
    }
    function quad(ctx, S, pts) {
      ctx.beginPath();
      pts.forEach((p, i) => { const q = proj(S, p[0], p[1], p[2]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.closePath();
    }

    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + g.area.h;
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const C = S.cam, near = C.z + 0.5;
      // evening sky
      let gr = c.createLinearGradient(0, 0, 0, C.hy + 10);
      gr.addColorStop(0, '#3d6fa8'); gr.addColorStop(0.6, '#e9a46a'); gr.addColorStop(1, '#f6cf8a');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      // far crossroads: shops, a lamp post, a water tank
      const fz = FAR + 9;
      const shop = (x0, x1, h, col, sign, scol) => {
        quad(c, S, [[x0, 0, fz], [x1, 0, fz], [x1, h, fz], [x0, h, fz]]); c.fillStyle = col; c.fill();
        quad(c, S, [[x0 + 0.4, 0, fz - 0.01], [x1 - 0.4, 0, fz - 0.01], [x1 - 0.4, 2.2, fz - 0.01], [x0 + 0.4, 2.2, fz - 0.01]]); c.fillStyle = '#2a1d1a'; c.fill();
        if (sign) {
          quad(c, S, [[x0 + 0.2, 2.5, fz - 0.02], [x1 - 0.2, 2.5, fz - 0.02], [x1 - 0.2, 3.4, fz - 0.02], [x0 + 0.2, 3.4, fz - 0.02]]); c.fillStyle = scol; c.fill();
          const p = proj(S, (x0 + x1) / 2, 2.95, fz);
          H.text(c, sign, p.x, p.y, { font: 'display', size: Math.max(7, p.k * 0.55), color: '#1a1214', maxW: ((x1 - x0) - 0.6) * p.k });
        }
      };
      shop(-26, -15, 7, '#c7b9d6', null);
      shop(-15, -5, 5.2, '#d9b48a', 'KIRANA & GENERAL', '#f2c230');
      shop(5, 15, 6, '#c9a2b8', 'STATIONERY · XEROX', '#efe9dc');
      shop(15, 26, 8, '#bcd3c4', null);
      shop(-5, 5, 7.5, '#b8a48c', null);
      { const p = proj(S, 0, 4.6, fz); H.sign(c, p.x - p.k * 3.2, p.y - p.k * 0.6, p.k * 6.4, p.k * 1.2, { fill: '#2a8c82', text: 'IRANI CAFE', color: '#efe9dc', size: p.k * 0.7, bolts: false }); }
      // tanks + antennas on the far roofs, a lamp post
      for (const tx of [-20, 2.2, 19]) { const p = proj(S, tx, 0, fz + 0.5), q = proj(S, tx, tx === 2.2 ? 7.5 : tx < 0 ? 7 : 8, fz + 0.5); c.fillStyle = '#26222a'; H.rr(c, q.x - p.k * 0.9, q.y - p.k * 1.9, p.k * 1.8, p.k * 1.9, p.k * 0.3); c.fill(); }
      { const p = proj(S, -9, 5.2, fz), k = p.k; c.strokeStyle = '#4a4450'; c.lineWidth = Math.max(1, k * 0.08); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - k * 3); for (let i = 0; i < 4; i++) { c.moveTo(p.x - k * (1 - i * 0.15), p.y - k * 3 + i * k * 0.35); c.lineTo(p.x + k * (1 - i * 0.15), p.y - k * 3 + i * k * 0.35); } c.stroke(); }
      { const p = proj(S, 4.6, 0, FAR + 1), q = proj(S, 4.6, 5.5, FAR + 1); c.strokeStyle = '#3a3a40'; c.lineWidth = Math.max(1.5, p.k * 0.12); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineTo(q.x - p.k * 0.9, q.y); c.stroke(); c.fillStyle = '#ffe9b0'; c.fillRect(q.x - p.k * 1.1, q.y, p.k * 0.5, p.k * 0.15); }
      // far road across
      quad(c, S, [[-40, 0, FAR], [40, 0, FAR], [40, 0, fz], [-40, 0, fz]]); c.fillStyle = '#6a6460'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.setLineDash([10, 10]);
      { const a = proj(S, -40, 0, FAR + 4.5), b2 = proj(S, 40, 0, FAR + 4.5); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b2.x, b2.y); c.stroke(); }
      c.setLineDash([]);
      // the lane surface
      gr = c.createLinearGradient(0, C.hy, 0, Hh);
      gr.addColorStop(0, '#9a8a78'); gr.addColorStop(1, '#7e6e5e');
      quad(c, S, [[LW, 0, near], [RW, 0, near], [RW, 0, FAR], [LW, 0, FAR]]); c.fillStyle = gr; c.fill();
      // worn pitch strip + chalk creases + some patches
      quad(c, S, [[-0.9, 0, near], [0.9, 0, near], [0.9, 0, 14.6], [-0.9, 0, 14.6]]); c.fillStyle = 'rgba(214,190,150,0.45)'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2;
      for (const z of [0.9, 13.4]) { quad(c, S, [[-1.1, 0, z], [1.1, 0, z], [1.1, 0, z + 0.04], [-1.1, 0, z + 0.04]]); c.stroke(); }
      const rng = U.rng(4242);
      for (let i = 0; i < 40; i++) { const x = LW + rng.next() * 8, z = 1 + rng.next() * 20, p = proj(S, x, 0, z); c.fillStyle = 'rgba(60,45,35,0.18)'; c.beginPath(); c.ellipse(p.x, p.y, p.k * 0.35, p.k * 0.08, 0, 0, TAU); c.fill(); }
      // drain lines along the walls
      quad(c, S, [[LW, 0, near], [LW + 0.35, 0, near], [LW + 0.35, 0, FAR], [LW, 0, FAR]]); c.fillStyle = 'rgba(40,40,40,0.35)'; c.fill();
      quad(c, S, [[RW - 0.35, 0, near], [RW, 0, near], [RW, 0, FAR], [RW - 0.35, 0, FAR]]); c.fill();
      // RIGHT: open plot beyond a low wall, a neem tree, a parked cycle
      quad(c, S, [[RW, 0, near], [30, 0, near], [30, 0, FAR], [RW, 0, FAR]]); c.fillStyle = '#b5845a'; c.fill();
      quad(c, S, [[RW, 0, near], [RW, RWH, near], [RW, RWH, FAR], [RW, 0, FAR]]); c.fillStyle = '#d9cbb0'; c.fill();
      quad(c, S, [[RW, RWH, near], [RW + 0.25, RWH, near], [RW + 0.25, RWH, FAR], [RW, RWH, FAR]]); c.fillStyle = '#efe6d2'; c.fill();
      { const p = proj(S, RW + 0.02, 0.6, 11); H.text(c, 'NO PARKING', p.x, p.y, { font: 'osd', size: Math.max(6, p.k * 0.35), color: '#b22b2b' }); }
      // LEFT: Aunty's house behind a tall compound wall, with a gate and a window
      quad(c, S, [[-30, 0, near], [LW, 0, near], [LW, 0, FAR], [-30, 0, FAR]]); c.fillStyle = '#8a7a66'; c.fill();
      const hx = LW - 2.6;
      quad(c, S, [[hx, 0, 3], [hx, 6.5, 3], [hx, 6.5, 15], [hx, 0, 15]]); c.fillStyle = '#e8c7b0'; c.fill();
      quad(c, S, [[hx, 6.5, 3], [hx + 0.8, 6.9, 3], [hx + 0.8, 6.9, 15], [hx, 6.5, 15]]); c.fillStyle = '#b5694a'; c.fill();
      quad(c, S, [[hx, 2.4, 6.2], [hx, 4.3, 6.2], [hx, 4.3, 9.4], [hx, 2.4, 9.4]]); c.fillStyle = '#3a2a30'; c.fill(); // the window
      c.strokeStyle = '#6a5a50'; c.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) { const z = 6.2 + k * 0.64; quad(c, S, [[hx, 2.4, z], [hx, 4.3, z], [hx, 4.3, z], [hx, 2.4, z]]); c.stroke(); }
      quad(c, S, [[hx + 0.05, 2.0, 5.9], [hx + 0.05, 2.4, 5.9], [hx + 0.05, 2.4, 9.7], [hx + 0.05, 2.0, 9.7]]); c.fillStyle = '#7ea36a'; c.fill(); // flower box
      for (let k = 0; k < 7; k++) { const p = proj(S, hx + 0.1, 2.5, 6.1 + k * 0.55); c.fillStyle = ['#ff7a9a', '#ffd84a', '#ff5a4a'][k % 3]; c.beginPath(); c.arc(p.x, p.y, Math.max(1.5, p.k * 0.12), 0, TAU); c.fill(); }
      // the door + step
      quad(c, S, [[hx, 0, 11.2], [hx, 2.3, 11.2], [hx, 2.3, 12.6], [hx, 0, 12.6]]); c.fillStyle = '#7a4a2a'; c.fill();
      quad(c, S, [[hx, 2.3, 11.1], [hx, 2.6, 11.1], [hx, 2.6, 12.7], [hx, 2.3, 12.7]]); c.fillStyle = '#f2c230'; c.fill(); // painted lintel
      // upstairs balcony with a railing and the day's washing
      quad(c, S, [[hx, 4.9, 4], [hx + 0.9, 4.9, 4], [hx + 0.9, 4.9, 13.5], [hx, 4.9, 13.5]]); c.fillStyle = '#c9a28a'; c.fill();
      c.strokeStyle = '#4a4450'; c.lineWidth = 1.2;
      quad(c, S, [[hx + 0.9, 4.9, 4], [hx + 0.9, 5.8, 4], [hx + 0.9, 5.8, 13.5], [hx + 0.9, 4.9, 13.5]]); c.stroke();
      for (let k = 1; k < 16; k++) { const z = 4 + k * 0.6, a = proj(S, hx + 0.9, 4.9, z), b2 = proj(S, hx + 0.9, 5.8, z); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b2.x, b2.y); c.stroke(); }
      const wash = ['#d8402a', '#2a8c82', '#f2c230', '#efe9dc', '#7a3db8', '#3b6fc4'];
      for (let k = 0; k < 6; k++) { const z = 5 + k * 1.3; quad(c, S, [[hx + 0.95, 5.9, z], [hx + 0.95, 5.0, z], [hx + 0.95, 5.0, z + 0.8], [hx + 0.95, 5.9, z + 0.8]]); c.fillStyle = wash[k]; c.fill(); }
      // fishbone antenna on the roof
      { const p = proj(S, hx + 1, 6.9, 10), q = proj(S, hx + 1, 9.2, 10); c.strokeStyle = '#4a4450'; c.lineWidth = Math.max(1, p.k * 0.07); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); for (let i = 0; i < 4; i++) { const y = q.y + i * p.k * 0.3; c.moveTo(q.x - p.k * (0.9 - i * 0.15), y); c.lineTo(q.x + p.k * (0.9 - i * 0.15), y); } c.stroke(); }
      // wall (stops low balls; over it = out)
      quad(c, S, [[LW, 0, near], [LW, LWH, near], [LW, LWH, FAR], [LW, 0, FAR]]);
      gr = c.createLinearGradient(0, C.hy, 0, Hh); gr.addColorStop(0, '#d8c9ae'); gr.addColorStop(1, '#bfae92');
      c.fillStyle = gr; c.fill();
      quad(c, S, [[LW, LWH, near], [LW - 0.25, LWH, near], [LW - 0.25, LWH, FAR], [LW, LWH, FAR]]); c.fillStyle = '#efe6d2'; c.fill();
      // gate (green grill) + the house name on the pillar
      quad(c, S, [[LW + 0.01, 0, 10.5], [LW + 0.01, 1.7, 10.5], [LW + 0.01, 1.7, 12.8], [LW + 0.01, 0, 12.8]]); c.fillStyle = '#2f6a4a'; c.fill();
      c.strokeStyle = '#1e4a32'; c.lineWidth = 1;
      for (let k = 1; k < 7; k++) { const z = 10.5 + k * 0.33; quad(c, S, [[LW + 0.01, 0.1, z], [LW + 0.01, 1.6, z], [LW + 0.01, 1.6, z], [LW + 0.01, 0.1, z]]); c.stroke(); }
      { const p = proj(S, LW + 0.02, 1.25, 9.6); c.fillStyle = '#f4ead8'; c.fillRect(p.x - p.k * 0.5, p.y - p.k * 0.35, p.k * 1.1, p.k * 0.6); H.text(c, 'SHANTI', p.x + p.k * 0.05, p.y - p.k * 0.12, { font: 'body', weight: 700, size: Math.max(5, p.k * 0.2), color: '#2a1d1a' }); H.text(c, 'NILAYAM', p.x + p.k * 0.05, p.y + p.k * 0.1, { font: 'body', weight: 700, size: Math.max(5, p.k * 0.2), color: '#2a1d1a' }); }
      // chalk warning on the wall
      { const p = proj(S, LW + 0.02, 0.9, 8); H.text(c, 'BALL ANDAR = OUT', p.x, p.y, { font: 'body', weight: 700, size: Math.max(7, p.k * 0.3), color: 'rgba(255,255,255,0.85)' }); }
      // neem tree (right, overhanging the plot)
      { const p = proj(S, RW + 2.5, 0, 10.5); const k = p.k;
        c.fillStyle = '#5a4030'; c.fillRect(p.x - k * 0.18, p.y - k * 3.2, k * 0.36, k * 3.2);
        const blobs = [[0, 4.2, 1.8], [-1.3, 3.7, 1.3], [1.3, 3.8, 1.4], [0.4, 5.2, 1.3], [-0.8, 5, 1.1]];
        for (const [bx, by, br] of blobs) { c.fillStyle = '#3f6a30'; c.beginPath(); c.arc(p.x + bx * k, p.y - by * k, br * k, 0, TAU); c.fill(); }
        for (const [bx, by, br] of blobs) { c.fillStyle = 'rgba(140,190,90,0.35)'; c.beginPath(); c.arc(p.x + bx * k - br * k * 0.25, p.y - by * k - br * k * 0.3, br * k * 0.55, 0, TAU); c.fill(); } }
      // a parked Chetak by the right wall
      { const p = proj(S, RW - 0.7, 0, 15); const k = p.k;
        c.fillStyle = '#7fb3c2'; H.rr(c, p.x - k * 0.6, p.y - k * 0.9, k * 1.2, k * 0.6, k * 0.25); c.fill();
        c.fillStyle = '#1a1214'; c.beginPath(); c.arc(p.x - k * 0.45, p.y - k * 0.2, k * 0.2, 0, TAU); c.arc(p.x + k * 0.45, p.y - k * 0.2, k * 0.2, 0, TAU); c.fill(); }
    }

    function kid(ctx, x, y, h, o) {
      // front-facing kid (bowler / fielders); y = feet, h = height in px
      const s = h / 60;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 3, 0, 0, TAU); ctx.fill();
      const run = o.run ? Math.sin(o.ph) * 7 : 0;
      ctx.fillStyle = o.pants || '#3b4a6b';
      if (o.crouch) { ctx.fillRect(-8, -18, 6, 18); ctx.fillRect(2, -18, 6, 18); }
      else { ctx.save(); ctx.translate(-4, -24); ctx.rotate(run * 0.05); ctx.fillRect(-3, 0, 6, 24); ctx.restore(); ctx.save(); ctx.translate(4, -24); ctx.rotate(-run * 0.05); ctx.fillRect(-3, 0, 6, 24); ctx.restore(); }
      const by = o.crouch ? -40 : -46;
      ctx.fillStyle = o.shirt || '#2a8c82'; H.rr(ctx, -10, by, 20, 24, 5); ctx.fill();
      ctx.fillStyle = o.skin || '#8a5a35'; ctx.beginPath(); ctx.arc(0, by - 7, 7.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, by - 9, 7.8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      if (o.girl) { ctx.fillRect(-9, by - 9, 3, 16); ctx.fillRect(6, by - 9, 3, 16); ctx.fillStyle = '#d24d57'; ctx.fillRect(-9.5, by + 5, 4, 3); ctx.fillRect(5.5, by + 5, 4, 3); ctx.fillStyle = '#1a1412'; }
      ctx.fillStyle = '#1a1412'; ctx.fillRect(-3.5, by - 7.5, 2, 2); ctx.fillRect(1.5, by - 7.5, 2, 2);
      ctx.strokeStyle = o.skin || '#8a5a35'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
      ctx.beginPath();
      if (o.bowl != null) { const a = -Math.PI / 2 - o.bowl * Math.PI * 1.2; ctx.moveTo(8, by + 4); ctx.lineTo(8 + Math.cos(a) * 18, by + 4 + Math.sin(a) * 18); ctx.moveTo(-8, by + 4); ctx.lineTo(-14, by + 16 + run * 0.5); }
      else if (o.catch) { ctx.moveTo(-8, by + 4); ctx.lineTo(-4, by - 16); ctx.moveTo(8, by + 4); ctx.lineTo(4, by - 16); }
      else if (o.crouch) { ctx.moveTo(-8, by + 4); ctx.lineTo(-7, by + 22); ctx.moveTo(8, by + 4); ctx.lineTo(7, by + 22); }
      else { ctx.moveTo(-8, by + 4); ctx.lineTo(-12, by + 18 - run); ctx.moveTo(8, by + 4); ctx.lineTo(12, by + 18 + run); }
      ctx.stroke();
      ctx.restore();
    }

    function drawBatter(ctx, S, g) {
      const p = proj(S, 0.05, 0, -0.3);
      const hpx = 1.32 * p.k;
      const s = hpx / 60;
      const sw = S.swing;
      // bat angle: back-lift at rest, sweeps towards the shot direction
      let ang = 0.25;
      if (sw) {
        const k = Math.min(1, sw.t / 0.2);
        const end = sw.dir === 'pull' ? -1.7 : sw.dir === 'cut' ? 1.35 : -2.6;
        ang = lerp(2.5, end, H.ease.out(k));
      } else if (S.stage === 'flight' || S.stage === 'runup') ang = 2.5 + Math.sin(S.clock * 9) * 0.06;
      const lift = Math.abs(ang) > 1.15;
      // the bat (behind the body when lifted)
      const hx = p.x + 6 * s, hy = p.y - 34 * s;
      const drawBat = () => {
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
        ctx.fillStyle = '#c99a5a'; H.rr(ctx, -3.4 * s, 4 * s, 6.8 * s, 30 * s, 2 * s); ctx.fill();
        ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = Math.max(1, s * 1.2); ctx.stroke();
        ctx.fillStyle = '#3a2a2a'; ctx.fillRect(-1.6 * s, -6 * s, 3.2 * s, 11 * s);
        ctx.restore();
      };
      if (!lift) drawBat();
      H.kidBack(ctx, p.x, p.y, s, { shirt: '#f4efe2', stripes: '#2a8c82', pants: '#2b3a5a', skin: '#a8703f' });
      // arms to the bat handle
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = Math.max(2, 4.2 * s); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - 8 * s, p.y - 42 * s); ctx.lineTo(hx, hy); ctx.moveTo(p.x + 8 * s, p.y - 42 * s); ctx.lineTo(hx + 1, hy + 2); ctx.stroke();
      if (lift) drawBat();
    }

    function drawCricket(g, ctx, S) {
      const W = g.W, Hh = g.H;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      // Aunty at the window (or in a bubble at the screen edge when the window is off-screen)
      if (S.aunty > 0) {
        let p = proj(S, LW - 2.55, 2.5, 7.8), k = p.k;
        const inset = p.x < 30;
        if (inset) {
          k = Math.max(26, W * 0.08); p = { x: k * 1.6, y: g.area.y + g.area.h * 0.42 };
          ctx.fillStyle = '#3a2a30'; ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.4, k * 1.25, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.4, k * 1.2, 0, TAU); ctx.clip();
        }
        ctx.fillStyle = '#d8402a'; H.rr(ctx, p.x - k * 0.7, p.y - k * 1.4, k * 1.4, k * 1.4, k * 0.3); ctx.fill();
        ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.75, k * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.9, k * 0.44, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = '#b22b2b'; ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.92, k * 0.06, 0, TAU); ctx.fill();
        if (inset) ctx.restore();
        const bw_ = Math.max(118, k * 4.2), bx = Math.min(W - bw_ - 8, p.x + k * 0.6), by = p.y - k * 3.2;
        H.sign(ctx, bx, by - 16, bw_, Math.max(30, k * 1.1), { fill: '#fff8e6', text: 'Kaun hai re?!', size: Math.max(14, k * 0.5), font: 'body', bolts: false, r: 10 });
      }
      // sprites, far to near
      const spr = [];
      const bw = S.bowler;
      spr.push({ z: bw.z, f: () => { const p = proj(S, bw.x, 0, bw.z); kid(ctx, p.x, p.y, 1.45 * p.k, { shirt: S.bowlerName ? '#d24d57' : '#d8402a', pants: S.bowlerName ? '#f4efe2' : '#2b2430', girl: !!S.bowlerName, run: S.stage === 'runup', ph: bw.ph, bowl: S.stage === 'flight' || S.stage === 'runup' ? bw.arm : null }); } });
      S.fielders.forEach((f, i) => spr.push({ z: f.z, f: () => { const p = proj(S, f.x, 0, f.z); kid(ctx, p.x, p.y, 1.35 * p.k, { shirt: ['#2a8c82', '#f2c230', '#7a3db8', '#3b6fc4'][i % 4], pants: '#4a3f35', crouch: !f.run && !f.catch && S.stage !== 'result', run: f.run > 0.5, ph: f.ph, catch: f.catch }); } }));
      // bowler's-end bricks
      spr.push({ z: 13.4, f: () => drawBricks(ctx, S, 13.45, null) });
      const b = S.ball;
      if (b && !(b.done && S.aunty > 0)) spr.push({ z: b.z, f: () => drawBall(ctx, S, b) });
      spr.sort((a, c) => c.z - a.z);
      for (const s_ of spr) s_.f();
      // the hitting ring at the batter's feet
      if (S.stage === 'flight' && b && !b.hit) {
        const dtA = b.tArrive - S.clock, near = U.clamp(1 - Math.abs(dtA) / (g.assist ? 0.7 : 0.45), 0, 1);
        const p = proj(S, 0.15, 0, HIT_Z);
        ctx.strokeStyle = 'rgba(255,216,74,' + (0.25 + near * 0.7 * (g.diff < 0.65 || g.assist ? 1 : 0.4)) + ')';
        ctx.lineWidth = 2 + near * 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.k * (0.75 - near * 0.2), p.k * 0.16, 0, 0, TAU); ctx.stroke();
      }
      if (S.mali && S.mali.t >= 0) { // the park mali walks across with his hose
        const k = Math.min(1, S.mali.t / 0.8), p = proj(S, lerp(5.5, 1.8, k), 0, 6);
        kid(ctx, p.x, p.y, 1.75 * p.k, { shirt: '#e8e2d2', pants: '#2f6a4a', skin: '#6a3a1a' });
        ctx.strokeStyle = '#2f8a3a'; ctx.lineWidth = Math.max(2, p.k * 0.08); ctx.beginPath(); ctx.moveTo(p.x + p.k * 0.3, p.y - p.k * 0.8); ctx.quadraticCurveTo(p.x + p.k * 2, p.y, p.x + p.k * 4, p.y - p.k * 0.1); ctx.stroke();
        H.sign(ctx, Math.max(8, p.x - 90), p.y - p.k * 2.6 - 40, 200, 34, { fill: '#fff8e6', text: 'Ghaas pe nakko khelna!', size: 15, font: 'body', bolts: false, r: 10 });
      }
      drawBatter(ctx, S, g);
      drawBricks(ctx, S, -0.75, S.bricks);
      // message
      if (S.msg && S.msg.t < 2) {
        const m = S.msg, k = Math.min(1, m.t / 0.2), a = m.t > 1.5 ? 1 - (m.t - 1.5) / 0.5 : 1;
        const y = g.area.y + g.area.h * 0.18;
        ctx.save(); ctx.translate(W / 2, y); const sc = 0.5 + 0.5 * H.ease.outBack(k); ctx.scale(sc, sc); ctx.rotate(-0.03);
        H.text(ctx, m.text, 0, 0, { font: 'display', size: m.big ? Math.max(34, Math.min(64, W * 0.09)) : Math.max(26, Math.min(44, W * 0.065)), color: m.col, outline: 7, alpha: a, maxW: W - 30 });
        if (m.sub) H.text(ctx, m.sub, 0, Math.max(34, W * 0.06), { font: 'body', weight: 700, size: Math.max(15, Math.min(22, W * 0.035)), color: '#fff', outline: 4, alpha: a });
        ctx.restore();
      }
      // chasing: need X off Y
      if (S.stage !== 'result' && !g.over) {
        const need = Math.max(0, S.target - S.runs);
        H.text(ctx, 'NEED ' + need + ' OFF ' + S.ballsLeft, W / 2, g.area.y + 18, { font: 'osd', size: 22, color: '#eaf2ff', outline: 4, stroke: '#1b2a78' });
        // this over's balls, like chalk marks
        const last = S.log.slice(-6);
        last.forEach((t, i) => H.text(ctx, t, W / 2 + (i - (last.length - 1) / 2) * 30, g.area.y + 42, { font: 'osd', size: 20, color: t === 'W' ? '#ff8a7a' : t === '4' || t === '6' ? '#ffd84a' : '#fff', outline: 3 }));
      }
    }

    function drawBall(ctx, S, b) {
      const p = proj(S, b.x, b.y, b.z), sh = proj(S, b.x, 0, b.z);
      const r = Math.max(3.2, 0.11 * p.k);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, r * 1.1, r * 0.4, 0, 0, TAU); ctx.fill();
      // motion trail
      if (S.trail.length > 1) {
        ctx.strokeStyle = 'rgba(230,250,120,0.35)'; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
        ctx.beginPath(); S.trail.forEach((t, i) => { const q = proj(S, t.x, t.y, t.z); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke();
      }
      ctx.fillStyle = '#d8f05a'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath(); ctx.arc(p.x - r * 0.9, p.y, r * 0.8, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x + r * 0.9, p.y, r * 0.8, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    }
    function drawBricks(ctx, S, z, fall) {
      const p = proj(S, 0.32, 0, z), k = p.k;
      const bw = 0.24 * k, bh = 0.075 * k;
      for (let i = 0; i < 3; i++) {
        let x = p.x - bw / 2, y = p.y - bh * (i + 1), rot = 0;
        if (fall) { const t = Math.min(1, fall.t * 2.5); x += (i - 1) * t * bw * 1.4; y += t * bh * i * 0.9 - Math.sin(t * Math.PI) * bh * 3 * (i + 1) * 0.4; rot = (i - 1) * t * 0.8; }
        ctx.save(); ctx.translate(x + bw / 2, y + bh / 2); ctx.rotate(rot);
        ctx.fillStyle = i % 2 ? '#a8432a' : '#b5543a'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.strokeStyle = 'rgba(60,20,10,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      }
    }

    MG.register(def);
  }

  /* ================================================================ ANTENNA */
  // Sunday, 10:59. Up on the terrace, rotate the fishbone antenna until Doordarshan comes in clear,
  // then hold it there before the Sunday show starts at 11:00. The rusty pole sticks (tap = nudge,
  // hold = turn), the wind pushes it, reflections make false peaks, and crows love to sit on it.
  // Amma shouts from below: "Aaya? Ab? Thoda left! BAS! Wahi rakho!"
  {
    // systems_design §8.5: turn 40 deg/s, 2 deg nudge, 1-2 false peaks at 60-80%, lock = quality >= 85%
    // for 2.5 s, crows every 8-12 s knock it 5-10 deg off, hints wrong 25% of the time at d > 0.6
    const T = (MG.TUNE.antenna = Object.assign({ turn: 0.7, nudge: 0.035, lockQ: 0.85, lockTime: 2.5, crowMin: 8, crowMax: 12, crowKick: [0.087, 0.175],
      falseLo: 0.6, falseHi: 0.8, wrongHint: 0.25, time0: 60, time1: 15 }, MG.TUNE.antenna || {}));
    const LOCK_Q = T.lockQ;
    const def = {
      id: 'antenna',
      title: 'Antenna Ghumao',
      sub: 'Sunday 10:59. The show starts at 11:00. The picture is all barish (rain).',
      osd: 'SUNDAY · 10:59 AM',
      place: 'home', places: ['home', 'home_terrace', 'friend_home'],
      secs: 60,
      goLabel: 'GHUMAO!',
      keys: { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'shoo', ArrowUp: 'shoo', KeyW: 'shoo', KeyS: 'shoo', ArrowDown: 'shoo' },
      buttons: () => [
        { a: 'left', label: '◀', sub: 'GHUMAO' }, { a: 'right', label: '▶', sub: 'GHUMAO' }, { gap: true, w: 0.3 },
        { a: 'shoo', label: 'SHOO!', sub: 'CROW', cls: 'red' },
      ],
      keyHint: () => 'hold <kbd>←</kbd>/<kbd>→</kbd> to turn, tap to nudge &nbsp; <kbd>Space</kbd> shoo the crow',
      howto(g) {
        return {
          lines: [
            '<b>Hold ◀ ▶</b> to turn the rusty antenna; <b>tap</b> for a tiny nudge. Watch the TV and the booster needle downstairs.',
            'Listen to ' + (g.params.caller === 'babji' ? 'Babji' : 'Amma') + ': <i>"thoda left!", "aaya!"</i>. Reflections off buildings make <b>false peaks</b>: a ghostly picture is not the real thing.',
            'When the picture is clear, <b>hold it steady</b> for ' + T.lockTime + ' s. Crows land on the antenna and knock it: <b>SHOO</b> them!',
          ],
          goal: 'CLEAR PICTURE BEFORE 11:00 &middot; ' + timeLimit(g) + 's',
          keys: 'hold <kbd>←</kbd> <kbd>→</kbd> turn · tap to nudge · <kbd>Space</kbd> shoo',
          touch: 'Hold <b>◀ ▶</b> to turn, tap to nudge · <b>SHOO!</b> for crows',
        };
      },
      setup(g) {
        const S = g.S, d = g.diff, r = g.rng;
        S.score = 0; S.time = 0; S.limit = timeLimit(g); S.left = S.limit;
        S.tower = -0.6 + r.next() * 1.2;                     // bearing of the Doordarshan tower: the true peak
        S.best = S.tower;
        S.peaks = [];                                          // 1-2 false peaks (reflections off buildings)
        const nf = d > 0.5 ? 2 : 1;
        for (let i = 0; i < nf; i++) S.peaks.push({ a: S.best + (i % 2 ? -1 : 1) * (r.next() < 0.5 ? 1 : -1) * (0.9 + r.next() * 0.8), h: T.falseLo + r.next() * (T.falseHi - T.falseLo) });
        S.caller = g.params.caller === 'babji' ? 'babji' : 'amma';
        S.theta = S.best + Math.PI * (0.55 + r.next() * 0.5) * (r.next() < 0.5 ? -1 : 1); S.theta0 = S.theta;
        S.omega = 0; S.effort = 0; S.holdT = 0; S.lastDir = 0;
        S.Q = 0; S.Qs = 0; S.lock = 0; S.locked = false; S.holdNeed = T.lockTime;
        S.windPh = r.next() * 10; S.gust = 0; S.gustIn = 6 + r.next() * 5; S.gustDir = 1;
        S.crow = null; S.crowIn = T.crowMin + r.next() * (T.crowMax - T.crowMin); S.shoo = 0; S.crows = 0;
        S.interf = null; S.interfIn = 9 + r.next() * 6;
        S.amma = { text: S.caller === 'babji' ? 'Ghumao bhai, signal dhoondo! Picture saaf chahiye.' : 'Antenna ghumao! Kuch nahi dikh raha!', t: 0, mood: 'cross' }; S.ammaT = 2.6; S.prevBand = 0;
        S.roll = 0; S.wasLocked = false; S.flicker = 0;
        S.hiss = g.loop({ ft: 'highpass', f: 1400, q: 0.4 });
      },
      layout(g) { g.S.bgKey = null; },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) { S.time += dt * 0.5; S.flicker += dt; } },
      bot(g, dt, want) {
        const S = g.S;
        if (want === 'lose') { g.botHold('left', false); g.botHold('right', false); return; }
        if (S.crow && S.crow.state === 'sit' && !S.botShoo) { S.botShoo = true; g.botPress('shoo'); }
        if (!S.crow) S.botShoo = false;
        const diff = U.angleDiff(S.theta, S.best);
        S.botT = (S.botT || 0) - dt;
        if (Math.abs(diff) > 0.22) { g.botHold(diff > 0 ? 'right' : 'left', true); g.botHold(diff > 0 ? 'left' : 'right', false); }
        else {
          g.botHold('left', false); g.botHold('right', false);
          if (Math.abs(diff) > 0.05 && Math.abs(S.omega) < 0.05 && S.botT <= 0) { g.botPress(diff > 0 ? 'right' : 'left'); S.botT = 0.25; }
        }
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'SIGNAL', v: Math.round(S.Qs * 100) + '%', good: S.Qs >= LOCK_Q }, { k: 'LOCK', v: Math.round(S.lock * 100) + '%' }, { k: '', v: '0:' + String(Math.max(0, Math.ceil(S.left))).padStart(2, '0'), warn: S.left < 12 }];
      },
      draw(g, ctx) { drawAntenna(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? 'Picture saaf!' : 'Signal gaya!',
          line: r.win ? 'Amma: "Bas! Ab haath mat lagana!" The whole family is in front of the TV.' : 'The title song is playing behind the snow. Next Sunday, start at 10:55.',
          rows: [['Best signal', Math.round(S.bestQ * 100) + '%'], ['Crows shooed', S.crows], ['Time to spare', Math.max(0, Math.ceil(S.left)) + 's'], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.left > S.limit * 0.4 ? 1 : 0) + (S.left > S.limit * 0.65 ? 1 : 0) : 0; },
      cleanup(g) { if (g.S && g.S.hiss) g.S.hiss.stop(); },
    };
    function timeLimit(g) { return g.params.time || Math.round(T.time0 - g.diff * T.time1); }

    function signal(S, th) {
      const d = U.angleDiff(th, S.best), db = U.angleDiff(th, S.best + Math.PI);
      let q = Math.exp(-(d * d) / (2 * 0.17 * 0.17)) + 0.25 * Math.exp(-(db * db) / (2 * 0.22 * 0.22));
      for (const p of S.peaks) { const dp = U.angleDiff(th, p.a); q = Math.max(q, p.h * Math.exp(-(dp * dp) / (2 * 0.15 * 0.15))); }
      return Math.min(1, q);
    }

    function say(S, text, mood) { if (S.amma && S.amma.text === text && S.amma.t < 2) return; S.amma = { text, t: 0, mood: mood || 'ok' }; }

    function step(g, S, dt) {
      S.time += dt; S.flicker += dt;
      if (!g.over) { S.left -= dt; }
      // --- input: tap = nudge, hold = turn (the rusty pole sticks first)
      const dir = (g.down('right') ? 1 : 0) - (g.down('left') ? 1 : 0);
      if (!g.over) {
        if (g.pressed('left') || g.pressed('right')) { S.holdT = 0; S.effort = 0; }
        if (dir) {
          S.holdT += dt;
          S.effort += dt;
          if (S.effort > 0.16) S.omega = H.approach(S.omega, dir * T.turn, 3.2 * dt);
          S.lastDir = dir;
        } else {
          if (S.holdT > 0 && S.holdT < 0.16) { S.theta += S.lastDir * T.nudge; g.tone(260, 0.03, { type: 'square', vol: 0.025 }); } // a nudge
          S.holdT = 0; S.effort = 0;
          S.omega *= Math.exp(-7 * dt);
        }
      } else S.omega *= Math.exp(-7 * dt);
      if (dir && S.effort > 0.16 && Math.floor(S.time * 9) !== Math.floor((S.time - dt) * 9)) g.tone(140 + Math.random() * 40, 0.035, { type: 'sawtooth', vol: 0.02 }); // creak
      // --- wind
      S.gustIn -= dt;
      if (S.gustIn <= 0 && S.gust <= 0) { S.gust = 0.9; S.gustDir = Math.random() < 0.5 ? -1 : 1; S.gustIn = 7 + Math.random() * 6 - g.diff * 2; g.sfx('kite_wind', { vol: 0.6 }); }
      if (S.gust > 0) S.gust -= dt;
      const wind = (Math.sin(S.time * 0.7 + S.windPh) * 0.6 + Math.sin(S.time * 1.9 + S.windPh * 2) * 0.4) * (0.03 + g.diff * 0.07) + (S.gust > 0 ? S.gustDir * (0.25 + g.diff * 0.25) : 0);
      // --- crows
      if (S.crow) {
        const c = S.crow;
        c.t += dt;
        if (c.state === 'in' && c.t > 1.1) { c.state = 'sit'; c.t = 0; g.sfx('crow_caw'); S.theta += c.side * lerp(T.crowKick[0], T.crowKick[1], Math.random()); } // lands with a thump: 5-10 deg off
        else if (c.state === 'sit') { S.theta += c.side * 0.02 * dt; if (c.t > 2.5 && Math.random() < dt * 0.5) g.sfx('crow_caw', { vol: 0.5 }); }
        else if (c.state === 'out' && c.t > 1.2) S.crow = null;
      } else if (!g.over) {
        S.crowIn -= dt;
        if (S.crowIn <= 0) { S.crow = { state: 'in', t: 0, side: Math.random() < 0.5 ? -1 : 1, from: Math.random() < 0.5 ? -1 : 1 }; S.crowIn = T.crowMin + Math.random() * (T.crowMax - T.crowMin); }
      }
      if (g.pressed('shoo') && !g.over) {
        S.shoo = 0.5;
        if (S.crow && S.crow.state !== 'out') { S.crow.state = 'out'; S.crow.t = 0; S.crows++; S.score += 50; g.sfx('crow_caw', { pitch: 1.2 }); g.pop('SHOO!', S.antX || g.W / 2, (S.antY || g.H / 3) - 20, { size: 24, color: '#fff' }); }
      }
      if (S.shoo > 0) S.shoo -= dt;
      // --- turn the pole
      S.theta += (S.omega + wind) * dt;
      S.theta = U.wrapAngle(S.theta);
      // --- interference (cosmetic + pauses the lock): a mixer-grinder next door, a plane to Begumpet
      if (S.interf) { S.interf.t += dt; if (S.interf.t > S.interf.dur) S.interf = null; }
      else if (!g.over) { S.interfIn -= dt; if (S.interfIn <= 0) { const k = Math.random() < 0.5 ? 'mixer' : 'plane'; S.interf = { k, t: 0, dur: k === 'mixer' ? 1.6 : 2.2 }; S.interfIn = 10 + Math.random() * 8; if (k === 'plane') g.sfx('airplane', { vol: 0.5 }); else g.noise(1.5, { f: 900, q: 3, vol: 0.05 }); } }
      // --- signal
      let Q = signal(S, S.theta);
      if (S.crow && S.crow.state === 'sit') Q *= 0.85;
      const qi = S.interf ? (S.interf.k === 'mixer' ? 0.45 : 0.7) : 1;
      S.Q = Q;
      S.Qs += (Q * qi - S.Qs) * Math.min(1, dt * 6);
      S.bestQ = Math.max(S.bestQ || 0, S.Qs);
      if (S.hiss) S.hiss.set((1 - S.Qs) * 0.05 + 0.004, 1200 + S.Qs * 2000);
      // --- lock
      if (!g.over) {
        if (S.Qs >= LOCK_Q) {
          S.lock = Math.min(1, S.lock + dt / S.holdNeed);
          if (!S.wasLocked) { S.wasLocked = true; say(S, ['BAS! BAS! Wahi rakho!', 'Haan! Aaya! Haath mat hilao!', 'Wahi! Ekdum wahi!'][(Math.random() * 3) | 0], 'happy'); g.tone(880, 0.08, { type: 'triangle', vol: 0.05 }); g.tone(1320, 0.12, { type: 'triangle', vol: 0.05, delay: 0.08 }); }
        } else {
          if (!S.interf) S.lock = Math.max(0, S.lock - dt / S.holdNeed * 1.5); // keep it steady: the hold drains away
          if (S.wasLocked && S.Qs < 0.6) { S.wasLocked = false; say(S, ['Arre! Phir gaya!', 'Gaya gaya gaya!', 'Kya kiya?! Phir se barish!'][(Math.random() * 3) | 0], 'cross'); }
        }
        if (S.lock >= 1) {
          S.locked = true;
          S.score += 500 + Math.round(S.left) * 20;
          say(S, 'Bas! Ab koi haath mat lagana!', 'happy');
          melody(g);
          g.finish(true, { crows: S.crows, timeLeft: Math.ceil(S.left), delay: 2.2 });
        } else if (S.left <= 0) {
          S.left = 0;
          say(S, 'Show shuru ho gaya! Kuch nahi dikh raha!', 'cross');
          g.finish(false, { crows: S.crows, best: Math.round((S.bestQ || 0) * 100), delay: 1.4 });
        }
      }
      // --- Amma's running commentary
      S.ammaT -= dt;
      if (S.amma) S.amma.t += dt;
      if (S.ammaT <= 0 && !g.over && !S.wasLocked) {
        S.ammaT = 2.6 + Math.random() * 1.2;
        const d = U.angleDiff(S.theta, S.best);
        let lr = d < 0 ? 'right' : 'left'; // which way to turn
        if (g.diff > 0.6 && Math.random() < T.wrongHint) lr = lr === 'left' ? 'right' : 'left';
        const hintOK = g.diff < 0.8 || Math.random() < 0.6;
        const dirTxt = hintOK ? (lr === 'left' ? 'Thoda LEFT!' : 'Thoda RIGHT!') : 'Ghumao!';
        if (S.interf) say(S, S.interf.k === 'mixer' ? 'Padosan ka mixer chal raha!' : 'Hawai jahaz! Ruko zara!', 'ok');
        else if (S.crow && S.crow.state === 'sit') say(S, 'Kauwa baitha hai! Bhagao usko!', 'cross');
        else if (S.Qs < 0.22) say(S, 'Kuch nahi aara! ' + dirTxt, 'cross');
        else if (S.Qs < 0.5) say(S, 'Thoda thoda aara... ' + dirTxt, 'ok');
        else say(S, 'Aaya aaya! Bas thoda sa... ' + (hintOK ? (lr === 'left' ? 'left' : 'right') : ''), 'ok');
      }
    }
    function melody(g) {
      const n = [523, 659, 784, 1047, 784, 1047, 1319];
      n.forEach((f, i) => g.tone(f, 0.14, { type: 'triangle', vol: 0.06, delay: i * 0.12 }));
    }

    /* ------------------------------------------------------------- drawing */
    function panels(g) {
      const A = g.area, W = g.W;
      if (g.portrait) {
        const h1 = Math.round(A.h * 0.54);
        return { T: { x: 0, y: A.y, w: W, h: h1 }, V: { x: 0, y: A.y + h1, w: W, h: A.h - h1 } };
      }
      const w1 = Math.round(W * 0.52);
      return { T: { x: 0, y: A.y, w: w1, h: A.h }, V: { x: w1, y: A.y, w: W - w1, h: A.h } };
    }

    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + g.area.h;
      const P = (S.P = panels(g));
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = '#120d16'; c.fillRect(0, 0, W, Hh);
      // ---------------- terrace panel
      const T = P.T;
      c.save(); c.beginPath(); c.rect(T.x, 0, T.w, T.y + T.h); c.clip();
      const hor = T.y + T.h * 0.66;
      let gr = c.createLinearGradient(0, 0, 0, hor);
      gr.addColorStop(0, '#5aa6dc'); gr.addColorStop(1, '#cfe6f0');
      c.fillStyle = gr; c.fillRect(T.x, 0, T.w, hor);
      // sun
      gr = c.createRadialGradient(T.x + T.w * 0.93, T.y + T.h * 0.08, 0, T.x + T.w * 0.93, T.y + T.h * 0.08, T.h * 0.4);
      gr.addColorStop(0, 'rgba(255,255,230,0.9)'); gr.addColorStop(0.1, 'rgba(255,250,210,0.5)'); gr.addColorStop(1, 'rgba(255,250,210,0)');
      c.fillStyle = gr; c.fillRect(T.x, 0, T.w, hor);
      // far skyline
      const rng = U.rng(909);
      c.fillStyle = '#a9b9c9';
      for (let x = T.x; x < T.x + T.w; ) { const w = 10 + rng.next() * 30, h = 8 + rng.next() * 28; c.fillRect(x, hor - h, w, h + 2); x += w; }
      // the Doordarshan tower on the horizon (lattice, red/white bands)
      const tx = T.x + T.w * 0.78, th = T.h * 0.42, tb = hor;
      S.towerX = tx; S.towerTop = tb - th;
      c.strokeStyle = '#b8443a'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(tx - th * 0.07, tb); c.lineTo(tx - 1, tb - th); c.moveTo(tx + th * 0.07, tb); c.lineTo(tx + 1, tb - th);
      for (let i = 0; i < 12; i++) { const y0 = tb - (i / 12) * th, y1 = tb - ((i + 1) / 12) * th, w0 = th * 0.07 * (1 - i / 12) + 1, w1 = th * 0.07 * (1 - (i + 1) / 12) + 1; c.moveTo(tx - w0, y0); c.lineTo(tx + w1, y1); c.moveTo(tx + w0, y0); c.lineTo(tx - w1, y1); }
      c.stroke();
      for (let i = 0; i < 6; i++) { const y = tb - th * (0.15 + i * 0.15); c.fillStyle = i % 2 ? '#f4efe2' : '#c8483a'; c.fillRect(tx - th * 0.05 * (1 - (0.15 + i * 0.15)) - 2, y - 2, th * 0.1 * (1 - (0.15 + i * 0.15)) + 4, 4); }
      // near rooftops
      c.fillStyle = '#d9c3a0';
      for (let x = T.x - 10; x < T.x + T.w; ) { const w = 30 + rng.next() * 60, h = 6 + rng.next() * 22; c.fillRect(x, hor - h + T.h * 0.06, w, T.h); c.fillStyle = rng.next() < 0.5 ? '#d9c3a0' : '#c9b08c'; x += w + 2; }
      // our terrace floor + parapet
      const fl = T.y + T.h * 0.8;
      gr = c.createLinearGradient(0, fl, 0, T.y + T.h); gr.addColorStop(0, '#c9bca4'); gr.addColorStop(1, '#a89880');
      c.fillStyle = gr; c.fillRect(T.x, fl, T.w, T.y + T.h - fl);
      c.fillStyle = '#efe9dc'; c.fillRect(T.x, fl - T.h * 0.05, T.w, T.h * 0.05);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(T.x, fl - 2, T.w, 3);
      // black Sintex tank on its stand
      const kx = T.x + T.w * 0.86, ky = fl - T.h * 0.06;
      c.fillStyle = '#6a5a50'; c.fillRect(kx - 4, ky - T.h * 0.06, 4, T.h * 0.06); c.fillRect(kx + T.w * 0.1, ky - T.h * 0.06, 4, T.h * 0.06);
      c.fillStyle = '#26222a'; H.rr(c, kx - 6, ky - T.h * 0.2, T.w * 0.1 + 14, T.h * 0.15, 6); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(kx, ky - T.h * 0.19, 5, T.h * 0.13);
      c.restore();
      // ---------------- TV room panel
      const V = P.V;
      c.save(); c.beginPath(); c.rect(V.x, V.y, V.w, V.h); c.clip();
      gr = c.createLinearGradient(0, V.y, 0, V.y + V.h); gr.addColorStop(0, '#9cc7b4'); gr.addColorStop(1, '#7fae9b');
      c.fillStyle = gr; c.fillRect(V.x, V.y, V.w, V.h);
      c.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 30; i++) c.fillRect(V.x + rng.next() * V.w, V.y + rng.next() * V.h, 20 + rng.next() * 40, 2);
      // red-oxide floor
      const vf = V.y + V.h * 0.86;
      c.fillStyle = '#9a3f2c'; c.fillRect(V.x, vf, V.w, V.h);
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(V.x, vf, V.w, 3);
      // calendar
      const cw = Math.min(V.w * 0.14, 70), cx = V.x + V.w * 0.07, cy = V.y + V.h * 0.1;
      c.fillStyle = '#f4efe2'; c.fillRect(cx, cy, cw, cw * 1.35);
      c.fillStyle = '#d8402a'; c.fillRect(cx, cy, cw, cw * 0.55);
      c.fillStyle = '#f2c230'; c.beginPath(); c.arc(cx + cw / 2, cy + cw * 0.28, cw * 0.18, 0, TAU); c.fill();
      c.fillStyle = 'rgba(40,30,30,0.5)'; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) c.fillRect(cx + 4 + j * (cw - 8) / 5, cy + cw * 0.65 + i * cw * 0.13, (cw - 8) / 5 - 2, 2);
      c.restore();
      S.P = P;
    }

    function drawAntenna(g, ctx, S) {
      const W = g.W, Hh = g.H;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const P = S.P, T = P.T, V = P.V;
      // ---- terrace
      ctx.save(); ctx.beginPath(); ctx.rect(T.x, T.y, T.w, T.h); ctx.clip();
      // tower light blinks
      if (Math.floor(S.time * 1.4) % 2 === 0) { ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(S.towerX, S.towerTop - 2, 3, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,60,40,0.3)'; ctx.beginPath(); ctx.arc(S.towerX, S.towerTop - 2, 8, 0, TAU); ctx.fill(); }
      // clothesline flapping in the wind
      const fl = T.y + T.h * 0.8;
      const lx0 = T.x + T.w * 0.04, lx1 = T.x + T.w * 0.4, ly = T.y + T.h * 0.56;
      ctx.strokeStyle = 'rgba(60,50,50,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lx0, fl - T.h * 0.05); ctx.lineTo(lx0, ly); ctx.moveTo(lx1, fl - T.h * 0.05); ctx.lineTo(lx1, ly); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.quadraticCurveTo((lx0 + lx1) / 2, ly + 8, lx1, ly); ctx.stroke();
      const wv = 0.4 + (S.gust > 0 ? 1.4 : 0) + Math.abs(Math.sin(S.time * 0.7 + S.windPh)) * 0.5;
      const cl = ['#d8402a', '#2a8c82', '#f2c230', '#efe9dc'];
      for (let i = 0; i < 4; i++) {
        const x = lx0 + (lx1 - lx0) * (0.12 + i * 0.22), w = (lx1 - lx0) * 0.14, h = T.h * 0.12, y = ly + 3 + Math.sin(i) * 2;
        const sk = Math.sin(S.time * (5 + wv * 4) + i) * wv * 6 * (S.gust > 0 ? S.gustDir : 1);
        ctx.fillStyle = cl[i];
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w + sk, y + h); ctx.lineTo(x + sk, y + h); ctx.closePath(); ctx.fill();
      }
      // the mast + the fishbone (Yagi) antenna, projected from its heading theta
      const mx = T.x + T.w * 0.55, top = T.y + T.h * 0.22, L = Math.min(T.w * 0.36, T.h * 0.5);
      S.antX = mx; S.antY = top;
      ctx.strokeStyle = '#5a5560'; ctx.lineWidth = Math.max(3, L * 0.035);
      ctx.beginPath(); ctx.moveTo(mx, fl + 4); ctx.lineTo(mx, top); ctx.stroke();
      // guy wires
      ctx.strokeStyle = 'rgba(70,70,80,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx, top + L * 0.4); ctx.lineTo(mx - L * 0.7, fl); ctx.moveTo(mx, top + L * 0.4); ctx.lineTo(mx + L * 0.7, fl); ctx.stroke();
      const th = S.theta;
      const pr = (along, across) => { // along the boom (+ = pointing direction), across = element half-length
        const ax = Math.sin(th), az = Math.cos(th); // heading: 0 = into the screen (towards the tower side)
        const ex = Math.cos(th), ez = -Math.sin(th);
        const x = along * ax + across * ex, z = along * az + across * ez;
        return [mx + x * L, top - z * L * 0.28];
      };
      // elements (reflector at the back is the longest)
      const n = 7;
      for (let i = 0; i < n; i++) {
        const along = -0.55 + (i / (n - 1)) * 1.1, half = 0.42 - i * 0.035;
        const a = pr(along, -half), b = pr(along, half);
        ctx.strokeStyle = i === 0 ? '#3a3540' : '#6a6570'; ctx.lineWidth = Math.max(1.5, L * 0.018);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      const b0 = pr(-0.6, 0), b1 = pr(0.6, 0);
      ctx.strokeStyle = '#4a4550'; ctx.lineWidth = Math.max(2, L * 0.03);
      ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
      // a little arrow at the front so you can see where it points
      const f0 = pr(0.6, 0), f1 = pr(0.74, 0);
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(f1[0], f1[1], Math.max(3, L * 0.035), 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(f0[0], f0[1]); ctx.lineTo(f1[0], f1[1]); ctx.stroke();
      // the crow
      if (S.crow) {
        const c = S.crow, tip = pr(-0.55 + 0.55, c.side * 0.3);
        let x = tip[0], y = tip[1] - 6;
        if (c.state === 'in') { const k = H.ease.out(Math.min(1, c.t / 1.1)); x = lerp(T.x + (c.from > 0 ? T.w + 20 : -20), x, k); y = lerp(T.y + 10, y, k) - Math.sin(k * Math.PI) * 20; }
        if (c.state === 'out') { const k = c.t / 1.2; x += k * 160 * c.from; y -= k * 120; }
        drawCrow(ctx, x, y, Math.max(0.8, L * 0.008), c.state !== 'sit', S.time);
      }
      // the kid holding the mast
      const ks = Math.max(0.55, T.h * 0.0032), kx = mx - 14 * ks, ky = fl + T.h * 0.12;
      const turning = g.down('left') || g.down('right');
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = 4.6 * ks; ctx.lineCap = 'round';
      const wave = S.shoo > 0 ? Math.sin(S.time * 30) * 12 * ks : 0;
      ctx.beginPath(); ctx.moveTo(kx - 6 * ks, ky - 42 * ks); ctx.lineTo(mx - 3, ky - (S.shoo > 0 ? 75 : 58) * ks + wave); ctx.moveTo(kx + 6 * ks, ky - 42 * ks); ctx.lineTo(mx - 3, ky - (turning ? 50 : 48) * ks); ctx.stroke();
      H.kidBack(ctx, kx, ky, ks, { shirt: '#3b6fc4', pants: '#4a3f35', skin: '#a8703f' });
      // compass inset (top view)
      const cr = Math.max(26, Math.min(T.w, T.h) * 0.1), ccx = T.x + cr + 16, ccy = T.y + cr + 24;
      ctx.fillStyle = 'rgba(18,13,22,0.78)'; ctx.beginPath(); ctx.arc(ccx, ccy, cr + 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(234,242,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.stroke();
      H.text(ctx, 'N', ccx, ccy - cr + 9, { font: 'osd', size: 13, color: '#ffb4a6' });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.fillStyle = 'rgba(234,242,255,0.4)'; ctx.fillRect(ccx + Math.cos(a) * (cr - 4) - 1, ccy + Math.sin(a) * (cr - 4) - 1, 2, 2); }
      const aA = S.theta - Math.PI / 2;
      ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ccx - Math.cos(aA) * cr * 0.5, ccy - Math.sin(aA) * cr * 0.5); ctx.lineTo(ccx + Math.cos(aA) * cr * 0.85, ccy + Math.sin(aA) * cr * 0.85); ctx.stroke();
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.arc(ccx + Math.cos(aA) * cr * 0.85, ccy + Math.sin(aA) * cr * 0.85, 3.5, 0, TAU); ctx.fill();
      H.text(ctx, 'ANTENNA', ccx, ccy + cr + 16, { font: 'osd', size: 14, color: '#eaf2ff', outline: 3, stroke: '#120d16' });
      if (S.gust > 0) H.text(ctx, S.gustDir > 0 ? 'HAWA ⟶' : '⟵ HAWA', T.x + T.w * 0.5, T.y + 22, { font: 'display', size: 22, color: '#eaf2ff', outline: 4, stroke: '#1b2a78' });
      ctx.restore();
      // panel divider
      ctx.fillStyle = '#1a1214';
      if (g.portrait) ctx.fillRect(0, V.y - 2, W, 4); else ctx.fillRect(V.x - 2, V.y, 4, V.h);
      // ---- the TV room
      ctx.save(); ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
      drawRoom(g, ctx, S, V);
      ctx.restore();
    }

    function drawCrow(ctx, x, y, s, fly, t) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s * 1.4, s * 1.4);
      ctx.fillStyle = '#1e1a22';
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, -0.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(8, -4, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#5a5560'; ctx.beginPath(); ctx.ellipse(-2, -1, 6, 3.5, -0.1, 0, TAU); ctx.fill(); // grey neck shawl (house crow)
      ctx.fillStyle = '#1e1a22'; ctx.beginPath(); ctx.moveTo(11, -5); ctx.lineTo(16, -3); ctx.lineTo(11, -2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-15, 3); ctx.lineTo(-8, 3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, -5, 0.9, 0, TAU); ctx.fill();
      if (fly) { const f = Math.sin(t * 22) * 8; ctx.fillStyle = '#1e1a22'; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-6, -10 - f); ctx.lineTo(4, -3); ctx.fill(); }
      else { ctx.strokeStyle = '#1e1a22'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1, 4); ctx.lineTo(-1, 7); ctx.moveTo(2, 4); ctx.lineTo(2, 7); ctx.stroke(); }
      ctx.restore();
    }

    function drawRoom(g, ctx, S, V) {
      // TV cabinet
      const tvW = Math.min(V.w * 0.52, V.h * 0.7), tvH = tvW * 0.82;
      const tx = V.x + V.w * 0.42 - tvW / 2, ty = V.y + V.h * 0.86 - tvH - V.h * 0.04;
      // stand
      ctx.fillStyle = '#5a3a24'; ctx.fillRect(tx - tvW * 0.08, ty + tvH, tvW * 1.16, V.h * 0.04);
      // shutters open
      ctx.fillStyle = '#7a4e2e';
      ctx.fillRect(tx - tvW * 0.2, ty - tvH * 0.05, tvW * 0.16, tvH * 1.05); ctx.fillRect(tx + tvW * 1.04, ty - tvH * 0.05, tvW * 0.16, tvH * 1.05);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(tx - tvW * 0.2 + 4, ty, 2, tvH * 0.9); ctx.fillRect(tx + tvW * 1.04 + tvW * 0.16 - 6, ty, 2, tvH * 0.9);
      // body
      const gr = ctx.createLinearGradient(tx, ty, tx, ty + tvH);
      gr.addColorStop(0, '#8a5a34'); gr.addColorStop(1, '#5e3a20');
      ctx.fillStyle = gr; H.rr(ctx, tx, ty, tvW, tvH, 8); ctx.fill();
      ctx.strokeStyle = '#3a2412'; ctx.lineWidth = 2; ctx.stroke();
      // lace cover on top
      ctx.fillStyle = '#f4efe2';
      ctx.beginPath(); ctx.moveTo(tx + tvW * 0.1, ty); ctx.lineTo(tx + tvW * 0.9, ty);
      for (let i = 0; i <= 10; i++) { const x = tx + tvW * (0.9 - i * 0.08); ctx.lineTo(x, ty + 8 + (i % 2) * 5); }
      ctx.closePath(); ctx.fill();
      // screen (4:3, curved)
      const sw = tvW * 0.72, sh = sw * 0.75, sx = tx + tvW * 0.06, sy = ty + (tvH - sh) / 2;
      ctx.save(); H.rr(ctx, sx, sy, sw, sh, sw * 0.08); ctx.clip();
      drawPicture(g, ctx, S, sx, sy, sw, sh);
      ctx.restore();
      ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 3; H.rr(ctx, sx, sy, sw, sh, sw * 0.08); ctx.stroke();
      // knobs + speaker grille
      const kx = sx + sw + (tvW - sw - tvW * 0.06) / 2;
      for (let i = 0; i < 2; i++) { ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(kx, sy + sh * (0.18 + i * 0.25), tvW * 0.04, 0, TAU); ctx.fill(); ctx.fillStyle = '#c8c0b0'; ctx.fillRect(kx - 1, sy + sh * (0.18 + i * 0.25) - tvW * 0.035, 2, tvW * 0.03); }
      ctx.fillStyle = 'rgba(30,20,10,0.5)';
      for (let i = 0; i < 6; i++) ctx.fillRect(kx - tvW * 0.05, sy + sh * 0.62 + i * sh * 0.05, tvW * 0.1, sh * 0.025);
      // the booster box on top with its needle meter (shows the signal)
      const bw = tvW * 0.34, bh = bw * 0.42, bx = tx + tvW * 0.06, by = ty - bh - 2;
      ctx.fillStyle = '#d9d2c4'; H.rr(ctx, bx, by, bw, bh, 4); ctx.fill(); ctx.strokeStyle = '#6a6458'; ctx.lineWidth = 1.5; ctx.stroke();
      const mx = bx + bw * 0.36, my = by + bh * 0.88, mr = bh * 0.7;
      ctx.fillStyle = '#fff8e6'; ctx.beginPath(); ctx.arc(mx, my, mr, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = '#6fbf5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my, mr * 0.82, Math.PI + Math.PI * LOCK_Q, TAU); ctx.stroke();
      ctx.strokeStyle = '#e2483a'; ctx.beginPath(); ctx.arc(mx, my, mr * 0.82, Math.PI, Math.PI + Math.PI * 0.3); ctx.stroke();
      const na = Math.PI + Math.PI * U.clamp(S.Qs + Math.sin(S.time * 23) * 0.012, 0, 1);
      ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(na) * mr * 0.92, my + Math.sin(na) * mr * 0.92); ctx.stroke();
      ctx.fillStyle = S.Qs >= LOCK_Q ? '#6fff5a' : '#5a2a2a'; ctx.beginPath(); ctx.arc(bx + bw * 0.82, by + bh * 0.5, bh * 0.12, 0, TAU); ctx.fill();
      H.text(ctx, 'BOOSTER', bx + bw * 0.82, by + bh * 0.84, { font: 'osd', size: Math.max(9, bh * 0.22), color: '#4a4438' });
      // lock bar under the TV
      const lw = tvW, lx = tx, ly = ty + tvH + V.h * 0.05;
      ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, lx, ly, lw, 14, 7); ctx.fill();
      ctx.fillStyle = '#6fbf5a'; H.rr(ctx, lx + 2, ly + 2, Math.max(0, (lw - 4) * S.lock), 10, 5); ctx.fill();
      H.text(ctx, S.lock >= 1 ? 'LOCKED!' : 'HOLD IT: ' + Math.round(S.lock * 100) + '%', lx + lw / 2, ly + 7, { font: 'osd', size: 14, color: '#fff', outline: 3, stroke: '#120d16' });
      // wall clock: 10:59 -> 11:00
      const cr = Math.min(V.w, V.h) * 0.075, ccx = V.x + V.w * 0.07 + Math.min(V.w * 0.14, 70) + cr + 14, ccy = V.y + V.h * 0.1 + cr;
      ctx.fillStyle = '#f4efe2'; ctx.beginPath(); ctx.arc(ccx, ccy, cr, 0, TAU); ctx.fill(); ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 3; ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.fillStyle = '#3a2a24'; ctx.fillRect(ccx + Math.cos(a) * cr * 0.8 - 1, ccy + Math.sin(a) * cr * 0.8 - 1, 2, 2); }
      const secs = 60 - Math.max(0, S.left) * (60 / S.limit);
      const mA = -Math.PI / 2 + ((59 + secs / 60) / 60) * TAU, hA = -Math.PI / 2 + ((10 + (59 + secs / 60) / 60) / 12) * TAU, sA = -Math.PI / 2 + (secs / 60) * TAU;
      ctx.strokeStyle = '#1a1214'; ctx.lineCap = 'round';
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(ccx + Math.cos(hA) * cr * 0.5, ccy + Math.sin(hA) * cr * 0.5); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(ccx + Math.cos(mA) * cr * 0.75, ccy + Math.sin(mA) * cr * 0.75); ctx.stroke();
      ctx.strokeStyle = '#d8402a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(ccx + Math.cos(sA) * cr * 0.85, ccy + Math.sin(sA) * cr * 0.85); ctx.stroke();
      // Amma, by the TV, shouting up the stairs
      const ax = Math.min(tx + tvW + tvW * 0.42, V.x + V.w - 26), ay = V.y + V.h * 0.86;
      const as = Math.max(0.7, V.h * 0.0042);
      if (S.caller === 'babji') drawBabji(ctx, ax, ay, as, S.amma && S.amma.mood, S.time); else drawAmma(ctx, ax, ay, as, S.amma && S.amma.mood, S.time);
      if (S.amma && S.amma.t < 3.2) {
        ctx.font = H.font('body', Math.max(13, Math.min(18, V.w * 0.035)), 700);
        const maxW = Math.min(V.w * 0.62, 260);
        const lines = H.wrap(ctx, S.amma.text, maxW - 20);
        const lh = Math.max(16, Math.min(22, V.w * 0.042));
        const bw = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24), bh = lines.length * lh + 14;
        const bx = Math.max(V.x + 8, Math.min(V.x + V.w - bw - 8, ax - bw * 0.6)), by = Math.max(V.y + 8, Math.min(ay - 92 * as - bh, ty - bh - 16));
        const pop = Math.min(1, S.amma.t / 0.15);
        ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2); ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop); ctx.translate(-bx - bw / 2, -by - bh / 2);
        ctx.fillStyle = S.amma.mood === 'happy' ? '#eaffd8' : S.amma.mood === 'cross' ? '#ffe2da' : '#fff8e6';
        H.rr(ctx, bx, by, bw, bh, 10); ctx.fill(); ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + bw * 0.7, by + bh); ctx.lineTo(bx + bw * 0.78, by + bh + 12); ctx.lineTo(bx + bw * 0.82, by + bh); ctx.fill();
        lines.forEach((l, i) => H.text(ctx, l, bx + bw / 2, by + 7 + lh * (i + 0.5), { font: 'body', weight: 700, size: Math.max(13, Math.min(18, V.w * 0.035)), color: '#1a1214' }));
        ctx.restore();
      }
    }

    function drawAmma(ctx, x, y, s, mood, t) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 4, 0, 0, TAU); ctx.fill();
      // saree
      ctx.fillStyle = '#2a8c82';
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-10, -50); ctx.lineTo(10, -50); ctx.lineTo(15, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c230'; ctx.fillRect(-14, -5, 29, 4);
      ctx.fillStyle = '#d8402a'; H.rr(ctx, -10, -66, 20, 18, 4); ctx.fill(); // blouse
      ctx.fillStyle = '#2a8c82'; ctx.beginPath(); ctx.moveTo(-10, -66); ctx.lineTo(4, -66); ctx.lineTo(10, -40); ctx.lineTo(-2, -40); ctx.fill(); // pallu
      ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(0, -75, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -77, 8.3, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); ctx.beginPath(); ctx.arc(7, -74, 4, 0, TAU); ctx.fill(); // bun
      ctx.fillStyle = '#b22b2b'; ctx.beginPath(); ctx.arc(-1, -77, 1.2, 0, TAU); ctx.fill(); // bindi
      ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      if (mood === 'happy') { ctx.beginPath(); ctx.moveTo(-8, -62); ctx.lineTo(-14, -80 + Math.sin(t * 12) * 3); ctx.moveTo(8, -62); ctx.lineTo(14, -80 - Math.sin(t * 12) * 3); ctx.stroke(); }
      else if (mood === 'cross') { ctx.beginPath(); ctx.moveTo(-8, -62); ctx.lineTo(-14, -52); ctx.lineTo(-8, -48); ctx.moveTo(8, -62); ctx.lineTo(10, -84); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(-8, -62); ctx.lineTo(-13, -45); ctx.moveTo(8, -62); ctx.lineTo(11, -82 + Math.sin(t * 4) * 2); ctx.stroke(); }
      ctx.restore();
    }

    function drawBabji(ctx, x, y, s, mood, t) { // Cable Babji: checked shirt, a coil of cable on the shoulder
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3b4a6b'; ctx.fillRect(-9, -34, 8, 34); ctx.fillRect(1, -34, 8, 34);
      ctx.fillStyle = '#c8402a'; H.rr(ctx, -12, -66, 24, 34, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; for (let i = -10; i < 12; i += 5) { ctx.beginPath(); ctx.moveTo(i, -66); ctx.lineTo(i, -33); ctx.stroke(); }
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(0, -75, 8.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -78, 8.8, Math.PI, TAU); ctx.fill(); ctx.fillRect(-5, -71, 10, 2);
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(-8, -58, 7, 10, 0.3, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(8, -62); ctx.lineTo(mood === 'happy' ? 14 : 11, mood === 'happy' ? -84 + Math.sin(t * 12) * 3 : -82); ctx.moveTo(-8, -62); ctx.lineTo(-12, -46); ctx.stroke();
      ctx.restore();
    }

    function drawPicture(g, ctx, S, x, y, w, h) {
      const Q = S.Qs, t = S.time;
      // the picture: before 11:00 a "next programme" card; after the lock, the show's title card
      const ghost = Q > 0.4 && Q < LOCK_Q ? (LOCK_Q - Q) * 14 : 0;
      const roll = S.interf && S.interf.k === 'plane' ? Math.sin(S.interf.t * 9) * h * 0.06 : 0;
      for (let pass = ghost > 0 ? 0 : 1; pass < 2; pass++) {
        ctx.save();
        if (pass === 0) { ctx.globalAlpha = 0.3; ctx.translate(ghost, 0); }
        ctx.translate(0, roll);
        card(ctx, S, x, y, w, h, t, g);
        ctx.restore();
      }
      // colour drains out with a weak signal
      if (Q < 0.85) { ctx.fillStyle = 'rgba(120,120,120,' + (0.85 - Q) * 0.7 + ')'; ctx.fillRect(x, y, w, h); }
      // snow
      const tile = H.noiseTile(128, 1 + (Math.floor(t * 30) % 4));
      const na = U.clamp(1.05 - Q * 1.15, 0, 1) * (S.interf && S.interf.k === 'mixer' ? 1 : 1);
      if (na > 0.02 || S.interf) {
        ctx.globalAlpha = Math.min(1, na + (S.interf && S.interf.k === 'mixer' ? 0.35 : 0));
        const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
        ctx.save(); ctx.translate(x - ox, y - oy);
        const sc = Math.max(1.5, w / 160);
        ctx.scale(sc, sc);
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, (w + 256) / sc, (h + 256) / sc);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      // tearing bars
      if (Q < 0.7) {
        const n = Math.round((0.7 - Q) * 10);
        for (let i = 0; i < n; i++) { const yy = y + Math.random() * h; ctx.fillStyle = 'rgba(255,255,255,' + (0.1 + Math.random() * 0.2) + ')'; ctx.fillRect(x, yy, w, 1 + Math.random() * 4); }
      }
      // scanlines + glass curve highlight
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = y; yy < y + h; yy += 3) ctx.fillRect(x, yy, w, 1);
      const gr = ctx.createRadialGradient(x + w * 0.3, y + h * 0.25, 0, x + w * 0.5, y + h * 0.5, w * 0.75);
      gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    }
    function card(ctx, S, x, y, w, h, t, g) {
      if (S.locked || g.over && S.lock >= 1) {
        // the show: an original Sunday superhero title card (fictional)
        let gr = ctx.createRadialGradient(x + w / 2, y + h * 0.55, 0, x + w / 2, y + h * 0.55, w * 0.8);
        gr.addColorStop(0, '#ffe14a'); gr.addColorStop(0.5, '#ff7a2a'); gr.addColorStop(1, '#b22b2b');
        ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
        ctx.save(); ctx.translate(x + w / 2, y + h * 0.55);
        for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, -w * 0.12); ctx.lineTo(w, w * 0.12); ctx.fill(); }
        ctx.restore();
        // caped kid silhouette leaping
        const cx = x + w / 2, cy = y + h * 0.58 - Math.abs(Math.sin(t * 3)) * h * 0.05, s = h * 0.012;
        ctx.fillStyle = '#b22b2b'; ctx.beginPath(); ctx.moveTo(cx - 4 * s, cy - 10 * s); ctx.quadraticCurveTo(cx - 22 * s, cy + 4 * s, cx - 18 * s, cy + 16 * s); ctx.lineTo(cx + 2 * s, cy + 2 * s); ctx.fill();
        ctx.fillStyle = '#1a1214'; ctx.beginPath(); ctx.arc(cx, cy - 16 * s, 5 * s, 0, TAU); ctx.fill();
        ctx.fillRect(cx - 4 * s, cy - 11 * s, 8 * s, 14 * s);
        ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 3.5 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx, cy - 8 * s); ctx.lineTo(cx + 10 * s, cy - 22 * s); ctx.moveTo(cx - 2 * s, cy + 2 * s); ctx.lineTo(cx - 8 * s, cy + 14 * s); ctx.moveTo(cx + 2 * s, cy + 2 * s); ctx.lineTo(cx + 9 * s, cy + 10 * s); ctx.stroke();
        H.text(ctx, 'TOOFAN KID', x + w / 2, y + h * 0.2, { font: 'display', size: h * 0.17, color: '#fff6c8', outline: Math.max(3, h * 0.025), stroke: '#1a1214' });
        H.text(ctx, 'EPISODE 47', x + w / 2, y + h * 0.88, { font: 'osd', size: h * 0.09, color: '#1a1214' });
        return;
      }
      // "next programme" card: colour bars + text
      const bars = ['#efefef', '#e8e23a', '#3ad8e0', '#3ae04a', '#e03ad8', '#e0403a', '#3a4ae0'];
      const bw = w / bars.length;
      bars.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + i * bw, y, bw + 1, h * 0.62); });
      ctx.fillStyle = '#1a1a40'; ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
      H.text(ctx, 'NEXT: TOOFAN KID', x + w / 2, y + h * 0.74, { font: 'osd', size: h * 0.1, color: '#fff' });
      H.text(ctx, 'SUNDAY 11:00 AM', x + w / 2, y + h * 0.88, { font: 'osd', size: h * 0.085, color: '#ffd84a' });
    }

    MG.register(def);
  }

  /* =============================================================== PANIPURI */
  // Gokul Chat, Koti. Bhaiya fills puris and drops them in your dona, faster and faster. Eat each one
  // while it's crunchy (green ring). Red ones are TEEKHA: double points but they fire up your spice
  // meter; say "NAKKO" to skip them. Brown meetha ones cool you down. Two puris piled up already?
  // The oldest goes soggy and breaks.
  {
    // systems_design §8.6: a puri every 1.6 - 0.6*d s (and bhaiya speeds up as you go), teekha +34
    // spice, meetha -25, spice falls 6/s, 100 = "PAANI!" (a miss, reset to 50), 3 misses = out
    const T = (MG.TUNE.panipuri = Object.assign({ base: 1.6, perD: 0.6, speedUp: 0.3, minGap: 0.62, teekha: 34, meetha: -25, normal: 6, fall: 6, reset: 50, misses: 3, crunch: 0.62, life: 1.55, target0: 18, target1: 12 }, MG.TUNE.panipuri || {}));
    const TYPES = {
      normal: { fill: '#5fa04a', spice: T.normal, pts: 10, label: '' },
      teekha: { fill: '#d8402a', spice: T.teekha, pts: 22, label: 'TEEKHA' },
      meetha: { fill: '#8a4a24', spice: T.meetha, pts: 8, label: 'MEETHA' },
      sukha: { fill: '#f2c230', spice: 0, pts: 60, label: 'SUKHA!' },
    };
    const def = {
      id: 'panipuri',
      title: 'Pani Puri Challenge',
      sub: 'Gokul Chat, Koti. "Teekha ya meetha? Ek extra phokat!"',
      osd: 'GOKUL CHAT · KOTI',
      place: 'gokul_chat', places: ['gokul_chat'],
      secs: 45,
      goLabel: 'KHAAO!',
      keys: { Space: 'eat', ArrowUp: 'eat', KeyW: 'eat', Enter: 'eat', KeyE: 'eat', ArrowDown: 'skip', KeyS: 'skip', KeyN: 'skip', KeyX: 'skip' },
      buttons: () => [{ a: 'skip', label: 'NAKKO', sub: 'SKIP', cls: 'red' }, { gap: true, w: 0.2 }, { a: 'eat', label: 'KHAAO!', sub: 'EAT', cls: 'big' }],
      keyHint: () => '<kbd>Space</kbd>/<kbd>↑</kbd> eat (or click the puri) &nbsp; <kbd>↓</kbd>/<kbd>S</kbd> nakko (skip)',
      howto(g) {
        return {
          lines: [
            'Bhaiya drops puris in your dona. <b>Eat</b> each one while its ring is <b>green</b> for a crunch. Leave it too long and it goes soggy and breaks.',
            '<b style="color:#d8402a">Red = teekha</b>: double points, but your spice meter shoots up. Say <b>NAKKO</b> to skip it. <b style="color:#8a4a24">Brown = meetha</b> cools you down.',
            'Spice meter full = <i>"PAANI! PAANI!"</i> and a miss. 3 misses and you\'re out.',
          ],
          goal: 'EAT ' + target(g) + ' PURIS &middot; 3 MISSES ALLOWED',
          keys: '<kbd>Space</kbd> eat &nbsp;·&nbsp; <kbd>↓</kbd> nakko',
          touch: '<b>KHAAO!</b> (or tap the puri) to eat · <b>NAKKO</b> to skip a teekha one',
        };
      },
      setup(g) {
        const S = g.S;
        S.score = 0; S.eaten = 0; S.target = target(g); S.misses = 0; S.spice = 0; S.combo = 0; S.bestCombo = 0; S.crunches = 0; S.teekhaEaten = 0;
        S.dona = []; S.fly = null; S.serveIn = 0.9; S.served = 0; S.time = 0;
        S.face = { chew: 0, red: 0, gasp: 0 };
        S.bh = { arm: 0, pot: 'normal', say: null, sayT: 0 };
        S.water = 0; S.end = null;
      },
      layout(g) { g.S.bgKey = null; lay(g, g.S); },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) S.time += dt; },
      pointer(g, type, x, y) {
        if (type !== 'down') return;
        const S = g.S;
        if (S.L && Math.hypot(x - S.L.donaX, y - S.L.donaY) < S.L.donaR * 1.6) { g.press('eat', 'ptr'); g.release('eat', 'ptr'); }
      },
      bot(g, dt, want) {
        const S = g.S, p = S.dona[0];
        if (!p) return;
        S.botT = (S.botT || 0) - dt;
        if (S.botT > 0) return;
        if (want === 'lose') { if (p.type === 'teekha') { g.botPress('eat'); S.botT = 0.1; } return; }
        if (p.age / p.life < 0.12) return;
        if (p.type === 'teekha' && S.spice > 52) g.botPress('skip'); else g.botPress('eat');
        S.botT = 0.12;
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'PURI', v: S.eaten + '/' + S.target, good: S.eaten > 0 }, { k: 'TEEKHA', v: Math.round(S.spice) + '%', warn: S.spice > 75 }, { k: 'MISS', v: S.misses + '/3', warn: S.misses === 2 }];
      },
      draw(g, ctx) { drawChat(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? 'Ek extra phokat!' : 'Bas, bhaiya, bas!',
          line: r.win ? 'Bhaiya drops a free sukha puri in your dona. The whole queue claps.' : 'Your eyes are watering and the kulfi wala is laughing. Try again?',
          rows: [['Puris eaten', S.eaten + ' / ' + S.target], ['Crunchy', S.crunches], ['Teekha survived', S.teekhaEaten], ['Best combo', 'x' + S.bestCombo], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.misses === 0 ? 1 : 0) + (S.crunches >= S.eaten * 0.75 ? 1 : 0) : 0; },
    };
    function target(g) { return g.params.target || Math.round(T.target0 + g.diff * T.target1); }

    function bhaiyaSay(S, t) { S.bh.say = t; S.bh.sayT = 1.6; }

    function serveType(g, S) {
      const r = g.rng.next(), pt = 0.2 + g.diff * 0.12, pm = 0.14;
      if (S.served > 2 && r < pt) return 'teekha';
      if (r < pt + pm && S.served > 4) return 'meetha';
      if (S.served > 6 && g.rng.next() < 0.05) return 'sukha';
      return 'normal';
    }
    function interval(g, S) { const prog = S.eaten / S.target; return Math.max(T.minGap, (T.base - T.perD * g.diff) * (1 - T.speedUp * prog)); }

    function miss(g, S, why) {
      S.misses++; S.combo = 0;
      g.shake(5); g.tone(160, 0.15, { type: 'triangle', vol: 0.06 });
      if (S.misses >= T.misses && !g.over) g.finish(false, { eaten: S.eaten, reason: why, delay: 1.4 });
    }

    function step(g, S, dt) {
      S.time += dt;
      const L = S.L;
      if (S.bh.sayT > 0) S.bh.sayT -= dt;
      S.face.chew = Math.max(0, S.face.chew - dt); S.face.gasp = Math.max(0, S.face.gasp - dt);
      S.water = Math.max(0, S.water - dt);
      S.spice = Math.max(0, S.spice - dt * (S.water > 0 ? 30 : T.fall));
      S.face.red += (S.spice / 100 - S.face.red) * Math.min(1, dt * 4);
      // serving
      if (!g.over) {
        S.serveIn -= dt;
        if (!S.fly && S.serveIn <= 0.45 && !S.bh.dipping) { S.bh.dipping = true; S.bh.pot = serveType(g, S); S.bh.arm = 0; }
        if (S.bh.dipping) S.bh.arm = Math.min(1, S.bh.arm + dt / 0.45);
        if (S.serveIn <= 0) {
          const type = S.bh.pot;
          S.fly = { type, t: 0 };
          S.bh.dipping = false; S.bh.arm = 1;
          S.served++;
          S.serveIn = interval(g, S);
          if (type === 'teekha' && g.rng.next() < 0.35) bhaiyaSay(S, 'Teekha hai, sambhalo!');
          else if (S.served % 7 === 0) bhaiyaSay(S, ['Aur ek!', 'Jaldi khao!', 'Chalo chalo!', 'Bas itna hi?'][(S.served / 7) % 4 | 0]);
        }
      }
      S.bh.arm = Math.max(0, S.bh.arm - (S.bh.dipping ? 0 : dt * 2.5));
      if (S.fly) {
        S.fly.t += dt / 0.32;
        if (S.fly.t >= 1) {
          const life = interval(g, S) * T.life * (g.assist ? 1.3 : 1);
          S.dona.push({ type: S.fly.type, age: 0, life, wob: Math.random() * TAU });
          S.fly = null;
          g.tone(420, 0.03, { type: 'sine', vol: 0.03 });
          if (S.dona.length > 2) { const old = S.dona.shift(); breakPuri(g, S, old); }
        }
      }
      // ageing in the dona
      for (let i = S.dona.length - 1; i >= 0; i--) {
        const p = S.dona[i];
        p.age += dt;
        if (p.age >= p.life) { S.dona.splice(i, 1); breakPuri(g, S, p); }
      }
      if (g.over) return;
      // eat / skip
      if (g.pressed('eat')) {
        const p = S.dona.shift();
        if (p) eat(g, S, p);
        else { S.face.chew = 0.15; }
      } else if (g.pressed('skip')) {
        const p = S.dona.shift();
        if (p) {
          if (p.type === 'teekha') { bhaiyaSay(S, 'Theek hai, teekha kam!'); g.pop('NAKKO!', L.donaX, L.donaY - L.donaR * 1.6, { size: 24, color: '#ffd84a' }); g.tone(600, 0.06, { type: 'triangle', vol: 0.04 }); }
          else { S.combo = 0; bhaiyaSay(S, 'Kya hua? Accha nahi?'); g.pop('skip', L.donaX, L.donaY - L.donaR * 1.6, { size: 18, color: '#eaf2ff', font: 'body' }); }
        }
      }
    }
    function breakPuri(g, S, p) {
      const L = S.L;
      g.burst(L.donaX, L.donaY - L.donaR * 0.3, 14, { colors: ['#e2b25a', '#c88a30', TYPES[p.type].fill], speed: 140, grav: 400, life: 0.7, size: 3.5 });
      g.pop('PHOOT GAYI!', L.donaX, L.donaY - L.donaR * 1.8, { size: 24, color: '#ff8a7a' });
      g.noise(0.12, { f: 2400, vol: 0.05 });
      miss(g, S, 'soggy');
    }
    function eat(g, S, p) {
      const T = TYPES[p.type], L = S.L;
      const fresh = p.age / p.life;
      const crunch = fresh < T.crunch * (g.assist ? 1.2 : 1);
      S.eaten++;
      S.face.chew = 0.45;
      if (crunch) { S.combo++; S.crunches++; } else S.combo = 0;
      S.bestCombo = Math.max(S.bestCombo, S.combo);
      const mult = 1 + Math.min(10, S.combo) * 0.15;
      const pts = Math.round((crunch ? T.pts : T.pts * 0.4) * mult);
      S.score += pts;
      S.spice = Math.max(0, S.spice + T.spice);
      if (p.type === 'teekha') { S.teekhaEaten++; S.face.gasp = 0.8; }
      g.sfx('munch', { vol: 0.8 });
      g.noise(0.06, { f: crunch ? 3200 : 1200, vol: crunch ? 0.08 : 0.04 });
      g.burst(L.donaX, L.donaY - L.donaR * 0.4, crunch ? 12 : 5, { colors: ['#e2b25a', '#f2d08a', T.fill], speed: crunch ? 180 : 80, grav: 380, life: 0.6, size: 3 });
      const txt = p.type === 'sukha' ? 'SUKHA! +' + pts : crunch ? (S.combo >= 3 ? 'CRUNCH x' + S.combo : 'CRUNCH!') : 'soggy...';
      g.pop(txt, L.donaX + (Math.random() - 0.5) * 30, L.donaY - L.donaR * 1.7, { size: crunch ? 26 : 19, color: p.type === 'teekha' ? '#ff6a4a' : crunch ? '#ffd84a' : '#d8d0c0', font: crunch ? 'display' : 'body' });
      if (S.spice >= 100) {
        S.spice = T.reset; S.water = 1.6; S.face.gasp = 1.6;
        g.pop('PAANI! PAANI!', g.W / 2, L.faceY - L.faceR * 1.6, { size: 34, color: '#7ac8ff', life: 1.6 });
        g.flash('#ff3a2a', 0.35); g.sfx('sip', { delay: 0.3 });
        bhaiyaSay(S, 'Arre, paani do isko!');
        miss(g, S, 'spice');
      }
      if (S.eaten >= S.target && !g.over) {
        S.score += 100 + (3 - S.misses) * 80;
        bhaiyaSay(S, 'Ek extra phokat!');
        S.fly = { type: 'sukha', t: 0 };
        g.finish(true, { eaten: S.eaten, crunches: S.crunches, bestCombo: S.bestCombo, delay: 1.6 });
      }
    }

    /* ------------------------------------------------------------- drawing */
    function lay(g, S) {
      const A = g.area, W = g.W, P = g.portrait;
      const L = (S.L = {});
      L.cy = A.y + A.h * (P ? 0.46 : A.h < 420 ? 0.57 : 0.5); // counter top line
      L.sh = Math.max(40, Math.min(70, A.h * 0.085)); // signboard height
      const signBottom = A.y + 10 + L.sh;
      L.bhX = W * (P ? 0.5 : 0.42); L.bhY = L.cy; L.bhS = Math.max(0.5, Math.min((L.cy - signBottom - 6) / 132, W * 0.0042));
      L.donaX = W * (P ? 0.45 : 0.5); L.donaY = A.y + A.h * (P ? 0.8 : 0.83); L.donaR = Math.min(W * 0.15, A.h * (P ? 0.08 : 0.14));
      L.faceX = W * (P ? 0.82 : 0.8); L.faceY = A.y + A.h * (P ? 0.74 : 0.76); L.faceR = Math.min(W * 0.11, A.h * (P ? 0.065 : 0.12));
      L.potX = W * (P ? 0.78 : 0.68); L.redX = W * (P ? 0.92 : 0.79); L.sweetX = W * (P ? 0.64 : 0.58); L.boxX = W * (P ? 0.17 : 0.22);
      return L;
    }
    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, A = g.area;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + A.h;
      const L = lay(g, S);
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      // back wall: warm yellow distemper + a tube light
      let gr = c.createLinearGradient(0, 0, 0, L.cy);
      gr.addColorStop(0, '#e9c46a'); gr.addColorStop(1, '#d9a94a');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      // signboard
      const sw = Math.min(W * 0.86, 520), sh = L.sh;
      H.sign(c, (W - sw) / 2, A.y + 10, sw, sh, { fill: '#b22b2b', edge: '#1a1214', text: 'GOKUL CHAT', color: '#ffd84a', size: sh * 0.62, inner: 'rgba(255,216,74,0.6)' });
      // tube light
      const ty = A.y + 18 + sh;
      c.fillStyle = 'rgba(255,255,240,0.95)'; H.rr(c, W * 0.3, ty + 6, W * 0.4, 6, 3); c.fill();
      gr = c.createRadialGradient(W / 2, ty + 9, 0, W / 2, ty + 9, W * 0.5); gr.addColorStop(0, 'rgba(255,255,240,0.35)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
      c.fillStyle = gr; c.fillRect(0, ty - W * 0.2, W, W * 0.6);
      // menu board (prices of the day)
      const mw = Math.min(W * 0.3, 180, Math.max(90, (L.cy - ty - 30) / 0.9)), mh = mw * 0.9, mx = g.portrait ? W - mw - 10 : W - mw - 24, my = ty + 20;
      c.fillStyle = '#2a3a2a'; H.rr(c, mx, my, mw, mh, 4); c.fill(); c.strokeStyle = '#7a5a30'; c.lineWidth = 4; c.stroke();
      const items = [['PANI PURI', '5'], ['SAMOSA RAGDA', '8'], ['BHEL', '6'], ['DAHI PURI', '8'], ['KULFI', '5']];
      items.forEach(([n, p], i) => {
        const yy = my + mh * (0.16 + i * 0.17), fs = Math.max(9, mw * 0.075);
        H.text(c, n, mx + 8, yy, { font: 'osd', size: fs * 1.2, color: '#f4efe2', align: 'left', maxW: mw * 0.66 });
        H.text(c, 'Rs ' + p, mx + mw - 8, yy, { font: 'osd', size: fs * 1.2, color: '#ffd84a', align: 'right', maxW: mw * 0.26 });
      });
      // steel shelves with jars (left)
      const shx = 10, shy = ty + 24, shw = Math.min(W * 0.28, 170);
      for (let i = 0; i < (L.cy - ty > 150 ? 2 : 0); i++) {
        const yy = shy + i * mh * 0.5;
        c.fillStyle = '#a8b0b8'; c.fillRect(shx, yy + mh * 0.38, shw, 4);
        for (let j = 0; j < 4; j++) { c.fillStyle = ['#f2c230', '#d8402a', '#e2b25a', '#8a4a24'][(i + j) % 4]; H.rr(c, shx + 6 + j * shw * 0.24, yy + mh * 0.12, shw * 0.18, mh * 0.26, 4); c.fill(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(shx + 9 + j * shw * 0.24, yy + mh * 0.15, 3, mh * 0.18); }
      }
      // the queue of customers (soft silhouettes) behind, at the sides
      for (let i = 0; i < 5; i++) {
        const x = (i < 2 ? W * 0.04 + i * W * 0.09 : W * 0.62 + (i - 2) * W * 0.12), y = L.cy;
        c.fillStyle = 'rgba(90,60,50,0.25)'; c.beginPath(); c.arc(x, y - A.h * 0.14, A.h * 0.035, 0, TAU); c.fill(); H.rr(c, x - A.h * 0.045, y - A.h * 0.1, A.h * 0.09, A.h * 0.12, 10); c.fill();
      }
      // counter: steel top + front panel
      gr = c.createLinearGradient(0, L.cy, 0, L.cy + A.h * 0.05);
      gr.addColorStop(0, '#e6eaee'); gr.addColorStop(0.5, '#b9c0c8'); gr.addColorStop(1, '#8a929a');
      c.fillStyle = gr; c.fillRect(0, L.cy, W, A.h * 0.05);
      c.fillStyle = '#6a3a24'; c.fillRect(0, L.cy + A.h * 0.05, W, Hh);
      c.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < W; x += 28) c.fillRect(x, L.cy + A.h * 0.05, 2, Hh);
      // glass box of puris on the counter
      const bw = Math.min(W * 0.26, 170, (L.cy - ty) * 1.1), bh = bw * 0.55, bx = L.boxX - bw / 2, by = L.cy - bh;
      c.fillStyle = 'rgba(220,240,255,0.25)'; c.fillRect(bx, by, bw, bh); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2; c.strokeRect(bx, by, bw, bh);
      const pr = bw * 0.065;
      for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) { const x = bx + pr * 1.5 + i * pr * 2.15 + (row % 2) * pr, y = by + bh - pr - row * pr * 1.6; if (x < bx + bw - pr) puri(c, x, y, pr, null); }
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(bx + 4, by + 4, bw * 0.15, bh - 8);
      // pots: green pani matka, red teekha jar, brown meetha bowl
      pot(c, L.potX, L.cy, Math.min(W * 0.08, A.h * 0.07), '#8a8f96', '#5fa04a');
      pot(c, L.redX, L.cy, Math.min(W * 0.055, A.h * 0.05), '#a8b0b8', '#d8402a');
      pot(c, L.sweetX, L.cy, Math.min(W * 0.05, A.h * 0.045), '#a8b0b8', '#8a4a24');
      H.text(c, 'TEEKHA', L.redX, L.cy + A.h * 0.035, { font: 'osd', size: Math.max(11, A.h * 0.022), color: '#ffd2c8', outline: 3 });
      H.text(c, 'MEETHA', L.sweetX, L.cy + A.h * 0.035, { font: 'osd', size: Math.max(11, A.h * 0.022), color: '#f4dcc0', outline: 3 });
    }
    function pot(c, x, y, r, metal, fill) {
      c.fillStyle = metal; c.beginPath(); c.ellipse(x, y - r * 0.6, r, r * 0.9, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - r * 0.4, y - r * 0.8, r * 0.18, r * 0.45, 0, 0, TAU); c.fill();
      c.fillStyle = H.shade(metal, 0.8); c.beginPath(); c.ellipse(x, y - r * 1.35, r * 0.75, r * 0.22, 0, 0, TAU); c.fill();
      c.fillStyle = fill; c.beginPath(); c.ellipse(x, y - r * 1.33, r * 0.65, r * 0.17, 0, 0, TAU); c.fill();
    }
    function puri(c, x, y, r, fill, alpha) {
      if (alpha != null) c.globalAlpha = alpha;
      const gr = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      gr.addColorStop(0, '#f6d690'); gr.addColorStop(0.7, '#d9a24a'); gr.addColorStop(1, '#b8782a');
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(120,70,20,0.35)'; for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; c.fillRect(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, r * 0.12, r * 0.1); }
      if (fill) {
        c.fillStyle = '#7a4a1a'; c.beginPath(); c.ellipse(x, y - r * 0.45, r * 0.42, r * 0.2, 0, 0, TAU); c.fill();
        c.fillStyle = fill; c.beginPath(); c.ellipse(x, y - r * 0.43, r * 0.34, r * 0.14, 0, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }

    function drawChat(g, ctx, S) {
      const W = g.W, Hh = g.H, A = g.area;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + A.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const L = S.L;
      drawBhaiya(ctx, S, L, g);
      // the dona (leaf bowl) held out by the kid
      const dx = L.donaX, dy = L.donaY, dr = L.donaR;
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = dr * 0.32; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(dx - dr * 0.2, Hh + 20); ctx.lineTo(dx - dr * 0.1, dy + dr * 0.35); ctx.stroke();
      ctx.fillStyle = '#a8703f'; ctx.beginPath(); ctx.ellipse(dx, dy + dr * 0.42, dr * 0.75, dr * 0.25, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4f7a3a'; ctx.beginPath(); ctx.ellipse(dx, dy + dr * 0.15, dr * 1.2, dr * 0.48, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#6a9a48'; ctx.beginPath(); ctx.ellipse(dx, dy, dr * 1.2, dr * 0.34, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,70,30,0.6)'; ctx.lineWidth = 1; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(dx + i * dr * 0.3, dy - dr * 0.3); ctx.lineTo(dx + i * dr * 0.38, dy + dr * 0.5); ctx.stroke(); }
      // puris in the dona with their freshness rings
      S.dona.forEach((p, i) => {
        const px = dx + (i - (S.dona.length - 1) / 2) * dr * 0.95, py = dy - dr * 0.22 + Math.sin(S.time * 3 + p.wob) * 1.2;
        const r = dr * 0.42, k = p.age / p.life;
        // ring
        ctx.lineWidth = Math.max(3, r * 0.16);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(px, py, r * 1.35, 0, TAU); ctx.stroke();
        ctx.strokeStyle = k < 0.62 ? '#6fdc5a' : k < 0.85 ? '#ffb43a' : '#ff4a3a';
        ctx.beginPath(); ctx.arc(px, py, r * 1.35, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k)); ctx.stroke();
        const soggy = Math.max(0, (k - 0.62) / 0.38);
        puri(ctx, px, py, r * (1 - soggy * 0.08), TYPES[p.type].fill);
        if (soggy > 0) { ctx.fillStyle = 'rgba(90,60,30,' + soggy * 0.45 + ')'; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); }
        if (p.type !== 'normal') H.text(ctx, TYPES[p.type].label, px, py - r * 2, { font: 'osd', size: Math.max(14, r * 0.55), color: p.type === 'teekha' ? '#ff6a4a' : p.type === 'meetha' ? '#e8b48a' : '#ffd84a', outline: 4 });
        if (i === 0 && p.type === 'teekha' && S.spice > 55) H.text(ctx, 'nakko?', px, py + r * 2.1, { font: 'body', weight: 700, size: Math.max(13, r * 0.42), color: '#fff', outline: 4, alpha: 0.6 + 0.4 * Math.sin(S.time * 8) });
      });
      // puri in flight from bhaiya's hand
      if (S.fly) {
        const h = handPos(S, L), t = H.ease.inOut(Math.min(1, S.fly.t));
        const x = lerp(h.x, dx, t), y = lerp(h.y, dy - dr * 0.25, t) - Math.sin(t * Math.PI) * L.donaR * 1.2;
        puri(ctx, x, y, dr * 0.42 * (0.8 + t * 0.2), TYPES[S.fly.type].fill);
      }
      drawFace(ctx, S, L, g);
      // spice meter (a thermometer-ish chilli bar by the face)
      const mw = Math.max(14, L.faceR * 0.28), mh = L.faceR * 2.6, mx = L.faceX - L.faceR - mw - 14, my = L.faceY - mh * 0.5;
      ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, mx - 3, my - 3, mw + 6, mh + 6, 6); ctx.fill();
      const lvl = Math.min(1, S.spice / 100);
      const gr = ctx.createLinearGradient(0, my + mh, 0, my);
      gr.addColorStop(0, '#ffd84a'); gr.addColorStop(0.6, '#ff7a2a'); gr.addColorStop(1, '#e2183a');
      ctx.fillStyle = gr; ctx.fillRect(mx, my + mh * (1 - lvl), mw, mh * lvl);
      H.text(ctx, 'MIRCHI', mx + mw / 2, my + mh + 12, { font: 'osd', size: 13, color: '#ffd2c8', outline: 3 });
      // red heat vignette
      if (S.spice > 60) {
        const a = (S.spice - 60) / 40 * 0.35 * (0.8 + 0.2 * Math.sin(S.time * 9));
        const v = ctx.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.35, W / 2, Hh / 2, Math.max(W, Hh) * 0.75);
        v.addColorStop(0, 'rgba(255,40,20,0)'); v.addColorStop(1, 'rgba(255,40,20,' + a + ')');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, Hh);
      }
      // chalk tally of puris eaten, on the counter front
      { const tx0 = g.portrait ? 18 : W * 0.06, ty0 = L.cy + A.h * 0.09, th = Math.max(14, A.h * 0.035), gap = th * 0.28;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < S.eaten; i++) {
          const grp = Math.floor(i / 5), k = i % 5, row = Math.floor(grp / 4), col = grp % 4;
          const bx = tx0 + col * (gap * 5 + th * 0.6), by = ty0 + row * (th + 8);
          ctx.beginPath();
          if (k < 4) { ctx.moveTo(bx + k * gap, by); ctx.lineTo(bx + k * gap + 1, by + th); }
          else { ctx.moveTo(bx - gap * 0.4, by + th * 0.8); ctx.lineTo(bx + gap * 3.4, by + th * 0.15); }
          ctx.stroke();
        }
        H.text(ctx, S.eaten + ' / ' + S.target, tx0, ty0 - 12, { font: 'osd', size: 18, color: 'rgba(255,255,255,0.8)', align: 'left' }); }
      // combo
      if (S.combo >= 2) H.text(ctx, 'COMBO x' + S.combo, L.donaX, L.donaY + L.donaR * 1.05, { font: 'osd', size: 20, color: '#ffd84a', outline: 4 });
    }
    function handPos(S, L) {
      const s = L.bhS, a = S.bh.arm;
      const pot = S.bh.pot === 'teekha' ? L.redX : S.bh.pot === 'meetha' ? L.sweetX : L.potX;
      return { x: lerp(L.bhX + 30 * s, pot, Math.sin(a * Math.PI * 0.5)), y: lerp(L.bhY - 40 * s, L.cy - 40 * s * 0.6, Math.sin(a * Math.PI)) };
    }
    function drawBhaiya(ctx, S, L, g) {
      const s = L.bhS, x = L.bhX, y = L.bhY;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      // body behind the counter: white kurta/banian
      ctx.fillStyle = '#f4efe2'; H.rr(ctx, -34, -86, 68, 90, 18); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(-2, -80, 4, 80);
      ctx.fillStyle = '#e9e2d2'; ctx.beginPath(); ctx.moveTo(-12, -86); ctx.lineTo(0, -70); ctx.lineTo(12, -86); ctx.fill();
      // head
      ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(0, -106, 21, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -112, 21.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = '#efe9dc'; ctx.beginPath(); ctx.arc(0, -118, 19, Math.PI, TAU); ctx.fill(); // white cap
      ctx.fillStyle = '#1a1412';
      ctx.beginPath(); ctx.arc(-7, -106, 2.5, 0, TAU); ctx.arc(7, -106, 2.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14, -96); ctx.quadraticCurveTo(0, -103, 14, -96); ctx.quadraticCurveTo(0, -92, -14, -96); ctx.fill(); // big moustache
      const talk = S.bh.sayT > 0 && Math.sin(S.time * 18) > 0;
      ctx.fillStyle = '#5a2a1a'; ctx.beginPath(); ctx.ellipse(0, -90, 4, talk ? 3 : 1.2, 0, 0, TAU); ctx.fill();
      // left arm resting by the puri box
      ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-30, -70); ctx.lineTo(-52, -20); ctx.stroke();
      ctx.restore();
      // the serving arm
      const h = handPos(S, L);
      ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 10 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 28 * s, y - 70 * s); ctx.quadraticCurveTo(x + 50 * s, y - 40 * s, h.x, h.y); ctx.stroke();
      if (S.bh.dipping || (S.fly && S.fly.t < 0.1)) puri(ctx, h.x, h.y - 4 * s, 9 * s, TYPES[S.bh.pot].fill);
      // speech
      if (S.bh.say && S.bh.sayT > 0) {
        ctx.font = H.font('body', Math.max(13, 15 * Math.min(1.4, s * 1.2)), 700);
        const tw = ctx.measureText(S.bh.say).width + 22, th = Math.max(26, 30 * Math.min(1.3, s));
        const bx = Math.min(g.W - tw - 8, Math.max(8, x - 30 * s - tw)), by = y - 150 * s;
        ctx.fillStyle = '#fff8e6'; H.rr(ctx, bx, by, tw, th, 10); ctx.fill(); ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 2; ctx.stroke();
        H.text(ctx, S.bh.say, bx + tw / 2, by + th / 2 + 1, { font: 'body', weight: 700, size: Math.max(13, 15 * Math.min(1.4, s * 1.2)), color: '#1a1214' });
      }
    }
    function drawFace(ctx, S, L, g) {
      const x = L.faceX, y = L.faceY, r = L.faceR, red = U.clamp(S.face.red, 0, 1);
      ctx.fillStyle = 'rgba(18,13,22,0.5)'; ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, TAU); ctx.fill();
      ctx.fillStyle = H.mix('#a8703f', '#e2382a', red * 0.85); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 1.02, Math.PI * 1.08, Math.PI * 1.92); ctx.fill();
      // eyes (water when spicy)
      const eyeY = y - r * 0.12;
      for (const sx of [-1, 1]) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x + sx * r * 0.35, eyeY, r * 0.17, S.face.gasp > 0 ? r * 0.2 : r * 0.13, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(x + sx * r * 0.35, eyeY + r * 0.02, r * 0.07, 0, TAU); ctx.fill();
        if (red > 0.45) { ctx.fillStyle = '#7ac8ff'; ctx.beginPath(); ctx.ellipse(x + sx * r * 0.42, eyeY + r * 0.25 + ((S.time * 40) % (r * 0.5)), r * 0.05, r * 0.09, 0, 0, TAU); ctx.fill(); }
      }
      // mouth: chewing / gasping
      ctx.fillStyle = '#5a1a1a';
      if (S.face.gasp > 0) { ctx.beginPath(); ctx.ellipse(x, y + r * 0.42, r * 0.22, r * 0.2, 0, 0, TAU); ctx.fill(); }
      else if (S.face.chew > 0) { const m = Math.abs(Math.sin(S.time * 22)) * r * 0.12 + r * 0.04; ctx.beginPath(); ctx.ellipse(x, y + r * 0.42, r * 0.2, m, 0, 0, TAU); ctx.fill(); ctx.fillStyle = H.mix('#a8703f', '#e2382a', red); ctx.beginPath(); ctx.arc(x - r * 0.55, y + r * 0.3, r * 0.14, 0, TAU); ctx.arc(x + r * 0.55, y + r * 0.3, r * 0.14, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = '#5a1a1a'; ctx.lineWidth = Math.max(2, r * 0.07); ctx.beginPath(); ctx.arc(x, y + r * 0.25, r * 0.25, 0.2, Math.PI - 0.2); ctx.stroke(); }
      // steam from the ears
      if (red > 0.6) {
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
          const k = ((S.time * 1.5 + i / 3) % 1);
          ctx.fillStyle = 'rgba(255,255,255,' + (1 - k) * 0.6 + ')';
          ctx.beginPath(); ctx.arc(x + sx * (r * 1.05 + k * r * 0.5), y - k * r * 0.9, r * (0.1 + k * 0.15), 0, TAU); ctx.fill();
        }
      }
      if (S.water > 0) { // steel glass of water
        const gx = x - r * 1.1, gy = y + r * 0.9;
        ctx.fillStyle = '#c8d0d8'; ctx.beginPath(); ctx.moveTo(gx - r * 0.25, gy - r * 0.6); ctx.lineTo(gx + r * 0.25, gy - r * 0.6); ctx.lineTo(gx + r * 0.2, gy); ctx.lineTo(gx - r * 0.2, gy); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(gx - r * 0.15, gy - r * 0.55, r * 0.06, r * 0.5);
      }
    }

    MG.register(def);
  }

  /* ================================================================ BARGAIN */
  // Mol-bhaav (systems_design §8.7). Haggle the seller down to the target price before his patience
  // (SABR) runs out. Pick a line (each seller likes one kind of talk, hinted by his first line), then
  // say it with confidence: press when the needle is in the green. Skins (params.who): auto, banana,
  // flower, kite (M1), farmer (M7), books (SA7); anything else falls back to 'auto'.
  {
    const T = (MG.TUNE.bargain = Object.assign({
      drain0: 2.2, drain1: 1.8,          // patience drain per second = drain0 + drain1 * d
      frac: 0.2, likedFrac: 0.45,        // share of (price - floor) a line cuts: any type / the liked type
      grade: { green: 1, yellow: 0.5, red: 0 }, redPatience: -10,
      walkNear: 2, walkFail: -38,        // JAATA HOON works within Rs 2 of his floor, else -38 patience
      speed0: 1.6, speed1: 1.4, zone0: 0.2, zone1: 0.07, // the confidence needle
    }, MG.TUNE.bargain || {}));
    const CATS = {
      logic: { name: 'LOGIC', col: '#3b6fc4', pat: -7 },
      charm: { name: 'PYAAR', col: '#e8487c', pat: 2 },
      local: { name: 'APNAPAN', col: '#2a8c82', pat: 3 },
      filmy: { name: 'FILMY', col: '#7a3db8', pat: -2 },
      walk: { name: 'JAATA HOON', col: '#5a5560', pat: 0 },
    };
    const TYPES = ['logic', 'charm', 'local', 'filmy'];
    // generic hints, used when params.randomType gives the seller a random taste
    const HINTS = {
      logic: 'Hisaab se baat karo, faltu nahi.',
      charm: 'Meethi baat karo toh sochenge.',
      local: 'Waise, kaunsi gali ke ho?',
      filmy: 'Kuch dialogue maaro, hero!',
    };
    const PLACE_SIGN = { koti_bus_stand: 'KOTI', rtc_x_roads: 'RTC X ROADS', nampally_station: 'NAMPALLY', kachiguda_station: 'KACHIGUDA', imlibun_bus_station: 'IMLIBUN' };
    const WHO = {
      auto: {
        title: 'Auto Mol-Bhaav', what: 'the ride', like: 'local',
        price: (p) => { const m = Math.max(4, Math.round(p.meter || p.target || 20)); return { start: m + 10, target: m, floor: m - 2 }; },
        ask: '{D}? ₹{P}. Meter nakko, das upar.', hint: 'Waise, kaunsi gali ke ho?',
        lines: {
          logic: ['Meter pe chalo na, anna.', 'Bus mein toh teen rupaye lagte!', 'Itna door bhi nahi hai, anna!', 'Kal meter se gaya tha.'],
          charm: ['Anna, aap toh apne hi ho!', 'Aap ka auto ekdum mast hai!', 'Thoda kam karo na, please!'],
          local: ['Mere mamu bhi Koti mein auto chalate!', 'Hum isi area ke hain, anna!', 'Hum roz isi stand se jaate.'],
          filmy: ['Anna, hero log seedha deal karte!', 'Picture ka time hai, jaldi aur sasta!'],
          walk: ['Chodo, doosra auto le lunga.', 'Rehne do, main bus se jaata.'],
        },
        good: ['Accha... ₹{P} de dena.', 'Apne log ho. Chalo, ₹{P}.', 'Hmm. Chalo, ₹{P}.'],
        meh: ['Petrol kitna mehenga hai, maloom? ₹{P}.', '₹{P}. Isse kam nahi.'],
        bad: ['Kya bolra baba? ₹{P} hi lagenge.', 'Time waste mat karo!'],
        walkWin: 'Arre ruko ruko! Chalo, ₹{P}!', walkLose: 'Jao jao! Bahut auto hai.',
        deal: 'Chalo, baitho! ₹{P}, meter nakko.', leave: 'Chal hatt! Mera time kharab kiya.',
      },
      banana: {
        title: 'Kele ka Mol-Bhaav', what: 'one dozen bananas', like: 'charm', unit: '/dozen',
        price: (p, r) => ({ start: ri(r, 15, 18), target: 10, floor: ri(r, 8, 11) }),
        ask: 'Chakkarakeli! ₹{P} darjan.', hint: 'Meethi baat karo, meethe kele lo!',
        lines: {
          logic: ['Rythu Bazaar mein ₹10 hai!', 'Ye toh chhote chhote hain!', 'Do darjan lunga, kam karo.'],
          charm: ['Amma bolti aap ke kele best hain!', 'Aap ke kele sabse meethe!', 'Aap ki muskaan bhi meethi, uncle!'],
          local: ['Hum roz aap se hi lete hain.', 'Main woh peeli building wala!'],
          filmy: ['Uncle, kele khaake hi hero bante!', 'Ek kela phokat, hero ke liye?'],
          walk: ['Chalo, aage wale se lete.', 'Rehne do, kal lunga.'],
        },
        good: ['Hehe, accha. ₹{P} de do.', 'Chalo, aap ke liye ₹{P}.'],
        meh: ['Mandi mein bhi mehenga hai, beta. ₹{P}.'],
        bad: ['Nahi hoga, ₹{P}.', 'Bhaav mat karo, beta!'],
        walkWin: 'Arre ruko! ₹{P}, le jao!', walkLose: 'Jao, aage wala bhi itna hi lega.',
        deal: 'Lo, ₹{P}. Ek extra bhi daal diya!', leave: 'Agla customer! Chalo, hato.',
      },
      flower: {
        title: 'Phoolon ka Mol-Bhaav', what: 'a jasmine and marigold garland', like: 'charm',
        price: (p, r) => ({ start: ri(r, 20, 24), target: 12, floor: ri(r, 10, 13) }),
        ask: 'Mallepoolu, genda! Haar ₹{P}.', hint: 'Dekho na, kitna sundar banaya!',
        lines: {
          logic: ['Kal toh ₹12 tha!', 'Aadhe phool toh band hain!', 'Andar bhi milta hai.'],
          charm: ['Aap ke phool sabse fresh hain!', 'Kitna sundar haar banaya, aunty!'],
          local: ['Har Thursday hum aap se hi lete.', 'Hum isi gali mein rehte.'],
          filmy: ['Aunty, ye haar toh picture mein bhi nahi dekha!', 'Ek gulab, hero ke liye?'],
          walk: ['Rehne do, doosri jagah lete.', 'Kal le lunga.'],
        },
        good: ['Aww. Accha, ₹{P} de do.', 'Chalo, aap ke liye ₹{P}.'],
        meh: ['Phool mehenge hain aaj. ₹{P}.'],
        bad: ['₹{P} se kam nahi.', 'Mol-bhaav nahi, beta.'],
        walkWin: 'Ruko! ₹{P}, le lo.', walkLose: 'Theek hai, jao.',
        deal: 'Lo beta, ₹{P}. Ammamma ko pranaam bolna.', leave: 'Agla! Bheed hai, beta.',
      },
      kite: {
        title: 'Patang ka Mol-Bhaav', what: 'five kites and a charkhi', like: 'filmy',
        price: (p, r) => ({ start: 30, target: 20, floor: ri(r, 18, 20) }),
        ask: 'Paanch patang, ek charkhi? ₹{P}, mian.', hint: 'Aaj Sankranti hai. Aaj toh hawa bhi extra charge karti!',
        lines: {
          logic: ['Chacha, charkhi pe saddi aadhi hai!', 'Kal ₹20 mein bech rahe the!', 'Paanch patang hi toh hain.'],
          charm: ['Chacha, aap ki patang sabse oonchi udti!', 'Aap ke haath ka kaam, first class!'],
          local: ['Hum Charminar ke paas hi rehte!', 'Har Sankranti aap se hi lete, Chacha.'],
          filmy: ['Chacha, hawa bhi aapki, patang bhi aapki, dil bhi aapka!', 'Aaj ka hero main, aaj ka bhaav bhi mera!', 'Hero ki patang kabhi nahi katti, Chacha!'],
          walk: ['Chalo, aage wali dukaan dekhte.', 'Rehne do, Chacha.'],
        },
        good: ['Hehe! Baaton mein toh hero ho. ₹{P}.', 'Wah mian, wah! ₹{P}.'],
        meh: ['Saddi mehengi hai, beta. ₹{P}.', 'Hmm. ₹{P}.'],
        bad: ['Na mian, ₹{P} hi.', 'Aaj Sankranti hai, beta!'],
        walkWin: 'Arre ruko, mian! Chalo, ₹{P}.', walkLose: 'Jao, har dukaan mein yahi bhaav.',
        deal: 'Theek hai. ₹{P}. Aur glass manja nahi, haan? Cotton only.', leave: 'Bas mian, bheed hai. Baad mein aana.',
      },
      farmer: {
        title: 'Rythu Bazaar Bhaav', what: 'Amma\'s list', like: 'logic',
        price: (p) => { const l = Math.max(4, Math.round(p.list || p.target || 36)); return { start: Math.round(l * 1.25), target: l, floor: Math.round(l * 0.9) }; },
        ask: 'Tamata kilo aaru! Poora list ₹{P}, babu.', hint: 'Hisaab pakka hai, babu. Gin ke dekho.',
        lines: {
          logic: ['Erragadda mein kilo ek rupaya kam hai!', 'Poora list ek saath le raha hoon, aunty.', 'Ye tamatar thode dabbe hue hain.', 'Board pe toh kam likha hai!'],
          charm: ['Aunty, aap ki sabzi sabse taazi!', 'Aap ke tamatar ekdum laal!'],
          local: ['Amma hamesha aap se hi leti, aunty.', 'Hum Mehdipatnam ke hi hain!'],
          filmy: ['Aunty, aap ke tamatar picture mein aane chahiye!', 'Hero ki Amma ki list hai, aunty!'],
          walk: ['Chalo, agle stall pe dekhte.', 'Rehne do aunty, Erragadda jaate.'],
        },
        good: ['Sare, babu. Hisaab theek. ₹{P}.', 'Smart boy. ₹{P} ivvu.'],
        meh: ['Mandi mein bhi rate hai, babu. ₹{P}.'],
        bad: ['Ledu babu, ₹{P}.', 'Rate fixed hai, babu!'],
        walkWin: 'Ruko babu! ₹{P}, sare.', walkLose: 'Jao, Erragadda ka auto ₹10 hai!',
        deal: 'Sare! ₹{P}. Kosaru bhi daal diya, Amma ko bolna.', leave: 'Babu, line lagi hai. Agla!',
      },
      books: {
        title: 'Kitaabon ka Mol-Bhaav', what: 'the class VII set', like: 'local',
        price: (p, r) => ({ start: 90, target: 60, floor: 55 }),
        ask: 'Seventh class, full set, ₹{P}. Half price!', hint: 'Kaunse school ke ho? Idhar ke ho?',
        lines: {
          logic: ['Ye toh pichle saal ka edition hai!', 'Cover phata hua hai, uncle.', 'Guide nahi chahiye, sirf books.'],
          charm: ['Uncle, aap ke paas sab milta hai!', 'Aap toh Koti ki library ho!'],
          local: ['Main yahin paas ke school mein padhta!', 'Bhaiyya bhi aap se hi lete the!', 'Hum Koti ke hi hain, uncle.'],
          filmy: ['Uncle, padhai ka hero banna hai, help karo!', 'Half price ka half price, uncle?'],
          walk: ['Chalo, agla stall.', 'Rehne do, uncle.'],
        },
        good: ['Apne area ka ho? Accha, ₹{P}.', 'Padhne wale ho. ₹{P}.'],
        meh: ['Books bhaari hain, beta. ₹{P}.'],
        bad: ['Na beta, ₹{P}.', 'Half price already hai!'],
        walkWin: 'Arre ruko! ₹{P}, le jao.', walkLose: 'Jao, Abids mein bhi yahi rate.',
        deal: 'Lo, ₹{P}. Achhe se cover karna, haan!', leave: 'Beta, aur customer hain. Kal aana.',
      },
    };
    function ri(r, a, b) { return a + Math.floor(r.next() * (b - a + 1)); }

    const def = {
      id: 'bargain',
      title: 'Mol-Bhaav',
      sub: 'Never pay the first price. Every 90s kid learnt this from Amma.',
      osd: 'HAGGLE',
      place: 'koti_bus_stand', places: ['koti_bus_stand', 'banana_cart_', 'flower_cart_', 'kite_stall_1', 'rythu_bazaar_', 'koti_book_bazaar', 'rtc_x_roads'],
      secs: 50,
      goLabel: 'BOLO!',
      keys: { Digit1: 'c1', Digit2: 'c2', Digit3: 'c3', Numpad1: 'c1', Numpad2: 'c2', Numpad3: 'c3', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'left', ArrowDown: 'right', KeyA: 'left', KeyD: 'right', Space: 'ok', Enter: 'ok', NumpadEnter: 'ok', KeyE: 'ok' },
      buttons: () => [],
      keyHint: () => 'pick a line: <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> or <kbd>←</kbd><kbd>→</kbd> + <kbd>Space</kbd> &nbsp; then <kbd>Space</kbd> when the needle is green',
      howto(g) {
        const w = who(g), W_ = WHO[w], pr = prices(g, w, U.rng(1));
        return {
          lines: [
            'He starts high. Get him down to <b>₹' + pr.target + '</b> for ' + (g.params.what || W_.what) + ' before his <b>SABR</b> (patience) runs out.',
            'Pick a line: <b>LOGIC</b>, <b>PYAAR</b> (charm), <b>APNAPAN</b> (we\'re local), <b>FILMY</b>. He likes one kind more: <b>his first line is the hint</b>.',
            'Say it with confidence: press when the needle is <b style="color:#2f8a3a">green</b> (yellow does half, red annoys him). <b>JAATA HOON</b> (walk away) works only when he\'s close to his lowest price.',
          ],
          goal: 'PRICE ≤ ₹' + pr.target + ' &middot; DON\'T LET HIM LEAVE',
          keys: '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick · <kbd>Space</kbd> say it',
          touch: 'Tap a line, then tap the screen when the needle is <b>green</b>',
        };
      },
      setup(g) {
        const S = g.S, r = g.rng, p = g.params;
        S.who = who(g); const W_ = (S.W = WHO[S.who]);
        if (g.nameEl && !p.title) g.nameEl.textContent = W_.title;
        S.like = p.like && CATS[p.like] && p.like !== 'walk' ? p.like : p.randomType ? TYPES[(r.next() * TYPES.length) | 0] : W_.like;
        const pr = prices(g, S.who, r);
        S.start = pr.start; S.target = pr.target; S.floor = pr.floor;
        S.price = S.start; S.shown = S.start; S.history = [S.start];
        S.patience = 100; S.score = 0;
        S.used = {}; S.turns = 0;
        S.stage = 'intro'; S.st = 0; S.sel = 0;
        S.cards = [];
        dealCards(g, S);
        S.meter = { t: 0, speed: T.speed0 + g.diff * T.speed1, zone: Math.min(0.32, (T.zone0 - g.diff * T.zone1) * g.winMul) };
        const hint = S.like === W_.like ? W_.hint : HINTS[S.like];
        S.bubble = { who: 'him', text: fill(W_.ask, S, g) + ' ' + hint, t: 0, keep: true }; // the hint stays up until he says something else
        S.kidBubble = null;
        S.leave = 0; S.time = 0; S.deal = false;
        S.sign = S.who === 'auto' ? PLACE_SIGN[p.place] || 'KOTI' : null;
      },
      layout(g) { g.S.bgKey = null; lay(g, g.S); },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) { S.time += dt; if (S.bubble) S.bubble.t = Math.min(S.bubble.t + dt, 1); } },
      pointer(g, type, x, y) {
        const S = g.S;
        if (type !== 'down' || g.over) return;
        if (S.stage === 'choose') {
          const i = (S.cardRects || []).findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
          if (i >= 0) { S.sel = i; pick(g, S, i); }
        } else if (S.stage === 'deliver') deliver(g, S);
      },
      bot(g, dt, want) {
        const S = g.S;
        S.botT = (S.botT || 0) - dt;
        if (S.botT > 0) return;
        if (S.stage === 'choose') {
          let best = 0, bs = -1e9;
          S.cards.forEach((c, i) => {
            let sc = c.cat === 'walk' ? (S.price - S.floor <= T.walkNear ? 9 : -9) : (c.cat === S.like ? 4 : 1) + CATS[c.cat].pat * 0.05;
            if (want === 'lose') sc = c.cat === 'walk' ? 10 : c.cat === 'logic' ? 5 : -sc;
            if (sc > bs) { bs = sc; best = i; }
          });
          g.botPress(['c1', 'c2', 'c3'][best]); S.botT = 0.4;
        } else if (S.stage === 'deliver') {
          const v = needle(S), off = Math.abs(v - 0.5);
          if (want === 'lose' ? off > 0.4 : off < S.meter.zone * 0.35) { g.botPress('ok'); S.botT = 0.3; }
        }
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'BHAAV', v: '₹' + S.price, good: S.price <= S.target }, { k: 'TARGET', v: '₹' + S.target }, { k: 'SABR', v: Math.max(0, Math.round(S.patience)) + '%', warn: S.patience < 30 }];
      },
      draw(g, ctx) { drawBargain(g, ctx, g.S); },
      result(g, r) {
        const S = g.S, ride = S.who === 'auto';
        return {
          title: r.win ? (ride ? 'Chalo, baitho!' : 'Deal pakki!') : (ride ? 'Auto chala gaya!' : 'Woh toh mud gaye!'),
          line: r.win ? 'Saved ₹' + (S.start - S.price) + '. Amma will be proud (and will ask for the change).' : 'Next time read him first: ' + hintFor(S.like) + '.',
          rows: [['First price', '₹' + S.start], ['Final price', '₹' + S.price], ['Saved', '₹' + Math.max(0, S.start - S.price)], ['Lines used', S.turns], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.price <= S.target - 2 ? 1 : 0) + (S.patience >= 40 ? 1 : 0) : 0; },
    };
    function who(g) { return WHO[g.params.who] ? g.params.who : 'auto'; }
    /** start / target / floor for this seller; explicit params win. The floor never sits above the target. */
    function prices(g, w, r) {
      const p = g.params, d = WHO[w].price(p, r);
      if (p.target != null) d.target = Math.max(1, Math.round(p.target));
      if (p.start != null) d.start = Math.round(p.start);
      if (p.floor != null) d.floor = Math.round(p.floor);
      d.start = Math.max(d.start, d.target + 2);
      d.floor = Math.max(1, Math.min(d.floor, d.target));
      return d;
    }
    function fill(t, S, g) { return t.replace('{P}', S.price).replace('{T}', S.target).replace('{D}', (g && g.params.dest) || 'Charminar'); }
    function hintFor(like) { return { logic: 'this one wanted plain logic', charm: 'this one melts for pyaar', local: 'this one loves apnapan', filmy: 'this one wanted filmy style' }[like] || 'listen to his first line'; }
    function needle(S) { return 0.5 + 0.5 * Math.sin(S.meter.t * S.meter.speed * Math.PI); }

    function dealCards(g, S) {
      const W_ = S.W, r = g.rng;
      const cats = [];
      while (cats.length < 2) { const c = TYPES[(r.next() * TYPES.length) | 0]; if (!cats.includes(c)) cats.push(c); }
      cats.push(S.price - S.floor <= T.walkNear + 2 || r.next() < 0.4 ? 'walk' : TYPES.find((c) => !cats.includes(c)));
      // Assist: his favourite kind of line is always in the hand
      if (g.assist && !cats.includes(S.like)) cats[cats[0] === 'walk' ? 1 : 0] = S.like;
      for (let i = cats.length - 1; i > 0; i--) { const j = (r.next() * (i + 1)) | 0; [cats[i], cats[j]] = [cats[j], cats[i]]; }
      S.cards = cats.map((cat) => { const L = W_.lines[cat]; return { cat, text: fill(L[(r.next() * L.length) | 0], S, g) }; });
      S.sel = Math.min(S.sel, 2);
    }

    function say(S, text, whoSays) { if (whoSays === 'kid') S.kidBubble = { text, t: 0 }; else S.bubble = { who: 'him', text, t: 0 }; }

    function pick(g, S, i) {
      if (S.stage !== 'choose') return;
      S.pick = S.cards[i];
      S.stage = 'deliver'; S.st = 0; S.meter.t = g.rng.next() * 2;
      say(S, S.pick.text, 'kid');
      g.sfx('ui_select');
    }
    function deliver(g, S) {
      if (S.stage !== 'deliver') return;
      const v = needle(S), off = Math.abs(v - 0.5), z = S.meter.zone;
      const grade = off < z * 0.5 ? 'green' : off < z * 1.3 ? 'yellow' : 'red';
      S.grade = grade;
      react(g, S, S.pick, grade);
    }

    function react(g, S, card, grade) {
      const W_ = S.W, cat = card.cat, k = T.grade[grade];
      S.turns++;
      const L = S.Lay;
      g.pop(grade === 'green' ? 'JAMKE BOLA!' : grade === 'yellow' ? 'theek' : 'atak gaya...', L ? L.kidX : g.W * 0.2, L ? L.kidY - 120 : g.H * 0.6, { size: grade === 'green' ? 22 : 17, color: grade === 'green' ? '#b9ffb0' : grade === 'yellow' ? '#fff' : '#ffb4a6', font: grade === 'green' ? 'display' : 'body' });
      const prev = S.price;
      let text;
      if (grade === 'red') {
        // no effect, and he is annoyed
        S.patience += T.redPatience;
        const pool = W_.bad; text = pool[(g.rng.next() * pool.length) | 0];
      } else if (cat === 'walk') {
        if (S.price - S.floor <= T.walkNear) { S.price = S.floor; text = W_.walkWin; g.sfx('ui_select'); }
        else { S.patience += T.walkFail; text = W_.walkLose; S.walked = true; }
      } else {
        const liked = cat === S.like;
        S.used[cat] = (S.used[cat] || 0) + 1;
        const gap = S.price - S.floor;
        let drop = Math.round(gap * (liked ? T.likedFrac : T.frac) * k);
        if (drop < 1 && gap > 0) drop = 1;
        S.price = Math.max(S.floor, S.price - drop);
        S.patience += CATS[cat].pat * k;
        const pool = liked && grade === 'green' ? W_.good : W_.meh;
        text = pool[(g.rng.next() * pool.length) | 0];
        if (liked) S.likedHits = (S.likedHits || 0) + 1;
      }
      S.patience = Math.min(100, S.patience);
      if (S.price < prev) { S.history.push(S.price); g.sfx('coin', { vol: 0.6 }); }
      S.stage = 'react'; S.st = 0;
      if (S.price <= S.target) {
        S.deal = true;
        say(S, fill(W_.deal, S, g), 'him');
        S.score = (S.start - S.price) * 30 + Math.round(S.patience) * 3 + Math.max(0, 8 - S.turns) * 20;
        g.finish(true, { price: S.price, start: S.start, target: S.target, saved: S.start - S.price, savedPaise: (S.start - S.price) * 100, pricePaise: S.price * 100, who: S.who, like: S.like, delay: 2.0 });
        g.sfx('cash');
        return;
      }
      if (S.patience <= 0) { leave(g, S); return; }
      say(S, fill(text, S, g), 'him');
    }
    function leave(g, S) {
      S.patience = 0; S.leave = 0.001; S.stage = 'gone';
      say(S, S.W.leave, 'him');
      if (S.who === 'auto') { g.sfx('auto_start'); g.sfx('auto_horn', { delay: 0.6 }); }
      g.finish(false, { price: S.price, start: S.start, target: S.target, pricePaise: S.price * 100, who: S.who, like: S.like, delay: 2.2 });
    }

    function step(g, S, dt) {
      S.time += dt; S.st += dt;
      if (S.bubble) S.bubble.t += dt;
      if (S.kidBubble) S.kidBubble.t += dt;
      if (S.leave > 0) S.leave += dt;
      S.shown += (S.price - S.shown) * Math.min(1, dt * 6);
      if (g.over) return;
      if (S.stage === 'intro') { if (S.st > 1.3) { S.stage = 'choose'; S.st = 0; } return; }
      if (S.stage === 'choose' || S.stage === 'deliver') {
        S.patience -= dt * (T.drain0 + g.diff * T.drain1);
        if (S.st > 4.5 && S.stage === 'choose' && !S.nag && S.turns > 0) { S.nag = true; say(S, ['Bolo bolo, jaldi!', 'Haan? Kya?', 'Time nahi hai!'][(g.rng.next() * 3) | 0], 'him'); if (S.who === 'auto') g.sfx('auto_horn', { vol: 0.5 }); }
        if (S.patience <= 0) { leave(g, S); return; }
      }
      if (S.stage === 'choose') {
        for (let i = 0; i < 3; i++) if (g.pressed('c' + (i + 1))) { S.sel = i; pick(g, S, i); return; }
        if (g.pressed('left')) S.sel = (S.sel + 2) % 3;
        if (g.pressed('right')) S.sel = (S.sel + 1) % 3;
        if (g.pressed('ok')) pick(g, S, S.sel);
      } else if (S.stage === 'deliver') {
        S.meter.t += dt;
        if (g.pressed('ok') || g.pressed('c1') || g.pressed('c2') || g.pressed('c3')) deliver(g, S);
        else if (S.st > 4) { S.grade = 'red'; react(g, S, S.pick, 'red'); }
      } else if (S.stage === 'react') {
        if (S.st > 1.5) { S.stage = 'choose'; S.st = 0; S.nag = false; S.kidBubble = null; dealCards(g, S); }
      }
    }

    /* ------------------------------------------------------------- drawing */
    function lay(g, S) {
      const A = g.area, W = g.W, P = g.portrait;
      const L = (S.Lay = {});
      const cardsH = P ? Math.min(A.h * 0.36, 3 * 64 + 20) : Math.min(A.h * 0.34, 120);
      L.cardsY = A.y + A.h - cardsH; L.cardsH = cardsH;
      L.meterY = L.cardsY - (P ? 46 : 40);
      L.ground = L.meterY - (P ? 26 : 16);
      L.sceneH = L.ground - A.y;
      L.sc = Math.max(0.5, Math.min(L.sceneH / 230, W / (P ? 340 : 560)));
      L.vx = W * (P ? 0.62 : 0.6); // vendor / auto anchor
      L.kidX = W * (P ? 0.17 : 0.18); L.kidY = L.ground + 4;
      return L;
    }

    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, A = g.area;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + A.h;
      const L = lay(g, S);
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const gy = L.ground;
      let gr = c.createLinearGradient(0, 0, 0, gy);
      gr.addColorStop(0, '#f2b26a'); gr.addColorStop(1, '#f7dca8');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      const rng = U.rng(55);
      if (S.who === 'auto') {
        // Koti bus stand: shelter roof, a red-and-cream city bus, crowd
        c.fillStyle = '#c9b8a0'; c.fillRect(0, gy - L.sceneH * 0.62, W, L.sceneH * 0.62);
        c.fillStyle = '#8a7a66'; c.fillRect(0, gy - L.sceneH * 0.66, W, L.sceneH * 0.06);
        for (let x = 20; x < W; x += 90) { c.fillStyle = '#6a5a4a'; c.fillRect(x, gy - L.sceneH * 0.6, 6, L.sceneH * 0.6); }
        const bw = Math.min(W * 0.55, 360), bh = bw * 0.36, bx = W * 0.02, by = gy - bh - 4;
        c.fillStyle = '#b22b2b'; H.rr(c, bx, by, bw, bh, 10); c.fill();
        c.fillStyle = '#efe0c0'; c.fillRect(bx, by + bh * 0.42, bw, bh * 0.14);
        for (let i = 0; i < 6; i++) { c.fillStyle = '#3a3a4a'; c.fillRect(bx + 10 + i * (bw - 20) / 6, by + 8, (bw - 20) / 6 - 8, bh * 0.3); }
        c.fillStyle = '#1a1214'; c.beginPath(); c.arc(bx + bw * 0.2, by + bh, bh * 0.16, 0, TAU); c.arc(bx + bw * 0.8, by + bh, bh * 0.16, 0, TAU); c.fill();
        H.text(c, '8A  CHARMINAR', bx + bw * 0.5, by + bh * 0.49, { font: 'osd', size: Math.max(10, bh * 0.12), color: '#b22b2b' });
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.32, 170), Math.max(26, Math.min(48, L.sceneH * 0.13)), { fill: '#f2c230', text: S.sign || 'KOTI', size: Math.max(16, Math.min(32, L.sceneH * 0.09)) });
      } else if (S.who === 'banana') {
        // a colony market lane: shop shutters
        for (let x = 0; x < W; ) { const w = 60 + rng.next() * 60, h = L.sceneH * (0.6 + rng.next() * 0.3); c.fillStyle = ['#e8d9b5', '#c7b9d6', '#bcd3c4', '#e9c6b6'][(rng.next() * 4) | 0]; c.fillRect(x, gy - h, w, h); c.fillStyle = '#7a7a80'; c.fillRect(x + 6, gy - h * 0.45, w - 12, h * 0.45); c.strokeStyle = 'rgba(0,0,0,0.2)'; for (let yy = gy - h * 0.45; yy < gy; yy += 5) { c.beginPath(); c.moveTo(x + 6, yy); c.lineTo(x + w - 6, yy); c.stroke(); } x += w + 4; }
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.4, 220), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#f2c230', text: 'TAAZE KELE', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else if (S.who === 'kite') {
        // Gulzar Houz on Sankranti: a big stone arch, a sky full of kites, strings of kites over the stall
        gr = c.createLinearGradient(0, A.y, 0, gy); gr.addColorStop(0, '#7fc3e8'); gr.addColorStop(1, '#f7e2b0');
        c.fillStyle = gr; c.fillRect(0, 0, W, gy);
        for (let i = 0; i < 14; i++) {
          const kx = rng.next() * W, ky = A.y + 10 + rng.next() * L.sceneH * 0.45, ks = 4 + rng.next() * 6;
          c.fillStyle = ['#e2483a', '#f2c230', '#2a8c82', '#7a3db8', '#e8487c'][i % 5];
          c.beginPath(); c.moveTo(kx, ky - ks); c.lineTo(kx + ks * 0.75, ky); c.lineTo(kx, ky + ks); c.lineTo(kx - ks * 0.75, ky); c.fill();
        }
        const aw = Math.min(W * 0.9, L.sceneH * 1.6), ax = W * 0.5 - aw / 2, ah = L.sceneH * 0.78, top = gy - ah;
        c.fillStyle = '#e4cfa6'; c.fillRect(ax, top, aw, ah);
        c.fillStyle = '#c9ae80'; c.fillRect(ax, top, aw, ah * 0.08);
        // the arch opening (pointed) showing the lane beyond
        const ow = aw * 0.42, ox = W * 0.5 - ow / 2, oh = ah * 0.8;
        c.fillStyle = '#9fc6d8'; c.beginPath(); c.moveTo(ox, gy); c.lineTo(ox, gy - oh * 0.62); c.quadraticCurveTo(ox, gy - oh * 0.95, W * 0.5, gy - oh); c.quadraticCurveTo(ox + ow, gy - oh * 0.95, ox + ow, gy - oh * 0.62); c.lineTo(ox + ow, gy); c.fill();
        c.strokeStyle = '#a88a5c'; c.lineWidth = 4; c.stroke();
        for (let i = 0; i < 2; i++) { const nx = ax + aw * (i ? 0.84 : 0.08), nw = aw * 0.08; c.fillStyle = '#c9ae80'; c.beginPath(); c.moveTo(nx, top + ah * 0.6); c.lineTo(nx, top + ah * 0.3); c.quadraticCurveTo(nx + nw / 2, top + ah * 0.16, nx + nw, top + ah * 0.3); c.lineTo(nx + nw, top + ah * 0.6); c.fill(); }
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.42, 230), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#ef8a2a', text: 'GULZAR HOUZ', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else if (S.who === 'farmer') {
        // Rythu Bazaar: a long green shed, price board, rows of stalls
        c.fillStyle = '#dfe6d2'; c.fillRect(0, gy - L.sceneH * 0.66, W, L.sceneH * 0.66);
        c.fillStyle = '#3c7a4a'; c.beginPath(); c.moveTo(0, gy - L.sceneH * 0.66); c.lineTo(W, gy - L.sceneH * 0.66); c.lineTo(W, gy - L.sceneH * 0.8); c.lineTo(0, gy - L.sceneH * 0.8); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2; for (let x = 0; x < W; x += 12) { c.beginPath(); c.moveTo(x, gy - L.sceneH * 0.8); c.lineTo(x, gy - L.sceneH * 0.66); c.stroke(); }
        for (let x = 30; x < W; x += 110) { c.fillStyle = '#5a6a5a'; c.fillRect(x, gy - L.sceneH * 0.66, 6, L.sceneH * 0.66); }
        for (let i = 0; i < 6; i++) { const x = W * (0.04 + i * 0.17); c.fillStyle = ['#c84a3a', '#b88a5a', '#6a3a7a', '#4f8a3a'][i % 4]; c.beginPath(); c.ellipse(x, gy - L.sceneH * 0.12, 26, 10, 0, Math.PI, TAU); c.fill(); }
        const bw = Math.min(W * 0.3, 150), bh = Math.min(L.sceneH * 0.3, 70), bx = W - bw - 16, by = gy - L.sceneH * 0.6;
        c.fillStyle = '#1e3a2a'; c.fillRect(bx, by, bw, bh); c.strokeStyle = '#8a6a3a'; c.lineWidth = 3; c.strokeRect(bx, by, bw, bh);
        ['TOMATO 6', 'ONION 8', 'BRINJAL 7'].forEach((t, i) => H.text(c, t, bx + bw / 2, by + bh * (0.22 + i * 0.28), { font: 'osd', size: Math.max(10, bh * 0.2), color: '#f4efe2', maxW: bw - 10 }));
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.46, 240), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#2f8a3a', text: 'RYTHU BAZAAR', color: '#fff', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else if (S.who === 'books') {
        // the Koti footpath book bazaar: an old wall with tuition posters
        c.fillStyle = '#d8c8a8'; c.fillRect(0, gy - L.sceneH * 0.72, W, L.sceneH * 0.72);
        c.fillStyle = '#b8a888'; for (let y = gy - L.sceneH * 0.72; y < gy; y += 14) c.fillRect(0, y, W, 1.5);
        const posters = ['TUITION', 'ADMISSIONS', 'EAMCET', 'TYPING', 'SPOKEN ENGLISH', 'ABACUS'];
        for (let i = 0; i < 7; i++) {
          const pw = Math.min(70, W * 0.16), ph = pw * 1.3, px = W * 0.03 + i * W * 0.15 + (rng.next() - 0.5) * 8, py = gy - L.sceneH * 0.66 + rng.next() * 10;
          c.save(); c.translate(px + pw / 2, py + ph / 2); c.rotate((rng.next() - 0.5) * 0.12);
          c.fillStyle = ['#f4efe2', '#f2d84a', '#e9c6b6', '#c8e0f0'][i % 4]; c.fillRect(-pw / 2, -ph / 2, pw, ph);
          c.fillStyle = ['#b22b2b', '#2a4a8a', '#1a1214'][i % 3]; c.fillRect(-pw / 2 + 5, -ph / 2 + 6, pw - 10, ph * 0.18);
          for (let k = 0; k < 4; k++) c.fillRect(-pw / 2 + 6, -ph / 2 + ph * (0.36 + k * 0.13), (pw - 12) * (0.5 + ((i + k) % 3) * 0.2), 2.5);
          H.text(c, posters[i % posters.length], 0, -ph / 2 + 6 + ph * 0.09, { font: 'osd', size: Math.max(8, pw * 0.13), color: '#fff', maxW: pw - 12 });
          c.restore();
        }
        H.sign(c, W * 0.05, A.y + 14, Math.min(W * 0.46, 240), Math.max(24, Math.min(44, L.sceneH * 0.12)), { fill: '#2a4a8a', text: 'KOTI · OLD BOOKS', color: '#fff', size: Math.max(13, Math.min(26, L.sceneH * 0.07)) });
      } else {
        // outside a temple on a Thursday: whitewashed wall with a saffron band, a few devotees
        c.fillStyle = '#f4efe2'; c.fillRect(0, gy - L.sceneH * 0.7, W, L.sceneH * 0.7);
        c.fillStyle = '#ef8a2a'; c.fillRect(0, gy - L.sceneH * 0.7, W, L.sceneH * 0.05);
        c.fillStyle = '#b5694a'; c.fillRect(0, gy - L.sceneH * 0.12, W, L.sceneH * 0.12);
        for (let i = 0; i < 6; i++) { const x = W * (0.05 + i * 0.17), h = L.sceneH * 0.3; c.fillStyle = 'rgba(80,60,50,0.18)'; c.beginPath(); c.arc(x, gy - h - 10, 9, 0, TAU); c.fill(); H.rr(c, x - 11, gy - h, 22, h, 6); c.fill(); }
        // a saffron flag on a pole
        const fx = W * 0.9; c.strokeStyle = '#6a5a4a'; c.lineWidth = 3; c.beginPath(); c.moveTo(fx, gy - L.sceneH * 0.7); c.lineTo(fx, gy - L.sceneH * 1.0); c.stroke();
        c.fillStyle = '#ef8a2a'; c.beginPath(); c.moveTo(fx, gy - L.sceneH * 1.0); c.lineTo(fx - 26, gy - L.sceneH * 0.95); c.lineTo(fx, gy - L.sceneH * 0.9); c.fill();
      }
      // road / footpath
      c.fillStyle = '#8a8580'; c.fillRect(0, gy, W, Hh - gy);
      c.fillStyle = '#b8b0a4'; c.fillRect(0, gy, W, 6);
      // card tray background
      c.fillStyle = 'rgba(18,13,22,0.88)'; c.fillRect(0, L.meterY - 10, W, Hh - L.meterY + 10);
      c.fillStyle = 'rgba(242,194,48,0.35)'; c.fillRect(0, L.meterY - 10, W, 2);
    }

    function drawBargain(g, ctx, S) {
      const W = g.W, Hh = g.H;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const L = S.Lay;
      // the other party
      if (S.who === 'auto') drawAuto(ctx, S, L, g); else if (S.who === 'banana' || S.who === 'flower') drawCart(ctx, S, L, g); else drawStall(ctx, S, L, g);
      // price slate
      drawSlate(ctx, S, L, g);
      // the kid
      H.kidBack(ctx, L.kidX, L.kidY, L.sc * 1.35, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
      // bubbles
      if (S.bubble && (S.bubble.t < 3.5 || S.bubble.keep) && !(S.kidBubble && S.stage === 'deliver')) {
        const bx = S.who === 'auto' ? L.vx + 10 * L.sc : L.vx, by = L.ground - 150 * L.sc;
        bubble(ctx, g, S.bubble.text, bx, by, S.bubble.t, S.patience < 35 ? '#ffe6dc' : '#fff8e6', 'right');
      }
      if (S.kidBubble) bubble(ctx, g, S.kidBubble.text, L.kidX + 30 * L.sc, L.kidY - 90 * L.sc, S.kidBubble.t, '#e8f4ff', 'left');
      // patience meter (SABR) with a face
      const pw = Math.min(W * 0.4, 220), px = W - pw - 14, py = g.area.y + 12;
      ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, px - 30, py - 4, pw + 36, 24, 12); ctx.fill();
      const pv = U.clamp(S.patience / 100, 0, 1);
      ctx.fillStyle = pv > 0.5 ? '#6fbf5a' : pv > 0.25 ? '#ffb43a' : '#e2483a'; H.rr(ctx, px, py + 2, pw * pv, 12, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; H.rr(ctx, px, py + 2, pw, 12, 6); ctx.stroke();
      face(ctx, px - 15, py + 8, 9, pv);
      H.text(ctx, 'SABR', px + pw / 2, py + 27, { font: 'osd', size: 15, color: '#eaf2ff', outline: 3 });
      // the timing meter
      if (S.stage === 'deliver') {
        const mw = Math.min(W - 40, 420), mx = (W - mw) / 2, my = L.meterY, z = S.meter.zone;
        ctx.fillStyle = '#e2483a'; H.rr(ctx, mx, my - 9, mw, 18, 9); ctx.fill();
        ctx.fillStyle = '#ffb43a'; ctx.fillRect(mx + mw * (0.5 - z * 1.3), my - 9, mw * z * 2.6, 18);
        ctx.fillStyle = '#6fdc5a'; ctx.fillRect(mx + mw * (0.5 - z * 0.5), my - 9, mw * z, 18);
        const v = needle(S), nx = mx + mw * v;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(nx, my - 12); ctx.lineTo(nx + 7, my - 22); ctx.lineTo(nx - 7, my - 22); ctx.fill();
        ctx.fillRect(nx - 1.5, my - 12, 3, 24);
        H.text(ctx, g.touch ? 'BOLO! tap on green' : 'BOLO! SPACE on green', W / 2, my + 22, { font: 'osd', size: 16, color: '#eaf2ff' });
      } else if (S.stage === 'choose') {
        H.text(ctx, 'Kya bolna hai?', W / 2, L.meterY, { font: 'display', size: 20, color: '#ffd84a', outline: 4 });
      }
      // the cards
      drawCards(ctx, S, L, g);
    }

    function bubble(ctx, g, text, x, y, t, fillc, side) {
      const W = g.W;
      const fs = Math.max(13, Math.min(17, W * 0.034));
      ctx.font = H.font('body', fs, 700);
      const maxW = Math.min(W * 0.62, 300);
      const lines = H.wrap(ctx, text, maxW - 22);
      const bw = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 24), lh = fs * 1.25, bh = lines.length * lh + 14;
      let bx = side === 'right' ? x - bw * 0.35 : x;
      bx = U.clamp(bx, 8, W - bw - 8);
      const by = Math.max(g.area.y + 34, y - bh);
      const k = Math.min(1, t / 0.16);
      ctx.save(); ctx.translate(bx + bw / 2, by + bh); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-bx - bw / 2, -by - bh);
      ctx.fillStyle = fillc; H.rr(ctx, bx, by, bw, bh, 10); ctx.fill(); ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 2; ctx.stroke();
      const tx = U.clamp(x, bx + 14, bx + bw - 14);
      ctx.beginPath(); ctx.moveTo(tx - 7, by + bh - 1); ctx.lineTo(tx, by + bh + 10); ctx.lineTo(tx + 7, by + bh - 1); ctx.fillStyle = fillc; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tx - 7, by + bh); ctx.lineTo(tx, by + bh + 10); ctx.lineTo(tx + 7, by + bh); ctx.stroke();
      lines.forEach((l, i) => H.text(ctx, l, bx + bw / 2, by + 7 + lh * (i + 0.5), { font: 'body', weight: 700, size: fs, color: '#1a1214' }));
      ctx.restore();
    }
    function face(ctx, x, y, r, mood) {
      ctx.fillStyle = mood > 0.5 ? '#ffd84a' : mood > 0.25 ? '#ffb43a' : '#ff6a5a';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1214'; ctx.fillRect(x - r * 0.45, y - r * 0.3, r * 0.22, r * 0.22); ctx.fillRect(x + r * 0.25, y - r * 0.3, r * 0.22, r * 0.22);
      ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1.5; ctx.beginPath();
      if (mood > 0.5) ctx.arc(x, y + r * 0.1, r * 0.45, 0.3, Math.PI - 0.3); else if (mood > 0.25) { ctx.moveTo(x - r * 0.4, y + r * 0.4); ctx.lineTo(x + r * 0.4, y + r * 0.4); } else ctx.arc(x, y + r * 0.75, r * 0.45, Math.PI + 0.4, -0.4);
      ctx.stroke();
    }

    function drawCards(ctx, S, L, g) {
      const W = g.W, P = g.portrait;
      S.cardRects = [];
      if (!(S.stage === 'choose' || S.stage === 'deliver' || S.stage === 'intro' || S.stage === 'react')) return;
      const n = S.cards.length, pad = 12;
      for (let i = 0; i < n; i++) {
        let x, y, w, h;
        if (P) { w = W - pad * 2; h = (L.cardsH - pad * (n + 1)) / n; x = pad; y = L.cardsY + pad + i * (h + pad); }
        else { w = (Math.min(W, 900) - pad * (n + 1)) / n; h = L.cardsH - pad * 2; x = (W - Math.min(W, 900)) / 2 + pad + i * (w + pad); y = L.cardsY + pad; }
        S.cardRects.push({ x, y, w, h });
        const c = S.cards[i], C = CATS[c.cat];
        const chosen = S.stage === 'deliver' && S.pick === c, dim = (S.stage === 'deliver' && !chosen) || S.stage === 'intro' || S.stage === 'react';
        const hi = S.stage === 'choose' && i === S.sel && !g.touch;
        ctx.globalAlpha = dim ? 0.35 : 1;
        H.sign(ctx, x, y + (hi ? -3 : 0), w, h, { fill: chosen ? '#fff6c8' : '#f4ead8', edge: hi || chosen ? '#f2c230' : '#1a1214', bolts: false, r: 8, shadow: 'rgba(0,0,0,0.5)' });
        // category chip + key number
        const chipW = Math.min(110, w * 0.4), chipH = Math.min(20, h * 0.36);
        ctx.fillStyle = C.col; H.rr(ctx, x + 8, y + 6, chipW, chipH, 4); ctx.fill();
        H.text(ctx, (S.W.catNames && S.W.catNames[c.cat]) || C.name, x + 8 + chipW / 2, y + 6 + chipH / 2 + 1, { font: 'osd', size: chipH * 0.9, color: '#fff', maxW: chipW - 6 });
        if (!g.touch) H.text(ctx, String(i + 1), x + w - 16, y + 6 + chipH / 2 + 1, { font: 'osd', size: chipH * 0.95, color: '#7a6a5a' });
        ctx.font = H.font('body', Math.max(13, Math.min(17, h * 0.26)), 700);
        const lines = H.wrap(ctx, c.text, w - 20).slice(0, 2);
        const fs = Math.max(13, Math.min(17, h * 0.26));
        const ty = y + 6 + chipH + (h - 6 - chipH) / 2 - ((lines.length - 1) * fs * 1.15) / 2;
        lines.forEach((l, k) => H.text(ctx, l, x + 10, ty + k * fs * 1.15, { font: 'body', weight: 700, size: fs, color: '#1a1214', align: 'left', maxW: w - 20 }));
        ctx.globalAlpha = 1;
      }
    }

    function drawSlate(ctx, S, L, g) {
      const sc = Math.min(L.sc, 1.1), w = 92 * sc, h = 62 * sc;
      const sx = g.W - w - 16, sy = g.area.y + 48;
      ctx.fillStyle = '#7a5a30'; H.rr(ctx, sx - 5, sy - 5, w + 10, h + 10, 6); ctx.fill();
      ctx.fillStyle = '#2a3428'; ctx.fillRect(sx, sy, w, h);
      // struck-through history
      const hist = S.history.slice(-3, -1);
      let tx = sx + 8;
      const ty = sy + h * 0.24, hs = h * 0.26;
      for (const p of hist) {
        const s = '₹' + p;
        ctx.font = H.font('osd', hs);
        const tw = ctx.measureText(s).width;
        if (tx + tw > sx + w - 4) break;
        H.text(ctx, s, tx, ty, { font: 'osd', size: hs, color: 'rgba(255,255,255,0.55)', align: 'left' });
        ctx.strokeStyle = '#ff8a7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx - 2, ty + 3); ctx.lineTo(tx + tw + 2, ty - 4); ctx.stroke();
        tx += tw + 8;
      }
      const cur = Math.round(S.shown);
      H.text(ctx, '₹' + cur + (S.W.unit || ''), sx + w / 2, sy + h * 0.66, { font: 'osd', size: h * 0.5, color: S.price <= S.target ? '#b9ffb0' : '#fff', maxW: w - 10 });
    }

    function drawAuto(ctx, S, L, g) {
      const sc = L.sc;
      const drive = S.leave > 0 ? Math.pow(S.leave, 2) * 260 : 0;
      const x = L.vx + drive, y = L.ground;
      const shake = S.stage !== 'gone' ? Math.sin(S.time * 40) * 0.6 : Math.sin(S.time * 60) * 1.4;
      ctx.save(); ctx.translate(x, y + shake); ctx.scale(sc, sc);
      // smoke puffs from the exhaust
      for (let i = 0; i < 4; i++) {
        const k = (S.time * (S.leave > 0 ? 2.5 : 0.8) + i / 4) % 1;
        ctx.fillStyle = 'rgba(120,120,120,' + (1 - k) * (S.leave > 0 ? 0.5 : 0.22) + ')';
        ctx.beginPath(); ctx.arc(-92 - k * 40, -14 - k * 18, 6 + k * 14, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 95, 8, 0, 0, TAU); ctx.fill();
      // body (black lower, yellow upper)
      ctx.fillStyle = '#1a1214';
      ctx.beginPath(); ctx.moveTo(-88, -10); ctx.lineTo(-88, -50); ctx.lineTo(30, -50); ctx.quadraticCurveTo(70, -48, 82, -20); ctx.lineTo(84, -10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.moveTo(-90, -48); ctx.quadraticCurveTo(-88, -118, -40, -122); ctx.lineTo(40, -122); ctx.quadraticCurveTo(64, -118, 66, -70); ctx.lineTo(60, -48); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 3; ctx.stroke();
      // window openings
      ctx.fillStyle = '#3a2a24'; H.rr(ctx, -80, -108, 70, 52, 8); ctx.fill();
      ctx.fillStyle = 'rgba(180,220,240,0.45)'; ctx.beginPath(); ctx.moveTo(30, -112); ctx.lineTo(56, -110); ctx.lineTo(58, -60); ctx.lineTo(30, -60); ctx.fill();
      // wheels
      for (const wx of [-60, 62]) { ctx.fillStyle = '#1a1214'; ctx.beginPath(); ctx.arc(wx, -6, 15, 0, TAU); ctx.fill(); ctx.fillStyle = '#9a9a9a'; ctx.beginPath(); ctx.arc(wx, -6, 6, 0, TAU); ctx.fill(); }
      // headlight + number plate
      ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(80, -36, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f4ead8'; ctx.fillRect(-84, -40, 30, 12); H.text(ctx, 'AP 09', -69, -33.5, { font: 'osd', size: 10, color: '#1a1214' });
      // driver (leaning out, khaki uniform, towel)
      const dX = 8, dY = -62, mood = S.patience / 100;
      ctx.fillStyle = '#b8a070'; H.rr(ctx, dX - 14, dY - 30, 28, 32, 6); ctx.fill();
      ctx.fillStyle = '#efe9dc'; ctx.fillRect(dX - 14, dY - 30, 9, 26);
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(dX + 2, dY - 42, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(dX + 2, dY - 46, 12.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.beginPath(); ctx.moveTo(dX - 6, dY - 36); ctx.quadraticCurveTo(dX + 4, dY - 41, dX + 12, dY - 36); ctx.quadraticCurveTo(dX + 4, dY - 33, dX - 6, dY - 36); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.fillRect(dX - 3, dY - 46, 3, 3); ctx.fillRect(dX + 7, dY - 46, 3, 3);
      if (mood < 0.3) { ctx.strokeStyle = '#1a1412'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(dX - 5, dY - 51); ctx.lineTo(dX + 1, dY - 49); ctx.moveTo(dX + 12, dY - 51); ctx.lineTo(dX + 6, dY - 49); ctx.stroke(); }
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(dX + 10, dY - 22); ctx.lineTo(dX + 34, dY - 16); ctx.stroke(); // hand on the handle
      if (S.bubble && S.bubble.t < 1.2 && Math.sin(S.time * 10) > 0) { ctx.beginPath(); ctx.moveTo(dX - 12, dY - 22); ctx.lineTo(dX - 30, dY - 40); ctx.stroke(); }
      ctx.restore();
    }

    function drawCart(ctx, S, L, g) {
      const sc = L.sc, x = L.vx, y = L.ground;
      const turn = S.leave > 0 ? Math.min(1, S.leave * 1.5) : 0;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 80, 7, 0, 0, TAU); ctx.fill();
      // vendor behind the cart
      const vx = -10, vy = -58;
      const banana = S.who === 'banana';
      ctx.fillStyle = banana ? '#e8e2d2' : '#e8487c'; H.rr(ctx, vx - 15, vy - 36, 30, 40, 7); ctx.fill();
      ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(vx, vy - 48, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = banana ? '#f4efe2' : '#1a1412'; ctx.beginPath(); ctx.arc(vx, vy - 52, 12.5, Math.PI, TAU); ctx.fill();
      if (!banana) { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(vx + 9 + Math.cos(i) * 3, vy - 55 + i * 2.5, 2, 0, TAU); ctx.fill(); } ctx.fillStyle = '#b22b2b'; ctx.beginPath(); ctx.arc(vx, vy - 52, 1.3, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.moveTo(vx - 7, vy - 43); ctx.quadraticCurveTo(vx, vy - 47, vx + 7, vy - 43); ctx.quadraticCurveTo(vx, vy - 40, vx - 7, vy - 43); ctx.fill(); }
      ctx.fillStyle = '#1a1412'; ctx.fillRect(vx - 5, vy - 51, 3, 3); ctx.fillRect(vx + 3, vy - 51, 3, 3);
      if (turn) { ctx.fillStyle = 'rgba(244,234,216,' + turn * 0.7 + ')'; ctx.fillRect(vx - 16, vy - 62, 32, 70); }
      // the cart
      ctx.fillStyle = '#8a5a34'; ctx.fillRect(-70, -40, 140, 14);
      ctx.fillStyle = '#6a3a24'; ctx.fillRect(-64, -26, 6, 22); ctx.fillRect(58, -26, 6, 22);
      ctx.fillStyle = '#1a1214'; ctx.beginPath(); ctx.arc(-40, -8, 12, 0, TAU); ctx.arc(40, -8, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a8a8a'; ctx.beginPath(); ctx.arc(-40, -8, 4, 0, TAU); ctx.arc(40, -8, 4, 0, TAU); ctx.fill();
      if (banana) {
        ctx.fillStyle = '#4f7a3a'; ctx.beginPath(); ctx.ellipse(0, -42, 72, 8, 0, 0, TAU); ctx.fill(); // banana leaves
        for (let b = 0; b < 5; b++) {
          const bx = -52 + b * 26, by = -44;
          for (let k = 0; k < 5; k++) { ctx.strokeStyle = k % 2 ? '#f2c230' : '#e8b820'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(bx + k * 2, by - 8, 12, Math.PI * 0.85, Math.PI * 1.6); ctx.stroke(); }
          ctx.fillStyle = '#5a4a1a'; ctx.fillRect(bx + 2, by - 24, 4, 6);
        }
        // hanging scale
        ctx.strokeStyle = '#4a4450'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(55, -100); ctx.lineTo(55, -80); ctx.moveTo(40, -80); ctx.lineTo(70, -80); ctx.moveTo(42, -80); ctx.lineTo(42, -68); ctx.moveTo(68, -80); ctx.lineTo(68, -68); ctx.stroke();
        ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.ellipse(42, -66, 7, 2.5, 0, 0, TAU); ctx.ellipse(68, -66, 7, 2.5, 0, 0, TAU); ctx.fill();
      } else {
        // marigold + jasmine garlands
        for (let i = 0; i < 7; i++) {
          const gx = -54 + i * 18;
          for (let k = 0; k < 7; k++) { ctx.fillStyle = i % 2 ? (k % 2 ? '#ffffff' : '#f4f0e0') : (k % 2 ? '#ef8a2a' : '#f2b22a'); ctx.beginPath(); ctx.arc(gx + Math.sin(k) * 2, -50 - k * 5, i % 2 ? 2.6 : 4, 0, TAU); ctx.fill(); }
        }
        ctx.fillStyle = '#c8402a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-50 + i * 25, -44, 5, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    /** a seller from the waist up, in the cart's local units (head r 12 at y-48 above the shoulders at y). */
    function vendorFig(ctx, x, y, o) {
      const sk = o.skin || '#8a5a35';
      ctx.fillStyle = o.shirt || '#e8e2d2'; H.rr(ctx, x - 15, y - 36, 30, 40, 7); ctx.fill();
      if (o.drape) { ctx.fillStyle = o.drape; ctx.beginPath(); ctx.moveTo(x - 15, y - 34); ctx.lineTo(x - 6, y - 36); ctx.lineTo(x + 15, y + 2); ctx.lineTo(x + 4, y + 4); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = sk; ctx.beginPath(); ctx.arc(x, y - 48, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = o.hair || '#1a1412';
      if (o.back) { ctx.beginPath(); ctx.arc(x, y - 48, 12.5, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(x, y - 52, 12.5, Math.PI, TAU); ctx.fill(); }
      if (o.bun) { ctx.beginPath(); ctx.arc(x + 10, y - 56, 6, 0, TAU); ctx.fill(); }
      if (o.cap) { ctx.fillStyle = o.cap; ctx.beginPath(); ctx.arc(x, y - 54, 12, Math.PI, TAU); ctx.fill(); ctx.fillRect(x - 12, y - 55, 24, 3); }
      if (o.back) return;
      if (o.beard) { ctx.fillStyle = o.beard; ctx.beginPath(); ctx.arc(x, y - 44, 10, 0.1, Math.PI - 0.1); ctx.fill(); }
      ctx.fillStyle = '#1a1412'; ctx.fillRect(x - 5, y - 51, 3, 3); ctx.fillRect(x + 3, y - 51, 3, 3);
      if (o.glasses) { ctx.strokeStyle = '#1a1412'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x - 3.5, y - 49.5, 3.6, 0, TAU); ctx.moveTo(x + 8.1, y - 49.5); ctx.arc(x + 4.5, y - 49.5, 3.6, 0, TAU); ctx.moveTo(x - 0.1, y - 50); ctx.lineTo(x + 0.9, y - 50); ctx.stroke(); }
      if (o.moustache) { ctx.fillStyle = o.beard || '#1a1412'; ctx.beginPath(); ctx.moveTo(x - 7, y - 43); ctx.quadraticCurveTo(x, y - 47, x + 7, y - 43); ctx.quadraticCurveTo(x, y - 40, x - 7, y - 43); ctx.fill(); }
      else if (!o.beard) { ctx.strokeStyle = '#4a2a1a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y - 45, 3.5, 0.3, Math.PI - 0.3); ctx.stroke(); }
      if (o.bindi) { ctx.fillStyle = '#c8202a'; ctx.beginPath(); ctx.arc(x, y - 56, 1.6, 0, TAU); ctx.fill(); }
    }

    // kite stall (Gulzar Houz), vegetable heaps (Rythu Bazaar), footpath books (Koti)
    function drawStall(ctx, S, L, g) {
      const sc = L.sc, x = L.vx, y = L.ground, t = S.time;
      const back = S.leave > 0.35;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 92, 7, 0, 0, TAU); ctx.fill();
      if (S.who === 'kite') {
        // a string of kites over the stall
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-100, -170); ctx.quadraticCurveTo(0, -150, 100, -170); ctx.stroke();
        const cols = ['#e2483a', '#f2c230', '#2a8c82', '#7a3db8', '#e8487c', '#3b6fc4', '#ef8a2a'];
        for (let i = 0; i < 7; i++) {
          const kx = -84 + i * 28, ky = -158 + Math.abs(i - 3) * -2.4 + 18, sw = Math.sin(t * 1.6 + i) * 0.12;
          ctx.save(); ctx.translate(kx, ky - 16); ctx.rotate(sw);
          ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, 15); ctx.lineTo(0, 32); ctx.lineTo(-11, 15); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 32); ctx.moveTo(-11, 15); ctx.quadraticCurveTo(0, 9, 11, 15); ctx.stroke();
          ctx.fillStyle = cols[(i + 3) % 7]; ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(4, 40); ctx.lineTo(-4, 40); ctx.fill();
          ctx.restore();
        }
        vendorFig(ctx, -8, -56, { shirt: '#f4efe2', cap: '#ffffff', beard: '#e4e0d8', moustache: true, skin: '#8a5a35', back });
        // the table: kites fanned out, charkhis of cotton saddi
        ctx.fillStyle = '#8a5a34'; ctx.fillRect(-82, -42, 164, 12); ctx.fillStyle = '#6a3a24'; ctx.fillRect(-76, -30, 7, 30); ctx.fillRect(69, -30, 7, 30);
        for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(-50, -44); ctx.rotate(-0.5 + i * 0.25); ctx.fillStyle = cols[(i + 1) % 7]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -14); ctx.lineTo(0, -30); ctx.lineTo(-10, -14); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
        for (let i = 0; i < 3; i++) {
          const cx = 22 + i * 20, cy = -54;
          ctx.fillStyle = '#c89a5a'; ctx.fillRect(cx - 8, cy - 2, 16, 14); ctx.fillStyle = ['#e8487c', '#f4efe2', '#e2483a'][i]; ctx.fillRect(cx - 7, cy + 1, 14, 8);
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(cx - 7, cy + 2 + k * 2); ctx.lineTo(cx + 7, cy + 2 + k * 2); ctx.stroke(); }
          ctx.fillStyle = '#6a3a24'; ctx.fillRect(cx - 2, cy + 12, 4, 6);
        }
      } else if (S.who === 'farmer') {
        vendorFig(ctx, 10, -30, { shirt: '#2f8a3a', drape: '#ef8a2a', bun: true, bindi: true, skin: '#7a4a2a', back });
        // a hand scale hanging from the shed
        ctx.strokeStyle = '#4a4450'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(62, -120); ctx.lineTo(62, -98); ctx.moveTo(46, -98); ctx.lineTo(78, -98 + Math.sin(t * 2) * 1.5); ctx.moveTo(48, -98); ctx.lineTo(48, -84); ctx.moveTo(76, -98); ctx.lineTo(76, -84); ctx.stroke();
        ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.ellipse(48, -82, 8, 2.5, 0, 0, TAU); ctx.ellipse(76, -82, 8, 2.5, 0, 0, TAU); ctx.fill();
        // gunny sack + heaps
        ctx.fillStyle = '#b89a6a'; H.rr(ctx, -96, -22, 192, 22, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(80,60,30,0.35)'; ctx.lineWidth = 1; for (let k = -92; k < 92; k += 6) { ctx.beginPath(); ctx.moveTo(k, -22); ctx.lineTo(k + 3, 0); ctx.stroke(); }
        const heap = (hx, n, r, col, shine) => { let k = 0; for (let row = 0; row < n; row++) for (let j = 0; j < n - row; j++) { const px = hx + (j - (n - row - 1) / 2) * r * 1.8, py = -24 - row * r * 1.5; ctx.fillStyle = col[(k++) % col.length]; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill(); if (shine) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(px - r * 0.35, py - r * 0.35, r * 0.25, 0, TAU); ctx.fill(); } } };
        heap(-64, 4, 6, ['#d8302a', '#c8282a', '#e2483a'], true);
        heap(-18, 4, 5.5, ['#c06a8a', '#b25a7a', '#d08aa0'], false);
        for (let i = 0; i < 5; i++) { const bx = 24 + (i % 3) * 13, by = -28 - ((i / 3) | 0) * 9; ctx.fillStyle = '#5a2a6a'; ctx.beginPath(); ctx.ellipse(bx, by, 7, 4.5, 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = '#3c7a3a'; ctx.beginPath(); ctx.arc(bx - 6, by - 2, 2.5, 0, TAU); ctx.fill(); }
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#3c8a3a' : '#4fa04a'; ctx.beginPath(); ctx.ellipse(76 + i * 4, -30 - (i % 2) * 4, 6, 9, -0.3 + i * 0.2, 0, TAU); ctx.fill(); }
      } else {
        // books: the book man on his stool, stacks on a blue tarp
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(40, -24, 4, 24); ctx.fillRect(58, -24, 4, 24); ctx.fillRect(36, -28, 30, 5);
        vendorFig(ctx, 50, -34, { shirt: '#c8d8e8', glasses: true, moustache: true, hair: '#4a4a4a', skin: '#8a5a35', back });
        ctx.fillStyle = '#2a5a9a'; ctx.beginPath(); ctx.moveTo(-104, 0); ctx.lineTo(34, 0); ctx.lineTo(28, -16); ctx.lineTo(-96, -16); ctx.closePath(); ctx.fill();
        const spines = ['#b22b2b', '#2a8c82', '#f2c230', '#3b6fc4', '#e8e2d2', '#7a3db8', '#ef8a2a', '#4f7a3a'];
        for (let s = 0; s < 5; s++) {
          const n = 4 + ((s * 3) % 4), bx = -90 + s * 24;
          for (let k = 0; k < n; k++) { const w = 20 - ((s + k) % 3) * 2, h = 5; ctx.fillStyle = spines[(s * 5 + k * 3) % spines.length]; ctx.fillRect(bx + ((k * 7) % 3) - 1, -8 - (k + 1) * h, w, h - 0.8); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(bx + 3, -8 - (k + 1) * h + 1.5, w * 0.4, 1); }
        }
        ctx.fillStyle = '#f4efe2'; ctx.save(); ctx.translate(-20, -60); ctx.rotate(-0.08); ctx.fillRect(-18, -9, 36, 18); ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1; ctx.strokeRect(-18, -9, 36, 18);
        H.text(ctx, '½ PRICE', 0, 0.5, { font: 'osd', size: 10, color: '#b22b2b', maxW: 32 }); ctx.restore();
      }
      ctx.restore();
    }

    MG.register(def);
  }

  /* ================================================================ MARBLES */
  // Goli / kanche (systems_design §8.8), ring game, in the colony playground. Take turns with Pappu
  // (or Tiger, params.rival:'tiger') flicking your striker from outside the ring: every marble knocked
  // out of the ring is yours. Knock one out and stay in the ring = shoot again from there. First to
  // floor(total/2)+1 wins. The big swirl is the jackpot (worth 3). With the raja_goli (inventory or
  // params.rajaGoli) your striker is 25% heavier and the aim guide 30% longer.
  {
    const R = 16, MR = 1.0, SR = 1.3, FRIC = 9, DRAG = 0.5, SM = 1.9;
    const T = (MG.TUNE.marbles = Object.assign({ count: 9, shots: 9, rivalErr: 0.11, rivalErrDiff: 0.6, tigerErr: 0.055, powerJitter: 0.3, tigerJitter: 0.16, rajaMass: 1.25, rajaGuide: 1.3 }, MG.TUNE.marbles || {}));
    const RIVALS = {
      pappu: { name: 'Pappu', shirt: '#2a8c82' },
      tiger: { name: 'Tiger', shirt: '#1a1a2a', cap: '#d8302a', tiger: true },
    };
    const GLASS = ['#3fa0e0', '#e0483a', '#3ac06a', '#f2c230', '#9a5ae0', '#ef7d1a', '#2ac0c0', '#e85a9a'];
    const def = {
      id: 'marbles',
      title: 'Goli Maar',
      sub: 'Kanche in the colony playground. Pappu is good. You are better.',
      osd: 'COLONY PLAYGROUND',
      place: 'playground_', places: ['playground_', 'playground_home', 'school_'],
      secs: 80,
      goLabel: 'MAARO!',
      keys: { KeyA: 'mleft', KeyD: 'mright', ArrowUp: 'mleft', ArrowDown: 'mright', BracketLeft: 'mleft', BracketRight: 'mright', ArrowLeft: 'aleft', ArrowRight: 'aright', Space: 'shoot', Enter: 'shoot' },
      buttons: () => [],
      keyHint: () => '<kbd>A</kbd>/<kbd>D</kbd> move round the ring &nbsp; <kbd>←</kbd><kbd>→</kbd> aim &nbsp; hold <kbd>Space</kbd>, let go to flick &nbsp; (or drag with the mouse)',
      howto(g) {
        const rv = rival(g), raja = hasRaja(g);
        return {
          title: rv.tiger ? 'Goli vs Tiger' : undefined,
          sub: rv.tiger ? 'Tiger is thirteen, wears his cap backwards and never misses. Almost never.' : undefined,
          lines: [
            '<b>Drag back</b> from anywhere and let go to flick your striker (like a slingshot). Tap outside the ring to move your shooting spot.',
            'Knock goli <b>out of the ring</b> to win them. Knock one out and stay inside = <b>shoot again</b> from there.',
            'Take turns with ' + rv.name + '. The big swirly <b>jackpot</b> is worth 3. First to ' + need(g) + ' wins.' + (raja ? ' <b>RAJA GOLI</b>: your striker hits harder and the aim line is longer.' : ''),
          ],
          goal: 'FIRST TO ' + need(g) + ' GOLI &middot; ' + total(g) + ' IN THE RING',
          keys: '<kbd>A</kbd>/<kbd>D</kbd> move · <kbd>←</kbd> <kbd>→</kbd> aim · hold <kbd>Space</kbd> + release · or drag the mouse',
          touch: '<b>Drag back</b> and let go to flick · tap outside the ring to move',
        };
      },
      setup(g) {
        const S = g.S, r = g.rng;
        S.score = 0; S.me = 0; S.rival = 0; S.need = need(g); S.total = total(g);
        S.balls = [];
        S.rv = rival(g); S.raja = hasRaja(g);
        if (g.nameEl && S.rv.tiger && !g.params.title) g.nameEl.textContent = 'Goli vs Tiger';
        const n = count(g);
        // a cross + a few strays around the centre, the jackpot in the middle
        S.balls.push({ x: 0, y: 0, vx: 0, vy: 0, r: MR * 1.35, m: 1.8, col: '#ffffff', jack: true, val: 3, rot: 0 });
        const spots = [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2], [6.2, 0], [-6.2, 0], [0, 6.2], [0, -6.2], [4.5, 4.5], [-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5]];
        for (let i = 0; i < n - 1 && i < spots.length; i++) S.balls.push({ x: spots[i][0] + (r.next() - 0.5) * 0.6, y: spots[i][1] + (r.next() - 0.5) * 0.6, vx: 0, vy: 0, r: MR, m: 1, col: GLASS[i % GLASS.length], val: 1, rot: r.next() * TAU });
        S.pebbles = []; for (let i = 0; i < 5; i++) { const a = r.next() * TAU, d = 8 + r.next() * 6; S.pebbles.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.35 + r.next() * 0.25 }); }
        S.turn = 'me'; S.stage = 'aim'; S.st = 0; S.turns = 0; S.myTurns = 0;
        S.pos = Math.PI / 2; // shooting spot on the ring edge (angle; +y is towards you)
        S.aim = -Math.PI / 2; S.power = 0; S.charging = false; S.chargeT = 0;
        S.striker = null; S.again = false; S.knocked = [];
        S.drag = null; S.msg = null; S.flying = []; S.time = 0;
        placeStriker(S, 'me');
      },
      layout(g) { lay(g, g.S); g.S.bgKey = null; },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) { S.time += dt; if (S.msg) S.msg.t += dt; } },
      pointer(g, type, x, y, id) {
        const S = g.S, L = S.L;
        if (S.turn !== 'me' || S.stage !== 'aim' || g.over) { S.drag = null; return; }
        const wx = (x - L.cx) / L.s, wy = (y - L.cy) / L.s;
        if (type === 'down') {
          const d = Math.hypot(wx, wy), sd = Math.hypot(wx - S.striker.x, wy - S.striker.y);
          if (!S.again && d > R + 1.5 && sd > 3) { S.pos = Math.atan2(wy, wx); placeStriker(S, 'me'); g.tone(500, 0.03, { type: 'sine', vol: 0.03 }); return; }
          S.drag = { id, x0: x, y0: y, x, y };
        } else if (type === 'move' && S.drag && S.drag.id === id) {
          S.drag.x = x; S.drag.y = y;
          const dx = S.drag.x0 - x, dy = S.drag.y0 - y, len = Math.hypot(dx, dy);
          if (len > 6) { S.aim = Math.atan2(dy, dx); S.power = U.clamp(len / L.dragMax, 0, 1); }
        } else if (type === 'up' && S.drag && S.drag.id === id) {
          const len = Math.hypot(S.drag.x0 - S.drag.x, S.drag.y0 - S.drag.y);
          S.drag = null;
          if (len > L.dragMax * 0.08) shoot(g, S, S.aim, S.power);
          else S.power = 0;
        }
      },
      bot(g, dt, want) {
        const S = g.S;
        if (S.turn !== 'me' || S.stage !== 'aim') return;
        S.botT = (S.botT || 0) + dt;
        if (S.botT < 0.35) return;
        S.botT = 0;
        const plan = planShot(S, S.again ? null : 'me');
        if (!plan) { shoot(g, S, -Math.PI / 2, 0.5); return; }
        if (!S.again) { S.pos = plan.pos; placeStriker(S, 'me'); }
        const err = want === 'lose' ? 0.7 : 0;
        S.aim = Math.atan2(plan.ty - S.striker.y, plan.tx - S.striker.x) + err;
        shoot(g, S, S.aim, want === 'lose' ? 0.25 : plan.power);
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'TUM', v: S.me + '/' + S.need, good: S.me > S.rival }, { k: S.rv.name.toUpperCase(), v: S.rival + '/' + S.need, warn: S.rival >= S.need - 1 }, { k: 'SHOTS', v: String(Math.max(0, T.shots - S.myTurns)), warn: S.myTurns >= T.shots - 2 }];
      },
      draw(g, ctx) { drawMarbles(g, ctx, g.S); },
      result(g, r) {
        const S = g.S, nm = S.rv.name;
        return {
          title: r.win ? (S.rv.tiger ? 'Tiger ko haraya!' : 'Saari goli meri!') : r.draw ? 'Barabar!' : nm + ' jeet gaya!',
          line: r.win ? (S.rv.tiger ? 'Tiger turns his cap round the right way, just for a second. "Not bad. Not bad at all."' : 'Your pocket clinks all the way home. ' + nm + ' wants a rematch tomorrow.')
            : (S.rv.tiger ? 'Tiger pockets the jackpot. "Practise, then come back." Kal phir.' : nm + ' grins and pockets the jackpot. Kal phir khelenge.'),
          rows: [['Your goli', S.me], [nm + "'s goli", S.rival], ['Shots', S.myTurns], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.rival <= 2 ? 1 : 0) + (S.myTurns <= 6 ? 1 : 0) : 0; },
    };
    function rival(g) { const k = String(g.params.rival || 'pappu').toLowerCase(); const rv = Object.assign({}, RIVALS[k] || RIVALS.pappu); if (g.params.rivalName) rv.name = String(g.params.rivalName); return rv; }
    function hasRaja(g) { return g.params.rajaGoli != null ? !!g.params.rajaGoli : MG.hasItem('raja_goli'); }
    function count(g) { return Math.max(2, Math.min(13, Math.round(g.params.count || T.count))); }
    function total(g) { return count(g) - 1 + 3; }
    function need(g) { return Math.floor(total(g) / 2) + 1; }

    function lay(g, S) {
      const A = g.area, P = g.portrait;
      const L = (S.L = {});
      const room = P ? Math.min(A.w, A.h * 0.78) : Math.min(A.w * 0.62, A.h);
      L.s = room / (2 * R + 12);
      L.cx = A.x + A.w / 2; L.cy = A.y + (P ? A.h * 0.44 : A.h * 0.5);
      L.dragMax = Math.min(g.W, g.H) * 0.32;
      return L;
    }
    function placeStriker(S, who) {
      const a = who === 'me' ? S.pos : S.rpos;
      const raja = who === 'me' && !!S.raja;
      S.striker = { x: Math.cos(a) * (R + 2.2), y: Math.sin(a) * (R + 2.2), vx: 0, vy: 0, r: SR, m: raja ? SM * T.rajaMass : SM, col: who === 'me' ? '#f4efe2' : '#2a2a3a', striker: who, raja, rot: 0 };
      if (who === 'me') S.aim = Math.atan2(-S.striker.y, -S.striker.x);
    }

    function shoot(g, S, ang, power) {
      if (S.stage !== 'aim' && S.stage !== 'rival') return;
      const v = 6 + power * 36;
      S.striker.vx = Math.cos(ang) * v; S.striker.vy = Math.sin(ang) * v;
      S.stage = 'roll'; S.st = 0; S.knocked = [];
      S.power = 0; S.charging = false;
      S.turns++; if (S.turn === 'me') S.myTurns++;
      g.sfx('marble', { vol: 0.5, pitch: 0.8 });
    }

    function physics(g, S, dt) {
      const all = S.balls.concat(S.striker ? [S.striker] : []);
      const n = 4, h = dt / n;
      let moving = false;
      for (let it = 0; it < n; it++) {
        for (const b of all) {
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0) {
            const dec = (FRIC + DRAG * sp) * h;
            const k = sp > dec ? (sp - dec) / sp : 0;
            b.vx *= k; b.vy *= k;
            b.x += b.vx * h; b.y += b.vy * h;
            b.rot += (sp * h) / b.r;
            if (sp > 0.05) moving = true;
          }
        }
        // pairs
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), md = a.r + b.r;
          if (d >= md || d < 1e-6) continue;
          const nx = dx / d, ny = dy / d;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          const ov = md - d, ia = 1 / a.m, ib = 1 / b.m;
          a.x -= nx * ov * ia / (ia + ib); a.y -= ny * ov * ia / (ia + ib);
          b.x += nx * ov * ib / (ia + ib); b.y += ny * ov * ib / (ia + ib);
          if (rel < 0) {
            const jimp = (-(1 + 0.9) * rel) / (ia + ib);
            a.vx -= jimp * ia * nx; a.vy -= jimp * ia * ny;
            b.vx += jimp * ib * nx; b.vy += jimp * ib * ny;
            if (-rel > 2) { g.sfx('marble', { vol: Math.min(1, -rel / 20), pitch: 0.9 + Math.random() * 0.3, key: (i + j) % 3 }); if (-rel > 10) { const p = toS(S, (a.x + b.x) / 2, (a.y + b.y) / 2); g.burst(p.x, p.y, 4, { colors: ['#fff'], kind: 'spark', speed: 120, grav: 0, life: 0.25, size: 2 }); } }
          }
        }
        // pebbles: a little bump that nudges and slows the goli (a real playground is never flat)
        for (const b of all) for (const p of S.pebbles) {
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), md = b.r + p.r;
          if (d >= md || d < 1e-6 || b.bumped === p) continue;
          b.bumped = p;
          const sp = Math.hypot(b.vx, b.vy); if (sp < 0.5) continue;
          const side = Math.sign(dx * b.vy - dy * b.vx) || 1, turn = side * -0.12;
          const c = Math.cos(turn), sn = Math.sin(turn);
          const vx = b.vx * c - b.vy * sn, vy = b.vx * sn + b.vy * c;
          b.vx = vx * 0.92; b.vy = vy * 0.92;
          if (sp > 6) g.tone(900 + Math.random() * 300, 0.02, { type: 'square', vol: 0.015 });
        }
      }
      return moving;
    }

    function resolve(g, S) {
      const who = S.turn;
      let got = 0;
      for (let i = S.balls.length - 1; i >= 0; i--) {
        const b = S.balls[i];
        if (Math.hypot(b.x, b.y) > R + b.r * 0.2) {
          S.balls.splice(i, 1);
          got += b.val;
          if (who === 'me') S.me += b.val; else S.rival += b.val;
          S.flying.push({ b, t: 0, who, from: toS(S, b.x, b.y) });
          const p = toS(S, b.x, b.y);
          g.pop(b.jack ? 'JACKPOT! +3' : '+1', p.x, p.y - 16, { size: b.jack ? 28 : 22, color: who === 'me' ? '#ffd84a' : '#ffb4a6' });
          if (who === 'me') g.sfx('pickup', { vol: 0.6 });
        }
      }
      const st = S.striker;
      const inside = st && Math.hypot(st.x, st.y) < R - st.r * 0.5;
      S.score = S.me * 100;
      if (S.me >= S.need || S.rival >= S.need || S.balls.length === 0 || (S.sudden && S.me !== S.rival)) { end(g, S); return; }
      if (got > 0 && inside) {
        S.again = true;
        S.msg = { text: who === 'me' ? 'PHIR SE MAARO!' : S.rv.name + ' phir se!', t: 0 };
        if (who === 'me') { S.stage = 'aim'; S.aim = Math.atan2(-st.y, -st.x); } else { S.stage = 'rival'; S.st = 0; }
        return;
      }
      S.again = false;
      if (got === 0) S.msg = { text: who === 'me' ? 'Khaali gaya!' : S.rv.name + ' chuk gaya!', t: 0 };
      S.turn = who === 'me' ? 'rival' : 'me';
      if (S.myTurns >= T.shots && S.turn === 'me') {
        if (S.me !== S.rival) { end(g, S); return; }
        if (!S.sudden) { S.sudden = true; S.msg = { text: 'BARABAR! Agli goli jeetegi!', t: 0 }; }
      }
      if (S.turn === 'me') { S.stage = 'aim'; placeStriker(S, 'me'); }
      else { S.stage = 'rival'; S.st = 0; S.rplan = null; }
    }
    function end(g, S) {
      if (g.over) return;
      S.stage = 'done';
      const win = S.me > S.rival;
      S.score = S.me * 100 + (win ? 300 : 0) + Math.max(0, T.shots - S.myTurns) * 30 + (win && S.rv.tiger ? 200 : 0);
      g.finish(win, { mine: S.me, rival: S.rival, draw: S.me === S.rival, opponent: S.rv.tiger ? 'tiger' : 'pappu', raja: !!S.raja, delay: 1.4 });
    }

    // stopping distance from speed v under decel (FRIC + DRAG v), and the speed needed for a distance
    function stopDist(v) { return (v - (FRIC / DRAG) * Math.log(1 + (DRAG * v) / FRIC)) / DRAG; }
    function travel(v0, v1) { return ((v0 - v1) - (FRIC / DRAG) * Math.log((FRIC + DRAG * v0) / (FRIC + DRAG * v1))) / DRAG; }
    function speedFor(dist) { let lo = 0, hi = 120; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (stopDist(m) < dist) lo = m; else hi = m; } return hi; }
    function launchFor(dist, vEnd) { let lo = vEnd, hi = 160; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (travel(m, vEnd) < dist) lo = m; else hi = m; } return hi; }
    // choose a target and a shooting spot that knocks it straight out (fromEdge: search the ring
    // edge; null: shoot from where the striker is). Returns {tx, ty, pos, power, ok}.
    function planShot(S, fromEdge) {
      let best = null, bs = -1e9;
      const spots = [];
      if (fromEdge) for (let k = 0; k < 28; k++) spots.push((k / 28) * TAU);
      else spots.push(null);
      for (const b of S.balls) {
        for (const a of spots) {
          const sx = a == null ? S.striker.x : Math.cos(a) * (R + 2.2), sy = a == null ? S.striker.y : Math.sin(a) * (R + 2.2);
          const ax = b.x - sx, ay = b.y - sy, al = Math.hypot(ax, ay);
          if (al < 0.5) continue;
          const ux = ax / al, uy = ay / al;
          // clear path?
          let blocked = false;
          for (const o of S.balls) { if (o === b) continue; const t = ((o.x - sx) * ux + (o.y - sy) * uy); if (t <= 0 || t >= al) continue; const px = sx + ux * t, py = sy + uy * t; if (Math.hypot(o.x - px, o.y - py) < o.r + SR + 0.15) { blocked = true; break; } }
          // how far must the target travel along u to leave the ring?
          const bu = b.x * ux + b.y * uy, disc = bu * bu - (b.x * b.x + b.y * b.y - R * R);
          const e = -bu + Math.sqrt(Math.max(0, disc)) + b.r + 1.2;
          const vt = speedFor(e);
          const mS = S.striker ? S.striker.m : SM, vi = (vt * (mS + b.m)) / (mS * 1.9);
          const v0 = launchFor(Math.max(0, al - SR - b.r), vi);
          const power = (v0 - 6) / 36;
          const ok = power <= 1;
          const sc = -e * 1.2 - al * 0.15 - (blocked ? 40 : 0) - (ok ? 0 : 25 + (power - 1) * 30) + (b.jack ? 5 : 0);
          if (sc > bs) { bs = sc; best = { tx: b.x, ty: b.y, pos: a, power: U.clamp(power * 1.06, 0.15, 1), ok }; }
        }
      }
      return best;
    }

    function step(g, S, dt) {
      S.time += dt; S.st += dt;
      if (S.msg) S.msg.t += dt;
      for (let i = S.flying.length - 1; i >= 0; i--) { S.flying[i].t += dt; if (S.flying[i].t > 0.9) S.flying.splice(i, 1); }
      if (g.over) { if (S.stage === 'roll') physics(g, S, dt); return; }
      if (S.stage === 'aim' && S.turn === 'me') {
        if (!S.again) {
          const mv = (g.down('mright') ? 1 : 0) - (g.down('mleft') ? 1 : 0);
          if (mv) { S.pos += mv * 0.9 * dt; placeStriker(S, 'me'); }
        }
        const av = (g.down('aright') ? 1 : 0) - (g.down('aleft') ? 1 : 0);
        if (av) S.aim += av * 1.2 * dt;
        if (g.down('shoot')) { S.charging = true; S.chargeT += dt; S.power = 0.5 - 0.5 * Math.cos(S.chargeT * Math.PI / 0.75); }
        else if (S.charging) { S.charging = false; S.chargeT = 0; shoot(g, S, S.aim, Math.max(0.1, S.power)); }
      } else if (S.stage === 'rival') {
        if (!S.rplan) {
          S.rplan = planShot(S, S.again ? null : 'rival');
          if (S.rplan && !S.again) { S.rpos = S.rplan.pos; placeStriker(S, 'rival'); }
          else if (!S.rplan) { S.rpos = -Math.PI / 2; placeStriker(S, 'rival'); S.rplan = { tx: 0, ty: 0, power: 0.6 }; }
          const sd = (S.rv.tiger ? T.tigerErr : T.rivalErr) * (1 - g.diff * T.rivalErrDiff) * (g.auto === 'win' ? 5 : 1);
          const pj = S.rv.tiger ? T.tigerJitter : T.powerJitter;
          S.rplan.aim = (S.rplan ? Math.atan2(S.rplan.ty - S.striker.y, S.rplan.tx - S.striker.x) : Math.PI / 2) + (g.rng.next() + g.rng.next() - 1) * sd;
          S.rplan.power = U.clamp((S.rplan.power || 0.6) * (1 - pj / 2 + g.rng.next() * pj), 0.2, 1);
        }
        if (S.st > 1.2) shoot(g, S, S.rplan.aim, S.rplan.power);
      } else if (S.stage === 'roll') {
        const moving = physics(g, S, dt);
        if ((!moving && S.st > 0.25) || S.st > 8) { for (const b of S.balls) { b.vx = 0; b.vy = 0; } resolve(g, S); }
      }
    }

    /* ------------------------------------------------------------- drawing */
    function toS(S, x, y) { return { x: S.L.cx + x * S.L.s, y: S.L.cy + y * S.L.s }; }

    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, L = S.L;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + g.area.h;
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      // dusty red soil
      const gr = c.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, Math.max(W, Hh) * 0.7);
      gr.addColorStop(0, '#c27a52'); gr.addColorStop(1, '#8e4f34');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      const rng = U.rng(321);
      for (let i = 0; i < 900; i++) { c.fillStyle = rng.next() < 0.5 ? 'rgba(255,220,180,0.08)' : 'rgba(60,25,10,0.1)'; const s = 1 + rng.next() * 2.5; c.fillRect(rng.next() * W, rng.next() * Hh, s, s); }
      // footprints, a neem leaf or two, a bottle cap
      for (let i = 0; i < 6; i++) { const x = rng.next() * W, y = rng.next() * Hh, a = rng.next() * TAU; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = 'rgba(70,30,15,0.15)'; c.beginPath(); c.ellipse(0, 0, L.s * 1.1, L.s * 2.4, 0, 0, TAU); c.fill(); c.restore(); }
      for (let i = 0; i < 4; i++) { const x = rng.next() * W, y = rng.next() * Hh, a = rng.next() * TAU; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = i % 2 ? '#7a9a3a' : '#a8a040'; c.beginPath(); c.ellipse(0, 0, L.s * 0.5, L.s * 1.4, 0, 0, TAU); c.fill(); c.restore(); }
      { const x = W * 0.08, y = Hh * 0.82; c.fillStyle = '#b8b8c0'; c.beginPath(); c.arc(x, y, L.s * 0.9, 0, TAU); c.fill(); c.strokeStyle = '#8a8a90'; c.lineWidth = 1; for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; c.beginPath(); c.moveTo(x + Math.cos(a) * L.s * 0.7, y + Math.sin(a) * L.s * 0.7); c.lineTo(x + Math.cos(a) * L.s * 0.95, y + Math.sin(a) * L.s * 0.95); c.stroke(); } }
      // the ring, scratched with a stick (a slightly wobbly double line)
      c.strokeStyle = 'rgba(255,236,210,0.7)'; c.lineWidth = Math.max(1.5, L.s * 0.22); c.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        c.beginPath();
        for (let i = 0; i <= 90; i++) { const a = (i / 90) * TAU, rr = R + Math.sin(a * 5 + pass) * 0.25 + pass * 0.35; const x = L.cx + Math.cos(a) * rr * L.s, y = L.cy + Math.sin(a) * rr * L.s; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke();
        c.strokeStyle = 'rgba(80,35,20,0.35)'; c.lineWidth = Math.max(1, L.s * 0.12);
      }
      // the gucchi (little pit) in the middle
      c.fillStyle = 'rgba(70,30,15,0.35)'; c.beginPath(); c.ellipse(L.cx, L.cy, L.s * 1.9, L.s * 1.6, 0, 0, TAU); c.fill();
      // pebbles
      for (const p of S.pebbles) { const q = toS(S, p.x, p.y); c.fillStyle = '#9a8a80'; c.beginPath(); c.ellipse(q.x, q.y, p.r * L.s * 1.1, p.r * L.s * 0.85, 0.4, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(q.x - p.r * L.s * 0.3, q.y - p.r * L.s * 0.3, p.r * L.s * 0.35, 0, TAU); c.fill(); }
    }

    function marble(ctx, x, y, r, b) {
      ctx.fillStyle = 'rgba(40,15,5,0.35)'; ctx.beginPath(); ctx.ellipse(x + r * 0.25, y + r * 0.35, r, r * 0.8, 0, 0, TAU); ctx.fill();
      let gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      if (b.raja) { gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.6, '#f2c230'); gr.addColorStop(1, '#a8781a'); }
      else if (b.striker) { gr.addColorStop(0, b.striker === 'me' ? '#ffffff' : '#7a7a90'); gr.addColorStop(1, b.striker === 'me' ? '#c8c0b0' : '#1a1a2a'); }
      else if (b.jack) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8d8e8'); }
      else { gr.addColorStop(0, H.shade(b.col, 1.6)); gr.addColorStop(0.6, b.col); gr.addColorStop(1, H.shade(b.col, 0.55)); }
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      // the swirl (cat's eye) rotates as it rolls
      ctx.save(); ctx.translate(x, y); ctx.rotate(b.rot || 0);
      if (b.jack) {
        const cols = ['#e0483a', '#f2c230', '#3ac06a', '#3fa0e0', '#9a5ae0'];
        cols.forEach((cc, i) => { ctx.strokeStyle = cc; ctx.lineWidth = Math.max(1.2, r * 0.14); ctx.beginPath(); ctx.arc(0, 0, r * (0.25 + i * 0.13), i, i + 2.2); ctx.stroke(); });
      } else if (!b.striker) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.quadraticCurveTo(0, -r * 0.55, r * 0.6, 0); ctx.quadraticCurveTo(0, -r * 0.15, -r * 0.6, 0); ctx.fill();
        ctx.fillStyle = H.shade(b.col, 0.6);
        ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.1); ctx.quadraticCurveTo(0, r * 0.5, r * 0.5, r * 0.1); ctx.quadraticCurveTo(0, r * 0.22, -r * 0.5, r * 0.1); ctx.fill();
      } else { ctx.strokeStyle = b.striker === 'me' ? 'rgba(216,64,42,0.8)' : 'rgba(242,194,48,0.8)'; ctx.lineWidth = Math.max(1.5, r * 0.18); ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU * 0.7); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
    }

    function drawMarbles(g, ctx, S) {
      const W = g.W, Hh = g.H, L = S.L;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const s = L.s;
      // Pappu crouching at the top of the ring, you at the bottom (top-down: head + shoulders + hands)
      const ra = S.rpos != null && S.turn === 'rival' ? S.rpos : g.portrait ? -Math.PI / 2 : 0;
      const rp = toS(S, Math.cos(ra) * (R + 6), Math.sin(ra) * (R + 6));
      kidTop(ctx, rp.x, rp.y, s, S.rv.shirt, Math.atan2(L.cy - rp.y, L.cx - rp.x), S.turn === 'rival' && S.stage === 'roll' && S.st < 0.2, S.rv.cap);
      if (S.turn === 'me' && S.striker && S.striker.striker === 'me') {
        const a = Math.atan2(S.striker.y, S.striker.x), mp = toS(S, Math.cos(a) * (R + 6.5), Math.sin(a) * (R + 6.5));
        if (!S.again) kidTop(ctx, mp.x, mp.y, s, '#d8402a', Math.atan2(L.cy - mp.y, L.cx - mp.x), S.stage === 'roll' && S.st < 0.2);
      }
      // aim + power (yours) / Pappu's faint aim
      if (S.stage === 'aim' && S.turn === 'me' && S.striker) {
        const p = toS(S, S.striker.x, S.striker.y);
        const len = (6 + S.power * 18 + 6) * s * (S.raja ? T.rajaGuide : 1);
        ctx.strokeStyle = 'rgba(255,246,200,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(S.aim) * len, p.y + Math.sin(S.aim) * len); ctx.stroke(); ctx.setLineDash([]);
        const ex = p.x + Math.cos(S.aim) * len, ey = p.y + Math.sin(S.aim) * len;
        ctx.fillStyle = 'rgba(255,246,200,0.9)'; ctx.beginPath(); ctx.moveTo(ex + Math.cos(S.aim) * 8, ey + Math.sin(S.aim) * 8); ctx.lineTo(ex + Math.cos(S.aim + 2.5) * 8, ey + Math.sin(S.aim + 2.5) * 8); ctx.lineTo(ex + Math.cos(S.aim - 2.5) * 8, ey + Math.sin(S.aim - 2.5) * 8); ctx.fill();
        // slingshot band while dragging
        if (S.drag) { ctx.strokeStyle = 'rgba(216,64,42,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(S.aim) * S.power * L.dragMax * 0.6, p.y - Math.sin(S.aim) * S.power * L.dragMax * 0.6); ctx.stroke(); }
        // power bar next to the striker
        const bw = Math.max(46, s * 9), bx = p.x - bw / 2, by = p.y + s * 2.6 + (p.y > L.cy ? 4 : -s * 6.5);
        ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, bx - 2, by - 2, bw + 4, 10, 5); ctx.fill();
        ctx.fillStyle = S.power > 0.8 ? '#ff6a4a' : '#ffd84a'; H.rr(ctx, bx, by, bw * S.power, 6, 3); ctx.fill();
      }
      if (S.stage === 'rival' && S.rplan && S.striker && S.st > 0.3) {
        const p = toS(S, S.striker.x, S.striker.y), a = S.rplan.aim, len = Math.min(1, (S.st - 0.3) / 0.6) * 14 * s;
        ctx.strokeStyle = 'rgba(234,242,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len); ctx.stroke(); ctx.setLineDash([]);
      }
      // marbles
      for (const b of S.balls) { const p = toS(S, b.x, b.y); marble(ctx, p.x, p.y, b.r * s, b); }
      if (S.striker) { const p = toS(S, S.striker.x, S.striker.y); marble(ctx, p.x, p.y, S.striker.r * s, S.striker); }
      // won marbles fly to the owner's pile
      for (const f of S.flying) {
        const k = H.ease.inOut(Math.min(1, f.t / 0.9)), to = pileXY(g, S, f.who, f.who === 'me' ? S.me : S.rival);
        marble(ctx, lerp(f.from.x, to.x, k), lerp(f.from.y, to.y, k) - Math.sin(k * Math.PI) * 40, f.b.r * s, f.b);
      }
      // piles (counted)
      drawPile(ctx, g, S, 'me', S.me); drawPile(ctx, g, S, 'rival', S.rival);
      // turn banner + message
      const ty = g.portrait ? L.cy + (R + 10) * s : g.area.y + g.area.h - 18;
      H.text(ctx, S.turn === 'me' ? (S.again ? 'PHIR SE! Wahi se maaro' : S.sudden ? 'SUDDEN DEATH: TUMHARI BAARI' : 'TUMHARI BAARI') : S.rv.name.toUpperCase() + ' KI BAARI...', W / 2, Math.min(ty, g.area.y + g.area.h - 16), { font: 'osd', size: 22, color: S.turn === 'me' ? '#ffd84a' : '#eaf2ff', outline: 4 });
      if (S.msg && S.msg.t < 1.4) { const a = S.msg.t > 1 ? 1 - (S.msg.t - 1) / 0.4 : 1; H.text(ctx, S.msg.text, L.cx, L.cy - (R + 4) * s, { font: 'display', size: Math.max(24, s * 3.4), color: '#fff6c8', outline: 6, alpha: a }); }
      if (S.stage === 'aim' && S.turn === 'me' && !S.again && S.st < 4 && S.myTurns === 0) H.text(ctx, g.touch ? 'drag back + let go · tap outside to move' : 'drag back + let go (or Space) · click outside to move', W / 2, L.cy + (R + 4.5) * s + (g.portrait ? 24 : 0), { font: 'body', weight: 700, size: 14, color: '#fff', outline: 4, alpha: 0.85 });
    }
    function pileXY(g, S, who, i) {
      const L = S.L, P = g.portrait;
      const n = Math.max(0, i - 1);
      if (P) return { x: (who === 'me' ? 26 : g.W - 26) + (who === 'me' ? 1 : -1) * (n % 5) * 14, y: g.area.y + g.area.h - 30 - Math.floor(n / 5) * 14 };
      return { x: (who === 'me' ? 40 : g.W - 40) + (who === 'me' ? 1 : -1) * (n % 3) * 16, y: L.cy + 40 - Math.floor(n / 3) * 16 };
    }
    function drawPile(ctx, g, S, who, n) {
      const p0 = pileXY(g, S, who, 1);
      H.text(ctx, who === 'me' ? 'TUM ' + n : S.rv.name.toUpperCase() + ' ' + n, p0.x + (who === 'me' ? 20 : -20), p0.y + (g.portrait ? -28 : -50), { font: 'display', size: 20, color: who === 'me' ? '#ffd84a' : '#eaf2ff', outline: 4, align: who === 'me' ? 'left' : 'right' });
      for (let i = 1; i <= n; i++) { const p = pileXY(g, S, who, i); marble(ctx, p.x, p.y, 6, { col: GLASS[i % GLASS.length], rot: i }); }
    }
    function kidTop(ctx, x, y, s, shirt, face, flick, cap) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(face - Math.PI / 2);
      const k = s * 0.9;
      ctx.fillStyle = 'rgba(40,15,5,0.3)'; ctx.beginPath(); ctx.ellipse(1.5 * k, 2 * k, 4.4 * k, 3.4 * k, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = shirt; H.rr(ctx, -4.2 * k, -2.6 * k, 8.4 * k, 5 * k, 2 * k); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -0.4 * k, 2.2 * k, 0, TAU); ctx.fill();
      if (cap) { // a cap worn backwards: the brim points away from the ring
        ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(0, -0.4 * k, 2.25 * k, 0, TAU); ctx.fill();
        ctx.fillStyle = H.shade(cap, 0.7); H.rr(ctx, -1.6 * k, -3.9 * k, 3.2 * k, 1.8 * k, 0.8 * k); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -0.4 * k, 0.45 * k, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = 1.1 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(2.8 * k, 1.5 * k); ctx.lineTo(2 * k, (flick ? 6.5 : 5) * k); ctx.moveTo(-2.8 * k, 1.5 * k); ctx.lineTo(-3.4 * k, 4.2 * k); ctx.stroke();
      ctx.restore();
    }

    MG.register(def);
  }

  /* ======================================================= side activities */
  // Free-roam access to the minigames at the must-have places (systems_design §2.4, §8). Story
  // interactions win over these (priority -1). Turn off with N.minigames.side(false) or
  // N.flags.mg_side_off = true. match: exact place ids, or prefixes ending with '_'.
  // Money: at most 3 paid wins per minigame per game-day; cricket ₹2 (₹5 for 3 stars), marbles ₹2
  // (₹5 against Tiger), kite ₹2 a cut (max ₹10 a day), brick game refunds its ₹1 on a win, pani puri
  // gives a free plate (tummy +15), antenna / clap / bargain pay nothing. A lost free-roam bargain
  // closes that seller for 10 game minutes.
  const SIDE = (MG.SIDE = [
    { id: 'kite', match: ['home_terrace', 'gulzar_houz'], label: 'Fly a patang', params: { difficulty: 0.35 }, when: kiteOpen },
    { id: 'antenna', match: ['home', 'friend_home'], label: 'Fix the TV antenna', params: { difficulty: 0.35 }, dx: 14 },
    { id: 'clap', match: ['golconda_fateh_darwaza'], label: 'Clap under the dome', params: { difficulty: 0.4, skin: 'golconda' }, when: () => between(9 * 60, 17 * 60 + 30) },
    { id: 'brickgame', match: ['video_parlour_'], label: 'Brick game (₹1)', cost: 100, params: { difficulty: 0.4 } },
    { id: 'cricket', match: ['playground_', 'victory_playground', 'musi_riverbed'], label: 'Join gully cricket', params: { difficulty: 0.4 }, when: cricketOpen },
    { id: 'marbles', match: ['playground_', 'victory_playground'], label: 'Play goli', params: { difficulty: 0.4 }, dx: 22 },
    { id: 'marbles', match: ['playground_14'], label: 'Goli vs Tiger', params: { difficulty: 0.5, rival: 'tiger' }, dx: -22, when: tigerOpen },
    { id: 'panipuri', match: ['gokul_chat'], label: 'Pani puri challenge (₹5)', cost: 500, params: { difficulty: 0.4 } },
    { id: 'bargain', match: ['koti_bus_stand', 'rtc_x_roads', 'nampally_station', 'kachiguda_station', 'imlibun_bus_station'], label: 'Haggle with an auto', params: { who: 'auto' }, dx: -18 },
    { id: 'bargain', match: ['banana_cart_'], label: 'Haggle for bananas', params: { who: 'banana' } },
    { id: 'bargain', match: ['flower_cart_'], label: 'Haggle for flowers', params: { who: 'flower' } },
    { id: 'bargain', match: ['rythu_bazaar_'], label: 'Haggle at the stall', params: { who: 'farmer' }, dx: 16 },
  ]);
  const PAY = (MG.TUNE.pay = Object.assign({ cricket: 200, cricket3: 500, marbles: 200, tiger: 500, kiteCut: 200, kiteDay: 1000, dailyWins: 3, bargainOff: 10, panipuriTummy: 15 }, MG.TUNE.pay || {}));
  // the day ledger (saved with the game, not in localStorage)
  const ledger = (MG.ledger = { day: null, paid: {}, kite: 0, off: {} });

  /* ---------------------------------------------------------- time rules */
  function cal() { return N.calendar && N.calendar.inRange ? N.calendar : null; }
  function minutes() { return N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 12 * 60; }
  function between(a, b) { const m = minutes(); return m >= a && m <= b; }
  function absMin() { return ((N.clock && N.clock.day) || 0) * 1440 + minutes(); }
  function kiteOpen() {
    if (N.flags && N.flags.sankranti) return true;
    const C = cal(); if (!C) return true;
    try { return C.inRange('01-13', '01-15') || (C.inRange('01-01', '02-29') && between(16 * 60 + 30, 18 * 60 + 30)); } catch (e) { return true; }
  }
  function cricketOpen() {
    const C = cal(); if (!C || !C.isSchoolDay) return true;
    try { return C.isSchoolDay() ? between(16 * 60, 18 * 60 + 30) : between(8 * 60, 18 * 60 + 30); } catch (e) { return true; }
  }
  function golis() {
    const C = N.collectibles; if (!C) return 0;
    try { if (typeof C.count === 'function') for (const k of ['goli', 'golis']) { const n = C.count(k); if (typeof n === 'number' && isFinite(n) && n > 0) return n; } } catch (e) { /* ignore */ }
    try { let n = 0; if (C.found && C.found.forEach) C.found.forEach((id) => { if (/^(g\d|goli)/i.test(String(id))) n++; }); return n; } catch (e) { return 0; }
  }
  function tigerOpen() { return !!(N.flags && N.flags.marbles_tiger) || golis() >= 10; }

  /* --------------------------------------------------------------- money */
  function today() {
    const d = (N.clock && N.clock.day) || 0;
    if (ledger.day !== d) { ledger.day = d; ledger.paid = {}; ledger.kite = 0; }
    return ledger;
  }
  function give(paise, why) {
    const pl = N.player; if (!pl || !(paise > 0)) return 0;
    pl.money = (pl.money || 0) + paise;
    try { N.emit('money', { delta: paise, total: pl.money, why }); } catch (e) { /* ignore */ }
    return paise;
  }
  function toast(t) { try { if (N.hud && N.hud.toast) N.hud.toast(t, 2600); } catch (e) { /* ignore */ } }
  /** Pay out a free-roam result (systems_design §2.4). Returns the paise paid. */
  function pay(s, r, place) {
    if (!r || r.aborted || r.error) return 0;
    const L = today(), title = (defs[s.id] && defs[s.id].title) || s.id;
    if (s.id === 'bargain') {
      if (r.win) { if (r.savedPaise) toast('Saved ' + U.fmtMoney(r.savedPaise) + '!'); }
      else if (!r.quit) L.off[sideKey(s, place)] = absMin() + PAY.bargainOff;
      return 0;
    }
    if (s.id === 'clap') { if (r.win) toast('Golconda heard you.'); return 0; }
    if (s.id === 'panipuri') {
      if (r.win) { try { N.player && N.player.feed && N.player.feed(PAY.panipuriTummy); } catch (e) { /* ignore */ } toast('Free plate! ' + (r.eaten || r.score || '') + ' puris, Bhaiya is impressed.'); }
      return 0;
    }
    if (s.id === 'brickgame') { if (r.win && s.cost) { give(s.cost, 'brickgame'); toast('FREE GAME! ' + U.fmtMoney(s.cost) + ' back'); } return 0; }
    if (s.id === 'kite') {
      const cuts = Math.max(0, r.cuts | 0); if (!cuts) return 0;
      const amt = Math.min(cuts * PAY.kiteCut, Math.max(0, PAY.kiteDay - L.kite));
      if (amt <= 0) { toast('Bo kaata! (no more prize money today)'); return 0; }
      L.kite += amt; give(amt, 'kite'); toast('+' + U.fmtMoney(amt) + ' · ' + cuts + ' cut' + (cuts > 1 ? 's' : ''));
      return amt;
    }
    if (!r.win) return 0;
    let amt = 0;
    if (s.id === 'cricket') amt = r.stars >= 3 ? PAY.cricket3 : PAY.cricket;
    else if (s.id === 'marbles') amt = r.opponent === 'tiger' ? PAY.tiger : PAY.marbles;
    if (!amt) return 0;
    const n = L.paid[s.id] || 0;
    if (n >= PAY.dailyWins) { toast(title + ': no more prize money today. Play for fun!'); return 0; }
    L.paid[s.id] = n + 1;
    give(amt, s.id); toast('+' + U.fmtMoney(amt) + ' · ' + title);
    return amt;
  }
  MG.pay = pay;

  /* --------------------------------------------------------------- install */
  const sideIds = [];
  function placeMatches(id, m) { return m.slice(-1) === '_' ? id.indexOf(m) === 0 : id === m; }
  function sideKey(s, place) { return s.id + ':' + ((s.params && s.params.who) || '') + ':' + place; }
  MG.side = function (on) {
    const I = N.interact;
    for (const k of sideIds) { try { I && I.remove(k); } catch (e) { /* ignore */ } }
    sideIds.length = 0;
    if (on === false || !I || !I.add || !N.places) return 0;
    // places that carry a `minigame` field in the map data get it too (unless SIDE already covers them)
    try {
      const raw = (N.WORLD_DATA && N.WORLD_DATA.places) || [];
      for (const rp of raw) {
        const gid = rp && rp.minigame && MG.resolve(rp.minigame);
        if (!gid || !N.places[rp.id] || SIDE.some((s) => s.id === gid && s.match.some((m) => placeMatches(rp.id, m)))) continue;
        const p = N.places[rp.id], key = 'mg:' + gid + ':data:' + rp.id;
        sideIds.push(key);
        I.add(key, { x: p.x, y: p.y, r: Math.max(14, Math.min(26, (p.r || 20) * 0.6)), priority: -1, label: 'Play: ' + (defs[gid].title || gid),
          enabled: () => !N.flags.mg_side_off && !cur, use: () => { MG.play(gid, { place: rp.id }); } });
      }
    } catch (e) { N.err('minigames.side.data', e); }
    for (const id of Object.keys(N.places)) {
      const p = N.places[id];
      SIDE.forEach((s, si) => {
        if (!defs[s.id] || !s.match.some((m) => placeMatches(id, m))) return;
        const key = 'mg:' + s.id + ':' + si + ':' + id;
        sideIds.push(key);
        I.add(key, {
          x: p.x + (s.dx || 0), y: p.y + (s.dy || 0), r: Math.max(14, Math.min(26, (p.r || 20) * 0.6)), priority: -1,
          label: s.label,
          enabled: (pl) => {
            if (N.flags.mg_side_off || cur || (s.cost && ((pl && pl.money) || 0) < s.cost)) return false;
            const off = ledger.off[sideKey(s, id)]; if (off && absMin() < off) return false;
            try { return !s.when || !!s.when(); } catch (e) { return true; }
          },
          use: (pl) => {
            if (s.cost) { pl.money -= s.cost; N.emit('money', { delta: -s.cost, total: pl.money }); }
            MG.play(s.id, Object.assign({ place: id, side: true }, s.params || {})).then((r) => {
              try { pay(s, r, id); } catch (e) { N.err('minigames.pay', e); }
            });
          },
        });
      });
    }
    return sideIds.length;
  };

  /* ================================================================ boot */
  function onBoot() {
    try {
      if (N.save && N.save.register) {
        N.save.register('minigames', {
          serialize: () => Object.assign(JSON.parse(JSON.stringify(stats)), { ledger: JSON.parse(JSON.stringify(ledger)) }),
          deserialize: (o) => {
            if (!o || typeof o !== 'object') return;
            for (const k of ['best', 'plays', 'wins']) if (o[k] && typeof o[k] === 'object') Object.assign(stats[k], o[k]);
            const l = o.ledger;
            if (l && typeof l === 'object') { ledger.day = l.day == null ? null : l.day; ledger.paid = Object.assign({}, l.paid); ledger.kite = +l.kite || 0; ledger.off = Object.assign({}, l.off); }
          },
        });
      }
    } catch (e) { N.err('minigames.save', e); }
    try { MG.side(true); } catch (e) { N.err('minigames.side', e); }
  }
  N.on('boot', onBoot);
  N.on('world:built', () => { if (sideIds.length) MG.side(true); });
  if (N.world && N.world.built) onBoot();
})();
