/* NOSTALGIA — menus.js
 * Title (a cassette J-card over Charminar at dusk), the name card, pause (a 2-in-1 cassette
 * deck), the full-screen city-guide map, the Journal (tab registry), settings (N.settings),
 * save/load slots, credits, the definitions card and the cutscene player.
 * Contract: ARCHITECTURE.md §10 + §19; design/systems_design.md §13-§14; story bible §1.1, §9.
 *
 * ============================================================== API (story + other modules)
 * Engine hooks (main.js):  N.menus.title() · pause() · resume() · hideAll() · isOpen()
 *
 * Names (bible §2.1):
 *   await N.menus.nameEntry({nick, full}) -> {nick, full} | null (Back)   DOM card, no prompt()
 *   N.menus.names() -> {nick, full, FULL}     setNames(nick, full)
 *   N.menus.subst('Mummy shouts {FULL}!')    replaces {nick} {NICK} {full} {FULL}
 *   The names live on N.player.name (= nick), N.player.nick, N.player.fullName and are saved
 *   (save section 'profile'); they survive N.systems.reset() / newGame.
 *
 * Cutscenes (ARCHITECTURE §19):  await N.menus.cutscene(steps, opts) -> {skipped, aborted}
 *   opts: {id, skippable = true, letterbox = true, keepCamera = false, holdFade = false}
 *   Pushes the 'cutscene' state when started from play/dialogue/minigame (popped at the end),
 *   holds its position under the pause menu (Esc / Start / tab hidden), works over the title.
 *   Hold ACTION (or press and hold anywhere) for 1 s, or tap the SKIP pill: the rest is
 *   fast-forwarded (call steps still run, cameras jump, dialogue resolves to defaults).
 *   A short ACTION / tap advances the current card or text early. N.menus.abortCutscene()
 *   resolves the pending promise at once ({aborted: true}); missions.js calls it on fail/quit.
 *   Steps (a bare function is a `call`; any step may set `async: true` to run alongside the next ones):
 *     card  {title, sub, ms=2600, kind:'osd'|'chapter'|'title', te, ur, dim}   ▶/■/◀/● titles default to the VHS OSD look
 *     text  {lines:[..] | text, ms, dim}                 narration lines (typed in, ACTION advances)
 *     vhs   {mode:'rewind'|'ff'|'play'|'stop'|'rec'|'pause', ms=1500, label, year:[2026, 2003],
 *            amount, music}   N.render.fx.vhs + the tape-rewind sound ('cutscene:vhs' event);
 *            stop + music:true runs N.audio.tapeStop(); hold:true keeps the VHS look on
 *     fade  {to:'black'|'clear'|'white', ms=600}         N.render.fx.fade (DOM cards stay on top)
 *     wait  {ms}
 *     say   {s, t, mood}  · talk {lines:[{s, t, mood?, choices?}]}   via N.dialogue (tokens substituted)
 *     camera {target: placeId | landmarkId | npcId | entity | {x, y} | [x, y], x, y, zoom, ms=1500,
 *            release}   eased pan through N.render.camOverride (restored when the cutscene ends)
 *     call  {fn}   await fn(ctx)    (errors are reported, the cutscene carries on)
 *     jcard {track, title, place, scribble, line, ms=3600}   the J-card line (MISSION PASSED)
 *     credits {}   the scrolling J-card credits (bible §9.4)
 *     definitions {}   "NOSTALGIA (n.)" card (bible §9.3)
 *     extras: prompt {label, hint} (waits for ACTION) · sfx {name} · music {id | null, fade}
 *            osd {text, sub, ms} · counter {from, to, ms, side} · flash {} · title {sub, ms}
 *            letterbox {on} · vhsfx {amount}
 *   Events: 'cutscene:start' {id}, 'cutscene:step' {id, i, type}, 'cutscene:end' {id, skipped, aborted},
 *   'cutscene:vhs' {mode, tape} (audio.js plays the rewind).
 *
 * Other screens:
 *   await N.menus.credits({fromTitle}) · await N.menus.definitions() · await N.menus.jcard({...})
 *   N.menus.osdCard('▶ PLAY', {sub, ms})  non-blocking VHS OSD card (used after CONTINUE)
 *   N.menus.openMap({x, y, zoom}) / closeMap() · openJournal(tabId) / closeJournal()
 *   N.menus.openSettings() · openSaveLoad() · openPause()
 *   N.menus.addSettingsRow({id, label, type: 'seg'|'toggle'|'slider', opts: [[v, text]...], get(), set(v),
 *     help, section})   rows owned by other modules (N.view, §20, gets a View row + a VIEW title track)
 *   N.menus.addJournalTab({id, title, order, render(el, api)}) / removeJournalTab(id) / refreshJournal()
 *     built-in tabs: story (10), sidea (20), tin (40), lock (50), dictionary (90).
 *     render(el) gets an empty .jr-page element; re-rendered every time the tab is shown.
 *   N.menus.addMapLayer({id, title, order, color, icon, points() -> [{x, y, icon, color, label,
 *     id, done}], draw(ctx, view)}) / removeMapLayer(id)   (legend toggle per layer)
 *     view = {w2s(x, y) -> [sx, sy], s (CSS px per u), W, H}. A layer with id 'collectibles'
 *     replaces the built-in one (which reads N.collectibles.items / has / isKnown).
 *   N.menus.addDiary({id, date, text, ink, mark}) extra "Story so far" lines.
 *   N.menus.canSave() -> {ok, reason}   saveManual() -> bool   lastSaved() -> ms timestamp | 0
 *   N.menus.waypoint(x, y | null)   the pink map waypoint (route on the minimap)
 *   N.menus.quickStart (default: navigator.webdriver) — PLAY skips the overwrite prompt and the
 *     name card; set it to false to drive the real flow from a test (tests/menus.cjs, smoke.cjs).
 *   Data from the bible: N.menus.TRACKS (12 tracks + J-card lines), DIARY, TOKENS, LOCK.
 *
 * Journal data read from other modules (all optional): N.tape.{counter, side, tracks, tin,
 *   tokens | tokenInfo(id)}, N.missions.isDone(id), N.flags.lock_1..lock_4 (digits found),
 *   N.flags.credits_seen + N.story.replay(missionId) (Side A replay), N.dialogue.glossary.
 *
 * N.settings (persisted 'nostalgia.settings.v1'; every other module reads it lazily):
 *   get(key) · set(key, value) · values · DEFAULTS · diff(key) (difficulty multiplier, systems
 *   §14.1: pursuerSpeed sight unseenDrop chappalInterval homingTurn tummyDrain missionTimers
 *   cargoDamage minigameOffset caughtFine hintNudge) · difficulty · textCps() (0 = instant) ·
 *   vhsScale() · emits 'settings:change' {key, value}.
 *   Keys: textSpeed (slow|normal|fast|instant), autoAdvance, captions, reducedMotion (auto|on|off),
 *   flashReduce (auto|on|off), vhs (0-100), handed (right|left), btnSize (s|m|l), difficulty
 *   (relaxed|normal|hard), hintNudges (off|normal|fast; alias .hints), assist, letImmu,
 *   colorBlind (off|deutan|protan|tritan), highContrast; every key is also a plain property. Volumes go straight to N.audio.setVolume (audio.js persists them).
 *   Body classes: reduced-motion, flash-reduce, touch-left, tbtn-s | tbtn-l, captions-on,
 *   high-contrast, cb-<mode>. N.dialogue.textSpeed follows the text speed.
 *
 * Saving: one N.save slot ("latest", what CONTINUE loads; booths, MISSION PASSED and the pause
 * menu write it) + a MANUAL copy under 'nostalgia.save.v1.manual' written by the pause menu's
 * Save. Saving from the pause menu is refused during missions, minigames, cutscenes,
 * conversations, chases (Chappal Meter >= 3) and when N.flags.no_save is set.
 *
 * Deviation note: the J-card handwriting uses the Google font "Kalam" (injected at load with
 * system fallbacks), because index.html is owned by the engine.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================== helpers */
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // *emphasis* -> <i>emphasis</i> (bible slang markup), escaped
  const emph = (s) => esc(s).replace(/\*([^*]+)\*/g, '<i>$1</i>');
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = (k) => { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } };
  const lsOK = (() => { let ok = null; return () => { if (ok === null) { try { const k = '__mn_probe__'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); ok = true; } catch (e) { ok = false; } } return ok; }; })();
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, Object.assign({ ui: true }, o || {})); } catch (e) { /* audio never breaks menus */ } }
  const reduced = () => document.body.classList.contains('reduced-motion');
  const pad3 = (n) => String(Math.max(0, Math.min(999, Math.round(n || 0)))).padStart(3, '0');
  const pad2 = (n) => String(n).padStart(2, '0');
  function agoText(t) {
    if (!t) return 'never';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    const h = Math.round(m / 60);
    if (h < 48) return h + (h === 1 ? ' hour ago' : ' hours ago');
    return Math.round(h / 24) + ' days ago';
  }
  const rupees = (p) => '₹' + Math.floor((p || 0) / 100);
  function overlayRoot() {
    let o = document.getElementById('overlay');
    if (!o) { o = el('div', '', document.body); o.id = 'overlay'; }
    return o;
  }
  function focusEl(e) { if (e && e.focus) { try { e.focus({ preventScroll: true }); } catch (err) { /* ignore */ } } }
  function blurActive() { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); }
  const isTextInput = (t) => !!t && ((t.tagName === 'INPUT' && /^(text|search|)$/.test(t.type || '')) || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const kidRng = () => U.rng('nostalgia-jcard');
  // "eleven-year-old capitals": letters with small deterministic wobbles
  function kidCaps(text, seed) {
    const r = U.rng(seed || text);
    // letters wobble; words never break in the middle (each word is one nowrap span)
    return String(text).split(' ').map((w) => {
      let h = '';
      for (const ch of w) {
        const rot = (r.next() * 2 - 1) * 6, dy = (r.next() * 2 - 1) * 2.2;
        h += '<span class="kc" style="transform:translateY(' + dy.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg)">' + esc(ch) + '</span>';
      }
      return '<span class="kw">' + h + '</span>';
    }).join(' ');
  }

  // Handwriting font for the J-card (Google Fonts only; fallbacks in CSS).
  (function loadHandFont() {
    try {
      if (document.querySelector('link[data-mn-font]')) return;
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap';
      l.setAttribute('data-mn-font', '1');
      (document.head || document.documentElement).appendChild(l);
    } catch (e) { /* fallbacks */ }
  })();

  /* ============================================================ bible data */
  const TRACKS = [
    { n: 1, id: 'bo_kaata', title: 'BO KAATA!', place: 'TERRACE, SANKRANTI', scribble: 'your name is spelt wrong. —I', date: 'TUE 14 JAN 2003', counter: 83 },
    { n: 2, id: 'lost_and_found', title: 'LOST AND FOUND', place: 'NUMAISH', scribble: 'I was NOT lost. —I', date: 'SAT 25 JAN 2003', counter: 166 },
    { n: 3, id: 'first_day_first_show', title: 'FIRST DAY FIRST SHOW', place: 'SANDHYA', scribble: "Ayesha's whistle, not yours. —I", date: 'SAT 08 FEB 2003', counter: 249 },
    { n: 4, id: 'last_man_batting', title: 'HOWZAAT!', place: 'PUBLIC GARDENS', scribble: "Chitti's catch. Write it BIG. —I", date: 'SUN 23 MAR 2003', counter: 332 },
    { n: 5, id: 'right_right', title: 'RIGHT, RIGHT!', place: 'IMLIBUN', scribble: 'Nani says I won the pani puri. —I', date: 'TUE 01 APR 2003', counter: 415 },
    { n: 6, id: 'ammammas_thursday', title: 'THUMP-THUMP', place: 'HANUMAN PINDI GIRNI', scribble: "Ramulu-uncle's hair is atta. —I", date: 'THU 15 MAY 2003', counter: 498 },
    { n: 7, id: 'the_clap', title: 'GOLCONDA HEARD US', place: 'FATEH DARWAZA', scribble: 'Officially magic. —I', date: 'SAT 07 JUN 2003', counter: 581 },
    { n: 8, id: 'drums_for_amma', title: 'DRUMS FOR AMMA', place: 'LASHKAR BONALU', scribble: 'Ramulu-uncle was GOLD. —I', date: 'SUN 20 JUL 2003', counter: 664 },
    { n: 9, id: 'opening_day', title: 'OPENING DAY', place: 'PRASADS', scribble: 'Abba laughed the loudest. —I', date: 'FRI 25 JUL 2003', counter: 747 },
    { n: 10, id: 'agle_baras', title: 'AGLE BARAS', place: 'TANK BUND', scribble: '', date: 'TUE 09 SEP 2003', counter: 812 },
    { n: 11, id: 'last_bell', title: 'NO BELLS', place: 'NAUBAT PAHAD', scribble: "the wind. ammamma says god won't mind.", hand: 'chinnu', date: 'FRI 21 NOV 2003', counter: 905 },
    { n: 12, id: 'chand_raat', title: 'CHAND RAAT', place: 'CHARMINAR', scribble: '999. Full. —I & C', date: 'TUE 25 NOV 2003', counter: 999 },
  ];
  const DIARY = {
    bo_kaata: { text: 'Today I cut 100 kites and one cut me back. I flew after it over forty roofs.', ink: '*Forty roofs? Sach likho.*' },
    lost_and_found: { text: 'Today my friend was announced on the radio of the whole of India.', ink: '*Loudspeaker, not radio. India, not. Sach likho.*' },
    first_day_first_show: { text: 'Today the hero waved at me personally from the screen.', ink: '*He waved at four hundred people. Sach likho.*' },
    last_man_batting: { text: 'Today I hit a six that landed in the Assembly and the government gave it back.', ink: '*The sentry gave it back. Still, good manners. Half mark.*', mark: '½' },
    right_right: { text: 'Today I ate fifty pani puris and caught a bus that was flying.', ink: '*Bus udti nahi. Sach likho.*' },
    ammammas_thursday: { text: 'Today I carried 500 kilos of flour on one cycle and solved a mystery older than my father.', ink: '*5 kilos. And your Ammamma solved it. Sach likho.*' },
    the_clap: { text: 'Today I clapped and a king clapped back from 400 years ago.', ink: '*It was Imran. Lovely sentence though.*' },
    drums_for_amma: { text: 'Today two uncles who hated each other for 100 years became best friends because of me.', ink: '*Because of buttermilk. Sach likho. (But I am happy.)*' },
    opening_day: { text: 'Today I saw a whale in Hyderabad.', ink: '*On a screen. ...Fine. That one is true enough.*', mark: '✓' },
    agle_baras: { text: "Today our Ganesh went into the lake and I didn't cry.", ink: '*It is all right to cry. Sach likho.*' },
    last_bell: { text: 'Today I heard nothing on a hill, and it was the loudest thing.', ink: '*This is almost true. Almost.*' },
    chand_raat: { text: 'Truth: I did nothing big. I recorded one city on one tape and walked my friend back to his Ammi. Nanna is in the photo.', ink: '*10/10. Pehli baar sach.*', mark: '10/10', date: 'DECEMBER 2003' },
  };
  const TOKENS = {
    bo_kaata: ['The kite corner', 'Torn off the tail. My name on it in sketch pen, spelt wrong.'],
    lost_and_found: ['Numaish entry ticket', 'Nampally Exhibition, 2003. Immu was NOT lost.'],
    first_day_first_show: ['Floor ticket stub', 'TOOFAN TAMMUDU · FLOOR · 8-2-03'],
    last_man_batting: ['The signed tennis ball', "Every colony player's name in ballpoint. Chitti's is the biggest."],
    right_right: ["Ticket Thatha's punched ticket", 'Right, right!'],
    ammammas_thursday: ['Brass token No. 47', 'From the Hanuman Pindi Girni.'],
    the_clap: ['Golconda entry ticket', 'The fort heard us.'],
    drums_for_amma: ['A pressed neem leaf', 'Lashkar Bonalu morning.'],
    opening_day: ['Prasads ticket stub', '25 JUL 2003. A whale in Hyderabad.'],
    agle_baras: ['A packet of gulal', 'Tank Bund, immersion night.'],
    last_bell: ["Immu's slam-book page", 'Fav place: where you can see everything we collected at once.'],
    chand_raat: ['A passport photo of two boys laughing', 'And the Side A copy.'],
  };
  const LOCK = [
    { slot: 1, digit: 1, riddle: 'In the oldest garden a princess has slept two thousand years. How many princesses?', where: 'State Museum, Public Gardens', mission: 'last_man_batting' },
    { slot: 2, digit: 4, riddle: 'The tower that talks with half its faces: how many faces stay silent?', where: 'Mozamjahi Market', mission: 'lost_and_found' },
    { slot: 3, digit: 0, riddle: 'On the drum hill a white temple stands. How many bells?', where: 'Birla Mandir, Naubat Pahad', mission: 'last_bell' },
    { slot: 4, digit: 1, riddle: 'The man in the lake: how many stones is he made of?', where: 'Buddha statue, Hussain Sagar', mission: 'agle_baras' },
  ];
  const DEFINITIONS = [
    ['very old style, like my RX100.', 'Bunty-anna, Ameerpet Java batch'],
    ['chai gone cold because you were talking.', 'Faramarz uncle'],
    ['old things getting costly.', 'Agarwal-ji'],
    ['when the roads had less traffic.', 'Havaldar Pochaiah'],
    ["a sweet? It's not a sweet? Then I don't want it.", 'Chitti, age 6'],
    ['pain for home. (Greek!)', 'Bunty-anna, finally right'],
    ['gnapakalu: memories that come in without knocking.', 'Ammamma'],
    ['yaadon ki meethi chubhan, the sweet sting of memories.', "Vimala Ma'am, in red ink"],
    ['taking your city in your pocket.', 'Agent Immu'],
    ['a tape, a tin, and a clap that comes back.', 'K. {full}, age 34'],
  ];
  // bible §9.4, verbatim. [kind, text]: h = heading, s = sub, p = line, gap
  const CREDITS = [
    ['logo', 'NOSTALGIA'], ['s', 'a Hyderabad story on one cassette'], ['gap'],
    ['h', 'SIDE A — HYDERABAD 2003'],
    ['p', 'Story, places and people of a city that kept every kite.'],
    ['p', 'Made by a team of AI agents for a 90s kid who grew up here.'], ['gap'],
    ['h', 'THE CAST'], ['s', '(in order of appearance)'],
    ['p', 'Chinnu · Nanna · Chitti · Amma · Immu · Ayesha · Bunty-anna · Salim-bhai · Yadagiri-anna'],
    ['p', 'Patang Chacha · Faramarz uncle · Ammi · Professor Pasha and Babloo · Havaldar Pochaiah'],
    ['p', "Cable Babji · Ticket Thatha · Nani · Ramulu · Agarwal-ji · Ammamma · Rasheed-saab · Vimala Ma'am"],
    ['p', 'Raj-uncle · Net-uncle · Bahadur · Lakshmamma · Tiger · and every aunty at every gate'], ['gap'],
    ['h', 'THE CITY'], ['s', '(in order of the tape)'],
    ['p', 'Lakshmi Nagar Colony · Gulzar Houz · Numaish · RTC X Roads · Public Gardens · Imlibun'],
    ['p', 'Hanuman Pindi Girni · Golconda · Lashkar · Prasads · Tank Bund · Naubat Pahad · Charminar'], ['gap'],
    ['h', 'MUSIC'],
    ['p', 'All music and sound made from scratch in the browser. No real songs were harmed.'], ['gap'],
    ['h', 'WITH THANKS'],
    ['p', 'To every Irani café that served one chai for two hours.'],
    ['p', "To every mother's chappal, which never once actually hit anybody."], ['gap'], ['gap'],
    ['end', 'Gurthunda?'],
  ];
  // The user's must-have places (design/places_registry.md): always drawn on the full map.
  const MUST = ('koti_bus_stand gokul_chat birla_mandir hussain_sagar buddha_statue prasads_imax ntr_gardens public_gardens lb_stadium ' +
    'rythu_bazaar_mehdipatnam rythu_bazaar_erragadda rythu_bazaar_saroornagar mozamjahi_market nampally_station kachiguda_station ' +
    'imlibun_bus_station assembly dilsukhnagar_sai_temple rtc_x_roads sandhya_theatre sudarshan_theatre odeon_theatre devi_theatre charminar ' +
    'nampally_exhibition paradise abids afzalgunj_bridge akkanna_madanna_temple all_india_radio alpha_hotel anand_theatre annapurna_studios ' +
    'apollo_hospital_jubilee_hills ashtalakshmi_temple badshahi_ashurkhana balkampet_yellamma_temple bapu_ghat barkas bawarchi begum_bazaar ' +
    'begumpet_airport birla_planetarium blue_sea_cafe bonalu cafe_bahar chaderghat_bridge chenoy_trade_centre chermas_abids chilkur_balaji ' +
    'chowmahalla_palace city_central_library city_college cyber_towers dargah_yousufain dhoolpet doordarshan_kendra durgam_cheruvu ' +
    'errum_manzil falaknuma_palace famous_ice_cream fateh_maidan film_nagar gachibowli_stadium gaddiannaram_fruit_market gandipet ' +
    'ganesh_immersion garden_cafe general_bazaar golconda_bala_hissar golconda_fateh_darwaza golconda_fort golconda_jagadamba_temple ' +
    'gowliguda_hangar grand_hotel_abids gulzar_houz gun_park gurudwara_gowliguda gymkhana_ground_secunderabad harina_vanasthali high_court ' +
    'hill_fort_palace himayat_sagar hitec_city hitex holy_trinity_church_bolarum hotel_madina hotel_nayaab hotel_niagara ' +
    'hussain_shah_wali_dargah hyderabad_public_school indira_park irani_cafe_1 iskcon_abids jama_masjid_charminar jawahar_bal_bhavan ' +
    'jntu_kukatpally jubilee_bus_station jubilee_hills_check_post karachi_bakery karmanghat_hanuman_temple katta_maisamma_temple kbr_park ' +
    'khairatabad_ganesh khairatabad_mosque king_kothi koti_book_bazaar koti_womens_college kphb_colony laad_bazaar lal_darwaza_temple ' +
    'liberty_theatre lower_tank_bund lumbini_park mahboob_chowk_clock_tower malakpet_race_course mecca_masjid mehdipatnam_bus_terminus ' +
    'mir_alam_tank monda_market moula_ali_dargah mrugavani_park musi_riverbed narayanguda_ymca naya_pul necklace_road nehru_zoo ' +
    'niloufer_cafe nimrah_cafe nims_hospital nizam_college nizams_museum osmania_hospital osmania_university paigah_tombs parade_grounds ' +
    'pathergatti peddamma_temple pista_house purana_pul qutb_shahi_tombs raj_bhavan ramakrishna_math ramakrishna_theatre ramanaidu_studios ' +
    'ramoji_film_city rashtrapati_nilayam rathifile_bus_station ravindra_bharathi salar_jung_museum sangeet_theatre sanjeevaiah_park ' +
    'sarathi_studios sarojini_devi_eye_hospital saroornagar_lake sarvi secretariat secunderabad_clock_tower secunderabad_club ' +
    'secunderabad_ganesh_temple secunderabad_station shadab_hotel shah_ghouse shankar_mutt_nallakunta shanti_theatre shilparamam ' +
    'shoppers_stop_begumpet spanish_mosque st_georges_church_abids st_johns_church_secunderabad st_josephs_cathedral state_central_library ' +
    'subhan_bakery sultan_bazaar taj_mahal_hotel_abids tank_bund taramati_baradari ujjaini_mahankali_temple university_of_hyderabad ' +
    'victory_playground home friend_home home_terrace bhramaramba_mallikarjuna_theatres').split(/\s+/);
  const MUST_SET = new Set(MUST);

  /* ============================================================ N.settings */
  const SET_KEY = 'nostalgia.settings.v1';
  const DEFAULTS = {
    textSpeed: 'normal', autoAdvance: false, captions: false,
    reducedMotion: 'auto', flashReduce: 'auto', vhs: 60,
    handed: 'right', btnSize: 'm',
    difficulty: 'normal', hintNudges: 'normal', assist: false, letImmu: true,
    colorBlind: 'off', highContrast: false,
    mapLayers: null, mapKinds: null, mapLegend: null,
  };
  const CHOICES = {
    textSpeed: ['slow', 'normal', 'fast', 'instant'], reducedMotion: ['auto', 'on', 'off'], flashReduce: ['auto', 'on', 'off'],
    handed: ['right', 'left'], btnSize: ['s', 'm', 'l'], difficulty: ['relaxed', 'normal', 'hard'], hintNudges: ['off', 'normal', 'fast'],
    colorBlind: ['off', 'deutan', 'protan', 'tritan'],
  };
  const TEXT_CPS = { slow: 25, normal: 45, fast: 90, instant: 0 };
  // systems §14.1 (multipliers, seconds, paise)
  const DIFFICULTY = {
    relaxed: { label: 'Aaram Se', blurb: 'Relaxed: slower chases, more time, softer fines.', pursuerSpeed: 0.85, sight: 0.8, unseenDrop: 9, chappalInterval: 8, homingTurn: 0.7, tummyDrain: 0.7, missionTimers: 1.25, cargoDamage: 0.75, minigameOffset: -0.15, caughtFine: 100, hintNudge: 0.6 },
    normal: { label: 'Normal', blurb: 'The year as it was.', pursuerSpeed: 1, sight: 1, unseenDrop: 12, chappalInterval: 6, homingTurn: 1, tummyDrain: 1, missionTimers: 1, cargoDamage: 1, minigameOffset: 0, caughtFine: 200, hintNudge: 1 },
    hard: { label: 'Full Meter', blurb: 'Hard: Mummy runs faster and sees further.', pursuerSpeed: 1.1, sight: 1.15, unseenDrop: 15, chappalInterval: 5, homingTurn: 1.2, tummyDrain: 1.2, missionTimers: 0.9, cargoDamage: 1.2, minigameOffset: 0.15, caughtFine: 300, hintNudge: 1.5 },
  };
  // N.settings.<key> also reads / writes each value directly (hud.js, storycore.js and missions.js
  // read N.settings.captions, .hintNudges, .letImmu, .difficulty as plain properties).
  const S = {
    DEFAULTS, CHOICES, DIFFICULTY, TEXT_CPS,
    values: Object.assign({}, DEFAULTS),
    get(k) { return k in S.values ? S.values[k] : DEFAULTS[k]; },
    set(k, v) {
      if (CHOICES[k] && CHOICES[k].indexOf(v) < 0) return false;
      if (typeof DEFAULTS[k] === 'boolean') v = !!v;
      if (typeof DEFAULTS[k] === 'number') { v = +v; if (!isFinite(v)) return false; v = U.clamp(v, 0, 100); }
      if (S.values[k] === v) return true;
      S.values[k] = v;
      saveSettings();
      applySettings();
      N.emit('settings:change', { key: k, value: v });
      return true;
    },
    reset() { S.values = Object.assign({}, DEFAULTS); saveSettings(); applySettings(); N.emit('settings:change', { key: '*', value: null }); },
    diff(key) { const d = DIFFICULTY[S.get('difficulty')] || DIFFICULTY.normal; return key ? d[key] : d; },
    textCps() { return TEXT_CPS[S.get('textSpeed')] == null ? 45 : TEXT_CPS[S.get('textSpeed')]; },
    vhsScale() { return U.clamp(S.get('vhs') / 60, 0, 1.67); },
    apply() { applySettings(); },
  };
  for (const k of Object.keys(DEFAULTS)) {
    Object.defineProperty(S, k, { get: () => S.get(k), set: (v) => { S.set(k, v); }, enumerable: true, configurable: true });
  }
  Object.defineProperty(S, 'hints', { get: () => S.get('hintNudges'), set: (v) => { S.set('hintNudges', v); }, configurable: true });
  (function adoptEarlier(prev) {
    if (!prev || typeof prev !== 'object') return;
    for (const k of Object.keys(prev)) if (k in DEFAULTS) { try { S.values[k] = prev[k]; } catch (e) { /* ignore */ } }
  })(N.settings);
  N.settings = S;
  (function loadSettings() {
    const raw = lsGet(SET_KEY);
    if (!raw) return;
    try {
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      for (const k in DEFAULTS) {
        if (!(k in o)) continue;
        const v = o[k];
        if (CHOICES[k]) { if (CHOICES[k].indexOf(v) >= 0) S.values[k] = v; }
        else if (typeof DEFAULTS[k] === 'boolean') S.values[k] = !!v;
        else if (typeof DEFAULTS[k] === 'number') { if (isFinite(+v)) S.values[k] = U.clamp(+v, 0, 100); }
        else if (v && typeof v === 'object') S.values[k] = v;
      }
    } catch (e) { /* bad blob: defaults */ }
  })();
  function saveSettings() { try { lsSet(SET_KEY, JSON.stringify(S.values)); } catch (e) { /* ignore */ } }
  let mqReduce = null;
  try { mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { /* ignore */ }
  function applySettings() {
    const b = document.body;
    if (!b) return;
    const v = S.values;
    const rm = v.reducedMotion === 'on' || (v.reducedMotion === 'auto' && !!(mqReduce && mqReduce.matches));
    b.classList.toggle('reduced-motion', rm);
    b.classList.toggle('flash-reduce', v.flashReduce === 'on' || (v.flashReduce === 'auto' && rm));
    b.classList.toggle('touch-left', v.handed === 'left');
    b.classList.toggle('tbtn-s', v.btnSize === 's');
    b.classList.toggle('tbtn-l', v.btnSize === 'l');
    b.classList.toggle('captions-on', !!v.captions);
    b.classList.toggle('high-contrast', !!v.highContrast);
    for (const m of CHOICES.colorBlind) b.classList.toggle('cb-' + m, v.colorBlind === m && m !== 'off');
    if (N.dialogue) {
      const cps = S.textCps();
      N.dialogue.textSpeed = cps ? cps / 46 : 60;
      N.dialogue.autoAdvance = !!v.autoAdvance;
    }
  }

  /* ============================================================ profile (names) */
  const PROFILE_KEY = 'nostalgia.profile.v1';
  const NAME_DEF = { nick: 'Chinnu', full: 'Srikanth' };
  const profile = { nick: NAME_DEF.nick, full: NAME_DEF.full };
  (function loadProfile() {
    const raw = lsGet(PROFILE_KEY);
    if (!raw) return;
    try { const o = JSON.parse(raw); if (o) { profile.nick = cleanName(o.nick, 12) || profile.nick; profile.full = cleanName(o.full, 20) || profile.full; } } catch (e) { /* defaults */ }
  })();
  function cleanName(s, max) {
    s = String(s == null ? '' : s).replace(/[^\p{L}\p{M} ]/gu, '').replace(/\s+/g, ' ').trim();
    let out = '', n = 0;
    for (const ch of s) { if (n >= max) break; out += ch; n++; }
    out = out.trim();
    return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
  }
  function applyNames() {
    const p = N.player;
    if (p) { p.name = profile.nick; p.nick = profile.nick; p.full = profile.full; p.fullName = profile.full; }
  }
  function setNames(nick, full) {
    profile.nick = cleanName(nick, 12) || NAME_DEF.nick;
    profile.full = cleanName(full, 20) || NAME_DEF.full;
    lsSet(PROFILE_KEY, JSON.stringify(profile));
    applyNames();
    let told = false;
    try { if (N.dialogue && typeof N.dialogue.setNames === 'function') { N.dialogue.setNames({ nick: profile.nick, full: profile.full }); told = true; } } catch (e) { N.err('menus.setNames', e); }
    if (!told) N.emit('names:change', { nick: profile.nick, full: profile.full });
    return { nick: profile.nick, full: profile.full };
  }
  function subst(text) {
    // dialogue.js applies the bible's global rename rule too ("Chinnu" -> nickname)
    try { if (N.dialogue && typeof N.dialogue.filter === 'function') return N.dialogue.filter(String(text == null ? '' : text)); } catch (e) { /* fall back */ }
    return String(text == null ? '' : text)
      .replace(/\{nick\}/g, profile.nick).replace(/\{NICK\}/g, profile.nick.toUpperCase())
      .replace(/\{full\}/g, profile.full).replace(/\{FULL\}/g, profile.full.toUpperCase());
  }

  /* ============================================================ panel manager */
  // Every menu screen is a `.screen.mn-screen` in #overlay; `stack` holds the open ones (top = last).
  const panels = Object.create(null);
  const stack = [];
  function definePanel(id, def) { def.id = id; def.el = null; panels[id] = def; return def; }
  const isShown = (id) => stack.indexOf(id) >= 0;
  const topPanel = () => (stack.length ? panels[stack[stack.length - 1]] : null);
  function ensureBuilt(P) { if (!P.el) { P.build(); P.el.addEventListener('pointerover', onHover); } return P; }
  function openPanel(id, opts) {
    const P = panels[id];
    if (!P) return null;
    ensureBuilt(P);
    const under = topPanel();
    if (under && under !== P) under.lastFocus = document.activeElement;
    const i = stack.indexOf(id);
    if (i >= 0) stack.splice(i, 1);
    stack.push(id);
    P.opts = opts || {};
    P.el.classList.add('show');
    document.body.classList.add('mn-open');
    try { if (P.onOpen) P.onOpen(P.opts); } catch (e) { N.err('menus.open:' + id, e); }
    if (!P.noAutoFocus) focusFirst(P);
    return P;
  }
  function closePanel(id) {
    const P = panels[id];
    const i = stack.indexOf(id);
    if (!P || i < 0) return false;
    const wasTop = i === stack.length - 1;
    stack.splice(i, 1);
    if (P.el) P.el.classList.remove('show');
    try { if (P.onClose) P.onClose(); } catch (e) { N.err('menus.close:' + id, e); }
    if (!stack.length) { document.body.classList.remove('mn-open'); blurActive(); }
    else if (wasTop) {
      const T = topPanel();
      if (T.lastFocus && T.el.contains(T.lastFocus) && T.lastFocus.offsetParent !== null) focusEl(T.lastFocus); else focusFirst(T);
      try { if (T.onReveal) T.onReveal(); } catch (e) { N.err('menus.reveal:' + T.id, e); }
    }
    return true;
  }
  function closeAllPanels() { while (stack.length) closePanel(stack[stack.length - 1]); }
  function navItems(P) {
    if (!P || !P.el) return [];
    return Array.from(P.el.querySelectorAll('[data-nav]')).filter((e) => !e.disabled && e.offsetParent !== null && !e.closest('[hidden]'));
  }
  function focusFirst(P) {
    const items = navItems(P);
    focusEl(items.find((e) => e.hasAttribute('data-def')) || items[0]);
  }
  function focusMove(P, d) {
    const items = navItems(P);
    if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    i = i < 0 ? (d > 0 ? 0 : items.length - 1) : (i + d + items.length) % items.length;
    focusEl(items[i]);
    if (items[i].scrollIntoView) { try { items[i].scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
    sfx('ui_click');
  }
  function onHover(e) {
    if (e.pointerType !== 'mouse') return;
    const t = e.target.closest && e.target.closest('[data-nav]');
    if (t && !t.disabled && document.activeElement !== t && !isTextInput(document.activeElement)) focusEl(t);
  }
  function activateFocused(P) {
    const a = document.activeElement;
    if (!a || !P.el.contains(a)) { focusFirst(P); return true; }
    if (a.hasAttribute('data-adjust') && P.adjust) { P.adjust(a, 0); return true; }
    if (isTextInput(a)) return false;
    if (a.click) a.click();
    return true;
  }
  function defaultNav(P, k, e) {
    switch (k) {
      case 'up': focusMove(P, -1); return true;
      case 'down': focusMove(P, 1); return true;
      case 'left': case 'right': {
        const a = document.activeElement;
        if (a && a.hasAttribute('data-adjust') && P.adjust) { P.adjust(a, k === 'left' ? -1 : 1); return true; }
        if (P.horizontal) { focusMove(P, k === 'left' ? -1 : 1); return true; }
        return false;
      }
      case 'ok': if (e && e.repeat) return true; return activateFocused(P);
      case 'back': if (e && e.repeat) return true; sfx('ui_back'); if (P.back) P.back(); else closePanel(P.id); return true;
      default: return false;
    }
  }
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', KeyE: 'ok', KeyF: 'ok', Escape: 'back', KeyP: 'back', KeyM: 'map', KeyJ: 'journal',
    KeyQ: 'prev', PageUp: 'pgup', PageDown: 'pgdn', Equal: 'zin', NumpadAdd: 'zin', Minus: 'zout', NumpadSubtract: 'zout', Digit0: 'home', Home: 'home', KeyL: 'legend',
  };
  const TYPING_KEYS = { Enter: 'ok', NumpadEnter: 'ok', Escape: 'back', ArrowUp: 'up', ArrowDown: 'down', Tab: null };
  // Capture phase: menus see keys before input.js; handled keys never reach the game.
  function onKeyDown(e) {
    const P = topPanel();
    if (!P || N.state.mode === 'minigame') return;
    const typing = isTextInput(e.target);
    const k = typing ? (TYPING_KEYS[e.code] || null) : (KEYS[e.code] || null);
    if (!k && !P.rawKeys) return;
    let handled = false;
    try {
      if (P.onKey) handled = P.onKey(k, e, typing) === true;
      if (!handled && k) handled = defaultNav(P, k, e);
    } catch (err) { N.err('menus.key', err); }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  function onKeyUp(e) {
    const P = topPanel();
    if (P && P.onKeyUp) { try { if (P.onKeyUp(KEYS[e.code] || null, e)) { e.preventDefault(); } } catch (err) { N.err('menus.keyup', err); } }
  }
  // Gamepad / synthetic input (N.input.press) drives the same navigation.
  const padNavState = { y: 0, x: 0 };
  function padNav(P) {
    const I = N.input;
    if (!I) return;
    const my = I.move.y, mx = I.move.x;
    const sy = my < -0.6 ? -1 : my > 0.6 ? 1 : 0, sx = mx < -0.6 ? -1 : mx > 0.6 ? 1 : 0;
    const stickUp = sy === -1 && padNavState.y !== -1, stickDown = sy === 1 && padNavState.y !== 1;
    const stickL = sx === -1 && padNavState.x !== -1, stickR = sx === 1 && padNavState.x !== 1;
    padNavState.y = sy; padNavState.x = sx;
    const fire = (k) => { try { if (!(P.onKey && P.onKey(k, null, false) === true)) defaultNav(P, k, null); } catch (err) { N.err('menus.pad', err); } };
    if (P.padMove) P.padMove(I); // the map pans with the stick / d-pad itself
    if (!P.noDirNav) {
      if (I.pressed('up') || (stickUp && I.analog)) { I.consume('up'); fire('up'); }
      if (I.pressed('down') || (stickDown && I.analog)) { I.consume('down'); fire('down'); }
      if (I.pressed('left') || (stickL && I.analog)) { I.consume('left'); fire('left'); }
      if (I.pressed('right') || (stickR && I.analog)) { I.consume('right'); fire('right'); }
    }
    if (I.pressed('action')) { I.consume('action'); fire('ok'); }
    if (I.pressed('pause')) { I.consume('pause'); fire('back'); }
    if (I.pressed('map')) { I.consume('map'); fire('map'); }
    if (I.pressed('journal')) { I.consume('journal'); fire('journal'); }
    if (I.pressed('run')) { I.consume('run'); fire('zin'); }
    if (I.pressed('horn')) { I.consume('horn'); fire('zout'); }
  }

  /* ============================================================ shared art */
  const CASSETTE_SVG =
    '<svg class="cas" viewBox="0 0 120 76" aria-hidden="true">' +
    '<rect class="cas-shell" x="1.5" y="1.5" width="117" height="73" rx="6"/>' +
    '<rect class="cas-label" x="9" y="6" width="102" height="44" rx="3"/>' +
    '<rect class="cas-stripe" x="9" y="6" width="102" height="8" rx="2"/>' +
    '<rect class="cas-stripe2" x="9" y="40" width="102" height="4"/>' +
    '<text class="cas-a" x="13" y="12.6">A</text><text class="cas-c90" x="96" y="12.6">C-90</text>' +
    '<path class="cas-ink" d="M16 19.5 Q40 17 60 19 T104 18.5"/>' +
    '<rect class="cas-window" x="30" y="22" width="60" height="16" rx="8"/>' +
    '<g transform="translate(42 30)"><circle class="cas-tape" r="9.5"/><g class="reel"><circle class="cas-hub" r="5"/>' +
    '<path class="cas-teeth" d="M0 -5V-2.6M0 5V2.6M-4.3 -2.5L-2.3 -1.3M4.3 2.5L2.3 1.3M-4.3 2.5L-2.3 1.3M4.3 -2.5L2.3 -1.3"/></g></g>' +
    '<g transform="translate(78 30)"><circle class="cas-tape" r="6"/><g class="reel"><circle class="cas-hub" r="5"/>' +
    '<path class="cas-teeth" d="M0 -5V-2.6M0 5V2.6M-4.3 -2.5L-2.3 -1.3M4.3 2.5L2.3 1.3M-4.3 2.5L-2.3 1.3M4.3 -2.5L2.3 -1.3"/></g></g>' +
    '<path class="cas-bottom" d="M22 74.5 L28 57 H92 L98 74.5"/>' +
    '<circle class="cas-hole" cx="38" cy="66" r="2.6"/><circle class="cas-hole" cx="82" cy="66" r="2.6"/>' +
    '<circle class="cas-screw" cx="6" cy="6" r="1.6"/><circle class="cas-screw" cx="114" cy="6" r="1.6"/>' +
    '<circle class="cas-screw" cx="6" cy="70" r="1.6"/><circle class="cas-screw" cx="114" cy="70" r="1.6"/></svg>';

  function tapeCounter() {
    const T = N.tape;
    const c = T && isFinite(T.counter) ? T.counter : null;
    if (c != null) return c;
    let best = 0;
    for (const t of TRACKS) if (missionDone(t.id)) best = Math.max(best, t.counter);
    return best;
  }
  function missionDone(id) {
    try { if (N.missions && N.missions.isDone && N.missions.isDone(id)) return true; } catch (e) { /* ignore */ }
    return !!(N.flags && (N.flags['done_' + id] || N.flags[id + '_done']));
  }
  function unlockAudio() { try { if (N.audio && N.audio.unlock) N.audio.unlock(); } catch (e) { N.err('audio.unlock', e); } }

  /* ============================================================ title */
  const title = definePanel('title', {
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-title', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Nostalgia — title');
      e.innerHTML =
        '<div class="mn-vcr" aria-hidden="true">' +
        '<div class="vcr-l"><b class="vcr-st">■ STOP</b><span class="vcr-tm">--:--</span></div>' +
        '<div class="vcr-r"><span class="vcr-sp">SP</span><span class="vcr-cl">COUNTER</span><b class="vcr-ctr">000</b></div></div>' +
        '<div class="mn-tw"><div class="jc">' +
        '<div class="jc-spine" aria-hidden="true"><span class="sp-a">SIDE A · HYDERABAD 2003</span><span class="sp-t">NOSTALGIA</span><span class="sp-b">SIDE B · 2026</span></div>' +
        '<div class="jc-front">' +
        '<div class="jc-print" aria-hidden="true"><span>C-90 · 45 MIN EACH SIDE</span><span>NORMAL POSITION · TYPE I</span></div>' +
        CASSETTE_SVG +
        '<h1 class="jc-title" aria-label="Nostalgia">' + kidCaps('NOSTALGIA', 'jc-title') + '</h1>' +
        '<p class="jc-tag">a Hyderabad story on one cassette</p>' +
        '<div class="jc-sides"><span><b>SIDE A:</b> HYDERABAD 2003</span><span><b>SIDE B:</b> 2026</span></div>' +
        '<ol class="jc-tracks">' +
        '<li><button type="button" id="title-start" class="jc-trk" data-nav data-def data-act="play"><i>▶</i><b>PLAY</b><em>new game</em></button></li>' +
        '<li class="trk-cont"><button type="button" class="jc-trk" data-nav data-act="continue"><i>▶▶</i><b>CONTINUE</b><em class="cont-sub"></em></button></li>' +
        '<li class="trk-load"><button type="button" class="jc-trk" data-nav data-act="load"><i>⏏</i><b>OTHER TAPE</b><em class="load-sub"></em></button></li>' +
        '<li class="trk-view" hidden><button type="button" class="jc-trk" data-nav data-act="view"><i>◫</i><b>VIEW</b><em class="view-sub"></em></button></li>' +
        '<li><button type="button" class="jc-trk" data-nav data-act="settings"><i>≡</i><b>SETTINGS</b><em>sound · text · touch</em></button></li>' +
        '<li><button type="button" class="jc-trk" data-nav data-act="credits"><i>♪</i><b>CREDITS</b><em>who made this tape</em></button></li>' +
        '</ol>' +
        '<div class="jc-confirm" hidden><p>Record over Side A? <span>Your saved game will be replaced.</span></p>' +
        '<div class="jc-cbtns"><button type="button" class="mn-btn" data-nav data-def data-act="overwrite">● Yes, record</button>' +
        '<button type="button" class="mn-btn alt" data-nav data-act="nooverwrite">No</button></div></div>' +
        '<p class="jc-scribble" aria-hidden="true">Gurthunda?</p>' +
        '</div></div></div>' +
        '<p class="mn-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> choose &nbsp; <kbd>Enter</kbd> / <kbd>E</kbd> play</p>';
      this.dom = {
        st: e.querySelector('.vcr-st'), tm: e.querySelector('.vcr-tm'), ctr: e.querySelector('.vcr-ctr'),
        cont: e.querySelector('.trk-cont'), contSub: e.querySelector('.cont-sub'), load: e.querySelector('.trk-load'), loadSub: e.querySelector('.load-sub'),
        confirm: e.querySelector('.jc-confirm'), tracks: e.querySelector('.jc-tracks'), cas: e.querySelector('.cas'), jc: e.querySelector('.jc'),
        view: e.querySelector('.trk-view'), viewSub: e.querySelector('.view-sub'),
      };
      e.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-act]');
        if (!b || !isShown('title')) return;
        titleAct(b.dataset.act);
      });
    },
    onOpen() {
      this.refresh();
      this.dom.confirm.hidden = true;
      this.dom.tracks.hidden = false;
      this.dom.st.textContent = '■ STOP';
      this.dom.tm.textContent = '--:--';
      this.dom.ctr.textContent = '000';
      this.dom.jc.classList.remove('rolling');
    },
    onReveal() { this.refresh(); },
    refresh() {
      const info = latestInfo();
      this.dom.cont.hidden = !info;
      if (info) this.dom.contSub.textContent = saveLine(info);
      const man = manualInfo();
      this.dom.load.hidden = !(man && info && man.t !== info.t);
      if (man) this.dom.loadSub.textContent = saveLine(man);
      const V = N.view, hasView = !!(V && (typeof V.cycle === 'function' || typeof V.set === 'function'));
      this.dom.view.hidden = !hasView;
      const vm = V && (V.want || V.mode);
      this.dom.tracks.classList.toggle('many', Array.from(this.dom.tracks.children).filter((li) => !li.hidden).length >= 5);
      // a save from a newer build is never overwritten (save.js): say so before they play
      const newer = N.save && N.save.tooNew;
      let nn = this.el.querySelector('.jc-newer');
      if (newer && !nn) { nn = el('p', 'jc-newer', null); nn.setAttribute('role', 'note'); this.dom.tracks.after(nn); }
      if (nn) { nn.hidden = !newer; nn.textContent = newer ? N.save.NEWER_MSG : ''; }
      if (hasView) this.dom.viewSub.textContent = (V.loading ? 'loading 3D… ' : '') + (({ top: 'top-down', tps: '3D · third person', fps: 'first person' })[vm] || String(vm || 'top-down'));
    },
    back() {
      if (!this.dom.confirm.hidden) { this.dom.confirm.hidden = true; this.dom.tracks.hidden = false; focusFirst(this); }
    },
  });
  function saveLine(info) {
    const track = Math.min(12, Math.max(1, (info.missions | 0) + 1));
    return 'TRACK ' + pad2(track) + ' · ' + (info.date || '') + (info.money != null ? ' · ' + rupees(info.money) : '');
  }
  function titleAct(act) {
    const D = title.dom;
    if (act === 'play') {
      unlockAudio();
      sfx('tape_click');
      if (!M.quickStart && latestInfo()) {
        D.tracks.hidden = true; D.confirm.hidden = false; focusFirst(title);
        return;
      }
      beginNewGame();
    } else if (act === 'overwrite') { unlockAudio(); D.confirm.hidden = true; D.tracks.hidden = false; beginNewGame(); }
    else if (act === 'nooverwrite') { sfx('ui_back'); title.back(); }
    else if (act === 'continue') {
      unlockAudio();
      sfx('tape_click');
      continueLatest();
    } else if (act === 'load') { unlockAudio(); sfx('ui_select'); openPanel('slots', { from: 'title' }); }
    else if (act === 'settings') { unlockAudio(); sfx('ui_select'); openPanel('settings', { from: 'title' }); }
    else if (act === 'view') {
      sfx('ui_select');
      try { const V = N.view; if (typeof V.cycle === 'function') V.cycle(); else V.set(({ top: 'tps', tps: 'fps', fps: 'top' })[V.mode] || 'top'); } catch (e) { N.err('menus.view', e); }
      title.refresh();
    }
    else if (act === 'credits') { unlockAudio(); sfx('ui_select'); M.credits({ fromTitle: true }); }
  }
  let starting = false;
  function beginNewGame() {
    if (starting) return;
    const D = title.dom;
    D.st.textContent = '▶ PLAY'; D.tm.textContent = '00:00';
    D.jc.classList.add('rolling');
    if (M.quickStart) { startNow(); return; }
    starting = true;
    M.nameEntry({}).then((r) => {
      starting = false;
      if (!r) { D.st.textContent = '■ STOP'; D.tm.textContent = '--:--'; D.jc.classList.remove('rolling'); return; }
      startNow();
    });
  }
  function startNow() {
    try { N.game.newGame({ skipIntro: false }); } catch (e) { N.err('menus.newGame', e); }
  }
  function continueLatest() {
    let ok = false;
    try { ok = N.game.continueGame(); } catch (e) { N.err('menus.continue', e); }
    if (ok) M.osdCard('▶ PLAY', { sub: N.clock.dateLabel() + '  ' + N.clock.label(), ms: 1500 });
    return ok;
  }

  // Attract camera: Charminar at dusk, drifting slowly behind the J-card.
  const attract = { on: false, t: 0, x: 3900, y: 4360 };
  function startAttract() {
    const lm = (N.WORLD_DATA && N.WORLD_DATA.landmarks || []).find((l) => l.id === 'charminar');
    const sp = N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.title;
    if (lm) { attract.x = lm.x; attract.y = lm.y; } else if (sp) { attract.x = sp[0]; attract.y = sp[1]; }
    attract.on = true; attract.t = 0;
    try {
      N.clock.set(18, 38);
      N.render.fx.vhs = 0; N.render.fx.fade = 0;
      N.render.camOverride = Object.assign(attractTarget(), { snap: true });
      N.render.warmChunks(attract.x, attract.y, 560);
    } catch (e) { N.err('menus.attract', e); }
  }
  function attractTarget() {
    const R = N.render, w = window.innerWidth || 1, h = window.innerHeight || 1;
    const wide = w >= h * 1.15;
    const zoom = wide ? (h < 500 ? 0.8 : 0.82) : 0.92;
    const vw = (R.W || 640) / zoom, vh = (R.H || 360) / zoom;
    const m = reduced() ? 0 : 1, t = attract.t;
    // wide screens: Charminar right of the J-card; tall screens: above it
    const ox = wide ? -vw * 0.21 : 0, oy = wide ? vh * 0.02 : vh * 0.27;
    return { x: attract.x + ox + Math.sin(t * 0.06) * 34 * m, y: attract.y + oy + Math.sin(t * 0.045 + 1) * 22 * m, zoom: zoom + Math.sin(t * 0.03) * 0.03 * m, rate: 1.2 };
  }
  function updateAttract(dt) {
    if (!attract.on) return;
    attract.t += dt;
    const o = N.render.camOverride;
    const tg = attractTarget();
    if (o && !o.cs) { o.x = tg.x; o.y = tg.y; o.zoom = tg.zoom; o.rate = 1.2; o.snap = false; }
    else if (!o) N.render.camOverride = tg;
  }
  function stopAttract() {
    if (!attract.on) return;
    attract.on = false;
    if (N.render.camOverride && !N.render.camOverride.cs) N.render.camOverride = null;
  }

  /* ============================================================ name card */
  let nameResolve = null;
  const nameCard = definePanel('name', {
    noAutoFocus: true,
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-name scroll', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Your name');
      e.innerHTML =
        '<form class="nc" autocomplete="off" novalidate>' +
        '<div class="nc-head"><span class="nc-school">LAKSHMI NAGAR COLONY · CLASS VI-B</span><span class="nc-rec">● REC</span></div>' +
        '<h2 class="nc-title">Who is on this tape?</h2>' +
        '<label class="nc-row"><span class="nc-q">Your name in the colony</span>' +
        '<span class="nc-line"><input class="nc-in nc-nick" data-nav type="text" name="nick" maxlength="12" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="next" inputmode="text" placeholder="Chinnu" aria-describedby="nc-h1"></span>' +
        '<small id="nc-h1" class="nc-help">What Ammamma calls you. Letters only, 12 max.</small></label>' +
        '<label class="nc-row"><span class="nc-q">Your name on the exam paper</span>' +
        '<span class="nc-line"><b class="nc-k" aria-hidden="true">K.</b><input class="nc-in nc-full" data-nav type="text" name="full" maxlength="20" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" inputmode="text" placeholder="Srikanth" aria-describedby="nc-h2"></span>' +
        '<small id="nc-h2" class="nc-help">The one Vimala Ma&#39;am writes. The initial K. stays.</small></label>' +
        '<p class="nc-preview"></p>' +
        '<div class="nc-btns"><button type="button" class="mn-btn alt" data-nav data-act="back">◀ Back</button>' +
        '<button type="submit" class="mn-btn" data-nav data-act="start">▶ START</button></div>' +
        '</form>';
      const f = e.querySelector('form');
      this.dom = { form: f, nick: e.querySelector('.nc-nick'), full: e.querySelector('.nc-full'), preview: e.querySelector('.nc-preview') };
      const live = (inp, max) => () => {
        const v = inp.value, c = v.replace(/[^\p{L}\p{M} ]/gu, '').replace(/ {2,}/g, ' ');
        let o = '', n = 0;
        for (const ch of c) { if (n >= max) break; o += ch; n++; }
        if (o !== v) inp.value = o;
        this.preview();
      };
      this.dom.nick.addEventListener('input', live(this.dom.nick, 12));
      this.dom.full.addEventListener('input', live(this.dom.full, 20));
      f.addEventListener('submit', (ev) => { ev.preventDefault(); this.submit(); });
      e.querySelector('[data-act=back]').addEventListener('click', () => { sfx('ui_back'); this.back(); });
    },
    preview() {
      const nick = cleanName(this.dom.nick.value, 12) || NAME_DEF.nick, full = cleanName(this.dom.full.value, 20) || NAME_DEF.full;
      this.dom.preview.innerHTML = 'Ammamma calls you <b>' + esc(nick) + '</b>. Mummy shouts <b class="nc-shout">' + esc(full.toUpperCase()) + '!</b>';
    },
    onOpen(o) {
      this.dom.nick.value = cleanName(o.nick, 12) || profile.nick;
      this.dom.full.value = cleanName(o.full, 20) || profile.full;
      this.preview();
      focusEl(this.dom.nick);
      try { this.dom.nick.select(); } catch (e) { /* ignore */ }
    },
    onKey(k, e) {
      const a = document.activeElement;
      if (k === 'ok' && a === this.dom.nick) { focusEl(this.dom.full); try { this.dom.full.select(); } catch (err) { /* ignore */ } return true; }
      if (k === 'ok' && a === this.dom.full) { this.submit(); return true; }
      void e;
      return false;
    },
    submit() {
      const r = setNames(this.dom.nick.value, this.dom.full.value);
      sfx('rec');
      blurActive();
      const res = nameResolve; nameResolve = null; // take it before onClose() would resolve it with null
      closePanel('name');
      if (res) res(r);
    },
    back() {
      blurActive();
      const res = nameResolve; nameResolve = null;
      closePanel('name');
      if (res) res(null);
    },
    onClose() { const res = nameResolve; nameResolve = null; if (res) res(null); },
  });
  void nameCard;

  /* ============================================================ saving */
  const MANUAL_KEY = 'nostalgia.save.v1.manual';
  let manualMem = null, lastSaveT = 0;
  function parseBlob(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try { const o = JSON.parse(raw); return o && o.game === 'nostalgia' && !(o.v > ((N.save && N.save.VERSION) || 1)) && o.data && typeof o.data === 'object' ? o : null; } catch (e) { return null; }
  }
  function latestInfo() { try { return N.save && N.save.has && N.save.has() ? N.save.info() : null; } catch (e) { return null; } }
  function manualRaw() { return lsOK() ? lsGet(MANUAL_KEY) : manualMem; }
  function manualInfo() { const b = parseBlob(manualRaw()); return b ? Object.assign({ t: b.t }, b.meta || {}) : null; }
  function baseMode() {
    const st = N.state.stack || [N.state.mode];
    for (let i = st.length - 1; i >= 0; i--) if (st[i] !== 'paused' && st[i] !== 'map' && st[i] !== 'journal') return st[i];
    return N.state.mode;
  }
  function canSave() {
    if (!N.save || !N.save.save) return { ok: false, reason: 'Saving is not ready yet.' };
    const bm = baseMode();
    if (bm === 'title' || bm === 'boot') return { ok: false, reason: 'Start a game first.' };
    if (N.save.tooNew) return { ok: false, reason: 'A newer version of the game saved here. Update it to save.' };
    if (N.state.has('cutscene') || cs.active) return { ok: false, reason: 'Not during a scene. The tape is rolling.' };
    if (N.state.has('minigame') || (N.minigames && N.minigames.active)) return { ok: false, reason: 'Finish the game first.' };
    if (N.state.has('dialogue') || (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen())) return { ok: false, reason: 'Finish the conversation first.' };
    if (N.missions && N.missions.active) return { ok: false, reason: 'Save at a booth or finish the mission first.' };
    if (N.wanted && (N.wanted.level | 0) >= 3) return { ok: false, reason: 'Mummy is right behind you! Lose the Chappal Meter first.' };
    if (N.flags && N.flags.no_save) return { ok: false, reason: 'Not now. The tape is rolling.' };
    return { ok: true, reason: '' };
  }
  function saveManual() {
    const c = canSave();
    if (!c.ok) return false;
    let ok = false;
    try { ok = N.save.save({ reason: 'manual' }); } catch (e) { N.err('menus.save', e); }
    if (ok) {
      const raw = N.save._raw ? N.save._raw() : null;
      if (raw) { if (lsOK()) { if (!lsSet(MANUAL_KEY, raw)) manualMem = raw; } else manualMem = raw; }
    }
    return ok;
  }
  function loadSlot(slot) {
    if (slot !== 'manual') return continueLatest();
    const raw = manualRaw();
    if (!parseBlob(raw)) return false;
    if (!lsOK()) return false; // memory-only: N.save holds one slot
    const KEY = (N.save && N.save.KEY) || 'nostalgia.save.v1';
    const prev = lsGet(KEY);
    let ok = false;
    try {
      lsSet(KEY, raw);
      ok = N.game.continueGame();
    } catch (e) { N.err('menus.loadManual', e); } finally {
      if (prev != null) lsSet(KEY, prev); else lsDel(KEY);
    }
    if (ok) M.osdCard('▶ PLAY', { sub: N.clock.dateLabel() + '  ' + N.clock.label(), ms: 1500 });
    return ok;
  }
  N.on('save', (d) => { if (d && d.ok) lastSaveT = Date.now(); });
  N.on('save:loaded', () => { const i = latestInfo(); lastSaveT = (i && i.t) || Date.now(); });
  N.on('game:new', () => { lastSaveT = 0; });

  /* ============================================================ pause (cassette deck) */
  const pause = definePanel('pause', {
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-pause pause-screen', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Paused');
      e.innerHTML =
        '<div class="dk">' +
        '<div class="dk-top"><span class="dk-brand">STEREO RADIO CASSETTE RECORDER</span><span class="dk-model">2-IN-1 · AUTO STOP</span><i class="dk-led"></i></div>' +
        '<div class="dk-body">' +
        '<div class="dk-grille l" aria-hidden="true"></div>' +
        '<div class="dk-mid">' +
        '<div class="dk-window"><div class="dk-osd"><b>❚❚ PAUSE</b><span class="dk-date"></span><span class="dk-time"></span></div>' +
        CASSETTE_SVG +
        '<div class="dk-info"><span class="dk-ctr"></span><span class="dk-where"></span></div><p class="dk-obj"></p></div>' +
        '<div class="dk-keys">' +
        '<button type="button" class="dk-key" data-nav data-def data-act="resume"><i>▶</i><b>Resume</b></button>' +
        '<button type="button" class="dk-key" data-nav data-act="map"><i>⌖</i><b>Map</b></button>' +
        '<button type="button" class="dk-key" data-nav data-act="journal"><i>✎</i><b>Journal</b></button>' +
        '<button type="button" class="dk-key" data-nav data-act="settings"><i>≡</i><b>Settings</b></button>' +
        '<button type="button" class="dk-key k-save" data-nav data-act="save"><i>●</i><b>Save</b><small class="why"></small></button>' +
        '<button type="button" class="dk-key" data-nav data-act="load"><i>⏏</i><b>Load</b></button>' +
        '<button type="button" class="dk-key k-qm" data-nav data-act="quitmission"><i>■</i><b>Quit mission</b></button>' +
        '<button type="button" class="dk-key k-quit" data-nav data-act="quit"><i>⏏</i><b>Quit to title</b></button>' +
        '</div>' +
        '<div class="dk-confirm" hidden><p class="dk-cq"></p><div class="dk-cbtns">' +
        '<button type="button" class="mn-btn" data-nav data-act="savequit">● Save &amp; quit</button>' +
        '<button type="button" class="mn-btn alt" data-nav data-act="quitnow">Quit</button>' +
        '<button type="button" class="mn-btn alt" data-nav data-def data-act="stay">Stay</button></div></div>' +
        '</div>' +
        '<div class="dk-grille r" aria-hidden="true"></div>' +
        '</div></div>';
      const q = (s) => e.querySelector(s);
      this.dom = {
        date: q('.dk-date'), time: q('.dk-time'), ctr: q('.dk-ctr'), where: q('.dk-where'), obj: q('.dk-obj'),
        save: q('.k-save'), why: q('.k-save .why'), qm: q('.k-qm'), keys: q('.dk-keys'), confirm: q('.dk-confirm'), cq: q('.dk-cq'),
        saveQuit: q('[data-act=savequit]'),
      };
      e.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-act]');
        if (b && isShown('pause') && topPanel() === this) pauseAct(b.dataset.act, b);
      });
    },
    onOpen() { this.refresh(); this.showConfirm(false); },
    onReveal() { this.refresh(); },
    refresh() {
      const D = this.dom;
      D.date.textContent = N.clock.dateLabel();
      D.time.textContent = N.clock.label();
      const side = (N.tape && N.tape.side) || 'A';
      D.ctr.textContent = 'SIDE ' + side + ' ' + pad3(tapeCounter());
      let where = '';
      try { const d = N.world.built ? N.world.districtAt(N.player.x, N.player.y) : null; where = d ? d.name : ''; } catch (e) { /* ignore */ }
      D.where.textContent = where;
      const obj = N.hud && N.hud.objectiveText;
      D.obj.textContent = obj ? '“' + obj + '”' : '';
      D.obj.hidden = !obj;
      const c = canSave();
      D.save.disabled = false;
      D.save.classList.toggle('off', !c.ok);
      D.save.setAttribute('aria-disabled', c.ok ? 'false' : 'true');
      D.why.textContent = c.ok ? (lastSaveT ? 'last saved ' + agoText(lastSaveT) : 'not saved yet') : c.reason;
      D.qm.hidden = !(N.missions && N.missions.active);
      D.saveQuit.hidden = !c.ok;
    },
    showConfirm(on) {
      const D = this.dom;
      D.confirm.hidden = !on; D.keys.hidden = !!on;
      if (on) {
        D.cq.innerHTML = 'Quit to the title? <span>' + (lastSaveT ? 'Last saved ' + esc(agoText(lastSaveT)) + '.' : 'Nothing saved yet this time.') + '</span>';
        focusFirst(this);
      }
    },
    back() {
      if (!this.dom.confirm.hidden) { this.showConfirm(false); focusEl(this.el.querySelector('[data-act=quit]')); return; }
      M.resume();
    },
  });
  function pauseAct(act, btn) {
    const P = pause;
    if (act === 'resume') { sfx('ui_back'); M.resume(); }
    else if (act === 'map') { sfx('ui_select'); M.openMap(); }
    else if (act === 'journal') { sfx('ui_select'); M.openJournal(); }
    else if (act === 'settings') { sfx('ui_select'); openPanel('settings', { from: 'pause' }); }
    else if (act === 'load') { sfx('ui_select'); openPanel('slots', { from: 'pause' }); }
    else if (act === 'save') {
      const c = canSave();
      if (!c.ok) { sfx('ui_back'); btn.classList.remove('nope'); void btn.offsetWidth; btn.classList.add('nope'); return; }
      const ok = saveManual();
      P.refresh();
      P.dom.why.textContent = ok ? 'SIDE A saved ● ' + N.clock.label() : 'Could not save (storage full?)';
    } else if (act === 'quitmission') {
      sfx('ui_back');
      try { if (N.missions && N.missions.abort) N.missions.abort(); } catch (e) { N.err('menus.quitMission', e); }
      M.resume();
    } else if (act === 'quit') { sfx('ui_click'); P.showConfirm(true); }
    else if (act === 'stay') { sfx('ui_back'); P.back(); }
    else if (act === 'savequit') { if (saveManual()) quitToTitle(); }
    else if (act === 'quitnow') quitToTitle();
  }
  function quitToTitle() {
    sfx('tape_stop');
    closeAllPanels();
    try { N.game.quitToTitle(); } catch (e) { N.err('menus.quit', e); }
  }

  /* ============================================================ save / load slots */
  const slots = definePanel('slots', {
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-slots', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Load a tape');
      e.innerHTML =
        '<div class="mn-card sl-card"><div class="mn-card-head"><h2>Load a tape</h2><button type="button" class="mn-x" data-act="back" aria-label="Close">✕</button></div>' +
        '<div class="sl-list scroll"></div><p class="sl-note"></p></div>';
      this.dom = { list: e.querySelector('.sl-list'), note: e.querySelector('.sl-note') };
      e.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-act]');
        if (!b) return;
        if (b.dataset.act === 'back') { sfx('ui_back'); this.back(); return; }
        if (b.dataset.act === 'load') this.load(b.dataset.slot, b);
      });
    },
    onOpen() { this.render(); },
    render() {
      const L = this.dom.list;
      L.innerHTML = '';
      const rows = [['auto', 'LATEST', 'what ▶▶ CONTINUE plays: booths, MISSION PASSED, Save', latestInfo()]];
      if (lsOK()) rows.push(['manual', 'MANUAL', 'your own copy from the pause menu', manualInfo()]);
      for (const [slot, name, what, info] of rows) {
        const r = el('div', 'sl-slot' + (info ? '' : ' empty'), L);
        r.innerHTML =
          '<div class="sl-cas">' + CASSETTE_SVG + '<span class="sl-tag">' + esc(name) + '</span></div>' +
          '<div class="sl-meta"><b>' + (info ? esc(saveLine(info)) : 'Blank tape') + '</b>' +
          '<span>' + (info ? esc([info.clock, info.district].filter(Boolean).join(' · ')) : esc(what)) + '</span>' +
          '<small>' + (info ? 'saved ' + esc(agoText(info.t)) + (info.reason ? ' · ' + esc(info.reason) : '') : '') + '</small></div>' +
          '<button type="button" class="mn-btn sl-load" data-nav data-act="load" data-slot="' + slot + '"' + (info ? '' : ' disabled') + '>▶ Load</button>';
      }
      const avail = N.save ? N.save.available : lsOK();
      this.dom.note.textContent = avail ? 'Loading replaces where you are now.' : 'Saves last only this session (browser storage is off).';
    },
    load(slot, btn) {
      const fromPause = this.opts && this.opts.from === 'pause';
      if (fromPause && !btn.classList.contains('sure')) {
        btn.classList.add('sure'); btn.textContent = 'Sure? ▶ Load';
        sfx('ui_click');
        setTimeout(() => { if (btn.isConnected) { btn.classList.remove('sure'); btn.textContent = '▶ Load'; } }, 3500);
        return;
      }
      unlockAudio();
      sfx('tape_click');
      const ok = loadSlot(slot);
      if (!ok) { btn.textContent = 'Could not load'; return; }
      closeAllPanels();
    },
    back() { closePanel('slots'); },
  });
  void slots;

  /* ============================================================ settings */
  const SEG = (pairs) => pairs.map((p) => ({ v: p[0], t: p[1] }));
  const SETTINGS_ROWS = [
    { sec: 'Sound' },
    { id: 'vol.master', label: 'Master volume', type: 'slider' },
    { id: 'vol.music', label: 'Music', type: 'slider' },
    { id: 'vol.sfx', label: 'Sound effects', type: 'slider' },
    { id: 'vol.radio', label: 'Radio & walkman', type: 'slider' },
    { id: 'vol.ambient', label: 'City ambience', type: 'slider' },
    { id: 'mute', label: 'Mute everything', type: 'toggle' },
    { sec: 'Text' },
    { id: 'textSpeed', label: 'Text speed', type: 'seg', opts: SEG([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']]) },
    { id: 'autoAdvance', label: 'Auto-advance dialogue', type: 'toggle', help: 'Lines move on by themselves once read (2 s or more). Choices still wait for you.' },
    { id: 'captions', label: 'Sound captions', type: 'toggle', help: '[whistle ↗] and [bus horn] on screen, for playing without sound.' },
    { sec: 'Screen' },
    { id: 'reducedMotion', label: 'Reduced motion', type: 'seg', opts: SEG([['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]), help: 'No shake, no VHS roll, gentler camera.' },
    { id: 'flashReduce', label: 'Flash reduction', type: 'seg', opts: SEG([['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]) },
    { id: 'vhs', label: 'VHS effect', type: 'slider', help: 'Tape wobble in flashbacks and cutscenes.' },
    { id: 'highContrast', label: 'High-contrast HUD', type: 'toggle' },
    { id: 'colorBlind', label: 'Colour-blind blips', type: 'seg', opts: SEG([['off', 'Off'], ['deutan', 'Deutan'], ['protan', 'Protan'], ['tritan', 'Tritan']]), help: 'Blips always have their own shapes too.' },
    { sec: 'Touch controls' },
    { id: 'handed', label: 'Handed', type: 'seg', opts: SEG([['right', 'Right'], ['left', 'Left']]), help: 'Left puts ACTION, RUN and HORN on the left and the stick on the right.' },
    { id: 'btnSize', label: 'Button size', type: 'seg', opts: SEG([['s', 'S'], ['m', 'M'], ['l', 'L']]) },
    { sec: 'Gameplay' },
    { id: 'difficulty', label: 'Difficulty', type: 'seg', opts: SEG([['relaxed', 'Aaram Se'], ['normal', 'Normal'], ['hard', 'Full Meter']]), help: () => S.diff().blurb },
    { id: 'hintNudges', label: 'Hint nudges', type: 'seg', opts: SEG([['off', 'Off'], ['normal', 'Normal'], ['fast', 'Fast']]), help: 'Ammamma reminds you when you are stuck.' },
    { id: 'assist', label: 'Minigame assist', type: 'toggle', help: 'Wider timing windows in the minigames.' },
    { id: 'letImmu', label: '"Let Immu do it" offers', type: 'toggle', help: 'After three tries, Immu offers to take over.' },
    { sec: 'Saved game' },
    { id: 'storage', type: 'info' },
    { id: 'erase', label: 'Erase saved game', type: 'danger' },
  ];
  // Other modules add rows with N.menus.addSettingsRow({id, label, type: 'seg'|'toggle'|'slider',
  // opts: [[value, text]...], get(), set(v), help, section}); N.view (3D mode, §20) gets a View row.
  const extraRows = [];
  function viewRow() {
    const V = N.view;
    if (!V || typeof V.set !== 'function') return null;
    return { id: 'view', label: 'View', type: 'seg', opts: SEG([['top', 'Top-down'], ['tps', '3D'], ['fps', 'First person']]), help: 'The same city, seen from above or from behind {nick}.', get: () => V.want || V.mode || 'top', set: (v) => { try { V.set(v); } catch (e) { N.err('menus.view', e); } } };
  }
  function settingsRows() {
    const rows = SETTINGS_ROWS.slice();
    const vr = viewRow();
    if (vr) rows.splice(rows.findIndex((r) => r.sec === 'Screen') + 1, 0, vr);
    for (const x of extraRows) {
      let at = rows.findIndex((r) => r.sec === (x.section || 'Gameplay'));
      if (at < 0) { rows.splice(rows.findIndex((r) => r.sec === 'Saved game'), 0, { sec: x.section }); at = rows.findIndex((r) => r.sec === x.section); }
      let end = at + 1;
      while (end < rows.length && !rows[end].sec) end++;
      rows.splice(end, 0, x);
    }
    return rows;
  }
  const rowById = (id) => (settings.rows || SETTINGS_ROWS).find((x) => x.id === id) || extraRows.find((x) => x.id === id) || null;
  function addSettingsRow(def) {
    if (!def || !def.id || !def.type || (def.type === 'seg' && !Array.isArray(def.opts))) { N.err('menus.addSettingsRow', new Error('bad row ' + (def && def.id))); return null; }
    const row = Object.assign({}, def, def.type === 'seg' ? { opts: def.opts.map((o) => (Array.isArray(o) ? { v: o[0], t: o[1] } : o)) } : {});
    const i = extraRows.findIndex((x) => x.id === def.id);
    if (i >= 0) extraRows[i] = row; else extraRows.push(row);
    settings.dirtyRows = true;
    if (isShown('settings')) { settings.buildRows(); settings.syncAll(); }
    return def.id;
  }
  function settingGet(id) {
    const cr = rowById(id);
    if (cr && typeof cr.get === 'function') { try { return cr.get(); } catch (e) { N.err('menus.settingGet', e); return null; } }
    if (id.startsWith('vol.')) {
      const bus = id.slice(4);
      try { if (N.audio && N.audio.getVolume) { const v = N.audio.getVolume(bus); if (isFinite(v)) return Math.round(v * 100); } } catch (e) { /* ignore */ }
      return 80;
    }
    if (id === 'mute') return !!(N.audio && N.audio.muted);
    return S.get(id);
  }
  function settingSet(id, v) {
    const cr = rowById(id);
    if (cr && typeof cr.set === 'function') { try { cr.set(v); } catch (e) { N.err('menus.settingSet', e); } sfx('ui_click'); return; }
    if (id.startsWith('vol.')) {
      try { if (N.audio && N.audio.setVolume) N.audio.setVolume(id.slice(4), U.clamp(v, 0, 100) / 100); } catch (e) { N.err('menus.volume', e); }
      sfx(id === 'vol.music' ? 'ui_select' : 'ui_click');
      return;
    }
    if (id === 'mute') { try { if (N.audio && N.audio.mute) N.audio.mute(!!v); } catch (e) { /* ignore */ } return; }
    S.set(id, v);
    sfx('ui_click');
  }
  const settings = definePanel('settings', {
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-settings', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Settings');
      e.innerHTML = '<div class="mn-card st-card"><div class="mn-card-head"><h2>Settings</h2><button type="button" class="mn-x" data-act="back" aria-label="Close">✕</button></div><div class="st-list scroll"></div>' +
        '<p class="st-foot"><kbd>↑</kbd><kbd>↓</kbd> choose &nbsp; <kbd>←</kbd><kbd>→</kbd> change &nbsp; <kbd>Esc</kbd> back</p></div>';
      this.dom = { list: e.querySelector('.st-list') };
      e.querySelector('[data-act=back]').addEventListener('click', () => { sfx('ui_back'); this.back(); });
      const L = this.dom.list;
      this.buildRows();
      L.addEventListener('input', (ev) => {
        const inp = ev.target.closest('input[type=range]');
        if (!inp) return;
        const row = inp.closest('.st-row');
        settingSet(row.dataset.id, +inp.value);
        this.sync(row);
      });
      L.addEventListener('click', (ev) => {
        const row = ev.target.closest('.st-row');
        if (!row) return;
        focusEl(row);
        const r = rowById(row.dataset.id);
        if (!r) return;
        if (r.type === 'toggle' && ev.target.closest('.st-tog')) { settingSet(r.id, !settingGet(r.id)); this.sync(row); }
        else if (r.type === 'seg') { const b = ev.target.closest('button[data-v]'); if (b) { settingSet(r.id, b.dataset.v); this.syncAll(); } }
        else if (r.type === 'danger' && ev.target.closest('.st-erase')) this.erase(row);
      });
    },
    buildRows() {
      const L = this.dom.list;
      L.innerHTML = '';
      this.rows = settingsRows();
      this.dirtyRows = false;
      for (const r of this.rows) {
        if (r.sec) { el('h3', 'st-sec', L).textContent = r.sec; continue; }
        const row = el('div', 'st-row st-t-' + r.type, L);
        row.dataset.id = r.id;
        row.dataset.nav = '';
        row.tabIndex = 0;
        if (r.type !== 'info') row.setAttribute('data-adjust', '');
        if (r.type === 'info') { row.innerHTML = '<span class="st-l"><span class="st-info"></span></span>'; continue; }
        if (r.type === 'danger') { row.innerHTML = '<span class="st-l">' + esc(r.label) + '<small class="st-h"></small></span><span class="st-c"><button type="button" tabindex="-1" class="mn-btn danger st-erase">Erase</button></span>'; continue; }
        let c = '';
        if (r.type === 'slider') c = '<input type="range" tabindex="-1" min="0" max="100" step="5" aria-label="' + esc(r.label) + '"><output class="st-val"></output>';
        else if (r.type === 'toggle') c = '<button type="button" tabindex="-1" class="st-tog" aria-label="' + esc(r.label) + '"><i></i><span class="on">ON</span><span class="off">OFF</span></button>';
        else if (r.type === 'seg') c = '<span class="st-seg" role="radiogroup" aria-label="' + esc(r.label) + '">' + r.opts.map((o) => '<button type="button" tabindex="-1" data-v="' + esc(o.v) + '">' + esc(o.t) + '</button>').join('') + '</span>';
        row.innerHTML = '<span class="st-l">' + esc(r.label) + '<small class="st-h"></small></span><span class="st-c">' + c + '</span>';
        row.setAttribute('aria-label', r.label);
      }
    },
    onOpen() { if (this.dirtyRows || (!this.rows.some((r) => r.id === 'view') && viewRow())) this.buildRows(); this.syncAll(); },
    syncAll() { this.el.querySelectorAll('.st-row').forEach((row) => this.sync(row)); },
    sync(row) {
      const id = row.dataset.id;
      const r = rowById(id);
      if (!r) return;
      const v = r.type === 'info' || r.type === 'danger' ? null : settingGet(id);
      const h = row.querySelector('.st-h');
      if (h) h.textContent = subst(typeof r.help === 'function' ? r.help() : r.help || '');
      if (r.type === 'slider') { const inp = row.querySelector('input'); inp.value = v; row.querySelector('.st-val').textContent = v; inp.style.setProperty('--p', v + '%'); }
      else if (r.type === 'toggle') { const b = row.querySelector('.st-tog'); b.classList.toggle('is-on', !!v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); }
      else if (r.type === 'seg') row.querySelectorAll('button[data-v]').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('sel', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.setAttribute('role', 'radio'); });
      else if (r.type === 'info') {
        const avail = N.save ? N.save.available : lsOK();
        const i = latestInfo();
        row.querySelector('.st-info').innerHTML = (avail ? 'Saves are kept in this browser.' : '<b>Saves last only this session</b> (browser storage is off).') +
          (i ? ' Latest: ' + esc(saveLine(i)) + ', saved ' + esc(agoText(i.t)) + '.' : ' No saved game yet.');
      } else if (r.type === 'danger') {
        const has = !!(latestInfo() || manualInfo() || (N.save && N.save.tooNew)); // a newer build's save can be erased too (lifts the save block)
        const b = row.querySelector('.st-erase');
        b.disabled = !has;
        if (!row.classList.contains('armed')) { b.textContent = 'Erase'; h.textContent = has ? 'Both tapes: latest and manual.' : 'Nothing to erase.'; }
      }
    },
    adjust(row, d) {
      const r = rowById(row.dataset.id);
      if (!r) return;
      if (r.type === 'slider') { if (!d) return; settingSet(r.id, U.clamp(settingGet(r.id) + d * 5, 0, 100)); }
      else if (r.type === 'toggle') settingSet(r.id, !settingGet(r.id));
      else if (r.type === 'seg') {
        const vals = r.opts.map((o) => o.v);
        let i = vals.indexOf(settingGet(r.id));
        i = d < 0 ? Math.max(0, i - 1) : d > 0 ? Math.min(vals.length - 1, i + 1) : (i + 1) % vals.length;
        settingSet(r.id, vals[i]);
      } else if (r.type === 'danger') { if (!d) this.erase(row); return; }
      this.syncAll();
    },
    erase(row) {
      const b = row.querySelector('.st-erase'), h = row.querySelector('.st-h');
      if (b.disabled) return;
      if (!row.classList.contains('armed')) {
        row.classList.add('armed'); b.textContent = 'Erase for real'; h.textContent = 'Press again to erase. This cannot be undone.';
        sfx('ui_click');
        clearTimeout(this._eraseT);
        this._eraseT = setTimeout(() => { row.classList.remove('armed'); this.sync(row); }, 4000);
        return;
      }
      row.classList.remove('armed');
      try { if (N.save && N.save.clear) N.save.clear(); } catch (e) { N.err('menus.erase', e); }
      lsDel(MANUAL_KEY); manualMem = null; lastSaveT = 0;
      sfx('tape_stop');
      this.syncAll();
      h.textContent = 'Erased. A blank tape.';
      if (isShown('title')) title.refresh();
    },
    back() { closePanel('settings'); },
  });
  void settings;

  /* ============================================================ full-screen map */
  // A 1999-style city guide map drawn from N.WORLD_DATA (vector, crisp at every zoom): paper,
  // red arterials, blue lake, district names (English + Telugu), a grid, icons for every
  // must-have place, shops by kind (legend filter), collectibles, mission blips and the player.
  const PAPER = '#efe4c6';
  const INK = '#1a1214';
  const KM = 430; // u per map-km (systems §0.1)
  const KI = {
    landmark: { g: 'monument', c: '#c79a55', label: 'Landmark', lm: 1 },
    plaza: { g: 'monument', c: '#c79a55', label: 'Plaza', lm: 1 },
    museum: { g: 'museum', c: '#8a6ab0', label: 'Museum', lm: 1 },
    temple: { g: 'temple', c: '#e07a2e', label: 'Temple', lm: 1, worship: 1 },
    mosque: { g: 'mosque', c: '#3f8f5a', label: 'Mosque', lm: 1, worship: 1 },
    dargah: { g: 'mosque', c: '#3f8f5a', label: 'Dargah', lm: 1, worship: 1 },
    church: { g: 'church', c: '#5a7ac8', label: 'Church', lm: 1, worship: 1 },
    cinema: { g: 'cinema', c: '#c84a8a', label: 'Cinema', lm: 1 },
    transport: { g: 'bus', c: '#b22b2b', label: 'Station / bus stand', lm: 1 },
    park: { g: 'tree', c: '#4f8a3a', label: 'Park', lm: 1 },
    market: { g: 'market', c: '#d0703a', label: 'Market', lm: 1 },
    bridge: { g: 'bridge', c: '#6a7a8a', label: 'Bridge', lm: 1 },
    jetty: { g: 'boat', c: '#2f7f86', label: 'Jetty', lm: 1 },
    festival: { g: 'star', c: '#e0508a', label: 'Festival ground', lm: 1 },
    home: { g: 'home', c: '#f2c230', label: 'Home', lm: 1 },
    terrace: { g: 'kite', c: '#f2c230', label: 'Terrace', lm: 1 },
    edge: { g: 'edge', c: '#8a7a68', label: 'Out of town', lm: 1 },
    food: { g: 'plate', c: '#b5523a', label: 'Famous food', lm: 1 },
    restaurant: { g: 'plate', c: '#b5523a', label: 'Restaurant', lm: 1 },
    junction: { g: 'junction', c: '#8a7a68', label: 'Junction' },
    district: { g: 'pin', c: '#8a7a68', label: 'Area' },
    irani_cafe: { g: 'cup', c: '#2a8c82', label: 'Irani café', cat: 'Food & chai', on: 1 },
    bakery: { g: 'bun', c: '#c9822f', label: 'Bakery', cat: 'Food & chai', on: 1 },
    iyengar_bakery: { g: 'bun', c: '#c9822f', label: 'Iyengar bakery', cat: 'Food & chai' },
    chai_bandi: { g: 'cart', c: '#b98a2f', label: 'Chai bandi', cat: 'Food & chai' },
    samosa_bandi: { g: 'cart', c: '#b98a2f', label: 'Samosa bandi', cat: 'Food & chai' },
    dosa_bandi: { g: 'cart', c: '#b98a2f', label: 'Dosa bandi', cat: 'Food & chai' },
    coconut_cart: { g: 'cart', c: '#5f8a3a', label: 'Coconut cart', cat: 'Food & chai' },
    banana_cart: { g: 'cart', c: '#c9a52f', label: 'Banana cart', cat: 'Food & chai' },
    flower_cart: { g: 'cart', c: '#d0508a', label: 'Flower cart', cat: 'Shops' },
    kite_stall: { g: 'kite', c: '#e0603a', label: 'Kite stall', cat: 'Shops' },
    kirana: { g: 'jar', c: '#6a8a3a', label: 'Kirana store', cat: 'Shops' },
    stationery: { g: 'pencil', c: '#3d6fb0', label: 'Stationery', cat: 'Shops' },
    medical_shop: { g: 'cross', c: '#2f9a5a', label: 'Medical shop', cat: 'Shops' },
    photo_studio: { g: 'camera', c: '#7a5ab0', label: 'Photo studio', cat: 'Shops' },
    meat_shop: { g: 'shop', c: '#a04040', label: 'Chicken & mutton', cat: 'Shops' },
    pindi_girni: { g: 'gear', c: '#a08050', label: 'Pindi girni', cat: 'Shops' },
    shop: { g: 'shop', c: '#7a7a80', label: 'Shop', cat: 'Shops' },
    std_booth: { g: 'phone', c: '#d9a520', label: 'STD / PCO booth', cat: 'Services', on: 1 },
    barber: { g: 'scissors', c: '#c03a3a', label: 'Barber', cat: 'Services', on: 1 },
    cycle_rent: { g: 'cycle', c: '#3a8ab0', label: 'Cycle hire', cat: 'Services', on: 1 },
    internet_cafe: { g: 'at', c: '#3a7ab8', label: 'Internet café', cat: 'Services' },
    video_parlour: { g: 'tv', c: '#8a3a8a', label: 'Video parlour', cat: 'Services' },
    bus_stop: { g: 'busstop', c: '#b22b2b', label: 'Bus stop', cat: 'Services' },
    school: { g: 'book', c: '#3a4a8a', label: 'School', cat: 'Colony' },
    playground: { g: 'bat', c: '#4f8a3a', label: 'Playground', cat: 'Colony' },
  };
  const SV_CATS = ['Food & chai', 'Shops', 'Services', 'Colony'];
  const LAYERS_BUILTIN = [
    { id: 'story', title: 'Story', shape: 'diamond', color: '#f2c230', order: 0 },
    { id: 'landmarks', title: 'Landmarks', shape: 'badge', color: '#c79a55', order: 10 },
    { id: 'services', title: 'Shops & services', shape: 'tile', color: '#2a8c82', order: 20 },
    { id: 'collectibles', title: 'Collectibles', shape: 'star', color: '#ffd84a', order: 30 },
  ];
  const customLayers = new Map();

  function mkCanvas(w, h) { if (N.render && N.render.makeCanvas) return N.render.makeCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---- glyphs: drawn white on the icon, centred on 0,0 in a box of half-size r
  const GLYPH = {
    monument(g, r) { g.beginPath(); g.moveTo(-r * 0.75, r * 0.7); g.lineTo(r * 0.75, r * 0.7); g.lineTo(r * 0.75, 0); g.arc(0, 0, r * 0.75, 0, Math.PI, true); g.closePath(); g.fill(); g.fillRect(-r * 0.95, -r * 0.9, r * 0.22, r * 1.6); g.fillRect(r * 0.73, -r * 0.9, r * 0.22, r * 1.6); },
    museum(g, r) { g.beginPath(); g.moveTo(-r, -r * 0.3); g.lineTo(0, -r); g.lineTo(r, -r * 0.3); g.closePath(); g.fill(); for (let i = -2; i <= 2; i++) g.fillRect(i * r * 0.4 - r * 0.1, -r * 0.2, r * 0.2, r * 0.75); g.fillRect(-r, r * 0.6, r * 2, r * 0.25); },
    temple(g, r) { g.beginPath(); g.moveTo(-r * 0.8, r * 0.85); g.quadraticCurveTo(-r * 0.75, -r * 0.4, 0, -r); g.quadraticCurveTo(r * 0.75, -r * 0.4, r * 0.8, r * 0.85); g.closePath(); g.fill(); g.fillRect(-r * 0.06, -r * 1.25, r * 0.12, r * 0.4); g.beginPath(); g.moveTo(r * 0.06, -r * 1.25); g.lineTo(r * 0.5, -r * 1.1); g.lineTo(r * 0.06, -r * 0.98); g.fill(); },
    mosque(g, r) { g.beginPath(); g.moveTo(-r * 0.75, r * 0.8); g.lineTo(-r * 0.75, r * 0.05); g.quadraticCurveTo(-r * 0.75, -r * 0.55, -r * 0.05, -r * 0.85); g.quadraticCurveTo(r * 0.55, -r * 0.55, r * 0.55, r * 0.05); g.lineTo(r * 0.55, r * 0.8); g.closePath(); g.fill(); g.fillRect(r * 0.68, -r * 0.95, r * 0.26, r * 1.75); },
    church(g, r) { g.beginPath(); g.moveTo(-r * 0.7, r * 0.85); g.lineTo(-r * 0.7, -r * 0.05); g.lineTo(0, -r * 0.55); g.lineTo(r * 0.7, -r * 0.05); g.lineTo(r * 0.7, r * 0.85); g.closePath(); g.fill(); g.fillRect(-r * 0.08, -r * 1.2, r * 0.16, r * 0.62); g.fillRect(-r * 0.3, -r * 1.02, r * 0.6, r * 0.15); },
    cinema(g, r) { g.fillRect(-r * 0.9, -r * 0.62, r * 1.8, r * 1.24); g.save(); g.globalCompositeOperation = 'destination-out'; for (let i = -2; i <= 2; i++) { g.fillRect(i * r * 0.36 - r * 0.09, -r * 0.5, r * 0.18, r * 0.18); g.fillRect(i * r * 0.36 - r * 0.09, r * 0.32, r * 0.18, r * 0.18); } g.fillRect(-r * 0.55, -r * 0.2, r * 1.1, r * 0.4); g.restore(); },
    bus(g, r) { g.beginPath(); roundRect(g, -r * 0.75, -r * 0.9, r * 1.5, r * 1.55, r * 0.25); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-r * 0.55, -r * 0.62, r * 1.1, r * 0.55); g.restore(); g.fillRect(-r * 0.7, r * 0.62, r * 0.35, r * 0.35); g.fillRect(r * 0.35, r * 0.62, r * 0.35, r * 0.35); },
    tree(g, r) { g.beginPath(); g.arc(0, -r * 0.2, r * 0.72, 0, TAU); g.fill(); g.fillRect(-r * 0.12, r * 0.3, r * 0.24, r * 0.7); },
    market(g, r) { g.beginPath(); g.moveTo(-r, -r * 0.3); g.lineTo(-r * 0.8, -r * 0.85); g.lineTo(r * 0.8, -r * 0.85); g.lineTo(r, -r * 0.3); g.closePath(); g.fill(); g.fillRect(-r * 0.8, -r * 0.1, r * 0.2, r * 0.95); g.fillRect(r * 0.6, -r * 0.1, r * 0.2, r * 0.95); g.fillRect(-r * 0.8, r * 0.35, r * 1.6, r * 0.22); },
    bridge(g, r) { g.fillRect(-r, -r * 0.35, r * 2, r * 0.25); g.beginPath(); g.arc(0, r * 0.9, r * 0.9, Math.PI, 0); g.lineWidth = r * 0.25; g.stroke(); },
    boat(g, r) { g.beginPath(); g.moveTo(-r, r * 0.25); g.lineTo(r, r * 0.25); g.lineTo(r * 0.6, r * 0.8); g.lineTo(-r * 0.6, r * 0.8); g.closePath(); g.fill(); g.beginPath(); g.moveTo(r * 0.05, -r); g.lineTo(r * 0.75, r * 0.05); g.lineTo(r * 0.05, r * 0.05); g.closePath(); g.fill(); },
    star(g, r) { starPath(g, 0, 0, r * 0.95, r * 0.42); g.fill(); },
    home(g, r) { g.beginPath(); g.moveTo(-r * 0.85, -r * 0.05); g.lineTo(0, -r * 0.9); g.lineTo(r * 0.85, -r * 0.05); g.lineTo(r * 0.62, -r * 0.05); g.lineTo(r * 0.62, r * 0.85); g.lineTo(-r * 0.62, r * 0.85); g.lineTo(-r * 0.62, -r * 0.05); g.closePath(); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-r * 0.18, r * 0.3, r * 0.36, r * 0.55); g.restore(); },
    kite(g, r) { g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.75, -r * 0.1); g.lineTo(0, r * 0.65); g.lineTo(-r * 0.75, -r * 0.1); g.closePath(); g.fill(); g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(0, r * 0.65); g.quadraticCurveTo(r * 0.35, r * 0.85, r * 0.1, r * 1.05); g.stroke(); },
    edge(g, r) { g.beginPath(); g.moveTo(-r * 0.8, -r * 0.25); g.lineTo(r * 0.1, -r * 0.25); g.lineTo(r * 0.1, -r * 0.75); g.lineTo(r * 0.9, 0); g.lineTo(r * 0.1, r * 0.75); g.lineTo(r * 0.1, r * 0.25); g.lineTo(-r * 0.8, r * 0.25); g.closePath(); g.fill(); },
    junction(g, r) { g.fillRect(-r * 0.2, -r * 0.9, r * 0.4, r * 1.8); g.fillRect(-r * 0.9, -r * 0.2, r * 1.8, r * 0.4); },
    pin(g, r) { g.beginPath(); g.arc(0, 0, r * 0.4, 0, TAU); g.fill(); },
    plate(g, r) { g.beginPath(); g.ellipse(0, r * 0.35, r * 0.95, r * 0.35, 0, 0, TAU); g.fill(); g.beginPath(); g.arc(0, r * 0.2, r * 0.6, Math.PI, 0); g.fill(); g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(-r * 0.25, -r * 0.55); g.quadraticCurveTo(-r * 0.45, -r * 0.8, -r * 0.2, -r * 1.0); g.moveTo(r * 0.2, -r * 0.55); g.quadraticCurveTo(0, -r * 0.8, r * 0.25, -r * 1.0); g.stroke(); },
    cup(g, r) { g.beginPath(); g.moveTo(-r * 0.55, -r * 0.75); g.lineTo(r * 0.55, -r * 0.75); g.lineTo(r * 0.4, r * 0.55); g.lineTo(-r * 0.4, r * 0.55); g.closePath(); g.fill(); g.fillRect(-r * 0.85, r * 0.62, r * 1.7, r * 0.22); },
    bun(g, r) { g.beginPath(); g.ellipse(0, r * 0.1, r * 0.9, r * 0.6, 0, 0, TAU); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = r * 0.14; g.beginPath(); for (let i = -1; i <= 1; i++) { g.moveTo(i * r * 0.4 - r * 0.12, -r * 0.3); g.lineTo(i * r * 0.4 + r * 0.12, r * 0.25); } g.stroke(); g.restore(); },
    cart(g, r) { g.fillRect(-r * 0.9, -r * 0.55, r * 1.5, r * 0.8); g.fillRect(r * 0.55, -r * 0.35, r * 0.45, r * 0.14); g.beginPath(); g.arc(-r * 0.35, r * 0.55, r * 0.32, 0, TAU); g.fill(); },
    jar(g, r) { g.beginPath(); roundRect(g, -r * 0.6, -r * 0.55, r * 1.2, r * 1.4, r * 0.3); g.fill(); g.fillRect(-r * 0.45, -r * 0.9, r * 0.9, r * 0.3); },
    pencil(g, r) { g.save(); g.rotate(-0.75); g.fillRect(-r * 0.22, -r * 0.85, r * 0.44, r * 1.3); g.beginPath(); g.moveTo(-r * 0.22, r * 0.45); g.lineTo(0, r * 0.95); g.lineTo(r * 0.22, r * 0.45); g.fill(); g.restore(); },
    cross(g, r) { g.fillRect(-r * 0.28, -r * 0.85, r * 0.56, r * 1.7); g.fillRect(-r * 0.85, -r * 0.28, r * 1.7, r * 0.56); },
    camera(g, r) { g.beginPath(); roundRect(g, -r * 0.9, -r * 0.5, r * 1.8, r * 1.2, r * 0.18); g.fill(); g.fillRect(-r * 0.35, -r * 0.78, r * 0.7, r * 0.3); g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, r * 0.1, r * 0.38, 0, TAU); g.fill(); g.restore(); g.beginPath(); g.arc(0, r * 0.1, r * 0.2, 0, TAU); g.fill(); },
    at(g, r) { g.font = '700 ' + Math.round(r * 2) + 'px ' + "'Baloo 2', system-ui, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('@', 0, r * 0.08); },
    tv(g, r) { g.beginPath(); roundRect(g, -r * 0.9, -r * 0.45, r * 1.8, r * 1.3, r * 0.2); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-r * 0.65, -r * 0.22, r * 1.05, r * 0.85); g.restore(); g.lineWidth = r * 0.13; g.beginPath(); g.moveTo(0, -r * 0.45); g.lineTo(-r * 0.45, -r * 1.0); g.moveTo(0, -r * 0.45); g.lineTo(r * 0.45, -r * 1.0); g.stroke(); },
    shop(g, r) { g.beginPath(); g.moveTo(-r, -r * 0.25); g.lineTo(-r * 0.7, -r * 0.85); g.lineTo(r * 0.7, -r * 0.85); g.lineTo(r, -r * 0.25); g.closePath(); g.fill(); g.fillRect(-r * 0.75, -r * 0.05, r * 1.5, r * 0.9); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-r * 0.2, r * 0.25, r * 0.4, r * 0.6); g.restore(); },
    gear(g, r) { g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? r * 0.65 : r * 0.92; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, 0, r * 0.28, 0, TAU); g.fill(); g.restore(); },
    phone(g, r) { g.beginPath(); roundRect(g, -r * 0.8, -r * 0.15, r * 1.6, r * 0.95, r * 0.25); g.fill(); g.lineWidth = r * 0.3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * 0.75, -r * 0.45); g.quadraticCurveTo(0, -r * 0.95, r * 0.75, -r * 0.45); g.stroke(); g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(0, r * 0.32, r * 0.28, 0, TAU); g.fill(); g.restore(); },
    scissors(g, r) { g.lineWidth = r * 0.22; g.beginPath(); g.arc(-r * 0.45, r * 0.5, r * 0.3, 0, TAU); g.moveTo(r * 0.75, r * 0.5); g.arc(r * 0.45, r * 0.5, r * 0.3, 0, TAU); g.moveTo(-r * 0.28, r * 0.25); g.lineTo(r * 0.55, -r * 0.9); g.moveTo(r * 0.28, r * 0.25); g.lineTo(-r * 0.55, -r * 0.9); g.stroke(); },
    cycle(g, r) { g.lineWidth = r * 0.2; g.beginPath(); g.arc(-r * 0.52, r * 0.3, r * 0.38, 0, TAU); g.moveTo(r * 0.9, r * 0.3); g.arc(r * 0.52, r * 0.3, r * 0.38, 0, TAU); g.moveTo(-r * 0.52, r * 0.3); g.lineTo(-r * 0.1, -r * 0.4); g.lineTo(r * 0.35, -r * 0.4); g.lineTo(r * 0.52, r * 0.3); g.moveTo(-r * 0.1, -r * 0.4); g.lineTo(r * 0.05, r * 0.3); g.lineTo(r * 0.35, -r * 0.4); g.stroke(); },
    busstop(g, r) { g.fillRect(-r * 0.1, -r * 0.3, r * 0.2, r * 1.2); g.beginPath(); roundRect(g, -r * 0.7, -r * 0.95, r * 1.4, r * 0.75, r * 0.15); g.fill(); },
    book(g, r) { g.beginPath(); g.moveTo(0, -r * 0.5); g.quadraticCurveTo(-r * 0.5, -r * 0.8, -r * 0.95, -r * 0.6); g.lineTo(-r * 0.95, r * 0.7); g.quadraticCurveTo(-r * 0.5, r * 0.5, 0, r * 0.8); g.quadraticCurveTo(r * 0.5, r * 0.5, r * 0.95, r * 0.7); g.lineTo(r * 0.95, -r * 0.6); g.quadraticCurveTo(r * 0.5, -r * 0.8, 0, -r * 0.5); g.fill(); },
    bat(g, r) { g.save(); g.rotate(0.6); g.fillRect(-r * 0.22, -r * 0.4, r * 0.44, r * 1.3); g.fillRect(-r * 0.08, -r, r * 0.16, r * 0.62); g.restore(); g.beginPath(); g.arc(-r * 0.6, -r * 0.55, r * 0.24, 0, TAU); g.fill(); },
    tick(g, r) { g.lineWidth = r * 0.32; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-r * 0.6, 0); g.lineTo(-r * 0.15, r * 0.5); g.lineTo(r * 0.65, -r * 0.5); g.stroke(); },
    q(g, r) { g.font = '800 ' + Math.round(r * 1.7) + 'px ' + "'Baloo 2', system-ui, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, r * 0.1); },
  };
  function roundRect(g, x, y, w, h, r) { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function starPath(g, x, y, ro, ri) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : ro; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
  function shapePath(g, shape, r) {
    g.beginPath();
    if (shape === 'tile') roundRect(g, -r, -r, r * 2, r * 2, r * 0.3);
    else if (shape === 'diamond') { g.moveTo(0, -r * 1.25); g.lineTo(r * 1.1, 0); g.lineTo(0, r * 1.25); g.lineTo(-r * 1.1, 0); g.closePath(); }
    else if (shape === 'star') starPath(g, 0, 0, r * 1.3, r * 0.6);
    else g.arc(0, 0, r, 0, TAU);
  }
  const spriteCache = new Map();
  function iconSprite(shape, glyph, color, r, dpr, faded) {
    const key = shape + '|' + glyph + '|' + color + '|' + r + '|' + dpr + '|' + (faded ? 1 : 0);
    let c = spriteCache.get(key);
    if (c) return c;
    const pad = 4, half = Math.ceil(r * 1.35 + pad);
    c = mkCanvas(Math.ceil(half * 2 * dpr), Math.ceil(half * 2 * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr); g.translate(half, half);
    g.lineJoin = 'round';
    // drop shadow
    g.save(); g.translate(1, 1.4); shapePath(g, shape, r); g.fillStyle = 'rgba(26,18,20,0.35)'; g.fill(); g.restore();
    shapePath(g, shape, r);
    g.fillStyle = faded ? U.mix(color, PAPER, 0.55) : color; g.fill();
    g.lineWidth = Math.max(1.2, r * 0.2); g.strokeStyle = INK; g.stroke();
    if (shape === 'badge') { g.beginPath(); g.arc(0, 0, r * 0.8, 0, TAU); g.lineWidth = Math.max(0.8, r * 0.1); g.strokeStyle = 'rgba(255,248,232,0.65)'; g.stroke(); }
    if (glyph && GLYPH[glyph]) {
      g.save();
      g.fillStyle = '#fffaf0'; g.strokeStyle = '#fffaf0';
      if (color === '#f2c230' || color === '#d9a520' || color === '#ffd84a') { g.fillStyle = INK; g.strokeStyle = INK; }
      try { GLYPH[glyph](g, r * (shape === 'badge' ? 0.56 : 0.62)); } catch (e) { /* glyph art never breaks the map */ }
      g.restore();
    }
    c.half = half;
    if (spriteCache.size > 400) spriteCache.clear();
    spriteCache.set(key, c);
    return c;
  }

  const MV = {
    cx: 4000, cy: 3000, s: 0.1, fit: 0.1, W: 1, H: 1, dpr: 1,
    base: null, over: null, bctx: null, octx: null, dirty: true, icons: null, roadPaths: null,
    pointers: new Map(), drag: null, pinch: null, press: null, hits: [], cross: false, held: {}, zt: null, sel: null, legendOpen: false,
  };
  let waypoint = null;
  function setWaypoint(x, y) {
    if (x == null || !isFinite(x) || !isFinite(y)) {
      waypoint = null;
      try { if (N.hud && N.hud.unblip) N.hud.unblip('mn:waypoint'); } catch (e) { /* ignore */ }
      return null;
    }
    waypoint = { x: U.clamp(x, 0, N.WORLD_W), y: U.clamp(y, 0, N.WORLD_H) };
    try { if (N.hud && N.hud.blip) N.hud.blip('mn:waypoint', waypoint, { color: '#ff5fb0', icon: 'ring', label: 'Waypoint', route: true, pulse: true }); } catch (e) { N.err('menus.waypoint', e); }
    sfx('ui_select');
    return waypoint;
  }
  const zoomLevel = () => (MV.s < MV.fit * 1.8 ? 0 : MV.s < MV.fit * 5 ? 1 : 2);
  const w2s = (x, y) => [MV.W / 2 + (x - MV.cx) * MV.s, MV.H / 2 + (y - MV.cy) * MV.s];
  const s2w = (px, py) => [MV.cx + (px - MV.W / 2) / MV.s, MV.cy + (py - MV.H / 2) / MV.s];
  function clampView() {
    const WW = N.WORLD_W, WH = N.WORLD_H;
    MV.s = U.clamp(MV.s, MV.fit * 0.95, Math.max(MV.fit * 10, 1.2));
    const hw = MV.W / 2 / MV.s, hh = MV.H / 2 / MV.s;
    MV.cx = hw * 2 >= WW ? WW / 2 : U.clamp(MV.cx, hw - 60, WW - hw + 60);
    MV.cy = hh * 2 >= WH ? WH / 2 : U.clamp(MV.cy, hh - 60, WH - hh + 60);
    MV.dirty = true;
  }
  function zoomAt(ns, px, py) {
    const w = s2w(px, py);
    MV.s = ns;
    clampView();
    MV.cx = w[0] - (px - MV.W / 2) / MV.s; MV.cy = w[1] - (py - MV.H / 2) / MV.s;
    clampView();
  }
  function zoomLevels() { return [MV.fit, MV.fit * 3, MV.fit * 8]; }
  function zoomStep(d, px, py) {
    const L = zoomLevels();
    let target;
    if (d > 0) target = L.find((z) => z > MV.s * 1.05) || Math.min(MV.s * 1.6, Math.max(MV.fit * 10, 1.2));
    else target = L.slice().reverse().find((z) => z < MV.s / 1.05) || MV.fit;
    MV.zt = { from: MV.s, to: target, t: 0, dur: reduced() ? 0.01 : 0.28, px: px == null ? MV.W / 2 : px, py: py == null ? MV.H / 2 : py };
    sfx('ui_click');
  }
  function mapResize() {
    if (!MV.view) return;
    const r = MV.view.getBoundingClientRect();
    MV.W = Math.max(1, r.width); MV.H = Math.max(1, r.height);
    MV.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [MV.base, MV.over]) {
      const w = Math.round(MV.W * MV.dpr), h = Math.round(MV.H * MV.dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }
    const oldFit = MV.fit;
    MV.fit = Math.min(MV.W / N.WORLD_W, MV.H / N.WORLD_H) * 0.96;
    if (oldFit && MV.fit !== oldFit) MV.s *= MV.fit / oldFit;
    clampView();
  }

  // ---- static icon list (places + must-haves that are only landmarks / parks / water)
  function centroid(poly) { let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1]; } return [x / poly.length, y / poly.length]; }
  function buildIcons() {
    const D = N.WORLD_DATA || {};
    const out = [], seen = new Set();
    for (const id in N.places) {
      const p = N.places[id];
      if (!p || p.kind === 'hidden' || p.kind === 'giver' || !isFinite(p.x) || !isFinite(p.y)) continue;
      const must = MUST_SET.has(id);
      const ki = KI[p.kind] || (must ? KI.landmark : null);
      if (!ki) continue;
      const layer = must || ki.lm ? 'landmarks' : ki.cat ? 'services' : null;
      if (!layer) continue;
      out.push({ id, x: p.x, y: p.y, name: p.name || id, kind: p.kind, g: ki.g, c: ki.c, layer, must, district: p.district });
      seen.add(id);
    }
    for (const id of MUST) {
      if (seen.has(id)) continue;
      const lm = (D.landmarks || []).find((l) => l.id === id);
      const park = !lm && (D.parks || []).find((q) => q.id === id);
      const water = !lm && !park && (D.water || []).find((q) => q.id === id);
      const pos = lm ? [lm.x, lm.y] : park ? centroid(park.poly) : water ? centroid(water.poly) : null;
      if (!pos) continue;
      const ki = lm ? KI.landmark : park ? KI.park : KI.jetty;
      out.push({ id, x: pos[0], y: pos[1], name: (lm || park || water).name || id, kind: lm ? 'landmark' : park ? 'park' : 'water', g: ki.g, c: ki.c, layer: 'landmarks', must: true });
      seen.add(id);
    }
    // landmarks drawn last so they sit on top of shops
    out.sort((a, b) => (a.layer === b.layer ? (a.must ? 1 : 0) - (b.must ? 1 : 0) : a.layer === 'services' ? -1 : 1));
    return out;
  }
  function layerOn(id) {
    const L = S.get('mapLayers');
    return !(L && L[id] === false);
  }
  function kindOn(kind) {
    const K = S.get('mapKinds');
    if (K && kind in K) return !!K[kind];
    return !!(KI[kind] && KI[kind].on);
  }
  function setLayer(id, on) { const L = Object.assign({}, S.get('mapLayers') || {}); L[id] = !!on; S.set('mapLayers', L); MV.dirty = true; }
  function setKind(kind, on) { const K = Object.assign({}, S.get('mapKinds') || {}); K[kind] = !!on; S.set('mapKinds', K); }

  // ---- base map (redrawn only when the view changes)
  function buildRoadPaths() {
    const D = N.WORLD_DATA || {};
    const groups = new Map();
    for (const r of D.roads || []) {
      if (!r.pts || r.pts.length < 2) continue;
      const kind = r.kind === 'bund' || r.kind === 'bridge' ? 'arterial' : r.kind || 'street';
      const key = kind + '|' + Math.round(r.w || 24);
      let gr = groups.get(key);
      if (!gr) { gr = { kind, w: r.w || 24, path: new Path2D(), bridge: false }; groups.set(key, gr); }
      gr.path.moveTo(r.pts[0][0], r.pts[0][1]);
      for (let i = 1; i < r.pts.length; i++) gr.path.lineTo(r.pts[i][0], r.pts[i][1]);
    }
    const rails = new Path2D();
    for (const r of D.rails || []) { if (!r.pts || r.pts.length < 2) continue; rails.moveTo(r.pts[0][0], r.pts[0][1]); for (let i = 1; i < r.pts.length; i++) rails.lineTo(r.pts[i][0], r.pts[i][1]); }
    const blocks = new Path2D();
    for (const b of D.blocks || []) if (b.rect) blocks.rect(b.rect[0], b.rect[1], b.rect[2], b.rect[3]);
    const rocks = new Path2D();
    for (const k of D.rocks || []) { rocks.moveTo(k.x + k.r, k.y); rocks.arc(k.x, k.y, k.r, 0, TAU); }
    const lms = new Path2D();
    for (const l of D.landmarks || []) if (l.w && l.d && l.w * l.d > 300) lms.rect(l.x - l.w / 2, l.y - l.d / 2, l.w, l.d);
    return { groups: Array.from(groups.values()), rails, blocks, rocks, lms };
  }
  const ROAD_STYLE = {
    arterial: { fill: '#e2583f', casing: '#6e281f', min: 3.2, z: 3 },
    street: { fill: '#fffaf0', casing: '#8f7f66', min: 2.1, z: 2 },
    lane: { fill: '#fbf2dc', casing: '#ad9e82', min: 1.2, z: 1 },
    path: { fill: '#a88a62', casing: null, min: 1, z: 0, dash: true },
  };
  const PARK_FILL = { grass: '#bdd394', garden: '#b3cf8a', ground: '#dccb98', plaza: '#e8dcc0', rock: '#cdbfa4' };
  function polyPath(g, poly) { g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
  function renderBase() {
    const g = MV.bctx, D = N.WORLD_DATA || {}, s = MV.s, dpr = MV.dpr, W = MV.W, H = MV.H;
    const WW = N.WORLD_W, WH = N.WORLD_H;
    if (!MV.roadPaths) MV.roadPaths = buildRoadPaths();
    const RP = MV.roadPaths;
    const ox = W / 2 - MV.cx * s, oy = H / 2 - MV.cy * s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = '#2b2026'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(ox + 5, oy + 7, WW * s, WH * s);
    const world = () => g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    world();
    g.fillStyle = PAPER; g.fillRect(0, 0, WW, WH);
    const px = 1 / s; // one CSS pixel in world units
    // district tints
    for (const d of D.districts || []) {
      if (!d.rect) continue;
      g.fillStyle = U.mix(PAPER, d.ground || '#a98a66', d.style === 'oldcity' ? 0.3 : 0.2);
      g.fillRect(d.rect[0], d.rect[1], d.rect[2], d.rect[3]);
    }
    const zl = zoomLevel();
    if (zl >= 1) { g.fillStyle = 'rgba(120,84,60,0.13)'; g.fill(RP.blocks); }
    for (const p of D.parks || []) {
      if (!p.poly || p.poly.length < 3) continue;
      polyPath(g, p.poly);
      g.fillStyle = p.surface === 'sand' ? '#e3d3a8' : PARK_FILL[p.kind] || PARK_FILL.grass; g.fill();
      if (p.kind === 'grass' || p.kind === 'garden') { g.lineWidth = px; g.strokeStyle = 'rgba(70,110,50,0.45)'; g.stroke(); }
    }
    for (const w of D.water || []) {
      if (!w.poly || w.poly.length < 3) continue;
      polyPath(g, w.poly);
      if (w.bank) { g.lineWidth = w.bank * 1.6; g.strokeStyle = '#e1d2a8'; g.stroke(); }
      g.fillStyle = '#9cc6d4'; g.fill();
      g.lineWidth = 1.3 * px; g.strokeStyle = '#3f86a0'; g.stroke();
    }
    if (zl >= 1) { g.fillStyle = '#b8a888'; g.fill(RP.rocks); }
    if (zl >= 1) { g.fillStyle = '#e2cfa2'; g.fill(RP.lms); g.lineWidth = px; g.strokeStyle = 'rgba(90,60,40,0.55)'; g.stroke(RP.lms); }
    // railways: black with white dashes
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.lineWidth = 3.4 * px; g.strokeStyle = '#2d2628'; g.stroke(RP.rails);
    g.setLineDash([5 * px, 5 * px]); g.lineWidth = 1.5 * px; g.strokeStyle = '#f4ecd8'; g.stroke(RP.rails); g.setLineDash([]);
    // roads: casings, then fills (lanes under streets under arterials)
    g.lineCap = 'round';
    const groups = RP.groups.slice().sort((a, b) => (ROAD_STYLE[a.kind] || ROAD_STYLE.street).z - (ROAD_STYLE[b.kind] || ROAD_STYLE.street).z);
    const width = (gr) => { const st = ROAD_STYLE[gr.kind] || ROAD_STYLE.street; return Math.max(st.min * px, gr.w * (zl >= 2 ? 0.85 : 0.7)); };
    for (const gr of groups) {
      const st = ROAD_STYLE[gr.kind] || ROAD_STYLE.street;
      if (!st.casing || (gr.kind === 'lane' && zl === 0)) continue;
      g.lineWidth = width(gr) + 2 * px; g.strokeStyle = st.casing; g.stroke(gr.path);
    }
    for (const gr of groups) {
      const st = ROAD_STYLE[gr.kind] || ROAD_STYLE.street;
      if (st.dash) { g.setLineDash([3 * px, 3 * px]); g.lineWidth = Math.max(px, 1.2 * px); g.strokeStyle = st.fill; g.stroke(gr.path); g.setLineDash([]); continue; }
      g.lineWidth = width(gr); g.strokeStyle = st.fill; g.stroke(gr.path);
    }
    // district borders
    g.setLineDash([4 * px, 3 * px]); g.lineWidth = px; g.strokeStyle = 'rgba(120,80,50,0.4)';
    for (const d of D.districts || []) if (d.rect) g.strokeRect(d.rect[0], d.rect[1], d.rect[2], d.rect[3]);
    g.setLineDash([]);
    // city-guide grid (1000 u squares, A-H / 1-6)
    g.lineWidth = px; g.strokeStyle = 'rgba(60,100,170,0.2)';
    g.beginPath();
    for (let x = 1000; x < WW; x += 1000) { g.moveTo(x, 0); g.lineTo(x, WH); }
    for (let y = 1000; y < WH; y += 1000) { g.moveTo(0, y); g.lineTo(WW, y); }
    g.stroke();
    g.lineWidth = 2 * px; g.strokeStyle = '#6b4a35'; g.strokeRect(0, 0, WW, WH);
    // ---- labels (screen space)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const placed = [];
    const free = (x, y, w, h) => { for (const r of placed) if (x < r[0] + r[2] && r[0] < x + w && y < r[1] + r[3] && r[1] < y + h) return false; placed.push([x, y, w, h]); return true; };
    const halo = (txt, x, y) => { g.lineWidth = 3.2; g.strokeStyle = 'rgba(239,228,198,0.92)'; g.strokeText(txt, x, y); g.fillText(txt, x, y); };
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    // grid refs along the visible sheet edges
    g.font = "700 11px 'Baloo 2', system-ui, sans-serif"; g.fillStyle = 'rgba(50,80,140,0.75)';
    const top = Math.max(oy, 0) + 9, left = Math.max(ox, 0) + 9;
    for (let i = 0; i < 8; i++) { const sx = ox + (i + 0.5) * 1000 * s; if (sx > 14 && sx < W - 14) halo(String.fromCharCode(65 + i), sx, top); }
    for (let j = 0; j < 6; j++) { const sy = oy + (j + 0.5) * 1000 * s; if (sy > 20 && sy < H - 14) halo(String(j + 1), left, sy); }
    // water names
    const fsW = U.clamp(10 + (s / MV.fit) * 1.2, 11, 19);
    g.font = "italic 600 " + fsW.toFixed(0) + "px 'Baloo 2', system-ui, sans-serif"; g.fillStyle = '#2a6a86';
    for (const w of D.water || []) {
      if (!w.poly || w.poly.length < 3 || !w.name) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of w.poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      if ((x1 - x0) * s < 50 && (y1 - y0) * s < 50) continue;
      const c = w2s((x0 + x1) / 2, (y0 + y1) / 2), tw = g.measureText(w.name).width;
      if (c[0] < -tw || c[0] > W + tw || c[1] < -20 || c[1] > H + 20) continue;
      if (free(c[0] - tw / 2, c[1] - fsW / 2, tw, fsW)) halo(w.name, c[0], c[1]);
    }
    // district names (English + Telugu)
    const fsD = U.clamp(9 + (s / MV.fit) * 1.6, 10, 21);
    for (const d of D.districts || []) {
      if (!d.rect || !d.name) continue;
      const c = w2s(d.rect[0] + d.rect[2] / 2, d.rect[1] + d.rect[3] / 2);
      if (c[0] < -150 || c[0] > W + 150 || c[1] < -40 || c[1] > H + 40) continue;
      const name = d.name.toUpperCase();
      g.font = "800 " + fsD.toFixed(0) + "px 'Baloo 2', system-ui, sans-serif";
      try { g.letterSpacing = (fsD * 0.12).toFixed(1) + 'px'; } catch (e) { /* older canvas */ }
      const maxW = d.rect[2] * s * 0.98;
      let tw = g.measureText(name).width;
      if (tw > maxW && zl === 0) { const f2 = Math.max(8, fsD * maxW / tw); g.font = "800 " + f2.toFixed(0) + "px 'Baloo 2', system-ui, sans-serif"; tw = g.measureText(name).width; }
      if (!free(c[0] - tw / 2, c[1] - fsD * 0.7, tw, fsD * 1.4)) { try { g.letterSpacing = '0px'; } catch (e) { /* ignore */ } continue; }
      g.fillStyle = 'rgba(96,62,42,0.82)';
      halo(name, c[0], c[1]);
      try { g.letterSpacing = '0px'; } catch (e) { /* ignore */ }
      if (d.nameTe && fsD >= 12) {
        const fT = Math.round(fsD * 0.72);
        g.font = fT + "px 'Noto Sans Telugu', 'Baloo 2', sans-serif";
        const t2 = d.nameTe.split(' & ')[0], w2 = g.measureText(t2).width;
        if (free(c[0] - w2 / 2, c[1] + fsD * 0.7, w2, fT * 1.3)) { g.fillStyle = 'rgba(140,70,40,0.75)'; halo(t2, c[0], c[1] + fsD * 0.7 + fT * 0.6); }
      }
    }
    // arterial road names at district zoom and closer
    if (zl >= 1) {
      g.font = "600 " + (zl >= 2 ? 12 : 10.5) + "px 'Baloo 2', system-ui, sans-serif"; g.fillStyle = '#5a241c';
      for (const r of D.roads || []) {
        if (!r.name || !r.pts || r.pts.length < 2 || (r.kind !== 'arterial' && r.kind !== 'bund' && !(zl >= 2 && r.kind === 'street'))) continue;
        let best = -1, bi = 0;
        for (let i = 1; i < r.pts.length; i++) { const l = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); if (l > best) { best = l; bi = i; } }
        const a = r.pts[bi - 1], b = r.pts[bi];
        const tw = g.measureText(r.name).width;
        if (best * s < tw + 30) continue;
        const m = w2s((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (m[0] < 0 || m[0] > W || m[1] < 0 || m[1] > H) continue;
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        const bw = Math.abs(Math.cos(ang)) * tw + 10, bh = Math.abs(Math.sin(ang)) * tw + 10;
        if (!free(m[0] - bw / 2, m[1] - bh / 2, bw, bh)) continue;
        g.save(); g.translate(m[0], m[1]); g.rotate(ang); halo(r.name, 0, 0); g.restore();
      }
    }
    MV.labelRects = placed;
    MV.dirty = false;
  }

  // ---- overlay (every frame): icons, blips, waypoint, player
  function collectibleItems() {
    const C = N.collectibles;
    if (!C) return [];
    let list = C.items || C.list || [];
    if (list instanceof Map) list = Array.from(list.values());
    else if (!Array.isArray(list)) list = Object.values(list);
    const out = [];
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      let x = it.x, y = it.y;
      if ((!isFinite(x) || !isFinite(y)) && it.place && N.places[it.place]) { x = N.places[it.place].x; y = N.places[it.place].y; }
      if (!isFinite(x) || !isFinite(y)) continue;
      const id = it.id;
      let found = false, known = false;
      try { found = C.has ? !!C.has(id) : !!(C.found && C.found.has && C.found.has(id)); } catch (e) { /* ignore */ }
      try { known = !!(C.isKnown ? C.isKnown(id) : it.known || it.hinted || (C.known && C.known.has && C.known.has(id))); } catch (e) { /* ignore */ }
      if (found || known) out.push({ id, x, y, found, label: it.name || it.title || id, series: it.series });
    }
    return out;
  }
  function drawSprite(g, spr, x, y) { const h = spr.half; g.drawImage(spr, x - h, y - h, h * 2, h * 2); }
  function renderOver() {
    const g = MV.octx, W = MV.W, H = MV.H, dpr = MV.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const hits = (MV.hits = []);
    const zl = zoomLevel();
    const t = performance.now() / 1000;
    const inV = (p, m) => p[0] > -m && p[0] < W + m && p[1] > -m && p[1] < H + m;
    const icons = MV.icons || (MV.icons = buildIcons());
    const labels = [];
    const rS = [4.6, 6.2, 8][zl], rL = [5.6, 7.6, 9.4][zl];
    if (layerOn('services')) {
      for (const it of icons) {
        if (it.layer !== 'services' || !kindOn(it.kind)) continue;
        const p = w2s(it.x, it.y); if (!inV(p, 12)) continue;
        drawSprite(g, iconSprite('tile', zl ? it.g : null, it.c, rS, dpr), p[0], p[1]);
        hits.push({ x: p[0], y: p[1], r: rS + 4, item: it });
        if (zl >= 2) labels.push([it, p, 10.5, '#3a3030']);
      }
    }
    if (layerOn('landmarks')) {
      for (const it of icons) {
        if (it.layer !== 'landmarks') continue;
        if (zl === 0 && !it.must) continue;
        const p = w2s(it.x, it.y); if (!inV(p, 14)) continue;
        const r = it.id === 'charminar' ? rL * 1.35 : rL;
        drawSprite(g, iconSprite('badge', it.g, it.c, r, dpr), p[0], p[1]);
        hits.push({ x: p[0], y: p[1], r: r + 4, item: it });
        if ((it.must && zl >= 1) || zl >= 2 || it.id === 'charminar') labels.unshift([it, p, it.must ? 12 : 11, '#2a1a14']);
      }
    }
    if (layerOn('collectibles') && !customLayers.has('collectibles')) {
      for (const c of collectibleItems()) {
        const p = w2s(c.x, c.y); if (!inV(p, 10)) continue;
        drawSprite(g, iconSprite('star', c.found ? 'tick' : 'q', c.found ? '#9adf6a' : '#ffd84a', 5.5, dpr, false), p[0], p[1]);
        hits.push({ x: p[0], y: p[1], r: 9, item: { id: c.id, name: c.label, kind: 'collectible', found: c.found, series: c.series, x: c.x, y: c.y } });
      }
    }
    const view = { w2s, s: MV.s, W, H, zoom: zl };
    for (const L of Array.from(customLayers.values()).sort((a, b) => (a.order || 50) - (b.order || 50))) {
      if (!layerOn(L.id)) continue;
      try {
        if (L.draw) L.draw(g, view);
        if (L.points) {
          for (const q of L.points() || []) {
            if (!q || !isFinite(q.x) || !isFinite(q.y)) continue;
            const p = w2s(q.x, q.y); if (!inV(p, 12)) continue;
            const shape = q.shape || (q.icon === 'star' ? 'star' : q.icon === 'diamond' ? 'diamond' : q.icon === 'square' ? 'tile' : 'badge');
            const glyph = q.glyph || (q.done ? 'tick' : null);
            drawSprite(g, iconSprite(shape, glyph, q.color || L.color || '#ffd84a', q.r || 6, dpr, !!q.faded), p[0], p[1]);
            hits.push({ x: p[0], y: p[1], r: 10, item: { id: q.id, name: q.label || L.title, kind: L.id, x: q.x, y: q.y, layerTitle: L.title } });
          }
        }
      } catch (e) { N.err('menus.mapLayer:' + L.id, e); }
    }
    // labels for icons (greedy, avoid the base labels)
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const placed = (MV.labelRects || []).slice();
    for (const [it, p, fs, col] of labels) {
      g.font = '700 ' + fs + "px 'Baloo 2', system-ui, sans-serif";
      const tw = g.measureText(it.name).width, x = p[0] + rL + 4, y = p[1];
      let ok = x + tw < W + 40;
      for (const r of placed) if (x < r[0] + r[2] && r[0] < x + tw && y - fs / 2 < r[1] + r[3] && r[1] < y + fs / 2) { ok = false; break; }
      if (!ok) continue;
      placed.push([x, y - fs / 2, tw, fs]);
      g.lineWidth = 3; g.strokeStyle = 'rgba(239,228,198,0.95)'; g.strokeText(it.name, x, y);
      g.fillStyle = col; g.fillText(it.name, x, y);
    }
    // story: mission markers, HUD blips, waypoint
    if (layerOn('story')) {
      try {
        const mk = N.missions && N.missions.markers ? N.missions.markers() : [];
        for (const m of mk) {
          const p = w2s(m.x, m.y); if (!inV(p, 20)) continue;
          const goal = m.kind === 'goal';
          pulse(g, p, goal ? '#ff5fb0' : '#f2c230', t, 9);
          drawSprite(g, iconSprite(goal ? 'badge' : 'diamond', goal ? 'star' : null, goal ? '#ff5fb0' : '#f2c230', 7.5, dpr), p[0], p[1]);
          hits.push({ x: p[0], y: p[1], r: 13, item: { id: m.id || 'goal', name: goal ? 'Mission goal' : (m.title || 'Mission'), kind: goal ? 'goal' : 'giver', x: m.x, y: m.y } });
        }
      } catch (e) { N.err('menus.mapMarkers', e); }
      try {
        const B = N.hud && N.hud.blips;
        if (B) for (const [id, b] of B) {
          if (id === 'mn:waypoint' || /^giver:/.test(id) || b.full === false) continue;
          const q = N.hud.blipPos ? N.hud.blipPos(b) : null;
          if (!q || !isFinite(q.x) || !isFinite(q.y)) continue;
          const p = w2s(q.x, q.y); if (!inV(p, 16)) continue;
          if (b.pulse) pulse(g, p, b.color || '#ff5fb0', t, 7);
          const shape = b.icon === 'square' || b.icon === 'shop' ? 'tile' : b.icon === 'giver' || b.icon === 'diamond' ? 'diamond' : b.icon === 'star' || b.icon === 'mission' ? 'star' : 'badge';
          drawSprite(g, iconSprite(shape, null, b.color || '#ff5fb0', 6 * (b.size || 1), dpr), p[0], p[1]);
          if (b.icon === 'ring') { g.beginPath(); g.arc(p[0], p[1], 3, 0, TAU); g.fillStyle = INK; g.fill(); }
          hits.push({ x: p[0], y: p[1], r: 11, item: { id, name: b.label || 'Marker', kind: 'blip', x: q.x, y: q.y } });
        }
      } catch (e) { N.err('menus.mapBlips', e); }
    }
    if (waypoint) {
      const p = w2s(waypoint.x, waypoint.y);
      pulse(g, p, '#ff5fb0', t, 8);
      g.save(); g.translate(p[0], p[1]);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-9, -12, -8, -22, 0, -23); g.bezierCurveTo(8, -22, 9, -12, 0, 0); g.closePath();
      g.fillStyle = '#ff5fb0'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(0, -15, 3.4, 0, TAU); g.fillStyle = '#fff4dc'; g.fill();
      g.restore();
      hits.push({ x: p[0], y: p[1] - 12, r: 12, item: { id: 'mn:waypoint', name: 'Your waypoint', kind: 'waypoint', x: waypoint.x, y: waypoint.y } });
    }
    // the player: "YOU ARE HERE"
    const pl = N.player, fe = (pl && pl.vehicle) || pl;
    if (fe && isFinite(fe.x)) {
      const p = w2s(fe.x, fe.y);
      g.save(); g.translate(p[0], p[1]);
      const pr = 9 + Math.sin(t * 4) * (reduced() ? 0 : 1.2);
      g.beginPath(); g.arc(0, 0, pr + 4, 0, TAU); g.fillStyle = 'rgba(178,43,43,0.25)'; g.fill();
      g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fillStyle = '#c8231d'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
      g.rotate(fe.angle || 0);
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-4.5, -4.8); g.lineTo(-2, 0); g.lineTo(-4.5, 4.8); g.closePath(); g.fillStyle = '#fff4dc'; g.fill();
      g.restore();
      const tag = 'YOU ARE HERE';
      g.font = "800 11px 'Baloo 2', system-ui, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
      try { g.letterSpacing = '1px'; } catch (e) { /* ignore */ }
      const tw = g.measureText(tag).width + 12, ty = p[1] - 26;
      g.fillStyle = '#c8231d'; g.strokeStyle = INK; g.lineWidth = 1.5;
      g.beginPath(); roundRect(g, p[0] - tw / 2, ty - 9, tw, 18, 3); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(p[0] - 5, ty + 9); g.lineTo(p[0], ty + 15); g.lineTo(p[0] + 5, ty + 9); g.fill();
      g.fillStyle = '#fff4dc'; g.fillText(tag, p[0], ty + 1);
      try { g.letterSpacing = '0px'; } catch (e) { /* ignore */ }
    }
    if (MV.cross) {
      const cx = W / 2, cy = H / 2;
      g.strokeStyle = INK; g.lineWidth = 3; crossHair(g, cx, cy);
      g.strokeStyle = '#ff5fb0'; g.lineWidth = 1.5; crossHair(g, cx, cy);
    }
    // scale bar
    if (MV.scaleEl) {
      const kmPx = KM * MV.s;
      let km = 1;
      for (const k of [0.25, 0.5, 1, 2, 5]) { km = k; if (k * kmPx >= 46) break; }
      const w = Math.round(km * kmPx);
      if (MV._scaleW !== w) { MV._scaleW = w; MV.scaleBar.style.width = w + 'px'; MV.scaleTxt.textContent = (km < 1 ? km * 1000 + ' m' : km + ' km'); }
    }
  }
  function crossHair(g, x, y) { g.beginPath(); g.arc(x, y, 9, 0, TAU); g.moveTo(x - 16, y); g.lineTo(x - 5, y); g.moveTo(x + 5, y); g.lineTo(x + 16, y); g.moveTo(x, y - 16); g.lineTo(x, y - 5); g.moveTo(x, y + 5); g.lineTo(x, y + 16); g.stroke(); }
  function pulse(g, p, col, t, r) {
    if (reduced()) return;
    const ph = (t * 1.2) % 1;
    g.globalAlpha = 1 - ph; g.strokeStyle = col; g.lineWidth = 2;
    g.beginPath(); g.arc(p[0], p[1], r + ph * r * 1.8, 0, TAU); g.stroke();
    g.globalAlpha = 1;
  }

  // ---- place card
  function kindLabel(it) {
    if (it.kind === 'collectible') return (it.series ? it.series.charAt(0).toUpperCase() + it.series.slice(1) : 'Collectible') + (it.found ? ' · found ✓' : ' · somewhere near here');
    if (it.layerTitle) return it.layerTitle;
    if (it.kind === 'goal') return 'Where the mission wants you';
    if (it.kind === 'giver') return 'A mission starts here';
    if (it.kind === 'waypoint') return 'Pink line on the minimap';
    const ki = KI[it.kind];
    return ki ? ki.label : it.kind === 'water' ? 'Lake' : 'Place';
  }
  function showCard(it) {
    MV.sel = it;
    const c = MV.card;
    let d = null;
    try { d = N.world.built ? N.world.districtAt(it.x, it.y) : null; } catch (e) { /* ignore */ }
    const lines = [];
    const ki = KI[it.kind];
    if (it.kind === 'irani_cafe') lines.push('Irani chai · Osmania biscuits · bun maska');
    if (ki && ki.worship) lines.push('Place of worship: walk only, footwear at the stand.');
    try { const h = N.shops && (N.shops.hoursText ? N.shops.hoursText(it.id) : N.shops.hours ? N.shops.hours(it.id) : null); if (h && typeof h === 'string') lines.push(h); } catch (e) { /* ignore */ }
    if (N.flags && (N.flags['visited_' + it.id] || (N.flags.visited && N.flags.visited[it.id]))) lines.push('Visited ✓');
    try { const tv = N.collectibles && N.collectibles.triviaFor ? N.collectibles.triviaFor(it.id) : null; if (tv && typeof tv === 'string') lines.push('“' + tv + '”'); } catch (e) { /* ignore */ }
    const isWp = it.kind === 'waypoint';
    c.innerHTML =
      '<div class="mc-head"><b>' + esc(it.name) + '</b><button type="button" class="mn-x mc-x" data-mc="close" aria-label="Close">✕</button></div>' +
      '<p class="mc-kind">' + esc(kindLabel(it)) + (d ? ' · ' + esc(d.name) : '') + '</p>' +
      lines.map((l) => '<p class="mc-line">' + esc(l) + '</p>').join('') +
      '<div class="mc-btns"><button type="button" class="mn-btn small" data-nav data-mc="route">' + (isWp ? '✕ Clear waypoint' : '◎ Route here') + '</button></div>';
    c.hidden = false;
    const p = w2s(it.x, it.y);
    if (MV.W >= 560) {
      const cw = 260;
      c.style.left = Math.round(U.clamp(p[0] + 16, 8, MV.W - cw - 8)) + 'px';
      c.style.top = Math.round(U.clamp(p[1] - 30, 56, MV.H - 170)) + 'px';
    } else { c.style.left = ''; c.style.top = ''; }
    focusEl(c.querySelector('[data-mc=route]'));
    sfx('page_flip');
  }
  function hideCard() { if (MV.card && !MV.card.hidden) { MV.card.hidden = true; MV.sel = null; focusEl(MV.frame); } }
  // the icon nearest to the finger wins (ties: the one drawn on top)
  function hitAt(px, py, extra) {
    let best = null, bd = Infinity;
    for (let i = MV.hits.length - 1; i >= 0; i--) {
      const h = MV.hits[i], d = Math.hypot(h.x - px, h.y - py);
      if (d <= h.r + (extra || 0) && d < bd - 0.5) { best = h.item; bd = d; }
    }
    return best;
  }
  function waypointAt(px, py) {
    if (waypoint) { const p = w2s(waypoint.x, waypoint.y); if (Math.hypot(p[0] - px, p[1] - py) < 26) { setWaypoint(null); sfx('ui_back'); return; } }
    const w = s2w(px, py);
    setWaypoint(w[0], w[1]);
    try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) { /* ignore */ }
  }
  function crossAct() {
    const it = hitAt(MV.W / 2, MV.H / 2, 8);
    if (it) showCard(it); else waypointAt(MV.W / 2, MV.H / 2);
  }

  // ---- legend
  function renderLegend() {
    const L = MV.legend;
    const layers = LAYERS_BUILTIN.filter((l) => !(l.id === 'collectibles' && customLayers.has('collectibles'))).concat(Array.from(customLayers.values()).map((l) => ({ id: l.id, title: l.title || l.id, shape: l.icon === 'star' ? 'star' : 'badge', color: l.color || '#ffd84a', order: l.order || 50 })));
    layers.sort((a, b) => a.order - b.order);
    const counts = {};
    for (const it of MV.icons || []) if (it.layer === 'services') counts[it.kind] = (counts[it.kind] || 0) + 1;
    let h = '<p class="lg-key"><span><i class="k-dia"></i>mission</span><span><i class="k-ring"></i>goal</span><span><i class="k-tile"></i>shop</span><span><i class="k-star"></i>find</span><span><i class="k-you"></i>you</span></p>';
    for (const l of layers) {
      h += '<button type="button" class="lg-row lg-layer' + (layerOn(l.id) ? ' on' : '') + '" data-layer="' + esc(l.id) + '" aria-pressed="' + (layerOn(l.id) ? 'true' : 'false') + '">' +
        '<i class="lg-sw sh-' + l.shape + '" style="--c:' + esc(l.color) + '"></i><span>' + esc(l.title) + '</span><b class="lg-chk"></b></button>';
      if (l.id === 'services') {
        for (const cat of SV_CATS) {
          const kinds = Object.keys(KI).filter((k) => KI[k].cat === cat && counts[k]);
          if (!kinds.length) continue;
          h += '<p class="lg-cat">' + esc(cat) + '</p><div class="lg-kinds">';
          for (const k of kinds) h += '<button type="button" class="lg-kind' + (kindOn(k) ? ' on' : '') + '" data-kind="' + k + '" aria-pressed="' + (kindOn(k) ? 'true' : 'false') + '"><i class="lg-sw sh-tile" style="--c:' + KI[k].c + '"></i>' + esc(KI[k].label) + ' <small>' + counts[k] + '</small></button>';
          h += '</div>';
        }
      }
    }
    L.innerHTML = h;
  }

  const mapPanel = definePanel('map', {
    noAutoFocus: true, noDirNav: true,
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-map', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'City map');
      e.innerHTML =
        '<div class="mp-head"><div class="mp-title"><b>HYDERABAD</b><span>&amp; SECUNDERABAD · CITY GUIDE MAP · 2003</span></div>' +
        '<div class="mp-osd">▶ MAP <span class="mp-clock"></span></div>' +
        '<button type="button" class="mn-x mp-close" data-nav aria-label="Close map">✕</button></div>' +
        '<div class="mp-body"><div class="mp-view" tabindex="-1"><canvas class="mp-base"></canvas><canvas class="mp-over"></canvas>' +
        '<div class="mp-zoom"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="me" aria-label="Show me">◎</button></div>' +
        '<button type="button" class="mp-legbtn" aria-expanded="false">LEGEND</button>' +
        '<div class="mp-card" hidden></div>' +
        '<div class="mp-scale"><i></i><span>1 km</span></div>' +
        '<p class="mp-hint"></p></div>' +
        '<div class="mp-legend scroll"></div></div>';
      MV.view = e.querySelector('.mp-view'); MV.frame = MV.view;
      MV.base = e.querySelector('.mp-base'); MV.over = e.querySelector('.mp-over');
      MV.bctx = MV.base.getContext('2d'); MV.octx = MV.over.getContext('2d');
      MV.legend = e.querySelector('.mp-legend'); MV.card = e.querySelector('.mp-card'); MV.legBtn = e.querySelector('.mp-legbtn');
      MV.scaleEl = e.querySelector('.mp-scale'); MV.scaleBar = MV.scaleEl.querySelector('i'); MV.scaleTxt = MV.scaleEl.querySelector('span');
      MV.clock = e.querySelector('.mp-clock'); MV.hint = e.querySelector('.mp-hint');
      e.querySelector('.mp-close').addEventListener('click', () => { sfx('ui_back'); M.closeMap(); });
      e.querySelector('.mp-zoom').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-z]'); if (!b) return;
        if (b.dataset.z === 'in') zoomStep(1); else if (b.dataset.z === 'out') zoomStep(-1); else centerOnPlayer(true);
      });
      MV.legBtn.addEventListener('click', () => this.toggleLegend());
      MV.legend.addEventListener('click', (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.layer) setLayer(b.dataset.layer, !layerOn(b.dataset.layer));
        else if (b.dataset.kind) setKind(b.dataset.kind, !kindOn(b.dataset.kind));
        sfx('ui_click');
        renderLegend();
      });
      MV.card.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-mc]'); if (!b) return;
        if (b.dataset.mc === 'close') { sfx('ui_back'); hideCard(); return; }
        const it = MV.sel; hideCard();
        if (!it) return;
        if (it.kind === 'waypoint') setWaypoint(null); else setWaypoint(it.x, it.y);
      });
      const ov = MV.over;
      ov.addEventListener('pointerdown', (ev) => this.pDown(ev));
      ov.addEventListener('pointermove', (ev) => this.pMove(ev));
      ov.addEventListener('pointerup', (ev) => this.pUp(ev));
      ov.addEventListener('pointercancel', (ev) => { MV.pointers.delete(ev.pointerId); MV.pinch = null; MV.drag = null; this.cancelPress(); });
      ov.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const r = ov.getBoundingClientRect();
        const f = Math.exp(-U.clamp(ev.deltaY, -120, 120) * (ev.deltaMode === 1 ? 0.05 : 0.0022));
        MV.zt = null;
        zoomAt(MV.s * f, ev.clientX - r.left, ev.clientY - r.top);
      }, { passive: false });
      ov.addEventListener('dblclick', (ev) => { const r = ov.getBoundingClientRect(); zoomStep(1, ev.clientX - r.left, ev.clientY - r.top); });
      ov.addEventListener('contextmenu', (ev) => { ev.preventDefault(); const r = ov.getBoundingClientRect(); waypointAt(ev.clientX - r.left, ev.clientY - r.top); });
    },
    toggleLegend(on) {
      MV.legendOpen = on == null ? !MV.legendOpen : !!on;
      this.el.classList.toggle('leg-open', MV.legendOpen);
      MV.legBtn.setAttribute('aria-expanded', MV.legendOpen ? 'true' : 'false');
      sfx('ui_click');
      requestAnimationFrame(() => { if (isShown('map')) mapResize(); });
    },
    onOpen(o) {
      MV.icons = buildIcons();
      MV.held = {}; MV.zt = null; MV.cross = false;
      hideCard();
      const narrow = window.innerWidth < 760 || window.innerHeight < 500;
      MV.legendOpen = !narrow;
      this.el.classList.toggle('leg-open', MV.legendOpen);
      renderLegend();
      MV.hint.textContent = (N.input && N.input.device === 'touch') ? 'drag · pinch to zoom · tap a sign · long-press: waypoint' : 'drag or WASD · wheel or +/− zoom · click a sign · right-click: waypoint · Esc close';
      mapResize();
      MV.fit = Math.min(MV.W / N.WORLD_W, MV.H / N.WORLD_H) * 0.96;
      const z = o && o.zoom;
      MV.s = z === 'city' ? MV.fit : z === 'near' ? MV.fit * 8 : typeof z === 'number' ? z : MV.fit * 3;
      if (o && isFinite(o.x) && isFinite(o.y)) { MV.cx = o.x; MV.cy = o.y; } else centerOnPlayer(false);
      clampView();
      MV.clock.textContent = N.clock.dateLabel() + '  ' + N.clock.label();
      focusEl(MV.view);
      sfx('paper');
    },
    onClose() { MV.pointers.clear(); MV.drag = MV.pinch = null; this.cancelPress(); },
    back() { if (MV.card && !MV.card.hidden) { hideCard(); return; } M.closeMap(); },
    onKey(k, e) {
      const a = document.activeElement;
      if (k === 'back' || k === 'map') { if (e && e.repeat) return true; sfx('ui_back'); this.back(); return true; }
      if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { if (e) { MV.held[k] = true; MV.cross = true; return true; } return true; }
      if (k === 'zin') { zoomStep(1); return true; }
      if (k === 'zout') { zoomStep(-1); return true; }
      if (k === 'home') { centerOnPlayer(true); return true; }
      if (k === 'legend') { this.toggleLegend(); return true; }
      if (k === 'ok') {
        if (e && e.repeat) return true;
        if (a && a.tagName === 'BUTTON' && this.el.contains(a)) { a.click(); return true; }
        MV.cross = true; crossAct(); return true;
      }
      return false;
    },
    onKeyUp(k) { if (k && k in MV.held) { MV.held[k] = false; return true; } return false; },
    padMove(I) {
      const m = I.move;
      if (I.analog && (Math.abs(m.x) > 0.15 || Math.abs(m.y) > 0.15)) { MV.padX = m.x; MV.padY = m.y; MV.cross = true; return true; }
      MV.padX = MV.padY = 0;
      if (I.down('up') || I.down('down') || I.down('left') || I.down('right')) { MV.padX = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0); MV.padY = (I.down('down') ? 1 : 0) - (I.down('up') ? 1 : 0); MV.cross = true; return true; }
      return false;
    },
    update(dt) {
      const H = MV.held;
      let vx = (H.right ? 1 : 0) - (H.left ? 1 : 0) + (MV.padX || 0), vy = (H.down ? 1 : 0) - (H.up ? 1 : 0) + (MV.padY || 0);
      if (vx || vy) {
        const m = Math.hypot(vx, vy); if (m > 1) { vx /= m; vy /= m; }
        MV.cx += (vx * 560 * dt) / MV.s; MV.cy += (vy * 560 * dt) / MV.s;
        clampView();
      }
      if (MV.zt) {
        const z = MV.zt;
        z.t += dt;
        const p = U.smooth(z.t / z.dur);
        zoomAt(z.from + (z.to - z.from) * p, z.px, z.py);
        if (z.t >= z.dur) MV.zt = null;
      }
    },
    draw() {
      if (!MV.base) return;
      if (MV.dirty) { try { renderBase(); } catch (e) { N.err('menus.mapBase', e); MV.dirty = false; } }
      try { renderOver(); } catch (e) { N.err('menus.mapOver', e); }
    },
    // ---- pointer: drag pans, two fingers pinch, tap selects, long-press / right-click = waypoint
    pDown(ev) {
      if (ev.button === 2) return;
      ev.preventDefault();
      try { MV.over.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      const r = MV.over.getBoundingClientRect();
      MV.pointers.set(ev.pointerId, { x: ev.clientX - r.left, y: ev.clientY - r.top });
      MV.cross = false; MV.zt = null;
      if (MV.pointers.size === 1) {
        const p = MV.pointers.get(ev.pointerId);
        MV.drag = { x: p.x, y: p.y, cx: MV.cx, cy: MV.cy, moved: 0 };
        this.cancelPress();
        MV.press = { x: p.x, y: p.y, t: performance.now(), timer: setTimeout(() => { if (MV.press && MV.drag && MV.drag.moved < 8) { MV.press.fired = true; waypointAt(MV.press.x, MV.press.y); } }, 560) };
      } else if (MV.pointers.size === 2) {
        this.cancelPress();
        const [a, b] = Array.from(MV.pointers.values());
        MV.pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), s: MV.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, w: s2w((a.x + b.x) / 2, (a.y + b.y) / 2) };
        MV.drag = null;
      }
    },
    pMove(ev) {
      const q = MV.pointers.get(ev.pointerId);
      if (!q) return;
      const r = MV.over.getBoundingClientRect();
      q.x = ev.clientX - r.left; q.y = ev.clientY - r.top;
      if (MV.pinch && MV.pointers.size >= 2) {
        const [a, b] = Array.from(MV.pointers.values());
        const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        MV.s = MV.pinch.s * (d / MV.pinch.d);
        clampView();
        MV.cx = MV.pinch.w[0] - (mx - MV.W / 2) / MV.s; MV.cy = MV.pinch.w[1] - (my - MV.H / 2) / MV.s;
        clampView();
      } else if (MV.drag) {
        const dx = q.x - MV.drag.x, dy = q.y - MV.drag.y;
        MV.drag.moved = Math.max(MV.drag.moved, Math.hypot(dx, dy));
        if (MV.drag.moved > 4) { MV.cx = MV.drag.cx - dx / MV.s; MV.cy = MV.drag.cy - dy / MV.s; clampView(); }
        if (MV.drag.moved >= 8) this.cancelPress();
      }
    },
    pUp(ev) {
      const q = MV.pointers.get(ev.pointerId);
      MV.pointers.delete(ev.pointerId);
      if (MV.pinch) { if (MV.pointers.size < 2) { MV.pinch = null; MV.drag = null; } return; }
      const press = MV.press;
      this.cancelPress();
      if (q && MV.drag && MV.drag.moved < 8 && !(press && press.fired)) {
        const it = hitAt(q.x, q.y, ev.pointerType === 'touch' ? 8 : 2);
        if (it) showCard(it); else hideCard();
      }
      MV.drag = null;
    },
    cancelPress() { if (MV.press) { clearTimeout(MV.press.timer); MV.press = null; } },
  });
  void mapPanel;
  function centerOnPlayer(anim) {
    const p = N.player, fe = (p && p.vehicle) || p;
    if (!fe || !isFinite(fe.x)) return;
    MV.cx = fe.x; MV.cy = fe.y;
    if (anim && MV.s < MV.fit * 2.5) MV.zt = { from: MV.s, to: MV.fit * 3, t: 0, dur: reduced() ? 0.01 : 0.3, px: MV.W / 2, py: MV.H / 2 };
    clampView();
  }

  /* ============================================================ journal */
  const journalTabs = new Map();
  const extraDiary = [];
  const ignoredTabs = [];
  function addJournalTab(def) {
    if (!def || !def.id || typeof def.render !== 'function') { N.err('menus.addJournalTab', new Error('bad tab ' + (def && def.id))); return null; }
    // menus' built-in pages (story, side_a, tin, lock, dictionary) stay unless the caller says replace: true
    const old = journalTabs.get(def.id);
    if (old && old.builtin && !def.builtin && !def.replace) { ignoredTabs.push(def.id); return def.id; }
    journalTabs.set(def.id, Object.assign({ order: 50, title: def.id }, def));
    if (journal.el) journal.renderTabs();
    return def.id;
  }
  function removeJournalTab(id) { const ok = journalTabs.delete(id); if (ok && journal.el) { if (journal.cur === id) journal.cur = null; journal.renderTabs(); if (isShown('journal')) journal.select(journal.cur || sortedTabs()[0].id); } return ok; }
  const sortedTabs = () => Array.from(journalTabs.values()).sort((a, b) => a.order - b.order || String(a.title).localeCompare(String(b.title)));
  const journal = definePanel('journal', {
    noAutoFocus: true,
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-journal', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Journal');
      e.innerHTML =
        '<div class="jr">' +
        '<div class="jr-head"><div class="jr-cover"><b>MERA YAADGAAR SAAL</b><span class="jr-who"></span></div>' +
        '<button type="button" class="mn-x jr-close" aria-label="Close journal">✕</button></div>' +
        '<nav class="jr-tabs" role="tablist" aria-label="Journal pages"></nav>' +
        '<section class="jr-page scroll" role="tabpanel" tabindex="-1"></section>' +
        '<p class="jr-foot"><kbd>←</kbd><kbd>→</kbd> or <kbd>Q</kbd><kbd>E</kbd> pages &nbsp; <kbd>↑</kbd><kbd>↓</kbd> scroll &nbsp; <kbd>Esc</kbd> close</p>' +
        '</div>';
      this.dom = { tabs: e.querySelector('.jr-tabs'), page: e.querySelector('.jr-page'), who: e.querySelector('.jr-who') };
      e.querySelector('.jr-close').addEventListener('click', () => { sfx('ui_back'); M.closeJournal(); });
      this.dom.tabs.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-tab]'); if (b) this.select(b.dataset.tab); });
      this.renderTabs();
    },
    renderTabs() {
      const T = this.dom.tabs;
      T.innerHTML = '';
      sortedTabs().forEach((t, i) => {
        const b = el('button', 'jr-tab', T);
        b.type = 'button'; b.dataset.tab = t.id; b.setAttribute('role', 'tab'); b.tabIndex = -1;
        b.style.setProperty('--sp', ['#e2542b', '#2f6fb0', '#f2a72f', '#2a8c82', '#b22b2b', '#7a5ab0', '#4f7a3a'][i % 7]);
        b.innerHTML = '<span>' + esc(t.title) + '</span>' + (t.badge ? '<small>' + esc(typeof t.badge === 'function' ? t.badge() : t.badge) + '</small>' : '');
        b.classList.toggle('sel', t.id === this.cur);
        b.setAttribute('aria-selected', t.id === this.cur ? 'true' : 'false');
      });
    },
    onOpen(o) {
      this.dom.who.textContent = 'K. ' + profile.full.toUpperCase() + ' · CLASS ' + (N.clock.day > 140 ? 'VII-B' : 'VI-B');
      this.renderTabs();
      const want = (o && o.tab && journalTabs.has(o.tab)) ? o.tab : (this.cur && journalTabs.has(this.cur) ? this.cur : sortedTabs()[0].id);
      this.select(want, true);
      focusEl(this.dom.page);
      sfx('page_flip');
    },
    select(id, quiet) {
      const t = journalTabs.get(id);
      if (!t) return;
      this.cur = id;
      this.dom.tabs.querySelectorAll('.jr-tab').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); if (on && b.scrollIntoView) { try { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } } });
      const P = this.dom.page;
      P.innerHTML = '';
      P.scrollTop = 0;
      P.className = 'jr-page scroll tab-' + id.replace(/[^a-z0-9_-]/gi, '');
      try { t.render(P, { subst, names: M.names, close: () => M.closeJournal() }); } catch (e) { N.err('menus.journalTab:' + id, e); P.innerHTML = '<p class="nb-empty">This page is smudged. (' + esc(e && e.message) + ')</p>'; }
      if (!quiet) sfx('page_flip');
      N.emit('journal:tab', { id });
    },
    step(d) {
      const list = sortedTabs();
      let i = list.findIndex((t) => t.id === this.cur);
      i = (i + d + list.length) % list.length;
      this.select(list[i].id);
    },
    onKey(k, e) {
      const P = this.dom.page;
      const a = document.activeElement;
      if (k === 'back' || k === 'journal') { if (e && e.repeat) return true; sfx('ui_back'); M.closeJournal(); return true; }
      if (k === 'left' || k === 'prev') { this.step(-1); return true; }
      if (k === 'right') { this.step(1); return true; }
      if (k === 'ok') {
        if (e && e.repeat) return true;
        if (e && e.code === 'KeyE' && !isTextInput(a)) { this.step(1); return true; }
        if (a && a !== P && this.el.contains(a) && a.click && !isTextInput(a)) { a.click(); return true; }
        return true;
      }
      if (k === 'up' || k === 'down') { P.scrollTop += k === 'up' ? -70 : 70; return true; }
      if (k === 'pgup' || k === 'pgdn') { P.scrollTop += (k === 'pgup' ? -1 : 1) * P.clientHeight * 0.85; return true; }
      return false;
    },
    back() { M.closeJournal(); },
  });

  // ---- built-in tabs
  function numberInk(s) {
    return emph(s).replace(/\b(\d+|forty|fifty|hundred|thousand)\b/gi, '<u class="red-u">$1</u>');
  }
  function tapeTrackList() {
    const T = N.tape && Array.isArray(N.tape.tracks) ? N.tape.tracks : null;
    return TRACKS.map((tr) => {
      let rec = missionDone(tr.id), extra = null;
      if (T) {
        extra = T.find((x) => x && (x === tr.id || x.id === tr.id || x.mission === tr.id || x.n === tr.n)) || null;
        if (extra) rec = true;
      }
      const o = Object.assign({}, tr);
      if (extra && typeof extra === 'object' && isFinite(extra.counter)) o.counter = extra.counter;
      o.rec = rec;
      return o;
    });
  }
  addJournalTab({
    id: 'story', title: 'Story so far', order: 10, builtin: true,
    render(el0) {
      const done = TRACKS.filter((t) => missionDone(t.id));
      let h = '<div class="nb"><h3 class="nb-title">Mera Yaadgaar Saal <small>My Memorable Year</small></h3>' +
        '<p class="nb-meta"><span>Name: K. ' + esc(profile.full.toUpperCase()) + '</span><span>Class: VI-B</span><span>Teacher: Vimala Ma&#39;am</span></p>' +
        '<p class="nb-red nb-rule">One true line every Monday. <i>Sach likho.</i> — V.M.</p>';
      for (const t of done) {
        const d = DIARY[t.id];
        if (!d) continue;
        h += '<article class="nb-entry"><p class="nb-date">' + esc(d.date || t.date) + ' · TRACK ' + pad2(t.n) + '</p>' +
          '<p class="nb-text">' + numberInk(d.text) + '</p>' +
          '<p class="nb-red">' + emph(d.ink) + '</p>' + (d.mark ? '<span class="nb-mark">' + esc(d.mark) + '</span>' : '') + '</article>';
      }
      for (const d of extraDiary) {
        h += '<article class="nb-entry"><p class="nb-date">' + esc(d.date || '') + '</p><p class="nb-text">' + numberInk(subst(d.text || '')) + '</p>' +
          (d.ink ? '<p class="nb-red">' + emph(subst(d.ink)) + '</p>' : '') + (d.mark ? '<span class="nb-mark">' + esc(d.mark) + '</span>' : '') + '</article>';
      }
      if (!done.length && !extraDiary.length) h += '<p class="nb-empty">(The first page is still empty. Go and do something worth writing.)</p>';
      h += '</div>';
      el0.innerHTML = h;
    },
  });
  addJournalTab({
    id: 'side_a', title: 'Side A', order: 20, builtin: true,
    render(el0) {
      const list = tapeTrackList();
      const ctr = tapeCounter(), side = (N.tape && N.tape.side) || 'A';
      const paused = !!(N.tape && N.tape.paused);
      const canReplay = !!(N.flags && N.flags.credits_seen && N.story && typeof N.story.replay === 'function');
      let h = '<div class="jl"><div class="jl-head"><h3>' + kidCaps('SIDE A — HYDERABAD 2003', 'sidea') + '</h3>' +
        '<span class="jl-ctr' + (paused ? ' paused' : '') + '">SIDE ' + esc(side) + ' ' + pad3(ctr) + (paused ? ' ■ PAUSED' : '') + '</span></div><ol class="jl-list">';
      for (const t of list) {
        h += '<li class="' + (t.rec ? 'rec' : 'blank') + '"><span class="jl-n">' + pad2(t.n) + '</span>';
        if (t.rec) {
          h += '<span class="jl-t"><b>' + esc(t.title) + '</b> · ' + esc(t.place) + '</span><span class="jl-c">' + pad3(t.counter) + '</span>';
          if (t.scribble) h += '<span class="jl-s' + (t.hand === 'chinnu' ? ' kid' : '') + '">' + esc(t.scribble) + '</span>';
          if (canReplay) h += '<button type="button" class="mn-btn small jl-replay" data-nav data-replay="' + esc(t.id) + '">▶ Replay</button>';
        } else h += '<span class="jl-t jl-dots"></span><span class="jl-c">···</span>';
        h += '</li>';
      }
      h += '</ol><p class="jl-foot">' + (list.some((t) => t.rec) ? 'Every mission ends with ● REC: one city sound on the tape.' : 'Blank tape. Every mission ends with ● REC: one city sound goes on Side A.') + '</p></div>';
      el0.innerHTML = h;
      el0.querySelectorAll('[data-replay]').forEach((b) => b.addEventListener('click', () => {
        try { M.closeJournal(); if (isShown('pause')) M.resume(); N.story.replay(b.dataset.replay); } catch (e) { N.err('menus.replay', e); }
      }));
    },
  });
  function tinIds() {
    const T = N.tape && N.tape.tin;
    if (T && typeof T.forEach === 'function' && !Array.isArray(T)) return Array.from(T);
    if (Array.isArray(T)) return T.slice();
    return TRACKS.filter((t) => missionDone(t.id)).map((t) => t.id);
  }
  function tokenInfo(id) {
    const T = N.tape || {};
    let o = null;
    try { o = (T.tokenInfo && T.tokenInfo(id)) || (T.tokens && (T.tokens[id] || (T.tokens.get && T.tokens.get(id)))) || null; } catch (e) { o = null; }
    if (o && typeof o === 'object') return { name: o.name || o.title || id, desc: o.desc || o.text || '' };
    const f = TOKENS[id] || TOKENS[String(id).replace(/^token_/, '')];
    if (f) return { name: f[0], desc: f[1] };
    return { name: String(id).replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase()), desc: '' };
  }
  addJournalTab({
    id: 'tin', title: 'The Tin', order: 40, builtin: true,
    render(el0) {
      const ids = tinIds();
      let h = '<div class="tn"><div class="tn-lid" aria-hidden="true"><span>FRUIT BISCUITS</span><small>½ KG · HYDERABAD</small></div>';
      if (!ids.length) h += '<p class="nb-empty">' + (missionDone('lost_and_found') ? 'The tin is empty.' : 'No tin yet. Immu says a ½ kg biscuit tin from Karachi Bakery is perfect for agent work.') + '</p>';
      else {
        h += '<ul class="tn-grid">';
        ids.forEach((id, i) => {
          const t = tokenInfo(id);
          h += '<li class="tn-item" style="--r:' + ((i * 37) % 7 - 3) + 'deg"><b>' + esc(t.name) + '</b>' + (t.desc ? '<span>' + esc(t.desc) + '</span>' : '') + '</li>';
        });
        h += '</ul><p class="jl-foot">' + ids.length + (ids.length === 1 ? ' token' : ' tokens') + ' in the tin.</p>';
      }
      el0.innerHTML = h + '</div>';
    },
  });
  function lockFound(L) {
    const F = N.flags || {};
    if (F['lock_' + L.slot] || F['lock_digit_' + L.slot]) return true;
    const T = N.tape && N.tape.lock;
    if (T && (Array.isArray(T) ? T[L.slot - 1] != null : T[L.slot] != null)) return true;
    return missionDone(L.mission);
  }
  addJournalTab({
    id: 'lock', title: 'The Lock', order: 50, builtin: true,
    render(el0) {
      const found = LOCK.map(lockFound);
      let h = '<div class="lk"><div class="lk-lock" aria-label="Combination ' + LOCK.map((L, i) => (found[i] ? L.digit : 'blank')).join(' ') + '">' +
        '<div class="lk-shackle"></div><div class="lk-body">' +
        LOCK.map((L, i) => '<span class="lk-dial' + (found[i] ? ' on' : '') + '">' + (found[i] ? L.digit : '_') + '</span>').join('') + '</div></div>' +
        '<ol class="lk-list">';
      LOCK.forEach((L, i) => {
        const given = found[i] || (N.flags && N.flags['riddle_' + L.slot]);
        h += '<li class="' + (found[i] ? 'solved' : '') + '"><span class="lk-n">' + L.slot + '</span><div>' +
          (given ? '<p class="lk-r">“' + esc(L.riddle) + '”</p>' : '<p class="lk-r dim">(a riddle Immu hasn&#39;t given yet)</p>') +
          (found[i] ? '<p class="lk-a">' + esc(L.where) + ' → <b>' + L.digit + '</b></p>' : '') + '</div></li>';
      });
      h += '</ol><p class="jl-foot">Immu&#39;s handwriting. Four digits, one brass lock.</p></div>';
      el0.innerHTML = h;
    },
  });
  addJournalTab({
    id: 'dictionary', title: 'Hyderabadi dictionary', order: 90, builtin: true,
    render(el0) {
      // N.dialogue.dictionary [{word, tag, meaning}] when dialogue.js provides it, else the glossary map
      const G = {}, TAG = {};
      const dictList = N.dialogue && Array.isArray(N.dialogue.dictionary) ? N.dialogue.dictionary : null;
      if (dictList && dictList.length) { for (const d of dictList) if (d && d.word) { G[d.word] = d.meaning || ''; if (d.tag) TAG[d.word] = d.tag; } }
      else Object.assign(G, (N.dialogue && N.dialogue.glossary) || {});
      const words = Object.keys(G).filter((k) => typeof G[k] === 'string' || (G[k] && typeof G[k] === 'object')).sort((a, b) => a.localeCompare(b));
      el0.innerHTML = '<div class="dc"><div class="dc-top"><input type="search" class="dc-search" placeholder="Search: pakka, nakko, chai…" aria-label="Search the dictionary" autocomplete="off" spellcheck="false"><span class="dc-n"></span></div><dl class="dc-list"></dl></div>';
      const list = el0.querySelector('.dc-list'), n = el0.querySelector('.dc-n'), q = el0.querySelector('.dc-search');
      const meaning = (w) => { const v = G[w]; return typeof v === 'string' ? v : (v.meaning || v.text || v.t || ''); };
      const draw = () => {
        const f = q.value.trim().toLowerCase();
        let h = '', last = '', count = 0;
        for (const w of words) {
          const m = meaning(w);
          if (f && w.toLowerCase().indexOf(f) < 0 && m.toLowerCase().indexOf(f) < 0) continue;
          const L = w.charAt(0).toUpperCase();
          if (L !== last) { h += '<dt class="dc-letter">' + esc(L) + '</dt>'; last = L; }
          h += '<dt>' + esc(w) + (TAG[w] ? ' <small class="dc-tag">' + esc(TAG[w]) + '</small>' : '') + '</dt><dd>' + esc(m) + '</dd>';
          count++;
        }
        list.innerHTML = h || '<dd class="nb-empty">' + (words.length ? 'No word like that. Ask Ammamma.' : 'The dictionary is empty.') + '</dd>';
        n.textContent = count + (count === 1 ? ' word' : ' words');
      };
      q.addEventListener('input', draw);
      draw();
    },
  });

  /* ============================================================ cutscene player */
  const cs = { active: false, cur: null, time: 0, queue: Promise.resolve(), seq: 0, timers: [], tweens: [], ptr: { down: false, t: 0 } };
  const csDom = {};
  function ensureCsDom() {
    if (csDom.root) return csDom;
    const r = (csDom.root = el('div', 'mn-cs', overlayRoot()));
    r.innerHTML =
      '<div class="cs-dim"></div><div class="cs-scan"></div><div class="cs-bar t"></div><div class="cs-bar b"></div>' +
      '<div class="cs-osd"><b class="cs-osd-m"></b><span class="cs-osd-s"></span></div>' +
      '<div class="cs-stage"></div>' +
      '<button type="button" class="cs-skip" aria-label="Skip the scene"><span class="cs-skip-t">SKIP ▶▶</span><i class="cs-skip-f"></i></button>';
    csDom.dim = r.querySelector('.cs-dim'); csDom.stage = r.querySelector('.cs-stage');
    csDom.osd = r.querySelector('.cs-osd'); csDom.osdM = r.querySelector('.cs-osd-m'); csDom.osdS = r.querySelector('.cs-osd-s');
    csDom.skip = r.querySelector('.cs-skip'); csDom.skipT = r.querySelector('.cs-skip-t'); csDom.skipF = r.querySelector('.cs-skip-f');
    csDom.skip.addEventListener('pointerdown', (e) => e.stopPropagation());
    csDom.skip.addEventListener('click', (e) => { e.stopPropagation(); skipCutscene(); });
    r.addEventListener('pointerdown', (e) => { if (!cs.cur) return; cs.ptr.down = true; cs.ptr.t = performance.now(); cs.ptr.id = e.pointerId; });
    const up = (e) => {
      if (!cs.ptr.down || (cs.ptr.id != null && e.pointerId !== cs.ptr.id)) return;
      cs.ptr.down = false;
      if (performance.now() - cs.ptr.t < 320 && cs.cur) {
        if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.advance(); else csAdvance();
      }
    };
    r.addEventListener('pointerup', up);
    r.addEventListener('pointercancel', () => { cs.ptr.down = false; });
    window.addEventListener('pointerup', (e) => { if (cs.ptr.down && e.target && !r.contains(e.target)) cs.ptr.down = false; }, true);
    return csDom;
  }
  function csWait(ms, adv) {
    const C = cs.cur;
    if (!C || C.skipping || C.aborted || !(ms > 0)) return Promise.resolve(false);
    return new Promise((res) => cs.timers.push({ at: cs.time + ms / 1000, res, adv: !!adv, C }));
  }
  function csTween(ms, fn) {
    const C = cs.cur;
    if (!C || C.skipping || C.aborted || !(ms > 0)) { try { fn(1); } catch (e) { N.err('cutscene.tween', e); } return Promise.resolve(); }
    return new Promise((res) => { const tw = { t: 0, dur: ms / 1000, fn, res, C }; cs.tweens.push(tw); try { fn(0); } catch (e) { N.err('cutscene.tween', e); } });
  }
  function csTick(dt) {
    if (!cs.cur || N.state.has('paused')) return;
    cs.time += dt;
    if (cs.timers.length) {
      const due = cs.timers.filter((t) => t.at <= cs.time);
      if (due.length) { cs.timers = cs.timers.filter((t) => t.at > cs.time); for (const t of due) t.res(false); }
    }
    if (cs.tweens.length) {
      for (const tw of cs.tweens.slice()) {
        tw.t += dt;
        const p = Math.min(1, tw.t / tw.dur);
        try { tw.fn(p); } catch (e) { N.err('cutscene.tween', e); }
        if (p >= 1) { cs.tweens.splice(cs.tweens.indexOf(tw), 1); tw.res(); }
      }
    }
  }
  function flushCs(onlyAdv) {
    const keep = [];
    for (const t of cs.timers) { if (!onlyAdv || t.adv) t.res(true); else keep.push(t); }
    cs.timers = keep;
    if (!onlyAdv) { for (const tw of cs.tweens.splice(0)) { try { tw.fn(1); } catch (e) { N.err('cutscene.tween', e); } tw.res(); } }
  }
  function csAdvance() { if (cs.cur) { cs.cur.advanced = true; flushCs(true); } }
  function skipCutscene() {
    const C = cs.cur;
    if (!C || !C.skippable || C.skipping) return false;
    C.skipping = true;
    sfx('rewind');
    if (N.dialogue) { N.dialogue.skip = true; try { if (N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.cancel(); } catch (e) { N.err('cutscene.skip', e); } }
    flushCs(false);
    if (isShown('credits')) credits.finish(true);
    if (isShown('defs')) defs.finish();
    N.emit('cutscene:skip', { id: C.id });
    return true;
  }
  function abortCutscene() {
    const C = cs.cur;
    if (!C) return false;
    C.aborted = true;
    C.skipping = true;
    flushCs(false);
    if (isShown('credits')) credits.finish(true);
    if (isShown('defs')) defs.finish();
    if (C.dlg && N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) { try { N.dialogue.cancel(); } catch (e) { /* ignore */ } }
    if (C.abortRes) C.abortRes();
    return true;
  }
  function pauseCutscene() {
    if (N.state.mode !== 'cutscene' || isShown('pause')) return;
    N.state.push('paused');
    N.emit('game:pause', { cutscene: true });
    openPanel('pause');
  }
  function resolveTarget(t) {
    if (t == null) return null;
    if (Array.isArray(t)) return isFinite(t[0]) && isFinite(t[1]) ? { x: +t[0], y: +t[1] } : null;
    if (typeof t === 'string') {
      const p = N.places[t];
      if (p) return { x: p.x, y: p.y };
      const lm = (N.WORLD_DATA && N.WORLD_DATA.landmarks || []).find((l) => l.id === t);
      if (lm) return { x: lm.x, y: lm.y };
      try { const a = N.npcs && N.npcs.get && N.npcs.get(t); if (a && isFinite(a.x)) return a; } catch (e) { /* ignore */ }
      return null;
    }
    if (typeof t === 'object' && isFinite(t.x) && isFinite(t.y)) return t;
    return null;
  }
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  function setDim(v) { ensureCsDom().dim.style.opacity = String(U.clamp(v, 0, 1)); }
  function setOsd(main, sub) {
    const D = ensureCsDom();
    D.osdM.textContent = main || ''; D.osdS.textContent = sub || '';
    D.osd.classList.toggle('show', !!main);
  }
  async function fadeOutEl(e, ms) { if (!e) return; e.classList.add('out'); await csWait(ms || 260, false); e.remove(); }
  function vhsAmount(a) { return reduced() ? 0 : U.clamp(a * S.vhsScale(), 0, 1); }

  const STEPS = {
    async card(C, st) {
      const D = ensureCsDom();
      const t = subst(st.title || '');
      const kind = st.kind || (/^[▶■◀●❚]/.test(t) ? 'osd' : 'chapter');
      setDim(st.dim != null ? st.dim : kind === 'osd' ? 0.9 : 0.72);
      const c = el('div', 'cs-card k-' + kind, D.stage);
      if (kind === 'osd') {
        const parts = t.split(/\s{2,}/);
        c.innerHTML = '<div class="cs-vcr"><b>' + esc(parts[0]) + '</b>' + parts.slice(1).map((p) => '<span>' + esc(p) + '</span>').join('') + '</div>' + (st.sub ? '<p class="cs-sub">' + esc(subst(st.sub)) + '</p>' : '');
      } else if (kind === 'title') {
        c.innerHTML = '<h2 class="cs-logo">' + kidCaps(t || 'NOSTALGIA', 'cs-logo') + '</h2>' + (st.sub ? '<p class="cs-sub">' + esc(subst(st.sub)) + '</p>' : '');
      } else {
        c.innerHTML = (st.te ? '<p class="cs-te" lang="te">' + esc(st.te) + '</p>' : '') + (st.ur ? '<p class="cs-ur" lang="ur" dir="rtl">' + esc(st.ur) + '</p>' : '') +
          '<h2 class="cs-ch">' + esc(t) + '</h2>' + (st.sub ? '<p class="cs-sub">' + esc(subst(st.sub)) + '</p>' : '') + (st.text ? '<p class="cs-sub">' + esc(subst(st.text)) + '</p>' : '');
      }
      sfx(kind === 'osd' ? 'tape_click' : 'page_flip');
      await csWait(st.ms || 2600, true);
      await fadeOutEl(c, 240);
      if (st.undim !== false && !D.stage.children.length) setDim(0);
    },
    async text(C, st) {
      const D = ensureCsDom();
      const lines = (Array.isArray(st.lines) ? st.lines : [st.text || st.t || '']).map(subst);
      setDim(st.dim != null ? st.dim : 0.66);
      const box = el('div', 'cs-text' + (st.speaker ? ' has-spk' : ''), D.stage);
      if (st.speaker) el('p', 'cs-spk', box).textContent = subst(st.speaker);
      const ps = lines.map((l) => { const p = el('p', 'cs-line', box); p.innerHTML = emph(l); return p; });
      C.advanced = false;
      for (let i = 0; i < ps.length; i++) {
        ps[i].classList.add('on');
        if (C.advanced) { ps.forEach((p) => p.classList.add('on')); break; }
        if (i < ps.length - 1) await csWait(500 + lines[i].length * 34, true);
        if (C.advanced) { ps.forEach((p) => p.classList.add('on')); break; }
      }
      C.advanced = false;
      const chars = lines.reduce((a, l) => a + l.length, 0);
      await csWait(st.ms || U.clamp(1500 + chars * 32, 2200, 7000), true);
      await fadeOutEl(box, 260);
      if (!D.stage.children.length) setDim(st.keepDim ? st.dim || 0.66 : 0);
    },
    async vhs(C, st) {
      const D = ensureCsDom();
      const mode = st.mode || 'rewind';
      const LAB = { rewind: '◀◀ REWIND', ff: '▶▶ F.FWD', play: '▶ PLAY', stop: '■ STOP', rec: '● REC', pause: '❚❚ PAUSE' };
      const ms = st.ms || 1500;
      const yr = Array.isArray(st.year) ? st.year : null;
      setOsd(st.label ? subst(st.label) : LAB[mode] || mode, yr ? String(yr[0]) : st.sub ? subst(st.sub) : '');
      D.root.classList.add('vhs-on', 'vhs-' + mode);
      const amt = vhsAmount(st.amount != null ? st.amount : mode === 'rewind' || mode === 'ff' ? 0.85 : 0.4);
      if (mode === 'rewind' || mode === 'ff') N.emit('cutscene:vhs', { mode, tape: 0.55 });
      else if (mode === 'stop') { if (st.music && N.audio && N.audio.tapeStop) { try { N.audio.tapeStop(ms / 1000); } catch (e) { /* ignore */ } } else sfx('tape_stop'); }
      else if (mode === 'rec') { try { if (N.audio && N.audio.rec) N.audio.rec(st.sfx || null); else sfx('rec'); } catch (e) { sfx('rec'); } }
      else sfx('tape_click');
      const fx = N.render.fx;
      C.vhsTouched = true;
      await csTween(ms, (p) => {
        const env = st.hold ? Math.min(1, p / 0.2) : Math.min(1, p / 0.2, (1 - p) / 0.2);
        fx.vhs = amt * U.clamp(env, 0, 1);
        if (yr) D.osdS.textContent = String(Math.round(yr[0] + (yr[1] - yr[0]) * ease(p)));
      });
      if (mode === 'rewind' || mode === 'ff') { try { if (N.audio && N.audio.tape) N.audio.tape(0); } catch (e) { /* ignore */ } }
      if (!st.hold) { fx.vhs = 0; D.root.classList.remove('vhs-on', 'vhs-' + mode); setOsd(null); }
    },
    async fade(C, st) {
      const fx = N.render.fx;
      const to = st.to || 'black';
      if (to === 'white') fx.fadeColor = '#ffffff'; else if (to === 'black') fx.fadeColor = '#000000';
      const from = fx.fade || 0, target = to === 'clear' ? 0 : 1;
      await csTween(st.ms == null ? 600 : st.ms, (p) => { fx.fade = from + (target - from) * p; });
      C.faded = target > 0;
    },
    async wait(C, st) { await csWait(st.ms == null ? 1000 : st.ms, !!st.advance); },
    async say(C, st) {
      if (C.skipping || !N.dialogue || !N.dialogue.say) return;
      C.dlg = true;
      await N.dialogue.say(st.s || st.speaker || 'narrator', subst(st.t || st.text || ''), { mood: st.mood, auto: st.auto });
    },
    async talk(C, st) {
      if (C.skipping || !N.dialogue || !N.dialogue.play) return;
      C.dlg = true;
      await N.dialogue.play((st.lines || []).map((l) => (l ? Object.assign({}, l, { t: subst(l.t || l.text || '') }) : l)));
    },
    async camera(C, st) {
      const R = N.render;
      if (st.release) { R.camOverride = null; return; }
      const pos = resolveTarget(st.target != null ? st.target : (isFinite(st.x) ? { x: st.x, y: st.y } : null));
      if (!pos && !st.zoom) return;
      const from = { x: R.cam.x, y: R.cam.y, z: R.cam.zoom };
      const to = { x: pos ? pos.x + (st.dx || 0) : from.x, y: pos ? pos.y + (st.dy || 0) : from.y, z: st.zoom || from.z };
      const o = { x: from.x, y: from.y, zoom: from.z, snap: true, cs: true };
      R.camOverride = o;
      C.camTouched = true;
      const ms = st.ms == null ? 1500 : st.ms;
      await csTween(reduced() ? Math.min(ms, 600) : ms, (p) => { const e = ease(p); o.x = from.x + (to.x - from.x) * e; o.y = from.y + (to.y - from.y) * e; o.zoom = from.z + (to.z - from.z) * e; });
      if (st.warm !== false) { try { R.warmChunks(to.x, to.y, 400); } catch (e) { /* ignore */ } }
    },
    async call(C, st) { if (typeof st.fn === 'function') await st.fn({ id: C.id, skipping: C.skipping, subst }); },
    async jcard(C, st) { if (C.skipping) return; await showJcard(st, true); },
    async credits(C, st) { if (C.skipping) return; await M.credits(Object.assign({ inCutscene: true }, st)); },
    async definitions(C, st) { if (C.skipping) return; await M.definitions(st); },
    async prompt(C, st) {
      if (C.skipping) return;
      const D = ensureCsDom();
      const c = el('div', 'cs-card k-prompt', D.stage);
      const touch = N.input && N.input.device === 'touch';
      c.innerHTML = '<div class="cs-vcr big"><b>' + esc(subst(st.label || '▶ PLAY')) + '</b></div><p class="cs-sub blink">' + esc(st.hint || (touch ? 'tap to press' : 'press E / Enter')) + '</p>';
      await csWait(st.ms || 1e9, true);
      sfx('tape_click');
      await fadeOutEl(c, 200);
    },
    async sfx(C, st) { if (!C.skipping && st.name) sfx(st.name, st.x != null ? { x: st.x, y: st.y, ui: false } : {}); },
    async music(C, st) {
      try {
        const Mu = N.audio && N.audio.music;
        if (!Mu) return;
        if (st.id == null) Mu.stop(st.fade); else Mu.play(st.id, { fade: st.fade });
      } catch (e) { N.err('cutscene.music', e); }
    },
    async osd(C, st) { setOsd(subst(st.text || ''), subst(st.sub || '')); await csWait(st.ms || 1600, true); if (!st.hold) setOsd(null); },
    async counter(C, st) {
      const D = ensureCsDom();
      const c = el('div', 'cs-card k-counter', D.stage);
      c.innerHTML = '<div class="cs-vcr big"><span>SIDE ' + esc(st.side || 'A') + '</span><b class="cs-ctr">' + pad3(st.from || 0) + '</b></div>';
      const b = c.querySelector('.cs-ctr');
      const a0 = st.from || 0, a1 = st.to == null ? 999 : st.to;
      await csTween(st.ms || 2400, (p) => { b.textContent = pad3(a0 + (a1 - a0) * p); });
      await csWait(600, true);
      await fadeOutEl(c, 200);
    },
    async flash(C) { if (!C.skipping) N.render.fx.flash = document.body.classList.contains('flash-reduce') ? 0.3 : 1; },
    async title(C, st) { await STEPS.card(C, Object.assign({ kind: 'title', title: st.title || 'NOSTALGIA', ms: st.ms || 3200 }, st)); },
    async letterbox(C, st) { ensureCsDom().root.classList.toggle('lb', st.on !== false); },
    async vhsfx(C, st) { N.render.fx.vhs = vhsAmount(st.amount == null ? 0.35 : st.amount); C.vhsTouched = true; },
  };
  async function runStep(C, st) {
    const fn = STEPS[st.type];
    if (!fn) { N.err('cutscene.step', new Error('unknown step type ' + st.type)); return; }
    await fn(C, st);
  }
  async function runSteps(C, steps) {
    for (let i = 0; i < steps.length; i++) {
      if (C.aborted) return;
      let st = steps[i];
      if (typeof st === 'function') st = { type: 'call', fn: st };
      if (!st || typeof st !== 'object') continue;
      N.emit('cutscene:step', { id: C.id, i, type: st.type });
      const p = runStep(C, st).catch((e) => N.err('cutscene.' + st.type, e));
      if (st.async) C.pending.push(p); else await p;
    }
    if (C.pending.length) await Promise.all(C.pending);
  }
  function cutscene(steps, opts) {
    const list = Array.isArray(steps) ? steps : steps ? [steps] : [];
    const go = () => runCutscene(list, opts || {});
    const p = cs.queue.then(go, go);
    cs.queue = p.catch(() => null);
    return p;
  }
  async function runCutscene(steps, opts) {
    const D = ensureCsDom();
    const C = {
      id: opts.id || 'cs' + (++cs.seq), opts, skippable: opts.skippable !== false, skipping: false, aborted: false,
      pending: [], holdT: 0, pushed: false, dlgSkip: N.dialogue ? !!N.dialogue.skip : false, advanced: false,
    };
    C.abortP = new Promise((res) => { C.abortRes = res; });
    cs.cur = C; cs.active = true;
    const mode = N.state.mode;
    if (mode === 'play' || mode === 'dialogue' || mode === 'minigame' || mode === 'gameover') { N.state.push('cutscene'); C.pushed = true; }
    D.stage.innerHTML = '';
    D.root.className = 'mn-cs show' + (opts.letterbox === false ? '' : ' lb') + (C.skippable ? '' : ' noskip');
    D.skipT.textContent = N.input && N.input.device === 'touch' ? 'SKIP ▶▶' : 'HOLD E  ▶▶ SKIP';
    D.skipF.style.transform = 'scaleX(0)';
    setDim(0); setOsd(null);
    N.emit('cutscene:start', { id: C.id });
    try { await Promise.race([runSteps(C, steps), C.abortP]); } catch (e) { N.err('cutscene', e); }
    finishCutscene(C);
    return { skipped: C.skipping && !C.aborted, aborted: C.aborted };
  }
  function finishCutscene(C) {
    const D = ensureCsDom();
    if (cs.cur === C) flushCs(false);
    D.stage.innerHTML = '';
    D.root.className = 'mn-cs';
    setDim(0); setOsd(null);
    const fx = N.render.fx;
    if (C.vhsTouched) fx.vhs = 0;
    if (!C.opts.keepCamera && N.render.camOverride && N.render.camOverride.cs) N.render.camOverride = null;
    if (fx.fade > 0 && !C.opts.holdFade) fadeBack();
    if (N.dialogue) N.dialogue.skip = C.dlgSkip;
    if (C.pushed) N.state.remove('cutscene');
    if (cs.cur === C) { cs.cur = null; cs.active = false; cs.ptr.down = false; }
    N.emit('cutscene:end', { id: C.id, skipped: C.skipping && !C.aborted, aborted: C.aborted });
  }
  let fadeBackRaf = 0;
  function fadeBack() {
    cancelAnimationFrame(fadeBackRaf);
    const fx = N.render.fx, from = fx.fade, t0 = performance.now(), dur = 420;
    const tick = () => {
      if (cs.cur) return; // a new cutscene owns the fade now
      const p = Math.min(1, (performance.now() - t0) / dur);
      fx.fade = from * (1 - p);
      if (p < 1) fadeBackRaf = requestAnimationFrame(tick);
    };
    fadeBackRaf = requestAnimationFrame(tick);
  }
  function csInput(dt) {
    const C = cs.cur, I = N.input;
    if (!C || !I) return;
    if (I.pressed('pause')) { I.consume('pause'); pauseCutscene(); return; }
    if (I.pressed('action')) { I.consume('action'); csAdvance(); }
    const holding = C.skippable && (I.down('action') || cs.ptr.down);
    C.holdT = holding ? C.holdT + dt : Math.max(0, C.holdT - dt * 3);
    const D = ensureCsDom();
    D.skipF.style.transform = 'scaleX(' + U.clamp(C.holdT / 1, 0, 1).toFixed(3) + ')';
    D.root.classList.toggle('holding', C.holdT > 0.05);
    if (C.holdT >= 1) { C.holdT = 0; skipCutscene(); }
  }

  /* ============================================================ J-card line, OSD card */
  function trackFor(o) {
    if (o.id) { const t = TRACKS.find((x) => x.id === o.id); if (t) return t; }
    if (o.track || o.n) { const t = TRACKS.find((x) => x.n === +(o.track || o.n)); if (t) return t; }
    return null;
  }
  function showJcard(o, inCs) {
    o = o || {};
    const base = trackFor(o) || {};
    const n = o.track || o.n || base.n;
    const line = o.line || [n ? 'TRACK ' + pad2(n) : null, o.title || base.title, o.place || base.place].filter(Boolean).join(' · ');
    const scr = o.scribble != null ? o.scribble : base.scribble;
    const host = inCs && cs.cur ? ensureCsDom().stage : overlayRoot();
    const c = el('div', 'mn-jstrip' + (inCs && cs.cur ? ' in-cs' : ''), host);
    c.innerHTML = '<div class="js-card"><p class="js-line">' + kidCaps(subst(line), line) + '</p>' + (scr ? '<p class="js-scr' + ((o.hand || base.hand) === 'chinnu' ? ' kid' : '') + '">' + esc(subst(scr)) + '</p>' : '') +
      (o.counter != null || base.counter ? '<span class="js-ctr">SIDE A ' + pad3(o.counter != null ? o.counter : base.counter) + '</span>' : '') + '</div>';
    sfx('paper');
    const ms = o.ms || 3600;
    if (inCs && cs.cur) return csWait(ms, true).then(() => fadeOutEl(c, 260));
    return new Promise((res) => { setTimeout(() => { c.classList.add('out'); setTimeout(() => { c.remove(); res(); }, 300); }, ms); });
  }
  let osdCardEl = null, osdCardT = 0;
  function osdCard(text, o) {
    o = o || {};
    if (!osdCardEl) osdCardEl = el('div', 'mn-osdcard', overlayRoot());
    osdCardEl.innerHTML = '<b>' + esc(text || '▶ PLAY') + '</b>' + (o.sub ? '<span>' + esc(o.sub) + '</span>' : '');
    osdCardEl.classList.remove('show'); void osdCardEl.offsetWidth; osdCardEl.classList.add('show');
    clearTimeout(osdCardT);
    osdCardT = setTimeout(() => osdCardEl.classList.remove('show'), o.ms || 1500);
  }

  /* ============================================================ credits (J-card scroll) */
  let creditsResolve = null;
  const credits = definePanel('credits', {
    noAutoFocus: true,
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-credits', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Credits');
      let roll = '';
      let sec = '<section class="cr-sec">';
      for (const [k, t] of CREDITS) {
        if (k === 'gap') { sec += '</section>'; roll += sec; sec = '<section class="cr-sec">'; continue; }
        if (k === 'logo') sec += '<h2 class="cr-logo">' + kidCaps(t, 'cr') + '</h2>';
        else if (k === 'h') sec += '<h3 class="cr-h">' + kidCaps(t, t) + '</h3>';
        else if (k === 's') sec += '<p class="cr-s">' + esc(t) + '</p>';
        else if (k === 'end') sec += '<p class="cr-end">' + esc(t) + '</p>';
        else sec += '<p class="cr-p">' + esc(t) + '</p>';
      }
      roll += sec + '</section>';
      e.innerHTML =
        '<div class="cr-vcr" aria-hidden="true"><b>▶ PLAY</b><span>SIDE A</span><span class="cr-ctr">000</span></div>' +
        '<div class="cr-window"><div class="cr-card">' +
        '<div class="cr-spine" aria-hidden="true"><span>NOSTALGIA · SIDE A · HYDERABAD 2003 · SIDE B · 2026</span></div>' +
        '<div class="cr-clip"><div class="cr-roll">' + roll + '</div></div></div></div>' +
        '<p class="cr-hint"></p><button type="button" class="mn-x cr-x" aria-label="Leave the credits">✕</button>';
      this.dom = { roll: e.querySelector('.cr-roll'), clip: e.querySelector('.cr-clip'), hint: e.querySelector('.cr-hint'), ctr: e.querySelector('.cr-ctr'), secs: Array.from(e.querySelectorAll('.cr-sec')) };
      e.querySelector('.cr-x').addEventListener('click', () => { sfx('ui_back'); this.finish(true); });
      e.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.cr-x')) this.ptr = true; });
      e.addEventListener('pointerup', () => { this.ptr = false; });
      e.addEventListener('pointercancel', () => { this.ptr = false; });
    },
    onOpen() {
      this.y = this.dom.clip.clientHeight * 0.85;
      this.fast = false; this.ptr = false; this.done = false; this.t = 0; this.page = -1;
      this.paged = reduced();
      this.el.classList.toggle('paged', this.paged);
      this.dom.secs.forEach((s) => s.classList.remove('on'));
      this.dom.roll.style.transform = this.paged ? '' : 'translateY(' + this.y + 'px)';
      const touch = N.input && N.input.device === 'touch';
      this.dom.hint.textContent = touch ? 'Hold the screen: 4× · ✕ to leave' : 'Hold E: 4× · Esc to leave';
      sfx('tape_click');
    },
    onKey(k, e) {
      if (k === 'ok') { this.fast = true; return true; }
      if (k === 'back') { if (e && e.repeat) return true; sfx('ui_back'); this.finish(true); return true; }
      return k === 'up' || k === 'down' || k === 'left' || k === 'right';
    },
    onKeyUp(k) { if (k === 'ok') { this.fast = false; return true; } return false; },
    update(dt) {
      if (this.done) return;
      const I = N.input;
      const fast = this.fast || this.ptr || (I && I.down('action'));
      const sp = fast ? 4 : 1;
      this.t += dt * sp;
      if (this.paged) {
        const per = 4.2, i = Math.floor(this.t / per);
        if (i !== this.page) {
          this.page = i;
          this.dom.secs.forEach((s, j) => s.classList.toggle('on', j === i));
          if (i >= this.dom.secs.length) this.finish(false);
        }
      } else {
        this.y -= dt * 34 * sp;
        this.dom.roll.style.transform = 'translateY(' + this.y.toFixed(1) + 'px)';
        if (this.y < -this.dom.roll.scrollHeight - 30) this.finish(false);
      }
      const total = this.paged ? this.dom.secs.length * 4.2 : (this.dom.roll.scrollHeight + this.dom.clip.clientHeight) / 34;
      this.dom.ctr.textContent = pad3((this.t / Math.max(1, total)) * 999);
    },
    finish(left) {
      if (this.done) return;
      this.done = true;
      if (!left && N.state.mode !== 'title') N.flags.credits_seen = true;
      closePanel('credits');
      const r = creditsResolve; creditsResolve = null;
      if (r) r({ left: !!left });
    },
    back() { this.finish(true); },
    onClose() { if (!this.done) { this.done = true; const r = creditsResolve; creditsResolve = null; if (r) r({ left: true }); } },
  });
  function playCredits(o) {
    o = o || {};
    if (creditsResolve) { const r = creditsResolve; creditsResolve = null; r({ left: true }); }
    return new Promise((res) => { creditsResolve = res; openPanel('credits', o); });
  }

  /* ============================================================ definitions card (bible §9.3) */
  let defsResolve = null;
  const defs = definePanel('defs', {
    noAutoFocus: true,
    build() {
      const e = (this.el = el('div', 'screen mn-screen mn-defs', overlayRoot()));
      e.setAttribute('role', 'dialog');
      e.setAttribute('aria-label', 'Nostalgia, noun');
      e.innerHTML = '<div class="df-card"><h2 class="df-h">' + kidCaps('NOSTALGIA', 'df') + ' <small>(n.)</small></h2><ol class="df-list"></ol><p class="df-hint"></p></div>';
      this.dom = { list: e.querySelector('.df-list'), hint: e.querySelector('.df-hint') };
      e.addEventListener('click', () => this.advance());
    },
    onOpen(o) {
      this.dom.list.innerHTML = DEFINITIONS.map((d) => '<li><span class="df-t">' + esc(subst(d[0])) + '</span><span class="df-w">— ' + esc(subst(d[1])) + '</span></li>').join('');
      this.items = Array.from(this.dom.list.children);
      this.shown = 0; this.t = 0; this.wait = (o && o.ms) || 9000; this.done = false;
      this.dom.hint.textContent = '';
      sfx('paper');
    },
    update(dt) {
      if (this.done) return;
      this.t += dt;
      if (this.shown < this.items.length) {
        if (this.t >= (reduced() ? 0.6 : 0.95)) { this.t = 0; this.items[this.shown++].classList.add('on'); }
        if (this.shown >= this.items.length) this.dom.hint.textContent = (N.input && N.input.device === 'touch') ? 'tap to continue' : 'press E to continue';
      } else if (this.t * 1000 >= this.wait) this.finish();
    },
    advance() {
      if (this.shown < this.items.length) { this.items.forEach((i) => i.classList.add('on')); this.shown = this.items.length; this.t = 0; this.dom.hint.textContent = 'press E to continue'; return; }
      this.finish();
    },
    onKey(k, e) { if (k === 'ok' || k === 'back') { if (e && e.repeat) return true; this.advance(); return true; } return true; },
    finish() {
      if (this.done) return;
      this.done = true;
      closePanel('defs');
      const r = defsResolve; defsResolve = null;
      if (r) r();
    },
    back() { this.advance(); },
    onClose() { if (!this.done) { this.done = true; const r = defsResolve; defsResolve = null; if (r) r(); } },
  });
  function showDefinitions(o) {
    if (defsResolve) { const r = defsResolve; defsResolve = null; r(); }
    return new Promise((res) => { defsResolve = res; openPanel('defs', o || {}); });
  }

  /* ============================================================ API */
  const M = (N.menus = {
    quickStart: (() => { try { return !!navigator.webdriver; } catch (e) { return false; } })(),
    TRACKS, DIARY, TOKENS, LOCK, DEFINITIONS, CREDITS, MUST, KINDS: KI,
    // ---- engine hooks
    title() {
      closeAllPanels();
      abortCutscene();
      if (osdCardEl) osdCardEl.classList.remove('show');
      openPanel('title');
      startAttract();
    },
    pause() { if (!isShown('pause')) openPanel('pause'); else pause.refresh(); },
    resume() {
      closePanel('pause');
      if (N.state.mode === 'paused') { try { N.game.resume(); } catch (e) { N.err('menus.resume', e); } }
    },
    hideAll() {
      closeAllPanels();
      stopAttract();
      abortCutscene();
      for (const m of ['map', 'journal']) while (N.state.has(m)) N.state.remove(m);
    },
    isOpen() { return stack.length > 0; },
    openPause() { if (N.state.mode === 'cutscene') pauseCutscene(); else if (N.game && N.game.pause) N.game.pause(); },
    // ---- names
    nameEntry(o) {
      if (nameResolve) { const r = nameResolve; nameResolve = null; r(null); }
      return new Promise((res) => { nameResolve = res; openPanel('name', o || {}); });
    },
    names() { return { nick: profile.nick, full: profile.full, FULL: profile.full.toUpperCase() }; },
    setNames,
    subst,
    // ---- map / journal / settings / slots
    openMap(o) {
      const mode = N.state.mode;
      if (isShown('map')) return true;
      if (mode !== 'play' && mode !== 'paused') return false;
      N.state.push('map');
      openPanel('map', o || {});
      return true;
    },
    closeMap() { closePanel('map'); while (N.state.has('map')) N.state.remove('map'); },
    openJournal(tab) {
      const mode = N.state.mode;
      if (isShown('journal')) { if (tab) journal.select(tab); return true; }
      if (mode !== 'play' && mode !== 'paused') return false;
      N.state.push('journal');
      openPanel('journal', { tab: typeof tab === 'string' ? tab : null });
      return true;
    },
    closeJournal() { closePanel('journal'); while (N.state.has('journal')) N.state.remove('journal'); },
    addJournalTab, removeJournalTab,
    refreshJournal() { if (isShown('journal') && journal.cur) journal.select(journal.cur, true); },
    journalTabs: () => sortedTabs().map((t) => ({ id: t.id, title: t.title, order: t.order, builtin: !!t.builtin })),
    ignoredTabs,
    settings: S,
    addDiary(d) { if (d && (d.text || d.ink)) { const i = d.id ? extraDiary.findIndex((x) => x.id === d.id) : -1; if (i >= 0) extraDiary[i] = d; else extraDiary.push(d); } },
    openSettings() { openPanel('settings', { from: N.state.mode }); return true; },
    addSettingsRow,
    openSaveLoad() { openPanel('slots', { from: N.state.mode === 'title' ? 'title' : 'pause' }); return true; },
    addMapLayer(def) {
      if (!def || !def.id || (typeof def.points !== 'function' && typeof def.draw !== 'function')) { N.err('menus.addMapLayer', new Error('bad layer ' + (def && def.id))); return null; }
      customLayers.set(def.id, def);
      if (isShown('map')) renderLegend();
      return def.id;
    },
    removeMapLayer(id) { const ok = customLayers.delete(id); if (ok && isShown('map')) renderLegend(); return ok; },
    waypoint(x, y) { return setWaypoint(x, y); },
    get waypointPos() { return waypoint ? { x: waypoint.x, y: waypoint.y } : null; },
    canSave, saveManual,
    lastSaved: () => lastSaveT,
    // ---- cutscenes and story screens
    cutscene, abortCutscene, skipCutscene,
    get inCutscene() { return !!cs.cur; },
    credits: playCredits,
    definitions: showDefinitions,
    jcard(o) { return showJcard(o, !!cs.cur); },
    osdCard,
    /** Test / debug view of the menu state. */
    debugState() {
      return {
        stack: stack.slice(), top: topPanel() ? topPanel().id : null, mode: N.state.mode, cutscene: cs.cur ? cs.cur.id : null,
        focus: document.activeElement ? (document.activeElement.dataset.act || document.activeElement.className || document.activeElement.tagName) : null,
        map: isShown('map') ? { cx: Math.round(MV.cx), cy: Math.round(MV.cy), s: +MV.s.toFixed(4), fit: +MV.fit.toFixed(4), zoom: zoomLevel(), icons: (MV.icons || []).length, hits: MV.hits.length, legend: MV.legendOpen } : null,
        journal: isShown('journal') ? journal.cur : null,
        waypoint: waypoint ? { x: Math.round(waypoint.x), y: Math.round(waypoint.y) } : null,
        names: M.names(),
      };
    },
    _mapIcons: () => (MV.icons || buildIcons()).map((i) => ({ id: i.id, kind: i.kind, layer: i.layer, must: i.must })),
    /** Test hook: client-space position of a drawn map icon (null if not drawn this frame). */
    _mapHit(id) {
      const h = MV.hits.find((q) => q.item && q.item.id === id);
      if (!h || !MV.over) return null;
      const r = MV.over.getBoundingClientRect();
      return { x: r.left + h.x, y: r.top + h.y };
    },
  });

  /* ============================================================ system */
  function onResize() {
    if (isShown('map')) { requestAnimationFrame(() => { if (isShown('map')) mapResize(); }); }
  }
  N.on('game:quit', () => { abortCutscene(); setWaypoint(null); });
  N.on('render:resize', onResize);
  N.on('view:change', () => { if (isShown('title')) title.refresh(); if (isShown('settings')) settings.syncAll(); });

  N.addSystem({
    id: 'menus', order: 85, runIn: ['*'],
    init() {
      overlayRoot();
      applySettings();
      applyNames();
      ensureCsDom();
      try {
        if (N.save && N.save.register) {
          N.save.register('profile', {
            serialize: () => ({ nick: profile.nick, full: profile.full }),
            deserialize(o) {
              if (!o || typeof o !== 'object') return;
              const nick = cleanName(o.nick, 12), full = cleanName(o.full, 20);
              if (nick) profile.nick = nick;
              if (full) profile.full = full;
              lsSet(PROFILE_KEY, JSON.stringify(profile));
              applyNames();
            },
          });
        }
      } catch (e) { N.err('menus.saveRegister', e); }
      const info = latestInfo();
      if (info && info.t) lastSaveT = info.t;
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp, true);
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', () => { if (document.hidden && cs.cur && N.state.mode === 'cutscene') pauseCutscene(); });
      try { if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener('change', applySettings); } catch (e) { /* ignore */ }
      N.on('game:new', () => applySettings());
    },
    update(dt) {
      const mode = N.state.mode, I = N.input;
      csTick(dt);
      // keep the panels in step with the state stack (scripts / tests may resume or load directly)
      if (isShown('pause') && !N.state.has('paused')) closePanel('pause');
      if (isShown('map') && !N.state.has('map')) closePanel('map');
      if (isShown('journal') && !N.state.has('journal')) closePanel('journal');
      if (mode !== 'title') { if (isShown('title')) closePanel('title'); stopAttract(); } else updateAttract(dt);
      if (waypoint && mode === 'play') {
        const p = N.player, fe = (p && p.vehicle) || p;
        if (fe && Math.hypot(fe.x - waypoint.x, fe.y - waypoint.y) < 48) { setWaypoint(null); try { N.hud.toast('Waypoint reached.', 1800); } catch (e) { /* ignore */ } }
      }
      const P = topPanel();
      if (P) {
        if (P.update) { try { P.update(dt); } catch (e) { N.err('menus.update:' + P.id, e); } }
        padNav(P);
        return;
      }
      if (mode === 'paused') { openPanel('pause'); return; }
      if (cs.cur && (mode === 'cutscene' || mode === 'title')) { csInput(dt); return; }
      if (!I) return;
      if (mode === 'play') {
        if (I.pressed('pause')) { I.consume('pause'); N.game.pause(); return; }
        if (I.pressed('map')) { I.consume('map'); M.openMap(); return; }
        if (I.pressed('journal')) { I.consume('journal'); M.openJournal(); return; }
      } else if (mode === 'dialogue') {
        if (I.pressed('pause')) { I.consume('pause'); N.game.pause(); }
      }
    },
    draw() {
      if (isShown('map') && MV.base) mapPanel.draw();
    },
    reset() {
      applyNames();
      waypoint = null;
    },
  });
  applySettings();
})();
