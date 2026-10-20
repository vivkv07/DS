/* NOSTALGIA — diwali_missions.js  (owner: Diwali story developer) — the Diwali-week side activities.
 *
 * Five side activities (bible §7 style: kind 'side', a giver, a window, checkpoints with fast-forward retry,
 * no autosave, nothing fails for good) plus the post-game "Diwali Week" J-card, as designed in the header of
 * src/diwali.js (owner-approved). The Diwali WORLD (stalls, fireworks, litter, haze, scared animals, the cracker
 * box) is src/diwali.js's; every call into N.diwali is feature-checked and has a small private fallback here.
 *
 *   pataakha_bazaar   Amma at `home`, 09:00-15:00, while `pataakha` (20-26 Oct) or `diwali` is on.
 *                     Amma's ₹100 + list -> the stall card at Sultan Bazaar (choose within the budget; Nanna's rule:
 *                     no bombs, more phuljhadis; haggle once) -> carry the box home on foot through the traffic
 *                     (BOX meter: bumps, near misses, running, riding). Fails: bombs ("He knows. (He doesn't.)"),
 *                     the box falls. Checkpoints 'stall', 'carry'. Reward: the box fills N.diwali.box.
 *   mithai_run        Amma at `home`, 15:00-17:45, `diwali` (diwali.js's home family takes the gate from 17:45). Five sweet boxes before Amma's puja (timer): Immu's
 *                     family at friend_home (Ammi: "Eid pe sevaiyan pakki!" -> N.flags.diwali_sevai_promise, which
 *                     story2.js's Eid morning card reads, "[diwali hook]"), Agarwal-ji (kirana_1), Ramulu-uncle
 *                     (pindi_girni_1), Lakshmamma (flower_cart_1), the gate aunties (the bench at playground_1),
 *                     then home before the bell. Checkpoint 'boxes'. Reward ₹10, prasadam, the jasmine.
 *   deepon_ki_raat    Ammamma (her verandah swing at `home`), 18:30-21:30, `diwali`. 21 diyas on the home_terrace
 *                     parapet before the evening breeze (timer). Gust fronts follow N.wind's direction (+ a scripted
 *                     wobble), are announced 2.6 s ahead and blow out the lit flames on the windward edge unless
 *                     Chinnu stands guard beside them; re-light them (hold E: strike the match; held while walking along
 *                     the parapet it lights one after another). Ammamma re-lights the ones by the stairs. The camera
 *                     closes in on the terrace (N.render.baseZoom) while the diyas are lit; they burn on all night.
 *                     Checkpoint 'terrace'. Reward: the terrace view of the city's fireworks (N.diwali.show) and a
 *                     clay diya for the tin.
 *   rocket_bunty      Bunty-anna at playground_1, 19:00-23:00, `diwali`. Bucket of water from the home tap first
 *                     (running spills it), the aim card (turn the bottle away from the houses: the card shows the
 *                     real colony around the ground), wait out the gust and light it together (hold E) -> the big
 *                     burst over the colony and the group photo (tin token). Fail: lighting in a gust (Bunty-anna
 *                     pinches the fuse). Checkpoint 'bucket'.
 *   tiger_ko_bachao   (optional) Immu at friend_home, 19:00-23:30, `diwali`. Tiger, the colony dog, hides from the
 *                     crackers: find him by his whimpers inside the search circle, comfort him (hold E), lead him
 *                     (walk; running makes him bolt = fail) past two far-away bangs to Nanna's quiet garage (the
 *                     Chetak's corner). Checkpoint 'found'. Tiger then sleeps on the gunny sack for the night.
 *   diwali_week       post-game only (N.flags.postgame, 10 Sep - 19 Oct 2003): Amma's "Diwali is next week" card at
 *                     `home` ▶▶s the calendar to Mon 20 Oct. It is a J-card, not a mission: it ends without a
 *                     MISSION PASSED banner and comes back after the next ◀◀ REWIND. (Played in the story already:
 *                     the same card with Amma's "Diwali again?" line; what was done stays done, nothing doubles.)
 * IN THE STORY (the chapter between Track 10 "Agle Baras" and the Sat 1 Nov interlude -> Track 11; not a numbered
 *   track): after Agle Baras the story goes to Mon 20 Oct 2003 (Amma and Ammamma's card), the calendar loops the
 *   week (Mon 20 - Sun 26) until Mithai Run and Deepon ki Raat are done (the other three stay optional and offered),
 *   Ammamma's swing at home holds the chapter's J-card ("Wait till Sat 25 Oct · 15:00 ▶▶" / "Wait till 18:30 ▶▶" /
 *   "Diwali's done: Sleep ▶▶"), the Clues page and the free-roam objective line carry the plan, then the outro and
 *   story2's interlude. See "Diwali week in the story" below (N.dwMissions.story).
 * Kid-safe (bible §1.5): an adult is always there, nothing is ever aimed at a person or an animal, the bangs that
 * scare Tiger are far away, nobody is hurt; a bomb in the basket is a funny fail, never a bang.
 *
 * API  N.dwMissions = {TUNE, IDS, ITEMS, season(name), state(), box() -> {id: n}, debug: {state(), skip(), ...},
 *        story: {blocks(), resume(), begin(), sleep(), state(), REQ, WEEK}}
 * Save section 'diwali_missions' {v, prog {per mission}, box (the fallback stash), tiger}. Flags written:
 *   diwali_sevai_promise, dw_bazaar_items, tiger_safe (day), dw_photo, dw_terrace, no_curfew ('diwali' grace),
 *   dw_story ('week' | 'done'), dw_back (the date to go back to, for a save made after the interlude).
 * Items given: amma_list, cracker_box, mithai_boxes, jasmine, bucket. Tin tokens: clay_diya, diwali_photo.
 * Private fallbacks (used only while N.diwali lacks them): fireworks (burst / rocket / bottle / show), the cracker stash
 *   (Chitti's snake tablets always: N.diwali.box keeps only phuljhadi chakri anaar rocket),
 *   the pataakha stall at Sultan Bazaar, the season test (pataakha 20-26 Oct, diwali 22-26 Oct 2003 when seasons.js
 *   has no such names), the whimper sound (a caption).
 * Hooks in files this module does not own (each marked "[diwali hook]"): index.html (script tag), story2.js (the
 *   Eid morning sevaiyan line, read from N.flags.diwali_sevai_promise). Marked "[diwali story]": story2.js (after
 *   Track 10 / on load: N.dwMissions.story.blocks() -> resume(); Last Bell's `when`; SEASONS.october in ◀◀ REWIND),
 *   storycore.js (DATES.diwali_week, DATES.deepavali).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.addSystem) return;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rr = (a, b) => a + Math.random() * (b - a);
  const F = () => N.flags || (N.flags = {});
  const mode = () => (N.state && N.state.mode) || 'boot';
  const run = () => (N.missions && N.missions.active) || null;
  const ff = () => { const r = run(); return !!(r && r.ff); };
  const nowT = () => (N.time && N.time.now) || 0;
  const isDone = (id) => { try { return !!(N.missions && N.missions.isDone(id)); } catch (e) { return false; } };
  const dayKey = () => (N.clock ? N.clock.day : 0);
  const IDS = ['pataakha_bazaar', 'mithai_run', 'deepon_ki_raat', 'rocket_bunty', 'tiger_ko_bachao', 'diwali_week'];
  const mineId = (id) => IDS.indexOf(id) >= 0;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rs = (p) => '₹' + (Math.round(p) % 100 ? (p / 100).toFixed(2) : String(Math.round(p) / 100));
  let seq = 0;

  /* ================================================================ tuning */
  const TUNE = {
    budget: 10000,               // Amma's ₹100 (paise)
    haggleOff: 1000, haggleMin: 6000,
    box: { bump: 20, bumpHard: 34, fall: 40, nearMiss: 7, nearD: 6, nearSpeed: 55, nearCool: 1.4, run: 14, ride: 18, bumpCool: 0.5 },
    diyas: 21, breezeSecs: 150, gustFirst: 6, gustEvery: [8, 11], gustWarn: 2.6, gustHit: 1.2, guardR: 10.5, gustDot: 0.5,
    gustWobble: 0.45, lightR: 7, diyaHold: 0.45, ammammaEvery: 10, ammammaR: 8,
    mithaiSecs: 120,
    bucketDrain: 34, bucketMin: 55,
    rocketGust: [3.4, 4.4], rocketCalm: [6, 8.5], lightHold: 0.8, aimSafe: 56,
    tigerR: 130, tigerFind: 16, comfortHold: 1.6, tigerRunR: 46, tigerRunSpeed: 58, tigerGap: 12, whimperEvery: 3.4,
    tigerCalm: 1.6, tigerStayR: 18,
  };

  /* ================================================================ the stall's goods (fictional, brand-free) */
  const ITEMS = [
    { id: 'phuljhadi', name: 'Phuljhadi', sub: '10 sparklers', price: 800, list: 3, max: 8, col: '#f2c230' },
    { id: 'chakri', name: 'Chakri', sub: '5 ground spinners', price: 1200, list: 2, max: 6, col: '#e0602a' },
    { id: 'anaar', name: 'Anaar', sub: 'flower pot', price: 1000, list: 2, max: 6, col: '#3a9a5a' },
    { id: 'rocket', name: 'Rockets', sub: 'pack of 5, for Bunty-anna', price: 1500, list: 1, max: 4, col: '#4a6fd8' },
    { id: 'snake', name: 'Saanp ki goli', sub: "snake tablets, Chitti's order", price: 500, list: 0, max: 4, col: '#6a5a7a' },
    { id: 'bijli', name: 'Bijli', sub: 'string of 10 bombs', price: 1000, list: 0, max: 4, bomb: true, col: '#c03030' },
    { id: 'dhamaka', name: 'Dhamaka bomb', sub: 'the big one', price: 1500, list: 0, max: 3, bomb: true, col: '#7a1f2b' },
  ];
  const ITEM = {}; for (const it of ITEMS) ITEM[it.id] = it;

  /* ================================================================ live + saved state */
  const ST = {
    prog: {},                    // saved: per-mission progress
    box: {},                     // saved: the fallback cracker stash (when N.diwali.box is missing)
    lastBuy: null, lastAim: null, // replayed by a retry's fast-forward
    cleanups: [], ticks: new Set(), draws: new Set(), offers: new Set(), acts: new Map(), holds: new Set(),
    givers: new Map(), giverT: 0, widget: null, panel: null, eatAction: false, step: null,
    stall: null, terrace: null, gust: null, rocket: null, tiger: null, tigerKeep: null, carry: null,
    stats: { blown: 0, saved: 0, gusts: 0, nearMiss: 0, bumps: 0, runHits: 0, gustLights: 0 },
    grace: null,
  };
  function onEnd(fn) { ST.cleanups.push(fn); }
  function everyTick(fn) { ST.ticks.add(fn); return () => ST.ticks.delete(fn); }
  function cleanupAll() {
    const list = ST.cleanups.splice(0);
    for (const fn of list.reverse()) { try { fn(); } catch (e) { N.err('dwm.cleanup', e); } }
    for (const id of ST.acts.keys()) { try { N.interact.remove(id); } catch (e) { /* ignore */ } }
    ST.acts.clear(); ST.offers.clear(); ST.holds.clear(); ST.ticks.clear(); ST.draws.clear();
    ST.step = null; ST.terrace = null; ST.gust = null; ST.rocket = null; ST.carry = null; ST.carried = null; ST.mithai = null;
    if (ST.panel) ST.panel.close(null);
    widget(null);
    try { if (N.hud && N.hud.searchCircle) N.hud.searchCircle('dwm:tiger', null); } catch (e) { /* ignore */ }
    const p = N.player;
    if (p) p.noRun = false;
    if (ST.tiger && ST.tiger !== ST.tigerKeep) { removeTiger(ST.tiger); }
    ST.tiger = ST.tigerKeep || null;
  }

  /* ================================================================ small helpers */
  function subst(s) {
    s = String(s == null ? '' : s);
    try { if (N.dialogue && typeof N.dialogue.subst === 'function') return N.dialogue.subst(s); } catch (e) { /* fall through */ }
    const nick = (N.player && (N.player.nick || N.player.name)) || 'Chinnu';
    return s.replace(/\{nick\}/g, nick);
  }
  const plain = (s) => subst(s).replace(/\*([^*]+)\*/g, '$1');
  function toast(t, ms, key) { if (ff()) return; try { if (N.hud && N.hud.toast) N.hud.toast(plain(t), ms || 2600, key ? { key } : undefined); } catch (e) { N.err('dwm.toast', e); } }
  function hasSfx(name) { try { const L = N.audio && N.audio.SFX_NAMES; return !!(L && L.indexOf(name) >= 0); } catch (e) { return false; } }
  function sfx(name, o) { if (ff()) return false; try { if (N.audio && N.audio.sfx && hasSfx(name)) return N.audio.sfx(name, o || { ui: true }); } catch (e) { /* audio never breaks a mission */ } return false; }
  function sfxOr(names, o) { for (const n of names) if (hasSfx(n)) return sfx(n, o); return false; }
  function caption(text, o) { try { if (N.hud && N.hud.caption) N.hud.caption(text, Object.assign({ always: true }, o || {})); } catch (e) { /* ignore */ } }
  function bark(target, text, secs) { if (ff()) return; try { if (N.dialogue && N.dialogue.bark) N.dialogue.bark(target, subst(text), { secs: secs || 3 }); } catch (e) { N.err('dwm.bark', e); } }
  function roofs() { return N.world && N.world.roofs && typeof N.world.roofs.get === 'function' ? N.world.roofs : null; }
  /** target -> {x, y}: place id | npc key | roof id | {x, y} | entity | function */
  function pos(t) {
    if (t == null) return null;
    if (typeof t === 'function') return pos(t());
    if (typeof t === 'string') {
      if (t === 'player') return N.player;
      const p = N.places && N.places[t]; if (p) return p;
      try { const a = N.npcs && N.npcs.get && N.npcs.get(t); if (a) return a; } catch (e) { /* stub */ }
      const R = roofs(); if (R) { const r = R.get(t); if (r) return { x: r.rect[0] + r.rect[2] / 2, y: r.rect[1] + r.rect[3] / 2, roof: r.id, h: r.h }; }
      return null;
    }
    if (typeof t === 'object' && t.alive !== false && isFinite(t.x) && isFinite(t.y)) return t;
    return null;
  }
  function walkable(x, y, r) {
    try { const f = N.world.findFree(x, y, 'walk', r || 40); if (f) return { x: f.x, y: f.y }; } catch (e) { /* ignore */ }
    return { x, y };
  }
  function spot(t, dx, dy, r) { const p = pos(t); if (!p) return null; return walkable(p.x + (dx || 0), p.y + (dy || 0), r); }
  const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity);
  function npc(m, id, target, o) {
    if (!N.npcs || !N.npcs.spawn) return null;
    let a = null;
    try { a = N.npcs.spawn(id, target, Object.assign({ idle: 'stand', talk: false }, o || {})); } catch (e) { N.err('dwm.npc', e); }
    if (a && m) { try { m.spawn(a); } catch (e) { N.err('dwm.npc.track', e); } }
    return a;
  }
  function despawn(key) { try { if (N.npcs && N.npcs.despawn) N.npcs.despawn(key); } catch (e) { /* ignore */ } }
  function face(key, t) { try { if (N.npcs && N.npcs.face) N.npcs.face(key, t); } catch (e) { /* ignore */ } }
  function emote(key, e, secs) { try { if (N.npcs && N.npcs.emote) N.npcs.emote(key, e, secs || 2); } catch (e2) { /* ignore */ } }
  function give(m, id, name) { if (ff()) return; try { m.give(id, name ? { name } : undefined); } catch (e) { N.err('dwm.give', e); } }
  /** Pay (paise < 0) / earn (> 0); paying never goes below ₹0 (story.js's kit pays the rest through a companion). */
  function money(m, paise, why, who) {
    if (!paise || ff()) return;
    const K = N.story && N.story.kit;
    if (K && typeof K.money === 'function') { try { K.money(m, paise, why, who || 'amma'); return; } catch (e) { N.err('dwm.money', e); } }
    if (paise > 0) { m.money(paise); return; }
    const take = Math.min(Math.max(0, N.player.money | 0), -paise);
    if (take > 0) m.money(-take);
  }
  function feed(n, why) { const p = N.player; if (!p || ff()) return; try { if (p.feed) p.feed(n, { quiet: true }); else p.energy = Math.min(100, (p.energy || 0) + n); } catch (e) { N.err('dwm.feed', e); } if (why) toast(why, 2400); }
  function compass(a) { const n = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']; return n[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; }
  function windDir() {
    const W = N.wind;
    try { if (W && isFinite(W.dir) && (W.strength || 0) > 0.04) return W.dir; } catch (e) { /* atmosphere optional */ }
    return -Math.PI * 0.25; // the October evening breeze off the Deccan: towards the north-east
  }

  /* ================================================================ the season (seasons.js "[diwali hook]" or the calendar) */
  function dateNow() { try { if (N.calendar && N.calendar.date) return N.calendar.date; } catch (e) { /* stub */ } return null; }
  function inOct(a, b) { const d = dateNow(); return !!d && d.y === 2003 && d.m === 10 && d.d >= a && d.d <= b; }
  function season(name) {
    const S = N.seasons;
    try { if (S && Array.isArray(S.ALL) && S.ALL.indexOf(name) >= 0) return !!S.is(name); } catch (e) { /* stub */ }
    const f = F()[name];
    if (f === true || f === false) return f;
    return name === 'pataakha' ? inOct(20, 26) : name === 'diwali' ? inOct(22, 26) : false;
  }
  const stallsOn = () => season('pataakha') || season('diwali');
  const diwaliOn = () => season('diwali');
  function postgame() { return !!(F().postgame || isDone('chand_raat')); }
  function inDates(a, b) { try { return !!(N.calendar && N.calendar.inRange(a, b)); } catch (e) { return false; } }
  const isNight = () => { const D = DW(); try { if (D && typeof D.isNight === 'function') return !!D.isNight(); } catch (e) { /* fall through */ } return !!(N.clock && N.clock.isNight && N.clock.isNight()); };

  /* ================================================================ N.diwali (feature-checked) + private fallbacks */
  const DW = () => N.diwali || null;
  function dwFn(name) { const D = DW(); return D && typeof D[name] === 'function' ? D[name].bind(D) : null; }
  // --- fallback fireworks (only while src/diwali.js has none): sparks + rockets, 2D
  const FX = { sp: [], rk: [], shows: [] };
  const FXC = ['#ffd24a', '#ff5a3a', '#4ad2ff', '#7aff6a', '#ff6ad8', '#ffffff', '#ffa030', '#b48aff'];
  function ownBurst(x, y, h, type, big) {
    big = big || 1;
    const n = Math.round(56 * big), sp = 42 * Math.sqrt(big), col = (Math.random() * 8) | 0;
    for (let i = 0; i < n && FX.sp.length < 900; i++) {
      const u = Math.random() * 2 - 1, ph = Math.random() * TAU, s = Math.sqrt(1 - u * u), k = sp * (0.8 + Math.random() * 0.2);
      const ring = type === 'ring';
      const vx = ring ? Math.cos((i / n) * TAU) * sp : s * Math.cos(ph) * k, vy = ring ? Math.sin((i / n) * TAU) * sp : s * Math.sin(ph) * k, vh = ring ? 0 : u * k;
      FX.sp.push({ x, y, h, vx, vy, vh, t: 0, life: rr(1.1, 1.8) * (type === 'willow' ? 1.6 : 1), col: type === 'multi' && i % 2 ? (col + 3) % 8 : col, g: type === 'willow' ? 9 : 26 });
    }
    sfxOr(['dw_burst', 'firework'], { x, y, vol: 0.8 });
  }
  function ownRocket(x, y, o) {
    o = o || {};
    FX.rk.push({ x, y, h: o.h || 2, vx: o.vx || rr(-5, 5), vy: o.vy || rr(-5, 5), vh: o.vh || rr(118, 140), t: 0, fuse: o.fuse || rr(1.1, 1.4), type: o.type || 'peony', big: o.big || 1 });
    sfxOr(['dw_rocket', 'firework'], { x, y, vol: 0.6 });
    return FX.rk[FX.rk.length - 1];
  }
  function fxTick(dt) {
    for (let i = FX.rk.length - 1; i >= 0; i--) {
      const r = FX.rk[i];
      r.t += dt; r.vh -= 30 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.h += r.vh * dt;
      if (FX.sp.length < 900) FX.sp.push({ x: r.x, y: r.y, h: r.h, vx: rr(-2, 2), vy: rr(-2, 2), vh: -6, t: 0, life: 0.45, col: 6, g: 0 });
      if (r.t >= r.fuse) { FX.rk.splice(i, 1); ownBurst(r.x, r.y, r.h, r.type, r.big); }
    }
    for (let i = FX.sp.length - 1; i >= 0; i--) {
      const s = FX.sp[i];
      s.t += dt;
      if (s.t >= s.life || s.h < 0) { FX.sp[i] = FX.sp[FX.sp.length - 1]; FX.sp.pop(); continue; }
      const f = Math.max(0, 1 - 1.6 * dt);
      s.vx *= f; s.vy *= f; s.vh = s.vh * f - s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.h += s.vh * dt;
    }
    for (let i = FX.shows.length - 1; i >= 0; i--) {
      const S = FX.shows[i];
      S.left -= dt; S.next -= dt;
      if (S.next <= 0) { S.next = rr(0.25, 0.7); const a = Math.random() * TAU, d = rr(120, 420); ownRocket(S.x + Math.cos(a) * d, S.y + Math.sin(a) * d, { type: ['peony', 'ring', 'willow', 'multi'][(Math.random() * 4) | 0], big: rr(0.8, 1.4) }); }
      if (S.left <= 0) FX.shows.splice(i, 1);
    }
  }
  function fxDraw() {
    if (!FX.sp.length) return;
    const R = N.render;
    R.queue('fx', 1, (ctx) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const s of FX.sp) {
        const k = R.k(Math.max(0, s.h)), X = R.sx(s.x, k), Y = R.sy(s.y, k);
        const a = clamp(1 - s.t / s.life, 0, 1);
        ctx.globalAlpha = a; ctx.fillStyle = FXC[s.col] || '#fff';
        ctx.fillRect(X - 1, Y - 1, 2, 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });
  }
  const fx = {
    burst(x, y, h, type, big) { const f = dwFn('burst'); if (f) { try { f(x, y, h, type, undefined, big); return; } catch (e) { N.err('dwm.burst', e); } } ownBurst(x, y, h, type, big); },
    rocket(x, y, o) { const f = dwFn('rocket'); if (f) { try { const r = f(x, y, Object.assign({ force: true }, o || {})); if (r) return r; } catch (e) { N.err('dwm.rocket', e); } } return ownRocket(x, y, o); },
    show(x, y, secs, o) { const f = dwFn('show'); if (f) { try { f(x, y, secs, o); return 'diwali'; } catch (e) { N.err('dwm.show', e); } } FX.shows.push({ x, y, left: secs || 10, next: 0 }); return 'own'; },
    scatter(x, y, n) { const f = dwFn('scatter'); if (f) { try { return f(x, y, n); } catch (e) { N.err('dwm.scatter', e); } } return null; },
    fireOK(x, y) { const f = dwFn('fireOK'); if (f) { try { return !!f(x, y); } catch (e) { N.err('dwm.fireOK', e); } } try { return !(N.respect && N.respect.at && N.respect.at(x, y)); } catch (e) { return true; } },
  };
  // --- the cracker stash: N.diwali.box when it is there, else our own (saved in our section)
  function boxApi() { const D = DW(); const B = D && D.box; return B && typeof B.add === 'function' ? B : null; }
  /** does N.diwali.box keep this kind? (its own kinds: phuljhadi chakri anaar rocket) */
  function boxTakes(B, k) {
    if (!B) return false;
    try { const it = typeof B.items === 'function' ? B.items() : B.items; if (it && typeof it === 'object' && !(it instanceof Map)) return k in it; } catch (e) { /* fall through */ }
    const D = DW(); return !!(D && Array.isArray(D.KINDS) ? D.KINDS.indexOf(k) >= 0 : true);
  }
  function boxAdd(items) {
    const B = boxApi();
    let where = 'own';
    for (const k in items) {
      const n = items[k] | 0; if (n <= 0) continue;
      if (boxTakes(B, k)) { try { B.add(k, n); where = 'diwali'; continue; } catch (e) { N.err('dwm.box', e); } }
      ST.box[k] = (ST.box[k] | 0) + n;
    }
    return where;
  }
  function boxCount(k) {
    const B = boxApi();
    if (B && boxTakes(B, k)) {
      try {
        if (typeof B.count === 'function') return B.count(k) | 0;
        const it = typeof B.items === 'function' ? B.items() : B.items;
        if (it instanceof Map) return it.get(k) | 0;
        if (it && typeof it === 'object') { const v = it[k]; return typeof v === 'number' ? v : (v && v.n) | 0; }
      } catch (e) { N.err('dwm.boxCount', e); }
    }
    return ST.box[k] | 0;
  }
  function boxAll() { const o = {}; for (const it of ITEMS) { const n = boxCount(it.id); if (n) o[it.id] = n; } return o; }

  /* ================================================================ CSS + DOM kit (HUD meter, stall card, aim card) */
  const CSS = `
.dwm-meter{display:none;align-items:center;gap:8px;margin:4px auto 0;padding:3px 10px;font-family:var(--font-osd,'VT323',monospace);font-size:18px;letter-spacing:1px;color:var(--osd,#f4ead8);text-shadow:2px 2px 0 var(--osd-shadow,#000);background:rgba(18,13,22,.74);border-radius:3px;white-space:nowrap;max-width:calc(100vw - 24px);width:max-content}
.dwm-meter.show{display:flex}.dwm-meter i{display:block;width:110px;height:9px;border:1px solid #1a1214;background:rgba(0,0,0,.35);border-radius:4px;overflow:hidden}
.dwm-meter b{display:block;height:100%;width:100%;background:#6fbf5a;transition:width .2s}.dwm-meter.low b{background:#e2483a}.dwm-meter.warn{color:#ffd24a}
.dwm-meter em{font-style:normal;color:#f2c230}
.dwm-panel{position:fixed;inset:0;z-index:35;display:flex;align-items:center;justify-content:center;background:rgba(10,7,14,.6);pointer-events:auto;padding:16px;opacity:0;transition:opacity .2s;font-family:var(--font-body,'Baloo 2',system-ui,sans-serif)}
.dwm-panel.show{opacity:1}
.dwm-card{position:relative;width:min(560px,94vw);max-height:90vh;overflow:auto;background:#f3ead2;color:#2a2018;border-radius:6px;padding:14px 16px 10px;box-shadow:0 10px 40px rgba(0,0,0,.55),inset 0 0 0 2px rgba(122,47,53,.25)}
.dwm-card h2{margin:0;font-family:var(--font-display,'Yatra One',serif);font-weight:400;color:#7a2f35;font-size:24px;letter-spacing:.5px}
.dwm-card .dwm-sub{margin:0 0 8px;color:#6a5a48;font-size:14px;line-height:1.25}
.dwm-card .dwm-sub i,.dwm-card .dwm-say i{font-style:normal;color:#7a2f35}
.dwm-rows{list-style:none;margin:0;padding:0}
.dwm-rows li{display:grid;grid-template-columns:14px 1fr auto 104px;gap:8px;align-items:center;padding:4px 8px;border-bottom:1px dashed #d8c8a0;font-size:15px;line-height:1.15;cursor:pointer}
.dwm-rows li .sw{width:12px;height:16px;border-radius:2px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3)}
.dwm-rows li b{font-weight:600}.dwm-rows li em{display:block;font-style:normal;color:#7a6a58;font-size:12px}
.dwm-rows li .pr{font-family:var(--font-osd,'VT323',monospace);font-size:19px;color:#4a3a2a}
.dwm-rows li .q{display:flex;align-items:center;justify-content:flex-end;gap:4px}
.dwm-rows li .q button{width:26px;height:24px;border:0;border-radius:4px;background:#7a5a2a;color:#ffe9b0;font-size:16px;line-height:1;cursor:pointer;touch-action:manipulation}
.dwm-rows li .q i{display:inline-block;min-width:22px;text-align:center;font:22px/1 var(--font-osd,'VT323',monospace);font-style:normal}
.dwm-rows li.bomb b{color:#9a2020}
.dwm-rows li.sel{background:rgba(122,47,53,.13);box-shadow:inset 3px 0 0 #ff5fb0}
.dwm-rows li.act{grid-template-columns:1fr auto;font-family:var(--font-osd,'VT323',monospace);font-size:20px;color:#7a2f35}
.dwm-rows li.act.off{color:#a89878;cursor:default}
.dwm-list{margin:8px 0 0;font-size:13px;line-height:1.5}
.dwm-list span{display:inline-block;margin-right:8px;white-space:nowrap}.dwm-list .ok{color:#2a7a3a}.dwm-list .no{color:#9a2020}
.dwm-total{display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 0;font:22px/1.1 var(--font-osd,'VT323',monospace)}
.dwm-total.over{color:#b02020}.dwm-total em{font-style:normal;font-size:16px;color:#6a5a48}
.dwm-say{margin:8px 0 0;min-height:1.3em;font-size:14px;color:#3a2a1a}
.dwm-hint{margin:8px 0 0;font-family:var(--font-osd,'VT323',monospace);font-size:17px;color:#7a2f35;text-align:right}
.dwm-aim{display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:center}
.dwm-aim canvas{width:240px;height:240px;image-rendering:pixelated;border-radius:4px;box-shadow:0 0 0 2px #7a5a2a;background:#2a2420}
.dwm-aim .dwm-aimtxt{flex:1;min-width:180px;font-size:14px;line-height:1.35}
.dwm-aim .dwm-aimtxt b{font-family:var(--font-osd,'VT323',monospace);font-size:22px;color:#7a2f35;font-weight:400}
@media (max-width:480px){.dwm-rows li{grid-template-columns:12px 1fr auto 92px;font-size:14px}.dwm-aim canvas{width:200px;height:200px}}
`;
  function ensureCss() {
    if (document.getElementById('dwm-css')) return;
    const s = document.createElement('style');
    s.id = 'dwm-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  /** The HUD meter (inside the HUD's top column, like story.js's cargo meter). spec {label, value, text, low, warn} | null */
  function widget(spec) {
    if (!spec) { if (ST.widget) ST.widget.classList.remove('show'); return; }
    ensureCss();
    const top = document.querySelector('#ui .hud-top');
    if (!ST.widget) { const e = document.createElement('div'); e.className = 'dwm-meter'; e.innerHTML = '<span></span><i><b></b></i><em></em>'; ST.widget = e; }
    const e = ST.widget;
    if (top && e.parentNode !== top) top.insertBefore(e, top.querySelector('.hud-toasts') || null);
    else if (!top && !e.parentNode) { const ui = document.getElementById('ui'); if (ui) ui.appendChild(e); }
    e.classList.add('show');
    e.querySelector('span').textContent = spec.label || '';
    const bar = e.querySelector('i');
    if (spec.value == null) bar.style.display = 'none';
    else { bar.style.display = ''; e.querySelector('b').style.width = clamp(spec.value, 0, 100) + '%'; }
    e.querySelector('em').textContent = spec.text || '';
    e.classList.toggle('low', !!spec.low);
    e.classList.toggle('warn', !!spec.warn);
  }
  /** A keyed modal card in #overlay. keys(k, e) gets 'up'|'down'|'left'|'right'|'action'|'h' from keydown (keyboard)
   *  or from N.input (pad / touch). Resolves with close(value). Holds the clock and locks the player meanwhile. */
  function panel(html, o) {
    ensureCss();
    o = o || {};
    if (ST.panel) ST.panel.close(null);
    const root = document.getElementById('overlay') || document.body;
    const el = document.createElement('div');
    el.className = 'dwm-panel' + (o.cls ? ' ' + o.cls : '');
    el.innerHTML = '<div class="dwm-card" role="dialog" aria-label="' + esc(o.label || 'card') + '">' + html + '</div>';
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const p = N.player, wasLocked = p ? !!p.controlsLocked : false;
    if (p) { p.controlsLocked = true; p.vx = p.vy = 0; }
    try { if (N.clock && N.clock.hold) N.clock.hold('dwm-card', true); } catch (e) { /* ignore */ }
    let resolve;
    const done = new Promise((r) => { resolve = r; });
    const KM = (N.input && N.input.KEYMAP) || {};
    const P = {
      el, done, keys: o.keys || null, opened: nowT(), closed: false,
      close(v) {
        if (P.closed) return; P.closed = true;
        if (ST.panel === P) ST.panel = null;
        window.removeEventListener('keydown', onDown, true);
        el.classList.remove('show');
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
        if (p && !wasLocked) p.controlsLocked = false;
        try { if (N.clock && N.clock.hold) N.clock.hold('dwm-card', false); } catch (e) { /* ignore */ }
        resolve(v);
      },
    };
    function onDown(e) {
      if (P.closed || ST.panel !== P) return;
      const md = mode();
      if (md !== 'play') return;
      let k = KM[e.code] || null;
      if (e.code === 'KeyH') k = 'h';
      if (!k || !/^(up|down|left|right|action|h)$/.test(k)) return;
      if (e.repeat && (k === 'action' || k === 'h')) return;
      if (k === 'action') ST.eatAction = true;
      e.preventDefault();
      if (P.keys) P.keys(k);
    }
    window.addEventListener('keydown', onDown, true);
    ST.panel = P;
    return P;
  }
  /** pad / touch reach the open card through N.input (the keyboard is read from keydown above) */
  function panelKeys() {
    const I = N.input;
    if (!I) return;
    if (ST.eatAction) { if (I.pressed('action')) I.consume('action'); ST.eatAction = false; }
    const P = ST.panel;
    if (!P || P.closed || mode() !== 'play' || I.device === 'keyboard') return;
    for (const k of ['up', 'down', 'left', 'right', 'action']) if (I.pressed(k)) { I.consume(k); if (P.keys) P.keys(k); }
  }

  /* ================================================================ mission kit: ACTION points, offers, holds */
  /** ACTION `label` at a target (marker + blip); resolves when used. */
  function act(m, target, label, o) {
    o = o || {};
    if (ff()) return Promise.resolve(true);
    const id = 'dwm:act:' + (++seq);
    const st = { used: false };
    const P = () => pos(target);
    const spec = {
      get x() { const q = P(); return q ? q.x : null; },
      get y() { const q = P(); return q ? q.y : null; },
      r: o.r || 16, priority: o.priority == null ? 7 : o.priority, label,
      use: () => { st.used = true; },
    };
    if (o.level) spec.level = o.level;
    N.interact.add(id, spec);
    ST.acts.set(id, st);
    const mk = o.marker === false ? null : m.marker(target, { r: o.mr || 14, color: o.color });
    const bl = o.blip === false ? null : m.blip(target, { color: o.color || '#ff5fb0', icon: 'star', pulse: true, route: o.route !== false });
    if (o.objective) m.objective(o.objective);
    const step = ST.step = { kind: 'act', id, label, target: P, use: () => { st.used = true; } };
    return m.until(() => st.used).then(() => {
      try { N.interact.remove(id); } catch (e) { /* ignore */ }
      ST.acts.delete(id);
      if (mk) m.unmarker(mk); if (bl) m.unblip(bl);
      if (ST.step === step) ST.step = null;
      return true;
    });
  }
  /** One of several ACTION points (any order): resolves with the key of the first one used. */
  function actAny(m, stops) {
    if (ff()) return Promise.resolve(stops[0] && stops[0].key);
    const made = [];
    let used = null;
    for (const s of stops) {
      const id = 'dwm:any:' + (++seq);
      const P = () => pos(s.target);
      N.interact.add(id, { get x() { const q = P(); return q ? q.x : null; }, get y() { const q = P(); return q ? q.y : null; }, r: s.r || 16, priority: 7, label: s.label, use: () => { if (!used) used = s.key; } });
      ST.acts.set(id, s); // removed with the run (a failed run's points must not shadow the retry's)
      made.push({ id, mk: m.marker(s.target, { r: 14 }), bl: m.blip(s.target, { color: '#ff5fb0', icon: 'star', pulse: true, route: false, label: plain(s.name || '') }) });
    }
    const step = ST.step = { kind: 'any', stops, use: (k) => { used = k || stops[0].key; } };
    return m.until(() => used).then(() => {
      for (const o of made) { try { N.interact.remove(o.id); } catch (e) { /* ignore */ } ST.acts.delete(o.id); m.unmarker(o.mk); m.unblip(o.bl); }
      if (ST.step === step) ST.step = null;
      return used;
    });
  }
  /** A per-step ACTION offer (no marker): {label | label(), when(), priority, use()} -> remove() */
  function offer(o) { ST.offers.add(o); return () => ST.offers.delete(o); }
  /** Hold ACTION near a target for `secs`: resolves true. o {label, near() -> bool, secs, meter label} */
  function holdAt(m, o) {
    if (ff()) return Promise.resolve(true);
    const H = { t: 0, secs: o.secs || 1, near: o.near, label: o.label, meter: o.meter || 'HOLD E', done: false, widget: o.widget };
    ST.holds.add(H);
    const step = ST.step = { kind: 'hold', use: () => { H.done = true; } };
    return m.until(() => H.done).then(() => { ST.holds.delete(H); widget(null); if (ST.step === step) ST.step = null; return true; });
  }
  function holdsTick(dt) {
    if (!ST.holds.size || mode() !== 'play') return;
    const I = N.input;
    for (const H of ST.holds) {
      if (H.done) continue;
      const near = H.near ? !!H.near() : true;
      if (!near) { if (H.t > 0) { H.t = Math.max(0, H.t - dt * 2); } continue; }
      N.interact.offer({ label: H.label, priority: 8, dist: 0, use: () => {} });
      if (I && I.down('action')) H.t += dt; else H.t = Math.max(0, H.t - dt * 2);
      if (H.t > 0 && H.widget !== false) widget({ label: H.meter, value: (H.t / H.secs) * 100, text: '' });
      if (H.t >= H.secs) H.done = true;
    }
  }
  /** A closer top-down camera for a small arena (the terrace, the bottle): N.render.baseZoom, restored when the run ends. */
  function camZoom(z) {
    const R = N.render;
    if (!R || ff()) return;
    if (ST.zoomWas == null) { ST.zoomWas = R.baseZoom || 1; onEnd(() => { if (ST.zoomWas != null && N.render) N.render.baseZoom = ST.zoomWas; ST.zoomWas = null; }); }
    R.baseZoom = z == null ? ST.zoomWas : z;
  }
  function lockShops(m, on) { try { const r = run(); if (r) r.lockShops = on ? 'dwm' : false; } catch (e) { /* ignore */ } }

  /* ================================================================ speakers, glossary */
  function defineCast() {
    try {
      if (N.npcs && N.npcs.define) {
        N.npcs.define('pataakha_man', {
          name: 'Pataakha-wala', full: 'The pataakha-wala, Sultan Bazaar', color: '#e0702a', voice: 0.92, speed: 40,
          look: { kind: 'man', skin: '#9a6040', hair: '#1a1412', shirt: '#e8dcc0', pants: '#4a4a52', moustache: true, towel: '#c03030' },
          portrait: { kind: 'man', skin: '#9a6040', hairStyle: 'oiled', moustache: 'thick', shirt: '#e8dcc0', collar: 'band', bg: '#3a2418' },
          lines: ['*Aao, aao!* Rocket, anaar, chakri, phuljhadi!', 'Diwali rate, best rate!'],
        });
      }
    } catch (e) { N.err('dwm.cast', e); }
    try {
      if (N.dialogue && N.dialogue.define) N.dialogue.define('tiger_dog', { name: 'Tiger', color: '#c8903e', portrait: dogPortrait, voice: 1.4 });
    } catch (e) { N.err('dwm.cast', e); }
  }
  function dogPortrait(ctx, w, h, mood) {
    const s = w / 48;
    const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.ceil(ww * s), Math.ceil(hh * s)); };
    R(0, 0, 48, 48, '#2a2034');
    R(0, 34, 48, 14, '#3a2a40');
    // ears, head, muzzle
    R(9, 10, 8, 14, '#8a5a2a'); R(31, 10, 8, 14, '#8a5a2a');
    R(13, 12, 22, 22, '#c8903e'); R(11, 16, 26, 16, '#c8903e');
    R(17, 24, 14, 12, '#f0dcb0'); R(20, 23, 8, 4, '#1a1412');
    const sad = mood === 'sad' || mood === 'worried';
    R(16, sad ? 18 : 17, 4, 4, '#1a1412'); R(28, sad ? 18 : 17, 4, 4, '#1a1412');
    R(17, sad ? 18 : 17, 1, 1, '#ffffff'); R(29, sad ? 18 : 17, 1, 1, '#ffffff');
    if (sad) { R(15, 15, 6, 1, '#6a4020'); R(27, 15, 6, 1, '#6a4020'); }
    R(22, 31, 4, mood === 'happy' ? 4 : 2, mood === 'happy' ? '#d8506a' : '#3a2010');
    R(14, 36, 20, 3, '#c03030'); R(23, 38, 3, 3, '#f2c230'); // the red collar and its bell
  }
  const GLOSS = {
    pataakha: 'Firecracker (also: a cheeky little kid)', 'pataakha-wala': 'The firecracker seller',
    phuljhadi: 'Sparkler (“flower shower”)', chakri: 'A ground spinner firework', anaar: 'Flower-pot fountain firework (also: pomegranate)',
    bijli: 'A string of small bangers (“lightning”)', diya: 'A small clay oil lamp', diyas: 'Small clay oil lamps', mithai: 'Sweets',
    sevaiyan: 'Vermicelli: the Eid sweet', pakki: 'Settled, for sure (pakka, for a she-word like sevaiyan)', shukriya: 'Thank you',
    'manchi abbayi': 'Good boy (Telugu)', hawa: 'Wind, breeze', sutli: 'Jute string (the box is tied with it)', agarbatti: 'Incense stick',
    'deepon ki raat': 'The night of lamps', 'kaju katli': 'Cashew fudge, the Diwali sweet', dhaam: 'BOOM!', 'aao, aao': 'Come, come! (the stall call)',
    'saanp ki goli': '“Snake tablets”: they burn into a grey snake of ash', bhaiyya: 'Elder brother (Hindi)', moora: 'A forearm’s length: jasmine is sold by it',
  };
  function addGlossary() {
    const G = N.dialogue && N.dialogue.glossary;
    if (!G) return;
    for (const k in GLOSS) {
      let known = false;
      try { known = !!(N.dialogue.gloss && N.dialogue.gloss(k) && N.dialogue.gloss(k).length === 1 && N.dialogue.gloss(k)[0][0] === k); } catch (e) { known = false; }
      if (!known && G[k] == null) G[k] = GLOSS[k];
    }
  }

  /* ================================================================ giver NPCs beside the yellow markers */
  const GIVER_NPC = {
    pataakha_bazaar: { id: 'amma', off: [16, 4] },
    mithai_run: { id: 'amma', off: [16, 4] },
    deepon_ki_raat: { id: 'ammamma', off: [0, 0], ifMissing: true },
    rocket_bunty: { id: 'bunty', off: [14, 2] },
    tiger_ko_bachao: { id: 'immu', off: [14, 4] },
    diwali_week: { id: 'amma', off: [16, 4] },
  };
  function giversTick(dt) {
    ST.giverT -= dt;
    if (ST.giverT > 0) return;
    ST.giverT = 0.5;
    if (!N.npcs || !N.npcs.spawn || !N.world || !N.world.built) return;
    let mk = [];
    try { mk = run() ? [] : (N.missions.markers() || []).filter((x) => x.kind === 'giver' && GIVER_NPC[x.id]); } catch (e) { mk = []; }
    const want = new Set(), p = N.player;
    for (const g of mk) {
      if (Math.hypot(g.x - p.x, g.y - p.y) > 640) continue;
      const sp = GIVER_NPC[g.id];
      if (sp.ifMissing) { try { if (N.npcs.get(sp.id)) continue; } catch (e) { /* ignore */ } }
      const key = 'dwgiver:' + g.id;
      want.add(key);
      if (!ST.givers.has(key) || !N.npcs.get(key)) {
        try {
          const a = N.npcs.spawn(sp.id, walkable(g.x + sp.off[0], g.y + sp.off[1], 24), { key, idle: 'stand', talk: false, owner: 'diwali-giver' });
          if (a) { a.angle = a.baseAngle = Math.atan2(g.y - a.y, g.x - a.x); ST.givers.set(key, a); }
        } catch (e) { N.err('dwm.giver', e); }
      }
    }
    for (const key of Array.from(ST.givers.keys())) if (!want.has(key)) { despawn(key); ST.givers.delete(key); }
  }
  function clearGivers() { for (const key of Array.from(ST.givers.keys())) { despawn(key); ST.givers.delete(key); } }

  /** What Chinnu carries on his head / in his arms (2D): the cracker box (it tilts as the BOX meter drops), the
   *  stack of sweet boxes. */
  function drawCarried() {
    const C = ST.carried, p = N.player, R = N.render;
    if (!C || !p || p.vehicle || (N.view3d && N.view3d.active) || !R.inView(p.x, p.y, 30)) return;
    R.queue('actors', p.y + 0.3, (ctx) => {
      const k = R.k(10.5), X = R.sx(p.x, k), Y = R.sy(p.y, k), s = Math.max(1, k);
      if (C.kind === 'box') {
        const v = C.v ? C.v() : 100, tilt = ((100 - v) / 100) * 0.5 * Math.sin((N.time.real || 0) * 9);
        ctx.save(); ctx.translate(X, Y - 2 * s); ctx.rotate(tilt);
        ctx.fillStyle = '#1a1214'; ctx.fillRect(-4.6 * s, -3.4 * s, 9.2 * s, 6.8 * s);
        ctx.fillStyle = '#d24d57'; ctx.fillRect(-4 * s, -2.8 * s, 8 * s, 5.6 * s);
        ctx.fillStyle = '#f2c230'; ctx.fillRect(-4 * s, -0.5 * s, 8 * s, 1 * s); ctx.fillRect(-0.5 * s, -2.8 * s, 1 * s, 5.6 * s);
        ctx.restore();
      } else if (C.kind === 'mithai') {
        const n = C.n ? C.n() : 5;
        for (let i = 0; i < n; i++) {
          const y0 = Y - 1 * s - i * 1.9 * s;
          ctx.fillStyle = '#1a1214'; ctx.fillRect(Math.round(X - 3.4 * s), Math.round(y0 - 1.3 * s), Math.ceil(6.8 * s), Math.ceil(2.4 * s));
          ctx.fillStyle = i % 2 ? '#f4ead8' : '#f2c230'; ctx.fillRect(Math.round(X - 3 * s), Math.round(y0 - 1 * s), Math.ceil(6 * s), Math.ceil(1.8 * s));
          ctx.fillStyle = '#d24d57'; ctx.fillRect(Math.round(X - 0.4 * s), Math.round(y0 - 1 * s), Math.ceil(0.8 * s), Math.ceil(1.8 * s));
        }
      }
    });
  }

  /* ================================================================ 1. pataakha_bazaar */
  function stallSpot() {
    const P = pos('sultan_bazaar') || pos('koti');
    if (!P) return null;
    const D = DW();
    let list = null;
    try {
      const a = D && typeof D.stalls === 'function' ? D.stalls() : null;
      if (Array.isArray(a)) list = a;
      else if (a && Array.isArray(a.list)) list = a.list;
      if (!list && D && D.layout && typeof D.layout.stalls === 'function') { const b = D.layout.stalls(); list = Array.isArray(b) ? b : b && Array.isArray(b.list) ? b.list : null; }
    } catch (e) { N.err('dwm.stalls', e); list = null; }
    let best = null, bd = 260;
    for (const s of list || []) {
      if (!s || !isFinite(s.x) || !isFinite(s.y)) continue;
      const d = Math.hypot(s.x - P.x, s.y - P.y) + (s.kind && s.kind !== 'bazaar' ? 120 : 0);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) {
      // the customer stands on the road side of the trestle table, the pataakha-wala behind it
      const fx = isFinite(best.fx) ? best.fx : 0, fy = isFinite(best.fy) ? best.fy : 1;
      const c = walkable(best.x + fx * 8, best.y + fy * 8, 10), v = walkable(best.x - fx * 5.5, best.y - fy * 5.5, 6);
      return { x: c.x, y: c.y, sx: best.x, sy: best.y, vx: v.x, vy: v.y, own: false, id: best.id, label: best.label };
    }
    // our own stall: on the bazaar's footpath / forecourt (never in the carriageway), the customer in front of it
    const W = N.world, SU = N.SURF;
    const ok = (x, y) => { try { const sf = W.surfaceAt(x, y); return (sf === SU.FOOTPATH || sf === SU.PLAZA || sf === SU.GROUND) && W.isWalkable(x, y); } catch (e) { return false; } };
    let pick = null;
    for (let r = 0; r <= 90 && !pick; r += 4) {
      for (let k = 0; k < Math.max(1, Math.round(r / 2)) && !pick; k++) {
        const a = (k / Math.max(1, Math.round(r / 2))) * TAU, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
        if (ok(x, y) && ok(x, y + 9) && ok(x - 9, y) && ok(x + 9, y)) pick = { x, y };
      }
    }
    const f = pick || walkable(P.x, P.y + 4, 30);
    const c = walkable(f.x, f.y + 9, 8);
    return { x: c.x, y: c.y, sx: f.x, sy: f.y - 1, vx: f.x, vy: f.y - 7, own: true };
  }
  function drawOwnStall(ctx, S) {
    const D = N.draw, x = S.sx, y = S.sy;
    D.box(x - 10, y - 4, 20, 8, 0, 6, { roof: '#8a6a3a', wall: '#6a4a2a' });
    const packs = ['#f2c230', '#e0602a', '#3a9a5a', '#4a6fd8', '#c03030', '#ff6ad8', '#f2c230', '#3a9a5a'];
    const R = N.render, k = R.k(6.2);
    for (let i = 0; i < 8; i++) {
      const px = x - 8.5 + (i % 4) * 4.4, py = y - 2.8 + Math.floor(i / 4) * 3.6;
      ctx.fillStyle = packs[i]; ctx.fillRect(Math.round(R.sx(px, k)), Math.round(R.sy(py, k)), Math.max(2, Math.round(3.2 * k)), Math.max(2, Math.round(2.6 * k)));
    }
    D.box(x - 12, y - 6, 24, 12, 13, 14, { roof: '#d24d57', wall: '#a03040', roofFn: (c, kk, X, Y, W, H) => { c.fillStyle = '#f4ead8'; for (let i = 0; i < 6; i += 2) c.fillRect(X + (W / 6) * i, Y, W / 6, H); } });
    if (isNight()) R.lights.push({ x, y, r: 34, color: '#ffd890', intensity: 0.9, h: 12 });
    try { N.draw.pixelText(x, y - 8, 15, 'PATAAKHA', '#f2c230', { scale: 1, shadow: '#1a1214' }); } catch (e) { /* ignore */ }
  }
  /** The stall card: choose within Amma's budget. Resolves {items, total, haggled, bombs, sum}. */
  function stallCard(m) {
    if (ff()) return Promise.resolve(ST.lastBuy || { items: { phuljhadi: 3, chakri: 2, anaar: 2, rocket: 1 }, total: 8300, sum: 8300, haggled: false, bombs: false });
    const q = {}; for (const it of ITEMS) q[it.id] = 0;
    const rows = ITEMS.length + 2; // + haggle + pay
    let sel = 0, haggled = false, say = 'Pataakha-wala: “<i>Aao, aao!</i> Diwali rate, best rate!”';
    const sum = () => ITEMS.reduce((a, it) => a + q[it.id] * it.price, 0);
    const total = () => Math.max(0, sum() - (haggled ? TUNE.haggleOff : 0));
    const bombs = () => ITEMS.some((it) => it.bomb && q[it.id] > 0);
    const listOk = () => ITEMS.every((it) => q[it.id] >= it.list);
    const ruleOk = () => ITEMS.every((it) => it.id === 'phuljhadi' || q.phuljhadi > q[it.id]);
    const html = '<h2>Pataakha stall · Sultan Bazaar</h2>' +
      '<p class="dwm-sub">Amma\'s <i>₹100</i>. Nanna\'s rule: <i>no bombs, more phuljhadis</i>.</p>' +
      '<ul class="dwm-rows">' + ITEMS.map((it, i) => '<li data-i="' + i + '" class="' + (it.bomb ? 'bomb' : '') + '"><span class="sw" style="background:' + it.col + '"></span><span><b>' + esc(it.name) + '</b><em>' + esc(it.sub) + '</em></span><span class="pr">' + rs(it.price) + '</span><span class="q"><button type="button" data-d="-1" aria-label="less">−</button><i>0</i><button type="button" data-d="1" aria-label="more">+</button></span></li>').join('') +
      '<li class="act" data-act="haggle"><span>Haggle (once)</span><span>H</span></li><li class="act" data-act="pay"><span class="pay">Pay</span><span>E</span></li></ul>' +
      '<div class="dwm-list"></div><div class="dwm-total"><span class="t"></span><em></em></div><p class="dwm-say"></p>' +
      '<p class="dwm-hint">↑↓ choose · ←→ how many · H haggle · E pay</p>';
    let P = null;
    const render = () => {
      const el = P.el;
      el.querySelectorAll('.dwm-rows li').forEach((li, i) => li.classList.toggle('sel', i === sel));
      ITEMS.forEach((it, i) => { el.querySelector('li[data-i="' + i + '"] .q i').textContent = String(q[it.id]); });
      const t = total(), over = t > TUNE.budget;
      el.querySelector('.dwm-list').innerHTML = 'Amma\'s list: ' + ITEMS.filter((it) => it.list).map((it) => '<span class="' + (q[it.id] >= it.list ? 'ok' : 'no') + '">' + (q[it.id] >= it.list ? '✓' : '·') + ' ' + esc(it.name) + ' ×' + it.list + '</span>').join('') +
        '<span class="' + (ruleOk() ? 'ok' : 'no') + '">' + (ruleOk() ? '✓' : '·') + ' more phuljhadis</span>';
      const tot = el.querySelector('.dwm-total');
      tot.classList.toggle('over', over);
      tot.querySelector('.t').textContent = 'TOTAL ' + rs(t) + ' / ₹100' + (haggled ? '  (−₹10)' : '');
      tot.querySelector('em').textContent = over ? rs(t - TUNE.budget) + ' over Amma\'s budget' : 'change ' + rs(TUNE.budget - t);
      const hg = el.querySelector('li[data-act="haggle"]');
      hg.classList.toggle('off', haggled);
      hg.firstChild.textContent = haggled ? 'Haggled (once is the rule)' : 'Haggle (once)';
      const pay = el.querySelector('li[data-act="pay"]');
      const ok = canPay();
      pay.classList.toggle('off', !ok);
      pay.querySelector('.pay').textContent = ok ? 'Pay ' + rs(t) + ' ▶' : over ? 'Over budget' : !listOk() ? 'Amma\'s list first' : 'Nanna\'s rule: more phuljhadis';
      el.querySelector('.dwm-say').innerHTML = say;
    };
    const canPay = () => total() <= TUNE.budget && listOk() && ruleOk() && sum() > 0;
    const change = (i, d) => {
      const it = ITEMS[i]; if (!it) return;
      const n = clamp(q[it.id] + d, 0, it.max);
      if (n === q[it.id]) return;
      q[it.id] = n;
      sfx('ui_select');
      if (it.bomb && d > 0) say = 'Pataakha-wala: “' + esc(it.name) + '? For you? ...Your Nanna knows?”';
      else if (d > 0 && total() > TUNE.budget) say = 'Pataakha-wala: “That is more than your Amma gave, <i>bhaiyya</i>.”';
      render();
    };
    const haggle = () => {
      if (haggled) { say = 'Pataakha-wala: “One haggle per customer. Sultan Bazaar rule.”'; render(); return; }
      if (sum() < TUNE.haggleMin) { say = 'Pataakha-wala: “Haggle? For less than sixty rupees? Buy something first, <i>bhaiyya</i>.”'; render(); return; }
      haggled = true; sfx('coin');
      say = 'Pataakha-wala: “Haggle? On Diwali? ...Okay. Ten rupees off, because your Amma buys here every year. Once only.”';
      render();
    };
    const pay = () => {
      if (!canPay()) { sfx('ui_back'); say = total() > TUNE.budget ? 'Pataakha-wala: “Amma gave hundred. Not hundred and ' + Math.ceil((total() - TUNE.budget) / 100) + '.”' : !listOk() ? 'Pataakha-wala: “Your Amma\'s list says more, <i>bhaiyya</i>. Read it again.”' : 'Pataakha-wala: “Your Nanna\'s rule: more phuljhadis than anything. I know your Nanna.”'; render(); return; }
      const items = {}; for (const it of ITEMS) if (q[it.id]) items[it.id] = q[it.id];
      P.close({ items, total: total(), sum: sum(), haggled, bombs: bombs() });
    };
    P = panel(html, {
      label: 'Pataakha stall', cls: 'dwm-stall',
      keys: (k) => {
        if (k === 'up') { sel = (sel + rows - 1) % rows; sfx('ui_click'); }
        else if (k === 'down') { sel = (sel + 1) % rows; sfx('ui_click'); }
        else if (k === 'left' && sel < ITEMS.length) return change(sel, -1);
        else if (k === 'right' && sel < ITEMS.length) return change(sel, 1);
        else if (k === 'h') return haggle();
        else if (k === 'action') { if (sel < ITEMS.length) return change(sel, 1); if (sel === ITEMS.length) return haggle(); return pay(); }
        render();
      },
    });
    P.el.querySelectorAll('.dwm-rows li').forEach((li, i) => {
      li.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        sel = i;
        if (b && b.dataset.d) return change(i, +b.dataset.d);
        if (li.dataset.act === 'haggle') return haggle();
        if (li.dataset.act === 'pay') return pay();
        render();
      });
    });
    ST.cardState = () => ({ q: Object.assign({}, q), sel, haggled, total: total(), canPay: canPay(), bombs: bombs() });
    onEnd(() => { P.close(null); ST.cardState = null; });
    render();
    return m.until(() => P.closed).then(() => { ST.cardState = null; return P.done; });
  }
  /** The BOX meter: bumps, near misses, running and riding shake it; at 0 the box falls (mission fails). */
  function boxMeter(m) {
    const B = { v: 100, on: true, cool: new WeakMap(), bumpT: 0, fallen: false, t: 0 };
    if (ff()) { B.on = false; B.stop = () => {}; return B; }
    const p = N.player;
    const hit = (n, why, line) => {
      if (!B.on || B.fallen) return;
      let mul = 1;
      try { if (N.settings && N.settings.diff) mul *= N.settings.diff('cargoDamage') || 1; } catch (e) { /* ignore */ }
      B.v = Math.max(0, B.v - n * mul);
      if (line) toast(line, 1600, 'dwm:box');
      if (B.v <= 0) {
        B.fallen = true; B.on = false;
        sfx('crash', { ui: true, vol: 0.5 });
        fx.scatter(p.x, p.y, 30);
        setTimeout(() => { const r = run(); if (r && r.id === 'pataakha_bazaar' && !r.ended) N.missions.fail('The box fell! Phuljhadis all over the road. Walk, don\'t run. Phir se.'); }, 0);
      }
    };
    B.hit = hit;
    const onBump = (d) => {
      if (!B.on || !d || B.bumpT > 0) return;
      const pv = p.vehicle;
      const me = d.ped === p || d.a === p || d.b === p || (pv && (d.a === pv || d.b === pv || d.vehicle === pv));
      if (!me) return;
      const sp = d.speed || 0;
      if (sp < 18 && !d.vehicle) return;
      B.bumpT = TUNE.box.bumpCool;
      ST.stats.bumps++;
      if (d.vehicle && d.ped === p) hit(TUNE.box.fall, 'bump', 'A vehicle! The box nearly flies!');
      else hit(sp > 55 ? TUNE.box.bumpHard : TUNE.box.bump, 'bump', 'Bump! Careful with the box!');
      sfx('bump', { ui: true, vol: 0.4 });
    };
    const onFall = () => { if (B.on) hit(TUNE.box.fall, 'fall', 'Down you go... the box too!'); };
    N.on('bump', onBump); N.on('player:fall', onFall);
    const offT = everyTick((dt) => {
      if (!B.on || mode() !== 'play') return;
      B.t += dt; B.bumpT = Math.max(0, B.bumpT - dt);
      const v = p.vehicle;
      const sp = v ? Math.abs(v.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0);
      if (v && sp > 8) { hit(TUNE.box.ride * dt, 'ride'); if (!B.rideWarn) { B.rideWarn = true; toast('A cracker box on a cycle? It slides! Walk it home.', 2600, 'dwm:box'); } }
      else if (!v && p.running && sp > 55) { hit(TUNE.box.run * dt, 'run'); ST.stats.runHits += dt; if (!B.runWarn || B.t - B.runWarn > 4) { B.runWarn = B.t; toast('Running shakes the anaars! Walk.', 1800, 'dwm:box'); } }
      // near misses: a fast vehicle brushing past
      try {
        const near = N.entities.query(p.x, p.y, 40, (e) => e.kind === 'vehicle' && e !== v && e.alive !== false);
        for (const e of near) {
          if (Math.abs(e.speed || 0) < TUNE.box.nearSpeed) continue;
          const d = N.vehicles.distTo ? N.vehicles.distTo(e, p.x, p.y) : Math.hypot(e.x - p.x, e.y - p.y) - 10;
          if (d > TUNE.box.nearD) continue;
          const c = B.cool.get(e) || 0;
          if (B.t - c < TUNE.box.nearCool && c) continue;
          B.cool.set(e, B.t);
          ST.stats.nearMiss++;
          hit(TUNE.box.nearMiss, 'near', 'Near miss! The box rattles.');
          sfx('chappal_whoosh', { ui: true, vol: 0.4 });
        }
      } catch (e) { N.err('dwm.near', e); }
      widget({ label: 'BOX', value: B.v, text: String(Math.round(B.v)), low: B.v < 45 });
    });
    B.stop = () => { B.on = false; offT(); N.off('bump', onBump); N.off('player:fall', onFall); widget(null); ST.carried = null; };
    ST.carried = { kind: 'box', v: () => B.v };
    ST.draws.add(drawCarried);
    onEnd(() => B.stop());
    ST.carry = B;
    return B;
  }
  async function bazaar(m) {
    const f = F();
    lockShops(m, true);
    npc(m, 'amma', spot('home', 16, 4), { idle: 'stand' });
    npc(m, 'nanna', spot('home', -14, 8), { idle: 'stand' });
    npc(m, 'chitti', spot('home', 4, 16), { idle: 'stand' });
    await m.talk([
      { s: 'amma', t: '{nick}, hundred rupees. Count it. And the list: three phuljhadi, two chakri, two anaar, and one packet of rockets for Bunty-anna.' },
      { s: 'nanna', t: 'And my rule. No bombs. More phuljhadis.' },
      { s: 'chinnu', t: 'Not even one small *bijli*, Nanna?' },
      { s: 'nanna', t: '*Chuddam.* ...No.' },
      { s: 'chitti', t: 'And *saanp ki goli* for me! The snake ones! *Mummy ki cheppesta* if you forget!' },
      { s: 'amma', t: 'Sultan Bazaar, the stalls by the bangle shops. And walk back slowly. Crackers don\'t like bumping. Neither do I.' },
    ]);
    m.money(TUNE.budget);
    give(m, 'amma_list', 'Amma\'s list (and ₹100)');
    lockShops(m, false);
    const S = ST.stall = stallSpot();
    if (!S) m.fail('Sultan Bazaar is not on this map. Phir se.');
    if (S.own) ST.draws.add(drawStallQueue);
    await m.goto(S, { label: 'Sultan Bazaar: find the pataakha stall.', r: 22 });
    m.checkpoint('stall');
    lockShops(m, true);
    npc(m, 'pataakha_man', { x: S.vx, y: S.vy }, { idle: 'work' });
    face('pataakha_man', 'player');
    await m.say('pataakha_man', '*Aao, aao!* Rocket, anaar, chakri, phuljhadi! Diwali rate, best rate!');
    m.objective('Buy Amma\'s list within ₹100. Nanna\'s rule: no bombs, more phuljhadis.');
    const buy = await stallCard(m);
    if (!buy) m.fail('Not now? The stall waits. Phir se.');
    if (buy.bombs) {
      await m.talk([
        { s: 'pataakha_man', t: 'Bombs also? For you? ...Your Nanna knows?' },
        { s: 'chinnu', t: 'He knows.' },
        { s: 'narrator', t: '(He doesn\'t.)' },
        { s: 'pataakha_man', t: 'Arre, I know your Nanna. Thursday he comes, he buys only phuljhadis. *Wapas jao*, read the list again.' },
      ]);
      m.fail('He knows. (He doesn\'t.) Nanna\'s rule: no bombs, more phuljhadis.');
    }
    ST.lastBuy = buy;
    money(m, -buy.total, 'crackers', 'amma');
    sfx('cash');
    give(m, 'cracker_box', 'A box of crackers, tied with sutli');
    await m.say('pataakha_man', buy.haggled ? 'Box is tied with *sutli*. Ten rupees less and one advice free: don\'t run.' : 'Box is tied with *sutli*. Don\'t run, don\'t drop. Crackers don\'t like bumping.');
    lockShops(m, false);
    m.checkpoint('carry');
    const B = boxMeter(m);
    await m.goto('home', { label: 'Carry the box home. Walk: bumps, near misses and running shake it.', r: 24, onFoot: true });
    const left = Math.round(B.v);
    B.stop();
    npc(m, 'amma', spot('home', 16, 4), { idle: 'stand' });
    npc(m, 'nanna', spot('home', -14, 8), { idle: 'stand' });
    const lines = [
      { s: 'amma', t: 'Show. Phuljhadi, chakri, anaar... rockets for Bunty. Nothing that goes DHAAM. *Manchi abbayi.*' },
      { s: 'nanna', t: 'More phuljhadis than anything else. *Chuddam*... Good.' },
    ];
    if (left < 50) lines.push({ s: 'amma', t: 'A little shaken. Like your Nanna on the Chetak in the rain.' });
    if (buy.items.snake) lines.push({ s: 'chitti', t: 'SNAKE TABLETS! Annayya is the best Annayya!' });
    const change = TUNE.budget - buy.total;
    if (change >= 100) lines.push({ s: 'amma', t: 'Keep the change. ' + rs(change) + '. Diwali.' });
    await m.talk(lines);
    const where = boxAdd(buy.items);
    f.dw_bazaar_items = Object.assign({}, buy.items);
    ST.prog.pataakha_bazaar = { day: dayKey(), items: Object.assign({}, buy.items), total: buy.total, haggled: !!buy.haggled, box: left, stash: where };
    toast('Into the cracker box: ' + Object.keys(buy.items).map((k) => ITEM[k].name + ' ×' + buy.items[k]).join(', '), 3400);
  }
  function drawStallQueue() { const S = ST.stall; if (!S || !S.own) return; const R = N.render; if (!R.inView(S.sx, S.sy, 60)) return; R.queue('structures', R.distKey ? R.distKey(S.sx, S.sy) : 0, (ctx) => drawOwnStall(ctx, S)); }

  /* ================================================================ 2. mithai_run */
  async function mithai(m) {
    lockShops(m, true);
    npc(m, 'amma', spot('home', 16, 4), { idle: 'stand' });
    await m.talk([
      { s: 'amma', t: 'Five boxes, {nick}. Kaju katli, mysore pak, laddu. One each: Immu\'s Ammi, Agarwal-ji, Ramulu-uncle, Lakshmamma, and the aunties at the gate.' },
      { s: 'amma', t: 'And back before the puja. The bell rings when the bell rings.' },
      { s: 'chinnu', t: 'Can I eat one box?' },
      { s: 'amma', t: 'You can carry five boxes.' },
    ]);
    give(m, 'mithai_boxes', 'Five boxes of sweets');
    lockShops(m, false);
    m.checkpoint('boxes');
    lockShops(m, true);
    const bench = spot('playground_1', -12, -22, 20) || spot('playground_1', 0, -20);
    const STOPS = [
      { key: 'immu', name: 'Immu\'s family', target: spot('friend_home', 0, 14, 24) || 'friend_home', label: 'Give the sweets to Immu\'s Ammi' },
      { key: 'agarwal', name: 'Agarwal-ji', target: spot('kirana_1', 0, 10, 20) || 'kirana_1', label: 'Give the sweets to Agarwal-ji' },
      { key: 'ramulu', name: 'Ramulu-uncle', target: spot('pindi_girni_1', 0, 10, 20) || 'pindi_girni_1', label: 'Give the sweets to Ramulu-uncle' },
      { key: 'lakshmamma', name: 'Lakshmamma', target: spot('flower_cart_1', 0, 10, 20) || 'flower_cart_1', label: 'Give the sweets to Lakshmamma' },
      { key: 'aunties', name: 'the gate aunties', target: bench, label: 'Give the sweets to the aunties' },
    ];
    const T = m.timer(TUNE.mithaiSecs, 'PUJA', { failMsg: 'The puja bell rang before the last box. Amma\'s look says: phir se.' });
    const done = [];
    ST.mithai = { done, stops: STOPS };
    ST.carried = { kind: 'mithai', n: () => 5 - done.length };
    ST.draws.add(drawCarried);
    onEnd(() => { ST.carried = null; });
    const left = STOPS.slice();
    while (left.length) {
      m.objective('Deliver the sweets before Amma\'s puja (' + done.length + '/5): ' + left.map((s) => s.name).join(', ') + '.');
      const k = await actAny(m, left);
      const st = left.find((s) => s.key === k) || left[0];
      left.splice(left.indexOf(st), 1);
      await deliver(m, st);
      done.push(st.key);
      sfx('pickup', { ui: true, vol: 0.5 });
    }
    ST.carried = null;
    m.objective('Home before the puja bell!');
    npc(m, 'amma', spot('home', 16, 4), { idle: 'stand' });
    await m.goto('home', { label: 'Home before the puja bell!', r: 24 });
    if (T && T.stop) T.stop();
    m.timer(null);
    await m.talk([
      { s: 'amma', t: 'All five? Before the bell? ...And jasmine! Lakshmamma spoils you.' },
      { s: 'amma', t: 'Wash your hands, {nick}. Puja.' },
    ]);
    sfxOr(['temple_bell', 'bell']);
    feed(20, 'Prasadam: a laddu from the puja plate. Energy +20.');
    m.money(1000);
    ST.prog.mithai_run = { day: dayKey(), done: done.slice(), left: Math.round((T && T.left) || 0) };
    lockShops(m, false);
  }
  async function deliver(m, st) {
    const P = pos(st.target);
    if (st.key === 'immu') {
      npc(m, 'ammi', walkable(P.x + 8, P.y - 6, 16), { idle: 'stand' });
      npc(m, 'immu', walkable(P.x - 8, P.y - 4, 16), { idle: 'stand' });
      face('ammi', 'player'); face('immu', 'player');
      await m.talk([
        { s: 'immu', t: 'Agent Immu receiving a package. Kaju katli. ...The package is now in my mouth. Over.' },
        { s: 'ammi', t: 'Tell Padma-aapa *shukriya*. And tell her: *Eid pe sevaiyan pakki!*' },
        { s: 'chinnu', t: '*Pakka*, aunty. I\'ll come with the biggest bowl in the colony.' },
      ]);
      m.flag('diwali_sevai_promise', true);
      emote('immu', '♪', 2);
    } else if (st.key === 'agarwal') {
      npc(m, 'agarwal', walkable(P.x, P.y - 8, 14), { idle: 'stand' });
      face('agarwal', 'player');
      await m.talk([
        { s: 'agarwal', t: '*Mithai* from Padma-garu! Tell Ramulu I got the bigger box. Bigger. Not smaller.' },
        { s: 'chinnu', t: 'They\'re the same size, uncle.' },
        { s: 'agarwal', t: 'Then tell him mine is bigger.' },
      ]);
    } else if (st.key === 'ramulu') {
      npc(m, 'ramulu', walkable(P.x, P.y - 8, 14), { idle: 'stand' });
      face('ramulu', 'player');
      await m.talk([
        { s: 'ramulu', t: 'Mysore pak! Agarwal says his box is bigger? Tell him mine is heavier. *Atta* on my hands, *beta*.' },
        { s: 'ramulu', t: 'And tell him... *Happy Deepavali*. But tell it small.' },
      ]);
    } else if (st.key === 'lakshmamma') {
      npc(m, 'flower_aunty', walkable(P.x, P.y - 8, 14), { idle: 'work' });
      face('flower_aunty', 'player');
      await m.say('flower_aunty', 'Sweets for me? Then take a *moora* of jasmine for your Amma\'s puja. Measured on my own arm. Never short.');
      give(m, 'jasmine', 'A moora of jasmine');
    } else {
      const b = pos(st.target);
      npc(m, 'aunty', walkable(b.x - 10, b.y - 6, 12), { idle: 'stand' });
      npc(m, 'aunty_2', walkable(b.x, b.y - 8, 12), { idle: 'stand' });
      npc(m, 'aunty_3', walkable(b.x + 10, b.y - 6, 12), { idle: 'stand' });
      for (const k of ['aunty', 'aunty_2', 'aunty_3']) face(k, 'player');
      await m.talk([
        { s: 'aunty', t: 'One box for the three of us?' },
        { s: 'aunty_2', t: 'Tell your Amma the laddus were perfect. Tell her we said so.' },
        { s: 'aunty_3', t: 'And tell her before the Naidus send theirs.' },
      ]);
    }
  }

  /* ================================================================ 3. deepon_ki_raat */
  /** 21 diya spots along the home terrace parapet (the floor's edge on the roof grid), skipping the plank gap
   *  and the stair head; each with the edge's outward normal (the gusts use it). */
  function diyaLayout() {
    const RF = roofs(), roof = RF && RF.get('home_terrace');
    const n = TUNE.diyas, out = [];
    if (!roof) {
      const P = pos('home_terrace') || pos('home');
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; out.push({ i, x: P.x + Math.cos(a) * 14, y: P.y + Math.sin(a) * 12, nx: Math.cos(a), ny: Math.sin(a), h: 0, lit: false, ph: Math.random() * TAU, t: 0 }); }
      return { list: out, h: 0, roof: null };
    }
    const [rx, ry, rw, rd] = roof.rect;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const plank = [];
    for (let j = -4; j <= rd + 4; j++) for (let i = -4; i <= rw + 4; i++) {
      const a = RF.at(rx + i + 0.5, ry + j + 0.5);
      if (!a) continue;
      if (a.plank) { plank.push([rx + i + 0.5, ry + j + 0.5]); continue; }
      if (a.roof && a.roof.id === 'home_terrace') { x0 = Math.min(x0, rx + i); y0 = Math.min(y0, ry + j); x1 = Math.max(x1, rx + i + 1); y1 = Math.max(y1, ry + j + 1); }
    }
    if (!(x1 > x0)) { x0 = rx; y0 = ry; x1 = rx + rw; y1 = ry + rd; }
    const inset = 1.6, X0 = x0 + inset, Y0 = y0 + inset, X1 = x1 - inset, Y1 = y1 - inset;
    const solids = roof.solids || [];
    const okPt = (x, y) => {
      const a = RF.at(x, y);
      if (!a || a.plank || !a.roof || a.roof.id !== 'home_terrace') return false;
      for (const s of solids) if (x > s[0] - 2 && x < s[0] + s[2] + 2 && y > s[1] - 2 && y < s[1] + s[3] + 2) return false;
      for (const q of plank) if (Math.abs(q[0] - x) < 3.5 && Math.abs(q[1] - y) < 3.5) return false;
      return true;
    };
    const pts = [];
    const step = 0.5;
    const edge = (ax, ay, bx, by, nx, ny) => {
      const L = Math.hypot(bx - ax, by - ay), k = Math.max(1, Math.round(L / step));
      for (let i = 0; i < k; i++) {
        const t = i / k, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        let cnx = nx, cny = ny;
        const cx = x - X0 < 2 ? -1 : X1 - x < 2 ? 1 : 0, cy = y - Y0 < 2 ? -1 : Y1 - y < 2 ? 1 : 0;
        if (cx && cy) { cnx = cx * Math.SQRT1_2; cny = cy * Math.SQRT1_2; }
        if (okPt(x, y)) pts.push({ x, y, nx: cnx, ny: cny });
      }
    };
    edge(X0, Y0, X1, Y0, 0, -1); edge(X1, Y0, X1, Y1, 1, 0); edge(X1, Y1, X0, Y1, 0, 1); edge(X0, Y1, X0, Y0, -1, 0);
    if (pts.length < n) return { list: out, h: roof.h, roof };
    for (let i = 0; i < n; i++) {
      const q = pts[Math.min(pts.length - 1, Math.round(((i + 0.5) * pts.length) / n))];
      out.push({ i, x: q.x, y: q.y, nx: q.nx, ny: q.ny, h: roof.h, lit: false, ph: Math.random() * TAU, t: 0, out: 0 });
    }
    return { list: out, h: roof.h || 0, roof, bb: [x0, y0, x1, y1] };
  }
  function litCount() { const T = ST.terrace; return T ? T.list.filter((d) => d.lit).length : 0; }
  function onTerrace() { const p = N.player; return !!p && (p.level === 'home_terrace' || !roofs()); }
  function nearestDiya(lit, r) {
    const T = ST.terrace, p = N.player;
    if (!T) return null;
    let best = null, bd = r || TUNE.lightR;
    for (const d of T.list) { if (d.lit !== lit) continue; const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  function lightDiya(d, who) {
    if (!d || d.lit) return;
    d.lit = true; d.t = 0; d.out = 0;
    sfxOr(['dw_crackle', 'paper'], { ui: true, vol: 0.25 });
    if (who !== 'ammamma') N.emit('dwm:diya', { i: d.i, lit: true });
  }
  function gustTick(dt) {
    const T = ST.terrace, G = ST.gust;
    if (!T || !G || mode() !== 'play') return;
    for (const d of T.list) { d.t += dt; if (d.out > 0) d.out = Math.max(0, d.out - dt); }
    G.t -= dt;
    if (G.phase === 'calm' && G.t <= 0) {
      G.phase = 'warn'; G.t = TUNE.gustWarn;
      G.dir = windDir() + rr(-TUNE.gustWobble, TUNE.gustWobble);
      ST.stats.gusts++;
      G.n++;
      toast('*Hawa!* A gust from the ' + compass(G.dir + Math.PI) + '. Stand on that side!', 2400, 'dwm:gust');
      caption('gust from the ' + compass(G.dir + Math.PI), { x: N.player.x - Math.cos(G.dir) * 90, y: N.player.y - Math.sin(G.dir) * 90 });
      sfxOr(['kite_wind'], { ui: true, vol: 0.6 });
    } else if (G.phase === 'warn' && G.t <= 0) {
      G.phase = 'hit'; G.t = TUNE.gustHit;
      const ux = -Math.cos(G.dir), uy = -Math.sin(G.dir), p = N.player;
      let blown = 0, saved = 0;
      for (const d of T.list) {
        if (!d.lit) continue;
        const dot = d.nx * ux + d.ny * uy;
        if (dot < TUNE.gustDot) continue;
        if (onTerrace() && Math.hypot(d.x - p.x, d.y - p.y) <= TUNE.guardR) { saved++; d.saved = 1; continue; }
        d.lit = false; d.out = 1.2; blown++;
      }
      ST.stats.blown += blown; ST.stats.saved += saved;
      G.last = { blown, saved, dir: G.dir };
      if (blown) { toast(blown + (blown === 1 ? ' diya' : ' diyas') + ' blown out. Light them again!' + (saved ? ' (You saved ' + saved + '.)' : ''), 2400, 'dwm:gust'); if (!G.told) { G.told = true; bark('ammamma', 'Stand in its way, *kanna*. A boy is a good wall.', 3); } }
      else if (saved) toast('You kept ' + saved + (saved === 1 ? ' flame' : ' flames') + ' alive!', 2000, 'dwm:gust');
      N.emit('dwm:gust', { blown, saved, dir: G.dir });
    } else if (G.phase === 'hit' && G.t <= 0) {
      G.phase = 'calm'; G.t = rr(TUNE.gustEvery[0], TUNE.gustEvery[1]);
      for (const d of T.list) d.saved = 0;
    }
    // Ammamma re-lights the ones by the stairs, at her own pace
    T.amT = (T.amT || TUNE.ammammaEvery) - dt;
    if (T.amT <= 0) {
      T.amT = TUNE.ammammaEvery;
      const a = N.npcs && N.npcs.get && N.npcs.get('ammamma');
      if (a && a.level === 'home_terrace') {
        let best = null, bd = TUNE.ammammaR + 8;
        for (const d of T.list) { if (d.lit) continue; const dd = Math.hypot(d.x - a.x, d.y - a.y); if (dd < bd) { bd = dd; best = d; } }
        if (best) { lightDiya(best, 'ammamma'); emote('ammamma', '♪', 1.5); }
      }
    }
    const n = litCount();
    widget({ label: 'DIYAS', value: (n / T.list.length) * 100, text: n + '/' + T.list.length + (G.phase === 'warn' ? '  HAWA!' : ''), warn: G.phase === 'warn' });
  }
  function drawTerrace() {
    const T = ST.terrace || ST.terraceKeep, R = N.render;
    if (!T || !T.list.length || (N.view3d && N.view3d.active)) return;
    const c = T.list[0];
    if (!R.inView(c.x, c.y, 120)) return;
    const night = (R.night || 0) > 0.05 || isNight();
    const t = N.time.real || 0;
    R.queue('sky', 0.5, (ctx) => {
      for (const d of T.list) {
        const k = R.k(d.h + 0.4), X = R.sx(d.x, k), Y = R.sy(d.y, k), s = Math.max(1, k);
        // a clay diya: a little shadowed bowl with a lighter rim (exaggerated to read at the game's scale)
        ctx.fillStyle = '#2a1208'; ctx.fillRect(Math.round(X - 1.1 * s), Math.round(Y - 0.3 * s), Math.ceil(2.2 * s), Math.ceil(0.9 * s));
        ctx.fillStyle = '#a8502a'; ctx.fillRect(Math.round(X - 0.9 * s), Math.round(Y - 0.6 * s), Math.ceil(1.8 * s), Math.ceil(0.8 * s));
        ctx.fillStyle = '#e09050'; ctx.fillRect(Math.round(X - 0.9 * s), Math.round(Y - 0.6 * s), Math.ceil(0.7 * s), Math.ceil(0.3 * s));
        if (d.lit) {
          const fl = 0.75 + 0.25 * Math.sin(t * 13 + d.ph) + (d.saved ? 0.2 * Math.sin(t * 40) : 0);
          const g = ctx.createRadialGradient(X, Y - 1.2 * s, 0, X, Y - 1.2 * s, 4.2 * s);
          g.addColorStop(0, 'rgba(255,200,90,' + (0.55 * fl).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,150,40,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y - 1.2 * s, 4.2 * s, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff8a20'; ctx.fillRect(Math.round(X - 0.45 * s), Math.round(Y - (1.6 + fl) * s), Math.ceil(0.9 * s), Math.ceil((1.1 + fl) * s));
          ctx.fillStyle = '#ffe070'; ctx.fillRect(Math.round(X - 0.25 * s), Math.round(Y - (1.3 + fl * 0.8) * s), Math.ceil(0.5 * s), Math.ceil((0.8 + fl * 0.7) * s));
        } else if (T.holdD === d && T.holdT > 0) {
          const k2 = Math.min(1, T.holdT / TUNE.diyaHold);
          ctx.fillStyle = 'rgba(255,220,120,' + (0.4 + 0.5 * k2).toFixed(2) + ')';
          ctx.fillRect(Math.round(X + (1.2 - k2) * 1.5 * s), Math.round(Y - (1.6 + (1 - k2)) * s), Math.ceil(0.6 * s), Math.ceil(0.9 * s));
        } else if (d.out > 0) {
          ctx.fillStyle = 'rgba(200,200,210,' + (d.out * 0.5).toFixed(2) + ')';
          ctx.fillRect(Math.round(X - 0.5 * s + (1.2 - d.out) * 3 * s), Math.round(Y - (2 + (1.2 - d.out) * 4) * s), Math.ceil(1 * s), Math.ceil(1 * s));
        }
      }
      const G = ST.terrace ? ST.gust : null;
      if (G && (G.phase === 'warn' || G.phase === 'hit')) {
        // wind streaks across the terrace + an arrow on the upwind parapet
        const bb = T.bb || [c.x - 16, c.y - 14, c.x + 16, c.y + 14];
        const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, dx = Math.cos(G.dir), dy = Math.sin(G.dir);
        const k = R.k(T.h + 3);
        ctx.strokeStyle = 'rgba(235,240,255,' + (G.phase === 'hit' ? 0.7 : 0.35) + ')'; ctx.lineWidth = 1;
        for (let i = -3; i <= 3; i++) {
          const off = ((t * (G.phase === 'hit' ? 70 : 30) + i * 17) % 60) - 30;
          const ox = cx - dx * 20 + -dy * i * 5 + dx * off, oy = cy - dy * 20 + dx * i * 5 + dy * off;
          ctx.beginPath(); ctx.moveTo(R.sx(ox, k), R.sy(oy, k)); ctx.lineTo(R.sx(ox + dx * 7, k), R.sy(oy + dy * 7, k)); ctx.stroke();
        }
        const ax = cx - dx * 24, ay = cy - dy * 24, X = R.sx(ax, k), Y = R.sy(ay, k), a = G.dir;
        ctx.save(); ctx.translate(X, Y); ctx.rotate(a);
        ctx.fillStyle = '#120d16'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = G.phase === 'hit' ? '#ffffff' : '#9fd8ff'; ctx.beginPath(); ctx.moveTo(5.5, 0); ctx.lineTo(-3.5, -4); ctx.lineTo(-1.6, 0); ctx.lineTo(-3.5, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    });
    if (night) {
      let i = 0;
      for (const d of T.list) { if (!d.lit) continue; if ((i++ % 2) === 0) R.lights.push({ x: d.x, y: d.y, r: 11, color: '#ffb050', intensity: 0.75, h: d.h }); }
    }
  }
  async function deepon(m) {
    const p = N.player;
    const am = N.npcs && N.npcs.get ? N.npcs.get('ammamma') : null;
    if (!am) npc(m, 'ammamma', spot('home', -30, -2), { idle: 'sit' });
    face('ammamma', 'player');
    await m.talk([
      { s: 'ammamma', t: 'Twenty-one diyas, *kanna*, on the terrace parapet. Before the evening breeze comes.' },
      { s: 'chinnu', t: 'Why twenty-one, Ammamma?' },
      { s: 'ammamma', t: 'Because twenty is too few and twenty-two is showing off.' },
      { s: 'ammamma', t: 'Lakshmi finds the house with the most light. The wind finds the house with the fewest walls. When it comes, stand where it comes from. A boy is a good wall.' },
    ]);
    give(m, 'diyas', 'Twenty-one clay diyas and a matchbox');
    if (roofs() && roofs().get('home_terrace') && p.level !== 'home_terrace') {
      m.objective('Up to the home terrace with the diyas (the stairs by the gate).');
      await m.goto('home_stairs', { label: 'Up to the home terrace with the diyas (the stairs by the gate).', r: 14 });
      m.objective('Go up the stairs (E).');
      await m.until(() => N.player.level === 'home_terrace');
    }
    // (the climb's short fade holds the controls; the viewpoint below must not inherit that lock)
    await m.until(() => !N.player.controlsLocked && N.player.mode !== 'busy', { timeout: 4 });
    // the terrace's viewpoint (collectibles W6: the camera pulls out over the colony lighting up) plays now, once a
    // day, instead of by itself in the gap after a failed try (where it would hold the controls under the retry card)
    try {
      const C = N.collectibles;
      if (!ff() && C && typeof C.viewpoint === 'function' && C.VIEWPOINTS && C.VIEWPOINTS.home_terrace) {
        let vpd = false;
        Promise.resolve(C.viewpoint('home_terrace')).then(() => { vpd = true; }, () => { vpd = true; });
        await m.until(() => vpd, { timeout: 6 });
        if (!ST.panel && N.player.controlsLocked && mode() === 'play') N.player.controlsLocked = false;
      }
    } catch (e) { N.err('dwm.viewpoint', e); }
    // Ammamma comes up and sits by the stair head
    const RF = roofs();
    const land = RF && RF.get('home_terrace') && RF.get('home_terrace').stairs ? RF.get('home_terrace').stairs[0] : null;
    npc(m, 'ammamma', land ? { x: land.tx - 4, y: land.ty + 1 } : spot('home_terrace', -6, 6), { idle: 'sit', roof: 'home_terrace', key: 'ammamma' });
    const T = ST.terrace = diyaLayout();
    ST.draws.add(drawTerrace);
    m.checkpoint('terrace');
    for (const d of T.list) d.lit = false;
    camZoom(1.8);
    m.objective('Light all ' + T.list.length + ' diyas on the parapet before the breeze (hold E by a diya). When a gust comes, stand guard on its side.');
    ST.gust = { phase: 'calm', t: TUNE.gustFirst, dir: windDir(), n: 0 };
    everyTick(gustTick);
    // strike the match and hold it to the wick (hold E); held while walking along the parapet, one after another
    T.holdT = 0;
    offer({
      priority: 8,
      when: () => onTerrace() && !!nearestDiya(false),
      label: () => 'Light the diya, hold E (' + litCount() + '/' + T.list.length + ')',
      use: () => {},
    });
    everyTick((dt) => {
      if (mode() !== 'play' || !ST.terrace) return;
      const d = onTerrace() ? nearestDiya(false) : null;
      const I = N.input;
      if (d && I && I.down('action')) {
        if (T.holdT <= 0) sfxOr(['dw_match', 'paper'], { ui: true, vol: 0.35 });
        T.holdT += dt; T.holdD = d;
        if (T.holdT >= TUNE.diyaHold) { lightDiya(d, 'you'); T.holdT = 0; }
      } else T.holdT = 0;
    });
    ST.step = { kind: 'diyas', use: () => { for (const d of T.list) d.lit = true; } };
    m.timer(TUNE.breezeSecs, 'BREEZE', { failMsg: 'The evening breeze came first. Ammamma strikes another match: phir se.' });
    await m.until(() => ST.terrace && litCount() >= ST.terrace.list.length);
    m.timer(null);
    ST.gust = null;
    widget(null);
    ST.offers.clear();
    sfxOr(['temple_bell', 'bell'], { ui: true, vol: 0.5 });
    await m.say('ammamma', 'Twenty-one. Now let the breeze come, *kanna*. Lakshmi will find this house.', { mood: 'happy' });
    camZoom(null);
    // the terrace view: later that evening, the whole city on its parapets
    if (N.clock && N.clock.minutes < 19 * 60 + 20 && !ff()) {
      const K = N.story && N.story.kit;
      try { if (N.shops && typeof N.shops.ffwd === 'function') { let ok = false; N.shops.ffwd(Math.round(19 * 60 + 20 - N.clock.minutes), { label: '▶▶ 19:20' }).then(() => { ok = true; }, () => { ok = true; }); await m.until(() => ok, { timeout: 8 }); } else N.clock.set(19, 20); } catch (e) { N.err('dwm.ffwd', e); }
      void K;
    }
    const H = pos('home_terrace') || pos('home');
    const showBy = fx.show(H.x, H.y - 40, 16);
    ST.prog.deepon_ki_raat = { day: dayKey(), lit: T.list.length, show: showBy };
    await m.cutscene([
      { type: 'camera', target: { x: H.x, y: H.y - 50 }, zoom: 0.62, ms: 1800 },
      { type: 'text', lines: ['From the terrace the whole city is on its parapets.', 'Rockets over Koti, over Abids, over the Old City. Somewhere a bijli string goes on and on.'], dim: 0.12, ms: 5200 },
      { type: 'say', s: 'ammamma', t: 'Every house in Hyderabad tonight is saying the same thing, *kanna*: we are here.' },
      { type: 'wait', ms: 3000 },
    ]);
    m.token('clay_diya', { name: 'A clay diya', desc: 'The twenty-first diya from the home terrace parapet, Deepavali 2003. Ammamma lit the first; you lit the last.' });
    m.flag('dw_terrace', dayKey());
    // the twenty-one burn on for the rest of the night
    ST.terraceKeep = { list: T.list.map((d) => Object.assign({}, d, { lit: true, out: 0, saved: 0 })), h: T.h, bb: T.bb, day: dayKey() };
  }

  /* ================================================================ 4. rocket_bunty */
  function launchSpot() {
    const P = pos('playground_1') || pos('playground_home');
    if (!P) return null;
    for (const [dx, dy] of [[0, 4], [6, 8], [-6, 8], [0, -6], [10, 0]]) {
      const f = walkable(P.x + dx, P.y + dy, 20);
      if (fx.fireOK(f.x, f.y)) return f;
    }
    return walkable(P.x, P.y, 20);
  }
  /** Eight bottle tilts round the launch spot: how far the open ground runs before the first house. */
  function aimOptions(L) {
    const W = N.world, SU = N.SURF, out = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - Math.PI / 2; // 0 = north, clockwise
      let d = 6;
      for (; d <= 130; d += 3) {
        const x = L.x + Math.cos(a) * d, y = L.y + Math.sin(a) * d;
        let sf = SU.GROUND;
        try { sf = W.surfaceAt(x, y); } catch (e) { sf = SU.GROUND; }
        if (sf === SU.SOLID || sf === SU.VOID) break;
      }
      out.push({ i, a, open: Math.min(130, d), name: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][i] });
    }
    const best = Math.max(...out.map((o) => o.open));
    for (const o of out) o.safe = o.open >= Math.min(TUNE.aimSafe, best * 0.95) && o.open >= best * 0.7;
    return out;
  }
  function aimCard(m, L) {
    if (ff()) return Promise.resolve(ST.lastAim || aimOptions(L).find((o) => o.safe));
    const opts = aimOptions(L);
    let sel = opts.reduce((a, o) => (o.open < opts[a].open ? o.i : a), 0); // the bottle starts the wrong way round
    let say = 'Bunty-anna: “Bottle on the ground. Now tilt it away from the houses: open sky, open ground.”';
    const html = '<h2>Aim the bottle</h2><p class="dwm-sub">A bottle rocket goes where the bottle points. Away from the houses, away from people.</p>' +
      '<div class="dwm-aim"><canvas width="96" height="96"></canvas><div class="dwm-aimtxt"><b class="dir"></b><p class="open"></p><p class="dwm-say"></p></div></div>' +
      '<p class="dwm-hint">←→ turn the bottle · E set it</p>';
    const P = panel(html, {
      label: 'Aim the bottle', cls: 'dwm-aimcard',
      keys: (k) => {
        if (k === 'left' || k === 'up') { sel = (sel + 7) % 8; sfx('ui_click'); }
        else if (k === 'right' || k === 'down') { sel = (sel + 1) % 8; sfx('ui_click'); }
        else if (k === 'action') {
          const o = opts[sel];
          if (!o.safe) { sfx('ui_back'); say = 'Bunty-anna: “' + (o.open < 30 ? 'Towards the Naidus\' window? Uncle will launch ME. Turn it.' : 'Still too close to the houses. More open ground, <i>mamu</i>.') + '”'; ST.stats.aimRefused = (ST.stats.aimRefused | 0) + 1; }
          else { sfx('ui_select'); P.close(o); return; }
        }
        render();
      },
    });
    const cv = P.el.querySelector('canvas'), g = cv.getContext('2d');
    // the real colony round the ground: 3 u per pixel
    const S = 3, HW = 48;
    const img = g.createImageData(96, 96), SU = N.SURF;
    const COL = {}; COL[SU.ROAD] = [90, 90, 96]; COL[SU.FOOTPATH] = [150, 146, 136]; COL[SU.GROUND] = [160, 128, 92]; COL[SU.GRASS] = [92, 122, 60]; COL[SU.PLAZA] = [176, 164, 136]; COL[SU.SOLID] = [196, 104, 58]; COL[SU.WATER] = [60, 120, 150]; COL[SU.SAND] = [200, 180, 130]; COL[SU.BRIDGE] = [110, 110, 110];
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
      let sf = SU.GROUND;
      try { sf = N.world.surfaceAt(L.x + (i - HW) * S, L.y + (j - HW) * S); } catch (e) { sf = SU.GROUND; }
      const c = COL[sf] || [40, 36, 32], o = (j * 96 + i) * 4;
      const sh = sf === SU.SOLID && ((i + j) % 7 === 0) ? 0.82 : 1;
      img.data[o] = c[0] * sh; img.data[o + 1] = c[1] * sh; img.data[o + 2] = c[2] * sh; img.data[o + 3] = 255;
    }
    const render = () => {
      g.putImageData(img, 0, 0);
      const o = opts[sel], cx = HW, cy = HW;
      // flight line
      g.strokeStyle = o.safe ? 'rgba(120,255,140,0.9)' : 'rgba(255,90,70,0.95)'; g.setLineDash([2, 2]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(o.a) * (o.open / S), cy + Math.sin(o.a) * (o.open / S)); g.stroke(); g.setLineDash([]);
      // the bottle + the rocket stick
      g.save(); g.translate(cx, cy); g.rotate(o.a);
      g.fillStyle = '#2a6a3a'; g.fillRect(-3, -2, 6, 4); g.fillStyle = '#5ab070'; g.fillRect(3, -1, 3, 2);
      g.fillStyle = '#e8dcc0'; g.fillRect(4, -0.5, 9, 1); g.fillStyle = '#c03030'; g.fillRect(12, -1.5, 4, 3);
      g.restore();
      // the wind
      const wd = windDir();
      g.save(); g.translate(86, 10); g.rotate(wd); g.fillStyle = '#9fd8ff'; g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -4); g.lineTo(-2, 0); g.lineTo(-4, 4); g.closePath(); g.fill(); g.restore();
      // the player dot
      g.fillStyle = '#f2c230'; g.fillRect(cx - 1, cy + 4, 2, 2);
      P.el.querySelector('.dir').textContent = '▶ ' + o.name.toUpperCase();
      P.el.querySelector('.open').textContent = Math.round(o.open * 0.3) + ' m of open ground before the first house' + (o.open >= 130 ? ' (and more)' : '') + '.';
      P.el.querySelector('.dwm-say').innerHTML = say;
    };
    ST.cardState = () => ({ sel, opts: opts.map((o) => ({ i: o.i, name: o.name, open: o.open, safe: o.safe })) });
    onEnd(() => { P.close(null); ST.cardState = null; });
    render();
    return m.until(() => P.closed).then(() => { ST.cardState = null; return P.done; });
  }
  function drawRocketProps() {
    const RK = ST.rocket, R = N.render;
    if (!RK || (N.view3d && N.view3d.active)) return;
    const p = N.player;
    if (RK.carrying && p) {
      R.queue('actors', p.y + 0.2, (ctx) => { const k = R.k(3), X = R.sx(p.x + Math.cos(p.facing || 0) * 3, k), Y = R.sy(p.y + Math.sin(p.facing || 0) * 3 + 2, k); ctx.fillStyle = '#2a4a8a'; ctx.fillRect(Math.round(X - 2 * k), Math.round(Y - 2 * k), Math.ceil(4 * k), Math.ceil(3.5 * k)); ctx.fillStyle = '#6aa8e8'; ctx.fillRect(Math.round(X - 1.6 * k), Math.round(Y - 2 * k), Math.ceil(3.2 * k), Math.ceil(1 * k)); });
    }
    const L = RK.L;
    if (!L || !R.inView(L.x, L.y, 60)) return;
    R.queue('actors', L.y - 0.5, (ctx) => {
      if (RK.bucket) {
        const k = R.k(2), X = R.sx(L.x - 7, k), Y = R.sy(L.y + 3, k);
        ctx.fillStyle = '#2a4a8a'; ctx.fillRect(Math.round(X - 2.4 * k), Math.round(Y - 2.4 * k), Math.ceil(4.8 * k), Math.ceil(4.2 * k));
        ctx.fillStyle = '#6aa8e8'; ctx.fillRect(Math.round(X - 2 * k), Math.round(Y - 2.4 * k), Math.ceil(4 * k), Math.ceil(1.4 * k));
      }
      if (RK.bottle && !RK.launched) {
        const k = R.k(1.5), X = R.sx(L.x, k), Y = R.sy(L.y, k), a = RK.aim ? RK.aim.a : -Math.PI / 2;
        ctx.save(); ctx.translate(X, Y); ctx.rotate(a);
        ctx.fillStyle = '#2a6a3a'; ctx.fillRect(-2 * k, -1.4 * k, 4 * k, 2.8 * k); ctx.fillStyle = '#5ab070'; ctx.fillRect(2 * k, -0.7 * k, 2 * k, 1.4 * k);
        const fl = RK.gust ? Math.sin((N.time.real || 0) * 30) * 0.8 : 0;
        ctx.fillStyle = '#e8dcc0'; ctx.fillRect(3 * k, -0.4 * k + fl, 7 * k, 0.8 * k); ctx.fillStyle = '#c03030'; ctx.fillRect(9 * k, -1.2 * k + fl, 3 * k, 2.4 * k);
        ctx.restore();
      }
      if (RK.gust) {
        const t = N.time.real || 0, dx = Math.cos(RK.wdir), dy = Math.sin(RK.wdir), k = R.k(3);
        ctx.strokeStyle = 'rgba(235,240,255,0.6)'; ctx.lineWidth = 1;
        for (let i = -3; i <= 3; i++) {
          const off = ((t * 60 + i * 19) % 70) - 35;
          const ox = L.x - dx * 20 + -dy * i * 6 + dx * off, oy = L.y - dy * 20 + dx * i * 6 + dy * off;
          ctx.beginPath(); ctx.moveTo(R.sx(ox, k), R.sy(oy, k)); ctx.lineTo(R.sx(ox + dx * 8, k), R.sy(oy + dy * 8, k)); ctx.stroke();
        }
      }
    });
  }
  async function rocket(m) {
    const L = launchSpot();
    if (!L) m.fail('The colony ground is not on this map.');
    const RK = ST.rocket = { L, bucket: false, bottle: false, water: 0, carrying: false, gust: false, wdir: windDir(), launched: false };
    ST.draws.add(drawRocketProps);
    npc(m, 'bunty', walkable(L.x + 10, L.y + 2, 12), { idle: 'stand' });
    face('bunty', 'player');
    await m.talk([
      { s: 'bunty', t: 'Tonight, the biggest rocket in Lakshmi Nagar. Rule one: bucket of water first. No bucket, no rocket.' },
      { s: 'chinnu', t: 'And rule two?' },
      { s: 'bunty', t: 'Rule two: I\'m nineteen, I\'m the adult. We light it together, at arm\'s length. Rule three: Mummy doesn\'t need to know about rule two.' },
      { s: 'bunty', t: 'Word of the day: *nostalgia*. Means the smell of a rocket that went straight.' },
    ]);
    // the bucket from the home tap
    const tap = spot('home', 10, 8, 16) || pos('home');
    await act(m, tap, 'Fill the bucket at the tap', { objective: 'Rule one: fill a bucket of water at the home tap.', r: 16 });
    sfxOr(['water_lap', 'splash'], { ui: true, vol: 0.6 });
    give(m, 'bucket', 'A bucket of water');
    for (let tries = 0; tries < 6; tries++) {
      RK.carrying = true; RK.water = 100;
      const drain = everyTick((dt) => {
        if (mode() !== 'play' || !RK.carrying) return;
        const p = N.player, sp = Math.hypot(p.vx || 0, p.vy || 0);
        if (p.running && sp > 55) { RK.water = Math.max(0, RK.water - TUNE.bucketDrain * dt); if (!RK.spillT || nowT() - RK.spillT > 3) { RK.spillT = nowT(); toast('Water everywhere! Walk, the bucket is full.', 1800, 'dwm:bucket'); } }
        widget({ label: 'BUCKET', value: RK.water, text: Math.round(RK.water) + '%', low: RK.water < TUNE.bucketMin });
      });
      await act(m, walkable(L.x - 7, L.y + 3, 10), 'Put the bucket down', { objective: 'Carry the bucket to the ground. Running spills it.', r: 15 });
      drain(); widget(null);
      RK.carrying = false;
      if (RK.water >= TUNE.bucketMin || ff()) break;
      await m.say('bunty', 'Half a bucket is half a rule. Fill it again, *mamu*.');
      await act(m, tap, 'Fill the bucket at the tap', { objective: 'Fill the bucket again at the home tap.', r: 16 });
    }
    RK.bucket = true;
    m.checkpoint('bucket');
    RK.bucket = true; RK.bottle = true; RK.launched = false;
    npc(m, 'bunty', walkable(L.x + 8, L.y + 2, 12), { idle: 'stand' });
    if (Math.hypot(N.player.x - L.x, N.player.y - L.y) > 20) await m.goto(walkable(L.x, L.y + 8, 10), { label: 'Back to the bottle.', r: 14 });
    camZoom(1.7);
    await m.say('bunty', 'Bottle on the ground. Now aim it away from the houses. Open sky, open ground.');
    const aim = await aimCard(m, L);
    if (!aim) m.fail('Not now? Bunty-anna waits. Phir se.');
    RK.aim = aim; ST.lastAim = aim;
    await m.talk([
      { s: 'bunty', t: 'Good. Open ground ' + aim.name + '. Agarbatti, arm\'s length, my hand on yours.' },
      { s: 'bunty', t: 'And we wait for the wind. Never in a gust.' },
    ]);
    // the wind: a gust first (wait it out), then calm windows between gusts
    const W = { phase: 'gust', t: rr(TUNE.rocketGust[0], TUNE.rocketGust[1]), n: 1 };
    RK.wind = W; RK.gust = true; RK.wdir = windDir() + rr(-0.3, 0.3);
    toast('*Hawa!* A gust. Wait for it to pass...', 2200, 'dwm:gust');
    bark('bunty', 'Hawa! Wait... wait...', 2.5);
    sfxOr(['kite_wind'], { ui: true, vol: 0.6 });
    everyTick((dt) => {
      if (mode() !== 'play' || RK.launched) return;
      W.t -= dt;
      if (W.t <= 0) {
        if (W.phase === 'gust') { W.phase = 'calm'; W.t = rr(TUNE.rocketCalm[0], TUNE.rocketCalm[1]); RK.gust = false; toast('Calm. Now!', 1400, 'dwm:gust'); }
        else { W.phase = 'gust'; W.t = rr(TUNE.rocketGust[0], TUNE.rocketGust[1]); W.n++; RK.gust = true; RK.wdir = windDir() + rr(-0.3, 0.3); sfxOr(['kite_wind'], { ui: true, vol: 0.6 }); toast('*Hawa!* Another gust. Wait...', 1800, 'dwm:gust'); }
      }
      let hp = 0; for (const H of ST.holds) hp = Math.max(hp, H.t / H.secs);
      if (hp > 0) widget({ label: 'AGARBATTI', value: hp * 100, text: RK.gust ? 'GUST!' : 'calm', low: RK.gust, warn: RK.gust });
      else widget({ label: 'WIND', value: RK.gust ? 100 : 15, text: RK.gust ? 'GUST, wait!' : 'calm: light it', low: RK.gust, warn: RK.gust });
    });
    m.objective('Wait out the gust, then light it with Bunty-anna (hold E by the bottle).');
    await holdAt(m, { label: 'Light it, with Bunty-anna (hold E)', meter: 'AGARBATTI', secs: TUNE.lightHold, widget: false, near: () => Math.hypot(N.player.x - L.x, N.player.y - L.y) < 22 });
    if (RK.gust && !ff()) {
      ST.stats.gustLights++;
      await m.say('bunty', 'Not in the wind! (He pinches the fuse out.) Rule three, *mamu*. The wind decides where a rocket goes.', { mood: 'angry' });
      m.fail('Bunty-anna pinched the fuse: never light it in a gust. Phir se.');
    }
    RK.launched = true;
    camZoom(0.9);
    sfxOr(['dw_match', 'paper'], { ui: true, vol: 0.6 });
    const dx = Math.cos(aim.a), dy = Math.sin(aim.a);
    let burst = null;
    const ropt = { h: 3, type: 'multi', big: 2.2, vx: dx * 16, vy: dy * 16, vh: 140, fuse: 1.5, col: 0, force: true, onBurst: (r) => { burst = { x: r.x, y: r.y, h: r.h }; } };
    const bottle = dwFn('bottle');
    let viaBottle = false;
    if (bottle) { try { viaBottle = !!bottle(L.x, L.y, { fuse: 0.5, rocket: ropt, onLaunch: () => { RK.bottle = false; } }); } catch (e) { N.err('dwm.bottle', e); } }
    if (!viaBottle) { RK.bottle = false; fx.rocket(L.x + dx * 3, L.y + dy * 3, ropt); }
    m.objective(null);
    await m.until(() => !!burst, { timeout: viaBottle ? 3.2 : 2.4 });
    RK.bottle = false;
    const B = burst || { x: L.x + dx * 26, y: L.y + dy * 26, h: 150 };
    if (!burst) fx.burst(B.x, B.y, B.h, 'multi', 2.2);
    RK.burst = { x: B.x, y: B.y, h: B.h };
    fx.burst(B.x, B.y, B.h + 6, 'ring', 1.6);
    await m.wait(0.35); fx.burst(B.x + 18, B.y - 10, B.h + 14, 'willow', 1.4);
    await m.wait(0.35); fx.burst(B.x - 16, B.y + 8, B.h - 4, 'crackle', 1.3);
    sfxOr(['crowd_cheer', 'kids'], { ui: true, vol: 0.7 });
    await m.wait(2.4); // let it rain down over the colony before anybody speaks
    ST.prog.rocket_bunty = { day: dayKey(), aim: aim.name, gusts: W.n };
    // the group photo
    const row = [['immu', -18], ['ayesha', -10], ['chitti', -3], ['bunty', 4], ['amma', 11], ['ammamma', 18]];
    for (const [id, dxp] of row) { const a = npc(m, id, walkable(L.x + dxp, L.y - 10, 8), { idle: 'stand' }); if (a) a.angle = a.baseAngle = Math.PI / 2; }
    npc(m, 'nanna', walkable(L.x, L.y + 26, 10), { idle: 'stand' });
    face('nanna', { x: L.x, y: L.y - 10 });
    await m.talk([
      { s: 'bunty', t: 'Did you SEE that? That was onsite level. America can see that.' },
      { s: 'nanna', t: 'Everybody together. Bunty, glasses off. Chitti, stop jumping. *Thoda left... smile please.*' },
    ]);
    await m.cutscene([
      { type: 'camera', target: { x: L.x, y: L.y - 6 }, zoom: 1.3, ms: 900 },
      { type: 'sfx', name: 'camera_flash' },
      { type: 'flash' },
      { type: 'text', lines: ['Click.', 'The colony ground, Deepavali night 2003: the rocket\'s smoke still in the sky, Chitti blinking, Bunty-anna\'s glasses back on. Nanna is not in it. Again.'], dim: 0.35, ms: 4600 },
      { type: 'say', s: 'nanna', t: 'Ready day after tomorrow.' },
    ]);
    m.token('diwali_photo', { name: 'The Diwali group photo', desc: 'The colony ground, Deepavali night 2003. The rocket\'s smoke is still in the sky. Nanna is not in it (again).' });
    m.flag('dw_photo', dayKey());
  }

  /* ================================================================ 5. tiger_ko_bachao (optional) */
  class TigerDog extends N.Actor {
    constructor(x, y) {
      super({ kind: 'animal', x, y, r: 3, mass: 2, solid: false, noCollide: true });
      this.species = 'dog'; this.type = 'dog'; this.name = 'Tiger'; this.tiger = true;
      this.col = ['#c8903e', '#f0dcb0']; this.seed = 1103;
      this.state = 'nap'; this.mode = 'hide'; this.angle = 0; this.t = 0; this.anim = 0; this.vx = this.vy = 0; this.moving = false;
      this.trem = 1; this.flinch = 0; this.whT = 1; this.trail = []; this.calmT = 0;
      this._fn = (ctx) => drawTiger(ctx, this);
    }
    update(dt) { try { tigerUpdate(this, dt); } catch (e) { N.err('dwm.tiger', e); } }
    draw() {
      if (!N.render.inView(this.x, this.y, 24)) return;
      N.render.queue('actors', this.y, this._fn);
      // his name over him once he is found (a dark lane at night), never while he hides unseen
      const p = N.player, a = this;
      if (a.found && a.mode !== 'sleep' && p && Math.hypot(p.x - a.x, p.y - a.y) < 90) {
        N.render.queue('sky', 2, () => { try { N.draw.pixelText(a.x, a.y - 7, 8, a.flinch > 0 ? 'TIGER !' : 'TIGER', a.flinch > 0 ? '#ff9a6a' : '#f2c230', { scale: 1, shadow: '#1a1214' }); } catch (e) { /* ignore */ } });
      }
    }
  }
  /** src/diwali.js scares / steps registered dogs: Tiger is stepped here (dwOwnStep) and reacts to real bangs too */
  function dogsRegister(t) {
    const Dg = DW() && DW().dogs;
    t.dwOwnStep = true;
    t.onBang = (x, y) => { if (t.mode === 'follow' && !(t.flinch > 0) && Math.hypot(x - t.x, y - t.y) < 170) { t.flinch = 99; t.calmT = 0; t.whT = 0; t.realBangs = (t.realBangs | 0) + 1; toast('A bang nearby! Tiger froze. Stay beside him.', 2400, 'dwm:tiger'); } };
    try { if (Dg && typeof Dg.register === 'function') Dg.register(t); } catch (e) { N.err('dwm.dogs', e); }
  }
  function removeTiger(t) { if (!t) return; try { const Dg = DW() && DW().dogs; if (Dg && typeof Dg.unregister === 'function') Dg.unregister(t); } catch (e) { /* ignore */ } t.alive = false; try { N.entities.remove(t); } catch (e) { /* ignore */ } if (ST.tiger === t) ST.tiger = null; if (ST.tigerKeep === t) ST.tigerKeep = null; }
  function tigerUpdate(a, dt) {
    a.t += dt;
    const p = N.player;
    const playing = mode() === 'play';
    let tx = null, ty = null, speed = 0;
    if (a.mode === 'hide' || a.mode === 'sleep') { a.state = 'nap'; a.vx = a.vy = 0; }
    else if (a.mode === 'calm') { a.state = 'sit'; a.vx = a.vy = 0; a.angle = Math.atan2(p.y - a.y, p.x - a.x); }
    else if (a.mode === 'follow') {
      if (a.flinch > 0) { a.flinch -= playing ? dt : 0; a.state = 'nap'; a.vx = a.vy = 0; }
      else {
        // follow the player's breadcrumbs (always walkable), a few steps behind
        const tr = a.trail;
        while (tr.length && Math.hypot(tr[0].x - a.x, tr[0].y - a.y) < 2.5) tr.shift();
        const dp = Math.hypot(p.x - a.x, p.y - a.y);
        if (tr.length && dp > TUNE.tigerGap) { tx = tr[0].x; ty = tr[0].y; speed = dp > 40 ? 60 : dp > 22 ? 48 : 40; }
      }
    } else if (a.mode === 'bolt' && a.home) { tx = a.home.x; ty = a.home.y; speed = 95; }
    if (tx != null && playing) {
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const s = Math.min(speed * dt, d);
        const nx = a.x + (dx / d) * s, ny = a.y + (dy / d) * s;
        try { N.entities.pushTo(a, nx, ny); } catch (e) { a.x = nx; a.y = ny; }
        a.angle = Math.atan2(dy, dx); a.vx = (dx / d) * speed; a.vy = (dy / d) * speed; a.anim += s * 0.5; a.moving = true; a.state = 'wander';
      } else { a.vx = a.vy = 0; a.moving = false; }
    } else { a.moving = false; if (a.mode === 'follow' && !(a.flinch > 0)) { a.vx = a.vy = 0; a.state = 'sit'; } }
    if (a.mode === 'bolt' && a.home && Math.hypot(a.home.x - a.x, a.home.y - a.y) < 3) a.mode = 'hide';
    // whimpers while hiding or frozen
    if ((a.mode === 'hide' && !a.found) || a.flinch > 0) {
      a.whT -= playing ? dt : 0;
      if (a.whT <= 0) {
        a.whT = a.flinch > 0 ? 1.6 : TUNE.whimperEvery;
        if (!sfxOr(['dw_whimper'], { x: a.x, y: a.y, vol: 0.6 })) sfxOr(['dog_bark'], { x: a.x, y: a.y, vol: 0.12 });
        caption('a dog whimpers', { x: a.x, y: a.y, ms: 1500 });
      }
    }
  }
  function drawTiger(ctx, a) {
    const D = N.draw, c1 = a.col[0], c2 = a.col[1];
    const trem = (a.mode === 'hide' && !a.found) || a.flinch > 0 ? Math.sin(a.t * 40) * 0.35 : 0;
    D.sprite(a.x + trem, a.y, a.angle, 1.6, (g) => {
      if (a.state === 'nap') {
        g.fillStyle = c1; g.beginPath(); g.ellipse(0, 0, 4.6, 3.8, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(30,20,15,0.55)'; g.lineWidth = 0.5; g.stroke();
        g.fillStyle = c2; g.beginPath(); g.ellipse(2.6, 1.3, 1.9, 1.5, 0, 0, TAU); g.fill();
        g.fillStyle = '#c03030'; g.fillRect(1.4, -1.6, 0.9, 3.2);
        return;
      }
      const sw = Math.sin(a.anim * 3) * (a.moving ? 1 : 0);
      g.fillStyle = '#2a2018'; for (const [lx, ly, s] of [[2.9, -1.6, 1], [2.9, 1.6, -1], [-2.9, -1.6, -1], [-2.9, 1.6, 1]]) g.fillRect(lx + sw * s - 0.55, ly - 0.5, 1.1, 1);
      g.strokeStyle = c1; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-4.4, 0); g.quadraticCurveTo(-6.6, -1.6 + Math.sin(a.t * (a.mode === 'follow' ? 12 : 4)) * 1.2, -6, -2.9); g.stroke();
      g.fillStyle = c1; g.beginPath(); g.ellipse(0, 0, 4.7, 2, 0, 0, TAU); g.fill();
      g.fillStyle = c2; g.beginPath(); g.ellipse(-1, 0.5, 1.8, 1.2, 0, 0, TAU); g.fill();
      g.fillStyle = '#c03030'; g.fillRect(3.2, -1.5, 0.9, 3); // the red collar
      g.fillStyle = c1; g.beginPath(); g.ellipse(5.1, 0, 1.9, 1.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a1412'; g.fillRect(6.7, -0.4, 0.8, 0.8);
      g.fillStyle = '#8a5a2a'; g.fillRect(4.2, -2, 1.2, 0.9); g.fillRect(4.2, 1.1, 1.2, 0.9);
    });
    if (a.mode === 'sleep' && isNight()) { try { D.pixelText(a.x + 4, a.y - 4, 6, 'z', '#e8eef8', { scale: 1, shadow: '#1a1214' }); } catch (e) { /* ignore */ } }
  }
  function tigerSpots() {
    const ids = ['hide_home_lane', 'hide_home_colony_ground'];
    const out = [];
    for (const id of ids) { const p = pos(id); if (p) out.push({ id, x: p.x, y: p.y }); }
    if (!out.length) { const h = pos('home'); if (h) out.push({ id: 'home_lane', x: h.x + 120, y: h.y - 40 }); }
    return out;
  }
  function garageSpot() {
    let ch = null;
    try { ch = (N.vehicles.list || []).find((v) => v.alive !== false && v.type === 'family_chetak'); } catch (e) { ch = null; }
    const home = (N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.home) || null;
    const bx = ch ? ch.x : home ? home[0] - 58 : (pos('home') || { x: 0 }).x - 58, by = ch ? ch.y : home ? home[1] + 2 : (pos('home') || { y: 0 }).y;
    for (const [dx, dy] of [[0, -9], [8, -7], [-8, -7], [0, 9], [10, 0], [-10, 0]]) {
      const x = bx + dx, y = by + dy;
      try { if (N.world.isWalkable(x, y) && !N.world.collide(x, y, 3, 'walk').hit) return { x, y, cx: bx, cy: by }; } catch (e) { break; }
    }
    const f = walkable(bx, by - 9, 12);
    return { x: f.x, y: f.y, cx: bx, cy: by };
  }
  function drawGarage() {
    const G = ST.garage, R = N.render;
    if (!G || !R.inView(G.x, G.y, 40) || (N.view3d && N.view3d.active)) return;
    R.queue('ground', 4, (ctx) => {
      const k = R.k(0.2), X = R.sx(G.x, k), Y = R.sy(G.y, k);
      ctx.fillStyle = '#8a6a3a'; ctx.fillRect(Math.round(X - 5 * k), Math.round(Y - 3 * k), Math.ceil(10 * k), Math.ceil(6 * k));
      ctx.fillStyle = '#a8844a'; for (let i = -4; i < 5; i += 2) ctx.fillRect(Math.round(X + i * k), Math.round(Y - 3 * k), Math.max(1, Math.round(0.6 * k)), Math.ceil(6 * k));
    });
    if (ST.garageLabel) R.queue('sky', 2, () => { try { N.draw.pixelText(G.x, G.y - 8, 10, 'NANNA\'S GARAGE', '#f2c230', { scale: 1, shadow: '#1a1214' }); } catch (e) { /* ignore */ } });
  }
  async function tiger(m) {
    const p = N.player;
    const spots = tigerSpots();
    const hs = spots[Math.abs(dayKey() * 7 + 3) % spots.length];
    const hide = walkable(hs.x, hs.y, 14);
    npc(m, 'immu', spot('friend_home', 12, 12, 20), { idle: 'stand' });
    face('immu', 'player');
    await m.talk([
      { s: 'immu', t: 'Agent Chinnu, emergency. Tiger is missing. A bomb went DHAAM by the water tank and he ran. Over.' },
      { s: 'chinnu', t: 'Tiger hates crackers. Every year he hides and every year he cries.' },
      { s: 'immu', t: 'Listen for the whimpering. I\'ll tell the aunties to keep their bijlis for later. And walk, *pakka*: running scares him more.' },
    ]);
    // Tiger, hiding
    const tg = new TigerDog(hide.x, hide.y);
    tg.home = { x: hide.x, y: hide.y };
    N.entities.add(tg);
    m.spawn(tg);
    dogsRegister(tg);
    if (ST.tigerKeep && ST.tigerKeep !== tg) removeTiger(ST.tigerKeep);
    ST.tiger = tg;
    const c = { x: hide.x + Math.cos(dayKey()) * 45, y: hide.y + Math.sin(dayKey() * 1.7) * 35, r: TUNE.tigerR };
    try { if (N.hud && N.hud.searchCircle) N.hud.searchCircle('dwm:tiger', { x: c.x, y: c.y, r: c.r, color: '#f2c230' }); } catch (e) { /* ignore */ }
    const bl = m.blip(c, { color: '#f2c230', icon: 'ring', pulse: true, route: true });
    m.objective('Find Tiger: listen for the whimpers inside the search circle.');
    ST.step = { kind: 'find', target: () => tg, use: () => { p.teleport(tg.x + 8, tg.y); } };
    await m.until(() => Math.hypot(p.x - tg.x, p.y - tg.y) < TUNE.tigerFind + 8);
    m.unblip(bl);
    try { if (N.hud && N.hud.searchCircle) N.hud.searchCircle('dwm:tiger', null); } catch (e) { /* ignore */ }
    tg.found = true;
    camZoom(1.6);
    await m.say('chinnu', 'Tiger... it\'s me. It\'s only noise. It\'s only Diwali.');
    m.objective('Comfort Tiger (hold E beside him).');
    await holdAt(m, { label: 'Comfort Tiger (hold E)', meter: 'SHH... SHH...', secs: TUNE.comfortHold, near: () => Math.hypot(p.x - tg.x, p.y - tg.y) < TUNE.tigerFind });
    tg.mode = 'calm'; tg.trem = 0;
    try { const Dg = DW() && DW().dogs; if (Dg && typeof Dg.calm === 'function') Dg.calm(tg); } catch (e) { N.err('dwm.dogs', e); }
    tg.mode = 'calm';
    await m.say('tiger_dog', '(a small thump of the tail on the ground)', { mood: 'sad' });
    m.checkpoint('found');
    // (a retry resumes here: Tiger back at his spot, calm)
    tg.found = true; tg.mode = 'follow'; tg.flinch = 0; tg.trail = [];
    camZoom(1.4);
    if (Math.hypot(tg.x - p.x, tg.y - p.y) > 30) { const f = walkable(p.x + 6, p.y + 4, 10); tg.x = f.x; tg.y = f.y; }
    const G = ST.garage = garageSpot();
    ST.garageLabel = true;
    ST.draws.add(drawGarage);
    p.noRun = false;
    const total = Math.max(60, Math.hypot(G.x - tg.x, G.y - tg.y));
    const bangs = [0.35, 0.7].map((f) => ({ at: f, done: false }));
    m.objective('Lead Tiger to Nanna\'s quiet garage. Walk, don\'t run.');
    const gmk = m.marker(G, { r: 14 }), gbl = m.blip(G, { color: '#ff5fb0', icon: 'star', pulse: true, route: true, label: 'Nanna\'s garage' });
    let bolted = false;
    everyTick((dt) => {
      if (mode() !== 'play' || tg.mode !== 'follow') return;
      const tr = tg.trail, last = tr[tr.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 3) { tr.push({ x: p.x, y: p.y }); if (tr.length > 400) tr.shift(); }
      const sp = Math.hypot(p.vx || 0, p.vy || 0);
      if (p.running && sp > TUNE.tigerRunSpeed && Math.hypot(p.x - tg.x, p.y - tg.y) < TUNE.tigerRunR && !bolted) {
        bolted = true; tg.mode = 'bolt'; tg.found = false;
        sfxOr(['dw_whimper', 'dog_bark'], { x: tg.x, y: tg.y, vol: 0.5 });
        setTimeout(() => { const r = run(); if (r && r.id === 'tiger_ko_bachao' && !r.ended) N.missions.fail('Tiger bolted back to his hiding place. Walk, don\'t run: he\'s scared, not slow. Phir se.'); }, 0);
        return;
      }
      // two bangs, far away in other lanes: Tiger freezes; stay with him till he calms
      const prog = 1 - Math.hypot(G.x - tg.x, G.y - tg.y) / total;
      for (const b of bangs) {
        if (b.done || prog < b.at) continue;
        b.done = true;
        tg.flinch = 99; tg.calmT = 0; tg.whT = 0;
        const a = Math.random() * TAU, bx = p.x + Math.cos(a) * 320, by = p.y + Math.sin(a) * 320;
        if (!sfxOr(['dw_bomb'], { x: bx, y: by, vol: 0.5 })) sfxOr(['firework'], { ui: true, vol: 0.5 });
        caption('DHAAM! far away', { x: bx, y: by, ms: 1800 });
        toast('DHAAM! Somebody\'s bijli, two lanes away. Tiger froze. Stay beside him.', 2600, 'dwm:tiger');
        m.objective('Tiger froze. Stay beside him till he calms down.');
      }
      if (tg.flinch > 0) {
        if (Math.hypot(p.x - tg.x, p.y - tg.y) < TUNE.tigerStayR) { tg.calmT += dt; if (tg.calmT >= TUNE.tigerCalm) { tg.flinch = 0; tg.trail = [{ x: p.x, y: p.y }]; m.objective('Lead Tiger to Nanna\'s quiet garage. Walk, don\'t run.'); } }
        else tg.calmT = 0;
      }
    });
    await m.until(() => Math.hypot(tg.x - G.x, tg.y - G.y) < 16 && Math.hypot(p.x - G.x, p.y - G.y) < 20 && !(tg.flinch > 0));
    m.unmarker(gmk); m.unblip(gbl);
    await act(m, G, 'Settle Tiger on the gunny sack', { objective: 'Settle Tiger on the gunny sack in Nanna\'s garage.', r: 16, route: false });
    tg.mode = 'sleep'; tg.x = G.x; tg.y = G.y; tg.angle = Math.PI;
    ST.garageLabel = false;
    npc(m, 'nanna', walkable(G.cx + 12, G.cy + 6, 10), { idle: 'stand' });
    npc(m, 'chitti', walkable(G.cx - 10, G.cy + 6, 10), { idle: 'stand' });
    face('nanna', tg); face('chitti', tg);
    await m.talk([
      { s: 'nanna', t: 'Let him sleep here tonight. The Chetak won\'t mind. I won\'t mind. Amma will mind... and then she\'ll give him a chapati.' },
      { s: 'chitti', t: 'Tiger! *Mummy ki cheppesta*... that Annayya is a hero.' },
      { s: 'tiger_dog', t: '(a long sigh, the kind dogs do when the world is finally quiet)', mood: 'happy' },
    ]);
    m.money(500);
    m.flag('tiger_safe', dayKey());
    ST.prog.tiger_ko_bachao = { day: dayKey(), spot: hs.id };
    // Tiger stays on the sack for the night (removed in the morning / after Diwali)
    ST.tigerKeep = tg;
    const r = run(); if (r) for (const s of r.spawned) if (s.e === tg) s.keep = true;
    ST.keepDay = dayKey();
  }
  /** the lit terrace stays drawn on the night of the mission (until 05:00 the next morning) */
  function terraceKeepTick() {
    const K = ST.terraceKeep;
    if (!K) return;
    const m0 = N.clock ? N.clock.minutes : 0;
    if (dayKey() > K.day + 1 || (dayKey() === K.day + 1 && m0 > 5 * 60) || dayKey() < K.day) ST.terraceKeep = null;
    else ST.draws.add(drawTerrace);
  }
  function tigerKeepTick() {
    const t = ST.tigerKeep;
    if (!t) return;
    const m0 = N.clock ? N.clock.minutes : 0;
    if (!t.alive || (dayKey() !== ST.keepDay && m0 > 7 * 60) || !diwaliOn()) { removeTiger(t); ST.garage = null; }
  }

  /* ================================================================ the post-game "Diwali Week" J-card */
  async function diwaliWeek(m) {
    npc(m, 'amma', spot('home', 16, 4), { idle: 'stand' });
    npc(m, 'nanna', spot('home', -14, 8), { idle: 'stand' });
    await m.talk([
      { s: 'amma', t: '{nick}, Diwali is next week. Your Nanna has already started counting phuljhadis.' },
      { s: 'nanna', t: 'Twenty, last year. This year, more. *Chuddam.*' },
    ]);
    await m.jumpTo([2003, 10, 20, 9, 30], { fx: 'ff' });
    toast('Mon 20 Oct 2003. Diwali week: the pataakha stalls are up on Sultan Bazaar.', 3600);
    ST.prog.diwali_week = { n: ((ST.prog.diwali_week && ST.prog.diwali_week.n) | 0) + 1 };
    // a calendar card, not a mission: it ends without a MISSION PASSED banner and comes back after the next rewind.
    // He is still at the door where Amma's Pataakha Bazaar card waits: it waits until he has stepped out once.
    const p0 = N.player; if (p0) ST.stepOut = { x: p0.x, y: p0.y, t: absMin() };
    const r = run();
    if (r && r.id === 'diwali_week') { setTimeout(() => { const q = run(); if (q && q.id === 'diwali_week' && !q.ended) N.missions.abort(); }, 0); await m.until(() => false); }
  }

  /* ================================================================ registration */
  const SIDE_CH = 'Side activity · Diwali';
  function register() {
    const M = N.missions;
    if (!M || !M.register) return;
    // diwaliOwnsLighting: src/diwali.js hides its free-roam "Light a cracker" offer while one of these runs
    const mk = (def) => { const d = M.register(Object.assign({ kind: 'side', chapter: SIDE_CH, autosave: false, diwaliOwnsLighting: true }, def)); return d; };
    mk({ id: 'pataakha_bazaar', title: 'Pataakha Bazaar', giver: { place: 'home', r: 16 }, window: { from: '09:00', to: '15:00' },
      jcardLine: 'Amma\'s ₹100, Amma\'s list, Nanna\'s rule.', when: () => stallsOn(), script: bazaar });
    mk({ id: 'mithai_run', title: 'Mithai Run', giver: { place: 'home', r: 16 }, window: { from: '15:00', to: '17:45' },
      jcardLine: 'Five boxes of sweets before Amma\'s puja.', when: () => diwaliOn(), script: mithai });
    mk({ id: 'deepon_ki_raat', title: 'Deepon ki Raat', giver: { npc: 'ammamma', place: 'home', r: 16 }, window: { from: '18:30', to: '21:30' },
      jcardLine: 'Twenty-one diyas with Ammamma, before the breeze.', when: () => diwaliOn(), script: deepon });
    mk({ id: 'rocket_bunty', title: 'Bunty-anna\'s Rocket', giver: { place: 'playground_1', r: 18 }, window: { from: '19:00', to: '23:00' },
      jcardLine: 'Bucket first. Aim it at the sky. Never in the wind.', when: () => diwaliOn(), script: rocket });
    mk({ id: 'tiger_ko_bachao', title: 'Tiger ko Bachao', chapter: 'Side activity · Diwali (optional)', giver: { place: 'friend_home', r: 16 }, window: { from: '19:00', to: '23:30' },
      jcardLine: 'Tiger is hiding from the crackers. (Optional)', when: () => diwaliOn(), help: false, script: tiger });
    const wk = mk({ id: 'diwali_week', title: 'Diwali Week', chapter: 'Post-game', giver: { place: 'home', r: 16 }, window: { from: '07:00', to: '21:00' },
      jcardLine: 'Amma: “Diwali is next week.” ▶▶ Mon 20 Oct 2003', help: false,
      when: () => postgame() && inYearOct() && !stallsOn(), script: diwaliWeek });
    // (played in the story already: the same card, a line that knows it; what was done stays done)
    const wd = wk || M.defs.diwali_week;
    if (wd) Object.defineProperty(wd, 'jcardLine', { configurable: true, enumerable: true, get: () => (F().dw_story === 'done' ? 'Amma: “Diwali again? Your Nanna is already counting phuljhadis.” ▶▶ Mon 20 Oct 2003' : 'Amma: “Diwali is next week.” ▶▶ Mon 20 Oct 2003') });
    // after CONTINUE / a pass the player often stands in a giver's ring: it waits until he has stepped out once
    for (const id of IDS) { const d = M.defs[id]; if (!d || d._dwGate) continue; const w0 = d.when; d._dwWhen = w0 || null; d.when = () => stepOutOK(id) && (!w0 || w0()); d._dwGate = true; }
  }
  function stepOutOK(id) {
    const so = ST.stepOut;
    if (!so) return true;
    const p = N.player;
    // he has walked away once, or the day has moved on (a ▶▶, an afternoon at home): the gate lapses
    if (!p || Math.hypot(p.x - so.x, p.y - so.y) > 70 || Math.abs(absMin() - (so.t || 0)) > 15) { ST.stepOut = null; return true; }
    try {
      const d = N.missions.defs[id], g = d && N.missions.giverPos(d), r = (d && d.giver && d.giver.r) || 14;
      if (!g || Math.hypot(so.x - g.x, so.y - g.y) > r + 24) return true; // he did not end up in this giver's ring
      if (Math.hypot(p.x - g.x, p.y - g.y) > r + 36) return true;
    } catch (e) { return true; }
    return false;
  }
  const absMin = () => (N.clock ? N.clock.day * 1440 + N.clock.minutes : 0);
  function inYearOct() { const d = dateNow(); return !!d && d.y === 2003 && inDates('09-10', '10-19'); }

  /* ================================================================ Diwali week in the story (after Track 10, before the interlude) */
  // A chapter interlude, not a numbered track (the tape stays at twelve tracks). After Agle Baras (Track 10, 10 Sep) the
  // story goes to Mon 20 Oct 2003 (not straight to the Sat 1 Nov interlude): Amma and Ammamma's card, then the week.
  // Story-required: mithai_run (Immu's Ammi: "Eid pe sevaiyan pakki!", paid off on Eid morning in story2.js) and
  // deepon_ki_raat. Optional, offered as always (givers, blips, the Clues page): pataakha_bazaar, rocket_bunty (Bunty-anna
  // brings his own rocket: no bazaar box needed), tiger_ko_bachao. The calendar loops Mon 20 - Sun 26 Oct
  // (N.calendar.setHorizon) until the chapter is over, so a missed window comes round again. Ammamma's swing at home
  // holds the chapter's J-card: "Wait till Sat 25 Oct · 15:00 ▶▶" (Deepavali) / "Wait till 18:30 ▶▶" while no required
  // activity is open, then "Diwali's done: Sleep ▶▶" (the player chooses when) -> the outro -> story2's interlude
  // (Sat 1 Nov) -> Track 11, exactly as before. story2.js asks N.dwMissions.story.blocks() before its interlude and in
  // Last Bell's `when` (marked "[diwali story]"). Saves: one from after Track 10 and before Track 11 plays the week on
  // load (one made after the interlude, by an older build: ◀◀ back to Mon 20 Oct, then ▶▶ back to its own date); one at
  // or after Last Bell, or in the post-game, never. Flags: dw_story ('week' | 'done'), dw_back (that date).
  const REQ = ['mithai_run', 'deepon_ki_raat'];
  const WEEK = { start: [2003, 10, 20, 9, 30], horizon: [2003, 10, 27], first: 22, deepavali: 25, last: 26, hint: 'diwali_story', swing: [-30, -2], r: 12 };
  const SS = { busy: false, ending: false, card: null, jc: null, blips: new Set(), obj: null, t: 0, npc: null };
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const hmOf = (v) => { const r = /^(\d{1,2}):(\d{2})$/.exec(String(v || '')); return r ? +r[1] * 60 + +r[2] : null; };
  const fmtHM = (m) => pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60);
  const weekStart = () => (N.calendar && N.calendar.DATES && N.calendar.DATES.diwali_week) || WEEK.start; // storycore DATES ([diwali story])
  function nowSpec() { const d = dateNow(); const m = N.clock ? N.clock.minutes : 0; return d ? [d.y, d.m, d.d, Math.floor(m / 60), Math.floor(m % 60)] : null; }
  /** the chapter is still to be played (or is being played) in this story */
  function storyPending() {
    const f = F(), M = N.missions;
    if (!M || !M.defs || !REQ.every((id) => M.defs[id])) return false;
    if (f.postgame || isDone('chand_raat') || isDone('last_bell')) return false;
    return isDone('agle_baras') && f.dw_story !== 'done';
  }
  const storyOK = () => !!(N.story2 && typeof N.story2.runScene === 'function');
  const storyWeek = () => storyPending() && F().dw_story === 'week';
  const reqLeft = () => REQ.filter((id) => !isDone(id));
  /** open right now (its own `when` + window), ignoring the step-out gate of the J-card */
  function openNow(id) {
    const M = N.missions, d = M && M.defs[id];
    if (!d || isDone(id) || (run() && run().id === id)) return false;
    try { if (d._dwWhen && !d._dwWhen()) return false; } catch (e) { return false; }
    return M.inWindow ? !!M.inWindow(id) : true;
  }
  function inWeek() { const d = dateNow(); return !!d && d.y === 2003 && d.m === 10 && d.d >= 20 && d.d <= WEEK.last; }
  /** the next window of a required activity: Mon / Tue -> Deepavali (Sat 25); Wed - Sun -> today's or tomorrow's; after
   *  Sunday's the week comes round again (the loop) -> Sat 25. */
  function nextWindow(ids) {
    const C = N.calendar, today = dateNow();
    if (!C || !today) return null;
    let best = null;
    for (const id of ids) {
      const d = N.missions.defs[id], a = hmOf(d && d.window && d.window.from);
      if (a == null) continue;
      const minD = today.m === 10 && today.d < WEEK.first ? WEEK.deepavali : WEEK.first;
      for (let k = 0; k < 8; k++) {
        const t = C.dateOf(N.clock.day + k);
        if (t.y !== 2003 || t.m !== 10 || t.d < minD || t.d > WEEK.last) continue;
        if (k === 0 && N.clock.minutes >= a) continue;
        const key = (N.clock.day + k) * 1440 + a;
        if (!best || key < best.key) best = { id, key, ymd: [t.y, t.m, t.d], d: t.d, a, label: t.label, today: k === 0 };
        break;
      }
    }
    if (best) return best;
    // Sunday's windows are gone: the week loops, Deepavali comes round again
    const id = ids[0], d = N.missions.defs[id], a = hmOf(d && d.window && d.window.from) || 15 * 60;
    return { id, key: Infinity, ymd: [2003, 10, WEEK.deepavali], d: WEEK.deepavali, a, label: 'SAT 25 OCT 2003', today: false, loop: true };
  }
  /** Ammamma's swing (the bench on the verandah): a fixed spot, not her live position (walked into, she gets nudged
   *  off it, and a card that followed her would slide out from under the player) */
  function swingSpot() { return SS.swing || (SS.swing = spot('home', WEEK.swing[0], WEEK.swing[1], 20)); }
  function clueText() {
    const left = reqLeft();
    if (!left.length) return 'Diwali\'s done. Ammamma\'s swing at home when you are ready to sleep. (Out tonight, if you want: Bunty-anna\'s rocket at the colony ground, Tiger at Immu\'s.)';
    if (left.length === 1 && left[0] === 'deepon_ki_raat') return 'Deepavali: the five boxes of sweets are given (Eid pe sevaiyan pakki!). Now twenty-one diyas on the terrace with Ammamma, from 18:30.';
    if (left.length === 1) return 'Deepavali: the diyas are lit. Still Amma\'s five boxes of sweets for the neighbours, from 15:00.';
    return 'Diwali week. Deepavali is Saturday: the sweets for the neighbours with Amma (from 15:00), then twenty-one diyas on the terrace with Ammamma (from 18:30). At Ammamma\'s swing you can ▶▶ to Saturday. If you want: Amma\'s cracker list for Sultan Bazaar (mornings), Bunty-anna\'s rocket and Tiger (nights, from Wednesday).';
  }
  function objText() {
    const left = reqLeft();
    if (!left.length) return 'Diwali\'s done. Home to sleep (Ammamma\'s swing).';
    if (left.length === 1 && left[0] === 'deepon_ki_raat') return 'Deepavali: twenty-one diyas with Ammamma (from 18:30).';
    if (left.length === 1) return 'Deepavali: Amma\'s five boxes of sweets (from 15:00).';
    return 'Diwali week: Deepavali is Saturday (Ammamma, at home).';
  }
  function hintSync() {
    const H = N.hints;
    if (!H || !H.start) return;
    const clue = clueText(), A = H.active;
    if (A && A.id === WEEK.hint && A.clue === clue) return;
    try { H.start(WEEK.hint, { clue, answer: 'home', name: 'home' }); } catch (e) { N.err('dwm.story.hint', e); }
  }
  function registerStoryHint() {
    if (!N.hints || !N.hints.register) return;
    N.hints.register(WEEK.hint, {
      clue: clueText(), answer: 'home', name: 'home', auto: 'home', aunty: 'home',
      ammamma: 'Saturday is Deepavali, *kanna*. Sweets for the neighbours at three, diyas with me after dark. Sit with me on the swing and Saturday comes quicker.',
      city: ['Diwali? Ask at any house with a rangoli, *beta*. That\'s all of them.', 'Sweets, crackers, diyas. Go home, your Ammamma is waiting.', 'Your Ammamma\'s swing, *beta*. Where else does Diwali start?'],
    });
  }
  function storySave(why) {
    try { if (N.save && N.save.save && N.save.save({ reason: 'mission', toast: false })) toast('SIDE A saved ●', 2000, 'save'); } catch (e) { N.err('dwm.story.save:' + (why || ''), e); }
  }

  /** The way in: Mon 20 Oct 2003, a card in the story's own voice (story2's scene runner: no save half-way). */
  async function sceneIn(sc, back) {
    const p = N.player;
    await sc.wait(0.2);
    await sc.jumpTo(weekStart(), { fx: back ? 'rewind' : 'ff' });
    const h = spot('home', 6, 16, 24);
    if (h && p) { if (p.vehicle && N.vehicles && N.vehicles.exit) { try { N.vehicles.exit(p, true); } catch (e) { /* ignore */ } } p.teleport(h.x, h.y); try { if (N.render.snapCamera) N.render.snapCamera(); } catch (e) { /* ignore */ } }
    npc(sc, 'amma', spot('home', 16, 4), { idle: 'stand' });
    face('amma', 'player');
    await sc.cutscene([{ type: 'card', title: 'MON 20 OCT 2003', sub: back ? '◀◀ The week Side A forgot to record: Diwali.' : 'Diwali week. The pataakha stalls are up on Sultan Bazaar.', ms: 3400 }]);
    await sc.talk([
      { s: 'amma', t: '{nick}! Deepavali is on Saturday. Your Nanna has already started counting phuljhadis.' },
      { s: 'ammamma', t: 'Sweets for the neighbours on Saturday afternoon, *kanna*, and twenty-one diyas on the terrace after dark. You are my helper this year.' },
      { s: 'chinnu', t: 'Immu also? He can carry the matchbox.' },
      { s: 'amma', t: 'Immu won\'t be here for the next one, {nick}. So this one, we do properly.', mood: 'sad' },
      { s: 'chinnu', t: '...', mood: 'sad' },
      { s: 'ammamma', t: 'Then we light so many, he can see them from the aeroplane.' },
    ]);
    F().dw_story = 'week';
  }
  /** The way out (after "Sleep ▶▶" at Ammamma's swing): then the interlude, as before. */
  async function sceneOut(sc) {
    const am = N.npcs && N.npcs.get ? N.npcs.get('ammamma') : null;
    if (!am || am.level) npc(sc, 'ammamma', spot('home', WEEK.swing[0], WEEK.swing[1], 20), { idle: 'sit' });
    face('ammamma', 'player');
    await sc.cutscene([{ type: 'text', lines: ['Deepavali night. The colony smells of gunpowder and ghee; somewhere, one last rocket goes up.'], ms: 3200 }]);
    await sc.talk([
      { s: 'ammamma', t: 'Sweets given, diyas lit. Lakshmi has our address now, *kanna*. Go and sleep.' },
      { s: 'chinnu', t: 'Ammamma... next Diwali, who do I take the first box to?', mood: 'sad' },
      { s: 'ammamma', t: 'Next Diwali, you light one diya extra. For him. Lakshmi knows the way to America also.' },
      { s: 'chinnu', t: 'Twenty-two is showing off.' },
      { s: 'ammamma', t: 'For him, we show off.' },
    ]);
    await sc.cutscene([{ type: 'text', lines: ['The diyas burn down one by one. On the shelf, the 2-in-1 still says 812.'], ms: 3400 }]);
  }
  function storyBegin() {
    if (SS.busy || !storyPending() || !storyOK() || N.story2.scene || run()) return Promise.resolve(false);
    const f = F();
    if (f.dw_story === 'week') { weekOn(true); return Promise.resolve(true); }
    SS.busy = true;
    // a save from after the interlude (an older build skipped the week): back to its own date afterwards
    const back = f.interlude_done ? nowSpec() : null;
    return N.story2.runScene('diwali_in', (sc) => sceneIn(sc, back)).then((ok) => {
      SS.busy = false;
      if (!ok) return false;
      const g = F();
      g.dw_story = 'week';
      if (back) g.dw_back = back; else delete g.dw_back;
      weekOn(false);
      const p = N.player; if (p) ST.stepOut = { x: p.x, y: p.y, t: absMin() };
      storySave('diwali week');
      toast('Diwali week. The plan is on the Clues page of the Journal (J).', 3400);
      N.emit('dwstory', { phase: 'week' });
      return true;
    }, (e) => { SS.busy = false; N.err('dwm.story.in', e); return false; });
  }
  /** the week is on (after the card, or after a load inside it) */
  function weekOn(loaded) {
    try { if (N.calendar && N.calendar.setHorizon) N.calendar.setHorizon(WEEK.horizon); } catch (e) { N.err('dwm.story.loop', e); }
    if (!inWeek() && N.calendar && N.calendar.jumpTo) { try { N.calendar.jumpTo(weekStart(), { fx: 'ff' }); } catch (e) { N.err('dwm.story.date', e); } }
    hintSync();
    SS.t = 0;
    if (loaded) toast(objText(), 3200);
  }
  function storySleep() {
    if (SS.ending || !storyWeek() || reqLeft().length || run() || !storyOK() || N.story2.scene) return false;
    SS.ending = true;
    storyClear();
    N.story2.runScene('diwali_out', sceneOut).then((ok) => {
      SS.ending = false;
      if (!ok) return;
      const f = F();
      f.dw_story = 'done';
      const back = f.dw_back; delete f.dw_back;
      try { if (N.calendar && N.calendar.setHorizon) N.calendar.setHorizon(null); } catch (e) { N.err('dwm.story.loop', e); }
      try { const A = N.hints && N.hints.active; if (A && A.id === WEEK.hint) N.hints.stop(); } catch (e) { /* ignore */ }
      N.emit('dwstory', { phase: 'done' });
      if (f.interlude_done) {
        // (a save from after the interlude) ▶▶ back to the date it was made on
        const to = back || (N.calendar && N.calendar.DATES && N.calendar.DATES.interlude) || [2003, 11, 1, 19, 40];
        Promise.resolve(N.calendar.jumpTo(to, { fx: 'ff' })).then(() => storySave('diwali done'), (e) => N.err('dwm.story.back', e));
        return;
      }
      storySave('diwali done');
      try { if (N.story2.interlude) N.story2.interlude(); } catch (e) { N.err('dwm.story.interlude', e); }
    }, (e) => { SS.ending = false; N.err('dwm.story.out', e); });
    return true;
  }
  function storyClear() {
    if (SS.jc) { SS.jc = null; try { N.hud.jcard(null); } catch (e) { /* ignore */ } }
    for (const id of SS.blips) { try { N.hud.unblip(id); } catch (e) { /* ignore */ } }
    SS.blips.clear();
    if (SS.obj != null) { try { if (N.hud.objectiveText === SS.obj) N.hud.objective(null); } catch (e) { /* ignore */ } SS.obj = null; }
    SS.card = null;
    if (SS.npc) { despawn(SS.npc); SS.npc = null; }
  }
  function storyBlip(id, at, o) {
    try { if (!SS.blips.has(id) || o.force) N.hud.blip(id, at, Object.assign({ color: '#f2c230', icon: 'giver', pulse: true, edge: false, size: 1.1 }, o)); } catch (e) { return; }
    SS.blips.add(id);
  }
  function storyUnblip(id) { if (SS.blips.has(id)) { try { N.hud.unblip(id); } catch (e) { /* ignore */ } SS.blips.delete(id); } }
  /** per step in free roam: the chapter's J-card at Ammamma's swing, the blips, the objective line, the clue */
  function storyTick(dt) {
    if (!storyWeek() || SS.ending) { if (SS.card || SS.blips.size || SS.obj != null || SS.jc) storyClear(); return; }
    const M = N.missions, p = N.player;
    const busy = !!(run() || (N.story2 && N.story2.scene) || (N.calendar && N.calendar.jumping) || mode() !== 'play');
    SS.t -= dt;
    if (SS.t <= 0) {
      SS.t = 0.5;
      hintSync();
      const left = reqLeft();
      let card = null;
      if (!busy) {
        if (!left.length) card = { kind: 'sleep' };
        else if (!left.some(openNow)) { const w = nextWindow(left); if (w) card = Object.assign({ kind: 'wait' }, w); }
      }
      if (card) { const s = swingSpot(); card.x = s.x; card.y = s.y; card.r = WEEK.r; }
      SS.card = card;
      if (card) storyBlip('dwstory:card', { x: card.x, y: card.y }, { label: card.kind === 'sleep' ? 'Ammamma: sleep' : 'Ammamma: Deepavali ▶▶', force: !SS.lastCard || SS.lastCard.x !== card.x || SS.lastCard.y !== card.y });
      else storyUnblip('dwstory:card');
      SS.lastCard = card;
      // a required giver that is open but not on the minimap (the runner shows the nearest three side givers)
      for (const id of REQ) {
        const show = !busy && openNow(id) && !(N.hud.blips && N.hud.blips.has('giver:' + id));
        if (show) { const g = M.giverPos(M.defs[id]); if (g) storyBlip('dwstory:' + id, { x: g.x, y: g.y }, { label: M.defs[id].title }); }
        else storyUnblip('dwstory:' + id);
      }
      // Ammamma at the swing for the card after her swing hours (21:00)
      const am = N.npcs && N.npcs.get ? N.npcs.get('ammamma') : null;
      if (card && (!am || am.level) && !SS.npc && N.npcs && N.npcs.spawn && p && Math.hypot(card.x - p.x, card.y - p.y) < 500) {
        try { const a = N.npcs.spawn('ammamma', { x: card.x, y: card.y }, { key: 'dwstory:ammamma', idle: 'sit', talk: false, owner: 'diwali-story' }); if (a) SS.npc = 'dwstory:ammamma'; } catch (e) { N.err('dwm.story.npc', e); }
      } else if ((!card || (am && !am.level && am.key !== 'dwstory:ammamma')) && SS.npc) { despawn(SS.npc); SS.npc = null; }
      // the objective line in free roam (missions and scenes write their own)
      if (!busy) {
        const t = objText(), cur = N.hud.objectiveText || '';
        if ((!cur || cur === SS.obj) && cur !== t) { try { N.hud.objective(t); } catch (e) { /* ignore */ } }
        if (!cur || cur === SS.obj) SS.obj = t;
      }
    }
    // a required activity open right here whose giver still waits for him to step out (the runner's cooldown after a
    // pass close by, e.g. Mithai Run ends at the door 30 u from Ammamma; or the step-out gate after a load): its own
    // J-card, E only (never by itself), so "Wait till 18:30 ▶▶" at the swing goes straight on to the diyas
    let RQ = null;
    if (!busy && p && !p.level && !p.vehicle && !p.controlsLocked && !M.prompt) {
      for (const id of REQ) {
        if (!openNow(id)) continue;
        const g = M.giverPos(M.defs[id]), r = (M.defs[id].giver && M.defs[id].giver.r) || 14, k = SS.jc === 'dwstory:play:' + id ? 6 : 0;
        // (Ammamma's ring follows her: walked into, she gets nudged off the swing; the swing itself counts too)
        const sw = M.defs[id].giver && M.defs[id].giver.npc === 'ammamma' ? (SS.swing || (SS.swing = spot('home', WEEK.swing[0], WEEK.swing[1], 20))) : null;
        if ((g && Math.hypot(p.x - g.x, p.y - g.y) <= r + k) || (sw && Math.hypot(p.x - sw.x, p.y - sw.y) <= WEEK.r + 4 + k)) { RQ = { id, r }; break; }
      }
    }
    SS.rqT = RQ ? (SS.rqT || 0) + dt : 0;
    if (RQ && SS.rqT > 0.6) {
      const d = M.defs[RQ.id];
      const play = () => { if (run() || !openNow(RQ.id)) return; SS.jc = null; try { N.hud.jcard(null); } catch (e) { /* ignore */ } try { M.start(RQ.id, { fromGiver: true }); } catch (e) { N.err('dwm.story.start', e); } };
      const spec = { key: 'dwstory:play:' + RQ.id, kind: 'side', head: 'SIDE ACTIVITY', title: String(d.title || RQ.id).toUpperCase(), sub: (dateNow() ? dateNow().label : '') + ' · ' + fmtHM(Math.floor(N.clock.minutes)), line: d.jcardLine || '', playLabel: '▶ PLAY', progress: 0, onPlay: play };
      SS.jc = spec.key;
      try { N.hud.jcard(spec); } catch (e) { N.err('dwm.story.jcard', e); }
      N.interact.offer({ label: '▶ PLAY', priority: 6, dist: 0, use: play });
      return;
    }
    if (SS.jc && /^dwstory:play:/.test(SS.jc) && !RQ) { SS.jc = null; try { N.hud.jcard(null); } catch (e) { /* ignore */ } }
    // the J-card (missions.js style: E or the button; "Not now — step out")
    const C = SS.card;
    const near = C && !busy && p && !p.controlsLocked && Math.hypot(p.x - C.x, p.y - C.y) <= C.r + (SS.jc ? 6 : 0) && !p.level && !(p.vehicle);
    if (!near) { if (SS.jc) { SS.jc = null; try { N.hud.jcard(null); } catch (e) { /* ignore */ } } return; }
    if (M.prompt) { SS.jc = null; return; } // a mission's own J-card is up here
    const go = () => {
      const c = SS.card;
      if (!c || run()) return;
      if (c.kind === 'sleep') { storySleep(); return; }
      SS.jc = null; try { N.hud.jcard(null); } catch (e) { /* ignore */ }
      try { N.calendar.jumpTo([c.ymd[0], c.ymd[1], c.ymd[2], Math.floor(c.a / 60), c.a % 60], { fx: 'ff' }); } catch (e) { N.err('dwm.story.wait', e); }
      SS.t = 0;
    };
    const d = M.defs[C.id] || {};
    const spec = C.kind === 'sleep' ? {
      key: 'dwstory:sleep', kind: 'side', head: 'DIWALI WEEK', title: 'DIWALI\'S DONE', sub: (dateNow() ? dateNow().label : '') + ' · ' + fmtHM(Math.floor(N.clock.minutes)),
      line: 'Ammamma: “Lakshmi has our address now. Sleep, kanna.”' + (openNow('rocket_bunty') || openNow('tiger_ko_bachao') ? ' (Bunty-anna\'s rocket and Tiger are out tonight, if you want.)' : ''),
      playLabel: 'Sleep ▶▶', progress: 0, onPlay: go,
    } : {
      key: 'dwstory:wait:' + C.id + ':' + C.d + ':' + C.a, kind: 'side', head: 'DIWALI WEEK', title: String(d.title || C.id).toUpperCase(), sub: C.label + ' · ' + fmtHM(C.a),
      line: (d.jcardLine || '') + (openNow('pataakha_bazaar') ? ' (Amma\'s cracker list is open till 15:00, if you want.)' : ''),
      playLabel: 'Wait till ' + (C.today ? '' : C.label.charAt(0) + C.label.slice(1, 3).toLowerCase() + ' ' + C.d + ' Oct · ') + fmtHM(C.a) + ' ▶▶', progress: 0, onPlay: go,
    };
    SS.jc = spec.key;
    try { N.hud.jcard(spec); } catch (e) { N.err('dwm.story.jcard', e); }
    N.interact.offer({ label: C.kind === 'sleep' ? 'Sleep ▶▶' : 'Wait ▶▶', priority: 6, dist: 0, use: go });
  }
  /** the chapter's marker at the swing (2D; the minimap blip shows it in every view) */
  function drawStoryMarker() {
    const C = SS.card, R = N.render;
    if (!C || run() || !R || !R.inView || !R.inView(C.x, C.y, 60) || (N.view3d && N.view3d.active)) return;
    const t = (N.time && N.time.real) || 0;
    R.queue('ground', 3, (ctx) => {
      const k0 = R.k(0), Z = R.Z, X = R.sx(C.x, k0), Y = R.sy(C.y, k0), r = Math.max(14, C.r) * Z, pu = 0.5 + 0.5 * Math.sin(t * 3.2);
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, r * 1.3);
      g.addColorStop(0, 'rgba(242,194,48,0.45)'); g.addColorStop(1, 'rgba(242,194,48,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r * 1.3, 0, TAU); ctx.fill();
      ctx.lineWidth = Math.max(2, 3 * Z); ctx.strokeStyle = 'rgba(18,13,22,0.45)'; ctx.beginPath(); ctx.arc(X, Y, r * (0.9 + 0.06 * pu), 0, TAU); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, 2 * Z); ctx.strokeStyle = '#f2c230'; ctx.beginPath(); ctx.arc(X, Y, r * (0.9 + 0.06 * pu), 0, TAU); ctx.stroke();
      const top = Y - (34 * Z + Math.sin(t * 2.6) * 3 * Z), s = Math.max(4, 5.6 * Z);
      ctx.fillStyle = '#120d16'; ctx.beginPath(); ctx.moveTo(X, top - s * 1.55); ctx.lineTo(X + s * 1.1, top); ctx.lineTo(X, top + s * 1.55); ctx.lineTo(X - s * 1.1, top); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(X, top - s); ctx.lineTo(X + s * 0.68, top); ctx.lineTo(X, top + s); ctx.lineTo(X - s * 0.68, top); ctx.closePath(); ctx.fill();
    });
    if ((R.night || 0) > 0.05 && R.lights) R.lights.push({ x: C.x, y: C.y, r: C.r * 2.4, color: '#f2c230', intensity: 0.85 });
  }
  function onStoryPass(id) {
    if (REQ.indexOf(id) < 0) return;
    setTimeout(() => {
      if (!storyWeek() || run() || (N.story2 && N.story2.scene)) return;
      hintSync();
      storySave('diwali ' + id);
      if (!reqLeft().length) toast('Diwali\'s done. Ammamma\'s swing at home when you are ready to sleep.', 3800);
      N.emit('dwstory', { phase: 'pass', id });
    }, 1500);
  }
  const STORY = {
    REQ, WEEK,
    /** story2.js: the chapter is still to be played (it holds the interlude and Last Bell back) */
    blocks: () => storyPending() && storyOK(),
    /** story2.js, after Agle Baras or a load: the way in (or back into the week) */
    resume: () => storyBegin(),
    begin: () => storyBegin(),
    /** debug / tests: "Sleep ▶▶" without walking to the swing */
    sleep: () => storySleep(),
    state() {
      const C = SS.card;
      return {
        pending: storyPending(), week: F().dw_story || null, back: F().dw_back || null, left: reqLeft(), busy: SS.busy, ending: SS.ending,
        card: C ? { kind: C.kind, x: Math.round(C.x), y: Math.round(C.y), r: C.r, id: C.id || null, d: C.d || null, a: C.a != null ? fmtHM(C.a) : null, today: !!C.today } : null,
        jcard: SS.jc, objective: SS.obj, clue: clueText(), blips: Array.from(SS.blips),
      };
    },
  };

  /* ================================================================ 3D (N.view3d.registerLayer('dwm3d')): the same props in the 3D views */
  // The 2D drawings above are top-down only. In 3D: the 21 clay diyas (one instanced draw) and their flames (one
  // additive points cloud), the bucket and the bottle on the colony ground, the cracker box / the sweet boxes over
  // Chinnu's head, Tiger's gunny sack. Tiger himself is an 'animal' entity (view3d_actors draws him as a dog).
  const L3 = {};
  function init3D(THREE, H) {
    const g = L3.g = new THREE.Group(); g.name = 'dwm3d'; H.layer.add(g);
    L3.geos = [];
    const geo = (x) => { L3.geos.push(x); return x; };
    L3.bowls = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.75, 0.5, 0.55, 8)), H.mat('#a8502a'), 24);
    L3.bowls.count = 0; L3.bowls.frustumCulled = false; g.add(L3.bowls);
    const fg = geo(new THREE.BufferGeometry());
    L3.fpos = new Float32Array(24 * 3);
    fg.setAttribute('position', new THREE.BufferAttribute(L3.fpos, 3)); fg.setDrawRange(0, 0);
    const tex = H.tex('dwm_flame', 32, 32, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,244,190,1)'); gr.addColorStop(0.3, 'rgba(255,176,70,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    L3.fmat = new THREE.PointsMaterial({ map: tex, size: 2.4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    L3.flames = new THREE.Points(fg, L3.fmat); L3.flames.frustumCulled = false; g.add(L3.flames);
    const mk = (k, gg, hex) => { const o = new THREE.Mesh(geo(gg), H.mat(hex)); o.visible = false; g.add(o); L3[k] = o; };
    mk('bucket', new THREE.CylinderGeometry(2.1, 1.6, 3.4, 10), '#2a4a8a');
    mk('water', new THREE.CylinderGeometry(1.9, 1.9, 0.2, 10), '#6aa8e8');
    mk('bottle', new THREE.CylinderGeometry(0.8, 1.1, 4, 8), '#2a6a3a');
    mk('stick', new THREE.CylinderGeometry(0.25, 0.25, 7, 4), '#e8dcc0');
    mk('box', new THREE.BoxGeometry(5, 3.2, 4), '#d24d57');
    mk('sweets', new THREE.BoxGeometry(4.2, 1.2, 3.2), '#f2c230');
    mk('sack', new THREE.BoxGeometry(9, 0.6, 6), '#8a6a3a');
  }
  function update3D(dt, H) {
    if (!L3.g) return;
    const THREE = H.THREE, T = ST.terrace || ST.terraceKeep, t = H.time || 0;
    let nb = 0, nf = 0;
    if (T && T.list && T.list.length) {
      const m = L3.m4 || (L3.m4 = new THREE.Matrix4());
      for (const d of T.list) {
        const y = H.elev({ x: d.x, y: d.y, level: T.roof ? 'home_terrace' : null });
        if (nb < 24) { m.makeTranslation(d.x, y + 0.3, d.y); L3.bowls.setMatrixAt(nb++, m); }
        if (d.lit && nf < 24) { L3.fpos[nf * 3] = d.x; L3.fpos[nf * 3 + 1] = y + 1.3 + 0.12 * Math.sin(t * 13 + d.ph); L3.fpos[nf * 3 + 2] = d.y; nf++; }
      }
    }
    L3.bowls.count = nb; L3.bowls.instanceMatrix.needsUpdate = true;
    L3.flames.geometry.setDrawRange(0, nf); L3.flames.geometry.attributes.position.needsUpdate = true;
    L3.fmat.size = 2.2 + 0.4 * (H.night || 0);
    const p = N.player, RK = ST.rocket, C = ST.carried;
    const put = (o, on, x, y, h, ang) => { o.visible = !!on; if (on) { o.position.set(x, h, y); o.rotation.y = -(ang || 0); } };
    const pe = p ? H.elev(p) : 0;
    const bucketAt = RK && RK.carrying && p ? { x: p.x + Math.cos(p.facing || 0) * 3, y: p.y + Math.sin(p.facing || 0) * 3, h: pe + 1.7 } : RK && RK.bucket ? { x: RK.L.x - 7, y: RK.L.y + 3, h: H.elev(RK.L) + 1.7 } : null;
    put(L3.bucket, bucketAt, bucketAt && bucketAt.x, bucketAt && bucketAt.y, bucketAt && bucketAt.h);
    put(L3.water, bucketAt && (RK.water > 30 || RK.bucket), bucketAt && bucketAt.x, bucketAt && bucketAt.y, bucketAt && bucketAt.h + 1.5);
    const bot = RK && RK.bottle && !RK.launched ? RK.L : null;
    put(L3.bottle, bot, bot && bot.x, bot && bot.y, bot && H.elev(bot) + 2);
    if (bot) {
      const a = RK.aim ? RK.aim.a : 0, tilt = RK.aim ? 0.35 : 0, fl = RK.gust ? Math.sin(t * 30) * 0.12 : 0;
      put(L3.stick, true, bot.x + Math.cos(a) * 1.2, bot.y + Math.sin(a) * 1.2, H.elev(bot) + 6.5);
      L3.stick.rotation.set(0, 0, 0); L3.stick.rotateOnWorldAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -(tilt + fl));
    } else L3.stick.visible = false;
    put(L3.box, C && C.kind === 'box' && p && !p.vehicle, p && p.x, p && p.y, pe + 14.5, p && p.facing);
    const n = C && C.kind === 'mithai' && C.n ? C.n() : 0;
    put(L3.sweets, n > 0 && p, p && p.x, p && p.y, pe + 13.5 + n * 0.6, p && p.facing);
    if (n > 0) L3.sweets.scale.set(1, n, 1);
    const G = ST.garage;
    put(L3.sack, G, G && G.x, G && G.y, G && H.elev(G) + 0.3);
  }
  function dispose3D() {
    if (!L3.g) return;
    if (L3.g.parent) L3.g.parent.remove(L3.g);
    for (const x of L3.geos || []) { try { x.dispose(); } catch (e) { /* ignore */ } }
    try { if (L3.fmat) L3.fmat.dispose(); } catch (e) { /* ignore */ }
    for (const k in L3) delete L3[k];
  }
  if (N.view3d && typeof N.view3d.registerLayer === 'function') {
    N.view3d.registerLayer('dwm3d', {
      order: 47,
      init(THREE, H) { try { init3D(THREE, H); } catch (e) { N.err('dwm3d.init', e); } },
      update(dt, H) { try { update3D(dt, H); } catch (e) { N.err('dwm3d.update', e); } },
      dispose(H) { try { dispose3D(H); } catch (e) { N.err('dwm3d.dispose', e); } },
    });
  }

  /* ================================================================ save (progress, the fallback stash, Tiger's night) */
  function serialize() { return { v: 1, prog: JSON.parse(JSON.stringify(ST.prog)), box: Object.assign({}, ST.box), tiger: ST.tigerKeep ? { day: ST.keepDay } : null }; }
  function deserialize(o) {
    ST.prog = o && o.prog && typeof o.prog === 'object' ? o.prog : {};
    ST.box = {};
    if (o && o.box && typeof o.box === 'object') for (const k in o.box) { const n = o.box[k] | 0; if (n > 0 && ITEM[k]) ST.box[k] = n; }
    if (ST.tigerKeep) removeTiger(ST.tigerKeep);
    ST.lastBuy = null; ST.lastAim = null;
    if (o && o.tiger && isFinite(o.tiger.day)) ST.restoreTiger = o.tiger.day;
  }
  function restoreTigerTick() {
    if (ST.restoreTiger == null || !N.world || !N.world.built) return;
    const day = ST.restoreTiger; ST.restoreTiger = null;
    if (day !== dayKey() || !diwaliOn()) return;
    const G = ST.garage = garageSpot();
    const t = new TigerDog(G.x, G.y); t.mode = 'sleep'; t.found = true; t.angle = Math.PI;
    N.entities.add(t); dogsRegister(t); ST.tigerKeep = ST.tiger = t; ST.keepDay = day;
    ST.draws.add(drawGarage);
  }

  /* ================================================================ curfew grace after a Diwali night activity */
  function graceTick() {
    const f = F();
    if (f.no_curfew !== 'diwali') return;
    const p = N.player, h = pos('home'), m0 = N.clock ? N.clock.minutes : 0;
    const home = p && h && !p.level && Math.hypot(p.x - h.x, p.y - h.y) < 45;
    if (home || (m0 > 5 * 60 && m0 < 17 * 60) || !diwaliOn() || (ST.grace != null && ST.grace !== dayKey() && m0 > 5 * 60)) { delete f.no_curfew; ST.grace = null; }
  }

  /* ================================================================ per-step tick + draw */
  function tick(dt) {
    panelKeys();
    if (mode() === 'play') {
      for (const o of ST.offers) {
        let ok = true;
        try { ok = !o.when || !!o.when(); } catch (e) { ok = false; }
        if (ok) N.interact.offer({ label: typeof o.label === 'function' ? o.label() : o.label, priority: o.priority || 8, dist: 0, use: o.use });
      }
    }
    holdsTick(dt);
    for (const fn of Array.from(ST.ticks)) { try { fn(dt); } catch (e) { N.err('dwm.tick', e); } }
    fxTick(dt);
    if (mode() === 'play') { giversTick(dt); graceTick(); tigerKeepTick(); restoreTigerTick(); terraceKeepTick(); }
    try { storyTick(dt); } catch (e) { N.err('dwm.story', e); }
  }
  function draw() {
    if (mode() === 'title' || mode() === 'boot' || !N.render) return;
    for (const fn of ST.draws) { try { fn(); } catch (e) { N.err('dwm.draw', e); } }
    try { drawStoryMarker(); } catch (e) { N.err('dwm.story.draw', e); }
    if (!(N.view3d && N.view3d.active)) fxDraw();
  }

  /* ================================================================ N.dwMissions */
  const API = (N.dwMissions = {
    TUNE, IDS, ITEMS, season, box: boxAll, story: STORY,
    state() {
      const r = run();
      return {
        active: r && mineId(r.id) ? r.id : null,
        on: { pataakha: season('pataakha'), diwali: season('diwali') },
        available: (N.missions ? N.missions.available() : []).map((d) => d.id).filter(mineId),
        prog: JSON.parse(JSON.stringify(ST.prog)), box: boxAll(), stash: boxApi() ? 'diwali' : 'own',
      };
    },
    debug: {
      /** a snapshot for tests: the current step, the cards, the terrace, the gust, the rocket, Tiger */
      state() {
        const T = ST.terrace, G = ST.gust, RK = ST.rocket, tg = ST.tiger, p = N.player;
        return {
          step: ST.step ? ST.step.kind : null, panel: ST.panel ? ST.panel.el.querySelector('.dwm-card').getAttribute('aria-label') : null,
          card: ST.cardState ? ST.cardState() : null, carry: ST.carry ? { v: Math.round(ST.carry.v), on: ST.carry.on } : null,
          stall: ST.stall ? { x: ST.stall.x, y: ST.stall.y, own: ST.stall.own } : null,
          terrace: T ? { lit: litCount(), n: T.list.length, h: T.h, bb: T.bb, diyas: T.list.map((d) => ({ x: +d.x.toFixed(1), y: +d.y.toFixed(1), nx: d.nx, ny: d.ny, lit: d.lit })) } : null,
          gust: G ? { phase: G.phase, t: +G.t.toFixed(2), dir: G.dir, n: G.n, last: G.last || null } : null,
          rocket: RK ? { L: RK.L, bucket: RK.bucket, water: Math.round(RK.water), carrying: RK.carrying, gust: RK.gust, launched: RK.launched, burst: RK.burst || null, aim: RK.aim ? RK.aim.name : null, wind: RK.wind ? { phase: RK.wind.phase, t: +RK.wind.t.toFixed(2) } : null } : null,
          tiger: tg ? { x: tg.x, y: tg.y, mode: tg.mode, flinch: tg.flinch > 0, found: !!tg.found, home: tg.home || null } : null,
          garage: ST.garage ? { x: ST.garage.x, y: ST.garage.y } : null,
          mithai: ST.mithai ? { done: ST.mithai.done.slice(), stops: ST.mithai.stops.map((s) => { const q = pos(s.target); return { key: s.key, x: q && q.x, y: q && q.y }; }) } : null,
          acts: Array.from(ST.acts.keys()).map((id) => { const I = N.interact.get ? N.interact.get(id) : null; return I ? { id, x: I.x, y: I.y, label: I.label } : { id }; }),
          holds: ST.holds.size, stats: Object.assign({}, ST.stats), player: p ? { x: p.x, y: p.y, level: p.level || null } : null,
          fallbackFx: { sparks: FX.sp.length, rockets: FX.rk.length, shows: FX.shows.length },
        };
      },
      /** finishes the current step (debug only; the tests use real keys) */
      skip() { const s = ST.step; if (s && s.use) { s.use(); return s.kind; } return null; },
    },
  });
  void API;

  /* ================================================================ wiring */
  for (const ev of ['mission:complete', 'mission:fail', 'mission:abort']) N.on(ev, (d) => { if (!d || mineId(d.id)) cleanupAll(); });
  N.on('mission:start', (d) => {
    clearGivers();
    if (d && mineId(d.id)) { cleanupAll(); const r = run(); if (r && r.id === d.id) r.diwaliOwnsLighting = true; }
  });
  N.on('mission:pass', (d) => {
    if (!d || (d.id !== 'rocket_bunty' && d.id !== 'tiger_ko_bachao' && d.id !== 'deepon_ki_raat')) return;
    const f = F(), m0 = N.clock ? N.clock.minutes : 0;
    // a Diwali night activity ends after the curfew: the colony is out with its families tonight
    if (!f.no_curfew && (m0 >= 21 * 60 || m0 < 5 * 60)) { f.no_curfew = 'diwali'; ST.grace = dayKey(); }
  });
  N.on('game:new', () => { cleanupAll(); clearGivers(); storyClear(); SS.busy = SS.ending = false; if (ST.tigerKeep) removeTiger(ST.tigerKeep); ST.prog = {}; ST.box = {}; ST.lastBuy = ST.lastAim = null; ST.garage = null; ST.terraceKeep = null; });
  N.on('game:quit', () => { cleanupAll(); clearGivers(); storyClear(); SS.busy = SS.ending = false; });
  N.on('save:loaded', () => { cleanupAll(); clearGivers(); storyClear(); SS.busy = SS.ending = false; SS.swing = null; const p = N.player; if (p) ST.stepOut = { x: p.x, y: p.y, t: absMin() }; });
  N.on('mission:complete', (d) => { const p = N.player; if (p) ST.stepOut = { x: p.x, y: p.y, t: absMin() }; if (d && d.id) onStoryPass(d.id); });
  // ◀◀ REWIND (story2.playSeason) puts him at the door: Amma's card waits until he has stepped out (October = Diwali week)
  N.on('story2:season', () => { const p = N.player; if (p) ST.stepOut = { x: p.x, y: p.y, t: absMin() }; });

  N.addSystem({
    id: 'diwaliMissions', order: 12, runIn: ['play', 'dialogue', 'cutscene', 'minigame'],
    init() {
      ensureCss();
      defineCast();
      addGlossary();
      register();
      registerStoryHint();
      if (N.save && N.save.register) N.save.register('diwali_missions', { serialize, deserialize });
    },
    update: tick,
    draw,
    reset() { cleanupAll(); clearGivers(); if (ST.tigerKeep) removeTiger(ST.tigerKeep); FX.sp.length = 0; FX.rk.length = 0; FX.shows.length = 0; },
  });
})();
