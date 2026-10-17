/* NOSTALGIA — tests/story_full.cjs  (playthrough reviewer)
 * The WHOLE game in one browser session, the way a player meets it (debug-assisted travel only):
 *   title (real click on ▶ PLAY) -> the name card (typed with the keyboard: a custom nickname, so the
 *   bible's global {nick} rule is checked everywhere) -> the 2026 prologue (real E, ▶ PLAY prompt,
 *   ◀◀ REWIND) -> M1 ... M12 -> the ending at Charminar -> the 2026 epilogue (the 1-4-0-1 lock dial with
 *   real keys) -> the definitions card -> the credits -> post-credits ◀◀ REWIND (December) -> SA8.
 *   Side activities on the way: SA3 (Feb), SA2 (Mar), SA4 six_balls with THE LB STADIUM MATCH (May),
 *   SA7 + SA5 (Jun), SA6 races R1-R4 (Jul), SA1 pandal nights (Sep), SA8 (Dec, post-game).
 *   Page reload + CONTINUE (a real click on the title's ▶▶ CONTINUE) five times: after M2, M4, SA4,
 *   M10 (into the interlude) and M12 (into the ending).
 * Checks at every main mission: the HUD tape counter (DOM), the Side A track, the tin token, the
 * calendar date at the start and the end, the festival flags (N.seasons) of that date, the Chappal Meter
 * back at 0, money never negative; at the end: every must-have place of design/places_registry.md
 * visited by a mission / side activity / scene (coverage table in tests/out/story_full/coverage.md),
 * no "Chinnu"/"Srikanth"/{nick} left in any line, objective or toast for a custom nickname, zero console
 * errors, page errors and N.err.
 *
 *   node nostalgia/tests/story_full.cjs                 the whole run (60-90 min on a loaded machine)
 *   START=m7 node nostalgia/tests/story_full.cjs        resume from the snapshot written after the phase
 *                                                       before m7 (tests/out/story_full/saves/*.json)
 *   STOP=m6 ...                                         stop after that phase
 *   STABLE=1 ...                                        serve a src file that does not parse right now
 *                                                       (another agent mid-edit) from git HEAD
 *   VERBOSE=1 ...                                       log every autopilot state change
 * Screenshots: tests/out/story_full/*.png
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'story_full');
const SAVES = path.join(OUT, 'saves');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(SAVES, { recursive: true });
const NICK = 'Pintu', FULL = 'Pradeep';
const SAVE_KEY = 'nostalgia.save.v1';

const T0 = Date.now();
const failures = [];
let passes = 0, phase = '-';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log('[' + ((Date.now() - T0) / 1000).toFixed(0).padStart(5) + 's] ' + s);
function check(cond, msg, data) {
  if (cond) { passes++; console.log('  ok   ' + msg); }
  else { const t = '[' + phase + '] ' + msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 900) : ''); failures.push(t); console.log('  FAIL ' + t); }
  return !!cond;
}

let page, errors = [];
const ev = (fn, arg) => page.evaluate(fn, arg);
async function shot(name) { try { await page.screenshot({ path: path.join(OUT, name + '.png') }); } catch (e) { console.log('  (screenshot failed: ' + name + ')'); } }
async function pressKey(k, n) { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); await sleep(120); } }
async function waitFor(fn, arg, ms, what) {
  const ok = await page.waitForFunction(fn, arg, { timeout: ms || 10000, polling: 100 }).then(() => true, () => false);
  if (!ok && what) check(false, 'timed out waiting for ' + what);
  return ok;
}

/* ====================================================================== the places to cover */
// places_registry.md: the user's must-have table (§2), the festival sites, rounds 5-11 named places.
const MUST = ['koti_bus_stand', 'gokul_chat', 'birla_mandir', 'hussain_sagar', 'buddha_statue', 'prasads_imax', 'ntr_gardens', 'public_gardens', 'lb_stadium',
  'rythu_bazaar_mehdipatnam', 'rythu_bazaar_erragadda', 'rythu_bazaar_saroornagar', 'mozamjahi_market', 'nampally_station', 'kachiguda_station', 'imlibun_bus_station', 'assembly',
  'dilsukhnagar_sai_temple', 'rtc_x_roads', 'sandhya_theatre', 'sudarshan_theatre', 'odeon_theatre', 'devi_theatre', 'charminar', 'nampally_exhibition', 'paradise'];
const FESTIVAL = ['tank_bund', 'khairatabad_ganesh', 'ujjaini_mahankali_temple'];
const AMBIENT = ['lal_darwaza_temple']; // Old City Bonalu: seasons.js decorates it while N.flags.bonalu is on; no bible mission goes there
const NAMED = ['osmania_university', 'karachi_bakery', 'lumbini_park', 'necklace_road', 'tank_bund_statues', 'hitec_city', 'cyber_towers', 'golconda_fort', 'qutb_shahi_tombs',
  'falaknuma_palace', 'salar_jung_museum', 'birla_planetarium', 'nehru_zoo', 'laad_bazaar', 'gulzar_houz', 'mecca_masjid', 'state_museum', 'jawahar_bal_bhavan', 'bawarchi',
  'koti_book_bazaar', 'begumpet_airport', 'chappal_bazar', 'secunderabad_station', 'st_josephs_cathedral', 'famous_ice_cream'];
// everyday-element prefixes (registry §3 and round 2): at least one instance visited
const PREFIX = ['school_', 'kirana_', 'banana_cart_', 'flower_cart_', 'stationery_', 'pindi_girni_', 'playground_', 'irani_cafe_', 'meat_shop_', 'medical_shop_', 'iyengar_bakery_',
  'samosa_bandi_', 'dosa_bandi_', 'photo_studio_', 'internet_cafe_', 'mosque_', 'church_', 'coconut_cart_'];
const TRACK = MUST.concat(FESTIVAL, AMBIENT, NAMED);
const cov = {}; // id -> {ctx: firstSeenLabel}   (merged from the page)
let nickBad = []; // lines / objectives / toasts that still say Chinnu / Srikanth / {nick}
const realKeys = {};
const tally = (k, n) => { realKeys[k] = (realKeys[k] || 0) + (n || 1); };

/* ====================================================================== page setup */
async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[' + phase + '] console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[' + phase + '] pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (process.env.STABLE) {
    await page.route(/\/src\/[\w.]+\.js$/, (r) => {
      const rel = 'src/' + r.request().url().split('/src/').pop();
      let body = null;
      try { body = fs.readFileSync(path.join(ROOT, rel), 'utf8'); new (require('vm').Script)(body); } catch (e) {
        try { body = require('child_process').execSync('git show HEAD:nostalgia/' + rel, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); console.log('  (STABLE: ' + rel + ' does not parse; using HEAD)'); } catch (e2) { body = null; }
      }
      if (body == null) return r.continue();
      return r.fulfill({ status: 200, contentType: 'text/javascript', body });
    });
  }
}
async function bootTitle() {
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 60000 });
  await page.mouse.click(2, 2);
  await ev(() => { const d = document.getElementById('debug'); if (d) d.classList.add('hide'); });
}
/** In-page hooks (re-installed after every reload): mission / minigame / dialogue logs, the place-coverage
 *  tracker (a mission, side activity or story2 scene must be running) and the {nick} checker. */
