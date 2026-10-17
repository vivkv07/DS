
  /* ================================================================ CRICKET */
  // Gully cricket in the colony lane, seen from behind the batter. Time your swing as the tennis ball
  // reaches you and pick a direction. House rules: one-tip-one-hand is out, and anything that lands
  // in Aunty's compound (left) is OUT. The low wall on the right is a six. Chase the target.
  {
    const G = 9.8;
    const LW = -4, RW = 4;           // compound walls (x, metres)
    const LWH = 1.9, RWH = 1.05;     // wall heights
    const FAR = 23;                  // the crossroads
    const HIT_Z = 0.25;

    const def = {
      id: 'cricket',
      title: 'Gully Cricket',
      sub: 'Tennis ball, three bricks for stumps, and Aunty\'s window on the left.',
      osd: 'COLONY LANE · EVENING',
      place: 'playground_', places: ['playground_', 'playground_home', 'lb_stadium', 'victory_playground'],
      secs: 75,
      goLabel: 'PLAY!',
      keys: { ArrowLeft: 'pull', KeyA: 'pull', ArrowUp: 'drive', KeyW: 'drive', Space: 'drive', ArrowRight: 'cut', KeyD: 'cut' },
      buttons: () => [
        { a: 'pull', label: '◀ PULL', sub: 'LEFT' },
        { a: 'drive', label: '▲ DRIVE', sub: 'STRAIGHT', cls: 'big' },
        { a: 'cut', label: 'CUT ▶', sub: 'RIGHT' },
      ],
      keyHint: () => 'swing as the ball reaches you: <kbd>←</kbd> pull · <kbd>↑</kbd>/<kbd>Space</kbd> drive · <kbd>→</kbd> cut',
      howto(g) {
        const S = g.S;
        return {
          lines: [
            'Swing when the ball reaches the <b>glowing ring</b> at your feet. Perfect timing goes up and over; good timing runs along the ground.',
            'Play the line: <b>◀ pull</b> balls on the left, <b>cut ▶</b> balls on the right, <b>▲ drive</b> straight ones. Hit a wall hard = <b>four</b>; over the low right wall = <b>six</b>.',
            'House rules: <b>one-tip-one-hand</b> is out, a catch is out, and anything into <b>Aunty\'s compound</b> (left wall) is OUT.',
          ],
          goal: S.target + ' RUNS IN ' + S.balls + ' BALLS &middot; ' + S.wkts + ' WICKETS',
          keys: '<kbd>←</kbd> pull &nbsp;·&nbsp; <kbd>↑</kbd> / <kbd>Space</kbd> drive &nbsp;·&nbsp; <kbd>→</kbd> cut',
          touch: 'Tap <b>◀ PULL</b>, <b>▲ DRIVE</b> or <b>CUT ▶</b> as the ball arrives',
        };
      },
      setup(g) {
        const S = g.S, d = g.diff;
        S.score = 0; S.runs = 0;
        S.overs = g.params.overs || 2;
        S.balls = S.overs * 6; S.ballsLeft = S.balls; S.bowled = 0;
        S.wkts = g.params.wickets || (d > 0.75 ? 1 : 2); S.wktsLeft = S.wkts;
        S.target = g.params.target || Math.round(13 + d * 14);
        S.winP = 0.045 + (1 - d) * 0.02; S.winG = 0.095 + (1 - d) * 0.03; S.winE = 0.15 + (1 - d) * 0.03;
        S.fours = 0; S.sixes = 0; S.log = [];
        S.stage = 'wait'; S.st = 0; S.clock = 0;
        S.ball = null; S.swing = null; S.msg = null; S.aunty = 0; S.bricks = null;
        S.fieldPos = [[-2.6, 8.5], [2.6, 7.5], [0.6, 16.5]].concat(d > 0.5 ? [[-1.8, 13]] : []);
        S.fielders = S.fieldPos.map((p, i) => ({ x: p[0], z: p[1], hx: p[0], hz: p[1], run: 0, ph: i, look: i }));
        S.bowler = { z: 21, x: 0.3, ph: 0, arm: 0 };
        S.trail = [];
      },
      layout(g) {
        const S = g.S, A = g.area, W = g.W, P = g.portrait;
        const camY = P ? 5.4 : 3.4, camZ = P ? -7.2 : -8.5;
        const hy = A.y + A.h * (P ? 0.17 : 0.25);
        const feet = A.y + A.h * (P ? 0.94 : 0.96);
        const f = ((feet - hy) * (-0.3 - camZ)) / camY;
        S.cam = { x: P ? -0.45 : 0, y: camY, z: camZ, f, cx: W / 2, hy };
        S.bgKey = null;
      },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (!S) return; S.clock += dt; if (S.msg) S.msg.t += dt; },
      bot(g, dt, want) {
        const S = g.S, b = S.ball;
        if (!b || b.hit || S.swing || S.stage !== 'flight') return;
        const lead = want === 'lose' ? 0.14 : 0;
        if (S.clock + dt >= b.tArrive + lead - 0.004) {
          if (b.wide && want === 'win') return;
          const dir = want === 'lose' ? 'pull' : (S.bowled % 2 ? 'cut' : 'drive');
          g.botPress(dir);
        }
      },
      hud(g) {
        const S = g.S;
        return [{ k: 'RUNS', v: S.runs + '/' + S.target, good: S.runs >= S.target }, { k: 'BALLS', v: String(S.ballsLeft), warn: S.ballsLeft <= 3 }, { k: 'WKTS', v: String(S.wktsLeft), warn: S.wktsLeft === 1 }];
      },
      draw(g, ctx) { drawCricket(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? 'Match jeet liya!' : r.reason === 'allout' ? 'All out!' : 'Overs khatam!',
          line: r.win ? 'The colony will talk about that six for a week.' : 'Next time the bat-owner rule might save you.',
          rows: [['Runs', S.runs + ' / ' + S.target], ['Balls', (S.balls - S.ballsLeft) + ' / ' + S.balls], ['Fours · Sixes', S.fours + ' · ' + S.sixes], ['Score', r.score]],
        };
      },
      stars(g, r) { const S = g.S; return r.win ? 1 + (S.wktsLeft === S.wkts ? 1 : 0) + (S.ballsLeft >= 3 ? 1 : 0) : 0; },
    };

    /* ------------------------------------------------------------ physics */
    function newBall(g, S) {
      const d = g.diff, r = g.rng;
      const wide = d > 0.25 && r.next() < 0.07;
      const lines = [-0.32, -0.12, 0.05, 0.2, 0.38];
      const xc = wide ? (r.next() < 0.5 ? -1 : 1) * 1.35 : lines[(r.next() * lines.length) | 0] + (r.next() - 0.5) * 0.1;
      const slow = r.next() < 0.18;
      const T = (slow ? 1.18 : 0.98 - d * 0.22) + r.next() * 0.08;
      const zb = 2.4 + r.next() * 5.2;
      const xr = 0.35 + (r.next() - 0.5) * 0.3;
      return { x: xr, y: 2.05, z: 13.6, rel: { x: xr, z: 13.6 }, xc, zb, T, tRel: S.clock, tArrive: S.clock + T, wide, slow, hit: false, bounces: 0, vx: 0, vy: 0, vz: 0, done: false };
    }
    // the delivery path is scripted (release -> bounce -> crease) so its arrival time is exact
    function deliveryPos(b, t) {
      const k = U.clamp((t - b.tRel) / b.T, 0, 1.4);
      const zr = b.rel.z, zc = HIT_Z;
      const z = zr + (zc - zr) * k;
      const x = b.rel.x + (b.xc - b.rel.x) * k;
      const kb = (zr - b.zb) / (zr - zc); // fraction at the bounce
      let y;
      if (k <= kb) { const u = k / kb; y = lerp(2.05, 0, u) + 0.21 * Math.sin(u * Math.PI); }
      else { const u = (k - kb) / (1 - kb); y = Math.sin(Math.min(1.25, u) * Math.PI * 0.55) * (0.55 + (b.zb - 2.4) * 0.07); }
      return { x, y: Math.max(0.035, y), z, bounced: k > kb };
    }

    function swing(g, S, dir) {
      if (S.swing) return;
      S.swing = { t: 0, dir }; S.swings = (S.swings || 0) + 1;
      const b = S.ball;
      if (!b || b.hit || S.stage !== 'flight') return;
      const e = S.clock - b.tArrive;
      const ae = Math.abs(e);
      if (ae > S.winE) { b.missed = e < 0 ? 'early' : 'late'; return; }
      let q = ae <= S.winP ? 'perfect' : ae <= S.winG ? 'good' : 'edge';
      // play the line: a cut to a leg-side ball or a pull to an off-side ball is a cross-bat risk
      const mismatch = (dir === 'cut' && b.xc < -0.15) || (dir === 'pull' && b.xc > 0.22);
      if (mismatch) q = q === 'perfect' ? 'good' : 'edge';
      launch(g, S, b, dir, q, e);
    }

    function launch(g, S, b, dir, q, e) {
      const r = g.rng;
      const base = dir === 'pull' ? -0.85 : dir === 'cut' ? 0.8 : 0;
      let az = base - (e / S.winG) * 0.32 + (r.next() - 0.5) * 0.12;
      let el, v;
      if (q === 'perfect') { el = 0.48 + r.next() * 0.16; v = 18 + r.next() * 3; if (dir === 'pull') { el = 0.08; v = 19; az = -0.55 - r.next() * 0.2; } }
      else if (q === 'good') { el = 0.06 + r.next() * 0.12; v = 14 + r.next() * 3.5; }
      else { el = 0.75 + r.next() * 0.45; v = 7 + r.next() * 4; az = base * 0.5 + (r.next() - 0.5) * 1.6; if (dir === 'pull' && r.next() < 0.6) { az = -1.1; el = 0.6; v = 10; } }
      const p = deliveryPos(b, S.clock);
      b.hit = true; b.q = q; b.dir = dir;
      b.x = p.x; b.y = Math.max(0.4, p.y); b.z = p.z;
      b.vx = Math.sin(az) * Math.cos(el) * v; b.vz = Math.cos(az) * Math.cos(el) * v; b.vy = Math.sin(el) * v;
      b.bounces = 0; b.t = 0; b.firstBounceZ = null;
      S.stage = 'hit'; S.st = 0;
      g.sfx('bat_hit', { vol: q === 'edge' ? 0.6 : 1, pitch: q === 'perfect' ? 1.1 : q === 'edge' ? 0.8 : 1 });
      if (q === 'perfect') { g.shake(4); g.flash('#fff6c8', 0.18); }
      const pp = proj(S, b.x, b.y, b.z);
      g.burst(pp.x, pp.y, q === 'perfect' ? 16 : 8, { colors: ['#fff6c8', '#d8f05a'], kind: 'spark', speed: 220, grav: 0, life: 0.35, size: 2.4 });
      g.pop(q === 'perfect' ? 'PERFECT!' : q === 'good' ? 'Accha shot' : 'edge!', pp.x, pp.y - 30, { size: q === 'perfect' ? 26 : 19, color: q === 'perfect' ? '#ffd84a' : '#fff', font: q === 'perfect' ? 'display' : 'body', life: 0.8 });
    }

    function outcome(g, S, kind, runs, text, col) {
      if (S.stage === 'result') return;
      S.stage = 'result'; S.st = 0;
      const b = S.ball;
      if (b) b.done = true;
      let line = '';
      if (kind === 'out') {
        S.wktsLeft--;
        g.sfx('howzat'); g.shake(5);
        line = S.wktsLeft > 0 ? (S.wktsLeft === 1 ? 'Last man batting!' : '') : '';
      } else if (kind === 'wide') {
        S.runs += 1; S.ballsLeft++;
      } else {
        S.runs += runs;
        if (runs === 4) { S.fours++; g.sfx('kids'); }
        if (runs === 6) { S.sixes++; g.sfx('crowd_cheer', { vol: 0.7 }); g.burst(g.W / 2, g.area.y + g.area.h * 0.3, 36, { colors: ['#ffd84a', '#ff5a4a', '#4ac8ff', '#6fdc5a', '#fff'], kind: 'paper', speed: 300, grav: 200, life: 1.6, size: 4 }); }
        if (runs === 0) g.tone(300, 0.08, { type: 'triangle', vol: 0.04 });
      }
      S.score = S.runs * 10;
      S.msg = { text, col: col || (kind === 'out' ? '#ff6a5a' : runs >= 4 ? '#ffd84a' : '#fff'), t: 0, sub: line, big: kind === 'out' || runs >= 4 };
      S.log.push(kind === 'out' ? 'W' : kind === 'wide' ? 'wd' : String(runs));
      S.nextAt = kind === 'out' ? 2.0 : runs >= 4 ? 1.8 : 1.3;
    }

    function step(g, S, dt) {
      S.clock += dt; S.st += dt;
      if (S.msg) S.msg.t += dt;
      if (S.swing) { S.swing.t += dt; if (S.swing.t > 0.55 && S.stage !== 'flight') S.swing = null; }
      if (S.aunty > 0) S.aunty -= dt;
      if (S.bricks) S.bricks.t += dt;
      // input
      if (!g.over) for (const a of ['pull', 'drive', 'cut']) if (g.pressed(a) && (S.stage === 'flight' || S.stage === 'runup')) { swing(g, S, a); break; }
      const bw = S.bowler;
      if (S.stage === 'wait') {
        if (S.st > (S.bowled === 0 ? 0.4 : 0.15)) { S.stage = 'runup'; S.st = 0; bw.z = 20.5; S.swing = null; S.bricks = null; resetFielders(S); }
      } else if (S.stage === 'runup') {
        const k = Math.min(1, S.st / 1.15);
        bw.z = lerp(20.5, 14.2, k); bw.ph += dt * 11; bw.arm = 0;
        if (k >= 1) { S.stage = 'flight'; S.st = 0; S.ball = newBall(g, S); bw.arm = 1; g.tone(520, 0.03, { type: 'triangle', vol: 0.03 }); }
      } else if (S.stage === 'flight') {
        bw.arm = Math.max(0, bw.arm - dt * 2);
        const b = S.ball;
        const p = deliveryPos(b, S.clock);
        if (p.bounced && !b.bounced) { b.bounced = true; g.tone(180, 0.04, { type: 'sine', vol: 0.05 }); }
        b.x = p.x; b.y = p.y; b.z = p.z;
        trail(S, b);
        if (S.clock > b.tArrive + S.winE + 0.02) {
          // the ball went past the bat
          if (b.wide) { if (!S.swing) { outcome(g, S, 'wide', 1, 'WIDE! +1'); return; } }
          if (Math.abs(b.xc) < 0.3) {
            S.bricks = { t: 0 };
            g.sfx('chop', { vol: 0.8 });
            outcome(g, S, 'out', 0, 'BOWLED!');
          } else outcome(g, S, 'dot', 0, S.swing ? (b.missed === 'early' ? 'Too early!' : 'Too late!') : 'Dot ball', '#eaf2ff');
          S.ballsLeft--; S.bowled++;
        }
      } else if (S.stage === 'hit') {
        bw.arm = 0;
        flyBall(g, S, dt);
        moveFielders(S, dt);
      } else if (S.stage === 'result') {
        if (S.ball && !S.ball.done) flyBall(g, S, dt);
        moveFielders(S, dt);
        if (S.st > S.nextAt) {
          S.ball = null; S.trail.length = 0;
          if (!g.over) {
            if (S.runs >= S.target) { S.score = S.runs * 10 + S.wktsLeft * 60 + S.ballsLeft * 25; g.finish(true, { runs: S.runs, balls: S.balls - S.ballsLeft, wickets: S.wkts - S.wktsLeft, delay: 0.3 }); return; }
            if (S.wktsLeft <= 0) { g.finish(false, { runs: S.runs, reason: 'allout', delay: 0.3 }); return; }
            if (S.ballsLeft <= 0) { g.finish(false, { runs: S.runs, reason: 'balls', delay: 0.3 }); return; }
          }
          S.stage = 'wait'; S.st = 0;
        }
      }
      if (S.stage === 'hit' && S.runs + 0 >= S.target) { /* resolved in result */ }
    }

    function trail(S, b) { S.trail.push({ x: b.x, y: b.y, z: b.z }); if (S.trail.length > 7) S.trail.shift(); }

    function flyBall(g, S, dt) {
      const b = S.ball;
      if (!b || b.done) return;
      const prev = { x: b.x, y: b.y, z: b.z };
      b.t += dt;
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      trail(S, b);
      // ground
      if (b.y <= 0.035) {
        b.y = 0.035;
        if (b.vy < -1.2) {
          b.bounces++;
          if (b.bounces === 1) b.firstBounceZ = b.z;
          b.vy = -b.vy * 0.48; b.vx *= 0.78; b.vz *= 0.78;
          g.tone(160, 0.035, { type: 'sine', vol: 0.04 });
        } else { b.vy = 0; const k = Math.exp(-1.6 * dt); b.vx *= k; b.vz *= k; }
      }
      if (S.stage !== 'hit') return;
      // walls
      if (b.x < LW && prev.x >= LW) {
        if (b.y > LWH && b.bounces === 0 || b.y > LWH + 0.3) { // into Aunty's compound
          S.aunty = 2.4; b.done = true;
          g.sfx('door_creak', { vol: 0.6 });
          outcome(g, S, 'out', 0, 'AUNTY KE GHAR!', '#ff6a5a');
          S.msg.sub = 'Ball gaya... aur aap bhi OUT!';
          S.ballsLeft--; S.bowled++;
          return;
        }
        if (Math.hypot(b.vx, b.vz) > 10.5 && b.bounces <= 1) { b.done = true; g.sfx('bump', { vol: 0.7 }); outcome(g, S, 'runs', 4, 'DEEWAR PE FOUR!'); S.ballsLeft--; S.bowled++; return; }
        b.x = LW; b.vx = -b.vx * 0.4; b.vz *= 0.6; g.tone(120, 0.05, { type: 'square', vol: 0.03 });
      }
      if (b.x > RW && prev.x <= RW) {
        if (b.y > RWH) {
          b.done = true;
          outcome(g, S, 'runs', b.bounces === 0 ? 6 : 4, b.bounces === 0 ? 'SIX! Plot mein!' : 'FOUR!');
          S.ballsLeft--; S.bowled++;
          return;
        }
        if (Math.hypot(b.vx, b.vz) > 10.5 && b.bounces <= 1) { b.done = true; g.sfx('bump', { vol: 0.7 }); outcome(g, S, 'runs', 4, 'DEEWAR PE FOUR!'); S.ballsLeft--; S.bowled++; return; }
        b.x = RW; b.vx = -b.vx * 0.4; b.vz *= 0.6; g.tone(120, 0.05, { type: 'square', vol: 0.03 });
      }
      if (b.z > FAR) {
        b.done = true;
        outcome(g, S, 'runs', b.bounces === 0 ? 6 : 4, b.bounces === 0 ? 'SIX! Main road tak!' : 'FOUR!');
        S.ballsLeft--; S.bowled++;
        return;
      }
      if (b.z < -1.5) { b.done = true; outcome(g, S, 'runs', 1, '1 run'); S.ballsLeft--; S.bowled++; return; }
      // fielders: catch (on the full / one tip one hand) or stop it
      for (const f of S.fielders) {
        const dxz = Math.hypot(b.x - f.x, b.z - f.z);
        if (dxz > 0.75 || b.y > 1.75) continue;
        const r = g.rng.next();
        if (b.bounces === 0 && b.t > 0.12) {
          if (r < 0.62 + g.diff * 0.25) { catchBall(g, S, f, 'CAUGHT!'); return; }
          dropped(g, S, f); return;
        }
        if (b.bounces === 1 && b.y > 0.15) {
          if (r < 0.45 + g.diff * 0.3) { catchBall(g, S, f, 'ONE TIP ONE HAND!'); return; }
          dropped(g, S, f); return;
        }
        if (b.bounces >= 1) { fielded(g, S, f); return; }
      }
      // ball stops rolling
      const sp = Math.hypot(b.vx, b.vz);
      if (b.bounces > 0 && b.y <= 0.04 && sp < 1.2) {
        const dist = Math.hypot(b.x, b.z);
        const runs = dist < 4 ? 0 : dist < 10 ? 1 : dist < 16 ? 2 : 3;
        outcome(g, S, 'runs', runs, runs ? runs + (runs === 1 ? ' run' : ' runs') : 'No run');
        S.ballsLeft--; S.bowled++;
      }
    }
    function catchBall(g, S, f, text) {
      const b = S.ball;
      b.done = true; b.x = f.x; b.z = f.z; b.y = 1.1; f.catch = 1;
      outcome(g, S, 'out', 0, text);
      S.ballsLeft--; S.bowled++;
    }
    function dropped(g, S, f) {
      const b = S.ball;
      b.vx *= -0.2; b.vz *= -0.15; b.vy = 1.5; f.drop = 1;
      const pp = proj(S, f.x, 1.2, f.z);
      g.pop('chhoot gaya!', pp.x, pp.y - 20, { size: 18, color: '#b9ffb0', font: 'body' });
      fielded(g, S, f, true);
    }
    function fielded(g, S, f, wasDrop) {
      const b = S.ball;
      const dist = Math.hypot(f.x, f.z);
      const runs = wasDrop ? (dist > 12 ? 2 : 1) : dist > 14 ? 2 : dist > 6 ? 1 : 0;
      b.done = true;
      outcome(g, S, 'runs', runs, runs ? runs + (runs === 1 ? ' run' : ' runs') : 'Fielded. No run');
      S.ballsLeft--; S.bowled++;
    }
    function resetFielders(S) { for (const f of S.fielders) { f.x = f.hx; f.z = f.hz; f.run = 0; f.catch = 0; f.drop = 0; } }
    function moveFielders(S, dt) {
      const b = S.ball;
      for (const f of S.fielders) {
        f.ph += dt * 10;
        if (!b || b.done || S.stage !== 'hit') { f.run = Math.max(0, f.run - dt * 3); continue; }
        // run towards where the ball will come down / is rolling
        let tx = b.x, tz = b.z;
        if (b.vy > 0 || b.y > 0.3) { const tt = (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * G * b.y))) / G; tx = b.x + b.vx * tt; tz = b.z + b.vz * tt; }
        const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
        if (d > 7) { f.run = Math.max(0, f.run - dt * 3); continue; }
        const sp = Math.min(d, 3.6 * dt);
        if (d > 0.05) { f.x += (dx / d) * sp; f.z += (dz / d) * sp; f.run = 1; }
      }
    }

    /* ------------------------------------------------------------- drawing */
    function proj(S, x, y, z) {
      const C = S.cam, d = Math.max(0.15, z - C.z);
      return { x: C.cx + ((x - C.x) * C.f) / d, y: C.hy + ((C.y - y) * C.f) / d, k: C.f / d };
    }
    function quad(ctx, S, pts) {
      ctx.beginPath();
      pts.forEach((p, i) => { const q = proj(S, p[0], p[1], p[2]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.closePath();
    }

    function paintBg(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr;
      S.bgKey = W + 'x' + Hh + ':' + d + ':' + g.area.h;
      const c0 = (S.bg = S.bg || H.canvas(1, 1)); c0.width = Math.round(W * d); c0.height = Math.round(Hh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const C = S.cam, near = C.z + 0.5;
      // evening sky
      let gr = c.createLinearGradient(0, 0, 0, C.hy + 10);
      gr.addColorStop(0, '#3d6fa8'); gr.addColorStop(0.6, '#e9a46a'); gr.addColorStop(1, '#f6cf8a');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      // far crossroads: shops, a lamp post, a water tank
      const fz = FAR + 9;
      const shop = (x0, x1, h, col, sign, scol) => {
        quad(c, S, [[x0, 0, fz], [x1, 0, fz], [x1, h, fz], [x0, h, fz]]); c.fillStyle = col; c.fill();
        quad(c, S, [[x0 + 0.4, 0, fz - 0.01], [x1 - 0.4, 0, fz - 0.01], [x1 - 0.4, 2.2, fz - 0.01], [x0 + 0.4, 2.2, fz - 0.01]]); c.fillStyle = '#2a1d1a'; c.fill();
        if (sign) {
          quad(c, S, [[x0 + 0.2, 2.5, fz - 0.02], [x1 - 0.2, 2.5, fz - 0.02], [x1 - 0.2, 3.4, fz - 0.02], [x0 + 0.2, 3.4, fz - 0.02]]); c.fillStyle = scol; c.fill();
          const p = proj(S, (x0 + x1) / 2, 2.95, fz);
          H.text(c, sign, p.x, p.y, { font: 'display', size: Math.max(7, p.k * 0.55), color: '#1a1214', maxW: ((x1 - x0) - 0.6) * p.k });
        }
      };
      shop(-26, -15, 7, '#c7b9d6', null);
      shop(-15, -5, 5.2, '#d9b48a', 'KIRANA & GENERAL', '#f2c230');
      shop(5, 15, 6, '#c9a2b8', 'STATIONERY · XEROX', '#efe9dc');
      shop(15, 26, 8, '#bcd3c4', null);
      shop(-5, 5, 7.5, '#b8a48c', null);
      { const p = proj(S, 0, 4.6, fz); H.sign(c, p.x - p.k * 3.2, p.y - p.k * 0.6, p.k * 6.4, p.k * 1.2, { fill: '#2a8c82', text: 'IRANI CAFE', color: '#efe9dc', size: p.k * 0.7, bolts: false }); }
      // tanks + antennas on the far roofs, a lamp post
      for (const tx of [-20, 2.2, 19]) { const p = proj(S, tx, 0, fz + 0.5), q = proj(S, tx, tx === 2.2 ? 7.5 : tx < 0 ? 7 : 8, fz + 0.5); c.fillStyle = '#26222a'; H.rr(c, q.x - p.k * 0.9, q.y - p.k * 1.9, p.k * 1.8, p.k * 1.9, p.k * 0.3); c.fill(); }
      { const p = proj(S, -9, 5.2, fz), k = p.k; c.strokeStyle = '#4a4450'; c.lineWidth = Math.max(1, k * 0.08); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - k * 3); for (let i = 0; i < 4; i++) { c.moveTo(p.x - k * (1 - i * 0.15), p.y - k * 3 + i * k * 0.35); c.lineTo(p.x + k * (1 - i * 0.15), p.y - k * 3 + i * k * 0.35); } c.stroke(); }
      { const p = proj(S, 4.6, 0, FAR + 1), q = proj(S, 4.6, 5.5, FAR + 1); c.strokeStyle = '#3a3a40'; c.lineWidth = Math.max(1.5, p.k * 0.12); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineTo(q.x - p.k * 0.9, q.y); c.stroke(); c.fillStyle = '#ffe9b0'; c.fillRect(q.x - p.k * 1.1, q.y, p.k * 0.5, p.k * 0.15); }
      // far road across
      quad(c, S, [[-40, 0, FAR], [40, 0, FAR], [40, 0, fz], [-40, 0, fz]]); c.fillStyle = '#6a6460'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.setLineDash([10, 10]);
      { const a = proj(S, -40, 0, FAR + 4.5), b2 = proj(S, 40, 0, FAR + 4.5); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b2.x, b2.y); c.stroke(); }
      c.setLineDash([]);
      // the lane surface
      gr = c.createLinearGradient(0, C.hy, 0, Hh);
      gr.addColorStop(0, '#9a8a78'); gr.addColorStop(1, '#7e6e5e');
      quad(c, S, [[LW, 0, near], [RW, 0, near], [RW, 0, FAR], [LW, 0, FAR]]); c.fillStyle = gr; c.fill();
      // worn pitch strip + chalk creases + some patches
      quad(c, S, [[-0.9, 0, near], [0.9, 0, near], [0.9, 0, 14.6], [-0.9, 0, 14.6]]); c.fillStyle = 'rgba(214,190,150,0.45)'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2;
      for (const z of [0.9, 13.4]) { quad(c, S, [[-1.1, 0, z], [1.1, 0, z], [1.1, 0, z + 0.04], [-1.1, 0, z + 0.04]]); c.stroke(); }
      const rng = U.rng(4242);
      for (let i = 0; i < 40; i++) { const x = LW + rng.next() * 8, z = 1 + rng.next() * 20, p = proj(S, x, 0, z); c.fillStyle = 'rgba(60,45,35,0.18)'; c.beginPath(); c.ellipse(p.x, p.y, p.k * 0.35, p.k * 0.08, 0, 0, TAU); c.fill(); }
      // drain lines along the walls
      quad(c, S, [[LW, 0, near], [LW + 0.35, 0, near], [LW + 0.35, 0, FAR], [LW, 0, FAR]]); c.fillStyle = 'rgba(40,40,40,0.35)'; c.fill();
      quad(c, S, [[RW - 0.35, 0, near], [RW, 0, near], [RW, 0, FAR], [RW - 0.35, 0, FAR]]); c.fill();
      // RIGHT: open plot beyond a low wall, a neem tree, a parked cycle
      quad(c, S, [[RW, 0, near], [30, 0, near], [30, 0, FAR], [RW, 0, FAR]]); c.fillStyle = '#b5845a'; c.fill();
      quad(c, S, [[RW, 0, near], [RW, RWH, near], [RW, RWH, FAR], [RW, 0, FAR]]); c.fillStyle = '#d9cbb0'; c.fill();
      quad(c, S, [[RW, RWH, near], [RW + 0.25, RWH, near], [RW + 0.25, RWH, FAR], [RW, RWH, FAR]]); c.fillStyle = '#efe6d2'; c.fill();
      { const p = proj(S, RW + 0.02, 0.6, 11); H.text(c, 'NO PARKING', p.x, p.y, { font: 'osd', size: Math.max(6, p.k * 0.35), color: '#b22b2b' }); }
      // LEFT: Aunty's house behind a tall compound wall, with a gate and a window
      quad(c, S, [[-30, 0, near], [LW, 0, near], [LW, 0, FAR], [-30, 0, FAR]]); c.fillStyle = '#8a7a66'; c.fill();
      const hx = LW - 2.6;
      quad(c, S, [[hx, 0, 3], [hx, 6.5, 3], [hx, 6.5, 15], [hx, 0, 15]]); c.fillStyle = '#e8c7b0'; c.fill();
      quad(c, S, [[hx, 6.5, 3], [hx + 0.8, 6.9, 3], [hx + 0.8, 6.9, 15], [hx, 6.5, 15]]); c.fillStyle = '#b5694a'; c.fill();
      quad(c, S, [[hx, 2.4, 6.2], [hx, 4.3, 6.2], [hx, 4.3, 9.4], [hx, 2.4, 9.4]]); c.fillStyle = '#3a2a30'; c.fill(); // the window
      c.strokeStyle = '#6a5a50'; c.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) { const z = 6.2 + k * 0.64; quad(c, S, [[hx, 2.4, z], [hx, 4.3, z], [hx, 4.3, z], [hx, 2.4, z]]); c.stroke(); }
      quad(c, S, [[hx + 0.05, 2.0, 5.9], [hx + 0.05, 2.4, 5.9], [hx + 0.05, 2.4, 9.7], [hx + 0.05, 2.0, 9.7]]); c.fillStyle = '#7ea36a'; c.fill(); // flower box
      for (let k = 0; k < 7; k++) { const p = proj(S, hx + 0.1, 2.5, 6.1 + k * 0.55); c.fillStyle = ['#ff7a9a', '#ffd84a', '#ff5a4a'][k % 3]; c.beginPath(); c.arc(p.x, p.y, Math.max(1.5, p.k * 0.12), 0, TAU); c.fill(); }
      // the door + step
      quad(c, S, [[hx, 0, 11.2], [hx, 2.3, 11.2], [hx, 2.3, 12.6], [hx, 0, 12.6]]); c.fillStyle = '#7a4a2a'; c.fill();
      quad(c, S, [[hx, 2.3, 11.1], [hx, 2.6, 11.1], [hx, 2.6, 12.7], [hx, 2.3, 12.7]]); c.fillStyle = '#f2c230'; c.fill(); // painted lintel
      // upstairs balcony with a railing and the day's washing
      quad(c, S, [[hx, 4.9, 4], [hx + 0.9, 4.9, 4], [hx + 0.9, 4.9, 13.5], [hx, 4.9, 13.5]]); c.fillStyle = '#c9a28a'; c.fill();
      c.strokeStyle = '#4a4450'; c.lineWidth = 1.2;
      quad(c, S, [[hx + 0.9, 4.9, 4], [hx + 0.9, 5.8, 4], [hx + 0.9, 5.8, 13.5], [hx + 0.9, 4.9, 13.5]]); c.stroke();
      for (let k = 1; k < 16; k++) { const z = 4 + k * 0.6, a = proj(S, hx + 0.9, 4.9, z), b2 = proj(S, hx + 0.9, 5.8, z); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b2.x, b2.y); c.stroke(); }
      const wash = ['#d8402a', '#2a8c82', '#f2c230', '#efe9dc', '#7a3db8', '#3b6fc4'];
      for (let k = 0; k < 6; k++) { const z = 5 + k * 1.3; quad(c, S, [[hx + 0.95, 5.9, z], [hx + 0.95, 5.0, z], [hx + 0.95, 5.0, z + 0.8], [hx + 0.95, 5.9, z + 0.8]]); c.fillStyle = wash[k]; c.fill(); }
      // fishbone antenna on the roof
      { const p = proj(S, hx + 1, 6.9, 10), q = proj(S, hx + 1, 9.2, 10); c.strokeStyle = '#4a4450'; c.lineWidth = Math.max(1, p.k * 0.07); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); for (let i = 0; i < 4; i++) { const y = q.y + i * p.k * 0.3; c.moveTo(q.x - p.k * (0.9 - i * 0.15), y); c.lineTo(q.x + p.k * (0.9 - i * 0.15), y); } c.stroke(); }
      // wall (stops low balls; over it = out)
      quad(c, S, [[LW, 0, near], [LW, LWH, near], [LW, LWH, FAR], [LW, 0, FAR]]);
      gr = c.createLinearGradient(0, C.hy, 0, Hh); gr.addColorStop(0, '#d8c9ae'); gr.addColorStop(1, '#bfae92');
      c.fillStyle = gr; c.fill();
      quad(c, S, [[LW, LWH, near], [LW - 0.25, LWH, near], [LW - 0.25, LWH, FAR], [LW, LWH, FAR]]); c.fillStyle = '#efe6d2'; c.fill();
      // gate (green grill) + the house name on the pillar
      quad(c, S, [[LW + 0.01, 0, 10.5], [LW + 0.01, 1.7, 10.5], [LW + 0.01, 1.7, 12.8], [LW + 0.01, 0, 12.8]]); c.fillStyle = '#2f6a4a'; c.fill();
      c.strokeStyle = '#1e4a32'; c.lineWidth = 1;
      for (let k = 1; k < 7; k++) { const z = 10.5 + k * 0.33; quad(c, S, [[LW + 0.01, 0.1, z], [LW + 0.01, 1.6, z], [LW + 0.01, 1.6, z], [LW + 0.01, 0.1, z]]); c.stroke(); }
      { const p = proj(S, LW + 0.02, 1.25, 9.6); c.fillStyle = '#f4ead8'; c.fillRect(p.x - p.k * 0.5, p.y - p.k * 0.35, p.k * 1.1, p.k * 0.6); H.text(c, 'SHANTI', p.x + p.k * 0.05, p.y - p.k * 0.12, { font: 'body', weight: 700, size: Math.max(5, p.k * 0.2), color: '#2a1d1a' }); H.text(c, 'NILAYAM', p.x + p.k * 0.05, p.y + p.k * 0.1, { font: 'body', weight: 700, size: Math.max(5, p.k * 0.2), color: '#2a1d1a' }); }
      // chalk warning on the wall
      { const p = proj(S, LW + 0.02, 0.9, 8); H.text(c, 'BALL ANDAR = OUT', p.x, p.y, { font: 'body', weight: 700, size: Math.max(7, p.k * 0.3), color: 'rgba(255,255,255,0.85)' }); }
      // neem tree (right, overhanging the plot)
      { const p = proj(S, RW + 2.5, 0, 10.5); const k = p.k;
        c.fillStyle = '#5a4030'; c.fillRect(p.x - k * 0.18, p.y - k * 3.2, k * 0.36, k * 3.2);
        const blobs = [[0, 4.2, 1.8], [-1.3, 3.7, 1.3], [1.3, 3.8, 1.4], [0.4, 5.2, 1.3], [-0.8, 5, 1.1]];
        for (const [bx, by, br] of blobs) { c.fillStyle = '#3f6a30'; c.beginPath(); c.arc(p.x + bx * k, p.y - by * k, br * k, 0, TAU); c.fill(); }
        for (const [bx, by, br] of blobs) { c.fillStyle = 'rgba(140,190,90,0.35)'; c.beginPath(); c.arc(p.x + bx * k - br * k * 0.25, p.y - by * k - br * k * 0.3, br * k * 0.55, 0, TAU); c.fill(); } }
      // a parked Chetak by the right wall
      { const p = proj(S, RW - 0.7, 0, 15); const k = p.k;
        c.fillStyle = '#7fb3c2'; H.rr(c, p.x - k * 0.6, p.y - k * 0.9, k * 1.2, k * 0.6, k * 0.25); c.fill();
        c.fillStyle = '#1a1214'; c.beginPath(); c.arc(p.x - k * 0.45, p.y - k * 0.2, k * 0.2, 0, TAU); c.arc(p.x + k * 0.45, p.y - k * 0.2, k * 0.2, 0, TAU); c.fill(); }
    }

    function kid(ctx, x, y, h, o) {
      // front-facing kid (bowler / fielders); y = feet, h = height in px
      const s = h / 60;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 3, 0, 0, TAU); ctx.fill();
      const run = o.run ? Math.sin(o.ph) * 7 : 0;
      ctx.fillStyle = o.pants || '#3b4a6b';
      if (o.crouch) { ctx.fillRect(-8, -18, 6, 18); ctx.fillRect(2, -18, 6, 18); }
      else { ctx.save(); ctx.translate(-4, -24); ctx.rotate(run * 0.05); ctx.fillRect(-3, 0, 6, 24); ctx.restore(); ctx.save(); ctx.translate(4, -24); ctx.rotate(-run * 0.05); ctx.fillRect(-3, 0, 6, 24); ctx.restore(); }
      const by = o.crouch ? -40 : -46;
      ctx.fillStyle = o.shirt || '#2a8c82'; H.rr(ctx, -10, by, 20, 24, 5); ctx.fill();
      ctx.fillStyle = o.skin || '#8a5a35'; ctx.beginPath(); ctx.arc(0, by - 7, 7.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, by - 9, 7.8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.fillRect(-3.5, by - 7.5, 2, 2); ctx.fillRect(1.5, by - 7.5, 2, 2);
      ctx.strokeStyle = o.skin || '#8a5a35'; ctx.lineWidth = 4.2; ctx.lineCap = 'round';
      ctx.beginPath();
      if (o.bowl != null) { const a = -Math.PI / 2 - o.bowl * Math.PI * 1.2; ctx.moveTo(8, by + 4); ctx.lineTo(8 + Math.cos(a) * 18, by + 4 + Math.sin(a) * 18); ctx.moveTo(-8, by + 4); ctx.lineTo(-14, by + 16 + run * 0.5); }
      else if (o.catch) { ctx.moveTo(-8, by + 4); ctx.lineTo(-4, by - 16); ctx.moveTo(8, by + 4); ctx.lineTo(4, by - 16); }
      else if (o.crouch) { ctx.moveTo(-8, by + 4); ctx.lineTo(-7, by + 22); ctx.moveTo(8, by + 4); ctx.lineTo(7, by + 22); }
      else { ctx.moveTo(-8, by + 4); ctx.lineTo(-12, by + 18 - run); ctx.moveTo(8, by + 4); ctx.lineTo(12, by + 18 + run); }
      ctx.stroke();
      ctx.restore();
    }

    function drawBatter(ctx, S, g) {
      const p = proj(S, 0.05, 0, -0.3);
      const hpx = 1.32 * p.k;
      const s = hpx / 60;
      const sw = S.swing;
      // bat angle: back-lift at rest, sweeps towards the shot direction
      let ang = 0.25;
      if (sw) {
        const k = Math.min(1, sw.t / 0.2);
        const end = sw.dir === 'pull' ? -1.7 : sw.dir === 'cut' ? 1.35 : -2.6;
        ang = lerp(2.5, end, H.ease.out(k));
      } else if (S.stage === 'flight' || S.stage === 'runup') ang = 2.5 + Math.sin(S.clock * 9) * 0.06;
      const lift = Math.abs(ang) > 1.15;
      // the bat (behind the body when lifted)
      const hx = p.x + 6 * s, hy = p.y - 34 * s;
      const drawBat = () => {
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
        ctx.fillStyle = '#c99a5a'; H.rr(ctx, -3.4 * s, 4 * s, 6.8 * s, 30 * s, 2 * s); ctx.fill();
        ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = Math.max(1, s * 1.2); ctx.stroke();
        ctx.fillStyle = '#3a2a2a'; ctx.fillRect(-1.6 * s, -6 * s, 3.2 * s, 11 * s);
        ctx.restore();
      };
      if (!lift) drawBat();
      H.kidBack(ctx, p.x, p.y, s, { shirt: '#f4efe2', stripes: '#2a8c82', pants: '#2b3a5a', skin: '#a8703f' });
      // arms to the bat handle
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = Math.max(2, 4.2 * s); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - 8 * s, p.y - 42 * s); ctx.lineTo(hx, hy); ctx.moveTo(p.x + 8 * s, p.y - 42 * s); ctx.lineTo(hx + 1, hy + 2); ctx.stroke();
      if (lift) drawBat();
    }

    function drawCricket(g, ctx, S) {
      const W = g.W, Hh = g.H;
      if (S.bgKey !== W + 'x' + Hh + ':' + g.dpr + ':' + g.area.h) paintBg(g, S);
      ctx.drawImage(S.bg, 0, 0, W, Hh);
      // Aunty at the window (or in a bubble at the screen edge when the window is off-screen)
      if (S.aunty > 0) {
        let p = proj(S, LW - 2.55, 2.5, 7.8), k = p.k;
        const inset = p.x < 30;
        if (inset) {
          k = Math.max(26, W * 0.08); p = { x: k * 1.6, y: g.area.y + g.area.h * 0.42 };
          ctx.fillStyle = '#3a2a30'; ctx.strokeStyle = '#efe6d2'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.4, k * 1.25, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.4, k * 1.2, 0, TAU); ctx.clip();
        }
        ctx.fillStyle = '#d8402a'; H.rr(ctx, p.x - k * 0.7, p.y - k * 1.4, k * 1.4, k * 1.4, k * 0.3); ctx.fill();
        ctx.fillStyle = '#8a5a35'; ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.75, k * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.9, k * 0.44, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = '#b22b2b'; ctx.beginPath(); ctx.arc(p.x, p.y - k * 1.92, k * 0.06, 0, TAU); ctx.fill();
        if (inset) ctx.restore();
        const bw_ = Math.max(118, k * 4.2), bx = Math.min(W - bw_ - 8, p.x + k * 0.6), by = p.y - k * 3.2;
        H.sign(ctx, bx, by - 16, bw_, Math.max(30, k * 1.1), { fill: '#fff8e6', text: 'Kaun hai re?!', size: Math.max(14, k * 0.5), font: 'body', bolts: false, r: 10 });
      }
      // sprites, far to near
      const spr = [];
      const bw = S.bowler;
      spr.push({ z: bw.z, f: () => { const p = proj(S, bw.x, 0, bw.z); kid(ctx, p.x, p.y, 1.45 * p.k, { shirt: '#d8402a', pants: '#2b2430', run: S.stage === 'runup', ph: bw.ph, bowl: S.stage === 'flight' || S.stage === 'runup' ? bw.arm : null }); } });
      S.fielders.forEach((f, i) => spr.push({ z: f.z, f: () => { const p = proj(S, f.x, 0, f.z); kid(ctx, p.x, p.y, 1.35 * p.k, { shirt: ['#2a8c82', '#f2c230', '#7a3db8', '#3b6fc4'][i % 4], pants: '#4a3f35', crouch: !f.run && !f.catch && S.stage !== 'result', run: f.run > 0.5, ph: f.ph, catch: f.catch }); } }));
      // bowler's-end bricks
      spr.push({ z: 13.4, f: () => drawBricks(ctx, S, 13.45, null) });
      const b = S.ball;
      if (b && !(b.done && S.aunty > 0)) spr.push({ z: b.z, f: () => drawBall(ctx, S, b) });
      spr.sort((a, c) => c.z - a.z);
      for (const s_ of spr) s_.f();
      // the hitting ring at the batter's feet
      if (S.stage === 'flight' && b && !b.hit) {
        const dtA = b.tArrive - S.clock, near = U.clamp(1 - Math.abs(dtA) / 0.45, 0, 1);
        const p = proj(S, 0.15, 0, HIT_Z);
        ctx.strokeStyle = 'rgba(255,216,74,' + (0.25 + near * 0.7 * (g.diff < 0.65 ? 1 : 0.4)) + ')';
        ctx.lineWidth = 2 + near * 3;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.k * (0.75 - near * 0.2), p.k * 0.16, 0, 0, TAU); ctx.stroke();
      }
      drawBatter(ctx, S, g);
      drawBricks(ctx, S, -0.75, S.bricks);
      // message
      if (S.msg && S.msg.t < 2) {
        const m = S.msg, k = Math.min(1, m.t / 0.2), a = m.t > 1.5 ? 1 - (m.t - 1.5) / 0.5 : 1;
        const y = g.area.y + g.area.h * 0.18;
        ctx.save(); ctx.translate(W / 2, y); const sc = 0.5 + 0.5 * H.ease.outBack(k); ctx.scale(sc, sc); ctx.rotate(-0.03);
        H.text(ctx, m.text, 0, 0, { font: 'display', size: m.big ? Math.max(34, Math.min(64, W * 0.09)) : Math.max(26, Math.min(44, W * 0.065)), color: m.col, outline: 7, alpha: a, maxW: W - 30 });
        if (m.sub) H.text(ctx, m.sub, 0, Math.max(34, W * 0.06), { font: 'body', weight: 700, size: Math.max(15, Math.min(22, W * 0.035)), color: '#fff', outline: 4, alpha: a });
        ctx.restore();
      }
      // chasing: need X off Y
      if (S.stage !== 'result' && !g.over) {
        const need = Math.max(0, S.target - S.runs);
        H.text(ctx, 'NEED ' + need + ' OFF ' + S.ballsLeft, W / 2, g.area.y + 18, { font: 'osd', size: 22, color: '#eaf2ff', outline: 4, stroke: '#1b2a78' });
        // this over's balls, like chalk marks
        const last = S.log.slice(-6);
        last.forEach((t, i) => H.text(ctx, t, W / 2 + (i - (last.length - 1) / 2) * 30, g.area.y + 42, { font: 'osd', size: 20, color: t === 'W' ? '#ff8a7a' : t === '4' || t === '6' ? '#ffd84a' : '#fff', outline: 3 }));
      }
    }

    function drawBall(ctx, S, b) {
      const p = proj(S, b.x, b.y, b.z), sh = proj(S, b.x, 0, b.z);
      const r = Math.max(3.2, 0.11 * p.k);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, r * 1.1, r * 0.4, 0, 0, TAU); ctx.fill();
      // motion trail
      if (S.trail.length > 1) {
        ctx.strokeStyle = 'rgba(230,250,120,0.35)'; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
        ctx.beginPath(); S.trail.forEach((t, i) => { const q = proj(S, t.x, t.y, t.z); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke();
      }
      ctx.fillStyle = '#d8f05a'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath(); ctx.arc(p.x - r * 0.9, p.y, r * 0.8, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x + r * 0.9, p.y, r * 0.8, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
    }
    function drawBricks(ctx, S, z, fall) {
      const p = proj(S, 0.32, 0, z), k = p.k;
      const bw = 0.24 * k, bh = 0.075 * k;
      for (let i = 0; i < 3; i++) {
        let x = p.x - bw / 2, y = p.y - bh * (i + 1), rot = 0;
        if (fall) { const t = Math.min(1, fall.t * 2.5); x += (i - 1) * t * bw * 1.4; y += t * bh * i * 0.9 - Math.sin(t * Math.PI) * bh * 3 * (i + 1) * 0.4; rot = (i - 1) * t * 0.8; }
        ctx.save(); ctx.translate(x + bw / 2, y + bh / 2); ctx.rotate(rot);
        ctx.fillStyle = i % 2 ? '#a8432a' : '#b5543a'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
        ctx.strokeStyle = 'rgba(60,20,10,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      }
    }

    MG.register(def);
  }
