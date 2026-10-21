/* NOSTALGIA — npcs.js  (owner: cast agent; ARCHITECTURE.md §19, story bible §2)
 * The named cast: every character of the story bible (§2 and the walk-ons of §4-§9) with a
 * sprite look for N.people.draw (plus cast extras: hats, beards, specs, props), a procedural
 * dialogue portrait (N.dialogue.paintPortrait look), a name-plate colour, a voice pitch and
 * 2026 variants. Every character is registered in N.dialogue.speakers. Runtime: spawning named
 * actors with talk interactions, walking along walkable ground (road graph + grid A* + steering,
 * never stuck), following the player (on foot or on their own cycle), riding / driving,
 * look-at, emotes, barks, and schedules for the colony regulars.
 *
 * Character ids (speaker ids = npc ids): chinnu srikanth amma nanna ammamma chitti bunty immu
 *   imran abba ammi nani ayesha pasha babloo faramarz pochaiah yadagiri ramulu agarwal bahadur
 *   kite_chacha ticket_thatha salim vimala_maam cable_babji photo_uncle net_uncle flower_aunty
 *   tiger caretaker aunty aunty_2 aunty_3 + walk-ons (bakery_man gokul_man paradise_man
 *   bawarchi_man conductor sentry mali watchman guide boatman farmer chemist painter ticket_man
 *   black_ticket narsimha chappal_man bangle_man attar_man recording_man coconut_man dosa_man
 *   stationery_man kirana_kid papad_man bird_man book_man bakery_lady meat_man uncle coach guard
 *   carol_aunty waiter banana_man) + speakers loudspeaker radio crowd chit email immu_tape
 *   imran_tape. 'you' = chinnu (2003) / srikanth (2026). Unknown ids get a seeded generic look.
 *
 * API (story.js / story2.js / storycore / wanted / shops call these; all tolerate stubs)
 *   N.npcs.define(id, {name, color, voice, look, portrait, look2026, portrait2026, name2026,
 *       variants: {name: {look, portrait}}, vehicle: type, speed, lines: [...], talkName, side})
 *   N.npcs.defs[id], N.npcs.ids() -> every defined id, N.npcs.cast (bible §2 ids)
 *   N.npcs.spawn(id, target, {angle, idle: 'stand'|'wander'|'sit'|'work', talk, label, key,
 *       r (wander radius), off: [dx, dy], bench, roof, vehicle (spawn riding), owner}) -> actor
 *     target: place id | [place ids] (first that exists) | landmark id | npc key | 'player' |
 *       {x, y} | [x, y] | entity. A key already spawned is moved instead of duplicated. An
 *       unknown target (a place not in the map yet) spawns beside the player (console.warn once).
 *       A place on a roof zone (home_terrace, friend_terrace, patang_chacha_roof, lootna
 *       terraces...) or opts.roof = '<roof id>' puts the actor on that roof (N.world.roofs.place).
 *     talk: function(actor, player) | 'line' | [lines | {t, mood}] | false (no ACTION).
 *       Default: one of the character's own lines (or a hint, see below). Label "Talk to Immu".
 *     The actor: {key, npcId, x, y, angle, look (variant/year aware), alive, despawn(), stats,
 *       ownVehicle, level (roof id)}; an entity of kind 'npc'; m.spawn(actor) in a mission
 *       makes it auto-despawn when the mission ends.
 *   N.npcs.despawn(idOrActor), get(key) -> actor | null, all() -> [actors], list {key: actor}
 *   await N.npcs.walkTo(key, target, {run, speed, r, timeout, face}) -> true (arrived) | false
 *     Long walks follow the road graph, short ones a grid A* path, smoothed and re-planned when
 *     blocked (around seated / standing people too: resting bodies are soft obstacles in the re-plan);
 *     off-screen it hops forward if truly stuck. Called during a mission, the promise
 *     REJECTS with a MissionAbort when that mission ends (so a script never runs on).
 *   N.npcs.stop(key)  cancels walkTo / driveTo (they resolve false)
 *   N.npcs.follow(key, leader | null, {dist, side: 'left'|'right'|'behind', ride: true | type})
 *     companions keep up on foot; with ride, when the leader rides they mount their own vehicle
 *     (def.vehicle, e.g. Immu's red Hero cycle), follow it, and get off when the leader does.
 *   N.npcs.ride(key, type | vehicle, opts) -> vehicle; dismount(key)
 *   await N.npcs.driveTo(key, target, {r, speed, timeout}) -> true | false (road graph route)
 *   N.npcs.lookAt(key, target | null), face(key, target)
 *   N.npcs.emote(key, '!'|'?'|'♪'|'...'|'♥'|'!!'|'zzz'|'anger'|'sweat'|'*', secs)
 *   N.npcs.bark(key, text, opts) -> N.dialogue.bark(actor, text, {speaker: id, ...})
 *   N.npcs.say(key, text, opts) -> faces the player, then N.dialogue.say(id, text, opts)
 *   N.npcs.setTalk(key, talk), setIdle(key, idle, opts), setLabel(key, label)
 *   N.npcs.setVariant(id, name | null)  e.g. ('chinnu', 'school'), ('immu', 'raincoat'),
 *     ('amma', 'night'|'chappal'), ('ramulu', 'pothuraju'), ('abba', 'chandraat'),
 *     ('bunty', 'committee'). Auto: chand_raat -> immu raincoat + abba cap; bonalu -> Pothuraju.
 *   N.npcs.look(id) -> sprite look, portraitLook(id) -> portrait look (for wanted.js pursuers)
 *   N.npcs.schedule(name, on) / schedules / scheduleOn(name). Regulars (default on): colony_aunties
 *     (cement bench at playground_1, 07-20, "Ask aunty" -> N.hints.next('aunty')), faramarz
 *     (irani_cafe_19 / cafe_noor_e_iran, 07-23), kite_chacha (his roof by Patang Bazaar, 07-19),
 *     shopkeepers (Salim, Agarwal-ji, Ramulu, Lakshmamma, Raj-uncle, Net-uncle, Ticket Thatha),
 *     ammamma_swing (home verandah, 06-21, talk -> N.hints.next('home')), bahadur_night,
 *     pochaiah_podium (hidden while the Chappal Meter is >= 3), cable_babji, tiger_ground,
 *     vimala_school. Off by default: immu_hangout (post-game, bible §9.5), ayesha_nets.
 *     A key the story spawned itself is never moved or removed by a schedule.
 *   N.npcs.applyPlayerLook() — Chinnu's sprite look on N.player (Srikanth in 2026); done on
 *     game:new / load / year change unless N.npcs.keepPlayerLook = true.
 *   N.npcs.talkTo(key) -> Promise (runs the actor's talk as if the player pressed ACTION)
 *   N.npcs.displayName(id), variant(id), lastSpeaker (key of the last NPC talked to)
 *   N.npcs.planPath(x0, y0, x1, y1) -> [{x, y}] | null; gridPath, freeSpot, lineClear (other AI)
 * Events: npc:spawn {key, id, actor}, npc:despawn {key, id}, npc:talk {key, id, actor},
 *   npc:arrive {key, id}. Save section 'npcs' {schedules}.
 * Hints hook (storycore N.hints): Ammamma's default talk shows N.hints.next('home').text, the
 *   gate aunties' N.hints.next('aunty').text, Old City locals (Patang Chacha, Faramarz, the bangle /
 *   attar / bird / chappal / papad sellers) N.hints.next('city').text inside the Old City; with no
 *   active clue (null) they say one of their own lines.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================ year / flags */
  function is2026() {
    if (N.dialogue && N.dialogue.is2026) return N.dialogue.is2026();
    const f = N.flags || {};
    return f.year === 2026 || f.year2026 === true;
  }

  /* ================================================================ cast data */
  // sprite look: N.people.draw fields + cast extras (hat, hatColor, beard, specs, ponytails, plaits,
  // puff, cowlick, headCover, walkman, camera, towel, apron, shoulders, belly, body, neem, prop, size)
  // portrait: N.dialogue.paintPortrait fields. Colours, ages and props are from bible §2.
  const DEFS = {};
  const CAST_IDS = [];
  const SPK = (o) => o;

  function C(id, def) { DEFS[id] = def; def.id = id; CAST_IDS.push(id); }

  // ---- 2.1 the player
  C('chinnu', {
    name: '{nick}', full: 'Chinnu (K. {full}), 11', color: '#f2c230', voice: 1.32, side: 'right', speed: 50, vehicle: 'cycle', vehicleColor: '#2f6a3a',
    look: { kind: 'kid', skin: '#b97a4f', hair: '#1a1412', shirt: '#3d6fb0', pants: '#8a7a55', shoulders: '#f4f0e8', walkman: true, cowlick: true },
    portrait: { age: 'kid', hairStyle: 'spiky', skin: '#b97a4f', shirt: '#3d6fb0', shoulderStripes: '#f4f0e8', walkman: true, bg: '#2a2034' },
    name2026: 'K. {full}', look2026: null, portrait2026: null, // filled from srikanth below (an old save or a script may still say 'chinnu' in 2026)
    variants: {
      camera: { look: { camera: true }, portrait: { camera: true } },
      school: { look: { shirt: '#f4f2ea', pants: '#24305a', shoulders: null, tieDot: '#24305a', walkman: true }, portrait: { shirt: '#f4f2ea', shoulderStripes: null, tie: '#1d2a5a', tieStripe: '#c03030', lanyard: '#c03030', walkman: false } },
    },
    lines: ['*Pakka!*', 'Copy, Agent Immu.'],
  });
  C('srikanth', {
    name: 'K. {full}', full: 'K. {full}, 34 (2026)', color: '#f2c230', voice: 1.0, side: 'right', speed: 45,
    look: { kind: 'man', skin: '#b97a4f', hair: '#2a1e18', shirt: '#7a8fa8', pants: '#6a6a70', specs: true, belly: true, cowlick: true },
    portrait: { age: 'adult', hairStyle: 'thin', skin: '#b97a4f', hair: '#2a1e18', shirt: '#7a8fa8', stripes: '#a8bcd0', checks: true, specs: 'thin', collar: 'v', bg: '#2a2638' },
    lines: ['The knees remember 2003. The rest of me doesn’t.'],
  });
  DEFS.chinnu.look2026 = Object.assign({}, DEFS.srikanth.look, { walkman: false, shoulders: null });
  DEFS.chinnu.portrait2026 = Object.assign({}, DEFS.srikanth.portrait, { walkman: false, shoulderStripes: null, bg: '#2a2638' });
  // ---- 2.2 Chinnu's family
  C('amma', {
    name: 'Amma', talkName: 'Mummy', full: 'Amma, “Mummy” (Padma), 38', color: '#d24d57', voice: 1.12, speed: 46, vehicle: null,
    look: { kind: 'aunty', skin: '#a0683f', hair: '#1a1412', saree: '#3b7d4f', border: '#7a1f2b', blouse: '#7a1f2b' },
    portrait: { kind: 'aunty', skin: '#a0683f', bindi: '#c0202a', flowers: true, earrings: '#d4a640', saree: '#3b7d4f', border: '#7a1f2b', blouse: '#7a1f2b' },
    look2026: { hair: '#5a5450', specs: true },
    portrait2026: { streak: '#d8d2c8', specs: 'thin', hair: '#3a3430' },
    variants: {
      night: { look: { kind: 'woman', shirt: '#9fb7d8', pants: '#9fb7d8', dupatta: '#e8e0d0', saree: null }, portrait: { kind: 'woman', hairStyle: 'braid', saree: null, shirt: '#9fb7d8', floral: '#e8f0ff', dupattaShoulder: '#e8e0d0', flowers: false } },
      chappal: { look: { prop: 'chappal' } },
      bonam: { look: { prop: 'pot', saree: '#d8402a', border: '#f2c230' }, portrait: { saree: '#d8402a', border: '#f2c230' } },
    },
    lines: ['Home before the street lights!', '*Intiki raa!* Food is getting cold.', '*Thinnava?* Come, eat first. Then roam.', 'Where is your Chitti? Take her also.'],
    lines2026: ['Thirty-four years old and still crumbs on the shirt.'],
  });
  C('nanna', {
    name: 'Nanna', full: 'Nanna (K. Sreenivas), 41', color: '#7aa6d8', voice: 0.8, speed: 45, vehicle: 'family_chetak', vehicleBase: 'chetak', vehicleColor: '#7d9ab0',
    look: { kind: 'man', skin: '#9a6040', hair: '#1a1412', shirt: '#a9c4e0', pants: '#5a5f66', camera: true, oiled: true },
    portrait: { kind: 'man', skin: '#9a6040', hairStyle: 'oiled', moustache: 'thick', shirt: '#a9c4e0', pens: 2, camera: true },
    look2026: { hair: '#b8b4ae', specs: true },
    portrait2026: { hair: '#b8b4ae', specs: 'thin', age: 'old', moustacheColor: '#c8c4bc' },
    lines: ['*Chuddam.*', '*Thoda left... smile please.*', 'Someone has to hold the camera.', 'Current came. Who is watching TV without me?'],
  });
  C('ammamma', {
    name: 'Ammamma', full: 'Ammamma (Kamala), 68', color: '#c9a227', voice: 1.02, speed: 30,
    look: { kind: 'saree', skin: '#8d5a3b', hair: '#e8e4dc', saree: '#efe6d2', border: '#c9a227', prop: 'clothbag', specs: true },
    portrait: { kind: 'saree', age: 'old', skin: '#8d5a3b', specs: 'round', specsChain: true, bindi: true, hair: '#e8e4dc', saree: '#efe6d2', border: '#c9a227', blouse: '#c9a227' },
    lines: ['In a queue even God waits, *kanna*.', 'Eat the bitter neem also, *kanna*. Without it the sweet doesn’t know it is sweet.', 'Fine flour, *kanna*. Not *rava*.', 'Sit, *kanna*. The swing is big enough for two.'],
  });
  C('chitti', {
    name: 'Chitti', full: 'Chitti (K. Lalitha), 6', color: '#e88aa8', voice: 1.62, speed: 40,
    look: { kind: 'kid', girl: true, skin: '#b97a4f', hair: '#1a1412', shirt: '#e88aa8', pants: '#e88aa8', ponytails: '#d8202a', size: 0.84, dots: '#f4f0e8', prop: 'wrapper' },
    portrait: { age: 'kid', hairStyle: 'ponytails', ribbon: '#d8202a', skin: '#b97a4f', shirt: '#e88aa8', floral: '#f4f0e8', earrings: '#d4a640', clips: '#58b8e8', collar: false },
    lines: ['*Mummy ki cheppesta!*', 'Annayya is outside AGAIN!', 'Give me a Mango Masti or I’m telling.', 'I saw. I SAW!'],
  });
  C('bunty', {
    name: 'Bunty-anna', full: 'Bunty-anna (B. Vamsi), 19', color: '#4a6fa5', voice: 1.0, speed: 48, vehicle: 'bunty_rx100', vehicleBase: 'rx100', vehicleColor: '#1c1c22',
    look: { kind: 'man', skin: '#b97a4f', hair: '#1a1412', shirt: '#4a6fa5', pants: '#2a3a5a', puff: true, specs: '#2a2a36', shoulders: '#f4f2ea' },
    portrait: { age: 'teen', hairStyle: 'puff', specs: 'aviator', skin: '#b97a4f', shirt: '#f4f2ea', jacket: '#4a6fa5', jacketKind: 'denim' },
    variants: { committee: { look: { badgeDot: '#f2c230' }, portrait: { badge: '#f2c230' } } },
    lines: ['*Tension nakko*, I’m here.', 'Word of the day: NOSTALGIA. Means “very old style”. Like my RX100.', 'OU canteen chai is the best chai in Asia. I have not been to Asia, but I’m sure.', 'Onsite, *mamu*. Everybody’s going onsite.'],
  });
  // ---- 2.3 Immu's family
  const IMRAN_LOOK = { kind: 'man', skin: '#c68b5e', hair: '#1a1412', shirt: '#24345a', pants: '#3a3a4a', cap: 'cricket', capColor: '#8a8a90', specs: true, beard: '#2a201a', prop: 'packet' };
  const IMRAN_PORTRAIT = { age: 'adult', hairStyle: 'short', skin: '#c68b5e', specs: 'taped', cap: 'cricket', capColor: '#8a8a90', beard: 'stubble', shirt: '#e8e0d0', jacket: '#24345a', jacketKind: 'windcheater' };
  C('immu', {
    name: 'Immu', full: 'Immu (Mohammed Imran), 11', color: '#2a8c82', voice: 1.3, speed: 50, vehicle: 'cycle', vehicleColor: '#b82a2a', vehicleLabel: 'IMMU',
    look: { kind: 'kid', skin: '#c68b5e', hair: '#1a1412', shirt: '#2f8a5a', stripes: '#1f6a42', pants: '#2c3550', specs: true, prop: 'notebook' },
    portrait: { age: 'kid', hairStyle: 'side', specs: 'taped', skin: '#c68b5e', shirt: '#2f8a5a', stripes: '#1f6a42', checks: true, pens: 1 },
    name2026: 'Imran', look2026: IMRAN_LOOK, portrait2026: IMRAN_PORTRAIT,
    variants: { raincoat: { look: { shirt: '#f2c230', stripes: null, hat: 'hood', hatColor: '#f2c230', pants: '#f4f0e8' }, portrait: { shirt: '#f2c230', stripes: null, checks: false, cap: 'hood', capColor: '#f2c230', collar: false, pens: 0 } } },
    lines: ['Agent Chinnu. Nothing to report. Just reporting. Over.', 'Ten months and eleven days, I said. Now it’s less. Don’t count.', 'Chai? Your treat. You have Eidi money. ...Oh. Not Eid yet. Your treat anyway.', '*Pakka.* Over and out.'],
    lines2026: ['Agent.', 'Chocolate? From America. Everyone expects it. I’m sorry.'],
  });
  C('imran', { name: 'Imran', full: 'Imran, 34 (2026)', color: '#2a8c82', voice: 0.98, speed: 45, look: IMRAN_LOOK, portrait: IMRAN_PORTRAIT, lines: ['Agent.', 'Abba says his knees remember the cellar stair.'] });
  C('abba', {
    name: 'Rasheed-saab', talkName: 'Rasheed-saab', full: 'Rasheed-saab (Abdul Rasheed), 40', color: '#3a7d6e', voice: 0.86, speed: 45,
    look: { kind: 'man', skin: '#c68b5e', hair: '#1a1412', shirt: '#dfe8f2', pants: '#4a4a52', beard: '#1a1412', specs: true, lanyardDot: '#2a5cb8' },
    portrait: { kind: 'man', skin: '#c68b5e', hairStyle: 'short', beard: 'trim', specs: 'thin', shirt: '#dfe8f2', lanyard: '#2a5cb8', idcard: true },
    look2026: { hair: '#8a8680', beard: '#b8b4ae' }, portrait2026: { beardColor: '#c8c4bc', hair: '#6a6662', age: 'old' },
    variants: { chandraat: { look: { hat: 'skull' }, portrait: { cap: 'skull', lanyard: null, idcard: false } } },
    lines: ['Gas station. Not petrol bunk.', 'Gas station. Gas station. ...Petrol bunk.', 'Five years ago this was rocks and goats. Now look. Glass.'],
  });
  C('ammi', {
    name: 'Ammi', talkName: 'Immu’s Ammi', full: 'Immu’s Ammi (Nusrat), 36', color: '#7a5aa8', voice: 1.16, speed: 46,
    look: { kind: 'woman', skin: '#c68b5e', hair: '#1a1412', shirt: '#d8c3e8', pants: '#d8c3e8', dupatta: '#5a3e8a', headCover: '#5a3e8a' },
    portrait: { kind: 'woman', skin: '#c68b5e', dupatta: '#5a3e8a', earrings: '#d4a640', shirt: '#d8c3e8', collar: 'v' },
    lines: ['*Kya karre*, you two?', 'Here, Numaish money. Don’t spend it on maps.', 'I teach maths. I can calculate where you’ll run.'],
  });
  C('nani', {
    name: 'Nani', talkName: 'Immu’s Nani', full: 'Immu’s Nani (Zubeida), 70', color: '#a88a5a', voice: 1.0, speed: 30,
    look: { kind: 'burqa', skin: '#b97a4f', prop: 'trunk' },
    portrait: { kind: 'burqa', burqa: true, age: 'old', specs: 'thick', dupatta: '#f4f2ea', skin: '#b97a4f' },
    lines: ['*Hai Allah*, still hot!', 'Don’t forget Hyderabad over there, Imran.'],
  });
  // ---- 2.4 the friends and the rival
  C('ayesha', {
    name: 'Ayesha', full: 'Ayesha “Bowling” Fatima, 11', color: '#d24d57', voice: 1.34, speed: 50, vehicle: 'ladiescycle', vehicleColor: '#8a2a4a',
    look: { kind: 'kid', girl: true, skin: '#a0683f', hair: '#1a1412', shirt: '#d24d57', pants: '#efe9dc', cap: 'cricket', capColor: '#1d4f91', plaits: '#d8202a', prop: 'ball' },
    portrait: { age: 'kid', hairStyle: 'plaits', ribbon: '#d8202a', skin: '#a0683f', cap: 'cricket', capColor: '#1d4f91', shirt: '#d24d57', collar: 'band' },
    look2026: { kind: 'woman', girl: false, plaits: null, cap: null, shirt: '#d24d57', pants: '#efe9dc', dupatta: '#1d4f91', size: 1, prop: null },
    portrait2026: { age: 'adult', hairStyle: 'braid', cap: null, dupattaShoulder: '#1d4f91', whistle: true, lanyard: '#1d4f91', collar: 'v' },
    lines: ['*Hau, ho jaata.*', 'Girls’ batch is badminton? Fine. I’ll bowl with a racket.', 'Lootna rules. Who catches, keeps.'],
    lines2026: ['Coaching. Girls’ team. Under-14. They call me “Coach Bowling”.'],
  });
  C('pasha', {
    name: 'Professor Pasha', talkName: 'Professor Pasha', full: 'Professor Pasha, ~45', color: '#c9b27a', voice: 0.74, speed: 46, vehicle: 'pasha_lambretta', vehicleBase: 'chetak', vehicleColor: '#e8c020',
    look: { kind: 'man', skin: '#b97a4f', hair: '#1a1412', shirt: '#c9b27a', pants: '#c9b27a', hat: 'pith', hatColor: '#e8dcc0', prop: 'antenna', belly: true },
    portrait: { kind: 'man', skin: '#b97a4f', moustache: 'huge', cap: 'pith', capColor: '#e8dcc0', shirt: '#c9b27a', pockets: true, collar: 'v' },
    lines: ['*Khazana Hunt*, every Sunday, Channel Seven, LIVE!', 'Silence! The Professor is detecting! Beep means *khazana!*', 'You have the face of a boy who knows a tunnel.'],
  });
  C('babloo', {
    name: 'Babloo', full: 'Babloo, 14 (Pasha’s nephew)', color: '#d27a3a', voice: 1.12, speed: 48,
    look: { kind: 'man', size: 0.92, skin: '#b97a4f', hair: '#1a1412', shirt: '#d24d57', pants: '#2a3a5a', puff: true, bag: '#2a2a2e' },
    portrait: { age: 'teen', hairStyle: 'curly', skin: '#b97a4f', shirt: '#d24d57', crew: true },
    lines: ['Beep means your battery, *mamu*.', 'Don’t buy. He drew it last night with my sketch pens.'],
  });
  // ---- 2.5 city and colony characters
  C('faramarz', {
    name: 'Faramarz uncle', full: 'Faramarz uncle, 58 (Café Noor-e-Iran)', color: '#b0703a', voice: 0.8, speed: 38,
    look: { kind: 'man', skin: '#d29a6a', hair: '#e8e4dc', shirt: '#7a2f35', pants: '#4a4648', hat: 'irani', specs: true, shoulders: '#f4f2ea' },
    portrait: { kind: 'man', age: 'old', skin: '#d29a6a', hair: '#e8e4dc', cap: 'irani', moustache: 'thick', moustacheColor: '#f4f2ea', specs: 'round', shirt: '#f4f2ea', jacket: '#7a2f35', jacketKind: 'cardigan' },
    look2026: { prop: 'stick', size: 0.97 }, portrait2026: { moustacheColor: '#ffffff', hair: '#f4f2ea' },
    lines: ['*Do chai, ek plate Osmania!*', 'Hyderabad has two kinds of truth, *beta*: what is, and what they say.', 'One chai, one hour? No. One chai, twenty minutes.', 'My father came from Yazd with one tin and one recipe.'],
    lines2026: ['You two are late. *Teis saal* late.', '*Gurthunda?*'],
  });
  C('pochaiah', {
    name: 'Havaldar Pochaiah', talkName: 'Pochaiah', full: 'Havaldar Pochaiah, 50 (RTC X Roads)', color: '#c0a04a', voice: 0.78, speed: 50, vehicle: 'pochaiah_luna', vehicleBase: 'luna', vehicleColor: '#b82a2a',
    look: { kind: 'man', skin: '#7a4a30', hair: '#1a1412', shirt: '#f4f2ea', pants: '#a89060', cap: 'police', belly: true },
    portrait: { kind: 'police', skin: '#7a4a30', moustache: 'thick', shirt: '#f4f2ea', whistle: true, lanyard: '#c03030', cap: 'police' },
    lines: ['*Ruko!* ...Oh, just walking? Walk, walk.', 'I have one quiet day a year. Not today.', '*Hallu chalao*. Even on a cycle.'],
  });
  C('yadagiri', {
    name: 'Yadagiri-anna', full: 'Yadagiri-anna, 45 (auto driver)', color: '#e0b020', voice: 0.9, speed: 46, vehicle: 'yadagiri_auto', vehicleBase: 'auto', vehicleLabel: 'YADAGIRI',
    look: { kind: 'man', skin: '#7a4a30', hair: '#1a1412', shirt: '#a08a5a', pants: '#a08a5a', towel: '#c03030', oiled: true },
    portrait: { kind: 'man', skin: '#7a4a30', hairStyle: 'oiled', moustache: 'thin', shirt: '#a08a5a', towel: '#c03030', pockets: true },
    lines: ['*Meter nakko, das upar.*', 'Any day you are lost, find my auto. YADAGIRI on the back.', 'Exact change, *babu*. Exact change is a blessing.'],
  });
  C('ramulu', {
    name: 'Ramulu', talkName: 'Ramulu-uncle', full: 'Ramulu, 47 (Hanuman Pindi Girni)', color: '#e8dfc8', voice: 0.9, speed: 45,
    look: { kind: 'uncle', skin: '#9a6040', hair: '#efe9dc', lungi: '#3a5a9a', flour: true },
    portrait: { kind: 'uncle', skin: '#9a6040', hair: '#efe9dc', hairStyle: 'cropped', brows: '#efe9dc', moustache: 'thick', moustacheColor: '#efe9dc', vest: true, age: 'adult', flourDust: true },
    variants: { pothuraju: { look: { kind: 'uncle', body: '#e8b828', lungi: '#c0202a', neem: true, flour: false, hair: '#1a1412' }, portrait: { paint: '#e8b828', vest: false, shirt: '#e8b828', collar: false, neem: true, hair: '#1a1412', brows: null, moustacheColor: '#1a1412', flourDust: false } } },
    lines: ['My hair isn’t white, *beta*. It’s *atta*.', '*Dabba* in the line, number coming.', 'Chilli day today. Stand back, you’ll sneeze.', 'Keep away from the belt, *baba*. The machine is hungry.'],
  });
  C('agarwal', {
    name: 'Agarwal-ji', full: 'Agarwal-ji (Gopal), 48 (Sri Lakshmi Kirana)', color: '#d89a3a', voice: 0.95, speed: 42,
    look: { kind: 'man', skin: '#c68b5e', hair: '#7a7570', shirt: '#efe6d0', pants: '#efe6d0', hat: 'gandhi', specs: true, prop: 'radio', belly: true },
    portrait: { kind: 'uncle', skin: '#c68b5e', cap: 'gandhi', specs: 'thick', shirt: '#efe6d0', collar: 'band', moustache: false },
    lines: ['*Aaj nakad, kal udhaar.*', 'No change. Take two toffees.', '*Khaate mein likh doon?* Tell your Nanna.', 'Mango Masti, fifty paise. For Chitti? Then two.'],
  });
  C('bahadur', {
    name: 'Bahadur', talkName: 'Bahadur', full: 'Bahadur, the Gurkha, 55 (night watchman)', color: '#7a8a4a', voice: 0.86, speed: 40,
    look: { kind: 'man', skin: '#d29a6a', hair: '#1a1412', shirt: '#8a7a4a', pants: '#4a4a3a', hat: 'dhaka', hatColor: '#1d1a1e', prop: 'stick' },
    portrait: { kind: 'man', skin: '#d29a6a', cap: 'dhaka', capColor: '#1d1a1e', moustache: 'thin', shirt: '#e8e0d0', jacket: '#8a7a4a', jacketKind: 'denim', whistle: true, lanyard: '#3a3a3a' },
    lines: ['*Kaun hai?* ...Arre, Chinnu baba.', 'I am only a whistle. But I am a LOUD whistle.', 'Chinnu baba! *Ghar jao!*'],
  });
  C('kite_chacha', {
    name: 'Patang Chacha', full: 'Patang Chacha, 66 (kite maker, Gulzar Houz)', color: '#c8642a', voice: 0.88, speed: 36,
    look: { kind: 'man', skin: '#a0683f', hair: '#e8e4dc', shirt: '#f4f2ea', pants: '#f4f2ea', hat: 'skull', beard: '#c8642a', longBeard: true, prop: 'charkhi' },
    portrait: { kind: 'man', age: 'old', skin: '#a0683f', beard: 'long', beardColor: '#c8642a', moustache: true, moustacheColor: '#c8642a', cap: 'skull', shirt: '#f4f2ea', collar: 'band' },
    lines: ['*Saddi mazboot*. Won’t snap in a *pech*.', 'Cotton only. Glass manja cuts fingers and birds.', '*Aao, mian.* Paper kites, bamboo spine.'],
  });
  C('ticket_thatha', {
    name: 'Ticket Thatha', full: 'Ticket Thatha (Venkat Rao), 66 (Koti bus stand)', color: '#c0503a', voice: 0.82, speed: 34,
    look: { kind: 'man', skin: '#8d5a3b', hair: '#e8e4dc', shirt: '#b8a67a', pants: '#6a5a4a', prop: 'satchel' },
    portrait: { kind: 'man', age: 'old', skin: '#8d5a3b', hair: '#e8e4dc', hairStyle: 'cropped', shirt: '#b8a67a', pockets: true, lanyard: '#6a3a1a', whistle: true },
    lines: ['*Right, right!*', 'Tickets are like memory: small, but they take you places.', 'Thirty-one years I punched tickets on these roads.'],
  });
  C('salim', {
    name: 'Salim-bhai', full: 'Salim-bhai, 30 (Café Gulistan)', color: '#3aa898', voice: 1.0, speed: 46,
    look: { kind: 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#f4f2ea', pants: '#4a4a4a', hat: 'skull', apron: '#2a8c82', prop: 'tray' },
    portrait: { kind: 'man', skin: '#a0683f', cap: 'skull', moustache: 'thin', shirt: '#f4f2ea', apron: '#2a8c82' },
    lines: ['*Do pauna*, table *teen*!', '*Paani-kam*? Piping hot, coming.', 'Dunk the biscuit, don’t drown it. Osmania is delicate.', 'Bun-maska finished, samosa is there.'],
  });
  C('vimala_maam', {
    name: 'Vimala Ma’am', full: 'Vimala Ma’am, 55 (class teacher, VI-B)', color: '#c02030', voice: 1.04, speed: 42,
    look: { kind: 'saree', skin: '#b97a4f', hair: '#9a9690', saree: '#d8c8a0', border: '#2a4a9a', specs: true },
    portrait: { kind: 'saree', skin: '#b97a4f', hair: '#8a8680', hairStyle: 'bun', specs: 'thin', saree: '#d8c8a0', border: '#2a4a9a', blouse: '#2a4a9a', earPen: '#c02020', flowers: false },
    lines: ['*Bus udti nahi. Sach likho.*', 'Diary on my table by Monday. With the truth in it.'],
  });
  C('cable_babji', {
    name: 'Cable Babji', full: 'Cable Babji, 33 (colony cable-wala)', color: '#6b8f3a', voice: 1.05, speed: 48,
    look: { kind: 'lungi', skin: '#9a6040', hair: '#1a1412', shirt: '#6b8f3a', lungi: '#3a4a7a', prop: 'cable', spiky: true },
    portrait: { kind: 'man', skin: '#9a6040', hairStyle: 'spiky', shirt: '#6b8f3a', coil: true, moustache: 'thin' },
    lines: ['*Thoda left... thoda right... AARA!*', 'Antenna fell again? The tower is that way.'],
  });
  C('photo_uncle', {
    name: 'Raj-uncle', full: 'Raj-uncle, 52 (Raj Colour Lab & Studio)', color: '#e08a3a', voice: 0.92, speed: 42,
    look: { kind: 'man', skin: '#b97a4f', hair: '#4a4440', shirt: '#d8c8a8', pants: '#5a5048' },
    portrait: { kind: 'man', skin: '#b97a4f', hair: '#3a3430', streak: '#a8a49e', hairStyle: 'side', moustache: true, shirt: '#d8c8a8', pens: 1 },
    lines: ['Ready day after tomorrow.', 'Sit straight, chin up, *thoda left*... smile please!', 'Don’t open the darkroom door! The photos will burn!'],
  });
  C('net_uncle', {
    name: 'Net-uncle', full: 'Net-uncle, 40 (Cyber Zone Browsing Centre)', color: '#7a6aa8', voice: 1.0, speed: 44,
    look: { kind: 'man', skin: '#c68b5e', hair: '#1a1412', shirt: '#5a4a7a', pants: '#3a3a4a', specs: true },
    portrait: { kind: 'man', skin: '#c68b5e', hairStyle: 'side', specs: 'thick', shirt: '#e8e0d0', jacket: '#5a4a7a', jacketKind: 'sweater' },
    lines: ['Timer is on.', 'No chat rooms. Emails, yes.', '*Kirrr-kshhh*... that’s the modem. It’s thinking.'],
  });
  C('flower_aunty', {
    name: 'Lakshmamma', talkName: 'Lakshmamma', full: 'Lakshmamma, the poolamma, 50', color: '#e07a2e', voice: 1.1, speed: 40,
    look: { kind: 'saree', skin: '#8d5a3b', hair: '#1a1412', saree: '#e07a2e', border: '#c9a227', prop: 'basket' },
    portrait: { kind: 'saree', skin: '#8d5a3b', saree: '#e07a2e', border: '#c9a227', nosestud: '#f0d870', flowers: true, earrings: '#d4a640' },
    lines: ['One *moora*, measured on my own arm. Never short.', '*Mallepoolu!* Two rupees a *moora*!', 'For your Amma’s braid? Jasmine. Always jasmine.'],
  });
  C('tiger', {
    name: 'Tiger', full: 'Tiger, 13 (Ashok Nagar captain)', color: '#c03030', voice: 1.2, speed: 52,
    look: { kind: 'kid', skin: '#7a4a30', hair: '#1a1412', shirt: '#e8e0d0', stripes: '#c03030', pants: '#3a3a4a', hat: 'backcap', hatColor: '#c03030', prop: 'bat', size: 1.08 },
    portrait: { age: 'teen', skin: '#7a4a30', cap: 'backcap', capColor: '#c03030', shirt: '#e8e0d0', stripes: '#c03030', hairStyle: 'short' },
    lines: ['*Doodh-bhaat* doesn’t count!', 'Last over! Only last over! ...Then one more.'],
  });
  C('caretaker', {
    name: 'Caretaker', talkName: 'the caretaker', full: 'Charminar caretaker, 60', color: '#a89a6a', voice: 0.84, speed: 38,
    look: { kind: 'man', skin: '#8d5a3b', hair: '#b8b4ae', shirt: '#a89a6a', pants: '#a89a6a', prop: 'keys' },
    portrait: { kind: 'man', age: 'old', skin: '#8d5a3b', hairStyle: 'cropped', moustache: 'thick', shirt: '#a89a6a', pockets: true, keys: true },
    lines: ['First gallery only. Upstairs is for prayer.', 'Walk, don’t run.'],
  });
  // ---- the colony's gate aunties (the Aunty Intelligence Network, bible §1.6 / §8.2)
  C('aunty', {
    name: 'Aunty', talkName: 'aunty', label: 'Ask aunty', full: 'Gate aunty (the network)', color: '#c03a8a', voice: 1.12, speed: 38,
    look: { kind: 'aunty', skin: '#a0683f', hair: '#1a1412', saree: '#c03a8a', border: '#f2c230' },
    portrait: { kind: 'aunty', skin: '#a0683f', saree: '#c03a8a', border: '#f2c230', earrings: '#d4a640' },
    lines: ['*Thinnava?* *Raa*, eat something.', 'The whole colony knows in ten minutes, *beta*.', '*Ayyo*, look at his knees.'],
  });
  C('aunty_2', {
    name: 'Phone aunty', talkName: 'aunty', label: 'Ask aunty', full: 'Gate aunty (has a phone)', color: '#2a9c8a', voice: 1.18, speed: 38,
    look: { kind: 'saree', skin: '#c68b5e', hair: '#1a1412', saree: '#2a8c82', border: '#efe9dc' },
    portrait: { kind: 'saree', skin: '#c68b5e', saree: '#2a8c82', border: '#efe9dc', specs: 'thin', earrings: '#d4a640' },
    lines: ['I’ll just phone Padma. Just to say hello.', '*Mee abbayi* EAMCET rank *entha?*'],
  });
  C('aunty_3', {
    name: 'Pickle aunty', talkName: 'aunty', label: 'Ask aunty', full: 'Gate aunty (makes pickle)', color: '#e8902a', voice: 1.06, speed: 38,
    look: { kind: 'aunty', skin: '#8d5a3b', hair: '#3a3430', saree: '#f08a24', border: '#7a1f2b' },
    portrait: { kind: 'aunty', skin: '#8d5a3b', saree: '#f08a24', border: '#7a1f2b', hair: '#3a3430', streak: '#c8c4bc', nosestud: '#f0d870' },
    lines: ['Kamala-garu’s grandson! Tell your Ammamma I said hello.', 'Mango pickle is drying on my terrace. Touch it and see.', '*Ayyo*, so thin! *Thinnava?*'],
  });

  // ---- walk-on speakers (bible §2.5 list): curated looks so every one has a face
  const W = (id, name, color, voice, look, portrait, extra) => { DEFS[id] = Object.assign({ id, name, color, voice, look, portrait, walkOn: true }, extra || {}); };
  W('loudspeaker', 'Loudspeaker', '#f2c230', 1.0, { kind: 'man' }, false, { style: 'radio' });
  W('radio', 'Deccan Vani', '#ff9a3a', 1.08, { kind: 'man' }, 'radio', { style: 'radio' });
  W('crowd', 'Crowd', '#e8c060', 0.95, { kind: 'man' }, 'crowd');
  W('chit', '', '#efe9dc', 1, { kind: 'man' }, false, { style: 'chit' });
  W('email', 'Email', '#8ab8d8', 1, { kind: 'man' }, false, { style: 'email' });
  W('bakery_man', 'Bakery counter', '#c8862a', 0.9, { kind: 'man', shirt: '#f4f2ea', pants: '#4a4a4a', hat: 'skull' }, { kind: 'man', shirt: '#f4f2ea', cap: 'skull', moustache: 'thick', apron: '#e8e0d0' });
  W('gokul_man', 'Gokul Chat', '#d8402a', 0.95, { kind: 'man', shirt: '#f4f2ea', pants: '#3a3a4a' }, { kind: 'man', skin: '#a0683f', shirt: '#f4f2ea', moustache: true, hairStyle: 'oiled', towel: '#d8402a' });
  W('paradise_man', 'Paradise counter', '#2a6a3a', 0.9, { kind: 'man', shirt: '#f4f2ea', pants: '#3a3a4a' }, { kind: 'man', skin: '#c68b5e', shirt: '#f4f2ea', moustache: 'thick', cap: 'skull' });
  W('bawarchi_man', 'Bawarchi counter', '#b22b2b', 0.9, { kind: 'man', shirt: '#f4f2ea', pants: '#3a3a4a' }, { kind: 'man', skin: '#9a6040', shirt: '#f4f2ea', beard: 'trim', cap: 'skull' });
  W('conductor', 'Conductor', '#b22b2b', 0.92, { kind: 'man', shirt: '#b8a070', pants: '#6a5a40', prop: 'satchel' }, { kind: 'man', skin: '#7a4a30', shirt: '#b8a070', pockets: true, moustache: 'thick', lanyard: '#6a3a1a', whistle: true });
  W('sentry', 'Sentry', '#6a5a3a', 0.85, { kind: 'man', shirt: '#b8a070', pants: '#b8a070', cap: 'police' }, { kind: 'police', skin: '#9a6040', whistle: true, lanyard: '#c03030' });
  W('mali', 'Mali-uncle', '#4f7a3a', 0.86, { kind: 'lungi', shirt: '#e8e0d0', lungi: '#3a6a3a', hat: 'gandhi' }, { kind: 'man', age: 'old', skin: '#7a4a30', towel: '#3a7a3a', moustache: 'thick', shirt: '#e8e0d0' });
  W('watchman', 'Watchman', '#6a6a4a', 0.86, { kind: 'man', shirt: '#8a7a4a', pants: '#4a4a3a', prop: 'stick' }, { kind: 'man', skin: '#8d5a3b', shirt: '#8a7a4a', pockets: true, moustache: 'thick', cap: 'police', capColor: '#4a4a3a' });
  W('guide', 'Guide', '#b98f5e', 0.94, { kind: 'man', shirt: '#e8dcc0', pants: '#5a5048', hat: 'cricket' }, { kind: 'man', skin: '#a0683f', shirt: '#e8dcc0', moustache: true, cap: 'cricket', capColor: '#b98f5e', lanyard: '#b98f5e', idcard: true });
  W('boatman', 'Boatman', '#2f7f86', 0.9, { kind: 'lungi', shirt: '#efe9dc', lungi: '#2a5cb8', towel: '#2a8c82' }, { kind: 'man', skin: '#7a4a30', vest: true, towel: '#2a8c82', moustache: true });
  W('farmer', 'Farmer aunty', '#3a8a3a', 1.08, { kind: 'saree', saree: '#3a8a3a', border: '#d8402a', skin: '#7a4a30' }, { kind: 'saree', skin: '#7a4a30', saree: '#3a8a3a', border: '#d8402a', nosestud: '#f0d870' });
  W('chemist', 'Chemist', '#3a9aa8', 0.96, { kind: 'man', shirt: '#f4f2ea', pants: '#3a3a4a', specs: true }, { kind: 'man', skin: '#c68b5e', shirt: '#f4f2ea', specs: 'thin', pens: 2 });
  W('painter', 'Bomma-uncle', '#e85a2a', 0.92, { kind: 'man', shirt: '#e8e0d0', stripes: '#e85a2a', pants: '#5a4a3a', hat: 'gandhi' }, { kind: 'man', skin: '#9a6040', shirt: '#e8e0d0', floral: '#e85a2a', moustache: 'thick', cap: 'gandhi', earPen: '#2a5cb8' });
  W('ticket_man', 'Ticket counter', '#7a3a8a', 0.92, { kind: 'man', shirt: '#e8e0d0', pants: '#3a3a4a' }, { kind: 'man', skin: '#a0683f', shirt: '#e8e0d0', specs: 'thick', moustache: true });
  W('black_ticket', 'Tout', '#5a5a6a', 0.98, { kind: 'man', shirt: '#2a2a3a', pants: '#3a3a4a', specs: '#1a1a22' }, { kind: 'man', skin: '#9a6040', shirt: '#2a2a3a', specs: 'aviator', moustache: 'thin', hairStyle: 'oiled' });
  W('narsimha', 'Narsimha', '#e0782a', 0.82, { kind: 'man', shirt: '#e0782a', pants: '#3a3a4a', towel: '#efe9dc' }, { kind: 'man', skin: '#7a4a30', shirt: '#e0782a', moustache: 'huge', towel: '#efe9dc' }, { vehicle: 'peacock_lorry', vehicleBase: 'lorry' });
  W('chappal_man', 'Chappal-wala', '#8a5a2a', 0.94, { kind: 'man', shirt: '#e8dcc0', pants: '#5a4a3a' }, { kind: 'man', skin: '#a0683f', shirt: '#e8dcc0', moustache: true, hairStyle: 'oiled' });
  W('bangle_man', 'Bangle-wala', '#2aa85a', 0.96, { kind: 'man', shirt: '#2a6a5a', pants: '#efe9dc', hat: 'skull' }, { kind: 'man', skin: '#c68b5e', shirt: '#2a6a5a', cap: 'skull', beard: 'trim' });
  W('attar_man', 'Attar-wala', '#a83a6a', 0.9, { kind: 'man', shirt: '#f4f2ea', pants: '#f4f2ea', hat: 'skull', beard: '#1a1412' }, { kind: 'man', age: 'old', skin: '#d29a6a', cap: 'skull', beard: 'long', shirt: '#f4f2ea', collar: 'band' });
  W('recording_man', 'Raag Recording', '#5a3a8a', 0.98, { kind: 'man', shirt: '#3a2a5a', pants: '#3a3a4a' }, { kind: 'man', skin: '#b97a4f', shirt: '#3a2a5a', hairStyle: 'puff', headphones: true });
  W('coconut_man', 'Coconut-wala', '#4f7a3a', 0.9, { kind: 'lungi', shirt: '#efe9dc', lungi: '#4f7a3a' }, { kind: 'man', skin: '#7a4a30', vest: true, towel: '#4f7a3a', moustache: 'thick' });
  W('dosa_man', 'Dosa bandi', '#e8a020', 0.94, { kind: 'lungi', shirt: '#efe9dc', lungi: '#7a3a3a' }, { kind: 'man', skin: '#8d5a3b', vest: true, towel: '#e8a020', moustache: true });
  W('stationery_man', 'Stationery uncle', '#2a5cb8', 0.96, { kind: 'man', shirt: '#e8e0d0', pants: '#4a4a4a', specs: true }, { kind: 'man', skin: '#c68b5e', shirt: '#e8e0d0', specs: 'round', pens: 3 });
  W('kirana_kid', 'Kirana boy', '#d89a3a', 1.3, { kind: 'kid', shirt: '#f2c230', pants: '#5a4a3a' }, { age: 'kid', skin: '#9a6040', shirt: '#f2c230' });
  W('papad_man', 'Papad-wala', '#e8c060', 0.94, { kind: 'man', shirt: '#e8c060', pants: '#4a4a4a' }, { kind: 'man', skin: '#a0683f', shirt: '#e8c060', moustache: 'thick', cap: 'gandhi' });
  W('bird_man', 'Bird-seller', '#6a8a9a', 0.9, { kind: 'man', shirt: '#9ab0b8', pants: '#4a4a4a', hat: 'skull' }, { kind: 'man', age: 'old', skin: '#9a6040', cap: 'skull', beard: 'trim', shirt: '#9ab0b8' });
  W('book_man', 'Book-wala', '#8a6a3a', 0.92, { kind: 'man', shirt: '#c8b89a', pants: '#4a4a4a', specs: true }, { kind: 'man', skin: '#8d5a3b', shirt: '#c8b89a', specs: 'thick', moustache: true });
  W('bakery_lady', 'Iyengar aunty', '#d8a040', 1.12, { kind: 'saree', saree: '#c86a2a', border: '#f2c230' }, { kind: 'saree', skin: '#b97a4f', saree: '#c86a2a', border: '#f2c230', apron: '#f4f0e8' });
  W('meat_man', 'Meat shop', '#a83a3a', 0.86, { kind: 'man', shirt: '#f4f2ea', pants: '#3a3a4a', hat: 'skull' }, { kind: 'man', skin: '#9a6040', cap: 'skull', apron: '#e8e0d0', moustache: 'thick' });
  W('uncle', 'Uncle', '#8a8680', 0.86, { kind: 'uncle', lungi: '#5a3a8a' }, { kind: 'uncle', skin: '#a0683f', specs: 'thick' });
  W('coach', 'Coach', '#2a6ab8', 0.9, { kind: 'man', shirt: '#2a4a8a', pants: '#2a4a8a', hat: 'cricket' }, { kind: 'man', skin: '#9a6040', cap: 'cricket', capColor: '#f4f2ea', shirt: '#2a4a8a', whistle: true, lanyard: '#f4f2ea', moustache: 'thick' });
  W('guard', 'Guard', '#6a5a3a', 0.86, { kind: 'man', shirt: '#8a7a5a', pants: '#8a7a5a', cap: 'police' }, { kind: 'man', skin: '#7a4a30', shirt: '#8a7a5a', cap: 'police', capColor: '#4a4a3a', moustache: 'thick', pockets: true });
  W('carol_aunty', 'Carol aunty', '#c03030', 1.14, { kind: 'woman', shirt: '#2a6a3a', pants: '#2a6a3a', dupatta: '#c03030' }, { kind: 'woman', skin: '#b97a4f', shirt: '#2a6a3a', hairStyle: 'curly', earrings: '#d4a640' });
  W('waiter', 'Waiter', '#2a8c82', 1.0, { kind: 'man', shirt: '#f4f2ea', pants: '#4a4a4a', hat: 'skull', prop: 'tray' }, { kind: 'man', skin: '#9a6040', cap: 'skull', shirt: '#f4f2ea', apron: '#2a8c82', moustache: true });
  W('banana_man', 'Banana-wala', '#e8c020', 0.94, { kind: 'lungi', shirt: '#efe9dc', lungi: '#3a8a3a' }, { kind: 'man', skin: '#7a4a30', vest: true, towel: '#e8c020', moustache: 'thick' });
  W('immu_tape', 'Immu (tape)', '#2a8c82', 1.3, DEFS.immu.look, Object.assign({}, DEFS.immu.portrait, { tape: true }), { style: 'tape' });
  W('imran_tape', 'Imran (tape)', '#2a8c82', 0.98, IMRAN_LOOK, Object.assign({}, IMRAN_PORTRAIT, { tape: true, tapeLabel: '#f4f0e8' }), { style: 'tape' });

  for (const id of ['kite_chacha', 'faramarz', 'bangle_man', 'attar_man', 'bird_man', 'chappal_man', 'papad_man']) if (DEFS[id]) DEFS[id].cityLocal = true;

  /* ================================================== special portraits (functions) */
  const PORTRAIT_FN = {
    radio(ctx, w, h, mood) { // a 2-in-1 radio-cassette with a glowing dial
      ctx.save(); ctx.setTransform(w / 48, 0, 0, h / 48, 0, 0); ctx.imageSmoothingEnabled = false;
      const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
      R(0, 0, 48, 48, '#2a1f30'); for (let y = 2; y < 48; y += 4) R(0, y, 48, 1, 'rgba(0,0,0,0.12)');
      R(23, 4, 1, 12, '#c8c8c8'); R(22, 3, 3, 1, '#e8e8e8');
      R(4, 14, 40, 26, '#1d1d22'); R(5, 15, 38, 24, '#3a3a44');
      for (const cx of [13, 35]) { ctx.fillStyle = '#141418'; ctx.beginPath(); ctx.arc(cx, 28, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#5a5a66'; ctx.beginPath(); ctx.arc(cx, 28, 2.5, 0, TAU); ctx.fill(); }
      R(18, 18, 12, 7, '#ffab40'); R(19, 19, 10, 5, '#ffd48a'); R(22, 19, 1, 5, '#c03030');
      R(18, 28, 12, 8, '#141418'); R(19, 29, 10, 4, '#e8e0d0'); R(21, 30, 2, 2, '#1d1d22'); R(25, 30, 2, 2, '#1d1d22');
      R(8, 41, 4, 2, '#1d1d22'); R(36, 41, 4, 2, '#1d1d22');
      if (mood === 'happy' || mood === 'laugh') { R(40, 6, 2, 2, '#fff3b0'); R(43, 9, 2, 2, '#fff3b0'); R(6, 8, 2, 2, '#fff3b0'); }
      ctx.restore();
    },
    crowd(ctx, w, h) { // heads and raised hands in a festival crowd
      ctx.save(); ctx.setTransform(w / 48, 0, 0, h / 48, 0, 0); ctx.imageSmoothingEnabled = false;
      const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
      R(0, 0, 48, 48, '#3a2a30');
      const skins = ['#8d5a3b', '#c68b5e', '#a0683f', '#7a4a30', '#d29a6a'], shirts = ['#d8402a', '#2a8c82', '#f2c230', '#efe9dc', '#7a3a8a', '#3a8a3a'];
      const rng = U.rng('crowd');
      for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
        const x = i * 9 - 4 + (row & 1) * 4 + rng.range(-1, 1), y = 12 + row * 12;
        R(x - 4, y + 5, 9, 12, rng.pick(shirts));
        ctx.fillStyle = rng.pick(skins); ctx.beginPath(); ctx.arc(x, y + 2, 3.4, 0, TAU); ctx.fill();
        R(x - 3, y - 2, 6, 2, '#1a1412');
        if (rng.chance(0.35)) { R(x + 3, y - 6, 1, 7, rng.pick(skins)); R(x + 2, y - 8, 3, 2, rng.pick(skins)); }
      }
      R(0, 0, 48, 1, 'rgba(0,0,0,0.3)'); R(0, 47, 48, 1, 'rgba(0,0,0,0.3)');
      ctx.restore();
    },
  };

  /* ================================================================ look resolution */
  const variantSet = {};          // explicit variants (id -> name | 'base')
  const lookCache = new Map();    // key -> look object
  function autoVariant(id) {
    const f = N.flags || {};
    if (id === 'immu' && (f.chand_raat || f.festival === 'chand_raat')) return 'raincoat';
    if (id === 'abba' && (f.chand_raat || f.festival === 'chand_raat')) return 'chandraat';
    if (id === 'ramulu' && (f.bonalu || f.festival === 'bonalu')) return 'pothuraju';
    return null;
  }
  function variantOf(id) {
    if (Object.prototype.hasOwnProperty.call(variantSet, id)) return variantSet[id] === 'base' ? null : variantSet[id];
    return autoVariant(id);
  }
  function resolve(id, which) { // which: 'look' | 'portrait'
    const def = DEFS[id];
    if (!def) return null;
    const y26 = is2026();
    const v = variantOf(id);
    const key = id + '|' + which + '|' + (y26 ? 26 : 3) + '|' + (v || '');
    let out = lookCache.get(key);
    if (out) return out;
    const base = def[which];
    if (base === false || typeof base === 'string') return null;
    out = Object.assign({}, base || {});
    if (y26 && def[which + '2026']) Object.assign(out, def[which + '2026']);
    const vv = v && def.variants && def.variants[v] && def.variants[v][which];
    if (vv) Object.assign(out, vv);
    for (const k in out) if (out[k] == null) delete out[k];
    if (which === 'look') out.cast = id;
    else { out._key = (v || '') + (y26 ? '26' : ''); if (!out.bg) out.bg = U.mix('#1d1622', def.color || '#f2c230', 0.36); }
    lookCache.set(key, out);
    return out;
  }
  function lookOf(id) { return resolve(id, 'look') || genericLook(id); }
  function portraitOf(id) { return resolve(id, 'portrait'); }
  function genericLook(id) {
    const k = 'gen|' + id;
    let l = lookCache.get(k);
    if (!l) { l = N.people.randomLook(U.rng('npc:' + id)); l.cast = id; lookCache.set(k, l); }
    return l;
  }

  /* ================================================================ dialogue speakers */
  function speakerSpec(id) {
    const def = DEFS[id];
    if (!def) return null;
    const spec = {
      name: def.name, color: def.color, voice: def.voice || 1, pitch: def.voice || 1, side: def.side || null, style: def.style || null,
      full: def.full || def.name,
    };
    if (def.name2026) spec.name2026 = def.name2026;
    if (def.portrait === false) spec.portrait = false;
    else if (typeof def.portrait === 'string' && PORTRAIT_FN[def.portrait]) spec.portrait = PORTRAIT_FN[def.portrait];
    else spec.look = () => portraitOf(id);
    return spec;
  }
  function registerSpeakers() {
    const D = N.dialogue;
    if (!D || !D.define) return 0;
    let n = 0;
    for (const id in DEFS) {
      const ex = D.speakers && D.speakers[id];
      if (ex && !ex._cast) continue; // story / another module defined this speaker itself: keep theirs
      D.define(id, Object.assign(speakerSpec(id), { _cast: true }));
      n++;
    }
    return n;
  }

  /* ================================================================ sprite extras */
  // Wrap the shared person painter: looks with `cast` get hats, beards, specs, hair styles and
  // props drawn on top (entities.js stays untouched). Same local units as N.people.draw.
  function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
  const OUT = 'rgba(25,15,20,0.6)';
  function stroke(ctx, w) { ctx.strokeStyle = OUT; ctx.lineWidth = w || 0.6; ctx.stroke(); }
  function castExtras(ctx, L, anim) {
    const hx = 0.35;
    const mv = U.clamp(anim && anim.speed != null ? anim.speed : 0, 0, 1);
    const stride = ((anim && anim.run) ? 3.3 : 2.3) * mv;
    const sw = Math.sin((anim && anim.phase) || 0) * stride;
    const hand = { x: -sw * 0.8 * 0.7 + 0.8, y: 3.7 };          // right hand (local +y)
    const skin = L.skin || '#a0683f', hair = L.hair || '#1a1412';
    // body / torso extras
    if (L.body) { // painted body (Pothuraju turmeric)
      ctx.fillStyle = L.body; ell(ctx, 0, 0, 2.6, 3.5); ctx.fill(); stroke(ctx);
      ctx.fillStyle = '#c0202a'; for (const p of [[0.8, -1.4], [0.8, 1.4], [-0.6, 0]]) { ell(ctx, p[0], p[1], 0.35, 0.35); ctx.fill(); }
    }
    if (L.flour) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, 0.6, -0.8, 1.2, 1.3); ctx.fill(); }
    if (L.belly) { ctx.fillStyle = U.shade(L.shirt || '#e8e0d0', 0.9); ell(ctx, 1.25, 0, 1.2, 2.1); ctx.fill(); }
    if (L.dots) { ctx.fillStyle = L.dots; for (const p of [[0.6, -1.6], [-0.6, 0.3], [0.7, 1.5], [-0.2, -2.4], [-0.3, 2.3]]) ctx.fillRect(p[0] - 0.25, p[1] - 0.25, 0.5, 0.5); }
    if (L.shoulders) { ctx.fillStyle = L.shoulders; for (const s of [-1, 1]) { ell(ctx, -0.1 - s * sw * 0.4, s * 3.0, 0.9, 0.45); ctx.fill(); } }
    if (L.apron) { ctx.fillStyle = L.apron; ell(ctx, 1.0, 0, 1.3, 2.5); ctx.fill(); }
    if (L.neem) { ctx.fillStyle = '#3a7a2a'; for (let a = 0; a < 8; a++) { const t = (a / 8) * TAU; ell(ctx, Math.cos(t) * 2.4, Math.sin(t) * 3.2, 0.6, 0.35); ctx.fill(); } }
    if (L.camera) {
      ctx.strokeStyle = '#141414'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(-1.2, -3.0); ctx.lineTo(1.6, 2.2); ctx.stroke();
      ctx.fillStyle = '#1d1d20'; ctx.fillRect(1.2, 1.2, 1.4, 1.8); ctx.fillStyle = '#5a6a7a'; ell(ctx, 2.3, 2.1, 0.45, 0.45); ctx.fill();
    }
    if (L.walkman) {
      ctx.strokeStyle = '#f4f0e8'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(0.6, -1.2); ctx.lineTo(1.9, 0.2); ctx.lineTo(0.6, 1.2); ctx.stroke();
      ctx.fillStyle = '#f2c230'; ctx.fillRect(1.6, -0.5, 1.1, 1.2); ctx.fillStyle = '#3a3020'; ctx.fillRect(1.9, -0.25, 0.5, 0.5);
    }
    if (L.towel) { ctx.fillStyle = L.towel; ctx.fillRect(-1.3, -4.1, 2.6, 1.5); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(-0.5, -4.1); ctx.lineTo(-0.5, -2.6); ctx.moveTo(0.5, -4.1); ctx.lineTo(0.5, -2.6); ctx.moveTo(-1.3, -3.35); ctx.lineTo(1.3, -3.35); ctx.stroke(); }
    if (L.tieDot) { ctx.fillStyle = L.tieDot; ctx.fillRect(1.6, -0.3, 0.9, 0.6); }
    if (L.badgeDot) { ctx.fillStyle = L.badgeDot; ell(ctx, 1.3, -1.3, 0.45, 0.45); ctx.fill(); }
    if (L.lanyardDot) { ctx.fillStyle = L.lanyardDot; ctx.fillRect(1.4, -0.35, 0.8, 0.7); }
    // head extras
    if (L.puff) { ctx.fillStyle = hair; ell(ctx, hx - 0.75, 0, 2.05, 2.35); ctx.fill(); stroke(ctx, 0.5); ctx.fillStyle = U.shade(hair, 1.25); ell(ctx, hx - 1.1, -0.6, 0.6, 0.5); ctx.fill(); }
    if (L.cowlick) { ctx.fillStyle = U.shade(hair, 1.35); ell(ctx, hx - 0.9, -0.55, 0.55, 0.4); ctx.fill(); ctx.fillStyle = hair; ell(ctx, hx - 1.35, -0.85, 0.5, 0.3); ctx.fill(); }
    if (L.oiled) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ell(ctx, hx - 0.8, -0.5, 0.7, 0.3); ctx.fill(); }
    if (L.spiky) { ctx.fillStyle = hair; for (const p of [[-1.6, -1.2], [-1.9, 0], [-1.6, 1.2], [-0.6, -1.7], [-0.6, 1.7]]) { ell(ctx, hx + p[0], p[1], 0.55, 0.55); ctx.fill(); } }
    if (L.ponytails) for (const s of [-1, 1]) { ctx.fillStyle = hair; ell(ctx, hx - 0.5, s * 2.5, 0.8, 1.0); ctx.fill(); stroke(ctx, 0.4); ctx.fillStyle = L.ponytails; ell(ctx, hx - 0.4, s * 1.85, 0.45, 0.45); ctx.fill(); }
    if (L.plaits) {
      ctx.strokeStyle = hair; ctx.lineWidth = 0.85;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx - 1.4, s * 1.0); ctx.quadraticCurveTo(hx - 3.2, s * 1.5, hx - 4.6 - sw * 0.2, s * 1.4); ctx.stroke(); ctx.fillStyle = L.plaits; ell(ctx, hx - 4.7 - sw * 0.2, s * 1.4, 0.45, 0.45); ctx.fill(); }
    }
    if (L.headCover) { ctx.fillStyle = L.headCover; ell(ctx, hx - 0.45, 0, 2.15, 2.2); ctx.fill(); stroke(ctx, 0.5); ctx.fillStyle = skin; ell(ctx, hx + 1.15, 0, 0.75, 1.15); ctx.fill(); }
    if (L.beard) { ctx.fillStyle = L.beard; if (L.longBeard) { ell(ctx, hx + 2.2, 0, 1.5, 1.25); ctx.fill(); stroke(ctx, 0.35); } else { ell(ctx, hx + 1.55, 0, 0.75, 1.3); ctx.fill(); } }
    if (L.specs) { ctx.strokeStyle = L.specs === true ? '#2a2420' : L.specs; ctx.lineWidth = 0.42; ctx.beginPath(); ctx.moveTo(hx + 1.75, -1.25); ctx.lineTo(hx + 1.75, 1.25); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(hx + 1.65, -0.9, 0.3, 0.3); ctx.fillRect(hx + 1.65, 0.6, 0.3, 0.3); }
    const hc = L.hatColor;
    switch (L.hat) {
      case 'pith': ctx.fillStyle = U.shade(hc || '#e8dcc0', 0.86); ell(ctx, hx - 0.1, 0, 3.0, 3.0); ctx.fill(); stroke(ctx, 0.45); ctx.fillStyle = hc || '#e8dcc0'; ell(ctx, hx - 0.2, 0, 1.9, 1.9); ctx.fill(); ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(hx - 0.2, 0, 1.95, 0, TAU); ctx.stroke(); break;
      case 'irani': ctx.fillStyle = hc || '#f4f2ea'; ell(ctx, hx - 0.25, 0, 1.75, 1.75); ctx.fill(); stroke(ctx, 0.4); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc(hx - 0.25, 0, 1.2, 0, TAU); ctx.stroke(); break;
      case 'skull': case 'topi': ctx.fillStyle = hc || '#f4f2ea'; ell(ctx, hx - 0.35, 0, 1.6, 1.6); ctx.fill(); stroke(ctx, 0.35); break;
      case 'gandhi': ctx.fillStyle = hc || '#f4f2ea'; ell(ctx, hx - 0.25, 0, 2.0, 1.15); ctx.fill(); stroke(ctx, 0.35); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(hx - 2.0, 0); ctx.lineTo(hx + 1.6, 0); ctx.stroke(); break;
      case 'dhaka': ctx.fillStyle = hc || '#1d1a1e'; ell(ctx, hx - 0.25, 0, 1.95, 1.3); ctx.fill(); ctx.fillStyle = '#c03030'; ctx.fillRect(hx + 0.4, -0.25, 0.5, 0.5); break;
      case 'backcap': ctx.fillStyle = hc || '#c03030'; ell(ctx, hx - 0.2, 0, 1.85, 1.85); ctx.fill(); stroke(ctx, 0.35); ctx.fillRect(hx - 3.0, -1.1, 1.3, 2.2); break;
      case 'hood': ctx.fillStyle = hc || '#f2c230'; ell(ctx, hx - 0.4, 0, 2.35, 2.35); ctx.fill(); stroke(ctx, 0.5); ctx.fillStyle = skin; ell(ctx, hx + 1.2, 0, 0.8, 1.15); ctx.fill(); break;
      default: break;
    }
    // props
    switch (L.prop) {
      case 'charkhi': ctx.fillStyle = '#b07a3a'; ell(ctx, hand.x + 0.8, hand.y + 0.6, 1.25, 1.25); ctx.fill(); stroke(ctx, 0.3); ctx.fillStyle = '#f4f0e8'; ell(ctx, hand.x + 0.8, hand.y + 0.6, 0.6, 0.6); ctx.fill(); break;
      case 'antenna': {
        ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(hand.x + 9, hand.y - 1.5);
        for (let k = 3; k <= 9; k += 1.5) { const px = hand.x + k, py = hand.y - k / 6; ctx.moveTo(px, py - 1.4); ctx.lineTo(px, py + 1.4); }
        ctx.stroke(); break;
      }
      case 'tray': ctx.fillStyle = '#b8bcc0'; ell(ctx, hand.x + 1.2, hand.y + 0.4, 2.1, 2.1); ctx.fill(); stroke(ctx, 0.35); ctx.fillStyle = '#c87a2a'; for (const p of [[0.6, -0.5], [1.7, 0.2], [0.9, 1.1]]) { ell(ctx, hand.x + p[0], hand.y + p[1], 0.45, 0.45); ctx.fill(); } break;
      case 'chappal': ctx.save(); ctx.translate(hand.x + 0.6, hand.y + 0.6); ctx.rotate(0.6); ctx.fillStyle = '#f4f0e8'; ell(ctx, 0, 0, 1.6, 0.7); ctx.fill(); stroke(ctx, 0.3); ctx.strokeStyle = '#2a5cb8'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(0.4, -0.6); ctx.lineTo(-0.3, 0); ctx.lineTo(0.4, 0.6); ctx.stroke(); ctx.restore(); break;
      case 'ball': ctx.fillStyle = '#d8e04a'; ell(ctx, hand.x + 0.4, hand.y + 0.3, 0.7, 0.7); ctx.fill(); break;
      case 'bat': ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(-0.25); ctx.fillStyle = '#d8b878'; ctx.fillRect(0.6, -0.6, 6.2, 1.2); ctx.fillStyle = '#3a2a2a'; ctx.fillRect(-0.6, -0.3, 1.4, 0.6); ctx.restore(); break;
      case 'stick': ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(hand.x + 4.5, hand.y + 1.6); ctx.stroke(); break;
      case 'keys': ctx.strokeStyle = '#c9c9c4'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(-0.4, 2.7, 0.7, 0, TAU); ctx.stroke(); ctx.fillStyle = '#c9a227'; ctx.fillRect(-0.3, 3.3, 0.4, 0.9); break;
      case 'trunk': ctx.fillStyle = '#6a7a8a'; ctx.fillRect(-1.6, 4.4, 4.4, 2.6); ctx.strokeStyle = OUT; ctx.lineWidth = 0.35; ctx.strokeRect(-1.6, 4.4, 4.4, 2.6); ctx.fillStyle = '#c9a227'; ctx.fillRect(0.3, 4.4, 0.6, 2.6); break;
      case 'pot': ctx.fillStyle = '#c9a227'; ell(ctx, hx - 0.2, 0, 1.9, 1.9); ctx.fill(); stroke(ctx, 0.4); ctx.fillStyle = '#3a7a2a'; for (let a = 0; a < 5; a++) { ell(ctx, hx - 0.2 + Math.cos(a * 1.25) * 0.8, Math.sin(a * 1.25) * 0.8, 0.45, 0.3); ctx.fill(); } break;
      case 'cable': ctx.strokeStyle = '#141414'; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.arc(-0.5, -3.4, 1.5, 0, TAU); ctx.stroke(); break;
      case 'radio': ctx.fillStyle = '#3a3a3a'; ctx.fillRect(hand.x, hand.y - 0.2, 1.8, 1.2); ctx.fillStyle = '#c9c9c4'; ctx.fillRect(hand.x + 1.2, hand.y + 0.1, 0.4, 0.4); break;
      case 'basket': ctx.fillStyle = '#b0864a'; ell(ctx, hand.x + 0.9, hand.y + 0.9, 1.8, 1.4); ctx.fill(); stroke(ctx, 0.3); ctx.fillStyle = '#f8f4ea'; for (let k = 0; k < 6; k++) ctx.fillRect(hand.x + 0.1 + (k % 3) * 0.6, hand.y + 0.4 + Math.floor(k / 3) * 0.7, 0.4, 0.4); break;
      case 'clothbag': ctx.fillStyle = '#b8a888'; ctx.fillRect(hand.x - 0.2, hand.y + 0.2, 1.7, 2.1); ctx.strokeStyle = OUT; ctx.lineWidth = 0.3; ctx.strokeRect(hand.x - 0.2, hand.y + 0.2, 1.7, 2.1); break;
      case 'satchel': ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(-1.0, -3.0); ctx.lineTo(0.2, 2.8); ctx.stroke(); ctx.fillStyle = '#6a3a1a'; ctx.fillRect(-0.9, 2.6, 2.2, 1.6); break;
      case 'notebook': ctx.fillStyle = '#c03030'; ctx.fillRect(hand.x, hand.y - 0.1, 1.0, 1.3); break;
      case 'wrapper': ctx.fillStyle = '#f2a020'; ctx.fillRect(hand.x, hand.y, 0.9, 0.6); break;
      case 'packet': ctx.fillStyle = '#6a3a1a'; ctx.fillRect(hand.x, hand.y - 0.2, 1.4, 1.0); ctx.fillStyle = '#e8c060'; ctx.fillRect(hand.x + 0.2, hand.y, 0.6, 0.3); break;
      case 'tin': ctx.fillStyle = '#c03030'; ctx.fillRect(hand.x, hand.y - 0.3, 1.8, 1.6); ctx.fillStyle = '#e8c060'; ctx.fillRect(hand.x, hand.y + 0.3, 1.8, 0.3); break;
      case 'parcel': ctx.fillStyle = '#c8a878'; ctx.fillRect(hand.x, hand.y - 0.2, 1.8, 1.4); ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(hand.x + 0.9, hand.y - 0.2); ctx.lineTo(hand.x + 0.9, hand.y + 1.2); ctx.stroke(); break;
      case 'torch': ctx.fillStyle = '#c03030'; ctx.fillRect(hand.x, hand.y - 0.3, 2.0, 0.6); ctx.fillStyle = '#fff3b0'; ctx.fillRect(hand.x + 2.0, hand.y - 0.35, 0.4, 0.7); break;
      default: break;
    }
  }
  function wrapPeople() {
    const P = N.people;
    if (!P || P._castWrapped) return;
    const base = P.draw;
    const wrapped = function (ctx, look, anim) {
      if (!look || !look.cast) return base(ctx, look, anim);
      const size = look.size || 1;
      ctx.save();
      if (size !== 1) ctx.scale(size, size);
      ctx.save();
      try { base(ctx, look, anim); } finally { ctx.restore(); }
      const k = look.kind || 'man';
      const sc = (P.SCALE || 1.5) * (k === 'kid' || k === 'student' ? 0.84 : k === 'uncle' ? 1.08 : 1);
      ctx.scale(sc, sc);
      try { castExtras(ctx, look, anim); } catch (e) { N.err('npcs.extras', e); }
      ctx.restore();
    };
    P.draw = wrapped;
    P._castWrapped = true;
    P.baseDraw = base;
  }
  wrapPeople();

  /* ================================================================ pathing */
  const PG = 8; // planner cell (world units)
  function cellFree(x, y) {
    const Wd = N.world;
    return Wd.isWalkable(x, y) && Wd.isWalkable(x + 3, y) && Wd.isWalkable(x - 3, y) && Wd.isWalkable(x, y + 3) && Wd.isWalkable(x, y - 3);
  }
  function lineClear(ax, ay, bx, by) {
    const Wd = N.world;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const px = (-dy / L) * 2.4, py = (dx / L) * 2.4;
    return !Wd.raycast(ax, ay, bx, by, 'walk').hit && !Wd.raycast(ax + px, ay + py, bx + px, by + py, 'walk').hit && !Wd.raycast(ax - px, ay - py, bx - px, by - py, 'walk').hit;
  }
  /* (audit round 2, X7) resting bodies: seated / standing solid actors the walk grid does not know (an Irani cafe's
   * bench row across the footpath, a crowd at a door). A stuck walker re-plans with them as soft obstacles: grid cells
   * inside one cost extra (passable when there is no other way), and the smoothing / look-ahead keep its legs clear. */
  function restingBodies(a, R) {
    const out = [];
    let list = null;
    try { list = N.entities.query(a.x, a.y, R); } catch (e) { return out; }
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e === a || !e.solid || e.noCollide || e.hidden || e.kind === 'vehicle' || e.vehicle || e.ignore === a || a.ignore === e) continue;
      if (Math.hypot(e.vx || 0, e.vy || 0) > 6) continue; // walking: gone by the time we get there
      out.push({ x: e.x, y: e.y, r: (e.r || 3) + (a.r || 3.4) - 0.4 });
    }
    return out;
  }
  /** the segment keeps clear of every body (a body the start is already inside only blocks moving towards it) */
  function bodiesClear(ax, ay, bx, by, B) {
    if (!B || !B.length) return true;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    for (let i = 0; i < B.length; i++) {
      const b = B[i], ox = b.x - ax, oy = b.y - ay;
      if (ox * ox + oy * oy < b.r * b.r) { if (ox * dx + oy * dy > 0) return false; continue; }
      let t = (ox * dx + oy * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = dx * t - ox, ey = dy * t - oy;
      if (ex * ex + ey * ey < b.r * b.r) return false;
    }
    return true;
  }
  function freeSpot(x, y, maxR) {
    const Wd = N.world;
    if (!Wd || !Wd.built) return { x, y };
    if (cellFree(x, y) && !Wd.collide(x, y, 3.4, 'walk').hit) return { x, y };
    for (let r = 4; r <= (maxR || 80); r += 4) {
      const n = Math.max(8, Math.round(r / 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (cellFree(px, py) && !Wd.collide(px, py, 3.4, 'walk').hit) return { x: px, y: py };
      }
    }
    return Wd.findFree(x, y, 'walk', 40) || null;
  }
  // binary heap of [f, idx]
  function heapPush(h, f, i) { h.push(f, i); let c = h.length / 2 - 1; while (c > 0) { const p = (c - 1) >> 1; if (h[p * 2] <= h[c * 2]) break; const tf = h[p * 2], ti = h[p * 2 + 1]; h[p * 2] = h[c * 2]; h[p * 2 + 1] = h[c * 2 + 1]; h[c * 2] = tf; h[c * 2 + 1] = ti; c = p; } }
  function heapPop(h) {
    const top = h[1], n = h.length / 2 - 1;
    const lf = h[n * 2], li = h[n * 2 + 1];
    h.length -= 2;
    if (n > 0) {
      h[0] = lf; h[1] = li;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1; let m = c;
        if (l < n && h[l * 2] < h[m * 2]) m = l;
        if (r < n && h[r * 2] < h[m * 2]) m = r;
        if (m === c) break;
        const tf = h[m * 2], ti = h[m * 2 + 1]; h[m * 2] = h[c * 2]; h[m * 2 + 1] = h[c * 2 + 1]; h[c * 2] = tf; h[c * 2 + 1] = ti; c = m;
      }
    }
    return top;
  }
  /** Grid A* over walkable ground (8 u cells, 3 u clearance). -> [{x, y}] smoothed | null
   *  opts {margin, max, partial, bodies: [{x, y, r}] soft obstacles (restingBodies)} */
  function gridPath(x0, y0, x1, y1, opts) {
    opts = opts || {};
    const margin = opts.margin || 220;
    const GW = Math.floor(N.WORLD_W / PG), GH = Math.floor(N.WORLD_H / PG);
    const gx0 = Math.max(0, Math.floor((Math.min(x0, x1) - margin) / PG)), gy0 = Math.max(0, Math.floor((Math.min(y0, y1) - margin) / PG));
    const gx1 = Math.min(GW - 1, Math.floor((Math.max(x0, x1) + margin) / PG)), gy1 = Math.min(GH - 1, Math.floor((Math.max(y0, y1) + margin) / PG));
    const w = gx1 - gx0 + 1, h = gy1 - gy0 + 1, n = w * h;
    if (w <= 0 || h <= 0 || n > 300000) return null;
    const state = new Uint8Array(n); // 0 unknown, 1 free, 2 blocked
    const isFree = (i) => { let s = state[i]; if (!s) { const cx = (gx0 + (i % w) + 0.5) * PG, cy = (gy0 + Math.floor(i / w) + 0.5) * PG; s = state[i] = cellFree(cx, cy) ? 1 : 2; } return s === 1; };
    const toIdx = (x, y) => { const i = Math.floor(x / PG) - gx0, j = Math.floor(y / PG) - gy0; return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i; };
    const B = opts.bodies && opts.bodies.length ? opts.bodies : null;
    const softS = B ? new Uint8Array(n) : null; // 0 unknown, 1 clear, 2 inside a body
    const softPen = (i) => {
      if (!B) return 0;
      let s2 = softS[i];
      if (!s2) {
        const cx = (gx0 + (i % w) + 0.5) * PG, cy = (gy0 + Math.floor(i / w) + 0.5) * PG;
        s2 = 1;
        for (let k = 0; k < B.length; k++) { const b = B[k], ex = cx - b.x, ey = cy - b.y; if (ex * ex + ey * ey < b.r * b.r) { s2 = 2; break; } }
        softS[i] = s2;
      }
      return s2 === 2 ? 10 : 0;
    };
    const nearFree = (idx) => {
      if (idx < 0) return -1;
      if (isFree(idx)) return idx;
      const ci = idx % w, cj = Math.floor(idx / w);
      for (let r = 1; r <= 4; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= w || j >= h) continue;
        if (isFree(j * w + i)) return j * w + i;
      }
      return -1;
    };
    const s = nearFree(toIdx(x0, y0)), g = nearFree(toIdx(x1, y1));
    if (s < 0 || g < 0) return null;
    const gi = g % w, gj = Math.floor(g / w);
    const cost = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = [];
    cost[s] = 0; heapPush(heap, 0, s);
    const D2 = Math.SQRT2;
    const hfn = (i) => { const dx = Math.abs(i % w - gi), dy = Math.abs(Math.floor(i / w) - gj); return (dx + dy) + (D2 - 2) * Math.min(dx, dy); };
    let best = s, bestH = hfn(s), expanded = 0;
    const maxN = opts.max || 70000;
    let found = false;
    while (heap.length) {
      const cur = heapPop(heap);
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === g) { found = true; break; }
      if (++expanded > maxN) break;
      const ci = cur % w, cj = Math.floor(cur / w), cc = cost[cur];
      const hh = hfn(cur); if (hh < bestH) { bestH = hh; best = cur; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        const ni = j * w + i;
        if (closed[ni] || !isFree(ni)) continue;
        if (di && dj && (!isFree(cj * w + i) || !isFree(j * w + ci))) continue; // no corner cutting
        const nc = cc + (di && dj ? D2 : 1) + softPen(ni);
        if (nc < cost[ni]) { cost[ni] = nc; parent[ni] = cur; heapPush(heap, nc + hfn(ni), ni); }
      }
    }
    const end = found ? g : (opts.partial ? best : -1);
    if (end < 0 || end === s && !found) return found ? [{ x: x1, y: y1 }] : null;
    const cells = [];
    for (let c = end; c >= 0; c = parent[c]) { cells.push(c); if (c === s) break; }
    cells.reverse();
    const pts = cells.map((c) => ({ x: (gx0 + (c % w) + 0.5) * PG, y: (gy0 + Math.floor(c / w) + 0.5) * PG }));
    pts[0] = { x: x0, y: y0 };
    if (found) pts.push({ x: x1, y: y1 });
    const out = smoothPath(pts, B);
    out.shift(); // drop the start point
    out.partial = !found;
    return out;
  }
  function smoothPath(pts, B) {
    if (pts.length <= 2) return pts.slice();
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 48);
      while (j > i + 1 && !(lineClear(pts[i].x, pts[i].y, pts[j].x, pts[j].y) && bodiesClear(pts[i].x, pts[i].y, pts[j].x, pts[j].y, B))) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }
  function roadAstar(a, b) {
    const R = N.world.roads, nodes = R.nodes, edges = R.edges;
    if (!a || !b) return null;
    if (a === b) return [a];
    const g = new Map(), from = new Map(), heap = [], closed = new Set();
    g.set(a.id, 0); heapPush(heap, 0, a.id);
    let guard = 0;
    while (heap.length && guard++ < 20000) {
      const id = heapPop(heap);
      if (closed.has(id)) continue;
      if (id === b.id) { const path = [nodes[id]]; let c = id; while (from.has(c)) { c = from.get(c); path.push(nodes[c]); } return path.reverse(); }
      closed.add(id);
      const n = nodes[id], gn = g.get(id);
      for (const eid of n.inc) {
        const e = edges[eid], to = e.a === id ? e.b : e.a;
        if (closed.has(to)) continue;
        const ng = gn + (e.len || Math.hypot(nodes[to].x - n.x, nodes[to].y - n.y));
        if (ng < (g.has(to) ? g.get(to) : Infinity)) { g.set(to, ng); from.set(to, id); heapPush(heap, ng + Math.hypot(nodes[to].x - b.x, nodes[to].y - b.y), to); }
      }
    }
    return null;
  }
  /** Route from (x0, y0) to (x1, y1) on foot: direct, grid A*, or road graph for long trips. */
  function planPath(x0, y0, x1, y1) {
    if (!N.world || !N.world.built) return [{ x: x1, y: y1 }];
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (d < 6 || lineClear(x0, y0, x1, y1)) return [{ x: x1, y: y1 }];
    if (d < 900) { const p = gridPath(x0, y0, x1, y1); if (p && p.length) return p; }
    const R = N.world.roads;
    if (R && R.nearestNode) {
      const a = R.nearestNode(x0, y0), b = R.nearestNode(x1, y1);
      const nodes = roadAstar(a, b);
      if (nodes && nodes.length) {
        const pts = nodes.map((nd) => ({ x: nd.x, y: nd.y }));
        pts.push({ x: x1, y: y1 });
        // collapse runs of nodes that are in a straight clear line
        const out = [];
        let anchor = { x: x0, y: y0 }, i = 0;
        while (i < pts.length) {
          let j = Math.min(pts.length - 1, i + 12);
          while (j > i && !lineClear(anchor.x, anchor.y, pts[j].x, pts[j].y)) j--;
          out.push(pts[j]); anchor = pts[j]; i = j + 1;
        }
        return out;
      }
    }
    const p = gridPath(x0, y0, x1, y1, { margin: 300, max: 160000, partial: true });
    return p && p.length ? p : [{ x: x1, y: y1 }];
  }

  /* ================================================================ targets */
  const placeAlias = { cafe_noor_e_iran: 'irani_cafe_19', irani_cafe_19: 'cafe_noor_e_iran' };
  function placeById(id) {
    const P = N.places || {};
    if (P[id]) return P[id];
    if (placeAlias[id] && P[placeAlias[id]]) return P[placeAlias[id]];
    return null;
  }
  function landmarkById(id) {
    const lms = (N.WORLD_DATA && N.WORLD_DATA.landmarks) || [];
    for (const l of lms) if (l.id === id) return l;
    return null;
  }
  function roofHeight(pl) {
    if (!pl) return 0;
    if (typeof pl.h === 'number' && (pl.roof || pl.kind === 'terrace' || pl.kind === 'roof')) return pl.h;
    if (pl.roof) { const lm = landmarkById(pl.roof); if (lm && lm.h) return lm.h; return 20; }
    if (pl.kind === 'terrace' || pl.kind === 'roof') return 20;
    try { if (N.world.roofAt) { const z = N.world.roofAt(pl.x, pl.y); if (z && z.h) return z.h; } } catch (e) { /* roof API not there yet */ }
    return 0;
  }
  /** -> {x, y, place?, roof?} | null */
  function posOf(t) {
    if (t == null) return null;
    if (Array.isArray(t)) {
      if (t.length === 2 && typeof t[0] === 'number') return { x: t[0], y: t[1] };
      for (const id of t) { const p = posOf(id); if (p) return p; }
      return null;
    }
    if (typeof t === 'string') {
      if (t === 'player') return N.player ? { x: N.player.x, y: N.player.y, entity: N.player } : null;
      const pl = placeById(t);
      if (pl) return { x: pl.x, y: pl.y, place: pl };
      const a = registry.get(t);
      if (a && a.alive) return { x: a.x, y: a.y, entity: a };
      const lm = landmarkById(t);
      if (lm) return { x: lm.x, y: lm.y + (lm.d || 0) / 2 + 14 };
      return null;
    }
    if (typeof t === 'function') return posOf(t());
    if (t.alive === false) return null;
    if (typeof t.x === 'number' && typeof t.y === 'number') return { x: t.x, y: t.y, entity: t.kind ? t : null };
    return null;
  }

  /* ================================================================ the actor */
  const registry = new Map();      // key -> NPC
  let lastSpeaker = null;
  const WALK = 45;

  class NPC extends N.Actor {
    constructor(key, id, x, y, opts) {
      super({ kind: 'npc', x, y, r: 3.4, mass: 2, solid: true });
      this.key = key; this.npcId = id; this.isNpc = true;
      this.angle = opts.angle != null ? opts.angle : Math.PI / 2;
      this.baseAngle = this.angle;
      this.idle = opts.idle || 'stand';
      this.homeX = x; this.homeY = y; this.wanderR = opts.r || 40;
      this.anim = { phase: Math.random() * 3, speed: 0, run: false };
      this.walk = null; this.followSt = null; this.drive = null;
      this.lookTarget = null; this.emoteSt = null;
      this.talk = opts.talk; this.label = opts.label || null;
      this.owner = opts.owner || 'story';
      this.roofH = opts.roofH || 0;
      this.bench = !!opts.bench;
      this.wanderT = 1 + Math.random() * 3; this.wanderGoal = null;
      this.barkT = 4 + Math.random() * 6;
      this.talking = false; this.knockT = 0;
      this.stats = { replans: 0, unsticks: 0, hops: 0, dist: 0 };
      this._lookOverride = null;
      this.barkH = 15;
      if (this.roofH) { this.noWorld = true; this.fixed = true; this.solid = false; }
      const self = this;
      this._paint = (ctx) => drawSelf(ctx, self);
      this._spriteFn = () => N.draw.sprite(self.x, self.y, self.angle, 8 + self.roofH, self._paint);
      this._shadowFn = () => N.draw.shadow(self.x, self.y, 7, 9, self.angle, 1.5);
      this._skyFn = (ctx) => drawOverhead(ctx, self);
    }
    /** called by N.world.roofs when this actor stands on a roof (h = floor height) */
    roofDraw(h) { this.drawH = h; N.draw.sprite(this.x, this.y, this.angle, h + 8, this._paint); }
    get look() { return this._lookOverride || lookOf(this.npcId); }
    set look(v) { this._lookOverride = v || null; }
    get name() { return displayName(this.npcId); }
    despawn() { despawn(this); }
    update(dt) { try { updateNpc(this, dt); } catch (e) { N.err('npc.update:' + this.key, e); } }
    draw() {
      if (this.vehicle || this.hidden) return;
      const R = N.render;
      if (this.roofH) R.queue('sky', -5, this._spriteFn);
      else { R.queue('shadow', 0, this._shadowFn); R.queue('actors', this.y, this._spriteFn); }
      if (this.emoteSt || isTalkFocus(this)) R.queue('sky', 1, this._skyFn);
    }
  }
  function drawSelf(ctx, a) {
    if (a.idle === 'sit' && a.bench && !a.walk && !a.followSt) {
      ctx.fillStyle = '#a8a49c'; ctx.fillRect(-4.8, -6.5, 4.2, 13);
      ctx.fillStyle = '#8a867e'; ctx.fillRect(-4.8, -6.5, 1.1, 13);
      ctx.strokeStyle = 'rgba(25,15,20,0.5)'; ctx.lineWidth = 0.5; ctx.strokeRect(-4.8, -6.5, 4.2, 13);
    }
    N.people.draw(ctx, a.look, a.anim);
  }

  function displayName(id) {
    const def = DEFS[id];
    let n = def ? (is2026() && def.name2026) || def.name : String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (N.dialogue && N.dialogue.filter) n = N.dialogue.filter(n);
    return n;
  }
  function talkLabel(a) {
    if (a.label) return typeof a.label === 'function' ? a.label(a) : a.label;
    const def = DEFS[a.npcId];
    if (def && def.label) return def.label;
    let n = def && def.talkName ? def.talkName : displayName(a.npcId);
    if (N.dialogue && N.dialogue.filter) n = N.dialogue.filter(n);
    return 'Talk to ' + n;
  }

  /* ---------------------------------------------------------------- movement */
  function speedOf(a, run) {
    const def = DEFS[a.npcId] || {};
    let sp = run ? Math.max(78, (def.speed || WALK) * 1.75) : def.speed || WALK;
    if (a.walk && a.walk.speed) sp = a.walk.speed;
    try { if (N.respect && N.respect.at && N.respect.at(a.x, a.y)) sp = Math.min(sp, def.speed || WALK); } catch (e) { /* stub */ }
    return sp;
  }
  function moveToward(a, tx, ty, speed, dt, arriveR) {
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    let vx = 0, vy = 0;
    if (d > (arriveR || 1.5)) { const s = Math.min(speed, d / Math.max(dt, 1e-3) * 0.9); vx = (dx / d) * s; vy = (dy / d) * s; }
    const k = 1 - Math.exp(-dt * 10);
    a.vx += (vx - a.vx) * k; a.vy += (vy - a.vy) * k;
    return d;
  }
  function integrate(a, dt) {
    if (a.roofH || a.noWorld) { a.x += a.vx * dt; a.y += a.vy * dt; return; }
    const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
    const c = N.world.collide(nx, ny, a.r, 'walk');
    if (c.bad) { a.vx = a.vy = 0; return; }
    if (c.hit) { const dot = a.vx * c.nx + a.vy * c.ny; if (dot < 0) { a.vx -= dot * c.nx; a.vy -= dot * c.ny; } }
    const moved = Math.hypot(c.x - a.x, c.y - a.y);
    a.x = c.x; a.y = c.y;
    a.stats.dist += moved;
    if (!isFinite(a.x) || !isFinite(a.y)) { a.x = a.homeX; a.y = a.homeY; a.vx = a.vy = 0; }
  }
  function turnTo(a, ang, dt, rate) { a.angle += U.angleDiff(a.angle, ang) * Math.min(1, dt * (rate || 10)); }

  function updateNpc(a, dt) {
    // riding: the vehicle moves us
    if (a.vehicle) {
      const v = a.vehicle;
      if (!v.alive) { a.vehicle = null; a.noCollide = false; return; }
      a.x = v.x; a.y = v.y; a.angle = v.angle; a.vx = v.vx; a.vy = v.vy;
      if (a.followSt) followRide(a, dt);
      tickEmote(a, dt);
      return;
    }
    if (a.knockT > 0) { // a vehicle shoved us
      a.knockT -= dt; a.vx *= Math.exp(-dt * 4); a.vy *= Math.exp(-dt * 4);
      integrate(a, dt); animate(a, dt); tickEmote(a, dt); return;
    }
    const mode = N.state.mode;
    let busy = false;
    if (a.talking) { a.vx *= 0.7; a.vy *= 0.7; faceToward(a, N.player, dt); busy = true; }
    else if (a.walk) busy = stepWalk(a, dt);
    else if (a.followSt) busy = stepFollow(a, dt);
    if (!busy && !a.walk) idleStep(a, dt, mode);
    integrate(a, dt);
    animate(a, dt);
    tickEmote(a, dt);
    ambientBark(a, dt);
  }
  function animate(a, dt) {
    const sp = Math.hypot(a.vx, a.vy);
    if (sp > 3) { turnTo(a, Math.atan2(a.vy, a.vx), dt, 12); a.anim.speed = Math.min(1, sp / WALK); a.anim.run = sp > 62; a.anim.phase += sp * dt * (a.anim.run ? 0.2 : 0.26); }
    else if (a.idle === 'work' && !a.walk && !a.followSt && !a.talking) { a.anim.speed = 0.18; a.anim.run = false; a.anim.phase += dt * 5; }
    else { a.anim.speed = 0; a.anim.run = false; a.anim.phase *= 0.85; }
  }
  function faceToward(a, t, dt) { if (!t) return; const ang = Math.atan2(t.y - a.y, t.x - a.x); if (isFinite(ang)) turnTo(a, ang, dt, 8); }

  function idleStep(a, dt, mode) {
    const p = N.player;
    const near = p && Math.hypot(p.x - a.x, p.y - a.y) < 52;
    if (a.idle === 'wander' && mode === 'play') {
      a.wanderT -= dt;
      if (a.wanderGoal) {
        const d = moveToward(a, a.wanderGoal.x, a.wanderGoal.y, (DEFS[a.npcId] || {}).speed * 0.55 || 25, dt, 3);
        a.wanderStuck = (a.wanderStuck || 0) + dt;
        if (d < 4 || a.wanderStuck > 6) { a.wanderGoal = null; a.wanderT = 2 + Math.random() * 4; }
        return;
      }
      a.vx *= 0.8; a.vy *= 0.8;
      if (a.wanderT <= 0 && !near) {
        for (let k = 0; k < 6; k++) {
          const ang = Math.random() * TAU, r = Math.random() * a.wanderR;
          const gx = a.homeX + Math.cos(ang) * r, gy = a.homeY + Math.sin(ang) * r;
          if (cellFree(gx, gy) && lineClear(a.x, a.y, gx, gy)) { a.wanderGoal = { x: gx, y: gy }; a.wanderStuck = 0; break; }
        }
        a.wanderT = 2 + Math.random() * 3;
      }
    } else { a.vx *= 0.8; a.vy *= 0.8; }
    // look at: explicit target, else the player when close, else back to the resting angle
    const lt = a.lookTarget ? posOf(a.lookTarget) : null;
    if (lt) faceToward(a, lt, dt);
    else if (near && a.idle !== 'sit') faceToward(a, p, dt);
    else if (near && a.idle === 'sit') { const ang = Math.atan2(p.y - a.y, p.x - a.x); const d = U.clamp(U.angleDiff(a.baseAngle, ang), -1, 1); turnTo(a, a.baseAngle + d, dt, 6); }
    else if (!a.wanderGoal) turnTo(a, a.baseAngle, dt, 2);
  }

  /* ---------------------------------------------------------------- walkTo */
  function stepWalk(a, dt) {
    const w = a.walk;
    w.t += dt;
    if (w.timeout && w.t > w.timeout) { finishWalk(a, false); return false; }
    // moving targets (entities, npc keys): re-aim every second
    w.retarget -= dt;
    if (w.retarget <= 0 && w.dynamic) {
      w.retarget = 1;
      const p = posOf(w.target);
      if (p && Math.hypot(p.x - w.gx, p.y - w.gy) > 24) { w.gx = p.x; w.gy = p.y; w.path = planPath(a.x, a.y, w.gx, w.gy); w.i = 0; a.stats.replans++; }
    }
    const dFinal = Math.hypot(w.gx - a.x, w.gy - a.y);
    if (dFinal <= w.r) { finishWalk(a, true); return false; }
    if (!w.path || w.i >= w.path.length) { w.path = planPath(a.x, a.y, w.gx, w.gy); w.i = 0; a.stats.replans++; }
    // look-ahead: skip to a later waypoint when it is already in sight
    w.ahead -= dt;
    if (w.ahead <= 0) {
      w.ahead = 0.3;
      const B = w.bodies && w.t < w.bodiesT ? w.bodies : null;
      for (let j = Math.min(w.path.length - 1, w.i + 4); j > w.i; j--) if (lineClear(a.x, a.y, w.path[j].x, w.path[j].y) && bodiesClear(a.x, a.y, w.path[j].x, w.path[j].y, B)) { w.i = j; break; }
    }
    let wp = w.path[w.i];
    if (w.side && w.side.t > 0) { w.side.t -= dt; wp = w.side; }
    const d = moveToward(a, wp.x, wp.y, speedOf(a, w.run), dt, 0.5);
    if (wp !== w.side && d < 6 && w.i < w.path.length - 1) w.i++;
    // stuck detection: progress towards the current waypoint
    w.chk -= dt;
    if (w.chk <= 0) {
      w.chk = 1.0;
      const prog = (w.lastD == null ? Infinity : w.lastD) - dFinal;
      const movedSince = Math.hypot(a.x - w.lx, a.y - w.ly);
      w.lastD = dFinal; w.lx = a.x; w.ly = a.y;
      if (prog < 3 && movedSince < 6 && !(N.state.mode !== 'play' && N.state.mode !== 'cutscene' && N.state.mode !== 'dialogue')) {
        w.stuck++;
        unstick(a, w);
      } else if (prog > 3) w.stuck = Math.max(0, w.stuck - 1);
    }
    return true;
  }
  function unstick(a, w) {
    a.stats.unsticks++;
    const wp = w.path && w.path[Math.min(w.i, w.path.length - 1)] || { x: w.gx, y: w.gy };
    const visible = N.render && N.render.inView && (N.render.inView(a.x, a.y, 40) || N.render.inView(wp.x, wp.y, 40));
    if (w.stuck === 1) {
      if (bodyDetour(a, w)) return;
      const p = gridPath(a.x, a.y, wp.x, wp.y, { partial: true }); if (p && p.length) { w.path.splice(w.i, 1, ...p, wp); } a.stats.replans++; return;
    }
    if (w.stuck === 2) { const ang = Math.atan2(wp.y - a.y, wp.x - a.x) + (Math.random() < 0.5 ? 1.6 : -1.6); w.side = { x: a.x + Math.cos(ang) * 14, y: a.y + Math.sin(ang) * 14, t: 0.7 }; return; }
    if (w.stuck === 3) { if (!bodyDetour(a, w)) { w.path = planPath(a.x, a.y, w.gx, w.gy); w.i = 0; a.stats.replans++; } if (!visible) hopTo(a, wp); return; }
    if (!visible || w.stuck >= 6) { hopTo(a, wp); w.stuck = 2; }
  }
  /** (audit round 2, X7) blocked by people (a bench row across the footpath, a crowd at a door): re-plan around them
   *  (restingBodies as soft obstacles) to the first point of the route past them (or the goal); a walker wedged
   *  against one first steps to the free spot nearby that best opens the way. -> true when a detour was set */
  function bodyDetour(a, w) {
    const B = restingBodies(a, 90);
    if (!B.length || !w.path || !w.path.length) return false;
    let j = Math.min(w.i, w.path.length - 1);
    const inB = (q) => B.some((b) => Math.hypot(q.x - b.x, q.y - b.y) < b.r);
    while (j < w.path.length - 1 && (Math.hypot(w.path[j].x - a.x, w.path[j].y - a.y) < 24 || inB(w.path[j]))) j++;
    const tg = w.path[j] || { x: w.gx, y: w.gy };
    const p = gridPath(a.x, a.y, tg.x, tg.y, { partial: true, bodies: B, margin: 120 });
    if (!p || !p.length) return false;
    if (p.partial) p.push(tg);
    if (!bodiesClear(a.x, a.y, p[0].x, p[0].y, B)) {
      let best = null, bs = Infinity;
      for (let k = 0; k < 16; k++) for (const r of [8, 13]) {
        const an = (k / 16) * TAU, x = a.x + Math.cos(an) * r, y = a.y + Math.sin(an) * r, q = { x, y };
        if (!cellFree(x, y) || inB(q) || !lineClear(a.x, a.y, x, y) || !bodiesClear(a.x, a.y, x, y, B)) continue;
        const sc = Math.hypot(p[0].x - x, p[0].y - y) + (bodiesClear(x, y, p[0].x, p[0].y, B) ? 0 : 40);
        if (sc < bs) { bs = sc; best = q; }
      }
      if (best) p.unshift(best);
    }
    w.path.splice(w.i, j - w.i + 1, ...p);
    w.bodies = B; w.bodiesT = w.t + 20; a.stats.replans++;
    return true;
  }
  function hopTo(a, p) {
    const f = freeSpot(p.x, p.y, 60);
    if (f) { a.x = f.x; a.y = f.y; a.vx = a.vy = 0; a.stats.hops++; }
  }
  function finishWalk(a, ok) {
    const w = a.walk;
    if (!w) return;
    a.walk = null;
    a.vx *= 0.3; a.vy *= 0.3;
    if (ok) {
      a.homeX = a.x; a.homeY = a.y;
      if (w.face != null) { const t = typeof w.face === 'number' ? null : posOf(w.face); a.baseAngle = t ? Math.atan2(t.y - a.y, t.x - a.x) : w.face; a.angle = a.baseAngle; }
      else a.baseAngle = a.angle;
      N.emit('npc:arrive', { key: a.key, id: a.npcId });
    }
    settle(w, ok);
  }
  function settle(job, ok) {
    if (job.done) return;
    job.done = true;
    const M = N.missions;
    if (job.run && M && M.active !== job.run && M.MissionAbort) { job.reject(new M.MissionAbort('abort', 'mission ended')); return; }
    job.resolve(!!ok);
  }
  function makeJob(extra) {
    const job = Object.assign({ done: false }, extra || {});
    const p = new Promise((res, rej) => { job.resolve = res; job.reject = rej; });
    p.catch(() => {});
    job.promise = p;
    job.run = N.missions && N.missions.active || null;
    if (job.run) pendingJobs.add(job);
    return job;
  }
  const pendingJobs = new Set();
  function abortJobsFor(run) {
    for (const j of Array.from(pendingJobs)) {
      if (j.done) { pendingJobs.delete(j); continue; }
      if (j.run === run || !run) {
        pendingJobs.delete(j);
        // stop the actor that owns it
        for (const a of registry.values()) { if (a.walk === j) a.walk = null; if (a.drive === j) { a.drive = null; if (a.vehicle) a.vehicle.controller = brakeCtl; } }
        settle(j, false);
      }
    }
  }

  /* ---------------------------------------------------------------- follow */
  function followTarget(a, L, f) {
    const lv = L.vehicle || L;
    const sp = Math.hypot(lv.vx || 0, lv.vy || 0);
    const ang = sp > 8 ? Math.atan2(lv.vy, lv.vx) : (lv.angle || 0);
    const back = f.dist + (L.vehicle ? 10 : 0);
    const side = f.side === 'left' ? -1 : f.side === 'right' ? 1 : 0;
    const lat = side * 9;
    return { x: lv.x - Math.cos(ang) * back - Math.sin(ang) * lat, y: lv.y - Math.sin(ang) * back + Math.cos(ang) * lat, sp, ang };
  }
  function stepFollow(a, dt) {
    const f = a.followSt;
    const L = f.leader;
    if (!L || L.alive === false) { a.followSt = null; return false; }
    // the leader rides: mount our own vehicle if allowed
    if (L.vehicle && f.ride && !a.vehicle) { if (mountFor(a, f)) return true; }
    const t = followTarget(a, L, f);
    const dl = Math.hypot(L.x - a.x, L.y - a.y);
    const dt2 = Math.hypot(t.x - a.x, t.y - a.y);
    // far behind and nobody sees: catch up
    const R = N.render;
    if (dl > f.catchUp && R && !R.inView(a.x, a.y, 30)) {
      const sp = freeSpot(t.x, t.y, 60);
      if (sp && !R.inView(sp.x, sp.y, 10)) { a.x = sp.x; a.y = sp.y; a.vx = a.vy = 0; a.stats.hops++; f.path = null; }
      else if (sp && dl > f.catchUp * 2) { a.x = sp.x; a.y = sp.y; a.stats.hops++; f.path = null; }
    }
    if (dt2 < 5 && dl < f.dist + 14) { // in place: idle beside the leader
      a.vx *= 0.75; a.vy *= 0.75;
      if (t.sp < 5) faceToward(a, L, dt);
      f.stuck = 0;
      return true;
    }
    // speed: walk when close, run when falling behind (cap at the leader's pace + a bit)
    let speed = U.clamp(dt2 * 2.4, 20, 95);
    const lvSp = t.sp;
    if (dt2 < 30) speed = Math.max(Math.min(speed, lvSp + 12), Math.min(45, speed));
    try { if (N.respect && N.respect.at && N.respect.at(a.x, a.y)) speed = Math.min(speed, 45); } catch (e) { /* stub */ }
    // route: direct when clear, otherwise a short grid path (re-planned as the leader moves)
    f.replanT -= dt;
    let aim = t;
    if (!lineClear(a.x, a.y, t.x, t.y)) {
      if (!f.path || f.replanT <= 0 || f.pi >= f.path.length) { f.path = gridPath(a.x, a.y, L.x, L.y, { partial: true }) || null; f.pi = 0; f.replanT = 1.2; a.stats.replans++; }
      if (f.path && f.path.length) {
        for (let j = Math.min(f.path.length - 1, f.pi + 4); j > f.pi; j--) if (lineClear(a.x, a.y, f.path[j].x, f.path[j].y)) { f.pi = j; break; }
        aim = f.path[Math.min(f.pi, f.path.length - 1)];
        if (Math.hypot(aim.x - a.x, aim.y - a.y) < 6) f.pi++;
      }
    } else f.path = null;
    moveToward(a, aim.x, aim.y, speed, dt, 1);
    // stuck: side-step, then (off-screen) hop
    f.chk -= dt;
    if (f.chk <= 0) {
      f.chk = 1;
      const moved = Math.hypot(a.x - f.lx, a.y - f.ly);
      f.lx = a.x; f.ly = a.y;
      if (moved < 4 && dt2 > 20) {
        f.stuck++;
        a.stats.unsticks++;
        if (f.stuck >= 2) { f.path = gridPath(a.x, a.y, L.x, L.y, { partial: true, margin: 320 }); f.pi = 0; a.stats.replans++; }
        if (f.stuck >= 4 && R && !R.inView(a.x, a.y, 30)) { hopTo(a, t); f.stuck = 0; }
      } else f.stuck = 0;
    }
    return true;
  }

  /* ---------------------------------------------------------------- riding */
  function vehicleTypeFor(id, want) {
    const def = DEFS[id] || {};
    const T = N.vehicles && N.vehicles.TYPES || {};
    let type = typeof want === 'string' ? want : def.vehicle || 'cycle';
    if (!T[type]) type = def.vehicleBase && T[def.vehicleBase] ? def.vehicleBase : (T.cycle ? 'cycle' : null);
    return type;
  }
  function brakeCtl(v) { v.ctl.throttle = 0; v.ctl.steer = 0; v.ctl.brake = true; v.ctl.handbrake = false; }
  function ride(key, what, opts) {
    const a = registry.get(key);
    if (!a || !N.vehicles || !N.vehicles.spawn) return null;
    opts = opts || {};
    let v = what && typeof what === 'object' ? what : null;
    if (!v) {
      if (a.ownVehicle && a.ownVehicle.alive && !a.ownVehicle.driver && Math.hypot(a.ownVehicle.x - a.x, a.ownVehicle.y - a.y) < 90) v = a.ownVehicle;
      else {
        const type = vehicleTypeFor(a.npcId, what);
        if (!type) return null;
        const T = N.vehicles.TYPES[type];
        const f = N.world.findFree(a.x, a.y, T.mode === 'boat' ? 'boat' : 'drive', 16) || { x: a.x, y: a.y };
        const def = DEFS[a.npcId] || {};
        v = N.vehicles.spawn(type, f.x, f.y, opts.angle != null ? opts.angle : a.angle, { color: opts.color || def.vehicleColor, label: opts.label || def.vehicleLabel || null });
        if (!v) return null;
        v.npcOwned = true;
      }
    }
    if (a.vehicle && a.vehicle !== v) dismount(key);
    if (v.driver && v.driver !== a) return null;
    N.vehicles.enter(a, v);
    v.noEnter = true; v.npcKey = key;
    v.controller = brakeCtl;
    a.ownVehicle = v;
    return v;
  }
  function dismount(key) {
    const a = registry.get(key);
    if (!a || !a.vehicle) return false;
    const v = a.vehicle;
    const ok = N.vehicles.exit(a, !N.render.inView(v.x, v.y, 20));
    if (!ok) N.vehicles.exit(a, true);
    v.controller = null; v.noEnter = !!v.npcOwned;
    a.vehicle = null; a.noCollide = false;
    a.homeX = a.x; a.homeY = a.y;
    return true;
  }
  function mountFor(a, f) {
    const v = ride(a.key, f.ride === true ? undefined : f.ride);
    if (!v) { f.ride = false; return false; }
    f.vchk = 1; f.vstuck = 0; f.rev = 0;
    return true;
  }
  // steer a vehicle towards (tx, ty) at a wanted speed; reverse out when wedged
  function steerVehicle(v, st, tx, ty, want, dt) {
    const ctl = v.ctl;
    const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
    const target = Math.atan2(dy, dx);
    const diff = U.angleDiff(v.angle, target);
    if (st.rev > 0) { st.rev -= dt; ctl.brake = false; ctl.handbrake = false; ctl.throttle = -0.7; ctl.steer = U.clamp(-diff * 2, -1, 1); return d; }
    if (Math.abs(diff) > 1.3) want = Math.min(want, 28);
    else if (Math.abs(diff) > 0.6) want = Math.min(want, 60);
    ctl.steer = U.clamp(diff * 2.6, -1, 1);
    ctl.handbrake = false;
    const sp = v.speed || 0;
    if (want < 2 && Math.abs(sp) < 4) { ctl.throttle = 0; ctl.brake = true; }
    else if (sp < want - 4) { ctl.throttle = U.clamp((want - sp) / 30, 0.25, 1); ctl.brake = false; }
    else if (sp > want + 12) { ctl.throttle = 0; ctl.brake = true; }
    else { ctl.throttle = 0.12; ctl.brake = false; }
    // wedged against something: back up with the wheel the other way
    st.vchk -= dt;
    if (st.vchk <= 0) {
      st.vchk = 0.8;
      const moved = Math.hypot(v.x - (st.vx0 || v.x + 99), v.y - (st.vy0 || v.y + 99));
      st.vx0 = v.x; st.vy0 = v.y;
      if (want > 10 && moved < 3 && d > 16) { st.vstuck = (st.vstuck || 0) + 1; st.rev = 0.7; }
      else st.vstuck = 0;
    }
    return d;
  }
  function followRide(a, dt) {
    const f = a.followSt, v = a.vehicle, L = f.leader;
    if (!L || L.alive === false) { a.followSt = null; v.controller = brakeCtl; return; }
    const lv = L.vehicle;
    if (!lv) { // the leader got off: stop, then get off too
      v.controller = brakeCtl;
      if (Math.abs(v.speed || 0) < 12) dismount(a.key);
      return;
    }
    v.controller = f._ctl || (f._ctl = (veh, h) => followCtl(a, veh, h));
  }
  function followCtl(a, v, dt) {
    const f = a.followSt;
    if (!f || !f.leader || !f.leader.vehicle) { brakeCtl(v); return; }
    const L = f.leader, lv = L.vehicle;
    const t = followTarget(a, L, f);
    const dl = Math.hypot(lv.x - v.x, lv.y - v.y);
    const R = N.render;
    // far behind off-screen: catch up behind the leader
    if (dl > Math.max(f.catchUp, 420) && !R.inView(v.x, v.y, 40)) {
      const sp = N.world.findFree(t.x, t.y, 'drive', 20);
      if (sp && !R.inView(sp.x, sp.y, 0) && !N.world.collide(sp.x, sp.y, v.T.cr + 0.5, 'drive').hit) { v.x = sp.x; v.y = sp.y; v.angle = t.ang; v.vx = lv.vx; v.vy = lv.vy; a.stats.hops++; f.vpath = null; return; }
    }
    // aim: the slot behind the leader; route round walls with a grid path when blocked
    let aim = t;
    f.vreplan = (f.vreplan || 0) - dt;
    if (!lineClear(v.x, v.y, t.x, t.y)) {
      if (!f.vpath || f.vreplan <= 0 || f.vpi >= f.vpath.length) { f.vpath = gridPath(v.x, v.y, lv.x, lv.y, { partial: true }) || null; f.vpi = 0; f.vreplan = 1.0; a.stats.replans++; }
      if (f.vpath && f.vpath.length) {
        for (let j = Math.min(f.vpath.length - 1, f.vpi + 4); j > f.vpi; j--) if (lineClear(v.x, v.y, f.vpath[j].x, f.vpath[j].y)) { f.vpi = j; break; }
        aim = f.vpath[Math.min(f.vpi, f.vpath.length - 1)];
        if (Math.hypot(aim.x - v.x, aim.y - v.y) < 10) f.vpi++;
      }
    } else f.vpath = null;
    const dSlot = Math.hypot(t.x - v.x, t.y - v.y);
    const ahead = Math.cos(t.ang) * (v.x - lv.x) + Math.sin(t.ang) * (v.y - lv.y) > -4; // level with or ahead of the leader
    let want = t.sp + (dSlot - 6) * 1.6;
    if (ahead && dl < 40) want = Math.min(want, t.sp * 0.7);
    if (dSlot < 8 && t.sp < 6) want = 0;
    want = U.clamp(want, 0, v.T.maxSpeed * 0.98);
    steerVehicle(v, f, aim.x, aim.y, want, dt);
  }

  /* ---------------------------------------------------------------- driveTo */
  function driveCtl(a, v, dt) {
    const j = a.drive;
    if (!j || j.done) { brakeCtl(v); return; }
    j.t += dt;
    if (j.timeout && j.t > j.timeout) { a.drive = null; brakeCtl(v); settle(j, false); return; }
    const dFinal = Math.hypot(j.gx - v.x, j.gy - v.y);
    if (dFinal < j.r) {
      brakeCtl(v);
      if (Math.abs(v.speed || 0) < 6) { a.drive = null; N.emit('npc:arrive', { key: a.key, id: a.npcId }); settle(j, true); }
      return;
    }
    if (!j.path || j.i >= j.path.length) { j.path = planPath(v.x, v.y, j.gx, j.gy); j.i = 0; }
    for (let k = Math.min(j.path.length - 1, j.i + 3); k > j.i; k--) if (lineClear(v.x, v.y, j.path[k].x, j.path[k].y)) { j.i = k; break; }
    const wp = j.path[Math.min(j.i, j.path.length - 1)];
    const dwp = Math.hypot(wp.x - v.x, wp.y - v.y);
    if (dwp < 14 && j.i < j.path.length - 1) j.i++;
    const want = Math.min(j.speed || v.T.maxSpeed * 0.75, dFinal * 1.2 + 10);
    steerVehicle(v, j, wp.x, wp.y, want, dt);
    if (j.vstuck >= 4 && !N.render.inView(v.x, v.y, 40)) { const f = N.world.findFree(wp.x, wp.y, 'drive', 20); if (f) { v.x = f.x; v.y = f.y; j.vstuck = 0; a.stats.hops++; } }
  }

  /* ---------------------------------------------------------------- emotes */
  const EMOTE_SECS = 2.2;
  function tickEmote(a, dt) { if (a.emoteSt) { a.emoteSt.t += dt; if (a.emoteSt.t >= a.emoteSt.secs) a.emoteSt = null; } }
  function isTalkFocus(a) {
    const c = N.interact && N.interact.current;
    return !!(c && c.npcKey === a.key && N.state.mode === 'play');
  }
  function drawOverhead(ctx, a) {
    const R = N.render;
    const v = a.vehicle || a;
    const k = R.k(17 + (a.level ? a.drawH || 0 : a.roofH));
    const X = Math.round(R.sx(v.x, k)), Y0 = Math.round(R.sy(v.y, k)) - 12;
    const e = a.emoteSt;
    const kind = e ? e.kind : 'talk';
    const t = e ? e.t : N.time.real;
    const pop = e ? Math.min(1, e.t * 6) : 1;
    const fade = e ? Math.min(1, (e.secs - e.t) * 4) : 0.85;
    const bob = Math.round(Math.sin((N.time.real || 0) * 4) * 1);
    const Y = Y0 + bob;
    ctx.globalAlpha = Math.max(0, fade);
    const w = kind === '...' || kind === 'talk' ? 13 : 11, h = 10;
    const bx = X - Math.round(w / 2 * pop), by = Y - h;
    ctx.fillStyle = '#1a1214';
    ctx.fillRect(bx - 1, by - 1, Math.round(w * pop) + 2, h + 2);
    ctx.fillRect(X - 2, Y, 4, 2); ctx.fillRect(X - 1, Y + 2, 2, 1);
    ctx.fillStyle = kind === 'talk' ? '#e8e0d0' : '#fff8e6';
    ctx.fillRect(bx, by, Math.round(w * pop), h);
    ctx.fillRect(X - 1, Y, 2, 1);
    if (pop < 1) { ctx.globalAlpha = 1; return; }
    const P = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X + x, by + y, ww, hh); };
    switch (kind) {
      case '!': P(-1, 2, 2, 4, '#e2483a'); P(-1, 7, 2, 1, '#e2483a'); break;
      case '!!': P(-3, 2, 2, 4, '#e2483a'); P(-3, 7, 2, 1, '#e2483a'); P(1, 2, 2, 4, '#e2483a'); P(1, 7, 2, 1, '#e2483a'); break;
      case '?': P(-2, 2, 4, 1, '#2a5cb8'); P(1, 3, 1, 2, '#2a5cb8'); P(-1, 4, 2, 1, '#2a5cb8'); P(-1, 5, 1, 1, '#2a5cb8'); P(-1, 7, 1, 1, '#2a5cb8'); break;
      case '♪': P(0, 2, 1, 5, '#7a3a8a'); P(1, 2, 2, 1, '#7a3a8a'); P(2, 3, 1, 1, '#7a3a8a'); P(-2, 6, 2, 2, '#7a3a8a'); break;
      case '♥': P(-3, 3, 2, 2, '#e2483a'); P(1, 3, 2, 2, '#e2483a'); P(-3, 4, 6, 2, '#e2483a'); P(-2, 6, 4, 1, '#e2483a'); P(-1, 7, 2, 1, '#e2483a'); break;
      case 'zzz': P(-3, 2, 3, 1, '#3a5a9a'); P(-2, 3, 1, 1, '#3a5a9a'); P(-3, 4, 3, 1, '#3a5a9a'); P(1, 5, 3, 1, '#3a5a9a'); P(2, 6, 1, 1, '#3a5a9a'); P(1, 7, 3, 1, '#3a5a9a'); break;
      case 'anger': P(-3, 3, 2, 1, '#e2483a'); P(1, 3, 2, 1, '#e2483a'); P(-3, 6, 2, 1, '#e2483a'); P(1, 6, 2, 1, '#e2483a'); P(-2, 2, 1, 2, '#e2483a'); P(1, 2, 1, 2, '#e2483a'); P(-2, 6, 1, 2, '#e2483a'); P(1, 6, 1, 2, '#e2483a'); break;
      case 'sweat': P(0, 2, 1, 1, '#4a9ad8'); P(-1, 3, 3, 3, '#4a9ad8'); P(0, 6, 1, 1, '#4a9ad8'); break;
      case '*': P(0, 2, 1, 6, '#e8a020'); P(-3, 4, 7, 2, '#e8a020'); P(-2, 3, 1, 1, '#e8a020'); P(2, 6, 1, 1, '#e8a020'); break;
      case '...': case 'talk': default: {
        const n = Math.floor((t || 0) * 3) % 4;
        for (let i = 0; i < 3; i++) P(-4 + i * 3, 5, 2, 2, i < n || kind === 'talk' ? '#3a3034' : '#c8c0b0');
      }
    }
    ctx.globalAlpha = 1;
  }
  const EMOTE_ALIAS = { alert: '!', question: '?', music: '♪', note: '♪', dots: '...', love: '♥', heart: '♥', sleep: 'zzz', angry: 'anger', star: '*', sparkle: '*', shock: '!!' };

  /* ---------------------------------------------------------------- barks */
  function ambientBark(a, dt) {
    if (N.state.mode !== 'play' || a.talking || a.walk) return;
    a.barkT -= dt;
    if (a.barkT > 0) return;
    a.barkT = 9 + Math.random() * 12;
    const p = N.player;
    if (!p || Math.hypot(p.x - a.x, p.y - a.y) > 70 || !N.render.inView(a.x, a.y, 0)) return;
    if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) return;
    if (Math.random() > 0.45) return;
    const line = pickLine(a, true);
    if (line) bark(a.key, line, { blip: false });
  }
  function linesOf(id) {
    const def = DEFS[id] || {};
    return (is2026() && def.lines2026) || def.lines || [];
  }
  function pickLine(a, short) {
    let L = linesOf(a.npcId);
    if (short) L = L.filter((l) => l.replace(/\*/g, '').length <= 64);
    if (!L.length) return null;
    a.lineI = ((a.lineI == null ? Math.floor(Math.random() * L.length) : a.lineI + 1)) % L.length;
    return L[a.lineI];
  }
  function bark(key, text, opts) {
    const a = typeof key === 'object' ? key : registry.get(key);
    if (!a || !N.dialogue || !N.dialogue.bark) return null;
    const r = N.dialogue.bark(a, text, Object.assign({ speaker: a.npcId }, opts || {}));
    shareBarkCooldown(a);
    return r;
  }
  // NPCs standing together (Pasha + Babloo) don't talk over each other: one bark pushes the
  // ambient bark cooldown of everyone within 40 u out to at least the barker's own
  function shareBarkCooldown(a) {
    const cd = Math.max(a.barkT || 0, 6);
    for (const b of registry.values()) {
      if (b === a || !b.alive || Math.hypot(b.x - a.x, b.y - a.y) > 40) continue;
      b.barkT = Math.max(b.barkT || 0, cd);
    }
  }

  /* ---------------------------------------------------------------- talk */
  async function talkTo(a) {
    if (a.talking || !a.alive) return;
    const id = a.npcId;
    a.talking = true;
    lastSpeaker = a.key;
    a.vx = a.vy = 0;
    if (N.player) a.angle = Math.atan2(N.player.y - a.y, N.player.x - a.x);
    N.emit('npc:talk', { key: a.key, id, actor: a });
    try {
      const t = a.talk;
      if (typeof t === 'function') await t(a, N.player);
      else if (Array.isArray(t)) await N.dialogue.play(t.map((l) => typeof l === 'string' ? { s: id, t: l } : Object.assign({ s: id }, l)));
      else if (typeof t === 'string') await N.dialogue.say(id, t);
      else {
        let handled = false;
        const def = DEFS[id] || {};
        const src = id === 'ammamma' ? 'home' : /^aunty/.test(id) ? 'aunty' : def.cityLocal && inOldCity(a) ? 'city' : null;
        if (src && N.hints && typeof N.hints.next === 'function') {
          let r = null;
          try { r = N.hints.next(src, { npc: id, actor: a }); if (r && typeof r.then === 'function') r = await r; } catch (e) { N.err('npcs.hints', e); r = null; }
          if (r && r.text) { await N.dialogue.say(id, r.text, { mood: r.refused ? 'worried' : r.deflect ? 'wink' : 'neutral' }); handled = true; }
        }
        if (!handled) {
          const line = pickLine(a, false);
          if (line) await N.dialogue.say(id, line, { mood: DEFS[id] && DEFS[id].mood });
        }
      }
    } catch (e) { N.err('npcs.talk:' + id, e); }
    a.talking = false;
  }
  function inOldCity(a) {
    try { const d = N.world.districtAt(a.x, a.y); return !!(d && (d.style === 'oldcity' || d.style === 'market' && /charminar|old|gulzar|laad|pathergatti/.test(d.id || ''))); } catch (e) { return false; }
  }
  function addInteract(a) {
    removeInteract(a);
    if (a.talk === false) return;
    const spec = {
      entity: a, r: 16, priority: 3, npcKey: a.key,
      label: () => talkLabel(a),
      enabled: (p) => a.alive && !a.vehicle && !a.talking && !a.hidden && a.talk !== false && !(p && p.vehicle) && !(a.roofH && !playerOnRoof(a)),
      use: () => { talkTo(a); },
    };
    N.interact.add('npc:' + a.key, spec);
  }
  function playerOnRoof(a) { const p = N.player; return !!(p && p.level); }
  function removeInteract(a) { if (N.interact && N.interact.remove) N.interact.remove('npc:' + a.key); }

  /* ================================================================ spawn / despawn */
  const warned = new Set();
  function warnOnce(key, msg) { if (warned.has(key)) return; warned.add(key); try { console.warn('[npcs] ' + msg); } catch (e) { /* ignore */ } }
  function spawn(id, target, opts) {
    opts = opts || {};
    if (!N.world || !N.world.built) { warnOnce('nb:' + id, 'spawn(' + id + ') before the world is built: ignored'); return null; }
    const key = opts.key || id;
    if (!DEFS[id]) {
      const gl = N.people.randomLook(U.rng('npc:' + id));
      DEFS[id] = { id, name: String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), color: U.rng('c:' + id).pick(['#f2c230', '#2a8c82', '#d8402a', '#7a3a8a', '#3a8a3a', '#c86a2a']), voice: 1, look: gl, portrait: { kind: gl.kind, skin: gl.skin, hair: gl.hair, shirt: gl.shirt, dupatta: gl.kind === 'woman' ? gl.dupatta : undefined, saree: gl.saree, border: gl.border }, generated: true };
      if (N.dialogue && N.dialogue.define && !(N.dialogue.speakers || {})[id]) N.dialogue.define(id, Object.assign(speakerSpec(id), { _cast: true }));
    }
    let pos = posOf(target == null ? 'player' : target);
    if (!pos) { // a place another module has not added yet: stand beside the player instead of failing the script
      warnOnce('t:' + JSON.stringify(target), 'spawn(' + id + '): unknown target ' + JSON.stringify(target) + ', spawning beside the player');
      pos = posOf('player');
      if (!pos) return null;
      target = 'player';
    }
    let x = pos.x, y = pos.y;
    if (target === 'player' || pos.entity === N.player) { const ang = (N.player.angle || 0) + Math.PI * 0.75; x += Math.cos(ang) * 16; y += Math.sin(ang) * 16; }
    if (opts.off) { x += opts.off[0]; y += opts.off[1]; }
    const RFS = N.world.roofs && typeof N.world.roofs.place === 'function' ? N.world.roofs : null;
    let roofId = null;
    if (RFS && opts.roof !== false) {
      if (typeof opts.roof === 'string') roofId = opts.roof;
      else if (pos.place && pos.place.level && RFS.get(pos.place.level)) roofId = pos.place.level;
      else if (pos.place && RFS.get(pos.place.id)) roofId = pos.place.id;
      else { const z = RFS.at(x, y); if (z && z.roof && (opts.roof || (pos.place && (pos.place.kind === 'terrace' || pos.place.kind === 'roof')))) roofId = z.roof.id; }
    }
    // without the roof runtime: stand on the place, drawn at roof height (fallback)
    const roofH = roofId || opts.roof === false ? 0 : (opts.roofH || (opts.roof || (pos.place && (pos.place.roof || pos.place.kind === 'terrace' || pos.place.kind === 'roof')) ? roofHeight(pos.place || { x, y, roof: opts.roof }) : 0));
    if (!roofH && !roofId && opts.free !== false) { const f = freeSpot(x, y, 80); if (f) { x = f.x; y = f.y; } }
    let a = registry.get(key);
    if (a && a.alive) {
      if (a.vehicle) dismount(key);
      if (a.level && RFS && RFS.remove) RFS.remove(a, x, y);
      a.x = x; a.y = y; a.vx = a.vy = 0; a.homeX = x; a.homeY = y; a.roofH = roofH;
      if (opts.angle != null) { a.angle = a.baseAngle = opts.angle; }
      if (opts.idle) a.idle = opts.idle;
      if ('talk' in opts) a.talk = opts.talk;
      if (opts.label) a.label = opts.label;
      if (opts.r) a.wanderR = opts.r;
      a.bench = !!opts.bench;
      a.owner = opts.owner || 'story';
      if (a.walk) finishWalk(a, false);
      a.followSt = null;
      addInteract(a);
    } else {
      a = new NPC(key, id, x, y, Object.assign({}, opts, { roofH }));
      if (opts.angle == null && N.player && !roofH) { a.angle = a.baseAngle = Math.atan2(N.player.y - y, N.player.x - x); }
      registry.set(key, a);
      N.npcs.list[key] = a;
      N.entities.add(a);
      addInteract(a);
      N.emit('npc:spawn', { key, id, actor: a });
    }
    if (roofId && RFS) {
      if (!RFS.place(a, roofId, x, y)) { const f = freeSpot(x, y, 80); if (f) { a.x = f.x; a.y = f.y; } }
      a.homeX = a.x; a.homeY = a.y;
    }
    if (opts.vehicle) ride(key, opts.vehicle === true ? undefined : opts.vehicle);
    if (opts.emote) emote(key, opts.emote);
    return a;
  }
  function despawn(k) {
    const a = typeof k === 'object' && k ? k : registry.get(k);
    if (!a) return false;
    const key = a.key;
    if (a.walk) finishWalk(a, false);
    if (a.drive) { const j = a.drive; a.drive = null; settle(j, false); }
    if (a.vehicle) {
      const v = a.vehicle;
      try { N.vehicles.exit(a, true); } catch (e) { /* ignore */ }
      a.vehicle = null;
      if (v.npcOwned && !N.render.inView(v.x, v.y, 20)) N.vehicles.remove(v); else { v.controller = null; v.noEnter = false; }
    }
    if (a.ownVehicle && a.ownVehicle.alive && a.ownVehicle.npcOwned && !a.ownVehicle.driver && !N.render.inView(a.ownVehicle.x, a.ownVehicle.y, 20)) N.vehicles.remove(a.ownVehicle);
    a.followSt = null;
    if (a.level && N.world.roofs && N.world.roofs.remove) { try { N.world.roofs.remove(a); } catch (e) { N.err('npcs.roof', e); } }
    removeInteract(a);
    if (registry.get(key) === a) { registry.delete(key); delete N.npcs.list[key]; }
    if (a.alive) N.entities.remove(a);
    a.alive = false;
    N.emit('npc:despawn', { key, id: a.npcId });
    return true;
  }
  // entities.clear() (new game / load) removes actors without telling us
  N.on('entity:remove', (e) => {
    if (!e || !e.isNpc) return;
    if (registry.get(e.key) === e) { registry.delete(e.key); delete N.npcs.list[e.key]; removeInteract(e); if (e.walk) finishWalk(e, false); }
  });

  /* ================================================================ public verbs */
  function walkTo(key, target, opts) {
    opts = opts || {};
    const a = registry.get(key);
    if (!a || !a.alive) return Promise.resolve(false);
    const p = posOf(target);
    if (!p) { warnOnce('w:' + JSON.stringify(target), 'walkTo(' + key + '): unknown target ' + JSON.stringify(target)); return Promise.resolve(false); }
    if (a.vehicle) dismount(key);
    if (a.walk) finishWalk(a, false);
    const dynamic = typeof target === 'object' && !Array.isArray(target) && target.kind ? true : (typeof target === 'string' && registry.has(target)) || target === 'player';
    const job = makeJob({ target, gx: p.x, gy: p.y, r: opts.r || 8, run: !!opts.run, speed: opts.speed || 0, timeout: opts.timeout || 0, face: opts.face, dynamic, t: 0, i: 0, path: null, chk: 1, stuck: 0, lx: a.x, ly: a.y, lastD: null, ahead: 0, retarget: 1, side: null });
    a.walk = job;
    a.followSt = null;
    job.path = planPath(a.x, a.y, p.x, p.y);
    return job.promise;
  }
  function driveTo(key, target, opts) {
    opts = opts || {};
    const a = registry.get(key);
    if (!a || !a.alive) return Promise.resolve(false);
    const p = posOf(target);
    if (!p) return Promise.resolve(false);
    if (!a.vehicle) ride(key, opts.vehicle);
    if (!a.vehicle) return walkTo(key, target, opts);
    if (a.drive) { const j0 = a.drive; a.drive = null; settle(j0, false); }
    const j = makeJob({ gx: p.x, gy: p.y, r: opts.r || 24, speed: opts.speed || 0, timeout: opts.timeout || 0, t: 0, i: 0, path: null, vchk: 1, vstuck: 0, rev: 0 });
    a.drive = j;
    a.followSt = null;
    a.vehicle.controller = (v, dt) => driveCtl(a, v, dt);
    return j.promise;
  }
  function follow(key, leader, opts) {
    const a = registry.get(key);
    if (!a) return false;
    if (!leader) {
      a.followSt = null;
      if (a.vehicle) a.vehicle.controller = brakeCtl;
      a.homeX = a.x; a.homeY = a.y; a.baseAngle = a.angle;
      a.mass = 2;
      return true;
    }
    if (typeof leader === 'string') leader = leader === 'player' ? N.player : registry.get(leader);
    if (!leader) return false;
    opts = opts || {};
    if (a.walk) finishWalk(a, false);
    a.followSt = { leader, dist: opts.dist || 20, side: opts.side || 'right', ride: opts.ride == null ? !!(DEFS[a.npcId] || {}).vehicle : opts.ride, catchUp: opts.catchUp || 420, chk: 1, lx: a.x, ly: a.y, stuck: 0, replanT: 0, path: null, pi: 0 };
    a.mass = 0.8; // the player can shoulder past a companion
    return true;
  }
  function stop(key) {
    const a = registry.get(key);
    if (!a) return false;
    if (a.walk) finishWalk(a, false);
    if (a.drive) { const j = a.drive; a.drive = null; settle(j, false); if (a.vehicle) a.vehicle.controller = brakeCtl; }
    return true;
  }
  function emote(key, kind, secs) {
    const a = registry.get(key);
    if (!a) return false;
    if (!kind) { a.emoteSt = null; return true; }
    kind = EMOTE_ALIAS[kind] || kind;
    a.emoteSt = { kind, t: 0, secs: secs || EMOTE_SECS };
    return true;
  }

  /* ================================================================ player look */
  function applyPlayerLook() {
    const p = N.player;
    if (!p || N.npcs.keepPlayerLook) return;
    const id = is2026() ? 'srikanth' : 'chinnu';
    const l = lookOf(id);
    if (l) p.look = Object.assign({}, l);
  }

  /* ================================================================ schedules */
  const H = (a, b) => [a, b];
  const SCHED = {
    colony_aunties: { on: true, hours: H(7, 20), cast: [
      { id: 'aunty', place: 'playground_1', off: [-22, -30], idle: 'sit', bench: true, angle: Math.PI / 2 },
      { id: 'aunty_2', place: 'playground_1', off: [-12, -30], idle: 'sit', bench: true, angle: Math.PI / 2 },
      { id: 'aunty_3', place: 'playground_1', off: [-2, -30], idle: 'sit', bench: true, angle: Math.PI / 2 },
    ] },
    faramarz: { on: true, hours: H(7, 23), y2026: true, cast: [{ id: 'faramarz', place: ['irani_cafe_19', 'cafe_noor_e_iran'], counter: true, idle: 'work' }] },
    kite_chacha: { on: true, hours: H(7, 19), cast: [{ id: 'kite_chacha', place: ['kite_chacha_roof', 'patang_chacha_roof', 'patang_roof', 'kite_stall_1', 'patang_bazaar'], counter: true, idle: 'work', emote: '♪' }] },
    shopkeepers: { on: true, cast: [
      { id: 'salim', place: 'irani_cafe_7', counter: true, idle: 'work', hours: H(6, 23) },
      { id: 'agarwal', place: 'kirana_1', counter: true, idle: 'stand', hours: H(7, 22) },
      { id: 'ramulu', place: 'pindi_girni_1', counter: true, idle: 'work', hours: H(8, 19) },
      { id: 'flower_aunty', place: 'flower_cart_1', counter: true, idle: 'work', hours: H(6, 20) },
      { id: 'photo_uncle', place: 'photo_studio_1', counter: true, idle: 'stand', hours: H(9, 20) },
      { id: 'net_uncle', place: 'internet_cafe_1', counter: true, idle: 'stand', hours: H(10, 22) },
      { id: 'ticket_thatha', place: 'koti_bus_stand', off: [24, 18], idle: 'sit', bench: true, hours: H(8, 18) },
    ] },
    ammamma_swing: { on: true, hours: H(6, 21), cast: [{ id: 'ammamma', place: 'home', off: [-30, -2], idle: 'sit', bench: true, angle: Math.PI / 2 }] },
    bahadur_night: { on: true, hours: H(20, 6), cast: [{ id: 'bahadur', place: 'home', off: [70, 14], idle: 'wander', r: 46 }] },
    pochaiah_podium: { on: true, hours: H(8, 20), hideWhen: () => !!(N.wanted && N.wanted.level >= 3), cast: [{ id: 'pochaiah', place: 'rtc_x_roads', idle: 'work', off: [0, 0] }] },
    cable_babji: { on: true, hours: H(17, 20), cast: [{ id: 'cable_babji', place: 'kirana_3', idle: 'wander', r: 70 }] },
    tiger_ground: { on: true, hours: H(16, 19), cast: [{ id: 'tiger', place: 'playground_14', idle: 'wander', r: 50 }] },
    vimala_school: { on: true, hours: H(8, 16), weekdays: true, cast: [{ id: 'vimala_maam', place: 'school_1', off: [0, 14], idle: 'stand' }] },
    immu_hangout: { on: false, hours: H(7, 20), cast: [{ id: 'immu', place: 'playground_1', off: [20, 10], idle: 'wander', r: 40 }] },
    ayesha_nets: { on: false, hours: H(6, 8), cast: [{ id: 'ayesha', place: 'public_gardens', idle: 'wander', r: 40 }] },
  };
  const schedDefaults = {};
  for (const n in SCHED) schedDefaults[n] = SCHED[n].on;
  const anchorCache = new Map();
  function counterSpot(pl) {
    // between the place point and the shop front (the nearest solid cell), facing out
    let best = null;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * TAU;
      for (let r = 6; r <= 34; r += 2) {
        const x = pl.x + Math.cos(ang) * r, y = pl.y + Math.sin(ang) * r;
        if (!N.world.isWalkable(x, y)) { if (!best || r < best.r) best = { r, ang }; break; }
      }
    }
    if (!best) return { x: pl.x + 12, y: pl.y - 8, angle: Math.PI / 2 };
    const d = Math.max(4, best.r - 7);
    const x = pl.x + Math.cos(best.ang) * d, y = pl.y + Math.sin(best.ang) * d;
    const f = freeSpot(x, y, 14) || { x: pl.x, y: pl.y };
    return { x: f.x, y: f.y, angle: best.ang + Math.PI };
  }
  function anchorOf(name, e) {
    const k = name + ':' + e.id;
    if (anchorCache.has(k)) return anchorCache.get(k);
    const pos = posOf(e.place);
    if (!pos) { anchorCache.set(k, null); return null; }
    let out;
    const pl = pos.place;
    const RFS = N.world.roofs && N.world.roofs.get ? N.world.roofs : null;
    const roofId = pl && RFS ? (pl.level && RFS.get(pl.level) ? pl.level : RFS.get(pl.id) ? pl.id : null) : null;
    const roofH = !roofId && pl && (pl.roof || pl.kind === 'terrace' || pl.kind === 'roof') ? roofHeight(pl) : 0;
    if (roofId) out = { x: pl.x + (e.off ? e.off[0] : 0), y: pl.y + (e.off ? e.off[1] : 0), angle: e.angle != null ? e.angle : Math.PI / 2, roofId };
    else if (roofH) out = { x: pl.x + (e.off ? e.off[0] : 0), y: pl.y + (e.off ? e.off[1] : 0), angle: Math.PI / 2, roofH };
    else if (e.counter && pl) out = counterSpot(pl);
    else { const f = freeSpot(pos.x + (e.off ? e.off[0] : 0), pos.y + (e.off ? e.off[1] : 0), 60) || pos; out = { x: f.x, y: f.y, angle: e.angle != null ? e.angle : Math.PI / 2 }; }
    if (e.angle != null) out.angle = e.angle;
    anchorCache.set(k, out);
    return out;
  }
  function inHours(hh, h) {
    if (!hh) return true;
    const [a, b] = hh;
    return a <= b ? h >= a && h < b : h >= a || h < b;
  }
  function weekday() {
    try { if (N.calendar && N.calendar.date) { const d = N.calendar.date; const dow = typeof d === 'function' ? d().dow : d.dow; if (dow != null) return dow !== 0; } } catch (e) { /* stub */ }
    return true;
  }
  let schedT = 0;
  function runSchedules(dt, force) {
    schedT -= dt;
    if (schedT > 0 && !force) return;
    schedT = 0.5;
    const p = N.player;
    if (!p || !N.world.built) return;
    const h = N.clock ? N.clock.minutes / 60 : 12;
    const y26 = is2026();
    for (const name in SCHED) {
      const S = SCHED[name];
      let hide = false;
      try { hide = !!(S.hideWhen && S.hideWhen()); } catch (e) { hide = false; }
      for (const e of S.cast) {
        const key = e.id;
        const a = registry.get(key);
        const want = S.on && !hide && inHours(e.hours || S.hours, h) && (!S.weekdays || weekday()) && (!y26 || S.y2026);
        if (a && a.owner !== 'sched:' + name) continue; // the story (or another schedule) owns it
        const an = want ? anchorOf(name, e) : null;
        if (want && an) {
          const d = Math.hypot(p.x - an.x, p.y - an.y);
          if (!a && d < 640) {
            const r = spawn(e.id, { x: an.x, y: an.y }, { key, idle: e.idle, angle: an.angle, bench: e.bench, r: e.r, owner: 'sched:' + name, free: !an.roofH && !e.counter, roofH: an.roofH || 0, roof: an.roofId || (an.roofH ? true : false) });
            if (r && e.emote && Math.random() < 0.5) emote(key, e.emote, 3);
          } else if (a && d > 820 && !N.render.inView(a.x, a.y, 40)) despawn(a);
        } else if (a && !N.render.inView(a.x, a.y, 30)) despawn(a);
        else if (a && !want && !a.walk) { // leave walking (off the screen, then gone)
          a.idle = 'stand';
          if (!a.leaving) { a.leaving = true; const f = N.world.nearestRoadPoint ? N.world.nearestRoadPoint(a.x, a.y) : null; const gone = () => { if (a.alive && !N.render.inView(a.x, a.y, 30)) despawn(a); }; walkTo(key, f ? { x: f.x + 200, y: f.y } : { x: a.x + 200, y: a.y }, { timeout: 30 }).then(gone, gone); }
        }
      }
    }
  }
  function schedule(name, on) {
    const S = SCHED[name];
    if (!S) return false;
    S.on = !!on;
    if (!S.on) for (const e of S.cast) { const a = registry.get(e.id); if (a && a.owner === 'sched:' + name) despawn(a); }
    else runSchedules(0, true);
    return true;
  }

  /* ================================================================ API */
  N.npcs = {
    defs: DEFS, list: {}, cast: CAST_IDS.slice(),
    define(id, def) {
      def = Object.assign({ id, name: id, color: '#f2c230', voice: 1 }, DEFS[id] || {}, def || {});
      DEFS[id] = def;
      for (const k of Array.from(lookCache.keys())) if (k.indexOf(id + '|') === 0 || k === 'gen|' + id) lookCache.delete(k);
      if (N.dialogue && N.dialogue.define) N.dialogue.define(id, speakerSpec(id));
      return def;
    },
    ids: () => Object.keys(DEFS),
    speakerSpec, registerSpeakers,
    spawn, despawn,
    get(key) { const a = registry.get(key); return a && a.alive ? a : null; },
    all: () => Array.from(registry.values()).filter((a) => a.alive),
    remove(key) { return despawn(key); },
    walkTo, driveTo, follow, stop, ride, dismount, emote, bark,
    lookAt(key, target) { const a = registry.get(key); if (!a) return false; a.lookTarget = target || null; return true; },
    face(key, target) { const a = registry.get(key); const p = posOf(target); if (!a || !p) return false; a.angle = a.baseAngle = Math.atan2(p.y - a.y, p.x - a.x); return true; },
    say(key, text, opts) { const a = registry.get(key); const id = a ? a.npcId : key; if (a && N.player) a.angle = Math.atan2(N.player.y - a.y, N.player.x - a.x); return N.dialogue.say(id, text, opts); },
    setTalk(key, talk) { const a = registry.get(key); if (!a) return false; a.talk = talk; addInteract(a); return true; },
    setLabel(key, label) { const a = registry.get(key); if (!a) return false; a.label = label; return true; },
    setIdle(key, idle, opts) { const a = registry.get(key); if (!a) return false; a.idle = idle; a.homeX = a.x; a.homeY = a.y; if (opts && opts.r) a.wanderR = opts.r; if (opts && opts.bench != null) a.bench = !!opts.bench; a.baseAngle = a.angle; return true; },
    setVariant(id, name) {
      if (name == null) delete variantSet[id]; else variantSet[id] = name;
      if (id === 'chinnu' || id === 'srikanth') applyPlayerLook();
      return true;
    },
    variant: (id) => variantOf(id),
    look: lookOf, portraitLook: portraitOf, displayName,
    applyPlayerLook, keepPlayerLook: false,
    schedule, schedules: SCHED, scheduleOn: (n) => !!(SCHED[n] && SCHED[n].on),
    planPath, gridPath, freeSpot, lineClear,
    talkTo(key) { const a = registry.get(key); if (a) return talkTo(a); return Promise.resolve(); },
    get lastSpeaker() { return lastSpeaker; },
    PORTRAIT_FN,
  };

  /* ================================================================ system + lifecycle */
  let lastYear = null;
  function resetAll() {
    for (const a of Array.from(registry.values())) despawn(a);
    registry.clear();
    N.npcs.list = {};
    for (const n in SCHED) SCHED[n].on = schedDefaults[n];
    for (const k in variantSet) delete variantSet[k];
    anchorCache.clear();
    abortJobsFor(null);
  }
  for (const ev of ['mission:abort', 'mission:complete', 'mission:fail']) N.on(ev, () => { setTimeout(() => { for (const j of Array.from(pendingJobs)) if (!j.done && j.run && N.missions && N.missions.active !== j.run) { pendingJobs.delete(j); for (const a of registry.values()) { if (a.walk === j) a.walk = null; if (a.drive === j) a.drive = null; } settle(j, false); } }, 0); });
  N.on('game:new', () => { applyPlayerLook(); });
  N.on('game:continue', () => applyPlayerLook());
  N.on('save:loaded', () => applyPlayerLook());
  N.on('flag', (d) => { if (d && (d.name === 'year' || d.name === 'year2026' || d.name === 'chand_raat' || d.name === 'bonalu')) { applyPlayerLook(); if (N.dialogue && N.dialogue.speakers) for (const id in N.dialogue.speakers) if (N.dialogue.speakers[id]._cache) N.dialogue.speakers[id]._cache = {}; } });
  N.on('season:change', () => applyPlayerLook());
  N.on('world:built', () => { anchorCache.clear(); });

  N.addSystem({
    id: 'npcs', order: 45, runIn: ['play', 'dialogue', 'cutscene'],
    init() {
      wrapPeople();
      registerSpeakers();
      if (N.save && N.save.register) {
        N.save.register('npcs', {
          serialize() { const s = {}; for (const n in SCHED) s[n] = SCHED[n].on; return { schedules: s }; },
          deserialize(o) { if (!o || typeof o !== 'object' || !o.schedules) return; for (const n in o.schedules) if (SCHED[n]) SCHED[n].on = !!o.schedules[n]; },
        });
      }
    },
    draw() {
      for (const a of registry.values()) if (a.level && a.alive && !a.vehicle && (a.emoteSt || isTalkFocus(a)) && N.render.inView(a.x, a.y, 40)) N.render.queue('sky', 1, a._skyFn);
    },
    update(dt) {
      const y = is2026();
      if (y !== lastYear) { lastYear = y; applyPlayerLook(); }
      if (N.state.mode === 'play') runSchedules(dt);
    },
    reset() { resetAll(); },
  });
})();
