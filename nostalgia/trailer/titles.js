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
        const x = -160 + i * 40 + Math.sin(i * 7) * 30, y = -560 - (i % 3) * 40 + Math.sin(t * 3 + i) * 6, f = Math.sin(t * 14 + i * 2);
        ctx.beginPath(); ctx.moveTo(x - 18, y - 8 * f); ctx.quadraticCurveTo(x, y + 4, x + 18, y - 8 * f); ctx.quadraticCurveTo(x, y + 9, x - 18, y - 8 * f); ctx.fill();
      }
    },
  };

  function skyline(ctx, seg, t, W, H, B) {
    const port = H > W, k = port ? W / 1180 : H / 1080, dur = seg.n * B;
    const beats = t / B, b0 = seg.b;
    const slamT = (seg.slam - b0) * B;
    const VH = H / k, oy = port ? VH - 1080 - 260 : 0;
    ctx.save(); ctx.scale(k, k);
    const VW = W / k;
    // sky (portrait: extends above the 1080-unit scene)
    const sg = ctx.createLinearGradient(0, 0, 0, GY + oy); sg.addColorStop(0, port ? '#5ec4d0' : PAL.sky0); sg.addColorStop(1, PAL.sky1);
    ctx.fillStyle = sg; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = PAL.ground; ctx.fillRect(0, GY + oy, VW, VH);
    ctx.translate(0, oy);
    // camera pan: eased from 0 to the Charminar framing at the slam, then a slow push
    const panT = clamp(t / slamT, 0, 1), cx = ease.io(panT) * (port ? 2560 : 2230) + Math.max(0, t - slamT) * 30;
    const zoom = 1 + Math.max(0, t - slamT) * 0.03;
    // sun + clouds (parallax)
    circ(ctx, 1560 - cx * 0.45, 430, 90, PAL.sun);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 9; i++) { const x = ((i * 640 - cx * 0.25 + t * 12) % 4800 + 4800) % 4800 - 400, y = 130 + (i % 3) * 70; ctx.beginPath(); ctx.ellipse(x, y, 110, 30, 0, 0, TAU); ctx.ellipse(x + 60, y - 18, 70, 32, 0, 0, TAU); ctx.ellipse(x - 60, y - 6, 60, 24, 0, 0, TAU); ctx.fill(); }
    ctx.translate(VW / 2, GY); ctx.scale(zoom, zoom); ctx.translate(-VW / 2, -GY);
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
      if (kind === 'charminar') ctx.scale(1.15, 1.15);
      DRAW[kind](ctx, t);
      ctx.restore();
    }
    ctx.restore();
    // the title slam
    if (t >= slamT) {
      const u = clamp((t - slamT) / 0.5, 0, 1), sc = 1.42 - 0.42 * ease.out(u);
      const tk = port ? (W / 1920) * 1.05 : k;
      ctx.save(); ctx.translate(W / 2, port ? H * 0.3 : H * 0.24); ctx.scale(tk * sc, tk * sc);
      ctx.shadowColor = 'rgba(30,40,60,0.35)'; ctx.shadowOffsetY = 8; ctx.shadowBlur = 0;
      text(ctx, 'NOSTALGIA', 0, 0, 190, { color: '#ffffff', track: 26 });
      ctx.shadowColor = 'transparent';
      const u2 = ease.out(clamp((t - slamT - 0.55) / 0.7, 0, 1));
      ctx.globalAlpha = u2;
      text(ctx, 'a Hyderabad story on one cassette', 0, (port ? 140 : 132) + 14 * (1 - u2), port ? 62 : 48, { weight: 500, color: '#2a3a4a', track: 3 + 6 * (1 - u2) });
      ctx.restore();
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
  function capLayout(ctx, seg, W, H, opt) {
    const port = H > W;
    const k = port ? W / 1080 : Math.min(W / 1920, H / 1080), VW = W / k, VH = H / k;
    const P = port
      ? { x0: 84, maxW: 840, base: 96, min: 60, maxLines: 3, lh: 1.04 }
      : { x0: 118, maxW: 1180, base: 92, min: 60, maxLines: 2, lh: 1.04 };
    const words = String(seg.cap).split(/\s+/);
    const meas = (str, size) => { ctx.font = '900 ' + size + 'px ' + FONT; if ('letterSpacing' in ctx) ctx.letterSpacing = (size * 0.02) + 'px'; const w = ctx.measureText(str).width; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; return w; };
    function split(n, size) { // best (min max-width) split of the words into n lines
      let best = null;
      const rec = (i, left, acc) => {
        if (left === 1) { const ls = [...acc, words.slice(i).join(' ')]; const mw = Math.max(...ls.map((l) => meas(l, size))); if (!best || mw < best.w) best = { lines: ls, w: mw }; return; }
        for (let j = i + 1; j <= words.length - left + 1; j++) rec(j, left - 1, [...acc, words.slice(i, j).join(' ')]);
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
    if (port) { top = VH * 0.665 - blockH / 2; top = Math.min(top, VH * 0.735 - blockH); top = Math.max(top, VH * 0.55); }
    else top = 948 - blockH; // bottom edge at 87.8 % (above the bottom 6 % HUD band)
    return { port, k, VW, VH, P, lines: lay.lines, size, lh, capW: lay.w, kh, kgap, top, capTop: top + kh + kgap, bottom: top + blockH };
  }
  function capPhase(seg, t, B, opt) { // 'blank' | 'hold' | 'anim' (lets the renderer reuse identical frames)
    const dur = seg.n * B, outStart = dur - CAP.out - 0.03;
    if (t < (opt.first ? CAP.firstKick : CAP.delay)) return 'blank';
    if (t >= outStart + CAP.out) return 'blank';
    if (t >= CAP.hold && t < outStart) return 'hold';
    return 'anim';
  }
  function caption(ctx, seg, t, W, H, B, opt) {
    opt = opt || {};
    if (!seg.cap) return;
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
      const cx = x0 + blockW * 0.4, cy = (L.top + L.bottom) / 2, rx = blockW * 0.72 + (L.port ? 170 : 240), ry = (L.bottom - L.top) * 0.7 + (L.port ? 120 : 130);
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
    story,
    storyPhase,
    storyLines,
  };
})();
