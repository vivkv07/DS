/* NOSTALGIA — playground_games.js  (owner: playground-games developer)
 * The colony-ground games of places_registry "Round 14" (binding), played IN THE WORLD on the real
 * playgrounds (places of kind 'playground', ids playground_*) by Chinnu with his own controls, next to
 * gully cricket:
 *   lingocha    LINGOCHA (seven stones / lagori / pittu). A stack of seven flat stones and a soft tennis
 *               ball. Two teams of 3-5. The seekers throw at the stack from a chalk line (3 tries); the
 *               stones scatter; then the seekers pick the stones up one by one and restack them while the
 *               hitters chase the ball and throw it at them: hit = out (dodging works, a touch on a hitter
 *               makes you SAFE for a moment, little Chitti is doodh-bhaat and never counts). Rebuild all
 *               seven and it is "LINGOCHA!". Roles swap every round; best of 3. A passer-by in the line throw:
 *               the AI thrower waits for him, Chinnu's prompt says so, and a throw into him is taken again.
 *   marampitti  MARAM PITTI (Telugu "picchi banti", Indian dodgeball). Free for all, 6-10 kids. The ball
 *               is tossed up and must BOUNCE before anyone grabs it (every throw: only a catch on the full
 *               is allowed, and a catch puts the thrower out). Whoever holds it throws at the others; a
 *               hit on the full = out; no head shots (a foul, kid-friendly, comic "thwack", nobody gets
 *               hurt); RUN dodges. Last one standing wins.
 * WITH FRIENDS (N.party, src/party.js, ARCHITECTURE §24): registered as 'lingocha' and 'maram_pitti' (1-3 players,
 * kind 'score', solo too). Friends from the online room take the places AI kids hold (lingocha: they captain opposite
 * teams, slot 0 + 2 home, slot 1 away; maram pitti: all in one ring) and colony kids fill the rest. The challenger's
 * page HOSTS the one real game; every friend's page shows it (snapshots ~9/s + the moments: pops, barks, sounds,
 * banners) and plays its own Chinnu, sending what he does (pick / stack a stone, grab / throw, the line throw, a catch
 * try) as commands; a live ball reaching a friend is judged on HIS page (lag-compensated: his position history against
 * the throw's path) and reported. Everybody meets at the ground on the 3-2-1; a friend who leaves is replaced by a
 * colony kid; the host leaving ends it. Results go to the party card (lingocha: the winning side first; maram pitti:
 * places), a tin token on the first win. Alone, no prompt of their own (the "Join ..." offers stay the solo games); in a
 * room the "... with friends" prompt stands on each ground's Join offer. Solo through N.party: Immu and Ayesha join
 * Chinnu's team / the ring. Details: the NET section below.
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
 *   move = walk, RUN = run (maram pitti: a RUN tap is a short committed dodge hop; with no direction held it goes
 *   across the thrower's line), ACTION = the context action shown on the button / prompt: pick up / stack a stone,
 *   grab the ball, throw (tap = normal, hold = hard throw), catch. Lingocha line throw: ←/→ (or a pad stick /
 *   mouse pointer / the 3D camera) aims, hold ACTION (or the mouse button) to charge the power and let go to
 *   throw; on touch screens (top-down) pull back from the stack — a drag on the picture, or the stick, which is a
 *   catapult at the line — and let go. Aim assist on phones / with Assist (it passes over a SAFE seeker). After a
 *   free-roam game "Play again" stays under Chinnu for a few seconds.
 *   An AI kid's wind-up is a red line that fills like a fuse from him to his mark; he commits his aim TUNE.lockT before
 *   letting go (the fuse turns gold), so a hop / sidestep from then on beats the throw and an early one is re-aimed at.
 *   The kid under Chinnu's reticle runs across his aim and turns back now and then (throw just after he turns).
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
 *     per second), N.render.baseZoom (top-down: zoomed in to fit the ground, 1-2.2, 2.6 on an upright phone) during a real game,
 *     N.input.setLabel('run', 'DODGE'); mission givers' when() is wrapped once so no giver's J-card starts a
 *     mission while a game is on (the colony ground carries the gully-league giver), and a giver whose ring Chinnu
 *     stands in when the game ends waits till he has walked out of it (r + 24 u, as missions.js after a mission).
 *   - N.traffic: its 'playground' crowd zone is moved to the sideline during a game (spectators) and its kids
 *     already out on the pitch are sent there at once (ped.tgt cleared); put back when the game ends.
 *   - N.wanted.addHeat(15, 'ball') when Chinnu's throw hits an adult passer-by; a broken window (Chinnu's ball
 *     into a house at window height) ends the game comically (+30 heat, the aunty keeps the ball for the day).
 *   - N.npcs: looks, names and bark speakers of Immu, Ayesha, Chitti, Bunty-anna, Babloo, Tiger; an actor of
 *     the same character already standing at the ground is hidden while its double plays (restored after).
 *   - HUD: a compact panel (.pg-hud) inside #hud .hud-top, DOM pops (.pg-pops) over the 2D / 3D view,
 *     N.hud.banner / toast; N.audio.sfx; N.dialogue.bark; events minigame:start / end / event.
 * TEST: node tests/playground_games.cjs (ONLY=party: solo through N.party) · node tests/party_games.cjs (friends in a
 *   room, two / three pages against tests/online_mock.cjs)
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
    bounce: 0.56, bounceFric: 0.8, rollFric: 58, rollDrag: 0.75, kerb: 0.45, kerbM: 8, wallE: 0.5, bumpy: 0.16, outerM: 16, roughMul: 4,
    kidWalk: 42, kidRun: 64, kidRunD: 12, kidR: 3.2, holdWalk: 0.68, carryMul: 0.78,
    stoneR: [2.6, 2.3, 2.05, 1.8, 1.55, 1.35, 1.15], stoneH: 0.78,
    // broken Shahabad / Kadapa floor slabs and sandstone: what colony kids stack (contrast on red dust)
    stoneCols: ['#55636f', '#c9a77c', '#4b5763', '#dcc7a2', '#66737f', '#b88f62', '#7e8b97'],
    lineDist: 30,
    throwSpeed: 160, powerSpeed: 214, aiSpeed: [138, 180], passSpeed: 115,
    // (balance, AI-only sims over 8 grounds: seekers restack ~47% of rounds, all out ~48%, three misses ~5%; the
    // wind-up is long enough to read the fuse; SAFE only for a touch a seeker went for)
    lingocha: { tries: 3, rounds: 3, team: 4, live: [100, 72], safeT: 2.4, safeCD: 5, holdMax: 3.2, guardR: 13, kick: 92, pickT: 0.55, stackT: 0.85, threatR: 34, scatter: 0.8, aiErr: [0.28, 0.16], stackErr: [0.17, 0.11], dodge: [0.25, 0.55], windup: [0.78, 0.5],
      // Chinnu's own hands: a pick-up and a careful placing take a moment (he stands still, a sitting duck)
      myPickT: 0.45, myStackT: 0.75, knockMul: 1.3, stoneFric: 95, passMe: 0.55,
      // the other team in a real match plays this much above the game's difficulty (Chinnu is better than the AI kid
      // he stands in for); meW: AI hitters' pick of a mark counts Chinnu this much nearer (bots: ~60% match wins)
      rival: 0.12, meW: 0.8 },
    // the kid under Chinnu's reticle runs across his aim, turning back every dance s (d 0..1, x0.7..1.3) so a lead
    // can guess wrong (throw just after he turns); he backs off when Chinnu is nearer than danceAway u
    dance: [1.1, 0.65], danceAway: 36, danceSp: 0.9,
    // with the ball you only shuffle (holdWalk x walk): you throw from about where you picked it up
    // minD: a holder steps back (backWalk x walk) rather than throw at a kid nearer than this (point-blank is
    // unsporting and undodgeable); spread: kids keep this far apart while they scatter (no clumps)
    // range: a holder winds up once his mark is nearer than this (u; d 0..1); aiErr: his aim error (rad); meW: Chinnu
    // counts as this much nearer when a holder picks his mark (everybody wants the new hero out)
    maram: { kids: 8, time: 150, holdMax: 3.2, tossVz: 70, fouls: 3, closeD: 15, dashV: 95, dashCD: 0.8, keepAway: 46, holdWalk: 0.22, look: [0.55, 1.3], range: [36, 48], aiErr: [0.15, 0.09], meW: 0.8, minD: 18, backWalk: 0.4, spread: 13, hopT: 0.16, bound: 10, boundT: 4, lineWarn: 7 },
    // AI wind-up: the red line fills like a fuse; the thrower commits his aim lockT s (d 0..1) before he lets go, so
    // a hop / sidestep from then on dodges (an early one is simply re-aimed at)
    lockT: [0.26, 0.18],
    // the kid under Chinnu's reticle is watching him: the chance he jukes as Chinnu lets go (d 0..1); a hard throw
    // (held ACTION) is that much harder to read (x alertHard)
    alert: [0.25, 0.45], alertHard: 0.6,
    // the line throw: the aim starts a little off the stack (straighten it), accuracy drops with power
    aim: { rotKey: 0.95, cycle: 1.25, assistSnap: 0.14, elev: 0.085, min: 85, span: 150, drag: 130, startOff: [0.06, 0.2], err: 0.026, errPow: 0.075 },
    pay: { win: 200, win3: 300, daily: 3 },
    ambient: { r: 640, far: 820, rest: 5, barkGap: [3.5, 7.5], kids: 6 },
    // top-down zoom during a game: [min, max, max on an upright phone]; the margin round the ground (u)
    clockRate: 0.25, zoom: [1, 2.2, 2.6], zoomPad: 110, zoomPadTall: 46, leaveR: 70, leaveT: 5,
    // catching (maram pitti): ACTION raises the hands for catchWin s (x1.4 with Assist / touch), then a short cooldown
    catchWin: 0.42, catchCD: 0.75,
    // after a throw the thrower may not pick his own ball up again for relock s (somebody else's turn);
    // a ball that hits a kid pops off sideways (deflect: speed range, up speed) so there is a scramble for it
    relock: 1.4, deflect: { sp: [26, 44], vz: 19 },
    // the AI leads a target by its velocity smoothed over leadTau s (a late sidestep beats the lead)
    leadTau: 0.35,
    // a throw is live for its target's distance + overshoot u (the red wind-up line shows that much past him too):
    // a ball that misses its mark dies soon after, it does not knock out a kid on the far side of the ground
    overshoot: 12,
    // a free ball nobody can reach comes back onto the ground ("Ball la, ra!")
    freeMax: { lingocha: 9, marampitti: 6, outside: 3.5 },
    heat: { adult: 15, window: 30 },
    // share of Chinnu's run stamina drain given back during a real game (the legs last twice as long)
    runRefund: 0.5,
    // s the "Play again" offer stays under Chinnu after a free-roam game
    againT: 10,
    // how far Chinnu reaches for a loose ball (u); a kid reaches as far for a ball Chinnu stands on
    myReach: 7.5,
    // with friends (N.party): snapshot every snapEvery s; the roster resent every initEvery s till each friend has it;
    // a friend at the line has lineWait s to throw; what a guest does shows at once and the host's word wins after hold s;
    // hitR: a guest's own hit radius (x TUNE.hitR, a little forgiving for the network); a guest waits guestWait s for
    // the host's roster
    // hitLate: how long after a ball went dead the host still takes a guest's report of it hitting him (network + frames)
    party: { snapEvery: 0.11, initEvery: 0.6, lineWait: 15, hold: 0.7, hitR: 0.9, guestWait: 12, catchExtra: 0.15, hitLate: 1.2 },
  };
  const TEAM_COL = ['#f2c230', '#e2483a'];
  const BOYS = ['Venky', 'Sameer', 'Gopi', 'Raju', 'Sunny', 'Chintu', 'Munna', 'Lucky', 'Sattar', 'Pappu', 'Srinu', 'Kittu', 'Bunny', 'Arif', 'Naveen', 'Pandu', 'Jaffer', 'Ravi'];
  const GIRLS = ['Pinky', 'Swapna', 'Rani', 'Shabana', 'Lata', 'Sweety', 'Bindu', 'Nazia'];
  const BARK = {
    out: ['Out ra!', 'Out! Out!', '*Gaya!* Out!', 'Out, sit down!'],
    safe: ['Safe! Safe!', 'Touched! Safe!'],
    cheat: ['*Nakko*, cheating!', 'Bounce *hone de*!', 'Arre, bounce first!'],
    head: ['*Nakko!* Not the head!', 'Head *pe nakko*, ra!', '*Ayyo*, no head shots!'],
    close: ['Too close, ra! Doesn\'t count!', '*Itna paas se?* Foul!', 'Step back and throw, *yaar*!'],
    dood: ['*Doodh-bhaat!* Doesn\'t count!', 'She\'s *doodh-bhaat*, leave her!'],
    lingocha: ['Lingochaaa!', 'LINGOCHA!'],
    chatter: ['*Phek* ra!', '*Jaldi*, *jaldi*!', 'Idhar! Idhar!', 'Pass *kar*!', '*Bach gaya*!', 'Throw, ra!', 'Too slow, *yaar*!'],
    catch: ['Caught it! You\'re out!', '*Pakda*!'],
    miss: ['*Arre*, missed!', 'Wide, ra!', '*Bach gaya*!'],
    knock: ['*Gira diya*!', 'Down! Run, run!'],
    adult: ['*Arre!* Who threw that?!', 'Oye! Watch the ball!', '*Kaun hai?*'],
    blocked: ['*Arre*, side please! Again!', '*Hatt jao*, ra! Throw again!', 'Somebody walked in — again, again!'],
    window: 'Kaun hai?! Whose ball is this?! I am telling your *Mummy*!',
  };

  /* ================================================================ small helpers */
  const now = () => (N.time && N.time.now) || 0;
  /** a person in the game (not an AI kid): Chinnu on this page, or a friend from the online room (party mode) */
  const human = (P) => !!(P && (P.isPlayer || P.remote));
  /** a kid's name as everybody in the room knows it (a friend's online nickname) */
  const nameOf = (P) => (P && (P.nick || P.name)) || 'Somebody';
  // (NETCAP.S: the party game this page hosts, while it steps: its sounds in the world go to the friends' pages too)
  const NETCAP = { S: null };
  const sfx = (name, o) => {
    try { if (N.audio && N.audio.sfx) N.audio.sfx(name, o || { ui: true }); } catch (e) { /* audio is optional */ }
    if (NETCAP.S && o && o.x != null && !o.ui) NET.ev(NETCAP.S, ['s', name, Math.round(o.x * 10), Math.round(o.y * 10), o.vol == null ? 1 : +(+o.vol).toFixed(2), o.pitch == null ? 1 : +(+o.pitch).toFixed(2), o.delay || 0]);
  };
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
  /** Where the colony regulars sit or stand by schedule (npcs.js: the gate aunties' cement bench at the
   *  home ground): the game keeps off those spots, so nobody pelts the aunties all afternoon. */
  function staticSpots() {
    const out = [];
    try {
      const SC = N.npcs && N.npcs.schedules;
      if (!SC) return out;
      for (const name in SC) {
        for (const e of (SC[name] && SC[name].cast) || []) {
          if (!e || e.counter || e.idle === 'wander' || !e.place) continue;
          const ids = Array.isArray(e.place) ? e.place : [e.place];
          let pl = null;
          for (const id of ids) if (N.places[id]) { pl = N.places[id]; break; }
          if (!pl) continue;
          out.push({ x: pl.x + (e.off ? e.off[0] : 0), y: pl.y + (e.off ? e.off[1] : 0), id: e.id });
        }
      }
    } catch (e) { N.err('pg.spots', e); }
    return out;
  }
  /** the largest axis-aligned rectangle of open ground inside [x0, y0, x1, y1] (4 u cells), or null;
   *  cells within avoid[].r of a regular's spot do not count as open */
  function bestRect(x0, y0, x1, y1, avoid) {
    const C = 4, nx = Math.max(1, Math.floor((x1 - x0) / C)), ny = Math.max(1, Math.floor((y1 - y0) / C));
    if (nx * ny > 40000) return null;
    const good = new Uint8Array(nx * ny);
    const near = (x, y) => { if (avoid) for (const q of avoid) if (hyp(q.x - x, q.y - y) < q.r) return true; return false; };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = x0 + (i + 0.5) * C, y = y0 + (j + 0.5) * C; good[j * nx + i] = openCell(x, y) && !near(x, y) ? 1 : 0; }
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
    // play on the open ground of the park (colony lanes cross some of them), else on the trimmed park; keep
    // 11 u off a regular's bench (the gate aunties sit at the home ground's edge 07-20)
    const avoid = staticSpots().filter((q) => q.x > bb[0] - 20 && q.x < bb[2] + 20 && q.y > bb[1] - 20 && q.y < bb[3] + 20).map((q) => ({ x: q.x, y: q.y, r: 11 }));
    const R = (avoid.length ? bestRect(bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4, avoid) : null) || bestRect(bb[0] - 4, bb[1] - 4, bb[2] + 4, bb[3] + 4) || trimRect(bb[0] + 3, bb[1] + 3, bb[2] - 3, bb[3] - 3);
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

  /** Maram pitti's boundary (TUNE.maram.bound off the open ground): chalk dashes, only where the line runs over
   *  walkable ground (never across a house or a wall). [[x0, y0, x1, y1], ...], cached on the field. */
  function boundSegs(F) {
    if (F.bSegs) return F.bSegs;
    const m = TUNE.maram.bound, x0 = F.x0 - m, y0 = F.y0 - m, x1 = F.x1 + m, y1 = F.y1 + m, segs = [];
    const side = (ax, ay, bx, by) => {
      const L = hyp(bx - ax, by - ay), n = Math.max(1, Math.round(L / 5));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 0.55) / n;
        const sx = lerp(ax, bx, t0), sy = lerp(ay, by, t0), ex = lerp(ax, bx, t1), ey = lerp(ay, by, t1);
        if (walk(sx, sy) && walk(ex, ey)) segs.push([sx, sy, ex, ey]);
      }
    };
    side(x0, y0, x1, y0); side(x1, y0, x1, y1); side(x1, y1, x0, y1); side(x0, y1, x0, y0);
    F.bSegs = segs;
    return segs;
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
    // default ring size follows the ground: 6 kids on a small ground (nowhere to hide), 8 on a big one
    const auto = clamp(Math.round(4 + (F.w * F.h) / 1500), 6, TUNE.maram.kids);
    const n = clamp((o.kids | 0) || auto, 6, 10) - 1;
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

  function newBall() { return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, state: 'rest', holder: null, thrower: null, live: false, pass: false, passTo: null, bounced: 1, releaseT: -9, seq: 0, hitSet: null, lockP: null, lockT: 0 }; }
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
      // a game a mission started (m.minigame) survives that mission's start; a free-roam one does not
      byMission: !!(!o.ambient && N.missions && N.missions.active),
      aim: { ang: 0, p: 0, dir: 1, charging: false, holdT: 0, drag: null, yaw: null },
      ui: { label: '', prompt: '' }, title: params.title || G.title,
      stats: { hits: 0, outs: 0, catches: 0, stacked: 0, fouls: 0, tries: 0 },
      // N.party ctx when friends from the online room play (or the AI friends through the party framework)
      party: !o.ambient && params.party && typeof params.party === 'object' ? params.party : null, net: null,
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
    if (S.net && S.net.host) NET.ev(S, ['p', Math.round(x * 10), Math.round(y * 10), Math.round(h * 10), String(text), col || '', big ? 1 : 0]);
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
    if (S.net && S.net.host && !human(P)) NET.ev(S, ['b', S.parts.indexOf(P), String(text), (o && o.secs) || 1.6]);
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
  /** a kid's own difficulty (the rival team in a real lingocha match plays above the game's) */
  function kd(S, P) { return P && P.dBonus ? clamp(S.d + P.dBonus, 0, 1) : S.d; }
  function speedOf(S, P, run) {
    let sp = run ? TUNE.kidRun + TUNE.kidRunD * kd(S, P) : TUNE.kidWalk;
    if (P.dood) sp *= 0.72;
    if (P.carry) sp = Math.min(sp, TUNE.kidWalk * 1.1) * TUNE.carryMul;
    if (P.hold) sp = Math.min(sp, TUNE.kidWalk * (S.id === 'marampitti' ? TUNE.maram.holdWalk : TUNE.holdWalk));
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
    // a friend from the online room: his own page moves him (we follow his ghost); a mirrored kid: the host's snapshots
    if (P.remote || P.net) { NET.follow(S, P, dt); return; }
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
    smoothVel(P, e.vx, e.vy, dt);
    if (e.down) { e.anim.speed = 0; return; }
    if (P.face != null && sp < 20) e.angle += adiff(e.angle, P.face) * Math.min(1, dt * 12);
    else if (sp > 3) e.angle += adiff(e.angle, Math.atan2(e.vy, e.vx)) * Math.min(1, dt * 12);
    e.facing = e.angle;
    if (sp > 3) { e.anim.speed = Math.min(1, sp / 45); e.anim.run = sp > 58; e.anim.phase += sp * dt * (e.anim.run ? 0.2 : 0.26); }
    else { e.anim.speed = 0; e.anim.run = false; e.anim.phase *= 0.85; }
    if (e.emoteSt) { e.emoteSt.t += dt; if (e.emoteSt.t > e.emoteSt.secs) e.emoteSt = null; }
  }
  /** velocity smoothed over TUNE.leadTau (what a thrower reads from your run; a late sidestep fools it) */
  function smoothVel(P, vx, vy, dt) {
    const k = 1 - Math.exp(-dt / TUNE.leadTau);
    P.svx = (P.svx || 0) + (vx - (P.svx || 0)) * k;
    P.svy = (P.svy || 0) + (vy - (P.svy || 0)) * k;
  }
  function separate(S) {
    const L = S.parts;
    // ambient games: the kids make way for Chinnu walking through their game
    if (S.ambient && N.player && !N.player.vehicle) {
      const p = N.player;
      for (const a of L) {
        if (!a.e || a.e.alive === false) continue;
        const dx = a.e.x - p.x, dy = a.e.y - p.y, d = hyp(dx, dy), m = a.e.r + p.r - 0.6;
        if (d < m && d > 1e-4) moveBy(a, (dx / d) * (m - d), (dy / d) * (m - d));
      }
    }
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.e || a.e.alive === false || (a.out && !human(a)) || a.net) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.e || b.e.alive === false || (b.out && !human(b)) || b.net) continue;
        if (human(a) && human(b)) continue;
        const dx = b.e.x - a.e.x, dy = b.e.y - a.e.y, d = hyp(dx, dy), m = a.e.r + b.e.r - 0.6;
        if (d >= m || d < 1e-4) continue;
        const push = (m - d) * 0.5, nx = dx / d, ny = dy / d;
        // the player (and a friend from the room) is never shoved by the kids (they make way)
        if (human(a)) moveBy(b, nx * push * 2, ny * push * 2);
        else if (human(b)) moveBy(a, -nx * push * 2, -ny * push * 2);
        else { moveBy(a, -nx * push, -ny * push); moveBy(b, nx * push, ny * push); }
      }
    }
  }
  function moveBy(P, dx, dy) { const e = P.e; const c = N.world.collide(e.x + dx, e.y + dy, e.r, 'walk'); if (!c.bad) { e.x = c.x; e.y = c.y; } }
  function px(P) { return P.e.x; }
  function py(P) { return P.e.y; }
  function pdist(A, B) { return hyp(A.e.x - B.e.x, A.e.y - B.e.y); }
  /** the wind-up telegraph: thrower a -> target b, and on past him by TUNE.overshoot (e) */
  function teleLine(S) {
    const a = S.tele.from.e, b = S.tele.to.e, l = hyp(b.x - a.x, b.y - a.y) || 1;
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, ex: b.x + ((b.x - a.x) / l) * TUNE.overshoot, ey: b.y + ((b.y - a.y) / l) * TUNE.overshoot, l };
  }
  /** an AI holder starts his wind-up at T (the red line fills like a fuse over windT0) */
  function windUp(S, P, T) {
    P.windT = P.windT0 = lerp(TUNE.lingocha.windup[0], TUNE.lingocha.windup[1], kd(S, P)) * (S.real && PG.debug.assist.weakAI && T && T.isPlayer ? 1.6 : 1);
    P.aimLock = null;
  }
  /** one wind-up step; he commits his aim TUNE.lockT before letting go. true = let go now */
  function windTick(S, P, T, dt) {
    P.windT -= dt;
    if (!P.aimLock && P.windT <= lerp(TUNE.lockT[0], TUNE.lockT[1], S.d)) P.aimLock = LING.aiAimPoint(S, P, T);
    return P.windT <= 0;
  }
  /** 0..1: how far the wind-up fuse has burnt */
  function fuse(P) { return P && P.windT0 > 0 ? clamp(1 - P.windT / P.windT0, 0, 1) : 0; }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1);
    return hyp(px - ax - dx * t, py - ay - dy * t);
  }

  /* ================================================================ the ball */
  function holdPos(P) {
    const e = P.e, a = P.isPlayer ? (e.facing != null ? e.facing : e.angle) : e.angle;
    return { x: e.x + Math.cos(a + 0.5) * 2.4, y: e.y + Math.sin(a + 0.5) * 2.4, z: 4.0 };
  }
  function give(S, P) {
    const b = S.ball;
    for (const Q of S.parts) Q.hold = false;
    b.state = 'held'; b.holder = P; b.thrower = null; b.live = false; b.pass = false; b.passTo = null; b.bounced = 1;
    b.lockP = null; b.lockT = 0; S.freeT = 0;
    P.hold = true; P.holdT = 0; P.windT = 0; P.windT0 = 0; P.aimLock = null; P.passRoll = S.rng.next(); P.lookT = null;
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
    if (b.live) { b.liveSeq = b.seq; b.liveAt = S.t; }
    // somebody else's turn next: the thrower may not grab his own throw straight back
    if (!o.pass && (o.kind || 'throw') === 'throw') { b.lockP = P; b.lockT = S.t + TUNE.relock; } else { b.lockP = null; b.lockT = 0; }
    b.x = e.x + Math.cos(ang) * 2.4; b.y = e.y + Math.sin(ang) * 2.4; b.z = TUNE.hand;
    b.vx = Math.cos(ang) * speed; b.vy = Math.sin(ang) * speed; b.vz = vz;
    if (!P.isPlayer) { e.angle = ang; } else { e.angle = e.facing = ang; }
    P.hold = false; P.windT = 0; P.windT0 = 0; P.aimLock = null; P.holdT = 0;
    S.tele = null;
    sfx('chappal_whoosh', { x: e.x, y: e.y, vol: 0.7, pitch: 1.3 });
    // every kid gets a reaction time to this throw (AI dodging) and a catch roll; the kid it was aimed at
    // may have read the wind-up and jukes at once (the thrower led the old run)
    b.target = o.target || null;
    // a throw stays live a little past its mark (overshoot), then it is a dying ball: no random hits across the ground
    b.rx = b.x; b.ry = b.y; b.liveDist = b.target && b.target.e ? hyp(b.target.e.x - e.x, b.target.e.y - e.y) + TUNE.overshoot : 70;
    const noDodge = S.real && PG.debug.assist.noDodge;
    for (const Q of S.parts) {
      if (Q.isPlayer || Q.remote || Q === P) continue;
      const qd = kd(S, Q);
      Q.react = S.t + lerp(0.34, 0.12, qd) * (0.8 + S.rng.next() * 0.5);
      Q.dodgeRoll = noDodge ? 0 : S.rng.next() < lerp(TUNE.lingocha.dodge[0], TUNE.lingocha.dodge[1], qd) ? 1 : 0;
      // Chinnu's mark saw him take aim (the reticle): he may juke as the ball leaves Chinnu's hand (a friend's too)
      if (human(P) && Q === b.target && b.live && !noDodge) Q.dodgeRoll = S.rng.next() < lerp(TUNE.alert[0], TUNE.alert[1], qd) * (speed > TUNE.throwSpeed + 20 ? TUNE.alertHard : 1) ? 1 : 0;
      // a point-blank throw is hard to catch; a long one gives time to get the hands up
      const flight = hyp(Q.e.x - e.x, Q.e.y - e.y) / Math.max(40, speed);
      Q.catchRoll = S.id === 'marampitti' && !(S.real && PG.debug.assist.noDodge) && S.rng.next() < (0.08 + 0.1 * S.d) * clamp((flight - 0.09) / 0.16, 0, 1.2);
      if (Q === b.target && b.live && !Q.out && Q.downT <= 0) {
        // busy hands (picking / stacking) drop the job to duck only some of the time
        if (Q.act && Q.dodgeRoll && S.rng.next() < 0.55) { Q.act = null; Q.actStone = null; juke(S, Q, P); }
        else if (!Q.act && Q.dodgeRoll) juke(S, Q, P);
      }
    }
    if (!o.quiet) log(S, o.pass ? 'pass' : o.kind === 'stack' ? 'stack_throw' : 'throw', { by: P.name, speed: Math.round(speed), at: b.target ? b.target.name : null, busy: !!(b.target && b.target.act), juke: !!(b.target && b.target.dodgeT > 0), me: !!P.isPlayer, aimOff: o.aimOff != null ? +o.aimOff.toFixed(1) : undefined });
  }
  /** Chinnu holds the ball with his reticle on P: P runs across his aim at full tilt, turning back now and then (a
   *  throw that leads his run guesses wrong if he turns while it flies: throw just after he turns), and backs off
   *  while Chinnu is close */
  function dance(S, P) {
    const e = P.e, m = N.player;
    let ax = e.x - m.x, ay = e.y - m.y; const l = hyp(ax, ay) || 1; ax /= l; ay /= l;
    if (!P.danceT || S.t > P.danceT) {
      P.danceDir = P.danceDir ? -P.danceDir : S.rng.next() < 0.5 ? 1 : -1;
      P.danceT = S.t + lerp(TUNE.dance[0], TUNE.dance[1], kd(S, P)) * (0.7 + 0.6 * S.rng.next());
    }
    const away = l < TUNE.danceAway ? 0.6 : l > TUNE.danceAway + 22 ? -0.25 : 0.15;
    let ux = -ay * P.danceDir + ax * away, uy = ax * P.danceDir + ay * away;
    // the edge of the ground / a wall: turn back now
    if (!inRect(S.F, e.x + ux * 9, e.y + uy * 9, -3) || !walk(e.x + ux * 9, e.y + uy * 9)) {
      P.danceDir = -P.danceDir; P.danceT = S.t + lerp(TUNE.dance[0], TUNE.dance[1], kd(S, P)) * 0.7;
      ux = -ay * P.danceDir + ax * away; uy = ax * P.danceDir + ay * away;
    }
    const ul = hyp(ux, uy) || 1, sp = speedOf(S, P, true) * TUNE.danceSp;
    P.dvx = (ux / ul) * sp; P.dvy = (uy / ul) * sp;
  }
  /** maram pitti: Chinnu's mark is too close for a fair throw (a hit would be a foul) */
  function tooClose(S, T) { return S.id === 'marampitti' && !!T && !!T.e && hyp(T.e.x - N.player.x, T.e.y - N.player.y) < TUNE.maram.closeD; }
  function aimedByMe(S, P) { return S.real && S.me && S.me.hold && !S.me.out && S.aimTarget === P && hyp(P.e.x - N.player.x, P.e.y - N.player.y) < 60; }
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
  /** P has just thrown it: not his turn to pick it up again yet */
  function lockedOut(S, P) { const b = S.ball; return b.lockP === P && S.t < b.lockT; }
  function canGrabP(S, b, P) { return canGrab(S, b) && !lockedOut(S, P); }
  /** how near a kid must be to pick the loose ball up; Chinnu standing on it does not keep it from them (the kids
   *  make way for him, so they reach in from as far as he can) */
  function reachOf(S, b) { const p = N.player; return S.real && p && hyp(b.x - p.x, b.y - p.y) < 5 ? TUNE.myReach : 4.2; }
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
    Object.assign(b, { state: 'air', holder: null, thrower: null, live: false, pass: true, passTo: P, bounced: 1, x, y, z: Math.max(1, b.z), hitSet: new Set(), lockP: null, lockT: 0 });
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
      if (!h || (h.out && !human(h)) || !h.e || h.e.alive === false) { b.state = 'rest'; b.holder = null; if (h) h.hold = false; return; }
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
      // off the ground (a lane, a gutter, somebody's feet): the ball soon stops instead of rolling 100 u away
      const rough = inRect(F, b.x, b.y, TUNE.outerM) ? 1 : TUNE.roughMul;
      const s = hyp(b.vx, b.vy), dec = (TUNE.rollFric * rough + TUNE.rollDrag * s * (rough > 1 ? 3 : 1)) * h;
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
    if (b.live && b.liveDist && hyp(b.x - b.rx, b.y - b.ry) > b.liveDist) b.live = false;
    if (b.live) b.liveAt = S.t;
    if (b.live) {
      for (const P of S.parts) {
        // (a friend from the room is hit on his own page: it reports the hit, so a last-moment dodge there counts)
        if (P === b.thrower || P.out || P.remote || !P.e || P.e.alive === false || b.hitSet.has(P)) continue;
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
    // a passer-by walked into a throw at the stack: that try is taken again (not the thrower's fault)
    if (S.L && b.kind === 'stack' && S.phase === 'flight' && !S.L.knocked) S.L.blocked = true;
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
    for (const Q of S.parts) if (!human(Q) && Q.e) { Q.out = true; Q.scatter = true; }
    if (S.real) {
      banner('KHANNN!', 'Window broken. The aunty kept the ball. Game over!', 3000, 'fail');
      S.endAt = S.t + 1.6; S.endWin = false; S.endExtra = { reason: 'window', window: true };
    } else { S.restartAt = S.t + 6; }
  }
  function knockDown(S, P, b) {
    const e = P.e;
    sfx('chappal', { x: e.x, y: e.y, vol: 0.9, pitch: 1.1 });
    pop(S, e.x, e.y, 10, 'THWACK!', '#ffd84a');
    if (P.remote) { if (S.net && S.net.host) NET.ev(S, ['k', P.uid, Math.round(b.vx), Math.round(b.vy)]); }
    else if (!P.isPlayer) { e.down = true; P.downT = 0.7; const s = hyp(b.vx, b.vy) || 1; e.vx = (b.vx / s) * 30; e.vy = (b.vy / s) * 30; }
    else {
      try { if (N.render && N.render.shake && !document.body.classList.contains('reduced-motion')) N.render.shake(0.18, 0.15); } catch (e2) { /* ignore */ }
      const p = N.player, s = hyp(b.vx, b.vy) || 1; p.vx += (b.vx / s) * 40; p.vy += (b.vy / s) * 40;
    }
    // the ball pops off the kid sideways (not back into the thrower's hands): a scramble for it
    const D = TUNE.deflect, a = Math.atan2(b.vy, b.vx) + (S.rng.next() < 0.5 ? -1 : 1) * (1.25 + S.rng.next() * 0.9);
    const v = lerp(D.sp[0], D.sp[1], S.rng.next());
    b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.vz = D.vz * (0.8 + S.rng.next() * 0.4); b.live = false; b.z = Math.max(b.z, 2);
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
    P.outs = (P.outs || 0) + 1;
    // the order kids go out in (maram pitti places: the last one standing is 1st)
    P.outRank = S.parts.filter((q) => !q.out).length + 1;
    // Chinnu out in lingocha: he walks to the side and watches (the round goes on); a friend from the room too
    // (maram pitti with friends too: the game goes on without him, so he watches from the side)
    if (human(P) && S.real && (S.id === 'lingocha' || S.party) && (N.player || P.remote)) { const q = sitSpot(S, P); NET.autoFor(S, P, q, Math.atan2(S.F.cy - q.y, S.F.cx - q.x), true); }
    if (by && by.isPlayer && S.real) S.stats.hits++;
    if (by) by.hits++;
    pop(S, P.e.x, P.e.y, 13, 'OUT!', '#ff7a6a', true);
    sfx('howzat', { x: P.e.x, y: P.e.y, vol: 0.6 });
    const shouter = by && !human(by) ? by : S.parts.find((q) => !human(q) && !q.out && q !== P && q.team === (by ? by.team : -1)) || (by && !by.remote ? by : null);
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
      } else if (S.party) {
        // with friends (N.party): they take places in the two teams, the colony kids fill the rest
        NET.setupParty(S, R);
        L.seek = p.seekFirst === false ? 1 : 0;
        if (S.net && S.net.guest) return; // a guest's page shows the host's game (no rounds of its own)
      } else {
        S.teamName = [R.homeName, R.awayName];
        addPlayer(S, 0);
        const pl = N.player;
        R.home.forEach((spec, i) => addPart(S, spec, 0, pl.x + Math.cos(i * 2.1) * 14, pl.y + Math.sin(i * 2.1) * 14));
        R.away.forEach((spec, i) => { const q = edgeSpot(F, F.cx + (i - 1.5) * 14, F.cy, -6); addPart(S, spec, 1, q.x, q.y).dBonus = TUNE.lingocha.rival; });
        L.seek = p.seekFirst === false ? 1 : 0;
      }
      LING.startRound(S);
    },
    /** the line throw starts pointing a little off the stack (Chinnu straightens it with ←/→, the stick or the mouse) */
    aimStart(S) {
      const L = S.L, A = S.aim, T = L.thrower, x = T && T.e ? T.e.x : L.line.x, y = T && T.e ? T.e.y : L.line.y;
      const off = TUNE.aim.startOff, side = S.rng.next() < 0.5 ? -1 : 1;
      A.ang = Math.atan2(L.base.y - y, L.base.x - x) + (T && T.isPlayer && !PG.debug.assist.aim ? side * lerp(off[0], off[1], S.rng.next()) : 0);
      A.yaw = null; A.stickArm = false; A.stickSling = false; A.dragging = false;
    },
    liveTime(S) { return S.params.liveTime > 0 ? +S.params.liveTime : lerp(TUNE.lingocha.live[0], TUNE.lingocha.live[1], S.d); },
    seekers(S) { return S.parts.filter((P) => P.team === S.L.seek); },
    hitters(S) { return S.parts.filter((P) => P.team !== S.L.seek); },
    startRound(S) {
      const L = S.L, F = S.F;
      L.round++; L.tries = 0; L.knocked = false; L.blocked = false; L.retakes = 0; L.timer = LING.liveTime(S); L.shouted = false;
      if (L.round > 1) log(S, 'role_swap', { seek: L.seek === 0 ? 'home' : 'away', round: L.round });
      for (const st of L.stones) { st.state = 'stack'; st.by = null; st.claim = null; st.x = L.base.x; st.y = L.base.y; st.z = 0; st.vx = st.vy = st.vz = 0; }
      L.stack = L.stones.slice();
      const ln = L.line, ux = ln.dx, uy = ln.dy, vx = -uy, vy = ux; // u: line -> stack, v: along the line
      const seek = LING.seekers(S), hit = LING.hitters(S);
      for (const P of S.parts) {
        P.out = false; P.safeT = 0; P.safeCD = 0; P.carry = null; P.hold = false; P.act = null; P.windT = 0; P.sit = null; P.stone = null; P.role = null; P.face = null;
        if (P.e && !human(P)) { P.e.idle = null; P.e.down = false; P.downT = 0; }
      }
      // throwers: Chinnu when his team seeks (a real game), else the seekers in turn; with friends from the online
      // room: the friends of the seeking side take the tries in turn
      const humSeek = seek.filter((P) => human(P));
      L.throwers = S.party && humSeek.length ? humSeek : S.me && S.me.team === L.seek ? [S.me] : seek.filter((P) => !P.dood);
      // the thrower toes the line; the rest of his team wait beside it (not right behind him, where they would
      // fill the 3D camera's view of the stack)
      const thrower = L.throwers[0] || seek[0];
      let j = 0;
      for (const P of seek) {
        if (P === thrower) continue;
        const off = (j % 2 ? 1 : -1) * (10 + 7 * Math.floor(j / 2)); j++;
        const q = clampIn(F, ln.x - ux * 4 + vx * off, ln.y - uy * 4 + vy * off, 3);
        P.spot = spotNear(q.x, q.y, 3, 12, F);
      }
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
      }
      // friends from the online room walk to their spots on their own pages
      for (const P of S.parts) if (P.remote && P.spot) NET.autoFor(S, P, P.spot, Math.atan2(L.base.y - P.spot.y, L.base.x - P.spot.x));
      NET.tell(S, (P, O) => {
        const mine = P.team === L.seek, tn = S.teamName[P.team] || S.teamName[0];
        O.banner('Round ' + L.round + ' of ' + L.rounds, (mine ? tn + ' SEEK — knock it down, then restack!' : tn + ' HIT — stop them restacking!'), 2200, 'info');
        O.sfx('whistle', { ui: true, vol: 0.7 });
      });
      log(S, 'round', { round: L.round, seek: L.seek === 0 ? 'home' : 'away', thrower: thrower ? thrower.name : null });
    },
    update(S, dt) {
      const L = S.L, b = S.ball;
      S.phaseT += dt;
      for (const P of S.parts) { if (P.safeT > 0) P.safeT -= dt; if (P.safeCD > 0) P.safeCD -= dt; }
      switch (S.phase) {
        case 'setup': {
          const ready = S.parts.every((P) => human(P) || !P.spot || hyp(P.e.x - P.spot.x, P.e.y - P.spot.y) < 4);
          const late = S.phaseT > 4.5;
          if ((ready && !S.auto && S.phaseT > 1.2) || late) {
            if (late && S.auto) S.auto = null;
            S.phase = 'aim'; S.phaseT = 0; S.aim.charging = false; S.aim.p = 0; S.aim.yaw = null;
            LING.aimStart(S);
          }
          break;
        }
        case 'aim': {
          const T = L.thrower;
          if (!T) { LING.endRound(S, 1 - L.seek, 'tries'); break; }
          if (b.holder !== T) give(S, T);
          if (T.remote) {
            // a friend from the room throws on his own page (his 'lt' command); far too slow: the team throws for him
            if (S.phaseT > TUNE.party.lineWait) { NET.tellOne(S, T, (O) => O.toast('*Jaldi*, ra! The team threw for you.', 2000)); LING.aiStackThrow(S, T); }
          } else if (!T.isPlayer) {
            T.face = Math.atan2(L.base.y - T.e.y, L.base.x - T.e.x);
            // (he waits for a passer-by to get out of the way: up to 3 s more)
            if (S.phaseT > 1.3 + (S.seed % 7) * 0.08 && (S.phaseT > 4.3 || !LING.lineBlocked(S, T))) LING.aiStackThrow(S, T);
          }
          break;
        }
        case 'flight': {
          if (L.knocked) { S.phase = 'scatter'; S.phaseT = 0; break; }
          const sp = hyp(b.vx, b.vy);
          if (S.phaseT > 3 || b.state === 'rest' || (b.state === 'roll' && sp < 14) || rectDist(S.F, b.x, b.y) > 40) {
            if (L.blocked && (L.retakes || 0) < 2) {
              // a passer-by walked into it: no try lost, the same thrower goes again (twice at most)
              L.blocked = false; L.retakes = (L.retakes || 0) + 1;
              log(S, 'try_blocked', { tries: L.tries });
              const k = LING.hitters(S)[0];
              if (k) bark(S, k, pick(S, BARK.blocked));
              if (S.real && L.thrower && human(L.thrower)) NET.tellOne(S, L.thrower, (O) => O.toast('Somebody walked into it — throw again (still try ' + (L.tries + 1) + '/' + TUNE.lingocha.tries + ')', 2200));
              if (L.thrower) lob(S, b.x, b.y, L.thrower);
              S.phase = 'return'; S.phaseT = 0;
              break;
            }
            L.blocked = false; L.retakes = 0;
            L.tries++; S.stats.tries += L.thrower && L.thrower.isPlayer ? 1 : 0;
            log(S, 'try_miss', { tries: L.tries });
            const nearH = LING.hitters(S)[0];
            if (nearH) bark(S, nearH, pick(S, BARK.miss));
            if (L.tries >= TUNE.lingocha.tries) { LING.endRound(S, 1 - L.seek, 'tries'); break; }
            // the keeper lobs it back to the next thrower
            const prev = L.thrower;
            L.thrower = L.throwers[L.tries % Math.max(1, L.throwers.length)] || prev;
            if (L.thrower && !human(L.thrower)) {
              if (prev && prev !== L.thrower && !human(prev)) prev.spot = spotNear(L.line.x - L.line.dx * 6 + (S.rng.next() - 0.5) * 10, L.line.y - L.line.dy * 6, 3, 12, S.F);
              L.thrower.spot = { x: L.line.x, y: L.line.y };
            }
            // two friends take turns at the line: the one who just threw steps aside
            if (prev && prev !== L.thrower && human(prev) && human(L.thrower)) { const q = spotNear(L.line.x - L.line.dx * 6 + (prev.isPlayer ? -8 : 8) * L.line.dy, L.line.y - L.line.dy * 6 + (prev.isPlayer ? 8 : -8) * L.line.dx, 3, 12, S.F); NET.autoFor(S, prev, q, Math.atan2(L.base.y - q.y, L.base.x - q.x)); }
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
            const far = hyp(T.e.x - L.line.x, T.e.y - L.line.y) > (T.remote ? 7 : 4);
            if (far && human(T)) NET.autoFor(S, T, { x: L.line.x, y: L.line.y }, Math.atan2(L.base.y - L.line.y, L.base.x - L.line.x));
            S.phase = far ? 'setup' : 'aim'; S.phaseT = 0;
            if (!far) LING.aimStart(S);
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
              const my = S.me ? S.me.team : 0, win = L.wins[my] > L.wins[1 - my];
              if (S.net && S.net.host) NET.finish(S, { reason: win ? 'won' : 'lost' });
              else endSession(S, win, { reason: win ? 'won' : 'lost' });
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
      for (const P of S.parts) if (!human(P)) LING.ai(S, P, dt);
    },
    /** somebody who is not in the game stands between the thrower and the stack */
    lineBlocked(S, T) {
      const L = S.L, ax = T.e.x, ay = T.e.y, bx = L.base.x, by = L.base.y;
      let hit = false;
      try {
        N.entities.query((ax + bx) / 2, (ay + by) / 2, hyp(bx - ax, by - ay) / 2 + 5, (q) => {
          if (hit || !q || q.pgKid || q === N.player || q.vehicle || q.hidden || (q.kind !== 'ped' && q.kind !== 'npc')) return false;
          if (segDist(q.x, q.y, ax, ay, bx, by) < 4.5) hit = true;
          return hit;
        });
      } catch (e) { hit = false; }
      return hit;
    },
    aiStackThrow(S, T) {
      const L = S.L;
      let ang = Math.atan2(L.base.y - T.e.y, L.base.x - T.e.x);
      const weak = S.real && PG.debug.assist.weakAI && T.team !== (S.me ? S.me.team : -1);
      ang += gauss(S.rng) * (weak ? 0.5 : lerp(TUNE.lingocha.stackErr[0], TUNE.lingocha.stackErr[1], kd(S, T)));
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
        const a = ba + gauss(S.rng) * 0.85, v = clamp(sp * (0.3 + 0.45 * S.rng.next()) * (0.65 + 0.07 * i) * TUNE.lingocha.knockMul, 30, 185);
        st.vx = Math.cos(a) * v; st.vy = Math.sin(a) * v; st.vz = 10 + S.rng.next() * 16 + i * 2;
      });
      L.stack = [];
      b.vx = -b.vx * 0.25 + (S.rng.next() - 0.5) * 30; b.vy = -b.vy * 0.25 + (S.rng.next() - 0.5) * 30; b.vz = Math.abs(b.vz) * 0.3 + 12; b.live = false;
      sfx('marble', { x: L.base.x, y: L.base.y, vol: 1, pitch: 0.7 }); sfx('marble', { x: L.base.x, y: L.base.y, vol: 0.8, pitch: 0.55, delay: 0.06 }); sfx('bump', { x: L.base.x, y: L.base.y, vol: 0.6, pitch: 0.8 });
      pop(S, L.base.x, L.base.y, 8, 'DHAM!', '#f2c230', true);
      const T = b.thrower;
      log(S, 'knock', { by: T ? T.name : null, me: !!(T && T.isPlayer), try: L.tries + 1 });
      if (T) bark(S, T, pick(S, BARK.knock));
      if (S.real) NET.tell(S, (P, O) => O.toast(P.team === L.seek ? 'Knocked down! Grab the stones and restack — dodge the ball!' : 'Down it goes! Get the ball and hit them before they restack!', 2600));
      S.phase = 'scatter'; S.phaseT = 0;
      // the stack is down: Chinnu's own legs again (no walk back to the line still running)
      if (S.auto && !(S.me && S.me.out)) S.auto = null;
      for (const P of S.parts) if (P.remote && !P.out) NET.autoFor(S, P, null);
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
      // the stones stay on the open ground (the kerb at its edge): every stone is reachable in a straight line
      const m = 1.5;
      if (inRect(F, st.x, st.y, m)) {
        if ((nx < F.x0 - m && st.vx < 0) || (nx > F.x1 + m && st.vx > 0)) { st.vx = -st.vx * 0.35; nx = st.x; }
        if ((ny < F.y0 - m && st.vy < 0) || (ny > F.y1 + m && st.vy > 0)) { st.vy = -st.vy * 0.35; ny = st.y; }
      }
      st.x = nx; st.y = ny; st.z += st.vz * dt; st.rot += dt * hyp(st.vx, st.vy) * 0.05;
      if (st.z <= 0) {
        st.z = 0;
        if (st.vz < -20) { st.vz = -st.vz * 0.3; st.vx *= 0.6; st.vy *= 0.6; sfx('marble', { x: st.x, y: st.y, vol: 0.35, pitch: 0.6 + st.i * 0.06 }); }
        else { st.vz = 0; const s = hyp(st.vx, st.vy), dec = TUNE.lingocha.stoneFric * dt; if (s <= dec) { st.vx = st.vy = 0; st.state = 'loose'; } else { st.vx *= (s - dec) / s; st.vy *= (s - dec) / s; } }
      }
      if (st.state === 'fly' && !walk(st.x, st.y)) { const f = spotNear(st.x, st.y, 1, 9, F); st.x = f.x; st.y = f.y; }
      if (st.state === 'loose' && (!inRect(F, st.x, st.y, 0) || !walk(st.x, st.y))) { const q = clampIn(F, st.x, st.y, 2.5); const f = spotNear(q.x, q.y, 1.5, 12, F); st.x = f.x; st.y = f.y; }
    },
    /** a seeker who touches a hitter is SAFE for a moment. Only a touch he went for counts (Chinnu's always
     *  does): a kid brushing past the guard on his way to the stack is not SAFE (or half the seekers would be) */
    touches(S) {
      const seek = LING.seekers(S), hit = LING.hitters(S);
      for (const A of seek) {
        if (A.out || A.safeCD > 0 || !A.e || (!human(A) && !(A.touchUntil > S.t))) continue;
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
        NET.tell(S, (P, O) => {
          O.sfx('applause', { ui: true, vol: 0.7, delay: 0.3 });
          const mine = P.team === L.seek;
          O.banner('LINGOCHA!', (S.teamName[L.seek] || '') + ' rebuilt all seven' + (who && who === P ? (S.party ? ' — you placed the last stone!' : ' — Chinnu placed the last stone!') : who && human(who) ? ' — ' + who.name + ' placed the last stone!' : ''), 2600, mine ? 'pass' : 'fail');
        });
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
        const why = reason === 'tries' ? 'Three tries, stack still standing!' : reason === 'allout' ? 'All the seekers are out!' : reason === 'time' ? 'Time up — the stack is not rebuilt!' : '';
        NET.tell(S, (P, O) => {
          const mine = winner === P.team;
          O.banner(mine ? 'Round to ' + S.teamName[winner] + '!' : 'Round to ' + S.teamName[winner], why, 2400, mine ? 'pass' : 'fail');
          O.sfx(mine ? 'crowd_cheer' : 'kids', { ui: true, vol: 0.6 });
        });
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
      if (aimedByMe(S, P) && P.safeT <= 0) { dance(S, P); return; }
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
        if (near) { goTo(P, near.e.x, near.e.y, run, 0.5); P.touchUntil = S.t + 0.4; return; }
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
        // (mid wind-up he keeps his mark unless that kid is out / SAFE; then the fuse starts again on a new one)
        if (!P.tgt || P.tgt.out || P.tgt.safeT > 0 || (S.t > P.tgtT && !(P.windT > 0))) {
          let best = null, bs = Infinity;
          for (const Q of targets) { const s = pdist(P, Q) * (Q.carry ? 0.7 : 1) * (human(Q) ? TUNE.lingocha.meW : 1) * (0.85 + 0.3 * S.rng.next()); if (s < bs) { bs = s; best = Q; } }
          if (P.windT > 0 && best !== P.tgt) windUp(S, P, best);
          P.tgt = best; P.tgtT = S.t + 1.2;
        }
        const T = P.tgt, d = pdist(P, T);
        if (P.windT > 0) {
          halt(P); P.face = Math.atan2(T.e.y - e.y, T.e.x - e.x);
          S.tele = { from: P, to: T };
          if (windTick(S, P, T, dt)) LING.aiThrowAt(S, P, T);
          return;
        }
        // pass to a teammate who is much closer to the target (Chinnu too, some of the time: "Chinnu, catch!")
        if (d > 50 && P.holdT > 0.4) {
          let mate = null, md = d - 18;
          for (const Q of LING.hitters(S)) { if (Q === P || Q.out || (human(Q) && !(P.passRoll < TUNE.lingocha.passMe))) continue; const dq = pdist(Q, T); if (dq < md) { md = dq; mate = Q; } }
          if (mate && S.rng.next() < 0.7) {
            launchAt(S, P, mate.e.x, mate.e.y, 4, TUNE.passSpeed, 0.03, { pass: true, passTo: mate });
            if (mate.isPlayer && !S.party) bark(S, P, pick(S, ['Chinnu, catch!', 'Le, Chinnu! *Maar*!', 'Pass, ra, catch!']), { force: true });
            else if (human(mate)) { const nm = mate.nick || mate.name; bark(S, P, pick(S, [nm + ', catch!', 'Le, ' + nm + '! *Maar*!', 'Pass, ra, catch!']), { force: true }); }
            return;
          }
        }
        const range = lerp(30, 42, kd(S, P));
        if (d < range || P.holdT > TUNE.lingocha.holdMax - 0.6) { windUp(S, P, T); halt(P); return; }
        goTo(P, T.e.x, T.e.y, speedOf(S, P, false), 2);
        return;
      }
      // fetch the loose ball (the two nearest hitters go; not the one who just threw it)
      if (!b.holder && canGrabP(S, b, P) && rectDist(S.F, b.x, b.y) < 80) {
        let rank = 0; const my = hyp(b.x - e.x, b.y - e.y);
        for (const Q of LING.hitters(S)) if (Q !== P && !Q.out && !lockedOut(S, Q) && hyp(b.x - Q.e.x, b.y - Q.e.y) < my) rank++;
        if (rank < 2) {
          const d = goTo(P, b.x, b.y, run, 0.5);
          if (d < reachOf(S, b) && b.state !== 'held') give(S, P);
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
    /** where P means to throw at T (he leads T's run; read from the smoothed velocity, not a last sidestep) */
    aiAimPoint(S, P, T) {
      const pd = kd(S, P), sp = lerp(TUNE.aiSpeed[0], TUNE.aiSpeed[1], pd) * (0.92 + S.rng.next() * 0.16);
      const d = pdist(P, T), t = d / sp, lead = 0.5 + 0.4 * pd;
      const vx = T.svx != null ? T.svx : T.e.vx || 0, vy = T.svy != null ? T.svy : T.e.vy || 0;
      return { x: T.e.x + vx * t * lead, y: T.e.y + vy * t * lead, sp };
    },
    aiThrowAt(S, P, T) {
      const weak = S.real && PG.debug.assist.weakAI && T.isPlayer;
      // the aim he committed to near the end of the wind-up (a hop since then fools him)
      const a = P.aimLock || LING.aiAimPoint(S, P, T);
      P.aimLock = null;
      const E = S.id === 'marampitti' ? TUNE.maram.aiErr : TUNE.lingocha.aiErr;
      const pd = kd(S, P), errA = weak ? 0.45 : lerp(E[0], E[1], pd);
      const tz = clamp(2.4 + gauss(S.rng) * (1.1 - 0.5 * pd), 0.8, 6.5);
      // aimOff: how far his committed aim point is from where the mark actually is now (a hop beat him)
      launchAt(S, P, a.x, a.y, tz, a.sp, errA, { target: T, aimOff: hyp(a.x - T.e.x, a.y - T.e.y) });
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
      const L = S.L, my = S.me ? S.me.team : 0;
      return { roundsWon: L.wins[my], roundsLost: L.wins[1 - my], rounds: L.hist.slice(), stacked: S.stats.stacked, hits: S.stats.hits, outs: S.stats.outs, tries: S.stats.tries, opponent: S.teamName[1 - my] };
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
      if (me.out) { me.act = null; offer(S, ''); I.consume('action'); return; }
      const seeker = me.team === L.seek;
      if (seeker) {
        // busy hands: picking a stone up / placing it on the stack takes a moment (standing still: dodge first!)
        if (me.act) {
          zeroMove(I); I.consume('run');
          offer(S, me.act === 'stack' ? 'Placing…' : 'Picking up…');
          I.consume('action');
          me.actT -= dt;
          if (me.actT <= 0) {
            // (a guest's page asks the host's game to do it, and shows it at once)
            if (NET.guest(S)) NET.cmd(S, me.act === 'pick' ? { k: 'pk', i: me.actStone ? me.actStone.i : -1 } : { k: 'sk' });
            else if (me.act === 'pick') LING.pickStone(S, me, me.actStone);
            else if (L.stack.length < 7) LING.stackStone(S, me);
            me.act = null; me.actStone = null;
          }
          return;
        }
        if (me.carry) {
          const d = hyp(L.base.x - p.x, L.base.y - p.y);
          const other = S.parts.find((Q) => Q !== me && Q.act === 'stack' && !Q.out);
          if (d < 10 && other) offer(S, 'Wait — ' + other.name + ' is stacking');
          else if (d < 10) {
            offer(S, L.stack.length === 6 ? 'Stack + LINGOCHA!' : 'Stack it (' + (L.stack.length + 1) + '/7)');
            if (I.pressed('action')) { me.act = 'stack'; me.actT = me.actT0 = TUNE.lingocha.myStackT; sfx('pickup', { ui: true, vol: 0.3, pitch: 0.8 }); }
          } else offer(S, '');
          I.consume('action');
          return;
        }
        let st = null, sd = 6.5;
        for (const s of L.stones) { if (s.state !== 'loose') continue; const d = hyp(s.x - p.x, s.y - p.y); if (d < sd) { sd = d; st = s; } }
        if (st) {
          offer(S, 'Pick up stone');
          if (I.pressed('action')) {
            if (st.claim && st.claim !== me) { st.claim.stone = null; }
            st.claim = me; me.stone = st;
            me.act = 'pick'; me.actStone = st; me.actT = me.actT0 = TUNE.lingocha.myPickT;
          }
        } else offer(S, '');
        I.consume('action');
        // running into the loose ball kicks it away (a guest: the host's game sees his run into it)
        if (!NET.guest(S) && (b.state === 'rest' || b.state === 'roll') && hyp(b.x - p.x, b.y - p.y) < p.r + TUNE.ballR + 0.6 && hyp(p.vx, p.vy) > 35) kick(S, me);
        return;
      }
      // hitter (the aim assist passes over a SAFE seeker while somebody else is fair game)
      const cands = LING.seekers(S).filter((Q) => !Q.out && !Q.dood), fair = cands.filter((Q) => Q.safeT <= 0);
      holderControl(S, dt, I, fair.length ? fair : cands);
    },
    prompt(S) {
      const L = S.L, me = S.me, a = keyName('action');
      if (!me) return '';
      if (S.phase === 'setup') return me.team === L.seek ? 'Your team throws first — walk to the chalk line' : 'Spread out — the other team throws at the stack';
      if (S.phase === 'aim') {
        if (L.thrower !== me) return (L.thrower ? L.thrower.name : 'They') + ' throws at the stack…';
        const tr = 'Try ' + (L.tries + 1) + '/' + TUNE.lingocha.tries + ': ' + (LING.lineBlocked(S, me) ? 'somebody is in the line — wait for him to pass · ' : '');
        if (isTouch() && !is3D()) return tr + 'pull back from the stack (stick or screen) and let go, like a catapult';
        if (isTouch()) return tr + 'drag the view or the stick to aim · hold ' + a + ' for power, let go';
        if (N.input && N.input.device === 'gamepad') return tr + 'stick aims · hold A for power, let go to throw';
        return tr + (is3D() ? 'look / ← → aim' : '← → or mouse aim') + ' · hold ' + a + ' for power, let go';
      }
      if (S.phase === 'flight' || S.phase === 'return') return '…';
      if (S.phase === 'roundEnd') return '';
      if (me.out) return 'OUT! Sit at the side — cheer for your team';
      if (me.team === L.seek) {
        if (S.tele && S.tele.to === me && S.tele.from && S.tele.from.windT > 0) return (S.tele.from.name || 'He') + ' is aiming at you! Sidestep as the red fuse reaches you — or touch a hitter = SAFE';
        if (me.act) return me.act === 'stack' ? 'Placing the stone… hold still!' : 'Picking it up…';
        if (me.carry) return 'Carry it to the stack and press ' + a + ' · dodge the ball!';
        return 'Grab a stone (' + a + ') and restack · touch a hitter = SAFE · run into the ball to kick it';
      }
      if (me.hold) return a + ': throw at ' + (S.aimTarget ? S.aimTarget.name + (S.aimTarget.safeT > 0 ? ' (SAFE now — wait!)' : '') : 'a seeker') + ' · hold for a hard one';
      if (!S.ball.holder && lockedOut(S, me)) return 'Not twice in a row — a teammate gets this one';
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
      if (S.party) {
        NET.setupParty(S, R);
        M.n = S.parts.length;
        if (!(S.net && S.net.guest)) MARAM.ring(S);
        return;
      }
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
        P.out = false; P.hold = false; P.windT = 0; P.sit = null; P.fouls = 0; P.face = null; P.scatter = false; P.outRank = null; P.boundT = 0;
        if (P.e && !human(P)) { P.e.idle = null; P.e.down = false; P.downT = 0; }
        const a = (i / n) * TAU + 0.4, q = clampIn(F, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 4);
        P.spot = spotNear(q.x, q.y, 3, 10, F);
      });
      M.tosser = S.parts.find((P) => !human(P)) || S.parts[0];
      if (M.tosser) M.tosser.spot = { x: c.x, y: c.y };
      give(S, M.tosser);
      S.phase = 'setup'; S.phaseT = 0;
      if (S.me) {
        const sp = S.me.spot;
        S.auto = sp && hyp(sp.x - N.player.x, sp.y - N.player.y) > 4 ? { x: sp.x, y: sp.y, t: 0, face: Math.atan2(c.y - sp.y, c.x - sp.x) } : null;
      }
      for (const P of S.parts) if (P.remote && P.spot) NET.autoFor(S, P, P.spot, Math.atan2(c.y - P.spot.y, c.x - P.spot.x));
      NET.tell(S, (P, O) => {
        O.banner('MARAM PITTI', 'Wait for the bounce · hit them below the head · last one standing wins', 2400, 'info');
        O.sfx('whistle', { ui: true, vol: 0.7 });
      });
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
    /** Chinnu is the target of a wind-up (the red line) or a live ball is on its way to him */
    threatened(S) {
      const me = S.me, b = S.ball, p = N.player;
      if (!me || me.out || S.phase !== 'play') return false;
      if (S.tele && S.tele.from && S.tele.from.windT > 0 && S.tele.from !== me && S.tele.to && S.tele.to.e) {
        if (S.tele.to === me) return true;
        // standing on the line past his mark: a miss comes your way
        const tl = teleLine(S);
        if (segDist(p.x, p.y, tl.ax, tl.ay, tl.ex, tl.ey) < TUNE.maram.lineWarn && hyp(p.x - tl.ax, p.y - tl.ay) > 8) return true;
      }
      if (b.state === 'air' && b.live && b.thrower && b.thrower !== me) {
        const rx = p.x - b.x, ry = p.y - b.y, vv = b.vx * b.vx + b.vy * b.vy;
        const t = vv > 1 ? (rx * b.vx + ry * b.vy) / vv : -1;
        return t > 0 && t < 0.6 && hyp(rx - b.vx * t, ry - b.vy * t) < 6.5;
      }
      return false;
    },
    catching(S, P) { return !!P && P.isPlayer && S.t - P.catchT < TUNE.catchWin * (S.assist || isTouch() ? 1.4 : 1); },
    update(S, dt) {
      const M = S.M, b = S.ball;
      S.phaseT += dt;
      if (S.phase === 'setup') {
        const ready = S.parts.every((P) => human(P) || !P.spot || hyp(P.e.x - P.spot.x, P.e.y - P.spot.y) < 4);
        if ((ready && !S.auto && S.phaseT > 1) || S.phaseT > 4.5) { if (S.auto) S.auto = null; MARAM.toss(S); }
      } else if (S.phase === 'toss') {
        if (b.bounced > 0 || b.state !== 'air') { S.phase = 'play'; S.phaseT = 0; log(S, 'play'); }
      } else if (S.phase === 'play') {
        if (!(S.real && PG.debug.assist.noTimer)) M.timeLeft -= dt;
        const al = MARAM.alive(S);
        if (S.real && !S.me.out && S.endAt == null) {
          // the ground has a boundary: hiding off it (out of everybody's range) is out; fetching a ball that
          // rolled off is fine
          const p = N.player, off = rectDist(S.F, p.x, p.y);
          const fetching = !b.holder && rectDist(S.F, b.x, b.y) > 2 && hyp(b.x - p.x, b.y - p.y) < 30;
          if (off > TUNE.maram.bound && !fetching && !S.me.hold) {
            S.boundT = (S.boundT || 0) + dt;
            if (!S.boundWarn) { S.boundWarn = true; toast('*Andar aa!* Back inside the ground — or you are OUT', 2200); const k = al.find((Q) => !Q.isPlayer); if (k) bark(S, k, '*Andar aa*, ra! No hiding!'); }
            if (S.boundT > TUNE.maram.boundT) setOut(S, S.me, null, 'boundary');
          } else { S.boundT = 0; S.boundWarn = false; }
        }
        // friends from the online room: the host's game calls them back inside the boundary too
        if (S.net && S.net.host && S.endAt == null) {
          for (const P of S.parts) {
            if (!P.remote || P.out) continue;
            const off = rectDist(S.F, P.e.x, P.e.y), fetching = !b.holder && rectDist(S.F, b.x, b.y) > 2 && hyp(b.x - P.e.x, b.y - P.e.y) < 30;
            if (off > TUNE.maram.bound + 2 && !fetching && !P.hold) {
              P.boundT = (P.boundT || 0) + dt;
              if (P.boundT > TUNE.maram.boundT + 0.5) setOut(S, P, null, 'boundary');
            } else P.boundT = 0;
          }
        }
        if (S.real && S.party) {
          // with friends: an out kid sits at the side and watches; the game goes on till one is left standing, every
          // friend is out, or the time is up
          const humIn = al.filter((P) => human(P));
          if (S.endAt == null && (al.length <= 1 || !humIn.length || M.timeLeft <= 0)) {
            const reason = al.length <= 1 ? 'last' : M.timeLeft <= 0 ? 'time' : 'allout';
            S.endAt = S.t + (reason === 'last' ? 1.4 : 1.6); S.endWin = !!(S.me && !S.me.out); S.endExtra = { reason };
            for (const P of al) P.outRank = 1;
            NET.tell(S, (P, O) => {
              if (reason === 'last' && !P.out) { O.banner('LAST ONE STANDING!', 'You win the maram pitti!', 2400, 'pass'); O.sfx('crowd_cheer', { ui: true }); O.sfx('applause', { ui: true, delay: 0.3 }); }
              else if (reason === 'last') O.banner('GAME OVER', (al[0] ? nameOf(al[0]) : 'Nobody') + ' is the last one standing', 2400, 'info');
              else if (reason === 'time') O.banner('TIME UP!', P.out ? al.length + ' still standing' : 'Still standing — ' + al.length + ' of you share the glory', 2200, P.out ? 'info' : 'pass');
              else O.banner('ALL OUT!', 'The colony kids win this one — ' + al.length + ' left standing', 2200, 'info');
            });
          }
        } else if (S.real) {
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
      for (const P of S.parts) if (!human(P)) MARAM.ai(S, P, dt);
    },
    onBounce(S, b, wasLive) {
      if (wasLive && b.thrower && S.phase === 'play' && b.hitSet && b.hitSet.size === 0) {
        const T = b.thrower;
        // (not at a friend from the room: his own page judges the hit, and its word can come a moment after the bounce)
        if (T && !T.isPlayer && !(b.target && b.target.remote) && S.rng.next() < 0.35) bark(S, T, pick(S, BARK.miss));
      }
    },
    onHit(S, P, b) {
      const T = b.thrower;
      if (S.phase !== 'play' || !T) return false;
      // a catch on the full: the thrower is out
      // (a friend from the room catches on his own page: his hit report says so)
      const caught = P.remote ? !!P.netCatch : MARAM.catching(S, P) || (!P.isPlayer && P.catchRoll && hyp(b.vx, b.vy) < 190 && P.downT <= 0);
      if (caught) {
        give(S, P); P.catches++; if (P.isPlayer) S.stats.catches++;
        pop(S, P.e.x, P.e.y, 11, 'CAUGHT!', '#7fe0ff', true);
        bark(S, P, pick(S, BARK.catch));
        sfx('pickup', { x: P.e.x, y: P.e.y, vol: 0.8 });
        log(S, 'catch', { name: P.name, me: !!P.isPlayer, thrower: T.name });
        setOut(S, T, P, 'caught');
        return true;
      }
      // colony manners: a hit from right next to him does not count (throw from a distance, ra)
      if (hyp(b.rx - P.e.x, b.ry - P.e.y) < TUNE.maram.closeD) {
        T.fouls++; if (T.isPlayer) S.stats.fouls++;
        pop(S, P.e.x, P.e.y, 11, 'TOO CLOSE!', '#ffb0a0');
        bark(S, P, pick(S, BARK.close));
        log(S, 'close_foul', { name: P.name, by: T.name, fouls: T.fouls });
        b.vx *= -0.25; b.vy *= -0.25; b.vz = 14; b.live = false;
        if (T.fouls >= TUNE.maram.fouls) { if (human(T)) NET.tellOne(S, T, (O) => O.toast('Three fouls — out, ra! (throw from a distance)', 2600)); setOut(S, T, null, 'fouls'); }
        else if (human(T)) NET.tellOne(S, T, (O) => O.toast('*Itna paas se nakko!* Too close — foul ' + T.fouls + '/' + TUNE.maram.fouls + '. Step back first', 2400));
        return true;
      }
      if (b.z - TUNE.ballR * 0.5 > TUNE.headZ) {
        T.fouls++; if (T.isPlayer) S.stats.fouls++;
        pop(S, P.e.x, P.e.y, 11, 'NO HEADS!', '#ffb0a0');
        bark(S, P, pick(S, BARK.head));
        log(S, 'head_foul', { name: P.name, by: T.name, fouls: T.fouls });
        knockDown(S, P, b);
        if (T.fouls >= TUNE.maram.fouls) { if (human(T)) NET.tellOne(S, T, (O) => O.toast('Three head shots — out, ra! (no heads in maram pitti)', 2600)); setOut(S, T, null, 'fouls'); }
        else if (human(T)) NET.tellOne(S, T, (O) => O.toast('*Nakko!* No head shots — foul ' + T.fouls + '/' + TUNE.maram.fouls, 2200));
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
        const minD = TUNE.maram.minD;
        if (!P.tgt || P.tgt.out || (S.t > P.tgtT && !(P.windT > 0))) {
          // the nearest kid, rather one who is not running (an easier mark); colony manners: nobody throws
          // from point-blank (a kid right next to him counts as far away)
          let best = null, bs = Infinity;
          for (const Q of al) {
            const dq = pdist(P, Q), eff = dq >= minD ? dq : minD + (minD - dq) * 1.4;
            const s = eff * (0.75 + 0.5 * S.rng.next()) * (1 + Math.min(1, hyp(Q.svx || 0, Q.svy || 0) / 90) * 0.35) * (human(Q) ? TUNE.maram.meW : 1);
            if (s < bs) { bs = s; best = Q; }
          }
          if (P.windT > 0 && best !== P.tgt) windUp(S, P, best);
          P.tgt = best; P.tgtT = S.t + 1.1;
        }
        const T = P.tgt, d = pdist(P, T);
        const late = P.holdT > TUNE.maram.holdMax - 0.6;
        if (P.windT > 0) {
          halt(P); P.face = Math.atan2(T.e.y - e.y, T.e.x - e.x); S.tele = { from: P, to: T };
          if (windTick(S, P, T, dt)) {
            // the mark ran right up to him during the wind-up: no point-blank throw — a step back first
            if (d < minD * 0.6 && !late) { P.windT = 0; P.windT0 = 0; P.aimLock = null; P.lookT = 0; S.tele = null; }
            else LING.aiThrowAt(S, P, T);
          }
          return;
        }
        // a look round first (the others scatter), then a throw from where he stands
        if (P.lookT == null) P.lookT = lerp(TUNE.maram.look[1], TUNE.maram.look[0], S.d) * (0.8 + 0.4 * S.rng.next());
        // too close to his mark: a step back first (the wind-up then gives the mark a fair chance)
        if (!late && d < minD && P.holdT > P.lookT * 0.5) {
          const l = d || 1, q = clampIn(S.F, e.x - ((T.e.x - e.x) / l) * 10, e.y - ((T.e.y - e.y) / l) * 10, 4);
          goTo(P, q.x, q.y, TUNE.kidWalk * TUNE.maram.backWalk, 1); P.face = Math.atan2(T.e.y - e.y, T.e.x - e.x);
          return;
        }
        if ((P.holdT > P.lookT && d < lerp(TUNE.maram.range[0], TUNE.maram.range[1], S.d)) || late) { P.lookT = null; windUp(S, P, T); halt(P); return; }
        goTo(P, T.e.x, T.e.y, speedOf(S, P, false), 2);
        return;
      }
      if (aimedByMe(S, P)) { dance(S, P); return; }
      // the loose ball: the nearest two go for it (after the bounce); before the bounce they wait
      if (!b.holder && rectDist(S.F, b.x, b.y) < 70 && !lockedOut(S, P)) {
        const my = hyp(b.x - e.x, b.y - e.y);
        let rank = 0; for (const Q of S.parts) if (Q !== P && !Q.out && !lockedOut(S, Q) && hyp(b.x - Q.e.x, b.y - Q.e.y) < my) rank++;
        if (rank < 2 || my < 22) {
          if (canGrab(S, b)) { const d = goTo(P, b.x, b.y, run, 0.5); if (d < reachOf(S, b)) { give(S, P); log(S, 'grab', { name: P.name, bounced: b.bounced }); } return; }
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
      if (H && H !== P && pdist(P, H) < TUNE.maram.keepAway) {
        let ax = e.x - H.e.x, ay = e.y - H.e.y; const l = hyp(ax, ay) || 1; ax /= l; ay /= l;
        // stay on the ground: pull back towards the middle near the edges
        const ex = (c.x - e.x) / Math.max(20, S.F.w * 0.5), ey = (c.y - e.y) / Math.max(20, S.F.h * 0.5);
        // ... and spread out (kids scatter different ways; a clump is one easy target and a ball that misses
        // one of them hits the next)
        let sx = 0, sy = 0;
        const sp = TUNE.maram.spread;
        for (const Q of S.parts) {
          if (Q === P || Q === H || Q.out || !Q.e) continue;
          const qx = e.x - Q.e.x, qy = e.y - Q.e.y, qd = hyp(qx, qy);
          if (qd < sp && qd > 1e-3) { const w = (1 - qd / sp) * 1.6; sx += (qx / qd) * w; sy += (qy / qd) * w; }
        }
        let vx = ax + ex * 1.2 + sx, vy = ay + ey * 1.2 + sy; const vl = hyp(vx, vy) || 1; vx /= vl; vy /= vl;
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
        // no direction held (a phone thumb on DODGE alone): sidestep ACROSS the threat — the live ball's line,
        // else the wind-up line of whoever is about to throw — to the open side of the ground (a hop along
        // the line, the way Chinnu happens to face, dodges nothing)
        if (l < 0.2) {
          let ax = 0, ay = 0;
          if (b.state === 'air' && b.live && b.thrower !== me) { ax = b.vx; ay = b.vy; }
          else if (S.tele && S.tele.from && S.tele.from.e && S.tele.from !== me) { ax = p.x - S.tele.from.e.x; ay = p.y - S.tele.from.e.y; }
          else if (b.holder && b.holder !== me && b.holder.e) { ax = p.x - b.holder.e.x; ay = p.y - b.holder.e.y; }
          const al = hyp(ax, ay);
          if (al > 1e-3) {
            dx = -ay / al; dy = ax / al; l = 1;
            if ((S.F.cx - p.x) * dx + (S.F.cy - p.y) * dy < 0 || !walk(p.x + dx * 10, p.y + dy * 10)) { dx = -dx; dy = -dy; }
          }
        }
        if (l < 0.2) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); l = 1; }
        p.vx += (dx / l) * TUNE.maram.dashV; p.vy += (dy / l) * TUNE.maram.dashV;
        me.dashT = S.t; me.dashX = dx / l; me.dashY = dy / l; log(S, 'dodge');
      }
      // the hop is committed for a moment (the stick or the keys steer again after it): a thumb on DODGE
      // alone gets well out of the line, not a little shuffle
      if (!me.hold && S.t - me.dashT < TUNE.maram.hopT && me.dashX != null) {
        I.move.x = me.dashX; I.move.y = me.dashY; I.analog = true;
        const sp = hyp(p.vx, p.vy), along = p.vx * me.dashX + p.vy * me.dashY;
        if (along < TUNE.maram.dashV * 0.85) { p.vx += me.dashX * (TUNE.maram.dashV * 0.85 - along); p.vy += me.dashY * (TUNE.maram.dashV * 0.85 - along); }
        void sp;
      }
      if (me.hold) { holderControl(S, dt, I, MARAM.alive(S).filter((Q) => Q !== me)); return; }
      // the red line points at me (a wind-up) or a ball is coming: hands up to CATCH — time it with the throw
      if (MARAM.threatened(S)) {
        const ready = S.t - me.catchT > TUNE.catchCD;
        offer(S, ready ? 'CATCH!' : '');
        if (I.pressed('action') && ready) { me.catchT = S.t; if (NET.guest(S)) NET.cmd(S, { k: 'ct' }); log(S, 'catch_try', { tele: !!(S.tele && S.tele.to === me) }); sfx('pickup', { ui: true, vol: 0.25, pitch: 1.5 }); }
        I.consume('action');
        return;
      }
      const d = hyp(b.x - p.x, b.y - p.y);
      if (!b.holder && d < TUNE.myReach && lockedOut(S, me) && canGrab(S, b)) { offer(S, ''); I.consume('action'); return; }
      if (!b.holder && d < TUNE.myReach) {
        offer(S, 'Grab ball');
        if (I.pressed('action')) {
          if (canGrab(S, b)) { if (NET.guest(S)) NET.cmd(S, { k: 'gb' }); else give(S, me); log(S, 'grab', { name: me.name, me: true, bounced: b.bounced }); sfx('pickup', { ui: true, vol: 0.5 }); }
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
      if (S.boundT > 0) return 'Back inside the ground! Out in ' + Math.max(0, TUNE.maram.boundT - S.boundT).toFixed(1) + ' s';
      if (S.phase === 'toss') return 'Wait for the bounce… then grab it (' + a + ')';
      if (me.hold && tooClose(S, S.aimTarget)) return 'Too close to ' + S.aimTarget.name + ' — step back first (a hit from right next to him is a foul) · ' + Math.max(0, TUNE.maram.holdMax - me.holdT).toFixed(1) + 's';
      if (me.hold) return a + ': throw at ' + (S.aimTarget ? S.aimTarget.name : 'someone') + ' (below the head!) · hold for a hard one · ' + Math.max(0, TUNE.maram.holdMax - me.holdT).toFixed(1) + 's';
      if (MARAM.threatened(S)) return (b.state === 'air' || !S.tele ? 'Incoming! ' + r + ' = dodge · ' + a + ' = CATCH' : (S.tele.from.name || 'He') + (S.tele.to === me ? ' is aiming at you!' : ' is throwing your way!') + ' As the red fuse reaches you: ' + r + ' = dodge · ' + a + ' = catch');
      if (!b.holder && lockedOut(S, me)) return 'Not twice in a row — let somebody else get the ball';
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
      if (!b.holder && d < TUNE.myReach && canGrab(S, b) && lockedOut(S, me)) offer(S, '');
      else if (!b.holder && d < TUNE.myReach && canGrab(S, b)) {
        offer(S, 'Pick up ball');
        if (I.pressed('action')) { if (NET.guest(S)) NET.cmd(S, { k: 'gb' }); else give(S, me); sfx('pickup', { ui: true, vol: 0.5 }); log(S, 'grab', { name: me.name, me: true, bounced: b.bounced }); }
      } else offer(S, '');
      I.consume('action');
      S.aimTarget = null;
      return;
    }
    me.holdT += dt;
    // no running with the ball in your hand
    I.consume('run');
    const hw = S.id === 'marampitti' ? TUNE.maram.holdWalk : 0.72;
    I.move.x *= hw; I.move.y *= hw;
    S.aimTarget = chooseTarget(S, cands);
    const T = S.aimTarget;
    offer(S, T ? (tooClose(S, T) ? 'Too close! (' + T.name + ')' : 'Throw at ' + T.name) : 'Throw');
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
      if (NET.guest(S)) {
        // a guest: the same throw, worked out here and thrown by the host's game (shown here at once)
        const d2 = Math.max(4, hyp(tx - p.x, ty - p.y)), ang = Math.atan2(ty - p.y, tx - p.x) + gauss(S.rng) * errA, tf = Math.max(0.08, d2 / sp);
        NET.cmd(S, { k: 'th', a: +ang.toFixed(4), s: Math.round(sp), z: +clamp((tz - TUNE.hand) / tf + 0.5 * TUNE.g * tf, -30, 140).toFixed(2), t: S.parts.indexOf(T) });
      } else launchAt(S, me, tx, ty, tz, sp, errA, { target: T });
    } else {
      const a = p.facing != null ? p.facing : p.angle;
      if (NET.guest(S)) NET.cmd(S, { k: 'th', a: +a.toFixed(4), s: sp, z: power ? 22 : 12, t: -1 });
      else release(S, me, a, sp, power ? 22 : 12);
    }
    me.hold = false;
  }
  /** the line throw at the stack: aim + power */
  function aimControl(S, dt, I) {
    const L = S.L, A = S.aim, p = N.player, me = S.me;
    const toStack = Math.atan2(L.base.y - p.y, L.base.x - p.x);
    const mv = I.rawMove || I.move;
    // aim input: a pad stick (analog) points, keys rotate, the mouse points (2D), the camera looks (3D), the touch
    // stick is a catapult (below). In 3D the move vector is camera-relative (pointing the stick would chase the
    // camera round): there left / right turn the aim.
    const touchDev = !!(N.input && N.input.device === 'touch');
    if (is3D()) { if (Math.abs(mv.x) > 0.2) A.ang += mv.x * TUNE.aim.rotKey * dt; }
    else if (I.analog && touchDev) { /* the touch catapult below */ }
    else if (I.analog && hyp(I.move.x, I.move.y) > 0.35) A.ang = A.ang + adiff(A.ang, Math.atan2(I.move.y, I.move.x)) * Math.min(1, dt * 10);
    else if (Math.abs(mv.x) > 0.2) { A.ang += Math.sign(mv.x) * TUNE.aim.rotKey * dt; PTR.mouseT = 0; }
    if (!is3D() && PTR.mouseT > 0 && performance.now() - PTR.mouseT < 2000 && PTR.wx != null && !PTR.drag) A.ang = Math.atan2(PTR.wy - p.y, PTR.wx - p.x);
    if (is3D() && N.view) {
      if (A.yaw == null) { A.yaw = A.ang; try { N.view3d.setCamera({ yaw: A.ang }); } catch (e) { /* ignore */ } }
      else if (Math.abs(adiff(A.yaw, N.view.yaw)) > 0.002) { A.ang = N.view.yaw; A.yaw = N.view.yaw; }
      else if (Math.abs(adiff(A.yaw, A.ang)) > 0.002) { A.yaw = A.ang; try { N.view3d.setCamera({ yaw: A.ang }); } catch (e) { /* ignore */ } }
    }
    const asst = S.assist || isTouch();
    // touch (top-down): the joystick is the same catapult as a drag on the picture — pull back from the stack
    // (the thumb usually lands on the stick's half of the screen) and let go; the power bar shows the pull
    // armed only once the stick has been let go in this aim (a thumb still on it from walking up throws nothing)
    if (!A.stickArm && !(touchDev && I.analog && hyp(I.move.x, I.move.y) > 0.1)) A.stickArm = true;
    const tStick = !is3D() && touchDev && I.analog && !PTR.drag && A.stickArm;
    const tm = tStick ? hyp(I.move.x, I.move.y) : 0;
    if (tm > 0.2) {
      A.ang = Math.atan2(-I.move.y, -I.move.x); A.p = clamp(tm, 0.05, 1); A.charging = false; A.dragging = true; A.stickSling = true;
      zeroMove(I); I.consume('run'); p.angle = p.facing = A.ang;
      offer(S, 'Let go!'); I.consume('action');
      return;
    }
    if (A.stickSling) {
      A.stickSling = false; A.dragging = false;
      if (A.p >= 0.2) {
        if (asst && Math.abs(adiff(A.ang, toStack)) < TUNE.aim.assistSnap * 1.5) A.ang = toStack + adiff(toStack, A.ang) * 0.25;
        throwAtStack(S, A.ang, A.p); offer(S, ''); I.consume('action'); zeroMove(I);
        return;
      }
    }
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
      offer(S, 'Let go!'); I.consume('action');
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
      offer(S, 'Let go!');
    } else offer(S, isTouch() ? 'THROW ' + (S.L.tries + 1) + '/' + TUNE.lingocha.tries : 'Hold to throw (' + (S.L.tries + 1) + '/' + TUNE.lingocha.tries + ')');
    I.consume('action');
    void me;
  }
  function throwAtStack(S, ang, p) {
    const L = S.L, me = S.me;
    if (PG.debug.assist.aim) { ang = Math.atan2(L.base.y - N.player.y, L.base.x - N.player.x); if (PG.debug.assist.power == null) p = 0.55; }
    // a hard throw is a wild throw: the spread grows with the power (Assist / touch: a steadier hand)
    else ang += gauss(S.rng) * (TUNE.aim.err + TUNE.aim.errPow * p * p) * (S.assist || isTouch() ? 0.7 : 1);
    if (PG.debug.assist.power != null) p = PG.debug.assist.power;
    log(S, 'player_throw', { ang: +ang.toFixed(3), p: +p.toFixed(2) });
    if (NET.guest(S)) NET.cmd(S, { k: 'lt', a: +ang.toFixed(4), p: +p.toFixed(3) });
    else LING.stackThrow(S, me, ang, p);
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
        // (with friends every page builds the same teams from the host's list: the kids there now wander off)
        if (AMB.S && AMB.S.F === F) { if (params.party) endAmbient(false); else { adopt = AMB.S.kids.filter((k) => k.alive !== false); endAmbient(true); } }
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
   * dwell), and autoStart missions start by themselves; in the middle of a game on the ground that must not
   * happen (the colony ground carries the gully-league giver). While a free-roam game runs every giver's /
   * autoStart mission's when() says "not now" (wrapped once per def). A game a mission started holds nothing.
   * Should a mission start anyway (a script calling N.missions.start), the free-roam game ends ('mission').
   * When the game ends, a giver whose ring Chinnu is standing in keeps saying "not now" until he has walked out
   * of it (its r + 24 u, missions.js's own rule after a mission): the gully-league giver sits in the middle of the
   * colony ground, and its 1 s J-card dwell used to start the Gully League (cricket overlay) a second after the
   * final whistle, right under the "Play again" offer. */
  let giverHold = false;
  const giverAfter = new Set();  // ids of the givers Chinnu stood in at the end of the game
  function giverSpot(d) {
    const g = d && d.giver;
    if (!g) return null;
    if (g.npc) { const e = N.npcs && N.npcs.get && N.npcs.get(g.npc); if (e && typeof e.x === 'number') return e; }
    if (g.place) { const q = N.places && N.places[g.place]; if (q) return q; }
    return typeof g.x === 'number' ? g : null;
  }
  function giverUnderMe(d) {
    const g = giverSpot(d), p = N.player;
    return !!(g && p && hyp(p.x - g.x, p.y - g.y) <= (d.giver.r || 14) + 24);
  }
  function giverHeld(d) {
    if (giverHold) return true;
    if (!giverAfter.has(d.id)) return false;
    if (giverUnderMe(d)) return true;
    giverAfter.delete(d.id);
    return false;
  }
  function holdGivers(on) {
    const was = giverHold;
    giverHold = !!on;
    const M = N.missions;
    if (!M || !M.defs) return;
    if (!on) {
      // released at the end of a free-roam game: the rings Chinnu stands in wait till he steps out
      if (was) for (const id in M.defs) { const d = M.defs[id]; if (d && d.__pgWhen && d.giver && giverUnderMe(d)) giverAfter.add(d.id); }
      return;
    }
    giverAfter.clear();
    for (const id in M.defs) {
      const d = M.defs[id];
      if (!d || !(d.giver || d.autoStart) || d.__pgWhen) continue;
      const ow = d.when;
      d.__pgWhen = true;
      d.when = function () { if (giverHeld(d)) return false; return typeof ow === 'function' ? ow.apply(this, arguments) : true; };
    }
  }
  /** top-down: zoom in so the whole ground (plus a margin) fills the view */
  function gameZoom(F) {
    const R = N.render, W = (R && R.W) || 640, H = (R && R.H) || 360;
    // a phone held upright is narrow: fit the ground's width (a slimmer margin) and zoom in further, so the
    // kids and the ball are a thumb's size, not specks
    const tall = H > W * 1.15;
    const padW = tall ? TUNE.zoomPadTall : TUNE.zoomPad;
    return clamp(Math.min(W / (F.w + padW), H / (F.h + TUNE.zoomPad)), TUNE.zoom[0], tall ? TUNE.zoom[2] : TUNE.zoom[1]);
  }
  function startReal(S) {
    holdGivers(!S.byMission);
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
      const my = S.me && S.L ? S.me.team : 0;
      const sub = S.id === 'lingocha' ? S.teamName[my] + ' ' + r.roundsWon + ' – ' + r.roundsLost + ' ' + S.teamName[1 - my] + (r.paid ? ' · +' + U.fmtMoney(r.paid) : '') : (r.win ? 'Hits ' + r.hits + (r.catches ? ' · catches ' + r.catches : '') + (r.paid ? ' · +' + U.fmtMoney(r.paid) : '') : 'Placed ' + r.rank + ' of ' + r.kids);
      banner(t, sub, 2600, r.win ? 'pass' : 'fail');
      if (r.win) sfx('finger_whistle', { ui: true, vol: 0.7 });
    }
    // with friends / through N.party: the result goes to the party card (and the host tells the friends' pages it is over)
    if (S.party) { try { NET.ended(S, r); } catch (e) { N.err('pg.party.report', e); } }
    cleanupReal(S);
    // a free-roam game that ended normally: "Play again" right where Chinnu stands for a few seconds (the kids
    // are still there; no walking back to find the Join spot after being knocked out in ten seconds)
    AGAIN.gid = null;
    if (S.params.side && !r.aborted && !r.quit && r.reason !== 'window' && r.reason !== 'chappal') { AGAIN.gid = S.id; AGAIN.F = S.F; AGAIN.until = now() + TUNE.againT; }
    try { N.emit('minigame:end', { id: S.id, result: r, inWorld: true }); } catch (e) { /* ignore */ }
    const res = S.resolve; S.resolve = null;
    if (res) { try { res(r); } catch (e) { N.err('pg.resolve', e); } }
  }
  function cleanupReal(S) {
    if (current === S) current = null;
    NET.unwire(S);
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
    NET.unwire(S);
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
  const AGAIN = { gid: null, F: null, until: 0, offer: null };
  function againOffer() {
    const A = AGAIN, p = N.player;
    if (!A.gid || current) return;
    if (now() > A.until || !p || p.vehicle || rectDist(A.F, p.x, p.y) > 40 || !offerOpen(A.F)) { if (now() > A.until) A.gid = null; return; }
    if (!A.offer) A.offer = { priority: 1, dist: 0, label: '', use() { const g = AGAIN.gid, F = AGAIN.F; AGAIN.gid = null; if (g && F) play(g, { place: F.ids[0], side: true }); } };
    A.offer.label = 'Play again (' + GAMES[A.gid].title.toLowerCase() + ')';
    try { N.interact.offer(A.offer); } catch (e) { /* ignore */ }
  }
  function ctlUpdate(dt) {
    againOffer();
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
    // N.party may arrive after this file (or the room / the nearest ground changed): keep the registration fresh
    PREG.t -= dt;
    if (PREG.t <= 0) { PREG.t = 2; try { registerParty(); } catch (e) { N.err('pg.party.register', e); } }
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
    // a friend's page in a party game: it shows the host's game (src/playground_games.js NET)
    if (S.net && S.net.guest) { try { NET.mirrorStep(S, dt); } catch (e) { N.err('pg.mirror:' + S.id, e); } return; }
    if (S.net && S.net.host) NETCAP.S = S;
    try {
      S.G.update(S, dt);
      if (S.ended) return;
      for (const P of S.parts) moveKid(S, P, dt);
      if (S.me && N.player) smoothVel(S.me, N.player.vx || 0, N.player.vy || 0, dt);
      separate(S);
      ballStep(S, dt);
      for (const pp of S.pops) pp.t += dt;
      for (let i = S.pops.length - 1; i >= 0; i--) if (S.pops[i].t > S.pops[i].life) { const o = S.pops.splice(i, 1)[0]; if (o.el) o.el.remove(); }
      if (S.tele && (!S.tele.from.hold || S.tele.from.windT <= 0)) S.tele = null;
      S.specT = (S.specT || 0) - dt;
      if (S.specT <= 0) { S.specT = 1; spectators(S, true); }
      if (S.ambient) ambientChatter(S, dt);
      else realChecks(S, dt);
      if (S.net && S.net.host && !S.ended) NET.hostStep(S, dt);
    } catch (e) { N.err('pg.step:' + S.id, e); }
    NETCAP.S = null;
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
    if (S.endAt != null && S.t >= S.endAt) { if (S.net && S.net.host) NET.finish(S, S.endExtra || {}); else endSession(S, S.endWin, S.endExtra); return; }
    if (p.vehicle) { if (S.net && S.net.host) NET.finish(S, { quit: true, reason: 'host_left' }); else endSession(S, false, { quit: true, reason: 'vehicle' }); return; }
    // a playground game is all running: Chinnu's legs last longer on the ground (part of the run drain back)
    try { if (p.running && !p.god && p.TUNE && p.TUNE.runDrain) p.energy = Math.min(p.tummy != null ? p.tummy : 100, p.energy + dt * p.TUNE.runDrain * TUNE.runRefund); } catch (e) { /* ignore */ }
    ballRescue(S, dt);
    if (N.wanted && N.wanted.level >= 3 && S.endAt == null) {
      banner('BHAAGO!', 'The Chappal Meter is up — game over, run!', 2400, 'fail');
      if (S.net && S.net.host) NET.finish(S, { reason: 'chappal' }); else endSession(S, false, { reason: 'chappal' });
      return;
    }
    // walked off the ground (fetching the ball that went off it does not count)
    const d = rectDist(F, p.x, p.y), bl = S.ball;
    const fetching = (S.me && S.me.hold) || (!bl.holder && !bl.hiddenBall && hyp(bl.x - p.x, bl.y - p.y) < 30 && rectDist(F, bl.x, bl.y) > 2);
    if (d > TUNE.leaveR && !fetching) {
      S.awayT = (S.awayT || 0) + dt;
      if (S.awayT > 0.2 && !S.awayWarned) { S.awayWarned = true; toast('*Arre*, where are you going? Come back or the game is over!', 2400); }
      if (S.awayT > TUNE.leaveT) {
        if (S.params.noQuit) { const q = edgeSpot(F, p.x, p.y, -6); p.x = q.x; p.y = q.y; p.vx = p.vy = 0; S.awayT = 0; S.awayWarned = false; toast('Game’s not over, ra!', 1800); }
        else { endSession(S, false, { quit: true, reason: 'left' }); return; }
      }
    } else { S.awayT = 0; S.awayWarned = false; }
    if (S.barkT > 0) S.barkT -= dt;
    else { S.barkT = 4 + S.rng.next() * 5; const k = S.parts.find((Q) => !human(Q) && !Q.out && S.rng.next() < 0.3); if (k) bark(S, k, pick(S, BARK.chatter)); }
    hudUpdate(S);
  }
  /** a ball lost in a drain / the lake / behind a house comes back: "Ball la, ra!" */
  function ballRescue(S, dt) {
    const b = S.ball;
    // a free ball nobody manages to pick up (behind a wall, in a corner the kids can't path into): it is
    // fetched back onto the open ground. Counted only while the game is live (not the line throws / tosses).
    const live = (S.id === 'lingocha' && S.phase === 'live') || (S.id === 'marampitti' && S.phase === 'play');
    if (live && !b.holder && !b.hiddenBall) S.freeT = (S.freeT || 0) + dt; else S.freeT = 0;
    if (b.hiddenBall || b.state === 'held' || b.state === 'air') { S.ballOutT = 0; return; }
    const off = rectDist(S.F, b.x, b.y);
    const stuck = live && (S.freeT > (TUNE.freeMax[S.id] || 8) || (off > 2 && S.freeT > TUNE.freeMax.outside));
    if (b.lost || off > 24 || !walk(b.x, b.y) || stuck) {
      S.ballOutT = (S.ballOutT || 0) + dt;
      if (S.ballOutT > 2.5 || stuck) {
        const c = off > 2 || !stuck ? clampIn(S.F, b.x, b.y, 6) : { x: lerp(b.x, S.F.centre.x, 0.5), y: lerp(b.y, S.F.centre.y, 0.5) };
        const q = spotNear(c.x, c.y, 3, 14, S.F);
        Object.assign(b, { x: q.x, y: q.y, z: 0, vx: 0, vy: 0, vz: 0, state: 'rest', lost: false, live: false, bounced: 1, lockP: null, lockT: 0 });
        S.ballOutT = 0; S.freeT = 0;
        const k = S.parts.find((Q) => !human(Q) && !Q.out);
        if (k) bark(S, k, 'Ball *la*, ra!');
        log(S, 'ball_back', { stuck: !!stuck });
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
    // (tx, ty: along that side, so several crowds stand in a row instead of one blob)
    const c = [[F.cx, F.y1 + 9, 1, 0], [F.cx, F.y0 - 9, 1, 0], [F.x0 - 9, F.cy, 0, 1], [F.x1 + 9, F.cy, 0, 1], [F.cx, F.y1 - 4, 1, 0], [F.x0 + 4, F.cy, 0, 1]];
    for (const [x, y, tx, ty] of c) if (clearAt(x, y, 5)) return { x, y, tx, ty };
    return { x: F.x0 + 4, y: F.y0 + 4, tx: 1, ty: 0 };
  }
  function spectators(S, on) {
    if (!S.zones) S.zones = new Map();
    if (!on) { for (const [z, o] of S.zones) { z.x = o.x; z.y = o.y; z.r = o.r; } S.zones.clear(); return; }
    const T = N.traffic;
    if (!T || !T.peds) return;
    const F = S.F;
    for (const p of T.peds) {
      const z = p && p.zone;
      if (!z || z.kind !== 'playground' || S.zones.has(z) || hyp(z.x - F.cx, z.y - F.cy) > 260) continue;
      if (z.__pgMoved) continue;
      S.zones.set(z, { x: z.x, y: z.y, r: z.r });
      const q = F.side || (F.side = sideline(F));
      // crowds side by side along the line (0, -16, +16, -32 ...), each a loose group (r 9: one sideline off the edge
      // stays off the pitch), never past the end of that side
      const k = S.zones.size - 1, half = Math.max(8, (q.tx ? F.w : F.h) / 2 - 6), off = clamp((k % 2 ? -1 : 1) * Math.ceil(k / 2) * 16, -half, half);
      const sx = q.x + q.tx * off, sy = q.y + q.ty * off, okSpot = walk(sx, sy);
      z.x = okSpot ? sx : q.x; z.y = okSpot ? sy : q.y; z.r = 9; z.__pgMoved = true;
    }
    for (const z of S.zones.keys()) z.__pgMoved = true;
    // the onlookers already out on the ground (walking to, or idling at, a spot they picked before the zone moved)
    // leave the pitch now, not after their 2-7 s idle there: a kid loitering between the chalk line and the stack
    // blocked the line throw. (traffic.js: a ped with no target picks a new one in its zone, i.e. the sideline.)
    for (const p of T.peds) {
      if (!p || !p.alive || !p.zone || !S.zones.has(p.zone) || p.__pgOffT > now()) continue;
      const tg = p.tgt, onPitch = inRect(F, p.x, p.y, 3) || (tg && inRect(F, tg.x, tg.y, 3));
      if (!onPitch || (tg && !inRect(F, tg.x, tg.y, 3) && hyp(tg.x - p.zone.x, tg.y - p.zone.y) <= p.zone.r + 2)) continue;
      p.tgt = null; p.idleT = 0; p.__pgOffT = now() + 3;
      if (p.mode === 'goto') p.mode = 'wander';
    }
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
            if (!P.e || (P.out && !human(P))) continue;
            // a dark under-stroke so the ring reads on red dust and pale sand alike; Chinnu's ring is the
            // boldest on the ground (find yourself at a glance); a friend from the room: a bold ring in his colour
            const w = P.isPlayer ? 1.2 : P.remote ? 1 : 0.7;
            ctx.globalAlpha = P.out ? 0.2 : 0.45; ctx.strokeStyle = '#1a1214'; ctx.lineWidth = w + 0.7;
            ctx.beginPath(); ctx.ellipse(P.e.x, P.e.y + 0.6, 4.6, 3.6, 0, 0, TAU); ctx.stroke();
            ctx.globalAlpha = P.out ? 0.3 : human(P) ? 1 : 0.85;
            ctx.strokeStyle = S.id === 'marampitti' ? (P.isPlayer ? '#f2c230' : P.remote ? (P.col || '#5fd0ff') : '#f4ead8') : (TEAM_COL[P.team] || '#fff');
            ctx.lineWidth = w;
            ctx.beginPath(); ctx.ellipse(P.e.x, P.e.y + 0.6, 4.6, 3.6, 0, 0, TAU); ctx.stroke();
            if (P.safeT > 0) { ctx.globalAlpha = 0.6 + 0.3 * Math.sin(S.t * 14); ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(P.e.x, P.e.y, 6.2, 0, TAU); ctx.stroke(); }
            // Chinnu's busy hands (picking / placing a stone): a filling arc
            if (P.isPlayer && P.act && P.actT0 > 0) {
              const f = clamp(1 - P.actT / P.actT0, 0, 1);
              ctx.globalAlpha = 0.95; ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 1.2;
              ctx.beginPath(); ctx.arc(P.e.x, P.e.y, 6.4, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
            }
            // hands up for a catch
            if (S.id === 'marampitti' && MARAM.catching(S, P)) { ctx.globalAlpha = 0.9; ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(P.e.x, P.e.y, 6.6, 0, TAU); ctx.stroke(); }
          }
          const T = S.aimTarget;
          if (T && S.me && S.me.hold && T.e) {
            ctx.globalAlpha = 0.85; ctx.strokeStyle = tooClose(S, T) ? '#ffa23a' : '#ff5a4a'; ctx.lineWidth = 0.8;
            const r = 5.6 + Math.sin(S.t * 10) * 0.5;
            ctx.beginPath(); ctx.arc(T.e.x, T.e.y, r, 0, TAU); ctx.stroke();
            for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + S.t; ctx.beginPath(); ctx.moveTo(T.e.x + Math.cos(a) * (r - 1.6), T.e.y + Math.sin(a) * (r - 1.6)); ctx.lineTo(T.e.x + Math.cos(a) * (r + 1.6), T.e.y + Math.sin(a) * (r + 1.6)); ctx.stroke(); }
          }
          ctx.globalAlpha = 1;
        }));
      }
      // the wind-up telegraph: a dashed red line on the ground from the thrower to the target
      if (S.tele && S.tele.from.e && S.tele.to.e && !done) {
        const tl = teleLine(S), f = fuse(S.tele.from), lockF = 1 - lerp(TUNE.lockT[0], TUNE.lockT[1], S.d) / Math.max(0.05, S.tele.from.windT0 || 1);
        const atMe = S.real && S.tele.to === S.me;
        R.queue('ground', 6, () => D.flat((ctx) => {
          ctx.globalAlpha = 0.55; ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 0.7; ctx.setLineDash([2.2, 2.2]);
          ctx.beginPath(); ctx.moveTo(tl.ax, tl.ay); ctx.lineTo(tl.bx, tl.by); ctx.stroke();
          // ... and on past him (where a miss goes): fainter
          ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(tl.bx, tl.by); ctx.lineTo(tl.ex, tl.ey); ctx.stroke();
          ctx.setLineDash([]);
          // the fuse: a solid line burns from the thrower to his mark; when it gets there he lets go. Once his aim is
          // committed (the last stretch) it glows: dodge NOW
          if (f > 0) {
            const hot = f >= lockF, fx = tl.ax + (tl.bx - tl.ax) * f, fy = tl.ay + (tl.by - tl.ay) * f;
            ctx.globalAlpha = 0.9; ctx.strokeStyle = '#1a1214'; ctx.lineWidth = hot ? 2.1 : 1.6;
            ctx.beginPath(); ctx.moveTo(tl.ax, tl.ay); ctx.lineTo(fx, fy); ctx.stroke();
            ctx.strokeStyle = hot ? '#ffd84a' : '#ff5a4a'; ctx.lineWidth = hot ? 1.3 : 0.9;
            ctx.beginPath(); ctx.moveTo(tl.ax, tl.ay); ctx.lineTo(fx, fy); ctx.stroke();
            ctx.fillStyle = hot ? '#fff3b0' : '#ffb0a0'; ctx.beginPath(); ctx.arc(fx, fy, hot ? 1.3 : 0.9, 0, TAU); ctx.fill();
            // the mark's ring closes in with the fuse (on Chinnu: where to look)
            if (atMe) { ctx.globalAlpha = 0.85; ctx.strokeStyle = hot ? '#ffd84a' : '#ff5a4a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(tl.bx, tl.by, 5 + (1 - f) * 9, 0, TAU); ctx.stroke(); }
          }
          ctx.globalAlpha = 1;
        }));
      }
      // maram pitti: the chalk boundary (pulses red while Chinnu is out past it)
      if (S.real && !done && S.id === 'marampitti') {
        const segs = boundSegs(F), warn = (S.boundT || 0) > 0, t = S.t;
        R.queue('ground', 4, () => D.flat((ctx) => {
          ctx.strokeStyle = warn ? 'rgba(255,110,90,' + (0.6 + 0.35 * Math.sin(t * 12)).toFixed(2) + ')' : 'rgba(248,246,236,0.5)';
          ctx.lineWidth = warn ? 1 : 0.6;
          ctx.beginPath();
          for (const q of segs) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); }
          ctx.stroke();
        }));
      }
      // the ball (and its shadow)
      const bl = S.ball;
      if (!bl.hiddenBall && !(done && !S.real)) {
        const bx = bl.x, by = bl.y, bz = bl.z;
        R.queue('shadow', 1, () => D.shadow(bx, by, 2, 2, 0, bz + 0.6));
        // a loose ball in a real game: a soft pulsing ring on the ground (where is it? there!)
        if (S.real && !done && !bl.holder && (bl.state !== 'air' || bl.bounced > 0)) {
          const t = S.t;
          R.queue('ground', 6, () => D.flat((ctx) => {
            const r = 3.6 + Math.sin(t * 7) * 0.7;
            ctx.globalAlpha = 0.85; ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.stroke();
            ctx.strokeStyle = '#e8f55a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.stroke();
            ctx.globalAlpha = 1;
          }));
        }
        // held: drawn over the holder's sprite (in the hand, not hidden under the head)
        const key = bl.holder && bl.holder.e ? Math.max(by, bl.holder.e.y) + 0.3 : by + 0.05;
        R.queue('actors', key, (ctx) => {
          const k = R.k(bz + TUNE.ballR), X = R.sx(bx, k), Y = R.sy(by, k), r = Math.max(1.6, 1.4 * k);
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
    hudAvoid();
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
  /** in an online room the room badge / quick chat stand at the right edge (online.js): on a phone they would sit on top
   *  of this panel's prompt, so the panel stops short of them while they are beside it */
  function hudAvoid() {
    const r = HUDS.root;
    if (!r) return;
    // the room's column (online.js .ol-hud) sits on the right at the panel's height on phones: the panel then keeps to
    // the left of it (pinned to the left edge, so it does not re-centre into it and flip back and forth)
    let mw = '';
    try {
      const ol = document.querySelector('.ol-hud'), par = r.parentElement;
      if (ol && par && !ol.hidden && ol.offsetParent !== null) {
        const a = r.getBoundingClientRect(), b = ol.getBoundingClientRect(), p = par.getBoundingClientRect();
        const x0 = p.left + (parseFloat(getComputedStyle(par).paddingLeft) || 0);
        if (!HUDS.last.mw || !HUDS.natW) HUDS.natW = a.width; // (its own width, centred, before any squeeze)
        const right = p.left + p.width / 2 + HUDS.natW / 2;
        if (b.width > 0 && b.height > 0 && b.top < a.bottom + 4 && b.bottom > a.top - 4 && b.left < right + 4 && b.left > x0 + 170) mw = Math.floor(b.left - x0 - 8) + 'px';
      }
    } catch (e) { mw = ''; }
    if (HUDS.last.mw !== mw) { HUDS.last.mw = mw; r.style.maxWidth = mw; r.style.alignSelf = mw ? 'flex-start' : ''; }
  }
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
  const V3L = { grp: null, ball: null, bsh: null, stones: [], chalk: null, ring: null, arrow: null, rings: [], reticle: null, tele: null, fuse: null, T: null, H: null, ok: false };
  function v3Init(THREE, H) {
    V3L.T = THREE; V3L.H = H;
    // a material we recolour at run time is our own copy (H.mat's are cached and shared by every layer)
    const own = (hex, o) => { const m = H.mat(hex, o).clone(); m.userData = {}; return m; };
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
    const amat = own('#f2c230', { basic: true, transparent: true, opacity: 0.85, double: true });
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
    const ret = new THREE.Mesh(new THREE.RingGeometry(4.8, 5.6, 28), own('#ff5a4a', { basic: true, transparent: true, opacity: 0.9, double: true }));
    ret.rotation.x = -Math.PI / 2; ret.visible = false; g.add(ret); V3L.reticle = ret;
    const tele = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), H.mat('#ff5a4a', { basic: true, transparent: true, opacity: 0.55, double: true }));
    tele.rotation.x = -Math.PI / 2; tele.visible = false; g.add(tele); V3L.tele = tele;
    // the wind-up fuse: a brighter strip that burns along the line (gold once his aim is committed)
    const fmat = own('#ff5a4a', { basic: true, transparent: true, opacity: 0.95, double: true });
    V3L.bmat = own('#f4f2ea', { basic: true, transparent: true, opacity: 0.6, double: true });
    const fz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.25), fmat);
    fz.rotation.x = -Math.PI / 2; fz.visible = false; fz.userData.mat = fmat; g.add(fz); V3L.fuse = fz;
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
    // maram pitti's chalk boundary (one mesh per ground, rebuilt when the ground changes)
    const showB = S.real && !S.ended && S.id === 'marampitti';
    if (showB && V3L.bKey !== S.F.key) {
      if (V3L.bound) { g.remove(V3L.bound); V3L.bound.geometry.dispose(); }
      const segs = boundSegs(S.F), pos = [], w = 0.35;
      for (const q of segs) {
        const dx = q[2] - q[0], dy = q[3] - q[1], l = hyp(dx, dy) || 1, nx = (-dy / l) * w, ny = (dx / l) * w;
        const h0 = hAt(q[0], q[1]) + 0.07, h1 = hAt(q[2], q[3]) + 0.07;
        pos.push(q[0] - nx, h0, q[1] - ny, q[2] - nx, h1, q[3] - ny, q[2] + nx, h1, q[3] + ny, q[0] - nx, h0, q[1] - ny, q[2] + nx, h1, q[3] + ny, q[0] + nx, h0, q[1] + ny);
      }
      const geo = new V3L.T.BufferGeometry();
      geo.setAttribute('position', new V3L.T.Float32BufferAttribute(pos, 3));
      const bm = new V3L.T.Mesh(geo, V3L.bmat);
      bm.renderOrder = 2; bm.userData.noShadow = true; bm.frustumCulled = false;
      g.add(bm); V3L.bound = bm; V3L.bKey = S.F.key;
    }
    if (V3L.bound) {
      V3L.bound.visible = showB && V3L.bKey === S.F.key;
      if (V3L.bound.visible) V3L.bmat.color.set((S.boundT || 0) > 0 && Math.sin(S.t * 12) > 0 ? '#ff6e5a' : '#f4f2ea');
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
        if (ri >= V3L.rings.length || !P.e || (P.out && !human(P))) continue;
        const m = V3L.rings[ri++];
        m.visible = true;
        const hands = S.id === 'marampitti' && MARAM.catching(S, P);
        m.material = P.safeT > 0 || hands ? V3L.smat : S.id === 'marampitti' ? (P.isPlayer ? V3L.rmat[0] : P.remote ? V3L.rmat[1] : V3L.wmat) : V3L.rmat[P.team] || V3L.wmat;
        m.position.set(P.e.x, hAt(P.e.x, P.e.y) + 0.06, P.e.y);
        const sc = P.safeT > 0 || hands ? 1.4 : P.isPlayer && P.act ? 1.15 + 0.25 * Math.sin(S.t * 16) : 1; m.scale.set(sc, sc, sc);
      }
    }
    for (; ri < V3L.rings.length; ri++) V3L.rings[ri].visible = false;
    const T = S.real && S.me && S.me.hold ? S.aimTarget : null;
    V3L.reticle.visible = !!(T && T.e);
    if (T && T.e) { V3L.reticle.position.set(T.e.x, hAt(T.e.x, T.e.y) + 0.08, T.e.y); V3L.reticle.rotation.z = S.t * 2; V3L.reticle.material.color.set(tooClose(S, T) ? '#ffa23a' : '#ff5a4a'); }
    const tl = S.tele;
    V3L.tele.visible = !!(tl && tl.from.e && tl.to.e && !S.ended);
    if (V3L.tele.visible) {
      const q = teleLine(S), l = q.l + TUNE.overshoot * 0.6;
      const cx = q.ax + (q.ex - q.ax) * (l / (q.l + TUNE.overshoot)) * 0.5, cy = q.ay + (q.ey - q.ay) * (l / (q.l + TUNE.overshoot)) * 0.5;
      V3L.tele.scale.set(l, 1, 1);
      V3L.tele.position.set(cx, hAt(cx, cy) + 0.09, cy);
      V3L.tele.rotation.set(-Math.PI / 2, 0, -Math.atan2(q.by - q.ay, q.bx - q.ax));
    }
    const fz = V3L.fuse, ff = V3L.tele.visible ? fuse(tl.from) : 0;
    fz.visible = ff > 0.02;
    if (fz.visible) {
      const q = teleLine(S), l = q.l * ff, ux = (q.bx - q.ax) / (q.l || 1), uy = (q.by - q.ay) / (q.l || 1);
      const cx = q.ax + ux * l * 0.5, cy = q.ay + uy * l * 0.5;
      fz.scale.set(l, 1, 1);
      fz.position.set(cx, hAt(cx, cy) + 0.11, cy);
      fz.rotation.set(-Math.PI / 2, 0, -Math.atan2(uy, ux));
      fz.userData.mat.color.set(ff >= 1 - lerp(TUNE.lockT[0], TUNE.lockT[1], S.d) / Math.max(0.05, tl.from.windT0 || 1) ? '#ffd84a' : '#ff5a4a');
    }
    void dt;
  }
  function v3Dispose(H) {
    if (V3L.grp) { try { H.layer.remove(V3L.grp); H.dispose(V3L.grp); } catch (e) { /* ignore */ } }
    V3L.grp = null; V3L.ok = false; V3L.rings = []; V3L.stones = []; V3L.bound = null; V3L.bKey = null;
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
        F.offerAt = F.offerAt || {};
        F.offerAt[gid] = { x: q.x, y: q.y };
        I.add(key, {
          x: q.x, y: q.y, r: 18, priority: -1,
          label: () => (AMB.S && AMB.S.F === F && AMB.S.id === gid ? 'Join their ' : 'Join ') + (gid === 'lingocha' ? 'lingocha' : 'maram pitti'),
          // (with friends in the online room the party's "... with friends" prompt stands here instead: N.party start card)
          enabled: () => offerOpen(F) && !NET.prompting(gid),
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

  /* ================================================================ party: friends from the online room (N.party) */
  // Lingocha and maram pitti with friends (src/party.js, ARCHITECTURE §24 "Party activities"). The challenger's page is
  // the HOST: it runs the one real game (rules, the AI kids, ball, stones) with every friend as a participant (P.remote:
  // his own page moves him, the host follows his online ghost). About nine times a second it sends a snapshot ('ps':
  // kids, ball, stones, phase, score, the wind-up fuse) with the moments since the last one (pops, barks, sounds in the
  // world, banners / toasts / walk-to-your-spot for one friend), and at the end everybody's result ('pe'). A friend's
  // page is a GUEST: it shows that game (its kids follow the snapshots, the ball is carried forward to now) and plays
  // its own Chinnu with his own controls; what he does goes to the host as a command ('pc': pick / stack a stone, grab /
  // throw the ball, the line throw, a catch try) and shows at once (the host's next snapshot has the last word). A live
  // ball reaching a guest is judged on the guest's page (his last-moment dodge counts there) and reported ('hm').
  // Lingocha: friends captain opposite teams (slot 0 and 2 home, slot 1 away); maram pitti: everybody in one ring.
  // A friend who leaves is replaced by a colony kid; if the host leaves, the game is over for everybody.
  // Solo through N.party (no room): the plain game with the AI friends (Immu, Ayesha) in the team / ring, results to
  // the party card. Every message is checked here (the room channel is public).
  const PARTY_ID = { lingocha: 'lingocha', marampitti: 'maram_pitti' };
  const PH = ['setup', 'aim', 'flight', 'return', 'scatter', 'live', 'roundEnd', 'toss', 'play'];
  const BALL_ST = ['rest', 'air', 'roll', 'held'];
  const STONE_ST = ['stack', 'fly', 'loose', 'carried'];
  // online.js's player-marker colours, by the room's player order (the ring under a friend matches his marker)
  const PCOL = ['#ffd23f', '#3fa9ff', '#ff5a5f', '#5ce05a', '#c46bff', '#ff9f1c', '#2ee6d6', '#ff6fc8', '#f2f2f2', '#b6f03c'];
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const num = (v, d) => (fin(+v) ? +v : d);
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const LOCAL_OUT = { banner, toast, sfx: (n, o) => sfx(n, o) };
  function friendsHere() { try { return !!(N.party && N.party.challenge && N.online && N.online.room && (N.online.room.n | 0) > 1); } catch (e) { return false; } }

  const NET = {
    ghosts: new Map(),
    guest: (S) => !!(S && S.net && S.net.guest),
    /** the party's "<game> with friends" prompt stands on the Join offer (friends in the room) */
    prompting(gid) { return friendsHere() && !!(N.party && N.party.get && N.party.get(PARTY_ID[gid])); },
    colour(uid) { try { const L = N.online && N.online.players ? N.online.players() : []; const i = L.findIndex((p) => p.key === uid); return PCOL[(i < 0 ? 0 : i) % PCOL.length]; } catch (e) { return PCOL[1]; } },
    ghostOf(uid) {
      if (!uid) return null;
      let g = NET.ghosts.get(uid);
      if (!(g && g.alive !== false && g.online === uid)) {
        g = null;
        try { const list = N.entities.byKind ? N.entities.byKind('ghost') : N.entities.all; for (const e of list) if (e && e.kind === 'ghost' && e.online === uid) { g = e; break; } } catch (e) { g = null; }
        if (g) NET.ghosts.set(uid, g); else NET.ghosts.delete(uid);
      }
      return g && !g.hidden && g.x > -9000 ? g : null;
    },
    /** the shared party clock (ms): the host's Date.now() */
    now(S) { try { return S.party.now(); } catch (e) { return Date.now(); } },
    /** a moment for the friends' pages (host): [id, kind, ...] */
    ev(S, e) { const n = S && S.net; if (!n || !n.host) return; n.ev.push([++n.evId].concat(e)); if (n.ev.length > 160) n.ev.shift(); },
    /** walk P to q (null: stop walking there) — Chinnu here, a friend on his own page */
    autoFor(S, P, q, face, out) {
      if (!P) return;
      if (P.isPlayer) { S.auto = q ? { x: q.x, y: q.y, t: 0, face, out: !!out } : null; return; }
      if (P.remote && S.net && S.net.host) NET.ev(S, ['a', P.uid, q ? Math.round(q.x * 10) : null, q ? Math.round(q.y * 10) : 0, Math.round((face || 0) * 100), out ? 1 : 0]);
    },
    outFor(S, P) {
      return {
        banner: (t, s, ms, k) => NET.ev(S, ['n', P.uid, String(t), String(s || ''), ms || 2200, k || 'info']),
        toast: (t, ms) => NET.ev(S, ['t', P.uid, String(t), ms || 2400]),
        sfx: (name, o) => NET.ev(S, ['u', P.uid, String(name), (o && o.vol) || 1, (o && o.delay) || 0]),
      };
    },
    /** fn(P, out) for every person in the game: Chinnu here, and (host) each friend on his own page */
    tell(S, fn) {
      if (!S || !S.real) return;
      if (S.me) { try { fn(S.me, LOCAL_OUT); } catch (e) { N.err('pg.tell', e); } }
      if (S.net && S.net.host) for (const P of S.parts) if (P.remote) { try { fn(P, NET.outFor(S, P)); } catch (e) { N.err('pg.tell', e); } }
    },
    tellOne(S, P, fn) {
      if (!P || !S || !S.real) return;
      try { if (P.isPlayer) fn(LOCAL_OUT); else if (P.remote && S.net && S.net.host) fn(NET.outFor(S, P)); } catch (e) { N.err('pg.tell', e); }
    },

    /* ---------------------------------------------------------------- set-up */
    wire(S) {
      const ctx = S.party;
      if (!ctx || ctx.mode !== 'party') { S.net = null; return; }
      const host = !!ctx.isHost;
      const n = (S.net = { host, guest: !host, hostUid: ctx.players[0] && ctx.players[0].uid, ev: [], evId: 0, evSent: 0, evSeen: 0, evQ: [], sendT: 0, initT: 0,
        acks: new Set(), need: ctx.players.filter((q) => !q.isAI && !q.isMe).length, offs: [], cq: 0, snap: null, applied: null, pred: null, first: true, sent: 0, recv: 0, cmds: 0, hits: 0, initMsg: null });
      const on = (t, f) => { try { n.offs.push(ctx.on(t, (d, from) => { if (current !== S || S.ended || !d || typeof d !== 'object') return; try { f(d, from); } catch (e) { N.err('pg.party.' + t, e); } })); } catch (e) { N.err('pg.party.on', e); } };
      if (host) {
        on('pa', (d, from) => { if (from && from.uid) n.acks.add(from.uid); });
        on('pc', (d, from) => { n.cmds++; NET.hostCmd(S, d, from); });
      } else {
        on('ps', (d, from) => {
          if (!from || from.uid !== n.hostUid) return;
          n.snap = d; n.recv++;
          if (Array.isArray(d.e)) for (const e of d.e) if (Array.isArray(e) && fin(e[0]) && e[0] > n.evSeen) { n.evQ.push(e); n.evSeen = e[0]; }
          if (n.evQ.length > 200) n.evQ.splice(0, n.evQ.length - 200);
        });
        on('pe', (d, from) => { if (from && from.uid === n.hostUid) n.endMsg = d; });
        on('pi', (d, from) => { if (from && from.uid === n.hostUid) ctx.send('pa', {}); });
        ctx.send('pa', {});
      }
      try { ctx.onLeave((uid) => { if (current === S && !S.ended) NET.onLeave(S, uid); }); } catch (e) { N.err('pg.party.onLeave', e); }
    },
    unwire(S) {
      const n = S && S.net;
      if (n && n.offs) { for (const f of n.offs) { try { if (typeof f === 'function') f(); } catch (e) { /* ignore */ } } n.offs.length = 0; }
      // the friends' stand-ins (hidden kids that followed their ghosts) go
      if (S && S.parts) for (const P of S.parts) if (P.remote && P.e && P.e.pgKid) { try { N.entities.remove(P.e); } catch (e) { /* ignore */ } const i = S.kids.indexOf(P.e); if (i >= 0) S.kids.splice(i, 1); }
    },
    /** a friend from the room as a participant: a hidden stand-in that follows his online ghost */
    addRemote(S, q, team) {
      const F = S.F, g = NET.ghostOf(q.uid);
      const k = new Kid({ x: g ? g.x : F.cx, y: g ? g.y : F.cy, look: q.look || N.people.randomLook(U.rng('pgr:' + q.uid), 'kid'), name: q.nick, speaker: null, npc: null, angle: 0 });
      k.hidden = true;
      N.entities.add(k);
      const P = mkPart(S, { e: k, name: q.nick, nick: q.nick, uid: q.uid, remote: true, team, color: TEAM_COL[team] || '#ffffff', col: NET.colour(q.uid) });
      k.P = P;
      S.kids.push(k);
      return P;
    },
    human(S, q, team) {
      if (q.isMe) { const P = addPlayer(S, team); P.uid = q.uid; P.nick = q.nick; P.col = NET.colour(q.uid); return P; }
      return NET.addRemote(S, q, team);
    },
    /** the teams / the ring with friends (host and solo), or the host's list (guest) */
    setupParty(S, R) {
      const ctx = S.party, F = S.F, p = S.params;
      NET.wire(S);
      if (S.net && S.net.guest) { NET.buildFromInit(S, p.partyInit); return; }
      const humans = ctx.players.filter((q) => !q.isAI), ais = ctx.players.filter((q) => q.isAI && q.npc);
      const names = new Set(['Chinnu'].concat(humans.map((q) => q.nick)));
      const npcs = new Set();
      const add = (list, x) => { list.push(x); if (x.spec) { names.add(x.spec.name); if (x.spec.npc) npcs.add(x.spec.npc); } };
      const filler = (list, specs, n) => { for (const sp of specs) { if (list.length >= n) break; if ((sp.npc && npcs.has(sp.npc)) || names.has(sp.name)) continue; add(list, { spec: sp }); } while (list.length < n) add(list, { spec: genericSpec(S.rng, names, S.rng.next() < 0.3, F) }); };
      const pl = N.player;
      if (S.id === 'lingocha') {
        const n = clamp((p.team | 0) || TUNE.lingocha.team, 3, 5);
        const split = ctx.mode === 'party' && p.teams !== 'together' && humans.length > 1;
        const side = [[], []];
        humans.forEach((q, i) => side[split ? i % 2 : 0].push({ q }));
        for (const a of ais) if (side[0].length < n) add(side[0], { spec: friendSpec(a.npc), ai: a });
        filler(side[0], R.home, n);
        filler(side[1], R.away, n);
        const cap = (t) => { const h = side[t].find((x) => x.q); return h ? h.q.nick + ' XI' : null; };
        S.teamName = ctx.mode === 'party' ? [cap(0) || R.homeName, cap(1) || R.awayName] : [R.homeName, R.awayName];
        const hum = side.map((l) => l.filter((x) => x.q).length);
        side.forEach((list, t) => list.forEach((x, i) => {
          if (x.q) { NET.human(S, x.q, t); return; }
          const q = t === 0 ? { x: pl.x + Math.cos(i * 2.1) * 14, y: pl.y + Math.sin(i * 2.1) * 14 } : edgeSpot(F, F.cx + (i - 1.5) * 14, F.cy, -6);
          const P = addPart(S, x.spec, t, q.x, q.y);
          if (x.ai) P.aiUid = x.ai.uid;
          // the side with fewer friends on it plays a little above the game's difficulty (as the rival team does solo)
          if (hum[t] < hum[1 - t]) P.dBonus = TUNE.lingocha.rival;
        }));
      } else {
        const list = [];
        humans.forEach((q) => list.push({ q }));
        for (const a of ais) add(list, { spec: friendSpec(a.npc), ai: a });
        filler(list, R.list, Math.max(R.list.length + 1, list.length + 3));
        list.forEach((x, i) => {
          if (x.q) { NET.human(S, x.q, i + 1); return; }
          const q = edgeSpot(F, F.cx + (S.rng.next() - 0.5) * F.w, F.cy + (S.rng.next() - 0.5) * F.h, -5);
          const P = addPart(S, x.spec, i + 1, q.x, q.y);
          if (x.ai) P.aiUid = x.ai.uid;
        });
      }
      if (S.net && S.net.host) {
        S.net.initMsg = { g: S.id, f: S.F.key, tn: S.teamName || null, r: S.L ? S.L.rounds : 0,
          k: S.parts.map((P) => [String(nameOf(P)).slice(0, 16), P.team | 0, P.npc || '', P.uid || '', (P.dood ? 1 : 0) | (P.e && P.e.look && P.e.look.girl ? 2 : 0), P.e && P.e.look && P.e.look.girl ? String(P.e.look.shirt || '') : ''] ) };
        S.net.initT = 0;
      }
    },
    /** a guest builds the same participants from the host's list */
    buildFromInit(S, I) {
      const ctx = S.party, F = S.F, me = ctx.me && ctx.me.uid;
      const list = I && Array.isArray(I.k) ? I.k.slice(0, 12) : [];
      if (S.L) { S.teamName = Array.isArray(I.tn) ? [String(I.tn[0] || 'Home').slice(0, 24), String(I.tn[1] || 'Away').slice(0, 24)] : ['Home', 'Away']; const r = clamp(I.r | 0, 1, 5); S.L.rounds = r % 2 ? r : r + 1; S.L.need = Math.floor(S.L.rounds / 2) + 1; }
      for (const k of list) {
        if (!Array.isArray(k)) continue;
        const name = String(k[0] || 'Kid').slice(0, 16), team = clamp(k[1] | 0, 0, 20), npc = typeof k[2] === 'string' && /^[a-z][a-z0-9_]{0,23}$/.test(k[2]) ? k[2] : '', uid = typeof k[3] === 'string' ? k[3] : '', fl = k[4] | 0;
        if (uid && uid === me) { NET.human(S, Object.assign({}, ctx.me, { isMe: true }), team); continue; }
        if (uid) { const q = ctx.players.find((x) => x.uid === uid) || { uid, nick: name }; NET.addRemote(S, { uid, nick: q.nick || name, look: q.look }, team); continue; }
        let spec;
        if (npc) spec = friendSpec(npc, { dood: !!(fl & 1) });
        else {
          const look = N.people.randomLook(U.rng('pgk:' + name + ':' + F.key), 'kid');
          if (fl & 2) { look.girl = true; look.plaits = true; if (/^#[0-9a-f]{6}$/i.test(k[5] || '')) look.shirt = k[5]; look.cap = null; }
          spec = { npc: null, name, look, speaker: null, dood: !!(fl & 1) };
        }
        spec.name = name;
        const P = addPart(S, spec, team, F.cx, F.cy);
        P.net = true; P.e.hidden = true; // (shown once the first snapshot puts him where he is)
      }
      if (!S.me) { const P = NET.human(S, Object.assign({}, ctx.me || { uid: 'me', nick: 'You' }, { isMe: true }), 0); void P; }
      S.phase = 'setup';
    },

    /* ---------------------------------------------------------------- the host */
    hostStep(S, dt) {
      const n = S.net, ctx = S.party;
      if (!n || !ctx) return;
      // the roster till every friend has it
      if (n.initMsg && n.acks.size < n.need && S.t < 30) { n.initT -= dt; if (n.initT <= 0) { n.initT = TUNE.party.initEvery; ctx.send('pi', n.initMsg); } }
      n.sendT -= dt;
      if (n.sendT > 0) return;
      n.sendT = TUNE.party.snapEvery;
      const o = NET.snapOf(S);
      let size = JSON.stringify(o).length;
      const take = [];
      for (const e of n.ev) { if (e[0] <= n.evSent) continue; const l = JSON.stringify(e).length + 1; if (size + l > 1700 && take.length) break; take.push(e); size += l; }
      if (take.length) o.e = take;
      if (ctx.send('ps', o)) { n.sent++; if (take.length) n.evSent = take[take.length - 1][0]; while (n.ev.length && n.ev[0][0] <= n.evSent) n.ev.shift(); }
      else n.sendT = 0.03; // the bus was busy: very soon again
    },
    snapOf(S) {
      const b = S.ball, ix = (P) => (P ? S.parts.indexOf(P) : -1), r1 = (v) => Math.round((v || 0) * 10);
      const p = [];
      for (const P of S.parts) {
        const e = P.e;
        const f = (P.out ? 1 : 0) | (P.safeT > 0 ? 2 : 0) | (P.hold ? 4 : 0) | (e.down ? 8 : 0) | (e.idle === 'sit' ? 16 : 0) | (P.scatter || P.leaving ? 32 : 0) |
          (S.id === 'marampitti' && (P.isPlayer ? MARAM.catching(S, P) : S.t - (P.catchT == null ? -9 : P.catchT) < TUNE.catchWin) ? 64 : 0);
        p.push(r1(e.x), r1(e.y), Math.round(wrapA(e.angle || 0) * 100), Math.round(e.vx || 0), Math.round(e.vy || 0), f, P.act === 'pick' ? 1 : P.act === 'stack' ? 2 : 0, P.carry ? P.carry.i : -1);
      }
      const o = { t: +S.t.toFixed(2), ts: Math.round(NET.now(S)), ph: PH.indexOf(S.phase), p,
        b: [r1(b.x), r1(b.y), r1(b.z), Math.round(b.vx), Math.round(b.vy), Math.round(b.vz), Math.max(0, BALL_ST.indexOf(b.state)), ix(b.holder), b.seq | 0, b.live ? 1 : 0, b.bounced | 0, ix(b.thrower), ix(b.target), b.hiddenBall ? 1 : 0, b.kind === 'stack' ? 1 : 0, ix(b.lockP), Math.max(0, Math.round(((b.lockT || 0) - S.t) * 10)),
          // a live throw: how old it is (ms), where it left the hand and how far it stays live (the guest sweeps its flight)
          b.live && b.state === 'air' && !b.bounced ? Math.round((S.t - b.releaseT) * 1000) : -1, r1(b.rx), r1(b.ry), r1(b.liveDist || 0), +(+b.vx).toFixed(2), +(+b.vy).toFixed(2), +(+b.vz).toFixed(2)] };
      if (S.L) {
        const L = S.L;
        o.L = [L.round, L.rounds, L.wins[0], L.wins[1], L.tries, L.seek, ix(L.thrower), Math.round(L.timer * 10), L.knocked ? 1 : 0, L.need];
        o.st = [];
        for (const st of L.stones) o.st.push(r1(st.x), r1(st.y), r1(st.z), Math.max(0, STONE_ST.indexOf(st.state)), ix(st.by));
        o.sk = L.stack.map((st) => st.i).join('');
      }
      if (S.M) o.M = [Math.round(S.M.timeLeft * 10), S.M.tosses];
      const tl = S.tele;
      if (tl && tl.from && tl.to && tl.from.windT > 0) o.tl = [ix(tl.from), ix(tl.to), Math.round(tl.from.windT * 1000), Math.round((tl.from.windT0 || 1) * 1000), tl.from.aimLock ? 1 : 0];
      return o;
    },
    /** what a friend did on his page (a command from his own controls) */
    hostCmd(S, d, from) {
      if (S.ended || typeof d.k !== 'string') return;
      const P = S.parts.find((q) => q.remote && q.uid === (from && from.uid));
      if (!P) return;
      const b = S.ball, L = S.L;
      switch (d.k) {
        case 'pk': {
          if (!L || S.phase !== 'live' || P.out || P.carry || P.team !== L.seek) return;
          const st = L.stones[d.i | 0];
          if (!st || st.state !== 'loose' || hyp(st.x - P.e.x, st.y - P.e.y) > 14) return;
          if (st.claim && st.claim !== P) st.claim.stone = null;
          LING.pickStone(S, P, st);
          return;
        }
        case 'sk':
          if (!L || S.phase !== 'live' || P.out || !P.carry || L.stack.length >= 7 || hyp(L.base.x - P.e.x, L.base.y - P.e.y) > 16) return;
          LING.stackStone(S, P);
          return;
        case 'gb': {
          const okPhase = S.id === 'marampitti' ? (S.phase === 'play' || S.phase === 'toss') : (L && S.phase === 'live' && P.team !== L.seek);
          if (!okPhase || P.out || b.holder || !canGrabP(S, b, P) || hyp(b.x - P.e.x, b.y - P.e.y) > TUNE.myReach + 8) return;
          give(S, P); log(S, 'grab', { name: P.name, remote: true, bounced: b.bounced });
          return;
        }
        case 'th': {
          if (b.holder !== P || P.out || !fin(+d.a) || !fin(+d.s) || !fin(+d.z)) return;
          const T = (d.t | 0) >= 0 ? S.parts[d.t | 0] || null : null;
          release(S, P, +d.a, clamp(+d.s, 40, 260), clamp(+d.z, -30, 140), { target: T && T !== P ? T : null });
          return;
        }
        case 'lt':
          if (!L || S.phase !== 'aim' || L.thrower !== P || !fin(+d.a) || !fin(+d.p)) return;
          log(S, 'player_throw', { ang: +(+d.a).toFixed(3), p: +clamp(+d.p, 0, 1).toFixed(2), remote: P.name });
          LING.stackThrow(S, P, +d.a, clamp(+d.p, 0, 1));
          return;
        case 'ct': P.catchT = S.t; return;
        case 'hm': NET.remoteHit(S, P, d); return;
        case 'lv': NET.replaceWithAI(S, P, 'left the game'); return;
        default:
      }
    },
    /** a guest says the live ball hit him on his page (a catch: c) */
    remoteHit(S, P, d) {
      const b = S.ball;
      const why = P.out ? 'out' : (d.q | 0) !== b.liveSeq || b.seq !== b.liveSeq ? 'stale' : !b.thrower || b.thrower === P ? 'own' : b.state === 'held' ? 'held' : b.hitSet && b.hitSet.size ? 'hit_other' : !b.live && !(S.t - (b.liveAt || -9) < TUNE.party.hitLate) ? 'late' : null;
      if (why) { log(S, 'remote_hit_rejected', { name: P.name, why }); return; }
      S.net.hits++;
      b.x = clamp(num(d.x, P.e.x * 10) / 10, P.e.x - 12, P.e.x + 12); b.y = clamp(num(d.y, P.e.y * 10) / 10, P.e.y - 12, P.e.y + 12); b.z = clamp(num(d.z, 2.5), 0.2, 9);
      if (b.state !== 'air') b.state = 'air';
      if (!b.hitSet) b.hitSet = new Set();
      b.hitSet.add(P);
      P.netCatch = !!d.c;
      const was = b.live;
      b.live = true;
      let handled = false;
      try { handled = S.G.onHit(S, P, b); } catch (e) { N.err('pg.party.hit', e); }
      P.netCatch = false;
      if (!handled) b.live = was;
      log(S, 'remote_hit', { name: P.name, caught: !!d.c, handled: !!handled });
    },
    /** a friend left the room / the game: a colony kid takes his place */
    replaceWithAI(S, P, why) {
      if (!P || !P.remote) return;
      const old = nameOf(P), names = new Set(S.parts.map((q) => q.name));
      const sp = genericSpec(S.rng, names, false, S.F);
      P.remote = false; P.gone = true; P.uid = null; P.nick = null; P.name = sp.name; P.speaker = null; P.col = null;
      const e = P.e; e.look = sp.look; e.name = sp.name; e.hidden = false; e.down = false;
      if (P.hold) drop(S, P);
      const i = S.parts.indexOf(P);
      NET.ev(S, ['r', i, sp.name]);
      NET.ev(S, ['t', '*', old + ' ' + why + ' — ' + sp.name + ' plays instead', 2600]);
      toast(old + ' ' + why + ' — ' + sp.name + ' plays instead', 2600);
      log(S, 'replaced', { old, by: sp.name });
    },
    onLeave(S, uid) {
      const n = S.net;
      if (!n) return;
      if (n.host) { const P = S.parts.find((q) => q.remote && q.uid === uid); if (P) NET.replaceWithAI(S, P, 'left'); }
      else if (uid === n.hostUid) n.hostGone = true;
    },
    won(S, P) {
      if (!P) return false;
      if (S.L) return S.L.wins[P.team] > S.L.wins[1 - P.team];
      const r = S.endExtra && S.endExtra.reason;
      return !P.out && (r === 'last' || r === 'time');
    },
    rankOf(S, P) { if (!P) return 0; if (S.L) return NET.won(S, P) ? 1 : 2; return P.out ? P.outRank || S.parts.length : 1; },
    /** the host ends the game for everybody: each friend's result goes with it */
    finish(S, extra) {
      const n = S.net;
      if (!n || S.ended) return;
      extra = extra || {};
      const res = [];
      for (const P of S.parts) if (human(P)) res.push([S.parts.indexOf(P), NET.won(S, P) ? 1 : 0, NET.rankOf(S, P), P.hits | 0, P.catches | 0, P.fouls | 0, P.stacked | 0, P.outs | 0]);
      const msg = { x: String(extra.reason || 'done').slice(0, 16), w: S.L ? S.L.wins.slice() : null, r: res, k: S.parts.length };
      n.finished = true;
      const ctx = S.party, send = () => { try { ctx.send('pe', msg); } catch (e) { /* ignore */ } };
      send(); setTimeout(send, 450); setTimeout(send, 1400);
      const me = S.me, mine = me ? res.find((x) => x[0] === S.parts.indexOf(me)) : null;
      endSession(S, !!(mine && mine[1]) && !extra.quit, Object.assign({}, extra, { rank: mine ? mine[2] : 0 }));
    },
    /** a guest: the host's game is over */
    guestEnd(S, d) {
      const me = S.me, i = S.parts.indexOf(me);
      const mine = Array.isArray(d.r) ? d.r.find((x) => Array.isArray(x) && (x[0] | 0) === i) : null;
      if (S.L && Array.isArray(d.w)) S.L.wins = [d.w[0] | 0, d.w[1] | 0];
      const reason = typeof d.x === 'string' ? d.x.slice(0, 16) : 'done';
      if (mine) {
        me.hits = mine[3] | 0; me.catches = mine[4] | 0; me.fouls = mine[5] | 0; me.stacked = mine[6] | 0;
        Object.assign(S.stats, { hits: mine[3] | 0, catches: mine[4] | 0, fouls: mine[5] | 0, stacked: mine[6] | 0, outs: mine[7] | 0 });
      }
      if (reason === 'host_left' || reason === 'aborted') { toast('The game is over — the host stopped playing.', 2600); endSession(S, false, { aborted: true, reason: 'host_left' }); return; }
      endSession(S, !!(mine && mine[1]), { reason, rank: mine ? mine[2] | 0 : 0, kids: d.k | 0 || S.parts.length });
    },
    /** endSession with friends / through N.party: report to the party card (host: tell the friends' pages too) */
    ended(S, r) {
      const n = S.net, ctx = S.party;
      if (n && n.host && !n.finished) {
        // (stopped for another reason: a mission, a reset ... the friends' games are over too)
        n.finished = true;
        const m = { x: 'aborted', w: null, r: [] };
        try { ctx.send('pe', m); setTimeout(() => { try { ctx.send('pe', m); } catch (e) { /* ignore */ } }, 450); } catch (e) { /* ignore */ }
      }
      if (n && n.guest && (r.quit || (r.aborted && r.reason !== 'host_left'))) { try { ctx.send('pc', { k: 'lv' }); } catch (e) { /* ignore */ } }
      if (S.reported || !ctx || typeof ctx.report !== 'function') return;
      S.reported = true;
      const dnf = r.aborted || r.quit;
      if (dnf) ctx.report({ dnf: true, note: r.reason === 'host_left' ? 'the host left' : 'left the game' });
      else if (S.id === 'lingocha') ctx.report({ score: r.score, won: r.win ? 1 : 0, team: S.me ? S.me.team : 0, note: (r.win ? 'won ' : 'lost ') + r.roundsWon + '–' + r.roundsLost });
      else ctx.report({ score: r.score, place: r.rank || 1, note: (r.rank || 1) === 1 ? (r.reason === 'last' ? 'last one standing' : r.reason === 'time' ? 'still standing' : 'top of the ring') : 'out ' + ordinal(r.rank) + ' of ' + (r.kids || S.parts.length) });
      // the AI friends (solo): this page played them, this page reports them
      if (ctx.mode === 'solo' && ctx.ai && typeof ctx.ai.report === 'function') {
        for (const P of S.parts) {
          if (!P.aiUid) continue;
          try {
            if (dnf) ctx.ai.report(P.aiUid, { dnf: true, note: 'game stopped' });
            else if (S.L) { const w = S.L.wins[P.team] > S.L.wins[1 - P.team]; ctx.ai.report(P.aiUid, { score: S.L.wins[P.team] * 100 + (P.stacked | 0) * 10 + (P.hits | 0) * 15, won: w ? 1 : 0, team: P.team, note: (w ? 'won ' : 'lost ') + S.L.wins[P.team] + '–' + S.L.wins[1 - P.team] }); }
            else { const pl = P.out ? P.outRank || S.parts.length : 1; ctx.ai.report(P.aiUid, { score: (pl === 1 ? 100 : 0) + (P.hits | 0) * 25 + (P.catches | 0) * 40, place: pl, note: pl === 1 ? 'still standing' : 'out ' + ordinal(pl) }); }
          } catch (e) { N.err('pg.party.aiReport', e); }
        }
      }
    },

    /* ---------------------------------------------------------------- a guest */
    cmd(S, c) {
      const n = S.net, ctx = S.party, me = S.me, b = S.ball, L = S.L;
      if (!n || !ctx || !me) return;
      c.cn = ++n.cq;
      try { ctx.send('pc', c); } catch (e) { N.err('pg.party.cmd', e); }
      const hold = TUNE.party.hold;
      // ... and shown here at once
      switch (c.k) {
        case 'pk': { const st = L && L.stones[c.i]; if (st && st.state === 'loose') { st.state = 'carried'; st.by = me; st.claim = me; me.carry = st; me.stone = null; n.predCarry = S.t + hold; } break; }
        case 'sk': { const st = me.carry; if (st && L && L.stack.length < 7) { me.carry = null; st.state = 'stack'; st.by = null; st.x = L.base.x; st.y = L.base.y; st.z = L.stack.length * TUNE.stoneH; L.stack.push(st); n.predCarry = S.t + hold; n.predStack = S.t + hold; sfx('marble', { ui: true, vol: 0.6, pitch: 0.9 + L.stack.length * 0.05 }); } break; }
        case 'gb': give(S, me); me.holdT = 0; n.pred = { k: 'gb', until: S.t + hold, seq: b.seq }; break;
        case 'th': NET.predictThrow(S, me, c.a, c.s, c.z, c.t >= 0 ? S.parts[c.t] : null, false); break;
        case 'lt': { const sp = TUNE.aim.min + TUNE.aim.span * c.p, vz = sp * TUNE.aim.elev + (c.p > 0.86 ? (c.p - 0.86) * 80 : 0); NET.predictThrow(S, me, c.a, sp, vz, null, true); S.phase = 'flight'; break; }
        default:
      }
    },
    predictThrow(S, P, ang, sp, vz, T, stack) {
      const b = S.ball, e = P.e;
      for (const Q of S.parts) Q.hold = false;
      Object.assign(b, { state: 'air', holder: null, thrower: P, live: !stack, pass: false, passTo: null, bounced: 0, target: T || null, kind: stack ? 'stack' : 'throw', z: TUNE.hand, vz });
      b.x = e.x + Math.cos(ang) * 2.4; b.y = e.y + Math.sin(ang) * 2.4; b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
      b.hitMe = b.seq + 1;
      S.net.pred = { k: 'th', until: S.t + TUNE.party.hold, seq: b.seq };
      e.angle = e.facing = ang; P.hold = false; P.holdT = 0;
      sfx('chappal_whoosh', { x: e.x, y: e.y, vol: 0.7, pitch: 1.3 });
    },
    /** a guest's frame: show the host's game; Chinnu plays with his own controls (ctlUpdate) */
    mirrorStep(S, dt) {
      const n = S.net, ctx = S.party;
      S.phaseT += dt;
      if (n.snap && n.snap !== n.applied) { NET.applySnap(S, n.snap); n.applied = n.snap; }
      if (n.evQ.length) { const q = n.evQ; n.evQ = []; for (const e of q) { try { NET.applyEv(S, e); } catch (er) { N.err('pg.party.ev', er); } } }
      if (S.ended) return;
      if (n.endMsg) { NET.guestEnd(S, n.endMsg); return; }
      let hostHere = !n.hostGone;
      try { if (ctx.isHost || (ctx.left && ctx.left(n.hostUid))) hostHere = false; } catch (e) { /* ignore */ }
      if (!hostHere) { toast('The game is over — the host left.', 2600); endSession(S, false, { aborted: true, reason: 'host_left' }); return; }
      for (const P of S.parts) if (!P.isPlayer) NET.follow(S, P, dt);
      if (S.me && N.player) smoothVel(S.me, N.player.vx || 0, N.player.vy || 0, dt);
      // where Chinnu was, on the party clock (a throw is judged against where he was when it got there)
      if (N.player) { const h = n.hist || (n.hist = []), tn = NET.now(S); h.push({ ts: tn, x: N.player.x, y: N.player.y }); while (h.length > 2 && tn - h[0].ts > 1600) h.shift(); }
      NET.mirrorBall(S, dt);
      NET.sweep(S);
      if (S.L) {
        const k = 1 - Math.exp(-dt * 16);
        for (const st of S.L.stones) {
          if (st.state === 'carried' && st.by && st.by.e) { const q = holdPos(st.by); st.x = q.x; st.y = q.y; st.z = 3.2; continue; }
          if (st.state === 'stack' || !st.nt) continue;
          st.x += (st.nt.x - st.x) * k; st.y += (st.nt.y - st.y) * k; st.z += (st.nt.z - st.z) * k;
          if (st.state === 'fly') st.rot += dt * 6;
        }
      }
      const tl = S.tele;
      if (tl && tl.from) { tl.from.windT -= dt; if (tl.from.windT <= 0) S.tele = null; }
      for (const P of S.parts) if (P.safeT > 0) P.safeT -= dt;
      for (const pp of S.pops) pp.t += dt;
      for (let i = S.pops.length - 1; i >= 0; i--) if (S.pops[i].t > S.pops[i].life) { const o = S.pops.splice(i, 1)[0]; if (o.el) o.el.remove(); }
      S.specT = (S.specT || 0) - dt;
      if (S.specT <= 0) { S.specT = 1; spectators(S, true); }
      NET.guestChecks(S, dt);
      if (!S.ended) hudUpdate(S);
    },
    guestChecks(S, dt) {
      const p = N.player, F = S.F;
      try {
        if (N.clock && N.clock.holds && N.clock.holds.has('playground-game') && !N.clock.frozen) {
          N.clock.minutes += dt * TUNE.clockRate;
          while (N.clock.minutes >= 1440) { N.clock.minutes -= 1440; N.clock.nextDay(); }
        }
      } catch (e) { /* ignore */ }
      if (!p) return;
      if (p.vehicle) { endSession(S, false, { quit: true, reason: 'vehicle' }); return; }
      if (N.wanted && N.wanted.level >= 3) { banner('BHAAGO!', 'The Chappal Meter is up — out of the game, run!', 2400, 'fail'); endSession(S, false, { quit: true, reason: 'chappal' }); return; }
      try { if (p.running && !p.god && p.TUNE && p.TUNE.runDrain) p.energy = Math.min(p.tummy != null ? p.tummy : 100, p.energy + dt * p.TUNE.runDrain * TUNE.runRefund); } catch (e) { /* ignore */ }
      // walked off the ground: back you come (the game with friends is not over)
      const bl = S.ball, d = rectDist(F, p.x, p.y);
      const fetching = (S.me && S.me.hold) || (!bl.holder && hyp(bl.x - p.x, bl.y - p.y) < 30 && rectDist(F, bl.x, bl.y) > 2);
      if (d > TUNE.leaveR && !fetching) {
        S.awayT = (S.awayT || 0) + dt;
        if (S.awayT > 0.2 && !S.awayWarned) { S.awayWarned = true; toast('*Arre*, where are you going? Your friends are playing!', 2400); }
        if (S.awayT > TUNE.leaveT) { const q = edgeSpot(F, p.x, p.y, -6); p.x = q.x; p.y = q.y; p.vx = p.vy = 0; S.awayT = 0; S.awayWarned = false; toast('Game’s not over, ra!', 1800); }
      } else { S.awayT = 0; S.awayWarned = false; }
      // maram pitti: the boundary warning (the host's game calls it out)
      if (S.id === 'marampitti' && S.me && !S.me.out && S.phase === 'play') {
        const off = rectDist(F, p.x, p.y), fetch2 = !bl.holder && rectDist(F, bl.x, bl.y) > 2 && hyp(bl.x - p.x, bl.y - p.y) < 30;
        if (off > TUNE.maram.bound && !fetch2 && !S.me.hold) { S.boundT = (S.boundT || 0) + dt; if (!S.boundWarn) { S.boundWarn = true; toast('*Andar aa!* Back inside the ground — or you are OUT', 2200); } }
        else { S.boundT = 0; S.boundWarn = false; }
      } else S.boundT = 0;
    },
    /** follow: a friend's ghost (his own page moves him), or a kid in the host's snapshots carried on to now */
    follow(S, P, dt) {
      const e = P.e;
      let tx = null, ty = 0, ta = null, vx0 = 0, vy0 = 0, jump = false;
      if (P.remote) { const g = NET.ghostOf(P.uid); if (g) { tx = g.x; ty = g.y; ta = g.angle; } }
      if (tx == null && P.nt) {
        const age = clamp((NET.now(S) - P.nt.ts) / 1000, 0, 0.35);
        tx = P.nt.x + P.nt.vx * age; ty = P.nt.y + P.nt.vy * age; ta = P.nt.a; vx0 = P.nt.vx; vy0 = P.nt.vy; jump = !!P.nt.jump; P.nt.jump = false;
      }
      if (tx == null) { e.vx = e.vy = 0; e.anim.speed = 0; return; }
      const ox = e.x, oy = e.y;
      if (jump || P.remote || hyp(tx - e.x, ty - e.y) > 40) { e.x = tx; e.y = ty; }
      else { const k = 1 - Math.exp(-dt * 14); e.x += (tx - e.x) * k; e.y += (ty - e.y) * k; }
      if (P.remote) { e.vx = dt > 0 ? (e.x - ox) / dt : 0; e.vy = dt > 0 ? (e.y - oy) / dt : 0; if (hyp(e.vx, e.vy) > 200) e.vx = e.vy = 0; }
      else { e.vx = vx0; e.vy = vy0; }
      if (ta != null) { if (P.remote) e.angle = ta; else e.angle += adiff(e.angle, ta) * Math.min(1, dt * 12); e.facing = e.angle; }
      smoothVel(P, e.vx, e.vy, dt);
      const sp = hyp(e.vx, e.vy);
      if (e.down) { e.anim.speed = 0; return; }
      if (sp > 3) { e.anim.speed = Math.min(1, sp / 45); e.anim.run = sp > 58; e.anim.phase += sp * dt * (e.anim.run ? 0.2 : 0.26); }
      else { e.anim.speed = 0; e.anim.run = false; e.anim.phase *= 0.85; }
      if (e.emoteSt) { e.emoteSt.t += dt; if (e.emoteSt.t > e.emoteSt.secs) e.emoteSt = null; }
    },
    applySnap(S, d) {
      const n = S.net, me = S.me, parts = S.parts, L = S.L;
      const ts = num(d.ts, NET.now(S));
      const ph = PH[d.ph | 0];
      const was = S.phase;
      if (ph && ph !== S.phase && !(S.phase === 'flight' && ph === 'aim' && n.pred && n.pred.k === 'th' && S.t < n.pred.until)) { S.phase = ph; S.phaseT = 0; }
      const p = Array.isArray(d.p) ? d.p : [];
      for (let i = 0; i < parts.length && i * 8 + 7 < p.length; i++) {
        const P = parts[i], j = i * 8, f = p[j + 5] | 0;
        const held = P.hold;
        P.out = !!(f & 1);
        P.safeT = f & 2 ? 0.3 : 0;
        P.hold = !!(f & 4);
        if (P === me && P.hold && !held) me.holdT = 0;
        if (!P.isPlayer) {
          P.e.down = !!(f & 8); P.e.idle = f & 16 ? 'sit' : null; P.scatter = !!(f & 32);
          P.act = p[j + 6] === 1 ? 'pick' : p[j + 6] === 2 ? 'stack' : null;
          P.catchT = f & 64 ? S.t : P.catchT;
          const nt = { x: num(p[j], 0) / 10, y: num(p[j + 1], 0) / 10, a: num(p[j + 2], 0) / 100, vx: clamp(num(p[j + 3], 0), -200, 200), vy: clamp(num(p[j + 4], 0), -200, 200), ts, jump: !P.nt };
          P.nt = nt;
          if (P.net && P.e.hidden) { P.e.hidden = false; P.e.x = nt.x; P.e.y = nt.y; P.e.angle = nt.a; }
        }
        if (L && (P !== me || !(n.predCarry > S.t))) { const c = p[j + 7] | 0; P.carry = c >= 0 && c < 7 ? L.stones[c] : null; }
        if (P === me && P.out) { me.act = null; }
      }
      // the ball (unless Chinnu has just thrown / grabbed it here and the host has not caught up yet)
      const B = Array.isArray(d.b) ? d.b : null;
      if (B && B.length >= 15) {
        const b = S.ball, seq = B[8] | 0, hi = B[7] | 0, holder = hi >= 0 ? parts[hi] || null : null;
        const pr = n.pred;
        const pending = pr && S.t < pr.until && !(pr.k === 'gb' ? holder === me : seq > pr.seq);
        if (pr && !pending) n.pred = null;
        if (!pending) {
          b.x = num(B[0], 0) / 10; b.y = num(B[1], 0) / 10; b.z = num(B[2], 0) / 10; b.vx = num(B[3], 0); b.vy = num(B[4], 0); b.vz = num(B[5], 0);
          b.state = BALL_ST[B[6] | 0] || 'rest'; b.holder = holder; b.live = !!B[9]; b.bounced = B[10] | 0;
          b.thrower = (B[11] | 0) >= 0 ? parts[B[11] | 0] || null : null; b.target = (B[12] | 0) >= 0 ? parts[B[12] | 0] || null : null;
          b.hiddenBall = !!B[13]; b.kind = B[14] ? 'stack' : 'throw';
          b.lockP = (B[15] | 0) >= 0 ? parts[B[15] | 0] || null : null; b.lockT = S.t + (B[16] | 0) / 10;
          // a live throw in flight: its whole path since it left the hand (Chinnu's own page judges it against where he was)
          if (B.length >= 24 && (B[17] | 0) >= 0 && b.live && b.state === 'air') {
            const age = clamp(num(B[17], 0), 0, 3000), vx = num(B[21], b.vx), vy = num(B[22], b.vy), vz = num(B[23], b.vz);
            if (!b.trk || b.trk.seq !== seq) b.trk = { seq, checked: 0 };
            Object.assign(b.trk, { t0: ts - age, rx: num(B[18], 0) / 10, ry: num(B[19], 0) / 10, ld: num(B[20], 700) / 10, vx, vy, vz0: vz + TUNE.g * (age / 1000), z0: TUNE.hand, thrower: b.thrower });
          }
          if (b.state === 'held' && !holder) b.state = 'rest';
          if (seq !== b.seq) { b.seq = seq; }
          for (const Q of parts) if (Q !== holder && Q.hold && b.state === 'held') Q.hold = false;
          if (holder) holder.hold = true;
          // in flight a network trip ago: carry it on to now
          if (b.state === 'air' || b.state === 'roll') NET.ballFwd(S, b, clamp((NET.now(S) - ts) / 1000, 0, 0.3), false);
        }
      }
      if (L && Array.isArray(d.L) && d.L.length >= 10) {
        const q = d.L;
        L.round = q[0] | 0; L.rounds = clamp(q[1] | 0, 1, 5); L.wins = [q[2] | 0, q[3] | 0]; L.tries = q[4] | 0; L.seek = q[5] ? 1 : 0;
        L.thrower = (q[6] | 0) >= 0 ? parts[q[6] | 0] || null : null; L.timer = num(q[7], 0) / 10; L.knocked = !!q[8]; L.need = q[9] | 0 || L.need;
        if (Array.isArray(d.st)) {
          for (let i = 0; i < L.stones.length && i * 5 + 4 < d.st.length; i++) {
            const st = L.stones[i], j = i * 5;
            if (n.predCarry > S.t && (st.by === me || me.carry === st)) continue;
            st.state = STONE_ST[d.st[j + 3] | 0] || 'loose';
            const bi = d.st[j + 4] | 0; st.by = bi >= 0 ? parts[bi] || null : null;
            const nt = { x: num(d.st[j], 0) / 10, y: num(d.st[j + 1], 0) / 10, z: num(d.st[j + 2], 0) / 10 };
            if (!st.nt || st.state === 'stack' || hyp(nt.x - st.x, nt.y - st.y) > 30) { st.x = nt.x; st.y = nt.y; st.z = nt.z; }
            st.nt = nt;
          }
        }
        if (typeof d.sk === 'string' && /^[0-6]{0,7}$/.test(d.sk) && !(n.predStack > S.t)) L.stack = d.sk.split('').map((c) => L.stones[+c]);
        if (S.phase === 'aim' && was !== 'aim' && L.thrower === me) { LING.aimStart(S); S.aim.charging = false; S.aim.p = 0; S.aim.yaw = null; }
      }
      if (S.M && Array.isArray(d.M)) { S.M.timeLeft = num(d.M[0], 0) / 10; S.M.tosses = d.M[1] | 0; }
      if (Array.isArray(d.tl) && d.tl.length >= 5) {
        const a = parts[d.tl[0] | 0], t = parts[d.tl[1] | 0];
        if (a && t) { a.windT = num(d.tl[2], 0) / 1000; a.windT0 = Math.max(0.05, num(d.tl[3], 1000) / 1000); a.aimLock = d.tl[4] ? {} : null; S.tele = { from: a, to: t }; }
      } else if (S.tele) { if (S.tele.from) S.tele.from.windT = 0; S.tele = null; }
      n.first = false;
    },
    applyEv(S, e) {
      const me = S.me, mine = (u) => u === '*' || (me && u === me.uid), p = N.player;
      switch (e[1]) {
        case 'p': pop(S, num(e[2], 0) / 10, num(e[3], 0) / 10, num(e[4], 90) / 10, String(e[5] || '').slice(0, 24), /^#[0-9a-f]{3,8}$/i.test(e[6] || '') ? e[6] : null, !!e[7]); break;
        case 'b': { const P = S.parts[e[2] | 0]; if (P && !P.isPlayer && !P.remote) bark(S, P, String(e[3] || '').slice(0, 80), { force: true, secs: clamp(num(e[4], 1.6), 0.5, 4) }); break; }
        case 's': if (/^[a-z][a-z0-9_]{0,23}$/.test(e[2] || '')) sfx(e[2], { x: num(e[3], 0) / 10, y: num(e[4], 0) / 10, vol: clamp(num(e[5], 1), 0, 1.5), pitch: clamp(num(e[6], 1), 0.3, 3), delay: clamp(num(e[7], 0), 0, 1), echo: true }); break;
        case 'n': if (mine(e[2])) banner(String(e[3] || '').slice(0, 40), String(e[4] || '').slice(0, 120), clamp(num(e[5], 2200), 500, 5000), /^[a-z]{2,8}$/.test(e[6] || '') ? e[6] : 'info'); break;
        case 't': if (mine(e[2])) toast(String(e[3] || '').slice(0, 140), clamp(num(e[4], 2400), 500, 5000)); break;
        case 'u': if (mine(e[2]) && /^[a-z][a-z0-9_]{0,23}$/.test(e[3] || '')) sfx(e[3], { ui: true, vol: clamp(num(e[4], 1), 0, 1.5), delay: clamp(num(e[5], 0), 0, 1) }); break;
        case 'a':
          if (mine(e[2]) && p) {
            if (e[3] == null) { if (S.auto && !S.auto.out) S.auto = null; break; }
            const q = { x: num(e[3], p.x * 10) / 10, y: num(e[4], p.y * 10) / 10 }, face = num(e[5], 0) / 100;
            if (hyp(q.x - p.x, q.y - p.y) > 4 || e[6]) S.auto = { x: q.x, y: q.y, t: 0, face, out: !!e[6] }; else { p.angle = p.facing = face; S.auto = null; }
          }
          break;
        case 'k': if (mine(e[2]) && p) { const vx = num(e[3], 0), vy = num(e[4], 0), s = hyp(vx, vy) || 1; p.vx += (vx / s) * 40; p.vy += (vy / s) * 40; try { if (N.render && N.render.shake && !document.body.classList.contains('reduced-motion')) N.render.shake(0.18, 0.15); } catch (er) { /* ignore */ } } break;
        case 'r': {
          const P = S.parts[e[2] | 0];
          if (!P || P.isPlayer) break;
          const name = String(e[3] || 'Kid').slice(0, 16);
          P.remote = false; P.net = true; P.uid = null; P.nick = null; P.name = name; P.col = null;
          P.e.look = N.people.randomLook(U.rng('pgk:' + name + ':' + S.F.key), 'kid'); P.e.name = name; P.e.hidden = false;
          break;
        }
        default:
      }
    },
    /** the ball between snapshots: carried on (gravity, bounce, roll); a live one reaching Chinnu is judged here */
    mirrorBall(S, dt) {
      const b = S.ball;
      if (b.state === 'held') {
        const h = b.holder;
        if (h && h.e) { const q = holdPos(h); b.x = q.x; b.y = q.y; b.z = q.z; }
        return;
      }
      if (b.state === 'air' || b.state === 'roll') NET.ballFwd(S, b, dt, true);
    },
    ballFwd(S, b, t, judge) {
      const F = S.F;
      let left = t;
      while (left > 1e-4) {
        const h = Math.min(left, 1 / 90); left -= h;
        if (b.state === 'air') {
          b.vz -= TUNE.g * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
          if (b.z <= 0) {
            b.z = 0; b.live = false;
            if (b.vz < -18) { b.vz = -b.vz * TUNE.bounce; b.vx *= TUNE.bounceFric; b.vy *= TUNE.bounceFric; } else { b.vz = 0; b.state = 'roll'; }
            b.bounced++;
          }
        } else if (b.state === 'roll') {
          const s = hyp(b.vx, b.vy), rough = inRect(F, b.x, b.y, TUNE.outerM) ? 1 : TUNE.roughMul, dec = (TUNE.rollFric * rough + TUNE.rollDrag * s) * h;
          if (s <= dec || s < 2.5) { b.vx = b.vy = 0; b.state = 'rest'; } else { const k = (s - dec) / s; b.vx *= k; b.vy *= k; b.x += b.vx * h; b.y += b.vy * h; }
        } else break;
      }
      void judge;
    },
    /** a guest's own Chinnu and a live throw: its path since it left the hand against where he was at each moment
     *  (lag-compensated: a late snapshot still finds the hit; a last-moment dodge on his page still beats it) */
    sweep(S) {
      const b = S.ball, me = S.me, n = S.net, k = b.trk;
      if (!k || !me || me.out || k.seq !== b.seq || b.hitMe === b.seq || b.kind === 'stack' || !k.thrower || k.thrower === me || !n.hist || n.hist.length < 2) return;
      if (S.id === 'lingocha' ? !(S.phase === 'live' && me.team === S.L.seek && k.thrower.team !== me.team) : S.phase !== 'play') return;
      const tn = NET.now(S), R = TUNE.hitR * TUNE.party.hitR, sp = hyp(k.vx, k.vy);
      let tc = Math.max(k.checked || k.t0, k.t0, tn - 1500);
      for (; tc <= tn; tc += 8) {
        const tau = (tc - k.t0) / 1000;
        const bz = k.z0 + k.vz0 * tau - 0.5 * TUNE.g * tau * tau;
        if (bz < 0 || sp * tau > k.ld + 1) { k.checked = tn + 1e6; return; } // landed / past its live range: a dead ball
        const bx = k.rx + k.vx * tau, by = k.ry + k.vy * tau, q = NET.histAt(n.hist, tc);
        const dx = q.x - bx, dy = q.y - by;
        if (dx * dx + dy * dy > R * R || bz < 0.15 || bz - TUNE.ballR > TUNE.bodyTop) continue;
        b.hitMe = b.seq; k.checked = tn + 1e6;
        // hands up just in time (as of that moment; a little extra for the network)
        const atT = S.t - (tn - tc) / 1000;
        const caught = S.id === 'marampitti' && atT - me.catchT >= -0.05 && atT - me.catchT < TUNE.catchWin * (S.assist || isTouch() ? 1.4 : 1) + TUNE.party.catchExtra;
        n.hits++;
        NET.cmd(S, { k: 'hm', q: b.seq, x: Math.round(bx * 10), y: Math.round(by * 10), z: +bz.toFixed(2), c: caught ? 1 : 0 });
        if (b.state === 'air') b.live = false;
        log(S, 'hit_report', { caught, seq: b.seq, late: Math.round(tn - tc), atT: +atT.toFixed(2), catchT: +(+me.catchT).toFixed(2) });
        return;
      }
      k.checked = tn;
    },
    histAt(h, t) {
      if (t <= h[0].ts) return h[0];
      for (let i = h.length - 1; i > 0; i--) { const a = h[i - 1], c = h[i]; if (t >= a.ts) { const f = c.ts > a.ts ? clamp((t - a.ts) / (c.ts - a.ts), 0, 1) : 1; return { x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f }; } }
      return h[h.length - 1];
    },
  };

  /* ---------------------------------------------------------------- the party activities (src/party.js contract) */
  /** where everybody meets: by the chalk line (lingocha) / round the middle (maram pitti), one spot per player */
  function meetSpot(F, gid, slot) {
    if (gid === 'lingocha') { const ln = F.line, vx = -ln.dy, vy = ln.dx, off = (slot % 2 ? 1 : -1) * (8 + 8 * Math.floor(slot / 2)); const q = spotNear(ln.x - ln.dx * 6 + vx * off, ln.y - ln.dy * 6 + vy * off, 3, 14, F); return { x: q.x, y: q.y, a: Math.atan2(F.stack.y - q.y, F.stack.x - q.x) }; }
    const c = F.centre, a = slot * 2.1 + 0.5, q = spotNear(c.x + Math.cos(a) * 20, c.y + Math.sin(a) * 20, 3, 14, F);
    return { x: q.x, y: q.y, a: Math.atan2(c.y - q.y, c.x - q.x) };
  }
  function partyStart(gid, ctx) {
    if (!fieldList.length) buildFields();
    const o = (ctx && ctx.opts) || {};
    const F = FIELDS.get(o.place) || pickField(null);
    const H = { gid, ctx, F, S: null, init: null, done: false, offs: [], waitT: 0 };
    if (!F) { setTimeout(() => { try { ctx.report({ dnf: true, note: 'no ground here' }); } catch (e) { /* ignore */ } }, 0); return { end() {} }; }
    // everybody meets at the ground (a friend from across the city is brought there for the 3-2-1)
    try { const p = N.player; if (p && (p.vehicle || rectDist(F, p.x, p.y) > 30)) { const q = meetSpot(F, gid, ctx.slot | 0); ctx.place(q.x, q.y, q.a); } } catch (e) { N.err('pg.party.place', e); }
    try { if (AMB.S && AMB.S.F === F) endAmbient(false); } catch (e) { /* ignore */ }
    if (ctx.mode === 'party' && !ctx.isHost) {
      const hostUid = ctx.players[0] && ctx.players[0].uid;
      H.offs.push(ctx.on('pi', (d, from) => { if (!H.init && from && from.uid === hostUid && d && d.g === gid && Array.isArray(d.k)) H.init = d; }));
    }
    return {
      update(dt) {
        if (H.done || H.S) { if (H.S && H.S.ended && !H.closed) H.closed = true; return; }
        let el = 0;
        try { el = ctx.elapsed(); } catch (e) { el = 0; }
        if (el < 0) return;
        const params = Object.assign({ difficulty: 0.4 }, o, { place: F.ids[0], seed: ctx.seed, party: ctx, noQuit: true, side: false, reward: 0 });
        delete params.solo;
        if (ctx.mode === 'party' && !ctx.isHost) {
          if (!H.init) {
            H.waitT += dt;
            if (H.waitT > TUNE.party.guestWait) { H.done = true; toast('Could not reach the host\'s game.', 2400); try { ctx.report({ dnf: true, note: 'no connection' }); } catch (e) { /* ignore */ } }
            return;
          }
          params.partyInit = H.init;
        }
        play(gid, params).then((r) => { void r; });
        H.S = current && current.party === ctx ? current : null;
        if (!H.S) { H.done = true; try { ctx.report({ dnf: true, note: 'could not start' }); } catch (e) { /* ignore */ } }
      },
      end(reason) {
        H.done = true;
        for (const f of H.offs) { try { if (typeof f === 'function') f(); } catch (e) { /* ignore */ } }
        H.offs.length = 0;
        if (H.S && current === H.S && !H.S.ended) abort('party:' + (reason || 'end'));
      },
    };
  }
  function partySpec(gid) {
    const lin = gid === 'lingocha';
    const spec = {
      name: lin ? 'Lingocha' : 'Maram pitti', icon: lin ? '🪨' : '🎾', kind: 'score', players: { min: 1, max: 3 }, solo: true,
      ai: ['immu', 'ayesha'], lock: true, timeLimit: lin ? 1500 : 600, r: 0.5,
      label: (lin ? 'Lingocha' : 'Maram pitti') + ' with friends',
      token: lin ? { id: 'pg_lingocha_friends', name: 'Lingocha stone', desc: 'A flat stone from the winning stack: a lingocha match won with friends' }
        : { id: 'pg_maram_friends', name: 'Maram pitti tennis ball', desc: 'The old green ball: last one standing at maram pitti with friends' },
      describe(opts) {
        const F = opts && FIELDS.get(opts.place), at = F ? ' at ' + shortName(F) + ' ground' : ' at the colony ground';
        return lin ? 'Seven stones' + at + ': knock the stack down, then rebuild it before the other team hits you with the ball. Friends captain the teams; colony kids fill them.'
          : 'Dodgeball' + at + ': let the ball bounce before you grab it, hit below the head, last one standing wins. Colony kids join the ring.';
      },
      options(x, y) { if (!fieldList.length) buildFields(); const F = (fin(x) && fin(y) ? nearestField(x, y, 1e9) : null) || FIELDS.get('playground_1') || fieldList[0]; return { place: F ? F.ids[0] : 'playground_1' }; },
      when() { return !(N.flags && N.flags.mg_side_off) || 'Not now.'; },
      start(ctx) { return partyStart(gid, ctx); },
    };
    if (lin) {
      // the winning team first (friends on it by their own score), then the others
      spec.rank = (rows) => rows.slice().sort((a, b) => { const oa = a.dnf || a.left || !a.reported ? 1 : 0, ob = b.dnf || b.left || !b.reported ? 1 : 0; return oa - ob || (b.won | 0) - (a.won | 0) || (b.score || 0) - (a.score || 0); });
    }
    // where it is played: alone, "anywhere" (the start card brings you to the nearest ground); with friends in the room,
    // the "... with friends" prompt stands on each ground's Join offer (nearest first), so the picker can send you there
    if (friendsHere() && fieldList.length) {
      const p = N.player, spots = [];
      for (const F of fieldList) { const q = F.offerAt && F.offerAt[gid]; if (q) spots.push({ x: q.x, y: q.y, r: 16, name: (lin ? 'Lingocha' : 'Maram pitti') + ' at ' + F.name, d: p ? hyp(q.x - p.x, q.y - p.y) : 0, id: F.ids[0] }); }
      spots.sort((a, b) => a.d - b.d);
      if (spots.length) { spec.where = spots[0].id; spec.spots = spots.map((q) => ({ x: q.x, y: q.y, r: q.r, name: q.name })); }
    }
    return spec;
  }
  const PREG = { ref: null, key: '', t: 0 };
  function registerParty(force) {
    const P = N.party;
    if (!P || typeof P.register !== 'function' || !fieldList.length) return false;
    const p = N.player, near = p ? nearestField(p.x, p.y, 1e9) : null;
    const key = (friendsHere() ? 'f' : 's') + ':' + (near ? near.key : '') + ':' + fieldList.length;
    if (!force && PREG.ref === P && PREG.key === key) return true;
    try { for (const gid of Object.keys(PARTY_ID)) P.register(PARTY_ID[gid], partySpec(gid)); PREG.ref = P; PREG.key = key; return true; } catch (e) { N.err('pg.party.register', e); return false; }
  }
  N.on('online:room', () => registerParty());
  N.on('online:players', () => registerParty());

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
    try { registerParty(true); } catch (e) { N.err('pg.party.register', e); }
  }
  function resetAll() {
    AGAIN.gid = null;
    if (current) { const S = current; hardCleanup(S); const r = S.resolve; S.resolve = null; S.ended = true; if (r) r({ id: S.id, win: false, score: 0, stars: 0, aborted: true, reason: 'reset' }); }
    giverAfter.clear();
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
  N.on('mission:start', () => {
    if (AMB.S) endAmbient(false);
    if (current && !current.byMission && !current.ended) { toast('The game breaks up — something came up!', 2400); abort('mission'); }
  });
  // pausing drops a half-charged throw (no surprise throw on Resume); a resize resets the top-down zoom
  // a new view (V): the 3D aim re-syncs the camera to the aim (not the other way round)
  N.on('view:change', () => { const S = current; if (S) S.aim.yaw = null; });
  N.on('game:pause', () => { const S = current; if (S) { S.aim.charging = false; S.aim.dragging = false; S.aim.holdT = 0; resetPointer(); } });
  N.on('render:resize', () => { const S = current; try { if (S && !S.ended && S.zoom != null && N.render && !N.render.camOverride) { S.zoom = gameZoom(S.F); N.render.baseZoom = S.zoom; } } catch (e) { /* ignore */ } });

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
          parts: S.parts.map((P) => ({ name: P.name, me: !!P.isPlayer, team: P.team, out: P.out, safe: P.safeT > 0, hold: P.hold, carry: P.carry ? P.carry.i : null, x: +P.e.x.toFixed(1), y: +P.e.y.toFixed(1), npc: P.npc || null, dood: !!P.dood, hits: P.hits, fouls: P.fouls, remote: !!P.remote, uid: P.uid || null, nick: P.nick || null, ai: P.aiUid || null, mirror: !!P.net, hidden: !!P.e.hidden })),
          net: S.net ? { host: S.net.host, guest: S.net.guest, sent: S.net.sent, recv: S.net.recv, cmds: S.net.cmds, hits: S.net.hits, acks: S.net.acks.size, need: S.net.need } : null, party: S.party ? S.party.mode : null,
          label: S.ui.label, prompt: S.ui.prompt, aim: { ang: +S.aim.ang.toFixed(3), p: +S.aim.p.toFixed(2), charging: S.aim.charging },
          log: S.log.slice(-60), stats: Object.assign({}, S.stats), auto: !!S.auto, target: S.aimTarget ? S.aimTarget.name : null,
          tele: S.tele && S.tele.from && S.tele.from.windT > 0 ? { from: S.tele.from.name, to: S.tele.to ? S.tele.to.name : null, atMe: S.tele.to === S.me, windT: +S.tele.from.windT.toFixed(3), fuse: +fuse(S.tele.from).toFixed(2), locked: !!S.tele.from.aimLock } : null,
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
        S.me.safeT = 0; S.me.safeCD = 3; S.me.catchT = -9;
        const p = N.player, from = S.parts.find((P) => !P.isPlayer && !P.out && (S.id !== 'lingocha' || P.team !== S.me.team)) || S.parts.find((P) => !P.isPlayer);
        if (!from) return false;
        release(S, from, Math.atan2(p.y - from.e.y, p.x - from.e.x), 150, 0, { quiet: true });
        const b = S.ball, ha = Math.atan2(p.y - from.e.y, p.x - from.e.x);
        b.x = p.x - Math.cos(ha) * 6; b.y = p.y - Math.sin(ha) * 6; b.z = z == null ? 2.6 : z; b.vz = 0;
        // (as if thrown from a fair distance)
        b.rx = p.x - Math.cos(ha) * 30; b.ry = p.y - Math.sin(ha) * 30; b.liveDist = 60;
        return true;
      },
      /** make `who` (default: the player) throw a live ball at `name` (exact: straight at him, chest high) */
      throwAt(name, who, exact) {
        const S = current; if (!S) return false;
        const T = PG.debug.part(name), P = who ? PG.debug.part(who) : S.me;
        if (!T || !P) return false;
        if (!P.hold) give(S, P);
        if (exact) launchAt(S, P, T.e.x, T.e.y, 2.6, 150, 0, { target: T });
        else if (P.isPlayer) playerThrow(S, T, false); else LING.aiThrowAt(S, P, T);
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
      /** party glue (tests): the registered specs, the Join offers' "with friends" state */
      party: { registerParty, partySpec, NET, PARTY_ID, friendsHere },
      busy() { return Array.from(BUSY); },
      filtered: FILTERED,
      v3: V3L,
    },
  });
})();
