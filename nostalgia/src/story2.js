/* NOSTALGIA — story2.js  (owner: story agent, part 2; ARCHITECTURE §19, story bible §4 M7-M12, §7, §9)
 * Side A from the midpoint to the end of the tape, and Side B:
 *   M7  the_clap         Sat 7 Jun   Golconda: the bazaar list, the bus west, the clap under the Fateh Darwaza
 *                                     dome, the climb to Bala Hissar before sunset, shaking off Professor Pasha
 *   M8  drums_for_amma   Sun 20 Jul  Lashkar Bonalu: neem and turmeric, the escort with Amma's bonam (three
 *                                     drum phrases), the free buttermilk stall, the hot Paradise parcel
 *   M9  opening_day      Fri 25 Jul  Abba's tiffin to Cyber Towers, the tomato race against Bunty, Prasads
 *                                     opens (N.flags.prasads_open), the NTR Gardens mini train
 *   M10 agle_baras       Tue 9 Sep   the peacock lorry, the immersion walk, the seventh statue, the cranes,
 *                                     the boat to the Buddha; then the INTERLUDE (tickets arrive, ■ PAUSED 812)
 *   M11 last_bell        Fri 21 Nov  slam book, email ids, the passport photo, tunnel supplies, Naubat Pahad
 *   M12 chand_raat       Tue 25 Nov  THE FINALE AT CHARMINAR: Ask the city, the first gallery, the chase with
 *                                     both mothers (respect rules round the masjids), the biscuit storeroom,
 *                                     the doorway clap, the walk back, the tape dub, the tin, the self-timer
 *   Ending (bible §9.1, Thu 27 Nov 2003, Charminar), Epilogue "Side B" (§9.2, Sat 17 Jan 2026, playable,
 *   the 1-4-0-1 lock dial), the definitions card (§9.3), the credits (§9.4 + amendments A1 map line and
 *   the three.js MIT line), post-credits ◀◀ REWIND (§9.5: "Play any season of 2003").
 *   Side activities SA5 twelve_oclock, SA6 bunty_races (R1-R4), SA7 new_class_old_books, SA8
 *   christmas_stars, lb_final (places_registry round 12: the LB Stadium match with Immu and Ayesha in
 *   Chinnu XI), and the small activities audit (bible §7 table; fills gaps only).
 *
 * Contract notes
 *  - Every place is referenced by id (places, landmark ids such as tank_bund_statue_7, road ids such as
 *    golconda_steps / birla_mandir_steps); positions are read at run time, never hard-coded.
 *  - Missions use N.missions (requires: the bible predecessor ids from story.js: ammammas_thursday for M7).
 *    Non-mission sequences (interlude, ending, epilogue, rewind) run on a small scene runner here with the
 *    same verbs (goto / wait / until / say / talk / choice / cutscene / minigame); they refuse saves while
 *    they run (N.flags.no_save) and resume from the start after a load (bible §12.10: not interruptible).
 *  - Every other module may be a stub: wanted.js (the scripted Chand Raat chase is done here with the
 *    meter policy 'frozen' so the real Chappal Meter adds no pursuers of its own), traffic, the 3D view,
 *    cricket_match ('match' falls back to the gully 'cricket' minigame), collectibles, shops.
 *
 * API  N.story2 = {
 *   TUNE                     numbers (bible / systems), tests may scale them (TUNE.mg = params merged into
 *                            every story minigame, e.g. {autoplay: 'win', skipHowto: true})
 *   MISSIONS                 ids registered here; SIDE (side activity ids)
 *   scene                    the running scene id | null   runScene(id, fn) / abortScene()
 *   interlude() / ending() / epilogue() / rewind()   start those sequences (debug / replay)
 *   lockDial({tries}) -> Promise<{code, tries, auto}>   the brass 1-4-0-1 dial (systems §8.20)
 *   cassettesFound() -> {dedications: [ids], agent: [ids]}   sideBTail() -> [{s, t}] (bible §9.2 tail)
 *   kitesForEnding() -> n    seasons ['january', 'may', 'september', 'december'] / playSeason(name)
 *   replay(id)               N.story.replay fallback (Side A track list) when story.js has none
 *   state()                  debug snapshot }
 * Events: 'story2:scene' {id, on}, 'story2:ending' {phase}, 'story2:epilogue' {phase}, 'story2:lock' {code, ok},
 *   'story2:season' {name}. Flags written: clue_tunnel, riddle_3/4, lock_3/4, interlude_done, ayesha_moving,
 *   prasads_open, boats_open, tin_locked, ending_done, epilogue_done, postgame, season_pick, star_lantern,
 *   immu_email, sa6_race, bunty_pillion, lb_match_played, s2_email.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================== tunables (bible + systems) */
  const TUNE = {
    climbSecs: 45,            // Immu's dot climbs to Bala Hissar (M7 step 4)
    sunsetSecs: 90,           // W2 climb before sunset (no fail)
    pashaShake: 300,          // lose Pasha: 300 u
    escortR: 120, lorryR: 150, lorryAbandon: 60, escortWarn: 5,
    escortSpeed: 1,           // multiplier for escorted walkers / the lorry (tests raise it)
    walkSpeed: 40,            // escorted walkers (Amma, Ammamma, Immu)
    lorrySpeed: 34,           // the peacock lorry at walking pace
    cargoFail: 40, cargoBump: 8, cargoCrash: 15, cargoBumpSpeed: 40, cargoCrashSpeed: 60,
    parcelSecs: 120, tiffinBy: 13 * 60, depotBy: 19 * 60 + 30,
    netSecs: 60,
    chappalEvery: 6, chappalSpeed: 170, chappalRange: 150, chappalHit: 7, chappalLife: 1.4,
    mumSpeed: 72, ammiSpeed: 68, catchR: 12, respectBuffer: 40,
    selfTimer: 10, nannaBack: 60, frameR: 30, grabR: 14,
    meterDrain: 5,            // M12 walk back: one slipper every 5 s
    epilogueRunDrain: 25,     // 2026: running empties energy in 4 s
    raceHandicap: [0.72, 0.78, 0.82, 0.86],
    raceRing: 40,
    galleryFind: 25,          // M12 gallery: seconds before the camera drifts to the raincoat
    statueR: 34,              // M10: passing a plinth counts it
    mg: null,                 // test hook: merged into every story minigame's params
  };

  /* ================================================================== small helpers */
  const has = (o, k) => !!(o && typeof o[k] === 'function');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = U.clamp;
  const nowT = () => (N.time && N.time.now) || 0;
  const mode = () => (N.state && N.state.mode) || 'boot';
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const emph = (s) => esc(s).replace(/\*([^*]+)\*/g, '<i>$1</i>');
  function subst(s) {
    s = String(s == null ? '' : s);
    try {
      if (N.dialogue && typeof N.dialogue.subst === 'function') return N.dialogue.subst(s);
      if (N.menus && typeof N.menus.subst === 'function') return N.menus.subst(s);
    } catch (e) { /* fall through */ }
    const nick = (N.player && (N.player.nick || N.player.name)) || 'Chinnu';
    const full = (N.player && N.player.fullName) || 'Srikanth';
    return s.replace(/\{nick\}/g, nick).replace(/\{full\}/g, full).replace(/\{FULL\}/g, full.toUpperCase());
  }
  const plain = (s) => subst(s).replace(/\*([^*]+)\*/g, '$1');
  function nick() { return (N.player && (N.player.nick || N.player.name)) || 'Chinnu'; }
  function emailOf() { return (nick().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'chinnu') + '_charminar2'; }
  function toast(t, ms, key) { try { if (N.hud && N.hud.toast) N.hud.toast(plain(t), ms || 2600, key ? { key } : undefined); } catch (e) { N.err('story2.toast', e); } }
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) return N.audio.sfx(name, o || { ui: true }); } catch (e) { /* audio never breaks the story */ } return false; }
  function isDone(id) { try { return !!(N.missions && N.missions.isDone && N.missions.isDone(id)); } catch (e) { return false; } }
  const F = () => N.flags || (N.flags = {});
  function placeOf(target) {
    if (target == null) return null;
    if (typeof target === 'object') return typeof target.x === 'number' ? target : null;
    const p = N.places && N.places[target];
    if (p) return p;
    try { if (N.missions && N.missions.posOf) { const q = N.missions.posOf(target); if (q) return q; } } catch (e) { /* ignore */ }
    const lm = (N.WORLD_DATA && N.WORLD_DATA.landmarks || []).find((l) => l.id === target);
    return lm ? { x: lm.x, y: lm.y + (lm.d || 0) / 2 + 12, r: 24, landmark: lm } : null;
  }
  function landmark(id) { return (N.WORLD_DATA && N.WORLD_DATA.landmarks || []).find((l) => l.id === id) || null; }
  function roadPts(id) {
    const r = (N.WORLD_DATA && N.WORLD_DATA.roads || []).find((q) => q.id === id);
    return r && Array.isArray(r.pts) ? r.pts.map((p) => ({ x: p[0], y: p[1] })) : null;
  }
  function free(x, y, md, cells) {
    try { const f = N.world.findFree(x, y, md || 'walk', cells || 24); if (f && isFinite(f.x)) return { x: f.x, y: f.y }; } catch (e) { /* ignore */ }
    return { x, y };
  }
  /** A walkable point near a place, offset (dx, dy) in world units. */
  function near(id, dx, dy, md) {
    const p = placeOf(id);
    if (!p) return null;
    return free(p.x + (dx || 0), p.y + (dy || 0), md);
  }
  /** A walkable point d units from place a towards place b (no coordinates in the script, only ids). */
  function toward(a, b, d, md) {
    const p = placeOf(a), q = placeOf(b);
    if (!p) return null;
    if (!q) return free(p.x, p.y, md);
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return free(p.x + (q.x - p.x) / L * d, p.y + (q.y - p.y) / L * d, md);
  }
  function respectAt(x, y) { try { return N.respect && N.respect.at ? N.respect.at(x, y) : null; } catch (e) { return null; } }
  function respectNear(x, y, r) { try { return N.respect && N.respect.near ? N.respect.near(x, y, r) : null; } catch (e) { return null; } }
  function seasonsSet(name, on) { try { if (N.seasons && N.seasons.set) N.seasons.set(name, on); } catch (e) { N.err('story2.seasons', e); } }
  /** The first vehicle type that exists (A3: Chinnu drives cycles, the Scooty and the auto only). */
  function vtype(...ids) { const T = (N.vehicles && N.vehicles.TYPES) || {}; for (const id of ids) if (T[id]) return id; return 'cycle'; }
  /** Debug / test aid: where the current step wants the player (set by steps that have no goto marker). */
  const DBG = { target: null };
  function dbgTarget(t) { DBG.target = t || null; }
  function money(paise, why) {
    const p = N.player; if (!p || !paise) return;
    if (paise > 0 && N.shops && has(N.shops, 'earn')) { try { N.shops.earn(paise, why || 'story'); return; } catch (e) { /* fall back */ } }
    if (paise < 0 && N.shops && has(N.shops, 'charge')) { try { const r = N.shops.charge(-paise, { why: why || 'story', companion: 'immu' }); if (r && r.ok !== false) return; } catch (e) { /* fall back */ } }
    p.money = Math.max(0, (p.money | 0) + Math.round(paise));
    N.emit('money', { delta: paise, total: p.money, why: why || 'story' });
  }

  /* ================================================================== mission / scene glue */
  /** A mission retry fast-forwards to its checkpoint: external effects (rides, NPC walks) are skipped. */
  function isFF(api) {
    if (!api || api.scene) return false;
    const r = N.missions && N.missions.active;
    return !!(r && r.m === api && r.ff);
  }
  /** Await an outside promise inside a mission / scene; aborts propagate on the next verb. */
  async function ext(api, p) {
    let v;
    try { v = await p; } catch (e) { if (e && (e.name === 'MissionAbort' || e.name === 'SceneAbort')) throw e; N.err('story2.ext', e); }
    await api.wait(0);
    return v;
  }
  /** Cleanups for the mission / scene that is running now (props, listeners, DOM, NPC states). */
  const missionCleanups = [];
  function onEnd(api, fn) { if (api && api.scene && api._sc) api._sc.cleanups.push(fn); else missionCleanups.push(fn); }
  function runCleanups(list) {
    while (list.length) { const fn = list.pop(); try { fn(); } catch (e) { N.err('story2.cleanup', e); } }
  }
  function music(api, id) {
    try {
      if (api && !api.scene && N.missions && N.missions.active && N.missions.active.m === api) N.missions.active.music = id || null;
      else if (N.audio && N.audio.music) { if (id) N.audio.music.mood(id); else N.audio.music.mood(null); }
    } catch (e) { N.err('story2.music', e); }
  }
  function npc(api, id, target, opts) {
    if (!N.npcs || !has(N.npcs, 'spawn')) return null;
    try {
      const a = N.npcs.spawn(id, target, opts || {});
      if (a && api && has(api, 'spawn')) api.spawn(a);
      return a;
    } catch (e) { N.err('story2.npc:' + id, e); return null; }
  }
  const npcGet = (key) => { try { return N.npcs && N.npcs.get ? N.npcs.get(key) : null; } catch (e) { return null; } };
  function despawn(key) { try { if (N.npcs && N.npcs.despawn) N.npcs.despawn(key); } catch (e) { N.err('story2.despawn', e); } }
  function walk(api, key, target, o) {
    if (!N.npcs || !has(N.npcs, 'walkTo')) return Promise.resolve(false);
    if (isFF(api)) { const a = npcGet(key), q = placeOf(target); if (a && q) { const f = free(q.x, q.y); a.x = f.x; a.y = f.y; } return Promise.resolve(true); }
    try { const p = N.npcs.walkTo(key, target, o || {}); p.catch(() => {}); return p; } catch (e) { N.err('story2.walk', e); return Promise.resolve(false); }
  }
  function follow(key, leader, o) { try { if (N.npcs && N.npcs.follow) N.npcs.follow(key, leader, o || {}); } catch (e) { N.err('story2.follow', e); } }
  function stopNpc(key) { try { if (N.npcs && N.npcs.stop) N.npcs.stop(key); } catch (e) { /* ignore */ } }
  function bark(key, text, o) {
    try {
      if (N.npcs && N.npcs.bark && npcGet(key)) return N.npcs.bark(key, text, o);
      if (N.dialogue && N.dialogue.bark) return N.dialogue.bark(key, text, o);
    } catch (e) { N.err('story2.bark', e); }
    return null;
  }
  function emote(key, k, secs) { try { if (N.npcs && N.npcs.emote) N.npcs.emote(key, k, secs); } catch (e) { /* ignore */ } }
  function variant(id, v) { try { if (N.npcs && N.npcs.setVariant) N.npcs.setVariant(id, v); } catch (e) { /* ignore */ } }
  /** [[speaker, text, mood?], ...] -> m.talk */
  function talk(api, lines) {
    return api.talk(lines.filter(Boolean).map((l) => (Array.isArray(l) ? { s: l[0], t: l[1], mood: l[2] } : l)));
  }
  /** The story minigame call: TUNE.mg (tests) is merged in; a missing 'match' falls back to 'cricket'. */
  async function game(api, id, params) {
    params = Object.assign({}, params || {}, TUNE.mg || {});
    const MG = N.minigames;
    // a free-roam side game the player opened on the spot (minigames.js SIDE) finishes first
    if (MG && has(MG, 'isOpen') && MG.isOpen() && !isFF(api)) await api.until(() => !MG.isOpen());
    if (id === 'match') {
      const ok = MG && (has(MG, 'has') ? MG.has('match') : false);
      if (!ok) {
        const fb = Object.assign({ target: 24, bowler: 'ayesha', intro: params.intro, difficulty: 0.45 }, TUNE.mg || {});
        const r = (await api.minigame('cricket', fb)) || { win: false };
        r.fallback = 'cricket';
        return r;
      }
    }
    return (await api.minigame(id, params)) || { win: false };
  }
  /** Passenger ride (bus / auto / Nanna's Chetak pillion / Bunty's RX100 pillion / the lorry cab): VHS ▶▶ + arrival. */
  async function ride(api, dest, o) {
    o = o || {};
    const q = placeOf(dest);
    if (!q) return false;
    const p = N.player;
    const land = () => {
      const f = o.at ? o.at() : free(q.x + (o.dx || 0), q.y + (o.dy || 0));
      if (p.vehicle && N.vehicles && N.vehicles.exit) { try { N.vehicles.exit(p, true); } catch (e) { /* ignore */ } }
      p.teleport(f.x, f.y);
      if (N.render && N.render.snapCamera) N.render.snapCamera();
      if (o.after) { try { o.after(); } catch (e) { N.err('story2.ride.after', e); } }
    };
    if (isFF(api)) { land(); return true; }
    if (o.mode === 'bus' && N.shops && has(N.shops, 'travelTo') && !o.at) {
      await ext(api, N.shops.travelTo({ id: typeof dest === 'string' ? dest : null, x: q.x, y: q.y, name: q.name || '' }, { mode: 'bus', label: o.label, minutes: o.minutes }));
      if (o.after) { try { o.after(); } catch (e) { N.err('story2.ride.after', e); } }
      return true;
    }
    if (N.shops && has(N.shops, 'ffwd')) {
      const minutes = o.minutes != null ? o.minutes : Math.max(4, Math.round(Math.hypot(q.x - p.x, q.y - p.y) * 1.3 / 128));
      await ext(api, N.shops.ffwd(minutes, { label: o.label, mid: land }));
      return true;
    }
    await ext(api, api.cutscene([{ type: 'fade', to: 'black', ms: 400 }, { type: 'card', title: o.label || '▶▶', ms: 900 }, () => land(), { type: 'fade', to: 'clear', ms: 400 }]));
    if (!api.scene) land(); // cutscenes resolve at once while a mission fast-forwards
    return true;
  }
  /** A non-failing countdown on the HUD timer (bible: most story timers never fail). */
  const softTimers = new Set();
  function softTimer(api, label, secs) {
    const T = { label, left: secs, done: false, stop() { if (!T.done) { T.done = true; softTimers.delete(T); try { N.hud.timer(null); } catch (e) { /* ignore */ } } } };
    softTimers.add(T);
    try { N.hud.timer(label, secs, { countdown: false }); } catch (e) { /* ignore */ }
    onEnd(api, () => T.stop());
    return T;
  }
  function tickSoftTimers(dt) {
    if (mode() !== 'play') return;
    for (const T of softTimers) {
      if (T.done) continue;
      T.left = Math.max(0, T.left - dt);
      const tick = Math.ceil(T.left);
      if (T.lastTick !== tick) { T.lastTick = tick; if (tick <= 10 && tick > 0 && T.beep) sfx('clock_tick'); }
      try { N.hud.timer(T.label, T.left, { countdown: false }); } catch (e) { /* ignore */ }
    }
  }

  /* ================================================================== the scene runner (non-mission sequences) */
  class SceneAbort extends Error { constructor(r) { super(r || 'scene aborted'); this.name = 'SceneAbort'; } }
  const PINK = '#ff5fb0';
  const SC = { cur: null, last: null };
  function makeScene(id) {
    const sc = { id, pending: new Set(), dead: false, ended: false, markers: new Map(), blips: new Set(), spawned: [], cleanups: [], seq: 0, inCutscene: false, inGame: false };
    const guard = () => { if (sc.dead) throw new SceneAbort('ended'); };
    function track(entry) {
      const p = new Promise((res, rej) => { entry.res = res; entry.rej = rej; });
      p.catch(() => {});
      entry.t0 = nowT();
      sc.pending.add(entry);
      return p;
    }
    function settle(entry, v) {
      if (!sc.pending.has(entry)) return;
      sc.pending.delete(entry);
      if (entry.cleanup) { try { entry.cleanup(); } catch (e) { N.err('story2.scene.cleanup', e); } }
      entry.res(v);
    }
    function wrapP(p, after) {
      const entry = { kind: 'ext' };
      const out = track(entry);
      Promise.resolve(p).then((v) => {
        if (sc.dead) return;
        if (after) { try { v = after(v); } catch (e) { N.err('story2.scene.after', e); } }
        settle(entry, v);
      }, (e) => { if (sc.dead || !sc.pending.has(entry)) return; sc.pending.delete(entry); entry.rej(e); });
      return out;
    }
    const api = {
      scene: true, id, _sc: sc,
      get dead() { return sc.dead; },
      objective(t) { guard(); try { N.hud.objective(t ? subst(t) : null); } catch (e) { /* ignore */ } },
      toast(t, ms) { guard(); toast(t, ms); },
      wait(sec) { guard(); if (!(sec > 0)) return Promise.resolve(); const until = nowT() + sec; return track({ check: () => (nowT() >= until ? { v: undefined } : null) }); },
      until(fn, o) {
        guard(); o = o || {};
        const entry = { check: () => {
          let v; try { v = fn(); } catch (e) { N.err('story2.scene.until', e); v = false; }
          if (v) return { v };
          if (o.timeout != null && nowT() - entry.t0 >= o.timeout) return { v: false };
          return null;
        } };
        return track(entry);
      },
      say(s, t, o) { guard(); return wrapP(N.dialogue.say(s, t, o)); },
      talk(lines) { guard(); return wrapP(N.dialogue.play(lines)); },
      choice(s, prompt, opts, o) { guard(); return wrapP(N.dialogue.choice(s, prompt, opts, o)); },
      cutscene(steps, o) {
        guard();
        if (!N.menus || !has(N.menus, 'cutscene')) { for (const s of steps) { const fn = typeof s === 'function' ? s : s && s.type === 'call' ? s.fn : null; if (fn) { try { fn({}); } catch (e) { N.err('story2.cs', e); } } } return Promise.resolve({ skipped: true }); }
        sc.inCutscene = true;
        return wrapP(N.menus.cutscene(steps, o), (v) => { sc.inCutscene = false; return v; });
      },
      minigame(gid, params) {
        guard();
        if (!N.minigames || !has(N.minigames, 'play') || (has(N.minigames, 'has') && !N.minigames.has(gid))) return Promise.resolve({ win: true, skipped: true, missing: true });
        sc.inGame = true;
        return wrapP(N.minigames.play(gid, params || {}), (r) => { sc.inGame = false; return r || { win: false }; });
      },
      goto(target, o) {
        guard(); o = o || {};
        const p0 = placeOf(target);
        if (!p0) { N.err('story2.goto', new Error(sc.id + ': unknown target ' + JSON.stringify(target))); return Promise.resolve(null); }
        if (o.label) api.objective(o.label);
        const r = o.r || p0.r || 20;
        const gid = 's2:' + sc.id + ':g' + ++sc.seq;
        if (o.marker !== false) sc.markers.set(gid, { target, r, color: o.color || PINK });
        if (o.blip !== false) { try { N.hud.blip(gid, typeof target === 'string' || target.kind ? target : { x: p0.x, y: p0.y }, { color: o.color || PINK, icon: 'star', pulse: true, route: o.route !== false }); sc.blips.add(gid); } catch (e) { /* ignore */ } }
        return track({
          check: () => {
            if (mode() !== 'play') return null;
            const q = placeOf(target);
            if (!q) return null;
            if (Math.hypot(N.player.x - q.x, N.player.y - q.y) > r) return null;
            if (o.onFoot && N.player.vehicle) return null;
            return { v: q };
          },
          cleanup: () => { sc.markers.delete(gid); try { N.hud.unblip(gid); } catch (e) { /* ignore */ } sc.blips.delete(gid); },
        });
      },
      blip(target, o) { guard(); const bid = (o && o.id) || 's2:' + sc.id + ':b' + ++sc.seq; try { N.hud.blip(bid, target, Object.assign({ color: PINK, icon: 'star', pulse: true }, o || {})); sc.blips.add(bid); } catch (e) { /* ignore */ } return bid; },
      unblip(bid) { try { N.hud.unblip(bid); } catch (e) { /* ignore */ } sc.blips.delete(bid); },
      marker(target, o) { guard(); const mid = 's2:' + sc.id + ':m' + ++sc.seq; const p0 = placeOf(target); sc.markers.set(mid, { target, r: (o && o.r) || (p0 && p0.r) || 20, color: (o && o.color) || PINK }); return mid; },
      unmarker(mid) { sc.markers.delete(mid); },
      spawn(e) { if (e) sc.spawned.push(e); return e; },
      vehicle(type, x, y, a, o) { const v = N.vehicles && N.vehicles.spawn ? N.vehicles.spawn(type, x, y, a, o || {}) : null; if (v) sc.spawned.push(v); return v; },
      money(p) { guard(); money(p); },
      flag(k, v) { guard(); F()[k] = v === undefined ? true : v; N.emit('flag', { name: k, value: F()[k] }); },
      give(item, o) { guard(); try { N.player.inventory.add(item); N.emit('item:give', { id: item }); } catch (e) { /* ignore */ } if (o && o.name) toast('Got: ' + o.name); },
      checkpoint() { /* scenes restart from the top after a load */ },
      jumpTo(spec, o) { guard(); if (!N.calendar || !has(N.calendar, 'jumpTo')) return Promise.resolve(null); return wrapP(N.calendar.jumpTo(spec, o)); },
      rec(rid, o) { guard(); return N.tape && has(N.tape, 'rec') ? wrapP(N.tape.rec(rid, o)) : Promise.resolve(false); },
      token(tid, o) { guard(); try { if (N.tape && N.tape.addToken) N.tape.addToken(tid, o || {}); } catch (e) { /* ignore */ } },
      meter(policy, level) { guard(); applyMeter(policy, level); onEnd(api, () => applyMeter('normal', null)); },
      fail(reason) { throw new SceneAbort(reason); },
    };
    sc.api = api;
    sc.tick = () => {
      for (const entry of Array.from(sc.pending)) {
        if (!entry.check) continue;
        let r = null;
        try { r = entry.check(); } catch (e) { N.err('story2.scene.check', e); r = null; }
        if (r) settle(entry, r.v);
        if (sc.dead) break;
      }
    };
    return sc;
  }
  function applyMeter(policy, level) {
    const W = N.wanted;
    if (!W) return;
    try {
      if (has(W, 'policy')) W.policy(policy || 'normal', level);
      else if (has(W, 'freeze')) W.freeze(policy === 'frozen', 'mission');
    } catch (e) { N.err('story2.meter', e); }
  }
  function endScene(sc, ok) {
    if (!sc || sc.ended) return;
    sc.ended = true; sc.dead = true;
    const err = new SceneAbort('ended');
    for (const e of Array.from(sc.pending)) { sc.pending.delete(e); try { if (e.cleanup) e.cleanup(); } catch (x) { /* ignore */ } try { e.rej(err); } catch (x) { /* ignore */ } }
    if (!ok) {
      try { if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.cancel(); } catch (e) { /* ignore */ }
      if (sc.inCutscene) { try { N.menus.abortCutscene(); } catch (e) { /* ignore */ } }
      if (sc.inGame) { try { N.minigames.abort('scene'); } catch (e) { /* ignore */ } }
    }
    for (const id of sc.blips) { try { N.hud.unblip(id); } catch (e) { /* ignore */ } }
    sc.blips.clear(); sc.markers.clear();
    runCleanups(sc.cleanups);
    const p = N.player;
    for (const e of sc.spawned) {
      if (!e || e.alive === false || e.keep) continue;
      if (p && e === p.vehicle) continue;
      try { if (has(e, 'despawn')) e.despawn(); else if (e.kind === 'vehicle' && N.vehicles && N.vehicles.remove) N.vehicles.remove(e); else N.entities.remove(e); } catch (x) { N.err('story2.scene.despawn', x); }
    }
    sc.spawned.length = 0;
    try { N.hud.objective(null); N.hud.timer(null); } catch (e) { /* ignore */ }
    if (p) { p.noRun = false; if (sc.locked) p.controlsLocked = false; }
    if (SC.cur === sc) SC.cur = null;
    if (!SC.cur) F().no_save = false;
    N.emit('story2:scene', { id: sc.id, on: false, ok: !!ok });
  }
  /** Run a sequence; resolves true when it finished, false when it was aborted (quit / load / new game). */
  function runScene(id, fn) {
    if (SC.cur) endScene(SC.cur, false);
    const sc = makeScene(id);
    SC.cur = sc; SC.last = id;
    F().no_save = true; // the interlude, the ending and the epilogue cannot be saved half-way (systems §13.9)
    N.emit('story2:scene', { id, on: true });
    return Promise.resolve().then(() => fn(sc.api)).then(() => { endScene(sc, true); return true; }, (e) => {
      if (!(e && (e.name === 'SceneAbort' || e.name === 'MissionAbort'))) N.err('story2.scene:' + id, e);
      endScene(sc, false);
      return false;
    });
  }
  function abortScene() { if (SC.cur) endScene(SC.cur, false); }

  /* ================================================================== world props (drawn on the render queue) */
  const props = new Map();
  /** prop(api, id, {x, y} | {pos()}, draw(ctx, p, t), layer = 'actors', h) — removed when the mission / scene ends. */
  function prop(api, id, spec) {
    props.set(id, spec);
    if (api) onEnd(api, () => props.delete(id));
    return spec;
  }
  function unprop(id) { props.delete(id); }
  function drawProps() {
    const R = N.render;
    if (!R || !props.size) return;
    const t = (N.time && N.time.real) || nowT();
    for (const [id, s] of props) {
      let p = null;
      try { p = s.pos ? s.pos() : s; } catch (e) { p = null; }
      if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
      if (s.layer !== 'screen' && !R.inView(p.x, p.y, s.margin || 80)) continue;
      const layer = s.layer === 'screen' ? 'fx' : s.layer || 'actors';
      R.queue(layer, layer === 'actors' ? p.y + (s.sort || 0) : s.sort || 0, (ctx) => {
        try { s.draw(ctx, p, t); } catch (e) { N.err('story2.prop:' + id, e); props.delete(id); }
      });
    }
  }
  function P3(x, y, h) { return N.render.proj(x, y, h || 0); }
  function drawSceneMarkers() {
    const sc = SC.cur, R = N.render;
    if (!sc || !sc.markers.size || !R) return;
    const t = (N.time && N.time.real) || nowT();
    for (const mk of sc.markers.values()) {
      const p = placeOf(mk.target);
      if (!p || !R.inView(p.x, p.y, mk.r + 60)) continue;
      R.queue('ground', 3, (ctx) => {
        const c = P3(p.x, p.y, 0), Z = c.k, rr = Math.max(14, mk.r) * Z;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
        const [r, g, b] = U.hexToRgb(mk.color);
        const col = (a) => 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
        const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr * 1.3);
        gr.addColorStop(0, col(0.45)); gr.addColorStop(1, col(0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c.x, c.y, rr * 1.3, 0, TAU); ctx.fill();
        ctx.lineWidth = Math.max(1.5, 2 * Z); ctx.strokeStyle = col(0.9);
        ctx.beginPath(); ctx.arc(c.x, c.y, rr * (0.9 + 0.06 * pulse), 0, TAU); ctx.stroke();
        const top = c.y - (30 + Math.sin(t * 2.6) * 3) * Z, s = Math.max(4, 5 * Z);
        ctx.fillStyle = '#120d16';
        ctx.beginPath(); ctx.moveTo(c.x, top - s * 1.5); ctx.lineTo(c.x + s, top); ctx.lineTo(c.x, top + s * 1.5); ctx.lineTo(c.x - s, top); ctx.closePath(); ctx.fill();
        ctx.fillStyle = mk.color;
        ctx.beginPath(); ctx.moveTo(c.x, top - s); ctx.lineTo(c.x + s * 0.65, top); ctx.lineTo(c.x, top + s); ctx.lineTo(c.x - s * 0.65, top); ctx.closePath(); ctx.fill();
      });
    }
  }
  // little painters for the props (world coords projected through N.render.proj)
  const PAINT = {
    stall(ctx, p) { // the unsigned free-buttermilk stall: a trestle table, a steel drum, glasses
      const a = P3(p.x - 9, p.y - 4, 6), b = P3(p.x + 9, p.y + 4, 6), k = a.k;
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.fillStyle = '#c9c9c4'; const d = P3(p.x - 4, p.y, 10); ctx.beginPath(); ctx.ellipse(d.x, d.y, 4 * k, 3 * k, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f4efe2'; for (let i = 0; i < 4; i++) { const g = P3(p.x + 2 + i * 2.2, p.y - 1, 7); ctx.fillRect(g.x, g.y, 1.4 * k, 2 * k); }
    },
    tin(ctx, p) { // Nanna's camera propped on a Karachi Bakery tin on the café step
      const t0 = P3(p.x, p.y, 0), t1 = P3(p.x, p.y, 5), k = t1.k;
      ctx.fillStyle = '#c23a3a'; ctx.fillRect(t1.x - 4 * k, t1.y - 3 * k, 8 * k, 6 * k);
      ctx.fillStyle = '#f2c230'; ctx.fillRect(t1.x - 4 * k, t1.y - 0.6 * k, 8 * k, 1.2 * k);
      const c = P3(p.x, p.y, 8);
      ctx.fillStyle = '#1a1a1e'; ctx.fillRect(c.x - 3 * k, c.y - 2 * k, 6 * k, 4 * k);
      ctx.fillStyle = p.blink ? '#ff4040' : '#5a5a60'; ctx.beginPath(); ctx.arc(c.x + 2 * k, c.y - 1.2 * k, 0.9 * k, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8ab8d8'; ctx.beginPath(); ctx.arc(c.x, c.y, 1.4 * k, 0, TAU); ctx.fill();
      void t0;
    },
    idol(ctx, p, t) { // our Ganesh on the peacock lorry (seat, belly, head with ears and trunk, crown, marigold garland)
      const seat = P3(p.x, p.y, 14), b = P3(p.x, p.y, 24), h = P3(p.x, p.y, 36), cr = P3(p.x, p.y, 44), k = b.k;
      ctx.fillStyle = '#b22b2b'; ctx.beginPath(); ctx.ellipse(seat.x, seat.y, 10 * k, 5 * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = Math.max(1, 1.2 * k);
      ctx.fillStyle = '#f0a868'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 8.5 * k, 8 * k, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f4b878'; ctx.beginPath(); ctx.ellipse(h.x - 7 * k, h.y, 4 * k, 5 * k, 0, 0, TAU); ctx.ellipse(h.x + 7 * k, h.y, 4 * k, 5 * k, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(h.x, h.y, 5.4 * k, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f4b878'; ctx.lineWidth = Math.max(1.5, 2.4 * k); ctx.beginPath(); ctx.moveTo(h.x, h.y + 2 * k); ctx.quadraticCurveTo(h.x + 4 * k, h.y + 9 * k, h.x + 1 * k, h.y + 11 * k); ctx.stroke();
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(cr.x - 4 * k, cr.y + 4 * k); ctx.lineTo(cr.x, cr.y - 3 * k); ctx.lineTo(cr.x + 4 * k, cr.y + 4 * k); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e07a2e'; ctx.lineWidth = Math.max(1.2, 2 * k); ctx.setLineDash([2 * k, 1.5 * k]); ctx.beginPath(); ctx.arc(b.x, b.y - 4 * k, 7 * k, 0.15, Math.PI - 0.15); ctx.stroke(); ctx.setLineDash([]);
      // gulal puffs
      for (let i = 0; i < 4; i++) { const ph = (t * 0.7 + i * 0.25) % 1, q = P3(p.x + Math.sin(i * 2.1 + t) * 14, p.y + Math.cos(i * 1.7) * 10, 4 + ph * 18); ctx.fillStyle = 'rgba(232,90,150,' + (0.45 * (1 - ph)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, (3 + ph * 7) * q.k, 0, TAU); ctx.fill(); }
    },
    lantern(ctx, p, t) { // the paper star lantern on the home balcony (SA8 reward)
      const c = P3(p.x, p.y, 22), k = c.k, r = 5 * k;
      ctx.fillStyle = 'rgba(255,214,120,' + (0.25 + 0.1 * Math.sin(t * 2)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(c.x, c.y, r * 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffcf4a'; ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad); }
      ctx.closePath(); ctx.fill();
      if (N.render.lights && N.render.night > 0.05) N.render.lights.push({ x: p.x, y: p.y, r: 40, color: '#ffcf4a', intensity: 0.6 });
    },
    raincoat(ctx, p, t) { // a yellow raincoat ducking along the plaza (seen from the gallery)
      const c = P3(p.x, p.y, 6), k = Math.max(0.6, c.k);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(c.x + 1, c.y + 3 * k, 5 * k, 2.5 * k, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f2c230'; ctx.strokeStyle = '#6a4a08'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x - 5 * k, c.y + 3 * k); ctx.lineTo(c.x, c.y - 6 * k); ctx.lineTo(c.x + 5 * k, c.y + 3 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(c.x, c.y - 5 * k, 2.6 * k, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(242,194,48,' + (0.4 + 0.5 * Math.abs(Math.sin(t * 4))).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y - 1 * k, (9 + 3 * Math.sin(t * 4)) * k, 0, TAU); ctx.stroke();
    },
    dim(ctx, p) { // M11 parapet: the whole map dims
      const R = N.render;
      ctx.fillStyle = 'rgba(8,6,16,' + (p.alpha == null ? 0.55 : p.alpha) + ')';
      ctx.fillRect(0, 0, R.W, R.H);
    },
    recLight(ctx, p, t) { // M11 parapet: every REC place lights up
      const c = P3(p.x, p.y, 0), top = P3(p.x, p.y, 120), k = Math.max(0.5, c.k);
      const gl = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 22 * k);
      gl.addColorStop(0, 'rgba(255,110,90,0.65)'); gl.addColorStop(1, 'rgba(255,110,90,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(c.x, c.y, 22 * k, 0, TAU); ctx.fill();
      const g = ctx.createLinearGradient(c.x, c.y, top.x, top.y);
      g.addColorStop(0, 'rgba(255,90,90,0.75)'); g.addColorStop(1, 'rgba(255,90,90,0)');
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(2, 5 * k); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(top.x, top.y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,60,60,' + (0.7 + 0.3 * Math.sin(t * 4 + p.x)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(3, 6 * k), 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = Math.max(8, Math.round(9 * k)) + 'px monospace'; ctx.fillText('● REC', c.x + 6, c.y - 4);
    },
    chappal(ctx, p) { // the homing chappal, its shadow and the ground marker
      const s = P3(p.x, p.y, 0), c = P3(p.x, p.y, p.h || 0), k = c.k;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(s.x, s.y, 3.2 * k, 1.8 * k, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(p.spin || 0);
      ctx.fillStyle = '#2f62b8'; ctx.beginPath(); ctx.ellipse(0, 0, 4.2 * k, 1.9 * k, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f4f2ec'; ctx.beginPath(); ctx.ellipse(0, 0, 3.4 * k, 1.3 * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2f62b8'; ctx.lineWidth = 0.9 * k; ctx.beginPath(); ctx.moveTo(-1 * k, -1.2 * k); ctx.lineTo(1.2 * k, 0); ctx.lineTo(-1 * k, 1.2 * k); ctx.stroke();
      ctx.restore();
    },
  };

  /* ================================================================== DOM kit (cards, the lock dial, the J-card menu, meters) */
  const CSS = `
.s2-panel{position:fixed;inset:0;z-index:35;display:flex;align-items:center;justify-content:center;background:rgba(10,7,14,.72);pointer-events:auto;font-family:var(--font-body,'Baloo 2',system-ui,sans-serif);color:var(--ink,#f4ead8);padding:16px;opacity:0;transition:opacity .25s}
.s2-panel.show{opacity:1}
.s2-card{position:relative;max-width:min(560px,94vw);max-height:88vh;overflow:auto;background:#f3ead2;color:#2a2018;border-radius:6px;padding:18px 20px 14px;box-shadow:0 10px 40px rgba(0,0,0,.55),inset 0 0 0 2px rgba(122,47,53,.25);font-family:'Kalam','Baloo 2',cursive}
.s2-card h2{margin:0 0 6px;font-family:var(--font-display,'Yatra One',serif);font-weight:400;color:#7a2f35;font-size:24px;letter-spacing:.5px}
.s2-card .s2-sub{margin:0 0 10px;color:#6a5a48;font-size:14px}
.s2-card .s2-hint{margin:12px 0 0;font-family:var(--font-osd,'VT323',monospace);font-size:18px;color:#7a2f35;text-align:right}
.s2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;list-style:none;margin:0;padding:0}
.s2-grid li{background:#fffaf0;border:1px solid #d8c8a0;border-radius:4px;padding:6px 8px;font-size:14px;line-height:1.2;transform:rotate(var(--r,0deg))}
.s2-grid li b{display:block;color:#2a2018;font-size:14px}
.s2-grid li span{display:block;color:#6a5a48;font-size:12px;margin-top:2px}
.s2-album{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:0;padding:0;list-style:none}
.s2-album li{aspect-ratio:3/2;border-radius:2px;position:relative;font:12px/1 var(--font-osd,'VT323',monospace);display:flex;align-items:flex-end;justify-content:center;padding:2px}
.s2-album li.on{background:linear-gradient(135deg,#d8b26a,#8a6a3a);color:#fff8e0;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.s2-album li.off{background:transparent;border:1px dashed #b8a888;color:#a89878}
.s2-album li.off::before,.s2-album li.off::after{content:'';position:absolute;width:9px;height:9px;border:2px solid #8a7a5a}
.s2-album li.off::before{left:-1px;top:-1px;border-right:0;border-bottom:0}
.s2-album li.off::after{right:-1px;bottom:-1px;border-left:0;border-top:0}
.s2-dial{display:flex;gap:10px;justify-content:center;margin:12px 0 6px}
.s2-wheel{display:flex;flex-direction:column;align-items:center;gap:4px}
.s2-wheel button{width:52px;height:30px;border:0;border-radius:4px;background:#7a5a2a;color:#ffe9b0;font-size:16px;cursor:pointer;touch-action:manipulation}
.s2-wheel .s2-d{width:52px;height:64px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#8a6a2a,#e8c36a 45%,#f8dc8a 55%,#8a6a2a);border-radius:6px;color:#2a1a08;font:44px/1 var(--font-osd,'VT323',monospace);box-shadow:inset 0 0 0 2px #5a3a10}
.s2-wheel.sel .s2-d{box-shadow:inset 0 0 0 2px #5a3a10,0 0 0 3px #ff5fb0}
.s2-dial.open .s2-d{background:linear-gradient(180deg,#5a8a3a,#b8e88a 50%,#5a8a3a)}
.s2-try{display:block;margin:10px auto 0;padding:8px 26px;border:0;border-radius:4px;background:#7a2f35;color:#fff3dc;font:22px/1 var(--font-osd,'VT323',monospace);cursor:pointer}
.s2-riddles{margin:10px 0 0;padding-left:20px;font-size:14px;color:#3a2a1a}
.s2-riddles li{margin:3px 0}
.s2-jmenu{list-style:none;margin:8px 0 0;padding:0;counter-reset:trk}
.s2-jmenu li{margin:4px 0}
.s2-jmenu button{width:100%;text-align:left;display:flex;gap:10px;align-items:baseline;padding:8px 10px;border:0;border-bottom:1px dashed #c8b890;background:transparent;color:#2a2018;font:inherit;font-size:18px;cursor:pointer}
.s2-jmenu button b{font-family:var(--font-osd,'VT323',monospace);color:#7a2f35;font-size:20px;min-width:34px}
.s2-jmenu button em{color:#6a5a48;font-size:14px;font-style:normal}
.s2-jmenu button.sel,.s2-jmenu button:hover,.s2-jmenu button:focus{background:rgba(122,47,53,.12);outline:none}
.s2-mail{font-family:var(--font-osd,'VT323',monospace);font-size:18px;background:#e8eef8;color:#1a2a4a;border-radius:4px;padding:10px 12px;white-space:pre-wrap}
.s2-meter{display:flex;align-items:center;gap:6px;margin:4px auto 0;padding:2px 10px;border-radius:12px;background:rgba(18,13,22,.82);font:16px/1.2 var(--font-osd,'VT323',monospace);color:#f4ead8;width:max-content;max-width:92vw}
.s2-meter i{display:block;width:90px;height:8px;border-radius:4px;background:#3a2a2a;overflow:hidden}
.s2-meter i b{display:block;height:100%;background:#6fbf5a;transition:width .2s}
.s2-meter.low i b{background:#e2483a}
.s2-chap2{display:inline-flex;align-items:flex-end;gap:2px;margin-left:4px;vertical-align:middle}
.s2-chap2 svg{display:block}
.s2-chap2 em{font:12px/1 var(--font-osd,'VT323',monospace);color:#f2c230;font-style:normal}
@media (max-width:480px){.s2-card{padding:14px 12px 10px}.s2-album{grid-template-columns:repeat(4,1fr)}.s2-wheel .s2-d{width:44px;height:56px;font-size:38px}.s2-wheel button{width:44px}}
`;
  function ensureCSS() {
    if (document.getElementById('s2-style')) return;
    const st = document.createElement('style');
    st.id = 's2-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  /** A modal card in #overlay. keys(k) gets 'up'|'down'|'left'|'right'|'action'|'back' (from N.input, read in
   *  this module's update while the panel is open). Resolves with close(value). */
  const UI = { panel: null };
  function panel(html, o) {
    ensureCSS();
    o = o || {};
    if (UI.panel) UI.panel.close(null);
    const root = document.getElementById('overlay') || document.body;
    const el = document.createElement('div');
    el.className = 's2-panel' + (o.cls ? ' ' + o.cls : '');
    el.innerHTML = '<div class="s2-card" role="dialog" aria-label="' + esc(o.label || 'card') + '">' + html + '</div>';
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const p = N.player;
    const wasLocked = p ? !!p.controlsLocked : false;
    if (p) p.controlsLocked = true;
    let resolve;
    const done = new Promise((r) => { resolve = r; });
    const P = {
      el, done, keys: o.keys || null, opened: nowT(),
      close(v) {
        if (P.closed) return; P.closed = true;
        if (UI.panel === P) UI.panel = null;
        el.classList.remove('show');
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
        if (p && !wasLocked) p.controlsLocked = false;
        resolve(v);
      },
    };
    if (!o.keys) el.addEventListener('click', () => { if (nowT() - P.opened > 0.25) P.close(true); });
    else {
      // a keyed panel (lock dial, rewind menu) reads the keyboard from keydown itself: N.input folds two
      // presses inside one slow frame into one edge, and a dropped click on a dial is a wrong code.
      // Pad and touch still come through panelKeys.
      const KM = (N.input && N.input.KEYMAP) || {};
      const onDown = (e) => {
        const k = KM[e.code];
        if (P.closed || UI.panel !== P || !k || !/^(up|down|left|right|action)$/.test(k)) return;
        const md = mode();
        if ((md !== 'play' && md !== 'cutscene') || (e.repeat && k === 'action')) return;
        if (k === 'action') UI.eatAction = true;
        P.keys(k);
      };
      window.addEventListener('keydown', onDown);
      done.then(() => window.removeEventListener('keydown', onDown));
    }
    UI.panel = P;
    return P;
  }
  function panelKeys() {
    const P = UI.panel, I = N.input;
    // the E that a keyed panel already took from keydown must not reach the interact system as well
    if (UI.eatAction && I) { if (I.pressed('action')) I.consume('action'); UI.eatAction = false; }
    if (!P || !I || P.closed) return;
    const md = mode();
    if (md !== 'play' && md !== 'cutscene') return;
    const kb = N.input.device === 'keyboard';
    const fire = (k) => { if (P.keys) { if (!kb) P.keys(k); } else if (k === 'action' || k === 'back') { if (nowT() - P.opened > 0.25) P.close(true); } };
    if (I.pressed('action')) { I.consume('action'); fire('action'); }
    for (const k of ['up', 'down', 'left', 'right']) if (I.pressed(k)) fire(k);
  }
  /** A read-and-continue card: resolves when the player presses ACTION / taps. */
  function card(api, title, body, o) {
    o = o || {};
    if (isFF(api)) return Promise.resolve(true);
    const P = panel('<h2>' + emph(title) + '</h2>' + (o.sub ? '<p class="s2-sub">' + emph(o.sub) + '</p>' : '') + body +
      '<p class="s2-hint">' + (N.input && N.input.device === 'touch' ? 'tap to continue' : 'E / Enter — continue') + ' ▶</p>', { label: plain(title), cls: o.cls });
    if (api) onEnd(api, () => P.close(false));
    return api ? ext(api, P.done) : P.done;
  }
  /* --- the HUD extras (inside the HUD's own columns so nothing overlaps) */
  const HX = { meter: null, chap2: null };
  function meterShow(label, value) {
    ensureCSS();
    const top = document.querySelector('#ui .hud-top');
    if (!top) return;
    if (!HX.meter) { HX.meter = document.createElement('div'); HX.meter.className = 's2-meter'; HX.meter.innerHTML = '<span></span><i><b></b></i><em></em>'; }
    if (HX.meter.parentNode !== top) top.insertBefore(HX.meter, top.querySelector('.hud-toasts') || null);
    HX.meter.querySelector('span').textContent = label;
    HX.meter.querySelector('b').style.width = clamp(value, 0, 100) + '%';
    HX.meter.querySelector('em').textContent = Math.round(value);
    HX.meter.classList.toggle('low', value < 55);
  }
  function meterHide() { if (HX.meter && HX.meter.parentNode) HX.meter.parentNode.removeChild(HX.meter); }
  const CHAPPAL_SVG = (w, c) => '<svg width="' + w + '" height="' + Math.round(w * 1.7) + '" viewBox="0 0 10 17" aria-hidden="true"><ellipse cx="5" cy="8.5" rx="4.6" ry="8" fill="' + c + '"/><ellipse cx="5" cy="8.5" rx="3.4" ry="6.6" fill="#f4f2ec"/><path d="M2 5 L5 8 L8 5" stroke="' + c + '" stroke-width="1.4" fill="none"/></svg>';
  /** Chand Raat: two chappal icons of different sizes (Mummy's and Ammi's) beside the meter. */
  function twoChappals(on) {
    ensureCSS();
    const stats = document.querySelector('#ui .hud-stats');
    if (!on) { if (HX.chap2 && HX.chap2.parentNode) HX.chap2.parentNode.removeChild(HX.chap2); return; }
    if (!stats) return;
    if (!HX.chap2) { HX.chap2 = document.createElement('div'); HX.chap2.className = 's2-chap2'; HX.chap2.title = 'Mummy and Ammi'; HX.chap2.innerHTML = CHAPPAL_SVG(13, '#d24d57') + CHAPPAL_SVG(9, '#7a5aa8') + '<em>×2</em>'; }
    if (HX.chap2.parentNode !== stats) stats.appendChild(HX.chap2);
  }

  /* ================================================================== kernels */
  /** W8 escort (systems §8.11): `key` walks (or, with o.drive, drives its vehicle) along `route` (place ids /
   *  points); running is off; beyond o.r the walker waits and the objective warns after 5 s; o.failAfter s
   *  away fails (M10). o.onStep(frac) is awaited between steps (drum phrases, the buttermilk stall). */
  async function escort(api, key, route, o) {
    o = o || {};
    const pts = (Array.isArray(route) ? route : [route]).map((t) => { const q = placeOf(t); return q ? { x: q.x, y: q.y } : null; }).filter(Boolean);
    const a0 = npcGet(key);
    if (!pts.length || !a0) return true;
    const pl = N.player;
    if (isFF(api)) { const q = pts[pts.length - 1], f = free(q.x, q.y, o.drive ? 'drive' : 'walk'); const v = a0.vehicle || a0; v.x = f.x; v.y = f.y; return true; }
    const r = o.r || TUNE.escortR;
    const speed = (o.speed || TUNE.walkSpeed) * TUNE.escortSpeed;
    pl.noRun = o.noRun !== false;
    onEnd(api, () => { pl.noRun = false; dbgTarget(null); });
    dbgTarget(() => pos());
    const segLen = []; let total = 0;
    { let px = a0.x, py = a0.y; for (const q of pts) { const L = Math.hypot(q.x - px, q.y - py); segLen.push(L); total += L; px = q.x; py = q.y; } }
    let i = 0, job = null, far = 0, warned = false, fails = 0, last = nowT();
    const label = o.label ? subst(o.label) : null;
    const pos = () => { const a = npcGet(key); return a ? (a.vehicle || a) : null; };
    const go = () => {
      const tgt = pts[i], tok = { done: false };
      job = tok;
      let pr;
      try {
        pr = o.drive && N.npcs.driveTo ? N.npcs.driveTo(key, tgt, { speed, r: 30 }) : N.npcs.walkTo(key, tgt, { speed, r: 12 });
      } catch (e) { pr = Promise.resolve(false); }
      pr.then((ok) => { tok.done = true; if (job === tok) { job = null; if (ok) { i++; fails = 0; } else fails++; } }, () => { tok.done = true; if (job === tok) { job = null; fails++; } });
      stall = { x: (pos() || tgt).x, y: (pos() || tgt).y, t: nowT() };
    };
    let stall = null;
    while (i < pts.length) {
      const t = nowT(), dt = Math.min(0.5, t - last); last = t;
      const a = pos();
      if (!a || a.alive === false) break;
      const d = dist(pl, a);
      if (d > r && mode() === 'play') {
        if (job) { stopNpc(key); job = null; }
        far += dt;
        if (far > TUNE.escortWarn && !warned) { warned = true; try { N.hud.objective(subst(o.warn || 'Stay close!')); } catch (e) { /* ignore */ } }
        if (o.failAfter && far > o.failAfter) api.fail(o.failMsg || 'You left them behind.');
      } else {
        if (warned) { warned = false; if (label) { try { N.hud.objective(label); } catch (e) { /* ignore */ } } }
        far = 0;
        if (!job) {
          // three failed or stalled legs: the crowd carries them on to the next point (the procession never stops for good)
          if (fails >= 3) { const q = pts[i], f = free(q.x, q.y, o.drive ? 'drive' : 'walk'); a.x = f.x; a.y = f.y; if ('vx' in a) { a.vx = a.vy = 0; } i++; fails = 0; continue; }
          go();
        } else if (stall) {
          // a leg that makes no headway for 6 s (a jam, a wall the path never saw) counts as a failed leg
          if (Math.hypot(a.x - stall.x, a.y - stall.y) > 6) stall = { x: a.x, y: a.y, t: nowT() };
          else if (nowT() - stall.t > 6) { stopNpc(key); job = null; fails++; stall = null; }
        }
      }
      if (o.onStep) {
        let done = 0; for (let k = 0; k < i; k++) done += segLen[k];
        if (i < pts.length) done += Math.max(0, segLen[i] - Math.hypot(pts[i].x - a.x, pts[i].y - a.y));
        const frac = total > 0 ? clamp(done / total, 0, 1) : 1;
        const res = o.onStep(frac, a);
        if (res && typeof res.then === 'function') { if (job) { stopNpc(key); job = null; } await res; last = nowT(); }
      }
      await api.wait(0.15);
    }
    if (job) { stopNpc(key); job = null; }
    pl.noRun = false;
    dbgTarget(null);
    return true;
  }

  /** W3 cargo (systems §8.10): a 100-point meter, −8 a pothole or kerb bump above 40 u/s, −15 a crash above
   *  60 u/s or a fall; the caller fails below 40. Returns {value, stop()}. */
  function cargo(api, label) {
    const C = { value: 100, label, stopped: false };
    const mul = () => { try { return N.settings && N.settings.diff ? +N.settings.diff('cargoDamage') || 1 : 1; } catch (e) { return 1; } };
    const hurt = (n, why) => {
      if (C.stopped) return;
      const v = Math.max(0, C.value - n * mul());
      if (v === C.value) return;
      C.value = v; meterShow(C.label, C.value);
      if (why) toast(why, 1200, 'cargo');
    };
    const mine = (v) => v && N.player && N.player.vehicle === v;
    const onBump = (d) => {
      if (!d) return;
      const v = d.vehicle || (d.a && d.a.kind === 'vehicle' ? d.a : null);
      const me = mine(v) || d.a === N.player;
      if (!me) return;
      const sp = Math.abs(d.speed || 0);
      if (sp > TUNE.cargoCrashSpeed) hurt(TUNE.cargoCrash, '*Dhadaam!* The bag jumped.');
      else if (sp > TUNE.cargoBumpSpeed) hurt(TUNE.cargoBump, 'Bump!');
    };
    const onPot = (d) => { if (d && mine(d.vehicle) && (d.speed == null || d.speed > TUNE.cargoBumpSpeed)) hurt(TUNE.cargoBump, '*Dhadak!* Pothole.'); };
    const onFall = () => hurt(TUNE.cargoCrash, 'Fell! The bag rolled.');
    N.on('bump', onBump); N.on('vehicle:pothole', onPot); N.on('player:fall', onFall);
    meterShow(label, 100);
    C.hurt = hurt;
    C.stop = () => { if (C.stopped) return; C.stopped = true; N.off('bump', onBump); N.off('vehicle:pothole', onPot); N.off('player:fall', onFall); meterHide(); };
    onEnd(api, C.stop);
    return C;
  }

  /** The epilogue's brass lock (systems §8.20): ←/→ wheel, ↑/↓ digit, ACTION tries; touch: the arrows and TRY.
   *  o.onWrong(n) -> Promise (the lines); after the 3rd wrong try the dial sets itself to 1-4-0-1. */
  const LOCK_CODE = [1, 4, 0, 1];
  function lockDial(api, o) {
    o = o || {};
    if (isFF(api)) return Promise.resolve({ code: '1401', tries: 0, auto: false });
    const digits = [0, 0, 0, 0];
    let sel = 0, tries = 0, busy = false;
    const html = '<h2>The brass lock</h2><p class="s2-sub">Four brass wheels. On the lid, in pencil: <i>"the day we started"</i>.</p>' +
      '<div class="s2-dial">' + [0, 1, 2, 3].map((i) => '<div class="s2-wheel" data-i="' + i + '"><button type="button" data-a="up" aria-label="Wheel ' + (i + 1) + ' up">▲</button><div class="s2-d">0</div><button type="button" data-a="down" aria-label="Wheel ' + (i + 1) + ' down">▼</button></div>').join('') + '</div>' +
      '<button type="button" class="s2-try" data-a="try">TRY</button><ol class="s2-riddles" hidden></ol>' +
      '<p class="s2-hint">' + (N.input && N.input.device === 'touch' ? 'tap ▲ ▼ · TRY' : '← → wheel · ↑ ↓ digit · E try') + '</p>';
    let resolveOut;
    const out = new Promise((r) => { resolveOut = r; });
    const P = panel(html, { label: 'The lock', cls: 's2-lock', keys: (k) => onKey(k) });
    onEnd(api, () => P.close(false));
    const wheels = Array.from(P.el.querySelectorAll('.s2-wheel'));
    function render() {
      wheels.forEach((w, i) => { w.classList.toggle('sel', i === sel); w.querySelector('.s2-d').textContent = String(digits[i]); });
      N.story2.lockState = { digits: digits.slice(), sel, tries };
    }
    function spin(i, d) { digits[i] = (digits[i] + d + 10) % 10; sfx('clock_tick'); render(); }
    function onKey(k) {
      if (busy) return;
      if (k === 'left') { sel = (sel + 3) % 4; render(); }
      else if (k === 'right') { sel = (sel + 1) % 4; render(); }
      else if (k === 'up') spin(sel, 1);
      else if (k === 'down') spin(sel, -1);
      else if (k === 'action') attempt();
    }
    P.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b || busy) return;
      const w = b.closest('.s2-wheel');
      if (w) { sel = +w.dataset.i; spin(sel, b.dataset.a === 'up' ? 1 : -1); }
      else if (b.dataset.a === 'try') attempt();
    });
    function showRiddles() {
      const L = (N.menus && N.menus.LOCK) || [];
      const ol = P.el.querySelector('.s2-riddles');
      ol.innerHTML = '<li><b>The Lock</b> (from the Journal)</li>' + L.map((x) => '<li>“' + esc(x.riddle) + '”</li>').join('');
      ol.hidden = false;
    }
    async function attempt() {
      if (busy) return;
      const code = digits.join('');
      if (code === LOCK_CODE.join('')) { finish(false); return; }
      tries++; busy = true;
      sfx('keys');
      N.emit('story2:lock', { code, ok: false, tries });
      P.el.style.visibility = 'hidden';
      try { if (o.onWrong) await o.onWrong(tries); } catch (e) { if (e && (e.name === 'MissionAbort' || e.name === 'SceneAbort')) { P.close(false); resolveOut(null); return; } N.err('story2.lock', e); }
      if (P.closed) return;
      P.el.style.visibility = '';
      if (tries === 2) showRiddles();
      if (tries >= 3) {
        for (let i = 0; i < 4; i++) { sel = i; while (digits[i] !== LOCK_CODE[i]) { await new Promise((r) => setTimeout(r, 90)); spin(i, 1); } }
        finish(true);
        return;
      }
      busy = false;
    }
    function finish(auto) {
      busy = true;
      P.el.querySelector('.s2-dial').classList.add('open');
      sfx('door', { ui: true });
      N.emit('story2:lock', { code: '1401', ok: true, tries, auto });
      setTimeout(() => { P.close(true); resolveOut({ code: '1401', tries, auto }); }, 900);
    }
    render();
    return ext(api, out);
  }

  /** The self-timer dash (systems §8.19): set the camera on the tin (ACTION), 10 s with beeps, Nanna walks
   *  back 60 u "to check the focus"; reach him (ACTION within 14 u), bring him into the frame (r 30) before
   *  the beep. A miss = "Again!", no penalty. o: {frame (point), back (point), stepper ('nanna'), shout,
   *  helpers: [{key, by}] (in 2026 Imran fetches Rasheed-saab), onAgain(n)}. */
  async function selfTimer(api, o) {
    const frame = o.frame;
    const tinPt = free(frame.x + (o.tinDx || 0), frame.y + (o.tinDy || 26));
    const camProp = { x: tinPt.x, y: tinPt.y, blink: false, draw: PAINT.tin, sort: 2 };
    prop(api, 's2:selftimer', camProp);
    if (isFF(api)) return 1;
    const stepper = o.stepper || 'nanna';
    let n = 0;
    for (;;) {
      n++;
      api.objective(o.label || 'The last photo: set Nanna\'s camera on the tin. Ten seconds.');
      const setId = api.marker ? api.marker(tinPt, { r: 14 }) : null;
      dbgTarget(tinPt);
      await api.until(() => {
        if (mode() !== 'play') return false;
        if (Math.hypot(N.player.x - tinPt.x, N.player.y - tinPt.y) > 18) return false;
        if (N.interact && N.interact.offer) N.interact.offer({ label: 'Set the self-timer', priority: 7, dist: 0, use: () => { camProp.set = true; } });
        if (camProp.set) { camProp.set = false; return true; }
        return false;
      });
      if (setId && api.unmarker) api.unmarker(setId);
      sfx('clock_tick');
      const T = softTimer(api, 'SELF-TIMER', TUNE.selfTimer); T.beep = true;
      // the stepper (and helpers) step back to check the focus, out of forty years' habit
      const st = npcGet(stepper);
      if (st) {
        const ang = Math.atan2(st.y - tinPt.y, st.x - tinPt.x) + (o.backTurn || 0.9);
        const back = o.back || free(st.x + Math.cos(ang) * TUNE.nannaBack, st.y + Math.sin(ang) * TUNE.nannaBack);
        walk(api, stepper, back, { speed: 34 });
        bark(stepper, o.focusLine || 'I\'ll just check the focus...', { secs: 2.4 });
      }
      const helpers = o.helpers || [];
      for (const h of helpers) { const ha = npcGet(h.key); if (ha) { const hb = free(ha.x + 50, ha.y + 30); walk(api, h.key, hb, { speed: 30 }); } }
      let grabbed = false;
      dbgTarget(() => (grabbed ? frame : npcGet(stepper)));
      const ok = await api.until(() => {
        if (T.left <= 0) return 'late';
        const a = npcGet(stepper);
        if (!a) return 'ok';
        if (!grabbed && Math.hypot(N.player.x - a.x, N.player.y - a.y) <= TUNE.grabR) {
          if (N.interact && N.interact.offer) N.interact.offer({ label: o.grabLabel || 'Drag Nanna into the frame', priority: 7, dist: 0, use: () => { camProp.grab = true; } });
          if (camProp.grab) {
            camProp.grab = false; grabbed = true;
            stopNpc(stepper);
            follow(stepper, N.player, { dist: 8, side: 'behind', ride: false });
            bark('player', o.shout || 'NANNA, *NUVVU KOODA!*', { speaker: 'chinnu', secs: 2.2 });
            for (const h of helpers) { const ha = npcGet(h.key); if (ha) { follow(h.key, npcGet(h.by) || N.player, { dist: 8, side: 'behind', ride: false }); if (h.shout) bark(h.by, h.shout, { secs: 2.2 }); } }
          }
        }
        if (grabbed && Math.hypot(a.x - frame.x, a.y - frame.y) <= TUNE.frameR && Math.hypot(N.player.x - frame.x, N.player.y - frame.y) <= TUNE.frameR + 10) return 'ok';
        return false;
      });
      T.stop();
      dbgTarget(null);
      follow(stepper, null);
      for (const h of helpers) follow(h.key, null);
      if (ok === 'ok') return n;
      toast('Again!', 1600);
      if (o.onAgain) { try { await o.onAgain(n); } catch (e) { if (e && (e.name === 'MissionAbort' || e.name === 'SceneAbort')) throw e; } }
      const a = npcGet(stepper);
      if (a) { const f = free(frame.x + 10, frame.y - 6); a.x = f.x; a.y = f.y; }
      for (const h of helpers) { const ha = npcGet(h.key); if (ha) { const f = free(frame.x - 12, frame.y - 4); ha.x = f.x; ha.y = f.y; } }
    }
  }

  /** The camera rises over Charminar / the city (cutscene camera step), returns the steps. */
  function camSteps(target, zoom, ms) { return { type: 'camera', target, zoom: zoom || 0.6, ms: ms || 1500 }; }

  /** Wait for a section of the ending score (when the audio really plays), capped. */
  async function scoreSection(api, name, cap) {
    const A = N.audio && N.audio.music;
    if (!A || !N.audio.ready || !has(A, 'sections') || !has(A, 'position')) return;
    const s = (A.sections('ending') || []).find((x) => x.name === name);
    if (!s) return;
    await api.until(() => { try { return A.position() >= s.start; } catch (e) { return true; } }, { timeout: cap || 20 });
  }

  /** "● REC" helper: mission m.rec when available, else N.tape.rec. */
  function rec(api, id, o) { return has(api, 'rec') ? api.rec(id, o) : Promise.resolve(false); }
  function token(api, id, o) { if (has(api, 'token')) api.token(id, o); else { try { N.tape.addToken(id, o); } catch (e) { /* ignore */ } } }

  /** Cassettes found (bible §6.3): 12 dedications + 4 Agent tapes, from the walkman (or collectibles). */
  function cassettesFound() {
    const out = { dedications: [], agent: [] };
    for (let i = 1; i <= 16; i++) {
      const id = 'cassette_' + i;
      let f = false;
      try { f = !!(N.walkman && N.walkman.has && N.walkman.has(id)); } catch (e) { f = false; }
      if (!f) { try { f = !!(N.collectibles && N.collectibles.has && N.collectibles.has(id)); } catch (e) { f = false; } }
      if (f) (i <= 12 ? out.dedications : out.agent).push(id);
    }
    return out;
  }
  function cassetteText(id) {
    const C = N.walkman && N.walkman.CASSETTES && N.walkman.CASSETTES[id];
    return C ? C.text : '';
  }
  /** Side B's tail (bible §9.2): one line per dedication cassette found (the DJ reading it), tape hiss for each
   *  missed one; all four Agent tapes found -> Imran promotes you. */
  function sideBTail() {
    const f = cassettesFound(), lines = [];
    for (let i = 1; i <= 12; i++) {
      const id = 'cassette_' + i;
      if (f.dedications.indexOf(id) >= 0) lines.push({ s: 'radio', t: cassetteText(id) || 'C' + pad2(i) });
      else lines.push({ s: 'narrator', t: '(tape hiss)' });
    }
    if (f.agent.length >= 4) lines.push({ s: 'imran_tape', t: 'You found all four Agent tapes? Agent, you are promoted.' });
    return lines;
  }
  function kitesForEnding() {
    try { if (N.collectibles && has(N.collectibles, 'kitesForEnding')) return N.collectibles.kitesForEnding().length; } catch (e) { /* ignore */ }
    try { if (N.collectibles && has(N.collectibles, 'count')) return N.collectibles.count('kites'); } catch (e) { /* ignore */ }
    return 0;
  }
  function count(series) { try { return N.collectibles && has(N.collectibles, 'count') ? N.collectibles.count(series) | 0 : 0; } catch (e) { return 0; } }
  function viewpoint(api, id, o) {
    if (isFF(api)) return Promise.resolve(0);
    try {
      if (N.collectibles && has(N.collectibles, 'viewpoint')) return ext(api, N.collectibles.viewpoint(id, Object.assign({ force: true }, o || {})));
      const q = placeOf(id); if (q && N.shops && has(N.shops, 'viewpoint')) N.shops.viewpoint(id, q.x, q.y, {});
    } catch (e) { N.err('story2.viewpoint', e); }
    return api.wait(3);
  }

  /* ================================================================== mission helpers */
  const go = (api, target, label, o) => api.goto(target, Object.assign({ label: label ? subst(label) : undefined }, o || {}));
  /** Put a companion beside the player (after a ride / a cut). */
  function beside(key, dx, dy) {
    const a = npcGet(key), p = N.player;
    if (!a || !p) return;
    if (a.vehicle) { try { N.npcs.dismount(key); } catch (e) { /* ignore */ } }
    const f = free(p.x + (dx == null ? 14 : dx), p.y + (dy == null ? 8 : dy));
    a.x = f.x; a.y = f.y; a.vx = a.vy = 0;
  }
  function companion(api, key, at) {
    const a = npcGet(key) || npc(api, key, at || 'player', { idle: 'stand', talk: false });
    if (a) { a.talk = a.talk === undefined ? false : a.talk; follow(key, N.player, { dist: 18, side: 'right', ride: true }); }
    return a;
  }
  function zoneGate(placeId) {
    try {
      const z = N.respect && N.respect.zones ? N.respect.zones.find((q) => q.place === placeId || q.id === placeId) : null;
      if (z && z.gate && isFinite(z.gate.x)) return free(z.gate.x, z.gate.y);
    } catch (e) { /* ignore */ }
    return null;
  }
  /** A simple interaction offered for this mission / scene step: resolves when the player uses it. */
  function useAt(api, target, label, o) {
    o = o || {};
    let used = false;
    dbgTarget(typeof target === 'function' ? target : placeOf(target));
    return api.until(() => {
      if (mode() !== 'play') return false;
      const q = placeOf(typeof target === 'function' ? target() : target);
      if (!q) return false;
      if (Math.hypot(N.player.x - q.x, N.player.y - q.y) > (o.r || 20)) return false;
      if (N.interact && N.interact.offer) N.interact.offer({ label: subst(label), priority: o.priority || 7, dist: 0, use: () => { used = true; } });
      if (used) { used = false; dbgTarget(null); return true; }
      return false;
    });
  }
  /** The Lock page (story.js convention): lock_N = the digit, riddle_N = true. */
  function lockDigit(api, slot, digit) {
    const f = F();
    f['lock_' + slot] = digit; f['riddle_' + slot] = true; f['lock_digit_' + slot] = true;
    if (isFF(api)) return;
    toast('The Lock: ' + [1, 2, 3, 4].map((i) => (f['lock_' + i] != null && f['lock_' + i] !== false ? f['lock_' + i] : '_')).join(' '), 3200, 'lock');
  }
  function buntyWord(def) { const f = F(); if (!Array.isArray(f.bunty_words)) f.bunty_words = []; if (f.bunty_words.indexOf(def) < 0) f.bunty_words.push(def); }
  function journalNote(id, text) {
    const f = F();
    const notes = Array.isArray(f.s2_notes) ? f.s2_notes : (f.s2_notes = []);
    if (!notes.some((n) => n.id === id)) notes.push({ id, text });
    try { if (N.menus && N.menus.refreshJournal) N.menus.refreshJournal(); } catch (e) { /* ignore */ }
  }

  /* ================================================================== M7 the_clap — The Clap (midpoint) */
  const M7 = {
    id: 'the_clap', kind: 'main', requires: ['ammammas_thursday'],
    giver: { place: 'home', r: 16 },
    reward: { money: 1000 },
    async script(m) {
      music(m, 'day');
      companion(m, 'immu');
      await m.cutscene([{ type: 'card', title: 'Amma\'s list', sub: 'Tomatoes 2 kg · onions 2 kg · brinjal 1 kg · coriander · curry leaves  —  ₹40', ms: 2800 }]);
      m.money(4000);
      // Bunty drops the boys at the gate on his way to his Ameerpet class
      const bun = npc(m, 'bunty', near('home', 34, 26, 'drive'), { vehicle: 'bunty_rx100', talk: false });
      if (bun) await go(m, bun, 'Bunty-anna is outside on the RX100. Hop on behind him.', { r: 30 });
      await talk(m, [['bunty', 'Five o\'clock at the bus depot. Not one minute late. My Java sir locks the door.']]);
      await ride(m, 'rythu_bazaar_mehdipatnam', { mode: 'rx100', label: 'BUNTY-ANNA\'S RX100 (PILLION) → MEHDIPATNAM', after: () => beside('immu') });
      if (bun) despawn('bunty');
      // 1. the Rythu Bazaar
      m.checkpoint('bazaar');
      await go(m, 'rythu_bazaar_mehdipatnam', 'Shop Amma\'s list at the Mehdipatnam Rythu Bazaar (₹40).', { r: 40 });
      npc(m, 'farmer', near('rythu_bazaar_mehdipatnam', -10, 8), { idle: 'work', talk: false });
      await talk(m, [
        ['farmer', '*Tamata kilo aaru!* *Kosaru kaavala, babu?*'],
        ['chinnu', '*Kosaru*: curry leaves AND coriander, aunty!'],
        ['farmer', 'Smart boy. Take. Your Amma has trained you well.'],
      ]);
      for (;;) {
        const c = await m.choice('narrator', 'Tomatoes are ₹1 a kilo cheaper at Erragadda, but the auto costs ₹10. Buy here or go?', ['Buy here', 'Go to Erragadda'], { default: 0 });
        if (c !== 1) break;
        await m.say('farmer', 'Ten rupees to save two? Babu, which class are you in?');
      }
      const bg = await game(m, 'bargain', { who: 'farmer', list: 4000, intro: 'Amma\'s list, ₹40. Every rupee you save is yours.', place: 'rythu_bazaar_mehdipatnam' });
      const paid = bg && bg.pricePaise > 0 ? Math.min(4000, bg.pricePaise) : 3400;
      m.money(-paid);
      m.give('amma_vegetables', { name: 'Amma\'s vegetables' });
      // 2. the bus west
      await go(m, 'mehdipatnam_bus_terminus', 'Take the bus from Mehdipatnam depot to Golconda.', { r: 30 });
      await m.cutscene([
        { type: 'text', lines: ['The bus goes west. Through the window: the Qutb Shahi domes on their terraces.'], ms: 2600 },
        camSteps('qutb_shahi_tombs', 0.7, 1600),
        { type: 'say', s: 'babloo', t: '(pretending not to know them) Mamu\'s coming in the next bus. He heard "tunnel" at Numaish. Just saying.' },
      ]);
      toast('Frame F11 from the road: "Kings asleep under onion domes." Click it on the way back.', 3200);
      await ride(m, 'golconda_fort', { mode: 'bus', label: 'BUS 66G → GOLCONDA FORT', after: () => beside('immu') });
      // 3. the gate where a clap is heard on the hill
      await go(m, 'golconda_fateh_darwaza', 'Find the gate where a clap is heard on the hill.', { r: 26 });
      m.checkpoint('gate');
      music(m, 'oldcity');
      npc(m, 'guide', near('golconda_fateh_darwaza', 16, -8), { idle: 'stand', talk: false });
      npc(m, 'pasha', near('golconda_fateh_darwaza', -30, 22), { idle: 'stand', talk: false });
      npc(m, 'babloo', near('golconda_fateh_darwaza', -40, 30), { idle: 'stand', talk: false });
      beside('immu', 12, 6);
      await talk(m, [
        ['guide', 'Fateh Darwaza, the Victory Gate. Clap under this dome, and up at the Bala Hissar they hear it.'],
        ['guide', 'They say a *surang* runs from here to Charminar. They say.'],
        ['immu', 'Agent plan: I run up. You clap here. When I hear you, I clap back. Then we\'re officially magic.'],
        ['pasha', '(arriving with his antenna) Silence! The Professor is detecting! Beep means *khazana!*'],
        ['babloo', 'Beep means your battery, mamu.'],
      ]);
      sfx('detector');
      // 4. the clap: Immu's dot climbs the steps to Bala Hissar (~45 s), then the echo
      m.objective(subst('Clap under the Fateh Darwaza dome.'));
      follow('immu', null);
      const steps = roadPts('golconda_steps') || [];
      const top = placeOf('golconda_bala_hissar');
      const climb = steps.concat(top ? [top] : []);
      let L = 0; { let a = npcGet('immu'); let px = a ? a.x : 0, py = a ? a.y : 0; for (const q of climb) { L += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; } }
      const bImmu = npcGet('immu') ? m.blip(npcGet('immu'), { color: '#2a8c82', icon: 'dot', label: 'Immu', route: false }) : null;
      if (!isFF(m) && npcGet('immu') && climb.length) {
        const T = softTimer(m, 'IMMU CLIMBING', TUNE.climbSecs);
        const spd = Math.max(20, L / Math.max(3, TUNE.climbSecs));
        for (const q of climb) { const ok = await ext(m, walk(m, 'immu', q, { speed: spd, r: 14 })); if (!ok) break; }
        T.stop();
      }
      if (top && npcGet('immu')) { const a = npcGet('immu'), f = free(top.x + 8, top.y + 6); if (Math.hypot(a.x - f.x, a.y - f.y) > 40) { a.x = f.x; a.y = f.y; } }
      if (bImmu) m.unblip(bImmu);
      await go(m, 'golconda_fateh_darwaza', 'Clap under the Fateh Darwaza dome.', { r: 26 });
      const r = await game(m, 'clap', { skin: 'golconda', rounds: 3, intro: 'Immu is at the Bala Hissar. Clap, and listen for the hill to answer.', place: 'golconda_fateh_darwaza' });
      if (!r || r.win === false) m.fail('The wall didn\'t answer. Clap again.');
      await rec(m);
      toast('SIDE A · HALFWAY', 3000);
      // 5. the climb before sunset (W2, no fail: sunset just turns to dusk)
      const sun = softTimer(m, 'SUNSET', TUNE.sunsetSecs);
      await go(m, 'golconda_bala_hissar', 'Climb to the Bala Hissar before sunset.', { r: 30, onFoot: true });
      if (sun.left <= 0) toast('The sun went down on the way up. Dusk light on the whole city.', 2600);
      sun.stop();
      m.checkpoint('summit');
      beside('immu', 14, 4);
      await talk(m, [
        ['immu', 'Three claps came up. Clear. Like you were standing next to me.'],
        ['chinnu', 'Golconda heard us.'],
        ['immu', '{nick}. The guide said a tunnel goes from here to Charminar.'],
        ['chinnu', '"They say." He said "they say" two times.'],
        ['immu', 'On Chand Raat I go into the tunnel. A plane can\'t take a boy it can\'t find.'],
        ['chinnu', '(a long look at the city) ...*Pakka.* I\'ll bring Osmania biscuits.'],
        ['immu', 'Agent rules. The tunnel starts where four towers keep time. Don\'t forget.'],
        ['chinnu', 'Four towers... that\'s...'],
        ['immu', 'Shh. Pasha is coming up the stairs.'],
      ]);
      m.flag('clue_tunnel', true);
      journalNote('clue_tunnel', '🔒 For Chand Raat: "The tunnel starts where four towers keep time."');
      await viewpoint(m, 'golconda_bala_hissar');
      // 6. shake off Professor Pasha (on foot; lose him 300 u or board the bus)
      music(m, 'tension');
      const pa = npc(m, 'pasha', near('golconda_bala_hissar', 40, 40), { idle: 'stand', talk: false });
      npc(m, 'babloo', near('golconda_bala_hissar', 60, 50), { idle: 'stand', talk: false });
      if (pa) { follow('pasha', N.player, { dist: 16, side: 'behind', ride: false }); bark('pasha', 'The boys know the entrance!'); }
      follow('immu', N.player, { dist: 18, side: 'right', ride: true });
      const fort = placeOf('golconda_fort');
      const rp = fort && N.world.nearestRoadPoint ? N.world.nearestRoadPoint(fort.x, fort.y) : null;
      let bus = null;
      if (rp) { const f = free(rp.x, rp.y, 'drive'); bus = m.vehicle('bus', f.x, f.y, rp.angle || 0, { driver: true, noEnter: true, route: '66G' }); }
      const busB = bus ? m.blip(bus, { color: '#b22b2b', icon: 'square', label: 'Bus 66G', route: true }) : null;
      m.objective(subst('Shake off Professor Pasha.'));
      dbgTarget(bus && bus.alive ? bus : null);
      onEnd(m, () => dbgTarget(null));
      const t0 = nowT();
      let tricked = false, boarded = false;
      await m.until(() => {
        const p = N.player, a = npcGet('pasha');
        if (!tricked && a && (nowT() - t0 > 8 || Math.hypot(p.x - a.x, p.y - a.y) > 160)) {
          tricked = true;
          bark('babloo', 'Mamu! Tunnel entrance! Behind the sound-and-light chairs!', { secs: 3 });
          setTimeout(() => bark('pasha', 'BEHIND THE CHAIRS! Camera, roll!', { secs: 3 }), 1200);
          follow('pasha', null);
          walk(m, 'pasha', 'golconda_sound_light', { run: true, speed: 60 });
        }
        if (bus && bus.alive && Math.hypot(p.x - bus.x, p.y - bus.y) < 30 && mode() === 'play' && N.interact && N.interact.offer) {
          N.interact.offer({ label: 'Board the bus to Mehdipatnam', priority: 7, dist: 0, use: () => { boarded = true; } });
        }
        if (boarded) return true;
        return !a || Math.hypot(p.x - a.x, p.y - a.y) > TUNE.pashaShake;
      });
      if (busB) m.unblip(busB);
      dbgTarget(null);
      // 7. back to the depot by 19:30 (no fail: being late changes the lines)
      music(m, 'day');
      await ride(m, 'mehdipatnam_bus_terminus', { mode: 'bus', label: 'BUS 66G → MEHDIPATNAM DEPOT', after: () => beside('immu') });
      const late = N.clock.minutes > TUNE.depotBy || N.clock.minutes < 6 * 60;
      npc(m, 'bunty', near('mehdipatnam_bus_terminus', 20, 12, 'drive'), { vehicle: 'bunty_rx100', talk: false });
      if (!late) {
        await talk(m, [
          ['bunty', 'Good. Word of the day. Sir says nostalgia means "pain for home". Nostos, algos. Greek.'],
          ['immu', '...Pain for home.'],
          ['bunty', 'Why is everyone quiet? I got it RIGHT for once!'],
        ]);
        m.flag('bunty_nostalgia_greek', true);
        buntyWord('pain for home. (Greek!)');
      } else {
        await m.say('bunty', '*Tension nakko*... no. TENSION *HAAN!*', { mood: 'angry' });
        m.flag('the_clap_late', true);
      }
      await ride(m, 'home', { mode: 'rx100', label: 'BUNTY-ANNA\'S RX100 (PILLION) → HOME', minutes: 25 });
      npc(m, 'amma', near('home', 10, 14), { idle: 'stand', talk: false });
      await m.say('amma', 'Tomatoes are bruised. Who sat on them?');
      if (late && N.wanted && has(N.wanted, 'set')) { try { N.wanted.set(2, 'bunty'); } catch (e) { /* ignore */ } }
      await m.cutscene([{ type: 'card', title: 'SIDE A · 581', sub: 'Halfway. The hunt has a secret now: on Chand Raat, Immu disappears. But the tape is collecting something else, and nobody has noticed yet.', ms: 5200 }]);
    },
    onPass() {
      try { if (N.shops && N.shops.unlockBus) { N.shops.unlockBus('mehdipatnam'); N.shops.unlockBus('golconda'); } } catch (e) { N.err('story2.bus', e); }
      F().bus_golconda = true; F().bus_mehdipatnam = true;
      toast('Golconda bus route unlocked (Mehdipatnam depot).', 3200);
    },
  };

  /* ================================================================== M8 drums_for_amma — Drums for Amma */
  const M8 = {
    id: 'drums_for_amma', kind: 'main', requires: ['the_clap'],
    giver: { place: 'home', r: 16 },
    reward: { money: 1500 },
    async script(m) {
      music(m, 'festival');
      variant('amma', 'bonam');
      onEnd(m, () => variant('amma', null));
      companion(m, 'immu');
      // 1. dawn errands
      const dosaB = m.blip('dosa_bandi_1', { color: '#f2c230', icon: 'shop', label: 'Breakfast (optional)', pulse: false, route: false });
      let dosaSaid = false;
      const dosaWatch = () => { const q = placeOf('dosa_bandi_1'); if (!dosaSaid && q && Math.hypot(N.player.x - q.x, N.player.y - q.y) < 40) { dosaSaid = true; bark(npcGet('dosa_man') ? 'dosa_man' : 'player', 'Idli, vada, dosa: *tondaraga cheppandi!*', { speaker: 'dosa_man' }); } return false; };
      m.until(dosaWatch);
      npc(m, 'dosa_man', near('dosa_bandi_1', 6, -6), { idle: 'work', talk: 'Idli, vada, dosa: *tondaraga cheppandi!*' });
      await go(m, 'flower_cart_2', 'At dawn, buy neem leaves and marigolds for Amma\'s bonam.', { r: 26 });
      npc(m, 'flower_aunty', near('flower_cart_2', 6, -6), { idle: 'work', talk: false });
      await m.say('flower_aunty', 'One *moora*, measured on my own arm. Never short.');
      m.give('neem_marigold', { name: 'Neem leaves and marigolds' });
      npc(m, 'amma', near('home', 12, 12), { idle: 'stand', talk: false });
      await go(m, 'home', 'Take the neem and marigolds to Amma.', { r: 26 });
      await m.say('amma', '(balancing the brass pot) *Nemmadiga*, {nick}. The *bonam* is in no hurry, and neither are we.');
      m.unblip(dosaB);
      // 2. Ramulu-uncle's turmeric
      m.checkpoint('turmeric');
      npc(m, 'ramulu', near('pindi_girni_1', 8, 8), { idle: 'work', talk: false });
      await go(m, 'pindi_girni_1', 'Bring Ramulu-uncle his turmeric.', { r: 24 });
      await talk(m, [
        ['ramulu', '*Ee okka Aadivaaram nenu pindi Ramulu kaadu. Pothuraju.* (This one Sunday I\'m not Flour Ramulu.)'],
        ['ramulu', 'But a Pothuraju with no turmeric is just a man in shorts. Get me a packet. Not from... you know.'],
      ]);
      npc(m, 'agarwal', near('kirana_1', 6, 8), { idle: 'work', talk: false });
      await go(m, 'kirana_1', 'Get turmeric. (The only shop open is... Agarwal-ji\'s.)', { r: 24 });
      await m.say('agarwal', 'Turmeric? For who? ...For Ramulu? (long pause) Take it. Don\'t tell him it\'s from me.');
      m.give('turmeric', { name: 'A packet of turmeric' });
      await go(m, 'pindi_girni_1', 'Bring Ramulu-uncle his turmeric.', { r: 24 });
      variant('ramulu', 'pothuraju');
      onEnd(m, () => variant('ramulu', null));
      await talk(m, [
        ['ramulu', '(painting himself gold) Where did you get this? It\'s very good turmeric.'],
        ['chinnu', '...A shop.'],
      ]);
      // 3. the procession: Yadagiri drops them at the General Bazaar end (the lanes are closed to autos)
      const temple = 'ujjaini_mahankali_temple';
      const start = toward(temple, 'general_bazaar', 320) || near('general_bazaar', 0, 0);
      await ride(m, 'general_bazaar', { mode: 'auto', label: 'YADAGIRI-ANNA\'S AUTO → GENERAL BAZAAR', at: () => start, after: () => beside('immu') });
      m.checkpoint('procession');
      m.meter('frozen');
      const amma = npc(m, 'amma', { x: start.x + 14, y: start.y - 6 }, { idle: 'stand', talk: false });
      npc(m, 'ramulu', { x: start.x + 34, y: start.y - 14 }, { idle: 'stand', talk: false });
      if (amma) follow('ramulu', amma, { dist: 26, side: 'left', ride: false });
      follow('immu', amma || N.player, { dist: 16, side: 'right', ride: false });
      await talk(m, [
        ['immu', 'Ammi says Bonalu is the city saying thank you to the goddess for the rain.'],
        ['amma', 'Your Ammi is right. Hold the neem higher, Imran. Not like a cricket bat.'],
      ]);
      const gate = zoneGate(temple) || placeOf(temple);
      const label = 'Walk with Amma\'s bonam to Ujjaini Mahankali. Keep step with the drums. Never run.';
      m.objective(subst(label));
      const beats = [0.2, 0.5, 0.8];
      let beat = 0, stall = false;
      await escort(m, 'amma', [gate], {
        r: TUNE.escortR, label, warn: 'Stay with Amma',
        onStep: (frac, a) => {
          if (!stall && frac >= 0.42) {
            stall = true;
            return (async () => {
              const f = free(a.x + 20, a.y - 18);
              prop(m, 's2:buttermilk', { x: f.x, y: f.y, draw: PAINT.stall });
              npc(m, 'agarwal', { x: f.x + 6, y: f.y - 8 }, { idle: 'work', talk: false });
              m.objective(subst('The free buttermilk stall.'));
              await talk(m, [
                ['agarwal', 'Buttermilk, free. For everyone. Even... for everyone.'],
                ['ramulu', '(Pothuraju, painted gold, takes a glass) ...Thanks, Gopal.'],
                ['agarwal', '...Hmph. Drink slowly. It\'s cold.'],
                ['chinnu', '(aside) Twenty years they didn\'t talk. Because of one radio.'],
                ['immu', 'That\'s not fighting. That\'s how uncles say sorry.'],
              ]);
              if (N.player.feed) { try { N.player.feed(10, { quiet: true }); } catch (e) { /* ignore */ } }
              m.objective(subst(label));
            })();
          }
          if (beat < beats.length && frac >= beats[beat]) {
            beat++;
            return (async () => {
              sfx('dappu');
              const g = await game(m, 'clap', { skin: 'drums', rounds: 1, noQuit: true, intro: 'The drums swell. Keep step with Amma\'s bonam.' });
              if (g && g.win === false) await m.say('amma', '*Nemmadiga*, {nick}. The *bonam* is in no hurry, and neither are we.');
            })();
          }
          return null;
        },
      });
      while (beat < beats.length) { beat++; await game(m, 'clap', { skin: 'drums', rounds: 1, noQuit: true }); }
      // 5. at the temple (respect: Chinnu waits outside with the chappals)
      await m.cutscene([{ type: 'text', lines: ['Amma lifts the bonam down at the gate. Drums. Neem. Turmeric. A thousand women, a thousand brass pots, one goddess. Chinnu stands outside with the chappals and listens.'], ms: 5200 }]);
      await rec(m);
      m.meter('normal');
      follow('immu', N.player, { dist: 18, side: 'right', ride: true });
      // 6. the Paradise parcel, hot (W2 120 s, no fail)
      music(m, 'day');
      npc(m, 'paradise_man', near('paradise', 8, 6), { idle: 'work', talk: false });
      await go(m, 'paradise', 'Bring a Paradise biryani parcel home hot (Sunday lunch).', { r: 30 });
      m.checkpoint('paradise');
      await talk(m, [
        ['paradise_man', 'Family pack? Fifteen minutes. The smell is free.'],
        ['immu', 'Does America have Paradise?'],
        ['chinnu', 'Then it\'s not paradise, *na*.'],
      ]);
      m.give('biryani_parcel', { name: 'Paradise biryani, family pack' });
      const cyc = near('paradise', 22, 16, 'drive');
      if (cyc) m.vehicle(vtype('hero_cycle', 'cycle'), cyc.x, cyc.y, 0, { color: '#1d1d22' });
      toast('Bunty-anna lent his cycle. An auto is fine too.', 2400);
      const T = softTimer(m, 'HOT PARCEL', TUNE.parcelSecs); T.beep = true;
      await go(m, 'home', 'Bring the parcel home before it goes cold.', { r: 30 });
      const hot = T.left > 0; T.stop();
      npc(m, 'nanna', near('home', 14, 10), { idle: 'stand', talk: false });
      npc(m, 'amma', near('home', -12, 10), { idle: 'stand', talk: false });
      if (hot) {
        await talk(m, [
          ['nanna', 'Still hot! Who brought it?'],
          ['chinnu', 'Me. Record time.'],
          ['nanna', 'Hold it up. Smile. (click) Hero with parcel.'],
        ]);
        sfx('camera_flash');
        await talk(m, [['chinnu', 'Nanna, come in the photo also.'], ['nanna', 'Then who will click?']]);
      } else await m.say('amma', 'Cold biryani is still biryani. But you\'re still in trouble.');
    },
    onPass() {
      F().ramulu_agarwal = true;
      setTimeout(() => toast('Ammi phoned the colony STD booth: Abba forgot his tiffin again. (Fri 25 Jul, Immu\'s house)', 4200), 4600);
    },
  };

  /* ================================================================== M9 opening_day — Opening Day */
  const M9 = {
    id: 'opening_day', kind: 'main', requires: ['drums_for_amma'],
    giver: { place: 'friend_home', r: 16 },
    reward: { money: 2000 },
    async script(m) {
      music(m, 'day');
      npc(m, 'ammi', near('friend_home', 10, 10), { idle: 'stand', talk: false });
      companion(m, 'immu');
      await m.say('ammi', 'He forgot his *dabba* again. If he eats canteen oil every day, he\'ll be fat in America.');
      m.give('tiffin', { name: 'Abba\'s tiffin' });
      // 1. the tiffin to Cyber Towers before 1 pm (fails after 13:00)
      m.checkpoint('bus');
      const how = await m.choice('narrator', 'HITEC City is far. How do you go?', ['Bus to HITEC City (₹3)', 'Cycle it'], { default: 0 });
      if (how === 0) {
        m.money(-300);
        await ride(m, 'bus_stop_20', { mode: 'bus', label: 'BUS 10H → HITEC CITY', after: () => beside('immu') });
      } else {
        const c = near('friend_home', 20, 18, 'drive');
        if (c) m.vehicle(vtype('hero_cycle', 'cycle'), c.x, c.y, 0, { color: '#2f6a3a' });
      }
      npc(m, 'abba', near('cyber_towers', 12, 18), { idle: 'stand', talk: false });
      const lateW = m.until(() => N.clock.minutes >= TUNE.tiffinBy && N.clock.minutes < 20 * 60);
      const won = await Promise.race([go(m, 'cyber_towers', 'Take Abba\'s tiffin to Cyber Towers before 1 pm.', { r: 40 }).then(() => 'ok'), lateW.then(() => 'late')]);
      if (won === 'late') m.fail('Tiffin late! Abba ate canteen oil.');
      beside('immu');
      await talk(m, [
        ['abba', '(at the Cyber Towers forecourt) My tiffin! Ammi sent you two across the whole city for one *dabba*?'],
        ['immu', 'She said canteen oil will make you fat in America.'],
        ['abba', 'Look around. Five years ago this was rocks and goats. Now look. Glass.'],
        ['abba', 'For delivery on time: tickets for today\'s opening at Prasads. Six o\'clock show.'],
        ['chinnu', 'Tickets? For us?'],
        ['abba', 'Three. I\'m also coming. My manager gave half-day. I said "gas station" perfectly.'],
        ['abba', '(practising, quietly) Gas station. Gas station. Not petrol bunk.'],
      ]);
      m.give('prasads_tickets', { name: 'Three tickets, Prasads, 6 pm' });
      // 2. Bunty's tomato race (W3 cargo; fail below 40)
      npc(m, 'bunty', near('rythu_bazaar_erragadda', 26, 16, 'drive'), { vehicle: 'bunty_rx100', talk: false });
      await go(m, 'rythu_bazaar_erragadda', 'Bunty-anna\'s challenge: tomatoes from Erragadda Rythu Bazaar to Necklace Road, no bruises.', { r: 40 });
      m.checkpoint('erragadda');
      await m.say('bunty', '*Tension nakko.* Tomatoes first, cinema later. My mother also has a chappal.');
      m.give('tomatoes_3kg', { name: '3 kg tomatoes in a cloth bag' });
      const pc = near('rythu_bazaar_erragadda', -24, 20, 'drive');
      let myCycle = N.player.vehicle && N.player.vehicle.T && N.player.vehicle.T.pedal ? N.player.vehicle : null;
      if (!myCycle && pc) myCycle = m.vehicle(vtype('hercules_cycle', 'cycle'), pc.x, pc.y, 0, { color: '#24479a' });
      if (myCycle && !isFF(m)) await go(m, myCycle, 'Get on the cycle. Bunty-anna is revving.', { r: 18 }).then(() => m.until(() => N.player.vehicle === myCycle, { timeout: 30 }));
      const bag = cargo(m, 'TOMATOES');
      if (!isFF(m)) {
        const via = ['ameerpet_coaching', 'coconut_cart_1'];
        (async () => { for (const v of via) { try { const ok = await N.npcs.driveTo('bunty', v, { speed: 86 * TUNE.escortSpeed, r: 30 }); if (!ok) break; } catch (e) { break; } } })().catch(() => {});
      }
      const bk = npcGet('bunty') ? m.blip(npcGet('bunty'), { color: '#4a6fa5', icon: 'dot', label: 'Bunty-anna', route: false }) : null;
      const fin = await Promise.race([
        go(m, 'coconut_cart_1', 'Race to Necklace Road, "where the palms meet the railway". Don\'t bruise the tomatoes!', { r: 34 }).then(() => 'ok'),
        m.until(() => bag.value < TUNE.cargoFail).then(() => 'bruised'),
      ]);
      bag.stop();
      if (bk) m.unblip(bk);
      if (fin === 'bruised') m.fail('Tomato chutney. My mother will make ME into chutney. Again!');
      npc(m, 'coconut_man', near('coconut_cart_1', 6, -6), { idle: 'work', talk: false });
      await m.say('coconut_man', '*Kobbari bondam!* *Neeru teeyaga undi!* Winner drinks first.');
      if (N.player.feed) { try { N.player.feed(20, { quiet: true }); } catch (e) { /* ignore */ } }
      if (!isFF(m)) await m.until(() => { const b = npcGet('bunty'), q = placeOf('coconut_cart_1'); return !b || !q || Math.hypot(b.x - q.x, b.y - q.y) < 80; }, { timeout: 8 });
      await m.say('bunty', '(arriving) You took the railway-side road? *Chee*. Clever.');
      // 3. Prasads opens today (bible §1.4: prasads_open from 25 Jul)
      await go(m, 'prasads_imax', 'Meet Abba at Prasads. Opening day!', { r: 40 });
      m.flag('prasads_open', true);
      seasonsSet('prasads_open', null);
      m.checkpoint('prasads');
      npc(m, 'abba', near('prasads_imax', 10, 16), { idle: 'stand', talk: false });
      npc(m, 'pasha', near('prasads_imax', -16, 18), { idle: 'stand', talk: false });
      npc(m, 'babloo', near('prasads_imax', -24, 24), { idle: 'stand', talk: false });
      beside('immu');
      await m.cutscene([{ type: 'text', lines: ['The new building, banners "OPENING TODAY", crowds, the air-conditioning chill, the smell of popcorn.'], ms: 3200 }]);
      await talk(m, [
        ['pasha', '*Khazana Hunt* special! Live from the biggest screen in... er... in this lobby!'],
        ['babloo', 'Mamu, they\'re asking for your ticket.'],
        ['pasha', 'The Professor does not need a ticket! ...How much is a ticket?'],
      ]);
      N.clock.set(18, 0);
      await m.cutscene([
        { type: 'card', title: 'GIANTS OF THE DEEP', sub: 'Prasads · Opening day · 6 pm show', ms: 2200 },
        { type: 'text', lines: ['The lights go down. The screen is so big it has no edges.'], ms: 2600 },
        { type: 'text', lines: ['A whale swims over four hundred heads. Immu grips the armrest. Abba laughs out loud, like a boy.'], ms: 3600 },
        { type: 'say', s: 'immu', t: 'Bigger than every TV in our colony put together!' },
      ]);
      await rec(m);
      await viewpoint(m, 'prasads_imax');
      // 4. the NTR Gardens mini train with Abba
      await go(m, 'ntr_gardens', 'Ride the mini train at NTR Gardens with Abba.', { r: 50 });
      npc(m, 'abba', near('ntr_gardens', 12, 10), { idle: 'stand', talk: false });
      beside('immu', -10, 8);
      let trainP = null;
      if (!isFF(m) && N.shops && has(N.shops, 'trainRide')) { trainP = N.shops.trainRide('ntr_gardens', { secs: 40 }); }
      else await m.cutscene([{ type: 'text', lines: ['A seated ride round the gardens: the Machan tree, the waterfall. Chinnu sits one seat behind.'], ms: 2600 }]);
      await talk(m, [
        ['abba', 'Imran. You think I\'m taking you away from here.'],
        ['immu', 'Aren\'t you?'],
        ['abba', 'My father ground flour at a girni near Charminar so I could study, *beta*. Atta on his eyebrows every day of his life.'],
        ['abba', 'I\'m going so you can choose anything. Even to come back.'],
        ['immu', '...Even to come back?'],
        ['abba', 'Especially that.'],
      ]);
      sfx('train_horn');
      await m.cutscene([{ type: 'text', lines: ['The train whistles. Chinnu looks at the lake and says nothing.'], ms: 3000 }]);
      if (trainP) await ext(m, Promise.race([trainP, new Promise((r) => setTimeout(r, 45000))]));
    },
    onPass() {
      F().prasads_open = true;
      F().clue_peacock = true;
      journalNote('clue_peacock', 'Bunty\'s flyer: "Colony Ganesh Committee. Lorry for immersion: behind the station dressed as a palace. Look for the peacock." (Tue 9 Sep, the colony pandal)');
      setTimeout(() => toast('Bunty\'s flyer: "Lorry for immersion: behind the station dressed as a palace. Look for the peacock."', 4600), 4600);
    },
  };

  /* ================================================================== M10 agle_baras — Agle Baras Jaldi Aana */
  const CLUE_PEACOCK = 'Lorry behind the station dressed as a palace. Look for the peacock.';
  const CLUE_TUNNEL = 'The tunnel starts where four towers keep time.';
  function statue(i) { const lm = landmark('tank_bund_statue_' + i); return lm ? { x: lm.x, y: lm.y, r: 12 } : null; }
  function lorryOf() { const a = npcGet('narsimha'); return a && a.vehicle ? a.vehicle : a && a.ownVehicle && a.ownVehicle.alive ? a.ownVehicle : null; }
  const M10 = {
    id: 'agle_baras', kind: 'main', requires: ['opening_day'],
    giver: { place: 'playground_1', r: 18 },
    reward: { money: 1500 },
    async script(m) {
      music(m, 'festival');
      variant('bunty', 'committee');
      onEnd(m, () => variant('bunty', null));
      npc(m, 'bunty', near('playground_1', 14, -12), { idle: 'stand', talk: false });
      companion(m, 'immu');
      try { if (N.hints && N.hints.start) N.hints.start('agle_baras', { clue: CLUE_PEACOCK, answer: 'kachiguda_station', name: 'Kachiguda station' }); } catch (e) { N.err('story2.hints', e); }
      onEnd(m, () => { try { if (N.hints && N.hints.active && N.hints.active.id === 'agle_baras') N.hints.stop(); } catch (e) { /* ignore */ } });
      // 1. the riddle: the station dressed as a palace
      await go(m, 'kachiguda_station', 'Find the lorry: behind the station dressed as a palace. Look for the peacock.', { r: 70 });
      try { if (N.hints && N.hints.solve) N.hints.solve('agle_baras'); } catch (e) { /* ignore */ }
      m.checkpoint('kachiguda');
      npc(m, 'chappal_man', near('chappal_bazar', 8, -8), { idle: 'work', talk: false });
      await go(m, 'chappal_bazar', 'Behind the station: the Chappal Bazar pandal crowd. Look for the peacock.', { r: 40 });
      sfx('crowd_cheer');
      await talk(m, [
        ['chinnu', 'My chappal! In Chappal Bazar!'],
        ['chappal_man', 'Chappal Bazar *mein* chappal lost? *Mian*, here even chappals have a lost-and-found.'],
        ['chappal_man', 'New pair, fifteen rupees. And for your Mummy? Ladies\' *kotha chappal*, twenty-five. Very good for... apologies.'],
      ]);
      const buy = await m.choice('chinnu', 'Chappals?', ['Hawai pair (₹15)', 'Kotha chappal for Mummy (₹25)', 'Both (₹40)', 'Nothing. I\'ll limp.'], { default: 0 });
      if (buy === 0 || buy === 2) { m.money(-1500); m.give('hawai_chappals', { name: 'New hawai chappals' }); }
      if (buy === 1 || buy === 2) { m.money(-2500); m.give('kotha_chappal', { name: 'Kotha chappal (for Mummy)' }); }
      if (buy === 1 || buy === 3) { try { N.player.addStatus('limp'); F().s2_limp = true; } catch (e) { /* ignore */ } toast('One chappal. You limp (80% speed) until home.', 2600); }
      const ban = await m.choice('narrator', 'Puja bananas from the cart? (₹10)', ['Yes (₹10)', 'No'], { default: 1 });
      if (ban === 0) { m.money(-1000); m.give('puja_bananas', { name: 'Puja bananas' }); }
      // the peacock lorry
      const ls = near('chappal_bazar', 50, 34, 'drive');
      const nar = npc(m, 'narsimha', ls, { vehicle: 'peacock_lorry', talk: false });
      const lorry = lorryOf();
      if (lorry) m.spawn(lorry);
      if (nar) await go(m, lorry || nar, 'Look for the peacock.', { r: 40 });
      await m.say('narsimha', 'Peacock lorry, that\'s me. Your colony paid the advance? ...Bunty paid? Then let\'s go before he changes his mind.');
      await ride(m, 'playground_1', {
        mode: 'lorry', label: 'PEACOCK LORRY (IN THE CAB) → LAKSHMI NAGAR',
        after: () => {
          const v = lorryOf(), q = placeOf('playground_1');
          if (v && q) { const rp = N.world.nearestRoadPoint(q.x, q.y); const f = free(rp ? rp.x : q.x, rp ? rp.y : q.y, 'drive'); v.x = f.x; v.y = f.y; v.angle = rp ? rp.angle : 0; v.vx = v.vy = 0; v.okX = null; }
          beside('immu');
        },
      });
      // 2. walk with our Ganesh to Tank Bund (W8; abandoning the lorry for 60 s fails)
      m.checkpoint('procession');
      m.meter('frozen');
      prop(m, 's2:idol', { pos: () => { const v = lorryOf(); return v ? { x: v.x, y: v.y } : null; }, draw: PAINT.idol, sort: 2 });
      const dancers = [];
      for (let i = 0; i < 3; i++) {
        const v = lorryOf(); if (!v) break;
        const d = npc(m, ['kirana_kid', 'uncle', 'papad_man'][i], free(v.x - 20 - i * 10, v.y + 12), { key: 's2_dancer' + i, idle: 'stand', talk: false });
        if (d) { follow(d.key, v, { dist: 22 + i * 8, side: i % 2 ? 'left' : 'right', ride: false }); dancers.push(d.key); }
      }
      if (F().tiger_helps_lorry || (F().pandal_nights | 0) >= 4) {
        const tg = npc(m, 'tiger', near('playground_1', 20, 10), { idle: 'stand', talk: false });
        if (tg) { follow('tiger', lorryOf() || N.player, { dist: 26, side: 'left', ride: false }); bark('tiger', 'Push, push! Our laddu is smaller, but our arms are bigger!'); }
      }
      follow('immu', N.player, { dist: 16, side: 'right', ride: false });
      const route = ['narayanguda_ymca', 'liberty_theatre', 'secretariat', 'ganesh_immersion_point'].filter((id) => placeOf(id));
      const lab = 'Walk with our Ganesh to Tank Bund.';
      m.objective(subst(lab));
      let giant = false;
      sfx('dappu');
      await escort(m, 'narsimha', route, {
        drive: true, r: TUNE.lorryR, speed: TUNE.lorrySpeed, label: lab, warn: 'Stay with our Ganesh!',
        failAfter: TUNE.lorryAbandon, failMsg: 'Our Ganesh went on without you.',
        onStep: (frac) => {
          if (!giant && frac >= 0.68) {
            giant = true;
            return m.cutscene([
              camSteps('khairatabad_ganesh', 0.75, 1600),
              { type: 'text', lines: ['The giant Ganesh glides past on its own huge trailer. Every drum stops. A whole city holds its breath. Then the drums start again, twice as loud.'], ms: 5200 },
              { type: 'sfx', name: 'dappu' },
            ]);
          }
          return null;
        },
      });
      for (const k of dancers) despawn(k);
      // 3. night on the Tank Bund: the queue for the cranes, the water stall
      N.clock.set(23, 30);
      m.checkpoint('tank_bund');
      music(m, 'night');
      const ip = placeOf('ganesh_immersion_point');
      const ws = ip ? free(ip.x - 30, ip.y + 24) : null;
      if (ws) prop(m, 's2:waterstall', { x: ws.x, y: ws.y, draw: PAINT.stall });
      npc(m, 'abba', ws ? { x: ws.x + 10, y: ws.y - 8 } : 'ganesh_immersion_point', { idle: 'stand', talk: false });
      npc(m, 'ammi', ws ? { x: ws.x + 18, y: ws.y - 2 } : 'ganesh_immersion_point', { idle: 'stand', talk: false });
      npc(m, 'faramarz', ws ? { x: ws.x - 6, y: ws.y - 8 } : 'ganesh_immersion_point', { idle: 'work', talk: false });
      if (ws) await go(m, ws, 'Wait for our turn at the cranes.', { r: 36 });
      beside('immu');
      await talk(m, [
        ['faramarz', '*Paani lo, beta.* Ganpati\'s journey is long. Everybody gets thirsty.'],
        ['ammi', 'Every year Abba\'s family gave water here. This year...'],
        ['abba', '...This year also. Next year, someone else. Same water.'],
        ['immu', '(handing Chinnu a cassette) Agent tape. Listen.'],
        ['immu_tape', 'Count the great ones from the Lumbini end. At seven, look down. Then ask the man in the lake.'],
      ]);
      if (N.player.feed) { try { N.player.feed(10, { quiet: true }); } catch (e) { /* ignore */ } }
      // count the statues from the Lumbini end (the HUD counts 1..7)
      let n = 0;
      const lab2 = 'Count the statues from the Lumbini end. At the seventh, look down.';
      let sb = statue(1) ? m.blip(statue(1), { color: PINK, icon: 'ring', label: 'The Lumbini end', route: true }) : null;
      m.objective(subst(lab2 + ' (0/7)'));
      if (!isFF(m) && statue(7)) {
        await m.until(() => {
          const s = statue(n + 1);
          dbgTarget(s);
          if (!s) { n = 7; return true; }
          if (Math.hypot(N.player.x - s.x, N.player.y - s.y) < TUNE.statueR) {
            n++;
            toast(String(n) + (n === 7 ? '! Look down.' : '...'), 1000, 'count');
            sfx('ui_select');
            try { N.hud.objective(subst(lab2 + ' (' + n + '/7)')); } catch (e) { /* ignore */ }
            if (sb) { m.unblip(sb); sb = null; }
            if (n < 7 && statue(n + 1)) sb = m.blip(statue(n + 1), { color: PINK, icon: 'ring', label: 'Statue ' + (n + 1), route: false });
          }
          return n >= 7;
        });
      }
      if (sb) m.unblip(sb);
      if (statue(7)) await useAt(m, statue(7), 'Look down', { r: TUNE.statueR + 6 });
      sfx('paper');
      await m.cutscene([{ type: 'text', lines: ['At the seventh plinth\'s base: a paper boat with a note.', '"Ask the man in the lake how many stones he is made of."'], ms: 4200 }]);
      m.flag('riddle_4', true);
      toast('Lock riddle 4 is in the Journal: "The Lock".', 2800);
      // 4. goodbye at the crane, 02:10
      await m.jumpTo([2003, 9, 10, 2, 10], { fx: 'ff' });
      await go(m, 'ganesh_immersion_point', 'Say goodbye to our Ganesh.', { r: 40 });
      beside('immu');
      await talk(m, [
        ['crowd', '*Ganpati Bappa Morya! Agle baras jaldi aana!*'],
        ['immu', '(to the lake) *Ganpati Bappa, agle baras jaldi aana!*'],
        ['chinnu', '(quietly, not to the lake) You also.', 'sad'],
      ]);
      await rec(m);
      // 5. next evening: the boat to the Buddha (W7: the boatman rows, the player may steer)
      await m.jumpTo([2003, 9, 10, 17, 30], { fx: 'ff' });
      music(m, null);
      if (F().s2_limp) { try { N.player.clearStatus('limp'); } catch (e) { /* ignore */ } F().s2_limp = false; }
      npc(m, 'boatman', near('lumbini_jetty', 10, -4), { idle: 'stand', talk: false });
      await go(m, 'lumbini_jetty', 'Next evening: take the boat from Lumbini jetty to the Buddha.', { r: 26 });
      m.checkpoint('boat');
      await m.say('boatman', 'To Buddha-*ji*? Sit *hallu*. He\'s in no hurry.');
      await boatToBuddha(m);
      await talk(m, [
        ['immu', 'Uncle, how many stones is he made of?'],
        ['boatman', 'One. One single block of white granite, from near Bhongir. Like a good friend: one piece.'],
      ]);
      lockDigit(m, 4, 1);
      toast('Frame F07 from the boat: "The man in the lake."', 2600);
      await boatBack(m);
    },
    onPass() { F().boats_open = true; if (F().lock_4 == null) { F().lock_4 = 1; F().riddle_4 = true; } },
  };
  /** M10 W7 (systems §3.7; A3: boats are rowed by the boatman, Chinnu rides as a passenger through
   *  N.vehicles.ride): board at the jetty, one loop round the Buddha at ~64 u, then back to the jetty. */
  function waterNear(pt, r0) {
    for (let r = r0 || 10; r < 220; r += 8) for (let a = 0; a < TAU; a += TAU / 24) {
      const x = pt.x + Math.cos(a) * r, y = pt.y + Math.sin(a) * r;
      if (N.world.isWater(x, y) && !N.world.collide(x, y, 8, 'boat').hit) return { x, y };
    }
    return null;
  }
  async function boatToBuddha(m) {
    const p = N.player, bud = placeOf('buddha_statue'), jet = placeOf('lumbini_jetty');
    if (!bud || !jet || isFF(m) || !N.vehicles) return;
    const wp = waterNear(jet);
    if (!wp) return;
    const boat = m.vehicle('boat', wp.x, wp.y, Math.atan2(bud.y - wp.y, bud.x - wp.x), {});
    if (!boat) return;
    try { if (npcGet('boatman') && N.npcs.ride) N.npcs.ride('boatman', boat); } catch (e) { N.err('story2.boatman', e); }
    if (!boat.driver) { const d = npc(m, 'boatman', wp, { idle: 'stand', talk: false }); if (d) { try { N.npcs.ride('boatman', boat); } catch (e) { /* ignore */ } } }
    m.objective(subst('Get in the boat.'));
    dbgTarget(boat); onEnd(m, () => dbgTarget(null));
    const board = () => {
      try {
        if (N.vehicles.ride && boat.driver) N.vehicles.ride(p, boat, { as: 'passenger', force: true, lock: true });
        else N.vehicles.enter(p, boat);
      } catch (e) { N.err('story2.boat', e); }
    };
    await m.until(() => {
      if (p.vehicle === boat) return true;
      if (Math.hypot(p.x - boat.x, p.y - boat.y) < 44 && N.interact && N.interact.offer) N.interact.offer({ label: 'Get in the boat', priority: 7, dist: 0, use: board });
      return false;
    });
    dbgTarget(null);
    const imm = npcGet('immu'); if (imm) { imm.hidden = true; onEnd(m, () => { const a = npcGet('immu'); if (a) a.hidden = false; }); }
    m.objective(subst('The boatman rows round the Buddha.'));
    const R0 = 64, pts = [];
    const a0 = Math.atan2(boat.y - bud.y, boat.x - bud.x);
    for (let i = 1; i <= 10; i++) {
      const a = a0 + (i / 10) * TAU * 0.92;
      let x = bud.x + Math.cos(a) * R0, y = bud.y + Math.sin(a) * R0;
      for (let k = 0; k < 6 && (!N.world.isWater(x, y) || N.world.collide(x, y, 9, 'boat').hit); k++) { x = bud.x + Math.cos(a) * (R0 + 16 * (k + 1)); y = bud.y + Math.sin(a) * (R0 + 16 * (k + 1)); }
      pts.push([x, y]);
    }
    const playerDrives = boat.driver === p;
    if (playerDrives) boat.autopilot = true;
    try { N.vehicles.driveTo(boat, [[boat.x, boat.y]].concat(pts), { speed: 40 * TUNE.escortSpeed, r: 22, road: false, warp: false, stop: true }); } catch (e) { N.err('story2.row', e); }
    onEnd(m, () => { boat.autopilot = false; try { N.vehicles.stopDriving(boat); } catch (e) { /* ignore */ } });
    let swept = 0, lastA = a0;
    await m.until(() => {
      const a = Math.atan2(boat.y - bud.y, boat.x - bud.x);
      if (Math.hypot(boat.x - bud.x, boat.y - bud.y) < 200) swept += Math.abs(U.angleDiff(lastA, a));
      lastA = a;
      return swept > TAU * 0.8 || (!boat.drive && swept > TAU * 0.4);
    }, { timeout: 120 });
    m.boatV = boat;
  }
  async function boatBack(m) {
    const p = N.player, boat = m.boatV, jet = placeOf('lumbini_jetty');
    if (!boat || !jet || isFF(m)) { if (p.vehicle && N.vehicles) { try { N.vehicles.exit(p, true); } catch (e) { /* ignore */ } } return; }
    m.objective(subst('Back to the jetty.'));
    const w = waterNear(jet);
    try { if (w) N.vehicles.driveTo(boat, [[boat.x, boat.y], [w.x, w.y]], { speed: 44 * TUNE.escortSpeed, r: 16, road: false, stop: true }); } catch (e) { /* ignore */ }
    await m.until(() => !boat.drive || Math.hypot(boat.x - jet.x, boat.y - jet.y) < 60, { timeout: 40 });
    boat.autopilot = false;
    if (p.vehicle === boat) { try { N.vehicles.exit(p, true); } catch (e) { N.err('story2.boat.exit', e); } }
    if (p.vehicle) { try { N.vehicles.exit(p, true); } catch (e) { /* ignore */ } }
    const f = free(jet.x, jet.y);
    if (Math.hypot(p.x - jet.x, p.y - jet.y) > 80) p.teleport(f.x, f.y);
    const imm = npcGet('immu'); if (imm) { imm.hidden = false; beside('immu'); }
  }

  /* ================================================================== the Interlude: "Side A ■ Paused" (Sat 1 Nov 2003) */
  async function interludeScene(sc) {
    const p = N.player;
    await sc.wait(0.2);
    await sc.jumpTo([2003, 11, 1, 19, 40], { fx: 'ff' });
    const h = near('home', 6, 16) || placeOf('home');
    if (h) { p.teleport(h.x, h.y); if (N.render.snapCamera) N.render.snapCamera(); }
    npc(sc, 'immu', near('home', 26, 18), { idle: 'stand', talk: false });
    await sc.cutscene([{ type: 'card', title: 'SAT 1 NOV 2003', sub: 'The air smells of haleem from far away.', ms: 3400 }]);
    await talk(sc, [
      ['immu', '(at the window) Agent Chinnu. Tickets came. Thursday the twenty-seventh. Night flight, Begumpet. Over?'],
      ['chinnu', '...'],
      ['immu', 'Over?'],
      ['chinnu', 'I\'m not recording any more.', 'sulk'],
      ['immu', 'Why?'],
      ['chinnu', 'If the tape gets full, you go. If it doesn\'t get full...', 'sulk'],
      ['immu', 'That\'s not how planes work, Chinnu.'],
    ]);
    const c = await sc.choice('chinnu', '...', ['Then we finish the tape.', 'Then the tunnel. I\'ll help you hide. Properly.'], { default: 0 });
    if (c === 0) await sc.say('chinnu', 'Then we fin— (he stops. He can\'t say it.) ...No. Then the tunnel.', { mood: 'sad' });
    await talk(sc, [
      ['chinnu', 'The tunnel. Chand Raat. I\'ll help you hide. Properly. Biscuits AND a torch.'],
      ['immu', '...*Pakka?*'],
      ['chinnu', '*Pakka.*'],
    ]);
    await sc.cutscene([
      { type: 'text', lines: ['Chinnu presses ■ STOP on the 2-in-1. The counter freezes at 812.'], ms: 3200 },
      { type: 'sfx', name: 'tape_stop' },
      () => { try { N.tape.setCounter(Math.max(812, N.tape.counter)); N.tape.pause(true); } catch (e) { N.err('story2.pause', e); } },
      { type: 'osd', text: '■ PAUSED', sub: 'SIDE A 812', ms: 1800 },
    ]);
    try { if (!N.tape.paused) { N.tape.setCounter(Math.max(812, N.tape.counter)); N.tape.pause(true); } } catch (e) { /* ignore */ }
    despawn('immu');
    // Ayesha at the colony gate (a bark that plays once; then M11's giver appears)
    const ay = npc(sc, 'ayesha', near('playground_1', -30, -26), { idle: 'stand', talk: false });
    if (ay) await go(sc, ay, 'Ayesha is at the colony gate.', { r: 30 });
    await talk(sc, [
      ['ayesha', 'We\'re moving to Tolichowki in December. Eight kilometres. Ammi cried for a week.'],
      ['chinnu', 'Eight kilometres is nothing.'],
      ['ayesha', 'Then why is Immu\'s eight thousand a problem?'],
      ['chinnu', 'It\'s different.'],
      ['ayesha', 'It\'s not. It\'s just more bus tickets.'],
    ]);
    F().ayesha_moving = true;
    F().interlude_done = true;
  }

  /* ================================================================== M11 last_bell — Last Bell */
  const M11 = {
    id: 'last_bell', kind: 'main', requires: ['agle_baras'],
    when: () => !!F().interlude_done,
    giver: { place: 'school_1', r: 18 },
    reward: { money: 1000 },
    async script(m) {
      music(m, 'day');
      variant('chinnu', 'school');
      try { if (N.npcs && N.npcs.applyPlayerLook) N.npcs.applyPlayerLook(); } catch (e) { /* ignore */ }
      onEnd(m, () => { variant('chinnu', null); try { if (N.npcs && N.npcs.applyPlayerLook) N.npcs.applyPlayerLook(); } catch (e) { /* ignore */ } });
      try { if (N.tape && !N.tape.paused && !N.tape.has('last_bell')) N.tape.pause(true); } catch (e) { /* ignore */ }
      companion(m, 'immu', near('school_1', 12, 10));
      // 1. the slam book
      npc(m, 'stationery_man', near('stationery_1', 6, -6), { idle: 'work', talk: false });
      await go(m, 'stationery_1', 'Immu\'s last day. Buy a slam book.', { r: 24 });
      await talk(m, [
        ['stationery_man', 'Slam book? Twenty-five rupees. "Your crush (optional)" page also there.'],
        ['chinnu', 'We\'ll skip that page.'],
      ]);
      m.money(-2500);
      m.give('slam_book', { name: 'A slam book' });
      // 2. fill it before the last bell (VII-B)
      npc(m, 'vimala_maam', near('school_1', -10, 6), { idle: 'stand', talk: false });
      npc(m, 'ayesha', near('school_1', 14, 14), { idle: 'stand', talk: false });
      await go(m, 'school_1', 'Fill the slam book before the last bell.', { r: 30 });
      m.checkpoint('school');
      await talk(m, [
        ['vimala_maam', 'Imran, your diary was the only one with no lies in it. Very boring. I will miss it.'],
        ['vimala_maam', 'And {FULL}. Your diary has a boy who flew over forty roofs. One true line before December, *beta*.'],
        ['ayesha', '(writing) Fav place: the crease. Fav person: whoever doesn\'t call me *doodh-bhaat*.'],
        ['immu', '(writing in Chinnu\'s book) Fav place: where you can see everything we collected at once.'],
      ]);
      sfx('school_bell');
      if (!isFF(m) && N.tape && N.tape.rec) await ext(m, N.tape.rec('last_bell_school_bell', { decline: true, window: 2.2, sfx: 'school_bell', label: '● REC?', token: false }));
      await m.say('chinnu', 'Not this one.');
      // 3. email ids at Cyber Zone (₹20 an hour; the 60 s timer never fails)
      npc(m, 'net_uncle', near('internet_cafe_1', 6, -6), { idle: 'work', talk: false });
      await go(m, 'internet_cafe_1', 'Make email IDs at Cyber Zone (₹20 an hour).', { r: 24 });
      m.checkpoint('net_cafe');
      m.money(-2000);
      sfx('dialup');
      const T = softTimer(m, 'CYBER ZONE', TUNE.netSecs); T.beep = true;
      await talk(m, [
        ['net_uncle', 'One hour, twenty rupees. Timer is on. Don\'t open any "You have won a lottery" email.'],
        ['immu', 'Username: agent_immu_2003. Password: bokaata.'],
        ['chinnu', 'You can\'t tell me your password!'],
        ['immu', 'You\'re my agent. Agents share passwords.'],
        ['chinnu', '(typing) chinnu_charminar... it\'s taken? Who else is Chinnu Charminar?!'],
        ['net_uncle', 'Fifty-nine minutes. No chat rooms. Emails, yes.'],
        ['immu', 'Now I can write to you from New Jersey. Ten and a half hours late, but I\'ll write.'],
      ]);
      m.flag('s2_email', emailOf());
      const sent = await Promise.race([
        useAt(m, 'internet_cafe_1', 'Send Immu a test email: "Agent. Test. Over."', { r: 30 }).then(() => 'sent'),
        m.until(() => T.left <= 0).then(() => 'time'),
      ]);
      if (sent === 'time') {
        const c = await m.choice('net_uncle', 'Time up. Twenty rupees more, *beta*?', ['Pay ₹20 more', 'Leave'], { default: 1 });
        if (c === 0) { m.money(-2000); toast('Sent: "Agent. Test. Over."', 2400); }
      } else toast('Sent: "Agent. Test. Over." (' + emailOf() + ' → agent_immu_2003)', 3000);
      T.stop();
      journalNote('emails', 'Inside the slam book\'s back cover: agent_immu_2003 · ' + emailOf());
      // 4. one passport photo, two boys
      npc(m, 'photo_uncle', near('photo_studio_1', 6, -6), { idle: 'work', talk: false });
      await go(m, 'photo_studio_1', 'Squeeze into one passport photo at Raj Colour Lab.', { r: 24 });
      await m.say('photo_uncle', 'Sit straight, chin up, *thoda left*... No laughing in passport photos!');
      sfx('camera_flash');
      await m.say('photo_uncle', 'Arre, both laughing. Again. ...Again. ...Fine. Laughing it is. Ready day after tomorrow.');
      sfx('camera_flash');
      m.flag('passport_photo', true);
      // 5. tunnel supplies (the wrong choice, made actively)
      npc(m, 'agarwal', near('kirana_1', 6, 8), { idle: 'work', talk: false });
      await go(m, 'kirana_1', 'Buy tunnel supplies: a torch and Osmania biscuits.', { r: 24 });
      await talk(m, [
        ['agarwal', 'Torch? Batteries separate. For what?'],
        ['chinnu', '...Power cuts.'],
        ['agarwal', 'Smart boy. Your Nanna\'s department, power cuts.'],
      ]);
      m.money(-2000); m.give('torch', { name: 'A torch' });
      npc(m, 'salim', near('irani_cafe_7', 6, -6), { idle: 'work', talk: false });
      await go(m, 'irani_cafe_7', 'Buy tunnel supplies: Osmania biscuits at Café Gulistan.', { r: 24 });
      await talk(m, [
        ['salim', 'Osmania to take away? Going on a journey, chhote?'],
        ['chinnu', 'Not me.'],
      ]);
      m.money(-1000); m.give('osmania_packet', { name: 'A packet of Osmania biscuits' });
      // 6. Naubat Pahad at sunset with Ammamma (W8 up the steps, respect; W6 every REC place lights up)
      await m.jumpTo([2003, 11, 21, 17, 30], { fx: 'ff' });
      const steps = roadPts('birla_mandir_steps') || [];
      const foot = steps.length ? free(steps[0].x, steps[0].y) : near('flower_cart_11', 0, -10);
      await ride(m, 'flower_cart_11', { mode: 'auto', label: 'YADAGIRI-ANNA\'S AUTO → NAUBAT PAHAD', at: () => foot });
      m.checkpoint('naubat_pahad');
      m.meter('frozen');
      npc(m, 'ammamma', { x: foot.x + 10, y: foot.y }, { idle: 'stand', talk: false });
      toast('Chappals at the stand by the flower cart. Walk only.', 2800);
      const lab = 'Take Ammamma up Naubat Pahad at sunset.';
      m.objective(subst(lab));
      let met = false;
      await escort(m, 'ammamma', steps.slice(1).concat([placeOf('birla_mandir')].filter(Boolean)), {
        r: TUNE.escortR, speed: 30, label: lab, warn: 'Stay with Ammamma',
        onStep: (frac, a) => {
          if (!met && frac >= 0.25) {
            met = true;
            npc(m, 'immu', { x: a.x - 18, y: a.y + 14 }, { idle: 'stand', talk: false });
            follow('immu', npcGet('ammamma') || N.player, { dist: 18, side: 'left', ride: false });
            return talk(m, [
              ['immu', '(catching up) Planetarium uncle says New Jersey has the same stars. Ten and a half hours late.'],
              ['ammamma', 'Then you will see them first, *kanna*, and tell us if they are fine.'],
            ]);
          }
          return null;
        },
      });
      // the parapet: the whole map dims and every place where Chinnu pressed REC lights up
      music(m, null);
      const tracks = (N.tape && N.tape.tracks) || [];
      let li = 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const tr of tracks) {
        const q = tr.place && placeOf(tr.place);
        if (!q) continue;
        prop(m, 's2:rec:' + li++, { x: q.x, y: q.y, draw: PAINT.recLight, layer: 'screen', sort: 12, margin: 4000 });
        x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
      }
      prop(m, 's2:dim', { pos: () => ({ x: N.render.cam.x, y: N.render.cam.y }), alpha: 0.55, draw: (ctx) => PAINT.dim(ctx, { alpha: 0.55 }), layer: 'screen', sort: 10 });
      const bm = placeOf('birla_mandir');
      // the camera pulls out until the whole Side A fits: the full map, dimmed, with every REC place lit
      const fit = isFinite(x0) && N.render.W ? clamp(Math.min(N.render.W / (x1 - x0 + 500), N.render.H / (y1 - y0 + 400)), 0.08, 0.45) : 0.3;
      const ctr = isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : bm;
      await m.cutscene([camSteps(ctr || 'birla_mandir', fit, 2400), { type: 'wait', ms: 2600 }, { type: 'text', lines: [li + ' lights: every place on Side A, all at once.'], ms: 2600 }]);
      unprop('s2:dim');
      await viewpoint(m, 'birla_mandir', { camera: false });
      await talk(m, [
        ['ammamma', 'Listen. What do you hear?'],
        ['chinnu', 'Nothing. Wind. Traffic, far away.'],
        ['ammamma', 'No bells. They built this temple without bells, so it stays quiet.'],
      ]);
      for (;;) {
        const c = await m.choice('narrator', '"On the drum hill a white temple stands. How many bells?"', ['0', '1', '4', '108'], { default: 0 });
        if (c === 0) break;
        await m.say('narrator', 'Count again, walk round it.');
      }
      lockDigit(m, 3, 0);
      journalNote('fourteen_one', 'Fourteen-one?');
      await talk(m, [
        ['ammamma', 'Your Immu is going, *haa*?'],
        ['chinnu', 'Ammamma, I\'m going to help him hide. In the tunnel. On Chand Raat. He won\'t have to go.'],
        ['ammamma', 'Kite string, *kanna*. Pull too hard, it snaps. Let it go a little, it flies higher.'],
        ['chinnu', 'If I let go, he\'s gone.'],
        ['ammamma', 'If you let go, he flies. And a kite that flies high, the whole city can see. Even from America.'],
      ]);
      await m.cutscene([{ type: 'text', lines: ['(a long silence; the lights of the map below)'], ms: 3000 }]);
      await talk(m, [
        ['chinnu', 'Ammamma... can I record here? There\'s no bell.'],
        ['ammamma', 'Record the wind, *kanna*. God won\'t mind the wind.'],
      ]);
      await rec(m);
      m.meter('normal');
    },
    onPass() { setTimeout(() => toast('Mon 24 Nov: a cassette drops through the window. Immu\'s last tape. (Chand Raat, home)', 4600), 4600); },
  };

  /* ================================================================== M12 chand_raat — Chand Raat (THE FINALE AT CHARMINAR) */
  const LV5 = {
    amma: ['{FULL}!', '*Intiki raa!* NOW!', 'Wait till your Nanna hears!', 'One more step and this chappal flies!', '*Ekkada?* EKKADA?!'],
    ammi: ['{nick}! I can see your chappals under that shop!', '*Kya karre* you two?!', 'I teach maths. I can calculate where you\'ll run.'],
  };
  function setMeter(n) { try { if (N.wanted && has(N.wanted, 'set')) N.wanted.set(n, 'chand_raat'); else if (N.wanted) N.wanted.level = n; } catch (e) { N.err('story2.wanted', e); } }
  function meterLevel() { return (N.wanted && N.wanted.level) | 0; }
  /** Ask the city (bible §1.6 tier 4): the first two locals deflect, the third answers in their own voice. */
  async function askTheCity(m) {
    const ANSWER = 'Four towers, four clocks? Charminar, *beta*. Go up and look. Say Patang Chacha sent you.';
    const locals = [
      { key: 'm12_bangle', id: 'bangle_man', at: near('laad_bazaar', 18, 12), deflect: 'Four towers? *Mian*, I sell bangles, not towers. Ask the clock man.' },
      { key: 'm12_attar', id: 'attar_man', at: near('pathergatti', -14, 16), deflect: 'Time? Smell this: timeless. Rose attar. ...Towers? Ask the kite man.' },
      { key: 'm12_bird', id: 'bird_man', at: near('mahboob_chowk_clock_tower', 12, 10), deflect: 'Mahboob Chowk has ONE clock tower, *beta*. You want four? Count again.' },
      { key: 'm12_chacha', id: 'kite_chacha', at: near('patang_bazaar', 10, 12), deflect: '*Saddi mazboot*. Won\'t snap in a *pech*.',
        answer: ['Four towers, four clocks: Charminar, *beta*. Every tunnel story in this city starts there.', 'Go up and look. Tell the caretaker Patang Chacha sent you. He owes me a kite.'] },
      { key: 'm12_chai', id: 'waiter', at: near('chai_bandi_4', 8, -8), deflect: 'Score? Ask the radio. I\'m counting.' },
    ];
    const asked = new Set();
    let answered = false, busy = false;
    for (const L of locals) {
      if (!L.at) continue;
      npc(m, L.id, L.at, {
        key: L.key, idle: 'stand', label: 'Ask about four towers',
        talk: async () => {
          if (busy || answered) { if (answered) await N.dialogue.say(L.id, L.answer ? L.answer[1] : 'Go up and look, *beta*.'); return; }
          busy = true;
          try {
            const first = !asked.has(L.key);
            if (first) asked.add(L.key);
            if (first && asked.size >= 3) {
              answered = true;
              if (L.answer) await N.dialogue.play(L.answer.map((t) => ({ s: L.id, t })));
              else await N.dialogue.say(L.id, ANSWER);
              try { if (N.hints && N.hints.solve) N.hints.solve('chand_raat'); } catch (e) { /* ignore */ }
            } else await N.dialogue.say(L.id, L.deflect, { mood: 'wink' });
            if (!answered) toast('Asked ' + asked.size + ' of 3. Someone in the Old City knows.', 1800, 'askcity');
          } finally { busy = false; }
        },
      });
    }
    try { if (N.hints && N.hints.start) N.hints.start('chand_raat', { clue: CLUE_TUNNEL, answer: 'charminar', name: 'Charminar' }); } catch (e) { /* ignore */ }
    m.objective(subst('Immu has vanished. Find him before the mothers find YOU. Ask the city: "four towers keep time"?'));
    const blips = locals.filter((L) => L.at).map((L) => m.blip(npcGet(L.key) || L.at, { color: '#f2c230', icon: 'dot', label: 'Ask', route: false, edge: false }));
    if (isFF(m)) answered = true;
    dbgTarget(() => { const L = locals.find((q) => q.at && !asked.has(q.key)); return L ? npcGet(L.key) || L.at : null; });
    onEnd(m, () => dbgTarget(null));
    await m.until(() => answered && !busy && !(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()));
    for (const b of blips) m.unblip(b);
    dbgTarget(null);
    m.flag('m12_asked', true);
  }
  /** M12 step 3: from the first gallery, pan the camera and mark the yellow raincoat ducking into Café Noor-e-Iran. */
  async function galleryPan(m) {
    const gal = placeOf('charminar_gallery') || placeOf('charminar'), cafe = placeOf('irani_cafe_19');
    if (!gal || !cafe || isFF(m)) return;
    const R = N.render, p = N.player;
    const plaza = placeOf('charminar_plaza') || gal;
    const coat = { x: plaza.x, y: plaza.y, t: 0, draw: PAINT.raincoat, layer: 'sky', sort: 4, margin: 200 };
    prop(m, 's2:raincoat', coat);
    const door = free(cafe.x, cafe.y + 10);
    const cam = { x: gal.x, y: gal.y, zoom: 0.6, rate: 3 };
    const prevLock = !!p.controlsLocked;
    p.controlsLocked = true;
    R.camOverride = cam;
    onEnd(m, () => { if (R.camOverride === cam) R.camOverride = null; p.controlsLocked = prevLock; });
    m.objective(subst('From the gallery: find the yellow raincoat. (Look around with the arrows; E to mark it.)'));
    S2.gallery = { cam, coat };
    onEnd(m, () => { S2.gallery = null; });
    let t0 = nowT(), last = t0, marked = false;
    await m.until(() => {
      const t = nowT(), dt = Math.min(0.1, t - last); last = t;
      const k = clamp((t - t0) / 7, 0, 1);
      coat.x = U.lerp(plaza.x, door.x, k); coat.y = U.lerp(plaza.y, door.y, k);
      if (mode() !== 'play') return false;
      const I = N.input, mv = (I && I.move) || { x: 0, y: 0 };
      cam.x += mv.x * 260 * dt; cam.y += mv.y * 260 * dt;
      if (t - t0 > TUNE.galleryFind) { cam.x = U.lerp(cam.x, coat.x, Math.min(1, dt * 1.5)); cam.y = U.lerp(cam.y, coat.y, Math.min(1, dt * 1.5)); }
      const dd = Math.hypot(cam.x - coat.x, cam.y - coat.y);
      if (dd < 90) {
        if (!coat.seen) { coat.seen = true; toast('A yellow raincoat! E: mark it.', 2600, 'mark'); }
        if (I && I.pressed('action')) { I.consume('action'); marked = true; }
      }
      return marked;
    });
    S2.gallery = null;
    sfx('ui_select');
    m.blip('irani_cafe_19', { color: '#f2c230', icon: 'star', label: 'The yellow raincoat went in here', pulse: true, route: true });
    toast('Marked: Café Noor-e-Iran. A yellow raincoat, the side door.', 2600);
    R.camOverride = null;
    p.controlsLocked = prevLock;
  }
  /** The respect zones round the chase (by distance from the café), and the pursuers' buffer: 40 u round a
   *  masjid or any other faith zone; Charminar's interior (its top-floor mosque) only up to its walls, since
   *  the chase runs across the plaza right round it (bible M12: "chases stay in the bazaar lanes and plaza"). */
  function respectDist(x, y, z) { try { return N.respect && N.respect.distance ? N.respect.distance(x, y, z) : Infinity; } catch (e) { return Infinity; } }
  function chaseZones(c, r) { try { return (N.respect && N.respect.zones || []).filter((z) => respectDist(c.x, c.y, z) < r); } catch (e) { return []; } }
  function chaseBuffer(x, y, zones) {
    let best = null;
    for (const z of zones) {
      const d = respectDist(x, y, z), buf = z.kind === 'charminar' ? 6 : TUNE.respectBuffer;
      if (d <= buf && (!best || d < best.d)) best = { zone: z, d };
    }
    return best;
  }
  /** M12 step 4 (W1): both mothers at level 5, the homing chappal, the masjid gates held by watchmen.
   *  Resolves 'escaped' (reached the café) or 'caught' (PAKDA GAYA: the scene plays on). */
  async function chandRaatChase(m) {
    const p = N.player, cafe = placeOf('irani_cafe_19');
    if (!cafe || isFF(m)) return 'escaped';
    // the calm crowd and a watchman at both mosque gates (walk-up only; nobody runs in)
    const gates = [];
    for (const id of ['mecca_masjid', 'jama_masjid_charminar']) {
      const g = zoneGate(id) || near(id, 0, 30);
      if (!g) continue;
      gates.push({ id, g });
      npc(m, 'watchman', g, { key: 's2_watch_' + id, idle: 'stand', talk: '*Shant ho ke aao, beta.*' });
      for (let i = 0; i < 2; i++) npc(m, 'uncle', free(g.x + (i ? 14 : -14), g.y + 8), { key: 's2_pray_' + id + i, idle: 'stand', talk: false });
    }
    variant('amma', 'chappal');
    onEnd(m, () => variant('amma', null));
    const czones = chaseZones(cafe, 700);
    // the mothers (and Pasha) start in the lanes behind him, never inside a masjid's buffer
    const clearOf = (q) => {
      if (!q || !chaseBuffer(q.x, q.y, czones)) return q;
      for (let r = 12; r <= 240; r += 12) for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, f = free(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r);
        if (f && !chaseBuffer(f.x, f.y, czones) && !respectAt(f.x, f.y)) return f;
      }
      return q;
    };
    const away = (d) => { const a = Math.atan2(p.y - cafe.y, p.x - cafe.x); return clearOf(free(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d)); };
    const ms = [
      { key: 'amma', speed: TUNE.mumSpeed, at: away(110), lines: LV5.amma, first: '(level 5, the chappal raised) {FULL}! Stop RIGHT there!', barkT: 1 },
      { key: 'ammi', speed: TUNE.ammiSpeed, at: (() => { const q = away(100); return clearOf(free(q.x + 50, q.y - 40)); })(), lines: LV5.ammi, first: '{nick}! I can see you behind that bangle shop!', barkT: 3.5 },
    ];
    for (const M0 of ms) { npc(m, M0.key, M0.at, { idle: 'stand', talk: false }); M0.job = null; M0.wait = false; M0.last = null; }
    const pa = npc(m, 'pasha', away(140), { idle: 'stand', talk: false });
    npc(m, 'babloo', away(150), { key: 'babloo', idle: 'stand', talk: false });
    if (pa) { follow('pasha', p, { dist: 40, side: 'behind', ride: false }); bark('pasha', 'The boy knows the entrance!'); }
    const bhatti = near('charminar_plaza', -60, 40) || placeOf('charminar_plaza');
    m.objective(subst('Get to Café Noor-e-Iran without getting caught.'));
    const cb = m.blip('irani_cafe_19', { color: PINK, icon: 'star', label: 'Café Noor-e-Iran', route: true });
    const ch = { t: TUNE.chappalEvery, fly: null, wind: 0, by: null };
    dbgTarget(cafe); S2.chase = { ms, gates, ch, zones: czones.map((z) => z.id) };
    onEnd(m, () => { dbgTarget(null); S2.chase = null; });
    prop(m, 's2:chappal', { pos: () => ch.fly, draw: PAINT.chappal, sort: 6, margin: 40 });
    let last = nowT(), t0 = last, pashaGone = false, result = null, whoCaught = null, shantT = 0, dodged = false;
    const caught = (by) => { whoCaught = by; result = 'caught'; };
    result = await m.until(() => {
      const t = nowT(), dt = Math.min(0.1, t - last); last = t;
      if (result) return result;
      if (mode() !== 'play') return false;
      // Pasha follows too, until Babloo sends him to the haleem bhatti
      if (!pashaGone && t - t0 > 9 && npcGet('pasha')) {
        pashaGone = true;
        bark('babloo', 'Mamu! Tunnel entrance! Near the haleem bhatti!', { secs: 3 });
        follow('pasha', null);
        if (bhatti) walk(m, 'pasha', bhatti, { run: true, speed: 60 }).then(() => bark('pasha', '(stopping at the bhatti, sniffing) ...One plate. For research.', { secs: 3.5 }));
      }
      // the mosque compounds are closed to a boy being chased: a soft wall and a watchman's line
      const z = respectAt(p.x, p.y);
      if (z && z.kind === 'mosque' && z.part === 'compound') {
        const g = (gates.find((q) => q.id === z.place) || {}).g || (z.gate && free(z.gate.x, z.gate.y));
        const out = g && outsideCompound(g, p);
        if (out) { p.teleport(out.x, out.y); p.vx = p.vy = 0; }
        if (t - shantT > 3) { shantT = t; bark('s2_watch_' + (z.place || ''), '*Shant ho ke aao, beta.*', { speaker: 'watchman', secs: 2.6 }); toast('*Shant ho ke aao, beta.* (Come back calm.)', 2000, 'shant'); }
      }
      const inRespect = !!respectAt(p.x, p.y);
      // the mothers
      for (const M0 of ms) {
        const a = npcGet(M0.key);
        if (!a) continue;
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        M0.barkT -= dt;
        if (M0.barkT <= 0 && d < 260) { M0.barkT = 5 + Math.random() * 3; const line = M0.first || (U.pick ? U.pick(M0.lines) : M0.lines[0]); M0.first = null; bark(M0.key, line, { secs: 2.8 }); }
        const nz = chaseBuffer(a.x, a.y, czones);
        // pursuers never path within 40 u of a masjid (Charminar's own interior: only up to its walls). With
        // the boy inside a zone they stop where they are and wait, arms folded; inside the buffer they only
        // keep coming while he is heading away from it (so they never close in on a gate)
        const holdBack = inRespect || (nz && !respectAt(a.x, a.y) && respectDist(p.x, p.y, nz.zone) < nz.d + 2);
        if (holdBack) {
          if (M0.job) { stopNpc(M0.key); M0.job = null; }
          if (nz && M0.last) { a.x = M0.last.x; a.y = M0.last.y; a.vx = a.vy = 0; }
          if (!M0.wait) { M0.wait = true; emote(M0.key, '...', 2.5); }
          continue;
        }
        if (M0.wait && M0.job) { stopNpc(M0.key); M0.job = null; }
        if (!nz) M0.last = { x: a.x, y: a.y };
        M0.wait = false;
        if (!M0.job) {
          const tok = {};
          M0.job = tok;
          walk(m, M0.key, 'player', { run: true, speed: M0.speed, r: TUNE.catchR }).then(() => { if (M0.job === tok) M0.job = null; });
        }
        if (d < TUNE.catchR && !inRespect) { caught(M0.key); return result; }
      }
      // the homing chappal (systems §4.9): every 6 s, line of sight, within 150 u; a late sideways dodge works
      if (!inRespect) {
        if (!ch.fly && !ch.wind) {
          ch.t -= dt;
          if (ch.t <= 0) {
            let best = null, bd = TUNE.chappalRange;
            for (const M0 of ms) { const a = npcGet(M0.key); if (!a) continue; const d = Math.hypot(a.x - p.x, a.y - p.y); let los = true; try { const rc = N.world.raycast(a.x, a.y, p.x, p.y, 'walk'); los = !rc || !rc.hit; } catch (e) { los = true; } if (d < bd && los) { bd = d; best = a; } }
            if (best) { ch.wind = 0.4; ch.by = best; sfx('chappal_whoosh', { x: best.x, y: best.y }); bark(best.key, best.key === 'amma' ? 'One more step and this chappal flies!' : '*Kya karre* you two?!', { secs: 1.6 }); }
            ch.t = TUNE.chappalEvery;
          }
        } else if (ch.wind) {
          ch.wind -= dt;
          if (ch.wind <= 0) { ch.wind = 0; const a = ch.by; if (a) { ch.fly = { x: a.x, y: a.y, h: 8, ang: Math.atan2(p.y - a.y, p.x - a.x), t: 0, spin: 0 }; dodged = false; sfx('chappal', { x: a.x, y: a.y }); } }
        } else if (ch.fly) {
          const f = ch.fly;
          f.t += dt;
          if (f.landed) { if (f.t > f.landed + 3) ch.fly = null; }
          else {
            const want = Math.atan2(p.y - f.y, p.x - f.x), rate = f.t < 0.6 ? 2.0 : 0.8;
            f.ang += clamp(U.angleDiff(f.ang, want), -rate * dt, rate * dt);
            f.x += Math.cos(f.ang) * TUNE.chappalSpeed * dt; f.y += Math.sin(f.ang) * TUNE.chappalSpeed * dt;
            f.h = 6 + 24 * Math.sin(Math.PI * clamp(f.t / TUNE.chappalLife, 0, 1)); f.spin += dt * 14;
            const dd = Math.hypot(f.x - p.x, f.y - p.y);
            if (dd < (p.vehicle ? 12 : TUNE.chappalHit)) { caught((ch.by && ch.by.key) || 'amma'); N.emit('chappal:hit', {}); return result; }
            if (dd < 20 && !dodged) { dodged = true; toast('DODGE!', 900, 'dodge'); }
            if (f.t >= TUNE.chappalLife) { f.landed = f.t; f.h = 0; if (dodged) { bark('player', 'Missed! ...She never misses twice.', { speaker: 'chinnu', secs: 2 }); N.emit('chappal:dodge', {}); } }
          }
        }
      }
      // escaped: the café door
      if (Math.hypot(p.x - cafe.x, p.y - cafe.y) < 24) { result = 'escaped'; return result; }
      return false;
    });
    m.unblip(cb);
    dbgTarget(null); S2.chase = null;
    for (const M0 of ms) { stopNpc(M0.key); }
    ch.fly = null;
    if (result === 'caught') {
      sfx('busted');
      N.emit('busted', { by: whoCaught, x: p.x, y: p.y, story: 'chand_raat' });
      try { N.hud.banner('PAKDA GAYA!', 'The mothers march you to the café.', 1800, { kind: 'busted' }); } catch (e) { /* ignore */ }
      await m.wait(1.2);
      const f = free(cafe.x - 10, cafe.y + 16);
      p.teleport(f.x, f.y);
      const am = npcGet('amma'), ai = npcGet('ammi');
      if (am) { const q = free(f.x + 12, f.y + 4); am.x = q.x; am.y = q.y; }
      if (ai) { const q = free(f.x - 12, f.y + 6); ai.x = q.x; ai.y = q.y; }
      if (N.render.snapCamera) N.render.snapCamera();
      await m.say(whoCaught === 'ammi' ? 'ammi' : 'amma', 'Show us where he is.', { mood: 'angry' });
    } else {
      despawn('amma'); despawn('ammi');
    }
    follow('pasha', null);
    return result;
  }

  /** The nearest walkable point just outside a compound (the forecourt or the street), seen from its gate. */
  function outsideCompound(gate, from) {
    let dx = gate.x - from.x, dy = gate.y - from.y, L = Math.hypot(dx, dy);
    if (L > 0.5) { dx /= L; dy /= L; for (let d = 6; d <= 60; d += 6) { const x = gate.x + dx * d, y = gate.y + dy * d, q = respectAt(x, y); if ((!q || q.part !== 'compound') && N.world.isWalkable(x, y)) return { x, y }; } }
    for (let r = 6; r <= 80; r += 6) for (let a = 0; a < TAU; a += TAU / 16) { const x = gate.x + Math.cos(a) * r, y = gate.y + Math.sin(a) * r, q = respectAt(x, y); if ((!q || q.part !== 'compound') && N.world.isWalkable(x, y)) return { x, y }; }
    return null;
  }
  const M12 = {
    id: 'chand_raat', kind: 'main', requires: ['last_bell'],
    giver: { place: 'home', r: 16 },
    reward: {},
    onBusted() { F().s2_caught = true; },
    async script(m) {
      music(m, 'oldcity');
      // 0. home: Immu's last tape
      npc(m, 'nanna', near('home', 14, 10), { idle: 'stand', talk: false });
      npc(m, 'amma', near('home', -12, 10), { idle: 'stand', talk: false });
      await talk(m, [
        ['immu_tape', 'Agent Immu to Agent Chinnu. Chand Raat. Both families shopping in Laad Bazaar, seven-thirty.'],
        ['immu_tape', 'At eight o\'clock I vanish. The tunnel starts where four towers keep time.'],
        ['immu_tape', 'Don\'t follow me. ...Okay, follow me. Bring the tin. Over and out.'],
      ]);
      await m.cutscene([{ type: 'text', lines: ['Chinnu takes the tin, the torch and the Osmania packet.'], ms: 2600 }]);
      m.give('the_tin', { name: 'The biscuit tin' });
      await m.say('nanna', 'Frame 24 is left. Chand Raat deserves it.');
      npc(m, 'photo_uncle', near('photo_studio_1', 6, -6), { idle: 'work', talk: false });
      await go(m, 'photo_studio_1', 'Pick up the photos at Raj Colour Lab on the way.', { r: 24 });
      await m.say('photo_uncle', 'Laughing boys, ready. Eight copies. Four each?');
      m.give('passport_photos', { name: 'Eight passport photos (two boys laughing)' });
      // 1. Laad Bazaar with both families
      await ride(m, 'laad_bazaar', { mode: 'nanna', label: 'NANNA\'S CHETAK + YADAGIRI-ANNA\'S AUTO → LAAD BAZAAR', minutes: 30 });
      N.clock.set(19, 30);
      m.checkpoint('laad_bazaar');
      npc(m, 'amma', near('laad_bazaar', 14, 10), { idle: 'stand', talk: false });
      npc(m, 'ammi', near('laad_bazaar', 26, 4), { idle: 'stand', talk: false });
      npc(m, 'nanna', near('laad_bazaar', -18, 14), { idle: 'stand', talk: false });
      npc(m, 'abba', near('laad_bazaar', -26, 6), { idle: 'stand', talk: false });
      npc(m, 'immu', near('laad_bazaar', 8, 22), { idle: 'stand', talk: false });
      npc(m, 'bangle_man', near('laad_bazaar', 20, -12), { key: 'm12_bangle0', idle: 'work', talk: false });
      await talk(m, [
        ['amma', 'Ayesha\'s mother says the green-and-gold bangles are cheapest here.'],
        ['ammi', '"Cheapest" is a lie Laad Bazaar tells every year. Come, I\'ll show you.'],
        ['immu', '(passing Chinnu) Eight o\'clock. (he winks behind his taped glasses)', 'wink'],
        ['bangle_man', '*Aapa*, new design for Eid! Glass that sings!'],
      ]);
      sfx('bangles');
      despawn('m12_bangle0');
      // 2. 20:00: Immu has vanished; a chit; both mothers at level 5
      N.clock.set(20, 0);
      despawn('immu');
      await m.cutscene([
        { type: 'text', lines: ['20:00. A small boy brings the families a chit.'], ms: 2400 },
        { type: 'say', s: 'chit', t: '"Imran is safe and eating biscuits. He comes back at eleven. Don\'t worry. — F."' },
      ]);
      await talk(m, [
        ['ammi', 'Safe? Biscuits? Who is F?!'],
        ['amma', '{nick} knows. Look at his face. He KNOWS.'],
        ['ammi', '{nick}...'],
        ['amma', '{FULL}!!', 'angry'],
      ]);
      m.meter('frozen');
      setMeter(5);
      twoChappals(true);
      onEnd(m, () => { twoChappals(false); setMeter(0); });
      despawn('nanna'); despawn('abba');
      for (const k of ['amma', 'ammi']) { const a = npcGet(k); if (a) { a.idle = 'wander'; a.wanderR = 60; } }
      await askTheCity(m);
      // 3. the first gallery, five minutes
      npc(m, 'caretaker', near('charminar', 0, 46), { idle: 'stand', talk: false });
      await go(m, 'charminar', 'Climb to Charminar\'s first gallery. Five minutes.', { r: 58 });
      m.checkpoint('gallery');
      await talk(m, [
        ['caretaker', 'Chand Raat, galleries are closed... Patang Chacha sent you? Five minutes. First gallery only.'],
        ['caretaker', 'Walk, don\'t run. Upstairs is for prayer; nobody goes there.'],
      ]);
      F().charminar_gallery_open = true;
      await m.cutscene([{ type: 'fade', to: 'black', ms: 500 }, { type: 'text', lines: ['The stone stair turns and turns. The first gallery.'], ms: 1800 }, { type: 'fade', to: 'clear', ms: 500 }]);
      await viewpoint(m, 'charminar_gallery', { camera: false });
      await galleryPan(m);
      F().charminar_gallery_open = false;
      npc(m, 'pasha', near('charminar_plaza', 30, 10), { idle: 'stand', talk: false });
      npc(m, 'babloo', near('charminar_plaza', 40, 16), { idle: 'stand', talk: false });
      await talk(m, [
        ['pasha', 'LIVE from the Charminar tunnel! Camera, roll!'],
        ['caretaker', '(from the gallery) Camera *band karo!* No tunnel, no nonsense!'],
      ]);
      await m.cutscene([{ type: 'fade', to: 'black', ms: 400 }, () => { const f = near('charminar', 0, 52); if (f) N.player.teleport(f.x, f.y); if (N.render.snapCamera) N.render.snapCamera(); }, { type: 'fade', to: 'clear', ms: 400 }]);
      { const f = near('charminar', 0, 52); if (f && Math.hypot(N.player.x - f.x, N.player.y - f.y) > 40) N.player.teleport(f.x, f.y); }
      // 4. the chase (W1): the bazaar lanes and the plaza, never into the masjids
      music(m, 'chase');
      const how = await chandRaatChase(m);
      m.flag('m12_chase', how);
      // 5. find Immu: the biscuit storeroom
      music(m, null);
      try { if (N.audio && N.audio.music) N.audio.music.stop(1.2); } catch (e) { /* ignore */ }
      setMeter(5);
      npc(m, 'faramarz', near('irani_cafe_19', 4, -6), { idle: 'work', talk: false });
      await go(m, 'irani_cafe_19', 'Find Immu.', { r: 26 });
      m.checkpoint('cafe');
      await talk(m, [
        ['faramarz', '*Aa gaye?* Thirty-five minutes. Imran said you\'d take forty.'],
        ['chinnu', 'Where is he, uncle?'],
        ['faramarz', '(nods at the back) The stair that goes to Golconda. One step down.'],
      ]);
      await m.cutscene([{ type: 'text', lines: ['One step down: a bright biscuit storeroom. A tube light, tins to the ceiling, a flour sack.', 'Immu sits on it in his yellow raincoat, eating Osmania.'], ms: 5200 }]);
      await talk(m, [
        ['immu', 'You\'re late, Agent.'],
        ['chinnu', 'You\'re in a biscuit room.'],
        ['immu', 'It\'s a biscuit tunnel. Very short.'],
        ['chinnu', 'There\'s no tunnel, Immu.'],
        ['immu', 'I know.'],
        ['chinnu', 'You knew?'],
        ['immu', 'Since Golconda. The guide said "they say" two times.'],
        ['immu', 'But if I come out, the plane takes me. If I stay, maybe Ammi cries and Abba says okay, stay.'],
      ]);
      let opts = ['Clap him out. Walk back together.', 'Keep the secret. Stay hidden with him.'];
      for (;;) {
        const c = await m.choice('chinnu', '...', opts, { default: 0 });
        if (c === 0) break;
        await m.cutscene([{ type: 'text', lines: ['Chinnu sits down on the flour sack. They eat biscuits. Outside, faintly, Ammi\'s voice: "Imran... beta..."', 'It isn\'t angry any more.'], ms: 5000 }]);
        await talk(m, [
          ['immu', '(looking at the door) ...'],
          ['chinnu', 'Ammamma says: pull too hard, the string snaps.'],
          ['immu', 'Your Ammamma says many things.'],
          ['chinnu', 'Let it go a little, it flies higher.'],
        ]);
        opts = ['Clap him out.'];
      }
      await game(m, 'clap', { skin: 'doorway', rounds: 1, noFail: true, noQuit: true, intro: 'Clap the Golconda rhythm in the storeroom doorway. Immu answers.' });
      npc(m, 'immu', near('irani_cafe_19', 10, 14), { idle: 'stand', talk: false });
      await talk(m, [
        ['chinnu', 'Golconda heard us. America will also hear.'],
        ['immu', '(stands, brushes off crumbs) Walk with me? Till the plaza.'],
        ['chinnu', 'Till the plaza. After that I\'ll walk with you in my head, the rest of the way.'],
      ]);
      // 6. walk Immu back to the plaza (W8, no running; one slipper drains every 5 s side by side)
      follow('immu', N.player, { dist: 12, side: 'right', ride: false });
      N.player.noRun = true;
      onEnd(m, () => { N.player.noRun = false; });
      let dT = 0, lt = nowT();
      const drain = m.until(() => {
        const t = nowT(), dt = Math.min(0.2, t - lt); lt = t;
        const a = npcGet('immu');
        if (mode() === 'play' && a && Math.hypot(a.x - N.player.x, a.y - N.player.y) < 40) { dT += dt; if (dT >= TUNE.meterDrain && meterLevel() > 0) { dT = 0; setMeter(meterLevel() - 1); sfx('wanted_down'); } }
        return false;
      });
      void drain;
      await go(m, 'charminar_plaza', 'Walk Immu back to the plaza.', { r: 50 });
      N.player.noRun = false;
      setMeter(0);
      twoChappals(false);
      npc(m, 'amma', near('charminar_plaza', 18, -10), { idle: 'stand', talk: false });
      npc(m, 'ammi', near('charminar_plaza', 30, -4), { idle: 'stand', talk: false });
      npc(m, 'abba', near('charminar_plaza', 38, 4), { idle: 'stand', talk: false });
      npc(m, 'faramarz', near('charminar_plaza', -20, -12), { idle: 'stand', talk: false });
      await m.cutscene([{ type: 'text', lines: ['Mummy arrives with the chappal raised. Then she hugs him, without putting the chappal down.'], ms: 4200 }]);
      await talk(m, [
        ['amma', '{FULL}. ...Idiot. Come here.'],
        ['ammi', 'Biscuits? In Faramarz-bhai\'s storeroom? Your Abba used to hide there too.'],
        ['abba', '...1979. Before my SSC exams.'],
        ['faramarz', 'So many boys have hidden in that storeroom. Not all went to America. Some went to Kukatpally.'],
      ]);
      m.meter('normal');
      // 7. the Side A copy
      npc(m, 'recording_man', near('recording_centre_1', 6, -6), { idle: 'work', talk: false });
      follow('immu', N.player, { dist: 16, side: 'right', ride: false });
      music(m, 'oldcity');
      await go(m, 'recording_centre_1', 'Get Side A copied at Raag Recording Centre (₹30).', { r: 26 });
      await talk(m, [
        ['recording_man', 'Copy of a home recording? Thirty rupees. Ten minutes. Chand Raat rush, fifteen.'],
        ['immu', 'The original comes with me. The copy stays in the tin. Agent rules.'],
      ]);
      m.money(-3000);
      m.give('side_a_copy', { name: 'The Side A copy' });
      // 8. the tin, locked
      npc(m, 'faramarz', near('irani_cafe_19', 4, -6), { idle: 'work', talk: false });
      await go(m, 'irani_cafe_19', 'Give the tin to Faramarz uncle.', { r: 26 });
      await m.cutscene([{ type: 'text', lines: ['Chinnu puts in the copy tape, one laughing passport photo and Immu\'s slam-book page with the other tokens. Immu snaps the brass lock.'], ms: 4600 }, { type: 'sfx', name: 'keys' }]);
      m.token('passport_photo', { name: 'A passport photo of two boys laughing', desc: 'Raj Colour Lab. They laughed every time.' });
      await talk(m, [
        ['immu', 'The combination is the day we started. You\'ll remember. Agent rules.'],
        ['faramarz', '(taking the tin) *Kitte din rakhun?* (How long do I keep it?)'],
        ['chinnu_immu', 'Till we come back. *Pakka.*'],
        ['faramarz', 'Top shelf. Next to my father\'s biscuit tin from Yazd. Good company.'],
      ]);
      m.flag('tin_locked', true);
      // 9. the last photo: Nanna's camera on a tin, ten seconds
      m.checkpoint('photo');
      const frame = toward('irani_cafe_19', 'charminar', 34) || near('irani_cafe_19', 0, 30);
      const grp = [['nanna', 8, -4], ['amma', -10, -6], ['ammi', -20, 0], ['immu', 16, 2], ['ayesha', 24, -6], ['abba', -28, -8]];
      for (const [k, dx, dy] of grp) npc(m, k, free(frame.x + dx, frame.y + dy), { idle: 'stand', talk: false });
      npc(m, 'faramarz', near('irani_cafe_19', 0, 6), { idle: 'stand', talk: false });
      follow('immu', null);
      try { if (N.audio && N.audio.music && N.audio.ready) N.audio.music.play('ending'); } catch (e) { /* ignore */ }
      await selfTimer(m, { frame, stepper: 'nanna', shout: 'NANNA, *NUVVU KOODA!*', label: 'The last photo: set Nanna\'s camera on a tin. Ten seconds.' });
      const air = { x: frame.x - 6, y: frame.y - 10, h: 30, spin: 0.6, draw: (ctx, p) => PAINT.chappal(ctx, p), sort: 8 };
      await m.cutscene([
        { type: 'text', lines: ['Nanna runs. Amma, seeing her son sprint across the plaza, throws, out of pure habit.'], ms: 3600 },
        () => prop(m, 's2:frozen_chappal', air),
        { type: 'sfx', name: 'clock_tick' }, { type: 'wait', ms: 350 }, { type: 'sfx', name: 'clock_tick' }, { type: 'wait', ms: 350 }, { type: 'sfx', name: 'clock_tick' }, { type: 'wait', ms: 350 },
        { type: 'sfx', name: 'camera_flash' }, { type: 'flash' },
      ]);
      prop(m, 's2:frozen_chappal', air);
      sfx('pigeons');
      try { if (N.collectibles && N.collectibles.found) N.collectibles.found('frame_24', { silent: true }); } catch (e) { N.err('story2.f24', e); }
      m.flag('frame_24', true);
      await rec(m);
      try { if (N.audio && N.audio.music) N.audio.music.stop(2.5); } catch (e) { /* ignore */ }
    },
    onPass() {
      try { if (N.walkman && N.walkman.addSong) N.walkman.addSong('ending'); } catch (e) { /* ignore */ }
      later(4.6, () => startFinale());
    },
  };

  /* ================================================================== the ENDING: "Side A ends" (bible §9.1) */
  const KITE_COLORS = ['#3a8a3a', '#d24d57', '#f2c230', '#e86a2a', '#e8a0c0', '#2a6ab8', '#e07a2e', '#7a3a8a', '#c8c8d0', '#8ac8e8', '#7a2f35', '#c9a227'];
  /** The kite train: n found kites rise one after another on one long string from Patang Chacha's roof into the
   *  floodlight beside the minarets (12 = "a fifth minar of paper"). */
  function kiteTrain(api, n, t0) {
    const roof = placeOf('patang_chacha_roof') || placeOf('gulzar_houz');
    const cm = landmark('charminar');
    const top = cm ? { x: cm.x + (cm.w || 60) / 2 + 26, y: cm.y - (cm.d || 60) / 2 - 10 } : placeOf('charminar');
    if (!roof || !top) return;
    const h0 = 28, h1 = ((cm && cm.h) || 56) + 40;
    prop(api, 's2:kites', {
      x: roof.x, y: roof.y, layer: 'sky', margin: 600,
      draw(ctx, p, t) {
        const el = nowT() - t0;
        const pt = (u) => P3(U.lerp(roof.x, top.x, u), U.lerp(roof.y, top.y, u) - Math.sin(u * Math.PI) * 30, U.lerp(h0, h1, u));
        const shown = Math.min(n, Math.floor(el / 0.6) + 1);
        if (shown <= 0) return;
        const reach = shown / Math.max(1, n);
        ctx.strokeStyle = 'rgba(255,250,235,0.7)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) { const q = pt((i / 24) * reach); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
        ctx.stroke();
        for (let i = 0; i < shown; i++) {
          const u = ((i + 1) / Math.max(1, n)) * reach * 0.98, q = pt(u), k = Math.max(0.7, q.k), s = 9 * k;
          const sway = Math.sin(t * 2 + i) * 0.25;
          ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(sway);
          ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.beginPath(); ctx.arc(0, 0, s * 1.5, 0, TAU); ctx.fill();
          ctx.fillStyle = KITE_COLORS[i % 12];
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, 0); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(20,10,10,0.55)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke();
          ctx.strokeStyle = KITE_COLORS[(i + 5) % 12]; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(0, s); for (let j = 1; j <= 5; j++) ctx.lineTo(Math.sin(t * 5 + j + i) * 2.5, s + j * 3.2 * k); ctx.stroke();
          ctx.restore();
        }
        if (N.render.lights) N.render.lights.push({ x: top.x, y: top.y, r: 120, color: '#fff2c0', intensity: 0.7 });
      },
    });
  }
  /** 23:40: far to the north, beyond the minarets, a blinking light climbs out of Begumpet into the dark. */
  function planeLight(api, t0) {
    prop(api, 's2:plane', {
      pos: () => ({ x: N.render.cam.x, y: N.render.cam.y }), layer: 'screen', sort: 30,
      draw(ctx) {
        const R = N.render, el = nowT() - t0;
        const air = placeOf('begumpet_airport'), c = placeOf('charminar');
        const ang = air && c ? Math.atan2(air.y - c.y, air.x - c.x) : -Math.PI / 2;
        const W = R.W, H = R.H;
        const x = W / 2 + Math.cos(ang) * W * 0.18, y0 = H * 0.2;
        const y = y0 - Math.min(H * 0.17, el * 3.2);
        const blink = Math.floor(el * 2.2) % 2 === 0;
        ctx.globalAlpha = clamp(1 - el / 40, 0.3, 1);
        const gl = ctx.createRadialGradient(x, y, 0, x, y, 12);
        gl.addColorStop(0, blink ? 'rgba(255,90,90,0.55)' : 'rgba(255,255,255,0.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
        ctx.fillStyle = blink ? '#ff4040' : '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, blink ? 2.6 : 2, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      },
    });
  }
  /** The pigeons on the minarets lift, all at once. */
  function pigeons(api, t0) {
    const cm = placeOf('charminar');
    if (!cm) return;
    const birds = []; for (let i = 0; i < 26; i++) birds.push({ a: (i / 26) * TAU + Math.random() * 0.3, v: 40 + Math.random() * 50, ph: Math.random() * TAU });
    prop(api, 's2:pigeons', {
      x: cm.x, y: cm.y, layer: 'sky', margin: 400,
      draw(ctx, p, t) {
        const el = nowT() - t0;
        if (el > 9) return;
        for (const b of birds) {
          const r = b.v * el, q = P3(cm.x + Math.cos(b.a) * r, cm.y + Math.sin(b.a) * r * 0.7, 50 + el * 22);
          const w = (2 + Math.sin(t * 16 + b.ph) * 1.6) * q.k;
          ctx.strokeStyle = 'rgba(70,70,80,' + clamp(1 - el / 9, 0, 1).toFixed(2) + ')'; ctx.lineWidth = Math.max(1, q.k);
          ctx.beginPath(); ctx.moveTo(q.x - 3 * q.k, q.y - w); ctx.lineTo(q.x, q.y); ctx.lineTo(q.x + 3 * q.k, q.y - w); ctx.stroke();
        }
      },
    });
  }
  /** "CLAP (ACTION ×3)": real input, one clap per press. */
  async function claps(api, label, n) {
    n = n || 3;
    if (isFF(api)) return;
    api.objective(label);
    let c = 0, used = false;
    await api.until(() => {
      if (mode() !== 'play') return false;
      if (N.interact && N.interact.offer) N.interact.offer({ label: 'CLAP (' + (c + 1) + '/' + n + ')', priority: 9, dist: 0, use: () => { used = true; } });
      if (used) { used = false; c++; sfx('clap'); if (N.render && N.render.fx) N.render.fx.flash = Math.max(N.render.fx.flash || 0, 0.05); }
      return c >= n;
    });
    api.objective(null);
  }
  async function endingScene(sc) {
    const p = N.player;
    N.emit('story2:ending', { phase: 'start' });
    await sc.wait(0.3);
    // Card 1: Eid morning (Wed 26 Nov, friend_home)
    await sc.jumpTo([2003, 11, 26, 8, 0], { fx: 'ff' });
    await sc.cutscene([
      camSteps('friend_home', 1, 800),
      { type: 'text', lines: ['Eid morning. Sheer khurma in a steel bowl, still too hot.'], ms: 3000 },
      { type: 'say', s: 'ammi', t: '*Eid Mubarak*, {nick}. *Eidi*. Fifty-one rupees. Don\'t spend it on maps.' },
      { type: 'say', s: 'chinnu', t: '*Eid Mubarak*, aunty.' },
      { type: 'text', lines: ['Chinnu gives Immu a shoebox: every cassette he found this year. "A city\'s radio. For the cold."'], ms: 3800 },
      { type: 'text', lines: ['Immu gives Chinnu his CID notebook. The last page says: "Agent Chinnu. Promoted. Over."'], ms: 3800 },
    ]);
    sc.money(5100);
    toast('*Eidi*: ₹51', 2200);
    sc.give('cid_notebook', { name: 'Immu\'s CID notebook' });
    // Card 2: the gate (Thu 27 Nov, 20:30)
    await sc.jumpTo([2003, 11, 27, 20, 30], { fx: 'ff' });
    const fh = placeOf('friend_home');
    const rp = fh && N.world.nearestRoadPoint ? N.world.nearestRoadPoint(fh.x, fh.y) : null;
    const taxi = rp ? sc.vehicle('taxi_ambassador', rp.x, rp.y, rp.angle || 0, { driver: true }) : null;
    await sc.cutscene([
      camSteps(taxi ? { x: taxi.x, y: taxi.y } : 'friend_home', 1, 900),
      { type: 'text', lines: ['An Ambassador taxi with a roof carrier full of tin trunks. The whole colony at the gate.'], ms: 3400 },
      { type: 'say', s: 'abba', t: 'Gas station. Gas station. ...Petrol bunk. (He gives up and laughs.)' },
      { type: 'say', s: 'immu', t: '23:40. Stand at Charminar and look north. I\'ll look south. Over.' },
      { type: 'say', s: 'chinnu', t: 'Over.' },
      () => { if (taxi && N.vehicles.driveTo && N.world.roads) { const n = N.world.roads.nearestNode(taxi.x + Math.cos(taxi.angle) * 80, taxi.y + Math.sin(taxi.angle) * 80); const rt = n ? N.world.roads.randomRoute(n, 5) : []; if (rt.length) N.vehicles.driveTo(taxi, [[taxi.x, taxi.y]].concat(rt.map((q) => [q.x, q.y])), { speed: 60, warp: false }); } },
      { type: 'text', lines: ['Nobody says goodbye. They say "over". The taxi turns the corner.'], ms: 4200 },
    ]);
    // Playable, 23:20: Gulzar Houz -> the Charminar plaza
    try { N.calendar.set(2003, 11, 27, 23, 20); } catch (e) { N.err('story2.cal', e); }
    try { if (N.collectibles && N.collectibles.printNow) N.collectibles.printNow('frame_24'); } catch (e) { /* ignore */ }
    const tr0 = N.traffic ? N.traffic.density : null;
    try { if (N.traffic && N.traffic.setDensity) N.traffic.setDensity(0.25); } catch (e) { /* ignore */ }
    onEnd(sc, () => { try { if (N.traffic && N.traffic.setDensity && tr0 != null) N.traffic.setDensity(tr0); } catch (e) { /* ignore */ } });
    const gh = near('gulzar_houz', 0, 20) || placeOf('gulzar_houz');
    p.teleport(gh.x, gh.y);
    if (N.render.snapCamera) N.render.snapCamera();
    const rxAt = near('gulzar_houz', 44, 30, 'drive'), chAt = near('gulzar_houz', -40, 30, 'drive');
    if (rxAt) sc.vehicle('bunty_rx100', rxAt.x, rxAt.y, 0, { noEnter: true });
    if (chAt) sc.vehicle('family_chetak', chAt.x, chAt.y, Math.PI, { noEnter: true });
    npc(sc, 'bunty', near('gulzar_houz', 30, 26, 'drive'), { idle: 'stand', talk: false });
    npc(sc, 'nanna', near('gulzar_houz', -24, 22), { idle: 'stand', talk: false });
    follow('nanna', p, { dist: 22, side: 'left', ride: false });
    follow('bunty', p, { dist: 26, side: 'right', ride: false });
    p.noRun = true;
    sc.objective('Charminar. Look north at 23:40.');
    await sc.wait(1.2);
    npc(sc, 'faramarz', near('irani_cafe_19', 4, -6), { idle: 'work', talk: false });
    await go(sc, 'irani_cafe_19', 'Give the Chand Raat print to Faramarz uncle.', { r: 26 });
    await card(sc, 'The Chand Raat print', '<p>Orange date stamp <b>\'03 11 25</b>. Chinnu a blur. Nanna laughing mid-stride. A chappal frozen in the air above everyone. Immu in a yellow raincoat. Ayesha bowling an imaginary ball. Faramarz uncle in the doorway. Charminar lit up behind them.</p>', { sub: 'Frame 24 · Raj Colour Lab, ready this afternoon' });
    await talk(sc, [
      ['faramarz', 'The tin stays locked. The photo stays with it. (tapes the envelope to the lid) Agent rules, *haan*?'],
      ['faramarz', 'Go. Your friend is looking south.'],
    ]);
    // Patang Chacha's roof by the Char Kaman
    const kites = kitesForEnding();
    const onRoof = () => !!(p.level === 'patang_chacha_roof');
    npc(sc, 'kite_chacha', 'patang_chacha_roof', { key: 'kite_chacha', idle: 'stand', talk: false });
    await go(sc, placeOf('patang_chacha_stairs') ? 'patang_chacha_stairs' : 'patang_chacha_roof', 'Patang Chacha\'s roof, by the Char Kaman. (Up the stairs.)', { r: 22 });
    if (N.world.roofs && placeOf('patang_chacha_stairs') && !onRoof()) {
      sc.objective('Climb to Patang Chacha\'s terrace.');
      const ok = await sc.until(onRoof, { timeout: 12 });
      if (!ok) { try { N.world.roofs.climb('patang_chacha_roof', 0, p, { instant: true }); } catch (e) { N.err('story2.roof', e); } }
    }
    await sc.say('kite_chacha', kites >= 12 ? 'All twelve. Now watch, *beta*.' : kites + ' kites. Enough to make the sky look busy. Watch.');
    try { if (N.audio && N.audio.music && N.audio.ready) N.audio.music.play('ending'); } catch (e) { /* ignore */ }
    N.emit('story2:ending', { phase: 'alaap', kites });
    kiteTrain(sc, Math.max(0, kites), nowT());
    await sc.cutscene([camSteps('charminar', 0.7, 2200), { type: 'wait', ms: Math.max(1500, kites * 600) },
      kites >= 12 ? { type: 'text', lines: ['Twelve kites on one string, into the floodlight beside the minarets: a fifth minar of paper.'], ms: 3600 } : { type: 'text', lines: [kites ? kites + ' kites rise on one long string into the floodlight beside the minarets.' : 'The floodlight beside the minarets. One bare string, waiting for next Sankranti.'], ms: 3200 }], { keepCamera: false });
    if (cassettesFound().dedications.length >= 12) await sc.say('radio', 'Deccan Vani, late night. One last farmaish: "From Chinnu of Lakshmi Nagar to Agent Immu, flying tonight. Over and out."');
    if (count('tickets') >= 12 || F().thatha_ending) npc(sc, 'ticket_thatha', near('charminar_plaza', -26, 10), { idle: 'sit', talk: '*Right, right*, Chinnu.' });
    // 23:40: look north
    if (onRoof() && N.world.roofs) { try { N.world.roofs.descend(p, { instant: true }); } catch (e) { /* ignore */ } }
    await go(sc, 'charminar_plaza', 'Charminar. Look north at 23:40.', { r: 60 });
    if (count('tickets') >= 12 || F().thatha_ending) await sc.say('ticket_thatha', '*Right, right*, Chinnu.');
    N.clock.set(23, 40);
    await scoreSection(sc, 'theme', 15);
    N.emit('story2:ending', { phase: 'theme' });
    planeLight(sc, nowT());
    sfx('airplane', { ui: true, vol: 0.35 });
    await sc.cutscene([{ type: 'text', lines: ['23:40. Far to the north, beyond the minarets, a blinking light climbs out of Begumpet into the dark.'], ms: 4200 }]);
    await talk(sc, [['bunty', '...Onsite. Maybe I\'ll stay. Paradise is here.']]);
    await sc.cutscene([{ type: 'text', lines: ['Nanna puts a hand on Chinnu\'s shoulder. He says nothing.'], ms: 3000 }]);
    await claps(sc, 'CLAP (E ×3)', 3);
    pigeons(sc, nowT());
    sfx('pigeons');
    await sc.cutscene([{ type: 'text', lines: ['Chinnu claps three times at the sky. Nothing comes back. Then the pigeons on the minarets lift, all at once.'], ms: 4400 }]);
    // [rise] Side A plays back, the camera rises over Charminar, the counter runs 000 -> 999
    await scoreSection(sc, 'rise', 12);
    N.emit('story2:ending', { phase: 'rise' });
    const tapeP = N.tape && N.tape.play ? N.tape.play('sideA', { gap: 1100 }) : Promise.resolve();
    await sc.cutscene([camSteps('charminar', 0.34, 9000)], { keepCamera: true });
    await ext(sc, tapeP);
    try { if (N.tape.counter < 999) N.tape.setCounter(999, { roll: true }); } catch (e) { /* ignore */ }
    sfx('tape_click');
    await sc.wait(0.5);
    sfx('tape_stop');
    // [lift] the 2-in-1 auto-reverses: ▶ PLAY SIDE B, white-out to 2026
    await scoreSection(sc, 'lift', 10);
    N.emit('story2:ending', { phase: 'lift' });
    await sc.cutscene([
      { type: 'osd', text: '▶ PLAY  SIDE B', ms: 2200 },
      { type: 'fade', to: 'white', ms: 1200 },
    ], { keepCamera: false });
    if (N.render) N.render.camOverride = null;
    F().ending_done = true;
    N.emit('story2:ending', { phase: 'end' });
  }

  /* ================================================================== the EPILOGUE: "Side B" (bible §9.2, Sat 17 Jan 2026) */
  function tinHTML() {
    const T = (N.tape && N.tape.tokens) || {};
    const nm = (id, d) => (T[id] && T[id].name) || d;
    const items = [
      [nm('kite_corner', 'The kite corner'), 'with a name spelt wrong'],
      [nm('numaish_ticket', 'The Numaish ticket'), ''],
      ['The *Toofan Tammudu* floor stub', ''],
      [nm('signed_ball', 'The signed tennis ball'), 'Chitti\'s name biggest'],
      [nm('punched_ticket', 'Ticket Thatha\'s punched ticket'), ''],
      [nm('brass_token_47', 'Brass token No. 47'), ''],
      [nm('golconda_ticket', 'The Golconda ticket'), ''],
      [nm('neem_leaf', 'A pressed neem leaf'), ''],
      [nm('prasads_stub', 'The Prasads stub, 25 JUL 2003'), ''],
      [nm('gulal', 'A packet of gulal'), ''],
      ['Immu\'s slam-book page', 'two email addresses on the back: agent_immu_2003 · ' + emailOf()],
      ['A passport photo of two boys laughing', ''],
      ['The Side A copy', ''],
      ['The envelope: the Chand Raat print', '\'03 11 25, a chappal frozen in the air'],
    ];
    return '<ul class="s2-grid">' + items.map((it, i) => '<li style="--r:' + (((i * 37) % 7) - 3) + 'deg"><b>' + emph(it[0]) + '</b>' + (it[1] ? '<span>' + esc(it[1]) + '</span>' : '') + '</li>').join('') + '</ul>';
  }
  function albumHTML() {
    let prints = [];
    try { prints = N.collectibles && N.collectibles.prints ? N.collectibles.prints() : []; } catch (e) { prints = []; }
    const have = new Set(prints.map((x) => String(x)));
    let html = '<ul class="s2-album">', n = 0;
    for (let i = 1; i <= 24; i++) {
      const on = i === 24 || have.has('frame_' + i);
      if (on) n++;
      html += '<li class="' + (on ? 'on' : 'off') + '">' + (on ? 'F' + pad2(i) : '') + '</li>';
    }
    return html + '</ul><p class="s2-sub">' + n + ' of 24 in their places. The rest are empty photo corners.</p>';
  }
  async function epilogueScene(sc) {
    const p = N.player;
    N.emit('story2:epilogue', { phase: 'start' });
    // Side B (text over the loft image, Immu's voice) and the tail of the tapes found in 2003
    const tail = sideBTail();
    await sc.cutscene([
      { type: 'vhs', mode: 'ff', ms: 1400, year: [2003, 2026] },
      { type: 'card', title: 'SIDE B', sub: 'Amma\'s loft. The old 2-in-1. Immu\'s voice.', ms: 2600 },
      { type: 'say', s: 'imran_tape', t: 'Chinnu. It\'s Immu. Imran. Agent, retired.' },
      { type: 'say', s: 'imran_tape', t: 'I wore Side A thin in New Jersey. Every Sankranti I played track one in the garage.' },
      { type: 'say', s: 'imran_tape', t: 'Abba wants to see Charminar once more. He says his knees remember the cellar stair.' },
      { type: 'say', s: 'imran_tape', t: 'Same café. Saturday. Four o\'clock. Bring a clap. Over.' },
      { type: 'say', s: 'imran_tape', t: 'PS. The tapes you gave me in 2003. I put a bit of each at the end. Listen.' },
    ].concat(tail.map((l) => ({ type: 'say', s: l.s, t: l.t }))).concat([{ type: 'card', title: '▶ PLAY  SAT 17 JAN 2026  16:00', ms: 2600 }]));
    N.emit('story2:epilogue', { phase: 'sideB', tail: tail.length });
    try { N.calendar.set(2026, 1, 17, 16, 0); } catch (e) { N.err('story2.cal', e); }
    F().year = 2026;
    seasonsSet('year2026', true);
    if (N.tape) N.tape.side = 'B';
    const vhs0 = N.render.fx.vhs || 0;
    N.render.fx.vhs = 0.35;
    S2.epilogue = true;
    const tr = N.traffic ? { e: N.traffic.enabled, d: N.traffic.density } : null;
    try { if (N.traffic) { if (N.traffic.setDensity) N.traffic.setDensity(0); N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); } } catch (e) { /* ignore */ }
    onEnd(sc, () => { S2.epilogue = false; N.render.fx.vhs = vhs0; try { if (N.traffic && tr) { N.traffic.enabled = tr.e; if (N.traffic.setDensity) N.traffic.setDensity(tr.d); } } catch (e) { /* ignore */ } });
    try { if (N.npcs && N.npcs.applyPlayerLook) N.npcs.applyPlayerLook(); } catch (e) { /* ignore */ }
    const gh = near('gulzar_houz', 0, 20) || placeOf('gulzar_houz');
    p.teleport(gh.x, gh.y);
    p.energy = Math.min(p.energy, 100);
    if (N.render.snapCamera) N.render.snapCamera();
    toast('The plaza is closed to traffic this evening.', 2600);
    // the café, four o'clock
    npc(sc, 'faramarz', near('irani_cafe_19', 4, -6), { idle: 'work', talk: false });
    npc(sc, 'imran', near('irani_cafe_19', -14, 8), { idle: 'sit', talk: false });
    npc(sc, 'abba', near('irani_cafe_19', -24, 4), { idle: 'sit', talk: false });
    await go(sc, 'irani_cafe_19', 'Café Noor-e-Iran. Four o\'clock.', { r: 26 });
    await talk(sc, [
      ['faramarz', '(81, at the galla, squinting) You two are late. *Teis saal* late.'],
      ['srikanth', 'Uncle. You remember me?'],
      ['faramarz', 'I remember a boy who ate my biscuits in my storeroom. And another boy who came to get him.'],
      ['imran', '(at the corner table, a windcheater, a cap, the same taped-glasses grin) Agent.'],
      ['srikanth', 'Agent.'],
      ['imran', '(holding out a packet) Chocolate? From America. Everyone expects it. I\'m sorry.'],
      ['abba', '(63, standing slowly) *Do chai, ek plate Osmania.* ...Some things you don\'t say in English.'],
    ]);
    npc(sc, 'ayesha', near('irani_cafe_19', 26, 18), { idle: 'stand', talk: false });
    await talk(sc, [
      ['ayesha', '(arriving, dupatta, a coach\'s whistle) Eight kilometres. We cried for a week. Then we got a bigger ground.'],
      ['imran', 'Still bowling?'],
      ['ayesha', 'Coaching. Girls\' team. Under-14. They call me "Coach Bowling".'],
      ['srikanth', 'And Ammamma says: bring back Osmania and a full report. She\'s ninety-one.'],
      ['faramarz', 'Ninety-one and still giving orders. Good. *Accha.* Now. The tin.'],
    ]);
    await sc.cutscene([{ type: 'text', lines: ['Faramarz takes the tin down from the top shelf, beside his father\'s tin from Yazd. A yellowed envelope is taped to the lid: the Chand Raat print, delivered on 27 Nov 2003. The brass lock.'], ms: 5600 }]);
    // the 1-4-0-1 lock dial
    sc.objective('Open the lock.');
    N.emit('story2:epilogue', { phase: 'lock' });
    const res = await lockDial(sc, {
      onWrong: async (n) => {
        if (n === 1) await N.dialogue.say('faramarz', '*Gurthunda?*');
        else if (n === 2) await N.dialogue.say('srikanth', 'The day we started...');
        else await N.dialogue.say('imran', 'Fourteen-one. Sankranti.');
      },
    });
    F().lock_opened = true;
    S2.lockResult = res;
    sc.objective(null);
    await card(sc, 'The tin', tinHTML(), { sub: 'Everything is still there.' });
    await talk(sc, [
      ['srikanth', 'Your email still works?'],
      ['imran', 'agent_immu_2003? I forgot the password.'],
      ['srikanth', 'Bokaata.'],
      ['imran', '...Bokaata. (laughs) You remembered.', 'laugh'],
    ]);
    // Amma (61) and Nanna (64) arrive with the album
    npc(sc, 'amma', near('irani_cafe_19', 20, 26), { idle: 'stand', talk: false });
    npc(sc, 'nanna', near('irani_cafe_19', 30, 22), { idle: 'stand', talk: false });
    await sc.say('amma', '(sees biscuit crumbs on Srikanth\'s shirt; her hand goes to her chappal) ...Habit.');
    await card(sc, 'Nanna\'s album', albumHTML(), { sub: 'Amma carries it in both hands.' });
    await sc.say('nanna', 'One photo. All of us. I have the old camera, one roll left.');
    // the last photo, ten seconds
    const frame = toward('irani_cafe_19', 'charminar', 34) || near('irani_cafe_19', 0, 30);
    const grp = [['nanna', 8, -4], ['abba', -8, -4], ['amma', -16, -8], ['imran', 16, 2], ['ayesha', 24, -6]];
    for (const [k, dx, dy] of grp) npc(sc, k, free(frame.x + dx, frame.y + dy), { idle: 'stand', talk: false });
    npc(sc, 'faramarz', near('irani_cafe_19', 0, 6), { idle: 'stand', talk: false });
    N.emit('story2:epilogue', { phase: 'photo' });
    await selfTimer(sc, {
      frame, stepper: 'nanna', label: 'The last photo. Ten seconds.', shout: 'Nanna, *nuvvu kooda!*', grabLabel: 'Nanna, nuvvu kooda!',
      helpers: [{ key: 'abba', by: 'imran', shout: 'Abba, *aap bhi!*' }],
    });
    await sc.cutscene([
      { type: 'text', lines: ['Two old men run. Their knees don\'t. They make it. Mostly.'], ms: 3400 },
      { type: 'sfx', name: 'clock_tick' }, { type: 'wait', ms: 300 }, { type: 'sfx', name: 'clock_tick' }, { type: 'wait', ms: 300 }, { type: 'sfx', name: 'clock_tick' }, { type: 'wait', ms: 300 },
      { type: 'sfx', name: 'camera_flash' }, { type: 'flash' },
      () => { pigeons(sc, nowT()); sfx('pigeons'); },
      { type: 'text', lines: ['Pigeons lift off the minarets.'], ms: 2600 },
    ]);
    // at the café door, a clap behind him; he claps back three times without turning round
    await go(sc, 'irani_cafe_19', 'The café door.', { r: 28 });
    sfx('clap'); await sc.wait(0.35); sfx('clap'); await sc.wait(0.35); sfx('clap');
    toast('A clap behind you.', 1600);
    await claps(sc, 'Clap back. Don\'t turn round. (E ×3)', 3);
    // [coda] the tape stops
    N.emit('story2:epilogue', { phase: 'coda' });
    try { if (N.audio && N.audio.tapeStop) await ext(sc, Promise.race([N.audio.tapeStop(2.5), new Promise((r) => setTimeout(r, 3200))])); } catch (e) { /* ignore */ }
    await sc.cutscene([
      { type: 'osd', text: '■ STOP', ms: 1800 },
      { type: 'title', title: 'NOSTALGIA', sub: 'Gurthunda?', ms: 3600 },
    ]);
    F().epilogue_done = true;
    N.emit('story2:epilogue', { phase: 'end' });
  }

  /* ================================================================== definitions, CREDITS, post-credits ◀◀ REWIND */
  const CREDIT_LINES = [
    ['h', 'MAP AND 3D'],
    ['p', 'Map reference: DataMeet Municipal Spatial Data (CC BY 4.0) and © OpenStreetMap contributors (ODbL)'],
    ['p', '3D mode: three.js r149 (MIT License), © 2010-2023 Three.js Authors'],
    ['gap'],
  ];
  function patchCredits() {
    const C = N.menus && N.menus.CREDITS;
    if (!Array.isArray(C)) return false;
    if (C.some((r) => r && /DataMeet Municipal Spatial Data/.test(r[1] || ''))) return true;
    let at = C.findIndex((r) => r && r[0] === 'h' && /WITH THANKS/.test(r[1] || ''));
    if (at < 0) at = Math.max(0, C.length - 2);
    C.splice(at, 0, ...CREDIT_LINES.map((r) => r.slice()));
    return true;
  }
  const SEASONS = {
    january: { title: 'January', sub: 'Sankranti, Numaish. Immu hangs out at the colony ground; kites in the sky.', date: [2003, 1, 14, 10, 0], immu: true },
    may: { title: 'May', sub: 'Summer: ice golas, mangoes, the LB summer camp.', date: [2003, 5, 10, 9, 0], immu: true },
    september: { title: 'September', sub: 'Ganesh: pandals; Immu at the pandal.', date: [2003, 9, 3, 18, 30], immu: true },
    december: { title: 'December', sub: 'Immu has gone. Christmas stars in Secunderabad; his first email waits at Cyber Zone. Ayesha\'s lorry leaves for Tolichowki on 13 Dec.', date: [2003, 12, 13, 8, 0], immu: false },
  };
  const IMMU_HANG = [
    'Agent Chinnu. Nothing to report. Just reporting. Over.',
    'Ten months and eleven days, I said. Now it\'s less. Don\'t count.',
    'Chai? Your treat. You have Eidi money. ...Oh. Not Eid yet. Your treat anyway.',
  ];
  function rewindMenu(api) {
    const keys = Object.keys(SEASONS);
    let sel = 0;
    const html = '<h2>◀◀ REWIND</h2><p class="s2-sub">Play any season of 2003.</p><ul class="s2-jmenu">' +
      keys.map((k, i) => '<li><button type="button" data-k="' + k + '"' + (i === 0 ? ' class="sel"' : '') + '><b>A' + (i + 1) + '</b><span>' + esc(SEASONS[k].title) + '<br><em>' + esc(SEASONS[k].sub) + '</em></span></button></li>').join('') +
      '</ul><p class="s2-hint">↑ ↓ choose · E play</p>';
    const P = panel(html, {
      label: 'Play any season of 2003', cls: 's2-rewind',
      keys: (k) => {
        if (k === 'up') sel = (sel + keys.length - 1) % keys.length;
        else if (k === 'down') sel = (sel + 1) % keys.length;
        else if (k === 'action') { P.close(keys[sel]); return; }
        P.el.querySelectorAll('.s2-jmenu button').forEach((b, i) => b.classList.toggle('sel', i === sel));
        sfx('ui_select');
      },
    });
    P.el.querySelectorAll('.s2-jmenu button').forEach((b) => b.addEventListener('click', () => P.close(b.dataset.k)));
    if (api) onEnd(api, () => P.close(null));
    S2.rewindPanel = P;
    return P.done;
  }
  function playSeason(name) {
    const S = SEASONS[name] || SEASONS.january;
    const p = N.player;
    if (N.tape) N.tape.side = 'A';
    seasonsSet('year2026', null);
    try { N.calendar.set(S.date[0], S.date[1], S.date[2], S.date[3], S.date[4]); } catch (e) { N.err('story2.season', e); }
    F().year = 2003;
    F().postgame = true;
    F().season_pick = name;
    if (N.render && N.render.fx) { N.render.fx.vhs = 0; N.render.fx.fade = 0; }
    try { if (N.npcs && N.npcs.applyPlayerLook) N.npcs.applyPlayerLook(); } catch (e) { /* ignore */ }
    try { if (N.npcs && N.npcs.schedule) N.npcs.schedule('immu_hangout', !!S.immu); } catch (e) { /* ignore */ }
    if (!S.immu) despawn('immu');
    const h = near('home', 6, 18) || placeOf('home');
    if (h) p.teleport(h.x, h.y);
    if (N.render.snapCamera) N.render.snapCamera();
    N.emit('story2:season', { name });
    if (name === 'december') later(1.5, () => runScene('ayesha_lorry', ayeshaLorry).then((ok) => { if (ok) autosave('season'); }));
    else autosave('season');
    toast('◀◀ ' + S.title + ' 2003. Free roam: everything you found is still yours.', 3600);
  }
  /** December 13: Ayesha's moving lorry leaves for Tolichowki; then ▶▶ to the Christmas week (SA8). */
  async function ayeshaLorry(sc) {
    const pg = placeOf('playground_1');
    const rp = pg && N.world.nearestRoadPoint ? N.world.nearestRoadPoint(pg.x, pg.y) : null;
    const lorry = rp ? sc.vehicle('lorry', rp.x, rp.y, rp.angle || 0, { driver: true }) : null;
    const ay = npc(sc, 'ayesha', near('playground_1', -20, -20), { idle: 'stand', talk: false });
    if (ay) await go(sc, ay, 'Ayesha\'s moving lorry is at the colony ground.', { r: 32 });
    await talk(sc, [
      ['ayesha', 'Eight kilometres. ...It feels like America.'],
      ['chinnu', 'It\'s just more bus tickets.'],
      ['ayesha', '*Hau, ho jaata.*'],
    ]);
    if (lorry && N.vehicles.driveTo && N.world.roads) { const n = N.world.roads.nearestNode(lorry.x + 80, lorry.y); const rt = n ? N.world.roads.randomRoute(n, 5) : []; if (rt.length) N.vehicles.driveTo(lorry, [[lorry.x, lorry.y]].concat(rt.map((q) => [q.x, q.y])), { speed: 50, warp: false }); }
    despawn('ayesha');
    await sc.wait(2);
    await sc.jumpTo([2003, 12, 20, 10, 0], { fx: 'ff' });
    toast('A week later. Christmas stars are going up in Secunderabad.', 3200);
  }
  async function creditsScene(sc) {
    const pl = N.player;
    if (pl) { pl.controlsLocked = true; sc._sc.locked = true; }
    N.emit('story2:epilogue', { phase: 'definitions' });
    if (N.menus && N.menus.definitions) await ext(sc, N.menus.definitions());
    N.emit('story2:epilogue', { phase: 'credits' });
    patchCredits();
    if (N.menus && N.menus.credits) await ext(sc, N.menus.credits({}));
    F().credits_seen = true;
    // ◀◀ REWIND
    N.emit('story2:epilogue', { phase: 'rewind' });
    if (N.render && N.render.fx) N.render.fx.fade = 0;
    await sc.cutscene([{ type: 'vhs', mode: 'rewind', ms: 1800, year: [2026, 2003], label: '◀◀ REWIND' }]);
    const pick = (await ext(sc, rewindMenu(sc))) || 'january';
    S2.pendingSeason = pick;
  }
  /** M12 passed: the ending, the epilogue, the definitions, the credits and the rewind, in one run. */
  async function startFinale() {
    if (SC.cur || S2.finaleRunning) return false;
    S2.finaleRunning = true;
    try {
      if (!F().ending_done) { const ok = await runScene('ending', endingScene); if (!ok) return false; }
      if (!F().epilogue_done) { const ok = await runScene('epilogue', epilogueScene); if (!ok) return false; }
      const ok = await runScene('credits', creditsScene);
      if (!ok) return false;
      playSeason(S2.pendingSeason || 'january');
      S2.pendingSeason = null;
      return true;
    } finally { S2.finaleRunning = false; }
  }
  function autosave(why) {
    try { if (N.save && N.save.save) { if (N.save.save({ reason: 'mission', toast: false })) toast('SIDE A saved ●', 2000, 'save'); } } catch (e) { N.err('story2.save:' + (why || ''), e); }
  }

  /* ================================================================== side activities (bible §7, systems §6.6) */
  const inYear = (y) => { try { return N.calendar && N.calendar.year === y; } catch (e) { return true; } };
  const inDates = (a, b) => { try { return N.calendar && N.calendar.inRange ? N.calendar.inRange(a, b) : true; } catch (e) { return true; } };
  /* SA5 twelve_oclock — The Twelve O'Clock Gong (any day 11:25-12:00 after M5) */
  const SA5 = {
    id: 'twelve_oclock', kind: 'side', title: 'The Twelve O\'Clock Gong', requires: ['right_right'],
    giver: { place: 'std_1', r: 16 }, window: { from: '11:25', to: '12:00' }, reward: { money: 1000 }, autosave: false,
    async script(m) {
      await m.say('chitti', 'If the little man strikes twelve and you\'re not there, *Mummy ki cheppesta*.');
      const left = Math.max(20, (12 * 60 - N.clock.minutes) / Math.max(0.1, N.clock.speed || 1));
      m.timer(left, 'GONG', { failMsg: 'Twelve o\'clock came and went. Chitti is telling.' });
      npc(m, 'chitti', near('salar_jung_museum', -12, 10), { idle: 'stand', talk: false });
      npc(m, 'guard', near('salar_jung_museum', 14, 8), { idle: 'stand', talk: false });
      await go(m, 'salar_jung_museum', 'Race to the Salar Jung Museum before the little man strikes twelve.', { r: 46 });
      // inside: walk only (museum rule)
      N.player.noRun = true;
      onEnd(m, () => { N.player.noRun = false; });
      const clockPt = near('salar_jung_museum', 0, -24) || placeOf('salar_jung_museum');
      let warned = false;
      const w = m.until(() => { if (!warned && N.input && N.input.down('run') && N.input.move && Math.hypot(N.input.move.x, N.input.move.y) > 0.2) { warned = true; bark('guard', 'Running in the museum? *Nakko.* Walk fast, but walk.', { secs: 2.6 }); } return false; });
      void w;
      await go(m, clockPt, 'The musical clock. Walk only.', { r: 22 });
      m.timer(null);
      N.clock.set(12, 0);
      const steps = [camSteps('salar_jung_museum', 1.15, 900), { type: 'text', lines: ['The little man comes out and strikes the gong.'], ms: 1800 }];
      for (let i = 0; i < 12; i++) steps.push({ type: 'sfx', name: 'gong' }, { type: 'wait', ms: 420 });
      await m.cutscene(steps);
      await talk(m, [
        ['chitti', 'He hit the gong twelve times and nobody told him to stop!'],
        ['chinnu', 'That\'s his job, Chitti.'],
        ['chitti', 'I want that job.'],
      ]);
      try { if (N.collectibles) { if (N.collectibles.found) N.collectibles.found('frame_12', { silent: true }); if (N.collectibles.printNow) N.collectibles.printNow('frame_12'); } } catch (e) { N.err('story2.f12', e); }
      try { if (N.collectibles && N.collectibles.unlockTrivia) N.collectibles.unlockTrivia('salar_jung_museum', { silent: true }); } catch (e) { /* ignore */ }
      toast('F12 pre-framed: a free print. Trivia: The marble Veiled Rebecca at the Salar Jung Museum was bought in Rome in 1876.', 4600);
    },
  };
  /* SA6 bunty_races — R1 Tank Bund, R2 Necklace Road at sunset, R3 the OU loop, R4 HITEC City (after M3, 16:00-19:00)
   * A3: Chinnu races on a hired cycle (R1, R2) and the Scooty when the vehicles module has one (R3, R4; else the
   * Hercules / a cycle); Bunty is on his RX100 with the handicap; the R4 prize is RX100 pillion rides, never the bike. */
  const RACES = [
    { id: 'bunty_races', n: 1, title: 'Bunty-anna\'s Races: Tank Bund', start: 'tank_bund', roads: ['tank_bund'], reward: 1000, window: { from: '16:00', to: '19:00' }, line: 'Word of the day: nostalgia. Means the smell of a new RX100.' },
    { id: 'bunty_races_r2', n: 2, title: 'Bunty-anna\'s Races: Necklace Road', start: 'necklace_road', roads: ['necklace_rd', 'necklace_road'], reward: 1500, window: { from: '16:30', to: '19:00' }, line: '' },
    { id: 'bunty_races_r3', n: 3, title: 'Bunty-anna\'s Races: the OU loop', start: 'chai_bandi_3', roads: ['ou_rd'], loop: true, reward: 2000, window: { from: '16:00', to: '19:00' }, line: 'OU canteen chai is the best chai in Asia. I have not been to Asia, but I\'m sure.' },
    { id: 'bunty_races_r4', n: 4, title: 'Bunty-anna\'s Races: HITEC City', start: 'cyber_towers', end: 'hitex', reward: 2500, window: { from: '16:00', to: '19:00' }, line: 'See these roads? Empty. In ten years, traffic. Onsite, *mamu*. Everybody\'s going onsite.' },
  ];
  function raceRoute(R) {
    const s = placeOf(R.start);
    if (!s) return [];
    let pts = null;
    for (const id of R.roads || []) { const r = roadPts(id); if (r && r.length > 1) { pts = r; break; } }
    if (pts) {
      // start at the end nearer the start place
      if (Math.hypot(pts[0].x - s.x, pts[0].y - s.y) > Math.hypot(pts[pts.length - 1].x - s.x, pts[pts.length - 1].y - s.y)) pts = pts.slice().reverse();
      if (R.loop) pts = pts.concat(pts.slice(0, -1).reverse());
    } else if (R.end && N.vehicles && N.vehicles.roadPath) {
      const e = placeOf(R.end);
      if (e) pts = N.vehicles.roadPath(s.x, s.y, e.x, e.y).map((q) => ({ x: q[0], y: q[1] }));
    }
    if (!pts || pts.length < 2) return [];
    // checkpoint rings every ~260 u along the line
    const out = [];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.y - a.y);
      let t = 0;
      while (acc + (L - t) >= 260) { t += 260 - acc; acc = 0; out.push({ x: a.x + (b.x - a.x) * (t / L), y: a.y + (b.y - a.y) * (t / L) }); }
      acc += L - t;
    }
    const last = pts[pts.length - 1];
    if (!out.length || Math.hypot(out[out.length - 1].x - last.x, out[out.length - 1].y - last.y) > 80) out.push({ x: last.x, y: last.y });
    return out.map((q) => free(q.x, q.y, 'drive'));
  }
  function raceDef(R, i) {
    return {
      id: R.id, kind: 'side', title: R.title, requires: i === 0 ? ['first_day_first_show'] : [RACES[i - 1].id],
      giver: { place: R.start, r: 22 }, window: R.window, reward: { money: R.reward }, autosave: false,
      async script(m) {
        const rings = raceRoute(R);
        if (!rings.length) { toast('No road for this race today.'); return; }
        const s0 = free(rings[0].x, rings[0].y, 'drive');
        const type = R.n >= 3 ? vtype('scooty', 'hercules_cycle', 'cycle') : vtype(R.n === 2 ? 'hercules_cycle' : 'hero_cycle', 'cycle');
        const mine = m.vehicle(type, s0.x - 14, s0.y + 10, Math.atan2(rings[0].y - s0.y, rings[0].x - s0.x), { color: '#9a2424' });
        npc(m, 'bunty', free(s0.x + 14, s0.y - 10, 'drive'), { vehicle: 'bunty_rx100', talk: false });
        if (R.line) { await m.say('bunty', R.line); if (R.n === 1) buntyWord('the smell of a new RX100'); }
        if (mine && !isFF(m)) { await go(m, mine, 'Get on the ' + (type === 'scooty' ? 'Scooty' : 'cycle') + '. Race Bunty-anna!', { r: 18 }); await m.until(() => N.player.vehicle === mine, { timeout: 40 }); }
        // 3-2-1
        await m.cutscene([{ type: 'osd', text: '3', ms: 600 }, { type: 'osd', text: '2', ms: 600 }, { type: 'osd', text: '1', ms: 600 }, { type: 'osd', text: 'GO!', ms: 500 }]);
        const hc = TUNE.raceHandicap[R.n - 1] || 0.8;
        const bv = () => { const a = npcGet('bunty'); return a && a.vehicle; };
        let bi = 0, ri = 0;
        const bunty = { speed: 0 };
        const drive = () => { const v = bv(); if (!v || !N.vehicles.driveTo) return; const rest = rings.slice(bi); if (!rest.length) return; N.vehicles.driveTo(v, [[v.x, v.y]].concat(rest.map((q) => [q.x, q.y])), { speed: bunty.speed, r: 30, warp: false, stop: true }); };
        bunty.speed = Math.min(95, 180 * hc * 0.62) * TUNE.escortSpeed; drive();
        let rid = m.marker(rings[0], { r: TUNE.raceRing });
        let rb = m.blip(rings[0], { color: PINK, icon: 'ring', label: 'Ring 1', route: true });
        let tune = 0, last = nowT();
        const res = await m.until(() => {
          const t = nowT(), dt = t - last; last = t;
          const p = N.player, v = bv();
          if (v) { while (bi < rings.length && Math.hypot(v.x - rings[bi].x, v.y - rings[bi].y) < 40) bi++; }
          if (bi >= rings.length) return 'lost';
          if (Math.hypot(p.x - rings[ri].x, p.y - rings[ri].y) < TUNE.raceRing) {
            ri++; sfx('ui_select');
            m.unmarker(rid); m.unblip(rb);
            if (ri >= rings.length) return 'won';
            rid = m.marker(rings[ri], { r: TUNE.raceRing });
            rb = m.blip(rings[ri], { color: PINK, icon: 'ring', label: 'Ring ' + (ri + 1), route: true });
          }
          // rubber band: x0.9 when 250 u ahead, x1.05 when 250 u behind (systems §8.13)
          tune -= dt;
          if (tune <= 0 && v) {
            tune = 2;
            const ahead = bi - ri;
            const base = Math.min(95, 180 * hc * 0.62) * TUNE.escortSpeed;
            const want = base * (ahead >= 1 ? 0.9 : ahead <= -1 ? 1.05 : 1);
            if (Math.abs(want - bunty.speed) > 1) { bunty.speed = want; drive(); }
          }
          return false;
        });
        m.unmarker(rid); m.unblip(rb);
        if (res === 'lost') m.fail('Bunty-anna wins this one. Rematch, free.');
        await m.say('bunty', 'You beat me? On a cycle? ...I let you. Nostalgia.');
        m.flag('sa6_race', R.n);
        if (R.n === 4) {
          m.flag('bunty_pillion', true); m.flag('sa6_r4', true);
          await m.say('bunty', 'Okay, okay. Sundays, I take you anywhere on the RX100. Pillion only, with a helmet, only if Mummy doesn\'t know.');
          toast('Bunty-anna\'s RX100: pillion rides on Sundays. (Chinnu drives cycles, the Scooty and the auto, not the RX100.)', 4200);
        }
      },
    };
  }
  /* SA7 new_class_old_books (8 to 11 Jun) */
  const SA7 = {
    id: 'new_class_old_books', kind: 'side', title: 'New Class, Old Books',
    giver: { place: 'koti_book_bazaar', r: 18 }, reward: { money: 1000 }, autosave: false,
    when: () => inYear(2003) && inDates('06-08', '06-11'),
    async script(m) {
      npc(m, 'book_man', near('koti_book_bazaar', 6, -6), { idle: 'work', talk: false });
      await m.say('book_man', 'Seventh class, full set, half price. Guide also? Guide is extra, but guide has the answers.');
      const r = await game(m, 'bargain', { who: 'books', intro: 'Last year\'s class VII textbooks, on the footpath.', place: 'koti_book_bazaar' });
      m.money(-(r && r.pricePaise > 0 ? Math.min(6000, r.pricePaise) : 4000));
      m.give('class7_books', { name: 'Class VII textbooks (second-hand)' });
      npc(m, 'stationery_man', near('stationery_4', 6, -6), { idle: 'work', talk: false });
      await go(m, 'stationery_4', 'Brown cover paper and name labels at the Koti textbook stall.', { r: 22 });
      await m.say('stationery_man', 'Brown cover, how many sheets? Take labels also, for your name. Write neat.');
      m.money(-1000);
      npc(m, 'amma', near('home', 12, 12), { idle: 'stand', talk: false });
      npc(m, 'chitti', near('home', -10, 12), { idle: 'stand', talk: false });
      await go(m, 'home', 'Home: cover the books.', { r: 26 });
      await m.say('amma', 'Cover them properly, {nick}. Corners folded. Not like last year, like a samosa.');
      await m.cutscene([{ type: 'text', lines: ['Brown paper, a ruler, Fevicol. Ten books, corners folded.', 'Chitti draws a moustache on one label.'], ms: 4400 }]);
      toast('That new-book smell.', 2600);
    },
  };
  /* SA8 christmas_stars (post-game, 20 to 25 Dec 2003) */
  const CHURCHES = ['church_st_marys', 'church_wesley', 'st_johns_church_secunderabad', 'st_josephs_cathedral'];
  const IMMU_EMAIL = 'Agent Chinnu. New Jersey report. It is cold. The gas station is real.\nThey have no Osmania biscuits. I clapped in the school gym. Nothing came back. Over.\nPS: tell Faramarz uncle the tin is not a biscuit tin. Don\'t let him serve it.';
  const SA8 = {
    id: 'christmas_stars', kind: 'side', title: 'Christmas Stars',
    giver: { place: 'iyengar_bakery_2', r: 18 }, reward: { money: 2000 }, autosave: false,
    when: () => !!(F().postgame || isDone('chand_raat')) && inYear(2003) && inDates('12-20', '12-25'),
    async script(m) {
      npc(m, 'bakery_lady', near('iyengar_bakery_2', 6, -6), { idle: 'work', talk: false });
      await m.say('bakery_lady', 'Honey cake just out! ...Plum cakes? Four. For the churches? Then the cake is half price.');
      m.money(-800);
      m.give('plum_cakes', { name: 'Four plum cakes' });
      let first = true;
      for (const id of CHURCHES) {
        if (!placeOf(id)) continue;
        const gate = zoneGate(id) || near(id, 0, 30);
        if (first) npc(m, 'carol_aunty', free(gate.x + 10, gate.y + 6), { idle: 'stand', talk: false });
        await go(m, gate, 'Leave a plum cake on the gate table at ' + (placeOf(id).name || id) + '. (Walk only.)', { r: 24 });
        await useAt(m, gate, 'Leave the cake', { r: 26 });
        sfx('paper');
        if (first) { await m.say('carol_aunty', 'Thank you, *beta*! Come at midnight, there\'s cake for the carollers also.'); first = false; }
        else toast('A plum cake on the gate table.', 1600);
      }
      npc(m, 'net_uncle', near('internet_cafe_1', 6, -6), { idle: 'work', talk: false });
      await go(m, 'internet_cafe_1', 'Cyber Zone: an email is waiting.', { r: 24 });
      sfx('dialup');
      await card(m, 'Email', '<div class="s2-mail">From: agent_immu_2003   To: ' + esc(emailOf()) + '\n\n' + esc(subst(IMMU_EMAIL)) + '</div>', { sub: 'Immu\'s first email' });
      await m.say('net_uncle', 'Email from America? Twenty rupees. Reading is free. Crying is also free.');
      m.flag('immu_email', true);
      m.flag('star_lantern', true);
      try { if (N.shops && N.shops.addEmail) N.shops.addEmail({ id: 'immu_first', from: 'agent_immu_2003', subject: 'New Jersey report', body: IMMU_EMAIL }); } catch (e) { /* ignore */ }
      toast('A paper star lantern hangs on Lakshmi Nivas\'s balcony.', 3200);
    },
  };
  /* lb_final — the LB Stadium match (places_registry round 12): Chinnu XI (Immu, Ayesha) v Ashok Nagar */
  const LB = {
    id: 'lb_final', kind: 'side', title: 'The Colony Cup Final', requires: ['the_clap'],
    giver: { place: 'lb_stadium', r: 20 }, window: { from: '15:00', to: '18:30' }, reward: {}, autosave: false,
    when: () => !isDone('chand_raat'),
    async script(m) {
      m.flag('lb_match', true);
      onEnd(m, () => { F().lb_match = false; });
      npc(m, 'ayesha', near('lb_stadium', 12, 10), { idle: 'stand', talk: false });
      companion(m, 'immu', near('lb_stadium', -10, 12));
      await talk(m, [
        ['ayesha', 'Colony Cup final. LB Stadium. Real grass, floodlights, a scoreboard. Ashok Nagar again.'],
        ['immu', 'Agent rules: we win this one before New Jersey. Over.'],
        ['ayesha', 'I open the bowling. *Hau, ho jaata.*'],
      ]);
      const r = await game(m, 'match', { home: 'chinnu_xi', away: 'ashok_nagar', venue: 'lb_stadium', overs: 3, intro: 'Colony Cup final at LB Stadium. Ayesha opens the bowling; Immu bats at three.', place: 'lb_stadium' });
      m.flag('lb_match_played', true);
      m.flag('lb_match_unlocked', true);
      if (r && r.win) {
        m.money(2000);
        await talk(m, [['immu', 'Officially magic. Twice.'], ['ayesha', 'Write it in your diary. True this time.']]);
      } else await talk(m, [['ayesha', 'Next year. ...This year, I mean. Rematch.'], ['immu', 'Exhibition match, any evening. Over.']]);
    },
  };

  /* ================================================================== the small activities (bible §7 table, always on) */
  const SMALL = [
    { what: 'Gully cricket', where: 'any colony ground, the Musi riverbed', mg: 'cricket', match: 'playground_' },
    { what: 'Marbles vs Tiger', where: 'Ashok Nagar ground (after 10 golis)', mg: 'marbles', match: 'playground_14' },
    { what: 'Brick game', where: 'video parlours (₹1 a game)', mg: 'brickgame', match: 'video_parlour_' },
    { what: 'Kite flying', where: 'the home terrace, Sankranti', mg: 'kite', match: 'home_terrace' },
    { what: 'Numaish rides', where: 'giant wheel ₹5 (viewpoint), Jan to mid-Feb', shop: 'nampally_exhibition' },
    { what: 'Lumbini boats', where: 'Lumbini jetty, ₹10 (after Agle Baras)', shop: 'lumbini_jetty' },
    { what: 'Free langar', where: 'Gurudwara, Gowliguda (walk only, head covered)', shop: 'gurudwara_gowliguda' },
    { what: 'Ticket Thatha\'s buses', where: 'Koti and the other hubs', shop: 'koti_bus_stand' },
    { what: 'Irani chai', where: 'any Irani café', shop: 'irani_cafe_7' },
    { what: 'Exhibition match', where: 'LB Stadium west gate (after the final)', mg: 'match' },
  ];
  /** Fills gaps only: a small activity whose owner (minigames.js SIDE / shops.js) is missing gets a fallback. */
  function smallActivities() {
    const out = [];
    const MG = N.minigames, SIDE = (MG && MG.SIDE) || [];
    for (const s of SMALL) {
      let ok = false;
      if (s.mg) ok = s.mg === 'match' ? !!(N.cricketMatch || (MG && MG.has && MG.has('match'))) : SIDE.some((e) => e.id === s.mg && (e.match || []).some((q) => s.match.indexOf(q) === 0 || q.indexOf(s.match) === 0));
      if (s.shop) ok = !!(N.shops && N.shops.defs && (N.shops.defs[s.shop] || (N.shops.resolve && N.shops.defs[N.shops.resolve(s.shop)])));
      if (!ok && s.mg && MG && MG.play && s.mg !== 'match' && N.interact && N.interact.add && N.places) {
        for (const id in N.places) {
          if (id.indexOf(s.match) !== 0) continue;
          const q = N.places[id];
          N.interact.add('s2:small:' + s.mg + ':' + id, { x: q.x, y: q.y, r: 20, priority: -1, label: s.what, enabled: () => !(N.missions && N.missions.active), use: () => { MG.play(s.mg, {}); } });
        }
      }
      out.push({ what: s.what, where: s.where, ok, fallback: !ok && !!s.mg });
    }
    S2.small = out;
    return out;
  }

  /* ================================================================== hints, journal, replay */
  function registerHints() {
    if (!N.hints || !N.hints.register) return;
    N.hints.register('agle_baras', { clue: CLUE_PEACOCK, answer: 'kachiguda_station', name: 'Kachiguda station', ammamma: 'A palace with trains in it? Kachiguda, *kanna*. Your Thatha took the Ajanta Express from there.', auto: 'kachiguda_station' });
    N.hints.register('chand_raat', { clue: CLUE_TUNNEL, answer: 'charminar', name: 'Charminar', ammamma: 'Four towers, four clocks: Charminar, *kanna*. Every tunnel story in this city starts there.',
      city: ['Four towers? *Mian*, I sell bangles, not towers. Ask the clock man.', 'Time? Smell this: timeless. Rose attar. ...Towers? Ask the kite man.', 'Four towers, four clocks? Charminar, *beta*. Go up and look. Say Patang Chacha sent you.'] });
  }
  function journalTab() {
    if (!N.menus || !N.menus.addJournalTab) return;
    N.menus.addJournalTab({
      id: 's2_agent', title: 'Agent notes', order: 35,
      render(el) {
        const notes = Array.isArray(F().s2_notes) ? F().s2_notes : [];
        let h = '<div class="s2-notes"><h3>Agent notes</h3>';
        h += notes.length ? '<ul>' + notes.map((n) => '<li>' + emph(n.text) + '</li>').join('') + '</ul>' : '<p>(Nothing in the CID notebook yet.)</p>';
        h += '<h3>Always on</h3><ul>' + (S2.small || SMALL).map((s) => '<li><b>' + esc(s.what) + '</b>: ' + esc(s.where) + '</li>').join('') + '</ul></div>';
        el.innerHTML = h;
      },
    });
  }
  /** Side A replay (bible §9.5): the mission plays again on its own date, then free roam returns to today. */
  function replay(id) {
    if (!N.missions || N.missions.active || SC.cur || !N.missions.defs[id]) return false;
    const d = N.calendar ? N.calendar.date : null;
    const back = d ? [d.y, d.m, d.d, Math.floor(N.clock.minutes / 60), Math.floor(N.clock.minutes % 60)] : null;
    const wasDone = isDone(id);
    S2.replaying = { id, back, wasDone };
    const ok = N.missions.start(id);
    if (!ok) S2.replaying = null;
    return ok;
  }
  function endReplay(ev) {
    const R = S2.replaying;
    if (!R || !ev || ev.id !== R.id) return;
    S2.replaying = null;
    if (R.id === 'chand_raat' && ev.type === 'pass') return; // the finale plays on and the rewind menu picks the season
    if (R.back) later(4.8, () => { if (!N.missions.active && !SC.cur) { try { N.calendar.jumpTo(R.back, { fx: 'ff' }); } catch (e) { N.err('story2.replay', e); } } });
  }

  /* ================================================================== giver NPCs beside the visible markers (bible §4 / §7) */
  const GIVER_NPC = {
    the_clap: { id: 'amma', off: [16, 2] },
    drums_for_amma: { id: 'amma', off: [16, 2], variant: 'bonam' },
    opening_day: { id: 'ammi', off: [14, 2] },
    agle_baras: { id: 'bunty', off: [14, 0], variant: 'committee' },
    last_bell: { id: 'immu', off: [14, 2] },
    twelve_oclock: { id: 'chitti', off: [12, 2] },
    bunty_races: { id: 'bunty', off: [16, 0] }, bunty_races_r2: { id: 'bunty', off: [16, 0] }, bunty_races_r3: { id: 'bunty', off: [16, 0] }, bunty_races_r4: { id: 'bunty', off: [16, 0] },
    new_class_old_books: { id: 'book_man', off: [12, 2] },
    christmas_stars: { id: 'bakery_lady', off: [12, 2] },
    lb_final: { id: 'ayesha', off: [14, 2] },
  };
  const givers = new Map();
  let giverT = 0;
  function giversTick(dt) {
    giverT -= dt;
    if (giverT > 0) return;
    giverT = 0.5;
    if (!N.npcs || !N.npcs.spawn || !N.world || !N.world.built) return;
    let mk = [];
    try { mk = N.missions && !N.missions.active && !SC.cur ? (N.missions.markers() || []).filter((x) => x.kind === 'giver' && GIVER_NPC[x.id]) : []; } catch (e) { mk = []; }
    const want = new Set(), p = N.player;
    for (const g of mk) {
      if (Math.hypot(g.x - p.x, g.y - p.y) > 640) continue;
      const spec = GIVER_NPC[g.id], key = 'giver:' + g.id;
      want.add(key);
      if (!givers.has(key) || !npcGet(key)) {
        try {
          if (spec.variant) variant(spec.id, spec.variant);
          const f = free(g.x + spec.off[0], g.y + spec.off[1]);
          const a = N.npcs.spawn(spec.id, f, { key, idle: 'stand', talk: false, owner: 'story2-giver' });
          if (a) { a.angle = a.baseAngle = Math.atan2(g.y - a.y, g.x - a.x); givers.set(key, a); }
        } catch (e) { N.err('story2.giver', e); }
      }
    }
    for (const key of Array.from(givers.keys())) if (!want.has(key)) { despawn(key); givers.delete(key); }
  }
  function clearGivers() { for (const key of Array.from(givers.keys())) { despawn(key); givers.delete(key); } }

  /* ================================================================== registration, runtime, API */
  const MAIN = [M7, M8, M9, M10, M11, M12];
  const SIDES = [SA5, SA7, SA8, LB].concat(RACES.map(raceDef));
  function register() {
    if (!N.missions || !N.missions.register) return;
    const lbElsewhere = !!(N.missions.defs.lb_exhibition || N.missions.defs.six_balls);
    for (const d of MAIN.concat(SIDES)) {
      if (d.id === 'lb_final' && lbElsewhere) continue; // story.js plays the LB Stadium match (SA4 finale + exhibition)
      N.missions.register(Object.assign({}, d));
    }
  }
  const laters = [];
  function later(sec, fn) { laters.push({ at: nowT() + (sec || 0), fn }); }
  const S2 = { epilogue: false, small: null, replaying: null, finaleRunning: false, pendingSeason: null, lockResult: null, lockState: null, thakSaid: false };
  // what must resume after a load: the interlude, the finale chain (bible §12.10: neither is interruptible)
  function resumeStory() {
    if (SC.cur || S2.finaleRunning || (N.missions && N.missions.active)) return;
    const f = F();
    if (isDone('agle_baras') && !f.interlude_done) { later(0.8, () => startInterlude()); return; }
    if (isDone('chand_raat') && (!f.ending_done || !f.epilogue_done || !f.credits_seen) && !f.postgame) { later(0.8, () => startFinale()); return; }
    if (f.year === 2026 && f.epilogue_done) playSeason(f.season_pick || 'january');
  }
  function startInterlude() {
    if (SC.cur || F().interlude_done) return Promise.resolve(false);
    return runScene('interlude', interludeScene).then((ok) => { if (ok) autosave('interlude'); return ok; });
  }
  N.on('mission:complete', (d) => {
    runCleanups(missionCleanups);
    if (d && d.id === 'agle_baras' && !F().interlude_done) later(4.6, () => startInterlude());
    endReplay({ id: d && d.id, type: 'pass' });
  });
  N.on('mission:fail', (d) => { runCleanups(missionCleanups); endReplay({ id: d && d.id, type: 'fail' }); });
  N.on('mission:abort', (d) => { runCleanups(missionCleanups); endReplay({ id: d && d.id, type: 'abort' }); });
  N.on('mission:start', () => { runCleanups(missionCleanups); clearGivers(); });
  function hardReset() {
    abortScene();
    clearGivers();
    runCleanups(missionCleanups);
    laters.length = 0;
    props.clear();
    for (const T of softTimers) T.stop();
    if (UI.panel) UI.panel.close(null);
    meterHide(); twoChappals(false);
    S2.epilogue = false; S2.replaying = null; S2.finaleRunning = false; S2.pendingSeason = null; S2.thakSaid = false;
    if (N.flags) N.flags.no_save = false;
  }
  N.on('game:new', () => hardReset());
  N.on('game:quit', () => hardReset());
  N.on('save:loaded', () => { hardReset(); later(1.2, resumeStory); });
  N.on('npc:spawn', (d) => {
    if (!d || d.id !== 'immu' || !F().postgame || N.missions && N.missions.active || SC.cur) return;
    let i = 0;
    try { N.npcs.setTalk(d.key, () => N.dialogue.say('immu', IMMU_HANG[i++ % IMMU_HANG.length])); } catch (e) { /* ignore */ }
  });

  function update(dt) {
    const md = mode();
    // scheduled steps
    if (laters.length && md !== 'paused' && md !== 'title' && md !== 'boot') {
      const t = nowT();
      for (let i = laters.length - 1; i >= 0; i--) if (laters[i].at <= t) { const L = laters.splice(i, 1)[0]; try { L.fn(); } catch (e) { N.err('story2.later', e); } }
    }
    if (SC.cur && md !== 'paused') SC.cur.tick();
    panelKeys();
    tickSoftTimers(dt);
    const p = N.player, f = F();
    if (!p) return;
    if (md === 'play') giversTick(dt);
    // 2026: Srikanth's knees (running empties energy in 4 s; THAK GAYA line 8, no penalty)
    if (S2.epilogue && md === 'play') {
      if (p.running) { p.energy = Math.max(0, p.energy - TUNE.epilogueRunDrain * dt); }
      if (p.energy <= 0 && !S2.thakSaid) { S2.thakSaid = true; try { N.hud.banner('THAK GAYA!', 'Four seconds. Four. The knees remember 2003, the rest of me doesn\'t.', 2600, { kind: 'busted' }); } catch (e) { /* ignore */ } }
      if (p.energy > 30) S2.thakSaid = false;
    }
    // M10's lost chappal: the limp lasts until home
    if (f.s2_limp && md === 'play') { const h = placeOf('home'); if (h && Math.hypot(p.x - h.x, p.y - h.y) < 40) { f.s2_limp = false; try { p.clearStatus('limp'); } catch (e) { /* ignore */ } toast('Home. Old chappals from under the bed.', 2000); } }
  }
  function draw() {
    try {
      const f = F();
      if (f.star_lantern && !props.has('s2:lantern')) { const h = near('home', 8, -6); if (h) props.set('s2:lantern', { x: h.x, y: h.y, draw: PAINT.lantern, sort: 4 }); }
      if (!f.star_lantern && props.has('s2:lantern')) props.delete('s2:lantern');
      drawProps();
      drawSceneMarkers();
    } catch (e) { N.err('story2.draw', e); }
  }

  N.story2 = {
    TUNE, SEASONS, CREDIT_LINES, SMALL,
    MISSIONS: MAIN.map((d) => d.id), SIDE: SIDES.map((d) => d.id),
    get scene() { return SC.cur ? SC.cur.id : null; },
    runScene, abortScene,
    interlude: () => startInterlude(),
    ending: () => runScene('ending', endingScene),
    epilogue: () => runScene('epilogue', epilogueScene),
    finale: () => startFinale(),
    rewind: () => rewindMenu(null),
    playSeason, seasons: Object.keys(SEASONS),
    lockDial: (o) => lockDial(SC.cur ? SC.cur.api : { scene: true, wait: () => Promise.resolve(), _sc: { cleanups: [] } }, o),
    cassettesFound, sideBTail, kitesForEnding, smallActivities, patchCredits, replay,
    get panel() { return UI.panel ? { label: UI.panel.el.querySelector('.s2-card') && UI.panel.el.querySelector('.s2-card').getAttribute('aria-label') } : null; },
    lockState: null,
    get lockResult() { return S2.lockResult; },
    /** Test aid: what the current step wants (goal markers, a step target, the offer on ACTION, panels...). */
    probe() {
      const p = N.player, out = { mode: mode(), mission: N.missions && N.missions.active ? N.missions.active.id : null, scene: SC.cur ? SC.cur.id : null };
      out.objective = N.hud && N.hud.objectiveText || null;
      let goals = [];
      try { goals = (N.missions.markers() || []).filter((q) => q.kind === 'goal').map((q) => ({ x: q.x, y: q.y })); } catch (e) { goals = []; }
      if (SC.cur) for (const mk of SC.cur.markers.values()) { const q = placeOf(mk.target); if (q) goals.push({ x: q.x, y: q.y, r: mk.r }); }
      let t = DBG.target; if (typeof t === 'function') { try { t = t(); } catch (e) { t = null; } }
      out.target = t && isFinite(t.x) ? { x: t.x, y: t.y } : goals.length ? goals[goals.length - 1] : null;
      out.goals = goals;
      out.dist = out.target ? Math.hypot(p.x - out.target.x, p.y - out.target.y) : null;
      out.offer = N.input ? N.input.actionLabel : null;
      out.rec = N.tape && N.tape.recState ? N.tape.recState.phase : null;
      out.panel = UI.panel ? (UI.panel.el.className || 'panel') : null;
      out.dialog = !!(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen());
      out.cut = !!(N.menus && N.menus.inCutscene);
      out.mg = N.minigames ? N.minigames.active || null : null;
      out.player = { x: Math.round(p.x), y: Math.round(p.y), level: p.level || null, vehicle: p.vehicle ? p.vehicle.type : null };
      out.wanted = (N.wanted && N.wanted.level) | 0;
      out.counter = N.tape ? N.tape.counter : null; out.paused = N.tape ? !!N.tape.paused : null;
      out.date = N.calendar ? N.calendar.label() + ' ' + N.clock.label() : null;
      out.gallery = S2.gallery ? { cam: { x: S2.gallery.cam.x, y: S2.gallery.cam.y }, coat: { x: S2.gallery.coat.x, y: S2.gallery.coat.y } } : null;
      out.chase = !!S2.chase;
      out.lock = N.story2.lockState;
      out.errors = (N.errors || []).length;
      return out;
    },
    /** Test aid: move the player (and the vehicle he rides) to a walkable point near (x, y). */
    tp(x, y) {
      const p = N.player, v = p.vehicle;
      if (v) {
        const f = free(x, y, v.T && v.T.mode === 'boat' ? 'boat' : 'drive', 30);
        // a target off the road (a statue on the bund footpath): get off and go on foot, unless he must stay on board
        if (Math.hypot(f.x - x, f.y - y) > 40 && v.passenger !== p && !v.lockPassenger && !(v.T && v.T.mode === 'boat') && N.vehicles && has(N.vehicles, 'exit')) { try { N.vehicles.exit(p, true); } catch (e) { /* ignore */ } }
        else { v.x = f.x; v.y = f.y; v.vx = v.vy = 0; v.speed = 0; v.okX = null; p.x = f.x; p.y = f.y; return f; }
      }
      if (p.vehicle) return { x: p.x, y: p.y };
      const f = free(x, y, 'walk', 30); p.teleport(f.x, f.y); return { x: p.x, y: p.y };
    },
    state() {
      const f = F();
      return {
        scene: SC.cur ? SC.cur.id : null, lastScene: SC.last, epilogue: S2.epilogue, finale: S2.finaleRunning, panel: UI.panel ? true : false,
        flags: ['clue_tunnel', 'riddle_4', 'lock_3', 'lock_4', 'interlude_done', 'ayesha_moving', 'prasads_open', 'boats_open', 'tin_locked', 'ending_done', 'epilogue_done', 'credits_seen', 'postgame', 'season_pick', 'lock_opened', 'star_lantern', 'immu_email', 'sa6_race', 'lb_match_played', 'frame_24', 'm12_chase'].reduce((o, k) => { o[k] = f[k]; return o; }, {}),
        props: Array.from(props.keys()), cassettes: cassettesFound(), kites: kitesForEnding(), small: S2.small,
      };
    },
  };

  N.addSystem({
    id: 'story2', order: 12, runIn: ['play', 'dialogue', 'cutscene', 'minigame', 'gameover'],
    init() {
      ensureCSS();
      registerHints();
      register();
      journalTab();
      patchCredits();
      if (N.story && typeof N.story.replay !== 'function') N.story.replay = replay;
    },
    update,
    draw,
    reset() { hardReset(); },
  });
  N.on('boot', () => {
    try { if (N.dialogue && N.dialogue.define && !(N.dialogue.speakers || {}).chinnu_immu) N.dialogue.define('chinnu_immu', { name: '{nick} + Immu', color: '#f2c230', voice: 1.05, portrait: false }); } catch (e) { N.err('story2.speaker', e); }
    patchCredits();
    smallActivities();
    if (N.story && typeof N.story.replay !== 'function') N.story.replay = replay;
  });
})();
