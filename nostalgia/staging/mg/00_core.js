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
  function hasItem(id) { try { const inv = N.player && N.player.inventory; return !!(inv && (inv.has ? inv.has(id) : inv[id])) || itemCount(id) > 0; } catch (e) { return false; } }
  function itemCount(id) { try { const p = N.player; return p ? (typeof p.itemCount === 'function' ? p.itemCount(id) : (p.items && p.items[id]) | 0) : 0; } catch (e) { return 0; } }

  let cur = null; // the open Game

  const MG = (N.minigames = {
    VERSION: 1,
    defs,
    stats,
    TUNE,
    helpers: H,
    hasItem, itemCount,
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
      let bonus = 0; try { bonus = (def.diffBonus && +def.diffBonus(params)) || 0; } catch (e) { /* ignore */ }  // e.g. Ayesha bowls +0.2
      this.diff = clamp(base + bonus + presetOffset() - (this.assist ? TUNE.assistDiff : 0), TUNE.diffMin, TUNE.diffMax);
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
