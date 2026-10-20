/* NOSTALGIA — party.js: friends-together activities (ARCHITECTURE §24 "Party activities").
 * Friends in an online room (src/online.js, §23) challenge each other to activities: cycle races, foot races,
 * treasure hunts, funfair games, pani puri contests... Every activity also works SOLO against the AI friends
 * (Immu, Ayesha, Pappu, Bunty-anna) when offline or alone. Activities live in their own files and register here:
 * src/party_races.js (cycle races, foot races, Chitti Chase), src/funfair.js, src/panipuri.js, src/latehome.js.
 *
 * BINDING CONTRACT (other modules code against it)
 *   N.party = {
 *     register(id, spec)     spec = {name, icon, where: placeId | null (null = anywhere), kind: 'race'|'score'|'hide'|'custom',
 *                              players: {min, max}, seasons?: [flag names] (offered only while one is on), solo: true|false,
 *                              describe(opts) -> string, start(ctx) -> handle {update?(dt), end?(reason)}}
 *       optional extras: r (prompt radius at `where`, default place.r + 24), also: [placeIds] (more prompt spots),
 *         spots: [{x, y, r, name}] (exact prompt points, e.g. a start line; listed first),
 *         when() -> bool | string (false / a reason = not offered now), options(x, y) -> default opts,
 *         setup(opts, {mode}) -> Promise<opts | null> (asked before a challenge from the UI: pick a route, drop pins...),
 *         rank(rows, summary) -> rows in order, timeLimit (s after GO; the host ends it then, default 900),
 *         ai: number | [friend ids] (solo: who joins; default min(3, players.max - 1)), lock: false (no frozen start),
 *         token: {id, name, desc} (the tin token for a first win; default one per kind), label (prompt text).
 *     challenge(id, opts) -> {ok, why?, mode: 'party'|'solo', sid}   invite the room (the challenger is the host); the
 *       others see an invite card "Ravi challenges you to <name> — Accept / Skip". Alone or offline: plays solo.
 *     solo(id, opts) -> {ok, why?, sid}   play against the AI friends
 *     available(x, y) -> [{id, name, icon, kind, where, here, d, label, line, x, y, r, atName, anywhere}]   offered at (x, y):
 *       `here` ones are shown as the prompt "E Start <name>" at their place; all of them in the "Challenge friends" list
 *       (Online panel, 🏁 in the quick-chat strip, N.party.openPicker()); the placed ones (not `anywhere`) in the room HUD's
 *       "Nearby" card and the arrival toast (online.js), whose one tap is quick(id) (setup, then challenge; no start card).
 *     quick(id, {from}) -> Promise<challenge() result>   uiBusy (a session / invite / card is up)
 *     A room holds N.online.MAX players (3): players.max may say more (solo with the gang), a party session has at most
 *       the room; players.min is capped at the room size, so every activity runs with 1-3 friends.
 *     active -> the session in lobby / countdown / running (null when idle): {id, sid, name, mode, phase, isHost, players, ctx}
 *     defs (Map), get(id), cancel(why), leave(), openPicker(), closeCards(), stats, FRIENDS, _debug
 *   }
 *   ctx (one per session, the same shape in solo and party):
 *     mode 'solo'|'party', id, sid, spec, seed (int, the same for everyone), opts, players [{uid, nick, isMe, isAI, look, npc?}]
 *       (the same order on every page: host first, then in accept order; AI uids are 'ai:<friend>'), me, slot (my index),
 *     isHost (live: changes if the host leaves), startAt (GO on the shared clock), now() (the shared clock, ms: the host's
 *       Date.now() measured through ping / pong in party mode; game time in solo, so the pause menu pauses it),
 *     elapsed() = now() - startAt (negative during the countdown), rng (N.util.rng(seed)),
 *     send(type, data) -> bool (broadcast to the session, rate-limited; solo: no-op), on(type, fn(data, from)) -> off(),
 *     report(result) (my result: {score?, timeMs?, place?, caught?, dnf?, note?, ...}), results() -> the reported ones [{uid, nick, isMe, isAI, ...result}],
 *     end(summary) (host / solo: finish now, summary.standings = [uid...] may set the order; guest: report + wait),
 *     left(uid) -> bool, onLeave(fn(uid)),
 *     ai: {list, friend(uid), skill(uid) 0..1, spawn(uid, x, y, {angle, vehicle}), actor(uid), vehicle(uid),
 *          ride(uid, path [{x, y}], {speed, mul(), r, onDone, lookahead, lane}) -> runner {i, s, done, progress, stop()},
 *          walk(uid, path, {speed, run, onDone}) -> runner, stop(uid), bark(uid, text, secs), report(uid, result),
 *          despawn(uid), clear(), cycleFor(uid), rng}     (drives the AI friends in solo; cleaned up at the end)
 *     helpers: place(x, y, angle, {vehicle: type | null, color}) -> vehicle (teleport me there, on a fresh vehicle),
 *       grid(x, y, angle, i, {gap, side}) -> {x, y, angle} (start-grid slot i), cycleFor(look) (age-appropriate cycle type),
 *       marker(id, {x, y, r, color, kind: 'ring'|'finish'|'chit'|'goal', label, num, state: 'next'|'later'|'done', blip,
 *       route}) / unmarker(id) (rings in 2D and 3D, minimap blips), status(text), board(rows [{name, sub, me, color}]),
 *       objective(text), timer(ms | null), toast(text, ms), bark(target, text)
 *   handle: update(dt) every frame while the session runs (not under the pause menu); end(reason) once:
 *     'done' (results are final) | 'cancel' | 'left' (I left the room) | 'quit' (new game / load / title) | 'error'.
 *
 * FLOW (party): challenge -> 'inv' to the room (repeated every 2 s with who has accepted) -> invite cards -> lobby
 *   (20 s, or as soon as everyone has answered) -> the host picks the seed and startAt (+4.5 s) -> 'go' -> start(ctx)
 *   everywhere (set up the start), controls frozen until startAt -> 3-2-1-GO on now() -> everyone plays locally with
 *   the same seed -> ctx.report() -> 'res' -> the host ranks them when all present players have reported (or end(),
 *   or timeLimit) -> 'fin' with the standings -> the results card on every page (places, times, scores), the bragging
 *   toast, a tin token for my first win of each kind. A player who leaves (presence) or quits is marked left; if the
 *   host leaves, the next player in the list becomes the host. SOLO: the same with the AI friends and no network.
 * Messages: 'pt' broadcasts through N.online.channelSend / onMessage ([party hook] in online.js) with
 *   type inv | acc | skip | go | cancel | ping | pong | res | fin | bye | a (activity: {sid, t, d}); every field is
 *   validated here (the channel is public). Kid-friendly: no betting, no free text, friendly banter only.
 * UI: DOM cards in #ui (.pt-*; style.css "=== party ==="), checkpoint rings on the 2D ground layer and the 3D layer
 *   'party' (N.view3d.registerLayer), minimap blips via N.hud. Mission givers are held while a session runs.
 * Test: node tests/party.cjs
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS_KEY = 'nostalgia.party.v1';
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, Object.assign({ ui: true }, o || {})); } catch (e) { /* audio never breaks the party */ } }
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600, { key: 'party' }); } catch (e) { /* ignore */ } }
  function toastQ(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600); } catch (e) { /* ignore */ } }
  const TUNE = { lobbyMs: 20000, invEvery: 2000, goLead: 4500, countMs: 3000, goShow: 900, resultsMs: 24000, resultsDelay: 1200, timeLimit: 900, pingN: 6, pingMax: 24, pingGood: 250, pingGap: 260, sendPerSec: 12, promptPriority: -1, innerPriority: 1, innerR: 24 };

  /* ================================================================ AI friends */
  const FRIENDS = [
    { id: 'immu', name: 'Immu', skill: 0.72, cycle: 'cycle', color: '#b82a2a', walk: 1.0,
      hi: ['Ready, Agent? Over.', 'Pakka, I am ready.', 'Plan is simple: pedal.'], pass: ['Side do, side do!', 'Over and out!'], win: ['Mission accomplished. Over.'], lose: ['Next time, pakka!', 'Good one, Agent!'] },
    { id: 'ayesha', name: 'Ayesha', skill: 0.84, cycle: 'ladiescycle', color: '#8a2a4a', walk: 1.05,
      hi: ['Hau, ho jaata!', 'Girls first, boys follow!'], pass: ['Bowling Express!', 'Coming through!'], win: ['Hau! Told you.'], lose: ['Arre, so close!', 'Rematch? Rematch!'] },
    { id: 'pappu', name: 'Pappu', skill: 0.56, cycle: 'kid_cycle', color: '#2f6a3a', walk: 0.94,
      hi: ['Wait, my chain— okay, okay!', 'I will try my best!'], pass: ['Wheee!', 'Pappu zindabad!'], win: ['I WON? I WON!'], lose: ['Phew! Fun only.', 'Next time I will be first!'] },
    { id: 'bunty', name: 'Bunty-anna', skill: 0.76, cycle: 'old_cycle', color: '#121214', walk: 1.0,
      hi: ['Tension nakko, I will go slow. Maybe.', 'Old roadster, old legs. Let us see.'], pass: ['Excuse, excuse!', 'Legend coming!'], win: ['Experience, mamu.'], lose: ['Shabash, kids!', 'Fine, fine, you are faster.'] },
  ];
  const FRIEND = new Map(FRIENDS.map((f) => [f.id, f]));
  function ensurePappu() {
    try {
      if (N.npcs && N.npcs.define && N.npcs.defs && !N.npcs.defs.pappu) {
        N.npcs.define('pappu', { name: 'Pappu', color: '#2a8c82', voice: 1.38, speed: 47, vehicle: 'kid_cycle', vehicleColor: '#2f6a3a',
          look: { kind: 'kid', skin: '#a0683f', hair: '#1a1412', shirt: '#2a8c82', pants: '#3a3a4a', size: 0.86 },
          portrait: { age: 'kid', hairStyle: 'spiky', skin: '#a0683f', shirt: '#2a8c82' },
          lines: ['Goli khelega?', 'I am fast. Very fast. Sometimes.'] });
      }
    } catch (e) { N.err('party.pappu', e); }
  }
  function friendLook(id) {
    try { if (N.npcs && N.npcs.look) { const l = N.npcs.look(id); if (l) return l; } } catch (e) { /* ignore */ }
    return { kind: 'kid', skin: '#a0683f', hair: '#1a1412', shirt: (FRIEND.get(id) || {}).color || '#2a5cb8', pants: '#3a3a4a' };
  }

  /* ================================================================ registry */
  const REG = new Map();
  const KINDS = ['race', 'score', 'hide', 'custom'];
  function register(id, spec) {
    if (id && typeof id === 'object') { spec = id; id = spec.id; }
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]{1,31}$/.test(id) || !spec || typeof spec.start !== 'function') { N.err('party.register', new Error('bad activity ' + id)); return null; }
    const pl = spec.players || {};
    const s = Object.assign({ name: id, icon: '🎲', where: null, kind: 'custom', solo: true, seasons: null }, spec, { id });
    s.kind = KINDS.indexOf(s.kind) >= 0 ? s.kind : 'custom';
    const max = clamp((pl.max | 0) || 10, 1, 10);
    s.players = { min: clamp((pl.min | 0) || 2, 1, max), max };
    REG.set(id, s);
    N.emit('party:register', { id });
    return s;
  }
  function seasonOk(s) {
    if (!Array.isArray(s.seasons) || !s.seasons.length) return true;
    const F = N.flags || {};
    return s.seasons.some((f) => { if (F[f]) return true; try { return !!(N.seasons && N.seasons.is && N.seasons.is(f)); } catch (e) { return false; } });
  }
  function whenOk(s) {
    if (!seasonOk(s)) return false;
    if (typeof s.when === 'function') { try { const w = s.when(); return w === true || w === undefined; } catch (e) { N.err('party.when:' + s.id, e); return false; } }
    return true;
  }
  function describe(s, opts) {
    try { if (typeof s.describe === 'function') return String(s.describe(opts || defaultOpts(s)) || ''); } catch (e) { N.err('party.describe:' + s.id, e); }
    return '';
  }
  function defaultOpts(s, x, y) {
    try { if (typeof s.options === 'function') return s.options(x, y) || {}; } catch (e) { N.err('party.options:' + s.id, e); }
    return {};
  }
  function spotsOf(s) {
    const out = [];
    const add = (pid) => { const p = pid && N.places && N.places[pid]; if (p) out.push({ id: pid, x: p.x, y: p.y, r: s.r || (p.r || 20) + 24, name: p.name }); };
    if (Array.isArray(s.spots)) for (const q of s.spots) if (q && isFinite(q.x) && isFinite(q.y)) out.push({ id: s.where || null, x: +q.x, y: +q.y, r: q.r || 40, name: q.name || s.name });
    if (s.where) add(s.where);
    if (Array.isArray(s.also)) s.also.forEach(add);
    return out;
  }
  function available(x, y) {
    if (!isFinite(x) || !isFinite(y)) { const e = N.player && (N.player.vehicle || N.player); x = e ? e.x : 0; y = e ? e.y : 0; }
    const out = [];
    for (const s of REG.values()) {
      if (!whenOk(s)) continue;
      const spots = spotsOf(s);
      let here = false, d = Infinity, at = null;
      for (const sp of spots) { const dd = Math.hypot(sp.x - x, sp.y - y); if (dd < d) { d = dd; at = sp; } if (dd <= sp.r) here = true; }
      if ((s.where || s.spots) && !spots.length) continue; // its place is not on this map
      out.push({ id: s.id, name: s.name, icon: s.icon, kind: s.kind, where: s.where, here: here || !s.where, anywhere: !s.where, d: s.where ? d : 0, at: at ? at.id : null, x: at ? at.x : null, y: at ? at.y : null, atName: at ? at.name : null, label: s.label || ('Start ' + s.name), line: describe(s), solo: !!s.solo, players: Object.assign({}, s.players), r: at ? at.r : null });
    }
    out.sort((a, b) => (b.here - a.here) || (a.d - b.d) || (a.name < b.name ? -1 : 1));
    return out;
  }

  /* ================================================================ transport + shared clock */
  const NET = { off: null, ok: false };
  const myUid = () => (N.online && N.online.myKey) || 'me';
  // a room holds N.online.MAX players (3): an activity's own players.min / max are capped at that in a room
  const roomMax = () => clamp((N.online && N.online.MAX) | 0 || 3, 2, 10);
  const minIn = (s) => clamp(s.players.min, 1, roomMax());
  function inRoom() { return !!(N.online && N.online.room && typeof N.online.channelSend === 'function'); }
  function roomPlayers() { try { return inRoom() && N.online.players ? N.online.players() : []; } catch (e) { return []; } }
  function others() { return roomPlayers().filter((p) => !p.me); }
  function rawSend(type, data) { if (!inRoom()) return false; try { return N.online.channelSend(type, data); } catch (e) { N.err('party.send', e); return false; } }
  function wireNet() {
    if (NET.off || !N.online || typeof N.online.onMessage !== 'function') return;
    NET.off = N.online.onMessage(onNet);
    NET.ok = true;
  }
  // the shared clock: the host's Date.now(); a guest measures its offset with a few ping / pong round trips
  const CLK = { offset: 0, rtt: Infinity, host: null, sid: null, n: 0, timer: null };
  const sharedNow = () => Date.now() + CLK.offset;
  function onPong(d) {
    if (!d || d.to !== myUid() || !isFinite(d.c) || !isFinite(d.h)) return;
    const t = Date.now(), rtt = t - d.c;
    if (rtt < 0 || rtt > 10000) return;
    if (rtt <= CLK.rtt) { CLK.rtt = rtt; CLK.offset = Math.round(d.h + rtt / 2 - t); }
  }

  /* ================================================================ state */
  const ST = { sess: null, invite: null, skipped: new Set(), done: new Set(), stats: loadStats(), seq: 0, lastFin: null };
  function loadStats() {
    let o = null;
    try { o = JSON.parse(lsGet(LS_KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') o = {};
    return { plays: o.plays && typeof o.plays === 'object' ? o.plays : {}, wins: o.wins && typeof o.wins === 'object' ? o.wins : {}, firsts: o.firsts && typeof o.firsts === 'object' ? o.firsts : {}, best: o.best && typeof o.best === 'object' ? o.best : {} };
  }
  function saveStats() { lsSet(LS_KEY, JSON.stringify(ST.stats)); }
  const newSid = () => { const a = new Uint8Array(5); try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 5; i++) a[i] = (Math.random() * 256) | 0; } let s = 's'; for (const b of a) s += b.toString(16).padStart(2, '0'); return s; };
  const newSeed = () => { const a = new Uint32Array(1); try { crypto.getRandomValues(a); } catch (e) { a[0] = (Math.random() * 4294967296) >>> 0; } return (a[0] & 0x7fffffff) || 1; };
  const validSid = (s) => typeof s === 'string' && /^s[0-9a-f]{10}$/.test(s);
  const validUid = (s) => typeof s === 'string' && /^[A-Za-z0-9:_-]{1,24}$/.test(s);
  function sanitizeOpts(o) {
    // opts travel through the public channel: plain JSON, small, numbers finite
    if (!o || typeof o !== 'object') return {};
    let s; try { s = JSON.stringify(o); } catch (e) { return {}; }
    if (s.length > 1200) return {};
    const out = JSON.parse(s, (k, v) => (typeof v === 'number' && !isFinite(v) ? 0 : typeof v === 'string' ? v.slice(0, 80) : v));
    return out && typeof out === 'object' && !Array.isArray(out) ? out : {};
  }
  function sanitizeResult(r) {
    const o = sanitizeOpts(r);
    for (const k of ['score', 'timeMs', 'place', 'progress', 'dist']) if (o[k] != null) { const v = +o[k]; if (isFinite(v)) o[k] = clamp(v, -1e9, 1e9); else delete o[k]; }
    for (const k of ['caught', 'dnf', 'left']) if (o[k] != null) o[k] = !!o[k];
    if (o.note != null) o.note = String(o.note).slice(0, 60);
    return o;
  }
  function cleanNick(n) { try { if (N.online && N.online.nickOk) { const r = N.online.nickOk(n); if (r.ok) return r.nick; } } catch (e) { /* ignore */ } return 'Player'; }
  function myNick() { return (N.online && N.online.nick) || (N.player && (N.player.nick || N.player.name)) || 'You'; }
  function myLook() { const l = (N.player && N.player.look) || {}; try { return N.online && N.online._debug && N.online._debug.sanitizeLook ? N.online._debug.sanitizeLook(l) : l; } catch (e) { return l; } }
  function busyWhy() {
    if (N.missions && N.missions.active) return 'Finish your mission first.';
    const m = N.state.mode;
    if (m === 'title' || m === 'boot') return 'Start the game first.';
    if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) return 'Finish this game first.';
    if (N.wanted && (N.wanted.level | 0) >= 3) return 'Shake off the chase first!';
    return null;
  }

  /* ================================================================ sessions */
  function makeSession(o) {
    const S = {
      sid: o.sid, id: o.id, spec: REG.get(o.id), mode: o.mode, host: o.host, hostNick: o.hostNick || '', opts: sanitizeOpts(o.opts),
      seed: o.seed || 0, startAt: 0, phase: o.phase || 'lobby', players: [], acc: new Map(), skip: new Set(), exp: o.exp || 0,
      results: new Map(), left: new Set(), handle: null, ctx: null, subs: new Map(), leaveFns: [], fin: null, reported: false, lastInv: 0,
      marks: new Map(), ai: null, created: Date.now(), objective: null, timerOn: false, endedHandle: false, unlocked: false, finAt: 0, finSent: false,
    };
    return S;
  }
  const isHost = (S) => S.host === (S.mode === 'solo' ? 'me' : myUid());
  function currentHost(S) {
    // the host, or (if it left) the next player in the list who is still here
    const here = new Set(roomPlayers().map((p) => p.key));
    for (const p of S.players) if (!p.isAI && !S.left.has(p.uid) && (S.mode === 'solo' || here.has(p.uid))) return p.uid;
    return S.host;
  }

  /** challenge(id, opts): invite the room; alone / offline -> solo */
  function challenge(id, opts) {
    const s = REG.get(id);
    if (!s) return { ok: false, why: 'unknown' };
    if (ST.sess) return { ok: false, why: 'Already playing ' + (ST.sess.spec ? ST.sess.spec.name : 'something') + '.' };
    const why = busyWhy(); if (why) { toast(why); return { ok: false, why }; }
    if (!whenOk(s)) return { ok: false, why: 'Not now.' };
    const e = N.player && (N.player.vehicle || N.player);
    const o = Object.assign({}, defaultOpts(s, e && e.x, e && e.y), opts || {});
    if (!inRoom() || !others().length) {
      if (!s.solo) { toast('Needs friends in an online room.'); return { ok: false, why: 'needs_room' }; }
      return Object.assign(solo(id, o), { mode: 'solo' });
    }
    closeInvite();
    wireNet();
    const S = makeSession({ sid: newSid(), id, mode: 'party', host: myUid(), hostNick: myNick(), opts: o, exp: sharedNow() + TUNE.lobbyMs });
    CLK.offset = 0; CLK.rtt = 0; CLK.host = S.host; CLK.sid = S.sid; CLK.n = TUNE.pingN;
    S.acc.set(myUid(), { nick: myNick(), look: myLook(), t: 0 });
    ST.sess = S;
    sendInvite(S);
    renderLobby();
    sfx('ui_select');
    N.emit('party:challenge', { id, sid: S.sid });
    return { ok: true, mode: 'party', sid: S.sid };
  }
  function sendInvite(S) {
    S.lastInv = Date.now();
    rawSend('inv', { sid: S.sid, id: S.id, opts: S.opts, host: S.host, nick: myNick(), exp: S.exp, acc: Array.from(S.acc.keys()), skip: Array.from(S.skip), min: S.spec.players.min, max: S.spec.players.max });
  }
  /** solo(id, opts): me + the AI friends */
  function solo(id, opts) {
    const s = REG.get(id);
    if (!s) return { ok: false, why: 'unknown' };
    if (!s.solo) return { ok: false, why: 'Needs friends in an online room.' };
    if (ST.sess) return { ok: false, why: 'Already playing.' };
    const why = busyWhy(); if (why) { toast(why); return { ok: false, why }; }
    closeInvite();
    ensurePappu();
    const e = N.player && (N.player.vehicle || N.player);
    const o = Object.assign({}, defaultOpts(s, e && e.x, e && e.y), opts || {});
    const S = makeSession({ sid: newSid(), id, mode: 'solo', host: 'me', hostNick: myNick(), opts: o, seed: newSeed(), phase: 'starting' });
    let ids = Array.isArray(s.ai) ? s.ai.filter((f) => FRIEND.has(f)) : null;
    if (!ids) { const n = clamp(typeof s.ai === 'number' ? s.ai : Math.min(3, s.players.max - 1), 0, FRIENDS.length); const r = U.rng(S.seed ^ 0x5eed); const pool = FRIENDS.map((f) => f.id); ids = []; while (ids.length < n && pool.length) ids.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0]); }
    ids = ids.slice(0, Math.max(0, s.players.max - 1));
    S.players = [{ uid: 'me', nick: myNick(), isMe: true, isAI: false, look: (N.player && N.player.look) || myLook() }]
      .concat(ids.map((f) => ({ uid: 'ai:' + f, nick: FRIEND.get(f).name, isMe: false, isAI: true, look: friendLook(f), npc: f })));
    ST.sess = S;
    S.startAt = gameNow() + TUNE.goLead - 800;
    begin(S);
    return { ok: true, mode: 'solo', sid: S.sid };
  }
  const gameNow = () => Math.round((N.time.now || 0) * 1000);

  // host: everyone has answered / the lobby timed out
  function hostTick(S) {
    if (S.mode !== 'party' || S.phase !== 'lobby' || !isHost(S)) return;
    const here = others();
    for (const k of Array.from(S.acc.keys())) if (k !== myUid() && !here.some((p) => p.key === k)) S.acc.delete(k);
    const answered = here.every((p) => S.acc.has(p.key) || S.skip.has(p.key));
    const n = S.acc.size;
    if (Date.now() - S.lastInv > TUNE.invEvery) sendInvite(S);
    if ((answered && here.length) || sharedNow() >= S.exp) {
      if (n >= Math.max(2, minIn(S.spec))) goHost(S);
      else cancelSession(S, here.length && answered ? 'Nobody could play right now.' : 'Nobody accepted in time.', true);
    }
  }
  function goHost(S) {
    if (S.phase !== 'lobby') return;
    const list = [[myUid(), S.acc.get(myUid())]].concat(Array.from(S.acc.entries()).filter(([k]) => k !== myUid()).sort((a, b) => a[1].t - b[1].t)).slice(0, S.spec.players.max);
    S.players = list.map(([uid, a]) => ({ uid, nick: uid === myUid() ? myNick() : a.nick, isMe: uid === myUid(), isAI: false, look: uid === myUid() ? ((N.player && N.player.look) || a.look) : a.look }));
    S.seed = newSeed();
    S.startAt = sharedNow() + TUNE.goLead;
    const msg = { sid: S.sid, id: S.id, seed: S.seed, startAt: S.startAt, opts: S.opts, host: S.host, players: S.players.map((p) => ({ uid: p.uid, nick: p.nick, look: p.look })) };
    rawSend('go', msg);
    setTimeout(() => { if (ST.sess === S) rawSend('go', msg); }, 350); // a second copy (receivers dedupe by sid)
    begin(S);
  }
  function begin(S) {
    S.phase = 'countdown';
    closeLobby(); closeInvite();
    S.ctx = makeCtx(S);
    ST.stats.plays[S.id] = (ST.stats.plays[S.id] | 0) + 1; saveStats();
    holdGivers(true);
    try {
      const h = S.spec.start(S.ctx);
      S.handle = h && typeof h === 'object' ? h : {};
    } catch (e) {
      N.err('party.start:' + S.id, e);
      S.handle = {};
      cancelSession(S, 'Could not start ' + S.spec.name + '.', false, 'error');
      return;
    }
    if (S.spec.lock !== false && N.player) { S.lockWas = !!N.player.controlsLocked; N.player.controlsLocked = true; S.locked = true; }
    showCountdown(S);
    N.emit('party:start', { id: S.id, sid: S.sid, mode: S.mode, players: S.players.map((p) => p.uid) });
  }
  function unlock(S) {
    if (S.locked && N.player) { N.player.controlsLocked = false; S.locked = false; }
  }
  function cancelSession(S, why, offerSolo, reason) {
    if (ST.sess !== S) return;
    if (S.mode === 'party' && isHost(S) && S.phase === 'lobby') rawSend('cancel', { sid: S.sid, why: 'cancel' });
    teardown(S, reason || 'cancel');
    if (why) toast(why, 3200);
    if (offerSolo && S.spec && S.spec.solo) {
      const id = S.id, o = S.opts;
      showCard({ title: S.spec.icon + ' ' + S.spec.name, line: why + ' Play with the gang instead?', buttons: [{ label: 'Play with AI friends', key: 'Y', fn: () => solo(id, o) }, { label: 'Not now', key: 'N', alt: true, fn: () => {} }], ms: 9000 });
    }
  }
  function teardown(S, reason) {
    if (S.handle && !S.endedHandle) { S.endedHandle = true; try { if (typeof S.handle.end === 'function') S.handle.end(reason); } catch (e) { N.err('party.end:' + S.id, e); } }
    if (S.ai) { try { S.ai.clear(); } catch (e) { N.err('party.aiClear', e); } }
    unlock(S);
    for (const id of S.marks.keys()) unblip(id);
    S.marks.clear();
    if (S.objective && N.hud && N.hud.objectiveText === S.objective) N.hud.objective(null);
    if (S.timerOn && N.hud) N.hud.timer(null);
    hideStrip(); hideCountdown(); closeLobby();
    if (ST.sess === S) ST.sess = null;
    holdGivers(false);
    ST.done.add(S.sid);
    N.emit('party:end', { id: S.id, sid: S.sid, reason });
  }
  function cancel(why) { const S = ST.sess; if (!S) return false; if (S.mode === 'party' && S.phase !== 'lobby') { rawSend('bye', { sid: S.sid }); } cancelSession(S, why || 'Stopped.', false); return true; }
  function leave() { return cancel('You stepped out.'); }

  /* ---------------------------------------------------------------- results */
  function report(S, uid, r) {
    if (!S || S.phase === 'done' || !S.players.some((p) => p.uid === uid)) return false;
    if (S.results.has(uid)) return false;
    const res = sanitizeResult(r || {});
    S.results.set(uid, res);
    const isMine = uid === (S.mode === 'solo' ? 'me' : myUid());
    if (isMine) S.reported = true;
    if (S.mode === 'party' && isMine) rawSend('res', { sid: S.sid, uid, r: res });
    N.emit('party:report', { id: S.id, sid: S.sid, uid, result: res });
    return true;
  }
  function resultsOf(S) {
    return S.players.map((p) => Object.assign({ uid: p.uid, nick: p.nick, isMe: p.isMe, isAI: p.isAI, left: S.left.has(p.uid) }, S.results.get(p.uid) || {}));
  }
  const fin = (v) => typeof v === 'number' && isFinite(v);
  function rank(S, summary) {
    const rows = resultsOf(S).map((r) => Object.assign({ reported: S.results.has(r.uid) }, r));
    if (summary && Array.isArray(summary.standings)) {
      const pos = new Map(summary.standings.map((u, i) => [u, i]));
      rows.sort((a, b) => (pos.has(a.uid) ? pos.get(a.uid) : 99) - (pos.has(b.uid) ? pos.get(b.uid) : 99));
    } else if (typeof S.spec.rank === 'function') {
      try { const o = S.spec.rank(rows.slice(), summary || {}); if (Array.isArray(o) && o.length === rows.length) rows.splice(0, rows.length, ...o); } catch (e) { N.err('party.rank:' + S.id, e); }
    } else {
      const out = (r) => (r.dnf || r.left || !r.reported ? 1 : 0);
      const kind = S.spec.kind;
      rows.sort((a, b) => {
        if (out(a) !== out(b)) return out(a) - out(b);
        if (fin(a.place) && fin(b.place) && a.place !== b.place) return a.place - b.place;
        if (kind === 'race') {
          if (fin(a.timeMs) && fin(b.timeMs) && a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
          if (fin(a.progress) || fin(b.progress)) return (b.progress || 0) - (a.progress || 0);
        } else if (kind === 'hide') {
          if (!!a.caught !== !!b.caught) return a.caught ? 1 : -1;
          if (fin(a.score) || fin(b.score)) return (b.score || 0) - (a.score || 0);
          if (fin(a.timeMs) || fin(b.timeMs)) return (b.timeMs || 0) - (a.timeMs || 0);
        }
        if (fin(a.score) || fin(b.score)) { if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0); }
        if (fin(a.timeMs) && fin(b.timeMs)) return a.timeMs - b.timeMs;
        if (fin(a.progress) || fin(b.progress)) return (b.progress || 0) - (a.progress || 0);
        return 0;
      });
    }
    let place = 0;
    const listed = summary && Array.isArray(summary.standings) ? new Set(summary.standings) : null;
    rows.forEach((r) => { r.rank = listed ? (listed.has(r.uid) && !r.left ? ++place : null) : (r.dnf || r.left || !r.reported ? null : ++place); if (listed && listed.has(r.uid)) r.reported = true; });
    return rows;
  }
  function finalize(S, summary) {
    if (S.phase === 'done' || S.finSent) return;
    const standings = rank(S, summary).map((r) => ({ uid: r.uid, nick: r.nick, rank: r.rank, timeMs: fin(r.timeMs) ? Math.round(r.timeMs) : null, score: fin(r.score) ? r.score : null, note: r.note || null, dnf: !!(r.dnf || !r.reported), left: !!r.left, caught: r.caught == null ? null : !!r.caught, isAI: !!r.isAI }));
    const sum = summary && typeof summary === 'object' ? sanitizeOpts(Object.assign({}, summary, { standings: undefined })) : {};
    S.finSent = true;
    if (S.mode === 'party') { const m = { sid: S.sid, standings, summary: sum }; rawSend('fin', m); setTimeout(() => rawSend('fin', m), 400); }
    applyFin(S, standings, sum);
  }
  function applyFin(S, standings, summary) {
    if (S.phase === 'done') return;
    S.phase = 'done';
    S.fin = standings;
    ST.lastFin = { id: S.id, sid: S.sid, mode: S.mode, name: S.spec.name, standings, summary };
    const meU = S.mode === 'solo' ? 'me' : myUid();
    const mine = standings.find((r) => r.uid === meU);
    const winner = standings.find((r) => r.rank === 1);
    teardown(S, 'done');
    // a moment for the "FINISHED!" banner before the card
    setTimeout(() => { if (!ST.sess || ST.sess.phase === 'done') showResults(S, standings, summary); }, TUNE.resultsDelay);
    if (winner) {
      if (winner.uid === meU) {
        ST.stats.wins[S.id] = (ST.stats.wins[S.id] | 0) + 1;
        const tok = Object.assign({ id: 'party_' + S.spec.kind, name: TOKENS[S.spec.kind].name, desc: TOKENS[S.spec.kind].desc }, S.spec.token || {});
        if (!ST.stats.firsts[tok.id]) {
          ST.stats.firsts[tok.id] = Date.now();
          try { if (N.tape && N.tape.addToken) N.tape.addToken(tok.id, { name: tok.name, desc: tok.desc + ' (' + S.spec.name + ')' }); } catch (e) { N.err('party.token', e); }
        }
        saveStats();
        sfx('mission_passed');
        toastQ('🏆 Shabash! You won ' + S.spec.name + '!', 3600);
      } else {
        toastQ('🏆 ' + winner.nick + ' won ' + S.spec.name + '! ' + (mine && mine.rank ? 'You came ' + ordinal(mine.rank) + '.' : ''), 3600);
      }
    }
    N.emit('party:results', { id: S.id, sid: S.sid, standings, summary });
  }
  const TOKENS = {
    race: { name: 'Racing pennant', desc: 'First win in a race with friends' },
    score: { name: 'Scorecard star', desc: 'First top score with friends' },
    hide: { name: 'Hide-and-seek badge', desc: 'First win at hide-and-seek' },
    custom: { name: 'Party ribbon', desc: 'First win at a party game' },
  };
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const fmtMs = (ms) => { if (!fin(ms)) return '—'; const s = ms / 1000, m = Math.floor(s / 60); return (m ? m + ':' + String(Math.floor(s % 60)).padStart(2, '0') : Math.floor(s)) + '.' + String(Math.floor((ms % 1000) / 100)); };

  /* ---------------------------------------------------------------- network in */
  function onNet(m) {
    if (!m || typeof m.type !== 'string') return;
    const d = m.data && typeof m.data === 'object' ? m.data : null;
    if (!d || !validSid(d.sid)) return;
    const S = ST.sess;
    const from = m.from;
    switch (m.type) {
      case 'inv': return onInvite(from, m.nick, d);
      case 'acc': if (S && S.sid === d.sid && isHost(S) && S.phase === 'lobby' && !S.acc.has(from)) { S.acc.set(from, { nick: cleanNick(d.nick || m.nick), look: lookOf(d.look), t: Date.now() }); S.skip.delete(from); sendInvite(S); renderLobby(); toastQ(cleanNick(m.nick) + ' accepted!', 1600); } return;
      case 'skip': if (S && S.sid === d.sid && isHost(S) && S.phase === 'lobby') { S.skip.add(from); S.acc.delete(from); renderLobby(); } return;
      case 'ping': if (S && S.sid === d.sid && S.mode === 'party' && S.host === myUid() && d.to === myUid() && isFinite(d.c)) rawSend('pong', { sid: S.sid, to: from, c: +d.c, h: Date.now() }); return;
      case 'pong': if ((S && S.sid === d.sid) || (ST.invite && ST.invite.sid === d.sid)) onPong(d); return;
      case 'go': return onGo(from, d);
      case 'cancel':
        if (ST.invite && ST.invite.sid === d.sid && from === ST.invite.host) { ST.invite = null; closeInvite(); toastQ('The challenge was called off.', 2000); }
        if (S && S.sid === d.sid && S.phase === 'lobby' && from === S.host) { teardown(S, 'cancel'); toast('The challenge was called off.'); }
        return;
      case 'res': if (S && S.sid === d.sid && validUid(d.uid) && d.uid === from) { report(S, from, d.r); renderStrip(S); checkDone(S); } return;
      case 'bye': if (S && S.sid === d.sid) markLeft(S, from, true); return;
      case 'fin': if (S && S.sid === d.sid && Array.isArray(d.standings) && from === currentHost(S)) applyFin(S, cleanStandings(S, d.standings), sanitizeOpts(d.summary)); return;
      case 'a': {
        if (!S || S.sid !== d.sid || S.phase === 'lobby' || typeof d.t !== 'string' || !/^[a-z][a-z0-9_]{0,15}$/.test(d.t)) return;
        const p = S.players.find((q) => q.uid === from);
        if (!p) return;
        const set = S.subs.get(d.t);
        if (set) for (const fn of Array.from(set)) { try { fn(d.d, p); } catch (e) { N.err('party.on:' + d.t, e); } }
        return;
      }
      default:
    }
  }
  function lookOf(l) { try { return N.online && N.online._debug && N.online._debug.sanitizeLook ? N.online._debug.sanitizeLook(l) : { kind: 'kid' }; } catch (e) { return { kind: 'kid' }; } }
  function cleanStandings(S, list) {
    const byUid = new Map(S.players.map((p) => [p.uid, p]));
    return list.filter((r) => r && byUid.has(r.uid)).slice(0, 10).map((r) => ({ uid: r.uid, nick: byUid.get(r.uid).nick, rank: fin(r.rank) ? r.rank | 0 : null, timeMs: fin(r.timeMs) ? r.timeMs : null, score: fin(r.score) ? r.score : null, note: r.note ? String(r.note).slice(0, 60) : null, dnf: !!r.dnf, left: !!r.left, caught: r.caught == null ? null : !!r.caught, isAI: false }));
  }
  function onInvite(from, nick, d) {
    const s = REG.get(d.id);
    if (!s || ST.done.has(d.sid) || ST.skipped.has(d.sid) || d.host !== from) return;
    const S = ST.sess;
    if (S && S.sid === d.sid) {
      // already accepted: the lobby list
      if (S.phase === 'lobby' && !isHost(S)) { S.acc = new Map((Array.isArray(d.acc) ? d.acc : []).filter(validUid).map((k, i) => [k, { t: i }])); S.exp = +d.exp || S.exp; renderLobby(); }
      return;
    }
    if (S) { rawSend('skip', { sid: d.sid, why: 'busy' }); ST.skipped.add(d.sid); return; }
    const why = busyWhy();
    if (why) { rawSend('skip', { sid: d.sid, why: 'busy' }); ST.skipped.add(d.sid); toastQ(cleanNick(nick) + ' challenged you to ' + s.name + ', but: ' + why, 3000); return; }
    const inv = { sid: d.sid, id: d.id, spec: s, host: from, nick: cleanNick(d.nick || nick), opts: sanitizeOpts(d.opts), exp: +d.exp || 0, rx: Date.now(), acc: Array.isArray(d.acc) ? d.acc.filter(validUid) : [] };
    if (ST.invite && ST.invite.sid === d.sid) { ST.invite.acc = inv.acc; ST.invite.exp = inv.exp; renderInvite(); return; }
    ST.invite = inv;
    // start measuring the clock against this host straight away (the countdown needs it)
    CLK.host = from; CLK.sid = d.sid; CLK.n = 0; CLK.rtt = Infinity;
    clearInterval(CLK.timer);
    // at least pingN round trips; keep going (up to pingMax) until one comes back quickly (a busy page answers late)
    CLK.timer = setInterval(() => { if (!ST.invite && !(ST.sess && ST.sess.sid === d.sid)) { clearInterval(CLK.timer); CLK.timer = null; return; } if (CLK.n >= TUNE.pingMax || (CLK.n >= TUNE.pingN && CLK.rtt <= TUNE.pingGood)) { clearInterval(CLK.timer); CLK.timer = null; return; } CLK.n++; rawSend('ping', { sid: d.sid, c: Date.now(), to: from }); }, TUNE.pingGap);
    renderInvite();
    sfx('bell');
    N.emit('party:invite', { id: d.id, sid: d.sid, from: inv.nick });
  }
  function acceptInvite() {
    const inv = ST.invite;
    if (!inv || ST.sess) return false;
    const why = busyWhy();
    if (why) { toast(why); declineInvite(); return false; }
    const S = makeSession({ sid: inv.sid, id: inv.id, mode: 'party', host: inv.host, hostNick: inv.nick, opts: inv.opts, exp: inv.exp });
    S.acc = new Map(inv.acc.map((k, i) => [k, { t: i }]));
    S.acc.set(myUid(), { t: 99 });
    ST.sess = S;
    ST.invite = null;
    rawSend('acc', { sid: S.sid, nick: myNick(), look: myLook() });
    closeInvite();
    renderLobby();
    sfx('ui_select');
    return true;
  }
  function declineInvite() {
    const inv = ST.invite;
    if (!inv) return false;
    rawSend('skip', { sid: inv.sid });
    ST.skipped.add(inv.sid);
    ST.invite = null;
    closeInvite();
    sfx('ui_back');
    return true;
  }
  function onGo(from, d) {
    const s = REG.get(d.id);
    if (!s || ST.done.has(d.sid) || !Array.isArray(d.players) || !isFinite(d.startAt) || !isFinite(d.seed)) return;
    const S = ST.sess;
    const list = d.players.filter((p) => p && validUid(p.uid)).slice(0, 10);
    const me = myUid();
    if (!S || S.sid !== d.sid) {
      if (ST.invite && ST.invite.sid === d.sid) { closeInvite(); ST.invite = null; toastQ(cleanNick(d.players[0] && d.players[0].nick) + ' started ' + s.name + '.', 2400); }
      return;
    }
    if (S.phase !== 'lobby' || from !== S.host) return;
    if (!list.some((p) => p.uid === me)) { teardown(S, 'cancel'); toast('The ' + s.name + ' was full. Next time!'); return; }
    S.seed = (+d.seed) | 0; S.startAt = +d.startAt; S.opts = sanitizeOpts(d.opts);
    S.players = list.map((p) => ({ uid: p.uid, nick: p.uid === me ? myNick() : cleanNick(p.nick), isMe: p.uid === me, isAI: false, look: p.uid === me ? ((N.player && N.player.look) || myLook()) : lookOf(p.look) }));
    begin(S);
  }
  function markLeft(S, uid, quit) {
    if (!S || S.left.has(uid) || !S.players.some((p) => p.uid === uid)) return;
    S.left.add(uid);
    const p = S.players.find((q) => q.uid === uid);
    if (S.phase !== 'done' && S.phase !== 'lobby') toastQ((p ? p.nick : 'A player') + (quit ? ' stopped playing.' : ' left the room.'), 2200);
    for (const fn of S.leaveFns.slice()) { try { fn(uid); } catch (e) { N.err('party.onLeave', e); } }
    renderStrip(S);
  }
  N.on('online:players', () => {
    const S = ST.sess;
    if (ST.invite && !roomPlayers().some((p) => p.key === ST.invite.host)) { closeInvite(); ST.invite = null; }
    if (!S || S.mode !== 'party') return;
    const here = new Set(roomPlayers().map((p) => p.key));
    if (S.phase === 'lobby') {
      if (!here.has(S.host)) { teardown(S, 'cancel'); toast('The host left. Challenge called off.'); return; }
      if (isHost(S)) { for (const k of Array.from(S.acc.keys())) if (!here.has(k)) S.acc.delete(k); renderLobby(); }
      return;
    }
    for (const p of S.players) if (!p.isAI && !here.has(p.uid)) markLeft(S, p.uid, false);
  });
  N.on('online:room', (d) => {
    if (d && d.code) return;
    if (ST.invite) { closeInvite(); ST.invite = null; }
    const S = ST.sess;
    if (S && S.mode === 'party') { teardown(S, 'left'); toast('You left the room, so ' + S.spec.name + ' stopped for you.', 3200); }
  });
  for (const ev of ['game:quit', 'save:loaded', 'game:new']) N.on(ev, () => { const S = ST.sess; if (S) { if (S.mode === 'party' && S.phase !== 'lobby') rawSend('bye', { sid: S.sid }); teardown(S, 'quit'); } closeInvite(); ST.invite = null; closeResults(); });

  /* ================================================================ ctx */
  function makeCtx(S) {
    const me = S.players.find((p) => p.isMe) || S.players[0];
    const rng = U.rng(S.seed || 1);
    let sendBucket = TUNE.sendPerSec, sendT = Date.now();
    const ctx = {
      get mode() { return S.mode; }, id: S.id, sid: S.sid, spec: S.spec, seed: S.seed, opts: S.opts,
      players: S.players, me, slot: Math.max(0, S.players.indexOf(me)),
      get isHost() { return currentHost(S) === me.uid; },
      startAt: S.startAt,
      now: () => (S.mode === 'solo' ? gameNow() : sharedNow()),
      elapsed: () => (S.mode === 'solo' ? gameNow() : sharedNow()) - S.startAt,
      get phase() { return S.phase; },
      rng,
      send(type, data) {
        if (S.mode !== 'party' || S.phase === 'done' || !/^[a-z][a-z0-9_]{0,15}$/.test(String(type || ''))) return false;
        const t = Date.now();
        sendBucket = Math.min(TUNE.sendPerSec, sendBucket + ((t - sendT) / 1000) * TUNE.sendPerSec); sendT = t;
        if (sendBucket < 1) return false;
        sendBucket -= 1;
        return rawSend('a', { sid: S.sid, t: type, d: data === undefined ? null : data });
      },
      on(type, fn) {
        if (typeof fn !== 'function') return () => {};
        let set = S.subs.get(type); if (!set) { set = new Set(); S.subs.set(type, set); }
        set.add(fn);
        return () => set.delete(fn);
      },
      report(result) { const ok = report(S, me.uid, result); if (ok) { renderStrip(S); checkDone(S); } return ok; },
      results: () => resultsOf(S).filter((r) => S.results.has(r.uid)),
      end(summary) {
        if (S.phase === 'done') return;
        if (S.mode === 'solo' || currentHost(S) === me.uid) { finalize(S, summary); return; }
        if (!S.reported) ctx.report((summary && summary.result) || { dnf: true });
      },
      left: (uid) => S.left.has(uid),
      onLeave(fn) { if (typeof fn === 'function') S.leaveFns.push(fn); },
      place: (x, y, angle, o) => placeMe(x, y, angle, o),
      grid: (x, y, angle, i, o) => gridSlot(x, y, angle, i, o),
      cycleFor: (look) => cycleFor(look),
      marker(id, m) { if (!m || !isFinite(m.x) || !isFinite(m.y)) return; const k = 'pt:' + id; const o = Object.assign({ r: 30, color: '#ff5fb0', kind: 'ring', state: 'next' }, m, { id: k }); S.marks.set(k, o); syncBlip(o); return k; },
      unmarker(id) { const k = 'pt:' + id; S.marks.delete(k); unblip(k); },
      status(text) { S.statusText = text || ''; renderStrip(S); },
      board(rows) { S.boardRows = Array.isArray(rows) ? rows.slice(0, 10) : null; renderStrip(S); },
      objective(text) { S.objective = text || null; try { N.hud.objective(text || null); } catch (e) { /* ignore */ } },
      timer(ms) { try { if (ms == null) { N.hud.timer(null); S.timerOn = false; } else { N.hud.timer(S.spec.kind === 'race' ? 'RACE' : 'TIME', Math.max(0, ms / 1000), { countdown: false }); S.timerOn = true; } } catch (e) { /* ignore */ } },
      toast: (t, ms) => toastQ(t, ms),
      bark(target, text, secs) { try { if (N.dialogue && N.dialogue.bark) N.dialogue.bark(target, text, { secs: secs || 2.6 }); } catch (e) { /* ignore */ } },
      fmt: fmtMs,
    };
    S.ai = makeAI(S, ctx);
    ctx.ai = S.ai;
    return ctx;
  }
  function checkDone(S) {
    if (S.phase === 'done') return;
    const host = currentHost(S) === (S.mode === 'solo' ? 'me' : myUid());
    if (!host) return;
    const pend = S.players.filter((p) => !S.left.has(p.uid) && !S.results.has(p.uid));
    if (!pend.length) finalize(S, null);
  }
  function placeMe(x, y, angle, o) {
    o = o || {};
    const p = N.player;
    if (!p || !isFinite(x) || !isFinite(y)) return null;
    try { if (p.vehicle && N.vehicles && N.vehicles.exit) { if (!N.vehicles.exit(p, true)) N.vehicles.exit(p, true); } } catch (e) { N.err('party.exit', e); }
    if (p.level && N.world.roofs && N.world.roofs.descend) { try { N.world.roofs.descend(p, { x, y, instant: true }); } catch (e) { /* ignore */ } }
    p.teleport(x, y, { ground: true });
    p.angle = p.facing = angle || 0;
    p.vx = p.vy = 0;
    let v = null;
    if (o.vehicle && N.vehicles && N.vehicles.TYPES[o.vehicle]) {
      v = N.vehicles.spawn(o.vehicle, p.x, p.y, angle || 0, { color: o.color });
      if (v) { v.partyOwned = true; N.vehicles.enter(p, v, { quiet: true }); }
    }
    try { if (N.render.warmChunks) N.render.warmChunks(p.x, p.y, 300); if (N.render.snapCamera) N.render.snapCamera(); } catch (e) { /* ignore */ }
    try { if (N.view3d && N.view3d.active && N.view3d.snapCamera) N.view3d.snapCamera(); } catch (e) { /* ignore */ }
    return v;
  }
  function gridSlot(x, y, angle, i, o) {
    o = o || {};
    const gap = o.gap || 13, side = o.side || 7;
    const row = Math.floor(i / 2), col = i % 2 ? 1 : -1;
    const fx = Math.cos(angle), fy = Math.sin(angle);
    let px = x - fx * gap * row + -fy * side * col, py = y - fy * gap * row + fx * side * col;
    const mode = o.mode || 'drive';
    try { const f = N.world.findFree(px, py, mode, 6); if (f) { px = f.x; py = f.y; } } catch (e) { /* ignore */ }
    return { x: px, y: py, angle };
  }
  /** an age-appropriate cycle for a look: girls / women -> ladies cycle, small kids -> kid cycle, boys -> BSA SLR
   *  or Hercules, grown-ups -> the Hero roadster */
  function cycleFor(look, seed) {
    const l = look || {};
    if (l.girl || l.kind === 'woman' || l.kind === 'saree' || l.kind === 'aunty' || l.kind === 'burqa') return 'ladiescycle';
    if (l.kind === 'kid') return (l.size && l.size < 0.86) ? 'kid_cycle' : ((seed || 0) & 1 ? 'hercules_cycle' : 'bsa_cycle');
    if (l.kind === 'student') return 'hercules_cycle';
    return 'hero_cycle';
  }

  /* ---------------------------------------------------------------- AI friends */
  function makeAI(S, ctx) {
    const A = new Map(); // uid -> {key, npc, actor, runner}
    const rng = U.rng(((S.seed || 7) * 2654435761) >>> 0);
    const diff = () => { try { const d = N.settings && (N.settings.difficulty || (N.settings.get && N.settings.get('difficulty'))); return d === 'relaxed' ? -0.1 : d === 'hard' ? 0.08 : 0; } catch (e) { return 0; } };
    const skills = new Map();
    for (const p of S.players) if (p.isAI) { const f = FRIEND.get(p.npc) || { skill: 0.6 }; skills.set(p.uid, clamp(f.skill + (rng.next() - 0.5) * 0.12 + diff(), 0.25, 0.97)); }
    const rec = (uid) => A.get(uid) || null;
    function bark(uid, text, secs) {
      const r = rec(uid);
      if (!r || !r.actor || !text) return;
      try { if (N.npcs && N.npcs.bark) N.npcs.bark(r.key, text, { secs: secs || 2.6 }); else if (N.dialogue && N.dialogue.bark) N.dialogue.bark(r.actor, text, { secs: secs || 2.6 }); } catch (e) { /* ignore */ }
    }
    const ai = {
      get list() { return S.players.filter((p) => p.isAI); },
      friend: (uid) => FRIEND.get(String(uid).replace(/^ai:/, '')) || null,
      skill: (uid) => (skills.has(uid) ? skills.get(uid) : 0.6),
      rng,
      cycleFor(uid) { const f = ai.friend(uid); return (f && f.cycle) || 'cycle'; },
      spawn(uid, x, y, o) {
        o = o || {};
        const p = S.players.find((q) => q.uid === uid && q.isAI);
        if (!p || !N.npcs || !N.npcs.spawn) return null;
        const key = 'party:' + p.npc;
        let actor = null;
        try { actor = N.npcs.spawn(p.npc, { x, y }, { key, talk: false, idle: 'stand', angle: o.angle || 0, owner: 'party', free: o.free }); } catch (e) { N.err('party.aiSpawn', e); }
        if (!actor) return null;
        actor.partyAI = true;
        const r = { uid, key, npc: p.npc, actor, runner: null };
        A.set(uid, r);
        if (o.vehicle) {
          try {
            const f = FRIEND.get(p.npc);
            const v = N.npcs.ride(key, o.vehicle === true ? ai.cycleFor(uid) : o.vehicle, { angle: o.angle || 0, color: o.color || (f && f.color) });
            if (v) { v.x = x; v.y = y; v.angle = o.angle || 0; v.vx = v.vy = 0; v.speed = 0; actor.x = x; actor.y = y; v.partyOwned = true; v.controller = brakeCtl; }
          } catch (e) { N.err('party.aiRide', e); }
        }
        return actor;
      },
      actor: (uid) => (rec(uid) ? rec(uid).actor : null),
      vehicle: (uid) => (rec(uid) && rec(uid).actor ? rec(uid).actor.vehicle || null : null),
      ride(uid, path, o) {
        const r = rec(uid);
        if (!r || !r.actor || !r.actor.vehicle || !Array.isArray(path) || path.length < 2) return null;
        if (r.runner) r.runner.stop();
        r.runner = rideRunner(S, ai, uid, r.actor.vehicle, path, o || {});
        return r.runner;
      },
      walk(uid, path, o) {
        const r = rec(uid);
        if (!r || !r.actor || !Array.isArray(path) || !path.length) return null;
        if (r.runner) r.runner.stop();
        r.runner = walkRunner(S, r, path, o || {});
        return r.runner;
      },
      stop(uid) { const r = rec(uid); if (r && r.runner) { r.runner.stop(); r.runner = null; } },
      bark,
      report: (uid, result) => { const ok = report(S, uid, result); if (ok) { renderStrip(S); checkDone(S); } return ok; },
      despawn(uid) { const r = rec(uid); if (!r) return; if (r.runner) r.runner.stop(); try { N.npcs.despawn(r.key); } catch (e) { /* ignore */ } A.delete(uid); },
      clear() { for (const uid of Array.from(A.keys())) ai.despawn(uid); },
      get records() { return A; },
    };
    return ai;
  }
  function brakeCtl(v) { v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.brake = true; v.ctl.handbrake = false; }
  // pure pursuit along a polyline, with corner slow-down, stuck recovery and a comic "wobble" now and then
  function rideRunner(S, ai, uid, v, path, o) {
    const pts = path.map((p) => ({ x: +p.x, y: +p.y }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = cum[cum.length - 1];
    const skill = ai.skill(uid);
    const T = v.T || N.vehicles.TYPES[v.type];
    const R = { uid, i: 0, s: 0, total, done: false, stopped: false, hold: 0, rev: 0, chk: 0.8, x0: v.x, y0: v.y, stuck: 0, wob: 4 + Math.random() * 8, hops: 0, falls: 0,
      get progress() { return total > 0 ? clamp(R.s / total, 0, 1) : 1; },
      stop() { R.stopped = true; if (v.controller === ctl) v.controller = brakeCtl; },
      pos: () => ({ x: v.x, y: v.y }) };
    const base = (T.maxSpeed || 110) * (0.8 + 0.17 * skill);
    function pointAt(s) {
      s = clamp(s, 0, total);
      let i = R.i; while (i < pts.length - 2 && cum[i + 1] < s) i++;
      while (i > 0 && cum[i] > s) i--;
      const L = cum[i + 1] - cum[i] || 1, t = (s - cum[i]) / L;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, i };
    }
    function ctl(veh, dt) {
      const c = veh.ctl;
      if (R.coast) {
        // past the finish: roll on and pull over to the side of the road, out of the way of the others
        const q = R.coast, d = Math.hypot(q.x - veh.x, q.y - veh.y);
        if (d < 8 || R.coastT > 6) { brakeCtl(veh); return; }
        R.coastT += dt;
        c.steer = clamp(U.angleDiff(veh.angle, Math.atan2(q.y - veh.y, q.x - veh.x)) * 2.4, -1, 1); c.handbrake = false;
        const want = Math.min(55, d * 1.2);
        c.throttle = veh.speed < want ? 0.4 : 0; c.brake = veh.speed > want + 8;
        return;
      }
      if (R.stopped || R.done || S.phase === 'done') { brakeCtl(veh); return; }
      const now = S.ctx ? S.ctx.now() : 0;
      if (now < S.startAt) { brakeCtl(veh); return; }
      if (R.hold > 0) { R.hold -= dt; brakeCtl(veh); return; }
      // progress: project onto the current and next segments
      for (let k = 0; k < 6 && R.i < pts.length - 2; k++) {
        const a = pts[R.i], b = pts[R.i + 1];
        const q = U.closestOnSeg(veh.x, veh.y, a.x, a.y, b.x, b.y);
        const a2 = pts[R.i + 1], b2 = pts[R.i + 2];
        const q2 = U.closestOnSeg(veh.x, veh.y, a2.x, a2.y, b2.x, b2.y);
        if (q.t >= 0.999 || q2.d2 < q.d2) R.i++; else break;
      }
      {
        const a = pts[R.i], b = pts[Math.min(R.i + 1, pts.length - 1)];
        const q = U.closestOnSeg(veh.x, veh.y, a.x, a.y, b.x, b.y);
        R.s = Math.max(R.s, cum[R.i] + (cum[Math.min(R.i + 1, cum.length - 1)] - cum[R.i]) * q.t);
      }
      const sp = Math.abs(veh.speed || 0);
      const look = (o.lookahead || 16) + sp * 0.3;
      const tg = pointAt(R.s + look);
      // each rider keeps to its own line on the road (o.lane u to the right of the centre line), merging in at the end
      if (o.lane) { const tg2 = pointAt(R.s + look + 6), ang = Math.atan2(tg2.y - tg.y, tg2.x - tg.x), k = clamp((total - R.s - look) / 60, 0, 1); tg.x -= Math.sin(ang) * o.lane * k; tg.y += Math.cos(ang) * o.lane * k; }
      const dEnd = total - R.s;
      if (dEnd < (o.r || 14) && Math.hypot(pts[pts.length - 1].x - veh.x, pts[pts.length - 1].y - veh.y) < (o.r || 14) + 10) {
        R.done = true; brakeCtl(veh);
        if (o.coast !== false) {
          const e = pts[pts.length - 1], f = pts[Math.max(0, pts.length - 3)], a = Math.atan2(e.y - f.y, e.x - f.x), side = o.lane < 0 ? -1 : 1;
          let x = e.x + Math.cos(a) * 55 - Math.sin(a) * 16 * side, y = e.y + Math.sin(a) * 55 + Math.cos(a) * 16 * side;
          try { const fr = N.world.findFree(x, y, 'drive', 8); if (fr) { x = fr.x; y = fr.y; } } catch (er) { /* ignore */ }
          R.coast = { x, y }; R.coastT = 0;
        }
        try { if (o.onDone) o.onDone(R); } catch (e) { N.err('party.aiDone', e); }
        return;
      }
      // corner ahead: the turn between now and 70 u ahead
      const a1 = pointAt(R.s + 4), a2 = pointAt(R.s + 34), a3 = pointAt(R.s + 70);
      const turn = Math.abs(U.angleDiff(Math.atan2(a2.y - a1.y, a2.x - a1.x), Math.atan2(a3.y - a2.y, a3.x - a2.x)));
      let want = base * (typeof o.mul === 'function' ? clamp(+o.mul(R) || 1, 0.4, 1.2) : 1);
      if (o.speed) want = Math.min(want, o.speed);
      want *= clamp(1 - turn * (0.55 - skill * 0.2), 0.42, 1);
      want = Math.min(want, (T.maxSpeed || 110) * 0.99);
      // a wobble now and then (looks back, adjusts the chappal)
      R.wob -= dt;
      if (R.wob < 0) { R.wob = 5 + Math.random() * (10 + 10 * skill); if (Math.random() < 0.5 - skill * 0.35) R.hold = 0.25 + Math.random() * 0.35; }
      const diffA = U.angleDiff(veh.angle, Math.atan2(tg.y - veh.y, tg.x - veh.x));
      if (R.rev > 0) { R.rev -= dt; c.brake = false; c.handbrake = false; c.throttle = -0.7; c.steer = clamp(-diffA * 2, -1, 1); return; }
      if (Math.abs(diffA) > 1.2) want = Math.min(want, 30); else if (Math.abs(diffA) > 0.55) want = Math.min(want, 62);
      // something in the way (traffic, a cow, a pedestrian, another rider): ease off and swerve to the freer side
      R.scanT = (R.scanT || 0) - dt;
      if (R.scanT <= 0) {
        R.scanT = 0.12; R.block = null;
        const ca = Math.cos(veh.angle), sa = Math.sin(veh.angle), reach = 12 + sp * 0.32;
        try {
          N.entities.query(veh.x + ca * reach * 0.6, veh.y + sa * reach * 0.6, reach * 0.75, (e) => {
            if (e === veh || e === veh.driver || e.kind === 'ghost' || e.alive === false || (e.kind !== 'vehicle' && e.kind !== 'ped' && e.kind !== 'animal' && e.kind !== 'npc')) return false;
            if (e.vehicle) return false;
            const dx = e.x - veh.x, dy = e.y - veh.y, fwd = dx * ca + dy * sa, lat = -dx * sa + dy * ca;
            const w = (e.T ? e.T.d / 2 : e.r || 4) + 4;
            if (fwd > 2 && fwd < reach && Math.abs(lat) < w) { if (!R.block || fwd < R.block.fwd) R.block = { fwd, lat, sp: e.T ? Math.max(0, (e.vx || 0) * ca + (e.vy || 0) * sa) : 0 }; }
            return false;
          });
        } catch (e) { R.block = null; }
      }
      let steerAdd = 0;
      if (R.block) { want = Math.min(want, Math.max(R.block.sp, 18 + R.block.fwd * 1.2)); steerAdd = (R.block.lat >= 0 ? -1 : 1) * 0.45; }
      c.steer = clamp(diffA * 2.6 + steerAdd, -1, 1);
      c.handbrake = false;
      if (veh.speed < want - 4) { c.throttle = clamp((want - veh.speed) / 26, 0.3, 1); c.brake = false; }
      else if (veh.speed > want + 10) { c.throttle = 0; c.brake = true; }
      else { c.throttle = 0.25; c.brake = false; }
      // stuck: back out; off-screen and stuck again: hop along the path
      R.chk -= dt;
      if (R.chk <= 0) {
        R.chk = 0.8;
        const moved = Math.hypot(veh.x - R.x0, veh.y - R.y0);
        R.x0 = veh.x; R.y0 = veh.y;
        if (moved < 4 && want > 10) { R.stuck++; R.rev = 0.6; } else R.stuck = 0;
        // stuck: off-screen after ~2.5 s, or in view after ~5 s (wedged in a jam: the rider walks the cycle round it),
        // hop a little further along the path to a free spot clear of other vehicles
        const seen = N.render.inView(veh.x, veh.y, 40);
        if ((R.stuck >= 3 && !seen) || R.stuck >= 6) {
          for (const ahead of [26, 40, 56]) {
            const q = pointAt(R.s + ahead);
            const f = N.world.findFree(q.x, q.y, 'drive', 10);
            if (!f || (!seen && N.render.inView(f.x, f.y, 20))) continue;
            let clear = true;
            try { N.entities.query(f.x, f.y, 9, (e) => { if (e !== veh && e.kind === 'vehicle' && e.alive !== false) clear = false; return false; }); } catch (e) { /* ignore */ }
            if (!clear) continue;
            veh.x = f.x; veh.y = f.y; veh.vx = veh.vy = 0; veh.speed = 0;
            const q2 = pointAt(R.s + ahead + 16); veh.angle = Math.atan2(q2.y - f.y, q2.x - f.x);
            R.stuck = 0; R.hops++;
            break;
          }
        }
      }
    }
    v.controller = ctl;
    R.ctl = ctl;
    return R;
  }
  // walking runner: a chain of N.npcs.walkTo hops along the path (its planner handles walls)
  function walkRunner(S, r, path, o) {
    const R = { i: 0, done: false, stopped: false, get progress() { return path.length ? R.i / path.length : 1; }, stop() { R.stopped = true; try { N.npcs.stop(r.key); } catch (e) { /* ignore */ } } };
    (async () => {
      try {
        while (S.ctx && S.ctx.now() < S.startAt && !R.stopped) await new Promise((res) => setTimeout(res, 50));
        for (; R.i < path.length && !R.stopped && S.phase !== 'done'; R.i++) {
          const q = path[R.i];
          const sp = q.speed != null ? q.speed : typeof o.speed === 'function' ? o.speed(R) : o.speed;
          const okk = await N.npcs.walkTo(r.key, { x: q.x, y: q.y }, { run: o.run !== false, speed: sp, r: q.r || o.r || 6, timeout: q.timeout || o.timeout || 60 });
          if (!okk && R.stopped) return;
          if (q.wait) await new Promise((res) => setTimeout(res, q.wait));
          if (q.onArrive) { try { await q.onArrive(R); } catch (e) { N.err('party.walkArrive', e); } }
        }
        if (!R.stopped && S.phase !== 'done') { R.done = true; if (o.onDone) o.onDone(R); }
      } catch (e) { if (!(e && e.name === 'MissionAbort')) N.err('party.walk', e); }
    })();
    return R;
  }

  /* ================================================================ mission givers held while a session runs */
  let held = false;
  function holdGivers(on) {
    held = !!on;
    const M = N.missions;
    if (!M || !M.defs) return;
    for (const id in M.defs) {
      const d = M.defs[id];
      if (!d || !(d.giver || d.autoStart) || d.__ptWhen) continue;
      const ow = d.when;
      d.__ptWhen = true;
      d.when = function () { if (held) return false; return typeof ow === 'function' ? ow.apply(this, arguments) : true; };
    }
  }

  /* ================================================================ markers: 2D rings, minimap blips, 3D layer */
  function syncBlip(m) {
    try {
      if (!N.hud || !N.hud.blip) return;
      if (m.blip === false || m.state === 'done') { N.hud.unblip(m.id); return; }
      const next = m.state === 'next';
      N.hud.blip(m.id, { x: m.x, y: m.y }, { color: m.color, icon: m.kind === 'finish' ? 'star' : m.kind === 'chit' ? 'diamond' : 'ring', label: m.label || '', pulse: next, route: !!(m.route && next), size: next ? 1.2 : 0.8, edge: next });
    } catch (e) { N.err('party.blip', e); }
  }
  function unblip(id) { try { if (N.hud && N.hud.unblip) N.hud.unblip(id); } catch (e) { /* ignore */ } }
  function marksList() { const S = ST.sess; return S && S.phase !== 'lobby' ? Array.from(S.marks.values()) : []; }
  function draw2D() {
    const list = marksList();
    if (!list.length) return;
    const R = N.render, t = N.time.real || 0;
    let next = null;
    for (const m of list) {
      if (m.state === 'done') continue;
      if (m.state === 'next' && (!next || m.kind === 'finish')) next = next || m;
      if (!R.inView(m.x, m.y, m.r + 60)) continue;
      R.queue('ground', 2.5, (ctx) => drawRing(ctx, m, t));
      if ((R.night || 0) > 0.05 && m.state === 'next') R.lights.push({ x: m.x, y: m.y, r: m.r * 2, color: m.color, intensity: 0.7 });
    }
    if (next && !R.inView(next.x, next.y, 8) && N.state.mode === 'play') R.queue('fx', 0, (ctx) => edgeArrow(ctx, next.x, next.y, next.color));
  }
  function drawRing(ctx, m, t) {
    const R = N.render, k0 = R.k(0), Z = R.Z || 1;
    const X = R.sx(m.x, k0), Y = R.sy(m.y, k0), r = m.r * k0;
    const [cr, cg, cb] = U.hexToRgb(m.color);
    const rgba = (a) => 'rgba(' + cr + ',' + cg + ',' + cb + ',' + clamp(a, 0, 1).toFixed(3) + ')';
    const next = m.state === 'next', pulse = 0.5 + 0.5 * Math.sin(t * 4);
    if (next) {
      const g = ctx.createRadialGradient(X, Y, r * 0.2, X, Y, r * 1.15);
      g.addColorStop(0, rgba(0.0)); g.addColorStop(0.75, rgba(0.18 + 0.1 * pulse)); g.addColorStop(1, rgba(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * 1.15, 0, TAU); ctx.fill();
    }
    ctx.lineWidth = Math.max(2, (next ? 5 : 3) * Z); ctx.strokeStyle = 'rgba(18,13,22,0.5)';
    ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, (next ? 3.2 : 1.6) * Z); ctx.strokeStyle = rgba(next ? 0.95 : 0.45);
    if (!next) ctx.setLineDash([6 * Z, 5 * Z]);
    ctx.beginPath(); ctx.arc(X, Y, r * (next ? 0.96 + 0.04 * pulse : 1), 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    if (m.kind === 'finish') {
      // a chequered band across the ring
      const a = m.angle || 0, ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2), w = Math.max(3, 4 * k0), n = 8;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
        const u = -r + (2 * r * i) / n, v = (j - 1) * w;
        ctx.fillStyle = (i + j) % 2 ? '#f4ead8' : '#1a1214';
        ctx.save(); ctx.translate(X, Y); ctx.rotate(a + Math.PI / 2); ctx.fillRect(u, v, (2 * r) / n + 0.5, w); ctx.restore();
      }
      void ca; void sa;
    }
    if (m.kind === 'chit' && next) {
      ctx.fillStyle = '#fff8e6'; ctx.strokeStyle = '#1a1214'; ctx.lineWidth = 1;
      const s = Math.max(4, 5 * k0), bob = Math.sin(t * 3) * 1.5;
      ctx.save(); ctx.translate(X, Y - 6 * Z + bob); ctx.rotate(Math.sin(t * 1.7) * 0.3); ctx.fillRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.strokeRect(-s, -s * 0.7, s * 2, s * 1.4); ctx.restore();
    }
    const lab = m.num != null ? String(m.num) : m.kind === 'finish' ? 'FINISH' : m.label && next ? m.label : '';
    if (lab && N.draw && N.draw.pixelTextCanvas) {
      const c = N.draw.pixelTextCanvas(String(lab).toUpperCase().slice(0, 16), next ? '#fff4dc' : '#d8c8b0', '#120d16');
      ctx.globalAlpha = next ? 1 : 0.7;
      ctx.drawImage(c, Math.round(X - c.width / 2), Math.round(Y - r - c.height - 2));
      ctx.globalAlpha = 1;
    }
  }
  function edgeArrow(ctx, x, y, color) {
    const R = N.render, W = R.W, H = R.H;
    const p = R.proj(x, y, 0);
    const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy, mg = 16;
    const s = Math.min((W / 2 - mg) / Math.max(1e-6, Math.abs(dx)), (H / 2 - mg) / Math.max(1e-6, Math.abs(dy)));
    const X = cx + dx * s, Y = cy + dy * s, a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(Math.round(X), Math.round(Y)); ctx.rotate(a);
    ctx.fillStyle = '#120d16'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7, -8); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-5, -5.2); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5.2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // 3D: flat glowing rings on the road + a light band for the next one; the finish gets two posts and a banner
  const V3 = { ok: false, pool: [], T: null, H: null, grp: null };
  function v3Init(THREE, H) {
    V3.T = THREE; V3.H = H;
    const g = new THREE.Group(); g.name = 'party-marks'; H.layer.add(g); V3.grp = g;
    V3.geo = { ring: new THREE.RingGeometry(0.9, 1.0, 48), band: new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), post: new THREE.CylinderGeometry(0.5, 0.5, 1, 8), flag: new THREE.PlaneGeometry(1, 1), chit: new THREE.PlaneGeometry(2.6, 1.8) };
    V3.geo.ring.rotateX(-Math.PI / 2); V3.geo.band.translate(0, 0.5, 0); V3.geo.post.translate(0, 0.5, 0);
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const cx = c.getContext('2d'); const gr = cx.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 4, 64);
    V3.fade = new THREE.CanvasTexture(c);
    const ck = document.createElement('canvas'); ck.width = 64; ck.height = 16; const kx = ck.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { kx.fillStyle = (i + j) % 2 ? '#f4ead8' : '#1a1214'; kx.fillRect(i * 8, j * 8, 8, 8); }
    V3.check = new THREE.CanvasTexture(ck);
    V3.ok = true;
  }
  function v3Item(i) {
    let it = V3.pool[i];
    if (it) return it;
    const THREE = V3.T;
    const grp = new THREE.Group();
    const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = 8; m.frustumCulled = false; m.userData.noShadow = true; grp.add(m); return m; };
    const rmat = new THREE.MeshBasicMaterial({ color: '#ff5fb0', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const bmat = new THREE.MeshBasicMaterial({ color: '#ff5fb0', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, map: V3.fade, blending: THREE.AdditiveBlending, toneMapped: false });
    const pmat = new THREE.MeshBasicMaterial({ color: '#f4ead8', toneMapped: false });
    const fmat = new THREE.MeshBasicMaterial({ map: V3.check, side: THREE.DoubleSide, toneMapped: false });
    const cmat = new THREE.MeshBasicMaterial({ color: '#fff8e6', side: THREE.DoubleSide, toneMapped: false });
    it = { grp, ring: mk(V3.geo.ring, rmat), ring2: mk(V3.geo.ring, rmat.clone()), band: mk(V3.geo.band, bmat), beacon: mk(V3.geo.band, bmat.clone()), p1: mk(V3.geo.post, pmat), p2: mk(V3.geo.post, pmat), flag: mk(V3.geo.flag, fmat), chit: mk(V3.geo.chit, cmat) };
    V3.grp.add(grp);
    V3.pool[i] = it;
    return it;
  }
  function v3Update(dt, H) {
    if (!V3.ok) return;
    const p = N.player, list = marksList().filter((m) => m.state !== 'done' && p && Math.hypot(m.x - p.x, m.y - p.y) < 1400).slice(0, 12);
    const t = H.time || 0, VS = H.VS || 1.5;
    const hAt = (x, y) => { try { return (H.heightAt ? H.heightAt(x, y) : 0) || 0; } catch (e) { return 0; } };
    for (let i = 0; i < Math.max(list.length, V3.pool.length); i++) {
      const m = list[i];
      if (!m) { if (V3.pool[i]) V3.pool[i].grp.visible = false; continue; }
      const it = v3Item(i), next = m.state === 'next';
      it.grp.visible = true;
      const y0 = hAt(m.x, m.y);
      it.grp.position.set(m.x, y0, m.y);
      it.ring.material.color.set(m.color); it.ring2.material.color.set(m.color); it.band.material.color.set(m.color);
      const r = m.r;
      it.ring.scale.set(r, 1, r); it.ring.position.y = 0.35; it.ring.material.opacity = next ? 0.95 : 0.4;
      it.ring2.visible = next; it.ring2.scale.set(r * (0.55 + 0.4 * ((t * 0.8) % 1)), 1, r * (0.55 + 0.4 * ((t * 0.8) % 1))); it.ring2.position.y = 0.3; it.ring2.material.opacity = 0.5 * (1 - ((t * 0.8) % 1));
      it.band.visible = next || m.kind === 'finish'; it.band.scale.set(r * 0.98, (next ? 9 : 5) * VS, r * 0.98); it.band.material.opacity = next ? 0.5 + 0.12 * Math.sin(t * 4) : 0.22;
      // the next one also gets a tall thin beacon, readable from far down the road
      it.beacon.visible = next; it.beacon.material.color.set(m.color); it.beacon.scale.set(1.6, 90 * VS, 1.6); it.beacon.material.opacity = 0.55;
      const fin2 = m.kind === 'finish';
      it.p1.visible = it.p2.visible = it.flag.visible = fin2;
      if (fin2) {
        const a = m.angle || 0, nx = -Math.sin(a), ny = Math.cos(a), hh = 12 * VS;
        it.p1.position.set(nx * r, 0, ny * r); it.p2.position.set(-nx * r, 0, -ny * r);
        it.p1.scale.set(1, hh, 1); it.p2.scale.set(1, hh, 1);
        it.flag.position.set(0, hh - 2.2, 0); it.flag.scale.set(r * 2, 4.4, 1); it.flag.rotation.set(0, -a + Math.PI / 2, 0);
      }
      it.chit.visible = m.kind === 'chit' && next;
      if (it.chit.visible) { it.chit.position.set(0, 5 + Math.sin(t * 2.4) * 0.8, 0); it.chit.rotation.set(0, t * 1.4, Math.sin(t * 1.7) * 0.2); }
    }
  }
  function registerV3() {
    if (!N.view3d || !N.view3d.registerLayer) return;
    N.view3d.registerLayer('party', {
      order: 61,
      init(THREE, H) { try { v3Init(THREE, H); } catch (e) { N.err('party.v3init', e); } },
      update(dt, H) { try { v3Update(dt, H); } catch (e) { N.err('party.v3', e); } },
      dispose() { V3.ok = false; V3.pool = []; V3.grp = null; },
    });
  }
  registerV3();
  N.on('boot', registerV3);

  /* ================================================================ UI (DOM in #ui; style.css "=== party ===") */
  const D = {};
  function uiRoot() { return document.getElementById('ui') || document.body; }
  function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  function stopper(e) { for (const ev of ['pointerdown', 'touchstart', 'mousedown']) e.addEventListener(ev, (x) => x.stopPropagation(), { passive: true }); }
  // one generic card at a time (the start card, the picker, "play solo instead?")
  function showCard(o) {
    closeCard();
    const e = el('div', 'pt-card interactive', uiRoot());
    e.setAttribute('role', 'dialog');
    e.innerHTML = '<div class="pt-card-t">' + esc(o.title || '') + '</div>' + (o.line ? '<p class="pt-card-l">' + esc(o.line) + '</p>' : '') + (o.html || '') +
      '<div class="pt-card-b">' + (o.buttons || []).map((b, i) => '<button type="button" class="sign-btn small' + (b.alt ? ' alt' : '') + '" data-i="' + i + '"' + (b.dis ? ' disabled' : '') + '>' + (b.key ? '<kbd>' + esc(b.key) + '</kbd> ' : '') + esc(b.label) + '</button>').join('') + '</div>';
    stopper(e);
    e.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]'); const r = ev.target.closest('[data-pick]');
      if (r && o.onPick) { closeCard(); o.onPick(r.dataset.pick); return; }
      if (!b || b.disabled) return;
      const B = o.buttons[+b.dataset.i]; closeCard(); try { B.fn && B.fn(); } catch (er) { N.err('party.card', er); }
    });
    D.card = { el: e, o, t: Date.now() };
    if (o.ms) D.card.timer = setTimeout(() => { if (D.card && D.card.el === e) closeCard(); }, o.ms);
    return e;
  }
  function closeCard() { if (D.card) { clearTimeout(D.card.timer); D.card.el.remove(); D.card = null; } }
  function cardKey(k) {
    if (!D.card) return false;
    const o = D.card.o;
    const B = (o.buttons || []).find((b) => b.key && b.key.toUpperCase() === k.toUpperCase() && !b.dis);
    if (B) { closeCard(); try { B.fn && B.fn(); } catch (er) { N.err('party.card', er); } return true; }
    if (o.onPick && /^[1-9]$/.test(k)) { const row = D.card.el.querySelectorAll('[data-pick]')[+k - 1]; if (row) { closeCard(); o.onPick(row.dataset.pick); return true; } }
    return false;
  }
  /** the start card at a place ("E Start Tank Bund sprint"): challenge the room / play with the AI friends */
  async function openStart(id, from) {
    const s = REG.get(id);
    if (!s || ST.sess) return;
    const friends = inRoom() ? others().length : 0;
    const go = async (mode) => {
      let o = defaultOpts(s, N.player.x, N.player.y);
      if (typeof s.setup === 'function') { try { o = await s.setup(o, { mode }); } catch (e) { N.err('party.setup:' + id, e); o = null; } if (!o) return; }
      if (mode === 'party') challenge(id, o); else solo(id, o);
    };
    const buttons = [];
    if (friends) buttons.push({ label: 'Challenge the room (' + friends + ')', key: '1', fn: () => go('party') });
    if (s.solo) buttons.push({ label: friends ? 'Play with AI friends' : 'Play with Immu & gang', key: friends ? '2' : '1', fn: () => go('solo') });
    if (!buttons.length) { toast('Needs friends in an online room. (Pause → Online)'); return; }
    buttons.push({ label: 'Not now', key: 'N', alt: true, fn: () => {} });
    const pl = s.players, lo = friends ? minIn(s) : pl.min, hi = friends ? Math.min(pl.max, roomMax()) : pl.max;
    showCard({ title: s.icon + ' ' + s.name, line: describe(s, defaultOpts(s, N.player.x, N.player.y)) + (hi > 1 ? ' · ' + (lo >= hi ? hi : lo + '-' + hi) + ' players' : ''), buttons });
    void from;
  }
  /** the "Challenge friends" picker (🏁 in the quick-chat strip, or N.party.openPicker()) */
  function openPicker(o) {
    o = o || {};
    if (ST.sess) { toast('Already playing ' + ST.sess.spec.name + '.'); return false; }
    if (N.state.mode === 'paused') { try { if (N.online && N.online.close) N.online.close(); N.game.resume(); } catch (e) { /* ignore */ } }
    const list = available();
    const friends = inRoom() ? others().length : 0;
    const rows = list.map((a, i) => '<button type="button" class="pt-pick" data-pick="' + esc(a.id) + '"><b>' + (i < 9 ? '<kbd>' + (i + 1) + '</kbd> ' : '') + esc(a.icon + ' ' + a.name) + '</b><small>' + esc(a.line) + (a.here ? '' : ' · ' + Math.round(a.d * 0.0016 * 10) / 10 + ' km away') + '</small></button>').join('');
    showCard({ title: friends ? '🏁 Challenge friends' : '🏁 Play with the gang', line: friends ? 'Pick a game. Everybody in the room gets an invite.' : 'No friends in a room: Immu, Ayesha, Pappu and Bunty-anna will play.', html: '<div class="pt-list scroll">' + rows + '</div>', buttons: [{ label: 'Close', key: 'N', alt: true, fn: () => {} }],
      onPick: (id) => { const s = REG.get(id); if (!s) return; const a = list.find((q) => q.id === id); if (a && !a.here && s.where) { travelHint(s); return; } openStart(id, 'picker'); } });
    return true;
  }
  /** quick(id, {from}): one tap from the room HUD (src/online.js: the "Nearby" card, the arrival toast, the panel's
   *  Nearby list) -> the activity's setup() if it has one, then challenge() (alone in the room / offline: solo). No start
   *  card: the tap was the choice. Resolves to challenge()'s {ok, why?, mode, sid}. */
  async function quick(id, o) {
    const s = REG.get(id);
    if (!s) return { ok: false, why: 'unknown' };
    if (ST.sess) { toast('Already playing ' + ST.sess.spec.name + '.'); return { ok: false, why: 'busy' }; }
    if (N.state.mode === 'paused') { try { if (N.online && N.online.close) N.online.close(); if (N.menus && N.menus.resume) N.menus.resume(); else N.game.resume(); } catch (e) { /* ignore */ } }
    const why = busyWhy(); if (why) { toast(why); return { ok: false, why }; }
    if (!whenOk(s)) { toast(s.name + ': not now.'); return { ok: false, why: 'Not now.' }; }
    closeCard();
    const e = N.player && (N.player.vehicle || N.player);
    let opts = defaultOpts(s, e && e.x, e && e.y);
    if (typeof s.setup === 'function') {
      try { opts = await s.setup(opts, { mode: inRoom() && others().length ? 'party' : 'solo' }); } catch (er) { N.err('party.setup:' + id, er); opts = null; }
      if (!opts) return { ok: false, why: 'cancelled' };
    }
    const r = challenge(id, opts);
    N.emit('party:quick', { id, from: (o && o.from) || null, ok: !!r.ok, mode: r.mode || null });
    return r;
  }
  function travelHint(s) {
    const sp = spotsOf(s)[0];
    if (!sp) return;
    try { if (N.menus && N.menus.waypoint) N.menus.waypoint(sp.x, sp.y); } catch (e) { /* ignore */ }
    const wp = s.where && N.places && N.places[s.where];
    if (inRoom() && N.online.dropPin && wp && Math.hypot(wp.x - sp.x, wp.y - sp.y) < 200) { try { N.online.dropPin(s.where); } catch (e) { /* ignore */ } }
    toast(s.name + ' starts at ' + sp.name + '. Waypoint set: meet there!', 3600);
  }
  // the Online panel's "Challenge friends" section ([party hook] in online.js renderPanel)
  function panelHtml() {
    if (!inRoom()) return '';
    const list = available();
    let h = '<h4>Challenge friends</h4>';
    if (ST.sess) return h + '<p class="ol-note">Playing ' + esc(ST.sess.spec.name) + ' now.</p>';
    h += '<div class="ol-row ol-wrap">' + list.slice(0, 12).map((a) => '<button type="button" class="mn-btn small alt ol-place" data-nav data-act="party" data-party="' + esc(a.id) + '" title="' + esc(a.line) + '">' + esc(a.icon + ' ' + a.name) + (a.here ? '' : ' ↗') + '</button>').join('') + '</div>';
    return h;
  }
  function panelAct(id) {
    const s = REG.get(id);
    if (!s) return;
    try { if (N.online && N.online.close) N.online.close(); if (N.state.mode === 'paused' && N.game && N.game.resume) N.game.resume(); } catch (e) { /* ignore */ }
    const a = available().find((q) => q.id === id);
    if (a && !a.here && s.where) { travelHint(s); return; }
    setTimeout(() => openStart(id, 'panel'), 50);
  }
  // invite card (guests): "Ravi challenges you to Tank Bund sprint — Accept / Skip"
  function renderInvite() {
    const inv = ST.invite;
    if (!inv) { closeInvite(); return; }
    if (!D.inv) {
      D.inv = el('div', 'pt-invite interactive', uiRoot());
      D.inv.setAttribute('role', 'dialog');
      stopper(D.inv);
      D.inv.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-a]'); if (!b) return; if (b.dataset.a === 'acc') acceptInvite(); else declineInvite(); });
    }
    const s = inv.spec;
    D.inv.innerHTML = '<div class="pt-inv-t"><span class="pt-inv-i">' + esc(s.icon) + '</span><b>' + esc(inv.nick) + '</b> challenges you to <b>' + esc(s.name) + '</b></div>' +
      '<p class="pt-inv-l">' + esc(describe(s, inv.opts)) + '</p>' +
      '<div class="pt-card-b"><button type="button" class="sign-btn small" data-a="acc"><kbd>Y</kbd> Accept</button><button type="button" class="sign-btn small alt" data-a="skip"><kbd>N</kbd> Skip</button></div><div class="pt-bar"><b></b></div>';
    D.inv.classList.add('show');
  }
  function closeInvite() { if (D.inv) { D.inv.remove(); D.inv = null; } }
  // lobby card: who has accepted; the host can start early or call it off
  function renderLobby() {
    const S = ST.sess;
    if (!S || S.mode !== 'party' || S.phase !== 'lobby') { closeLobby(); return; }
    if (!D.lob) {
      D.lob = el('div', 'pt-lobby interactive', uiRoot());
      stopper(D.lob);
      D.lob.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-a]'); if (!b || b.disabled) return; const S2 = ST.sess; if (!S2) return; if (b.dataset.a === 'go' && isHost(S2) && S2.acc.size >= 2) goHost(S2); else if (b.dataset.a === 'x') cancel(isHost(S2) ? 'Called off.' : 'You stepped out.'); });
    }
    const host = isHost(S);
    const names = roomPlayers().map((p) => { const a = S.acc.has(p.key), sk = S.skip.has(p.key); return '<li class="' + (a ? 'ok' : sk ? 'no' : '') + '">' + (a ? '✓ ' : sk ? '✕ ' : '… ') + esc(p.me ? 'You' : p.nick) + '</li>'; }).join('');
    D.lob.innerHTML = '<div class="pt-card-t">' + esc(S.spec.icon + ' ' + S.spec.name) + '</div><p class="pt-card-l">' + (host ? 'Waiting for friends to accept…' : 'Accepted! Waiting for ' + esc(S.hostNick) + ' to start…') + '</p><ul class="pt-who">' + names + '</ul>' +
      '<div class="pt-card-b">' + (host ? '<button type="button" class="sign-btn small" data-a="go"' + (S.acc.size >= 2 ? '' : ' disabled') + '><kbd>G</kbd> Start now</button>' : '') + '<button type="button" class="sign-btn small alt" data-a="x"><kbd>X</kbd> ' + (host ? 'Call off' : 'Leave') + '</button></div><div class="pt-bar"><b></b></div>';
  }
  function closeLobby() { if (D.lob) { D.lob.remove(); D.lob = null; } }
  function barTick() {
    const now = sharedNow();
    if (D.inv && ST.invite) { const b = D.inv.querySelector('.pt-bar b'); if (b) b.style.width = clamp((ST.invite.exp - now) / TUNE.lobbyMs, 0, 1) * 100 + '%'; if (ST.invite.exp && now > ST.invite.exp + 3000) { closeInvite(); ST.invite = null; } }
    const S = ST.sess;
    if (D.lob && S) { const b = D.lob.querySelector('.pt-bar b'); if (b) b.style.width = clamp((S.exp - now) / TUNE.lobbyMs, 0, 1) * 100 + '%'; if (!isHost(S) && now > S.exp + 8000) { teardown(S, 'cancel'); toast('The challenge did not start.'); } }
  }
  // countdown: big "3 2 1 GO!" on the shared clock
  function showCountdown(S) {
    if (!D.cd) { D.cd = el('div', 'pt-count', uiRoot()); D.cd.setAttribute('aria-live', 'assertive'); }
    D.cd.dataset.sid = S.sid; D.cd.textContent = ''; D.cd.className = 'pt-count show';
    D.cdLast = null;
  }
  function hideCountdown() { if (D.cd) { D.cd.className = 'pt-count'; D.cd.textContent = ''; } }
  function countTick(S) {
    if (!S.ctx || !D.cd) return;
    const left = S.startAt - S.ctx.now();
    let txt = '', cls = 'pt-count show';
    if (left > TUNE.countMs) { txt = S.spec.icon + ' ' + S.spec.name; cls += ' ready'; }
    else if (left > 0) { txt = String(Math.ceil(left / 1000)); cls += ' num'; }
    else if (left > -TUNE.goShow) { txt = 'GO!'; cls += ' go'; }
    else { if (D.cdLast !== '') { hideCountdown(); D.cdLast = ''; } return; }
    if (txt !== D.cdLast) {
      D.cdLast = txt; D.cd.textContent = txt; D.cd.className = cls;
      if (/^[0-9]$/.test(txt)) sfx('clock_tick'); else if (txt === 'GO!') sfx('whistle');
    }
  }
  // the strip: status line + live standings
  function renderStrip(S) {
    if (!S || S.phase === 'lobby' || S.phase === 'done') { hideStrip(); return; }
    if (!D.strip) { D.strip = el('div', 'pt-strip', uiRoot()); }
    const rows = S.boardRows;
    D.strip.innerHTML = '<div class="pt-strip-t">' + esc(S.spec.icon + ' ' + S.spec.name) + (S.mode === 'party' ? '' : ' · with the gang') + '</div>' + (S.statusText ? '<div class="pt-strip-s">' + esc(S.statusText) + '</div>' : '') +
      (rows ? '<ol class="pt-board">' + rows.map((r) => '<li class="' + (r.me ? 'me' : '') + (r.out ? ' out' : '') + '"><i style="background:' + esc(r.color || '#5fd0ff') + '"></i><b>' + esc(r.name) + '</b>' + (r.sub ? '<em>' + esc(r.sub) + '</em>' : '') + '</li>').join('') + '</ol>' : '');
    D.strip.classList.add('show');
  }
  function hideStrip() { if (D.strip) { D.strip.remove(); D.strip = null; } }
  // results card
  function showResults(S, standings, summary) {
    closeResults();
    const e = el('div', 'pt-results interactive', uiRoot());
    e.setAttribute('role', 'dialog');
    stopper(e);
    const medal = (r) => (r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank ? ordinal(r.rank) : '—');
    const meU = S.mode === 'solo' ? 'me' : myUid();
    const rows = standings.map((r) => '<tr class="' + (r.uid === meU ? 'me' : '') + '"><td class="pl">' + medal(r) + '</td><td class="nm">' + esc(r.uid === meU ? 'You' : r.nick) + '</td><td class="tm">' + (r.timeMs != null && S.spec.kind !== 'score' ? fmtMs(r.timeMs) : '') + '</td><td class="sc">' + (r.score != null ? esc(String(r.score)) : '') + '</td><td class="nt">' + esc(r.left ? 'left' : r.dnf ? (r.note || 'did not finish') : (r.note || '')) + '</td></tr>').join('');
    const extra = summary && summary.line ? '<p class="pt-card-l">' + esc(summary.line) + '</p>' : '';
    const again = S.mode === 'solo' || (inRoom() && others().length);
    e.innerHTML = '<div class="pt-card-t">🏁 ' + esc(S.spec.name) + ' — results</div>' + extra + '<table class="pt-table">' + rows + '</table>' +
      '<p class="pt-card-l pt-cheer">' + esc(cheer(S, standings, meU)) + '</p>' +
      '<div class="pt-card-b">' + (again ? '<button type="button" class="sign-btn small" data-a="again"><kbd>G</kbd> Again!</button>' : '') + '<button type="button" class="sign-btn small alt" data-a="close"><kbd>X</kbd> Close</button></div>';
    e.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-a]'); if (!b) return; if (b.dataset.a === 'again') rematch(); closeResults(); });
    D.res = { el: e, id: S.id, opts: S.opts, mode: S.mode, t: Date.now(), timer: setTimeout(() => closeResults(), TUNE.resultsMs) };
  }
  function cheer(S, st, meU) {
    const mine = st.find((r) => r.uid === meU), w = st.find((r) => r.rank === 1);
    if (!w) return 'Nobody finished. Fun only!';
    if (mine && mine.rank === 1) return 'Shabash! Well played, everyone.';
    if (S.mode === 'solo' && w.isAI !== false) { const f = FRIEND.get(String(w.uid).replace(/^ai:/, '')); if (f) return f.name + ': "' + f.win[0] + '" Everybody: "Rematch!"'; }
    return 'Well played! ' + w.nick + ' takes this one.';
  }
  function closeResults() { if (D.res) { clearTimeout(D.res.timer); D.res.el.remove(); D.res = null; } }
  function rematch() {
    const r = D.res;
    if (!r) return;
    if (r.mode === 'solo') solo(r.id, r.opts); else challenge(r.id, r.opts);
  }
  // keys for the cards: letters / digits the game does not use (Y N G X 1-9), so its own keys keep working
  window.addEventListener('keydown', (ev) => {
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const tg = ev.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    const m = N.state.mode;
    if (m !== 'play' && m !== 'dialogue') return;
    const k = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
    let used = false;
    if (D.card) used = cardKey(k);
    else if (D.inv && ST.invite) { if (k === 'Y') used = acceptInvite(); else if (k === 'N') used = declineInvite(); }
    else if (D.lob && ST.sess) { const S = ST.sess; if (k === 'G' && isHost(S) && S.acc.size >= 2) { goHost(S); used = true; } else if (k === 'X') { cancel(isHost(S) ? 'Called off.' : 'You stepped out.'); used = true; } }
    else if (D.res) { if (k === 'G') { rematch(); closeResults(); used = true; } else if (k === 'X') { closeResults(); used = true; } }
    if (used) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  /* ================================================================ system */
  N.addSystem({
    id: 'party', order: 57, runIn: ['*'],
    init() { wireNet(); ensurePappu(); registerV3(); },
    update(dt) {
      const mode = N.state.mode;
      if (mode === 'title' || mode === 'boot') return;
      wireNet();
      barTick();
      const S = ST.sess;
      if (S) {
        if (S.phase === 'lobby') hostTick(S);
        else if (S.phase === 'countdown' || S.phase === 'running') {
          countTick(S);
          const now = S.ctx.now();
          if (S.phase === 'countdown' && now >= S.startAt) { S.phase = 'running'; unlock(S); N.emit('party:go', { id: S.id, sid: S.sid }); renderStrip(S); }
          if (S.locked && now >= S.startAt) unlock(S);
          if (mode === 'play' || mode === 'dialogue' || mode === 'minigame' || mode === 'cutscene') {
            if (S.handle && typeof S.handle.update === 'function') { try { S.handle.update(dt); } catch (e) { N.err('party.update:' + S.id, e); } }
          }
          if (ST.sess === S && S.phase !== 'done') {
            const host = currentHost(S) === (S.mode === 'solo' ? 'me' : myUid());
            if (host) {
              checkDone(S);
              if (S.phase !== 'done' && now > S.startAt + (S.spec.timeLimit || TUNE.timeLimit) * 1000) finalize(S, { line: 'Time up!' });
            }
          }
        }
      }
      // the "E Start ..." prompt at an activity's place (per-step offer: works on a cycle too)
      if (!ST.sess && mode === 'play' && !(N.missions && N.missions.active) && N.player && !D.card) {
        const e = N.player.vehicle || N.player;
        let best = null, bd = Infinity, inner = false;
        for (const s of REG.values()) {
          if (!s.where && !(s.also && s.also.length) && !(s.spots && s.spots.length)) continue;
          for (const sp of spotsOf(s)) { const d = Math.hypot(sp.x - e.x, sp.y - e.y); if (d <= sp.r && d < bd && whenOk(s)) { bd = d; best = s; inner = d <= Math.min(TUNE.innerR, sp.r * 0.5); } }
        }
        // standing right on the start spot beats passing traffic ("Borrow cycle", "Board bus"); elsewhere in the spot the
        // side-activity band (-1) lets story and vehicles win
        if (best && (best.solo || (inRoom() && others().length))) N.interact.offer({ label: best.label || ('Start ' + best.name), priority: inner ? TUNE.innerPriority : TUNE.promptPriority, dist: bd, use: () => openStart(best.id, 'prompt') });
      }
      if (ST.invite && mode === 'play') N.interact.offer({ label: 'Accept challenge', priority: 8, dist: 0, use: () => acceptInvite() });
    },
    draw() { const m = N.state.mode; if (m !== 'title' && m !== 'boot') draw2D(); },
    reset() { const S = ST.sess; if (S) teardown(S, 'quit'); closeInvite(); ST.invite = null; closeCard(); closeResults(); },
  });

  /* ================================================================ API */
  N.party = {
    register, challenge, solo, available,
    get active() { const S = ST.sess; return S && S.phase !== 'done' ? { id: S.id, sid: S.sid, name: S.spec.name, mode: S.mode, phase: S.phase, isHost: currentHost(S) === (S.mode === 'solo' ? 'me' : myUid()), players: S.players.map((p) => Object.assign({}, p)), ctx: S.ctx } : null; },
    get invite() { const i = ST.invite; return i ? { sid: i.sid, id: i.id, from: i.nick, opts: i.opts } : null; },
    get last() { return ST.lastFin; },
    defs: REG, get: (id) => REG.get(id) || null,
    accept: acceptInvite, skip: declineInvite, cancel, leave, start: (id) => openStart(id, 'api'), quick,
    /** a session, an invite or one of the cards is up (the room HUD's nearby card / arrival toast step aside) */
    get uiBusy() { return !!(ST.sess || ST.invite || D.card || D.inv || D.lob || D.res); },
    openPicker, closeCards() { closeCard(); closeResults(); }, panelHtml, panelAct,
    stats: ST.stats, FRIENDS, TUNE, fmtMs, cycleFor,
    _debug: {
      session: () => ST.sess,
      clock: () => ({ offset: CLK.offset, rtt: CLK.rtt, host: CLK.host, n: CLK.n }),
      sharedNow,
      marks: () => marksList().map((m) => ({ id: m.id, x: m.x, y: m.y, r: m.r, kind: m.kind, state: m.state })),
      cards: () => ({ card: !!D.card, invite: !!D.inv, lobby: !!D.lob, results: !!D.res, countdown: !!(D.cd && D.cd.classList.contains('show')), strip: !!D.strip, count: D.cd ? D.cd.textContent : '' }),
      finalize: () => { const S = ST.sess; if (S) finalize(S, null); },
      v3: () => ({ ok: V3.ok, visible: V3.pool.filter((it) => it.grp.visible).length, pool: V3.pool.length }),
      resetStats() { ST.stats.plays = {}; ST.stats.wins = {}; ST.stats.firsts = {}; ST.stats.best = {}; saveStats(); },
    },
  };
})();
