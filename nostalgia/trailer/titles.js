/* NOSTALGIA trailer — 2D graphics: trailer cards, the flat-vector skyline title sequence (an homage in
 * spirit to TV title sequences that pan across a pop-up skyline — all shapes, colours and type here are
 * original), the rain overlay and the end card. Pure canvas 2D, resolution-independent (drawn in a
 * 1920x1080 design space and scaled). window.TITLES.draw(ctx, seg, t (s into the segment), W, H, beatSec)
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = '"Inter Display", "Inter", "DejaVu Sans", sans-serif';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), io: (t) => t * t * (3 - 2 * t), back: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
  // deterministic film grain
  let grain = null;
  function grainTile() {
    if (grain) return grain;
    grain = document.createElement('canvas'); grain.width = grain.height = 256;
    const g = grain.getContext('2d'), d = g.createImageData(256, 256);
    let s = 7;
    for (let i = 0; i < d.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = (s >> 16) & 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; }
    g.putImageData(d, 0, 0);
    return grain;
  }
  function addGrain(ctx, W, H, t) {
    const g = grainTile();
    ctx.save(); ctx.globalCompositeOperation = 'overlay';
    const ox = Math.floor((t * 977) % 256), oy = Math.floor((t * 613) % 256);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(g, 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  }
  function text(ctx, str, x, y, size, o) {
    o = o || {};
    ctx.font = (o.weight || 900) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.track || 0) + 'px';
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(str, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  /* ------------------------------------------------------------ cards */
  function card(ctx, seg, t, W, H, B) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!seg.text) return;
    const k = Math.min(W / 1920, H / 1080) * (H > W ? 1.3 : 1);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(k, k);
    if (seg.style === 'intro') {
      if (H > W) ctx.scale(0.78, 0.78); // portrait: the wide-tracked word must fit the width
      // v2 (100 BPM, 2 beats each): HYDERABAD breathes in (soft fade, slow tracking-out); 2003 lands on the
      // next downbeat with a gentle punch-in and a warm glow, then dissolves into the reveal shot
      const dur = seg.n * B, u = clamp(t / dur, 0, 1);
      const big = seg.text === '2003';
      const fin = big ? 0.3 : 0.42, fout = big ? 0.3 : 0.16;
      const a = ease.out(clamp(t / fin, 0, 1)) * (1 - ease.io(clamp((t - (dur - fout)) / fout, 0, 1)));
      ctx.globalAlpha = a;
      const sc = big ? 1.1 - 0.1 * ease.out(clamp(t / 0.45, 0, 1)) + 0.02 * u : 1.0 + 0.025 * u;
      ctx.scale(sc, sc);
      ctx.shadowColor = big ? 'rgba(255,170,60,0.55)' : 'rgba(255,255,255,0.35)'; ctx.shadowBlur = 40;
      text(ctx, seg.text, 0, 0, big ? 210 : 132, { weight: big ? 900 : 300, track: (big ? 18 : 40) + 26 * ease.io(u), color: big ? '#ffb347' : '#f4efe6' });
      ctx.shadowBlur = 0;
      if (!big) { ctx.globalAlpha = a * ease.out(clamp((t - 0.2) / 0.5, 0, 1)); text(ctx, 'TELANGANA · INDIA', 0, 120, 26, { weight: 500, track: 14, color: 'rgba(244,239,230,0.55)' }); }
    } else {
      // trailer hit: punch in from 1.12x, hard white, chromatic split on the first frames
      const u = clamp(t / 0.4, 0, 1), sc = 1.12 - 0.12 * ease.out(u);
      ctx.scale(sc, sc);
      if (t < 0.1) { ctx.globalAlpha = 0.7; text(ctx, seg.text, -8, 0, 150, { color: '#ff2a4d', track: 8 }); text(ctx, seg.text, 8, 0, 150, { color: '#2ad4ff', track: 8 }); ctx.globalAlpha = 1; }
      text(ctx, seg.text, 0, 0, 150, { color: '#ffffff', track: 8 });
    }
    ctx.restore();
    addGrain(ctx, W, H, t);
  }

  /* ------------------------------------------------------------ the skyline title */
  const PAL = {
    sky0: '#7fd3d9', sky1: '#fdf1d6', sun: '#ffcf6b', cloud: '#ffffff', far: '#b9dcd6', mid: '#9ccbc2',
    lake: '#3fa7b5', lake2: '#5cc0c9', ground: '#e9c98f', road: '#4a4a52',
    cream: '#f3e3bd', creamS: '#d9c299', sand: '#d6a865', sandS: '#b98848', white: '#fbf8f0', whiteS: '#dcd6c8',
    glass: '#5fb6d8', glassS: '#3a8fb4', green: '#5aa55a', red: '#d8402a', yellow: '#f2c230', ink: '#2a2a33',
  };
  // world: 4200 design units wide; the camera pans 0 -> 2230 (shows 1920)
  // v2: 8 pop beats, one hero landmark each (in pan order, so each pops on screen); the small accents
  // (kites, the auto, pigeons, the bus) ride along on their neighbour's beat a moment later.
  // Vehicles are listed last so they drive in front of the buildings.
  const ITEMS = [
    // [x, kind, popBeatIndex, delay (s)]
    [260, 'clock', 0, 0], [620, 'mecca', 1, 0], [980, 'birla', 2, 0], [1330, 'buddha', 3, 0], [1650, 'kites', 4, 0.12], [1820, 'cyber', 4, 0],
    [2180, 'golconda', 5, 0], [2700, 'tankbund', 6, 0], [3000, 'pigeons', 7, 0.14], [3150, 'charminar', 7, 0],
    [2520, 'auto', 6, 0.1], [3750, 'bus', 7, 0.1],
  ];
  const POP = 0.42; // seconds for a landmark to spring up (ease.back overshoot)
  const CHS = 1.05; // Charminar scale (v1 1.15): its minaret tips stay below the title block
  const NAVY = '#1b2a3a';
  // the title wordmark: white, a navy keyline and a hard navy extrusion (+ a soft lift) so it reads on any sky
  function wordmark(ctx, str, x, y, size, track) {
    ctx.font = '900 ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = track + 'px';
    x += track / 2; // centre without the trailing tracking
    const kl = size * 0.075, dy = size * 0.065;
    ctx.lineJoin = 'round';
    ctx.save(); ctx.shadowColor = 'rgba(8,18,30,0.32)'; ctx.shadowBlur = size * 0.2; ctx.shadowOffsetY = size * 0.08;
    ctx.fillStyle = NAVY; ctx.strokeStyle = NAVY; ctx.lineWidth = kl;
    ctx.strokeText(str, x, y + dy); ctx.fillText(str, x, y + dy);
    ctx.restore();
    ctx.strokeStyle = NAVY; ctx.lineWidth = kl; ctx.strokeText(str, x, y);
    ctx.fillStyle = '#ffffff'; ctx.fillText(str, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  // the tagline on a cream cassette-label plate (navy ink, keyline and hard shadow to match the wordmark)
  function tapeLabel(ctx, str, x, y, size) {
    const track = size * 0.02;
    ctx.font = '600 ' + size + 'px ' + FONT; if ('letterSpacing' in ctx) ctx.letterSpacing = track + 'px';
    const w = ctx.measureText(str).width - track; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const padX = size * 0.62, h = size * 1.45, r = size * 0.2, bx = x - w / 2 - padX, by = y - h / 2, bw = w + 2 * padX;
    const rr = (yy) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, yy, bw, h, r); else ctx.rect(bx, yy, bw, h); };
    ctx.fillStyle = NAVY; rr(by + size * 0.14); ctx.fill();
    ctx.fillStyle = '#fbf3e0'; rr(by); ctx.fill();
    ctx.strokeStyle = NAVY; ctx.lineWidth = size * 0.08; ctx.stroke();
    text(ctx, str, x + track / 2, y + size * 0.02, size, { weight: 600, color: NAVY, track });
  }
  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function poly(ctx, pts, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fill(); }
  function circ(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function archRow(ctx, x, y, w, h, n, c) { const aw = w / n; ctx.fillStyle = c; for (let i = 0; i < n; i++) { const ax = x + i * aw + aw * 0.18, ww = aw * 0.64; ctx.beginPath(); ctx.moveTo(ax, y + h); ctx.lineTo(ax, y + h * 0.42); ctx.quadraticCurveTo(ax + ww / 2, y - h * 0.05, ax + ww, y + h * 0.42); ctx.lineTo(ax + ww, y + h); ctx.fill(); } }
  const GY = 860; // ground line (design units)

  const DRAW = {
    charminar(ctx) { // centred at 0, standing on y=0, ~ 520 tall
      const c = PAL.cream, s = PAL.creamS;
      rect(ctx, -170, -250, 340, 250, c); rect(ctx, 60, -250, 110, 250, s);
      archRow(ctx, -150, -215, 300, 215, 1, '#8a6a48');
      rect(ctx, -180, -300, 360, 50, c); archRow(ctx, -170, -296, 340, 44, 9, s);
      rect(ctx, -150, -330, 300, 30, c); archRow(ctx, -140, -327, 280, 26, 11, s);
      for (const mx of [-190, 160]) {
        rect(ctx, mx, -440, 30, 440, c); rect(ctx, mx + 18, -440, 12, 440, s);
        for (const by of [-150, -300, -400]) rect(ctx, mx - 8, by, 46, 12, s);
        circ(ctx, mx + 15, -450, 22, c); poly(ctx, [mx + 9, -468, mx + 15, -520, mx + 21, -468], s);
      }
      circ(ctx, 0, -270, 18, PAL.white); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -270); ctx.lineTo(0, -282); ctx.moveTo(0, -270); ctx.lineTo(9, -266); ctx.stroke();
    },
    golconda(ctx) {
      poly(ctx, [-260, 0, -170, -170, -60, -250, 70, -280, 190, -190, 270, 0], '#b08a5c');
      poly(ctx, [70, -280, 190, -190, 270, 0, 120, 0], '#93714a');
      rect(ctx, -60, -330, 140, 70, PAL.sand); rect(ctx, 40, -330, 40, 70, PAL.sandS);
      for (let i = 0; i < 7; i++) rect(ctx, -60 + i * 21, -345, 12, 16, PAL.sand);
      archRow(ctx, -50, -320, 120, 50, 3, '#6a4a2a');
      rect(ctx, -230, -110, 470, 26, PAL.sand); for (let i = 0; i < 20; i++) rect(ctx, -230 + i * 24, -124, 12, 14, PAL.sand);
    },
    birla(ctx) {
      poly(ctx, [-240, 0, -150, -120, 10, -150, 170, -110, 250, 0], '#9a8a6a');
      const w = PAL.white, s = PAL.whiteS;
      rect(ctx, -110, -250, 220, 110, w); rect(ctx, 60, -250, 50, 110, s);
      for (const [x, h, r] of [[-70, 120, 40], [0, 210, 56], [70, 120, 40]]) { poly(ctx, [x - r, -250, x, -250 - h, x + r, -250], w); poly(ctx, [x, -250 - h, x + r, -250, x + r * 0.35, -250], s); circ(ctx, x, -255 - h, 8, PAL.yellow); }
      poly(ctx, [0, -470, 0, -500, 30, -488], '#ff8c1a');
    },
    buddha(ctx) {
      ctx.fillStyle = PAL.lake; ctx.beginPath(); ctx.ellipse(0, 0, 320, 46, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = PAL.lake2; ctx.lineWidth = 5; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-220 + i * 110, 10 + (i % 2) * 14); ctx.lineTo(-170 + i * 110, 10 + (i % 2) * 14); ctx.stroke(); }
      rect(ctx, -70, -40, 140, 40, PAL.whiteS); rect(ctx, -46, -70, 92, 30, PAL.white);
      poly(ctx, [-40, -70, -46, -230, -26, -300, 26, -300, 46, -230, 40, -70], PAL.white);
      poly(ctx, [10, -300, 26, -300, 46, -230, 40, -70, 10, -70], PAL.whiteS);
      circ(ctx, 0, -322, 24, PAL.white); circ(ctx, 0, -346, 11, PAL.whiteS);
    },
    cyber(ctx) {
      const g = PAL.glass, s = PAL.glassS;
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-150, 0); ctx.lineTo(-150, -380); ctx.quadraticCurveTo(0, -470, 150, -380); ctx.lineTo(150, 0); ctx.fill();
      ctx.fillStyle = s; ctx.beginPath(); ctx.moveTo(40, 0); ctx.lineTo(40, -430); ctx.quadraticCurveTo(110, -415, 150, -380); ctx.lineTo(150, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; for (let y = -360; y < 0; y += 28) { ctx.beginPath(); ctx.moveTo(-150, y); ctx.lineTo(150, y); ctx.stroke(); }
      rect(ctx, -6, -500, 12, 70, PAL.ink); circ(ctx, 0, -505, 8, PAL.red);
    },
    clock(ctx) {
      rect(ctx, -60, -380, 120, 380, PAL.cream); rect(ctx, 30, -380, 30, 380, PAL.creamS);
      rect(ctx, -80, -60, 160, 60, PAL.creamS);
      circ(ctx, 0, -300, 42, PAL.white); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -300); ctx.lineTo(0, -330); ctx.moveTo(0, -300); ctx.lineTo(20, -292); ctx.stroke();
      poly(ctx, [-70, -380, 0, -470, 70, -380], PAL.red);
    },
    mecca(ctx) {
      rect(ctx, -230, -230, 460, 230, '#c9b48e'); rect(ctx, 120, -230, 110, 230, '#ad9772');
      archRow(ctx, -210, -180, 420, 180, 5, '#5c4630');
      for (const mx of [-250, 220]) { rect(ctx, mx, -380, 30, 380, '#c9b48e'); circ(ctx, mx + 15, -392, 24, '#c9b48e'); poly(ctx, [mx + 9, -410, mx + 15, -450, mx + 21, -410], '#ad9772'); }
      for (let i = 0; i < 18; i++) rect(ctx, -230 + i * 26, -246, 14, 16, '#c9b48e');
    },
    tankbund(ctx) {
      ctx.fillStyle = PAL.lake; ctx.fillRect(-300, -30, 600, 60);
      rect(ctx, -300, -50, 600, 22, '#b9b1a3');
      for (let i = 0; i < 6; i++) { const x = -260 + i * 104; rect(ctx, x - 3, -150, 6, 100, PAL.ink); circ(ctx, x, -156, 12, '#fff2b0'); }
      for (const x of [-210, 0, 210]) { rect(ctx, x - 18, -110, 36, 60, '#b9b1a3'); circ(ctx, x, -126, 14, '#8a8478'); rect(ctx, x - 10, -118, 20, 30, '#8a8478'); }
    },
    auto(ctx) {
      rect(ctx, -70, -70, 140, 52, PAL.yellow); poly(ctx, [-70, -70, -50, -112, 60, -112, 70, -70], PAL.ink);
      rect(ctx, 30, -66, 36, 30, '#9fd6e8'); rect(ctx, -70, -26, 140, 10, PAL.ink);
      for (const x of [-48, 48]) { circ(ctx, x, -14, 16, PAL.ink); circ(ctx, x, -14, 6, '#999'); }
    },
    bus(ctx) {
      rect(ctx, -170, -120, 340, 100, '#b22b2b'); rect(ctx, -170, -60, 340, 12, '#f0e6d0');
      for (let i = 0; i < 6; i++) rect(ctx, -155 + i * 52, -108, 40, 36, '#9fd6e8');
      for (const x of [-110, 110]) { circ(ctx, x, -18, 20, PAL.ink); circ(ctx, x, -18, 7, '#999'); }
    },
    kites(ctx, t) {
      const cols = ['#e83a5a', '#f2c230', '#3a7ee8', '#3ac46a', '#9a4ae8'];
      for (let i = 0; i < 5; i++) {
        const x = -200 + i * 100 + Math.sin(t * 2 + i) * 14, y = -620 - (i % 2) * 110 + Math.cos(t * 1.6 + i) * 12, s = 30;
        ctx.save(); ctx.translate(x, y); ctx.rotate(0.3 * Math.sin(t * 1.3 + i));
        poly(ctx, [0, -s, s * 0.8, 0, 0, s * 1.1, -s * 0.8, 0], cols[i]); poly(ctx, [0, -s, s * 0.8, 0, 0, 0], 'rgba(255,255,255,0.25)');
        ctx.strokeStyle = cols[i]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, s * 1.1); ctx.quadraticCurveTo(10, s * 2, -6, s * 2.8); ctx.stroke();
        ctx.restore();
      }
    },
    pigeons(ctx, t) {
      ctx.fillStyle = '#4a4a58';
      for (let i = 0; i < 9; i++) {
        const x = -160 + i * 40 + Math.sin(i * 7) * 30, y = -400 - (i % 3) * 34 + Math.sin(t * 3 + i) * 6, f = Math.sin(t * 14 + i * 2);
        ctx.beginPath(); ctx.moveTo(x - 18, y - 8 * f); ctx.quadraticCurveTo(x, y + 4, x + 18, y - 8 * f); ctx.quadraticCurveTo(x, y + 9, x - 18, y - 8 * f); ctx.fill();
      }
    },
  };

  function skyline(ctx, seg, t, W, H, B) {
    const port = H > W, k = port ? W / 1180 : H / 1080, dur = seg.n * B;
    const beats = t / B, b0 = seg.b;
    const slamT = (seg.slam - b0) * B;
    const VH = H / k, oy = port ? VH - 1080 - 260 : 40; // landscape: the scene sits a little lower, under the title block
    ctx.save(); ctx.scale(k, k);
    const VW = W / k;
    // sky (portrait: extends above the 1080-unit scene)
    // sky: deeper teal at the zenith (behind the wordmark) down to the warm cream horizon
    const sg = ctx.createLinearGradient(0, 0, 0, GY + oy); sg.addColorStop(0, port ? '#2f8fab' : '#3a9cb6'); sg.addColorStop(0.5, port ? '#7ccbd4' : '#86d1d7'); sg.addColorStop(1, PAL.sky1);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = PAL.ground; ctx.fillRect(0, GY + oy, VW, VH);
    ctx.translate(0, oy);
    // camera pan: eased from 0 to the Charminar framing at the slam, then a slow push
    const panT = clamp(t / slamT, 0, 1), cx = ease.io(panT) * (port ? 2560 : 2230) + Math.max(0, t - slamT) * 30;
    const zoom = 1 + Math.max(0, t - slamT) * 0.022;
    // sun + clouds (parallax)
    circ(ctx, 1560 - cx * 0.45, 430, 90, PAL.sun);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    // cloud rows kept out of the title block (landscape: under it, behind the skyline; portrait: above and below it)
    const rows = port ? [-430, 100, 190] : [355, 430, 490];
    for (let i = 0; i < 9; i++) { const x = ((i * 640 - cx * 0.25 + t * 12) % 4800 + 4800) % 4800 - 400, y = rows[i % 3]; ctx.beginPath(); ctx.ellipse(x, y, 110, 30, 0, 0, TAU); ctx.ellipse(x + 60, y - 18, 70, 32, 0, 0, TAU); ctx.ellipse(x - 60, y - 6, 60, 24, 0, 0, TAU); ctx.fill(); }
    const ay = GY - 520 * CHS; // the push is anchored at the minaret tips, so nothing grows up into the title
    ctx.translate(VW / 2, ay); ctx.scale(zoom, zoom); ctx.translate(-VW / 2, -ay);
    // far city (parallax 0.5)
    ctx.fillStyle = PAL.far;
    for (let i = 0; i < 60; i++) { const x = i * 90 - cx * 0.5, h = 80 + ((i * 37) % 7) * 22; ctx.fillRect(x, GY - h - 30, 70, h + 30); }
    ctx.fillStyle = PAL.mid;
    for (let i = 0; i < 50; i++) { const x = i * 120 - cx * 0.75 + 30, h = 60 + ((i * 53) % 5) * 26; ctx.fillRect(x, GY - h, 90, h); for (let w = 0; w < 3; w++) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 12 + w * 26, GY - h + 18, 12, 14); ctx.fillStyle = PAL.mid; } }
    // ground + road
    rect(ctx, 0, GY, VW, 1080 - GY, PAL.ground); rect(ctx, 0, GY + 40, VW, 70, PAL.road);
    ctx.fillStyle = '#f5f0e0'; for (let x = -((cx) % 120); x < VW; x += 120) ctx.fillRect(x, GY + 72, 60, 6);
    // the landmarks pop up on their beats (scale from 0 with an overshoot, from the ground)
    ctx.translate(-cx, 0);
    for (const [x, kind, pi, dl] of ITEMS) {
      const pt = ((seg.pops && seg.pops[pi] != null ? seg.pops[pi] : b0 + pi) - b0) * B + dl; // pop time (s)
      const u = clamp((t - pt) / POP, 0, 1);
      if (u <= 0) continue;
      const sc = ease.back(u);
      let px = x, dy = 0;
      if (kind === 'auto') px = x + Math.max(0, t - pt) * 90;
      if (kind === 'bus') px = x - Math.max(0, t - pt) * 70;
      ctx.save(); ctx.translate(px, GY + (kind === 'auto' || kind === 'bus' ? 100 : 0) + dy);
      const sy = kind === 'kites' || kind === 'pigeons' ? 1 : sc;
      ctx.scale(kind === 'kites' || kind === 'pigeons' ? sc : 1 / Math.max(0.3, sc) * sc * (0.9 + 0.1 * sc), sy);
      if (kind === 'charminar') ctx.scale(CHS, CHS);
      DRAW[kind](ctx, t);
      ctx.restore();
    }
    ctx.restore();
    // the title slam
    if (t >= slamT) {
      const u = clamp((t - slamT) / 0.5, 0, 1), sc = 1.42 - 0.42 * ease.out(u);
      const tk = port ? (W / 1920) * 1.15 : k, ty = port ? H * 0.3 : 150 * k;
      ctx.save(); ctx.translate(W / 2, ty); ctx.scale(tk * sc, tk * sc);
      wordmark(ctx, 'NOSTALGIA', 0, 0, 170, 26);
      ctx.restore();
      const u2 = ease.out(clamp((t - slamT - 0.55) / 0.6, 0, 1));
      if (u2 > 0) {
        const ls = port ? 56 : 44; // label sits a clear gap below the wordmark's extrusion
        ctx.save(); ctx.translate(W / 2, ty + (98 + ls * 0.725) * tk + 10 * tk * (1 - u2)); ctx.scale(tk * (0.94 + 0.06 * u2), tk * (0.94 + 0.06 * u2)); ctx.globalAlpha = u2;
        tapeLabel(ctx, 'a Hyderabad story on one cassette', 0, 0, ls);
        ctx.restore();
      }
      if (t - slamT < 0.16) { ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - (t - slamT) / 0.16)) + ')'; ctx.fillRect(0, 0, W, H); }
    }
  }

  function overlay(ctx, ov, t, W, H) { // lower-third text over the rain shot (portrait: above the Reels/Shorts UI)
    const port = H > W, k = Math.min(W / 1920, H / 1080) * (port ? 1.25 : 1), a = clamp(t / 0.3, 0, 1);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * (port ? 0.64 : 0.8)); ctx.scale(k, k);
    if (port) { const words = ov.text.split(' '), half = Math.ceil(words.length / 2); ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 30; text(ctx, words.slice(0, half).join(' '), 0, -55, 96, { color: '#ffffff', track: 6 }); text(ctx, words.slice(half).join(' '), 0, 55, 96, { color: '#ffffff', track: 6 }); ctx.restore(); return; }
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 30;
    text(ctx, ov.text, 0, 0, 84, { color: '#ffffff', track: 6 });
    ctx.restore();
  }

  function endcard(ctx, seg, t, W, H) { // v2: 8 beats (4.8 s); settles by ~2.4 s, the assembly holds the last frame
    // "Gurthunda?" (the game's catchphrase, Telugu for "Do you remember?") opens it alone, then the logo,
    // the tagline and the call to action follow
    const k = Math.min(W / 1920, H / 1080) * (H > W ? 1.6 : 1); // portrait: sized for phones
    ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2 + 14 * k); ctx.scale(k, k);
    const g = ease.out(clamp((t - 0.1) / 0.8, 0, 1));
    ctx.save(); ctx.globalAlpha = g;
    if ('filter' in ctx && g < 1) ctx.filter = 'blur(' + (8 * (1 - g)).toFixed(2) + 'px)';
    ctx.shadowColor = 'rgba(255,170,60,0.35)'; ctx.shadowBlur = 30;
    text(ctx, 'Gurthunda?', 0, -208 + 10 * (1 - g), 64, { weight: '500 italic', color: '#f4e6cc', track: 2 });
    ctx.restore();
    const a = ease.out(clamp((t - 0.55) / 0.9, 0, 1));
    ctx.save(); ctx.globalAlpha = a; const s0 = 1.05 - 0.05 * a; ctx.scale(s0, s0);
    ctx.shadowColor = 'rgba(255,170,60,0.5)'; ctx.shadowBlur = 50;
    text(ctx, 'NOSTALGIA', 0, -60, 150, { color: '#ffffff', track: 22 + 14 * (1 - a) });
    ctx.restore();
    const a2 = ease.out(clamp((t - 1.15) / 0.7, 0, 1));
    ctx.globalAlpha = a2;
    text(ctx, 'AN OPEN-WORLD HYDERABAD STORY', 0, 50 + 10 * (1 - a2), 34, { weight: 500, color: '#ffb347', track: 12 });
    const a3 = ease.out(clamp((t - 1.75) / 0.7, 0, 1));
    ctx.globalAlpha = a3;
    const rw = 300 * a3; ctx.fillStyle = 'rgba(255,179,71,0.85)'; ctx.fillRect(-rw / 2, 112, rw, 3);
    text(ctx, 'PLAY FREE IN YOUR BROWSER', 0, 172 + 12 * (1 - a3), 40, { weight: 800, color: '#ffffff', track: 8 });
    ctx.restore();
    addGrain(ctx, W, H, t);
  }

  /* ------------------------------------------------------------ v2.1 story lines (finale overlay, transparent) */
  // Short centred lines in sequence, one per equal slice of the segment (12 beats / 3 lines = one bar each):
  // each focuses in from a soft blur with its tracking settling, holds, and dissolves before the next.
  const STORY = { finale: ['TEN MONTHS LEFT.', 'ONE TAPE.', 'THE WHOLE CITY.'] };
  const storyLines = (seg) => seg.story || STORY[seg.id] || null;
  const ST = { in: 0.6, out: 0.45, lead: 0.22, tail: 0.1 };
  function storyPhase(seg, t, B) {
    const L = storyLines(seg); if (!L) return 'blank';
    const slot = seg.n * B / L.length, i = Math.min(L.length - 1, Math.floor(t / slot)), lt = t - i * slot;
    if (lt < ST.lead || lt >= slot - ST.tail) return 'blank';
    if (lt >= ST.lead + ST.in && lt < slot - ST.tail - ST.out) return 'hold' + i;
    return 'anim';
  }
  function story(ctx, seg, t, W, H, B) {
    const L = storyLines(seg); if (!L) return;
    const port = H > W, k = port ? W / 1080 : Math.min(W / 1920, H / 1080), VW = W / k, VH = H / k;
    const slot = seg.n * B / L.length, i = Math.min(L.length - 1, Math.floor(t / slot)), lt = t - i * slot;
    const u = ease.out(clamp((lt - ST.lead) / ST.in, 0, 1)), o = ease.io(clamp((lt - (slot - ST.tail - ST.out)) / ST.out, 0, 1));
    const a = u * (1 - o);
    if (a <= 0.001) return;
    const size = port ? 92 : 96, cy = VH * (port ? 0.655 : 0.79), cx = VW / 2;
    ctx.save(); ctx.scale(k, k);
    // soft shadow pool behind the line (the city under it is busy)
    ctx.save(); ctx.translate(cx, cy); ctx.scale(port ? 2.3 : 4.0, 1);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 185);
    gr.addColorStop(0, 'rgba(0,0,0,' + 0.58 * a + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + 0.34 * a + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 170, 0, TAU); ctx.fill(); ctx.restore();
    // amber hairline grows from the centre above the line
    const hw = 90 * u * (1 - o); ctx.globalAlpha = a; ctx.fillStyle = AMBER; ctx.fillRect(cx - hw / 2, cy - size * 0.95, hw, 4);
    // the line: focus-pull in / out, tracking settles
    ctx.globalAlpha = a;
    const blur = 10 * (1 - u) + 8 * o;
    if ('filter' in ctx && blur > 0.05) ctx.filter = 'blur(' + blur.toFixed(2) + 'px)';
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 3;
    const track = size * (0.12 + 0.1 * (1 - u) + 0.05 * o);
    let sz = size; // fit inside the safe width
    ctx.font = '800 ' + sz + 'px ' + FONT; if ('letterSpacing' in ctx) ctx.letterSpacing = track + 'px';
    const maxW = VW * (port ? 0.7 : 0.8), w = ctx.measureText(L[i]).width; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (w > maxW) sz = size * maxW / w;
    text(ctx, L[i], cx + track / 2, cy + 6, sz, { weight: 800, color: '#ffffff', track: track * sz / size });
    ctx.restore();
  }

  /* ------------------------------------------------------------ v2 caption lower-thirds (transparent) */
  // Kicker (act name) + big caption. Landscape: lower-left third, clear of the top 12 % (minigame bars) and
  // the bottom 6 % (HUD). Portrait: left-aligned around 62-70 % height, clear of the Reels/Shorts right rail.
  // opt: { first: first segment of its act (kicker wipes in first on an amber plate), fps }
  const AMBER = '#ffb347', INK = '#16130f';
  const CAP = { // timings (s)
    delay: 0.15, kick: 0.28, line: 0.3, stagger: 0.06, firstKick: 0.1, firstCap: 0.34, out: 0.25, hold: 0.85,
  };
  // per-segment overrides for the lower-third placement, fractions of the frame: x = left edge, w = max width,
  // top / bottom = block edge (else the defaults below), size / min / maxLines; seg.capPos.{land,port} also applies
  const LOWPOS = {
    land: {
      g_top_chase: { bottom: 0.79 }, // the HUD minimap sits bottom-left (x 0.8-9.2 %, y 84-98.5 %): stack above it
      // the bike's front wheel swings to x 41.8 % in the turn (f35): a narrower block (text edge ~37.7 %) and a
      // tighter shadow pool keep Chinnu's bike untouched
      g_top_charminar: { bottom: 0.79, w: 0.315, pool: { padX: 120 } },
    },
    port: {
      // 3D half: Charminar fills the top, the bike + Chinnu the centre (x 45-55 %, swinging to x 30.4 % by f35);
      // top-down half: Charminar's roundabout sits left-centre (down to y ~62 %). The left column below the
      // roundabout and left of the bike's turn is clear in every frame (and above the Reels caption zone)
      // (the wheel reaches x 30.7 % at f35): PLAY IN / 3D OR / TOP- / DOWN, text edge ~27 %, tight shadow pool
      g_top_charminar: { x: 0.06, top: 0.6, w: 0.215, maxLines: 4, hyphenBreak: true, min: 40, pool: { padX: 90, padY: 110, cx: 0.42 } },
    },
  };
  function capLayout(ctx, seg, W, H, opt) {
    const port = H > W;
    const k = port ? W / 1080 : Math.min(W / 1920, H / 1080), VW = W / k, VH = H / k;
    const P = port
      ? { x0: 84, maxW: 840, base: 96, min: 60, maxLines: 3, lh: 1.04 }
      : { x0: 118, maxW: 1180, base: 92, min: 60, maxLines: 2, lh: 1.04 };
    const o = port ? 'port' : 'land', O = Object.assign({}, LOWPOS[o][seg.id] || {}, (seg.capPos && seg.capPos[o]) || {});
    if (O.x != null) P.x0 = O.x * VW;
    if (O.w != null) P.maxW = O.w * VW;
    if (O.size) P.base = O.size;
    if (O.min) P.min = O.min;
    if (O.maxLines) P.maxLines = O.maxLines;
    const words = O.hyphenBreak ? String(seg.cap).split(/\s+/).flatMap((w) => w.split(/(?<=-)/)) : String(seg.cap).split(/\s+/);
    const join = (ws) => ws.reduce((a, w) => (a && !a.endsWith('-') ? a + ' ' : a) + w, '');
    const meas = (str, size) => { ctx.font = '900 ' + size + 'px ' + FONT; if ('letterSpacing' in ctx) ctx.letterSpacing = (size * 0.02) + 'px'; const w = ctx.measureText(str).width; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; return w; };
    function split(n, size) { // best (min max-width) split of the words into n lines
      let best = null;
      const rec = (i, left, acc) => {
        if (left === 1) { const ls = [...acc, join(words.slice(i))]; const mw = Math.max(...ls.map((l) => meas(l, size))); if (!best || mw < best.w) best = { lines: ls, w: mw }; return; }
        for (let j = i + 1; j <= words.length - left + 1; j++) rec(j, left - 1, [...acc, join(words.slice(i, j))]);
      };
      if (n <= words.length) rec(0, n, []);
      return best;
    }
    let lay = null;
    for (let n = 1; n <= P.maxLines && !lay; n++) { const b = split(n, P.base); if (b && b.w <= P.maxW) lay = { ...b, size: P.base }; }
    if (!lay) { const n = Math.min(P.maxLines, words.length); for (let sz = P.base; sz >= P.min; sz -= 2) { const b = split(n, sz); if (b && (b.w <= P.maxW || sz === P.min)) { lay = { ...b, size: sz }; break; } } }
    const size = lay.size, lh = size * P.lh, capH = lay.lines.length * lh;
    const kh = opt.first ? (port ? 64 : 56) : (port ? 46 : 40), kgap = port ? 26 : 22;
    const blockH = kh + kgap + capH;
    let top;
    if (O.top != null) top = O.top * VH;
    else if (O.bottom != null) top = O.bottom * VH - blockH;
    else if (port) { top = VH * 0.665 - blockH / 2; top = Math.min(top, VH * 0.735 - blockH); top = Math.max(top, VH * 0.55); }
    else top = 948 - blockH; // bottom edge at 87.8 % (above the bottom 6 % HUD band)
    return { port, k, VW, VH, P, O, lines: lay.lines, size, lh, capW: lay.w, kh, kgap, top, capTop: top + kh + kgap, bottom: top + blockH };
  }
  function capPhase(seg, t, B, opt) { // 'blank' | 'hold' | 'anim' (lets the renderer reuse identical frames)
    const dur = seg.n * B, outStart = dur - CAP.out - 0.03;
    if (t < (opt.first ? CAP.firstKick : CAP.delay)) return 'blank';
    if (t >= outStart + CAP.out) return 'blank';
    if (t >= CAP.hold && t < outStart) return 'hold';
    return 'anim';
  }
  /* ------------------------------------------------------------ v2.1 PLAY-act captions: top-left, boxed */
  // The minigames fill the frame with their own UI (and the player sits low in it), so PLAY captions sit just
  // under the minigame top bar: top edge ~12 %, left ~6 %. Each line gets its own dark box and the kicker a
  // plate (amber for the act opener, dark with an amber tick after), so they read on a yellow console, an
  // orange sky or a white cloud alike. Per-segment placement keeps them off the player, the key gameplay
  // object and the HUD (checked against the captured frames; seg.capPos = {land:{..}, port:{..}} overrides).
  const TOP_ACTS = { PLAY: true };
  const BOXFILL = 'rgba(12,14,20,0.8)';
  const CAPPOS = { // fractions of the frame: x = left edge, y = top edge, w = max block width (+ size, maxLines)
    land: {
      _: { x: 0.06, y: 0.12, w: 0.42 },
      a_cricket: { w: 0.31 }, // left of the IRANI CAFE sign and the "SIX!" banner
      a_panipuri: { w: 0.245 }, // left of the vendor's arm, above the counter
      a_brickgame: { y: 0.1, w: 0.265 }, // in the console margin (it starts at 7 %): left of the LCD, above the D-pad
      a_antenna: { x: 0.685, y: 0.1, w: 0.28 }, // the right panel's bare wall (the dial and antenna head are top-left)
    },
    port: {
      _: { x: 0.06, y: 0.12, w: 0.8 },
      a_panipuri: { y: 0.565, w: 0.36 }, // the vendor fills the top: the counter's lower-left, left of the puri's path
      a_cricket: { y: 0.235, w: 0.42 }, // under the IRANI CAFE sign and the "SIX!" banner (x 29-71 %, y 16-21 % from f44)
      a_marbles: { y: 0.09 }, // above the "PHIR SE MAARO!" banner (x 20-81 %, y 17.9-21 % from f54); left of Pappu's striker
      a_lingocha: { y: 0.09 }, // 3D, centre-cropped: no minigame bar, kids' heads start ~17 %
      a_maram: { y: 0.09 },
    },
  };
  function capPos(seg, port) {
    const o = port ? 'port' : 'land', T = CAPPOS[o];
    return Object.assign({}, T._, T[seg.id] || {}, (seg.capPos && seg.capPos[o]) || {});
  }
  function boxLayout(ctx, seg, W, H, opt) {
    const port = H > W;
    const k = port ? W / 1080 : Math.min(W / 1920, H / 1080), VW = W / k, VH = H / k;
    const P = capPos(seg, port);
    const base = P.size || (port ? 76 : 72), min = P.min || 44, maxLines = P.maxLines || (port ? 3 : 2), maxW = P.w * VW;
    const words = String(seg.cap).split(/\s+/);
    const meas = (str, size) => { ctx.font = '900 ' + size + 'px ' + FONT; if ('letterSpacing' in ctx) ctx.letterSpacing = (size * 0.02) + 'px'; const w = ctx.measureText(str).width; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; return w; };
    function split(n, size) {
      let best = null;
      const rec = (i, left, acc) => {
        if (left === 1) { const ls = [...acc, words.slice(i).join(' ')]; const mw = Math.max(...ls.map((l) => meas(l, size))); if (!best || mw < best.w) best = { lines: ls, w: mw }; return; }
        for (let j = i + 1; j <= words.length - left + 1; j++) rec(j, left - 1, [...acc, words.slice(i, j).join(' ')]);
      };
      if (n <= words.length) rec(0, n, []);
      return best;
    }
    const fits = (b, size) => b && b.w + 0.6 * size <= maxW;
    let lay = null; // the largest size that fits (<= base); on a tie, the fewest lines
    for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
      for (let sz = base; sz >= min; sz -= 1) { const b = split(n, sz); if (fits(b, sz)) { if (!lay || sz > lay.size) lay = { ...b, size: sz }; break; } }
    }
    if (!lay) { const b = split(Math.min(maxLines, words.length), min); lay = { ...b, size: min }; }
    const size = lay.size, padX = size * 0.3, bh = size * 1.2, gap = Math.round(size * 0.08);
    const kh = opt.first ? (port ? 58 : 52) : (port ? 48 : 42), kgap = port ? 12 : 10;
    const x0 = P.x * VW, top = P.y * VH, capTop = top + kh + kgap;
    return { port, k, VW, VH, x0, top, kh, capTop, lines: lay.lines, widths: lay.lines.map((l) => meas(l, size)), size, padX, bh, gap,
      capW: lay.w + 2 * padX, bottom: capTop + lay.lines.length * (bh + gap) - gap };
  }
  function capBoxed(ctx, seg, t, W, H, B, opt) {
    const L = boxLayout(ctx, seg, W, H, opt), dur = seg.n * B;
    const outStart = dur - CAP.out - 0.03, o = ease.io(clamp((t - outStart) / CAP.out, 0, 1));
    if (o >= 1) return;
    const kStart = opt.first ? CAP.firstKick : CAP.delay, cStart = opt.first ? CAP.firstCap : CAP.delay + 0.05;
    const ku = ease.out(clamp((t - kStart) / (opt.first ? 0.3 : 0.26), 0, 1));
    if (ku <= 0) return;
    const x0 = L.x0;
    ctx.save(); ctx.scale(L.k, L.k);
    const kSize = opt.first ? (L.port ? 34 : 30) : (L.port ? 28 : 25), kTrack = opt.first ? 10 : 8;
    ctx.font = '800 ' + kSize + 'px ' + FONT; if ('letterSpacing' in ctx) ctx.letterSpacing = kTrack + 'px';
    const kTextW = ctx.measureText(seg.act || '').width - kTrack; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const kBar = opt.first ? 0 : 6, kPad = opt.first ? 20 : 15, kW = kBar + kPad * 2 + kTextW;
    const blockW = Math.max(L.capW, kW);
    // out: a left-to-right wipe + fade
    ctx.globalAlpha = 1 - o * 0.6;
    if (o > 0) { const wx = x0 - 30 + ease.io(o) * (blockW + 90); ctx.beginPath(); ctx.rect(wx, 0, L.VW, L.VH); ctx.clip(); }
    // kicker plate wipes in; the act name follows inside it
    const pw = kW * ku, ky = L.top + L.kh / 2;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    ctx.fillStyle = opt.first ? AMBER : BOXFILL; ctx.fillRect(x0, L.top, pw, L.kh); ctx.restore();
    if (kBar) { ctx.fillStyle = AMBER; ctx.fillRect(x0, L.top, Math.min(kBar, pw), L.kh); }
    ctx.save(); ctx.beginPath(); ctx.rect(x0, L.top, pw, L.kh); ctx.clip();
    const tu = ease.out(clamp((t - kStart - 0.08) / 0.25, 0, 1)); ctx.globalAlpha *= tu;
    text(ctx, seg.act, x0 + kBar + kPad - 10 * (1 - tu), ky + 1, kSize, { weight: 800, align: 'left', track: kTrack, color: opt.first ? INK : AMBER });
    ctx.restore();
    // caption lines: each box wipes in from the left with its text sliding in inside it, staggered
    L.lines.forEach((ln, i) => {
      const lu = ease.out(clamp((t - cStart - i * CAP.stagger) / 0.32, 0, 1));
      if (lu <= 0) return;
      const ly = L.capTop + i * (L.bh + L.gap), bw = (L.widths[i] + 2 * L.padX) * lu;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
      ctx.fillStyle = BOXFILL; ctx.fillRect(x0, ly, bw, L.bh); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(x0, ly, bw, L.bh); ctx.clip();
      text(ctx, ln, x0 + L.padX - 24 * (1 - lu), ly + L.bh * 0.5 + L.size * 0.01, L.size, { weight: 900, align: 'left', track: L.size * 0.02, color: '#ffffff' });
      ctx.restore();
    });
    ctx.restore();
  }
  function caption(ctx, seg, t, W, H, B, opt) {
    opt = opt || {};
    if (!seg.cap) return;
    if (TOP_ACTS[seg.act] || seg.capStyle === 'top') return capBoxed(ctx, seg, t, W, H, B, opt);
    const L = capLayout(ctx, seg, W, H, opt), dur = seg.n * B;
    const outStart = dur - CAP.out - 0.03, o = ease.io(clamp((t - outStart) / CAP.out, 0, 1));
    if (o >= 1) return;
    const kStart = opt.first ? CAP.firstKick : CAP.delay, cStart = opt.first ? CAP.firstCap : CAP.delay + 0.03;
    const kd = opt.first ? 0.3 : CAP.kick;
    const ku = ease.out(clamp((t - kStart) / kd, 0, 1));
    if (ku <= 0) return;
    const x0 = L.P.x0;
    ctx.save(); ctx.scale(L.k, L.k);
    // kicker geometry
    const kSize = opt.first ? (L.port ? 38 : 32) : (L.port ? 32 : 28), kTrack = opt.first ? 11 : 9;
    ctx.font = (opt.first ? 800 : 700) + ' ' + kSize + 'px ' + FONT; if ('letterSpacing' in ctx) ctx.letterSpacing = kTrack + 'px';
    const kTextW = ctx.measureText(seg.act || '').width; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const kPad = opt.first ? 22 : 0, kW = opt.first ? kTextW + kPad * 2 - kTrack : 6 + 18 + kTextW;
    const blockW = Math.max(L.capW, kW);
    // soft plate: an elliptical shadow pool behind the block (fades with the caption)
    const cu = ease.out(clamp((t - cStart) / CAP.line, 0, 1));
    const plateA = 0.5 * Math.max(ku * 0.5, cu) * (1 - o);
    if (plateA > 0.001) {
      const pp = L.O.pool || {}; // per-segment pool size (LOWPOS): keeps the soft shadow off nearby action
      const cx = x0 + blockW * (pp.cx != null ? pp.cx : 0.4), cy = (L.top + L.bottom) / 2;
      const rx = blockW * 0.72 + (pp.padX != null ? pp.padX : (L.port ? 170 : 240)), ry = (L.bottom - L.top) * 0.7 + (pp.padY != null ? pp.padY : (L.port ? 120 : 130));
      ctx.save(); ctx.translate(cx, cy); ctx.scale(rx / ry, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
      g.addColorStop(0, 'rgba(0,0,0,' + plateA + ')'); g.addColorStop(0.5, 'rgba(0,0,0,' + plateA * 0.62 + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, ry, 0, TAU); ctx.fill(); ctx.restore();
    }
    // out: a left-to-right wipe + fade
    ctx.globalAlpha = 1 - o * 0.6;
    if (o > 0) { const wx = x0 - 40 + ease.io(o) * (blockW + 120); ctx.beginPath(); ctx.rect(wx, 0, L.VW, L.VH); ctx.clip(); }
    // kicker
    const ky = L.top + L.kh / 2;
    if (opt.first) { // amber plate wipes in, then the act name is revealed inside it
      const pw = kW * ku;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 3;
      ctx.fillStyle = AMBER; ctx.fillRect(x0, L.top, pw, L.kh); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(x0, L.top, pw, L.kh); ctx.clip();
      const tu = ease.out(clamp((t - kStart - 0.1) / 0.25, 0, 1));
      ctx.globalAlpha *= tu;
      text(ctx, seg.act, x0 + kPad - 12 * (1 - tu), ky + 1, kSize, { weight: 800, align: 'left', track: kTrack, color: INK });
      ctx.restore();
    } else { // amber tick grows, the act name slides out from behind it
      const bh = L.kh * ku;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10;
      ctx.fillStyle = AMBER; ctx.fillRect(x0, ky - bh / 2, 6, bh);
      ctx.beginPath(); ctx.rect(x0 + 8, L.top - 10, kTextW + 60, L.kh + 20); ctx.clip();
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 2;
      text(ctx, seg.act, x0 + 24 - 40 * (1 - ku), ky + 1, kSize, { weight: 700, align: 'left', track: kTrack, color: AMBER });
      ctx.restore();
    }
    // caption lines rise out of a mask, staggered
    L.lines.forEach((ln, i) => {
      const lu = ease.out(clamp((t - cStart - i * CAP.stagger) / CAP.line, 0, 1));
      if (lu <= 0) return;
      const ly = L.capTop + i * L.lh;
      ctx.save(); ctx.beginPath(); ctx.rect(x0 - 40, ly - 6, L.capW + 120, L.lh + 26); ctx.clip();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 4;
      text(ctx, ln, x0 - 3, ly + L.lh * 0.52 + (1 - lu) * L.lh * 0.95, L.size, { weight: 900, align: 'left', track: L.size * 0.02, color: '#ffffff' });
      ctx.restore();
    });
    ctx.restore();
  }

  window.TITLES = {
    draw(ctx, seg, t, W, H, B) {
      if (seg.kind === 'card') card(ctx, seg, t, W, H, B);
      else if (seg.kind === 'title') skyline(ctx, seg, t, W, H, B);
      else if (seg.kind === 'end') endcard(ctx, seg, t, W, H, B);
    },
    overlay,
    caption,
    capPhase,
    capInfo(seg, W, H, opt) { // lower-third layout (lines, size, block edges as fractions), for QA
      const c = document.createElement('canvas').getContext('2d'), L = capLayout(c, seg, W, H, opt || {});
      return { lines: L.lines, size: L.size, x: L.P.x0 / L.VW, top: L.top / L.VH, bottom: L.bottom / L.VH, right: (L.P.x0 + L.capW) / L.VW };
    },
    capBox(seg, W, H, opt) { // geometry of a boxed (top) caption block in pixels, for QA
      const c = document.createElement('canvas').getContext('2d'), L = boxLayout(c, seg, W, H, opt || {});
      return { x: L.x0 * L.k, y: L.top * L.k, w: Math.max(L.capW) * L.k, h: (L.bottom - L.top) * L.k, lines: L.lines, size: L.size };
    },
    story,
    storyPhase,
    storyLines,
  };
})();
