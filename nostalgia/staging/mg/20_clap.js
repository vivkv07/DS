
  /* =================================================================== CLAP */
  // Golconda, Fateh Darwaza. The guide claps a rhythm under the dome ("SUNO"); you clap it back on
  // the beat ("AB AAP"). Every clean echo climbs the hill and lights the path to Bala Hissar.
  {
    const def = {
      id: 'clap',
      title: 'Golconda Taali',
      sub: 'Clap under the Fateh Darwaza dome. They hear it at the very top.',
      osd: 'GOLCONDA · FATEH DARWAZA',
      place: 'golconda_fateh_darwaza', places: ['golconda_fateh_darwaza', 'golconda_fort'],
      secs: 70,
      goLabel: 'SUNO!',
      keys: { Space: 'clap', KeyJ: 'clap', KeyF: 'clap', KeyK: 'clap', KeyD: 'clap', ArrowUp: 'clap', ArrowDown: 'clap', Enter: 'clap', NumpadEnter: 'clap' },
      buttons: () => [{ gap: true }, { a: 'clap', label: 'TAALI', sub: 'TAP TO CLAP', cls: 'big' }, { gap: true }],
      keyHint: () => '<kbd>Space</kbd> clap (or <kbd>F</kbd> <kbd>J</kbd>, or click) &nbsp; listen first, then echo it on the beat',
      howto(g) {
        return {
          lines: [
            '<b>SUNO</b>: the guide claps a rhythm under the dome. Watch the strip and listen to the beat.',
            '<b>AB AAP</b>: after the 4 ticks, clap the same rhythm back, on time. Extra claps count as mistakes.',
            'Every clean echo climbs the hill and lights a lamp on the way to <b>Bala Hissar</b>.' + (g.diff >= 0.55 ? ' At this level the notes hide on your turn: remember them!' : ''),
          ],
          goal: rounds(g) + ' RHYTHMS &middot; 3 MAUKE (CHANCES)',
          keys: '<kbd>Space</kbd> clap &nbsp;·&nbsp; or click the screen',
          touch: 'Tap <b>TAALI</b> or anywhere on the screen to clap',
        };
      },
      setup(g) {
        const S = g.S;
        S.score = 0; S.round = 0; S.rounds = rounds(g); S.chances = 3; S.fails = 0; S.perfects = 0; S.notesTotal = 0;
        S.bpm = Math.round(92 + g.diff * 32);
        S.beat = 60 / S.bpm; S.slot = S.beat / 2;
        S.winP = 0.05 + (1 - g.diff) * 0.025; S.winG = 0.115 + (1 - g.diff) * 0.05;
        S.hide = g.diff >= 0.55;
        S.rings = []; S.orbs = []; S.marks = []; S.lit = 0; S.litT = 0; S.wave = 0; S.guideClap = 0; S.kidClap = 0;
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
        // scheduled sounds: ticks + the guide's demo claps
        while (R.ev.length && R.ev[0].t <= t) {
          const e = R.ev.shift();
          if (e.k === 'tick') { g.tone(e.acc ? 1560 : 1180, 0.045, { type: 'sine', vol: e.soft ? 0.05 : 0.09 }); g.tone(e.acc ? 3100 : 2400, 0.012, { type: 'square', vol: 0.02 }); S.tickT = 0.12; S.tickAcc = e.acc; }
          else if (e.k === 'demo') { g.sfx('clap', { pitch: 0.82, vol: 0.9 }); S.guideClap = 0.18; ring(S, 'guide'); R.shown[e.i] = true; }
          else if (e.k === 'stage') { R.stage = e.s; if (e.s === 'you') S.msg = { text: 'AB AAP!', t: 0, col: '#ffd84a' }; if (e.s === 'listen') S.msg = { text: 'SUNO...', t: 0, col: '#eaf2ff' }; }
        }
        // the player's claps
        if (!g.over && g.pressed('clap')) clap(g, S, t);
        // misses: expected notes whose window has passed
        if (R.stage === 'you' || R.stage === 'judge') {
          for (const n of R.notes) {
            if (n.res || t < R.pB + n.s * S.slot + S.winG) continue;
            n.res = 'miss'; R.errors++;
            mark(g, S, n.s, 'miss');
            g.tone(140, 0.12, { type: 'triangle', vol: 0.06 });
          }
        }
        if (R.stage === 'you' && t > R.pB + R.L * S.slot + S.winG) { R.stage = 'judge'; judge(g, S); }
        if (R.stage === 'next' && t > R.nextAt) {
          if (S.round >= S.rounds) { if (!g.over) { S.score += S.chances * 150; g.finish(true, { rounds: S.round, fails: S.fails, perfects: S.perfects, delay: 1.6 }); } }
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
        return [{ k: 'TAAL', v: Math.min(S.round, S.rounds) + '/' + S.rounds }, { k: 'MAUKE', v: String(S.chances), warn: S.chances === 1 }, { k: 'SCORE', v: String(S.score) }];
      },
      draw(g, ctx) { drawClap(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? 'Bala Hissar ne suna!' : 'Echo kho gaya...',
          line: r.win ? 'Your claps climbed 400 years of granite and came back. The guide is impressed.' : 'The guide smiles: "Dome ko sunao, apne aap ko nahi." Listen to the beat, then clap.',
          rows: [['Rhythms', Math.min(S.round, S.rounds) + ' / ' + S.rounds], ['Perfect claps', S.perfects + ' / ' + S.notesTotal], ['Mistakes', S.fails], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.fails === 0 ? 1 : 0) + (S.perfects >= S.notesTotal * 0.7 ? 1 : 0) : 0; },
    };
    function rounds(g) { return g.params.rounds || Math.round(4 + g.diff * 2); }

    function newRound(g, S, lead) {
      const k = S.round; // 0-based index of this rhythm
      const n = Math.min(9, 3 + k + (g.diff > 0.7 ? 1 : 0));
      const L = n >= 6 ? 16 : 8;
      const slots = new Set([0]);
      const minGap = g.diff < 0.35 && L === 8 && n <= 4 ? 2 : 1;
      let guard = 0;
      while (slots.size < n && guard++ < 200) {
        const s = (g.rng.next() * L) | 0;
        let ok = true;
        for (const o of slots) if (Math.abs(o - s) < minGap) ok = false;
        if (ok) slots.add(s);
      }
      const notes = Array.from(slots).sort((a, b) => a - b).map((s) => ({ s, res: null }));
      const b = S.beat, sl = S.slot;
      const pA = lead + 4 * b, pB = pA + L * sl + 4 * b;
      const ev = [];
      ev.push({ t: lead - 0.01, k: 'stage', s: 'listen' });
      for (let i = 0; i < 4; i++) ev.push({ t: lead + i * b, k: 'tick', acc: i === 0 });
      notes.forEach((nn, i) => ev.push({ t: pA + nn.s * sl, k: 'demo', i }));
      if (g.diff < 0.5) for (let i = 0; i < L / 2; i++) ev.push({ t: pA + i * b, k: 'tick', soft: true, acc: i % 4 === 0 });
      ev.push({ t: pA + L * sl - 0.02, k: 'stage', s: 'ready' });
      for (let i = 0; i < 4; i++) ev.push({ t: pA + L * sl + i * b, k: 'tick', acc: i === 0 });
      ev.push({ t: pB - S.winG, k: 'stage', s: 'you' });
      if (g.diff < 0.75) for (let i = 0; i < L / 2; i++) ev.push({ t: pB + i * b, k: 'tick', soft: true, acc: i % 4 === 0 });
      ev.sort((a, c) => a.t - c.t);
      S.R = { t0: S.clock, notes, L, pA, pB, ev, stage: 'pre', errors: 0, extras: 0, shown: {}, claps: [] };
      S.marks = [];
    }

    function clap(g, S, t) {
      const R = S.R;
      S.kidClap = 0.16; S.clapsTotal = (S.clapsTotal || 0) + 1;
      g.sfx('clap', { pitch: 1.08 });
      ring(S, 'kid');
      if (R.stage !== 'you') {
        if (R.stage === 'listen' || R.stage === 'ready') { S.msg = { text: 'Pehle suno!', t: 0, col: '#ffb4a6', small: true }; }
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
      if (best && bd <= S.winG) {
        best.res = bd <= S.winP ? 'perfect' : 'good';
        S.notesTotal++;
        if (best.res === 'perfect') { S.perfects++; S.score += 100; } else S.score += 50;
        mark(g, S, relSlot, best.res);
        S.orbs.push({ t: 0, ok: true });
        g.sfx('clap', { pitch: 0.9, vol: 0.35, delay: 0.32, key: 'echo' });
      } else {
        R.extras++; R.errors++;
        mark(g, S, relSlot, 'extra');
        g.tone(180, 0.1, { type: 'triangle', vol: 0.05 });
      }
    }

    function judge(g, S) {
      const R = S.R;
      for (const n of R.notes) if (!n.res) { n.res = 'miss'; R.errors++; }
      const ok = R.errors === 0;
      if (ok) {
        S.round++;
        S.score += 100 * S.round;
        S.msg = { text: ['WAAH!', 'SHABASH!', 'ZABARDAST!', 'KYA BAAT!'][(S.round - 1) % 4], t: 0, col: '#b9ffb0', big: true };
        g.sfx('clap_echo', { delay: 0.15 });
        S.litTarget = S.round / S.rounds;
        S.wave = 1.4;
        if (S.round >= S.rounds) { g.sfx('applause', { delay: 0.5 }); for (let i = 0; i < 8; i++) S.bats.push({ t: -i * 0.08, x: 0, y: 0, vx: (Math.random() - 0.5) * 2, ph: Math.random() * TAU }); }
      } else {
        S.chances--; S.fails++;
        S.msg = { text: S.chances > 0 ? 'PHIR SE SUNO' : 'BAS!', t: 0, col: '#ffb4a6', big: true };
        g.shake(4);
        if (S.chances <= 0 && !g.over) { R.stage = 'done'; g.finish(false, { rounds: S.round, fails: S.fails, perfects: S.perfects, delay: 1.4 }); return; }
      }
      R.stage = 'next';
      R.nextAt = S.clock - R.t0 + 1.25;
    }

    function mark(g, S, slot, res) {
      S.marks.push({ slot, res, t: 0 });
      const L = S.lane;
      if (L) {
        const x = L.x + L.pad + (slot / S.R.L) * L.inner;
        const txt = { perfect: 'PERFECT', good: 'ACCHA', miss: 'MISS', extra: 'EXTRA' }[res];
        const col = { perfect: '#ffd84a', good: '#eaf2ff', miss: '#ff8a7a', extra: '#ffb04a' }[res];
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
      // big message
      if (S.msg && S.msg.t < 1.6) {
        const m = S.msg, k = Math.min(1, m.t / 0.18), a = m.t > 1.2 ? 1 - (m.t - 1.2) / 0.4 : 1;
        const L = S.lane;
        ctx.save(); ctx.translate(W / 2, L.y - (m.big ? u * 9 : u * 6)); ctx.scale(0.6 + 0.4 * H.ease.outBack(k), 0.6 + 0.4 * H.ease.outBack(k));
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
      const lab = { pre: 'TAIYAAR', listen: 'SUNO', ready: 'TAIYAAR...', you: 'AB AAP', judge: 'AB AAP', next: '', done: '' }[R.stage] || '';
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
          drawPalm(ctx, x, cy, L.h * 0.28 * (age < 0.15 ? 1 + (0.15 - age) * 3 : 1), '#eaf2ff', 1);
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

    MG.register(def);
  }
