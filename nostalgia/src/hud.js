/* NOSTALGIA — hud.js
 * DOM HUD in #ui, styled as hand-painted tin signboards + a VHS on-screen display:
 * OSD strip (▶ PLAY, clock, date, district), money tin, energy bar, the Chappal Meter
 * (5 slipper icons), objective strip, mission timer, toasts, centre banners, the GTA-style
 * district banner and a north-up minimap (pre-rendered world image, blips, route line along
 * the road graph, edge arrows). Contract: ARCHITECTURE.md §10 (+ "hud.js notes" there).
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const TAU = Math.PI * 2;

  const dom = {};
  const state = {
    money: null, moneyShown: 0, moneyAnim: null, energy: -1, exhausted: null, wanted: -1,
    clock: '', dateDay: -1, district: null, distCand: null, distT: 0, distCheck: 0,
    timer: null, toasts: [], banners: [], bannerT: 0, bannerCur: null,
    hidden: false, mmT: 0,
  };

  /* -------------------------------------------------------------- helpers */
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Hawai chappal seen from above: foot-shaped sole, V strap, toe post.
  const CHAPPAL_SVG =
    '<svg viewBox="0 0 20 40" aria-hidden="true">' +
    '<path class="sole" d="M10 1.5C15.6 1.5 18.2 6 17.8 12.6 17.4 18.6 15 22.6 14.6 27.6 14.3 32.6 14.2 38.4 10 38.6 5.8 38.4 5.7 32.6 5.4 27.6 5 22.6 2.6 18.6 2.2 12.6 1.8 6 4.4 1.5 10 1.5Z"/>' +
    '<path class="strap" d="M10 8.5 3.6 19.5M10 8.5 16.4 19.5"/>' +
    '<circle class="post" cx="10" cy="8.5" r="1.7"/></svg>';
  const RUNNER_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="10" cy="2.6" r="2"/>' +
    '<path d="M8.6 5.2 5.4 6.8 3.6 9.6M8.6 5.2 7.6 9.4 10.6 11.2 9.8 15M7.6 9.4 5.2 12.6 2 13M8.6 5.2 11.4 8.2 14 8.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------------------------------------------------------- build */
  function build() {
    const ui = document.getElementById('ui') || el('div', '', document.body);
    if (!ui.id) ui.id = 'ui';
    const root = el('div', 'hud', ui);
    root.id = 'hud';
    dom.root = root;

    dom.osd = el('div', 'hud-osd', root,
      '<div class="osd-row1"><span class="osd-play">&#9654; PLAY</span><span class="osd-sp">SP</span></div>' +
      '<div class="osd-row2"><span class="osd-time">--:--</span><span class="osd-date"></span><span class="osd-year"></span></div>' +
      '<div class="osd-dist"></div>');
    dom.time = dom.osd.querySelector('.osd-time');
    dom.date = dom.osd.querySelector('.osd-date');
    dom.year = dom.osd.querySelector('.osd-year');
    dom.dist = dom.osd.querySelector('.osd-dist');

    dom.stats = el('div', 'hud-stats', root);
    dom.money = el('div', 'tin hud-money', dom.stats, '<span class="m-val"></span><span class="m-delta"></span>');
    dom.moneyVal = dom.money.querySelector('.m-val');
    dom.moneyDelta = dom.money.querySelector('.m-delta');
    dom.energy = el('div', 'hud-energy', dom.stats, '<span class="e-ico">' + RUNNER_SVG + '</span><span class="e-bar"><b></b></span>');
    dom.energyBar = dom.energy.querySelector('b');
    dom.chappal = el('div', 'hud-chappal', dom.stats);
    dom.chappal.setAttribute('aria-label', 'Chappal Meter');
    dom.slippers = [];
    for (let i = 0; i < 5; i++) dom.slippers.push(el('span', 'slipper', dom.chappal, CHAPPAL_SVG));

    // top-centre column: objective, timer and toasts stack without overlapping
    dom.top = el('div', 'hud-top', root);
    dom.obj = el('div', 'hud-obj', dom.top, '<span class="obj-txt"></span>');
    dom.objTxt = dom.obj.querySelector('.obj-txt');
    dom.timer = el('div', 'hud-timer', dom.top, '<span class="t-label"></span><span class="t-val">0:00</span>');
    dom.timerLabel = dom.timer.querySelector('.t-label');
    dom.timerVal = dom.timer.querySelector('.t-val');
    dom.toasts = el('div', 'hud-toasts', dom.top);
    dom.banner = el('div', 'hud-banner', root, '<div class="b-title"></div><div class="b-sub"></div>');
    dom.bTitle = dom.banner.querySelector('.b-title');
    dom.bSub = dom.banner.querySelector('.b-sub');
    dom.district = el('div', 'hud-district', root, '<span class="d-name"></span><span class="d-sub"></span>');
    dom.dName = dom.district.querySelector('.d-name');
    dom.dSub = dom.district.querySelector('.d-sub');

    dom.mm = el('div', 'hud-minimap', root, '<canvas></canvas><span class="mm-n">N</span>');
    dom.mmCanvas = dom.mm.querySelector('canvas');
    dom.mmCtx = dom.mmCanvas.getContext('2d');

    dom.ask = el('div', 'hud-ask', root);
  }

  /* -------------------------------------------------------------- minimap */
  const MM = { img: null, ppu: 0.2, radius: 380, size: 0, dpr: 1 };
  function mapImage() {
    if (MM.img) return MM.img;
    if (!N.world.built) return null;
    const src = N.world.renderMap(MM.ppu);
    const c = N.render.makeCanvas(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    // night-VHS grade: cool + darken the land, keep the roads bright
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#a99fb4'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    MM.img = c;
    return c;
  }
  function sizeMinimap() {
    const r = dom.mmCanvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = Math.round(r.width * dpr);
    if (s > 0 && (s !== MM.size || dpr !== MM.dpr)) {
      MM.size = s; MM.dpr = dpr;
      dom.mmCanvas.width = s; dom.mmCanvas.height = s;
    }
  }

  // blips: id -> {target, color, icon, label, pulse, route, minimap, size}
  const blips = new Map();
  function blipPos(b) {
    const t = b.target;
    if (!t) return null;
    if (typeof t === 'string') { const p = N.places[t]; return p ? p : null; }
    if (t.alive === false) return null;
    if (typeof t.x === 'number') return t;
    return null;
  }

  // Route along the road graph (A*), recomputed when the target or nearest node changes.
  const route = { key: '', pts: null, t: 0, sx: 0, sy: 0 };
  function astar(a, b) {
    const R = N.world.roads, nodes = R.nodes, edges = R.edges;
    if (!a || !b) return null;
    if (a === b) return [a];
    const g = new Map(), from = new Map(), open = [[0, a.id]], closed = new Set();
    g.set(a.id, 0);
    const h = (n) => Math.hypot(n.x - b.x, n.y - b.y);
    let guard = 0;
    while (open.length && guard++ < 6000) {
      // binary heap pop
      const top = open[0], last = open.pop();
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === i) break;
          const tmp = open[i]; open[i] = open[m]; open[m] = tmp; i = m;
        }
      }
      const id = top[1];
      if (closed.has(id)) continue;
      if (id === b.id) {
        const path = [nodes[id]];
        let c = id;
        while (from.has(c)) { c = from.get(c); path.push(nodes[c]); }
        return path.reverse();
      }
      closed.add(id);
      const n = nodes[id], gn = g.get(id);
      // walkers ignore one-way rules: use every incident edge
      for (const eid of n.inc) {
        const e = edges[eid], to = e.a === id ? e.b : e.a;
        if (closed.has(to)) continue;
        const ng = gn + (e.len || Math.hypot(nodes[to].x - n.x, nodes[to].y - n.y)) * (e.kind === 'path' ? 1.15 : 1);
        if (ng < (g.has(to) ? g.get(to) : Infinity)) {
          g.set(to, ng); from.set(to, id);
          open.push([ng + h(nodes[to]), to]);
          let i = open.length - 1;
          while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; const tmp = open[p]; open[p] = open[i]; open[i] = tmp; i = p; }
        }
      }
    }
    return null;
  }
  function updateRoute(dt) {
    let target = null;
    for (const b of blips.values()) if (b.route) { const p = blipPos(b); if (p) { target = p; break; } }
    if (!target || !N.world.roads) { route.pts = null; route.key = ''; return; }
    route.t -= dt;
    const p = N.player;
    const moved = Math.hypot(p.x - route.sx, p.y - route.sy) > 40;
    const key = Math.round(target.x / 8) + ',' + Math.round(target.y / 8);
    if (key === route.key && route.t > 0 && !moved) return;
    route.key = key; route.t = 1.2; route.sx = p.x; route.sy = p.y;
    const direct = Math.hypot(target.x - p.x, target.y - p.y);
    if (direct < 120) { route.pts = [[p.x, p.y], [target.x, target.y]]; return; }
    const R = N.world.roads;
    const a = R.nearestNode(p.x, p.y), b = R.nearestNode(target.x, target.y);
    const path = astar(a, b);
    if (!path) { route.pts = [[p.x, p.y], [target.x, target.y]]; return; }
    const pts = [[p.x, p.y]];
    for (const n of path) pts.push([n.x, n.y]);
    pts.push([target.x, target.y]);
    route.pts = pts;
  }

  function drawMinimap() {
    const c = dom.mmCanvas, g = dom.mmCtx;
    if (!c || !MM.size) return;
    const S = MM.size, img = mapImage();
    const p = N.player;
    const fe = (p.vehicle || p);
    const sp = Math.hypot(fe.vx || 0, fe.vy || 0);
    MM.radius += (U.lerp(360, 620, U.smooth((sp - 50) / 120)) - MM.radius) * 0.04;
    const Rw = MM.radius;
    const scale = S / (2 * Rw);            // px per world unit on the minimap
    const cx = S / 2, cy = S / 2;
    const toX = (x) => cx + (x - p.x) * scale, toY = (y) => cy + (y - p.y) * scale;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = '#1d1622'; g.fillRect(0, 0, S, S);
    if (img) {
      const ppu = MM.ppu;
      const sx = (p.x - Rw) * ppu, sy = (p.y - Rw) * ppu, sw = 2 * Rw * ppu;
      g.imageSmoothingEnabled = true;
      g.drawImage(img, sx, sy, sw, sw, 0, 0, S, S);
    }
    // route line
    if (route.pts && route.pts.length > 1) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      route.pts.forEach((q, i) => { if (i) g.lineTo(toX(q[0]), toY(q[1])); else g.moveTo(toX(q[0]), toY(q[1])); });
      g.strokeStyle = 'rgba(20,10,30,0.55)'; g.lineWidth = Math.max(4, S * 0.032); g.stroke();
      g.strokeStyle = '#ff5fb0'; g.lineWidth = Math.max(2, S * 0.018); g.stroke();
    }
    // blips
    const t = N.time.real;
    const edge = S / 2 - S * 0.07;
    for (const b of blips.values()) {
      if (b.minimap === false) continue;
      const q = blipPos(b); if (!q) continue;
      let X = toX(q.x), Y = toY(q.y);
      const dx = X - cx, dy = Y - cy, d = Math.max(Math.abs(dx), Math.abs(dy));
      const out = d > edge;
      if (out) { if (b.edge === false) continue; X = cx + (dx / d) * edge; Y = cy + (dy / d) * edge; }
      const r = Math.max(3, S * 0.032) * (b.size || 1);
      g.globalAlpha = 1;
      if (b.pulse) {
        const ph = (t * 1.4 + (b.phase || 0)) % 1;
        g.strokeStyle = b.color; g.globalAlpha = 1 - ph; g.lineWidth = Math.max(1.5, S * 0.012);
        g.beginPath(); g.arc(X, Y, r + ph * r * 2.4, 0, TAU); g.stroke();
        g.globalAlpha = 1;
      }
      if (out) { // edge arrow pointing towards it
        const a = Math.atan2(dy, dx);
        g.save(); g.translate(X, Y); g.rotate(a);
        g.fillStyle = '#120d16'; g.beginPath(); g.moveTo(r * 1.6, 0); g.lineTo(-r, -r * 1.2); g.lineTo(-r, r * 1.2); g.closePath(); g.fill();
        g.fillStyle = b.color; g.beginPath(); g.moveTo(r * 1.15, 0); g.lineTo(-r * 0.6, -r * 0.8); g.lineTo(-r * 0.6, r * 0.8); g.closePath(); g.fill();
        g.restore();
        continue;
      }
      drawIcon(g, b.icon, X, Y, r, b.color);
    }
    // player arrow (north-up map, arrow turns)
    g.save(); g.translate(cx, cy); g.rotate(fe.angle || 0);
    const pr = Math.max(4, S * 0.045);
    g.fillStyle = '#120d16';
    g.beginPath(); g.moveTo(pr * 1.5, 0); g.lineTo(-pr, -pr * 1.05); g.lineTo(-pr * 0.45, 0); g.lineTo(-pr, pr * 1.05); g.closePath(); g.fill();
    g.fillStyle = '#fff4cf';
    g.beginPath(); g.moveTo(pr * 1.05, 0); g.lineTo(-pr * 0.62, -pr * 0.7); g.lineTo(-pr * 0.25, 0); g.lineTo(-pr * 0.62, pr * 0.7); g.closePath(); g.fill();
    g.restore();
    // scanlines for the VHS look (cached overlay)
    if (!MM.scan || MM.scan.width !== S) {
      MM.scan = N.render.makeCanvas(S, S);
      const sg = MM.scan.getContext('2d');
      sg.fillStyle = 'rgba(0,0,0,0.12)';
      for (let y = 0; y < S; y += 3) sg.fillRect(0, y, S, 1);
    }
    g.drawImage(MM.scan, 0, 0);
  }
  function drawIcon(g, icon, X, Y, r, col) {
    g.lineWidth = Math.max(1.2, r * 0.35);
    g.strokeStyle = '#120d16';
    g.fillStyle = col;
    g.beginPath();
    if (icon === 'square' || icon === 'shop') g.rect(X - r, Y - r, r * 2, r * 2);
    else if (icon === 'star' || icon === 'mission') {
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.55 : r * 1.35; if (i) g.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr); else g.moveTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr); }
      g.closePath();
    } else if (icon === 'diamond' || icon === 'giver') { g.moveTo(X, Y - r * 1.3); g.lineTo(X + r * 1.1, Y); g.lineTo(X, Y + r * 1.3); g.lineTo(X - r * 1.1, Y); g.closePath(); }
    else if (icon === 'ring') { g.arc(X, Y, r, 0, TAU); g.stroke(); g.strokeStyle = col; g.lineWidth = Math.max(1, r * 0.3); g.beginPath(); g.arc(X, Y, r, 0, TAU); g.stroke(); return; }
    else g.arc(X, Y, r, 0, TAU);
    g.stroke(); g.fill();
  }

  /* ------------------------------------------------------- toasts/banners */
  function pumpToasts() {
    const now = performance.now();
    for (const t of state.toasts) {
      if (!t.shown) { t.shown = now; t.el.classList.add('show'); }
      if (now - t.shown > t.ms && !t.out) { t.out = true; t.el.classList.remove('show'); t.el.classList.add('out'); setTimeout(() => t.el.remove(), 400); }
    }
    state.toasts = state.toasts.filter((t) => !t.out);
  }
  function pumpBanner(dt) {
    if (state.bannerCur) {
      state.bannerT -= dt;
      if (state.bannerT <= 0) { dom.banner.classList.remove('show'); state.bannerCur = null; state.bannerGap = 0.45; }
      return;
    }
    if (state.bannerGap > 0) { state.bannerGap -= dt; return; }
    const b = state.banners.shift();
    if (!b) return;
    state.bannerCur = b; state.bannerT = b.ms / 1000;
    dom.bTitle.textContent = b.title || '';
    dom.bSub.textContent = b.sub || '';
    dom.banner.className = 'hud-banner kind-' + (b.kind || 'info');
    void dom.banner.offsetWidth; // restart the CSS animation
    dom.banner.classList.add('show');
  }

  /* ---------------------------------------------------------------- update */
  function fmtTimer(s) {
    s = Math.max(0, Math.ceil(s));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function update(dt) {
    const p = N.player;
    // clock + date (only touch the DOM when the text changes)
    const cl = N.clock.label();
    if (cl !== state.clock) { state.clock = cl; dom.time.textContent = cl; }
    if (N.clock.day !== state.dateDay) {
      state.dateDay = N.clock.day;
      const dl = N.clock.dateLabel();
      dom.date.textContent = dl.slice(0, -5); dom.year.textContent = dl.slice(-4);
    }
    // money (counts up/down to the new value, shows the delta)
    if (state.money === null) { state.money = p.money; state.moneyShown = p.money; dom.moneyVal.textContent = U.fmtMoney(p.money); }
    if (p.money !== state.money) {
      const d = p.money - state.money;
      state.moneyAnim = { from: state.moneyShown, to: p.money, t: 0 };
      state.money = p.money;
      dom.moneyDelta.textContent = (d > 0 ? '+' : '−') + U.fmtMoney(Math.abs(d)).replace('₹ ', '₹');
      dom.money.classList.remove('gain', 'loss'); void dom.money.offsetWidth;
      dom.money.classList.add(d > 0 ? 'gain' : 'loss');
    }
    if (state.moneyAnim) {
      const a = state.moneyAnim;
      a.t = Math.min(1, a.t + dt / 0.6);
      state.moneyShown = Math.round(U.lerp(a.from, a.to, U.smooth(a.t)));
      dom.moneyVal.textContent = U.fmtMoney(state.moneyShown);
      if (a.t >= 1) state.moneyAnim = null;
    }
    // energy
    const en = Math.round(p.energy);
    if (en !== state.energy || p.exhausted !== state.exhausted) {
      state.energy = en; state.exhausted = p.exhausted;
      dom.energyBar.style.width = U.clamp(en, 0, 100) + '%';
      dom.energy.classList.toggle('low', en < 30);
      dom.energy.classList.toggle('tired', !!p.exhausted);
    }
    // chappal meter
    const w = N.wanted ? N.wanted.level | 0 : 0;
    if (w !== state.wanted) {
      const up = w > state.wanted && state.wanted >= 0;
      state.wanted = w;
      dom.slippers.forEach((s, i) => s.classList.toggle('on', i < w));
      dom.chappal.classList.toggle('active', w > 0);
      if (up) { dom.chappal.classList.remove('shake'); void dom.chappal.offsetWidth; dom.chappal.classList.add('shake'); }
    }
    // district: banner when it changes (and stays changed for a moment)
    state.distCheck -= dt;
    if (state.distCheck <= 0 && N.world.built) {
      state.distCheck = 0.25;
      const d = N.world.districtAt(p.x, p.y);
      const id = d ? d.id : null;
      if (id !== state.district) {
        if (id !== state.distCand) { state.distCand = id; state.distT = 0; }
        state.distT += 0.25;
        if (state.distT >= 0.5 || state.district === null) {
          state.district = id;
          dom.dist.textContent = d ? d.name.toUpperCase() : '';
          if (d && N.state.mode === 'play') H.districtBanner(d.name, d.nameTe || null);
        }
      } else state.distCand = id;
    }
    // timer countdown (only while playing)
    const T = state.timer;
    if (T) {
      if (T.countdown && N.state.mode === 'play') T.value = Math.max(0, T.value - dt);
      const txt = fmtTimer(T.value);
      if (txt !== T.txt) { T.txt = txt; dom.timerVal.textContent = txt; }
      dom.timer.classList.toggle('urgent', T.value <= 10);
    }
    pumpToasts();
    pumpBanner(dt);
    updateRoute(dt);
  }

  /* ------------------------------------------------------------------ API */
  const H = (N.hud = {
    objectiveText: null,
    blips,
    /** Set (or clear) the current objective strip. */
    objective(text) {
      text = text || null;
      const changed = text !== H.objectiveText;
      H.objectiveText = text;
      if (dom.obj) {
        dom.objTxt.textContent = text || '';
        dom.obj.classList.toggle('show', !!text);
        if (changed && text) { dom.obj.classList.remove('flash'); void dom.obj.offsetWidth; dom.obj.classList.add('flash'); }
      }
      if (changed) N.emit('hud:objective', text);
    },
    /** Queue a short message (top-left on desktop, top-centre on phones). */
    toast(text, ms) {
      if (!dom.toasts || !text) return;
      const e = el('div', 'hud-toast', dom.toasts);
      e.textContent = text;
      state.toasts.push({ el: e, ms: ms || 2800, shown: 0, out: false });
      while (state.toasts.length > 3) { const t = state.toasts.shift(); t.el.remove(); }
    },
    /** Big centre banner. opts.kind: 'pass' | 'fail' | 'busted' | 'chapter' | 'info' (inferred from the title when omitted). */
    banner(title, sub, ms, opts) {
      opts = opts || {};
      let kind = opts.kind;
      if (!kind) {
        const t = String(title || '').toUpperCase();
        kind = /PASSED|COMPLETE|SHABASH/.test(t) ? 'pass' : /FAILED|PAKDA|THAK|BUSTED/.test(t) ? 'fail' : 'info';
      }
      // results (passed / failed / busted) cut in front of title cards and info banners
      if (kind === 'pass' || kind === 'fail' || kind === 'busted') {
        state.banners = state.banners.filter((b) => b.kind !== 'chapter' && b.kind !== 'info');
        if (state.bannerCur && (state.bannerCur.kind === 'chapter' || state.bannerCur.kind === 'info')) {
          state.bannerCur = null; state.bannerGap = 0;
          if (dom.banner) dom.banner.classList.remove('show');
        }
      }
      state.banners.push({ title, sub, ms: ms || 3200, kind });
      if (state.banners.length > 4) state.banners.shift();
      if (!state.bannerCur && !(state.bannerGap > 0)) pumpBanner(0);
    },
    clearBanners() { state.banners.length = 0; if (dom.banner) dom.banner.classList.remove('show'); state.bannerCur = null; },
    /**
     * Minimap/map blip. target: {x, y} | entity | place id. opts: {color, icon: 'dot'|'star'|
     * 'giver'|'shop'|'square'|'ring', label, pulse, route (draw the road route to it), size,
     * minimap:false (full-map only), edge:false (hide when off the minimap)}.
     */
    blip(id, target, opts) {
      opts = opts || {};
      const b = Object.assign({ color: '#f2c230', icon: 'dot', label: '', pulse: false, route: false, size: 1 }, opts, { id, target });
      b.phase = Math.random();
      blips.set(id, b);
      if (b.route) route.key = '';
      return id;
    },
    unblip(id) { blips.delete(id); },
    blipPos,
    /** Current route polyline [[x,y],...] to the routed blip (for the full map). */
    route: () => route.pts,
    /** GTA-style district name card. */
    districtBanner(name, sub) {
      if (!dom.district || !name) return;
      dom.dName.textContent = name;
      dom.dSub.textContent = sub || '';
      dom.district.classList.remove('show'); void dom.district.offsetWidth;
      dom.district.classList.add('show');
      clearTimeout(H._dT);
      H._dT = setTimeout(() => dom.district.classList.remove('show'), 3400);
    },
    /** Mission / minigame countdown: timer(label, seconds) shows it, timer(null) hides it. */
    timer(label, seconds, opts) {
      if (label == null && seconds == null) { state.timer = null; if (dom.timer) dom.timer.classList.remove('show'); return; }
      opts = opts || {};
      const T = state.timer && state.timer.label === label ? state.timer : { label, txt: '' };
      T.value = seconds == null ? 0 : seconds;
      T.countdown = opts.countdown !== false;
      state.timer = T;
      if (dom.timer) { dom.timerLabel.textContent = label || ''; dom.timer.classList.add('show'); }
    },
    timerValue: () => (state.timer ? state.timer.value : null),
    /**
     * Small interactive question card (e.g. "Retry mission?"). buttons: [{label, key?, fn}].
     * Returns a close() function. Only one at a time.
     */
    ask(title, buttons) {
      if (!dom.ask) return () => {};
      dom.ask.innerHTML = '';
      dom.ask.className = 'hud-ask interactive show';
      el('div', 'ask-title', dom.ask).textContent = title;
      const row = el('div', 'ask-row', dom.ask);
      const close = () => { dom.ask.className = 'hud-ask'; dom.ask.innerHTML = ''; H._askClose = null; };
      (buttons || []).forEach((b, i) => {
        const btn = el('button', 'sign-btn small' + (i ? ' alt' : ''), row);
        btn.type = 'button'; btn.tabIndex = -1;
        btn.innerHTML = (b.key ? '<kbd>' + esc(b.key) + '</kbd> ' : '') + esc(b.label);
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); close(); try { b.fn && b.fn(); } catch (err) { N.err('hud.ask', err); } });
      });
      H._askClose = close;
      return close;
    },
    closeAsk() { if (H._askClose) H._askClose(); },
    show() { state.hidden = false; if (dom.root) dom.root.classList.remove('hud-hidden'); },
    hide() { state.hidden = true; if (dom.root) dom.root.classList.add('hud-hidden'); },
    /** Re-read layout (called on resize). */
    layout() { if (dom.mmCanvas) sizeMinimap(); },
    /** Pre-rendered minimap base image (also handy for the full map). */
    mapImage,
  });

  N.on('render:resize', () => { if (dom.mmCanvas) requestAnimationFrame(sizeMinimap); });
  N.on('clock:set', () => { state.dateDay = -1; });
  N.on('save:loaded', () => { state.dateDay = -1; state.wanted = -1; state.money = null; });
  N.on('game:new', () => { state.dateDay = -1; state.district = null; state.distCand = null; state.wanted = -1; state.money = null; H.objective(null); H.timer(null); H.clearBanners(); H.closeAsk(); });
  N.on('game:continue', () => { state.dateDay = -1; state.district = null; state.wanted = -1; state.money = null; });
  N.on('game:quit', () => { H.objective(null); H.timer(null); H.clearBanners(); H.closeAsk(); });

  N.addSystem({
    id: 'hud', order: 80, runIn: ['*'],
    init() { build(); sizeMinimap(); },
    update(dt) {
      const m = N.state.mode;
      if (m === 'boot' || m === 'title') return;
      update(dt);
    },
    draw() {
      const m = N.state.mode;
      if (m === 'boot' || m === 'title' || state.hidden) return;
      if (!MM.size) sizeMinimap();
      drawMinimap();
    },
    reset() {
      blips.clear(); route.pts = null; route.key = '';
      state.toasts.forEach((t) => t.el.remove()); state.toasts = [];
    },
  });
})();
