/* NOSTALGIA — cheats.js: typed cheat codes for play-testing (owner request, 2026-10-22: "type a code and go to
 * Diwali time or Ramzan time ... for every stage"). Builds on the console snippet in the "Missions, Story & Test
 * Cheat Codes" doc (nostalgiaJump), which ran every mission headless with zero errors.
 *
 * WHERE TO TYPE (N.cheats.enabled; default ON for this testing build, set DEFAULT_ENABLED to false for release)
 *   - in free roam: C (desktop; ignored when the player has bound C to an action in Settings > Controls)
 *   - the pause deck's "Cheats" key and the title screen's CHEAT CODE track (touch, pad, keyboard)
 *   The card has one text field (Enter applies) and the code book below it; typing filters the book, a tap on a
 *   row applies that code. Spaces, dashes, underscores and case never matter: "chand raat" = CHANDRAAT.
 *
 * CODES
 *   Stage codes jump to a stage of the story: a fresh game in memory where every earlier main mission is done (tape
 *   counter, tin tokens, lock digits, unlocks and story flags filled in), the calendar on that stage's date, and the
 *   stage started. PROLOGUE, SANKRANTI (M1) .. GANESH (M10), DIWALI (Diwali week, Mon 20 Oct), INTERLUDE (Sat 1 Nov),
 *   RAMZAN (free roam on a Ramzan night at Charminar, Sat 15 Nov 20:30), LASTBELL (M11), CHANDRAAT (M12),
 *   EID (the ending, from Eid morning), EPILOGUE (2026), REWIND (post-game season menu), CHRISTMAS (SA8).
 *   Each stage also answers to its mission name, M1..M12 / TRACK1..TRACK12 and a few nicknames (STAGES[].alias).
 *   Activity codes: every side activity and odd job by its id (SIXBALLS, MITHAIRUN, JOBPAPERROUND...) plus short
 *   nicknames (MITHAI, DIYAS, ROCKET, TIGER, PANDAL...): the game is set to the main mission it waits for, a valid
 *   date / time, then it starts. The Diwali-week ones play inside the story's Diwali week.
 *   Other codes keep the game: MORNING / NOON / EVENING / NIGHT (clock), NEXT (the next stage: the one after the
 *   running one, else the first one not played), PASS (pass the running mission), SKIPTALK, AUTOWIN (story
 *   minigames play and win by themselves), GODMODE, NOCHAPPAL, MYGAME.
 *
 * SAVES  A stage or activity code replaces the game in memory, and the next autosave writes it over Side A. Before the
 *   first jump the player's own save (the main slot, when it is not itself from a cheat) is copied to localStorage
 *   'nostalgia.cheats.mygame'; MYGAME puts it back and continues it. A cheat game carries N.flags.cheat (its code).
 *
 * API  N.cheats = {enabled, STAGES, apply(code) -> {ok, msg, kind}, lookup(code) -> entry | null, jump(id),
 *        stage(code), open({from}), close(), list() -> code book rows, hasMyGame(), restore()}
 *      N.debug.jump(id) / N.debug.cheat(code) (console, any build). Events: 'cheat' {code, kind, id}.
 *      Telemetry (when on): 'cheat' {code}, so testers' sessions can be told apart.
 * Hooks in files this module does not own (marked "[cheats hook]"): index.html (script tag), menus.js (the pause
 *   deck key, the title track), style.css (the card).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;

  const DEFAULT_ENABLED = true;           // release builds: set to false (N.debug.cheat keeps working)
  const BACKUP_KEY = 'nostalgia.cheats.mygame';
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = (k) => { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const F = () => N.flags || (N.flags = {});
  const isDone = (id) => { try { return !!(N.missions && N.missions.isDone(id)); } catch (e) { return false; } };
  const mode = () => (N.state && N.state.mode) || 'boot';
  const inGame = () => { const m = mode(); return m !== 'boot' && m !== 'title'; };
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600); } catch (e) { N.err('cheats.toast', e); } }

  /* ================================================================ the story's order (the doc's snippet) */
  const MAIN_IDS = ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right', 'ammammas_thursday',
    'the_clap', 'drums_for_amma', 'opening_day', 'agle_baras', 'last_bell', 'chand_raat'];
  const MAIN = () => { try { const S = N.calendar && N.calendar.STORY; if (S && S.length) return S.map((s) => s.id); } catch (e) { /* ignore */ } return MAIN_IDS; };
  const DIWALI_IDS = ['pataakha_bazaar', 'mithai_run', 'deepon_ki_raat', 'rocket_bunty', 'tiger_ko_bachao'];
  // side activities: the main mission each one waits for (odd jobs open after M1)
  const NEEDS = {
    sunday_mutton: 'lost_and_found', bunty_races: 'first_day_first_show', current_poyindi: 'last_man_batting',
    six_balls: 'right_right', twelve_oclock: 'right_right', lb_exhibition: 'right_right', new_class_old_books: 'ammammas_thursday',
    pandal_duty: 'ammammas_thursday', bunty_races_r2: 'the_clap', bunty_races_r3: 'the_clap', bunty_races_r4: 'the_clap',
    pataakha_bazaar: 'agle_baras', mithai_run: 'agle_baras', deepon_ki_raat: 'agle_baras', rocket_bunty: 'agle_baras', tiger_ko_bachao: 'agle_baras',
    christmas_stars: 'chand_raat', lb_final: 'right_right',
  };
  // a valid date and time for each side activity (main missions jump to their own date)
  const WHEN = {
    sunday_mutton: [2003, 2, 2, 7, 15], bunty_races: [2003, 2, 15, 16, 30], bunty_races_r2: [2003, 2, 15, 16, 45],
    bunty_races_r3: [2003, 2, 15, 16, 30], bunty_races_r4: [2003, 2, 15, 16, 30], current_poyindi: [2003, 3, 24, 19, 5],
    six_balls: [2003, 4, 28, 6, 10], twelve_oclock: [2003, 4, 10, 11, 30], lb_exhibition: [2003, 4, 28, 10, 0], lb_final: [2003, 4, 28, 10, 0],
    new_class_old_books: [2003, 6, 9, 10, 0], pandal_duty: [2003, 9, 1, 21, 5], pataakha_bazaar: [2003, 10, 21, 10, 0],
    mithai_run: [2003, 10, 25, 15, 5], deepon_ki_raat: [2003, 10, 25, 18, 35], rocket_bunty: [2003, 10, 25, 19, 5],
    tiger_ko_bachao: [2003, 10, 25, 19, 5], christmas_stars: [2003, 12, 21, 10, 0],
  };
  const RAMZAN_NIGHT = [2003, 11, 15, 20, 30]; // a Saturday of Ramzan 2003 (27 Oct - 25 Nov), the night bazaar is on

  /* ================================================================ stages (the code book's first section) */
  // id: a main / side mission; stage: a story beat that is not a mission. chain: false = left out of NEXT.
  const STAGES = [
    { code: 'PROLOGUE', stage: 'prologue', title: 'Prologue · Side B, 2026', when: 'WED 14 JAN 2026', alias: ['INTRO', 'CASSETTE'] },
    { code: 'SANKRANTI', id: 'bo_kaata', alias: ['KITES', 'PATANG'] },
    { code: 'NUMAISH', id: 'lost_and_found', alias: ['EXHIBITION'] },
    { code: 'FIRSTSHOW', id: 'first_day_first_show', alias: ['FDFS', 'SANDHYA'] },
    { code: 'WORLDCUP', id: 'last_man_batting', alias: ['HOWZAAT', 'CRICKET'] },
    { code: 'UGADI', id: 'right_right', alias: ['BUS'] },
    { code: 'SUMMER', id: 'ammammas_thursday', alias: ['AMMAMMA', 'GIRNI'] },
    { code: 'GOLCONDA', id: 'the_clap', alias: ['CLAP', 'MIDPOINT'] },
    { code: 'BONALU', id: 'drums_for_amma', alias: ['DRUMS'] },
    { code: 'PRASADS', id: 'opening_day', alias: ['IMAX'] },
    { code: 'GANESH', id: 'agle_baras', alias: ['GANPATI', 'NIMAJJANAM', 'IMMERSION'] },
    { code: 'DIWALI', stage: 'diwali', title: 'Diwali week', when: 'MON 20 OCT 2003', alias: ['DEEPAVALI', 'DIWALIWEEK', 'DEEWALI'] },
    { code: 'INTERLUDE', stage: 'interlude', title: 'Interlude · Side A ■ Paused', when: 'SAT 01 NOV 2003', alias: ['PAUSED', 'TICKETS'] },
    { code: 'RAMZAN', stage: 'ramzan', title: 'Ramzan nights · free roam at Charminar', when: 'SAT 15 NOV 2003 · 20:30', chain: false, alias: ['RAMADAN', 'RAMZAAN', 'HALEEM', 'ROZA'] },
    { code: 'LASTBELL', id: 'last_bell', alias: ['NAUBATPAHAD', 'SCHOOL'] },
    { code: 'CHANDRAAT', id: 'chand_raat', alias: ['FINALE', 'CHARMINAR'] },
    { code: 'EID', stage: 'ending', title: 'The ending · Eid, then the night flight', when: 'WED 26 NOV 2003', alias: ['ENDING', 'EIDMUBARAK'] },
    { code: 'EPILOGUE', stage: 'epilogue', title: 'Epilogue · Side B', when: 'SAT 17 JAN 2026', alias: ['SIDEB'] },
    { code: 'REWIND', stage: 'rewind', title: 'Post-game · ◀◀ play any season of 2003', when: 'after the credits', chain: false, alias: ['POSTGAME', 'SEASONS'] },
    { code: 'CHRISTMAS', id: 'christmas_stars', alias: ['XMAS', 'STARS'] },
  ];
  STAGES.forEach((s) => {
    if (s.chain == null) s.chain = true;
    const k = s.id ? MAIN_IDS.indexOf(s.id) : -1;
    if (k >= 0) s.alias = s.alias.concat(['M' + (k + 1), 'TRACK' + (k + 1), 'TRACK' + String(k + 1).padStart(2, '0')]);
  });
  // short names for side activities and odd jobs (their full ids work too)
  const NICK = {
    MUTTON: 'sunday_mutton', RACES: 'bunty_races', RACE1: 'bunty_races', RACE2: 'bunty_races_r2', RACE3: 'bunty_races_r3', RACE4: 'bunty_races_r4',
    POWERCUT: 'current_poyindi', LBMATCH: 'lb_exhibition', GONG: 'twelve_oclock', BOOKS: 'new_class_old_books', PANDAL: 'pandal_duty',
    PATAAKHA: 'pataakha_bazaar', CRACKERS: 'pataakha_bazaar', MITHAI: 'mithai_run', SWEETS: 'mithai_run', DIYAS: 'deepon_ki_raat',
    DEEPON: 'deepon_ki_raat', ROCKET: 'rocket_bunty', TIGER: 'tiger_ko_bachao',
  };
  const TOOLS = [
    { code: 'MORNING', title: 'Clock to 07:00', run: () => clock(7, 0) },
    { code: 'NOON', title: 'Clock to 12:00', run: () => clock(12, 0) },
    { code: 'EVENING', title: 'Clock to 17:30', run: () => clock(17, 30) },
    { code: 'NIGHT', title: 'Clock to 21:00', run: () => clock(21, 0) },
    { code: 'NEXT', title: 'The next stage of the story', run: () => next() },
    { code: 'PASS', title: 'Pass the running mission', run: () => pass() },
    { code: 'SKIPTALK', title: 'Dialogue skips itself (on / off)', run: () => skipTalk() },
    { code: 'AUTOWIN', title: 'Story minigames win themselves (on / off)', run: () => autoWin() },
    { code: 'GODMODE', title: 'No energy drain, no falls (on / off)', alias: ['GOD'], run: () => god() },
    { code: 'NOCHAPPAL', title: 'Chappal Meter to 0', alias: ['CLEAR'], run: () => noChappal() },
    { code: 'MYGAME', title: 'Back to your own saved game', alias: ['RESTORE', 'MYSAVE'], run: () => restore() },
  ];

  /* ================================================================ lookup */
  function missionDefs() { return (N.missions && N.missions.defs) || {}; }
  function jobDefs() { return (N.sidejobs && N.sidejobs.defs) || {}; }
  let index = null;
  function buildIndex() {
    const ix = Object.create(null);
    const put = (code, e) => { const k = norm(code); if (k && !ix[k]) ix[k] = e; };
    for (const s of STAGES) { put(s.code, { kind: 'stage', s }); }
    for (const t of TOOLS) { put(t.code, { kind: 'tool', t }); for (const a of t.alias || []) put(a, { kind: 'tool', t }); }
    for (const s of STAGES) { if (s.id) put(s.id, { kind: 'stage', s }); for (const a of s.alias) put(a, { kind: 'stage', s }); }
    for (const k of Object.keys(NICK)) put(k, { kind: 'act', id: NICK[k] });
    for (const id of Object.keys(missionDefs())) put(id, { kind: 'act', id });
    for (const id of Object.keys(jobDefs())) { put(id, { kind: 'act', id }); put(id.replace(/^job_/, ''), { kind: 'act', id }); }
    return ix;
  }
  function lookup(code) {
    if (!index || index._n !== Object.keys(missionDefs()).length + Object.keys(jobDefs()).length) {
      index = buildIndex();
      index._n = Object.keys(missionDefs()).length + Object.keys(jobDefs()).length;
    }
    const k = norm(code);
    return k ? index[k] || null : null;
  }

  /* ================================================================ your own game, kept aside */
  let memBackup = null;
  function cheatSave(blob) { return !!(blob && blob.data && blob.data.flags && blob.data.flags.cheat); }
  function backupOnce() {
    try {
      const S = N.save;
      if (!S || !S.slotBlob) return;
      const blob = S.slotBlob('main');
      if (!blob || cheatSave(blob)) return;
      const raw = S.slotRaw('main');
      memBackup = raw;
      lsSet(BACKUP_KEY, raw);
    } catch (e) { N.err('cheats.backup', e); }
  }
  function hasMyGame() { return !!(lsGet(BACKUP_KEY) || memBackup); }
  function restore() {
    const raw = lsGet(BACKUP_KEY) || memBackup;
    if (!raw) return { ok: false, msg: 'No game of yours is put aside (it is kept when a stage code first replaces it).' };
    let blob = null;
    try { blob = JSON.parse(raw); } catch (e) { blob = null; }
    if (!blob || !N.save || !N.save.importBlob) return { ok: false, msg: 'Your game could not be read back.' };
    blob.t = Date.now(); // newer than the cheat game's autosaves, so the slot guard lets it back in
    const r = N.save.importBlob('main', blob);
    if (!r.ok) return { ok: false, msg: 'Could not put your game back (' + r.why + ').' };
    lsDel(BACKUP_KEY); memBackup = null;
    closeUi();
    try { N.game.continueGame(); } catch (e) { N.err('cheats.restore', e); }
    setTimeout(() => toast('Your own game is back: ' + (N.clock ? N.clock.dateLabel() : ''), 3200), 400);
    return { ok: true, msg: 'Your game is back.', kind: 'restore' };
  }

  /* ================================================================ the jump */
  function unlockBus(hub) { try { if (N.shops && N.shops.unlockBus) N.shops.unlockBus(hub); } catch (e) { N.err('cheats.bus', e); } }
  /** A fresh game in memory with `done` played. o: {code, diwali: 'week' | 'done', interlude, post} */
  function freshGame(done, o) {
    backupOnce();
    closeUi();
    N.game.newGame({ skipIntro: true });
    N.missions.deserialize({ done });
    const main = MAIN(), has = (id) => done.indexOf(id) >= 0;
    for (const id of done) if (main.indexOf(id) >= 0 && N.tape && N.tape.rec) N.tape.rec(id, { silent: true });
    const f = F(), p = N.player;
    f.prologue_seen = true;
    f.year = 2003;
    if (p && p.inventory) { p.inventory.add('walkman'); if (has('bo_kaata')) p.inventory.add('camera'); }
    if (has('lost_and_found')) Object.assign(f, { lock_2: 4, riddle_2: true });
    if (has('first_day_first_show')) Object.assign(f, { meter_live: true, sa6_unlocked: true });
    if (has('last_man_batting')) Object.assign(f, { lock_1: 1, riddle_1: true });
    if (has('right_right')) { unlockBus(); f.bus_unlocked = true; }
    if (has('ammammas_thursday')) f.clue5_solved = true;
    if (has('the_clap')) { unlockBus('mehdipatnam'); unlockBus('golconda'); Object.assign(f, { bus_golconda: true, bus_mehdipatnam: true }); }
    if (has('opening_day')) f.prasads_open = true;
    if (has('agle_baras')) Object.assign(f, { lock_4: 1, riddle_4: true, clue_tunnel: true, boats_open: true });
    if (o.diwali) f.dw_story = o.diwali;
    if (o.interlude) {
      Object.assign(f, { interlude_done: true, ayesha_moving: true });
      if (!has('last_bell') && N.tape && N.tape.pause) { try { N.tape.setCounter(Math.max(812, N.tape.counter | 0)); N.tape.pause(true); } catch (e) { N.err('cheats.tape', e); } }
    }
    if (has('last_bell')) Object.assign(f, { lock_3: 0, riddle_3: true });
    if (has('chand_raat')) Object.assign(f, { tin_locked: true, frame_24: true });
    if (o.ending) f.ending_done = true;
    if (o.post) Object.assign(f, { ending_done: true, epilogue_done: true, credits_seen: true, postgame: true });
    f.cheat = String(o.code || 'jump').toLowerCase();
    if (N.wanted && N.wanted.set) { try { N.wanted.set(0); } catch (e) { /* ignore */ } }
  }
  /** the main missions before `id` (or before the one it waits for, for a side activity), plus its side prerequisites */
  function doneFor(id) {
    const main = MAIN();
    let upto = main.indexOf(id);
    if (upto < 0) {
      const need = NEEDS[id] || lastMainRequire(id) || (/^job_/.test(id) ? 'bo_kaata' : null);
      upto = need ? main.indexOf(need) + 1 : 0;
    }
    const done = main.slice(0, Math.max(0, upto));
    for (const r of sideRequires(id)) if (done.indexOf(r) < 0) done.push(r);
    return done;
  }
  function lastMainRequire(id) {
    const d = missionDefs()[id], main = MAIN();
    let best = null;
    for (const r of (d && d.requires) || []) if (main.indexOf(r) > main.indexOf(best)) best = r;
    return best;
  }
  /** side activities that must be played first (lb_exhibition after six_balls, race 2 after race 1 ...) */
  function sideRequires(id, seen) {
    seen = seen || new Set();
    const out = [];
    const d = missionDefs()[id], main = MAIN();
    for (const r of (d && d.requires) || []) {
      if (main.indexOf(r) >= 0 || seen.has(r)) continue;
      seen.add(r);
      for (const q of sideRequires(r, seen)) if (out.indexOf(q) < 0) out.push(q);
      if (out.indexOf(r) < 0) out.push(r);
    }
    if (/^bunty_races_r(\d)$/.test(id)) for (let n = 2; n < +id.slice(-1); n++) if (out.indexOf('bunty_races_r' + n) < 0) out.push('bunty_races_r' + n);
    if (/^bunty_races_r\d$/.test(id) && out.indexOf('bunty_races') < 0) out.unshift('bunty_races');
    if (id === 'lb_exhibition' && out.indexOf('six_balls') < 0) out.push('six_balls');
    return out;
  }
  function placeFree(x, y) {
    try { if (!N.world.isWalkable(x, y)) { const f = N.world.findFree(x, y, 'walk', 40); if (f) return f; } } catch (e) { /* ignore */ }
    return { x, y };
  }
  /** stand by a mission's giver (not on a roof: the scripts climb there themselves) */
  function toGiver(def) {
    try {
      const g = def && def.giver;
      if (!g || !N.missions.giverPos) return;
      const pl = g.place && N.places[g.place];
      if (pl && (pl.level || pl.roof || pl.kind === 'terrace')) return;
      const at = N.missions.giverPos(def);
      if (!at || !isFinite(at.x) || at.level) return;
      const q = placeFree(at.x, at.y + 6);
      N.player.teleport(q.x, q.y);
      if (N.render && N.render.snapCamera) N.render.snapCamera();
    } catch (e) { N.err('cheats.giver', e); }
  }
  /** Play mission / side activity / odd job `id` from a fresh game set up for it. */
  function jump(id, code) {
    const defs = missionDefs(), job = jobDefs()[id];
    if (!defs[id] && !job) return { ok: false, msg: 'No mission called ' + id + '.' };
    const main = MAIN();
    const done = doneFor(id);
    const k = main.indexOf(id), has = (m) => done.indexOf(m) >= 0;
    const dw = DIWALI_IDS.indexOf(id) >= 0;
    // past Track 10 the Diwali week and the interlude have been played, unless the activity is one of the week's own
    const o = { code: code || id };
    if (dw) o.diwali = 'week';
    else if (has('agle_baras')) { o.diwali = 'done'; o.interlude = true; }
    if (has('chand_raat') && k < 0) o.post = true;
    freshGame(done, o);
    if (id === 'current_poyindi') F().force_power_cut = true;
    if (WHEN[id]) { try { N.calendar.set.apply(N.calendar, WHEN[id]); } catch (e) { N.err('cheats.when', e); } }
    else if (job && job.window && N.clock) { const r = /^(\d{1,2}):(\d{2})$/.exec(String(job.window.from || '')); if (r) N.clock.set(+r[1], +r[2]); }
    if (dw) { try { if (N.dwMissions && N.dwMissions.story) N.dwMissions.story.resume(); } catch (e) { N.err('cheats.diwali', e); } }
    if (/^job_/.test(id) && N.sidejobs && N.sidejobs.start) {
      toGiver(defs[id] || job);
      const ok = N.sidejobs.start(id, { force: true });
      return { ok: ok !== false, msg: (job.title || id) + ' (odd job)', kind: 'act' };
    }
    toGiver(defs[id]);
    const ok = N.missions.start(id);
    return { ok: ok !== false, msg: (defs[id].title || id) + (k >= 0 ? ' · Track ' + String(k + 1).padStart(2, '0') : ''), kind: 'act' };
  }
  function stageLine(s) {
    if (s.title) return { title: s.title, when: s.when };
    const C = N.calendar, se = C && C.storyEntry ? C.storyEntry(s.id) : null, d = missionDefs()[s.id];
    let when = '';
    try { const dt = (d && d.date) || (se && se.date) || WHEN[s.id]; if (dt && C) when = C.dateOf(C.dayOf(dt[0], dt[1], dt[2])).label; } catch (e) { when = ''; }
    const title = se ? 'Track ' + String(se.track).padStart(2, '0') + ' · ' + se.title : (d && d.title) || s.id;
    return { title, when };
  }
  /** The story beats that are not missions */
  function runStage(s) {
    const code = s.code, main = MAIN(), S2 = N.story2;
    if (s.id) return jump(s.id, code);
    if (s.stage === 'prologue') {
      backupOnce();
      closeUi();
      N.game.newGame({ skipIntro: true });
      F().cheat = 'prologue';
      try { if (N.story && N.story.prologue) N.story.prologue(); } catch (e) { N.err('cheats.prologue', e); }
      return { ok: true, msg: s.title, kind: 'stage' };
    }
    if (s.stage === 'diwali') {
      freshGame(main.slice(0, main.indexOf('agle_baras') + 1), { code });
      try { if (N.dwMissions && N.dwMissions.story) N.dwMissions.story.begin(); } catch (e) { N.err('cheats.diwali', e); }
      return { ok: true, msg: 'Diwali week, 2003', kind: 'stage' };
    }
    if (s.stage === 'interlude') {
      freshGame(main.slice(0, main.indexOf('agle_baras') + 1), { code, diwali: 'done' });
      try { if (S2 && S2.interlude) S2.interlude(); } catch (e) { N.err('cheats.interlude', e); }
      return { ok: true, msg: s.title, kind: 'stage' };
    }
    if (s.stage === 'ramzan') {
      freshGame(main.slice(0, main.indexOf('agle_baras') + 1), { code, diwali: 'done', interlude: true });
      const c = (N.places && (N.places.charminar_plaza || N.places.charminar)) || null;
      if (c) { const q = placeFree(c.x, c.y + 40); N.player.teleport(q.x, q.y); }
      else if (N.debug && N.debug.teleport) N.debug.teleport('charminar');
      if (N.render && N.render.snapCamera) N.render.snapCamera();
      try { N.calendar.jumpTo(RAMZAN_NIGHT, { fx: 'ff' }); } catch (e) { N.err('cheats.ramzan', e); }
      setTimeout(() => toast('Ramzan, 2003. Green lights on the Charminar, haleem bhattis in the lanes. Home by 23:30.', 4200), 1800);
      return { ok: true, msg: 'Ramzan nights, 2003', kind: 'stage' };
    }
    if (s.stage === 'ending' || s.stage === 'epilogue') {
      freshGame(main.slice(), { code, diwali: 'done', interlude: true, ending: s.stage === 'epilogue' });
      try { if (S2 && S2.finale) S2.finale(); } catch (e) { N.err('cheats.finale', e); }
      return { ok: true, msg: s.title, kind: 'stage' };
    }
    if (s.stage === 'rewind') {
      freshGame(main.slice(), { code, diwali: 'done', interlude: true, post: true });
      try {
        if (S2 && S2.rewind) Promise.resolve(S2.rewind({ stay: true })).then((k) => { if (k && S2.playSeason) S2.playSeason(k); }, (e) => N.err('cheats.rewind', e));
      } catch (e) { N.err('cheats.rewind', e); }
      return { ok: true, msg: s.title, kind: 'stage' };
    }
    return { ok: false, msg: 'Unknown stage.' };
  }

  /* ================================================================ the codes that keep the game */
  function needGame() { return inGame() ? null : { ok: false, msg: 'Start a game first (or type a stage code like DIWALI).' }; }
  function clock(h, m) {
    const ng = needGame(); if (ng) return ng;
    N.clock.set(h, m);
    return { ok: true, msg: 'Clock: ' + N.clock.label(), kind: 'tool' };
  }
  function stageProgress() {
    const f = F(), A = N.missions && N.missions.active, scene = N.story2 && N.story2.scene;
    const chain = STAGES.filter((s) => s.chain);
    let cur = -1;
    if (A) cur = chain.findIndex((s) => s.id === A.id);
    if (cur < 0 && scene) cur = chain.findIndex((s) => s.stage === scene || (s.stage === 'diwali' && /^diwali/.test(scene)));
    if (cur < 0 && f.dw_story === 'week' && !f.interlude_done) cur = chain.findIndex((s) => s.stage === 'diwali');
    const doneStage = (s) => {
      if (s.id) return isDone(s.id);
      if (s.stage === 'prologue') return !!f.prologue_seen;
      if (s.stage === 'diwali') return f.dw_story === 'done' || !!f.interlude_done || isDone('last_bell');
      if (s.stage === 'interlude') return !!f.interlude_done || isDone('last_bell');
      if (s.stage === 'ending') return !!f.ending_done || !!f.postgame;
      if (s.stage === 'epilogue') return !!f.epilogue_done || !!f.postgame;
      return true;
    };
    return { chain, cur, first: chain.findIndex((s) => !doneStage(s)) };
  }
  function next() {
    const ng = needGame(); if (ng) return ng;
    const P = stageProgress();
    const s = P.cur >= 0 ? P.chain[P.cur + 1] : P.chain[P.first];
    if (!s) return { ok: false, msg: 'Nothing after this on the tape. Try REWIND or CHRISTMAS.' };
    const r = runStage(s);
    if (r.ok) r.msg = '▶▶ ' + s.code + ' · ' + r.msg;
    return r;
  }
  function pass() {
    const ng = needGame(); if (ng) return ng;
    if (!N.missions || !N.missions.active) return { ok: false, msg: 'No mission is running (NEXT jumps to the next stage).' };
    const id = N.missions.active.id;
    closeUi();
    N.missions.complete();
    return { ok: true, msg: 'Passed: ' + ((missionDefs()[id] || {}).title || id), kind: 'tool' };
  }
  function skipTalk() {
    const on = !(N.dialogue && N.dialogue.skip);
    if (N.debug && N.debug.skipDialogue) N.debug.skipDialogue(on);
    return { ok: true, msg: 'Dialogue skip ' + (on ? 'ON' : 'OFF'), kind: 'tool' };
  }
  let autoWinOn = false;
  function autoWin() {
    autoWinOn = !autoWinOn;
    try { if (N.story && N.story.debug) N.story.debug.mg = autoWinOn ? 'win' : null; } catch (e) { /* ignore */ }
    try { if (N.story2 && N.story2.TUNE) N.story2.TUNE.mg = autoWinOn ? { autoplay: 'win', skipHowto: true } : null; } catch (e) { /* ignore */ }
    return { ok: true, msg: 'Story minigames win by themselves: ' + (autoWinOn ? 'ON' : 'OFF'), kind: 'tool' };
  }
  function god() {
    const ng = needGame(); if (ng) return ng;
    const on = N.debug.god(!N.player.god);
    return { ok: true, msg: 'God mode ' + (on ? 'ON' : 'OFF'), kind: 'tool' };
  }
  function noChappal() {
    const ng = needGame(); if (ng) return ng;
    if (N.debug.setWanted) N.debug.setWanted(0);
    return { ok: true, msg: 'Chappal Meter cleared', kind: 'tool' };
  }

  /* ================================================================ apply */
  function apply(code) {
    const e = lookup(code);
    if (!e) return { ok: false, msg: norm(code) ? '"' + String(code).trim() + '" is not a code. The code book is below.' : 'Type a code.' };
    if (mode() === 'boot' || !N.world || !N.world.built) return { ok: false, msg: 'Still loading the city.' };
    let r;
    try {
      if (e.kind === 'tool') r = e.t.run();
      else if (e.kind === 'stage') r = runStage(e.s);
      else r = jump(e.id, e.id);
    } catch (err) {
      N.err('cheats.apply', err);
      r = { ok: false, msg: 'That code broke something: ' + ((err && err.message) || err) };
    }
    r = r || { ok: false, msg: '' };
    if (r.ok) {
      const name = e.kind === 'tool' ? e.t.code : e.kind === 'stage' ? e.s.code : norm(e.id);
      r.code = name;
      N.emit('cheat', { code: name, kind: e.kind, id: e.id || (e.s && e.s.id) || null });
      try { if (N.telemetry && N.telemetry.track) N.telemetry.track('cheat', { code: name.toLowerCase().slice(0, 40) }); } catch (er) { /* ignore */ }
      if (r.kind === 'tool') toast('✱ ' + r.msg, 2200);
      else if (r.kind !== 'restore') setTimeout(() => toast('✱ CHEAT · ' + name + ' · ' + r.msg, 3000), 250);
    }
    return r;
  }

  /* ================================================================ the card */
  let panel = null;
  const ui = { from: null, msg: '', kind: '' };
  function list() {
    const rows = [];
    for (const s of STAGES) { if (s.id && !missionDefs()[s.id]) continue; const L = stageLine(s); rows.push({ sec: 'stage', code: s.code, title: L.title, when: L.when, alias: s.alias.concat(s.id ? [s.id] : []) }); }
    const nickOf = {}; for (const k of Object.keys(NICK)) if (!nickOf[NICK[k]]) nickOf[NICK[k]] = k;
    const sides = Object.keys(missionDefs()).filter((id) => {
      const d = missionDefs()[id];
      return d && (d.kind === 'side') && !/^job_/.test(id) && id !== 'diwali_week' && STAGES.every((s) => s.id !== id);
    });
    for (const id of sides) rows.push({ sec: 'side', code: nickOf[id] || norm(id), title: missionDefs()[id].title || id, when: WHEN[id] ? whenLabel(WHEN[id]) : '', alias: [norm(id), id] });
    for (const id of Object.keys(jobDefs())) rows.push({ sec: 'job', code: norm(id.replace(/^job_/, '')), title: jobDefs()[id].title || id, when: '', alias: [norm(id), id] });
    for (const t of TOOLS) rows.push({ sec: 'tool', code: t.code, title: t.title, when: '', alias: t.alias || [] });
    return rows;
  }
  function whenLabel(w) { try { return N.calendar.dateOf(N.calendar.dayOf(w[0], w[1], w[2])).label + ' · ' + String(w[3]).padStart(2, '0') + ':' + String(w[4]).padStart(2, '0'); } catch (e) { return ''; } }
  const SECS = [['stage', 'Story stages', 'A fresh game at that stage: every main mission before it counts as done.'],
    ['side', 'Side activities', 'Set up for the activity (the main mission it waits for is done), then it starts.'],
    ['job', 'Odd jobs', 'Starts the job now, whatever the hour.'],
    ['tool', 'Time and helpers', 'These keep your game.']];
  function render() {
    if (!panel || !panel.el) return;
    const D = panel.dom, rows = list();
    D.msg.textContent = ui.msg || '';
    D.msg.className = 'ch-msg' + (ui.kind ? ' ' + ui.kind : '');
    D.msg.hidden = !ui.msg;
    let h = '';
    for (const [sec, head, sub] of SECS) {
      const rs = rows.filter((r) => r.sec === sec);
      if (!rs.length) continue;
      h += '<section class="ch-sec" data-sec="' + sec + '"><h3>' + esc(head) + '</h3><p class="ch-sub">' + esc(sub) + '</p><div class="ch-list ' + (sec === 'stage' ? 'rows' : 'chips') + '">';
      for (const r of rs) {
        // codes, aliases and the title's words: typing matches the start of any of them
        const keys = [r.code].concat(r.alias, String(r.title).split(/[\s·:,!.]+/)).map(norm).filter(Boolean).join(' ');
        h += '<button type="button" class="ch-code" data-nav data-code="' + esc(r.code) + '" data-keys="' + esc(keys) + '"><b>' + esc(r.code) + '</b><span>' + esc(r.title) + (r.when ? '<em>' + esc(r.when) + '</em>' : '') + '</span></button>';
      }
      h += '</div></section>';
    }
    D.book.innerHTML = h;
    D.note.textContent = hasMyGame() ? 'Your own game is put aside: type MYGAME to get it back.' : 'Stage codes replace the game in play; your own save is put aside first (MYGAME brings it back).';
    filter();
  }
  function filter() {
    if (!panel || !panel.el) return;
    const q = norm(panel.dom.input.value);
    const exact = q ? lookup(q) : null;
    panel.el.querySelectorAll('.ch-code').forEach((b) => {
      const show = !q || (' ' + b.dataset.keys).indexOf(' ' + q) >= 0;
      b.hidden = !show;
      b.classList.toggle('hit', !!exact && norm(b.dataset.code) === q);
    });
    panel.el.querySelectorAll('.ch-sec').forEach((s) => { s.hidden = !s.querySelector('.ch-code:not([hidden])'); });
  }
  function submit(code) {
    const c = code != null ? code : panel && panel.dom.input.value;
    const r = apply(c);
    if (!panel || !panel.el) return r;
    ui.msg = r.msg || ''; ui.kind = r.ok ? 'ok' : 'bad';
    if (r.ok && isOpen()) {
      // a tool keeps the game: back to it (from the title it stays here)
      if (inGame()) closeUi(true);
      else render();
    } else if (!r.ok) {
      render();
      try { if (N.audio && N.audio.sfx) N.audio.sfx('ui_back', { ui: true }); } catch (e) { /* ignore */ }
      try { panel.dom.input.focus({ preventScroll: true }); panel.dom.input.select(); } catch (e) { /* ignore */ }
    }
    return r;
  }
  function definePanel() {
    if (panel || !N.menus || !N.menus.definePanel) return panel;
    panel = N.menus.definePanel('cheats', {
      build() {
        const e = (this.el = document.createElement('div'));
        e.className = 'screen mn-screen mn-cheats';
        e.setAttribute('role', 'dialog');
        e.setAttribute('aria-label', 'Cheat codes');
        e.innerHTML = '<div class="mn-card ch-card"><div class="mn-card-head"><h2>✱ Cheat codes</h2><button type="button" class="mn-x" data-act="back" aria-label="Close">✕</button></div>' +
          '<div class="ch-body scroll">' +
          '<form class="ch-form" autocomplete="off"><label class="ch-field"><span>Type a code</span><input type="text" data-nav data-def maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="DIWALI · RAMZAN · M7 …"></label>' +
          '<button type="submit" class="mn-btn" data-nav>▶ Enter</button></form>' +
          '<p class="ch-msg" role="status" hidden></p><p class="ch-note"></p><div class="ch-book"></div></div></div>';
        N.menus.overlayRoot().appendChild(e);
        this.dom = { input: e.querySelector('input'), msg: e.querySelector('.ch-msg'), note: e.querySelector('.ch-note'), book: e.querySelector('.ch-book') };
        e.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); submit(); });
        e.querySelector('[data-act=back]').addEventListener('click', () => this.back());
        this.dom.input.addEventListener('input', () => { if (ui.msg && ui.kind === 'bad') { ui.msg = ''; panel.dom.msg.hidden = true; } filter(); });
        e.addEventListener('click', (ev) => {
          const b = ev.target.closest('.ch-code');
          if (!b) return;
          this.dom.input.value = b.dataset.code;
          submit(b.dataset.code);
        });
      },
      onOpen(o) { ui.from = (o && o.from) || null; ui.msg = ''; ui.kind = ''; this.dom.input.value = ''; render(); },
      back() { closeUi(); },
      onKey(k, e, typing) {
        if (k === 'ok' && typing) { submit(); return true; }
        return false;
      },
    });
    return panel;
  }
  function isOpen() { return !!(N.menus && N.menus.isPanelShown && N.menus.isPanelShown('cheats')); }
  /** opts.from: 'pause' (back to the deck) | 'key' (back to the game) | 'title' */
  function open(opts) {
    if (!N.menus || !definePanel()) return false;
    N.menus.openPanel('cheats', opts || {});
    return true;
  }
  /** close the card; resume = also leave the pause deck (a code that keeps the game, or the C key's card) */
  function closeUi(resume) {
    if (!isOpen()) return;
    const from = ui.from;
    N.menus.closePanel('cheats');
    if ((resume || from === 'key') && mode() === 'paused' && N.menus.resume) N.menus.resume();
  }

  /* ================================================================ the C key in free roam */
  window.addEventListener('keydown', (e) => {
    if (!C.enabled || e.code !== 'KeyC' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (mode() !== 'play' || (N.menus && N.menus.isOpen && N.menus.isOpen())) return;
    if (N.input && N.input.KEYMAP && N.input.KEYMAP.KeyC) return; // the player put an action on C
    e.preventDefault(); // the "c" must not land in the card's field
    if (!N.game || !N.game.pause || !N.game.pause()) return;
    open({ from: 'key' });
  });

  const C = (N.cheats = {
    enabled: DEFAULT_ENABLED,
    STAGES, TOOLS, NEEDS, WHEN,
    apply, lookup, jump: (id) => jump(id, id), stage: (code) => { const e = lookup(code); return e && e.kind === 'stage' ? runStage(e.s) : { ok: false, msg: 'Not a stage code.' }; },
    open, close: () => closeUi(), list, hasMyGame, restore,
    get isOpen() { return isOpen(); },
  });
  if (N.debug) { N.debug.jump = (id) => C.jump(id); N.debug.cheat = (code) => C.apply(code); }
})();
