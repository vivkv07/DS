
  /* =============================================================== PANIPURI */
  // Gokul Chat, Koti. Bhaiya fills puris and drops them in your dona, faster and faster. Eat each one
  // while it's crunchy (green ring). Red ones are TEEKHA: double points but they fire up your spice
  // meter; say "NAKKO" to skip them. Brown meetha ones cool you down. Two puris piled up already?
  // The oldest goes soggy and breaks.
  {
    const TYPES = {
      normal: { fill: '#5fa04a', spice: 6, pts: 10, label: '' },
      teekha: { fill: '#d8402a', spice: 27, pts: 22, label: 'TEEKHA' },
      meetha: { fill: '#8a4a24', spice: -16, pts: 8, label: 'MEETHA' },
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
    function target(g) { return g.params.target || Math.round(18 + g.diff * 12); }

    function bhaiyaSay(S, t) { S.bh.say = t; S.bh.sayT = 1.6; }

    function serveType(g, S) {
      const r = g.rng.next(), pt = 0.2 + g.diff * 0.12, pm = 0.14;
      if (S.served > 2 && r < pt) return 'teekha';
      if (r < pt + pm && S.served > 4) return 'meetha';
      if (S.served > 6 && g.rng.next() < 0.05) return 'sukha';
      return 'normal';
    }
    function interval(g, S) { const prog = S.eaten / S.target; return Math.max(0.62, 1.55 - prog * 0.62 - g.diff * 0.28); }

    function miss(g, S, why) {
      S.misses++; S.combo = 0;
      g.shake(5); g.tone(160, 0.15, { type: 'triangle', vol: 0.06 });
      if (S.misses >= 3 && !g.over) g.finish(false, { eaten: S.eaten, reason: why, delay: 1.4 });
    }

    function step(g, S, dt) {
      S.time += dt;
      const L = S.L;
      if (S.bh.sayT > 0) S.bh.sayT -= dt;
      S.face.chew = Math.max(0, S.face.chew - dt); S.face.gasp = Math.max(0, S.face.gasp - dt);
      S.water = Math.max(0, S.water - dt);
      S.spice = Math.max(0, S.spice - dt * (S.water > 0 ? 30 : 3.5));
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
          const life = interval(g, S) * 1.55;
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
      const crunch = fresh < 0.62;
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
        S.spice = 55; S.water = 1.6; S.face.gasp = 1.6;
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