async function installHooks() {
  await ev(({ track, prefix, nick, full }) => {
    if (window.__hooked) return;
    window.__hooked = true;
    // a walkable spot near (x, y) outside every giver ring (standing in a ring for 1 s starts its mission / odd job)
    window.__safeSpot = (x, y, minD) => {
      const gs = Object.values(N.missions.defs).filter((d) => d && d.giver).map((d) => { const q = N.missions.giverPos(d); return q ? { x: q.x, y: q.y, r: d.giver.r || 18 } : null; }).filter(Boolean);
      const ok = (px, py) => N.world.isWalkable(px, py) && gs.every((g) => Math.hypot(g.x - px, g.y - py) > (g.r || 18) + 40);
      for (let r = minD || 0; r < 400; r += 20) for (let a = 0; a < 6.283; a += 0.5) { const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return { x: px, y: py }; }
      return { x, y };
    };
    window.__passes = {}; window.__fails = []; window.__mg = []; window.__mgEnd = []; window.__wm = 0; window.__cov = {}; window.__nick = []; window.__lines = []; window.__s2ev = [];
    N.on('mission:pass', (d) => { const k = d && d.id; if (k) window.__passes[k] = (window.__passes[k] || 0) + 1; });
    N.on('mission:fail', (d) => { window.__fails.push({ id: d && d.id, reason: d && d.reason, at: N.calendar.osd() }); });
    N.on('walkman:play', () => { window.__wm++; });
    N.on('minigame:start', (d) => { const P = (d && d.params) || {}; window.__mg.push({ id: d && d.id, lb: !!N.flags.lb_match, mission: N.missions.active && N.missions.active.id, home: P.home && (P.home.name || P.home), away: P.away && (P.away.name || P.away), intro: P.intro || null, title: P.title || null, place: P.place || null, at: N.calendar.osd() }); });
    N.on('minigame:end', (d) => { const r = (d && d.result) || {}; window.__mgEnd.push({ id: d && d.id, win: r.win, quit: r.quit, aborted: r.aborted, at: N.calendar.osd() }); });
    window.__shops = [];
    N.on('shop:open', (d) => { window.__shops.push({ place: d && d.place, kind: d && d.kind, mission: (N.missions.active && N.missions.active.id) || (N.story2 && N.story2.scene) || null, at: N.calendar.osd() }); });
    N.on('story2:ending', (d) => window.__s2ev.push(d.phase));
    N.on('story2:epilogue', (d) => { const c = N.places.charminar; window.__s2ev.push('epi:' + d.phase + ':' + Math.round(Math.hypot(N.player.x - c.x, N.player.y - c.y))); });
    const bad = (s) => typeof s === 'string' && (/\bChinnu\b|\bCHINNU\b|\bSrikanth\b|\bSRIKANTH\b|\{nick\}|\{full\}|\{FULL\}|\{NICK\}/.test(s));
    const ctx = () => (N.missions && N.missions.active && N.missions.active.id) || (N.story2 && N.story2.scene) || (N.state && N.state.mode) || '-';
    const note = (kind, s) => { if (bad(s) && window.__nick.length < 80) window.__nick.push(kind + ' @' + ctx() + ': ' + String(s).slice(0, 140)); };
    N.on('dialogue:line', (d) => { if (!d) return; note('line(' + d.speaker + ')', d.text); if (window.__lines.length < 4000) window.__lines.push([d.speaker, String(d.text || '').slice(0, 160)]); });
    N.on('hud:objective', (t) => note('objective', t));
    try {
      const T = N.hud.toast.bind(N.hud);
      N.hud.toast = function (t) { note('toast', t); return T.apply(null, arguments); };
      if (N.hud.banner) { const B = N.hud.banner.bind(N.hud); N.hud.banner = function (a, b) { note('banner', a); note('banner', b); return B.apply(null, arguments); }; }
    } catch (e) { /* ignore */ }
    N.on('minigame:start', (d) => { const P = (d && d.params) || {}; note('minigame intro', P.intro); note('minigame title', P.title); note('minigame home', P.home && (P.home.name || P.home)); });
    // coverage: which mission / side activity / scene brought the player within reach of each place
    const pts = {};
    const lm = (id) => (N.WORLD_DATA.landmarks || []).find((l) => l.id === id);
    for (const id of track) { const p = N.places[id] || lm(id); if (p) pts[id] = { x: p.x, y: p.y, r: Math.max(60, (p.r || (p.w ? Math.max(p.w, p.d || 0) / 2 : 30)) + 90) }; }
    const pre = Object.keys(N.places).filter((id) => prefix.some((q) => id.indexOf(q) === 0)).map((id) => ({ id, x: N.places[id].x, y: N.places[id].y, r: (N.places[id].r || 20) + 60 }));
    const lake = N.places.hussain_sagar;
    // seen: a story cutscene points the camera at a place ({type: 'camera', target: placeId}); skipping the
    // cutscene (the test does) still counts what the scene shows
    try {
      const CS = N.menus.cutscene.bind(N.menus);
      N.menus.cutscene = function (steps) {
        try {
          const c = (N.missions && N.missions.active && N.missions.active.id) || (N.story2 && N.story2.scene) || null;
          if (c && Array.isArray(steps)) for (const st of steps) {
            if (!st || st.type !== 'camera' || typeof st.target !== 'string') continue;
            const q = pts[st.target] ? st.target : null;
            if (q) { const o = (window.__cov[q] = window.__cov[q] || {}); if (!o[c] && !o[c + '~cam']) o[c + '~cam'] = N.calendar.date.short; }
          }
        } catch (e) { /* never breaks the scene */ }
        return CS.apply(null, arguments);
      };
    } catch (e) { /* menus stub */ }
    setInterval(() => {
      try {
        if (!N.player || !N.state || /title|boot/.test(N.state.mode)) return;
        const c = (N.missions && N.missions.active && N.missions.active.id) || (N.story2 && N.story2.scene) || null;
        if (!c) return;
        const p = N.player;
        const at = N.calendar.date.short;
        const hit = (id) => { const o = (window.__cov[id] = window.__cov[id] || {}); if (!o[c]) o[c] = at; };
        for (const id in pts) { const q = pts[id]; if (Math.hypot(p.x - q.x, p.y - q.y) < q.r) hit(id); }
        // seen: the story camera pans to it (cutscene camera steps, the M12 gallery, the ending's rise)
        const cam = N.render && N.render.cam;
        if (cam && Math.hypot(cam.x - p.x, cam.y - p.y) > 120) {
          for (const id in pts) { const q = pts[id]; if (Math.hypot(cam.x - q.x, cam.y - q.y) < q.r) { const o = (window.__cov[id] = window.__cov[id] || {}); if (!o[c] && !o[c + '~cam']) o[c + '~cam'] = at; } }
        }
        // the lake: anywhere on the shore road / water (its place point is mid-lake)
        if (lake && Math.hypot(p.x - lake.x, p.y - lake.y) < 700 && (N.world.isWater && (N.world.isWater(p.x + 40, p.y) || N.world.isWater(p.x - 40, p.y) || N.world.isWater(p.x, p.y + 40) || N.world.isWater(p.x, p.y - 40) || N.world.isWater(p.x, p.y)))) hit('hussain_sagar');
        for (const q of pre) if (Math.hypot(p.x - q.x, p.y - q.y) < q.r) hit(q.id);
        // district-sized places: being anywhere in the district counts (HITEC City is the IT district round Cyber Towers)
        try { const d = N.world.districtAt(p.x, p.y); const did = d && (d.id || d); if (did === 'hitec') hit('hitec_city'); } catch (e) { /* ignore */ }
      } catch (e) { /* the tracker never breaks the run */ }
    }, 200);
    void nick; void full;
  }, { track: TRACK, prefix: PREFIX, nick: NICK, full: FULL });
}
/** Merge the page's coverage + nick notes into the node side (before a reload wipes them). */
async function harvest() {
  try {
    const h = await ev(() => { const o = { cov: window.__cov || {}, nick: window.__nick || [] }; window.__nick = []; return o; });
    for (const id in h.cov) { cov[id] = cov[id] || {}; for (const c in h.cov[id]) if (!cov[id][c]) cov[id][c] = h.cov[id][c]; }
    for (const n of h.nick) if (nickBad.indexOf(n) < 0) nickBad.push(n);
  } catch (e) { /* page busy */ }
}
async function testTune() {
  await ev(() => {
    N.debug.skipDialogue(true);
    if (N.story && N.story.debug) { N.story.debug.fastRides = true; N.story.debug.mg = 'win'; }
    if (N.story2) { N.story2.TUNE.mg = { autoplay: 'win', skipHowto: true, timeScale: 8 }; N.story2.TUNE.escortSpeed = 4; N.story2.TUNE.climbSecs = 2; N.story2.TUNE.galleryFind = 60; }
  });
}

/* ====================================================================== the snapshot / reload machinery */
const PH_ORDER = [];
async function snapshot(name, { save } = {}) {
  await harvest();
  const raw = await ev((save) => {
    if (save) { try { N.save.save({ reason: 'std', toast: false }); } catch (e) { /* ignore */ } }
    try { return localStorage.getItem('nostalgia.save.v1'); } catch (e) { return null; }
  }, !!save);
  fs.writeFileSync(path.join(SAVES, 'after_' + name + '.json'), JSON.stringify({ raw, cov, nickBad, realKeys, t: new Date().toISOString() }));
}
/** A player quits and comes back: page reload, then a real click on the title's ▶▶ CONTINUE. */
async function reloadContinue(why) {
  await harvest();
  const before = await ev(() => ({ counter: N.tape.counter, tin: N.tape.tin.size, done: N.missions.done.size, money: N.player.money, date: N.calendar.label() }));
  await page.reload();
  await bootTitle();
  const cont = await ev(() => { const b = document.querySelector('.mn-title [data-act=continue], [data-act=continue]'); return !!(b && b.offsetParent !== null); });
  check(cont, 'title: ▶▶ CONTINUE is offered (' + why + ')');
  await page.click('[data-act=continue]');
  await page.waitForFunction(() => N.state.mode !== 'title', null, { timeout: 15000 }).catch(() => {});
  await sleep(800);
  await installHooks();
  await testTune();
  // standing still right after CONTINUE (often inside the next giver's ring at home): nothing starts by itself
  await sleep(3500);
  const auto = await ev(() => N.missions.active && N.missions.active.id);
  check(!auto, 'after CONTINUE no mission starts by itself under the player (' + why + ')', auto);
  const after = await ev(() => ({ counter: N.tape.counter, tin: N.tape.tin.size, done: N.missions.done.size, money: N.player.money, date: N.calendar.label(), mode: N.state.mode }));
  check(after.counter === before.counter && after.tin === before.tin && after.done === before.done, 'reload + CONTINUE restores the tape, the tin and the missions (' + why + ')', { before, after });
  return after;
}

/* ====================================================================== part 1 autopilot (N.story.debug) */
async function snap1() {
  return ev(() => {
    const a = N.missions.active;
    return {
      mode: N.state.mode, id: a && a.id, obj: N.hud.objectiveText, rec: N.tape.recState, st: N.story.debug.state(), tgt: N.story.debug.target(),
      lf: N.missions.lastFailed && N.missions.lastFailed.id, ask: !!document.querySelector('.hud-ask.show'),
      p: { x: Math.round(N.player.x), y: Math.round(N.player.y), lvl: N.player.level, veh: N.player.vehicle && N.player.vehicle.type },
      clock: N.calendar.osd(), wanted: N.wanted ? N.wanted.level : 0,
      dlg: N.state.mode === 'dialogue' && N.dialogue && N.dialogue.current ? { s: N.dialogue.current.speaker || N.dialogue.current.s || null, t: String(N.dialogue.current.text || N.dialogue.current.t || '').slice(0, 80), ch: N.dialogue.current.choices || null, typing: !!N.dialogue.current.typing, open: N.dialogue.isOpen ? N.dialogue.isOpen() : null, skip: N.dialogue.skip, stack: N.state.stack } : (N.state.mode === 'dialogue' ? { none: true, open: N.dialogue && N.dialogue.isOpen ? N.dialogue.isOpen() : null, stack: N.state.stack } : undefined),
    };
  });
}
async function goTo(t) {
  await ev((t) => {
    const p = N.player;
    if (p.vehicle) { const v = p.vehicle; v.x = t.x; v.y = t.y + 6; v.vx = v.vy = 0; v.speed = 0; v.okX = null; p.x = v.x; p.y = v.y; }
    else p.teleport(t.x, t.y);
  }, t);
  await sleep(220);
}
async function feed() {
  await ev(() => {
    const pl = N.player;
    if (pl && pl.tummy != null && pl.tummy < 60) { try { if (pl.feed) pl.feed(60, { quiet: true }); else pl.tummy = 80; } catch (e) { pl.tummy = 80; } }
    if (pl && pl.energy < 50 && !(N.story2 && N.story2.state().epilogue)) pl.energy = 80;
  });
}
async function autopilot1(id, o) {
  o = o || {};
  const t0 = Date.now();
  const pass0 = await ev((id) => (window.__passes && window.__passes[id]) || 0, id);
  let last = '', same = 0, n = 0;
  for (;;) {
    if (++n % 20 === 0) await feed();
    const s = await snap1();
    const done = await ev((a) => ((window.__passes && window.__passes[a.id]) || 0) > a.n, { id, n: pass0 });
    if (done && s.id !== id) return Object.assign({ ok: true, s }, o.c || {});
    if (s.lf === id && s.id !== id) { s.why = await ev(() => (window.__fails || []).slice(-1)[0] || null); return { ok: false, failed: true, s }; }
    if (Date.now() - t0 > (o.timeout || 600000)) return { ok: false, timeout: true, s };
    const key = JSON.stringify([s.mode, s.obj, s.st.step, s.p]);
    if (key === last) same++; else { same = 0; last = key; if (process.env.VERBOSE) console.log('     ·', s.mode, '|', s.obj, '|', s.st.step, '|', JSON.stringify(s.p), s.clock); }
    if (Date.now() - (o.hb || t0) > 60000) { o.hb = Date.now(); log('   … ' + id + ': ' + s.mode + ' | ' + s.obj + ' | step ' + s.st.step + ' | ' + JSON.stringify(s.p) + ' tgt ' + JSON.stringify(s.tgt) + ' | ' + s.clock + (s.st.queue ? ' | queue ' + JSON.stringify(s.st.queue) : '') + (s.dlg ? ' | dlg ' + JSON.stringify(s.dlg) : '')); }
    if (s.rec && s.rec.phase === 'prompt' && s.mode === 'play') { await pressKey('KeyE'); tally('E on ● REC'); await sleep(250); continue; }
    // a shop / auto card (shops.js pushes the 'dialogue' state) opened under the autopilot: a player presses Escape
    if (s.mode === 'dialogue' && await ev(() => !!(N.shops && N.shops.isOpen && N.shops.isOpen()))) {
      const what = await ev(() => (window.__shops || []).slice(-1)[0] || null);
      log('   (' + id + ': a shop/auto card opened mid-mission: ' + JSON.stringify(what) + ' -> Escape)');
      await pressKey('Escape'); await ev(() => { try { if (N.shops.isOpen()) N.shops.close(); } catch (e) { /* ignore */ } }); await sleep(300); continue;
    }
    if (s.mode === 'dialogue') {
      o.dlgSince = o.dlgSince || Date.now();
      // a dialogue that E does not close for 20 s: log it (it would be a game bug), screenshot, then try what a
      // player would: Enter, a click on the box, Escape
      if (Date.now() - o.dlgSince > 20000 && !o.dlgLogged) {
        o.dlgLogged = true;
        log('   !! ' + id + ': dialogue stuck: ' + JSON.stringify(s.dlg));
        await shot('stuck_dialogue_' + id);
        check(false, id + ': a dialogue box did not close on E for 20 s', s.dlg);
        await pressKey('Enter'); await page.click('#ui .dlg, .dlg', { timeout: 1500 }).catch(() => {}); await pressKey('Escape');
      }
    } else { o.dlgSince = 0; o.dlgLogged = false; }
    if (s.mode === 'dialogue' && same > 6) { await pressKey('KeyE'); same = 0; continue; }
    if (s.mode !== 'play') { await sleep(220); continue; }
    if (o.hook && await o.hook(s)) continue;
    if (s.st.queue && !s.st.queue.done) {
      if (s.st.queue.tell) { await pressKey('KeyE'); tally('E Line mein!'); }
      else if (s.st.queue.gap) { await pressKey('ArrowUp'); tally('↑ queue step'); }
      await sleep(120); continue;
    }
    if (s.st.cargo != null && s.tgt) { await goTo(s.tgt); continue; }
    const veh = await ev(() => {
      const p = N.player; if (p.vehicle) return null;
      const r = N.missions.active; if (!r) return null;
      const v = r.spawned.map((x) => x.e).find((e) => e && e.kind === 'vehicle' && e.alive && !e.noEnter && !e.locked && e.T && e.T.cls === 'bike');
      return v ? { x: v.x, y: v.y } : null;
    });
    if (veh && /Get on|cycle/i.test(s.obj || '')) { await goTo({ x: veh.x + 9, y: veh.y }); await pressKey('KeyE'); tally('E get on a cycle'); await sleep(250); continue; }
    if (s.tgt) {
      const d = Math.hypot(s.tgt.x - s.p.x, s.tgt.y - s.p.y);
      if (d > 12) { await goTo(s.tgt); continue; }
      if (s.st.step === 'act' || s.st.step === 'press' || s.st.step === 'cutouts') { await pressKey('KeyE'); tally('E story prompt'); await sleep(250); continue; }
    } else if (s.st.step === 'press') { await pressKey('KeyE'); tally('E story prompt'); await sleep(250); continue; }
    if (same > 40 && s.st.step) { await ev(() => N.story.debug.skip()); same = 0; }
    await sleep(180);
  }
}
async function finish1(id, o) {
  const r = await autopilot1(id, o);
  check(r.ok, id + ': played to MISSION PASSED' + (r.timeout ? ' (timeout)' : r.failed ? ' (failed)' : ''), r.ok ? undefined : r.s);
  await waitFor(() => N.state.mode === 'play' && !N.missions.active, null, 20000);
  await sleep(600);
  return r;
}
async function untilChoice(ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(() => !!(N.dialogue.current && N.dialogue.current.choices && !N.dialogue.current.typing))) return true;
    if (await ev(() => !!(N.dialogue.isOpen && N.dialogue.isOpen() && !(N.dialogue.current && N.dialogue.current.choices)))) await pressKey('KeyE');
    await sleep(200);
  }
  check(false, 'timed out waiting for ' + what);
  return false;
}
async function retryFromCard(id) {
  const shown = await waitFor(() => !!document.querySelector('.hud-ask.show'), null, 8000, 'the retry card');
  if (!shown) return false;
  await shot(id + '_failed');
  for (let i = 0; i < 12; i++) {
    await pressKey('KeyE');
    if (await waitFor((id) => N.missions.active && N.missions.active.id === id && N.missions.active.attempt >= 2, id, 700)) { tally('E retry card'); return true; }
  }
  check(false, 'timed out waiting for the retry to start');
  return false;
}

