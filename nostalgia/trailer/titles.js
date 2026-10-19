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
      // slow tracking-in, letters breathing apart, warm glow
      const dur = seg.n * B, u = clamp(t / dur, 0, 1);
      const a = clamp(t / 0.35, 0, 1) * (1 - clamp((t - (dur - 0.3)) / 0.3, 0, 1));
      ctx.globalAlpha = a;
      const big = seg.text === '2003';
      ctx.shadowColor = big ? 'rgba(255,170,60,0.55)' : 'rgba(255,255,255,0.35)'; ctx.shadowBlur = 40;
      text(ctx, seg.text, 0, 0, big ? 210 : 132, { weight: big ? 900 : 300, track: (big ? 18 : 40) + 50 * u, color: big ? '#ffb347' : '#f4efe6' });
      ctx.shadowBlur = 0;
      if (!big) text(ctx, 'HYDERABAD · TELANGANA · INDIA'.replace('HYDERABAD · ', ''), 0, 120, 26, { weight: 500, track: 14, color: 'rgba(244,239,230,0.55)' });
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
  // world: 4200 design units wide; the camera pans 0 -> 2280 (shows 1920)
  const ITEMS = [
    // [x, kind, popBeatIndex]
    [260, 'clock', 0], [620, 'mecca', 1], [980, 'birla', 2], [1330, 'buddha', 3], [1650, 'kites', 4], [1820, 'cyber', 5],
    [2180, 'golconda', 6], [2520, 'auto', 7], [2700, 'tankbund', 8], [3000, 'pigeons', 9], [3350, 'bus', 10], [3150, 'charminar', 11],
  ];
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
    for (const [x, kind, pi] of ITEMS) {
      const pb = (seg.pops && seg.pops[pi] != null ? seg.pops[pi] : b0 + pi) - b0;
      const u = clamp((beats - pb) / 0.9, 0, 1);
      if (u <= 0) continue;
      const sc = ease.back(u);
      let px = x, dy = 0;
      if (kind === 'auto') px = x + Math.max(0, beats - pb) * 120;
      if (kind === 'bus') px = x - Math.max(0, beats - pb) * 90;
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
      const u = clamp((t - slamT) / 0.45, 0, 1), sc = 1.6 - 0.6 * ease.out(u);
      const tk = port ? (W / 1920) * 1.05 : k;
      ctx.save(); ctx.translate(W / 2, port ? H * 0.3 : H * 0.24); ctx.scale(tk * sc, tk * sc);
      ctx.shadowColor = 'rgba(30,40,60,0.35)'; ctx.shadowOffsetY = 8; ctx.shadowBlur = 0;
      text(ctx, 'NOSTALGIA', 0, 0, 190, { color: '#ffffff', track: 26 });
      ctx.shadowColor = 'transparent';
      const u2 = clamp((t - slamT - 0.5) / 0.5, 0, 1);
      ctx.globalAlpha = u2;
      text(ctx, 'HYDERABAD  ·  2003', 0, 128, 40, { weight: 600, color: '#2a3a4a', track: 16 });
      ctx.restore();
      if (t - slamT < 0.12) { ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - (t - slamT) / 0.12)) + ')'; ctx.fillRect(0, 0, W, H); }
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

  function endcard(ctx, seg, t, W, H) {
    const k = Math.min(W / 1920, H / 1080) * (H > W ? 1.15 : 1);
    ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, W, H);
    const a = clamp(t / 0.5, 0, 1);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(255,170,60,0.5)'; ctx.shadowBlur = 50;
    text(ctx, 'NOSTALGIA', 0, -60, 150, { color: '#ffffff', track: 22 });
    ctx.shadowBlur = 0;
    text(ctx, 'AN OPEN-WORLD HYDERABAD STORY', 0, 50, 34, { weight: 500, color: '#ffb347', track: 12 });
    ctx.globalAlpha = clamp((t - 0.8) / 0.5, 0, 1);
    text(ctx, 'PLAY FREE IN YOUR BROWSER', 0, 170, 40, { weight: 800, color: '#ffffff', track: 8 });
    ctx.restore();
    addGrain(ctx, W, H, t);
  }

  window.TITLES = {
    draw(ctx, seg, t, W, H, B) {
      if (seg.kind === 'card') card(ctx, seg, t, W, H, B);
      else if (seg.kind === 'title') skyline(ctx, seg, t, W, H, B);
      else if (seg.kind === 'end') endcard(ctx, seg, t, W, H, B);
    },
    overlay,
  };
})();
