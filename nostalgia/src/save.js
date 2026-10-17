/* NOSTALGIA — save.js
 * Save / load with a section registry (ARCHITECTURE §12). One JSON blob under
 * 'nostalgia.save.v1' (+ a '.bak' copy of the previous good save). Every localStorage call is
 * wrapped; without storage (private mode, blocked) saves live in memory for the session.
 * Corrupted or partial data never throws: a bad blob falls back to the backup, and each
 * section deserializes on its own (one broken section can't sink the rest).
 *
 *   N.save.register('story', {serialize: () => ({...}), deserialize: (o) => {...}})
 *   N.save.save({reason: 'booth'}) -> bool     N.save.load() -> bool
 *   N.save.has() -> bool    N.save.info() -> {t, day, clock, date, money, district, missions} | null
 *   N.save.tooNew -> {v, slot} | null   N.save.allowed() -> {ok, why}   N.save.autosave(reason) -> bool
 *
 * Newer saves: a blob written by a newer build (v > VERSION) in the main slot, the backup or the
 * pause menu's manual copy is never overwritten. While one exists every save() is refused (also
 * mission autosaves and a new game's saves) and the player is told; CONTINUE plays the older
 * backup if there is one. Erasing the saves (menus) removes the block.
 */
(() => {
  'use strict';
  const N = window.N;
  const KEY = 'nostalgia.save.v1';
  const BAK = KEY + '.bak';
  const VERSION = 1;
  const MANUAL = KEY + '.manual'; // menus.js writes the pause menu's own copy here
  const NEWER_MSG = 'Saved by a newer version of the game - update to continue it. Progress will not be saved.';

  /* --------------------------------------------------------------- storage */
  const memory = Object.create(null);
  let storageOK = null;
  function hasStorage() {
    if (storageOK !== null) return storageOK;
    try {
      const k = '__nostalgia_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      storageOK = true;
    } catch (e) { storageOK = false; }
    return storageOK;
  }
  function read(key) {
    if (hasStorage()) { try { const v = window.localStorage.getItem(key); if (v != null) return v; } catch (e) { /* fall through */ } }
    return memory[key] != null ? memory[key] : null;
  }
  function write(key, val) {
    memory[key] = val;
    if (!hasStorage()) return true;
    try { window.localStorage.setItem(key, val); return true; } catch (e) { S.lastError = String(e && e.message || e); return false; }
  }
  function remove(key) {
    delete memory[key];
    if (hasStorage()) { try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  }

  /* -------------------------------------------------------------- parsing */
  function parse(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let o;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (o.game !== 'nostalgia' || typeof o.v !== 'number' || o.v > VERSION) return null;
    if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) return null;
    return o;
  }
  /** {v, slot} for the first slot holding a save from a newer build, else null. */
  function newerSave() {
    for (const [slot, key] of [['main', KEY], ['backup', BAK], ['manual', MANUAL]]) {
      const raw = read(key);
      if (!raw || typeof raw !== 'string' || raw.indexOf('"nostalgia"') < 0) continue;
      let o;
      try { o = JSON.parse(raw); } catch (e) { continue; }
      if (o && typeof o === 'object' && o.game === 'nostalgia' && typeof o.v === 'number' && o.v > VERSION) return { v: o.v, slot };
    }
    return null;
  }
  function warnNewer(ms) {
    if (N.hud && N.hud.toast) { try { N.hud.toast(NEWER_MSG, ms || 5200, { key: 'save-newer' }); } catch (e) { N.err('save.warnNewer', e); } }
  }
  function current() {
    const main = parse(read(KEY));
    if (main) return { blob: main, from: 'main' };
    const bak = parse(read(BAK));
    if (bak) return { blob: bak, from: 'backup' };
    return null;
  }

  /* ------------------------------------------------------------- registry */
  const handlers = new Map(); // key -> {serialize, deserialize}

  const S = (N.save = {
    KEY, VERSION, NEWER_MSG, lastError: null,
    handlers,
    get available() { return hasStorage(); },
    /** {v, slot} while a save from a newer build exists (every save is refused), else null. */
    get tooNew() { return newerSave(); },
    /** Is saving allowed right now? The pause menu's rules when menus.js is loaded (missions,
     *  minigames, cutscenes, dialogue, Chappal Meter, N.flags.no_save), else the missions' rules. */
    allowed() {
      const mode = N.state.mode;
      if (mode === 'boot' || mode === 'title' || N.state.has('gameover')) return { ok: false, why: 'Not now.' };
      if (newerSave()) return { ok: false, why: NEWER_MSG };
      try {
        if (N.menus && typeof N.menus.canSave === 'function') { const c = N.menus.canSave(); return { ok: !!c.ok, why: c.ok ? null : c.reason }; }
        if (N.missions && typeof N.missions.canSave === 'function') return N.missions.canSave();
      } catch (e) { N.err('save.allowed', e); return { ok: false, why: 'Not now.' }; }
      return { ok: true, why: null };
    },
    /** Silent background save (tab hidden / page closing) when allowed(); never toasts. */
    autosave(reason) {
      if (!S.allowed().ok) return false;
      return S.save({ reason: reason || 'autosave', toast: false });
    },
    /** Register a save section. Later registrations of the same key replace it. */
    register(key, h) {
      if (!key || !h || typeof h.serialize !== 'function' || typeof h.deserialize !== 'function') { N.err('save.register', new Error('bad handler ' + key)); return; }
      handlers.set(key, h);
    },
    /** Write the game. meta: {reason}. Returns true on success (memory-only counts). */
    save(meta) {
      const mode = N.state.mode;
      if (mode === 'boot' || mode === 'title') return false;
      const newer = newerSave();
      if (newer) {
        // never overwrite progress from a newer build (it would be lost for good)
        N.emit('save:refused', { reason: (meta && meta.reason) || 'manual', why: 'newer', v: newer.v, slot: newer.slot });
        if (!meta || meta.toast !== false) warnNewer();
        return false;
      }
      const data = {};
      for (const [key, h] of handlers) {
        try {
          const v = h.serialize();
          if (v !== undefined) data[key] = JSON.parse(JSON.stringify(v)); // drop functions / cycles early
        } catch (e) { N.err('save.serialize:' + key, e); }
      }
      const p = N.player;
      const d = N.world.built ? N.world.districtAt(p.x, p.y) : null;
      const blob = {
        game: 'nostalgia', v: VERSION, t: Date.now(),
        meta: {
          reason: (meta && meta.reason) || 'manual',
          day: N.clock.day, clock: N.clock.label(), date: N.clock.dateLabel(),
          money: p.money, district: d ? d.name : null,
          missions: N.missions && N.missions.done ? N.missions.done.size : 0,
        },
        data,
      };
      let raw;
      try { raw = JSON.stringify(blob); } catch (e) { N.err('save.stringify', e); return false; }
      const prev = read(KEY);
      if (prev && parse(prev)) write(BAK, prev);
      const ok = write(KEY, raw);
      N.emit('save', { ok, reason: blob.meta.reason, memoryOnly: !hasStorage() });
      if (ok && N.hud && (!meta || meta.toast !== false)) N.hud.toast(hasStorage() ? 'Progress saved.' : 'Saved for this session (browser storage is off).', 2200);
      return ok;
    },
    /** Load the saved game into the running world. Returns false (and changes nothing) if
     *  there is no valid save. Systems are reset first, then each section is restored. */
    load() {
      const cur = current();
      if (!cur) return false;
      const blob = cur.blob;
      try { if (N.missions && N.missions.abort) N.missions.abort(); } catch (e) { N.err('save.load.abort', e); }
      try { if (N.dialogue && N.dialogue.cancel) N.dialogue.cancel(); } catch (e) { N.err('save.load.dialogue', e); }
      // clean slate (entities, vehicles, HUD, wanted...), then restore every section
      for (const k of Object.keys(N.flags)) delete N.flags[k];
      N.systems.reset();
      for (const [key, h] of handlers) {
        if (!(key in blob.data)) continue;
        try { h.deserialize(blob.data[key]); } catch (e) { N.err('save.deserialize:' + key, e); }
      }
      N.emit('save:loaded', { from: cur.from, meta: blob.meta || {} });
      return true;
    },
    has() { return !!current(); },
    /** Summary of the stored save (for a "Continue" button), or null. */
    info() {
      const cur = current();
      if (!cur) return null;
      return Object.assign({ t: cur.blob.t, from: cur.from }, cur.blob.meta || {});
    },
    clear() { remove(KEY); remove(BAK); N.emit('save:cleared', {}); },
    /** Test hook: raw access to the stored string. */
    _raw: () => read(KEY),
  });

  // Tell the player as soon as they start playing over a newer save (the title shows a note too).
  N.on('game:new', () => { if (newerSave()) setTimeout(() => warnNewer(6500), 1200); });
  N.on('game:continue', () => { if (newerSave()) setTimeout(() => warnNewer(6500), 1200); });

  /* ------------------------------------------------- core sections */
  S.register('player', {
    serialize() {
      const p = N.player;
      const o = p.serialize();
      const v = p.vehicle;
      if (v) o.vehicle = { type: v.type, angle: v.angle, color: v.color, color2: v.color2, seed: v.seed };
      o.angle = (v || p).angle || 0;
      return o;
    },
    deserialize(o) {
      if (!o || typeof o !== 'object') return;
      const p = N.player;
      const safe = Object.assign({}, o);
      if (!isFinite(safe.x) || !isFinite(safe.y)) { const sp = (N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.player) || [N.WORLD_W / 2, N.WORLD_H / 2]; safe.x = sp[0]; safe.y = sp[1]; }
      if (!isFinite(safe.money)) safe.money = p.money;
      if (!isFinite(safe.energy)) safe.energy = 100;
      if (!Array.isArray(safe.inventory)) safe.inventory = [];
      p.deserialize(safe);
      p.noCollide = false; p.controlsLocked = false; p.exhausted = false;
      p.teleport(safe.x, safe.y);
      if (isFinite(o.angle)) p.angle = o.angle;
      const vt = o.vehicle;
      if (vt && N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[vt.type]) {
        const T = N.vehicles.TYPES[vt.type];
        const f = N.world.findFree(p.x, p.y, T.mode === 'boat' ? 'boat' : 'drive', 24);
        if (f) {
          const v = N.vehicles.spawn(vt.type, f.x, f.y, isFinite(vt.angle) ? vt.angle : 0, { color: vt.color, color2: vt.color2, seed: vt.seed });
          if (v) N.vehicles.enter(p, v);
        }
      }
    },
  });
  S.register('clock', {
    serialize: () => N.clock.serialize(),
    deserialize(o) {
      if (!o || !isFinite(o.minutes)) return;
      N.clock.deserialize({ minutes: ((+o.minutes % 1440) + 1440) % 1440, day: Math.max(0, Math.floor(+o.day || 0)) });
    },
  });
  S.register('flags', {
    serialize: () => Object.assign({}, N.flags),
    deserialize(o) {
      for (const k of Object.keys(N.flags)) delete N.flags[k];
      if (o && typeof o === 'object' && !Array.isArray(o)) Object.assign(N.flags, o);
    },
  });
})();