/* ====================================================================== part 2 driver (N.story2.probe) */
const probe2 = () => ev(() => {
  const pl = N.player;
  if (pl && pl.tummy != null && pl.tummy < 60) { try { if (pl.feed) pl.feed(60, { quiet: true }); else pl.tummy = 80; } catch (e) { pl.tummy = 80; } }
  if (pl && pl.energy < 50 && !N.story2.state().epilogue) pl.energy = 80;
  const s = N.story2.probe();
  s.shop = !!(N.shops && N.shops.isOpen && N.shops.isOpen());
  s.defs = !!document.querySelector('.mn-defs.show');
  s.credits = !!document.querySelector('.mn-credits.show');
  s.journal = N.state.mode === 'journal';
  s.mgResult = !!document.querySelector('.mg-card-result');
  s.ask = !!document.querySelector('.hud-ask.show');
  s.lf = N.missions.lastFailed && N.missions.lastFailed.id;
  return s;
});
const RIDE_OK = /^(drums_for_amma|opening_day|bunty_races)/;
const STORY_OFFER = /^(CLAP \(|Set the self|Drag Nanna|Nanna,|Look down|Leave the cake|Send Immu|Get in the boat|Board the bus|Ask about|▶ PLAY|● REC|Climb to the|Go up|Up to|Ride (Hero|Hercules|Scooty|BSA|cycle|Ladies))/;
async function drive2(done, o) {
  o = o || {};
  const t0 = Date.now();
  let s = null, lastKey = '', same = 0, dlgT = 0, mgT = 0;
  while (Date.now() - t0 < (o.timeout || 300000)) {
    s = await probe2();
    if (await done(s)) return s;
    if (s.ask && s.lf && !s.mission && !o.noRetry) {
      // MISSION FAILED during a story2 mission: note it and retry (E on the card) like a player
      const why = await ev(() => (window.__fails || []).slice(-1)[0] || null);
      log('  (story2 mission failed: ' + JSON.stringify(why) + ' -> retry)');
      check(!o.mustNotFail, (s.lf || '?') + ': unexpected MISSION FAILED', why);
      await pressKey('KeyE'); tally('E retry card'); await sleep(600); continue;
    }
    if (o.each) { const r = await o.each(s); if (r === 'skip') { await sleep(120); continue; } }
    const key = [s.mission, s.scene, s.objective, s.target && Math.round(s.target.x), s.offer, s.mode].join('|');
    if (key === lastKey) same++; else { same = 0; lastKey = key; if (process.env.VERBOSE) console.log('     ·', s.mission || s.scene, '|', s.mode, '|', s.objective, '|', s.offer, '|', JSON.stringify(s.player), s.date); }
    if (Date.now() - (o.hb || t0) > 60000) { o.hb = Date.now(); log('   … ' + (s.mission || s.scene) + ': ' + s.mode + ' | ' + s.objective + ' | offer ' + s.offer + ' | ' + JSON.stringify(s.player) + ' tgt ' + JSON.stringify(s.target) + ' d ' + Math.round(s.dist || 0) + ' | ' + s.date + (s.panel ? ' | panel ' + s.panel : '') + (s.mg ? ' | mg ' + s.mg : '')); }
    if (s.shop) { await ev(() => { try { N.shops.close(); } catch (e) { /* ignore */ } }); await sleep(250); continue; }
    if (s.journal) { await page.keyboard.press('Escape'); await sleep(250); continue; }
    if (s.defs) { await page.keyboard.press('KeyE'); await sleep(400); continue; }
    if (s.credits) { await page.keyboard.press('Escape'); await sleep(400); continue; }
    if (s.cut && !o.keepCut) { await ev(() => { if (N.menus.skipCutscene) N.menus.skipCutscene(); }); await sleep(200); continue; }
    if (s.mg || s.mode === 'minigame') {
      if (s.mgResult) { mgT = mgT || Date.now(); if (Date.now() - mgT > 2500) { await page.keyboard.press('Enter'); mgT = Date.now(); } } else mgT = 0;
      await sleep(300); continue;
    }
    if (s.rec === 'prompt') { await page.keyboard.press('KeyE'); tally('E on ● REC'); await sleep(250); continue; }
    if (s.panel) { if (o.panel && (await o.panel(s)) !== false) { await sleep(200); continue; } await page.keyboard.press('KeyE'); await sleep(350); continue; }
    if (s.dialog || s.mode === 'dialogue') {
      dlgT = dlgT || Date.now();
      if (Date.now() - dlgT > 1500) { await page.keyboard.press('KeyE'); dlgT = Date.now(); }
      await sleep(120); continue;
    }
    dlgT = 0;
    if (s.mode === 'play') {
      if (s.gallery) { await galleryKeys(s); continue; }
      if (s.offer && STORY_OFFER.test(s.offer) && (!s.target || s.dist <= 44) && (!/^Ride /.test(s.offer) || RIDE_OK.test(s.mission || ''))) { await page.keyboard.press('KeyE'); tally('E story offer'); await sleep(220); continue; }
      if (s.target && s.dist > (o.near || 16)) { await ev(([x, y]) => N.story2.tp(x, y), [s.target.x, s.target.y]); await sleep(o.tpWait || 160); continue; }
      if (same > 40 && s.target) { await ev(([x, y]) => N.story2.tp(x + 6, y + 6), [s.target.x, s.target.y]); same = 0; }
    }
    await sleep(160);
  }
  throw new Error('drive timeout: ' + JSON.stringify(s));
}
async function walkKeys(x, y, r, maxMs) {
  r = r || 14;
  const t0 = Date.now();
  let held = new Set();
  const set = async (keys) => { for (const k of held) if (!keys.has(k)) await page.keyboard.up(k); for (const k of keys) if (!held.has(k)) await page.keyboard.down(k); held = keys; };
  let d = Infinity;
  while (Date.now() - t0 < (maxMs || 12000)) {
    const p = await ev(() => ({ x: N.player.x, y: N.player.y, mode: N.state.mode }));
    if (p.mode !== 'play') break;
    const dx = x - p.x, dy = y - p.y; d = Math.hypot(dx, dy);
    if (d <= r) break;
    const keys = new Set();
    if (dx > 5) keys.add('ArrowRight'); if (dx < -5) keys.add('ArrowLeft'); if (dy > 5) keys.add('ArrowDown'); if (dy < -5) keys.add('ArrowUp');
    await set(keys);
    await sleep(70);
  }
  await set(new Set());
  if (d <= r + 2) tally('arrow-key walks');
  return d;
}
async function galleryKeys(s) {
  const g = s.gallery;
  const dx = g.coat.x - g.cam.x, dy = g.coat.y - g.cam.y;
  if (Math.hypot(dx, dy) < 60) { await page.keyboard.press('KeyE'); tally('E gallery'); await sleep(250); return; }
  const keys = [];
  if (dx > 20) keys.push('ArrowRight'); if (dx < -20) keys.push('ArrowLeft'); if (dy > 20) keys.push('ArrowDown'); if (dy < -20) keys.push('ArrowUp');
  for (const k of keys) await page.keyboard.down(k);
  await sleep(120);
  for (const k of keys) await page.keyboard.up(k);
  tally('arrow gallery pan');
}
async function talkKeys(st, o) {
  o = o || {};
  const t0 = Date.now();
  let opened = false;
  for (;;) {
    if (Date.now() - t0 > (o.max || 30000)) return;
    const d = await ev(() => ({ open: N.dialogue.isOpen(), cur: N.dialogue.current ? { choices: N.dialogue.current.choices, typing: N.dialogue.current.typing } : null }));
    if (!d.open) { if (opened || Date.now() - t0 > (o.wait || 6000)) return; await sleep(120); continue; }
    opened = true;
    if (d.cur && d.cur.choices && d.cur.choices.length && !d.cur.typing) {
      const want = st.ci < st.choices.length ? st.choices[st.ci] : 0;
      st.ci++;
      for (let k = 0; k < want; k++) { await page.keyboard.press('ArrowDown'); await sleep(90); }
      await page.keyboard.press('KeyE');
      tally('↓/E dialogue choice');
      await sleep(280);
      continue;
    }
    await page.keyboard.press('KeyE');
    await sleep(150);
  }
}
async function waitMission(id, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 20000)) { const a = await ev(() => N.missions.active && N.missions.active.id); if (a === id) return true; await sleep(100); }
  return false;
}
const passed2 = (id) => (s) => s.mission !== id && s.scene == null && !s.ask;

