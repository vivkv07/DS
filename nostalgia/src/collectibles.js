/* NOSTALGIA — collectibles.js  (owner: collectibles agent)
 * The five hidden series of story_bible §6 with the rules of systems_design §7 (+ §8.14 viewpoints,
 * §8.18 camera click): Patang Chacha's 12 rooftop kites, 30 golis, 16 cassettes, Ticket Thatha's 12
 * punched bus tickets and Nanna's roll of 24 frames (23 riddles + the story's F24). 93 finds in all,
 * the per-series rewards, the total-finds ladder at home, 35 verified trivia cards (+ 4 story cards),
 * pickup glints, the hot/cold beacon, viewpoint reveals, Journal pages and the save section.
 * Contract: ARCHITECTURE.md §19 (+ §7 roof zones, §8 interact levels). Safe when hud / menus /
 * audio / walkman / shops / missions / seasons are stubs: every call is feature-checked.
 *
 * ================================================================ API (story.js / story2.js)
 * Series keys: 'kites' 'golis' 'cassettes' 'tickets' 'frames' (singular 'kite' 'goli' ... and the
 * bible letters 'K' 'G' 'C' 'T' 'F' are accepted everywhere). Item ids: kite_1..12, goli_1..30,
 * cassette_1..16, ticket_1..12, frame_1..24 (bible codes 'K3', 'G07', 'C05', 'T12', 'F09' also work).
 *
 *   N.collectibles.SERIES {kites, golis, cassettes, tickets, frames}  meta: {key, one, label, title, total}
 *   items [item...] / byId {id: item} / get(id) -> item | null      (item: {id, series, n, code, name,
 *       hint, place, x, y, h, ax, ay (where you stand), pr (pickup radius), level (roof id), pick
 *       'walk'|'look'|'click', tech, active (now collectable), found})
 *   unlockSeries(series, {silent}) -> bool        story: M1 step 6 'kites'; end of M1 'golis' + 'frames'
 *       (also given the `camera` item); 'tickets' in M5; 'cassettes' are on while the walkman is owned.
 *       Fallbacks when the story never calls: bo_kaata done -> kites, golis, frames; right_right done or
 *       the bus flags -> tickets. unlocked(series) -> bool. lockSeries(series) (debug only).
 *   has(id) / isFound(id) -> bool        found(id, {silent, develop}) -> bool (marks it, pays rewards;
 *       alias collect). count(series?) -> found in that series (frames: F01-F23 clicked) / all 93.
 *       total() -> finds out of 93 (prints need not be developed). max(series) -> 12/30/16/12/23.
 *   nearestUnfound(x, y, series?, {all}) -> item | null (active items only unless all)
 *   posOf(id) -> {x, y} | null    blip(id, opts) / unblip(id)   (story: show K1 in the M1 tutorial)
 *   reveal(x, y, r = 900, sec = 180) -> n   blips unfound items within r on the minimap + full map.
 *   isKnown(id) -> bool (revealed right now; the menus map layer reads it)
 *   await viewpoint(id | {x, y, r}, {force, camera = true, secs, zoom}) -> n   W6: camera pulls out to
 *       zoom 0.55 for 3 s, then reveal(). Once per viewpoint per game day unless force. VIEWPOINTS
 *       lists them; walk-up ones fire by themselves in free roam (Bala Hissar, Birla Mandir parapet,
 *       home terrace r 400, Falaknuma gate); 'charminar_gallery' only from the story (M12) or while
 *       N.flags.charminar_gallery_open. shops.js runs the giant wheel / Prasads lobby / Machan tree.
 *   Frames: click(id = nearest offered) runs the viewfinder + flash; story F24: found('frame_24').
 *       film() -> {used, left: 24 - used}; undeveloped() -> [ids]; develop(ids, {place, instant}) ->
 *       ready day after tomorrow (2 game days) or after the next mission; prints() -> [ids];
 *       pendingPrints() -> [{id, ready}]; printNow(id) (debug / SA5's pre-framed F12).
 *   Trivia: TRIVIA {id: {id, code, title, text, place, places, source}} (35 core [V] cards from the
 *       ticket backs and the prints + 4 story cards), triviaFor(placeId | cardId) -> text | null,
 *       unlockTrivia(placeId | cardId, {silent}) -> card | null, triviaUnlocked(id), trivia() -> list.
 *   kitesForEnding() -> kite ids found before Chand Raat (bible §6.1).   LADDER, ladder() -> reached n.
 *   glints / beacon (get/set booleans, persisted; settings rows "Glints" and "Beacon").
 *   glintPoints() -> [{id, series, x, y, h, tw}] (3D parity: view3d_actors may draw them).
 *   collectAll(series?) -> n (debug: N.debug.collectAll()).  journalHTML(tab) (fallback text).
 *
 * Rewards (systems §7.4): kites 4 ₹10, 8 `charkhi`, 12 N.flags.kites_all; golis 10 ₹10 +
 * N.flags.marbles_tiger, 20 `raja_goli`, 30 ₹50 + title + N.flags.marble_pouch (pouch drawn on the
 * sprite); cassettes 6 ₹10, 12 dedications N.flags.farmaish, 4 Agent tapes N.flags.agent_promoted;
 * tickets 6 ₹20, 12 `ticket_punch` + N.flags.thatha_ending; prints 8 ₹15, 16 N.flags.album_captions,
 * 23 N.flags.framed_print + title. Titles go to N.flags.titles (array) and N.flags.title.
 * Ladder (systems §7.5, all series together): 5 unlock_double_gong (N.flags.bell_reach = 80),
 * 12 unlock_own_cycle, 20 unlock_dynamo, 30 unlock_chetak, 45 unlock_call_nanna, 60 unlock_rx100
 * (vehicles.js also wants SA6 R4), 75 unlock_streamers + unlock_golden_bell + title, 93 unlock_free_chai
 * + unlock_everything. Each one toasts at once and its family line plays at `home` (93: Salim-bhai at
 * `irani_cafe_7`) the next time you walk in without a mission running.
 *
 * Events: 'collectible' {series ('kite'..), key ('kites'..), kind, id, code, name, n, max, total, x, y}
 *   (audio.js adds the pickup sound by kind), 'collectible:threshold' {series: key | 'total', n, reward},
 *   'collectible:unlock' {series}, 'collectible:reveal' {x, y, r, n, id}, 'collectible:print' {id},
 *   'collectible:click' {id}, 'trivia:unlock' {id, place}, 'viewpoint' {id, x, y, r, n}.
 * Save section 'collectibles' {found, late, unlocked, prints, pending, trivia, paid, ladder, homeQ, vp,
 *   run}. Album snapshots (the actual view you framed, 120x80 JPEG) live in localStorage
 *   'nostalgia.album.v1' (try/catch; the album draws a sketch when they are missing).
 * Prefs: localStorage 'nostalgia.collectibles.prefs.v1' {glints, beacon} (try/catch).
 * Debug: N.debug.collectibles() -> rows (the fallback list when there is no Journal),
 *   N.debug.collectibleGo(id) -> teleports next to an item, N.debug.unlockSeries(s).
 *
 * Hiding techniques (systems §7.3): item.tech = 'occluded' (6-14 u behind a tall building; drawn on
 * the actors layer so the pseudo-3D walls cover it), 'roof' (on a roof zone, pickable only up there;
 * without N.world.roofs it waits at the stair foot), 'canopy' (snapped under the nearest world tree,
 * which fades when you walk under it), 'board' (behind a bus-stop board, the road side is the face),
 * 'shop' (inside: ACTION "Look ..." priority 4, 14 u from the counter so the shop menu stays
 * reachable, only while the shop is open), 'sand' (riverbed under the bridges), 'rock' (on top of /
 * in the crack of the nearest boulder), 'high' (tied to a landmark at height h, picked from below),
 * 'time' (when() gates: Sundays, after M2, Prasads before/after 25 Jul), 'hill' (outside locked gates).
 * Every position is resolved at runtime from place / landmark ids (+ offsets) and then validated:
 * walkable, not water, not a road carriageway, never inside a respect zone, inside the map; a blocked
 * spot moves to the nearest valid cell (item.moved says how far). tests/collectibles.cjs checks them.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================== helpers */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const emph = (s) => esc(s).replace(/\*([^*]+)\*/g, '<i>$1</i>');
  const plain = (s) => String(s == null ? '' : s).replace(/\*([^*]+)\*/g, '$1');
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  function toast(text, ms, key) {
    try { if (N.hud && N.hud.toast) N.hud.toast(text, ms || 3000, key ? { key } : undefined); } catch (e) { N.err('collectibles.toast', e); }
  }
  function sfx(name, o) { try { return !!(N.audio && N.audio.sfx && N.audio.sfx(name, Object.assign({ ui: true }, o || {}))); } catch (e) { N.err('collectibles.sfx', e); return false; } }
  const flags = () => N.flags || (N.flags = {});
  const mode = () => (N.state && N.state.mode) || 'boot';
  const day = () => (N.clock && N.clock.day) | 0;
  const minutes = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const now = () => (N.time && N.time.now) || 0;
  const missionActive = () => { try { return !!(N.missions && N.missions.active); } catch (e) { return false; } };
  const isDone = (id) => { try { return !!(N.missions && typeof N.missions.isDone === 'function' && N.missions.isDone(id)); } catch (e) { return false; } };
  const inv = () => (N.player && N.player.inventory && typeof N.player.inventory.has === 'function' ? N.player.inventory : null);
  const hasItem = (id) => { const I = inv(); return !!(I && I.has(id)); };
  function giveItem(id) { const I = inv(); if (I && !I.has(id)) { I.add(id); N.emit('item:give', { id, from: 'collectibles' }); } }
  function earn(paise, why) {
    paise = Math.round(paise || 0);
    if (!paise) return;
    try { if (N.shops && typeof N.shops.earn === 'function') { N.shops.earn(paise, why); return; } } catch (e) { N.err('collectibles.earn', e); }
    const p = N.player; if (!p) return;
    p.money = Math.max(0, (p.money | 0) + paise);
    N.emit('money', { delta: paise, total: p.money, why });
  }
  const rs = (p) => '₹' + Math.round(p / 100);
  function respectAt(x, y) { try { return (N.respect && typeof N.respect.at === 'function' && N.respect.at(x, y)) || null; } catch (e) { return null; } }
  /** calendar date {y, m, d, dow} (storycore when present, else the clock's base date) */
  function date() {
    try { if (N.calendar && N.calendar.date) return N.calendar.date; } catch (e) { /* stub */ }
    const b = (N.clock && N.clock.baseDate) || [2003, 0, 14];
    const d = new Date(Date.UTC(b[0], b[1], b[2] + day()));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
  }
  const ymd = () => { const d = date(); return d.y * 10000 + d.m * 100 + d.d; };
  function season(name) {
    try { if (N.seasons && typeof N.seasons.is === 'function' && N.seasons.is(name)) return true; } catch (e) { /* stub */ }
    return !!flags()[name];
  }
  const prasadsOpen = () => season('prasads_open') || ymd() >= 20030725;
  function shopOpen(id) {
    try { if (N.shops && typeof N.shops.isOpenNow === 'function' && N.shops.defs && N.shops.defs[id]) return !!N.shops.isOpenNow(id); } catch (e) { /* stub */ }
    return true;
  }
  const reducedFlash = () => !!(document.body && (document.body.classList.contains('flash-reduce') || document.body.classList.contains('reduced-motion')));
  function nick() { return (N.player && (N.player.nick || N.player.name)) || flags().nick || 'Chinnu'; }
  function subst(s) {
    try { if (N.menus && typeof N.menus.subst === 'function') return N.menus.subst(s); } catch (e) { /* stub */ }
    return String(s).replace(/\{nick\}/g, nick()).replace(/\{NICK\}/g, nick().toUpperCase());
  }

  /* ================================================================== the series (bible §6, systems §7.1) */
  const SERIES = {
    kites: { key: 'kites', one: 'kite', letter: 'K', label: 'KITE', title: "Patang Chacha's Rooftop Kites", short: 'Kites', total: 12, color: '#e8423a', tab: 'cl_kites', order: 60,
      locked: 'Patang Chacha will tell you about his twelve riddle kites on Sankranti.' },
    golis: { key: 'golis', one: 'goli', letter: 'G', label: 'GOLI', title: 'Golis', short: 'Golis', total: 30, color: '#3aa8c8', tab: 'cl_golis', order: 61,
      locked: 'After Sankranti, start looking down: the city is full of lost marbles.' },
    cassettes: { key: 'cassettes', one: 'cassette', letter: 'C', label: 'CASSETTE', title: 'Cassettes', short: 'Cassettes', total: 16, color: '#2a2a32', tab: 'cl_cassettes', order: 62,
      locked: 'You need a walkman to collect tapes.' },
    tickets: { key: 'tickets', one: 'ticket', letter: 'T', label: 'TICKET', title: "Ticket Thatha's Tickets", short: 'Tickets', total: 12, color: '#e86a9a', tab: 'cl_tickets', order: 63,
      locked: 'Ride with Ticket Thatha first. He hides his old punched tickets behind the stop boards.' },
    frames: { key: 'frames', one: 'frame', letter: 'F', label: 'FRAME', title: "Nanna's album", short: "Nanna's album", total: 23, film: 24, color: '#c8c8d0', tab: 'cl_album', order: 64,
      locked: "Nanna's camera, one roll of twenty-four. He hands it over after Sankranti." },
  };
  const ONE = { kite: 'kites', goli: 'golis', cassette: 'cassettes', ticket: 'tickets', frame: 'frames', k: 'kites', g: 'golis', c: 'cassettes', t: 'tickets', f: 'frames', album: 'frames', print: 'frames', prints: 'frames', tape: 'cassettes', tapes: 'cassettes', marble: 'golis', marbles: 'golis' };
  function seriesKey(s) {
    if (!s) return null;
    s = String(s).toLowerCase();
    if (SERIES[s]) return s;
    return ONE[s] || ONE[s.replace(/s$/, '')] || null;
  }

  /* ---------------------------------------------------------------- kites (bible §6.1) */
  // at: place id (or 'lm:<landmark id>'), off: [dx, dy] from it, h: drawn height, host: landmark drawn
  // under it (the kite is queued right after it on the structures layer), tech: hiding technique.
  const KITES = [
    { name: 'Moon-and-star, green', place: 'gulzar_houz', at: 'hide_gulzar_houz_ledge', h: 7, host: 'gulzar_houz', tech: 'high', col: ['#2f9a4a', '#f4f0d0'], deco: 'moon',
      hint: 'On the fountain railing, tail in the water.', tag: 'Next: where the red buses sleep under a tin sky.', by: 'M1 (tutorial)' },
    { name: 'Red half-and-half', place: 'gowliguda_hangar', at: 'lm:cbs_hangar', side: 'w', gap: -8, h: 21, host: 'cbs_hangar', tech: 'high', col: ['#d8302a', '#f4f0e8'], deco: 'half',
      hint: "On the hangar's back rib, above the last bus.", tag: 'Next: the giant wheel saw me fall behind the papad.' },
    { name: 'Yellow with a black eye', place: 'nampally_exhibition', at: 'hide_numaish_corner', h: 4, tech: 'occluded', col: ['#f2c230', '#1a1a1a'], deco: 'eye',
      hint: "Behind the giant wheel's ticket box.", tag: 'Next: four tall uncles with bulb heads caught my string.', by: 'giant wheel (M2)' },
    { name: 'Tiranga stripes', place: 'lb_stadium', at: 'hide_lb_stand', h: 3, tech: 'occluded', col: ['#f08a24', '#f4f0e8', '#2a8a3a'], deco: 'tiranga',
      hint: "Behind the west stand, in a floodlight's noon shadow.", tag: "Next: the drum hill's white crown. The neem at the foot of the stairs.", by: 'Birla parapet' },
    { name: 'Pink paper, white tail', place: 'birla_mandir', at: 'road:birla_mandir_steps:0', off: [22, 6], h: 9, tech: 'canopy', tree: 40, col: ['#f080b0', '#ffffff'],
      hint: 'In the neem by the chappal stand. Ask nicely.', tag: 'Next: across the water, a fence says COMING SOON. Squeeze through the gap.', by: 'Birla parapet' },
    { name: 'Blue box kite', place: 'prasads_imax', at: 'lm:prasads_imax', side: 'w', gap: 10, along: 18, h: 3, tech: 'time', col: ['#2a5cb8', '#9ac0f0'], deco: 'box',
      alt: { when: () => prasadsOpen(), at: 'prasads_imax', off: [44, 6], h: 10, tree: 40, tech: 'canopy' },
      hint: 'Through the tin fence, on a sand heap. (From 25 July: in the forecourt palm.)', tag: 'Next: lunch in the tallest tree, made of cement.', by: 'Birla parapet, Prasads lobby' },
    { name: 'Orange tukkal', place: 'ntr_gardens', at: 'hide_ntr_lawn', h: 5, tech: 'canopy', col: ['#f07a1a', '#ffd070'],
      hint: "Under the concrete tree's lowest branch.", tag: 'Next: the bund of great people. The arch at the Secunderabad end holds my string.', by: 'Prasads lobby, Birla parapet' },
    { name: 'Purple with gold edges', place: 'tank_bund', at: 'lm:kakatiya_arch_n', side: 'e', gap: 6, h: 18, host: 'kakatiya_arch_n', tech: 'high', col: ['#7a3ab0', '#f2c230'], deco: 'edge',
      hint: "Tied to the arch's carved bracket.", tag: 'Next: the glass building with four quarters and a fountain. A crane caught me.' },
    { name: 'Silver paper', place: 'cyber_towers', at: 'hide_cyber_fountain', h: 10, tech: 'high', col: ['#c8ccd4', '#8a90a0'], deco: 'shine',
      hint: "By the forecourt fountain, under a builder's crane.", tag: 'Next: a secret lake hides in the rocks behind the glass. Biggest boulder.' },
    { name: 'Sky-blue, no tail', place: 'durgam_cheruvu', at: 'hide_durgam_rocks', h: 1, tech: 'rock', rock: 'top', rockR: 70, notail: true, col: ['#7ac0f0', '#e8f4ff'],
      hint: 'On top of the boulder that looks like a sleeping buffalo.', tag: "Next: the king's clap gate. Climb till the city looks like a carrom board." },
    { name: 'Maroon with a moon', place: 'golconda_fort', at: 'hide_golconda_bastion', h: 4, tech: 'occluded', col: ['#7a1a2a', '#f4e8c0'], deco: 'moon',
      hint: "On a quiet bastion's crenel.", tag: 'Next: the palace that is a mirror of the sky. Its gate is locked; its hill is not.', by: 'Bala Hissar (M7)' },
    { name: 'Gold and green, Chacha\'s best', place: 'falaknuma_palace', at: 'hide_falaknuma_hill', h: 3, tech: 'hill', col: ['#e8b830', '#2a8a3a'], deco: 'half',
      hint: 'On the hill path below the locked gate.', tag: 'Last one. Bring all twelve to Gulzar Houz before Chand Raat. — Chacha', by: 'Falaknuma gate' },
  ];

  /* ---------------------------------------------------------------- golis (bible §6.2) */
  const G = (name, spot, hint, col, o) => Object.assign({ name, at: 'hide_' + spot, place: 'hide_' + spot, hint, col }, o || {});
  const GOLIS = [
    G('Clear *paani* goli', 'home_colony_ground', 'Under the slide, where the steel burns at noon.', ['#cfeff4', '#8ad0e0'], { glass: true }),
    G("Green cat's-eye", 'home_lane', 'Behind the colony water tank, where the motor hums.', ['#bfe8c0', '#1f8a3a'], { eye: true }),
    G('Red swirl', 'ashok_nagar_ground', "Tiger's ground. Under the bowler's brick at the far end.", ['#f4e0d0', '#d02a2a'], { swirl: true }),
    G('Milky *doodhiya*', 'vidyanagar_ground', "In the crack of the Vidyanagar ground's boundary wall.", ['#f6f2ea', '#d8d0c4']),
    G("Blue cat's-eye", 'nallakunta_ground', 'Behind the stumps someone chalked on a wall.', ['#c8dcf4', '#2a5ab8'], { eye: true }),
    G('Yellow swirl', 'public_gardens_tree', "In the banyan's roots, where the *mali* naps.", ['#fff4c0', '#e8b818'], { swirl: true, tech: 'canopy', tree: 34 }),
    G('Pearl', 'mj_steps', "Mozamjahi's back steps, under the ice-cream boy's stool.", ['#fbf4ec', '#e0cfc0'], { tech: 'occluded' }),
    G('Tiny *chhotu*', 'nayapul_sand', 'Under Naya Pul, in the sand where the saris dry.', ['#e0f0e8', '#90c0a8'], { r: 0.8, tech: 'sand' }),
    G("Brown tiger's-eye", 'puranapul_sand', 'On the riverbed beside the oldest bridge.', ['#e8b060', '#6a3a14'], { eye: true, tech: 'sand' }),
    G('Two-colour twist', 'chaderghat_sand', 'Inside a cricket pitch drawn in the Chaderghat sand.', ['#e83a3a', '#2a6ae8'], { twist: true, tech: 'sand' }),
    G('Orange flame', 'charminar_corner', 'Charminar plaza, south-east corner, by the pigeon-feed man.', ['#ffe0a0', '#f06a10'], { swirl: true }),
    G('Smoky grey', 'chowmahalla_wall', 'Along the locked palace wall, under a loose stone.', ['#c8c4c0', '#6a6660'], { tech: 'occluded' }),
    G('Balloon-pink', 'lumbini_hedge', "Lumbini's hedge corner, where the balloon man sits.", ['#ffd0e4', '#f060a0']),
    G('Moss green', 'indira_rock', 'Indira Park, in the rock that looks like a sleeping dog.', ['#c8e0a8', '#5a7a2a'], { tech: 'rock', rock: 'crack', rockR: 60 }),
    G('Lake blue', 'sanjeevaiah_bench', 'Sanjeevaiah Park, under the last bench before the water.', ['#c0e4f0', '#2a8aa8']),
    G('Clock-face white', 'clock_tower_park', 'Clock Tower park, under the bench that faces the café.', ['#ffffff', '#c8c8d0'], { eye: true }),
    G('Army khaki', 'parade_grounds', 'Far corner of the Parade Grounds, where nobody marches.', ['#d8cca0', '#7a7040']),
    G('Aeroplane silver', 'airport_fence', 'Begumpet fence. The planes come so low you can count the windows.', ['#f0f2f6', '#8a92a0'], { shine: true }),
    G('Rock-pink', 'banjara_lake', 'Banjara Lake, by the flat rock at the water\'s edge.', ['#f4d4cc', '#b8847a']),
    G('Peacock blue-green', 'kbr_trail', 'KBR Park trail, where the peacock crosses.', ['#a0e0d8', '#0a7a8a'], { swirl: true, tech: 'canopy', tree: 30 }),
    G('Clay red', 'shilparamam_hut', "Shilparamam, on the step of the potter's hut.", ['#e8a080', '#a84a2a']),
    G('Brand-new shiny', 'gachibowli', 'The new stadium\'s car park. Very new. Very empty.', ['#ffffff', '#a0d0ff'], { shine: true }),
    G('Granite speckle', 'golconda_court', "Golconda's inner court, where the guide stops talking.", ['#d0c8c0', '#6a625c'], { speckle: true }),
    G('Rope-gold', 'taramati', 'Taramati Baradari steps, where they say a dancer walked on a rope.', ['#fff0b0', '#c8961a'], { twist: true }),
    G('Toy-train red', 'zoo_pond', 'Nehru Zoo, by the pond where the toy train turns.', ['#ffd0c8', '#c81a1a']),
    G('Dam-arch grey', 'mir_alam', 'Mir Alam Tank, below the arches of the old dam.', ['#d8dce0', '#7a8088']),
    G('Elephant grey', 'ou_campus', 'OU campus, the boulder shaped like a sleeping elephant.', ['#c4c0c8', '#6a6670'], { tech: 'rock', rock: 'crack', rockR: 60 }),
    G('Railway black', 'safilguda', 'Safilguda lake bank, the railway-colony side.', ['#6a6a70', '#141418'], { shine: true }),
    G('Horseshoe bronze', 'race_course', 'Race course rail, where the horses gallop at dawn.', ['#e8b880', '#8a4a1a'], { shine: true }),
    G('*Raja goli* (jackpot)', 'saroornagar_lake', 'Saroornagar bund, by the first boat. The king of marbles.', ['#fff2a0', '#c8961a'], { r: 2.1, swirl: true, raja: true }),
  ];

  /* ---------------------------------------------------------------- cassettes (bible §6.3) */
  // pick 'look': ACTION "Look ..." 14 u from the place (systems §1.4: the item spot sits beside the
  // counter so the shop menu stays reachable). shop: the place whose opening hours gate it.
  const CASSETTES = [
    { song: 'r_chandni', title: 'Chandni Raat Ka Cycle', place: 'bus_stop_10', at: 'lm:bus_stop_10', side: 's', gap: 7, along: 9, h: 2, tech: 'board',
      hint: 'On the Himayatnagar stop bench, in its paper cover.', text: "From Pinky of Malakpet, for her Nani in Kurnool: 'Nani, the pickle reached. Send more.'" },
    { song: 'r_barish', title: 'Baarish Mein Irani Chai', place: 'std_4', at: 'std_4', look: 'Look on the STD meter', shop: 'std_4', tech: 'shop',
      hint: 'On top of the Abids STD meter. Somebody talked too long.', text: "From the Lakdikapul Morning Walkers, for the uncle who walks backwards: 'Get well soon. Your knee is famous.'" },
    { song: 'r_baraat', title: 'Baraat Express', place: 'playground_8', at: 'playground_8', off: [26, -14], h: 2, tech: 'ground',
      hint: "Saidabad maidan, under the band's drum stand.", text: "For Saidabad's Lucky Star Band, from every baraat they made late: 'Thank you. We are still dancing.'" },
    { song: 'festival', title: 'Teenmaar Toofan', place: 'dhoolpet', at: 'dhoolpet', look: 'Look in the idol shed', tech: 'shop',
      hint: 'In an idol shed, beside a half-painted Ganesh.', text: "Dhoolpet's idol painters, to the colony boys: 'Bring your lorry on time this year!'" },
    { song: 'r_neon', title: 'Neon Monsoon', place: 'ameerpet_coaching', at: 'ameerpet_coaching', off: [-18, 8], h: 1, tech: 'ground',
      hint: 'Under a JAVA banner, dropped by a sleepy student.', text: "From the 7 pm Java batch to their sir: 'Sir, we understood nothing, but we love you.'" },
    { song: 'r_pager', title: 'Pager Pe Message', place: 'chenoy_trade_centre', at: 'chenoy_trade_centre', look: 'Look in the box of keyboards', shop: 'chenoy_trade_centre', tech: 'shop',
      hint: 'In a box of beige keyboards on the cellar stairs.', text: "From a boy in Parklane to his father: 'Papa, the computer is fine. I only opened it to see inside.'" },
    { song: 'day', title: 'Cycle Pe Sawaari', place: 'recording_centre_1', at: 'recording_centre_1', look: 'Look on the counter', shop: 'recording_centre_1', tech: 'shop',
      hint: "On the counter: 'Free sample. Take one.'", text: "From Raju of the chai bandi, Himayatnagar, to everyone who drinks on credit: 'Please. Pay.'" },
    { song: 'night', title: 'Chandni Chhat', place: 'blue_sea_cafe', at: 'blue_sea_cafe', look: 'Look on the marble table', shop: 'blue_sea_cafe', tech: 'shop',
      hint: 'Left on a marble table by a man running for a train.', text: "From a soldier at Secunderabad station to his mother in Warangal: 'Train is late. Heart is on time.'" },
    { song: 'oldcity', title: 'Gulzar Houz Ki Shaam', place: 'pathergatti', at: 'pathergatti', look: "Look in the 'old stock' basket", tech: 'shop',
      hint: "In the stone arcade, at the tape stall's 'old stock' basket.", text: "From the bangle sellers of Laad Bazaar, to every *aapa* who bargained: 'You won. Come again.'" },
    { song: 'kites', title: 'Patang Ki Pech', place: 'abids_book_market', at: 'abids_book_market', look: 'Look in the stack of old Tinkles', tech: 'time',
      when: () => date().dow === 0 && minutes() >= 7 * 60 && minutes() < 20 * 60, whenText: 'Sundays only, 07:00–20:00',
      hint: 'In a stack of old Tinkles. Sundays only.', text: "From the Abids Sunday book men, to the boy who reads Tinkle standing up: 'Buy one, at least!'" },
    { song: 'numaish', title: 'Numaish Ka Jhoola', place: 'nampally_exhibition', at: 'nampally_exhibition', look: 'Look at the lost-and-found counter', tech: 'time',
      when: () => isDone('lost_and_found') || !!flags().lost_and_found_done, whenText: 'after M2, all year',
      hint: 'At the lost-and-found counter (after M2, all year).', text: "From the Numaish loudspeaker uncle: 'To all the lost children of 2003: you were never lost. You were near the papad.'" },
    { song: 'title', title: 'Yaadon Ki Gully', place: 'gymkhana_ground_secunderabad', at: 'gymkhana_ground_secunderabad', off: [-30, -22], h: 2, tech: 'ground',
      hint: 'On the old pavilion step.', text: "From an old ground-man to the girls who bowl at dawn: 'Keep coming.'" },
    { agent: 1, title: 'Agent tape 1', place: 'home_terrace', roof: 'home_terrace', rxy: [4585, 2649], stairs: 'home_stairs', look: 'Open the tank lid', tech: 'roof',
      hint: "Inside the water-tank lid. Immu's handwriting: AGENT.", text: "Agent Immu's Secret Fact No. 1: {nick} sleeps with his mouth open. Over." },
    { agent: 2, title: 'Agent tape 2', place: 'irani_cafe_7', at: 'irani_cafe_7', look: 'Look behind the jukebox', shop: 'irani_cafe_7', tech: 'shop',
      hint: 'Behind the jukebox at Café Gulistan.', text: 'Fact No. 2: Salim-bhai gives an extra biscuit if you say his chai is the best in Hyderabad. Over.' },
    { agent: 3, title: 'Agent tape 3', place: 'school_1', at: 'school_1', off: [-22, -4], h: 2, tech: 'ground',
      hint: 'Taped under the ice-gola cart at the school gate.', text: "Fact No. 3: Vimala Ma'am smiles once a year. I have seen it. It was a Tuesday. Over." },
    { agent: 4, title: 'Agent tape 4', place: 'playground_1', at: 'playground_1', off: [-24, 20], h: 1, tech: 'ground',
      hint: 'Under the cement bench at the colony ground.', text: "Fact No. 4: best friends don't say goodbye. They say 'over'. Over." },
  ];

  /* ---------------------------------------------------------------- tickets (bible §6.4) */
  // Every ticket hides on the back of its stop's painted board (the board faces the road).
  const TK = (stop, riddle, fact, topic) => ({ stop, place: stop, at: 'lm:' + stop, behind: true, riddle, fact, topic, tech: 'board', h: 3 });
  const TICKETS = [
    TK('bus_stop_1', 'Stage 1: where a British mansion became a college.', "Koti gets its name from the British Residency's *kothi* (mansion) of 1803, a women's college since 1949.", ['koti_womens_college', 'koti']),
    TK('bus_stop_2', 'Stage 2: where the footpath turns into a library every Sunday.', 'Every Sunday the pavements of Abids become a second-hand book market.', ['abids_book_market', 'abids']),
    TK('bus_stop_3', 'Stage 3: where the fair moved to in 1946.', 'Numaish began in 1938 at Public Gardens and moved to the Nampally grounds in 1946.', ['nampally_exhibition']),
    TK('bus_stop_4', 'Stage 4: the bridge named after wood.', 'Lakdikapul means "wooden bridge", after a bridge over the railway partly made of wood.', ['lakdikapul']),
    TK('bus_stop_5', 'Stage 5: where farmers sell with no middlemen.', 'Rythu Bazaars opened on Republic Day 1999 so farmers could sell straight to shoppers.', ['rythu_bazaar_mehdipatnam', 'rythu_bazaar_erragadda', 'rythu_bazaar_saroornagar']),
    TK('bus_stop_7', 'Stage 6: named after a canteen next to a cinema.', 'Paradise began in 1953 as a canteen beside the Paradise cinema, and the junction took its name.', ['paradise']),
    TK('bus_stop_8', 'Stage 7: the station older than every bus.', 'Secunderabad station opened on 9 October 1874, built by the Nizam\'s Guaranteed State Railway.', ['secunderabad_station']),
    TK('bus_stop_9', 'Stage 8: named after my own office.', "RTC X Roads takes its name from Bus Bhavan, the bus corporation's headquarters nearby.", ['rtc_x_roads']),
    TK('bus_stop_13', 'Stage 9: where four clocks came three hundred years late.', "Charminar's four clocks were added in 1889, about 300 years after it was built.", ['charminar']),
    TK('bus_stop_14', 'Stage 10: a lake older than Charminar.', 'Hussain Sagar was built in 1562, almost thirty years before Charminar.', ['hussain_sagar', 'tank_bund']),
    TK('bus_stop_17', 'Stage 11: where the judges sit in striped stone.', "The High Court on the Musi's south bank opened on 20 April 1920.", ['high_court']),
    TK('bus_stop_18', 'Stage 12: the place named after a princess.', 'Khairatabad is named after Princess Khairunnisa, who completed its mosque in 1626.', ['khairatabad_mosque', 'khairatabad']),
  ];
  const STOP_NAMES = ['Koti', 'Abids', 'Nampally', 'Lakdikapul', 'Mehdipatnam', 'Paradise', 'Secunderabad', 'RTC X Roads', 'Charminar', 'Tank Bund', 'Afzalgunj', 'Khairatabad'];

  /* ---------------------------------------------------------------- frames (bible §6.5, systems §8.18) */
  // stand: where Chinnu clicks from (within 40 u, outside every respect zone; worship places from the
  // road); subject: what must be within 60° of where he faces. boat: also clickable from a boat within
  // that distance of the subject (F07). when: time gate.
  const FR = (riddle, place, stand, subject, fact, o) => Object.assign({ riddle, place, stand, subject, fact }, o || {});
  const FRAMES = [
    FR('The market named after a prince.', 'mozamjahi_market', { at: 'mozamjahi_market', off: [-8, 0] }, { lm: 'mozamjahi_market' }, 'Mozamjahi Market (1935) is named after Prince Moazzam Jah, a son of the last Nizam.'),
    FR('The station dressed as a palace.', 'kachiguda_station', { at: 'kachiguda_station', off: [-10, 0] }, { lm: 'kachiguda_station' }, "Kachiguda station opened on 10 June 1916 as the headquarters of the Nizam's own railway."),
    FR('The platform where trains stop for good.', 'nampally_station', { at: 'nampally_station', off: [0, 8] }, { lm: 'nampally_station' }, 'Nampally station was built in 1907 but waited until 1921 for its first passenger train.'),
    FR('The white crown on the drum hill (from the road below).', 'birla_mandir', { at: 'road:birla_mandir_steps:0', off: [-26, 14] }, { lm: 'birla_mandir' }, 'Birla Mandir took about ten years to build and opened in 1976.'),
    FR('The white dome that keeps a sky inside.', 'birla_planetarium', { at: 'birla_planetarium', off: [0, 6] }, { lm: 'birla_planetarium' }, 'Birla Planetarium opened on 8 September 1985.'),
    FR("The glass building the grown-ups call 'the future'.", 'cyber_towers', { at: 'cyber_towers', off: [0, 10] }, { lm: 'cyber_towers' }, 'Cyber Towers was opened on 22 November 1998.'),
    FR('The man in the lake.', 'buddha_statue', { at: 'lumbini_jetty', off: [0, 16] }, { lm: 'buddha_statue' }, 'The Buddha is about 18 m tall, carved from one block of white granite found near Bhongir.', { boat: 110, far: 260 }),
    FR('Lunch in the tallest tree, made of cement.', 'ntr_gardens', { at: 'hide_ntr_lawn', off: [24, 14] }, { at: 'hide_ntr_lawn', off: [-2, -12] }, 'NTR Gardens grew on the site of the old Hussain Sagar power station, demolished in 1995.'),
    FR('The screen so big it parked beside a lake. (from 25 Jul)', 'prasads_imax', { at: 'prasads_imax', off: [0, 8] }, { lm: 'prasads_imax' }, "Prasads opened on 25 July 2003 as India's third IMAX theatre.", { when: () => prasadsOpen(), whenText: 'from 25 July 2003' }),
    FR('The gate that carries a clap up a hill.', 'golconda_fateh_darwaza', { at: 'golconda_fateh_darwaza', off: [70, 0] }, { lm: 'golconda_fateh_darwaza' }, "A clap under Golconda's entrance dome can be heard at the Bala Hissar, about 1 km away."),
    FR('Kings asleep under onion domes (from the road).', 'qutb_shahi_tombs', { at: 'qutb_shahi_tombs', off: [30, 0] }, { lm: 'qutb_tomb_3' }, 'The Qutb Shahi Tombs hold five of the seven Qutb Shahi sultans.', { far: 200 }),
    FR('The clock where a little man strikes the hour.', 'salar_jung_museum', { at: 'salar_jung_museum', off: [0, 8] }, { lm: 'salar_jung_museum' }, "At the Salar Jung Museum's musical clock, a small figure comes out every hour and strikes the gong."),
    FR('Lions you watch from a bus.', 'nehru_zoo', { at: 'lm:zoo_gate', side: 'e', gap: 18 }, { at: 'nehru_zoo', off: [-60, 0] }, 'Nehru Zoological Park opened on 6 October 1963; its lion safari began in 1974.'),
    FR('The college with a face like a temple and a palace.', 'osmania_university', { at: 'osmania_university', off: [0, 10] }, { lm: 'osmania_university' }, 'Osmania University\'s Arts College, designed by Ernest Jasper, opened on 4 December 1939.'),
    FR('The stone tower in a park, across the lake.', 'secunderabad_clock_tower', { at: 'secunderabad_clock_tower', off: [0, 12] }, { lm: 'secunderabad_clock_tower' }, 'Secunderabad Clock Tower was built in 1896 and opened on 1 February 1897.'),
    FR('The mirror of the sky (from the gate).', 'falaknuma_palace', { at: 'falaknuma_palace', off: [6, 0] }, { lm: 'falaknuma_palace' }, 'Falaknuma means "mirror of the sky"; the palace is built in the shape of a scorpion.', { far: 220 }),
    FR('Four palaces behind one locked gate.', 'chowmahalla_palace', { at: 'chowmahalla_palace', off: [0, -6] }, { lm: 'chowmahalla_palace' }, "Chowmahalla's durbar hall, the Khilwat Mubarak, has 19 Belgian crystal chandeliers."),
    FR('The bridge that outlived the great flood.', 'purana_pul', { at: 'hide_puranapul_sand', off: [-14, -10] }, { lm: 'puranapul_arches' }, 'Purana Pul (1578) was the only bridge to survive the Great Musi Flood of 1908.'),
    FR('Four uncles with light-bulb heads.', 'lb_stadium', { at: 'lb_stadium', off: [-10, 0] }, { lm: 'lb_stadium' }, "LB Stadium's old name, Fateh Maidan, comes from the Mughal camp of the 1687 siege of Golconda."),
    FR('The white birthday present.', 'assembly', { at: 'assembly', off: [8, 0] }, { lm: 'assembly' }, 'The old Assembly (1905 to 1913) was built as a Town Hall, paid for by citizens for Nizam Mahbub Ali Khan\'s 40th birthday.'),
    FR('The great ones in a row.', 'tank_bund_statues', { at: 'tank_bund_statues', off: [6, 0] }, { lm: 'tank_bund_statue_6' }, 'The bronze statues of Telugu greats on Tank Bund went up in the 1980s.'),
    FR('A mosque with spires instead of domes (from the road).', 'spanish_mosque', { at: 'spanish_mosque', off: [0, 60] }, { lm: 'spanish_mosque' }, "Begumpet's Spanish Mosque, built by a Paigah noble around 1900 to 1906, has pointed spires instead of domes.", { far: 180 }),
    FR('Twin towers in Gunfoundry.', 'st_josephs_cathedral', { at: 'st_josephs_cathedral', off: [46, 0] }, { lm: 'church_st_josephs' }, "St. Joseph's Cathedral opened on Christmas Eve 1875; its twin towers came in 1891.", { far: 180 }),
    FR('(story) Chand Raat, Charminar, ten seconds.', 'charminar_plaza', { at: 'charminar_plaza' }, { lm: 'charminar' }, null, { story: true, print: "The print: date stamp '03 11 25, Nanna in the frame." }),
  ];
  // Nanna's handwritten album captions (appear with 16 prints; bible §6.5). Original lines.
  const CAPTIONS = [
    'Your Thatha bought mangoes under this clock. You bought nothing. Good boy.',
    'A railway station with domes. Only in Hyderabad, ra.',
    'Nampally. Every train here is late, but never lost.',
    'From the road, like I said. Good. The temple looks better without your thumb.',
    'The dome that keeps a sky inside. We will go in one day. Promise.',
    'The future, made of glass. Your Amma says it needs a wipe.',
    'The man in the lake. Steady hands on a boat. Proud of you.',
    'A cement tree. Lunch on a branch. What will they think of next?',
    'Opening year. Everybody came to see the big screen. Nobody saw the lake.',
    'Clap here and the king hears you. I clapped too. Do not tell anyone.',
    'Quiet kings. You took this one from the road. Respect, kanna.',
    'The little man strikes on time. More than I can say for buses.',
    'Lions from a bus. You waved at them. They did not wave back.',
    'Your Nanna studied here. (Two years. Then the bank.)',
    'Clock tower, Secunderabad. The park is older than your Ammamma.',
    'Mirror of the sky, from the gate. One day the gate will open.',
    'Four palaces, one lock. Like your Amma\'s steel cupboard.',
    'The old bridge. It held on in 1908. It is still holding on.',
    'Four tall uncles. Floodlights, but you knew that.',
    'A birthday present for a Nizam. I got you a cycle bell.',
    'The great ones in a row. Count them with your sister.',
    'Spires, not domes. From the road, the right way.',
    'Twin towers in Gunfoundry. Christmas Eve, 1875. Write it down.',
    'Chand Raat, Charminar, ten seconds. We made it, all of us.',
  ];

  /* ---------------------------------------------------------------- the total-finds ladder (systems §7.5) */
  const LADDER = [
    { n: 5, id: 'double_gong', name: 'Double-gong bell', s: 'ammamma', line: 'Ring it softly near old people, *kanna*.', sub: 'any cycle you ride: the horn reaches 80 u' },
    { n: 12, id: 'own_cycle', name: "{nick}'s own cycle", s: 'nanna', line: 'Second-hand. First owner was a doctor. Ride like one.', sub: 'a black roadster, parked at home each morning' },
    { n: 20, id: 'dynamo', name: 'Dynamo light', s: 'nanna', line: 'Pedal faster, brighter light. Physics.', sub: 'a headlight on your cycle at night' },
    { n: 30, id: 'chetak', name: 'Family Chetak permission', s: 'nanna', line: 'Only in the colony. ...And to Immu\'s. And back.', sub: 'no Chappal Meter for taking it' },
    { n: 45, id: 'call_nanna', name: 'Call Nanna', s: 'nanna', line: "Phone from a booth. I'll come. Don't tell Amma I said yes.", sub: 'pillion rides from any STD booth' },
    { n: 60, id: 'rx100', name: "Bunty's RX100, any day", s: 'bunty', line: "Helmet. Always. Nostalgia means 'helmet' today.", sub: 'after Bunty-anna\'s fourth race' },
    { n: 75, id: 'streamers', name: 'Golden streamers and a golden bell', s: 'chitti', line: "Annayya's cycle is prettier than me. Unfair.", sub: 'title: Hyderabad ka Khabri', title: 'Hyderabad ka Khabri', also: ['golden_bell'] },
    { n: 93, id: 'free_chai', name: 'Free chai and Osmania for life', s: 'salim', line: '*Phokat*, forever. Faramarz-bhai will be jealous.', sub: 'at Café Gulistan', where: 'irani_cafe_7', also: ['everything'] },
  ];
  const SPEAKER_NAMES = { ammamma: 'Ammamma', nanna: 'Nanna', bunty: 'Bunty', chitti: 'Chitti', salim: 'Salim-bhai' };

  /* ---------------------------------------------------------------- viewpoints (systems §8.14, W6) */
  const VIEWPOINTS = {
    golconda_bala_hissar: { name: 'Bala Hissar', place: 'golconda_bala_hissar', r: 28, radius: 900 },
    birla_mandir: { name: 'Birla Mandir parapet', place: 'birla_mandir', r: 26, radius: 900 },
    home_terrace: { name: 'Home terrace', roof: 'home_terrace', radius: 400 },
    falaknuma_palace: { name: 'Falaknuma gate', place: 'falaknuma_palace', r: 26, radius: 900 },
    charminar_gallery: { name: 'Charminar first gallery', place: 'charminar_gallery', radius: 900, story: true },
    // run by shops.js (rides / lobby): listed for the story and the Journal
    numaish_wheel: { name: 'Numaish giant wheel', place: 'nampally_exhibition', radius: 900, shop: true },
    prasads_imax: { name: 'Prasads lobby window', place: 'prasads_imax', radius: 900, shop: true },
    ntr_machan: { name: 'NTR Gardens Machan tree', place: 'ntr_gardens', radius: 900, shop: true },
  };

  /* ================================================================== items */
  const items = [];
  const byId = {};
  function addItem(series, n, spec, extra) {
    const S0 = SERIES[series];
    const it = Object.assign({ id: S0.one + '_' + n, series, n, code: S0.letter + (series === 'kites' ? n : pad2(n)), pick: 'walk', h: 0, pr: 10, tech: 'ground' }, spec, extra || {});
    if (it.look) it.pick = 'look';
    it.md = it.name; it.name = plain(it.name); // plain name for maps / toasts; md keeps the *slang* markup
    it.ph = U.hash2(n * 7.3 + series.length * 31, series.charCodeAt(0)) * 3.5; // glint phase
    it.x = it.y = it.ax = it.ay = NaN;
    it.ok = false; it.moved = 0;
    items.push(it); byId[it.id] = it;
    return it;
  }
  KITES.forEach((k, i) => addItem('kites', i + 1, k));
  GOLIS.forEach((g, i) => addItem('golis', i + 1, Object.assign({ h: 0.5, r: g.r || 1.4 }, g, { tech: g.tech || 'ground' })));
  CASSETTES.forEach((c, i) => addItem('cassettes', i + 1, Object.assign({}, c, { name: c.title, kind: c.agent ? 'agent' : 'dedication' })));
  TICKETS.forEach((t, i) => addItem('tickets', i + 1, Object.assign({ name: 'Stage ' + (i + 1) + ' · ' + STOP_NAMES[i], hint: t.riddle }, t)));
  FRAMES.forEach((f, i) => addItem('frames', i + 1, Object.assign({ name: f.riddle, hint: f.riddle, pick: 'click', tech: 'click', caption: CAPTIONS[i] }, f)));
  const TOTAL = 93;
  const counted = (it) => !(it.series === 'frames' && it.story);

  /** 'K3' / 'G07' / 'kite_03' / 'goli-7' / 'C5' -> canonical item id */
  function norm(id) {
    if (!id) return null;
    if (typeof id === 'object') id = id.id;
    id = String(id).trim();
    if (byId[id]) return id;
    let m = /^([KGCTF])0*(\d+)$/i.exec(id);
    if (m) { const k = seriesKey(m[1]); const c = k && SERIES[k].one + '_' + (+m[2]); return byId[c] ? c : null; }
    m = /^(kite|goli|cassette|ticket|frame)s?[_-]?0*(\d+)$/i.exec(id);
    if (m) { const c = m[1].toLowerCase() + '_' + (+m[2]); return byId[c] ? c : null; }
    return null;
  }
  const get = (id) => byId[norm(id)] || null;

  /* ================================================================== placement (resolved at runtime) */
  const W = () => N.world;
  const LM = {};
  function landmark(id) {
    if (LM[id]) return LM[id];
    const D = N.WORLD_DATA || (N.world && N.world.data);
    const l = D && D.landmarks ? D.landmarks.find((q) => q.id === id) : null;
    if (l) LM[id] = l;
    return l || null;
  }
  const FACE = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  /** anchor point of a spec: {at: placeId | 'lm:<id>' | 'road:<id>:<i>', off, side, gap, along, behind} */
  function anchor(spec) {
    if (!spec) return null;
    if (spec.xy) return { x: spec.xy[0], y: spec.xy[1] };
    const at = spec.lm ? 'lm:' + spec.lm : spec.at || spec.place;
    let x, y;
    if (typeof at === 'string' && at.startsWith('road:')) {
      const [, rid, idx] = at.split(':');
      const D = N.WORLD_DATA || {};
      const r = (D.roads || []).find((q) => q.id === rid);
      if (!r) return null;
      const q = r.pts[Math.max(0, Math.min(r.pts.length - 1, +idx || 0))];
      x = q[0]; y = q[1];
    } else if (typeof at === 'string' && at.startsWith('lm:')) {
      const l = landmark(at.slice(3));
      if (!l) { const p = N.places && N.places[at.slice(3)]; if (!p) return null; x = p.x; y = p.y; }
      else {
        let side = spec.side || null;
        if (spec.behind) side = OPP[l.face] || 'n';
        if (side) {
          const f = FACE[side], half = f[0] ? l.w / 2 : l.d / 2, g = spec.gap == null ? 7 : spec.gap;
          x = l.x + f[0] * (half + g); y = l.y + f[1] * (half + g);
          if (spec.along) { x += -f[1] * spec.along; y += f[0] * spec.along; }
        } else { x = l.x; y = l.y; }
      }
    } else {
      const p = N.places && N.places[at];
      if (p) { x = p.x; y = p.y; } else { const l = landmark(at); if (!l) return null; x = l.x; y = l.y; }
    }
    if (spec.off) { x += spec.off[0]; y += spec.off[1]; }
    return { x, y };
  }
  function surfName(s) { try { return N.debug && N.debug.surfaceName ? N.debug.surfaceName(s) : String(s); } catch (e) { return String(s); } }
  /** a spot where Chinnu can stand: walkable, not water, not a road carriageway, no respect zone */
  function standOK(x, y, o) {
    const w = W();
    if (!w || !isFinite(x) || !isFinite(y)) return false;
    if (x < 8 || y < 8 || x > N.WORLD_W - 8 || y > N.WORLD_H - 8) return false;
    if (o && o.roof) {
      const RFs = w.roofs; if (!RFs) return false;
      const a = RFs.at(x, y); if (!a || !a.roof || a.roof.id !== o.roof) return false;
      return w.withRoof(() => w.isWalkable(x, y) && w.isWalkable(x + 3, y) && w.isWalkable(x - 3, y) && w.isWalkable(x, y + 3) && w.isWalkable(x, y - 3));
    }
    if (!w.isWalkable(x, y)) return false;
    const s = w.surfaceAt(x, y);
    if (s === N.SURF.ROAD || s === N.SURF.WATER || (s === N.SURF.BRIDGE && !(o && o.bridge))) return false;
    if (respectAt(x, y)) return false;
    if (w.roofs && w.roofs.at && w.roofs.at(x, y) && !(o && o.allowUnderRoof)) { /* ground under a terrace is fine */ }
    // room to stand: the four neighbours walkable too
    let n = 0;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (w.isWalkable(x + dx, y + dy)) n++;
    return n >= 3;
  }
  /** nearest valid cell centre to (x, y) within `max` u (spiral on the 4 u grid) */
  function nearestOK(x, y, max, o) {
    if (standOK(x, y, o)) return { x, y, d: 0 };
    const C = N.CELL || 4;
    const ci = Math.floor(x / C), cj = Math.floor(y / C), R = Math.ceil((max || 48) / C);
    for (let r = 1; r <= R; r++) {
      let best = null, bd = Infinity;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const px = (ci + i + 0.5) * C, py = (cj + j + 0.5) * C;
        const d = Math.hypot(px - x, py - y);
        if (d < bd && standOK(px, py, o)) { bd = d; best = { x: px, y: py, d }; }
      }
      if (best) return best;
    }
    return null;
  }
  function nearestTree(x, y, r) {
    const T = W() && W().trees; if (!T) return null;
    let best = null, bd = r * r;
    for (let i = 0; i < T.length; i++) { const t = T[i]; const d = (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y); if (d < bd && t.r >= 6) { bd = d; best = t; } }
    return best;
  }
  function nearestRock(x, y, r) {
    const T = W() && W().rocks; if (!T) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < T.length; i++) { const t = T[i]; const d = Math.hypot(t.x - x, t.y - y) - t.r; if (d < r && d < bd) { bd = d; best = t; } }
    return best;
  }
  /** the back of a board (bus stops): along the back face first, then round its two ends */
  function behindSpot(spec) {
    const l = landmark(String(spec.at || '').replace(/^lm:/, ''));
    if (!l) return null;
    const side = OPP[l.face] || 'n', f = FACE[side], half = f[0] ? l.w / 2 : l.d / 2, len = f[0] ? l.d / 2 : l.w / 2;
    const tries = [];
    for (const g of [7, 5, 10, 13]) for (const a of [0, -6, 6, -12, 12, -len, len]) tries.push([l.x + f[0] * (half + g) - f[1] * a, l.y + f[1] * (half + g) + f[0] * a]);
    for (const e of [1, -1]) for (const g of [6, 10]) tries.push([l.x - f[1] * e * (len + g), l.y + f[0] * e * (len + g)]);
    for (const [x, y] of tries) if (standOK(x, y)) { const q = anchor(spec); return { x, y, d: q ? Math.hypot(x - q.x, y - q.y) : 0 }; }
    return null;
  }
  let resolved = false, resolveStamp = 0;
  function resolveItem(it) {
    const spec = it.alt && it.alt.when && safeWhen(it.alt.when) ? Object.assign({}, it, it.alt, { alt: null }) : it;
    it.variant = spec === it ? 0 : 1;
    it.host = spec.host || null;
    it.dh = spec.h || 0;
    it.level = null; it.treeObj = null; it.hostRock = null; it.note = '';
    if (it.series === 'frames') return resolveFrame(it);
    if (spec.roof) {
      const RFs = W() && W().roofs, roof = RFs && RFs.get && RFs.get(spec.roof);
      if (roof) {
        const p = nearestOK(spec.rxy[0], spec.rxy[1], 16, { roof: spec.roof });
        if (p) { it.x = it.ax = p.x; it.y = it.ay = p.y; it.level = spec.roof; it.dh = roof.h + 1; it.ok = true; it.moved = p.d; it.drawLayer = 'roof'; it.roofKey = { x: roof.kx, y: roof.ky }; return; }
      }
      // no roof zones in this build: the item waits at the stair foot
      const st = anchor({ at: spec.stairs || spec.place });
      const p = st && nearestOK(st.x, st.y, 30);
      it.note = 'stair foot (no roof zones)';
      if (p) { it.x = it.ax = p.x; it.y = it.ay = p.y; it.dh = 2; it.ok = true; it.moved = 0; } else it.ok = false;
      return;
    }
    const a = anchor(spec);
    if (!a) { it.ok = false; it.note = 'no anchor ' + (spec.at || spec.place); return; }
    let x = a.x, y = a.y;
    if (spec.rock) {
      const rk = nearestRock(x, y, spec.rockR || 44);
      if (rk) {
        // the stand point: the rock's edge on the side of the anchor
        let dx = x - rk.x, dy = y - rk.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const sx = rk.x + dx * (rk.r + 6), sy = rk.y + dy * (rk.r + 6);
        const p = nearestOK(sx, sy, 30);
        if (p) {
          it.ax = p.x; it.ay = p.y;
          if (spec.rock === 'top') { it.x = rk.x; it.y = rk.y; it.dh = (rk.h || rk.r) + (spec.h || 1); }
          else { it.x = rk.x + dx * (rk.r + 1.5); it.y = rk.y + dy * (rk.r + 1.5); it.dh = 0.5; }
          it.pr = Math.hypot(it.x - it.ax, it.y - it.ay) + 9;
          it.ok = true; it.moved = p.d; it.host = null; it.hostRock = rk;
          return;
        }
      }
      it.note = 'no rock near';
    }
    if (spec.tree) {
      const t = nearestTree(x, y, spec.tree);
      if (t) {
        it.treeObj = t;
        const ang = Math.atan2(y - t.y, x - t.x) || 0.6;
        const tx = t.x + Math.cos(ang) * Math.min(4, t.r * 0.4), ty = t.y + Math.sin(ang) * Math.min(4, t.r * 0.4);
        const p = nearestOK(tx, ty, 12);
        if (p) { x = p.x; y = p.y; } else it.treeObj = null;
      }
      if (!it.treeObj) it.note = 'no tree near';
    }
    const p = (spec.behind && behindSpot(spec)) || nearestOK(x, y, 56);
    if (!p) { it.ok = false; it.x = it.ax = x; it.y = it.ay = y; it.note = 'no valid cell near'; return; }
    it.x = it.ax = p.x; it.y = it.ay = p.y; it.moved = p.d; it.ok = true;
    if (it.pick === 'look') {
      // the Look spot sits ~14 u beside the shop's own point (so the shop menu stays reachable)
      const base = { x: p.x, y: p.y };
      let best = null;
      for (let k = 0; k < 16 && !best; k++) {
        const ang = (k / 16) * TAU + U.hash2(it.n, 3) * TAU;
        const q = { x: base.x + Math.cos(ang) * 14, y: base.y + Math.sin(ang) * 14 };
        if (standOK(q.x, q.y)) best = q;
      }
      if (best) { it.x = it.ax = best.x; it.y = it.ay = best.y; }
      it.pr = 8; it.dh = 4;
    }
  }
  function resolveFrame(it) {
    const st = anchor(it.stand), sb = anchor(it.subject);
    if (!st || !sb) { it.ok = false; it.note = 'no anchor'; return; }
    const p = nearestOK(st.x, st.y, 40, { bridge: true });
    if (!p) { it.ok = false; it.x = it.ax = st.x; it.y = it.ay = st.y; it.note = 'no valid stand'; return; }
    it.x = it.ax = p.x; it.y = it.ay = p.y; it.moved = p.d;
    it.sx = sb.x; it.sy = sb.y;
    it.pr = 40; it.ok = true;
  }
  function safeWhen(fn) { try { return !!fn(); } catch (e) { return false; } }
  function resolveAll() {
    if (!N.world || !N.world.built) return false;
    for (const it of items) { try { resolveItem(it); } catch (e) { it.ok = false; it.note = 'error ' + e.message; N.err('collectibles.resolve:' + it.id, e); } }
    resolved = true; resolveStamp = ymd();
    return true;
  }
  const ensure = () => resolved || resolveAll();

  /* ================================================================== state (saved) */
  const S = {
    found: new Map(),   // id -> day found
    late: new Set(),    // kites found after Chand Raat (count for free roam, not the ending)
    unlocked: new Set(),
    prints: new Set(),
    pending: [],        // [{id, ready (day), after (missions done count when sent)}]
    trivia: new Set(),
    paid: new Set(),    // reward keys already paid
    ladder: new Set(),  // ladder n reached
    homeQ: [],          // ladder n waiting for their family line
    vp: {},             // viewpoint id -> day used
    run: '',
    badges: new Set(),
  };
  const T = { revealed: new Map(), sparkles: [], vp: null, click: null, near: null, nearT: 0, beacon: false, beaconT: 0, homeT: 0, respectT: 0, faceT: 0, printT: 0, chipT: 0, offerFrame: null, vpCheckT: 0, lastActive: '', homeBusy: false };

  /* ================================================================== series state */
  // unlocked() is asked for every item every frame: cache the five answers per frame
  const unlCache = { frame: -1, v: {} };
  function unlockedFast(k) {
    const f = (N.time && N.time.frame) | 0;
    if (unlCache.frame !== f) { unlCache.frame = f; for (const s in SERIES) unlCache.v[s] = unlocked(s); }
    return unlCache.v[k];
  }
  function unlocked(series) {
    const k = seriesKey(series); if (!k) return false;
    if (S.unlocked.has(k)) return true;
    const F = flags();
    if (F[k + '_unlocked'] || F['collect_' + k]) return true;
    switch (k) {
      case 'kites': return isDone('bo_kaata');
      case 'golis': return isDone('bo_kaata');
      case 'frames': return hasItem('camera') || isDone('bo_kaata');
      case 'tickets': return isDone('right_right') || !!(F.tickets_unlocked || F.bus_unlocked || F.unlock_bus);
      case 'cassettes': try { return !!((N.walkman && N.walkman.owned) || hasItem('walkman')); } catch (e) { return hasItem('walkman'); }
      default: return false;
    }
  }
  function unlockSeries(series, o) {
    const k = seriesKey(series); if (!k) return false;
    const was = unlocked(k);
    S.unlocked.add(k);
    unlCache.frame = -1;
    if (k === 'tickets') flags().tickets_unlocked = true;
    if (k === 'frames') giveItem('camera');
    if (!was) {
      S.badges.add(SERIES[k].tab);
      if (!(o && o.silent)) toast(SERIES[k].title + ' unlocked · hints in the Journal (J)', 3200, 'coll-unlock');
      N.emit('collectible:unlock', { series: k });
      refreshJournal();
    }
    return !was;
  }
  function lockSeries(series) { const k = seriesKey(series); if (k) S.unlocked.delete(k); unlCache.frame = -1; }
  /** collectable right now (series unlocked + its time gate) */
  function active(it) {
    if (!it || !it.ok || S.found.has(it.id)) return false;
    if (!unlockedFast(it.series)) return false;
    if (it.when && !safeWhen(it.when)) return false;
    if (it.series === 'frames' && it.story) return false;
    if (it.shop && !shopOpen(it.shop)) return false;
    return true;
  }
  const has = (id) => { const k = norm(id); return !!(k && S.found.has(k)); };
  function count(series) {
    const k = seriesKey(series);
    let n = 0;
    for (const id of S.found.keys()) { const it = byId[id]; if (!it || !counted(it)) continue; if (!k || it.series === k) n++; }
    return n;
  }
  const total = () => count(null);
  const max = (series) => { const k = seriesKey(series); return k ? SERIES[k].total : TOTAL; };
  const foundIds = (series) => { const k = seriesKey(series); return Array.from(S.found.keys()).filter((id) => !k || byId[id].series === k); };

  /* ================================================================== trivia cards (35 core [V] + 4 story [V]) */
  const TRIVIA = {};
  TICKETS.forEach((t, i) => {
    const code = 'T' + pad2(i + 1);
    TRIVIA['trivia_' + code] = { id: 'trivia_' + code, code, title: 'Stage ' + (i + 1) + ' · ' + STOP_NAMES[i], text: t.fact, place: t.topic[0], places: t.topic.concat([t.stop]), source: 'ticket', item: 'ticket_' + (i + 1), core: true };
  });
  FRAMES.forEach((f, i) => {
    if (!f.fact) return;
    const code = 'F' + pad2(i + 1);
    const pl = [f.place]; if (f.subject && f.subject.lm) pl.push(f.subject.lm);
    TRIVIA['trivia_' + code] = { id: 'trivia_' + code, code, title: f.riddle.replace(/\s*\(.*\)\s*$/, ''), text: f.fact, place: f.place, places: pl, source: 'frame', item: 'frame_' + (i + 1), core: true };
  });
  // story cards: the lock riddles' facts and SA5's museum card (bible §1.6, SA5; all [V])
  [
    ['trivia_mummy', 'The princess in the oldest garden', 'The State Museum keeps one Egyptian mummy, over 2,000 years old.', 'state_museum', ['public_gardens']],
    ['trivia_mj_clock', 'The tower that talks with half its faces', "Mozamjahi Market's octagonal clock tower has clocks on alternate faces.", 'mozamjahi_market', []],
    ['trivia_no_bells', 'A temple without bells', 'Birla Mandir was built with no bells, for quiet.', 'birla_mandir', []],
    ['trivia_rebecca', 'The Veiled Rebecca', 'The marble Veiled Rebecca at the Salar Jung Museum was bought in Rome in 1876.', 'salar_jung_museum', []],
  ].forEach(([id, title, text, place, more], i) => { TRIVIA[id] = { id, code: 'S' + (i + 1), title, text, place, places: [place].concat(more), source: 'story', core: false }; });
  const CORE_TRIVIA = Object.keys(TRIVIA).filter((k) => TRIVIA[k].core).length; // 35
  function cardFor(key) {
    if (!key) return null;
    key = String(key);
    if (TRIVIA[key]) return TRIVIA[key];
    if (TRIVIA['trivia_' + key]) return TRIVIA['trivia_' + key];
    const it = get(key);
    if (it) { const c = TRIVIA['trivia_' + it.code]; if (c) return c; }
    // by place: an unlocked one first, then the first core card for that place
    let first = null;
    for (const id in TRIVIA) {
      const c = TRIVIA[id];
      if (c.places.indexOf(key) < 0) continue;
      if (!first || (!S.trivia.has(c.id) && S.trivia.has(first.id))) first = c;
    }
    return first;
  }
  function triviaFor(key) { const c = cardFor(key); return c ? c.text : null; }
  function unlockTrivia(key, o) {
    const c = cardFor(key);
    if (!c) return null;
    // a place may have several cards: unlock the first locked one
    let card = c;
    if (S.trivia.has(c.id) && !TRIVIA[key] && !get(key)) { for (const id in TRIVIA) { const q = TRIVIA[id]; if (q.places.indexOf(key) >= 0 && !S.trivia.has(id)) { card = q; break; } } }
    if (S.trivia.has(card.id)) return card;
    S.trivia.add(card.id);
    S.badges.add('cl_trivia');
    if (!(o && o.silent)) toast('TRIVIA CARD · ' + card.title + ' (Journal)', 2600, 'coll-trivia');
    N.emit('trivia:unlock', { id: card.id, place: card.place });
    refreshJournal();
    return card;
  }

  /* ================================================================== finding things */
  function feedback(it, n, mx) {
    const S0 = SERIES[it.series];
    let text = S0.label + ' ' + n + '/' + mx + ' · ';
    if (it.series === 'kites') text += 'Tag: ‘' + it.tag.replace(/^Next: /, 'Next: ').slice(0, 64) + (it.tag.length > 64 ? '…' : '') + '’ (J)';
    else if (it.series === 'golis') text += plain(it.name);
    else if (it.series === 'cassettes') text += (it.agent ? 'Agent tape ' + it.agent : plain(it.title)) + ' (Q to play)';
    else if (it.series === 'tickets') text += 'Stage ' + it.n + ' unlocked for buses';
    else if (it.series === 'frames') text = 'FRAME ' + filmUsed() + '/24 · Develop at Raj Colour Lab';
    toast(text, it.series === 'kites' ? 4200 : 3400, 'collectible');
    if (it.series === 'kites') sfx('kite_wind', { vol: 0.8 });
    else if (it.series === 'tickets') { sfx('paper'); sfx('keys', { delay: 0.18, pitch: 1.3, vol: 0.7 }); }
    else if (it.series === 'frames') { sfx('camera_flash'); sfx('tape_click', { delay: 0.35, pitch: 0.6, vol: 0.6 }); }
    burst(it.x, it.y, it.dh || 2, S0.color);
    chip(it.series, it.series === 'frames' ? filmUsed() : n, it.series === 'frames' ? 24 : mx);
  }
  /** Mark an item found (pickup, Look, Click or the story). Returns true when it was new. */
  function found(id, o) {
    o = o || {};
    ensure();
    const k = norm(id);
    const it = k && byId[k];
    if (!it) { N.err('collectibles.found', new Error('unknown collectible ' + id)); return false; }
    if (S.found.has(k)) { if (o.develop && it.series === 'frames') printNow(k); return false; }
    S.found.set(k, day());
    if (it.series === 'kites' && isDone('chand_raat')) S.late.add(k);
    if (it.series === 'cassettes') { try { if (N.walkman && typeof N.walkman.add === 'function') N.walkman.add(k, { silent: true }); else giveItem(k); } catch (e) { N.err('collectibles.walkman', e); } }
    if (it.series === 'tickets') { flags()['ticket_' + it.n] = true; unlockTrivia('trivia_' + it.code, { silent: true }); }
    const n = it.series === 'frames' ? count('frames') : count(it.series), mx = max(it.series);
    unreveal(k);
    S.badges.add(SERIES[it.series].tab);
    if (!o.silent) feedback(it, n, mx);
    N.emit('collectible', { series: SERIES[it.series].one, key: it.series, kind: SERIES[it.series].one, id: k, code: it.code, name: plain(it.name), n, max: mx, total: total(), x: it.x, y: it.y });
    if (o.develop && it.series === 'frames') printNow(k);
    if (!o.noRewards) { seriesRewards(it.series, o.silent); ladderCheck(o.silent); }
    refreshJournal();
    return true;
  }

  /* ================================================================== rewards (systems §7.4) */
  const REWARDS = {
    kites: [
      { n: 4, money: 1000, text: 'Patang Chacha sends ₹10 for your trouble.' },
      { n: 8, item: 'charkhi', text: 'Patang Chacha sends a charkhi of cotton *saddi*: your kite fights get an extra kite and a wider band.' },
      { n: 12, flag: 'kites_all', text: 'All twelve kites! Patang Chacha: "Then tonight you\'ll see something."' },
    ],
    golis: [
      { n: 10, money: 1000, flag: 'marbles_tiger', text: 'Tiger heard about your golis. *Marbles vs Tiger* at Ashok Nagar ground!' },
      { n: 20, item: 'raja_goli', text: 'The *Raja goli* striker is yours: heavier shots, a longer aim line.' },
      { n: 30, money: 5000, flag: 'marble_pouch', title: 'Goli King of Hyderabad', text: 'All thirty! Journal title: Goli King of Hyderabad. (And a marble pouch.)' },
    ],
    cassettes: [
      { n: 6, money: 1000, text: 'Six tapes! Raju of the chai bandi pays ₹10 for a dub.' },
      { test: () => items.filter((q) => q.series === 'cassettes' && !q.agent).every((q) => S.found.has(q.id)), key: 'dedications', flag: 'farmaish', text: 'All twelve dedication tapes. Deccan Vani will read your own *farmaish* one day...' },
      { test: () => items.filter((q) => q.series === 'cassettes' && q.agent).every((q) => S.found.has(q.id)), key: 'agent', flag: 'agent_promoted', text: 'All four Agent tapes. Immu: "Agent, you are promoted."' },
    ],
    tickets: [
      { n: 6, money: 2000, text: 'Ticket Thatha: "Six stages! Here, ₹20, for chai."' },
      { n: 12, item: 'ticket_punch', flag: 'thatha_ending', text: "Ticket Thatha's old ticket punch is yours. City buses are free now!" },
    ],
    frames: [ // counted on developed prints
      { n: 8, money: 1500, text: 'Eight prints! Nanna sends ₹15 "for the film".' },
      { n: 16, flag: 'album_captions', text: "Nanna's handwritten captions appear in the album." },
      { n: 23, flag: 'framed_print', title: 'Colony Photographer', text: 'Raj-uncle frames your best print on Café Gulistan\'s wall. Title: Colony Photographer.' },
    ],
  };
  function addTitle(t) {
    const F = flags();
    if (!Array.isArray(F.titles)) F.titles = [];
    if (F.titles.indexOf(t) < 0) F.titles.push(t);
    F.title = t;
  }
  function payReward(series, r, silent) {
    const key = series + ':' + (r.key || r.n);
    if (S.paid.has(key)) return false;
    S.paid.add(key);
    if (r.money) earn(r.money, 'collectibles:' + key);
    if (r.item) { giveItem(r.item); flags()[r.item] = true; }
    if (r.flag) flags()[r.flag] = true;
    if (r.title) addTitle(r.title);
    if (!silent) toast((r.money ? '+' + rs(r.money) + ' · ' : '') + plain(r.text), 4200, 'coll-reward');
    N.emit('collectible:threshold', { series, n: r.n || r.key, reward: { money: r.money || 0, item: r.item || null, flag: r.flag || null, title: r.title || null } });
    return true;
  }
  function seriesRewards(series, silent) {
    const k = seriesKey(series); if (!k) return;
    const n = k === 'frames' ? countPrints() : count(k);
    for (const r of REWARDS[k] || []) {
      const ok = r.test ? safeWhen(r.test) : n >= r.n;
      if (ok) payReward(k, r, silent);
    }
  }
  function ladderCheck(silent) {
    const n = total();
    const F = flags();
    for (const L of LADDER) {
      if (n < L.n) break;
      if (S.ladder.has(L.n)) { F['unlock_' + L.id] = true; continue; }
      S.ladder.add(L.n);
      F['unlock_' + L.id] = true;
      for (const a of L.also || []) F['unlock_' + a] = true;
      if (L.id === 'double_gong') F.bell_reach = 80;
      if (L.title) addTitle(L.title);
      if (!silent) {
        S.homeQ.push(L.n);
        toast('UNLOCKED · ' + subst(L.name) + ' (' + L.n + ' finds) — ' + (L.where === 'irani_cafe_7' ? 'see Salim-bhai at Café Gulistan' : 'see you at home'), 4600, 'coll-ladder');
        sfx('mission_passed', { vol: 0.5 });
      }
      N.emit('collectible:threshold', { series: 'total', n: L.n, reward: { unlock: L.id } });
    }
  }
  function ladderReached() { let m = 0; for (const L of LADDER) if (S.ladder.has(L.n)) m = L.n; return m; }

  /* ================================================================== frames: film, developing, prints */
  const filmUsed = () => items.filter((q) => q.series === 'frames' && S.found.has(q.id)).length;
  const countPrints = () => Array.from(S.prints).filter((id) => byId[id] && counted(byId[id])).length;
  function undeveloped() {
    const pend = new Set(S.pending.map((p) => p.id));
    return items.filter((q) => q.series === 'frames' && S.found.has(q.id) && !S.prints.has(q.id) && !pend.has(q.id)).map((q) => q.id);
  }
  function missionsDone() { try { return N.missions && N.missions.done ? N.missions.done.size | 0 : 0; } catch (e) { return 0; } }
  function develop(ids, o) {
    o = o || {};
    ids = (ids || undeveloped()).map(norm).filter((id) => id && byId[id] && byId[id].series === 'frames' && S.found.has(id) && !S.prints.has(id));
    const list = [];
    for (const id of ids) {
      if (S.pending.some((p) => p.id === id)) continue;
      if (o.instant) { printNow(id, o); list.push(id); continue; }
      S.pending.push({ id, ready: day() + 2, after: missionsDone() });
      list.push(id);
    }
    if (list.length && !o.instant) N.emit('collectible:develop', { ids: list, place: o.place || null });
    refreshJournal();
    return list;
  }
  function printNow(id, o) {
    const k = norm(id); const it = k && byId[k];
    if (!it || it.series !== 'frames') return false;
    if (!S.found.has(k)) S.found.set(k, day());
    S.pending = S.pending.filter((p) => p.id !== k);
    if (S.prints.has(k)) return false;
    S.prints.add(k);
    S.badges.add('cl_album');
    unlockTrivia('trivia_' + it.code, { silent: true });
    N.emit('collectible:print', { id: k });
    if (!(o && o.silent)) {
      toast('PRINT · ' + it.code + ' ' + it.riddle.replace(/\s*\(.*\)\s*$/, '') + " — in Nanna's album" + (TRIVIA['trivia_' + it.code] ? ' + a trivia card' : ''), 3600, 'coll-print');
    }
    seriesRewards('frames', o && o.silent);
    refreshJournal();
    return true;
  }
  function checkPrints(missionPassed) {
    if (!S.pending.length) return;
    const d = day(), m = missionsDone();
    const ready = S.pending.filter((p) => d >= p.ready || missionPassed || m > p.after);
    if (!ready.length) return;
    for (const p of ready) printNow(p.id, { silent: true });
    toast("Raj-uncle: your prints are ready! (" + ready.length + ") Nanna's album is filling up.", 3800, 'coll-print');
    sfx('camera_flash', { vol: 0.4 });
  }

  /* ================================================================== reveal + viewpoints (W6) */
  function revealIt(it, until) {
    T.revealed.set(it.id, until);
    try { if (N.hud && N.hud.blip) N.hud.blip('coll:rv:' + it.id, { x: it.x, y: it.y }, { color: SERIES[it.series].color === '#2a2a32' ? '#ffd84a' : SERIES[it.series].color, icon: 'star', label: '', size: 0.85, edge: false, pulse: false }); } catch (e) { N.err('collectibles.blip', e); }
  }
  function unreveal(id) {
    T.revealed.delete(id);
    try { if (N.hud && N.hud.unblip) { N.hud.unblip('coll:rv:' + id); N.hud.unblip('coll:story:' + id); } } catch (e) { /* ignore */ }
  }
  /** Mark unfound, collectable items within r on the minimap + full map for sec seconds. */
  function reveal(x, y, r, sec, o) {
    ensure();
    r = r || 900; sec = sec || 180;
    const until = now() + sec;
    let n = 0;
    for (const it of items) {
      if (it.series === 'frames' || !active(it)) continue;
      if (Math.hypot(it.x - x, it.y - y) > r) continue;
      revealIt(it, until); n++;
    }
    N.emit('collectible:reveal', { x, y, r, n, id: (o && o.id) || null });
    return n;
  }
  const isKnown = (id) => { const k = norm(id); return !!(k && T.revealed.has(k)); };
  function vpPos(v) {
    if (v.roof) { const RFs = N.world && N.world.roofs, rf = RFs && RFs.get && RFs.get(v.roof); if (rf) return { x: rf.cx, y: rf.cy }; return anchor({ at: v.roof }); }
    return anchor({ at: v.place });
  }
  /** W6 viewpoint: camera pull-out (zoom 0.55, 3 s), then reveal within its radius. Promise<n>. */
  function viewpoint(id, o) {
    o = o || {};
    ensure();
    let v = typeof id === 'string' ? VIEWPOINTS[id] : id;
    if (!v) { N.err('collectibles.viewpoint', new Error('unknown viewpoint ' + id)); return Promise.resolve(0); }
    const key = typeof id === 'string' ? id : (v.id || 'custom');
    const p = isFinite(o.x) ? { x: o.x, y: o.y } : isFinite(v.x) ? { x: v.x, y: v.y } : vpPos(v);
    if (!p) return Promise.resolve(0);
    if (!o.force && S.vp[key] === day()) return Promise.resolve(0);
    S.vp[key] = day();
    const n = reveal(p.x, p.y, o.r || v.radius || 900, o.secs || 180, { id: key });
    N.emit('viewpoint', { id: key, x: p.x, y: p.y, r: v.radius || 900, n, secs: o.secs || 180 });
    if (o.camera === false || !N.render) { vpToast(v, n); return Promise.resolve(n); }
    return new Promise((res) => {
      if (T.vp) endViewpoint();
      const pl = N.player;
      T.vp = { t: o.secs3 || 3, x: p.x, y: p.y, zoom: o.zoom || 0.55, prev: N.render.camOverride || null, locked: !!(pl && pl.controlsLocked), res, n, v };
      if (pl) pl.controlsLocked = true;
      N.render.camOverride = { x: p.x, y: p.y, zoom: o.zoom || 0.55, rate: 2 };
      sfx('kite_wind', { vol: 0.5 });
    });
  }
  function vpToast(v, n) {
    toast(v.name + ': ' + (n ? n + ' hidden thing' + (n === 1 ? '' : 's') + ' glint on your map for 3 minutes.' : 'nothing hidden in sight from up here.'), 3400, 'coll-vp');
  }
  function endViewpoint() {
    const V = T.vp; if (!V) return;
    T.vp = null;
    if (N.render) N.render.camOverride = V.prev && V.prev.x != null ? V.prev : null;
    if (N.player) N.player.controlsLocked = V.locked;
    vpToast(V.v, V.n);
    try { V.res(V.n); } catch (e) { /* ignore */ }
  }
  function autoViewpoints() {
    const p = N.player; if (!p || p.vehicle || missionActive() || T.vp || T.click) return;
    for (const id in VIEWPOINTS) {
      const v = VIEWPOINTS[id];
      if (v.shop) continue;
      if (v.story && !flags().charminar_gallery_open) continue;
      if (S.vp[id] === day()) continue;
      let at = false;
      if (v.roof) at = p.level === v.roof;
      else { const q = anchor({ at: v.place }); at = !!q && !p.level && Math.hypot(p.x - q.x, p.y - q.y) < (v.r || 26); }
      if (!at) continue;
      // only worth a pause when something is there to show
      const q = vpPos(v); if (!q) continue;
      let n = 0; for (const it of items) if (it.series !== 'frames' && active(it) && Math.hypot(it.x - q.x, it.y - q.y) <= (v.radius || 900)) n++;
      if (!n) continue;
      viewpoint(id);
      return;
    }
  }

  /* ================================================================== prefs (glints / beacon) */
  const PREF_KEY = 'nostalgia.collectibles.prefs.v1';
  const prefs = { glints: true, beacon: true };
  try { const o = JSON.parse(lsGet(PREF_KEY) || 'null'); if (o && typeof o === 'object') { if (typeof o.glints === 'boolean') prefs.glints = o.glints; if (typeof o.beacon === 'boolean') prefs.beacon = o.beacon; } } catch (e) { /* ignore */ }
  const savePrefs = () => lsSet(PREF_KEY, JSON.stringify(prefs));

  /* ================================================================== update */
  const onFootOrBike = (p) => {
    if (!p.vehicle) return true;
    const Ty = N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[p.vehicle.type];
    return !!(Ty && Ty.cls === 'bike');
  };
  const sameLevel = (p, it) => (p.level || null) === (it.level || null);
  let lookIds = [];
  function registerLooks() {
    const I = N.interact; if (!I || !I.add) return;
    for (const id of lookIds) I.remove(id);
    lookIds = [];
    for (const it of items) {
      if (it.pick !== 'look' || !it.ok) continue;
      const key = 'coll:' + it.id, item = it;
      I.add(key, {
        x: it.x, y: it.y, r: it.pr, priority: 4, level: it.level || 'ground',
        label: () => item.look,
        enabled: (p) => !!p && !p.vehicle && sameLevel(p, item) && active(item),
        use: () => { if (active(item)) found(item.id); },
      });
      lookIds.push(key);
    }
  }
  function pickups(p) {
    let carNear = null;
    for (const it of items) {
      if (it.pick !== 'walk' || !active(it) || !sameLevel(p, it)) continue;
      const d = Math.hypot(p.x - it.x, p.y - it.y);
      if (d > it.pr + 8) continue;
      if (!onFootOrBike(p)) { if (d < 16 + it.pr - 10) carNear = it; continue; }
      if (d <= it.pr) { found(it.id); return; }
    }
    if (carNear && N.interact && N.vehicles && N.vehicles.exit) {
      N.interact.offer({ label: 'Get out to pick up', priority: 0, dist: -1, use: () => { try { N.vehicles.exit(p, false); } catch (e) { N.err('collectibles.exit', e); } } });
    }
  }
  function frameOffers(p) {
    T.offerFrame = null;
    if (!unlocked('frames') || T.click) return;
    const boat = p.vehicle && (p.vehicle.type === 'boat' || (N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[p.vehicle.type] && N.vehicles.TYPES[p.vehicle.type].cls === 'boat'));
    if (p.vehicle && !boat) return;
    if (filmUsed() >= 23 && !S.found.has('frame_24')) { /* F24 is kept for Chand Raat */ }
    const respect = !boat && respectAt(p.x, p.y);
    const face = isFinite(p.facing) ? p.facing : p.angle || 0;
    let best = null, bd = Infinity, near = null;
    for (const it of items) {
      if (it.series !== 'frames' || !active(it)) continue;
      if (filmUsed() >= 23) break;
      let d;
      if (boat) { if (!it.boat) continue; d = Math.hypot(p.x - it.sx, p.y - it.sy); if (d > it.boat) continue; }
      else {
        if (p.level) continue;
        d = Math.hypot(p.x - it.x, p.y - it.y);
        if (d > it.pr) continue;
        near = it;
        if (respect) continue;
        const sd = Math.hypot(it.sx - p.x, it.sy - p.y);
        if (sd > 14 && Math.abs(U.angleDiff(face, Math.atan2(it.sy - p.y, it.sx - p.x))) > Math.PI / 3) continue;
      }
      if (d < bd) { bd = d; best = it; }
    }
    if (respect && near && now() > T.respectT) { T.respectT = now() + 25; toast("Nanna's rule: temples, mosques and churches are photographed from the road.", 3200, 'coll-respect'); }
    if (!best) return;
    T.offerFrame = best;
    if (N.interact) N.interact.offer({ label: 'Click (' + best.code + ')', priority: boat ? 2 : 4, dist: bd, level: '*', use: () => click(best.id) });
  }
  function nearestUnfound(x, y, series, o) {
    ensure();
    const k = series ? seriesKey(series) : null;
    let best = null, bd = Infinity;
    for (const it of items) {
      if (k && it.series !== k) continue;
      if (o && o.all) { if (!it.ok || S.found.has(it.id) || (it.series === 'frames' && it.story)) continue; } else if (!active(it)) continue;
      if (!k && it.series === 'frames') continue;
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function beaconAndHint(p, dt) {
    T.beaconT -= dt;
    if (T.beaconT > 0) return;
    T.beaconT = 0.5;
    const quiet = missionActive() || mode() !== 'play';
    const it = quiet ? null : nearestUnfound(p.x, p.y);
    const near = it && Math.hypot(it.x - p.x, it.y - p.y) <= 120 ? it : null;
    // hot/cold beacon (systems §7.2): only ours, never while a mission may use N.audio.beacon
    if (N.audio && typeof N.audio.beacon === 'function') {
      if (near && prefs.beacon) { if (T.beacon !== near) { N.audio.beacon(near, { max: 120 }); T.beacon = near; } }
      else if (T.beacon) { N.audio.beacon(null); T.beacon = null; }
    }
    // minimap hint: a soft ring near (not on) the nearest unfound item of an unlocked series.
    // (a blip, not a hud searchCircle: those belong to the hint system's nudges)
    const H = N.hud;
    if (H && H.blip) {
      if (near && prefs.glints) {
        if (T.near !== near) {
          const a = U.hash2(near.n * 3.1, near.series.length) * TAU, jr = 8 + U.hash2(near.n, 9) * 12;
          H.blip('coll:near', { x: near.x + Math.cos(a) * jr, y: near.y + Math.sin(a) * jr }, { color: 'rgba(255, 216, 74, 0.8)', icon: 'ring', size: 2.2, edge: false, label: '' });
          T.near = near;
        }
      } else if (T.near) { H.unblip('coll:near'); T.near = null; }
    }
  }
  function releaseBeacon() {
    if (T.beacon && N.audio && N.audio.beacon) { try { N.audio.beacon(null); } catch (e) { /* ignore */ } }
    T.beacon = null;
    if (T.near && N.hud && N.hud.unblip) N.hud.unblip('coll:near');
    T.near = null;
  }
  function revealExpiry() {
    const t = now();
    for (const [id, until] of T.revealed) if (t > until || S.found.has(id)) unreveal(id);
  }
  function homeLines(p) {
    if (!S.homeQ.length || T.homeBusy || missionActive() || mode() !== 'play' || p.vehicle) return;
    const due = [];
    for (const n of S.homeQ) {
      const L = LADDER.find((q) => q.n === n); if (!L) continue;
      const at = anchor({ at: L.where || 'home' });
      if (at && Math.hypot(p.x - at.x, p.y - at.y) < (L.where ? 40 : 46)) due.push(L);
    }
    if (!due.length) return;
    S.homeQ = S.homeQ.filter((n) => !due.some((L) => L.n === n));
    const lines = due.map((L) => ({ s: L.s, t: L.line }));
    const D = N.dialogue;
    if (D && typeof D.play === 'function') {
      T.homeBusy = true;
      Promise.resolve().then(() => D.play(lines)).catch((e) => N.err('collectibles.homeLine', e)).then(() => { T.homeBusy = false; });
    } else for (const l of lines) toast((SPEAKER_NAMES[l.s] || l.s) + ': ' + plain(l.t), 4200);
    for (const L of due) N.emit('collectible:homeline', { n: L.n, id: L.id });
  }
  function variants() {
    for (const it of items) {
      if (!it.alt) continue;
      const want = safeWhen(it.alt.when) ? 1 : 0;
      if (want !== it.variant) { resolveItem(it); if (it.pick === 'look') registerLooks(); }
    }
  }
  let slowT = 0;
  function update(dt) {
    if (!ensure()) return;
    const p = N.player; if (!p) return;
    // camera click + viewpoint timers
    if (T.click) clickStep(dt);
    if (T.vp) { T.vp.t -= dt; if (T.vp.t <= 0) endViewpoint(); }
    updateSparkles(dt);
    if (mode() !== 'play' || p.controlsLocked) return;
    pickups(p);
    frameOffers(p);
    beaconAndHint(p, dt);
    slowT -= dt;
    if (slowT <= 0) {
      slowT = 0.5;
      revealExpiry();
      variants();
      checkPrints(false);
      homeLines(p);
      autoViewpoints();
      // keep the ladder's flags honest (a load, or N.flags cleared by a script)
      if (S.ladder.size) ladderCheck(true);
    }
  }

  /* ================================================================== camera click (systems §8.18) */
  let vfEl = null;
  function viewfinder(show, it) {
    if (!vfEl) {
      vfEl = document.createElement('div');
      vfEl.className = 'cl-vf';
      vfEl.setAttribute('aria-hidden', 'true');
      vfEl.innerHTML = '<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><b class="x"></b>' +
        '<span class="osd"><em>●</em> <span class="f"></span></span><span class="cap"></span><span class="flash"></span>';
      document.body.appendChild(vfEl);
    }
    if (it) {
      vfEl.querySelector('.f').textContent = it.code + ' · ' + (filmUsed() + 1) + '/24';
      vfEl.querySelector('.cap').textContent = '“' + it.riddle + '”';
    }
    vfEl.classList.toggle('show', !!show);
    vfEl.classList.remove('flashing');
    if (document.body) document.body.classList.toggle('cl-vf-on', !!show);
  }
  function capture() {
    try {
      const R = N.render, src = R && R.canvas; if (!src || !src.width) return null;
      const c = document.createElement('canvas'); c.width = 120; c.height = 80;
      const g = c.getContext('2d');
      const W0 = src.width, H0 = src.height, cw = Math.min(W0, H0 * 1.5), ch = cw / 1.5;
      g.drawImage(src, (W0 - cw) / 2, (H0 - ch) / 2, cw, ch, 0, 0, 120, 80);
      // a warm 2003 colour print
      g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255, 200, 120, 0.55)'; g.fillRect(0, 0, 120, 80);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255, 150, 40, 0.9)'; g.font = '7px monospace'; g.textAlign = 'right';
      const d = date(); g.fillText("'" + String(d.y).slice(2) + ' ' + pad2(d.m) + ' ' + pad2(d.d), 116, 76);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) { return null; }
  }
  const ALBUM_KEY = 'nostalgia.album.v1';
  let album = null;
  function albumStore() {
    if (album && album.run === S.run) return album;
    let o = null;
    try { o = JSON.parse(lsGet(ALBUM_KEY) || 'null'); } catch (e) { o = null; }
    album = o && o.run === S.run && o.shots && typeof o.shots === 'object' ? o : { run: S.run, shots: {} };
    return album;
  }
  function keepShot(id, url) {
    if (!url) return;
    const A = albumStore();
    A.shots[id] = url;
    lsSet(ALBUM_KEY, JSON.stringify(A));
  }
  /** Click a frame: the viewfinder overlay for 0.6 s, then the flash. id defaults to the offered one. */
  function click(id) {
    ensure();
    const it = id ? get(id) : T.offerFrame;
    if (!it || it.series !== 'frames' || S.found.has(it.id) || T.click) return false;
    if (it.story && !id) return false;
    const p = N.player;
    T.click = { it, t: 0, phase: 0, locked: !!(p && p.controlsLocked), prev: N.render ? N.render.camOverride : null };
    if (p) p.controlsLocked = true;
    if (N.render && isFinite(it.sx)) {
      const mx = p ? (p.x * 0.35 + it.sx * 0.65) : it.sx, my = p ? (p.y * 0.35 + it.sy * 0.65) : it.sy;
      N.render.camOverride = { x: mx, y: my, zoom: 1.08, rate: 4 };
    }
    viewfinder(true, it);
    sfx('ui_select', { vol: 0.5 });
    N.emit('collectible:click', { id: it.id, phase: 'frame' });
    return true;
  }
  function clickStep(dt) {
    const C = T.click; if (!C) return;
    C.t += dt;
    if (C.phase === 0 && C.t >= 0.6) {
      C.phase = 1;
      keepShot(C.it.id, capture());
      if (vfEl) { vfEl.classList.add('flashing'); }
      if (N.render && N.render.fx && !reducedFlash()) N.render.fx.flash = 1;
      found(C.it.id);
    }
    if (C.phase === 1 && C.t >= 0.95) {
      C.phase = 2;
      viewfinder(false);
      if (N.render) N.render.camOverride = C.prev && C.prev.x != null ? C.prev : null;
      if (N.player) N.player.controlsLocked = C.locked;
      T.click = null;
    }
  }
  function cancelClick() {
    const C = T.click; if (!C) return;
    T.click = null;
    viewfinder(false);
    if (N.render) N.render.camOverride = null;
    if (N.player) N.player.controlsLocked = false;
  }

  /* ================================================================== drawing */
  const R = () => N.render;
  function inRange(it, p, r) { return Math.abs(it.x - p.x) < r && Math.abs(it.y - p.y) < r && Math.hypot(it.x - p.x, it.y - p.y) < r; }
  function twinkle(it) {
    const ph = (now() + it.ph) % 3.5;
    return ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) : 0;
  }
  function star(ctx, X, Y, s, a, col) {
    if (a <= 0.01 || s <= 0.2) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = col || '#fff6c8';
    ctx.beginPath();
    ctx.moveTo(X, Y - s); ctx.lineTo(X + s * 0.22, Y - s * 0.22); ctx.lineTo(X + s, Y); ctx.lineTo(X + s * 0.22, Y + s * 0.22);
    ctx.lineTo(X, Y + s); ctx.lineTo(X - s * 0.22, Y + s * 0.22); ctx.lineTo(X - s, Y); ctx.lineTo(X - s * 0.22, Y - s * 0.22);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(X, Y, s * 0.28, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function glint(ctx, it, X, Y, k, p) {
    if (!prefs.glints) return;
    const d = Math.hypot(it.x - p.x, it.y - p.y);
    if (d > 90) return;
    const tw = twinkle(it);
    const close = d < 30 ? (1 - d / 30) : 0;
    if (tw > 0) { ctx.globalCompositeOperation = 'lighter'; star(ctx, X, Y - 1.5 * k, (2.2 + 4.2 * tw) * k, 0.55 + 0.45 * tw); ctx.globalCompositeOperation = 'source-over'; }
    if (close > 0) { // a faint shimmer when you are almost on it
      const t = now() * 3 + it.ph;
      for (let i = 0; i < 3; i++) {
        const a = t + i * 2.1, rr = (2.5 + i) * k;
        star(ctx, X + Math.cos(a) * rr, Y - 1.5 * k + Math.sin(a * 1.3) * rr * 0.6, (0.9 + 0.5 * Math.sin(a * 2)) * k, close * 0.5, '#fffbe0');
      }
    }
  }
  function drawGoli(ctx, it, X, Y, k) {
    const r = (it.r || 1.4) * k * 1.15;
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#1a1020'; ctx.beginPath(); ctx.ellipse(X + 0.6 * k, Y + 0.6 * k, r, r * 0.7, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    const [a, b] = it.col;
    ctx.fillStyle = a; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = b;
    if (it.eye) { ctx.beginPath(); ctx.ellipse(X, Y, r * 0.75, r * 0.28, 0.6, 0, TAU); ctx.fill(); }
    else if (it.swirl || it.twist) { ctx.lineWidth = Math.max(0.6, r * 0.35); ctx.strokeStyle = b; ctx.beginPath(); ctx.arc(X, Y, r * 0.55, 0.3, 3.6); ctx.stroke(); if (it.twist) { ctx.strokeStyle = it.col[0]; } }
    else if (it.speckle) { for (let i = 0; i < 4; i++) ctx.fillRect(X + Math.cos(i * 1.7) * r * 0.5, Y + Math.sin(i * 2.3) * r * 0.5, Math.max(0.6, k * 0.5), Math.max(0.6, k * 0.5)); }
    else { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(X + r * 0.15, Y + r * 0.2, r * 0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(X - r * 0.35, Y - r * 0.38, Math.max(0.5, r * 0.28), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    if (it.raja) { ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = Math.max(0.5, 0.35 * k); ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke(); }
  }
  function drawKite(ctx, it, X, Y, k, gx, gy) {
    const s = 3.4 * k, t = now();
    const sway = Math.sin(t * 2.1 + it.ph) * 0.12;
    // string down to where it is tied / the ground, and a soft shadow
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#1a1020'; ctx.beginPath(); ctx.ellipse(gx + 2 * k, gy + 1 * k, s * 0.8, s * 0.45, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(X, Y); ctx.rotate(0.5 + sway);
    if (!it.notail) { // tail ribbon with the tag
      ctx.strokeStyle = it.col[1] || '#ffffff'; ctx.lineWidth = Math.max(0.7, 0.55 * k);
      ctx.beginPath(); ctx.moveTo(0, s);
      for (let i = 1; i <= 4; i++) ctx.lineTo(Math.sin(t * 3 + i * 1.3 + it.ph) * 1.2 * k, s + i * 1.8 * k);
      ctx.stroke();
      ctx.fillStyle = '#fff8dc'; ctx.fillRect(-0.9 * k, s + 6.4 * k, 1.8 * k, 1.2 * k);
    }
    const col = it.col;
    const body = () => { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.85, 0); ctx.closePath(); };
    if (it.deco === 'box') { ctx.fillStyle = col[0]; ctx.fillRect(-s * 0.6, -s, s * 1.2, s * 0.8); ctx.fillRect(-s * 0.6, s * 0.2, s * 1.2, s * 0.8); ctx.fillStyle = col[1]; ctx.fillRect(-s * 0.6, -s * 0.2, s * 1.2, s * 0.4); }
    else {
      ctx.fillStyle = col[0]; body(); ctx.fill();
      if (it.deco === 'half') { ctx.fillStyle = col[1]; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, 0); ctx.lineTo(0, s); ctx.closePath(); ctx.fill(); }
      else if (it.deco === 'tiranga') { ctx.save(); body(); ctx.clip(); ctx.fillStyle = col[0]; ctx.fillRect(-s, -s, 2 * s, s * 0.67); ctx.fillStyle = col[1]; ctx.fillRect(-s, -s * 0.33, 2 * s, s * 0.67); ctx.fillStyle = col[2]; ctx.fillRect(-s, s * 0.33, 2 * s, s * 0.67); ctx.restore(); }
      else if (it.deco === 'eye') { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 0.32, 0, TAU); ctx.fill(); ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 0.18, 0, TAU); ctx.fill(); }
      else if (it.deco === 'moon') { ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(-s * 0.05, -s * 0.15, s * 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(s * 0.08, -s * 0.2, s * 0.26, 0, TAU); ctx.fill(); }
      else if (it.deco === 'edge') { ctx.strokeStyle = col[1]; ctx.lineWidth = Math.max(0.6, 0.5 * k); body(); ctx.stroke(); }
      else if (it.deco === 'shine') { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.4, -s * 0.5); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = col[1]; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = 'rgba(60,40,20,0.75)'; ctx.lineWidth = Math.max(0.5, 0.3 * k);
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.moveTo(-s * 0.85, 0); ctx.quadraticCurveTo(0, -s * 0.5, s * 0.85, 0); ctx.stroke();
    }
    ctx.restore();
  }
  function drawCassette(ctx, it, X, Y, k) {
    const w = 4.6 * k, h = 2.9 * k;
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#1a1020'; ctx.fillRect(X - w / 2 + 0.6 * k, Y - h / 2 + 0.7 * k, w, h); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(X, Y); ctx.rotate(-0.25 + it.n * 0.17);
    ctx.fillStyle = it.agent ? '#d8d0c0' : '#26242c'; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = it.agent ? '#e8342a' : ['#f2c230', '#e8423a', '#3aa8c8', '#7ad04a'][it.n % 4]; ctx.fillRect(-w / 2 + 0.4 * k, -h / 2 + 0.35 * k, w - 0.8 * k, h * 0.45);
    ctx.fillStyle = '#f4ead8'; ctx.beginPath(); ctx.arc(-w * 0.2, h * 0.08, 0.5 * k, 0, TAU); ctx.arc(w * 0.2, h * 0.08, 0.5 * k, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawTicket(ctx, it, X, Y, k) {
    const w = 3 * k, h = 1.8 * k;
    ctx.save(); ctx.translate(X, Y); ctx.rotate(0.3 - it.n * 0.11);
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#1a1020'; ctx.fillRect(-w / 2 + 0.5 * k, -h / 2 + 0.5 * k, w, h); ctx.globalAlpha = 1;
    ctx.fillStyle = ['#f4a8c8', '#a8e0c0', '#f4e090', '#b8d0f4'][it.n % 4]; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(60,40,60,0.6)'; ctx.fillRect(-w / 2 + 0.3 * k, -0.1 * k, w - 0.6 * k, 0.25 * k);
    ctx.fillStyle = '#3a2a30'; ctx.beginPath(); ctx.arc(w * 0.3, -h * 0.2, 0.32 * k, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawItemAt(ctx, it, p) {
    const Rr = R();
    const h = it.dh || 0;
    const k = Rr.k(h), X = Rr.sx(it.x, k), Y = Rr.sy(it.y, k);
    if (it.pick === 'look') { // inside the shop: only a glint at the counter
      glint(ctx, it, X, Y, k, p);
      return;
    }
    if (it.series === 'golis') drawGoli(ctx, it, X, Y, k);
    else if (it.series === 'kites') { const k0 = Rr.k(0); drawKite(ctx, it, X, Y, k, Rr.sx(it.x, k0), Rr.sy(it.y, k0)); }
    else if (it.series === 'cassettes') drawCassette(ctx, it, X, Y, k);
    else if (it.series === 'tickets') drawTicket(ctx, it, X, Y, k);
    glint(ctx, it, X, Y, k, p);
  }
  function draw() {
    const m = mode();
    if (m === 'title' || m === 'boot' || !resolved) return;
    const Rr = R(); if (!Rr || !Rr.queue) return;
    const p = N.player; if (!p) return;
    const v = Rr.view;
    const night = Rr.night || 0;
    for (const it of items) {
      if (it.series === 'frames' || !active(it)) continue;
      if (it.x < v.x0 - 40 || it.x > v.x1 + 40 || it.y < v.y0 - 60 || it.y > v.y1 + 40) continue;
      const fn = it._fn || (it._fn = (ctx) => drawItemAt(ctx, it, N.player));
      if (it.drawLayer === 'roof' && it.roofKey) Rr.queue('structures', Rr.distKey(it.roofKey.x, it.roofKey.y) + 0.5, fn);
      else if (it.hostRock) Rr.queue('structures', Rr.distKey(it.hostRock.x, it.hostRock.y) + 0.5, fn);
      else if (it.host && landmark(it.host)) { const l = landmark(it.host); Rr.queue('structures', Rr.distKey(l.x, l.y) + 0.5, fn); }
      else Rr.queue('actors', it.y - 0.5, fn);
      if (night > 0.15 && prefs.glints && inRange(it, p, 90)) {
        const tw = twinkle(it);
        if (tw > 0) Rr.lights.push({ x: it.x, y: it.y, r: 9 + 9 * tw, color: '#fff2b0', intensity: 0.35 + 0.5 * tw, h: it.dh || 0, glow: false });
      }
    }
    if (T.sparkles.length) Rr.queue('fx', 0, drawSparkles);
    if (flags().marble_pouch && !p.vehicle && !p.hidden && !p.level && Rr.inView(p.x, p.y, 20)) Rr.queue('actors', p.y + 0.05, drawPouch);
  }
  function drawPouch(ctx) {
    const p = N.player, Rr = R();
    const f = isFinite(p.facing) ? p.facing : p.angle || 0, a = f + Math.PI / 2;
    // a cloth marble pouch on a string at Chinnu's right hip, a little behind
    const x = p.x + Math.cos(a) * 3.4 - Math.cos(f) * 1.2, y = p.y + Math.sin(a) * 3.4 - Math.sin(f) * 1.2;
    const k = Rr.k(4), X = Rr.sx(x, k), Y = Rr.sy(y, k), r = 1.7 * k;
    ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.arc(X, Y, r + Math.max(0.6, 0.35 * k), 0, TAU); ctx.fill();
    ctx.fillStyle = '#a8743a'; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8a860'; ctx.fillRect(X - r * 0.9, Y - r * 0.25, r * 1.8, Math.max(0.6, r * 0.28));
    ctx.fillStyle = '#7ad0e8'; ctx.beginPath(); ctx.arc(X - r * 0.35, Y - r * 0.55, Math.max(0.6, r * 0.32), 0, TAU); ctx.fill();
    ctx.fillStyle = '#f06a10'; ctx.beginPath(); ctx.arc(X + r * 0.35, Y - r * 0.6, Math.max(0.6, r * 0.28), 0, TAU); ctx.fill();
  }
  /* pickup burst: 10 sparkles (systems §7.2) */
  function burst(x, y, h, col) {
    if (!isFinite(x) || !isFinite(y)) return;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + Math.random() * 0.4, sp = 16 + Math.random() * 18;
      T.sparkles.push({ x, y, h: h || 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vh: 14 + Math.random() * 12, t: 0, life: 0.7 + Math.random() * 0.3, col: i % 3 === 0 ? (col || '#ffd84a') : '#fff6c8' });
    }
    if (T.sparkles.length > 80) T.sparkles.splice(0, T.sparkles.length - 80);
  }
  function updateSparkles(dt) {
    if (!T.sparkles.length) return;
    for (const s of T.sparkles) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.h = Math.max(0, s.h + s.vh * dt); s.vh -= 40 * dt; s.vx *= 0.94; s.vy *= 0.94; }
    T.sparkles = T.sparkles.filter((s) => s.t < s.life);
  }
  function drawSparkles(ctx) {
    const Rr = R();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of T.sparkles) {
      const k = Rr.k(s.h), X = Rr.sx(s.x, k), Y = Rr.sy(s.y, k), a = 1 - s.t / s.life;
      star(ctx, X, Y, (1.2 + 1.6 * a) * k, a, s.col);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  /** 3D parity: glint positions of collectable items near the player. */
  function glintPoints(r) {
    const p = N.player, out = [];
    if (!p || !resolved) return out;
    for (const it of items) {
      if (it.series === 'frames' || !active(it) || !inRange(it, p, r || 120)) continue;
      out.push({ id: it.id, series: it.series, x: it.x, y: it.y, h: it.dh || 0, tw: twinkle(it), level: it.level });
    }
    return out;
  }

  /* ================================================================== HUD counter chip (flashes on pickup) */
  let chipEl = null, chipTimer = 0;
  function chip(series, n, mx) {
    try {
      if (!chipEl || !chipEl.isConnected) {
        chipEl = document.createElement('div');
        chipEl.className = 'cl-chip';
        chipEl.setAttribute('aria-live', 'polite');
        const host = document.querySelector('#hud .hud-stats') || document.getElementById('ui') || document.body;
        host.appendChild(chipEl);
      }
      chipEl.className = 'cl-chip show s-' + series;
      chipEl.innerHTML = '<i class="ico"></i><b>' + esc(SERIES[series].label) + '</b><span>' + n + '/' + mx + '</span><small>' + total() + '/93</small>';
      void chipEl.offsetWidth;
      chipEl.classList.add('flash');
      clearTimeout(chipTimer);
      chipTimer = setTimeout(() => { if (chipEl) chipEl.classList.remove('show', 'flash'); }, 3200);
    } catch (e) { N.err('collectibles.chip', e); }
  }

  /* ================================================================== Journal pages */
  function refreshJournal() {
    try { if (mode() === 'journal' && N.menus && N.menus.refreshJournal) N.menus.refreshJournal(); } catch (e) { /* ignore */ }
  }
  function rewardRow(series) {
    const k = series, n = k === 'frames' ? countPrints() : count(k);
    const R0 = REWARDS[k] || [];
    let h = '<ul class="cl-rw">';
    for (const r of R0) {
      const done = S.paid.has(k + ':' + (r.key || r.n));
      const what = r.money ? rs(r.money) + (r.flag === 'marbles_tiger' ? ' + Marbles vs Tiger' : r.title ? ' + title' : '') : r.item === 'charkhi' ? 'a charkhi' : r.item === 'raja_goli' ? 'the Raja goli' : r.item === 'ticket_punch' ? "Thatha's punch: free buses" :
        r.key === 'dedications' ? 'all 12 songs: your own farmaish' : r.key === 'agent' ? 'all 4 Agent tapes: promoted' : r.flag === 'kites_all' ? 'the kite train' : r.flag === 'album_captions' ? "Nanna's captions" : r.flag === 'framed_print' ? 'framed on the café wall' : '?';
      h += '<li class="' + (done ? 'done' : '') + '"><b>' + (r.n ? r.n + (k === 'frames' ? ' prints' : '') : '★') + '</b>' + esc(what) + (done ? ' ✓' : '') + '</li>';
    }
    return h + '</ul>';
  }
  function head(k, extra) {
    const S0 = SERIES[k];
    return '<div class="cl-head"><h3 class="nb-title">' + esc(S0.title) + ' <small>' + (k === 'frames' ? countPrints() + '/23 prints' : count(k) + '/' + S0.total) + '</small></h3>' + (extra || '') + '</div>' +
      (unlocked(k) ? rewardRow(k) : '<p class="nb-empty">' + esc(S0.locked) + '</p>');
  }
  function whenNote(it) { return it.whenText ? ' <em class="cl-when">(' + esc(it.whenText) + ')</em>' : ''; }
  function pageKites(el) {
    const on = unlocked('kites');
    let h = '<div class="cl-pg cl-kites">' + head('kites');
    h += '<ol class="cl-list">';
    for (const it of items.filter((q) => q.series === 'kites')) {
      const f = S.found.has(it.id);
      h += '<li class="' + (f ? 'got' : 'miss') + '"><i class="cl-kite" style="--a:' + it.col[0] + ';--b:' + (it.col[1] || '#fff') + '"></i><div>' +
        '<b>' + it.code + ' · ' + (f ? esc(it.name) : '???') + '</b>' + (f && S.late.has(it.id) ? ' <em class="cl-when">(after Chand Raat)</em>' : '') +
        (on ? '<p class="cl-hint">' + emph(it.hint) + '</p>' : '') +
        (f ? '<p class="cl-tag">Tail tag: “' + esc(it.tag) + '”</p>' : '') + '</div></li>';
    }
    h += '</ol>';
    if (on) h += '<p class="cl-foot">Found kites fly back to Patang Chacha by themselves. All twelve before Chand Raat for the kite train.</p>';
    el.innerHTML = h + '</div>';
  }
  function pageGolis(el) {
    const on = unlocked('golis');
    let h = '<div class="cl-pg cl-golis">' + head('golis');
    h += '<ul class="cl-gl">';
    for (const it of items.filter((q) => q.series === 'golis')) {
      const f = S.found.has(it.id);
      h += '<li class="' + (f ? 'got' : 'miss') + '"><i class="cl-goli' + (it.raja ? ' raja' : '') + '" style="--a:' + it.col[0] + ';--b:' + it.col[1] + '"></i><div><b>' + it.code + ' · ' + (f ? emph(it.md) : '???') + '</b>' +
        (on ? '<p class="cl-hint">' + emph(it.hint) + '</p>' : '') + '</div></li>';
    }
    el.innerHTML = h + '</ul></div>';
  }
  function pageCassettes(el) {
    const on = unlocked('cassettes');
    let h = '<div class="cl-pg cl-tapes">' + head('cassettes');
    h += '<ul class="cl-list">';
    for (const it of items.filter((q) => q.series === 'cassettes')) {
      const f = S.found.has(it.id);
      h += '<li class="' + (f ? 'got' : 'miss') + (it.agent ? ' agent' : '') + '"><i class="cl-tape"></i><div><b>' + it.code + ' · ' + (f ? esc(it.agent ? it.title + " (Immu's memo)" : it.title) : '???') + '</b>' + whenNote(it) +
        (on && !f ? '<p class="cl-hint">' + emph(it.hint) + '</p>' : '') +
        (f ? '<p class="cl-ded">' + emph(subst(it.text)) + '</p><button type="button" class="mn-btn small cl-play" data-nav data-play="' + it.id + '">▶ Play</button>' : '') + '</div></li>';
    }
    el.innerHTML = h + '</ul></div>';
    el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => {
      try { if (N.walkman && N.walkman.play) N.walkman.play(b.dataset.play); } catch (e) { N.err('collectibles.play', e); }
    }));
  }
  function pageTickets(el) {
    const on = unlocked('tickets');
    let h = '<div class="cl-pg cl-tickets">' + head('tickets');
    h += '<ul class="cl-tk">';
    for (const it of items.filter((q) => q.series === 'tickets')) {
      const f = S.found.has(it.id), card = TRIVIA['trivia_' + it.code];
      h += '<li class="' + (f ? 'got' : 'miss') + '" style="--r:' + (((it.n * 37) % 7) - 3) + 'deg"><b>' + it.code + ' · ' + esc(STOP_NAMES[it.n - 1]) + '</b>' +
        (on ? '<p class="cl-hint">“' + esc(it.riddle) + '”</p>' : '') +
        (f && card ? '<p class="cl-fact">' + emph(card.text) + '</p>' : on ? '<p class="cl-sub">Behind the board of the stop. (Back of the ticket: a trivia card.)</p>' : '') + '</li>';
    }
    el.innerHTML = h + '</ul></div>';
  }
  function pageAlbum(el) {
    const on = unlocked('frames');
    const caps = !!flags().album_captions;
    const pend = {}; for (const p of S.pending) pend[p.id] = p;
    const A = albumStore();
    let h = '<div class="cl-pg cl-album">' + head('frames', '<span class="cl-film">FILM ' + filmUsed() + '/24</span>');
    if (on) h += '<p class="cl-sub">Stand at the spot, face it, press ACTION “Click”. Temples, mosques and churches from the road. Develop at Raj Colour Lab, ₹2 a frame: ready day after tomorrow.</p>';
    h += '<ul class="cl-al">';
    for (const it of items.filter((q) => q.series === 'frames')) {
      const clicked = S.found.has(it.id), printed = S.prints.has(it.id), pd = pend[it.id];
      let inner;
      if (printed) {
        const shot = A.shots[it.id];
        inner = '<span class="cl-print">' + (shot ? '<img alt="" src="' + esc(shot) + '">' : '<span class="cl-sketch">' + esc((it.place || '').replace(/_/g, ' ')) + '</span>') + '</span>' +
          '<b>' + it.code + '</b>' + (caps && it.caption ? '<p class="cl-cap">' + esc(it.caption) + '</p>' : '<p class="cl-hint">' + esc(it.riddle) + '</p>');
        if (it.story && it.print) inner += '<p class="cl-sub">' + esc(it.print) + '</p>';
      } else if (pd) inner = '<span class="cl-corner wait">at the lab</span><b>' + it.code + '</b><p class="cl-sub">Raj-uncle: ready on day ' + (pd.ready + 1) + ' (or after the next mission).</p>';
      else if (clicked) inner = '<span class="cl-corner roll">on the roll</span><b>' + it.code + '</b><p class="cl-sub">Develop it at Raj Colour Lab (₹2).</p>';
      else inner = '<span class="cl-corner"></span><b>' + it.code + '</b>' + (on ? '<p class="cl-hint">“' + esc(it.riddle) + '”' + whenNote(it) + '</p>' : '');
      h += '<li class="' + (printed ? 'got' : 'miss') + '">' + inner + '</li>';
    }
    el.innerHTML = h + '</ul></div>';
  }
  function pageTrivia(el) {
    const ids = Object.keys(TRIVIA);
    const core = ids.filter((id) => TRIVIA[id].core), extra = ids.filter((id) => !TRIVIA[id].core);
    const nCore = core.filter((id) => S.trivia.has(id)).length;
    let h = '<div class="cl-pg cl-trivia"><div class="cl-head"><h3 class="nb-title">Trivia cards <small>' + nCore + '/' + CORE_TRIVIA + '</small></h3></div>' +
      '<p class="cl-sub">True facts only. Tickets have one on the back; every developed print opens one.</p><ul class="cl-cards">';
    const card = (id) => {
      const c = TRIVIA[id], on = S.trivia.has(id);
      const from = c.source === 'ticket' ? 'the back of ticket ' + c.code : c.source === 'frame' ? 'print ' + c.code : 'the story';
      return '<li class="' + (on ? 'got' : 'miss') + '"><b>' + (on ? esc(c.title) : '?') + '</b>' + (on ? '<p>' + emph(c.text) + '</p>' : '') + '<small>' + esc(from) + '</small></li>';
    };
    for (const id of core) h += card(id);
    h += '</ul>';
    const ex = extra.filter((id) => S.trivia.has(id));
    if (ex.length) { h += '<h4 class="cl-h4">From the story</h4><ul class="cl-cards">'; for (const id of ex) h += card(id); h += '</ul>'; }
    // the total-finds ladder
    const n = total();
    h += '<h4 class="cl-h4">All finds: ' + n + '/93</h4><ul class="cl-lad">';
    for (const L of LADDER) h += '<li class="' + (S.ladder.has(L.n) ? 'done' : '') + '"><b>' + L.n + '</b>' + esc(subst(L.name)) + '<small>' + esc(L.sub) + '</small></li>';
    h += '</ul>';
    const titles = Array.isArray(flags().titles) ? flags().titles : [];
    if (titles.length) h += '<p class="cl-titles">Titles: ' + titles.map((t) => '<span>' + esc(t) + '</span>').join(' ') + '</p>';
    el.innerHTML = h + '</div>';
  }
  const PAGES = [
    { id: 'cl_kites', title: 'Kites', order: 60, render: pageKites },
    { id: 'cl_golis', title: 'Golis', order: 61, render: pageGolis },
    { id: 'cl_cassettes', title: 'Cassettes', order: 62, render: pageCassettes },
    { id: 'cl_tickets', title: 'Tickets', order: 63, render: pageTickets },
    { id: 'cl_album', title: "Nanna's album", order: 64, render: pageAlbum },
    { id: 'cl_trivia', title: 'Trivia cards', order: 65, render: pageTrivia },
  ];
  let tabsAdded = false;
  function addTabs() {
    const M = N.menus;
    if (tabsAdded || !M || typeof M.addJournalTab !== 'function') return false;
    for (const P of PAGES) {
      const pg = P;
      M.addJournalTab({ id: pg.id, title: pg.title, order: pg.order, badge: () => (S.badges.has(pg.id) ? '!' : ''), render: (el) => { S.badges.delete(pg.id); try { ensure(); pg.render(el); } catch (e) { N.err('collectibles.page:' + pg.id, e); el.innerHTML = '<p class="nb-empty">This page is smudged.</p>'; } } });
    }
    tabsAdded = true;
    return true;
  }
  /** Plain-text version of a page (fallback when there is no Journal; N.debug.collectibles()). */
  function journalHTML(tab) { const P = PAGES.find((q) => q.id === tab || q.id === 'cl_' + tab); if (!P) return ''; const d = document.createElement('div'); P.render(d); return d.innerHTML; }
  function debugRows(series) {
    ensure();
    const k = seriesKey(series);
    return items.filter((it) => !k || it.series === k).map((it) => ({
      id: it.id, code: it.code, series: it.series, name: plain(it.name), hint: plain(it.hint), place: it.place, tech: it.tech, pick: it.pick,
      x: Math.round(it.x), y: Math.round(it.y), h: it.dh || 0, level: it.level, ok: it.ok, moved: Math.round(it.moved || 0), note: it.note || '',
      found: S.found.has(it.id), active: active(it), printed: S.prints.has(it.id),
    }));
  }

  /* ================================================================== save */
  function serialize() {
    return {
      found: Array.from(S.found.entries()), late: Array.from(S.late), unlocked: Array.from(S.unlocked), prints: Array.from(S.prints),
      pending: S.pending.slice(), trivia: Array.from(S.trivia), paid: Array.from(S.paid), ladder: Array.from(S.ladder), homeQ: S.homeQ.slice(),
      vp: Object.assign({}, S.vp), run: S.run, badges: Array.from(S.badges),
    };
  }
  function deserialize(o) {
    clearState();
    if (!o || typeof o !== 'object') return;
    const arr = (a) => (Array.isArray(a) ? a : []);
    for (const e of arr(o.found)) {
      const id = norm(Array.isArray(e) ? e[0] : e);
      if (id) S.found.set(id, Array.isArray(e) && isFinite(e[1]) ? +e[1] : 0);
    }
    for (const id of arr(o.late)) { const k = norm(id); if (k) S.late.add(k); }
    for (const s of arr(o.unlocked)) { const k = seriesKey(s); if (k) S.unlocked.add(k); }
    for (const id of arr(o.prints)) { const k = norm(id); if (k && byId[k].series === 'frames') S.prints.add(k); }
    for (const p of arr(o.pending)) { const k = p && norm(p.id); if (k && !S.prints.has(k)) S.pending.push({ id: k, ready: isFinite(p.ready) ? +p.ready : day(), after: isFinite(p.after) ? +p.after : 0 }); }
    for (const id of arr(o.trivia)) if (TRIVIA[id]) S.trivia.add(id);
    for (const k of arr(o.paid)) if (typeof k === 'string') S.paid.add(k);
    for (const n of arr(o.ladder)) if (LADDER.some((L) => L.n === +n)) S.ladder.add(+n);
    for (const n of arr(o.homeQ)) if (LADDER.some((L) => L.n === +n)) S.homeQ.push(+n);
    if (o.vp && typeof o.vp === 'object') for (const k in o.vp) if (isFinite(o.vp[k])) S.vp[k] = +o.vp[k];
    if (typeof o.run === 'string') S.run = o.run;
    for (const b of arr(o.badges)) if (typeof b === 'string') S.badges.add(b);
    album = null;
    // cassettes the walkman lost (older saves): give them back quietly
    try { if (N.walkman && N.walkman.add) for (const id of S.found.keys()) if (byId[id].series === 'cassettes' && !(N.walkman.has && N.walkman.has(id))) N.walkman.add(id, { silent: true }); } catch (e) { /* ignore */ }
    ladderCheck(true);
  }
  function clearState() {
    unlCache.frame = -1;
    S.found.clear(); S.late.clear(); S.unlocked.clear(); S.prints.clear(); S.pending = []; S.trivia.clear(); S.paid.clear(); S.ladder.clear(); S.homeQ = []; S.vp = {}; S.badges.clear();
    for (const id of Array.from(T.revealed.keys())) unreveal(id);
    T.sparkles = [];
    if (T.vp) { const V = T.vp; T.vp = null; if (N.render) N.render.camOverride = null; try { V.res(0); } catch (e) { /* ignore */ } }
    cancelClick();
    releaseBeacon();
    T.homeBusy = false;
    album = null;
  }
  function newRun() { S.run = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); album = null; }

  /* ================================================================== debug */
  function collectAll(series) {
    ensure();
    const k = seriesKey(series);
    let n = 0;
    for (const it of items) {
      if (k && it.series !== k) continue;
      if (it.series === 'frames' && it.story) continue;
      if (!unlocked(it.series)) unlockSeries(it.series, { silent: true });
      if (found(it.id, { silent: true, develop: it.series === 'frames' })) n++;
    }
    return n;
  }
  function installDebug() {
    const D = N.debug; if (!D || D._coll) return;
    D._coll = true;
    D.collectibles = (series) => debugRows(series);
    D.collectibleGo = (id) => {
      ensure();
      const it = get(id); if (!it || !N.player) return null;
      if (it.level && N.world.roofs) { N.world.roofs.place(N.player, it.level, it.ax, it.ay); return { x: N.player.x, y: N.player.y, level: it.level }; }
      // stand a step away so the pickup happens by walking
      N.player.teleport(it.ax, it.ay, { ground: true });
      return { x: N.player.x, y: N.player.y };
    };
    D.unlockSeries = (s) => unlockSeries(s || 'kites');
  }

  /* ================================================================== public object */
  const C = (N.collectibles = {
    SERIES, LADDER, VIEWPOINTS, TRIVIA, REWARDS, CAPTIONS,
    items, byId, list: items,
    get, item: get, norm, seriesKey,
    found, has, isFound: has,
    collect: (id, o) => found(id, o),
    count, total, max, foundIds,
    unlocked, unlockSeries, lockSeries,
    isActive: (id) => active(get(id)),
    nearestUnfound, posOf: (id) => { ensure(); const it = get(id); return it && it.ok ? { x: it.x, y: it.y, level: it.level || null } : null; },
    blip(id, o) { ensure(); const it = get(id); if (!it || !N.hud || !N.hud.blip) return false; N.hud.blip('coll:story:' + it.id, { x: it.x, y: it.y }, Object.assign({ color: '#ffd84a', icon: 'star', label: plain(it.name), pulse: true }, o || {})); return true; },
    unblip(id) { const it = get(id); if (it && N.hud && N.hud.unblip) N.hud.unblip('coll:story:' + it.id); },
    reveal, isKnown, viewpoint,
    click, film: () => ({ used: filmUsed(), left: 24 - filmUsed() }), undeveloped, develop, printNow,
    prints: () => Array.from(S.prints), pendingPrints: () => S.pending.map((p) => Object.assign({}, p)),
    triviaFor, unlockTrivia, triviaUnlocked: (id) => { const c = cardFor(id); return !!(c && S.trivia.has(c.id)); },
    trivia: () => Object.keys(TRIVIA).map((id) => Object.assign({ unlocked: S.trivia.has(id) }, TRIVIA[id])),
    kitesForEnding: () => foundIds('kites').filter((id) => !S.late.has(id)),
    ladder: ladderReached,
    get glints() { return prefs.glints; }, set glints(v) { prefs.glints = !!v; savePrefs(); if (!v) releaseBeacon(); },
    get beacon() { return prefs.beacon; }, set beacon(v) { prefs.beacon = !!v; savePrefs(); if (!v) releaseBeacon(); },
    glintPoints, collectAll, journalHTML, debugRows,
    resolve: () => { resolved = false; return resolveAll(); },
    get resolved() { return resolved; },
    serialize, deserialize,
    stats: () => ({ found: S.found.size, total: total(), prints: S.prints.size, pending: S.pending.length, trivia: S.trivia.size, revealed: T.revealed.size, unlocked: Array.from(S.unlocked), ladder: ladderReached() }),
  });
  // found(id) marks an item (systems §7.6); older callers treat N.collectibles.found as a Set
  found.has = has;
  Object.defineProperty(found, 'size', { get: () => S.found.size });
  found.forEach = (fn) => S.found.forEach((d, id) => fn(id, id));
  found.ids = () => Array.from(S.found.keys());

  /* ================================================================== system + events */
  N.on('world:built', () => { resolved = false; resolveAll(); if (N.systems && N.systems.started) registerLooks(); });
  N.on('game:new', () => { newRun(); });
  N.on('mission:start', () => { releaseBeacon(); if (T.vp) endViewpoint(); });
  N.on('mission:complete', () => { checkPrints(true); });
  N.on('journal:tab', (d) => { if (d && d.id) S.badges.delete(d.id); });
  N.on('calendar:change', () => { if (resolved) variants(); });
  N.on('season:change', () => { if (resolved) variants(); });
  N.on('state', (d) => { if (d && d.mode === 'title') { cancelClick(); releaseBeacon(); } });
  // walkman bought / given later: unlock the series silently (the Journal shows it)
  N.on('item:give', (d) => { const id = d && (d.id || d.item); if (id === 'camera') S.badges.add('cl_album'); });

  N.addSystem({
    id: 'collectibles', order: 55, runIn: ['play', 'dialogue', 'cutscene'],
    init() {
      try { ensure(); } catch (e) { N.err('collectibles.resolve', e); }
      registerLooks();
      addTabs();
      if (N.save && typeof N.save.register === 'function') N.save.register('collectibles', { serialize, deserialize });
      if (N.menus && typeof N.menus.addSettingsRow === 'function') {
        N.menus.addSettingsRow({ id: 'coll.glints', label: 'Collectible glints', type: 'toggle', get: () => prefs.glints, set: (v) => { C.glints = v; }, help: 'A twinkle on hidden kites, golis, tapes and tickets near you, and a hint circle on the minimap.' });
        N.menus.addSettingsRow({ id: 'coll.beacon', label: 'Collectible beacon', type: 'toggle', get: () => prefs.beacon, set: (v) => { C.beacon = v; }, help: 'Hot/cold beeps within 120 u of a hidden thing.' });
      }
      installDebug();
      if (!S.run) newRun();
    },
    update(dt) {
      if (mode() !== 'play') { if (T.click) clickStep(dt); if (T.vp && mode() !== 'paused') { T.vp.t -= dt; if (T.vp.t <= 0) endViewpoint(); } return; }
      update(dt);
    },
    draw,
    reset() { clearState(); },
  });
  N.on('boot', () => { installDebug(); addTabs(); if (!lookIds.length) registerLooks(); });
})();
