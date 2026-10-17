
  /* =================================================================== KITE */
  // Sankranti terrace kite fight. Rotate the patang (◀ ▶), PULL to make it dart where its nose
  // points; let go and it drifts with the wind. Cross a rival's manja to start a *pech*: keep your
  // tension in the green (pull / release in pulses). Over-pull and your manja snaps. "Bo kaata!"
  {
    const KITE_SKINS = [
      { a: '#f2c230', b: '#d8402a', pat: 'half', line: '#ff3f7a' },     // the player's: yellow/red
      { a: '#2f9e5b', b: '#f4efe2', pat: 'chand', line: '#f4efe2' },
      { a: '#7a3db8', b: '#f2c230', pat: 'band', line: '#e9e17a' },
      { a: '#1f6fc4', b: '#f4efe2', pat: 'eye', line: '#bfe6ff' },
      { a: '#ef7d1a', b: '#1a1214', pat: 'half', line: '#ffd2a6' },
      { a: '#e8487c', b: '#2f9e5b', pat: 'band', line: '#b8f0c2' },
      { a: '#1a1214', b: '#f2c230', pat: 'chand', line: '#ffe9a8' },
    ];
    const SWEET0 = 0.62, SWEET1 = 0.86;

    function drawKite(ctx, x, y, s, ang, skin, o) {
      o = o || {};
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + Math.PI / 2);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      const t = -s * 1.05, r = s * 0.86, b = s * 0.92, l = -s * 0.86;
      // body
      ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(r, 0); ctx.lineTo(0, b); ctx.lineTo(l, 0); ctx.closePath();
      ctx.fillStyle = skin.a; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = skin.b;
      if (skin.pat === 'half') ctx.fillRect(0, t, r, b - t);
      else if (skin.pat === 'band') ctx.fillRect(l, -s * 0.18, r - l, s * 0.36);
      else if (skin.pat === 'chand') { ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.34, 0, TAU); ctx.fill(); ctx.fillStyle = skin.a; ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.18, s * 0.28, 0, TAU); ctx.fill(); }
      else if (skin.pat === 'eye') { ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.42, 0); ctx.lineTo(0, s * 0.46); ctx.lineTo(-s * 0.42, 0); ctx.closePath(); ctx.fill(); }
      // paper sheen
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(l, t, -l, b - t);
      ctx.restore();
      ctx.lineWidth = Math.max(1, s * 0.07); ctx.strokeStyle = 'rgba(26,18,20,0.75)';
      ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(r, 0); ctx.lineTo(0, b); ctx.lineTo(l, 0); ctx.closePath(); ctx.stroke();
      // spars: the straight spine and the bowed kamaan
      ctx.strokeStyle = 'rgba(70,45,25,0.85)'; ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(0, b); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(l, 0); ctx.quadraticCurveTo(0, -s * 0.62, r, 0); ctx.stroke();
      // the little tail (puchhi)
      ctx.fillStyle = skin.b === '#f4efe2' ? skin.a : skin.b;
      ctx.beginPath(); ctx.moveTo(0, b - s * 0.08); ctx.lineTo(s * 0.3, b + s * 0.32); ctx.lineTo(-s * 0.3, b + s * 0.32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(26,18,20,0.6)'; ctx.lineWidth = Math.max(0.8, s * 0.04); ctx.stroke();
      if (o.glow) { ctx.globalAlpha = o.glow; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.moveTo(0, t); ctx.lineTo(r, 0); ctx.lineTo(0, b); ctx.lineTo(l, 0); ctx.closePath(); ctx.stroke(); }
      ctx.restore();
    }

    function segX(ax, ay, bx, by, cx, cy, dx, dy) {
      const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
      const den = rX * sY - rY * sX;
      if (Math.abs(den) < 1e-6) return null;
      const t = ((cx - ax) * sY - (cy - ay) * sX) / den, u = ((cx - ax) * rY - (cy - ay) * rX) / den;
      if (t < 0.18 || t > 0.97 || u < 0.18 || u > 0.97) return null;
      return { x: ax + rX * t, y: ay + rY * t, t, u };
    }

    function newKite(S, anchor, skin, isMe) {
      return { ax: anchor.x, ay: anchor.y, x: anchor.x, y: anchor.y - 4, vx: 0, vy: -26, a: -Math.PI / 2, spin: 0, T: 0.3, skin, me: !!isMe,
        state: 'launch', st: 0, wob: Math.random() * TAU, fall: null, pull: false, steer: 0, aiT: 0, tx: anchor.x, ty: anchor.y - 30, shake: 0 };
    }

    function kiteStep(S, k, dt) {
      const pull = k.pull, steer = k.steer;
      // nose
      if (steer) k.spin = H.approach(k.spin, steer * 2.9, 14 * dt);
      else {
        k.spin = H.approach(k.spin, 0, 8 * dt);
        if (!pull) k.a += U.angleDiff(k.a, -Math.PI / 2 + Math.sin(S.time * 1.7 + k.wob) * 0.35) * 0.9 * dt; // settle nose-up, a lazy wobble
      }
      k.a = U.wrapAngle(k.a + k.spin * dt);
      // forces
      const nx = Math.cos(k.a), ny = Math.sin(k.a);
      if (pull) { k.vx += nx * 62 * dt; k.vy += ny * 62 * dt; }
      else k.vy += 7 * dt; // sink when slack
      k.vx += (S.wind - k.vx) * (pull ? 0.25 : 0.7) * dt;
      const drag = Math.exp(-1.45 * dt);
      k.vx *= drag; k.vy *= drag;
      k.x += k.vx * dt; k.y += k.vy * dt;
      // sky bounds (soft)
      const m = 4;
      if (k.x < m) { k.x = m; k.vx = Math.abs(k.vx) * 0.4; }
      if (k.x > S.Wu - m) { k.x = S.Wu - m; k.vx = -Math.abs(k.vx) * 0.4; }
      if (k.y < m + 1) { k.y = m + 1; k.vy = Math.abs(k.vy) * 0.4; }
      const floor = S.roofY - 5;
      if (k.y > floor) { k.y = floor; k.vy = -Math.abs(k.vy) * 0.5 - 6; if (k.me && !S.over) S.lowWarnT = 1.2; }
      // manja length (charkhi limit)
      const dx = k.x - k.ax, dy = k.y - k.ay, d = Math.hypot(dx, dy);
      if (d > S.Lmax) { k.x = k.ax + (dx / d) * S.Lmax; k.y = k.ay + (dy / d) * S.Lmax; const vr = (k.vx * dx + k.vy * dy) / d; if (vr > 0) { k.vx -= (vr * dx) / d; k.vy -= (vr * dy) / d; } }
    }

    function tensionStep(S, k, dt, inPech) {
      if (k.pull) {
        k.T += (inPech ? 0.46 : 0.95) * dt;
        if (!inPech && k.T > 0.9) k.T = Math.max(0.9, k.T - 1.2 * dt);
        if (S.gust > 0) k.T += 0.55 * dt; // a gust yanks a taut line
      } else k.T -= (inPech ? 0.55 : 0.85) * dt;
      if (k.T < 0.08) k.T = 0.08;
    }
    function quality(T) {
      if (T < SWEET0) return 0.12 + 0.88 * Math.pow(U.smooth(T / SWEET0), 1.4);
      if (T <= SWEET1) return 1;
      return Math.max(0.3, 1 - ((T - SWEET1) / (1 - SWEET1)) * 0.5);
    }

    function cutKite(g, S, k, how) {
      k.state = 'fall'; k.st = 0; k.pull = false; k.steer = 0;
      k.fall = { vr: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3), how };
      k.vy = -4; k.vx = S.wind * 0.6;
      const p = toPx(S, k.x, k.y);
      g.burst(p.x, p.y, 16, { colors: [k.skin.a, k.skin.b, '#fff6c8'], kind: 'paper', speed: 120, grav: 120, life: 1.3, size: 3.5 });
    }

    function toPx(S, x, y) { return { x: S.ox + x * S.U, y: S.oy + y * S.U }; }

    function pickAnchor(g, S, side) {
      const list = S.anchors.filter((a) => (side ? a.side === side : true) && !S.rivals.some((r) => r.anchor === a && r.state !== 'gone'));
      return list.length ? list[(g.rng.next() * list.length) | 0] : S.anchors[(g.rng.next() * S.anchors.length) | 0];
    }
    function spawnRival(g, S) {
      const side = S.rivals.filter((r) => r.state !== 'gone' && r.anchor.side === 'L').length > S.rivals.filter((r) => r.state !== 'gone' && r.anchor.side === 'R').length ? 'R' : 'L';
      const anchor = pickAnchor(g, S, side);
      S.skinI = (S.skinI % (KITE_SKINS.length - 1)) + 1;
      const k = newKite(S, anchor, KITE_SKINS[S.skinI], false);
      k.anchor = anchor;
      k.aggr = 0.35 + g.diff * 0.45 + g.rng.next() * 0.15;
      k.st = -g.rng.next() * 0.6;
      S.rivals.push(k);
      return k;
    }

    function rivalAI(g, S, k, dt) {
      const me = S.me;
      k.aiT -= dt;
      if (k.aiT <= 0) {
        k.aiT = 2 + g.rng.next() * 2.5;
        if (me.state === 'fly' && g.rng.next() < k.aggr) {
          // go for the player's line: aim at a point just across it
          const t = 0.45 + g.rng.next() * 0.35;
          const px = me.ax + (me.x - me.ax) * t, py = me.ay + (me.y - me.ay) * t;
          const lx = me.x - me.ax, ly = me.y - me.ay, ll = Math.hypot(lx, ly) || 1;
          let nx = -ly / ll, ny = lx / ll;
          const side = Math.sign((k.x - me.ax) * ny * -1 + (k.y - me.ay) * nx) || 1; // which side we are on
          nx *= -side * 10; ny *= -side * 10;
          k.tx = U.clamp(px + nx, 6, S.Wu - 6); k.ty = U.clamp(py + ny, 8, S.roofY - 12);
        } else {
          k.tx = 8 + g.rng.next() * (S.Wu - 16);
          k.ty = 8 + g.rng.next() * (S.roofY * 0.6);
        }
      }
      const want = Math.atan2(k.ty - k.y, k.tx - k.x), dist = Math.hypot(k.tx - k.x, k.ty - k.y);
      const diff = U.angleDiff(k.a, want);
      k.steer = Math.abs(diff) > 0.2 ? Math.sign(diff) : 0;
      k.pull = Math.abs(diff) < 0.55 && dist > 5 && g.rng.next() > 0.04;
      if (dist < 5) k.aiT = Math.min(k.aiT, 0.4);
    }

    function startPech(g, S, k, pt) {
      S.pech = { k, P: 0, t: 0, above: S.me.y < k.y - 1.5, pt, burst: 0, burstIn: 1.2 + g.rng.next() * 1.4, warn: 0, ph: g.rng.next() * TAU };
      S.me.spin = 0; k.spin = 0;
      const p = toPx(S, pt.x, pt.y);
      g.pop(S.pech.above ? 'UPAR SE PECH!' : 'PECH!', p.x, p.y - 20, { size: 30, color: S.pech.above ? '#ffd84a' : '#fff' });
      g.sfx('kite_wind', { vol: 0.9 });
      g.tone(330, 0.12, { type: 'sawtooth', vol: 0.05, f2: 520 });
      g.shake(3);
    }

    function endPech(S, k) {
      if (S.pech) { S.pech = null; }
      if (k && k.state === 'pech') k.state = 'fly';
      if (S.me.state === 'pech') S.me.state = 'fly';
    }

    const def = {
      id: 'kite',
      title: 'Patang Pech',
      sub: 'Sankranti on the terrace. The whole sky is a battlefield.',
      osd: 'SANKRANTI · TERRACE',
      place: 'home_terrace', places: ['home_terrace', 'gulzar_houz', 'playground_'],
      secs: 90,
      music: 'kites',
      goLabel: 'UDAAO!',
      keys: { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'pull', ArrowUp: 'pull', KeyW: 'pull', ShiftLeft: 'pull' },
      buttons: () => [
        { a: 'left', label: '◀', sub: 'TURN' }, { a: 'right', label: '▶', sub: 'TURN' }, { gap: true, w: 0.4 },
        { a: 'pull', label: 'KHENCH', sub: 'HOLD = PULL', cls: 'big' },
      ],
      keyHint: () => '<kbd>←</kbd><kbd>→</kbd> turn the patang &nbsp; hold <kbd>Space</kbd> pull (khench) &nbsp; let go = dheel',
      howto(g) {
        const n = targetCuts(g);
        return {
          lines: [
            '<b>Turn</b> your patang, then <b>pull</b> to make it dart where its nose points. Let go and it drifts with the hawa.',
            'Fly across a rival\'s manja to start a <b>pech</b>. Then pulse the pull: keep the tension needle in the <b>green</b>.',
            'Too much pull and your manja <b>snaps</b>. When a gust comes, give it dheel (let go). Higher kite wins more.',
          ],
          goal: 'CUT ' + n + ' KITES &middot; 3 PATANGS &middot; ' + timeLimit(g) + 's',
          keys: '<kbd>←</kbd> <kbd>→</kbd> turn &nbsp;·&nbsp; hold <kbd>Space</kbd> to pull',
          touch: 'Tap <b>◀ ▶</b> to turn &nbsp;·&nbsp; hold <b>KHENCH</b> to pull',
        };
      },
      setup(g) {
        const S = g.S;
        S.score = 0; S.cuts = 0; S.lives = 3; S.lost = 0; S.time = 0; S.left = timeLimit(g); S.target = targetCuts(g);
        S.wind = (g.rng.next() < 0.5 ? -1 : 1) * (3 + g.rng.next() * 3); S.windT = 8 + g.rng.next() * 4;
        S.gust = 0; S.gustWarn = 0; S.gustIn = 6 + g.rng.next() * 4; S.gustDir = 1;
        S.rivals = []; S.skinI = 0; S.pech = null; S.respawn = 0; S.lowWarnT = 0; S.over = false; S.banner = null;
        S.maxRivals = g.diff > 0.6 ? 3 : 2;
        S.decor = []; S.clouds = []; S.birds = [];
        for (let i = 0; i < 16; i++) S.decor.push({ x: g.rng.next(), y: g.rng.next() * 0.55, s: 0.35 + g.rng.next() * 0.5, sk: KITE_SKINS[1 + ((g.rng.next() * 6) | 0)], ph: g.rng.next() * TAU, sp: 0.004 + g.rng.next() * 0.01 });
        for (let i = 0; i < 6; i++) S.clouds.push({ x: g.rng.next(), y: 0.06 + g.rng.next() * 0.4, s: 0.6 + g.rng.next() * 0.9, sp: 0.004 + g.rng.next() * 0.006 });
        for (let i = 0; i < 3; i++) S.birds.push({ cx: 0.2 + g.rng.next() * 0.6, cy: 0.12 + g.rng.next() * 0.2, r: 0.06 + g.rng.next() * 0.06, ph: g.rng.next() * TAU, sp: 0.4 + g.rng.next() * 0.3 });
        S.cityKey = null;
        S.rasp = g.loop({ ft: 'bandpass', f: 2600, q: 1.4 });
      },
      layout(g) {
        const S = g.S, A = g.area;
        const U0 = Math.sqrt(A.w * A.h) / 100;
        S.U = U0; S.ox = A.x; S.oy = A.y; S.Wu = A.w / U0; S.Hu = A.h / U0;
        S.roofY = S.Hu * (g.portrait ? 0.8 : 0.76);
        S.ks = g.portrait ? 3.4 : 3.2; // kite half-size (u)
        S.kidS = Math.min(0.24, S.Hu * 0.0042); // u per kid-sprite unit (the kid is ~60 units tall)
        const feet = S.Hu - 1.2;
        const meAnchor = { x: S.Wu * 0.5, y: feet - 66 * S.kidS };
        S.meFeet = feet;
        // rooftops (two layers) — the near layer's roofs are where the rival kids stand
        const rng = U.rng(g.baseSeed ^ 0x51ed);
        S.roofs = [];
        const layers = [{ y: S.roofY, hmin: 3, hmax: 8, tank: 0.35, near: false }, { y: S.roofY + 4, hmin: 2, hmax: 6, tank: 0.5, near: true }];
        for (const L of layers) {
          let x = -2;
          while (x < S.Wu) {
            const w = 6 + rng.next() * 12, h = L.hmin + rng.next() * (L.hmax - L.hmin);
            S.roofs.push({ x, w, top: L.y - h, near: L.near, r1: rng.next(), r2: rng.next(), r3: rng.next(), r4: rng.next(), r5: rng.next(), seed: (rng.next() * 1e9) | 0 });
            x += w + rng.next() * 1.5;
          }
        }
        S.anchors = [];
        S.tinyS = Math.min(0.32, S.Hu * 0.0056);
        const nSide = g.portrait ? 2 : 3;
        for (const side of ['L', 'R']) {
          for (let i = 0; i < nSide; i++) {
            const f = (i + 0.5) / nSide;
            const want = side === 'L' ? S.Wu * (0.05 + f * 0.3) : S.Wu * (0.95 - f * 0.3);
            const roof = S.roofs.filter((r) => r.near && r.x + 2 < want && r.x + r.w - 2 > want)[0] || S.roofs.filter((r) => r.near).sort((a, b) => Math.abs(a.x + a.w / 2 - want) - Math.abs(b.x + b.w / 2 - want))[0];
            const x = U.clamp(want, roof.x + 1.5, roof.x + roof.w - 1.5);
            S.anchors.push({ x, y: roof.top - 21 * S.tinyS, feet: roof.top, side, look: rng.next() });
          }
        }
        S.Lmax = Math.hypot(S.Wu * 0.55, S.Hu) * 1.05;
        if (!S.me) { S.me = newKite(S, meAnchor, KITE_SKINS[0], true); S.me.state = 'launch'; }
        S.me.ax = meAnchor.x; S.me.ay = meAnchor.y;
        S.me.x = U.clamp(S.me.x, 4, S.Wu - 4); S.me.y = U.clamp(S.me.y, 5, S.roofY - 5);
        for (const r of S.rivals) { const a = r.anchor; if (!S.anchors.includes(a)) { const n = pickAnchor(g, S, a.side); r.anchor = n; r.ax = n.x; r.ay = n.y; } r.x = U.clamp(r.x, 4, S.Wu - 4); r.y = U.clamp(r.y, 5, S.roofY - 5); }
        S.cityKey = null;
        if (S.rivals.length === 0) for (let i = 0; i < S.maxRivals; i++) { const k = spawnRival(g, S); k.st = -0.4 - i * 0.9; }
      },
      update(g, dt) {
        const S = g.S, me = S.me;
        S.time += dt;
        if (!g.over) {
          S.left -= dt;
          if (S.left <= 0) { S.left = 0; S.over = true; endPech(S, S.pech && S.pech.k); g.finish(false, { cuts: S.cuts, lost: S.lost, reason: 'time', delay: 1 }); }
        }
        // wind + gusts
        S.windT -= dt;
        if (S.windT <= 0) { S.windT = 9 + g.rng.next() * 5; S.wind = (g.rng.next() < 0.5 ? -1 : 1) * (2 + g.rng.next() * 4); }
        if (S.gust > 0) S.gust -= dt;
        if (S.gustWarn > 0) {
          S.gustWarn -= dt;
          if (S.gustWarn <= 0) { S.gust = 1.7; S.windSave = S.wind; g.sfx('kite_wind', { vol: 1 }); }
        } else if (S.gust <= 0) {
          S.gustIn -= dt;
          if (S.gustIn <= 0) { S.gustIn = 7.5 + g.rng.next() * 6 - g.diff * 2; S.gustWarn = 1.1; S.gustDir = g.rng.next() < 0.5 ? -1 : 1; }
        }
        const windNow = S.wind + (S.gust > 0 ? S.gustDir * 15 * Math.sin(Math.min(1, (1.7 - S.gust) / 0.4) * Math.PI * 0.5) : 0);
        const baseWind = S.wind; S.wind = windNow;
        if (S.gust > 0 && g.rng.next() < 0.5) {
          const y = S.oy + g.rng.next() * S.roofY * S.U;
          g.fx.push({ x: S.gustDir > 0 ? -10 : g.W + 10, y, vx: S.gustDir * (500 + g.rng.next() * 300), vy: 0, t: 0, life: 1.2, size: 2, color: 'rgba(255,255,255,0.7)', grav: 0, drag: 0, kind: 'spark', rot: 0, vr: 0 });
        }

        // player control
        if (me.state === 'fly' || me.state === 'pech') {
          me.pull = !g.over && g.down('pull');
          me.steer = g.over || me.state === 'pech' ? 0 : (g.down('right') ? 1 : 0) - (g.down('left') ? 1 : 0);
        } else { me.pull = false; me.steer = 0; }

        // kites
        const all = [me].concat(S.rivals);
        for (const k of all) {
          k.st += dt;
          if (k.state === 'launch') {
            if (k.st < 0) continue;
            k.vy = Math.min(k.vy, -20); k.pull = false; k.steer = 0;
            kiteStep(S, k, dt);
            if (k.y < k.ay - 16 || k.st > 2) { k.state = 'fly'; k.st = 0; }
          } else if (k.state === 'fly') {
            if (!k.me) rivalAI(g, S, k, dt);
            kiteStep(S, k, dt);
            tensionStep(S, k, dt, false);
            if (k.me && k.T > 1) { // a gust snapped it
              S.lives--; S.lost++; cutKite(g, S, k, 'snap');
              g.pop('MANJA TOOT GAYA!', g.W / 2, S.oy + S.roofY * S.U * 0.45, { color: '#ff8a7a', size: 28 });
              g.sfx('kite_cut'); g.shake(6);
            }
          } else if (k.state === 'pech') {
            const jit = Math.sin(S.time * 31 + k.wob) * 0.12;
            k.vx *= Math.exp(-5 * dt); k.vy *= Math.exp(-5 * dt);
            k.x += k.vx * dt + jit * (k.me ? 1 : -1) * dt * 6; k.y += k.vy * dt + Math.sin(S.time * 7 + k.wob) * dt * 1.5;
            k.a += U.angleDiff(k.a, Math.atan2(k.y - k.ay, k.x - k.ax)) * 1.5 * dt;
            if (!k.me) tensionStep(S, k, dt, true);
          } else if (k.state === 'fall') {
            k.vy = Math.min(k.vy + 9 * dt, 16); k.vx += (S.wind * 0.8 - k.vx) * 0.6 * dt;
            k.x += k.vx * dt + Math.sin(k.st * 3) * 4 * dt; k.y += k.vy * dt; k.a += k.fall.vr * dt;
            if (k.y > S.Hu + 10 || k.st > 7) { k.state = 'gone'; k.st = 0; }
          }
        }
        S.wind = baseWind;
        // kites don't overlap
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          if ((a.state !== 'fly' && a.state !== 'launch') || (b.state !== 'fly' && b.state !== 'launch')) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = S.ks * 2.2;
          if (d < m && d > 0.01) { const p = ((m - d) / d) * 0.5; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
        }

        // pech detection
        if (!S.pech && me.state === 'fly' && !g.over) {
          for (const k of S.rivals) {
            if (k.state !== 'fly') continue;
            const pt = segX(me.ax, me.ay, me.x, me.y, k.ax, k.ay, k.x, k.y);
            if (pt) { me.state = 'pech'; k.state = 'pech'; startPech(g, S, k, pt); break; }
          }
        }
        // the duel
        const P = S.pech;
        if (P) {
          const k = P.k;
          P.t += dt;
          tensionStep(S, me, dt, true);
          const live = segX(me.ax, me.ay, me.x, me.y, k.ax, k.ay, k.x, k.y);
          if (live) P.pt = live;
          // rival effort: a wavering pull plus telegraphed "khench" bursts
          P.burstIn -= dt;
          if (P.burstIn <= 0 && P.burst <= 0 && P.warn <= 0) { P.warn = 0.55; }
          if (P.warn > 0) { P.warn -= dt; k.shake = 1; if (P.warn <= 0) { P.burst = 0.75; P.burstIn = 1.6 + g.rng.next() * 1.8 - g.diff * 0.6; } }
          if (P.burst > 0) P.burst -= dt;
          const base = 0.36 + g.diff * 0.36;
          const rival = base * (0.85 + 0.25 * Math.sin(P.t * 2.3 + P.ph)) + (P.burst > 0 ? 0.42 + g.diff * 0.2 : 0);
          const you = quality(me.T) * (P.above ? 1.22 : 1);
          P.you = you; P.rival = rival;
          P.P += (you - rival) * 0.95 * dt;
          if (S.rasp) S.rasp.set(0.02 + 0.05 * Math.min(1, you + rival) * (me.pull ? 1 : 0.5), 1800 + me.T * 2000);
          // the manja creaks when it is about to snap
          S.creakT = (S.creakT || 0) - dt;
          if (me.T > 0.92 && S.creakT <= 0) { S.creakT = 0.16; g.tone(1400 + me.T * 900, 0.05, { type: 'sawtooth', vol: 0.035 }); }
          const pp = toPx(S, P.pt.x, P.pt.y);
          if (g.rng.next() < 0.6) g.burst(pp.x, pp.y, 1, { colors: ['#fff6c8', '#ffd84a', '#ff9a4a'], kind: 'spark', speed: 140, grav: 200, life: 0.35, size: 2.2 });
          if (me.T > 1) {
            S.lives--; S.lost++; cutKite(g, S, me, 'snap'); endPech(S, k);
            g.pop('MANJA TOOT GAYA!', pp.x, pp.y - 24, { color: '#ff8a7a', size: 28 });
            g.sfx('kite_cut'); g.shake(7); g.flash('#ff5a3a', 0.25);
          } else if (P.P >= 1) {
            S.cuts++;
            const quick = Math.max(0, Math.round(60 - P.t * 12));
            S.score += 100 + (P.above ? 50 : 0) + quick;
            cutKite(g, S, k, 'cut'); endPech(S, null); me.state = 'fly';
            g.pop('BO KAATA!', pp.x, pp.y - 24, { size: 40, color: '#ffd84a', life: 1.5 });
            g.burst(pp.x, pp.y, 26, { colors: ['#ffd84a', '#fff6c8', '#ff7a4a', k.skin.a], kind: 'paper', speed: 200, grav: 160, life: 1.4, size: 3 });
            g.sfx('kite_cut'); g.sfx('bo_kaata', { delay: 0.2 });
            g.shake(5); g.flash('#fff6c8', 0.3);
            N.emit('minigame:event', { id: 'kite', type: 'cut', cuts: S.cuts });
            if (S.cuts >= S.target && !g.over) {
              S.score += Math.round(S.left) * 5 + S.lives * 100;
              g.finish(true, { cuts: S.cuts, lost: S.lost, livesLeft: S.lives, delay: 1.8 });
            }
          } else if (P.P <= -1) {
            S.lives--; S.lost++; cutKite(g, S, me, 'cut'); endPech(S, k);
            g.pop('KAT GAYI!', pp.x, pp.y - 24, { color: '#ff8a7a', size: 32 });
            g.sfx('kite_cut'); g.shake(6);
          } else if (!live && P.t > 0.6) {
            endPech(S, k); g.pop('chhoot gaya', pp.x, pp.y - 16, { size: 20, color: '#eaf2ff', font: 'body' });
          } else if (P.t > 9) {
            endPech(S, k); me.vy = 10; k.vy = 10;
            g.pop('BARABAR!', pp.x, pp.y - 16, { size: 24, color: '#eaf2ff' });
          }
        } else if (S.rasp) S.rasp.set(0);
        if (!P) { for (const k of S.rivals) k.shake = 0; }

        // lives / respawns
        if (me.state === 'gone' || (me.state === 'fall' && me.st > 1.4)) {
          if (S.lives <= 0) { if (!g.over) g.finish(false, { cuts: S.cuts, lost: S.lost, reason: 'kites', delay: 0.8 }); }
          else if (me.state !== 'launch') { const nk = newKite(S, { x: me.ax, y: me.ay }, KITE_SKINS[0], true); S.me = nk; g.pop('nayi patang!', toPx(S, nk.ax, nk.ay).x, toPx(S, nk.ax, nk.ay).y - 30, { size: 20, color: '#fff', font: 'body' }); }
        }
        for (let i = S.rivals.length - 1; i >= 0; i--) if (S.rivals[i].state === 'gone') S.rivals.splice(i, 1);
        const flying = S.rivals.filter((r) => r.state !== 'fall').length;
        if (flying < S.maxRivals && !g.over) { S.respawn -= dt; if (S.respawn <= 0) { const k = spawnRival(g, S); k.st = -0.2; S.respawn = 2.5 + g.rng.next() * 2; } }
        if (S.lowWarnT > 0) S.lowWarnT -= dt;
      },
      idle(g, dt) { const S = g.S; if (S) S.time = (S.time || 0) + dt; },
      bot(g, dt, want) {
        const S = g.S, me = S.me;
        if (me.state !== 'fly' && me.state !== 'pech') { g.botHold('pull', false); g.botHold('left', false); g.botHold('right', false); return; }
        if (S.pech) {
          g.botHold('left', false); g.botHold('right', false);
          if (want === 'lose') { g.botHold('pull', true); return; }
          if (me.T < 0.68) g.botHold('pull', true); else if (me.T > 0.8) g.botHold('pull', false);
          return;
        }
        let best = null, bd = 1e9;
        for (const k of S.rivals) { if (k.state !== 'fly') continue; const d = Math.hypot(k.x - me.x, k.y - me.y); if (d < bd) { bd = d; best = k; } }
        let tx = S.Wu / 2, ty = S.roofY * 0.4;
        if (best) {
          const t = 0.6, px = best.ax + (best.x - best.ax) * t, py = best.ay + (best.y - best.ay) * t;
          const lx = best.x - best.ax, ly = best.y - best.ay, ll = Math.hypot(lx, ly) || 1;
          const nx = -ly / ll, ny = lx / ll;
          const side = Math.sign((me.x - px) * nx + (me.y - py) * ny) || 1;
          tx = px - nx * side * 9; ty = Math.min(S.roofY - 10, py - ny * side * 9 - 3);
        }
        const want_ = Math.atan2(ty - me.y, tx - me.x), diff = U.angleDiff(me.a, want_);
        g.botHold('left', diff < -0.18); g.botHold('right', diff > 0.18);
        const gusty = S.gust > 0 || S.gustWarn > 0;
        g.botHold('pull', want === 'lose' ? true : !gusty && Math.abs(diff) < 0.7 && me.T < 0.88);
      },
      hud(g) {
        const S = g.S;
        return [
          { k: 'CUT', v: S.cuts + '/' + S.target, good: S.cuts > 0 },
          { k: 'PATANG', v: String(S.lives), warn: S.lives === 1 },
          { k: '', v: fmtT(S.left), warn: S.left < 15 },
        ];
      },
      draw(g, ctx) {
        const S = g.S, W = g.W, Hh = g.H;
        if (S.cityKey !== W + 'x' + Hh + ':' + g.dpr) paintCity(g, S);
        const u = S.U;
        // sky
        ctx.drawImage(S.skyC, 0, 0, W, Hh);
        // clouds
        for (const c of S.clouds) {
          const cx = (((c.x + S.time * c.sp) % 1.3) - 0.15) * W, cy = S.oy + c.y * S.roofY * u;
          cloud(ctx, cx, cy, c.s * u * 9);
        }
        // the sky full of kites (far)
        for (const d of S.decor) {
          const x = (((d.x + S.time * d.sp) % 1.2) - 0.1) * W, y = S.oy + d.y * S.roofY * u + Math.sin(S.time * 0.9 + d.ph) * u;
          drawKite(ctx, x, y, d.s * u * 1.9, -Math.PI / 2 + Math.sin(S.time * 1.3 + d.ph) * 0.35, d.sk, { alpha: 0.55 });
        }
        // cheel birds circling
        ctx.strokeStyle = 'rgba(40,30,40,0.7)'; ctx.lineWidth = Math.max(1.2, u * 0.25);
        for (const b of S.birds) {
          const a = S.time * b.sp + b.ph, x = (b.cx + Math.cos(a) * b.r) * W, y = S.oy + (b.cy + Math.sin(a) * b.r * 0.4) * S.roofY * u;
          const f = Math.sin(S.time * 6 + b.ph) * u * 0.6;
          ctx.beginPath(); ctx.moveTo(x - u * 1.6, y - f); ctx.quadraticCurveTo(x - u * 0.6, y - u * 0.8, x, y); ctx.quadraticCurveTo(x + u * 0.6, y - u * 0.8, x + u * 1.6, y - f); ctx.stroke();
        }
        // city
        ctx.drawImage(S.cityC, 0, 0, W, Hh);
        // wind flag on the player's terrace
        drawFlag(ctx, S, g);
        // rival kids on their roofs
        for (const a of S.anchors) {
          const owner = S.rivals.find((r) => r.anchor === a && r.state !== 'gone');
          const p = toPx(S, a.x, a.feet);
          tinyKid(ctx, p.x, p.y, u * S.tinyS, a.look, owner && (owner.pull || owner.state === 'pech') ? 1 : 0, S.time);
        }
        // lines then kites
        const all = S.rivals.concat([S.me]);
        for (const k of all) drawLine(ctx, S, k);
        for (const k of all) {
          if (k.state === 'gone' || (k.state === 'launch' && k.st < 0)) continue;
          const p = toPx(S, k.x, k.y);
          const sh = k.shake ? Math.sin(S.time * 60) * u * 0.25 : 0;
          drawKite(ctx, p.x + sh, p.y, S.ks * u, k.a, k.skin, { glow: k.me && k.state !== 'fall' ? 0.25 + 0.15 * Math.sin(S.time * 5) : 0 });
        }
        // the crossing point
        if (S.pech) {
          const pp = toPx(S, S.pech.pt.x, S.pech.pt.y);
          const gr = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, u * 3.2);
          gr.addColorStop(0, 'rgba(255,246,200,0.95)'); gr.addColorStop(0.35, 'rgba(255,190,80,0.45)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(pp.x, pp.y, u * 3.2, 0, TAU); ctx.fill();
          if (S.pech.warn > 0 || S.pech.burst > 0) {
            const kp = toPx(S, S.pech.k.x, S.pech.k.y);
            H.text(ctx, S.pech.burst > 0 ? 'KHENCH!' : '!', kp.x, kp.y - S.ks * u * 1.9, { font: 'display', size: Math.max(18, u * 3), color: '#ff6a4a', outline: 4 });
          }
        }
        // the player's terrace: kid + friend with the charkhi
        drawMe(ctx, S, g);
        // gauges
        drawGauges(ctx, S, g);
        // messages
        if (S.gustWarn > 0 || S.gust > 0) {
          const a = S.gustWarn > 0 ? 0.6 + 0.4 * Math.sin(g.rt * 18) : 1;
          H.text(ctx, S.gustDir > 0 ? 'HAWA ⟶' : '⟵ HAWA', W / 2, S.oy + u * 7, { font: 'display', size: Math.max(20, u * 3.6), color: '#eaf2ff', outline: 5, stroke: '#1b2a78', alpha: a });
          if (S.me.T > 0.75 && S.me.pull) H.text(ctx, 'dheel do! (let go)', W / 2, S.oy + u * 7 + Math.max(22, u * 3.6), { font: 'body', size: Math.max(14, u * 2), weight: 700, color: '#ffd2c8', outline: 4, alpha: a });
        }
        if (S.lowWarnT > 0) H.text(ctx, 'Arre! antenna se bachao!', W / 2, S.oy + S.roofY * u - u * 9, { font: 'body', weight: 700, size: Math.max(14, u * 2.2), color: '#fff', outline: 4, alpha: Math.min(1, S.lowWarnT) });
      },
      result(g, r) {
        const S = g.S;
        return {
          title: r.win ? 'Bo kaata!' : r.reason === 'time' ? 'Andhera ho gaya!' : 'Saari patang kat gayi!',
          line: r.win ? 'The whole colony heard you. Somebody is going to lootna those kites.' : r.reason === 'time' ? 'Amma is calling everyone down from the terrace.' : 'Ammamma says: pull too hard and it snaps. Let it go a little.',
          rows: [['Kites cut', S.cuts + ' / ' + S.target], ['Patangs lost', S.lost], ['Score', r.score]],
        };
      },
      stars(g, r) { return r.win ? 1 + (g.S.lost === 0 ? 1 : 0) + (g.S.left > timeLimit(g) * 0.35 ? 1 : 0) : 0; },
      cleanup(g) { if (g.S && g.S.rasp) g.S.rasp.stop(); },
    };
    function targetCuts(g) { return g.params.target || Math.round(2 + g.diff * 3); }
    function timeLimit(g) { return g.params.time || Math.round(95 - g.diff * 15); }
    function fmtT(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

    function cloud(ctx, x, y, s) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.32, 0, 0, TAU);
      ctx.ellipse(x - s * 0.45, y + s * 0.05, s * 0.5, s * 0.26, 0, 0, TAU);
      ctx.ellipse(x + s * 0.2, y - s * 0.16, s * 0.5, s * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,215,235,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.14, s * 0.9, s * 0.13, 0, 0, TAU); ctx.fill();
    }

    function drawLine(ctx, S, k) {
      if (k.state === 'gone' || (k.state === 'launch' && k.st < 0)) return;
      const u = S.U;
      const a = toPx(S, k.ax, k.ay);
      let kx, ky;
      if (k.state === 'fall') {
        // cut: the loose manja droops from the hand
        const t = Math.min(1, k.st / 1.2);
        kx = a.x + (toPx(S, k.x, k.y).x - a.x) * (1 - t * 0.7); ky = a.y + u * 4 + t * u * 6;
        ctx.strokeStyle = k.skin.line; ctx.globalAlpha = 0.6 * (1 - t); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + kx) / 2, ky + u * 8, kx, ky); ctx.stroke(); ctx.globalAlpha = 1;
        return;
      }
      const p = toPx(S, k.x, k.y);
      kx = p.x + Math.cos(k.a + Math.PI) * 0; ky = p.y + S.ks * u * 0.15;
      const sag = (1 - Math.min(1, k.T)) * Math.hypot(kx - a.x, ky - a.y) * 0.16;
      const mx = (a.x + kx) / 2 + S.wind * u * 0.6, my = (a.y + ky) / 2 + sag;
      const taut = Math.min(1, k.T);
      ctx.lineWidth = k.me ? 1.6 + taut * 1.2 : 1.3;
      ctx.strokeStyle = k.me && k.T > SWEET1 ? H.mix(k.skin.line, '#ffffff', (k.T - SWEET1) * 4) : k.skin.line;
      ctx.globalAlpha = k.me ? 0.95 : 0.75;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, kx, ky); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function tinyKid(ctx, x, y, s, look, pulling, t) {
      const shirts = ['#2a8c82', '#d8402a', '#3b6fc4', '#7a3db8', '#e8d9b5', '#ef7d1a'];
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = '#2b2430';
      ctx.fillRect(-2.2, -6, 1.8, 6); ctx.fillRect(0.4, -6, 1.8, 6);
      ctx.fillStyle = shirts[(look * shirts.length) | 0];
      H.rr(ctx, -3, -12, 6, 7, 1.5); ctx.fill();
      ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(0, -14.5, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1412'; ctx.beginPath(); ctx.arc(0, -15.2, 2.5, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      const yk = pulling ? Math.sin(t * 14) * 1.1 : 0;
      ctx.beginPath(); ctx.moveTo(-2.6, -11); ctx.lineTo(-1.4, -20 + yk); ctx.moveTo(2.6, -11); ctx.lineTo(1.6, -19 + yk * 0.6); ctx.stroke();
      ctx.restore();
    }

    function drawMe(ctx, S, g) {
      const u = S.U, me = S.me;
      const a = toPx(S, me.ax, me.ay);
      const s = u * S.kidS, feetY = S.oy + S.meFeet * u;
      // friend with the charkhi (spool), to the left
      const fx = a.x - s * 34, fy = feetY + s * 2;
      H.kidBack(ctx, fx, fy, s * 0.9, { shirt: '#2a8c82', pants: '#4a3f35', skin: '#8a5a35' });
      const cx = fx + s * 13, cy = fy - s * 34;
      ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = Math.max(2, s * 4); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx + s * 7, fy - s * 38); ctx.lineTo(cx - s * 2, cy + s * 2); ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.time * (me.pull ? -9 : 2.5));
      const R = s * 7;
      ctx.fillStyle = '#b5844a'; ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = Math.max(1, s * 1.2);
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff3f7a'; ctx.beginPath(); ctx.arc(0, 0, R * 0.68, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-R * 0.2, -R * 0.2, R * 0.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5a3a1a'; ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
      ctx.restore();
      // manja from the charkhi to the player's hands
      ctx.strokeStyle = 'rgba(255,63,122,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo((cx + a.x) / 2, (cy + a.y) / 2 + s * 10, a.x, a.y); ctx.stroke();
      // the player (from behind), arms up holding the manja
      const px = a.x + s * 2, py = feetY;
      const pull = me.pull && (me.state === 'fly' || me.state === 'pech');
      const yank = pull ? Math.sin(S.time * 18) * s * 1.2 : 0;
      ctx.strokeStyle = '#a8703f'; ctx.lineWidth = Math.max(2, s * 4.4); ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px - s * 8, py - s * 42); ctx.lineTo(a.x - s * 3, a.y + s * 3 + yank);
      ctx.moveTo(px + s * 8, py - s * 42); ctx.lineTo(a.x + s * (pull ? 7 : 3), a.y + s * (pull ? 10 : 5) + yank);
      ctx.stroke();
      H.kidBack(ctx, px, py, s, { shirt: '#d8402a', stripes: '#f2c230', pants: '#3b4a6b' });
    }

    function drawFlag(ctx, S, g) {
      const u = S.U;
      const base = toPx(S, S.me.ax + (g.portrait ? 12 : 18), S.me.ay + 6);
      const top = base.y - u * 13;
      ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = Math.max(1.5, u * 0.35);
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(base.x, top); ctx.stroke();
      const w = S.wind + (S.gust > 0 ? S.gustDir * 12 : 0);
      const len = u * (2.5 + Math.min(6, Math.abs(w) * 0.45)), dir = w >= 0 ? 1 : -1;
      const flap = Math.sin(g.rt * (6 + Math.abs(w))) * u * 0.6;
      ctx.fillStyle = '#f2c230';
      ctx.beginPath(); ctx.moveTo(base.x, top); ctx.quadraticCurveTo(base.x + dir * len * 0.5, top - flap, base.x + dir * len, top + u * 0.6 + flap * 0.5);
      ctx.lineTo(base.x + dir * len * 0.9, top + u * 2.4 + flap * 0.3); ctx.quadraticCurveTo(base.x + dir * len * 0.4, top + u * 2.2 + flap, base.x, top + u * 2.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(26,18,20,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }

    function drawGauges(ctx, S, g) {
      const u = S.U, me = S.me;
      // tension gauge: right edge, above the roofs
      const gh = Math.min(g.area.h * 0.42, 220), gw = Math.max(16, Math.min(22, u * 2.4));
      const gx = g.W - gw - 24, gy = S.oy + Math.max(12, (S.roofY * u - gh) * 0.5);
      ctx.fillStyle = 'rgba(18,13,22,0.75)'; H.rr(ctx, gx - 4, gy - 4, gw + 8, gh + 8, 6); ctx.fill();
      ctx.fillStyle = '#2a2234'; ctx.fillRect(gx, gy, gw, gh);
      const yOf = (t) => gy + gh - (t / 1.1) * gh;
      ctx.fillStyle = 'rgba(111,191,90,0.85)'; ctx.fillRect(gx, yOf(SWEET1), gw, yOf(SWEET0) - yOf(SWEET1));
      ctx.fillStyle = me.T > 0.92 && Math.floor(g.rt * 10) % 2 ? 'rgba(255,120,100,1)' : 'rgba(226,72,58,0.85)'; ctx.fillRect(gx, gy, gw, yOf(1) - gy);
      const T = Math.min(1.1, me.T);
      ctx.fillStyle = me.T > 1 ? '#ff4a3a' : me.T > SWEET1 ? '#ffb04a' : me.T >= SWEET0 ? '#d8ffd0' : '#eaf2ff';
      ctx.fillRect(gx + gw * 0.3, yOf(T), gw * 0.4, gy + gh - yOf(T));
      ctx.fillStyle = '#fff'; ctx.fillRect(gx - 3, yOf(T) - 1.5, gw + 6, 3);
      H.text(ctx, 'MANJA', gx + gw / 2, gy + gh + 14, { font: 'osd', size: 16, color: '#eaf2ff', outline: 3, stroke: '#1b2a78' });
      // the pech tug bar
      const P = S.pech;
      if (P) {
        const bw = Math.min(g.W * 0.7, 360), bh = 16, bx = (g.W - bw) / 2, by = S.oy + 10;
        ctx.fillStyle = 'rgba(18,13,22,0.8)'; H.rr(ctx, bx - 30, by - 8, bw + 60, bh + 16, 8); ctx.fill();
        ctx.fillStyle = '#3a2f44'; ctx.fillRect(bx, by, bw, bh);
        const mid = bx + bw / 2, pos = mid + (P.P * bw) / 2;
        ctx.fillStyle = P.P >= 0 ? '#6fbf5a' : '#e2483a';
        ctx.fillRect(Math.min(mid, pos), by, Math.abs(pos - mid), bh);
        ctx.fillStyle = '#fff'; ctx.fillRect(mid - 1, by - 3, 2, bh + 6);
        drawKite(ctx, bx - 15, by + bh / 2, 8, -Math.PI / 2, P.k.skin);
        drawKite(ctx, bx + bw + 15, by + bh / 2, 8, -Math.PI / 2, S.me.skin);
        H.text(ctx, P.you > P.rival ? 'KAT RAHI HAI...' : 'ZOR LAGAO!', mid, by + bh + 16, { font: 'osd', size: 18, color: P.you > P.rival ? '#b9ffb0' : '#ffb4a6', outline: 3, stroke: '#120d16' });
      }
    }

    function paintCity(g, S) {
      const W = g.W, Hh = g.H, d = g.dpr, u = S.U;
      S.cityKey = W + 'x' + Hh + ':' + d;
      // sky
      const sky = (S.skyC = S.skyC || H.canvas(1, 1)); sky.width = Math.round(W * d); sky.height = Math.round(Hh * d);
      let c = sky.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const roofPx = S.oy + S.roofY * u;
      let gr = c.createLinearGradient(0, 0, 0, roofPx);
      gr.addColorStop(0, '#4f9fd6'); gr.addColorStop(0.55, '#9fd0ea'); gr.addColorStop(0.85, '#f3dcae'); gr.addColorStop(1, '#f7c98c');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      const sx = W * 0.82, sy = S.oy + roofPx * 0.18;
      gr = c.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, Hh) * 0.35);
      gr.addColorStop(0, 'rgba(255,250,220,0.95)'); gr.addColorStop(0.08, 'rgba(255,240,190,0.75)'); gr.addColorStop(0.3, 'rgba(255,230,170,0.15)'); gr.addColorStop(1, 'rgba(255,230,170,0)');
      c.fillStyle = gr; c.fillRect(0, 0, W, Hh);
      // city
      const city = (S.cityC = S.cityC || H.canvas(1, 1)); city.width = Math.round(W * d); city.height = Math.round(Hh * d);
      c = city.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, Hh);
      const rng = U.rng(g.baseSeed ^ 0xc17e);
      // far skyline (hazy): domes, minarets, water tanks
      const far = roofPx - u * 5;
      c.fillStyle = '#b9a9c9';
      c.beginPath(); c.moveTo(0, Hh);
      let x = 0;
      while (x < W) {
        const w = u * (3 + rng.next() * 7), h = u * (2 + rng.next() * 6);
        c.lineTo(x, far - h); c.lineTo(x + w, far - h); x += w;
      }
      c.lineTo(W, Hh); c.closePath(); c.fill();
      for (let i = 0; i < 4; i++) {
        const mx = W * (0.1 + rng.next() * 0.8), mh = u * (9 + rng.next() * 7);
        c.beginPath(); c.moveTo(mx - u * 0.75, far); c.lineTo(mx - u * 0.55, far - mh); c.lineTo(mx + u * 0.55, far - mh); c.lineTo(mx + u * 0.75, far); c.fill();
        c.fillRect(mx - u * 1, far - mh * 0.62, u * 2, u * 0.45); c.fillRect(mx - u * 0.9, far - mh, u * 1.8, u * 0.4);
        c.beginPath(); c.moveTo(mx - u * 0.75, far - mh); c.quadraticCurveTo(mx - u * 0.8, far - mh - u * 1.6, mx, far - mh - u * 2.4); c.quadraticCurveTo(mx + u * 0.8, far - mh - u * 1.6, mx + u * 0.75, far - mh); c.fill();
        c.fillRect(mx - u * 0.08, far - mh - u * 3.2, u * 0.16, u * 0.9);
      }
      for (let i = 0; i < 2; i++) {
        const dx = W * (0.15 + rng.next() * 0.7), dr = u * (3 + rng.next() * 2);
        c.beginPath(); c.arc(dx, far - u * 4, dr, Math.PI, TAU); c.fill(); c.fillRect(dx - dr, far - u * 4, dr * 2, u * 4);
      }
      // rooftops: flat terraces with parapets, Sintex tanks, antennas, clotheslines
      for (const R of S.roofs) {
        const x = R.x * u, w = R.w * u, top = S.oy + R.top * u;
        const col = R.near ? (R.r1 < 0.5 ? '#e2c7a2' : '#c9a27a') : (R.r1 < 0.5 ? '#c79a7a' : '#a87a62');
        const tint = ['#e8d9b5', '#d9c3a0', '#c7b9d6', '#bcd3c4', '#e9c6b6', col][(R.r2 * 6) | 0];
        c.fillStyle = H.mix(col, tint, 0.35); c.fillRect(x, top, w, Hh - top);
        c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(x, top, w, u * 0.7);
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x + w - u * 0.6, top, u * 0.6, Hh - top);
        const wr = U.rng(R.seed);
        c.fillStyle = 'rgba(60,40,50,0.35)';
        for (let wy = top + u * 2.5; wy < Hh - u; wy += u * 4) for (let wx = x + u * 1.5; wx < x + w - u * 2; wx += u * 3.5) if (wr.next() < 0.7) c.fillRect(wx, wy, u * 1.4, u * 1.8);
        const hasKid = S.anchors.some((a) => a.feet === R.top && a.x * u > x && a.x * u < x + w);
        if (R.r3 < (R.near ? 0.5 : 0.35)) { // black Sintex tank
          let tx = x + u * 1.5 + R.r4 * (w - u * 5);
          if (hasKid) tx = x + u * 0.8;
          c.fillStyle = '#26222a'; H.rr(c, tx, top - u * 3.4, u * 3, u * 3.4, u * 0.6); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(tx + u * 0.4, top - u * 3.2, u * 0.5, u * 3);
          c.fillStyle = '#1a1214'; c.fillRect(tx + u * 0.6, top - u * 3.9, u * 1.8, u * 0.6);
        }
        if (R.r4 < 0.45 && !hasKid) { // fishbone TV antenna
          const ax = x + u + R.r5 * (w - u * 2), ah = u * (5 + R.r2 * 4);
          c.strokeStyle = '#4a4450'; c.lineWidth = Math.max(1, u * 0.2);
          c.beginPath(); c.moveTo(ax, top); c.lineTo(ax, top - ah);
          for (let k = 0; k < 5; k++) { const yy = top - ah + k * u * 0.8, ww = u * (2.2 - k * 0.25); c.moveTo(ax - ww, yy); c.lineTo(ax + ww, yy); }
          c.stroke();
        }
        if (R.r5 < 0.3) { // clothesline
          const cx0 = x + u, cx1 = x + w - u, cy = top - u * 2.2;
          c.strokeStyle = 'rgba(60,50,50,0.6)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(cx0, cy); c.quadraticCurveTo((cx0 + cx1) / 2, cy + u * 0.8, cx1, cy); c.stroke();
          const cols = ['#d8402a', '#2a8c82', '#f2c230', '#efe9dc', '#7a3db8'];
          for (let k = 0; k < 4; k++) { const t = 0.15 + k * 0.22; c.fillStyle = cols[(wr.next() * cols.length) | 0]; c.fillRect(cx0 + (cx1 - cx0) * t, cy + u * 0.45, u * 1.4, u * 2); }
        }
        // parapet lip
        c.fillStyle = 'rgba(40,25,20,0.25)'; c.fillRect(x, top + u * 0.7, w, u * 0.35);
      }
      // the player's own terrace parapet (front), whitewashed, across the bottom
      const py = S.oy + (S.meFeet - 9 * S.kidS * 4) * u;
      gr = c.createLinearGradient(0, py, 0, Hh);
      gr.addColorStop(0, '#efe9dc'); gr.addColorStop(0.2, '#ddd2bd'); gr.addColorStop(1, '#a89880');
      c.fillStyle = gr; c.fillRect(0, py, W, Hh - py);
      c.fillStyle = '#c9bca4'; c.fillRect(0, py, W, u * 0.9);
      c.fillStyle = 'rgba(80,60,40,0.18)';
      for (let i = 0; i < 40; i++) c.fillRect(rng.next() * W, py + u + rng.next() * (Hh - py), u * (0.5 + rng.next() * 2), u * 0.3);
      // a potted plant + a red-oxide water pipe on the parapet
      const pot = py;
      c.fillStyle = '#b5694a'; c.fillRect(W * 0.86, pot - u * 2.4, u * 3, u * 2.4);
      c.fillStyle = '#4f7a3a'; for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(W * 0.86 + u * 1.5 + (i - 2.5) * u * 0.5, pot - u * 3.4 - (i % 2) * u, u * 0.5, u * 1.6, (i - 2.5) * 0.3, 0, TAU); c.fill(); }
    }

    MG.register(def);
  }
