/* NOSTALGIA — playground_games.js  (owner: playground-games developer)
 * The colony-ground games of places_registry "Round 14" (binding), played IN THE WORLD on the real
 * playgrounds (places of kind 'playground', ids playground_*) by Chinnu with his own controls, next to
 * gully cricket:
 *   lingocha    LINGOCHA (seven stones / lagori / pittu). A stack of seven flat stones and a soft tennis
 *               ball. Two teams of 3-5. The seekers throw at the stack from a chalk line (3 tries); the
 *               stones scatter; then the seekers pick the stones up one by one and restack them while the
 *               hitters chase the ball and throw it at them: hit = out (dodging works, a touch on a hitter
 *               makes you SAFE for a moment, little Chitti is doodh-bhaat and never counts). Rebuild all
 *               seven and it is "LINGOCHA!". Roles swap every round; best of 3.
 *   marampitti  MARAM PITTI (Telugu "picchi banti", Indian dodgeball). Free for all, 6-10 kids. The ball
 *               is tossed up and must BOUNCE before anyone grabs it (every throw: only a catch on the full
 *               is allowed, and a catch puts the thrower out). Whoever holds it throws at the others; a
 *               hit on the full = out; no head shots (a foul, kid-friendly, comic "thwack", nobody gets
 *               hurt); RUN dodges. Last one standing wins.
 * Ambient: in the afternoon (school days 16:00-18:30) and on holidays / Sundays (08:00-18:30), when no
 * mission runs, the kids at the nearest ground play gully cricket (places_art.js draws it), lingocha or
 * maram pitti (simulated here with the same rules, all AI, light), with Hyderabadi barks.
 * Contract: ARCHITECTURE.md §3, §8 (interact), §11 (m.minigame), §18 (N.minigames), §19, §20 (3D layer);
 * systems_design §2.4 / §8 (pay: max 3 paid wins per minigame per game-day), §4 (Chappal Meter).
 *
 * PUBLIC API — N.playgroundGames (also reachable through N.minigames)
 *   N.minigames.play('lingocha' | 'marampitti', params) -> Promise<result>   (same contract as the overlay
 *     games: never rejects; busy / unknown -> {win:false, error}). Aliases: seven_stones lagori pittu pithu
 *     lingocha_game maram_pitti marampeety picchi_banti dodgeball.
 *   play(id, params), abort(reason), current (the running game's session | null), isOpen(),
 *   fields() -> [{key, ids, name, x0, y0, x1, y1, stack, line, centre}], fieldFor(placeId),
 *   kidsPresent() (the time window), ambient {force: null|'lingocha'|'marampitti'|'cricket', off, session},
 *   TUNE, debug {...} (tests: state(), assist, give, out, hitPlayer, throwAt, restack, finishRound, ...)
 * params (all optional): place (a playground place id; default: the nearest ground, else playground_1) ·
 *   difficulty 0..1 (default 0.4; + the settings preset, - 0.15 with Assist) · assist · seed · side (free-roam:
 *   pays per systems §2.4) · reward (paise, paid on a win, story) · noQuit (walking away brings you back) ·
 *   intro (a story line shown at the start) · title
 *   lingocha: rounds (best of, default 3) · team (kids per side incl. Chinnu, 3-5, default 4) · seekFirst
 *     (default true: Chinnu's team seeks in round 1) · liveTime (s to rebuild)
 *   marampitti: kids (6-10 incl. Chinnu, default 8) · time (s, default 150)
 * result: {id, win, score, stars 0..3, quit, aborted, reason, time, difficulty, assist, place, paid, window,
 *   lingocha: roundsWon, roundsLost, rounds [{round, seek: 'home'|'away', winner: 'home'|'away', reason}],
 *     stacked, hits, outs, tries · marampitti: hits, catches, fouls, rank, survivors, kids}
 * Free-roam pay (side): ₹2 a win, ₹3 for 3 stars, at most 3 paid wins per game per game-day (shared day
 *   ledger N.minigames.ledger). Story games pay through the mission (params.reward if given).
 *
 * CONTROLS (the normal on-foot controls; keyboard, touch joystick + ACTION / RUN, gamepad)
 *   move = walk, RUN = run (maram pitti: a RUN tap is a quick dodge hop), ACTION = the context action shown
 *   on the button / prompt: pick up / stack a stone, grab the ball, throw (tap = normal, hold = hard throw),
 *   catch. Lingocha line throw: ←/→ (or the stick / mouse pointer / the 3D camera) aims, hold ACTION (or the
 *   mouse button) to charge the power and let go to throw; on touch screens drag back on the picture and let
 *   go (slingshot). Aim assist on phones / with Assist.
 *
 * HOOKS INTO OTHER MODULES (installed from this file only; nothing else is edited)
 *   - N.minigames: registers 'lingocha' and 'marampitti' (defs with inWorld: true) and wraps play / start /
 *     abort / isOpen / active so those ids run here (missions' m.minigame and menus' "no saving now" work).
 *   - N.interact: 'pg:<game>:<ground>' offers "Join lingocha" / "Join maram pitti" (priority -1, next to the
 *     gully-cricket offer) while kids are at the ground; while a game runs, a priority-90 per-step offer owns
 *     the ACTION button (its label is the game's context action).
 *   - Systems: 'pg.ctl' (order 15: reads ACTION / RUN / move for the game, autopilot walks, aim), 'pg.sim'
 *     (order 26: AI, ball + stone physics, rules, ambient games, draw), 'pg.paOn' / 'pg.paOff' (order 42.95 /
 *     43.05, draw only) + an N.render.queue wrapper: while places_art draws, its static gully-cricket kids at a
 *     ground where lingocha / maram pitti is on are dropped (actors layer, that ground's sort key only).
 *   - N.view3d.registerLayer('playgroundGames'): stones, ball, chalk line, aim arrow, team rings in 3D (the
 *     kids are entities of kind 'ped' with N.people looks, so view3d_actors draws them).
 *   - N.clock.hold('playground-game') during a real game (the clock then crawls at TUNE.clockRate game minutes
 *     per second), N.render.baseZoom (top-down: zoomed in to fit the ground, 1-1.8) during a real game,
 *     N.input.setLabel('run', 'DODGE'); mission givers' when() is wrapped once so no giver's J-card starts a
 *     mission while a game is on (the colony ground carries the gully-league giver).
 *   - N.wanted.addHeat(15, 'ball') when Chinnu's throw hits an adult passer-by; a broken window (Chinnu's ball
 *     into a house at window height) ends the game comically (+30 heat, the aunty keeps the ball for the day).
 *   - N.npcs: looks, names and bark speakers of Immu, Ayesha, Chitti, Bunty-anna, Babloo, Tiger; an actor of
 *     the same character already standing at the ground is hidden while its double plays (restored after).
 *   - HUD: a compact panel (.pg-hud) inside #hud .hud-top, DOM pops (.pg-pops) over the 2D / 3D view,
 *     N.hud.banner / toast; N.audio.sfx; N.dialogue.bark; events minigame:start / end / event.
 * TEST: node tests/playground_games.cjs
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.util) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hyp = Math.hypot;
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const adiff = (a, b) => wrapA(b - a);

  /* ================================================================ tunables */
  const TUNE = {
    g: 165, ballR: 0.85, hand: 4.4, headZ: 5.5, bodyTop: 7.2, hitR: 3.9,
    bounce: 0.56, bounceFric: 0.8, rollFric: 58, rollDrag: 0.75, kerb: 0.45, kerbM: 8, wallE: 0.5, bumpy: 0.16,
    kidWalk: 42, kidRun: 64, kidRunD: 12, kidR: 3.2, holdWalk: 0.68, carryMul: 0.78,
    stoneR: [2.6, 2.3, 2.05, 1.8, 1.55, 1.35, 1.15], stoneH: 0.78,
    // broken Shahabad / Kadapa floor slabs and sandstone: what colony kids stack (contrast on red dust)
    stoneCols: ['#55636f', '#c9a77c', '#4b5763', '#dcc7a2', '#66737f', '#b88f62', '#7e8b97'],
    lineDist: 30,
    throwSpeed: 160, powerSpeed: 214, aiSpeed: [138, 180], passSpeed: 115,
    lingocha: { tries: 3, rounds: 3, team: 4, live: [100, 72], safeT: 2.4, safeCD: 5, holdMax: 3.2, guardR: 13, kick: 92, pickT: 0.5, stackT: 0.75, threatR: 34, scatter: 0.8, aiErr: [0.2, 0.11], stackErr: [0.17, 0.11], dodge: [0.25, 0.55], windup: [0.7, 0.42] },
    maram: { kids: 8, time: 150, holdMax: 3.2, tossVz: 70, fouls: 3, dashV: 95, dashCD: 0.8 },
    aim: { rotKey: 0.95, cycle: 1.25, assistSnap: 0.14, elev: 0.085, min: 85, span: 150, drag: 130 },
    pay: { win: 200, win3: 300, daily: 3 },
    ambient: { r: 640, far: 820, rest: 5, barkGap: [3.5, 7.5], kids: 6 },
    clockRate: 0.25, zoom: [1, 1.8], zoomPad: 110, leaveR: 70, leaveT: 5, catchWin: 0.32,
    heat: { adult: 15, window: 30 },
  };
  const TEAM_COL = ['#f2c230', '#e2483a'];
  const BOYS = ['Venky', 'Sameer', 'Gopi', 'Raju', 'Sunny', 'Chintu', 'Munna', 'Lucky', 'Sattar', 'Pappu', 'Srinu', 'Kittu', 'Bunny', 'Arif', 'Naveen', 'Pandu', 'Jaffer', 'Ravi'];
  const GIRLS = ['Pinky', 'Swapna', 'Rani', 'Shabana', 'Lata', 'Sweety', 'Bindu', 'Nazia'];
  const BARK = {
    out: ['Out ra!', 'Out! Out!', '*Gaya!* Out!', 'Out, sit down!'],
    safe: ['Safe! Safe!', 'Touched! Safe!'],
    cheat: ['*Nakko*, cheating!', 'Bounce *hone de*!', 'Arre, bounce first!'],
    head: ['*Nakko!* Not the head!', 'Head *pe nakko*, ra!', '*Ayyo*, no head shots!'],
    dood: ['*Doodh-bhaat!* Doesn\'t count!', 'She\'s *doodh-bhaat*, leave her!'],
    lingocha: ['Lingochaaa!', 'LINGOCHA!'],
    chatter: ['*Phek* ra!', '*Jaldi*, *jaldi*!', 'Idhar! Idhar!', 'Pass *kar*!', '*Bach gaya*!', 'Throw, ra!', 'Too slow, *yaar*!'],
    catch: ['Caught it! You\'re out!', '*Pakda*!'],
    miss: ['*Arre*, missed!', 'Wide, ra!', '*Bach gaya*!'],
    knock: ['*Gira diya*!', 'Down! Run, run!'],
    adult: ['*Arre!* Who threw that?!', 'Oye! Watch the ball!', '*Kaun hai?*'],
    window: 'Kaun hai?! Whose ball is this?! I am telling your *Mummy*!',
  };

  /* ================================================================ small helpers */
  const now = () => (N.time && N.time.now) || 0;
  const sfx = (name, o) => { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, o || { ui: true }); } catch (e) { /* audio is optional */ } };
  const toast = (t, ms) => { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2400); } catch (e) { /* ignore */ } };
  const banner = (t, s, ms, kind) => { try { if (N.hud && N.hud.banner) N.hud.banner(t, s || '', ms || 2200, { kind: kind || 'info' }); } catch (e) { /* ignore */ } };
  /** ~N(0, 1) (sum of three uniforms, scaled to unit spread) */
  function gauss(r) { return (r.next() + r.next() + r.next() - 1.5) * 2; }
  function settings() { try { return N.settings || (N.menus && N.menus.settings) || {}; } catch (e) { return {}; } }
  function isTouch() { try { return (N.input && N.input.device === 'touch') || document.body.classList.contains('touch-on'); } catch (e) { return false; } }
  function is3D() { try { return !!(N.view3d && N.view3d.active); } catch (e) { return false; } }
  function keyName(a) {
    const dev = N.input ? N.input.device : 'keyboard';
    if (dev === 'touch') return a === 'action' ? 'ACTION' : 'RUN';
    if (dev === 'gamepad') return a === 'action' ? 'A' : 'X';
    return a === 'action' ? 'E' : 'Shift';
  }

  /* ================================================================ grounds (fields) */
  const FIELDS = new Map();      // place id -> field (aliases share one)
  let fieldList = [];
  const HOME_GROUNDS = { playground_home: 1, playground_1: 1, playground_2: 1 };
  function polyBox(poly) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of poly) { const x = p[0], y = p[1]; if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    return [a, b, c, d];
  }
  function walk(x, y) {
    const W = N.world;
    if (!W || !W.built || !isFinite(x) || !isFinite(y)) return false;
    const s = W.surfaceAt(x, y);
    return s !== N.SURF.WATER && W.isWalkable(x, y);
  }
  function stripBlocked(x0, y0, x1, y1) {
    let n = 0, b = 0;
    for (let x = x0 + 2; x < x1; x += 4) for (let y = y0 + 2; y < y1; y += 4) { n++; if (!walk(x, y)) b++; }
    return n ? b / n : 0;
  }
  function trimRect(x0, y0, x1, y1) {
    for (let it = 0; it < 40; it++) {
      const w = x1 - x0, h = y1 - y0;
      const e = [stripBlocked(x0, y0, x0 + 4, y1), stripBlocked(x1 - 4, y0, x1, y1), stripBlocked(x0, y0, x1, y0 + 4), stripBlocked(x0, y1 - 4, x1, y1)];
      let k = -1, worst = 0.3;
      for (let i = 0; i < 4; i++) { if ((i < 2 ? w : h) <= 48) continue; if (e[i] > worst) { worst = e[i]; k = i; } }
      if (k < 0) break;
      if (k === 0) x0 += 4; else if (k === 1) x1 -= 4; else if (k === 2) y0 += 4; else y1 -= 4;
    }
    return { x0, y0, x1, y1 };
  }
  /** open ground (no road, lane, footpath, water or wall): where kids can play without traffic */
  function openCell(x, y) {
    const W = N.world, SU = N.SURF;
    if (!W || !W.built) return false;
    const s = W.surfaceAt(x, y);
    return (s === SU.GROUND || s === SU.GRASS || s === SU.SAND || s === SU.PLAZA) && W.isWalkable(x, y);
  }
  /** the largest axis-aligned rectangle of open ground inside [x0, y0, x1, y1] (4 u cells), or null */
  function bestRect(x0, y0, x1, y1) {
    const C = 4, nx = Math.max(1, Math.floor((x1 - x0) / C)), ny = Math.max(1, Math.floor((y1 - y0) / C));
    if (nx * ny > 40000) return null;
    const good = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) good[j * nx + i] = openCell(x0 + (i + 0.5) * C, y0 + (j + 0.5) * C) ? 1 : 0;
    const minW = 10, minH = 9; // cells (40 x 36 u)
    let best = null, ba = 0;
    const colOk = new Uint8Array(nx);
    for (let a = 0; a < ny; a++) {
      colOk.fill(1);
      for (let b2 = a; b2 < ny; b2++) {
        for (let i = 0; i < nx; i++) if (!good[b2 * nx + i]) colOk[i] = 0;
        const h = b2 - a + 1;
        if (h < minH) continue;
        let run = 0;
        for (let i = 0; i <= nx; i++) {
          if (i < nx && colOk[i]) { run++; continue; }
          if (run >= minW) {
            const w = run, asp = Math.max(w / h, h / w), area = w * h * (asp > 3 ? 3 / asp : 1);
            if (area > ba) { ba = area; best = { x0: x0 + (i - run) * C, y0: y0 + a * C, x1: x0 + i * C, y1: y0 + (b2 + 1) * C }; }
          }
          run = 0;
        }
      }
    }
    return best;
  }
  function clearAt(x, y, r) {
    if (!walk(x, y)) return false;
    for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; if (!walk(x + Math.cos(a) * r, y + Math.sin(a) * r)) return false; }
    return true;
  }
  function spotNear(x, y, r, maxR, rect) {
    if (clearAt(x, y, r) && (!rect || inRect(rect, x, y, 0))) return { x, y };
    for (let rad = 3; rad <= (maxR || 30); rad += 3) {
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12 + rad * 0.13, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (rect && !inRect(rect, px, py, 0)) continue;
        if (clearAt(px, py, r)) return { x: px, y: py };
      }
    }
    const f = N.world && N.world.findFree ? N.world.findFree(x, y, 'walk', 20) : null;
    return f || { x, y };
  }
  function losClear(x0, y0, x1, y1) {
    const L = hyp(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(L / 3));
    for (let i = 1; i < n; i++) { const t = i / n; if (!walk(lerp(x0, x1, t), lerp(y0, y1, t))) return false; }
    return true;
  }
  function inRect(F, x, y, m) { m = m || 0; return x >= F.x0 - m && x <= F.x1 + m && y >= F.y0 - m && y <= F.y1 + m; }
  function rectDist(F, x, y) {
    const dx = x < F.x0 ? F.x0 - x : x > F.x1 ? x - F.x1 : 0, dy = y < F.y0 ? F.y0 - y : y > F.y1 ? y - F.y1 : 0;
    return hyp(dx, dy);
  }
  function clampIn(F, x, y, m) { m = m == null ? 4 : m; return { x: clamp(x, F.x0 + m, F.x1 - m), y: clamp(y, F.y0 + m, F.y1 - m) }; }
  function shortName(F) { return String(F.name || 'Colony').replace(/\s*\(.*\)\s*/g, '').replace(/\s+(colony\s+)?(ground|maidan|park ground|playground)$/i, '').trim() || 'Colony'; }

  function buildFields() {
    FIELDS.clear(); fieldList = [];
    const D = N.WORLD_DATA;
    if (!D || !N.world || !N.world.built || !N.places) return;
    const parks = {}; for (const pk of D.parks || []) parks[pk.id] = pk;
    const raws = {}; for (const rp of D.places || []) raws[rp.id] = rp;
    const decor = {};
    try { if (N.placesArt && N.placesArt.decorList) for (const d of N.placesArt.decorList()) decor[d.id] = d; } catch (e) { N.err('pg.decor', e); }
    for (const id of Object.keys(N.places)) {
      const pl = N.places[id];
      if (!pl || !(pl.kind === 'playground' || /^playground_\d+$/.test(id))) continue;
      const raw = raws[id] || {};
      const key = raw.alias && (parks[raw.alias] || N.places[raw.alias]) ? raw.alias : id;
      const had = fieldList.find((f) => f.key === key);
      if (had) { had.ids.push(id); FIELDS.set(id, had); continue; }
      try {
        const F = makeField(key, id, pl, parks[key] || parks[id], decor[key] || decor[id]);
        if (F) { fieldList.push(F); FIELDS.set(id, F); if (key !== id) FIELDS.set(key, F); }
      } catch (e) { N.err('pg.field:' + id, e); }
    }
  }
  function makeField(key, id, pl, park, dec) {
    let bb = null;
    if (park && park.poly && park.poly.length >= 3) bb = polyBox(park.poly);
    if (!bb) { const r = Math.max(30, pl.r || 34); bb = [pl.x - r * 1.5, pl.y - r * 1.2, pl.x + r * 1.5, pl.y + r * 1.2]; }
    // play on the open ground of the park (colony lanes cross some of them), else on the trimmed park
    const R = bestRect(bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4) || trimRect(bb[0] + 3, bb[1] + 3, bb[2] - 3, bb[3] - 3);
    const open = !!(R && R.x1 - R.x0 >= 40);
    const F = Object.assign(R, { key, id: key, ids: [id], name: (N.places[key] || pl).name || pl.name, place: N.places[key] || pl });
    F.w = F.x1 - F.x0; F.h = F.y1 - F.y0; F.cx = (F.x0 + F.x1) / 2; F.cy = (F.y0 + F.y1) / 2;
    if (F.w < 30 || F.h < 26) return null;
    F.long = F.w >= F.h;
    F.home = !!(HOME_GROUNDS[key] || HOME_GROUNDS[id]);
    F.open = open;
    F.decorY = dec ? dec.y : null;
    F.centre = spotNear(F.cx, F.cy, 5, 30, F);
    F.stack = spotNear(F.cx, F.cy, 7, 30, F);
    // the chalk line: across the short axis first (the gully pitch runs along the long axis)
    const ax = F.long ? 1 : 0, ay = F.long ? 0 : 1;
    const dirs = [[-ay, ax], [ay, -ax], [ax, ay], [-ax, -ay]];
    let best = null;
    for (const [ux, uy] of dirs) {
      const room = ux > 0 ? F.x1 - F.stack.x : ux < 0 ? F.stack.x - F.x0 : uy > 0 ? F.y1 - F.stack.y : F.stack.y - F.y0;
      const Dd = clamp(room - 8, 18, TUNE.lineDist);
      const lx = F.stack.x + ux * Dd, ly = F.stack.y + uy * Dd;
      if (!inRect(F, lx, ly, 0) || !clearAt(lx, ly, 4) || !losClear(F.stack.x, F.stack.y, lx, ly)) continue;
      if (!best || Dd > best.d + 3) best = { x: lx, y: ly, d: Dd, dx: -ux, dy: -uy };
      if (Dd >= TUNE.lineDist - 0.5) break;
    }
    F.line = best || { x: F.stack.x - (F.long ? 0 : 22), y: F.stack.y + (F.long ? 22 : 0), d: 22, dx: F.long ? 0 : 1, dy: F.long ? -1 : 0 };
    // the "Join" offers sit next to the gully-cricket offer (the place point) when it is on the ground
    F.anchor = inRect(F, pl.x, pl.y, 24) ? { x: pl.x, y: pl.y } : { x: F.cx, y: F.cy };
    return F;
  }
  function nearestField(x, y, maxD) {
    let best = null, bd = maxD == null ? Infinity : maxD;
    for (const F of fieldList) { const d = rectDist(F, x, y); if (d < bd) { bd = d; best = F; } }
    return best;
  }
  function edgeSpot(F, x, y, out) {
    const d = [x - F.x0, F.x1 - x, y - F.y0, F.y1 - y];
    let k = 0; for (let i = 1; i < 4; i++) if (d[i] < d[k]) k = i;
    let px = clamp(x, F.x0 + 4, F.x1 - 4), py = clamp(y, F.y0 + 4, F.y1 - 4);
    const o = out == null ? 3 : out;
    if (k === 0) px = F.x0 - o; else if (k === 1) px = F.x1 + o; else if (k === 2) py = F.y0 - o; else py = F.y1 + o;
    if (!walk(px, py)) { if (k === 0) px = F.x0 + 3; else if (k === 1) px = F.x1 - 3; else if (k === 2) py = F.y0 + 3; else py = F.y1 - 3; }
    return spotNear(px, py, 3, 12);
  }

  /* ================================================================ time windows */
  function rainy() { const f = N.flags || {}; return !!(f.raining || f.rain === true); }
  function minutes() { return N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 12 * 60; }
  /** Kids are out at the grounds: school days 16:00-18:30, holidays / Sundays 08:00-18:30, not in the rain. */
  function kidsPresent() {
    if (rainy()) return false;
    const m = minutes();
    let school = true;
    try { if (N.calendar && typeof N.calendar.isSchoolDay === 'function') school = !!N.calendar.isSchoolDay(); else school = false; } catch (e) { school = false; }
    return school ? m >= 16 * 60 && m <= 18 * 60 + 30 : m >= 8 * 60 && m <= 18 * 60 + 30;
  }
  function ganeshOn() { try { const S = N.placesArt && N.placesArt.S; return !!(S && S.ganesh); } catch (e) { return false; } }
  const confiscated = {}; // field key -> game day (a broken window: the aunty keeps the ball)
  function isConfiscated(F) { return confiscated[F.key] === ((N.clock && N.clock.day) || 0); }

  /* ================================================================ rosters */
  function friendSpec(id, o) {
    let look = null, name = id;
    try { look = N.npcs && N.npcs.look ? Object.assign({}, N.npcs.look(id)) : null; } catch (e) { look = null; }
    try { name = N.npcs && N.npcs.displayName ? N.npcs.displayName(id) : id; } catch (e) { name = id; }
    if (!look || !look.kind) look = N.people.randomLook(U.rng('pgf:' + id), 'kid');
    return Object.assign({ npc: id, name: String(name).replace(/\*/g, ''), look, speaker: id }, o || {});
  }
  function genericSpec(rng, used, girl, F) {
    const pool = girl ? GIRLS : BOYS;
    let name = pool[0];
    for (let i = 0; i < 24; i++) { name = rng.pick(pool); if (!used.has(name)) break; }
    used.add(name);
    const look = N.people.randomLook(U.rng('pgk:' + name + ':' + F.key), 'kid');
    if (girl) { look.girl = true; look.plaits = true; look.shirt = rng.pick(['#e88aa8', '#d24d57', '#f2c230', '#7a5aa8', '#2a8c82', '#f08a24']); look.cap = null; }
    return { npc: null, name, look, speaker: null };
  }
  function rosterFor(gid, F, rng, o, ambient) {
    const used = new Set(['Chinnu']);
    const ashok = F.ids.indexOf('playground_14') >= 0;
    if (ambient) {
      const n = gid === 'lingocha' ? 6 : TUNE.ambient.kids;
      const list = [];
      const free = (id) => { try { const a = N.npcs && N.npcs.get ? N.npcs.get(id) : null; return !a || a.pgKid || hyp(a.x - F.cx, a.y - F.cy) > 400; } catch (e) { return true; } };
      if (ashok && free('tiger')) list.push(friendSpec('tiger'));
      if (F.home && gid === 'marampitti' && free('ayesha')) list.push(friendSpec('ayesha'));
      while (list.length < n) list.push(genericSpec(rng, used, rng.next() < 0.3, F));
      return { list };
    }
    if (gid === 'lingocha') {
      const n = clamp((o.team | 0) || TUNE.lingocha.team, 3, 5);
      const home = [], away = [];
      const friends = F.home ? ['immu', 'ayesha', 'chitti'] : ashok ? ['immu', 'ayesha'] : ['immu'];
      for (const f of friends) if (home.length < n - 1) home.push(friendSpec(f, { dood: f === 'chitti' }));
      while (home.length < n - 1) home.push(genericSpec(rng, used, rng.next() < 0.3, F));
      let awayName;
      if (ashok) { away.push(friendSpec('tiger')); awayName = 'Ashok Nagar boys'; }
      else if (F.home) { away.push(friendSpec('bunty')); away.push(friendSpec('babloo')); awayName = 'Bunty-anna’s gang'; }
      else awayName = shortName(F) + ' kids';
      while (away.length < n) away.push(genericSpec(rng, used, rng.next() < 0.3, F));
      return { homeName: 'Chinnu XI', awayName, home, away };
    }
    const n = clamp((o.kids | 0) || TUNE.maram.kids, 6, 10) - 1;
    const list = [];
    const named = F.home ? ['immu', 'ayesha', 'babloo'] : ashok ? ['tiger', 'immu'] : ['immu'];
    for (const f of named) if (list.length < n) list.push(friendSpec(f));
    while (list.length < n) list.push(genericSpec(rng, used, rng.next() < 0.35, F));
    return { list };
  }

  /* ================================================================ the kids (entities) */
  class Kid extends N.Actor {
    constructor(o) {
      super({ kind: 'ped', x: o.x, y: o.y, r: TUNE.kidR, mass: 1, solid: false });
      this.role = 'kid'; this.pgKid = true;
      this.look = o.look; this.name = o.name; this.speaker = o.speaker || null; this.npcRef = o.npc || null;
      this.angle = o.angle || 0; this.facing = this.angle;
      this.anim = { phase: Math.random() * 3, speed: 0, run: false };
      this.barkH = 13; this.down = false; this.getupT = 0; this.idle = null; this.bench = false;
      this.emoteSt = null; this.lookTarget = null; this.P = null; this.hidden = false;
      const self = this;
      this._paint = (ctx) => { if (N.people && N.people.draw) N.people.draw(ctx, self.look, self.anim); };
      this._spr = (ctx) => {
        const D = N.draw;
        if (self.down) { D.sprite(self.x, self.y, self.angle + Math.PI / 2, 2.5, self._paint); return; }
        const out = self.P && self.P.out && !self.P.leaving;
        if (out) ctx.globalAlpha = 0.82;
        D.sprite(self.x, self.y, self.angle, out ? 5 : 7.5, self._paint);
      };
      this._shd = () => N.draw.shadow(self.x, self.y, 6, 8, self.angle, 1.4);
    }
    update() { /* moved by the playground_games sim (system pg.sim) */ }
    draw() {
      if (this.hidden) return;
      const R = N.render;
      R.queue('shadow', 0, this._shd);
      R.queue('actors', this.y, this._spr);
    }
  }

  /* ================================================================ sessions */
  let current = null;          // the real (player) game
  const leftovers = [];        // finished sessions whose kids are walking off
  const AMB = { S: null, t: 0, force: null, off: false, cool: {} };
  const BUSY = new Set();      // places_art decor sort keys of grounds taken by our games

  function newBall() { return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, state: 'rest', holder: null, thrower: null, live: false, pass: false, passTo: null, bounced: 1, releaseT: -9, seq: 0, hitSet: null }; }
  function diffFor(params) {
    const MG = N.minigames, T = (MG && MG.TUNE) || {};
    const st = settings();
    let assist = params.assist;
    if (assist == null) assist = T.assist != null ? !!T.assist : !!(st.minigameAssist || st.assist || (N.flags && N.flags.minigame_assist));
    let off = 0;
    if (T.offset != null) off = +T.offset || 0;
    else {
      const p = st.difficulty != null ? st.difficulty : st.preset;
      if (typeof p === 'number') off = p < 0 ? -0.15 : p > 0 ? 0.15 : 0;
      else off = (T.presetOffset || {})[String(p || 'normal').toLowerCase()] || 0;
    }
    const base = params.difficulty == null ? 0.4 : +params.difficulty || 0;
    return { d: clamp(base + off - (assist ? 0.15 : 0), 0.05, 0.95), assist: !!assist };
  }

  function createSession(gid, F, params, o) {
    o = o || {};
    const G = GAMES[gid];
    const seed = params.seed != null ? (typeof params.seed === 'string' ? U.strHash(params.seed) : params.seed >>> 0) : (Math.random() * 4294967295) >>> 0;
    const df = diffFor(params);
    const S = {
      id: gid, G, F, params, ambient: !!o.ambient, real: !o.ambient, resolve: o.resolve || null,
      t: 0, rng: U.rng(seed), seed, d: df.d, assist: df.assist,
      parts: [], me: null, ball: newBall(), pops: [], log: [], phase: 'setup', phaseT: 0,
      ended: false, hiddenNpcs: [], auto: null, tele: null, aimTarget: null, barkT: 2, startT: now(),
      aim: { ang: 0, p: 0, dir: 1, charging: false, holdT: 0, drag: null, yaw: null },
      ui: { label: '', prompt: '' }, title: params.title || G.title,
      stats: { hits: 0, outs: 0, catches: 0, stacked: 0, fouls: 0, tries: 0 },
    };
    S.kids = [];
    const adopt = o.adopt || [];
    S.adopt = adopt;
    G.setup(S);
    // whatever was not adopted walks off
    for (const k of adopt) { if (!k.adopted) { const P = { S, e: k, isPlayer: false, out: true, leaving: true }; k.P = P; leaveKid(k, F); } k.adopted = false; }
    S.adopt = null;
    return S;
  }

  function addPlayer(S, team) {
    const p = N.player;
    const P = mkPart(S, { e: p, isPlayer: true, name: (p && (p.nick || p.name)) || 'Chinnu', speaker: 'chinnu', team, color: TEAM_COL[0] });
    S.me = P;
    return P;
  }
  function mkPart(S, o) {
    const P = Object.assign({
      S, e: null, isPlayer: false, name: '?', speaker: null, team: 0, color: '#ffffff', out: false, outT: 0, safeT: 0, safeCD: 0,
      hold: false, holdT: 0, carry: null, act: null, actT: 0, dood: false, hits: 0, catches: 0, stacked: 0, fouls: 0,
      downT: 0, react: 0, dodgeT: 0, dodgeX: 0, dodgeY: 0, dodgeRoll: 0, tgt: null, tgtT: 0, windT: 0, spot: null,
      dvx: 0, dvy: 0, face: null, think: 0, goal: null, stone: null, catchT: -9, catchRoll: false, dashT: -9, sit: null, wander: null, role: null,
      caution: Math.random(), side: Math.random() < 0.5 ? 1 : -1,
    }, o);
    S.parts.push(P);
    return P;
  }
  function addPart(S, spec, team, x, y) {
    let k = null;
    if (S.adopt && S.adopt.length) {
      // a kid already playing here joins in: the same named kid, else a generic one
      k = S.adopt.find((q) => !q.adopted && spec.npc && q.npcRef === spec.npc) || (!spec.npc ? S.adopt.find((q) => !q.adopted && !q.npcRef) : null);
      if (k) { k.adopted = true; spec = Object.assign({}, spec, { name: k.name, look: k.look, speaker: k.speaker, npc: k.npcRef }); }
    }
    if (!k) {
      const sp = spotNear(x, y, 3, 16);
      k = new Kid({ x: sp.x, y: sp.y, look: spec.look, name: spec.name, speaker: spec.speaker, npc: spec.npc, angle: Math.atan2(S.F.cy - sp.y, S.F.cx - sp.x) });
      N.entities.add(k);
    }
    k.down = false; k.getupT = 0; k.idle = null; k.hidden = false; k.emoteSt = null;
    const P = mkPart(S, { e: k, name: spec.name, speaker: spec.speaker, npc: spec.npc, team, dood: !!spec.dood, color: TEAM_COL[team] || '#ffffff' });
    k.P = P;
    S.kids.push(k);
    if (spec.npc) hideDouble(S, spec.npc);
    return P;
  }
  function hideDouble(S, id) {
    try {
      const a = N.npcs && N.npcs.get ? N.npcs.get(id) : null;
      if (!a || a.pgKid || a.vehicle || hyp(a.x - S.F.cx, a.y - S.F.cy) > 320) return;
      S.hiddenNpcs.push({ a, hidden: a.hidden, solid: a.solid });
      a.hidden = true; a.solid = false;
    } catch (e) { N.err('pg.hideDouble', e); }
  }
  function restoreDoubles(S) {
    for (const h of S.hiddenNpcs) { try { if (h.a && h.a.alive !== false) { h.a.hidden = h.hidden; h.a.solid = h.solid; } } catch (e) { /* ignore */ } }
    S.hiddenNpcs.length = 0;
  }
  function leaveKid(k, F) {
    if (!k || k.alive === false) return;
    k.leaving = true; k.down = false; k.getupT = 0; k.idle = null;
    const P = k.P || { e: k };
    P.leaving = true; P.out = true;
    // walk off the ground the short way, then vanish
    const d = [k.x - F.x0, F.x1 - k.x, k.y - F.y0, F.y1 - k.y];
    let i = 0; for (let j = 1; j < 4; j++) if (d[j] < d[i]) i = j;
    const tx = i === 0 ? F.x0 - 60 : i === 1 ? F.x1 + 60 : k.x, ty = i === 2 ? F.y0 - 60 : i === 3 ? F.y1 + 60 : k.y;
    P.goal = { x: tx, y: ty }; P.leaveT = 0; P.S = P.S || null;
    if (leftKids.indexOf(k) < 0) leftKids.push(k);
  }
  const leftKids = [];

  function log(S, type, data) {
    const ev = Object.assign({ t: +S.t.toFixed(2), type }, data || {});
    S.log.push(ev); if (S.log.length > (S.logMax || 400)) S.log.shift();
    if (S.real) { try { N.emit('minigame:event', { id: S.id, type, data: ev, inWorld: true }); } catch (e) { /* ignore */ } }
    return ev;
  }
  function pop(S, x, y, h, text, col, big) {
    h = h || 9;
    // stack pops that land on the same spot at the same moment ("THWACK!" then "OUT!")
    for (const q of S.pops) if (q.t < 0.6 && Math.abs(q.x - x) < 8 && Math.abs(q.y - y) < 8 && Math.abs(q.h - h) < 4) h = q.h + 5;
    S.pops.push({ x, y, h, text, col: col || '#f4ead8', t: 0, life: big ? 1.6 : 1.1, big: !!big, el: null });
    if (S.pops.length > 8) { const o = S.pops.shift(); if (o.el) o.el.remove(); }
  }
  function bark(S, P, text, o) {
    if (!P || !P.e || !text) return;
    // one voice at a time on the ground (the big moments always get through)
    if (!(o && o.force) && S.t - (S.barkAt || -9) < 0.9) return;
    S.barkAt = S.t;
    if (S.ambient) {
      const p = N.player;
      if (!p || hyp(p.x - P.e.x, p.y - P.e.y) > 220) return;
    }
    try {
      if (!N.dialogue || !N.dialogue.bark) return;
      const opts = Object.assign({ secs: 1.6 }, o || {});
      if (P.speaker) opts.speaker = P.speaker; else { opts.name = false; opts.color = P.color; }
      if (P.isPlayer) { opts.speaker = 'you'; }
      N.dialogue.bark(P.e, text, opts);
    } catch (e) { N.err('pg.bark', e); }
  }
  const pick = (S, arr) => arr[Math.floor(S.rng.next() * arr.length) % arr.length];

  /* ================================================================ movement */
  function speedOf(S, P, run) {
    let sp = run ? TUNE.kidRun + TUNE.kidRunD * S.d : TUNE.kidWalk;
    if (P.dood) sp *= 0.72;
    if (P.carry) sp = Math.min(sp, TUNE.kidWalk * 1.1) * TUNE.carryMul;
    if (P.hold) sp = Math.min(sp, TUNE.kidWalk * TUNE.holdWalk);
    return sp;
  }
  function goTo(P, x, y, sp, arrive) {
    const e = P.e, dx = x - e.x, dy = y - e.y, d = hyp(dx, dy);
    const a = arrive == null ? 2 : arrive;
    if (d < a) { P.dvx = 0; P.dvy = 0; return d; }
    const s = Math.min(sp, d * 6);
    P.dvx = (dx / d) * s; P.dvy = (dy / d) * s;
    return d;
  }
  function halt(P) { P.dvx = 0; P.dvy = 0; }
  function moveKid(S, P, dt) {
    const e = P.e;
    if (!e || e.alive === false || P.isPlayer) return;
    if (P.downT > 0) {
      P.downT -= dt; e.vx *= Math.exp(-dt * 6); e.vy *= Math.exp(-dt * 6);
      if (P.downT <= 0) { e.down = false; e.getupT = 0.45; }
    } else {
      if (e.getupT > 0) { e.getupT -= dt; P.dvx = P.dvy = 0; }
      const k = 1 - Math.exp(-dt * 10);
      e.vx += (P.dvx - e.vx) * k; e.vy += (P.dvy - e.vy) * k;
    }
    // a vehicle shoved us (vehicles.js sets knockT on people): fall over, comically
    if (e.knockT > 0 && !e.down) { e.down = true; P.downT = Math.max(P.downT, 0.8); }
    if (e.knockT > 0) e.knockT -= dt;
    const W = N.world;
    const c = W.collide(e.x + e.vx * dt, e.y + e.vy * dt, e.r, 'walk');
    if (c.bad) { e.vx = e.vy = 0; }
    else {
      if (c.hit) { const dot = e.vx * c.nx + e.vy * c.ny; if (dot < 0) { e.vx -= dot * c.nx; e.vy -= dot * c.ny; } }
      e.x = c.x; e.y = c.y;
    }
    const sp = hyp(e.vx, e.vy);
    if (e.down) { e.anim.speed = 0; return; }
    if (P.face != null && sp < 20) e.angle += adiff(e.angle, P.face) * Math.min(1, dt * 12);
    else if (sp > 3) e.angle += adiff(e.angle, Math.atan2(e.vy, e.vx)) * Math.min(1, dt * 12);
    e.facing = e.angle;
    if (sp > 3) { e.anim.speed = Math.min(1, sp / 45); e.anim.run = sp > 58; e.anim.phase += sp * dt * (e.anim.run ? 0.2 : 0.26); }
    else { e.anim.speed = 0; e.anim.run = false; e.anim.phase *= 0.85; }
    if (e.emoteSt) { e.emoteSt.t += dt; if (e.emoteSt.t > e.emoteSt.secs) e.emoteSt = null; }
  }
  function separate(S) {
    const L = S.parts;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.e || a.e.alive === false || (a.out && !a.isPlayer)) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.e || b.e.alive === false || (b.out && !b.isPlayer)) continue;
        const dx = b.e.x - a.e.x, dy = b.e.y - a.e.y, d = hyp(dx, dy), m = a.e.r + b.e.r - 0.6;
        if (d >= m || d < 1e-4) continue;
        const push = (m - d) * 0.5, nx = dx / d, ny = dy / d;
        // the player is never shoved by the kids (they make way)
        if (a.isPlayer) moveBy(b, nx * push * 2, ny * push * 2);
        else if (b.isPlayer) moveBy(a, -nx * push * 2, -ny * push * 2);
        else { moveBy(a, -nx * push, -ny * push); moveBy(b, nx * push, ny * push); }
      }
    }
  }
  function moveBy(P, dx, dy) { const e = P.e; const c = N.world.collide(e.x + dx, e.y + dy, e.r, 'walk'); if (!c.bad) { e.x = c.x; e.y = c.y; } }
  function px(P) { return P.e.x; }
  function py(P) { return P.e.y; }
  function pdist(A, B) { return hyp(A.e.x - B.e.x, A.e.y - B.e.y); }

  /* ================================================================ the ball */
  function holdPos(P) {
    const e = P.e, a = P.isPlayer ? (e.facing != null ? e.facing : e.angle) : e.angle;
    return { x: e.x + Math.cos(a + 0.5) * 2.4, y: e.y + Math.sin(a + 0.5) * 2.4, z: 4.0 };
  }
  function give(S, P) {
    const b = S.ball;
    for (const Q of S.parts) Q.hold = false;
    b.state = 'held'; b.holder = P; b.thrower = null; b.live = false; b.pass = false; b.passTo = null; b.bounced = 1;
    P.hold = true; P.holdT = 0; P.windT = 0;
    const h = holdPos(P); b.x = h.x; b.y = h.y; b.z = h.z; b.vx = b.vy = b.vz = 0;
  }
  function drop(S, P) {
    const b = S.ball;
    if (b.holder !== P) return;
    P.hold = false; b.holder = null; b.state = 'air'; b.vz = 6; b.vx = (S.rng.next() - 0.5) * 20; b.vy = (S.rng.next() - 0.5) * 20; b.live = false; b.bounced = 1; b.thrower = null;
  }
  function release(S, P, ang, speed, vz, o) {
    o = o || {};
    const b = S.ball;
    for (const Q of S.parts) Q.hold = false;
    const e = P.e;
    b.state = 'air'; b.holder = null; b.thrower = P; b.live = !o.pass && !o.dead; b.pass = !!o.pass; b.passTo = o.passTo || null;
    b.bounced = 0; b.releaseT = S.t; b.seq++; b.hitSet = new Set(); b.kind = o.kind || 'throw';
    b.x = e.x + Math.cos(ang) * 2.4; b.y = e.y + Math.sin(ang) * 2.4; b.z = TUNE.hand;
    b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed; b.vz = vz;
    if (!P.isPlayer) { e.angle = ang; } else { e.angle = e.facing = ang; }
    P.hold = false; P.windT = 0; P.holdT = 0;
    S.tele = null;
    sfx('chappal_whoosh', { x: e.x, y: e.y, vol: 0.7, pitch: 1.3 });
    // every kid gets a reaction time to this throw (AI dodging) and a catch roll; the kid it was aimed at
    // may have read the wind-up and jukes at once (the thrower led the old run)
    b.target = o.target || null;
    for (const Q of S.parts) {
      if (Q.isPlayer || Q === P) continue;
      Q.react = S.t + lerp(0.34, 0.12, S.d) * (0.8 + S.rng.next() * 0.5);
      Q.dodgeRoll = S.real && PG.debug.assist.noDodge ? 0 : S.rng.next() < lerp(TUNE.lingocha.dodge[0], TUNE.lingocha.dodge[1], S.d) ? 1 : 0;
      Q.catchRoll = S.id === 'marampitti' && !(S.real && PG.debug.assist.noDodge) && S.rng.next() < 0.08 + 0.1 * S.d;
      if (Q === b.target && b.live && !Q.out && Q.downT <= 0) {
        // busy hands (picking / stacking) drop the job to duck only some of the time
        if (Q.act && Q.dodgeRoll && S.rng.next() < 0.55) { Q.act = null; Q.actStone = null; juke(S, Q, P); }
        else if (!Q.act && Q.dodgeRoll) juke(S, Q, P);
      }
    }
    if (!o.quiet) log(S, o.pass ? 'pass' : o.kind === 'stack' ? 'stack_throw' : 'throw', { by: P.name, speed: Math.round(speed), at: b.target ? b.target.name : null, busy: !!(b.target && b.target.act), juke: !!(b.target && b.target.dodgeT > 0) });
  }
  /** sidestep across the line of a throw from P */
  function juke(S, Q, P) {
    const e = Q.e;
    let dx = e.x - P.e.x, dy = e.y - P.e.y; const l = hyp(dx, dy) || 1; dx /= l; dy /= l;
    let side = S.rng.next() < 0.5 ? 1 : -1;
    let ux = -dy * side, uy = dx * side;
    if (!walk(e.x + ux * 10, e.y + uy * 10) || !inRect(S.F, e.x + ux * 10, e.y + uy * 10, 6)) { ux = -ux; uy = -uy; }
    const sp = speedOf(S, Q, true) * 1.15;
    Q.dodgeX = ux * sp; Q.dodgeY = uy * sp; Q.dodgeT = 0.34; Q.dodgeRoll = 0;
    Q.dvx = Q.dodgeX; Q.dvy = Q.dodgeY;
  }
  /** Throw at a point (tz: height to arrive at) with an aim error (radians). */
  function launchAt(S, P, tx, ty, tz, speed, errA, o) {
    const e = P.e, d = Math.max(4, hyp(tx - e.x, ty - e.y));
    const ang = Math.atan2(ty - e.y, tx - e.x) + gauss(S.rng) * (errA || 0);
    const t = Math.max(0.08, d / speed);
    const vz = clamp((tz - TUNE.hand) / t + 0.5 * TUNE.g * t, -30, 140);
    release(S, P, ang, speed, vz, o);
  }
  function canGrab(S, b) {
    if (b.state === 'held') return false;
    if (S.id === 'marampitti') return b.state !== 'air' || b.bounced > 0;   // must bounce first
    return b.state !== 'air' || (!b.live && b.z < 3.5);
  }
  /** where a ball in the air comes down */
  function landing(b) {
    const g = TUNE.g, vz = b.vz, z = Math.max(0, b.z);
    const t = (vz + Math.sqrt(Math.max(0, vz * vz + 2 * g * z))) / g;
    return { x: b.x + b.vx * t, y: b.y + b.vy * t };
  }
  /** an easy lob from (x, y) into P's hands (the keeper returning the ball to the line) */
  function lob(S, x, y, P) {
    const b = S.ball;
    if (b.holder) b.holder.hold = false;
    const tx = P.e.x, ty = P.e.y, d = Math.max(2, hyp(tx - x, ty - y)), t = clamp(d / 70, 0.45, 1.1);
    Object.assign(b, { state: 'air', holder: null, thrower: null, live: false, pass: true, passTo: P, bounced: 1, x, y, z: Math.max(1, b.z), hitSet: new Set() });
    b.vx = (tx - x) / t; b.vy = (ty - y) / t; b.vz = (3.5 - b.z) / t + 0.5 * TUNE.g * t;
  }
  function solidCell(x, y) {
    const W = N.world, s = W.surfaceAt(x, y), SU = N.SURF;
    return s === SU.SOLID || s === SU.ROCK || s === SU.VOID;
  }
  function ballStep(S, dt) {
    const b = S.ball;
    if (b.state === 'held') {
      const h = b.holder;
      if (!h || (h.out && !h.isPlayer) || !h.e || h.e.alive === false) { b.state = 'rest'; b.holder = null; if (h) h.hold = false; return; }
      const q = holdPos(h); b.x = q.x; b.y = q.y; b.z = q.z; b.vx = b.vy = b.vz = 0;
      return;
    }
    if (b.state === 'rest') return;
    const sp = hyp(b.vx, b.vy, b.vz);
    const n = clamp(Math.ceil((sp * dt) / 2.2), 1, 10), h = dt / n;
    for (let i = 0; i < n; i++) {
      subStep(S, b, h);
      if (b.state === 'held' || b.state === 'rest' || S.ended) break;
    }
  }
  function subStep(S, b, h) {
    const F = S.F;
    if (b.state === 'air') b.vz -= TUNE.g * h;
    let nx = b.x + b.vx * h, ny = b.y + b.vy * h;
    const nz = b.state === 'air' ? b.z + b.vz * h : 0;
    // walls and houses (SOLID / ROCK / out of the map); water swallows it
    if (solidCell(nx, b.y)) { if (wallHit(S, b, nx, b.y, nz)) return; b.vx = -b.vx * TUNE.wallE; nx = b.x; sfx('bump', { x: b.x, y: b.y, vol: 0.25, pitch: 1.7 }); }
    if (solidCell(nx, ny)) { if (wallHit(S, b, nx, ny, nz)) return; b.vy = -b.vy * TUNE.wallE; ny = b.y; sfx('bump', { x: b.x, y: b.y, vol: 0.25, pitch: 1.7 }); }
    if (N.world.surfaceAt(nx, ny) === N.SURF.WATER && nz < 1) { b.state = 'rest'; b.vx = b.vy = b.vz = 0; b.x = nx; b.y = ny; b.z = 0; b.lost = true; log(S, 'ball_water'); return; }
    // the boundary bricks / kerb keep a low ball on the ground
    const m = TUNE.kerbM;
    if (nz < 1.6 && inRect(F, b.x, b.y, m)) {
      if ((nx < F.x0 - m && b.vx < 0) || (nx > F.x1 + m && b.vx > 0)) { b.vx = -b.vx * TUNE.kerb; nx = b.x; }
      if ((ny < F.y0 - m && b.vy < 0) || (ny > F.y1 + m && b.vy > 0)) { b.vy = -b.vy * TUNE.kerb; ny = b.y; }
    }
    b.x = nx; b.y = ny; b.z = nz;
    if (b.state === 'air' && b.z <= 0) {
      b.z = 0;
      const wasLive = b.live;
      b.live = false; b.pass = false; b.passTo = null;
      if (b.vz < -18) {
        b.vz = -b.vz * TUNE.bounce; b.vx *= TUNE.bounceFric; b.vy *= TUNE.bounceFric;
        // a colony ground is not a cricket pitch: every bounce kicks the ball a little off line
        const s = hyp(b.vx, b.vy);
        if (s > 1) { const a = Math.atan2(b.vy, b.vx) + gauss(S.rng) * TUNE.bumpy * (1 - Math.min(1, s / 260)); b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s; }
        sfx('bump', { x: b.x, y: b.y, vol: 0.35, pitch: 1.9 });
      } else { b.vz = 0; b.state = 'roll'; }
      b.bounced++;
      if (b.bounced === 1) { log(S, 'bounce', { live: wasLive }); if (S.G.onBounce) S.G.onBounce(S, b, wasLive); }
    }
    if (b.state === 'roll') {
      const s = hyp(b.vx, b.vy), dec = (TUNE.rollFric + TUNE.rollDrag * s) * h;
      if (s <= dec || s < 2.5) { b.vx = b.vy = 0; b.state = 'rest'; }
      else { const k = (s - dec) / s; b.vx *= k; b.vy *= k; }
    }
    contacts(S, b);
  }
  function wallHit(S, b, x, y, z) {
    const sp = hyp(b.vx, b.vy);
    if (!S.real || S.ended || !b.thrower || !b.thrower.isPlayer || z < 4.2 || sp < 95 || inRect(S.F, x, y, 2)) return false;
    // a house beside the ground, at window height: KHANNN.
    let house = null;
    try { N.world.queryStructures(x - 2, y - 2, x + 2, y + 2, (s) => { if (s.t === 'bldg' && !house && x >= s.x0 - 1 && x <= s.x1 + 1 && y >= s.y0 - 1 && y <= s.y1 + 1) house = s; }); } catch (e) { house = null; }
    if (!house || (house.h && z > house.h * 1.5 + 4)) return false;
    windowBreak(S, b.x, b.y, b.thrower);
    return true;
  }
  /** Ball vs people / the stack / passers-by. */
  function contacts(S, b) {
    if (b.state === 'held' || S.ended) return;
    // a pass into the receiver's hands (or the keeper lobbing it back)
    if (b.passTo && b.z < 8) {
      const R = b.passTo;
      if (R.e && !R.out && hyp(R.e.x - b.x, R.e.y - b.y) < 4.8) { give(S, R); if (S.G.onCaughtPass) S.G.onCaughtPass(S, R); return; }
    }
    if (S.G.ballStack) S.G.ballStack(S, b);
    if (b.state !== 'air') return;
    if (b.live) {
      for (const P of S.parts) {
        if (P === b.thrower || P.out || !P.e || P.e.alive === false || b.hitSet.has(P)) continue;
        const dx = P.e.x - b.x, dy = P.e.y - b.y;
        if (dx * dx + dy * dy > TUNE.hitR * TUNE.hitR) continue;
        if (b.z < 0.15 || b.z - TUNE.ballR > TUNE.bodyTop) continue;
        b.hitSet.add(P);
        if (S.G.onHit(S, P, b)) return;
      }
    }
    // passers-by (adults): a little Chappal Meter when it was Chinnu's ball
    if (b.thrower && b.seq !== b.adultSeq && hyp(b.vx, b.vy) > 60 && b.z > 0.8 && b.z < 8) {
      let hitE = null;
      try {
        N.entities.query(b.x, b.y, 6, (q) => {
          if (hitE || !q || q.pgKid || q === N.player || q.vehicle || q.hidden || (q.kind !== 'ped' && q.kind !== 'npc')) return false;
          if (hyp(q.x - b.x, q.y - b.y) > 4) return false;
          if (q.__pgHitT && S.t - q.__pgHitT < 6 && q.__pgHitS === S) return false;
          hitE = q; return true;
        });
      } catch (e) { hitE = null; }
      if (hitE) { b.adultSeq = b.seq; hitE.__pgHitT = S.t; hitE.__pgHitS = S; adultHit(S, b, hitE); }
    }
  }
  function isAdultLook(l) { return !!l && /^(man|woman|uncle|aunty|saree|burqa|lungi|police)$/.test(l.kind || 'man'); }
  function adultHit(S, b, q) {
    S.adultT = S.t;
    b.vx *= -0.3; b.vy *= -0.3; b.vz = Math.max(b.vz, 10); b.live = false;
    sfx('chappal', { x: q.x, y: q.y, vol: 0.8 });
    const adult = isAdultLook(q.look) || q.kind === 'npc';
    try { if (N.dialogue && N.dialogue.bark) N.dialogue.bark(q, pick(S, adult ? BARK.adult : ['Oye!', '*Arre*, careful!']), { secs: 1.8, name: false }); } catch (e) { /* ignore */ }
    const mine = b.thrower && b.thrower.isPlayer && S.real;
    log(S, 'adult_hit', { adult, heat: mine && adult, who: (q.npcId || q.role || (q.look && q.look.kind) || q.kind) });
    if (mine && adult) { try { if (N.wanted && N.wanted.addHeat) N.wanted.addHeat(TUNE.heat.adult, 'ball'); } catch (e) { N.err('pg.heat', e); } }
  }
  function windowBreak(S, x, y, P) {
    const b = S.ball;
    b.state = 'rest'; b.vx = b.vy = b.vz = 0; b.x = x; b.y = y; b.z = 0; b.hiddenBall = true;
    sfx('crash', { x, y, vol: 1 }); sfx('bangles', { x, y, vol: 0.9, pitch: 1.6, delay: 0.05 });
    try { if (N.render && N.render.shake && !document.body.classList.contains('reduced-motion')) N.render.shake(0.35, 0.25); } catch (e) { /* ignore */ }
    pop(S, x, y, 12, 'KHANNN!', '#9fe0ff', true);
    try { if (N.dialogue && N.dialogue.bark) N.dialogue.bark({ x, y, alive: true }, BARK.window, { speaker: 'aunty', secs: 3.4, h: 18 }); } catch (e) { /* ignore */ }
    log(S, 'window', { by: P ? P.name : null });
    const mine = P && P.isPlayer;
    if (mine) { try { if (N.wanted && N.wanted.addHeat) N.wanted.addHeat(TUNE.heat.window, 'window'); } catch (e) { N.err('pg.heat', e); } }
    confiscated[S.F.key] = (N.clock && N.clock.day) || 0;
    // everybody scatters; the aunty keeps the ball; the game is over
    for (const Q of S.parts) if (!Q.isPlayer && Q.e) { Q.out = true; Q.scatter = true; }
    if (S.real) {
      banner('KHANNN!', 'Window broken. The aunty kept the ball. Game over!', 3000, 'fail');
      S.endAt = S.t + 1.6; S.endWin = false; S.endExtra = { reason: 'window', window: true };
    } else { S.restartAt = S.t + 6; }
  }
  function knockDown(S, P, b) {
    const e = P.e;
    sfx('chappal', { x: e.x, y: e.y, vol: 0.9, pitch: 1.1 });
    pop(S, e.x, e.y, 10, 'THWACK!', '#ffd84a');
    if (!P.isPlayer) { e.down = true; P.downT = 0.7; const s = hyp(b.vx, b.vy) || 1; e.vx = (b.vx / s) * 30; e.vy = (b.vy / s) * 30; }
    else {
      try { if (N.render && N.render.shake && !document.body.classList.contains('reduced-motion')) N.render.shake(0.18, 0.15); } catch (e2) { /* ignore */ }
      const p = N.player, s = hyp(b.vx, b.vy) || 1; p.vx += (b.vx / s) * 40; p.vy += (b.vy / s) * 40;
    }
    // the ball pops off the kid
    b.vx *= -0.22; b.vy *= -0.22; b.vz = 16; b.live = false; b.z = Math.max(b.z, 2);
  }
  function sitSpot(S, P) {
    if (!P.sit) P.sit = edgeSpot(S.F, P.e.x, P.e.y, 4);
    return P.sit;
  }
  function goSit(S, P, dt) {
    const e = P.e, s = sitSpot(S, P);
    const d = goTo(P, s.x, s.y, TUNE.kidWalk, 1.5);
    if (d < 2) { e.idle = 'sit'; P.face = Math.atan2(S.F.cy - e.y, S.F.cx - e.x); } else e.idle = null;
    void dt;
  }
  function setOut(S, P, by, why) {
    if (P.out) return;
    P.out = true; P.outT = S.t; P.windT = 0; P.act = null;
    if (P.hold) { drop(S, P); }
    if (P.carry) { const st = P.carry; P.carry = null; st.state = 'loose'; st.by = null; st.claim = null; st.x = P.e.x; st.y = P.e.y; st.z = 0; }
    S.stats.outs += P.isPlayer ? 1 : 0;
    if (by && by.isPlayer && S.real) S.stats.hits++;
    if (by) by.hits++;
    pop(S, P.e.x, P.e.y, 13, 'OUT!', '#ff7a6a', true);
    sfx('howzat', { x: P.e.x, y: P.e.y, vol: 0.6 });
    const shouter = by && !by.isPlayer ? by : S.parts.find((q) => !q.isPlayer && !q.out && q !== P && q.team === (by ? by.team : -1)) || by;
    if (shouter) bark(S, shouter, pick(S, BARK.out));
    log(S, 'out', { name: P.name, me: !!P.isPlayer, by: by ? by.name : null, why: why || 'hit' });
  }

  /* ================================================================ LINGOCHA */
  const LING = {
    id: 'lingocha', title: 'Lingocha', sub: 'Seven stones · best of 3',
    setup(S) {
      const p = S.params, F = S.F;
      const L = (S.L = { round: 0, wins: [0, 0], hist: [], tries: 0, knocked: false, timer: 0, seek: 0, base: F.stack, line: F.line, thrower: null });
      L.rounds = clamp((p.rounds | 0) || TUNE.lingocha.rounds, 1, 5);
      if (L.rounds % 2 === 0) L.rounds++;
      L.need = Math.floor(L.rounds / 2) + 1;
      L.stones = TUNE.stoneR.map((r, i) => ({ i, r, col: TUNE.stoneCols[i], x: L.base.x, y: L.base.y, z: 0, vx: 0, vy: 0, vz: 0, state: 'stack', by: null, claim: null, rot: i * 1.7 }));
      L.stack = L.stones.slice();
      const R = rosterFor('lingocha', F, S.rng, p, S.ambient);
      if (S.ambient) {
        S.teamName = ['', ''];
        R.list.forEach((spec, i) => { const q = edgeSpot(F, F.cx + (S.rng.next() - 0.5) * F.w, F.cy + (S.rng.next() - 0.5) * F.h, -6); addPart(S, spec, i % 2, q.x, q.y); });
        L.seek = S.rng.next() < 0.5 ? 0 : 1;
      } else {
        S.teamName = [R.homeName, R.awayName];
        addPlayer(S, 0);
        const pl = N.player;
        R.home.forEach((spec, i) => addPart(S, spec, 0, pl.x + Math.cos(i * 2.1) * 14, pl.y + Math.sin(i * 2.1) * 14));
        R.away.forEach((spec, i) => { const q = edgeSpot(F, F.cx + (i - 1.5) * 14, F.cy, -6); addPart(S, spec, 1, q.x, q.y); });
        L.seek = p.seekFirst === false ? 1 : 0;
      }
      LING.startRound(S);
    },
    liveTime(S) { return S.params.liveTime > 0 ? +S.params.liveTime : lerp(TUNE.lingocha.live[0], TUNE.lingocha.live[1], S.d); },
    seekers(S) { return S.parts.filter((P) => P.team === S.L.seek); },
    hitters(S) { return S.parts.filter((P) => P.team !== S.L.seek); },
    startRound(S) {
      const L = S.L, F = S.F;
      L.round++; L.tries = 0; L.knocked = false; L.timer = LING.liveTime(S); L.shouted = false;
      if (L.round > 1) log(S, 'role_swap', { seek: L.seek === 0 ? 'home' : 'away', round: L.round });
      for (const st of L.stones) { st.state = 'stack'; st.by = null; st.claim = null; st.x = L.base.x; st.y = L.base.y; st.z = 0; st.vx = st.vy = st.vz = 0; }
      L.stack = L.stones.slice();
      const ln = L.line, ux = ln.dx, uy = ln.dy, vx = -uy, vy = ux; // u: line -> stack, v: along the line
      const seek = LING.seekers(S), hit = LING.hitters(S);
      for (const P of S.parts) {
        P.out = false; P.safeT = 0; P.safeCD = 0; P.carry = null; P.hold = false; P.act = null; P.windT = 0; P.sit = null; P.stone = null; P.role = null; P.face = null;
        if (P.e && !P.isPlayer) { P.e.idle = null; P.e.down = false; P.downT = 0; }
      }
      // throwers: Chinnu when his team seeks (a real game), else the seekers in turn
      L.throwers = S.me && S.me.team === L.seek ? [S.me] : seek.filter((P) => !P.dood);
      seek.forEach((P, i) => {
        const off = (i - (seek.length - 1) / 2) * 7;
        const q = clampIn(F, ln.x - ux * 6 + vx * off, ln.y - uy * 6 + vy * off, 3);
        P.spot = spotNear(q.x, q.y, 3, 12, F);
      });
      const thrower = L.throwers[0] || seek[0];
      if (thrower) thrower.spot = { x: ln.x, y: ln.y };
      const away = Math.atan2(uy, ux);
      hit.forEach((P, i) => {
        let q;
        if (i === 0) { P.role = 'keeper'; q = { x: L.base.x + ux * 11, y: L.base.y + uy * 11 }; }
        else { const a = away + (i % 2 ? 1 : -1) * (1.0 + Math.floor((i - 1) / 2) * 0.55); q = { x: L.base.x + Math.cos(a) * 24, y: L.base.y + Math.sin(a) * 24 }; P.role = i === 1 ? 'guard' : 'mark'; }
        q = clampIn(F, q.x, q.y, 4);
        P.spot = spotNear(q.x, q.y, 3, 12, F);
      });
      L.thrower = thrower;
      if (thrower) give(S, thrower);
      S.phase = 'setup'; S.phaseT = 0;
      if (S.me) {
        const sp = S.me.spot;
        S.auto = sp && hyp(sp.x - N.player.x, sp.y - N.player.y) > 4 ? { x: sp.x, y: sp.y, t: 0, face: Math.atan2(L.base.y - sp.y, L.base.x - sp.x) } : null;
        const mine = S.me.team === L.seek;
        banner('Round ' + L.round + ' of ' + L.rounds, (mine ? S.teamName[0] + ' SEEK — knock it down, then restack!' : S.teamName[0] + ' HIT — stop them restacking!'), 2200, 'info');
        sfx('whistle', { ui: true, vol: 0.7 });
      }
      log(S, 'round', { round: L.round, seek: L.seek === 0 ? 'home' : 'away', thrower: thrower ? thrower.name : null });
    },
    update(S, dt) {
      const L = S.L, b = S.ball;
      S.phaseT += dt;
      for (const P of S.parts) { if (P.safeT > 0) P.safeT -= dt; if (P.safeCD > 0) P.safeCD -= dt; }
      switch (S.phase) {
        case 'setup': {
          const ready = S.parts.every((P) => P.isPlayer || !P.spot || hyp(P.e.x - P.spot.x, P.e.y - P.spot.y) < 4);
          const late = S.phaseT > 4.5;
          if ((ready && !S.auto && S.phaseT > 1.2) || late) {
            if (late && S.auto) S.auto = null;
            S.phase = 'aim'; S.phaseT = 0; S.aim.charging = false; S.aim.p = 0; S.aim.yaw = null;
            S.aim.ang = Math.atan2(L.base.y - L.line.y, L.base.x - L.line.x);
          }
          break;
        }
        case 'aim': {
          const T = L.thrower;
          if (!T) { LING.endRound(S, 1 - L.seek, 'tries'); break; }
          if (b.holder !== T) give(S, T);
          if (!T.isPlayer) {
            T.face = Math.atan2(L.base.y - T.e.y, L.base.x - T.e.x);
            if (S.phaseT > 1.3 + (S.seed % 7) * 0.08) LING.aiStackThrow(S, T);
          }
          break;
        }
        case 'flight': {
          if (L.knocked) { S.phase = 'scatter'; S.phaseT = 0; break; }
          const sp = hyp(b.vx, b.vy);
          if (S.phaseT > 3 || b.state === 'rest' || (b.state === 'roll' && sp < 14) || rectDist(S.F, b.x, b.y) > 40) {
            L.tries++; S.stats.tries += L.thrower && L.thrower.isPlayer ? 1 : 0;
            log(S, 'try_miss', { tries: L.tries });
            const nearH = LING.hitters(S)[0];
            if (nearH) bark(S, nearH, pick(S, BARK.miss));
            if (L.tries >= TUNE.lingocha.tries) { LING.endRound(S, 1 - L.seek, 'tries'); break; }
            // the keeper lobs it back to the next thrower
            const prev = L.thrower;
            L.thrower = L.throwers[L.tries % Math.max(1, L.throwers.length)] || prev;
            if (L.thrower && !L.thrower.isPlayer) {
              if (prev && prev !== L.thrower && !prev.isPlayer) prev.spot = spotNear(L.line.x - L.line.dx * 6 + (S.rng.next() - 0.5) * 10, L.line.y - L.line.dy * 6, 3, 12, S.F);
              L.thrower.spot = { x: L.line.x, y: L.line.y };
            }
            if (L.thrower) lob(S, b.x, b.y, L.thrower);
            S.phase = 'return'; S.phaseT = 0;
          }
          break;
        }
        case 'return': {
          const T = L.thrower;
          if (!T) { LING.endRound(S, 1 - L.seek, 'tries'); break; }
          if (b.holder === T || S.phaseT > 1.8) {
            if (b.holder !== T) give(S, T);
            S.aim.charging = false; S.aim.p = 0;
            const far = hyp(T.e.x - L.line.x, T.e.y - L.line.y) > 4;
            if (far && T.isPlayer) S.auto = { x: L.line.x, y: L.line.y, t: 0, face: Math.atan2(L.base.y - L.line.y, L.base.x - L.line.x) };
            S.phase = far ? 'setup' : 'aim'; S.phaseT = 0;
            if (!far) S.aim.ang = Math.atan2(L.base.y - L.line.y, L.base.x - L.line.x);
          }
          break;
        }
        case 'scatter': {
          if (S.phaseT > TUNE.lingocha.scatter) { S.phase = 'live'; S.phaseT = 0; L.liveT0 = S.t; log(S, 'live'); }
          break;
        }
        case 'live': {
          if (!(S.real && PG.debug.assist.noTimer)) L.timer -= dt;
          if (L.stack.length >= 7 && !L.shouted) { LING.shout(S, L.lastStacker); break; }
          const count = LING.seekers(S).filter((P) => !P.dood);
          if (count.length && count.every((P) => P.out)) { LING.endRound(S, 1 - L.seek, 'allout'); break; }
          if (L.timer <= 0) { LING.endRound(S, 1 - L.seek, 'time'); break; }
          LING.touches(S);
          if ((b.state === 'rest' || b.state === 'roll') && !b.holder) {
            for (const P of LING.seekers(S)) {
              if (P.isPlayer || P.out || P.carry || !P.e) continue;
              if (hyp(b.x - P.e.x, b.y - P.e.y) < P.e.r + TUNE.ballR + 0.6 && hyp(P.e.vx, P.e.vy) > 30) { kick(S, P); break; }
            }
          }
          break;
        }
        case 'roundEnd': {
          if (S.phaseT > 2.8) {
            if (S.real && (L.wins[0] >= L.need || L.wins[1] >= L.need || L.round >= L.rounds)) {
              const win = L.wins[0] > L.wins[1];
              endSession(S, win, { reason: win ? 'won' : 'lost' });
            } else {
              if (S.ambient && (L.wins[0] >= L.need || L.wins[1] >= L.need)) { L.wins = [0, 0]; L.round = 0; }
              L.seek = 1 - L.seek;
              LING.startRound(S);
            }
          }
          break;
        }
        default: break;
      }
      for (const st of L.stones) LING.stoneStep(S, st, dt);
      for (const P of S.parts) if (!P.isPlayer) LING.ai(S, P, dt);
    },
    aiStackThrow(S, T) {
      const L = S.L;
      let ang = Math.atan2(L.base.y - T.e.y, L.base.x - T.e.x);
      const weak = S.real && PG.debug.assist.weakAI && T.team !== (S.me ? S.me.team : -1);
      ang += gauss(S.rng) * (weak ? 0.5 : lerp(TUNE.lingocha.stackErr[0], TUNE.lingocha.stackErr[1], S.d));
      const p = 0.32 + S.rng.next() * 0.42;
      LING.stackThrow(S, T, ang, p);
    },
    stackThrow(S, T, ang, p) {
      const sp = TUNE.aim.min + TUNE.aim.span * p;
      const vz = sp * TUNE.aim.elev + (p > 0.86 ? (p - 0.86) * 80 : 0);
      release(S, T, ang, sp, vz, { dead: true, kind: 'stack' });
      S.phase = 'flight'; S.phaseT = 0;
      S.L.lastP = p;
    },
    stackTop(S) { return S.L.stack.length * TUNE.stoneH; },
    ballStack(S, b) {
      const L = S.L;
      if (!L.stack.length || b.state === 'held') return;
      const R0 = L.stack[0].r + TUNE.ballR, dx = b.x - L.base.x, dy = b.y - L.base.y, d = hyp(dx, dy);
      if (d > R0 || b.z - TUNE.ballR > LING.stackTop(S)) return;
      const sp = hyp(b.vx, b.vy);
      if (S.phase === 'flight' && !L.knocked && sp > 22) { LING.knock(S, b); return; }
      // the half-built stack is not knocked again: the ball glances off it
      if (sp > 1 && d > 0.01) { const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny; if (dot < 0) { b.vx -= 1.6 * dot * nx; b.vy -= 1.6 * dot * ny; } b.x = L.base.x + nx * (R0 + 0.1); b.y = L.base.y + ny * (R0 + 0.1); }
    },
    knock(S, b) {
      const L = S.L, sp = hyp(b.vx, b.vy) || 1, ba = Math.atan2(b.vy, b.vx);
      L.knocked = true;
      L.stack.forEach((st, i) => {
        st.state = 'fly'; st.claim = null; st.by = null;
        st.x = L.base.x + (S.rng.next() - 0.5); st.y = L.base.y + (S.rng.next() - 0.5); st.z = i * TUNE.stoneH;
        const a = ba + gauss(S.rng) * 0.85, v = clamp(sp * (0.3 + 0.45 * S.rng.next()) * (0.65 + 0.07 * i), 25, 150);
        st.vx = Math.cos(a) * v; st.vy = Math.sin(a) * v; st.vz = 10 + S.rng.next() * 16 + i * 2;
      });
      L.stack = [];
      b.vx = -b.vx * 0.25 + (S.rng.next() - 0.5) * 30; b.vy = -b.vy * 0.25 + (S.rng.next() - 0.5) * 30; b.vz = Math.abs(b.vz) * 0.3 + 12; b.live = false;
      sfx('marble', { x: L.base.x, y: L.base.y, vol: 1, pitch: 0.7 }); sfx('marble', { x: L.base.x, y: L.base.y, vol: 0.8, pitch: 0.55, delay: 0.06 }); sfx('bump', { x: L.base.x, y: L.base.y, vol: 0.6, pitch: 0.8 });
      pop(S, L.base.x, L.base.y, 8, 'DHAM!', '#f2c230', true);
      const T = b.thrower;
      log(S, 'knock', { by: T ? T.name : null, me: !!(T && T.isPlayer), try: L.tries + 1 });
      if (T) bark(S, T, pick(S, BARK.knock));
      if (S.real) {
        const mine = S.me && S.me.team === L.seek;
        toast(mine ? 'Knocked down! Grab the stones and restack — dodge the ball!' : 'Down it goes! Get the ball and hit them before they restack!', 2600);
      }
      S.phase = 'scatter'; S.phaseT = 0;
      for (const P of LING.hitters(S)) if (!P.isPlayer) P.think = 0;
    },
    stoneStep(S, st, dt) {
      if (st.state === 'carried') { const c = st.by; if (c && c.e) { const q = holdPos(c); st.x = q.x; st.y = q.y; st.z = 3.2; } return; }
      if (st.state !== 'fly') return;
      const F = S.F;
      st.vz -= TUNE.g * dt;
      let nx = st.x + st.vx * dt, ny = st.y + st.vy * dt;
      if (solidCell(nx, st.y)) { st.vx = -st.vx * 0.4; nx = st.x; }
      if (solidCell(nx, ny)) { st.vy = -st.vy * 0.4; ny = st.y; }
      const m = TUNE.kerbM;
      if (inRect(F, st.x, st.y, m)) {
        if ((nx < F.x0 - m && st.vx < 0) || (nx > F.x1 + m && st.vx > 0)) { st.vx = -st.vx * 0.35; nx = st.x; }
        if ((ny < F.y0 - m && st.vy < 0) || (ny > F.y1 + m && st.vy > 0)) { st.vy = -st.vy * 0.35; ny = st.y; }
      }
      st.x = nx; st.y = ny; st.z += st.vz * dt; st.rot += dt * hyp(st.vx, st.vy) * 0.05;
      if (st.z <= 0) {
        st.z = 0;
        if (st.vz < -20) { st.vz = -st.vz * 0.3; st.vx *= 0.6; st.vy *= 0.6; sfx('marble', { x: st.x, y: st.y, vol: 0.35, pitch: 0.6 + st.i * 0.06 }); }
        else { st.vz = 0; const s = hyp(st.vx, st.vy), dec = 110 * dt; if (s <= dec) { st.vx = st.vy = 0; st.state = 'loose'; } else { st.vx *= (s - dec) / s; st.vy *= (s - dec) / s; } }
      }
      if (st.state === 'fly' && !walk(st.x, st.y)) { const f = spotNear(st.x, st.y, 1, 9); st.x = f.x; st.y = f.y; }
    },
    /** a seeker who touches a hitter is SAFE for a moment */
    touches(S) {
      const seek = LING.seekers(S), hit = LING.hitters(S);
      for (const A of seek) {
        if (A.out || A.safeCD > 0 || !A.e) continue;
        for (const B of hit) {
          if (B.out || !B.e) continue;
          if (pdist(A, B) < A.e.r + B.e.r + 1.2) {
            A.safeT = TUNE.lingocha.safeT; A.safeCD = TUNE.lingocha.safeCD;
            pop(S, A.e.x, A.e.y, 11, 'SAFE!', '#7fe0ff');
            bark(S, A, pick(S, BARK.safe));
            log(S, 'safe', { name: A.name, me: !!A.isPlayer, touched: B.name });
            break;
          }
        }
      }
    },
    onHit(S, P, b) {
      const L = S.L, T = b.thrower;
      if (S.phase !== 'live' || !T || T.team === P.team || P.team !== L.seek) return false;
      if (b.z - TUNE.ballR * 0.5 > TUNE.headZ) {
        pop(S, P.e.x, P.e.y, 11, 'NO HEADS!', '#ffb0a0');
        bark(S, P, pick(S, BARK.head));
        log(S, 'head_foul', { name: P.name, by: T.name });
        T.fouls++; if (T.isPlayer) S.stats.fouls++;
        knockDown(S, P, b);
        return true;
      }
      if (P.safeT > 0) { pop(S, P.e.x, P.e.y, 11, 'SAFE!', '#7fe0ff'); log(S, 'hit_safe', { name: P.name }); b.vx *= -0.2; b.vy *= -0.2; b.vz = 14; b.live = false; return true; }
      if (P.dood) { pop(S, P.e.x, P.e.y, 11, 'DOODH-BHAAT!', '#f8d0e0'); bark(S, P, pick(S, BARK.dood)); log(S, 'hit_dood', { name: P.name }); b.vx *= -0.2; b.vy *= -0.2; b.vz = 14; b.live = false; return true; }
      knockDown(S, P, b);
      setOut(S, P, T, 'hit');
      return true;
    },
    onCaughtPass(S, R) { void S; void R; },
    shout(S, P) {
      const L = S.L;
      L.shouted = true;
      const who = P || LING.seekers(S).find((q) => !q.out) || LING.seekers(S)[0];
      pop(S, L.base.x, L.base.y, 14, 'LINGOCHAAA!', '#f2c230', true);
      if (who) bark(S, who, pick(S, BARK.lingocha), { secs: 2.2, force: true });
      sfx('crowd_cheer', { x: L.base.x, y: L.base.y, vol: S.real ? 1 : 0.5 }); sfx('kids', { x: L.base.x, y: L.base.y, vol: 0.8 });
      if (S.real) {
        sfx('applause', { ui: true, vol: 0.7, delay: 0.3 });
        const mine = S.me && S.me.team === L.seek;
        banner('LINGOCHA!', (mine ? S.teamName[0] : S.teamName[1]) + ' rebuilt all seven' + (who && who.isPlayer ? ' — Chinnu placed the last stone!' : ''), 2600, mine ? 'pass' : 'fail');
      }
      log(S, 'lingocha', { by: who ? who.name : null, me: !!(who && who.isPlayer) });
      LING.endRound(S, L.seek, 'restack', true);
    },
    endRound(S, winner, reason, quiet) {
      const L = S.L;
      if (S.phase === 'roundEnd') return;
      L.wins[winner]++;
      const rec = { round: L.round, seek: L.seek === 0 ? 'home' : 'away', winner: winner === 0 ? 'home' : 'away', reason, live: L.liveT0 != null && L.knocked ? +(S.t - L.liveT0).toFixed(1) : 0, stack: L.stack.length };
      L.liveT0 = null;
      L.hist.push(rec);
      S.phase = 'roundEnd'; S.phaseT = 0;
      for (const P of S.parts) { P.act = null; P.windT = 0; }
      S.tele = null;
      log(S, 'round_end', rec);
      if (S.real && !quiet) {
        const mine = winner === (S.me ? S.me.team : 0);
        const why = reason === 'tries' ? 'Three tries, stack still standing!' : reason === 'allout' ? 'All the seekers are out!' : reason === 'time' ? 'Time up — the stack is not rebuilt!' : '';
        banner(mine ? 'Round to ' + S.teamName[0] + '!' : 'Round to ' + S.teamName[1], why, 2400, mine ? 'pass' : 'fail');
        sfx(mine ? 'crowd_cheer' : 'kids', { ui: true, vol: 0.6 });
      }
    },
    nextStone(S, P) {
      const L = S.L;
      if (P.stone && P.stone.state === 'loose' && (P.stone.claim === P || !P.stone.claim)) return P.stone;
      let best = null, bd = Infinity;
      for (const st of L.stones) {
        if (st.state !== 'loose' || (st.claim && st.claim !== P && !st.claim.out && st.claim.stone === st)) continue;
        const d = hyp(st.x - P.e.x, st.y - P.e.y) + hyp(st.x - L.base.x, st.y - L.base.y) * 0.5;
        if (d < bd) { bd = d; best = st; }
      }
      if (best) { best.claim = P; P.stone = best; }
      return best;
    },
    pickStone(S, P, st) {
      if (!st || st.state !== 'loose' || P.carry || P.out) return false;
      st.state = 'carried'; st.by = P; st.claim = P; P.carry = st; P.stone = null;
      sfx('pickup', { x: st.x, y: st.y, vol: 0.5, pitch: 1.2 });
      log(S, 'pick', { name: P.name, me: !!P.isPlayer, stone: st.i });
      return true;
    },
    stackStone(S, P) {
      const L = S.L, st = P.carry;
      if (!st || P.out || L.stack.length >= 7) return false;
      P.carry = null; st.state = 'stack'; st.by = null; st.claim = null; st.x = L.base.x; st.y = L.base.y; st.z = L.stack.length * TUNE.stoneH;
      L.stack.push(st); L.lastStacker = P; P.stacked++;
      if (P.isPlayer) S.stats.stacked++;
      sfx('marble', { x: L.base.x, y: L.base.y, vol: 0.7, pitch: 0.9 + L.stack.length * 0.05 });
      pop(S, L.base.x, L.base.y, 6 + L.stack.length, L.stack.length + '/7', '#f4ead8');
      log(S, 'restack', { name: P.name, me: !!P.isPlayer, count: L.stack.length });
      return true;
    },
    /** AI for every kid (both teams, both phases) */
    ai(S, P, dt) {
      const L = S.L, e = P.e, b = S.ball;
      if (!e || e.alive === false) return;
      if (S.real && PG.debug.assist.freezeAI) { halt(P); return; }
      if (P.scatter) { const q = edgeSpot(S.F, e.x, e.y, 20); goTo(P, q.x, q.y, speedOf(S, P, true), 3); return; }
      if (P.downT > 0) { halt(P); return; }
      if (P.out) { goSit(S, P, dt); return; }
      e.idle = null;
      const ph = S.phase;
      if (ph === 'setup' || ph === 'aim' || ph === 'flight' || ph === 'return' || ph === 'roundEnd') {
        P.face = Math.atan2(L.base.y - e.y, L.base.x - e.x);
        if (P.spot) goTo(P, P.spot.x, P.spot.y, ph === 'setup' ? speedOf(S, P, true) : TUNE.kidWalk, 1.5); else halt(P);
        if (ph === 'roundEnd') { halt(P); P.face = null; }
        return;
      }
      P.face = null;
      const seeker = P.team === L.seek;
      if (LING.dodge(S, P)) return;
      if (seeker) LING.seekerAI(S, P, dt); else LING.hitterAI(S, P, dt);
    },
    dodge(S, P) {
      const b = S.ball, e = P.e;
      if (P.dodgeT > 0) { P.dodgeT -= N.time.dt || 1 / 60; P.dvx = P.dodgeX; P.dvy = P.dodgeY; return true; }
      if (b.state !== 'air' || !b.live || b.thrower === P || !b.thrower || b.thrower.team === P.team || S.t < P.react || !P.dodgeRoll) return false;
      if (S.id === 'lingocha' && P.team !== S.L.seek) return false;
      const rx = e.x - b.x, ry = e.y - b.y, vv = b.vx * b.vx + b.vy * b.vy;
      if (vv < 100) return false;
      const t = (rx * b.vx + ry * b.vy) / vv;
      if (t < 0 || t > 0.6) return false;
      const mx = rx - b.vx * t, my = ry - b.vy * t, miss = hyp(mx, my);
      if (miss > 6.5) return false;
      const v = Math.sqrt(vv), side = (b.vx * ry - b.vy * rx) >= 0 ? 1 : -1;
      let dx = (-b.vy / v) * side, dy = (b.vx / v) * side;
      if (!walk(e.x + dx * 10, e.y + dy * 10) || !inRect(S.F, e.x + dx * 10, e.y + dy * 10, 6)) { dx = -dx; dy = -dy; }
      const sp = speedOf(S, P, true) * 1.15;
      P.dodgeX = dx * sp; P.dodgeY = dy * sp; P.dodgeT = 0.32; P.dodgeRoll = 0;
      P.dvx = P.dodgeX; P.dvy = P.dodgeY;
      return true;
    },
    seekerAI(S, P, dt) {
      const L = S.L, e = P.e, b = S.ball;
      if (P.act) {
        halt(P); P.actT -= dt;
        if (P.actT <= 0) {
          if (P.act === 'pick') LING.pickStone(S, P, P.actStone);
          else if (P.act === 'stack') LING.stackStone(S, P);
          P.act = null; P.actStone = null;
        }
        return;
      }
      const run = speedOf(S, P, true);
      const Hh = b.holder && b.holder.team !== P.team ? b.holder : null;
      const threat = Hh && P.safeT <= 0 && pdist(P, Hh) < TUNE.lingocha.threatR && L.timer > 12;
      if (threat && P.caution > 0.15) {
        // keep away until the throw has gone (then rush in)
        let ax = e.x - Hh.e.x, ay = e.y - Hh.e.y; const l = hyp(ax, ay) || 1;
        const q = clampIn(S.F, e.x + (ax / l) * 20 - (ay / l) * 8 * P.side, e.y + (ay / l) * 20 + (ax / l) * 8 * P.side, 5);
        goTo(P, q.x, q.y, run, 1);
        return;
      }
      if (P.carry) {
        // one pair of hands on the stack at a time; the others wait their turn a step away
        const busy = S.parts.some((Q) => Q !== P && Q.act === 'stack' && !Q.out);
        if (busy) {
          const a = Math.atan2(e.y - L.base.y, e.x - L.base.x);
          goTo(P, L.base.x + Math.cos(a) * 9, L.base.y + Math.sin(a) * 9, run, 1.5);
          return;
        }
        const d = goTo(P, L.base.x, L.base.y, run, 4.5);
        if (d < 5.5) { P.act = 'stack'; P.actT = TUNE.lingocha.stackT * (P.dood ? 1.4 : 1); halt(P); }
        return;
      }
      // the holder is winding up at me: run and touch a hitter to be SAFE
      const H = b.holder;
      if (H && H.team !== P.team && H.tgt === P && H.windT > 0 && P.safeCD <= 0) {
        let near = null, nd = 16;
        for (const Q of LING.hitters(S)) { if (Q.out || Q === H) continue; const d = pdist(P, Q); if (d < nd) { nd = d; near = Q; } }
        if (near) { goTo(P, near.e.x, near.e.y, run, 0.5); return; }
      }
      // kick the loose ball away from the hitters
      if ((b.state === 'rest' || b.state === 'roll') && !b.holder) {
        const db = hyp(b.x - e.x, b.y - e.y);
        let hd = Infinity; for (const Q of LING.hitters(S)) if (!Q.out) hd = Math.min(hd, hyp(Q.e.x - b.x, Q.e.y - b.y));
        if (db < 14 && hd > 16 && hd > db + 4) { goTo(P, b.x, b.y, run, 0); return; }
      }
      const st = LING.nextStone(S, P);
      if (st) {
        const d = goTo(P, st.x, st.y, run, 2);
        if (d < 3.6) { P.act = 'pick'; P.actT = TUNE.lingocha.pickT * (P.dood ? 1.5 : 1); P.actStone = st; halt(P); }
        return;
      }
      // nothing to fetch: hover near the stack, out of the holder's line
      if (!P.wander || S.t > P.wander.t) { const a = S.rng.next() * TAU, r = 12 + S.rng.next() * 14; const q = clampIn(S.F, L.base.x + Math.cos(a) * r, L.base.y + Math.sin(a) * r, 5); P.wander = { x: q.x, y: q.y, t: S.t + 1.5 + S.rng.next() * 2 }; }
      goTo(P, P.wander.x, P.wander.y, TUNE.kidWalk, 2);
    },
    hitterAI(S, P, dt) {
      const L = S.L, e = P.e, b = S.ball;
      const run = speedOf(S, P, true);
      if (P.hold) {
        P.holdT += dt;
        const targets = LING.seekers(S).filter((Q) => !Q.out && !Q.dood && Q.safeT <= 0);
        if (!targets.length) { halt(P); if (P.holdT > TUNE.lingocha.holdMax) drop(S, P); return; }
        if (!P.tgt || P.tgt.out || P.tgt.safeT > 0 || S.t > P.tgtT) {
          let best = null, bs = Infinity;
          for (const Q of targets) { const s = pdist(P, Q) * (Q.carry ? 0.7 : 1) * (Q.isPlayer ? 1.05 : 1) * (0.85 + 0.3 * S.rng.next()); if (s < bs) { bs = s; best = Q; } }
          P.tgt = best; P.tgtT = S.t + 1.2;
        }
        const T = P.tgt, d = pdist(P, T);
        if (P.windT > 0) {
          halt(P); P.face = Math.atan2(T.e.y - e.y, T.e.x - e.x); P.windT -= dt;
          S.tele = { from: P, to: T };
          if (P.windT <= 0) LING.aiThrowAt(S, P, T);
          return;
        }
        // pass to a teammate who is much closer to the target
        if (d > 50 && P.holdT > 0.4) {
          let mate = null, md = d - 18;
          for (const Q of LING.hitters(S)) { if (Q === P || Q.out || Q.isPlayer) continue; const dq = pdist(Q, T); if (dq < md) { md = dq; mate = Q; } }
          if (mate && S.rng.next() < 0.7) { launchAt(S, P, mate.e.x, mate.e.y, 4, TUNE.passSpeed, 0.03, { pass: true, passTo: mate }); return; }
        }
        const range = lerp(30, 42, S.d);
        if (d < range || P.holdT > TUNE.lingocha.holdMax - 0.6) { P.windT = lerp(TUNE.lingocha.windup[0], TUNE.lingocha.windup[1], S.d) * (S.real && PG.debug.assist.weakAI ? 1.6 : 1); halt(P); return; }
        goTo(P, T.e.x, T.e.y, speedOf(S, P, false), 2);
        return;
      }
      // fetch the loose ball (the two nearest hitters go)
      if (!b.holder && canGrab(S, b) && rectDist(S.F, b.x, b.y) < 80) {
        let rank = 0; const my = hyp(b.x - e.x, b.y - e.y);
        for (const Q of LING.hitters(S)) if (Q !== P && !Q.out && hyp(b.x - Q.e.x, b.y - Q.e.y) < my) rank++;
        if (rank < 2) {
          const d = goTo(P, b.x, b.y, run, 0.5);
          if (d < 4.2 && b.state !== 'held') give(S, P);
          return;
        }
      }
      if (P.role === 'guard') {
        let car = null, cd = Infinity;
        for (const Q of LING.seekers(S)) if (!Q.out && Q.carry) { const d = hyp(Q.e.x - L.base.x, Q.e.y - L.base.y); if (d < cd) { cd = d; car = Q; } }
        const a = car ? Math.atan2(car.e.y - L.base.y, car.e.x - L.base.x) : (S.t * 0.4) % TAU;
        goTo(P, L.base.x + Math.cos(a) * TUNE.lingocha.guardR, L.base.y + Math.sin(a) * TUNE.lingocha.guardR, run, 1.5);
        return;
      }
      // mark: stay near a seeker, ready for a pass
      let near = null, nd = Infinity;
      for (const Q of LING.seekers(S)) if (!Q.out) { const d = pdist(P, Q); if (d < nd) { nd = d; near = Q; } }
      if (near) {
        const a = Math.atan2(e.y - near.e.y, e.x - near.e.x);
        const q = clampIn(S.F, near.e.x + Math.cos(a) * 20, near.e.y + Math.sin(a) * 20, 4);
        goTo(P, q.x, q.y, TUNE.kidWalk + 10, 3);
      } else halt(P);
    },
    aiThrowAt(S, P, T) {
      const weak = S.real && PG.debug.assist.weakAI && T.isPlayer;
      const sp = lerp(TUNE.aiSpeed[0], TUNE.aiSpeed[1], S.d) * (0.92 + S.rng.next() * 0.16);
      const d = pdist(P, T), t = d / sp, lead = 0.5 + 0.4 * S.d;
      const tx = T.e.x + (T.e.vx || 0) * t * lead, ty = T.e.y + (T.e.vy || 0) * t * lead;
      const errA = weak ? 0.45 : lerp(TUNE.lingocha.aiErr[0], TUNE.lingocha.aiErr[1], S.d);
      const tz = clamp(2.4 + gauss(S.rng) * (1.1 - 0.5 * S.d), 0.8, 6.5);
      launchAt(S, P, tx, ty, tz, sp, errA, { target: T });
    },
    hud(S) {
      const L = S.L, me = S.me;
      const mine = me ? me.team === L.seek : true;
      const seek = LING.seekers(S), cnt = seek.filter((P) => !P.dood);
      const outs = cnt.filter((P) => P.out).length;
      const dots = '●'.repeat(L.stack.length) + '○'.repeat(Math.max(0, 7 - L.stack.length));
      const live = S.phase === 'live' || S.phase === 'scatter';
      return {
        title: 'LINGOCHA',
        score: S.teamName[0] + ' ' + L.wins[0] + ' – ' + L.wins[1] + ' ' + S.teamName[1],
        timer: live ? L.timer : null,
        sub: 'Round ' + L.round + '/' + L.rounds + ' · ' + (mine ? 'You SEEK' : 'You HIT') + ' · ' + (live ? 'Stack ' + dots + ' ' + L.stack.length + '/7' : 'Try ' + Math.min(TUNE.lingocha.tries, L.tries + 1) + '/' + TUNE.lingocha.tries) + ' · Out ' + outs + '/' + cnt.length,
      };
    },
    result(S) {
      const L = S.L;
      return { roundsWon: L.wins[0], roundsLost: L.wins[1], rounds: L.hist.slice(), stacked: S.stats.stacked, hits: S.stats.hits, outs: S.stats.outs, tries: S.stats.tries, opponent: S.teamName[1] };
    },
    stars(S, r) { if (!r.win) return 0; return r.roundsLost === 0 ? 3 : 2; },
    score(S, r) { return r.roundsWon * 100 + r.stacked * 10 + r.hits * 15; },
    /* ---- the player's controls */
    control(S, dt, I) {
      const L = S.L, me = S.me, p = N.player, b = S.ball;
      if (!me) return;
      if (S.phase === 'aim' && L.thrower === me) { aimControl(S, dt, I); return; }
      if (S.phase === 'setup' || S.phase === 'flight' || S.phase === 'return' || S.phase === 'roundEnd' || S.phase === 'aim') {
        offer(S, ''); I.consume('action');
        if (S.phase === 'roundEnd' || ((S.phase === 'flight' || S.phase === 'return') && L.thrower === me)) { zeroMove(I); I.consume('run'); }
        return;
      }
      if (me.out) { offer(S, ''); I.consume('action'); return; }
      const seeker = me.team === L.seek;
      if (seeker) {
        if (me.carry) {
          const d = hyp(L.base.x - p.x, L.base.y - p.y);
          if (d < 10) {
            offer(S, L.stack.length === 6 ? 'Stack + LINGOCHA!' : 'Stack it (' + (L.stack.length + 1) + '/7)');
            if (I.pressed('action')) { LING.stackStone(S, me); }
          } else offer(S, '');
          I.consume('action');
          return;
        }
        let st = null, sd = 6.5;
        for (const s of L.stones) { if (s.state !== 'loose') continue; const d = hyp(s.x - p.x, s.y - p.y); if (d < sd) { sd = d; st = s; } }
        if (st) { offer(S, 'Pick up stone'); if (I.pressed('action')) { if (st.claim && st.claim !== me) { st.claim.stone = null; } LING.pickStone(S, me, st); } }
        else offer(S, '');
        I.consume('action');
        // running into the loose ball kicks it away
        if ((b.state === 'rest' || b.state === 'roll') && hyp(b.x - p.x, b.y - p.y) < p.r + TUNE.ballR + 0.6 && hyp(p.vx, p.vy) > 35) kick(S, me);
        return;
      }
      // hitter
      holderControl(S, dt, I, LING.seekers(S).filter((Q) => !Q.out && !Q.dood));
    },
    prompt(S) {
      const L = S.L, me = S.me, a = keyName('action');
      if (!me) return '';
      if (S.phase === 'setup') return me.team === L.seek ? 'Your team throws first — walk to the chalk line' : 'Spread out — the other team throws at the stack';
      if (S.phase === 'aim') {
        if (L.thrower !== me) return (L.thrower ? L.thrower.name : 'They') + ' throws at the stack…';
        const tr = 'Try ' + (L.tries + 1) + '/' + TUNE.lingocha.tries + ': ';
        if (isTouch() && !is3D()) return tr + 'drag back on the ground and let go (or stick + hold ' + a + ')';
        if (N.input && N.input.device === 'gamepad') return tr + 'stick aims · hold A for power, let go to throw';
        return tr + (is3D() ? 'look / ← → aim' : '← → or mouse aim') + ' · hold ' + a + ' for power, let go';
      }
      if (S.phase === 'flight' || S.phase === 'return') return '…';
      if (S.phase === 'roundEnd') return '';
      if (me.out) return 'OUT! Sit at the side — cheer for your team';
      if (me.team === L.seek) {
        if (me.carry) return 'Carry it to the stack and press ' + a + ' · dodge the ball!';
        return 'Grab a stone (' + a + ') and restack · touch a hitter = SAFE · run into the ball to kick it';
      }
      if (me.hold) return a + ': throw at ' + (S.aimTarget ? S.aimTarget.name : 'a seeker') + ' · hold for a hard one';
      return 'Get the ball (' + a + ') and hit the seekers before they restack';
    },
  };

  /* ================================================================ MARAM PITTI */
  const MARAM = {
    id: 'marampitti', title: 'Maram Pitti', sub: 'Dodgeball · last one standing',
    setup(S) {
      const F = S.F, p = S.params;
      const M = (S.M = { timeLeft: p.time > 0 ? +p.time : TUNE.maram.time, tosser: null, tosses: 0, n: 0 });
      const R = rosterFor('marampitti', F, S.rng, p, S.ambient);
      if (!S.ambient) addPlayer(S, 0);
      R.list.forEach((spec, i) => { const q = edgeSpot(F, F.cx + (S.rng.next() - 0.5) * F.w, F.cy + (S.rng.next() - 0.5) * F.h, -5); addPart(S, spec, i + 1, q.x, q.y); });
      M.n = S.parts.length;
      MARAM.ring(S);
    },
    ring(S) {
      const F = S.F, c = F.centre, M = S.M;
      const r = clamp(Math.min(F.w, F.h) * 0.32, 16, 34);
      const n = S.parts.length;
      S.parts.forEach((P, i) => {
        P.out = false; P.hold = false; P.windT = 0; P.sit = null; P.fouls = 0; P.face = null; P.scatter = false;
        if (P.e && !P.isPlayer) { P.e.idle = null; P.e.down = false; P.downT = 0; }
        const a = (i / n) * TAU + 0.4, q = clampIn(F, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 4);
        P.spot = spotNear(q.x, q.y, 3, 10, F);
      });
      M.tosser = S.parts.find((P) => !P.isPlayer) || S.parts[0];
      if (M.tosser) M.tosser.spot = { x: c.x, y: c.y };
      give(S, M.tosser);
      S.phase = 'setup'; S.phaseT = 0;
      if (S.me) {
        const sp = S.me.spot;
        S.auto = sp && hyp(sp.x - N.player.x, sp.y - N.player.y) > 4 ? { x: sp.x, y: sp.y, t: 0, face: Math.atan2(c.y - sp.y, c.x - sp.x) } : null;
        banner('MARAM PITTI', 'Wait for the bounce · hit them below the head · last one standing wins', 2400, 'info');
        sfx('whistle', { ui: true, vol: 0.7 });
      }
      log(S, 'ring', { n });
    },
    toss(S) {
      const M = S.M, T = M.tosser, b = S.ball, c = S.F.centre;
      M.tosses++;
      release(S, T, S.rng.next() * TAU, 5 + S.rng.next() * 6, TUNE.maram.tossVz, { dead: true, kind: 'toss', quiet: true });
      b.x = c.x; b.y = c.y; b.z = 4.5;
      T.spot = null; T.retreat = true;
      S.phase = 'toss'; S.phaseT = 0;
      log(S, 'toss', { n: M.tosses });
      bark(S, T, '*Ek… do… teen!*');
    },
    alive(S) { return S.parts.filter((P) => !P.out); },
    update(S, dt) {
      const M = S.M, b = S.ball;
      S.phaseT += dt;
      if (S.phase === 'setup') {
        const ready = S.parts.every((P) => P.isPlayer || !P.spot || hyp(P.e.x - P.spot.x, P.e.y - P.spot.y) < 4);
        if ((ready && !S.auto && S.phaseT > 1) || S.phaseT > 4.5) { if (S.auto) S.auto = null; MARAM.toss(S); }
      } else if (S.phase === 'toss') {
        if (b.bounced > 0 || b.state !== 'air') { S.phase = 'play'; S.phaseT = 0; log(S, 'play'); }
      } else if (S.phase === 'play') {
        if (!(S.real && PG.debug.assist.noTimer)) M.timeLeft -= dt;
        const al = MARAM.alive(S);
        if (S.real) {
          if (S.me.out && S.endAt == null) { S.endAt = S.t + 2.2; S.endWin = false; S.endExtra = { reason: 'out', rank: al.length + 1 }; }
          else if (!S.me.out && al.length <= 1 && S.endAt == null) {
            S.endAt = S.t + 1.4; S.endWin = true; S.endExtra = { reason: 'last', rank: 1 };
            banner('LAST ONE STANDING!', 'Chinnu wins the maram pitti!', 2400, 'pass'); sfx('crowd_cheer', { ui: true }); sfx('applause', { ui: true, delay: 0.3 });
          } else if (M.timeLeft <= 0 && S.endAt == null) {
            S.endAt = S.t + 1.2; S.endWin = !S.me.out; S.endExtra = { reason: 'time', rank: S.me.out ? al.length + 1 : 1, shared: al.length };
            banner('TIME UP!', S.me.out ? '' : 'Still standing — ' + al.length + ' of you share the glory', 2200, S.me.out ? 'fail' : 'pass');
          }
        } else if ((al.length <= 1 || M.timeLeft <= 0) && !S.restartAt) { S.restartAt = S.t + TUNE.ambient.rest; M.timeLeft = TUNE.maram.time; if (al[0]) { bark(S, al[0], '*Jeet gaya*! Again!'); pop(S, al[0].e.x, al[0].e.y, 12, 'WINNER!', '#f2c230'); } }
      }
      if (S.restartAt && S.t > S.restartAt) { S.restartAt = 0; MARAM.ring(S); }
      for (const P of S.parts) if (!P.isPlayer) MARAM.ai(S, P, dt);
    },
    onBounce(S, b, wasLive) {
      if (wasLive && b.thrower && S.phase === 'play' && b.hitSet && b.hitSet.size === 0) {
        const T = b.thrower;
        if (T && !T.isPlayer && S.rng.next() < 0.35) bark(S, T, pick(S, BARK.miss));
      }
    },
    onHit(S, P, b) {
      const T = b.thrower;
      if (S.phase !== 'play' || !T) return false;
      // a catch on the full: the thrower is out
      const caught = (P.isPlayer && S.t - P.catchT < TUNE.catchWin * (S.assist ? 1.5 : 1)) || (!P.isPlayer && P.catchRoll && hyp(b.vx, b.vy) < 190 && P.downT <= 0);
      if (caught) {
        give(S, P); P.catches++; if (P.isPlayer) S.stats.catches++;
        pop(S, P.e.x, P.e.y, 11, 'CAUGHT!', '#7fe0ff', true);
        bark(S, P, pick(S, BARK.catch));
        sfx('pickup', { x: P.e.x, y: P.e.y, vol: 0.8 });
        log(S, 'catch', { name: P.name, me: !!P.isPlayer, thrower: T.name });
        setOut(S, T, P, 'caught');
        return true;
      }
      if (b.z - TUNE.ballR * 0.5 > TUNE.headZ) {
        T.fouls++; if (T.isPlayer) S.stats.fouls++;
        pop(S, P.e.x, P.e.y, 11, 'NO HEADS!', '#ffb0a0');
        bark(S, P, pick(S, BARK.head));
        log(S, 'head_foul', { name: P.name, by: T.name, fouls: T.fouls });
        knockDown(S, P, b);
        if (T.fouls >= TUNE.maram.fouls) { if (T.isPlayer) toast('Three head shots — out, ra! (no heads in maram pitti)', 2600); setOut(S, T, null, 'fouls'); }
        else if (T.isPlayer) toast('*Nakko!* No head shots — foul ' + T.fouls + '/' + TUNE.maram.fouls, 2200);
        return true;
      }
      knockDown(S, P, b);
      setOut(S, P, T, 'hit');
      return true;
    },
    ai(S, P, dt) {
      const e = P.e, b = S.ball, M = S.M;
      if (!e || e.alive === false) return;
      if (S.real && PG.debug.assist.freezeAI) { halt(P); return; }
      if (P.scatter) { const q = edgeSpot(S.F, e.x, e.y, 20); goTo(P, q.x, q.y, speedOf(S, P, true), 3); return; }
      if (P.downT > 0) { halt(P); return; }
      if (P.out) { goSit(S, P, dt); return; }
      e.idle = null;
      const c = S.F.centre;
      if (S.phase === 'setup') {
        if (P.spot) goTo(P, P.spot.x, P.spot.y, speedOf(S, P, true), 1.5); else halt(P);
        P.face = Math.atan2(c.y - e.y, c.x - e.x);
        return;
      }
      P.face = null;
      if (P.retreat) { if (P.spot == null) { const a = Math.atan2(e.y - c.y, e.x - c.x) || S.rng.next() * TAU; P.spot = clampIn(S.F, c.x + Math.cos(a) * 24, c.y + Math.sin(a) * 24, 5); } goTo(P, P.spot.x, P.spot.y, speedOf(S, P, true), 2); if (S.phaseT > 0.7 || S.phase === 'play') { P.retreat = false; P.spot = null; } return; }
      if (LING.dodge(S, P)) return;
      const run = speedOf(S, P, true);
      if (P.hold) {
        P.holdT += dt;
        const al = MARAM.alive(S).filter((Q) => Q !== P);
        if (!al.length) { halt(P); return; }
        if (!P.tgt || P.tgt.out || S.t > P.tgtT) {
          let best = null, bs = Infinity;
          for (const Q of al) { const s = pdist(P, Q) * (0.75 + 0.5 * S.rng.next()); if (s < bs) { bs = s; best = Q; } }
          P.tgt = best; P.tgtT = S.t + 1.4;
        }
        const T = P.tgt, d = pdist(P, T);
        if (P.windT > 0) {
          halt(P); P.face = Math.atan2(T.e.y - e.y, T.e.x - e.x); P.windT -= dt; S.tele = { from: P, to: T };
          if (P.windT <= 0) LING.aiThrowAt(S, P, T);
          return;
        }
        if (d < lerp(28, 40, S.d) || P.holdT > TUNE.maram.holdMax - 0.6) { P.windT = lerp(TUNE.lingocha.windup[0], TUNE.lingocha.windup[1], S.d) * (S.real && PG.debug.assist.weakAI && T.isPlayer ? 1.6 : 1); halt(P); return; }
        goTo(P, T.e.x, T.e.y, speedOf(S, P, false), 2);
        return;
      }
      // the loose ball: the nearest two go for it (after the bounce); before the bounce they wait
      if (!b.holder && rectDist(S.F, b.x, b.y) < 70) {
        const my = hyp(b.x - e.x, b.y - e.y);
        let rank = 0; for (const Q of S.parts) if (Q !== P && !Q.out && hyp(b.x - Q.e.x, b.y - Q.e.y) < my) rank++;
        if (rank < 2 || my < 22) {
          if (canGrab(S, b)) { const d = goTo(P, b.x, b.y, run, 0.5); if (d < 4.2) { give(S, P); log(S, 'grab', { name: P.name, bounced: b.bounced }); } return; }
          if (b.state === 'air' && !b.live) { // wait for the bounce near the landing spot
            const land = landing(b);
            const a = Math.atan2(e.y - land.y, e.x - land.x);
            goTo(P, land.x + Math.cos(a) * 6.5, land.y + Math.sin(a) * 6.5, run, 1);
            return;
          }
        }
      }
      // keep away from the holder; drift about
      const H = b.holder;
      if (H && H !== P && pdist(P, H) < 52) {
        let ax = e.x - H.e.x, ay = e.y - H.e.y; const l = hyp(ax, ay) || 1; ax /= l; ay /= l;
        // stay on the ground: pull back towards the middle near the edges
        const ex = (c.x - e.x) / Math.max(20, S.F.w * 0.5), ey = (c.y - e.y) / Math.max(20, S.F.h * 0.5);
        let vx = ax + ex * 1.2, vy = ay + ey * 1.2; const vl = hyp(vx, vy) || 1; vx /= vl; vy /= vl;
        P.dvx = vx * run * 0.8; P.dvy = vy * run * 0.8;
        return;
      }
      if (!P.wander || S.t > P.wander.t) { const q = clampIn(S.F, c.x + (S.rng.next() - 0.5) * S.F.w * 0.8, c.y + (S.rng.next() - 0.5) * S.F.h * 0.8, 5); P.wander = { x: q.x, y: q.y, t: S.t + 1.5 + S.rng.next() * 2.5 }; }
      goTo(P, P.wander.x, P.wander.y, TUNE.kidWalk * 0.8, 2);
      void M;
    },
    hud(S) {
      const M = S.M, al = MARAM.alive(S).length;
      return {
        title: 'MARAM PITTI',
        score: 'Standing ' + al + '/' + S.parts.length,
        timer: S.phase === 'play' ? M.timeLeft : null,
        sub: (S.me ? 'Your hits ' + S.me.hits + (S.me.catches ? ' · catches ' + S.me.catches : '') + ' · fouls ' + S.me.fouls + '/' + TUNE.maram.fouls : '') + (S.ball.holder ? ' · ball: ' + (S.ball.holder.isPlayer ? 'YOU' : S.ball.holder.name) : ''),
      };
    },
    result(S) {
      const me = S.me || {};
      const al = MARAM.alive(S);
      return { hits: me.hits || 0, catches: me.catches || 0, fouls: me.fouls || 0, rank: (S.endExtra && S.endExtra.rank) || (me.out ? al.length + 1 : 1), survivors: al.length, kids: S.parts.length };
    },
    stars(S, r) { if (!r.win) return 0; return r.reason === 'time' ? 1 : r.hits >= 3 ? 3 : 2; },
    score(S, r) { return (r.win ? 100 : 0) + r.hits * 25 + r.catches * 40 - r.fouls * 10; },
    control(S, dt, I) {
      const me = S.me, p = N.player, b = S.ball;
      if (!me) return;
      if (S.phase === 'setup') { offer(S, ''); I.consume('action'); return; }
      if (me.out) { offer(S, ''); I.consume('action'); return; }
      // RUN tap: a quick dodge hop (not while holding the ball)
      if (I.pressed('run') && !me.hold && S.t - me.dashT > TUNE.maram.dashCD) {
        let dx = I.move.x, dy = I.move.y, l = hyp(dx, dy);
        if (l < 0.2 && b.state === 'air' && b.live) { const v = hyp(b.vx, b.vy) || 1; dx = -b.vy / v; dy = b.vx / v; l = 1; }
        if (l < 0.2) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); l = 1; }
        p.vx += (dx / l) * TUNE.maram.dashV; p.vy += (dy / l) * TUNE.maram.dashV;
        me.dashT = S.t; log(S, 'dodge');
      }
      if (me.hold) { holderControl(S, dt, I, MARAM.alive(S).filter((Q) => Q !== me)); return; }
      // a ball coming at me: CATCH
      if (b.state === 'air' && b.live && b.thrower !== me) {
        const rx = p.x - b.x, ry = p.y - b.y, vv = b.vx * b.vx + b.vy * b.vy;
        const t = vv > 1 ? (rx * b.vx + ry * b.vy) / vv : -1;
        if (t > 0 && t < 0.6 && hyp(rx - b.vx * t, ry - b.vy * t) < 6.5) {
          offer(S, 'CATCH!');
          if (I.pressed('action')) { me.catchT = S.t; log(S, 'catch_try'); }
          I.consume('action');
          return;
        }
      }
      const d = hyp(b.x - p.x, b.y - p.y);
      if (!b.holder && d < 7.5) {
        offer(S, 'Grab ball');
        if (I.pressed('action')) {
          if (canGrab(S, b)) { give(S, me); log(S, 'grab', { name: me.name, me: true, bounced: b.bounced }); sfx('pickup', { ui: true, vol: 0.5 }); }
          else {
            log(S, 'grab_refused', { reason: 'no_bounce' });
            pop(S, p.x, p.y, 10, 'BOUNCE FIRST!', '#ffb0a0');
            const k = S.parts.find((Q) => !Q.isPlayer && !Q.out);
            if (k) bark(S, k, pick(S, BARK.cheat));
          }
        }
      } else offer(S, '');
      I.consume('action');
    },
    prompt(S) {
      const me = S.me, a = keyName('action'), r = keyName('run'), b = S.ball;
      if (!me) return '';
      if (S.phase === 'setup') return 'Stand in the ring — the ball goes up, wait for the BOUNCE';
      if (me.out) return 'OUT!';
      if (S.phase === 'toss') return 'Wait for the bounce… then grab it (' + a + ')';
      if (me.hold) return a + ': throw at ' + (S.aimTarget ? S.aimTarget.name : 'someone') + ' (below the head!) · hold for a hard one · ' + Math.max(0, TUNE.maram.holdMax - me.holdT).toFixed(1) + 's';
      if (b.state === 'air' && b.live && b.thrower !== me) return 'Incoming! ' + r + ' to dodge · ' + a + ' to CATCH';
      return 'Grab the ball after it bounces (' + a + ') · tap ' + r + ' to dodge';
    },
  };
  const GAMES = { lingocha: LING, marampitti: MARAM };

  /* ================================================================ shared player controls */
  function zeroMove(I) { I.move.x = 0; I.move.y = 0; if (I.rawMove) { I.rawMove.x = 0; I.rawMove.y = 0; } }
  function offer(S, label) {
    S.ui.label = label || '';
    const f = N.time ? N.time.frame : 0;
    if (S._of && S._ofF === f) { S._of.label = label || ''; return; }
    S._ofF = f;
    S._of = { label: label || '', priority: 90, dist: 0, use() { /* the game read ACTION itself */ } };
    try { N.interact.offer(S._of); } catch (e) { /* ignore */ }
  }
  function kick(S, P) {
    const b = S.ball, e = P.e, v = hyp(e.vx, e.vy) || 1;
    const k = TUNE.lingocha.kick * clamp(v / 70, 0.6, 1.3);
    b.state = 'air'; b.holder = null; b.thrower = P; b.live = false; b.pass = false; b.passTo = null; b.bounced = 1;
    b.vx = (e.vx / v) * k + (S.rng.next() - 0.5) * 18; b.vy = (e.vy / v) * k + (S.rng.next() - 0.5) * 18; b.vz = 12; b.z = Math.max(b.z, 0.5);
    sfx('bump', { x: b.x, y: b.y, vol: 0.5, pitch: 1.4 });
    log(S, 'kick', { name: P.name, me: !!P.isPlayer });
  }
  /** Aim target for the player's throw: the kid nearest the facing direction (wide cone on phones / Assist). */
  function chooseTarget(S, cands) {
    const p = N.player, me = S.me;
    if (!cands.length) return null;
    const face = p.facing != null ? p.facing : p.angle;
    // mouse pointer (2D): the kid under / nearest the cursor
    if (PTR.mouseT > 0 && performance.now() - PTR.mouseT < 1500 && !is3D() && PTR.wx != null) {
      let best = null, bd = 16;
      for (const Q of cands) { const d = hyp(Q.e.x - PTR.wx, Q.e.y - PTR.wy); if (d < bd) { bd = d; best = Q; } }
      if (best) return best;
    }
    const cone = isTouch() || S.assist ? 1.15 : 0.62;
    let best = null, bs = Infinity;
    for (const Q of cands) {
      const dx = Q.e.x - p.x, dy = Q.e.y - p.y, d = hyp(dx, dy);
      if (d > 95 || d < 1) continue;
      const a = Math.abs(adiff(face, Math.atan2(dy, dx)));
      if (a > cone) continue;
      const s = d * (1 + a * 1.4);
      if (s < bs) { bs = s; best = Q; }
    }
    if (!best && (isTouch() || S.assist)) { for (const Q of cands) { const d = pdist(me, Q); if (d < bs) { bs = d; best = Q; } } }
    return best;
  }
  function holderControl(S, dt, I, cands) {
    const me = S.me, b = S.ball, p = N.player;
    if (!me.hold) {
      const d = hyp(b.x - p.x, b.y - p.y);
      if (!b.holder && d < 7.5 && canGrab(S, b)) {
        offer(S, 'Pick up ball');
        if (I.pressed('action')) { give(S, me); sfx('pickup', { ui: true, vol: 0.5 }); log(S, 'grab', { name: me.name, me: true, bounced: b.bounced }); }
      } else offer(S, '');
      I.consume('action');
      S.aimTarget = null;
      return;
    }
    me.holdT += dt;
    // no running with the ball in your hand
    I.consume('run');
    I.move.x *= 0.72; I.move.y *= 0.72;
    S.aimTarget = chooseTarget(S, cands);
    const T = S.aimTarget;
    offer(S, T ? 'Throw at ' + T.name : 'Throw');
    const A = S.aim;
    if (I.pressed('action') || PTR.clicked) { A.charging = true; A.holdT = 0; PTR.clicked = false; }
    if (A.charging) A.holdT += dt;
    const rel = A.charging && (I.released('action') || PTR.releasedClick || (!I.down('action') && !PTR.down && A.holdT > 0.05));
    PTR.releasedClick = false;
    const limit = (S.id === 'marampitti' ? TUNE.maram.holdMax : TUNE.lingocha.holdMax) + 0.5;
    if (rel || me.holdT > limit) {
      const power = A.holdT > 0.3;
      if (me.holdT > limit && !rel) { toast('*Teen second!* Throw it, ra!', 1600); }
      A.charging = false; A.holdT = 0;
      playerThrow(S, T, power);
    }
    I.consume('action');
  }
  function playerThrow(S, T, power) {
    const me = S.me, p = N.player;
    const asst = S.assist || isTouch() || PG.debug.assist.aim;
    const sp = power ? TUNE.powerSpeed : TUNE.throwSpeed;
    if (T) {
      const d = pdist(me, T), t = d / sp;
      const tx = T.e.x + (T.e.vx || 0) * t * 0.6, ty = T.e.y + (T.e.vy || 0) * t * 0.6;
      const errA = PG.debug.assist.aim ? 0 : (power ? 0.07 : 0.035) * (asst ? 0.5 : 1);
      const tz = PG.debug.assist.aim ? 2.6 : clamp(2.6 + gauss(S.rng) * (power ? 1.7 : 0.6), 0.8, 8);
      launchAt(S, me, tx, ty, tz, sp, errA, { target: T });
    } else {
      const a = p.facing != null ? p.facing : p.angle;
      release(S, me, a, sp, power ? 22 : 12);
    }
    me.hold = false;
  }
  /** the line throw at the stack: aim + power */
  function aimControl(S, dt, I) {
    const L = S.L, A = S.aim, p = N.player, me = S.me;
    const toStack = Math.atan2(L.base.y - p.y, L.base.x - p.x);
    const mv = I.rawMove || I.move;
    // aim input: stick (analog) points, keys rotate, the mouse points (2D), the camera looks (3D)
    if (I.analog && hyp(I.move.x, I.move.y) > 0.35) A.ang = A.ang + adiff(A.ang, Math.atan2(I.move.y, I.move.x)) * Math.min(1, dt * 10);
    else if (Math.abs(mv.x) > 0.2) { A.ang += Math.sign(mv.x) * TUNE.aim.rotKey * dt; PTR.mouseT = 0; }
    if (!is3D() && PTR.mouseT > 0 && performance.now() - PTR.mouseT < 2000 && PTR.wx != null && !PTR.drag) A.ang = Math.atan2(PTR.wy - p.y, PTR.wx - p.x);
    if (is3D() && N.view) {
      if (A.yaw == null) { A.yaw = A.ang; try { N.view3d.setCamera({ yaw: A.ang }); } catch (e) { /* ignore */ } }
      else if (Math.abs(adiff(A.yaw, N.view.yaw)) > 0.002) { A.ang = N.view.yaw; A.yaw = N.view.yaw; }
      else if (Math.abs(adiff(A.yaw, A.ang)) > 0.002) { A.yaw = A.ang; try { N.view3d.setCamera({ yaw: A.ang }); } catch (e) { /* ignore */ } }
    }
    const asst = S.assist || isTouch();
    if (asst && Math.abs(adiff(A.ang, toStack)) < TUNE.aim.assistSnap) A.ang += adiff(A.ang, toStack) * Math.min(1, dt * 6);
    zeroMove(I); I.consume('run');
    p.angle = p.facing = A.ang;
    // touch slingshot (2D): drag back, let go
    if (PTR.drag && PTR.drag.done) {
      const dg = PTR.drag; PTR.drag = null;
      const len = hyp(dg.dx, dg.dy);
      if (len > 12) {
        A.ang = Math.atan2(-dg.wy, -dg.wx);
        if (asst && Math.abs(adiff(A.ang, toStack)) < TUNE.aim.assistSnap * 1.5) A.ang = toStack + adiff(toStack, A.ang) * 0.25;
        A.p = clamp(len / TUNE.aim.drag, 0.05, 1);
        throwAtStack(S, A.ang, A.p);
        return;
      }
    }
    if (PTR.drag && !PTR.drag.done) {
      const dg = PTR.drag, len = hyp(dg.dx, dg.dy);
      if (len > 6) { A.ang = Math.atan2(-dg.wy, -dg.wx); A.p = clamp(len / TUNE.aim.drag, 0.05, 1); A.charging = false; A.dragging = true; }
      offer(S, 'Let go to throw'); I.consume('action');
      return;
    }
    A.dragging = false;
    if (I.pressed('action') || PTR.clicked) { A.charging = true; A.p = 0; A.dir = 1; A.holdT = 0; PTR.clicked = false; }
    if (A.charging) {
      A.holdT += dt;
      A.p += A.dir * dt / (TUNE.aim.cycle / 2);
      if (A.p >= 1) { A.p = 1; A.dir = -1; } else if (A.p <= 0) { A.p = 0; A.dir = 1; }
      if (PG.debug.assist.power != null) A.p = PG.debug.assist.power;
      const rel = I.released('action') || PTR.releasedClick || (!I.down('action') && !PTR.down && A.holdT > 0.05);
      PTR.releasedClick = false;
      if (rel) { A.charging = false; throwAtStack(S, A.ang, A.p); offer(S, ''); I.consume('action'); return; }
      offer(S, 'Let go to throw!');
    } else offer(S, 'Hold to throw (' + (S.L.tries + 1) + '/' + TUNE.lingocha.tries + ')');
    I.consume('action');
    void me;
  }
  function throwAtStack(S, ang, p) {
    const L = S.L, me = S.me;
    if (PG.debug.assist.aim) { ang = Math.atan2(L.base.y - N.player.y, L.base.x - N.player.x); if (PG.debug.assist.power == null) p = 0.55; }
    else ang += gauss(S.rng) * (S.assist || isTouch() ? 0.012 : 0.022);
    if (PG.debug.assist.power != null) p = PG.debug.assist.power;
    log(S, 'player_throw', { ang: +ang.toFixed(3), p: +p.toFixed(2) });
    LING.stackThrow(S, me, ang, p);
  }

  /* ================================================================ pointer input (mouse aim, touch slingshot) */
  const PTR = { down: false, id: -1, type: null, x: 0, y: 0, sx: 0, sy: 0, wx: null, wy: null, mouseT: 0, drag: null, clicked: false, releasedClick: false };
  function wantPointer() { const S = current; return !!(S && !S.ended && N.state && N.state.mode === 'play'); }
  function installPointer() {
    if (installPointer.done) return;
    const cv = document.getElementById('game');
    if (!cv) return;
    installPointer.done = true;
    const toWorld = (cx, cy) => { try { return N.render.clientToWorld(cx, cy); } catch (e) { return null; } };
    cv.addEventListener('pointermove', (ev) => {
      if (!wantPointer()) return;
      if (ev.pointerType === 'mouse') { const w = toWorld(ev.clientX, ev.clientY); if (w) { PTR.wx = w.x; PTR.wy = w.y; PTR.mouseT = performance.now(); } }
      if (PTR.drag && ev.pointerId === PTR.id) {
        const a = toWorld(PTR.sx, PTR.sy), b = toWorld(ev.clientX, ev.clientY);
        PTR.drag.dx = ev.clientX - PTR.sx; PTR.drag.dy = ev.clientY - PTR.sy;
        if (a && b) { PTR.drag.wx = b.x - a.x; PTR.drag.wy = b.y - a.y; }
      }
    });
    cv.addEventListener('pointerdown', (ev) => {
      if (!wantPointer()) return;
      const S = current;
      if (ev.pointerType === 'mouse') {
        if (ev.button !== 0) return;
        PTR.down = true; PTR.clicked = true; PTR.id = ev.pointerId;
        const w = toWorld(ev.clientX, ev.clientY); if (w) { PTR.wx = w.x; PTR.wy = w.y; PTR.mouseT = performance.now(); }
        return;
      }
      // touch / pen: a slingshot drag while Chinnu is at the line
      if (S.id === 'lingocha' && S.phase === 'aim' && S.L.thrower === S.me) {
        PTR.down = true; PTR.id = ev.pointerId; PTR.sx = ev.clientX; PTR.sy = ev.clientY;
        PTR.drag = { dx: 0, dy: 0, wx: 0, wy: 0, done: false };
        try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        ev.preventDefault();
      } else if (S.me && S.me.hold) {
        // tap a kid to throw at them
        const w = toWorld(ev.clientX, ev.clientY);
        if (w) { PTR.wx = w.x; PTR.wy = w.y; PTR.mouseT = performance.now(); PTR.clicked = true; PTR.down = true; PTR.id = ev.pointerId; }
      }
    });
    const up = (ev) => {
      if (ev.pointerId !== PTR.id) return;
      if (PTR.drag) PTR.drag.done = true;
      if (PTR.down) PTR.releasedClick = true;
      PTR.down = false; PTR.id = -1;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }
  function resetPointer() { PTR.down = false; PTR.id = -1; PTR.drag = null; PTR.clicked = false; PTR.releasedClick = false; PTR.mouseT = 0; PTR.wx = null; }

  /* ================================================================ running a real game */
  function pickField(place) {
    if (place && FIELDS.get(place)) return FIELDS.get(place);
    const p = N.player;
    const near = p ? nearestField(p.x, p.y, 600) : null;
    return near || FIELDS.get('playground_1') || FIELDS.get('playground_home') || fieldList[0] || null;
  }
  function play(id, params) {
    params = Object.assign({}, params || {});
    const gid = resolveId(id);
    if (!gid) return Promise.resolve({ id, win: false, score: 0, stars: 0, error: 'unknown' });
    if (current) return Promise.resolve({ id: gid, win: false, score: 0, stars: 0, error: 'busy' });
    if (ORIG.isOpen && ORIG.isOpen()) return Promise.resolve({ id: gid, win: false, score: 0, stars: 0, error: 'busy' });
    if (!fieldList.length) buildFields();
    const F = pickField(params.place);
    if (!F || !N.player) return Promise.resolve({ id: gid, win: false, score: 0, stars: 0, error: 'no-ground' });
    return new Promise((resolve) => {
      try {
        // the kids already playing here join in
        let adopt = [];
        if (AMB.S && AMB.S.F === F) { adopt = AMB.S.kids.filter((k) => k.alive !== false); endAmbient(true); }
        const p = N.player;
        if (p.vehicle && N.vehicles && N.vehicles.exit) { try { if (!N.vehicles.exit(p)) N.vehicles.exit(p, true); } catch (e) { N.err('pg.exit', e); } }
        if (rectDist(F, p.x, p.y) > 140) { const q = edgeSpot(F, F.line.x, F.line.y, -6); p.teleport(q.x, q.y); }
        const S = createSession(gid, F, params, { resolve, adopt });
        current = S;
        startReal(S);
      } catch (e) {
        N.err('pg.play:' + gid, e);
        if (current) hardCleanup(current);
        current = null;
        resolve({ id: gid, win: false, score: 0, stars: 0, error: String((e && e.message) || e) });
      }
    });
  }
  /* Mission givers start their mission when Chinnu stands in their ring for a second (missions.js J-card
   * dwell); in the middle of a game on the ground that must not happen (the colony ground carries the
   * gully-league giver). While a game runs every giver's when() says "not now" (wrapped once per def). */
  let giverHold = false;
  function holdGivers(on) {
    giverHold = !!on;
    const M = N.missions;
    if (!on || !M || !M.defs) return;
    for (const id in M.defs) {
      const d = M.defs[id];
      if (!d || !d.giver || d.__pgWhen) continue;
      const ow = d.when;
      d.__pgWhen = true;
      d.when = function () { if (giverHold) return false; return typeof ow === 'function' ? ow.apply(this, arguments) : true; };
    }
  }
  /** top-down: zoom in so the whole ground (plus a margin) fills the view */
  function gameZoom(F) {
    const R = N.render, W = (R && R.W) || 640, H = (R && R.H) || 360;
    return clamp(Math.min(W / (F.w + TUNE.zoomPad), H / (F.h + TUNE.zoomPad)), TUNE.zoom[0], TUNE.zoom[1]);
  }
  function startReal(S) {
    holdGivers(true);
    BUSY.add(S.F.decorY);
    try { if (N.traffic && N.traffic.closeRoads) N.traffic.closeRoads('pg', { x: S.F.cx, y: S.F.cy, r: Math.max(S.F.w, S.F.h) / 2 + 40 }); } catch (e) { /* ignore */ }
    try { if (N.clock && N.clock.hold) N.clock.hold('playground-game', true); } catch (e) { /* ignore */ }
    try { if (N.render && !N.render.camOverride) { S.zoomWas = N.render.baseZoom; S.zoom = gameZoom(S.F); N.render.baseZoom = S.zoom; } } catch (e) { /* ignore */ }
    try { if (S.id === 'marampitti' && N.input.setLabel) N.input.setLabel('run', 'DODGE'); } catch (e) { /* ignore */ }
    resetPointer();
    installPointer();
    hudShow(true);
    try { N.emit('minigame:start', { id: S.id, params: S.params, inWorld: true, place: S.F.key }); } catch (e) { /* ignore */ }
    if (S.params.intro) toast(S.params.intro, 3600);
    sfx('kids', { ui: true, vol: 0.6 });
    log(S, 'start', { place: S.F.key, d: +S.d.toFixed(2), kids: S.parts.length });
  }
  function endSession(S, win, extra) {
    if (S.ended) return;
    S.ended = true;
    const G = S.G;
    const base = { id: S.id, win: !!win, score: 0, stars: 0, quit: false, aborted: false, attempts: 1, time: Math.round(S.t * 10) / 10, difficulty: Math.round(S.d * 100) / 100, assist: S.assist, place: S.F.key, paid: 0, window: false };
    const r = Object.assign(base, G.result(S), extra || {});
    r.win = !!win && !r.aborted && !r.quit;
    r.score = Math.max(0, Math.round(G.score(S, r)));
    r.stars = r.win ? G.stars(S, r) : 0;
    S.result = r;
    log(S, 'end', { win: r.win, reason: r.reason || null });
    // money: story reward, or free-roam pay (systems §2.4)
    try {
      if (r.win && +S.params.reward > 0) giveMoney(Math.round(+S.params.reward), S.id);
      if (S.params.side) r.paid = payOut(S, r);
    } catch (e) { N.err('pg.pay', e); }
    // stats in the shared minigame table
    try {
      const st = N.minigames && N.minigames.stats;
      if (st && !r.aborted) {
        st.plays[S.id] = (st.plays[S.id] || 0) + 1;
        if (r.win) { st.wins[S.id] = (st.wins[S.id] || 0) + 1; if (!(st.best[S.id] >= r.score)) st.best[S.id] = r.score; }
      }
    } catch (e) { N.err('pg.stats', e); }
    if (!r.aborted && !r.quit && r.reason !== 'window' && r.reason !== 'chappal') {
      const t = r.win ? (S.id === 'lingocha' ? 'Match won!' : 'Champion of the ground!') : (S.id === 'lingocha' ? 'Match lost' : 'Out of the game');
      const sub = S.id === 'lingocha' ? S.teamName[0] + ' ' + r.roundsWon + ' – ' + r.roundsLost + ' ' + S.teamName[1] + (r.paid ? ' · +' + U.fmtMoney(r.paid) : '') : (r.win ? 'Hits ' + r.hits + (r.catches ? ' · catches ' + r.catches : '') + (r.paid ? ' · +' + U.fmtMoney(r.paid) : '') : 'Placed ' + r.rank + ' of ' + r.kids);
      banner(t, sub, 2600, r.win ? 'pass' : 'fail');
      if (r.win) sfx('finger_whistle', { ui: true, vol: 0.7 });
    }
    cleanupReal(S);
    try { N.emit('minigame:end', { id: S.id, result: r, inWorld: true }); } catch (e) { /* ignore */ }
    const res = S.resolve; S.resolve = null;
    if (res) { try { res(r); } catch (e) { N.err('pg.resolve', e); } }
  }
  function cleanupReal(S) {
    if (current === S) current = null;
    holdGivers(false);
    spectatorsOff(S);
    try { if (N.traffic && N.traffic.closeRoads) N.traffic.closeRoads('pg', null); } catch (e) { /* ignore */ }
    BUSY.delete(S.F.decorY);
    try { if (N.clock && N.clock.hold) N.clock.hold('playground-game', false); } catch (e) { /* ignore */ }
    try { if (N.render && S.zoomWas != null && Math.abs(N.render.baseZoom - S.zoom) < 1e-6) N.render.baseZoom = S.zoomWas; } catch (e) { /* ignore */ }
    try { if (N.input.setLabel) N.input.setLabel('run', null); } catch (e) { /* ignore */ }
    try { if (N.view3d && N.view3d.setCamera) { /* leave the camera where it is */ } } catch (e) { /* ignore */ }
    restoreDoubles(S);
    resetPointer();
    hudShow(false);
    S.auto = null;
    S.ball.state = 'rest';
    // the kids carry on playing by themselves (ambient), or wander off
    const kids = S.kids.filter((k) => k.alive !== false);
    let goOn = false;
    try { goOn = ambientAllowed(S.F) && !(S.result && (S.result.reason === 'window' || S.result.reason === 'chappal')); } catch (e) { goOn = false; }
    if (goOn) {
      try {
        const A = createSession(S.id, S.F, { difficulty: 0.35, seed: S.seed + 7 }, { ambient: true, adopt: kids });
        AMB.S = A; BUSY.add(S.F.decorY);
      } catch (e) { N.err('pg.carryOn', e); for (const k of kids) leaveKid(k, S.F); }
    } else for (const k of kids) leaveKid(k, S.F);
    leftovers.push({ S, t: 0 });
  }
  function ambientAllowed(F) {
    if (AMB.off || AMB.S || (N.missions && N.missions.active) || isConfiscated(F)) return false;
    if (AMB.force) return AMB.force !== 'cricket';
    return kidsPresent() && !ganeshOn();
  }
  function hardCleanup(S) {
    if (!S) return;
    holdGivers(false);
    spectatorsOff(S);
    try { if (N.traffic && N.traffic.closeRoads) N.traffic.closeRoads('pg', null); } catch (e) { /* ignore */ }
    BUSY.delete(S.F.decorY);
    try { if (N.clock && N.clock.hold) N.clock.hold('playground-game', false); } catch (e) { /* ignore */ }
    try { if (N.render && S.zoomWas != null) N.render.baseZoom = S.zoomWas; } catch (e) { /* ignore */ }
    try { if (N.input.setLabel) N.input.setLabel('run', null); } catch (e) { /* ignore */ }
    restoreDoubles(S);
    for (const k of S.kids) { try { if (k.alive !== false) N.entities.remove(k); } catch (e) { /* ignore */ } }
    for (const p of S.pops) if (p.el) p.el.remove();
    S.pops.length = 0;
    if (S === current) { current = null; hudShow(false); resetPointer(); }
  }
  function abort(reason) {
    const S = current;
    if (!S) return false;
    endSession(S, false, { aborted: true, reason: reason || 'aborted' });
    return true;
  }
  function giveMoney(paise, why) {
    const pl = N.player; if (!pl || !(paise > 0)) return 0;
    pl.money = (pl.money || 0) + paise;
    try { N.emit('money', { delta: paise, total: pl.money, why }); } catch (e) { /* ignore */ }
    return paise;
  }
  function ledger() {
    const MG = N.minigames;
    let L = MG && MG.ledger;
    if (!L) L = PG._ledger || (PG._ledger = { day: null, paid: {}, kite: 0, off: {} });
    const d = (N.clock && N.clock.day) || 0;
    if (L.day !== d) { L.day = d; L.paid = {}; L.kite = 0; }
    if (!L.paid) L.paid = {};
    return L;
  }
  /** Free-roam pay (systems §2.4 / §8.0): ₹2 a win (₹3 for 3 stars), at most 3 paid wins per game per day. */
  function payOut(S, r) {
    if (!r || !r.win || r.aborted || r.quit) return 0;
    const L = ledger(), n = L.paid[S.id] || 0, title = S.G.title;
    if (n >= TUNE.pay.daily) { toast(title + ': no more prize money today. Play for fun!', 2600); log(S, 'pay_capped', { n }); return 0; }
    const amt = r.stars >= 3 ? TUNE.pay.win3 : TUNE.pay.win;
    L.paid[S.id] = n + 1;
    giveMoney(amt, S.id);
    toast('+' + U.fmtMoney(amt) + ' · ' + title + ' (' + (n + 1) + '/' + TUNE.pay.daily + ' today)', 2400);
    sfx('coin', { ui: true });
    log(S, 'paid', { amt, n: n + 1 });
    return amt;
  }

  /* ================================================================ systems */
  function ctlUpdate(dt) {
    const S = current;
    if (!S || S.ended) return;
    const I = N.input, p = N.player;
    if (!I || !p || p.vehicle) return;
    if (S.auto) {
      const a = S.auto, dx = a.x - p.x, dy = a.y - p.y, d = hyp(dx, dy);
      a.t += dt;
      if (d < 2.5 || a.t > 3.5) {
        if (d >= 2.5 && walk(a.x, a.y)) { p.x = a.x; p.y = a.y; p.vx = p.vy = 0; }
        if (a.face != null) p.angle = p.facing = a.face;
        S.auto = null;
      } else {
        const k = Math.min(1, d / 10) * 0.9;
        I.move.x = (dx / d) * k; I.move.y = (dy / d) * k; I.analog = true;
        I.consume('run');
      }
      offer(S, ''); I.consume('action');
      return;
    }
    try { S.G.control(S, dt, I); } catch (e) { N.err('pg.control:' + S.id, e); }
  }
  function simUpdate(dt) {
    if (current) stepSession(current, dt);
    try { ambientTick(dt); } catch (e) { N.err('pg.ambient', e); }
    if (AMB.S) stepSession(AMB.S, dt);
    // finished games: the kids walk off and vanish
    for (let i = leftovers.length - 1; i >= 0; i--) {
      const L = leftovers[i]; L.t += dt;
      for (const P of L.S.pops) P.t += dt;
      if (L.t > 2.5) { for (const pp of L.S.pops) if (pp.el) pp.el.remove(); L.S.pops.length = 0; leftovers.splice(i, 1); }
    }
    for (let i = leftKids.length - 1; i >= 0; i--) {
      const k = leftKids[i], P = k.P;
      if (!k.alive || !P) { leftKids.splice(i, 1); continue; }
      P.leaveT = (P.leaveT || 0) + dt;
      if (P.leaveT > 1.2 && P.goal) goTo(P, P.goal.x, P.goal.y, TUNE.kidWalk, 3); else halt(P);
      P.downT = 0; k.down = false; k.idle = null;
      moveKid(P.S || { d: 0.4 }, P, dt);
      const R = N.render, far = !R.inView(k.x, k.y, 30);
      if (P.leaveT > 10 || (P.leaveT > 2 && far)) { N.entities.remove(k); leftKids.splice(i, 1); }
    }
  }
  function stepSession(S, dt) {
    if (S.ended) return;
    S.t += dt;
    try {
      S.G.update(S, dt);
      if (S.ended) return;
      for (const P of S.parts) moveKid(S, P, dt);
      separate(S);
      ballStep(S, dt);
      for (const pp of S.pops) pp.t += dt;
      for (let i = S.pops.length - 1; i >= 0; i--) if (S.pops[i].t > S.pops[i].life) { const o = S.pops.splice(i, 1)[0]; if (o.el) o.el.remove(); }
      if (S.tele && (!S.tele.from.hold || S.tele.from.windT <= 0)) S.tele = null;
      S.specT = (S.specT || 0) - dt;
      if (S.specT <= 0) { S.specT = 1; spectators(S, true); }
      if (S.ambient) ambientChatter(S, dt);
      else realChecks(S, dt);
    } catch (e) { N.err('pg.step:' + S.id, e); }
  }
  function realChecks(S, dt) {
    const p = N.player, F = S.F;
    // the clock crawls while we play (held, advanced by hand)
    try {
      if (N.clock && N.clock.holds && N.clock.holds.has('playground-game') && !N.clock.frozen) {
        N.clock.minutes += dt * TUNE.clockRate;
        while (N.clock.minutes >= 1440) { N.clock.minutes -= 1440; N.clock.nextDay(); }
      }
    } catch (e) { /* ignore */ }
    if (S.endAt != null && S.t >= S.endAt) { endSession(S, S.endWin, S.endExtra); return; }
    if (p.vehicle) { endSession(S, false, { quit: true, reason: 'vehicle' }); return; }
    ballRescue(S, dt);
    if (N.wanted && N.wanted.level >= 3 && S.endAt == null) {
      banner('BHAAGO!', 'The Chappal Meter is up — game over, run!', 2400, 'fail');
      endSession(S, false, { reason: 'chappal' });
      return;
    }
    // walked off the ground
    const d = rectDist(F, p.x, p.y);
    if (d > TUNE.leaveR) {
      S.awayT = (S.awayT || 0) + dt;
      if (S.awayT > 0.2 && !S.awayWarned) { S.awayWarned = true; toast('*Arre*, where are you going? Come back or the game is over!', 2400); }
      if (S.awayT > TUNE.leaveT) {
        if (S.params.noQuit) { const q = edgeSpot(F, p.x, p.y, -6); p.x = q.x; p.y = q.y; p.vx = p.vy = 0; S.awayT = 0; S.awayWarned = false; toast('Game’s not over, ra!', 1800); }
        else { endSession(S, false, { quit: true, reason: 'left' }); return; }
      }
    } else { S.awayT = 0; S.awayWarned = false; }
    if (S.barkT > 0) S.barkT -= dt;
    else { S.barkT = 4 + S.rng.next() * 5; const k = S.parts.find((Q) => !Q.isPlayer && !Q.out && S.rng.next() < 0.3); if (k) bark(S, k, pick(S, BARK.chatter)); }
    hudUpdate(S);
  }
  /** a ball lost in a drain / the lake / behind a house comes back: "Ball la, ra!" */
  function ballRescue(S, dt) {
    const b = S.ball;
    if (b.hiddenBall || b.state === 'held' || b.state === 'air') { S.ballOutT = 0; return; }
    if (b.lost || rectDist(S.F, b.x, b.y) > 24 || !walk(b.x, b.y)) {
      S.ballOutT = (S.ballOutT || 0) + dt;
      if (S.ballOutT > 2.5) {
        const q = edgeSpot(S.F, b.x, b.y, -5);
        Object.assign(b, { x: q.x, y: q.y, z: 0, vx: 0, vy: 0, vz: 0, state: 'rest', lost: false, live: false, bounced: 1 });
        S.ballOutT = 0;
        const k = S.parts.find((Q) => !Q.isPlayer && !Q.out);
        if (k) bark(S, k, 'Ball *la*, ra!');
        log(S, 'ball_back');
      }
    } else S.ballOutT = 0;
  }
  function ambientChatter(S, dt) {
    ballRescue(S, dt);
    S.barkT -= dt;
    if (S.barkT > 0) return;
    S.barkT = lerp(TUNE.ambient.barkGap[0], TUNE.ambient.barkGap[1], S.rng.next());
    const k = S.parts.filter((Q) => !Q.out)[Math.floor(S.rng.next() * S.parts.length)] || S.parts[0];
    if (k) bark(S, k, pick(S, BARK.chatter));
    if (S.restartAt && S.t > S.restartAt && S.id === 'lingocha') { S.restartAt = 0; }
  }

  /* ================================================================ spectators */
  // traffic.js keeps a little crowd of kids wandering at every ground (its 'playground' crowd zone). While a
  // game is on there, that zone's centre is moved to the sideline, so they stand and watch instead of
  // running through the game; it is put back when the game ends.
  function sideline(F) {
    const c = [[F.cx, F.y1 + 9], [F.cx, F.y0 - 9], [F.x0 - 9, F.cy], [F.x1 + 9, F.cy], [F.cx, F.y1 - 4], [F.x0 + 4, F.cy]];
    for (const [x, y] of c) if (clearAt(x, y, 5)) return { x, y };
    return { x: F.x0 + 4, y: F.y0 + 4 };
  }
  function spectators(S, on) {
    if (!S.zones) S.zones = new Map();
    if (!on) { for (const [z, o] of S.zones) { z.x = o.x; z.y = o.y; z.r = o.r; } S.zones.clear(); return; }
    const T = N.traffic;
    if (!T || !T.peds) return;
    for (const p of T.peds) {
      const z = p && p.zone;
      if (!z || z.kind !== 'playground' || S.zones.has(z) || hyp(z.x - S.F.cx, z.y - S.F.cy) > 260) continue;
      if (z.__pgMoved) continue;
      S.zones.set(z, { x: z.x, y: z.y, r: z.r });
      const q = S.F.side || (S.F.side = sideline(S.F));
      z.x = q.x; z.y = q.y; z.r = 9; z.__pgMoved = true;
    }
    for (const z of S.zones.keys()) z.__pgMoved = true;
  }
  function spectatorsOff(S) { if (S && S.zones) { for (const z of S.zones.keys()) z.__pgMoved = false; spectators(S, false); } }

  /* ================================================================ ambient games */
  function ambientGameFor(F) {
    if (AMB.force) return AMB.force;
    const day = (N.clock && N.clock.day) || 0, hr = Math.floor(minutes() / 60);
    const h = U.hash2(day * 7.31 + hr * 0.37, U.strHash(F.key) % 997);
    return h < 0.4 ? 'cricket' : h < 0.7 ? 'lingocha' : 'marampitti';
  }
  function endAmbient(adopted) {
    const S = AMB.S;
    if (!S) return;
    AMB.S = null;
    BUSY.delete(S.F.decorY);
    restoreDoubles(S);
    spectatorsOff(S);
    for (const pp of S.pops) if (pp.el) pp.el.remove();
    S.pops.length = 0;
    S.ended = true;
    if (!adopted) {
      const vis = N.render && N.render.rectInView ? N.render.rectInView(S.F.x0, S.F.y0, S.F.w, S.F.h, 40) : false;
      for (const k of S.kids) { if (vis) leaveKid(k, S.F); else { try { N.entities.remove(k); } catch (e) { /* ignore */ } } }
    }
  }
  function ambientTick(dt) {
    AMB.t -= dt;
    if (AMB.t > 0) return;
    AMB.t = 0.5;
    const p = N.player;
    const okMode = N.state && N.state.mode === 'play';
    if (!okMode) return;
    if (AMB.off || !p || current || !fieldList.length || (N.missions && N.missions.active) || p.level) { if (AMB.S && !current) endAmbient(false); return; }
    const F = nearestField(p.x, p.y, TUNE.ambient.r);
    const keep = AMB.S && rectDist(AMB.S.F, p.x, p.y) < TUNE.ambient.far;
    const open = (AMB.force && AMB.force !== 'cricket') || (kidsPresent() && !ganeshOn());
    if (AMB.S && (!keep || !open || isConfiscated(AMB.S.F) || (AMB.force && AMB.S.id !== AMB.force && AMB.force !== 'cricket') || AMB.force === 'cricket')) endAmbient(false);
    if (AMB.S || !F || !open || isConfiscated(F)) return;
    if (leftovers.some((L) => L.S.F === F)) return;
    const gid = ambientGameFor(F);
    if (gid !== 'lingocha' && gid !== 'marampitti') return;
    const S = createSession(gid, F, { difficulty: 0.35, seed: U.strHash(F.key + ':' + ((N.clock && N.clock.day) || 0)) + Math.floor(minutes() / 60) }, { ambient: true });
    AMB.S = S;
    BUSY.add(F.decorY);
    // ambient kids start already spread over the ground, mid-game
    for (const P of S.parts) if (P.e && P.spot) { const q = spotNear(P.spot.x + (S.rng.next() - 0.5) * 10, P.spot.y + (S.rng.next() - 0.5) * 10, 3, 10); P.e.x = q.x; P.e.y = q.y; }
  }

  /* ================================================================ places_art: hide its gully-cricket kids where we play */
  let paDrawing = false;
  const FILTERED = { n: 0 };
  function installQueueFilter() {
    const R = N.render;
    if (!R || R.__pgFilter) return;
    R.__pgFilter = true;
    const oq = R.queue;
    R.queue = function (layer, key, fn) {
      if (paDrawing && layer === 'actors' && BUSY.size && BUSY.has(key)) { FILTERED.n++; return undefined; }
      return oq.apply(this, arguments);
    };
  }

  /* ================================================================ drawing (top-down) */
  const DRAWQ = { list: [] };
  function shownSessions() {
    DRAWQ.list.length = 0;
    if (current) DRAWQ.list.push(current);
    if (AMB.S) DRAWQ.list.push(AMB.S);
    for (const L of leftovers) DRAWQ.list.push(L.S);
    return DRAWQ.list;
  }
  function draw2D() {
    const R = N.render, D = N.draw;
    if (!R || !D || is3D()) return;
    for (const S of shownSessions()) {
      const F = S.F;
      if (!R.rectInView(F.x0 - 30, F.y0 - 30, F.w + 60, F.h + 60, 40)) continue;
      const done = S.ended;
      if (S.id === 'lingocha') drawLingocha2D(S, R, D);
      // rings under the players (real games): team colours, SAFE halo, the target reticle
      if (S.real && !done) {
        R.queue('ground', 5, () => D.flat((ctx) => {
          for (const P of S.parts) {
            if (!P.e || (P.out && !P.isPlayer)) continue;
            ctx.globalAlpha = P.out ? 0.25 : 0.7;
            ctx.strokeStyle = S.id === 'marampitti' ? (P.isPlayer ? '#f2c230' : 'rgba(244,234,216,0.55)') : (TEAM_COL[P.team] || '#fff');
            ctx.lineWidth = P.isPlayer ? 0.9 : 0.6;
            ctx.beginPath(); ctx.ellipse(P.e.x, P.e.y + 0.6, 4.6, 3.6, 0, 0, TAU); ctx.stroke();
            if (P.safeT > 0) { ctx.globalAlpha = 0.6 + 0.3 * Math.sin(S.t * 14); ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(P.e.x, P.e.y, 6.2, 0, TAU); ctx.stroke(); }
          }
          const T = S.aimTarget;
          if (T && S.me && S.me.hold && T.e) {
            ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 0.8;
            const r = 5.6 + Math.sin(S.t * 10) * 0.5;
            ctx.beginPath(); ctx.arc(T.e.x, T.e.y, r, 0, TAU); ctx.stroke();
            for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + S.t; ctx.beginPath(); ctx.moveTo(T.e.x + Math.cos(a) * (r - 1.6), T.e.y + Math.sin(a) * (r - 1.6)); ctx.lineTo(T.e.x + Math.cos(a) * (r + 1.6), T.e.y + Math.sin(a) * (r + 1.6)); ctx.stroke(); }
          }
          ctx.globalAlpha = 1;
        }));
      }
      // the wind-up telegraph: a dashed red line on the ground from the thrower to the target
      if (S.tele && S.tele.from.e && S.tele.to.e && !done) {
        const a = S.tele.from.e, b = S.tele.to.e;
        R.queue('ground', 6, () => D.flat((ctx) => {
          ctx.globalAlpha = 0.55; ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 0.7; ctx.setLineDash([2.2, 2.2]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }));
      }
      // the ball (and its shadow)
      const bl = S.ball;
      if (!bl.hiddenBall && !(done && !S.real)) {
        const bx = bl.x, by = bl.y, bz = bl.z;
        R.queue('shadow', 1, () => D.shadow(bx, by, 2, 2, 0, bz + 0.6));
        R.queue('actors', by + 0.05, (ctx) => {
          const k = R.k(bz + TUNE.ballR), X = R.sx(bx, k), Y = R.sy(by, k), r = Math.max(1.3, 1.25 * k);
          ctx.fillStyle = '#1a1214'; ctx.beginPath(); ctx.arc(X, Y, r + 0.7, 0, TAU); ctx.fill();
          ctx.fillStyle = '#d6ea4c'; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(X - r * 0.3, Y - r * 0.2, r * 0.7, -0.6, 1.2); ctx.stroke();
        });
      }
      // the aim preview: the arc of the line throw
      if (S.real && S.me && S.id === 'lingocha' && S.phase === 'aim' && S.L.thrower === S.me && !done) drawAimArc(S, R);
    }
  }
  function stoneDraw(D, st, x, y, z) {
    // drawn a little larger than the physics size so the stones read from the kite's-eye view
    D.cyl(x, y, st.r * 1.25 + 0.35, z, z + TUNE.stoneH + 0.12, { wall: '#1a1214', roof: '#1a1214', grad: false });
    D.cyl(x, y, st.r * 1.25, z + 0.05, z + TUNE.stoneH, { wall: st.col, roof: U.shade(st.col, 1.22), grad: false });
  }
  function drawLingocha2D(S, R, D) {
    const L = S.L;
    // chalk: the throwing line and the ring round the stack
    R.queue('ground', 4, () => D.flat((ctx) => {
      const ln = L.line, vx = -ln.dy, vy = ln.dx;
      ctx.strokeStyle = 'rgba(248,246,236,0.78)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(ln.x - vx * 11, ln.y - vy * 11); ctx.lineTo(ln.x + vx * 11, ln.y + vy * 11); ctx.stroke();
      ctx.setLineDash([1.6, 1.4]); ctx.beginPath(); ctx.arc(L.base.x, L.base.y, 6.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }));
    // the stack (one item) and loose / flying stones
    if (L.stack.length) {
      const bx = L.base.x, by = L.base.y, list = L.stack.slice();
      R.queue('shadow', 1, () => D.shadow(bx, by, 5.4, 5.4, 0, 1));
      R.queue('actors', by, () => { list.forEach((st, i) => stoneDraw(D, st, bx + Math.sin(i * 2.3) * 0.25, by + Math.cos(i * 1.7) * 0.2, i * TUNE.stoneH)); });
    }
    // Chinnu seeking: a soft chalk ring marks the stones lying about (easy to spot among the dust)
    if (S.real && S.me && !S.me.out && S.me.team === L.seek && (S.phase === 'live' || S.phase === 'scatter') && !S.ended) {
      R.queue('ground', 4, () => D.flat((ctx) => {
        ctx.strokeStyle = 'rgba(255,240,190,' + (0.45 + 0.25 * Math.sin(S.t * 6)).toFixed(2) + ')'; ctx.lineWidth = 0.6;
        for (const st of L.stones) if (st.state === 'loose') { ctx.beginPath(); ctx.arc(st.x, st.y, st.r * 1.25 + 1.6, 0, TAU); ctx.stroke(); }
      }));
    }
    for (const st of L.stones) {
      if (st.state === 'stack') continue;
      const x = st.x, y = st.y, z = st.z;
      if (st.state !== 'carried') R.queue('shadow', 1, () => D.shadow(x, y, st.r * 2, st.r * 1.8, st.rot, z + 0.3));
      R.queue('actors', st.state === 'carried' ? y + 0.04 : y, () => stoneDraw(D, st, x, y, z));
    }
  }
  function drawAimArc(S, R) {
    const A = S.aim, p = N.player, pw = A.charging || A.dragging ? A.p : 0.5;
    const sp = TUNE.aim.min + TUNE.aim.span * pw, vz0 = sp * TUNE.aim.elev + (pw > 0.86 ? (pw - 0.86) * 80 : 0);
    R.queue('sky', 2, (ctx) => {
      let x = p.x + Math.cos(A.ang) * 2.4, y = p.y + Math.sin(A.ang) * 2.4, z = TUNE.hand, vz = vz0;
      const vx = Math.cos(A.ang) * sp, vy = Math.sin(A.ang) * sp, dt = 0.018;
      const col = A.charging || A.dragging ? (pw > 0.86 ? '#ff6a5a' : pw < 0.25 ? '#f2c230' : '#8fe07a') : '#f8f6ec';
      for (let i = 0; i < 28; i++) {
        x += vx * dt; y += vy * dt; vz -= TUNE.g * dt; z += vz * dt;
        if (z <= 0) {
          const q = R.proj(x, y, 0);
          ctx.fillStyle = '#1a1214'; ctx.fillRect(q.x - 3, q.y - 1, 6, 2); ctx.fillRect(q.x - 1, q.y - 3, 2, 6);
          ctx.fillStyle = col; ctx.fillRect(q.x - 2.5, q.y - 0.5, 5, 1); ctx.fillRect(q.x - 0.5, q.y - 2.5, 1, 5);
          break;
        }
        if (i % 2) continue;
        const q = R.proj(x, y, z);
        ctx.fillStyle = '#1a1214'; ctx.fillRect(q.x - 1.4, q.y - 1.4, 2.8, 2.8);
        ctx.fillStyle = col; ctx.fillRect(q.x - 0.8, q.y - 0.8, 1.6, 1.6);
      }
    });
  }

  /* ================================================================ DOM: HUD panel + pops */
  const HUDS = { root: null, pops: null, k: {}, shown: false, t: 0 };
  function hudEnsure() {
    if (HUDS.root && HUDS.root.isConnected) return HUDS.root;
    const top = document.querySelector('#ui .hud-top') || document.getElementById('ui') || document.body;
    const r = document.createElement('div');
    r.className = 'pg-hud';
    r.setAttribute('role', 'status');
    r.innerHTML = '<div class="pg-l1"><b class="pg-title"></b><span class="pg-score"></span><span class="pg-time"></span></div>' +
      '<div class="pg-l2"></div><div class="pg-prompt"></div><div class="pg-power"><i></i><b></b></div>';
    top.insertBefore(r, top.firstChild);
    HUDS.root = r;
    HUDS.k = { title: r.querySelector('.pg-title'), score: r.querySelector('.pg-score'), time: r.querySelector('.pg-time'), sub: r.querySelector('.pg-l2'), prompt: r.querySelector('.pg-prompt'), power: r.querySelector('.pg-power'), bar: r.querySelector('.pg-power b') };
    HUDS.last = {};
    return r;
  }
  function popsEnsure() {
    if (HUDS.pops && HUDS.pops.isConnected) return HUDS.pops;
    const host = document.getElementById('ui') || document.body;
    const c = document.createElement('div');
    c.className = 'pg-pops';
    c.setAttribute('aria-hidden', 'true');
    host.appendChild(c);
    HUDS.pops = c;
    return c;
  }
  function hudShow(on) {
    try {
      const r = hudEnsure();
      r.classList.toggle('show', !!on);
      HUDS.shown = !!on;
      if (!on) HUDS.last = {};
    } catch (e) { N.err('pg.hud', e); }
  }
  function setTxt(key, el, v) { if (HUDS.last[key] !== v) { HUDS.last[key] = v; el.textContent = v; } }
  function hudUpdate(S) {
    HUDS.t -= N.time.dt || 0.016;
    const A = S.aim;
    const k = HUDS.k;
    if (!HUDS.root) hudEnsure();
    // power bar every frame while charging
    const charging = S.id === 'lingocha' && S.phase === 'aim' && S.L.thrower === S.me && (A.charging || A.dragging);
    if (HUDS.last.pw !== charging) { HUDS.last.pw = charging; k.power.classList.toggle('on', charging); }
    if (charging) { const v = Math.round(A.p * 100); if (HUDS.last.pv !== v) { HUDS.last.pv = v; k.bar.style.width = v + '%'; k.power.dataset.zone = A.p > 0.86 ? 'hard' : A.p < 0.25 ? 'soft' : 'good'; } }
    if (HUDS.t > 0) return;
    HUDS.t = 0.1;
    const h = S.G.hud(S);
    setTxt('title', k.title, S.params.title || h.title);
    setTxt('score', k.score, h.score);
    setTxt('time', k.time, h.timer == null ? '' : fmtSecs(h.timer));
    const warn = h.timer != null && h.timer < 10;
    if (HUDS.last.warn !== warn) { HUDS.last.warn = warn; k.time.classList.toggle('warn', warn); }
    setTxt('sub', k.sub, h.sub);
    let pr = '';
    try { pr = S.G.prompt(S); } catch (e) { pr = ''; }
    setTxt('prompt', k.prompt, pr);
    S.ui.prompt = pr;
  }
  function fmtSecs(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function popsDraw() {
    const list = shownSessions();
    let any = false;
    for (const S of list) if (S.pops.length) { any = true; break; }
    if (!any && !HUDS.pops) return;
    const host = popsEnsure();
    const R = N.render, three = is3D();
    let rect = null;
    try { rect = R.canvas.getBoundingClientRect(); } catch (e) { rect = null; }
    if (!three && (!rect || !rect.width)) return;
    const live = N.state.mode === 'play';
    host.classList.toggle('hide', !live);
    for (const S of list) {
      for (const pp of S.pops) {
        if (!pp.el) { pp.el = document.createElement('div'); pp.el.className = 'pg-pop' + (pp.big ? ' big' : ''); pp.el.textContent = pp.text; pp.el.style.setProperty('--c', pp.col); host.appendChild(pp.el); }
        let x, y;
        if (three) {
          const q = N.view3d.project(pp.x, pp.y, (pp.h + pp.t * 6) * 0.9);
          if (!q.visible) { pp.el.style.opacity = '0'; continue; }
          x = q.x; y = q.y;
        } else {
          const q = R.proj(pp.x, pp.y, pp.h + pp.t * 6);
          x = rect.left + (q.x / R.W) * rect.width; y = rect.top + (q.y / R.H) * rect.height;
        }
        const a = clamp(Math.min(pp.t * 8, (pp.life - pp.t) * 4), 0, 1);
        pp.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%) scale(' + (0.8 + Math.min(1, pp.t * 6) * 0.25).toFixed(3) + ')';
        pp.el.style.opacity = a.toFixed(2);
      }
    }
  }

  /* ================================================================ 3D layer */
  const V3L = { grp: null, ball: null, bsh: null, stones: [], chalk: null, ring: null, arrow: null, rings: [], reticle: null, tele: null, T: null, H: null, ok: false };
  function v3Init(THREE, H) {
    V3L.T = THREE; V3L.H = H;
    const g = new THREE.Group(); g.name = 'pg-games'; g.visible = false;
    H.layer.add(g); V3L.grp = g;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(TUNE.ballR, 14, 10), H.mat('#d6ea4c'));
    ball.castShadow = true; g.add(ball); V3L.ball = ball;
    const bsh = H.blobShadow(2.2); g.add(bsh); V3L.bsh = bsh;
    V3L.stones = TUNE.stoneR.map((r, i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.93, TUNE.stoneH, 16), H.mat(TUNE.stoneCols[i]));
      m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    });
    const chalkMat = H.mat('#f4f2ea', { basic: true, transparent: true, opacity: 0.8 });
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(22, 0.8), chalkMat); chalk.rotation.x = -Math.PI / 2; chalk.userData.noShadow = true; g.add(chalk); V3L.chalk = chalk;
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.1, 6.8, 40), chalkMat); ring.rotation.x = -Math.PI / 2; ring.userData.noShadow = true; g.add(ring); V3L.ring = ring;
    // aim arrow: a shaft and a head, lying on the ground
    const arrow = new THREE.Group();
    const amat = H.mat('#f2c230', { basic: true, transparent: true, opacity: 0.85, double: true });
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.1), amat); shaft.rotation.x = -Math.PI / 2; shaft.position.x = 0.5; arrow.add(shaft);
    const sh = new THREE.Shape(); sh.moveTo(0, -2.4); sh.lineTo(3.6, 0); sh.lineTo(0, 2.4); sh.lineTo(0, -2.4);
    const head = new THREE.Mesh(new THREE.ShapeGeometry(sh), amat); head.rotation.x = -Math.PI / 2; arrow.add(head);
    arrow.userData = { shaft, head, mat: amat };
    g.add(arrow); V3L.arrow = arrow;
    const rmat = TEAM_COL.map((c) => H.mat(c, { basic: true, transparent: true, opacity: 0.75, double: true }));
    const wmat = H.mat('#f4ead8', { basic: true, transparent: true, opacity: 0.45, double: true });
    const smat = H.mat('#7fe0ff', { basic: true, transparent: true, opacity: 0.8, double: true });
    const rgeo = new THREE.RingGeometry(3.6, 4.3, 24);
    V3L.rmat = rmat; V3L.wmat = wmat; V3L.smat = smat;
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(rgeo, rmat[0]); m.rotation.x = -Math.PI / 2; m.visible = false; g.add(m); V3L.rings.push(m); }
    const ret = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.6, 28), H.mat('#ff5a4a', { basic: true, transparent: true, opacity: 0.9, double: true }));
    ret.rotation.x = -Math.PI / 2; ret.visible = false; g.add(ret); V3L.reticle = ret;
    const tele = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), H.mat('#ff5a4a', { basic: true, transparent: true, opacity: 0.55, double: true }));
    tele.rotation.x = -Math.PI / 2; tele.visible = false; g.add(tele); V3L.tele = tele;
    g.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2; } });
    V3L.ok = true;
  }
  function v3Update(dt, H) {
    if (!V3L.ok) return;
    const g = V3L.grp;
    const S = current || AMB.S || (leftovers.length ? leftovers[leftovers.length - 1].S : null);
    const f = N.view3d && N.view3d.focus ? N.view3d.focus() : N.player;
    if (!S || !f || rectDist(S.F, f.x, f.y) > 700) { g.visible = false; return; }
    g.visible = true;
    const hAt = (x, y) => { try { return (H.heightAt ? H.heightAt(x, y) : 0) || 0; } catch (e) { return 0; } };
    const b = S.ball;
    const showBall = !b.hiddenBall && !(S.ended && !S.real);
    V3L.ball.visible = showBall; V3L.bsh.visible = showBall;
    if (showBall) {
      const gh = hAt(b.x, b.y);
      V3L.ball.position.set(b.x, gh + b.z + TUNE.ballR, b.y);
      V3L.bsh.position.set(b.x, gh + 0.09, b.y);
      const s = clamp(1 - b.z / 30, 0.35, 1); V3L.bsh.scale.set(2.2 * s, 1, 2.2 * s);
    }
    const ling = S.id === 'lingocha' && S.L;
    V3L.chalk.visible = V3L.ring.visible = !!ling;
    V3L.stones.forEach((m) => { m.visible = !!ling; });
    if (ling) {
      const L = S.L, ln = L.line;
      V3L.chalk.position.set(ln.x, hAt(ln.x, ln.y) + 0.07, ln.y);
      V3L.chalk.rotation.z = -Math.atan2(-ln.dx, -ln.dy) + Math.PI / 2;
      V3L.chalk.rotation.set(-Math.PI / 2, 0, Math.atan2(ln.dy, ln.dx) * -1 + Math.PI / 2);
      V3L.ring.position.set(L.base.x, hAt(L.base.x, L.base.y) + 0.07, L.base.y);
      const bh = hAt(L.base.x, L.base.y);
      L.stack.forEach((st, i) => { const m = V3L.stones[st.i]; m.position.set(L.base.x + Math.sin(i * 2.3) * 0.25, bh + i * TUNE.stoneH + TUNE.stoneH / 2, L.base.y + Math.cos(i * 1.7) * 0.2); m.rotation.set(0, i * 0.7, 0); });
      for (const st of L.stones) {
        if (st.state === 'stack') continue;
        const m = V3L.stones[st.i];
        m.position.set(st.x, hAt(st.x, st.y) + st.z + TUNE.stoneH / 2, st.y);
        m.rotation.set(st.state === 'fly' ? st.rot : 0, st.rot * 0.3, st.state === 'fly' ? st.rot * 0.7 : 0);
      }
    }
    // aim arrow (Chinnu at the line)
    const aiming = S.real && !S.ended && ling && S.phase === 'aim' && S.L.thrower === S.me;
    V3L.arrow.visible = !!aiming;
    if (aiming) {
      const p = N.player, A = S.aim, len = 8 + (A.charging || A.dragging ? A.p : 0.4) * 22;
      const ud = V3L.arrow.userData;
      ud.shaft.scale.set(len, 1, 1); ud.shaft.position.set(len / 2 + 2.5, 0, 0); ud.head.position.set(len + 2.5, 0, 0);
      ud.mat.color.set(A.charging || A.dragging ? (A.p > 0.86 ? '#ff6a5a' : A.p < 0.25 ? '#f2c230' : '#8fe07a') : '#f2c230');
      V3L.arrow.position.set(p.x, hAt(p.x, p.y) + 0.1, p.y);
      V3L.arrow.rotation.set(0, -A.ang, 0);
    }
    // rings
    let ri = 0;
    if (S.real && !S.ended) {
      for (const P of S.parts) {
        if (ri >= V3L.rings.length || !P.e || (P.out && !P.isPlayer)) continue;
        const m = V3L.rings[ri++];
        m.visible = true;
        m.material = P.safeT > 0 ? V3L.smat : S.id === 'marampitti' ? (P.isPlayer ? V3L.rmat[0] : V3L.wmat) : V3L.rmat[P.team] || V3L.wmat;
        m.position.set(P.e.x, hAt(P.e.x, P.e.y) + 0.06, P.e.y);
        const sc = P.safeT > 0 ? 1.4 : 1; m.scale.set(sc, sc, sc);
      }
    }
    for (; ri < V3L.rings.length; ri++) V3L.rings[ri].visible = false;
    const T = S.real && S.me && S.me.hold ? S.aimTarget : null;
    V3L.reticle.visible = !!(T && T.e);
    if (T && T.e) { V3L.reticle.position.set(T.e.x, hAt(T.e.x, T.e.y) + 0.08, T.e.y); V3L.reticle.rotation.z = S.t * 2; }
    const tl = S.tele;
    V3L.tele.visible = !!(tl && tl.from.e && tl.to.e && !S.ended);
    if (V3L.tele.visible) {
      const a = tl.from.e, c = tl.to.e, l = hyp(c.x - a.x, c.y - a.y);
      V3L.tele.scale.set(l, 1, 1);
      V3L.tele.position.set((a.x + c.x) / 2, hAt(a.x, a.y) + 0.09, (a.y + c.y) / 2);
      V3L.tele.rotation.set(-Math.PI / 2, 0, -Math.atan2(c.y - a.y, c.x - a.x));
    }
    void dt;
  }
  function v3Dispose(H) {
    if (V3L.grp) { try { H.layer.remove(V3L.grp); H.dispose(V3L.grp); } catch (e) { /* ignore */ } }
    V3L.grp = null; V3L.ok = false; V3L.rings = []; V3L.stones = [];
  }

  /* ================================================================ interact offers ("Join lingocha") */
  const offerIds = [];
  function installOffers() {
    const I = N.interact;
    if (!I || !I.add) return;
    for (const k of offerIds) { try { I.remove(k); } catch (e) { /* ignore */ } }
    offerIds.length = 0;
    for (const F of fieldList) {
      for (const gid of ['lingocha', 'marampitti']) {
        const dy = gid === 'lingocha' ? 24 : -24;
        let q = { x: F.anchor.x, y: F.anchor.y + dy };
        if (!walk(q.x, q.y)) q = { x: F.anchor.x + dy, y: F.anchor.y };
        if (!walk(q.x, q.y)) q = spotNear(q.x, q.y, 2, 16);
        const key = 'pg:' + gid + ':' + F.key;
        offerIds.push(key);
        I.add(key, {
          x: q.x, y: q.y, r: 18, priority: -1,
          label: () => (AMB.S && AMB.S.F === F && AMB.S.id === gid ? 'Join their ' : 'Join ') + (gid === 'lingocha' ? 'lingocha' : 'maram pitti'),
          enabled: () => offerOpen(F),
          use: () => { play(gid, { place: F.ids[0], side: true }); },
        });
      }
    }
  }
  function offerOpen(F) {
    if ((N.flags && N.flags.mg_side_off) || current) return false;
    if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) return false;
    if (N.missions && N.missions.active) return false;
    if (N.wanted && N.wanted.level >= 2) return false;
    if (isConfiscated(F)) return false;
    return kidsPresent() || !!(AMB.S && AMB.S.F === F);
  }

  /* ================================================================ N.minigames integration */
  const ALIASES = { seven_stones: 'lingocha', sevenstones: 'lingocha', lagori: 'lingocha', pittu: 'lingocha', pithu: 'lingocha', lingocha_game: 'lingocha', lingoch: 'lingocha', maram_pitti: 'marampitti', marampeety: 'marampitti', maram_peety: 'marampitti', picchi_banti: 'marampitti', dodgeball: 'marampitti', maram: 'marampitti' };
  function resolveId(id) {
    if (GAMES[id]) return id;
    if (ALIASES[id]) return ALIASES[id];
    return null;
  }
  const ORIG = { play: null, start: null, abort: null, isOpen: null, active: null };
  function hookMinigames() {
    const MG = N.minigames;
    if (!MG || MG.__pgHooked || typeof MG.register !== 'function') return !!(MG && MG.__pgHooked);
    MG.__pgHooked = true;
    const places = () => fieldList.map((F) => F.key);
    for (const gid of Object.keys(GAMES)) {
      const G = GAMES[gid];
      MG.register({
        id: gid, title: G.title, sub: G.sub, inWorld: true, place: 'playground_1', get places() { return places(); }, secs: gid === 'lingocha' ? 240 : 150,
        howto() { return { lines: [G.sub], goal: '', keys: '', touch: '' }; },
        // never opened as an overlay (play() is routed to the world); a safe stub if it ever is
        setup(g) { g.S.inWorld = true; }, update(g) { if (!g.over && g.finish) g.finish(false, { error: 'in-world' }); }, draw() {},
      });
    }
    if (MG.alias) for (const k in ALIASES) MG.alias[k] = ALIASES[k];
    ORIG.play = MG.play; ORIG.start = MG.start; ORIG.abort = MG.abort; ORIG.isOpen = MG.isOpen.bind(MG);
    const route = (orig) => function (id, params) {
      const gid = (MG.resolve && MG.resolve(id)) || resolveId(id);
      if (gid && GAMES[gid]) return play(gid, params);
      if (current) abort('replaced');
      return orig.call(MG, id, params);
    };
    MG.play = route(ORIG.play);
    MG.start = route(ORIG.start);
    MG.abort = function (reason) { const a = abort(reason); const b = ORIG.abort.call(MG, reason); return a || b; };
    MG.isOpen = function () { return ORIG.isOpen() || !!current; };
    const desc = Object.getOwnPropertyDescriptor(MG, 'active');
    if (desc && desc.configurable) {
      ORIG.active = desc.get;
      Object.defineProperty(MG, 'active', { configurable: true, enumerable: true, get() { return (ORIG.active ? ORIG.active.call(MG) : null) || (current ? current.id : null); } });
    }
    return true;
  }

  /* ================================================================ lifecycle */
  function onWorld() {
    try { buildFields(); } catch (e) { N.err('pg.fields', e); }
    try { installOffers(); } catch (e) { N.err('pg.offers', e); }
    installQueueFilter();
  }
  function resetAll() {
    if (current) { const S = current; hardCleanup(S); const r = S.resolve; S.resolve = null; S.ended = true; if (r) r({ id: S.id, win: false, score: 0, stars: 0, aborted: true, reason: 'reset' }); }
    if (AMB.S) { const S = AMB.S; AMB.S = null; BUSY.delete(S.F.decorY); restoreDoubles(S); spectatorsOff(S); for (const k of S.kids) { try { N.entities.remove(k); } catch (e) { /* ignore */ } } }
    for (const L of leftovers) for (const pp of L.S.pops) if (pp.el) pp.el.remove();
    leftovers.length = 0;
    for (const k of leftKids) { try { N.entities.remove(k); } catch (e) { /* ignore */ } }
    leftKids.length = 0;
    BUSY.clear();
    hudShow(false);
    if (HUDS.pops) HUDS.pops.innerHTML = '';
  }
  hookMinigames();
  N.on('boot', () => { hookMinigames(); onWorld(); });
  N.on('world:built', onWorld);
  for (const ev of ['game:new', 'game:quit', 'save:loaded']) N.on(ev, () => { try { resetAll(); } catch (e) { N.err('pg.reset', e); } });
  N.on('busted', () => { if (current) abort('busted'); });
  N.on('wasted', () => { if (current) abort('wasted'); });
  N.on('player:teleport', (d) => { const S = current; if (S && d && rectDist(S.F, d.x, d.y) > 300) abort('left'); });
  N.on('mission:start', () => { if (AMB.S) endAmbient(false); });

  N.addSystem({ id: 'pg.ctl', order: 15, runIn: ['play'], update: ctlUpdate });
  N.addSystem({
    id: 'pg.sim', order: 26, runIn: ['play'],
    update: simUpdate,
    draw() { try { draw2D(); } catch (e) { N.err('pg.draw', e); } try { popsDraw(); } catch (e) { N.err('pg.pops', e); } },
    reset() { try { resetAll(); } catch (e) { N.err('pg.reset', e); } },
  });
  N.addSystem({ id: 'pg.paOn', order: 42.95, runIn: ['*'], draw() { paDrawing = true; } });
  N.addSystem({ id: 'pg.paOff', order: 43.05, runIn: ['*'], draw() { paDrawing = false; } });
  // view3d.js loads after this file: register the 3D layer once everything is loaded
  function registerV3() {
    if (registerV3.done || !N.view3d || !N.view3d.registerLayer) return;
    registerV3.done = true;
    N.view3d.registerLayer('playgroundGames', {
      order: 60,
      init(THREE, H) { try { v3Init(THREE, H); } catch (e) { N.err('pg.v3init', e); } },
      update(dt, H) { try { v3Update(dt, H); } catch (e) { N.err('pg.v3', e); } },
      dispose(H) { v3Dispose(H); },
    });
  }
  registerV3();
  N.on('boot', registerV3);
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('DOMContentLoaded', registerV3);
  if (N.world && N.world.built) onWorld();

  /* ================================================================ public API + test hooks */
  const PG = (N.playgroundGames = {
    VERSION: 1, TUNE, GAMES,
    play, start: play, abort,
    get current() { return current; },
    isOpen() { return !!current; },
    fields() { return fieldList.map((F) => ({ key: F.key, ids: F.ids.slice(), name: F.name, x0: F.x0, y0: F.y0, x1: F.x1, y1: F.y1, stack: F.stack, line: F.line, centre: F.centre, anchor: F.anchor })); },
    fieldFor(id) { const F = FIELDS.get(id); return F ? PG.fields().find((f) => f.key === F.key) : null; },
    kidsPresent, ambientGameFor: (key) => { const F = FIELDS.get(key); return F ? ambientGameFor(F) : null; },
    ambient: AMB,
    ledger,
    debug: {
      assist: { aim: false, power: null, weakAI: false, noTimer: false, noDodge: false, freezeAI: false },
      session(which) { return which === 'ambient' ? AMB.S : current; },
      state(which) {
        const S = which === 'ambient' ? AMB.S : current;
        if (!S) return null;
        const b = S.ball;
        const out = {
          id: S.id, phase: S.phase, t: +S.t.toFixed(2), place: S.F.key, ambient: S.ambient, d: S.d, ended: S.ended,
          ball: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(2), state: b.state, holder: b.holder ? b.holder.name : null, holderIsMe: !!(b.holder && b.holder.isPlayer), bounced: b.bounced, live: b.live, thrower: b.thrower ? b.thrower.name : null },
          parts: S.parts.map((P) => ({ name: P.name, me: !!P.isPlayer, team: P.team, out: P.out, safe: P.safeT > 0, hold: P.hold, carry: P.carry ? P.carry.i : null, x: +P.e.x.toFixed(1), y: +P.e.y.toFixed(1), npc: P.npc || null, dood: !!P.dood, hits: P.hits, fouls: P.fouls })),
          label: S.ui.label, prompt: S.ui.prompt, aim: { ang: +S.aim.ang.toFixed(3), p: +S.aim.p.toFixed(2), charging: S.aim.charging },
          log: S.log.slice(-60), stats: Object.assign({}, S.stats), auto: !!S.auto, target: S.aimTarget ? S.aimTarget.name : null,
        };
        if (S.L) {
          const L = S.L;
          out.lingocha = { round: L.round, rounds: L.rounds, wins: L.wins.slice(), seek: L.seek === 0 ? 'home' : 'away', mySide: S.me ? (S.me.team === L.seek ? 'seek' : 'hit') : null, tries: L.tries, stack: L.stack.length, timer: +L.timer.toFixed(1), thrower: L.thrower ? L.thrower.name : null, hist: L.hist.slice(),
            stones: L.stones.map((s) => ({ i: s.i, state: s.state, x: +s.x.toFixed(1), y: +s.y.toFixed(1) })), base: L.base, line: L.line, teams: S.teamName };
        }
        if (S.M) out.maram = { timeLeft: +S.M.timeLeft.toFixed(1), alive: MARAM.alive(S).length, tosses: S.M.tosses };
        return out;
      },
      log(which) { const S = which === 'ambient' ? AMB.S : current; return S ? S.log.slice() : []; },
      part(name) { const S = current; return S ? S.parts.find((P) => P.name === name || (name === 'me' && P.isPlayer)) || null : null; },
      give(name) { const S = current; const P = PG.debug.part(name); if (!S || !P) return false; give(S, P); return true; },
      out(name) { const S = current; const P = PG.debug.part(name); if (!S || !P) return false; setOut(S, P, null, 'debug'); return true; },
      /** a live ball from `from` (default: a kid of the other side) that hits the player on the body now */
      hitPlayer(z) {
        const S = current; if (!S || !S.me) return false;
        const p = N.player, from = S.parts.find((P) => !P.isPlayer && !P.out && (S.id !== 'lingocha' || P.team !== S.me.team)) || S.parts.find((P) => !P.isPlayer);
        if (!from) return false;
        release(S, from, Math.atan2(p.y - from.e.y, p.x - from.e.x), 150, 0, { quiet: true });
        const b = S.ball; b.x = p.x - Math.cos(Math.atan2(p.y - from.e.y, p.x - from.e.x)) * 6; b.y = p.y - Math.sin(Math.atan2(p.y - from.e.y, p.x - from.e.x)) * 6; b.z = z == null ? 2.6 : z; b.vz = 0;
        return true;
      },
      /** make `who` (default: the player) throw a live ball at `name` */
      throwAt(name, who) {
        const S = current; if (!S) return false;
        const T = PG.debug.part(name), P = who ? PG.debug.part(who) : S.me;
        if (!T || !P) return false;
        if (!P.hold) give(S, P);
        if (P.isPlayer) playerThrow(S, T, false); else LING.aiThrowAt(S, P, T);
        return true;
      },
      /** stack n of the loose stones at once (as the first seeker who is in) */
      restack(n) {
        const S = current; if (!S || !S.L) return 0;
        const L = S.L; let k = 0;
        const P = LING.seekers(S).find((q) => !q.out) || LING.seekers(S)[0];
        for (const st of L.stones) {
          if (k >= (n || 7) || L.stack.length >= 7) break;
          if (st.state === 'stack') continue;
          if (st.state === 'carried' && st.by && st.by !== P) { st.by.carry = null; st.by.act = null; }
          if (P.carry && P.carry !== st) { LING.stackStone(S, P); k++; if (k >= (n || 7) || L.stack.length >= 7) break; }
          if (P.carry !== st) { st.state = 'loose'; st.by = null; LING.pickStone(S, P, st); }
          LING.stackStone(S, P); k++;
        }
        return k;
      },
      /** knock the stack down now (a perfect try) */
      knock() { const S = current; if (!S || !S.L || S.L.knocked) return false; const L = S.L; const b = S.ball; const T = L.thrower || S.me; if (b.holder) b.holder.hold = false; b.state = 'air'; b.thrower = T; b.x = L.base.x - L.line.dx * 4; b.y = L.base.y - L.line.dy * 4; b.z = 2; b.vx = L.line.dx * 140; b.vy = L.line.dy * 140; b.vz = 0; b.live = false; S.phase = 'flight'; S.phaseT = 0; LING.knock(S, b); return true; },
      finishRound(winner) { const S = current; if (!S || !S.L) return false; LING.endRound(S, winner === 'away' || winner === 1 ? 1 : 0, 'debug'); return true; },
      setTimer(s) { const S = current; if (!S) return false; if (S.L) S.L.timer = s; if (S.M) S.M.timeLeft = s; return true; },
      breakWindow() { const S = current; if (!S) return false; windowBreak(S, S.F.x1 + 6, S.F.cy, S.me); return true; },
      ballTo(x, y, z, vx, vy, vz, live) { const S = current || AMB.S; if (!S) return false; const b = S.ball; if (b.holder) b.holder.hold = false; Object.assign(b, { x, y, z: z || 0, vx: vx || 0, vy: vy || 0, vz: vz || 0, state: z > 0 || vz ? 'air' : 'rest', holder: null, live: !!live, bounced: live ? 0 : 1, hitSet: new Set() }); return true; },
      toss() { const S = current; if (!S || !S.M) return false; S.auto = null; MARAM.toss(S); return true; },
      end(win) { const S = current; if (!S) return false; endSession(S, !!win, { reason: 'debug' }); return true; },
      fields: () => fieldList,
      /** AI-only fast simulation (balance tuning / rules sanity): {rounds | survivors, log} */
      simulate(gid, place, secs, o) {
        o = o || {};
        const F = FIELDS.get(place) || fieldList[0];
        if (!F || !GAMES[gid]) return null;
        const S = createSession(gid, F, { difficulty: o.difficulty == null ? 0.4 : o.difficulty, seed: o.seed || 1 }, { ambient: true });
        S.logMax = 20000;
        const dt = 1 / 60, n = Math.round((secs || 120) * 60);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) stepSession(S, dt);
        const out = { ms: Math.round(performance.now() - t0), t: S.t, log: S.log.filter((e) => /out|knock|lingocha|round_end|catch|head_foul|restack|safe|kick|grab|toss|window|ball_back/.test(e.type)).map((e) => e.type) };
        if (o.full) out.full = S.log.slice();
        if (S.L) out.rounds = S.L.hist.slice();
        if (S.M) out.tosses = S.M.tosses;
        const counts = {}; for (const e of S.log) counts[e.type] = (counts[e.type] || 0) + 1; out.counts = counts;
        for (const k of S.kids) { try { N.entities.remove(k); } catch (e) { /* ignore */ } }
        restoreDoubles(S); spectatorsOff(S);
        S.ended = true;
        return out;
      },
      kidCount() { return N.entities.all.filter((e) => e.pgKid && e.alive !== false).length; },
      busy() { return Array.from(BUSY); },
      filtered: FILTERED,
      v3: V3L,
    },
  });
})();
