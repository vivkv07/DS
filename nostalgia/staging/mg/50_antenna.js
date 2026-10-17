
  /* ================================================================ ANTENNA */
  // Sunday, 10:59. Up on the terrace, rotate the fishbone antenna until Doordarshan comes in clear,
  // then hold it there before the Sunday show starts at 11:00. The rusty pole sticks (tap = nudge,
  // hold = turn), the wind pushes it, reflections make false peaks, and crows love to sit on it.
  // Amma shouts from below: "Aaya? Ab? Thoda left! BAS! Wahi rakho!"
  {
    const LOCK_Q = 0.84;
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
            'Listen to Amma: <i>"thoda left!", "aaya!"</i>. The tower is a rough guide: reflections from buildings fool you.',
            'When the picture is clear, <b>hold it</b> till the lock fills. Crows land on the antenna: <b>SHOO</b> them!',
          ],
          goal: 'CLEAR PICTURE BEFORE 11:00 &middot; ' + timeLimit(g) + 's',
          keys: 'hold <kbd>←</kbd> <kbd>→</kbd> turn · tap to nudge · <kbd>Space</kbd> shoo',
          touch: 'Hold <b>◀ ▶</b> to turn, tap to nudge · <b>SHOO!</b> for crows',
        };
      },
      setup(g) {
        const S = g.S, d = g.diff, r = g.rng;
        S.score = 0; S.time = 0; S.limit = timeLimit(g); S.left = S.limit;
        S.tower = -0.35 + r.next() * 0.7;                    // bearing of the tower (as drawn on the compass)
        S.best = S.tower + (r.next() < 0.5 ? -1 : 1) * (0.18 + r.next() * 0.22 + d * 0.1); // true best (reflections)
        S.side = S.best + (r.next() < 0.5 ? -1 : 1) * (1.0 + r.next() * 0.3); // a false peak
        S.theta = S.best + Math.PI * (0.55 + r.next() * 0.5) * (r.next() < 0.5 ? -1 : 1); S.theta0 = S.theta;
        S.omega = 0; S.effort = 0; S.holdT = 0; S.lastDir = 0;
        S.Q = 0; S.Qs = 0; S.lock = 0; S.locked = false; S.holdNeed = 3.4 + d * 2.4;
        S.windPh = r.next() * 10; S.gust = 0; S.gustIn = 6 + r.next() * 5; S.gustDir = 1;
        S.crow = null; S.crowIn = 6 + r.next() * 4 - d * 2; S.shoo = 0; S.crows = 0;
        S.interf = null; S.interfIn = 9 + r.next() * 6;
        S.amma = { text: 'Antenna ghumao! Kuch nahi dikh raha!', t: 0, mood: 'cross' }; S.ammaT = 2.6; S.prevBand = 0;
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
          title: r.win ? 'Picture saaf!' : 'Show shuru... sirf barish!',
          line: r.win ? 'Amma: "Bas! Ab haath mat lagana!" The whole family is in front of the TV.' : 'The title song is playing behind the snow. Next Sunday, start at 10:55.',
          rows: [['Best signal', Math.round(S.bestQ * 100) + '%'], ['Crows shooed', S.crows], ['Time to spare', Math.max(0, Math.ceil(S.left)) + 's'], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.left > S.limit * 0.4 ? 1 : 0) + (S.left > S.limit * 0.65 ? 1 : 0) : 0; },
      cleanup(g) { if (g.S && g.S.hiss) g.S.hiss.stop(); },
    };
    function timeLimit(g) { return g.params.time || Math.round(60 - g.diff * 15); }

    function signal(S, th) {
      const d = U.angleDiff(th, S.best), ds = U.angleDiff(th, S.side), db = U.angleDiff(th, S.best + Math.PI);
      return Math.min(1, Math.exp(-(d * d) / (2 * 0.17 * 0.17)) + 0.5 * Math.exp(-(ds * ds) / (2 * 0.16 * 0.16)) + 0.3 * Math.exp(-(db * db) / (2 * 0.22 * 0.22)));
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
          if (S.effort > 0.16) S.omega = H.approach(S.omega, dir * 0.95, 3.2 * dt);
          S.lastDir = dir;
        } else {
          if (S.holdT > 0 && S.holdT < 0.16) { S.theta += S.lastDir * 0.035; g.tone(260, 0.03, { type: 'square', vol: 0.025 }); } // a nudge
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
        if (c.state === 'in' && c.t > 1.1) { c.state = 'sit'; c.t = 0; g.sfx('crow_caw'); }
        else if (c.state === 'sit') { S.theta += c.side * 0.09 * dt * (1 + g.diff); if (c.t > 2.5 && Math.random() < dt * 0.5) g.sfx('crow_caw', { vol: 0.5 }); }
        else if (c.state === 'out' && c.t > 1.2) S.crow = null;
      } else if (!g.over) {
        S.crowIn -= dt;
        if (S.crowIn <= 0) { S.crow = { state: 'in', t: 0, side: Math.random() < 0.5 ? -1 : 1, from: Math.random() < 0.5 ? -1 : 1 }; S.crowIn = 9 + Math.random() * 6 - g.diff * 3; }
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
      if (S.crow && S.crow.state === 'sit') Q *= 0.72;
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
          if (!S.interf) S.lock = Math.max(0, S.lock - dt * 0.22);
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
        if (g.diff > 0.6 && Math.random() < 0.12) lr = lr === 'left' ? 'right' : 'left';
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
      const tA = S.tower - Math.PI / 2;
      ctx.fillStyle = '#ff6a5a'; ctx.beginPath(); ctx.moveTo(ccx + Math.cos(tA) * (cr - 2), ccy + Math.sin(tA) * (cr - 2)); ctx.lineTo(ccx + Math.cos(tA + 0.12) * (cr - 12), ccy + Math.sin(tA + 0.12) * (cr - 12)); ctx.lineTo(ccx + Math.cos(tA - 0.12) * (cr - 12), ccy + Math.sin(tA - 0.12) * (cr - 12)); ctx.fill();
      H.text(ctx, 'DD', ccx + Math.cos(tA) * (cr + 14), ccy + Math.sin(tA) * (cr + 14), { font: 'osd', size: 14, color: '#ffb4a6', outline: 3, stroke: '#120d16' });
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
      drawAmma(ctx, ax, ay, as, S.amma && S.amma.mood, S.time);
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
