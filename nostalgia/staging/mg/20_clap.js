
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
