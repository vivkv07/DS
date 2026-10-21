/* NOSTALGIA — telemetry.js  (N.telemetry; ARCHITECTURE §25, design/analytics.md)
 * Anonymous, cheap play stats for the owners: how many people play, on what, how far they get, what they play
 * with friends, what breaks. No SDK: events are batched in memory and POSTed with fetch to the PostgREST RPC
 * `${ONLINE_CONFIG.url}/rest/v1/rpc/track_events` (headers apikey + Authorization: Bearer <publishable key>, as
 * supabase-js sends them for the save_* calls), which writes them to the private table nostalgia.events
 * (supabase/migrations/20261021000000_telemetry.sql).
 *
 * RULES
 *   - Identity: a random install id (uuid v4, localStorage 'nostalgia.telemetry.v1') and a session id per page
 *     load (a new one after 30 min in the background). With an online player code, sha256(code) is sent as a link
 *     (the same key the cloud saves use); never the code. No names, nicknames, emails, IPs, room codes or anything
 *     a player types. Props are flat scalars (key /^[a-z][a-z0-9_]{0,23}$/, ≤ 24 keys, strings ≤ 120 chars with no
 *     URLs / emails, ≤ 2 KB per event); the server re-checks all of it.
 *   - Off on file:// (dist/nostalgia.html), when N.ONLINE_CONFIG is null, inside a frame (the artifact host),
 *     under automation (navigator.webdriver: the test suites) and when the player turns off Settings → Privacy →
 *     "Share anonymous play stats" (default ON; default OFF when the browser sends Do-Not-Track / GPC). Off = nothing
 *     is sent and the queue is cleared. window.NOSTALGIA_TELEMETRY (set before load) overrides it for tests:
 *     null / false = off; true or {flushMs, beatS, notice, url, key, ...TUNE} = on even under automation.
 *   - Cost: at most one request a minute while somebody is playing (≤ 50 events, < 32 KB), one more with
 *     fetch keepalive when the tab is hidden / the page goes away. Idle (no input) = no heartbeat = no request.
 *     Failures retry twice with backoff, then the batch is dropped; offline = nothing is tried. Never throws,
 *     never blocks the game: every handler is wrapped and the network is async.
 *   - A one-time notice on the title screen ("Anonymous play stats help us … [Turn off] [OK]").
 *
 * EVENTS (names are stable: the owner's SQL views read them; design/analytics.md has the full table)
 *   session_start {touch, scr, dpr, lang, tz, ref, ret, days, n, save, online, view, conn, pwa, resume}
 *   settings {view, mute, vol, music, diff, text, motion, captions, assist, hc, cb, handed, btn}   (snapshot)
 *   setting {key, value}            a change (debounced)          heartbeat {sec, act, play, idle, menu, v2d, v3d, fps, room, mode}
 *   perf_boot {b, world_b}          perf_3d {b, ok}               error {src, n, msg}
 *   funnel: title_shown · new_game {skip_intro, online} · continue · intro_skipped · first_control {after, how}
 *   story:  track_start / track_pass / track_fail / track_abort {id, track, ch, attempt, dur} · chapter {n} · ending {phase}
 *   play:   side_start / side_end {id, kind, attempt, result, dur, room} · mg_start / mg_end {id, win, score, stars,
 *           quit, dur, world, mission, room} · party_start / party_end {id, mode, humans, ai, place, reason, dur}
 *   online: room_create · room_join {size} · room_leave {dur, peak, why} · party_challenge {id, room} ·
 *           cloud_save {slot, ok, why} · online_start {how}
 * Hooks: only N.on(...) listeners on events other modules already emit (mission:*, minigame:*, party:*, online:*,
 *   view:*, settings:change, audio:settings, cutscene:skip, story2:ending, game:*, state, boot) and a wrapper around
 *   N.err (counts per source). online.js / party.js / minigames.js are not touched.
 *
 * API  N.telemetry = {state ('on' | 'off' | 'file' | 'noconfig' | 'framed' | 'automation' | 'disabled'), active, on,
 *   setOn(bool), track(name, props) -> bool, flush({keepalive}) -> Promise, install, session, EVENTS, TUNE, _debug}
 * Deviation (ARCHITECTURE §2): the web game now makes this one kind of network call without the player opening
 *   Online (owner request, 2026-10-21: "make sure we have all the metrics stored somewhere"); it is anonymous,
 *   tiny, off in the offline copy and can be switched off in Settings.
 */