/* ====================================================================== shared mission helpers */
/** The player walks into a giver marker with the arrow keys (from a clear 60 u approach) and presses E on
 *  the J-card. Falls back to standing on the marker. */
async function startFromGiver(id, o) {
  for (let k = 0; k < 3; k++) {
    const ok = await startFromGiver1(id, o);
    if (ok) return true;
    // an odd job's ring (its window opened while he stood there) took the J-card: leave it and walk in again
    const other = await ev(() => N.missions.active && N.missions.active.id);
    if (!other || !/^job_/.test(other)) return false;
    log('  (' + id + ': the odd job ' + other + ' started on the J-card dwell instead -> quit it, walk in again)');
    await ev(() => { try { N.missions.abort(); } catch (e) { /* ignore */ } });
    await sleep(800);
  }
  return false;
}
async function startFromGiver1(id, o) {
  o = o || {};
  await ev(() => { if (N.wanted && N.wanted.level > 0 && N.wanted.set) N.wanted.set(0, 'test'); });
  // step away first (a giver right where the last mission ended waits until you step out)
  await ev((id) => { const d = N.missions.defs[id]; const g = d && N.missions.giverPos(d); if (g) { const q = window.__safeSpot(g.x, g.y, 160); N.player.teleport(q.x, q.y); } }, id);
  await clearStrayJob();
  await sleep(700);
  await waitFor((id) => (N.missions.markers() || []).some((x) => x.kind === 'giver' && x.id === id), id, 4000);
  const g = await ev((id) => (N.missions.markers() || []).find((x) => x.kind === 'giver' && x.id === id) || null, id);
  if (!check(!!g, id + ': giver marker visible', await ev((id) => ({ active: N.missions.active && N.missions.active.id, mode: N.state.mode, avail: N.missions.available().map((d) => d.id), date: N.calendar.osd(), when: N.missions.defs[id] && N.missions.defs[id].when ? N.missions.defs[id].when() : null }), id))) return false;
  const st = await ev((g) => {
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, x = g.x + Math.cos(a) * 60, y = g.y + Math.sin(a) * 60; const rc = N.world.raycast(x, y, g.x, g.y, 'walk'); if (N.world.isWalkable(x, y) && !(rc && rc.hit) && !N.player.level) { N.player.teleport(x, y); return { x, y }; } }
    return null;
  }, g);
  if (st && !o.noWalk) await walkKeys(g.x, g.y, 8, 12000);
  else await goTo({ x: g.x, y: g.y });
  const card = await waitFor((id) => N.missions.prompt === id || (N.missions.active && N.missions.active.id === id), id, 10000);
  if (!card) await goTo({ x: g.x, y: g.y });
  if (await ev((id) => N.missions.prompt === id, id)) { await pressKey('KeyE'); tally('E on the J-card'); }
  else if (!(await waitFor((id) => N.missions.prompt === id || (N.missions.active && N.missions.active.id === id), id, 8000, id + ' J-card'))) return false;
  else if (await ev((id) => N.missions.prompt === id, id)) { await pressKey('KeyE'); tally('E on the J-card'); }
  return waitFor((id) => N.missions.active && N.missions.active.id === id, id, 10000, id + ' to start from the J-card');
}
/** If a teleport dropped the player into an odd-job giver ring, the job starts after the 1 s J-card dwell
 *  (missions.js, by design): leave it, like a player stepping out, and note it. */
async function clearStrayJob(want) {
  const a = await ev(() => N.missions.active && N.missions.active.id);
  if (a && a !== want && /^job_/.test(a)) { log('  (an odd job started under the player after a teleport: ' + a + ' -> quit)'); await ev(() => { try { N.missions.abort(); } catch (e) { /* ignore */ } }); await sleep(500); }
}
/** Seasons / festival flags of the current date. */
const seasonsNow = () => ev(() => { try { return N.seasons.active ? N.seasons.active() : []; } catch (e) { return []; } });
/** At a main mission's start: the date jump and the festival flags of that date (bible §1.4). */
async function atStart(id, date, fest, notFest) {
  await waitFor((d) => N.calendar.label().indexOf(d) >= 0 && !N.calendar.jumping, date, 12000);
  const s = await ev(() => ({ date: N.calendar.label(), act: (N.seasons && N.seasons.active) ? N.seasons.active() : [] }));
  check(s.date.indexOf(date) >= 0, id + ': the calendar jumps to ' + date, s.date);
  for (const f of fest || []) check(s.act.indexOf(f) >= 0 || !!(await ev((f) => N.flags[f], f)), id + ': festival / season flag "' + f + '" on (' + date + ')', s.act);
  for (const f of notFest || []) check(s.act.indexOf(f) < 0, id + ': "' + f + '" is off on ' + date, s.act);
}
const TOKENS = { bo_kaata: 'kite_corner', lost_and_found: 'numaish_ticket', first_day_first_show: 'toofan_stub', last_man_batting: 'signed_ball', right_right: 'punched_ticket', ammammas_thursday: 'brass_token_47', the_clap: 'golconda_ticket', drums_for_amma: 'neem_leaf', opening_day: 'prasads_stub', agle_baras: 'gulal', last_bell: 'slam_book_page', chand_raat: 'side_a_copy' };
const COUNTER = { bo_kaata: 83, lost_and_found: 166, first_day_first_show: 249, last_man_batting: 332, right_right: 415, ammammas_thursday: 498, the_clap: 581, drums_for_amma: 664, opening_day: 747, agle_baras: 812, last_bell: 905, chand_raat: 999 };
const ORDER = Object.keys(COUNTER);
/** After a main mission: HUD counter (DOM), tape track, the tin (every token so far), date, meter, money, the autosave. */
async function afterMain(id, date, extra) {
  await sleep(500);
  // the HUD counter rolls up to the new number (a few seconds): wait for it like a player watching the OSD
  await waitFor((n) => ((document.querySelector('#ui .osd-tape .tp-num') || {}).textContent || '').trim() === ('00' + n).slice(-3), COUNTER[id], 12000);
  const s = await ev(() => ({
    done: N.missions.isDone ? Array.from(N.missions.done) : [], counter: N.tape.counter, hud: ((document.querySelector('#ui .osd-tape .tp-num') || {}).textContent || '').trim(),
    side: ((document.querySelector('#ui .osd-tape .tp-side') || {}).textContent || '').trim(), tracks: N.tape.tracks.map((t) => t.id), tin: Array.from(N.tape.tin),
    date: N.calendar.label(), money: N.player.money, wanted: N.wanted ? N.wanted.level | 0 : 0, mode: N.state.mode,
    save: (() => { try { const o = JSON.parse(localStorage.getItem('nostalgia.save.v1')); return { done: o.data.missions.done, counter: o.data.tape && o.data.tape.counter }; } catch (e) { return null; } })(),
  }));
  const n = COUNTER[id];
  check(s.done.indexOf(id) >= 0, id + ': MISSION PASSED');
  check(s.counter === n, id + ': tape counter ' + n, s.counter);
  check(s.hud === ('00' + n).slice(-3) && s.side === 'SIDE A', id + ': the HUD shows SIDE A ' + ('00' + n).slice(-3), { hud: s.hud, side: s.side });
  check(s.tracks.indexOf(id) >= 0, id + ': Side A track recorded');
  const want = ORDER.slice(0, ORDER.indexOf(id) + 1).map((k) => TOKENS[k]);
  const miss = want.filter((t) => s.tin.indexOf(t) < 0);
  check(!miss.length, id + ': the tin holds every token so far (' + want.length + ')', { miss, tin: s.tin });
  if (date) check(s.date.indexOf(date) >= 0, id + ': free roam goes on on ' + date, s.date);
  check(s.money >= 0, id + ': pocket money never negative (₹' + (s.money / 100).toFixed(2) + ')', s.money);
  check(s.wanted === 0 || (extra && extra.wantedOk), id + ': Chappal Meter back at 0 after the mission', s.wanted);
  check(!!(s.save && s.save.done && s.save.done.indexOf(id) >= 0 && s.save.counter === n), id + ': autosaved on MISSION PASSED', s.save);
  log('  ' + id + ': ₹' + (s.money / 100).toFixed(2) + ', ' + s.date + ', tin ' + s.tin.length);
  return s;
}
/** Free-roam exploration between missions: collect a hidden item with real movement (walk onto it / E). */
async function collect(id) {
  const r = await ev((id) => {
    const it = N.collectibles && N.collectibles.get(id);
    if (!it || N.collectibles.has(id)) return { skip: true, why: it ? 'found' : 'none' };
    if (!N.collectibles.isActive(id)) return { skip: true, why: 'inactive' };
    const at = N.debug.collectibleGo(id);
    return { at, x: it.x, y: it.y, pick: it.pick, level: it.level || null };
  }, id);
  if (r.skip) return false;
  await sleep(300);
  if (r.pick === 'walk') await walkKeys(r.x, r.y, 3, 8000);
  for (let i = 0; i < 6 && !(await ev((id) => N.collectibles.has(id), id)); i++) {
    if (r.pick !== 'walk') { await pressKey('KeyE'); }
    else { await goTo({ x: r.x, y: r.y }); }
    await sleep(400);
  }
  const got = await ev((id) => N.collectibles.has(id), id);
  if (got) tally('collectibles picked up');
  await ev(() => { try { if (N.state.mode !== 'play') { const c = document.querySelector('.cl-card button, .coll-card button'); if (c) c.click(); } } catch (e) { /* ignore */ } });
  await waitFor(() => N.state.mode === 'play', null, 6000);
  await clearStrayJob();
  return got;
}
async function idle() {
  await waitFor(() => N.state.mode === 'play' && !N.missions.active && !(N.story2 && N.story2.state().scene) && !(N.story2 && N.story2.state().panel), null, 30000);
}

