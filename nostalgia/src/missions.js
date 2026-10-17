/* NOSTALGIA — missions.js
 * Coroutine mission runner (ARCHITECTURE §11). A mission is an async script(m); every m.*
 * call is tracked by the run, ticked each update step, and rejected with a MissionAbort when
 * the run fails / is quit / a save is loaded (scripts must not catch it). Also: world
 * markers (pulsing cylinders of light on the ground layer + minimap blips + off-screen
 * arrows), mission givers that start missions when the player walks in, checkpoints with
 * fast-forward retry, MISSION PASSED / FAILED banners, rewards and autosave.
 *
 * Story layer (systems §6.1–§6.4, §15 row 12; story-core agent):
 *  - Def extras: kind 'main' | 'side' | 'job' (default 'main'), track, date / end ([y, m(1-12), d, h, mi]
 *    or 'YYYY-MM-DD HH:MM'), jcard ('TRACK 05 · RIGHT, RIGHT! · IMLIBUN'), scribble, rec (false | {sfx, to, token}),
 *    meter ('normal' | 'frozen' | 'scripted'), window {from: '16:00', to: '20:00', dow: [0..6]}, help (false = no
 *    "Let Immu do it"). The 12 bible missions get date, end, track, jcard, scribble and REC from N.calendar.STORY.
 *  - Givers: walking into a marker opens the J-card prompt (track, title, date; "▶ PLAY" on ACTION, or stand in
 *    it for TUNE.jcardDwell s; stepping out cancels). Outside its window the card offers "Wait till 16:00 (▶▶)".
 *    Only one main giver shows at a time; side/job givers only inside their windows, the nearest 3, never during
 *    a main mission.
 *  - Starting a main mission with a date jumps the calendar there (VHS ▶▶ 1.5 s) before the script runs.
 *  - m.rec(id?, opts) (the ● REC moment; N.tape.rec), m.token(id, {name, desc}), m.meter(policy, level),
 *    m.jumpTo(spec, opts). A main bible mission that ends without a REC records it before MISSION PASSED.
 *  - MISSION PASSED shows the J-card line + Immu's scribble; the clock moves on to the mission's end time;
 *    autosave (main only by default) toasts "SIDE A saved ●".
 *  - Help after repeated fails (TUNE): 3 lost tries of the same minigame -> the retry card adds "Let Immu do it"
 *    (Ayesha for cricket, Ammamma for the clap): the next run passes that minigame with 1 star. 2 timer fails ->
 *    the timer gets +25% ("Bunty-anna says: extra time"). N.missions.helpEnabled / setting `letImmu` switch it off.
 *  - Saving is refused while a mission runs (and in minigames, cutscenes, dialogue, chases at level >= 3 or with
 *    N.flags.no_save) for saves that pass a player-facing meta.reason ('booth', 'menu', 'quit', 'sleep' ...);
 *    reason 'mission' and meta.force always save. N.missions.canSave() -> {ok, why} for UIs.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const TAU = Math.PI * 2;

  class MissionAbort extends Error {
    constructor(kind, reason) {
      super(reason || kind || 'aborted');
      this.name = 'MissionAbort';
      this.kind = kind || 'abort';   // 'fail' | 'abort' | 'complete'
      this.reason = reason || '';
    }
  }

  const defs = {};
  const order = [];
  const done = new Set();
  let active = null;      // the current Run
  let lastFailed = null;  // {id, cp, record, startPos, attempt}
  let askOpen = false, askT = 0;
  const giverCooldown = new Set(); // giver ids the player must walk out of before they trigger again
  let runSeq = 0;

  const MISSION_COLOR = '#ff5fb0';
  const GIVER_COLOR = '#f2c230';
  const TUNE = { jcardDwell: 1.0, helpAfterGameFails: 3, helpAfterTimerFails: 2, timerBonus: 1.25, maxSideGivers: 3, recWindow: 8 };
  const streaks = { game: {}, timer: {} };
  let jc = null;           // the open J-card prompt {id, t}
  const pref = (k, d) => { const st = N.settings || (N.menus && N.menus.settings) || null; return st && st[k] != null ? st[k] : d; };
  const kindOf = (def) => (def && def.kind) || 'main';
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  function helpOn(def) { return M.helpEnabled !== false && pref('letImmu', true) !== false && !(def && def.help === false); }
  function storyEntry(id) { return N.calendar && N.calendar.storyEntry ? N.calendar.storyEntry(id) : null; }
  function parseDate(spec) { return spec && N.calendar && N.calendar.parse ? N.calendar.parse(spec) : null; }
  function dateLine(def) {
    const p = parseDate(def.date);
    if (p && N.calendar) { const d = N.calendar.dateOf(N.calendar.dayOf(p.y, p.m, p.d)); return d.label + (p.h != null ? ' · ' + pad2(p.h) + ':' + pad2(p.mi || 0) : ''); }
    if (N.calendar) { const d = N.calendar.date; return d.label + ' · ' + N.clock.label(); }
    return N.clock.dateLabel() + ' · ' + N.clock.label();
  }
  const hm = (v) => { if (typeof v === 'number') return v; const r = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return r ? +r[1] * 60 + +r[2] : null; };
  /** Is the clock inside def.window ({from, to, dow})? */
  function inWindow(def) {
    const w = def.window;
    if (!w) return true;
    const a = hm(w.from), b = hm(w.to), m = N.clock.minutes;
    if (w.dow && N.calendar && w.dow.indexOf(N.calendar.weekday()) < 0) return false;
    if (a == null || b == null) return true;
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }
  function applyMeter(policy, level) {
    const W = N.wanted;
    if (!W) return;
    try {
      if (typeof W.policy === 'function') W.policy(policy || 'normal', level);
      else if (typeof W.freeze === 'function') W.freeze(policy === 'frozen', 'mission');
      if (typeof W.lock === 'function') W.lock(policy === 'scripted' && level != null ? level : null);
    } catch (e) { N.err('mission.meter', e); }
  }

  /* ============================================================== targets */
  function posOf(target) {
    if (target == null) return null;
    if (typeof target === 'string') {
      const p = N.places[target];
      if (p) return p;
      const npc = N.npcs && N.npcs.get && N.npcs.get(target);
      if (npc && typeof npc.x === 'number') return npc;
      const lm = (N.WORLD_DATA && N.WORLD_DATA.landmarks || []).find((l) => l.id === target);
      return lm ? { x: lm.x, y: lm.y + lm.d / 2 + 12, r: 24 } : null;
    }
    if (typeof target === 'function') return posOf(target());
    if (target.alive === false) return null;
    if (typeof target.x === 'number') return target;
    return null;
  }

  /* ================================================================= Run */
  class Run {
    constructor(def, opts) {
      this.uid = ++runSeq;
      this.id = def.id; this.def = def;
      this.opts = opts || {};
      const retry = this.opts.retry || null;
      this.attempt = retry ? (retry.attempt || 1) + 1 : 1;
      this.ff = retry && retry.cp ? retry.cp.name : null; // fast-forward until this checkpoint
      this.cpData = retry ? retry.cp : null;
      this.prev = retry ? retry.record : null;
      this.record = { answers: [], games: [] };
      this.ai = 0; this.gi = 0;
      this.pending = new Set();
      this.spawned = [];
      this.blips = new Set();
      this.markers = new Map();
      this.timer = null;
      this.ended = false;
      this.checkpointData = null;
      this.startPos = retry && retry.startPos ? retry.startPos : { x: N.player.x, y: N.player.y };
      this.startedAt = N.time.now;
      this.mSeq = 0;
    }
    get dead() { return this.ended; }
  }

  function guard(run) { if (run.ended || active !== run) throw new MissionAbort('abort', 'stale mission'); }
  // A tracked promise: resolved by tick checks or by wrapped externals, rejected on abort.
  function track(run, entry) {
    const p = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
    p.catch(() => {}); // the script awaits it; never report an orphaned MissionAbort
    entry.t0 = N.time.now;
    run.pending.add(entry);
    return p;
  }
  function settle(run, entry, value) {
    if (!run.pending.has(entry)) return;
    run.pending.delete(entry);
    if (entry.cleanup) { try { entry.cleanup(); } catch (e) { N.err('mission.cleanup', e); } }
    entry.resolve(value);
  }
  function wrap(run, promise, after) {
    const entry = { kind: 'ext' };
    const p = track(run, entry);
    Promise.resolve(promise).then((v) => {
      if (run.ended) return;
      if (after) { try { v = after(v); } catch (e) { N.err('mission.wrap', e); } }
      settle(run, entry, v);
    }, (e) => {
      if (run.ended || !run.pending.has(entry)) return;
      run.pending.delete(entry);
      entry.reject(e);
    });
    return p;
  }

  /* ============================================================== the API */
  function makeApi(run) {
    const ffing = () => !!run.ff;
    const m = {
      get id() { return run.id; },
      get attempt() { return run.attempt; },
      get retrying() { return run.attempt > 1; },
      get player() { return N.player; },
      def: run.def,
      data: {},
      MissionAbort,

      objective(text) { guard(run); run.objText = text || null; N.hud.objective(text || null); },
      toast(text, ms) { guard(run); if (!ffing()) N.hud.toast(text, ms); },
      blip(target, opts) {
        guard(run);
        opts = opts || {};
        const id = opts.id || run.id + ':b' + ++run.mSeq;
        N.hud.blip(id, target, Object.assign({ color: MISSION_COLOR, icon: 'star', pulse: true }, opts));
        run.blips.add(id);
        return id;
      },
      unblip(id) { N.hud.unblip(id); run.blips.delete(id); },
      /** A world marker (pulsing light) without waiting: returns its id; m.unmarker(id). */
      marker(target, opts) {
        guard(run);
        opts = opts || {};
        const id = opts.id || run.id + ':m' + ++run.mSeq;
        const p0 = posOf(target);
        run.markers.set(id, { target, r: opts.r || (p0 && p0.r) || 20, color: opts.color || MISSION_COLOR, label: opts.label || '' });
        return id;
      },
      unmarker(id) { run.markers.delete(id); },

      /** Go to a place id | {x, y} | entity. opts: {r, label, onFoot, inVehicle (true | type),
       *  vehicleType, blip (true), marker (true), route (true), color}. Resolves with the target. */
      goto(target, opts) {
        guard(run);
        opts = opts || {};
        const p0 = posOf(target);
        if (!p0) { N.err('mission.goto', new Error(run.id + ': unknown target ' + JSON.stringify(target))); return Promise.resolve(null); }
        if (opts.label) m.objective(opts.label);
        if (ffing()) return Promise.resolve(p0);
        const r = opts.r || p0.r || 20;
        const color = opts.color || MISSION_COLOR;
        const id = run.id + ':g' + ++run.mSeq;
        if (opts.marker !== false) run.markers.set(id, { target, r, color });
        if (opts.blip !== false) { N.hud.blip(id, target, { color, icon: 'star', pulse: true, route: opts.route !== false }); run.blips.add(id); }
        const needType = typeof opts.inVehicle === 'string' ? opts.inVehicle : opts.vehicleType || null;
        let hintT = 0;
        return track(run, {
          kind: 'goto',
          check(dt) {
            const p = posOf(target);
            if (!p) return false;
            const pl = N.player;
            const d = Math.hypot(pl.x - p.x, pl.y - p.y);
            if (d > r) return false;
            const v = pl.vehicle;
            let ok = true, hint = '';
            if (opts.onFoot && v) { ok = false; hint = 'Get off first — you need to be on foot here.'; }
            if ((opts.inVehicle || needType) && !v) { ok = false; hint = needType ? 'You need a ' + ((N.vehicles.TYPES[needType] || {}).short || needType) + ' for this.' : 'You need a vehicle for this.'; }
            if (needType && v && v.type !== needType) { ok = false; hint = 'Wrong ride! You need a ' + ((N.vehicles.TYPES[needType] || {}).short || needType) + '.'; }
            if (!ok) { hintT -= dt; if (hintT <= 0) { hintT = 4; N.hud.toast(hint, 2400); } return false; }
            return { value: { x: p.x, y: p.y } };
          },
          cleanup() { run.markers.delete(id); N.hud.unblip(id); run.blips.delete(id); },
        });
      },
      wait(sec) {
        guard(run);
        if (ffing() || !(sec > 0)) return Promise.resolve();
        const until = N.time.now + sec;
        return track(run, { kind: 'wait', check: () => N.time.now >= until && { value: undefined } });
      },
      /** Resolve when fn() is truthy. opts: {timeout (s), failMsg (fail on timeout, else resolve false)}. */
      until(fn, opts) {
        guard(run);
        opts = opts || {};
        if (ffing()) return Promise.resolve(true);
        const entry = {
          kind: 'until',
          check() {
            let v;
            try { v = fn(); } catch (e) { N.err('mission.until:' + run.id, e); v = false; }
            if (v) return { value: v };
            if (opts.timeout != null && N.time.now - entry.t0 >= opts.timeout) {
              if (opts.failMsg) return { fail: opts.failMsg };
              return { value: false };
            }
            return false;
          },
        };
        return track(run, entry);
      },
      say(s, t, o) { guard(run); if (ffing()) return Promise.resolve(); return wrap(run, N.dialogue.say(s, t, o)); },
      talk(lines) { guard(run); if (ffing()) return Promise.resolve(); return wrap(run, N.dialogue.play(lines)); },
      choice(s, prompt, options, o) {
        guard(run);
        if (ffing()) {
          const a = run.prev && run.prev.answers[run.ai];
          run.ai++;
          const v = a == null ? (o && o.default) || 0 : a;
          run.record.answers.push(v);
          return Promise.resolve(v);
        }
        return wrap(run, N.dialogue.choice(s, prompt, options, o), (v) => { run.record.answers.push(v); run.ai++; return v; });
      },
      cutscene(steps) {
        guard(run);
        if (ffing() || !N.menus || !N.menus.cutscene) return Promise.resolve();
        run.inCutscene = true;
        return wrap(run, N.menus.cutscene(steps), (v) => { run.inCutscene = false; return v; });
      },
      minigame(id, params) {
        guard(run);
        const MG = N.minigames;
        const has = MG && (typeof MG.has === 'function' ? MG.has(id) : !!(MG.defs && MG.defs[id]));
        if (ffing()) {
          const r = (run.prev && run.prev.games[run.gi]) || { win: true, skipped: true };
          run.gi++; run.record.games.push(r);
          return Promise.resolve(r);
        }
        if (run.assist && (run.assist === id || (MG && MG.resolve && MG.resolve(id) === MG.resolve(run.assist)))) {
          // "Let Immu do it": the helper plays this one (1 star, a teasing line)
          run.assist = null;
          const who = helperFor(id);
          const r = { id, win: true, stars: 1, score: 0, assisted: true, helper: who.id };
          run.record.games.push(r); run.gi++;
          N.hud.toast(who.line, 3200);
          N.emit('mission:assist', { id: run.id, game: id, helper: who.id });
          return Promise.resolve(r);
        }
        if (!has) { const r = { win: true, skipped: true, missing: true }; run.record.games.push(r); run.gi++; return Promise.resolve(r); }
        run.inMinigame = true;
        return wrap(run, MG.start(id, params || {}), (r) => {
          run.inMinigame = false; r = r || { win: false }; run.record.games.push(r); run.gi++;
          run.lostGame = r.win === false && !r.quit ? id : null;
          return r;
        });
      },
      /** Track an entity (auto-removed when the mission ends unless opts.keep). Returns it. */
      spawn(e, opts) {
        guard(run);
        if (!e) return e;
        if (Array.isArray(e)) { e.forEach((x) => m.spawn(x, opts)); return e; }
        if (N.entities.all.indexOf(e) < 0) N.entities.add(e);
        run.spawned.push({ e, keep: !!(opts && opts.keep) });
        return e;
      },
      vehicle(type, x, y, angle, opts) { return m.spawn(N.vehicles.spawn(type, x, y, angle, opts), opts); },
      /** Countdown in the HUD; the mission fails when it runs out. timer(null) stops it. */
      timer(sec, label, opts) {
        guard(run);
        if (sec == null) { run.timer = null; N.hud.timer(null); return null; }
        if (ffing()) return { stop() {}, add() {}, get left() { return sec; } };
        if (run.timerBonus > 1) { sec *= run.timerBonus; if (!run.bonusToast) { run.bonusToast = true; N.hud.toast('Bunty-anna says: extra time!', 2600); } }
        const T = run.timer = { left: sec, label: label || 'TIME', failMsg: (opts && opts.failMsg) || 'Time up! Too slow, bhai.' };
        N.hud.timer(T.label, T.left, { countdown: false });
        return { stop() { if (run.timer === T) { run.timer = null; N.hud.timer(null); } }, add(s) { T.left += s; }, get left() { return T.left; } };
      },
      give(itemId, opts) {
        guard(run);
        if (ffing()) return;
        N.player.inventory.add(itemId);
        N.emit('item:give', { id: itemId, mission: run.id });
        if (opts && opts.name) N.hud.toast('Got: ' + opts.name, 2600);
      },
      money(paise) {
        guard(run);
        if (ffing() || !paise) return;
        N.player.money += Math.round(paise);
        N.emit('money', { delta: paise, total: N.player.money, mission: run.id });
      },
      flag(name, value) { guard(run); N.flags[name] = value === undefined ? true : value; N.emit('flag', { name, value: N.flags[name] }); },
      fail(reason) { guard(run); throw new MissionAbort('fail', reason || 'Mission failed'); },
      /** The ● REC moment (N.tape.rec): defaults from the bible by mission id. Resolves true when recorded. */
      rec(id, o) {
        guard(run);
        if (id && typeof id === 'object') { o = id; id = null; }
        id = id || run.id;
        if (!N.tape || !N.tape.rec) return Promise.resolve(false);
        if (ffing()) { N.tape.rec(id, Object.assign({}, o || {}, { silent: true })); return Promise.resolve(true); }
        return wrap(run, N.tape.rec(id, Object.assign({ window: TUNE.recWindow }, o || {})));
      },
      /** Put a token in the biscuit tin. */
      token(id, o) { guard(run); if (N.tape && N.tape.addToken) N.tape.addToken(id, Object.assign({ mission: run.id, silent: ffing() }, o || {})); },
      /** Chappal Meter policy for this step: 'normal' | 'frozen' | 'scripted' (+ level). */
      meter(policy, level) { guard(run); run.meterPolicy = policy || 'normal'; applyMeter(run.meterPolicy, level); },
      /** Move the calendar (VHS ▶▶); instant while fast-forwarding a retry. */
      jumpTo(spec, opts) {
        guard(run);
        if (!N.calendar) return Promise.resolve(null);
        if (ffing()) return Promise.resolve(N.calendar.set(spec));
        return wrap(run, N.calendar.jumpTo(spec, opts));
      },
      checkpoint(name) {
        guard(run);
        const pl = N.player;
        if (run.ff) {
          if (name !== run.ff) return;
          // reached the retry point: resume for real where the player was
          run.ff = null;
          const cp = run.cpData;
          if (cp) {
            pl.teleport(cp.x, cp.y);
            if (cp.vehicleType && N.vehicles.TYPES[cp.vehicleType]) {
              const f = N.world.findFree(cp.x, cp.y, N.vehicles.TYPES[cp.vehicleType].mode === 'boat' ? 'boat' : 'drive', 20) || cp;
              const v = N.vehicles.spawn(cp.vehicleType, f.x, f.y, cp.angle || 0, {});
              if (v) { run.spawned.push({ e: v, keep: false }); N.vehicles.enter(pl, v); }
            }
          }
          run.checkpointData = cp;
          N.hud.toast('Checkpoint: back in the action!', 2200);
          return;
        }
        run.checkpointData = { name, x: pl.x, y: pl.y, angle: (pl.vehicle || pl).angle || 0, vehicleType: pl.vehicle ? pl.vehicle.type : null };
        N.emit('mission:checkpoint', { id: run.id, name });
      },
    };
    return m;
  }

  /* ============================================================ lifecycle */
  function start(id, opts) {
    const def = defs[id];
    if (!def) { N.err('missions.start', new Error('unknown mission ' + id)); return false; }
    if (active) return false;
    closeAsk();
    const run = new Run(def, opts);
    active = run;
    if (opts && opts.retry && !run.ff) {
      const s = run.startPos;
      if (Math.hypot(N.player.x - s.x, N.player.y - s.y) > 60) N.player.teleport(s.x, s.y);
    }
    run.m = makeApi(run);
    run.assist = opts && opts.assist ? opts.assist : null;
    run.timerBonus = helpOn(def) && (streaks.timer[id] || 0) >= TUNE.helpAfterTimerFails ? TUNE.timerBonus : 1;
    if (jc) closeJcard();
    N.emit('mission:start', { id, title: def.title, attempt: run.attempt, kind: kindOf(def) });
    if (run.attempt === 1) N.hud.banner(def.title || id, def.chapter != null ? (typeof def.chapter === 'number' ? 'Chapter ' + def.chapter : String(def.chapter)) : '', 2600, { kind: 'chapter' });
    run.meterPolicy = def.meter || 'normal';
    if (def.meter && def.meter !== 'normal') applyMeter(def.meter, def.meterLevel);
    // a main mission moves the calendar to its date (bible §1.4) with the VHS ▶▶ before the script runs
    let pre = null;
    if (def.date && run.attempt === 1 && !(opts && opts.noJump) && N.calendar && N.calendar.jumpTo && (kindOf(def) === 'main' || def.jump)) {
      try { pre = N.calendar.jumpTo(def.date, { fx: def.jumpFx }); } catch (e) { N.err('mission.jump', e); }
    }
    let abortReject;
    const abortP = new Promise((_, rej) => { abortReject = rej; });
    abortP.catch(() => {});
    run.abortReject = abortReject;
    const scriptP = Promise.resolve(pre).then(() => {
      if (run.ended) throw new MissionAbort('abort', 'ended');
      return def.script(run.m);
    }).then(() => autoRec(run));
    scriptP.catch(() => {});
    Promise.race([scriptP, abortP]).then(
      () => succeed(run),
      (e) => {
        if (run.ended) return;
        if (e && e.name === 'MissionAbort') {
          if (e.kind === 'complete') succeed(run);
          else if (e.kind === 'fail') failRun(run, e.reason);
          else endRun(run, 'abort');
        } else {
          N.err('mission:' + run.id, e);
          failRun(run, 'Something went wrong (' + ((e && e.message) || e) + ')');
        }
      });
    return true;
  }

  // A main mission from the bible that ends without its ● REC records it before MISSION PASSED.
  function needsRec(run) {
    const def = run.def;
    if (def.rec === false || kindOf(def) !== 'main' || !N.tape || !N.tape.rec || N.tape.has(run.id)) return false;
    return !!(def.rec || storyEntry(run.id));
  }
  function autoRec(run) {
    if (run.ended || !needsRec(run)) return null;
    return N.tape.rec(run.id, Object.assign({ window: TUNE.recWindow }, typeof run.def.rec === 'object' ? run.def.rec : {}));
  }
  function helperFor(game) {
    const g = String(game || '');
    if (/cricket/.test(g)) return { id: 'ayesha', label: 'Let Ayesha bat', line: 'Ayesha: Move, *doodh-bhaat*. ...See? One star. Write it small.' };
    if (/clap/.test(g)) return { id: 'ammamma', label: 'Let Ammamma clap', line: 'Ammamma: Like this, *kanna*. Slowly. ...See, the wall answers old ladies too.' };
    return { id: 'immu', label: 'Let Immu do it', line: 'Immu: Move, move. Watch the master. ...One star. Agent rules: we never talk about this. Over.' };
  }

  function abortRun(run, kind, reason) {
    if (!run || run.ended) return;
    const err = new MissionAbort(kind, reason);
    for (const entry of Array.from(run.pending)) { run.pending.delete(entry); try { entry.reject(err); } catch (e) { /* ignore */ } }
    run.abortReject(err);
  }

  // common teardown; result: 'pass' | 'fail' | 'abort'
  function endRun(run, result) {
    if (run.ended) return false;
    run.ended = true;
    const err = new MissionAbort('abort', 'ended');
    for (const entry of Array.from(run.pending)) { run.pending.delete(entry); try { entry.reject(err); } catch (e) { /* ignore */ } }
    if (result !== 'pass' && N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.cancel();
    // a minigame / cutscene this run opened must not outlive it (fail, quit, load)
    if (run.inMinigame) { run.inMinigame = false; try { if (N.minigames && typeof N.minigames.abort === 'function') N.minigames.abort('mission:' + result); } catch (e) { N.err('mission.mgAbort', e); } }
    if (run.inCutscene) { run.inCutscene = false; try { if (N.menus && typeof N.menus.abortCutscene === 'function') N.menus.abortCutscene(); } catch (e) { N.err('mission.csAbort', e); } }
    for (const id of run.blips) N.hud.unblip(id);
    run.blips.clear(); run.markers.clear();
    if (run.meterPolicy && run.meterPolicy !== 'normal') applyMeter('normal', null);
    if (result !== 'pass' && N.tape && N.tape.cancelRec) { try { N.tape.cancelRec(); } catch (e) { N.err('mission.rec', e); } }
    if (run.timer) { run.timer = null; }
    N.hud.timer(null);
    N.hud.objective(null);
    const p = N.player;
    for (const s of run.spawned) {
      const e = s.e;
      if (s.keep || !e || e.alive === false) continue;
      if (e === p.vehicle) continue; // never yank the ride out from under the player
      if (typeof e.despawn === 'function') { try { e.despawn(); } catch (er) { N.err('mission.despawn', er); } }
      else if (e.kind === 'vehicle' && N.vehicles.remove) N.vehicles.remove(e);
      else N.entities.remove(e);
    }
    run.spawned.length = 0;
    if (active === run) active = null;
    // an aborted (quit / loaded) mission's giver waits until the player steps out of its marker
    if (result === 'abort' && run.def.giver) giverCooldown.add(run.id);
    if (result === 'abort') N.emit('mission:abort', { id: run.id });
    return true;
  }

  function succeed(run) {
    if (!endRun(run, 'pass')) return;
    const def = run.def;
    done.add(def.id);
    lastFailed = null;
    delete streaks.timer[def.id];
    for (const k in streaks.game) if (k.indexOf(def.id + ':') === 0) delete streaks.game[k];
    if (needsRec(run)) { try { N.tape.rec(def.id, { silent: true }); } catch (e) { N.err('mission.rec', e); } } // (debug completions)
    const rw = def.reward || {};
    let sub = def.jcard || def.passText || 'Respect +';
    if (rw.money) { N.player.money += rw.money; N.emit('money', { delta: rw.money, total: N.player.money, mission: def.id }); sub += '   ' + U.fmtMoney(rw.money); }
    if (rw.item) N.player.inventory.add(rw.item);
    if (rw.flag) N.flags[rw.flag] = true;
    N.hud.banner('MISSION PASSED', sub, 4200, { kind: 'pass', note: def.scribble || '' });
    // free roam goes on at the mission's end time (bible §4), never backwards
    const end = parseDate(def.end);
    if (end && N.calendar && N.calendar.compare(end, [N.calendar.date.y, N.calendar.date.m, N.calendar.date.d, N.clock.hour(), Math.floor(N.clock.minutes % 60)]) > 0) {
      try { N.calendar.set(end); } catch (e) { N.err('mission.end', e); }
    }
    if (kindOf(def) === 'main' && N.calendar && N.calendar.markStop) N.calendar.markStop(N.clock.day);
    N.emit('mission:complete', { id: def.id, title: def.title, reward: rw, kind: kindOf(def) });
    N.emit('mission:pass', { id: def.id });
    if (typeof def.onPass === 'function') { try { def.onPass(); } catch (e) { N.err('mission.onPass', e); } }
    const autosave = def.autosave != null ? def.autosave !== false : kindOf(def) === 'main';
    if (autosave && N.save && N.save.save) {
      try { if (N.save.save({ reason: 'mission', toast: false })) N.hud.toast(N.save.available === false ? 'SIDE A saved ● (this session only)' : 'SIDE A saved ●', 2200); } catch (e) { N.err('mission.autosave', e); }
    }
    refreshGivers(true);
  }

  function failRun(run, reason) {
    if (!endRun(run, 'fail')) return;
    lastFailed = { id: run.id, cp: run.checkpointData, record: run.record, startPos: run.startPos, attempt: run.attempt };
    if (run.failCause === 'timer') streaks.timer[run.id] = (streaks.timer[run.id] || 0) + 1;
    else if (run.lostGame) { const k = run.id + ':' + run.lostGame; streaks.game[k] = (streaks.game[k] || 0) + 1; lastFailed.game = run.lostGame; }
    if (run.def.giver) giverCooldown.add(run.id);
    N.hud.banner('MISSION FAILED', reason || '', 3600, { kind: 'fail' });
    N.emit('mission:fail', { id: run.id, reason: reason || '' });
    const myFail = lastFailed;
    setTimeout(() => { if (lastFailed === myFail && !active) openAsk(run.def); }, 1500);
  }

  function retry(assist) {
    if (!lastFailed || active) return false;
    const lf = lastFailed;
    lastFailed = null;
    closeAsk();
    return start(lf.id, { retry: lf, assist: assist ? lf.game : null });
  }

  function openAsk(def) {
    askOpen = true; askT = 14;
    const btns = [{ label: 'Retry from checkpoint', key: 'E', fn: () => retry() }];
    const lf = lastFailed;
    if (lf && lf.game && helpOn(def) && (streaks.game[lf.id + ':' + lf.game] || 0) >= TUNE.helpAfterGameFails) {
      btns.push({ label: helperFor(lf.game).label, fn: () => retry(true) });
    }
    btns.push({ label: 'Free roam', key: 'Esc', fn: () => { lastFailed = null; closeAsk(); } });
    N.hud.ask('RETRY “' + (def.title || def.id).toUpperCase() + '”?', btns);
  }
  function closeAsk() { if (askOpen) { askOpen = false; N.hud.closeAsk(); } }

  /* ================================================================ givers */
  let giverList = [], giverT = 0;
  function giverPos(def) {
    const g = def.giver;
    if (!g) return null;
    if (g.npc) { const e = N.npcs && N.npcs.get && N.npcs.get(g.npc); if (e && typeof e.x === 'number') return e; }
    if (g.place) { const p = N.places[g.place]; if (p) return p; }
    if (typeof g.x === 'number') return g;
    return null;
  }
  function isAvailable(def) {
    if (done.has(def.id) || (active && active.id === def.id)) return false;
    for (const r of def.requires || []) if (!done.has(r)) return false;
    if (typeof def.when === 'function') { try { if (!def.when()) return false; } catch (e) { N.err('mission.when', e); return false; } }
    return true;
  }
  function refreshGivers(force) {
    const all = order.map((id) => defs[id]).filter((d) => d.giver && isAvailable(d));
    // one main giver at a time; side activities and jobs only inside their windows (nearest few)
    const main = all.filter((d) => kindOf(d) === 'main').slice(0, 1);
    const p0 = N.player;
    const side = all.filter((d) => kindOf(d) !== 'main' && inWindow(d)).map((d) => { const q = giverPos(d); return { d, dist: q && p0 ? Math.hypot(q.x - p0.x, q.y - p0.y) : 1e9 }; })
      .sort((a, b) => a.dist - b.dist).slice(0, TUNE.maxSideGivers).map((o) => o.d);
    const list = main.concat(side);
    const ids = new Set(list.map((d) => d.id));
    for (const d of giverList) if (!ids.has(d.id) || active) N.hud.unblip('giver:' + d.id);
    giverList = active ? [] : list;
    for (const d of giverList) {
      const p = giverPos(d); if (!p) continue;
      if (force || !N.hud.blips.has('giver:' + d.id)) N.hud.blip('giver:' + d.id, d.giver.npc ? (giverPos(d)) : p, { color: d.color || GIVER_COLOR, icon: 'giver', pulse: true, label: d.title, edge: false, size: 1.1 });
    }
  }

  /* =========================================================== tick/draw */
  function tick(dt) {
    const mode = N.state.mode;
    const run = active;
    if (run && !run.ended) {
      for (const entry of Array.from(run.pending)) {
        if (!entry.check) continue;
        let r;
        try { r = entry.check(dt); } catch (e) { N.err('mission.check:' + run.id, e); r = false; }
        if (!r) continue;
        // a failing until() fails the whole run even when the script didn't await it
        // (background watchers like "don't leave the area")
        if (r.fail) { if (entry.cleanup) entry.cleanup(); abortRun(run, 'fail', r.fail); break; }
        settle(run, entry, r.value);
        if (run.ended) break;
      }
      const T = run.timer;
      if (T && !run.ended && mode === 'play') {
        T.left -= dt;
        N.hud.timer(T.label, Math.max(0, T.left), { countdown: false });
        if (T.left <= 0) { run.timer = null; run.failCause = 'timer'; abortRun(run, 'fail', T.failMsg); }
      }
    }
    if (mode !== 'play') { if (jc && mode !== 'paused') closeJcard(); return; }
    // retry offer on ACTION while the ask card is up (Esc = free roam)
    if (askOpen) {
      askT -= dt;
      if (askT <= 0 || !lastFailed) closeAsk();
      else {
        N.interact.offer({ label: 'Retry mission', priority: 5, dist: 0, use: () => retry() });
        if (N.input.pressed('pause')) { N.input.consume('pause'); lastFailed = null; closeAsk(); }
      }
    }
    // givers
    giverT -= dt;
    if (giverT <= 0) { giverT = 0.5; refreshGivers(false); }
    if (active) { if (jc) closeJcard(); return; }
    const p = N.player;
    let cand = null, cd = Infinity;
    for (const d of giverList) {
      const g = giverPos(d); if (!g) continue;
      const r = (d.giver.r || 14);
      const dist = Math.hypot(p.x - g.x, p.y - g.y);
      if (giverCooldown.has(d.id)) { if (dist > r + 24) giverCooldown.delete(d.id); continue; }
      // the open card stays while the player is a step outside the ring (no flicker at the edge)
      const reach = jc && jc.id === d.id ? r + 6 : r;
      if (dist <= reach && (!d.giver.onFoot || !p.vehicle) && dist < cd) { cand = d; cd = dist; }
    }
    if (cand && !p.controlsLocked) jcardTick(cand, dt);
    else if (jc) closeJcard();
    for (const id of order) { const d = defs[id]; if (d.autoStart && isAvailable(d)) { start(id); return; } }
  }

  /* ============================================================ J-card prompt (systems §6.1) */
  function jcardSpec(def) {
    const se = storyEntry(def.id);
    const track = def.track || (se && se.track);
    const k = kindOf(def);
    const head = track ? 'TRACK ' + pad2(track) : k === 'side' ? 'SIDE ACTIVITY' : k === 'job' ? 'ODD JOB' : def.chapter != null ? (typeof def.chapter === 'number' ? 'CHAPTER ' + def.chapter : String(def.chapter).toUpperCase()) : 'MISSION';
    const open = inWindow(def);
    const w = def.window;
    const spec = { key: def.id, kind: k, head, title: String(def.title || def.id).toUpperCase(), sub: dateLine(def), line: def.jcardLine || '' };
    if (!open && w) {
      spec.line = 'Come back at ' + (typeof w.from === 'number' ? N.util.fmtClock(w.from) : w.from) + '.';
      spec.playLabel = 'Wait till ' + (typeof w.from === 'number' ? N.util.fmtClock(w.from) : w.from) + ' ▶▶';
      spec.waiting = true;
    }
    return spec;
  }
  function waitForWindow(def) {
    const w = def.window;
    const a = hm(w && w.from);
    if (a == null || !N.calendar) return;
    const d = N.calendar.date;
    let day = N.clock.day + (N.clock.minutes >= a ? 1 : 0);
    for (let i = 0; i < 8 && w.dow && w.dow.indexOf(N.calendar.dateOf(day).dow) < 0; i++) day++;
    const t = N.calendar.dateOf(day);
    void d;
    N.calendar.jumpTo([t.y, t.m, t.d, Math.floor(a / 60), a % 60], { fx: 'ff' });
  }
  function jcardTick(def, dt) {
    if (!jc || jc.id !== def.id) { closeJcard(); jc = { id: def.id, t: 0, def }; N.emit('mission:prompt', { id: def.id }); }
    const spec = jcardSpec(def);
    if (!spec.waiting) jc.t += dt;
    const go = () => {
      if (!jc || jc.id !== def.id) return;
      if (spec.waiting) { waitForWindow(def); jc.t = 0; return; }
      closeJcard(); start(def.id, { fromGiver: true });
    };
    spec.progress = spec.waiting ? 0 : jc.t / TUNE.jcardDwell;
    spec.onPlay = go;
    N.hud.jcard(spec);
    N.interact.offer({ label: spec.waiting ? 'Wait ▶▶' : '▶ PLAY', priority: 6, dist: 0, use: go });
    if (!spec.waiting && jc.t >= TUNE.jcardDwell && !(N.calendar && N.calendar.jumping)) go();
  }
  function closeJcard() { if (jc) { jc = null; N.hud.jcard(null); } }

  // Pulsing cylinder of light: glow disc + rings on the ground, a translucent beam that leans
  // with the GTA2 projection, and a bobbing diamond on top.
  function drawMarker(ctx, x, y, r, color, t, kind) {
    const R = N.render, k0 = R.k(0), Z = R.Z;
    r = Math.max(18, r);
    const X = R.sx(x, k0), Y = R.sy(y, k0);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    const [cr, cg, cb] = U.hexToRgb(color);
    const rgba = (a) => 'rgba(' + cr + ',' + cg + ',' + cb + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
    // ground glow
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * Z * 1.3);
    g.addColorStop(0, rgba(0.5)); g.addColorStop(0.7, rgba(0.22)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(X, Y, r * Z * 1.3, 0, TAU); ctx.fill();
    // rings: dark under-stroke so they read on pale plazas, then the colour
    const rr = r * Z * (0.9 + 0.06 * pulse);
    ctx.lineWidth = Math.max(2, 3.2 * Z); ctx.strokeStyle = 'rgba(18,13,22,0.45)';
    ctx.beginPath(); ctx.arc(X, Y, rr, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1.5, 2 * Z); ctx.strokeStyle = rgba(1);
    ctx.beginPath(); ctx.arc(X, Y, rr, 0, TAU); ctx.stroke();
    ctx.lineWidth = Math.max(1, 1.2 * Z); ctx.strokeStyle = rgba(0.75);
    ctx.setLineDash([5 * Z, 4 * Z]); ctx.lineDashOffset = -t * 18 * Z;
    ctx.beginPath(); ctx.arc(X, Y, r * Z * 0.6, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    const ph = (t * 0.9) % 1;
    ctx.strokeStyle = rgba(0.7 * (1 - ph));
    ctx.beginPath(); ctx.arc(X, Y, r * Z * (0.35 + ph * 1.0), 0, TAU); ctx.stroke();
    // beam: hull of the base and top circles, fading upwards (leans with the projection)
    const H = kind === 'giver' ? 70 : 90, k1 = R.k(H);
    const TX = R.sx(x, k1), TY = R.sy(y, k1), rb = r * 0.8 * k0, rt = r * 0.62 * k1;
    const dx = TX - X, dy = TY - Y, L = Math.hypot(dx, dy);
    const bg = ctx.createLinearGradient(X, Y, TX, TY);
    bg.addColorStop(0, rgba(0.45 + 0.12 * pulse)); bg.addColorStop(0.55, rgba(0.16)); bg.addColorStop(1, rgba(0));
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (L > Math.abs(rt - rb) + 0.5) {
      const th = Math.atan2(dy, dx), al = Math.acos(U.clamp((rb - rt) / L, -1, 1));
      ctx.arc(X, Y, rb, th + al, th - al + TAU);
      ctx.arc(TX, TY, rt, th - al, th + al);
    } else ctx.arc(X, Y, rb, 0, TAU);
    ctx.closePath(); ctx.fill();
    // screen-space light shaft up to a bobbing diamond (reads even at the screen centre,
    // where the projected beam collapses to a point)
    const bob = Math.sin(t * 2.6) * 3 * Z;
    const top = Y - (34 * Z + bob), sw = r * Z * 0.62;
    const sg = ctx.createLinearGradient(0, Y, 0, top);
    sg.addColorStop(0, rgba(0.42 + 0.1 * pulse)); sg.addColorStop(1, rgba(0));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(X - sw, Y); ctx.lineTo(X - sw * 0.7, top); ctx.lineTo(X + sw * 0.7, top); ctx.lineTo(X + sw, Y);
    ctx.ellipse(X, Y, sw, sw * 0.45, 0, 0, Math.PI);
    ctx.closePath(); ctx.fill();
    const DX = X, DY = top - 2 * Z, s = Math.max(4, 5.6 * Z);
    ctx.fillStyle = '#120d16';
    ctx.beginPath(); ctx.moveTo(DX, DY - s * 1.55); ctx.lineTo(DX + s * 1.1, DY); ctx.lineTo(DX, DY + s * 1.55); ctx.lineTo(DX - s * 1.1, DY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(DX, DY - s); ctx.lineTo(DX + s * 0.68, DY); ctx.lineTo(DX, DY + s); ctx.lineTo(DX - s * 0.68, DY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(DX, DY - s); ctx.lineTo(DX + s * 0.34, DY - s * 0.5); ctx.lineTo(DX, DY); ctx.lineTo(DX - s * 0.34, DY - s * 0.5); ctx.closePath(); ctx.fill();
  }

  // Screen-edge arrow towards an off-screen objective, with the distance in metres.
  function drawEdgeArrow(ctx, x, y, color) {
    const R = N.render, W = R.W, H = R.H;
    const p = R.proj(x, y, 0);
    const cx = W / 2, cy = H / 2;
    const dx = p.x - cx, dy = p.y - cy;
    const m = 14;
    const sx = (W / 2 - m) / Math.max(1e-6, Math.abs(dx)), sy = (H / 2 - m) / Math.max(1e-6, Math.abs(dy));
    const s = Math.min(sx, sy);
    const X = cx + dx * s, Y = cy + dy * s;
    const a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(Math.round(X), Math.round(Y)); ctx.rotate(a);
    const bob = Math.sin(N.time.real * 6) * 1.5;
    ctx.translate(bob, 0);
    ctx.fillStyle = '#120d16';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(5.5, 0); ctx.lineTo(-4, -4.6); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4.6); ctx.closePath(); ctx.fill();
    ctx.restore();
    const dist = Math.round(Math.hypot(x - N.player.x, y - N.player.y) * 0.3 / 10) * 10;
    const c = N.draw.pixelTextCanvas(dist + 'M', '#fff4dc', '#120d16');
    const tx = Math.round(X - Math.cos(a) * 16 - c.width / 2), ty = Math.round(Y - Math.sin(a) * 14 - c.height / 2);
    ctx.drawImage(c, U.clamp(tx, 2, W - c.width - 2), U.clamp(ty, 2, H - c.height - 2));
  }

  function draw() {
    const mode = N.state.mode;
    if (mode === 'title' || mode === 'boot') return;
    const R = N.render;
    const t = N.time.real;
    const list = [];
    const run = active;
    if (run && !run.ended) {
      for (const mk of run.markers.values()) { const p = posOf(mk.target); if (p) list.push([p.x, p.y, mk.r, mk.color, 'goal']); }
    } else {
      for (const d of giverList) { const p = giverPos(d); if (p) list.push([p.x, p.y, d.giver.r || 14, d.color || GIVER_COLOR, 'giver']); }
    }
    if (!list.length) return;
    const night = R.night || 0;
    for (const it of list) {
      if (R.inView(it[0], it[1], it[2] + 80)) {
        R.queue('ground', 3, (ctx) => drawMarker(ctx, it[0], it[1], it[2], it[3], t, it[4]));
        if (night > 0.05) R.lights.push({ x: it[0], y: it[1], r: it[2] * 2.4, color: it[3], intensity: 0.85 });
      } else if (it[4] === 'goal' && mode === 'play') {
        R.queue('fx', 0, (ctx) => drawEdgeArrow(ctx, it[0], it[1], it[3]));
      }
    }
  }

  /* ================================================================== API */
  const M = (N.missions = {
    MissionAbort, defs, done, TUNE, streaks,
    helpEnabled: true,
    kindOf: (id) => kindOf(typeof id === 'string' ? defs[id] : id),
    inWindow: (id) => { const d = typeof id === 'string' ? defs[id] : id; return d ? inWindow(d) : false; },
    get prompt() { return jc ? jc.id : null; },
    /** Can the player save right now? {ok, why} (STD booths, pause menu, sleeping). */
    canSave() {
      const md = N.state.mode;
      if (active) return { ok: false, why: 'Save after the mission, beta.' };
      if (md === 'minigame' || md === 'cutscene' || md === 'dialogue') return { ok: false, why: 'Not now — finish this first.' };
      if (N.flags && N.flags.no_save) return { ok: false, why: 'Not now.' };
      if (N.wanted && (N.wanted.level | 0) >= 3) return { ok: false, why: 'Shake off the chase first!' };
      return { ok: true, why: null };
    },
    get active() { return active; },
    get lastFailed() { return lastFailed; },
    /** {id, chapter, title, giver: {place|npc|x,y, r?, onFoot?}, requires: [ids], autoStart, when(),
     *  reward: {money, item, flag}, passText, color, autosave, script: async (m) => {...}} */
    register(def) {
      if (!def || !def.id || typeof def.script !== 'function') { N.err('missions.register', new Error('bad mission def ' + (def && def.id))); return null; }
      // bible defaults for the 12 main missions (date, end, track, J-card line, scribble)
      const se = storyEntry(def.id);
      if (se) {
        for (const k of ['date', 'end', 'track', 'jcard', 'scribble']) if (def[k] == null && se[k] != null) def[k] = se[k];
        if (def.chapter == null) def.chapter = se.chapter;
        if (def.title == null) def.title = se.title;
      }
      if (!def.kind) def.kind = 'main';
      if (!defs[def.id]) order.push(def.id);
      defs[def.id] = def;
      giverT = 0;
      return def;
    },
    start(id, opts) { return start(id, opts); },
    available() { return order.map((id) => defs[id]).filter((d) => isAvailable(d)); },
    isDone: (id) => done.has(id),
    giverPos,
    posOf,
    /** Debug: finish the active mission as passed. */
    complete() { if (!active) return false; abortRun(active, 'complete'); return true; },
    /** Fail the active mission (shows MISSION FAILED + retry). */
    fail(reason) { if (!active) return false; abortRun(active, 'fail', reason); return true; },
    /** Abort silently (quit / load). */
    abort() { if (!active) return false; const r = active; abortRun(r, 'abort'); endRun(r, 'abort'); return true; },
    retry,
    /** Markers currently shown (for the full map): [{x, y, color, kind}] */
    markers() {
      const out = [];
      if (active) for (const mk of active.markers.values()) { const p = posOf(mk.target); if (p) out.push({ x: p.x, y: p.y, color: mk.color, kind: 'goal' }); }
      else for (const d of giverList) { const p = giverPos(d); if (p) out.push({ x: p.x, y: p.y, color: d.color || GIVER_COLOR, kind: 'giver', id: d.id, title: d.title }); }
      return out;
    },
    serialize() { return { done: Array.from(done) }; },
    deserialize(o) {
      M.abort(); closeAsk(); lastFailed = null; closeJcard();
      done.clear();
      const list = o && Array.isArray(o.done) ? o.done : [];
      for (const id of list) if (typeof id === 'string') done.add(id);
      giverT = 0; refreshGivers(true);
    },
  });

  N.on('game:quit', () => { M.abort(); closeAsk(); lastFailed = null; });

  N.addSystem({
    id: 'missions', order: 10, runIn: ['play', 'dialogue', 'cutscene', 'minigame'],
    init() {
      if (N.save && N.save.register) N.save.register('missions', { serialize: M.serialize, deserialize: M.deserialize });
      // refuse player-facing saves during missions (systems §6.2, §13.9)
      if (N.save && typeof N.save.save === 'function' && !N.save._missionGuard) {
        const orig = N.save.save;
        N.save.save = function (meta) {
          const reason = meta && meta.reason;
          if (reason && reason !== 'mission' && !(meta && meta.force)) {
            const c = M.canSave();
            if (!c.ok) {
              if (!meta || meta.toast !== false) N.hud.toast(c.why, 2400);
              N.emit('save:refused', { reason, why: c.why });
              return false;
            }
          }
          return orig.apply(this, arguments);
        };
        N.save._missionGuard = true;
      }
    },
    update: tick,
    draw,
    reset() {
      if (active) { const r = active; abortRun(r, 'abort'); endRun(r, 'abort'); }
      done.clear(); lastFailed = null; closeAsk(); giverCooldown.clear(); closeJcard();
      for (const k in streaks.game) delete streaks.game[k];
      for (const k in streaks.timer) delete streaks.timer[k];
      for (const d of giverList) N.hud.unblip('giver:' + d.id);
      giverList = []; giverT = 0;
    },
  });
})();