(() => {
  'use strict';
  const N = window.N;
  const LS_KEY = 'nostalgia.telemetry.v1';
  const lsGet = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const pnow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const r1 = (v) => Math.round(v * 10) / 10;

  const TUNE = {
    flushMs: 60000,          // at most one regular request per minute
    beatS: 60,               // heartbeat window (s of wall time)
    activeMs: 30000,         // input within the last 30 s = "active"
    maxBatch: 50, maxBytes: 32000, maxQueue: 200, maxProps: 2048,
    retries: 2,              // after the first failure: 2 more tries (60 s, 120 s later), then drop
    newSessionAfterMs: 30 * 60 * 1000,
    settingDebounceMs: 2500,
    notice: true,
  };
  const EVENTS = ['session_start', 'settings', 'setting', 'heartbeat', 'perf_boot', 'perf_3d', 'error',
    'title_shown', 'new_game', 'continue', 'intro_skipped', 'first_control',
    'track_start', 'track_pass', 'track_fail', 'track_abort', 'chapter', 'ending',
    'side_start', 'side_end', 'mg_start', 'mg_end', 'party_start', 'party_end',
    'room_create', 'room_join', 'room_leave', 'party_challenge', 'cloud_save', 'online_start'];
  const NAME_RE = /^[a-z][a-z0-9_]{1,31}$/;
  const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
  const BAD_STR = /[a-z][a-z0-9+.-]*:\/\/|[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  /* ================================================================ config / availability */
  const hasOverride = Object.prototype.hasOwnProperty.call(window, 'NOSTALGIA_TELEMETRY');
  const OV = hasOverride ? window.NOSTALGIA_TELEMETRY : undefined;
  if (OV && typeof OV === 'object') for (const k of Object.keys(TUNE)) if (k in OV && typeof OV[k] === typeof TUNE[k]) TUNE[k] = OV[k];
  function endpoint() {
    const c = N.ONLINE_CONFIG;
    if (!c || typeof c !== 'object' || typeof c.url !== 'string' || typeof c.key !== 'string' || !c.url || !c.key) return null;
    const url = OV && typeof OV === 'object' && typeof OV.url === 'string' ? OV.url : c.url;
    const key = OV && typeof OV === 'object' && typeof OV.key === 'string' ? OV.key : c.key;
    return { url: url.replace(/\/+$/, '') + '/rest/v1/rpc/track_events', key };
  }
  function framed() { try { return window.self !== window.top; } catch (e) { return true; } }
  function webdriver() { try { return !!navigator.webdriver; } catch (e) { return false; } }
  // why telemetry cannot run here at all (the setting aside), or null
  function blocker() {
    if (hasOverride && (OV === null || OV === false)) return 'disabled';
    let proto = '';
    try { proto = location.protocol; } catch (e) { proto = ''; }
    if (!/^https?:$/.test(proto)) return 'file';
    if (!endpoint()) return 'noconfig';
    if (!hasOverride && framed()) return 'framed';
    if (!hasOverride && webdriver()) return 'automation';
    return null;
  }

  /* ================================================================ install record */
  function uuid4() {
    const b = new Uint8Array(16);
    try { window.crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0; }
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function privacySignal() {
    try { return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1'; } catch (e) { return false; }
  }
  // {v, id, first (ms), last (ms), n (sessions before this one), on (bool | null = default), noticed, ch (max chapter)}
  const REC = (() => {
    let o = null;
    try { o = JSON.parse(lsGet(LS_KEY) || 'null'); } catch (e) { o = null; }
    const fresh = !(o && typeof o === 'object' && typeof o.id === 'string' && UUID_RE.test(o.id));
    if (fresh) o = { v: 1, id: uuid4(), first: Date.now(), last: 0, n: 0, on: null, noticed: false, ch: 0 };
    o.fresh = fresh;
    if (!(o.first > 0)) o.first = Date.now();
    return o;
  })();
  function saveRec() { const o = Object.assign({}, REC); delete o.fresh; lsSet(LS_KEY, JSON.stringify(o)); }
  function settingOn() { return REC.on == null ? !privacySignal() : !!REC.on; }

  /* ================================================================ state */
  const Q = [];                 // [{s: session, name, props, t}]
  const ST = { inflight: null, lastFlush: 0, nextTry: 0, bad4xx: 0, broken: false, sent: [], stats: { req: 0, ok: 0, fail: 0, dropped: 0, events: 0 } };
  let session = uuid4(), sessionT0 = pnow(), sessionStarted = false, hiddenAt = 0, resumed = false;
  let live = false;             // tracking right now (available + setting on)
  function refreshLive() {
    const was = live;
    live = !blocker() && settingOn() && !ST.broken;
    if (!live && was) Q.length = 0;
    return live;
  }

  /* ================================================================ sanitising */
  function cleanStr(s) {
    s = String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
    return BAD_STR.test(s) ? '' : s;
  }
  function cleanProps(p) {
    const o = {};
    if (!p || typeof p !== 'object') return o;
    let n = 0;
    for (const k of Object.keys(p)) {
      if (n >= 24) break;
      if (!KEY_RE.test(k) || k === 'at') continue;
      const v = p[k];
      if (v === null) o[k] = null;
      else if (typeof v === 'boolean') o[k] = v;
      else if (typeof v === 'number') { if (!isFinite(v)) continue; o[k] = Math.round(v * 1000) / 1000; }
      else if (typeof v === 'string') o[k] = cleanStr(v);
      else continue;
      n++;
    }
    return o;
  }
  /** Strip a message down to something safe to keep: first line, no URLs / emails / numbers, 120 chars. */
  function cleanMsg(m) {
    let s = String(m == null ? '' : m).split('\n')[0];
    s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '<url>').replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '<email>')
      .replace(/(^|[\s(])\/[^\s)]*/g, '$1<path>').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
    return s.slice(0, 120);
  }
  const cleanSrc = (s) => String(s == null ? '?' : s).replace(/[^A-Za-z0-9_.:-]/g, '').replace(/\d{3,}/g, '#').slice(0, 48) || '?';
  const cleanId = (s) => (typeof s === 'string' && /^[a-z0-9_]{1,40}$/i.test(s) ? s.toLowerCase() : null);

  function sinceStart() { return r1(Math.max(0, (pnow() - sessionT0) / 1000)); }
  /** Queue one event. Returns true when it was queued. */
  function track(name, props) {
    try {
      if (!live || typeof name !== 'string' || !NAME_RE.test(name)) return false;
      const p = cleanProps(props);
      if (JSON.stringify(p).length > TUNE.maxProps) { ST.stats.dropped++; return false; }
      Q.push({ s: session, name, props: p, t: sinceStart() });
      ST.stats.events++;
      while (Q.length > TUNE.maxQueue) { Q.shift(); ST.stats.dropped++; }
      return true;
    } catch (e) { return false; }
  }

  /* ================================================================ context helpers */
  function deviceClass() {
    try {
      const sw = Math.min(screen.width || 0, screen.height || 0) || Math.min(innerWidth, innerHeight);
      const touch = (navigator.maxTouchPoints | 0) > 0 || 'ontouchstart' in window;
      const fine = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
      if (touch && sw < 600) return 'phone';
      if (touch && !fine && sw < 1300) return 'tablet';
      return 'desktop';
    } catch (e) { return 'desktop'; }
  }
  const DEVICE = deviceClass();
  function buildId() {
    let v = String(N.VERSION || '0').replace(/[^0-9A-Za-z.]/g, '').slice(0, 16) || '0';
    try {
      const d = new Date(document.lastModified);
      // GitHub Pages sends Last-Modified (the deploy time); a page without it reports "now": leave it out
      if (isFinite(d.getTime()) && Math.abs(Date.now() - d.getTime()) > 15000) v += '+' + d.toISOString().slice(2, 16).replace(/[-:T]/g, '');
    } catch (e) { /* ignore */ }
    return v.slice(0, 40);
  }
  const BUILD = buildId();
  function roomSize() { try { const r = N.online && N.online.room; return r ? r.n | 0 : 0; } catch (e) { return 0; } }
  function msBucket(ms) {
    const s = ms / 1000;
    const edges = [1, 2, 3, 5, 8, 13, 20, 30];
    for (let i = 0; i < edges.length; i++) if (s < edges[i]) return (i ? edges[i - 1] : 0) + '-' + edges[i] + 's';
    return '30s+';
  }
  function fpsBucket(f) { return !(f > 0) ? null : f < 20 ? '<20' : f < 30 ? '20-30' : f < 45 ? '30-45' : f < 55 ? '45-55' : '55+'; }
  function refHost() {
    try {
      if (!document.referrer) return null;
      const h = new URL(document.referrer).hostname.toLowerCase();
      if (!h || h === location.hostname) return null;
      return /^[a-z0-9.-]{1,64}$/.test(h) ? h : null;
    } catch (e) { return null; }
  }
  function langTag() {
    try { const l = String(navigator.language || ''); return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,4})?$/.test(l) ? l : null; } catch (e) { return null; }
  }
  const r50 = (v) => Math.round((v || 0) / 50) * 50;
  function hasSave() { try { return !!(N.save && N.save.has && N.save.has()); } catch (e) { return false; } }
  function viewMode() { try { const V = N.view; return V ? String(V.want || V.mode || 'top') : 'top'; } catch (e) { return 'top'; } }

  /* ================================================================ player link: sha256(code) */
  const PH = { code: null, hash: null, busy: false };
  function playerCode() { try { const c = N.online && N.online.code; return typeof c === 'string' && c ? c.trim().toUpperCase() : null; } catch (e) { return null; } }
  function refreshPlayerHash() {
    const code = playerCode();
    if (!code) { PH.code = null; PH.hash = null; return Promise.resolve(null); }
    if (code === PH.code && PH.hash) return Promise.resolve(PH.hash);
    if (PH.busy) return Promise.resolve(PH.hash);
    let subtle = null;
    try { subtle = window.crypto && window.crypto.subtle; } catch (e) { subtle = null; }
    if (!subtle || typeof TextEncoder === 'undefined') return Promise.resolve(null);
    PH.busy = true;
    return subtle.digest('SHA-256', new TextEncoder().encode(code)).then((buf) => {
      PH.code = code; PH.hash = Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
      PH.busy = false; return PH.hash;
    }, () => { PH.busy = false; return null; });
  }

  /* ================================================================ sending */
  function takeBatch() {
    if (!Q.length) return null;
    const s = Q[0].s;
    const list = [];
    let bytes = 260;
    while (list.length < TUNE.maxBatch && Q.length && Q[0].s === s) {
      const e = Q[0];
      const item = { name: e.name, t: e.t, props: e.props };
      const len = JSON.stringify(item).length + 1;
      if (list.length && bytes + len > TUNE.maxBytes) break;
      list.push(item); bytes += len; Q.shift();
    }
    return { s, list, tries: 0 };
  }
  function requeue(b) {
    b.tries++;
    if (b.tries > TUNE.retries) { ST.stats.dropped += b.list.length; return; }
    for (let i = b.list.length - 1; i >= 0; i--) { const x = b.list[i]; Q.unshift({ s: b.s, name: x.name, props: x.props, t: x.t }); }
    Q._tries = b.tries;
    ST.nextTry = pnow() + TUNE.flushMs * Math.pow(2, b.tries - 1);
  }
  /** Send what is queued (one batch). keepalive: the page is going away (do not wait for the answer). */
  function flush(o) {
    o = o || {};
    try {
      if (!live || !Q.length) return Promise.resolve({ ok: true, sent: 0 });
      if (ST.inflight && !o.keepalive) return Promise.resolve({ ok: false, why: 'busy' });
      let online = true;
      try { online = navigator.onLine !== false; } catch (e) { online = true; }
      if (!online) { ST.nextTry = pnow() + TUNE.flushMs; return Promise.resolve({ ok: false, why: 'offline' }); }
      const ep = endpoint();
      if (!ep) return Promise.resolve({ ok: false, why: 'noconfig' });
      const tries = Q._tries | 0; Q._tries = 0;
      const b = takeBatch();
      if (!b || !b.list.length) return Promise.resolve({ ok: true, sent: 0 });
      b.tries = tries;
      const body = JSON.stringify({ events: { v: 1, install: REC.id, session: b.s, player: PH.hash || null, build: BUILD, device: DEVICE, list: b.list } });
      ST.lastFlush = pnow(); ST.nextTry = 0;
      ST.stats.req++;
      ST.sent.push({ n: b.list.length, bytes: body.length, keepalive: !!o.keepalive }); if (ST.sent.length > 30) ST.sent.shift();
      const mine = {};
      if (!o.keepalive) ST.inflight = mine;
      let req;
      try {
        req = fetch(ep.url, {
          method: 'POST', body, keepalive: !!o.keepalive, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json', apikey: ep.key, Authorization: 'Bearer ' + ep.key },
        });
      } catch (e) { req = Promise.reject(e); }
      return Promise.resolve(req).then((res) => {
        if (res.ok) {
          return res.json().catch(() => null).then((j) => {
            if (j && j.ok === false) { ST.stats.dropped += b.list.length; ST.stats.fail++; return { ok: false, why: j.reason || 'refused' }; }
            ST.stats.ok++; ST.bad4xx = 0; return { ok: true, sent: b.list.length };
          });
        }
        ST.stats.fail++;
        if (res.status >= 500 || res.status === 429 || res.status === 408) { if (live) requeue(b); return { ok: false, why: 'http_' + res.status }; }
        ST.stats.dropped += b.list.length;
        if (++ST.bad4xx >= 3) { ST.broken = true; refreshLive(); } // misconfigured: stop for this page
        return { ok: false, why: 'http_' + res.status };
      }, () => {
        ST.stats.fail++;
        if (live) requeue(b); else ST.stats.dropped += b.list.length; // (a page that went away never gets here)
        return { ok: false, why: 'net' };
      }).then((r) => { if (ST.inflight === mine) ST.inflight = null; return r; }, () => { if (ST.inflight === mine) ST.inflight = null; return { ok: false, why: 'error' }; });
    } catch (e) { ST.inflight = null; return Promise.resolve({ ok: false, why: 'error' }); }
  }

  /* ================================================================ session + heartbeat */
  const W = { t0: pnow(), sec: 0, act: 0, play: 0, idle: 0, menu: 0, v2d: 0, v3d: 0, fpsSum: 0, fpsT: 0 };
  let lastInput = -1e9, lastTick = 0;
  function resetWindow() { W.t0 = pnow(); W.sec = W.act = W.play = W.idle = W.menu = W.v2d = W.v3d = W.fpsSum = W.fpsT = 0; }
  function endBeat() {
    if (live && W.act >= 1) {
      const fps = W.fpsT > 0 ? W.fpsSum / W.fpsT : 0;
      track('heartbeat', { sec: Math.round(W.sec), act: Math.round(W.act), play: Math.round(W.play), idle: Math.round(W.idle), menu: Math.round(W.menu),
        v2d: Math.round(W.v2d), v3d: Math.round(W.v3d), fps: fpsBucket(fps), room: roomSize(), mode: String((N.state && N.state.mode) || '') });
    }
    resetWindow();
  }
  function sessionStart() {
    if (!live || sessionStarted) return;
    sessionStarted = true;
    const now = Date.now();
    const ret = !REC.fresh || REC.n > 0;
    let scr = null;
    try { const a = screen.width || innerWidth, b = screen.height || innerHeight; scr = r50(Math.min(a, b)) + 'x' + r50(Math.max(a, b)); } catch (e) { scr = null; }
    let conn = null;
    try { const c = navigator.connection; conn = c && /^[a-z0-9-]{1,8}$/.test(c.effectiveType) ? c.effectiveType : null; } catch (e) { conn = null; }
    let pwa = false;
    try { pwa = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); } catch (e) { pwa = false; }
    track('session_start', {
      touch: (navigator.maxTouchPoints | 0) > 0 || 'ontouchstart' in window, scr, dpr: Math.min(4, Math.round((window.devicePixelRatio || 1) * 2) / 2),
      lang: langTag(), tz: -new Date().getTimezoneOffset() / 60, ref: refHost(), ret, days: Math.max(0, Math.floor((now - REC.first) / 86400000)),
      n: REC.n | 0, save: hasSave(), online: !!playerCode(), view: viewMode(), conn, pwa, resume: resumed,
    });
    REC.n = (REC.n | 0) + 1; REC.last = now; saveRec();
    settingsSnapshot();
  }
  function newSession() {
    session = uuid4(); sessionT0 = pnow(); sessionStarted = false; resumed = true;
    titleSeen = false; gameT0 = 0; firstCtl = false;
    sessionStart();
  }

  /* ================================================================ settings */
  const audioSig = (s) => (s.muted ? 'm' : 'u') + Math.round((+s.master || 0) * 10) + '/' + Math.round((+s.music || 0) * 10);
  function settingsSnapshot() {
    try {
      const S = N.settings, A = N.audio;
      if (A && A.settings && typeof A.settings === 'object') lastAudio = audioSig(A.settings);
      const g = (k) => { try { return S && S.get ? S.get(k) : null; } catch (e) { return null; } };
      const vol = (b) => { try { const v = A && A.getVolume ? A.getVolume(b) : null; return isFinite(v) ? Math.round(v * 10) : null; } catch (e) { return null; } };
      track('settings', { view: viewMode(), mute: !!(A && A.muted), vol: vol('master'), music: vol('music'), diff: g('difficulty'), text: g('textSpeed'),
        motion: g('reducedMotion'), captions: !!g('captions'), assist: !!g('assist'), hc: !!g('highContrast'), cb: g('colorBlind'), handed: g('handed'), btn: g('btnSize') });
    } catch (e) { /* ignore */ }
  }
  const pendingSet = new Map(); // key -> {value, at}
  function settingChanged(key, value) {
    if (!live || typeof key !== 'string' || !/^[A-Za-z0-9_.]{1,24}$/.test(key)) return;
    let v = value;
    if (typeof v === 'number') v = Math.round(v);
    else if (typeof v === 'boolean') v = v ? 'on' : 'off';
    else if (typeof v !== 'string' || !/^[A-Za-z0-9_ -]{1,24}$/.test(v)) return; // objects (map layers) and anything odd: skip
    pendingSet.set(key.replace(/\./g, '_').toLowerCase(), { value: String(v), at: pnow() });
  }
  function flushSettings(force) {
    if (!pendingSet.size) return;
    const t = pnow();
    for (const [k, o] of pendingSet) if (force || t - o.at > TUNE.settingDebounceMs) { track('setting', { key: k.slice(0, 24), value: o.value }); pendingSet.delete(k); }
  }
  let lastAudio = null;
  function audioChanged(s) {
    if (!s || typeof s !== 'object') return;
    const sig = audioSig(s);
    if (lastAudio === null) { lastAudio = sig; return; }
    if (sig === lastAudio) return;
    if (!!s.muted !== (lastAudio[0] === 'm')) settingChanged('mute', !!s.muted);
    else settingChanged('volume', Math.round((+s.master || 0) * 10));
    lastAudio = sig;
  }

  /* ================================================================ errors */
  const ERR = new Map(); // src -> {n, msg}
  function noteError(where, e) {
    try {
      if (!live) return;
      const src = cleanSrc(where);
      const x = ERR.get(src);
      if (x) { x.n++; return; }
      if (ERR.size >= 12) { const o = ERR.get('other') || { n: 0, msg: '' }; o.n++; ERR.set('other', o); return; }
      ERR.set(src, { n: 1, msg: cleanMsg((e && e.message) || e) });
    } catch (er) { /* never */ }
  }
  function flushErrors() {
    if (!ERR.size) return;
    let k = 0;
    for (const [src, x] of ERR) { if (k++ >= 8) break; track('error', { src, n: x.n, msg: x.msg }); }
    ERR.clear();
  }
  // wrap N.err (core.js): every module calls N.err(where, e) through the property, so this sees them all
  (function wrapErr() {
    const orig = N.err;
    if (typeof orig !== 'function' || orig.__tm) return;
    const w = function (where, e) { try { noteError(where, e); } catch (er) { /* ignore */ } return orig.apply(this, arguments); };
    w.__tm = true;
    N.err = w;
  })();
  window.addEventListener('error', (ev) => { try { noteError('window', (ev && (ev.error || ev.message)) || 'error'); } catch (e) { /* ignore */ } });
  window.addEventListener('unhandledrejection', (ev) => { try { const r = ev && ev.reason; if (r && r.name === 'MissionAbort') return; noteError('promise', r); } catch (e) { /* ignore */ } });

  /* ================================================================ game hooks (existing events only) */
  let titleSeen = false, gameT0 = 0, gameHow = null, firstCtl = false, t3d0 = 0;
  const MS = new Map();     // mission id -> {t, attempt, main, track, ch}
  const MG = new Map();     // minigame id -> {t, world, mission}
  const PT = new Map();     // party sid -> {id, t, mode, humans, ai, me, place}
  let ROOM = null;          // {t, peak}
  const on = (evt, fn) => N.on(evt, (d) => { if (!live) return; try { fn(d || {}); } catch (e) { /* never break the emitter */ } });

  on('boot', () => {
    sessionStart();
    track('perf_boot', { b: msBucket(pnow()), world_b: N.world && isFinite(N.world.buildMs) ? msBucket(N.world.buildMs) : null });
  });
  on('state', (d) => {
    if (d.mode === 'title' && !titleSeen) { titleSeen = true; track('title_shown', { save: hasSave() }); }
  });
  on('game:new', (o) => { gameT0 = pnow(); gameHow = 'new'; firstCtl = false; track('new_game', { skip_intro: !!o.skipIntro, online: !!o.online }); noticeSeen(); });
  on('game:continue', () => { gameT0 = pnow(); gameHow = 'continue'; firstCtl = false; track('continue', {}); noticeSeen(); });
  on('cutscene:skip', (d) => { if (d.id === 'prologue') track('intro_skipped', {}); });

  function storyEntry(id) { try { return N.calendar && N.calendar.storyEntry ? N.calendar.storyEntry(id) : null; } catch (e) { return null; } }
  function missionDef(id) { try { return (N.missions && N.missions.defs && N.missions.defs[id]) || null; } catch (e) { return null; } }
  on('mission:start', (d) => {
    const id = cleanId(d.id); if (!id) return;
    const def = missionDef(d.id), se = storyEntry(d.id);
    const main = (d.kind || (def && def.kind) || 'main') === 'main';
    const ch = def && typeof def.chapter === 'number' ? def.chapter : se && typeof se.chapter === 'number' ? se.chapter : null;
    const m = { t: pnow(), attempt: d.attempt | 0 || 1, main, track: se && se.track ? se.track | 0 : null, ch, kind: cleanId(String(d.kind || 'main')) || 'main' };
    MS.set(id, m);
    if (main) {
      track('track_start', { id, track: m.track, ch, attempt: m.attempt });
      if (ch != null && ch > (REC.ch | 0)) { REC.ch = ch; saveRec(); track('chapter', { n: ch }); }
    } else track('side_start', { id, kind: m.kind, attempt: m.attempt, room: roomSize() });
  });
  function missionEnd(d, result) {
    const id = cleanId(d.id); if (!id) return;
    const m = MS.get(id); MS.delete(id);
    const def = missionDef(d.id), se = storyEntry(d.id);
    const main = m ? m.main : ((def && def.kind) || 'main') === 'main';
    const dur = m ? Math.round((pnow() - m.t) / 1000) : null;
    if (main) track('track_' + result, { id, track: m ? m.track : se && se.track ? se.track | 0 : null, ch: m ? m.ch : null, attempt: m ? m.attempt : null, dur });
    else track('side_end', { id, kind: m ? m.kind : cleanId(String((def && def.kind) || 'side')), result, dur, room: roomSize() });
  }
  on('mission:complete', (d) => missionEnd(d, 'pass'));
  on('mission:fail', (d) => missionEnd(d, 'fail'));
  on('mission:abort', (d) => missionEnd(d, 'abort'));
  on('story2:ending', (d) => { if (d.phase === 'start' || d.phase === 'end') track('ending', { phase: d.phase }); });

  on('minigame:start', (d) => {
    const id = cleanId(d.id); if (!id) return;
    const inMission = !!(N.missions && N.missions.active);
    MG.set(id, { t: pnow(), world: !!d.inWorld, mission: inMission });
    track('mg_start', { id, world: !!d.inWorld, mission: inMission, room: roomSize() });
  });
  on('minigame:end', (d) => {
    const id = cleanId(d.id); if (!id) return;
    const m = MG.get(id); MG.delete(id);
    const r = d.result || {};
    track('mg_end', { id, win: !!r.win, score: isFinite(r.score) ? +r.score : null, stars: isFinite(r.stars) ? r.stars | 0 : null, quit: !!(r.quit || r.aborted),
      dur: m ? Math.round((pnow() - m.t) / 1000) : (isFinite(r.time) ? Math.round(r.time) : null), world: m ? m.world : !!d.inWorld, mission: m ? m.mission : false, room: roomSize() });
  });

  on('party:start', (d) => {
    const id = cleanId(d.id); if (!id || !d.sid) return;
    let humans = 0, ai = 0, me = null;
    try {
      const A = N.party && N.party.active;
      const pl = A && A.sid === d.sid && Array.isArray(A.players) ? A.players : null;
      if (pl) for (const p of pl) { if (p.isAI) ai++; else humans++; if (p.isMe) me = p.uid; }
      else for (const u of d.players || []) { if (/^ai:/.test(String(u))) ai++; else humans++; }
    } catch (e) { /* ignore */ }
    const mode = d.mode === 'party' ? 'party' : 'solo';
    PT.set(String(d.sid), { id, t: pnow(), mode, humans, ai, me: me || (mode === 'solo' ? 'me' : null), place: null });
    track('party_start', { id, mode, humans, ai });
  });
  on('party:results', (d) => {
    const s = PT.get(String(d.sid)); if (!s) return;
    const st = Array.isArray(d.standings) ? d.standings : [];
    const i = s.me ? st.indexOf(s.me) : -1;
    s.place = i >= 0 ? i + 1 : null;
  });
  on('party:end', (d) => {
    const s = PT.get(String(d.sid)); if (!s) return; // ended in the lobby: it never started
    PT.delete(String(d.sid));
    track('party_end', { id: s.id, mode: s.mode, humans: s.humans, ai: s.ai, place: s.place, reason: cleanId(String(d.reason || 'done')) || 'done', dur: Math.round((pnow() - s.t) / 1000) });
  });
  on('party:challenge', (d) => { const id = cleanId(d.id); if (id) track('party_challenge', { id, room: roomSize() }); });

  // rooms: online.js emits 'online:room' {code} from inside enter(); the caller's own bookkeeping (and the first
  // presence sync) lands right after, so look a tick later. A create always starts alone; a join finds friends
  // (or, rarely, an empty room a friend is still connecting to: counted as a join when the Join button was used).
  let joinIntent = 0;
  document.addEventListener('click', (ev) => {
    try { const b = ev.target && ev.target.closest && ev.target.closest('.mn-online [data-act]'); if (b && (b.dataset.act === 'join' || b.dataset.act === 'create')) joinIntent = b.dataset.act === 'join' ? pnow() : 0; } catch (e) { /* ignore */ }
  }, true);
  on('online:room', (d) => {
    if (d.code) {
      setTimeout(() => {
        try {
          if (!live) return;
          const n = roomSize() || 1;
          ROOM = { t: pnow(), peak: n };
          if (n > 1 || pnow() - joinIntent < 30000) track('room_join', { size: n }); else track('room_create', {});
          joinIntent = 0;
        } catch (e) { /* ignore */ }
      }, 0);
    } else if (ROOM) {
      track('room_leave', { dur: Math.round((pnow() - ROOM.t) / 1000), peak: ROOM.peak, why: cleanId(String(d.why || '')) });
      ROOM = null;
    }
  });
  on('online:players', (d) => { if (ROOM && (d.n | 0) > ROOM.peak) ROOM.peak = d.n | 0; });
  on('online:cloud', (d) => {
    if (d.what === 'push') track('cloud_save', { slot: cleanId(String(d.slot || '')), ok: true });
    else if (d.what === 'refused') track('cloud_save', { slot: cleanId(String(d.slot || '')), ok: false, why: cleanId(String(d.why || '')) });
  });
  on('online:start', (d) => track('online_start', { how: cleanId(String(d.how || '')) }));
  on('online:status', () => { refreshPlayerHash(); });

  on('settings:change', (d) => { if (d.key !== '*') settingChanged(d.key, d.value); });
  on('view:change', (d) => settingChanged('view', String(d.mode || '')));
  on('audio:settings', audioChanged);
  on('view:ready', () => { if (t3d0) { track('perf_3d', { b: msBucket(pnow() - t3d0), ok: true }); t3d0 = -1; } });
  on('view:error', () => { if (t3d0 >= 0) { track('perf_3d', { b: t3d0 > 0 ? msBucket(pnow() - t3d0) : null, ok: false }); t3d0 = -1; } });

  /* ================================================================ input activity (passive) */
  const mark = () => { lastInput = pnow(); };
  for (const t of ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel']) {
    try { window.addEventListener(t, mark, { passive: true, capture: true }); } catch (e) { /* ignore */ }
  }

  /* ================================================================ visibility */
  function onHide() {
    try {
      if (!live) return;
      flushSettings(true); flushErrors(); endBeat();
      if (!hiddenAt) hiddenAt = Date.now();
      flush({ keepalive: true });
    } catch (e) { /* ignore */ }
  }
  function onShow() {
    try {
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      lastTick = 0; resetWindow();
      if (live && away >= TUNE.newSessionAfterMs) newSession();
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) onHide(); else onShow(); });
  window.addEventListener('pagehide', onHide);

  /* ================================================================ title notice (one time) */
  const NT = { el: null, shownAt: 0, done: false };
  function injectStyle() {
    if (document.getElementById('tm-style')) return;
    const s = document.createElement('style');
    s.id = 'tm-style';
    s.textContent = '.tm-note{position:fixed;right:calc(14px + var(--safe-r,0px));bottom:calc(12px + var(--safe-b,0px));z-index:35;max-width:min(380px,calc(100vw - 32px));' +
      'box-sizing:border-box;margin:0;padding:8px 10px 8px 12px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-family:var(--font-body,system-ui,sans-serif);' +
      'font-size:13px;line-height:1.3;color:var(--ink,#f4ead8);background:var(--panel,rgba(18,13,22,.9));border:1px solid var(--panel-edge,rgba(242,194,48,.55));' +
      'border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.45);pointer-events:auto}' +
      '.tm-note[hidden]{display:none}.tm-note p{margin:0;flex:1 1 220px}.tm-note .tm-b{display:flex;gap:6px;margin-left:auto}' +
      '.tm-note button{font:inherit;font-weight:600;font-size:13px;padding:3px 10px;border-radius:4px;cursor:pointer;border:1px solid var(--panel-edge,rgba(242,194,48,.55));' +
      'background:transparent;color:var(--ink,#f4ead8)}.tm-note button.ok{background:var(--auto-yellow,#f2c230);color:var(--auto-black,#1a1214);border-color:var(--auto-yellow,#f2c230)}' +
      '.tm-note button:focus-visible{outline:2px solid var(--auto-yellow,#f2c230);outline-offset:2px}' +
      '@media (max-width:560px){.tm-note{left:16px;right:16px;max-width:none;bottom:calc(10px + var(--safe-b,0px))}}' +
      'body.high-contrast .tm-note{background:#000;border-color:#fff}';
    document.head.appendChild(s);
  }
  function noticeEl() {
    if (NT.el) return NT.el;
    injectStyle();
    const root = (N.menus && N.menus.overlayRoot && N.menus.overlayRoot()) || document.getElementById('overlay') || document.body;
    const e = document.createElement('div');
    e.className = 'tm-note';
    e.setAttribute('role', 'note');
    e.hidden = true;
    e.innerHTML = '<p>📊 Anonymous play stats help us make Nostalgia better. No names, nothing you type.</p>' +
      '<span class="tm-b"><button type="button" data-tm="off">Turn off</button><button type="button" class="ok" data-tm="ok">OK</button></span>';
    e.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-tm]');
      if (!b) return;
      ev.stopPropagation();
      if (b.dataset.tm === 'off') {
        setOn(false);
        e.querySelector('p').textContent = 'Play stats are off. You can switch them on again in Settings → Privacy.';
        e.querySelector('.tm-b').innerHTML = '';
        NT.done = true; REC.noticed = true; saveRec();
        setTimeout(() => { e.hidden = true; }, 3500);
      } else { NT.done = true; REC.noticed = true; saveRec(); e.hidden = true; }
    });
    root.appendChild(e);
    NT.el = e;
    return e;
  }
  function noticeTick() {
    if (NT.done) return;
    if (REC.noticed || !TUNE.notice || !live) { NT.done = !!REC.noticed; if (NT.el) NT.el.hidden = true; return; }
    let showNow = false;
    try { showNow = N.state && N.state.mode === 'title' && N.menus && N.menus.topPanelId && N.menus.topPanelId() === 'title'; } catch (e) { showNow = false; }
    if (showNow) { const e = noticeEl(); if (e.hidden) { e.hidden = false; if (!NT.shownAt) NT.shownAt = pnow(); } }
    else if (NT.el && !NT.el.hidden) NT.el.hidden = true;
  }
  // leaving the title into a game after the notice was on screen counts as seen
  function noticeSeen() { if (!REC.noticed && NT.shownAt && pnow() - NT.shownAt > 1500) { REC.noticed = true; saveRec(); NT.done = true; if (NT.el) NT.el.hidden = true; } }

  /* ================================================================ the setting */
  function setOn(v) {
    REC.on = !!v; saveRec();
    const was = live;
    refreshLive();
    if (live && !was) { resetWindow(); sessionStart(); }
    if (!live) { Q.length = 0; pendingSet.clear(); ERR.clear(); }
    return live;
  }

  /* ================================================================ system: the per-frame tick (cheap) */
  const PLAYISH = { play: 1, dialogue: 1, cutscene: 1, minigame: 1, gameover: 1 };
  function tick() {
    if (!live) return;
    const t = pnow();
    let dt = lastTick ? (t - lastTick) / 1000 : 0;
    lastTick = t;
    if (!(dt > 0) || dt > 1) dt = 0; // a hitch or a background gap is not play time
    if (typeof document !== 'undefined' && document.hidden) return;
    const I = N.input;
    if (I && I.move && Math.abs(I.move.x) + Math.abs(I.move.y) > 0.2) lastInput = t;
    const mode = N.state ? N.state.mode : 'boot';
    const active = t - lastInput < TUNE.activeMs;
    W.sec += dt;
    if (active) W.act += dt;
    if (PLAYISH[mode]) {
      if (active) W.play += dt; else W.idle += dt;
      if (N.view3d && N.view3d.active) W.v3d += dt; else W.v2d += dt;
      const f = N.perf && N.perf.fps;
      if (f > 0) { W.fpsSum += f * dt; W.fpsT += dt; }
    } else W.menu += dt;
    // first real control after a new game / continue
    if (gameT0 && !firstCtl && mode === 'play') {
      let moved = false;
      try { moved = (I && I.move && Math.abs(I.move.x) + Math.abs(I.move.y) > 0.3) || !!(I && I.anyPressed && I.anyPressed()); } catch (e) { moved = false; }
      if (moved) { firstCtl = true; track('first_control', { after: Math.round((t - gameT0) / 1000), how: gameHow }); }
    }
    // 3D load timing (view3d.js sets N.view.loading while it fetches and warms the 3D city)
    if (!t3d0 && N.view && N.view.loading) t3d0 = t;
    if (t - W.t0 >= TUNE.beatS * 1000) { flushSettings(false); flushErrors(); endBeat(); }
    if (Q.length && !ST.inflight && t >= ST.nextTry && t - ST.lastFlush >= TUNE.flushMs) { refreshPlayerHash().then(() => flush()).catch(() => {}); }
  }
  // nothing per frame (and no Settings row) where telemetry can never run: file://, no config, a frame, automation
  if (!blocker()) N.addSystem({
    id: 'telemetry', order: 99, runIn: ['*'],
    init() {
      try {
        if (N.menus && typeof N.menus.addSettingsRow === 'function') {
          N.menus.addSettingsRow({ id: 'telemetry', label: 'Share anonymous play stats', type: 'toggle', section: 'Privacy',
            help: 'Anonymous numbers (how far players get, what they play, crashes) help us make the game better. No names, no player codes, nothing you type.',
            get: () => settingOn(), set: (v) => setOn(v) });
        }
      } catch (e) { /* the row is optional */ }
    },
    update() { try { tick(); noticeTick(); } catch (e) { /* never break the loop */ } },
  });

  /* ================================================================ start */
  refreshLive();
  if (N.systems && N.systems.started) sessionStart(); // loaded after boot (hot reload): start now; else on 'boot'

  N.telemetry = {
    get state() { const b = blocker(); return b || (ST.broken ? 'disabled' : settingOn() ? 'on' : 'off'); },
    get active() { return live; },
    get on() { return settingOn(); },
    setOn, track,
    flush: (o) => refreshPlayerHash().then(() => flush(o)).catch(() => ({ ok: false, why: 'error' })),
    get install() { return REC.id; },
    get session() { return session; },
    EVENTS, TUNE, BUILD, DEVICE,
    _debug: {
      queue: () => Q.map((e) => ({ name: e.name, props: Object.assign({}, e.props), t: e.t, s: e.s })),
      get stats() { return Object.assign({}, ST.stats, { inflight: !!ST.inflight, broken: ST.broken, lastFlushAgo: ST.lastFlush ? Math.round(pnow() - ST.lastFlush) : null }); },
      sent: () => ST.sent.slice(),
      window: () => Object.assign({}, W),
      endBeat, flushErrors, flushSettings, cleanProps, cleanMsg, cleanSrc, msBucket, fpsBucket, deviceClass,
      rec: () => { const o = Object.assign({}, REC); delete o.fresh; return o; },
      notice: () => ({ shown: !!(NT.el && !NT.el.hidden), done: NT.done, noticed: !!REC.noticed }),
      playerHash: () => refreshPlayerHash(),
      /** tests: pretend the last flush was long ago (so the next tick may send) */
      nudge() { ST.lastFlush = 0; ST.nextTry = 0; W.t0 = -1e9; },
    },
  };
})();
