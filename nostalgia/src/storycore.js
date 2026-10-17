/* NOSTALGIA — storycore.js  (owner: story-core agent)
 * The story layer's shared machinery (ARCHITECTURE §19, systems_design §6, §10.5, §12.5,
 * story_bible §1.4, §1.6, §6.3): the 2003 calendar, the Side A tape + the biscuit tin, the
 * walkman / home 2-in-1, and the four-tier hints. Every API is safe to call before boot and
 * while the other story modules are still stubs (missing N.seasons / N.menus / N.audio /
 * N.wanted are simply skipped).
 *
 * ---------------------------------------------------------------- N.calendar
 *   date                     -> {y, m (1-12), d, dow (0=Sun), day (N.clock.day), label 'TUE 14 JAN 2003',
 *                                short '14 JAN', iso '2003-01-14', h, mi, time '17:42'}
 *   year                     -> 2003 (N.flags.year mirrors it)
 *   label() / osd()          -> 'TUE 14 JAN 2003' / '▶ PLAY  TUE 14 JAN 2003  17:42'
 *   set(y, m, d, h?, mi?)    jump instantly (also set('2003-02-08 05:15'), set([2003, 2, 8, 5, 15]), set({y, m, d, h, mi}))
 *   await jumpTo(y, m, d, h, mi, {fx: 'ff'|'rewind'|null, ms: 1500})   VHS ▶▶ / ◀◀ (N.render.fx.vhs ramp +
 *                            OSD overlay with the date spinning); the clock is held during the jump.
 *   parse(spec) -> {y, m, d, h, mi} | null       dayOf(y, m, d) -> clock day index     dateOf(day) -> date
 *   compare(a, b) -> -1|0|1 (date specs)          isPast(spec)          inRange('MM-DD', 'MM-DD')
 *   weekday() 0..6, isSchoolDay(), isSecondSaturday()
 *   STORY                    the 12 main missions (bible §1.4/§4): {id, track, title, jcard, scribble, date,
 *                            end, rec (sfx), counter, token, chapter}; storyEntry(id); DATES (story beats)
 *   loop                     {from, to, n} | null — the elastic week loop (systems §10.5), recomputed from the
 *                            next unfinished main mission (N.missions defs with `date`, else STORY);
 *                            looping (bool, the OSD's ↻); refreshLoop(); setHorizon(spec|null) to override.
 *   jumping (bool)           a VHS jump is running.
 *   Changing the date calls N.seasons.autoFor(date) (when present), sets N.flags.year and emits
 *   'calendar:change' {date, prev, reason: 'set'|'jump'|'midnight'|'loop'|'load'}.
 *
 * ---------------------------------------------------------------- N.tape (Side A)
 *   counter 0..999, side 'A'|'B', paused (■ PAUSED, greyed), tracks [{id, sfx, label, place, counter, date,
 *   jcard}], recState {phase: 'prompt'|'rolling'|'declined', label, left} | null (HUD reads it)
 *   await rec(id?, {sfx, label, place, to, token, prompt: true, window: 8, decline, silent})  -> true|false
 *       The ● REC moment: HUD prompt (ACTION "● REC" within `window` s, auto after), N.audio.rec(sfx),
 *       counter roll to `to`, the track is added, the token goes in the tin. Defaults come from STORY by
 *       mission id (bible §1.6 counters 083…999 and REC sounds). decline: shows "● REC?" then gives up.
 *   has(id), track(id), setCounter(n, {roll}), pause(on = true) (■ PAUSED), resume()
 *   tin (Set of token ids), tokens {id: {name, desc, mission, date}}, addToken(id, {name, desc, mission})
 *   await play('sideA' | trackId, {gap})   plays the recorded sounds back as a montage; the counter runs
 *       and each track's J-card line shows (the ending uses it).
 *   Events: 'tape:rec' {id, sfx, counter}, 'tape:token' {id, name}, 'tape:pause' {paused}, 'tape:counter' {counter}
 *
 * ---------------------------------------------------------------- N.walkman (+ the home 2-in-1)
 *   owned (get/set; the `walkman` inventory item), cassettes (Set), CASSETTES (bible §6.3 metadata:
 *   {n, song, title, spot, hint, text, agent}), add(id) (cassette id; unlocks its song), addSong(songId)
 *   ('ending' after M12), has(id), list(), songs()
 *   play(id?)  cassette id | song id | 'radio:0'..'radio:2' | nothing (resume / first source)
 *   stop(), next() (cassette songs in found order -> Deccan Vani -> Band Baaja -> Pop Patang -> off),
 *   toggle(), playing -> {kind: 'tape'|'radio'|'memo', id, title, sub} | null
 *   deck.open() / deck.close() / deck.isOpen  — the 2-in-1 at `home` (ACTION "2-in-1" there once a cassette
 *   is found): play any found song or Agent memo with its dedication text.
 *   RADIO action (Q / R / pad Y / the OSD cassette icon) on foot or on a bike: tap = next source,
 *   hold 0.6 s = stop. In radio vehicles audio.js keeps the vehicle radio. Respect zones and cutscenes
 *   pause it. Events: 'walkman:play' {kind, id}, 'walkman:stop', 'walkman:cassette' {id}.
 *
 * ---------------------------------------------------------------- N.hints
 *   register(missionId, spec)  spec = [tier1, tier2, tier3, tier4] (Ammamma text, Yadagiri drop place,
 *       aunty blip place, Ask-the-city answer) or {clue, answer (place id), name, ammamma, proverb, auto,
 *       aunty, city: [deflect1, deflect2, answer], off: 'text' (tiers switched off, clue 5)}
 *   start(missionId, {clue, answer, name})   the clue becomes current (timers start); solve(id?), stop()
 *   active -> {id, clue, answer, name, elapsed (real s in play), nudge 0..4, taken: [...]} | null
 *   next(source) -> {source, tier, text, target?, place?, cost, refused?} | null
 *       source 'home' | 'std' (Ammamma: free at home / ₹1 by phone — the caller charges), 'auto' (Yadagiri:
 *       a drop point within 150 u of the answer; ₹5 charged by the caller), 'aunty' (blips the answer;
 *       +1 Chappal Meter 10 game-minutes later), 'city' (the third local asked answers).
 *   Nudges (systems §6.5, real seconds in play): 180 s objective suffix, 360 s search circle r 600 on the
 *   minimap, 600 s r 300, 900 s Immu's PS on the Clues page. Setting `hintNudges` off|normal|fast.
 *   Events: 'hint:start' {id}, 'hint:taken' {id, source, tier}, 'hint:nudge' {id, level}, 'hint:solved' {id}
 *
 * Saved through N.save.register: 'calendar', 'tape', 'walkman', 'hints'.
 * Settings read from N.settings (or N.menus.settings) when present: hintNudges, captions.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;

  /* ================================================================ helpers */
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const DAY_MS = 86400000;
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const pad3 = (n) => ('00' + Math.max(0, Math.min(999, Math.round(n)))).slice(-3);
  function pref(key, def) {
    const s = N.settings || (N.menus && N.menus.settings) || null;
    return s && s[key] != null ? s[key] : def;
  }
  function toast(text, ms, key) { try { if (N.hud && N.hud.toast) N.hud.toast(text, ms, key ? { key } : undefined); } catch (e) { N.err('storycore.toast', e); } }
  function sfx(name, o) { try { return N.audio && N.audio.sfx ? N.audio.sfx(name, o || { ui: true }) : false; } catch (e) { N.err('storycore.sfx', e); return false; } }
  function nick() { return (N.flags && N.flags.nick) || (N.player && N.player.nick) || 'Chinnu'; }
  /** {nick} / {full} / {FULL} substitution (dialogue.js / npcs.js may provide their own). */
  function subst(s) {
    s = String(s == null ? '' : s);
    try {
      if (N.dialogue && typeof N.dialogue.subst === 'function') return N.dialogue.subst(s);
      if (N.npcs && typeof N.npcs.subst === 'function') return N.npcs.subst(s);
    } catch (e) { /* fall through */ }
    const full = (N.flags && N.flags.full) || (N.player && N.player.fullName) || 'Srikanth';
    return s.replace(/\{nick\}/g, nick()).replace(/\{full\}/g, full).replace(/\{FULL\}/g, full.toUpperCase());
  }
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mode = () => (N.state && N.state.mode) || 'boot';

  /* ================================================================ story data (bible §1.4, §1.6, §4) */
  // date / end: [y, m (1-12), d, h, mi]. rec = the ● REC sound; counter = the tape counter after it.
  const STORY = [
    { id: 'bo_kaata', track: 1, chapter: 1, title: 'Bo Kaata!', jcard: 'TRACK 01 · BO KAATA! · TERRACE, SANKRANTI', scribble: 'your name is spelt wrong. —I',
      date: [2003, 1, 14, 7, 10], end: [2003, 1, 14, 18, 20], rec: 'bo_kaata', counter: 83, place: 'home_terrace',
      token: { id: 'kite_corner', name: 'The kite corner', desc: 'The torn corner of the tail, with his name spelt wrong in sketch pen.' } },
    { id: 'lost_and_found', track: 2, chapter: 1, title: 'Lost and Found', jcard: 'TRACK 02 · LOST AND FOUND · NUMAISH', scribble: 'I was NOT lost. —I',
      date: [2003, 1, 25, 16, 0], end: [2003, 1, 25, 20, 0], rec: 'announce', counter: 166, place: 'nampally_exhibition',
      token: { id: 'numaish_ticket', name: 'Numaish entry ticket', desc: 'All-India Industrial Exhibition, Nampally. Saturday, 25 January 2003.' } },
    { id: 'first_day_first_show', track: 3, chapter: 1, title: 'First Day, First Show', jcard: 'TRACK 03 · FIRST DAY FIRST SHOW · SANDHYA', scribble: "Ayesha's whistle, not yours. —I",
      date: [2003, 2, 8, 5, 15], end: [2003, 2, 8, 10, 30], rec: 'finger_whistle', counter: 249, place: 'sandhya_theatre',
      token: { id: 'toofan_stub', name: 'The ticket stub', desc: 'TOOFAN TAMMUDU · FLOOR · 8-2-03.' } },
    { id: 'last_man_batting', track: 4, chapter: 2, title: 'Last Man Batting', jcard: 'TRACK 04 · HOWZAAT! · PUBLIC GARDENS', scribble: "Chitti's catch. Write it BIG. —I",
      date: [2003, 3, 23, 9, 30], end: [2003, 3, 23, 18, 0], rec: 'howzat', counter: 332, place: 'public_gardens',
      token: { id: 'signed_ball', name: 'The signed tennis ball', desc: "Every name on it. Chitti's is the biggest." } },
    { id: 'right_right', track: 5, chapter: 2, title: 'Right, Right!', jcard: 'TRACK 05 · RIGHT, RIGHT! · IMLIBUN', scribble: 'Nani says I won the pani puri. —I',
      date: [2003, 4, 1, 13, 30], end: [2003, 4, 1, 17, 0], rec: 'conductor', counter: 415, place: 'imlibun_bus_station',
      token: { id: 'punched_ticket', name: "Ticket Thatha's punched ticket", desc: 'Koti to Imlibun. Punched twice, for luck.' } },
    { id: 'ammammas_thursday', track: 6, chapter: 2, title: "Ammamma's Thursday", jcard: 'TRACK 06 · THUMP-THUMP · HANUMAN PINDI GIRNI', scribble: "Ramulu-uncle's hair is atta. —I",
      date: [2003, 5, 15, 10, 0], end: [2003, 5, 15, 19, 30], rec: 'flour_mill', counter: 498, place: 'pindi_girni_1',
      token: { id: 'brass_token_47', name: 'Brass token No. 47', desc: "Ramulu-uncle's flour-mill token. Forty-seven." } },
    { id: 'the_clap', track: 7, chapter: 2, title: 'The Clap', jcard: 'TRACK 07 · GOLCONDA HEARD US · FATEH DARWAZA', scribble: 'Officially magic. —I',
      date: [2003, 6, 7, 14, 30], end: [2003, 6, 7, 19, 30], rec: 'clap_echo', counter: 581, place: 'golconda_fateh_darwaza',
      token: { id: 'golconda_ticket', name: 'Golconda entry ticket', desc: 'Saturday, 7 June 2003. The clap went all the way up.' } },
    { id: 'drums_for_amma', track: 8, chapter: 3, title: 'Drums for Amma', jcard: 'TRACK 08 · DRUMS FOR AMMA · LASHKAR BONALU', scribble: 'Ramulu-uncle was GOLD. —I',
      date: [2003, 7, 20, 5, 30], end: [2003, 7, 20, 13, 30], rec: 'dappu', counter: 664, place: 'ujjaini_mahankali_temple',
      token: { id: 'neem_leaf', name: 'A pressed neem leaf', desc: "From Amma's bonam, Lashkar Bonalu." } },
    { id: 'opening_day', track: 9, chapter: 3, title: 'Opening Day', jcard: 'TRACK 09 · OPENING DAY · PRASADS', scribble: 'Abba laughed the loudest. —I',
      date: [2003, 7, 25, 8, 30], end: [2003, 7, 25, 20, 0], rec: 'applause', counter: 747, place: 'prasads_imax',
      token: { id: 'prasads_stub', name: 'Prasads ticket stub', desc: '25 JUL 2003. Opening day.' } },
    { id: 'agle_baras', track: 10, chapter: 3, title: 'Agle Baras Jaldi Aana', jcard: 'TRACK 10 · AGLE BARAS · TANK BUND', scribble: '',
      date: [2003, 9, 9, 15, 0], end: [2003, 9, 10, 19, 0], rec: 'crowd_cheer', counter: 812, place: 'tank_bund',
      token: { id: 'gulal', name: 'A packet of gulal', desc: 'Ganesh immersion night, Tank Bund.' } },
    { id: 'last_bell', track: 11, chapter: 4, title: 'Last Bell', jcard: 'TRACK 11 · NO BELLS · NAUBAT PAHAD', scribble: "the wind. ammamma says god won't mind.",
      date: [2003, 11, 21, 8, 40], end: [2003, 11, 21, 18, 30], rec: 'kite_wind', counter: 905, place: 'birla_mandir',
      token: { id: 'slam_book_page', name: "Immu's slam-book page", desc: '"Fav place: where you can see everything we collected at once."' } },
    { id: 'chand_raat', track: 12, chapter: 4, title: 'Chand Raat', jcard: 'TRACK 12 · CHAND RAAT · CHARMINAR', scribble: '999. Full. —I & C',
      date: [2003, 11, 25, 18, 30], end: [2003, 11, 25, 23, 30], rec: 'bangles', counter: 999, place: 'charminar',
      token: { id: 'side_a_copy', name: 'The Side A copy', desc: 'Copied at Raag Recording Centre. The original flew to New Jersey.' } },
  ];
  const STORY_BY_ID = {};
  for (const s of STORY) STORY_BY_ID[s.id] = s;
  // Story beats that are not missions (prologue/interlude/ending/epilogue) — bible §1.4, §4, §9.
  const DATES = {
    prologue: [2026, 1, 14, 18, 5], bhogi: [2003, 1, 13, 6, 0], sankranti: [2003, 1, 14, 7, 10],
    world_cup_final: [2003, 3, 23, 13, 30], ugadi: [2003, 4, 2, 7, 0], schools_reopen: [2003, 6, 12, 8, 0],
    ganesh_chaturthi: [2003, 8, 31, 8, 0], boat_coda: [2003, 9, 10, 17, 30], interlude: [2003, 11, 1, 19, 40],
    eid: [2003, 11, 26, 8, 0], ending: [2003, 11, 27, 23, 20], flight: [2003, 11, 27, 23, 40], epilogue: [2026, 1, 17, 16, 0],
  };

  /* ================================================================ N.calendar */
  function baseUTC() { const b = N.clock.baseDate || [2003, 0, 14]; return Date.UTC(b[0], b[1], b[2]); }
  function dayOf(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - baseUTC()) / DAY_MS); }
  function dateOf(day, minutes) {
    const t = new Date(baseUTC() + Math.round(day) * DAY_MS);
    const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1, d = t.getUTCDate(), dow = t.getUTCDay();
    const mins = minutes == null ? N.clock.minutes : minutes;
    const h = Math.floor(mins / 60) % 24, mi = Math.floor(mins % 60);
    return {
      y, m, d, dow, day: Math.round(day), h, mi, time: pad2(h) + ':' + pad2(mi),
      label: DAYS[dow] + ' ' + pad2(d) + ' ' + MONTHS[m - 1] + ' ' + y,
      short: pad2(d) + ' ' + MONTHS[m - 1], dayName: DAYS[dow],
      iso: y + '-' + pad2(m) + '-' + pad2(d),
    };
  }
  /** Accepts [y, m, d, h?, mi?], {y, m, d, h, mi}, 'YYYY-MM-DD[ HH:MM]', 'HH:MM' (today), or a day index. */
  function parse(a, b, c, h, mi) {
    if (typeof a === 'number' && b != null && c != null) return { y: a, m: b, d: c, h: h == null ? null : h, mi: mi == null ? null : mi };
    if (typeof a === 'number') { const dt = dateOf(a); return { y: dt.y, m: dt.m, d: dt.d, h: null, mi: null }; }
    if (Array.isArray(a)) return a.length >= 3 ? { y: +a[0], m: +a[1], d: +a[2], h: a[3] == null ? null : +a[3], mi: a[4] == null ? null : +a[4] } : null;
    if (a && typeof a === 'object') return isFinite(a.y) && isFinite(a.m) && isFinite(a.d) ? { y: +a.y, m: +a.m, d: +a.d, h: a.h == null ? null : +a.h, mi: a.mi == null ? null : +a.mi } : null;
    if (typeof a === 'string') {
      let r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(a.trim());
      if (r) return { y: +r[1], m: +r[2], d: +r[3], h: r[4] == null ? null : +r[4], mi: r[5] == null ? null : +r[5] };
      r = /^(\d{1,2}):(\d{2})$/.exec(a.trim());
      if (r) { const t = dateOf(N.clock.day); return { y: t.y, m: t.m, d: t.d, h: +r[1], mi: +r[2] }; }
    }
    return null;
  }
  function specKey(p) { return dayOf(p.y, p.m, p.d) * 1440 + (p.h == null ? 0 : p.h * 60 + (p.mi || 0)); }
  function nowKey() { return N.clock.day * 1440 + Math.floor(N.clock.minutes); }

  const cal = { lastDay: null, lastStop: -1, override: null, jump: null, overlay: null, display: null };

  function seasonsFor(date) {
    try { if (N.seasons && typeof N.seasons.autoFor === 'function') N.seasons.autoFor(date); } catch (e) { N.err('calendar.seasons', e); }
  }
  function dateChanged(reason) {
    const date = dateOf(N.clock.day);
    const prev = cal.lastDay == null ? null : dateOf(cal.lastDay);
    cal.lastDay = N.clock.day;
    if (N.flags && N.flags.year !== date.y && (date.y === 2003 || date.y === 2026)) N.flags.year = date.y;
    seasonsFor(date);
    N.emit('calendar:change', { date, prev, reason: reason || 'set' });
    return date;
  }

  // The elastic week loop (systems §10.5): between missions the days run normally until the day
  // before the next main mission; from there the last 7 days loop (D-7 .. D-1), or from the day
  // after the previous mission when that gap is shorter.
  function missionDate(id) {
    const def = N.missions && N.missions.defs && N.missions.defs[id];
    const p = def && def.date ? parse(def.date) : null;
    if (p) return p;
    const s = STORY_BY_ID[id];
    return s ? parse(s.date) : null;
  }
  function isDone(id) { try { return !!(N.missions && N.missions.isDone && N.missions.isDone(id)); } catch (e) { return false; } }
  function nextMainDate() {
    if (cal.override) return cal.override;
    // registered main missions with a date, in registration order, then the bible table
    const ids = [];
    const defs = (N.missions && N.missions.defs) || {};
    for (const id in defs) { const d = defs[id]; if (d && d.date && (d.kind || 'main') === 'main') ids.push(id); }
    for (const s of STORY) if (ids.indexOf(s.id) < 0) ids.push(s.id);
    let best = null;
    for (const id of ids) {
      if (isDone(id)) continue;
      const p = missionDate(id);
      if (!p) continue;
      if (!best || specKey(p) < specKey(best)) best = p;
    }
    return best;
  }
  function refreshLoop() {
    const p = nextMainDate();
    if (!p) { N.clock.setLoop(null); return null; }
    const D = dayOf(p.y, p.m, p.d);
    const to = D - 1, from = Math.max(D - 7, cal.lastStop + 1);
    if (to < from || N.clock.day > to) { N.clock.setLoop(null); return null; }
    return N.clock.setLoop(from, to);
  }

  function applySet(p, reason) {
    N.clock.day = dayOf(p.y, p.m, p.d);
    if (p.h != null) N.clock.set(p.h, p.mi || 0);
    refreshLoop();
    return dateChanged(reason || 'set');
  }

  const C = (N.calendar = {
    STORY, DATES, MONTHS, DAYS,
    storyEntry: (id) => STORY_BY_ID[id] || null,
    get date() { return dateOf(N.clock.day); },
    get year() { return dateOf(N.clock.day).y; },
    get loop() { return N.clock.loop; },
    get looping() { return N.clock.looping; },
    get jumping() { return !!cal.jump; },
    parse, dayOf, dateOf,
    label() { return dateOf(N.clock.day).label; },
    /** The label the HUD shows (it spins during a VHS jump). */
    displayLabel() { return cal.display || dateOf(N.clock.day).label; },
    osd() { const d = dateOf(N.clock.day); return '▶ PLAY  ' + d.label + '  ' + d.time; },
    compare(a, b) { const pa = parse(a), pb = parse(b); if (!pa || !pb) return 0; const ka = specKey(pa), kb = specKey(pb); return ka < kb ? -1 : ka > kb ? 1 : 0; },
    isPast(spec) { const p = parse(spec); return !!p && specKey(p) < nowKey(); },
    /** inRange('04-24', '06-11') — inclusive month-day window (wraps over New Year). */
    inRange(from, to) {
      const md = (s) => { const r = /^(\d{1,2})-(\d{1,2})$/.exec(s); return r ? +r[1] * 100 + +r[2] : 0; };
      const d = dateOf(N.clock.day), v = d.m * 100 + d.d, a = md(from), b = md(to);
      return a <= b ? v >= a && v <= b : v >= a || v <= b;
    },
    weekday() { return dateOf(N.clock.day).dow; },
    isSecondSaturday() { const d = dateOf(N.clock.day); return d.dow === 6 && d.d >= 8 && d.d <= 14; },
    /** Mon–Sat in term (12 Jun .. 23 Apr), not on the second Saturday (systems §10.5). */
    isSchoolDay() { const d = dateOf(N.clock.day); return d.dow !== 0 && !C.isSecondSaturday() && !C.inRange('04-24', '06-11'); },
    set(y, m, d, h, mi) {
      const p = parse(y, m, d, h, mi);
      if (!p) { N.err('calendar.set', new Error('bad date ' + JSON.stringify([y, m, d, h, mi]))); return null; }
      return applySet(p, 'set');
    },
    /** VHS ▶▶ (forward) / ◀◀ (backwards) jump; resolves after the effect (default 1.5 s). */
    jumpTo(y, m, d, h, mi, opts) {
      let p, o;
      if (typeof y === 'number' && m != null && d != null) { p = parse(y, m, d, h, mi); o = opts; } else { p = parse(y); o = m && typeof m === 'object' && !Array.isArray(m) ? m : opts; }
      o = o || {};
      if (!p) { N.err('calendar.jumpTo', new Error('bad date')); return Promise.resolve(null); }
      if (p.h == null) { p.h = Math.floor(N.clock.minutes / 60); p.mi = Math.floor(N.clock.minutes % 60); }
      const target = specKey(p), now = nowKey();
      const fx = o.fx === undefined ? (target > now + 1 ? 'ff' : target < now - 1 ? 'rewind' : null) : o.fx;
      if (cal.jump) finishJump(cal.jump);
      const md = mode();
      if (!fx || md === 'boot' || md === 'title' || !N.render || !N.render.fx) return Promise.resolve(applySet(p, 'jump'));
      return new Promise((resolve) => {
        const reduced = document.body && document.body.classList.contains('reduced-motion');
        const j = { p, fx, t: 0, ms: Math.max(300, o.ms || 1500), resolve, fromDay: N.clock.day, toDay: dayOf(p.y, p.m, p.d), applied: false,
          reduced, wasLocked: N.player ? !!N.player.controlsLocked : false, vhs0: N.render.fx.vhs || 0 };
        cal.jump = j;
        N.clock.hold('vhs-jump', true);
        if (N.player) N.player.controlsLocked = true;
        sfx('rewind', { ui: true, pitch: fx === 'ff' ? 1.15 : 1 });
        showOverlay(fx);
        N.emit('calendar:jump', { fx, to: p });
      });
    },
    /** Pin the next stop for the week loop (story beats like the interlude); null = automatic. */
    setHorizon(spec) { cal.override = spec ? parse(spec) : null; return refreshLoop(); },
    refreshLoop,
    /** Mark "a main mission just ended here" (the loop never starts before the day after it). */
    markStop(day) { cal.lastStop = day == null ? N.clock.day : day; refreshLoop(); },
    get lastStop() { return cal.lastStop; },
  });

  function showOverlay(fx) {
    const ui = document.getElementById('ui');
    if (!ui) return;
    if (!cal.overlay) {
      cal.overlay = el('div', 'sc-vhs', ui, '<div class="sc-vhs-mode"></div><div class="sc-vhs-date"></div>');
    }
    cal.overlay.querySelector('.sc-vhs-mode').textContent = fx === 'ff' ? '▶▶ FF' : '◀◀ REW';
    cal.overlay.classList.add('show');
  }
  function hideOverlay() { if (cal.overlay) cal.overlay.classList.remove('show'); cal.display = null; }
  function finishJump(j) {
    if (!j || j.done) return;
    j.done = true;
    if (!j.applied) { j.applied = true; applySet(j.p, 'jump'); }
    N.render.fx.vhs = j.vhs0;
    N.clock.hold('vhs-jump', false);
    if (N.player && !j.wasLocked) N.player.controlsLocked = false;
    hideOverlay();
    if (cal.jump === j) cal.jump = null;
    try { j.resolve(dateOf(N.clock.day)); } catch (e) { N.err('calendar.jump', e); }
  }
  function jumpUpdate(dt) {
    const j = cal.jump;
    if (!j) return;
    if (mode() === 'paused') return;
    j.t += dt * 1000 / j.ms;
    const t = Math.min(1, j.t);
    N.render.fx.vhs = Math.max(j.vhs0, Math.sin(Math.PI * t) * (j.reduced ? 0.35 : 0.95));
    const day = Math.round(U.lerp(j.fromDay, j.toDay, U.smooth(t)));
    const lab = dateOf(day).label;
    cal.display = lab;
    if (cal.overlay) { const dEl = cal.overlay.querySelector('.sc-vhs-date'); if (dEl.textContent !== lab) dEl.textContent = lab; }
    if (t >= 0.5 && !j.applied) { j.applied = true; applySet(j.p, 'jump'); }
    if (t >= 1) finishJump(j);
  }

  N.on('clock:day', () => dateChanged('midnight'));
  N.on('clock:loop', () => { dateChanged('loop'); toast('↻ The tape plays the same week again...', 2600); });

  /* ================================================================ N.tape */
  const tape = { counter: 0, shown: 0, side: 'A', paused: false, tracks: [], tin: new Set(), tokens: {}, rec: null, roll: null, playing: false };

  function rollTo(n, secs) {
    n = U.clamp(Math.round(n), 0, 999);
    tape.roll = { from: tape.shown, to: n, t: 0, dur: Math.max(0.05, secs == null ? 1.6 : secs) };
    tape.counter = n;
    N.emit('tape:counter', { counter: n });
  }
  function tapeUpdate(dt) {
    const r = tape.roll;
    if (r) {
      r.t += dt / r.dur;
      tape.shown = Math.round(U.lerp(r.from, r.to, U.smooth(Math.min(1, r.t))));
      if (r.t >= 1) { tape.shown = r.to; tape.roll = null; }
    }
    const R = tape.rec;
    if (R && R.phase === 'prompt' && mode() !== 'paused') {
      R.left -= dt;
      if (mode() === 'play') {
        // ACTION is taken here directly (works even while a script holds the controls); the offer
        // only puts "● REC" on the ACTION button / desktop prompt.
        if (N.input && N.input.pressed('action')) { N.input.consume('action'); R.fire('action'); return; }
        if (N.interact && N.player && !N.player.controlsLocked) N.interact.offer({ label: '● REC', priority: 8, dist: 0, use: () => { R.fire('action'); } });
      }
      if (R.left <= 0) R.fire('auto');
    } else if (R && R.phase === 'declined') {
      R.left -= dt;
      if (R.left <= 0) R.fire('declined');
    }
  }

  function addToken(id, o) {
    if (!id) return false;
    o = o || {};
    const isNew = !tape.tin.has(id);
    tape.tin.add(id);
    const prev = tape.tokens[id] || {};
    tape.tokens[id] = { name: o.name || prev.name || id, desc: o.desc || prev.desc || '', mission: o.mission || prev.mission || null, date: prev.date || dateOf(N.clock.day).label };
    if (isNew) {
      if (!o.silent) toast('Into the tin: ' + subst(tape.tokens[id].name), 2600);
      N.emit('tape:token', { id, name: tape.tokens[id].name });
    }
    return isNew;
  }

  function recDefaults(id) {
    const s = STORY_BY_ID[id];
    return s ? { sfx: s.rec, label: s.jcard, place: s.place, to: s.counter, token: s.token, jcard: s.jcard } : {};
  }

  const T = (N.tape = {
    TRACKS: STORY,
    get counter() { return tape.counter; },
    get shown() { return tape.shown; },
    get side() { return tape.side; },
    set side(v) { tape.side = v === 'B' ? 'B' : 'A'; },
    get paused() { return tape.paused; },
    get tracks() { return tape.tracks.slice(); },
    get tin() { return tape.tin; },
    get tokens() { return tape.tokens; },
    get recState() { const R = tape.rec; return R ? { phase: R.phase, label: R.label, left: Math.max(0, R.left) } : null; },
    get rolling() { return !!tape.roll; },
    has: (id) => tape.tracks.some((t) => t.id === id),
    track: (id) => tape.tracks.find((t) => t.id === id) || null,
    setCounter(n, o) { if (o && o.roll) rollTo(n, o.secs); else { tape.counter = tape.shown = U.clamp(Math.round(n) || 0, 0, 999); tape.roll = null; N.emit('tape:counter', { counter: tape.counter }); } return tape.counter; },
    pause(on) {
      const p = on !== false;
      if (p === tape.paused) return p;
      tape.paused = p;
      N.emit('tape:pause', { paused: p });
      return p;
    },
    resume() { if (tape.paused) { T.pause(false); toast('SIDE A ▶ RESUMED', 2600); } },
    addToken,
    /** The ● REC moment (systems §6.4). Resolves true when recorded, false if declined/aborted. */
    rec(id, o) {
      if (typeof id === 'object' && id) { o = id; id = null; }
      id = id || (N.missions && N.missions.active && N.missions.active.id) || 'rec_' + (tape.tracks.length + 1);
      o = Object.assign({}, recDefaults(id), o || {});
      if (tape.rec) tape.rec.fire('replaced');
      const to = o.to != null ? o.to : Math.min(999, tape.counter + 83);
      const label = o.label || (STORY_BY_ID[id] && STORY_BY_ID[id].title) || id;
      return new Promise((resolve) => {
        const apply = (quiet) => {
          const tr = { id, sfx: o.sfx || null, label, place: o.place || null, counter: to, date: dateOf(N.clock.day).label, jcard: o.jcard || label };
          const i = tape.tracks.findIndex((t) => t.id === id);
          if (i >= 0) tape.tracks[i] = tr; else tape.tracks.push(tr);
          tape.tracks.sort((a, b) => a.counter - b.counter);
          if (tape.paused) { tape.paused = false; N.emit('tape:pause', { paused: false }); if (!quiet) toast('SIDE A ▶ RESUMED', 2600); }
          if (quiet) T.setCounter(Math.max(tape.counter, to)); else rollTo(Math.max(tape.counter, to), o.rollSecs);
          if (o.token !== false && o.token) addToken(o.token.id || id + '_token', Object.assign({ mission: id, silent: quiet }, o.token));
          N.emit('tape:rec', { id, sfx: tr.sfx, counter: tape.counter, label });
        };
        if (o.silent) { apply(true); resolve(true); return; }
        const R = { phase: o.decline ? 'declined' : 'prompt', label: o.decline ? '● REC?' : '● REC', left: o.decline ? (o.window || 1.8) : (o.prompt === false ? 0 : (o.window || 8)), done: false };
        R.fire = (how) => {
          if (R.done) return;
          R.done = true;
          if (tape.rec === R) tape.rec = null;
          if (how === 'declined' || how === 'replaced' || how === 'abort') { resolve(false); return; }
          try { if (N.audio && N.audio.rec) N.audio.rec(o.sfx); } catch (e) { N.err('tape.rec.audio', e); }
          N.emit('caption', { text: '● REC', kind: 'rec', ms: 1600 });
          if (N.render && N.render.fx) N.render.fx.flash = Math.max(N.render.fx.flash || 0, 0.18);
          apply(false);
          const wait = (o.rollSecs || 1.6) * 1000 + 250;
          setTimeout(() => resolve(true), wait);
        };
        tape.rec = R;
        if (R.left <= 0 && R.phase === 'prompt') R.fire('auto');
      });
    },
    /** Abort a pending REC prompt (mission abort). */
    cancelRec() { if (tape.rec) tape.rec.fire('abort'); },
    /** Play Side A back (or one track): the counter runs and each J-card line shows. */
    async play(which, o) {
      o = o || {};
      let list = tape.tracks.slice().sort((a, b) => a.counter - b.counter);
      if (which && which !== 'sideA' && which !== 'A') list = list.filter((t) => t.id === which);
      if (!list.length) return false;
      tape.playing = true;
      N.emit('tape:play', { which: which || 'sideA', n: list.length });
      const startAt = which && which !== 'sideA' ? tape.counter : 0;
      T.setCounter(startAt);
      const step = o.gap || 1300;
      const audioOK = !!(N.audio && N.audio.ready && N.audio.tapeMontage);
      const withSfx = list.filter((t) => t.sfx);
      const onItem = (i, arr) => {
        const tr = (arr || withSfx)[i]; if (!tr) return;
        rollTo(tr.counter, step / 1000 * 0.9);
        N.emit('caption', { text: tr.jcard || tr.label, kind: 'tape', ms: Math.max(900, step - 100) });
      };
      try {
        if (audioOK) {
          await N.audio.tapeMontage(withSfx.map((t) => t.sfx), { gap: 220, onItem: (i) => onItem(i), minStep: step, clicks: true });
        } else {
          for (let i = 0; i < list.length; i++) { onItem(i, list); await new Promise((r) => setTimeout(r, step)); }
        }
      } catch (e) { N.err('tape.play', e); }
      const end = which && which !== 'sideA' ? list[list.length - 1].counter : Math.max(999, tape.counter);
      if (!which || which === 'sideA') rollTo(Math.min(999, end), 0.6);
      sfx('tape_click', { ui: true });
      tape.playing = false;
      N.emit('tape:played', { which: which || 'sideA' });
      return true;
    },
    serialize() { return { counter: tape.counter, side: tape.side, paused: tape.paused, tracks: tape.tracks, tin: Array.from(tape.tin), tokens: tape.tokens }; },
    deserialize(o) {
      T.reset();
      if (!o || typeof o !== 'object') return;
      tape.counter = tape.shown = U.clamp(Math.round(+o.counter) || 0, 0, 999);
      tape.side = o.side === 'B' ? 'B' : 'A';
      tape.paused = !!o.paused;
      if (Array.isArray(o.tracks)) tape.tracks = o.tracks.filter((t) => t && typeof t.id === 'string').map((t) => ({ id: t.id, sfx: typeof t.sfx === 'string' ? t.sfx : null, label: String(t.label || t.id), place: t.place || null, counter: U.clamp(+t.counter || 0, 0, 999), date: String(t.date || ''), jcard: String(t.jcard || t.label || t.id) }));
      if (Array.isArray(o.tin)) for (const id of o.tin) if (typeof id === 'string') tape.tin.add(id);
      if (o.tokens && typeof o.tokens === 'object') for (const k in o.tokens) { const v = o.tokens[k]; if (v && typeof v === 'object') tape.tokens[k] = { name: String(v.name || k), desc: String(v.desc || ''), mission: v.mission || null, date: String(v.date || '') }; }
    },
    reset() {
      if (tape.rec) tape.rec.fire('abort');
      tape.counter = tape.shown = 0; tape.side = 'A'; tape.paused = false; tape.tracks = []; tape.tin = new Set(); tape.tokens = {}; tape.roll = null; tape.rec = null;
    },
  });

  /* ================================================================ N.walkman */
  const CASSETTES = {
    cassette_1: { n: 1, song: 'r_chandni', spot: 'bus_stop_10', hint: 'On the Himayatnagar stop bench, in its paper cover.', text: "From Pinky of Malakpet, for her Nani in Kurnool: 'Nani, the pickle reached. Send more.'" },
    cassette_2: { n: 2, song: 'r_barish', spot: 'std_4', hint: 'On top of the Abids STD meter. Somebody talked too long.', text: "From the Lakdikapul Morning Walkers, for the uncle who walks backwards: 'Get well soon. Your knee is famous.'" },
    cassette_3: { n: 3, song: 'r_baraat', spot: 'playground_8', hint: "Saidabad maidan, under the band's drum stand.", text: "For Saidabad's Lucky Star Band, from every baraat they made late: 'Thank you. We are still dancing.'" },
    cassette_4: { n: 4, song: 'festival', spot: 'dhoolpet', hint: 'In an idol shed, beside a half-painted Ganesh.', text: "Dhoolpet's idol painters, to the colony boys: 'Bring your lorry on time this year!'" },
    cassette_5: { n: 5, song: 'r_neon', spot: 'ameerpet_coaching', hint: 'Under a JAVA banner, dropped by a sleepy student.', text: "From the 7 pm Java batch to their sir: 'Sir, we understood nothing, but we love you.'" },
    cassette_6: { n: 6, song: 'r_pager', spot: 'chenoy_trade_centre', hint: 'In a box of beige keyboards on the cellar stairs.', text: "From a boy in Parklane to his father: 'Papa, the computer is fine. I only opened it to see inside.'" },
    cassette_7: { n: 7, song: 'day', spot: 'recording_centre_1', hint: "On the counter: 'Free sample. Take one.'", text: "From Raju of the chai bandi, Himayatnagar, to everyone who drinks on credit: 'Please. Pay.'" },
    cassette_8: { n: 8, song: 'night', spot: 'blue_sea_cafe', hint: 'Left on a marble table by a man running for a train.', text: "From a soldier at Secunderabad station to his mother in Warangal: 'Train is late. Heart is on time.'" },
    cassette_9: { n: 9, song: 'oldcity', spot: 'pathergatti', hint: "In the stone arcade, at the tape stall's 'old stock' basket.", text: "From the bangle sellers of Laad Bazaar, to every *aapa* who bargained: 'You won. Come again.'" },
    cassette_10: { n: 10, song: 'kites', spot: 'abids_book_market', hint: 'In a stack of old Tinkles. Sundays only.', text: "From the Abids Sunday book men, to the boy who reads Tinkle standing up: 'Buy one, at least!'" },
    cassette_11: { n: 11, song: 'numaish', spot: 'nampally_exhibition', hint: 'At the lost-and-found counter (after M2, all year).', text: "From the Numaish loudspeaker uncle: 'To all the lost children of 2003: you were never lost. You were near the papad.'" },
    cassette_12: { n: 12, song: 'title', spot: 'gymkhana_ground_secunderabad', hint: 'On the old pavilion step.', text: "From an old ground-man to the girls who bowl at dawn: 'Keep coming.'" },
    cassette_13: { n: 13, agent: 1, spot: 'home_terrace', hint: "Inside the water-tank lid. Immu's handwriting: AGENT.", text: "Agent Immu's Secret Fact No. 1: {nick} sleeps with his mouth open. Over." },
    cassette_14: { n: 14, agent: 2, spot: 'irani_cafe_7', hint: 'Behind the jukebox at Café Gulistan.', text: "Fact No. 2: Salim-bhai gives an extra biscuit if you say his chai is the best in Hyderabad. Over." },
    cassette_15: { n: 15, agent: 3, spot: 'school_1', hint: 'Taped under the ice-gola cart at the school gate.', text: "Fact No. 3: Vimala Ma'am smiles once a year. I have seen it. It was a Tuesday. Over." },
    cassette_16: { n: 16, agent: 4, spot: 'playground_1', hint: 'Under the cement bench at the colony ground.', text: "Fact No. 4: best friends don't say goodbye. They say 'over'. Over." },
  };
  const SONG_TITLES = { r_chandni: 'Chandni Raat Ka Cycle', r_barish: 'Baarish Mein Irani Chai', r_baraat: 'Baraat Express', festival: 'Teenmaar Toofan', r_neon: 'Neon Monsoon',
    r_pager: 'Pager Pe Message', day: 'Cycle Pe Sawaari', night: 'Chandni Chhat', oldcity: 'Gulzar Houz Ki Shaam', kites: 'Patang Ki Pech', numaish: 'Numaish Ka Jhoola',
    title: 'Yaadon Ki Gully', ending: 'Charminar Ki Chaon' };
  for (const id in CASSETTES) {
    const c = CASSETTES[id];
    c.id = id;
    c.title = c.agent ? 'Agent tape ' + c.agent : SONG_TITLES[c.song] || c.song;
  }
  const STATION_NAMES = ['Deccan Vani 101.2', 'Band Baaja 93.5', 'Pop Patang 104.8'];
  const wk = { found: [], extraSongs: [], src: -1, playing: null, pausedFor: null, holdT: 0, holdFired: false, wasDown: false, deck: null, deckSel: 0, lastAudio: null };

  function songList() {
    const out = [];
    for (const id of wk.found) { const c = CASSETTES[id]; if (c && c.song && out.indexOf(c.song) < 0) out.push(c.song); }
    for (const s of wk.extraSongs) if (out.indexOf(s) < 0) out.push(s);
    return out;
  }
  function sources() {
    const out = songList().map((s) => ({ kind: 'tape', id: s }));
    for (let i = 0; i < 3; i++) out.push({ kind: 'radio', id: 'radio:' + i, station: i });
    return out;
  }
  function cassetteOfSong(song) { for (const id of wk.found) if (CASSETTES[id] && CASSETTES[id].song === song) return CASSETTES[id]; return null; }
  function syncLibrary() {
    try { if (N.audio && N.audio.walkman && N.audio.walkman.setLibrary) N.audio.walkman.setLibrary(songList()); } catch (e) { N.err('walkman.library', e); }
  }
  function stopAudio() {
    try {
      if (wk.playing && wk.playing.kind === 'radio' && N.audio && N.audio.radio) N.audio.radio.off();
      if (N.audio && N.audio.walkman && N.audio.walkman.playing) N.audio.walkman.stop();
    } catch (e) { N.err('walkman.stop', e); }
  }
  function startSource(s, quiet) {
    if (!s) return false;
    stopAudio();
    if (s.kind === 'radio') {
      try { if (N.audio && N.audio.radio) N.audio.radio.set(s.station); } catch (e) { N.err('walkman.radio', e); }
      wk.playing = { kind: 'radio', id: s.id, title: STATION_NAMES[s.station], sub: 'radio band' };
    } else if (s.kind === 'memo') {
      const c = CASSETTES[s.id];
      sfx('tape_click', { ui: true });
      wk.playing = { kind: 'memo', id: s.id, title: c ? c.title : s.id, sub: 'Immu, over' };
      if (!quiet && c) toast('▶ ' + c.title + ' — "' + subst(c.text) + '"', 6500, 'radio');
      wk.memoT = 7;
    } else {
      try { if (N.audio && N.audio.walkman) N.audio.walkman.play(s.id); } catch (e) { N.err('walkman.play', e); }
      const c = cassetteOfSong(s.id);
      wk.playing = { kind: 'tape', id: s.id, title: SONG_TITLES[s.id] || s.id, sub: c ? 'C' + pad2(c.n) : 'Side A' };
      if (!quiet && c && c.text) setTimeout(() => { if (wk.playing && wk.playing.id === s.id) toast('Farmaish: ' + subst(c.text), 5200, 'farmaish'); }, 3400);
    }
    wk.lastAudio = s;
    N.emit('walkman:play', { kind: wk.playing.kind, id: wk.playing.id });
    return true;
  }
  function walkmanStop(quiet) {
    if (!wk.playing && !wk.pausedFor) return false;
    stopAudio();
    const was = wk.playing;
    wk.playing = null; wk.pausedFor = null;
    if (!quiet && was) toast('■ Walkman off', 1400, 'radio');
    N.emit('walkman:stop', {});
    return true;
  }
  function respectHere() {
    const p = N.player;
    try { return !!(p && N.respect && typeof N.respect.at === 'function' && N.respect.at(p.x, p.y)); } catch (e) { return false; }
  }
  function inRadioVehicle() {
    const v = N.player && N.player.vehicle;
    if (!v) return false;
    const Ty = N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[v.type];
    if (Ty && typeof Ty.radio === 'boolean') return Ty.radio;
    return /^(auto|ambassador|padmini|maruti800|bus|lorry)$/.test(v.type);
  }

  const W = (N.walkman = {
    CASSETTES, SONG_TITLES,
    get owned() { return !!(N.player && N.player.inventory && N.player.inventory.has('walkman')); },
    set owned(v) { if (!N.player || !N.player.inventory) return; if (v) N.player.inventory.add('walkman'); else { N.player.inventory.delete('walkman'); walkmanStop(true); } },
    get cassettes() { return new Set(wk.found); },
    get playing() { return wk.playing ? Object.assign({}, wk.playing) : null; },
    get paused() { return wk.pausedFor; },
    has: (id) => wk.found.indexOf(id) >= 0,
    /** A cassette was found (collectibles.js). Returns true when new. */
    add(id, o) {
      const c = CASSETTES[id];
      if (!c) { N.err('walkman.add', new Error('unknown cassette ' + id)); return false; }
      if (wk.found.indexOf(id) >= 0) return false;
      wk.found.push(id);
      if (N.player && N.player.inventory) N.player.inventory.add(id);
      syncLibrary();
      if (!(o && o.silent)) toast(c.agent ? 'Cassette C' + pad2(c.n) + ': ' + c.title + ' (Immu\'s voice memo)' : 'Cassette C' + pad2(c.n) + ': "' + c.title + '" — press Q / the cassette icon to play', 3600);
      N.emit('walkman:cassette', { id });
      return true;
    },
    addSong(song) { if (!SONG_TITLES[song] || wk.extraSongs.indexOf(song) >= 0) return false; wk.extraSongs.push(song); syncLibrary(); return true; },
    list() { return Object.keys(CASSETTES).map((id) => Object.assign({ found: wk.found.indexOf(id) >= 0 }, CASSETTES[id], { text: subst(CASSETTES[id].text) })); },
    songs: () => songList(),
    play(id) {
      if (!W.owned && !(wk.deck && wk.deck.open)) { toast('No walkman!', 1400); return false; }
      if (respectHere() && !(wk.deck && wk.deck.open)) { toast('Walkman off in here. Respect.', 1800); return false; }
      wk.pausedFor = null;
      if (!id) {
        const list = sources();
        const s = wk.lastAudio && list.find((x) => x.id === wk.lastAudio.id) || list[0];
        wk.src = list.indexOf(s);
        return startSource(s);
      }
      if (/^radio:\d$/.test(id)) { const st = +id.slice(6) % 3; wk.src = songList().length + st; return startSource({ kind: 'radio', id, station: st }); }
      const c = CASSETTES[id];
      if (c && c.agent) return startSource({ kind: 'memo', id });
      const song = c ? c.song : id;
      if (!SONG_TITLES[song]) return false;
      wk.src = songList().indexOf(song);
      return startSource({ kind: 'tape', id: song });
    },
    stop() { return walkmanStop(false); },
    next() {
      if (!W.owned) return false;
      if (respectHere()) { toast('Walkman off in here. Respect.', 1800); return false; }
      const list = sources();
      wk.pausedFor = null;
      wk.src = wk.playing ? wk.src + 1 : Math.max(0, wk.src);
      if (wk.src >= list.length) { wk.src = -1; walkmanStop(false); return false; }
      return startSource(list[wk.src]);
    },
    toggle() { return wk.playing ? (walkmanStop(false), false) : W.play(); },
    /** Pause for a reason (respect zone, cutscene); resume() restarts what was playing. */
    pause(reason) { if (!wk.playing) return false; wk.pausedFor = { reason: reason || 'pause', src: wk.lastAudio }; stopAudio(); wk.playing = null; return true; },
    resume() { const p = wk.pausedFor; if (!p) return false; wk.pausedFor = null; return startSource(p.src, true); },
    deck: {
      get isOpen() { return !!(wk.deck && wk.deck.open); },
      open() { deckOpen(); },
      close() { deckClose(); },
    },
    serialize() { return { found: wk.found.slice(), extra: wk.extraSongs.slice() }; },
    deserialize(o) {
      W.reset();
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.found)) for (const id of o.found) if (CASSETTES[id] && wk.found.indexOf(id) < 0) wk.found.push(id);
      if (Array.isArray(o.extra)) for (const s of o.extra) if (SONG_TITLES[s] && wk.extraSongs.indexOf(s) < 0) wk.extraSongs.push(s);
      syncLibrary();
    },
    reset() { walkmanStop(true); wk.found = []; wk.extraSongs = []; wk.src = -1; wk.lastAudio = null; deckClose(); syncLibrary(); },
  });

  function walkmanUpdate(dt) {
    const md = mode();
    // the radio action on foot / on bikes (vehicle radios stay with audio.js)
    const I = N.input;
    if (I && md === 'play' && !inRadioVehicle() && !(wk.deck && wk.deck.open)) {
      // a press starts a gesture; releasing before 0.6 s = next source, holding 0.6 s = off
      // (a tap can press and release between two steps: pressed is true while down is already false)
      const down = I.down('radio');
      if (I.pressed('radio')) { wk.holding = true; wk.holdT = 0; wk.holdFired = false; }
      if (wk.holding) {
        if (down) {
          wk.holdT += dt;
          if (wk.holdT >= 0.6 && !wk.holdFired) { wk.holdFired = true; wk.holding = false; walkmanStop(false); }
        } else {
          wk.holding = false;
          if (!wk.holdFired) { if (W.owned) W.next(); else toast('No walkman yet.', 1400); }
        }
      }
    } else wk.holding = false;
    // memo "playback" ends by itself
    if (wk.playing && wk.playing.kind === 'memo') { wk.memoT -= dt; if (wk.memoT <= 0) { wk.playing = null; N.emit('walkman:stop', {}); } }
    // the audio walkman auto-advances songs: keep our view in sync (and notice when it stopped)
    try {
      const ap = N.audio && N.audio.walkman && N.audio.walkman.playing;
      if (wk.playing && wk.playing.kind === 'tape' && ap && ap !== wk.playing.id && SONG_TITLES[ap]) { wk.playing.id = ap; wk.playing.title = SONG_TITLES[ap]; wk.src = songList().indexOf(ap); }
      if (wk.playing && wk.playing.kind === 'tape' && !ap && N.audio && N.audio.ready) { wk.silentT = (wk.silentT || 0) + dt; if (wk.silentT > 2) { wk.playing = null; wk.silentT = 0; N.emit('walkman:stop', {}); } } else wk.silentT = 0;
    } catch (e) { /* ignore */ }
    // a vehicle radio replaces the walkman (systems §3.5); it comes back on foot
    if (inRadioVehicle()) { if (wk.playing && !(wk.deck && wk.deck.open)) W.pause('vehicle'); }
    else if (wk.pausedFor && wk.pausedFor.reason === 'vehicle' && md === 'play') W.resume();
    // pause in respect zones and cutscenes (systems §3.5); resume after
    const p = N.player;
    let why = null;
    if (md === 'cutscene') why = 'cutscene';
    else if (p && respectHere()) why = 'respect';
    if (why && wk.playing && !(wk.deck && wk.deck.open)) W.pause(why);
    else if (!why && wk.pausedFor && (wk.pausedFor.reason === 'cutscene' || wk.pausedFor.reason === 'respect') && md === 'play') W.resume();
    if (wk.deck && wk.deck.open) deckUpdate();
  }

  /* ---- the home 2-in-1 (a small cassette-deck card at `home`) */
  function deckItems() {
    const out = [];
    for (const id of wk.found) { const c = CASSETTES[id]; out.push({ id, label: 'C' + pad2(c.n) + '  ' + c.title, text: subst(c.text) }); }
    for (const s of wk.extraSongs) out.push({ id: s, label: '♪  ' + SONG_TITLES[s], text: '' });
    for (const t of tape.tracks) if (t.sfx) out.push({ id: 'track:' + t.id, label: 'SIDE A ' + pad3(t.counter) + '  ' + (STORY_BY_ID[t.id] ? STORY_BY_ID[t.id].title : t.label), text: t.jcard, track: t.id });
    return out;
  }
  function deckRender() {
    const D = wk.deck; if (!D) return;
    const items = deckItems();
    wk.deckSel = U.clamp(wk.deckSel, 0, Math.max(0, items.length - 1));
    const cur = wk.playing;
    D.list.innerHTML = '';
    if (!items.length) el('div', 'sc-deck-empty', D.list).textContent = 'No cassettes yet. Find some around the city!';
    items.forEach((it, i) => {
      const row = el('button', 'sc-deck-row' + (i === wk.deckSel ? ' sel' : '') + (cur && (cur.id === it.id || (CASSETTES[it.id] && CASSETTES[it.id].song === cur.id)) ? ' on' : ''), D.list);
      row.type = 'button'; row.tabIndex = -1;
      row.textContent = it.label;
      row.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); wk.deckSel = i; deckPlay(it); deckRender(); });
    });
    const it = items[wk.deckSel];
    D.text.textContent = it ? it.text : '';
    D.now.textContent = cur ? '▶ ' + cur.title : '■ STOP';
  }
  function deckPlay(it) {
    if (!it) return;
    if (it.track) { T.play(it.track); return; }
    const c = CASSETTES[it.id];
    if (c && c.agent) startSource({ kind: 'memo', id: it.id }, true);
    else W.play(it.id);
  }
  function deckOpen() {
    const ui = document.getElementById('ui');
    if (!ui) return;
    if (!wk.deck) {
      const root = el('div', 'sc-deck interactive', ui,
        '<div class="sc-deck-head"><span class="sc-deck-title">2-in-1 · LAKSHMI NIVAS</span><span class="sc-deck-now"></span></div>' +
        '<div class="sc-deck-list"></div><div class="sc-deck-text"></div>' +
        '<div class="sc-deck-keys"><button type="button" class="sign-btn small" data-k="play"><kbd>E</kbd> ▶ PLAY</button><button type="button" class="sign-btn small alt" data-k="stop">■ STOP</button><button type="button" class="sign-btn small alt" data-k="close"><kbd>Esc</kbd> Close</button></div>');
      wk.deck = { root, list: root.querySelector('.sc-deck-list'), text: root.querySelector('.sc-deck-text'), now: root.querySelector('.sc-deck-now'), open: false };
      root.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const k = b.dataset.k;
        if (k === 'play') deckPlay(deckItems()[wk.deckSel]);
        else if (k === 'stop') walkmanStop(true);
        else deckClose();
        deckRender();
      }));
    }
    wk.deck.open = true;
    wk.deck.root.classList.add('show');
    wk.deck.locked = N.player ? !!N.player.controlsLocked : false;
    if (N.player) N.player.controlsLocked = true;
    sfx('tape_click', { ui: true });
    deckRender();
  }
  function deckClose() {
    const D = wk.deck;
    if (!D || !D.open) return;
    D.open = false;
    D.root.classList.remove('show');
    if (N.player && !D.locked) N.player.controlsLocked = false;
  }
  function deckUpdate() {
    const I = N.input; if (!I) return;
    if (mode() !== 'play') return;
    const n = deckItems().length;
    let ch = false;
    if (I.pressed('up')) { wk.deckSel = (wk.deckSel - 1 + Math.max(1, n)) % Math.max(1, n); ch = true; I.consume('up'); }
    if (I.pressed('down')) { wk.deckSel = (wk.deckSel + 1) % Math.max(1, n); ch = true; I.consume('down'); }
    if (I.pressed('action')) { I.consume('action'); deckPlay(deckItems()[wk.deckSel]); ch = true; }
    if (I.pressed('pause') || I.pressed('horn')) { I.consume('pause'); I.consume('horn'); deckClose(); return; }
    if (I.pressed('radio')) { I.consume('radio'); walkmanStop(true); ch = true; }
    const p = N.player, h = N.places && N.places.home;
    if (p && h && Math.hypot(p.x - h.x, p.y - h.y) > 60) { deckClose(); return; }
    if (ch || (N.time.frame % 20) === 0) deckRender();
  }

  /* ================================================================ N.hints */
  const NUDGE_AT = [180, 360, 600, 900];
  const hs = { defs: {}, active: null, timers: [] };
  function hintSpec(id) {
    const raw = hs.defs[id];
    if (!raw) return null;
    if (Array.isArray(raw)) return { ammamma: raw[0], auto: raw[1], aunty: raw[2], city: raw[3] };
    return raw;
  }
  function placeName(id) { const p = id && N.places && N.places[id]; return p ? p.name.replace(/\s*\(.*\)\s*$/, '') : (id ? String(id).replace(/_/g, ' ') : ''); }
  function nudgeScale() {
    const m = pref('hintNudges', 'normal');
    if (m === 'off' || m === false) return 0;
    const diff = pref('difficulty', 'normal');
    return (m === 'fast' ? 0.5 : 1) * (diff === 'relaxed' ? 0.6 : diff === 'hard' ? 1.5 : 1);
  }
  function hintObjective() {
    const A = hs.active; if (!A || !N.hud) return;
    if (A.nudge >= 1 && A.clue && N.hud.objectiveText === A.clue) N.hud.objective(A.clue + ' (Stuck? Ammamma knows. Call home from any STD booth, ₹1.)');
  }
  function searchCircle(level) {
    const A = hs.active; if (!A) return;
    const p = A.answer && N.places && N.places[A.answer];
    if (!p || !N.hud || !N.hud.searchCircle) return;
    const R = level >= 3 ? 300 : 600, J = level >= 3 ? 120 : 300;
    const rng = U.rng('hint:' + A.id + ':' + level);
    const a = rng.next() * Math.PI * 2, d = rng.next() * J;
    N.hud.searchCircle('hint', { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: R });
  }
  function hintsUpdate(dt) {
    const A = hs.active;
    // delayed aunty-network meter bumps (game minutes)
    if (hs.timers.length && mode() === 'play') {
      const now = N.clock.day * 1440 + N.clock.minutes;
      for (let i = hs.timers.length - 1; i >= 0; i--) {
        const t = hs.timers[i];
        if (now >= t.at) { hs.timers.splice(i, 1); try { if (N.wanted && N.wanted.add) N.wanted.add(1, 'aunty network'); } catch (e) { N.err('hints.aunty', e); } toast('The aunties have phoned Mummy...', 2400); }
      }
    }
    if (!A || A.off || mode() !== 'play') return;
    const sc = nudgeScale();
    A.elapsed += dt;
    if (!sc) return;
    while (A.nudge < NUDGE_AT.length && A.elapsed >= NUDGE_AT[A.nudge] * sc) {
      A.nudge++;
      N.emit('hint:nudge', { id: A.id, level: A.nudge });
      if (A.nudge === 1) hintObjective();
      if (A.nudge === 2 || A.nudge === 3) searchCircle(A.nudge);
      if (A.nudge === 4) { A.ps = 'PS: it\'s ' + (A.name || placeName(A.answer)) + '. Over.'; toast('Immu\'s PS is in the Journal (Clues).', 2600); }
    }
    if (A.nudge >= 1 && (N.time.frame % 30) === 0) hintObjective();
  }

  const Hn = (N.hints = {
    get active() { return hs.active ? Object.assign({}, hs.active, { taken: hs.active.taken.slice() }) : null; },
    get defs() { return hs.defs; },
    register(id, spec) { if (!id || !spec) return false; hs.defs[id] = spec; return true; },
    /** The clue for mission `id` becomes current (story calls it when the clue is handed over). */
    start(id, o) {
      o = o || {};
      const s = hintSpec(id) || {};
      if (hs.active && hs.active.id !== id) Hn.stop();
      hs.active = { id, clue: o.clue || s.clue || null, answer: o.answer || s.answer || (STORY_BY_ID[id] && STORY_BY_ID[id].place) || null, name: o.name || s.name || null,
        elapsed: 0, nudge: 0, taken: [], cityAsked: 0, off: s.off || o.off || null, ps: null };
      N.emit('hint:start', { id });
      return true;
    },
    stop() { hs.active = null; if (N.hud && N.hud.searchCircle) N.hud.searchCircle('hint', null); },
    solve(id) {
      const A = hs.active;
      if (!A || (id && A.id !== id)) return false;
      N.emit('hint:solved', { id: A.id });
      Hn.stop();
      return true;
    },
    /** Take a hint from a source: 'home' | 'std' | 'auto' | 'aunty' | 'city'. */
    next(source) {
      const A = hs.active;
      if (!A) return null;
      const s = hintSpec(A.id) || {};
      const answer = A.answer;
      const name = A.name || placeName(answer);
      let r = null;
      if (A.off && source !== 'city') return { source, tier: 0, refused: true, text: A.off, cost: 0 };
      if (source === 'home' || source === 'std') {
        const text = s.ammamma || (s.proverb ? s.proverb + ' ' : '') + 'Go and look near ' + name + ', *kanna*.';
        r = { source, tier: 1, text: subst(text), cost: source === 'std' ? 100 : 0 };
        if (A.clue && N.hud && (N.hud.objectiveText || '').indexOf(A.clue) === 0) N.hud.objective(A.clue + ' — Ammamma: ' + name + '.');
      } else if (source === 'auto') {
        const tgt = (s.auto && N.places && N.places[s.auto]) || (answer && N.places && N.places[answer]);
        if (!tgt) return null;
        let pt = { x: tgt.x, y: tgt.y };
        try {
          const rp = N.world && N.world.nearestRoadPoint && N.world.nearestRoadPoint(tgt.x, tgt.y);
          if (rp && Math.hypot(rp.x - tgt.x, rp.y - tgt.y) <= 150) pt = { x: rp.x, y: rp.y };
        } catch (e) { /* keep the place */ }
        r = { source, tier: 2, text: subst(s.autoLine || '*Meter nakko*, for you *paanch*. Hold on!'), target: pt, place: s.auto || answer, cost: 500 };
      } else if (source === 'aunty') {
        const pid = s.aunty || answer;
        if (pid && N.hud && N.hud.blip) N.hud.blip('hint:aunty', pid, { color: '#f2c230', icon: 'star', pulse: true, label: placeName(pid) });
        const at = N.clock.day * 1440 + N.clock.minutes + 10;
        hs.timers.push({ at });
        r = { source, tier: 3, text: subst(s.auntyLine || 'Arre, that is near ' + placeName(pid) + '! Everybody knows.'), place: pid, cost: 0, meter: 1 };
      } else if (source === 'city') {
        A.cityAsked++;
        const lines = Array.isArray(s.city) ? s.city : [s.city];
        const deflect = ['Tunnel? Ask my grandfather. He is also lost.', 'I only know where the biryani is. Try the next uncle.'];
        if (A.cityAsked < 3) r = { source, tier: 4, text: subst((lines.length > 1 && lines[A.cityAsked - 1]) || deflect[A.cityAsked - 1]), cost: 0, deflect: true };
        else r = { source, tier: 4, text: subst((lines.length > 2 ? lines[2] : lines[0]) || 'It is ' + name + ', *beta*. Everybody knows that.'), place: answer, cost: 0 };
      } else return null;
      if (!r.deflect) A.taken.push({ source, tier: r.tier, date: dateOf(N.clock.day).label });
      N.emit('hint:taken', { id: A.id, source, tier: r.tier });
      return r;
    },
    serialize() { return { active: hs.active, timers: hs.timers.slice() }; },
    deserialize(o) {
      Hn.reset();
      if (!o || typeof o !== 'object') return;
      const A = o.active;
      if (A && typeof A.id === 'string') hs.active = { id: A.id, clue: A.clue || null, answer: A.answer || null, name: A.name || null, elapsed: +A.elapsed || 0, nudge: U.clamp(A.nudge | 0, 0, 4), taken: Array.isArray(A.taken) ? A.taken.slice(0, 20) : [], cityAsked: A.cityAsked | 0, off: A.off || null, ps: A.ps || null };
      if (Array.isArray(o.timers)) hs.timers = o.timers.filter((t) => t && isFinite(t.at)).slice(0, 8);
      if (hs.active && hs.active.nudge >= 2) searchCircle(hs.active.nudge);
    },
    reset() { hs.active = null; hs.timers = []; if (N.hud && N.hud.searchCircle) N.hud.searchCircle('hint', null); if (N.hud && N.hud.unblip) N.hud.unblip('hint:aunty'); },
  });

  /* ================================================================ wiring */
  N.on('mission:start', (d) => { if (d && hs.active && hs.active.id === d.id) Hn.solve(d.id); });
  N.on('mission:abort', () => { if (tape.rec) tape.rec.fire('abort'); });
  N.on('mission:fail', () => { if (tape.rec) tape.rec.fire('abort'); });
  N.on('mission:pass', () => { try { refreshLoop(); } catch (e) { N.err('calendar.loop', e); } });
  N.on('game:new', (o) => {
    cal.lastStop = -1; cal.override = null;
    if (N.player && N.player.inventory) N.player.inventory.add('walkman');
    refreshLoop();
    cal.lastDay = null;
    dateChanged('set');
    void o;
  });
  N.on('save:loaded', () => { refreshLoop(); cal.lastDay = null; dateChanged('load'); });
  N.on('game:quit', () => { walkmanStop(true); deckClose(); });

  function registerJournal() {
    const M = N.menus;
    if (!M || typeof M.addJournalTab !== 'function') return;
    try {
      M.addJournalTab({ id: 'side_a', title: 'Side A', order: 20, render(root) {
        const rows = STORY.map((s) => {
          const tr = T.track(s.id);
          return '<li class="' + (tr ? 'done' : '') + '"><b>' + esc(s.jcard) + '</b>' + (tr ? '<span>' + esc(pad3(tr.counter)) + ' · ' + esc(tr.date) + (s.scribble ? ' — <i>' + esc(s.scribble) + '</i>' : '') + '</span>' : '<span>· · ·</span>') + '</li>';
        }).join('');
        root.innerHTML = '<div class="sc-j"><h3>SIDE A · ' + pad3(tape.counter) + (tape.paused ? ' ■ PAUSED' : '') + '</h3><ol class="sc-j-tracks">' + rows + '</ol></div>';
      } });
      M.addJournalTab({ id: 'tin', title: 'The Tin', order: 30, render(root) {
        const ids = Array.from(tape.tin);
        root.innerHTML = '<div class="sc-j"><h3>THE TIN (' + ids.length + ')</h3>' + (ids.length ? '<ul class="sc-j-tin">' + ids.map((id) => { const t = tape.tokens[id] || { name: id }; return '<li><b>' + esc(subst(t.name)) + '</b><span>' + esc(subst(t.desc || '')) + '</span></li>'; }).join('') + '</ul>' : '<p>Empty. A Karachi Bakery tin waits for its first token.</p>') + '</div>';
      } });
      M.addJournalTab({ id: 'clues', title: 'Clues', order: 25, render(root) {
        const A = hs.active;
        root.innerHTML = '<div class="sc-j"><h3>CLUES</h3>' + (A ? '<p class="sc-j-clue">' + esc(subst(A.clue || '(Immu\'s clue)')) + '</p>' +
          (A.taken.length ? '<p>Hints taken: ' + A.taken.map((t) => esc(t.source)).join(', ') + '</p>' : '') + (A.ps ? '<p class="sc-j-ps">' + esc(A.ps) + '</p>' : '') : '<p>No clue right now. Over.</p>') + '</div>';
      } });
    } catch (e) { N.err('storycore.journal', e); }
  }

  N.addSystem({
    id: 'storycore', order: 6, runIn: ['*'],
    init() {
      if (N.save && N.save.register) {
        N.save.register('calendar', {
          serialize: () => ({ lastStop: cal.lastStop, override: cal.override, loop: N.clock.loop ? Object.assign({}, N.clock.loop) : null }),
          deserialize(o) {
            if (!o || typeof o !== 'object') return;
            cal.lastStop = isFinite(o.lastStop) ? Math.round(o.lastStop) : -1;
            cal.override = o.override ? parse(o.override) : null;
            const L = o.loop;
            if (L && isFinite(L.from) && isFinite(L.to)) { N.clock.setLoop(L.from, L.to); if (N.clock.loop) N.clock.loop.n = Math.max(0, L.n | 0); }
          },
        });
        N.save.register('tape', { serialize: T.serialize, deserialize: T.deserialize });
        N.save.register('walkman', { serialize: W.serialize, deserialize: W.deserialize });
        N.save.register('hints', { serialize: Hn.serialize, deserialize: Hn.deserialize });
      }
      if (N.interact) {
        N.interact.add('home_2in1', {
          get x() { const h = N.places && N.places.home; return h ? h.x + 8 : null; },
          get y() { const h = N.places && N.places.home; return h ? h.y - 6 : null; },
          r: 12, priority: 2, label: '2-in-1',
          enabled: () => wk.found.length > 0 || wk.extraSongs.length > 0 || tape.tracks.length > 0,
          use: () => deckOpen(),
        });
      }
    },
    update(dt) {
      jumpUpdate(dt);
      tapeUpdate(dt);
      walkmanUpdate(dt);
      hintsUpdate(dt);
    },
    reset() {
      if (cal.jump) finishJump(cal.jump);
      T.reset(); W.reset(); Hn.reset();
      cal.lastStop = -1; cal.override = null; cal.lastDay = null;
      N.clock.setLoop(null);
    },
  });
  N.on('boot', registerJournal);
})();
