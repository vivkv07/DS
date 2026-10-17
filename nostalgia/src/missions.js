/* NOSTALGIA — missions.js
 * Coroutine mission runner (ARCHITECTURE §11). A mission is an async script(m); every m.*
 * call is tracked by the run, ticked each update step, and rejected with a MissionAbort when
 * the run fails / is quit / a save is loaded (scripts must not catch it). Also: world
 * markers (pulsing cylinders of light on the ground layer + minimap blips + off-screen
 * arrows), mission givers that start missions when the player walks in, checkpoints with
 * fast-forward retry, MISSION PASSED / FAILED banners, rewards and autosave.
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
  let giverCooldown = null; // giver id the player must walk out of before it triggers again
  let runSeq = 0;

  const MISSION_COLOR = '#ff5fb0';
  const GIVER_COLOR = '#f2c230';

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
        if (!has) { const r = { win: true, skipped: true, missing: true }; run.record.games.push(r); run.gi++; return Promise.resolve(r); }
        run.inMinigame = true;
        return wrap(run, MG.start(id, params || {}), (r) => { run.inMinigame = false; r = r || { win: false }; run.record.games.push(r); run.gi++; return r; });
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
    N.emit('mission:start', { id, title: def.title, attempt: run.attempt });
    if (run.attempt === 1) N.hud.banner(def.title || id, def.chapter != null ? (typeof def.chapter === 'number' ? 'Chapter ' + def.chapter : String(def.chapter)) : '', 2600, { kind: 'chapter' });
    let abortReject;
    const abortP = new Promise((_, rej) => { abortReject = rej; });
    abortP.catch(() => {});
    run.abortReject = abortReject;
    const scriptP = Promise.resolve().then(() => def.script(run.m));
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
    if (result === 'abort') N.emit('mission:abort', { id: run.id });
    return true;
  }

  function succeed(run) {
    if (!endRun(run, 'pass')) return;
    const def = run.def;
    done.add(def.id);
    lastFailed = null;
    const rw = def.reward || {};
    let sub = def.passText || 'Respect +';
    if (rw.money) { N.player.money += rw.money; N.emit('money', { delta: rw.money, total: N.player.money, mission: def.id }); sub += '   ' + U.fmtMoney(rw.money); }
    if (rw.item) N.player.inventory.add(rw.item);
    if (rw.flag) N.flags[rw.flag] = true;
    N.hud.banner('MISSION PASSED', sub, 4200, { kind: 'pass' });
    N.emit('mission:complete', { id: def.id, title: def.title, reward: rw });
    N.emit('mission:pass', { id: def.id });
    if (typeof def.onPass === 'function') { try { def.onPass(); } catch (e) { N.err('mission.onPass', e); } }
    if (def.autosave !== false && N.save && N.save.save) { try { N.save.save({ reason: 'mission' }); } catch (e) { N.err('mission.autosave', e); } }
    refreshGivers(true);
  }

  function failRun(run, reason) {
    if (!endRun(run, 'fail')) return;
    lastFailed = { id: run.id, cp: run.checkpointData, record: run.record, startPos: run.startPos, attempt: run.attempt };
    giverCooldown = run.def.giver ? run.id : null;
    N.hud.banner('MISSION FAILED', reason || '', 3600, { kind: 'fail' });
    N.emit('mission:fail', { id: run.id, reason: reason || '' });
    const myFail = lastFailed;
    setTimeout(() => { if (lastFailed === myFail && !active) openAsk(run.def); }, 1500);
  }

  function retry() {
    if (!lastFailed || active) return false;
    const lf = lastFailed;
    lastFailed = null;
    closeAsk();
    return start(lf.id, { retry: lf });
  }

  function openAsk(def) {
    askOpen = true; askT = 14;
    N.hud.ask('RETRY “' + (def.title || def.id).toUpperCase() + '”?', [
      { label: 'Retry', key: 'E', fn: () => retry() },
      { label: 'Not now', fn: () => { lastFailed = null; closeAsk(); } },
    ]);
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
    const list = order.map((id) => defs[id]).filter((d) => d.giver && isAvailable(d));
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
        if (T.left <= 0) { run.timer = null; abortRun(run, 'fail', T.failMsg); }
      }
    }
    if (mode !== 'play') return;
    // retry offer on ACTION while the ask card is up
    if (askOpen) {
      askT -= dt;
      if (askT <= 0 || !lastFailed) closeAsk();
      else N.interact.offer({ label: 'Retry mission', priority: 5, dist: 0, use: retry });
    }
    // givers
    giverT -= dt;
    if (giverT <= 0) { giverT = 0.5; refreshGivers(false); }
    if (active) return;
    const p = N.player;
    for (const d of giverList) {
      const g = giverPos(d); if (!g) continue;
      const r = (d.giver.r || 14);
      const dist = Math.hypot(p.x - g.x, p.y - g.y);
      if (giverCooldown === d.id) { if (dist > r + 24) giverCooldown = null; continue; }
      if (dist <= r && (!d.giver.onFoot || !p.vehicle) && !p.controlsLocked) { start(d.id); return; }
    }
    for (const id of order) { const d = defs[id]; if (d.autoStart && isAvailable(d)) { start(id); return; } }
  }

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
    MissionAbort, defs, done,
    get active() { return active; },
    get lastFailed() { return lastFailed; },
    /** {id, chapter, title, giver: {place|npc|x,y, r?, onFoot?}, requires: [ids], autoStart, when(),
     *  reward: {money, item, flag}, passText, color, autosave, script: async (m) => {...}} */
    register(def) {
      if (!def || !def.id || typeof def.script !== 'function') { N.err('missions.register', new Error('bad mission def ' + (def && def.id))); return null; }
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
      M.abort(); closeAsk(); lastFailed = null;
      done.clear();
      const list = o && Array.isArray(o.done) ? o.done : [];
      for (const id of list) if (typeof id === 'string') done.add(id);
      giverT = 0; refreshGivers(true);
    },
  });

  N.on('game:quit', () => { M.abort(); closeAsk(); lastFailed = null; });

  N.addSystem({
    id: 'missions', order: 10, runIn: ['play', 'dialogue', 'cutscene', 'minigame'],
    init() { if (N.save && N.save.register) N.save.register('missions', { serialize: M.serialize, deserialize: M.deserialize }); },
    update: tick,
    draw,
    reset() {
      if (active) { const r = active; abortRun(r, 'abort'); endRun(r, 'abort'); }
      done.clear(); lastFailed = null; closeAsk(); giverCooldown = null;
      for (const d of giverList) N.hud.unblip('giver:' + d.id);
      giverList = []; giverT = 0;
    },
  });
})();
