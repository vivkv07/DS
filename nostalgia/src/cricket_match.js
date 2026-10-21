/* NOSTALGIA — cricket_match.js  (owner: cricket developer)
 * The LB Stadium cricket match (places_registry round 12): minigame id 'match'.
 * A full limited-overs match with a toss, a batting AND a bowling innings, extras, boundaries,
 * catches and run-outs, drawn as a 90s/early-2000s TV broadcast: a pseudo-3D perspective view from
 * behind the bowler's end (stands, crowds, four lattice floodlight towers, sight screen, scoreboard,
 * umpires, eleven fielders in coloured clothing), a DD-Sports-like score bug, a commentary ticker in
 * Hinglish / Telugu / Dakhni flavour (no real players' names), action replays and a wagon wheel.
 * The user's "3D FPV ... like GTA 5" request: the camera button (V / C / CAM) switches between the TV
 * broadcast camera and a first-person camera (batsman's helmet cam / the bowler running in). Both are
 * the same 3D scene through a real perspective camera, so the match also plays in "FPV".
 *
 * PUBLIC API
 *   N.minigames.play('match', params) -> Promise<result>      (registered through N.minigames.register)
 *   N.cricketMatch.start(params) / play(params)                 same, for the story; sets N.flags.lb_match_played
 *   N.cricketMatch.TEAMS, VENUES, FIELDS, COMM                   data (rosters, venues, field presets, lines)
 *   N.cricketMatch.rules {newInnings, applyBall, oversText, ...} pure scoring engine (tests use it)
 *   N.cricketMatch.debug {force(kind), state(), game(), toggleCam()}  test hooks for an open match: force the next
 *                                                                delivery: four|six|wide|noball|runout|bowled|caught|dot|single|house
 *                                                                (house = gully rule); state() includes ballLog / inputLog / perf
 *   N.cricketMatch.TUNE {tv, tvGully}                            TV camera framing (height, distance, focal)
 *   N.cricketMatch.dressing {on, draw()}                         match-day dressing of the 2D world (below)
 *
 * params (all optional; the minigame framework adds difficulty/assist/seed/autoplay/timeScale/intro/
 *   noRetry/noQuit/skipHowto/title/reward)
 *   overs (3 per side) · wickets (5 = all out) · home ('Chinnu XI' | team id | {name, short, kit, players})
 *   · away ('ashok_nagar' default; 'vidyanagar' 'nallakunta' 'saidabad' 'barkas' | name | object)
 *   · target (n: Chinnu XI chases n; the opponents' innings is taken as already played) · mode 'full' |
 *   'chase' | 'defend' (defend: the opponents chase target) · batFirst (skip the toss) · toss:false
 *   · venue 'lb_stadium' | 'gully' (colony ground skin + gully rules: one-tip-one-hand, a ball into a house
 *   on the full is OUT) · time 'day' | 'evening' (default: a day-night match, lights come on) | 'night'
 *   · camera 'tv' | 'fpv' (default follows N.view.mode 'fps') · replays (default true) · exhibition
 * result {id:'match', win, tie, score, runs, wickets, overs, oppRuns, oppWickets, oppOvers, target, fours, sixes,
 *   extras, battedFirst, tossWon, margin, reason 'chased'|'defended'|'allout'|'short'|'tie', motm {name, team,
 *   line}, topScorer, bestBowler, wagon [{ang, dist, runs}], innings [..summary], quit, aborted, stars, ...}
 *
 * CONTROLS  keyboard: bat ← ↑ → (shot, on time) ↓ block, hold Shift loft, R run · bowl arrows aim, 1-4 type
 *   (pace/spin/yorker/bouncer), Space bowl then Space release (in the green), F field, Space = catch when
 *   prompted · V camera (TV / FPV) · Esc pause. Touch: pad buttons (2 rows in portrait, side bars in
 *   landscape), swipe on the picture to play a shot (swipe up = lofted, tap = straight), drag to aim,
 *   tap the CAM pill. Gamepad (via the framework): A = Space, B = run / cycle type, X = loft / field,
 *   Y = camera, d-pad / stick = arrows, Start = pause.
 * TESTS  tests/cricket_match.cjs. Note: Canvas 2D only; headless Chromium launched with the SwiftShader
 *   WebGL flags only ticks requestAnimationFrame on screenshots, so the test launches without them.
 *
 * HOOKS INTO OTHER MODULES (from this file only, ARCHITECTURE §3 "add hooks from your own file")
 *   - N.minigames.register({id:'match', ...}) at load (minigames.js loads first) or on 'boot'; the framework
 *     owns the overlay, how-to card, countdown, pause/quit, result card. This file only adds a wagon-wheel
 *     canvas + Man-of-the-Match line into its result card (DOM inside the match's own overlay).
 *   - N.addSystem('cricketMatchDressing', order 46, draw only): when N.flags.lb_match is truthy and
 *     lb_stadium is in view, it enqueues (N.render.queue) crowds on the stand tiers, the floodlight lamp
 *     banks switched on (+ N.render.lights at dusk/night), parked scooters/cycles and a gate crowd.
 *   - N.interact.add('match:lb_stadium') at the west gate: "Exhibition match" once N.flags.lb_match_played
 *     (or lb_match_unlocked) is set, priority -1 so story prompts win.
 *   - N.audio via the framework (g.sfx): bat_hit, crowd_cheer, applause, howzat, dappu, finger_whistle,
 *     coin, chop; a synthesised crowd-murmur bed (g.loop) that swells on boundaries.
 *   - Reads N.view.mode (3D view agent) only to pick the default camera; never writes it.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const G = 9.81;

  /* ================================================================ constants (metres, seconds) */
  // x: across the pitch (+x = the leg side of a right-hander = screen right in the TV view),
  // y: up, z: along the pitch; striker's stumps at z = 0, bowler's stumps at z = PITCH.
  const PITCH = 20.12, CREASE = 1.22, HIT_Z = 1.3;
  const STUMP_H = 0.71, STUMP_X = 0.096, BALL_R = 0.036;
  const WIDE_X = 0.92;            // wide guideline (from middle stump, at the batter)
  const RUN_T = [2.45, 2.25];     // seconds for the first / later runs (kids)
  const THROW_V = 23;             // m/s
  const FIELD_V = 6.1;            // fielder sprint m/s

  // camera tunables (TV: height, distance behind the bowler's stumps, look-at, focal length in frame heights)
  const TUNE = {
    tv: { x: 0, y: 8.4, back: 52, ty: 0.9, tz: 6.4, f: 6.0 },
    tvGully: { x: 0, y: 6.4, back: 25, ty: 0.7, tz: 5.5, f: 3.7 },
  };
  const VENUES = {
    lb_stadium: {
      id: 'lb_stadium', name: 'LB Stadium', long: 'Lal Bahadur Stadium, Fateh Maidan', place: 'lb_stadium',
      rx: 52, rz: 56, cz: PITCH / 2, stands: true, lights: true, ball: '#f6f4ee', seam: '#9a9a9a',
      grass: '#3f8f3c', grass2: '#4fa046', apron: '#4f7a3a', pitch: '#cdb488', crowd: 0.82, fielders: 9, gully: false,
      stands3: ['NORTH', 'EAST', 'SOUTH', 'WEST'],
    },
    gully: {
      id: 'gully', name: 'Colony ground', long: 'Vidyanagar colony ground', place: 'playground_2',
      rx: 30, rz: 33, cz: PITCH / 2, stands: false, lights: false, ball: '#d8f05a', seam: '#ffffff',
      grass: '#9a8462', grass2: '#a8916c', apron: '#8a7658', pitch: '#c4a983', crowd: 0, fielders: 5, gully: true,
      stands3: ['WALL', 'GATE', 'TANK', 'AUNTY'],
    },
  };

  /* ================================================================ teams */
  // Bible §2 names for Chinnu XI; the rest of the colony kids and every rival are invented first names
  // (no real players). rating: bat / bowl / field 0..1; type pace|spin; spin +1 off-break (into a right-
  // hander) / -1 leg-break. look: painted extras for the close-up sprites.
  const P = (name, bat, bowl, type, look, o) => Object.assign({ name, bat, bowl, type: type || 'pace', spin: 1, field: 0.6, look: look || {} }, o || {});
  const TEAMS = {
    chinnu_xi: {
      id: 'chinnu_xi', name: 'Chinnu XI', short: 'CHIN XI', city: 'Vidyanagar colony',
      kit: { shirt: '#2a8c82', trim: '#f2c230', pants: '#1d5d57', cap: '#f2c230', num: '#f2c230' },
      players: [
        P('Chinnu', 0.66, 0.38, 'spin', { skin: '#b97a4f', hair: '#1a1412', spiky: true }, { spin: -1, hero: true, field: 0.7 }),
        P('Immu', 0.52, 0.55, 'spin', { skin: '#c68b5e', hair: '#1a1412', specs: true }, { spin: 1 }),
        P('Pappu', 0.6, 0.48, 'pace', { skin: '#a0683f', hair: '#1a1412' }, { field: 0.55 }),
        P('Ayesha', 0.46, 0.8, 'pace', { skin: '#a0683f', hair: '#1a1412', plaits: true, cap: '#1d4f91', girl: true }, { field: 0.75 }),
        P('Babloo', 0.5, 0.35, 'pace', { skin: '#b97a4f', hair: '#1a1412', curly: true }),
        P('Venky', 0.44, 0.42, 'pace', { skin: '#8d5a3b' }),
        P('Sameer', 0.42, 0.3, 'pace', { skin: '#c68b5e' }, { keeper: true, field: 0.72 }),
        P('Gopi', 0.36, 0.45, 'spin', { skin: '#7a4a30' }),
        P('Raju', 0.34, 0.4, 'pace', { skin: '#9a6040' }),
        P('Pinky', 0.32, 0.36, 'spin', { skin: '#b97a4f', girl: true, plaits: true }),
        P('Chitti', 0.18, 0.1, 'spin', { skin: '#b97a4f', girl: true, ponytails: true, small: true }, { field: 0.5 }),
      ],
      bowlers: [3, 1, 2, 0, 7], // Ayesha opens the bowling
    },
    ashok_nagar: rival('ashok_nagar', 'Ashok Nagar XI', 'ASHK XI', '#8a2433', '#f4efe2', '#5a1822',
      ['Tiger', 'Lucky', 'Munna', 'Pandu', 'Shankar', 'Firoz', 'Kittu', 'Naveed', 'Chotu', 'Ravi', 'Sunny'], 0.62),
    vidyanagar: rival('vidyanagar', 'Vidyanagar Boys', 'VIDY XI', '#2a5cb8', '#f4efe2', '#1d3f80',
      ['Srinu', 'Ramesh', 'Arif', 'Mahesh', 'Kishore', 'Nandu', 'Ali', 'Prasad', 'Bittu', 'Satti', 'Hari'], 0.42),
    nallakunta: rival('nallakunta', 'Nallakunta Strikers', 'NLKT XI', '#e07a2e', '#1a1214', '#7a3a10',
      ['Dinesh', 'Yusuf', 'Seenu', 'Pavan', 'Raghu', 'Imran', 'Anil', 'Murali', 'Tinku', 'Kiran', 'Jaggu'], 0.5),
    saidabad: rival('saidabad', 'Saidabad Sixers', 'SDBD XI', '#6b3fa0', '#f2c230', '#3f2466',
      ['Sajid', 'Vamsi', 'Bala', 'Kareem', 'Naresh', 'Shiva', 'Rafi', 'Lalu', 'Gattu', 'Venu', 'Abbas'], 0.56),
    barkas: rival('barkas', 'Barkas Chargers', 'BRKS XI', '#2f6a3a', '#f4efe2', '#1d4a26',
      ['Hamdan', 'Saleh', 'Omar', 'Faisal', 'Majid', 'Nasir', 'Aziz', 'Yahya', 'Zaid', 'Salim', 'Bilal'], 0.6),
  };
  function rival(id, name, short, shirt, trim, pants, names, strength) {
    const rng = U.rng('cm_team_' + id);
    const skins = ['#7a4a30', '#8d5a3b', '#9a6040', '#a0683f', '#b97a4f', '#c68b5e'];
    const players = names.map((n, i) => {
      const top = i < 4, tail = i > 7;
      const bat = clamp(strength - i * 0.035 + (rng.next() - 0.5) * 0.12 + (top ? 0.06 : 0) - (tail ? 0.08 : 0), 0.15, 0.85);
      const type = i === 5 || i === 7 || i === 9 ? 'spin' : 'pace';
      const bowl = clamp(strength - 0.1 + (i >= 3 && i <= 8 ? 0.18 : -0.05) + (rng.next() - 0.5) * 0.15, 0.2, 0.85);
      return P(n, bat, bowl, type, { skin: skins[(rng.next() * skins.length) | 0], hair: '#1a1412', capBack: i === 0 }, { spin: rng.next() < 0.6 ? 1 : -1, keeper: i === 6, field: 0.5 + rng.next() * 0.25 });
    });
    return { id, name, short, city: name, kit: { shirt, trim, pants, cap: trim === '#1a1214' ? shirt : pants, num: trim }, players, bowlers: [0, 3, 5, 4, 7] };
  }
  function makeTeam(spec, fallback) {
    if (spec && typeof spec === 'object') {
      const base = TEAMS[spec.id] || TEAMS[fallback];
      const t = Object.assign({}, base, spec);
      if (Array.isArray(spec.players) && spec.players.length && typeof spec.players[0] === 'string') {
        const gen = rival('custom_' + (spec.name || 'x'), spec.name || 'Visitors XI', spec.short || 'VIS XI', (spec.kit && spec.kit.shirt) || '#8a2433', '#f4efe2', '#3a2a2a', spec.players.slice(0, 11).concat(base.players.map((p) => p.name)).slice(0, 11), 0.55);
        t.players = gen.players;
      }
      t.kit = Object.assign({}, base.kit, spec.kit || {});
      t.short = t.short || shortOf(t.name);
      return clone(t);
    }
    if (typeof spec === 'string') {
      const key = spec.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
      if (TEAMS[key]) return clone(TEAMS[key]);
      for (const k in TEAMS) if (TEAMS[k].name.toLowerCase() === spec.toLowerCase()) return clone(TEAMS[k]);
      if (key === 'chinnu' || key === 'colony_xi' || key === 'home') return clone(TEAMS.chinnu_xi);
      const t = clone(TEAMS[fallback]);
      if (fallback === 'chinnu_xi') { t.name = spec; t.short = shortOf(spec); return t; }
      const g = rival('custom_' + key, spec, shortOf(spec), '#8a2433', '#f4efe2', '#5a1822', TEAMS.ashok_nagar.players.map((p) => p.name), 0.55);
      return clone(g);
    }
    return clone(TEAMS[fallback]);
  }
  function shortOf(name) {
    const w = String(name).toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean);
    const a = w[0] || 'TEAM';
    return (a.length <= 5 ? a : a.slice(0, 4)) + ' XI'; // 'Pintu XI' stays 'PINTU XI'
  }
  function clone(t) {
    const c = Object.assign({}, t);
    c.kit = Object.assign({}, t.kit);
    c.players = t.players.map((p, i) => Object.assign({}, p, { look: Object.assign({}, p.look), idx: i, num: [7, 10, 18, 3, 12, 5, 1, 27, 9, 14, 22][i] || i + 1 }));
    c.bowlers = (t.bowlers || [0, 1, 2, 3]).slice();
    return c;
  }

  /* ================================================================ fielding presets */
  // [x, z] relative to the striker's stumps (right-handed batter: off side = -x). Stadium scale;
  // the gully skin scales them down. Deep positions sit just inside a 52 x 56 m rope.
  const POS = {
    slip1: [-1.7, -7.2], slip2: [-3.4, -6.8], gully: [-8.5, -4.5], point: [-17, 1.8], cover: [-16.5, 13.5],
    midoff: [-7.5, 27], midon: [7.5, 27], midwicket: [16.5, 13], sqleg: [17.5, 1.2], shortfine: [9, -11],
    thirdman: [-26, -34], deepfine: [24, -34], deeppoint: [-45, 4], deepcover: [-40, 33], longoff: [-17, 59],
    longon: [17, 59], deepmid: [40, 33], deepsq: [45, 4], silly: [-3.2, 3.2], shortleg: [3.4, 2.4],
  };
  const FIELDS = {
    attack: { name: 'Attacking', spots: ['slip1', 'slip2', 'gully', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'shortfine'] },
    balanced: { name: 'Balanced', spots: ['slip1', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'sqleg', 'thirdman', 'deepfine'] },
    defend: { name: 'Defensive', spots: ['point', 'deepcover', 'longoff', 'longon', 'deepmid', 'deepsq', 'thirdman', 'deepfine', 'cover'] },
    spin: { name: 'Spin trap', spots: ['slip1', 'silly', 'shortleg', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'deepsq'] },
  };
  const FIELD_ORDER = ['attack', 'balanced', 'defend', 'spin'];
  const GULLY_SPOTS = { attack: ['slip1', 'point', 'cover', 'midon', 'midwicket'], balanced: ['point', 'cover', 'midoff', 'midon', 'sqleg'], defend: ['deepcover', 'longoff', 'longon', 'deepmid', 'point'], spin: ['silly', 'point', 'cover', 'midon', 'midwicket'] };

  /* ================================================================ commentary */
  // Generic broadcast lines in Hinglish / Telugu / Dakhni flavour. {bat} {bowl} {fielder} {team} {need} {balls}
  // {score} {runs} {stand}. No real players' names.
  const COMM = {
    welcome: ['Namaskar, and welcome to Lal Bahadur Stadium! Full house for the colony final.', 'Live from Fateh Maidan! Floodlights, full stands, and two colony teams with big dreams.', 'Welcome to LB Stadium, Hyderabad. The crowd is ready, the chai is ready, let us begin!'],
    welcomeGully: ['Live from the colony ground! Aunty has closed her windows. Mostly.', 'Welcome to the colony final. Tennis ball, real stumps, and a lot of shouting.'],
    toss: ['{cap} calls {call}... it is {side}!', 'Coin goes up, the whole stadium looks up... {side}!'],
    tossWin: ['{team} win the toss and will {choice} first.', '{team} have won the toss. They will {choice}.'],
    four: ['Kya shot hai! Races away to the ropes. FOUR!', 'Chakkagaa kottadu! Lovely timing, four runs.', 'Boundary! The {stand} stand is dancing.', 'Like a Chetak going downhill, no brakes. FOUR!', 'Ekdum class! Past the fielder, all along the ground.', 'Em shot ra! That is four.'],
    six: ['Arre baap re! That has gone into the crowd. SIX!', 'Sixer! Somebody in the {stand} stand, catch it!', 'Out of the park, almost into the Basheerbagh traffic!', 'Chakka! Full Hyderabadi power!', 'Up, up and gone! Biryani for everybody tonight!'],
    sixGully: ['Over the wall! Maximum!', 'Sixer! That ball has gone to the next colony!'],
    dot: ['Defended. Solid like Golconda fort.', 'Good ball, no run.', 'Left alone. Smart batting.', 'Dot ball. The bowler is happy.', 'Blocked. {bat} is not taking any chances.'],
    beaten: ['Swing and a miss!', 'Beaten all ends up!', 'Played and missed. Oof.', 'Past the outside edge. So close!'],
    single: ['Pushed for a quick single.', 'Tip and run, nicely done.', 'One run, strike rotated.', 'Dabbed into the gap for one.'],
    two: ['Good running, they come back for two.', 'Two runs. Bhaago bhaago!', 'Hard running, two more.'],
    three: ['Three runs! The fielder had a long walk.', 'They run three! Kya stamina!'],
    bowled: ['Bowled him! The stumps are doing a dance!', 'Timber! Middle stump goes for a walk.', 'Clean bowled! Kya ball hai!', 'Through the gate and bowled!'],
    caught: ['Caught! Pakka hands from {fielder}!', 'In the air... and taken! Howzaaat!', 'Straight down the throat. {fielder} takes it.', 'Up it goes... {fielder} waiting... GOT IT!'],
    caughtKeeper: ['Edged, and the keeper takes it! Caught behind.', 'Nick... and gone! {fielder} behind the stumps.'],
    caughtBowler: ['Caught and bowled! {bowl} takes a sharp one.'],
    runout: ['Run out! Too greedy for that run, boss.', 'Direct throw and he is short. Run out!', 'Bhaago bhaago... but not fast enough. Run out!'],
    oneTip: ['One-tip one-hand! Colony rules, you are OUT!'],
    house: ['Into Aunty\'s house! Ball gone, and the batter also gone. OUT!'],
    wide: ['Wide ball! Umpire-uncle stretches his arms.', 'Too wide. One extra run.', 'Down the leg side. Wide.'],
    noball: ['No ball! Overstepped by a mile.', 'No ball! Front foot is over the line.', 'Called no ball, extra run.'],
    noballHigh: ['Too high! No ball for height.'],
    noballSaved: ['But it is a NO BALL! {bat} survives!'],
    dropped: ['Dropped! Arre, butter fingers!', 'Put down! That was a sitter, yaar.', 'Chhoot gaya! A life for {bat}.'],
    misfield: ['Misfield! The ball goes through his legs.', 'Fumbled! Extra run there.'],
    yorker: ['Yorker! Right in the blockhole.', 'Toe-crusher of a yorker!'],
    bouncer: ['Bouncer! Duck, beta!', 'Short and fast, at the helmet!'],
    spin: ['Tossed up, flighted beautifully.', 'Turning like a Charminar spiral staircase!'],
    overEnd: ['End of the over. {team} {score}.', 'That is the over. {score} for {team}.'],
    need: ['{need} needed from {balls} balls. Tension in the stands!', 'Required: {need} off {balls}. Nail-biting!', '{need} to win, {balls} balls left. Kya hoga?'],
    inningsBreak: ['Innings break! {team} need {need} to win.', 'That is the end of the innings. Target: {need}.'],
    thirdUmp: ['Close! Referred to the third umpire...'],
    win: ['{team} WIN! The whole of Basheerbagh can hear this crowd!', 'Kya match hai! {team} take the trophy!', 'Abba! {team} have done it!'],
    lose: ['{team} win it. Hard luck, {pteam}. Next year, pakka!'],
    tie: ['A TIE! Scores level! Nobody can believe it!'],
    replay: ['Let us see that again...', 'Action replay, in slow motion.'],
    wave: ['Mexican wave going round the stands!'],
    lights: ['The floodlights are on. Four tall uncles with light-bulb heads!'],
    newBat: ['{bat} walks in. Big moment.', 'Here comes {bat}. The crowd is clapping.'],
    hit: ['Hit hard...', 'Good shot...', 'In the gap...'],
    lofted: ['Up in the air...', 'Lofted... is it far enough?'],
    edge: ['Edged!', 'Off the edge...'],
    bigOver: ['Expensive over for {bowl}.'],
    maiden: ['A maiden over! Brilliant from {bowl}.'],
  };

  /* ================================================================ small utils */
  function pickLine(S, key, vars) {
    const pool = COMM[key];
    if (!pool || !pool.length) return '';
    const last = S.commLast[key];
    let i = (S.crng.next() * pool.length) | 0;
    if (pool.length > 1 && i === last) i = (i + 1) % pool.length;
    S.commLast[key] = i;
    return fill(pool[i], vars);
  }
  function fill(s, vars) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m)); }
  function weighted(rng, table) {
    let tot = 0; for (const k in table) tot += Math.max(0, table[k]);
    let r = rng.next() * tot;
    for (const k in table) { r -= Math.max(0, table[k]); if (r <= 0) return k; }
    return Object.keys(table)[0];
  }
  function inside(V, x, z, m) { const a = x / (V.rx + (m || 0)), b = (z - V.cz) / (V.rz + (m || 0)); return a * a + b * b < 1; }
  function ellR(V, ang, m) { return { x: Math.sin(ang) * (V.rx + (m || 0)), z: V.cz + Math.cos(ang) * (V.rz + (m || 0)) }; }
  function oversText(balls) { return Math.floor(balls / 6) + '.' + (balls % 6); }
  function kph(v) { return Math.round(v * 3.6); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ================================================================ 3D camera */
  // TX = the device transform of the canvas being painted (dpr scale + offset for the cached layer)
  const TX = { s: 1, ox: 0, oy: 0 };
  function resetT(ctx) { ctx.setTransform(TX.s, 0, 0, TX.s, TX.ox, TX.oy); }
  // A real perspective camera (position + look-at + focal length in px). Every camera (TV broadcast,
  // field pan, replays, helmet-cam FPV, bowler FPV, toss) draws the same world through it.
  function makeCam() { return { x: 0, y: 5, z: 50, rx: 1, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: -1, f: 600, cx: 0, cy: 0, near: 0.3, tx: 0, ty: 0, tz: 0 }; }
  function camLook(c, px, py, pz, tx, ty, tz, f) {
    c.x = px; c.y = py; c.z = pz; c.tx = tx; c.ty = ty; c.tz = tz; c.f = f;
    let fx = tx - px, fy = ty - py, fz = tz - pz;
    const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    c.rx = rx; c.rz = rz; c.fx = fx; c.fy = fy; c.fz = fz;
    c.ux = -rz * fy; c.uy = rz * fx - rx * fz; c.uz = rx * fy;
    return c;
  }
  function camCopy(dst, src) { for (const k in src) dst[k] = src[k]; return dst; }
  const PT = { x: 0, y: 0, k: 0, z: 0, ok: false };
  function proj(c, x, y, z, out) {
    out = out || PT;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const zc = dx * c.fx + dy * c.fy + dz * c.fz;
    out.z = zc;
    if (zc < c.near) { out.ok = false; return out; }
    const k = c.f / zc;
    out.x = c.cx + (dx * c.rx + dz * c.rz) * k;
    out.y = c.cy - (dx * c.ux + dy * c.uy + dz * c.uz) * k;
    out.k = k; out.ok = true;
    return out;
  }
  function depth(c, x, y, z) { return (x - c.x) * c.fx + (y - c.y) * c.fy + (z - c.z) * c.fz; }
  // polygon path with near-plane clipping. pts: flat [x,y,z, x,y,z, ...]. Returns false if nothing left.
  const CLIP_A = new Float64Array(3 * 256), CLIP_B = new Float64Array(3 * 256);
  function polyPath(ctx, c, pts, n, move) {
    n = n || pts.length / 3;
    let cnt = 0, allIn = true;
    // camera space
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - c.x, dy = pts[i * 3 + 1] - c.y, dz = pts[i * 3 + 2] - c.z;
      const zc = dx * c.fx + dy * c.fy + dz * c.fz;
      CLIP_A[cnt++] = dx * c.rx + dz * c.rz; CLIP_A[cnt++] = dx * c.ux + dy * c.uy + dz * c.uz; CLIP_A[cnt++] = zc;
      if (zc < c.near) allIn = false;
    }
    let src = CLIP_A, m = n;
    if (!allIn) {
      let o = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const az = src[i * 3 + 2], bz = src[j * 3 + 2];
        const ain = az >= c.near, bin = bz >= c.near;
        if (ain) { CLIP_B[o++] = src[i * 3]; CLIP_B[o++] = src[i * 3 + 1]; CLIP_B[o++] = az; }
        if (ain !== bin) {
          const t = (c.near - az) / (bz - az);
          CLIP_B[o++] = src[i * 3] + (src[j * 3] - src[i * 3]) * t; CLIP_B[o++] = src[i * 3 + 1] + (src[j * 3 + 1] - src[i * 3 + 1]) * t; CLIP_B[o++] = c.near;
        }
        if (o > CLIP_B.length - 6) break;
      }
      src = CLIP_B; m = o / 3;
      if (m < 3) return false;
    }
    if (!move) ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const k = c.f / src[i * 3 + 2];
      const sx = c.cx + src[i * 3] * k, sy = c.cy - src[i * 3 + 1] * k;
      if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
    }
    ctx.closePath();
    return true;
  }
  const QB = new Float64Array(12);
  function quadPath(ctx, c, ax, ay, az, bx, by, bz, cx_, cy_, cz_, dx, dy, dz, move) {
    QB[0] = ax; QB[1] = ay; QB[2] = az; QB[3] = bx; QB[4] = by; QB[5] = bz; QB[6] = cx_; QB[7] = cy_; QB[8] = cz_; QB[9] = dx; QB[10] = dy; QB[11] = dz;
    return polyPath(ctx, c, QB, 4, move);
  }
  // world line segment (clipped) -> screen; returns false if invisible
  const LA = { x: 0, y: 0, k: 0, z: 0, ok: false }, LB = { x: 0, y: 0, k: 0, z: 0, ok: false };
  function segment(ctx, c, ax, ay, az, bx, by, bz) {
    let za = depth(c, ax, ay, az), zb = depth(c, bx, by, bz);
    if (za < c.near && zb < c.near) return false;
    if (za < c.near) { const t = (c.near - za) / (zb - za); ax += (bx - ax) * t; ay += (by - ay) * t; az += (bz - az) * t; }
    else if (zb < c.near) { const t = (c.near - zb) / (za - zb); bx += (ax - bx) * t; by += (ay - by) * t; bz += (az - bz) * t; }
    proj(c, ax, ay, az, LA); proj(c, bx, by, bz, LB);
    ctx.moveTo(LA.x, LA.y); ctx.lineTo(LB.x, LB.y);
    return true;
  }
  // affine-map an image slice onto a projected quad (p0 top-left, p1 top-right, p3 bottom-left)
  const Q0 = { x: 0, y: 0, k: 0, z: 0, ok: false }, Q1 = { x: 0, y: 0, k: 0, z: 0, ok: false }, Q3 = { x: 0, y: 0, k: 0, z: 0, ok: false };
  // (the 4th corner is b + d - a; every corner must be comfortably in front of the camera, else the
  //  affine map would smear the texture across the frame)
  function texQuad(ctx, c, img, sx, sy, sw, sh, ax, ay, az, bx, by, bz, dx, dy, dz) {
    if (depth(c, bx + dx - ax, by + dy - ay, bz + dz - az) < 2.5) return false;
    proj(c, ax, ay, az, Q0); if (!Q0.ok || Q0.z < 2.5) return false;
    proj(c, bx, by, bz, Q1); if (!Q1.ok || Q1.z < 2.5) return false;
    proj(c, dx, dy, dz, Q3); if (!Q3.ok || Q3.z < 2.5) return false;
    // close up, an affine map of a big quad looks wrong: let the plain fill underneath show instead
    if (Math.abs(Q1.x - Q0.x) + Math.abs(Q3.y - Q0.y) > c.f * 0.9 || Q0.z < 14) return false;
    const a = (Q1.x - Q0.x) / sw, b = (Q1.y - Q0.y) / sw, cc = (Q3.x - Q0.x) / sh, d = (Q3.y - Q0.y) / sh;
    if (Math.abs(a * d - b * cc) < 1e-6) return false;
    const k = TX.s;
    ctx.setTransform(a * k, b * k, cc * k, d * k, (Q0.x - (a * sx + cc * sy)) * k + TX.ox, (Q0.y - (b * sx + d * sy)) * k + TX.oy);
    ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw + 0.6, sh + 0.6);
    return true;
  }

  /* ================================================================ procedural textures (built once) */
  const TEX = {};
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  const CROWD_SHIRTS = ['#e8402a', '#f2c230', '#2a5cb8', '#f4efe2', '#2a8c82', '#e07a2e', '#7a3db8', '#d24d57', '#3f8f3c', '#ffffff', '#1d4f91', '#f08ab0', '#efe9dc', '#6bb8e8'];
  const CROWD_SKIN = ['#7a4a30', '#8d5a3b', '#9a6040', '#a0683f', '#b97a4f', '#c68b5e'];
  // crowd: 1024 x 128, 8 rows of seated fans on concrete steps; variant 1 = arms up (cheering)
  function crowdTex(variant, density) {
    const key = 'crowd' + variant + ':' + density;
    if (TEX[key]) return TEX[key];
    const W = 1024, H = 128, c = canvas(W, H), g = c.getContext('2d');
    const r = U.rng('cm_crowd_' + variant);
    for (let row = 0; row < 8; row++) {
      const y0 = row * 16;
      g.fillStyle = row % 2 ? '#8e8a84' : '#9a968f'; g.fillRect(0, y0, W, 16);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y0 + 13, W, 3);
      for (let x = 2; x < W; x += 4.6 + r.next() * 1.8) {
        if (r.next() > density) continue;
        const shirt = CROWD_SHIRTS[(r.next() * CROWD_SHIRTS.length) | 0], skin = CROWD_SKIN[(r.next() * CROWD_SKIN.length) | 0];
        const up = variant === 1 && r.next() < 0.75;
        g.fillStyle = shirt; g.fillRect(x - 2, y0 + 6, 4.4, 7);
        g.fillStyle = skin; g.beginPath(); g.arc(x + 0.2, y0 + 4, 2.1, 0, TAU); g.fill();
        if (r.next() < 0.5) { g.fillStyle = '#1a1412'; g.fillRect(x - 1.8, y0 + 1.8, 4, 1.4); }
        if (up) { g.strokeStyle = skin; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 2, y0 + 7); g.lineTo(x - 3.4, y0 + 0.5); g.moveTo(x + 2.4, y0 + 7); g.lineTo(x + 3.8, y0 + 0.5); g.stroke(); }
        if (r.next() < 0.04) { g.fillStyle = r.next() < 0.5 ? '#ff9933' : '#138808'; g.fillRect(x + 2, y0 - 3, 6, 4); g.fillStyle = '#f4efe2'; g.fillRect(x + 2, y0 - 1.6, 6, 1.2); } // a flag
        if (r.next() < 0.03) { g.fillStyle = '#f4efe2'; g.fillRect(x - 6, y0 - 1, 14, 6); g.fillStyle = '#d8402a'; g.fillRect(x - 5, y0 + 1, 12, 1.4); } // a placard
      }
    }
    return (TEX[key] = c);
  }
  // advertising boards: 1024 x 32 strip of invented local sponsors (no real brands, no logos)
  const ADS = [
    ['VIJAYA TV & RADIO', '#1d4f91', '#f2c230'], ['CAFE GULISTAN · CHAI ₹2', '#2a8c82', '#f4efe2'], ['SRI LAKSHMI KIRANA', '#d8402a', '#f4efe2'],
    ['RAJ COLOUR LAB', '#f2c230', '#1a1214'], ['CH 7 SPORTS', '#1a1214', '#f2c230'], ['CYBER ZONE BROWSING', '#5a4a7a', '#f4efe2'],
    ['BHAGYANAGAR TENT HOUSE', '#f4efe2', '#b22b2b'], ['NOOR-E-IRAN BAKERY', '#7a2f35', '#f2c230'], ['DECCAN CYCLE STORES', '#3f8f3c', '#f4efe2'],
    ['OSMANIA BISCUIT · ₹1', '#e07a2e', '#1a1214'],
  ];
  function adsTex() {
    if (TEX.ads) return TEX.ads;
    const W = 1024, H = 32, c = canvas(W, H), g = c.getContext('2d');
    let x = 0, i = 0;
    while (x < W) {
      const [t, bg, fg] = ADS[i % ADS.length]; i++;
      g.font = 'bold 19px ' + "'Baloo 2', system-ui, sans-serif";
      const w = Math.min(W - x, Math.max(96, g.measureText(t).width + 26));
      g.fillStyle = bg; g.fillRect(x, 0, w, H);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, w, 6);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x + w / 2, H / 2 + 1, w - 10);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + w - 2, 0, 2, H);
      x += w;
    }
    return (TEX.ads = c);
  }

  /* ================================================================ scene: static parts */
  const STAND_N = 44;
  function standLayout(V) {
    if (V._stands) return V._stands;
    const segs = [];
    for (let i = 0; i < STAND_N; i++) {
      const a0 = (i / STAND_N) * TAU, a1 = ((i + 1) / STAND_N) * TAU, am = (a0 + a1) / 2;
      let gate = false, pav = false;
      // west gate (screen-left of the batter's end), south gate behind the bowler; pavilion on the east side
      const d = (a) => Math.abs(U.angleDiff(am, a));
      if (d(Math.PI * 1.5) < 0.09 || d(0.18) < 0.07) gate = true;
      if (d(Math.PI * 0.5) < 0.42) pav = true;
      segs.push({ i, a0, a1, am, gate, pav, name: am < Math.PI * 0.25 || am > Math.PI * 1.75 ? 'SOUTH' : am < Math.PI * 0.75 ? 'EAST' : am < Math.PI * 1.25 ? 'NORTH' : 'WEST' });
    }
    return (V._stands = segs);
  }
  const TOWER_ANG = [Math.PI * 0.77, Math.PI * 1.23, Math.PI * 0.2, Math.PI * 1.8];
  function towerPos(V, i) { const p = ellR(V, TOWER_ANG[i], 36); return p; }

  function skyColors(L) {
    // L: 0 afternoon, 0.5 dusk, 1 night under lights
    if (L < 0.5) { const t = L / 0.5; return [U.mix('#4f86c6', '#2d3f7a', t), U.mix('#a9cbe8', '#e5895a', t), U.mix('#d9ecf4', '#f6c27a', t)]; }
    const t = (L - 0.5) / 0.5; return [U.mix('#2d3f7a', '#060a1c', t), U.mix('#e5895a', '#18223f', t), U.mix('#f6c27a', '#2c3658', t)];
  }
  function drawSky(ctx, c, fr, S) {
    const L = S.light;
    const hx = c.x + c.fx * 1e4, hz = c.z + c.fz * 1e4;
    const h = proj(c, hx, c.y, hz, { x: 0, y: 0 });
    const hy = h.ok ? h.y : fr.y + fr.h * 0.3;
    const [top, mid, hor] = skyColors(L);
    const gtop = Math.min(hy - 10, fr.y);
    const gr = ctx.createLinearGradient(0, gtop - fr.h * 0.6, 0, hy);
    gr.addColorStop(0, top); gr.addColorStop(0.7, mid); gr.addColorStop(1, hor);
    ctx.fillStyle = gr; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    if (L > 0.75) { // a few stars
      ctx.fillStyle = 'rgba(255,255,255,' + ((L - 0.75) * 2.4).toFixed(2) + ')';
      const r = U.rng(77);
      for (let i = 0; i < 40; i++) { const sx = fr.x + r.next() * fr.w, sy = fr.y + r.next() * Math.max(0, hy - fr.y) * 0.8; ctx.fillRect(sx, sy, 1.2, 1.2); }
    }
    S._hy = hy;
  }
  // distant Hyderabad: a ring of buildings, Naubat Pahad with the white temple, water tanks
  let SKY_RING = null;
  function skylineRing() {
    if (SKY_RING) return SKY_RING;
    const r = U.rng('cm_skyline'), pts = [];
    const n = 140;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      let h = 8 + r.next() * 14;
      if (r.next() < 0.12) h += 14 + r.next() * 18;
      const hill = Math.exp(-Math.pow(U.angleDiff(a, Math.PI * 0.62) / 0.16, 2)) * 34; // Naubat Pahad
      pts.push({ a, h: h + hill, hill: hill > 20, tank: r.next() < 0.1, lit: r.next() });
    }
    return (SKY_RING = pts);
  }
  const SKY_R = 330;
  function drawSkyline(ctx, c, V, S) {
    const pts = skylineRing(), n = pts.length, L = S.light;
    const col = L < 0.5 ? U.mix('#8fa2b8', '#5e5a7a', L * 2) : U.mix('#5e5a7a', '#141a30', (L - 0.5) * 2);
    ctx.fillStyle = col;
    const p = { x: 0, y: 0 }, q = { x: 0, y: 0 };
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < run.length; i++) { const e = run[i]; if (i) ctx.lineTo(e.tx, e.ty); else ctx.moveTo(e.tx, e.ty); }
        for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(run[i].bx, run[i].by);
        ctx.closePath(); ctx.fill();
      }
      run = [];
    };
    for (let i = 0; i <= n; i++) {
      const e = pts[i % n];
      const x = Math.sin(e.a) * SKY_R, z = V.cz + Math.cos(e.a) * SKY_R;
      proj(c, x, e.h, z, p);
      if (!p.ok) { flush(); continue; }
      proj(c, x, -2, z, q);
      // flat-topped blocks: step the outline
      if (run.length) { const prev = run[run.length - 1]; run.push({ tx: p.x, ty: prev.ty, bx: q.x, by: q.y }); }
      run.push({ tx: p.x, ty: p.y, bx: q.x, by: q.y });
    }
    flush();
    // the white temple on the hill + its flag; lit windows at night
    const ta = Math.PI * 0.62, tx = Math.sin(ta) * (SKY_R - 4), tz = V.cz + Math.cos(ta) * (SKY_R - 4);
    proj(c, tx, 44, tz, p);
    if (p.ok && p.k * 6 > 1.2) {
      const k = p.k;
      ctx.fillStyle = L > 0.6 ? '#e8e4f0' : '#f4f2ec';
      ctx.fillRect(p.x - k * 7, p.y - k * 4, k * 14, k * 6);
      ctx.beginPath(); ctx.moveTo(p.x - k * 3.5, p.y - k * 4); ctx.lineTo(p.x, p.y - k * 15); ctx.lineTo(p.x + k * 3.5, p.y - k * 4); ctx.fill();
      ctx.fillStyle = '#e07a2e'; ctx.fillRect(p.x, p.y - k * 18, k * 2.4, k * 1.3);
      if (L > 0.55) { ctx.fillStyle = 'rgba(255,230,160,' + ((L - 0.55) * 1.8).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y - k * 6, k * 9, 0, TAU); ctx.fill(); }
    }
    if (L > 0.55) {
      ctx.fillStyle = 'rgba(255,214,140,' + Math.min(0.9, (L - 0.55) * 2).toFixed(2) + ')';
      for (let i = 0; i < n; i += 2) {
        const e = pts[i];
        if (e.lit < 0.4) continue;
        const x = Math.sin(e.a) * (SKY_R - 1), z = V.cz + Math.cos(e.a) * (SKY_R - 1);
        proj(c, x, e.h * (0.3 + e.lit * 0.4), z, p);
        if (p.ok) ctx.fillRect(p.x, p.y, Math.max(1, p.k * 1.4), Math.max(1, p.k * 1.4));
      }
    }
  }

  function towerTop(V, i) { const p = towerPos(V, i); return { x: p.x, y: 46, z: p.z }; }
  function drawTowers(ctx, c, V, S) {
    const on = S.light > 0.28 || S.lightsOn;
    const p = { x: 0, y: 0, k: 0 }, q = { x: 0, y: 0, k: 0 };
    for (let i = 0; i < 4; i++) {
      const t = towerPos(V, i);
      proj(c, t.x, 0, t.z, p); proj(c, t.x, 42, t.z, q);
      if (!p.ok || !q.ok) continue;
      if (q.x < c.cx - c.f * 2 || q.x > c.cx + c.f * 2) continue;
      const wb = p.k * 4.2, wt = q.k * 1.6;
      // lattice legs + cross bracing
      ctx.strokeStyle = S.light > 0.6 ? '#3a3e4a' : '#6e737c';
      ctx.lineWidth = Math.max(0.8, q.k * 0.35);
      ctx.beginPath();
      ctx.moveTo(p.x - wb, p.y); ctx.lineTo(q.x - wt, q.y); ctx.moveTo(p.x + wb, p.y); ctx.lineTo(q.x + wt, q.y);
      const steps = 10;
      for (let s = 0; s < steps; s++) {
        const u0 = s / steps, u1 = (s + 1) / steps;
        const xl0 = lerp(p.x - wb, q.x - wt, u0), xr0 = lerp(p.x + wb, q.x + wt, u0), y0 = lerp(p.y, q.y, u0);
        const xl1 = lerp(p.x - wb, q.x - wt, u1), xr1 = lerp(p.x + wb, q.x + wt, u1), y1 = lerp(p.y, q.y, u1);
        ctx.moveTo(xl0, y0); ctx.lineTo(xr1, y1); ctx.moveTo(xr0, y0); ctx.lineTo(xl1, y1); ctx.moveTo(xl1, y1); ctx.lineTo(xr1, y1);
      }
      ctx.stroke();
      // lamp bank (faces the field): frame + 4 x 6 lamps
      const bw = q.k * 9, bh = q.k * 6, bx = q.x - bw / 2, by = q.y - bh;
      ctx.fillStyle = '#2a2d36'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = on ? '#fffef2' : '#b9bec6';
      const lw = bw / 6, lh = bh / 4;
      for (let a = 0; a < 6; a++) for (let b = 0; b < 4; b++) ctx.fillRect(bx + a * lw + lw * 0.15, by + b * lh + lh * 0.15, lw * 0.7, lh * 0.7);
      if (on) {
        const R = Math.max(bw, bh) * (1.6 + S.light * 1.6);
        const gr = ctx.createRadialGradient(q.x, by + bh / 2, 0, q.x, by + bh / 2, R);
        gr.addColorStop(0, 'rgba(255,255,240,0.95)'); gr.addColorStop(0.25, 'rgba(255,250,220,0.45)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr;
        ctx.fillRect(q.x - R, by + bh / 2 - R, R * 2, R * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function drawStands(ctx, c, V, S, celebrate) {
    const segs = standLayout(V);
    const T0 = crowdTex(0, V.crowd), T1 = crowdTex(1, V.crowd);
    const order = S._segOrder || (S._segOrder = segs.slice());
    for (const s of order) { const m = ellR(V, s.am, 18); s.d = depth(c, m.x, 6, m.z); }
    order.sort((a, b) => b.d - a.d);
    const L = S.light;
    const conc = L < 0.5 ? '#b8b2a6' : U.mix('#b8b2a6', '#6a6e7c', (L - 0.5) * 1.6);
    const concD = U.shade(conc, 0.78), concL = U.shade(conc, 1.08);
    const R0 = 9, R1 = 19, R2 = 21, R3 = 32;
    const nightA = clamp((L - 0.5) / 0.5, 0, 1) * 0.42; // the stands sit outside the floodlights' pool
    const H0 = 1.6, H1 = 7.5, H2 = 8.6, H3 = 17;
    const wave = S.clock || 0;
    for (const s of order) {
      if (s.d < -20) continue;
      const a0 = s.a0, a1 = s.a1;
      const sx0 = Math.sin(a0), cz0 = Math.cos(a0), sx1 = Math.sin(a1), cz1 = Math.cos(a1);
      const X = (sx, r) => sx * (V.rx + r), Z = (cz, r) => V.cz + cz * (V.rz + r);
      if (s.gate) {
        // gate: two pillars + lintel sign, the track continues under it
        ctx.fillStyle = concD;
        for (const [sx, cz] of [[sx0, cz0], [sx1, cz1]]) {
          if (quadPath(ctx, c, X(sx, R0), 0, Z(cz, R0), X(sx, R0), 9.5, Z(cz, R0), X(sx, R3), 9.5, Z(cz, R3), X(sx, R3), 0, Z(cz, R3))) ctx.fill();
        }
        ctx.fillStyle = '#7a2f35';
        if (quadPath(ctx, c, X(sx0, R0), 7, Z(cz0, R0), X(sx1, R0), 7, Z(cz1, R0), X(sx1, R0), 9.5, Z(cz1, R0), X(sx0, R0), 9.5, Z(cz0, R0))) ctx.fill();
        continue;
      }
      // back wall + rim
      ctx.fillStyle = concD;
      if (quadPath(ctx, c, X(sx0, R3), H3, Z(cz0, R3), X(sx1, R3), H3, Z(cz1, R3), X(sx1, R3), H3 + 2.4, Z(cz1, R3), X(sx0, R3), H3 + 2.4, Z(cz0, R3))) ctx.fill();
      // upper tier crowd
      const tex = celebrate > 0 || (S.waveOn && Math.sin(s.am * 3 - wave * 5) > 0.55) ? T1 : T0;
      const u0 = (s.i * 128) % 1024;
      ctx.fillStyle = conc;
      if (quadPath(ctx, c, X(sx0, R2), H2, Z(cz0, R2), X(sx1, R2), H2, Z(cz1, R2), X(sx1, R3), H3, Z(cz1, R3), X(sx0, R3), H3, Z(cz0, R3))) ctx.fill();
      texQuad(ctx, c, tex, u0, 0, 128, 128, X(sx1, R3), H3, Z(cz1, R3), X(sx0, R3), H3, Z(cz0, R3), X(sx1, R2), H2, Z(cz1, R2));
      resetT(ctx);
      if (nightA > 0.02) { ctx.fillStyle = 'rgba(8,10,28,' + (nightA * 1.1).toFixed(3) + ')'; if (quadPath(ctx, c, X(sx0, R2), H2, Z(cz0, R2), X(sx1, R2), H2, Z(cz1, R2), X(sx1, R3), H3, Z(cz1, R3), X(sx0, R3), H3, Z(cz0, R3))) ctx.fill(); }
      // walkway wall between tiers
      ctx.fillStyle = s.pav ? '#e8e2d2' : concL;
      if (quadPath(ctx, c, X(sx0, R1), H1, Z(cz0, R1), X(sx1, R1), H1, Z(cz1, R1), X(sx1, R2), H2, Z(cz1, R2), X(sx0, R2), H2, Z(cz0, R2))) ctx.fill();
      // lower tier crowd
      ctx.fillStyle = conc;
      if (quadPath(ctx, c, X(sx0, R0), H0, Z(cz0, R0), X(sx1, R0), H0, Z(cz1, R0), X(sx1, R1), H1, Z(cz1, R1), X(sx0, R1), H1, Z(cz0, R1))) ctx.fill();
      texQuad(ctx, c, tex, (u0 + 384) % 1024, 0, 128, 128, X(sx1, R1), H1, Z(cz1, R1), X(sx0, R1), H1, Z(cz0, R1), X(sx1, R0), H0, Z(cz1, R0));
      resetT(ctx);
      if (nightA > 0.02) { ctx.fillStyle = 'rgba(8,10,28,' + (nightA * 0.8).toFixed(3) + ')'; if (quadPath(ctx, c, X(sx0, R0), H0, Z(cz0, R0), X(sx1, R0), H0, Z(cz1, R0), X(sx1, R1), H1, Z(cz1, R1), X(sx0, R1), H1, Z(cz0, R1))) ctx.fill(); }
      // front wall, painted stripe
      ctx.fillStyle = s.pav ? '#2a8c82' : (s.i % 2 ? '#d8cfbd' : '#cfc6b3');
      if (quadPath(ctx, c, X(sx0, R0), 0, Z(cz0, R0), X(sx1, R0), 0, Z(cz1, R0), X(sx1, R0), H0, Z(cz1, R0), X(sx0, R0), H0, Z(cz0, R0))) ctx.fill();
      // pavilion canopy (members' stand) on thin columns
      if (s.pav) {
        ctx.fillStyle = L > 0.5 ? '#3a3e4c' : '#5c6470';
        if (quadPath(ctx, c, X(sx0, R1 - 2), H3 + 4.5, Z(cz0, R1 - 2), X(sx1, R1 - 2), H3 + 4.5, Z(cz1, R1 - 2), X(sx1, R3 + 1), H3 + 6.5, Z(cz1, R3 + 1), X(sx0, R3 + 1), H3 + 6.5, Z(cz0, R3 + 1))) ctx.fill();
        ctx.fillStyle = '#f2c230';
        if (quadPath(ctx, c, X(sx0, R1 - 2), H3 + 3.6, Z(cz0, R1 - 2), X(sx1, R1 - 2), H3 + 3.6, Z(cz1, R1 - 2), X(sx1, R1 - 2), H3 + 4.6, Z(cz1, R1 - 2), X(sx0, R1 - 2), H3 + 4.6, Z(cz0, R1 - 2))) ctx.fill();
        ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1; ctx.beginPath();
        segment(ctx, c, X(sx0, R1 - 1.5), H1, Z(cz0, R1 - 1.5), X(sx0, R1 - 1.5), H3 + 4, Z(cz0, R1 - 1.5));
        ctx.stroke();
      }
    }
  }

  // ground: outer apron, athletics track (LB Stadium is a multi-sport ground), field, stripes, circles, rope
  const ELL = new Float64Array(3 * 96);
  function ellipsePts(V, m, y, n) {
    n = n || 64;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; ELL[i * 3] = Math.sin(a) * (V.rx + m); ELL[i * 3 + 1] = y || 0; ELL[i * 3 + 2] = V.cz + Math.cos(a) * (V.rz + m); }
    return n;
  }
  function strokeEllipse(ctx, c, V, m, n) {
    n = n || 72;
    ctx.beginPath();
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, x = Math.sin(a) * (V.rx + m), z = V.cz + Math.cos(a) * (V.rz + m);
      if (prev) segment(ctx, c, prev[0], 0.02, prev[1], x, 0.02, z);
      prev = [x, z];
    }
  }
  function lightMul(S, col) {
    const L = S.light;
    if (L < 0.3) return col;
    if (L < 0.6) return U.mix(col, U.shade(col, 0.82), (L - 0.3) / 0.3);
    return U.mix(U.shade(col, 0.82), U.shade(col, 0.95), (L - 0.6) / 0.4); // floodlit: bright, slightly cool
  }
  function drawGround(ctx, c, V, S) {
    // base (everything inside the stands)
    ctx.fillStyle = lightMul(S, V.apron);
    let n = ellipsePts(V, 12, -0.01, 64);
    if (polyPath(ctx, c, ELL, n)) ctx.fill();
    if (!V.gully) {
      ctx.fillStyle = lightMul(S, '#a85a3a');
      n = ellipsePts(V, 8.5, -0.005, 64); if (polyPath(ctx, c, ELL, n)) ctx.fill();
      ctx.fillStyle = lightMul(S, V.apron);
      n = ellipsePts(V, 3.2, 0, 64); if (polyPath(ctx, c, ELL, n)) ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
      strokeEllipse(ctx, c, V, 5.2, 64); ctx.stroke();
      strokeEllipse(ctx, c, V, 6.9, 64); ctx.stroke();
    }
    // field
    ctx.fillStyle = lightMul(S, V.grass);
    n = ellipsePts(V, 0, 0, 72); if (polyPath(ctx, c, ELL, n)) ctx.fill();
    // mowing stripes (bands across the field)
    ctx.fillStyle = lightMul(S, V.grass2);
    const band = V.gully ? 6 : 7.5;
    const B = new Float64Array(3 * 24);
    for (let z0 = V.cz - V.rz; z0 < V.cz + V.rz; z0 += band * 2) {
      const z1 = Math.min(V.cz + V.rz, z0 + band);
      let k = 0;
      for (let s = 0; s <= 5; s++) { const z = lerp(z0, z1, s / 5), u = (z - V.cz) / V.rz, x = V.rx * Math.sqrt(Math.max(0, 1 - u * u)); B[k++] = x; B[k++] = 0.003; B[k++] = z; }
      for (let s = 5; s >= 0; s--) { const z = lerp(z0, z1, s / 5), u = (z - V.cz) / V.rz, x = -V.rx * Math.sqrt(Math.max(0, 1 - u * u)); B[k++] = x; B[k++] = 0.003; B[k++] = z; }
      if (polyPath(ctx, c, B, k / 3)) ctx.fill();
    }
    if (V.gully) { // bald patches + a few tufts on the colony ground
      const r = U.rng('cm_gully_patch');
      ctx.fillStyle = 'rgba(120,96,70,0.35)';
      for (let i = 0; i < 14; i++) {
        const x = (r.next() - 0.5) * V.rx * 1.5, z = V.cz + (r.next() - 0.5) * V.rz * 1.5;
        const n2 = 8; const Pp = new Float64Array(n2 * 3);
        for (let j = 0; j < n2; j++) { const a = (j / n2) * TAU; Pp[j * 3] = x + Math.cos(a) * (2 + r.next() * 2); Pp[j * 3 + 1] = 0.004; Pp[j * 3 + 2] = z + Math.sin(a) * (1.5 + r.next() * 2); }
        if (polyPath(ctx, c, Pp, n2)) ctx.fill();
      }
    }
    // the inner circle (two half circles round each set of stumps, joined)
    const ir = V.gully ? 12 : 23;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, 1.2 * (S.frH || 400) / 600);
    ctx.setLineDash([6, 6]); ctx.beginPath();
    let prev = null;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU, s = Math.sin(a), co = Math.cos(a);
      const z = co > 0 ? PITCH + co * ir : co * ir, x = s * ir;
      if (prev) segment(ctx, c, prev[0], 0.01, prev[1], x, 0.01, z);
      prev = [x, z];
    }
    ctx.stroke(); ctx.setLineDash([]);
    // the rope
    ctx.strokeStyle = V.gully ? 'rgba(255,255,255,0.75)' : '#f2e6c8';
    ctx.lineWidth = Math.max(1.2, 2 * (S.frH || 400) / 600);
    strokeEllipse(ctx, c, V, 0, 96); ctx.stroke();
  }
  function drawBoards(ctx, c, V, S) {
    if (V.gully) return;
    const T = adsTex(), n = 64, m = 1.6, h = 1.0;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      const x0 = Math.sin(a0) * (V.rx + m), z0 = V.cz + Math.cos(a0) * (V.rz + m), x1 = Math.sin(a1) * (V.rx + m), z1 = V.cz + Math.cos(a1) * (V.rz + m);
      const u = (31 - (i % 32)) * 32;
      // boards face the field: seen from inside the ground, a growing angle moves left on screen.
      // From outside (fly-overs) we see their plain backs.
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if ((c.x - mx) * (-mx) + (c.z - mz) * (V.cz - mz) < 0) { resetT(ctx); ctx.fillStyle = '#3a3e48'; if (quadPath(ctx, c, x0, 0, z0, x1, 0, z1, x1, h, z1, x0, h, z0)) ctx.fill(); continue; }
      texQuad(ctx, c, T, u, 0, 32, 32, x1, h, z1, x0, h, z0, x1, 0, z1);
    }
    resetT(ctx);
    if (S.light > 0.45) { // floodlit boards glow a little
      ctx.globalAlpha = 0; ctx.globalAlpha = 1;
    }
  }
  function drawSightScreens(ctx, c, V, S) {
    // white-ball cricket under lights: the sight screens are black
    const w = V.gully ? 0 : 4.2, hh = 4.2;
    if (!w) return;
    for (const end of [-1, 1]) {
      const z = end < 0 ? V.cz - V.rz - 2.6 : V.cz + V.rz + 2.6;
      ctx.fillStyle = '#16181e';
      if (quadPath(ctx, c, -w, 0.5, z, w, 0.5, z, w, hh, z, -w, hh, z)) ctx.fill();
      ctx.fillStyle = '#3a3e48';
      if (quadPath(ctx, c, -w, hh, z, w, hh, z, w, hh + 0.25, z, -w, hh + 0.25, z)) ctx.fill();
      ctx.fillStyle = '#5a5e66';
      if (quadPath(ctx, c, -w, 0, z, w, 0, z, w, 0.5, z, -w, 0.5, z)) ctx.fill();
    }
  }
  // pitch strip, footmarks, creases (static), stumps are dynamic
  function drawPitch(ctx, c, V, S) {
    ctx.fillStyle = lightMul(S, V.pitch);
    if (quadPath(ctx, c, -1.52, 0.006, -1.8, 1.52, 0.006, -1.8, 1.52, 0.006, PITCH + 1.8, -1.52, 0.006, PITCH + 1.8)) ctx.fill();
    ctx.fillStyle = 'rgba(120,96,60,0.28)';
    for (const z of [0.4, PITCH - 0.4]) { if (quadPath(ctx, c, -1.2, 0.008, z - 1.4, 1.2, 0.008, z - 1.4, 1.2, 0.008, z + 1.4, -1.2, 0.008, z + 1.4)) ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    if (quadPath(ctx, c, -0.6, 0.007, 4, 0.6, 0.007, 4, 0.6, 0.007, PITCH - 4, -0.6, 0.007, PITCH - 4)) ctx.fill();
    // creases
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1, 1.1 * (S.frH || 400) / 500);
    ctx.beginPath();
    for (const [z0, dir] of [[0, 1], [PITCH, -1]]) {
      const pz = z0 + dir * CREASE;
      segment(ctx, c, -1.83, 0.012, pz, 1.83, 0.012, pz);    // popping crease
      segment(ctx, c, -1.32, 0.012, z0, 1.32, 0.012, z0);     // bowling crease
      for (const x of [-1.32, 1.32]) segment(ctx, c, x, 0.012, z0 - dir * 1.2, x, 0.012, pz); // return creases
      for (const x of [-WIDE_X, WIDE_X]) segment(ctx, c, x, 0.012, pz - dir * 0.15, x, 0.012, pz + dir * 0.25); // wide guides
    }
    ctx.stroke();
  }

  // the gully skin: houses, a compound wall, the water tank, a neem tree, kids on the wall
  let HOUSES = null;
  function gullyHouses(V) {
    if (HOUSES) return HOUSES;
    const r = U.rng('cm_houses'), out = [];
    const cols = ['#e8c7b0', '#d9cbb0', '#c9a2b8', '#bcd3c4', '#efe6d2', '#e2b07a', '#c7b9d6', '#b8d0e0'];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + r.next() * 0.08;
      const near = a > Math.PI * 1.15 && a < Math.PI * 1.85; // the off side: houses close to the ground ("Aunty's")
      const d = near ? 6 : 12 + r.next() * 8;
      const p = ellR(V, a, d);
      out.push({ a, x: p.x, z: p.z, w: 7 + r.next() * 5, dd: 6 + r.next() * 4, h: 5 + ((r.next() * 3) | 0) * 3.2, col: cols[(r.next() * cols.length) | 0], aunty: near, tank: r.next() < 0.5, win: r.next() });
    }
    return (HOUSES = out);
  }
  function drawGully(ctx, c, V, S) {
    const hs = gullyHouses(V);
    for (const h of hs) h.dd2 = depth(c, h.x, 3, h.z);
    const order = hs.slice().sort((a, b) => b.dd2 - a.dd2);
    const L = S.light;
    for (const h of order) {
      if (h.dd2 < -10) continue;
      const ang = Math.atan2(h.x, h.z - V.cz);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      // a box facing the field
      const hw = h.w / 2, hd = h.dd / 2;
      const corner = (u, v) => [h.x + ca * u * hw + sa * v * hd, h.z - sa * u * hw + ca * v * hd];
      const [ax, az] = corner(-1, -1), [bx, bz] = corner(1, -1), [cx2, cz2] = corner(1, 1), [dx, dz] = corner(-1, 1);
      const wall = L > 0.5 ? U.shade(h.col, 0.6) : h.col;
      // side walls first, then the front, then the roof parapet
      ctx.fillStyle = U.shade(wall, 0.8);
      if (quadPath(ctx, c, bx, 0, bz, cx2, 0, cz2, cx2, h.h, cz2, bx, h.h, bz)) ctx.fill();
      if (quadPath(ctx, c, ax, 0, az, dx, 0, dz, dx, h.h, dz, ax, h.h, az)) ctx.fill();
      ctx.fillStyle = wall;
      if (quadPath(ctx, c, ax, 0, az, bx, 0, bz, bx, h.h, bz, ax, h.h, az)) ctx.fill();
      ctx.fillStyle = U.shade(wall, 1.1);
      if (quadPath(ctx, c, ax, h.h, az, bx, h.h, bz, cx2, h.h, cz2, dx, h.h, dz)) ctx.fill();
      // windows + a door + a balcony line
      const floors = Math.round(h.h / 3.2);
      for (let f = 0; f < floors; f++) for (let w = 0; w < 2; w++) {
        const u0 = -0.6 + w * 0.75, u1 = u0 + 0.38, y0 = 1 + f * 3.2, y1 = y0 + 1.4;
        const p0 = corner(u0, -1.01), p1 = corner(u1, -1.01);
        ctx.fillStyle = L > 0.55 && (h.win * 10 + f + w) % 3 < 2 ? '#ffd88a' : '#3a2a30';
        if (quadPath(ctx, c, p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1, p1[1], p0[0], y1, p0[1])) ctx.fill();
      }
      if (h.tank) { // black water tank on the roof
        const t0 = corner(0.2, 0), t1 = corner(0.6, 0);
        ctx.fillStyle = '#26222a';
        if (quadPath(ctx, c, t0[0], h.h, t0[1], t1[0], h.h, t1[1], t1[0], h.h + 1.8, t1[1], t0[0], h.h + 1.8, t0[1])) ctx.fill();
      }
      if (h.aunty) { // compound wall in front of the off-side houses
        const w0 = corner(-1.1, -1.6), w1 = corner(1.1, -1.6);
        ctx.fillStyle = '#d8c9ae';
        if (quadPath(ctx, c, w0[0], 0, w0[1], w1[0], 0, w1[1], w1[0], 1.6, w1[1], w0[0], 1.6, w0[1])) ctx.fill();
      }
    }
    // a big neem tree beyond long-on
    const tp = ellR(V, Math.PI * 0.15, 5), p = { x: 0, y: 0, k: 0 };
    proj(c, tp.x, 0, tp.z, p);
    if (p.ok) {
      const k = p.k;
      ctx.fillStyle = '#5a4030'; ctx.fillRect(p.x - k * 0.4, p.y - k * 4.5, k * 0.8, k * 4.5);
      for (const [bx, by, br] of [[0, 6.5, 3.2], [-2.2, 5.6, 2.4], [2.3, 5.8, 2.6], [0.6, 8.4, 2.4]]) { ctx.fillStyle = L > 0.5 ? '#24361c' : '#3f6a30'; ctx.beginPath(); ctx.arc(p.x + bx * k, p.y - by * k, br * k, 0, TAU); ctx.fill(); }
    }
  }

  /* ================================================================ people (a painted cricketer rig) */
  // drawPerson(ctx, X, Y, hp, o): X,Y = feet on screen, hp = height in px. Units: 100 = feet to crown.
  // o: {kit:{shirt,trim,pants,cap,num}, look, view 'front'|'back'|'side', flip ±1, pose, ph, u (pose progress),
  //     bat (bool) + batAng + hand:[x,y], pads, helmet, gloves 'bat'|'keep', ump, signal, num, jump}
  function limb(ctx, ax, ay, bx, by, cx, cy, w1, w2, c1, c2) {
    ctx.strokeStyle = c1; ctx.lineWidth = w1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = c2; ctx.lineWidth = w2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke();
  }
  function elbow(sx, sy, hx, hy, len, bend) {
    const dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 1;
    const out = Math.max(0, (len - d) * 0.5);
    return [(sx + hx) / 2 - (dy / d) * out * bend, (sy + hy) / 2 + (dx / d) * out * bend];
  }
  function drawPerson(ctx, X, Y, hp, o) {
    if (!(hp > 1.2)) return;
    const kit = o.kit, look = o.look || {};
    const skin = look.skin || '#b97a4f';
    const shirt = kit.shirt, pants = kit.pants;
    if (hp < 10) { // far away: a little painted peg
      const w = Math.max(1, hp * 0.26);
      ctx.fillStyle = pants; ctx.fillRect(X - w * 0.45, Y - hp * 0.45, w * 0.9, hp * 0.45);
      ctx.fillStyle = shirt; ctx.fillRect(X - w / 2, Y - hp * 0.78, w, hp * 0.36);
      ctx.fillStyle = o.helmet ? '#1d2a4a' : o.ump ? '#f4f2ea' : kit.cap || skin; ctx.fillRect(X - w * 0.35, Y - hp, w * 0.7, hp * 0.22);
      if (o.bat) { ctx.fillStyle = '#d9b77a'; ctx.fillRect(X - w * 0.9, Y - hp * 0.5, Math.max(1, w * 0.3), hp * 0.45); }
      return;
    }
    const s = hp / 100, view = o.view || 'front', side = view === 'side';
    const flip = side ? (o.flip || 1) : 1;
    const pose = o.pose || 'stand', ph = o.ph || 0, u = o.u || 0;
    ctx.save();
    ctx.translate(X, Y - (o.jump || 0) * s);
    ctx.scale(s * flip, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // --- rig
    let hipY = -46, neckX = 0, neckY = -78, lean = 0;
    let fL = [-7, 0], fR = [7, 0], kL = [-7, -23], kR = [7, -23];
    let hL = [-17, -46], hR = [17, -46];
    const R = view === 'front' ? -1 : 1; // screen side of the RIGHT hand
    if (pose === 'run' || pose === 'walk') {
      const amp = pose === 'run' ? 1 : 0.45, sn = Math.sin(ph), bob = Math.abs(Math.sin(ph)) * 3 * amp;
      hipY -= bob; neckY -= bob;
      if (side) {
        fL = [sn * 17 * amp, -Math.max(0, -sn) * 9 * amp]; fR = [-sn * 17 * amp, -Math.max(0, sn) * 9 * amp];
        kL = [fL[0] * 0.5 + 5 * amp, -24 - bob]; kR = [fR[0] * 0.5 + 5 * amp, -24 - bob];
        neckX = 5 * amp; lean = 0.12 * amp;
        hL = [-sn * 15 * amp + 4, -50 - bob]; hR = [sn * 15 * amp + 4, -50 - bob];
      } else {
        fL = [-6, -Math.max(0, sn) * 13 * amp]; fR = [6, -Math.max(0, -sn) * 13 * amp];
        kL = [-7, -24 - Math.max(0, sn) * 8 * amp]; kR = [7, -24 - Math.max(0, -sn) * 8 * amp];
        hL = [-16, -52 + sn * 7 * amp]; hR = [16, -52 - sn * 7 * amp];
      }
    } else if (pose === 'crouch') {
      hipY = -38; neckY = -68; kL = [-11, -19]; kR = [11, -19]; fL = [-9, 0]; fR = [9, 0];
      hL = [-11, -27]; hR = [11, -27];
    } else if (pose === 'keep') {
      hipY = -27; neckY = -55; kL = [-15, -15]; kR = [15, -15]; fL = [-11, 0]; fR = [11, 0];
      const up = o.u || 0; hL = [-5, -34 - up * 30]; hR = [5, -34 - up * 30];
    } else if (pose === 'bowl') {
      // u: 0..1 through the delivery stride (release ~0.55)
      const st = Math.sin(clamp(u, 0, 1) * Math.PI);
      fL = side ? [12 + st * 8, 0] : [-6, -st * 10]; fR = side ? [-14, 0] : [7, 0];
      kL = side ? [10 + st * 4, -24] : [-7, -26 - st * 6]; kR = side ? [-9, -22] : [7, -23];
      neckX = side ? 4 + st * 4 : 0; lean = side ? 0.1 + st * 0.15 : 0;
      // bowling (right) arm windmill: angle from straight up
      const th = u < 0.3 ? lerp(Math.PI * 0.85, Math.PI * 0.45, u / 0.3) : u < 0.62 ? lerp(Math.PI * 0.45, -0.15, (u - 0.3) / 0.32) : lerp(-0.15, -Math.PI * 0.85, Math.min(1, (u - 0.62) / 0.38));
      const fa = u < 0.45 ? lerp(Math.PI, 0.1, u / 0.45) : lerp(0.1, Math.PI * 0.9, Math.min(1, (u - 0.45) / 0.35)); // front arm
      const Lr = 31;
      if (side) { hR = [Math.sin(th) * Lr, neckY + 3 - Math.cos(th) * Lr]; hL = [Math.sin(fa) * 26, neckY + 3 - Math.cos(fa) * 26]; }
      else { hR = [R * (14 + Math.sin(th) * 7), neckY + 3 - Math.cos(th) * Lr]; hL = [-R * (14 + Math.sin(fa) * 6), neckY + 3 - Math.cos(fa) * 26]; }
    } else if (pose === 'catch') { hL = [-6, -114]; hR = [6, -114]; }
    else if (pose === 'celebrate') { const w = Math.sin(ph * 2) * 4; hL = [-24 - w, -110]; hR = [24 + w, -110]; }
    else if (pose === 'appeal') { hL = [-12, -104]; hR = [14, -112]; }
    else if (pose === 'throw') {
      const th = lerp(-2.2, 0.9, clamp(u, 0, 1));
      if (side) hR = [Math.sin(th) * 30, neckY + 3 - Math.cos(th) * 30]; else hR = [R * 16, neckY + 3 - Math.cos(th) * 28];
      fL = side ? [12, 0] : fL; kL = side ? [9, -24] : kL;
    } else if (pose === 'signal') {
      const sg = o.signal;
      if (sg === 'out') { hR = [R * 8, -122]; hL = [-R * 15, -50]; }
      else if (sg === 'six') { hL = [-10, -124]; hR = [10, -124]; }
      else if (sg === 'wide') { hL = [-44, -76]; hR = [44, -76]; }
      else if (sg === 'nb') { hR = [R * 44, -76]; hL = [-R * 15, -48]; }
      else if (sg === 'four') { const w = Math.sin((o.t || 0) * 9); hR = [R * (10 + w * 30), -62]; hL = [-R * 15, -48]; }
      else { hL = [-6, -52]; hR = [6, -52]; }
    } else if (pose === 'stand' && o.ump) { hL = [-5, -52]; hR = [5, -52]; }
    if (o.batPose) { hipY = -43; neckY = -75; kL = [-8, -21]; kR = [8, -21]; hL = o.hand ? [o.hand[0] - 2, o.hand[1]] : hL; hR = o.hand ? [o.hand[0] + 2, o.hand[1] + 3] : hR; }
    // --- draw
    const sh = shirt, sk = skin;
    const legW = 10.5, padOn = o.pads;
    const legs = () => {
      for (const [k, f, far] of [[kL, fL, true], [kR, fR, false]]) {
        const hx = k === kL ? -5 : 5;
        const col = side && far ? U.shade(pants, 0.8) : pants;
        limb(ctx, hx, hipY, k[0], k[1], f[0], f[1] - 3, legW, legW - 1, col, col);
        if (padOn) {
          ctx.strokeStyle = side && far ? '#d9d6cc' : '#f4f2ea'; ctx.lineWidth = 12.5;
          ctx.beginPath(); ctx.moveTo(lerp(k[0], hx, 0.25), lerp(k[1], hipY, 0.25)); ctx.lineTo(f[0], f[1] - 4); ctx.stroke();
          if (hp > 40) { ctx.strokeStyle = 'rgba(120,120,110,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(k[0] - 2.5, k[1]); ctx.lineTo(f[0] - 2.5, f[1] - 5); ctx.moveTo(k[0] + 2.5, k[1]); ctx.lineTo(f[0] + 2.5, f[1] - 5); ctx.stroke(); }
        }
        ctx.fillStyle = o.ump ? '#1a1214' : '#f2f0ea';
        ctx.beginPath(); ctx.ellipse(f[0] + (side ? 3 : 0), f[1] - 2, side ? 7 : 5.5, 3.4, 0, 0, TAU); ctx.fill();
      }
    };
    const torso = () => {
      ctx.save();
      if (lean) { ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY); }
      const sw = side ? 9 : 15.5, hw = side ? 8 : 11.5;
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.moveTo(neckX - sw, neckY + 1); ctx.lineTo(neckX + sw, neckY + 1); ctx.lineTo(hw, hipY + 3); ctx.lineTo(-hw, hipY + 3); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = sh; ctx.stroke();
      if (o.ump) { ctx.fillStyle = '#e8e6de'; ctx.fillRect(-hw, hipY - 4, hw * 2, 7); }
      else {
        ctx.strokeStyle = kit.trim; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(neckX - sw + 1, neckY + 6); ctx.lineTo(neckX + sw - 1, neckY + 6); ctx.stroke();
        if (view === 'front') { ctx.beginPath(); ctx.moveTo(neckX - 4, neckY + 1); ctx.lineTo(neckX, neckY + 7); ctx.lineTo(neckX + 4, neckY + 1); ctx.stroke(); }
        if (view === 'back' && hp > 36 && o.num) { ctx.fillStyle = kit.num || kit.trim; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(o.num), neckX, (neckY + hipY) / 2 + 2); }
      }
      ctx.restore();
    };
    const arm = (h, which) => {
      const shX = neckX + (side ? (which === 'R' ? 2 : -2) : which === 'R' ? R * 14 : -R * 14), shY = neckY + 4;
      const e = elbow(shX, shY, h[0], h[1], 31, which === 'R' ? R : -R);
      const far = side && which === 'L';
      limb(ctx, shX, shY, e[0], e[1], h[0], h[1], 7.5, 6, far ? U.shade(sh, 0.82) : sh, far ? U.shade(sk, 0.85) : sk);
      if (o.gloves) { ctx.fillStyle = o.gloves === 'keep' ? '#c8a060' : '#f4f2ea'; ctx.beginPath(); ctx.arc(h[0], h[1], o.gloves === 'keep' ? 6.5 : 5, 0, TAU); ctx.fill(); if (o.gloves === 'keep') { ctx.strokeStyle = '#8a6030'; ctx.lineWidth = 1.4; ctx.stroke(); } }
      else { ctx.fillStyle = sk; ctx.beginPath(); ctx.arc(h[0], h[1], 3.6, 0, TAU); ctx.fill(); }
    };
    const head = () => {
      const hx = neckX + (lean ? lean * 30 : 0), hy = neckY - 11;
      const r = look.small ? 12.5 : 11.5;
      if (look.plaits && view !== 'front') { ctx.strokeStyle = look.hair || '#1a1412'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hx - 7, hy + 4); ctx.lineTo(hx - 9, hy + 20); ctx.moveTo(hx + 7, hy + 4); ctx.lineTo(hx + 9, hy + 20); ctx.stroke(); ctx.fillStyle = '#d8402a'; ctx.fillRect(hx - 11, hy + 17, 4, 3); ctx.fillRect(hx + 7, hy + 17, 4, 3); }
      ctx.fillStyle = sk; ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.fill();
      const hair = look.hair || '#1a1412';
      if (o.helmet) {
        ctx.fillStyle = '#1d2a4a'; ctx.beginPath(); ctx.arc(hx, hy - 1.5, r + 2.2, Math.PI * 0.98, Math.PI * 2.02); ctx.fill();
        ctx.fillRect(hx - r - 2, hy - 2, (r + 2) * 2, 4);
        if (view === 'front') { ctx.strokeStyle = '#c9ccd2'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(hx - r + 2, hy + 3 + i * 3.6); ctx.lineTo(hx + r - 2, hy + 3 + i * 3.6); } ctx.moveTo(hx, hy + 1); ctx.lineTo(hx, hy + 11); ctx.stroke(); }
        else if (side) { ctx.strokeStyle = '#c9ccd2'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(hx + 5, hy + 4, 8, -0.9, 1.2); ctx.stroke(); }
      } else if (o.ump) {
        ctx.fillStyle = '#f4f2ea'; ctx.beginPath(); ctx.ellipse(hx, hy - 5, r + 7, 3.4, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(hx, hy - 6, r - 1, Math.PI, TAU); ctx.fill();
        ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hx - r + 1, hy - 6); ctx.lineTo(hx + r - 1, hy - 6); ctx.stroke();
      } else {
        const cap = look.cap || kit.cap;
        if (look.puff) { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx, hy - 6, r + 3, Math.PI, TAU); ctx.fill(); }
        if (look.ponytails) { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx - 11, hy - 10, 4.5, 0, TAU); ctx.arc(hx + 11, hy - 10, 4.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#d8402a'; ctx.fillRect(hx - 9, hy - 9, 3, 3); ctx.fillRect(hx + 7, hy - 9, 3, 3); }
        if (o.noCap || look.ponytails || look.puff) {
          ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx, hy - 1, r + 0.6, Math.PI * (view === 'back' ? 0.8 : 1.02), Math.PI * (view === 'back' ? 2.2 : 1.98)); ctx.fill();
          if (look.spiky) { ctx.beginPath(); ctx.moveTo(hx - 8, hy - 9); ctx.lineTo(hx - 4, hy - 17); ctx.lineTo(hx - 1, hy - 10); ctx.lineTo(hx + 3, hy - 18); ctx.lineTo(hx + 6, hy - 9); ctx.fill(); }
        } else {
          ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(hx, hy - 2, r + 0.8, Math.PI, TAU); ctx.fill();
          ctx.fillRect(hx - r - 0.8, hy - 3, (r + 0.8) * 2, 2.5);
          if (view === 'back') { ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(hx, hy + 1, r - 0.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.fill(); }
          if (side) { ctx.fillStyle = U.shade(cap, 0.8); ctx.beginPath(); ctx.ellipse(hx + r + 3, hy - 1.5, 7, 2.2, 0.08, 0, TAU); ctx.fill(); }
          else if (view === 'front' && !look.capBack) { ctx.fillStyle = U.shade(cap, 0.75); ctx.beginPath(); ctx.ellipse(hx, hy - 0.5, r + 1.5, 3.2, 0, 0, Math.PI); ctx.fill(); }
        }
      }
      if (view === 'front' && hp > 30 && !o.helmet) {
        ctx.fillStyle = '#1a1214';
        if (look.shades) ctx.fillRect(hx - 7, hy + 1, 14, 3.4);
        else { ctx.fillRect(hx - 4.6, hy + 2, 2.2, 2.2); ctx.fillRect(hx + 2.4, hy + 2, 2.2, 2.2); }
        if (look.specs) { ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(hx - 3.6, hy + 3, 3, 0, TAU); ctx.moveTo(hx + 6.6, hy + 3); ctx.arc(hx + 3.6, hy + 3, 3, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = 'rgba(80,30,30,0.7)'; ctx.fillRect(hx - 2, hy + 7.5, 4, 1.4);
        if (look.plaits) { ctx.strokeStyle = look.hair || '#1a1412'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(hx - 10, hy + 2); ctx.lineTo(hx - 12, hy + 18); ctx.moveTo(hx + 10, hy + 2); ctx.lineTo(hx + 12, hy + 18); ctx.stroke(); ctx.fillStyle = '#d8402a'; ctx.fillRect(hx - 14, hy + 15, 4, 3); ctx.fillRect(hx + 10, hy + 15, 4, 3); }
      }
    };
    const bat = () => {
      if (!o.bat) return;
      const h = o.hand || [hL[0], hL[1]];
      const a = o.batAng == null ? Math.PI * 0.95 : o.batAng;
      ctx.save(); ctx.translate(h[0], h[1]); ctx.rotate(a);
      ctx.fillStyle = '#2a1d1a'; ctx.fillRect(-1.6, -14, 3.2, 14);
      ctx.fillStyle = '#e2c48a'; ctx.beginPath(); ctx.moveTo(-3.6, 0); ctx.lineTo(3.6, 0); ctx.lineTo(4, 30); ctx.lineTo(-4, 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a6834a'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    };
    // painter's order
    const farArmFirst = side;
    if (farArmFirst) arm(hL, 'L');
    if (o.bat && o.batBehind) bat();
    legs(); torso();
    if (o.bat && !o.batBehind) bat();
    if (!farArmFirst) { arm(hL, 'L'); }
    arm(hR, 'R');
    head();
    ctx.restore();
  }

  /* ================================================================ scoring engine (pure; tests use it) */
  const rules = {
    newInnings(bat, bowl, o) {
      o = o || {};
      const n = bat.players.length;
      const order = bat.order || bat.players.map((p, i) => i);
      const inn = {
        bat, bowl, runs: 0, wkts: 0, balls: 0, wd: 0, nb: 0, fours: 0, sixes: 0,
        cards: bat.players.map((p) => ({ name: p.name, runs: 0, balls: 0, f4: 0, f6: 0, out: false, how: '', inAt: false })),
        figs: {}, order, striker: order[0], non: order[1], next: 2,
        over: [], overs: [], shots: [], fow: [], part: 0, partBalls: 0, catches: {},
        target: o.target || null, maxBalls: Math.max(1, (o.overs || 3) * 6), maxWkts: Math.min(o.wickets || 5, n - 1), done: false, endReason: null,
      };
      inn.cards[inn.striker].inAt = true; inn.cards[inn.non].inAt = true;
      return inn;
    },
    fig(inn, name) { return inn.figs[name] || (inn.figs[name] = { name, balls: 0, runs: 0, wkts: 0, wd: 0, nb: 0, dots: 0, overRuns: 0 }); },
    // ev {runs, wide, nb, boundary 0|4|6, bowler, wicket {kind, idx, fielder, end}, strikerAfter, nonAfter, cross, shot}
    applyBall(inn, ev) {
      const runs = Math.max(0, ev.runs | 0), legal = !ev.wide && !ev.nb;
      const fig = rules.fig(inn, ev.bowler || '?');
      const card = inn.cards[inn.striker];
      let sym;
      if (ev.wide) { inn.wd += 1 + runs; inn.runs += 1 + runs; fig.wd++; fig.runs += 1 + runs; sym = runs ? 'wd+' + runs : 'wd'; }
      else {
        inn.runs += runs + (ev.nb ? 1 : 0);
        if (ev.nb) { inn.nb++; fig.nb++; }
        fig.runs += runs + (ev.nb ? 1 : 0);
        card.balls++; card.runs += runs;
        if (ev.boundary === 4) { card.f4++; inn.fours++; }
        if (ev.boundary === 6) { card.f6++; inn.sixes++; }
        sym = ev.nb ? 'nb' + (runs ? '+' + runs : '') : String(runs);
      }
      fig.overRuns += (ev.wide ? 1 + runs : runs + (ev.nb ? 1 : 0));
      if (legal) { inn.balls++; fig.balls++; if (!runs && !ev.wicket) fig.dots++; }
      inn.part += runs + (ev.wide || ev.nb ? 1 : 0); if (legal) inn.partBalls++;
      if (ev.shot && runs > 0) inn.shots.push(ev.shot);
      // positions after the ball
      if (ev.strikerAfter != null && ev.nonAfter != null) { inn.striker = ev.strikerAfter; inn.non = ev.nonAfter; }
      else if (ev.cross) { const t = inn.striker; inn.striker = inn.non; inn.non = t; }
      let wicket = null;
      if (ev.wicket) {
        sym = 'W';
        const w = ev.wicket, idx = w.idx != null ? w.idx : inn.striker;
        const oc = inn.cards[idx];
        oc.out = true; oc.how = w.how || w.kind;
        inn.wkts++;
        if (w.kind !== 'runout') fig.wkts++;
        if (w.fielder && (w.kind === 'caught' || w.kind === 'onetip')) inn.catches[w.fielder] = (inn.catches[w.fielder] || 0) + 1;
        inn.fow.push({ wkt: inn.wkts, runs: inn.runs, name: oc.name, balls: inn.balls });
        inn.part = 0; inn.partBalls = 0;
        wicket = { idx };
        if (inn.wkts < inn.maxWkts && inn.next < inn.order.length) {
          const nb = inn.order[inn.next++];
          inn.cards[nb].inAt = true;
          if (inn.striker === idx) inn.striker = nb; else if (inn.non === idx) inn.non = nb;
          wicket.newBat = nb;
        }
      }
      inn.over.push(sym);
      const res = { sym, legal, overEnd: false, inningsEnd: false, targetReached: false, wicket };
      if (legal && inn.balls % 6 === 0) {
        res.overEnd = true;
        inn.overs.push({ bowler: ev.bowler, balls: inn.over.slice(), runs: fig.overRuns });
        if (fig.overRuns === 0) fig.maidens = (fig.maidens || 0) + 1;
        fig.overRuns = 0;
        inn.over = [];
        const t = inn.striker; inn.striker = inn.non; inn.non = t;
      }
      if (inn.target && inn.runs >= inn.target) { res.inningsEnd = true; res.targetReached = true; inn.endReason = 'target'; }
      else if (inn.wkts >= inn.maxWkts) { res.inningsEnd = true; inn.endReason = 'allout'; }
      else if (inn.balls >= inn.maxBalls) { res.inningsEnd = true; inn.endReason = 'overs'; }
      if (res.inningsEnd) inn.done = true;
      return res;
    },
    oversText,
    score(inn) { return inn.runs + '/' + inn.wkts; },
    need(inn) { return inn.target ? Math.max(0, inn.target - inn.runs) : null; },
    ballsLeft(inn) { return inn.maxBalls - inn.balls; },
  };

  /* ================================================================ match setup */
  function setupMatch(g) {
    const S = g.S, p = g.params;
    S.g = g;
    S.V = VENUES[p.venue === 'gully' || p.venue === 'colony' || p.venue === 'colony_ground' ? 'gully' : 'lb_stadium'];
    S.home = makeTeam(p.home, 'chinnu_xi');
    S.away = makeTeam(p.away, 'ashok_nagar');
    S.home.side = 'home'; S.away.side = 'away';
    S.overs = clamp((p.overs | 0) || 3, 1, 20);
    S.wickets = clamp((p.wickets | 0) || 5, 1, 10);
    S.mode = p.mode === 'defend' ? 'defend' : p.mode === 'chase' || (p.target && p.mode !== 'full') ? 'chase' : 'full';
    S.crng = U.rng(((g.rng.next() * 1e9) | 0) + 11);
    S.commLast = {};
    S.comm = { text: '', shown: 0, t: 0, hold: 0, queue: [] };
    S.clock = 0; S.phase = 'intro'; S.pt = 0;
    S.camMode = p.camera === 'fpv' || p.camera === 'fps' ? 'fpv' : p.camera === 'tv' ? 'tv' : (N.view && N.view.mode === 'fps' ? 'fpv' : 'tv');
    S.cam = makeCam(); S.camT = makeCam(); S.fieldTgt = { x: 0, z: 30 };
    S.timeMode = p.time === 'day' ? 'day' : p.time === 'night' ? 'night' : 'evening';
    S.light = S.timeMode === 'day' ? 0.05 : S.timeMode === 'night' ? 0.95 : 0.3;
    S.lightsOn = S.timeMode !== 'day';
    S.replays = p.replays !== false;
    S.innings = []; S.inn = null; S.innIdx = 0;
    S.actors = []; S.ball = newBallObj();
    S.fx3 = []; S.msg = null; S.banner = null; S.hits = [];
    S.celebrate = 0; S.waveOn = false;
    S.tossWon = null; S.battedFirst = null;
    S.fieldPreset = 'balanced';
    S.aim = { x: -0.15, z: 6, wx: 0, wz: 0, type: 'pace' };
    S.stumps = [newStumps(0), newStumps(PITCH)];
    S.ui = '';
    S.score = 0;
    S.stats = { drops: 0 };
    S.log = [];
    if (S.mode !== 'full' || p.toss === false || p.batFirst != null) S.skipToss = true;
    // a chase: the opponents' innings is already "in the book"
    if (S.mode === 'chase' || S.mode === 'defend') {
      const tgt = Math.max(1, (p.target | 0) || Math.round(S.overs * 6 * (1.05 + g.diff * 0.55)));
      const firstBat = S.mode === 'chase' ? S.away : S.home, firstBowl = S.mode === 'chase' ? S.home : S.away;
      const inn = rules.newInnings(firstBat, firstBowl, { overs: S.overs, wickets: S.wickets });
      inn.runs = tgt - 1; inn.balls = inn.maxBalls; inn.wkts = Math.min(inn.maxWkts - 1, 2 + ((g.rng.next() * 3) | 0)); inn.done = true; inn.synthetic = true;
      const nb = inn.wkts + 2;
      for (let i = 0; i < nb && i < inn.cards.length; i++) { inn.cards[i].inAt = true; inn.cards[i].out = i < inn.wkts; }
      spreadRuns(inn, g.rng);
      S.innings.push(inn);
      S.innIdx = 1;
      S.battedFirst = firstBat;
    } else if (p.batFirst != null) {
      S.battedFirst = p.batFirst ? S.home : S.away;
    }
    S.intro = { t: 0 };
    tossActors(S);
  }
  // the two captains and the umpire out in the middle for the toss (and the intro fly-over)
  function tossActors(S) {
    const h = mkActor('toss', S.home, S.home.players[0]), a = mkActor('toss', S.away, S.away.players[0]), u = mkActor('toss', null, null);
    u.ump = true;
    h.x = -0.75; h.z = 9.9; facing(h, 1, 9.9);
    a.x = 0.75; a.z = 9.9; facing(a, -1, 9.9);
    u.x = -0.2; u.z = 8.7; facing(u, 4.6, 15.2);
    S.actors = [h, a, u];
    S.tossCaps = [h, a];
  }
  function spreadRuns(inn, rng) {
    let left = inn.runs;
    const ids = inn.cards.map((c, i) => i).filter((i) => inn.cards[i].inAt);
    ids.forEach((i, k) => { const r = k === ids.length - 1 ? left : Math.round(left * (0.25 + rng.next() * 0.35)); inn.cards[i].runs = Math.max(0, r); inn.cards[i].balls = Math.max(1, Math.round(r * (0.7 + rng.next() * 0.5))); left -= inn.cards[i].runs; });
    inn.cards[ids[0]].runs += Math.max(0, left);
    const bw = inn.bowl.bowlers.slice(0, 3);
    let w = inn.wkts;
    bw.forEach((bi, k) => { const f = rules.fig(inn, inn.bowl.players[bi].name); f.balls = Math.floor(inn.maxBalls / bw.length) + (k < inn.maxBalls % bw.length ? 1 : 0); f.runs = Math.round(inn.runs / bw.length); f.wkts = k === bw.length - 1 ? w : Math.min(w, (rng.next() * 2) | 0); w -= f.wkts; });
  }
  function newBallObj() { return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, st: 'held', bounces: 0, vis: false, trail: [], holder: null, hit: false }; }
  function newStumps(z) { return { z, broken: 0, t: 0, parts: null }; }
  // party games (S.pm): a friend controls the striker / bowler (on any page); meBats / meBowls: on THIS page
  function playerBats(S) { return S.pm ? !!(S.inn && S.pm.L.human(S.pm.batCtl)) : !!(S.inn && S.inn.bat === S.home); }
  function meBats(S) { return S.pm ? playerBats(S) && S.pm.batCtl === S.pm.L.me : playerBats(S); }
  function meBowls(S) { return S.pm ? playerBowlsNow(S) && S.pm.bowlCtl === S.pm.L.me : playerBowlsNow(S); }
  function batTeam(S) { return S.inn ? S.inn.bat : S.home; }
  function bowlTeam(S) { return S.inn ? S.inn.bowl : S.away; }

  /* ================================================================ actors */
  function mkActor(role, team, p) {
    return { role, team, p, kit: team ? team.kit : UMP_KIT, look: p ? p.look : { skin: '#8d5a3b', hair: '#3a3430' }, num: p ? p.num : 0,
      x: 0, z: 0, fx: 0, fz: -1, pose: 'stand', ph: Math.random() * 6, u: 0, t: 0, tx: null, tz: null, spd: 0, vmax: FIELD_V, jump: 0, spot: null, close: false,
      hand: null, batAng: null, sig: null, catchUp: 0 };
  }
  const UMP_KIT = { shirt: '#f4f2ea', trim: '#f4f2ea', pants: '#26222a', cap: '#f4f2ea', num: '#26222a' };
  function buildActors(S) {
    const A = [];
    const bowl = bowlTeam(S), bat = batTeam(S);
    for (const p of bowl.players) A.push(mkActor('field', bowl, p));
    S.batA = mkActor('bat', bat, bat.players[S.inn.striker]);
    S.batB = mkActor('bat', bat, bat.players[S.inn.non]);
    A.push(S.batA, S.batB);
    S.ump1 = mkActor('ump', null, null); S.ump1.ump = true;
    S.ump2 = mkActor('ump', null, null); S.ump2.ump = true;
    A.push(S.ump1, S.ump2);
    S.actors = A;
    S.keeperA = A.find((a) => a.role === 'field' && a.p.keeper) || A[6];
    S.keeperA.role = 'keeper';
  }
  function fieldSpots(S, preset) {
    const V = S.V, spots = V.gully ? GULLY_SPOTS[preset] || GULLY_SPOTS.balanced : (FIELDS[preset] || FIELDS.balanced).spots;
    const sc = V.gully ? 0.55 : 1;
    return spots.map((k) => {
      const q = POS[k];
      let x = q[0] * sc, z = q[1] * sc;
      if (!inside(V, x, z, -3)) { const a = Math.atan2(x, z - V.cz); const e = ellR(V, a, -4); x = e.x; z = e.z; }
      return { key: k, x, z, close: Math.hypot(x, z - 2) < 12 };
    });
  }
  function assignField(S) {
    const spots = fieldSpots(S, S.fieldPreset);
    const others = S.actors.filter((a) => a.team === bowlTeam(S) && a !== S.bowlerA && a !== S.keeperA);
    // Chitti always goes to fine leg ("doodh-bhaat"), like M4
    const chitti = others.find((a) => a.p.look && a.p.look.small);
    let free = spots.slice();
    if (chitti) {
      let bi = 0, bd = 1e9;
      free.forEach((s, i) => { const d = Math.hypot(s.x - 12, s.z + 25); if (d < bd) { bd = d; bi = i; } });
      chitti.spot = free[bi]; free.splice(bi, 1);
    }
    let subs = 0;
    for (const a of others) {
      if (a === chitti) continue;
      if (free.length) { a.spot = free.shift(); continue; }
      // more players than spots (the gully skin plays 5 fielders): the rest sit on the wall
      const e = ellR(S.V, Math.PI * 0.62 + subs * 0.07, 3.5); subs++;
      a.spot = { key: 'sub', x: e.x, z: e.z, sub: true };
    }
    for (const a of others) { a.close = a.spot.close; a.role = a.spot.sub ? 'sub' : 'field'; }
    S.fieldShown = 1.6;
  }
  function setBowler(S, p) {
    const bowl = bowlTeam(S);
    if (S.bowlerA) S.bowlerA.role = 'field';
    S.bowlerA = S.actors.find((a) => a.team === bowl && a.p === p);
    S.bowlerA.role = 'bowler';
    S.bowler = p;
    if (S.keeperA === S.bowlerA) { // never let the keeper bowl
      S.keeperA = S.actors.find((a) => a.team === bowl && a !== S.bowlerA && a.role === 'field');
      S.keeperA.role = 'keeper';
    }
    assignField(S);
  }
  function facing(a, x, z) { const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz); if (d > 1e-3) { a.fx = dx / d; a.fz = dz / d; } }
  function moveActor(a, dt, run) {
    if (a.tx == null) { a.spd = Math.max(0, a.spd - dt * 12); return true; }
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    const vmax = run ? a.vmax : 1.9;
    if (d < 0.05) { a.x = a.tx; a.z = a.tz; a.spd = 0; return true; }
    a.spd = Math.min(vmax, a.spd + dt * (run ? 14 : 6));
    const st = Math.min(d, a.spd * dt);
    a.x += (dx / d) * st; a.z += (dz / d) * st; a.fx = dx / d; a.fz = dz / d;
    a.ph += st * (run ? 2.6 : 3.2);
    return d - st < 0.05;
  }

  /* ================================================================ commentary + messages */
  function say(S, key, vars, prio) {
    const line = typeof key === 'string' && COMM[key] ? pickLine(S, key, vars) : fill(key, vars);
    if (!line) return;
    const c = S.comm;
    if (prio || !c.text || c.t > c.hold) { c.text = line; c.shown = 0; c.t = 0; c.hold = Math.max(2.4, line.length / 22); }
    else if (c.queue.length < 3) c.queue.push(line);
    S.log.push(line);
    if (S.log.length > 40) S.log.shift();
  }
  function commUpdate(S, dt) {
    const c = S.comm;
    c.t += dt;
    if (c.text) c.shown = Math.min(c.text.length, c.shown + dt * 48);
    if (c.queue.length && c.t > Math.min(c.hold, 1.6)) { c.text = c.queue.shift(); c.shown = 0; c.t = 0; c.hold = Math.max(2.4, c.text.length / 22); }
  }
  function message(S, text, sub, col, big) { S.msg = { text, sub: sub || '', col: col || '#ffffff', t: 0, big: !!big }; }
  function vars(S, extra) {
    const inn = S.inn;
    const v = { bat: inn ? inn.bat.players[inn.striker].name : '', bowl: S.bowler ? S.bowler.name : '', team: inn ? inn.bat.name : '', score: inn ? rules.score(inn) : '', stand: S.V.stands3[(S.crng.next() * 4) | 0] };
    if (inn && inn.target) { v.need = rules.need(inn); v.balls = rules.ballsLeft(inn); }
    return Object.assign(v, extra || {});
  }

  /* ================================================================ flow: toss, innings, overs */
  function startToss(S) {
    S.phase = 'toss'; S.pt = 0;
    S.toss = { call: null, flipT: 0, side: null, won: null, choice: null };
    say(S, 'Captains walk out for the toss. ' + S.home.players[0].name + ' calls for ' + S.home.name + '.', null, true);
  }
  function tossCall(S, call) {
    if (!S.toss || S.toss.call) return;
    S.toss.call = call; S.toss.flipT = 0;
    S.toss.side = S.forceToss || (S.g.rng.next() < 0.5 ? 'heads' : 'tails');
    S.toss.won = S.toss.side === call;
    S.g.sfx('coin', { pitch: 1.2 });
    S.phase = 'toss_flip'; S.pt = 0;
  }
  function tossResolve(S) {
    const won = S.toss.won;
    say(S, 'toss', { cap: S.home.players[0].name, call: S.toss.call.toUpperCase(), side: S.toss.side.toUpperCase() }, true);
    S.tossWon = won;
    if (S.tossCaps) { const w = S.tossCaps[won ? 0 : 1]; w.pose = 'celebrate'; w.t = 0; }
    if (won) { S.phase = 'toss_choose'; S.pt = 0; }
    else {
      const batFirst = S.g.rng.next() < 0.5;
      S.toss.choice = batFirst ? 'bat' : 'bowl';
      say(S, 'tossWin', { team: S.away.name, choice: S.toss.choice });
      S.battedFirst = batFirst ? S.away : S.home;
      S.phase = 'toss_done'; S.pt = 0;
    }
  }
  function tossChoose(S, choice) {
    S.toss.choice = choice;
    S.battedFirst = choice === 'bat' ? S.home : S.away;
    say(S, 'tossWin', { team: S.home.name, choice });
    S.phase = 'toss_done'; S.pt = 0;
  }
  function startInnings(S) {
    const g = S.g;
    let bat, bowl, target = null;
    if (S.innIdx === 0) { bat = S.battedFirst || S.home; bowl = bat === S.home ? S.away : S.home; }
    else { const f = S.innings[0]; bat = f.bowl; bowl = f.bat; target = f.runs + 1; }
    const inn = rules.newInnings(bat, bowl, { overs: S.overs, wickets: S.wickets, target });
    S.innings[S.innIdx] = inn; S.inn = inn;
    if (S.pm) { S.overNo = 0; pmArrange(S); }
    buildActors(S);
    S.overNo = 0; S.lastBowler = null; S.bowlerA = null;
    S.fieldPreset = bowl === S.home ? (S.userField || 'balanced') : aiField(S);
    nextOverBowler(S);
    S.run = null;
    placeForBall(S);
    for (const a of S.actors) if (a.role === 'field' && a.spot) { a.x = a.spot.x; a.z = a.spot.z; a.tx = null; }
    S.phase = 'inn_intro'; S.pt = 0;
    const b1 = bat.players[inn.striker].name, b2 = bat.players[inn.non].name;
    S.banner = { title: bat.name + (target ? ' NEED ' + target : ' TO BAT'), sub: b1 + ' & ' + b2 + ' open · ' + S.bowler.name + ' to bowl', t: 0 };
    if (target) say(S, 'inningsBreak', { team: bat.name, need: target }, true);
    else say(S, b1 + ' and ' + b2 + ' walk out to open for ' + bat.name + '.', null, true);
    g.sfx('applause', { vol: 0.6 });
  }
  function aiField(S) {
    const inn = S.inn, g = S.g;
    if (!inn) return 'balanced';
    const lateOvers = inn.balls >= inn.maxBalls - 6;
    if (inn.target) { const need = rules.need(inn), left = Math.max(1, rules.ballsLeft(inn)); if (need / left > 1.6) return 'defend'; if (need / left < 0.8) return 'attack'; }
    if (lateOvers) return 'defend';
    if (S.bowler && S.bowler.type === 'spin') return g.rng.next() < 0.5 ? 'spin' : 'balanced';
    return inn.balls < 6 ? 'attack' : 'balanced';
  }
  function nextOverBowler(S) {
    if (S.pm && pmBowler(S)) return;
    const bowl = bowlTeam(S), inn = S.inn;
    const list = bowl.bowlers.map((i) => bowl.players[i]).filter(Boolean);
    let p = list[S.overNo % list.length];
    if (p === S.lastBowler) p = list[(S.overNo + 1) % list.length];
    S.lastBowler = p;
    setBowler(S, p);
    if (bowl === S.home) S.aim.type = p.type === 'spin' ? 'spin' : 'pace';
    void inn;
  }
  function startBall(S) {
    const inn = S.inn, V = S.V;
    if (S.pm) pmBall(S);
    S.phase = 'ball'; S.bp = playerBowlsNow(S) ? 'aim' : 'setup'; S.bt = 0;
    S.del = null; S.swung = false; S.pendHit = null; S.aiPlan = null; S.icept = null; S.hit = null;
    S.run = { done: 0, p: 0, active: false, T: RUN_T[0], queued: false, startDelay: 0, auto: false };
    S.out = { runs: 0, wide: false, nb: false, wicket: null, boundary: 0, shot: null };
    S.calls = null; S.catchPrompt = null; S.timing = null; S.deadT = 0; S.evt = null; S.rp = null;
    S.rec = []; S.recAcc = 0; S.ballClock = 0; S.thr = null; S.noIcept = false; S.gatherPos = null; S.res = null;
    S.forceRuns = 0; S.forceRunOut = false; S.forceCatch = false; S.catchChance = false;
    S.forceNow = null; S.lastIcept = null;
    S.ball = newBallObj();
    S.stumps = [newStumps(0), newStumps(PITCH)];
    S.missed = null; S.relay = 0;
    placeForBall(S);
    S.ballNo = inn.balls;
    if (inn.target && inn.balls > 0 && inn.balls % 6 === 0 && inn.over.length === 0) say(S, 'need', vars(S));
  }
  // everybody to their places for the next delivery (also used for the innings intro)
  function placeForBall(S) {
    const inn = S.inn, V = S.V;
    S.batA.p = inn.bat.players[inn.striker]; S.batB.p = inn.bat.players[inn.non];
    S.batA.look = S.batA.p.look; S.batB.look = S.batB.p.look; S.batA.num = S.batA.p.num; S.batB.num = S.batB.p.num;
    S.batA.idx = inn.striker; S.batB.idx = inn.non;
    const b = S.bowlerA, k = S.keeperA, spin = S.bowler.type === 'spin';
    b.runLen = spin ? 4.2 : V.gully ? 6.5 : 9.5;
    b.x = -0.95; b.z = PITCH + b.runLen; b.tx = null; b.pose = 'stand'; b.u = 0; facing(b, 0, 0);
    S.keepDist = spin ? 1.1 : V.gully ? 3.6 : 6.5;
    k.x = 0; k.z = -S.keepDist; k.tx = null; k.pose = 'keep'; k.u = 0; facing(k, 0, PITCH);
    for (const a of S.actors) {
      if (a.role === 'field') { a.tx = a.spot.x; a.tz = a.spot.z; a.pose = 'stand'; a.catchUp = 0; if (Math.hypot(a.x - a.tx, a.z - a.tz) > 30 || (!a.x && !a.z)) { a.x = a.tx; a.z = a.tz; } }
      else if (a.role === 'sub' && a.spot) { a.x = a.spot.x; a.z = a.spot.z; a.tx = null; a.pose = 'stand'; facing(a, 0, 10); }
      a.jump = 0; a.sig = null;
    }
    S.batA.x = 0.32; S.batA.z = 1.15; S.batA.pose = 'stand'; S.batA.tx = null; S.batA.batAng = Math.PI * 0.94; S.batA.hand = [-6, -48]; S.batA.swing = null; facing(S.batA, 0, PITCH);
    S.batB.x = 1.75; S.batB.z = PITCH - 1.1; S.batB.pose = 'stand'; S.batB.tx = null; S.batB.batAng = Math.PI * 0.85; S.batB.hand = null; facing(S.batB, 0.6, 0);
    S.ump1.x = 0.95; S.ump1.z = PITCH + 1.9; S.ump1.pose = 'stand'; S.ump1.tx = null; facing(S.ump1, 0, 0);
    S.ump2.x = V.gully ? 14 : 22; S.ump2.z = 1.2; S.ump2.pose = 'stand'; S.ump2.tx = null; facing(S.ump2, 0, 1.2);
  }
  function playerBowlsNow(S) { return S.pm ? !!(S.inn && S.pm.L.human(S.pm.bowlCtl)) : !!(S.inn && S.inn.bowl === S.home); }

  /* ================================================================ deliveries */
  function lengthClass(del) {
    if (!del.B) return 'full';
    const bz = del.B.z;
    if (del.A.y > 1.2 || bz > 9.8) return 'bouncer';
    if (bz < 2.0) return 'yorker';
    if (bz < (del.spin ? 3.3 : 4.3)) return 'full';
    if (bz < (del.spin ? 6.2 : 7.6)) return 'good';
    return 'short';
  }
  function lineClass(x) { return x < -0.24 ? 'off' : x > 0.24 ? 'leg' : 'mid'; }
  // build the scripted (but physical) path release -> bounce -> hit plane
  function makeDelivery(S, o) {
    const spin = o.type === 'spin';
    const R = { x: o.rx != null ? o.rx : -0.42, y: S.bowler && S.bowler.look && S.bowler.look.small ? 1.6 : 1.9, z: PITCH - 1.45 };
    const del = { type: o.type, kind: o.kind, spin, v: o.v, R, B: null, A: { x: o.ax, y: o.ay }, turn: o.turn || 0, nb: !!o.nb, nbHigh: false, wide: false, tRel: 0, label: o.label || '' };
    if (o.bz != null && o.bz > HIT_Z + 0.05) {
      del.B = { x: o.bx, z: o.bz };
      const d1 = Math.hypot(del.B.x - R.x, del.B.z - R.z), v2 = o.v * (spin ? 0.82 : 0.86);
      del.tB = d1 / o.v;
      const d2 = Math.hypot(del.A.x - del.B.x, HIT_Z - del.B.z);
      del.tA = del.tB + d2 / v2;
      del.vy1 = (0 - R.y + 0.5 * G * del.tB * del.tB) / del.tB;
      const T2 = del.tA - del.tB;
      del.vy2 = (del.A.y + 0.5 * G * T2 * T2) / T2;
      del.vx1 = (del.B.x - R.x) / del.tB; del.vz1 = (del.B.z - R.z) / del.tB;
      del.vx2 = (del.A.x - del.B.x) / T2; del.vz2 = (HIT_Z - del.B.z) / T2;
    } else {
      const d = Math.hypot(del.A.x - R.x, HIT_Z - R.z);
      del.tA = d / o.v; del.tB = null;
      del.vy1 = (del.A.y - R.y + 0.5 * G * del.tA * del.tA) / del.tA;
      del.vx1 = (del.A.x - R.x) / del.tA; del.vz1 = (HIT_Z - R.z) / del.tA;
    }
    del.wide = Math.abs(del.A.x) > WIDE_X + 0.06 || (del.A.x > 0.62 && o.type !== 'spin' && del.A.y < 1.2 && o.legWide);
    if (del.A.y > (S.V.gully ? 1.5 : 1.62)) { del.nb = true; del.nbHigh = true; }
    del.len = lengthClass(del);
    del.line = lineClass(del.A.x);
    return del;
  }
  function deliveryPos(del, t, out) {
    const R = del.R;
    if (del.B && t > del.tB) {
      const t2 = t - del.tB;
      out.x = del.B.x + del.vx2 * t2; out.z = del.B.z + del.vz2 * t2; out.y = Math.max(BALL_R, del.vy2 * t2 - 0.5 * G * t2 * t2);
      out.vx = del.vx2; out.vz = del.vz2; out.vy = del.vy2 - G * t2; out.bounced = true;
    } else {
      out.x = R.x + del.vx1 * t; out.z = R.z + del.vz1 * t; out.y = Math.max(BALL_R, R.y + del.vy1 * t - 0.5 * G * t * t);
      out.vx = del.vx1; out.vz = del.vz1; out.vy = del.vy1 - G * t; out.bounced = false;
    }
    return out;
  }
  // the AI bowler's plan (the player is batting)
  function aiDelivery(S) {
    const g = S.g, r = g.rng, d = g.diff, bw = S.bowler, sk = bw.bowl;
    const spin = bw.type === 'spin';
    const f = S.forceNow;
    let kind = spin ? weighted(r, { good: 55, full: 22, short: 9, quicker: 10, fulltoss: 3 }) : weighted(r, { good: 42, short: 12, bouncer: 6 + d * 6, full: 18, yorker: 7 + d * 10, fulltoss: 4 });
    if (f === 'bowled') kind = 'good';
    let bz, ay;
    const R = (a, b) => a + r.next() * (b - a);
    switch (kind) {
      case 'yorker': bz = R(1.42, 1.85); ay = R(0.05, 0.12); break;
      case 'full': bz = spin ? R(2.4, 3.3) : R(2.5, 4.2); ay = R(0.22, 0.38); break;
      case 'short': bz = spin ? R(6.4, 7.8) : R(7.8, 9.6); ay = R(0.85, 1.12); break;
      case 'bouncer': bz = R(9.8, 11.2); ay = R(1.3, 1.55 + d * 0.12); break;
      case 'fulltoss': bz = null; ay = R(0.55, 0.95); break;
      case 'quicker': bz = R(3.6, 5.2); ay = R(0.4, 0.6); break;
      default: bz = spin ? R(3.4, 5.6) : R(4.6, 7.4); ay = R(0.42, 0.7);
    }
    const lines = [-0.36, -0.2, -0.08, 0.04, 0.16];
    let ax = lines[(r.next() * lines.length) | 0] + (r.next() - 0.5) * 0.3 * (1.1 - sk);
    const wideP = 0.025 + 0.06 * (1 - sk) + (d < 0.3 ? 0.02 : 0);
    let legWide = false;
    if (r.next() < wideP || f === 'wide') { ax = r.next() < 0.6 ? -(WIDE_X + 0.3 + r.next() * 0.3) : WIDE_X + 0.25 + r.next() * 0.3; legWide = ax > 0; }
    if (f === 'bowled') { ax = (r.next() - 0.5) * 0.08; ay = 0.45; }
    if (f === 'dot') ax = -0.55;
    if (f === 'four' || f === 'six' || f === 'caught' || f === 'single' || f === 'runout' || f === 'house') { kind = 'good'; bz = 5.5; ay = 0.55; ax = -0.1; }
    const turn = spin ? bw.spin * R(0.12, 0.42) * (kind === 'quicker' ? 0.2 : 1) : R(-0.07, 0.07);
    const vBase = spin ? 15 + sk * 2.4 + d * 1.6 : 21.5 + sk * 4 + d * 3.5;
    const v = vBase * (kind === 'quicker' ? 1.25 : kind === 'yorker' ? 1.03 : 1) + R(-0.6, 0.6);
    const nb = r.next() < 0.03 * (1.2 - sk) || f === 'noball';
    const del = makeDelivery(S, { type: spin ? 'spin' : 'pace', kind, v, ax: ax + (bz ? turn : 0), ay, bx: ax, bz, turn, nb, legWide });
    return del;
  }
  // the player's ball from the aim marker + release quality
  const TYPE_INFO = {
    pace: { name: 'PACE', zone: [4.6, 7.4], z: 6 },
    spin: { name: 'SPIN', zone: [3.2, 5.6], z: 4.4 },
    yorker: { name: 'YORKER', zone: [1.4, 2.2], z: 1.7 },
    bouncer: { name: 'BOUNCER', zone: [9.6, 11.4], z: 10.3 },
  };
  function playerDelivery(S, rel) {
    const g = S.g, r = g.rng, bw = S.bowler, d = g.diff;
    const type = S.aim.type;
    let x = S.aim.lx, z = S.aim.lz;
    // release accuracy scatter
    const sc = rel.err <= 1 ? rel.err * 0.22 : 0.22 + (rel.err - 1) * 0.65;
    const a = r.next() * TAU;
    x += Math.cos(a) * sc * 0.7; z += Math.sin(a) * sc * 1.8;
    // test hooks: a forced outcome overrides the aim
    const f = S.forceNow;
    if (f === 'bowled') { x = 0.02; z = 6; }
    else if (f === 'wide') x = 1.5;
    else if (f === 'dot') { x = -0.62; z = 6; }
    else if (f && /^(four|six|caught|single|runout|house)$/.test(f)) { x = -0.1; z = 5.5; }
    const spin = type === 'spin' || (bw.type === 'spin' && type !== 'bouncer' && type !== 'yorker');
    let v = spin ? 15.2 + bw.bowl * 2.6 : 21 + bw.bowl * 5;
    if (type === 'yorker') v *= 1.02;
    if (rel.err < 0.25) v *= 1.05;
    let ay;
    if (z <= HIT_Z + 0.1) { z = null; ay = 0.62 + r.next() * 0.25; } // over-pitched into a full toss
    else if (z < 2.1) ay = 0.04 + (z - 1.4) * 0.12;
    else if (z < 4.3) ay = 0.22 + (z - 2.1) * 0.06;
    else if (z < 7.6) ay = 0.4 + (z - 4.3) * 0.08;
    else if (z < 9.7) ay = 0.85 + (z - 7.6) * 0.15;
    else ay = 1.25 + (z - 9.7) * 0.22;
    if (spin) ay *= 0.9;
    const turn = f === 'bowled' || f === 'wide' ? 0 : spin ? bw.spin * (0.16 + r.next() * 0.3) : (r.next() - 0.5) * 0.12;
    const nb = (rel.overstep && f !== 'bowled' && f !== 'wide') || f === 'noball';
    void d;
    return makeDelivery(S, { type: spin ? 'spin' : 'pace', kind: type, v, ax: x + (z ? turn : 0), ay, bx: x, bz: z, turn, nb, legWide: true });
  }
  function deliveryDifficulty(S, del) {
    let D;
    const onStumps = Math.abs(del.A.x) < 0.2;
    switch (del.len) {
      case 'yorker': D = onStumps ? 0.88 : 0.55; break;
      case 'full': D = del.B ? 0.28 : 0.12; break;
      case 'good': D = onStumps ? 0.72 : 0.6; break;
      case 'short': D = 0.42; break;
      default: D = Math.abs(del.A.x) < 0.5 ? 0.6 : 0.35;
    }
    if (del.wide) D = 0.25;
    D += (del.v - 23) * 0.015;
    if (del.relQ != null) D += (1 - Math.min(1, del.relQ)) * 0.12 - 0.04;
    if (S.lastKind && S.lastKind === del.kind) D -= 0.08;
    return clamp(D, 0.05, 0.95);
  }
  function release(S) {
    const g = S.g;
    const del = S.del;
    del.tRel = S.clock;
    S.ball.st = 'del'; S.ball.vis = true; S.ball.bounces = 0;
    deliveryPos(del, 0, S.ball);
    S.bp = 'flight'; S.bt = 0;
    S.bowlerA.relT = S.clock;
    S.speedGun = { v: kph(del.v), t: 0 };
    if (del.nb && !del.nbHigh) { S.nbCall = 0.01; }
    if (!playerBats(S)) S.aiPlan = aiBatPlan(S, del);
    const k = del.kind;
    if (k === 'yorker' && S.crng.next() < 0.3) say(S, 'yorker');
    else if (k === 'bouncer' && S.crng.next() < 0.4) say(S, 'bouncer');
    else if (del.spin && S.crng.next() < 0.2) say(S, 'spin');
    g.tone(520, 0.03, { type: 'triangle', vol: 0.025 });
  }

  /* ================================================================ batting: windows, shots */
  function windows(S, block) {
    const g = S.g, d = g.diff, m = (g.winMul || 1) * (S.del && S.del.spin ? 1.12 : 1) * (block ? 1.5 : 1);
    return { p: (0.042 + (1 - d) * 0.024) * m, g: (0.088 + (1 - d) * 0.032) * m, e: (0.14 + (1 - d) * 0.035) * m };
  }
  // dir: 'off' | 'straight' | 'leg' | 'block' (world terms), from the player's input or the AI plan
  function attemptShot(S, dir, loft, who, eOv) {
    const del = S.del;
    if (!del || S.swung || (S.bp !== 'flight' && S.bp !== 'past')) return;
    if (S.bp === 'past' && S.ball.z < -1.4) return;
    S.swung = true;
    startSwing(S, dir);
    const e = eOv != null && isFinite(eOv) ? clamp(+eOv, -2, 2) : S.clock - (del.tRel + del.tA);
    const W = windows(S, dir === 'block');
    // late counts double: ~0.05 s after the hitting point the ball is already at the stumps
    const ae = e < 0 ? -e : e * 2;
    S.timing = { e, label: ae <= W.p ? 'PERFECT' : ae <= W.g ? (e < 0 ? 'GOOD · EARLY' : 'GOOD · LATE') : ae <= W.e ? (e < 0 ? 'EARLY' : 'LATE') : e < 0 ? 'TOO EARLY' : 'TOO LATE', t: 0, ok: ae <= W.g };
    const f = S.forceNow;
    if (f && /^(four|six|caught|single|runout|house)$/.test(f)) { S.pendHit = { dir: f === 'single' ? 'block' : dir === 'block' ? 'straight' : dir, loft: f === 'six' || f === 'caught', q: 'perfect', e: 0, forced: f }; schedulePend(S); return; }
    if (f === 'bowled' || f === 'dot' || f === 'wide') { S.missed = 'forced'; return; }
    if (ae > W.e) { S.missed = e < 0 ? 'early' : 'late'; return; }
    const q = ae <= W.p ? 'perfect' : ae <= W.g ? 'good' : 'edge';
    S.pendHit = { dir, loft: !!loft, q, e, who };
    schedulePend(S);
  }
  function schedulePend(S) {
    const del = S.del;
    S.pendHit.at = Math.max(S.clock, del.tRel + del.tA);
  }
  function startSwing(S, dir) { S.batA.swing = { t: 0, dir }; }
  const SHOT_NAMES = { off: { full: 'cover drive', good: 'cover drive', short: 'square cut', bouncer: 'upper cut', yorker: 'squeeze' }, straight: { full: 'straight drive', good: 'straight drive', short: 'punch', bouncer: 'fend', yorker: 'dig out' }, leg: { full: 'on drive', good: 'flick', short: 'pull shot', bouncer: 'hook shot', yorker: 'flick' }, block: {} };
  function launch(S, h) {
    const g = S.g, r = g.rng, del = S.del, b = S.ball;
    const bat = S.inn.bat.players[S.inn.striker];
    let q = h.q, dir = h.dir;
    const len = del.len, line = del.line;
    let mismatch = false;
    if (dir === 'off' && line === 'leg' && len !== 'short' && len !== 'bouncer') mismatch = true;
    if (dir === 'leg' && line === 'off' && (len === 'full' || len === 'good' || len === 'yorker')) mismatch = true;
    if (dir === 'straight' && (len === 'short' || len === 'bouncer')) mismatch = true;
    if (len === 'yorker' && dir !== 'block' && q !== 'perfect') mismatch = true;
    if (mismatch && !h.forced) q = q === 'perfect' ? 'good' : 'edge';
    const W = windows(S, dir === 'block');
    const e = h.e || 0;
    let th, v, el, kind = 'ground';
    const R = (a, c) => a + r.next() * (c - a);
    const shortBall = len === 'short' || len === 'bouncer';
    if (dir === 'block') {
      if (q === 'edge') { th = -2.7 + R(-0.3, 0.3); v = R(6, 10); el = R(0.08, 0.2); kind = 'edge'; }
      else { th = (line === 'off' ? -0.4 : line === 'leg' ? 0.4 : 0) + R(-0.5, 0.5); v = R(2.4, 5.5); el = R(0.0, 0.05); kind = 'block'; }
    } else {
      if (dir === 'off') th = shortBall ? -1.5 + R(-0.15, 0.15) : len === 'yorker' ? -0.45 : -0.78 + R(-0.2, 0.2);
      else if (dir === 'leg') th = shortBall ? (len === 'bouncer' && h.loft ? 1.8 : 1.45) + R(-0.2, 0.2) : 0.85 + R(-0.2, 0.25);
      else th = (line === 'leg' ? 0.16 : line === 'off' ? -0.1 : 0) + R(-0.12, 0.12);
      th += clamp(-e / W.g, -1.2, 1.2) * 0.32;
      const pow = (0.88 + 0.24 * bat.bat) * (1 + (del.v - 22) * 0.008);
      if (q === 'perfect') { if (h.loft) { v = R(26, 30); el = R(0.5, 0.66); kind = 'loft'; } else { v = R(31, 35); el = R(-0.06, 0.02); } }
      else if (q === 'good') { if (h.loft) { v = R(19, 24); el = R(0.5, 0.8); kind = 'loft'; } else { v = R(21, 27); el = R(-0.04, 0.07); } }
      else {
        kind = 'edge';
        const u = r.next();
        if ((shortBall && h.loft) || (mismatch && h.loft && u < 0.6)) { th = R(-2.4, 2.4); v = R(13, 18); el = R(1.05, 1.32); }
        else if (u < 0.25) { th = -0.5 + R(-0.45, 0.45); v = R(7, 11); el = R(0.5, 0.8); }
        else { th = (dir === 'leg' || line === 'leg' ? 1 : -1) * R(2.45, 2.95); v = R(12, 19); el = R(0.06, 0.32); }
      }
      if (kind !== 'edge') v *= pow;
    }
    // forced test outcomes
    if (h.forced === 'six') { th = R(-0.25, 0.25); v = 31; el = 0.62; kind = 'loft'; S.noIcept = true; }
    if (h.forced === 'house') { th = -1.25; v = 26; el = 0.6; kind = 'loft'; S.noIcept = true; }
    if (h.forced === 'four') { th = gapAngle(S); v = 34; el = 0.06; kind = 'ground'; S.noIcept = true; }
    if (h.forced === 'single') { th = gapAngle(S) * 0.6; v = 8.5; el = 0.03; kind = 'block'; S.forceRuns = 1; }
    if (h.forced === 'runout') { const f = nearestFielderInFront(S); th = Math.atan2(f.x, f.z - HIT_Z); v = Math.max(9, Math.hypot(f.x, f.z) * 0.55); el = 0.04; kind = 'ground'; S.forceRunOut = true; }
    if (h.forced === 'caught') { const f = nearestFielderInFront(S, 14); th = Math.atan2(f.x, f.z - HIT_Z); const dist = Math.hypot(f.x, f.z - HIT_Z); el = 0.75; v = Math.sqrt((dist * G) / Math.sin(2 * el)) * 0.99; kind = 'loft'; S.forceCatch = true; }
    const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    if (b.st === 'del') deliveryPos(del, S.clock - del.tRel, p); else { p.x = b.x; p.y = b.y; p.z = b.z; }
    b.x = p.x; b.y = clamp(p.y, kind === 'ground' || kind === 'block' ? 0.12 : 0.25, kind === 'ground' ? 0.5 : 2); b.z = Math.min(p.z, HIT_Z + 0.2);
    const vh = v * Math.cos(el);
    b.vx = Math.sin(th) * vh; b.vz = Math.cos(th) * vh; b.vy = v * Math.sin(el);
    b.st = 'free'; b.hit = true; b.bounces = 0; b.trail.length = 0;
    S.bp = 'live'; S.bt = 0; S.liveT = 0;
    S.hit = { q, dir, kind, th, v, loft: kind === 'loft', at: S.ballClock, name: dir === 'block' ? (kind === 'edge' ? 'edge' : 'forward defence') : kind === 'edge' ? 'edge' : ((h.loft ? 'lofted ' : '') + ((SHOT_NAMES[dir] || {})[len] || 'drive')) };
    g.sfx('bat_hit', { vol: q === 'edge' || dir === 'block' ? 0.55 : 1, pitch: q === 'perfect' ? 1.12 : q === 'edge' ? 0.8 : 1 });
    if (q === 'perfect' && dir !== 'block') { g.shake(2.5); }
    S.batA.swing = S.batA.swing || { t: 0.09, dir };
    // the field reacts
    planFielding(S);
    planRunning(S, true);
    if (kind === 'loft') say(S, 'lofted', null, true); else if (kind === 'edge' && dir !== 'block') say(S, 'edge', null, true);
  }
  function gapAngle(S) {
    // the widest angular gap between the ring fielders, in front of square
    const angs = S.actors.filter((a) => a.role === 'field').map((a) => Math.atan2(a.x, a.z - HIT_Z)).filter((a) => Math.abs(a) < 1.7).sort((a, b) => a - b);
    let best = 0, bw = -1;
    const all = [-1.7].concat(angs, [1.7]);
    for (let i = 0; i < all.length - 1; i++) { const w = all[i + 1] - all[i]; if (w > bw) { bw = w; best = (all[i] + all[i + 1]) / 2; } }
    return best;
  }
  function nearestFielderInFront(S, minD) {
    let best = null, bd = 1e9;
    for (const a of S.actors) {
      if (a.role !== 'field') continue;
      const d = Math.hypot(a.x, a.z - HIT_Z);
      if (a.z < 3 || d < (minD || 9)) continue;
      if (d < bd) { bd = d; best = a; }
    }
    return best || S.actors.find((a) => a.role === 'field');
  }

  /* ================================================================ AI batter */
  function aiBatPlan(S, del) {
    const g = S.g, r = g.rng, d = g.diff, inn = S.inn;
    const bat = inn.bat.players[inn.striker];
    const sk = clamp(bat.bat * (0.72 + 0.6 * d), 0.05, 0.95);
    const D = deliveryDifficulty(S, del);
    const f = S.forceNow;
    const W = windows(S, false);
    const plan = { act: 'shot', dir: 'straight', loft: false, q: 'good', e: 0 };
    if (f) {
      if (f === 'bowled' || f === 'wide' || f === 'dot') return { act: f === 'bowled' ? 'miss' : 'leave', e: 0.2 };
      if (/^(four|six|caught|single|runout|house)$/.test(f)) return { act: 'shot', dir: 'straight', loft: f === 'six' || f === 'caught' || f === 'house', q: 'perfect', e: 0, forced: f };
    }
    if (del.wide) return r.next() < 0.8 ? { act: 'leave' } : { act: 'shot', dir: del.A.x < 0 ? 'off' : 'leg', loft: false, q: r.next() < 0.5 ? 'edge' : 'good', e: 0.05 };
    // aggression
    let aggr;
    if (inn.target) { const need = rules.need(inn), left = Math.max(1, rules.ballsLeft(inn)); aggr = clamp((need / left * 6 - 5) / 7, 0, 1); }
    else aggr = clamp(0.2 + 0.6 * (inn.balls / inn.maxBalls), 0, 0.85);
    // shot selection
    const len = del.len, line = del.line;
    if (len === 'short' || len === 'bouncer') plan.dir = line === 'off' ? 'off' : r.next() < 0.75 ? 'leg' : 'off';
    else if (line === 'off') plan.dir = r.next() < 0.7 ? 'off' : 'straight';
    else if (line === 'leg') plan.dir = r.next() < 0.8 ? 'leg' : 'straight';
    else plan.dir = weighted(r, { straight: 50, leg: 28, off: 22 });
    const easy = len === 'full' || len === 'short';
    plan.loft = r.next() < (easy ? 0.15 + aggr * 0.55 : 0.05 + aggr * 0.3);
    if (D > 0.66 && aggr < 0.55 && r.next() < 0.55) { plan.act = 'block'; plan.dir = 'block'; plan.loft = false; }
    // timing quality
    const pM = clamp(0.03 + D * 0.18 - sk * 0.12, 0.02, 0.22);
    const pE = clamp(0.1 + D * 0.15 - sk * 0.05, 0.05, 0.3);
    const pP = clamp(0.08 + sk * 0.4 - D * 0.2, 0.03, 0.5);
    const pG = Math.max(0.05, 1 - pM - pE - pP);
    const u = r.next(), sgn = r.next() < 0.5 ? -1 : 1;
    if (u < pP) { plan.q = 'perfect'; plan.e = sgn * r.next() * W.p * 0.9; }
    else if (u < pP + pG) { plan.q = 'good'; plan.e = sgn * lerp(W.p, W.g, r.next()); }
    else if (u < pP + pG + pE) { plan.q = 'edge'; plan.e = sgn * lerp(W.g, W.e, r.next()); }
    else { plan.act = plan.act === 'block' ? 'block_miss' : 'miss'; plan.e = sgn * (W.e * (1.3 + r.next())); }
    if (plan.act === 'block') { plan.q = plan.q === 'perfect' || plan.q === 'good' ? 'good' : plan.q; }
    // a late AI contact must still beat the ball to the stumps (~HIT_Z / speed after the hit plane)
    if (plan.act !== 'miss' && plan.act !== 'block_miss') plan.e = Math.min(plan.e, 0.04);
    // a good batter leaves balls well outside off
    if (line === 'off' && del.A.x < -0.55 && !del.wide && r.next() < sk * 0.6 && aggr < 0.5) return { act: 'leave' };
    return plan;
  }
  function aiBatUpdate(S) {
    const P = S.aiPlan, del = S.del;
    if (!P || S.swung || P.act === 'leave') return;
    const tA = del.tRel + del.tA + (P.e || 0);
    if (S.clock >= tA - 0.1 && !S.batA.swing) startSwing(S, P.dir || 'straight');
    if (S.clock < tA) return;
    if (P.act === 'miss' || P.act === 'block_miss') { S.swung = true; S.missed = 'ai'; return; }
    S.swung = true;
    S.pendHit = { dir: P.act === 'block' ? 'block' : P.dir, loft: P.loft, q: P.q, e: P.e || 0, forced: P.forced, at: S.clock };
  }

  /* ================================================================ ball physics + fielding */
  function stepBall(V, b, dt, fric) {
    b.vy -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y <= BALL_R) {
      b.y = BALL_R;
      if (b.vy < -1.4) { b.bounces++; b.vy = -b.vy * 0.4; b.vx *= 0.76; b.vz *= 0.76; return 'bounce'; }
      b.vy = 0;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) { const ns = Math.max(0, sp - fric * dt); b.vx *= ns / sp; b.vz *= ns / sp; }
      if (!b.bounces) b.bounces = 1;
    }
    return null;
  }
  function predict(S) {
    const V = S.V, b = S.ball, fric = V.gully ? 5.6 : 4.3;
    const q = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, bounces: b.bounces };
    const pts = []; const dt = 1 / 30;
    let t = 0, cross = null, stop = null;
    for (let i = 0; i < 300; i++) {
      stepBall(V, q, dt, fric); t += dt;
      pts.push({ t, x: q.x, y: q.y, z: q.z, bn: q.bounces });
      if (!inside(V, q.x, q.z)) { cross = { t, x: q.x, z: q.z, full: q.bounces === 0, y: q.y }; break; }
      if (q.y <= BALL_R + 1e-3 && Math.hypot(q.vx, q.vz) < 0.25) { stop = { t, x: q.x, z: q.z }; break; }
    }
    return { pts, cross, stop };
  }
  function planFielding(S, exclude, delay) {
    const pr = predict(S);
    S.pred = pr;
    const V = S.V, cands = [];
    for (const a of S.actors) {
      if (a.team !== bowlTeam(S) || a === exclude) continue;
      if (a.role !== 'field' && a.role !== 'keeper' && a.role !== 'bowler') continue;
      const react = (a.role === 'keeper' ? 0.06 : a.close ? 0.14 : 0.3) + (a.role === 'bowler' ? 0.25 : 0) + (delay || 0);
      const spd = (a.role === 'keeper' ? 5 : FIELD_V) * (0.86 + (a.p.field || 0.6) * 0.25) * (a.p.look && a.p.look.small ? 0.8 : 1);
      let prev = null;
      for (const s of pr.pts) {
        const sp = prev ? Math.hypot(s.x - prev.x, s.z - prev.z) * 30 : 20;
        prev = s;
        if (s.t < 0.08) continue;
        const dd = Math.hypot(s.x - a.x, s.z - a.z);
        const canCatch = s.bn === 0 && s.y > 0.32 && s.y < (a.role === 'keeper' ? 2.1 : 2.45) && S.ball.hit;
        const canTip = V.gully && s.bn === 1 && s.y > 0.22 && s.y < 1.7 && S.ball.hit;
        const canStop = s.y < 1.15;
        if (!canCatch && !canTip && !canStop) continue;
        // a hard-hit ball only gets stopped by a fielder who is right in its path
        const hard = clamp((sp - 12) / 18, 0, 1);
        const reach = canCatch ? (a.close || a.role === 'keeper' ? 1.5 : 1.15) * (1 - hard * 0.45) : 0.8 - hard * 0.38;
        const need = react + Math.max(0, dd - reach) / spd;
        if (need <= s.t) { cands.push({ f: a, t: s.t, x: s.x, z: s.z, y: s.y, kind: canCatch ? 'catch' : canTip ? 'tip' : 'stop', run: dd, need }); break; }
      }
    }
    cands.sort((a, b) => a.t - b.t);
    let best = cands[0] || null;
    if (best && pr.cross && best.t > pr.cross.t) best = null;
    if (S.noIcept) best = null;
    if (S.forceCatch) { const c = cands.find((c) => c.kind === 'catch'); if (c) best = c; }
    for (const a of S.actors) a.chase = false;
    if (best) {
      S.icept = best;
      const f = best.f; f.chase = true;
      f.tx = best.x - Math.sin(Math.atan2(S.ball.vx, S.ball.vz)) * 0.3; f.tz = best.z - Math.cos(Math.atan2(S.ball.vx, S.ball.vz)) * 0.3;
      if (best.kind === 'catch' || best.kind === 'tip') {
        S.catchChance = true;
        if (playerBowlsNow(S) && best.t > 0.45 && (!S.pm || !playerBats(S))) S.catchPrompt = { at: S.liveT + best.t, pressed: null };
      }
      // a backup fielder
      const second = cands.find((c) => c.f !== f && c.f.role === 'field');
      if (second) { second.f.chase = true; second.f.tx = lerp(second.f.x, best.x, 0.7); second.f.tz = lerp(second.f.z, best.z, 0.7); }
    } else {
      S.icept = null;
      const goal = pr.cross || pr.stop || pr.pts[pr.pts.length - 1];
      let nf = null, nd = 1e9;
      for (const a of S.actors) { if (a.role !== 'field') continue; const d = Math.hypot(a.x - goal.x, a.z - goal.z); if (d < nd) { nd = d; nf = a; } }
      if (nf) { nf.chase = true; const p2 = pr.cross ? ellR(V, Math.atan2(goal.x, goal.z - V.cz), -1) : goal; nf.tx = p2.x; nf.tz = p2.z; }
      if (!pr.cross && pr.stop && nf) S.icept = { f: nf, t: pr.stop.t + nd / FIELD_V, x: pr.stop.x, z: pr.stop.z, y: 0, kind: 'stop', run: nd, late: true };
    }
    // keeper and bowler get to the stumps
    S.keeperA.tx = 0; S.keeperA.tz = -0.7; S.keeperA.pose = 'run';
    if (S.bowlerA && !(S.icept && S.icept.f === S.bowlerA)) { S.bowlerA.tx = 0.4; S.bowlerA.tz = PITCH + 0.7; }
    S.icept0 = S.liveT;
  }
  function catchProb(S, c) {
    const g = S.g, d = g.diff, f = c.f;
    let p = playerBowlsNow(S) ? 0.6 + 0.14 * (1 - d) : 0.5 + 0.38 * d;
    p += ((f.p.field || 0.6) - 0.6) * 0.4;
    p -= clamp(c.run / 26, 0, 0.3);
    if (c.y < 0.45) p -= 0.14;
    if (c.y > 2.05) p -= 0.08;
    if (f.role === 'keeper') p += 0.1;
    if (c.kind === 'tip') p -= 0.12;
    if (f.p.look && f.p.look.small) p += 0.1; // Chitti: "She counts."
    return clamp(p, 0.12, 0.95);
  }
  function resolveIntercept(S) {
    const c = S.icept, g = S.g, b = S.ball, f = c.f, r = g.rng;
    S.lastIcept = { kind: c.kind, who: f.p ? f.p.name : '?', spot: f.spot ? f.spot.key : f.role, t: +c.t.toFixed(2), x: +c.x.toFixed(1), z: +c.z.toFixed(1) };
    S.icept = null;
    f.chase = false;
    if (c.kind === 'catch' || c.kind === 'tip') {
      let p = catchProb(S, c);
      const cp = S.catchPrompt;
      if (cp) { if (cp.pressed === 'good') p = Math.max(p, 0.93); else if (cp.pressed === 'early') p *= 0.6; }
      if (S.forceCatch) p = 1;
      if (r.next() < p) {
        b.st = 'held'; b.holder = f; b.vx = b.vy = b.vz = 0;
        f.pose = 'catch'; f.t = 0;
        const kind = c.kind === 'tip' ? 'onetip' : 'caught';
        wicketFall(S, kind, f);
        return;
      }
      // dropped
      S.stats.drops++;
      say(S, 'dropped', vars(S), true);
      g.pop && popAt(S, 'DROPPED!', '#b9ffb0');
      b.vx = (r.next() - 0.5) * 4; b.vz = (r.next() - 0.5) * 4; b.vy = 1.5; b.bounces = Math.max(1, b.bounces);
      f.pose = 'stand';
      S.catchPrompt = null;
      planFielding(S, null, 0.25);
      if (S.icept && S.icept.f === f) S.icept.t = Math.max(S.icept.t, 0.5);
      S.icept && (S.icept.t += S.liveT);
      return;
    }
    // a stop: small misfield chance
    const mis = playerBowlsNow(S) ? 0.04 : 0.07 * (1 - g.diff);
    if (!c.late && r.next() < mis && Math.hypot(b.vx, b.vz) > 7) {
      say(S, 'misfield');
      b.vx *= 0.45; b.vz *= 0.45;
      planFielding(S, f, 0.4);
      S.icept && (S.icept.t += S.liveT);
      return;
    }
    b.st = 'held'; b.holder = f; b.vx = b.vy = b.vz = 0; b.y = 0.9;
    S.gatherPos = { x: b.x, z: b.z };
    f.pose = 'stand'; f.tx = null;
    S.holdT = f.close || f.role === 'keeper' ? 0.18 : 0.36;
    planRunning(S, false);
  }
  function wicketFall(S, kind, f) {
    const inn = S.inn, bw = S.bowler;
    const nbSave = S.del && S.del.nb && kind !== 'runout';
    if (nbSave) { say(S, 'noballSaved', vars(S), true); S.out.nbSaved = true; S.ball.st = 'dead'; endBall(S, 0.9); return; }
    const sname = inn.bat.players[inn.striker].name;
    let how, key;
    if (kind === 'bowled') { how = 'b ' + bw.name; key = 'bowled'; }
    else if (kind === 'caught') {
      if (f === S.keeperA) { how = 'c †' + f.p.name + ' b ' + bw.name; key = 'caughtKeeper'; }
      else if (f === S.bowlerA) { how = 'c & b ' + bw.name; key = 'caughtBowler'; }
      else { how = 'c ' + f.p.name + ' b ' + bw.name; key = 'caught'; }
    } else if (kind === 'onetip') { how = 'c ' + f.p.name + ' (one-tip) b ' + bw.name; key = 'oneTip'; }
    else if (kind === 'house') { how = 'into the house b ' + bw.name; key = 'house'; }
    else { how = 'run out (' + (f ? f.p.name : '') + ')'; key = 'runout'; }
    S.out.wicket = { kind, how, fielder: f ? f.p.name : null, idx: S.out.outIdx != null ? S.out.outIdx : inn.striker };
    say(S, key, vars(S, { fielder: f ? f.p.name : '' }), true);
    const big = kind === 'runout' ? 'RUN OUT!' : kind === 'bowled' ? 'BOWLED!' : kind === 'onetip' ? 'ONE-TIP!' : kind === 'house' ? 'HOUSE = OUT!' : 'CAUGHT!';
    const outName = kind === 'runout' ? inn.bat.players[S.out.wicket.idx].name : sname;
    const oc = inn.cards[S.out.wicket.idx];
    message(S, big, outName + ' ' + oc.runs + ' (' + (oc.balls + (kind === 'runout' && S.out.wicket.idx !== inn.striker ? 0 : 1)) + ')', '#ff6a5a', true);
    S.evt = { kind: kind === 'onetip' ? 'caught' : kind, text: (kind === 'runout' ? outName + ' · run out' : sname + ' · ' + how) };
    S.g.sfx('howzat', { vol: 0.9 });
    S.g.sfx(playerBats(S) ? 'applause' : 'crowd_cheer', { vol: 0.6 });
    S.celebrate = playerBats(S) ? 0 : 2.2;
    for (const a of S.actors) if (a.team === bowlTeam(S) && (a.role === 'field' || a.role === 'keeper' || a.role === 'bowler') && Math.hypot(a.x - S.ball.x, a.z - S.ball.z) < 40) { a.pose = 'celebrate'; a.t = 0; a.tx = null; }
    S.ump1.pose = 'signal'; S.ump1.sig = 'out'; S.ump1.t = 0;
    S.ball.st = S.ball.st === 'free' ? 'free' : S.ball.st;
    endBall(S, 1.7);
  }
  function popAt(S, text, col) { message(S, text, '', col || '#fff', false); }

  /* ================================================================ running between the wickets */
  // batter A started at the striker's end (end 0), B at the bowler's end (end 1)
  function runPos(S) {
    const R = S.run, u = R.done + (R.active ? smooth(R.p) : 0);
    const k = Math.floor(u), f = u - k;
    const z0 = 0.75, z1 = PITCH - 0.75;
    const aGoingUp = k % 2 === 0;
    return { a: aGoingUp ? lerp(z0, z1, f) : lerp(z1, z0, f), b: aGoingUp ? lerp(z1, z0, f) : lerp(z0, z1, f) };
  }
  function headingTo(S, who) { // which end a batter is running to (only while active)
    const aUp = S.run.done % 2 === 0;
    return who === 'a' ? (aUp ? 1 : 0) : aUp ? 0 : 1;
  }
  function startRun(S) {
    const R = S.run;
    if (R.active || S.bp !== 'live' || S.out.boundary || S.out.wicket) return false;
    if (S.ball.st === 'dead2' || S.ball.st === 'atEnd' || S.ball.st === 'dead') return false;
    R.active = true; R.p = 0; R.T = R.done === 0 ? RUN_T[0] : RUN_T[1];
    if (R.done === 0) R.p = -0.08;
    return true;
  }
  function ballTimeToEnd(S, end) {
    // how long until the ball can reach end `end` (0/1)
    const b = S.ball, ez = end === 0 ? 0 : PITCH;
    if (b.st === 'thrown' && S.thr) return S.thr.E === end ? S.thr.T - S.thr.t : S.thr.T - S.thr.t + 0.95;
    if (b.st === 'atEnd') return S.thr && S.thr.E === end ? 0 : 0.95;
    if (b.st === 'held') return Math.max(0, S.holdT || 0) + Math.hypot(b.x, b.z - ez) / THROW_V + 0.05;
    if (S.icept && b.st === 'free') {
      const ti = Math.max(0, S.icept.t - S.liveT) + 0.36;
      return ti + Math.hypot(S.icept.x, S.icept.z - ez) / THROW_V + 0.05;
    }
    if (S.pred && S.pred.cross) return 99;
    return 4;
  }
  function runSafety(S) {
    // seconds to spare if the batters set off for one more run now
    const R = S.run;
    const T = (R.done === 0 ? RUN_T[0] : RUN_T[1]) * (R.active ? 1 - Math.max(0, R.p) : 1) + (R.active ? 0 : 0.1);
    const t0 = ballTimeToEnd(S, 0), t1 = ballTimeToEnd(S, 1);
    return Math.min(t0, t1) - T;
  }
  function planRunning(S, atHit) {
    // the AI pair (or the non-striker's call for the player)
    const g = S.g, R = S.run;
    if (S.out.boundary || S.out.wicket) return;
    if (S.pred && S.pred.cross && !S.icept) { S.calls = { text: 'WATCH IT GO!', col: '#ffd84a', t: 0 }; return; }
    if (S.icept && (S.icept.kind === 'catch' || S.icept.kind === 'tip') && atHit) { S.calls = { text: 'WAIT!', col: '#ffd84a', t: 0 }; return; }
    const spare = runSafety(S);
    if (S.forceRunOut) { R.auto = 'greedy'; if (!R.active) startRun(S); R.queued = true; return; }
    if (S.forceRuns) { if (R.done < S.forceRuns && !R.active) startRun(S); return; }
    if (playerBats(S)) {
      S.calls = spare > 0.35 ? { text: R.done ? 'ANOTHER ONE!' : 'YES! RUN!', col: '#b9ffb0', t: 0 } : spare > -0.15 ? { text: 'WAIT...', col: '#ffd84a', t: 0 } : { text: 'NO! STAY!', col: '#ff8a7a', t: 0 };
      if ((g.assist || S.autoRun) && spare > 0.35 && !R.active) startRun(S);
      return;
    }
    const inn = S.inn;
    let aggr = inn.target ? clamp((rules.need(inn) / Math.max(1, rules.ballsLeft(inn)) * 6 - 5) / 6, 0, 1) : 0.2 + 0.4 * (inn.balls / inn.maxBalls);
    const margin = 0.45 - aggr * 0.35 + (g.rng.next() - 0.5) * 0.5 * (1.1 - g.diff);
    if (spare > margin && !R.active && R.done < 4) startRun(S);
  }
  function runUpdate(S, dt) {
    const R = S.run;
    if (!R.active) return;
    R.p += dt / R.T;
    if (R.p >= 1) {
      R.done++; R.p = 0; R.active = false;
      if (R.queued) { R.queued = false; startRun(S); if (R.auto === 'greedy') R.queued = true; }
      else if (!playerBats(S) || S.autoRun || S.g.assist) planRunning(S, false);
      else planRunning(S, false);
    }
  }
  function throwBall(S) {
    const b = S.ball, f = b.holder;
    const R = S.run;
    let E = 0;
    if (R.active) {
      // throw at the end where the batter has the most ground still to cover vs the throw
      let best = 1e9;
      for (const end of [0, 1]) {
        const dist = Math.hypot(f.x - 0, f.z - (end ? PITCH : 0));
        const tt = dist / THROW_V + 0.05, remain = (1 - Math.max(0, R.p)) * R.T;
        const m = tt - remain;
        if (m < best) { best = m; E = end; }
      }
    } else E = Math.hypot(f.x, f.z) < Math.hypot(f.x, f.z - PITCH) * 0.85 || !S.bowlerA ? 0 : (S.keeperA ? 0 : 1);
    const ez = E ? PITCH : 0;
    const from = { x: f.x, y: 1.7, z: f.z }, to = { x: E ? 0.35 : 0.1, y: 0.9, z: ez + (E ? 0.6 : -0.6) };
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    S.thr = { from, to, E, t: 0, T: dist / THROW_V + 0.05, h: Math.min(6, dist * 0.06) };
    b.st = 'thrown'; b.holder = null;
    f.pose = 'throw'; f.t = 0; f.u = 0;
    S.g.tone(260, 0.03, { type: 'triangle', vol: 0.02 });
  }
  function arriveAtEnd(S) {
    const thr = S.thr, b = S.ball, R = S.run, E = thr.E, g = S.g;
    b.st = 'atEnd'; b.x = thr.to.x; b.y = thr.to.y; b.z = thr.to.z;
    const recv = E === 0 ? S.keeperA : S.bowlerA || S.keeperA;
    if (recv) { recv.pose = 'catch'; recv.t = 0; }
    if (R.active) {
      const who = headingTo(S, 'a') === E ? 'a' : 'b';
      const idx = who === 'a' ? S.batA.idx : S.batB.idx;
      const p = Math.max(0, R.p);
      let out = p < 0.93;
      if (p > 0.86 && p < 0.97 && !S.forceRunOut) { S.thirdUmp = { t: 0, out: p < 0.92 }; out = p < 0.92; say(S, 'thirdUmp', null, true); }
      if (out) {
        S.stumps[E].broken = 1; S.stumps[E].t = 0;
        g.sfx('chop', { vol: 0.8 });
        S.out.outIdx = idx; S.out.runoutEnd = E;
        // the survivor completes their run
        R.active = false;
        wicketFall(S, 'runout', recv);
        return;
      }
      // made it
      message(S, 'SAFE!', 'Just made it', '#b9ffb0');
    }
    if (R.active) { // they're running to the other end: relay throw
      S.relay = (S.relay || 0) + 1;
      if (S.relay < 3) {
        const holder = recv;
        b.holder = holder; b.st = 'held'; S.holdT = 0.1; b.x = holder.x; b.z = holder.z;
        return;
      }
    }
    S.deadT = 0.35;
    b.st = 'dead2';
  }

  /* ================================================================ the ball loop */
  function ballUpdate(S, dt) {
    const g = S.g, b = S.ball, V = S.V;
    S.bt += dt; S.ballClock += dt;
    const del = S.del;
    switch (S.bp) {
      case 'setup':
        if (S.bt > 0.85) { takeForce(S); S.del = aiDelivery(S); startRunup(S); }
        break;
      case 'aim':
        aimUpdate(S, dt);
        // party: a friend who never bowls (stepped away) gets a ball bowled for them
        if (S.pm && S.bt > 20) { const ty = S.bowler.type === 'spin' ? 'spin' : 'pace'; aimLock(S, { x: -0.12, z: TYPE_INFO[ty].z, ty }); }
        break;
      case 'runup': {
        const bw = S.bowlerA, T = S.runT;
        const k = clamp(S.bt / T, 0, 1.15);
        bw.z = lerp(PITCH + bw.runLen, PITCH - 1.2, smooth(Math.min(1, k))) ; bw.x = lerp(-0.95, -0.5, Math.min(1, k));
        bw.pose = k > 0.7 ? 'bowl' : 'run'; bw.u = clamp((k - 0.7) / 0.3 * 0.55, 0, 0.55); bw.ph += dt * 11; facing(bw, 0, 0);
        if (playerBowlsNow(S)) {
          S.meter = Math.min(1.12, S.bt / T);
          if (S.meter >= 1.08 && !S.del) { S.rel = { err: 2.2, overstep: true }; S.del = playerDelivery(S, S.rel); S.del.relQ = 0; release(S); }
        } else if (k >= 1) release(S);
        // fielders walk in
        for (const a of S.actors) if (a.role === 'field' && a.spot) { a.tx = a.spot.x * 0.97; a.tz = a.spot.z + (a.spot.z > 2 ? -1.2 : 0.4); }
        break;
      }
      case 'flight': case 'past': {
        const bw = S.bowlerA, t = S.clock - del.tRel;
        bw.u = clamp(0.55 + t / 0.5 * 0.45, 0, 1); bw.pose = bw.u < 1 ? 'bowl' : 'walk';
        if (bw.u >= 1) { bw.tx = -2.7; bw.tz = PITCH - 4.5; }
        for (const a of S.actors) if (a.role === 'field') a.pose = 'crouch';
        if (S.bp === 'flight') {
          const pos = deliveryPos(del, t, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
          if (pos.bounced && !b.bounced) { b.bounced = true; g.tone(170, 0.04, { type: 'sine', vol: 0.05 }); }
          b.x = pos.x; b.y = pos.y; b.z = pos.z;
          if (!playerBats(S)) aiBatUpdate(S);
          else if (S.forceNow && /^(four|six|caught|single|runout|house)$/.test(S.forceNow) && !S.swung && t >= del.tA - 0.002) { S.swung = true; startSwing(S, 'straight'); S.pendHit = { dir: S.forceNow === 'single' ? 'block' : 'straight', loft: S.forceNow === 'six' || S.forceNow === 'caught', q: 'perfect', e: 0, forced: S.forceNow, at: S.clock }; }
          if (S.pendHit && S.clock >= S.pendHit.at) { const h = S.pendHit; S.pendHit = null; launch(S, h); break; }
          if (t >= del.tA) {
            // past the bat: real physics from here
            b.st = 'past'; b.vx = pos.vx; b.vy = pos.vy; b.vz = pos.vz; b.bounces = pos.bounced ? 1 : 0;
            S.bp = 'past';
          }
        } else {
          if (!playerBats(S)) aiBatUpdate(S);
          if (S.pendHit && S.clock >= S.pendHit.at) { const h = S.pendHit; S.pendHit = null; launch(S, h); break; }
          const pz = b.z;
          stepBall(V, b, dt, 4);
          // the stumps
          if (pz > 0 && b.z <= 0) {
            const xAt = b.x, yAt = b.y;
            if (Math.abs(xAt) < STUMP_X + 0.06 + BALL_R && yAt < STUMP_H + BALL_R) {
              S.stumps[0].broken = 1; S.stumps[0].t = 0;
              g.sfx('chop', { vol: 0.9 }); g.shake(3);
              b.vz *= 0.3; b.vx += (g.rng.next() - 0.5) * 2;
              wicketFall(S, 'bowled', null);
              break;
            }
          }
          if (b.z <= S.keeperA.z + 0.35 || b.z < -S.keepDist - 0.5) {
            // the keeper takes it
            b.st = 'held'; b.holder = S.keeperA; b.vx = b.vy = b.vz = 0; S.keeperA.u = clamp(b.y / 1.4, 0, 1);
            S.keeperA.x = clamp(b.x, -1.6, 1.6);
            const wide = del.wide && !(S.hit);
            if (wide) { S.out.wide = true; message(S, 'WIDE', '+1 extra', '#eaf2ff'); say(S, 'wide'); S.ump1.pose = 'signal'; S.ump1.sig = 'wide'; S.ump1.t = 0; }
            else {
              const k2 = S.swung && S.missed && S.missed !== 'ai' || (S.missed === 'ai' && S.aiPlan && S.aiPlan.act !== 'leave') ? 'beaten' : 'dot';
              say(S, k2, vars(S));
              message(S, k2 === 'beaten' ? 'BEATEN!' : 'DOT BALL', S.timing && !S.timing.ok ? S.timing.label : '', '#eaf2ff');
            }
            endBall(S, 1.0);
          }
        }
        break;
      }
      case 'live':
        S.liveT += dt;
        liveUpdate(S, dt);
        break;
      case 'dead':
        if (b.st === 'free' || b.st === 'past') { stepBall(V, b, dt, 4); if (!inside(V, b.x, b.z, 30)) b.vis = false; }
        if (S.bt >= S.deadT) {
          if (S.replayWanted && S.replays && (S.pm || !S.g.auto) && S.rec.length > 8) startReplay(S);
          else finishBall(S);
        }
        break;
      case 'replay':
        replayUpdate(S, dt);
        break;
    }
    // record for replays
    if (S.bp === 'runup' || S.bp === 'flight' || S.bp === 'past' || S.bp === 'live' || (S.bp === 'dead' && S.bt < 1.4)) {
      S.recAcc += dt;
      if (S.recAcc >= 1 / 30) { S.recAcc = 0; S.rec.push(snapshot(S)); if (S.rec.length > 330) S.rec.shift(); }
    }
  }
  function startRunup(S) {
    S.bp = 'runup'; S.bt = 0;
    S.runT = S.bowler.type === 'spin' ? 0.95 : S.V.gully ? 1.1 : 1.45;
    S.meter = 0; S.rel = null;
    S.bowlerA.pose = 'run';
    S.ump1.pose = 'stand';
  }
  function liveUpdate(S, dt) {
    const g = S.g, b = S.ball, V = S.V;
    runUpdate(S, dt);
    if (b.st === 'free') {
      const prevIn = inside(V, b.x, b.z);
      const ev = stepBall(V, b, dt, V.gully ? 5.6 : 4.3);
      if (ev === 'bounce' && b.bounces === 1) g.tone(150, 0.035, { type: 'sine', vol: 0.04 });
      b.trail.push(b.x, b.y, b.z); if (b.trail.length > 30) b.trail.splice(0, 3);
      if (prevIn && !inside(V, b.x, b.z)) { boundary(S); return; }
      if (S.icept && S.liveT >= S.icept.t - 1e-3) { resolveIntercept(S); return; }
      // stopped dead with nobody assigned (rare): the nearest fielder walks to it
      if (!S.icept && b.y <= BALL_R + 1e-3 && Math.hypot(b.vx, b.vz) < 0.2) { planFielding(S); if (S.icept) S.icept.t += S.liveT; }
    } else if (b.st === 'held') {
      const f = b.holder;
      b.x = f.x + 0.3; b.z = f.z; b.y = 1.1;
      if (S.out.wicket) return;
      S.holdT -= dt;
      if (S.holdT <= 0) throwBall(S);
    } else if (b.st === 'thrown') {
      const T = S.thr; T.t += dt;
      const k = Math.min(1, T.t / T.T);
      b.x = lerp(T.from.x, T.to.x, k); b.z = lerp(T.from.z, T.to.z, k); b.y = lerp(T.from.y, T.to.y, k) + T.h * 4 * k * (1 - k);
      b.trail.push(b.x, b.y, b.z); if (b.trail.length > 30) b.trail.splice(0, 3);
      if (k >= 1) arriveAtEnd(S);
    } else if (b.st === 'dead2') {
      S.deadT -= dt;
      if (!S.run.active && S.deadT <= 0) {
        // the ball is back; the runs stand
        const n = S.run.done;
        S.out.runs = n;
        const line = n === 0 ? 'dot' : n === 1 ? 'single' : n === 2 ? 'two' : 'three';
        say(S, line, vars(S));
        if (n) message(S, n + (n === 1 ? ' RUN' : ' RUNS'), '', '#ffffff'); else message(S, 'NO RUN', '', '#eaf2ff');
        endBall(S, 0.9);
      } else if (S.run.active && S.deadT <= 0) { S.deadT = 0.2; }
    }
    // fielders' AI after the intercept: chasers keep running to their targets
  }
  function boundary(S) {
    const g = S.g, b = S.ball, V = S.V;
    const full = b.bounces === 0;
    // gully rule: on the full into a house = OUT
    if (V.gully && full) {
      const a = Math.atan2(b.x, b.z - V.cz);
      if (a < -0.4 && a > -2.6) { S.out.boundary = 0; S.ball.st = 'free'; wicketFall(S, 'house', null); S.evt.kind = 'house'; return; }
    }
    const runs = full ? 6 : 4;
    S.out.boundary = runs; S.out.runs = runs;
    S.run.active = false;
    const ang = Math.atan2(b.x, b.z - HIT_Z);
    S.out.shot = { ang, dist: 1, runs };
    say(S, runs === 6 ? (V.gully ? 'sixGully' : 'six') : 'four', vars(S), true);
    message(S, runs === 6 ? 'SIX!' : 'FOUR!', S.hit ? S.hit.name : '', runs === 6 ? '#ffd84a' : '#7fd8ff', true);
    S.evt = { kind: runs === 6 ? 'six' : 'four', text: S.inn.bat.players[S.inn.striker].name + ' · ' + (S.hit ? S.hit.name : 'shot') + ' · ' + (runs === 6 ? 'SIX' : 'FOUR') };
    g.sfx('crowd_cheer', { vol: runs === 6 ? 0.95 : 0.75 });
    if (!V.gully) { g.sfx('dappu', { vol: 0.5, delay: 0.2 }); g.sfx('finger_whistle', { vol: 0.4, delay: 0.5 }); }
    else g.sfx('kids', { vol: 0.8 });
    S.celebrate = playerBats(S) ? 3 : 1.2;
    if (runs === 6 && S.crng.next() < 0.5) { S.waveOn = true; S.waveT = 6; }
    S.ump1.pose = 'signal'; S.ump1.sig = runs === 6 ? 'six' : 'four'; S.ump1.t = 0;
    for (const a of S.actors) if (a.chase) { a.tx = null; a.pose = 'stand'; }
    endBall(S, runs === 6 ? 2.0 : 1.6);
  }
  function endBall(S, t) {
    if (S.bp === 'dead' || S.bp === 'replay') return;
    S.bp = 'dead'; S.bt = 0; S.deadT = (t || 1.2);
    // completed runs count unless a boundary or a dismissal (run-outs keep completed runs)
    if (!S.out.boundary) S.out.runs = S.run.done;
    if (S.out.wicket && S.out.wicket.kind !== 'runout') S.out.runs = 0;
    S.replayWanted = !!(S.out.boundary || S.out.wicket || (S.out.nbSaved));
    if (S.ball.st === 'held' || S.ball.st === 'atEnd' || S.ball.st === 'dead2') S.ball.st = 'dead';
    if (S.out.runs && S.hit && !S.out.shot) {
      const b = S.gatherPos || S.ball;
      S.out.shot = { ang: Math.atan2(b.x, b.z - HIT_Z), dist: clamp(Math.hypot(b.x, b.z - HIT_Z) / Math.hypot(S.V.rx, S.V.rz - 10), 0.1, 1), runs: S.out.runs };
    }
    commitBall(S);
  }
  // the ball is dead: put it in the book at once (the score bug updates during the replay)
  function commitBall(S) {
    const inn = S.inn, out = S.out;
    // final positions: completed runs decide who is where
    const crossed = (out.boundary ? 0 : S.run.done) % 2 === 1;
    let end0 = crossed ? S.batB.idx : S.batA.idx, end1 = crossed ? S.batA.idx : S.batB.idx;
    if (out.wicket && out.wicket.kind === 'runout') {
      // the out batter's end gets the new batter; the survivor stands at the other end
      const outIdx = out.wicket.idx, E = out.runoutEnd || 0;
      const surv = outIdx === S.batA.idx ? S.batB.idx : S.batA.idx;
      if (E === 0) { end0 = outIdx; end1 = surv; } else { end1 = outIdx; end0 = surv; }
    }
    const ev = { runs: out.runs, wide: out.wide, nb: !!(S.del && S.del.nb), boundary: out.boundary, bowler: S.bowler.name, wicket: out.wicket, strikerAfter: end0, nonAfter: end1, shot: out.shot };
    const res = S.pm ? pmCommit(S, ev) : rules.applyBall(inn, ev);
    S.lastKind = S.del ? S.del.kind : null;
    S.ballLog = S.ballLog || [];
    S.ballLog.push({ inn: S.innIdx, team: inn.bat.short, sym: res ? res.sym : '?', runs: out.runs, wide: !!out.wide, nb: ev.nb, boundary: out.boundary, wicket: out.wicket && out.wicket.kind,
      del: S.del && { kind: S.del.kind, len: S.del.len, line: S.del.line, v: +S.del.v.toFixed(1) }, hit: S.hit && { q: S.hit.q, dir: S.hit.dir, kind: S.hit.kind, v: +S.hit.v.toFixed(1), th: +S.hit.th.toFixed(2), name: S.hit.name },
      field: S.fieldPreset, icept: S.lastIcept || null, forced: S.forceNow || null });
    if (S.ballLog.length > 200) S.ballLog.shift();
    if (ev.nb) { say(S, S.del.nbHigh ? 'noballHigh' : 'noball'); }
    S.score = scoreOf(S);
    S.res = res;
    return res;
  }
  // after the dead-ball pause (and any replay): next ball, end of the over or of the innings
  function finishBall(S) {
    const inn = S.inn, res = S.res || commitBall(S) || S.res;
    S.res = null;
    if (res.wicket && res.wicket.newBat != null && !res.inningsEnd) say(S, 'newBat', { bat: inn.bat.players[res.wicket.newBat].name });
    if (res.inningsEnd) { endInnings(S, res); return; }
    if (res.overEnd) {
      S.overNo++;
      const last = inn.overs[inn.overs.length - 1];
      S.phase = 'over_break'; S.pt = 0;
      S.banner = { title: 'END OF OVER ' + S.overNo, sub: inn.bat.short + ' ' + rules.score(inn) + (inn.target ? ' · NEED ' + rules.need(inn) + ' OFF ' + rules.ballsLeft(inn) : ''), t: 0, over: last };
      if (last && last.runs === 0) say(S, 'maiden', { bowl: last.bowler }); else if (last && last.runs >= 12) say(S, 'bigOver', { bowl: last.bowler }); else say(S, 'overEnd', vars(S));
      return;
    }
    startBall(S);
  }
  function endInnings(S, res) {
    const inn = S.inn;
    if (S.innIdx === 0) {
      S.phase = 'inn_break'; S.pt = 0;
      S.banner = { title: 'INNINGS BREAK', sub: inn.bat.name + ' ' + rules.score(inn) + ' (' + oversText(inn.balls) + ' ov) · ' + inn.bowl.name + ' need ' + (inn.runs + 1), t: 0 };
      say(S, inn.endReason === 'allout' ? 'All out! ' + inn.bat.name + ' finish on ' + inn.runs + '.' : 'That is the innings. ' + inn.bat.name + ' make ' + inn.runs + '.', null, true);
      S.g.sfx('applause', { vol: 0.7 });
      return;
    }
    endMatch(S, res);
  }
  function scoreOf(S) {
    let s = 0;
    for (const inn of S.innings) { if (!inn || inn.synthetic) continue; if (inn.bat === S.home) s += inn.runs; else s += inn.wkts * 10; }
    return s;
  }
  function endMatch(S) {
    const g = S.g, i1 = S.innings[0], i2 = S.innings[1];
    const target = i1.runs + 1;
    let winner = null, margin = '', tie = false;
    if (i2.runs >= target) { winner = i2.bat; const w = S.pm ? pmInHand(S, i2) : i2.maxWkts - i2.wkts; margin = 'by ' + w + ' wicket' + (w === 1 ? '' : 's') + (rules.ballsLeft(i2) ? ' (' + rules.ballsLeft(i2) + ' balls left)' : ''); }
    else if (i2.runs === target - 1) { tie = true; margin = 'Scores level'; }
    else { winner = i1.bat; const r = target - 1 - i2.runs; margin = 'by ' + r + ' run' + (r === 1 ? '' : 's'); }
    const win = winner === S.home;
    S.result = { winner, tie, margin, win };
    S.phase = 'end'; S.pt = 0;
    S.banner = { title: tie ? 'MATCH TIED!' : winner.short + ' WIN!', sub: tie ? margin : winner.name + ' won ' + margin, t: 0, win: S.pm && S.pm.myTeam ? (tie ? undefined : winner === S.pm.myTeam) : win };
    say(S, tie ? 'tie' : win ? 'win' : 'lose', { team: winner ? winner.name : '', pteam: S.home.name }, true);
    if (win || tie) { g.sfx('crowd_cheer', { vol: 1 }); S.celebrate = 6; S.waveOn = true; S.waveT = 8; }
    else g.sfx('applause', { vol: 0.6 });
    for (const a of S.actors) if (winner && a.team === winner) { a.pose = 'celebrate'; a.tx = null; }
    S.motm = manOfMatch(S);
  }
  function manOfMatch(S) {
    let best = null;
    const pts = new Map();
    const add = (team, name, v, line) => { const k = team.id + ':' + name; const o = pts.get(k) || { team, name, v: 0, bits: [] }; o.v += v; if (line) o.bits.push(line); pts.set(k, o); };
    for (const inn of S.innings) {
      if (!inn) continue;
      inn.cards.forEach((c) => { if (c.inAt && (c.runs || c.balls)) add(inn.bat, c.name, c.runs + c.f6 * 2 + c.f4, c.runs + (c.out ? '' : '*') + ' (' + c.balls + ')'); });
      for (const k in inn.figs) { const f = inn.figs[k]; if (f.balls) add(inn.bowl, f.name, f.wkts * 22 - Math.max(0, f.runs - f.balls) * 0.5, f.wkts + '/' + f.runs); }
      for (const k in inn.catches) add(inn.bowl, k, inn.catches[k] * 9, inn.catches[k] + ' ct');
    }
    const winTeam = S.result && S.result.winner;
    for (const o of pts.values()) { const v = o.v + (winTeam && o.team === winTeam ? 12 : 0); if (!best || v > best.v2) { best = o; best.v2 = v; } }
    return best ? { name: best.name, team: best.team.name, line: best.bits.join(', ') } : { name: S.home.players[0].name, team: S.home.name, line: '' };
  }

  /* ================================================================ the player's bowling: aim, type, meter */
  function aimUpdate(S, dt) {
    const g = S.g, A = S.aim, d = g.diff;
    A.t = (A.t || 0) + dt;
    const ti = TYPE_INFO[A.type];
    // move the target
    let mx = 0, mz = 0;
    // both bowling cameras look from the bowler's end towards the batter: screen-up = fuller (smaller z)
    if (meBowls(S)) { if (g.down('left')) mx -= 1; if (g.down('right')) mx += 1; if (g.down('up')) mz -= 1; if (g.down('down')) mz += 1; }
    A.x = clamp(A.x + mx * dt * 1.2, -1.5, 1.5);
    A.z = clamp(A.z + mz * dt * 3.2, ti.zone[0] - 0.9, ti.zone[1] + 0.9);
    // wobble (Lissajous), bigger for weaker bowlers / higher difficulty
    const R = (0.1 + 0.28 * d) * (1.3 - S.bowler.bowl * 0.6) * (g.assist ? 0.6 : 1);
    A.wx = A.x + Math.sin(A.t * 2.3) * R * 0.55 + Math.sin(A.t * 5.1) * R * 0.15;
    A.wz = A.z + Math.cos(A.t * 1.7) * R * 1.7 + Math.sin(A.t * 4.3) * R * 0.3;
    // the field can be changed between balls
  }
  // debug.force(kind) applies to the next delivery that is planned (AI) or locked (player)
  function takeForce(S) { if (S.force) { S.forceNow = S.force; S.force = null; } }
  function aimLock(S, lock) {
    takeForce(S);
    const A = S.aim;
    if (lock) { if (TYPE_INFO[lock.ty]) A.type = lock.ty; A.wx = clamp(+lock.x || 0, -1.6, 1.6); A.wz = clamp(+lock.z || 6, 0.8, 12); }
    A.lx = A.wx; A.lz = A.wz;
    S.bp = 'runup'; S.bt = 0; S.runT = S.bowler.type === 'spin' || A.type === 'spin' ? 1.0 : S.V.gully ? 1.15 : 1.45;
    S.meter = 0; S.rel = null; S.del = null;
    S.bowlerA.pose = 'run';
    S.green = meterGreen(S);
  }
  function meterGreen(S) { const g = S.g, w = (0.17 - 0.07 * g.diff) * (g.winMul || 1); return { c: 0.72, w }; }
  function aimRelease(S) {
    if (S.del) return;
    const m = S.meter, G0 = S.green;
    const err = Math.abs(m - G0.c) / (G0.w / 2);
    const rel = { err, overstep: m > G0.c + G0.w / 2 + 0.16, early: m < 0.35 };
    S.rel = rel;
    S.relText = { text: err < 0.3 ? 'PERFECT RELEASE' : err <= 1 ? 'GOOD RELEASE' : rel.overstep ? 'OVERSTEP!' : m < G0.c ? 'TOO EARLY' : 'LATE', ok: err <= 1, t: 0 };
    S.del = playerDelivery(S, rel);
    S.del.relQ = err;
    // the bowler is wherever the run-up got to; release now
    release(S);
  }
  function setType(S, t) {
    if (!TYPE_INFO[t] || S.bp !== 'aim') return;
    const A = S.aim;
    if (A.type === t) return;
    A.type = t; A.z = TYPE_INFO[t].z;
    S.g.sfx('ui_click');
  }
  function cycleField(S) {
    const i = FIELD_ORDER.indexOf(S.fieldPreset);
    S.fieldPreset = FIELD_ORDER[(i + 1) % FIELD_ORDER.length];
    S.userField = S.fieldPreset;
    assignField(S);
    for (const a of S.actors) if (a.role === 'field' && a.spot) { a.tx = a.spot.x; a.tz = a.spot.z; }
    S.g.sfx('ui_select');
    say(S, 'Field change: ' + FIELDS[S.fieldPreset].name + '.', null, true);
  }

  /* ================================================================ replays */
  function snapshot(S) {
    const b = S.ball;
    const acts = S.actors.map((a) => [a.x, a.z, a.fx, a.fz, a.pose, a.ph, a.u, a.t, a.jump, a.batAng, a.hand ? a.hand[0] : null, a.hand ? a.hand[1] : null, a.sig, a.swing ? a.swing.t : -1, a.swing ? a.swing.dir : null]);
    return { t: S.ballClock, b: [b.x, b.y, b.z, b.vis && b.st !== 'held' ? 1 : 0], a: acts, s0: S.stumps[0].broken ? S.stumps[0].t : -1, s1: S.stumps[1].broken ? S.stumps[1].t : -1 };
  }
  function startReplay(S) {
    const ev = S.evt || {};
    const hitT = S.hit ? S.hit.at : null;
    const rec = S.rec;
    const t0 = hitT != null ? Math.max(rec[0].t, hitT - 0.7) : Math.max(rec[0].t, rec[rec.length - 1].t - 2.6);
    const t1 = rec[rec.length - 1].t;
    let cam = 'high';
    if (ev.kind === 'bowled' || (ev.kind === 'caught' && S.hit && S.hit.kind === 'edge')) cam = 'stump';
    else if (ev.kind === 'runout') cam = 'side';
    else if (ev.kind === 'caught') cam = 'side';
    S.rp = { t: t0, t0, t1, cam, speed: cam === 'stump' ? 0.38 : 0.55, tgt: { x: 0, y: 0, z: 10 } };
    S.bp = 'replay'; S.bt = 0;
    say(S, 'replay', null, false);
    S.g.sfx('rewind', { vol: 0.5 });
  }
  function replayUpdate(S, dt) {
    const rp = S.rp;
    rp.t += dt * rp.speed;
    if (rp.t >= rp.t1 + 0.3 || (!S.pm && S.g.pressed('go')) || S.skipReplay) { S.skipReplay = false; S.rp = null; finishBall(S); }
  }
  function replayFrame(S) {
    const rp = S.rp, rec = S.rec;
    let i = 0;
    while (i < rec.length - 1 && rec[i + 1].t <= rp.t) i++;
    const a = rec[i], b = rec[Math.min(rec.length - 1, i + 1)];
    const k = b.t > a.t ? clamp((rp.t - a.t) / (b.t - a.t), 0, 1) : 0;
    return { a, b, k };
  }

  /* ================================================================ cameras */
  function camFor(S, out) {
    const fr = S.fr, V = S.V;
    const cxy = () => { out.cx = fr.x + fr.w / 2; out.cy = fr.y + fr.h / 2; };
    cxy();
    const ph = S.phase;
    const gully = V.gully;
    if (ph === 'intro' || ph === 'init') {
      const t = S.intro ? S.intro.t : 0, a = -0.9 + t * 0.2;
      const R = gully ? 40 : 60;
      return camLook(out, Math.sin(a) * R, gully ? 14 : 30 - t * 2, V.cz + Math.cos(a) * R * 1.05, 0, 0, V.cz - 6, fr.h * 0.95);
    }
    if (ph === 'toss' || ph === 'toss_flip' || ph === 'toss_choose' || ph === 'toss_done') return camLook(out, 4.6, 1.5, 15.2, 0, 1.25, 9.5, fr.h * 1.05);
    if (ph === 'end') { const t = S.pt; return camLook(out, Math.sin(t * 0.25) * 24, 9 + t * 0.4, V.cz + 26 + Math.cos(t * 0.25) * 6, 0, 1.5, V.cz, fr.h * 1.35); }
    if (S.bp === 'replay' && S.rp) return replayCam(S, out);
    const live = S.phase === 'ball' && (S.bp === 'live' || S.bp === 'dead') && S.hit && S.hit.kind !== 'block' && (S.liveT > 0.18 || S.bp === 'dead');
    if (live) return fieldCam(S, out);
    if (S.camMode === 'fpv' && S.phase === 'ball') {
      if (meBowls(S)) {
        const bw = S.bowlerA; const bob = bw.spd > 0.5 || S.bp === 'runup' ? Math.sin(bw.ph * 2) * 0.05 : 0;
        const z = Math.max(bw.z + 0.35, PITCH - 0.6);
        return camLook(out, bw.x - 0.2, (S.bowler.look && S.bowler.look.small ? 1.35 : 1.68) + bob, z, 0.1, 0.5, 2.5, fr.h * 1.45);
      }
      return camLook(out, 0.22, 1.62, -0.95, 0, 0.5, 14, fr.h * 1.08);
    }
    // the TV broadcast camera: high behind the bowler's arm, long lens
    const T = gully ? TUNE.tvGully : TUNE.tv;
    return camLook(out, T.x, T.y, PITCH + T.back, 0, T.ty, T.tz, fr.h * T.f);
  }
  function fieldCam(S, out) {
    const fr = S.fr, V = S.V, b = S.ball;
    const T = S.fieldTgt;
    const behind = S.hit && Math.cos(S.hit.th) < -0.35;
    const P = behind ? { x: 0, y: V.gully ? 12 : 20, z: V.cz - V.rz - (V.gully ? 4 : 4) } : { x: 0, y: V.gully ? 12 : 22, z: V.cz + V.rz + (V.gully ? 4 : 5) };
    let tx = T.x, tz = T.z;
    if (!inside(V, tx, tz, -6)) { const a = Math.atan2(tx, tz - V.cz), e = ellR(V, a, -6); tx = e.x; tz = e.z; }
    const d = Math.hypot(tx - P.x, tz - P.z, P.y);
    const f = clamp(fr.w * d / (V.gully ? 34 : 58), fr.h * 1.0, fr.h * 5);
    void b;
    return camLook(out, P.x + tx * 0.2, P.y, P.z, tx, 0.5, tz, f);
  }
  function replayCam(S, out) {
    const fr = S.fr, rp = S.rp, V = S.V;
    const F = replayFrame(S), bx = lerp(F.a.b[0], F.b.b[0], F.k), bz = lerp(F.a.b[2], F.b.b[2], F.k);
    rp.tgt.x = lerp(rp.tgt.x, bx, 0.12); rp.tgt.z = lerp(rp.tgt.z, bz, 0.12);
    if (rp.cam === 'stump') return camLook(out, 0.7, 1.0, -3.4, 0, 0.6, 5, fr.h * 1.5);
    if (rp.cam === 'side') {
      const E = S.out.runoutEnd != null ? S.out.runoutEnd : null;
      if (E != null) return camLook(out, 12, 2.4, E ? PITCH - 0.6 : 0.6, 0, 0.6, E ? PITCH - 0.6 : 0.6, fr.h * 1.9);
      return camLook(out, V.gully ? 22 : 34, 8, 6, rp.tgt.x, 1, rp.tgt.z, fr.h * 2.1);
    }
    const P = { x: 0, y: V.gully ? 9 : 13, z: PITCH + (V.gully ? 12 : 20) };
    const d = Math.hypot(rp.tgt.x - P.x, rp.tgt.z - P.z, P.y);
    return camLook(out, P.x, P.y, P.z, rp.tgt.x, 0.8, rp.tgt.z, clamp(fr.w * d / 34, fr.h * 1.2, fr.h * 6));
  }
  function updateFieldTarget(S, dt) {
    const b = S.ball, T = S.fieldTgt;
    if (!S.hit) { T.x = 0; T.z = 8; return; }
    const k = 1 - Math.exp(-dt * 4.5);
    T.x = lerp(T.x, b.x, k); T.z = lerp(T.z, b.z, k);
  }

  /* ================================================================ drawing: frame + scene */
  const HF = () => N.minigames.helpers;
  function txt(ctx, s, x, y, o) { HF().text(ctx, s, x, y, o); }
  function font(kind, px, w) { return HF().font(kind, px, w); }
  function rr(ctx, x, y, w, h, r) { HF().rr(ctx, x, y, w, h, r); }

  function camStatic(S) {
    const ph = S.phase;
    if (ph === 'intro' || ph === 'end') return false;
    if (S.bp === 'replay') return S.rp && S.rp.cam === 'stump';
    if (S.camMode === 'fpv' && meBowls(S) && ph === 'ball') return false;
    if (ph === 'ball' && (S.bp === 'live' || S.bp === 'dead') && S.hit && S.hit.kind !== 'block') return false;
    return true;
  }
  function drawStatic(ctx, c, S) {
    const V = S.V;
    drawSky(ctx, c, S.fr, S);
    drawSkyline(ctx, c, V, S);
    drawGround(ctx, c, V, S);
    if (V.stands) { drawTowers(ctx, c, V, S); drawStands(ctx, c, V, S, S.celebrate); drawBoards(ctx, c, V, S); drawSightScreens(ctx, c, V, S); }
    else drawGully(ctx, c, V, S);
    drawPitch(ctx, c, V, S);
  }
  function drawScene(ctx, g, S) {
    const c = S.cam, fr = S.fr;
    const stat = camStatic(S) && !(S.celebrate > 0) && !(S.waveOn);
    if (stat) {
      const key = [fr.x, fr.y, fr.w, fr.h, g.dpr, c.x.toFixed(2), c.y.toFixed(2), c.z.toFixed(2), c.tx.toFixed(2), c.ty.toFixed(2), c.tz.toFixed(2), c.f.toFixed(1), Math.round(S.light * 24), S.lightsOn ? 1 : 0].join(',');
      if (S.bgKey !== key) {
        const cw = Math.round(fr.w * g.dpr), ch = Math.round(fr.h * g.dpr);
        const bg = S.bg || (S.bg = canvas(cw, ch));
        if (bg.width !== cw || bg.height !== ch) { bg.width = cw; bg.height = ch; }
        const bctx = bg.getContext('2d');
        const sv = { s: TX.s, ox: TX.ox, oy: TX.oy };
        TX.s = g.dpr; TX.ox = -fr.x * g.dpr; TX.oy = -fr.y * g.dpr;
        resetT(bctx);
        bctx.clearRect(fr.x, fr.y, fr.w, fr.h);
        try { drawStatic(bctx, c, S); } catch (e) { N.err('cricket.static', e); }
        TX.s = sv.s; TX.ox = sv.ox; TX.oy = sv.oy;
        S.bgKey = key; S.bgPaints = (S.bgPaints || 0) + 1;
      }
      ctx.drawImage(S.bg, fr.x, fr.y, fr.w, fr.h);
    } else {
      S.bgKey = null;
      drawStatic(ctx, c, S);
    }
    drawDynamic(ctx, c, S, g);
  }

  /* ---------------------------------------------------------------- dynamic layer */
  const GHOSTS = [];
  function actorsForView(S) {
    if (!(S.bp === 'replay' && S.rp)) return S.actors;
    const F = replayFrame(S), A = F.a.a, B = F.b.a, k = F.k;
    for (let i = 0; i < S.actors.length; i++) {
      const src = S.actors[i], a = A[i], b = B[i] || a;
      const gh = GHOSTS[i] || (GHOSTS[i] = {});
      gh.role = src.role; gh.team = src.team; gh.p = src.p; gh.kit = src.kit; gh.look = src.look; gh.num = src.num; gh.ump = src.ump; gh.idx = src.idx;
      if (!a) { gh.hide = true; continue; }
      gh.hide = false;
      gh.x = lerp(a[0], b[0], k); gh.z = lerp(a[1], b[1], k); gh.fx = a[2]; gh.fz = a[3]; gh.pose = a[4]; gh.ph = lerp(a[5], b[5], k); gh.u = lerp(a[6], b[6], k); gh.t = a[7]; gh.jump = a[8];
      gh.batAng = a[9]; gh.hand = a[10] != null ? [a[10], a[11]] : null; gh.sig = a[12];
      gh.swing = a[13] >= 0 ? { t: lerp(a[13], b[13] >= 0 ? b[13] : a[13], k), dir: a[14] } : null;
      gh.isBatA = src === S.batA; gh.isBatB = src === S.batB;
    }
    GHOSTS.length = S.actors.length;
    return GHOSTS;
  }
  function ballForView(S) {
    if (S.bp === 'replay' && S.rp) {
      const F = replayFrame(S), a = F.a.b, b = F.b.b, k = F.k;
      return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), z: lerp(a[2], b[2], k), vis: a[3] && b[3], trail: null };
    }
    const b = S.ball;
    if (b.st === 'held' && b.holder) return { x: b.holder.x + 0.25, y: 1.0, z: b.holder.z, vis: true, trail: null, held: true };
    return { x: b.x, y: b.y, z: b.z, vis: b.vis && b.st !== 'dead' && b.st !== 'dead2' && !(b.st === 'atEnd'), trail: b.st === 'free' || b.st === 'thrown' ? b.trail : null };
  }
  function viewOf(a, c) {
    const vx = c.x - a.x, vz = c.z - a.z, d = Math.hypot(vx, vz) || 1;
    const dot = (a.fx * vx + a.fz * vz) / d;
    if (dot > 0.5) return 'front';
    if (dot < -0.5) return 'back';
    return 'side';
  }
  function batterPose(S, a, o) {
    // a right-hander seen from the front (TV): hands and bat angle from the swing
    const sw = a.swing;
    const lifted = S.phase === 'ball' && (S.bp === 'runup' || S.bp === 'flight' || S.bp === 'past');
    let hand = [-6, -48], ang = Math.PI * 0.94;
    if (lifted && !sw) { const k = S.bp === 'runup' ? clamp(S.bt / (S.runT || 1) * 1.6 - 0.6, 0, 1) : 1; hand = [lerp(-6, 9, k), lerp(-48, -66, k)]; ang = lerp(Math.PI * 0.94, 0.55, k); }
    if (sw) {
      const t = sw.t;
      const end = sw.dir === 'off' ? [[-13, -82], -0.75] : sw.dir === 'leg' ? [[15, -66], 2.0] : sw.dir === 'block' ? [[-2, -54], Math.PI - 0.12] : [[-4, -86], -0.12];
      if (t < 0.1) { const k = t / 0.1; hand = [lerp(9, -3, k), lerp(-66, -48, k)]; ang = lerp(0.55, Math.PI, k); }
      else if (t < 0.34 || sw.dir === 'block') { const k = sw.dir === 'block' ? Math.min(1, (t - 0.1) / 0.08) : (t - 0.1) / 0.24; hand = [lerp(-3, end[0][0], smooth(k)), lerp(-48, end[0][1], smooth(k))]; ang = lerp(Math.PI, end[1] + (sw.dir === 'off' ? -TAU * 0 : 0), smooth(k)); if (sw.dir === 'off') ang = lerp(Math.PI, Math.PI * 2 - 0.75, smooth(k)); }
      else { hand = end[0]; ang = sw.dir === 'off' ? Math.PI * 2 - 0.75 : end[1]; }
    }
    o.hand = hand; o.batAng = ang; o.batPose = !sw || sw.dir === 'block' || sw.t > 0.5 ? true : false; o.batBehind = ang < 1.2 && ang > -1.2 && !sw;
  }
  function drawDynamic(ctx, c, S, g) {
    const V = S.V, fr = S.fr;
    const actors = actorsForView(S), ball = ballForView(S);
    const replay = S.bp === 'replay' && S.rp;
    // scoreboard high above the far stand
    if (V.stands) drawScoreboard(ctx, c, S);
    // ground decals: aim zone / marker, the pitch marker, the hit ring
    if (!replay) drawDecals(ctx, c, S);
    // shadows
    const P1 = { x: 0, y: 0, k: 0 }, P2 = { x: 0, y: 0, k: 0 };
    const night = S.light > 0.55;
    ctx.fillStyle = night ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    for (const a of actors) {
      if (a.hide || hiddenActor(S, a)) continue;
      const offs = night ? [[0.5, 0.4], [-0.5, 0.4], [0.5, -0.4], [-0.5, -0.4]] : [[S.sunX || 0.35, S.sunZ || 0.5]];
      for (const [ox, oz] of offs) {
        proj(c, a.x + ox * 0.6, 0.01, a.z + oz * 0.6, P1);
        if (!P1.ok || P1.k < 0.5) continue;
        const rx = P1.k * 0.42;
        proj(c, a.x + ox * 0.6, 0.01, a.z + oz * 0.6 + 0.4, P2);
        const ry = P2.ok ? Math.max(0.6, Math.abs(P2.y - P1.y)) : rx * 0.3;
        ctx.moveTo(P1.x + rx, P1.y); ctx.ellipse(P1.x, P1.y, rx, Math.min(rx, ry), 0, 0, TAU);
      }
    }
    ctx.fill();
    // sprites, far to near
    const spr = S._spr || (S._spr = []);
    spr.length = 0;
    for (const a of actors) { if (a.hide || hiddenActor(S, a)) continue; spr.push({ d: depth(c, a.x, 0.8, a.z), a }); }
    if (ball.vis) spr.push({ d: depth(c, ball.x, ball.y, ball.z), ball });
    for (const st of S.stumps) spr.push({ d: depth(c, 0, 0.4, st.z) + (st.z === 0 ? 0.6 : -0.6), st });
    spr.sort((p, q) => q.d - p.d);
    for (const s of spr) {
      if (s.d < c.near) continue;
      if (s.a) drawActor(ctx, c, S, s.a);
      else if (s.ball) drawBall(ctx, c, S, s.ball);
      else drawStumps(ctx, c, S, s.st);
    }
    // FPV: the batter's own bat at the bottom of the frame
    if (S.camMode === 'fpv' && S.phase === 'ball' && (S.pm ? meBats(S) || !meBowls(S) : playerBats(S)) && !replay && !(S.bp === 'live' && S.hit && S.liveT > 0.18) && S.bp !== 'dead') drawFpvBat(ctx, S);
    void fr; void g;
  }
  function hiddenActor(S, a) {
    if (S.camMode !== 'fpv' || S.phase !== 'ball' || S.bp === 'replay') return false;
    if (S.bp === 'live' && S.hit && S.liveT > 0.18) return false;
    if (S.bp === 'dead' && S.hit) return false;
    if (meBowls(S)) return a === S.bowlerA;
    if (S.pm || playerBats(S)) return a === S.batA || a.isBatA;
    return false;
  }
  const AP = { x: 0, y: 0, k: 0 }, AH = { x: 0, y: 0, k: 0 };
  function drawActor(ctx, c, S, a) {
    const tall = a.ump ? 1.62 : a.p && a.p.look && a.p.look.small ? 1.12 : 1.42;
    proj(c, a.x, 0, a.z, AP);
    if (!AP.ok) return;
    proj(c, a.x, tall, a.z, AH);
    if (!AH.ok) return;
    const hp = Math.hypot(AP.x - AH.x, AP.y - AH.y);
    if (hp < 1.5 || hp > 2600) return;
    if (AP.x < S.fr.x - hp || AP.x > S.fr.x + S.fr.w + hp) return;
    let view = viewOf(a, c);
    let flip = 1;
    if (view === 'side') flip = a.fx * c.rx + a.fz * c.rz >= 0 ? 1 : -1;
    const o = { kit: a.kit, look: a.look, view, flip, pose: a.pose, ph: a.ph, u: a.u, t: a.t, jump: a.jump, num: a.num, ump: a.ump, signal: a.sig };
    const isStriker = a === S.batA || a.isBatA, isNon = a === S.batB || a.isBatB;
    const running = (isStriker || isNon) && (a.pose === 'run');
    if (a.role === 'bat' || isStriker || isNon) {
      o.pads = true; o.helmet = !(a.look && (a.look.small || a.look.ponytails)); o.gloves = 'bat'; o.bat = true;
      if (isStriker && !running && S.phase === 'ball' && (S.bp !== 'live' || !S.run || (!S.run.active && !S.run.done))) {
        o.view = view = view === 'back' ? 'back' : 'front';
        batterPose(S, a, o);
        if (view === 'back') o.mirror = true;
      } else if (running) { o.hand = [14, -50]; o.batAng = Math.PI * 0.62; }
      else { o.hand = [13, -47]; o.batAng = Math.PI * 0.9; }
    }
    if (a.role === 'keeper' || (a.p && a.p.keeper && a.pose === 'keep')) { o.pads = true; o.gloves = 'keep'; }
    if (a.role === 'field' || a.role === 'bowler' || a.role === 'keeper') o.noCap = a.p && a.p.look && (a.p.look.ponytails || a.p.look.puff);
    if (o.mirror) { ctx.save(); ctx.translate(AP.x, 0); ctx.scale(-1, 1); ctx.translate(-AP.x, 0); }
    drawPerson(ctx, AP.x, AP.y, hp, o);
    if (o.mirror) ctx.restore();
    // a name tag over the striker/bowler in close views
    if (hp > 60 && S.phase.indexOf('toss') === 0 && a.p && S.tossCaps) {
      const left = a === S.tossCaps[0];
      txt(ctx, a.p.name.toUpperCase(), AP.x + (left ? -hp * 0.12 : hp * 0.12), AP.y + Math.min(20, hp * 0.1), { font: 'osd', size: Math.min(20, hp * 0.11), color: left ? '#9fe8dc' : '#ffb4a6', outline: 3, align: left ? 'right' : 'left' });
    }
  }
  function drawBall(ctx, c, S, b) {
    const p = proj(c, b.x, b.y, b.z, { x: 0, y: 0, k: 0 });
    if (!p.ok) return;
    const V = S.V;
    // ground shadow (helps to judge the length)
    const sp = proj(c, b.x, 0.005, b.z, { x: 0, y: 0, k: 0 });
    const r = Math.max(V.gully ? 2.4 : 2.1, p.k * BALL_R * 2.1);
    if (sp.ok && b.y < 25) { ctx.fillStyle = 'rgba(0,0,0,' + clamp(0.4 - b.y * 0.03, 0.08, 0.4).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, Math.max(1.4, sp.k * 0.06), Math.max(0.8, sp.k * 0.025), 0, 0, TAU); ctx.fill(); }
    if (b.trail && b.trail.length >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = Math.max(1, r * 0.8); ctx.lineCap = 'round';
      ctx.beginPath(); let first = true;
      const q = { x: 0, y: 0 };
      for (let i = Math.max(0, b.trail.length - 18); i < b.trail.length; i += 3) { proj(c, b.trail[i], b.trail[i + 1], b.trail[i + 2], q); if (!q.ok) continue; if (first) { ctx.moveTo(q.x, q.y); first = false; } else ctx.lineTo(q.x, q.y); }
      ctx.lineTo(p.x, p.y); ctx.stroke();
    } else if (S.bp === 'flight' && S.del) {
      // a short streak behind the delivery
      const q = proj(c, b.x - S.del.vx1 * 0.03, b.y + 0.02, b.z - (S.del.vz1 || -20) * 0.03, { x: 0, y: 0 });
      if (q.ok) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(1, r * 0.9); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    }
    if (S.light > 0.45 && !V.gully) { ctx.fillStyle = 'rgba(255,255,240,0.25)'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = V.ball; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,20,0.55)'; ctx.lineWidth = Math.max(0.6, r * 0.25); ctx.stroke();
    if (r > 3) { ctx.strokeStyle = V.seam; ctx.lineWidth = Math.max(0.6, r * 0.18); ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.62, -1.1, 1.1); ctx.stroke(); }
  }
  function drawStumps(ctx, c, S, st) {
    const p0 = { x: 0, y: 0, k: 0 }, p1 = { x: 0, y: 0, k: 0 };
    const t = st.broken ? st.t : 0;
    ctx.lineCap = 'butt';
    for (let i = -1; i <= 1; i++) {
      const x = i * STUMP_X;
      proj(c, x, 0, st.z, p0);
      if (!p0.ok) continue;
      let tx = x, ty = STUMP_H, tz = st.z;
      if (st.broken) { const k = Math.min(1, t * 3); tx = x + Math.sin(k * (0.5 + i * 0.4)) * 0.45 * (i || 0.6); ty = STUMP_H * Math.cos(k * 0.9 * (i === 0 ? 1.1 : 0.7)); tz = st.z - k * (st.z ? -0.4 : 0.45); }
      proj(c, tx, ty, tz, p1);
      if (!p1.ok) continue;
      ctx.strokeStyle = S.V.gully ? '#8a5a30' : '#f2e6c8'; ctx.lineWidth = Math.max(1, p0.k * 0.036);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    // bails
    const bk = st.broken ? Math.min(1.6, t) : 0;
    ctx.strokeStyle = S.V.gully ? '#6a4a2a' : '#e8d2a0';
    for (const s of [-1, 1]) {
      const bx = s * STUMP_X * 0.5, by = STUMP_H + 0.012 + (bk ? bk * 2.2 - bk * bk * 1.4 : 0), bz = st.z + (bk ? (st.z ? 1 : -1) * bk * 0.8 : 0), dx = bk ? s * bk * 0.5 : 0;
      proj(c, bx - STUMP_X * 0.5 + dx, by, bz, p0); proj(c, bx + STUMP_X * 0.5 + dx, by + (bk ? s * 0.05 : 0), bz, p1);
      if (!p0.ok || !p1.ok) continue;
      ctx.lineWidth = Math.max(1, p0.k * 0.03);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
  }
  function groundCircle(ctx, c, x, z, r, n) {
    n = n || 18;
    ctx.beginPath();
    let ok = false;
    const q = { x: 0, y: 0 };
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      proj(c, x + Math.cos(a) * r, 0.015, z + Math.sin(a) * r, q);
      if (!q.ok) return false;
      if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      ok = true;
    }
    ctx.closePath();
    return ok;
  }
  function drawDecals(ctx, c, S) {
    if (S.phase !== 'ball') return;
    const del = S.del, g = S.g;
    // the player's aim
    if (meBowls(S) && (S.bp === 'aim' || S.bp === 'runup')) {
      const A = S.aim, ti = TYPE_INFO[A.type];
      const zc = A.type === 'bouncer' ? '255,90,74' : A.type === 'yorker' ? '255,216,74' : A.type === 'spin' ? '197,139,255' : '127,216,255';
      ctx.fillStyle = 'rgba(' + zc + ',0.22)';
      if (quadPath(ctx, c, -1.5, 0.012, ti.zone[0], 1.5, 0.012, ti.zone[0], 1.5, 0.012, ti.zone[1], -1.5, 0.012, ti.zone[1])) { ctx.fill(); ctx.strokeStyle = 'rgba(' + zc + ',0.6)'; ctx.lineWidth = 1; ctx.stroke(); }
      const mx = S.bp === 'aim' ? A.wx : A.lx, mz = S.bp === 'aim' ? A.wz : A.lz;
      if (S.bp === 'aim') { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); if (groundCircle(ctx, c, A.x, A.z, 0.42)) ctx.stroke(); ctx.setLineDash([]); }
      const col = S.bp === 'aim' ? '#ffd84a' : '#ffffff';
      if (groundCircle(ctx, c, mx, mz, 0.3)) { ctx.fillStyle = 'rgba(255,216,74,0.35)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke(); }
      // a little beacon above the marker so it reads from the TV camera
      const p0 = proj(c, mx, 0.02, mz, { x: 0, y: 0 }), p1 = proj(c, mx, 0.55, mz, { x: 0, y: 0 });
      if (p0.ok && p1.ok) {
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p1.x, p1.y + 2); ctx.lineTo(p1.x - 6, p1.y - 8); ctx.lineTo(p1.x + 6, p1.y - 8); ctx.closePath(); ctx.fill();
      }
    }
    // the length indicator: where the delivery will pitch
    if (del && del.B && (S.bp === 'flight' || S.bp === 'past')) {
      const t = S.clock - del.tRel;
      const showT = g.diff > 0.75 && !g.assist ? 0.28 : 10;
      if (t < del.tB + 0.35 && t < showT) {
        const col = del.spin ? '#c58bff' : del.len === 'bouncer' || del.len === 'short' ? '#ff6a5a' : del.len === 'yorker' ? '#ffd84a' : '#7fd8ff';
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        if (groundCircle(ctx, c, del.B.x, del.B.z, 0.3)) { ctx.globalAlpha = 0.9; ctx.stroke(); ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1; }
      }
    }
    // the timing ring at the batter (assist / easier settings)
    if (del && S.bp === 'flight' && meBats(S) && (g.diff < 0.7 || g.assist)) {
      const left = del.tRel + del.tA - S.clock;
      if (left < 0.55 && left > -0.05) {
        const r = 0.22 + Math.max(0, left) * 1.5;
        ctx.strokeStyle = left < windows(S).g ? '#b9ffb0' : 'rgba(255,216,74,0.8)'; ctx.lineWidth = 2;
        if (groundCircle(ctx, c, del.A.x, HIT_Z, r, 22)) ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        if (groundCircle(ctx, c, del.A.x, HIT_Z, 0.22, 16)) ctx.stroke();
      }
    }
  }
  function drawFpvBat(ctx, S) {
    const fr = S.fr, sw = S.batA.swing;
    const cx = fr.x + fr.w * 0.7, by = fr.y + fr.h * 1.04;
    let ang = -0.45, lift = 0;
    if (S.bp === 'runup' || S.bp === 'flight') lift = 0.35;
    if (sw) { const t = sw.t, k = clamp(t / 0.18, 0, 1); const end = sw.dir === 'off' ? 1.1 : sw.dir === 'leg' ? -1.6 : sw.dir === 'block' ? -0.05 : -0.9; ang = lerp(0.6, end, smooth(k)); lift = 0; }
    else ang = -0.45 + lift;
    const L = fr.h * 0.56, W = fr.h * 0.07;
    ctx.save(); ctx.translate(cx, by + fr.h * 0.05); ctx.rotate(ang);
    ctx.fillStyle = '#2a1d1a'; ctx.fillRect(-W * 0.18, -L * 0.42, W * 0.36, L * 0.42);
    ctx.fillStyle = '#f4f2ea'; rr(ctx, -W * 0.55, -L * 0.36, W * 1.1, L * 0.12, W * 0.3); ctx.fill();
    ctx.fillStyle = '#e2c48a'; rr(ctx, -W / 2, -L, W, L * 0.6, W * 0.25); ctx.fill();
    ctx.strokeStyle = '#a6834a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-W * 0.35, -L * 0.98, W * 0.18, L * 0.55);
    ctx.restore();
  }
  function drawScoreboard(ctx, c, S) {
    const V = S.V, a = Math.PI + 0.42;
    const p = ellR(V, a, 30), q = { x: 0, y: 0, k: 0 }, q2 = { x: 0, y: 0, k: 0 };
    proj(c, p.x, 26, p.z, q); proj(c, p.x, 19, p.z, q2);
    if (!q.ok || !q2.ok) return;
    const k = q.k, w = k * 22, h = Math.abs(q2.y - q.y) || k * 7;
    if (w < 8) return;
    const x = q.x - w / 2, y = q.y;
    ctx.fillStyle = '#4a4e58'; ctx.fillRect(q.x - w * 0.36, y + h, w * 0.04, k * 12); ctx.fillRect(q.x + w * 0.32, y + h, w * 0.04, k * 12);
    ctx.fillStyle = '#101418'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#c9c3b8'; ctx.lineWidth = Math.max(1, k * 0.3); ctx.strokeRect(x, y, w, h);
    if (w > 40) {
      const inn = S.inn || S.innings[S.innings.length - 1];
      const col = S.light > 0.4 ? '#ffd84a' : '#f2c230';
      txt(ctx, (inn ? inn.bat.short + '  ' + rules.score(inn) : S.home.short + '  0/0'), q.x, y + h * 0.33, { font: 'osd', size: h * 0.3, color: col, maxW: w * 0.92 });
      txt(ctx, inn ? 'OVERS ' + oversText(inn.balls) + (inn.target ? '   TARGET ' + inn.target : '') : 'LB STADIUM', q.x, y + h * 0.72, { font: 'osd', size: h * 0.22, color: '#f4efe2', maxW: w * 0.92 });
    }
  }

  /* ================================================================ broadcast overlays */
  function uiScale(S) { return clamp(S.fr.h / 34, 10, 21); }
  function drawOverlays(ctx, g, S) {
    const fr = S.fr, u = uiScale(S), V = S.V;
    S.hits.length = 0;
    // TV safe-area vignette
    const vg = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, fr.h * 0.35, fr.x + fr.w / 2, fr.y + fr.h / 2, fr.h * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = vg; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    if (S.phase === 'intro') { drawIntroCard(ctx, S, u); }
    if (S.phase.indexOf('toss') === 0) drawToss(ctx, g, S, u);
    if (S.inn || S.innings.length) drawScoreBug(ctx, S, u);
    drawChannel(ctx, S, u);
    if (S.phase === 'ball') drawBallUi(ctx, g, S, u);
    if (S.bp === 'replay' && S.rp && S.phase === 'ball') drawReplayUi(ctx, S, u);
    if (S.msg && S.msg.t < 1.9 && S.bp !== 'replay') drawMsg(ctx, S, u);
    if (S.thirdUmp && S.thirdUmp.t < 2.6) drawThirdUmp(ctx, S, u);
    if (S.banner && (S.phase === 'inn_intro' || S.phase === 'over_break' || S.phase === 'inn_break' || S.phase === 'end' || S.phase === 'toss_done')) drawBanner(ctx, g, S, u);
    if (S.fieldShown > 0 && S.phase === 'ball' && !S.panelR) drawFieldMap(ctx, S, fr.x + fr.w - u * 5.2, fr.y + u * 7.2, u * 4.6);
    if (!(S.barB && S.barB.h >= u * 2.6)) drawTicker(ctx, S, u);
    // the camera pill (also clickable)
    if (S.phase === 'ball' || S.phase === 'inn_intro' || S.phase === 'over_break') {
      const w = u * 4.4, h = u * 1.6, x = fr.x + fr.w - w - u * 0.5, y = fr.y + fr.h - h - u * (S.tickerIn ? 2.6 : 0.5);
      ctx.fillStyle = 'rgba(10,12,30,0.6)'; rr(ctx, x, y, w, h, h / 2); ctx.fill();
      ctx.strokeStyle = 'rgba(234,242,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      txt(ctx, (S.camMode === 'fpv' ? '◉ FPV' : '▣ TV') + ' CAM', x + w / 2, y + h / 2 + 1, { font: 'osd', size: u * 0.9, color: '#eaf2ff' });
      S.hits.push({ x, y, w, h, a: 'cam' });
    }
    if (S.pm) pmOverlay(ctx, g, S, u);
  }
  function drawChannel(ctx, S, u) {
    const fr = S.fr, x = fr.x + fr.w - u * 0.7, y = fr.y + u * 0.7;
    txt(ctx, 'CH7', x, y + u * 0.8, { font: 'display', size: u * 1.3, color: 'rgba(255,255,255,0.8)', align: 'right', outline: 2, stroke: 'rgba(0,0,0,0.4)' });
    if (S.bp !== 'replay') {
      const on = Math.floor(S.clock * 1.6) % 2 === 0;
      ctx.font = font('display', u * 1.3);
      const cw = ctx.measureText('CH7').width;
      const lx = x - cw - u * 3.4;
      ctx.fillStyle = 'rgba(178,43,43,0.85)'; rr(ctx, lx, y + u * 0.2, u * 2.9, u * 1.15, u * 0.2); ctx.fill();
      ctx.fillStyle = on ? '#ffffff' : '#f2b0a8'; ctx.beginPath(); ctx.arc(lx + u * 0.5, y + u * 0.78, u * 0.2, 0, TAU); ctx.fill();
      txt(ctx, 'LIVE', lx + u * 0.85, y + u * 0.82, { font: 'osd', size: u * 0.85, color: '#fff', align: 'left' });
    }
  }
  function drawScoreBug(ctx, S, u) {
    const fr = S.fr, inn = S.inn || S.innings[S.innings.length - 1];
    if (!inn) return;
    const x = fr.x + u * 0.6, y = fr.y + u * 0.6;
    const h1 = u * 1.55, h2 = u * 1.2;
    ctx.font = font('osd', u * 1.15);
    const parts = [inn.bat.short, rules.score(inn), 'Ov ' + oversText(inn.balls)];
    if (inn.target) parts.push('Target ' + inn.target);
    const w0 = ctx.measureText(parts[0]).width + u * 0.8;
    let w = u * 2.4 + w0;
    const ws = parts.slice(1).map((s) => ctx.measureText(s).width + u * 1.1);
    for (const v of ws) w += v;
    w = Math.min(w, fr.w - u * 1.2);
    // top row: dark blue box, yellow team, white digits
    let gr = ctx.createLinearGradient(0, y, 0, y + h1);
    gr.addColorStop(0, '#2f4fb0'); gr.addColorStop(1, '#14246a');
    ctx.fillStyle = gr; ctx.fillRect(x, y, w, h1);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(x, y, u * 2.0, h1);
    txt(ctx, '7', x + u * 1.0, y + h1 / 2 + 1, { font: 'display', size: u * 1.2, color: '#14246a' });
    let cx = x + u * 2.4;
    txt(ctx, parts[0], cx, y + h1 / 2 + 1, { font: 'osd', size: u * 1.15, color: '#ffd84a', align: 'left' }); cx += w0;
    parts.slice(1).forEach((s, i) => {
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - u * 0.45, y + h1 * 0.2, 1, h1 * 0.6);
      txt(ctx, s, cx, y + h1 / 2 + 1, { font: 'osd', size: u * 1.15, color: i === 0 ? '#ffffff' : '#cfe0ff', align: 'left' });
      cx += ws[i];
    });
    // second row: batters + bowler
    if (S.inn && S.phase === 'ball' || S.phase === 'over_break') {
      const a = inn.cards[inn.striker], b = inn.cards[inn.non];
      const f = S.bowler ? inn.figs[S.bowler.name] : null;
      const s2 = a.name + '* ' + a.runs + '(' + a.balls + ')   ' + b.name + ' ' + b.runs + '(' + b.balls + ')' + (S.bowler ? '   ' + S.bowler.name + ' ' + (f ? f.wkts + '-' + f.runs : '0-0') : '');
      ctx.font = font('osd', u * 0.92);
      const w2 = Math.min(fr.w - u * 1.2, ctx.measureText(s2).width + u * 1.2);
      ctx.fillStyle = 'rgba(10,14,40,0.82)'; ctx.fillRect(x, y + h1, w2, h2);
      txt(ctx, s2, x + u * 0.6, y + h1 + h2 / 2 + 1, { font: 'osd', size: u * 0.92, color: '#eaf2ff', align: 'left', maxW: w2 - u });
    }
    // speed gun
    if (S.speedGun && S.speedGun.t < 3.5 && S.phase === 'ball' && S.bp !== 'replay') {
      const sy = y + h1 + h2 + u * 0.4;
      ctx.fillStyle = 'rgba(178,43,43,0.88)'; ctx.fillRect(x, sy, u * 5.2, u * 1.3);
      txt(ctx, S.speedGun.v + ' km/h', x + u * 2.6, sy + u * 0.68, { font: 'osd', size: u * 1.0, color: '#fff' });
    }
  }
  function drawTicker(ctx, S, u) {
    const fr = S.fr, c = S.comm;
    S.tickerIn = false;
    if (!c.text) return;
    const outside = S.barB && S.barB.h >= u * 2.6;
    const h = u * 1.8;
    const x = outside ? S.barB.x + u * 0.4 : fr.x + u * 0.6, w = outside ? S.barB.w - u * 0.8 : fr.w - u * 1.2;
    const y = outside ? S.barB.y + Math.min(u * 0.5, (S.barB.h - h) / 2) : fr.y + fr.h - h - u * 0.5;
    S.tickerIn = !outside;
    ctx.fillStyle = 'rgba(8,10,26,0.78)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#b22b2b'; ctx.fillRect(x, y, u * 3.8, h);
    txt(ctx, 'COMM', x + u * 1.9, y + h / 2 + 1, { font: 'osd', size: u * 1.0, color: '#fff' });
    const s = c.text.slice(0, Math.floor(c.shown));
    ctx.save(); ctx.beginPath(); ctx.rect(x + u * 4.2, y, w - u * 4.4, h); ctx.clip();
    ctx.font = font('body', u * 0.95, 600);
    const tw = ctx.measureText(c.text).width, room = w - u * 4.8;
    const off = tw > room ? Math.min(tw - room, Math.max(0, (c.t - 1.2) * u * 5)) : 0;
    txt(ctx, s, x + u * 4.5 - off, y + h / 2 + 1, { font: 'body', weight: 600, size: u * 0.95, color: '#f4efe2', align: 'left' });
    ctx.restore();
  }
  function drawMsg(ctx, S, u) {
    const m = S.msg, fr = S.fr;
    const k = Math.min(1, m.t / 0.18), a = m.t > 1.5 ? 1 - (m.t - 1.5) / 0.4 : 1;
    const y = fr.y + fr.h * (m.big ? 0.36 : 0.3);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(fr.x + fr.w / 2, y);
    const sc = 0.6 + 0.4 * HF().ease.outBack(k); ctx.scale(sc, sc);
    const size = m.big ? u * 3.2 : u * 2.0;
    ctx.font = font('display', size);
    const w = Math.min(fr.w * 0.9, ctx.measureText(m.text).width + u * 3);
    ctx.fillStyle = m.big ? 'rgba(20,36,106,0.85)' : 'rgba(10,12,30,0.6)';
    ctx.beginPath(); ctx.moveTo(-w / 2 + u, -size * 0.75); ctx.lineTo(w / 2 + u, -size * 0.75); ctx.lineTo(w / 2 - u, size * 0.6); ctx.lineTo(-w / 2 - u, size * 0.6); ctx.closePath(); ctx.fill();
    if (m.big) { ctx.fillStyle = m.col; ctx.fillRect(-w / 2, size * 0.6 - u * 0.25, w, u * 0.25); }
    txt(ctx, m.text, 0, 0, { font: 'display', size, color: m.col, outline: Math.max(3, u * 0.35), maxW: w - u });
    if (m.sub) txt(ctx, m.sub, 0, size * 0.6 + u * 1.1, { font: 'osd', size: u * 1.1, color: '#ffffff', outline: 3, maxW: fr.w * 0.9 });
    ctx.restore();
  }
  function drawThirdUmp(ctx, S, u) {
    const t = S.thirdUmp.t, fr = S.fr;
    const w = fr.w * 0.62, h = u * 6, x = fr.x + (fr.w - w) / 2, y = fr.y + fr.h * 0.5 - h / 2;
    ctx.fillStyle = 'rgba(8,8,16,0.88)'; ctx.fillRect(x, y, w, h);
    if (t < 1.2) {
      txt(ctx, 'THIRD UMPIRE', x + w / 2, y + h * 0.35, { font: 'osd', size: u * 1.6, color: '#eaf2ff' });
      txt(ctx, 'DECISION PENDING' + '...'.slice(0, 1 + (Math.floor(t * 4) % 3)), x + w / 2, y + h * 0.7, { font: 'osd', size: u * 1.1, color: '#ffd84a' });
    } else {
      const out = S.thirdUmp.out;
      ctx.fillStyle = out ? '#c0282a' : '#2a9a4a'; ctx.fillRect(x + u * 0.4, y + u * 0.4, w - u * 0.8, h - u * 0.8);
      txt(ctx, out ? 'OUT' : 'NOT OUT', x + w / 2, y + h / 2 + 1, { font: 'display', size: u * 3, color: '#fff', outline: 4 });
    }
  }
  function drawIntroCard(ctx, S, u) {
    const fr = S.fr, t = S.intro.t;
    const a = clamp(t / 0.4, 0, 1) * (t > 3.6 ? clamp(1 - (t - 3.6) / 0.4, 0, 1) : 1);
    ctx.save(); ctx.globalAlpha = a;
    const w = Math.min(fr.w * 0.86, u * 30), h = u * 4.6, x = fr.x + (fr.w - w) / 2, y = fr.y + fr.h * 0.62;
    ctx.fillStyle = 'rgba(20,36,106,0.86)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(x, y, w, u * 0.3);
    txt(ctx, S.V.gully ? 'LIVE · ' + S.V.long.toUpperCase() : 'LIVE · LAL BAHADUR STADIUM, HYDERABAD', x + w / 2, y + h * 0.32, { font: 'osd', size: u * 1.15, color: '#ffd84a', maxW: w - u });
    txt(ctx, S.home.name + '  vs  ' + S.away.name, x + w / 2, y + h * 0.66, { font: 'display', size: u * 1.6, color: '#fff', maxW: w - u });
    ctx.restore();
  }
  function hitButton(ctx, S, u, x, y, w, h, label, sub, a, col) {
    HF().sign(ctx, x, y, w, h, { fill: col || '#f2c230', text: label, size: Math.min(h * 0.46, u * 1.9), bolts: w > 60 });
    if (sub) txt(ctx, sub, x + w / 2, y + h + u * 0.7, { font: 'osd', size: u * 0.9, color: '#eaf2ff', outline: 3 });
    S.hits.push({ x, y, w, h, a });
  }
  function drawToss(ctx, g, S, u) {
    const fr = S.fr, T = S.toss;
    if (!T) return;
    // the coin
    let cy = fr.y + fr.h * 0.33, spin = 1, face = null;
    if (S.phase === 'toss_flip') {
      const t = clamp(S.pt / 1.5, 0, 1);
      cy -= Math.sin(t * Math.PI) * fr.h * 0.3;
      spin = Math.cos(S.pt * 22);
      if (t >= 1) { spin = 1; face = T.side; }
    } else if (S.phase !== 'toss') { face = T.side; }
    const R = u * 2.6, cx = fr.x + fr.w / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, Math.max(0.08, Math.abs(spin)));
    ctx.fillStyle = '#b8b8b0'; ctx.beginPath(); ctx.arc(0, R * 0.12, R, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e6e4da'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#9a9890'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.84, 0, TAU); ctx.stroke();
    const showHeads = face ? face === 'heads' : spin > 0;
    if (showHeads) { // a simple emblem: a pillar with rays (no real coin art)
      ctx.fillStyle = '#8a887e'; ctx.fillRect(-R * 0.12, -R * 0.4, R * 0.24, R * 0.75);
      for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 3.5) * 0.28; ctx.fillRect(Math.cos(a) * R * 0.5 - 1, Math.sin(a) * R * 0.5 - 1, 3, 3); }
    } else txt(ctx, '₹1', 0, 2, { font: 'display', size: R * 0.8, color: '#7a786e' });
    ctx.restore();
    if (S.phase === 'toss') {
      txt(ctx, 'THE TOSS', fr.x + fr.w / 2, fr.y + fr.h * 0.12, { font: 'display', size: u * 2.2, color: '#ffd84a', outline: 5 });
      txt(ctx, S.home.players[0].name + ', call it!', fr.x + fr.w / 2, fr.y + fr.h * 0.12 + u * 2, { font: 'osd', size: u * 1.2, color: '#fff', outline: 3 });
      const bw = Math.min(fr.w * 0.34, u * 9), bh = u * 2.8, by = fr.y + fr.h * 0.74;
      if (!g.touch) { hitButton(ctx, S, u, cx - bw - u, by, bw, bh, 'HEADS', '← / A', 'left'); hitButton(ctx, S, u, cx + u, by, bw, bh, 'TAILS', '→ / D', 'right'); }
    } else if (S.phase === 'toss_choose') {
      txt(ctx, 'You won the toss!', fr.x + fr.w / 2, fr.y + fr.h * 0.12, { font: 'display', size: u * 2, color: '#b9ffb0', outline: 5 });
      const bw = Math.min(fr.w * 0.34, u * 9), bh = u * 2.8, by = fr.y + fr.h * 0.74;
      if (!g.touch) { hitButton(ctx, S, u, cx - bw - u, by, bw, bh, 'BAT', '← bat first', 'left', '#f2c230'); hitButton(ctx, S, u, cx + u, by, bw, bh, 'BOWL', '→ bowl first', 'right', '#7fd8ff'); }
      else txt(ctx, 'Bat first or bowl first?', fr.x + fr.w / 2, fr.y + fr.h * 0.12 + u * 2, { font: 'osd', size: u * 1.2, color: '#fff', outline: 3 });
    } else if (S.phase === 'toss_done' || (S.phase === 'toss_flip' && S.pt > 1.5)) {
      const won = T.won;
      txt(ctx, T.side ? T.side.toUpperCase() + '!' : '', fr.x + fr.w / 2, fr.y + fr.h * 0.12, { font: 'display', size: u * 2.2, color: '#ffd84a', outline: 5 });
      if (S.phase === 'toss_done') txt(ctx, (won ? S.home.name : S.away.name) + ' will ' + T.choice + ' first', fr.x + fr.w / 2, fr.y + fr.h * 0.8, { font: 'display', size: u * 1.5, color: '#fff', outline: 5, maxW: fr.w * 0.9 });
    }
  }
  function drawBanner(ctx, g, S, u) {
    const fr = S.fr, B = S.banner;
    const a = clamp(B.t / 0.25, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    const w = Math.min(fr.w * 0.9, u * 32), h = u * (B.over ? 6.6 : 5.2), x = fr.x + (fr.w - w) / 2, y = fr.y + fr.h * (S.phase === 'end' ? 0.28 : 0.6) - (S.phase === 'end' ? 0 : h * 0.5);
    ctx.fillStyle = B.win === false ? 'rgba(80,20,24,0.9)' : 'rgba(20,36,106,0.9)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(x, y, w, u * 0.3); ctx.fillRect(x, y + h - u * 0.3, w, u * 0.3);
    txt(ctx, B.title, x + w / 2, y + u * 1.7, { font: 'display', size: u * 2.0, color: B.win === false ? '#ffb4a6' : '#ffd84a', maxW: w - u, outline: 3 });
    txt(ctx, B.sub, x + w / 2, y + u * 3.5, { font: 'osd', size: u * 1.1, color: '#ffffff', maxW: w - u });
    if (B.over) {
      const balls = B.over.balls, n = balls.length, bw = u * 1.6;
      balls.forEach((s, i) => {
        const bx = x + w / 2 + (i - (n - 1) / 2) * bw * 1.15, by = y + u * 5.2;
        ctx.fillStyle = s === 'W' ? '#c0282a' : s === '4' ? '#2a6ae8' : s === '6' ? '#7a3db8' : /wd|nb/.test(s) ? '#5a5e66' : '#f4efe2';
        ctx.beginPath(); ctx.arc(bx, by, bw * 0.48, 0, TAU); ctx.fill();
        txt(ctx, s === '0' ? '•' : s, bx, by + 1, { font: 'osd', size: s.length > 2 ? u * 0.62 : u * 0.9, color: /^[0-3]$/.test(s) ? '#1a1214' : '#fff' });
      });
    }
    ctx.restore();
    if (S.phase !== 'end' && B.t > 0.6 && Math.floor(S.clock * 2) % 2 === 0) txt(ctx, g.touch ? 'tap to continue' : 'Space / Enter to continue', fr.x + fr.w / 2, y + h + u * 1.2, { font: 'osd', size: u * 1.0, color: '#eaf2ff', outline: 3 });
    S.hits.push({ x: fr.x, y: fr.y, w: fr.w, h: fr.h, a: 'go' });
  }
  function drawBallUi(ctx, g, S, u) {
    const fr = S.fr, inn = S.inn;
    // chase strip (in the top letterbox bar when there is one; see drawPanels)
    if (inn && inn.target && S.bp !== 'replay' && !(S.barT && S.barT.h > u * 2)) {
      const need = rules.need(inn), left = rules.ballsLeft(inn);
      txt(ctx, 'NEED ' + need + ' OFF ' + left, fr.x + fr.w / 2, fr.y + u * 5.0, { font: 'osd', size: u * 1.1, color: '#eaf2ff', outline: 3 });
    }
    // bowling: type chips, release meter, prompts
    if (S.pm && !meBowls(S) && !meBats(S)) pmWatchUi(ctx, g, S, u);
    else if (meBowls(S)) {
      if (S.bp === 'aim') {
        const ty = g.touch ? [] : ['pace', 'spin', 'yorker', 'bouncer'];
        const cw = Math.min(u * 5.4, (fr.w - u * 2) / 4.3), ch = g.touch ? 0 : u * 1.7, y = fr.y + fr.h - ch - u * (S.tickerIn ? 2.8 : 0.8);
        ty.forEach((t, i) => {
          const x = fr.x + u * 0.8 + i * (cw + u * 0.3), on = S.aim.type === t;
          ctx.fillStyle = on ? '#f2c230' : 'rgba(10,12,30,0.72)'; rr(ctx, x, y, cw, ch, u * 0.4); ctx.fill();
          ctx.strokeStyle = on ? '#1a1214' : 'rgba(234,242,255,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
          txt(ctx, (g.touch ? '' : (i + 1) + ' ') + TYPE_INFO[t].name, x + cw / 2, y + ch / 2 + 1, { font: 'osd', size: u * 0.9, color: on ? '#1a1214' : '#eaf2ff', maxW: cw - 4 });
          S.hits.push({ x, y, w: cw, h: ch, a: 't' + (i + 1) });
        });
        txt(ctx, (g.touch ? 'Drag to aim · BOWL when the marker sits right' : 'Aim with arrows · SPACE when the wobbling marker sits right'), fr.x + fr.w / 2, y - u * 1.0, { font: 'osd', size: u * 0.95, color: '#ffd84a', outline: 3, maxW: fr.w - u });
        txt(ctx, S.bowler.name + ' · ' + (S.bowler.type === 'spin' ? (S.bowler.spin > 0 ? 'off-spin' : 'leg-spin') : 'pace') + ' · field: ' + FIELDS[S.fieldPreset].name, fr.x + fr.w / 2, y - u * 2.3, { font: 'osd', size: u * 0.9, color: '#eaf2ff', outline: 3, maxW: fr.w - u });
      }
      if (S.bp === 'runup' || (S.bp === 'flight' && S.rel)) {
        const w = Math.min(fr.w * 0.7, u * 22), h = u * 1.2, x = fr.x + (fr.w - w) / 2, y = fr.y + fr.h - u * (S.tickerIn ? 4.4 : 2.4);
        ctx.fillStyle = 'rgba(10,12,30,0.75)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
        ctx.fillStyle = '#5a2a2a'; ctx.fillRect(x, y, w, h);
        const G0 = S.green || meterGreen(S);
        ctx.fillStyle = '#2a9a4a'; ctx.fillRect(x + (G0.c - G0.w / 2) * w, y, G0.w * w, h);
        ctx.fillStyle = '#b9ffb0'; ctx.fillRect(x + (G0.c - G0.w * 0.12) * w, y, G0.w * 0.24 * w, h);
        ctx.fillStyle = '#7a1a1a'; ctx.fillRect(x + (G0.c + G0.w / 2 + 0.16) * w, y, w * 0.06, h);
        const m = clamp(S.meter || 0, 0, 1.12) / 1.12 * 1.0;
        ctx.fillStyle = '#fff'; ctx.fillRect(x + Math.min(1, m * 1.12) * w - 2, y - 5, 4, h + 10);
        txt(ctx, S.bp === 'runup' ? (g.touch ? 'TAP BOWL TO RELEASE' : 'SPACE TO RELEASE') : '', x + w / 2, y - u * 0.9, { font: 'osd', size: u * 0.95, color: '#ffd84a', outline: 3 });
      }
      if (S.relText && S.relText.t < 1.2) txt(ctx, S.relText.text, fr.x + fr.w / 2, fr.y + fr.h * 0.58, { font: 'display', size: u * 1.5, color: S.relText.ok ? '#b9ffb0' : '#ffb4a6', outline: 4 });
      if (S.catchPrompt && S.bp === 'live' && !S.out.wicket) {
        const left = S.catchPrompt.at - S.liveT;
        if (left > -0.1 && left < 1.4) {
          const good = left <= 0.45;
          const s = (g.touch ? 'TAP' : 'SPACE') + ' — CATCH!';
          txt(ctx, s, fr.x + fr.w / 2, fr.y + fr.h * 0.24, { font: 'display', size: u * (good ? 2.2 : 1.7), color: good ? '#b9ffb0' : '#ffd84a', outline: 5 });
          const pr = clamp(left / 1.4, 0, 1);
          ctx.strokeStyle = good ? '#b9ffb0' : '#ffd84a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(fr.x + fr.w / 2, fr.y + fr.h * 0.24 + u * 2.4, u * (0.5 + pr * 1.6), 0, TAU); ctx.stroke();
          S.hits.push({ x: fr.x, y: fr.y, w: fr.w, h: fr.h, a: 'go' });
        }
      }
    } else {
      // batting: timing feedback + partner call + loft state
      if (S.timing && S.timing.t < 1.0) {
        const p = proj(S.cam, S.batA.x, 1.9, S.batA.z, { x: 0, y: 0 });
        const tx = p.ok ? clamp(p.x, fr.x + u * 4, fr.x + fr.w - u * 4) : fr.x + fr.w / 2, ty = p.ok ? clamp(p.y - u, fr.y + u * 5, fr.y + fr.h - u * 4) : fr.y + fr.h * 0.5;
        txt(ctx, S.timing.label, tx, ty - S.timing.t * u * 1.5, { font: 'display', size: u * 1.4, color: S.timing.label === 'PERFECT' ? '#ffd84a' : S.timing.ok ? '#b9ffb0' : '#ffb4a6', outline: 4 });
      }
      if (S.calls && S.bp === 'live' && S.calls.t < 2.4) {
        const who = S.inn.bat.players[S.inn.non].name;
        const s = who + ': ' + S.calls.text;
        ctx.font = font('osd', u * 1.1);
        const w = ctx.measureText(s).width + u * 1.6, x = fr.x + fr.w - w - u * 0.6, y = fr.y + fr.h * 0.62;
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; rr(ctx, x, y, w, u * 1.8, u * 0.6); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + w - u * 2, y + u * 1.8); ctx.lineTo(x + w - u * 1.2, y + u * 2.6); ctx.lineTo(x + w - u * 2.8, y + u * 1.8); ctx.fill();
        txt(ctx, s, x + w / 2, y + u * 0.92, { font: 'osd', size: u * 1.1, color: S.calls.col === '#b9ffb0' ? '#1d6a2a' : S.calls.col === '#ff8a7a' ? '#a02020' : '#7a5a00' });
        if (!g.touch && S.calls.col === '#b9ffb0' && !S.run.active) txt(ctx, 'R = run', x + w / 2, y + u * 2.9, { font: 'osd', size: u * 0.9, color: '#eaf2ff', outline: 3 });
      }
      if ((S.loftLatch || g.down('loft')) && (S.bp === 'flight' || S.bp === 'runup' || S.bp === 'setup')) txt(ctx, '▲ LOFTED SHOT ARMED', fr.x + fr.w / 2, fr.y + fr.h - u * (S.tickerIn ? 3.2 : 1.2), { font: 'osd', size: u * 1.0, color: '#ffd84a', outline: 3 });
      if (S.bp === 'setup' && S.bt > 0.15 && S.bt < 0.8 && S.inn.balls === 0 && S.inn.over.length === 0 && S.overNo === 0) txt(ctx, g.touch ? 'Tap ◀ ▲ ▶ (or swipe) as the ball reaches you' : 'Press ← ↑ → as the ball reaches you', fr.x + fr.w / 2, fr.y + fr.h * 0.55, { font: 'osd', size: u * 1.05, color: '#ffd84a', outline: 3, maxW: fr.w - u });
    }
  }
  function drawOverBalls(ctx, S, cx, cy, r) {
    const inn = S.inn; if (!inn) return;
    const balls = inn.over.slice(-8), n = balls.length;
    txt(ctx, 'THIS OVER', cx - (Math.max(n, 1) / 2) * r * 2.4 - r * 3.6, cy + 1, { font: 'osd', size: r * 0.95, color: '#b9aa92' });
    balls.forEach((s, i) => {
      const x = cx + (i - (n - 1) / 2) * r * 2.4;
      ctx.fillStyle = s === 'W' ? '#c0282a' : s === '4' ? '#2a6ae8' : s === '6' ? '#7a3db8' : /wd|nb/.test(s) ? '#5a5e66' : '#f4efe2';
      ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.fill();
      txt(ctx, s === '0' ? '•' : s, x, cy + 1, { font: 'osd', size: s.length > 2 ? r * 0.7 : r * 1.0, color: /^[0-3]$/.test(s) ? '#1a1214' : '#fff' });
    });
  }
  function drawReplayUi(ctx, S, u) {
    const fr = S.fr;
    // VHS-ish replay grade
    ctx.fillStyle = 'rgba(40,20,60,0.12)'; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = fr.y + ((S.clock * 60) % 6); y < fr.y + fr.h; y += 6) ctx.fillRect(fr.x, y, fr.w, 1);
    const w = Math.min(fr.w * 0.8, u * 22), h = u * 2.2, x = fr.x + (fr.w - w) / 2, y = fr.y + u * 4.4;
    ctx.fillStyle = 'rgba(178,43,43,0.9)'; ctx.fillRect(x, y, w, h);
    txt(ctx, (Math.floor(S.clock * 3) % 2 ? '▶▶ ' : '▶ ') + 'ACTION REPLAY', x + w / 2, y + h / 2 + 1, { font: 'osd', size: u * 1.35, color: '#fff' });
    if (S.evt && S.evt.text) {
      ctx.font = font('osd', u * 1.05);
      const s = S.evt.text.toUpperCase(), w2 = Math.min(fr.w * 0.92, ctx.measureText(s).width + u * 2);
      ctx.fillStyle = 'rgba(10,14,40,0.82)'; ctx.fillRect(fr.x + (fr.w - w2) / 2, y + h, w2, u * 1.6);
      txt(ctx, s, fr.x + fr.w / 2, y + h + u * 0.82, { font: 'osd', size: u * 1.05, color: '#ffd84a', maxW: w2 - u });
    }
    S.hits.push({ x: fr.x, y: fr.y, w: fr.w, h: fr.h, a: 'go' });
  }
  function drawFieldMap(ctx, S, cx, cy, R) {
    const V = S.V;
    const sx = R / V.rx, sz = R / V.rz;
    const X = (x) => cx + x * sx, Y = (z) => cy - (z - V.cz) * sz * 0.9;
    ctx.fillStyle = 'rgba(20,60,30,0.78)'; ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#cdb488'; ctx.fillRect(X(-1.5) - 1, Y(PITCH), Math.max(2, 3 * sx), Y(0) - Y(PITCH));
    for (const a of S.actors) {
      const col = a.ump ? '#ffffff' : a.role === 'bat' ? '#f4f2ea' : a.kit.shirt;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(a.x), Y(a.z), Math.max(1.6, R * 0.055), 0, TAU); ctx.fill();
      if (a.role !== 'bat' && !a.ump) { ctx.strokeStyle = a.kit.trim; ctx.lineWidth = 1; ctx.stroke(); }
    }
    const b = S.ball;
    if (b.vis && b.st !== 'dead') { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(X(b.x), Y(b.z), Math.max(1.5, R * 0.05), 0, TAU); ctx.fill(); }
  }

  /* ---------------------------------------------------------------- letterbox panels (desktop / portrait) */
  function drawPanels(ctx, g, S) {
    const uu = uiScale(S);
    if (S.barB && S.barB.h >= uu * 2.6) drawTicker(ctx, S, uu);
    if (S.barT && S.barT.h > uu * 2 && S.phase === 'ball' && S.inn) {
      const inn = S.inn;
      if (inn.target) { const need = rules.need(inn), left = rules.ballsLeft(inn); txt(ctx, 'NEED ' + need + ' OFF ' + left, S.barT.x + S.barT.w / 2, S.barT.y + S.barT.h * 0.36, { font: 'osd', size: uu * 1.3, color: need <= 6 ? '#b9ffb0' : '#eaf2ff' }); }
      else txt(ctx, inn.bat.name + ' · ' + rules.score(inn) + ' · OV ' + oversText(inn.balls) + '/' + S.overs, S.barT.x + S.barT.w / 2, S.barT.y + S.barT.h * 0.36, { font: 'osd', size: uu * 1.1, color: '#eaf2ff', maxW: S.barT.w - uu });
      drawOverBalls(ctx, S, S.barT.x + S.barT.w / 2 + uu * 2, S.barT.y + S.barT.h * 0.76, uu * 0.85);
    }
    const u = clamp(S.fr.h / 36, 9, 18);
    if (S.panelL) drawScorecardPanel(ctx, S, S.panelL, u);
    if (S.panelR) drawRightPanel(ctx, g, S, S.panelR, u);
  }
  function panelBox(ctx, P, title, u) {
    ctx.fillStyle = '#100c16'; ctx.fillRect(P.x, P.y, P.w, P.h);
    ctx.fillStyle = 'rgba(242,194,48,0.1)'; ctx.fillRect(P.x + u * 0.5, P.y + u * 0.5, P.w - u, u * 1.7);
    txt(ctx, title, P.x + u, P.y + u * 1.38, { font: 'osd', size: u * 1.1, color: '#f2c230', align: 'left', maxW: P.w - u * 2 });
  }
  function drawScorecardPanel(ctx, S, P, u) {
    const inn = S.inn || S.innings[S.innings.length - 1];
    panelBox(ctx, P, inn ? inn.bat.short + ' · BATTING' : 'SCORECARD', u);
    if (!inn) { txt(ctx, S.home.name + ' vs ' + S.away.name, P.x + P.w / 2, P.y + u * 4, { font: 'osd', size: u, color: '#eaf2ff', maxW: P.w - u }); return; }
    let y = P.y + u * 3.4;
    const lh = u * 1.35;
    for (const i of inn.order) {
      const c = inn.cards[i];
      if (!c.inAt && y > P.y + P.h - u * 6) continue;
      const atCrease = S.inn === inn && (i === inn.striker || i === inn.non) && !c.out;
      const col = atCrease ? '#ffd84a' : c.out ? '#b9aa92' : c.inAt ? '#eaf2ff' : '#6a6070';
      txt(ctx, c.name + (atCrease && i === inn.striker ? '*' : ''), P.x + u, y, { font: 'osd', size: u * 1.0, color: col, align: 'left', maxW: P.w * 0.45 });
      txt(ctx, c.inAt ? c.runs + ' (' + c.balls + ')' : '', P.x + P.w - u, y, { font: 'osd', size: u * 1.0, color: col, align: 'right' });
      if (c.out && c.how) txt(ctx, c.how, P.x + u * 1.6, y + lh * 0.62, { font: 'osd', size: u * 0.72, color: '#8a7a8a', align: 'left', maxW: P.w - u * 2.4 });
      y += c.out ? lh * 1.45 : lh;
      if (y > P.y + P.h - u * 4) break;
    }
    y = Math.max(y + u * 0.4, P.y + P.h - u * 3.2);
    txt(ctx, 'Extras ' + (inn.wd + inn.nb) + ' (wd ' + inn.wd + ', nb ' + inn.nb + ')', P.x + u, y, { font: 'osd', size: u * 0.85, color: '#b9aa92', align: 'left', maxW: P.w - u * 2 });
    txt(ctx, 'TOTAL ' + rules.score(inn) + '  (' + oversText(inn.balls) + ' ov)', P.x + u, y + u * 1.4, { font: 'osd', size: u * 1.1, color: '#ffffff', align: 'left', maxW: P.w - u * 2 });
  }
  function drawRightPanel(ctx, g, S, P, u) {
    panelBox(ctx, P, S.inn ? 'FIELD · ' + FIELDS[S.fieldPreset].name.toUpperCase() : 'MATCH', u);
    const R = Math.min(P.w * 0.4, P.h * 0.2);
    if (S.inn) drawFieldMap(ctx, S, P.x + P.w / 2, P.y + u * 3 + R, R);
    let y = P.y + u * 4 + R * 2;
    const inn = S.inn;
    if (inn) {
      const lines = [];
      if (S.bowler) { const f = inn.figs[S.bowler.name]; lines.push(['BOWLER', S.bowler.name + '  ' + (f ? oversText(f.balls) + '-' + f.runs + '-' + f.wkts : '0.0-0-0')]); }
      lines.push(['PARTNERSHIP', inn.part + ' (' + inn.partBalls + ')']);
      if (inn.target) lines.push(['REQ. RATE', (rules.need(inn) / Math.max(1, rules.ballsLeft(inn)) * 6).toFixed(1)]);
      const i0 = S.innings[0];
      if (S.innIdx === 1 && i0) lines.push([i0.bat.short, rules.score(i0) + ' (' + oversText(i0.balls) + ')']);
      for (const [k, v] of lines) {
        txt(ctx, k, P.x + u, y, { font: 'osd', size: u * 0.85, color: '#b9aa92', align: 'left' });
        txt(ctx, v, P.x + u, y + u * 1.05, { font: 'osd', size: u * 1.05, color: '#eaf2ff', align: 'left', maxW: P.w - u * 2 });
        y += u * 2.5;
      }
      txt(ctx, 'THIS OVER', P.x + u, y, { font: 'osd', size: u * 0.85, color: '#b9aa92', align: 'left' });
      const balls = inn.over.slice(-8), r = Math.min(u * 0.78, (P.w - u * 2) / 8 / 2.3);
      balls.forEach((sy, i) => {
        const bx = P.x + u + r + i * r * 2.3, by = y + u * 1.4;
        ctx.fillStyle = sy === 'W' ? '#c0282a' : sy === '4' ? '#2a6ae8' : sy === '6' ? '#7a3db8' : /wd|nb/.test(sy) ? '#5a5e66' : '#f4efe2';
        ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
        txt(ctx, sy === '0' ? '•' : sy, bx, by + 1, { font: 'osd', size: sy.length > 2 ? r * 0.7 : r * 1.05, color: /^[0-3]$/.test(sy) ? '#1a1214' : '#fff' });
      });
      y += u * 3.2;
    }
    if (!g.touch) {
      const keys = S.ui === 'bowl' ? ['← → ↑ ↓  aim', '1-4  delivery type', 'SPACE  bowl, then release', 'F  change field', 'V  TV / FPV camera'] : S.ui === 'bat' ? ['← ↑ →  play a shot', '↓  block', 'SHIFT (hold)  loft it', 'R  run', 'V  TV / FPV camera'] : [];
      for (const k of keys) { if (y > P.y + P.h - u) break; txt(ctx, k, P.x + u, y, { font: 'osd', size: u * 0.85, color: '#8a8aa0', align: 'left', maxW: P.w - u * 2 }); y += u * 1.2; }
    }
  }

  /* ================================================================ per-step update */
  function anyGo(g) { return g.pressed('go') || g.pressed('up') || g.pressed('left') || g.pressed('right') || g.pressed('down') || g.pressed('run'); }
  const TYPES = ['pace', 'spin', 'yorker', 'bouncer'];
  function toggleCam(S) {
    S.camMode = S.camMode === 'fpv' ? 'tv' : 'fpv';
    S.bgKey = null;
    say(S, S.camMode === 'fpv' ? (meBowls(S) ? 'FPV camera: you are the bowler. Run in!' : 'FPV camera: the batter\'s helmet cam. Watch the ball!') : 'Back to the TV camera.', null, true);
    S.g.sfx('ui_click');
  }
  function playerShot(S, screenDir, loft, dts) {
    (S.inputLog || (S.inputLog = [])).push({ dir: screenDir, bp: S.bp, t: +(S.del ? S.clock - S.del.tRel - S.del.tA : 0).toFixed(3), swung: !!S.swung });
    if (S.inputLog.length > 30) S.inputLog.shift();
    const fpv = S.camMode === 'fpv';
    let dir = screenDir === 'up' ? 'straight' : screenDir === 'down' ? 'block' : screenDir === 'left' ? (fpv ? 'leg' : 'off') : fpv ? 'off' : 'leg';
    if (S.pm) { const del = S.del; if (del && !S.swung) S.pm.L.input({ t: 'shot', d: dir, l: loft && dir !== 'block' ? 1 : 0, e: +((S.clock + (dts || 0)) - (del.tRel + del.tA)).toFixed(4) }); S.loftLatch = false; return; }
    attemptShot(S, dir, loft && dir !== 'block', 'player');
    S.loftLatch = false;
  }
  function handleInput(S, g) {
    if (g.pressed('cam')) toggleCam(S);
    const ph = S.phase;
    if (ph === 'intro') { if (anyGo(g) && S.intro.t > 0.3) S.intro.t = 99; return; }
    if (ph === 'toss') { if (g.pressed('left') || g.pressed('go')) tossCall(S, 'heads'); else if (g.pressed('right')) tossCall(S, 'tails'); return; }
    if (ph === 'toss_choose') { if (g.pressed('left') || g.pressed('go') || g.pressed('up')) tossChoose(S, 'bat'); else if (g.pressed('right') || g.pressed('down')) tossChoose(S, 'bowl'); return; }
    if (ph === 'toss_done' || ph === 'inn_intro' || ph === 'over_break' || ph === 'inn_break') {
      if (playerBowlsNow(S) && g.pressed('field') && ph !== 'inn_break') cycleField(S);
      else if (S.pt > 0.45 && anyGo(g)) S.pt = 99;
      return;
    }
    if (ph !== 'ball') return;
    const bp = S.bp;
    if (bp === 'dead' && S.bt > 0.45 && (g.pressed('go') || (S.out.boundary || S.out.wicket ? false : anyGo(g)))) { S.bt = S.deadT; return; }
    if (playerBowlsNow(S)) {
      if (bp === 'aim') {
        for (let i = 1; i <= 4; i++) if (g.pressed('t' + i)) setType(S, TYPES[i - 1]);
        if (g.pressed('type') || g.pressed('run')) setType(S, TYPES[(TYPES.indexOf(S.aim.type) + 1) % 4]);
        if (g.pressed('field') || g.pressed('loft')) cycleField(S);
        if (g.pressed('go') && S.bt > 0.25) aimLock(S);
      } else if (bp === 'runup') { if (g.pressed('go') && S.bt > 0.08) aimRelease(S); }
      else if (bp === 'live') {
        if (g.pressed('go') && S.catchPrompt && !S.catchPrompt.pressed) { const left = S.catchPrompt.at - S.liveT; S.catchPrompt.pressed = left <= 0.45 ? 'good' : 'early'; }
      }
      return;
    }
    // batting
    if (g.touch && g.pressed('loft')) S.loftLatch = !S.loftLatch;
    if (bp === 'flight' || bp === 'past') {
      const loft = S.loftLatch || (!g.touch && g.down('loft')) || (g.touch && g.down('loft') && false);
      if (g.pressed('left')) playerShot(S, 'left', loft);
      else if (g.pressed('right')) playerShot(S, 'right', loft);
      else if (g.pressed('up') || g.pressed('go')) playerShot(S, 'up', loft);
      else if (g.pressed('down')) playerShot(S, 'down', false);
    }
    if (bp === 'live' && g.pressed('run')) { if (!S.run.active) startRun(S); else S.run.queued = true; }
  }
  function phaseUpdate(S, dt) {
    const g = S.g;
    switch (S.phase) {
      case 'intro':
        S.intro.t += dt;
        if (S.intro.t > 4.0) { if (S.skipToss) { if (!S.battedFirst) S.battedFirst = S.home; startInnings(S); } else startToss(S); }
        break;
      case 'toss_flip': if (S.pt > 2.0) tossResolve(S); break;
      case 'toss_done': if (S.pt > 2.4) startInnings(S); break;
      case 'inn_intro': S.banner && (S.banner.t += dt); if (S.pt > 2.8) { S.banner = null; startBall(S); } break;
      case 'ball': ballUpdate(S, dt); break;
      case 'over_break':
        S.banner && (S.banner.t += dt);
        if (S.pt > 2.4) { S.banner = null; if (bowlTeam(S) !== S.home) S.fieldPreset = aiField(S); nextOverBowler(S); startBall(S); }
        break;
      case 'inn_break': S.banner && (S.banner.t += dt); if (S.pt > 4.2) { S.banner = null; S.innIdx = 1; startInnings(S); } break;
      case 'end': S.banner && (S.banner.t += dt); if (S.pt > 3.8 && !g.over) { if (S.pm) pmFinish(S); else finishMatch(S); } break;
    }
  }
  function actorsUpdate(S, dt) {
    const live = S.phase === 'ball' && S.bp === 'live';
    const inDel = S.phase === 'ball' && (S.bp === 'runup' || S.bp === 'flight' || S.bp === 'past');
    for (const a of S.actors) {
      a.t += dt;
      if (a.swing) { a.swing.t += dt; if (a.swing.t > 0.8) a.swing = null; }
      if (a === S.batA || a === S.batB) continue;
      if (a === S.bowlerA && inDel) { if (a.pose === 'walk' && a.tx != null) moveActor(a, dt, false); continue; }
      if (a.pose === 'celebrate') { a.ph += dt * 7; a.jump = Math.abs(Math.sin(a.ph)) * 10; if (a.t > 3 && S.phase === 'ball' && S.bp !== 'dead' && S.bp !== 'replay') a.pose = 'stand'; continue; }
      a.jump = 0;
      if (a.pose === 'catch' && a.t > 1.1 && !(S.out && S.out.wicket)) a.pose = 'stand';
      if (a.pose === 'throw') { a.u = clamp(a.t / 0.3, 0, 1); if (a.t > 0.55) a.pose = 'stand'; continue; }
      if (a.pose === 'signal') { if (a.t > 2.3) { a.pose = 'stand'; a.sig = null; } continue; }
      if (a.tx != null) {
        const run = a.chase || (live && (a.role === 'keeper' || a.role === 'bowler'));
        const arrived = moveActor(a, dt, run);
        if (arrived) {
          a.tx = null;
          a.pose = a.role === 'keeper' && !live ? 'keep' : a.role === 'field' && inDel ? 'crouch' : 'stand';
          if (a.role === 'keeper' && live) facing(a, 0, PITCH);
        } else a.pose = run ? 'run' : 'walk';
      }
      if (a.tx == null && a.pose !== 'catch' && a.pose !== 'celebrate') {
        const b = S.ball;
        if (a.role === 'toss') { /* the toss group keeps facing each other */ }
        else if (a.ump) facing(a, 0, a === S.ump1 ? 0 : 1.2);
        else if (live && b.vis && a.role !== 'keeper') facing(a, b.x, b.z);
        else if (a.role === 'field' || a.role === 'bowler') facing(a, 0, a.z < 0 ? 0 : 1);
        if (a.pose === 'run' || a.pose === 'walk') a.pose = a.role === 'keeper' && !live && S.phase === 'ball' && S.bp !== 'dead' ? 'keep' : 'stand';
        if (a.role === 'keeper' && S.phase === 'ball' && (S.bp === 'runup' || S.bp === 'flight' || S.bp === 'past' || S.bp === 'aim' || S.bp === 'setup')) { a.pose = 'keep'; facing(a, 0, PITCH); }
        if (a.role === 'field' && inDel) a.pose = S.bp === 'runup' && S.bt < S.runT * 0.75 ? 'walk' : 'crouch';
      }
    }
    // the batters: running between the wickets
    const R = S.run;
    if (S.phase === 'ball' && R && (R.active || R.done > 0)) {
      const pos = runPos(S);
      for (const [a, z, lane] of [[S.batA, pos.a, 1.0], [S.batB, pos.b, -1.0]]) {
        const oz = a.z;
        a.z = z; a.x = lerp(a.x, lane, Math.min(1, dt * 6));
        if (R.active) { a.pose = 'run'; a.ph += Math.abs(z - oz) * 2.6 + dt * 2; a.fx = 0; a.fz = z > oz ? 1 : -1; }
        else { a.pose = 'stand'; facing(a, 0, a.z > PITCH / 2 ? 0 : PITCH); }
      }
    }
  }
  function timersUpdate(S, dt) {
    const g = S.g;
    if (S.msg) S.msg.t += dt;
    if (S.speedGun) S.speedGun.t += dt;
    if (S.timing) S.timing.t += dt;
    if (S.calls) S.calls.t += dt;
    if (S.relText) S.relText.t += dt;
    if (S.thirdUmp) { S.thirdUmp.t += dt; if (S.thirdUmp.t > 3) S.thirdUmp = null; }
    for (const st of S.stumps) if (st.broken) st.t += dt;
    if (S.celebrate > 0) S.celebrate = Math.max(0, S.celebrate - dt);
    if (S.waveT > 0) { S.waveT -= dt; if (S.waveT <= 0) S.waveOn = false; }
    if (!(S.phase === 'ball' && S.bp === 'aim')) S.fieldShown = Math.max(0, (S.fieldShown || 0) - dt); else S.fieldShown = 1;
    updateFieldTarget(S, dt);
    // a day-night match: the light fades as the match goes on and the floodlights take over
    if (S.timeMode === 'evening') {
      const tot = S.overs * 12;
      let done = 0;
      for (const inn of S.innings) if (inn) done += inn.synthetic ? inn.maxBalls : inn.balls;
      const L = 0.3 + 0.62 * clamp(done / tot, 0, 1);
      if (S.light < 0.5 && L >= 0.5 && !S.saidLights) { S.saidLights = true; say(S, 'lights'); }
      S.light = lerp(S.light, L, Math.min(1, dt * 0.5));
    }
    // crowd murmur bed
    if (S.loop) {
      const v = (S.V.gully ? 0.012 : 0.03) + Math.min(0.08, S.celebrate * 0.03), fq = S.celebrate > 0 ? 900 : 520;
      if (Math.abs(v - (S.loopV || 0)) > 0.003 || fq !== S.loopF) { S.loopV = v; S.loopF = fq; S.loop.set(v, fq); }
    }
    void g;
  }
  function uiFor(S) {
    const ph = S.phase;
    if (S.pm) return ph === 'ball' ? (meBowls(S) ? 'bowl' : meBats(S) ? 'bat' : 'watch') : 'watch';
    if (ph === 'intro') return S.skipToss ? ((S.battedFirst || S.home) === S.home ? 'bat' : 'bowl') : 'toss';
    if (ph === 'toss' || ph === 'toss_flip') return 'toss';
    if (ph === 'toss_choose') return 'choose';
    if (ph === 'toss_done') return S.ui || 'toss';
    if (ph === 'end') return S.ui;
    if (ph === 'inn_break') return S.ui;
    return playerBowlsNow(S) ? 'bowl' : 'bat';
  }
  function uiSync(g) {
    const S = g.S;
    const ui = uiFor(S);
    const key = ui + ':' + S.camMode + (S.pm && ui === 'watch' ? ':' + pmWatchLine(S) : '');
    if (key !== S.uiKey) {
      S.ui = ui; S.uiKey = key;
      try { g.buildPad(); if (g.touch) { g.releaseAll(); g.resize(); } } catch (e) { N.err('cricket.pad', e); }
    }
    const lb = g.btnEls && g.btnEls.loft;
    if (lb) lb.classList.toggle('cm-on', !!S.loftLatch);
    if (g.btnEls) for (let i = 1; i <= 4; i++) { const b = g.btnEls['t' + i]; if (b) b.classList.toggle('cm-on', S.aim.type === TYPES[i - 1]); }
  }
  function finishMatch(S) {
    const g = S.g, R = S.result;
    const homeInn = S.innings.find((i) => i && i.bat === S.home), awayInn = S.innings.find((i) => i && i.bat === S.away);
    const top = (inn) => { let b = null; inn.cards.forEach((c) => { if (c.inAt && (!b || c.runs > b.runs)) b = c; }); return b ? { name: b.name, runs: b.runs, balls: b.balls, out: b.out } : null; };
    const bestB = (inn) => { let b = null; for (const k in inn.figs) { const f = inn.figs[k]; if (!b || f.wkts > b.wkts || (f.wkts === b.wkts && f.runs < b.runs)) b = f; } return b ? { name: b.name, wkts: b.wkts, runs: b.runs, overs: oversText(b.balls) } : null; };
    const summary = (inn) => ({ team: inn.bat.name, short: inn.bat.short, runs: inn.runs, wickets: inn.wkts, overs: oversText(inn.balls), balls: inn.balls, fours: inn.fours, sixes: inn.sixes, wides: inn.wd, noBalls: inn.nb, target: inn.target, synthetic: !!inn.synthetic, endReason: inn.endReason,
      batting: inn.cards.filter((c) => c.inAt).map((c) => ({ name: c.name, runs: c.runs, balls: c.balls, fours: c.f4, sixes: c.f6, out: c.out, how: c.how })),
      bowling: Object.keys(inn.figs).map((k) => { const f = inn.figs[k]; return { name: f.name, overs: oversText(f.balls), runs: f.runs, wickets: f.wkts, wides: f.wd, noBalls: f.nb }; }) });
    const extra = {
      tie: !!R.tie, runs: homeInn.runs, wickets: homeInn.wkts, overs: oversText(homeInn.balls), balls: homeInn.balls,
      oppRuns: awayInn.runs, oppWickets: awayInn.wkts, oppOvers: oversText(awayInn.balls), wicketsTaken: awayInn.wkts,
      target: S.innings[1] ? S.innings[1].target : null, fours: homeInn.fours, sixes: homeInn.sixes,
      extras: { got: homeInn.wd + homeInn.nb, gave: awayInn.wd + awayInn.nb },
      battedFirst: S.innings[0].bat === S.home, tossWon: S.tossWon,
      margin: R.tie ? 'Match tied' : R.winner.name + ' won ' + R.margin,
      reason: R.tie ? 'tie' : R.win ? (S.innings[1].bat === S.home ? 'chased' : 'defended') : homeInn.endReason === 'allout' ? 'allout' : 'short',
      motm: S.motm, topScorer: top(homeInn), oppTopScorer: top(awayInn), bestBowler: bestB(awayInn), oppBestBowler: bestB(homeInn),
      wagon: homeInn.shots.slice(), innings: S.innings.map(summary), venue: S.V.id, home: S.home.name, away: S.away.name, mode: S.mode,
      overs_per_side: S.overs, wicketsPerSide: S.wickets, drops: S.stats.drops, camera: S.camMode, delay: 0.4,
    };
    S.score = homeInn.synthetic ? awayInn.wkts * 10 + (R.win ? 50 : 0) : homeInn.runs + awayInn.wkts * 10 + (R.win ? 50 : 0);
    g.finish(R.win, extra);
  }

  /* ================================================================ pointer: taps, swipes, drag-to-aim */
  function unproject(c, sx, sy) {
    const a = (sx - c.cx) / c.f, b = (sy - c.cy) / c.f;
    const dx = c.fx + a * c.rx - b * c.ux, dy = c.fy - b * c.uy, dz = c.fz + a * c.rz - b * c.uz;
    if (dy > -1e-4) return null;
    const t = -c.y / dy;
    return { x: c.x + dx * t, z: c.z + dz * t };
  }
  function pointer(g, type, x, y, id) {
    const S = g.S;
    if (!S) return;
    if (type === 'down') {
      for (let i = S.hits.length - 1; i >= 0; i--) {
        const h = S.hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
          if (h.a === 'cam') { toggleCam(S); return; }
          g.press(h.a, 'ptr' + id); S.ptrAct = S.ptrAct || {}; S.ptrAct[id] = h.a;
          return;
        }
      }
      if (S.phase !== 'ball') return;
      if (meBowls(S)) {
        if (S.bp === 'aim') { S.drag = id; const p = unproject(S.cam, x, y); if (p) { S.aim.x = clamp(p.x, -1.5, 1.5); S.aim.z = clamp(p.z, 0.8, 12); } }
        else if (S.bp === 'runup') { if (S.pm) { if (!S.del) S.pm.L.input({ t: 'rel', m: +Math.min(1.12, S.meter || 0).toFixed(4) }); } else aimRelease(S); }
        return;
      }
      if (S.pm && !meBats(S)) return;
      if (S.bp === 'flight' || S.bp === 'past' || S.bp === 'runup' || S.bp === 'setup') S.swipe = { id, x0: x, y0: y, t0: S.clock, done: false };
    } else if (type === 'move') {
      if (S.drag === id && S.bp === 'aim') { const p = unproject(S.cam, x, y); if (p) { S.aim.x = clamp(p.x, -1.5, 1.5); S.aim.z = clamp(p.z, 0.8, 12); } return; }
      const sw = S.swipe;
      if (sw && sw.id === id && !sw.done) {
        const dx = x - sw.x0, dy = y - sw.y0;
        if (Math.hypot(dx, dy) > 26) {
          sw.done = true;
          const a = Math.atan2(-dy, dx) * 180 / Math.PI;
          let dir, loft = false;
          if (a > -30 && a <= 30) dir = 'right';
          else if (a > 150 || a <= -150) dir = 'left';
          else if (a > 30 && a <= 70) { dir = 'right'; loft = true; }
          else if (a > 110 && a <= 150) { dir = 'left'; loft = true; }
          else if (a > 70 && a <= 110) { dir = 'up'; loft = true; }
          else dir = 'down';
          if (S.bp === 'flight' || S.bp === 'past') playerShot(S, dir, loft || S.loftLatch);
        }
      }
    } else if (type === 'up') {
      if (S.drag === id) S.drag = null;
      if (S.ptrAct && S.ptrAct[id]) { g.release(S.ptrAct[id], 'ptr' + id); delete S.ptrAct[id]; }
      const sw = S.swipe;
      if (sw && sw.id === id) { if (!sw.done && (S.bp === 'flight' || S.bp === 'past')) playerShot(S, 'up', S.loftLatch); S.swipe = null; }
    }
  }

  /* ================================================================ the autoplay bot (tests) */
  function bot(g, dt, want) {
    const S = g.S;
    if (!S || !S.brng) return;
    const lose = want === 'lose';
    const ph = S.phase;
    if (ph === 'intro') { if (S.intro.t > 0.4) g.botPress('go'); return; }
    if (ph === 'toss') { if (S.pt > 0.3) g.botPress('left'); return; }
    if (ph === 'toss_choose') { if (S.pt > 0.3) g.botPress(S.botChoice === 'bowl' ? 'right' : 'left'); return; }
    if (ph === 'toss_done' || ph === 'inn_intro' || ph === 'over_break' || ph === 'inn_break') { if (S.pt > 0.55) g.botPress('go'); return; }
    if (ph !== 'ball') return;
    if (S.bp === 'replay' || (S.bp === 'dead' && S.bt > 0.5)) { g.botPress('go'); return; }
    if (playerBowlsNow(S)) {
      if (S.bp === 'aim') {
        const A = S.aim;
        if (!S.botAim) {
          if (lose) { A.type = 'pace'; A.x = 1.35; A.z = 3.2; }
          else { A.type = S.brng.next() < 0.3 ? 'yorker' : S.bowler.type === 'spin' ? 'spin' : 'pace'; A.x = -0.1; A.z = TYPE_INFO[A.type].z; }
          S.botAim = true;
        }
        if (S.bt > 0.35 && (Math.abs(A.wx - A.x) < 0.07 && Math.abs(A.wz - A.z) < 0.25 || S.bt > 1.8)) { g.botPress('go'); S.botAim = false; }
      } else if (S.bp === 'runup') {
        const G0 = S.green || meterGreen(S);
        if (S.meter >= (lose ? 0.3 : G0.c - 0.008)) g.botPress('go');
      } else if (S.bp === 'live' && S.catchPrompt && !S.catchPrompt.pressed && !lose) {
        if (S.catchPrompt.at - S.liveT < 0.3) g.botPress('go');
      }
      return;
    }
    if (S.bp === 'flight' && !S.swung && S.del) {
      const del = S.del, tA = del.tRel + del.tA;
      if (lose) { if (S.clock - del.tRel > del.tA * 0.4) g.botPress('up'); return; }
      if (del.wide) return;
      if (S.clock + dt >= tA - 0.006) {
        const len = del.len, line = del.line;
        let a = 'up';
        if (len === 'short' || len === 'bouncer') a = line === 'leg' || S.brng.next() < 0.5 ? 'right' : 'left';
        else if (line === 'off') a = 'left'; else if (line === 'leg') a = 'right';
        if (S.camMode === 'fpv' && a !== 'up') a = a === 'left' ? 'right' : 'left';
        g.botHold('loft', (len === 'short' || len === 'bouncer') && a === (S.camMode === 'fpv' ? 'left' : 'right') && S.brng.next() < 0.6);
        g.botPress(a);
      }
    } else if (S.bp === 'live') {
      g.botHold('loft', false);
      if (!lose && S.calls && S.calls.col === '#b9ffb0' && !S.run.active && S.run.done < 3) g.botPress('run');
    }
  }

  /* ================================================================ layout (letterboxed broadcast frame) */
  function layout(g) {
    const S = g.S;
    if (!S) return;
    const W = g.W, H = g.H, A = g.area;
    const touchLand = g.touch && !g.portrait && H < 600;
    const top = A.y, bottom = touchLand ? H : A.y + A.h;
    const availH = Math.max(60, bottom - top);
    S.panelL = S.panelR = S.barT = S.barB = null;
    let fw, fh, fx, fy;
    if (g.portrait) {
      fw = W;
      fh = Math.round(Math.min(availH - 64, fw * 1.25));
      if (fh < fw * 0.7) fh = Math.max(Math.round(availH * 0.8), 120);
      const spare = availH - fh;
      const tb = Math.round(spare * 0.48);
      fx = 0; fy = top + tb;
      S.barT = { x: 0, y: top, w: W, h: tb };
      S.barB = { x: 0, y: fy + fh, w: W, h: bottom - fy - fh };
    } else {
      fh = availH; fw = Math.round(fh * 4 / 3);
      if (fw > W) { fw = W; fh = Math.round(fw * 3 / 4); }
      fx = Math.round((W - fw) / 2); fy = top + Math.round((availH - fh) / 2);
      const side = (W - fw) / 2;
      if (!g.touch && side >= 150) {
        S.panelL = { x: 6, y: top + 6, w: side - 12, h: availH - 12 };
        S.panelR = { x: fx + fw + 6, y: top + 6, w: side - 12, h: availH - 12 };
      }
      if (g.root) { g.root.style.setProperty('--cm-side', Math.max(0, Math.floor(side)) + 'px'); g.root.style.setProperty('--cm-top', Math.round(top) + 'px'); }
    }
    S.fr = { x: fx, y: fy, w: fw, h: fh };
    S.frH = fh;
    S.bgKey = null;
  }

  /* ================================================================ the result card: wagon wheel + MoM */
  function drawWagon(cv, inn, S) {
    const d = Math.min(2, window.devicePixelRatio || 1), size = 150;
    cv.width = size * d; cv.height = size * d; cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
    const cx = size / 2, cy = size / 2 + 4, R = size / 2 - 8;
    c.fillStyle = '#2f6a34'; c.beginPath(); c.ellipse(cx, cy - 4, R, R * 0.96, 0, 0, TAU); c.fill();
    c.strokeStyle = '#f4efe2'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.ellipse(cx, cy - 4, R * 0.45, R * 0.45, 0, 0, TAU); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#cdb488'; c.fillRect(cx - 3, cy - 18, 6, 22);
    // the batter's end at the bottom, straight down the ground is up
    const bx = cx, by = cy + 2;
    const col = { 1: '#efe9dc', 2: '#f2c230', 3: '#f2c230', 4: '#3f8cff', 6: '#ff4a3a' };
    for (const s of (inn && inn.shots) || []) {
      const L = (s.runs >= 4 ? 1 : clamp(s.dist || 0.5, 0.15, 0.95)) * R;
      c.strokeStyle = col[s.runs] || '#efe9dc'; c.lineWidth = s.runs >= 4 ? 2.2 : 1.5;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.sin(s.ang) * L, by - Math.cos(s.ang) * L * 0.96); c.stroke();
    }
    c.fillStyle = '#fff'; c.font = "bold 10px 'VT323', monospace"; c.textAlign = 'center';
    c.fillText('OFF', cx - R * 0.72, cy + R * 0.2); c.fillText('LEG', cx + R * 0.72, cy + R * 0.2);
  }
  function injectResult(g) {
    const S = g.S;
    if (!S || S.wwDone || !g.result || !g.cardWrap) return;
    const card = g.cardWrap.querySelector('.mg-card-result');
    if (!card) return;
    S.wwDone = true;
    try {
      const homeInn = S.innings.find((i) => i && i.bat === S.home);
      const r = g.result;
      const box = document.createElement('div'); box.className = 'cm-res';
      if (homeInn && !homeInn.synthetic) {
        const ww = document.createElement('div'); ww.className = 'cm-wagon';
        const cv = document.createElement('canvas'); drawWagon(cv, homeInn, S);
        const cap = document.createElement('div'); cap.className = 'cm-cap'; cap.textContent = 'WAGON WHEEL · ' + S.home.short;
        ww.appendChild(cv); ww.appendChild(cap); box.appendChild(ww);
      }
      if (r.motm) {
        const m = document.createElement('div'); m.className = 'cm-mom';
        m.innerHTML = '<span class="cm-mom-k">MAN OF THE MATCH</span><b>' + esc(r.motm.name) + '</b><small>' + esc(r.motm.team) + (r.motm.line ? ' · ' + esc(r.motm.line) : '') + '</small>';
        box.appendChild(m);
      }
      const a = card.querySelector('.mg-res-a') || card;
      a.appendChild(box);
    } catch (e) { N.err('cricket.result', e); }
  }

  /* ================================================================ the minigame definition */
  const DEF = {
    id: 'match',
    title: 'LB Stadium Match',
    sub: 'The colony final under the floodlights. Bat, bowl, field: the full match.',
    osd: 'CH 7 SPORTS · LIVE',
    place: 'lb_stadium', places: ['lb_stadium', 'fateh_maidan'],
    secs: 420,
    goLabel: 'PLAY!',
    startLabel: 'Toss karo!',
    noCountdown: false,
    keys: {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      Space: 'go', Enter: 'go', NumpadEnter: 'go', KeyR: 'run', KeyX: 'run', ShiftLeft: 'loft', ShiftRight: 'loft', KeyL: 'loft', KeyZ: 'loft',
      KeyV: 'cam', KeyC: 'cam', KeyF: 'field', KeyQ: 'type', KeyE: 'type', KeyT: 'type', Digit1: 't1', Digit2: 't2', Digit3: 't3', Digit4: 't4',
    },
    buttons(g) {
      const S = g.S, ui = S ? S.ui || uiFor(S) : 'toss', fpv = S && S.camMode === 'fpv';
      if (ui === 'toss') return [{ a: 'left', label: 'HEADS', cls: 'cm-big cm-tl' }, { a: 'right', label: 'TAILS', cls: 'cm-big cm-tr' }];
      if (ui === 'choose') return [{ a: 'left', label: 'BAT', sub: 'FIRST', cls: 'cm-big cm-tl' }, { a: 'right', label: 'BOWL', sub: 'FIRST', cls: 'cm-big cm-tr teal' }];
      if (ui === 'watch') return []; // a party game: a friend is batting / bowling (the CAM pill stays on the picture)
      if (ui === 'bowl') return [
        { a: 't1', label: 'PACE', cls: 'cm-chip cm-c1' }, { a: 't2', label: 'SPIN', cls: 'cm-chip cm-c2' }, { a: 't3', label: 'YORKER', cls: 'cm-chip cm-c3' }, { a: 't4', label: 'BOUNCER', cls: 'cm-chip cm-c4' },
        { a: 'field', label: 'FIELD', sub: 'CHANGE', cls: 'cm-r2 cm-fd' }, { a: 'go', label: 'BOWL', sub: 'RELEASE · CATCH', cls: 'big cm-r2 cm-go' },
      ];
      return [
        { a: 'left', label: '◀', sub: fpv ? 'LEG' : 'OFF', cls: 'cm-r1 cm-rl' }, { a: 'up', label: '▲', sub: 'STRAIGHT', cls: 'big cm-r1 cm-ru' }, { a: 'right', label: '▶', sub: fpv ? 'OFF' : 'LEG', cls: 'cm-r1 cm-rr' },
        { a: 'down', label: 'BLOCK', cls: 'cm-r2 cm-ll' }, { a: 'loft', label: 'LOFT', sub: 'TOGGLE', cls: 'cm-r2 cm-lu cm-loft' }, { a: 'run', label: 'RUN', sub: 'BHAAGO', cls: 'teal cm-r2 cm-lr' },
      ];
    },
    keyHint(g) {
      const S = g.S, ui = S ? S.ui || uiFor(S) : 'toss';
      if (ui === 'toss') return '<kbd>←</kbd> heads · <kbd>→</kbd> tails';
      if (ui === 'choose') return '<kbd>←</kbd> bat first · <kbd>→</kbd> bowl first';
      if (ui === 'watch') return S && S.pm ? esc(pmWatchLine(S)) + ' · <kbd>V</kbd> cam' : '<kbd>V</kbd> cam';
      if (ui === 'bowl') return '<kbd>←→↑↓</kbd> aim · <kbd>1-4</kbd> type · <kbd>Space</kbd> bowl / release / catch · <kbd>F</kbd> field · <kbd>V</kbd> cam';
      return '<kbd>←↑→</kbd> shot · <kbd>↓</kbd> block · <kbd>Shift</kbd> loft · <kbd>R</kbd> run · <kbd>V</kbd> cam';
    },
    howto(g) {
      const S = g.S, ov = S ? S.overs : 3, wk = S ? S.wickets : 5;
      const gully = S && S.V.gully;
      if (g.H < 560 || g.W < 420) { // phones: a compact card that fits without scrolling
        return {
          lines: [
            'Call the <b>toss</b>, then bat <b>and</b> bowl: ' + ov + ' over' + (ov > 1 ? 's' : '') + ' a side, ' + wk + ' wickets.',
            '<b>Bat:</b> ◀ ▲ ▶ (or swipe) as the ball arrives · ▼ block · <b>LOFT</b> = six or caught · <b>RUN</b> on "YES!"',
            '<b>Bowl:</b> pick a type, aim the wobbling marker, <b>BOWL</b>, release in the green · <b>CAM</b>: TV / FPV',
          ].concat(gully ? ['Colony rules: <b>one-tip-one-hand</b> is out; into a house on the full is <b>OUT</b>.'] : []),
          goal: (S ? S.home.short + ' v ' + S.away.short : 'CHIN XI v ASHK XI') + (S && S.mode === 'chase' ? ' · CHASE ' + (S.innings[0] ? S.innings[0].runs + 1 : '') : ''),
          keys: 'Bat <kbd>←↑→</kbd> <kbd>↓</kbd> <kbd>Shift</kbd> <kbd>R</kbd> · Bowl arrows <kbd>1-4</kbd> <kbd>Space</kbd> <kbd>F</kbd> · <kbd>V</kbd> cam',
          touch: '',
        };
      }
      return {
        lines: [
          'Call the <b>toss</b>, then bat <b>and</b> bowl: ' + ov + ' overs a side, ' + wk + ' wickets. Wides and no-balls give an extra run.',
          '<b>Batting:</b> play ◀ ▲ ▶ just as the ball reaches you (watch the length marker). ▼ blocks. <b>LOFT</b> goes over the field: six, or caught! Press <b>RUN</b> when your partner shouts YES; greedy runs end in run-outs.',
          '<b>Bowling:</b> pick pace, spin, yorker or bouncer, aim the wobbling marker, press <b>BOWL</b>, then release in the green. Set the <b>FIELD</b>; tap when a catch comes.',
          gully ? 'Colony rules: <b>one-tip-one-hand</b> is out, and a ball into a house on the full is <b>OUT</b>.' : 'The <b>CAM</b> button switches the TV camera and the first-person (FPV) camera.',
        ],
        goal: (S ? S.home.short + ' vs ' + S.away.short : 'CHIN XI vs ASHK XI') + ' · ' + (S && S.mode === 'chase' ? 'CHASE ' + (S.innings[0] ? S.innings[0].runs + 1 : '') : S && S.mode === 'defend' ? 'DEFEND ' + (S.innings[0] ? S.innings[0].runs : '') : 'FULL MATCH'),
        keys: 'Bat: <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd> <kbd>↓</kbd> · <kbd>Shift</kbd> loft · <kbd>R</kbd> run<br>Bowl: arrows aim · <kbd>1</kbd>-<kbd>4</kbd> type · <kbd>Space</kbd> · <kbd>F</kbd> field · <kbd>V</kbd> camera<br>Pad: A bowl / straight · B run / type · X loft / field · Y camera',
        touch: 'Bat: tap ◀ ▲ ▶ or <b>swipe</b> (swipe up = lofted) · Bowl: drag to aim, BOWL to run in and release',
      };
    },
    setup(g) {
      const S = g.S;
      setupMatch(g);
      S.brng = U.rng(((g.baseSeed || 1) ^ 0x5bd1e995) >>> 0);
      S.botChoice = g.params.botChoice || 'bat';
      S.forceToss = g.params.forceToss || null;
      S.autoRun = !!g.params.autoRun;
      try { S.loop = g.loop({ ft: 'bandpass', f: 520, q: 0.5 }); } catch (e) { S.loop = null; }
      S.fr = { x: 0, y: 0, w: 100, h: 100 };
      S.uiKey = null;
      say(S, S.V.gully ? 'welcomeGully' : 'welcome', null, true);
      CUR.g = g;
      if (g.params.party && g.params.party.players) { try { pmSetup(g); } catch (e) { N.err('cricket.party.setup', e); S.pm = null; } }
    },
    layout,
    update(g, dt) {
      const S = g.S;
      if (S.pm) { pmUpdate(g, dt); return; }
      S.clock += dt; S.pt += dt;
      handleInput(S, g);
      phaseUpdate(S, dt);
      actorsUpdate(S, dt);
      commUpdate(S, dt);
      timersUpdate(S, dt);
      uiSync(g);
    },
    idle(g, dt) {
      const S = g.S;
      if (!S) return;
      if (S.pm) { S.pm.vis += dt; uiSync(g); return; } // a party game: the shared simulation starts on GO
      if (g.phase === 'howto' || g.phase === 'countdown') { S.intro.t = (S.intro.t + dt) % 3.6; S.clock += dt; commUpdate(S, dt); if (S.phase !== 'intro') S.phase = 'intro'; uiSync(g); }
      if (g.phase === 'result') { S.clock += dt; S.pt += dt; injectResult(g); }
    },
    bot(g, dt, want) { if (g.S && g.S.pm) return; bot(g, dt, want); }, // party: pmBot plays inside the shared steps
    pointer,
    hud(g) {
      const S = g.S;
      if (S && S.pm) return pmHud(g, S);
      if (!S || g.W < 600) return [];
      const inn = S.inn || S.innings[S.innings.length - 1];
      if (!inn) return [{ k: '', v: S.home.short + ' v ' + S.away.short }];
      const it = [{ k: inn.bat.short, v: rules.score(inn) }, { k: 'OV', v: oversText(inn.balls) + '/' + S.overs }];
      if (inn.target) { const need = rules.need(inn), left = rules.ballsLeft(inn); it.push({ k: 'NEED', v: need + '/' + left, warn: need > left * 1.5, good: need <= 0 }); }
      return it;
    },
    draw(g, ctx) {
      const S = g.S;
      if (!S || !S.fr) return;
      const t0 = performance.now();
      TX.s = g.dpr; TX.ox = 0; TX.oy = 0;
      ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, g.W, g.H);
      camFor(S, S.cam);
      const fr = S.fr;
      ctx.save();
      ctx.beginPath(); ctx.rect(fr.x, fr.y, fr.w, fr.h); ctx.clip();
      try { drawScene(ctx, g, S); } catch (e) { N.err('cricket.scene', e); }
      resetT(ctx); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      try { drawOverlays(ctx, g, S); } catch (e) { N.err('cricket.overlay', e); }
      ctx.restore();
      resetT(ctx);
      // letterbox edges
      ctx.strokeStyle = 'rgba(242,194,48,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);
      try { drawPanels(ctx, g, S); } catch (e) { N.err('cricket.panels', e); }
      const ms = performance.now() - t0, P = S.perf || (S.perf = { draw: 0, max: 0, n: 0 });
      P.draw = P.n ? P.draw * 0.9 + ms * 0.1 : ms; P.n++; if (P.n > 30) P.max = Math.max(P.max * 0.995, ms);
    },
    result(g, r) {
      const S = g.S;
      if (r.quit || r.aborted) return { title: 'Match abandoned', line: 'Rain? Mummy? The scorer went home.', rows: [] };
      const homeInn = S.innings.find((i) => i && i.bat === S.home), awayInn = S.innings.find((i) => i && i.bat === S.away);
      const line = (r.margin || '') + (r.motm ? ' · Man of the Match: ' + r.motm.name : '');
      const rows = [
        [S.home.short, homeInn.runs + '/' + homeInn.wkts + ' (' + oversText(homeInn.balls) + ')'],
        [S.away.short, awayInn.runs + '/' + awayInn.wkts + ' (' + oversText(awayInn.balls) + ')'],
      ];
      if (!homeInn.synthetic) rows.push(['Fours · Sixes', homeInn.fours + ' · ' + homeInn.sixes]);
      if (r.topScorer && !homeInn.synthetic) rows.push(['Top scorer', r.topScorer.name + ' ' + r.topScorer.runs + (r.topScorer.out ? '' : '*')]);
      if (r.bestBowler && !awayInn.synthetic) rows.push(['Best bowling', r.bestBowler.name + ' ' + r.bestBowler.wkts + '/' + r.bestBowler.runs]);
      return { title: r.tie ? 'Match tied!' : r.win ? (S.V.gully ? 'Colony champions!' : 'Champions of Fateh Maidan!') : 'Haar gaye, yaar...', line, rows };
    },
    stars(g, r) {
      const S = g.S;
      if (!r.win) return 0;
      return 1 + (r.reason === 'chased' ? (r.wickets <= Math.floor(S.wickets / 2) ? 1 : 0) : ((r.oppRuns || 0) <= ((S.innings[0] && S.innings[0].runs) || 0) - 8 ? 1 : 0)) + (r.motm && r.motm.team === S.home.name ? 1 : 0);
    },
    cleanup(g) { if (g.S && g.S.pm) pmCleanup(g, g.S); if (CUR.g === g) CUR.g = null; },
  };
  const CUR = { g: null };

  /* ================================================================ public API */
  const CM = (N.cricketMatch = {
    VERSION: 1,
    TEAMS, VENUES, FIELDS, COMM, POS, TUNE,
    rules, shortOf,
    start(params) {
      params = Object.assign({}, params || {});
      if (params.autoplay && params.skipHowto == null) params.skipHowto = true;
      if (params.exhibition && !params.title) params.title = params.venue === 'gully' ? 'Colony Exhibition' : 'Exhibition Match';
      if (!N.minigames || !N.minigames.play) return Promise.resolve({ id: 'match', win: false, error: 'no-minigames' });
      if (!N.minigames.has('match')) register();
      return N.minigames.play('match', params).then((r) => {
        try { if (r && !r.quit && !r.aborted && !r.error && N.flags) { N.flags.lb_match_played = true; if (r.win) N.flags.lb_match_won = true; } } catch (e) { /* ignore */ }
        return r;
      });
    },
    play(params) { return CM.start(params); },
    isOpen() { return !!(CUR.g && !CUR.g.closed); },
    debug: {
      game() { return CUR.g; },
      force(kind) { const g = CUR.g; if (!g || !g.S) return false; g.S.force = kind; return true; },
      state() {
        const g = CUR.g; if (!g || !g.S) return null;
        const S = g.S, inn = S.inn;
        const card = (i) => i && { team: i.bat.short, runs: i.runs, wkts: i.wkts, balls: i.balls, wd: i.wd, nb: i.nb, fours: i.fours, sixes: i.sixes, target: i.target, done: i.done, endReason: i.endReason, over: i.over.slice(), synthetic: !!i.synthetic, striker: i.bat.players[i.striker].name, non: i.bat.players[i.non].name };
        return { phase: S.phase, bp: S.bp || null, gamePhase: g.phase, camMode: S.camMode, innIdx: S.innIdx, inn: card(inn), innings: S.innings.map(card), playerBats: playerBats(S), playerBowls: playerBowlsNow(S),
          bowler: S.bowler ? S.bowler.name : null, ballLog: (S.ballLog || []).slice(-40), inputLog: (S.inputLog || []).slice(-10), field: S.fieldPreset, light: S.light, tossWon: S.tossWon, run: S.run ? { done: S.run.done, active: S.run.active } : null, ball: S.ball ? { st: S.ball.st, x: S.ball.x, y: S.ball.y, z: S.ball.z } : null,
          del: S.del ? { tRel: S.del.tRel, tA: S.del.tA, len: S.del.len, line: S.del.line, wide: S.del.wide, nb: S.del.nb, kind: S.del.kind, v: S.del.v } : null, clock: S.clock, evt: S.evt, perf: S.perf ? { draw: +S.perf.draw.toFixed(2), max: +S.perf.max.toFixed(2) } : null, msg: S.msg && S.msg.text, comm: S.comm.text, ui: S.ui, frame: S.fr, bgPaints: S.bgPaints || 0, result: S.result ? { win: S.result.win, tie: S.result.tie, margin: S.result.margin } : null };
      },
      toggleCam() { const g = CUR.g; if (g && g.S) toggleCam(g.S); },
      /** a party game: the shared book and the lockstep (who runs which step, who we wait for) */
      party() { const g = CUR.g; return g && g.S && g.S.pm ? pmDebug(g.S) : null; },
    },
    dressing: null,
  });

  function register() {
    const MG = N.minigames;
    if (!MG || typeof MG.register !== 'function') return false;
    if (MG.defs && MG.defs.match === DEF) return true;
    MG.register(DEF);
    if (MG.alias) { MG.alias.lb_match = 'match'; MG.alias.cricket_match = 'match'; MG.alias.stadium_match = 'match'; MG.alias.lb_stadium = 'match'; }
    return true;
  }
  if (!register()) N.on('boot', () => { if (!register()) N.err('cricket.register', new Error('N.minigames.register missing')); });
  // any finished match (story, exhibition, a debug/autoplay run) marks the flags, not just CM.start()
  N.on('minigame:end', (e) => {
    const r = e && e.result;
    if (!e || e.id !== 'match' || !r || r.quit || r.aborted || r.error || !N.flags) return;
    N.flags.lb_match_played = true;
    N.flags.lb_match_won = !!(N.flags.lb_match_won || r.win);
  });

  /* ================================================================ party play: the shared lockstep */
  // Friends in an online room (src/party.js ctx) play ONE game together: every page runs the same deterministic
  // simulation in fixed steps of 1/60 s. Each step has an owner, the friend whose input matters there (the batter the
  // ball is bowled at, the bowler while aiming, the friend fielding a catch); the host owns the gaps between balls and
  // every AI role. The owner's page runs at real time and records its inputs (a shot with its timing, RUN, the ball it
  // bowled...) as items tagged with the step; the other pages follow a few steps behind and apply them at exactly the
  // same steps (ctx.send / ctx.on, about 8 small messages a second). Every ball is its own episode (its own rng seed,
  // everybody back on their spots) and its result is decided on its owner's page (an 'ev' item): a page whose
  // simulation came out different (float drift between browsers) takes the owner's result, so the scores never drift
  // apart. A friend who leaves or quits is played by the AI from the step the host names. Solo (the AI friends): one
  // page owns everything and nothing is sent.
  const LS_H = 1 / 60;
  function mixSeed(a, b) { let h = ((a >>> 0) ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16; return h >>> 0; }
  function gauss(r) { const a = Math.max(1e-6, r.next()), b = r.next(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(TAU * b); }
  function lockstep(o) {
    const ctx = o.ctx, solo = !ctx || ctx.mode !== 'party';
    const me = (ctx && ctx.me && ctx.me.uid) || 'me';
    const order = ((ctx && ctx.players) || []).map((p) => p.uid);
    const cmp = (e1, k1, e2, k2) => (e1 !== e2 ? e1 - e2 : k1 - k2);
    const L = {
      solo, me, ep: 0, k: 0, nextEp: null, acc: 0, seq: 0, out: [], rx: new Map(), gone: new Map(), takes: [], evs: new Map(),
      cur: me, blockedOn: null, waitFor: null, waitT: 0, txT: 0, dirty: false, lastReal: performance.now(), stopped: false, quitting: false, over: false,
      buf: 9, sent: 0, steps: 0, rxN: 0, speed: clamp(+((ctx && ctx.opts && ctx.opts.speed) || 1) || 1, 0.25, 4),
    };
    L.isGone = (uid) => { const p = L.gone.get(uid); return !!p && cmp(L.ep, L.k, p[0], p[1]) >= 0; };
    L.human = (uid) => !!uid && !/^ai:/.test(uid) && order.indexOf(uid) >= 0 && !L.isGone(uid);
    L.host = () => { for (const u of order) if (L.human(u)) return u; return me; };
    L.ctl = (uid) => (L.human(uid) ? uid : L.host());
    /** inside a step: a new episode (a new ball) starts with the next step */
    L.begin = (ep) => { L.nextEp = ep; };
    function push(p) {
      L.out.push([++L.seq, L.ep, L.k, p]);
      if (L.out.length > 16) L.out.shift();
      L.dirty = true;
      if (p.t === 'ev' && isFinite(p.ep) && !L.evs.has(p.ep)) L.evs.set(p.ep, p);
    }
    // The owner of a step is decided BEFORE that step's inputs apply (an input can hand the next step to someone else:
    // BOWL starts the batter's run-up), so the page that records one keeps the step it was recorded at.
    L.ownerNow = () => (L.pin && L.pin[0] === L.ep && L.pin[1] === L.k ? L.pin[2] : o.owner());
    /** a local input for the next step: only the owner of that step records one (it applies here at once) */
    L.input = (p) => {
      if (L.stopped || !p || L.ownerNow() !== me) return false;
      L.pin = [L.ep, L.k, me];
      push(p);
      try { o.apply(p, me); } catch (e) { N.err('cricket.ls.apply', e); }
      return true;
    };
    /** inside a step: the step's owner records what was decided (a ball's result) */
    L.emit = (p) => { if (p && (L.cur === me || solo)) push(p); };
    function rec(uid) { let r = L.rx.get(uid); if (!r) { r = { u: [-1, -1], own: false, t: 0, items: new Map(), done: 0 }; L.rx.set(uid, r); } return r; }
    function canFollow(uid) {
      const r = L.rx.get(uid);
      if (!r) return false;
      if (r.u[0] !== L.ep) return r.u[0] > L.ep;
      return r.u[1] >= L.k + (r.own && !L.gone.has(uid) ? L.buf : 0); // a few steps behind a running owner: smooth, whatever the message timing
    }
    function lag(uid) { const r = L.rx.get(uid); return !r ? 0 : r.u[0] > L.ep ? 999 : r.u[1] - L.k; }
    function applyFrom(uid) {
      const r = L.rx.get(uid);
      if (!r || !r.items.size) return;
      const due = [];
      for (const [s, it] of r.items) {
        if (it.ep === L.ep && it.k === L.k) due.push(s);
        else if (cmp(it.ep, it.k, L.ep, L.k) < 0) r.items.delete(s); // a step this page went past (only after a take-over)
      }
      due.sort((a, b) => a - b);
      for (const s of due) {
        const it = r.items.get(s);
        r.items.delete(s); r.done = Math.max(r.done, s);
        if (it.p.t !== 'ev') { try { o.apply(it.p, uid); } catch (e) { N.err('cricket.ls.apply', e); } }
      }
    }
    function gotTake(t) {
      if (!Array.isArray(t) || typeof t[0] !== 'string' || L.gone.has(t[0]) || !isFinite(t[1]) || !isFinite(t[2])) return;
      let p = [t[1] | 0, t[2] | 0];
      // already past that step, or stuck waiting for them: the AI takes over from here
      if (cmp(p[0], p[1], L.ep, L.k) < 0 || L.blockedOn === t[0]) p = [L.ep, L.k];
      L.gone.set(t[0], p);
      if (o.onGone) { try { o.onGone(t[0]); } catch (e) { /* ignore */ } }
    }
    /** party.js onLeave / a quit message: the host names the step from which the AI plays for them */
    L.leave = (uid) => {
      if (!uid || L.gone.has(uid) || !ctx || !ctx.isHost || uid === me) return;
      let p = [L.ep, L.k];
      const r = L.rx.get(uid);
      if (r && cmp(r.u[0], r.u[1] + 1, p[0], p[1]) > 0) p = [r.u[0], r.u[1] + 1];
      L.gone.set(uid, p); L.takes.push([uid, p[0], p[1]]); L.dirty = true;
      if (o.onGone) { try { o.onGone(uid); } catch (e) { /* ignore */ } }
    };
    if (!solo && ctx && typeof ctx.on === 'function') {
      L.off = ctx.on(o.tag, (d, from) => {
        if (!d || typeof d !== 'object' || !from || typeof from.uid !== 'string' || from.uid === me || order.indexOf(from.uid) < 0) return;
        L.rxN++;
        const r = rec(from.uid);
        r.t = performance.now();
        if (Array.isArray(d.u) && isFinite(d.u[0]) && isFinite(d.u[1]) && cmp(+d.u[0], +d.u[1], r.u[0], r.u[1]) > 0) r.u = [Math.min(2e9, d.u[0]) | 0, d.u[1] | 0];
        r.own = !!d.o;
        if (Array.isArray(d.it)) for (const it of d.it.slice(-24)) {
          if (!Array.isArray(it) || it.length !== 4 || !isFinite(it[0]) || it[0] <= r.done || r.items.has(+it[0])) continue;
          const p = it[3];
          if (!p || typeof p !== 'object' || typeof p.t !== 'string' || p.t.length > 8) continue;
          r.items.set(+it[0], { ep: it[1] | 0, k: it[2] | 0, p });
          if (p.t === 'ev' && isFinite(p.ep) && !L.evs.has(p.ep | 0)) L.evs.set(p.ep | 0, p);
        }
        if (Array.isArray(d.tk)) for (const t of d.tk.slice(0, 8)) gotTake(t);
        if (d.q) L.leave(from.uid);
      });
    }
    function flush(force) {
      if (solo || !ctx || typeof ctx.send !== 'function') return;
      const t = performance.now();
      if (!force && t - L.txT < (L.dirty ? 40 : 125)) return;
      const msg = { u: L.over ? [2e9, 0] : [L.ep, L.k - 1], o: !L.over && L.ownerNow() === me ? 1 : 0, it: L.out.slice(-12) };
      if (L.takes.length) msg.tk = L.takes.slice(-6);
      if (L.quitting) msg.q = 1;
      while (msg.it.length > 1 && JSON.stringify(msg).length > 1500) msg.it = msg.it.slice(1);
      let ok = false;
      try { ok = !!ctx.send(o.tag, msg); } catch (e) { ok = false; }
      if (ok) { L.txT = t; L.dirty = false; L.sent++; }
    }
    /** one frame: as many fixed steps as real time (or the owner we follow) allows */
    L.tick = (realDt) => {
      if (L.stopped) return;
      const dt = Math.max(0, realDt) * (solo ? 1 : L.speed);
      L.acc = Math.min(L.acc + dt, 1.5);
      const cap = Math.min(120, Math.max(4, Math.ceil(dt / LS_H) * 2 + 2));
      let n = 0, blocked = null;
      while (n < cap) {
        const own = L.ownerNow();
        L.cur = own;
        if (own !== me) {
          if (!canFollow(own)) {
            // they left and we have played every step they sent: the AI takes their part from here
            if (L.gone.has(own) && !L.isGone(own)) { L.gone.set(own, [L.ep, L.k]); continue; }
            // a friend who is waiting on us too (their own step is not theirs): after 5 s, step on rather than both wait
            const r = L.rx.get(own);
            if (!(L.waitT > 5 && r && !r.own && performance.now() - r.t < 2500)) { blocked = own; break; }
          }
          if (L.acc < LS_H && lag(own) <= L.buf * 2) break; // real-time pace; catch up (2x) when far behind
          applyFrom(own);
        } else {
          if (L.acc < LS_H) break;
          if (o.bot) { try { o.bot(); } catch (e) { N.err('cricket.ls.bot', e); } }
        }
        if (o.ready && !o.ready(L.waitT > 6)) { blocked = 'ev'; break; }
        try { o.step(); } catch (e) { N.err('cricket.ls.step', e); }
        L.acc = Math.max(0, L.acc - LS_H);
        if (L.nextEp != null) { L.ep = L.nextEp; L.k = 0; L.nextEp = null; } else L.k++;
        n++; L.steps++;
      }
      L.blockedOn = blocked;
      // no banking time while waiting: a page that becomes the owner next carries on at real time, it does not fast-forward
      if (blocked) { L.acc = Math.min(L.acc, LS_H); L.waitT += Math.max(0, realDt); L.waitFor = L.waitT > 0.7 ? blocked : null; } else { L.waitT = 0; L.waitFor = null; }
      L.lastReal = performance.now();
      flush(false);
    };
    /** the game is over here: the others may run to the end without waiting for this page */
    L.finish = () => { if (L.over) return; L.over = true; flush(true); };
    L.stop = (quit) => {
      if (L.stopped) return;
      if (quit) L.quitting = true; else L.over = true;
      flush(true);
      L.stopped = true;
      if (L.off) { try { L.off(); } catch (e) { /* ignore */ } }
    };
    L.info = () => ({ ep: L.ep, k: L.k, cur: L.cur, me, host: L.host(), waitFor: L.waitFor, blockedOn: L.blockedOn, steps: L.steps, sent: L.sent, rxN: L.rxN, solo,
      peers: Array.from(L.rx.entries()).map(([u, r]) => ({ uid: u, u: r.u.slice(), own: r.own, items: r.items.size })), gone: Array.from(L.gone.entries()).map(([u, p]) => [u, p[0], p[1]]) });
    return L;
  }
  const nickOf = (S, uid) => { const P = S.pm, q = P && (P.members || P.players || []).find((m) => m.uid === uid); return q ? q.nick : 'a friend'; };
  const meOf = (P) => (P.ctx && P.ctx.me && P.ctx.me.uid) || 'me';

  /* ================================================================ party: the LB Stadium match with friends */
  // params.party = the party ctx (src/party.js), params.pmode 'coop' (default: the friends together as Colony XI
  // against an AI XI) | 'vs' (friends on rival XIs, 2 overs a side). Each friend has a cricketer of their own: they bat
  // their own overs (until they are out; then the next friend still in takes the turn) and bowl their own overs, and
  // AI teammates make up the XI. Scores come from N.cricketMatch.rules like every other match.
  const PM_RIVALS = ['ashok_nagar', 'nallakunta', 'saidabad', 'barkas', 'vidyanagar'];
  const SHOT_DIRS = ['off', 'straight', 'leg', 'block'];
  const hexOk = (c) => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);
  function pmLook(q) {
    const l = (q && q.look) || {};
    return { skin: hexOk(l.skin) ? l.skin : '#a0683f', hair: hexOk(l.hair) ? l.hair : '#1a1412', girl: !!l.girl, plaits: !!l.girl };
  }
  function pmTeam(base, name, short, kit, members, fill) {
    const used = new Set();
    const uniq = (nm) => { let s = String(nm || 'Player').slice(0, 12), i = 2; while (used.has(s.toLowerCase())) s = String(nm).slice(0, 9) + ' ' + i++; used.add(s.toLowerCase()); return s; };
    const players = [];
    for (const m of members) {
      // an AI friend (solo) plays as their colony cricketer; a friend in the room as a new all-rounder with their look
      const kid = m.npc ? TEAMS.chinnu_xi.players.find((p) => p.name.toLowerCase() === String(m.npc).toLowerCase()) : null;
      const src = kid || P(m.nick, 0.62, 0.58, 'pace', pmLook(m), { field: 0.66 });
      players.push(Object.assign({}, src, { name: uniq(kid ? kid.name : m.nick), look: Object.assign({}, kid ? kid.look : pmLook(m)), hero: false, keeper: false, partyUid: m.uid }));
    }
    for (const p of fill) {
      if (players.length >= 11) break;
      if (p.hero || used.has(p.name.toLowerCase())) continue;
      players.push(Object.assign({}, p, { name: uniq(p.name), look: Object.assign({}, p.look), partyUid: null }));
    }
    if (!players.some((p) => p.keeper && !p.partyUid)) { const k = players.slice().reverse().find((p) => !p.partyUid); if (k) k.keeper = true; }
    const ai = players.map((p, i) => i).filter((i) => !players[i].partyUid);
    return clone({ id: base.id, name, short, city: base.city, kit: Object.assign({}, kit), players, bowlers: ai.slice(0, 5).concat(players.map((p, i) => i).filter((i) => players[i].partyUid)).slice(0, 5) });
  }
  function pmSetup(g) {
    const S = g.S, p = g.params, ctx = p.party, o = ctx.opts || {};
    const vs = p.pmode === 'vs' || o.mode === 'vs';
    // the same numbers on every page: a page's own difficulty / assist settings would change the shared simulation
    g.diff = clamp(o.difficulty != null ? +o.difficulty : 0.4, 0.05, 0.95);
    g.assist = !!o.assist; g.winMul = g.assist ? 1.5 : 1;
    const seed = (ctx.seed >>> 0) || 1;
    const members = ctx.players.map((q, i) => ({ uid: q.uid, nick: q.nick || 'Player', npc: q.npc || null, look: q.look, isAI: !!q.isAI, slot: i }));
    const CH = TEAMS.chinnu_xi;
    let home, away;
    if (vs) {
      const A = members.filter((m, i) => i % 2 === 0), B = members.filter((m, i) => i % 2 === 1);
      let sa = shortOf(A[0].nick), sb = shortOf(B[0] ? B[0].nick : 'Visitors');
      if (sa === sb) sb = sb.replace(' XI', '2 XI');
      home = pmTeam(CH, A[0].nick + ' XI', sa, CH.kit, A, CH.players);
      away = pmTeam(TEAMS.ashok_nagar, (B[0] ? B[0].nick : 'Visitors') + ' XI', sb, TEAMS.ashok_nagar.kit, B, TEAMS.ashok_nagar.players);
    } else {
      home = pmTeam(CH, 'Colony XI', 'CLNY XI', CH.kit, members, CH.players);
      away = clone(TEAMS[PM_RIVALS[seed % PM_RIVALS.length]]);
    }
    S.home = home; S.away = away; S.home.side = 'home'; S.away.side = 'away';
    const slots = members.map((m) => { const team = home.players.some((q) => q.partyUid === m.uid) ? home : away; return { uid: m.uid, nick: m.nick, team, idx: team.players.findIndex((q) => q.partyUid === m.uid), slot: m.slot }; });
    S.overs = clamp((o.overs | 0) || (vs ? 2 : Math.max(3, members.length)), 1, 6);
    S.wickets = 10; // a friends' XI is all out when every friend is out (pmBook); the AI XI after aiW wickets
    S.mode = 'full'; S.skipToss = true; S.innings = []; S.innIdx = 0;
    S.battedFirst = U.rng(mixSeed(seed, 77)).next() < 0.5 ? S.home : S.away;
    S.replays = o.replays !== false;
    S.intro = { t: 0 };
    tossActors(S);
    const me = meOf({ ctx });
    const L = lockstep({ ctx, tag: vs ? 'cmv' : 'cmc', owner: () => pmOwner(S), step: () => pmStep(S), apply: (q) => pmApply(S, q), ready: () => pmReady(S), bot: () => pmBot(S) });
    const mine = slots.find((s) => s.uid === me);
    S.pm = { ctx, L, vs, members, slots, aiW: Math.max(2, members.length), myTeam: mine ? mine.team : null, batCtl: null, bowlCtl: null, epBall: 0, deliv: 0, pressT: {}, vis: 0, started: false,
      frame: -1, frameDt: 0, lastNow: 0, pending: false, evApplied: false, committed: false, finished: false, closeAt: 0, seed, wait: 0, final: null };
    try { ctx.onLeave((uid) => L.leave(uid)); } catch (e) { /* ignore */ }
    // the exact moment of a key press / tap: a shot's timing is measured there, not at the next frame
    const op = g.press;
    g.press = function (a, src) { if (S.pm) S.pm.pressT[a] = performance.now(); return op.call(this, a, src); };
    S.comm.text = ''; S.comm.queue.length = 0;
    say(S, vs ? home.name + ' against ' + away.name + ' at LB Stadium. Friends, rivals, one floodlit field.' : 'Colony XI take on ' + away.name + ' under the LB Stadium floodlights. Friends, take your turns!', null, true);
  }
  // who runs the next step: the friend facing the ball (or aiming it), else the friend bowling, else the host
  function pmOwner(S) {
    const P = S.pm, L = P.L;
    if (S.phase !== 'ball' || !S.inn) return L.host();
    const bh = L.human(P.batCtl) ? P.batCtl : null, wh = L.human(P.bowlCtl) ? P.bowlCtl : null;
    if (S.bp === 'setup' || S.bp === 'aim' || S.bp === 'runup') return wh || bh || L.host();
    return bh || wh || L.host();
  }
  function pmStep(S) {
    S.clock += LS_H; S.pt += LS_H;
    phaseUpdate(S, LS_H);
    actorsUpdate(S, LS_H);
    commUpdate(S, LS_H);
    timersUpdate(S, LS_H);
  }
  // each friend bats their own over: over j belongs to the j-th friend of the batting XI (out or gone friends pass it on)
  function pmArrange(S) {
    const P = S.pm, inn = S.inn;
    if (!inn) return;
    const mine = P.slots.filter((s) => s.team === inn.bat && s.idx >= 0);
    if (!mine.length) { P.batCtl = null; return; }
    const m = mine.length, j = S.overNo | 0;
    let own = null;
    for (let t = 0; t < m && !own; t++) { const c = mine[(j + t) % m]; if (!inn.cards[c.idx].out && !P.L.isGone(c.uid)) own = c; }
    for (let t = 0; t < m && !own; t++) { const c = mine[(j + t) % m]; if (!inn.cards[c.idx].out) own = c; } // only gone friends left: the AI bats for them
    if (!own) { P.batCtl = null; return; }
    let part = null;
    for (const i of [inn.striker, inn.non]) if (part == null && i !== own.idx && !inn.cards[i].out) part = i;
    if (part == null) { const f = mine.find((c) => c !== own && !inn.cards[c.idx].out); if (f) part = f.idx; }
    if (part == null) for (let i = 0; i < inn.cards.length && part == null; i++) if (i !== own.idx && !inn.cards[i].out && !mine.some((c) => c.idx === i)) part = i;
    if (part == null) part = own.idx === 0 ? 1 : 0;
    inn.striker = own.idx; inn.non = part;
    inn.cards[own.idx].inAt = true; inn.cards[part].inAt = true;
    P.batCtl = own.uid;
  }
  // a friends' XI bowls its friends' overs in turn; the AI XI keeps its usual rotation
  function pmBowler(S) {
    const P = S.pm, bowl = bowlTeam(S);
    const mine = P.slots.filter((s) => s.team === bowl && s.idx >= 0);
    if (!mine.length) { P.bowlCtl = null; return false; }
    const c = mine[(S.overNo | 0) % mine.length];
    const pl = bowl.players[c.idx];
    S.lastBowler = pl;
    setBowler(S, pl);
    S.aim.type = pl.type === 'spin' ? 'spin' : 'pace';
    P.bowlCtl = c.uid;
    return true;
  }
  function pmBall(S) {
    const P = S.pm, g = S.g;
    P.deliv++;
    P.epBall = S.innIdx * 500 + P.deliv;
    P.L.begin(P.epBall);
    g.rng = U.rng(mixSeed(P.seed, P.epBall));
    S.crng = U.rng(mixSeed(P.seed ^ 0x2545f491, P.epBall));
    P.pending = false; P.evApplied = false; P.committed = false; P.myEv = null;
    pmArrange(S);
    // everybody back on their spots: nothing from the last ball carries over (each ball is its own episode)
    for (const a of S.actors) if (a.role === 'field' && a.spot) { a.x = a.spot.x; a.z = a.spot.z; a.tx = null; a.chase = false; a.spd = 0; }
  }
  function pmApply(S, q) {
    if (!q || S.phase !== 'ball') return;
    switch (q.t) {
      case 'shot': if ((S.bp === 'flight' || S.bp === 'past') && playerBats(S) && !S.swung && SHOT_DIRS.indexOf(q.d) >= 0) attemptShot(S, q.d, !!q.l, 'player', +q.e); break;
      case 'run': if (S.bp === 'live' && playerBats(S)) { if (!S.run.active) startRun(S); else S.run.queued = true; } break;
      case 'lock': if (S.bp === 'aim' && playerBowlsNow(S)) aimLock(S, q); break;
      case 'rel': if (S.bp === 'runup' && playerBowlsNow(S) && !S.del) { S.meter = clamp(+q.m || 0, 0, 1.12); aimRelease(S); } break;
      case 'field': if (S.bp === 'aim' && playerBowlsNow(S) && FIELDS[q.p] && q.p !== S.fieldPreset) { S.fieldPreset = q.p; S.userField = q.p; assignField(S); for (const a of S.actors) if (a.role === 'field' && a.spot) { a.tx = a.spot.x; a.tz = a.spot.z; } say(S, 'Field change: ' + FIELDS[q.p].name + '.', null, true); } break;
      case 'catch': if (S.bp === 'live' && S.catchPrompt && !S.catchPrompt.pressed) S.catchPrompt.pressed = q.q === 'good' ? 'good' : 'early'; break;
      case 'skip': if (S.bp === 'dead' && S.bt > 0.45) S.bt = S.deadT; else if (S.bp === 'replay') S.skipReplay = true; break;
      default:
    }
  }
  const WK_KINDS = ['bowled', 'caught', 'onetip', 'house', 'runout'];
  function pmEvOut(ev) {
    const w = ev.wicket;
    return { r: ev.runs | 0, w: ev.wide ? 1 : 0, n: ev.nb ? 1 : 0, b: ev.boundary | 0, bw: String(ev.bowler || ''), sa: ev.strikerAfter, na: ev.nonAfter,
      k: w ? { k: w.kind, h: String(w.how || '').slice(0, 60), f: w.fielder ? String(w.fielder).slice(0, 14) : null, i: w.idx } : null,
      s: ev.shot ? { a: +(+ev.shot.ang || 0).toFixed(3), d: +(+ev.shot.dist || 0).toFixed(3), r: ev.shot.runs | 0 } : null };
  }
  function pmEvIn(S, o) {
    const inn = S.inn, n = inn.cards.length;
    const ix = (v, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
    const bw = typeof o.bw === 'string' && inn.bowl.players.some((p) => p.name === o.bw) ? o.bw : (S.bowler ? S.bowler.name : '?');
    const w = o.k && WK_KINDS.indexOf(o.k.k) >= 0 ? { kind: o.k.k, how: String(o.k.h || o.k.k).slice(0, 60), fielder: typeof o.k.f === 'string' ? o.k.f.slice(0, 14) : null, idx: ix(o.k.i, inn.striker) } : null;
    const sa = ix(o.sa, inn.striker), na = ix(o.na, inn.non);
    return { runs: clamp(o.r | 0, 0, 7), wide: !!o.w, nb: !!o.n, boundary: o.b === 4 || o.b === 6 ? o.b : 0, bowler: bw, wicket: w, strikerAfter: sa, nonAfter: na === sa ? inn.non : na,
      shot: o.s && isFinite(o.s.a) ? { ang: +o.s.a, dist: clamp(+o.s.d || 0, 0, 1), runs: o.s.r | 0 } : null };
  }
  // the scorebook (rules.applyBall) plus the party's all-out rule
  function pmBook(S, ev) {
    const P = S.pm, inn = S.inn;
    const res = rules.applyBall(inn, ev);
    if (!res.inningsEnd) {
      const mine = P.slots.filter((s) => s.team === inn.bat && s.idx >= 0);
      if (mine.length ? mine.every((s) => inn.cards[s.idx].out) : inn.wkts >= P.aiW) { res.inningsEnd = true; inn.done = true; inn.endReason = 'allout'; }
    }
    return res;
  }
  // commitBall in a party game: the ball's owner writes the book and tells everybody; the others take that result
  function pmCommit(S, ev) {
    const P = S.pm, L = P.L;
    P.committed = true;
    if (L.solo || L.cur === L.me) {
      const res = pmBook(S, ev);
      P.evApplied = true;
      L.emit({ t: 'ev', ep: P.epBall, k: L.k, ev: pmEvOut(ev) });
      return res;
    }
    const a = L.evs.get(P.epBall);
    if (a && a.ev) { P.evApplied = true; const e2 = pmEvIn(S, a.ev); pmFixMsg(S, e2, ev); return pmBook(S, e2); }
    P.pending = true; P.myEv = ev;
    return null;
  }
  // a page whose own picture came out different shows the decided result
  function pmFixMsg(S, ev, mine) {
    const same = mine && !!mine.wicket === !!ev.wicket && (mine.boundary | 0) === (ev.boundary | 0) && (mine.runs | 0) === (ev.runs | 0) && !!mine.wide === !!ev.wide;
    if (same) return;
    const t = ev.wicket ? (ev.wicket.kind === 'runout' ? 'RUN OUT!' : ev.wicket.kind === 'bowled' ? 'BOWLED!' : ev.wicket.kind === 'house' ? 'HOUSE = OUT!' : 'CAUGHT!') : ev.boundary === 6 ? 'SIX!' : ev.boundary === 4 ? 'FOUR!' : ev.wide ? 'WIDE' : ev.runs ? ev.runs + (ev.runs === 1 ? ' RUN' : ' RUNS') : 'DOT BALL';
    message(S, t, '', ev.wicket ? '#ff6a5a' : ev.boundary ? '#ffd84a' : '#ffffff', !!(ev.wicket || ev.boundary));
  }
  function pmReady(S, force) {
    const P = S.pm, L = P.L;
    if (L.solo || P.evApplied) return true;
    const a = L.evs.get(P.epBall);
    if ((!a || !a.ev) && P.pending && force && P.myEv) { P.pending = false; P.evApplied = true; S.res = pmBook(S, P.myEv); return true; } // nobody decided it: ours stands
    if (!a || !a.ev) return !P.pending;
    if (P.pending) { P.pending = false; P.evApplied = true; const e2 = pmEvIn(S, a.ev); S.res = pmBook(S, e2); pmFixMsg(S, e2, null); return true; }
    // my simulation has not ended this ball by the step where its owner's did: end it now with the owner's result
    if (S.phase === 'ball' && !P.committed && L.cur !== L.me && L.k >= (a.k | 0) && (S.bp === 'flight' || S.bp === 'past' || S.bp === 'live')) {
      const e2 = pmEvIn(S, a.ev);
      S.out.runs = e2.runs; S.out.wide = e2.wide; S.out.boundary = e2.boundary; S.out.wicket = e2.wicket; S.out.shot = e2.shot;
      if (S.run) { S.run.active = false; S.run.done = e2.boundary ? 0 : e2.runs; }
      if (S.ball) S.ball.st = 'dead';
      endBall(S, 1.2);
    }
    return true;
  }
  function pmInHand(S, inn) {
    const P = S.pm, mine = P.slots.filter((s) => s.team === inn.bat && s.idx >= 0);
    return mine.length ? mine.filter((s) => !inn.cards[s.idx].out).length : Math.max(0, P.aiW - inn.wkts);
  }
  function pmStats(S, s) {
    const P = S.pm, team = s.team;
    const bi = S.innings.find((i) => i && i.bat === team), wi = S.innings.find((i) => i && i.bowl === team);
    const pl = team.players[s.idx] || { name: '?' };
    const c = bi && bi.cards[s.idx], f = wi && wi.figs[pl.name], ct = (wi && wi.catches[pl.name]) || 0;
    const runs = c ? c.runs : 0, balls = c ? c.balls : 0, wk = f ? f.wkts : 0;
    const R = S.result || {};
    const won = !R.tie && R.winner === team;
    const note = (c && c.inAt ? runs + (c.out ? '' : '*') + ' (' + balls + ')' : 'did not bat') + (f && f.balls ? ' · ' + wk + '/' + f.runs : '') + (ct ? ' · ' + ct + ' ct' : '') + (P.vs ? (R.tie ? ' · tied' : won ? ' · won' : ' · lost') : '');
    return { uid: s.uid, nick: s.nick, name: pl.name, team: team.short, runs, balls, wk, ct, won, res: { score: runs + wk * 10 + ct * 5, runs, balls, wk, ct, win: won ? 1 : 0, team: team.short, note } };
  }
  function pmFinish(S) {
    const P = S.pm, ctx = P.ctx;
    if (P.finished) return;
    P.finished = true;
    const rows = P.slots.map((s) => pmStats(S, s));
    P.final = rows;
    const mine = rows.find((r) => r.uid === P.L.me);
    try { if (mine && !P.L.isGone(P.L.me)) ctx.report(mine.res); } catch (e) { N.err('cricket.party.report', e); }
    try { if (ctx.ai && ctx.ai.report && (ctx.mode !== 'party' || ctx.isHost)) for (const r of rows) if (/^ai:/.test(r.uid)) ctx.ai.report(r.uid, r.res); } catch (e) { N.err('cricket.party.aiReport', e); }
    P.closeAt = S.clock + 4.2;
  }
  function pmClose(g, S) {
    const P = S.pm;
    if (g.closed || P.closed) return;
    P.closed = true;
    P.L.stop(false);
    const mine = (P.final || []).find((r) => r.uid === P.L.me);
    try { g.close(Object.assign(g.baseResult(), { win: !!(mine && mine.won), party: true, runs: mine ? mine.runs : 0, score: mine ? mine.res.score : 0 })); } catch (e) { N.err('cricket.party.close', e); }
  }
  // one lockstep tick per frame (the framework calls update() several times a frame)
  function pmUpdate(g, dt) {
    const S = g.S, P = S.pm;
    P.frameDt += dt;
    if (P.frame === g.rt) return;
    P.frame = g.rt;
    const fdt = P.frameDt; P.frameDt = 0;
    const L = P.L;
    if (!P.started) {
      let el = 0;
      try { el = P.ctx.elapsed(); } catch (e) { el = 0; }
      if (isFinite(el) && el < 0) { P.wait = -el / 1000; P.vis += fdt; uiSync(g); return; }
      P.started = true; P.wait = 0; L.lastReal = performance.now(); L.acc = 0; P.lastNow = performance.now();
    }
    const now = performance.now();
    const real = L.solo ? fdt : Math.min(0.5, (now - (P.lastNow || now)) / 1000);
    P.lastNow = now;
    try { pmInput(S, g); } catch (e) { N.err('cricket.party.input', e); }
    L.tick(real);
    P.vis += fdt;
    uiSync(g);
    if (P.finished && !L.over) L.finish();
    if (P.finished && S.clock >= P.closeAt) pmClose(g, S);
  }
  // this page's keys and taps -> inputs for the shared simulation (only on the page that owns the step)
  function pmInput(S, g) {
    const P = S.pm, L = P.L;
    if (g.pressed('cam')) toggleCam(S);
    if (S.phase !== 'ball' || L.ownerNow() !== L.me) return;
    const since = (a) => { const t = P.pressT[a]; return t ? clamp(((t - L.lastReal) / 1000) * (L.solo ? 1 : L.speed), 0, 0.25) : 0; };
    if (meBowls(S)) {
      if (S.bp === 'aim') {
        for (let i = 1; i <= 4; i++) if (g.pressed('t' + i)) setType(S, TYPES[i - 1]);
        if (g.pressed('type') || g.pressed('run')) setType(S, TYPES[(TYPES.indexOf(S.aim.type) + 1) % 4]);
        if (g.pressed('field') || g.pressed('loft')) L.input({ t: 'field', p: FIELD_ORDER[(FIELD_ORDER.indexOf(S.fieldPreset) + 1) % FIELD_ORDER.length] });
        if (g.pressed('go') && S.bt > 0.25) L.input({ t: 'lock', x: +S.aim.wx.toFixed(4), z: +S.aim.wz.toFixed(4), ty: S.aim.type });
      } else if (S.bp === 'runup') {
        if (g.pressed('go') && S.bt > 0.08 && !S.del) L.input({ t: 'rel', m: +Math.min(1.12, (S.bt + since('go')) / (S.runT || 1)).toFixed(4) });
      } else if (S.bp === 'live') {
        if (g.pressed('go') && S.catchPrompt && !S.catchPrompt.pressed) L.input({ t: 'catch', q: S.catchPrompt.at - S.liveT - since('go') <= 0.45 ? 'good' : 'early' });
      }
    } else if (meBats(S)) {
      if (g.touch && g.pressed('loft')) S.loftLatch = !S.loftLatch;
      if (S.bp === 'flight' || S.bp === 'past') {
        const loft = S.loftLatch || (!g.touch && g.down('loft'));
        if (g.pressed('left')) playerShot(S, 'left', loft, since('left'));
        else if (g.pressed('right')) playerShot(S, 'right', loft, since('right'));
        else if (g.pressed('up') || g.pressed('go')) playerShot(S, 'up', loft, since(g.pressed('up') ? 'up' : 'go'));
        else if (g.pressed('down')) playerShot(S, 'down', false, since('down'));
      }
      if (S.bp === 'live' && g.pressed('run')) L.input({ t: 'run' });
    }
    if (g.pressed('go') && ((S.bp === 'dead' && S.bt > 0.45 && !(S.out.boundary || S.out.wicket)) || S.bp === 'replay')) L.input({ t: 'skip' });
  }
  // the test autopilot (params.autoplay): plays THIS page's role inside the shared steps, exactly on time
  function pmBot(S) {
    const g = S.g, P = S.pm, L = P.L;
    if (!g.auto || S.phase !== 'ball' || !S.brng) return;
    const lose = g.auto === 'lose';
    if ((S.bp === 'dead' && S.bt > 0.6) || (S.bp === 'replay' && S.bt > 0.6)) { const key = P.epBall + S.bp; if (P.botSkip !== key) { P.botSkip = key; L.input({ t: 'skip' }); } return; }
    if (meBowls(S)) {
      if (S.bp === 'aim' && S.bt > 0.4) {
        const ty = lose ? 'pace' : S.brng.next() < 0.3 ? 'yorker' : S.bowler.type === 'spin' ? 'spin' : 'pace';
        L.input({ t: 'lock', x: lose ? 1.35 : +(-0.1 + (S.brng.next() - 0.5) * 0.1).toFixed(3), z: lose ? 3.2 : TYPE_INFO[ty].z, ty });
      } else if (S.bp === 'runup' && !S.del) {
        const G0 = S.green || meterGreen(S);
        if (S.meter >= (lose ? 0.3 : G0.c - 0.008)) L.input({ t: 'rel', m: +Math.min(1.12, S.meter + LS_H / (S.runT || 1)).toFixed(4) });
      } else if (S.bp === 'live' && S.catchPrompt && !S.catchPrompt.pressed && !lose && S.catchPrompt.at - S.liveT < 0.3) L.input({ t: 'catch', q: 'good' });
      return;
    }
    if (!meBats(S)) return;
    if (S.bp === 'flight' && !S.swung && S.del) {
      const del = S.del, tA = del.tRel + del.tA, t = S.clock + LS_H;
      if (lose) { if (t - del.tRel > del.tA * 0.4) L.input({ t: 'shot', d: 'straight', l: 0, e: +(t - tA).toFixed(4) }); return; }
      if (del.wide) return;
      if (t >= tA - 0.006) {
        const len = del.len, line = del.line;
        let d = 'straight';
        if (len === 'short' || len === 'bouncer') d = line === 'leg' || S.brng.next() < 0.5 ? 'leg' : 'off';
        else if (line === 'off') d = 'off'; else if (line === 'leg') d = 'leg';
        const loft = (len === 'short' || len === 'bouncer') && d === 'leg' && S.brng.next() < 0.6;
        L.input({ t: 'shot', d, l: loft ? 1 : 0, e: +(t - tA + (S.brng.next() - 0.5) * 0.02).toFixed(4) });
      }
    } else if (S.bp === 'live' && !lose && S.calls && S.calls.col === '#b9ffb0' && !S.run.active && S.run.done < 3) L.input({ t: 'run' });
  }
  function pmRole(S) { return S.phase === 'ball' ? (meBowls(S) ? 'bowl' : meBats(S) ? 'bat' : 'watch') : 'watch'; }
  function pmWatchLine(S) {
    const P = S.pm;
    if (!S.inn || S.phase !== 'ball') return 'Watching the match';
    const b = P.batCtl && P.L.human(P.batCtl) ? nickOf(S, P.batCtl) + ' is batting' : S.inn.bat.players[S.inn.striker].name + ' (AI) is batting';
    const w = P.bowlCtl && P.L.human(P.bowlCtl) ? nickOf(S, P.bowlCtl) + ' is bowling' : (S.bowler ? S.bowler.name : 'AI') + ' bowls';
    return b + ' · ' + w;
  }
  function pmHud(g, S) {
    if (g.W < 600) return [];
    const r = pmRole(S), inn = S.inn || S.innings[S.innings.length - 1];
    const it = [{ k: 'YOU', v: r === 'bat' ? 'BAT' : r === 'bowl' ? 'BOWL' : 'WATCH', good: r !== 'watch' }];
    if (inn) { it.push({ k: inn.bat.short, v: rules.score(inn) }, { k: 'OV', v: oversText(inn.balls) + '/' + S.overs }); if (inn.target) it.push({ k: 'NEED', v: rules.need(inn) + '/' + rules.ballsLeft(inn) }); }
    return it;
  }
  // the batting picture's feedback for friends who are watching (timing call, the partner's call)
  function pmWatchUi(ctx, g, S, u) {
    const fr = S.fr;
    if (S.timing && S.timing.t < 1.0) txt(ctx, S.timing.label, fr.x + fr.w / 2, fr.y + fr.h * 0.5 - S.timing.t * u * 1.5, { font: 'display', size: u * 1.3, color: S.timing.label === 'PERFECT' ? '#ffd84a' : S.timing.ok ? '#b9ffb0' : '#ffb4a6', outline: 4 });
    if (S.calls && S.bp === 'live' && S.calls.t < 2.4) txt(ctx, S.inn.bat.players[S.inn.non].name + ': ' + S.calls.text, fr.x + fr.w / 2, fr.y + fr.h * 0.64, { font: 'osd', size: u * 1.05, color: '#fff', outline: 3, maxW: fr.w - u });
  }
  // party tags on the broadcast: this page's role, who we are waiting for, the wait before GO
  function pmOverlay(ctx, g, S, u) {
    const P = S.pm, fr = S.fr, L = P.L;
    if (!P.started) {
      const n = Math.ceil(P.wait || 0);
      const w = Math.min(fr.w * 0.8, u * 22), h = u * 4.2, x = fr.x + (fr.w - w) / 2, y = fr.y + fr.h * 0.36;
      ctx.fillStyle = 'rgba(20,36,106,0.9)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#f2c230'; ctx.fillRect(x, y, w, u * 0.25);
      txt(ctx, P.vs ? 'FRIENDS vs FRIENDS' : 'MATCH WITH FRIENDS', x + w / 2, y + h * 0.33, { font: 'osd', size: u * 1.2, color: '#ffd84a', maxW: w - u });
      txt(ctx, n > 0 ? 'Starting in ' + n + '…' : 'GO!', x + w / 2, y + h * 0.7, { font: 'display', size: u * 1.6, color: '#fff', maxW: w - u });
      return;
    }
    // the role pill (bottom left, beside the camera pill)
    if (S.phase === 'ball' || S.phase === 'over_break' || S.phase === 'inn_intro') {
      const r = pmRole(S);
      const s = r === 'bat' ? 'YOU BAT' : r === 'bowl' ? 'YOU BOWL' : S.phase === 'ball' ? 'WATCHING · ' + pmWatchLine(S).split(' · ')[0].toUpperCase() : 'NEXT OVER…';
      ctx.font = font('osd', u * 0.9);
      const w = Math.min(fr.w * 0.6, ctx.measureText(s).width + u * 1.6), h = u * 1.6, x = fr.x + fr.w - w - u * 0.5, y = fr.y + fr.h - h * 2 - u * (S.tickerIn ? 3.0 : 0.9);
      ctx.fillStyle = r === 'bat' ? 'rgba(242,194,48,0.92)' : r === 'bowl' ? 'rgba(127,216,255,0.92)' : 'rgba(10,12,30,0.65)'; rr(ctx, x, y, w, h, h / 2); ctx.fill();
      txt(ctx, s, x + w / 2, y + h / 2 + 1, { font: 'osd', size: u * 0.9, color: r === 'watch' ? '#eaf2ff' : '#14246a', maxW: w - u * 0.6 });
    }
    // over / innings breaks: who bats and bowls next
    if (S.banner && (S.phase === 'over_break' || S.phase === 'inn_intro') && S.inn) {
      const nx = pmNextLine(S);
      if (nx) txt(ctx, nx, fr.x + fr.w / 2, fr.y + fr.h * 0.6 + u * 4.6, { font: 'osd', size: u * 1.05, color: '#b9ffb0', outline: 3, maxW: fr.w - u });
    }
    if (L.waitFor) {
      const s = L.waitFor === 'ev' ? 'Waiting for the result…' : 'Waiting for ' + nickOf(S, L.waitFor) + '…';
      ctx.font = font('osd', u * 1.1);
      const w = ctx.measureText(s).width + u * 2, h = u * 2;
      ctx.fillStyle = 'rgba(10,12,30,0.82)'; rr(ctx, fr.x + (fr.w - w) / 2, fr.y + fr.h * 0.2, w, h, h / 2); ctx.fill();
      txt(ctx, s, fr.x + fr.w / 2, fr.y + fr.h * 0.2 + h / 2 + 1, { font: 'osd', size: u * 1.1, color: '#ffd84a' });
    }
  }
  function pmNextLine(S) {
    const P = S.pm, inn = S.inn;
    const bat = P.slots.filter((s) => s.team === inn.bat && s.idx >= 0);
    const j = S.phase === 'over_break' ? S.overNo : 0;
    let b = null;
    for (let t = 0; t < bat.length && !b; t++) { const c = bat[(j + t) % bat.length]; if (!inn.cards[c.idx].out) b = c; }
    const bowl = P.slots.filter((s) => s.team === inn.bowl && s.idx >= 0);
    const w = bowl.length ? bowl[j % bowl.length] : null;
    const parts = [];
    if (b) parts.push((b.uid === P.L.me ? 'YOU' : b.nick) + ' bat' + (b.uid === P.L.me ? '' : 's'));
    if (w) parts.push((w.uid === P.L.me ? 'YOU' : w.nick) + ' bowl' + (w.uid === P.L.me ? '' : 's'));
    return parts.length ? 'Next: ' + parts.join(' · ') : '';
  }
  function pmCleanup(g, S) {
    const P = S.pm;
    if (!P) return;
    if (!P.finished) {
      P.L.stop(true);
      try { if (P.ctx && P.ctx.report && P.ctx.phase !== 'done') P.ctx.report({ dnf: true, note: 'left the match' }); } catch (e) { /* ignore */ }
    } else P.L.stop(false);
  }
  function pmDebug(S) {
    const P = S.pm;
    return { mode: P.vs ? 'vs' : 'coop', lock: P.L.info(), owner: pmOwner(S), role: pmRole(S), batCtl: P.batCtl, bowlCtl: P.bowlCtl, epBall: P.epBall, deliv: P.deliv, started: P.started, finished: P.finished,
      home: S.home.name, away: S.away.name, overs: S.overs, slots: P.slots.map((s) => ({ uid: s.uid, nick: s.nick, team: s.team.short, idx: s.idx, name: s.team.players[s.idx] && s.team.players[s.idx].name })),
      innings: S.innings.map((i) => i && { team: i.bat.short, runs: i.runs, wkts: i.wkts, balls: i.balls, done: i.done, target: i.target, over: i.over.slice() }), final: P.final, result: S.result ? { winner: S.result.winner ? S.result.winner.short : null, tie: S.result.tie, margin: S.result.margin } : null };
  }

  /* ================================================================ party: gully cricket with friends */
  // The colony-lane game (src/minigames.js 'cricket', its engine in def.eng) with friends: every friend bats an innings
  // (6 balls, 2 wickets), bowls one and fields one, in turn; the AI friends fill the roles when playing solo. The bowler
  // picks the line (◀ ▶), the length (▲ ▼) and the pace (Q / PACE) and lets go when the swinging needle is in the green;
  // the batter plays it like the normal game; the third friend fields: CATCH! when the ring closes on the fielder the
  // ball flies to. Gully rules stay: a catch and one-tip-one-hand are OUT, Aunty's compound is OUT. Most runs wins.
  const GP = {};
  const GP_LINES = [-0.36, -0.15, 0.04, 0.2, 0.4];
  const GP_LENS = [{ k: 'yorker', name: 'YORKER', zb: 1.1, win: 0.74 }, { k: 'full', name: 'FULL', zb: 2.7, win: 1.1 }, { k: 'good', name: 'GOOD', zb: 4.6, win: 1 }, { k: 'short', name: 'SHORT', zb: 6.9, win: 1 }];
  const GP_PACE = [{ name: 'SLOW', T: 1.24, win: 1.12, kph: 54 }, { name: 'MEDIUM', T: 0.98, win: 1, kph: 70 }, { name: 'FAST', T: 0.8, win: 0.86, kph: 86 }];
  const GP_COL = ['#f2c230', '#7fd8ff', '#ff9ab0'];
  const GP_SHIRT = ['#d8402a', '#2a5cb8', '#2a8c82'];
  function gpMeter(t, pace) { const per = pace === 2 ? 1.15 : 1.45; const u = (t / per) % 2; return 1 - Math.abs(u - 1); }
  function gpKid(look, i) {
    const l = look || {};
    return { shirt: hexOk(l.shirt) ? l.shirt : GP_SHIRT[i % 3], pants: hexOk(l.pants) ? l.pants : '#2b3a5a', skin: hexOk(l.skin) ? l.skin : '#a8703f', hair: hexOk(l.hair) ? l.hair : '#1a1412', stripes: hexOk(l.stripes) ? l.stripes : undefined, girl: !!l.girl };
  }
  GP.setup = function (g) {
    const S = g.S, ctx = g.params.party, o = ctx.opts || {}, E = N.minigames.defs.cricket.eng;
    S.g = g;
    g.diff = clamp(o.difficulty != null ? +o.difficulty : 0.4, 0.05, 0.95);
    g.assist = !!o.assist; g.winMul = g.assist ? 1.5 : 1;
    const T = E.T, d = g.diff;
    S.winP = (T.perfect[0] + (1 - d) * T.perfect[1]) * g.winMul; S.winG = (T.good[0] + (1 - d) * T.good[1]) * g.winMul; S.winE = (T.edge[0] + (1 - d) * T.edge[1]) * g.winMul;
    S.trial = false; S.mali = null; S.target = 999; S.bowlerName = null;
    const players = ctx.players.map((q, i) => {
      let sk = 0.62;
      if (q.isAI) { try { sk = ctx.ai && ctx.ai.skill ? ctx.ai.skill(q.uid) : 0.7; } catch (e) { sk = 0.7; } }
      return { uid: q.uid, nick: q.nick || 'Player', isAI: !!q.isAI, npc: q.npc || null, col: GP_COL[i % 3], kid: gpKid(q.look, i), skill: clamp(+sk || 0.62, 0.2, 0.97) };
    });
    const n = players.length;
    const inns = players.map((p, i) => ({ bat: i, bowl: n > 1 ? (i + 1) % n : -1, field: n > 2 ? (i + 2) % n : -1, runs: 0, balls: 0, wk: 0, fours: 0, sixes: 0, log: [], done: false, skipped: false }));
    const L = lockstep({ ctx, tag: 'gcx', owner: () => gpOwner(S), step: () => gpStep(S), apply: (q) => gpApply(S, q), ready: () => gpReady(S), bot: () => gpBot(S) });
    S.pm = { gully: true, ctx, E, L, players, members: players, n, inns, ii: 0, B: clamp((o.balls | 0) || 6, 2, 12), W: clamp((o.wickets | 0) || 2, 1, 5), stage: 'intro', st: 0, ep: 0, ball: 0,
      plan: null, aim: { l: 2, n: 2, p: 1 }, pressT: {}, vis: 0, started: false, frame: -1, frameDt: 0, lastNow: 0, booked: -1, pending: false, catchAt: null, catchF: -1, catchPress: null,
      aiSwing: null, think: 1, banner: null, reported: false, closed: false, closeAt: 0, seed: (ctx.seed >>> 0) || 1, padKey: null, wait: 0, final: null, speed: null, brng: U.rng(((ctx.seed >>> 0) ^ 0x51ed) >>> 0) };
    S.pmRoll = (f, b) => gpRoll(S, f, b);
    try { ctx.onLeave((uid) => L.leave(uid)); } catch (e) { /* ignore */ }
    const op = g.press;
    g.press = function (a, src) { if (S.pm) S.pm.pressT[a] = performance.now(); return op.call(this, a, src); };
    try { if (g.root) g.root.classList.add('cg-party'); } catch (e) { /* ignore */ }
    gpCss();
    S.stage = 'wait'; S.bowler.z = 21;
  };
  function gpInn(S) { return S.pm.inns[S.pm.ii]; }
  function gpOwner(S) {
    const P = S.pm, L = P.L, inn = gpInn(S);
    const st = P.stage;
    if (!inn || st === 'intro' || st === 'break' || st === 'final' || st === 'result') return L.host();
    const bat = P.players[inn.bat].uid, bowl = inn.bowl >= 0 ? P.players[inn.bowl].uid : null, fld = inn.field >= 0 ? P.players[inn.field].uid : null;
    const hb = L.human(bat) ? bat : null, hw = bowl && L.human(bowl) ? bowl : null, hf = fld && L.human(fld) ? fld : null;
    if (st === 'aim') return hw || hb || L.host();
    if (st === 'hit') return hf || hb || hw || L.host();
    return hb || hw || L.host();
  }
  // this page's part in the current ball: 'bat' | 'bowl' | 'field' | 'watch'
  function gpRole(S) {
    const P = S.pm, inn = gpInn(S), me = P.L.me;
    if (!inn || P.stage === 'intro' || P.stage === 'break' || P.stage === 'final' || P.L.isGone(me)) return 'watch';
    if (P.players[inn.bat].uid === me) return 'bat';
    if (inn.bowl >= 0 && P.players[inn.bowl].uid === me) return 'bowl';
    if (inn.field >= 0 && P.players[inn.field].uid === me) return 'field';
    return 'watch';
  }
  function gpStep(S) {
    const P = S.pm, g = S.g, E = P.E, h = LS_H, bw = S.bowler;
    S.clock += h; S.st += h; P.st += h;
    if (S.msg) S.msg.t += h;
    if (S.swing) { S.swing.t += h; if (S.swing.t > 0.55 && S.stage !== 'flight') S.swing = null; }
    if (S.aunty > 0) S.aunty -= h;
    if (S.bricks) S.bricks.t += h;
    if (P.banner) P.banner.t += h;
    if (P.speed) P.speed.t += h;
    const logN = S.log.length;
    switch (P.stage) {
      case 'intro': if (P.st > 3.4) gpInnings(S, gpNextInnings(S, 0)); break;
      case 'aim': gpAim(S); break;
      case 'runup': { const k = Math.min(1, P.st / 1.15); bw.z = lerp(20.5, 14.2, k); bw.ph += h * 11; bw.arm = 0; if (k >= 1) gpRelease(S); break; }
      case 'flight': gpFlight(S); break;
      case 'hit': E.flyBall(g, S, h); E.moveFielders(S, h); break;
      case 'result': if (S.ball && !S.ball.done) E.flyBall(g, S, h); E.moveFielders(S, h); if (P.st > P.nextAt) gpNext(S); break;
      case 'break': if (P.st > 3.4) gpAfterBreak(S); break;
      case 'final': if (!P.reported && P.st > 1.2) gpFinish(S); break;
      default:
    }
    if (S.log.length > logN && (P.stage === 'flight' || P.stage === 'hit')) gpOutcome(S);
  }
  function gpNextInnings(S, from) { const P = S.pm; for (let i = Math.max(0, from); i < P.n; i++) { if (!P.L.isGone(P.players[P.inns[i].bat].uid)) return i; P.inns[i].skipped = true; P.inns[i].done = true; } return -1; }
  function gpInnings(S, i) {
    const P = S.pm;
    if (i < 0) { P.stage = 'final'; P.st = 0; return; }
    const inn = P.inns[i];
    P.ii = i;
    const bat = P.players[inn.bat], bowl = inn.bowl >= 0 ? P.players[inn.bowl] : null;
    S.batLook = bat.kid;
    S.bowlLook = bowl ? { shirt: bowl.kid.shirt, pants: bowl.kid.pants, skin: bowl.kid.skin, girl: bowl.kid.girl } : null;
    S.log = [];
    P.banner = { title: bat.nick.toUpperCase() + ' BATS', sub: (bowl ? bowl.nick : 'Bunty-anna') + ' bowls' + (inn.field >= 0 ? ' · ' + P.players[inn.field].nick + ' fields' : ''), t: 0, intro: true };
    gpNewBall(S);
  }
  function gpNewBall(S) {
    const P = S.pm, g = S.g, E = P.E;
    P.ball++;
    P.ep = P.ii * 100 + P.ball;
    P.L.begin(P.ep);
    g.rng = U.rng(mixSeed(P.seed, P.ep));
    P.stage = 'aim'; P.st = 0; S.stage = 'wait'; S.st = 0;
    P.plan = null; P.aiSwing = null; P.catchAt = null; P.catchF = -1; P.catchPress = null; P.pending = false; P.booked = -1; P.myEv = null;
    P.think = 0.7 + g.rng.next() * 0.9;
    S.ball = null; S.swing = null; S.bricks = null; S.trail.length = 0;
    E.resetFielders(S);
    S.bowler.z = 21; S.bowler.x = 0.3; S.bowler.arm = 0;
  }
  function gpBowlerOf(S) { const P = S.pm, inn = gpInn(S); return inn && inn.bowl >= 0 ? P.players[inn.bowl] : null; }
  function gpAim(S) {
    const P = S.pm, bp = gpBowlerOf(S);
    if (!bp || !P.L.human(bp.uid)) { if (P.st > P.think) gpBowl(S, gpAiPlan(S, bp)); return; }
    if (P.st > 15) gpBowl(S, { l: 2, n: 2, p: 1, q: 0.3 }); // the friend stepped away: the ball goes down by itself
  }
  function gpAiPlan(S, pl) {
    const r = S.g.rng, sk = pl ? pl.skill : 0.6;
    const w = (tbl) => { let s = 0; for (const v of tbl) s += v; let x = r.next() * s; for (let i = 0; i < tbl.length; i++) { x -= tbl[i]; if (x <= 0) return i; } return tbl.length - 1; };
    const l = w([1, 3, 3.4, 3, 1]), n = w([1, 2.6, 4.4, 2.2]);
    const p = pl && pl.npc === 'ayesha' ? w([0.5, 2, 3.5]) : w([1.4, 3, 1.6]);
    return { l, n, p, q: Math.min(0.5, Math.abs(gauss(r)) * (0.04 + (1 - sk) * 0.16)) };
  }
  function gpBowl(S, pl) {
    const P = S.pm;
    P.plan = { l: clamp(pl.l | 0, 0, 4), n: clamp(pl.n | 0, 0, 3), p: clamp(pl.p | 0, 0, 2), q: clamp(+pl.q || 0, 0, 0.5) };
    P.stage = 'runup'; P.st = 0; S.stage = 'runup'; S.st = 0; S.swing = null; S.bricks = null;
    P.E.resetFielders(S);
    S.bowler.z = 20.5;
  }
  // the delivery from the bowler's plan: the release quality scatters the line and length (a bad one can go wide)
  function gpRelease(S) {
    const P = S.pm, g = S.g, r = g.rng, pl = P.plan;
    const q = pl.q, s = q <= 0.07 ? 0 : q <= 0.18 ? 0.35 : 1;
    let xc = GP_LINES[pl.l] + (r.next() * 2 - 1) * (0.03 + 0.3 * s);
    let zb = GP_LENS[pl.n].zb + (r.next() * 2 - 1) * (0.25 + 1.5 * s);
    let wide = false;
    if (s === 1 && r.next() < 0.3) { wide = true; xc = (xc < 0.02 ? -1 : 1) * (1.3 + r.next() * 0.2); }
    zb = clamp(zb, 0.32, 7.8);
    const li = zb < 1.8 ? 0 : zb < 3.6 ? 1 : zb < 5.8 ? 2 : 3;
    const fullToss = zb < 0.6;
    const pc = GP_PACE[pl.p];
    const T = pc.T * (1 + (r.next() - 0.5) * 0.06);
    const xr = 0.35 + (r.next() - 0.5) * 0.3;
    const lw = (fullToss ? 1.25 : GP_LENS[li].win) * pc.win;
    S.ball = { x: xr, y: 2.05, z: 13.6, rel: { x: xr, z: 13.6 }, xc, zb, T, tRel: S.clock, tArrive: S.clock + T, wide, slow: pl.p === 0, hit: false, bounces: 0, vx: 0, vy: 0, vz: 0, done: false,
      len: fullToss ? 'fulltoss' : GP_LENS[li].k, pace: pl.p, winP: S.winP * lw, winG: S.winG * lw, winE: S.winE * lw };
    S.stage = 'flight'; P.stage = 'flight'; P.st = 0;
    S.bowler.arm = 1;
    g.tone(520, 0.03, { type: 'triangle', vol: 0.03 });
    P.speed = { text: pc.name + ' · ' + Math.round(pc.kph * (T > 0 ? pc.T / T : 1)) + ' km/h', t: 0 };
    const batter = P.players[gpInn(S).bat];
    P.aiSwing = P.L.human(batter.uid) ? null : gpAiSwing(S, S.ball, batter);
  }
  function gpAiSwing(S, b, pl) {
    const r = S.g.rng, sk = pl ? pl.skill : 0.6;
    if (b.wide && r.next() < 0.85) return null; // leaves it
    let d = b.len === 'short' ? 'pull' : b.len === 'yorker' ? 'drive' : b.xc < -0.15 ? 'pull' : b.xc > 0.22 ? 'cut' : 'drive';
    if (r.next() < 0.24) d = ['pull', 'drive', 'cut'][(r.next() * 3) | 0];
    let e = gauss(r) * (0.055 + (1 - sk) * 0.1) - 0.01;
    if (S.pm.force === 'edge') { S.pm.force = null; e = (b.winG + b.winE) / 2; d = 'drive'; } // test hook: a skier for the fielder
    return { at: b.tArrive + e, d, done: false };
  }
  function gpFlight(S) {
    const P = S.pm, g = S.g, E = P.E, b = S.ball, bw = S.bowler;
    bw.arm = Math.max(0, bw.arm - LS_H * 2);
    const p = E.deliveryPos(b, S.clock);
    if (p.bounced && !b.bounced) { b.bounced = true; g.tone(180, 0.04, { type: 'sine', vol: 0.05 }); }
    b.x = p.x; b.y = p.y; b.z = p.z;
    E.trail(S, b);
    const A = P.aiSwing;
    if (A && !A.done && S.clock >= A.at) {
      A.done = true;
      gpSwing(S, A.d, S.clock - b.tArrive);
      if (S.stage === 'hit') { P.stage = 'hit'; P.st = 0; gpPredict(S); return; }
    }
    if (S.clock > b.tArrive + b.winE + 0.02) {
      if (b.wide && !S.swing) { E.outcome(g, S, 'wide', 1, 'WIDE! +1'); return; }
      if (Math.abs(b.xc) < 0.3) { S.bricks = { t: 0 }; g.sfx('chop', { vol: 0.8 }); E.outcome(g, S, 'out', 0, 'BOWLED!'); }
      else E.outcome(g, S, 'dot', 0, S.swing ? (b.missed === 'early' ? 'Too early!' : 'Too late!') : 'Dot ball', '#eaf2ff');
    }
  }
  // the shot (the gully engine's launch); the line, length and pace of the ball decide which shots are safe
  function gpSwing(S, d, e) {
    const b = S.ball;
    if (S.swing) return;
    S.swing = { t: 0, dir: d }; S.swings = (S.swings || 0) + 1;
    if (!b || b.hit || S.stage !== 'flight') return;
    const ae = Math.abs(e);
    if (ae > b.winE) { b.missed = e < 0 ? 'early' : 'late'; S.pm.lastSw = { d, e: +e.toFixed(3), q: b.missed }; return; }
    let q = ae <= b.winP ? 'perfect' : ae <= b.winG ? 'good' : 'edge';
    S.pm.lastSw = { d, e: +e.toFixed(3), q };
    const mis = (d === 'cut' && b.xc < -0.15) || (d === 'pull' && b.xc > 0.22) || (b.len === 'short' && d === 'drive') || (b.len === 'yorker' && d !== 'drive');
    if (mis) q = q === 'perfect' ? 'good' : 'edge';
    S.pm.E.launch(S.g, S, b, d, q, e);
  }
  // where (and when) the first catch chance comes: the same engine run ahead on a copy (no rng drawn before it)
  function gpPredict(S) {
    const P = S.pm, inn = gpInn(S), E = P.E, g = S.g;
    P.catchAt = null; P.catchF = -1; P.catchPress = null;
    if (!(inn.field >= 0)) return;
    const sim = { ball: Object.assign({}, S.ball), fielders: S.fielders.map((f) => Object.assign({}, f)), stage: 'hit', log: [], msg: null, trail: [], runs: 0, wktsLeft: 9, ballsLeft: 9, bowled: 0, fours: 0, sixes: 0, cam: S.cam, aunty: 0, trial: false, bowlerName: null, nextAt: 0, st: 0, score: 0, bricks: null };
    let hit = null, t = 0;
    sim.pmRoll = (f, bb) => { if ((bb.bounces === 0 && bb.t > 0.12) || (bb.bounces === 1 && bb.y > 0.15)) { if (!hit) hit = { f: sim.fielders.indexOf(f), t }; return 0; } return 0.5; };
    const nop = () => {};
    const G0 = { rng: { next: () => 0.5 }, diff: g.diff, W: g.W, H: g.H, area: g.area, sfx: nop, tone: nop, shake: nop, burst: nop, pop: nop, flash: nop };
    for (let i = 0; i < 360 && !hit && sim.stage === 'hit'; i++) { t += LS_H; E.flyBall(G0, sim, LS_H); E.moveFielders(sim, LS_H); }
    if (hit && hit.f >= 0) { P.catchAt = S.clock + hit.t; P.catchF = hit.f; }
  }
  // the engine's catch roll: with a friend fielding, their CATCH! press decides (in the last 0.55 s = safe hands)
  function gpRoll(S, f, b) {
    const P = S.pm, g = S.g, inn = gpInn(S);
    const r = g.rng.next();
    if (!P || !inn || !(inn.field >= 0) || !((b.bounces === 0 && b.t > 0.12) || (b.bounces === 1 && b.y > 0.15))) return r;
    if (!P.L.human(P.players[inn.field].uid)) return r;
    const dt = P.catchPress == null ? null : S.clock - P.catchPress;
    const p = dt == null ? 0.18 : dt <= 0.55 ? 0.94 : 0.45;
    P.catchRes = r < p ? 'caught' : 'dropped';
    return r < p ? 0 : 0.999;
  }
  function gpOutcome(S) {
    const P = S.pm, L = P.L;
    P.stage = 'result'; P.st = 0; P.nextAt = S.nextAt || 1.5;
    const ev = { t: 'ev', ep: P.ep, k: L.k, sym: String(S.log[S.log.length - 1]), text: S.msg ? String(S.msg.text).slice(0, 40) : '', sub: S.msg ? String(S.msg.sub || '').slice(0, 60) : '' };
    if (L.solo || L.cur === L.me) { L.emit(ev); gpBook(S, ev); return; }
    const a = L.evs.get(P.ep);
    if (a) gpBook(S, a); else { P.pending = true; P.myEv = ev; }
  }
  // the scorebook of the innings (the ball's owner decided it)
  function gpBook(S, a) {
    const P = S.pm, inn = gpInn(S);
    if (P.booked === P.ep) return;
    P.booked = P.ep;
    const sym = String(a.sym || '0');
    if (sym === 'wd') inn.runs += 1;
    else if (sym === 'W') { inn.wk++; inn.balls++; }
    else { const r = clamp(parseInt(sym, 10) || 0, 0, 6); inn.runs += r; inn.balls++; if (r === 4) inn.fours++; if (r === 6) inn.sixes++; }
    inn.log.push(sym === 'W' || sym === 'wd' ? sym : String(clamp(parseInt(sym, 10) || 0, 0, 6)));
    if (a.text && (!S.msg || S.msg.text !== a.text)) {
      const big = sym === 'W' || sym === '4' || sym === '6';
      S.msg = { text: String(a.text).slice(0, 40), sub: String(a.sub || '').slice(0, 60), col: sym === 'W' ? '#ff6a5a' : big ? '#ffd84a' : '#fff', t: 0, big };
    }
  }
  function gpReady(S, force) {
    const P = S.pm, L = P.L;
    if (L.solo || P.booked === P.ep) return true;
    const a = L.evs.get(P.ep);
    if (!a && P.pending && force && P.myEv) { P.pending = false; gpBook(S, P.myEv); return true; } // nobody decided it: ours stands
    if (!a) return !P.pending;
    if (P.pending) { P.pending = false; gpBook(S, a); return true; }
    if ((P.stage === 'flight' || P.stage === 'hit') && L.cur !== L.me && L.k >= (a.k | 0)) {
      // my picture has not got there by the owner's step: end the ball with the owner's result
      const sym = String(a.sym);
      if (S.ball) S.ball.done = true;
      P.E.outcome(S.g, S, sym === 'W' ? 'out' : sym === 'wd' ? 'wide' : 'runs', sym === 'wd' ? 1 : parseInt(sym, 10) || 0, String(a.text || ''));
      P.stage = 'result'; P.st = 0; P.nextAt = S.nextAt || 1.5;
      gpBook(S, a);
    }
    return true;
  }
  function gpNext(S) {
    const P = S.pm, g = S.g, inn = gpInn(S);
    S.ball = null; S.trail.length = 0;
    if (inn.balls >= P.B || inn.wk >= P.W || P.L.isGone(P.players[inn.bat].uid)) {
      inn.done = true;
      P.stage = 'break'; P.st = 0; S.stage = 'wait';
      const nx = gpPeekNext(S, P.ii + 1);
      const who = P.players[inn.bat].nick;
      P.banner = { title: who.toUpperCase() + ': ' + inn.runs + (inn.wk >= P.W ? '' : '*') + ' (' + inn.balls + ')', sub: nx >= 0 ? 'Next: ' + P.players[P.inns[nx].bat].nick + ' bats' + (P.inns[nx].bowl >= 0 ? ', ' + P.players[P.inns[nx].bowl].nick + ' bowls' : '') : 'That was the last innings!', t: 0 };
      g.sfx(inn.runs >= 12 ? 'crowd_cheer' : 'kids', { vol: 0.6 });
      return;
    }
    gpNewBall(S);
  }
  function gpPeekNext(S, from) { const P = S.pm; for (let i = from; i < P.n; i++) if (!P.L.isGone(P.players[P.inns[i].bat].uid)) return i; return -1; }
  function gpAfterBreak(S) {
    const P = S.pm;
    P.banner = null;
    const nx = gpNextInnings(S, P.ii + 1);
    if (nx >= 0) gpInnings(S, nx);
    else { P.stage = 'final'; P.st = 0; S.stage = 'wait'; S.g.sfx('crowd_cheer', { vol: 0.8 }); }
  }
  function gpStandings(S) {
    const P = S.pm;
    const rows = P.players.map((p, i) => {
      const inn = P.inns.find((x) => x.bat === i);
      const played = inn && !inn.skipped && inn.balls + inn.log.length > 0;
      const out = inn && inn.wk >= P.W;
      const note = played ? (out ? 'out' : 'not out') + ', ' + inn.balls + ' ball' + (inn.balls === 1 ? '' : 's') + (inn.sixes ? ' · ' + inn.sixes + '×6' : '') + (inn.fours ? ' · ' + inn.fours + '×4' : '') : 'did not bat';
      return { uid: p.uid, nick: p.nick, col: p.col, runs: inn ? inn.runs : 0, balls: inn ? inn.balls : 0, wk: inn ? inn.wk : 0, played, res: { score: inn ? inn.runs : 0, runs: inn ? inn.runs : 0, balls: inn ? inn.balls : 0, wk: inn ? inn.wk : 0, note, dnf: !played } };
    });
    rows.sort((a, b) => (b.played - a.played) || (b.runs - a.runs) || (a.wk - b.wk) || (a.balls - b.balls));
    return rows;
  }
  function gpFinish(S) {
    const P = S.pm, ctx = P.ctx;
    P.reported = true;
    const rows = gpStandings(S);
    P.final = rows;
    const mine = rows.find((r) => r.uid === P.L.me);
    try { if (mine && !P.L.isGone(P.L.me)) ctx.report(mine.res); } catch (e) { N.err('cricket.gully.report', e); }
    try { if (ctx.ai && ctx.ai.report && (ctx.mode !== 'party' || ctx.isHost)) for (const r of rows) if (/^ai:/.test(r.uid)) ctx.ai.report(r.uid, r.res); } catch (e) { N.err('cricket.gully.aiReport', e); }
    P.closeAt = S.clock + 4.5;
  }
  GP.update = function (g, dt) {
    const S = g.S, P = S.pm;
    P.frameDt += dt;
    if (P.frame === g.rt) return;
    P.frame = g.rt;
    const fdt = P.frameDt; P.frameDt = 0;
    const L = P.L;
    if (!P.started) {
      let el = 0;
      try { el = P.ctx.elapsed(); } catch (e) { el = 0; }
      if (isFinite(el) && el < 0) { P.wait = -el / 1000; P.vis += fdt; gpPad(g, S); return; }
      P.started = true; P.wait = 0; L.lastReal = performance.now(); L.acc = 0; P.lastNow = performance.now();
    }
    const now = performance.now();
    const real = L.solo ? fdt : Math.min(0.5, (now - (P.lastNow || now)) / 1000);
    P.lastNow = now;
    try { gpInput(S, g); } catch (e) { N.err('cricket.gully.input', e); }
    L.tick(real);
    P.vis += fdt;
    gpPad(g, S);
    if (P.reported && !L.over) L.finish();
    if (P.reported && S.clock >= P.closeAt && !P.closed && !g.closed) {
      P.closed = true;
      L.stop(false);
      const top = P.final && P.final[0];
      const mine = (P.final || []).find((r) => r.uid === L.me);
      try { g.close(Object.assign(g.baseResult(), { win: !!(top && top.uid === L.me), party: true, runs: mine ? mine.runs : 0, score: mine ? mine.runs * 10 : 0 })); } catch (e) { N.err('cricket.gully.close', e); }
    }
  };
  GP.idle = function (g, dt) { const S = g.S; if (S && S.pm) S.pm.vis += dt; };
  function gpPad(g, S) {
    const r = gpRole(S), key = r + (r === 'bowl' ? ':' + S.pm.aim.p : r === 'watch' ? ':' + gpWatchLine(S) : '');
    if (key === S.pm.padKey) return;
    S.pm.padKey = key;
    try { g.buildPad(); if (g.touch) { g.releaseAll(); g.resize(); } } catch (e) { N.err('cricket.gully.pad', e); }
  }
  function gpInput(S, g) {
    const P = S.pm, L = P.L, role = gpRole(S);
    if (L.ownerNow() !== L.me) return;
    const since = (a) => { const t = P.pressT[a]; return t ? clamp(((t - L.lastReal) / 1000) * (L.solo ? 1 : L.speed), 0, 0.25) : 0; };
    if (role === 'bowl' && P.stage === 'aim') {
      const A = P.aim;
      if (g.pressed('pull')) A.l = Math.max(0, A.l - 1);
      if (g.pressed('cut')) A.l = Math.min(4, A.l + 1);
      if (g.pressed('drive')) A.n = Math.min(3, A.n + 1);
      if (g.pressed('back')) A.n = Math.max(0, A.n - 1);
      if (g.pressed('pace')) { A.p = (A.p + 1) % 3; g.sfx('ui_click'); }
      if (g.pressed('go') && P.st > 0.3) { const m = gpMeter(S.clock + since('go'), A.p); L.input({ t: 'bowl', l: A.l, n: A.n, p: A.p, q: +Math.abs(m - 0.5).toFixed(4) }); }
    } else if (role === 'bat' && (P.stage === 'runup' || P.stage === 'flight')) {
      for (const a of ['pull', 'drive', 'cut', 'go']) if (g.pressed(a)) { const b = S.ball; L.input({ t: 'sw', d: a === 'go' ? 'drive' : a, e: b && P.stage === 'flight' ? +((S.clock + since(a)) - b.tArrive).toFixed(4) : -1 }); break; }
    } else if (role === 'field' && P.stage === 'hit') {
      if (g.pressed('go') && P.catchAt != null && P.catchPress == null) L.input({ t: 'ct', at: +(S.clock + since('go')).toFixed(4) });
    }
  }
  function gpApply(S, q) {
    const P = S.pm, inn = gpInn(S);
    if (!q || !inn) return;
    if (q.t === 'bowl') { const bp = gpBowlerOf(S); if (P.stage === 'aim' && bp && P.L.human(bp.uid)) gpBowl(S, q); return; }
    if (q.t === 'sw') {
      if (!P.L.human(P.players[inn.bat].uid) || ['pull', 'drive', 'cut'].indexOf(q.d) < 0) return;
      if (P.stage === 'runup') { if (!S.swing) S.swing = { t: 0, dir: q.d }; return; }
      if (P.stage !== 'flight') return;
      gpSwing(S, q.d, clamp(+q.e || 0, -2, 2));
      if (S.stage === 'hit') { P.stage = 'hit'; P.st = 0; gpPredict(S); }
      return;
    }
    if (q.t === 'ct') { if (P.stage === 'hit' && P.catchPress == null && inn.field >= 0 && P.L.human(P.players[inn.field].uid)) P.catchPress = isFinite(+q.at) ? +q.at : S.clock; }
  }
  // the test autopilot (params.autoplay): plays THIS page's part inside the shared steps
  function gpBot(S) {
    const P = S.pm, g = S.g, L = P.L;
    if (!g.auto) return;
    const lose = g.auto === 'lose', role = gpRole(S), r = P.brng;
    if (role === 'bowl' && P.stage === 'aim' && P.st > 0.8) {
      const m = gpMeter(S.clock + LS_H, P.aim.p);
      if (lose || Math.abs(m - 0.5) < 0.05) L.input({ t: 'bowl', l: (r.next() * 5) | 0, n: (r.next() * 4) | 0, p: (r.next() * 3) | 0, q: lose ? 0.45 : +Math.abs(m - 0.5).toFixed(4) });
    } else if (role === 'bat' && P.stage === 'flight' && S.ball && !S.swing) {
      const b = S.ball, t = S.clock + LS_H;
      if (lose) { if (t - b.tRel > b.T * 0.4) L.input({ t: 'sw', d: 'drive', e: +(t - b.tArrive).toFixed(4) }); return; }
      if (b.wide) return;
      if (t >= b.tArrive - 0.004) {
        const d = b.len === 'short' ? 'pull' : b.len === 'yorker' ? 'drive' : b.xc < -0.15 ? 'pull' : b.xc > 0.22 ? 'cut' : (P.ball % 2 ? 'cut' : 'drive');
        L.input({ t: 'sw', d, e: +(t - b.tArrive).toFixed(4) });
      }
    } else if (role === 'field' && P.stage === 'hit' && P.catchAt != null && P.catchPress == null && !lose && P.catchAt - S.clock < 0.3) L.input({ t: 'ct', at: +(S.clock + LS_H).toFixed(4) });
  }
  GP.buttons = function (g) {
    const S = g.S, r = gpRole(S), P = S.pm;
    if (r === 'bat') return [{ a: 'pull', label: '◀ PULL', sub: 'LEFT' }, { a: 'drive', label: '▲ DRIVE', sub: 'STRAIGHT', cls: 'big' }, { a: 'cut', label: 'CUT ▶', sub: 'RIGHT' }];
    if (r === 'bowl') return [
      { a: 'pull', label: '◀', sub: 'LINE', cls: 'cg-chip' }, { a: 'cut', label: '▶', sub: 'LINE', cls: 'cg-chip' },
      { a: 'back', label: '▼', sub: 'FULLER', cls: 'cg-chip' }, { a: 'drive', label: '▲', sub: 'SHORTER', cls: 'cg-chip' },
      { a: 'pace', label: 'PACE', sub: GP_PACE[P.aim.p].name, cls: 'cg-chip teal' }, { a: 'go', label: 'BOWL', sub: 'IN THE GREEN', cls: 'big cg-wide' },
    ];
    if (r === 'field') return [{ a: 'go', label: 'CATCH!', sub: 'AS THE RING CLOSES', cls: 'big cg-wide' }];
    return [];
  };
  GP.keyHint = function (g) {
    const S = g.S, r = gpRole(S);
    if (r === 'bat') return 'swing as the ball reaches you: <kbd>←</kbd> pull · <kbd>↑</kbd>/<kbd>Space</kbd> drive · <kbd>→</kbd> cut';
    if (r === 'bowl') return '<kbd>←</kbd><kbd>→</kbd> line · <kbd>↑</kbd><kbd>↓</kbd> length · <kbd>Q</kbd> pace · <kbd>Space</kbd> bowl when the needle is in the green';
    if (r === 'field') return '<kbd>Space</kbd> CATCH! as the ring closes on the fielder';
    return esc(gpWatchLine(S));
  };
  function gpWatchLine(S) {
    const P = S.pm, inn = gpInn(S);
    if (!inn || P.stage === 'intro') return 'Gully cricket with friends: get ready';
    if (P.stage === 'final') return 'Final scores';
    const b = P.players[inn.bat], w = inn.bowl >= 0 ? P.players[inn.bowl] : null;
    return 'Watching: ' + b.nick + ' bats' + (w ? ' · ' + w.nick + ' bowls' : '') + ' · you bat in your own innings';
  }
  GP.hud = function (g) {
    const S = g.S, P = S.pm, inn = gpInn(S), r = gpRole(S);
    if (P.stage === 'final') return [{ k: '', v: 'FINAL SCORES' }];
    const it = [{ k: 'YOU', v: r === 'watch' ? 'WATCH' : r.toUpperCase(), good: r !== 'watch' }];
    if (inn && P.stage !== 'intro') it.push({ k: P.players[inn.bat].nick.slice(0, 8).toUpperCase(), v: inn.runs + '(' + inn.balls + ')' }, { k: 'BALLS', v: String(Math.max(0, P.B - inn.balls)), warn: P.B - inn.balls <= 2 });
    return it;
  };
  GP.cleanup = function (g) {
    const S = g.S, P = S && S.pm;
    if (!P) return;
    if (!P.reported) {
      P.L.stop(true);
      try { if (P.ctx && P.ctx.report && P.ctx.phase !== 'done') P.ctx.report({ dnf: true, score: (gpInn(S) && P.players[gpInn(S).bat].uid === P.L.me ? gpInn(S).runs : 0), note: 'left the lane' }); } catch (e) { /* ignore */ }
    } else P.L.stop(false);
  };
  // drawn over the gully picture: the chalk scoreboard, this page's role, the bowler's aim + needle, the catch ring
  GP.draw = function (g, ctx) {
    const S = g.S, P = S.pm, H = N.minigames.helpers, A = g.area, W = g.W, E = P.E, L = P.L;
    const inn = gpInn(S), role = gpRole(S);
    const k = clamp(Math.min(W, A.h) / 560, 0.66, 1.2);
    const T = (s, x, y, o) => H.text(ctx, s, x, y, o);
    // the scoreboard (chalk on a green board), top left
    {
      const bw = Math.min(W * 0.56, 236 * k), lh = 21 * k, bh = 26 * k + P.n * lh, bx = 8, by = A.y + 30 * k;
      ctx.fillStyle = 'rgba(28,58,40,0.9)'; H.rr(ctx, bx, by, bw, bh, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(214,190,150,0.85)'; ctx.lineWidth = 3; H.rr(ctx, bx, by, bw, bh, 8); ctx.stroke();
      T('SCORES · ' + P.B + ' BALLS · ' + P.W + ' OUT', bx + bw / 2, by + 12 * k, { font: 'osd', size: 12.5 * k, color: '#e8f0d8', maxW: bw - 10 });
      P.players.forEach((p, i) => {
        const x = P.inns.find((q) => q.bat === i), y = by + 26 * k + i * lh + lh / 2, now = inn && inn.bat === i && P.stage !== 'final' && P.stage !== 'intro' && !(P.stage === 'break' && inn.done);
        ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(bx + 12 * k, y, 5 * k, 0, TAU); ctx.fill();
        T((now ? '▶ ' : '') + p.nick + (p.uid === L.me ? ' (you)' : ''), bx + 22 * k, y, { font: 'body', weight: 700, size: 14 * k, color: now ? '#fff6c8' : '#e8f0d8', align: 'left', maxW: bw * 0.6 });
        const v = !x || x.skipped ? (x && x.skipped ? 'left' : '—') : x.balls || x.log.length || x.done || now ? x.runs + (x.wk >= P.W ? '' : '*') + ' (' + x.balls + ')' : '—';
        T(v, bx + bw - 8, y, { font: 'osd', size: 15 * k, color: now ? '#ffd84a' : '#e8f0d8', align: 'right' });
      });
    }
    // what is going on (top centre, under the HUD): innings, ball, who bowls
    if (inn && P.started && P.stage !== 'final' && P.stage !== 'intro') {
      const bwl = gpBowlerOf(S);
      const s = 'BALL ' + Math.min(P.B, inn.balls + 1) + '/' + P.B + ' · OUT ' + inn.wk + '/' + P.W + (bwl ? ' · ' + bwl.nick.toUpperCase() + ' BOWLS' : '');
      T(s, W - 10, A.y + 16 * k, { font: 'osd', size: 15 * k, color: '#eaf2ff', outline: 3, stroke: '#1b2a78', align: 'right', maxW: W * 0.44 });
      if (inn.log.length) inn.log.slice(-6).forEach((t, i, arr) => T(t, W - 12 - (arr.length - 1 - i) * 24 * k, A.y + 38 * k, { font: 'osd', size: 17 * k, color: t === 'W' ? '#ff8a7a' : t === '4' || t === '6' ? '#ffd84a' : '#fff', outline: 3, align: 'right' }));
    }
    // this page's role (bottom left)
    if (P.started && P.stage !== 'final') {
      const s = role === 'bat' ? 'YOU BAT' : role === 'bowl' ? 'YOU BOWL' : role === 'field' ? 'YOU FIELD' : 'WATCHING';
      const col = role === 'bat' ? '#f2c230' : role === 'bowl' ? '#7fd8ff' : role === 'field' ? '#b9ffb0' : 'rgba(20,20,30,0.7)';
      ctx.font = H.font('osd', 16 * k);
      const w = ctx.measureText(s).width + 22 * k, h = 26 * k, x = 8, y = A.y + A.h - h - 8;
      ctx.fillStyle = col; H.rr(ctx, x, y, w, h, h / 2); ctx.fill();
      T(s, x + w / 2, y + h / 2 + 1, { font: 'osd', size: 16 * k, color: role === 'watch' ? '#eaf2ff' : '#14246a' });
    }
    // the bowler's aim: the chalk mark where it will pitch, the line / length / pace, the swinging needle
    if (P.stage === 'aim' && role === 'bowl') {
      const a = P.aim, zb = GP_LENS[a.n].zb, kb = (13.6 - zb) / (13.6 - 0.25), x = lerp(0.35, GP_LINES[a.l], kb);
      const p = E.proj(S, x, 0, zb), q = E.proj(S, GP_LINES[a.l], 0, 0.25);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, p.k * 0.05); ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.k * 0.42, p.k * 0.12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.stroke();
      { const hb = Math.max(18, p.k * 0.9), bob = Math.sin(P.vis * 6) * 3; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - hb); ctx.stroke(); ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(p.x, p.y - hb + 2 + bob); ctx.lineTo(p.x - 8, p.y - hb - 10 + bob); ctx.lineTo(p.x + 8, p.y - hb - 10 + bob); ctx.closePath(); ctx.fill(); }
      const mw = Math.min(W - 40, 380 * k), mh = 18 * k, mx = (W - mw) / 2, my = A.y + Math.max(A.h * 0.2, 96 * k);
      T(GP_LENS[a.n].name + ' · ' + ['WIDE LEFT', 'LEFT', 'STUMPS', 'RIGHT', 'WIDE RIGHT'][a.l] + ' · ' + GP_PACE[a.p].name, W / 2, my - 30 * k, { font: 'display', size: 22 * k, color: '#ffd84a', outline: 5, maxW: W - 20 });
      ctx.fillStyle = 'rgba(10,12,30,0.78)'; H.rr(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8); ctx.fill();
      ctx.fillStyle = '#7a2a2a'; ctx.fillRect(mx, my, mw, mh);
      ctx.fillStyle = '#c8a030'; ctx.fillRect(mx + mw * (0.5 - 0.18), my, mw * 0.36, mh);
      ctx.fillStyle = '#2a9a4a'; ctx.fillRect(mx + mw * (0.5 - 0.07), my, mw * 0.14, mh);
      const m = gpMeter(S.clock, a.p);
      ctx.fillStyle = '#fff'; ctx.fillRect(mx + m * mw - 2, my - 6, 4, mh + 12);
      T(g.touch ? 'BOWL when the needle is in the green' : 'SPACE when the needle is in the green', W / 2, my + mh + 18 * k, { font: 'osd', size: 15 * k, color: '#eaf2ff', outline: 3, maxW: W - 20 });
    } else if (P.stage === 'aim' && inn && P.started) {
      const bwl = gpBowlerOf(S);
      if (bwl && L.human(bwl.uid)) T(bwl.nick + ' is picking a ball…', W / 2, A.y + A.h * 0.62, { font: 'osd', size: 18 * k, color: '#eaf2ff', outline: 4, maxW: W - 20 });
    }
    // the catch ring on the fielder the ball is flying to
    if (P.stage === 'hit' && P.catchAt != null && S.fielders[P.catchF]) {
      const f = S.fielders[P.catchF], left = P.catchAt - S.clock, p = E.proj(S, f.x, 0.9, f.z);
      if (left > -0.1) {
        const good = left <= 0.55 && left >= 0, rr0 = p.k * (0.32 + Math.max(0, left) * 0.9);
        ctx.strokeStyle = P.catchPress != null ? '#ffffff' : good ? '#b9ffb0' : '#ffd84a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr0, 0, TAU); ctx.stroke();
        const who = P.players[inn.field];
        T(role === 'field' ? (P.catchPress != null ? 'Got it?' : (g.touch ? 'CATCH!' : 'SPACE — CATCH!')) : who.nick + ' to catch!', p.x, p.y - rr0 - 14 * k, { font: 'display', size: (role === 'field' ? 26 : 18) * k, color: good ? '#b9ffb0' : '#ffd84a', outline: 5 });
      }
    }
    if (P.speed && P.speed.t < 1.6 && (P.stage === 'flight' || P.stage === 'hit')) T(P.speed.text, W / 2, A.y + 64 * k, { font: 'osd', size: 16 * k, color: '#fff', outline: 3 });
    if (role === 'field' && (P.stage === 'aim' || P.stage === 'runup' || P.stage === 'flight')) T('You field: CATCH! when the ring closes', W / 2, A.y + A.h - 40 * k, { font: 'osd', size: 16 * k, color: '#b9ffb0', outline: 3, maxW: W - 20 });
    // banners: get ready / who bats / innings over / the final table
    const banner = (title, sub, col) => {
      const w = Math.min(W - 24, 460 * k), h = (sub ? 78 : 54) * k, x = (W - w) / 2, y = A.y + A.h * 0.34;
      H.sign(ctx, x, y, w, h, { fill: col || '#2a8c82', bolts: true });
      T(title, W / 2, y + 26 * k, { font: 'display', size: 28 * k, color: '#fff6c8', outline: 4, maxW: w - 20 });
      if (sub) T(sub, W / 2, y + 58 * k, { font: 'body', weight: 700, size: 16 * k, color: '#ffffff', outline: 3, maxW: w - 20 });
    };
    if (!P.started) banner('GULLY CRICKET · WITH FRIENDS', P.wait > 0 ? 'Starting in ' + Math.ceil(P.wait) + '…' : 'GO!');
    else if (P.stage === 'intro') banner('GULLY CRICKET · WITH FRIENDS', P.B + ' balls each · ' + P.W + ' outs · one-tip-one-hand · Aunty\'s house = OUT');
    else if (P.banner && (P.stage === 'break' || (P.banner.intro && P.banner.t < 2.6))) banner(P.banner.title, P.banner.sub, P.stage === 'break' ? '#7a3db8' : '#2a8c82');
    if (P.stage === 'final') {
      const rows = P.final || gpStandings(S), w = Math.min(W - 24, 420 * k), lh = 30 * k, h = 70 * k + rows.length * lh, x = (W - w) / 2, y = A.y + Math.max(10, (A.h - h) * 0.4);
      H.sign(ctx, x, y, w, h, { fill: '#1d4f91', bolts: true });
      const top = rows[0];
      T(top && top.played ? (top.uid === L.me ? 'YOU WIN!' : top.nick.toUpperCase() + ' WINS!') : 'FINAL SCORES', W / 2, y + 30 * k, { font: 'display', size: 30 * k, color: '#ffd84a', outline: 4, maxW: w - 20 });
      rows.forEach((r0, i) => {
        const yy = y + 66 * k + i * lh;
        ctx.fillStyle = r0.col; ctx.beginPath(); ctx.arc(x + 22 * k, yy, 6 * k, 0, TAU); ctx.fill();
        T((i + 1) + '. ' + r0.nick + (r0.uid === L.me ? ' (you)' : ''), x + 36 * k, yy, { font: 'body', weight: 700, size: 18 * k, color: '#fff', align: 'left', maxW: w * 0.55 });
        T(r0.played ? r0.runs + (r0.wk >= P.W ? '' : '*') + ' (' + r0.balls + ')' : 'did not bat', x + w - 16 * k, yy, { font: 'osd', size: 19 * k, color: '#fff6c8', align: 'right', maxW: w * 0.42 });
      });
    }
    if (L.waitFor && P.started) {
      const s = L.waitFor === 'ev' ? 'Waiting for the result…' : 'Waiting for ' + nickOf(S, L.waitFor) + '…';
      ctx.font = H.font('osd', 17 * k);
      const w = ctx.measureText(s).width + 26, h = 30 * k, x = (W - w) / 2, y = A.y + A.h * 0.25;
      ctx.fillStyle = 'rgba(10,12,30,0.85)'; H.rr(ctx, x, y, w, h, h / 2); ctx.fill();
      T(s, W / 2, y + h / 2 + 1, { font: 'osd', size: 17 * k, color: '#ffd84a' });
    }
  };
  function gpCss() {
    if (document.getElementById('cg-party-css')) return;
    const s = document.createElement('style');
    s.id = 'cg-party-css';
    s.textContent = [
      '.mg-screen[data-mg="cricket"].cg-party .mg-pad { flex-wrap: wrap; row-gap: 8px; column-gap: 8px; }',
      '.mg-screen[data-mg="cricket"].cg-party .mg-btn.cg-chip { flex: 1 1 15%; max-width: none; height: 54px; font-size: 24px; }',
      '.mg-screen[data-mg="cricket"].cg-party .mg-btn.cg-chip small { font-size: 12px; }',
      '.mg-screen[data-mg="cricket"].cg-party .mg-btn.cg-wide { flex: 1 1 100%; max-width: none; height: 62px; }',
    ].join('\n');
    document.head.appendChild(s);
  }
  function gpInstall() {
    const MG = N.minigames, D = MG && MG.defs && MG.defs.cricket;
    if (!D || !D.eng) return false;
    if (D.__party) return true;
    D.__party = true;
    const B = { setup: D.setup, update: D.update, idle: D.idle, draw: D.draw, buttons: D.buttons, keyHint: D.keyHint, hud: D.hud, bot: D.bot, cleanup: D.cleanup };
    const on = (g) => !!(g && g.S && g.S.pm);
    D.setup = function (g) { B.setup.call(this, g); if (g.params && g.params.party && g.params.party.players) { try { GP.setup(g); } catch (e) { N.err('cricket.gully.party', e); g.S.pm = null; } } };
    D.update = function (g, dt) { return on(g) ? GP.update(g, dt) : B.update.call(this, g, dt); };
    D.idle = function (g, dt) { return on(g) ? GP.idle(g, dt) : B.idle && B.idle.call(this, g, dt); };
    D.draw = function (g, ctx) { B.draw.call(this, g, ctx); if (on(g)) { try { GP.draw(g, ctx); } catch (e) { N.err('cricket.gully.draw', e); } } };
    D.buttons = function (g) { return on(g) ? GP.buttons(g) : B.buttons.call(this, g); };
    D.keyHint = function (g) { return on(g) ? GP.keyHint(g) : B.keyHint.call(this, g); };
    D.hud = function (g) { return on(g) ? GP.hud(g) : B.hud.call(this, g); };
    D.bot = function (g, dt, want) { return on(g) ? undefined : B.bot.call(this, g, dt, want); };
    D.cleanup = function (g) { if (on(g)) GP.cleanup(g); if (B.cleanup) B.cleanup.call(this, g); };
    return true;
  }
  CM.gully = { install: gpInstall,
    /** test hook (this page only): 'edge' = the next AI swing is an edge (a skier: a catch chance for the fielder) */
    force(kind) { const g = N.minigames && N.minigames.game; const S = g && g.id === 'cricket' && g.S; if (!S || !S.pm) return false; S.pm.force = kind; return true; },
    debug() { const g = N.minigames && N.minigames.game; const S = g && g.id === 'cricket' && g.S; if (!S || !S.pm) return null; const P = S.pm; return { clock: S.clock, tArrive: S.ball ? S.ball.tArrive : null, ballHit: !!(S.ball && S.ball.hit), meter: gpMeter(S.clock, P.aim.p), swings: S.swings || 0, lastSw: P.lastSw || null, msg: S.msg ? S.msg.text : null, wait: P.L.waitFor, stage: P.stage, ii: P.ii, ep: P.ep, ball: P.ball, role: gpRole(S), owner: gpOwner(S), lock: P.L.info(), inns: P.inns.map((x) => ({ bat: P.players[x.bat].nick, bowl: x.bowl >= 0 ? P.players[x.bowl].nick : null, field: x.field >= 0 ? P.players[x.field].nick : null, runs: x.runs, balls: x.balls, wk: x.wk, log: x.log.slice(), done: x.done, skipped: x.skipped })), plan: P.plan, aim: Object.assign({}, P.aim), catchAt: P.catchAt, catchPress: P.catchPress, final: P.final, reported: P.reported, started: P.started }; } };
  CM.lockstep = lockstep;
  gpInstall();
  N.on('boot', gpInstall);

  /* ================================================================ party: registrations (src/party.js) */
  // gully cricket at every colony ground / playground (a spot beside the centre, so the ground's own "Join gully
  // cricket" stays where it is), the LB Stadium match at the west gate (beside the exhibition match's spot).
  function gullySpots() {
    const out = [], seen = new Set(), PL = N.places || {};
    const ids = Object.keys(PL).filter((id) => /^playground_(?!kit)|^victory_playground$/.test(id));
    ids.sort((a, b) => (a === 'playground_home' ? -1 : b === 'playground_home' ? 1 : a < b ? -1 : 1));
    for (const id of ids) {
      const p = PL[id];
      if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
      const key = Math.round(p.x) + ',' + Math.round(p.y);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x: p.x, y: p.y + Math.max(20, (p.r || 30) * 0.8), r: 20, name: p.name || 'the ground' });
    }
    return out;
  }
  function openParty(id, params, ctx) {
    let open = true;
    setTimeout(() => {
      if (!open || !N.minigames || !N.minigames.play) return;
      N.minigames.play(id, params).then(() => { open = false; });
    }, 0);
    return {
      update() {},
      end(reason) {
        if (open && reason !== 'done' && N.minigames && N.minigames.active === id) N.minigames.abort('party:' + (reason || 'end'));
        open = false;
        void ctx;
      },
    };
  }
  const rankBy = (vs) => (rows) => rows.slice().sort((a, b) => {
    const out = (r) => (r.dnf || r.left || !r.reported ? 1 : 0);
    if (out(a) !== out(b)) return out(a) - out(b);
    if (vs && (b.win | 0) !== (a.win | 0)) return (b.win | 0) - (a.win | 0);
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((a.wk || 0) !== (b.wk || 0)) return vs ? (b.wk || 0) - (a.wk || 0) : (a.wk || 0) - (b.wk || 0);
    return (a.balls || 0) - (b.balls || 0);
  });
  const GULLY_SPEC = {
    name: 'Gully cricket', icon: '🏏', where: 'playground_home', r: 1, kind: 'score', players: { min: 1, max: 3 }, solo: true,
    ai: ['ayesha', 'immu'], label: 'Start gully cricket with friends', timeLimit: 900,
    token: { id: 'party_gully_cricket', name: 'Taped tennis ball', desc: 'Top scorer at gully cricket with friends' },
    describe() { return 'Bat, bowl and field in turns: 6 balls and 2 outs each. One-tip-one-hand and Aunty\'s house are OUT. Most runs wins.'; },
    rank: rankBy(false),
    start(ctx) {
      const o = (ctx && ctx.opts) || {};
      return openParty('cricket', { party: ctx, seed: ctx.seed, skipHowto: true, noRetry: true, difficulty: o.difficulty != null ? o.difficulty : 0.4, title: 'Gully Cricket · with friends', autoplay: o.autoplay, place: 'playground_home' }, ctx);
    },
  };
  const MATCH_SPEC = {
    name: 'LB Stadium match', icon: '🏟️', where: 'lb_stadium', r: 1, kind: 'score', players: { min: 1, max: 3 }, solo: true,
    ai: ['ayesha'], label: 'Start an LB Stadium match with friends', timeLimit: 1800,
    token: { id: 'party_lb_match', name: 'LB Stadium ticket stub', desc: 'Star of an LB Stadium match with friends' },
    describe() { return 'Your gang as Colony XI against an AI XI under the floodlights. Each friend bats their own over (till out) and bowls theirs. TV broadcast, replays and all.'; },
    rank: rankBy(false),
    start(ctx) {
      const o = (ctx && ctx.opts) || {};
      return openParty('match', { party: ctx, pmode: 'coop', seed: ctx.seed, skipHowto: true, noRetry: true, difficulty: o.difficulty != null ? o.difficulty : 0.4, title: 'LB Stadium · with friends', autoplay: o.autoplay }, ctx);
    },
  };
  const VS_SPEC = {
    name: 'LB Stadium: friends vs friends', icon: '🏏', where: 'lb_stadium', r: 1, kind: 'score', players: { min: 2, max: 3 }, solo: false,
    label: 'Start friends vs friends at LB Stadium', timeLimit: 1500,
    token: { id: 'party_lb_vs', name: 'Floodlight match scorecard', desc: 'Won a friends-vs-friends match at LB Stadium' },
    describe() { return 'A quick 2-over match: you and your friends on rival XIs. Bat your own overs, bowl at each other.'; },
    rank: rankBy(true),
    start(ctx) {
      const o = (ctx && ctx.opts) || {};
      return openParty('match', { party: ctx, pmode: 'vs', seed: ctx.seed, skipHowto: true, noRetry: true, difficulty: o.difficulty != null ? o.difficulty : 0.4, title: 'LB Stadium · friends vs friends', autoplay: o.autoplay }, ctx);
    },
  };
  let partyRef = null, partyN = 0, partyT = 0;
  function registerParty(force) {
    const P0 = N.party;
    if (!P0 || typeof P0.register !== 'function') return false;
    if (partyRef === P0 && !force && P0.get && P0.get('gully_cricket')) return true;
    if (!N.places || !N.places.lb_stadium) return false; // the map is not built yet
    try {
      const gs = gullySpots();
      const lb = N.places.lb_stadium;
      P0.register('gully_cricket', Object.assign({}, GULLY_SPEC, { spots: gs }));
      P0.register('lb_match', Object.assign({}, MATCH_SPEC, { spots: [{ x: lb.x, y: lb.y - 36, r: 22, name: 'LB Stadium (west gate)' }] }));
      P0.register('lb_match_vs', Object.assign({}, VS_SPEC, { spots: [{ x: lb.x, y: lb.y + 36, r: 22, name: 'LB Stadium (west gate)' }] }));
      partyRef = P0;
      return true;
    } catch (e) { N.err('cricket.party.register', e); return false; }
  }
  CM.registerParty = registerParty;
  N.on('boot', () => { registerParty(true); });
  N.on('world:built', () => { registerParty(true); });
  N.addSystem({
    id: 'cricketParty', order: 89, runIn: ['*'],
    update(dt) {
      // party.js may load after this file (or be replaced): keep checking for a while, then now and then
      partyT -= dt;
      if (partyT <= 0) { partyT = partyN++ < 60 ? 1 : 10; registerParty(false); gpInstall(); }
    },
  });

  /* ================================================================ match-day dressing of the 2D world */
  // When N.flags.lb_match is set (the story's match day), LB Stadium in the top-down world gets crowds on
  // its stands, the floodlights switched on, parked scooters and cycles outside and a crowd at the gates.
  // All positions are computed once; each frame only enqueues a handful of draw closures (cheap).
  const DRESS = { on: true, built: false, lm: null, crowd: null, cols: null, towers: [], parked: [], peds: [] };
  CM.dressing = DRESS;
  const DCOLS = ['#e8402a', '#f2c230', '#2a5cb8', '#f4efe2', '#2a8c82', '#e07a2e', '#d24d57', '#7a3db8'];
  function buildDress() {
    const D = N.WORLD_DATA;
    if (!D || !N.world || !N.world.built) return false;
    const lm = (D.landmarks || []).find((l) => l.id === 'lb_stadium');
    if (!lm) return false;
    const r = U.rng('cm_dress');
    const fp = (D.parks || []).find((p) => p.id === 'lb_stadium_field');
    let f = [lm.x - 67, lm.y - 78, 134, 156];
    if (fp) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [px, py] of fp.poly) { a = Math.min(a, px); b = Math.min(b, py); c = Math.max(c, px); d = Math.max(d, py); } f = [a, b, c - a, d - b]; }
    const byCol = DCOLS.map(() => []);
    for (const s of lm.solids || []) {
      const [x, y, w, d] = s, cx = x + w / 2, cy = y + d / 2;
      let dir;
      if (cy < f[1]) dir = 'N'; else if (cy > f[1] + f[3]) dir = 'S'; else if (cx < f[0]) dir = 'W'; else dir = 'E';
      for (let i = 0; i < 3; i++) {
        const t0 = i / 3, t1 = (i + 1) / 3, h = 6 + i * 6;
        let rr2;
        if (dir === 'N') rr2 = [x, y + d * (1 - t1), w, d / 3]; else if (dir === 'S') rr2 = [x, y + d * t0, w, d / 3];
        else if (dir === 'W') rr2 = [x + w * (1 - t1), y, w / 3, d]; else rr2 = [x + w * t0, y, w / 3, d];
        const n = Math.floor((rr2[2] * rr2[3]) / 9);
        for (let k = 0; k < n; k++) {
          if (r.next() > 0.82) continue;
          const px = rr2[0] + 1 + r.next() * (rr2[2] - 2), py = rr2[1] + 1 + r.next() * (rr2[3] - 2);
          byCol[(r.next() * DCOLS.length) | 0].push(px, py, h + 0.8, r.next() * 6.28);
        }
      }
    }
    DRESS.cols = byCol;
    const x0 = lm.x - lm.w / 2, y0 = lm.y - lm.d / 2;
    DRESS.towers = [[x0 + 8, y0 + 8], [x0 + lm.w - 8, y0 + 8], [x0 + 8, y0 + lm.d - 8], [x0 + lm.w - 8, y0 + lm.d - 8]];
    // parked two-wheelers outside the west wall and the south stand (never in the gates)
    const parked = [];
    const free = (px, py) => { try { return N.world.isWalkable(px, py) && N.world.surfaceAt(px, py) !== N.SURF.WATER; } catch (e) { return false; } };
    const kinds = ['chetak', 'chetak', 'luna', 'cycle', 'rx', 'chetak', 'cycle'];
    const vcol = ['#7fa3b8', '#b22b2b', '#1a1a22', '#efe6d2', '#3f6fb0', '#2f6a4a', '#c9a227'];
    for (let py = y0 + 12; py < y0 + lm.d - 10; py += 6.5) {
      if (Math.abs(py - lm.y) < 28) continue; // the west gate (the gap in the stands, centred on lm.y)
      for (const px of [x0 - 7, x0 - 15]) if (free(px, py) && r.next() < 0.8) parked.push({ x: px + (r.next() - 0.5), y: py, a: Math.PI + (r.next() - 0.5) * 0.25, kind: kinds[(r.next() * kinds.length) | 0], col: vcol[(r.next() * vcol.length) | 0] });
    }
    for (let px = x0 + 12; px < x0 + lm.w - 10; px += 6.5) {
      if (Math.abs(px - lm.x) < 27) continue; // the south gate (centred on lm.x)
      for (const py of [y0 + lm.d + 7, y0 + lm.d + 15]) if (free(px, py) && r.next() < 0.75) parked.push({ x: px, y: py + (r.next() - 0.5), a: Math.PI / 2 + (r.next() - 0.5) * 0.25, kind: kinds[(r.next() * kinds.length) | 0], col: vcol[(r.next() * vcol.length) | 0] });
    }
    for (const v of parked) v.fn = () => drawParked(v);
    DRESS.parked = parked;
    // fans at the gates (ticket queue at the west gate, a knot at the south gate)
    const peds = [];
    const addPed = (px, py, a) => { if (!free(px, py)) return; const look = N.people && N.people.randomLook ? N.people.randomLook(r, r.next() < 0.5 ? 'kid' : r.next() < 0.5 ? 'man' : 'student') : { kind: 'man', skin: '#b97a4f', hair: '#1a1412', shirt: '#2a5cb8', pants: '#3a3a40' }; const p = { x: px, y: py, a, look, ph: r.next() * 6 }; p.fn = () => drawPed(p); peds.push(p); };
    for (let i = 0; i < 12; i++) addPed(x0 - 6 - i * 4.2 + (r.next() - 0.5) * 1.5, lm.y + (r.next() - 0.5) * 6, 0);
    for (let i = 0; i < 9; i++) addPed(lm.x + (r.next() - 0.5) * 30, y0 + lm.d + 8 + r.next() * 10, -Math.PI / 2);
    DRESS.peds = peds;
    DRESS.lm = lm;
    DRESS.built = true;
    DRESS.crowdFn = drawCrowd2D; DRESS.lampFn = drawLamps2D; DRESS.bannerFn = drawBanner2D;
    return true;
  }
  function drawCrowd2D(ctx) {
    const R = N.render, t = (N.time && N.time.now) || 0;
    for (let c = 0; c < DRESS.cols.length; c++) {
      const arr = DRESS.cols[c];
      ctx.fillStyle = DCOLS[c];
      ctx.beginPath();
      for (let i = 0; i < arr.length; i += 4) {
        const k = R.k(arr[i + 2]), jump = Math.sin(t * 6 + arr[i + 3]) > 0.85 ? 0.8 : 0;
        const sx = R.sx(arr[i], k), sy = R.sy(arr[i + 1], k) - jump * k;
        ctx.rect(sx - 0.7 * k, sy - 0.7 * k, 1.4 * k, 1.4 * k);
      }
      ctx.fill();
    }
  }
  function drawLamps2D(ctx) {
    const R = N.render;
    const night = N.render.night || 0;
    for (const [x, y] of DRESS.towers) {
      const k = R.k(66), sx = R.sx(x, k), sy = R.sy(y, k);
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16 * k);
      gr.addColorStop(0, 'rgba(255,255,240,' + (0.75 + night * 0.25).toFixed(2) + ')'); gr.addColorStop(0.3, 'rgba(255,250,220,' + (0.25 + night * 0.35).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.fillRect(sx - 16 * k, sy - 16 * k, 32 * k, 32 * k);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fffef2'; ctx.fillRect(sx - 3 * k, sy - 1.6 * k, 6 * k, 3.2 * k);
    }
  }
  function drawBanner2D() {
    const lm = DRESS.lm;
    if (!N.draw || !N.draw.pixelText) return;
    N.draw.pixelText(lm.x - lm.w / 2 - 2, lm.y, 12, 'U-12 FINAL TODAY', '#f2c230', { scale: 1, shadow: true });
  }
  function drawParked(v) {
    N.draw.sprite(v.x, v.y, v.a, 0, (ctx) => {
      ctx.fillStyle = '#1a1214';
      if (v.kind === 'cycle') {
        ctx.fillRect(-7, -0.5, 14, 1); ctx.fillRect(-7.5, -1, 3, 2); ctx.fillRect(4.5, -1, 3, 2);
        ctx.fillStyle = v.col; ctx.fillRect(-3, -0.7, 6, 1.4); ctx.fillStyle = '#3a3a40'; ctx.fillRect(4, -3, 1, 6);
        return;
      }
      const L = v.kind === 'luna' ? 6.5 : 8;
      ctx.fillRect(-L - 0.5, -1.2, 2.6, 2.4); ctx.fillRect(L - 2, -1.2, 2.6, 2.4);
      ctx.fillStyle = v.col; ctx.beginPath(); ctx.ellipse(-1, 0, L * 0.72, v.kind === 'chetak' ? 3.1 : 2.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2224'; ctx.fillRect(-4, -1.3, 5, 2.6);
      ctx.fillStyle = '#c9ccd2'; ctx.fillRect(L - 2.5, -3.6, 1, 7.2);
    });
  }
  function drawPed(p) {
    if (!N.people || !N.people.draw) return;
    const t = (N.time && N.time.now) || 0;
    N.draw.sprite(p.x, p.y, p.a + Math.sin(t * 0.7 + p.ph) * 0.4, 0, (ctx) => { N.people.draw(ctx, p.look, { phase: 0, speed: 0 }); });
  }
  function dressDraw() {
    if (!DRESS.on || !N.flags || !N.flags.lb_match) return;
    if (N.view && typeof N.view.is3D === 'function' && N.view.is3D()) return; // the 3D renderer draws its own world
    if (N.minigames && N.minigames.covering) return;
    if (!DRESS.built && !buildDress()) return;
    const R = N.render, lm = DRESS.lm;
    if (!R || !R.rectInView || !R.rectInView(lm.x - lm.w / 2 - 30, lm.y - lm.d / 2 - 30, lm.w + 60, lm.d + 60, 60)) return;
    R.queue('structures', R.distKey(lm.x, lm.y) + 0.5, DRESS.crowdFn);
    R.queue('sky', 1, DRESS.lampFn);
    R.queue('structures', R.distKey(lm.x - lm.w / 2, lm.y) + 0.5, DRESS.bannerFn);
    for (const v of DRESS.parked) if (R.inView(v.x, v.y, 12)) R.queue('actors', v.y, v.fn);
    for (const p of DRESS.peds) if (R.inView(p.x, p.y, 12)) R.queue('actors', p.y, p.fn);
    // floodlights pour onto the field at dusk / night
    const L = N.clock && N.clock.light ? N.clock.light() : 1;
    if (L < 0.6 && R.lights) {
      for (const [x, y] of DRESS.towers) R.lights.push({ x, y, h: 60, r: 70, color: '#f4f8ff', intensity: 0.8 });
      R.lights.push({ x: lm.x, y: lm.y, r: 120, color: '#f0f6ff', intensity: 1, glow: false });
    }
  }
  N.addSystem({ id: 'cricketMatchDressing', order: 46, runIn: ['play', 'dialogue', 'cutscene'], update() {}, draw() { try { dressDraw(); } catch (e) { N.err('cricket.dressing', e); } } });

  /* ================================================================ exhibition match at the west gate */
  function addInteract() {
    try {
      if (!N.interact || !N.places || !N.places.lb_stadium) return;
      const p = N.places.lb_stadium;
      N.interact.add('match:lb_stadium', {
        x: p.x - 6, y: p.y, r: 20, priority: -1,
        label: 'Exhibition match (LB Stadium)',
        enabled: () => !!(N.flags && (N.flags.lb_match_played || N.flags.lb_match_unlocked)) && !(N.minigames && N.minigames.isOpen()) && !(N.missions && N.missions.active),
        use: () => { CM.start({ exhibition: true, difficulty: 0.45 }); },
      });
    } catch (e) { N.err('cricket.interact', e); }
  }
  N.on('boot', addInteract);
  N.on('world:built', addInteract);
  N.on('game:new', addInteract);
  N.on('game:continue', addInteract);
})();
