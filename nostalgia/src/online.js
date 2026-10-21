/* NOSTALGIA — online.js
 * Online play (ARCHITECTURE §23, design/online_setup.md): a PLAYER CODE identity, cloud saves and the
 * journey, and shared city rooms of up to 3 friends (N.ONLINE_CONFIG.maxPlayers) who see each other as ghosts and
 * meet at one place. Story, missions, the Chappal Meter and traffic stay single-player: remote players are drawn.
 *
 * THE ROOM FLOW (owner: "you go into online game and it should automatically take you into the game"):
 *   Title / pause -> ONLINE -> "Create a room" or a code + "Join" -> the panel shows the room code for a moment
 *   (TUNE.flowMs) -> straight into the world: from the title the saved game continues (N.game.continueGame, the latest
 *   slot), or with no save a new game starts with the intro skipped (N.game.newGame({skipIntro}) + the flags the
 *   2026 prologue would leave, so the story can still begin at M1's giver); from the pause deck the game resumes.
 *   A joiner (unless already within ~100 m) is placed a few metres from the earliest player in the room (walkable ground, off the road when
 *   there is a footpath, no wall in between) once that friend's position arrives; during a mission, a party
 *   game or a chase they are never moved: a pink route + the 👫 "Go to friends" button instead (HUD + panel).
 *   One create / join at a time (a double tap gets the same answer), one game start.
 * NEARBY FOR THE GROUP (in a room, play mode, no mission / party game / chase): a HUD card (a chip on phones)
 *   with the 3-4 placed activities nearest the group's centre (N.party.available: whatever is registered,
 *   seasonal ones only in season) + one open snack stop (N.shops), each with its distance from me and a one-tap
 *   "Challenge" (N.party.quick); when everybody in the room is within ~60 m of one: "You're all at Gokul Chat —
 *   Pani puri contest? [🏁 Start]" (once per arrival, rate-limited).
 *
 * Backend: Supabase (N.ONLINE_CONFIG in src/online_config.js). Nothing loads until the player opens Online
 * (or has used it before on this device: then the SDK loads quietly after boot to mirror the saves).
 *   - SDK: @supabase/supabase-js 2.118.0 UMD from jsDelivr, then vendor/supabase/supabase.js (../ for dist/).
 *   - Identity: a random player code WORD-WORD-WORD-NNNN-XXXXX (256 words, 4 digits, 5 Crockford base-32
 *     chars: ~62 bits) kept in localStorage 'nostalgia.online.v1'. "Use my code" moves it to another phone.
 *     No accounts, no email, nothing personal: the database keys rows by sha256(code). The code is shaped so
 *     an email / Google sign-in can be added later as another identity behind the same backend calls (ID).
 *   - Saves / journey / nickname: Postgres SECURITY DEFINER functions (supabase/migrations/*_online.sql):
 *     save_put(code, slot, data, version), save_get(code), journey_put(code, data), journey_get(code),
 *     profile_set(code, nick), profile_get(code). They validate sizes, rate-limit per code and keep the
 *     newer-save guard (never replace a later save or one from a newer build); the client checks the same
 *     thing first through N.save.canReplace / importBlob (save.js).
 *   - Rooms: public Realtime channels 'room:<CODE>' (e.g. room:CHAI-42), config {broadcast: {self: false},
 *     presence: {key: <random id per page load>}}. Presence meta {n: nick, l: look, j: joined ms, pin, pc}
 *     gives the player list, the 3-player cap (checked before tracking; the latest joiners leave if a race
 *     overfills it) and the meet pin (it lives in the dropper's meta, so late joiners see it). Broadcast 'st'
 *     carries {x, y, a, m: 'f'|'v', vt, vc, sp, an: 'i'|'w'|'r', n?, l?} at up to stateHz (8; fewer per player
 *     in a big room), only on change plus a 2 s keepalive (and at once, full, when someone joins, so a joiner
 *     finds their friends quickly); 'em' carries a quick-chat id. A room ends when its
 *     last player leaves (no tables). Every incoming field is validated and clamped here (channels are public).
 *   - Ghosts: one entity per remote player, kind 'ghost' (solid false, noCollide, selfUpdate), so traffic,
 *     vehicles, wanted, missions and saves ignore it. 2D: traffic.js blitPerson / the vehicle type's own
 *     draw(); 3D: e.view3d = 'ped' | 'vehicle' reuses view3d_actors.js. Nameplates (DOM), minimap dots
 *     (N.hud.blip), quick-chat bubbles (N.dialogue.bark, re-anchored to 3D heads by view3d_actors.js).
 *     Motion: 120 ms interpolation delay + up to 250 ms extrapolation, snap on teleports.
 *
 * API  N.online = {
 *   available -> 'ok' | 'soon' (no config) | 'web' (file:// page)   ready (SDK loaded)   status   lastError
 *   open({from}) / close()        the Online panel (title ONLINE track, pause Online key, the HUD room badge)
 *   code, nick, setNick(s) -> Promise<{ok, why}>   useCode(code) -> Promise<{ok, why}>   newCode()
 *   cleanNick(s), nickOk(s) -> {ok, why}, normCode(s), codeOk(s)
 *   cloud: {pull(), push(slot?), state}   journey() -> the local journey summary   pushJourney()
 *   createRoom() / joinRoom(code) / leaveRoom() -> Promise<{ok, why, code?}>   room -> {code, players[], n} | null
 *   goToFriends() -> {ok, why, waypoint?}   startGame() (into the city from the title, while in a room)
 *   nearby(max) -> [{id, name, icon, kind: 'party' | 'shop', at, x, y, dMe, dAll}]   flow (state for tests)
 *   dropPin(placeId | null (here)) / clearPin()   say(id)   PHRASES   MEET_PLACES   MAX (3)
 *   titleLine() / pauseLine()   _debug {...} (tests)
 *   [party hook] channelSend(type, data) -> bool · onMessage(fn) -> off() · players() · partyRpc(fn, args) · myKey
 *     (src/party.js, ARCHITECTURE §24: the 'pt' broadcast on the room channel; the Online panel's "Challenge friends"
 *     section via N.party.panelHtml / panelAct; a 🏁 button in the quick-chat strip -> N.party.openPicker)
 * }
 * Events: 'online:status' {status}, 'online:room' {code | null}, 'online:players' {n}, 'online:pin' {pin},
 *   'online:chat' {from, id, text}, 'online:cloud' {what, slot?, why?}, 'online:start' {how: 'continue' | 'new'},
 *   'online:gather' {ok, why?, auto, x?, y?}, 'online:arrive' {id, at}.
 * Deviation (ARCHITECTURE §2): online play fetches the SDK from jsDelivr and talks to Supabase; it is opt-in,
 * lazy, and the guest / offline game never touches the network.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const LS_KEY = 'nostalgia.online.v1';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  function sfx(name) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, { ui: true }); } catch (e) { /* audio never breaks menus */ } }
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600, { key: 'online' }); } catch (e) { /* ignore */ } }

  /* ================================================================ config */
  function cfg() {
    const c = N.ONLINE_CONFIG;
    return c && typeof c === 'object' && typeof c.url === 'string' && typeof c.key === 'string' && c.url && c.key ? c : null;
  }
  function availability() {
    if (!cfg()) return 'soon';
    if (!/^https?:$/.test(location.protocol)) return 'web';
    return 'ok';
  }
  const MAX = () => clamp(((cfg() && cfg().maxPlayers) | 0) || 3, 2, 10);
  const M_PER_U = 1.6; // metres per world unit (ARCHITECTURE §4)
  function fmtDist(u) { const m = Math.max(0, u) * M_PER_U; return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m'; }
  const SITE = 'https://vivkv07.github.io/DS/';

  /* ================================================================ local profile */
  // {code, nick, cloud: {main: {t, v}, manual: {t, v}}, journeyHash}
  const P = (() => {
    let o = null;
    try { o = JSON.parse(lsGet(LS_KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') o = {};
    return { code: typeof o.code === 'string' ? o.code : null, nick: typeof o.nick === 'string' ? o.nick : null, cloud: o.cloud && typeof o.cloud === 'object' ? o.cloud : {}, journeyHash: o.journeyHash || null, dismissed: o.dismissed || {} };
  })();
  function saveProfile() { lsSet(LS_KEY, JSON.stringify(P)); }

  /* ================================================================ player code */
  const WORDS = ('CHAI PATANG GULLY BIRYANI IRANI SAMOSA LASSI KULFI HALEEM DOSA IDLI VADA BHAJJI PANIPURI BHEL JALEBI ' +
    'LADDU BARFI HALWA KHEER MIRCHI PICKLE PAPAD ROTI PULAO KHICHDI RASAM SAMBAR CHUTNEY MANGO GUAVA JAMUN CHIKOO PAPAYA ' +
    'BANANA COCONUT LEMON GRAPE ORANGE MELON BHUTTA PEANUT CASHEW BISCUIT TOFFEE ECLAIR GOLI LATTU KANCHA GILLI DANDA ' +
    'KABADDI KHOKHO CRICKET BAT BALL STUMPS WICKET SIXER FOUR BOUNDARY KITE MANJA CHARKHA SPOOL CYCLE BELL SCOOTER CHETAK ' +
    'LUNA AUTO RICKSHAW BUS TRAIN TRAM BOAT JETTY BRIDGE TANK BUND LAKE RIVER PARK GARDEN TEMPLE TOWER CLOCK FORT GATE ARCH ' +
    'DOME MINAR BAZAAR CHOWK MANDI GALI ROAD LANE COLONY TERRACE ROOFTOP BALCONY WINDOW DOOR STAIRS LADDER CHARPAI MAT FAN ' +
    'COOLER RADIO CASSETTE TAPE WALKMAN VCR CINEMA TICKET POPCORN COMIC STAMP COIN MARBLE PEBBLE SHELL FEATHER LEAF NEEM ' +
    'BANYAN PEEPAL TAMARIND ROSE JASMINE LOTUS MARIGOLD SUNNY CLOUDY RAINY BREEZE MONSOON PUDDLE RAINBOW THUNDER STAR MOON ' +
    'COMET PLANET ROCKET COMPASS MAP GLOBE ATLAS PENCIL ERASER CRAYON CHALK SLATE INKPEN NOTEBOOK SCHOOL TIFFIN SATCHEL ' +
    'UNIFORM BADGE TROPHY MEDAL RIBBON PARROT MYNA SPARROW PIGEON PEACOCK CROW KOEL EAGLE OWL SQUIRREL MONKEY ELEPHANT TIGER ' +
    'LION HORSE CAMEL GOAT COW BUFFALO PUPPY KITTEN RABBIT TORTOISE FROG FISH CRAB TURTLE DOLPHIN WHALE BEETLE FIREFLY HONEY ' +
    'SUGAR SALT SPICE PEPPER GINGER CARDAMOM SAFFRON CLOVE MINT TULSI MASALA TEA COFFEE MILK BUTTER GHEE CURD PANEER BREAD ' +
    'BUN RUSK CAKE PASTRY CANDY CHOCO JELLY SODA GOLA SHERBET NIMBU KAJU BADAM PISTA KISMIS ANAR AMLA BER SITAPHAL ' +
    'TORCH LANTERN DIYA CANDLE LAMP MIRROR COMB BUCKET MUG GLASS PLATE SPOON KETTLE STOVE TAWA KADAI POT JAR DRUM FLUTE ' +
    'VEENA TABLA DHOLAK SITAR').split(' ').slice(0, 256);
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford (no I L O U)
  const CODE_RE = /^[A-Z]{3,8}-[A-Z]{3,8}-[A-Z]{3,8}-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{5}$/;
  function randBytes(n) {
    const a = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (let i = 0; i < n; i++) a[i] = (Math.random() * 256) | 0;
    return a;
  }
  function randInt(n) { // unbiased 0..n-1 (n <= 65536)
    const lim = 65536 - (65536 % n);
    for (;;) { const b = randBytes(2), v = b[0] * 256 + b[1]; if (v < lim) return v % n; }
  }
  function newCode() {
    const w = [0, 1, 2].map(() => WORDS[randInt(WORDS.length)]);
    const d = String(randInt(10000)).padStart(4, '0');
    let t = '';
    for (let i = 0; i < 5; i++) t += B32[randInt(32)];
    return w.join('-') + '-' + d + '-' + t;
  }
  /** Tidy what a player typed: case, spaces / dots for dashes, O/I/L read as 0/1/1 in the last group. */
  function normCode(s) {
    const parts = String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-');
    if (parts.length === 5) parts[4] = parts[4].replace(/O/g, '0').replace(/[IL]/g, '1');
    return parts.join('-');
  }
  const codeOk = (s) => CODE_RE.test(normCode(s));
  const CODE_BITS = Math.log2(WORDS.length) * 3 + Math.log2(10000) + 25;

  /* ================================================================ nicknames (kid-friendly) */
  const BAD = ['fuck', 'fuk', 'shit', 'bitch', 'bastard', 'sex', 'porn', 'nude', 'nazi', 'hitler', 'dick', 'cock', 'cunt', 'pussy', 'boob',
    'penis', 'vagina', 'slut', 'whore', 'rape', 'kill', 'die', 'dead', 'drug', 'weed', 'beer', 'nigg', 'fag', 'retard', 'idiot', 'stupid',
    'chutiya', 'chutia', 'madarc', 'behenc', 'bhosd', 'gaand', 'gand', 'randi', 'lund', 'loda', 'lavda', 'kutta', 'kamina', 'saala', 'sala',
    'haraam', 'harami', 'lanja', 'dengu', 'pooku', 'gudda', 'modda', 'admin', 'moderator'];
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g' };
  /** Letters, digits and single inner spaces; at most 12 characters. */
  function cleanNick(s) { return String(s || '').replace(/[^A-Za-z0-9 ]/g, '').replace(/ {2,}/g, ' ').replace(/^ +/, '').slice(0, 12); }
  function nickOk(s) {
    const n = cleanNick(s).trim();
    if (n.length < 3) return { ok: false, why: 'At least 3 letters.' };
    if (!/^[A-Za-z0-9][A-Za-z0-9 ]{1,10}[A-Za-z0-9]$/.test(n)) return { ok: false, why: 'Letters and numbers only (3-12).' };
    const flat = n.toLowerCase().replace(/[0-9]/g, (c) => LEET[c] || '').replace(/[^a-z]/g, '');
    const flat2 = flat.replace(/(.)\1+/g, '$1');
    if (BAD.some((b) => flat.indexOf(b) >= 0 || flat2.indexOf(b) >= 0)) return { ok: false, why: 'Pick a kinder name.' };
    return { ok: true, why: null, nick: n };
  }

  /* ================================================================ quick-chat + meet places */
  const PHRASES = [
    { id: 'aaja', text: 'Aaja!' }, { id: 'chai', text: 'Chai?' }, { id: 'race', text: 'Race to Tank Bund!' },
    { id: 'wait', text: 'Ruko, coming!' }, { id: 'here', text: 'I am here!' }, { id: 'bye', text: 'Bye, see you!' },
    { id: 'wave', text: '👋', emote: true }, { id: 'thumbs', text: '👍', emote: true },
  ];
  const PHRASE = new Map(PHRASES.map((p) => [p.id, p]));
  const MEET = [
    ['irani_cafe_2', 'Irani café, Abids'], ['charminar_plaza', 'Charminar'], ['tank_bund', 'Tank Bund'], ['lumbini_park', 'Lumbini Park'],
    ['gokul_chat', 'Gokul Chat, Koti'], ['secunderabad_clock_tower', 'Clock Tower, Secunderabad'], ['paradise', 'Paradise'],
    ['nampally_exhibition', 'Numaish, Nampally'], ['lb_stadium', 'LB Stadium'], ['birla_mandir', 'Birla Mandir'], ['nehru_zoo', 'Nehru Zoo'],
    ['golconda_fort', 'Golconda Fort'],
  ];
  const meetPlaces = () => MEET.filter(([id]) => N.places && N.places[id]).map(([id, label]) => ({ id, label }));
  const ROOM_WORDS = ['CHAI', 'BIRYANI', 'IRANI', 'PATANG', 'GULLY', 'LATTU', 'KANCHA', 'GOLI', 'SAMOSA', 'LASSI', 'KULFI', 'DOSA',
    'JALEBI', 'MIRCHI', 'BHUTTA', 'CHETAK', 'LUNA', 'AUTO', 'MINAR', 'BAZAAR', 'CHOWK', 'BUND', 'TANK', 'KITE', 'MANJA', 'SIXER',
    'COLONY', 'TERRACE', 'NEEM', 'MANGO', 'GUAVA', 'TIFFIN', 'RADIO', 'TAPE', 'CYCLE', 'PARROT'];
  const ROOM_RE = /^[A-Z]{3,8}-[0-9]{2}$/;
  const normRoom = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').replace(/^([A-Z]+)([0-9]+)$/, '$1-$2');
  const newRoomCode = () => ROOM_WORDS[randInt(ROOM_WORDS.length)] + '-' + String(randInt(100)).padStart(2, '0');

  /* ================================================================ status */
  const S = { status: 'idle', lastError: null, client: null, loading: null };
  function setStatus(st, err) {
    S.status = st;
    if (err !== undefined) S.lastError = err;
    N.emit('online:status', { status: st, error: S.lastError });
    renderPanel();
  }

  /* ================================================================ SDK loader */
  function loadScript(src, ms) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; s.remove(); reject(new Error('timeout ' + src)); } }, ms || 15000);
      s.src = src; s.async = true; s.crossOrigin = /^https?:/.test(src) ? 'anonymous' : null;
      s.onload = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
      s.onerror = () => { if (!done) { done = true; clearTimeout(t); s.remove(); reject(new Error('failed ' + src)); } };
      document.head.appendChild(s);
    });
  }
  async function loadSdk() {
    if (window.supabase && window.supabase.createClient) return window.supabase;
    const list = (cfg() && Array.isArray(cfg().sdk) && cfg().sdk.length) ? cfg().sdk : ['vendor/supabase/supabase.js'];
    let last = null;
    for (const src of list) {
      try { await loadScript(src); if (window.supabase && window.supabase.createClient) return window.supabase; } catch (e) { last = e; }
    }
    throw last || new Error('supabase sdk missing');
  }
  /** Load the SDK and make the client (once). Resolves to the client or throws. */
  function ensureClient() {
    if (S.client) return Promise.resolve(S.client);
    if (availability() !== 'ok') return Promise.reject(new Error(availability()));
    if (!S.loading) {
      setStatus('loading');
      S.loading = loadSdk().then((sb) => {
        const c = cfg();
        S.client = sb.createClient(c.url, c.key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          // vsn 1.0.0: the JSON protocol (the hosted server speaks both; the test stand-in speaks this one)
          realtime: { params: { eventsPerSecond: 20 }, vsn: '1.0.0' },
        });
        if (c.realtimeKey) { try { Promise.resolve(S.client.realtime.setAuth(c.realtimeKey)).catch((e) => N.err('online.realtimeKey', e)); } catch (e) { N.err('online.realtimeKey', e); } }
        setStatus('ready', null);
        return S.client;
      }).catch((e) => { S.loading = null; setStatus('offline', 'Could not reach the online server. Check the internet and try again.'); throw e; });
    }
    return S.loading;
  }

  /* ================================================================ backend calls (identity: player code) */
  // ID = the current identity. Today only the player code; an email / Google sign-in would add another kind
  // here and the same calls would pass its user instead (design/online_setup.md "Later").
  const ID = { kind: 'code', get value() { return P.code; } };
  async function rpc(fn, args) {
    const c = await ensureClient();
    const { data, error } = await c.rpc(fn, Object.assign({ code: ID.value }, args || {}));
    if (error) throw new Error(error.message || String(error));
    return data || { ok: false, reason: 'empty' };
  }
  function ensureCode() {
    if (!P.code || !CODE_RE.test(P.code)) { P.code = newCode(); saveProfile(); }
    return P.code;
  }

  /* ================================================================ nickname */
  function defaultNick() {
    const n = N.player && (N.player.nick || N.player.name);
    const r = nickOk(n || '');
    return r.ok ? r.nick : 'Player' + String(randInt(100)).padStart(2, '0');
  }
  async function setNick(s) {
    const r = nickOk(s);
    if (!r.ok) return r;
    P.nick = r.nick; saveProfile();
    if (R.ch) { try { await trackMe(); } catch (e) { N.err('online.trackNick', e); } }
    renderPanel();
    if (availability() !== 'ok') return { ok: true, why: null, local: true };
    try {
      ensureCode();
      const res = await rpc('profile_set', { nick: r.nick });
      if (!res.ok) return { ok: false, why: res.reason === 'bad_nick' ? 'Pick a kinder name.' : 'Could not save the name (' + res.reason + ').' };
      return { ok: true, why: null };
    } catch (e) { return { ok: true, why: 'Saved on this phone; the cloud will get it next time.' }; }
  }

  /* ================================================================ cloud saves */
  const SLOT_ID = { main: 0, manual: 1 }, ID_SLOT = ['main', 'manual'];
  const CL = { busy: false, offer: null, note: '', lastPush: 0, pushT: null, pulled: false };
  const saveApi = () => N.save && N.save.slotBlob ? N.save : null;
  function blobLine(b) {
    const m = (b && b.meta) || {};
    const track = Math.min(12, Math.max(1, (m.missions | 0) + 1));
    return 'TRACK ' + String(track).padStart(2, '0') + ' · ' + (m.date || '') + (m.money != null ? ' · ₹' + Math.floor((m.money || 0) / 100) : '');
  }
  /** Read the cloud slots; push what is newer here, offer what is newer there. */
  async function cloudPull() {
    const SV = saveApi();
    if (!SV || !P.code) return { ok: false, why: 'no_code' };
    CL.busy = true; renderPanel();
    try {
      const res = await rpc('save_get');
      if (!res.ok) throw new Error(res.reason);
      if (res.nick && !P.nick) { P.nick = res.nick; saveProfile(); }
      const cloud = {};
      for (const row of res.saves || []) { const slot = ID_SLOT[row.slot]; if (slot) cloud[slot] = row; }
      let offer = null;
      for (const slot of SV.SLOTS) {
        const row = cloud[slot];
        P.cloud[slot] = row ? { t: +row.t || 0, v: row.version | 0 } : null;
        const local = SV.slotBlob(slot);
        if (!row) { if (local) await cloudPush(slot, true); continue; }
        if ((row.version | 0) > SV.VERSION) { CL.note = 'The cloud has a save from a newer version of the game. Update to use it.'; continue; }
        const c = SV.canReplace(slot, row.data);
        if (c.ok) {
          if (slot === 'main' && P.dismissed.main !== row.t) offer = { slot, blob: row.data, t: row.t, line: blobLine(row.data) };
          else if (slot === 'manual' && !local) SV.importBlob('manual', row.data); // a missing manual copy just comes down
        } else if (c.why === 'local_newer') await cloudPush(slot, true);
      }
      saveProfile();
      CL.pulled = true;
      if (offer) showOffer(offer);
      N.emit('online:cloud', { what: 'pull', offer: !!offer });
      return { ok: true, offer: !!offer };
    } catch (e) {
      CL.note = 'Cloud save is not reachable right now.';
      return { ok: false, why: String(e.message || e) };
    } finally { CL.busy = false; renderPanel(); }
  }
  /** Mirror one slot (or both) up, unless the cloud already holds a newer one. */
  async function cloudPush(slot, quiet) {
    const SV = saveApi();
    if (!SV || !P.code || availability() !== 'ok') return { ok: false, why: 'off' };
    const slots = slot ? [slot] : SV.SLOTS;
    let last = { ok: true };
    for (const s of slots) {
      const b = SV.slotBlob(s);
      if (!b) continue;
      const known = P.cloud[s];
      if (known && (known.v > b.v || known.t > b.t)) { last = { ok: false, why: 'newer_save' }; continue; } // never over a newer cloud save
      if (known && known.t === b.t) continue;
      try {
        const res = await rpc('save_put', { slot: SLOT_ID[s], data: b, version: b.v | 0 || 1 });
        if (res.ok) { P.cloud[s] = { t: b.t, v: b.v }; CL.lastPush = Date.now(); N.emit('online:cloud', { what: 'push', slot: s }); }
        else {
          if (res.reason === 'newer_save' || res.reason === 'newer_build') { P.cloud[s] = { t: +res.cloud_t || 0, v: res.cloud_v | 0 }; if (!quiet) CL.note = 'The cloud has a newer save; it was kept.'; }
          N.emit('online:cloud', { what: 'refused', slot: s, why: res.reason });
          last = { ok: false, why: res.reason };
        }
      } catch (e) { last = { ok: false, why: 'net' }; }
    }
    saveProfile(); renderPanel();
    return last;
  }
  function schedulePush() {
    if (!P.code || availability() !== 'ok') return;
    clearTimeout(CL.pushT);
    CL.pushT = setTimeout(() => { cloudPush(null, true).then(() => pushJourney()).catch((e) => N.err('online.push', e)); }, 1200);
  }
  function takeOffer() {
    const o = CL.offer;
    if (!o) return false;
    const SV = saveApi();
    const r = SV.importBlob(o.slot, o.blob);
    CL.offer = null; hideOffer();
    if (!r.ok) { toast(r.why === 'local_newer' ? 'This phone has a newer save. Kept it.' : 'Could not use the cloud save.'); renderPanel(); return false; }
    P.cloud[o.slot] = { t: o.t, v: o.blob.v }; saveProfile();
    toast('Cloud save is on this phone now.', 2600);
    if (N.state.mode !== 'title' && N.state.mode !== 'boot') { try { if (N.game.continueGame() && N.menus.osdCard) N.menus.osdCard('▶ PLAY', { sub: N.clock.dateLabel() + '  ' + N.clock.label(), ms: 1500 }); } catch (e) { N.err('online.loadCloud', e); } }
    try { if (N.menus.refreshTitle) N.menus.refreshTitle(); } catch (e) { /* ignore */ }
    renderPanel();
    return true;
  }
  function keepLocal() { if (CL.offer) { P.dismissed.main = CL.offer.t; saveProfile(); } CL.offer = null; hideOffer(); renderPanel(); }

  // the "newer save in the cloud" card (works over the title screen and in play)
  let offerEl = null;
  function showOffer(o) {
    CL.offer = o;
    if (!offerEl) {
      offerEl = document.createElement('div');
      offerEl.className = 'ol-offer';
      offerEl.setAttribute('role', 'dialog');
      offerEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-ol]');
        if (!b) return;
        if (b.dataset.ol === 'take') takeOffer(); else keepLocal();
      });
      (document.getElementById('overlay') || document.body).appendChild(offerEl);
    }
    offerEl.innerHTML = '<p class="ol-offer-t">A newer save is in the cloud</p><p class="ol-offer-l">' + esc(o.line) + '</p>' +
      '<div class="ol-row"><button type="button" class="mn-btn small" data-ol="take">☁ Use cloud save</button>' +
      '<button type="button" class="mn-btn small alt" data-ol="keep">Keep this one</button></div>';
    offerEl.hidden = panelShown(); // the open panel shows the same offer itself
    renderPanel();
  }
  const panelShown = () => !!(panel && N.menus && N.menus.isPanelShown && N.menus.isPanelShown('online'));
  function hideOffer() { if (offerEl) offerEl.hidden = true; }

  /* ================================================================ journey */
  function listOf(x) {
    if (!x) return [];
    if (Array.isArray(x)) return x.slice();
    if (typeof x.forEach === 'function') { const o = []; x.forEach((v, k) => o.push(typeof k === 'string' && !(x instanceof Set) ? k : v)); return o; }
    if (typeof x === 'object') return Object.keys(x);
    return [];
  }
  /** The journey summary: missions passed, tape tracks, tin items, places visited, game date. */
  function journey() {
    const M = N.missions, T = N.tape, F = N.flags || {};
    const missions = M && M.done ? listOf(M.done).filter((s) => typeof s === 'string').slice(0, 200) : [];
    const tracks = T && Array.isArray(T.tracks) ? T.tracks.filter((t) => t && t.id).map((t) => ({ id: String(t.id).slice(0, 40), label: String(t.label || t.id).slice(0, 60) })).slice(0, 40) : [];
    const tin = T && T.tin ? listOf(T.tin).map(String).slice(0, 80) : [];
    const places = F.visited && typeof F.visited === 'object' ? Object.keys(F.visited).slice(0, 400) : [];
    let date = '';
    try { date = N.clock.dateLabel(); } catch (e) { /* ignore */ }
    return { v: 1, nick: P.nick || null, date, day: N.clock ? N.clock.day | 0 : 0, missions, tracks, tin, places };
  }
  function placeName(id) { const p = N.places && N.places[id]; return p ? p.name : String(id).replace(/_/g, ' '); }
  function tinName(id) {
    const T = N.tape || {};
    try { const o = (T.tokenInfo && T.tokenInfo(id)) || (T.tokens && (T.tokens[id] || (T.tokens.get && T.tokens.get(id)))); if (o && (o.name || o.title)) return o.name || o.title; } catch (e) { /* ignore */ }
    return String(id).replace(/^token_/, '').replace(/[_-]+/g, ' ');
  }
  let jT = null;
  function scheduleJourney() { if (!P.code || availability() !== 'ok' || !S.client) return; clearTimeout(jT); jT = setTimeout(() => pushJourney().catch(() => {}), 4000); }
  async function pushJourney() {
    if (!P.code || availability() !== 'ok' || N.state.mode === 'title' || N.state.mode === 'boot') return { ok: false, why: 'off' };
    const j = journey();
    const h = JSON.stringify(j);
    if (h === P.journeyHash) return { ok: true, same: true };
    j.t = Date.now();
    const res = await rpc('journey_put', { data: j });
    if (res.ok) { P.journeyHash = h; saveProfile(); }
    return res;
  }

  /* ================================================================ use my code (another phone) */
  async function useCode(s) {
    const code = normCode(s);
    if (!CODE_RE.test(code)) return { ok: false, why: 'That is not a player code. It looks like CHAI-PATANG-GULLY-4821-K7QXM.' };
    if (code === P.code) return { ok: true, why: null, same: true };
    try {
      await ensureClient();
      const c = S.client;
      const { data, error } = await c.rpc('save_get', { code });
      if (error) throw new Error(error.message);
      if (!data || !data.ok) return { ok: false, why: data && data.reason === 'rate' ? 'Too many tries. Wait a minute.' : 'Could not check that code.' };
      if (!data.nick && !(data.saves && data.saves.length)) return { ok: false, why: 'No journey found for that code. Check the words and numbers.' };
      P.code = code; P.cloud = {}; P.journeyHash = null; P.dismissed = {};
      if (data.nick) P.nick = data.nick;
      saveProfile();
      await cloudPull();
      return { ok: true, why: null };
    } catch (e) { return { ok: false, why: 'Could not reach the online server.' }; }
  }

  /* ================================================================ rooms */
  const myKey = (() => { const b = randBytes(6); let s = ''; for (const x of b) s += x.toString(16).padStart(2, '0'); return 'p' + s; })();
  const R = { ch: null, code: null, joined: 0, players: [], pin: null, pinClear: 0, myPin: null, lastSent: null, sendT: 0, keepT: 0, fullT: 0, sent: 0, recv: 0, chatT: 0, leaving: false };
  function myLook() {
    const l = (N.player && N.player.look) || {};
    return sanitizeLook(l);
  }
  function myMeta() {
    return { n: P.nick || defaultNick(), l: myLook(), j: R.joined, pin: R.myPin, pc: R.pinClear };
  }
  async function trackMe() { if (R.ch) await R.ch.track(myMeta()); }
  function presenceList(ch) {
    const st = ch.presenceState ? ch.presenceState() : {};
    const out = [];
    for (const key of Object.keys(st)) {
      const metas = st[key];
      if (!Array.isArray(metas) || !metas.length) continue;
      const m = metas[metas.length - 1] || {};
      out.push({ key, nick: validNick(m.n), look: sanitizeLook(m.l), j: isFinite(m.j) ? +m.j : 0, pin: sanitizePin(m.pin), pc: isFinite(m.pc) ? +m.pc : 0, me: key === myKey });
    }
    out.sort((a, b) => (a.j - b.j) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return out;
  }
  function openChannel(code) {
    const c = S.client;
    // presence must be switched on explicitly: without enabled:true the server drops track() and nobody sees anybody
    const conf = { config: { broadcast: { self: false }, presence: { key: myKey, enabled: true } } };
    if (cfg() && cfg().privateRooms) conf.config.private = true;
    const ch = c.channel('room:' + code, conf);
    let synced = null;
    const firstSync = new Promise((res) => { synced = res; });
    ch.on('presence', { event: 'sync' }, () => { if (synced) { synced(); synced = null; } if (R.ch === ch) onPresence(); });
    ch.on('broadcast', { event: 'st' }, (m) => { if (R.ch === ch) onState(m && m.payload); });
    ch.on('broadcast', { event: 'em' }, (m) => { if (R.ch === ch) onEmote(m && m.payload); });
    ch.on('broadcast', { event: 'pt' }, (m) => { if (R.ch === ch) onPartyMsg(m && m.payload); }); // [party hook]
    const subscribed = new Promise((res, rej) => {
      let done = false;
      ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          if (!done) { done = true; res(); }
          // a rejoin after a dropped socket (phone asleep, tab in the background) starts with no presence: announce again
          if (R.ch === ch) { if (S.status !== 'room') setStatus('room'); trackMe().catch(() => {}); }
        }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (!done) { done = true; rej(err || new Error(status)); } else if (R.ch === ch) setStatus('reconnecting'); }
        else if (status === 'CLOSED' && R.ch === ch && !R.leaving) setStatus('reconnecting');
      });
    });
    return { ch, subscribed, firstSync };
  }
  async function closeChannel(ch) {
    if (!ch) return;
    try { await ch.untrack(); } catch (e) { /* ignore */ }
    try { await S.client.removeChannel(ch); } catch (e) { try { ch.unsubscribe(); } catch (er) { /* ignore */ } }
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Join channel `code`; mode 'create' needs it empty, 'join' needs someone there and a free place. */
  async function enter(code, mode) {
    const { ch, subscribed, firstSync } = openChannel(code);
    try { await Promise.race([subscribed, wait(12000).then(() => { throw new Error('timeout'); })]); } catch (e) { await closeChannel(ch); return { ok: false, why: 'net' }; }
    await Promise.race([firstSync, wait(2500)]);
    await wait(150);
    const others = presenceList(ch).filter((p) => !p.me);
    if (mode === 'create' && others.length) { await closeChannel(ch); return { ok: false, why: 'taken' }; }
    // joining an empty room is allowed: the friend may still be connecting, and presence can arrive late
    if (others.length >= MAX()) { await closeChannel(ch); return { ok: false, why: 'full', n: others.length }; }
    R.ch = ch; R.code = code; R.joined = Date.now(); R.myPin = null; R.pinClear = 0; R.pin = null; R.lastSent = null; R.sendT = 0; R.keepT = 0; R.leaving = false;
    await trackMe();
    setStatus('room');
    N.emit('online:room', { code });
    onPresence();
    return { ok: true, why: null, code };
  }
  function busyRoom() { return R.ch ? { ok: false, why: 'You are already in room ' + R.code + '.' } : null; }
  // one create / join at a time: a second tap (or call) while one is on its way gets the same answer
  function once(fn) {
    if (R.entering) return R.entering;
    R.entering = fn().finally(() => { R.entering = null; });
    return R.entering;
  }
  function createRoom() {
    return once(async () => {
      const b = busyRoom(); if (b) return b;
      if (!P.nick) P.nick = defaultNick();
      try { await ensureClient(); } catch (e) { return { ok: false, why: S.lastError || 'Could not reach the online server.' }; }
      for (let i = 0; i < 6; i++) {
        const r = await enter(newRoomCode(), 'create');
        if (r.ok) { afterEnter('create'); if (gameStarted()) toast('Room ' + r.code + ' is open. Tell your friends the code!', 3600); return r; }
        if (r.why !== 'taken') return { ok: false, why: 'Could not open a room. Check the internet.' };
      }
      return { ok: false, why: 'All the room names are busy. Try again.' };
    });
  }
  function joinRoom(s) {
    return once(async () => {
      const b = busyRoom(); if (b) return b;
      const code = normRoom(s);
      if (!ROOM_RE.test(code)) return { ok: false, why: 'Room codes look like CHAI-42.' };
      if (!P.nick) P.nick = defaultNick();
      try { await ensureClient(); } catch (e) { return { ok: false, why: S.lastError || 'Could not reach the online server.' }; }
      const r = await enter(code, 'join');
      if (r.ok) {
        const friends = R.players.some((p) => !p.me);
        afterEnter(friends ? 'join' : 'wait');
        if (gameStarted()) toast(friends ? 'Joined room ' + code + '.' : 'You are in room ' + code + '. Waiting for friends to join…', 3000);
        return r;
      }
      if (r.why === 'full') return { ok: false, why: 'Room ' + code + ' is full (' + MAX() + '/' + MAX() + '). Ask a friend to start a new room.' };
      if (r.why === 'empty') return { ok: false, why: 'No one is in room ' + code + '. Rooms close when everyone leaves.' };
      return { ok: false, why: 'Could not join. Check the internet.' };
    });
  }
  async function leaveRoom(why) {
    const ch = R.ch;
    if (!ch) return { ok: true };
    R.leaving = true;
    R.ch = null; R.code = null; R.players = []; R.pin = null; R.myPin = null;
    FLOW.place = null; FLOW.offer = null; FLOW.auto = null; HS.inside = new Set(); HS.nearHtml = '';
    hideArrive();
    clearGhosts();
    clearPinMarks();
    await closeChannel(ch);
    R.leaving = false;
    setStatus(S.client ? 'ready' : 'idle');
    N.emit('online:room', { code: null, why: why || null });
    renderHud();
    return { ok: true };
  }
  function onPresence() {
    const ch = R.ch;
    if (!ch) return;
    const list = presenceList(ch);
    // a race overfilled the room: the latest joiners step out
    const idx = list.findIndex((p) => p.me);
    if (idx >= MAX()) { const code = R.code; leaveRoom('full'); toast('Room ' + code + ' filled up (' + MAX() + '/' + MAX() + '). Try another room.', 3600); renderPanel(); return; }
    const prevKeys = new Set(R.players.map((p) => p.key));
    R.players = list;
    const keys = new Set();
    for (const p of list) {
      if (p.me) continue;
      keys.add(p.key);
      const g = ghostFor(p.key);
      g.nick = p.nick; g.look = p.look; g.ent.look = p.look;
      setTagName(g.tag, p.nick);
      if (!prevKeys.has(p.key)) {
        // someone new: send my full state at once (not at the next 2 s keepalive) so they can find me straight away
        R.keepT = 0; R.fullT = 0; R.lastSent = null;
        if (prevKeys.size) toast(p.nick + ' joined the room!', 2400);
      }
    }
    for (const [k, g] of GH) if (!keys.has(k)) { const n = g.nick; removeGhost(k); toast(n + ' left the room.', 2000); }
    // the meet pin: the newest pin in the room that no "clear" has overtaken
    const clearT = Math.max(0, ...list.map((p) => p.pc || 0));
    let pin = null;
    for (const p of list) if (p.pin && p.pin.t > clearT && (!pin || p.pin.t > pin.t)) pin = Object.assign({ by: p.nick }, p.pin);
    setPin(pin);
    N.emit('online:players', { n: list.length });
    renderPanel(); renderHud();
  }

  /* ---------------------------------------------------------------- validation of what others send */
  const COLOR_KEYS = ['skin', 'hair', 'shirt', 'pants', 'saree', 'border', 'blouse', 'lungi', 'capColor', 'dupatta', 'accent', 'bag'];
  const KINDS = ['kid', 'man', 'woman', 'uncle', 'aunty', 'burqa', 'saree', 'lungi', 'student', 'old'];
  const BOOL_KEYS = ['stripes', 'girl', 'tie', 'specs', 'moustache', 'collar'];
  function sanitizeLook(l) {
    const o = { kind: 'kid' };
    if (!l || typeof l !== 'object') return Object.assign(o, { skin: '#a0683f', hair: '#1a1412', shirt: '#2a5cb8', pants: '#3a3a4a' });
    for (const k of COLOR_KEYS) { const v = l[k]; if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) o[k] = v; else if (v === true && (k === 'dupatta' || k === 'bag')) o[k] = true; }
    if (typeof l.kind === 'string' && KINDS.indexOf(l.kind) >= 0) o.kind = l.kind;
    for (const k of BOOL_KEYS) if (l[k] === true) o[k] = true;
    if (typeof l.cap === 'string' && /^(topi|cricket|skull|gandhi)$/.test(l.cap)) o.cap = l.cap;
    if (typeof l.hairStyle === 'string' && /^[a-z]{2,8}$/.test(l.hairStyle)) o.hairStyle = l.hairStyle;
    if (!o.skin) o.skin = '#a0683f';
    if (!o.shirt) o.shirt = '#2a5cb8';
    return o;
  }
  function validNick(n) { const r = nickOk(n); return r.ok ? r.nick : 'Player'; }
  const WMAX = () => Math.max(N.WORLD_W || 8000, 16000), HMAX = () => Math.max(N.WORLD_H || 6000, 12000);
  function sanitizePin(p) {
    if (!p || typeof p !== 'object' || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.t)) return null;
    const place = typeof p.place === 'string' && N.places && N.places[p.place] ? p.place : null;
    const known = place ? MEET.find(([id]) => id === place) : null;
    return { id: String(p.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16) || 'pin', x: clamp(+p.x, 0, WMAX()), y: clamp(+p.y, 0, HMAX()), t: +p.t, place, label: known ? known[1] : (place ? placeName(place) : null) };
  }
  function sanitizeState(s) {
    if (!s || typeof s !== 'object' || typeof s.k !== 'string' || !isFinite(s.x) || !isFinite(s.y)) return null;
    const T = N.vehicles && N.vehicles.TYPES;
    const o = { k: s.k.slice(0, 20), x: clamp(+s.x, -50, WMAX()), y: clamp(+s.y, -50, HMAX()), a: isFinite(s.a) ? clamp(+s.a, -20, 20) : 0, m: s.m === 'v' ? 'v' : 'f', sp: isFinite(s.sp) ? clamp(+s.sp, -400, 400) : 0, an: s.an === 'r' ? 'r' : s.an === 'w' ? 'w' : 'i' };
    if (o.m === 'v') {
      o.vt = typeof s.vt === 'string' && T && Object.prototype.hasOwnProperty.call(T, s.vt) ? s.vt : 'cycle';
      o.vc = typeof s.vc === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.vc) ? s.vc : null;
    }
    if (s.n != null) o.n = validNick(s.n);
    if (s.l != null) o.l = sanitizeLook(s.l);
    return o;
  }

  /* ---------------------------------------------------------------- ghosts */
  const GH = new Map(); // presence key -> ghost
  let tagHost = null;
  function ghostFor(key) {
    let g = GH.get(key);
    if (g) return g;
    const ent = {
      kind: 'ghost', ghost: true, online: key, x: -9999, y: -9999, angle: 0, facing: 0, vx: 0, vy: 0, r: 4, mass: 1,
      solid: false, noCollide: true, selfUpdate: true, noWorld: true, alive: true, hidden: true, view3d: 'ped',
      look: sanitizeLook(null), anim: { phase: 0, speed: 0, run: false }, barkH: 15,
      seed: (U.strHash ? U.strHash(key) : 7) >>> 0, speed: 0, wheelPhase: 0, steerVis: 0, lean: 0, jolt: 0, ctl: { throttle: 0, steer: 0 },
      update() {}, draw() { drawGhost(this); },
    };
    g = { key, nick: 'Player', look: ent.look, ent, buf: [], lastRx: 0, tag: null, blip: 'ol:' + key, mode: 'f', chatT: 0 };
    if (!tagHost) { tagHost = document.createElement('div'); tagHost.id = 'ol-tags'; (document.getElementById('ui') || document.body).appendChild(tagHost); }
    g.tag = makeTag(g.nick);
    tagHost.appendChild(g.tag);
    GH.set(key, g);
    return g;
  }
  function removeGhost(key) {
    const g = GH.get(key);
    if (!g) return;
    GH.delete(key);
    try { N.entities.remove(g.ent); } catch (e) { /* ignore */ }
    try { if (N.hud && N.hud.unblip) N.hud.unblip(g.blip); } catch (e) { /* ignore */ }
    if (g.tag) g.tag.remove();
  }
  function clearGhosts() { for (const k of Array.from(GH.keys())) removeGhost(k); }
  function onState(raw) {
    const s = sanitizeState(raw);
    if (!s || s.k === myKey) return;
    if (!R.players.some((p) => p.key === s.k)) return; // only players present in the room
    R.recv++;
    const g = ghostFor(s.k);
    if (s.n) { g.nick = s.n; setTagName(g.tag, s.n); }
    if (s.l) { g.look = s.l; g.ent.look = s.l; }
    const t = nowMs();
    const last = g.buf[g.buf.length - 1];
    if (last && (Math.hypot(s.x - last.x, s.y - last.y) > 320 || s.m !== last.m || s.vt !== last.vt)) g.buf.length = 0; // teleport / mode change: snap
    if (last && t - last.rt < 15) g.buf.pop();
    s.rt = t;
    g.buf.push(s);
    if (g.buf.length > 12) g.buf.shift();
    g.lastRx = t;
  }
  function onEmote(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.k !== 'string' || raw.k === myKey) return;
    const ph = PHRASE.get(raw.id);
    const g = GH.get(raw.k);
    if (!ph || !g) return;
    const t = nowMs();
    if (t - g.chatT < 900) return; // a gentle per-sender limit
    g.chatT = t;
    g.bubbleT = t + (ph.emote ? 2400 : 3200); // the nameplate steps aside while the bubble (which names them) is up
    bubble(g.ent, ph, g.nick);
    N.emit('online:chat', { from: g.nick, id: ph.id, text: ph.text });
  }
  function bubble(target, ph, nick) {
    const text = target === N.player ? ph.text : nick + ': ' + ph.text;
    try { if (N.dialogue && N.dialogue.bark) N.dialogue.bark(target, text, { secs: ph.emote ? 2.4 : 3.2, name: false, color: '#5fd0ff', blip: true, h: 15 }); } catch (e) { N.err('online.bubble', e); }
  }
  const lerpA = (a, b, t) => a + U.angleDiff(a, b) * t;
  function poseAt(g, t) {
    const B = g.buf;
    if (!B.length) return null;
    const rt = t - 120;
    if (B.length === 1 || rt <= B[0].rt) return Object.assign({}, B[0]);
    for (let i = B.length - 2; i >= 0; i--) {
      const a = B[i], b = B[i + 1];
      if (rt >= a.rt && rt <= b.rt) {
        const f = (rt - a.rt) / Math.max(1, b.rt - a.rt);
        return Object.assign({}, b, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, a: lerpA(a.a, b.a, f), sp: a.sp + (b.sp - a.sp) * f });
      }
    }
    // past the newest sample: a short extrapolation while it was moving
    const b = B[B.length - 1], a = B[B.length - 2];
    const ex = Math.min(250, rt - b.rt) / 1000;
    if (Math.abs(b.sp) < 1 || ex <= 0) return Object.assign({}, b);
    const dt = Math.max(0.03, (b.rt - a.rt) / 1000);
    const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    if (Math.hypot(vx, vy) > 450) return Object.assign({}, b);
    return Object.assign({}, b, { x: b.x + vx * ex, y: b.y + vy * ex });
  }
  const TRACE = { on: false, out: [] }; // tests: per-frame ghost positions
  function updateGhosts(dt) {
    if (!GH.size) return;
    const t = nowMs();
    const T = N.vehicles && N.vehicles.TYPES;
    for (const g of GH.values()) {
      const e = g.ent;
      const p = poseAt(g, t);
      if (!p) { e.hidden = true; continue; }
      const ox = e.x, oy = e.y;
      e.hidden = false;
      e.x = p.x; e.y = p.y; e.angle = p.a; e.facing = p.a;
      const d = Math.hypot(e.x - ox, e.y - oy);
      if (dt > 0 && d < 200) { e.vx = (e.x - ox) / dt; e.vy = (e.y - oy) / dt; } else { e.vx = 0; e.vy = 0; }
      if (p.m === 'v' && T && T[p.vt]) {
        const Ty = T[p.vt];
        if (e.view3d !== 'vehicle' || e.type !== p.vt) {
          e.view3d = 'vehicle'; e.type = p.vt; e.T = Ty; e.r = Ty.w / 2;
          e.color = p.vc || (Ty.colors && Ty.colors[0]) || '#c0392b'; e.color2 = Ty.colors2 ? Ty.colors2[0] : U.shade(e.color, 0.7);
          e.driver = { kind: 'ghost', ghost: true, look: e.look, alive: true, x: e.x, y: e.y, npc: true };
        }
        if (p.vc && p.vc !== e.color) e.color = p.vc;
        e.driver.look = e.look; e.driver.x = e.x; e.driver.y = e.y;
        e.speed = p.sp; e.wheelPhase += (p.sp * dt) / 3;
        e.steerVis += ((U.angleDiff(g.lastA == null ? e.angle : g.lastA, e.angle) / Math.max(dt, 1e-3)) * 0.08 - e.steerVis) * Math.min(1, dt * 8);
        e.steerVis = clamp(e.steerVis, -0.5, 0.5);
        e.lean = Ty.cls === 'bike' ? clamp(-e.steerVis * 0.8, -0.4, 0.4) : 0;
        e.lightsOn = !!(N.render && N.render.night > 0.4);
        e.barkH = Ty.h ? Ty.h + 8 : 18;
      } else {
        if (e.view3d !== 'ped') { e.view3d = 'ped'; e.type = undefined; e.T = undefined; e.driver = undefined; e.r = 4; e.barkH = 15; }
        const moving = Math.abs(p.sp) > 3;
        e.anim.speed = moving ? clamp(Math.abs(p.sp) / 45, 0.3, 1) : 0; e.anim.run = p.an === 'r';
        e.anim.phase = (e.anim.phase + d * 0.28) % TAU;
      }
      g.lastA = e.angle;
      if (TRACE.on && TRACE.out.length < 2000) TRACE.out.push({ k: g.key, t, x: e.x, y: e.y });
      // keep it registered across N.systems.reset() / new games / loads
      if (N.entities && N.entities.all.indexOf(e) < 0) { e.alive = true; N.entities.add(e); }
      try {
        const col = colorOf(g.key);
        if (N.hud && N.hud.blip && N.hud.blips && (!N.hud.blips.has(g.blip) || g.blipCol !== col)) {
          if (g.blipCol && N.hud.unblip) N.hud.unblip(g.blip);
          N.hud.blip(g.blip, e, { color: col, icon: 'dot', label: g.nick, size: 5 }); g.blipCol = col;
        }
      } catch (er) { N.err('online.blip', er); }
    }
  }
  function drawGhost(e) {
    const R2 = N.render, D = N.draw;
    if (!R2 || !D) return;
    if (e.view3d === 'vehicle' && e.T) {
      const T = e.T;
      if (T.cls !== 'boat') R2.queue('shadow', 0, () => D.shadow(e.x, e.y, T.w + 1, T.d + 0.5, e.angle, T.h * (T.cls === 'bike' ? 0.5 : 0.62)));
      R2.queue('actors', e.y + (T.cls === 'heavy' ? 6 : 2), (ctx) => { try { T.draw(ctx, e); } catch (er) { N.err('online.drawVehicle', er); } });
      return;
    }
    R2.queue('shadow', 0, () => D.shadow(e.x, e.y, 7, 9, e.angle, 1.5));
    R2.queue('actors', e.y, (ctx) => {
      if (N.traffic && N.traffic.blitPerson) N.traffic.blitPerson(ctx, e.look, e.x, e.y, e.angle, e.anim, 0.6);
      else D.sprite(e.x, e.y, e.angle, 8, (g) => N.people.draw(g, e.look, e.anim));
    });
  }
  // FIFA-style player markers, both views (R.proj follows the 3D camera while 3D renders).
  // Every player in the room has a colour by join order (the presence list is sorted the same way on every
  // screen, so Ravi is blue for everyone): a coloured triangle over the head with the name above it, my own
  // triangle too, and an arrow at the screen edge (name + distance) for friends who are off screen or behind.
  const PCOL = ['#ffd23f', '#3fa9ff', '#ff5a5f', '#5ce05a', '#c46bff', '#ff9f1c', '#2ee6d6', '#ff6fc8', '#f2f2f2', '#b6f03c'];
  function slotOf(key) { const i = R.players.findIndex((p) => p.key === key); return i < 0 ? 0 : i % PCOL.length; }
  function colorOf(key) { return PCOL[slotOf(key)]; }
  function makeTag(nick) {
    const el = document.createElement('div');
    el.className = 'ol-tag'; el.style.visibility = 'hidden';
    el.innerHTML = '<span class="ol-nm"></span><span class="ol-dist"></span><i class="ol-tri"></i>';
    setTagName(el, nick);
    return el;
  }
  function setTagName(el, nick) { if (el) { const n = el.querySelector('.ol-nm'); if (n && n.textContent !== nick) n.textContent = nick; } }
  let selfTag = null;
  function hideTag(el) { if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; }
  // screen position (page px) of a point above entity e, plus whether it is in front of the camera
  function screenOf(e, rect, Rn, V3, me) {
    const veh = me ? !!N.player.vehicle : (e.view3d === 'vehicle' && e.T);
    if (V3 && V3.active && V3.project) {
      const cls = veh ? (me ? (N.player.vehicle.T && N.player.vehicle.T.cls) : e.T.cls) : null;
      const h3 = (V3.elevation ? V3.elevation(e) || 0 : 0) + (!veh ? 10.5 : cls === 'heavy' ? 21 : cls === 'car' || cls === 'auto' ? 14 : 11.5);
      const q = V3.project(e.x, e.y, h3);
      return { x: q.x, y: q.y, behind: !!q.behind };
    }
    const hh = veh ? ((me ? N.player.vehicle.T && N.player.vehicle.T.h : e.T.h) || 10) + 12 : 20;
    const q = Rn.proj(e.x, e.y, hh);
    return { x: rect.left + (q.x / Rn.W) * rect.width, y: rect.top + (q.y / Rn.H) * rect.height, behind: false };
  }
  function placeTags() {
    if (!tagHost) { if (!R.ch) return; tagHost = document.createElement('div'); tagHost.id = 'ol-tags'; (document.getElementById('ui') || document.body).appendChild(tagHost); }
    const Rn = N.render, mode = N.state.mode;
    const live = !!R.ch && (mode === 'play' || mode === 'dialogue' || mode === 'minigame' || mode === 'cutscene');
    tagHost.classList.toggle('hide', !live);
    if (!live || !Rn || !Rn.canvas || !Rn.W) return;
    const rect = Rn.canvas.getBoundingClientRect();
    const V3 = N.view3d;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const P0 = N.player;
    // my own marker (only once someone else is in the room, so a solo room stays clean)
    if (!selfTag) { selfTag = makeTag('You'); selfTag.classList.add('ol-me'); tagHost.appendChild(selfTag); }
    const pm = P0 && P0.vehicle ? P0.vehicle : P0;
    if (pm && GH.size && !(P0.hidden)) {
      const q = screenOf(pm, rect, Rn, V3, true);
      if (!q.behind && isFinite(q.x) && isFinite(q.y)) {
        selfTag.style.setProperty('--pc', colorOf(myKey));
        selfTag.style.visibility = '';
        selfTag.style.transform = 'translate(' + Math.round(q.x) + 'px,' + Math.round(q.y) + 'px) translate(-50%, -100%)';
      } else hideTag(selfTag);
    } else hideTag(selfTag);
    const M = 30; // edge-arrow inset from the screen edge
    for (const g of GH.values()) {
      const e = g.ent, el = g.tag;
      if (!el) continue;
      el.style.setProperty('--pc', colorOf(g.key));
      if (e.hidden || e.x < -9000) { hideTag(el); continue; }
      const q = screenOf(e, rect, Rn, V3, false);
      const far = V3 && V3.active && Math.hypot(e.x - P0.x, e.y - P0.y) > 320;
      const onScreen = !q.behind && !far && isFinite(q.x) && isFinite(q.y) && q.x > rect.left + 8 && q.x < rect.right - 8 && q.y > rect.top + 24 && q.y < rect.bottom - 8;
      if (onScreen) {
        if (g.bubbleT && nowMs() < g.bubbleT) { hideTag(el); continue; } // the chat bubble names them meanwhile
        if (el.classList.contains('ol-edge')) { el.classList.remove('ol-edge'); const tri = el.querySelector('.ol-tri'); if (tri) tri.style.transform = ''; }
        el.style.visibility = '';
        el.style.transform = 'translate(' + Math.round(q.x) + 'px,' + Math.round(q.y) + 'px) translate(-50%, -100%)';
        continue;
      }
      // off screen: an arrow on the screen edge pointing at them, with the distance
      let dx, dy;
      if (V3 && V3.active && (q.behind || far || !isFinite(q.x))) {
        // behind the camera or out of range: use the world bearing relative to the camera's forward (N.view.yaw)
        const yaw = N.view && isFinite(N.view.yaw) ? N.view.yaw : null;
        const wx = e.x - P0.x, wy = e.y - P0.y;
        if (yaw != null) { const a = Math.atan2(wy, wx) - yaw; dx = Math.sin(a); dy = -Math.cos(a); } else { dx = q.behind ? -(q.x - cx) : q.x - cx; dy = q.behind ? Math.abs(q.y - cy) + 1 : q.y - cy; }
      } else { dx = q.x - cx; dy = q.y - cy; }
      if (!isFinite(dx) || !isFinite(dy) || (dx === 0 && dy === 0)) { hideTag(el); continue; }
      // keep the whole arrow + name + distance box on screen, and clear of the clock / money strip at the top
      el.classList.add('ol-edge');
      const bw = (el.offsetWidth || 80) / 2 + 6, bh = (el.offsetHeight || 56) / 2 + 6, topBand = 64;
      const x0 = rect.left + Math.max(M, bw), x1 = rect.right - Math.max(M, bw);
      const y0 = rect.top + Math.max(M, bh) + topBand, y1 = rect.bottom - Math.max(M, bh);
      const ecx = (x0 + x1) / 2, ecy = (y0 + y1) / 2;
      const t = Math.min((x1 - x0) / 2 / Math.max(1e-6, Math.abs(dx)), (y1 - y0) / 2 / Math.max(1e-6, Math.abs(dy)));
      const X = ecx + dx * t, Y = ecy + dy * t;
      const meters = Math.hypot(e.x - P0.x, e.y - P0.y) * 1.6;
      const dEl = el.querySelector('.ol-dist');
      const dTxt = meters >= 1000 ? (meters / 1000).toFixed(1) + ' km' : Math.round(meters / 10) * 10 + ' m';
      if (dEl && dEl.textContent !== dTxt) dEl.textContent = dTxt;
      el.classList.add('ol-edge');
      const ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + 'deg';
      el.style.setProperty('--ang', ang);
      const tri = el.querySelector('.ol-tri'); if (tri && tri.style.transform !== 'rotate(' + ang + ')') tri.style.transform = 'rotate(' + ang + ')';
      el.style.visibility = '';
      el.style.transform = 'translate(' + Math.round(X) + 'px,' + Math.round(Y) + 'px) translate(-50%, -50%)';
    }
  }

  /* ---------------------------------------------------------------- my state */
  function localState() {
    const p = N.player;
    if (!p) return null;
    const v = p.vehicle;
    const e = v || p;
    if (!isFinite(e.x) || !isFinite(e.y)) return null;
    const sp = v ? (v.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0);
    const a = v ? v.angle : (isFinite(p.facing) ? p.facing : p.angle);
    const s = { k: myKey, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, a: Math.round((a || 0) * 100) / 100, m: v ? 'v' : 'f', sp: Math.round(sp), an: !v && p.running && sp > 50 ? 'r' : sp > 3 ? 'w' : 'i' };
    if (v) { s.vt = v.type; if (v.color) s.vc = v.color; }
    return s;
  }
  function changed(a, b) {
    if (!a || !b) return true;
    return a.m !== b.m || a.vt !== b.vt || a.an !== b.an || Math.abs(a.x - b.x) > 0.6 || Math.abs(a.y - b.y) > 0.6 || Math.abs(U.angleDiff(a.a, b.a)) > 0.03 || Math.abs(a.sp - b.sp) > 4;
  }
  function stateHz() {
    const base = clamp(+(cfg() && cfg().stateHz) || 8, 1, 10);
    const n = Math.max(1, R.players.length - 1);
    return n <= 3 ? base : clamp((base * 3) / n, 3, base); // fewer updates per player in a big room (Realtime quota)
  }
  function sendState() {
    const ch = R.ch;
    if (!ch) return;
    const mode = N.state.mode;
    if (mode === 'title' || mode === 'boot' || !N.world || !N.world.built) return;
    const t = nowMs();
    // self-heal: every 10 s make sure the server still lists us (a silent reconnect can drop our presence)
    if (t - (R.selfT || 0) > 10000) {
      R.selfT = t;
      let here = false;
      try { const st = ch.presenceState ? ch.presenceState() : {}; here = !!(st[myKey] && st[myKey].length); } catch (e) { /* ignore */ }
      if (!here) trackMe().catch(() => {});
    }
    if (t - R.sendT < 1000 / stateHz()) return;
    const s = localState();
    if (!s) return;
    const keep = t - R.keepT > 2000;
    if (!keep && !changed(s, R.lastSent)) return;
    if (t - R.fullT > 3000 || !R.lastSent) { s.n = P.nick || defaultNick(); s.l = myLook(); R.fullT = t; }
    R.sendT = t; R.keepT = t; R.lastSent = s; R.sent++;
    try { ch.send({ type: 'broadcast', event: 'st', payload: s }); } catch (e) { N.err('online.send', e); }
  }

  /* ---------------------------------------------------------------- meet pin + quick-chat */
  function clearPinMarks() {
    try { if (N.hud && N.hud.unblip) N.hud.unblip('ol:pin'); } catch (e) { /* ignore */ }
    try { const w = N.menus && N.menus.waypointPos; if (w && R.pinWp && Math.abs(w.x - R.pinWp.x) < 1 && Math.abs(w.y - R.pinWp.y) < 1) N.menus.waypoint(null); } catch (e) { /* ignore */ }
    R.pinWp = null;
  }
  function setPin(pin) {
    const old = R.pin;
    if ((old && pin && old.t === pin.t && old.id === pin.id) || (!old && !pin)) return;
    R.pin = pin;
    clearPinMarks();
    if (pin) {
      const label = pin.label ? 'Meet at ' + pin.label : 'Meet here';
      try { if (N.hud && N.hud.blip) N.hud.blip('ol:pin', { x: pin.x, y: pin.y }, { color: '#ff5fb0', icon: 'star', label, pulse: true, route: true }); } catch (e) { N.err('online.pinBlip', e); }
      try { if (N.menus && N.menus.waypoint) { N.menus.waypoint(pin.x, pin.y); R.pinWp = { x: pin.x, y: pin.y }; } } catch (e) { N.err('online.pinWp', e); }
      toast((pin.by && pin.by !== (P.nick || '') ? pin.by + ': ' : '') + label + '!', 3600);
    }
    N.emit('online:pin', { pin });
    renderPanel();
  }
  async function dropPin(placeId) {
    if (!R.ch) return { ok: false, why: 'Join a room first.' };
    let x, y, place = null;
    if (placeId && N.places && N.places[placeId]) { const pl = N.places[placeId]; x = pl.x; y = pl.y; place = placeId; }
    else { const e = (N.player && (N.player.vehicle || N.player)) || null; if (!e) return { ok: false, why: 'no player' }; x = e.x; y = e.y; }
    const known = place ? MEET.find(([id]) => id === place) : null;
    R.myPin = { id: 'p' + Date.now().toString(36), x: Math.round(x), y: Math.round(y), t: Date.now(), place, label: known ? known[1] : null };
    await trackMe();
    onPresence();
    return { ok: true };
  }
  async function clearPin() {
    if (!R.ch) return { ok: false };
    R.myPin = null; R.pinClear = Date.now();
    await trackMe();
    onPresence();
    return { ok: true };
  }
  function say(id) {
    const ph = PHRASE.get(id);
    if (!ph || !R.ch) return false;
    const t = nowMs();
    if (t - R.chatT < 1000) return false;
    R.chatT = t;
    try { R.ch.send({ type: 'broadcast', event: 'em', payload: { k: myKey, id } }); } catch (e) { N.err('online.say', e); return false; }
    if (N.player) bubble(N.player, ph, P.nick);
    sfx('ui_click');
    return true;
  }

  /* ================================================================ room flow: straight into the world, next to friends */
  const TUNE = { flowMs: 1400 }; // the panel shows the room code this long before the game takes over
  const GO_MIN_U = 100;          // the 👫 button shows when the friend it goes to is farther than this (~160 m)
  const HERE_U = 60;             // a joiner already this close to the friend (~100 m) stays where they are
  const FLOW = { auto: null, place: null, offer: null, starting: false, started: 0, how: null };
  const gameStarted = () => { const m = N.state.mode; return m !== 'title' && m !== 'boot'; };
  /** after a successful create / join: into the world (title), back to it (pause over the panel), then next to friends */
  function afterEnter(kind) {
    FLOW.place = kind === 'join' ? { code: R.code, t0: 0 } : null;
    FLOW.offer = null;
    const m = N.state.mode;
    if (m === 'title') FLOW.auto = { kind: 'start', at: nowMs() + TUNE.flowMs };
    else if (m === 'paused' && panelShown()) FLOW.auto = { kind: 'resume', at: nowMs() + TUNE.flowMs };
    else FLOW.auto = null;
  }
  function runAuto(A) {
    if (!A || !R.ch) return;
    const m = N.state.mode;
    if (A.kind === 'start') { if (m === 'title') startGame(); return; }
    if (A.kind === 'resume' && m === 'paused' && panelShown()) {
      try { N.menus.closePanel('online'); if (N.menus.resume) N.menus.resume(); else N.game.resume(); } catch (e) { N.err('online.resume', e); }
    }
  }
  /** Into the city from the title: the latest save (what CONTINUE plays; every save writes it, so it is the most
   *  recent one), or with none a new game with the intro skipped, straight into free roam. Once. */
  function startGame() {
    if (FLOW.starting || gameStarted()) return false;
    FLOW.starting = true; FLOW.auto = null;
    let ok = false, how = null;
    try {
      const SV = N.save;
      if (SV && SV.has && SV.has() && !SV.tooNew) {
        ok = N.game.continueGame(); how = 'continue';
        if (ok && N.menus && N.menus.osdCard) N.menus.osdCard('▶ PLAY', { sub: N.clock.dateLabel() + '  ' + N.clock.label(), ms: 1500 });
      } else {
        ok = N.game.newGame({ skipIntro: true, online: true }); how = 'new';
        // [story hook] the online quick start skips the 2026 prologue: leave what the prologue leaves (story.js
        // prologue(): year 2003, prologue_seen) so M1's giver waits on the home terrace and the story can begin later
        if (ok && N.flags) { N.flags.prologue_seen = true; N.flags.year = 2003; }
      }
    } catch (e) { N.err('online.startGame', e); }
    FLOW.starting = false;
    if (ok) {
      FLOW.started = nowMs(); FLOW.how = how;
      const alone = !R.players.some((p) => !p.me);
      toast(alone ? 'Room ' + R.code + ': tell your friends the code! They will appear next to you.' : 'Room ' + R.code + ': finding your friends…', 4200);
      N.emit('online:start', { how });
    }
    return ok;
  }
  /** the earliest player in the room (presence order: join time) whose position has arrived, not me */
  function friendTarget() {
    for (const p of R.players) {
      if (p.me) continue;
      const g = GH.get(p.key);
      if (!g || !g.buf.length || g.ent.hidden || !(g.ent.x > -9000)) continue;
      return { key: p.key, nick: p.nick, x: g.ent.x, y: g.ent.y };
    }
    return null;
  }
  /** how far the friend 👫 would take me to is (Infinity: nobody to go to yet) */
  function friendDistU() {
    const me = N.player && (N.player.vehicle || N.player), tg = friendTarget();
    return me && tg ? Math.hypot(tg.x - me.x, tg.y - me.y) : Infinity;
  }
  /** why I may not be moved right now (never out of a mission, a party game or a chase) */
  function gatherBlock() {
    if (N.missions && N.missions.active) return 'You are on a mission!';
    if (N.party && N.party.active) return 'Finish the game first!';
    if (N.wanted && (N.wanted.level | 0) >= 3) return 'Shake off the chase first!';
    if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) return 'Finish the game first!';
    return null;
  }
  /** a walkable spot a few metres from (x, y): off the road when there is a footpath, no wall in between */
  function spotNear(x, y, key) {
    const W = N.world;
    if (!W || !W.built || !W.isWalkable) return { x, y, a: 0 };
    const SF = N.SURF || {};
    const a0 = (((U.strHash ? U.strHash(myKey + key) : 7) >>> 0) % 628) / 100;
    for (const pass of [0, 1]) {
      for (const dist of [16, 22, 11, 30]) {
        for (let k = 0; k < 8; k++) {
          const a = a0 + (k * TAU) / 8, px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist;
          if (!W.isWalkable(px, py)) continue;
          const sf = W.surfaceAt ? W.surfaceAt(px, py) : -1;
          if (pass === 0 && (sf === SF.ROAD || sf === SF.BRIDGE)) continue;
          try { if (W.raycast && W.raycast(x, y, px, py, 'walk').hit) continue; } catch (e) { /* ignore */ }
          return { x: px, y: py, a: Math.atan2(y - py, x - px) };
        }
      }
    }
    const f = W.findFree ? W.findFree(x, y, 'walk', 24) : null;
    return f ? { x: f.x, y: f.y, a: Math.atan2(y - f.y, x - f.x) } : null;
  }
  /** 👫 Go to friends: next to the earliest friend in the room; during a mission / party game / chase: a pink route */
  function goToFriends(o) {
    o = o || {};
    if (!R.ch) return { ok: false, why: 'Join a room first.' };
    if (!gameStarted()) return { ok: false, why: 'Start the game first.' };
    const tg = friendTarget();
    if (!tg) {
      const why = R.players.some((p) => !p.me) ? 'Your friends are not in the city yet.' : 'Nobody else is in the room yet. Share the code!';
      if (!o.quiet) toast(why, 3000);
      return { ok: false, why };
    }
    const block = gatherBlock();
    if (block) {
      try { if (N.menus && N.menus.waypoint) { N.menus.waypoint(tg.x, tg.y); FLOW.wp = { x: tg.x, y: tg.y }; } } catch (e) { N.err('online.goWp', e); }
      FLOW.offer = { key: tg.key, t: nowMs() };
      toast(block + ' The pink route goes to ' + tg.nick + '. Afterwards tap 👫 Go to friends.', 4600);
      N.emit('online:gather', { ok: false, why: block, auto: !!o.auto });
      hudTick(true);
      return { ok: false, why: block, waypoint: true };
    }
    const sp = spotNear(tg.x, tg.y, tg.key);
    const p = N.player;
    if (!sp || !p) return { ok: false, why: 'No room to stand there.' };
    try { if (p.level && N.world.roofs && N.world.roofs.descend) N.world.roofs.descend(p, { x: sp.x, y: sp.y, instant: true }); } catch (e) { /* ignore */ }
    p.teleport(sp.x, sp.y);
    p.angle = p.facing = sp.a;
    try { if (N.view3d && N.view3d.active && N.view3d.snapCamera) N.view3d.snapCamera(); } catch (e) { /* ignore */ }
    try { const w = N.menus && N.menus.waypointPos; if (w && FLOW.wp && Math.abs(w.x - FLOW.wp.x) < 1 && Math.abs(w.y - FLOW.wp.y) < 1) N.menus.waypoint(null); } catch (e) { /* ignore */ }
    FLOW.offer = null; FLOW.wp = null;
    toast(o.auto ? 'You joined ' + R.code + ': ' + tg.nick + ' is right here!' : 'Whoosh! You are with ' + tg.nick + '.', 3000);
    sfx('ui_select');
    N.emit('online:gather', { ok: true, auto: !!o.auto, x: sp.x, y: sp.y, to: tg.nick });
    hudTick(true);
    return { ok: true, why: null, to: tg.nick, x: sp.x, y: sp.y };
  }
  /** a joiner: wait for play and the friend's first position, then stand next to them (or offer 👫) */
  function placeTick() {
    const F = FLOW.place;
    if (!F) return;
    if (!R.ch || R.code !== F.code) { FLOW.place = null; return; }
    if (N.state.mode !== 'play') return; // the game is still starting / a scene / the pause menu: later
    const t = nowMs();
    if (!F.t0) F.t0 = t;
    if (!friendTarget()) {
      if (t - F.t0 > 15000) { FLOW.place = null; toast('Your friends are not in the city yet. When they are, tap 👫 Go to friends.', 4200); }
      return;
    }
    if (N.player && N.player.controlsLocked && !gatherBlock() && t - F.t0 < 20000) return; // a J-card / a ride is up: a moment
    FLOW.place = null;
    const tg = friendTarget();
    if (friendDistU() <= HERE_U) { toast('You joined ' + R.code + ': ' + tg.nick + ' is right here!', 3000); N.emit('online:gather', { ok: true, auto: true, stayed: true }); return; } // already together
    goToFriends({ auto: true });
  }
  N.on('mission:complete', () => { if (FLOW.offer && R.ch) setTimeout(() => { if (FLOW.offer && R.ch) toast('Mission done! Tap 👫 Go to friends to join them.', 3600); }, 4000); });

  /* ---------------------------------------------------------------- nearby for the group */
  const ARRIVE_U = 60 / M_PER_U; // "you're all at ...": everybody within ~60 m of the activity's spot
  const FOOD = ['irani_cafe', 'bakery', 'iyengar_bakery', 'chai_bandi', 'samosa_bandi', 'dosa_bandi', 'coconut_cart', 'banana_cart'];
  const FOOD_ICON = { irani_cafe: '☕', bakery: '🥐', iyengar_bakery: '🥐', chai_bandi: '☕', samosa_bandi: '🥟', dosa_bandi: '🫓', coconut_cart: '🥥', banana_cart: '🍌' };
  function groupPoints() {
    const pts = [];
    const me = N.player && (N.player.vehicle || N.player);
    if (me && isFinite(me.x) && isFinite(me.y)) pts.push({ key: myKey, me: true, x: me.x, y: me.y });
    for (const p of R.players) {
      if (p.me) continue;
      const g = GH.get(p.key);
      if (g && g.buf.length && !g.ent.hidden && g.ent.x > -9000) pts.push({ key: p.key, me: false, x: g.ent.x, y: g.ent.y });
    }
    return pts;
  }
  /** what the group can do close by: placed party activities (any registered: N.party.available), nearest to the
   *  group's centre first, + the nearest open snack stop (N.shops) when there is one within ~800 m */
  function nearby(max, pts) {
    pts = pts || groupPoints();
    const PA = N.party;
    if (!pts.length || !PA || typeof PA.available !== 'function') return [];
    let cx = 0, cy = 0;
    for (const q of pts) { cx += q.x; cy += q.y; }
    cx /= pts.length; cy /= pts.length;
    const me = pts.find((q) => q.me) || pts[0];
    const far = (x, y) => Math.max(...pts.map((q) => Math.hypot(x - q.x, y - q.y)));
    let list = [];
    try { list = PA.available(cx, cy) || []; } catch (e) { N.err('online.nearby', e); return []; }
    const out = [];
    for (const a of list) {
      if (a.anywhere || typeof a.x !== 'number' || typeof a.y !== 'number' || !isFinite(a.x) || !isFinite(a.y)) continue; // anywhere ones: the 🏁 picker
      // where: the spot's own name, or its place's when that name is a long description ("Kite fight at Home terrace (…)")
      const pl = a.where && N.places && N.places[a.where];
      const at = a.atName && (a.atName.length <= 26 || !pl) ? a.atName : pl ? pl.name : null;
      out.push({ id: a.id, kind: 'party', name: a.name, icon: a.icon || '🏁', at, line: a.line || '', x: a.x, y: a.y, r: a.r || 0, d: Math.hypot(a.x - cx, a.y - cy), dMe: Math.hypot(a.x - me.x, a.y - me.y), dAll: far(a.x, a.y) });
    }
    out.sort((p, q) => p.d - q.d);
    const n = Math.max(1, max || 4);
    const res = out.slice(0, n);
    try {
      const SH = N.shops;
      if (SH && SH.list && SH.isOpenNow) {
        let best = null;
        for (const kind of FOOD) {
          for (const id of SH.list(kind) || []) {
            const pl = N.places && N.places[id];
            if (!pl) continue;
            const d = Math.hypot(pl.x - cx, pl.y - cy);
            if (d < 500 && (!best || d < best.d) && SH.isOpenNow(id)) best = { id, kind: 'shop', name: pl.name || placeName(id), icon: FOOD_ICON[kind] || '☕', at: 'open now', line: '', x: pl.x, y: pl.y, d, dMe: Math.hypot(pl.x - me.x, pl.y - me.y), dAll: far(pl.x, pl.y) };
          }
        }
        if (best) { if (res.length >= n) res[n - 1] = best; else res.push(best); }
      }
    } catch (e) { N.err('online.nearbyShop', e); }
    return res;
  }

  /* ================================================================ [party hook] (src/party.js, ARCHITECTURE §24) */
  // A small message bus on the room channel for party activities. channelSend(type, data) broadcasts 'pt'
  // {k, t, d} to the room; onMessage(fn) -> off() gets ({from, nick, type, data}) for every valid message from a
  // player present in the room; players() -> the presence list (+ the ghost's last position). Payloads are
  // capped (type /^[a-z][a-z0-9_]{0,15}$/, data <= 2 KB of JSON) and so is the rate (25 / s out, 40 / s per sender in).
  const PT = { subs: new Set(), out: [], rx: new Map(), sent: 0, recv: 0, dropped: 0 };
  const PT_TYPE = /^[a-z][a-z0-9_]{0,15}$/;
  function ptSize(d) { try { return d === undefined ? 0 : JSON.stringify(d).length; } catch (e) { return Infinity; } }
  function channelSend(type, data) {
    if (!R.ch || !PT_TYPE.test(String(type || '')) || ptSize(data) > 2048) return false;
    const t = nowMs();
    while (PT.out.length && t - PT.out[0] > 1000) PT.out.shift();
    if (PT.out.length >= 25) { PT.dropped++; return false; }
    PT.out.push(t); PT.sent++;
    try { R.ch.send({ type: 'broadcast', event: 'pt', payload: { k: myKey, t: type, d: data === undefined ? null : data } }); } catch (e) { N.err('online.channelSend', e); return false; }
    return true;
  }
  function onPartyMsg(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.k !== 'string' || raw.k === myKey || !PT_TYPE.test(String(raw.t || ''))) return;
    const p = R.players.find((q) => q.key === raw.k);
    if (!p || ptSize(raw.d) > 2048) return;
    const t = nowMs();
    let w = PT.rx.get(raw.k);
    if (!w || t - w.t > 1000) { w = { t, n: 0 }; PT.rx.set(raw.k, w); }
    if (++w.n > 40) { PT.dropped++; return; }
    PT.recv++;
    const msg = { from: raw.k, nick: p.nick, type: raw.t, data: raw.d };
    for (const fn of Array.from(PT.subs)) { try { fn(msg); } catch (e) { N.err('online.onMessage', e); } }
  }
  function onMessage(fn) { if (typeof fn !== 'function') return () => {}; PT.subs.add(fn); return () => PT.subs.delete(fn); }
  function partyPlayers() {
    return R.ch ? R.players.map((p) => { const g = GH.get(p.key); const o = { key: p.key, nick: p.me ? (P.nick || p.nick) : p.nick, look: p.look, me: p.me, j: p.j }; if (g && !g.ent.hidden) { o.x = g.ent.x; o.y = g.ent.y; } return o; }) : [];
  }
  /** party leaderboards: the race_* database functions (supabase/migrations/*_party.sql), keyed by the player code */
  async function partyRpc(fn, args) {
    if (!/^race_[a-z]+$/.test(String(fn || '')) || !P.code || availability() !== 'ok') return { ok: false, reason: 'off' };
    try { return await rpc(fn, args); } catch (e) { return { ok: false, reason: 'net' }; }
  }

  /* ================================================================ HUD: room badge, 👫, nearby card, quick-chat strip */
  // Right edge, mid-height (clear of the touch buttons and the centre prompts): the room badge (opens the panel; "tell
  // friends this code" while alone), 👫 Go to friends (when they are far), the arrival card ("You're all at ..."; the
  // Nearby card steps aside while it shows), the "Nearby" card (a chip on phones that opens a short list), 💬 quick chat.
  let hudEl = null, arriveEl = null;
  const HS = { t: 0, nearT: 0, nearHtml: '', nearOpen: null, snooze: new Map(), lastArrive: -Infinity, inside: new Set(), arrive: null };
  const UI_KEY = 'nostalgia.online.ui.v1';
  /** #ui-top: a layer over the touch controls (#touch, z 20: the joystick zone on the left, the 3D look zone on the
   *  right) and under the menus (#overlay, z 30), so the room HUD and the party cards take taps on phones too
   *  (party.js uses the same layer; style.css "=== online ===") */
  function topLayer() {
    let e = document.getElementById('ui-top');
    if (!e) { e = document.createElement('div'); e.id = 'ui-top'; document.body.appendChild(e); }
    return e;
  }
  const narrow = () => (window.innerWidth || 800) <= 560 || document.body.classList.contains('touch-on');
  function nearOpen() {
    if (HS.nearOpen == null) { let v = null; try { v = JSON.parse(lsGet(UI_KEY) || 'null'); } catch (e) { v = null; } HS.nearOpen = v && typeof v.near === 'boolean' ? v.near : !narrow(); }
    return HS.nearOpen;
  }
  function setNearOpen(on) { HS.nearOpen = !!on; lsSet(UI_KEY, JSON.stringify({ near: HS.nearOpen })); HS.nearHtml = ''; hudTick(true); }
  function buildHud() {
    if (hudEl) return;
    hudEl = document.createElement('div');
    hudEl.className = 'ol-hud interactive';
    hudEl.hidden = true;
    hudEl.innerHTML = '<button type="button" class="ol-badge" data-ol="panel" aria-label="Online room"><span class="ol-badge-top"><b class="ol-badge-code"></b><span class="ol-badge-n"></span></span><small class="ol-badge-hint">tell friends this code</small></button>' +
      '<button type="button" class="ol-go" data-ol="go" hidden aria-label="Go to friends"><span class="ol-go-t">👫 Go to friends</span><small class="ol-go-d"></small></button>' +
      '<div class="ol-arrive" role="status"></div>' +
      '<div class="ol-near" hidden><button type="button" class="ol-near-tg" data-ol="near" aria-expanded="false"><span>🏁 Nearby</span><i class="ol-near-n"></i></button><div class="ol-near-list"></div></div>' +
      '<button type="button" class="ol-chat-tg" data-ol="chat" aria-label="Quick chat" aria-expanded="false">💬</button>' +
      '<div class="ol-chat" hidden>' + PHRASES.map((p) => '<button type="button" class="ol-say" data-say="' + p.id + '">' + esc(p.text) + '</button>').join('') +
      '<button type="button" class="ol-say ol-party" data-ol="party" aria-label="Challenge friends">🏁</button>' + '</div>'; // [party hook]
    hudEl.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      ev.stopPropagation();
      if (b.dataset.say) { say(b.dataset.say); return; }
      if (b.dataset.near) { sfx('ui_select'); quickParty(b.dataset.near, 'nearby'); return; }
      if (b.dataset.arr) {
        const id = HS.arrive && HS.arrive.id;
        if (!id) return;
        if (b.dataset.arr === 'go') { sfx('ui_select'); quickParty(id, 'arrive'); } else { sfx('ui_back'); HS.snooze.set(id, nowMs() + 10 * 60000); hideArrive(); hudTick(true); }
        return;
      }
      if (b.dataset.meet) { sfx('ui_select'); dropPin(b.dataset.meet); return; }
      const a = b.dataset.ol;
      if (a === 'party') { try { if (N.party && N.party.openPicker) N.party.openPicker({ from: 'chat' }); } catch (e) { N.err('online.party', e); } return; } // [party hook]
      if (a === 'chat') { const c = hudEl.querySelector('.ol-chat'); c.hidden = !c.hidden; b.setAttribute('aria-expanded', c.hidden ? 'false' : 'true'); if (!c.hidden && narrow() && nearOpen()) setNearOpen(false); return; }
      if (a === 'near') { sfx('ui_click'); const on = !nearOpen(); setNearOpen(on); if (on && narrow()) { const c = hudEl.querySelector('.ol-chat'); c.hidden = true; hudEl.querySelector('.ol-chat-tg').setAttribute('aria-expanded', 'false'); } return; }
      if (a === 'go') { goToFriends(); return; }
      if (a === 'panel') { try { if (N.state.mode === 'play' && N.game && N.game.pause) N.game.pause(); open({ from: 'pause' }); } catch (e) { N.err('online.badge', e); } }
    });
    // taps on the HUD must not reach the touch controls / canvas under it
    for (const ev of ['pointerdown', 'touchstart']) hudEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    topLayer().appendChild(hudEl);
    arriveEl = hudEl.querySelector('.ol-arrive');
  }
  function renderHud() {
    if (!R.ch) { if (hudEl) hudEl.hidden = true; hideArrive(); return; }
    buildHud();
    const alone = !R.players.some((p) => !p.me);
    hudEl.querySelector('.ol-badge-code').textContent = R.code || '';
    hudEl.querySelector('.ol-badge-n').textContent = ' · ' + R.players.length + '/' + MAX();
    hudEl.querySelector('.ol-badge').classList.toggle('alone', alone);
    hudTick(true);
  }
  function hudVisibility() {
    if (!hudEl) return;
    const m = N.state.mode;
    hudEl.hidden = !R.ch || !(m === 'play' || m === 'dialogue');
  }
  /** nothing else owns the moment: free roam, no mission, no party game / invite / card, no chase */
  function hudCalm() {
    if (N.state.mode !== 'play') return false;
    if (N.missions && N.missions.active) return false;
    const PA = N.party;
    if (PA && (PA.active || PA.invite || PA.uiBusy)) return false;
    if (N.minigames && N.minigames.isOpen && N.minigames.isOpen()) return false;
    if (N.wanted && (N.wanted.level | 0) >= 3) return false;
    return true;
  }
  function quickParty(id, from) {
    hideArrive();
    try { if (N.party && N.party.quick) return N.party.quick(id, { from }); } catch (e) { N.err('online.quick', e); }
    return null;
  }
  /** the 👫 button, the nearby card and the arrival toast (every 0.5 s; the list every 2 s) */
  function hudTick(force) {
    if (!hudEl || !R.ch) return;
    const t = nowMs();
    if (!force && t - HS.t < 500) return;
    HS.t = t;
    const play = gameStarted();
    // 👫: the friend it takes me to (the earliest in the room) is far away, or an offer is pending (a mission-time join)
    const go = hudEl.querySelector('.ol-go');
    const dF = play ? friendDistU() : Infinity;
    const showGo = play && isFinite(dF) && (dF > GO_MIN_U || !!FLOW.offer);
    go.hidden = !showGo;
    if (showGo) { const tx = fmtDist(dF); const d = go.querySelector('.ol-go-d'); if (d.textContent !== tx) d.textContent = tx; go.classList.toggle('pulse', !!FLOW.offer); }
    // the nearby card
    const box = hudEl.querySelector('.ol-near');
    const calm = hudCalm();
    if (HS.arrive && (!calm || t > HS.arrive.until)) hideArrive();
    if (!calm) { box.hidden = true; }
    else if (force || t - HS.nearT > 2000) {
      HS.nearT = t;
      const list = nearby(4);
      box.hidden = !list.length || !!HS.arrive;
      if (list.length) {
        const open = nearOpen();
        box.classList.toggle('open', open);
        const tg = box.querySelector('.ol-near-tg');
        tg.setAttribute('aria-expanded', open ? 'true' : 'false');
        const n = box.querySelector('.ol-near-n'); const nt = String(list.length); if (n.textContent !== nt) n.textContent = nt;
        const friends = R.players.some((p) => !p.me);
        const html = '<p class="ol-near-h">' + (friends ? 'Nearby for the group' : 'Nearby') + '<button type="button" class="ol-near-x" data-ol="near" aria-label="Hide">▾</button></p>' +
          list.map((a) => '<div class="ol-near-row" data-id="' + esc(a.id) + '"><span class="ol-near-i">' + esc(a.icon) + '</span><span class="ol-near-t"><b>' + esc(a.name) + '</b><small>' + esc(fmtDist(a.dMe) + (a.at ? ' · ' + a.at : '')) + '</small></span>' +
            (a.kind === 'shop' ? '<button type="button" class="ol-near-b alt" data-meet="' + esc(a.id) + '">📍 Meet</button>' : '<button type="button" class="ol-near-b" data-near="' + esc(a.id) + '">🏁 Challenge</button>') + '</div>').join('');
        if (html !== HS.nearHtml) { box.querySelector('.ol-near-list').innerHTML = html; HS.nearHtml = html; }
      }
      arriveTick(t);
      if (HS.arrive) box.hidden = true;
    }
  }
  // "You're all at Gokul Chat — Pani puri contest? [🏁 Start]": once per arrival (everybody in the room inside ~60 m
  // of an activity's spot, after not all being there), at most one a minute and the same place not for 5 minutes
  function arriveTick(t) {
    const pts = groupPoints();
    const all = pts.length >= 2 && pts.length === R.players.length;
    const list = all ? nearby(6, pts).filter((a) => a.kind === 'party') : [];
    const now = new Set(list.filter((a) => a.dAll <= Math.max(ARRIVE_U, a.r || 0)).map((a) => a.id));
    let pick = null;
    for (const a of list) if (now.has(a.id) && !HS.inside.has(a.id) && !(HS.snooze.get(a.id) > t)) { pick = a; break; }
    HS.inside = now;
    if (!pick || HS.arrive || t - HS.lastArrive < 60000) return;
    HS.lastArrive = t;
    HS.snooze.set(pick.id, t + 5 * 60000);
    showArrive(pick, t);
  }
  function showArrive(a, t) {
    if (!arriveEl) return;
    const at = a.at || 'the same spot';
    arriveEl.innerHTML = '<span class="ol-arr-i" aria-hidden="true">' + esc(a.icon) + '</span><p class="ol-arr-t"><b>You\'re all at ' + esc(at) + '</b> — ' + esc(a.name) + '?</p>' +
      '<div class="ol-arr-b"><button type="button" class="ol-arr-x" data-arr="x">Not now</button><button type="button" class="ol-arr-go" data-arr="go">🏁 Start</button></div>';
    arriveEl.classList.add('show');
    if (narrow()) { const c = hudEl.querySelector('.ol-chat'); c.hidden = true; hudEl.querySelector('.ol-chat-tg').setAttribute('aria-expanded', 'false'); } // one popover at a time on a phone
    HS.arrive = { id: a.id, until: t + 14000 };
    sfx('bell');
    N.emit('online:arrive', { id: a.id, at });
  }
  function hideArrive() { if (arriveEl) arriveEl.classList.remove('show'); HS.arrive = null; }

  /* ================================================================ the Online panel */
  // Not in a room: the four steps (create -> share -> friends join -> together), the name, two big choices (Create a
  // room / a code + Join). In a room: the code (big, Copy), who is here (marker colours, distance), ▶ Into the city
  // (on the title) or 👫 Go to friends, Nearby for the group, the meet pin, Challenge friends, quick chat, Leave.
  // The player code and the cloud save fold away under "My player code & cloud save" (a newer cloud save is always
  // shown at the top). Keyboard / pad: arrows move between the buttons, Enter in a field submits it.
  let panel = null;
  const ui = { msg: '', msgKind: '', restoreOpen: false, busy: false, busyAct: null, from: null, more: false };
  function say2(msg, kind) { ui.msg = msg || ''; ui.msgKind = kind || ''; renderPanel(); }
  function definePanel() {
    if (panel || !N.menus || !N.menus.definePanel) return panel;
    panel = N.menus.definePanel('online', {
      build() {
        const e = (this.el = document.createElement('div'));
        e.className = 'screen mn-screen mn-online';
        e.setAttribute('role', 'dialog');
        e.setAttribute('aria-label', 'Online');
        e.innerHTML = '<div class="mn-card ol-card"><div class="mn-card-head"><h2>Online · Mohalla</h2><button type="button" class="mn-x" data-act="back" aria-label="Close">✕</button></div>' +
          '<div class="ol-body scroll"></div></div>';
        N.menus.overlayRoot().appendChild(e);
        this.dom = { body: e.querySelector('.ol-body') };
        e.addEventListener('click', (ev) => {
          const b = ev.target.closest('button[data-act]');
          if (!b || b.disabled) return;
          act(b.dataset.act, b);
        });
        e.addEventListener('submit', (ev) => ev.preventDefault());
      },
      onOpen(o) { ui.from = (o && o.from) || null; ui.msg = ''; if (offerEl) offerEl.hidden = true; renderPanel(); },
      onClose() {
        blur();
        if (offerEl && CL.offer) offerEl.hidden = false;
        // closed while the room's code was on show: from the title the game still starts (no extra PLAY step);
        // over the pause deck they wanted the deck, so it stays
        const A = FLOW.auto;
        if (A) { FLOW.auto = null; if (A.kind === 'start') setTimeout(() => runAuto(A), 0); }
        try { N.menus.refreshTitle(); N.menus.refreshPause(); } catch (e) { /* ignore */ }
      },
      back() { blur(); N.menus.closePanel('online'); },
      onKey(k, e, typing) {
        if (k === 'ok' && typing && e && e.target) {
          const f = e.target.dataset.enter;
          if (f) { act(f); return true; }
        }
        return false;
      },
    });
    return panel;
  }
  function blur() { const a = document.activeElement; if (a && a.blur && a !== document.body) a.blur(); }
  function btn(act, label, o) {
    o = o || {};
    let data = '';
    if (o.data) for (const k of Object.keys(o.data)) data += ' data-' + k + '="' + esc(o.data[k]) + '"';
    return '<button type="button" class="mn-btn small' + (o.alt ? ' alt' : '') + (o.cls ? ' ' + o.cls : '') + '" data-nav data-act="' + act + '"' + data + (o.dis ? ' disabled' : '') + (o.def ? ' data-def' : '') + (o.extra || '') + '>' + label + '</button>';
  }
  function agoText(t) {
    if (!t) return 'never';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
  }
  const canCopy = () => !!(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext);
  // a button's identity across re-renders (so keyboard focus survives a presence update)
  const sigOf = (el) => (el && el.dataset && el.dataset.act ? [el.dataset.act, el.dataset.place || '', el.dataset.say || '', el.dataset.party || ''].join('|') : null);
  function nameRow(keep) {
    return '<div class="ol-row ol-name"><label class="ol-field"><span>Your name in the room</span><input type="text" data-k="nick" data-nav data-enter="nick" maxlength="12" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" placeholder="' + esc(P.nick || defaultNick()) + '" value="' + esc(keep.nick != null ? keep.nick : (P.nick || '')) + '"></label>' + btn('nick', 'Save name', { alt: true }) + '</div>';
  }
  function lobbyHtml(keep) {
    const b = ui.busy;
    let h = '<section class="ol-hero">';
    h += '<p class="ol-lead">Play together in the city!</p>';
    h += '<ol class="ol-steps" aria-label="How it works"><li><b>1</b><span>Create a room</span></li><li><b>2</b><span>Share the code</span></li><li><b>3</b><span>Friends join</span></li><li><b>4</b><span>You all appear together</span></li></ol>';
    h += nameRow(keep);
    h += '<div class="ol-two">';
    h += '<div class="ol-box"><h3>Start a room</h3>' + btn('create', b && ui.busyAct === 'create' ? 'Opening…' : '＋ Create a room', { dis: b, def: !b, cls: 'big' }) + '<small>You get a code like CHAI-42 to tell your friends.</small></div>';
    h += '<div class="ol-box"><h3>Got a code?</h3><label class="ol-field"><span>Room code from a friend</span><input type="text" data-k="room" data-nav data-enter="join" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="CHAI-42" value="' + esc(keep.room || '') + '"></label>' + btn('join', b && ui.busyAct === 'join' ? 'Joining…' : 'Join ▶', { dis: b, cls: 'big' }) + '</div>';
    h += '</div>';
    h += '<p class="ol-note">Up to ' + MAX() + ' friends in one room. ' + (gameStarted() ? 'Joining takes you right next to your friends.' : 'The game starts by itself: your saved game, or a new one.') + ' Story missions stay your own.</p>';
    return h + '</section>';
  }
  function roomHtml() {
    const alone = !R.players.some((p) => !p.me);
    const me = N.player && (N.player.vehicle || N.player);
    let h = '<section class="ol-hero ol-inroom">';
    h += '<div class="ol-roomline"><div class="ol-roomcode"><span>ROOM</span><b data-room>' + esc(R.code) + '</b><em>' + R.players.length + '/' + MAX() + '</em></div>' + (canCopy() ? btn('copy', '📋 Copy', { alt: true }) : '') + '</div>';
    h += '<p class="ol-note ol-share">' + (alone ? '<b>Tell your friends this code.</b> They open ONLINE, type it under "Got a code?" and appear right next to you.' : 'Friends join with this code (up to ' + MAX() + ').') + '</p>';
    h += '<ul class="ol-players">' + R.players.map((p) => {
      const g = p.me ? null : GH.get(p.key);
      const d = g && me && g.buf.length && !g.ent.hidden ? ' <small>' + fmtDist(Math.hypot(g.ent.x - me.x, g.ent.y - me.y)) + '</small>' : '';
      return '<li' + (p.me ? ' class="me"' : '') + '><i style="background:' + colorOf(p.key) + '"></i>' + esc(p.me ? (P.nick || p.nick) + ' (you)' : p.nick) + d + '</li>';
    }).join('') + '</ul>';
    const row = [];
    if (!gameStarted()) row.push(btn('play', '▶ Into the city', { def: true, cls: 'big' }));
    else { const fd = friendDistU(); if (isFinite(fd) && fd > GO_MIN_U) row.push(btn('gofriends', '👫 Go to friends <small>' + fmtDist(fd) + '</small>', { cls: 'big', def: true })); }
    if (row.length) h += '<div class="ol-row">' + row.join('') + '</div>';
    h += '</section>';
    if (!gameStarted()) return h + '<div class="ol-row">' + btn('leave', '⏏ Leave room', { alt: true }) + '</div>';
    // nearby for the group
    const list = gameStarted() ? nearby(4) : [];
    if (list.length) {
      h += '<section class="ol-sec"><h3>Nearby for the group</h3><div class="ol-nearby">' + list.map((a) => '<div class="ol-nb-row"><span class="ol-near-i">' + esc(a.icon) + '</span><span class="ol-near-t"><b>' + esc(a.name) + '</b><small>' + esc(fmtDist(a.dMe) + ' from you' + (a.at ? ' · ' + a.at : '')) + '</small></span>' +
        (a.kind === 'shop' ? btn('pin', '📍 Meet', { alt: true, data: { place: a.id } }) : btn('near', '🏁 Challenge', { data: { party: a.id } })) + '</div>').join('') + '</div></section>';
    }
    // meet pin
    const pin = R.pin;
    h += '<section class="ol-sec"><h3>Meet pin</h3><p class="ol-note">' + (pin ? 'Pinned: ' + esc(pin.label ? 'Meet at ' + pin.label : 'a spot on the map') + (pin.by ? ' (by ' + esc(pin.by) + ')' : '') : 'Drop a pin and everyone gets a pink route to it.') + '</p>';
    h += '<div class="ol-row ol-wrap">' + btn('pinhere', '📍 Meet here', { dis: !gameStarted() }) + meetPlaces().map((m) => '<button type="button" class="mn-btn small alt ol-place" data-nav data-act="pin" data-place="' + esc(m.id) + '">' + esc(m.label) + '</button>').join('') + (pin ? btn('unpin', 'Clear pin', { alt: true }) : '') + '</div></section>';
    try { if (N.party && N.party.panelHtml) { const ph = N.party.panelHtml(); if (ph) h += '<section class="ol-sec">' + ph + '</section>'; } } catch (e) { N.err('online.partyPanel', e); } // [party hook] "Challenge friends"
    h += '<section class="ol-sec"><h3>Quick chat</h3><div class="ol-row ol-wrap">' + PHRASES.map((p) => '<button type="button" class="mn-btn small alt ol-say" data-nav data-act="say" data-say="' + p.id + '">' + esc(p.text) + '</button>').join('') + '</div>';
    h += '<div class="ol-row">' + btn('leave', '⏏ Leave room', { alt: true }) + '</div></section>';
    return h;
  }
  function moreHtml(keep) {
    const open = ui.more || ui.restoreOpen;
    let h = '<section class="ol-sec ol-more"><button type="button" class="ol-more-tg" data-nav data-act="more" aria-expanded="' + (open ? 'true' : 'false') + '"><i>' + (open ? '▾' : '▸') + '</i> My player code &amp; cloud save</button>';
    if (!open) return h + '</section>';
    if (R.ch) h += nameRow(keep);
    if (P.code) h += '<div class="ol-code"><span>Your player code</span><b class="ol-code-v" data-code>' + esc(P.code) + '</b><small>Write it down! Enter it on another phone to continue your journey there.</small></div>';
    else h += '<p class="ol-note">You get a player code the first time you go online. It is your key: no email, no password.</p>';
    h += '<div class="ol-row">' + (P.code ? '' : btn('start', '▶ Go online')) + btn('restore', ui.restoreOpen ? 'Hide' : 'Use my code', { alt: true }) + '</div>';
    if (ui.restoreOpen) {
      h += '<div class="ol-row"><label class="ol-field wide"><span>Player code from your other phone</span><input type="text" data-k="code" data-nav data-enter="usecode" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CHAI-PATANG-GULLY-4821-K7QXM" value="' + esc(keep.code || '') + '"></label>' + btn('usecode', 'Use it') + '</div>';
      if (P.code) h += '<p class="ol-note">This phone\'s code will be replaced. Keep ' + esc(P.code) + ' if you want to come back to it.</p>';
    }
    if (P.code) {
      const c0 = P.cloud.main;
      h += '<h4>Cloud save</h4><p class="ol-note">' + (CL.busy ? 'Checking the cloud…' : c0 ? 'Latest save in the cloud: ' + agoText(c0.t) + '.' : 'Nothing in the cloud yet. Save the game and it goes up by itself.') + '</p>';
      if (CL.note) h += '<p class="ol-note warn">' + esc(CL.note) + '</p>';
      if (!CL.offer) h += '<div class="ol-row">' + btn('pull', '☁ Check cloud', { alt: true, dis: CL.busy }) + btn('push', '● Save to cloud', { alt: true, dis: CL.busy || !(N.save && N.save.has && N.save.has()) }) + '</div>';
    }
    return h + '</section>';
  }
  function renderPanel() {
    if (!panel || !panel.el || !panel.el.classList.contains('show')) return;
    const B = panel.dom.body;
    // keep what is being typed (and the focused button) across re-renders
    const keep = {};
    B.querySelectorAll('input[data-k]').forEach((i) => { keep[i.dataset.k] = i.value; });
    const ae = document.activeElement;
    const focusK = ae && B.contains(ae) && ae.dataset ? ae.dataset.k : null;
    const focusSig = ae && B.contains(ae) && !focusK ? sigOf(ae) : null;
    const av = availability();
    let h = '';
    if (av === 'soon') {
      h = '<div class="ol-soon"><p class="ol-big">Online play is coming soon</p><p>Soon you can meet your friends in the city: up to ' + MAX() + ' of you in one room. The game on this phone works the same as always.</p></div>';
    } else if (av === 'web') {
      h = '<div class="ol-soon"><p class="ol-big">Online play needs the web version</p><p>Open <b>' + esc(SITE) + '</b> in the browser to play with friends. This copy plays offline.</p></div>';
    } else {
      const st = S.status;
      const stLine = { loading: 'Connecting…', ready: 'Connected', room: 'In a room', reconnecting: 'Reconnecting…', offline: 'Offline' }[st] || '';
      if (stLine) h += '<p class="ol-status ol-st-' + esc(st) + '"><i></i>' + esc(stLine) + (S.lastError && st === 'offline' ? ' · ' + esc(S.lastError) : '') + '</p>';
      if (ui.msg) h += '<p class="ol-msg ' + esc(ui.msgKind) + '" role="status">' + esc(ui.msg) + '</p>';
      if (CL.offer) h += '<div class="ol-offer-row"><b class="ol-offer-l">A newer save is in the cloud: ' + esc(CL.offer.line) + '</b><div class="ol-row">' + btn('take', '☁ Use cloud save') + btn('keep', 'Keep this one', { alt: true }) + '</div></div>';
      h += R.ch ? roomHtml() : lobbyHtml(keep);
      h += moreHtml(keep);
      h += '<p class="ol-fine">Online keeps only your player code (scrambled), your nickname and your saves. No chat typing: just the buttons.</p>';
    }
    B.innerHTML = h;
    if (focusK) { const i = B.querySelector('input[data-k="' + focusK + '"]'); if (i) { try { i.focus({ preventScroll: true }); const L = i.value.length; i.setSelectionRange(L, L); } catch (e) { /* ignore */ } } }
    else if (focusSig) { const b = Array.from(B.querySelectorAll('button[data-act]')).find((x) => sigOf(x) === focusSig && !x.disabled); if (b) { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
    const ni = B.querySelector('input[data-k="nick"]');
    if (ni) ni.addEventListener('input', () => { const c = cleanNick(ni.value); if (c !== ni.value) ni.value = c; });
  }
  const inputVal = (k) => { const i = panel && panel.dom.body.querySelector('input[data-k="' + k + '"]'); return i ? i.value : ''; };
  async function goOnline() {
    ensureCode();
    if (!P.nick) P.nick = defaultNick();
    saveProfile();
    try {
      await ensureClient();
      setNick(P.nick).catch(() => {});
      await cloudPull();
      return true;
    } catch (e) { return false; }
  }
  /** close the panel (and the pause deck under it) and get back into the world */
  function backToPlay() {
    try { if (panel) N.menus.closePanel('online'); if (N.state.mode === 'paused') { if (N.menus.resume) N.menus.resume(); else N.game.resume(); } } catch (e) { N.err('online.backToPlay', e); }
  }
  function enterMsg(a, r) {
    const m = N.state.mode;
    const code = r.code || R.code;
    if (a === 'create') return 'Room ' + code + ' is open! Tell your friends the code.' + (m === 'title' ? ' Taking you into the city…' : m === 'paused' ? ' Back to the city…' : '');
    const friends = R.players.some((p) => !p.me);
    return 'You joined room ' + code + '!' + (friends ? (m === 'title' ? ' Taking you to your friends…' : m === 'paused' ? ' Off to your friends…' : '') : ' Waiting for friends…');
  }
  async function act(a, b) {
    try {
      if (a === 'back') { sfx('ui_back'); panel.back(); return; }
      if ((a === 'create' || a === 'join') && ui.busy) return; // a double tap: the first one is on its way
      sfx('ui_select');
      if (a === 'start') { say2('Getting your player code…'); const ok = await goOnline(); say2(ok ? 'You are online! Write down your player code.' : (S.lastError || 'Could not connect.'), ok ? 'ok' : 'bad'); }
      else if (a === 'nick') {
        const r = await setNick(inputVal('nick'));
        if (r.ok && P.code && !S.client) goOnline();
        say2(r.ok ? (r.why || 'Name saved: ' + P.nick) : r.why, r.ok ? 'ok' : 'bad');
      } else if (a === 'more') { ui.more = !(ui.more || ui.restoreOpen); if (!ui.more) ui.restoreOpen = false; renderPanel(); }
      else if (a === 'restore') { ui.restoreOpen = !ui.restoreOpen; ui.more = true; renderPanel(); }
      else if (a === 'usecode') { say2('Checking the code…'); const r = await useCode(inputVal('code')); if (r.ok) ui.restoreOpen = false; say2(r.ok ? 'Welcome back' + (P.nick ? ', ' + P.nick : '') + '!' : r.why, r.ok ? 'ok' : 'bad'); }
      else if (a === 'pull') { const r = await cloudPull(); say2(r.ok ? (r.offer ? 'There is a newer save in the cloud.' : 'Cloud and phone match.') : 'Could not reach the cloud.', r.ok ? 'ok' : 'bad'); }
      else if (a === 'push') { const r = await cloudPush(null, false); say2(r.ok ? 'Saved to the cloud.' : r.why === 'newer_save' || r.why === 'newer_build' ? 'The cloud has a newer save. It was kept.' : 'Could not save to the cloud.', r.ok ? 'ok' : 'bad'); }
      else if (a === 'take') takeOffer();
      else if (a === 'keep') keepLocal();
      else if (a === 'create' || a === 'join') {
        const code = a === 'join' ? inputVal('room') : null;
        ui.busy = true; ui.busyAct = a;
        say2(a === 'create' ? 'Opening a room…' : 'Joining…');
        let r;
        try {
          if (!P.code) await goOnline();
          r = a === 'create' ? await createRoom() : await joinRoom(code);
        } finally { ui.busy = false; ui.busyAct = null; }
        say2(r.ok ? enterMsg(a, r) : r.why, r.ok ? 'ok' : 'bad');
      } else if (a === 'play') { startGame(); }
      else if (a === 'gofriends') { backToPlay(); goToFriends(); }
      else if (a === 'near') { const id = b && b.dataset.party; backToPlay(); if (id) quickParty(id, 'panel'); }
      else if (a === 'copy') { try { await navigator.clipboard.writeText(R.code || ''); say2('Copied ' + R.code + '. Paste it to your friends!', 'ok'); } catch (e) { say2('Could not copy. The code is ' + R.code + '.', 'bad'); } }
      else if (a === 'leave') { await leaveRoom(); say2('You left the room.'); }
      else if (a === 'pinhere') { await dropPin(null); }
      else if (a === 'pin') { await dropPin(b && b.dataset.place); }
      else if (a === 'unpin') { await clearPin(); }
      else if (a === 'say') { say(b && b.dataset.say); }
      else if (a === 'party') { if (N.party && N.party.panelAct) N.party.panelAct(b && b.dataset.party, b); } // [party hook]
    } catch (e) { N.err('online.act:' + a, e); ui.busy = false; say2('Something went wrong. Try again.', 'bad'); }
  }
  function open(o) {
    if (!definePanel()) return false;
    N.menus.openPanel('online', o || {});
    if (availability() === 'ok' && P.code && !S.client) ensureClient().then(() => { if (!CL.pulled) cloudPull(); }).catch(() => {});
    return true;
  }
  function close() { if (panel) N.menus.closePanel('online'); }

  /* ================================================================ Journal: Journey page */
  function addJourneyTab() {
    if (!N.menus || !N.menus.addJournalTab) return;
    N.menus.addJournalTab({
      id: 'journey', title: 'Journey', order: 60,
      render(el) {
        const j = journey();
        const M = N.missions;
        const title = (id) => { const d = M && M.defs && (M.defs[id] || (M.defs.get && M.defs.get(id))); return (d && d.title) || String(id).replace(/_/g, ' '); };
        const li = (arr, fn) => arr.length ? '<ul class="jy-list">' + arr.map((x) => '<li>' + esc(fn(x)) + '</li>').join('') + '</ul>' : '<p class="nb-empty">Nothing yet.</p>';
        let h = '<div class="jy"><h3 class="nb-title">My Journey <small>' + esc(j.date) + '</small></h3>';
        h += '<div class="jy-stats"><span><b>' + j.missions.length + '</b> missions</span><span><b>' + j.tracks.length + '</b> tape tracks</span><span><b>' + j.tin.length + '</b> in the tin</span><span><b>' + j.places.length + '</b> places</span></div>';
        h += '<h4>Missions passed</h4>' + li(j.missions, title);
        h += '<h4>Side A tracks</h4>' + li(j.tracks, (t) => t.label);
        h += '<h4>The tin</h4>' + li(j.tin, tinName);
        h += '<h4>Places visited</h4>' + li(j.places.slice(0, 60), placeName) + (j.places.length > 60 ? '<p class="jl-foot">…and ' + (j.places.length - 60) + ' more.</p>' : '');
        const av = availability();
        h += '<p class="jl-foot">' + (av === 'soon' ? 'Online journeys are coming soon.' : av === 'web' ? 'Cloud journeys need the web version.' : P.code ? 'Kept in the cloud with your player code' + (P.nick ? ' as ' + esc(P.nick) : '') + '.' : 'Go Online (pause menu) to keep your journey in the cloud.') + '</p></div>';
        el.innerHTML = h;
      },
    });
  }

  /* ================================================================ system + wiring */
  N.on('save', (d) => { if (d && d.ok) schedulePush(); });
  for (const ev of ['mission:pass', 'place:visited', 'tape:rec', 'item:give']) N.on(ev, () => scheduleJourney());
  N.on('game:quit', () => { /* the room stays open across the title: friends keep seeing your last spot */ });
  window.addEventListener('pagehide', () => { if (R.ch) { try { R.ch.unsubscribe(); } catch (e) { /* ignore */ } } });

  N.addSystem({
    id: 'online', order: 86, runIn: ['*'],
    init() {
      definePanel();
      addJourneyTab();
      // used Online on this device before: load the SDK quietly after boot to mirror the saves
      if (availability() === 'ok' && P.code) setTimeout(() => { ensureClient().then(() => cloudPull()).catch(() => {}); }, 2500);
    },
    update(dt) {
      if (R.ch) sendState();
      updateGhosts(dt);
      hudVisibility();
      if (FLOW.auto && nowMs() >= FLOW.auto.at) { const A = FLOW.auto; FLOW.auto = null; runAuto(A); }
      if (R.ch) { placeTick(); hudTick(false); }
      if (R.pin && R.pinWp && N.state.mode === 'play') {
        const p = N.player, e = (p && p.vehicle) || p;
        if (e && Math.hypot(e.x - R.pin.x, e.y - R.pin.y) < 48) { try { N.hud.unblip('ol:pin'); } catch (er) { /* ignore */ } R.pinWp = null; }
      }
    },
    draw() { placeTags(); },
  });

  const API = (N.online = {
    get available() { return availability(); },
    get ready() { return !!S.client; },
    get status() { return S.status; },
    get lastError() { return S.lastError; },
    get code() { return P.code; },
    get nick() { return P.nick; },
    get room() { return R.ch ? { code: R.code, n: R.players.length, players: R.players.map((p) => ({ nick: p.nick, me: p.me })), pin: R.pin } : null; },
    MAX: MAX(), PHRASES, CODE_BITS, WORDS_N: WORDS.length, TUNE,
    get MEET_PLACES() { return meetPlaces(); },
    open, close, setNick, useCode, newCode, cleanNick, nickOk, normCode, codeOk, normRoom,
    goOnline,
    cloud: { pull: cloudPull, push: cloudPush, take: takeOffer, keep: keepLocal, get state() { return { busy: CL.busy, offer: CL.offer ? { slot: CL.offer.slot, t: CL.offer.t, line: CL.offer.line } : null, note: CL.note, cloud: JSON.parse(JSON.stringify(P.cloud)), lastPush: CL.lastPush }; } },
    journey, pushJourney,
    createRoom, joinRoom, leaveRoom, dropPin, clearPin, say,
    goToFriends, startGame, nearby: (max) => (R.ch ? nearby(max || 4) : []),
    get flow() { return { auto: FLOW.auto ? FLOW.auto.kind : null, place: !!FLOW.place, offer: !!FLOW.offer, how: FLOW.how, entering: !!R.entering, arrive: HS.arrive ? HS.arrive.id : null }; },
    // [party hook] (src/party.js): the room message bus, the player list and the race_* leaderboard calls
    channelSend, onMessage, players: partyPlayers, partyRpc, get myKey() { return myKey; },
    titleLine() {
      const av = availability();
      if (av === 'soon') return 'coming soon';
      if (av === 'web') return 'web version only';
      if (R.ch) return 'ROOM ' + R.code + ' · ' + R.players.length + '/' + MAX();
      return P.nick ? P.nick + ' · play with friends' : 'play with up to ' + MAX() + ' friends';
    },
    pauseLine() {
      const av = availability();
      if (av !== 'ok') return av === 'soon' ? 'coming soon' : 'web only';
      return R.ch ? R.code + ' · ' + R.players.length + '/' + MAX() : 'friends · cloud';
    },
    _debug: {
      get key() { return myKey; },
      ghosts: () => Array.from(GH.values()).map((g) => ({ key: g.key, nick: g.nick, x: g.ent.x, y: g.ent.y, a: g.ent.angle, mode: g.ent.view3d, type: g.ent.type || null, hidden: !!g.ent.hidden, inEntities: N.entities.all.indexOf(g.ent) >= 0, buf: g.buf.length, blip: !!(N.hud && N.hud.blips && N.hud.blips.has(g.blip)) })),
      stats: () => ({ sent: R.sent, recv: R.recv, hz: stateHz(), players: R.players.length }),
      sanitizeState, sanitizeLook, profile: () => JSON.parse(JSON.stringify(P)),
      /** tests: forget what this phone knows about the cloud (so only the server's guard is left) */
      forgetCloud() { P.cloud = {}; saveProfile(); },
      /** tests: forget the arrival card's rate limits (one a minute, 5 min per activity) and hide it */
      arriveReset() { HS.lastArrive = -Infinity; HS.snooze.clear(); HS.inside = new Set(); hideArrive(); HS.nearT = 0; },
      trace(on) { if (on) { TRACE.out = []; TRACE.on = true; return null; } TRACE.on = false; return TRACE.out; },
      reset() { P.code = null; P.nick = null; P.cloud = {}; P.journeyHash = null; P.dismissed = {}; saveProfile(); },
    },
  });
})();