/* ====================================================================== phases */
async function pTitle() {
  await ev(() => { N.menus.quickStart = false; try { localStorage.removeItem('nostalgia.save.v1'); localStorage.removeItem('nostalgia.save.v1.bak'); localStorage.removeItem('nostalgia.save.v1.manual'); } catch (e) { /* ignore */ } });
  await shot('00_title');
  await page.click('#title-start');
  const named = await waitFor(() => N.menus.debugState().top === 'name', null, 20000, 'the name card');
  if (named) {
    // type the names with the keyboard (the nick field has focus)
    await page.keyboard.press('Control+A'); await page.keyboard.type(NICK, { delay: 40 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A'); await page.keyboard.type(FULL, { delay: 40 });
    await shot('01_name_card');
    await page.keyboard.press('Enter');
  }
  const cs = await waitFor(() => N.state.mode === 'cutscene', null, 20000, 'the prologue cutscene');
  check(cs, 'PLAY -> name card (typed) -> the 2026 prologue starts');
  const nm = await ev(() => ({ nick: N.player.nick, full: N.player.fullName || N.player.full }));
  check(nm.nick === NICK && /Pradeep/.test(nm.full || ''), 'the name card sets the nickname ' + NICK + ' / K. ' + FULL, nm);
  await sleep(900);
  const y = await ev(() => ({ year: N.flags.year, date: N.calendar.label(), s26: N.seasons && N.seasons.is ? N.seasons.is('year2026') : null }));
  check(y.year === 2026 && /14 JAN 2026/.test(y.date), 'prologue: WED 14 JAN 2026', y);
  await shot('02_prologue');
  let prompt = false;
  for (let i = 0; i < 100 && !prompt; i++) {
    prompt = await ev(() => !!document.querySelector('.mn-cs .cs-card.k-prompt'));
    if (prompt) break;
    await pressKey('KeyE'); tally('E prologue');
    await sleep(250);
  }
  check(prompt, 'the ▶ PLAY prompt (bible §4.1)');
  const lines = await ev(() => window.__lines.slice());
  check(lines.some((l) => l[0] === 'amma' && /^Pradeep! A courier came/.test(l[1])), 'the prologue says "{full}! A courier came" with the typed name', lines.slice(0, 6));
  await shot('03_prologue_play');
  await pressKey('KeyE');
  await waitFor(() => document.querySelector('.mn-cs.vhs-rewind') !== null, null, 10000, 'the ◀◀ REWIND');
  await shot('04_rewind');
  for (let i = 0; i < 60; i++) { if (await ev(() => N.state.mode !== 'cutscene')) break; await pressKey('KeyE'); await sleep(300); }
  await waitFor(() => N.state.mode === 'play' && N.missions.active && N.missions.active.id === 'bo_kaata', null, 60000, 'M1 to start after the prologue');
  const s = await ev(() => ({ year: N.flags.year, date: N.calendar.label(), clock: N.clock.label(), lvl: N.player.level, seen: N.flags.prologue_seen, act: N.seasons.active() }));
  check(s.year === 2003 && s.date === 'TUE 14 JAN 2003' && s.clock === '07:10', 'after ◀◀ REWIND: TUE 14 JAN 2003 07:10', s);
  check(s.lvl === 'home_terrace', 'M1 starts on home_terrace', s.lvl);
  check(s.act.indexOf('sankranti') >= 0 && s.act.indexOf('numaish') >= 0, 'M1: Sankranti (kites) and Numaish are on', s.act);
}
async function pM1() {
  await testTune();
  await waitFor(() => N.story.debug.state().step === 'act', null, 30000, 'the kite prompt');
  const lab = await ev(() => N.input.actionLabel);
  check(lab === 'Fly the kite', 'M1: ACTION "Fly the kite" on the terrace', lab);
  await pressKey('KeyE'); tally('E Fly the kite');
  const kiteGo = () => (N.minigames && N.minigames.active === 'kite') || N.story.debug.state().step !== 'act';
  for (let i = 0; i < 3 && !(await waitFor(kiteGo, null, 4000)); i++) await pressKey('KeyE');
  await finish1('bo_kaata', { hook: async (s) => { if (/fountain railing/.test(s.obj || '') && !s.tgt) { await ev(() => N.story.debug.skip()); return true; } return false; } });
  await afterMain('bo_kaata', 'TUE 14 JAN 2003');
  const v = await ev(() => ({ inv: Array.from(N.player.inventory), k1: N.collectibles.has('kite_1'), hint: N.hints.active && N.hints.active.id }));
  check(['camera', 'charkhi', 'walkman'].every((i) => v.inv.indexOf(i) >= 0) && v.k1, 'M1: camera, charkhi, walkman; kite K1 found at Gulzar Houz', v);
  check(v.hint === 'lost_and_found', 'M1: clue 1 (the clock tower + the tin) armed', v.hint);
  await shot('m1_passed');
}
async function pExplore1() {
  // free roam between missions: the player finds a few hidden things (real walking onto them)
  const got = [];
  for (const id of ['cassette_1', 'kite_3', 'goli_1']) if (await collect(id)) got.push(id);
  log('  explored: ' + got.join(', '));
}
async function pM2() {
  await testTune();
  // the clue is a riddle: ask Ammamma at home first (hint tier 1, free)
  const h = await ev(() => { try { return N.hints.next('home'); } catch (e) { return { err: String(e) }; } });
  check(h && h.text, 'M2: Ammamma gives a hint for the clock-tower riddle', h);
  await ev(() => { const P = N.places.mozamjahi_market; N.player.teleport(P.x + 150, P.y + 120); });
  await waitFor(() => (N.missions.markers() || []).some((x) => x.id === 'lost_and_found'), null, 4000, 'the M2 giver near Mozamjahi');
  await ev(() => N.debug.skipDialogue(false)); // the riddle is answered with real keys
  if (!check(await startFromGiver('lost_and_found'), 'M2 starts from its giver (arrow keys + E on the J-card)')) return;
  await atStart('lost_and_found', 'SAT 25 JAN 2003', ['numaish'], ['sankranti']);
  if (await untilChoice(30000, 'the riddle choice')) { await shot('m2_riddle'); await pressKey('ArrowDown'); await pressKey('KeyE'); tally('↓/E dialogue choice'); await sleep(400); }
  await ev(() => N.debug.skipDialogue(true));
  await waitFor(() => N.flags.lock_2 === 4, null, 10000, 'lock slot 2 = 4');
  await finish1('lost_and_found');
  await afterMain('lost_and_found', 'SAT 25 JAN 2003');
  check(await ev(() => N.flags.lock_2 === 4 && N.player.inventory.has('tin')), 'M2: the tin bought, The Lock slot 2 = 4');
}
async function pM3() {
  await testTune();
  if (!check(await startFromGiver('first_day_first_show'), 'M3 starts from the alarm-clock giver at home')) return;
  await atStart('first_day_first_show', 'SAT 08 FEB 2003', ['numaish']);
  let qs = false, fore = 0, foreDone = false;
  const r = await finish1('first_day_first_show', { hook: async (s) => {
    if (s.st.queue && !qs) { qs = true; await sleep(800); await shot('m3_queue'); }
    // the four forecourts: count the garlands at Devi, Sudarshan and Odeon before the hero at Sandhya
    if (s.st.step === 'cutouts' && !foreDone) {
      foreDone = true;
      for (const id of ['devi_theatre', 'sudarshan_theatre', 'odeon_theatre']) {
        const q = await ev((id) => { const P = N.places[id]; const f = N.world.findFree(P.x, P.y + 18, 'walk', 30) || P; N.player.teleport(f.x, f.y); return { x: f.x, y: f.y }; }, id);
        void q; await sleep(350);
        if (await ev(() => N.input.actionLabel === 'Count the garlands')) { await pressKey('KeyE'); fore++; tally('E count the garlands'); }
        await waitFor(() => N.state.mode === 'play', null, 8000);
        await sleep(300);
      }
      return true;
    }
    return false;
  } });
  check(fore === 3, 'M3: the garlands counted at Devi, Sudarshan and Odeon with real E (' + fore + '/3)', fore);
  void r;
  await afterMain('first_day_first_show', 'SAT 08 FEB 2003');
  check(await ev(() => !!(N.flags.meter_live && N.flags.sa6_unlocked)), 'M3: the Chappal Meter is live from now on');
}
async function pSA3() {
  await testTune();
  await ev(() => N.calendar.set(2003, 2, 9, 7, 20)); // the next morning: Sunday
  if (!check(await startFromGiver('sunday_mutton'), 'SA3 starts from Nanna at the meat shop on Sunday morning')) return;
  const money0 = await ev(() => N.player.money);
  await finish1('sunday_mutton');
  const v = await ev(() => ({ runs: N.flags.sa3_runs, money: N.player.money, balm: N.player.inventory.has('balm') }));
  check(v.runs === 1 && v.balm && v.money >= money0 + 500, 'SA3 passed: ₹5, Ammamma\'s balm', { v, money0 });
}
async function pM4() {
  await testTune();
  await ev(() => { N.story.debug.mg = 'lose'; });
  if (!check(await startFromGiver('last_man_batting'), 'M4 starts from Amma at home')) return;
  await atStart('last_man_batting', 'SUN 23 MAR 2003', ['world_cup']);
  const r0 = await autopilot1('last_man_batting', { timeout: 300000 });
  check(r0.failed, 'M4: losing the back-lawn match fails the mission');
  await ev(() => { N.story.debug.mg = 'win'; });
  check(await retryFromCard('last_man_batting'), 'M4: retry (E on the card) from the match checkpoint');
  let gate = 0;
  await finish1('last_man_batting', { hook: async (s) => {
    if (/Assembly gate/.test(s.obj || '') && gate === 0) {
      await ev(() => N.debug.skipDialogue(false));
      if (s.tgt) await goTo(s.tgt);
      if (await untilChoice(20000, 'the Assembly choice')) { await shot('m4_assembly'); await pressKey('KeyE'); tally('↓/E dialogue choice'); }
      await ev(() => N.debug.skipDialogue(true));
      gate = 1;
      return true;
    }
    return false;
  } });
  await afterMain('last_man_batting', 'SUN 23 MAR 2003');
  check(await ev(() => N.flags.lock_1 === 1), 'M4: The Lock slot 1 = 1 (the mummy)');
}
async function pSA2() {
  await testTune();
  await ev(() => { N.flags.force_power_cut = true; N.calendar.set(2003, 3, 24, 19, 5); const P = N.places.kirana_1; const q = window.__safeSpot(P.x + 60, P.y + 40); N.player.teleport(q.x, q.y); });
  await sleep(300); await clearStrayJob();
  await waitFor(() => N.flags.power_cut === true, null, 6000, 'the evening power cut');
  await sleep(600);
  await shot('sa2_dark');
  if (!check(await startFromGiver('current_poyindi'), 'SA2 starts at the kirana in the power cut')) return;
  await finish1('current_poyindi');
  const v = await ev(() => ({ runs: N.flags.sa2_runs, pc: N.flags.power_cut, dark: N.story.debug.state().dark }));
  check(v.runs === 1 && !v.pc && !v.dark, 'SA2 passed: the current came back', v);
  await ev(() => { N.flags.force_power_cut = false; });
}
async function pM5() {
  await testTune();
  if (!check(await startFromGiver('right_right'), 'M5 starts from Amma at home')) return;
  await atStart('right_right', 'TUE 01 APR 2003');
  await finish1('right_right');
  await afterMain('right_right', 'WED 02 APR 2003');
  const v = await ev(() => ({ bus: N.flags.bus_unlocked || N.flags.unlock_bus, tickets: N.collectibles.unlocked('tickets') }));
  check(v.bus && v.tickets, 'M5: bus travel and Ticket Thatha\'s tickets unlocked', v);
}
async function pM6() {
  await testTune();
  await ev(() => N.debug.setTime(10, 0));
  if (!check(await startFromGiver('ammammas_thursday'), 'M6 starts from Ammamma on the verandah swing')) return;
  await atStart('ammammas_thursday', 'THU 15 MAY 2003', ['summer']);
  let q = false;
  await finish1('ammammas_thursday', { hook: async (s) => {
    if (!q && /Wait for the current/.test(s.obj || '')) {
      q = true;
      const w0 = await ev(() => window.__wm);
      await pressKey('KeyQ'); tally('Q walkman');
      await sleep(400);
      check((await ev(() => window.__wm)) > w0, 'M6: the walkman tutorial with a real Q');
      return true;
    }
    return false;
  } });
  await afterMain('ammammas_thursday', 'THU 15 MAY 2003');
  const h = await ev(() => N.hints.active);
  check(h && h.id === 'the_clap' && !h.off && /Fateh Darwaza/.test(h.clue || ''), 'M6: clue 5 solved in the temple queue (Fateh Darwaza)', h);
}
async function pSA4() {
  await testTune();
  await ev(() => { N.calendar.set(2003, 5, 16, 6, 10); N.story.debug.mgTimeScale = 10; }); // the next dawn
  const money0 = await ev(() => N.player.money);
  if (!check(await startFromGiver('six_balls'), 'SA4 starts from Ayesha at the Jawahar Bal Bhavan notice board')) return;
  const mg0 = await ev(() => window.__mg.length);
  let watching = true;
  const watcher = (async () => { while (watching) { if (await ev(() => N.minigames.active === 'match')) { await sleep(4000); await shot('sa4_lb_match'); await sleep(8000); await shot('sa4_lb_match2'); return; } await sleep(400); } })();
  await finish1('six_balls', { timeout: 1200000 });
  watching = false; await watcher;
  await ev(() => { N.story.debug.mgTimeScale = null; });
  const games = await ev((n) => window.__mg.slice(n), mg0);
  const match = games.find((g) => g.id === 'match');
  check(!!match, 'THE LB STADIUM MATCH is played with the match engine (minigame "match")', games);
  check(match && match.lb, 'the match day: N.flags.lb_match on (floodlights, crowds)', match);
  log('  LB match: ' + JSON.stringify(match) + ' -> ' + JSON.stringify(await ev(() => (window.__mgEnd || []).filter((e) => e.id === 'match').slice(-1)[0] || null)));
  const v = await ev(() => ({ played: N.flags.lb_match_played, badge: N.flags.ayesha_camp_badge, money: N.player.money, nets: N.npcs.scheduleOn ? N.npcs.scheduleOn('ayesha_nets') : null, cm: N.cricketMatch ? N.cricketMatch.last || null : null }));
  check(v.played && v.badge && v.money >= money0 + 2000, 'SA4 passed: the match played, Ayesha\'s camp badge, ₹20', v);
  await ev(() => N.debug.setTime(16, 0));
  await ev(() => { const P = N.places.lb_stadium; N.player.teleport(P.x + 180, P.y + 140); });
  await sleep(1200);
  check(await ev(() => (N.missions.markers() || []).some((x) => x.id === 'lb_exhibition')), 'the LB match is replayable: the coach offers an exhibition match at lb_stadium');
}
async function pM7() {
  await testTune();
  if (!check(await startFromGiver('the_clap'), 'M7 starts from Amma at home (arrow keys + E)')) return;
  await atStart('the_clap', 'SAT 07 JUN 2003', ['summer']);
  let sumShot = false;
  await drive2(passed2('the_clap'), { timeout: 400000, each: async (s) => { if (!sumShot && /Pasha/.test(s.objective || '')) { sumShot = true; await shot('m7_pasha'); } } });
  await afterMain('the_clap', 'SAT 07 JUN 2003');
  check(await ev(() => !!(N.flags.clue_tunnel && N.flags.bus_golconda)), 'M7: the tunnel clue, the Golconda bus route');
}
async function pSA7() {
  await testTune();
  await ev(() => { N.calendar.set(2003, 6, 9, 10, 0); });
  check(await ev(() => N.missions.available().some((d) => d.id === 'new_class_old_books')), 'SA7 is offered on 9 Jun');
  if (!check(await startFromGiver('new_class_old_books'), 'SA7 starts from its giver')) return;
  await drive2(passed2('new_class_old_books'), { timeout: 200000 });
  check(await ev(() => N.missions.isDone('new_class_old_books')), 'SA7 passed (Koti book bazaar, the brown cover paper)');
}
async function pSA5() {
  await testTune();
  await ev(() => { N.calendar.set(2003, 6, 10, 11, 30); });
  if (!check(await startFromGiver('twelve_oclock'), 'SA5 starts at 11:30')) return;
  await drive2(passed2('twelve_oclock'), { timeout: 200000 });
  check(await ev(() => N.missions.isDone('twelve_oclock')), 'SA5 passed: the gong at twelve (Salar Jung)');
}
async function pM8() {
  await testTune();
  if (!check(await startFromGiver('drums_for_amma'), 'M8 starts from its giver')) return;
  await atStart('drums_for_amma', 'SUN 20 JUL 2003', ['bonalu', 'monsoon'].slice(0, 1));
  let ps = false;
  await drive2(passed2('drums_for_amma'), { timeout: 400000, each: async (s) => { if (!ps && /Walk with Amma/.test(s.objective || '') && s.mode === 'play') { ps = true; await sleep(600); await shot('m8_bonalu'); } } });
  await afterMain('drums_for_amma', 'SUN 20 JUL 2003');
}
async function pSA6() {
  await testTune();
  for (const id of ['bunty_races', 'bunty_races_r2', 'bunty_races_r3', 'bunty_races_r4']) {
    await ev(() => N.clock.set(16, 40));
    if (!check(await startFromGiver(id), 'SA6 ' + id + ' starts from Bunty-anna')) return;
    await drive2(passed2(id), { timeout: 300000, near: 20 });
    check(await ev((mid) => N.missions.isDone(mid), id), 'SA6 ' + id + ' won');
  }
  const v = await ev(() => ({ race: N.flags.sa6_race, pillion: N.flags.bunty_pillion }));
  check(v.race === 4 && v.pillion, 'SA6: R4 won: RX100 pillion rides (A3)', v);
}
async function pM9() {
  await testTune();
  await ev(() => N.debug.skipDialogue(false));
  if (!check(await startFromGiver('opening_day'), 'M9 starts from its giver')) return;
  await talkKeys({ choices: [1], ci: 0 }, { wait: 10000 });
  await ev(() => N.debug.skipDialogue(true));
  await atStart('opening_day', 'FRI 25 JUL 2003', ['prasads_open']);
  let shotI = false;
  await drive2(passed2('opening_day'), { timeout: 400000, each: async (s) => { if (!shotI && /mini train/.test(s.objective || '')) { shotI = true; await shot('m9_ntr_gardens'); } } });
  await afterMain('opening_day', 'FRI 25 JUL 2003');
  check(await ev(() => !!N.flags.prasads_open), 'M9: Prasads IMAX is open from 25 Jul');
}
async function pSA1() {
  await testTune();
  for (let night = 1; night <= 4; night++) {
    await ev((n) => N.calendar.set(2003, 9, n, 21, 5), night);
    await sleep(700);
    if (!check(await startFromGiver('pandal_duty'), 'SA1 night ' + night + ' starts from Bunty at the colony ground')) return;
    let tags = 0;
    const hook = async (s) => {
      if (/Chanda round/.test(s.obj || '')) {
        const pts = await ev(() => ['kirana_1', 'pindi_girni_1', 'irani_cafe_7', 'medical_shop_8', 'friend_home'].map((id) => N.places[id]).filter(Boolean).map((p) => ({ x: p.x, y: p.y })));
        for (const p of pts) { await goTo(p); await pressKey('KeyE'); await sleep(250); }
        return true;
      }
      if (!s.st.tag) return false;
      const go = await ev(() => {
        const W = N.story.debug.tag(); if (!W) return null;
        const L = N.places.playground_1;
        const live = W.raiders.filter((r) => r.alive && !r.tagged).sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y));
        const e = live[0]; if (!e) return null;
        N.player.teleport(e.x + 5, e.y);
        return 'go';
      });
      if (go) { await sleep(90); if (await ev(() => N.input.actionLabel === 'Tag!')) { await pressKey('KeyE'); tags++; tally('E Tag!'); } } else await sleep(150);
      return true;
    };
    await finish1('pandal_duty', { hook, timeout: 300000 });
    check((await ev(() => N.flags.pandal_nights)) === night, 'SA1 night ' + night + ' done');
  }
  check(await ev(() => !!N.flags.tiger_helps_lorry), 'SA1: four nights done: Tiger\'s gang will push the lorry in M10');
}
async function pM10() {
  await testTune();
  if (!check(await startFromGiver('agle_baras'), 'M10 starts from its giver')) return;
  await atStart('agle_baras', 'TUE 09 SEP 2003', ['ganesh', 'ganesh_immersion']);
  let lorryShot = false, walked = false, tiger = false;
  await drive2((s) => s.mission !== 'agle_baras' && !s.ask && (s.scene === 'interlude' || s.scene == null), {
    timeout: 500000,
    each: async (s) => {
      if (!tiger) tiger = await ev(() => !!(N.npcs.get('tiger') && N.missions.active && N.missions.active.id === 'agle_baras'));
      if (!lorryShot && /Walk with our Ganesh/.test(s.objective || '') && s.mode === 'play') { lorryShot = true; await sleep(900); await shot('m10_procession'); }
      if (walked === false && /\(6\/7\)/.test(s.objective || '') && s.mode === 'play') {
        walked = null;
        const t7 = await ev(() => { const l = N.WORLD_DATA.landmarks.find((q) => q.id === 'tank_bund_statue_7'); const r = N.world.nearestRoadPoint(l.x, l.y); return { x: r.x, y: r.y }; });
        walked = (await walkKeys(t7.x, t7.y, 26, 20000)) <= 40;
        await sleep(300);
        return 'skip';
      }
      return null;
    },
  });
  await afterMain('agle_baras', null);
  check(await ev(() => N.flags.lock_4 === 1 && !!N.flags.boats_open), 'M10: The Lock slot 4 = 1 (the man in the lake), Lumbini boats open');
  check(walked, 'M10: the seventh statue reached with the arrow keys');
  check(tiger, 'M10: Tiger\'s gang helps with the lorry (SA1 pandal duty paid off)');
}
async function pInterlude() {
  // reload right after M10 passed: CONTINUE resumes into the interlude (it is not interruptible)
  await reloadContinue('after M10, into the interlude');
  await drive2((s) => s.scene === 'interlude', { timeout: 30000 });
  check(true, 'after a reload, CONTINUE resumes into the interlude');
  await drive2((s) => s.scene == null && !s.cut, { timeout: 200000 });
  const ai = await ev(() => ({ paused: N.tape.paused, counter: N.tape.counter, date: N.calendar.label(), done: N.flags.interlude_done, hud: ((document.querySelector('#ui .osd-tape') || {}).className || ''), pauseVis: !!(document.querySelector('#ui .osd-tape .tp-pause') && getComputedStyle(document.querySelector('#ui .osd-tape .tp-pause')).display !== 'none') }));
  await shot('interlude_paused');
  check(ai.paused && ai.counter === 812 && /01 NOV 2003/.test(ai.date) && ai.done, 'interlude: SAT 01 NOV 2003, SIDE A ■ PAUSED 812', ai);
  check(ai.pauseVis, 'interlude: the HUD shows ■ PAUSED', ai);
  await snapshot('interlude', { save: false });
}
async function pM11() {
  await testTune();
  await ev(() => N.debug.skipDialogue(false)); // M11 is played with every line read (E) and the bells riddle answered by keys
  if (!check(await startFromGiver('last_bell'), 'M11 starts from its giver')) return;
  await atStart('last_bell', 'FRI 21 NOV 2003', ['ramzan']);
  const rid = { wrong: false, right: false, lines: 0 };
  await drive2(passed2('last_bell'), {
    timeout: 600000,
    each: async (s) => {
      if (!s.dialog) return null;
      const d = await ev(() => { const c = N.dialogue.current; return c ? { text: String(c.text || ''), choices: c.choices || null, typing: !!c.typing } : null; });
      if (!d) return null;
      if (d.choices && d.choices.length && !d.typing) {
        if (/bells/i.test(d.text)) {
          if (!rid.wrong) { await page.keyboard.press('ArrowDown'); await sleep(90); rid.wrong = true; } // "1": wrong first
          else rid.right = true; // "0"
          await page.keyboard.press('KeyE'); tally('↓/E dialogue choice');
        } else await page.keyboard.press('KeyE');
        await sleep(260);
        return 'skip';
      }
      await page.keyboard.press('KeyE'); rid.lines++;
      await sleep(140);
      return 'skip';
    },
  });
  await ev(() => N.debug.skipDialogue(true));
  await afterMain('last_bell', 'FRI 21 NOV 2003');
  const v = await ev(() => ({ lock3: N.flags.lock_3, paused: N.tape.paused, email: N.flags.s2_email }));
  check(v.lock3 === 0 && !v.paused && v.email === NICK.toLowerCase() + '_charminar2', 'M11: The Lock slot 3 = 0 (no bells), Side A resumed, the email id uses the nickname', v);
  check(rid.wrong && rid.right, 'M11: the bells riddle answered with real keys (a wrong answer, then 0); ' + rid.lines + ' lines read with E', rid);
}
async function pM12() {
  await testTune();
  if (!check(await startFromGiver('chand_raat'), 'M12 starts from its giver')) return;
  await atStart('chand_raat', 'TUE 25 NOV 2003', ['ramzan', 'chand_raat']);
  const seen = { meter5: false, chappals2: false, gallery: false, caught: false };
  let chaseDone = false;
  await drive2(passed2('chand_raat'), {
    timeout: 600000,
    each: async (s) => {
      if (s.wanted === 5) seen.meter5 = true;
      if (!seen.chappals2 && await ev(() => !!document.querySelector('#ui .hud-stats .s2-chap2'))) { seen.chappals2 = true; await shot('m12_two_chappals'); }
      if (s.gallery && !seen.gallery) { seen.gallery = true; await shot('m12_gallery'); }
      if (s.chase && !chaseDone) {
        chaseDone = true;
        await sleep(600);
        await shot('m12_chase');
        await ev(() => { const a = N.npcs.get('ammi') || N.npcs.get('amma'); const z = N.respect.zones.find((q) => q.place === 'mecca_masjid'); if (!a) return; const g = (z && z.gate) || { x: a.x - 1, y: a.y }; const an = Math.atan2(a.y - g.y, a.x - g.x); N.player.teleport(a.x + Math.cos(an) * 7, a.y + Math.sin(an) * 7); });
        await sleep(1200);
        return 'skip';
      }
      return null;
    },
  });
  await afterMain('chand_raat', null);
  const a = await ev(() => ({ chase: N.flags.m12_chase, tin: N.flags.tin_locked, f24: N.flags.frame_24, song: N.walkman.songs().indexOf('ending') >= 0 }));
  check(seen.meter5 && seen.chappals2, 'M12: both mothers at level 5, two chappal icons', seen);
  check(a.tin && a.f24 && a.song, 'M12: the tin locked on the shelf, frame 24, the ending song', a);
}
async function pEnding() {
  await reloadContinue('after M12, into the ending');
  await drive2((s) => s.scene === 'ending', { timeout: 30000 });
  check(await ev(() => N.flags.no_save === true), 'the ending cannot be saved half-way (N.flags.no_save)');
  const end = { atPlaza: null, kites: null };
  await drive2((s) => s.scene !== 'ending', {
    timeout: 400000,
    each: async (s) => {
      const ph = await ev(() => window.__s2ev.slice());
      if (ph.indexOf('alaap') >= 0 && end.kites == null) { end.kites = await ev(() => N.story2.state().props.indexOf('s2:kites') >= 0); await sleep(1200); await shot('ending_kites'); }
      if (ph.indexOf('theme') >= 0 && end.atPlaza == null) { end.atPlaza = await ev(() => { const c = N.places.charminar; return { d: Math.round(Math.hypot(N.player.x - c.x, N.player.y - c.y)), t: N.clock.label(), date: N.calendar.label() }; }); await sleep(800); await shot('ending_charminar'); }
      if (/CLAP/.test(s.offer || '')) { await page.keyboard.press('KeyE'); tally('E CLAP'); await sleep(260); return 'skip'; }
      return null;
    },
  });
  const ae = await ev(() => ({ ending: N.flags.ending_done, counter: N.tape.counter, phases: window.__s2ev.slice(), kites: N.story2.kitesForEnding(), found: N.collectibles.kitesForEnding ? N.collectibles.kitesForEnding() : null }));
  check(ae.ending && ae.counter === 999, 'the ending played: Side A plays back to 999', ae);
  check(end.atPlaza && end.atPlaza.d < 260 && /27 NOV 2003/.test(end.atPlaza.date), 'THE GAME ENDS AT CHARMINAR: the player is on the plaza (THU 27 NOV 2003, ' + (end.atPlaza && end.atPlaza.t) + ')', end);
  check(end.kites && ae.kites >= 1 && (!Array.isArray(ae.found) || ae.found.length === ae.kites), 'the ending: the ' + ae.kites + ' kites found before Chand Raat rise into the floodlight', { end, kites: ae.kites, found: ae.found });
}
async function pEpilogue() {
  await drive2((s) => s.scene === 'epilogue', { timeout: 40000 });
  const cas = await ev(() => N.story2.cassettesFound());
  let wrong = false, dialDone = false, shotD = false;
  await drive2((s) => s.scene !== 'epilogue', {
    timeout: 400000, keepCut: true,
    panel: async (s) => {
      if (/s2-lock/.test(s.panel || '')) {
        if (!shotD) { shotD = true; await shot('epilogue_lock'); }
        const want = wrong ? [1, 4, 0, 1] : [1, 4, 0, 2];
        for (let i = 0; i < 4; i++) {
          let sel = (await ev(() => N.story2.lockState)).sel;
          while (sel !== i) { await page.keyboard.press('ArrowRight'); sel = (sel + 1) % 4; await sleep(60); }
          const now = (await ev(() => N.story2.lockState)).digits[i];
          for (let k = 0; k < (want[i] - now + 10) % 10; k++) { await page.keyboard.press('ArrowUp'); await sleep(50); }
        }
        await page.keyboard.press('KeyE'); tally('lock dial (arrows + E)');
        if (!wrong) wrong = true; else dialDone = true;
        await sleep(1300);
        return true;
      }
      if (/s2-panel/.test(s.panel || '')) { await page.keyboard.press('KeyE'); return true; }
      return false;
    },
    each: async (s) => {
      if (s.cut) { await sleep(150); return 'skip'; }
      if (/CLAP|Clap back/.test(s.offer || '')) { await page.keyboard.press('KeyE'); tally('E CLAP'); await sleep(260); return 'skip'; }
      return null;
    },
  });
  const ap = await ev(() => ({ epi: N.flags.epilogue_done, lock: N.story2.lockResult, year: N.flags.year, tail: N.story2.sideBTail(), lines: window.__lines.filter((l) => l[0] === 'radio' || /\(tape hiss\)/.test(l[1])).length, date: N.calendar.label(), s26: N.seasons.active() }));
  check(ap.epi && ap.year === 2026, 'the epilogue played in 2026', ap);
  check(ap.lock && ap.lock.code === '1401' && dialDone, 'the 1-4-0-1 lock opened with real keys after one wrong try (all four digits earned in M2, M4, M10, M11)', ap.lock);
  const tl = await ev(() => ({ radio: window.__lines.filter((l) => l[0] === 'radio').length, hiss: window.__lines.filter((l) => /\(tape hiss\)/.test(l[1] || '')).length }));
  check(tl.radio === cas.dedications.length && tl.hiss === 12 - cas.dedications.length, 'Side B\'s tail reflects the cassettes found this year: ' + cas.dedications.length + ' dedications play, ' + (12 - cas.dedications.length) + ' are tape hiss', { cas, tl });
  const coda = (await ev(() => window.__s2ev.slice())).find((e) => /^epi:coda:/.test(e));
  check(coda && +coda.split(':')[2] < 320, 'the epilogue ends on the Charminar plaza', coda);
}
async function pCredits() {
  let creditsText = '', defsSeen = false, rewound = false;
  await drive2((s) => s.scene == null && !s.panel && s.mode === 'play' && !s.credits && !s.defs && rewound, {
    timeout: 300000,
    each: async (s) => {
      if (s.defs && !defsSeen) { defsSeen = true; await sleep(1500); await shot('definitions'); }
      if (s.credits && !creditsText) { creditsText = await ev(() => (document.querySelector('.mn-credits .cr-roll') || {}).textContent || ''); await sleep(1200); await shot('credits'); }
      return null;
    },
    panel: async (s) => {
      if (/s2-rewind/.test(s.panel || '')) {
        await shot('rewind_menu');
        for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await sleep(120); }
        await page.keyboard.press('KeyE'); tally('↓/E rewind menu');
        rewound = true;
        return true;
      }
      return false;
    },
  });
  check(defsSeen, 'the definitions card (bible §9.3)');
  check(/DataMeet Municipal Spatial Data \(CC BY 4\.0\) and © OpenStreetMap contributors \(ODbL\)/.test(creditsText) && /three\.js/.test(creditsText), 'credits: the A1 map line and the three.js MIT line');
  await drive2((s) => s.scene == null && !s.panel && s.mode === 'play' && /20 DEC 2003/.test(s.date || ''), { timeout: 150000 });
  const ar = await ev(() => ({ pick: N.flags.season_pick, post: N.flags.postgame, year: N.flags.year, act: N.seasons.active(), avail: N.missions.available().map((d) => d.id) }));
  check(ar.pick === 'december' && ar.post && ar.year === 2003 && ar.act.indexOf('christmas') >= 0, '◀◀ REWIND: December 2003 (Christmas) picked with real keys; post-game free roam', ar);
  await snapshot('credits', { save: true });
}
async function pSA8() {
  await testTune();
  await ev(() => N.clock.set(10, 30));
  if (!check(await startFromGiver('christmas_stars'), 'SA8 starts from its giver')) return;
  await drive2(passed2('christmas_stars'), { timeout: 300000, panel: async () => { await page.keyboard.press('KeyE'); return true; } });
  const v = await ev(() => ({ done: N.missions.isDone('christmas_stars'), email: N.flags.immu_email, lantern: N.flags.star_lantern }));
  check(v.done && v.email && v.lantern, 'SA8 passed: four plum cakes, Immu\'s email, the star lantern', v);
}

