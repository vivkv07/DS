
  /* ================================================================ MARBLES */
  // Goli / kanche (systems_design §8.8), ring game, in the colony playground. Take turns with Pappu
  // (or Tiger, params.rival:'tiger') flicking your striker from outside the ring: every marble knocked
  // out of the ring is yours. Knock one out and stay in the ring = shoot again from there. First to
  // floor(total/2)+1 wins. The big swirl is the jackpot (worth 3). With the raja_goli (inventory or
  // params.rajaGoli) your striker is 25% heavier and the aim guide 30% longer.
  {
    const R = 16, MR = 1.0, SR = 1.3, FRIC = 9, DRAG = 0.5, SM = 1.9;
    const T = (MG.TUNE.marbles = Object.assign({ count: 9, shots: 9, rivalErr: 0.11, rivalErrDiff: 0.6, tigerErr: 0.055, powerJitter: 0.3, tigerJitter: 0.16, rajaMass: 1.25, rajaGuide: 1.3 }, MG.TUNE.marbles || {}));
    const RIVALS = {
      pappu: { name: 'Pappu', shirt: '#2a8c82' },
      tiger: { name: 'Tiger', shirt: '#1a1a2a', cap: '#d8302a', tiger: true },
    };
    const GLASS = ['#3fa0e0', '#e0483a', '#3ac06a', '#f2c230', '#9a5ae0', '#ef7d1a', '#2ac0c0', '#e85a9a'];
    const def = {
      id: 'marbles',
      title: 'Goli Maar',
      sub: 'Kanche in the colony playground. Pappu is good. You are better.',
      osd: 'COLONY PLAYGROUND',
      place: 'playground_', places: ['playground_', 'playground_home', 'school_'],
      secs: 80,
      goLabel: 'MAARO!',
      keys: { KeyA: 'mleft', KeyD: 'mright', ArrowUp: 'mleft', ArrowDown: 'mright', BracketLeft: 'mleft', BracketRight: 'mright', ArrowLeft: 'aleft', ArrowRight: 'aright', Space: 'shoot', Enter: 'shoot' },
      buttons: () => [],
      keyHint: () => '<kbd>A</kbd>/<kbd>D</kbd> move round the ring &nbsp; <kbd>←</kbd><kbd>→</kbd> aim &nbsp; hold <kbd>Space</kbd>, let go to flick &nbsp; (or drag with the mouse)',
      howto(g) {
        const rv = rival(g), raja = hasRaja(g);
        return {
          title: rv.tiger ? 'Goli vs Tiger' : undefined,
          sub: rv.tiger ? 'Tiger is thirteen, wears his cap backwards and never misses. Almost never.' : undefined,
          lines: [
            '<b>Drag back</b> from anywhere and let go to flick your striker (like a slingshot). Tap outside the ring to move your shooting spot.',
            'Knock goli <b>out of the ring</b> to win them. Knock one out and stay inside = <b>shoot again</b> from there.',
            'Take turns with ' + rv.name + '. The big swirly <b>jackpot</b> is worth 3. First to ' + need(g) + ' wins.' + (raja ? ' <b>RAJA GOLI</b>: your striker hits harder and the aim line is longer.' : ''),
          ],
          goal: 'FIRST TO ' + need(g) + ' GOLI &middot; ' + total(g) + ' IN THE RING',
          keys: '<kbd>A</kbd>/<kbd>D</kbd> move · <kbd>←</kbd> <kbd>→</kbd> aim · hold <kbd>Space</kbd> + release · or drag the mouse',
          touch: '<b>Drag back</b> and let go to flick · tap outside the ring to move',
        };
      },
      setup(g) {
        const S = g.S, r = g.rng;
        S.score = 0; S.me = 0; S.rival = 0; S.need = need(g); S.total = total(g);
        S.balls = [];
        S.rv = rival(g); S.raja = hasRaja(g);
        if (g.nameEl && S.rv.tiger && !g.params.title) g.nameEl.textContent = 'Goli vs Tiger';
        const n = count(g);
        // a cross + a few strays around the centre, the jackpot in the middle
        S.balls.push({ x: 0, y: 0, vx: 0, vy: 0, r: MR * 1.35, m: 1.8, col: '#ffffff', jack: true, val: 3, rot: 0 });
        const spots = [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2], [6.2, 0], [-6.2, 0], [0, 6.2], [0, -6.2], [4.5, 4.5], [-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5]];
        for (let i = 0; i < n - 1 && i < spots.length; i++) S.balls.push({ x: spots[i][0] + (r.next() - 0.5) * 0.6, y: spots[i][1] + (r.next() - 0.5) * 0.6, vx: 0, vy: 0, r: MR, m: 1, col: GLASS[i % GLASS.length], val: 1, rot: r.next() * TAU });
        S.pebbles = []; for (let i = 0; i < 5; i++) { const a = r.next() * TAU, d = 8 + r.next() * 6; S.pebbles.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.35 + r.next() * 0.25 }); }
        S.turn = 'me'; S.stage = 'aim'; S.st = 0; S.turns = 0; S.myTurns = 0;
        S.pos = Math.PI / 2; // shooting spot on the ring edge (angle; +y is towards you)
        S.aim = -Math.PI / 2; S.power = 0; S.charging = false; S.chargeT = 0;
        S.striker = null; S.again = false; S.knocked = [];
        S.drag = null; S.msg = null; S.flying = []; S.time = 0;
        placeStriker(S, 'me');
      },
      layout(g) { lay(g, g.S); g.S.bgKey = null; },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) { S.time += dt; if (S.msg) S.msg.t += dt; } },
      pointer(g, type, x, y, id) {
        const S = g.S, L = S.L;
        if (S.turn !== 'me' || S.stage !== 'aim' || g.over) { S.drag = null; return; }
        const wx = (x - L.cx) / L.s, wy = (y - L.cy) / L.s;
        if (type === 'down') {
          const d = Math.hypot(wx, wy), sd = Math.hypot(wx - S.striker.x, wy - S.striker.y);
          if (!S.again && d > R + 1.5 && sd > 3) { S.pos = Math.atan2(wy, wx); placeStriker(S, 'me'); g.tone(500, 0.03, { type: 'sine', vol: 0.03 }); return; }
          S.drag = { id, x0: x, y0: y, x, y };
        } else if (type === 'move' && S.drag && S.drag.id === id) {
          S.drag.x = x; S.drag.y = y;
          const dx = S.drag.x0 - x, dy = S.drag.y0 - y, len = Math.hypot(dx, dy);
          if (len > 6) { S.aim = Math.atan2(dy, dx); S.power = U.clamp(len / L.dragMax, 0, 1); }
        } else if (type === 'up' && S.drag && S.drag.id === id) {
          const len = Math.hypot(S.drag.x0 - S.drag.x, S.drag.y0 - S.drag.y);
          S.drag = null;
          if (len > L.dragMax * 0.08) shoot(g, S, S.aim, S.power);
          else S.power = 0;
        }
      },
      bot(g, dt, want) {
        const S = g.S;
        if (S.turn !== 'me' || S.stage !== 'aim') return;
        S.botT = (S.botT || 0) + dt;
        if (S.botT < 0.35) return;
        S.botT = 0;
        const plan = planShot(S, S.again ? null : 'me');
        if (!plan) { shoot(g, S, -Math.PI / 2, 0.5); return; }
        if (!S.again) { S.pos = plan.pos; placeStriker(S, 'me'); }
        const err = want === 'lose' ? 0.7 : 0;
        S.aim = Math.atan2(plan.ty - S.striker.y, plan.tx - S.striker.x) + err;
        shoot(g, S, S.aim, want === 'lose' ? 0.25 : plan.power);
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'TUM', v: S.me + '/' + S.need, good: S.me > S.rival }, { k: S.rv.name.toUpperCase(), v: S.rival + '/' + S.need, warn: S.rival >= S.need - 1 }, { k: 'SHOTS', v: String(Math.max(0, T.shots - S.myTurns)), warn: S.myTurns >= T.shots - 2 }];
      },
      draw(g, ctx) { drawMarbles(g, ctx, g.S); },
      result(g, r) {
        const S = g.S, nm = S.rv.name;
        return {
          title: r.win ? (S.rv.tiger ? 'Tiger ko haraya!' : 'Saari goli meri!') : r.draw ? 'Barabar!' : nm + ' jeet gaya!',
          line: r.win ? (S.rv.tiger ? 'Tiger turns his cap round the right way, just for a second. "Not bad. Not bad at all."' : 'Your pocket clinks all the way home. ' + nm + ' wants a rematch tomorrow.')
            : (S.rv.tiger ? 'Tiger pockets the jackpot. "Practise, then come back." Kal phir.' : nm + ' grins and pockets the jackpot. Kal phir khelenge.'),
          rows: [['Your goli', S.me], [nm + "'s goli", S.rival], ['Shots', S.myTurns], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.rival <= 2 ? 1 : 0) + (S.myTurns <= 6 ? 1 : 0) : 0; },
    };
    function rival(g) { const k = String(g.params.rival || 'pappu').toLowerCase(); const rv = Object.assign({}, RIVALS[k] || RIVALS.pappu); if (g.params.rivalName) rv.name = String(g.params.rivalName); return rv; }
    function hasRaja(g) { return g.params.rajaGoli != null ? !!g.params.rajaGoli : MG.hasItem('raja_goli'); }
    function count(g) { return Math.max(2, Math.min(13, Math.round(g.params.count || T.count))); }
    function total(g) { return count(g) - 1 + 3; }
    function need(g) { return Math.floor(total(g) / 2) + 1; }

    function lay(g, S) {
      const A = g.area, P = g.portrait;
      const L = (S.L = {});
      const room = P ? Math.min(A.w, A.h * 0.78) : Math.min(A.w * 0.62, A.h);
      L.s = room / (2 * R + 12);
      L.cx = A.x + A.w / 2; L.cy = A.y + (P ? A.h * 0.44 : A.h * 0.5);
      L.dragMax = Math.min(g.W, g.H) * 0.32;
      return L;
    }
    function placeStriker(S, who) {
      const a = who === 'me' ? S.pos : S.rpos;
      const raja = who === 'me' && !!S.raja;
      S.striker = { x: Math.cos(a) * (R + 2.2), y: Math.sin(a) * (R + 2.2), vx: 0, vy: 0, r: SR, m: raja ? SM * T.rajaMass : SM, col: who === 'me' ? '#f4efe2' : '#2a2a3a', striker: who, raja, rot: 0 };
      if (who === 'me') S.aim = Math.atan2(-S.striker.y, -S.striker.x);
    }

    function shoot(g, S, ang, power) {
      if (S.stage !== 'aim' && S.stage !== 'rival') return;
      const v = 6 + power * 36;
      S.striker.vx = Math.cos(ang) * v; S.striker.vy = Math.sin(ang) * v;
      S.stage = 'roll'; S.st = 0; S.knocked = [];
      S.power = 0; S.charging = false;
      S.turns++; if (S.turn === 'me') S.myTurns++;
      g.sfx('marble', { vol: 0.5, pitch: 0.8 });
    }

    function physics(g, S, dt) {
      const all = S.balls.concat(S.striker ? [S.striker] : []);
      const n = 4, h = dt / n;
      let moving = false;
      for (let it = 0; it < n; it++) {
        for (const b of all) {
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0) {
            const dec = (FRIC + DRAG * sp) * h;
            const k = sp > dec ? (sp - dec) / sp : 0;
            b.vx *= k; b.vy *= k;
            b.x += b.vx * h; b.y += b.vy * h;
            b.rot += (sp * h) / b.r;
            if (sp > 0.05) moving = true;
          }
        }
        // pairs
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), md = a.r + b.r;
          if (d >= md || d < 1e-6) continue;
          const nx = dx / d, ny = dy / d;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          const ov = md - d, ia = 1 / a.m, ib = 1 / b.m;
          a.x -= nx * ov * ia / (ia + ib); a.y -= ny * ov * ia / (ia + ib);
          b.x += nx * ov * ib / (ia + ib); b.y += ny * ov * ib / (ia + ib);
          if (rel < 0) {
            const jimp = (-(1 + 0.9) * rel) / (ia + ib);
            a.vx -= jimp * ia * nx; a.vy -= jimp * ia * ny;
            b.vx += jimp * ib * nx; b.vy += jimp * ib * ny;
            if (-rel > 2) { g.sfx('marble', { vol: Math.min(1, -rel / 20), pitch: 0.9 + Math.random() * 0.3, key: (i + j) % 3 }); if (-rel > 10) { const p = toS(S, (a.x + b.x) / 2, (a.y + b.y) / 2); g.burst(p.x, p.y, 4, { colors: ['#fff'], kind: 'spark', speed: 120, grav: 0, life: 0.25, size: 2 }); } }
          }
        }
        // pebbles: a little bump that nudges and slows the goli (a real playground is never flat)
        for (const b of all) for (const p of S.pebbles) {
          const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), md = b.r + p.r;
          if (d >= md || d < 1e-6 || b.bumped === p) continue;
          b.bumped = p;
          const sp = Math.hypot(b.vx, b.vy); if (sp < 0.5) continue;
          const side = Math.sign(dx * b.vy - dy * b.vx) || 1, turn = side * -0.12;
          const c = Math.cos(turn), sn = Math.sin(turn);
          const vx = b.vx * c - b.vy * sn, vy = b.vx * sn + b.vy * c;
          b.vx = vx * 0.92; b.vy = vy * 0.92;
          if (sp > 6) g.tone(900 + Math.random() * 300, 0.02, { type: 'square', vol: 0.015 });
        }
      }
      return moving;
    }

    function resolve(g, S) {
      const who = S.turn;
      let got = 0;
      for (let i = S.balls.length - 1; i >= 0; i--) {
        const b = S.balls[i];
        if (Math.hypot(b.x, b.y) > R + b.r * 0.2) {
          S.balls.splice(i, 1);
          got += b.val;
          if (who === 'me') S.me += b.val; else S.rival += b.val;
          S.flying.push({ b, t: 0, who, from: toS(S, b.x, b.y) });
          const p = toS(S, b.x, b.y);
          g.pop(b.jack ? 'JACKPOT! +3' : '+1', p.x, p.y - 16, { size: b.jack ? 28 : 22, color: who === 'me' ? '#ffd84a' : '#ffb4a6' });
          if (who === 'me') g.sfx('pickup', { vol: 0.6 });
        }
      }
      const st = S.striker;
      const inside = st && Math.hypot(st.x, st.y) < R - st.r * 0.5;
      S.score = S.me * 100;
      if (S.me >= S.need || S.rival >= S.need || S.balls.length === 0 || (S.sudden && S.me !== S.rival)) { end(g, S); return; }
      if (got > 0 && inside) {
        S.again = true;
        S.msg = { text: who === 'me' ? 'PHIR SE MAARO!' : S.rv.name + ' phir se!', t: 0 };
        if (who === 'me') { S.stage = 'aim'; S.aim = Math.atan2(-st.y, -st.x); } else { S.stage = 'rival'; S.st = 0; }
        return;
      }
      S.again = false;
      if (got === 0) S.msg = { text: who === 'me' ? 'Khaali gaya!' : S.rv.name + ' chuk gaya!', t: 0 };
      S.turn = who === 'me' ? 'rival' : 'me';
      if (S.myTurns >= T.shots && S.turn === 'me') {
        if (S.me !== S.rival) { end(g, S); return; }
        if (!S.sudden) { S.sudden = true; S.msg = { text: 'BARABAR! Agli goli jeetegi!', t: 0 }; }
      }
      if (S.turn === 'me') { S.stage = 'aim'; placeStriker(S, 'me'); }
      else { S.stage = 'rival'; S.st = 0; S.rplan = null; }
    }
    function end(g, S) {
      if (g.over) return;
      S.stage = 'done';
      const win = S.me > S.rival;
      S.score = S.me * 100 + (win ? 300 : 0) + Math.max(0, T.shots - S.myTurns) * 30 + (win && S.rv.tiger ? 200 : 0);
      g.finish(win, { mine: S.me, rival: S.rival, draw: S.me === S.rival, opponent: S.rv.tiger ? 'tiger' : 'pappu', raja: !!S.raja, delay: 1.4 });
    }

    // stopping distance from speed v under decel (FRIC + DRAG v), and the speed needed for a distance
    function stopDist(v) { return (v - (FRIC / DRAG) * Math.log(1 + (DRAG * v) / FRIC)) / DRAG; }
    function travel(v0, v1) { return ((v0 - v1) - (FRIC / DRAG) * Math.log((FRIC + DRAG * v0) / (FRIC + DRAG * v1))) / DRAG; }
    function speedFor(dist) { let lo = 0, hi = 120; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (stopDist(m) < dist) lo = m; else hi = m; } return hi; }
    function launchFor(dist, vEnd) { let lo = vEnd, hi = 160; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (travel(m, vEnd) < dist) lo = m; else hi = m; } return hi; }
    // choose a target and a shooting spot that knocks it straight out (fromEdge: search the ring
    // edge; null: shoot from where the striker is). Returns {tx, ty, pos, power, ok}.
    function planShot(S, fromEdge) {
      let best = null, bs = -1e9;
      const spots = [];
      if (fromEdge) for (let k = 0; k < 28; k++) spots.push((k / 28) * TAU);
      else spots.push(null);
      for (const b of S.balls) {
        for (const a of spots) {
          const sx = a == null ? S.striker.x : Math.cos(a) * (R + 2.2), sy = a == null ? S.striker.y : Math.sin(a) * (R + 2.2);
          const ax = b.x - sx, ay = b.y - sy, al = Math.hypot(ax, ay);
          if (al < 0.5) continue;
          const ux = ax / al, uy = ay / al;
          // clear path?
          let blocked = false;
          for (const o of S.balls) { if (o === b) continue; const t = ((o.x - sx) * ux + (o.y - sy) * uy); if (t <= 0 || t >= al) continue; const px = sx + ux * t, py = sy + uy * t; if (Math.hypot(o.x - px, o.y - py) < o.r + SR + 0.15) { blocked = true; break; } }
          // how far must the target travel along u to leave the ring?
          const bu = b.x * ux + b.y * uy, disc = bu * bu - (b.x * b.x + b.y * b.y - R * R);
          const e = -bu + Math.sqrt(Math.max(0, disc)) + b.r + 1.2;
          const vt = speedFor(e);
          const mS = S.striker ? S.striker.m : SM, vi = (vt * (mS + b.m)) / (mS * 1.9);
          const v0 = launchFor(Math.max(0, al - SR - b.r), vi);
          const power = (v0 - 6) / 36;
          const ok = power <= 1;
          const sc = -e * 1.2 - al * 0.15 - (blocked ? 40 : 0) - (ok ? 0 : 25 + (power - 1) * 30) + (b.jack ? 5 : 0);
          if (sc > bs) { bs = sc; best = { tx: b.x, ty: b.y, pos: a, power: U.clamp(power * 1.06, 0.15, 1), ok }; }
        }
      }
      return best;
    }

    function step(g, S, dt) {
      S.time += dt; S.st += dt;
      if (S.msg) S.msg.t += dt;
      for (let i = S.flying.length - 1; i >= 0; i--) { S.flying[i].t += dt; if (S.flying[i].t > 0.9) S.flying.splice(i, 1); }
      if (g.over) { if (S.stage === 'roll') physics(g, S, dt); return; }
      if (S.stage === 'aim' && S.turn === 'me') {
        if (!S.again) {
          const mv = (g.down('mright') ? 1 : 0) - (g.down('mleft') ? 1 : 0);
          if (mv) { S.pos += mv * 0.9 * dt; placeStriker(S, 'me'); }
        }
        const av = (g.down('aright') ? 1 : 0) - (g.down('aleft') ? 1 : 0);
        if (av) S.aim += av * 1.2 * dt;
        if (g.down('shoot')) { S.charging = true; S.chargeT += dt; S.power = 0.5 - 0.5 * Math.cos(S.chargeT * Math.PI / 0.75); }
        else if (S.charging) { S.charging = false; S.chargeT = 0; shoot(g, S, S.aim, Math.max(0.1, S.power)); }
      } else if (S.stage === 'rival') {
        if (!S.rplan) {
          S.rplan = planShot(S, S.again ? null : 'rival');
          if (S.rplan && !S.again) { S.rpos = S.rplan.pos; placeStriker(S, 'rival'); }
          else if (!S.rplan) { S.rpos = -Math.PI / 2; placeStriker(S, 'rival'); S.rplan = { tx: 0, ty: 0, power: 0.6 }; }
          const sd = (S.rv.tiger ? T.tigerErr : T.rivalErr) * (1 - g.diff * T.rivalErrDiff) * (g.auto === 'win' ? 5 : 1);
          const pj = S.rv.tiger ? T.tigerJitter : T.powerJitter;
          S.rplan.aim = (S.rplan ? Math.atan2(S.rplan.ty - S.striker.y, S.rplan.tx - S.striker.x) : Math.PI / 2) + (g.rng.next() + g.rng.next() - 1) * sd;
          S.rplan.power = U.clamp((S.rplan.power || 0.6) * (1 - pj / 2 + g.rng.next() * pj), 0.2, 1);
        }
        if (S.st > 1.2) shoot(g, S, S.rplan.aim, S.rplan.power);
      } else if (S.stage === 'roll') {
        const moving = physics(g, S, dt);
        if ((!moving && S.st > 0.25) || S.st > 8) { for (const b of S.balls) { b.vx = 0; b.vy = 0; } resolve(g, S); }
      }
    }

    /* ------------------------------------------------------------- drawing */
    function toS(S, x, y) { return { x: S.L.cx + x * S.L.s, y: S.L.cy + y * S.L.s }; }

    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, L = S.L;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + g.area.h;
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      // dusty red soil
      const gr = c.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, Math.max(W, Hh) * 0.7);
      gr.addColorStop(0, '#c27a52'); gr.addColorStop(1, '#8e4f34');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      const rng = U.rng(321);
      for (let i = 0; i < 900; i++) { c.fillStyle = rng.next() < 0.5 ? 'rgba(255,220,180,0.08)' : 'rgba(60,25,10,0.1)'; const s = 1 + rng.next() * 2.5; c.fillRect(rng.next() * W, rng.next() * Hh, s, s); }
      // footprints, a neem leaf or two, a bottle cap
      for (let i = 0; i < 6; i++) { const x = rng.next() * W, y = rng.next() * Hh, a = rng.next() * TAU; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = 'rgba(70,30,15,0.15)'; c.beginPath(); c.ellipse(0, 0, L.s * 1.1, L.s * 2.4, 0, 0, TAU); c.fill(); c.restore(); }
      for (let i = 0; i < 4; i++) { const x = rng.next() * W, y = rng.next() * Hh, a = rng.next() * TAU; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = i % 2 ? '#7a9a3a' : '#a8a040'; c.beginPath(); c.ellipse(0, 0, L.s * 0.5, L.s * 1.4, 0, 0, TAU); c.fill(); c.restore(); }
      { const x = W * 0.08, y = Hh * 0.82; c.fillStyle = '#b8b8c0'; c.beginPath(); c.arc(x, y, L.s * 0.9, 0, TAU); c.fill(); c.strokeStyle = '#8a8a90'; c.lineWidth = 1; for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; c.beginPath(); c.moveTo(x + Math.cos(a) * L.s * 0.7, y + Math.sin(a) * L.s * 0.7); c.lineTo(x + Math.cos(a) * L.s * 0.95, y + Math.sin(a) * L.s * 0.95); c.stroke(); } }
      // the ring, scratched with a stick (a slightly wobbly double line)
      c.strokeStyle = 'rgba(255,236,210,0.7)'; c.lineWidth = Math.max(1.5, L.s * 0.22); c.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        c.beginPath();
        for (let i = 0; i <= 90; i++) { const a = (i / 90) * TAU, rr = R + Math.sin(a * 5 + pass) * 0.25 + pass * 0.35; const x = L.cx + Math.cos(a) * rr * L.s, y = L.cy + Math.sin(a) * rr * L.s; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
        c.stroke();
        c.strokeStyle = 'rgba(80,35,20,0.35)'; c.lineWidth = Math.max(1, L.s * 0.12);
      }
      // the gucchi (little pit) in the middle
      c.fillStyle = 'rgba(70,30,15,0.35)'; c.beginPath(); c.ellipse(L.cx, L.cy, L.s * 1.9, L.s * 1.6, 0, 0, TAU); c.fill();
      // pebbles
      for (const p of S.pebbles) { const q = toS(S, p.x, p.y); c.fillStyle = '#9a8a80'; c.beginPath(); c.ellipse(q.x, q.y, p.r * L.s * 1.1, p.r * L.s * 0.85, 0.4, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(q.x - p.r * L.s * 0.3, q.y - p.r * L.s * 0.3, p.r * L.s * 0.35, 0, TAU); c.fill(); }
    }

    function marble(ctx, x, y, r, b) {
      ctx.fillStyle = 'rgba(40,15,5,0.35)'; ctx.beginPath(); ctx.ellipse(x + r * 0.25, y + r * 0.35, r, r * 0.8, 0, 0, TAU); ctx.fill();
      let gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      if (b.raja) { gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.6, '#f2c230'); gr.addColorStop(1, '#a8781a'); }
      else if (b.striker) { gr.addColorStop(0, b.striker === 'me' ? '#ffffff' : '#7a7a90'); gr.addColorStop(1, b.striker === 'me' ? '#c8c0b0' : '#1a1a2a'); }
      else if (b.jack) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8d8e8'); }
      else { gr.addColorStop(0, H.shade(b.col, 1.6)); gr.addColorStop(0.6, b.col); gr.addColorStop(1, H.shade(b.col, 0.55)); }
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      // the swirl (cat's eye) rotates as it rolls
      ctx.save(); ctx.translate(x, y); ctx.rotate(b.rot || 0);
      if (b.jack) {
        const cols = ['#e0483a', '#f2c230', '#3ac06a', '#3fa0e0', '#9a5ae0'];
        cols.forEach((cc, i) => { ctx.strokeStyle = cc; ctx.lineWidth = Math.max(1.2, r * 0.14); ctx.beginPath(); ctx.arc(0, 0, r * (0.25 + i * 0.13), i, i + 2.2); ctx.stroke(); });
      } else if (!b.striker) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.quadraticCurveTo(0, -r * 0.55, r * 0.6, 0); ctx.quadraticCurveTo(0, -r * 0.15, -r * 0.6, 0); ctx.fill();
        ctx.fillStyle = H.shade(b.col, 0.6);
        ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.1); ctx.quadraticCurveTo(0, r * 0.5, r * 0.5, r * 0.1); ctx.quadraticCurveTo(0, r * 0.22, -r * 0.5, r * 0.1); ctx.fill();
      } else { ctx.strokeStyle = b.striker === 'me' ? 'rgba(216,64,42,0.8)' : 'rgba(242,194,48,0.8)'; ctx.lineWidth = Math.max(1.5, r * 0.18); ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU * 0.7); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
    }

    function drawMarbles(g, ctx, S) {
      const W = g.W, Hh = g.H, L = S.L;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      const s = L.s;
      // Pappu crouching at the top of the ring, you at the bottom (top-down: head + shoulders + hands)
      const ra = S.rpos != null && S.turn === 'rival' ? S.rpos : g.portrait ? -Math.PI / 2 : 0;
      const rp = toS(S, Math.cos(ra) * (R + 6), Math.sin(ra) * (R + 6));
      kidTop(ctx, rp.x, rp.y, s, S.rv.shirt, Math.atan2(L.cy - rp.y, L.cx - rp.x), S.turn === 'rival' && S.stage === 'roll' && S.st < 0.2, S.rv.cap);
      if (S.turn === 'me' && S.striker && S.striker.striker === 'me') {
        const a = Math.atan2(S.striker.y, S.striker.x), mp = toS(S, Math.cos(a) * (R + 6.5), Math.sin(a) * (R + 6.5));
        if (!S.again) kidTop(ctx, mp.x, mp.y, s, '#d8402a', Math.atan2(L.cy - mp.y, L.cx - mp.x), S.stage === 'roll' && S.st < 0.2);
      }
      // aim + power (yours) / Pappu's faint aim
      if (S.stage === 'aim' && S.turn === 'me' && S.striker) {
        const p = toS(S, S.striker.x, S.striker.y);
        const len = (6 + S.power * 18 + 6) * s * (S.raja ? T.rajaGuide : 1);
        ctx.strokeStyle = 'rgba(255,246,200,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(S.aim) * len, p.y + Math.sin(S.aim) * len); ctx.stroke(); ctx.setLineDash([]);
        const ex = p.x + Math.cos(S.aim) * len, ey = p.y + Math.sin(S.aim) * len;
        ctx.fillStyle = 'rgba(255,246,200,0.9)'; ctx.beginPath(); ctx.moveTo(ex + Math.cos(S.aim) * 8, ey + Math.sin(S.aim) * 8); ctx.lineTo(ex + Math.cos(S.aim + 2.5) * 8, ey + Math.sin(S.aim + 2.5) * 8); ctx.lineTo(ex + Math.cos(S.aim - 2.5) * 8, ey + Math.sin(S.aim - 2.5) * 8); ctx.fill();
        // slingshot band while dragging
        if (S.drag) { ctx.strokeStyle = 'rgba(216,64,42,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(S.aim) * S.power * L.dragMax * 0.6, p.y - Math.sin(S.aim) * S.power * L.dragMax * 0.6); ctx.stroke(); }
        // power bar next to the striker
        const bw = Math.max(46, s * 9), bx = p.x - bw / 2, by = p.y + s * 2.6 + (p.y > L.cy ? 4 : -s * 6.5);
        ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, bx - 2, by - 2, bw + 4, 10, 5); ctx.fill();
        ctx.fillStyle = S.power > 0.8 ? '#ff6a4a' : '#ffd84a'; H.rr(ctx, bx, by, bw * S.power, 6, 3); ctx.fill();
      }
      if (S.stage === 'rival' && S.rplan && S.striker && S.st > 0.3) {
        const p = toS(S, S.striker.x, S.striker.y), a = S.rplan.aim, len = Math.min(1, (S.st - 0.3) / 0.6) * 14 * s;
        ctx.strokeStyle = 'rgba(234,242,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len); ctx.stroke(); ctx.setLineDash([]);
      }
      // marbles
      for (const b of S.balls) { const p = toS(S, b.x, b.y); marble(ctx, p.x, p.y, b.r * s, b); }
      if (S.striker) { const p = toS(S, S.striker.x, S.striker.y); marble(ctx, p.x, p.y, S.striker.r * s, S.striker); }
      // won marbles fly to the owner's pile
      for (const f of S.flying) {
        const k = H.ease.inOut(Math.min(1, f.t / 0.9)), to = pileXY(g, S, f.who, f.who === 'me' ? S.me : S.rival);
        marble(ctx, lerp(f.from.x, to.x, k), lerp(f.from.y, to.y, k) - Math.sin(k * Math.PI) * 40, f.b.r * s, f.b);
      }
      // piles (counted)
      drawPile(ctx, g, S, 'me', S.me); drawPile(ctx, g, S, 'rival', S.rival);
      // turn banner + message
      const ty = g.portrait ? L.cy + (R + 10) * s : g.area.y + g.area.h - 18;
      H.text(ctx, S.turn === 'me' ? (S.again ? 'PHIR SE! Wahi se maaro' : S.sudden ? 'SUDDEN DEATH: TUMHARI BAARI' : 'TUMHARI BAARI') : S.rv.name.toUpperCase() + ' KI BAARI...', W / 2, Math.min(ty, g.area.y + g.area.h - 16), { font: 'osd', size: 22, color: S.turn === 'me' ? '#ffd84a' : '#eaf2ff', outline: 4 });
      if (S.msg && S.msg.t < 1.4) { const a = S.msg.t > 1 ? 1 - (S.msg.t - 1) / 0.4 : 1; H.text(ctx, S.msg.text, L.cx, L.cy - (R + 4) * s, { font: 'display', size: Math.max(24, s * 3.4), color: '#fff6c8', outline: 6, alpha: a }); }
      if (S.stage === 'aim' && S.turn === 'me' && !S.again && S.st < 4 && S.myTurns === 0) H.text(ctx, g.touch ? 'drag back + let go · tap outside to move' : 'drag back + let go (or Space) · click outside to move', W / 2, L.cy + (R + 4.5) * s + (g.portrait ? 24 : 0), { font: 'body', weight: 700, size: 14, color: '#fff', outline: 4, alpha: 0.85 });
    }
    function pileXY(g, S, who, i) {
      const L = S.L, P = g.portrait;
      const n = Math.max(0, i - 1);
      if (P) return { x: (who === 'me' ? 26 : g.W - 26) + (who === 'me' ? 1 : -1) * (n % 5) * 14, y: g.area.y + g.area.h - 30 - Math.floor(n / 5) * 14 };
      return { x: (who === 'me' ? 40 : g.W - 40) + (who === 'me' ? 1 : -1) * (n % 3) * 16, y: L.cy + 40 - Math.floor(n / 3) * 16 };
    }
    function drawPile(ctx, g, S, who, n) {
      const p0 = pileXY(g, S, who, 1);
      H.text(ctx, who === 'me' ? 'TUM ' + n : S.rv.name.toUpperCase() + ' ' + n, p0.x + (who === 'me' ? 20 : -20), p0.y + (g.portrait ? -28 : -50), { font: 'display', size: 20, color: who === 'me' ? '#ffd84a' : '#eaf2ff', outline: 4, align: who === 'me' ? 'left' : 'right' });
      for (let i = 1; i <= n; i++) { const p = pileXY(g, S, who, i); marble(ctx, p.x, p.y, 6, { col: GLASS[i % GLASS.length], rot: i }); }
    }
    function kidTop(ctx, x, y, s, shirt, face, flick, cap) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(face - Math.PI / 2);
      const k = s * 0.9;
      ctx.fillStyle = 'rgba(40,15,5,0.3)'; ctx.beginPath(); ctx.ellipse(1.5 * k, 2 * k, 4.4 * k, 3.4 * k, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = shirt; H.rr(ctx, -4.2 * k, -2.6 * k, 8.4 * k, 5 * k, 2 * k); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -0.4 * k, 2.2 * k, 0, TAU); ctx.fill();
      if (cap) { // a cap worn backwards: the brim points away from the ring
        ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(0, -0.4 * k, 2.25 * k, 0, TAU); ctx.fill();
        ctx.fillStyle = H.shade(cap, 0.7); H.rr(ctx, -1.6 * k, -3.9 * k, 3.2 * k, 1.8 * k, 0.8 * k); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -0.4 * k, 0.45 * k, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = 1.1 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(2.8 * k, 1.5 * k); ctx.lineTo(2 * k, (flick ? 6.5 : 5) * k); ctx.moveTo(-2.8 * k, 1.5 * k); ctx.lineTo(-3.4 * k, 4.2 * k); ctx.stroke();
      ctx.restore();
    }

    MG.register(def);
  }
