
  /* ============================================================= BRICKGAME */
  // The 90s "Brick Game 9999-in-1" handheld: grey-green LCD, black pixel bricks, piezo beeps.
  // Game A: falling blocks (clear N lines). Game B: car-dodge race (pass N cars). Buttons are on
  // the device itself (canvas hit-tested), so the same big buttons work for mouse and touch.
  {
    const COLS = 10, ROWS = 20;
    const LCD_BG = '#9fae8c', LCD_OFF = 'rgba(40,52,30,0.11)', LCD_ON = '#141a10';
    // pieces as cells in a 4x4 (I) or 3x3 box
    const PIECES = {
      I: { n: 4, c: [[0, 1], [1, 1], [2, 1], [3, 1]] },
      O: { n: 2, c: [[0, 0], [1, 0], [0, 1], [1, 1]] },
      T: { n: 3, c: [[1, 0], [0, 1], [1, 1], [2, 1]] },
      S: { n: 3, c: [[1, 0], [2, 0], [0, 1], [1, 1]] },
      Z: { n: 3, c: [[0, 0], [1, 0], [1, 1], [2, 1]] },
      J: { n: 3, c: [[0, 0], [0, 1], [1, 1], [2, 1]] },
      L: { n: 3, c: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    };
    const KINDS = Object.keys(PIECES);
    function rotCells(kind, r) {
      const P = PIECES[kind];
      let c = P.c.map((p) => p.slice());
      if (kind === 'O') return c;
      for (let i = 0; i < (r & 3); i++) c = c.map(([x, y]) => [P.n - 1 - y, x]);
      return c;
    }
    const CAR = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [0, 3], [2, 3]];
    // 5x7 letters for the mode screen
    const GLYPH = {
      A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
      B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    };
    const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };

    const def = {
      id: 'brickgame',
      title: 'Brick Game',
      sub: '9999-in-1. Two pencil batteries. Hours of joy.',
      osd: 'HANDHELD · 9999 IN 1',
      place: 'video_parlour_', places: ['video_parlour_', 'stationery_', 'home'],
      secs: 80,
      noCountdown: true,
      duck: 0.12,
      keys: {
        ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down',
        ArrowUp: 'rotate', KeyW: 'rotate', Space: 'rotate', KeyX: 'rotate', KeyK: 'rotate', Enter: 'start', NumpadEnter: 'start', KeyM: 'sound',
      },
      buttons: () => [],
      keyHint: () => '<kbd>←</kbd><kbd>→</kbd> move &nbsp; <kbd>↓</kbd> drop &nbsp; <kbd>↑</kbd>/<kbd>Space</kbd> rotate · turbo &nbsp; <kbd>M</kbd> sound',
      howto(g) {
        const m = g.params.mode;
        return {
          lines: [
            '<b>Game A — Bricks:</b> rotate and drop the falling bricks; fill a whole row to clear it. Don\'t let them reach the top.',
            '<b>Game B — Race:</b> switch lanes to dodge the oncoming cars. Hold rotate for turbo.',
            m ? 'Today: <b>Game ' + (m === 'race' ? 'B' : 'A') + '</b>.' : 'Pick <b>A</b> or <b>B</b> on the screen with ◀ ▶, then press ROTATE.',
          ],
          goal: (m !== 'race' ? 'A: CLEAR ' + targetLines(g) + ' LINES' : '') + (m ? '' : ' &middot; ') + (m !== 'blocks' ? 'B: PASS ' + targetCars(g) + ' CARS' : ''),
          keys: '<kbd>←</kbd> <kbd>→</kbd> move · <kbd>↓</kbd> drop · <kbd>↑</kbd> or <kbd>Space</kbd> rotate',
          touch: 'Press the buttons on the handheld: <b>◀ ▶ ▼</b> and the big red <b>ROTATE</b>',
        };
      },
      setup(g) {
        const S = g.S;
        S.score = 0; S.sound = true;
        S.mode = g.params.mode === 'race' ? 'race' : g.params.mode === 'blocks' ? 'blocks' : null;
        S.sel = S.mode === 'race' ? 1 : 0;
        S.stage = 'boot'; S.st = 0;
        S.board = new Uint8Array(COLS * ROWS);
        S.fade = new Float32Array(COLS * ROWS);
        S.lit = new Uint8Array(COLS * ROWS);
        S.next = new Uint8Array(16);
        S.hi = Math.max(+(MG.stats.best.brickgame || 0), 0);
        S.held = {}; S.press = {};
        S.btnDown = {};
        S.ptrs = {};
        S.lives = 3;
      },
      layout(g) { layoutDevice(g, g.S); },
      update(g, dt) { step(g, g.S, dt); },
      idle(g, dt) { const S = g.S; if (S) for (let i = 0; i < S.fade.length; i++) S.fade[i] = Math.max(0, S.fade[i] - dt * 12); },
      pointer(g, type, x, y, id) {
        const S = g.S;
        if (type === 'down') {
          const b = hitBtn(S, x, y);
          if (!b) return;
          S.ptrs[id] = b.a;
          if (b.a === 'pause') { g.togglePause(); return; }
          if (b.a === 'sound') { S.sound = !S.sound; beep(g, S, 1800, 0.05); return; }
          g.press(b.a, 'p' + id);
        } else if (type === 'up') {
          const a = S.ptrs[id];
          if (a) { g.release(a, 'p' + id); delete S.ptrs[id]; }
        }
      },
      bot(g, dt, want) { botPlay(g, g.S, dt, want); },
      hud(g) {
        const S = g.S;
        if (S.mode === 'race') return [{ k: 'CARS', v: S.cars + '/' + S.target }, { k: 'LIVES', v: String(S.lives), warn: S.lives === 1 }, { k: 'SCORE', v: String(S.score) }];
        if (S.mode === 'blocks') return [{ k: 'LINES', v: S.lines + '/' + S.target }, { k: 'SPEED', v: String(S.speed) }, { k: 'SCORE', v: String(S.score) }];
        return [{ k: 'GAME', v: S.sel ? 'B' : 'A' }, { k: 'HI', v: String(S.hi) }];
      },
      draw(g, ctx) { drawDevice(g, ctx, g.S); },
      result(g, r) {
        const S = g.S;
        const race = S.mode === 'race';
        return {
          title: r.win ? (race ? 'Finish line!' : 'Line clear!') : (race ? 'Dhadaam!' : 'Bricks to the top!'),
          line: r.win ? 'Nobody touch it, the high score is still on the screen.' : 'Batteries still good. One more game?',
          rows: race ? [['Cars passed', S.cars + ' / ' + S.target], ['Score', r.score]] : [['Lines', S.lines + ' / ' + S.target], ['Speed', S.speed], ['Score', r.score]],
        };
      },
      stars(g, r) {
        const S = g.S;
        if (!r.win) return 0;
        if (S.mode === 'race') return 1 + (S.lives >= 3 ? 1 : 0) + (S.lives >= 2 ? 1 : 0);
        return 1 + (S.score >= S.target * 180 ? 1 : 0) + (S.maxHeight <= 12 ? 1 : 0);
      },
    };
    function targetLines(g) { return g.params.mode !== 'race' && g.params.target ? g.params.target : Math.round(5 + g.diff * 7); }
    function targetCars(g) { return g.params.mode === 'race' && g.params.target ? g.params.target : Math.round(22 + g.diff * 25); }

    function beep(g, S, f, d, o) { if (S.sound) g.tone(f, d, Object.assign({ type: 'square', vol: 0.045 }, o || {})); }
    function melody(g, S, notes, gap, o) { notes.forEach((f, i) => beep(g, S, f, gap * 0.9, Object.assign({ delay: i * gap }, o || {}))); }

    /* ------------------------------------------------------------- logic */
    function startMode(g, S, mode) {
      S.mode = mode; S.stage = 'curtain'; S.st = 0; S.curtainNext = 'play';
      S.board.fill(0);
      if (mode === 'blocks') {
        S.target = targetLines(g); S.lines = 0; S.speed = 1 + Math.round(g.diff * 3); S.level = S.speed; S.maxHeight = 0;
        S.bag = []; S.nextKind = drawPiece(g, S); S.piece = null; S.drop = 0; S.flash = null;
        const garbage = g.diff >= 0.6 ? Math.round((g.diff - 0.5) * 8) : 0;
        for (let r = ROWS - garbage; r < ROWS; r++) { const hole = (g.rng.next() * COLS) | 0; for (let c = 0; c < COLS; c++) if (c !== hole && g.rng.next() < 0.8) S.board[r * COLS + c] = 1; }
      } else {
        S.target = targetCars(g); S.cars = 0; S.lane = 0; S.enemies = []; S.scroll = 0; S.rowT = 0; S.spawnIn = 2; S.crash = null; S.speed = 1 + Math.round(g.diff * 2); S.lives = 3;
      }
      melody(g, S, [1568, 1976, 2349, 3136], 0.07);
    }
    function drawPiece(g, S) {
      if (!S.bag.length) { S.bag = KINDS.slice(); for (let i = S.bag.length - 1; i > 0; i--) { const j = (g.rng.next() * (i + 1)) | 0; [S.bag[i], S.bag[j]] = [S.bag[j], S.bag[i]]; } }
      return S.bag.pop();
    }
    function fits(S, kind, r, px, py) {
      for (const [x, y] of rotCells(kind, r)) {
        const cx = px + x, cy = py + y;
        if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
        if (cy >= 0 && S.board[cy * COLS + cx]) return false;
      }
      return true;
    }
    function spawn(g, S) {
      const kind = S.nextKind; S.nextKind = drawPiece(g, S);
      const n = PIECES[kind].n;
      S.piece = { kind, r: 0, x: Math.floor((COLS - n) / 2), y: kind === 'I' ? -1 : 0 };
      S.drop = 0; S.lockT = 0;
      if (!fits(S, kind, 0, S.piece.x, S.piece.y)) gameOver(g, S);
    }
    function gravity(S) { return Math.max(0.07, 0.72 - (S.speed - 1) * 0.075); }
    function lockPiece(g, S) {
      const P = S.piece;
      for (const [x, y] of rotCells(P.kind, P.r)) { const cx = P.x + x, cy = P.y + y; if (cy >= 0) S.board[cy * COLS + cx] = 1; }
      S.piece = null;
      const full = [];
      for (let r = 0; r < ROWS; r++) { let f = true; for (let c = 0; c < COLS; c++) if (!S.board[r * COLS + c]) { f = false; break; } if (f) full.push(r); }
      let h = 0; for (let r = 0; r < ROWS; r++) { let any = false; for (let c = 0; c < COLS; c++) if (S.board[r * COLS + c]) any = true; if (any) { h = ROWS - r; break; } }
      S.maxHeight = Math.max(S.maxHeight, h);
      if (full.length) {
        S.flash = { rows: full, t: 0 };
        S.score += [0, 100, 300, 700, 1500][full.length] * (1 + (S.speed - 1) * 0.1) | 0;
        melody(g, S, full.length >= 4 ? [1568, 2093, 2637, 3136, 4186] : [1760, 2217, 2637], 0.05);
        if (full.length >= 2) g.pop(['', '', 'DOUBLE!', 'TRIPLE!', 'BRICK GAME!'][full.length], S.L.fx + S.L.fw / 2, S.L.fy + S.L.fh * 0.4, { size: 26, color: '#ffd84a' });
      } else beep(g, S, 880, 0.03);
    }
    function clearRows(g, S) {
      const rows = S.flash.rows;
      for (const r of rows) { S.board.copyWithin(COLS, 0, r * COLS); S.board.fill(0, 0, COLS); }
      S.lines += rows.length;
      S.flash = null;
      const lvl = 1 + Math.round(g.diff * 3) + Math.floor(S.lines / 4);
      if (lvl > S.speed) { S.speed = Math.min(9, lvl); melody(g, S, [2093, 2637], 0.06); }
      if (S.lines >= S.target && !g.over) { S.score += 500; win(g, S); }
    }
    function gameOver(g, S) {
      if (g.over) return;
      S.stage = 'curtain'; S.st = 0; S.curtainNext = 'over';
      melody(g, S, [1568, 1319, 1047, 784, 523], 0.11, { vol: 0.05 });
      g.finish(false, { mode: S.mode, lines: S.lines, cars: S.cars, delay: 1.8 });
    }
    function win(g, S) {
      S.stage = 'won'; S.st = 0;
      melody(g, S, [2093, 2637, 3136, 4186, 3136, 4186], 0.09);
      if (S.score > S.hi) S.hi = S.score;
      g.finish(true, { mode: S.mode, lines: S.lines, cars: S.cars, delay: 1.6 });
    }

    function repeatKey(g, S, a, dt, first, rate) {
      S.rep = S.rep || {};
      if (g.pressed(a)) { S.held[a] = 0; S.rep[a] = 0; return true; }
      if (!g.down(a)) { S.held[a] = -1; return false; }
      if (!(S.held[a] >= 0)) { S.held[a] = 0; S.rep[a] = 0; return false; }
      S.held[a] += dt;
      if (S.held[a] < first) return false;
      S.rep[a] += dt;
      if (S.rep[a] >= rate) { S.rep[a] -= rate; return true; }
      return false;
    }

    function step(g, S, dt) {
      S.st += dt;
      for (const k of ['left', 'right', 'down', 'rotate', 'start']) S.btnDown[k] = g.down(k);
      if (g.pressed('sound')) S.sound = !S.sound;
      if (S.stage === 'boot') {
        if (S.st > 0.05 && !S.bootBeep) { S.bootBeep = true; melody(g, S, [3136, 2637, 3136, 3951], 0.06); }
        if (S.st > 1.3) { if (S.mode) startMode(g, S, S.mode); else { S.stage = 'select'; S.st = 0; } }
      } else if (S.stage === 'select') {
        if (g.pressed('left') || g.pressed('right')) { S.sel ^= 1; beep(g, S, 2349, 0.04); }
        if (g.pressed('rotate') || g.pressed('start') || g.pressed('down')) startMode(g, S, S.sel ? 'race' : 'blocks');
      } else if (S.stage === 'curtain') {
        if (S.st > 1.25) { if (S.curtainNext === 'play') { S.stage = 'play'; S.st = 0; if (S.mode === 'blocks') spawn(g, S); } else { S.stage = 'dead'; } }
      } else if (S.stage === 'play') {
        if (S.mode === 'blocks') stepBlocks(g, S, dt); else stepRace(g, S, dt);
      }
      // LCD persistence
      renderLit(S);
      for (let i = 0; i < S.fade.length; i++) S.fade[i] = S.lit[i] ? 1 : Math.max(0, S.fade[i] - dt * 11);
    }

    function stepBlocks(g, S, dt) {
      if (S.flash) { S.flash.t += dt; if (S.flash.t > 0.42) clearRows(g, S); return; }
      if (!S.piece) { spawn(g, S); if (!S.piece) return; }
      const P = S.piece;
      if (g.over) return;
      if (repeatKey(g, S, 'left', dt, 0.17, 0.05) && fits(S, P.kind, P.r, P.x - 1, P.y)) { P.x--; beep(g, S, 2093, 0.012); }
      if (repeatKey(g, S, 'right', dt, 0.17, 0.05) && fits(S, P.kind, P.r, P.x + 1, P.y)) { P.x++; beep(g, S, 2093, 0.012); }
      if (g.pressed('rotate')) {
        const nr = (P.r + 1) & 3;
        for (const k of [0, -1, 1, -2, 2]) if (fits(S, P.kind, nr, P.x + k, P.y)) { P.r = nr; P.x += k; beep(g, S, 2637, 0.015); break; }
      }
      const soft = g.down('down');
      S.drop += dt;
      const iv = soft ? Math.min(0.035, gravity(S)) : gravity(S);
      while (S.drop >= iv && S.piece) {
        S.drop -= iv;
        if (fits(S, P.kind, P.r, P.x, P.y + 1)) { P.y++; if (soft) S.score += 1; }
        else { lockPiece(g, S); break; }
      }
    }

    function carCells(lane, top) { const x0 = lane ? 5 : 2; return CAR.map(([x, y]) => [x0 + x, top + y]); }
    function stepRace(g, S, dt) {
      if (S.crash) {
        S.crash.t += dt;
        if (S.crash.t > 1.4) {
          S.crash = null; S.enemies = [];
          if (S.lives <= 0) gameOver(g, S);
        }
        return;
      }
      if (g.over) return;
      if (g.pressed('left') && S.lane !== 0) { S.lane = 0; beep(g, S, 2093, 0.015); }
      if (g.pressed('right') && S.lane !== 1) { S.lane = 1; beep(g, S, 2093, 0.015); }
      const turbo = g.down('rotate') || g.down('down');
      const lvl = S.speed + Math.floor(S.cars / 8);
      const iv = Math.max(0.045, (0.16 - lvl * 0.012) * (turbo ? 0.55 : 1));
      S.rowT += dt;
      while (S.rowT >= iv) {
        S.rowT -= iv;
        S.scroll = (S.scroll + 1) % 4;
        for (const e of S.enemies) e.y++;
        // passed
        for (let i = S.enemies.length - 1; i >= 0; i--) {
          if (S.enemies[i].y >= ROWS) { S.enemies.splice(i, 1); S.cars++; S.score += turbo ? 150 : 100; beep(g, S, 1568, 0.02); if (S.cars >= S.target) { win(g, S); return; } }
        }
        S.spawnIn--;
        if (S.spawnIn <= 0) {
          const last = S.enemies[S.enemies.length - 1];
          let lane = (g.rng.next() * 2) | 0;
          // never two cars in a wall: keep a gap of at least 5 rows when switching lanes
          if (last && last.lane !== lane && last.y < 5) lane = last.lane;
          S.enemies.push({ lane, y: -4 });
          S.spawnIn = Math.max(5, Math.round(9 - g.diff * 2 - Math.min(2, S.cars / 12) + g.rng.next() * 4));
        }
        if (turbo) beep(g, S, 220 + S.scroll * 20, 0.02, { vol: 0.02 });
      }
      // collision
      const me = carCells(S.lane, ROWS - 4);
      for (const e of S.enemies) {
        if (e.lane !== S.lane) continue;
        const cells = carCells(e.lane, e.y);
        let hit = false;
        for (const [x, y] of cells) for (const [mx, my] of me) if (x === mx && y === my) hit = true;
        if (hit) {
          S.lives--; S.crash = { t: 0, x: S.lane ? 5 : 2 };
          melody(g, S, [523, 392, 262, 196], 0.08, { vol: 0.06 });
          g.noise(0.4, { f: 1200, vol: 0.06 });
          g.shake(5);
          break;
        }
      }
    }

    /* ---------------------------------------------------- the LCD image */
    function renderLit(S) {
      const L = S.lit;
      L.fill(0);
      const set = (x, y) => { if (x >= 0 && x < COLS && y >= 0 && y < ROWS) L[y * COLS + x] = 1; };
      S.next.fill(0);
      if (S.stage === 'boot' || S.stage === 'select') {
        const letter = S.stage === 'boot' ? null : S.sel ? 'B' : 'A';
        if (S.stage === 'boot') { // spiral-ish boot pattern
          const k = Math.min(1, S.st / 1.1), n = Math.floor(k * ROWS);
          for (let y = ROWS - n; y < ROWS; y++) for (let x = 0; x < COLS; x++) if ((x + y) % 2 === 0 || k > 0.8) set(x, y);
          return;
        }
        const gl = GLYPH[letter];
        for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (gl[y][x] === '1') set(2 + x, 2 + y);
        if (Math.floor(S.st * 3) % 2 === 0) { set(0, 5); set(1, 4); set(1, 6); set(9, 5); set(8, 4); set(8, 6); }
        if (letter === 'A') { for (const [x, y] of rotCells('T', 0)) set(3 + x, 13 + y); for (const [x, y] of rotCells('I', 0)) set(3 + x, 15 + y); for (let x = 0; x < COLS; x++) if (x !== 6) set(x, 18), set(x, 19); }
        else { for (const [x, y] of carCells(0, 11)) set(x, y); for (const [x, y] of carCells(1, 15)) set(x, y); for (let y = 10; y < ROWS; y++) if ((y + Math.floor(S.st * 8)) % 4 !== 3) { set(0, y); set(9, y); } }
        return;
      }
      if (S.stage === 'curtain') {
        const k = S.st / 1.25;
        const n = k < 0.5 ? Math.floor((k / 0.5) * ROWS) : Math.floor((1 - (k - 0.5) / 0.5) * ROWS);
        for (let y = ROWS - n; y < ROWS; y++) for (let x = 0; x < COLS; x++) set(x, y);
        return;
      }
      if (S.stage === 'dead') { for (let i = 0; i < L.length; i++) L[i] = 1; return; }
      if (S.mode === 'blocks') {
        for (let i = 0; i < L.length; i++) L[i] = S.board[i];
        if (S.flash && Math.floor(S.flash.t / 0.07) % 2 === 0) for (const r of S.flash.rows) for (let x = 0; x < COLS; x++) L[r * COLS + x] = 0;
        if (S.piece) for (const [x, y] of rotCells(S.piece.kind, S.piece.r)) set(S.piece.x + x, S.piece.y + y);
        if (S.nextKind) { const n = PIECES[S.nextKind].n; for (const [x, y] of rotCells(S.nextKind, 0)) S.next[(y + (n === 2 ? 1 : n === 4 ? 0 : 1)) * 4 + x + (n === 2 ? 1 : n === 3 ? 0 : 0)] = 1; }
      } else if (S.mode === 'race') {
        for (let y = 0; y < ROWS; y++) if ((y + S.scroll) % 4 !== 3) { set(0, y); set(9, y); }
        for (const e of S.enemies) for (const [x, y] of carCells(e.lane, e.y)) set(x, y);
        if (S.crash) {
          const t = S.crash.t, f = Math.floor(t / 0.12) % 2;
          for (let y = ROWS - 4; y < ROWS; y++) for (let x = S.crash.x - 1; x < S.crash.x + 4; x++) if (((x + y + f) % 2) === 0) set(x, y);
        } else for (const [x, y] of carCells(S.lane, ROWS - 4)) set(x, y);
        for (let i = 0; i < S.lives && i < 4; i++) S.next[12 + i] = 1;
      }
      if (S.stage === 'won' && Math.floor(S.st / 0.16) % 2) L.fill(0);
    }

    /* ----------------------------------------------------------- the bot */
    function botPlay(g, S, dt, want) {
      S.botT = (S.botT || 0) - dt;
      if (S.stage === 'select') { if (S.botT <= 0) { g.botPress('rotate'); S.botT = 0.3; } return; }
      if (S.stage !== 'play') { g.botHold('down', false); g.botHold('rotate', false); return; }
      if (want === 'lose') { g.botHold('down', S.mode === 'blocks'); return; }
      if (S.mode === 'race') {
        if (S.crash) return;
        const danger = (lane) => S.enemies.some((e) => e.lane === lane && e.y > ROWS - 13 && e.y < ROWS);
        if (danger(S.lane) && !S.enemies.some((e) => e.lane !== S.lane && e.y > ROWS - 9 && e.y < ROWS + 1)) { if (S.botT <= 0) { g.botPress(S.lane ? 'left' : 'right'); S.botT = 0.08; } }
        g.botHold('rotate', !danger(S.lane) && !danger(S.lane ^ 1));
        return;
      }
      const P = S.piece;
      if (!P || S.flash) { g.botHold('down', false); return; }
      if (!S.plan || S.plan.piece !== P) S.plan = { piece: P, ...bestMove(S, P.kind) };
      const pl = S.plan;
      if (S.botT > 0) return;
      if (P.r !== pl.r) { g.botPress('rotate'); S.botT = 0.07; return; }
      if (P.x < pl.x) { g.botPress('right'); S.botT = 0.06; return; }
      if (P.x > pl.x) { g.botPress('left'); S.botT = 0.06; return; }
      g.botHold('down', true);
    }
    function bestMove(S, kind) {
      let best = { r: 0, x: 3, s: -1e9 };
      const tmp = new Uint8Array(S.board.length);
      for (let r = 0; r < 4; r++) {
        for (let x = -2; x < COLS; x++) {
          if (!fits(S, kind, r, x, 0)) continue;
          let y = 0; while (fits(S, kind, r, x, y + 1)) y++;
          tmp.set(S.board);
          for (const [cx, cy] of rotCells(kind, r)) if (y + cy >= 0) tmp[(y + cy) * COLS + x + cx] = 1;
          let lines = 0, holes = 0, agg = 0, bump = 0, prevH = -1;
          for (let rr = 0; rr < ROWS; rr++) { let f = true; for (let c = 0; c < COLS; c++) if (!tmp[rr * COLS + c]) f = false; if (f) lines++; }
          for (let c = 0; c < COLS; c++) {
            let h = 0, seen = false;
            for (let rr = 0; rr < ROWS; rr++) { if (tmp[rr * COLS + c]) { if (!seen) { h = ROWS - rr; seen = true; } } else if (seen) holes++; }
            agg += h; if (prevH >= 0) bump += Math.abs(h - prevH); prevH = h;
          }
          const sc = lines * 0.76 - agg * 0.51 - holes * 0.36 - bump * 0.18;
          if (sc > best.s) best = { r, x, s: sc };
        }
      }
      return best;
    }

    /* ------------------------------------------------------------- drawing */
    function layoutDevice(g, S) {
      const A = g.area, W = g.W;
      const land = !g.portrait;
      const L = (S.L = { land });
      // body
      const bw = land ? Math.min(W - 16, A.h * 2.05) : Math.min(W - 16, A.h * 0.62);
      const bh = land ? Math.min(A.h - 12, bw * 0.5) : Math.min(A.h - 12, bw * 1.75);
      L.bx = (W - bw) / 2; L.by = A.y + (A.h - bh) / 2; L.bw = bw; L.bh = bh;
      // LCD (playfield 10x20 + 5-col side panel)
      const lcdH = land ? bh * 0.84 : bh * 0.52;
      const cell = Math.floor(Math.min((lcdH - 16) / ROWS, (land ? bw * 0.42 : bw * 0.8) / 15.6));
      L.cell = cell;
      L.lw = cell * 15.6 + 14; L.lh = cell * ROWS + 16;
      L.lx = L.bx + (bw - L.lw) / 2; L.ly = land ? L.by + (bh - L.lh) / 2 + bh * 0.02 : L.by + bh * 0.09;
      L.fx = L.lx + 8; L.fy = L.ly + 8; L.fw = cell * COLS; L.fh = cell * ROWS;
      L.px = L.fx + L.fw + cell * 0.6;
      // buttons
      const r = land ? Math.min(bh * 0.13, (L.lx - L.bx) * 0.16) : Math.min(bw * 0.085, (bh - (L.ly - L.by) - L.lh) * 0.14);
      const big = r * 1.55;
      let dcx, dcy, rcx, rcy, sy;
      if (land) {
        dcx = L.bx + (L.lx - L.bx) * 0.5; dcy = L.by + bh * 0.56;
        rcx = L.lx + L.lw + (L.bx + bw - L.lx - L.lw) * 0.5; rcy = L.by + bh * 0.56;
        sy = L.by + bh * 0.18;
      } else {
        const below = L.ly + L.lh, room = L.by + bh - below;
        dcx = L.bx + bw * 0.3; dcy = below + room * 0.6;
        rcx = L.bx + bw * 0.76; rcy = below + room * 0.62;
        sy = below + room * 0.17;
      }
      const gap = r * 1.35;
      S.btns = [
        { a: 'rotate', x: dcx, y: dcy - gap, r, icon: 'up', col: '#2b2b33' },
        { a: 'down', x: dcx, y: dcy + gap, r, icon: 'down', col: '#2b2b33' },
        { a: 'left', x: dcx - gap, y: dcy, r, icon: 'left', col: '#2b2b33' },
        { a: 'right', x: dcx + gap, y: dcy, r, icon: 'right', col: '#2b2b33' },
        { a: 'rotate', x: rcx, y: rcy, r: big, icon: 'rot', col: '#c8322a', label: 'ROTATE' },
      ];
      const sr = Math.max(8, r * 0.36);
      const small = [['pause', 'START'], ['sound', 'SOUND'], ['pause', 'ON/OFF'], ['pause', 'RESET']];
      if (land) small.forEach((s, i) => S.btns.push({ a: s[0], x: i < 2 ? L.bx + (L.lx - L.bx) * (0.3 + i * 0.4) : L.lx + L.lw + (L.bx + bw - L.lx - L.lw) * (0.3 + (i - 2) * 0.4), y: sy, r: sr, small: true, label: s[1], col: '#3a3a44' }));
      else small.forEach((s, i) => S.btns.push({ a: s[0], x: L.bx + bw * (0.2 + i * 0.2), y: sy, r: sr, small: true, label: s[1], col: '#3a3a44' }));
      S.offKey = null;
    }
    function hitBtn(S, x, y) {
      let best = null, bd = 1e9;
      for (const b of S.btns) { const d = Math.hypot(x - b.x, y - b.y); if (d < b.r * (b.small ? 1.6 : 1.3) && d < bd) { bd = d; best = b; } }
      return best;
    }

    function cellPath(ctx, x, y, c) {
      const m = Math.max(1, c * 0.1), w = c - m * 2, lw = Math.max(1, c * 0.12);
      ctx.rect(x + m, y + m, w, lw); ctx.rect(x + m, y + m + w - lw, w, lw); ctx.rect(x + m, y + m + lw, lw, w - lw * 2); ctx.rect(x + m + w - lw, y + m + lw, lw, w - lw * 2);
      const ii = c * 0.3; ctx.rect(x + ii, y + ii, c - ii * 2, c - ii * 2);
    }
    function paintOff(g, S) {
      const L = S.L, d = g.dpr;
      const c0 = (S.offC = S.offC || H.canvas(1, 1));
      c0.width = Math.ceil(L.fw * d); c0.height = Math.ceil(L.fh * d);
      const c = c0.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      c.fillStyle = LCD_OFF; c.beginPath();
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) cellPath(c, x * L.cell, y * L.cell, L.cell);
      c.fill();
      S.offKey = L.cell + ':' + d;
    }
    function seg7(ctx, x, y, h, ch, on) {
      const w = h * 0.52, t = Math.max(1.2, h * 0.13), segs = SEG[ch] || '';
      const S_ = {
        a: [x + t * 0.6, y, w - t * 1.2, t], d: [x + t * 0.6, y + h - t, w - t * 1.2, t], g: [x + t * 0.6, y + h / 2 - t / 2, w - t * 1.2, t],
        f: [x, y + t * 0.6, t, h / 2 - t * 0.9], b: [x + w - t, y + t * 0.6, t, h / 2 - t * 0.9],
        e: [x, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9], c: [x + w - t, y + h / 2 + t * 0.3, t, h / 2 - t * 0.9],
      };
      for (const k in S_) { ctx.fillStyle = segs.indexOf(k) >= 0 && on ? LCD_ON : LCD_OFF; const r = S_[k]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
      return w + h * 0.16;
    }
    function num(ctx, x, y, h, v, digits) {
      const s = String(Math.max(0, Math.floor(v))).padStart(digits, ' ').slice(-digits);
      for (const ch of s) x += seg7(ctx, x, y, h, ch === ' ' ? '8' : ch, ch !== ' ');
    }

    function drawDevice(g, ctx, S) {
      const L = S.L, W = g.W, Hh = g.H;
      if (S.offKey !== L.cell + ':' + g.dpr) paintOff(g, S);
      // table top behind the handheld (a school desk with doodles)
      let gr = ctx.createLinearGradient(0, 0, 0, Hh);
      gr.addColorStop(0, '#5a3a2a'); gr.addColorStop(1, '#3a241a');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, Hh);
      ctx.strokeStyle = 'rgba(255,220,180,0.06)'; ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(0, (i / 14) * Hh + Math.sin(i) * 8); ctx.bezierCurveTo(W * 0.3, (i / 14) * Hh + 12, W * 0.6, (i / 14) * Hh - 10, W, (i / 14) * Hh + 6); ctx.stroke(); }
      // body
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; H.rr(ctx, L.bx + 6, L.by + 10, L.bw, L.bh, L.bw * 0.08); ctx.fill();
      gr = ctx.createLinearGradient(L.bx, L.by, L.bx + L.bw, L.by + L.bh);
      gr.addColorStop(0, '#ffd84a'); gr.addColorStop(0.5, '#f2c230'); gr.addColorStop(1, '#d9a51a');
      ctx.fillStyle = gr; H.rr(ctx, L.bx, L.by, L.bw, L.bh, Math.min(L.bw, L.bh) * 0.1); ctx.fill();
      ctx.strokeStyle = '#a87a10'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; H.rr(ctx, L.bx + 5, L.by + 5, L.bw - 10, L.bh - 10, Math.min(L.bw, L.bh) * 0.08); ctx.stroke();
      // bezel
      const bz = 10, tz = L.land ? 0 : L.cell * 1.4;
      ctx.fillStyle = '#2a2a33'; H.rr(ctx, L.lx - bz, L.ly - bz - tz, L.lw + bz * 2, L.lh + bz * 2 + tz, 10); ctx.fill();
      // rainbow title on the bezel (generic, no brand)
      const title = L.land ? 'BRICK GAME · 9999 IN 1' : 'BRICK GAME', cols = ['#ff5a4a', '#ffb43a', '#ffe14a', '#6fdc5a', '#4ac8ff', '#b07aff'];
      const ty = L.land ? L.ly - bz - L.cell * 0.9 : L.ly - bz - tz * 0.45, tsz = Math.max(11, L.cell * (L.land ? 0.85 : 0.95));
      ctx.font = H.font('display', tsz); ctx.textBaseline = 'middle';
      let tw = 0; for (const ch of title) tw += ctx.measureText(ch).width;
      let tx = L.lx + L.lw / 2 - tw / 2;
      const tcol = L.land ? '#1a1214' : null;
      [...title].forEach((ch, i) => { ctx.fillStyle = tcol || cols[i % cols.length]; ctx.textAlign = 'left'; ctx.fillText(ch, tx, ty); tx += ctx.measureText(ch).width; });
      // the LCD glass
      gr = ctx.createLinearGradient(L.lx, L.ly, L.lx, L.ly + L.lh);
      gr.addColorStop(0, '#a9b896'); gr.addColorStop(1, '#93a382');
      ctx.fillStyle = gr; ctx.fillRect(L.lx, L.ly, L.lw, L.lh);
      ctx.strokeStyle = 'rgba(20,26,16,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(L.fx - 2.5, L.fy - 2.5, L.fw + 5, L.fh + 5);
      ctx.drawImage(S.offC, L.fx, L.fy, L.fw, L.fh);
      // lit cells (with a little LCD persistence)
      const c = L.cell;
      ctx.fillStyle = LCD_ON;
      ctx.beginPath();
      for (let i = 0; i < S.fade.length; i++) if (S.fade[i] >= 0.99) cellPath(ctx, L.fx + (i % COLS) * c, L.fy + Math.floor(i / COLS) * c, c);
      ctx.fill();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      for (let i = 0; i < S.fade.length; i++) if (S.fade[i] > 0.05 && S.fade[i] < 0.99) cellPath(ctx, L.fx + (i % COLS) * c, L.fy + Math.floor(i / COLS) * c, c);
      ctx.fill();
      ctx.globalAlpha = 1;
      // side panel
      const px = L.px, lab = (t, y) => H.text(ctx, t, px, y, { font: 'osd', size: Math.max(10, c * 0.72), color: '#28331f', align: 'left' });
      const dh = c * 1.05;
      lab('SCORE', L.fy + c * 0.45);
      num(ctx, px, L.fy + c * 1.0, dh, S.score, 5);
      lab('HI-SCORE', L.fy + c * 2.75);
      num(ctx, px, L.fy + c * 3.3, dh, Math.max(S.hi, S.score), 5);
      lab(S.mode === 'race' ? 'LIVES' : 'NEXT', L.fy + c * 5.2);
      const nc = c * 0.92;
      ctx.fillStyle = LCD_OFF; ctx.beginPath(); for (let i = 0; i < 16; i++) cellPath(ctx, px + (i % 4) * nc, L.fy + c * 5.8 + Math.floor(i / 4) * nc, nc); ctx.fill();
      ctx.fillStyle = LCD_ON; ctx.beginPath(); for (let i = 0; i < 16; i++) if (S.next[i]) cellPath(ctx, px + (i % 4) * nc, L.fy + c * 5.8 + Math.floor(i / 4) * nc, nc); ctx.fill();
      lab(S.mode === 'race' ? 'CARS' : 'LINES', L.fy + c * 10.3);
      num(ctx, px, L.fy + c * 10.85, dh, S.mode === 'race' ? S.cars || 0 : S.lines || 0, 2);
      num(ctx, px + c * 2.15, L.fy + c * 10.85, dh, S.target || 0, 2);
      ctx.fillStyle = LCD_ON; ctx.fillRect(px + c * 1.6, L.fy + c * 11.3, c * 0.4, c * 0.12);
      lab('SPEED', L.fy + c * 13.1);
      num(ctx, px, L.fy + c * 13.65, dh, S.speed || 1, 1);
      lab('LEVEL', L.fy + c * 15.4);
      num(ctx, px, L.fy + c * 15.95, dh, S.mode === 'race' ? 2 : 1, 1);
      // little icons: pause cup + sound note
      H.text(ctx, g.phase === 'paused' ? 'PAUSE' : '', px, L.fy + c * 18.1, { font: 'osd', size: Math.max(10, c * 0.72), color: '#28331f', align: 'left' });
      H.text(ctx, S.sound ? '♪' : '', px + c * 3.2, L.fy + c * 19.2, { font: 'body', size: c * 1.2, color: '#28331f', align: 'left' });
      // glass glare
      ctx.save(); ctx.beginPath(); ctx.rect(L.lx, L.ly, L.lw, L.lh); ctx.clip();
      gr = ctx.createLinearGradient(L.lx, L.ly, L.lx + L.lw, L.ly + L.lh);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.04)'); gr.addColorStop(0.36, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = gr; ctx.fillRect(L.lx, L.ly, L.lw, L.lh);
      ctx.restore();
      // "9999 IN 1" under the screen
      if (!L.land) H.text(ctx, '9999 IN 1', L.lx + L.lw / 2, L.ly + L.lh + bz + Math.max(10, c * 0.8), { font: 'display', size: Math.max(11, c * 0.85), color: '#7a5408' });
      // buttons
      for (const b of S.btns) {
        const down = b.small ? false : S.btnDown[b.a];
        const off = down ? 2 : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(b.x + 2, b.y + 4, b.r, 0, TAU); ctx.fill();
        gr = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.35 + off, b.r * 0.1, b.x, b.y + off, b.r);
        gr.addColorStop(0, H.shade(b.col, 1.35)); gr.addColorStop(1, b.col);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y + off, b.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const ir = b.r * 0.38, x = b.x, y = b.y + off;
        ctx.beginPath();
        if (b.icon === 'up') { ctx.moveTo(x, y - ir); ctx.lineTo(x + ir, y + ir * 0.6); ctx.lineTo(x - ir, y + ir * 0.6); }
        else if (b.icon === 'down') { ctx.moveTo(x, y + ir); ctx.lineTo(x + ir, y - ir * 0.6); ctx.lineTo(x - ir, y - ir * 0.6); }
        else if (b.icon === 'left') { ctx.moveTo(x - ir, y); ctx.lineTo(x + ir * 0.6, y - ir); ctx.lineTo(x + ir * 0.6, y + ir); }
        else if (b.icon === 'right') { ctx.moveTo(x + ir, y); ctx.lineTo(x - ir * 0.6, y - ir); ctx.lineTo(x - ir * 0.6, y + ir); }
        ctx.fill();
        if (b.icon === 'rot') { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(2, b.r * 0.12); ctx.beginPath(); ctx.arc(x, y, b.r * 0.42, -Math.PI * 0.2, Math.PI * 1.35); ctx.stroke(); ctx.beginPath(); const ex = x + Math.cos(-Math.PI * 0.2) * b.r * 0.42, ey = y + Math.sin(-Math.PI * 0.2) * b.r * 0.42; ctx.moveTo(ex + b.r * 0.15, ey - b.r * 0.2); ctx.lineTo(ex + b.r * 0.12, ey + b.r * 0.12); ctx.lineTo(ex - b.r * 0.2, ey + b.r * 0.02); ctx.fill(); }
        if (b.label) H.text(ctx, b.label, b.x, b.y + b.r + Math.max(9, b.r * (b.small ? 0.9 : 0.32)), { font: 'osd', size: Math.max(11, b.small ? b.r * 1.05 : b.r * 0.34), color: '#5a3a08' });
      }
      // speaker grille
      const gx = L.land ? L.lx + L.lw + (L.bx + L.bw - L.lx - L.lw) * 0.5 : L.bx + L.bw * 0.5, gy = L.land ? L.by + L.bh * 0.88 : L.by + L.bh - 20;
      ctx.fillStyle = 'rgba(90,60,8,0.55)';
      for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.arc(gx + i * 7, gy + j * 7, 2, 0, TAU); ctx.fill(); }
    }

    MG.register(def);
  }