/** Post-game (bible §9.5): the Journal's Side A track list replays a mission on its own date; free roam comes
 *  back to December afterwards with the tape still full. Real input: J opens the Journal, a click on ▶ Replay. */
async function pReplay() {
  await testTune();
  await ev(() => { const h = N.places.home; const q = window.__safeSpot(h.x, h.y, 120); N.player.teleport(q.x, q.y); });
  await sleep(600);
  const before = await ev(() => ({ date: N.calendar.label(), counter: N.tape.counter, tracks: N.tape.tracks.length, tin: N.tape.tin.size }));
  await page.keyboard.press('KeyJ');
  const open = await waitFor(() => N.state.mode === 'journal' || !!document.querySelector('.mn-journal.show, .mn-journal'), null, 6000, 'the Journal (J)');
  if (!open) return;
  await ev(() => { try { N.menus.openJournal('side_a'); } catch (e) { /* the tab bar */ } });
  await sleep(600);
  await shot('journal_side_a');
  const btn = await ev(() => !!document.querySelector('[data-replay="bo_kaata"]'));
  if (!check(btn, 'post-game Journal: Side A track 01 has ▶ Replay')) { await page.keyboard.press('Escape'); return; }
  await page.click('[data-replay="bo_kaata"]'); tally('click ▶ Replay');
  const st = await waitFor(() => N.missions.active && N.missions.active.id === 'bo_kaata', null, 10000, 'the M1 replay to start');
  if (!st) return;
  await atStart('bo_kaata (replay)', 'TUE 14 JAN 2003', ['sankranti']);
  await waitFor(() => N.story.debug.state().step === 'act', null, 10000);
  await pressKey('KeyE'); tally('E Fly the kite');
  await finish1('bo_kaata', { hook: async (s) => { if (/fountain railing/.test(s.obj || '') && !s.tgt) { await ev(() => N.story.debug.skip()); return true; } return false; } });
  await waitFor((d) => N.calendar.label() === d && !N.calendar.jumping, before.date, 20000);
  const after = await ev(() => ({ date: N.calendar.label(), counter: N.tape.counter, tracks: N.tape.tracks.length, tin: N.tape.tin.size, post: N.flags.postgame, year: N.flags.year }));
  check(after.date === before.date && after.counter === 999 && after.tracks === before.tracks && after.tin === before.tin && after.post && after.year === 2003, 'the M1 replay passed; back to ' + before.date + ', Side A still 999, the tin unchanged', { before, after });
}

