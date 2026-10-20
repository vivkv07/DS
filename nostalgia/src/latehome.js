/* NOSTALGIA — latehome.js  (owner: late-home developer)
 *
 * "GHAR PAHUNCHNA HAI!" (Get home before they catch you). The street lights came on at seven; Chinnu and
 * his colony friends are still out at Café Gulistan or the Ashok Nagar ground, and every kid has to sneak
 * back to his own front door (a marked door on the map) before an uncle, a daddy, an aunty or Bahadur
 * spots him. Played IN THE WORLD with the normal on-foot controls, at night, in 2D and 3D, solo (with AI
 * Immu and Ayesha) or with friends online through N.party (party.js).
 *
 * THE SEEKERS (comic, never threatening; kids are walked home by the ear, nobody is hurt)
 *   walker   an uncle on his evening walk: paces back and forth across the kids' way, stops to stretch and look
 *   chair    an uncle on a plastic chair at his gate: sweeps his gaze, dozes off now and then ("zzz" = a gap)
 *   window   an aunty at a window: the window opens (TV glow behind her), she looks out, it shuts again
 *   watchman Bahadur, the colony Gurkha: patrols the kids' own route with a torch (narrow, long cone) and
 *            blows his whistle every so often ("Jaagte raho!")
 *   daddy    Nanna on the family Chetak / a daddy on a Luna: rides a loop of the colony lanes, headlight cone
 *   hunter   (Daddy round) Nanna on foot with the big torch: patrols, investigates sounds, chases on sight
 * Every seeker has a vision cone (drawn in 2D on the light layer and in 3D as a fan on the ground, clipped by
 * buildings) and hearing: running is loud (TUNE.noise.run u), walking is quiet, creeping / hiding is silent,
 * a whistle carries far. A sound makes walkers / Bahadur / the hunter walk over to look, chair uncles and the
 * aunty turn to look, daddies on scooters slow down.
 * SEEN -> the kid's "PAKDA!" meter fills (faster when close, x1.4 under a street lamp, x0.5 crouched); out of
 * sight it drains. Full = caught: "Arre, Sharma-ji ka beta!", the seeker walks him home by the ear, Amma has
 * a line. Each new sighting counts as one "spotted".
 * HIDING: hold ACTION (E / the HIDE button / pad A) by a hiding spot = hidden (no cone sees you; only a seeker
 * walking right into you finds you), a peek eye shows how close the danger is (closed / peeking / wide red).
 * Hiding spots: neem / mango trees, the colony water tank, parked autos, a pan-shop counter, the cycle stand,
 * compound walls (crouch behind them), and the terraces of the existing roof routes (no ground seeker sees a
 * kid on a roof; Chinnu's own terrace counts as home). Hold ACTION away from a spot = crouch (creep slowly,
 * silently, harder to see). HORN (Space / the touch button, relabelled SEETI) = whistle: every seeker in earshot turns to it
 * (pulls a cone off a friend). A colony dog naps on the way: run (or walk) past it and it barks, and the
 * seekers come to see what the dog saw.
 * SCORE: time home + times spotted + collectibles (a lost marble / goli, a kite-string reel / manja):
 *   score = 1000 - 6 x seconds - 120 x spotted + 150 x collectibles (home is never below 100 + items);
 *   stars: home, spotted <= 1, unseen + par.
 * PARTY (N.party.register, the binding contract in party.js):
 *   'latehome'        everyone sneaks home at once (race to the least-seen and fastest arrival); a kid who is
 *                     home (or caught) becomes a "ghost": the seekers ignore him and his WHISTLE pulls cones off
 *                     his friends (the quick-chat action)
 *   'latehome_daddy'  one friend is Daddy with the big torch (on foot, or on the parked Chetak) and seeks the
 *                     others in a time limit; catches are by proximity + facing; roles swap every round. Solo:
 *                     round 1 AI Nanna hunts you, round 2 you are Daddy and hunt AI Immu and Ayesha.
 *   The course (start, doors, seekers, spots, dog, lamps) comes from ctx.seed, so every phone builds the same one;
 *   the host simulates the seekers / AI kids / dog and sends one snapshot 'lhsk' 6 times a second (with its own kid,
 *   flavour events, the round and the catches it owes); each guest sends 'lhpos' 5 times a second (its kid + state);
 *   rare: 'lhwh' (whistle), 'lhseen', 'lhcatch' (a human Daddy's catch, repeated until it shows), 'lhit'. All inside
 *   party.js's 12 messages / s budget. Results go to party.js (ctx.report / ctx.ai.report), which ranks them
 *   ('hide': not caught first, then score) and shows its results card; reports are sent at the end of a sim step.
 * SOLO: the "Late! Ghar chalo" prompt at Café Gulistan and the Ashok Nagar ground at dusk (18:40-21:30, no mission,
 *   Chappal Meter 0) or N.latehome.start({venue, variant}) run through N.party.solo when party.js is there (its
 *   countdown, results card, "Again!"); without it (or with {direct: true}) on a solo ctx of our own, with our own
 *   results card (R = Phir se, E = Aage chalo).
 * CHAPPAL METER / CURFEW (light touch, no lasting penalty): while a run is on, N.flags.no_curfew = 'latehome' and
 *   N.wanted is frozen; a win says "NOBODY SAW!", a loss gets a scolding line from Amma; nothing is fined.
 *
 * API  N.latehome = {
 *   start({venue: 'cafe'|'ground', variant: 'sneak'|'daddy', difficulty 0..1, seed, friends: false}) -> bool,
 *   startWith(ctx, opts) (run with a party-contract ctx: tests / other hosts), stop(reason), active(),
 *   state() -> plain snapshot (phase, me, kids, seekers, spots, doors, collectibles, dogs ...), TUNE, VENUES,
 *   eligible(venueId) -> why-not string | '', offerAt(x, y) -> venue id | null, registered (party ids),
 *   debug {hint() (the sneak planner: next move + REAL keys for the local kid), session(), meter(v), catchMe(), win(),
 *          setSeekersFrozen(on), unseen(on) (set a scene up unspotted), nearestHide(), place(kind), coneSpot(role),
 *          resolveAI(), endRound(), v3() (3D layer counts) } }
 * Events: 'latehome:start' {variant, venue, mode}, 'latehome:spotted' {uid, by}, 'latehome:caught' {uid, by},
 *   'latehome:home' {uid, time, spots}, 'latehome:end' {results}, 'latehome:round' {round, daddy}.
 * HOOKS (from this file only; marked "[latehome hook]" where they touch another module's state):
 *   - systems 'lh.ui' (14, every mode: the results card keys), 'lh.ctl' (15, hide / whistle / creep input, owns ACTION
 *     with a priority-90 offer while sneaking; the roof stairs keep theirs), 'lh.pre' / 'lh.post' (19.5 / 21, around
 *     the player: crouching creeps at TUNE.creepMul, hiding holds still), 'lh.sim' (31, after vehicles: seekers,
 *     kids, dogs, network, HUD; draw: 2D cones / props / lights);
 *   - N.view3d.registerLayer('latehome'): cones, props, door markers, lamps, TV glow, the peeking head;
 *   - N.clock.hold('latehome'), N.flags.no_curfew / no_save, N.wanted.freeze(true, 'latehome'),
 *     N.traffic.closeRoads('latehome', ...), N.npcs.schedule('colony_aunties' | 'bahadur_night', off) during a
 *     run (restored after), mission givers' when() wrapped once ("not now" while a run is on);
 *   - N.interact.add('lh:<venue>') the solo prompts; N.party.register('latehome' | 'latehome_daddy');
 *   - its own CSS (<style id="lh-css">), the HUD panel inside #hud .hud-top and the results card in #ui.
 * TEST: node tests/latehome.cjs
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
    clockStart: 19 * 60 + 45, window: [18 * 60 + 40, 21 * 60 + 30],
    timeLimit: 200, warnAt: 150, intro: 3.2, ghostAfter: 2.5, safeR: 30,
    kidWalk: 42, kidRun: 72, creepMul: 0.45,
    // vision: range u, half angle (rad), speeds u/s
    role: {
      walker: { range: 92, half: 0.62, walk: 24, look: 0.5 },
      chair: { range: 100, half: 0.7, sweep: 0.85, period: 5.5, doze: [9, 13], dozeT: 3.2 },
      window: { range: 92, half: 0.5, open: 5.2, shut: 3.6, sweep: 0.45 },
      watchman: { range: 128, half: 0.36, walk: 30, sweep: 0.55, whistleEvery: 11 },
      daddy: { range: 140, half: 0.27, speed: 50, corner: 22 },
      hunter: { range: 122, half: 0.42, walk: 34, run: 62, catchR: 13, catchHalf: 0.9 },
    },
    // how fast heads turn (rad/s): uncles are not quick
    turn: { walker: 1.3, watchman: 1.6, hunter: 2.6, chair: 1.1, window: 0.9, escort: 6 },
    seeClose: 11,                         // closer than this: seen in any direction (bumped into)
    hiddenFoundR: 8,                      // a seeker this close finds even a hidden kid
    meter: { far: 0.22, near: 0.7, lamp: 1.35, crouch: 0.5, crouchRange: 0.62, decay: 0.34, hold: 0.5, newSpotGap: 2.2 },
    noise: { run: 82, walk: 17, whistle: 175, bark: 175, react: 6 },
    dog: { wakeRun: 62, wakeWalk: 24, barkSecs: 3, rest: 9 },
    lampEvery: 88, lampR: 38, hideR: 11, collectR: 8, doorR: 13,
    catch: { approach: 3.2, escort: 3.4, fade: 0.55 },
    whistleCD: 5,
    net: { hz: 6, posHz: 5, interp: 0.18 },
    daddy: { rounds: 2, time: 85, catchR: 14, catchHalf: 0.95, hiddenR: 6 },
    score: { base: 1000, perSec: 6, perSpot: 120, perItem: 150, floor: 100 },
  };

  /* ================================================================ lines (bible tone: comic, kind) */
  const LINES = {
    notice: {
      walker: ['*Arre?* Who is there?', 'Hmm? Somebody is there...', 'Is that a kid? At this hour?'],
      chair: ['Ey! *Kaun hai?*', 'Hmm? Who is that?', 'I can SEE you, ah!'],
      window: ['Who\'s outside?', '*Ayyo*, is that a child?', 'Padma\'s boy? ...Let me get my specs.'],
      watchman: ['*Kaun hai?*', 'Who goes there?', 'Baba? Is it you?'],
      daddy: ['Who\'s that in my headlight?', 'Hm? Kid on the road?'],
      hunter: ['I SAW that, {nick}!', 'Aha! Behind the tank?'],
    },
    caught: {
      chinnu: ['*Arre*, Sharma-ji ka beta! ...No, no, Sreenivas-garu\'s boy! *Chalo*, home!', 'Street lights are ON, *beta*. *Chalo*.', 'Your Amma has called four houses. FOUR. *Chalo*.'],
      immu: ['Rasheed-saab\'s boy! Your Ammi is at the gate. *Chalo*.', '*Arre*, Agent Immu! Mission over. Home.'],
      ayesha: ['Ayesha *beti*! Bowling in the dark? Home, home.', 'Captain of the colony XI, caught by an uncle. *Chalo*.'],
      other: ['*Arre*, Sharma-ji ka beta! At this hour?!', 'Whose boy is this? *Chalo*, I\'ll take you.', 'Home! By the ear! *Chalo*!'],
    },
    ear: ['Ow-ow-ow! Okay, okay!', '*Aaah*, the ear, uncle, the EAR!', 'I was COMING home only!'],
    escort: ['*Chalo*, ghar!', 'Left, right, left, right...', 'Your Amma will be SO happy.'],
    sleepy: ['zzz...', '*Hmm*... cricket score...', 'zzz... six runs... zzz'],
    walker: ['Ten thousand steps. Doctor said.', '*Hai*, my knees.', 'Morning walk, evening walk, same knees.'],
    watchman: ['Tweeeet! *Jaagte raho!*', '*Jaagte raho!*'],
    whistleHeard: ['Who whistled?', 'Hm? That way?', 'Kaun? Who\'s there?'],
    dog: ['Bow! Bow! Bow!', 'Woof! WOOF!', 'Bow-wow-wow!'],
    dogHeard: ['What is the dog barking at?', 'Tommy! What happened?'],
    trip: ['*Arre*, who is crouching here?!', 'What is THIS behind my tank?!'],
    ammaCaught: ['Street lights came on one hour back, {nick}! Wash your feet. Then homework.', 'Every uncle in the colony knows you were out. EVERY uncle.', 'By the EAR, {nick}? Tomorrow you are home by six. *Pakka*.'],
    ammaWin: ['Oh, you were inside all along? ...Good boy. Wash your feet.', 'You\'re home? I didn\'t even hear the gate. ...Hmm.'],
    ammaSeen: ['Hmm. The street lights came on at seven, {nick}. Inside. Now.', 'Sharma aunty phoned. Twice. ...Eat first.'],
    timeUp: 'Amma came looking with the torch!',
    nobody: 'NOBODY SAW!',
    home: 'GHAR PAHUNCH GAYA!',
    pakda: 'PAKDA!',
    daddyCatch: ['Got you! *Chalo*, home!', 'Found you, *beta*!', 'Aha! Studying behind the water tank, are we?'],
  };
  const pick = (a, r) => a[Math.floor((r ? r() : Math.random()) * a.length) % a.length];

  /* ================================================================ venues */
  // start: a place id (+ offset); prompt: where the solo "Late! Ghar chalo" offer sits
  const VENUES = {
    cafe: { id: 'cafe', name: 'Café Gulistan', place: 'irani_cafe_7', at: [9798, 5128], prompt: [9798, 5128],
      line: 'Chai and Osmania at Café Gulistan ran late. The street lights are ON.' },
    ground: { id: 'ground', name: 'Ashok Nagar ground', place: 'playground_14', at: null, prompt: null,
      line: 'The match at Ashok Nagar ground ran late. The street lights are ON.' },
  };
  // the friends' homes (bible §2.3: Immu across the colony ground); other kids get colony doors
  const HOME_ROOF = { home: 'home_terrace', friend_home: 'friend_terrace' };

  /* ================================================================ small helpers */
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, o || {}); } catch (e) { /* audio optional */ } }
  function toast(t, ms, o) { try { if (N.hud && N.hud.toast) N.hud.toast(subst(t), ms || 2400, o); } catch (e) { /* hud optional */ } }
  function banner(t, sub, ms, o) { try { if (N.hud && N.hud.banner) N.hud.banner(t, subst(sub || ''), ms || 2600, o); } catch (e) { /* hud optional */ } }
  function subst(t) {
    t = String(t == null ? '' : t);
    try { if (N.menus && N.menus.subst) return N.menus.subst(t); } catch (e) { /* stub */ }
    const nick = (N.player && (N.player.nick || N.player.name)) || 'Chinnu';
    return t.replace(/\{nick\}/g, nick === 'You' ? 'Chinnu' : nick).replace(/\{FULL\}/g, 'K. SRIKANTH').replace(/\{full\}/g, 'K. Srikanth');
  }
  function bark(target, text, speaker, secs) {
    try { if (N.dialogue && N.dialogue.bark) return N.dialogue.bark(target, subst(text), { speaker: speaker || undefined, name: speaker ? undefined : false, secs: secs || 2.4 }); } catch (e) { N.err('latehome.bark', e); }
    return null;
  }
  function npcLook(id, fb) {
    let L = null;
    try { if (N.npcs && N.npcs.look) L = N.npcs.look(id); } catch (e) { /* stub */ }
    return Object.assign({}, L || fb || { kind: 'man' });
  }
  function trafficLook(role) {
    try { if (N.traffic && N.traffic.makeLook) return Object.assign({}, N.traffic.makeLook(role, 'colony').look); } catch (e) { /* stub */ }
    return role === 'aunty' ? { kind: 'aunty', skin: '#a0683f', hair: '#1a1412', saree: '#7a3a8a', border: '#f2c230' } : { kind: 'uncle', skin: '#9a6040', hair: '#8a8680', lungi: '#2a5cb8' };
  }
  const FB = {
    nanna: { kind: 'man', skin: '#9a6040', hair: '#1a1412', shirt: '#a9c4e0', pants: '#5a5f66', cast: 1 },
    bahadur: { kind: 'man', skin: '#d29a6a', hair: '#1a1412', shirt: '#8a7a4a', pants: '#4a4a3a', hat: 'dhaka', hatColor: '#1d1a1e', prop: 'stick', cast: 1 },
    immu: { kind: 'kid', skin: '#c68b5e', hair: '#1a1412', shirt: '#2f8a5a', pants: '#2c3550', stripes: '#f4f2ea' },
    ayesha: { kind: 'kid', girl: true, skin: '#a0683f', hair: '#1a1412', shirt: '#d24d57', pants: '#f4f2ea', cap: 'cricket', capColor: '#1d4f91' },
    chinnu: { kind: 'kid', skin: '#b97a4f', hair: '#1a1412', shirt: '#3d6fb0', pants: '#8a7a55' },
  };
  function walkable(x, y) { try { return !!N.world.isWalkable(x, y); } catch (e) { return false; } }
  function free(x, y, r) { try { return N.world.findFree(x, y, 'walk', r || 8); } catch (e) { return null; } }
  function clear(ax, ay, bx, by) { try { return !N.world.raycast(ax, ay, bx, by, 'walk').hit; } catch (e) { return false; } }
  function is3D() { try { return !!(N.view && N.view.is3D && N.view.is3D()); } catch (e) { return false; } }
  function placePos(id) { const q = N.places && N.places[id]; return q ? { x: q.x, y: q.y } : null; }
  function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  /** polyline helpers: pts [[x, y]...] */
  function polyLen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += hyp(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
  function polyAt(P, s) {
    // point + heading at arc length s (clamped)
    if (P.length < 2) return { x: P[0][0], y: P[0][1], a: 0, i: 0 };
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], L = hyp(dx, dy);
      if (acc + L >= s || i === P.length - 1) {
        const t = L > 0 ? clamp((s - acc) / L, 0, 1) : 0;
        return { x: P[i - 1][0] + dx * t, y: P[i - 1][1] + dy * t, a: Math.atan2(dy, dx), i };
      }
      acc += L;
    }
    const n = P.length - 1;
    return { x: P[n][0], y: P[n][1], a: 0, i: n };
  }
  function polyNearest(P, x, y) {
    // nearest arc length on P to (x, y): {s, d}
    let best = { s: 0, d: Infinity }, acc = 0;
    for (let i = 1; i < P.length; i++) {
      const c = U.closestOnSeg(x, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]);
      const L = hyp(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      const d = Math.sqrt(c.d2);
      if (d < best.d) best = { s: acc + c.t * L, d };
      acc += L;
    }
    return best;
  }
  function subPoly(P, s0, s1) {
    const out = [];
    const a = polyAt(P, s0), b = polyAt(P, s1);
    out.push([a.x, a.y]);
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      acc += hyp(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      if (acc > s0 + 0.5 && acc < s1 - 0.5) out.push([P[i][0], P[i][1]]);
    }
    out.push([b.x, b.y]);
    return out;
  }
  function hashSeed(s) { return typeof s === 'number' ? (s >>> 0) : (U.strHash ? U.strHash(String(s)) >>> 0 : 12345); }

  /* ================================================================ the course (deterministic from ctx.seed)
   * Built from the real map: walk paths (N.npcs.planPath, a grid A*) from the venue to every kid's door, then
   * seekers at "pressure points" along those paths, hiding spots from the map (trees, the water tank, the cycle
   * stand) plus props (parked autos, a pan-shop counter, compound walls), lamps along the way, TV windows, a
   * dog and the collectibles. Same seed + same map = the same course on every phone. */
  function rngOf(seed) { const r = U.rng(hashSeed(seed)); return r; }
  function shuffle(a, R) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function venueStart(v) {
    let x, y;
    if (v.at) { x = v.at[0]; y = v.at[1]; } else { const q = placePos(v.place); if (!q) return null; x = q.x; y = q.y; }
    const f = walkable(x, y) ? { x, y } : free(x, y, 30);
    return f ? { x: f.x, y: f.y } : null;
  }
  function walkPath(x0, y0, x1, y1) {
    let pts = null;
    try { if (N.npcs && N.npcs.planPath) pts = N.npcs.planPath(x0, y0, x1, y1); } catch (e) { N.err('latehome.path', e); }
    const out = [[x0, y0]];
    if (pts && pts.length) for (const q of pts) out.push([q.x, q.y]);
    else out.push([x1, y1]);
    // densify long legs (cones / lamps / pressure points sample along them)
    const res = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const a = res[res.length - 1], b = out[i], L = hyp(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 40);
      for (let k = 1; k <= n; k++) res.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    return res;
  }
  function bldgRect(s) { return s && s.t === 'bldg' ? { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.d, h: s.h || 20 } : null; }
  /** the point on a rect's boundary nearest (px, py) and its outward normal */
  function rectEdge(r, px, py) {
    const cx = clamp(px, r.x0, r.x1), cy = clamp(py, r.y0, r.y1);
    const dl = Math.abs(cx - r.x0), dr = Math.abs(r.x1 - cx), dt = Math.abs(cy - r.y0), db = Math.abs(r.y1 - cy);
    const inside = px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1;
    let nx = 0, ny = 0, x = cx, y = cy;
    if (inside) {
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) { x = r.x0; nx = -1; } else if (m === dr) { x = r.x1; nx = 1; } else if (m === dt) { y = r.y0; ny = -1; } else { y = r.y1; ny = 1; }
    } else {
      if (px <= r.x0) nx = -1; else if (px >= r.x1) nx = 1;
      if (py <= r.y0) ny = -1; else if (py >= r.y1) ny = 1;
      if (nx && ny) { if (Math.abs(px - x) > Math.abs(py - y)) ny = 0; else nx = 0; }
    }
    return { x, y, nx, ny, a: Math.atan2(ny, nx) };
  }
  function doorOf(r) {
    // the side of the house that faces the nearest lane / street
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    let rp = null;
    try { rp = N.world.nearestRoadPoint(cx, cy, (rd) => rd && (rd.kind === 'lane' || rd.kind === 'street')); } catch (e) { rp = null; }
    const tx = rp && rp.dist < 160 ? rp.x : cx + 40, ty = rp && rp.dist < 160 ? rp.y : cy;
    const e = rectEdge(r, tx, ty);
    const d = { x: e.x + e.nx * 6, y: e.y + e.ny * 6, a: e.a };
    if (!walkable(d.x, d.y)) { const f = free(d.x, d.y, 4); if (!f || hyp(f.x - d.x, f.y - d.y) > 10) return null; d.x = f.x; d.y = f.y; }
    return d;
  }
  function colonyDoors(R, n, near, avoid, start) {
    const out = [];
    if (n <= 0) return out;
    const cand = [];
    try {
      N.world.queryStructures(near.x - 330, near.y - 330, near.x + 330, near.y + 330, (s) => {
        const r = bldgRect(s);
        if (!r || (r.x1 - r.x0) * (r.y1 - r.y0) < 220 || r.h > 40) return;
        const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, d = hyp(cx - near.x, cy - near.y);
        if (d < 50 || d > 320) return;
        if (start && hyp(cx - start.x, cy - start.y) < Math.max(210, 0.72 * hyp(near.x - start.x, near.y - start.y))) return;
        cand.push(r);
      });
    } catch (e) { N.err('latehome.doors', e); }
    cand.sort((a, b) => (a.x0 - b.x0) || (a.y0 - b.y0));
    shuffle(cand, R);
    for (const r of cand) {
      if (out.length >= n) break;
      const d = doorOf(r);
      if (!d) continue;
      if (avoid.concat(out).some((q) => hyp(q.x - d.x, q.y - d.y) < 46)) continue;
      out.push(d);
    }
    return out;
  }
  function sidePerp(a, side) { return { x: Math.cos(a + side * Math.PI / 2), y: Math.sin(a + side * Math.PI / 2) }; }
  function rayLen(x, y, dx, dy, max) {
    let h = null;
    try { h = N.world.raycast(x, y, x + dx * max, y + dy * max, 'walk'); } catch (e) { h = null; }
    if (!h || !h.hit) return max;
    return Math.max(0, hyp(h.x - x, h.y - y) - 4);
  }
  /** road-graph loop through the lane edge nearest (x, y): node points, or a chain to ride back and forth */
  function laneLoop(x, y, R, near) {
    const RD = N.world.roads;
    if (!RD || !RD.nodes || !RD.edges) return null;
    const okEdge = (e) => e && (e.kind === 'lane' || e.kind === 'street');
    const inArea = (nd) => hyp(nd.x - near.x, nd.y - near.y) < near.r;
    let a = null;
    try { a = RD.nearestNode(x, y, (nd) => inArea(nd) && nd.inc.some((id) => okEdge(RD.edges[id]))); } catch (e) { a = null; }
    if (!a) return null;
    const incs = a.inc.map((id) => RD.edges[id]).filter(okEdge);
    if (!incs.length) return null;
    shuffle(incs, R);
    for (const e0 of incs) {
      const b = RD.nodes[e0.a === a.id ? e0.b : e0.a];
      // Dijkstra b -> a without e0, inside the area, lanes / streets only
      const dist = new Map(), prev = new Map(), open = [[0, b.id]];
      dist.set(b.id, 0);
      let found = false, guard = 0;
      while (open.length && guard++ < 4000) {
        open.sort((p, q) => p[0] - q[0]);
        const [g, id] = open.shift();
        if (g > (dist.get(id) || 0) + 1e-6) continue;
        if (id === a.id) { found = true; break; }
        if (g > 1100) break;
        const nd = RD.nodes[id];
        for (const eid of nd.inc) {
          const e = RD.edges[eid];
          if (e === e0 || !okEdge(e)) continue;
          const to = e.a === id ? e.b : e.a, T = RD.nodes[to];
          if (!inArea(T)) continue;
          const ng = g + (e.len || hyp(T.x - nd.x, T.y - nd.y));
          if (!dist.has(to) || ng < dist.get(to)) { dist.set(to, ng); prev.set(to, id); open.push([ng, to]); }
        }
      }
      if (!found) continue;
      const total = dist.get(a.id) + (e0.len || 0);
      if (total < 240 || total > 1150) continue;
      const ids = [a.id];
      for (let c = a.id; c !== b.id;) { c = prev.get(c); ids.push(c); }
      // ids: a <- ... <- b ; ride a -> b (e0) -> ... -> a
      const loop = [[a.x, a.y]];
      for (let i = ids.length - 1; i >= 0; i--) { const nd = RD.nodes[ids[i]]; loop.push([nd.x, nd.y]); }
      return { pts: dedupe(loop), loop: true };
    }
    // no loop: a straight-ish chain to ride back and forth
    const chain = [[a.x, a.y]];
    let cur = a, prevId = -1, len = 0;
    for (let k = 0; k < 6 && len < 260; k++) {
      let best = null, bs = -Infinity;
      for (const eid of cur.inc) {
        const e = RD.edges[eid];
        if (!okEdge(e)) continue;
        const to = e.a === cur.id ? e.b : e.a;
        if (to === prevId) continue;
        const T = RD.nodes[to];
        if (!inArea(T)) continue;
        const sc = chain.length > 1 ? Math.cos(adiff(Math.atan2(cur.y - chain[chain.length - 2][1], cur.x - chain[chain.length - 2][0]), Math.atan2(T.y - cur.y, T.x - cur.x))) : R.next();
        if (sc > bs) { bs = sc; best = T; }
      }
      if (!best) break;
      len += hyp(best.x - cur.x, best.y - cur.y);
      chain.push([best.x, best.y]); prevId = cur.id; cur = best;
    }
    return len > 90 ? { pts: dedupe(chain), loop: false } : null;
  }
  function dedupe(P) { const o = []; for (const p of P) if (!o.length || hyp(p[0] - o[o.length - 1][0], p[1] - o[o.length - 1][1]) > 2) o.push(p); return o; }
  /** shift a polyline to the left of travel (Hyderabad drives on the left) */
  function keepLeft(P, off, loop) {
    const n = P.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
      let ax, ay;
      if (!loop && i === 0) { ax = c[0] - b[0]; ay = c[1] - b[1]; } else if (!loop && i === n - 1) { ax = b[0] - a[0]; ay = b[1] - a[1]; } else { ax = c[0] - a[0]; ay = c[1] - a[1]; }
      const L = hyp(ax, ay) || 1;
      // left of travel: (dy, -dx)
      const x = b[0] + (ay / L) * off, y = b[1] - (ax / L) * off;
      out.push(walkable(x, y) ? [x, y] : [b[0], b[1]]);
    }
    return out;
  }

  function buildCourse(S) {
    const R = S.rng;
    const v = VENUES[S.venue] || VENUES.cafe;
    const start = venueStart(v);
    if (!start) throw new Error('latehome: no start for venue ' + S.venue);
    const C = { venue: v.id, start, doors: {}, paths: {}, seekers: [], hides: [], items: [], dogs: [], lamps: [], tvs: [], walls: [], pans: [], autos: [], bbox: null };
    // doors: Chinnu's home and Immu's house first, then colony houses near home
    const homeAt = placePos('home') || start;
    const fixed = [];
    for (const k of ['home', 'friend_home']) { const q = placePos(k); if (q) { const f = walkable(q.x, q.y) ? q : free(q.x, q.y, 12); if (f) fixed.push({ x: f.x, y: f.y, place: k, roof: HOME_ROOF[k] }); } }
    const kids = S.kids;
    const need = Math.max(0, kids.length - fixed.length);
    const extra = colonyDoors(R, need + 2, homeAt, fixed.concat([start]), start);
    // assignment: a kid with a story home gets it (solo Chinnu / Immu), the rest in uid order
    const pool = fixed.slice();
    for (const d of extra) pool.push({ x: d.x, y: d.y, place: null, roof: null });
    const taken = new Set();
    const byName = { chinnu: 'home', immu: 'friend_home' };
    for (const k of kids) {
      const want = k.npc ? byName[k.npc] : (k.isMe && S.mode === 'solo' ? 'home' : null);
      const d = want ? pool.find((q) => q.place === want && !taken.has(q)) : null;
      if (d) { taken.add(d); C.doors[k.uid] = d; }
    }
    for (const k of kids) {
      if (C.doors[k.uid]) continue;
      const d = pool.find((q) => !taken.has(q));
      if (d) { taken.add(d); C.doors[k.uid] = d; } else C.doors[k.uid] = Object.assign({}, fixed[0] || homeAt);
    }
    // walk paths
    let x0 = start.x, y0 = start.y, x1 = start.x, y1 = start.y;
    for (const k of kids) {
      const d = C.doors[k.uid];
      const P = walkPath(start.x, start.y, d.x, d.y);
      C.paths[k.uid] = P;
      for (const p of P) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    }
    C.bbox = { x0: x0 - 140, y0: y0 - 140, x1: x1 + 140, y1: y1 + 140 };
    C.center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: hyp(x1 - x0, y1 - y0) / 2 + 160 };
    const paths = kids.map((k) => C.paths[k.uid]);
    const main = paths.slice().sort((a, b) => polyLen(b) - polyLen(a))[0];
    C.main = main;
    C.par = Math.round(polyLen(main) / TUNE.kidWalk * 1.7 + 8);
    // pressure points along every path
    const pps = [];
    for (const P of paths) {
      const L = polyLen(P);
      for (const f of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88]) {
        const q = polyAt(P, L * f);
        if (pps.some((o) => hyp(o.x - q.x, o.y - q.y) < 45)) continue;
        pps.push({ x: q.x, y: q.y, a: q.a, P, s: L * f, f });
      }
    }
    shuffle(pps, R);
    const nearStartOrDoor = (x, y, r) => hyp(x - start.x, y - start.y) < r || kids.some((k) => hyp(C.doors[k.uid].x - x, C.doors[k.uid].y - y) < r * 0.8);
    const used = [];
    const farFromUsed = (x, y, r) => used.every((u) => hyp(u.x - x, u.y - y) > r);
    // the cast for this difficulty
    const d = S.difficulty;
    let roles;
    if (S.variant === 'daddy') roles = ['window'];
    else {
      roles = ['watchman', 'walker', 'chair', 'daddy', 'window', 'walker', 'chair', 'daddy'];
      roles = roles.slice(0, Math.round(lerp(3, 8, d)));
    }
    let daddyN = 0;
    for (const role of roles) {
      let made = null;
      for (let i = 0; i < pps.length && !made; i++) {
        const pp = pps[i];
        if (nearStartOrDoor(pp.x, pp.y, role === 'daddy' ? 30 : 58) || !farFromUsed(pp.x, pp.y, role === 'daddy' ? 40 : 70)) continue;
        made = placeRole(role, pp, R, C, daddyN);
        if (made && (!clearOfStart(made, start) || !clearOfDoors(made, kids.map((k) => C.doors[k.uid])))) made = null;
      }
      if (made) { if (role === 'daddy') daddyN++; made.id = C.seekers.length; C.seekers.push(made); used.push({ x: made.x, y: made.y }); }
    }
    // hiding spots: trees, the water tank, the cycle stand (from the map)
    const nearPath = (x, y, r) => { for (const P of paths) if (polyNearest(P, x, y).d < r) return true; return false; };
    try {
      for (const t of N.world.trees || []) {
        if (t.x < C.bbox.x0 || t.x > C.bbox.x1 || t.y < C.bbox.y0 || t.y > C.bbox.y1) continue;
        if (t.kind === 'palm' || (t.r || 8) < 6.5 || !nearPath(t.x, t.y, 46)) continue;
        const np = nearestPathPt(paths, t.x, t.y);
        const aw = Math.atan2(t.y - np.y, t.x - np.x);
        let hx = t.x + Math.cos(aw) * 4, hy = t.y + Math.sin(aw) * 4;
        if (!walkable(hx, hy)) { const f = free(hx, hy, 3); if (!f) continue; hx = f.x; hy = f.y; }
        C.hides.push({ kind: 'tree', name: (t.kind === 'neem' ? 'the neem tree' : t.kind === 'mango' ? 'the mango tree' : 'the ' + (t.kind || 'big') + ' tree'), x: hx, y: hy, r: TUNE.hideR, tree: { x: t.x, y: t.y, r: t.r } });
      }
      for (const lm of (N.WORLD_DATA && N.WORLD_DATA.landmarks) || []) {
        if (lm.draw !== 'water_tank' || lm.x < C.bbox.x0 - 60 || lm.x > C.bbox.x1 + 60 || lm.y < C.bbox.y0 - 60 || lm.y > C.bbox.y1 + 60) continue;
        const np = nearestPathPt(paths, lm.x, lm.y);
        if (hyp(np.x - lm.x, np.y - lm.y) > 130) continue;
        const e = rectEdge({ x0: lm.x - lm.w / 2, y0: lm.y - lm.d / 2, x1: lm.x + lm.w / 2, y1: lm.y + lm.d / 2 }, np.x, np.y);
        const f = free(e.x + e.nx * 5, e.y + e.ny * 5, 8);
        if (f) C.hides.push({ kind: 'tank', name: 'the colony water tank', x: f.x, y: f.y, r: TUNE.hideR + 2 });
      }
      for (const id in N.places) {
        const q = N.places[id];
        if (q.kind !== 'cycle_rent' || q.x < C.bbox.x0 || q.x > C.bbox.x1 || q.y < C.bbox.y0 || q.y > C.bbox.y1) continue;
        if (!nearPath(q.x, q.y, 110)) continue;
        const f = free(q.x, q.y, 10);
        if (f) C.hides.push({ kind: 'cycles', name: 'the cycle stand', x: f.x, y: f.y, r: TUNE.hideR + 2 });
      }
    } catch (e) { N.err('latehome.hides', e); }
    // props: parked autos, a pan-shop counter, compound walls (placed by the main paths)
    const propAt = (f, minOff, maxOff, P) => {
      P = P || main;
      const L = polyLen(P), q = polyAt(P, L * f);
      for (const side of R.next() < 0.5 ? [1, -1] : [-1, 1]) {
        const pr = sidePerp(q.a, side);
        for (let off = minOff; off <= maxOff; off += 4) {
          const x = q.x + pr.x * off, y = q.y + pr.y * off;
          if (!walkable(x, y) || !clear(q.x, q.y, x, y)) continue;
          if (C.seekers.some((s) => hyp(s.x - x, s.y - y) < 34) || C.hides.some((h) => hyp(h.x - x, h.y - y) < 22)) continue;
          if (nearStartOrDoor(x, y, 30)) continue;
          return { x, y, a: q.a, side, px: pr.x, py: pr.y, q };
        }
      }
      return null;
    };
    const nAuto = d > 0.6 ? 3 : 2;
    const autoF = shuffle([0.3, 0.46, 0.62, 0.78], R);
    for (let i = 0; i < autoF.length && C.autos.length < nAuto; i++) {
      const P = paths[i % paths.length];
      const s = propAt(autoF[i], 15, 22, P);
      if (!s) continue;
      // the auto's whole footprint must be clear ground
      const c = Math.cos(s.a), sn = Math.sin(s.a);
      let ok = true;
      for (const [lx, ly] of [[-11, -7], [11, -7], [-11, 7], [11, 7], [0, 0]]) { if (!walkable(s.x + c * lx - sn * ly, s.y + sn * lx + c * ly)) { ok = false; break; } }
      if (!ok) continue;
      const hx = s.x + s.px * 11, hy = s.y + s.py * 11;
      if (!walkable(hx, hy)) continue;
      C.autos.push({ x: s.x, y: s.y, a: s.a });
      C.hides.push({ kind: 'auto', name: 'the parked auto', x: hx, y: hy, r: TUNE.hideR + 1 });
    }
    const pan = propAt(R.range(0.35, 0.65), 20, 30);
    if (pan) {
      C.pans.push({ x: pan.x, y: pan.y, a: Math.atan2(-pan.py, -pan.px) });
      const hx = pan.x + pan.px * 9, hy = pan.y + pan.py * 9;
      if (walkable(hx, hy)) C.hides.push({ kind: 'pan', name: 'the pan-shop counter', x: hx, y: hy, r: TUNE.hideR });
    }
    for (const f of shuffle([0.28, 0.5, 0.72], R).slice(0, 2)) {
      const P = paths[Math.floor(R.next() * paths.length)];
      const s = propAt(f, 16, 22, P);
      if (!s) continue;
      const ux = Math.cos(s.a), uy = Math.sin(s.a);
      C.walls.push({ ax: s.x - ux * 15, ay: s.y - uy * 15, bx: s.x + ux * 15, by: s.y + uy * 15, h: 5.5 });
      const hx = s.x + s.px * 5, hy = s.y + s.py * 5;
      if (walkable(hx, hy)) C.hides.push({ kind: 'wall', name: 'the compound wall', x: hx, y: hy, r: TUNE.hideR + 3, wall: C.walls[C.walls.length - 1] });
    }
    // the colony dog (two at higher difficulty)
    const nDog = S.variant === 'daddy' ? 1 : d > 0.55 ? 2 : 1;
    const dogF = shuffle([0.42, 0.58, 0.74], R).concat([0.36, 0.5, 0.64, 0.8, 0.86]);
    for (let i = 0; i < dogF.length * paths.length && C.dogs.length < nDog; i++) {
      const P = paths[(C.dogs.length + Math.floor(i / dogF.length)) % paths.length];
      const s = propAt(dogF[i % dogF.length], 6, 20, P);
      if (!s || C.dogs.some((g) => hyp(g.x - s.x, g.y - s.y) < 80) || hyp(s.x - start.x, s.y - start.y) < 110) continue;
      C.dogs.push({ x: s.x, y: s.y, a: R.range(0, TAU) });
    }
    if (!C.dogs.length) { const q = polyAt(main, polyLen(main) * 0.6); const f = free(q.x + 8, q.y, 10); if (f) C.dogs.push({ x: f.x, y: f.y, a: 0 }); } // a dog always naps somewhere on the way
    // collectibles: a lost marble (goli) or two, a kite-string reel (manja)
    const kinds = d > 0.5 ? ['goli', 'manja', 'goli'] : ['goli', 'manja'];
    kinds.forEach((kind, i) => {
      for (let tr = 0; tr < 8; tr++) {
        const P = paths[(i + tr) % paths.length];
        const s = propAt(R.range(0.22, 0.86), 14, 32, P);
        if (!s || C.items.some((o) => hyp(o.x - s.x, o.y - s.y) < 50)) continue;
        C.items.push({ id: 'it' + i, kind, x: s.x, y: s.y, name: kind === 'goli' ? 'a lost marble' : 'a kite-string reel' });
        break;
      }
    });
    // street lamps along the way (alternate sides) and TV windows
    for (const P of paths) {
      const L = polyLen(P);
      let side = R.next() < 0.5 ? 1 : -1;
      for (let s = 40; s < L - 20; s += TUNE.lampEvery) {
        const q = polyAt(P, s);
        if (C.lamps.some((l) => hyp(l.x - q.x, l.y - q.y) < 56)) continue;
        side = -side;
        for (const sd of [side, -side]) {
          const pr = sidePerp(q.a, sd), x = q.x + pr.x * 15, y = q.y + pr.y * 15;
          if (walkable(x, y)) { C.lamps.push({ x, y }); break; }
        }
      }
    }
    try {
      const seen = new Set();
      for (const P of paths) {
        const L = polyLen(P);
        for (let s = 30; s < L; s += 55) {
          if (C.tvs.length >= 7) break;
          const q = polyAt(P, s);
          N.world.queryStructures(q.x - 50, q.y - 50, q.x + 50, q.y + 50, (st) => {
            const r = bldgRect(st);
            if (!r || seen.has(st) || C.tvs.length >= 7) return;
            const e = rectEdge(r, q.x, q.y);
            if (hyp(e.x - q.x, e.y - q.y) > 46 || !clear(e.x + e.nx * 3, e.y + e.ny * 3, q.x, q.y)) return;
            if (C.seekers.some((sk) => sk.role === 'window' && hyp(sk.x - e.x, sk.y - e.y) < 30)) return;
            seen.add(st);
            if (R.next() < 0.55) C.tvs.push({ x: e.x + e.nx * 1.2, y: e.y + e.ny * 1.2, a: e.a, h: 9 + R.next() * 3, ph: R.next() * 10 });
          });
        }
      }
    } catch (e) { N.err('latehome.tvs', e); }
    // the hunter's beat (Daddy round): pressure points to walk between
    C.beat = pps.map((p) => [p.x, p.y]).slice(0, 6);
    return C;
  }
  /** nobody may watch the venue itself: the kids must get a fair first step */
  function clearOfStart(m, st) {
    if (m.pts) {
      let P = m.pts;
      if (m.loop) P = P.concat([P[0]]);
      return polyNearest(P, st.x, st.y).d >= (m.role === 'daddy' ? 110 : Math.max(95, m.range + 5));
    }
    return hyp(m.x - st.x, m.y - st.y) >= m.range + 20;
  }
  /** and nobody stands right on a kid's doorstep */
  function clearOfDoors(m, doors) {
    for (const d of doors) {
      if (m.pts) { let P = m.pts; if (m.loop) P = P.concat([P[0]]); if (polyNearest(P, d.x, d.y).d < (m.role === 'daddy' ? 30 : 42)) return false; }
      else if (hyp(m.x - d.x, m.y - d.y) < (m.range || 90) + 12) return false; // a chair / window can't stare at a door
    }
    return true;
  }
  function nearestPathPt(paths, x, y) {
    let best = null, bd = Infinity;
    for (const P of paths) { const n = polyNearest(P, x, y); if (n.d < bd) { bd = n.d; const q = polyAt(P, n.s); best = { x: q.x, y: q.y, a: q.a, d: n.d }; } }
    return best || { x, y, a: 0, d: 0 };
  }
  function placeRole(role, pp, R, C, daddyN) {
    const T = TUNE.role;
    if (role === 'walker') {
      // back and forth ACROSS the kids' way (or along it), pausing at the ends
      const across = R.next() < 0.6;
      let pts;
      if (across) {
        const pr = sidePerp(pp.a, 1);
        const l1 = Math.min(72, rayLen(pp.x, pp.y, pr.x, pr.y, 72)), l2 = Math.min(72, rayLen(pp.x, pp.y, -pr.x, -pr.y, 72));
        if (l1 + l2 < 70) return null;
        pts = [[pp.x + pr.x * l1, pp.y + pr.y * l1], [pp.x - pr.x * l2, pp.y - pr.y * l2]];
      } else {
        const L = polyLen(pp.P);
        pts = subPoly(pp.P, clamp(pp.s - 70, 20, L), clamp(pp.s + 70, 0, L - 25));
        if (polyLen(pts) < 70) return null;
      }
      return { role, x: pp.x, y: pp.y, pts, look: 'uncle', name: 'Uncle on his walk', range: T.walker.range, half: T.walker.half };
    }
    if (role === 'chair') {
      for (const side of R.next() < 0.5 ? [1, -1] : [-1, 1]) {
        const pr = sidePerp(pp.a, side);
        for (const off of [24, 30, 36, 42]) {
          const x = pp.x + pr.x * off, y = pp.y + pr.y * off;
          if (!walkable(x, y) || !clear(pp.x, pp.y, x, y)) continue;
          if (!walkable(x + pr.x * 6, y + pr.y * 6) && off < 30) continue;
          return { role, x, y, face: Math.atan2(pp.y - y, pp.x - x), look: 'uncle', name: 'Uncle on his plastic chair', range: T.chair.range, half: T.chair.half };
        }
      }
      return null;
    }
    if (role === 'window') {
      let best = null;
      try {
        N.world.queryStructures(pp.x - 72, pp.y - 72, pp.x + 72, pp.y + 72, (s) => {
          const r = bldgRect(s);
          if (!r) return;
          const e = rectEdge(r, pp.x, pp.y);
          const dd = hyp(e.x - pp.x, e.y - pp.y);
          if (dd < 16 || dd > 72) return;
          if (!clear(e.x + e.nx * 3, e.y + e.ny * 3, pp.x, pp.y)) return;
          if (!best || dd < best.dd) best = { e, dd, h: r.h };
        });
      } catch (er) { N.err('latehome.window', er); }
      if (!best) return null;
      const e = best.e;
      return { role, x: e.x + e.nx * 2, y: e.y + e.ny * 2, wx: e.x, wy: e.y, face: e.a, wh: Math.min(14, (best.h || 20) * 0.5 + 3), look: 'aunty', name: 'Aunty at her window', range: T.window.range, half: T.window.half };
    }
    if (role === 'watchman') {
      const L = polyLen(pp.P);
      const pts = subPoly(pp.P, clamp(pp.s - 95, 25, L), clamp(pp.s + 95, 0, L - 30));
      if (polyLen(pts) < 80) return null;
      return { role, x: pp.x, y: pp.y, pts, look: 'bahadur', name: 'Bahadur', range: T.watchman.range, half: T.watchman.half };
    }
    if (role === 'daddy') {
      const lp = laneLoop(pp.x, pp.y, R, C.center);
      if (!lp) return null;
      const pts = keepLeft(lp.pts, 4, lp.loop);
      const nanna = daddyN === 0;
      return { role, x: pts[0][0], y: pts[0][1], pts, loop: lp.loop, vtype: nanna ? 'family_chetak' : 'luna', look: nanna ? 'nanna' : 'uncle', name: nanna ? 'Nanna on the Chetak' : 'Reddy-garu on his Luna', speed: TUNE.role.daddy.speed * (nanna ? 1 : 0.85), range: T.daddy.range, half: T.daddy.half };
    }
    return null;
  }

  /* ================================================================ session state */
  let S = null;                 // the running session (one at a time)
  const G = { registered: [], offersOn: false, giverWrapped: false, css: false, frozenSeekers: false, seeAll: false, lastResults: null };

  /* ================================================================ entities */
  class Seeker extends N.Actor {
    constructor(spec, look) {
      const solid = spec.role === 'walker' || spec.role === 'chair' || spec.role === 'watchman' || spec.role === 'hunter';
      super({ kind: 'npc', x: spec.x, y: spec.y, r: 3.6, mass: 6, solid });
      this.fixed = true; this.lhSeeker = true;
      this.spec = spec; this.role = spec.role; this.look = look; this.name = spec.name;
      this.anim = { phase: Math.random() * TAU, speed: 0, run: false };
      this.angle = spec.face != null ? spec.face : 0;
      this.cone = { x: spec.x, y: spec.y, a: this.angle, range: spec.range, half: spec.half, on: true, poly: null, polyT: 0, key: '' };
      this.state = 'patrol'; this.s = 0; this.dir = 1; this.pauseT = 0; this.lookOff = 0; this.t = Math.random() * 10;
      this.inv = null; this.track = null; this.trackT = 0; this.noticeCD = 0; this.barkCD = 2 + Math.random() * 4;
      this.emoteT = 0; this.emote = null; this.dozeT = 0; this.dozeIn = 0; this.openT = 0; this.open = false;
      this.whistleT = 4 + Math.random() * 6; this.escort = null; this.home = { x: spec.x, y: spec.y };
      this.idle = spec.role === 'chair' ? 'sit' : undefined;
      this.vx = 0; this.vy = 0;
      // window aunty / daddy rider: drawn by the window / the vehicle, not as a standing person
      if (spec.role === 'window' || spec.role === 'daddy') this.hidden = true;
      this._fn = (ctx) => drawSeeker2D(ctx, this);
      this._sky = (ctx) => drawEmote2D(ctx, this);
    }
    update() { /* driven by the latehome sim */ }
    draw() {
      if (!this.hidden) N.render.queue('actors', this.y, this._fn);
      if (this.emoteT > 0 || this.role === 'window') N.render.queue('sky', 3, this._sky);
    }
  }
  class Kid extends N.Actor {
    constructor(k, x, y) {
      super({ kind: 'ped', x, y, r: 3.2, mass: 1, solid: false });
      this.noCollide = true; this.lhKid = true; this.k = k; this.look = k.look; this.name = k.nick;
      this.anim = { phase: Math.random() * TAU, speed: 0, run: false };
      this.angle = 0; this.vx = 0; this.vy = 0;
      this._fn = (ctx) => drawKid2D(ctx, this);
    }
    update() { /* driven by the latehome sim */ }
    draw() { if (!this.hidden) N.render.queue('actors', this.y, this._fn); }
  }
  class Dog extends N.Actor {
    constructor(d, i) {
      super({ kind: 'animal', x: d.x, y: d.y, r: 3, mass: 2, solid: false });
      this.noCollide = true; this.lhDog = true; this.species = 'dog'; this.type = 'dog'; this.state = 'nap';
      this.col = i % 2 ? ['#2a2420', '#5a4a3a'] : ['#b8864a', '#8a6030']; this.seed = 4100 + i * 77;
      this.angle = d.a || 0; this.barkT = 0; this.restT = 0; this.vx = 0; this.vy = 0; this.i = i;
      this._fn = (ctx) => drawDog2D(ctx, this);
    }
    update() { /* driven by the latehome sim */ }
    draw() { N.render.queue('actors', this.y, this._fn); }
  }

  /* ================================================================ vision */
  function coneUpdate(sk, t, dt) {
    const C = sk.cone, sp = sk.spec, R = TUNE.role;
    let x = sk.x, y = sk.y, a = sk.angle, on = true;
    const host = !S || S.isHost;
    if (sk.role === 'chair' || sk.role === 'window') {
      const ox = sk.role === 'window' ? sp.x : x, oy = sk.role === 'window' ? sp.y : y;
      if (host) {
        // a head turns slowly: a kid who darts across can get out of the gaze
        const goal = sk.track || sk.inv;
        let want = goal ? Math.atan2(goal.y - oy, goal.x - ox) : sp.face + (sk.role === 'chair' ? Math.sin((t + sk.t) * TAU / R.chair.period) * R.chair.sweep : Math.sin((t + sk.t) * 1.1) * R.window.sweep);
        if (sk.role === 'window') { const lim = Math.PI / 2 - 0.2; want = sp.face + clamp(adiff(sp.face, want), -lim, lim); }
        const rate = (TUNE.turn[sk.role] || 1.5) * (dt || 0.016);
        sk.angle += clamp(adiff(sk.angle, want), -rate, rate);
      }
      a = sk.angle;
      if (sk.role === 'window') { x = sp.x; y = sp.y; on = sk.open; } else on = sk.dozeT <= 0;
    } else if (sk.role === 'daddy') {
      const v = sk.vehicle;
      if (v) { x = v.x + Math.cos(v.angle) * 8; y = v.y + Math.sin(v.angle) * 8; a = v.angle; }
    } else {
      a = sk.angle + sk.lookOff;
    }
    if (sk.escort) on = false;
    C.x = x; C.y = y; C.a = a; C.on = on;
    // the clipped fan for drawing (12 Hz, or when it moved)
    const key = Math.round(x * 2) + ',' + Math.round(y * 2) + ',' + Math.round(a * 60);
    if (key !== C.key && (t - C.polyT > 0.08 || !C.poly)) {
      C.key = key; C.polyT = t;
      const n = clamp(Math.round(C.half * 2 / 0.075), 10, 28);
      const poly = C.poly && C.poly.length === (n + 1) * 2 + 2 ? C.poly : new Float32Array((n + 1) * 2 + 2);
      poly[0] = x; poly[1] = y;
      for (let i = 0; i <= n; i++) {
        const aa = a - C.half + (2 * C.half * i) / n, dx = Math.cos(aa), dy = Math.sin(aa);
        const L = rayLen(x, y, dx, dy, C.range);
        poly[2 + i * 2] = x + dx * L; poly[3 + i * 2] = y + dy * L;
      }
      C.poly = poly;
    }
  }
  function litAt(x, y) {
    if (!S) return false;
    for (const l of S.C.lamps) if (Math.abs(l.x - x) < TUNE.lampR && Math.abs(l.y - y) < TUNE.lampR && hyp(l.x - x, l.y - y) < TUNE.lampR) return true;
    return false;
  }
  /** how fast seeker sk fills kid k's meter (per second), 0 = not seen; -1 = "found" (walked into a hidden kid) */
  function sightRate(sk, k) {
    const C = sk.cone;
    if (!C.on || sk.escort || !k || k.ghost || k.done || k.level) return 0;
    const x = k.x, y = k.y;
    if (S && hyp(x - S.C.start.x, y - S.C.start.y) < TUNE.safeR && S.variant === 'sneak') return 0;
    const dx = x - C.x, dy = y - C.y, d = hyp(dx, dy);
    if (k.hide === 2) {
      if (d < TUNE.hiddenFoundR && sk.role !== 'window' && sk.role !== 'daddy' && clear(C.x, C.y, x, y)) return -1;
      return 0;
    }
    const crouch = k.hide === 1;
    const range = C.range * (crouch ? TUNE.meter.crouchRange : 1);
    if (d > range && !(d < TUNE.seeClose)) return 0;
    if (d >= TUNE.seeClose && Math.abs(adiff(C.a, Math.atan2(dy, dx))) > C.half) return 0;
    if (!clear(C.x, C.y, x, y)) return 0;
    const M = TUNE.meter;
    let r = lerp(M.near, M.far, clamp(d / C.range, 0, 1));
    if (litAt(x, y)) r *= M.lamp;
    if (crouch) r *= M.crouch;
    return r * (S ? S.meterMul : 1);
  }
  /** is (x, y) inside any active cone (with a margin)? for the AI kids' planning; returns the worst seeker */
  function threatAt(x, y, margin, exclude) {
    if (!S) return null;
    let worst = null, wd = Infinity;
    const list = S.seekers.concat(S.virtualSeekers || []);
    for (const sk of list) {
      if (sk === exclude || sk.escort) continue;
      const C = sk.cone;
      if (!C.on && !(sk.role === 'chair' && sk.dozeT < 0.8) && !(sk.role === 'window')) continue;
      const dx = x - C.x, dy = y - C.y, d = hyp(dx, dy);
      const range = C.range + margin;
      if (d > range) continue;
      const half = sk.role === 'window' || sk.role === 'chair' ? C.half + 0.15 : C.half + margin / 80;
      if (d > 14 && Math.abs(adiff(C.a, Math.atan2(dy, dx))) > half) continue;
      if (!clear(C.x, C.y, x, y)) continue;
      if (d < wd) { wd = d; worst = sk; }
    }
    return worst;
  }

  /* ================================================================ noise */
  function noise(x, y, r, kind, from) {
    if (!S) return;
    if (!S.isHost) return; // a guest's running rides on its 'lhpos' (r flag); whistles go as 'lhwh'
    applyNoise(x, y, r, kind, from);
  }
  function applyNoise(x, y, r, kind, from) {
    if (!S || G.frozenSeekers) return;
    for (const sk of S.seekers) {
      if (sk.escort || sk.role === 'daddy' && kind === 'step') continue;
      const d = hyp(sk.x - x, sk.y - y);
      if (d > r) continue;
      if (sk.track && kind !== 'whistle') continue;
      if (sk.role === 'chair' && sk.dozeT > 0) { if (kind === 'step') continue; sk.dozeT = 0; }
      if (sk.role === 'window' && !sk.open) { sk.open = true; sk.openT = TUNE.role.window.open; }
      sk.inv = { x, y, t: TUNE.noise.react + (kind === 'whistle' ? 1.5 : 0), kind };
      if (sk.state === 'patrol' || sk.state === 'return') sk.state = 'inv';
      if (sk.barkCD <= 0 && (kind === 'whistle' || kind === 'bark')) {
        sk.barkCD = 5;
        sayAt(sk, pick(kind === 'whistle' ? LINES.whistleHeard : LINES.dogHeard), sk.role === 'watchman' ? 'bahadur' : null);
      }
      emote(sk, '?', 1.4);
    }
    // the dog hears a whistle too (and does not bark at it); a bark wakes the other dog
    if (kind === 'bark') for (const g of S.dogs) if (g.state === 'nap' && hyp(g.x - x, g.y - y) < 90 && g.restT <= 0 && g !== from) wakeDog(g, x, y, false);
  }
  function emote(sk, e, secs) { sk.emote = e; sk.emoteT = secs || 1.4; if (S && S.isHost) netEvent({ k: 'em', i: sk.idx, e, s: secs || 1.4 }); }
  function sayAt(sk, text, speaker) {
    bark(sk.role === 'window' ? { x: sk.spec.x, y: sk.spec.y } : (sk.role === 'daddy' && sk.vehicle ? sk.vehicle : sk), text, speaker, 2.6);
    if (S && S.isHost && S.mode === 'party') netEvent({ k: 'say', i: sk.idx, t: text, sp: speaker || null });
  }

  /* ================================================================ seeker brains (host) */
  function stepOnFoot(sk, tx, ty, speed, dt) {
    const dx = tx - sk.x, dy = ty - sk.y, d = hyp(dx, dy);
    if (d < 1) { sk.vx = sk.vy = 0; sk.anim.speed = 0; return d; }
    const st = Math.min(d, speed * dt);
    let nx = sk.x + (dx / d) * st, ny = sk.y + (dy / d) * st;
    try { const c = N.world.collide(nx, ny, 3.2, 'walk'); if (!c.bad) { nx = c.x; ny = c.y; } } catch (e) { /* ignore */ }
    sk.vx = (nx - sk.x) / Math.max(1e-4, dt); sk.vy = (ny - sk.y) / Math.max(1e-4, dt);
    sk.x = nx; sk.y = ny;
    turn(sk, Math.atan2(dy, dx), dt, 7);
    sk.anim.speed = Math.min(1, speed / 45); sk.anim.run = speed > 55; sk.anim.phase += st * 0.26;
    return d;
  }
  function turn(sk, want, dt, k) {
    const mx = (TUNE.turn[sk.role] || 3) * dt;
    sk.angle += clamp(adiff(sk.angle, want) * Math.min(1, dt * k), -mx, mx);
  }
  function faceTo(sk, x, y, dt, rate) { turn(sk, Math.atan2(y - sk.y, x - sk.x), dt, rate || 5); }
  function routeStep(sk, dt, speed) {
    // ping-pong along spec.pts with a pause (and a look around) at each end
    const P = sk.spec.pts, L = sk.L || (sk.L = polyLen(P));
    if (sk.pauseT > 0) {
      sk.pauseT -= dt; sk.anim.speed = 0; sk.vx = sk.vy = 0;
      sk.lookOff = Math.sin(sk.pauseT * 2.2) * 0.9;
      if (sk.pauseT <= 0) { sk.lookOff = 0; sk.dir = -sk.dir; }
      return;
    }
    sk.s = clamp(sk.s + sk.dir * speed * dt, 0, L);
    const q = polyAt(P, sk.s);
    const px = sk.x, py = sk.y;
    sk.x = q.x; sk.y = q.y;
    sk.vx = (sk.x - px) / Math.max(1e-4, dt); sk.vy = (sk.y - py) / Math.max(1e-4, dt);
    const ha = sk.dir > 0 ? q.a : q.a + Math.PI;
    sk.angle += adiff(sk.angle, ha) * Math.min(1, dt * 6);
    sk.anim.speed = Math.min(1, speed / 45); sk.anim.run = false; sk.anim.phase += speed * dt * 0.26;
    if ((sk.dir > 0 && sk.s >= L - 0.01) || (sk.dir < 0 && sk.s <= 0.01)) sk.pauseT = sk.role === 'watchman' ? 1.6 : 2.4;
  }
  function backToRoute(sk, dt, speed) {
    const P = sk.spec.pts;
    if (!P) { const d = stepOnFoot(sk, sk.home.x, sk.home.y, speed, dt); if (d < 1.5) { sk.state = 'patrol'; if (sk.role === 'chair') { sk.idle = 'sit'; sk.angle = sk.spec.face; } } return; }
    const n = polyNearest(P, sk.x, sk.y);
    const q = polyAt(P, n.s);
    const d = stepOnFoot(sk, q.x, q.y, speed, dt);
    if (d < 1.5) { sk.s = n.s; sk.state = 'patrol'; }
  }
  function seekerStep(sk, dt, t) {
    const R = TUNE.role;
    sk.t += 0; sk.barkCD -= dt; sk.noticeCD -= dt;
    if (sk.emoteT > 0) sk.emoteT -= dt;
    if (sk.trackT > 0) { sk.trackT -= dt; if (sk.trackT <= 0) sk.track = null; }
    if (sk.inv) { sk.inv.t -= dt; if (sk.inv.t <= 0) { sk.inv = null; if (sk.state === 'inv') sk.state = 'return'; } }
    if (sk.escort) return; // catchStep walks him (and the kid by the ear)
    const role = sk.role;
    if (role === 'walker' || role === 'watchman') {
      const W = R[role];
      if (role === 'watchman') {
        sk.whistleT -= dt;
        if (sk.whistleT <= 0 && sk.state === 'patrol') { sk.whistleT = W.whistleEvery * (0.8 + Math.random() * 0.4); sk.pauseT = Math.max(sk.pauseT, 1.6); sfx('gurkha', { x: sk.x, y: sk.y }); if (Math.random() < 0.6) sayAt(sk, pick(LINES.watchman), 'bahadur'); }
      } else if (sk.barkCD <= 0 && sk.state === 'patrol' && Math.random() < dt * 0.04) { sk.barkCD = 12; sayAt(sk, pick(LINES.walker)); }
      const goal = sk.track || sk.inv;
      if (goal) {
        const d = hyp(goal.x - sk.x, goal.y - sk.y);
        if (d > 16) stepOnFoot(sk, goal.x, goal.y, (sk.track ? 0.6 : 1.1) * W.walk, dt);
        else { sk.anim.speed = 0; sk.vx = sk.vy = 0; faceTo(sk, goal.x, goal.y, dt); }
        sk.lookOff = sk.track ? 0 : Math.sin(t * 2.6) * 0.5;
        return;
      }
      if (sk.state === 'return' || sk.state === 'inv') { sk.lookOff = 0; backToRoute(sk, dt, W.walk); return; }
      routeStep(sk, dt, W.walk);
      if (role === 'watchman' && sk.pauseT <= 0) sk.lookOff = Math.sin(t * 1.8 + sk.idx) * W.sweep;
      return;
    }
    if (role === 'chair') {
      if (sk.state === 'return') { backToRoute(sk, dt, 30); return; }
      sk.anim.speed = 0; sk.vx = sk.vy = 0;
      if (sk.dozeT > 0) {
        sk.dozeT -= dt;
        if (sk.emoteT <= 0) { sk.emote = 'z'; sk.emoteT = 1.2; }
        if (sk.dozeT <= 0) { sk.dozeIn = R.chair.doze[0] + Math.random() * (R.chair.doze[1] - R.chair.doze[0]); sk.emoteT = 0; }
      } else if (!sk.track && !sk.inv) {
        sk.dozeIn -= dt;
        if (sk.dozeIn <= 0) { sk.dozeT = R.chair.dozeT; if (sk.barkCD <= 0) { sk.barkCD = 8; sayAt(sk, pick(LINES.sleepy)); } }
      }
      return;
    }
    if (role === 'window') {
      if (sk.track || sk.inv) { sk.open = true; sk.openT = Math.max(sk.openT, 1.5); }
      sk.openT -= dt;
      if (sk.openT <= 0) { sk.open = !sk.open; sk.openT = sk.open ? R.window.open : R.window.shut; if (sk.open) sfx('door_creak', { x: sk.spec.x, y: sk.spec.y, vol: 0.4 }); }
      return;
    }
    if (role === 'daddy') { daddyStep(sk, dt); return; }
    if (role === 'hunter') { hunterStep(sk, dt, t); return; }
  }
  /* the daddies ride their loop kinematically (vehicles.js draws them, headlight and all): along the polyline at
   * their speed, slower round corners, stopped while a kid is right in front (never into anyone) or while the
   * headlight is on a kid ("Who's that?") */
  function daddyStep(sk, dt) {
    const v = sk.vehicle, P = sk.spec.pts;
    if (!v || !v.alive || !P) return;
    const L = sk.L || (sk.L = polyLen(P) + (sk.spec.loop ? hyp(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) : 0));
    const Pl = sk.Pl || (sk.Pl = sk.spec.loop ? P.concat([P[0]]) : P);
    let want = sk.spec.speed;
    // corner ahead: slow down
    const ahead = polyAt(Pl, sk.spec.loop ? (sk.s + sk.dir * 18 + L) % L : clamp(sk.s + sk.dir * 18, 0, L));
    const turn = Math.abs(adiff(v.angle, sk.dir > 0 ? ahead.a : ahead.a + Math.PI));
    if (turn > 0.5) want = Math.min(want, TUNE.role.daddy.corner);
    if (sk.track) want = 0;
    // somebody in front: stop
    const ca = Math.cos(v.angle), sa = Math.sin(v.angle);
    const blockers = [N.player].concat(S.kids.map((k) => k.ent).filter(Boolean));
    for (const e of blockers) {
      if (!e || e.hidden) continue;
      const dx = e.x - v.x, dy = e.y - v.y, fwd = dx * ca + dy * sa, side = Math.abs(-dx * sa + dy * ca);
      if ((fwd > 0 && fwd < 30 && side < 10) || hyp(dx, dy) < 12) { want = 0; break; }
    }
    sk.spd = lerp(sk.spd || 0, want, Math.min(1, dt * (want < (sk.spd || 0) ? 6 : 2)));
    if (sk.pauseT > 0) { sk.pauseT -= dt; sk.spd = 0; if (sk.pauseT <= 0) sk.dir = -sk.dir; }
    if (sk.spec.loop) sk.s = (sk.s + sk.spd * dt + L) % L;
    else {
      sk.s = clamp(sk.s + sk.dir * sk.spd * dt, 0, L);
      if (sk.pauseT <= 0 && ((sk.dir > 0 && sk.s >= L - 0.01) || (sk.dir < 0 && sk.s <= 0.01))) sk.pauseT = 1.4;
    }
    const q = polyAt(Pl, sk.s);
    const ha = sk.dir > 0 ? q.a : q.a + Math.PI;
    v.x = q.x; v.y = q.y;
    v.angle += adiff(v.angle, ha) * Math.min(1, dt * (sk.pauseT > 0 ? 2.2 : 5));
    v.vx = 0; v.vy = 0; v.av = 0; v.speed = sk.spd; v.okX = null;
    if (v.ctl) { v.ctl.throttle = 0; v.ctl.brake = sk.spd < 2; v.ctl.steer = 0; }
    sk.x = v.x; sk.y = v.y; sk.angle = v.angle;
  }
  function daddyCtl(v) { if (v.ctl) { v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.handbrake = false; } }
  /* AI Nanna with the big torch (Daddy round): walks his beat, goes to sounds, chases what he sees and catches
   * by proximity + facing */
  function hunterStep(sk, dt, t) {
    const R = TUNE.role.hunter;
    sk.lookOff = 0;
    if (sk.track) {
      const d = stepOnFoot(sk, sk.track.x, sk.track.y, R.run, dt);
      if (d < 3) sk.track = null;
      return;
    }
    const goal = sk.inv;
    if (goal) {
      const d = stepOnFoot(sk, goal.x, goal.y, R.walk * 1.2, dt);
      if (d < 6) { sk.anim.speed = 0; sk.lookOff = Math.sin(t * 2.4) * 0.8; }
      return;
    }
    const beat = S.C.beat.length ? S.C.beat : [[S.C.start.x, S.C.start.y]];
    if (!sk.goal || hyp(sk.goal[0] - sk.x, sk.goal[1] - sk.y) < 6) { sk.goal = beat[Math.floor(Math.random() * beat.length)]; sk.pauseT = 1.2; }
    if (sk.pauseT > 0) { sk.pauseT -= dt; sk.anim.speed = 0; sk.vx = sk.vy = 0; sk.lookOff = Math.sin(sk.pauseT * 3) * 0.9; return; }
    stepOnFoot(sk, sk.goal[0], sk.goal[1], R.walk, dt);
    sk.lookOff = Math.sin(t * 1.5) * 0.35;
  }

  /* ================================================================ caught: walked home by the ear */
  function elapsed() { return S ? Math.max(0, (S.now() - S.t0) / 1000) : 0; }
  function catchLine(k) {
    const L = LINES.caught;
    return pick(k.npc === 'immu' ? L.immu : k.npc === 'ayesha' ? L.ayesha : (k.isMe && S.mode === 'solo') ? L.chinnu : L.other);
  }
  function spawnEscort(k) {
    // Amma (or Immu's Ammi / Ayesha's mother) comes out to fetch the kid
    const id = k.npc === 'immu' ? 'ammi' : 'amma';
    const look = npcLook(id, { kind: 'aunty', skin: '#a0683f', hair: '#1a1412', saree: '#3b7d4f', border: '#7a1f2b', cast: 1 });
    const d = S.C.doors[k.uid];
    const a = Math.atan2(d.y - k.y, d.x - k.x);
    let x = k.x + Math.cos(a) * 30, y = k.y + Math.sin(a) * 30;
    if (!walkable(x, y)) { const f = free(x, y, 20); if (f) { x = f.x; y = f.y; } else { x = k.x + 6; y = k.y; } }
    const e = new Seeker({ role: 'escort', x, y, range: 1, half: 0.1, name: 'Amma' }, look);
    e.isEscort = true; e.speaker = id;
    N.entities.add(e);
    S.extraEnts.push(e);
    return e;
  }
  function startCatch(k, by, why) {
    if (!S || k.done || k.seq) return;
    k.meter = 1;
    k.hide = 0;
    const solo = S.mode === 'solo' || S.isHost;
    let esc = null;
    if (S.variant === 'sneak' && by && solo && !by.escort && (by.role === 'walker' || by.role === 'chair' || by.role === 'watchman')) esc = by;
    if (S.variant === 'sneak' && !esc && (k.isMe || (S.isHost && k.isAI))) esc = spawnEscort(k);
    k.seq = { phase: esc ? 'approach' : 'fade', t: 0, esc, by: by ? by.role : why || 'amma', line: catchLine(k) };
    if (esc) { esc.escort = k; esc.idle = undefined; esc.state = 'escort'; }
    k.caughtBy = by ? by.name : why === 'time' ? 'Amma' : 'Daddy';
    N.emit('latehome:caught', { uid: k.uid, by: k.caughtBy });
    if (k.isMe) {
      const p = N.player;
      p.hidden = false; p.controlsLocked = true; p.vx = p.vy = 0;
      sfx('busted', { ui: true });
      banner(LINES.pakda, why === 'time' ? LINES.timeUp : k.caughtBy + ' saw you!', 2400, { kind: 'busted' });
      if (by && esc === by) sayAt(by, k.seq.line, by.role === 'watchman' ? 'bahadur' : null);
      else if (esc) bark(esc, k.seq.line, esc.speaker || null, 2.6);
      netState(k);
    } else if (k.ent) {
      toast(k.nick + ' got caught' + (by ? ' by ' + by.name : '') + '!', 2200);
      if (by && esc === by) sayAt(by, k.seq.line, by.role === 'watchman' ? 'bahadur' : null);
    }
  }
  function catchStep(k, dt) {
    const q = k.seq, e = k.isMe ? N.player : k.ent;
    if (!q) return;
    q.t += dt;
    const esc = q.esc;
    const R = N.render;
    if (q.phase === 'approach') {
      if (!esc || !esc.alive) { q.phase = 'fade'; q.t = 0; return; }
      esc.idle = undefined;
      const d = stepOnFoot(esc, e.x, e.y, 62, dt);
      if (d < 6 || q.t > TUNE.catch.approach) {
        if (d >= 6) { const a = Math.atan2(esc.y - e.y, esc.x - e.x); esc.x = e.x + Math.cos(a) * 5; esc.y = e.y + Math.sin(a) * 5; }
        q.phase = 'ear'; q.t = 0;
        bark(e, pick(LINES.ear), k.isMe ? 'you' : (k.npc || null), 2.2);
        sfx('bump', { x: e.x, y: e.y, vol: 0.4 });
      }
      return;
    }
    if (q.phase === 'ear') {
      if (esc) faceTo(esc, e.x, e.y, dt, 8);
      if (q.t > 0.9) { q.phase = 'walk'; q.t = 0; if (esc) bark(esc, pick(LINES.escort), esc.speaker || (esc.role === 'watchman' ? 'bahadur' : null), 2.4); }
      return;
    }
    if (q.phase === 'walk') {
      const d = S.C.doors[k.uid];
      if (esc) {
        stepOnFoot(esc, d.x, d.y, 30, dt);
        // the kid comes along by the ear, half a step behind
        const a = esc.angle, tx = esc.x - Math.cos(a) * 4 + Math.cos(a + Math.PI / 2) * 3, ty = esc.y - Math.sin(a) * 4 + Math.sin(a + Math.PI / 2) * 3;
        moveEnt(e, tx, ty, 40, dt);
        e.angle = a; if (e.facing != null || e === N.player) e.facing = a;
        k.x = e.x; k.y = e.y;
      }
      if (q.t > TUNE.catch.escort || !esc) { q.phase = 'fade'; q.t = 0; }
      return;
    }
    if (q.phase === 'fade') {
      if (k.isMe) R.fx.fade = clamp(q.t / TUNE.catch.fade, 0, 1);
      if (q.t >= TUNE.catch.fade) {
        const d = S.C.doors[k.uid];
        if (k.isMe) { try { N.player.teleport(d.x, d.y, { ground: true }); } catch (er) { N.player.x = d.x; N.player.y = d.y; } }
        else if (e) { e.x = d.x; e.y = d.y; e.hidden = true; }
        if (esc) releaseEscort(esc);
        q.phase = 'in'; q.t = 0;
      }
      return;
    }
    if (q.phase === 'in') {
      if (k.isMe) R.fx.fade = clamp(1 - q.t / TUNE.catch.fade, 0, 1);
      if (q.t >= TUNE.catch.fade) {
        if (k.isMe) R.fx.fade = 0;
        k.seq = null;
        finishKid(k, 'caught');
        if (k.isMe && S.mode === 'solo' && S.variant === 'sneak') { try { if (N.dialogue && N.dialogue.say) N.dialogue.say('amma', subst(pick(LINES.ammaCaught)), { mood: 'angry' }); } catch (er) { /* ignore */ } }
      }
    }
  }
  function moveEnt(e, tx, ty, speed, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = hyp(dx, dy);
    if (d < 0.5) { if (e.anim) e.anim.speed = 0; return; }
    const st = Math.min(d, speed * dt);
    let nx = e.x + dx / d * st, ny = e.y + dy / d * st;
    try { const c = N.world.collide(nx, ny, 3, 'walk'); if (!c.bad) { nx = c.x; ny = c.y; } } catch (er) { /* ignore */ }
    e.vx = (nx - e.x) / Math.max(1e-4, dt); e.vy = (ny - e.y) / Math.max(1e-4, dt);
    e.x = nx; e.y = ny;
    if (e.anim) { e.anim.speed = Math.min(1, speed / 45); e.anim.phase += st * 0.26; }
  }
  function releaseEscort(esc) {
    esc.escort = null;
    if (esc.isEscort) { esc.alive = false; try { N.entities.remove(esc); } catch (e) { /* ignore */ } return; }
    // back to his post (a hop when nobody is looking)
    esc.state = 'return'; esc.track = null; esc.inv = null;
    const home = esc.spec.pts ? polyAt(esc.spec.pts, esc.s) : esc.home;
    if (!N.render.inView(esc.x, esc.y, 40) && !N.render.inView(home.x, home.y, 40)) { esc.x = home.x; esc.y = home.y; esc.state = 'patrol'; if (esc.role === 'chair') { esc.idle = 'sit'; esc.angle = esc.spec.face; } }
  }

  /* ================================================================ finishing */
  function scoreOf(k) {
    const T = TUNE.score;
    if (S.variant === 'daddy') return Math.round((k.pts || 0));
    if (k.done !== 'home') return Math.round(k.coll * 40);
    // getting home always beats getting caught (a caught kid keeps only coll·40)
    return Math.max(T.floor + T.perItem * k.coll, Math.round(T.base - T.perSec * k.t - T.perSpot * k.spots + T.perItem * k.coll));
  }
  function starsOf(k) {
    if (k.done !== 'home') return 0;
    if (k.spots === 0 && k.t <= S.C.par) return 3;
    if (k.spots <= 1) return 2;
    return 1;
  }
  function finishKid(k, how, tOver) {
    if (!S || k.done) return;
    k.done = how; k.t = tOver != null ? tOver : +elapsed().toFixed(1); k.hide = 0; k.seenBy = null;
    if (S.variant === 'daddy') {
      const ri = S.round || 0;
      if (how === 'home') k.pts = (k.pts || 0) + 100 + Math.max(0, Math.round(TUNE.daddy.time - k.t));
      k.rounds = k.rounds || []; k.rounds[ri] = how;
    }
    k.score = scoreOf(k); k.stars = starsOf(k);
    k.ghostIn = TUNE.ghostAfter;
    N.emit(how === 'home' ? 'latehome:home' : 'latehome:done', { uid: k.uid, time: k.t, spots: k.spots, how });
    if (k.isMe) {
      const p = N.player;
      p.controlsLocked = false;
      if (how === 'home') {
        sfx('door_creak', { ui: true }); sfx('objective', { ui: true });
        const nobody = k.spots === 0;
        banner(nobody ? LINES.nobody : LINES.home, fmtT(k.t) + (nobody ? ' · not one uncle saw you' : ' · spotted ' + k.spots + (k.spots === 1 ? ' time' : ' times')) + (k.coll ? ' · +' + k.coll + ' found' : ''), 3000, { kind: 'pass' });
        p.hidden = true;
        if (S.mode === 'solo' && S.variant === 'sneak') {
          setTimeout(() => { try { if (N.dialogue && N.dialogue.say && S && S.me === k) N.dialogue.say('amma', subst(pick(nobody ? LINES.ammaWin : LINES.ammaSeen)), { mood: nobody ? 'happy' : 'neutral' }); } catch (er) { /* ignore */ } }, 900);
        }
      }
      netState(k);
      if (S.partyCtx && S.variant === 'sneak') k.reportIn = 1.6;
    } else if (k.ent && how === 'home') {
      k.ent.hidden = true;
      toast(k.nick + ' slipped in' + (k.spots ? '' : ' — nobody saw!'), 2000);
    }
    if (S.partyCtx && S.isHost && k.isAI && S.variant === 'sneak' && !k.reported) { k.reported = true; S.repQ.push([k.uid, partyResult(k), false]); }
    if (S.isHost) checkAllDone();
  }
  /** a kid's result in party.js's shape ({score, timeMs, caught, note} + extras) */
  function partyResult(k) {
    if (S.variant === 'daddy') return { score: k.pts | 0, caught: false, catches: k.catches | 0, note: (k.catches | 0) + (k.catches === 1 ? ' catch' : ' catches') + ' as Daddy' };
    const home = k.done === 'home';
    const r = { score: scoreOf(k), caught: !home, spots: k.spots | 0, coll: k.coll | 0, stars: starsOf(k),
      note: home ? (k.spots === 0 ? 'nobody saw!' : 'seen ' + k.spots + (k.spots === 1 ? ' time' : ' times')) + (k.coll ? ' · found ' + k.coll : '') : 'walked home by the ear' };
    if (home) r.timeMs = Math.round(k.t * 1000);
    return r;
  }
  function reportMine() {
    const k = S && S.me;
    if (!k || S.reported || !S.partyCtx) return;
    if (S.variant === 'daddy' && S.phase !== 'done') return; // the totals go in after the last round
    S.reported = true; k.reportIn = 0;
    S.repQ.push([k.uid, partyResult(k), true]);
  }
  /* party.js may finish the session (and call handle.end) from inside report(): send reports only at the very end
   * of a sim step, and stop touching the session as soon as it is gone */
  function flushReports() {
    if (!S || !S.repQ.length) return;
    const ctx = S.ctx, q = S.repQ.splice(0);
    for (const [uid, res, mine] of q) {
      try { if (mine) { if (ctx.report) ctx.report(res); } else if (ctx.ai && typeof ctx.ai.report === 'function') ctx.ai.report(uid, res); } catch (e) { N.err('latehome.report', e); }
      if (!S) return;
    }
  }
  function resultOf(k) {
    return { uid: k.uid, nick: k.nick, home: k.done === 'home', how: k.done || 'out', time: k.t, spots: k.spots, coll: k.coll, score: k.score != null ? k.score : scoreOf(k), stars: k.stars || 0, catches: k.catches || 0, pts: k.pts || 0, ai: !!k.isAI };
  }
  function checkAllDone() {
    if (!S || S.phase !== 'play') return;
    const sneakers = S.kids.filter((k) => k.role !== 'daddy');
    if (sneakers.every((k) => k.done)) endRound('all');
  }

  /* ================================================================ dogs (host) */
  function wakeDog(g, x, y, loud) {
    g.state = 'bark'; g.barkT = TUNE.dog.barkSecs; g.angle = Math.atan2(y - g.y, x - g.x); g.woof = 0;
    sfx('dog_bark', { x: g.x, y: g.y });
    bark(g, pick(LINES.dog), null, 1.8);
    if (S.isHost) netEvent({ k: 'dog', i: g.i });
    if (loud !== false) applyNoise(g.x, g.y, TUNE.noise.bark, 'bark', g);
    if (S.variant === 'daddy') daddyHint(g.x, g.y, 'The dog is barking!');
  }
  function dogStep(g, dt) {
    if (g.state === 'bark') {
      g.barkT -= dt; g.woof -= dt;
      if (g.woof <= 0) { g.woof = 0.75; sfx('dog_bark', { x: g.x, y: g.y, vol: 0.8 }); }
      if (g.barkT <= 0) { g.state = 'nap'; g.restT = TUNE.dog.rest; }
      return;
    }
    if (g.restT > 0) { g.restT -= dt; return; }
    for (const k of S.kids) {
      if (k.done || k.ghost || k.role === 'daddy' || k.hide === 2 || k.level) continue;
      const d = hyp(k.x - g.x, k.y - g.y);
      const r = k.run ? TUNE.dog.wakeRun : k.hide === 1 ? 0 : TUNE.dog.wakeWalk;
      if (d < r) { wakeDog(g, k.x, k.y, true); break; }
    }
  }

  /* ================================================================ AI kids (host): sneak home, hide from cones */
  /** the nearest hiding spot that does not lead towards the uncle who is the trouble (and is not under anyone's nose) */
  function safeSpot(x, y, r, threat) {
    let best = null, bd = r;
    for (const h of S.C.hides) {
      const d = hyp(h.x - x, h.y - y);
      if (d >= bd) continue;
      if (!S.seekers.every((sk) => hyp(sk.x - h.x, sk.y - h.y) > 24)) continue;
      if (threat) { const tx = threat.cone ? threat.cone.x : threat.x, ty = threat.cone ? threat.cone.y : threat.y; if (hyp(h.x - tx, h.y - ty) < hyp(x - tx, y - ty) - 4) continue; }
      bd = d; best = h;
    }
    return best;
  }
  function aiKidStep(k, dt, t) {
    const e = k.ent;
    if (!e || k.done) return;
    if (k.seq) { catchStep(k, dt); return; }
    if (S.phase !== 'play') { e.anim.speed = 0; return; }
    k.thinkT = (k.thinkT || 0) - dt;
    if (k.thinkT <= 0) { k.thinkT = 0.2; aiThink(k, t); }
    const P = k.path;
    let tx = null, ty = null, speed = TUNE.kidWalk * (k.npc === 'ayesha' ? 1.04 : 0.98);
    if (k.mode === 'hide' && k.spot) {
      const d = hyp(k.spot.x - e.x, k.spot.y - e.y);
      if (d < 2.5) { k.hide = 2; e.anim.speed = 0; e.vx = e.vy = 0; }
      else { tx = k.spot.x; ty = k.spot.y; speed = TUNE.kidRun * 0.8; k.hide = 0; }
    } else if (k.mode === 'wait') {
      k.hide = 1; e.anim.speed = 0; e.vx = e.vy = 0;
    } else if (k.mode === 'detour' && k.det) {
      tx = k.det.x; ty = k.det.y; speed = TUNE.kidWalk; k.hide = 0;
      if (hyp(tx - e.x, ty - e.y) < 3) { k.path = walkPath(e.x, e.y, S.C.doors[k.uid].x, S.C.doors[k.uid].y); k.mode = 'go'; k.det = null; }
    } else if (k.mode === 'creep') {
      // crouched and slow past a gaze that never quite leaves the way
      const n = polyNearest(P, e.x, e.y);
      k.ps = n.s;
      const q = polyAt(P, Math.min(polyLen(P), n.s + 12));
      tx = q.x; ty = q.y; speed = TUNE.kidWalk * TUNE.creepMul; k.hide = 1;
      k.creepT = (k.creepT || 0) - dt; if (k.creepT <= 0) k.mode = 'go';
    } else if (k.mode === 'flee' && k.flee) {
      // out of the cone sideways (the quickest way out of a fan), running
      tx = k.flee.x; ty = k.flee.y; speed = TUNE.kidRun * 0.9; k.hide = 0;
      if (hyp(tx - e.x, ty - e.y) < 3) { k.mode = 'wait'; k.flee = null; }
    } else {
      k.hide = 0;
      // the next waypoint along the path (a little ahead of the nearest point)
      const n = polyNearest(P, e.x, e.y);
      k.ps = n.s;
      const q = polyAt(P, Math.min(polyLen(P), n.s + 14));
      tx = q.x; ty = q.y;
      if (k.dash) speed = TUNE.kidRun;
    }
    if (tx != null) {
      const px = e.x, py = e.y;
      moveEnt(e, tx, ty, speed, dt);
      const mv = hyp(e.x - px, e.y - py);
      if (mv > 0.01) e.angle += adiff(e.angle, Math.atan2(e.y - py, e.x - px)) * Math.min(1, dt * 10);
      e.anim.run = speed > 60;
      k.run = speed > 60 && mv > 0.2;
      if (k.run) { k.noiseT = (k.noiseT || 0) - dt; if (k.noiseT <= 0) { k.noiseT = 0.45; applyNoise(e.x, e.y, TUNE.noise.run, 'step', e); } }
    } else k.run = false;
    k.x = e.x; k.y = e.y; k.a = e.angle;
    const d = S.C.doors[k.uid];
    if (hyp(d.x - e.x, d.y - e.y) < TUNE.doorR) finishKid(k, 'home');
  }
  /** a way round: a clear, unwatched point 40-80 u away that brings (x, y) closer to the door */
  function detour(x, y, door, margin) {
    const base = Math.atan2(door.y - y, door.x - x), d0 = hyp(door.x - x, door.y - y);
    let best = null, bs = Infinity;
    for (let i = 0; i < 14; i++) {
      const a = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.28;
      for (const r of [44, 62, 80]) {
        const L = rayLen(x, y, Math.cos(a), Math.sin(a), r);
        if (L < r - 6) continue;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (!walkable(px, py) || threatAt(px, py, margin || 10)) continue;
        const sc = hyp(door.x - px, door.y - py) - d0 * 0.15 + Math.abs(adiff(base, a)) * 12;
        if (sc < bs) { bs = sc; best = { x: px, y: py }; }
      }
    }
    return best;
  }
  /** a point out of seeker sk's cone, sideways from where (x, y) is in it */
  function fleeFrom(sk, x, y) {
    // close to the venue: straight back to it (nobody can see you there)
    if (S && S.variant === 'sneak') { const st = S.C.start, ds = hyp(st.x - x, st.y - y); if (ds < 80 && ds > 6 && clear(x, y, st.x, st.y)) return { x: st.x, y: st.y }; }
    // away from him and out to the side his head turns slowest to (a diagonal), and far enough to matter
    const C = sk.cone, a = Math.atan2(y - C.y, x - C.x);
    const side = adiff(C.a, a) >= 0 ? 1 : -1;
    for (const off of [side * 0.9, -side * 0.9, side * 1.5, 0]) {
      const fa = a + off, d = rayLen(x, y, Math.cos(fa), Math.sin(fa), 60);
      if (d > 22) return { x: x + Math.cos(fa) * d, y: y + Math.sin(fa) * d };
    }
    const d = rayLen(x, y, Math.cos(a), Math.sin(a), 40);
    return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d };
  }
  function aiThink(k, t) {
    const e = k.ent, P = k.path;
    const L = polyLen(P);
    const n = polyNearest(P, e.x, e.y);
    k.ps = n.s;
    const here = threatAt(e.x, e.y, 8);
    const ahead = polyAt(P, Math.min(L, n.s + 30));
    const thr = threatAt(ahead.x, ahead.y, 20) || threatAt(e.x, e.y, 18);
    if (k.mode === 'flee' && k.flee && hyp(k.flee.x - e.x, k.flee.y - e.y) > 3 && !(k.seenBy && k.meter > 0.5)) return;
    // seen right now: get out of sight (a spot close by, else sideways out of the cone)
    if (k.seenBy && k.mode !== 'hide') {
      const spot = safeSpot(e.x, e.y, 26, k.seenBy);
      if (spot) { k.mode = 'hide'; k.spot = spot; k.hideT = 0; k.safeT = 0; return; }
      k.mode = 'flee'; k.flee = fleeFrom(k.seenBy, e.x, e.y); k.waitT = 0; return;
    }
    if (k.mode === 'hide' && k.hide === 2) {
      k.safeT = thr ? 0 : (k.safeT || 0) + 0.2;
      k.hideT = (k.hideT || 0) + 0.2;
      if (k.safeT >= 1.0 || k.hideT > 7) { k.mode = k.safeT >= 1.0 ? 'go' : 'creep'; k.creepT = 4; k.spot = null; k.hideT = 0; k.safeT = 0; }
      return;
    }
    const dd = S.C.doors[k.uid];
    if (hyp(dd.x - e.x, dd.y - e.y) < 34 && !here) { k.mode = 'go'; k.dash = true; return; }
    if (k.mode === 'creep' && k.creepT > 0 && !here) return;
    if (k.mode === 'detour' && k.det && !here && !threatAt(k.det.x, k.det.y, 6)) return;
    if (thr) {
      const spot = safeSpot(e.x, e.y, here ? 30 : 42, here || thr);
      if (spot) { k.mode = 'hide'; k.spot = spot; k.hideT = 0; k.safeT = 0; return; }
      if (here) { k.mode = 'flee'; k.flee = fleeFrom(here, e.x, e.y); k.waitT = 0; return; }
      k.mode = 'wait'; k.waitT = (k.waitT || 0) + 0.2;
      if (k.waitT > 3) {
        const dt2 = detour(e.x, e.y, S.C.doors[k.uid], 12);
        if (dt2) { k.mode = 'detour'; k.det = dt2; k.waitT = 0; } else if (k.waitT > 5) { k.mode = 'creep'; k.creepT = 4; k.waitT = 0; }
      }
      return;
    }
    if (k.mode !== 'go') { k.mode = 'go'; k.waitT = 0; }
    // a clear stretch with nobody near: dash (running is loud: only far from everybody)
    let near = Infinity;
    for (const sk of S.seekers) near = Math.min(near, hyp(sk.x - e.x, sk.y - e.y));
    for (const g of S.dogs) near = Math.min(near, hyp(g.x - e.x, g.y - e.y) + 40);
    k.dash = near > 150 && hyp(S.C.doors[k.uid].x - e.x, S.C.doors[k.uid].y - e.y) > 40;
  }

  /* ================================================================ sightings (local kid on every phone, AI kids on the host) */
  function sightStep(k, dt) {
    if (k.done || k.seq || k.ghost || k.role === 'daddy') return;
    if (k.isMe && G.unseen) { k.seenBy = null; return; } // tests: set up a scene without being spotted
    let best = 0, by = null;
    for (const sk of S.seekers) {
      const r = sightRate(sk, k);
      if (r === -1) { // walked right into a hidden kid
        if (!k.foundCD || k.foundCD <= 0) { k.foundCD = 3; k.meter = Math.min(1, k.meter + 0.55); best = Math.max(best, 0.01); by = sk; sayAt(sk, pick(LINES.trip), sk.role === 'watchman' ? 'bahadur' : null); }
        continue;
      }
      if (r > best) { best = r; by = sk; }
    }
    if (k.foundCD > 0) k.foundCD -= dt;
    const t = elapsed();
    if (S.variant === 'daddy') {
      // Daddy rounds have no meter: a sighting sends Nanna's torch that way (the aunty shouts it out); only Daddy's
      // hand on your shoulder (proximity + facing) catches you
      k.meter = 0;
      if (best > 0 && by) {
        if (t - (k.lastSeen != null ? k.lastSeen : -99) > TUNE.meter.newSpotGap) { k.spots++; if (S.isHost) notice(by, k); else netSend('seen', { u: k.uid, i: by.idx, x: Math.round(k.x), y: Math.round(k.y) }); }
        else if (S.isHost && by.role === 'hunter') { by.track = { x: k.x, y: k.y }; by.trackT = 1.4; }
        k.lastSeen = t; k.seenBy = by;
      } else k.seenBy = null;
      return;
    }
    if (best > 0 && by) {
      if (t - (k.lastSeen != null ? k.lastSeen : -99) > TUNE.meter.newSpotGap) {
        k.spots++;
        N.emit('latehome:spotted', { uid: k.uid, by: by.name });
        if (S.isHost) notice(by, k);
        else netSend('seen', { u: k.uid, i: by.idx, x: Math.round(k.x), y: Math.round(k.y) });
        if (k.isMe) { sfx('wanted_up', { ui: true, vol: 0.5 }); netState(k); }
      } else if (S.isHost) { by.track = { x: k.x, y: k.y }; by.trackT = 1.4; }
      k.lastSeen = t; k.seenBy = by;
      k.seenT = (k.seenT || 0) + dt;
      k.meter = Math.min(1, k.meter + best * dt * lerp(0.3, 1, clamp(k.seenT / 1.1, 0, 1)));
      if (k.meter >= 1) startCatch(k, by, 'seen');
    } else {
      k.seenBy = null;
      if (t - (k.lastSeen != null ? k.lastSeen : -99) > TUNE.meter.hold) { k.seenT = 0; k.meter = Math.max(0, k.meter - TUNE.meter.decay * (k.hide === 2 ? 2 : 1) * dt); } // out of sight, out of mind (faster when hidden)
    }
  }
  function notice(sk, k) {
    sk.track = { x: k.x, y: k.y }; sk.trackT = 1.6;
    if (sk.role === 'chair' && sk.dozeT > 0) sk.dozeT = 0;
    if (sk.role === 'window') { sk.open = true; sk.openT = Math.max(sk.openT, 2.5); }
    if (sk.state === 'patrol' || sk.state === 'return') sk.state = 'inv';
    sk.inv = { x: k.x, y: k.y, t: 4, kind: 'seen' };
    emote(sk, '!', 1.6);
    if (sk.noticeCD <= 0) { sk.noticeCD = 4; sayAt(sk, pick(LINES.notice[sk.role] || LINES.notice.walker), sk.role === 'watchman' ? 'bahadur' : null); }
    if (S.variant === 'daddy' && sk.role === 'window') daddyHint(k.x, k.y, 'Aunty: "' + (sk.daddyName || 'Sreenivas-garu') + '! He went THAT way!"');
  }

  /* ================================================================ the session */
  const AI_FRIENDS = ['immu', 'ayesha'];
  function soloCtx(opts) {
    const me = { uid: 'me', nick: (N.player && (N.player.nick || N.player.name)) || 'Chinnu', isMe: true, isAI: false, look: N.player && N.player.look };
    const players = [me];
    if (opts.friends !== false) for (const id of AI_FRIENDS) players.push({ uid: 'ai:' + id, nick: id === 'immu' ? 'Immu' : 'Ayesha', isMe: false, isAI: true, npc: id, look: npcLook(id, FB[id]) });
    const reports = [];
    const ctx = {
      mode: 'solo', id: opts.variant === 'daddy' ? 'latehome_daddy' : 'latehome', seed: opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0), opts,
      players, me, isHost: true,
      now: () => (N.time.now || 0) * 1000, send() {}, on() { return () => {}; },
      report(r) { reports.push(r); }, results: () => reports.slice(), end() {}, ai: null,
    };
    return ctx;
  }
  function lookOf(pl, i) {
    const L = pl && pl.look && typeof pl.look === 'object' ? pl.look : null;
    if (L && L.kind) return Object.assign({}, L);
    if (pl && pl.npc) return npcLook(pl.npc, FB[pl.npc]);
    try { if (N.people && N.people.randomLook) return N.people.randomLook(U.rng('kid' + i), 'kid'); } catch (e) { /* stub */ }
    return Object.assign({}, FB.chinnu);
  }
  function makeKids(ctx) {
    const list = (ctx.players || []).slice().map((pl, i) => ({ pl, i }));
    list.sort((a, b) => (String(a.pl.uid) < String(b.pl.uid) ? -1 : String(a.pl.uid) > String(b.pl.uid) ? 1 : 0));
    const meUid = ctx.me && ctx.me.uid != null ? String(ctx.me.uid) : null;
    let aiN = 0;
    return list.map(({ pl, i }) => {
      const isMe = meUid != null ? String(pl.uid) === meUid : !!pl.isMe;
      const isAI = !!pl.isAI && !isMe;
      let npc = pl.npc || null;
      if (isAI && !npc) { npc = AI_FRIENDS[aiN] || null; aiN++; } else if (isAI) aiN++;
      return {
        uid: String(pl.uid), nick: String(pl.nick || (npc ? npc[0].toUpperCase() + npc.slice(1) : 'Kid')).slice(0, 14), isMe, isAI, npc,
        look: isMe && N.player && N.player.look ? N.player.look : lookOf(Object.assign({}, pl, { npc }), i),
        x: 0, y: 0, a: 0, meter: 0, spots: 0, coll: 0, hide: 0, run: false, level: null, done: null, ghost: false, seq: null,
        t: 0, lastSeen: null, role: 'kid', pts: 0, catches: 0, ent: null, net: null,
      };
    });
  }
  function startWith(ctx, opts) {
    if (S) return false;
    if (!N.world || !N.world.built || !ctx) return false;
    opts = Object.assign({}, ctx.opts || {}, opts || {});
    const variant = opts.variant === 'daddy' || ctx.id === 'latehome_daddy' ? 'daddy' : 'sneak';
    const venue = VENUES[opts.venue] ? opts.venue : 'cafe';
    const nowFn = typeof ctx.now === 'function' ? () => +ctx.now() : () => performance.now();
    const seed = ctx.seed != null ? ctx.seed : ((Math.random() * 1e9) | 0);
    const sess = {
      ctx, mode: ctx.mode === 'party' ? 'party' : 'solo', variant, venue, isHost: ctx.isHost !== false, now: nowFn, seed,
      rng: rngOf(String(seed) + ':' + venue + ':' + variant), difficulty: clamp(opts.difficulty != null ? +opts.difficulty : 0.5, 0, 1),
      phase: 'intro', t0: nowFn() + TUNE.intro * 1000, kids: [], seekers: [], dogs: [], extraEnts: [], vehicles: [], subs: [], items: [],
      virtualSeekers: [], round: 0, rounds: 1, meterMul: 1, saved: {}, snapT: 0, posT: 0, whistleCD: 0, ownBodies: true, results: null,
      hud: null, ui: { label: '', prompt: '' }, lastFrame: 0, nets: { sk: null, skT: 0 }, flash: [],
      evq: [], owed: new Map(), owedOut: new Map(), repQ: [], reported: false,
      partyCtx: !!(ctx.sid || ctx.spec), // started by party.js: it shows the results card
    };
    if (typeof ctx.startAt === 'number' && isFinite(ctx.startAt)) sess.t0 = Math.max(ctx.startAt, nowFn() + 1500);
    S = sess;
    try {
      S.kids = makeKids(ctx);
      S.me = S.kids.find((k) => k.isMe) || null;
      if (!S.me) throw new Error('latehome: no local player in ctx.players');
      S.meterMul = lerp(0.8, 1.2, S.difficulty);
      S.C = buildCourse(S);
      S.items = S.C.items.map((it) => Object.assign({ taken: null }, it));
      S.stairs = Object.values(N.places || {}).filter((q) => q.kind === 'stairs' && q.x > S.C.bbox.x0 - 100 && q.x < S.C.bbox.x1 + 100 && q.y > S.C.bbox.y0 - 100 && q.y < S.C.bbox.y1 + 100);
      S.ownBodies = !(N.online && N.online.room && S.mode === 'party');
      if (variant === 'daddy') S.rounds = S.mode === 'solo' ? TUNE.daddy.rounds : Math.max(1, Math.min(3, S.kids.filter((k) => !k.isAI).length));
      setupWorld();
      spawnCast();
      if (variant === 'daddy') setupRound(0, null, null);
      else placeKidsAtStart();
      hudOn();
      netOn();
      const v = VENUES[venue];
      banner(variant === 'daddy' ? 'DADDY AA GAYE!' : 'GHAR PAHUNCHNA HAI!', variant === 'daddy' ? roundLine() : v.line, 3000, { kind: 'chapter' });
      N.emit('latehome:start', { variant, venue, mode: S.mode, seed });
      try { if (N.audio && N.audio.music && N.audio.music.mood) N.audio.music.mood('tension'); } catch (e) { /* ignore */ }
      return true;
    } catch (e) {
      N.err('latehome.start', e);
      try { teardown(); } catch (er) { /* ignore */ }
      S = null;
      return false;
    }
  }
  function placeKidsAtStart() {
    const st = S.C.start;
    S.kids.forEach((k, i) => {
      if (k.role === 'daddy') return;
      const a = (i / Math.max(1, S.kids.length)) * TAU + 0.6, r = i === 0 ? 0 : 9;
      let x = st.x + Math.cos(a) * r, y = st.y + Math.sin(a) * r;
      if (!walkable(x, y)) { x = st.x; y = st.y; }
      const d = S.C.doors[k.uid];
      const face = Math.atan2(d.y - y, d.x - x);
      k.x = x; k.y = y; k.a = face;
      if (k.isMe) { try { N.player.teleport(x, y, { ground: true }); } catch (e) { N.player.x = x; N.player.y = y; } N.player.angle = face; N.player.facing = face; N.player.vx = N.player.vy = 0; }
      else if (k.ent) { k.ent.x = x; k.ent.y = y; k.ent.angle = face; k.ent.hidden = false; }
      k.path = S.C.paths[k.uid];
      k.mode = 'go'; k.ps = 0;
    });
  }
  function seekerLook(spec) {
    if (spec.look === 'bahadur') return Object.assign(npcLook('bahadur', FB.bahadur), { cast: 1 });
    if (spec.look === 'nanna') return Object.assign(npcLook('nanna', FB.nanna), { cast: 1 });
    let L = null;
    try { if (N.people && N.people.randomLook) L = N.people.randomLook(U.rng(String(S.seed) + ':look:' + spec.id), spec.look === 'aunty' ? 'aunty' : (spec.id % 2 ? 'lungi' : 'uncle')); } catch (e) { L = null; }
    L = L || trafficLook(spec.look === 'aunty' ? 'aunty' : 'uncle');
    if (spec.look === 'uncle') { L.hair = L.hair === '#1a1412' ? '#8a8680' : L.hair; if (spec.role === 'walker') L.towel = '#efe6d0'; }
    return L;
  }
  function spawnCast() {
    const R = S.rng;
    S.seekers = S.C.seekers.map((spec, i) => {
      const sk = new Seeker(spec, seekerLook(spec));
      sk.idx = i;
      if (spec.pts) { sk.L = null; const L = polyLen(spec.pts); sk.s = R.range(0, L); const q = polyAt(spec.pts, sk.s); sk.x = q.x; sk.y = q.y; sk.angle = q.a; sk.dir = R.next() < 0.5 ? 1 : -1; }
      if (spec.role === 'chair') { sk.dozeIn = R.range(3, 9); sk.angle = spec.face; }
      if (spec.role === 'window') { sk.open = R.next() < 0.5; sk.openT = R.range(1, 4); sk.angle = spec.face; }
      if (spec.role === 'watchman') sk.whistleT = R.range(3, 8);
      N.entities.add(sk);
      if (spec.role === 'daddy') {
        try {
          const v = N.vehicles.spawn(N.vehicles.TYPES[spec.vtype] ? spec.vtype : 'chetak', sk.x, sk.y, sk.angle, { driver: { look: sk.look, npc: true }, noEnter: true, locked: true, controller: daddyCtl });
          if (v) { v.noEnter = true; v.lhDaddy = true; v.npcOwned = true; sk.vehicle = v; S.vehicles.push(v); sk.spd = 0; }
        } catch (e) { N.err('latehome.daddy', e); }
      }
      return sk;
    });
    S.dogs = S.C.dogs.map((d, i) => { const g = new Dog(d, i); N.entities.add(g); return g; });
    for (const a of S.C.autos) {
      try {
        const v = N.vehicles.spawn('auto', a.x, a.y, a.a, { noEnter: true, locked: true, seed: 77 });
        if (v) { v.noEnter = true; v.lhProp = true; S.vehicles.push(v); }
      } catch (e) { N.err('latehome.auto', e); }
    }
    for (const k of S.kids) {
      if (k.isMe) continue;
      if (k.isAI || S.ownBodies) { const e = new Kid(k, S.C.start.x, S.C.start.y); k.ent = e; N.entities.add(e); }
    }
    // the minimap: my door (pink route) and the seekers as amber dots
    try {
      const d = S.C.doors[S.me.uid];
      N.hud.blip('lh:door', { x: d.x, y: d.y }, { color: '#ff5fb0', icon: 'star', label: 'Home', route: true, pulse: true });
      S.seekers.forEach((sk) => N.hud.blip('lh:sk' + sk.idx, sk.role === 'daddy' && sk.vehicle ? sk.vehicle : sk, { color: '#ffb020', icon: 'dot', size: 0.9, edge: false }));
    } catch (e) { /* hud optional */ }
  }

  /* ---------------------------------------------------------------- the world around a run (restored after) */
  function setupWorld() {
    const sv = S.saved, F = N.flags || (N.flags = {});
    const m = N.clock.minutes;
    if (!(m >= TUNE.clockStart && m < TUNE.window[1])) { try { N.clock.set(Math.floor(TUNE.clockStart / 60), TUNE.clockStart % 60); } catch (e) { N.clock.minutes = TUNE.clockStart; } }
    try { N.clock.hold('latehome', true); } catch (e) { /* ignore */ }
    sv.noCurfew = Object.prototype.hasOwnProperty.call(F, 'no_curfew'); sv.noCurfewV = F.no_curfew;
    if (!F.no_curfew) F.no_curfew = 'latehome';
    sv.noSave = Object.prototype.hasOwnProperty.call(F, 'no_save'); sv.noSaveV = F.no_save;
    if (!F.no_save) F.no_save = 'latehome';
    try { if (N.wanted) { if (N.wanted.level > 0 && N.wanted.clear) N.wanted.clear('latehome'); if (N.wanted.freeze) N.wanted.freeze(true, 'latehome'); } } catch (e) { N.err('latehome.wanted', e); }
    const c = S.C.center;
    try {
      if (N.traffic) {
        sv.density = N.traffic.density;
        if (N.traffic.setDensity) N.traffic.setDensity(Math.min(N.traffic.density, 0.35));
        if (N.traffic.closeRoads) N.traffic.closeRoads('latehome', { x: c.x, y: c.y, r: c.r });
        if (N.traffic.clear) N.traffic.clear((e) => e && !e.lhDaddy && !e.lhProp && hyp(e.x - c.x, e.y - c.y) < c.r);
      }
    } catch (e) { N.err('latehome.traffic', e); }
    try {
      if (N.npcs && N.npcs.schedule) {
        sv.sched = {};
        for (const n of ['colony_aunties', 'bahadur_night']) { sv.sched[n] = N.npcs.scheduleOn ? N.npcs.scheduleOn(n) : true; N.npcs.schedule(n, false); }
      }
    } catch (e) { N.err('latehome.npcs', e); }
    holdGivers(true);
    sv.zoom = N.render.baseZoom;
    try { if (N.input && N.input.setLabel) { N.input.setLabel('horn', 'SEETI'); } } catch (e) { /* ignore */ }
  }
  function teardown() {
    const s = S;
    if (!s) return;
    const sv = s.saved || {}, F = N.flags || {};
    try { N.clock.hold('latehome', false); } catch (e) { /* ignore */ }
    if (F.no_curfew === 'latehome') { if (sv.noCurfew) F.no_curfew = sv.noCurfewV; else delete F.no_curfew; }
    if (F.no_save === 'latehome') { if (sv.noSave) F.no_save = sv.noSaveV; else delete F.no_save; }
    try { if (N.wanted && N.wanted.freeze) N.wanted.freeze(false, 'latehome'); } catch (e) { /* ignore */ }
    try {
      if (N.traffic) {
        if (N.traffic.closeRoads) N.traffic.closeRoads('latehome', null);
        if (N.traffic.setDensity && sv.density != null) N.traffic.setDensity(sv.density);
      }
    } catch (e) { /* ignore */ }
    try { if (sv.sched && N.npcs && N.npcs.schedule) for (const n in sv.sched) N.npcs.schedule(n, sv.sched[n]); } catch (e) { /* ignore */ }
    holdGivers(false);
    for (const sk of s.seekers) { sk.alive = false; try { N.entities.remove(sk); } catch (e) { /* ignore */ } }
    for (const e of s.extraEnts) { e.alive = false; try { N.entities.remove(e); } catch (er) { /* ignore */ } }
    for (const g of s.dogs) { g.alive = false; try { N.entities.remove(g); } catch (e) { /* ignore */ } }
    for (const k of s.kids) if (k.ent) { k.ent.alive = false; try { N.entities.remove(k.ent); } catch (e) { /* ignore */ } }
    const p = N.player;
    for (const v of s.vehicles) {
      try { if (p.vehicle === v) N.vehicles.alight(p, true); } catch (e) { /* ignore */ }
      try { N.vehicles.remove(v); } catch (e) { v.alive = false; }
    }
    for (const fn of s.subs) { try { if (typeof fn === 'function') fn(); } catch (e) { /* ignore */ } }
    try { N.hud.unblip('lh:door'); for (const sk of s.seekers) N.hud.unblip('lh:sk' + sk.idx); N.hud.unblip('lh:hint'); } catch (e) { /* ignore */ }
    if (p) { p.hidden = false; p.controlsLocked = false; }
    try { N.render.fx.fade = 0; } catch (e) { /* ignore */ }
    try { if (N.input && N.input.setLabel) N.input.setLabel('horn', null); } catch (e) { /* ignore */ }
    try { if (N.audio && N.audio.music && N.audio.music.mood) N.audio.music.mood(null); } catch (e) { /* ignore */ }
    hudOff();
    G.frozenSeekers = false; G.unseen = false; // test switches never outlive a run
    S = null;
  }
  /* mission givers: "not now" while a run is on (a J-card would otherwise start a mission mid-sneak) */
  let giverHold = false;
  function holdGivers(on) {
    giverHold = !!on;
    const M = N.missions;
    if (!on || !M || !M.defs) return;
    for (const id in M.defs) {
      const d = M.defs[id];
      if (!d || !(d.giver || d.autoStart) || d.__lhWhen) continue;
      const ow = d.when;
      d.__lhWhen = true;
      d.when = function () { if (giverHold) return false; return typeof ow === 'function' ? ow.apply(this, arguments) : true; };
    }
  }

  /* ---------------------------------------------------------------- Daddy rounds */
  function roundLine() {
    if (!S) return '';
    const dk = S.kids.find((k) => k.role === 'daddy');
    if (!dk) return 'Round ' + (S.round + 1) + ' of ' + S.rounds + ': Nanna has the big torch. Get home!';
    if (dk.isMe) return 'Round ' + (S.round + 1) + ' of ' + S.rounds + ': YOU are Daddy. Catch them before they slip in!';
    return 'Round ' + (S.round + 1) + ' of ' + S.rounds + ': ' + dk.nick + ' is Daddy. Get home!';
  }
  function daddyFor(r) {
    const humans = S.kids.filter((k) => !k.isAI);
    if (S.mode === 'solo') return r === 0 ? null : S.me;
    if (humans.length === 1) return r === 0 ? null : humans[0];
    return humans[r % humans.length];
  }
  function setupRound(r, daddyUid, t0) {
    S.round = r;
    const dk = daddyUid != null ? S.kids.find((k) => k.uid === daddyUid) || null : daddyFor(r);
    for (const k of S.kids) {
      k.role = k === dk ? 'daddy' : 'kid';
      k.done = null; k.seq = null; k.ghost = false; k.meter = 0; k.hide = 0; k.lastSeen = null; k.t = 0; k.mode = 'go';
      if (k.ent) k.ent.hidden = k.role === 'daddy' && !k.isMe ? !S.ownBodies : false;
    }
    S.phase = 'intro';
    S.t0 = t0 != null ? t0 : S.now() + TUNE.intro * 1000;
    placeKidsAtStart();
    // Daddy starts in the middle of the colony, facing the kids
    const mid = polyAt(S.C.main, polyLen(S.C.main) * 0.62);
    // AI Nanna (no human daddy this round)
    for (const sk of S.seekers.slice()) if (sk.role === 'hunter') { S.seekers.splice(S.seekers.indexOf(sk), 1); sk.alive = false; try { N.entities.remove(sk); } catch (e) { /* ignore */ } }
    S.seekers.forEach((sk, i) => { sk.idx = i; });
    for (const v of S.vehicles.slice()) if (v.lhBike) { try { if (N.player.vehicle === v) N.vehicles.alight(N.player, true); } catch (e) { /* ignore */ } try { N.vehicles.remove(v); } catch (e) { v.alive = false; } S.vehicles.splice(S.vehicles.indexOf(v), 1); }
    if (!dk) {
      const spec = { role: 'hunter', x: mid.x, y: mid.y, face: mid.a + Math.PI, range: TUNE.role.hunter.range, half: TUNE.role.hunter.half, name: 'Nanna', look: 'nanna', id: 99 };
      const sk = new Seeker(spec, Object.assign(npcLook('nanna', FB.nanna), { cast: 1 }));
      sk.idx = S.seekers.length; sk.angle = spec.face; sk.daddyName = 'Sreenivas-garu';
      N.entities.add(sk); S.seekers.push(sk);
    } else {
      if (dk.isMe) {
        try { N.player.teleport(mid.x, mid.y, { ground: true }); } catch (e) { N.player.x = mid.x; N.player.y = mid.y; }
        N.player.angle = N.player.facing = mid.a + Math.PI;
        dk.x = N.player.x; dk.y = N.player.y;
      } else { dk.x = mid.x; dk.y = mid.y; if (dk.ent) { dk.ent.x = mid.x; dk.ent.y = mid.y; } }
      // Nanna's Chetak, parked for the human Daddy
      try {
        const pr = sidePerp(mid.a, 1);
        let bx = mid.x + pr.x * 10, by = mid.y + pr.y * 10;
        if (!walkable(bx, by)) { bx = mid.x - pr.x * 10; by = mid.y - pr.y * 10; }
        const v = N.vehicles.spawn(N.vehicles.TYPES.family_chetak ? 'family_chetak' : 'chetak', bx, by, mid.a, {});
        if (v) { v.lhBike = true; v.owned = true; if (!dk.isMe) v.noEnter = true; S.vehicles.push(v); }
      } catch (e) { N.err('latehome.bike', e); }
    }
    S.virtualSeekers = [];
    if (dk) {
      const vs = { role: 'hunter', x: dk.x, y: dk.y, angle: 0, idx: -1, name: dk.nick, escort: null, kidUid: dk.uid,
        cone: { x: dk.x, y: dk.y, a: 0, range: TUNE.role.hunter.range, half: TUNE.role.hunter.half, on: true, poly: null, polyT: 0, key: '' } };
      S.virtualSeekers.push(vs);
    }
    if (r > 0) banner('ROUND ' + (r + 1), roundLine(), 3000, { kind: 'chapter' });
    N.emit('latehome:round', { round: r, daddy: dk ? dk.uid : 'ai' });
  }
  function daddyHint(x, y, text) {
    if (!S || S.variant !== 'daddy') return;
    const dk = S.kids.find((k) => k.role === 'daddy');
    if (dk && dk.isMe) {
      toast(text, 1800);
      try { N.hud.blip('lh:hint', { x, y }, { color: '#ff4a3a', icon: 'ring', pulse: true, size: 4 }); S.hintT = 3; } catch (e) { /* ignore */ }
    } else if (!dk) {
      const h = S.seekers.find((sk) => sk.role === 'hunter');
      if (h && !h.track) { h.inv = { x, y, t: 6, kind: 'hint' }; }
    }
  }
  /** Daddy's catches: proximity + facing (+ line of sight); a hidden kid only right next to him */
  function canCatch(cx, cy, face, k) {
    if (!k || k.done || k.seq || k.ghost || k.role === 'daddy' || k.level) return false;
    const D = TUNE.daddy;
    const d = hyp(k.x - cx, k.y - cy);
    if (k.hide === 2 ? d > D.hiddenR : d > D.catchR) return false;
    if (d > 4 && Math.abs(adiff(face, Math.atan2(k.y - cy, k.x - cx))) > D.catchHalf) return false;
    return clear(cx, cy, k.x, k.y);
  }
  function daddyCatch(by, k) {
    if (S.variant !== 'daddy') return;
    const dk = S.kids.find((q) => q.role === 'daddy');
    if (dk) { dk.catches = (dk.catches || 0) + 1; dk.pts = (dk.pts || 0) + 100; if (dk.isMe) { netState(dk); bark(N.player, pick(LINES.daddyCatch), 'nanna', 2); } }
    else { const h = S.seekers.find((sk) => sk.role === 'hunter'); if (h) { sayAt(h, pick(LINES.daddyCatch), 'nanna'); h.track = null; h.inv = null; } }
    sfx('whistle', { x: k.x, y: k.y });
    startCatch(k, by, 'daddy');
  }
  function endRound(why) {
    if (!S || S.phase !== 'play') return;
    if (S.variant === 'daddy') {
      for (const k of S.kids) if (k.role === 'kid' && !k.done) { k.pts = (k.pts || 0) + 50; k.done = 'out'; k.rounds = k.rounds || []; k.rounds[S.round] = 'out'; }
      if (S.round + 1 < S.rounds) {
        S.phase = 'between'; S.betweenT = 3.6;
        const line = S.kids.map((k) => k.nick + ' ' + (k.pts || 0)).join(' · ');
        banner('ROUND ' + (S.round + 1) + ' OVER', line, 3200, { kind: 'info' });
        return;
      }
    } else if (why === 'time') {
      for (const k of S.kids) if (!k.done && !k.seq) {
        if (k.isMe || (k.isAI && S.isHost)) startCatch(k, null, 'time');
        else { S.owed.set(k.uid, 'time'); k.seq = { phase: 'remote' }; }
      }
      S.phase = 'closing'; S.closeT = 4.8;
      return;
    }
    finishSession();
  }
  function finishSession() {
    if (!S || S.phase === 'done') return;
    S.phase = 'done';
    for (const k of S.kids) { k.score = scoreOf(k); k.stars = starsOf(k); }
    S.results = S.kids.map((k) => resultOf(k));
    G.lastResults = S.results;
    N.emit('latehome:end', { results: S.results });
    if (S.partyCtx) {
      // party.js shows the results card on every phone: report mine (and, on the host, the AI friends')
      reportMine();
      if (S.isHost) for (const k of S.kids) if (k.isAI && !k.reported) { k.reported = true; S.repQ.push([k.uid, partyResult(k), false]); }
      if (S.me && S.me.isMe) N.player.controlsLocked = false;
      return;
    }
    showResults();
  }
  function ranked(res) {
    const r = res.slice();
    if (S && S.variant === 'daddy') r.sort((a, b) => b.pts - a.pts);
    else r.sort((a, b) => (b.home - a.home) || (b.score - a.score) || (a.time - b.time));
    return r;
  }
  function resolveAI() {
    // "skip": the AI friends still on their way get home in about the time their path takes (a spot if seen)
    for (const k of S.kids) {
      if (k.done || !k.isAI || k.seq) continue;
      const rem = k.path ? Math.max(0, polyLen(k.path) - (k.ps || 0)) : 60;
      k.spots += k.meter > 0.3 ? 1 : 0;
      finishKid(k, 'home', +(elapsed() + rem / 36).toFixed(1));
    }
  }

  /* ================================================================ the local kid: controls */
  function nearHide(x, y) {
    let best = null, bd = Infinity;
    for (const h of S.C.hides) { const d = hyp(h.x - x, h.y - y); if (d < h.r && d < bd) { bd = d; best = h; } }
    return best;
  }
  function whistle(k) {
    if (S.whistleCD > 0) return false;
    S.whistleCD = TUNE.whistleCD;
    const p = N.player;
    sfx('finger_whistle', { x: p.x, y: p.y });
    bark(p, 'Phweeeet!', 'you', 1.4);
    if (k.ghost || k.done) S.ghostWhistles = (S.ghostWhistles || 0) + 1;
    noise(p.x, p.y, TUNE.noise.whistle, 'whistle', p);
    netSend('wh', { x: Math.round(p.x), y: Math.round(p.y) });
    N.emit('latehome:whistle', { uid: k.uid, x: p.x, y: p.y, ghost: !!k.ghost });
    return true;
  }
  function ctlStep(dt) {
    if (!S) return;
    const k = S.me, p = N.player;
    if (!k) return;
    S.whistleCD = Math.max(0, S.whistleCD - dt);
    if (S.phase === 'intro' || S.phase === 'between') {
      if (!k.seq) { p.controlsLocked = true; S.locked = true; p.vx = p.vy = 0; }
      N.input.consume('action'); N.input.consume('horn');
      setUI('', S.phase === 'intro' ? 'Get ready...' : 'Next round...');
      return;
    }
    if (S.phase === 'done') return;
    if (S.locked && !k.seq) { p.controlsLocked = false; S.locked = false; }
    if (k.seq) { N.input.consume('action'); N.input.consume('horn'); setUI('', 'By the ear... *chalo* home.'); return; }
    if (k.done) {
      // ghost: whistle to pull the cones off your friends; solo: E skips to the results
      if (N.input.pressed('horn')) { N.input.consume('horn'); if (k.ghost) whistle(k); }
      const left = S.kids.filter((q) => !q.done && q.role !== 'daddy').length;
      if (k.ghost && left) {
        if (S.mode === 'solo' && S.isHost) {
          N.interact.offer({ label: 'Skip to results', priority: 90, dist: 0, use: () => { resolveAI(); } });
          setUI('Skip to results', 'Ghost: whistle (Space / SEETI) to pull the uncles away from ' + S.kids.filter((q) => !q.done && q.role !== 'daddy').map((q) => q.nick).join(' & ') + '.');
        } else setUI('', 'Ghost: whistle (Space / SEETI) to help your friends home!');
      } else setUI('', k.done === 'home' ? 'Home!' : 'Caught...');
      return;
    }
    if (k.role === 'daddy') {
      setUI('', p.vehicle ? 'Ride the lanes: your headlight catches them up close.' : 'Your torch catches them up close. Listen for running and the dog!');
      return;
    }
    // hold ACTION to hide (at a spot) or crouch (anywhere); the roof stairs keep their own ACTION
    const nearStairs = S.stairs.some((q) => hyp(q.x - p.x, q.y - p.y) < 15);
    if (p.level || nearStairs || p.vehicle) {
      k.hide = 0;
      setUI('', p.level ? 'On the terrace: nobody down there can see you.' : '');
      if (N.input.pressed('horn')) { N.input.consume('horn'); whistle(k); }
      return;
    }
    const held = N.input.down('action');
    N.input.consume('action');
    const mv = N.input.move, moving = hyp(mv.x, mv.y) > 0.15;
    const spot = nearHide(p.x, p.y);
    k.spot = spot;
    const was = k.hide;
    k.hide = held ? (spot && !moving ? 2 : 1) : 0;
    if (k.hide === 2 && was !== 2) { sfx('step', { x: p.x, y: p.y, vol: 0.3 }); N.emit('latehome:hide', { uid: k.uid, spot: spot && spot.kind }); }
    const label = held ? (k.hide === 2 ? 'Hiding' : 'Crouching') : (spot ? 'Hide (hold)' : 'Crouch (hold)');
    N.interact.offer({ label, priority: 90, dist: 0, use() { /* held, not pressed: read by lh.ctl */ } });
    if (N.input.pressed('horn')) { N.input.consume('horn'); whistle(k); }
    const prompt = k.hide === 2 ? 'Hidden behind ' + spot.name + '. Let go to move on.'
      : k.hide === 1 ? 'Crouching: slow and silent, harder to see.'
        : spot ? 'Hold ' + actKey() + ' to hide behind ' + spot.name + '.'
          : p.running ? 'Running is LOUD. Walk past the uncles.' : '';
    setUI(label, prompt);
  }
  function actKey() { return N.input && N.input.touchUI ? 'HIDE' : 'E'; }
  function setUI(label, prompt) { if (S) { S.ui.label = label; S.ui.prompt = prompt; } }
  let preX = 0, preY = 0, preOk = false;
  function preStep() { const p = N.player; preOk = !!(S && S.me && !S.me.done && !S.me.seq && S.phase === 'play' && !p.vehicle); if (preOk) { preX = p.x; preY = p.y; } }
  function postStep() {
    if (!preOk || !S || !S.me) return;
    const k = S.me, p = N.player;
    if (k.hide === 1) {
      const m = TUNE.creepMul;
      const nx = preX + (p.x - preX) * m, ny = preY + (p.y - preY) * m;
      try { const c = N.world.collide(nx, ny, p.r, 'walk'); if (!c.bad) { p.x = c.x; p.y = c.y; } } catch (e) { /* ignore */ }
      p.running = false;
      if (p.anim) p.anim.speed *= m;
    } else if (k.hide === 2) { p.x = preX; p.y = preY; p.vx = p.vy = 0; }
  }

  /* ================================================================ the sim (after vehicles) */
  function simStep(dt) {
    if (!S) return;
    if (S.mode === 'party' && S.ctx) S.isHost = S.ctx.isHost !== false; // party.js hands the host role on if the host leaves
    stepInner(dt);
    flushReports();
  }
  function stepInner(dt) {
    const t = elapsed();
    const p = N.player;
    if (S.phase === 'intro' && S.now() >= S.t0) {
      S.phase = 'play';
      sfx('whistle', { ui: true, vol: 0.6 });
      if (S.round === 0 || S.variant !== 'daddy') toast(S.variant === 'daddy' ? 'Go!' : 'Ghar chalo! Walk, don\'t run. Hold ' + actKey() + ' to hide.', 2600);
    }
    if (S.phase === 'between') { S.betweenT -= dt; if (S.betweenT <= 0 && S.isHost) setupRound(S.round + 1, null, null); }
    if (S.phase === 'closing') { S.closeT -= dt; if (S.closeT <= 0 || S.kids.every((k) => k.done)) { if (S.isHost) finishSession(); } }
    if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) try { N.hud.unblip('lh:hint'); } catch (e) { /* ignore */ } }
    // the local kid's own state (every phone)
    const me = S.me;
    if (me) {
      me.level = p.level || null;
      if (!me.seq) { me.x = p.x; me.y = p.y; me.a = isFinite(p.facing) ? p.facing : p.angle; }
      me.run = (!!p.running && hyp(p.vx || 0, p.vy || 0) > 30 && me.hide === 0) || (!!p.vehicle && Math.abs(p.vehicle.speed || 0) > 20 && me.role !== 'daddy');
      // a kid on a cycle rattles: every uncle in earshot hears it (the dog too)
      if (p.vehicle && me.run && !me.done && S.phase === 'play') { S.rideNz = (S.rideNz || 0) - dt; if (S.rideNz <= 0) { S.rideNz = 0.45; noise(p.x, p.y, TUNE.noise.run, 'step', p); } }
      if (me.done && !me.ghost) { me.ghostIn -= dt; if (me.ghostIn <= 0 && S.phase === 'play') { me.ghost = true; p.hidden = true; netState(me); if (S.kids.some((q) => !q.done && q.role !== 'daddy')) toast(S.mode === 'solo' ? 'You can still help: whistle (Space / SEETI) to pull the uncles away. (E skips)' : 'Ghost mode: whistle (Space / SEETI) to pull the uncles off your friends!', 3200); } }
      if (me.ghost) p.hidden = true;
      else if (!me.seq && !me.done) p.hidden = me.hide === 2;
    }
    if (S.isHost) {
      if (!G.frozenSeekers) for (const sk of S.seekers) { try { seekerStep(sk, dt, t); } catch (e) { N.err('latehome.seeker', e); } }
      if (S.phase === 'play') for (const g of S.dogs) dogStep(g, dt);
      for (const k of S.kids) if (k.isAI) aiKidStep(k, dt, t);
      if (S.phase === 'play') {
        // AI Nanna's catches (Daddy round)
        for (const sk of S.seekers) if (sk.role === 'hunter') for (const k of S.kids) if (canCatch(sk.x, sk.y, sk.angle, k)) {
          if (k.isMe || k.isAI) daddyCatch(sk, k); else if (!k.seq) { S.owed.set(k.uid, 'daddy'); k.seq = { phase: 'remote' }; }
        }
        const limit = S.variant === 'daddy' ? TUNE.daddy.time : TUNE.timeLimit;
        if (S.variant === 'sneak' && t > TUNE.warnAt && !S.warned) { S.warned = true; toast('Amma is at the gate with the big torch...', 3000); netEvent({ k: 'warn' }); }
        if (t > limit) endRound('time');
      }
      if (S.mode === 'party') { S.snapT -= dt; if (S.snapT <= 0) { S.snapT = 1 / TUNE.net.hz; sendSnap(); } }
    } else if (S.mode === 'party' && S.phase === 'done') {
      /* the guest keeps the last picture */
    } else applySnaps(dt);
    // the human Daddy's torch (virtual seeker) and his catches
    const dk = S.kids.find((k) => k.role === 'daddy');
    if (dk && S.virtualSeekers.length) {
      const vs = S.virtualSeekers[0];
      if (dk.isMe) { const v = p.vehicle; dk.x = p.x; dk.y = p.y; dk.a = v ? v.angle : (isFinite(p.facing) ? p.facing : p.angle); }
      vs.x = dk.x; vs.y = dk.y; vs.angle = dk.a;
      const onBike = dk.isMe ? !!p.vehicle : !!dk.bike;
      vs.cone.range = onBike ? TUNE.role.daddy.range : TUNE.role.hunter.range; vs.cone.half = onBike ? TUNE.role.daddy.half : TUNE.role.hunter.half;
      if (dk.isMe && S.phase === 'play') {
        for (const k of S.kids) if (canCatch(dk.x, dk.y, dk.a, k)) {
          if (k.isAI && S.isHost) daddyCatch(null, k);
          else if (!k.seq) { if (S.isHost) S.owed.set(k.uid, 'daddy'); else S.owedOut.set(k.uid, 0); k.seq = { phase: 'remote' }; dk.catches++; dk.pts += 100; bark(p, pick(LINES.daddyCatch), 'nanna', 2); netState(dk); }
        }
      }
    }
    for (const sk of S.seekers) coneUpdate(sk, t, dt);
    for (const vs of S.virtualSeekers) { vs.cone.on = S.phase === 'play'; vsCone(vs, t); }
    if (me && S.phase === 'play') {
      if (me.seq) catchStep(me, dt);
      else if (!me.done) {
        if (me.role !== 'daddy') sightStep(me, dt);
        // collectibles
        for (const it of S.items) if (!it.taken && hyp(it.x - p.x, it.y - p.y) < TUNE.collectR) takeItem(it, me);
        // home: the door (or the house's own terrace)
        const d = S.C.doors[me.uid];
        if (me.role !== 'daddy' && !me.seq && !me.done && (hyp(d.x - p.x, d.y - p.y) < TUNE.doorR || (d.roof && p.level === d.roof))) finishKid(me, 'home');
      }
    } else if (me && me.seq) catchStep(me, dt);
    if (S.isHost && S.phase === 'play') for (const k of S.kids) if (k.isAI) sightStep(k, dt);
    // remote kids (their phones send positions)
    for (const k of S.kids) if (!k.isMe && !k.isAI && k.net) remoteKidStep(k, dt);
    if (S.mode === 'party') {
      S.posT -= dt;
      if (S.posT <= 0 && me) { S.posT = 1 / TUNE.net.posHz; if (!S.isHost) sendPos(me); }
      for (const [uid, t0] of S.owedOut) {
        const k = S.kids.find((q) => q.uid === uid);
        if (!k || k.done) { S.owedOut.delete(uid); continue; }
        if (t0 <= 0) { netSend('catch', { k: uid, why: 'daddy' }); S.owedOut.set(uid, 0.6); } else S.owedOut.set(uid, t0 - dt);
      }
    }
    // my result goes to party.js a moment after I finish (after Amma has had her say)
    if (me && me.reportIn > 0) { me.reportIn -= dt; if (me.reportIn <= 0) reportMine(); }
    hudUpdate();
  }
  function vsCone(vs, t) {
    const C = vs.cone;
    C.x = vs.x; C.y = vs.y; C.a = vs.angle;
    const key = Math.round(C.x * 2) + ',' + Math.round(C.y * 2) + ',' + Math.round(C.a * 60);
    if (key !== C.key && (t - C.polyT > 0.08 || !C.poly)) {
      C.key = key; C.polyT = t;
      const n = clamp(Math.round(C.half * 2 / 0.075), 10, 28);
      const poly = C.poly && C.poly.length === (n + 1) * 2 + 2 ? C.poly : new Float32Array((n + 1) * 2 + 2);
      poly[0] = C.x; poly[1] = C.y;
      for (let i = 0; i <= n; i++) { const aa = C.a - C.half + (2 * C.half * i) / n, dx = Math.cos(aa), dy = Math.sin(aa); const L = rayLen(C.x, C.y, dx, dy, C.range); poly[2 + i * 2] = C.x + dx * L; poly[3 + i * 2] = C.y + dy * L; }
      C.poly = poly;
    }
  }
  function takeItem(it, k) {
    it.taken = k.uid; k.coll++;
    sfx(it.kind === 'goli' ? 'marble' : 'pickup', { ui: true });
    toast('Found ' + it.name + '! +' + TUNE.score.perItem, 1800);
    netSend('it', { id: it.id });
    netState(k);
    N.emit('latehome:collect', { uid: k.uid, kind: it.kind });
  }
  function remoteKidStep(k, dt) {
    const n = k.net;
    const a = Math.min(1, dt / TUNE.net.interp);
    k.x = lerp(k.x, n.x, a); k.y = lerp(k.y, n.y, a); k.a = k.a + adiff(k.a, n.a) * a;
    k.hide = n.h; k.run = !!n.r; k.level = n.l || null; k.ghost = !!n.g; k.bike = !!n.b;
    if (hyp(n.x - k.x, n.y - k.y) > 200) { k.x = n.x; k.y = n.y; }
    if (k.ent) {
      const e = k.ent, px = e.x, py = e.y;
      e.x = k.x; e.y = k.y; e.angle = k.a;
      const sp = hyp(e.x - px, e.y - py) / Math.max(1e-4, dt);
      e.anim.speed = Math.min(1, sp / 45); e.anim.run = sp > 60; e.anim.phase += sp * dt * 0.26;
      e.hidden = k.ghost || k.done === 'home' || (k.hide === 2 && S.me && S.me.role === 'daddy');
    }
  }

  /* ================================================================ network (party)
   * Inside party.js's budget (12 messages / s / phone, types [a-z0-9_]): the host sends ONE snapshot 'lhsk' 6 times a
   * second (seekers, AI kids, dogs, its own kid, queued flavour events, the round, catches it owes the guests); a guest
   * sends 'lhpos' 5 times a second (its kid: position + state). Rare one-offs: 'lhwh' (whistle), 'lhseen' (a guest was
   * spotted: the seeker reacts on the host), 'lhcatch' (a human Daddy's catch, repeated until the kid shows caught),
   * 'lhit' (an item taken). A dropped message is healed by the next one. */
  function netSend(type, data) {
    if (!S || S.mode !== 'party' || !S.ctx || typeof S.ctx.send !== 'function') return false;
    try { return S.ctx.send('lh' + type, Object.assign({ u: S.me ? S.me.uid : null }, data || {})) !== false; } catch (e) { N.err('latehome.send', e); return false; }
  }
  function netEvent(ev) { if (S && S.mode === 'party' && S.isHost) { S.evq.push(ev); if (S.evq.length > 12) S.evq.shift(); } }
  function netState() { if (S) S.posT = Math.min(S.posT, 0.05); }
  const f1 = (v) => Math.round((+v || 0) * 10) / 10, f2 = (v) => Math.round((+v || 0) * 100) / 100;
  function kidRow(k) {
    const p = N.player;
    return { x: f1(k.x), y: f1(k.y), a: f2(k.a), h: k.hide | 0, r: k.run ? 1 : 0, l: k.level || 0, g: k.ghost ? 1 : 0, b: k.isMe && p.vehicle ? 1 : 0,
      d: k.done || 0, s: k.spots | 0, c: k.coll | 0, m: f2(k.meter), t: f1(k.t), ca: k.catches | 0, p: k.pts | 0, sc: k.score | 0, st: k.stars | 0,
      ti: S.items.filter((it) => it.taken === k.uid).map((it) => it.id) };
  }
  function sendPos(k) { netSend('pos', kidRow(k)); }
  function sendSnap() {
    const sk = S.seekers.map((q) => [q.idx, f1(q.x), f1(q.y), f2(q.angle), f2(q.lookOff || 0), (q.open ? 1 : 0) | (q.dozeT > 0 ? 2 : 0) | (q.escort ? 4 : 0) | (q.track ? 8 : 0), q.role === 'daddy' && q.vehicle ? f1(q.spd || 0) : 0]);
    const ks = S.kids.filter((k) => k.isAI).map((k) => [k.uid, f1(k.x), f1(k.y), f2(k.a || 0), k.hide | 0, k.done || 0, k.spots, f2(k.meter)]);
    const dg = S.dogs.map((g) => [g.state === 'bark' ? 1 : 0, f2(g.angle)]);
    const dk = S.kids.find((k) => k.role === 'daddy');
    const ct = [];
    for (const [uid, why] of S.owed) { const k = S.kids.find((q) => q.uid === uid); if (k && !k.done) ct.push([uid, why]); else S.owed.delete(uid); }
    netSend('sk', { s: sk, k: ks, g: dg, me: kidRow(S.me), ev: S.evq.splice(0, 8), rd: [S.round, dk ? dk.uid : null, Math.round(S.t0), S.phase === 'between' ? 1 : 0], ct, fin: S.phase === 'done' ? 1 : 0 });
  }
  function applySnaps(dt) {
    const sn = S.nets.sk;
    if (!sn) return;
    const a = Math.min(1, dt / TUNE.net.interp);
    for (const row of Array.isArray(sn.s) ? sn.s : []) {
      if (!Array.isArray(row)) continue;
      const sk = S.seekers.find((q) => q.idx === row[0]);
      if (!sk) continue;
      const px = sk.x, py = sk.y;
      if (hyp(row[1] - sk.x, row[2] - sk.y) > 120) { sk.x = row[1]; sk.y = row[2]; } else { sk.x = lerp(sk.x, row[1], a); sk.y = lerp(sk.y, row[2], a); }
      sk.angle += adiff(sk.angle, +row[3] || 0) * a; sk.lookOff = +row[4] || 0;
      sk.open = !!(row[5] & 1); sk.dozeT = row[5] & 2 ? 1 : 0; sk.escort = row[5] & 4 ? {} : null;
      if (row[5] & 8) { sk.track = sk.track || { x: sk.x, y: sk.y }; sk.trackT = 0.4; }
      const sp = hyp(sk.x - px, sk.y - py) / Math.max(1e-4, dt);
      sk.anim.speed = Math.min(1, sp / 45); sk.anim.phase += sp * dt * 0.26;
      if (sk.role === 'daddy' && sk.vehicle) { const v = sk.vehicle; v.x = sk.x; v.y = sk.y; v.angle = sk.angle; v.vx = v.vy = 0; v.speed = +row[6] || 0; sk.spd = v.speed; }
      if (sk.role === 'chair') sk.idle = sk.escort ? undefined : 'sit';
      if (sk.emoteT > 0) sk.emoteT -= dt;
    }
    for (const row of Array.isArray(sn.k) ? sn.k : []) {
      if (!Array.isArray(row)) continue;
      const k = S.kids.find((q) => q.uid === String(row[0]));
      if (!k || !k.ent || k.isMe) continue;
      const e = k.ent, px = e.x, py = e.y;
      e.x = lerp(e.x, +row[1] || e.x, a); e.y = lerp(e.y, +row[2] || e.y, a); e.angle += adiff(e.angle, +row[3] || 0) * a;
      k.x = e.x; k.y = e.y; k.a = e.angle; k.hide = row[4] | 0; k.spots = row[6] | 0; k.meter = +row[7] || 0;
      if (row[5] && !k.done) { k.done = String(row[5]); k.t = elapsed(); }
      e.hidden = k.done === 'home' || (k.hide === 2 && S.me && S.me.role === 'daddy');
      const sp = hyp(e.x - px, e.y - py) / Math.max(1e-4, dt);
      e.anim.speed = Math.min(1, sp / 45); e.anim.phase += sp * dt * 0.26; e.anim.run = sp > 60;
    }
    (Array.isArray(sn.g) ? sn.g : []).forEach((row, i) => { const g = S.dogs[i]; if (!g || !Array.isArray(row)) return; g.state = row[0] ? 'bark' : 'nap'; g.angle = +row[1] || 0; });
  }
  function netOn() {
    if (S.mode !== 'party' || !S.ctx || typeof S.ctx.on !== 'function') return;
    for (const ty of ['pos', 'sk', 'wh', 'seen', 'catch', 'it']) {
      try {
        const off = S.ctx.on('lh' + ty, (msg, from) => { try { onNet(ty, msg, from); } catch (e) { N.err('latehome.net:' + ty, e); } });
        if (typeof off === 'function') S.subs.push(off);
      } catch (e) { N.err('latehome.on', e); }
    }
  }
  function applyKidRow(kid, m) {
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    kid.net = { x: clamp(num(m.x, kid.x), 0, N.WORLD_W), y: clamp(num(m.y, kid.y), 0, N.WORLD_H), a: num(m.a, 0), h: clamp(m.h | 0, 0, 2), r: m.r ? 1 : 0, l: typeof m.l === 'string' ? m.l.slice(0, 40) : null, g: m.g ? 1 : 0, b: m.b ? 1 : 0 };
    if (!kid.netSeen) { kid.netSeen = true; kid.x = kid.net.x; kid.y = kid.net.y; }
    kid.spots = m.s | 0; kid.coll = m.c | 0; kid.meter = clamp(num(m.m, 0), 0, 1); kid.ghost = !!m.g; kid.catches = m.ca | 0; kid.pts = m.p | 0;
    if (m.d && !kid.done && typeof m.d === 'string') { kid.done = m.d === 'home' ? 'home' : m.d === 'caught' ? 'caught' : 'out'; kid.t = num(m.t, elapsed()); kid.score = m.sc | 0; kid.stars = m.st | 0; kid.seq = null; if (kid.ent && kid.done === 'home') kid.ent.hidden = true; if (S.isHost) checkAllDone(); }
    if (Array.isArray(m.ti)) for (const id of m.ti) { const it = S.items.find((q) => q.id === id); if (it && !it.taken) it.taken = kid.uid; }
    if (S.isHost && kid.net.r && !kid.done && !kid.ghost) { kid.nzT = (kid.nzT || 0) - 1 / TUNE.net.hz; if (kid.nzT <= 0) { kid.nzT = 0.45; applyNoise(kid.net.x, kid.net.y, TUNE.noise.run, 'step', null); } }
  }
  function onNet(ty, msg, from) {
    if (!S) return;
    // tolerate {type, data, from} envelopes as well as bare payloads
    if (msg && msg.data && typeof msg.data === 'object' && (msg.type || msg.from)) { from = from || msg.from; msg = msg.data; }
    if (!msg || typeof msg !== 'object') return;
    const fu = from && typeof from === 'object' && from.uid != null ? String(from.uid) : from != null && typeof from !== 'object' ? String(from) : null;
    const u = fu != null ? fu : msg.u != null ? String(msg.u) : null;
    if (u != null && S.me && u === S.me.uid) return; // my own echo
    const kid = u != null ? S.kids.find((k) => k.uid === u) : null;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    if (ty === 'pos') { if (kid && !kid.isAI) applyKidRow(kid, msg); return; }
    if (ty === 'sk') {
      if (S.isHost) return;
      S.nets.sk = msg;
      if (kid && msg.me && typeof msg.me === 'object') applyKidRow(kid, msg.me);
      for (const ev of Array.isArray(msg.ev) ? msg.ev : []) onHostEvent(ev);
      const rd = Array.isArray(msg.rd) ? msg.rd : null;
      if (rd && S.variant === 'daddy') {
        if ((rd[0] | 0) !== S.round && (rd[0] | 0) > S.round) setupRound(rd[0] | 0, rd[1] != null ? String(rd[1]) : null, num(rd[2], null));
        else if (rd[3] && S.phase === 'play') { S.phase = 'between'; S.betweenT = 99; banner('ROUND ' + (S.round + 1) + ' OVER', S.kids.map((k) => k.nick + ' ' + (k.pts || 0)).join(' · '), 3200, { kind: 'info' }); }
      } else if (rd && S.phase === 'intro' && isFinite(rd[2])) S.t0 = rd[2];
      for (const c of Array.isArray(msg.ct) ? msg.ct : []) if (Array.isArray(c) && S.me && String(c[0]) === S.me.uid) catchMeRemote(c[1]);
      if (msg.fin && S.phase !== 'done') finishSession();
      return;
    }
    if (ty === 'wh') {
      const x = num(msg.x, 0), y = num(msg.y, 0);
      sfx('finger_whistle', { x, y });
      bark({ x, y }, 'Phweeeet!', null, 1.4);
      if (S.isHost) applyNoise(x, y, TUNE.noise.whistle, 'whistle', null);
      return;
    }
    if (ty === 'seen') { if (S.isHost) { const sk = S.seekers.find((q) => q.idx === (msg.i | 0)); if (sk) notice(sk, { x: num(msg.x, sk.x), y: num(msg.y, sk.y) }); } return; }
    if (ty === 'catch') {
      const k = S.kids.find((q) => q.uid === String(msg.k));
      if (!k || k.done) return;
      if (k.isMe) catchMeRemote(msg.why);
      else if (k.isAI && S.isHost && !k.seq) daddyCatch(null, k);
      return;
    }
    if (ty === 'it') { const it = S.items.find((q) => q.id === msg.id); if (it && !it.taken) { it.taken = u || 'x'; if (kid) kid.coll++; } }
  }
  function catchMeRemote(why) {
    const k = S.me;
    if (!k || k.done || (k.seq && k.seq.phase !== 'remote')) return;
    k.seq = null;
    if (why === 'time') startCatch(k, null, 'time'); else daddyCatch(null, k);
  }
  function onHostEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    const sk = ev.i != null ? S.seekers.find((q) => q.idx === (ev.i | 0)) : null;
    if (ev.k === 'em' && sk) { sk.emote = String(ev.e || '!').slice(0, 2); sk.emoteT = clamp(+ev.s || 1.4, 0, 4); }
    else if (ev.k === 'say' && sk) bark(sk.role === 'window' ? { x: sk.spec.x, y: sk.spec.y } : sk.role === 'daddy' && sk.vehicle ? sk.vehicle : sk, String(ev.t || '').slice(0, 120), ev.sp === 'bahadur' ? 'bahadur' : null, 2.6);
    else if (ev.k === 'dog') { const g = S.dogs[ev.i | 0]; if (g) { sfx('dog_bark', { x: g.x, y: g.y }); bark(g, pick(LINES.dog), null, 1.8); } }
    else if (ev.k === 'warn') toast('Amma is at the gate with the big torch...', 3000);
  }

  /* ================================================================ HUD panel + results card (own CSS) */
  const CSS = `
.lh-hud { display: none; min-width: 270px; max-width: min(560px, calc(100% - 24px)); padding: 5px 12px 6px; color: var(--ink, #f4ead8);
  background: linear-gradient(to bottom, rgba(14, 12, 30, 0.9), rgba(30, 22, 40, 0.9)); border-left: 4px solid var(--sodium, #ffab40);
  border-right: 4px solid #3b6fd8; border-radius: 3px; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.4); text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8);
  font-family: var(--font-body, system-ui, sans-serif); pointer-events: none; }
.lh-hud.show { display: block; animation: lh-in 0.35s ease-out; }
@keyframes lh-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.lh-l1 { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
.lh-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-display, serif); font-size: 18px; color: var(--sodium, #ffab40); letter-spacing: 0.5px; }
.lh-time { font-family: var(--font-osd, monospace); font-size: 26px; line-height: 1; color: var(--osd, #eaf2ff); text-shadow: 2px 2px 0 var(--osd-shadow, #1b2a78), 0 0 6px var(--osd-glow, rgba(120,160,255,.55)); }
.lh-time.warn { color: #ff7a6a; text-shadow: 2px 2px 0 #5a0a0a, 0 0 8px rgba(255, 80, 60, 0.7); }
.lh-eye { position: relative; width: 30px; height: 18px; flex: none; }
.lh-eye i { position: absolute; inset: 2px 1px; border: 2px solid #c9d4ff; border-radius: 50% / 60%; background: #10122a; transition: transform 0.15s, border-color 0.15s; transform: scaleY(0.18); }
.lh-eye b { position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: #c9d4ff; transform: scaleY(0); transition: transform 0.15s, background 0.15s; }
.lh-eye[data-s='1'] i { transform: scaleY(0.6); border-color: #ffd36a; }
.lh-eye[data-s='1'] b { transform: scaleY(0.7); background: #ffd36a; }
.lh-eye[data-s='2'] i { transform: none; border-color: #ff5a4a; box-shadow: 0 0 8px rgba(255, 90, 74, 0.8); }
.lh-eye[data-s='2'] b { transform: none; background: #ff5a4a; }
.lh-meter { position: relative; height: 12px; margin: 4px 0 2px; border-radius: 2px; overflow: hidden; background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.6); }
.lh-meter b { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(to right, #f2c230, #ff7a3a 60%, #e2483a); box-shadow: 0 0 8px rgba(255, 110, 60, 0.7); transition: width 0.12s linear; }
.lh-meter span { position: absolute; right: 6px; top: -2px; font-family: var(--font-display, serif); font-size: 12px; color: #fff; opacity: 0.85; }
.lh-meter.hot { animation: lh-hot 0.5s infinite alternate; }
@keyframes lh-hot { to { box-shadow: inset 0 0 0 1px rgba(0,0,0,.6), 0 0 10px rgba(255, 80, 60, 0.85); } }
.lh-l2 { font-size: 13px; line-height: 1.3; color: var(--ink-dim, #b9aa92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lh-l2 em { font-style: normal; font-weight: 800; color: var(--ink, #f4ead8); }
.lh-prompt { margin-top: 2px; font-size: 14px; font-weight: 600; line-height: 1.25; color: #ffe08a; }
.lh-prompt:empty { display: none; }
.lh-res { position: absolute; left: 50%; top: 50%; z-index: 6; width: min(560px, calc(100% - 24px)); max-height: calc(100% - 24px); overflow: auto;
  transform: translate(-50%, -50%); padding: 14px 16px 12px; color: var(--ink, #f4ead8); background: linear-gradient(to bottom, rgba(16, 14, 34, 0.96), rgba(34, 24, 44, 0.96));
  border: 2px solid var(--sodium, #ffab40); border-radius: 6px; box-shadow: 0 6px 0 rgba(0, 0, 0, 0.45), 0 0 30px rgba(59, 111, 216, 0.35); font-family: var(--font-body, system-ui, sans-serif); pointer-events: auto; }
.lh-res-title { font-family: var(--font-display, serif); font-size: 30px; line-height: 1.05; color: var(--sodium, #ffab40); text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6); }
.lh-res-title.bad { color: #ff7a6a; }
.lh-res-sub { margin: 2px 0 8px; font-size: 14px; color: var(--ink-dim, #b9aa92); }
.lh-res table { width: 100%; border-collapse: collapse; font-size: 14px; }
.lh-res th { text-align: left; font-weight: 600; font-size: 12px; color: var(--ink-dim, #b9aa92); border-bottom: 1px solid rgba(255, 255, 255, 0.15); padding: 2px 4px; }
.lh-res td { padding: 3px 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); white-space: nowrap; }
.lh-res tr.me td { color: #ffe08a; font-weight: 700; }
.lh-res td.ok { color: #8fe07a; } .lh-res td.no { color: #ff8a7a; }
.lh-res .stars { letter-spacing: 1px; color: var(--auto-yellow, #f2c230); }
.lh-res-line { margin: 8px 0 2px; font-size: 14px; font-style: italic; color: #e8dcc4; }
.lh-res-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; flex-wrap: wrap; }
@media (max-width: 600px) {
  .lh-hud { min-width: 0; width: calc(100% - 24px); padding: 4px 9px 5px; }
  .lh-title { font-size: 15px; } .lh-time { font-size: 22px; } .lh-l2 { font-size: 11.5px; } .lh-prompt { font-size: 12.5px; }
  .lh-res { padding: 10px 10px 10px; } .lh-res-title { font-size: 24px; } .lh-res table { font-size: 12.5px; }
  .lh-res .c-found, .lh-res .c-rank { display: none; }
}
@media (max-height: 440px) { .lh-hud { padding: 3px 9px 4px; } .lh-l2 { display: none; } .lh-res { max-height: calc(100% - 12px); } }
body.reduced-motion .lh-hud.show { animation: none; } body.reduced-motion .lh-meter.hot { animation: none; }
`;
  function ensureCss() {
    if (G.css || typeof document === 'undefined') return;
    G.css = true;
    const st = document.createElement('style');
    st.id = 'lh-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const HD = { root: null };
  function hudOn() {
    ensureCss();
    const top = document.querySelector('#hud .hud-top') || document.getElementById('ui');
    if (!top) return;
    if (!HD.root) {
      const el = document.createElement('div');
      el.className = 'lh-hud';
      el.innerHTML = '<div class="lh-l1"><span class="lh-title"></span><span class="lh-eye" data-s="0" title="peek"><i></i><b></b></span><span class="lh-time">0:00</span></div>' +
        '<div class="lh-meter"><b></b><span>PAKDA!</span></div><div class="lh-l2"></div><div class="lh-prompt"></div>';
      HD.root = el; HD.title = el.querySelector('.lh-title'); HD.eye = el.querySelector('.lh-eye'); HD.time = el.querySelector('.lh-time');
      HD.meter = el.querySelector('.lh-meter'); HD.bar = el.querySelector('.lh-meter b'); HD.l2 = el.querySelector('.lh-l2'); HD.prompt = el.querySelector('.lh-prompt');
    }
    if (HD.root.parentNode !== top) top.appendChild(HD.root);
    HD.root.classList.add('show');
    HD.sig = '';
  }
  function hudOff() {
    if (HD.root) HD.root.classList.remove('show');
    closeResults(true);
  }
  function peekLevel(k) {
    if (!S || !k || k.done || k.role === 'daddy') return 0;
    if (k.seenBy) return 2;
    let lvl = 0;
    for (const sk of S.seekers.concat(S.virtualSeekers)) {
      const C = sk.cone;
      if (!C || (!C.on && sk.role !== 'chair' && sk.role !== 'window')) continue;
      const d = hyp(k.x - C.x, k.y - C.y);
      const facing = Math.abs(adiff(C.a, Math.atan2(k.y - C.y, k.x - C.x))) < C.half + 0.45;
      if ((d < 34 && facing) || d < 16) return 2;
      if ((d < C.range + 25 && facing) || d < 55) lvl = 1;
    }
    return lvl;
  }
  function hudUpdate() {
    if (!S || !HD.root) return;
    const k = S.me, t = elapsed();
    const limit = S.variant === 'daddy' ? TUNE.daddy.time : TUNE.timeLimit;
    const playing = S.phase === 'play';
    const title = S.variant === 'daddy' ? (k.role === 'daddy' ? 'YOU ARE DADDY' : 'DADDY AA GAYE!') + ' · R' + (S.round + 1) + '/' + S.rounds : k.ghost ? 'GHOST · HELP!' : 'GHAR CHALO!';
    const tm = S.phase === 'intro' ? String(Math.max(1, Math.ceil((S.t0 - S.now()) / 1000))) : fmtT(S.variant === 'daddy' ? Math.max(0, limit - t) : t);
    const warn = playing && (S.variant === 'daddy' ? limit - t < 15 : t > TUNE.warnAt);
    const meter = k.done ? 0 : k.meter;
    const left = S.items.filter((it) => !it.taken).length;
    let l2;
    if (S.variant === 'daddy') {
      l2 = S.kids.map((q) => esc(q.nick) + ' <em>' + (q.pts || 0) + '</em>' + (q.role === 'daddy' ? ' (Daddy)' : q.done === 'home' ? ' home' : q.done === 'caught' ? ' caught' : '')).join(' · ');
    } else {
      const others = S.kids.filter((q) => !q.isMe).map((q) => esc(q.nick) + (q.done === 'home' ? ' home' : q.done ? ' caught' : q.hide === 2 ? ' hiding' : '')).join(' · ');
      l2 = 'SEEN <em>' + k.spots + '</em> · FOUND <em>' + k.coll + '</em>/' + S.items.length + (others ? ' · ' + others : '') + (left && !k.done ? '' : '');
    }
    const eye = String(peekLevel(k));
    const sig = [title, tm, warn, Math.round(meter * 50), l2, S.ui.prompt, eye].join('|');
    if (sig === HD.sig) return;
    HD.sig = sig;
    HD.title.textContent = title;
    HD.time.textContent = tm;
    HD.time.classList.toggle('warn', !!warn);
    HD.bar.style.width = Math.round(meter * 100) + '%';
    HD.meter.classList.toggle('hot', meter > 0.6);
    HD.meter.style.display = S.variant === 'daddy' ? 'none' : '';
    HD.l2.innerHTML = l2;
    HD.prompt.textContent = subst(S.ui.prompt || '').replace(/\*([^*]+)\*/g, '$1');
    HD.eye.dataset.s = eye;
  }
  /* ---------------------------------------------------------------- results */
  const RES = { el: null, openT: 0, keyFn: null };
  function showResults() { if (S) { S.resPending = true; S.resAt = performance.now() + 2600; } } // after the big banner
  function buildResults() {
    if (!S || !S.results) return;
    S.resPending = false;
    ensureCss();
    closeResults(true);
    const ui = document.getElementById('ui') || document.body;
    const el = document.createElement('div');
    el.className = 'lh-res interactive';
    const me = S.results.find((r) => r.uid === S.me.uid) || {};
    const rows = ranked(S.results);
    let title, bad = false;
    if (S.variant === 'daddy') { const best = rows[0]; title = best && best.uid === S.me.uid ? 'SHABASH! YOU WIN' : (best ? best.nick.toUpperCase() + ' WINS' : 'GAME OVER'); }
    else if (me.home) title = me.spots === 0 ? LINES.nobody : LINES.home;
    else { title = LINES.pakda; bad = true; }
    const v = VENUES[S.venue] || VENUES.cafe;
    const sub = S.variant === 'daddy' ? 'Daddy rounds at ' + v.name + ' · ' + S.rounds + (S.rounds === 1 ? ' round' : ' rounds')
      : v.name + ' to home · ' + (me.home ? fmtT(me.time) + ' · seen ' + me.spots + (me.spots === 1 ? ' time' : ' times') : 'walked home by the ear');
    let html = '<div class="lh-res-title' + (bad ? ' bad' : '') + '">' + esc(title) + '</div><div class="lh-res-sub">' + esc(sub) + '</div><table><tr>' +
      '<th class="c-rank">#</th><th>Kid</th>' + (S.variant === 'daddy' ? '<th>Catches</th><th>Points</th>' : '<th>Result</th><th>Time</th><th>Seen</th><th class="c-found">Found</th><th>Score</th>') + '</tr>';
    rows.forEach((r, i) => {
      const stars = '★'.repeat(r.stars || 0) + '☆'.repeat(3 - (r.stars || 0));
      html += '<tr class="' + (r.uid === S.me.uid ? 'me' : '') + '"><td class="c-rank">' + (i + 1) + '</td><td>' + esc(r.nick) + (r.ai ? ' <small>(AI)</small>' : '') + '</td>';
      if (S.variant === 'daddy') html += '<td>' + (r.catches || 0) + '</td><td>' + (r.pts || 0) + '</td>';
      else html += '<td class="' + (r.home ? 'ok' : 'no') + '">' + (r.home ? 'HOME' : 'CAUGHT') + '</td><td>' + (r.home ? fmtT(r.time) : '-') + '</td><td>' + r.spots + '</td><td class="c-found">' + r.coll + '</td><td>' + r.score + ' <span class="stars">' + (r.home ? stars : '') + '</span></td>';
      html += '</tr>';
    });
    html += '</table>';
    const line = S.variant === 'daddy' ? 'Nanna: "Torch batteries are finished. Everybody inside. Now."' : me.home ? (me.spots ? 'Amma: "Hmm. The street lights came on at seven."' : 'Amma never even heard the gate.') : 'Amma: "By the EAR, ' + subst('{nick}') + '?"';
    html += '<div class="lh-res-line">' + esc(line) + '</div><div class="lh-res-row">' +
      (S.mode === 'solo' ? '<button type="button" class="sign-btn small" data-act="again"><kbd>R</kbd> Phir se</button>' : '') +
      '<button type="button" class="sign-btn small alt" data-act="done"><kbd>E</kbd> Aage chalo</button></div>';
    el.innerHTML = html;
    el.addEventListener('pointerdown', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      closeCard(b.dataset.act);
    });
    ui.appendChild(el);
    RES.el = el; RES.openT = performance.now();
    RES.keyFn = (e) => { if (!RES.el || performance.now() - RES.openT < 700) return; if (e.code === 'KeyR' && S && S.mode === 'solo') { e.preventDefault(); closeCard('again'); } };
    window.addEventListener('keydown', RES.keyFn);
  }
  function closeResults(quiet) {
    if (RES.keyFn) window.removeEventListener('keydown', RES.keyFn);
    RES.keyFn = null;
    if (RES.el) { RES.el.remove(); RES.el = null; }
    void quiet;
  }
  function closeCard(act) {
    if (!S) { closeResults(true); return; }
    const again = act === 'again' && S.mode === 'solo';
    const opts = again ? { venue: S.venue, variant: S.variant, difficulty: S.difficulty, friends: S.kids.length > 1 } : null;
    closeResults(true);
    teardown();
    if (again) setTimeout(() => start(opts), 50);
  }
  function uiStep() {
    if (!S) return;
    if (S.resPending && performance.now() >= (S.resAt || 0) && !(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) && N.state.mode === 'play') buildResults();
    if (RES.el && N.state.mode === 'play' && performance.now() - RES.openT > 700 && N.input.pressed('action')) { N.input.consume('action'); closeCard('done'); }
    if (RES.el && N.state.mode === 'play') { N.input.consume('action'); N.interact.offer({ label: 'Aage chalo', priority: 99, dist: 0, use() { /* the card's own key */ } }); }
  }

  /* ================================================================ 2D drawing */
  function blit(ctx, look, x, y, angle, anim, h) {
    const T = N.traffic;
    if (T && T.blitPerson) { T.blitPerson(ctx, look, x, y, angle, anim, h); return; }
    N.draw.sprite(x, y, angle, h == null ? 0.6 : h, (g) => N.people.draw(g, look, anim));
  }
  function drawSeeker2D(ctx, sk) {
    if (sk.role === 'chair' && sk.idle === 'sit') {
      // the red plastic chair (seat + backrest), seen from above
      N.draw.sprite(sk.home.x, sk.home.y, sk.spec.face, 2.5, (g) => {
        g.fillStyle = '#b8282a'; g.fillRect(-4, -4.2, 7.5, 8.4);
        g.fillStyle = '#d8383a'; g.fillRect(-5.6, -4.4, 2.2, 8.8);
        g.strokeStyle = 'rgba(30,10,12,0.6)'; g.lineWidth = 0.5; g.strokeRect(-4, -4.2, 7.5, 8.4);
      });
    }
    blit(ctx, sk.look, sk.x, sk.y, sk.angle, sk.anim, sk.idle === 'sit' ? 1.2 : 0.6);
    if (sk.role === 'watchman' || sk.role === 'hunter') {
      // the torch in his hand
      N.draw.sprite(sk.x, sk.y, sk.cone.a, 6, (g) => { g.fillStyle = '#3a3a40'; g.fillRect(2.5, 2.2, 4.2, 1.6); g.fillStyle = '#fff3c0'; g.fillRect(6.4, 2.0, 1.2, 2.0); });
    }
  }
  function drawEmote2D(ctx, sk) {
    const R = N.render;
    if (sk.role === 'window') {
      // the window: a lit frame on the wall, the aunty's head in it when it is open
      const sp = sk.spec, h = sp.wh || 12;
      const k = R.k(h), X = R.sx(sp.wx, k), Y = R.sy(sp.wy, k);
      const ca = Math.cos(sp.face + Math.PI / 2), sa = Math.sin(sp.face + Math.PI / 2);
      const w = 5 * k;
      ctx.save();
      ctx.translate(X, Y); ctx.rotate(Math.atan2(sa, ca));
      ctx.fillStyle = sk.open ? '#ffd27a' : '#4a5a8a';
      ctx.fillRect(-w, -2.2 * k, w * 2, 4.4 * k);
      ctx.strokeStyle = '#2a1e18'; ctx.lineWidth = Math.max(1, 0.8 * k); ctx.strokeRect(-w, -2.2 * k, w * 2, 4.4 * k);
      if (!sk.open) { ctx.beginPath(); ctx.moveTo(0, -2.2 * k); ctx.lineTo(0, 2.2 * k); ctx.stroke(); }
      ctx.restore();
      if (sk.open) {
        const k2 = R.k(h + 1), hx = R.sx(sk.spec.x, k2), hy = R.sy(sk.spec.y, k2);
        ctx.fillStyle = sk.look.skin || '#a0683f'; ctx.beginPath(); ctx.arc(hx, hy, 2.1 * k2, 0, TAU); ctx.fill();
        ctx.fillStyle = sk.look.hair || '#1a1412'; ctx.beginPath(); ctx.arc(hx - Math.cos(sp.face) * 0.9 * k2, hy - Math.sin(sp.face) * 0.9 * k2, 1.7 * k2, 0, TAU); ctx.fill();
      }
    }
    if (sk.emoteT <= 0 || !sk.emote) return;
    const bx = sk.role === 'window' ? sk.spec.x : sk.role === 'daddy' && sk.vehicle ? sk.vehicle.x : sk.x;
    const by = sk.role === 'window' ? sk.spec.y : sk.role === 'daddy' && sk.vehicle ? sk.vehicle.y : sk.y;
    const k = R.k(20), X = Math.round(R.sx(bx, k)), Y = Math.round(R.sy(by, k)) - 10;
    const bob = Math.round(Math.sin((N.time.real || 0) * 8));
    ctx.fillStyle = '#1a1214'; ctx.fillRect(X - 5, Y - 7 + bob, 10, 12);
    if (sk.emote === '!') { ctx.fillStyle = '#ff4a3a'; ctx.fillRect(X - 1, Y - 5 + bob, 2, 6); ctx.fillRect(X - 1, Y + 2 + bob, 2, 2); }
    else if (sk.emote === '?') { ctx.fillStyle = '#f2c230'; ctx.fillRect(X - 2, Y - 5 + bob, 4, 1); ctx.fillRect(X + 1, Y - 4 + bob, 1, 2); ctx.fillRect(X - 1, Y - 2 + bob, 2, 1); ctx.fillRect(X - 1, Y + 2 + bob, 2, 2); }
    else { ctx.fillStyle = '#9ab8ff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText('z', X, Y + 2 + bob); }
  }
  function drawKid2D(ctx, e) {
    const k = e.k;
    if (k && k.hide === 2) return; // peeking head is drawn by the session
    blit(ctx, e.look, e.x, e.y, e.angle, e.anim, 0.6);
  }
  function drawDog2D(ctx, g) {
    N.draw.sprite(g.x, g.y, g.angle, 1.5, (c) => {
      const a = g.col[0], b = g.col[1];
      if (g.state === 'nap') {
        c.fillStyle = a; c.beginPath(); c.ellipse(0, 0, 3.6, 3, 0, 0, TAU); c.fill();
        c.fillStyle = b; c.beginPath(); c.arc(2.2, -1.2, 1.5, 0, TAU); c.fill();
        c.strokeStyle = b; c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 3.2, 2.2, 3.6); c.stroke();
      } else {
        c.fillStyle = a; c.beginPath(); c.ellipse(-0.6, 0, 4.2, 1.9, 0, 0, TAU); c.fill();
        c.beginPath(); c.arc(3.8, 0, 1.7, 0, TAU); c.fill();
        c.fillStyle = b; c.fillRect(3.2, -1.9, 1.1, 1); c.fillRect(3.2, 0.9, 1.1, 1);
        c.strokeStyle = a; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-4.6, 0); c.lineTo(-6.4, Math.sin((N.time.real || 0) * 20) * 1.2); c.stroke();
        if (g.state === 'bark') { c.strokeStyle = 'rgba(255,240,200,0.8)'; c.lineWidth = 0.6; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(5.2, 0, 2 + i * 1.6, -0.6, 0.6); c.stroke(); } }
      }
    });
  }
  const CONE_COL = {
    walker: [255, 196, 90], chair: [255, 196, 90], window: [255, 150, 190], watchman: [255, 238, 180], daddy: [255, 248, 220], hunter: [255, 238, 180],
  };
  function drawCone2D(ctx, sk, alert) {
    const C = sk.cone, P = C.poly;
    if (!C.on || !P) return;
    const R = N.render, k = R.k(0);
    const light = sk.role === 'watchman' || sk.role === 'daddy' || sk.role === 'hunter';
    const col = alert ? [255, 90, 70] : CONE_COL[sk.role] || CONE_COL.walker;
    ctx.beginPath();
    ctx.moveTo(R.sx(P[0], k), R.sy(P[1], k));
    for (let i = 2; i < P.length; i += 2) ctx.lineTo(R.sx(P[i], k), R.sy(P[i + 1], k));
    ctx.closePath();
    const ox = R.sx(C.x, k), oy = R.sy(C.y, k);
    const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, Math.max(4, C.range * k));
    const a0 = light ? 0.42 : 0.26, a1 = light ? 0.08 : 0.05;
    g.addColorStop(0, 'rgba(' + col.join(',') + ',' + a0 + ')');
    g.addColorStop(1, 'rgba(' + col.join(',') + ',' + a1 + ')');
    ctx.globalCompositeOperation = light ? 'lighter' : 'source-over';
    ctx.fillStyle = g; ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(' + col.join(',') + ',' + (alert ? 0.75 : 0.42) + ')';
    ctx.lineWidth = 1;
    if (!light) ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawSessionGround(ctx) {
    if (!S) return;
    const R = N.render, k = R.k(0), T = N.time.real || 0, me = S.me, p = N.player;
    // doors: mine (pink, pulsing) and the friends' (faint)
    for (const kid of S.kids) {
      if (kid.role === 'daddy') continue;
      const d = S.C.doors[kid.uid];
      if (!R.inView(d.x, d.y, 30)) continue;
      const mine = kid === me, X = R.sx(d.x, k), Y = R.sy(d.y, k);
      const pulse = 0.5 + 0.5 * Math.sin(T * 4);
      ctx.strokeStyle = mine ? 'rgba(255,95,176,' + (0.55 + 0.35 * pulse) + ')' : 'rgba(180,200,255,0.35)';
      ctx.lineWidth = mine ? 2 : 1;
      ctx.beginPath(); ctx.arc(X, Y, (TUNE.doorR - 2 + (mine ? pulse * 2 : 0)) * k, 0, TAU); ctx.stroke();
      if (mine) { ctx.fillStyle = 'rgba(255,95,176,0.16)'; ctx.fill(); }
    }
    // hiding spots near me
    if (me && !me.done && me.role !== 'daddy') {
      for (const h of S.C.hides) {
        const d = hyp(h.x - p.x, h.y - p.y);
        if (d > 70 || !R.inView(h.x, h.y, 20)) continue;
        const on = d < h.r;
        ctx.strokeStyle = on ? 'rgba(160,255,190,0.85)' : 'rgba(220,235,255,' + (0.45 * (1 - d / 70) + 0.1).toFixed(2) + ')';
        ctx.lineWidth = on ? 1.5 : 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(R.sx(h.x, k), R.sy(h.y, k), h.r * 0.7 * k, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // collectibles
    for (const it of S.items) {
      if (it.taken || !R.inView(it.x, it.y, 10)) continue;
      const X = R.sx(it.x, k), Y = R.sy(it.y, k);
      if (it.kind === 'goli') {
        ctx.fillStyle = '#2f9a8a'; ctx.beginPath(); ctx.arc(X, Y, 1.6 * k, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e8fff4'; ctx.fillRect(X - 0.6 * k, Y - 0.9 * k, 0.7 * k, 0.7 * k);
      } else {
        ctx.fillStyle = '#b8864a'; ctx.fillRect(X - 2.2 * k, Y - 1.4 * k, 4.4 * k, 2.8 * k);
        ctx.fillStyle = '#ff5fb0'; ctx.fillRect(X - 1.6 * k, Y - 1.4 * k, 3.2 * k, 2.8 * k);
        ctx.strokeStyle = 'rgba(255,95,176,0.7)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(X + 1.6 * k, Y); ctx.quadraticCurveTo(X + 5 * k, Y - 3 * k, X + 7 * k, Y + 1 * k); ctx.stroke();
      }
    }
  }
  function wallPoly(w) {
    const dx = w.bx - w.ax, dy = w.by - w.ay, L = hyp(dx, dy) || 1, nx = -dy / L * 1.4, ny = dx / L * 1.4;
    return [[w.ax + nx, w.ay + ny], [w.bx + nx, w.by + ny], [w.bx - nx, w.by - ny], [w.ax - nx, w.ay - ny]];
  }
  function rotRect(x, y, a, hw, hd) {
    const c = Math.cos(a), s = Math.sin(a);
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, ly]) => [x + c * lx - s * ly, y + s * lx + c * ly]);
  }
  function drawSessionLight(ctx) {
    if (!S) return;
    const R = N.render, T = N.time.real || 0;
    for (const sk of S.seekers) {
      const C = sk.cone;
      if (!C.on || !C.poly || !R.inView(C.x, C.y, C.range + 10)) continue;
      drawCone2D(ctx, sk, !!(sk.track && sk.trackT > 0));
    }
    for (const vs of S.virtualSeekers) if (vs.cone.on && vs.cone.poly) drawCone2D(ctx, vs, false);
    // sparkles on the collectibles (they glint at night)
    const k = R.k(1.5);
    for (const it of S.items) {
      if (it.taken || !R.inView(it.x, it.y, 10)) continue;
      const tw = 0.5 + 0.5 * Math.sin(T * 5 + it.x);
      ctx.fillStyle = 'rgba(255,255,220,' + (0.35 + 0.5 * tw).toFixed(2) + ')';
      const X = R.sx(it.x, k), Y = R.sy(it.y, k), r = (1.5 + tw * 2) * k;
      ctx.fillRect(X - r, Y - 0.4, r * 2, 0.8); ctx.fillRect(X - 0.4, Y - r, 0.8, r * 2);
    }
    // hidden kids peek out: the head and the eye
    for (const kid of S.kids) {
      if (kid.hide !== 2 || kid.done || kid.ghost || kid.role === 'daddy') continue;
      if (S.me && S.me.role === 'daddy' && kid !== S.me) continue;
      const e = kid.isMe ? N.player : kid.ent;
      if (!e && !kid.net) continue;
      const x = kid.isMe ? N.player.x : kid.x, y = kid.isMe ? N.player.y : kid.y;
      if (!R.inView(x, y, 10)) continue;
      const kk = R.k(4), X = R.sx(x, kk), Y = R.sy(y, kk);
      const L = kid.look || {};
      ctx.fillStyle = 'rgba(10,8,16,0.55)'; ctx.beginPath(); ctx.ellipse(X, Y + 1.5 * kk, 4 * kk, 2.4 * kk, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = L.skin || '#b97a4f'; ctx.beginPath(); ctx.arc(X, Y, 2.1 * kk, 0, TAU); ctx.fill();
      ctx.fillStyle = L.hair || '#1a1412'; ctx.beginPath(); ctx.arc(X, Y - 0.6 * kk, 1.9 * kk, Math.PI, TAU); ctx.fill();
      if (kid.isMe) {
        const lv = peekLevel(kid), ey = Y - 7 * kk;
        const col = lv === 2 ? '#ff5a4a' : lv === 1 ? '#ffd36a' : '#c9d4ff';
        ctx.strokeStyle = col; ctx.fillStyle = '#10122a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(X, ey, 4.2, lv === 0 ? 0.6 : lv === 1 ? 1.8 : 2.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
        if (lv > 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, ey, lv === 1 ? 1 : 1.5, 0, TAU); ctx.fill(); }
      }
    }
  }
  function drawSessionStructures() {
    if (!S) return;
    const R = N.render, D = N.draw;
    for (const l of S.C.lamps) {
      if (!R.inView(l.x, l.y, 30)) continue;
      R.queue('structures', R.distKey(l.x, l.y), () => {
        D.cyl(l.x, l.y, 0.7, 0, 17, { wall: '#4a4a52', roof: '#2a2a30', grad: false });
        D.disc(l.x, l.y, 2.1, 17.2, '#ffe2a0');
      });
    }
    for (const w of S.C.walls) {
      const cx = (w.ax + w.bx) / 2, cy = (w.ay + w.by) / 2;
      if (!R.inView(cx, cy, 30)) continue;
      R.queue('structures', R.distKey(cx, cy), () => D.poly(wallPoly(w), 0, w.h, { wall: '#c8b89a', roof: '#ded2b8' }));
    }
    for (const pn of S.C.pans) {
      if (!R.inView(pn.x, pn.y, 30)) continue;
      R.queue('structures', R.distKey(pn.x, pn.y), () => {
        D.poly(rotRect(pn.x, pn.y, pn.a, 6, 4), 0, 7, { wall: '#7a4a2a', roof: '#5a3a1a' });
        D.poly(rotRect(pn.x, pn.y, pn.a, 7, 5), 10, 10.8, { wall: '#2a6a3a', roof: '#3a8a4a' });
        D.pixelText(pn.x, pn.y, 11.5, 'PAN', '#f2c230', { shadow: true });
      });
    }
    // the friends' doors: a floating house sign
    const T = N.time.real || 0;
    for (const kid of S.kids) {
      if (kid.role === 'daddy' || kid.done) continue;
      const d = S.C.doors[kid.uid];
      if (!R.inView(d.x, d.y, 30)) continue;
      const mine = kid === S.me;
      R.queue('sky', 1, (ctx) => {
        const k = R.k(16 + Math.sin(T * 3) * 1.2), X = Math.round(R.sx(d.x, k)), Y = Math.round(R.sy(d.y, k));
        ctx.fillStyle = mine ? '#ff5fb0' : 'rgba(180,200,255,0.8)';
        ctx.beginPath(); ctx.moveTo(X - 5, Y - 1); ctx.lineTo(X, Y - 6); ctx.lineTo(X + 5, Y - 1); ctx.closePath(); ctx.fill();
        ctx.fillRect(X - 3.5, Y - 1, 7, 5);
        ctx.fillStyle = '#1a1214'; ctx.fillRect(X - 1, Y + 1, 2, 3);
        if (!mine) D.pixelText(d.x, d.y, 24, kid.nick.toUpperCase().slice(0, 8), '#c8d4ff', { shadow: true });
        else D.pixelText(d.x, d.y, 24, 'HOME', '#ff9fd0', { shadow: true });
      });
    }
  }
  function pushLights() {
    if (!S) return;
    const R = N.render;
    if (!R.lights) return;
    const T = N.time.real || 0, p = N.player;
    for (const l of S.C.lamps) if (hyp(l.x - p.x, l.y - p.y) < 520) R.lights.push({ x: l.x, y: l.y, r: TUNE.lampR, color: '#ffb35a', intensity: 0.85, h: 17 });
    for (const tv of S.C.tvs) {
      if (hyp(tv.x - p.x, tv.y - p.y) > 420) continue;
      const f = 0.45 + 0.25 * Math.sin(T * 9 + tv.ph) + 0.15 * Math.sin(T * 23 + tv.ph * 3);
      R.lights.push({ x: tv.x + Math.cos(tv.a) * 6, y: tv.y + Math.sin(tv.a) * 6, r: 15, color: '#7aa8ff', intensity: clamp(f, 0.2, 0.9), h: tv.h, glow: false });
    }
    const torch = (C) => { for (let i = 1; i <= 3; i++) { const d = C.range * i / 3.6; R.lights.push({ x: C.x + Math.cos(C.a) * d, y: C.y + Math.sin(C.a) * d, r: 14 + i * 9, color: '#fff2c0', intensity: 0.7 - i * 0.12, glow: false }); } };
    for (const sk of S.seekers) if ((sk.role === 'watchman' || sk.role === 'hunter') && sk.cone.on && hyp(sk.x - p.x, sk.y - p.y) < 500) torch(sk.cone);
    for (const vs of S.virtualSeekers) if (vs.cone.on && !(S.me.role === 'daddy' && N.player.vehicle)) torch(vs.cone);
    for (const k of S.kids) {
      if (k.done === 'home' || (k.hide === 2 && S.me.role === 'daddy' && !k.isMe)) continue;
      const x = k.isMe ? p.x : k.x, y = k.isMe ? p.y : k.y;
      if (hyp(x - p.x, y - p.y) < 400) R.lights.push({ x, y, r: k.isMe ? 16 : 11, color: k.isMe ? '#ffe9c8' : '#d8e4ff', intensity: k.isMe ? 0.5 : 0.35, glow: false });
    }
    for (const sk of S.seekers) if (sk.role !== 'window' && sk.role !== 'daddy' && hyp(sk.x - p.x, sk.y - p.y) < 420) R.lights.push({ x: sk.x, y: sk.y, r: 10, color: '#ffe0c0', intensity: 0.3, glow: false });
    for (const sk of S.seekers) if (sk.role === 'window' && sk.open) R.lights.push({ x: sk.spec.x, y: sk.spec.y, r: 12, color: '#ffd27a', intensity: 0.6, h: sk.spec.wh, glow: false });
  }
  function drawSession() {
    if (!S) return;
    pushLights();
    if (is3D()) return;
    const R = N.render;
    R.queue('ground', 7, drawSessionGround);
    drawSessionStructures();
    R.queue('light', 50, drawSessionLight);
    const me = S.me, p = N.player;
    if (me && me.ghost) {
      R.queue('actors', p.y, (ctx) => { ctx.globalAlpha = 0.42; blit(ctx, p.look, p.x, p.y, p.angle, p.anim, 0.6); ctx.globalAlpha = 1; });
      R.queue('fx', 5, () => N.draw.pixelText(p.x, p.y, 20, 'GHOST', '#bfe0ff', { shadow: true }));
    }
    // remote kids drawn by online ghosts: a ring under them (dark = hiding)
    for (const kid of S.kids) {
      if (kid.isMe || kid.isAI || kid.ent || !kid.net || kid.done === 'home') continue;
      if (!R.inView(kid.x, kid.y, 10)) continue;
      R.queue('ground', 8, (ctx) => { const k = R.k(0); ctx.strokeStyle = kid.hide === 2 ? 'rgba(160,255,190,0.8)' : 'rgba(180,200,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(R.sx(kid.x, k), R.sy(kid.y, k), 6 * k, 0, TAU); ctx.stroke(); });
    }
  }

  /* ================================================================ 3D layer (view3d.js registerLayer) */
  const V3 = { ok: false, T: null, H: null, root: null, sess: null, cones: [], lamps: [], walls: [], pans: [], chairs: [], wins: [], tvs: [], doors: [], items: [], rings: [], heads: [], ghost: null, mats: {} };
  function v3Init(THREE, H) {
    V3.T = THREE; V3.H = H;
    const g = new THREE.Group(); g.name = 'latehome'; g.visible = false;
    H.layer.add(g); V3.root = g;
    const own = (hex, o) => { const m = H.mat(hex, o).clone(); m.userData = {}; return m; };
    V3.own = own;
    V3.geo = {
      pole: new THREE.CylinderGeometry(0.45, 0.6, 1, 6), head: new THREE.SphereGeometry(1.6, 10, 8), disc: new THREE.CircleGeometry(1, 28),
      ring: new THREE.RingGeometry(0.82, 1, 36), box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 14, 10), spool: new THREE.CylinderGeometry(1, 1, 1, 12),
      cone: new THREE.ConeGeometry(1, 1, 4), plane: new THREE.PlaneGeometry(1, 1),
    };
    V3.mats = {
      pole: H.mat('#4a4a52'), head: H.mat('#ffe2a0', { emissive: '#ffcf70', emissiveIntensity: 1.6 }),
      pool: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      wall: H.mat('#c8b89a'), wallTop: H.mat('#ded2b8'), pan: H.mat('#7a4a2a'), panTop: H.mat('#2f7a42'), chair: H.mat('#c0282a'),
      win: own('#ffd27a', { emissive: '#ffc060', emissiveIntensity: 1.2 }), winOff: H.mat('#3a4a7a', { emissive: '#22305a', emissiveIntensity: 0.6 }),
      tv: new THREE.MeshBasicMaterial({ color: 0x7aa8ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
      doorMine: new THREE.MeshBasicMaterial({ color: 0xff5fb0, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      doorOther: new THREE.MeshBasicMaterial({ color: 0xb4c8ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      house: H.mat('#ff5fb0', { emissive: '#ff5fb0', emissiveIntensity: 0.8 }), houseOther: H.mat('#b4c8ff', { emissive: '#8aa0e0', emissiveIntensity: 0.6 }),
      goli: H.mat('#2f9a8a', { emissive: '#2a8a7a', emissiveIntensity: 0.5 }), manja: H.mat('#ff5fb0', { emissive: '#c03080', emissiveIntensity: 0.4 }),
      hide: new THREE.MeshBasicMaterial({ color: 0xdceaff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      hideOn: new THREE.MeshBasicMaterial({ color: 0xa0ffbe, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      skin: H.mat('#b97a4f'), hair: H.mat('#1a1412'),
      ghost: new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    };
    V3.eyeMat = [0, 1, 2].map((i) => new THREE.SpriteMaterial({ map: eyeTex(THREE, i), transparent: true, depthWrite: false, depthTest: false }));
    V3.ok = true;
  }
  function eyeTex(THREE, lvl) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 40;
    const g = c.getContext('2d');
    const col = lvl === 2 ? '#ff5a4a' : lvl === 1 ? '#ffd36a' : '#c9d4ff';
    g.fillStyle = '#10122a'; g.strokeStyle = col; g.lineWidth = 5;
    g.beginPath(); g.ellipse(32, 20, 26, lvl === 0 ? 4 : lvl === 1 ? 11 : 16, 0, 0, TAU); g.fill(); g.stroke();
    if (lvl > 0) { g.fillStyle = col; g.beginPath(); g.arc(32, 20, lvl === 1 ? 6 : 9, 0, TAU); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    return t;
  }
  function v3Clear() {
    const H = V3.H;
    if (!V3.root) return;
    for (const o of V3.root.children.slice()) { V3.root.remove(o); if (o.userData && o.userData.ownGeo && o.geometry) o.geometry.dispose(); }
    V3.cones = []; V3.lamps = []; V3.walls = []; V3.pans = []; V3.chairs = []; V3.wins = []; V3.tvs = []; V3.doors = []; V3.items = []; V3.rings = []; V3.heads = []; V3.ghost = null; V3.vcone = [];
    void H;
  }
  function mk(geo, mat, x, y, z, sx, sy, sz) {
    const m = new V3.T.Mesh(geo, mat);
    m.position.set(x, y, z); if (sx != null) m.scale.set(sx, sy, sz);
    m.userData.noShadow = true; m.castShadow = false; m.receiveShadow = false;
    V3.root.add(m);
    return m;
  }
  const CONE_COL3D = { walker: [255, 150, 40], chair: [255, 150, 40], window: [255, 90, 170], watchman: [255, 226, 140], daddy: [255, 240, 200], hunter: [255, 226, 140] };
  function coneMesh(role) {
    const THREE = V3.T, n = 30;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((n + 2) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
    geo.setIndex(idx);
    const light = role === 'watchman' || role === 'daddy' || role === 'hunter';
    const col = (CONE_COL3D[role] || CONE_COL3D.walker);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255), transparent: true, opacity: light ? 0.34 : 0.3, depthWrite: false, side: THREE.DoubleSide, blending: light ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    m.userData.noShadow = true; m.userData.ownGeo = true; m.renderOrder = 3; m.frustumCulled = false;
    V3.root.add(m);
    // the rim (outer arc and the two sides) so the fan reads at a glance
    const lgeo = new THREE.BufferGeometry();
    const lpos = new Float32Array((n + 3) * 3);
    lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
    const lmat = new THREE.LineBasicMaterial({ color: new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const line = new THREE.Line(lgeo, lmat);
    line.userData.ownGeo = true; line.renderOrder = 4; line.frustumCulled = false;
    V3.root.add(line);
    return { m, pos, n, col, light, line, lpos };
  }
  function v3Build() {
    const THREE = V3.T, M = V3.mats, G3 = V3.geo, VS = V3.H.VS || 1.5;
    v3Clear();
    V3.sess = S;
    if (!S) return;
    for (const sk of S.seekers) V3.cones.push(Object.assign(coneMesh(sk.role), { sk }));
    for (const l of S.C.lamps) {
      const h = 17 * VS;
      mk(G3.pole, M.pole, l.x, h / 2, l.y, 1, h, 1);
      const hd = mk(G3.head, M.head, l.x, h, l.y);
      const pool = mk(G3.disc, M.pool, l.x, 0.6, l.y, TUNE.lampR * 0.8, TUNE.lampR * 0.8, 1); pool.rotation.x = -Math.PI / 2;
      const gl = V3.H.glow('#ffb050', 14); gl.position.set(l.x, h, l.y); V3.root.add(gl);
      V3.lamps.push({ hd, pool, gl, l });
    }
    for (const w of S.C.walls) {
      const L = hyp(w.bx - w.ax, w.by - w.ay), a = Math.atan2(w.by - w.ay, w.bx - w.ax), h = w.h * VS;
      const m = mk(G3.box, M.wall, (w.ax + w.bx) / 2, h / 2, (w.ay + w.by) / 2, L, h, 2.6); m.rotation.y = -a; m.castShadow = true;
      const t = mk(G3.box, M.wallTop, (w.ax + w.bx) / 2, h + 0.3, (w.ay + w.by) / 2, L + 0.6, 0.6, 3.2); t.rotation.y = -a;
    }
    for (const pn of S.C.pans) {
      const b = mk(G3.box, M.pan, pn.x, 3.5 * VS, pn.y, 12, 7 * VS, 8); b.rotation.y = -pn.a;
      const r = mk(G3.box, M.panTop, pn.x, 10.4 * VS, pn.y, 14, 1, 10); r.rotation.y = -pn.a;
      try {
        const tex = V3.H.tex('lh-pan-sign', 128, 48, (g, w, h) => { g.fillStyle = '#2a6a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c230'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PAN', w / 2, h / 2 + 2); });
        const s = new THREE.Mesh(G3.plane, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        s.position.set(pn.x + Math.cos(pn.a) * 6.2, 8.6 * VS, pn.y + Math.sin(pn.a) * 6.2); s.scale.set(10, 3.8, 1); s.rotation.y = -pn.a + Math.PI / 2;
        s.userData.noShadow = true; V3.root.add(s);
      } catch (e) { N.err('latehome.v3sign', e); }
    }
    for (const sk of S.seekers) {
      if (sk.role === 'chair') {
        const g = new THREE.Group(); g.position.set(sk.home.x, 0, sk.home.y); g.rotation.y = -sk.spec.face;
        const seat = new THREE.Mesh(G3.box, M.chair); seat.scale.set(5.2, 0.5, 5.2); seat.position.set(0.3, 3.3, 0); g.add(seat);
        const back = new THREE.Mesh(G3.box, M.chair); back.scale.set(0.5, 4.6, 5.2); back.position.set(-2.5, 5.6, 0); g.add(back);
        for (const [lx, lz] of [[-2, -2.2], [2.4, -2.2], [-2, 2.2], [2.4, 2.2]]) { const leg = new THREE.Mesh(G3.box, M.chair); leg.scale.set(0.45, 3.2, 0.45); leg.position.set(lx, 1.6, lz); g.add(leg); }
        V3.root.add(g); V3.chairs.push({ g, sk });
      } else if (sk.role === 'window') {
        const sp = sk.spec, h = (sp.wh || 12) * VS;
        const fr = mk(G3.plane, M.winOff, sp.wx + Math.cos(sp.face) * 0.35, h, sp.wy + Math.sin(sp.face) * 0.35, 9, 6.5, 1);
        fr.rotation.y = -sp.face + Math.PI / 2;
        const lit = mk(G3.plane, M.win, sp.wx + Math.cos(sp.face) * 0.4, h, sp.wy + Math.sin(sp.face) * 0.4, 8.4, 6, 1); lit.rotation.y = -sp.face + Math.PI / 2;
        const L = sk.look || {};
        const head = mk(G3.sphere, V3.H.mat(L.skin || '#a0683f'), sp.x, h + 0.4, sp.y, 1.9, 2.1, 1.9);
        const bun = mk(G3.sphere, V3.H.mat(L.hair || '#1a1412'), sp.x - Math.cos(sp.face) * 1.2, h + 1.4, sp.y - Math.sin(sp.face) * 1.2, 1.7, 1.6, 1.7);
        V3.wins.push({ fr, lit, head, bun, sk });
      }
    }
    for (const tv of S.C.tvs) {
      const m = mk(G3.plane, M.tv.clone(), tv.x + Math.cos(tv.a) * 0.5, tv.h * VS, tv.y + Math.sin(tv.a) * 0.5, 6, 4.5, 1);
      m.material.userData = {}; m.rotation.y = -tv.a + Math.PI / 2;
      V3.tvs.push({ m, tv });
    }
    for (const kid of S.kids) {
      const d = S.C.doors[kid.uid], mine = kid === S.me;
      const ring = mk(G3.ring, mine ? M.doorMine : M.doorOther, d.x, 0.7, d.y, TUNE.doorR, TUNE.doorR, 1); ring.rotation.x = -Math.PI / 2;
      const house = new THREE.Group();
      const body = new THREE.Mesh(G3.box, mine ? M.house : M.houseOther); body.scale.set(4.4, 3.4, 4.4); body.position.y = 1.7; house.add(body);
      const roof = new THREE.Mesh(G3.cone, mine ? M.house : M.houseOther); roof.scale.set(4.2, 3, 4.2); roof.position.y = 4.9; roof.rotation.y = Math.PI / 4; house.add(roof);
      house.position.set(d.x, 22, d.y); V3.root.add(house);
      V3.doors.push({ ring, house, kid });
    }
    for (const it of S.items) {
      const m = it.kind === 'goli' ? mk(G3.sphere, M.goli, it.x, 1.6, it.y, 1.3, 1.3, 1.3) : mk(G3.spool, M.manja, it.x, 1.6, it.y, 2.2, 2.6, 2.2);
      const gl = V3.H.glow(it.kind === 'goli' ? '#9affea' : '#ff9fd0', 7); gl.position.set(it.x, 3.2, it.y); V3.root.add(gl);
      V3.items.push({ m, gl, it });
    }
    for (let i = 0; i < 6; i++) { const r = mk(G3.ring, M.hide, 0, 0.8, 0, 1, 1, 1); r.rotation.x = -Math.PI / 2; r.visible = false; V3.rings.push(r); }
    for (let i = 0; i < 4; i++) {
      const head = mk(G3.sphere, M.skin, 0, 0, 0, 1.25, 1.3, 1.25); head.visible = false;
      const hair = mk(G3.sphere, M.hair, 0, 0, 0, 1.32, 0.75, 1.32); hair.visible = false;
      const eye = new THREE.Sprite(V3.eyeMat[0]); eye.scale.set(6, 3.75, 1); eye.visible = false; V3.root.add(eye);
      V3.heads.push({ head, hair, eye });
    }
    const gh = mk(G3.sphere, M.ghost, 0, 0, 0, 4, 7, 4); gh.visible = false; V3.ghost = gh;
    V3.vcone = [];
  }
  function v3Update(dt) {
    if (!V3.ok) return;
    if (!S) { if (V3.sess) { v3Clear(); V3.sess = null; } V3.root.visible = false; return; }
    if (V3.sess !== S) v3Build();
    V3.root.visible = true;
    const T = N.time.real || 0, p = N.player, VS = V3.H.VS || 1.5;
    // cones (a fan clipped by the buildings, the same polygon the 2D view draws)
    const fill = (c, C, alert) => {
      const P = C.poly;
      c.m.visible = !!(C.on && P);
      if (c.line) c.line.visible = c.m.visible;
      if (!c.m.visible) return;
      const n = Math.min(c.n + 1, (P.length - 2) / 2);
      const pos = c.pos, y = 0.9;
      pos[0] = P[0]; pos[1] = y; pos[2] = P[1];
      for (let i = 0; i < c.n + 1; i++) { const j = Math.min(i, n - 1); pos[3 + i * 3] = P[2 + j * 2]; pos[4 + i * 3] = y; pos[5 + i * 3] = P[3 + j * 2]; }
      c.m.geometry.attributes.position.needsUpdate = true;
      c.m.geometry.computeBoundingSphere();
      const L = c.lpos, y2 = y + 0.15;
      L[0] = P[0]; L[1] = y2; L[2] = P[1];
      for (let i = 0; i <= c.n; i++) { const j = Math.min(i, n - 1); L[3 + i * 3] = P[2 + j * 2]; L[4 + i * 3] = y2; L[5 + i * 3] = P[3 + j * 2]; }
      const e = (c.n + 2) * 3; L[e] = P[0]; L[e + 1] = y2; L[e + 2] = P[1];
      c.line.geometry.attributes.position.needsUpdate = true;
      c.line.visible = true;
      const col = alert ? [255, 90, 70] : c.col;
      c.m.material.color.setRGB(col[0] / 255, col[1] / 255, col[2] / 255);
      c.line.material.color.setRGB(col[0] / 255, col[1] / 255, col[2] / 255);
      c.m.material.opacity = (c.light ? 0.3 : 0.36) * (alert ? 1.3 : 1);
    };
    for (const c of V3.cones) fill(c, c.sk.cone, !!(c.sk.track && c.sk.trackT > 0));
    while (V3.vcone.length < S.virtualSeekers.length) V3.vcone.push(coneMesh('hunter'));
    V3.vcone.forEach((c, i) => { const vs = S.virtualSeekers[i]; if (!vs) { c.m.visible = false; return; } fill(c, vs.cone, false); });
    for (const L of V3.lamps) { const f = 0.85 + 0.05 * Math.sin(T * 13 + L.l.x); L.gl.material.opacity = f; }
    for (const w of V3.wins) { const o = w.sk.open; w.lit.visible = o; w.head.visible = o; w.bun.visible = o; }
    for (const t of V3.tvs) t.m.material.opacity = clamp(0.45 + 0.25 * Math.sin(T * 9 + t.tv.ph) + 0.15 * Math.sin(T * 23 + t.tv.ph * 3), 0.15, 0.95);
    for (const d of V3.doors) {
      const vis = d.kid.role !== 'daddy' && !d.kid.done;
      d.ring.visible = vis; d.house.visible = vis;
      d.house.rotation.y = T * 1.2; d.house.position.y = 20 + Math.sin(T * 2.5) * 1.5;
      const s = d.kid === S.me ? 1 + 0.12 * Math.sin(T * 4) : 0.8; d.ring.scale.set(TUNE.doorR * s, TUNE.doorR * s, 1);
    }
    for (const it of V3.items) { const v = !it.it.taken; it.m.visible = v; it.gl.visible = v; it.m.rotation.y = T * 2; it.gl.material.opacity = 0.5 + 0.4 * Math.sin(T * 5 + it.it.x); }
    // hiding spots near me
    let ri = 0;
    if (S.me && !S.me.done && S.me.role !== 'daddy') {
      for (const h of S.C.hides) {
        if (ri >= V3.rings.length) break;
        const d = hyp(h.x - p.x, h.y - p.y);
        if (d > 70) continue;
        const r = V3.rings[ri++];
        r.visible = true; r.position.set(h.x, 0.8, h.y); r.scale.set(h.r * 0.7, h.r * 0.7, 1);
        r.material = d < h.r ? V3.mats.hideOn : V3.mats.hide;
      }
    }
    for (; ri < V3.rings.length; ri++) V3.rings[ri].visible = false;
    // peeking heads of hidden kids (and the peek eye over mine)
    let hi = 0;
    for (const kid of S.kids) {
      if (hi >= V3.heads.length) break;
      if (kid.hide !== 2 || kid.done || kid.ghost || kid.role === 'daddy') continue;
      if (S.me.role === 'daddy' && kid !== S.me) continue;
      const x = kid.isMe ? p.x : kid.x, y = kid.isMe ? p.y : kid.y;
      const H3 = V3.heads[hi++];
      H3.head.visible = true; H3.hair.visible = true;
      H3.head.position.set(x, 3.0 * VS, y); H3.hair.position.set(x, 3.0 * VS + 0.7, y);
      H3.head.material = V3.H.mat((kid.look && kid.look.skin) || '#b97a4f'); H3.hair.material = V3.H.mat((kid.look && kid.look.hair) || '#1a1412');
      H3.eye.visible = kid.isMe;
      if (kid.isMe) { H3.eye.material = V3.eyeMat[peekLevel(kid)]; H3.eye.position.set(x, 6.4 * VS, y); }
    }
    for (; hi < V3.heads.length; hi++) { const H3 = V3.heads[hi]; H3.head.visible = H3.hair.visible = H3.eye.visible = false; }
    // the ghost: a pale wisp where I am
    if (V3.ghost) { const g = S.me && S.me.ghost; V3.ghost.visible = !!g; if (g) { V3.ghost.position.set(p.x, 5 + Math.sin(T * 3) * 0.6, p.y); V3.ghost.material.opacity = 0.25 + 0.1 * Math.sin(T * 4); } }
    // emotes for the person renderer
    for (const sk of S.seekers) sk.emoteSt = sk.emoteT > 0 && sk.emote ? { kind: sk.emote === 'z' ? 'zzz' : sk.emote, t: Math.max(0, 1.4 - sk.emoteT), secs: 1.4 } : null;
    void dt;
  }
  function v3Dispose() { v3Clear(); V3.ok = false; V3.sess = null; }
  function registerV3() {
    if (registerV3.done || !N.view3d || !N.view3d.registerLayer) return;
    registerV3.done = true;
    N.view3d.registerLayer('latehome', {
      order: 62,
      init(THREE, H) { try { v3Init(THREE, H); } catch (e) { N.err('latehome.v3init', e); } },
      update(dt) { try { v3Update(dt); } catch (e) { N.err('latehome.v3', e); } },
      dispose() { v3Dispose(); },
    });
  }

  /* ================================================================ solo entry: "Late! Ghar chalo" at dusk */
  function eligible(vid) {
    if (S) return 'busy';
    if (!N.world || !N.world.built) return 'world';
    if (N.state.mode !== 'play') return 'mode';
    const m = N.clock.minutes;
    if (!(m >= TUNE.window[0] && m < TUNE.window[1])) return 'time';
    if (N.missions && N.missions.active) return 'mission';
    if (N.wanted && N.wanted.level > 0) return 'meter';
    if (N.player && N.player.vehicle) return 'vehicle';
    const F = N.flags || {};
    if (F.year === 2026 || F.year2026) return 'year';
    try { if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) return 'minigame'; } catch (e) { /* ignore */ }
    try { if (N.playgroundGames && N.playgroundGames.isOpen && N.playgroundGames.isOpen()) return 'game'; } catch (e) { /* ignore */ }
    if (vid && !VENUES[vid]) return 'venue';
    return '';
  }
  function promptAt(v) {
    if (v.prompt) return { x: v.prompt[0], y: v.prompt[1] };
    return venueStart(v);
  }
  function registerOffers() {
    if (!N.interact || !N.world || !N.world.built) return;
    for (const id in VENUES) {
      const v = VENUES[id];
      const at = promptAt(v);
      if (!at) continue;
      N.interact.add('lh:' + id, {
        x: at.x, y: at.y, r: 20, priority: 1, level: 'ground',
        label: 'Late! Ghar chalo',
        enabled: () => !eligible(id) && !(N.flags && N.flags.lh_off),
        use: () => { start({ venue: id }); },
      });
    }
    G.offersOn = true;
  }
  function offerAt(x, y) {
    for (const id in VENUES) { const a = promptAt(VENUES[id]); if (a && hyp(a.x - x, a.y - y) < 26) return id; }
    return null;
  }
  function start(o) {
    o = o || {};
    if (S) return false;
    if (!N.world || !N.world.built) return false;
    const id = o.variant === 'daddy' ? 'latehome_daddy' : 'latehome';
    // with party.js: the same run as its solo mode (countdown, results card, tin token, "Again!")
    if (!o.direct && N.party && typeof N.party.solo === 'function' && N.party.get && N.party.get(id)) {
      const r = N.party.solo(id, { venue: o.venue || 'cafe', difficulty: o.difficulty != null ? o.difficulty : 0.5 });
      return !!(r && r.ok && S);
    }
    const ctx = soloCtx(o);
    return startWith(ctx, o);
  }
  function stop(reason) {
    if (!S) return false;
    closeResults(true);
    teardown();
    N.emit('latehome:end', { results: null, reason: reason || 'stop' });
    return true;
  }

  /* ================================================================ party (party.js contract) */
  function venueName(o) { const v = VENUES[(o && o.venue) || 'cafe'] || VENUES.cafe; return v.name; }
  function partyStart(ctx, o) {
    const ok = startWith(ctx, o);
    if (!ok) { try { toast('Ghar Pahunchna Hai! could not start here.', 2400); } catch (e) { /* ignore */ } }
    return {
      update() { /* the 'lh.*' systems drive the run */ },
      end(reason) { if (S && S.ctx === ctx) { closeResults(true); teardown(); if (reason) N.emit('latehome:end', { results: null, reason }); } },
    };
  }
  function registerParty() {
    const P = N.party;
    if (G.partyDone || !P || typeof P.register !== 'function') return false;
    G.partyDone = true;
    try {
      const venueNear = (x, y) => { const g = placePos('playground_14'); return { venue: g && isFinite(x) && hyp(g.x - x, g.y - y) < 260 ? 'ground' : 'cafe' }; };
      P.register('latehome', {
        name: 'Ghar Pahunchna Hai!', icon: '🏠', where: null, kind: 'hide', players: { min: 1, max: 8 }, solo: true,
        ai: ['immu', 'ayesha'], timeLimit: TUNE.timeLimit + 40, options: venueNear, label: 'Late! Ghar chalo',
        describe: (o) => 'The street lights are ON. Sneak home from ' + venueName(o) + ' past the uncles, the daddies on their Chetaks, the aunty at the window and Bahadur\'s torch. Least seen and fastest home wins; once home, whistle to pull the cones off your friends.',
        start: (ctx) => partyStart(ctx, { variant: 'sneak' }),
      });
      P.register('latehome_daddy', {
        name: 'Daddy Aa Gaye!', icon: '🔦', where: null, kind: 'hide', players: { min: 1, max: 8 }, solo: true,
        ai: ['immu', 'ayesha'], timeLimit: 3 * (TUNE.daddy.time + 12) + 30, options: venueNear, label: 'Daddy Aa Gaye!',
        describe: (o) => 'One of you is Daddy with the big torch (or Nanna\'s Chetak) at ' + venueName(o) + '; the rest sneak home. Daddy catches by walking right up to you, facing you. Roles swap every round.',
        start: (ctx) => partyStart(ctx, { variant: 'daddy' }),
      });
      G.registered = ['latehome', 'latehome_daddy'];
    } catch (e) { N.err('latehome.party', e); G.partyDone = false; return false; }
    return true;
  }

  /* ================================================================ public API + test hooks */
  function snapshot() {
    if (!S) return null;
    const k2 = (k) => ({ uid: k.uid, nick: k.nick, me: k.isMe, ai: k.isAI, npc: k.npc, x: +k.x.toFixed(1), y: +k.y.toFixed(1), meter: +(+k.meter).toFixed(3), spots: k.spots, coll: k.coll, hide: k.hide, done: k.done, ghost: k.ghost, seq: k.seq ? k.seq.phase : null, t: k.t, role: k.role, pts: k.pts, catches: k.catches, score: k.score, door: S.C.doors[k.uid], mode: k.mode || null, level: k.level, seenBy: k.seenBy ? k.seenBy.role + k.seenBy.idx : null, seenD: k.seenBy ? +hyp(k.seenBy.cone.x - k.x, k.seenBy.cone.y - k.y).toFixed(1) : null });
    return {
      phase: S.phase, mode: S.mode, variant: S.variant, venue: S.venue, seed: S.seed, isHost: S.isHost, t: +elapsed().toFixed(2), round: S.round, rounds: S.rounds,
      par: S.C.par, start: S.C.start, me: S.me ? k2(S.me) : null, kids: S.kids.map(k2),
      seekers: S.seekers.map((sk) => ({ idx: sk.idx, role: sk.role, name: sk.name, x: +sk.x.toFixed(1), y: +sk.y.toFixed(1), state: sk.state, cone: { x: +sk.cone.x.toFixed(1), y: +sk.cone.y.toFixed(1), a: +sk.cone.a.toFixed(3), range: sk.cone.range, half: sk.cone.half, on: sk.cone.on }, track: !!sk.track, inv: sk.inv ? { x: sk.inv.x, y: sk.inv.y, kind: sk.inv.kind } : null, escort: !!sk.escort, open: !!sk.open, doze: sk.dozeT > 0, vehicle: sk.vehicle ? sk.vehicle.type : null })),
      virtual: S.virtualSeekers.map((vs) => ({ x: vs.x, y: vs.y, a: vs.angle, uid: vs.kidUid })),
      hides: S.C.hides.map((h) => ({ kind: h.kind, name: h.name, x: +h.x.toFixed(1), y: +h.y.toFixed(1), r: h.r })),
      items: S.items.map((it) => ({ id: it.id, kind: it.kind, x: +it.x.toFixed(1), y: +it.y.toFixed(1), taken: it.taken })),
      dogs: S.dogs.map((g) => ({ x: +g.x.toFixed(1), y: +g.y.toFixed(1), state: g.state })),
      lamps: S.C.lamps.length, tvs: S.C.tvs.length, walls: S.C.walls.length, pans: S.C.pans.length, autos: S.C.autos.length,
      ui: Object.assign({}, S.ui), results: S.results, resultsOpen: !!RES.el, whistles: S.ghostWhistles || 0,
      peek: S.me ? peekLevel(S.me) : 0,
    };
  }
  /** the sneak planner (tests drive REAL keys from it): where to go next, and whether to hide / crouch. It keeps a
   *  little memory (how long it has waited, a detour it is walking, a fresh path from there) */
  function hint() {
    if (!S || !S.me) return null;
    const k = S.me, p = N.player;
    const H = S.hintSt || (S.hintSt = { waitT: 0, last: performance.now(), det: null, path: null, creepT: 0, stayT: 0 });
    const tNow = performance.now(), dtH = Math.min(0.5, (tNow - H.last) / 1000); H.last = tNow;
    const door = S.C.doors[k.uid];
    const P = H.path || S.C.paths[k.uid], L = polyLen(P);
    const n = polyNearest(P, p.x, p.y);
    let target = polyAt(P, Math.min(L, n.s + 22)), why = 'path', hide = false, wait = false, crouch = false;
    const near = hyp(door.x - p.x, door.y - p.y) < 40;
    if (near) { target = { x: door.x, y: door.y }; why = 'door'; }
    const thrHere = threatAt(p.x, p.y, 6), thrAhead = near ? null : threatAt(target.x, target.y, 10);
    if (H.det) {
      if (hyp(H.det.x - p.x, H.det.y - p.y) < 4 || threatAt(H.det.x, H.det.y, 4)) { if (hyp(H.det.x - p.x, H.det.y - p.y) < 4) H.path = walkPath(p.x, p.y, door.x, door.y); H.det = null; }
      else if (!thrHere) { target = H.det; why = 'detour'; }
    }
    let nearSk = Infinity, nearMover = Infinity;
    for (const sk of S.seekers) { const d = hyp(sk.x - p.x, sk.y - p.y); nearSk = Math.min(nearSk, d); if (sk.role === 'walker' || sk.role === 'watchman' || sk.role === 'hunter') nearMover = Math.min(nearMover, d); }
    if (k.hide === 2 && why !== 'detour' && nearSk > 9 && H.stayT < 8 && (thrHere || thrAhead || k.seenBy || nearMover < 50)) {
      // already hidden and somebody is about: stay put until he has gone (a while at most)
      hide = true; why = 'stay'; target = { x: p.x, y: p.y }; H.stayT += dtH;
    } else if (k.hide === 2 && H.stayT >= 8) {
      H.stayT = 0; H.creepT = 3; crouch = true; why = 'creep';
    } else if (H.creepT > 0 && !thrHere && why !== 'detour') { H.creepT -= dtH; crouch = true; why = 'creep'; }
    else if ((thrHere || thrAhead) && why !== 'detour') {
      const seen = !!k.seenBy;
      const spot = safeSpot(p.x, p.y, 40, k.seenBy || thrHere || thrAhead);
      if (spot) {
        const d = hyp(spot.x - p.x, spot.y - p.y);
        if (d < spot.r * 0.6) { hide = true; why = 'hide'; target = { x: p.x, y: p.y }; H.waitT += dtH; }
        else { target = { x: spot.x, y: spot.y }; why = 'to-spot'; }
      } else if (seen || thrHere) {
        const f = fleeFrom(thrHere || k.seenBy, p.x, p.y); target = f; why = 'flee';
      } else { wait = true; why = 'wait'; target = { x: p.x, y: p.y }; H.waitT += dtH; }
      if (H.waitT > 2.5 && !seen) {
        const dt2 = detour(p.x, p.y, door, 12);
        if (dt2) { H.det = dt2; target = dt2; why = 'detour'; hide = false; wait = false; H.waitT = 0; }
        else if (H.waitT > 5) { H.creepT = 3; H.waitT = 0; }
      }
    } else H.waitT = Math.max(0, H.waitT - dtH);
    if (k.hide !== 2 && why !== 'stay') H.stayT = Math.max(0, H.stayT - dtH * 0.5);
    let dx = target.x - p.x, dy = target.y - p.y;
    const d = hyp(dx, dy);
    if (d > 0.01) { dx /= d; dy /= d; } else { dx = dy = 0; }
    // world direction -> input keys (camera-relative in 3D)
    let ix = dx, iy = dy;
    if (is3D() && isFinite(N.view.yaw)) { const c = Math.cos(N.view.yaw), sn = Math.sin(N.view.yaw), f = dx * c + dy * sn, r = -dx * sn + dy * c; ix = r; iy = -f; }
    const keys = [];
    if (!hide && !wait && d > 1.5) { if (ix > 0.38) keys.push('KeyD'); if (ix < -0.38) keys.push('KeyA'); if (iy > 0.38) keys.push('KeyS'); if (iy < -0.38) keys.push('KeyW'); }
    return { x: target.x, y: target.y, dx, dy, d, keys, hide, wait, crouch, run: why === 'flee', why, home: !!k.done };
  }
  function coneSpot(role, frac) {
    if (!S) return null;
    const sk = S.seekers.find((q) => q.role === role && q.cone.on);
    if (!sk) return null;
    const C = sk.cone;
    for (const f of [frac || 0.45, 0.35, 0.55, 0.25, 0.65]) {
      const x = C.x + Math.cos(C.a) * C.range * f, y = C.y + Math.sin(C.a) * C.range * f;
      if (walkable(x, y) && clear(C.x, C.y, x, y)) return { x, y, idx: sk.idx };
    }
    return null;
  }
  const API = (N.latehome = {
    VERSION: 1, TUNE, VENUES, LINES,
    start, startWith, stop, eligible, offerAt,
    active: () => !!S,
    state: snapshot,
    get registered() { return G.registered.slice(); },
    get lastResults() { return G.lastResults; },
    registerParty,
    debug: {
      session: () => S,
      hint,
      meter(v) { if (S && S.me) S.me.meter = clamp(+v || 0, 0, 1); return S ? S.me.meter : null; },
      catchMe() { if (!S || !S.me) return false; const by = S.seekers.find((q) => q.role === 'walker' || q.role === 'watchman') || S.seekers[0]; startCatch(S.me, by, 'seen'); return true; },
      win() { if (!S || !S.me) return false; const d = S.C.doors[S.me.uid]; N.player.teleport(d.x, d.y, { ground: true }); return true; },
      setSeekersFrozen(on) { G.frozenSeekers = !!on; return G.frozenSeekers; },
      unseen(on) { G.unseen = !!on; return G.unseen; },
      nearestHide() { if (!S) return null; const p = N.player; let b = null; for (const h of S.C.hides) { const d = hyp(h.x - p.x, h.y - p.y); if (!b || d < b.d) b = { kind: h.kind, name: h.name, x: h.x, y: h.y, r: h.r, d }; } return b; },
      place(kind) { if (!S) return null; const h = S.C.hides.find((q) => q.kind === kind); return h ? { kind: h.kind, x: h.x, y: h.y, r: h.r } : null; },
      coneSpot,
      resolveAI() { if (S) resolveAI(); },
      endRound() { if (S) endRound('debug'); return S ? S.phase : null; },
      threatAt: (x, y, m) => { const t = threatAt(x, y, m || 0); return t ? t.idx : -1; },
      paths: () => (S ? S.C.paths : null),
      _v3: V3,
      v3: () => ({ ok: V3.ok, built: V3.sess === S && !!S, cones: V3.cones.length, coneVis: V3.cones.filter((c) => c.m.visible).length, rootVis: !!(V3.root && V3.root.visible), lamps: V3.lamps.length, doors: V3.doors.length, heads: V3.heads.filter((h) => h.head.visible).length }),
    },
  });

  /* ================================================================ systems + events */
  N.addSystem({ id: 'lh.ui', order: 14, runIn: ['*'], update() { try { uiStep(); } catch (e) { N.err('latehome.ui', e); } } });
  N.addSystem({ id: 'lh.ctl', order: 15, runIn: ['play'], update(dt) { ctlStep(dt); } });
  N.addSystem({ id: 'lh.pre', order: 19.5, runIn: ['play'], update() { preStep(); } });
  N.addSystem({ id: 'lh.post', order: 21, runIn: ['play'], update() { postStep(); } });
  N.addSystem({
    id: 'lh.sim', order: 31, runIn: ['play'],
    init() { registerParty(); if (N.world && N.world.built) registerOffers(); },
    update(dt) { simStep(dt); },
    draw() { drawSession(); },
    reset() { if (S) { closeResults(true); teardown(); } },
  });
  // footsteps are the noise: running is loud, walking is quiet, creeping / hiding is silent
  N.on('footstep', (d) => {
    if (!S || !d || d.who !== N.player || S.phase !== 'play') return;
    const k = S.me;
    if (!k || k.done || k.ghost || k.seq || k.role === 'daddy' || k.hide) return;
    const r = d.run ? TUNE.noise.run : TUNE.noise.walk;
    if (!S.seekers.some((sk) => hyp(sk.x - d.x, sk.y - d.y) < r + 4)) return;
    S.nzT = S.nzT || 0;
    const t = performance.now();
    if (!S.isHost && t - S.nzT < 400) return;
    S.nzT = t;
    noise(d.x, d.y, r, 'step', N.player);
  });
  const abort = () => { if (S) { closeResults(true); teardown(); } };
  N.on('game:new', abort);
  N.on('game:quit', abort);
  N.on('save:loaded', abort);
  N.on('game:continue', abort);
  N.on('mission:start', () => { if (S && S.mode === 'solo') abort(); });
  N.on('world:built', () => { registerOffers(); });
  N.on('boot', () => { registerParty(); registerOffers(); registerV3(); });
  N.on('party:ready', () => registerParty());
  registerV3();
  registerParty();
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('DOMContentLoaded', () => { registerParty(); registerV3(); });
  void API;
})();
