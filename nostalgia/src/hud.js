/* NOSTALGIA — hud.js
 * DOM HUD in #ui, styled as hand-painted tin signboards + a VHS on-screen display:
 * OSD strip (▶ PLAY, clock, date, district), money tin, energy bar, the Chappal Meter
 * (5 slipper icons), objective strip, mission timer, toasts, centre banners, the GTA-style
 * district banner and a north-up minimap (pre-rendered world image, blips, route line along
 * the road graph, edge arrows). Contract: ARCHITECTURE.md §10 (+ "hud.js notes" there).
 *
 * Story layer additions (systems §13.2, §14.2; story-core agent):
 *  - OSD: `▶ PLAY [cassette] SIDE A 083` (the tape counter from N.tape, `● REC` prompt, greyed
 *    `■ PAUSED`), the date from N.calendar (spins during a VHS jump) with `↻` while the week loops.
 *    The cassette icon is the touch RADIO button (tap = next source, hold = off).
 *  - Energy bar with the tummy notch (bar dimmed above N.player.tummy) and a chai-glass icon that
 *    blinks when hungry; a quick-item slot (best edible; click/tap eats one).
 *  - Walkman now-playing strip on the minimap; dashed hint search circles: searchCircle(id, {x, y, r}|null).
 *  - Sound captions: caption(text, {x, y, ms, kind, always}) or the 'caption' event; "[whistle ↗]"
 *    towards the sound (N.settings.captions, off by default; kind 'tape' story lines always show).
 *  - One centre message at a time: toasts queue (one visible, deduped, compressed when busy) and are
 *    held while a banner / J-card / ask card / dialogue is up; the district card waits for banners.
 *  - jcard(spec | null): the mission J-card prompt card (missions.js drives it).
 *  - banner(title, sub, ms, {kind, note}): `note` is a handwritten third line (Immu's scribble).
 *
 * Gameplay / UX audit (design/audit/gameplay.md): blipColor(col) colour-blind palettes (Settings
 * "Colour-blind blips" used to change nothing), BLIP_MAX size clamp, fmtMoney (₹ 9,99,999), speech
 * bubbles under the HUD + dodgeBarks()/keepOutRects(), an aria label on the Chappal Meter.
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
    timer: null, toasts: [], tq: [], banners: [], bannerT: 0, bannerCur: null,
    hidden: false, mmT: 0, tummy: -1, hungry: null, tape: '', tapeCls: '', rec: '', loop: null, dateLbl: '',
    qitem: undefined, qT: 0, walk: '', distPending: null, caps: [], circles: new Map(), jc: null,
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

  // Money on the tin: paise matter below ₹1,000 (chai is ₹1.50); above that the paise are dropped and
  // the rupees get Indian grouping (₹ 9,99,999), so a big purse (the testing build's unlimited money)
  // stays narrow enough for the phone-portrait HUD next to the VHS OSD.
  function fmtTin(paise) {
    paise = Math.round(paise || 0);
    if (Math.abs(paise) < 100000) return U.fmtMoney(paise);
    const neg = paise < 0, r = String(Math.floor(Math.abs(paise) / 100));
    const last3 = r.slice(-3), rest = r.slice(0, -3);
    return (neg ? '-' : '') + '₹ ' + (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
  }

  // Colour-blind blips (settings "Colour-blind blips": menus.js sets body.cb-deutan / cb-protan / cb-tritan
  // and N.settings.colorBlind). Every blip colour is sorted into a hue family and drawn in a palette that
  // stays apart for that kind of colour vision (Okabe-Ito based; danger stays the darkest, goals the
  // brightest). Shapes already differ per kind (star / diamond / ring / dot / square).
  const CB_PAL = {
    // red-green (deutan, protan): red -> vermillion, orange -> amber, yellow -> lemon, green -> sky blue,
    // teal -> blue, blue -> deep blue, pink / purple -> light reddish purple
    deutan: { red: '#d55e00', orange: '#e69f00', yellow: '#f0e442', green: '#56b4e9', teal: '#0072b2', blue: '#0072b2', pink: '#f2a6d8', grey: null },
    protan: { red: '#c85a00', orange: '#e69f00', yellow: '#f0e442', green: '#56b4e9', teal: '#0072b2', blue: '#0072b2', pink: '#f2a6d8', grey: null },
    // blue-yellow (tritan): yellow -> warm white, orange -> red-orange, pink / purple -> red, blue / teal -> cyan
    tritan: { red: '#e8202a', orange: '#ff6a3a', yellow: '#fff2e0', green: '#2fbf7f', teal: '#29d3e0', blue: '#29d3e0', pink: '#ff2a55', grey: null },
  };
  const cbCache = new Map();
  function hueFamily(col) {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(col || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.12) return 'grey';
    let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    if (hue < 18 || hue >= 345) return 'red';
    if (hue < 42) return 'orange';
    if (hue < 70) return 'yellow';
    if (hue < 160) return 'green';
    if (hue < 200) return 'teal';
    if (hue < 260) return 'blue';
    return 'pink';
  }
  function cbMode() {
    const S = N.settings;
    const m = S && (typeof S.get === 'function' ? S.get('colorBlind') : S.colorBlind);
    return m && CB_PAL[m] ? m : null;
  }
  /** The colour a blip (or the route line) is drawn in under the current colour-blind setting. */
  function blipColor(col) {
    const mode = cbMode();
    if (!mode || !col) return col;
    const key = mode + col;
    let v = cbCache.get(key);
    if (v === undefined) { const f = hueFamily(col); v = (f && CB_PAL[mode][f]) || col; cbCache.set(key, v); }
    return v;
  }
  // Blip sizes are clamped: one module asking for size 4-5 used to cover a third of the minimap.
  const BLIP_MAX = 2.2;

  // Hawai chappal seen from above: foot-shaped sole, V strap, toe post.
  const CHAPPAL_SVG =
    '<svg viewBox="0 0 20 40" aria-hidden="true">' +
    '<path class="sole" d="M10 1.5C15.6 1.5 18.2 6 17.8 12.6 17.4 18.6 15 22.6 14.6 27.6 14.3 32.6 14.2 38.4 10 38.6 5.8 38.4 5.7 32.6 5.4 27.6 5 22.6 2.6 18.6 2.2 12.6 1.8 6 4.4 1.5 10 1.5Z"/>' +
    '<path class="strap" d="M10 8.5 3.6 19.5M10 8.5 16.4 19.5"/>' +
    '<circle class="post" cx="10" cy="8.5" r="1.7"/></svg>';
  const CHAI_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="glass" d="M3.2 1.8h9.6l-1.5 12.1a1.2 1.2 0 0 1-1.2 1H5.9a1.2 1.2 0 0 1-1.2-1z"/>' +
    '<path class="chai" d="M4.3 6.2h7.4l-1 7.7H5.3z"/><path class="rim" d="M3.4 4h9.2"/></svg>';
  const CASSETTE_SVG =
    '<svg viewBox="0 0 26 18" aria-hidden="true"><rect class="shell" x="1" y="1" width="24" height="16" rx="2.2"/>' +
    '<rect class="win" x="5" y="4.5" width="16" height="6.5" rx="3.2"/>' +
    '<g class="reel r1"><circle cx="8.6" cy="7.75" r="2.3"/><path d="M8.6 5.5v4.5M6.4 7.75h4.4"/></g>' +
    '<g class="reel r2"><circle cx="17.4" cy="7.75" r="2.3"/><path d="M17.4 5.5v4.5M15.2 7.75h4.4"/></g>' +
    '<path class="foot" d="M6 17l1.8-3.4h10.4L20 17"/></svg>';
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
      '<div class="osd-row1"><span class="osd-play">&#9654; PLAY</span>' +
      '<button type="button" class="osd-cas interactive" tabindex="-1" aria-label="Walkman / radio">' + CASSETTE_SVG + '</button>' +
      '<span class="osd-tape"><span class="tp-side">SIDE A</span><span class="tp-pause">&#9632; PAUSED</span><span class="tp-num">000</span></span>' +
      '<span class="osd-rec">&#9679; REC</span></div>' +
      '<div class="osd-row2"><span class="osd-time">--:--</span><span class="osd-date"></span><span class="osd-year"></span><span class="osd-loop" title="the week loops">&#8635;</span></div>' +
      '<div class="osd-dist"></div>');
    dom.time = dom.osd.querySelector('.osd-time');
    dom.date = dom.osd.querySelector('.osd-date');
    dom.year = dom.osd.querySelector('.osd-year');
    dom.loop = dom.osd.querySelector('.osd-loop');
    dom.dist = dom.osd.querySelector('.osd-dist');
    dom.tape = dom.osd.querySelector('.osd-tape');
    dom.tapeNum = dom.osd.querySelector('.tp-num');
    dom.rec = dom.osd.querySelector('.osd-rec');
    dom.cas = dom.osd.querySelector('.osd-cas');
    // the cassette icon is the touch RADIO button: tap = next source, hold 0.6 s = off
    const casUp = () => { if (dom.cas._held) { dom.cas._held = false; dom.cas.classList.remove('on'); try { N.input.hold('radio', false); } catch (e) { N.err('hud.cas', e); } } };
    dom.cas.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dom.cas._held = true; dom.cas.classList.add('on'); try { N.input.hold('radio', true); } catch (er) { N.err('hud.cas', er); } });
    dom.cas.addEventListener('pointerup', casUp);
    dom.cas.addEventListener('pointercancel', casUp);
    dom.cas.addEventListener('pointerleave', casUp);
    window.addEventListener('pointerup', casUp, true);

    dom.stats = el('div', 'hud-stats', root);
    dom.money = el('div', 'tin hud-money', dom.stats, '<span class="m-val"></span><span class="m-delta"></span>');
    dom.moneyVal = dom.money.querySelector('.m-val');
    dom.moneyDelta = dom.money.querySelector('.m-delta');
    dom.energy = el('div', 'hud-energy', dom.stats, '<span class="e-ico">' + CHAI_SVG + '</span><span class="e-bar"><b></b><i class="e-tummy"></i><em class="e-notch"></em></span>');
    dom.energyBar = dom.energy.querySelector('b');
    dom.tummyDim = dom.energy.querySelector('.e-tummy');
    dom.tummyNotch = dom.energy.querySelector('.e-notch');
    void RUNNER_SVG;
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
    dom.district = el('div', 'hud-district', root, '<span class="d-name"></span><span class="d-sub" lang="te"></span>');
    dom.dName = dom.district.querySelector('.d-name');
    dom.dSub = dom.district.querySelector('.d-sub');

    dom.mm = el('div', 'hud-minimap', root, '<canvas></canvas><span class="mm-n">N</span><span class="mm-walk"><span></span></span>');
    dom.mmWalk = dom.mm.querySelector('.mm-walk');
    dom.mmWalkTxt = dom.mmWalk.querySelector('span');
    dom.mmCanvas = dom.mm.querySelector('canvas');
    dom.mmCtx = dom.mmCanvas.getContext('2d');

    dom.ask = el('div', 'hud-ask', root);

    // quick-item slot (best edible; click / tap to eat)
    dom.qitem = el('button', 'hud-qitem interactive', root, '<span class="q-ico"></span><span class="q-name"></span><span class="q-n"></span>');
    dom.qitem.type = 'button'; dom.qitem.tabIndex = -1;
    dom.qitem.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { if (N.player.eat) N.player.eat(); } catch (er) { N.err('hud.qitem', er); } state.qT = 0; });
    // sound captions + the mission J-card prompt
    dom.caps = el('div', 'hud-caps', root);
    dom.jcard = el('div', 'hud-jcard', root);
  }

  /* -------------------------------------------------------------- minimap */
  const MM = { img: null, ppu: 0.2, radius: 380, size: 0, dpr: 1 };
  function mapImage() {
    if (MM.img) return MM.img;
    if (!N.world.built) return null;
    // a canvas of our own (not N.world's cached copy), graded in place: one 3000 x 2250 image, not two
    const c = N.world.renderMap(MM.ppu, { fresh: true }), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
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
  const route = { key: '', pts: null, t: 0, sx: 0, sy: 0, a: -1, b: -1 };
  // Walkers ignore one-way rules (every incident edge) and may cut along footpaths (x1.15).
  // N.world.roads.route is a heap A* sized for the 15k-node map (a cross-city trip expands a few
  // thousand nodes); the budget only stops a pathological search from stalling a frame.
  const GPS_OPTS = { walk: true, paths: true, costs: { path: 1.15 }, maxExpand: 40000 };
  function astar(a, b) {
    if (!a || !b) return null;
    return N.world.roads.route(a, b, GPS_OPTS);
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
    // same end nodes as the last search (riding along one road): keep the route, just move its start
    if (a && b && route.pts && route.pts.length > 2 && route.a === a.id && route.b === b.id) { route.pts[0] = [p.x, p.y]; route.pts[route.pts.length - 1] = [target.x, target.y]; return; }
    route.a = a ? a.id : -1; route.b = b ? b.id : -1;
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
    // hint search circles (dashed, systems §6.5)
    if (state.circles.size) {
      g.save();
      g.setLineDash([Math.max(3, S * 0.03), Math.max(3, S * 0.025)]);
      for (const ci of state.circles.values()) {
        const cr = ci.r * scale;
        g.lineWidth = Math.max(3, S * 0.022); g.strokeStyle = 'rgba(20,10,30,0.6)';
        g.beginPath(); g.arc(toX(ci.x), toY(ci.y), cr, 0, TAU); g.stroke();
        g.lineWidth = Math.max(1.5, S * 0.012); g.strokeStyle = ci.color || '#f2c230';
        g.beginPath(); g.arc(toX(ci.x), toY(ci.y), cr, 0, TAU); g.stroke();
      }
      g.restore();
    }
    // route line
    if (route.pts && route.pts.length > 1) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      route.pts.forEach((q, i) => { if (i) g.lineTo(toX(q[0]), toY(q[1])); else g.moveTo(toX(q[0]), toY(q[1])); });
      g.strokeStyle = 'rgba(20,10,30,0.55)'; g.lineWidth = Math.max(4, S * 0.032); g.stroke();
      g.strokeStyle = blipColor('#ff5fb0'); g.lineWidth = Math.max(2, S * 0.018); g.stroke();
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
      const r = Math.max(3, S * 0.032) * Math.min(BLIP_MAX, b.size || 1);
      const col = blipColor(b.color);
      g.globalAlpha = 1;
      if (b.pulse) {
        const ph = (t * 1.4 + (b.phase || 0)) % 1;
        g.strokeStyle = col; g.globalAlpha = 1 - ph; g.lineWidth = Math.max(1.5, S * 0.012);
        g.beginPath(); g.arc(X, Y, r + ph * r * 2.4, 0, TAU); g.stroke();
        g.globalAlpha = 1;
      }
      if (out) { // edge arrow pointing towards it
        const a = Math.atan2(dy, dx);
        g.save(); g.translate(X, Y); g.rotate(a);
        g.fillStyle = '#120d16'; g.beginPath(); g.moveTo(r * 1.6, 0); g.lineTo(-r, -r * 1.2); g.lineTo(-r, r * 1.2); g.closePath(); g.fill();
        g.fillStyle = col; g.beginPath(); g.moveTo(r * 1.15, 0); g.lineTo(-r * 0.6, -r * 0.8); g.lineTo(-r * 0.6, r * 0.8); g.closePath(); g.fill();
        g.restore();
        continue;
      }
      drawIcon(g, b.icon, X, Y, r, col);
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
  // One toast at a time (systems §13.2: never stack messages). Toasts wait while something else
  // owns the centre (a banner, the J-card, the ask card, dialogue, cutscenes) and are shown
  // for less time when several are queued.
  function centreBusy() {
    const m = N.state.mode;
    return !!state.bannerCur || !!state.jc || !!(dom.ask && dom.ask.classList.contains('show')) || m === 'dialogue' || m === 'cutscene' || m === 'paused' || m === 'map' || m === 'journal';
  }
  function pumpToasts(dt) {
    const busy = centreBusy();
    dom.toasts.classList.toggle('held', busy);
    let t = state.toasts[0];
    if (t && !busy) {
      if (!t.shown) { t.shown = true; t.left = t.ms; t.el.classList.add('show'); }
      if (state.tq.length >= 2) t.left = Math.min(t.left, 1600);
      else if (state.tq.length === 1) t.left = Math.min(t.left, 2600);
      t.left -= dt * 1000;
      if (t.left <= 0 && (t.ms - t.left) > 700) {
        state.toasts.shift();
        const e0 = t.el; e0.classList.remove('show'); e0.classList.add('out'); setTimeout(() => e0.remove(), 300);
        t = null;
        state.toastGap = 0.18;
      }
    }
    if (state.toastGap > 0) state.toastGap -= dt;
    // a queued toast whose `until` (predicate or N.time.now deadline) lapsed is dropped unseen
    while (state.tq.length && toastStale(state.tq[0])) state.tq.shift();
    if (!state.toasts.length && state.tq.length && !busy && !(state.toastGap > 0)) {
      const q = state.tq.shift();
      const e = el('div', 'hud-toast', dom.toasts);
      e.textContent = q.text;
      state.toasts.push({ el: e, text: q.text, ms: q.ms, left: q.ms, shown: false, key: q.key, tag: q.tag });
    }
  }
  function toastStale(q) {
    const u = q.until;
    if (typeof u === 'function') { try { return !u(); } catch (e) { return true; } }
    return typeof u === 'number' && N.time.now > u;
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
    if (!dom.bNote) dom.bNote = el('div', 'b-note', dom.banner);
    dom.bNote.textContent = b.note || '';
    if (dom.district) dom.district.classList.remove('show');
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
    const C = N.calendar;
    const dl = C && C.displayLabel ? C.displayLabel() : N.clock.dateLabel();
    if (dl !== state.dateLbl || N.clock.day !== state.dateDay) {
      state.dateDay = N.clock.day; state.dateLbl = dl;
      dom.date.textContent = dl.slice(0, -5); dom.year.textContent = dl.slice(-4);
    }
    const lp = !!N.clock.looping;
    if (lp !== state.loop) { state.loop = lp; dom.loop.classList.toggle('show', lp); }
    // tape counter + ● REC prompt
    const TP = N.tape;
    if (TP) {
      const txt = TP.side === 'B' ? 'SIDE B' : ('000' + Math.max(0, Math.min(999, TP.shown | 0))).slice(-3);
      if (txt !== state.tape) { state.tape = txt; dom.tapeNum.textContent = TP.side === 'B' ? '' : txt; dom.tape.querySelector('.tp-side').textContent = TP.side === 'B' ? 'SIDE B' : 'SIDE A'; }
      const R = TP.recState;
      const cls = (TP.paused ? 'paused ' : '') + (TP.rolling ? 'rolling ' : '') + (R ? 'rec-' + R.phase : '');
      if (cls !== state.tapeCls) { state.tapeCls = cls; dom.tape.className = 'osd-tape ' + cls; dom.osd.classList.toggle('recording', !!R); }
      const rl = R ? R.label : '';
      if (rl !== state.rec) { state.rec = rl; dom.rec.textContent = rl || '● REC'; dom.rec.classList.toggle('show', !!R); }
    }
    // walkman now-playing strip + spinning reels
    const WK = N.walkman && N.walkman.playing;
    const wl = WK ? '♪ ' + String(WK.title || '').toUpperCase() : '';
    if (wl !== state.walk) { state.walk = wl; dom.mmWalkTxt.textContent = wl; dom.mmWalk.classList.toggle('show', !!wl); dom.cas.classList.toggle('playing', !!wl); }
    // money (counts up/down to the new value, shows the delta)
    if (state.money === null) { state.money = p.money; state.moneyShown = p.money; dom.moneyVal.textContent = fmtTin(p.money); }
    if (p.money !== state.money) {
      const d = p.money - state.money;
      state.moneyAnim = { from: state.moneyShown, to: p.money, t: 0 };
      state.money = p.money;
      dom.moneyDelta.textContent = (d > 0 ? '+' : '−') + fmtTin(Math.abs(d)).replace('₹ ', '₹');
      dom.money.classList.remove('gain', 'loss'); void dom.money.offsetWidth;
      dom.money.classList.add(d > 0 ? 'gain' : 'loss');
    }
    if (state.moneyAnim) {
      const a = state.moneyAnim;
      a.t = Math.min(1, a.t + dt / 0.6);
      state.moneyShown = Math.round(U.lerp(a.from, a.to, U.smooth(a.t)));
      dom.moneyVal.textContent = fmtTin(state.moneyShown);
      if (a.t >= 1) state.moneyAnim = null;
    }
    // energy + the tummy notch (energy can never go above tummy; systems §2.2)
    const en = Math.round(p.energy);
    if (en !== state.energy || p.exhausted !== state.exhausted) {
      state.energy = en; state.exhausted = p.exhausted;
      dom.energyBar.style.width = U.clamp(en, 0, 100) + '%';
      dom.energy.classList.toggle('low', en < 30);
      dom.energy.classList.toggle('tired', !!p.exhausted);
    }
    const tm = Math.round(U.clamp(p.tummy == null ? 100 : p.tummy, 0, 100));
    if (tm !== state.tummy) {
      state.tummy = tm;
      dom.tummyDim.style.left = tm + '%';
      dom.tummyNotch.style.left = tm + '%';
      dom.energy.classList.toggle('full-tummy', tm >= 99);
    }
    const hg = !!p.hungry;
    if (hg !== state.hungry) { state.hungry = hg; dom.energy.classList.toggle('hungry', hg); }
    // quick-item slot
    state.qT -= dt;
    if (state.qT <= 0) {
      state.qT = 0.25;
      const id = p.bestEdible ? p.bestEdible() : null;
      const key = id ? id + ':' + (p.items[id] | 0) : null;
      if (key !== state.qitem) {
        state.qitem = key;
        dom.qitem.classList.toggle('show', !!id);
        if (id) {
          const e = (p.EDIBLES && p.EDIBLES[id]) || { short: id, icon: 'biscuit' };
          dom.qitem.querySelector('.q-ico').className = 'q-ico ico-' + (e.icon || 'biscuit');
          dom.qitem.querySelector('.q-name').textContent = e.short || id;
          dom.qitem.querySelector('.q-n').textContent = '×' + (p.items[id] | 0);
          dom.qitem.setAttribute('aria-label', 'Eat ' + (e.name || id));
        }
      }
    }
    // chappal meter
    const w = N.wanted ? N.wanted.level | 0 : 0;
    if (w !== state.wanted) {
      const up = w > state.wanted && state.wanted >= 0;
      state.wanted = w;
      dom.slippers.forEach((s, i) => s.classList.toggle('on', i < w));
      dom.chappal.classList.toggle('active', w > 0);
      dom.chappal.setAttribute('aria-label', 'Chappal Meter ' + w + ' of 5');
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
          else state.distPending = null;
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
    pumpToasts(dt);
    pumpBanner(dt);
    // the district card waits until no banner / J-card / ask card owns the centre
    if (state.distPending && !state.bannerCur && !state.jc && !(dom.ask && dom.ask.classList.contains('show'))) {
      const dp = state.distPending; state.distPending = null;
      if ((N.time.real || 0) - dp.t < 6) showDistrict(dp.name, dp.sub); // frame time: a slow device doesn't drop it
    }
    pumpCaptions(dt);
    updateRoute(dt);
  }

  /* -------------------------------------------------------- sound captions */
  const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  function captionsOn() { const s = N.settings || (N.menus && N.menus.settings) || null; return !!(s && s.captions); }
  function addCaption(text, o) {
    o = o || {};
    if (!dom.caps || !text) return null;
    // sound captions follow the setting; story lines (Side A playback: kind 'tape') always show
    if (!captionsOn() && !(o.always || o.kind === 'tape')) return null;
    const now = performance.now();
    for (const c of state.caps) if (c.text === text && now - c.t0 < (o.dedupe || 1500)) { c.left = Math.max(c.left, o.ms || 1600); return c; }
    while (state.caps.length >= 3) { const c = state.caps.shift(); c.el.remove(); }
    const e = el('div', 'hud-cap kind-' + (o.kind || 'sound'), dom.caps);
    let arrow = '', left = 50, top = o.kind === 'tape' ? 70 : 82;
    const p = N.player;
    if (o.x != null && o.y != null && p && isFinite(o.x) && isFinite(o.y)) {
      const dx = o.x - p.x, dy = o.y - p.y;
      if (Math.hypot(dx, dy) > 60) {
        const a = Math.atan2(dy, dx);
        arrow = ' ' + ARROWS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
        // a point on an inner ellipse towards the sound, kept clear of the top HUD corners
        left = 50 + Math.cos(a) * 40; top = 52 + Math.sin(a) * 30;
        left = U.clamp(left, 12, 88); top = U.clamp(top, 30, 80);
      }
    }
    e.textContent = '[' + text + arrow + ']';
    e.style.left = left + '%'; e.style.top = top + '%';
    // keep the whole caption on screen (it is centred on its point)
    const W = window.innerWidth || 800, cw = e.offsetWidth || 0;
    const px = U.clamp((left / 100) * W, cw / 2 + 8, W - cw / 2 - 8);
    e.style.left = Math.round(px) + 'px';
    const c = { el: e, text, t0: now, left: o.ms || 1600 };
    state.caps.push(c);
    requestAnimationFrame(() => e.classList.add('show'));
    return c;
  }
  function pumpCaptions(dt) {
    for (const c of state.caps) c.left -= dt * 1000;
    while (state.caps.length && state.caps[0].left <= 0) { const c = state.caps.shift(); c.el.classList.remove('show'); setTimeout(() => c.el.remove(), 250); }
  }

  // the ACTION key cap on HUD cards (J-card): the player's key, "A" on a gamepad
  function actGlyph() { try { return (N.input && N.input.glyph && N.input.glyph('action')) || 'E'; } catch (e) { return 'E'; } }

  /* ------------------------------------------- speech bubbles vs the HUD */
  // dialogue.js places the barks (its draw, system order 12) clamped to the screen edge, so a speaker
  // above the view puts a cream bubble right over the OSD, the money tin or the objective. The HUD now
  // stacks above #barks (style.css) and here (draw, order 80, after the barks moved) any bubble that
  // overlaps a HUD read-out fades right down (.bark.under-hud) so both stay legible.
  const KEEP_SEL = '.hud-osd .osd-row1, .hud-osd .osd-row2, .hud-osd .osd-dist, .hud-money, .hud-energy, .hud-chappal, .hud-minimap, ' +
    '.hud-obj.show, .hud-timer.show, .hud-toast.show, .hud-qitem.show, .hud-jcard.show, .hud-banner.show .b-title, .hud-banner.show .b-sub, ' +
    '.hud-district.show .d-name, .hud-ask.show, body.touch-on #touch .t-top';
  const keepOut = { rects: [], t: -1e9 };
  const TRANSLATE = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/;
  function collectKeepOut() {
    const out = [];
    try {
      document.querySelectorAll(KEEP_SEL).forEach((e) => {
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || +cs.opacity < 0.1 || e.closest('.held, .hud-hidden')) return;
        const r = e.getBoundingClientRect();
        if (r.width > 2 && r.height > 2) out.push([r.left - 2, r.top - 2, r.right + 2, r.bottom + 2]);
      });
    } catch (e) { N.err('hud.keepOut', e); }
    keepOut.rects = out;
  }
  function dodgeBarks() {
    const host = dom.barks || (dom.barks = document.getElementById('barks'));
    if (!host || !host.firstElementChild) return;
    const now = performance.now();
    if (now - keepOut.t > 350) { keepOut.t = now; collectKeepOut(); }
    const R = keepOut.rects;
    for (let el = host.firstElementChild; el; el = el.nextElementSibling) {
      const m = TRANSLATE.exec(el.style.transform || '');
      let hit = false;
      if (m && el.style.visibility !== 'hidden') {
        const x0 = +m[1], y0 = +m[2], x1 = x0 + el.offsetWidth, y1 = y0 + el.offsetHeight;
        for (let i = 0; i < R.length && !hit; i++) { const q = R[i]; hit = x0 < q[2] && q[0] < x1 && y0 < q[3] && q[1] < y1; }
      }
      if (el.classList.contains('under-hud') !== hit) el.classList.toggle('under-hud', hit);
    }
  }

  function showDistrict(name, sub) {
    dom.dName.textContent = name;
    dom.dSub.textContent = sub || '';
    dom.district.classList.remove('show'); void dom.district.offsetWidth;
    dom.district.classList.add('show');
    clearTimeout(H._dT);
    H._dT = setTimeout(() => dom.district.classList.remove('show'), 3400);
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
    /** Queue a short message (top-centre). One shows at a time; duplicates are merged. */
    toast(text, ms, opts) {
      if (!dom.toasts || !text) return;
      text = String(text).replace(/\*([^*]+)\*/g, '$1');
      ms = ms || 2800;
      const key = opts && opts.key;
      const until = opts && opts.until, tag = opts && opts.tag;
      const cur = state.toasts[0];
      if (cur && cur.text === text) { cur.left = Math.max(cur.left, Math.min(ms, 2000)); return; }
      // a keyed toast (e.g. 'radio') replaces the older one with the same key instead of queueing behind it
      if (key) {
        if (cur && cur.key === key && cur.shown) { cur.text = text; cur.el.textContent = text; cur.left = ms; return; }
        const q = state.tq.find((x) => x.key === key);
        if (q) { q.text = text; q.ms = ms; return; }
      }
      const dup = state.tq.find((q) => q.text === text);
      if (dup) { dup.ms = Math.max(dup.ms, ms); return; }
      state.tq.push({ text, ms, key, until, tag });
      while (state.tq.length > 6) state.tq.shift();
    },
    /** Drop queued toasts (and the one showing) for which pred({text, key, tag}) is true; no pred = all. */
    dropToasts(pred) {
      const hit = (t) => { try { return !pred || !!pred(t); } catch (e) { return false; } };
      const n = state.tq.length;
      state.tq = state.tq.filter((q) => !hit(q));
      let dropped = n - state.tq.length;
      const cur = state.toasts[0];
      if (cur && hit(cur)) {
        state.toasts.shift(); dropped++;
        const e0 = cur.el; e0.classList.remove('show'); e0.classList.add('out'); setTimeout(() => e0.remove(), 300);
        state.toastGap = 0.18;
      }
      return dropped;
    },
    /** Messages waiting + showing (tests / debugging). */
    toastQueue: () => state.toasts.map((t) => t.text).concat(state.tq.map((q) => q.text)),
    /** Sound caption "[whistle ↗]" (systems §14.2). opts: {x, y, ms, kind}. */
    caption(text, opts) { return !!addCaption(text, opts); },
    /** Dashed search circle on the minimap / full map: searchCircle(id, {x, y, r, color}) or (id, null). */
    searchCircle(id, c) { if (!c) state.circles.delete(id); else state.circles.set(id, { x: +c.x, y: +c.y, r: +c.r || 300, color: c.color }); },
    circles: state.circles,
    /**
     * The mission J-card prompt (systems §6.1). spec: {head ('TRACK 05'), title, sub (date line),
     * line (place / note), playLabel, cancelLabel, onPlay(), onCancel(), progress 0..1} or null.
     */
    jcard(spec) {
      if (!dom.jcard) return;
      if (!spec) { state.jc = null; state.jcSig = ''; dom.jcard.className = 'hud-jcard'; dom.jcard.innerHTML = ''; return; }
      const same = state.jc && state.jc.key === (spec.key || spec.title);
      state.jc = Object.assign({}, spec, { key: spec.key || spec.title });
      if (!same && dom.district) dom.district.classList.remove('show'); // the card owns the centre now
      if (!same) {
        dom.jcard.innerHTML =
          '<div class="jc-tape"><span class="jc-head"></span><span class="jc-reels"><i></i><i></i></span></div>' +
          '<div class="jc-title"></div><div class="jc-sub"></div><div class="jc-line"></div>' +
          '<div class="jc-row"><button type="button" class="sign-btn small jc-play"><kbd>' + esc(actGlyph()) + '</kbd> &#9654; PLAY</button><span class="jc-not"></span></div>' +
          '<div class="jc-bar"><b></b></div>';
        dom.jcard.querySelector('.jc-play').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const j = state.jc; if (j && j.onPlay) { try { j.onPlay(); } catch (er) { N.err('hud.jcard', er); } } });
      }
      const sig = [spec.head, spec.title, spec.sub, spec.line, spec.cancelLabel, spec.playLabel, spec.canPlay, spec.kind].join('|');
      const bar = Math.round(U.clamp(spec.progress || 0, 0, 1) * 100) + '%';
      if (same && sig === state.jcSig) { const b = dom.jcard.querySelector('.jc-bar b'); if (b.style.width !== bar) b.style.width = bar; return; }
      state.jcSig = sig;
      dom.jcard.querySelector('.jc-head').textContent = spec.head || '';
      dom.jcard.querySelector('.jc-title').textContent = spec.title || '';
      dom.jcard.querySelector('.jc-sub').textContent = spec.sub || '';
      dom.jcard.querySelector('.jc-line').textContent = spec.line || '';
      dom.jcard.querySelector('.jc-not').textContent = spec.cancelLabel || 'Not now — step out';
      const pb = dom.jcard.querySelector('.jc-play');
      pb.lastChild.textContent = ' ' + (spec.playLabel || '▶ PLAY');
      pb.classList.toggle('hide', spec.canPlay === false);
      dom.jcard.querySelector('.jc-bar b').style.width = bar;
      dom.jcard.className = 'hud-jcard interactive show kind-' + (spec.kind || 'main');
    },
    get jcardOpen() { return !!state.jc; },
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
      state.banners.push({ title, sub, ms: ms || 3200, kind, note: opts.note || '' });
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
      // never on top of a banner / J-card / ask card: wait for the centre to clear
      if (state.bannerCur || state.jc || (dom.ask && dom.ask.classList.contains('show'))) { state.distPending = { name, sub, t: N.time.real || 0 }; return; }
      showDistrict(name, sub);
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
    /** A blip colour as drawn under the current colour-blind setting (the full map uses it too). */
    blipColor,
    /** Largest blip `size` the HUD draws (bigger requests are clamped). */
    BLIP_MAX,
    /** The money tin's format: ₹ 12.50 below ₹1,000, ₹ 9,99,999 above. */
    fmtMoney: fmtTin,
    /** Screen rects [x0, y0, x1, y1] of the HUD read-outs speech bubbles must not cover (refreshed ~3x a second). */
    keepOutRects: () => { collectKeepOut(); keepOut.t = performance.now(); return keepOut.rects.slice(); },
  });

  N.on('render:resize', () => { if (dom.mmCanvas) requestAnimationFrame(sizeMinimap); });
  N.on('clock:set', () => { state.dateDay = -1; });
  N.on('save:loaded', () => { state.dateDay = -1; state.wanted = -1; state.money = null; });
  N.on('game:new', () => { state.dateDay = -1; state.district = null; state.distCand = null; state.wanted = -1; state.money = null; state.tummy = -1; state.qitem = undefined; H.objective(null); H.timer(null); H.clearBanners(); H.closeAsk(); H.jcard(null); });
  N.on('caption', (d) => { if (d && d.text) addCaption(d.text, d); });
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
      try { dodgeBarks(); } catch (e) { N.err('hud.dodgeBarks', e); }
    },
    reset() {
      blips.clear(); route.pts = null; route.key = '';
      state.toasts.forEach((t) => t.el.remove()); state.toasts = []; state.tq = [];
      state.caps.forEach((c) => c.el.remove()); state.caps = [];
      state.circles.clear(); state.distPending = null;
      H.jcard(null);
    },
  });
})();