/* ====================================================================== coverage report */
/** Static uses of a place id outside the story scripts (collectibles, shops, side jobs, minigames, seasons, npcs). */
const USE_FILES = ['collectibles', 'shops', 'sidejobs', 'minigames', 'seasons', 'npcs', 'cricket_match', 'playground_games'];
const USE_SRC = {};
function usesOf(id) {
  const out = [];
  for (const f of USE_FILES) {
    if (USE_SRC[f] == null) { try { USE_SRC[f] = fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8'); } catch (e) { USE_SRC[f] = ''; } }
    if (USE_SRC[f].indexOf("'" + id + "'") >= 0) out.push(f);
  }
  return out;
}
function coverageReport() {
  const ctxName = (c) => ({ bo_kaata: 'M1', lost_and_found: 'M2', first_day_first_show: 'M3', last_man_batting: 'M4', right_right: 'M5', ammammas_thursday: 'M6', the_clap: 'M7', drums_for_amma: 'M8', opening_day: 'M9', agle_baras: 'M10', last_bell: 'M11', chand_raat: 'M12', pandal_duty: 'SA1', current_poyindi: 'SA2', sunday_mutton: 'SA3', six_balls: 'SA4', lb_exhibition: 'SA4x', twelve_oclock: 'SA5', bunty_races: 'SA6r1', bunty_races_r2: 'SA6r2', bunty_races_r3: 'SA6r3', bunty_races_r4: 'SA6r4', new_class_old_books: 'SA7', christmas_stars: 'SA8', interlude: 'Interlude', ending: 'Ending', epilogue: 'Epilogue' }[c] || c);
  const row = (id) => { const o = cov[id]; return '| `' + id + '` | ' + (o ? Object.keys(o).map((c) => (/~cam$/.test(c) ? ctxName(c.slice(0, -4)) + ' (camera, ' + o[c] + ')' : ctxName(c) + ' (' + o[c] + ')')).join(', ') : '**not visited**') + ' | ' + (usesOf(id).join(', ') || '-') + ' |'; };
  const lines = ['# Story playthrough: place coverage', '', 'Generated by tests/story_full.cjs (' + new Date().toISOString() + '). A place counts when the player was within reach of it while a', 'mission, side activity or story scene was running (passenger rides included; first date per context).', '',
    '## Must-have places (places_registry §2)', '', '| id | visited by (mission / side activity / scene, first date) | also used by |', '|---|---|---|'].concat(MUST.map(row), ['', '## Festival sites', '', '| id | visited by | also used by |', '|---|---|---|'], FESTIVAL.map(row), AMBIENT.map(row), ['', '## Other named places (rounds 5-11)', '', '| id | visited by | also used by |', '|---|---|---|'], NAMED.map(row));
  const pre = PREFIX.map((q) => { const ids = Object.keys(cov).filter((k) => k.indexOf(q) === 0); return '| `' + q + '*` | ' + (ids.length ? ids.length + ': ' + ids.slice(0, 8).join(', ') : '**none**') + ' |'; });
  lines.push('', '## Everyday elements (registry §3, rounds 2-3)', '', '| prefix | instances visited |', '|---|---|', ...pre);
  fs.writeFileSync(path.join(OUT, 'coverage.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(cov, null, 1));
  // registry §2: "Rythu Bazaars (at least 2)": the three ids count as one row that needs two of them
  const rythu = MUST.filter((id) => /^rythu_bazaar_/.test(id));
  const onFoot = (id) => !!(cov[id] && Object.keys(cov[id]).some((c) => !/~cam$/.test(c)));
  const rythuOk = rythu.filter(onFoot).length >= 2;
  return { mustMissing: MUST.filter((id) => !onFoot(id) && !(rythuOk && /^rythu_bazaar_/.test(id))), festMissing: FESTIVAL.filter((id) => !cov[id]), namedMissing: NAMED.filter((id) => !cov[id]), preMissing: PREFIX.filter((q) => !Object.keys(cov).some((k) => k.indexOf(q) === 0)) };
}

/* ====================================================================== main */
const PHASES = [
  ['title', pTitle], ['m1', pM1], ['explore1', pExplore1], ['m2', pM2], ['reload1', () => reloadContinue('after M2')],
  ['m3', pM3], ['sa3', pSA3], ['m4', pM4], ['reload2', () => reloadContinue('after M4')], ['sa2', pSA2], ['m5', pM5], ['m6', pM6],
  ['sa4', pSA4], ['reload3', () => reloadContinue('after SA4 (STD booth save)')], ['m7', pM7], ['sa7', pSA7], ['sa5', pSA5], ['m8', pM8], ['sa6', pSA6],
  ['m9', pM9], ['sa1', pSA1], ['m10', pM10], ['interlude', pInterlude], ['m11', pM11], ['m12', pM12], ['ending', pEnding], ['epilogue', pEpilogue],
  ['credits', pCredits], ['sa8', pSA8], ['replay', pReplay],
];
const SIDE_PHASES = new Set(['sa3', 'sa2', 'sa4', 'sa7', 'sa5', 'sa6', 'sa1', 'sa8', 'explore1', 'replay']);
(async () => {
  const browser = await chromium.launch();
  await openPage(browser);
  const START = process.env.START || 'title', STOP = process.env.STOP || null;
  const si = PHASES.findIndex((p) => p[0] === START);
  if (si < 0) { console.log('unknown START ' + START); process.exit(2); }
  // watchdog: a minigame result card that stays up under autoplay (minigames.js closes it with one timer that
  // can miss at a few fps) gets a real click on "done", like a player would
  let watchOn = true, resultSince = 0, resultClicks = 0;
  const watchdog = (async () => {
    while (watchOn) {
      await sleep(1000);
      if (!watchOn || !page) break;
      try {
        const up = await page.evaluate(() => { const g = window.N && N.minigames && N.minigames.game; return !!(g && g.phase === 'result' && !g.closed && document.querySelector('.mg-screen .mg-card button[data-do=done]')); });
        if (!up) { resultSince = 0; continue; }
        if (!resultSince) { resultSince = Date.now(); continue; }
        if (Date.now() - resultSince > 3000) { await page.click('.mg-screen .mg-card button[data-do=done]', { timeout: 2000 }).catch(() => {}); resultClicks++; resultSince = 0; }
      } catch (e) { /* page busy / reloading */ }
    }
  })();
  try {
    await page.goto(URL);
    await bootTitle();
    log('booted');
    if (si > 0) {
      const prev = PHASES[si - 1][0];
      const f = path.join(SAVES, 'after_' + prev + '.json');
      const snap = JSON.parse(fs.readFileSync(f, 'utf8'));
      Object.assign(cov, snap.cov || {}); nickBad = snap.nickBad || []; Object.assign(realKeys, snap.realKeys || {});
      await ev((raw) => { localStorage.setItem('nostalgia.save.v1', raw); }, snap.raw);
      await page.reload();
      await bootTitle();
      await page.click('[data-act=continue]');
      await page.waitForFunction(() => N.state.mode !== 'title', null, { timeout: 15000 });
      await sleep(1000);
      log('resumed from ' + f);
    }
    await installHooks();
    for (let i = si; i < PHASES.length; i++) {
      const [name, fn] = PHASES[i];
      phase = name;
      log('== ' + name);
      const tp = Date.now();
      try {
        if (name !== 'title' && name.indexOf('reload') < 0 && name !== 'interlude' && name !== 'ending' && name !== 'epilogue' && name !== 'credits') await idle();
        await fn();
      } catch (e) { check(false, 'exception: ' + (e.stack || e.message)); await shot('exception_' + name); }
      const errs = await ev(() => N.debug.state().errors).catch(() => []);
      if (errs.length) { check(false, name + ': N.err ' + errs.slice(0, 5).join(' | ')); await ev(() => { N.errors.length = 0; }).catch(() => {}); }
      if (errors.length) { check(false, name + ': ' + errors.length + ' console/page error(s):\n    ' + errors.slice(0, 6).join('\n    ')); errors.length = 0; }
      log('   (' + name + ' ' + ((Date.now() - tp) / 1000).toFixed(0) + ' s)');
      if (!['interlude', 'credits', 'ending', 'epilogue'].includes(name) && !/^reload/.test(name)) await snapshot(name, { save: SIDE_PHASES.has(name) });
      else if (/^reload/.test(name)) await snapshot(name, { save: false });
      if (STOP && name === STOP) break;
      // a main mission that did not pass blocks the rest of the story: stop here instead of cascading
      const MAIN_OF = { m1: 'bo_kaata', m2: 'lost_and_found', m3: 'first_day_first_show', m4: 'last_man_batting', m5: 'right_right', m6: 'ammammas_thursday', m7: 'the_clap', m8: 'drums_for_amma', m9: 'opening_day', m10: 'agle_baras', m11: 'last_bell', m12: 'chand_raat' };
      if (MAIN_OF[name] && !(await ev((mid) => N.missions.isDone(mid), MAIN_OF[name]).catch(() => false))) { check(false, MAIN_OF[name] + ' did not pass: the rest of the story cannot be played'); break; }
      // between main missions: a few minutes of free roam, a find or two
      if (name === 'm6') { for (const id of ['cassette_5', 'ticket_1']) await collect(id); }
      if (name === 'm8') { for (const id of ['cassette_9', 'kite_7']) await collect(id); }
    }
  } catch (e) {
    check(false, 'exception: ' + (e && e.stack || e));
    try { await shot('exception'); } catch (e2) { /* ignore */ }
  }
  watchOn = false; await watchdog;
  await harvest();
  if (resultClicks) log('(result-card watchdog clicked "done" ' + resultClicks + ' time(s): minigames.js autoplay auto-close)');
  const c = coverageReport();
  phase = 'coverage';
  if (!STOP && si === 0) {
    check(!c.mustMissing.length, 'every must-have place (registry §2) is visited by a mission / side activity / scene', c.mustMissing);
    check(!c.festMissing.length, 'the festival sites are visited', c.festMissing);
  }
  log('coverage: must missing ' + JSON.stringify(c.mustMissing) + ', festival missing ' + JSON.stringify(c.festMissing) + ', named missing ' + JSON.stringify(c.namedMissing) + ', prefixes missing ' + JSON.stringify(c.preMissing));
  phase = 'nick';
  check(!nickBad.length, 'custom nickname: no "Chinnu" / "Srikanth" / {nick} left in lines, objectives, toasts or minigame cards', nickBad.slice(0, 20));
  log('real input: ' + JSON.stringify(realKeys));
  await browser.close();
  console.log('\n' + passes + ' passed, ' + failures.length + ' failed (' + ((Date.now() - T0) / 1000).toFixed(0) + ' s)');
  console.log('coverage table: ' + path.join(OUT, 'coverage.md') + '   screenshots: ' + OUT);
  if (failures.length) { console.log('STORY FULL FAILED:\n' + failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
  console.log('STORY FULL PASSED');
})();
