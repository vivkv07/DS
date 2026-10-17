/* NOSTALGIA — story.js  (owner: story agent, part 1 of the story layer)
 * Implements story_bible.md literally for: the 2026 PROLOGUE (§4.1), missions M1 bo_kaata,
 * M2 lost_and_found, M3 first_day_first_show, M4 last_man_batting, M5 right_right,
 * M6 ammammas_thursday (§4), side activities SA1 pandal_duty, SA2 current_poyindi,
 * SA3 sunday_mutton, SA4 six_balls (§7), and the LB Stadium cricket match (places_registry
 * round 12) with amendments.md applied (A3: Chinnu only ever drives cycles here; the auto, the
 * bus and Bunty's RX100 are passenger rides). story2.js owns M7-M12, the interlude, the ending,
 * the 2026 epilogue, SA5-SA8.
 *
 * THE LB STADIUM MATCH (registry round 12): it is the finale of SA4 `six_balls` (Ayesha's own
 * story, bible §7): after the three dawn nets and the six-ball challenge at the camp, the coach
 * puts the Summer Camp Final under the LB Stadium floodlights the same evening: Chinnu XI (Immu
 * and Ayesha in the side, Ayesha opens the bowling) against Ashok Nagar XI, played with
 * N.minigames.play('match', ...) from cricket_match.js (falls back to the gully `cricket`
 * minigame when the match engine is missing). N.flags.lb_match is on for the match day (crowds,
 * floodlights). Afterwards the side mission `lb_exhibition` (giver: the camp coach at
 * `lb_stadium`) replays it as an exhibition match any day, 06:00-20:00. M4 keeps the bible's
 * "Stadium mein nakko! No match today" (the final day is a gully match on the Public Gardens lawn).
 *
 * Playthrough fixes (reviewer): after CONTINUE every story giver (story.js and story2.js) waits until the player
 * has stepped out of the spot he loaded on (no mission starts by itself on the 1 s J-card dwell); on a pandal
 * night (21:00-23:30, 31 Aug-8 Sep) the shared playground_1 ring belongs to SA1, so the optional nights can be
 * played before M10; queue cages bend along footpaths instead of crossing a carriageway; the LB match's home
 * side carries the nickname ("Pintu XI", hero "Pintu"); the Journal's ▶ Replay replays the mission (§9.5).
 * Round 2: ACTION by an unmounted mission cycle never opens the shop next to it (mountGuard: shops.js's
 * per-mission lock while he stands by it); the score bug says "PINTU XI" (a short nickname whole) and the camp
 * side has no Bunty-anna (19): Pappu plays; roof rings get real mission markers in the 3D view (rings3d); after
 * a pandal night the committee's boy walks home without the curfew (N.flags.no_curfew = 'pandal' until home or
 * morning); an automated quick start (N.menus.quickStart, navigator.webdriver) skips the prologue as menus.js
 * skips the name card (tests that drive the real flow turn quickStart off).
 *
 * Everything is referenced by place / landmark id (the map is being rebuilt on real geography);
 * roof routes come from N.world.roofs (route 'lakshmi_lootna') with a ground fallback.
 * Every neighbour module may be a stub: wanted (stub = level only), traffic, view3d, collectibles,
 * cricket_match, shops, hints are all feature-checked.
 *
 * ================================================================ API: N.story
 *   chapter                    current chapter number (1..), part: 1
 *   MISSIONS, SIDES            ids registered here
 *   prologue() -> Promise      plays the 2026 prologue cutscene, then starts M1 on home_terrace
 *   begin()                    = prologue() for a fresh game (game:new without skipIntro calls it)
 *   replay(missionId)          Side A replay (Journal button after the credits, bible §9.5): the mission plays
 *                              again on its own date via N.story2.replay; else the J-card + the tape track
 *   kit                        mission helpers story2.js may reuse (all take the mission api `m` first):
 *     npc(m, id, target, opts) -> actor        N.npcs.spawn + m.spawn (talk:false by default)
 *     walkNpc(m, key, target, opts) -> Promise  tracked walk (teleports while a retry fast-forwards)
 *     party(m, ids) -> {show(), hide(), ids}  companions that follow the player
 *     act(m, target, label, opts) -> Promise    ACTION at a place / point / actor (marker + blip; roofs ok)
 *     press(m, label, opts) -> Promise          ACTION anywhere ("▶ Play the tape")
 *     ride(m, {type, driver, to, lines, secs, minutes, label, companions}) -> Promise  passenger ride
 *       (real drive with the camera on the vehicle, then the VHS ▶▶ to the destination; E skips)
 *     rings(m, points, {secs, label, timerLabel}) -> Promise<bool on time>   soft-timed run (never fails)
 *     softTimer(secs, label, {onExpire}) -> {left, expired, stop()}
 *     queue(m, {at, ahead, behind, cutters, friend, respect, label}) -> q {done, steps, ahead, cut}
 *     cargo(m, {item, label, vehicle, light, failLine}) -> c {v, stop()}   (fails the mission below 40)
 *     darkness(on, {torch, cone, candles}) / candle(x, y)   power-cut / night-watch overlay
 *     findPlace(m, placeId, {label, near, r, hint})   riddle step: marker only when near / after a hint
 *     game(m, id, params) -> result             m.minigame + test hooks
 *     playMatch(m, params) -> result            the LB match ('match'), falls back to 'cricket'
 *     chapterCard(n) -> cutscene steps, money(m, paise, why, companion), at(h, mi)
 *   debug  {mg: null|'win'|'lose' (forces minigame autoplay), fastRides: false, skip() (finishes the
 *          current kit step), target() -> {x, y} of the current goal, use() (fires the current act/press),
 *          expire() (runs the soft timers out: M5's late branch)}
 *
 * Flags written: prologue_seen, lock_1..lock_4 + riddle_1..riddle_4 (the Lock page), bunty_words
 *   [...], meter_live + sa6_unlocked (M3), side_cricket (M4), clue5_solved (M6), power_cut (SA2 /
 *   free-roam power cuts after M4), sa2_runs, sa3_runs, dosa_with_nanna, pandal_nights,
 *   tiger_helps_lorry, ayesha_camp_badge, lb_match (match day), lb_match_unlocked.
 * Items given: camera, kite x5 + charkhi (M1), tin (M2), biryani_parcel (M3), signed_ball (M4),
 *   punched_ticket (M5), torch (SA2 x3), honey cake (eaten).
 * Hints (N.hints.register): lost_and_found, first_day_first_show, last_man_batting, right_right,
 *   the_clap (tiers off until M6 solves it).
 * Mission givers: N.missions givers + a giver NPC spawned beside each visible marker (Amma, Bunty,
 *   Nanna, Ayesha, the coach...), despawned when a mission starts.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================ helpers */
  const F = () => N.flags || (N.flags = {});
  const run = () => (N.missions && N.missions.active) || null;
  const ff = () => { const r = run(); return !!(r && r.ff); };
  const mode = () => (N.state && N.state.mode) || 'boot';
  const isDone = (id) => { try { return !!(N.missions && N.missions.isDone(id)); } catch (e) { return false; } };
  const plain = (s) => String(s == null ? '' : s).replace(/\*([^*]+)\*/g, '$1');
  let seq = 0;
  function toast(t, ms, key) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2800, key ? { key } : undefined); } catch (e) { N.err('story.toast', e); } }
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, o || { ui: true }); } catch (e) { /* audio is optional */ } }
  function music(id) { const r = run(); if (r) r.music = id || null; }
  function landmark(id) { return ((N.WORLD_DATA && N.WORLD_DATA.landmarks) || []).find((l) => l.id === id) || null; }
  function roofs() { return (N.world && N.world.roofs && typeof N.world.roofs.get === 'function') ? N.world.roofs : null; }
  function roofCentre(r) { return { x: r.rect[0] + r.rect[2] / 2, y: r.rect[1] + r.rect[3] / 2, roof: r.id, h: r.h }; }
  /** Put the player on roof `id` (teleport onto its place point; if that point is not a roof cell on the
   *  current map, climb the roof's stairs instead). Returns true when the player stands on it. */
  function putPlayerOnRoof(id, placeId) {
    const p = N.player, RF = roofs();
    if (!p) return false;
    const P = pos(placeId || id);
    if (P && p.level !== id) p.teleport(P.x, P.y);
    if (RF && RF.get(id) && p.level !== id && typeof RF.climb === 'function') { try { RF.climb(id, 0, p, { instant: true }); } catch (e) { N.err('story.roof', e); } }
    return p.level === id;
  }
  /** target -> {x, y} (place id | landmark id | npc key | roof id | [candidates] | [x, y] | {x, y} | entity) */
  function pos(t) {
    if (t == null) return null;
    if (Array.isArray(t)) {
      if (typeof t[0] === 'number') return { x: t[0], y: t[1] };
      for (const c of t) { const p = pos(c); if (p) return p; }
      return null;
    }
    if (typeof t === 'string') {
      if (t === 'player') return N.player;
      const p = N.places[t]; if (p) return p;
      const L = landmark(t); if (L) return { x: L.x, y: L.y + L.d / 2 + 12, lm: L };
      try { const a = N.npcs && N.npcs.get && N.npcs.get(t); if (a) return a; } catch (e) { /* stub */ }
      const R = roofs(); if (R) { const r = R.get(t); if (r) return roofCentre(r); }
      return null;
    }
    if (typeof t === 'function') return pos(t());
    if (typeof t === 'object' && t.alive !== false && isFinite(t.x) && isFinite(t.y)) return t;
    return null;
  }
  /** First candidate id that exists (place, landmark, npc or roof); arrays only. */
  function pick(t) {
    if (!Array.isArray(t) || typeof t[0] === 'number') return t;
    for (const c of t) if (pos(c)) return c;
    return t[t.length - 1];
  }
  /** Height of the roof under a target (0 = ground). */
  function roofH(p) {
    if (!p) return 0;
    const R = roofs(); if (!R) return 0;
    try {
      if (p.h && p.roof) return p.h;
      if (p.level && R.get(p.level)) return R.get(p.level).h || 0;
      if (p.roof && typeof p.roof === 'string' && R.get(p.roof) && p.kind === 'terrace') return R.get(p.roof).h || 0;
    } catch (e) { /* ignore */ }
    return 0;
  }
  function walkable(x, y, r) {
    try { const f = N.world.findFree(x, y, 'walk', r || 60); if (f) return { x: f.x, y: f.y }; } catch (e) { /* ignore */ }
    return { x, y };
  }
  /** A walkable spot near a target, offset by (dx, dy). */
  function spot(t, dx, dy, r) { const p = pos(t); if (!p) return null; return walkable(p.x + (dx || 0), p.y + (dy || 0), r); }
  function dist(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity; }
  /** Move the clock forward to h:mi on the same day (never backwards). */
  function at(h, mi) {
    const t = h * 60 + (mi || 0);
    if (N.clock && t > N.clock.minutes) N.clock.set(h, mi || 0);
  }
  function wanted() { return N.wanted || null; }
  function wantedLevel() { const W = wanted(); return W ? W.level | 0 : 0; }
  function wantedSet(n, why) { const W = wanted(); if (!W) return; try { if (W.set) W.set(n, why || 'story'); } catch (e) { N.err('story.wanted', e); } }
  function wantedAdd(n, why) { const W = wanted(); if (!W) return; try { if (W.add) W.add(n == null ? 1 : n, why || 'story'); } catch (e) { N.err('story.wanted', e); } }
  function wantedClear(why) { const W = wanted(); if (!W) return; try { if (W.clear) W.clear(why || 'story'); else if (W.set) W.set(0); } catch (e) { N.err('story.wanted', e); } }
  const realWanted = () => { const W = wanted(); return !!(W && typeof W.policy === 'function'); };
  /** Pay (paise < 0) or earn (paise > 0). Paying never goes below ₹0: in the story the companion
   *  with him pays the rest ("Bunty-anna paid the rest."), so a forced purchase never leaves a debt. */
  const WHO = { bunty: 'Bunty-anna', immu: 'Immu', amma: 'Amma', ammi: 'Ammi', ayesha: 'Ayesha' };
  function money(m, paise, why, companion) {
    if (!paise || ff()) return;
    if (paise > 0) { m.money(paise); return; }
    const p = N.player;
    const have = Math.max(0, p.money | 0), cost = -paise;
    const take = Math.min(have, cost);
    if (take > 0) m.money(-take);
    if (take < cost) toast((WHO[companion || 'immu'] || 'A friend') + ' paid the rest (₹' + Math.ceil((cost - take) / 100) + ').', 2400, 'udhaar');
    N.emit('shop:buy', { place: 'story', item: why || 'story', price: cost, qty: 1 });
  }
  function give(m, id, name, n) {
    if (ff()) return;
    m.give(id, name ? { name } : undefined);
    if (n && N.player && typeof N.player.addItem === 'function') { try { N.player.addItem(id, n); } catch (e) { /* ignore */ } }
  }
  function feed(n, why) { const p = N.player; if (!p || ff()) return; try { if (p.feed) p.feed(n, { quiet: true }); else p.energy = Math.min(100, (p.energy || 0) + n); } catch (e) { N.err('story.feed', e); } if (why) toast(why, 2400); }
  function lockDigit(slot, digit) {
    const f = F();
    f['lock_' + slot] = digit; f['riddle_' + slot] = true;
    const d = [1, 2, 3, 4].map((i) => (f['lock_' + i] != null ? f['lock_' + i] : '_')).join(' ');
    if (!ff()) toast('The Lock: ' + d, 3200, 'lock');
  }
  function buntyWord(def) { const f = F(); if (!Array.isArray(f.bunty_words)) f.bunty_words = []; if (f.bunty_words.indexOf(def) < 0) f.bunty_words.push(def); }
  function setVariant(id, v) { try { if (N.npcs && N.npcs.setVariant) N.npcs.setVariant(id, v); } catch (e) { /* ignore */ } }
  function col() { return N.collectibles || null; }
  function unlockSeries(s) { const C = col(); try { if (C && C.unlockSeries) C.unlockSeries(s); } catch (e) { N.err('story.unlock', e); } }
  function hasItem(id) { const C = col(); try { return !!(C && C.has && C.has(id)); } catch (e) { return false; } }
  function beacon(t, o) { try { if (N.audio && N.audio.beacon) N.audio.beacon(t || null, o); } catch (e) { /* ignore */ } }
  function bark(target, text, secs) { try { if (N.dialogue && N.dialogue.bark) return N.dialogue.bark(target, text, { secs: secs || 3 }); } catch (e) { N.err('story.bark', e); } return null; }
  function emote(key, e, secs) { try { if (N.npcs && N.npcs.emote) N.npcs.emote(key, e, secs || 2); } catch (e2) { /* ignore */ } }
  function face(key, t) { try { if (N.npcs && N.npcs.face) N.npcs.face(key, t); } catch (e) { /* ignore */ } }

  /* ================================================================ live state (cleaned on every mission end) */
  const S = {
    cleanups: [], offers: new Set(), acts: new Map(), rings: new Set(), labels: new Set(), timers: new Set(),
    ride: null, pin: null, queue: null, cargo: null, tag: null, dark: null, kite: null, step: null,
    givers: new Map(), giverT: 0, extras: new Set(), widget: null, lastDay: null, pcT: 0, stepOut: null, sideWas: null,
  };
  function onEnd(fn) { S.cleanups.push(fn); }
  function cleanupAll() {
    const list = S.cleanups.splice(0);
    for (const fn of list.reverse()) { try { fn(); } catch (e) { N.err('story.cleanup', e); } }
    for (const id of S.acts.keys()) { try { N.interact.remove(id); } catch (e) { /* ignore */ } }
    S.acts.clear(); S.offers.clear(); S.rings.clear(); S.labels.clear();
    for (const T of S.timers) { T.on = false; }
    S.timers.clear();
    S.queue = null; S.cargo = null; S.tag = null; S.kite = null; S.step = null; S.pin = null; S.tickFns = null; S.kiteTick = null;
    if (S.ride) endRide(true);
    darkness(false);
    widget(null);
    beacon(null);
    for (const e of Array.from(S.extras)) { e.alive = false; try { N.entities.remove(e); } catch (er) { /* ignore */ } }
    S.extras.clear();
    const p = N.player;
    if (p) { p.noRun = false; if (p.hidden && !S.ride) p.hidden = false; }
    // free-roam side minigames come back (they were off so a stray ACTION never starts marbles mid-mission)
    if (S.sideWas != null) { F().mg_side_off = S.sideWas || undefined; if (!S.sideWas) delete F().mg_side_off; S.sideWas = null; }
  }

  /* ================================================================ extras (queue people, porters, raiders, crowds) */
  class Extra extends N.Actor {
    constructor(x, y, look, o) {
      super({ kind: 'npc', r: 3.4, solid: false, noCollide: true, mass: 1 });
      o = o || {};
      this.role = o.role || 'extra'; this.extra = true;
      this.x = x; this.y = y; this.look = look || N.people.randomLook(U.rng('extra' + (++seq)));
      this.anim = { phase: 0, speed: 0, run: false };
      this.angle = this.facing = o.angle || 0;
      this.tx = null; this.ty = null; this.speed = o.speed || 40;
      this.mark = null; this.life = null; this.name = o.name || null;
    }
    moveTo(x, y, speed) { this.tx = x; this.ty = y; if (speed) this.speed = speed; }
    update(dt) {
      if (this.tx != null) {
        const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
        if (d < 0.5) { this.x = this.tx; this.y = this.ty; this.tx = null; this.anim.speed = 0; }
        else {
          const st = Math.min(d, this.speed * dt);
          this.x += (dx / d) * st; this.y += (dy / d) * st;
          this.angle = this.facing = Math.atan2(dy, dx);
          this.anim.speed = Math.min(1, this.speed / 45); this.anim.run = this.speed > 60; this.anim.phase += st * 0.26;
        }
      } else {
        this.anim.speed = 0;
        if (this.faceTo) { const q = pos(this.faceTo); if (q) this.angle = this.facing = Math.atan2(q.y - this.y, q.x - this.x); }
      }
      if (this.life != null) { this.life -= dt; if (this.life <= 0) { this.alive = false; S.extras.delete(this); } }
    }
    draw() {
      const R = N.render, D = N.draw;
      if (!R.inView(this.x, this.y, 24)) return;
      R.queue('shadow', 0, () => D.shadow(this.x, this.y, 7, 9, this.angle, 1.5));
      R.queue('actors', this.y, () => D.sprite(this.x, this.y, this.angle, 8, (ctx) => N.people.draw(ctx, this.look, this.anim)));
      if (this.mark) {
        const mk = this.mark, x = this.x, y = this.y;
        R.queue('sky', 2, () => { try { D.pixelText(x, y - 14, 10, mk, '#fff4dc', { scale: 2, shadow: '#1a1214' }); } catch (e) { /* ignore */ } });
      }
    }
  }
  function extra(x, y, look, o) {
    const e = new Extra(x, y, look, o);
    N.entities.add(e);
    S.extras.add(e);
    return e;
  }
  function extraAt(target, dx, dy, look, o) {
    const s0 = spot(target, dx, dy, 40) || pos('player');
    return extra(s0.x, s0.y, look, o);
  }
  function lookOf(id) { try { if (N.npcs && N.npcs.look) return N.npcs.look(id); } catch (e) { /* ignore */ } return null; }
  function randomLook(seed, kind) { return N.people.randomLook(U.rng(String(seed)), kind); }

  /* ================================================================ NPC helpers */
  function npc(m, id, target, o) {
    o = o || {};
    if (!N.npcs || !N.npcs.spawn) return null;
    let a = null;
    try { a = N.npcs.spawn(id, target, Object.assign({ idle: 'stand', talk: false }, o)); } catch (e) { N.err('story.npc', e); }
    if (a && m) { try { m.spawn(a); } catch (e) { N.err('story.npc.track', e); } }
    return a;
  }
  function despawn(key) { try { if (N.npcs && N.npcs.despawn) N.npcs.despawn(key); } catch (e) { /* ignore */ } }
  /** Tracked NPC walk: resolves when it arrives (teleports on timeout or while fast-forwarding). */
  function walkNpc(m, key, target, o) {
    o = o || {};
    const a = N.npcs && N.npcs.get && N.npcs.get(key);
    const P = pos(target);
    if (!a || !P) return Promise.resolve(false);
    const snap = () => { const f = walkable(P.x, P.y, 30); a.x = f.x; a.y = f.y; a.homeX = f.x; a.homeY = f.y; };
    if (ff()) { snap(); return Promise.resolve(true); }
    let done = false, ok = false;
    try {
      N.npcs.walkTo(key, target, Object.assign({ timeout: 14, r: 10 }, o)).then((v) => { ok = !!v; done = true; }, () => { done = true; });
    } catch (e) { done = true; }
    return m.until(() => done).then(() => { if (!ok && o.snap !== false) snap(); return ok; });
  }
  function follow(key, on, o) {
    try { if (N.npcs && N.npcs.follow) N.npcs.follow(key, on ? N.player : null, Object.assign({ dist: 16 }, o || {})); } catch (e) { N.err('story.follow', e); }
  }
  /** Companions that walk with the player (spawned beside him). */
  function party(m, ids) {
    const P = {
      ids: ids.slice(), shown: false,
      show() {
        const p = N.player;
        P.ids.forEach((id, i) => {
          const ang = (p.angle || 0) + Math.PI + (i - (P.ids.length - 1) / 2) * 0.9;
          const f = walkable(p.x + Math.cos(ang) * 18, p.y + Math.sin(ang) * 18, 30);
          const a = npc(m, id, f, { idle: 'stand' });
          if (a) follow(id, true, { dist: 14 + i * 8, side: i % 2 ? 'left' : 'right' });
        });
        P.shown = true;
      },
      hide() { for (const id of P.ids) despawn(id); P.shown = false; },
      add(id) { if (P.ids.indexOf(id) < 0) P.ids.push(id); },
      drop(id) { const i = P.ids.indexOf(id); if (i >= 0) P.ids.splice(i, 1); follow(id, false); },
    };
    return P;
  }

  /* ================================================================ HUD widget (cargo / queue meters) */
  function ensureCss() {
    if (document.getElementById('st-css')) return;
    const s = document.createElement('style');
    s.id = 'st-css';
    s.textContent =
      '.st-meter{display:none;align-items:center;gap:8px;padding:3px 10px;font-family:var(--font-osd);font-size:18px;letter-spacing:1px;color:var(--osd);' +
      'text-shadow:2px 2px 0 var(--osd-shadow);background:rgba(18,13,22,.72);border-radius:3px;white-space:nowrap;max-width:calc(100vw - 24px)}' +
      '.st-meter.show{display:flex}.st-meter i{display:block;width:120px;height:9px;border:1px solid var(--auto-black);background:rgba(0,0,0,.35);border-radius:4px;overflow:hidden}' +
      '.st-meter b{display:block;height:100%;width:100%;background:var(--ok);transition:width .2s}.st-meter.low b{background:var(--danger)}' +
      '.st-meter em{font-style:normal;color:var(--auto-yellow)}' +
      '.st-art{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;opacity:0;transition:opacity .7s}' +
      '.st-art.on{opacity:1}';
    document.head.appendChild(s);
  }
  function widget(spec) {
    ensureCss();
    if (!S.widget) {
      const top = document.querySelector('#ui .hud-top');
      const e = document.createElement('div');
      e.className = 'st-meter';
      e.innerHTML = '<span class="st-l"></span><i><b></b></i><em></em>';
      if (top) { const t = top.querySelector('.hud-toasts'); top.insertBefore(e, t || null); } else { const ui = document.getElementById('ui'); if (!ui) return; ui.appendChild(e); }
      S.widget = e;
    }
    const e = S.widget;
    if (!spec) { e.classList.remove('show'); return; }
    e.classList.add('show');
    e.querySelector('.st-l').textContent = spec.label || '';
    const bar = e.querySelector('i');
    if (spec.value == null) bar.style.display = 'none';
    else { bar.style.display = ''; e.querySelector('b').style.width = Math.max(0, Math.min(100, spec.value)) + '%'; }
    e.querySelector('em').textContent = spec.text || '';
    e.classList.toggle('low', !!spec.low);
  }

  /* ================================================================ kit: ACTION points, prompts, markers */
  /** ACTION "label" at a target (marker + blip). Roof targets get a ring drawn at roof height. */
  function act(m, target, label, o) {
    o = o || {};
    target = pick(target);
    if (ff()) return Promise.resolve(true);
    const P0 = pos(target);
    if (!P0) { N.err('story.act', new Error('unknown target ' + JSON.stringify(target))); return Promise.resolve(false); }
    const id = 'st:act:' + (++seq);
    const st = { used: false };
    const spec = {
      get x() { const p = pos(target); return p ? p.x : null; },
      get y() { const p = pos(target); return p ? p.y : null; },
      r: o.r || 18, priority: o.priority == null ? 7 : o.priority, label,
      use: () => { st.used = true; },
    };
    if (o.level) spec.level = o.level;
    N.interact.add(id, spec);
    S.acts.set(id, st);
    const h = o.h != null ? o.h : roofH(P0);
    let mk = null, rg = null, bl = null;
    if (o.marker !== false) { if (h > 0) { rg = { target, r: o.mr || 14, h, color: o.color || '#ff5fb0' }; S.rings.add(rg); } else mk = m.marker(target, { r: o.mr || 16, color: o.color }); }
    if (o.blip !== false) bl = m.blip(target, { color: o.color || '#ff5fb0', icon: 'star', pulse: true, route: o.route !== false });
    if (o.objective) m.objective(o.objective);
    const stp = S.step = { kind: 'act', skip: () => { st.used = true; } };
    return m.until(() => st.used).then(() => {
      N.interact.remove(id); S.acts.delete(id);
      if (S.step === stp) S.step = null;
      if (mk) m.unmarker(mk); if (rg) S.rings.delete(rg); if (bl) m.unblip(bl);
      return true;
    });
  }
  /** ACTION anywhere (an offer every step). */
  function press(m, label, o) {
    o = o || {};
    if (ff()) return Promise.resolve(true);
    const off = { label, priority: o.priority || 8, dist: 0, used: false };
    off.use = () => { off.used = true; };
    S.offers.add(off);
    const stp = S.step = { kind: 'press', skip: () => { off.used = true; } };
    return m.until(() => off.used).then(() => { S.offers.delete(off); if (S.step === stp) S.step = null; return true; });
  }
  /** A goto that also accepts roof targets (ring drawn at roof height). */
  function go(m, target, o) {
    o = o || {};
    target = pick(target);
    const P0 = pos(target);
    if (!P0) { N.err('story.go', new Error('unknown target ' + JSON.stringify(target))); return Promise.resolve(null); }
    const h = o.h != null ? o.h : roofH(P0);
    if (h > 0 && !ff()) {
      const rg = { target, r: o.r || 16, h, color: o.color || '#ff5fb0' };
      S.rings.add(rg);
      return m.goto(target, Object.assign({}, o, { marker: false })).then((v) => { S.rings.delete(rg); return v; });
    }
    return m.goto(target, o);
  }
  /** Riddle step: the objective is the riddle; the marker appears only near the answer or after a hint. */
  function findPlace(m, id, o) {
    o = o || {};
    if (o.label) m.objective(o.label);
    if (ff()) return Promise.resolve(true);
    const P = pos(id);
    if (!P) return Promise.resolve(false);
    let mk = null, bl = null;
    const hinted = () => {
      try { const A = N.hints && N.hints.active; return !!(A && A.taken && A.taken.some((t) => t.source === 'aunty' || t.source === 'auto' || t.source === 'city')); } catch (e) { return false; }
    };
    const stp = S.step = { kind: 'find', target: P, skip: () => { N.player.teleport(P.x, P.y); } };
    return m.until(() => {
      const p = N.player, d = dist(p, P);
      if (!mk && (d < (o.near || 380) || hinted())) { mk = m.marker(id, { r: o.r || 30 }); bl = m.blip(id, { color: '#ff5fb0', icon: 'star', pulse: true, route: false }); }
      return d <= (o.r || 30);
    }).then(() => { if (mk) m.unmarker(mk); if (bl) m.unblip(bl); if (S.step === stp) S.step = null; return true; });
  }

  /* ================================================================ kit: soft timers, rings */
  function softTimer(secs, label, o) {
    o = o || {};
    const T = { left: secs, label: label || 'TIME', on: true, expired: false, onExpire: o.onExpire || null };
    T.stop = () => { if (T.on) { T.on = false; S.timers.delete(T); try { N.hud.timer(null); } catch (e) { /* ignore */ } } return T.left; };
    if (ff()) { T.on = false; return T; }
    S.timers.add(T);
    try { N.hud.timer(T.label, T.left, { countdown: false }); } catch (e) { /* ignore */ }
    return T;
  }
  function timersTick(dt) {
    if (mode() !== 'play') return;
    for (const T of Array.from(S.timers)) {
      if (!T.on) { S.timers.delete(T); continue; }
      T.left -= dt;
      if (T.left > 0) { try { N.hud.timer(T.label, T.left, { countdown: false }); } catch (e) { /* ignore */ } }
      else if (!T.expired) {
        T.expired = true; T.left = 0;
        T.stop();
        if (T.onExpire) { try { T.onExpire(); } catch (e) { N.err('story.timer', e); } }
      }
    }
  }
  /** Soft-timed run through ring points (lootna). Resolves true when finished on time. Never fails. */
  async function rings(m, pts, o) {
    o = o || {};
    if (ff()) return true;
    const T = softTimer(o.secs || 25, o.timerLabel || 'LOOTNA', { onExpire: o.onExpire });
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (o.onRing) o.onRing(i);
      await go(m, p, { r: o.r || 20, label: o.label, route: false, h: p.h });
    }
    const onTime = !T.expired;
    T.stop();
    return onTime;
  }

  /* ================================================================ kit: passenger rides (A3: autos and buses are never driven by Chinnu) */
  function laneSpotNear(x, y) {
    const W = N.world;
    let rp = null;
    try { rp = W.nearestRoadPoint(x, y); } catch (e) { rp = null; }
    if (!rp) return { x, y, angle: 0 };
    const a = rp.angle || 0, w = (rp.road && rp.road.w) || 32;
    const lx = Math.sin(a), ly = -Math.cos(a);
    let sx = rp.x + lx * (w / 4), sy = rp.y + ly * (w / 4);
    try { if (!W.isDrivable(sx, sy) || W.collide(sx, sy, 7, 'drive').hit) { sx = rp.x; sy = rp.y; } } catch (e) { /* ignore */ }
    return { x: sx, y: sy, angle: a };
  }
  function endRide(abort) {
    const R = S.ride;
    if (!R) return;
    S.ride = null;
    const p = N.player;
    if (p) { p.hidden = false; p.mode = 'foot'; p.controlsLocked = !!R.locked; p.noCollide = false; }
    if (R.v && R.v.alive) {
      try { if (N.vehicles.stopDriving) N.vehicles.stopDriving(R.v); } catch (e) { /* ignore */ }
      if (abort) { try { N.vehicles.remove(R.v); } catch (e) { /* ignore */ } }
    }
  }
  function ffwd(m, minutes, label, mid) {
    if (ff()) { if (mid) mid(); return Promise.resolve(true); }
    const SH = N.shops;
    if (SH && typeof SH.ffwd === 'function') {
      let done = false;
      try { SH.ffwd(minutes || 10, { label, mid }).then(() => { done = true; }, () => { done = true; }); } catch (e) { done = true; if (mid) mid(); }
      return m.until(() => done);
    }
    // fallback: a short VHS ▶▶ + teleport
    const fx = N.render && N.render.fx;
    let t = 0, applied = false;
    return m.until(() => {
      t += 1 / 60;
      if (fx) fx.vhs = Math.sin(Math.min(1, t / 1.2) * Math.PI) * 0.8;
      if (!applied && t > 0.6) { applied = true; if (mid) mid(); if (N.clock && minutes) N.clock.set(Math.floor((N.clock.minutes + minutes) / 60) % 24, (N.clock.minutes + minutes) % 60); }
      if (t >= 1.2) { if (fx) fx.vhs = 0; return true; }
      return false;
    });
  }
  /**
   * Passenger ride: o = {type, driver (npc id for the look) | look, to, lines, secs (real drive), minutes,
   * label (▶▶ OSD), arrive (r), party}. The player rides hidden in the vehicle (camera follows it);
   * after `secs` (or E) the VHS ▶▶ drops him at the destination and the vehicle pulls away.
   */
  async function ride(m, o) {
    o = o || {};
    const dest = pos(o.to);
    const p = N.player;
    if (!dest) return false;
    const arrivePt = () => {
      const a = walkable(dest.x + (o.dx || 0), dest.y + (o.dy || 0), 60);
      return a;
    };
    if (o.party) o.party.hide();
    if (ff() || (Story.debug && Story.debug.fastRides)) {
      const a = arrivePt();
      if (!ff()) await ffwd(m, o.minutes || 15, o.label, () => p.teleport(a.x, a.y));
      else p.teleport(a.x, a.y);
      if (o.party) o.party.show();
      return true;
    }
    if (p.vehicle) { try { N.vehicles.exit(p, true); } catch (e) { /* ignore */ } }
    const st = laneSpotNear(p.x, p.y);
    const look = o.look || (o.driver ? lookOf(o.driver) : null) || randomLook('driver' + o.type, 'man');
    let v = null;
    try { v = N.vehicles.spawn(o.type || 'auto', st.x, st.y, st.angle, { driver: { look, npc: true }, owned: true, label: o.vlabel || null }); } catch (e) { N.err('story.ride.spawn', e); }
    if (!v) { const a = arrivePt(); await ffwd(m, o.minutes || 15, o.label, () => p.teleport(a.x, a.y)); if (o.party) o.party.show(); return true; }
    m.spawn(v);
    v.noEnter = true; v.locked = true;
    if (o.route) v.route = o.route;
    S.ride = { v, t: 0, locked: !!p.controlsLocked, skip: false, arrived: false };
    p.hidden = true; p.controlsLocked = true; p.mode = 'busy'; p.vx = p.vy = 0; p.noCollide = true;
    p.x = v.x; p.y = v.y;
    sfx(o.type === 'bus' ? 'bus_horn' : 'auto_horn', { ui: true, vol: 0.6 });
    try {
      N.vehicles.driveTo(v, dest, { speed: o.speed || 80, timeout: (o.secs || 9) + 40, warp: false, r: 24 }).then((ok) => { if (S.ride && S.ride.v === v) S.ride.arrived = !!ok; });
    } catch (e) { N.err('story.ride.drive', e); }
    if (!o.lines || !o.lines.length) toast('Hold on tight! (E: ▶▶ skip the ride)', 2600, 'ride');
    S.step = { kind: 'ride', skip: () => { if (S.ride) S.ride.skip = true; } };
    if (o.lines && o.lines.length) await m.talk(o.lines);
    if (o.during) { try { o.during(); } catch (e) { N.err('story.ride.during', e); } }
    await m.until(() => !S.ride || S.ride.t >= (o.secs || 9) || S.ride.arrived || S.ride.skip);
    const a = arrivePt();
    await ffwd(m, o.minutes || 15, o.label, () => {
      const R = S.ride;
      endRide(false);
      p.teleport(a.x, a.y);
      if (R && R.v && R.v.alive) {
        const s2 = laneSpotNear(a.x, a.y);
        R.v.x = s2.x; R.v.y = s2.y; R.v.angle = s2.angle; R.v.vx = R.v.vy = 0; R.v.speed = 0; R.v.okX = null;
        // pull away and disappear
        const far = { x: s2.x + Math.cos(s2.angle) * 420, y: s2.y + Math.sin(s2.angle) * 420 };
        try { N.vehicles.driveTo(R.v, far, { speed: 70, timeout: 12, warp: false }).then(() => { try { if (R.v.alive) N.vehicles.remove(R.v); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ }
      }
    });
    if (o.party) o.party.show();
    return true;
  }

  /* ================================================================ kit: queue cage (W5, systems §8.12) */
  /** The queue's standing spots: it leaves the counter C in direction (dx, dy), then bends along the
   *  footpath / forecourt round buildings, so a long line never runs across a carriageway when there is a
   *  way round (map v2 has narrow forecourts). Falls back to a straight line on a stub world. */
  function queueSlots(C, dx, dy, n) {
    const out = [];
    const W = N.world, SU = N.SURF;
    const straight = (i) => { const wob = (i % 2 ? 1.8 : -1.8); return walkable(C.x + dx * (10 + i * 8.5) - dy * wob, C.y + dy * (10 + i * 8.5) + dx * wob, 14); };
    if (!W || typeof W.isWalkable !== 'function' || typeof W.surfaceAt !== 'function' || !SU) { for (let i = 0; i < n; i++) out.push(straight(i)); return out; }
    const surf = (x, y) => { const sf = W.surfaceAt(x, y); return sf === SU.ROAD || sf === SU.BRIDGE ? -5 : sf === SU.FOOTPATH || sf === SU.PLAZA ? 3 : 2; };
    const TURNS = [0, 0.39, -0.39, 0.79, -0.79, 1.18, -1.18, 1.57, -1.57];
    let cx = C.x, cy = C.y, a0 = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const step = i === 0 ? 10 : 8.5;
      let best = null, bs = -1e9;
      for (const da of TURNS) {
        const a = a0 + da, x = cx + Math.cos(a) * step, y = cy + Math.sin(a) * step;
        if (!W.isWalkable(x, y) || Math.hypot(x - C.x, y - C.y) < 9) continue;
        let clash = false;
        for (let j = 0; j < out.length - 1 && !clash; j++) if (Math.hypot(out[j].x - x, out[j].y - y) < 7.5) clash = true;
        if (clash) continue;
        let sc = surf(x, y) - Math.abs(da) * 1.4;
        const x2 = x + Math.cos(a) * step, y2 = y + Math.sin(a) * step;
        if (!W.isWalkable(x2, y2)) sc -= 2.5; else sc += surf(x2, y2) * 0.4;
        if (sc > bs) { bs = sc; best = { x, y, a }; }
      }
      if (!best) { const f = straight(i); out.push(f); cx = f.x; cy = f.y; continue; }
      const wob = (i % 2 ? 1.6 : -1.6), nxx = -Math.sin(best.a), nyy = Math.cos(best.a);
      out.push(W.isWalkable(best.x + nxx * wob, best.y + nyy * wob) ? { x: best.x + nxx * wob, y: best.y + nyy * wob } : { x: best.x, y: best.y });
      cx = best.x; cy = best.y; a0 = best.a;
    }
    return out;
  }
  function queue(m, o) {
    o = o || {};
    const q = { done: false, failed: false, steps: 0, ahead: 0, cut: 0, sent: 0, line: [], gap: false, gapT: 0, tell: null, slots: [], ps: 0, t: 0, nextServe: 0, nextCut: 0, behind: [] };
    if (ff()) { q.done = true; return q; }
    const C = pos(o.at);
    const p = N.player;
    if (!C) { q.done = true; return q; }
    let dx = p.x - C.x, dy = p.y - C.y;
    let dl = Math.hypot(dx, dy);
    if (dl < 8) { dx = 0; dy = 1; dl = 1; }
    dx /= dl; dy /= dl;
    // the line forms on the forecourt / footpath, not in the carriageway: score 16 directions
    try {
      const SU = N.SURF, W = N.world;
      const want = (o.ahead || 8) + (o.behind == null ? 3 : o.behind) + 3;
      let best = -1e9, bd = null;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU, ux = Math.cos(a), uy = Math.sin(a);
        let sc = (ux * dx + uy * dy) * 3;
        for (let i = 0; i < want; i++) {
          const x = C.x + ux * (10 + i * 8.5), y = C.y + uy * (10 + i * 8.5);
          if (!W.isWalkable(x, y)) { sc -= (want - i) * 2; break; }
          const sf = W.surfaceAt(x, y);
          sc += sf === SU.ROAD || sf === SU.BRIDGE ? -1 : sf === SU.FOOTPATH || sf === SU.PLAZA ? 3 : 2;
        }
        if (sc > best) { best = sc; bd = { ux, uy }; }
      }
      if (bd) { dx = bd.ux; dy = bd.uy; }
    } catch (e) { /* keep the player-facing direction */ }
    const nx = -dy, ny = dx;
    q.dir = { dx, dy, nx, ny };
    const n = (o.ahead || 8) + 1 + (o.behind == null ? 3 : o.behind) + (o.cutters || 0) + 2;
    q.slots = queueSlots(C, dx, dy, n);
    const ahead = o.ahead || 8;
    for (let i = 0; i < ahead; i++) {
      const s = q.slots[i];
      const e = extra(s.x, s.y, randomLook('q' + (o.seed || '') + i), { role: 'queue' });
      e.faceTo = C; e.slot = i;
      q.line.push(e);
    }
    q.ps = ahead;
    q.behind = [];
    for (let i = 0; i < (o.behind == null ? 3 : o.behind); i++) {
      const s = q.slots[ahead + 1 + i];
      const e = extra(s.x, s.y, randomLook('qb' + (o.seed || '') + i), { role: 'queue' });
      e.faceTo = C; e.slot = ahead + 1 + i;
      q.behind.push(e);
    }
    q.ahead = ahead;
    q.cuttersLeft = o.cutters || 0;
    q.respect = !!o.respect;
    q.friend = o.friend || null;
    q.serve = o.serve || [2.5, 4];
    q.nextServe = U.randRange(q.serve[0], q.serve[1]) + 1;
    q.nextCut = q.cuttersLeft ? U.randRange(4, 7) : Infinity;
    q.C = C;
    q.label = o.label || 'Queue';
    S.queue = q;
    S.pin = { x: q.slots[q.ps].x, y: q.slots[q.ps].y };
    p.noRun = true;
    // standing in a line: nobody chases a boy in a queue (meter frozen until he is served)
    try { m.meter('frozen'); } catch (e) { /* ignore */ }
    q.unfreeze = () => { try { if (run() && !q.keepFrozen) m.meter('normal'); } catch (e) { /* ignore */ } };
    q.keepFrozen = !!o.keepFrozen;
    S.step = { kind: 'queue', skip: () => { q.done = true; } };
    sfx('kids', { ui: true, vol: 0.4 });
    return q;
  }
  // the first free slot in front of the player (everyone ahead stands contiguously from slot 0)
  function qFront(q) { let f = 0; for (const e of q.line) f = Math.max(f, e.slot + 1); return f; }
  function queueTick(dt) {
    const q = S.queue;
    if (!q || q.done || q.failed || mode() !== 'play') return;
    const p = N.player;
    q.t += dt;
    const slotAt = (i) => q.slots[Math.max(0, Math.min(q.slots.length - 1, i))];
    // serve the front of the line every 2.5-4 s
    q.nextServe -= dt;
    if (q.nextServe <= 0) {
      q.nextServe = U.randRange(q.serve[0], q.serve[1]);
      if (q.ps === 0) {
        q.done = true; widget(null); S.pin = null; p.noRun = false; sfx('coin', { ui: true });
        if (S.step && S.step.kind === 'queue') S.step = null;
        if (q.unfreeze) q.unfreeze();
        return;
      }
      if (q.line.length && q.line[0].slot === 0) {
        const f = q.line.shift();
        const side = { x: f.x + q.dir.nx * 30 - q.dir.dx * 6, y: f.y + q.dir.ny * 30 - q.dir.dy * 6 };
        f.faceTo = null; f.moveTo(side.x, side.y, 38); f.life = 2.2;
        for (const e of q.line) { e.slot -= 1; const s = slotAt(e.slot); e.moveTo(s.x, s.y, 30); }
      }
      if (q.ps > qFront(q) && !q.gap) { q.gap = true; q.gapT = 1.5; sfx('objective', { ui: true, vol: 0.4 }); }
    }
    // the gap in front of the player: step forward (↑ / ACTION) within 1.5 s or a cutter takes it
    if (q.gap) {
      if (N.input.pressed('up')) { N.input.consume('up'); stepForward(q); }
      else if (!q.respect && q.gapT > 0) {
        q.gapT -= dt;
        if (q.gapT <= 0 && q.cuttersLeft > 0 && !q.tell) cutIn(q, true);
      }
    }
    // line-cutters lean in from the rail with a 1.2 s tell (ACTION: "Line mein!")
    if (!q.respect && q.cuttersLeft > 0 && !q.tell) {
      q.nextCut -= dt;
      if (q.nextCut <= 0 && q.ps > 0) {
        const s = slotAt(q.ps - 1);
        const e = extra(s.x + q.dir.nx * 16, s.y + q.dir.ny * 16, randomLook('cut' + q.cuttersLeft + q.t.toFixed(0), q.cuttersLeft % 2 ? 'uncle' : 'man'), { role: 'cutter' });
        e.faceTo = s; e.mark = '!';
        q.tell = { e, t: 1.2 };
        sfx('whistle', { ui: true, vol: 0.25 });
      }
    }
    if (q.tell) {
      q.tell.t -= dt;
      if (q.tell.t <= 0) { const e = q.tell.e; q.tell = null; e.mark = null; cutIn(q, false, e); }
    }
    // the ACTION label: "Line mein!" / Step forward
    if (q.tell) N.interact.offer({ label: '"Line mein!"', priority: 9, dist: 0, use: () => lineMein(q) });
    else if (q.gap) N.interact.offer({ label: 'Step forward', priority: 9, dist: 0, use: () => stepForward(q) });
    else N.interact.offer({ label: q.ps === 0 ? 'Next! Wait for the counter...' : 'Wait in line...', priority: 9, dist: 0, use: () => {} });
    widget({ label: q.label, value: null, text: (q.ps === 0 ? 'NEXT!' : q.ps + ' AHEAD') + (q.respect ? '' : ' · CUTTERS ' + q.cuttersLeft) + (q.gap ? ' · STEP ↑' : q.tell ? ' · LINE MEIN!' : '') });
  }
  function stepForward(q) {
    if (!q.gap) return;
    q.gap = false; q.gapT = 0;
    q.ps = Math.max(0, qFront(q));
    q.steps++;
    const s = q.slots[q.ps];
    S.pin = { x: s.x, y: s.y };
    q.behind.forEach((e, i) => { e.slot = q.ps + 1 + i; const s2 = q.slots[Math.min(q.slots.length - 1, e.slot)]; e.moveTo(s2.x, s2.y, 30); });
    sfx('step', { ui: true, vol: 0.5 });
  }
  function lineMein(q) {
    const t = q.tell; if (!t) return;
    q.tell = null;
    const e = t.e; e.mark = null;
    bark('player', '"*Line mein!*"', 1.6);
    e.faceTo = null; e.moveTo(e.x + q.dir.nx * 40 + q.dir.dx * 40, e.y + q.dir.ny * 40 + q.dir.dy * 40, 50); e.life = 1.8;
    q.cuttersLeft = Math.max(0, q.cuttersLeft - 1);
    q.sent = (q.sent || 0) + 1;
    q.nextCut = U.randRange(4, 8);
    sfx('ui_select', { ui: true });
  }
  // a cutter slips in ahead of the player: into the open gap, or in front of him (he loses a place)
  function cutIn(q, intoGap, e) {
    q.cuttersLeft = Math.max(0, q.cuttersLeft - 1);
    q.nextCut = U.randRange(4, 8);
    q.cut++;
    if (!e) { const s = q.slots[Math.max(0, q.ps - 1)]; e = extra(s.x + q.dir.nx * 16, s.y + q.dir.ny * 16, randomLook('cutg' + q.cut, 'man'), { role: 'cutter' }); }
    e.mark = null; e.faceTo = q.C;
    if (intoGap) {
      e.slot = qFront(q);
      const s = q.slots[e.slot]; e.moveTo(s.x, s.y, 50);
      q.line.push(e);
      if (q.ps <= qFront(q)) { q.gap = false; q.gapT = 0; }
      else q.gapT = 1.5;
    } else {
      // he squeezes in right in front of the player: everyone from the player back moves one slot
      e.slot = q.ps;
      const s = q.slots[e.slot]; e.moveTo(s.x, s.y, 50);
      q.line.push(e);
      q.ps = Math.min(q.slots.length - 2, q.ps + 1);
      const s2 = q.slots[q.ps]; S.pin = { x: s2.x, y: s2.y };
      q.behind.forEach((b, i) => { b.slot = Math.min(q.slots.length - 1, q.ps + 1 + i); const s3 = q.slots[b.slot]; b.moveTo(s3.x, s3.y, 30); });
    }
    q.line.sort((a, b) => a.slot - b.slot);
    toast('A line-cutter slipped in ahead of you! "Just asking the rate..."', 2200, 'queue');
    sfx('bump', { ui: true, vol: 0.4 });
  }

  /* ================================================================ kit: cargo carry (W3, systems §8.10) */
  function cargo(m, o) {
    o = o || {};
    const c = { v: 100, item: o.item || 'cargo', label: o.label || 'CARGO', light: !!o.light, vehicle: o.vehicle || null, failLine: o.failLine || 'The cargo is ruined.', on: true, lastSurf: null, kerbT: 0, driftWas: false, failed: false };
    c.stop = () => { c.on = false; if (S.cargo === c) S.cargo = null; widget(null); };
    if (ff()) { c.on = false; return c; }
    S.cargo = c;
    const hit = (n) => {
      if (!c.on) return;
      let mul = c.light ? 0.5 : 1;
      try { if (N.settings && N.settings.diff) mul *= N.settings.diff('cargoDamage') || 1; } catch (e) { /* ignore */ }
      const v = c.vehicle && c.vehicle.alive ? c.vehicle : N.player.vehicle;
      if (v && v.type === 'chinnu_cycle') mul *= 0.75;
      if (v && v.T && v.T.basket) mul *= 0.7;
      c.v = Math.max(0, c.v - n * mul);
      sfx('bump', { ui: true, vol: 0.35 });
      if (c.v < 40 && !c.failed) { c.failed = true; setTimeout(() => { if (S.cargo === c && N.missions.active) N.missions.fail(plain(c.failLine)); }, 0); }
    };
    c.hit = hit;
    const onBump = (d) => {
      if (!c.on || !d) return;
      const pv = N.player.vehicle;
      const mine = (pv && (d.a === pv || d.b === pv || d.vehicle === pv)) || (!pv && (d.a === N.player || d.b === N.player));
      if (!mine) return;
      const sp = d.speed || 0;
      if (sp > 60) hit(15); else if (sp > 40) hit(8);
    };
    const onHole = (d) => { if (c.on && d && d.vehicle === N.player.vehicle && (d.speed || 0) > 40) hit(8); };
    const onFall = () => { if (c.on) hit(15); };
    N.on('bump', onBump); N.on('vehicle:pothole', onHole); N.on('player:fall', onFall);
    onEnd(() => { N.off('bump', onBump); N.off('vehicle:pothole', onHole); N.off('player:fall', onFall); c.on = false; });
    S.step = { kind: 'cargo', skip: () => { c.skip = true; } };
    return c;
  }
  function cargoTick(dt) {
    const c = S.cargo;
    if (!c || !c.on) return;
    const v = N.player.vehicle;
    if (mode() === 'play' && v) {
      const sp = Math.abs(v.speed || 0);
      let surf = null;
      try { surf = N.world.surfaceAt(v.x, v.y); } catch (e) { surf = null; }
      const SU = N.SURF;
      c.kerbT = Math.max(0, c.kerbT - dt);
      if (c.lastSurf != null && surf !== c.lastSurf && sp > 40 && c.kerbT <= 0) {
        const kerb = (c.lastSurf === SU.ROAD && (surf === SU.FOOTPATH || surf === SU.GROUND || surf === SU.GRASS)) || (surf === SU.ROAD && (c.lastSurf === SU.FOOTPATH || c.lastSurf === SU.GROUND));
        if (kerb) { c.kerbT = 0.6; c.hit(8); }
      }
      c.lastSurf = surf;
      const drifting = !!(v.ctl && v.ctl.handbrake) && sp > 90;
      if (drifting && !c.driftWas) c.hit(3);
      c.driftWas = drifting;
    }
    widget({ label: c.label, value: c.v, text: Math.round(c.v) + '', low: c.v < 55 });
  }

  /* ================================================================ kit: darkness (power cut, night watch torch) */
  let darkCanvas = null, darkCtx = null;
  function darkness(on, o) {
    if (!on) { S.dark = null; return; }
    o = o || {};
    S.dark = { alpha: o.alpha == null ? 0.86 : o.alpha, torch: !!o.torch, cone: !!o.cone, candles: o.candles || [], r: o.r || 30, t: 0, zone: o.zone || null };
  }
  function candle(x, y) { if (S.dark) S.dark.candles.push({ x, y, ph: Math.random() * TAU }); }
  function drawDark(ctx) {
    const D0 = S.dark; if (!D0) return;
    const R = N.render, W = R.W, H = R.H, DIV = 3;
    const w = Math.ceil(W / DIV), h = Math.ceil(H / DIV);
    if (!darkCanvas || darkCanvas.width !== w || darkCanvas.height !== h) { darkCanvas = document.createElement('canvas'); darkCanvas.width = w; darkCanvas.height = h; darkCtx = darkCanvas.getContext('2d'); }
    const c = darkCtx;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(4, 6, 20, ' + D0.alpha.toFixed(3) + ')';
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    const k0 = R.k(0);
    const hole = (x, y, r, a) => {
      const X = R.sx(x, k0) / DIV, Y = R.sy(y, k0) / DIV, rr = r * k0 / DIV;
      const g = c.createRadialGradient(X, Y, 0, X, Y, rr);
      g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.7) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(X, Y, rr, 0, TAU); c.fill();
    };
    const p = N.player;
    hole(p.x, p.y, D0.torch || D0.cone ? 22 : D0.r, 0.9);
    if (D0.cone) {
      const a = p.facing != null && isFinite(p.facing) ? p.facing : p.angle || 0;
      const X = R.sx(p.x, k0) / DIV, Y = R.sy(p.y, k0) / DIV, rr = 110 * k0 / DIV, half = (35 * Math.PI) / 180;
      const g = c.createRadialGradient(X, Y, 0, X, Y, rr);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(X, Y); c.arc(X, Y, rr, a - half, a + half); c.closePath(); c.fill();
    } else if (D0.torch) hole(p.x + Math.cos(p.angle || 0) * 30, p.y + Math.sin(p.angle || 0) * 30, 40, 0.85);
    for (const cd of D0.candles) hole(cd.x, cd.y, 24 + Math.sin(D0.t * 9 + cd.ph) * 2, 0.95);
    c.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(darkCanvas, 0, 0, w * DIV, h * DIV);
    ctx.globalCompositeOperation = 'lighter';
    for (const cd of D0.candles) {
      const X = R.sx(cd.x, k0), Y = R.sy(cd.y, k0), rr = (14 + Math.sin(D0.t * 11 + cd.ph) * 1.5) * k0;
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, rr);
      g.addColorStop(0, 'rgba(255,190,90,0.55)'); g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, rr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* ================================================================ world-space drawing: rings, labels, the lootna kite */
  function drawRing(ctx, x, y, h, r, color, t) {
    const R = N.render, k = R.k(h), X = R.sx(x, k), Y = R.sy(y, k), Z = R.Z || 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    const [cr, cg, cb] = U.hexToRgb(color);
    const rgba = (a) => 'rgba(' + cr + ',' + cg + ',' + cb + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * k * 1.3);
    g.addColorStop(0, rgba(0.45)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * k * 1.3, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2 * Z); ctx.strokeStyle = rgba(1);
    ctx.beginPath(); ctx.arc(X, Y, r * k * (0.9 + 0.06 * pulse), 0, TAU); ctx.stroke();
    const top = Y - (30 * Z + Math.sin(t * 2.6) * 3 * Z), s = Math.max(4, 5 * Z);
    ctx.fillStyle = '#120d16'; ctx.beginPath(); ctx.moveTo(X, top - s * 1.5); ctx.lineTo(X + s, top); ctx.lineTo(X, top + s * 1.5); ctx.lineTo(X - s, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(X, top - s); ctx.lineTo(X + s * 0.65, top); ctx.lineTo(X, top + s); ctx.lineTo(X - s * 0.65, top); ctx.closePath(); ctx.fill();
  }
  function drawKite(ctx, x, y, h, t) {
    const R = N.render, k = R.k(h), X = R.sx(x, k), Y = R.sy(y, k), s = 6 * (R.Z || 1);
    const k0 = R.k(0), SX = R.sx(x, k0), SY = R.sy(y, k0);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(SX, SY, s * 0.9, s * 0.5, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(X, Y); ctx.rotate(Math.sin(t * 3) * 0.3);
    ctx.fillStyle = '#d8402a'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#f4ead8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, s); ctx.quadraticCurveTo(s * Math.sin(t * 4), s * 2, 0, s * 3); ctx.stroke();
    ctx.restore();
  }
  function storyDraw() {
    const R = N.render;
    if (!R || mode() === 'title' || mode() === 'boot') return;
    if (N.view3d && N.view3d.active) return;
    const t = N.time.real || 0;
    for (const rg of S.rings) {
      const p = pos(rg.target); if (!p) continue;
      if (!R.inView(p.x, p.y, 60)) continue;
      R.queue('sky', 1, (ctx) => drawRing(ctx, p.x, p.y, rg.h || 0, rg.r || 14, rg.color || '#ff5fb0', t));
    }
    for (const L of S.labels) {
      const p = pos(L.target); if (!p || !R.inView(p.x, p.y, 80)) continue;
      R.queue('sky', 3, () => { try { N.draw.pixelText(p.x + (L.dx || 0), p.y + (L.dy || 0), L.h || 30, L.text, L.color || '#f2c230', { scale: L.scale || 2, shadow: '#1a1214' }); } catch (e) { /* ignore */ } });
    }
    if (S.kite) { const K = S.kite; R.queue('sky', 4, (ctx) => drawKite(ctx, K.x, K.y, K.h || 40, t)); }
    if (S.dark) R.queue('fx', 0, (ctx) => drawDark(ctx));
  }

  /* ================================================================ kit: minigames, the LB match */
  function game(m, id, params) {
    const p = Object.assign({}, params || {});
    const d = Story.debug;
    if (d && d.mg) { p.autoplay = d.mg; p.skipHowto = true; p.timeScale = d.mgTimeScale || 6; }
    return m.minigame(id, p);
  }
  function hasGame(id) { const MG = N.minigames; try { return !!(MG && (typeof MG.has === 'function' ? MG.has(id) : MG.defs && MG.defs[id])); } catch (e) { return false; } }
  /** The home side for the match engine: "Chinnu XI" with the player's nickname (bible's global {nick} rule:
   *  the team and the hero's name on the scorecard follow the name card). */
  function homeTeam(spec) {
    if (spec && spec !== 'chinnu_xi') return spec;
    const nick = (N.player && N.player.nick) || 'Chinnu';
    // the score bug's short name: a short nickname whole ("PINTU XI", "RAJU XI"), a long one cut like the
    // engine's own "CHIN XI" (never "PINT XI")
    const letters = nick.toUpperCase().replace(/[^A-Z]/g, '');
    const name = nick + ' XI', short = ((letters.length <= 5 ? letters : letters.slice(0, 4)) || 'HOME') + ' XI';
    const T = N.cricketMatch && N.cricketMatch.TEAMS && N.cricketMatch.TEAMS.chinnu_xi;
    if (!T || !Array.isArray(T.players)) return nick === 'Chinnu' ? 'chinnu_xi' : { id: 'chinnu_xi', name, short };
    // a summer-camp side of colony kids: Bunty-anna is 19 (bible §2.2, the Committee President with an RX100),
    // so his place goes to Pappu from the colony; he watches from the stands
    const players = T.players.map((q) => {
      if (!q) return q;
      if (q.hero) return Object.assign({}, q, { name: nick });
      if (q.name === 'Bunty') return Object.assign({}, q, { name: 'Pappu', look: Object.assign({}, q.look || {}, { shades: false, puff: false }) });
      return q;
    });
    return { id: 'chinnu_xi', name, short, players };
  }
  /** The LB Stadium match (cricket_match.js 'match'); the gully `cricket` minigame stands in when it is missing. */
  async function playMatch(m, params) {
    params = Object.assign({ home: 'chinnu_xi', away: 'ashok_nagar', overs: 3, venue: 'lb_stadium', place: 'lb_stadium', time: 'evening' }, params || {});
    params.home = homeTeam(params.home);
    F().lb_match = true;
    if (hasGame('match')) {
      const r = await game(m, 'match', params);
      if (r && !r.missing && !r.error) {
        // (N.cricketMatch.start sets these itself; the story plays it through m.minigame so a failed / quit run aborts it)
        if (!r.quit && !r.aborted && !r.skipped) { F().lb_match_played = true; if (r.win) F().lb_match_won = true; }
        return r;
      }
    }
    // fallback: the gully cricket batting game, scored as the final
    const r2 = await game(m, 'cricket', { target: 24, overs: 3, wickets: 2, bowler: undefined, place: 'lb_stadium', intro: params.intro || ((N.player && N.player.nick) || 'Chinnu') + ' XI need 24 in the summer camp final.', title: params.title || 'Summer Camp Final' });
    if (N.flags) N.flags.lb_match_played = true;
    return Object.assign({ fallback: true }, r2 || {});
  }

  /* ================================================================ chapter cards (bible §4.0) */
  const CHAPTERS = {
    1: { title: 'PATANG', ur: 'پتنگ', sub: 'Chapter 1 · Kites · January to February 2003' },
    2: { title: 'GARMI', ur: 'گرمی', sub: 'Chapter 2 · Summer · March to June 2003' },
  };
  function chapterCard(n) { const c = CHAPTERS[n]; return c ? [{ type: 'card', kind: 'chapter', title: c.title, ur: c.ur, sub: c.sub, ms: 2800 }] : []; }

  /* ================================================================ the 2026 prologue art (text cards over a dim VHS image) */
  function prologueArt() {
    ensureCss();
    const host = document.querySelector('#overlay .mn-cs');
    if (!host) return { scene() {}, remove() {} };
    let c = host.querySelector('canvas.st-art');
    if (!c) {
      c = document.createElement('canvas');
      c.className = 'st-art';
      const dim = host.querySelector('.cs-dim');
      host.insertBefore(c, dim ? dim.nextSibling : host.firstChild);
    }
    const W = 320, H = 180;
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x | 0, y | 0, w | 0, h | 0); };
    const scenes = {
      office() {
        // a dark office at dusk: the window, a desk lamp, the parcel
        const sky = g.createLinearGradient(0, 18, 0, 120);
        sky.addColorStop(0, '#2a2a6a'); sky.addColorStop(0.55, '#c05a80'); sky.addColorStop(1, '#ffb050');
        rect(0, 0, W, H, '#0b0912');
        g.fillStyle = sky; g.fillRect(150, 18, 150, 100);
        // the curved glass building he watched being new (a silhouette with a few lit floors)
        g.fillStyle = '#231a36'; g.beginPath(); g.ellipse(230, 118, 34, 70, 0, Math.PI, 0); g.fill();
        for (let i = 0; i < 9; i++) rect(208 + (i % 3) * 14, 64 + i * 5, 8, 1, i % 2 ? '#ffd27a' : '#3a2e52');
        // a last kite
        g.fillStyle = '#d8402a'; g.beginPath(); g.moveTo(182, 34); g.lineTo(187, 39); g.lineTo(182, 44); g.lineTo(177, 39); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(244,234,216,0.6)'; g.beginPath(); g.moveTo(182, 44); g.quadraticCurveTo(178, 52, 184, 58); g.stroke();
        rect(146, 14, 158, 4, '#1a1622'); rect(146, 116, 158, 4, '#1a1622'); rect(146, 14, 4, 106, '#1a1622'); rect(300, 14, 4, 106, '#1a1622'); rect(224, 14, 3, 106, '#1a1622');
        // desk + lamp glow
        rect(0, 128, W, 52, '#1a1220'); rect(0, 126, W, 3, '#2c2032');
        const lamp = g.createRadialGradient(64, 120, 2, 64, 120, 80);
        lamp.addColorStop(0, 'rgba(255,214,140,0.55)'); lamp.addColorStop(1, 'rgba(255,214,140,0)');
        g.fillStyle = lamp; g.fillRect(0, 40, 170, 140);
        rect(52, 122, 26, 5, '#3a3a40'); rect(62, 78, 3, 46, '#4a4a52'); g.fillStyle = '#5a5a62'; g.beginPath(); g.moveTo(50, 82); g.lineTo(78, 82); g.lineTo(70, 70); g.lineTo(58, 70); g.closePath(); g.fill();
        // the parcel with the pencil label
        rect(96, 104, 48, 24, '#8a5a32'); rect(96, 104, 48, 3, '#a8703e'); rect(118, 104, 3, 24, '#d8c8a0'); rect(96, 114, 48, 2, '#d8c8a0');
        rect(99, 116, 18, 9, '#efe6d2');
        g.strokeStyle = '#6a6a72'; g.lineWidth = 0.6; g.beginPath();
        for (let i = 0; i < 2; i++) { const y = 119 + i * 3; g.moveTo(101, y); for (let x = 101; x < 114; x += 2) g.lineTo(x + 1, y + ((x * 7 + i) % 3 === 0 ? -1 : 0.5)); }
        g.moveTo(114.5, 118); g.lineTo(114.5, 121.5); g.moveTo(116, 118); g.lineTo(116, 121.5); g.stroke();
      },
      cassette() {
        rect(0, 0, W, H, '#0b0912');
        const lamp = g.createRadialGradient(160, 96, 4, 160, 96, 120);
        lamp.addColorStop(0, 'rgba(255,214,140,0.35)'); lamp.addColorStop(1, 'rgba(255,214,140,0)');
        g.fillStyle = lamp; g.fillRect(0, 0, W, H);
        rect(110, 64, 100, 62, '#1c1a22'); rect(114, 68, 92, 26, '#efe6d2');
        g.fillStyle = '#1a1214'; g.font = 'bold 7px monospace'; g.fillText('SIDE A - HYDERABAD 2003', 117, 78); g.fillStyle = '#2a5cb8'; g.fillText('SIDE B - 2026', 117, 89);
        g.fillStyle = '#3a3640'; g.beginPath(); g.arc(138, 108, 8, 0, TAU); g.arc(182, 108, 8, 0, TAU); g.fill();
        g.fillStyle = '#0b0912'; g.beginPath(); g.arc(138, 108, 3, 0, TAU); g.arc(182, 108, 3, 0, TAU); g.fill();
        // the sketch-pen map with twelve circles
        rect(30, 40, 64, 84, '#e8d9b5');
        g.strokeStyle = '#2a5cb8'; g.lineWidth = 1;
        for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(40 + (i % 3) * 20, 52 + Math.floor(i / 3) * 18, 4, 0, TAU); g.stroke(); }
        g.strokeStyle = '#d8402a'; g.beginPath(); g.moveTo(40, 52); g.lineTo(60, 70); g.lineTo(80, 88); g.lineTo(60, 106); g.stroke();
      },
      loft() {
        rect(0, 0, W, H, '#09070e');
        const bulb = g.createRadialGradient(160, 30, 2, 160, 30, 150);
        bulb.addColorStop(0, 'rgba(255,230,170,0.35)'); bulb.addColorStop(1, 'rgba(255,230,170,0)');
        g.fillStyle = bulb; g.fillRect(0, 0, W, H);
        rect(20, 120, 280, 6, '#3a2a1e'); rect(20, 62, 280, 5, '#3a2a1e');
        rect(36, 86, 46, 34, '#5a3a24'); rect(36, 86, 46, 4, '#7a5030'); rect(90, 96, 40, 24, '#2a4a6a');
        // the 2-in-1 under a bedsheet
        g.fillStyle = '#d8d2c4'; g.beginPath(); g.moveTo(170, 120); g.quadraticCurveTo(176, 84, 214, 82); g.quadraticCurveTo(252, 84, 258, 120); g.closePath(); g.fill();
        g.fillStyle = '#b8b0a0'; g.fillRect(186, 100, 2, 20); g.fillRect(228, 98, 2, 22);
        for (let i = 0; i < 26; i++) { const x = (i * 53) % W, y = 20 + ((i * 37) % 140); rect(x, y, 1, 1, 'rgba(255,240,200,0.5)'); }
      },
      deck() {
        rect(0, 0, W, H, '#09070e');
        const bulb = g.createRadialGradient(160, 60, 2, 160, 60, 170);
        bulb.addColorStop(0, 'rgba(255,230,170,0.32)'); bulb.addColorStop(1, 'rgba(255,230,170,0)');
        g.fillStyle = bulb; g.fillRect(0, 0, W, H);
        // the old 2-in-1, uncovered: two speakers, the cassette door, PLAY
        rect(70, 64, 180, 82, '#2a2630'); rect(70, 64, 180, 4, '#3c3844');
        for (const cx of [104, 216]) { g.fillStyle = '#16141a'; g.beginPath(); g.arc(cx, 106, 26, 0, TAU); g.fill(); g.strokeStyle = '#3a3640'; for (let r = 6; r < 26; r += 5) { g.beginPath(); g.arc(cx, 106, r, 0, TAU); g.stroke(); } }
        rect(136, 84, 48, 32, '#121016'); rect(140, 88, 40, 22, '#efe6d2'); g.fillStyle = '#1a1214'; g.font = 'bold 5px monospace'; g.fillText('SIDE A', 150, 97); g.fillText('HYD 2003', 147, 104);
        const keys = ['◀◀', '▶', '▶▶', '■', '●'];
        keys.forEach((k, i) => { rect(132 + i * 12, 122, 10, 8, i === 1 ? '#f2c230' : '#4a4652'); });
      },
    };
    return {
      scene(name) { try { g.clearRect(0, 0, W, H); (scenes[name] || scenes.office)(); c.classList.add('on'); } catch (e) { N.err('story.art', e); } },
      remove() { c.classList.remove('on'); setTimeout(() => { try { c.remove(); } catch (e) { /* ignore */ } }, 800); },
    };
  }

  /* ================================================================ the prologue: "Side B, 2026" (bible §4.1) */
  let prologueBusy = false;
  async function prologue() {
    if (prologueBusy) return false;
    prologueBusy = true;
    const C = N.calendar;
    let art = { scene() {}, remove() {} };
    const toTerrace = () => {
      if (!putPlayerOnRoof('home_terrace')) { const P = (N.player.level ? null : pos('home_terrace')) || pos('home'); if (P && !N.player.level) N.player.teleport(P.x, P.y); }
      N.player.angle = Math.PI / 2;
    };
    const steps = [
      { type: 'call', fn: () => {
        try { if (C) C.set(2026, 1, 14, 18, 5); } catch (e) { N.err('story.prologue.date', e); }
        F().year = 2026;
        art = prologueArt(); art.scene('office');
        try { if (N.audio && N.audio.music) N.audio.music.play('flashback', { fade: 1.5 }); } catch (e) { /* ignore */ }
      } },
      { type: 'card', title: '▶ PLAY  WED 14 JAN 2026  18:05', dim: 0.35 },
      { type: 'text', lines: ['Hyderabad, 2026. Makar Sankranti. Somewhere outside, a last kite.'], dim: 0.3 },
      { type: 'text', lines: ['K. {full}, 34. Fourteenth floor, Madhapur. A curved glass building in the window, the one he watched being new.'], dim: 0.3 },
      { type: 'say', s: 'amma', t: '{full}! A courier came. From America.' },
      { type: 'say', s: 'srikanth', t: "Amma, I'm in a meeting." },
      { type: 'say', s: 'amma', t: 'Your name is written in pencil. Like a schoolboy wrote it. "Lakshmi Nivas" with two exclamation marks.' },
      { type: 'say', s: 'srikanth', t: '...Immu.' },
      { type: 'call', fn: () => art.scene('cassette') },
      { type: 'text', lines: ['A cassette. The label in eleven-year-old capitals: SIDE A — HYDERABAD 2003.', 'SIDE B — in new ink: 2026. A sketch-pen map with twelve circles. A note:'], dim: 0.3 },
      { type: 'text', lines: ['"Chinnu. Play Side A first. Then Side B. Gurthunda? — I."'], dim: 0.3 },
      { type: 'call', fn: () => art.scene('loft') },
      { type: 'text', lines: ["Amma's house. The loft. The old 2-in-1 under a bedsheet."], dim: 0.3 },
      { type: 'say', s: 'amma', t: 'Arre! Not the dust!' },
      { type: 'text', lines: ['(Her hand goes to her chappal, by reflex, twenty-three years later.)'], dim: 0.3 },
      { type: 'say', s: 'srikanth', t: "Amma. I'm thirty-four." },
      { type: 'say', s: 'amma', t: "The chappal doesn't know that." },
      { type: 'call', fn: () => art.scene('deck') },
      { type: 'prompt', label: '▶ PLAY' },
      { type: 'sfx', name: 'tape_click' },
      { type: 'sfx', name: 'radio_static' },
      { type: 'sfx', name: 'bo_kaata', async: true },
      { type: 'text', lines: ['(tape hiss)', 'Far away, a child\'s voice: "Bo kaata!"'], ms: 2600, dim: 0.3 },
      { type: 'call', fn: () => { try { if (N.audio && N.audio.music) N.audio.music.stop(1); } catch (e) { /* ignore */ } } },
      { type: 'vhs', mode: 'rewind', year: [2026, 2003], ms: 2600 },
      { type: 'call', fn: () => {
        art.remove();
        try { if (C) C.set(2003, 1, 14, 7, 10); } catch (e) { N.err('story.prologue.date', e); }
        F().year = 2003;
        F().prologue_seen = true;
        toTerrace();
      } },
      { type: 'card', title: '▶ PLAY  TUE 14 JAN 2003  07:10' },
    ].concat(chapterCard(1));
    let res = null;
    try { res = N.menus && N.menus.cutscene ? await N.menus.cutscene(steps, { id: 'prologue' }) : null; } catch (e) { N.err('story.prologue', e); }
    if (!N.menus || !N.menus.cutscene) {
      // no cutscene player: apply the state changes directly
      try { if (C) C.set(2003, 1, 14, 7, 10); } catch (e) { /* ignore */ }
      F().year = 2003; F().prologue_seen = true; toTerrace();
    }
    void res;
    if (F().year !== 2003) { try { if (C) C.set(2003, 1, 14, 7, 10); } catch (e) { /* ignore */ } F().year = 2003; }
    F().prologue_seen = true;
    try { art.remove(); } catch (e) { /* ignore */ }
    prologueBusy = false;
    if (mode() === 'play' && !run() && !isDone('bo_kaata')) N.missions.start('bo_kaata', { noJump: true });
    return true;
  }

  /* ================================================================ clues + hints (bible §4, §5) */
  const CLUES = {
    lost_and_found: { clue: 'Every capsule needs a box. Find the clock tower that talks with half its faces; buy a tin that smells of fruit. Saturday, 4 pm. Over.', answer: 'mozamjahi_market', name: 'Mozamjahi Market',
      ammamma: 'A tower that talks? Clocks talk, *kanna*. Your Thatha bought my first mangoes under one. Mozamjahi.', auto: 'mozamjahi_market', aunty: 'mozamjahi_market' },
    first_day_first_show: { clue: 'The crossroads named after the red buses shows films, not buses. Saturday, before sunrise, the most-garlanded hero keeps our tape at his feet. Over.', answer: 'rtc_x_roads', name: 'RTC X Roads',
      ammamma: 'Red buses have a big office near the cinemas, *kanna*. Your Mavayya saw every film there. RTC X Roads.', auto: 'rtc_x_roads', aunty: 'rtc_x_roads' },
    last_man_batting: { clue: "PS. Sunday 23 March. Four tall uncles with light-bulb heads guard a field. Ten o'clock. Bring your bat. Over.", answer: 'lb_stadium', name: 'LB Stadium',
      ammamma: 'Uncles with bulbs for heads? Lights on poles, *kanna*. The big cricket ground. LB Stadium.', auto: 'lb_stadium', aunty: 'lb_stadium' },
    right_right: { clue: "Ugadi eve, Nani goes home on the four o'clock express. Her bus leaves from a tamarind grove with no trees, only buses. She wants Gokul's samosa-ragda for the road. Mission: parcel. Over.", answer: 'imlibun_bus_station', name: 'Imlibun Bus Station',
      ammamma: '*Imli* is tamarind, *kanna*. *Imli-bun*, a grove of them. The big bus station by the river.', auto: 'imlibun_bus_station', aunty: 'imlibun_bus_station' },
    the_clap: { clue: 'Clap at a gate and a king hears you on the hill. Find it before the summer ends. Over.', answer: 'golconda_fateh_darwaza', name: 'Golconda',
      off: "Even Yadagiri doesn't know. Ask someone who was young in 1961." },
  };
  function registerHints() {
    if (!N.hints || !N.hints.register) return;
    for (const id in CLUES) { try { N.hints.register(id, CLUES[id]); } catch (e) { N.err('story.hints', e); } }
  }
  function startClue(id, o) {
    if (!N.hints || !N.hints.start) return;
    try { N.hints.start(id, Object.assign({ clue: CLUES[id] && CLUES[id].clue, answer: CLUES[id] && CLUES[id].answer, name: CLUES[id] && CLUES[id].name }, o || {})); } catch (e) { N.err('story.clue', e); }
  }
  function solveClue(id) { try { if (N.hints && N.hints.active && N.hints.active.id === id) N.hints.solve(id); } catch (e) { /* ignore */ } }

  /* ================================================================ M1 bo_kaata — Bo Kaata! */
  function lootnaPoints() {
    const R = roofs();
    let route = null;
    try { route = R && R.route ? R.route('lakshmi_lootna') : null; } catch (e) { route = null; }
    if (route && route.length >= 2) {
      const list = route.map((r) => (typeof r === 'string' ? R.get(r) : r)).filter(Boolean);
      if (list.length >= 2) return list.slice(1).map((r) => roofCentre(r));
    }
    // ground fallback: five rings from home to the colony ground
    const a = pos('home'), b = pos('playground_1');
    if (!a || !b) return [];
    const out = [];
    for (let i = 1; i <= 5; i++) out.push(walkable(a.x + (b.x - a.x) * (i / 6), a.y + (b.y - a.y) * (i / 6), 40));
    return out;
  }
  async function m1(m) {
    music('kites');
    const p = N.player;
    const T0 = pos('home_terrace');
    // on the terrace: Nanna with his camera, Chitti; Immu on his own terrace across the ground
    if (T0 && p.level !== (T0.level || 'home_terrace') && (dist(p, T0) > 40 || !p.level)) putPlayerOnRoof(T0.level || 'home_terrace', 'home_terrace');
    m.checkpoint('terrace');
    const R = roofs();
    const onRoof = (rid, dx, dy) => { const r = R && R.get(rid); if (!r) return null; const c = roofCentre(r); return { x: c.x + (dx || 0), y: c.y + (dy || 0) }; };
    npc(m, 'nanna', onRoof('home_terrace', -10, -6) || 'home_terrace', { roof: R && R.get('home_terrace') ? 'home_terrace' : undefined });
    setVariant('nanna', null);
    npc(m, 'chitti', onRoof('home_terrace', 10, 6) || 'home_terrace', { roof: R && R.get('home_terrace') ? 'home_terrace' : undefined });
    npc(m, 'immu', onRoof('friend_terrace') || 'friend_home', { roof: R && R.get('friend_terrace') ? 'friend_terrace' : undefined });
    const kiteSpot = onRoof('home_terrace', 12, -8) || T0;
    await act(m, kiteSpot, 'Fly the kite', { objective: 'Fly your kite. Win a pech!', r: 22, h: roofH(T0) || (R && R.get('home_terrace') ? R.get('home_terrace').h : 0) });
    await m.talk([
      { s: 'nanna', t: 'Sankranti morning, {nick}. Sun behind you, wind from the lake. Perfect.', mood: 'happy' },
      { s: 'nanna', t: "Thoda left... arre, don't look at the camera. Look at the kite!" },
      { s: 'chitti', t: 'Nanna, take MY photo! Annayya looks ugly with his mouth open.', mood: 'wink' },
      { s: 'chinnu', t: "Chitti, go down. This is a men's terrace." },
      { s: 'chitti', t: '*Mummy ki cheppesta!*', mood: 'angry' },
      { s: 'amma', t: '{FULL}! *Pesarattu* is getting cold!', mood: 'shout' },
      { s: 'immu', t: "Agent Chinnu! Red kite, two o'clock! Ashok Nagar boys. Over!", mood: 'surprised' },
      { s: 'chinnu', t: 'Copy, Agent Immu. *Saddi* ready. *Dheel*... *dheel*... *khench!*', mood: 'happy' },
    ]);
    const kite = await game(m, 'kite', { target: 1, difficulty: 0.25, intro: 'Cotton saddi only. Cut one kite.', place: 'home_terrace' });
    if (!kite || kite.win === false) m.fail("The Ashok Nagar kite cut yours first. *Phir se!*");
    sfx('crowd_cheer', { ui: true, vol: 0.7 });
    m.toast('The whole colony yells: "BO KAATA!"', 2400);
    await m.wait(0.8);
    sfx('kite_cut', { ui: true });
    m.toast('...a stray green kite slices your string!', 2200);
    await m.talk([
      { s: 'chinnu', t: '*BO KAATA!*', mood: 'shout' },
      { s: 'immu', t: "Arre! YOUR kite! It's going down toward the ground! *Lootna!*", mood: 'shout' },
    ]);
    // 2. Lootna over six walled terraces (W2, 25 s, never fails)
    const pts = lootnaPoints();
    const ground = pos('playground_1');
    let kt = 0;
    S.kite = pts.length ? { x: T0 ? T0.x : p.x, y: T0 ? T0.y : p.y, h: 46 } : null;
    const kiteTick = (dt) => {
      if (!S.kite || !ground) return;
      kt += dt;
      // the cut kite drifts ahead at 55 u/s along the terraces, then down to the colony ground
      const path = pts.concat([ground]);
      let left = 55 * dt;
      while (left > 0 && path.length) {
        const tgt = path[Math.min(path.length - 1, S.kite.i || 0)];
        const d = Math.hypot(tgt.x - S.kite.x, tgt.y - S.kite.y);
        if (d <= left) { S.kite.x = tgt.x; S.kite.y = tgt.y; left -= d; if ((S.kite.i || 0) < path.length - 1) S.kite.i = (S.kite.i || 0) + 1; else break; }
        else { S.kite.x += (tgt.x - S.kite.x) / d * left; S.kite.y += (tgt.y - S.kite.y) / d * left; left = 0; }
      }
      S.kite.h = Math.max(6, 46 - kt * 1.2);
    };
    S.kiteTick = kiteTick;
    const onTime = await rings(m, pts, { secs: 25, label: 'Lootna! Chase your kite across the terraces.', timerLabel: 'LOOTNA', r: 20,
      onExpire: () => toast('Too slow... the kite floats down to the colony ground anyway.', 2600) });
    if (onTime && !ff()) { m.money(200); m.toast('Lootna bonus +₹2', 2200); F().m1_lootna_bonus = true; }
    // 3. The colony ground: Ayesha has the kite
    const ay = npc(m, 'ayesha', spot('playground_1', 6, 4), { idle: 'stand' });
    if (S.kite && ground) { S.kite.x = ground.x + 6; S.kite.y = ground.y + 2; S.kite.h = 8; }
    if (N.player.level) m.toast('Down the stairs at the last terrace (ACTION: Go downstairs), then run!', 3000);
    await m.goto('playground_1', { label: 'Get to the colony ground.', r: 30 });
    S.kite = null; S.kiteTick = null;
    if (ay) face('ayesha', 'player');
    await m.talk([
      { s: 'ayesha', t: 'Lootna rules, {nick}. Who catches, keeps.' },
      { s: 'chinnu', t: "It's MY kite. Look, my name is on the tail." },
      { s: 'ayesha', t: 'Your name is spelt wrong. *Hau*, okay, take it. But I bowl first at cricket today.', mood: 'wink' },
    ]);
    despawn('immu');
    const im = npc(m, 'immu', spot('playground_1', 70, 30, 60), { idle: 'stand' });
    if (im) { emote('immu', 'sweat', 3); await walkNpc(m, 'immu', spot('player', 14, 0, 20), { run: true, timeout: 8 }); }
    await m.talk([
      { s: 'immu', t: 'Agent Chinnu. Need to talk. Private. Over.', mood: 'tired' },
      { s: 'ayesha', t: "Private? Ooh. I'm going. But you owe me one over." },
    ]);
    if (ay) { try { N.npcs.walkTo('ayesha', spot('playground_1', -120, 40, 80), { timeout: 10 }).catch(() => {}); } catch (e) { /* ignore */ } }
    await m.talk([
      { s: 'immu', t: "Abba's visa came. Yesterday. After Eid, we fly. New Jersey.", mood: 'sad' },
      { s: 'chinnu', t: "*Baigan.* America is for uncles. You're eleven.", mood: 'angry' },
      { s: 'immu', t: 'Abba says eleven is the best age to go. You still learn the accent.' },
      { s: 'chinnu', t: 'When is Eid?' },
      { s: 'immu', t: 'End of November. Ammi checked the calendar three times.' },
      { s: 'chinnu', t: "That's... ten months. That's nearly forever.", mood: 'sad' },
      { s: 'immu', t: 'Ten months and eleven days. I counted.' },
      { s: 'chinnu', t: '...So what do we do?' },
      { s: 'immu', t: 'We take the city with us. One tape. One tin.' },
      { s: 'immu', t: 'Every place we go, *● REC*, one sound. And one thing in the tin. By Chand Raat the city is in my pocket.', mood: 'happy' },
      { s: 'chinnu', t: 'And the tin?' },
      { s: 'immu', t: 'The tin stays here. With you. Till we come back.' },
      { s: 'chinnu', t: '*Pakka?*' },
      { s: 'immu', t: '*Pakka.* Agent rules: I give clues, you find. Over and out.', mood: 'happy' },
    ]);
    despawn('ayesha');
    // 4. Café Gulistan: refill, the family room, the STD booth (save)
    at(10, 30);
    const crew = party(m, ['immu']);
    follow('immu', true, { dist: 14 });
    m.checkpoint('cafe');
    npc(m, 'bunty', spot('irani_cafe_7', 10, 10), { idle: 'sit' });
    await m.goto('irani_cafe_7', { label: 'Meet Bunty-anna at Café Gulistan.', r: 26 });
    npc(m, 'salim', spot('irani_cafe_7', -8, 6), { idle: 'work' });
    await m.talk([
      { s: 'salim', t: "*Do pauna*, one plate Osmania, table *teen*! For Bunty-anna's gang, biscuits hot.", mood: 'happy' },
      { s: 'bunty', t: 'Kids. Word of the day from my Ameerpet sir: NOSTALGIA. Means "very old style". Like my RX100.', mood: 'wink' },
      { s: 'immu', t: 'Your RX100 is a 1990 model, anna.' },
      { s: 'bunty', t: 'Exactly. Nostalgia. Now: kites. Colony is sold out. Gulzar Houz, Patang Bazaar.' },
      { s: 'salim', t: 'Phone is there, bhai. STD booth. Call home before Mummy calls the police.' },
    ]);
    buntyWord('very old style');
    feed(40);
    m.toast('Save at any STD booth. Chai + Osmania = energy.', 4200);
    crew.add('bunty');
    follow('bunty', true, { dist: 22, side: 'left' });
    // 5. Ride to Gulzar Houz (Bunty refuses triple riding; Yadagiri's auto, passenger)
    await m.talk([{ s: 'bunty', t: 'Three on my RX100? Pochaiah will eat me raw. Auto!' }]);
    sfx('auto_horn', { ui: true });
    await m.talk([
      { s: 'yadagiri', t: 'Gulzar Houz? On Sankranti? *Meter nakko, das upar.* The roads are all kites.' },
      { s: 'bunty', t: 'Anna, students. Student rate.' },
      { s: 'yadagiri', t: 'Students eat the most. *Das upar.*' },
    ]);
    m.objective('Ride to Gulzar Houz.');
    at(12, 20);
    await ride(m, {
      type: 'yadagiri_auto', driver: 'yadagiri', to: 'gulzar_houz', secs: 9, minutes: 35, label: 'AUTO → GULZAR HOUZ', party: crew,
      lines: [{ s: 'yadagiri', t: 'Any day you are lost, find my auto. YADAGIRI on the back. Five rupees, I drop you near.' }],
      during: () => toast('Deccan Vani news: the new HITEX exhibition centre opens today in Madhapur.', 4200, 'radio'),
    });
    music('oldcity');
    m.checkpoint('gulzar_houz');
    try { N.hud.districtBanner('Charminar', 'చార్మినార్'); } catch (e) { /* ignore */ }
    await m.cutscene([{ type: 'camera', target: 'charminar', zoom: 0.8, ms: 1600 }, { type: 'wait', ms: 1400 }]);
    // 6. Five kites and a charkhi at Patang Chacha's stall (bargain who:'kite')
    npc(m, 'kite_chacha', spot('kite_stall_1', 0, -6, 20), { idle: 'work', roof: false });
    await m.goto('kite_stall_1', { label: 'Buy five kites and a charkhi of saddi (₹20).', r: 22 });
    face('kite_chacha', 'player');
    await m.talk([
      { s: 'kite_chacha', t: '*Aao, mian.* Paper kites, bamboo spine, and *saddi mazboot.* Won\'t snap in a *pech.*', mood: 'happy' },
      { s: 'chinnu', t: 'Chacha, five kites and one charkhi. Twenty rupees.' },
      { s: 'kite_chacha', t: 'Twenty? Today is Sankranti, *beta*. Today even the wind charges extra.', mood: 'wink' },
    ]);
    const bg = await game(m, 'bargain', { who: 'kite', start: 30, target: 20, place: 'kite_stall_1', what: 'five kites and a charkhi', intro: 'Five kites and a charkhi of saddi. Twenty rupees.' });
    const price = bg && bg.win && bg.pricePaise ? bg.pricePaise : 2000;
    money(m, -price, 'kites', 'bunty');
    give(m, 'kite', 'Five paper kites', 5);
    give(m, 'charkhi', 'A charkhi of cotton saddi');
    await m.talk([
      { s: 'kite_chacha', t: '*Theek hai.* Twenty. And no glass manja, *haan*? Glass cuts fingers and birds. Cotton only.' },
      { s: 'kite_chacha', t: 'Listen. This morning I flew twelve riddle kites from my roof. Each tail has a clue to the next.' },
      { s: 'kite_chacha', t: "Find all twelve before Chand Raat, bring them to me. I'll make a train of kites taller than Charminar.", mood: 'happy' },
    ]);
    unlockSeries('kites');
    // K1 on the fountain railing teaches collectibles
    if (col() && col().get && col().get('kite_1') && !hasItem('kite_1') && !ff()) {
      let bl = null;
      try { bl = col().blip ? col().blip('kite_1') : null; } catch (e) { bl = null; }
      m.objective('A kite on the fountain railing! Pick it up.');
      const t0 = N.time.now;
      let kp = null;
      try { kp = col().posOf ? col().posOf('kite_1') : null; } catch (e) { kp = null; }
      const stp = S.step = { kind: 'k1', target: kp, skip: () => { try { col().found('kite_1'); } catch (e) { /* ignore */ } } };
      await m.until(() => hasItem('kite_1') || N.time.now - t0 > 90);
      if (S.step === stp) S.step = null;
      try { if (col().unblip) col().unblip('kite_1'); } catch (e) { void bl; }
      if (hasItem('kite_1')) m.toast('1/12. Read the tag in the Journal.', 3200);
    }
    // 7. Chai at Café Noor-e-Iran: plants the finale
    at(15, 30);
    npc(m, 'faramarz', spot(['irani_cafe_19', 'cafe_noor_e_iran'], 0, -8, 20), { idle: 'work' });
    await go(m, ['irani_cafe_19', 'cafe_noor_e_iran'], { label: 'Have chai at Café Noor-e-Iran.', r: 26 });
    face('faramarz', 'player');
    await m.talk([
      { s: 'faramarz', t: "Arre, Rasheed's boy! Imran! Last time you were this high, you ate my sugar bowl.", mood: 'happy' },
      { s: 'faramarz', t: "*Do chai, ek plate Osmania!* For Rasheed's boy, the Osmania is *phokat.*" },
      { s: 'immu', t: 'Uncle, Abba says you know everything about Charminar.' },
      { s: 'faramarz', t: "Everything? *Hau.* Four clocks, four arches, four minars. The pigeons' names. And my cellar stair." },
      { s: 'chinnu', t: 'What stair?' },
      { s: 'faramarz', t: "That stair goes down to Golconda. They say. Only I know the way, and I'm not telling.", mood: 'wink' },
      { s: 'immu', t: 'Is it true? The tunnel?' },
      { s: 'faramarz', t: 'Hyderabad has two kinds of truth, *beta*: what is, and what they say. Both come free with chai.' },
      { s: 'bunty', t: 'Uncle, word of the day: nostalgia.' },
      { s: 'faramarz', t: 'Nostalgia? Chai gone cold because you were talking. Drink.' },
    ]);
    buntyWord('chai gone cold because you were talking');
    feed(40);
    // 8. Home before the street lights (Yadagiri drives everyone home; skip allowed)
    m.objective('Home before the street lights.');
    await ride(m, { type: 'yadagiri_auto', driver: 'yadagiri', to: 'home', secs: 6, minutes: 50, label: 'AUTO → LAKSHMI NIVAS', party: crew });
    at(17, 55);
    crew.hide();
    const T1 = pos('home_terrace');
    npc(m, 'nanna', onRoof('home_terrace', -8, -4) || 'home_terrace', { roof: R && R.get('home_terrace') ? 'home_terrace' : undefined });
    npc(m, 'chitti', onRoof('home_terrace', 10, 8) || 'home_terrace', { roof: R && R.get('home_terrace') ? 'home_terrace' : undefined });
    npc(m, 'immu', onRoof('friend_terrace') || 'friend_home', { roof: R && R.get('friend_terrace') ? 'friend_terrace' : undefined });
    music('kites');
    if (!N.player.level) m.toast('Up the stairs beside the house (ACTION: Go up to the terrace).', 3000);
    await go(m, 'home_terrace', { label: 'Up to the terrace: evening kites.', r: 18 });
    if (T1) void T1;
    await m.talk([
      { s: 'nanna', t: 'Here. My camera. One roll, twenty-four photos. Think before you click, *ra.*' },
      { s: 'nanna', t: 'When the roll is full, Raj-uncle will develop it.' },
      { s: 'chinnu', t: 'Nanna, why are you never in your photos?' },
      { s: 'nanna', t: 'Someone has to hold the camera.' },
      { s: 'chitti', t: 'Nanna IS the camera.', mood: 'happy' },
      { s: 'immu', t: 'Agent Chinnu. First sound. Over.' },
    ]);
    give(m, 'camera', "Nanna's camera (24 frames)");
    setVariant('chinnu', 'camera');
    unlockSeries('golis'); unlockSeries('frames');
    m.objective('● REC: the first sound for Side A.');
    await m.rec('bo_kaata');
    await m.say('chit', CLUES.lost_and_found.clue);
    startClue('lost_and_found');
    await m.cutscene([{ type: 'text', lines: ['Dusk. A thousand kites come down like tired birds. On the next terrace, Immu holds up the walkman and gives a thumbs-up. Chitti is still telling Mummy.'] }]);
    at(18, 20);
  }

  /* ================================================================ M2 lost_and_found — Lost and Found */
  async function m2(m) {
    music('day');
    // 1. The clock tower that talks with half its faces (lock digit 2)
    await m.goto('mozamjahi_market', { label: 'Find the clock tower that talks with half its faces.', r: 34 });
    await m.say('chinnu', 'Clocks on this face... none on this one... clock... none. Half of them are silent.');
    let tries = 0;
    for (;;) {
      const a = await m.choice('chinnu', 'How many faces have no clock?', ['2', '4', '6', '8']);
      if (a === 1) break;
      tries++;
      if (tries >= 3) { await m.say('narrator', 'Eight faces. A clock, a blank, a clock, a blank... Four of them stay silent.'); break; }
      await m.say('narrator', 'Count again, walk round it.');
    }
    lockDigit(2, 4);
    // 2. A tin that smells of fruit (₹40)
    npc(m, 'bakery_man', spot('karachi_bakery', 0, -6, 16), { idle: 'work' });
    await m.goto('karachi_bakery', { label: 'Buy a tin that smells of fruit (₹40).', r: 22 });
    await m.talk([
      { s: 'bakery_man', t: 'Fruit biscuits? Half-kilo tin, forty rupees. For which relative?' },
      { s: 'chinnu', t: 'Not for relatives, uncle. For history.' },
      { s: 'bakery_man', t: 'History also likes fruit biscuits. Take.', mood: 'happy' },
    ]);
    money(m, -4000, 'tin', 'immu');
    give(m, 'tin', 'Karachi Bakery fruit-biscuit tin');
    m.checkpoint('tin_bought');
    await press(m, 'Empty the tin', { priority: 8 });
    m.objective('Empty the tin.');
    feed(30, 'For the capsule. A sacrifice.');
    m.toast('Optional: a sitaphal scoop at Famous Ice Cream (₹8, energy +20).', 3400);
    // 3. Cut through Nampally station (₹3 platform ticket)
    const porter = extraAt('nampally_station', 14, 10, randomLook('porter', 'lungi'), { role: 'porter' });
    porter.look.shirt = '#b22b2b';
    await act(m, 'nampally_station', 'Platform ticket ₹3', { objective: 'Cut through Nampally station to Numaish (₹3 platform ticket).', r: 26 });
    if (!ff()) {
      try { const SH = N.shops; if (SH && SH.buy && !SH.platformTicket('nampally_station')) { const r = SH.buy('nampally_station', 'platform', { quiet: true }); if (!r || !r.ok) money(m, -300, 'platform', 'immu'); } else if (!SH) money(m, -300, 'platform', 'immu'); } catch (e) { money(m, -300, 'platform', 'immu'); }
    }
    sfx('station_chime', { ui: true });
    bark(porter, '"*Coolie? Coolie?*"', 2.4);
    m.toast('The platform where trains stop for good: the buffer stops at the end of the line.', 3400);
    await go(m, ['numaish_gate', 'nampally_exhibition'], { label: 'Through the side gate into Numaish.', r: 30 });
    m.checkpoint('numaish_gate');
    music('numaish');
    at(17, 10);
    // 4. Find Immu: three announcements, each names a stall; a beacon on Immu after the third
    m.objective('Find Immu. Listen to the loudspeaker.');
    sfx('announce', { ui: true });
    await m.say('loudspeaker', 'Attention please! One boy, *chashma wala*, name Imran. He is not lost. He is waiting for Chinnu near the Delhi papad.');
    const papad = spot(['numaish_stalls_1', 'nampally_exhibition'], 0, 4, 30);
    npc(m, 'papad_man', papad, { idle: 'work' });
    await m.goto(papad, { label: 'Find Immu near the Delhi papad stall.', r: 24 });
    await m.say('papad_man', '*Chashma wala?* Went to the giant wheel. Took two papads, paid for one.');
    sfx('announce', { ui: true });
    await m.say('loudspeaker', 'Again! Imran says: Chinnu, giant wheel. And bring change.');
    const wheel = pos(['giant_wheel', 'nampally_exhibition']);
    const mid = wheel ? walkable((wheel.x + N.player.x) / 2, (wheel.y + N.player.y) / 2, 40) : spot('nampally_exhibition', -40, 0);
    npc(m, 'pasha', mid, { idle: 'stand' });
    npc(m, 'babloo', mid ? { x: mid.x + 10, y: mid.y + 6 } : mid, { idle: 'stand' });
    try { sfx('detector', { x: mid.x, y: mid.y }); } catch (e) { /* ignore */ }
    await m.goto('pasha', { label: 'Head for the giant wheel.', r: 28 });
    face('pasha', 'player');
    await m.talk([
      { s: 'pasha', t: '*Khazana Hunt!* Every Sunday, Channel Seven! Qutb Shahi treasure map, five rupees only!', mood: 'shout' },
      { s: 'pasha', t: 'You! Little detective! You have the face of a boy who knows a tunnel. Buy a map!' },
      { s: 'chinnu', t: 'Is the map real?' },
      { s: 'pasha', t: 'As real as my TV show!', mood: 'happy' },
      { s: 'babloo', t: "Don't buy. He drew it last night with my sketch pens." },
    ]);
    sfx('announce', { ui: true });
    await m.say('loudspeaker', 'Last time! Imran is ON the giant wheel. At the top. Waving.');
    const imWheel = npc(m, 'immu', spot(['giant_wheel', 'nampally_exhibition'], 0, 4, 24), { idle: 'stand' });
    if (imWheel) { beacon(imWheel, { sound: 'pickup', max: 500 }); emote('immu', '♪', 6); }
    onEnd(() => beacon(null));
    await m.goto(imWheel || 'giant_wheel', { label: 'Follow the beeps: Immu is at the giant wheel.', r: 26 });
    beacon(null);
    // 5. The giant wheel (₹5): viewpoint W6
    await act(m, imWheel || ['giant_wheel', 'nampally_exhibition'], 'Ride the giant wheel ₹5', { objective: 'Ride the giant wheel (₹5).', r: 24, marker: false });
    money(m, -500, 'giant wheel', 'immu');
    sfx('giant_wheel', { ui: true });
    if (!ff() && col() && col().viewpoint) { try { await wrapP(m, col().viewpoint('numaish_wheel', { force: true })); } catch (e) { N.err('story.viewpoint', e); } }
    await m.talk([
      { s: 'immu', t: "I'm not lost. I'm strategically located near papad.", mood: 'wink' },
      { s: 'chinnu', t: 'You made them announce you to the whole Numaish!', mood: 'angry' },
      { s: 'immu', t: "Now the whole city knows my name. That's one sound for the tape." },
      { s: 'immu', t: 'From up here Hyderabad looks like a carrom board.', mood: 'happy' },
      { s: 'chinnu', t: "And you're the striker." },
      { s: 'immu', t: "I'm the queen. Everybody wants me.", mood: 'wink' },
    ]);
    await m.rec('lost_and_found');
    // 6. Immu's Ammi at the gate
    const am = npc(m, 'ammi', spot(['numaish_gate', 'nampally_exhibition'], 0, 18, 30), { idle: 'stand' });
    follow('immu', true, { dist: 14 });
    await m.goto(am || 'numaish_gate', { label: "Find Immu's Ammi at the gate.", r: 26 });
    face('ammi', 'player');
    at(19, 30);
    await m.talk([
      { s: 'ammi', t: 'Imran! The loudspeaker? For fun? The announcer uncle also has a mother!', mood: 'angry' },
      { s: 'ammi', t: 'And you, {nick}. You let him.' },
      { s: 'chinnu', t: 'Aunty, I was buying history.' },
      { s: 'ammi', t: "History, and how much papad? Here, Numaish money. Don't spend it on maps.", mood: 'happy' },
      { s: 'immu', t: 'Next tape I hide myself, Agent. Proper test.', mood: 'wink' },
    ]);
    // the clue for M3, on the way out
    await m.say('immu', CLUES.first_day_first_show.clue);
    startClue('first_day_first_show');
    await m.cutscene([{ type: 'text', lines: ['Night falls on Numaish. The giant wheel lights up one spoke at a time. The same closing music plays that plays every night. Chinnu holds the empty tin like a trophy.'] }]);
  }
  /** Track an outside promise inside a mission (rejects with the mission). */
  function wrapP(m, p) {
    let done = false, val;
    Promise.resolve(p).then((v) => { val = v; done = true; }, () => { done = true; });
    return m.until(() => done).then(() => val);
  }

  /* ================================================================ M3 first_day_first_show — First Day, First Show */
  const CUTOUTS = [
    { id: 'sandhya_theatre', n: 31, label: 'TOOFAN TAMMUDU — FIRST DAY' },
    { id: 'devi_theatre', n: 18, label: 'MASS MAHARAJU — 100 DAYS' },
    { id: 'sudarshan_theatre', n: 12, label: "NEW FILM'S HERO" },
    { id: 'odeon_theatre', n: 4, label: 'ODEON' },
  ];
  async function m3(m) {
    music('night');
    const p = N.player;
    sfx('std_ring', { ui: true, vol: 0.7 });
    m.toast('TRRRING! The alarm clock under the pillow: 05:15.', 2600);
    // 1. Sneak out (walk, don't run): running wakes Chitti
    const H0 = pos('home') || p;
    const lane = spot('home', 0, -110, 60) || walkable(p.x, p.y - 110);
    let woke = false;
    const sneak = (dt) => {
      if (woke || mode() !== 'play') return;
      if (p.running && dist(p, H0) < 90) {
        woke = true;
        wantedAdd(1, 'chitti');
        bark(H0, '"*Mummy ki cheppesta!*"', 2.4);
        sfx('door_creak', { ui: true });
      }
      void dt;
    };
    S.tickFns = [sneak];
    await m.goto(lane, { label: 'Sneak out before sunrise.', r: 24 });
    S.tickFns = null;
    npc(m, 'bahadur', spot(lane, 18, -6, 30), { idle: 'stand' });
    face('bahadur', 'player');
    sfx('gurkha', { ui: true, vol: 0.5 });
    await m.say('bahadur', '*Kaun hai?* ...Arre, Chinnu baba. Cinema? *Hau, hau.* I saw nothing. I am only a whistle.', { mood: 'wink' });
    // 2. Four forecourts, four garland counters
    at(5, 50);
    await m.goto('rtc_x_roads', { label: 'Find the most-garlanded hero at RTC X Roads.', r: 60 });
    m.checkpoint('rtc_x');
    for (const c of CUTOUTS) { if (pos(c.id)) S.labels.add({ target: c.id, text: c.n + ' GARLANDS', h: 34, dy: -12 }); }
    npc(m, 'painter', spot('sudarshan_theatre', 8, 10, 30), { idle: 'work' });
    npc(m, 'black_ticket', spot('odeon_theatre', 10, 12, 30), { idle: 'stand' });
    m.objective('Find the most-garlanded hero at RTC X Roads.');
    const seen = new Set();
    const visit = { id: null };
    const ids = [];
    for (const c of CUTOUTS) {
      if (!pos(c.id)) continue;
      const aid = 'st:cut:' + c.id;
      N.interact.add(aid, { get x() { return pos(c.id).x; }, get y() { return pos(c.id).y; }, r: 30, priority: 7, label: c.id === 'sandhya_theatre' ? 'Look at the hero' : 'Count the garlands', use: () => { visit.id = c.id; } });
      ids.push(aid);
    }
    onEnd(() => ids.forEach((id) => N.interact.remove(id)));
    const cstp = S.step = { kind: 'cutouts', target: 'sandhya_theatre', skip: () => { visit.id = 'sandhya_theatre'; } };
    if (ff()) visit.id = 'sandhya_theatre';
    while (visit.id !== 'sandhya_theatre') {
      await m.until(() => visit.id);
      const v = visit.id; visit.id = null;
      if (v === 'sandhya_theatre') { visit.id = v; break; }
      if (seen.has(v)) { await m.say('narrator', 'Fewer garlands than Sandhya. Not the most.'); continue; }
      seen.add(v);
      if (v === 'sudarshan_theatre') await m.say('painter', 'New film\'s hero. I paint the moustache last; it is the most important part.');
      else if (v === 'odeon_theatre') await m.talk([
        { s: 'black_ticket', t: 'Ticket *kaavala*? Fifty rupees, floor.', mood: 'wink' },
        { s: 'chinnu', t: 'Black? *Nakko.* Amma says black tickets are for black hearts.' },
        { s: 'black_ticket', t: 'Your Amma should write dialogues.' },
      ]);
      else if (v === 'devi_theatre') await m.say('narrator', 'Banner: "MASS MAHARAJU — 100 DAYS". A kite (not a riddle kite) hangs off the hero\'s sword. Eighteen garlands.');
    }
    ids.forEach((id) => N.interact.remove(id));
    if (S.step === cstp) S.step = null;
    await m.say('narrator', '"TOOFAN TAMMUDU — FIRST DAY". Thirty-one garlands. The hero\'s boots are as tall as Chinnu.');
    // at Sandhya: the tape behind the painted buckle
    npc(m, 'painter', spot('sandhya_theatre', 6, 12, 30), { idle: 'work' });
    m.objective("Get the tape from the hero's boot.");
    await m.say('painter', "Two steps only. I hold. Don't touch the boots, they're still wet.");
    const auntyE = extraAt('sandhya_theatre', -40, 20, lookOf('aunty_2') || randomLook('aunty', 'aunty'), { role: 'aunty' });
    auntyE.moveTo(auntyE.x + 60, auntyE.y + 10, 24); auntyE.life = 6;
    await m.say('aunty', 'Chinnu! On a ladder? In school shoes? Your Mummy will hear!', { mood: 'surprised' });
    wantedAdd(1, 'aunty phone tree');
    await press(m, '▶ Play the tape (walkman)', { priority: 8 });
    sfx('tape_click', { ui: true });
    await m.talk([
      { s: 'immu_tape', t: "Agent Immu to Agent Chinnu. If you found this, you're at Sandhya and it's six o'clock." },
      { s: 'immu_tape', t: "Ayesha is in the queue. Get three floor tickets. Over and out. ...Also, don't tell Ammi." },
    ]);
    S.labels.clear();
    // 3. Three floor tickets: the queue cage (75 s, four line-cutters)
    at(6, 0);
    m.checkpoint('queue');
    const ay = npc(m, 'ayesha', spot('sandhya_theatre', 0, 50, 40), { idle: 'stand' });
    await m.goto(ay || 'sandhya_theatre', { label: 'Find Ayesha in the queue.', r: 22 });
    await m.say('ayesha', "You're late. I've been holding this spot since five. My legs are now part of the cage.", { mood: 'tired' });
    money(m, -1000, 'floor tickets', 'immu');
    m.objective('Get three floor tickets: beat the queue cage (₹30).');
    const q = queue(m, { at: 'sandhya_theatre', ahead: 9, behind: 4, cutters: 4, label: 'QUEUE CAGE', seed: 'm3' });
    if (ay && S.pin) { ay.x = S.pin.x + q.dir.nx * 7; ay.y = S.pin.y + q.dir.ny * 7; }
    const qFollow = () => { const a = N.npcs && N.npcs.get('ayesha'); if (a && S.pin) { a.x = S.pin.x + q.dir.nx * 7; a.y = S.pin.y + q.dir.ny * 7; a.homeX = a.x; a.homeY = a.y; } };
    S.tickFns = [qFollow];
    m.timer(75, 'HOUSEFULL IN', { failMsg: 'HOUSEFULL! The board went up before you reached the window.' });
    await m.until(() => q.done);
    m.timer(null);
    S.tickFns = null;
    widget(null);
    npc(m, 'ticket_man', spot('sandhya_theatre', 0, 6, 20), { idle: 'work' });
    await m.say('ticket_man', 'Floor, three? Last three. Lucky boys. And lucky girl.', { mood: 'happy' });
    give(m, 'floor_tickets', 'Three floor tickets');
    // 4. First day, first show (cutscene inside)
    m.objective('Watch Toofan Tammudu (first day, first show).');
    at(6, 30);
    await m.cutscene([
      { type: 'fade', to: 'black', ms: 600 },
      { type: 'text', lines: ['06:30. The screen goes white. A boot. A second boot. Then the hero\'s face, forty feet tall.'] },
      { type: 'text', lines: ['Four hundred people stand up on the seats. Ayesha puts two fingers in her mouth and whistles louder than all of them.'] },
      { type: 'sfx', name: 'finger_whistle' },
      { type: 'talk', lines: [
        { s: 'immu', t: 'Ayesha! Where did you learn that?', mood: 'surprised' },
        { s: 'ayesha', t: "Bowlers' secret.", mood: 'wink' },
      ] },
      { type: 'fade', to: 'clear', ms: 600 },
    ]);
    await m.rec('first_day_first_show');
    // 5. Get home! Mummy knows (triple ride + the Chappal Meter tutorial)
    at(9, 20);
    music('chase');
    m.checkpoint('escape');
    const crew = party(m, ['immu', 'ayesha']);
    crew.show();
    await act(m, 'cycle_rent_3', 'Hire a cycle ₹3', { objective: 'Get home! Mummy knows. Hire one cycle at Raju Cycle Taxi (₹3).', r: 24 });
    money(m, -300, 'cycle hire', 'immu');
    const cp = spot('cycle_rent_3', 14, 14, 30) || spot('player', 12, 0, 30);
    const cyc = m.vehicle('kid_cycle', cp.x, cp.y, 0, { color: '#9a2424', owned: true });
    const cb = m.blip(cyc, { color: '#6fbf5a', icon: 'dot', pulse: true });
    m.objective('Get on the cycle. (Three on one cycle...)');
    await m.until(() => N.player.vehicle === cyc);
    m.unblip(cb);
    crew.hide();
    try { N.vehicles.setPillion(cyc, lookOf('immu')); } catch (e) { /* ignore */ }
    m.objective('Ride home!');
    await m.wait(3);
    m.meter('scripted', 3); wantedSet(3, 'triple riding');
    await m.say('pochaiah', '*Ruko!* Three on one cycle? *Utro!* Licence? ...Arre, you\'re eleven. *Utro* anyway.', { mood: 'angry' });
    const chasers = [];
    const chase = (type, look, key) => {
      if (realWanted()) return null;
      const pl = N.player;
      const s0 = laneSpotNear(pl.x - Math.cos(pl.angle || 0) * 120, pl.y - Math.sin(pl.angle || 0) * 120);
      let v = null;
      try { v = m.vehicle(type, s0.x, s0.y, s0.angle, { driver: { look, npc: true }, owned: true }); } catch (e) { v = null; }
      if (!v) return null;
      v.noEnter = true;
      v.controller = (veh) => {
        const tg = N.player.vehicle || N.player;
        const d = Math.hypot(tg.x - veh.x, tg.y - veh.y), ang = Math.atan2(tg.y - veh.y, tg.x - veh.x);
        veh.ctl.steer = U.clamp(U.angleDiff(veh.angle, ang) * 2.5, -1, 1);
        veh.ctl.throttle = d > 60 ? 0.85 : 0; veh.ctl.brake = d < 40;
      };
      chasers.push(v); void key;
      return v;
    };
    chase('pochaiah_luna', lookOf('pochaiah') || randomLook('pochaiah', 'police'), 'luna');
    await m.wait(5);
    m.meter('scripted', 4); wantedSet(4, 'luna');
    bark('player', 'Pochaiah: "Stop the cycle! Stop the BOY!"', 2.6);
    m.toast('Level 4: Havaldar Pochaiah follows on his Luna!', 2600);
    await m.wait(5);
    m.meter('scripted', 5); wantedSet(5, 'mummy');
    chase('yadagiri_auto', lookOf('yadagiri'), 'auto');
    await m.talk([
      { s: 'yadagiri', t: 'Sorry, {nick}! Aunty is paying full meter. FULL meter!', mood: 'worried' },
      { s: 'amma', t: '{FULL}! Cinema at six in the morning? One month before exams?! *Intiki raa!*', mood: 'shout' },
    ]);
    m.toast('CHAPPAL METER: break line of sight, sit in an Irani café family room, or bring a peace offering.', 5200);
    m.meter('normal');
    S.m3caught = false;
    npc(m, 'bunty', spot('bawarchi', 10, 10, 30), { idle: 'stand' });
    m.objective('Lose Mummy, or bring a peace offering: a Bawarchi parcel for Nanna.');
    const BW = pos('bawarchi');
    let bmk = null, bbl = null;
    if (!ff() && BW) { bmk = m.marker('bawarchi', { r: 28 }); bbl = m.blip('bawarchi', { color: '#ff5fb0', icon: 'star', pulse: true, route: true }); }
    // caught on the way (PAKDA GAYA, onBusted puts him at home): the same home scene, and the fine was paid
    await m.until(() => S.m3caught || !BW || dist(N.player, BW) <= 28);
    if (bmk) m.unmarker(bmk); if (bbl) m.unblip(bbl);
    for (const v of chasers) { try { N.vehicles.remove(v); } catch (e) { /* ignore */ } }
    if (!S.m3caught) {
      if (N.player.vehicle) { try { N.vehicles.exit(N.player, true); } catch (e) { /* ignore */ } }
      face('bunty', 'player');
      npc(m, 'bawarchi_man', spot('bawarchi', -6, 4, 20), { idle: 'work' });
      await m.talk([
        { s: 'bunty', t: "*Tension nakko*, I'm here. Biryani solves everything. One family parcel, *bhai*.", mood: 'happy' },
        { s: 'bawarchi_man', t: 'Family pack, forty rupees. Smell is free, parcel is not.' },
      ]);
    } else m.toast('Bunty-anna brings the Bawarchi parcel home anyway. *Tension nakko.*', 3000);
    give(m, 'biryani_parcel', 'A Bawarchi family parcel');
    music('day');
    npc(m, 'amma', spot('home', 14, 6, 30), { idle: 'stand' });
    npc(m, 'nanna', spot('home', 26, 10, 30), { idle: 'stand' });
    await m.goto('home', { label: 'Deliver the parcel home. Peace offering.', r: 26 });
    wantedClear('peace offering');
    await m.talk([
      { s: 'amma', t: 'Biryani? You think biryani fixes everything?', mood: 'angry' },
      { s: 'nanna', t: '...It fixes a little.' },
      { s: 'amma', t: 'Sreenivas!', mood: 'shout' },
      { s: 'nanna', t: 'Sorry. It fixes nothing. Pass the *raita*.' },
      { s: 'amma', t: 'No cinema till exams finish. And no Immu on Saturdays.' },
      { s: 'chinnu', t: 'But Mummy...', mood: 'sad' },
      { s: 'amma', t: 'Sundays, okay.' },
    ]);
    // the clue for M4: the end of Immu's tape, played at home
    await m.say('immu_tape', CLUES.last_man_batting.clue);
    startClue('last_man_batting');
    F().meter_live = true; F().sa6_unlocked = true;
    await m.cutscene([{ type: 'text', lines: ['Lunchtime. Nanna eats the biryani very slowly, so it lasts. Amma doesn\'t look at Chinnu, but she puts the leg piece on his plate.'] }]);
  }

  /* ================================================================ M4 last_man_batting — Last Man Batting */
  async function m4(m) {
    music('day');
    if (!ff()) await m.cutscene(chapterCard(2));
    // 0. Breakfast
    npc(m, 'amma', spot('home', 12, 6, 30), { idle: 'stand' });
    const ch = npc(m, 'chitti', spot('home', -12, 8, 30), { idle: 'stand' });
    await m.talk([
      { s: 'amma', t: 'TV *nakko* today. *Repu* maths exam, {FULL}. Study at Immu\'s house.' },
      { s: 'chinnu', t: 'Yes, Mummy. Study. Maths. *Pakka.*' },
      { s: 'chitti', t: "He's taking his bat to study.", mood: 'wink' },
      { s: 'amma', t: 'Bat for what?' },
      { s: 'chinnu', t: '...Geometry. For straight lines.' },
      { s: 'amma', t: 'Take Chitti with you. She is bored, and Immu\'s Ammi has biscuits.' },
      { s: 'chinnu', t: 'Mummy!', mood: 'angry' },
      { s: 'chitti', t: '*Doodh-bhaat* is ready.', mood: 'happy' },
    ]);
    despawn('amma');
    if (ch) follow('chitti', true, { dist: 14 });
    // 1. The field guarded by four tall uncles with light-bulb heads
    startClue('last_man_batting');
    npc(m, 'watchman', spot('lb_stadium', 0, 0, 24), { idle: 'stand' });
    await findPlace(m, 'lb_stadium', { label: 'Find the field guarded by four tall uncles with light-bulb heads.', near: 420, r: 34 });
    solveClue('last_man_batting');
    at(10, 0);
    npc(m, 'ayesha', spot('lb_stadium', -18, 14, 30), { idle: 'stand' });
    npc(m, 'tiger', spot('lb_stadium', -30, 24, 30), { idle: 'stand' });
    npc(m, 'immu', spot('lb_stadium', -10, 26, 30), { idle: 'stand' });
    face('watchman', 'player');
    await m.talk([
      { s: 'watchman', t: 'Stadium *mein nakko!* No match today. Only the grass is sleeping.' },
      { s: 'ayesha', t: 'Told you. Stadium is for real matches. Across the road: Public Gardens back lawn.' },
      { s: 'ayesha', t: "*Mali*-uncle sleeps till ten-thirty. Colony XI versus Ashok Nagar. I'm captain." },
      { s: 'tiger', t: "Girls' captain? Then we bat first. *Doodh-bhaat* team.", mood: 'wink' },
    ]);
    // 2. The match on the back lawn
    const lawn = spot(['hide_public_gardens_tree', 'public_gardens'], 30, -20, 60);
    for (const [id, dx, dy] of [['ayesha', 0, -30], ['immu', 18, 10], ['tiger', -30, 0]]) npc(m, id, lawn ? { x: lawn.x + dx, y: lawn.y + dy } : 'public_gardens', { idle: 'stand' });
    if (lawn) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const e = extraAt(lawn, Math.cos(a) * 46, Math.sin(a) * 34, randomLook('xi' + i, 'kid'), { role: 'fielder' }); e.faceTo = lawn; }
    at(10, 30);
    await m.goto(lawn, { label: 'Win the match on the back lawn before 1:30.', r: 30 });
    m.checkpoint('match');
    await m.cutscene([
      { type: 'text', lines: ['First innings. Ayesha bowls. Tiger edges it fine...', '...and Chitti, at fine leg as *doodh-bhaat*, takes it one-tip, one-hand.'] },
      { type: 'talk', lines: [
        { s: 'tiger', t: '*Doodh-bhaat* doesn\'t count!', mood: 'angry' },
        { s: 'ayesha', t: 'One-tip, one-hand. She counts.' },
        { s: 'chitti', t: 'I count! I COUNT!', mood: 'shout' },
      ] },
    ]);
    sfx('howzat', { ui: true });
    await m.rec('last_man_batting', { token: false });
    const cr = await game(m, 'cricket', { target: 18, overs: 2, wickets: 1, place: 'public_gardens', mali: true, intro: 'Last man batting: Immu at the other end.' });
    if (!cr || cr.win === false) m.fail("All out! Ashok Nagar win this one. *Phir se!*");
    await m.say('mali', '*Ghaas pe nakko khelna!* ...Who is batting? Hit it straight, at least.');
    await m.cutscene([{ type: 'text', lines: ['Final ball: a six over the hedge, off the roof of a passing red bus, onto the Assembly lawn beside the seated Gandhi.'] }]);
    sfx('crowd_cheer', { ui: true });
    // 3. Ask for the ball at the Assembly gate. Stay outside.
    at(12, 10);
    npc(m, 'sentry', spot('assembly', 0, 22, 30), { idle: 'stand' });
    follow('immu', true, { dist: 18 });
    await m.goto('sentry', { label: 'Ask for the ball at the Assembly gate. Stay outside.', r: 26 });
    for (let k = 0; k < 6; k++) {
      const c = await m.choice('chinnu', 'At the gate...', ['Uncle, sorry, our ball fell inside. May we please have it?', 'Oye uncle, throw the ball!']);
      if (c === 0 || c < 0) { await m.say('sentry', "Ball next to Gandhi-ji? He was a peaceful man. Take it. *Hallu, hallu.*", { mood: 'happy' }); break; }
      await m.say('sentry', '"Oye"? To me? Go and learn manners. Then come.', { mood: 'angry' });
      wantedAdd(1, 'cheeky');
    }
    await m.say('immu', 'That statue is new. Abba says it came in 1998.');
    m.toast('The seated Gandhi statue on the Assembly lawn was installed in 1998.', 4200);
    // 4. The museum mummy (quiet zone: walk)
    await m.goto('state_museum', { label: 'See the museum mummy with Immu.', r: 24 });
    m.checkpoint('museum');
    N.player.noRun = true;
    onEnd(() => { N.player.noRun = false; });
    await m.talk([
      { s: 'immu', t: 'Two thousand years old. And nobody sent HER to America.' },
      { s: 'chinnu', t: "She's from Egypt. She already came all the way to Hyderabad." },
      { s: 'immu', t: '...So you can go far and still end up home.', mood: 'sad' },
      { s: 'chitti', t: "That's a mummy? MUMMY's mummy?", mood: 'surprised' },
    ]);
    let tries = 0;
    for (;;) {
      const a = await m.choice('immu', 'In the oldest garden a princess has slept two thousand years. How many princesses?', ['1', '2', '4', '0']);
      if (a === 0 || a < 0) break;
      tries++;
      if (tries >= 3) { await m.say('narrator', 'One glass case. One princess, two thousand years asleep.'); break; }
      await m.say('narrator', 'Count again. Look in the case.');
    }
    lockDigit(1, 1);
    N.player.noRun = false;
    // 5. The final on the TV shop window (antenna minigame)
    at(13, 25);
    const tv = pos('electronics_shop_1');
    if (tv) for (let i = 0; i < 7; i++) { const e = extraAt(tv, -24 + i * 8, 14 + (i % 2) * 6, randomLook('tvcrowd' + i), { role: 'crowd' }); e.faceTo = tv; }
    npc(m, 'cable_babji', spot('electronics_shop_1', 16, 8, 20), { idle: 'stand' });
    await m.goto('electronics_shop_1', { label: 'Watch the final at the TV shop by LB Stadium (1:30 pm).', r: 30 });
    m.checkpoint('tv_shop');
    sfx('radio_static', { ui: true });
    await m.say('cable_babji', 'Signal *gaya!* Somebody go up and turn the antenna! Small boy, you. Up.', { mood: 'shout' });
    const an = await game(m, 'antenna', { time: 40, caller: 'babji', intro: 'Thoda left... thoda right... the tower is that way.' });
    if (an && an.win !== false) {
      await m.talk([
        { s: 'cable_babji', t: '*Thoda left... thoda right... AARA!* Bas! Don\'t breathe!', mood: 'shout' },
        { s: 'crowd', t: 'Score *kya hua*? Score?' },
      ]);
    } else {
      m.toast('Signal gaya! ...Babji climbs up himself, and the picture comes back.', 3200);
      await m.say('crowd', 'Score *kya hua*? Score?');
    }
    // 6. Evening: the final ends whatever the player does
    at(18, 0);
    await m.cutscene([{ type: 'text', lines: ['India lose the final. The crowd goes quiet. The shopkeeper turns the TV off. Then someone at the back starts clapping for the team anyway, and everyone joins in.'] }, { type: 'sfx', name: 'applause' }]);
    sfx('applause', { ui: true });
    await m.talk([
      { s: 'immu', t: 'We lost.', mood: 'sad' },
      { s: 'chinnu', t: 'We won the colony match.' },
      { s: 'immu', t: "In America they don't even play cricket." },
      { s: 'chinnu', t: "Then you'll be the best one there.", mood: 'happy' },
    ]);
    // home
    await ffwd(m, 25, 'HOME', () => { const h = spot('home', 0, 14, 30); if (h) N.player.teleport(h.x, h.y); });
    npc(m, 'amma', spot('home', 12, 6, 30), { idle: 'stand' });
    await m.say('amma', 'Lost? ...*Chalo*, eat. Tomorrow maths.');
    m.token('signed_ball', { name: 'The signed tennis ball', desc: "Every colony player's name in ballpoint, Chitti's in the biggest letters." });
    give(m, 'signed_ball', 'The signed tennis ball');
    // the clue for M5 (Immu, at the gate)
    npc(m, 'immu', spot('home', -16, 12, 30), { idle: 'stand' });
    await m.say('immu', CLUES.right_right.clue);
    startClue('right_right');
    F().side_cricket = true;
  }

  /* ================================================================ M5 right_right — Right, Right! */
  async function m5(m) {
    music('day');
    // 1. Ugadi shopping with Amma (Yadagiri's auto, passenger)
    npc(m, 'amma', spot('home', 12, 6, 30), { idle: 'stand' });
    await m.say('amma', 'New clothes, mango leaves, neem flowers, jaggery. Stay next to me. Don\'t vanish.');
    despawn('amma');
    m.objective('Go Ugadi shopping with Amma at Sultan Bazaar.');
    await ride(m, { type: 'yadagiri_auto', driver: 'yadagiri', to: 'sultan_bazaar', secs: 8, minutes: 25, label: 'AUTO → SULTAN BAZAAR' });
    at(14, 0);
    const step = { x: N.player.x, y: N.player.y };
    S.m5step = step;
    npc(m, 'amma', walkable(step.x + 10, step.y - 4, 20), { idle: 'stand' });
    await m.talk([
      { s: 'amma', t: "I'll be in Lakshmi Saree Centre for forty minutes. Exactly forty. Don't move from this step." },
      { s: 'chinnu', t: 'Not one step, Mummy.' },
    ]);
    try { N.npcs.walkTo('amma', walkable(step.x + 40, step.y - 30, 40), { timeout: 4 }).then(() => despawn('amma'), () => despawn('amma')); } catch (e) { despawn('amma'); }
    const im = npc(m, 'immu', walkable(step.x - 22, step.y + 8, 20), { idle: 'stand' });
    if (im) face('immu', 'player');
    await m.say('immu', "Psst. Agent. Forty minutes. Nani's bus is at four.");
    let late = false;
    const T = softTimer(240, 'AMMA COMES OUT', { onExpire: () => { late = true; } });
    void T;
    m.toast('Back on this step before Amma comes out.', 3200); // the bible's line for the 240 s timer
    follow('immu', true, { dist: 14 });
    // 2. Gokul Chat: pani-puri challenge, Nani's parcel
    npc(m, 'gokul_man', spot('gokul_chat', 0, -6, 16), { idle: 'work' });
    await m.goto('gokul_chat', { label: 'Parcel samosa-ragda at Gokul Chat.', r: 24 });
    m.checkpoint('gokul');
    await m.talk([
      { s: 'gokul_man', t: '*Teekha ya meetha?* One extra, *phokat!*', mood: 'happy' },
      { s: 'immu', t: "Loser pays for Nani's parcel." },
      { s: 'chinnu', t: '*Pakka.*' },
    ]);
    const pp = await game(m, 'panipuri', { target: 12, place: 'gokul_chat', intro: "Loser pays for Nani's parcel." });
    if (!pp || pp.win === false) { money(m, -1000, 'parcel', 'immu'); m.toast('You lost the pani-puri race. You pay for the parcel.', 2600); }
    else m.toast("You won! Immu pays for Nani's parcel.", 2400);
    await m.say('gokul_man', "Samosa-ragda parcel, double chutney, for Nani. Nani's blessings, free.");
    give(m, 'samosa_ragda', 'Samosa-ragda parcel, double chutney');
    // 3. Koti: Ticket Thatha, then the red bus to Imlibun
    npc(m, 'ticket_thatha', spot('koti_bus_stand', 24, 18, 30), { idle: 'sit' });
    await m.goto('ticket_thatha', { label: 'Catch a red bus from Koti to Imlibun.', r: 24 });
    m.checkpoint('koti');
    face('ticket_thatha', 'player');
    await m.talk([
      { s: 'ticket_thatha', t: 'Imlibun? Thirty-one years I punched tickets on these roads. Any bus for Afzalgunj or MGBS.' },
      { s: 'ticket_thatha', t: 'Here. Old habit. Keep it. Tickets are like memory: small, but they take you places.', mood: 'happy' },
      { s: 'ticket_thatha', t: "In my last year I hid twelve tickets behind bus-stop boards. Find them; I'll teach you each stop's bus." },
    ]);
    sfx('coin', { ui: true });
    give(m, 'punched_ticket', "Ticket Thatha's punched ticket");
    unlockSeries('tickets');
    try { if (N.shops && N.shops.unlockBus) N.shops.unlockBus(); else F().bus_unlocked = true; } catch (e) { F().bus_unlocked = true; }
    await m.say('conductor', '*Footboard pe nakko!* Inside! *Right, right!*', { mood: 'shout' });
    m.objective('Ride the red bus to Imlibun.');
    await ride(m, { type: 'bus', look: randomLook('busdriver', 'man'), to: 'imlibun_bus_station', secs: 15, minutes: 20, label: 'BUS 8A → IMLIBUN', party: { hide() { despawn('immu'); }, show() { npc(m, 'immu', spot('player', -14, 6, 20), { idle: 'stand' }); follow('immu', true, { dist: 14 }); } }, route: '8A' });
    at(15, 45);
    // 4. Find Nani's bus to Kurnool (W4: follow the conductors' chant)
    m.checkpoint('imlibun');
    const IB = pos('imlibun_bus_station') || N.player;
    const dests = ['Warangal!', 'Vijayawada!', 'Karimnagar!', 'Kurnool! Kurnool!', 'Nalgonda!'];
    const bays = [];
    for (let i = 0; i < dests.length; i++) {
      const a = -0.8 + i * 0.55;
      const b = walkable(IB.x + Math.cos(a) * (70 + (i % 2) * 22), IB.y + Math.sin(a) * (54 + (i % 2) * 16), 40);
      const cond = extra(b.x, b.y, randomLook('cond' + i, 'man'), { role: 'conductor' });
      cond.look.shirt = '#a08a5a'; cond.faceTo = IB;
      bays.push({ cond, call: dests[i], kurnool: i === 3, t: i * 0.8 });
      try {
        const bv = N.world.findFree(b.x + 18, b.y - 14, 'drive', 40);
        if (bv && !ff()) { const v = m.vehicle('bus', bv.x, bv.y, a + Math.PI / 2, { route: i === 3 ? 'KURNOOL' : 'EXP' }); if (v) { v.noEnter = true; v.locked = true; } }
      } catch (e) { /* buses are scenery */ }
    }
    const kur = bays[3].cond;
    const nani = npc(m, 'nani', walkable(kur.x + 10, kur.y + 8, 20), { idle: 'stand' });
    S.tickFns = [(dt) => {
      for (const b of bays) { b.t -= dt; if (b.t <= 0) { b.t = b.kurnool ? 2.6 : 3.4 + Math.random() * 2; if (N.render.inView(b.cond.x, b.cond.y, 120)) bark(b.cond, '"' + b.call + '"', 1.6); } }
    }];
    beacon(kur, { sound: 'conductor', max: 420 });
    onEnd(() => beacon(null));
    await m.goto(nani || kur, { label: "Find Nani's bus to Kurnool. Follow the conductors' chant.", r: 24 });
    beacon(null);
    S.tickFns = null;
    face('nani', 'player');
    await m.talk([
      { s: 'nani', t: 'Imran! You came. And this is the famous {nick}?', mood: 'happy' },
      { s: 'chinnu', t: '*Salaam*, Nani. Samosa-ragda. Double chutney.' },
      { s: 'nani', t: "*Hai Allah*, still hot! Don't forget Hyderabad over there, Imran. And you, {nick}: don't let him.", mood: 'happy' },
      { s: 'nani', t: '*Imli-bun*. When I was a girl this was all tamarind trees. Now buses. Same shade, different trees.' },
      { s: 'conductor', t: 'Kurnool! *Right, right!*', mood: 'shout' },
    ]);
    await m.rec('right_right');
    // 5. Back on Amma's step before she comes out
    const reachStep = () => dist(N.player, step) <= 24;
    if (!late) {
      m.objective("Get back to Amma's step before she comes out!");
      const mk = m.marker(step, { r: 20 }); const bl = m.blip(step, { color: '#ff5fb0', icon: 'star', pulse: true, route: true });
      S.step = { kind: 'step', skip: () => N.player.teleport(step.x, step.y) };
      await m.until(() => reachStep() || late);
      m.unmarker(mk); m.unblip(bl);
    }
    T.stop();
    npc(m, 'amma', walkable(step.x + 10, step.y - 4, 20), { idle: 'stand' });
    if (!late) {
      despawn('immu');
      await m.talk([
        { s: 'amma', t: 'Good boy. You didn\'t move.', mood: 'happy' },
        { s: 'chinnu', t: 'Not one step, Mummy.' },
        { s: 'amma', t: 'Then why are you sweating? And why do you smell of chutney?' },
        { s: 'chinnu', t: '...Ugadi, Mummy. Six tastes.' },
      ]);
    } else {
      wantedSet(3, 'empty step');
      bark('amma', '"{FULL}! I came out and the step was EMPTY!"', 3.4);
      await m.say('amma', '{FULL}! I came out and the step was EMPTY!', { mood: 'shout' });
      m.objective('Escape Mummy, or face her at the step.');
      const mk = m.marker(step, { r: 20 });
      S.step = { kind: 'late', skip: () => wantedClear('skip') };
      await m.until(() => reachStep() || wantedLevel() === 0);
      m.unmarker(mk);
      wantedClear('ugadi');
    }
    // 6. Ugadi morning at home: the pachadi
    await m.jumpTo([2003, 4, 2, 7, 0], { fx: 'ff' });
    const h = spot('home', 0, 14, 30); if (h) N.player.teleport(h.x, h.y);
    npc(m, 'amma', spot('home', 12, 6, 30), { idle: 'stand' });
    npc(m, 'ammamma', spot('home', -14, 4, 30), { idle: 'sit' });
    await m.talk([
      { s: 'amma', t: 'Six tastes: sweet, sour, salt, bitter, spicy, tangy. Like a whole year.' },
      { s: 'ammamma', t: 'Eat the bitter neem also, *kanna*. Without it the sweet doesn\'t know it is sweet.', mood: 'happy' },
    ]);
    await m.cutscene([{ type: 'text', lines: ['A cassette taps on the window, hanging from a string. Immu\'s handwriting: "PLAY ME."'] }]);
    sfx('tape_click', { ui: true });
    await m.talk([
      { s: 'immu_tape', t: 'Clap at a gate and a king hears you on the hill. Find it before the summer ends. Over.' },
      { s: 'chinnu', t: 'What king? What hill?', mood: 'surprised' },
    ]);
    startClue('the_clap');
  }

  /* ================================================================ M6 ammammas_thursday — Ammamma's Thursday */
  async function m6(m) {
    music('day');
    // 1. Ammamma's wheat at the pindi girni (power cut, the walkman tutorial, ● REC)
    npc(m, 'ammamma', spot('home', -14, 4, 30), { idle: 'sit' });
    await m.say('ammamma', 'Fine flour, *kanna*. Not *rava*. Your Ammamma\'s chapatis have a reputation.');
    npc(m, 'ramulu', spot('pindi_girni_1', 0, -6, 16), { idle: 'work' });
    await m.goto('pindi_girni_1', { label: "Get Ammamma's wheat ground at the pindi girni.", r: 24 });
    sfx('flour_mill', { ui: true });
    face('ramulu', 'player');
    await m.talk([
      { s: 'ramulu', t: '*Dabba* there, in the line. Number forty-seven. Sit.' },
      { s: 'chinnu', t: 'Uncle, your hair is all white!', mood: 'surprised' },
      { s: 'ramulu', t: "My hair isn't white, *beta*. It's *atta*.", mood: 'wink' },
    ]);
    F().power_cut = true;
    onEnd(() => { F().power_cut = false; });
    m.toast('The thump-thump stops. Power cut.', 2400);
    await m.talk([
      { s: 'ramulu', t: 'Current *gaya!* Everybody sit, till it comes.' },
      { s: 'aunty', t: '*Current poyindi!* Sreenivas-garu, *emaindi?!*', mood: 'shout' },
      { s: 'chinnu', t: 'Why does everyone shout at Nanna?' },
      { s: 'ramulu', t: 'Your Nanna brings the current back. When you bring something back, people think you took it.' },
    ]);
    m.objective('Wait for the current. (Play a cassette on your walkman: Q / the radio button.)');
    const t0 = N.time.now;
    S.step = { kind: 'walkman', skip: () => { S.wmSkip = true; } };
    S.wmSkip = false;
    await m.until(() => S.wmSkip || (N.walkman && N.walkman.playing) || N.time.now - t0 > 30);
    npc(m, 'agarwal', spot('kirana_1', 0, -6, 16), { idle: 'stand' });
    await m.talk([
      { s: 'agarwal', t: 'Tell your girni uncle his radio is too loud.' },
      { s: 'ramulu', t: 'Tell your kirana uncle his radio is too quiet.' },
      { s: 'chinnu', t: 'You both have the same radio.' },
      { s: 'narrator', t: 'Agarwal-ji and Ramulu, together: "...Hmph."' },
    ]);
    F().power_cut = false;
    try { if (N.walkman && N.walkman.playing && N.walkman.stop) N.walkman.stop(); } catch (e) { /* ignore */ }
    sfx('flour_mill', { ui: true });
    m.toast('The machine thumps back to life.', 2200);
    await m.rec('ammammas_thursday');
    // 2. Carry the flour home without spilling (W3 cargo on Nanna's old cycle)
    m.checkpoint('girni_done');
    const cp = spot('pindi_girni_1', 16, 16, 30) || spot('player', 12, 0, 30);
    const cyc = m.vehicle('old_cycle', cp.x, cp.y, 0, { owned: true, color: '#141416' });
    const cb = m.blip(cyc, { color: '#6fbf5a', icon: 'dot', pulse: true });
    m.objective("Get on Nanna's old cycle: the flour bag is on the carrier.");
    await m.until(() => N.player.vehicle === cyc);
    m.unblip(cb);
    const C = cargo(m, { item: 'atta', label: 'ATTA', vehicle: cyc, failLine: 'Ramulu: Atta on the road? The crows will be very happy. Come, I\'ll grind again.' });
    await m.goto('home', { label: 'Carry the flour home without spilling.', r: 28, inVehicle: 'old_cycle' });
    C.stop();
    if (N.player.vehicle) { try { N.vehicles.exit(N.player, true); } catch (e) { /* ignore */ } }
    m.toast('Five kilos of fine flour, home without a speck on the road.', 2600);
    // 3. Ammamma's BP tablets
    m.checkpoint('medicine');
    npc(m, 'chemist', spot('medical_shop_1', 0, -6, 16), { idle: 'work' });
    await m.goto('medical_shop_1', { label: "Buy Ammamma's BP tablets at the medical shop.", r: 24 });
    await m.talk([
      { s: 'chemist', t: "Doctor's *chitti*? ...Ammamma's tablets, one month's strip. Change two rupees. Or Hajmola?" },
      { s: 'chinnu', t: 'Change, uncle. Ammamma counts.' },
    ]);
    give(m, 'bp_tablets', "Ammamma's tablets");
    // 4. Ammamma to the Sai Baba temple in Dilsukhnagar (Yadagiri's auto, passenger)
    at(16, 30);
    npc(m, 'ammamma', spot('home', -14, 4, 30), { idle: 'stand' });
    await m.goto('ammamma', { label: 'Take Ammamma to the Sai Baba temple in Dilsukhnagar.', r: 26 });
    const amm = party(m, ['ammamma']);
    await m.talk([
      { s: 'yadagiri', t: 'Thursday, Sai Baba. For Ammamma, meter only. No *das upar*.', mood: 'happy' },
      { s: 'ammamma', t: 'Yadagiri is a good boy. His meter is a bad boy.', mood: 'wink' },
    ]);
    await ride(m, { type: 'yadagiri_auto', driver: 'yadagiri', to: ['banana_cart_8', 'dilsukhnagar_sai_temple'], secs: 8, minutes: 40, label: 'AUTO → DILSUKHNAGAR', party: amm });
    at(17, 20);
    m.checkpoint('temple_lane');
    N.player.noRun = true;
    onEnd(() => { N.player.noRun = false; });
    npc(m, 'banana_man', spot('banana_cart_8', 0, -6, 16), { idle: 'work' });
    await m.goto('banana_cart_8', { label: 'A dozen bananas for Baba (₹12).', r: 24 });
    await m.say('banana_man', '*Arati pandlu! Chakkarakeli!* Dozen, twelve rupees. One *kosaru* for the little one.', { mood: 'happy' });
    give(m, 'bananas', 'A dozen bananas');
    npc(m, 'flower_aunty', spot('flower_cart_5', 0, -6, 16), { idle: 'work' });
    await m.goto('flower_cart_5', { label: 'A rose garland (₹8).', r: 24 });
    await m.say('flower_aunty', 'Thursday rose garland for Baba. I kept one aside. Two rupees less for Ammamma.', { mood: 'happy' });
    give(m, 'rose_garland', 'A rose garland');
    // 5. The Thursday queue: walk only, chappals at the stand (W5 respect variant)
    m.meter('frozen');
    music(null);
    await m.goto('dilsukhnagar_sai_temple', { label: 'Join the Thursday queue. Walk only; chappals at the stand.', r: 40 });
    m.toast('Chappals off at the stand. Walk only.', 2400);
    const q = queue(m, { at: 'dilsukhnagar_sai_temple', ahead: 6, behind: 4, respect: true, keepFrozen: true, label: 'THURSDAY QUEUE', serve: [2.4, 3.4], seed: 'm6' });
    follow('ammamma', false);
    const amPin = () => { const a = N.npcs && N.npcs.get('ammamma'); if (a && S.pin && q.dir) { a.x = S.pin.x + q.dir.nx * 7; a.y = S.pin.y + q.dir.ny * 7; a.homeX = a.x; a.homeY = a.y; } };
    S.tickFns = [amPin];
    await m.until(() => q.steps >= 1 || q.done);
    await m.talk([
      { s: 'ammamma', t: 'What are you two always whispering into that machine?' },
      { s: 'chinnu', t: 'Immu\'s clue, Ammamma. "Clap at a gate and a king hears you on the hill." Nobody knows.' },
      { s: 'ammamma', t: 'In a queue even God waits, *kanna*. So we also wait. And think.' },
    ]);
    await m.until(() => q.steps >= 3 || q.done);
    await m.talk([
      { s: 'ammamma', t: 'Heard on a hill... Your Thatha took me there in 1961. He clapped at the big gate, and a man on top clapped back.' },
      { s: 'ammamma', t: 'I thought it was magic. Your Thatha said it was the walls. Golconda.' },
      { s: 'chinnu', t: 'GOLCONDA! Ammamma, you\'re a genius!', mood: 'shout' },
      { s: 'ammamma', t: 'Shh. Baba is listening. He also thinks I\'m a genius.', mood: 'wink' },
    ]);
    await m.until(() => q.done);
    S.tickFns = null;
    widget(null);
    await m.cutscene([{ type: 'text', lines: ['Inside, the white marble Baba. Ammamma folds her hands. Chinnu folds his, and asks for something he doesn\'t say out loud.'] }]);
    // the clue is solved: Golconda
    F().clue5_solved = true;
    try { if (N.hints && N.hints.register) N.hints.register('the_clap', { clue: 'Clap at the gate (Fateh Darwaza). Someone answers from the top (Bala Hissar).', answer: 'golconda_fateh_darwaza', name: 'Golconda Fort, Fateh Darwaza' }); } catch (e) { /* ignore */ }
    startClue('the_clap', { clue: 'Clap at the gate (Fateh Darwaza). Someone answers from the top (Bala Hissar).', answer: 'golconda_fateh_darwaza', name: 'Golconda Fort, Fateh Darwaza', off: null });
    m.meter('normal');
    at(19, 30);
  }

  /* ================================================================ SA1 pandal_duty — Pandal Duty */
  function todayKey() { return N.clock ? N.clock.day : 0; }
  /** A pandal night is on right now: SA1 can start (its window, its dates, a night left to guard tonight). */
  function pandalTonight() {
    const f = F();
    if (!isDone('ammammas_thursday') || (f.pandal_nights | 0) >= 4 || f.pandal_last_day === todayKey() || !inMD('08-31', '09-08')) return false;
    const mi = N.clock ? N.clock.minutes : 0;
    return mi >= 21 * 60 && mi <= 23 * 60 + 30;
  }
  function inMD(from, to) { try { return !!(N.calendar && N.calendar.inRange(from, to)); } catch (e) { return false; } }
  async function sa1(m) {
    const night = (F().pandal_nights | 0) + 1;
    setVariant('bunty', 'committee');
    onEnd(() => setVariant('bunty', null));
    const P = pos('playground_1');
    npc(m, 'bunty', spot('playground_1', 10, -16, 30), { idle: 'stand' });
    face('bunty', 'player');
    if (night === 1) {
      await m.say('bunty', "Committee rule: one boy guards the laddu all night. Tonight, you. I'm guarding the committee.", { mood: 'wink' });
      // Night 1: the chanda round (W2, 120 s)
      const donors = [
        { place: 'kirana_1', who: 'agarwal', amt: 11, lines: [{ s: 'agarwal', t: 'Chanda? Eleven rupees. And tell Ramulu I gave eleven. Not ten. Eleven.' }] },
        { place: 'pindi_girni_1', who: 'ramulu', amt: 11, lines: [{ s: 'ramulu', t: 'Eleven? Then I give eleven. And one coconut extra. Tell him that.' }] },
        { place: 'irani_cafe_7', who: 'salim', amt: 21, lines: [{ s: 'salim', t: 'Twenty-one, from the café. Ganpati likes Osmania also, I think.' }] },
        { place: 'medical_shop_8', who: 'chemist', amt: 11, lines: [] },
        { place: 'friend_home', who: 'abba', amt: 51, lines: [{ s: 'abba', t: "Chanda? *Lo.* Ganpati is our neighbour too. Fifty-one. Don't tell Imran, he'll want a commission.", mood: 'happy' }] },
      ];
      const got = [];
      const pending = [];
      const ids = [];
      for (const d of donors) {
        if (!pos(d.place)) { got.push(d); continue; }
        npc(m, d.who, spot(d.place, 0, -6, 16), { idle: 'stand', key: 'chanda_' + d.who });
        const aid = 'st:chanda:' + d.place;
        const bl = m.blip(d.place, { color: '#f2c230', icon: 'star', pulse: true, route: false });
        d.bl = bl;
        N.interact.add(aid, { get x() { return pos(d.place).x; }, get y() { return pos(d.place).y; }, r: 26, priority: 7, label: 'Chanda for the pandal', enabled: () => got.indexOf(d) < 0, use: () => { if (got.indexOf(d) < 0) { got.push(d); pending.push(d); } } });
        ids.push(aid);
      }
      onEnd(() => ids.forEach((id) => N.interact.remove(id)));
      m.objective('Chanda round: collect from the kirana, the girni, Café Gulistan, the medical shop and Immu\'s house.');
      m.timer(120, 'CHANDA', { failMsg: 'Time up. The committee wanted the chanda before the aarti. Phir se, tomorrow night.' });
      S.step = { kind: 'chanda', skip: () => { for (const d of donors) if (got.indexOf(d) < 0) { got.push(d); } } };
      let total = 0;
      while (got.length < donors.length || pending.length) {
        await m.until(() => pending.length || got.length >= donors.length);
        while (pending.length) {
          const d = pending.shift();
          if (d.bl) m.unblip(d.bl);
          sfx('coin', { ui: true });
          if (d.lines.length) await m.talk(d.lines);
          total += d.amt;
          m.toast('Chanda: ₹' + d.amt + ' for the committee (₹' + total + ').', 2000);
        }
        if (ff()) break;
      }
      m.timer(null);
      ids.forEach((id) => N.interact.remove(id));
      await m.goto('playground_1', { label: 'Give the chanda to Bunty-anna at the pandal.', r: 30 });
      await m.say('bunty', 'Committee thanks you. Ganpati also thanks you. Laddu is for after the aarti.');
    } else {
      // Nights 2 to 4: the night watch (W9 tag, 60 s)
      if (night === 2) {
        npc(m, 'tiger', spot('playground_1', 64, 34, 40), { idle: 'stand' });
        face('tiger', 'player');
        await m.talk([
          { s: 'tiger', t: "We're not stealing. We're... inspecting your laddu.", mood: 'wink' },
          { s: 'chinnu', t: 'Inspect from your own ground!', mood: 'angry' },
        ]);
        despawn('tiger');
      }
      else await m.say('bunty', 'Night ' + night + '. Torch on. Laddu duty.');
      await m.goto('playground_1', { label: 'Guard the laddu: tag the raiders before they reach it.', r: 34 });
      m.checkpoint('watch');
      const won = await nightWatch(m, { center: P, secs: 60, night });
      if (!won) m.fail('A raider got to the laddu! Phir se.');
      if (night >= 4) await m.say('tiger', 'Okay, okay. Our laddu is smaller. Respect.', { mood: 'happy' });
    }
    feed(30, 'Laddu prasadam. Energy +30.');
    m.money(1000);
  }
  /** W9 night watch: 3 raiders a wave from the edges at 30 u/s; the torch beam freezes them; ACTION within 14 u tags. */
  function nightWatch(m, o) {
    if (ff()) return Promise.resolve(true);
    const C = o.center || N.player;
    darkness(true, { cone: true, alpha: 0.9 });
    const W = { t: 0, lost: false, raiders: [], wave: 0, nextSpawn: 1, spawned: 0, secs: o.secs || 60, tagged: 0 };
    S.tag = W;
    const laddu = { x: C.x, y: C.y };
    S.labels.add({ target: laddu, text: 'LADDU', h: 4, dy: -8, color: '#f2c230', scale: 1 });
    const T = softTimer(W.secs, 'NIGHT WATCH');
    W.T = T;
    W.spawn = () => {
      const a = Math.random() * TAU;
      const p0 = walkable(laddu.x + Math.cos(a) * 150, laddu.y + Math.sin(a) * 120, 50);
      const look = W.spawned === 0 && o.night === 4 ? (lookOf('tiger') || randomLook('tiger', 'kid')) : randomLook('raider' + W.spawned, 'kid');
      const e = extra(p0.x, p0.y, look, { role: 'raider', speed: 30 });
      e.freeze = 0; e.back = 0;
      W.raiders.push(e);
      W.spawned++;
    };
    W.tick = (dt) => {
      if (mode() !== 'play') return;
      W.t += dt;
      W.nextSpawn -= dt;
      const live = W.raiders.filter((e) => e.alive && !e.tagged);
      if (W.nextSpawn <= 0 && W.t < W.secs - 4) {
        if (live.length === 0 && W.waveLeft == null) W.waveLeft = 3;
        if (W.waveLeft > 0) { W.spawn(); W.waveLeft--; W.nextSpawn = 2; if (W.waveLeft === 0) W.waveLeft = null; }
        else W.nextSpawn = live.length ? 1 : 4;
      }
      const p = N.player;
      const face = p.facing != null && isFinite(p.facing) ? p.facing : p.angle || 0;
      let near = null, nd = 14;
      for (const e of live) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        const toR = Math.atan2(e.y - p.y, e.x - p.x);
        const lit = d < 110 && Math.abs(U.angleDiff(face, toR)) < (35 * Math.PI) / 180;
        if (lit && e.freeze <= 0 && e.back <= 0) { e.freeze = 1; e.mark = '!'; sfx('kids', { ui: true, vol: 0.3 }); }
        if (e.freeze > 0) { e.freeze -= dt; e.tx = null; if (e.freeze <= 0) { e.mark = null; const ba = Math.atan2(e.y - laddu.y, e.x - laddu.x); e.moveTo(e.x + Math.cos(ba) * 20, e.y + Math.sin(ba) * 20, 30); e.back = 0.8; } }
        else if (e.back > 0) e.back -= dt;
        else e.moveTo(laddu.x, laddu.y, 30);
        if (Math.hypot(e.x - laddu.x, e.y - laddu.y) < 10) { W.lost = true; }
        if (d < nd) { nd = d; near = e; }
      }
      if (near) N.interact.offer({ label: 'Tag!', priority: 9, dist: 0, use: () => { near.tagged = true; near.mark = 'hehe'; sfx('kids', { ui: true, vol: 0.5 }); const ba = Math.atan2(near.y - laddu.y, near.x - laddu.x); near.moveTo(near.x + Math.cos(ba) * 120, near.y + Math.sin(ba) * 120, 50); near.life = 2.5; W.tagged++; } });
      widget({ label: 'NIGHT WATCH', value: null, text: 'TAGGED ' + W.tagged + ' · RAIDERS ' + live.length });
    };
    S.step = { kind: 'watch', skip: () => { W.t = W.secs; T.left = 0.01; } };
    return m.until(() => W.lost || (T.expired || !T.on) || W.t >= W.secs).then(() => {
      const won = !W.lost;
      T.stop(); darkness(false); widget(null);
      for (const e of W.raiders) { e.alive = false; S.extras.delete(e); }
      S.tag = null;
      S.labels.clear();
      return won;
    });
  }

  /* ================================================================ SA2 current_poyindi — Current Poyindi! */
  function festivalToday() {
    try {
      if (N.seasons && N.seasons.is) for (const k of ['sankranti', 'bonalu', 'ganesh_immersion', 'chand_raat', 'eid']) if (N.seasons.is(k)) return true;
    } catch (e) { /* ignore */ }
    return inMD('04-02', '04-02') || inMD('11-26', '11-26');
  }
  function powerCutTonight() {
    if (!isDone('last_man_batting')) return false;
    if (F().sa2_day === todayKey()) return false; // Nanna already fixed it tonight
    if (F().force_power_cut) return true;
    if (festivalToday()) return false;
    return U.hash2(todayKey() * 7 + 3, 1991) < 0.3;
  }
  function inColony() {
    try { const d = N.world.districtAt(N.player.x, N.player.y); const id = d && (d.id || d); return id === 'himayatnagar' || id === 'rtc_x'; } catch (e) { return false; }
  }
  async function sa2(m) {
    F().power_cut = true;
    darkness(true, { torch: !!(N.player.inventory && N.player.inventory.has('torch')), alpha: 0.88, r: 34 });
    npc(m, 'aunty_2', spot('kirana_1', -20, 10, 30), { idle: 'stand' });
    await m.talk([
      { s: 'aunty', t: '*Current poyindi!* Sreenivas-garu, *emaindi?!*', mood: 'shout' },
      { s: 'chinnu', t: 'Nanna is fixing it. He always fixes it. Then everybody forgets.' },
    ]);
    npc(m, 'agarwal', spot('kirana_1', 0, -6, 16), { idle: 'stand' });
    await m.goto('kirana_1', { label: 'Buy candles at the kirana (₹5).', r: 24 });
    await m.say('agarwal', 'Candles? Five rupees. Light one for your Nanna. He works in the dark so we don\'t sit in it.');
    money(m, -500, 'candles', 'amma');
    give(m, 'candles', 'Five candles');
    m.checkpoint('candles');
    // deliver one candle to five terraces in 90 s
    const R = roofs();
    let pts = [];
    try { const route = R && R.route ? R.route('lakshmi_lootna') : null; if (route && route.length >= 5) pts = route.slice(-5).map((r) => roofCentre(typeof r === 'string' ? R.get(r) : r)); } catch (e) { pts = []; }
    if (pts.length < 5) { const H = pos('home'); pts = []; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; pts.push(walkable(H.x + Math.cos(a) * 80, H.y + Math.sin(a) * 60, 30)); } }
    m.timer(90, 'CANDLES', { failMsg: 'The colony sat in the dark too long. Phir se.' });
    for (let i = 0; i < pts.length; i++) {
      await go(m, pts[i], { r: 18, label: 'Deliver a candle to five terraces (' + i + '/5).', route: i === 0, h: pts[i].h });
      candle(pts[i].x, pts[i].y);
      sfx('pickup', { ui: true, vol: 0.5 });
    }
    m.timer(null);
    // the antenna back toward the Doordarshan tower
    npc(m, 'cable_babji', spot('home', 20, 12, 30), { idle: 'stand' });
    await go(m, 'home_terrace', { label: 'Up on the home terrace: turn the antenna back to the Ramanthapur tower.', r: 18 });
    await m.say('cable_babji', 'Antenna fell again? *Thoda left*... the tower is that way, Ramanthapur, where the red light blinks... AARA!', { mood: 'shout' });
    const an = await game(m, 'antenna', { caller: 'babji', intro: 'So the Sunday film works when the power returns.' });
    if (!an || an.win === false) m.fail('Signal gaya! The antenna still points at the water tank. Phir se.');
    // power returns
    F().power_cut = false;
    darkness(false);
    sfx('cooker', { ui: true, vol: 0.5 });
    npc(m, 'nanna', spot('home', 14, 6, 30), { idle: 'stand' });
    await m.say('nanna', 'Current came. Who is watching TV without me?', { mood: 'happy' });
    m.money(500);
    give(m, 'toffee', 'A toffee');
    const runs = (F().sa2_runs | 0) + 1;
    F().sa2_runs = runs;
    if (runs === 3) { give(m, 'torch', "Nanna's pocket torch"); m.toast('Nanna gives you his pocket torch. "Keep it. The current will go again."', 3600); }
  }

  /* ================================================================ SA3 sunday_mutton — Sunday Mutton Queue */
  async function sa3(m) {
    npc(m, 'nanna', spot('meat_shop_1', 18, 20, 30), { idle: 'stand' });
    await m.goto('meat_shop_1', { label: "Nanna's Sunday errand: the mutton queue.", r: 30 });
    await m.talk([
      { s: 'nanna', t: "Hold my place. I'm only going to discuss the score." },
      { s: 'uncle', t: "Score? It's Sunday morning. There's no match." },
      { s: 'nanna', t: 'There is always a score.' },
    ]);
    despawn('nanna');
    m.checkpoint('queue');
    m.objective('Hold Nanna\'s place in the queue.');
    const q = queue(m, { at: 'meat_shop_1', ahead: 5, behind: 3, cutters: 2, label: 'SUNDAY QUEUE', seed: 'sa3' });
    await m.until(() => q.done);
    widget(null);
    npc(m, 'meat_man', spot('meat_shop_1', 0, -4, 16), { idle: 'work' });
    await m.say('meat_man', "Don't come inside, *baba*. Stand outside. I'll bring it.");
    give(m, 'mutton_parcel', 'The newspaper-wrapped parcel');
    // carry it home upright (light cargo)
    m.checkpoint('parcel');
    const C = cargo(m, { item: 'parcel', label: 'PARCEL', light: true, failLine: 'The parcel fell over. Nanna will have to queue again. Phir se.' });
    await m.goto('home', { label: 'Carry the parcel home upright.', r: 26 });
    C.stop();
    npc(m, 'chemist', spot('medical_shop_8', 0, -6, 16), { idle: 'work' });
    await m.goto('medical_shop_8', { label: "Pick up Ammamma's balm at the chemist.", r: 24 });
    await m.say('chemist', 'Vicks for Ammamma? And no, the Hajmola is not for Ammamma.', { mood: 'wink' });
    give(m, 'balm', "Ammamma's balm");
    npc(m, 'bakery_lady', spot('iyengar_bakery_1', 0, -6, 16), { idle: 'work' });
    await m.goto('iyengar_bakery_1', { label: 'Reward stop: the Iyengar bakery.', r: 24 });
    await m.say('bakery_lady', "Honey cake just out. Look at that jam! We're from Bangalore, you're from Hyderabad. Friends, but the cake isn't free.", { mood: 'happy' });
    feed(15, 'Honey cake. Energy +15.');
    m.money(500);
    const runs = (F().sa3_runs | 0) + 1;
    F().sa3_runs = runs;
    if (runs === 3) {
      npc(m, 'nanna', spot('dosa_bandi_1', 12, 8, 30), { idle: 'stand' });
      npc(m, 'dosa_man', spot('dosa_bandi_1', 0, -6, 16), { idle: 'work' });
      await m.goto('dosa_bandi_1', { label: 'Third Sunday: dosa breakfast with Nanna.', r: 26 });
      await m.talk([
        { s: 'dosa_man', t: 'Idli, vada, dosa: *tondaraga cheppandi!*' },
        { s: 'dosa_man', t: '*Karam podi* with ghee? A bit spicy.' },
        { s: 'nanna', t: '*Chuddam.*', mood: 'happy' },
      ]);
      feed(20, 'Dosa with Nanna. Energy +20.');
      F().dosa_with_nanna = true;
    }
  }

  /* ================================================================ SA4 six_balls — Six Balls (+ the LB Stadium final) */
  function nextDawn() {
    const C = N.calendar;
    if (!C) return null;
    let day = N.clock.day + (N.clock.minutes >= 6 * 60 ? 1 : 0);
    // the elastic week loop (systems §10.5): after D-1 comes D-7 again, never past the next main mission
    const L = N.clock.loop;
    if (L && isFinite(L.to) && isFinite(L.from) && day > L.to) day = L.from;
    const d = C.dateOf(day);
    return [d.y, d.m, d.d, 6, 0];
  }
  async function sa4(m) {
    npc(m, 'coach', spot('jawahar_bal_bhavan', 14, 8, 30), { idle: 'stand' });
    npc(m, 'ayesha', spot('jawahar_bal_bhavan', -6, 10, 30), { idle: 'stand' });
    await go(m, ['jawahar_bal_bhavan', 'fateh_maidan'], { label: 'The summer-camp notice board at Jawahar Bal Bhavan.', r: 30 });
    await m.talk([
      { s: 'coach', t: "Girls' batch is badminton." },
      { s: 'ayesha', t: "Girls' batch is badminton? Fine. I'll bowl with a racket.", mood: 'angry' },
    ]);
    // three dawn sessions on the Public Gardens back lawn: win two of three
    m.checkpoint('nets');
    const lawn = spot(['hide_public_gardens_tree', 'public_gardens'], 30, -20, 60);
    let wins = 0, losses = 0;
    for (let s = 1; s <= 3 && wins < 2 && losses < 2; s++) {
      const dawn = nextDawn();
      if (dawn && (s > 1 || N.clock.minutes < 5 * 60 + 30 || N.clock.minutes > 7 * 60 + 30)) await m.jumpTo(dawn, { fx: 'ff' });
      if (!ff()) { const L = lawn; if (L && dist(N.player, L) > 80) N.player.teleport(L.x, L.y + 20); }
      npc(m, 'ayesha', lawn ? { x: lawn.x, y: lawn.y - 30 } : 'public_gardens', { idle: 'stand' });
      await m.goto(lawn, { label: 'Dawn nets, session ' + s + ': bat against Ayesha (win two of three).', r: 30 });
      const r = await game(m, 'cricket', { bowler: 'ayesha', place: 'public_gardens', mali: true, intro: 'Dawn nets: bat against Ayesha. Dodge the mali.' });
      if (r && r.win !== false) { wins++; m.toast('Session ' + s + ': won (' + wins + '/2).', 2200); }
      else { losses++; m.toast('Session ' + s + ': Ayesha took your stumps.', 2200); }
      if (s === 1) await m.say('mali', '*Ghaas pe nakko!* ...Who taught that girl to bowl like that?', { mood: 'surprised' });
      if (s === 1) await m.say('ayesha', "Nobody. That's why it works.", { mood: 'wink' });
    }
    if (wins < 2) m.fail('Ayesha won two of three. Back to the nets at dawn.');
    // the six-ball challenge at the camp
    m.checkpoint('camp');
    npc(m, 'coach', spot('fateh_maidan', 0, 30, 40), { idle: 'stand' });
    await go(m, ['fateh_maidan', 'lb_stadium'], { label: 'The camp at Fateh Maidan: Ayesha bowls six balls at the best batsman.', r: 40 });
    await m.cutscene([
      { type: 'text', lines: ['Ball one: beaten outside off. Ball two: beaten again. Ball three: a thick edge, nobody there.', 'Ball four: a bouncer, ducked. Ball five: dot.'] },
      { type: 'sfx', name: 'bat_hit' },
      { type: 'text', lines: ['Ball six: full, fast, straight. The middle stump cartwheels.'] },
      { type: 'sfx', name: 'howzat' },
      { type: 'talk', lines: [
        { s: 'coach', t: '...Next year, there is a girls\' batch for cricket. You are its captain.' },
        { s: 'ayesha', t: 'This year.' },
        { s: 'coach', t: '...This year.' },
      ] },
    ]);
    F().ayesha_camp_badge = true;
    m.money(2000);
    m.toast("Ayesha's cap gets a camp badge.", 2600);
    // the LB Stadium cricket match: the Summer Camp Final under the floodlights
    at(17, 30);
    F().lb_match = true;
    onEnd(() => { F().lb_match = false; });
    m.checkpoint('final');
    npc(m, 'immu', spot('lb_stadium', -14, 18, 30), { idle: 'stand' });
    npc(m, 'ayesha', spot('lb_stadium', -24, 10, 30), { idle: 'stand' });
    npc(m, 'coach', spot('lb_stadium', -2, 22, 30), { idle: 'stand' });
    await m.goto('lb_stadium', { label: 'The Summer Camp Final at LB Stadium: under the floodlights.', r: 34 });
    await m.talk([
      { s: 'coach', t: 'Final is this evening. Under the lights. Colony XI against the Ashok Nagar boys. Your captain opens the bowling.' },
      { s: 'immu', t: 'LB Stadium. Real stumps. Real scoreboard. Agent Ayesha opens. Over.', mood: 'happy' },
    ]);
    const r = await playMatch(m, { home: 'chinnu_xi', away: 'ashok_nagar', overs: 3, time: 'evening', title: 'Summer Camp Final', intro: 'LB Stadium, under the lights. You and Immu open the batting; Ayesha opens the bowling.' });
    F().lb_match_unlocked = true;
    if (r && r.win) {
      sfx('crowd_cheer', { ui: true });
      await m.say('ayesha', '*Hau, ho jaata.*', { mood: 'happy' });
      give(m, 'camp_trophy', 'Summer Camp Final trophy');
    } else {
      await m.talk([{ s: 'tiger', t: 'Next year.' }, { s: 'ayesha', t: 'This year.' }]);
    }
    try { if (N.npcs && N.npcs.schedule) N.npcs.schedule('ayesha_nets', true); } catch (e) { /* ignore */ }
  }
  /** The exhibition match: replayable after SA4. */
  async function exhibition(m) {
    F().lb_match = true;
    onEnd(() => { F().lb_match = false; });
    npc(m, 'coach', spot('lb_stadium', -2, 22, 30), { idle: 'stand' });
    npc(m, 'ayesha', spot('lb_stadium', -20, 12, 30), { idle: 'stand' });
    npc(m, 'immu', spot('lb_stadium', -12, 20, 30), { idle: 'stand' });
    await m.goto('lb_stadium', { label: 'Exhibition match at LB Stadium.', r: 34 });
    const rivals = ['ashok_nagar', 'vidyanagar', 'nallakunta', 'saidabad', 'barkas'];
    const away = rivals[((F().lb_exhibitions | 0) + 1) % rivals.length];
    await m.say('coach', 'Exhibition match? Lights on, then. Chinnu XI, pads on.');
    const r = await playMatch(m, { home: 'chinnu_xi', away, overs: 3, time: 'evening', exhibition: true, title: 'Exhibition Match', intro: 'An exhibition under the LB floodlights. Ayesha and Immu are in your side.' });
    F().lb_exhibitions = (F().lb_exhibitions | 0) + 1;
    if (r && r.win) m.money(500);
  }

  /* ================================================================ registration */
  const MISSIONS = ['bo_kaata', 'lost_and_found', 'first_day_first_show', 'last_man_batting', 'right_right', 'ammammas_thursday'];
  const SIDES = ['pandal_duty', 'current_poyindi', 'sunday_mutton', 'six_balls', 'lb_exhibition'];
  // giver NPCs spawned beside the markers (bible §4 / §7)
  const GIVER_NPC = {
    last_man_batting: { id: 'amma', off: [16, 2] },
    right_right: { id: 'amma', off: [16, 2] },
    pandal_duty: { id: 'bunty', off: [14, 0], variant: 'committee' },
    current_poyindi: { id: 'aunty_2', off: [14, 0] },
    sunday_mutton: { id: 'nanna', off: [14, 2] },
    six_balls: { id: 'ayesha', off: [14, 2] },
    lb_exhibition: { id: 'coach', off: [14, 2] },
  };
  // After a mission ends the player often stands where the next giver is (home): that giver waits
  // until he has stepped away once, so nothing starts by accident on the 1 s J-card dwell.
  function stepOutOK(id) {
    const so = S.stepOut;
    if (!so) return true;
    const p = N.player;
    if (!p || Math.hypot(p.x - so.x, p.y - so.y) > 70) { S.stepOut = null; return true; }
    try { const d = N.missions.defs[id]; const g = d && N.missions.giverPos(d); if (g && Math.hypot(p.x - g.x, p.y - g.y) > ((d.giver && d.giver.r) || 14) + 36) return true; } catch (e) { return true; }
    return false;
  }
  function register() {
    const M = N.missions;
    if (!M || !M.register) return;
    const nearM2 = () => {
      const P = pos('mozamjahi_market');
      if (!P) return true;
      if (dist(N.player, P) < 380) return true;
      try { const A = N.hints && N.hints.active; if (A && A.id === 'lost_and_found' && A.taken && A.taken.some((t) => t.source === 'aunty' || t.source === 'auto')) return true; if (A && A.id === 'lost_and_found' && A.nudge >= 4) return true; } catch (e) { /* ignore */ }
      return false;
    };
    M.register({ id: 'bo_kaata', chapter: 1, giver: { place: 'home_terrace', r: 14 }, when: () => !!F().prologue_seen, reward: { money: 1000 }, script: m1 });
    M.register({ id: 'lost_and_found', chapter: 1, requires: ['bo_kaata'], giver: { place: 'mozamjahi_market', r: 18 }, when: nearM2, reward: { money: 1500 }, script: m2 });
    M.register({ id: 'first_day_first_show', chapter: 1, requires: ['lost_and_found'], giver: { place: 'home', r: 16 }, reward: { money: 1000 }, passText: 'Bunty-anna: "for your RX100 fund"',
      onBusted: () => { S.m3caught = true; const h = spot('home', 0, 14, 30); if (h) N.player.teleport(h.x, h.y); },
      script: m3 });
    M.register({ id: 'last_man_batting', chapter: 2, requires: ['first_day_first_show'], giver: { place: 'home', r: 16 }, reward: { money: 1000 }, script: m4 });
    M.register({ id: 'right_right', chapter: 2, requires: ['last_man_batting'], giver: { place: 'home', r: 16 }, reward: { money: 1000 },
      onBusted: () => { const s = S.m5step; if (s) N.player.teleport(s.x, s.y); },
      script: m5 });
    M.register({ id: 'ammammas_thursday', chapter: 2, requires: ['right_right'], giver: { npc: 'ammamma', place: 'home', r: 16 }, reward: { money: 1000 }, passText: 'Ammamma: "for the boy who carries flour without spilling"', script: m6 });
    // side activities (bible §7): kind 'side', windows, no autosave; none fail permanently
    M.register({ id: 'pandal_duty', kind: 'side', title: 'Pandal Duty', chapter: 'Side activity', requires: ['ammammas_thursday'], giver: { place: 'playground_1', r: 18 }, window: { from: '21:00', to: '23:30' },
      when: () => inMD('08-31', '09-08') && (F().pandal_nights | 0) < 4 && F().pandal_last_day !== todayKey(), autosave: false, help: true,
      onPass: () => {
        const f = F(); f.pandal_nights = (f.pandal_nights | 0) + 1; f.pandal_last_day = todayKey(); if (f.pandal_nights >= 4) f.tiger_helps_lorry = true; else N.missions.done.delete('pandal_duty');
        // a pandal night ends after the 21:30 curfew: the committee's boy walks home with Mummy's blessing
        // (wanted.js's curfew stays off until he is home or the night is over), not with Mummy at the gate
        if (!f.no_curfew) { f.no_curfew = 'pandal'; S.pandalGrace = todayKey(); }
      },
      script: sa1 });
    M.register({ id: 'current_poyindi', kind: 'side', title: 'Current Poyindi!', chapter: 'Side activity', requires: ['last_man_batting'], giver: { place: 'kirana_1', r: 18 }, window: { from: '19:00', to: '21:00' },
      when: () => powerCutTonight(), autosave: false,
      onPass: () => { F().sa2_day = todayKey(); N.missions.done.delete('current_poyindi'); },
      script: sa2 });
    M.register({ id: 'sunday_mutton', kind: 'side', title: 'Sunday Mutton Queue', chapter: 'Side activity', requires: ['lost_and_found'], giver: { place: 'meat_shop_1', r: 18 }, window: { from: '07:00', to: '09:30', dow: [0] },
      when: () => { const d = N.calendar && N.calendar.date; return !!d && (d.y > 2003 || d.m >= 2) && F().sa3_day !== todayKey(); }, autosave: false,
      onPass: () => { F().sa3_day = todayKey(); N.missions.done.delete('sunday_mutton'); },
      script: sa3 });
    M.register({ id: 'six_balls', kind: 'side', title: 'Six Balls', chapter: 'Side activity', requires: ['right_right'], giver: { place: 'jawahar_bal_bhavan', r: 18 }, window: { from: '05:30', to: '18:30' },
      when: () => inMD('04-26', '06-11'), autosave: false, script: sa4 });
    M.register({ id: 'lb_exhibition', kind: 'side', title: 'Exhibition Match', chapter: 'LB Stadium', requires: ['six_balls'], giver: { place: 'lb_stadium', r: 18 }, window: { from: '06:00', to: '20:00' },
      autosave: false, help: false, onPass: () => { N.missions.done.delete('lb_exhibition'); }, script: exhibition });
    for (const id of MISSIONS.concat(SIDES)) gateGiver(id);
  }
  /** Wrap a story giver's `when` with the step-out gate (once). story2.js's missions get it too (at boot),
   *  so no story giver starts by itself on the J-card dwell under a player who did not walk into it. */
  function gateGiver(id) {
    const M = N.missions, d = M && M.defs && M.defs[id];
    if (!d || d._stepGate) return;
    const w0 = d.when;
    d.when = () => stepOutOK(id) && (!w0 || w0());
    d._stepGate = true;
  }

  /* ================================================================ giver NPCs + free-roam power cuts */
  function giversTick(dt) {
    S.giverT -= dt;
    if (S.giverT > 0) return;
    S.giverT = 0.5;
    pandalGraceTick();
    if (!N.npcs || !N.npcs.spawn || !N.world || !N.world.built) return;
    let mk = [];
    try { mk = run() ? [] : (N.missions.markers() || []).filter((x) => x.kind === 'giver' && GIVER_NPC[x.id]); } catch (e) { mk = []; }
    const want = new Set();
    const p = N.player;
    for (const g of mk) {
      if (Math.hypot(g.x - p.x, g.y - p.y) > 640) continue;
      const spec = GIVER_NPC[g.id];
      const key = 'giver:' + g.id;
      want.add(key);
      if (!S.givers.has(key) || !N.npcs.get(key)) {
        try {
          if (spec.variant) setVariant(spec.id, spec.variant);
          const a = N.npcs.spawn(spec.id, walkable(g.x + spec.off[0], g.y + spec.off[1], 24), { key, idle: 'stand', talk: false, owner: 'story-giver' });
          if (a) { a.angle = a.baseAngle = Math.atan2(g.y - a.y, g.x - a.x); S.givers.set(key, a); }
        } catch (e) { N.err('story.giver', e); }
      }
    }
    for (const key of Array.from(S.givers.keys())) if (!want.has(key)) { despawn(key); S.givers.delete(key); }
  }
  function clearGivers() { for (const key of Array.from(S.givers.keys())) { despawn(key); S.givers.delete(key); } }
  function powerCutTick(dt) {
    S.pcT -= dt;
    if (S.pcT > 0) return;
    S.pcT = 1;
    if (run()) return;
    const m0 = N.clock ? N.clock.minutes : 0;
    const on = m0 >= 19 * 60 && m0 < 21 * 60 && powerCutTonight();
    if (on && !F().power_cut) { F().power_cut = true; if (inColony()) toast('*Current poyindi!* The colony goes dark.', 2600, 'power'); }
    if (!on && F().power_cut) F().power_cut = false;
    if (F().power_cut && inColony()) { if (!S.dark) darkness(true, { torch: !!(N.player.inventory && N.player.inventory.has('torch')), alpha: 0.82, r: 34 }); }
    else if (S.dark && !run()) darkness(false);
  }

  /* ================================================================ per-step tick */
  function tick(dt) {
    const p = N.player;
    // offers (press) and a running ride
    if (S.offers.size && mode() === 'play') for (const o of S.offers) N.interact.offer(o);
    if (S.ride) {
      const R = S.ride;
      if (!R.v || !R.v.alive) { endRide(true); }
      else {
        if (mode() === 'play') R.t += dt;
        p.x = R.v.x; p.y = R.v.y; p.vx = p.vy = 0; p.hidden = true; p.mode = 'busy';
        if (mode() === 'play' && N.input.pressed('action')) { N.input.consume('action'); R.skip = true; }
      }
    }
    timersTick(dt);
    queueTick(dt);
    cargoTick(dt);
    if (S.tag && S.tag.tick) S.tag.tick(dt);
    if (S.kiteTick && mode() === 'play') S.kiteTick(dt);
    if (S.tickFns) for (const fn of S.tickFns) { try { fn(dt); } catch (e) { N.err('story.tickFn', e); } }
    if (S.dark) S.dark.t += dt;
    if (mode() === 'play') { giversTick(dt); powerCutTick(dt); mountGuard(); }
    rings3d();
  }
  /** The roof rings (terrace goals: M1's kite and lootna, SA2's candles, the antenna...) are drawn by storyDraw in
   *  the top-down view only. In the 3D view (V) the mission's own markers are placed at roof height by
   *  view3d_actors, so each ring gets a real mission marker while 3D is on (removed again in 2D, where a ground
   *  marker would sit hidden under the building). */
  const ring3d = new Map(); // ring -> {run, id}
  function rings3d() {
    const r = run();
    const on = !!(N.view3d && N.view3d.active) && !!r && !r.ended && !!r.markers;
    for (const [rg, o] of ring3d) {
      if (on && S.rings.has(rg) && o.run === r) continue;
      try { if (o.run && o.run.markers) o.run.markers.delete(o.id); } catch (e) { /* ignore */ }
      ring3d.delete(rg);
    }
    if (!on) return;
    for (const rg of S.rings) {
      if (ring3d.has(rg)) continue;
      const id = 'st:ring3d:' + (++seq);
      r.markers.set(id, { target: rg.target, r: rg.r || 16, color: rg.color || '#ff5fb0', label: '' });
      ring3d.set(rg, { run: r, id });
    }
  }
  /** SA1's curfew grace (see its onPass) ends at home, at 05:00 or on another day. */
  function pandalGraceTick() {
    const f = F();
    if (f.no_curfew !== 'pandal') return;
    const p = N.player, h = pos('home');
    const m = N.clock ? N.clock.minutes : 0;
    const home = p && h && !p.level && Math.hypot(p.x - h.x, p.y - h.y) < 45;
    const night = m >= 20 * 60 || m < 5 * 60;
    const sameNight = S.pandalGrace == null || S.pandalGrace === todayKey() || (m < 5 * 60);
    if (home || !night || !sameNight) { delete f.no_curfew; S.pandalGrace = null; }
  }
  /** A mission cycle / Scooty waiting to be mounted beside a shop: ACTION must get on it, not open the shop card
   *  (shops sit at priority 3 over a parked vehicle's 0: Nanna's cycle at the girni is 20 u from the chemist,
   *  the hired cycle at Raju Cycle Taxi, Bunty's cycle at Paradise). While the player stands by an unmounted
   *  vehicle of the running mission (story.js or story2.js), shops.js's per-mission lock is on. */
  function mountGuard() {
    const r = run();
    if (!r) return;
    const p = N.player;
    let near = false;
    if (p && !p.vehicle && Array.isArray(r.spawned)) {
      for (const s of r.spawned) {
        const e = s && s.e;
        if (!e || e.kind !== 'vehicle' || e.alive === false || e.noEnter || e.locked || e.driver || !(e.T && e.T.kidOk)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) < 30) { near = true; break; }
      }
    }
    if (near) { if (!r.lockShops) r.lockShops = 'story:mount'; }
    else if (r.lockShops === 'story:mount') r.lockShops = false;
  }
  // pin the player in the queue after the player system moved him
  function pinTick() {
    const P = S.pin;
    if (!P || !S.queue) return;
    const p = N.player;
    p.x += (P.x - p.x) * 0.35; p.y += (P.y - p.y) * 0.35;
    p.vx = p.vy = 0;
    if (S.queue.C) p.angle = Math.atan2(S.queue.C.y - p.y, S.queue.C.x - p.x);
  }

  /* ================================================================ N.story */
  const Story = (N.story = N.story && typeof N.story === 'object' && !N.story.demo ? N.story : {});
  Object.defineProperty(Story, 'chapter', { configurable: true, enumerable: true, get() { return isDone('first_day_first_show') ? 2 : 1; } });
  Object.assign(Story, {
    part: 1,
    MISSIONS, SIDES, CLUES,
    prologue, begin: () => prologue(),
    replay(id) {
      // bible §9.5: "Any mission can be replayed from the Journal's track list": the mission itself plays again
      // on its own date (story2.js's runner brings the calendar back to today afterwards; the tape keeps 999).
      // Without that runner (or mid-mission) the track is played back from the tape instead.
      try {
        if (N.story2 && typeof N.story2.replay === 'function' && N.missions && N.missions.defs && N.missions.defs[id] && !N.missions.active && N.missions.isDone(id)) {
          if (N.story2.replay(id)) return Promise.resolve(true);
        }
      } catch (e) { N.err('story.replay', e); }
      const steps = [{ type: 'jcard', id, ms: 2600 }, { type: 'call', fn: () => { try { if (N.tape && N.tape.play) return N.tape.play(id); } catch (e) { N.err('story.replay', e); } return null; } }];
      try { if (N.menus && N.menus.cutscene) return N.menus.cutscene(steps, { id: 'replay' }); } catch (e) { N.err('story.replay', e); }
      return Promise.resolve(null);
    },
    kit: { npc, walkNpc, party, act, press, go, ride, rings, softTimer, queue, cargo, darkness, candle, findPlace, game, playMatch, chapterCard, money, at, pos, spot, extra, extraAt, wrapP, nightWatch },
    debug: {
      mg: null, mgTimeScale: null, fastRides: false,
      skip() { const s = S.step; if (s && s.skip) { s.skip(); return s.kind; } return null; },
      /** Runs every running soft timer out on the next tick (tests: M5's "AMMA COMES OUT" late branch without
       *  the four-minute wait). Returns how many timers it ended. */
      expire() { let n = 0; for (const T of S.timers) if (T.on && !T.expired) { T.left = 0.001; n++; } return n; },
      use() { for (const st of S.acts.values()) if (!st.used) { st.used = true; return true; } for (const o of S.offers) if (!o.used) { o.used = true; return true; } return false; },
      target() {
        if (S.step && S.step.target) { const p = pos(S.step.target); if (p) return { x: p.x, y: p.y }; }
        try {
          const mk = (N.missions.markers() || []).find((x) => x.kind === 'goal');
          if (mk) return { x: mk.x, y: mk.y };
        } catch (e) { /* ignore */ }
        for (const rg of S.rings) { const p = pos(rg.target); if (p) return { x: p.x, y: p.y, h: rg.h }; }
        for (const [id] of S.acts) { const I = N.interact.get(id); if (I && I.x != null) return { x: I.x, y: I.y }; }
        return null;
      },
      state() { return { step: S.step && S.step.kind, queue: S.queue ? { ps: S.queue.ps, done: S.queue.done, cut: S.queue.cut, sent: S.queue.sent, gap: !!S.queue.gap, tell: !!S.queue.tell, steps: S.queue.steps } : null, cargo: S.cargo ? Math.round(S.cargo.v) : null, ride: !!S.ride, dark: !!S.dark, givers: Array.from(S.givers.keys()), tag: S.tag ? { t: S.tag.t, tagged: S.tag.tagged, lost: S.tag.lost } : null }; },
      queue: () => S.queue, cargo: () => S.cargo, tag: () => S.tag,
    },
  });
  delete Story.demo; delete Story.DEMO_ID;

  /* ================================================================ wiring */
  N.on('game:new', (opts) => {
    cleanupAll();
    clearGivers();
    if (opts && opts.skipIntro) return;
    // an automated quick start (N.menus.quickStart: navigator.webdriver, the tests that click ▶ PLAY and expect
    // to be in the game) skips the prologue the way menus.js skips the name card; a test that drives the real
    // flow turns quickStart off (story_full, smoke, menus, story_part1's prologue phase). Players never have it.
    if (N.menus && N.menus.quickStart) return;
    // the prologue plays right away (menus calls newGame once the name card closes)
    if (mode() === 'play' && !run()) prologue();
  });
  for (const ev of ['mission:complete', 'mission:fail', 'mission:abort']) N.on(ev, () => { cleanupAll(); });
  // A ▶▶ / ◀◀ jump to another day (a mission's start date, a scene's next morning, a replay) leaves last night
  // behind: the Chappal Meter from before the jump (e.g. the curfew level after an SA1 pandal night at 22:00)
  // must not ride into the next afternoon's mission, where a 'frozen' meter policy would hold it all mission
  // long and hand it back after MISSION PASSED (found in the playthrough: M10 ended at Chappal Meter 1).
  // Days that pass normally in free roam keep the meter; a scripted (locked) meter is left alone.
  N.on('calendar:change', (d) => {
    try {
      if (!d || d.reason !== 'jump' || !d.prev || !d.date) return;
      if (d.prev.y === d.date.y && d.prev.m === d.date.m && d.prev.d === d.date.d) return;
      const W = wanted();
      if (W && (W.level | 0) > 0 && W.locked == null) wantedClear('sleep');
    } catch (e) { N.err('story.newday', e); }
  });
  N.on('mission:complete', () => { const p = N.player; if (p) S.stepOut = { x: p.x, y: p.y }; });
  N.on('mission:start', (d) => {
    cleanupAll(); clearGivers();
    if (d && (MISSIONS.indexOf(d.id) >= 0 || SIDES.indexOf(d.id) >= 0)) { S.sideWas = !!F().mg_side_off; F().mg_side_off = true; }
  });
  N.on('game:quit', () => { cleanupAll(); clearGivers(); });
  const reLook = () => { try { if (N.player && N.player.inventory && N.player.inventory.has('camera')) setVariant('chinnu', 'camera'); } catch (e) { /* ignore */ } };
  // CONTINUE puts him where the save was made, often right in the next giver's ring (MISSION PASSED at home
  // autosaves at home): that giver waits until he has stepped out once, instead of starting the next
  // mission by itself one second after the load.
  N.on('save:loaded', () => { cleanupAll(); clearGivers(); reLook(); const p = N.player; if (p) S.stepOut = { x: p.x, y: p.y }; });
  N.on('boot', () => {
    try { if (N.story2) for (const id of (N.story2.MISSIONS || []).concat(N.story2.SIDE || [])) gateGiver(id); } catch (e) { N.err('story.gate', e); }
    // M10's giver (Bunty at the colony pandal) and SA1's (Bunty, Committee President, same pandal) share
    // playground_1: on a pandal night (21:00-23:30, 31 Aug-8 Sep, a night still to guard) the ring is SA1's,
    // so the optional nights the bible puts "before" M10 can actually be played; M10 shows the rest of the day.
    try {
      const d = N.missions && N.missions.defs && N.missions.defs.agle_baras;
      if (d && !d._pandalGate) { const w0 = d.when; d.when = () => !pandalTonight() && (!w0 || w0()); d._pandalGate = true; }
    } catch (e) { N.err('story.gate', e); }
  });
  N.on('game:continue', reLook);

  N.addSystem({
    id: 'story', order: 11, runIn: ['play', 'dialogue', 'cutscene', 'minigame'],
    init() { registerHints(); register(); ensureCss(); },
    update: tick,
    draw: storyDraw,
    reset() { cleanupAll(); clearGivers(); },
  });
  N.addSystem({ id: 'storyPin', order: 21, runIn: ['play'], update: pinTick });
})();
