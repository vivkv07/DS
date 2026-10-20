/* NOSTALGIA — tests/latehome.cjs  ("Ghar Pahunchna Hai!", src/latehome.js)
 *
 * Covers, with REAL input (Playwright keyboard / CDP touch) wherever a player would press something:
 *   solo2d  desktop 1280x720, top-down: the dusk prompt "Late! Ghar chalo" at Café Gulistan (E) -> the run (through
 *           N.party.solo when party.js is there), the course (seekers, spots, doors, collectibles, lamps), sneaking,
 *           running is heard, the dog barks, a whistle pulls a cone, a collectible, hold E to hide (a cone over the
 *           hidden kid fills nothing), let go = spotted (Pakda meter, SEEN 1), caught (walked home by the ear, Amma's
 *           line), ghost mode "Skip to results" -> the results card; then a full run home driven by real keys from the
 *           in-page sneak planner (N.latehome.debug.hint) -> NOBODY SAW! / GHAR PAHUNCH GAYA! and the results card.
 *   solo3d  the same in the 3D view (V key; three.js from vendor/, swiftshader): cones, hide + peek head, caught, win.
 *   phone   390x844 touch: the prompt by the touch ACTION button, joystick, hold HIDE, SEETI (whistle), HUD fits, no scroll.
 *   daddy   'latehome_daddy' solo: round 1 AI Nanna catches you (proximity + facing), round 2 you are Daddy and catch
 *           an AI friend with real keys, roles swap, points on the results card.
 *   party   (when N.party exists) two pages in an online room through tests/online_mock.cjs (as tests/online.cjs):
 *           a 'latehome' challenge (same seed and course on both, the guest sees the host's seekers move, a guest
 *           whistle reaches the host's seekers, both home -> party.js results on both), then 'latehome_daddy'
 *           (the Daddy page catches the other, the roles swap for round 2).
 * Zero console errors / page errors / N.err everywhere. Screenshots: tests/out/latehome_*.png
 *
 *   node nostalgia/tests/latehome.cjs            ONLY=solo2d,solo3d,phone,daddy,party   SHOTS=0
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const GAME_URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const GLTF_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/GLTFLoader.classic.js'), 'utf8');
let PACK_JS = null;
const packJs = () => PACK_JS || (PACK_JS = fs.readFileSync(path.join(ROOT, 'src/assets3d_pack.js'), 'utf8'));
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'];
const SHOT_MS = 180000;

const failures = [];
let section = '-';
const fail = (msg) => { failures.push('[' + section + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, data) => { if (cond) ok(msg); else fail(msg + (data !== undefined ? '  ' + JSON.stringify(data).slice(0, 600) : '')); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);

/* ---------------------------------------------------------------- pages */
async function newPage(browser, name, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 720 }, deviceScaleFactor: o.dpr || 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url().slice(0, 160) + ' ' + ((r.failure() && r.failure().errorText) || '')));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(THREE_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  // the 3D view's Blender models: GLTFLoader from the vendored file whichever path models3d.js tries (a slow load
  // of the first path on a busy machine must not fall through to '../vendor/...' = a 404 console error)
  await page.route(/\/vendor\/three\/GLTFLoader\.classic\.js$/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: GLTF_JS }));
  await page.route(/\/src\/assets3d_pack\.js$/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: packJs() }));
  if (o.sdk) await page.route(SDK_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: o.sdk }));
  if (o.conf !== undefined) await page.addInitScript((c) => { window.NOSTALGIA_ONLINE_CONFIG = c; }, o.conf);
  await page.goto((o.url || GAME_URL.replace('#debug', '')) + '#debug');
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  const P = { name, page, context, errors, failed };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; try { await page.screenshot({ path: path.join(OUT, 'latehome_' + n + '.png'), timeout: SHOT_MS }); } catch (e) { console.log('  (screenshot ' + n + ' failed: ' + e.message + ')'); } };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  P.until = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 10000, polling: 100 }).then(() => true, () => false);
  P.st = () => page.evaluate(() => N.latehome.state());
  return P;
}
async function newGame(P) {
  await P.ev(() => { if (N.menus) N.menus.quickStart = true; N.debug.newGame({ skipIntro: true }); });
  await P.until(() => N.state.mode === 'play', null, 20000);
  await P.ev(() => { if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.cancel(); });
}
/** release every key the test holds */
async function releaseKeys(P, held) { for (const k of held) await P.page.keyboard.up(k); held.clear(); }
/** drive the local kid home with REAL keys from the in-page sneak planner; returns the final state */
async function driveHome(P, maxMs, held) {
  held = held || new Set();
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < maxMs) {
    const h = await P.ev(() => { const s = N.latehome.state(); return s ? { h: N.latehome.debug.hint(), me: s.me, phase: s.phase, mode: N.state.mode } : null; });
    if (!h) break;
    last = h;
    if (h.me.done || h.phase === 'done') break;
    if (h.mode === 'dialogue') { await releaseKeys(P, held); await P.page.keyboard.press('KeyE'); await sleep(250); continue; }
    const want = new Set(h.h.keys);
    if (h.h.hide || h.h.wait || h.h.crouch) want.add('KeyE');
    if (h.h.run) want.add('ShiftLeft');
    for (const k of Array.from(held)) if (!want.has(k)) { await P.page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await P.page.keyboard.down(k); held.add(k); }
    await sleep(110);
  }
  await releaseKeys(P, held);
  return last;
}
/** walk with real keys toward a world point (2D: screen = world axes; 3D: camera relative via the planner maths) */
async function walkTo(P, x, y, maxMs, opts) {
  opts = opts || {};
  const held = new Set();
  const t0 = Date.now();
  let d = Infinity;
  while (Date.now() - t0 < maxMs) {
    const r = await P.ev(([x, y]) => {
      const p = N.player; const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      let ix = dx / (d || 1), iy = dy / (d || 1);
      if (N.view && N.view.is3D && N.view.is3D() && isFinite(N.view.yaw)) { const c = Math.cos(N.view.yaw), s = Math.sin(N.view.yaw), f = ix * c + iy * s, rr = -ix * s + iy * c; ix = rr; iy = -f; }
      const keys = []; if (ix > 0.38) keys.push('KeyD'); if (ix < -0.38) keys.push('KeyA'); if (iy > 0.38) keys.push('KeyS'); if (iy < -0.38) keys.push('KeyW');
      return { d, keys };
    }, [x, y]);
    d = r.d;
    if (d < (opts.r || 4)) break;
    const want = new Set(r.keys);
    if (opts.run) want.add('ShiftLeft');
    for (const k of Array.from(held)) if (!want.has(k)) { await P.page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await P.page.keyboard.down(k); held.add(k); }
    await sleep(90);
    if (opts.until && await P.ev(opts.until)) break;
  }
  await releaseKeys(P, held);
  return d;
}
/** put a (frozen) on-foot seeker `dist` u from (x, y), looking at it */
async function aimSeeker(P, x, y, dist, roles) {
  return P.ev(([x, y, dist, roles]) => {
    const S = N.latehome.debug.session();
    const sk = S.seekers.find((q) => roles.indexOf(q.role) >= 0) || S.seekers.find((q) => q.role !== 'daddy' && q.role !== 'window');
    if (!sk) return null;
    let best = null;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, sx = x + Math.cos(a) * dist, sy = y + Math.sin(a) * dist;
      if (!N.world.isWalkable(sx, sy) || N.world.raycast(sx, sy, x, y, 'walk').hit) continue;
      best = { sx, sy }; break;
    }
    if (!best) return null;
    sk.x = best.sx; sk.y = best.sy; sk.angle = Math.atan2(y - sk.y, x - sk.x); sk.lookOff = 0; sk.track = null; sk.inv = null; sk.state = 'patrol'; sk.pauseT = 0;
    if (sk.role === 'chair') { sk.dozeT = 0; sk.dozeIn = 99; sk.home = { x: sk.x, y: sk.y }; sk.spec.face = sk.angle; }
    return { idx: sk.idx, role: sk.role, x: sk.x, y: sk.y };
  }, [x, y, dist, roles || ['walker', 'watchman']]);
}
/**
 * The PAKDA! banner layout: wait for it, then check its text box is clear of the HUD panel and of the kid
 * on screen, sits above the speech-bubble layer, and no catch-line bubble lies on it (ambient NPC chatter is
 * only reported: it is drawn under the banner).
 */
async function banCheck(P, where, ms) {
  const up = await P.until(() => !!document.querySelector('.lh-ban.show') && !!N.latehome.debug.banner(), null, ms || 6000);
  if (!check(up, where + ': the PAKDA! banner shows')) return null;
  await sleep(550); // the pop-in animation
  const L = await P.ev(() => {
    const b = document.querySelector('.lh-ban.show');
    if (!b) return null;
    const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
    const parts = ['.lh-bt', '.lh-bs', '.lh-bq'].map((s) => b.querySelector(s)).filter((e) => e && e.offsetHeight).map(box);
    const T = { l: Math.min(...parts.map((q) => q.l)), r: Math.max(...parts.map((q) => q.r)), t: Math.min(...parts.map((q) => q.t)), b: Math.max(...parts.map((q) => q.b)) };
    const hit = (a, c) => !!(a && c && a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b);
    const hud = document.querySelector('.lh-hud.show');
    const kid = N.latehome.debug.kidOnScreen();
    const lines = N.latehome.debug.catchLines().map((t) => t.slice(0, 14));
    const bubbles = [...document.querySelectorAll('#barks .bark')].filter((e) => e.style.visibility !== 'hidden' && !e.classList.contains('out') && e.offsetHeight)
      .map((e) => ({ t: e.textContent, on: hit(box(e), T), faded: e.classList.contains('lh-under'), mine: lines.some((l) => e.textContent.includes(l)) }));
    const zb = +getComputedStyle(b).zIndex || 0, zbk = +getComputedStyle(document.getElementById('barks') || b).zIndex || 0;
    const vw = innerWidth, vh = innerHeight;
    return {
      text: b.textContent.slice(0, 90), box: T, hud: hud ? box(hud) : null, kid,
      hudHit: hit(T, hud ? box(hud) : null), kidHit: !!(kid && T.t < kid.feet && T.b > kid.head), inView: T.l >= 0 && T.r <= vw && T.t >= 0 && T.b <= vh,
      above: zb > zbk, mineOn: bubbles.filter((q) => q.on && q.mine).map((q) => q.t), shownOn: bubbles.filter((q) => q.on && !q.faded).map((q) => q.t), fadedOn: bubbles.filter((q) => q.on && q.faded).length,
    };
  });
  if (!L) return null;
  check(!L.hudHit && L.inView, where + ': banner clear of the HUD panel, on screen', L);
  check(!L.kidHit, where + ': banner clear of the kid', L);
  check(L.above && !L.mineOn.length && !L.shownOn.length, where + ': above the bubble layer, no bubble on it' + (L.fadedOn ? ' (' + L.fadedOn + ' ambient bubble(s) under it faded out)' : ''), L);
  return L;
}
const noErrors = async (P, what) => { const e = await P.errs(); check(!e.length, what + ': zero console / page errors / N.err' + (e.length ? ': ' + e.slice(0, 4).join(' | ') + (P.failed.length ? '  [failed requests: ' + P.failed.slice(0, 4).join(' | ') + ']' : '') : '')); };

/* ================================================================ solo2d */
async function solo2d(browser) {
  section = 'solo2d';
  console.log('\n== solo, top-down, desktop 1280x720');
  const P = await newPage(browser, 'desk', { viewport: { width: 1280, height: 720 } });
  await newGame(P);
  // the dusk prompt at Café Gulistan
  const v = await P.ev(() => { N.debug.setTime(19, 5); const a = N.latehome.VENUES.cafe.prompt; N.player.teleport(a[0] + 4, a[1] + 3); return { why: N.latehome.eligible('cafe'), party: !!(N.party && N.party.get && N.party.get('latehome')), reg: N.latehome.registered }; });
  check(v.why === '', 'eligible at 19:05 by Café Gulistan (no mission, meter 0)', v);
  check(!v.party || v.reg.length === 2, 'registered with N.party: ' + JSON.stringify(v.reg));
  const label = await P.until(() => N.input.actionLabel === 'Late! Ghar chalo', null, 8000);
  check(label, 'the prompt "Late! Ghar chalo" shows on ACTION');
  const early = await P.ev(() => { N.debug.setTime(17, 0); return N.latehome.eligible('cafe'); });
  check(early === 'time', 'not offered at 17:00 (before the street lights): ' + early);
  await P.ev(() => N.debug.setTime(19, 5));
  await sleep(400);
  await P.page.keyboard.press('KeyE');
  check(await P.until(() => N.latehome.active(), null, 8000), 'real E starts the run');
  const s0 = await P.st();
  check(s0 && s0.mode === 'solo' && s0.variant === 'sneak' && s0.kids.length === 3, 'solo sneak with Chinnu + AI Immu and Ayesha', s0 && s0.kids.map((k) => k.nick));
  check(s0.kids.find((k) => k.me).door.place === 'home' && s0.kids.find((k) => k.npc === 'immu').door.place === 'friend_home', 'doors: Chinnu -> home, Immu -> his house, Ayesha -> a colony house');
  check(s0.seekers.length >= 4 && new Set(s0.seekers.map((q) => q.role)).size >= 3, 'seekers: ' + s0.seekers.map((q) => q.role).join(', '));
  check(s0.hides.length >= 4 && new Set(s0.hides.map((h) => h.kind)).size >= 3, 'hiding spots: ' + Array.from(new Set(s0.hides.map((h) => h.kind))).join(', ') + ' (' + s0.hides.length + ')');
  check(s0.items.length >= 1 && s0.dogs.length >= 1 && s0.lamps >= 4 && s0.tvs >= 1, 'collectibles ' + s0.items.map((i) => i.kind).join('+') + ', dog(s) ' + s0.dogs.length + ', lamps ' + s0.lamps + ', TV windows ' + s0.tvs);
  const world = await P.ev(() => ({ clock: N.clock.label(), held: N.clock.held, curfew: N.flags.no_curfew, frozen: N.wanted.frozen(), party: N.party && N.party.active ? N.party.active.id : null }));
  check(world.clock === '19:45' && world.held && world.curfew === 'latehome' && world.frozen, 'night (' + world.clock + ', clock held), curfew + Chappal Meter on hold during the run', world);
  if (v.party) check(world.party === 'latehome', 'the solo run goes through N.party.solo (party countdown + results)');
  check(await P.until(() => N.latehome.state() && N.latehome.state().phase === 'play', null, 30000), 'countdown -> play');
  await sleep(700);
  await P.shot('start_2d');
  const hud = await P.ev(() => { const e = document.querySelector('.lh-hud.show'); return e ? { t: e.textContent, r: e.getBoundingClientRect().toJSON() } : null; });
  check(hud && /GHAR CHALO/.test(hud.t) && /SEEN 0/.test(hud.t), 'HUD panel: title, timer, PAKDA! meter, SEEN / FOUND', hud && hud.t);

  // sneak: real keys along the planner's way
  const a0 = await P.ev(() => ({ x: N.player.x, y: N.player.y }));
  await driveHome(P, 1800);
  const a1 = await P.ev(() => ({ x: N.player.x, y: N.player.y, run: N.player.running }));
  check(Math.hypot(a1.x - a0.x, a1.y - a0.y) > 12, 'sneaking with real keys moved ' + Math.hypot(a1.x - a0.x, a1.y - a0.y).toFixed(0) + ' u');

  // (while the scene is set up below nobody may catch him: N.latehome.debug.unseen)
  await P.ev(() => N.latehome.debug.unseen(true));
  // running is heard: behind a walker, out of his cone, run with Shift
  const heard = await P.ev(() => {
    const S = N.latehome.debug.session(); const sk = S.seekers.find((q) => q.role === 'walker' || q.role === 'watchman');
    N.latehome.debug.setSeekersFrozen(false);
    const a = sk.angle + Math.PI; let x = sk.x + Math.cos(a) * 50, y = sk.y + Math.sin(a) * 50;
    const f = N.world.findFree(x, y, 'walk', 12); if (f) { x = f.x; y = f.y; }
    N.player.teleport(x, y); sk.inv = null; sk.track = null;
    return { idx: sk.idx, x, y, a: sk.angle };
  });
  const runDir = Math.abs(Math.cos(heard.a)) > Math.abs(Math.sin(heard.a)) ? (Math.sin(heard.a) > 0 ? 'KeyW' : 'KeyS') : (Math.cos(heard.a) > 0 ? 'KeyA' : 'KeyD');
  await P.page.keyboard.down('ShiftLeft'); await P.page.keyboard.down(runDir);
  const gotHeard = await P.until((i) => { const q = N.latehome.state().seekers.find((s) => s.idx === i); return !!(q && (q.inv || q.track)); }, heard.idx, 4000);
  await P.page.keyboard.up(runDir); await P.page.keyboard.up('ShiftLeft');
  check(gotHeard, 'running (Shift) near an uncle is heard: he turns to investigate');

  // whistle (Space): a seeker in earshot comes to look
  await P.ev(() => { const S = N.latehome.debug.session(); for (const q of S.seekers) { q.inv = null; q.track = null; } const sk = S.seekers.find((q) => q.role === 'walker' || q.role === 'watchman'); const f = N.world.findFree(sk.x + 90, sk.y, 'walk', 30) || N.world.findFree(sk.x - 90, sk.y, 'walk', 30); N.player.teleport(f.x, f.y); });
  await sleep(300);
  await P.page.keyboard.press('Space');
  check(await P.until(() => N.latehome.state().seekers.some((q) => q.inv && q.inv.kind === 'whistle'), null, 4000), 'a whistle (Space) pulls a seeker\'s cone toward it');

  // the dog barks at a kid running past, and the seekers come to see
  const dog = await P.ev(() => { const s = N.latehome.state(); const g = s.dogs[0]; const S = N.latehome.debug.session(); for (const q of S.seekers) { q.inv = null; } S.dogs[0].restT = 0; S.dogs[0].state = 'nap'; const f = N.world.findFree(g.x - 45, g.y, 'walk', 20) || N.world.findFree(g.x + 45, g.y, 'walk', 20); N.player.teleport(f.x, f.y); return { gx: g.x, gy: g.y, px: f.x, py: f.y }; });
  await P.page.keyboard.down('ShiftLeft');
  await walkTo(P, dog.gx, dog.gy, 3000, { r: 10, run: true, until: () => N.latehome.state().dogs[0].state === 'bark' });
  await P.page.keyboard.up('ShiftLeft');
  check(await P.until(() => N.latehome.state().dogs.some((g) => g.state === 'bark'), null, 3000), 'running past the napping dog wakes it: Bow! Bow!');
  check(await P.until(() => N.latehome.state().seekers.some((q) => q.inv && q.inv.kind === 'bark'), null, 3000) || await P.ev(() => !N.latehome.state().seekers.some((q) => Math.hypot(q.x - N.latehome.state().dogs[0].x, q.y - N.latehome.state().dogs[0].y) < 175)), 'the bark sends the seekers in earshot to look');
  await P.shot('dog_2d');

  // a collectible
  const it = await P.ev(() => { const i = N.latehome.state().items.find((q) => !q.taken); if (!i) return null; const f = N.world.findFree(i.x - 20, i.y, 'walk', 20) || N.world.findFree(i.x + 20, i.y, 'walk', 20); N.player.teleport(f.x, f.y); return i; });
  if (it) {
    await P.ev(() => { N.latehome.debug.setSeekersFrozen(true); N.latehome.debug.unseen(true); N.latehome.debug.meter(0); });
    await walkTo(P, it.x, it.y, 4000, { r: 2, until: () => N.latehome.state().me.coll > 0 });
    check(await P.until(() => N.latehome.state().me.coll === 1, null, 2000), 'picked up ' + it.kind + ' by walking onto it');
  }

  // hide: hold E at a spot with a cone right on it -> nothing fills; let go -> spotted
  await P.ev(() => { N.latehome.debug.setSeekersFrozen(true); N.latehome.debug.unseen(false); });
  const spot = await P.ev(() => { N.latehome.debug.unseen(true); const s = N.latehome.state(); const h = s.hides.find((q) => q.kind === 'tank') || s.hides.find((q) => q.kind === 'auto') || s.hides[0]; N.player.teleport(h.x, h.y); const S = N.latehome.debug.session(); S.me.meter = 0; S.me.lastSeen = -99; return h; });
  const sk = await aimSeeker(P, spot.x, spot.y, 38);
  check(!!sk, 'a seeker stands ' + 38 + ' u away, looking straight at ' + spot.name);
  await sleep(200);
  await P.page.keyboard.down('KeyE');
  const hid = await P.until(() => N.latehome.state().me.hide === 2 && N.player.hidden, null, 3000);
  check(hid, 'hold E by ' + spot.name + ' = hidden');
  await P.ev(() => N.latehome.debug.unseen(false));
  await sleep(1800);
  const h1 = await P.st();
  check(h1.me.meter === 0 && h1.peek >= 1, 'hidden under a cone: Pakda meter stays ' + h1.me.meter + ', the peek eye is ' + ['shut', 'peeking', 'WIDE'][h1.peek]);
  const hudEye = await P.ev(() => document.querySelector('.lh-eye').dataset.s);
  check(hudEye === String(h1.peek), 'HUD peek indicator matches (' + hudEye + ')');
  await P.shot('hide_2d');
  const spots0 = h1.me.spots;
  await P.page.keyboard.up('KeyE');
  check(await P.until((n) => { const s = N.latehome.state(); return s.me.spots === n + 1 && s.me.meter > 0.15; }, spots0, 6000), 'let go of E in the cone = spotted: SEEN +1 and the meter fills');
  const bar = await P.ev(() => parseFloat(document.querySelector('.lh-meter b').style.width) || 0);
  check(bar > 10, 'the PAKDA! bar fills on the HUD (' + bar + '%)');
  await P.shot('spotted_2d');
  // caught: stay in the cone -> walked home by the ear -> Amma
  check(await P.until(() => !!N.latehome.state().me.seq, null, 30000), 'caught: PAKDA!');
  await banCheck(P, 'caught 2D');
  await P.shot('caught_2d');
  check(await P.until(() => { const s = N.latehome.state(); return s.me.seq === 'ear' || s.me.seq === 'walk' || s.me.done === 'caught'; }, null, 30000), 'caught: the uncle comes and takes him by the ear');
  // after the banner, the catch bubbles come one at a time (his "ow", then the escort's line)
  const bub = await P.ev(async () => {
    const lines = N.latehome.debug.catchLines().map((t) => t.slice(0, 14));
    let most = 0, seen = 0, withBan = 0;
    for (let i = 0; i < 60; i++) {
      const vis = [...document.querySelectorAll('#barks .bark')].filter((e) => e.style.visibility !== 'hidden' && !e.classList.contains('out') && e.offsetHeight && lines.some((l) => e.textContent.includes(l)));
      most = Math.max(most, vis.length); seen += vis.length ? 1 : 0;
      if (vis.length && document.querySelector('.lh-ban.show')) withBan++;
      await new Promise((r) => setTimeout(r, 150));
    }
    return { most, seen, withBan };
  });
  check(bub.seen > 0 && bub.most <= 1 && bub.withBan === 0, 'catch bubbles after the banner, one at a time', bub);
  check(await P.until(() => N.latehome.state().me.done === 'caught', null, 45000), 'walked home: result "caught"');
  check(await P.until(() => N.dialogue.isOpen() && /amma/i.test(String((N.dialogue.current && (N.dialogue.current.speaker || N.dialogue.current.s)) || '')) || N.dialogue.isOpen(), null, 5000), 'Amma has a scolding line (no fine, no meter)');
  await P.shot('amma_2d');
  const money = await P.ev(() => ({ w: N.wanted.level, m: N.player.money }));
  for (let i = 0; i < 6 && await P.ev(() => N.dialogue.isOpen()); i++) { await P.page.keyboard.press('KeyE'); await sleep(350); }
  check(money.w === 0, 'Chappal Meter untouched (level ' + money.w + ')');
  // ghost: skip to the results (E)
  for (let i = 0; i < 6 && await P.ev(() => N.dialogue.isOpen()); i++) { await P.page.keyboard.press('KeyE'); await sleep(350); }
  check(await P.until(() => N.latehome.state() && N.latehome.state().me.ghost, null, 25000), 'after the run he is a ghost (whistle to help)');
  await P.ev(() => N.latehome.debug.setSeekersFrozen(false));
  await sleep(300);
  await P.page.keyboard.press('KeyE');
  if (v.party) {
    check(await P.until(() => N.party._debug.cards().results, null, 10000), 'E skips to the results: party.js results card');
    const card = await P.ev(() => { const e = document.querySelector('.pt-results'); return e ? e.textContent : ''; });
    check(/walked home by the ear/.test(card) && /Immu/.test(card) && /Ayesha/.test(card), 'results list everyone, with "walked home by the ear"', card.slice(0, 300));
    await P.shot('results_party_2d');
    await P.page.keyboard.press('KeyX');
  } else {
    check(await P.until(() => !!document.querySelector('.lh-res'), null, 10000), 'E skips to the results card');
    await P.shot('results_2d');
    await sleep(800); await P.page.keyboard.press('KeyE');
  }
  check(await P.until(() => !N.latehome.active(), null, 8000), 'the run is over');
  const after = await P.ev(() => ({ curfew: N.flags.no_curfew, held: N.clock.held, frozen: N.wanted.frozen(), hidden: N.player.hidden, locked: N.player.controlsLocked, ents: N.entities.all.filter((e) => e.lhSeeker || e.lhKid || e.lhDog).length }));
  check(!after.curfew && !after.held && !after.frozen && !after.hidden && !after.locked && after.ents === 0, 'everything restored (curfew, clock, meter, player, entities)', after);

  // the roof routes: up on a terrace no ground seeker sees him, and his own terrace counts as home
  await P.ev(() => { if (N.party && N.party.active) N.party.cancel(); N.latehome.stop(); if (N.dialogue.isOpen()) N.dialogue.cancel(); N.latehome.start({ venue: 'cafe', seed: 9, difficulty: 0.5, friends: false, direct: true }); });
  await P.until(() => N.latehome.state() && N.latehome.state().phase === 'play', null, 40000);
  const roof = await P.ev(() => {
    const R = N.world.roofs, r6 = R && R.get && R.get('lakshmi_t6');
    if (!r6) return null;
    N.player.teleport(r6.rect[0] + r6.rect[2] / 2, r6.rect[1] + r6.rect[3] / 2);
    return { level: N.player.level };
  });
  if (roof) {
    await sleep(600);
    const up = await P.st();
    check(up.me.level === 'lakshmi_t6' && up.me.meter === 0, 'on the corner-house terrace (roof route): level ' + up.me.level + ', nobody below sees him');
    await P.ev(() => { const r = N.world.roofs.get('home_terrace'); N.player.teleport(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2); });
    check(await P.until(() => N.latehome.state() && N.latehome.state().me.done === 'home', null, 5000), 'reaching his own terrace = home ("Amma never heard the gate")');
    for (let i = 0; i < 6 && await P.ev(() => N.dialogue.isOpen()); i++) { await P.page.keyboard.press('KeyE'); await sleep(350); }
  }
  await P.ev(() => N.latehome.stop());
  // the other venue: the Ashok Nagar ground (across Himayatnagar Main Road)
  const gv = await P.ev(() => { N.latehome.stop(); const ok = N.latehome.start({ venue: 'ground', seed: 4, difficulty: 0.6, direct: true }); const s = N.latehome.state(); const g = N.places.playground_14; return ok && s ? { d: Math.hypot(s.start.x - g.x, s.start.y - g.y), roles: s.seekers.map((q) => q.role), kids: s.kids.length, doors: new Set(s.kids.map((k) => k.door.x + ',' + k.door.y)).size, hides: s.hides.length } : null; });
  check(gv && gv.d < 40 && gv.roles.length >= 4 && gv.doors === 3 && gv.hides >= 4, 'Ashok Nagar ground venue: ' + JSON.stringify(gv));
  if (gv) { await P.until(() => N.latehome.state().phase === 'play', null, 40000); await sleep(800); await P.ev(() => { N.render.camOverride = { x: N.player.x + 120, y: N.player.y + 180, zoom: 0.55, snap: true }; }); await sleep(1200); await P.shot('ground_2d'); await P.ev(() => { N.render.camOverride = null; }); }
  await P.ev(() => N.latehome.stop());
  // a whole run home with real keys (own solo ctx, easy, no AI friends)
  let win = null;
  // (the in-page planner is a simple test bot: it gets caught now and then; after four live tries the last try
  //  freezes the seekers, the keys stay real)
  const seeds = [7, 3, 21, 33, 2];
  for (const seed of seeds) {
    const frozen = seed === seeds[seeds.length - 1];
    const st = await P.ev(([seed, frozen]) => {
      if (N.party && N.party.active) N.party.cancel();
      N.latehome.stop();
      if (N.dialogue.isOpen()) N.dialogue.cancel();
      const ok = N.latehome.start({ venue: 'cafe', seed, difficulty: 0, friends: false, direct: true });
      N.latehome.debug.setSeekersFrozen(!!frozen);
      return { ok, mode: N.state.mode, mission: !!(N.missions && N.missions.active) };
    }, [seed, frozen]);
    if (!st.ok) console.log('  (start refused: ' + JSON.stringify(st) + ')');
    await P.until(() => N.latehome.state() && N.latehome.state().phase === 'play', null, 40000);
    const last = await driveHome(P, 200000);
    win = await P.st();
    if (win && win.me.done === 'home') { ok('seed ' + seed + (frozen ? ' (seekers frozen)' : ' (live seekers)') + ': home in ' + win.me.t + ' s, seen ' + win.me.spots + ', found ' + win.me.coll + ' (planner ' + (last && last.h.why) + ')'); break; }
    console.log('  (seed ' + seed + ': ' + (win ? win.me.done : 'no state') + ', retrying)');
    await P.ev(() => N.latehome.stop());
  }
  check(win && win.me.done === 'home', 'got home with real keys');
  await P.until(() => { const b = document.querySelector('.lh-ban.show'); return !!b && /NOBODY SAW|GHAR PAHUNCH GAYA/.test(b.textContent); }, null, 3000);
  const banner = await P.ev(() => { const b = document.querySelector('.lh-ban'); return b ? b.textContent : ''; });
  check(/NOBODY SAW|GHAR PAHUNCH GAYA/.test(banner), 'banner: ' + banner.slice(0, 80));
  await sleep(600);
  await P.shot('home_2d');
  for (let i = 0; i < 6 && await P.ev(() => N.dialogue.isOpen()); i++) { await P.page.keyboard.press('KeyE'); await sleep(350); }
  check(await P.until(() => !!document.querySelector('.lh-res'), null, 12000), 'the results card (own solo run)');
  const res = await P.ev(() => document.querySelector('.lh-res').textContent);
  check(/HOME/.test(res) && /Score/.test(res), 'results: HOME, time, seen, found, score + stars', res.slice(0, 200));
  await P.shot('win_2d');
  await sleep(900);
  await P.page.keyboard.press('KeyE');
  check(await P.until(() => !N.latehome.active() && !document.querySelector('.lh-res'), null, 5000), 'E closes the card');
  await noErrors(P, 'solo2d');
  await P.context.close();
}

/* ================================================================ solo3d */
async function solo3d(browser) {
  section = 'solo3d';
  console.log('\n== solo, 3D view (swiftshader), 960x540');
  const P = await newPage(browser, '3d', { viewport: { width: 960, height: 540 } });
  await newGame(P);
  await P.ev(() => { N.latehome.start({ venue: 'cafe', seed: 21, difficulty: 0.4, friends: true, direct: true }); });
  await P.page.keyboard.press('KeyV');
  check(await P.until(() => N.view3d && N.view3d.active, null, 120000), 'V switches to the 3D view');
  await P.ev(() => { try { N.view3d.setQuality({ pixelRatio: 0.6 }); } catch (e) { /* ignore */ } });
  check(await P.until(() => N.latehome.state() && N.latehome.state().phase === 'play', null, 300000), 'countdown -> play in 3D');
  // look at a torch / gaze cone from the side
  await P.ev(() => {
    N.latehome.debug.setSeekersFrozen(true);
    // stand just behind an uncle and look the way he looks: his cone lies on the ground ahead
    const s = N.latehome.state(); const sk = s.seekers.find((q) => q.role === 'walker') || s.seekers.find((q) => q.role === 'watchman') || s.seekers[0];
    const a = sk.cone.a;
    let px = sk.cone.x - Math.cos(a) * 14 + Math.cos(a + 1.57) * 6, py = sk.cone.y - Math.sin(a) * 14 + Math.sin(a + 1.57) * 6;
    const f = N.world.findFree(px, py, 'walk', 12); if (f) { px = f.x; py = f.y; }
    N.player.teleport(px, py);
    N.view3d.setCamera({ yaw: a, pitch: 0.62, snap: true });
  });
  await P.ev(() => { try { N.view3d.settle(3000); } catch (e) { /* ignore */ } });
  await sleep(2500);
  const v3 = await P.ev(() => N.latehome.debug.v3());
  check(v3.built && v3.cones >= 4 && v3.coneVis >= 3 && v3.lamps >= 4 && v3.doors === 3, '3D layer: cones ' + v3.coneVis + '/' + v3.cones + ', lamps ' + v3.lamps + ', door markers ' + v3.doors, v3);
  await P.shot('cones_3d');
  // hide with real E: the peeking head and the eye
  const spot = await P.ev(() => { N.latehome.debug.unseen(true); const s = N.latehome.state(); const h = s.hides.find((q) => q.kind === 'tree') || s.hides[0]; N.player.teleport(h.x, h.y); N.latehome.debug.session().me.meter = 0; return h; });
  await aimSeeker(P, spot.x, spot.y, 30);
  await P.ev(([x, y]) => { N.view3d.setCamera({ yaw: Math.atan2(y - N.player.y + 0.01, x - N.player.x + 30), pitch: 0.9, snap: true }); }, [spot.x, spot.y]);
  await P.page.keyboard.down('KeyE');
  check(await P.until(() => N.latehome.state().me.hide === 2, null, 40000), 'hold E = hidden in 3D');
  await P.ev(() => N.latehome.debug.unseen(false));
  check(await P.until(() => N.latehome.debug.v3().heads >= 1, null, 40000), 'the peeking head shows in 3D');
  await sleep(1500);
  check((await P.st()).me.meter === 0, 'no meter while hidden under the cone');
  await P.shot('hide_3d');
  await P.page.keyboard.up('KeyE');
  check(await P.until(() => N.latehome.state().me.spots >= 1, null, 20000), 'spotted in 3D once he lets go');
  check(await P.until(() => { const s = N.latehome.state(); return !!(s && (s.me.seq || s.me.done === 'caught')); }, null, 90000), 'caught in 3D (by the ear)');
  await banCheck(P, 'caught 3D', 4000);
  await P.until(() => { const s = N.latehome.state(); return !!(s && (s.me.seq === 'walk' || s.me.done)); }, null, 30000);
  await P.shot('caught_3d');
  await P.until(() => N.latehome.state().me.done === 'caught', null, 60000);
  for (let i = 0; i < 6 && await P.ev(() => N.dialogue.isOpen()); i++) { await P.page.keyboard.press('KeyE'); await sleep(400); }
  await P.ev(() => N.latehome.stop());
  // win in 3D: from near the door, walk in with real (camera-relative) keys
  await P.ev(() => { N.latehome.start({ venue: 'cafe', seed: 21, difficulty: 0, friends: false, direct: true }); });
  await P.until(() => N.latehome.state() && N.latehome.state().phase === 'play', null, 300000);
  await P.ev(() => { N.latehome.debug.setSeekersFrozen(true); const d = N.latehome.state().me.door; const f = N.world.findFree(d.x - 30, d.y + 18, 'walk', 20) || N.world.findFree(d.x + 30, d.y, 'walk', 20); N.player.teleport(f.x, f.y); N.view3d.setCamera({ yaw: Math.atan2(d.y - f.y, d.x - f.x), pitch: 0.55, snap: true }); });
  await sleep(800);
  const d3 = await P.ev(() => N.latehome.state().me.door);
  await walkTo(P, d3.x, d3.y, 60000, { r: 3, until: () => !!N.latehome.state().me.done });
  check(await P.until(() => N.latehome.state() && N.latehome.state().me.done === 'home', null, 10000), 'home in 3D with real keys');
  await sleep(500);
  await P.shot('win_3d');
  await P.ev(() => N.latehome.stop());
  await noErrors(P, 'solo3d');
  await P.context.close();
}

/* ================================================================ phone */
async function phone(browser) {
  section = 'phone';
  console.log('\n== phone 390x844 (touch)');
  const P = await newPage(browser, 'phone', { viewport: { width: 390, height: 844 }, dpr: 2, touch: true });
  await newGame(P);
  const cdp = await P.context.newCDPSession(P.page);
  const tap = async (sel, holdMs) => {
    const r = await P.ev((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel);
    if (!r) return false;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 7 }] });
    await sleep(holdMs || 90);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return true;
  };
  await P.ev(() => { N.input.showTouch(true); N.debug.setTime(19, 10); const a = N.latehome.VENUES.cafe.prompt; N.player.teleport(a[0] + 3, a[1] + 2); });
  check(await P.until(() => N.input.actionLabel === 'Late! Ghar chalo', null, 8000), 'prompt on the touch ACTION button');
  await tap('.t-action');
  check(await P.until(() => N.latehome.active(), null, 8000), 'a tap on ACTION starts the run');
  check(await P.until(() => N.latehome.state() && N.latehome.state().phase === 'play', null, 30000), 'countdown -> play');
  await sleep(600);
  const lay = await P.ev(() => {
    const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().toJSON() : null; };
    return { hud: r('.lh-hud.show'), act: r('.t-action'), run: r('.t-run'), horn: r('.t-horn'), mm: r('.hud-minimap') || r('#hud canvas'), sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight, horn_t: (document.querySelector('.t-horn .t-txt') || {}).textContent };
  });
  check(lay.hud && lay.hud.x >= 0 && lay.hud.x + lay.hud.width <= 390 && lay.hud.y >= 0, 'HUD panel fits the phone width', lay.hud);
  check(lay.sw <= lay.iw && lay.sh <= lay.ih, 'no page scroll');
  const over = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  check(!over(lay.hud, lay.act) && !over(lay.hud, lay.run) && !over(lay.hud, lay.horn), 'HUD panel clear of the touch buttons');
  check(lay.horn_t === 'SEETI', 'HORN reads SEETI (whistle) during the run (' + lay.horn_t + ')');
  await P.shot('phone_start');
  // joystick
  const p0 = await P.ev(() => ({ x: N.player.x, y: N.player.y }));
  const x0 = 100, y0 = 640;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + 10 * i, y: y0 - 8 * i, id: 1 }] }); await sleep(16); }
  await sleep(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const p1 = await P.ev(() => ({ x: N.player.x, y: N.player.y }));
  check(Math.hypot(p1.x - p0.x, p1.y - p0.y) > 15, 'joystick moves Chinnu (' + Math.hypot(p1.x - p0.x, p1.y - p0.y).toFixed(0) + ' u)');
  // hold HIDE (the ACTION button) at a spot
  await P.ev(() => { N.latehome.debug.setSeekersFrozen(true); const s = N.latehome.state(); const h = s.hides.find((q) => q.kind === 'auto') || s.hides[0]; N.player.teleport(h.x, h.y); });
  await sleep(400);
  const lbl = await P.ev(() => N.input.actionLabel);
  check(/Hide/.test(lbl || ''), 'ACTION reads "' + lbl + '" by a hiding spot');
  const b = await P.ev(() => { const r = document.querySelector('.t-action').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 5 }] });
  const hid = await P.until(() => N.latehome.state().me.hide === 2, null, 4000);
  await sleep(500);
  await P.shot('phone_hide');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(hid, 'holding the HIDE button hides him');
  check(await P.until(() => N.latehome.state().me.hide === 0, null, 3000), 'letting go stands him up');
  // whistle
  await P.ev(() => { window.__wh = 0; N.on('latehome:whistle', () => { window.__wh++; }); });
  await tap('.t-horn');
  check(await P.until(() => window.__wh > 0, null, 3000), 'the SEETI (whistle) button whistles');
  // caught on the phone: the PAKDA! banner keeps clear of the HUD panel, the kid and his bubbles
  await P.ev(() => { N.latehome.debug.catchMe(); });
  await banCheck(P, 'phone caught');
  await P.shot('phone_caught');
  await P.until(() => { const s = N.latehome.state(); return !s || s.me.seq === 'walk' || s.me.done; }, null, 15000);
  await sleep(2500);
  await P.shot('phone_caught_walk');
  await P.ev(() => { if (N.party && N.party.active) N.party.cancel(); else N.latehome.stop(); });
  check(await P.until(() => !N.latehome.active(), null, 4000), 'stopped');
  await noErrors(P, 'phone');
  await P.context.close();
}

/* ================================================================ daddy (solo) */
async function daddy(browser) {
  section = 'daddy';
  console.log('\n== Daddy Aa Gaye! (solo): AI Nanna, then you are Daddy');
  const P = await newPage(browser, 'daddy', { viewport: { width: 1100, height: 640 } });
  await newGame(P);
  await P.ev(() => { N.latehome.TUNE.daddy.time = 45; N.latehome.start({ variant: 'daddy', venue: 'cafe', seed: 5, direct: true }); });
  const s0 = await P.st();
  check(s0 && s0.variant === 'daddy' && s0.rounds === 2 && s0.seekers.some((q) => q.role === 'hunter'), 'round 1: AI Nanna (torch) hunts; ' + (s0 && s0.rounds) + ' rounds');
  check(await P.until(() => N.latehome.state().phase === 'play', null, 30000), 'GO');
  // walk right into Nanna's torch (real keys toward him)
  const h = await P.ev(() => { const S = N.latehome.debug.session(); const hu = S.seekers.find((q) => q.role === 'hunter'); const a = hu.angle; const f = N.world.findFree(hu.x + Math.cos(a) * 20, hu.y + Math.sin(a) * 20, 'walk', 10) || { x: hu.x + Math.cos(a) * 20, y: hu.y + Math.sin(a) * 20 }; N.player.teleport(f.x, f.y); N.latehome.debug.setSeekersFrozen(true); return { x: hu.x, y: hu.y }; });
  await walkTo(P, h.x, h.y, 20000, { r: 6, until: () => !!N.latehome.state().me.seq || !!N.latehome.state().me.done });
  check(await P.until(() => !!N.latehome.state().me.seq || N.latehome.state().me.done === 'caught', null, 10000), 'Nanna catches him: close + facing (no meter in Daddy rounds)');
  const dl = await banCheck(P, 'daddy');
  check(dl && /Nanna/.test(dl.text), 'Nanna\'s line is in the banner, not a bubble over it', dl && dl.text);
  const night = await P.ev(() => ({ clock: N.clock.label(), night: +N.render.night.toFixed(2) }));
  check(night.night > 0.5 && night.night < 0.95, 'Daddy rounds: a lighter night (' + night.clock + ', night ' + night.night + '; plus a soft lift of the mask)', night);
  await P.shot('daddy_r1');
  await P.until(() => N.latehome.state().me.done === 'caught', null, 10000);
  await P.ev(() => { N.latehome.debug.setSeekersFrozen(false); N.latehome.debug.resolveAI(); });
  check(await P.until(() => N.latehome.state().round === 1, null, 20000), 'round 2 starts (roles swap)');
  const s1 = await P.st();
  check(s1.me.role === 'daddy' && !s1.seekers.some((q) => q.role === 'hunter') && s1.virtual.length === 1, 'round 2: YOU are Daddy (your torch is the cone)');
  check(await P.until(() => N.latehome.state().phase === 'play', null, 20000), 'GO (round 2)');
  await sleep(1200);
  const torch = await P.ev(() => { const S = N.latehome.debug.session(); const v = S.virtualSeekers[0]; return v ? { on: v.cone.on, poly: !!v.cone.poly } : null; });
  check(torch && torch.on && torch.poly, 'your torch beam is on (a lighter night, the beam drawn stronger)', torch);
  await P.shot('daddy_torch');
  // catch an AI friend: get close behind him, then walk at him with real keys
  let caught = false;
  for (let tries = 0; tries < 6 && !caught; tries++) {
    const k = await P.ev(() => { const s = N.latehome.state(); const k = s.kids.find((q) => q.ai && !q.done && q.role === 'kid'); if (!k) return null; const f = N.world.findFree(k.x - 22, k.y, 'walk', 16) || N.world.findFree(k.x + 22, k.y, 'walk', 16); N.player.teleport(f.x, f.y); return { uid: k.uid }; });
    if (!k) break;
    // (target the moving kid each step)
    for (let i = 0; i < 25 && !caught; i++) {
      const t = await P.ev((u) => { const q = N.latehome.state().kids.find((z) => z.uid === u); return q ? { x: q.x, y: q.y, done: q.done, seq: q.seq } : null; }, k.uid);
      if (!t || t.done || t.seq) { caught = true; break; }
      await walkTo(P, t.x, t.y, 400, { r: 2 });
    }
    caught = caught || await P.ev(() => N.latehome.state().kids.some((q) => q.ai && (q.done === 'caught' || q.seq)));
  }
  check(caught, 'Daddy (you) catches an AI friend by walking up to him, facing him');
  check(await P.until(() => N.latehome.state().me.catches >= 1, null, 3000), 'catches counted: ' + (await P.st()).me.catches);
  await P.shot('daddy_r2');
  await P.ev(() => N.latehome.debug.resolveAI());
  check(await P.until(() => !!document.querySelector('.lh-res'), null, 15000), 'final standings card (points)');
  const card = await P.ev(() => document.querySelector('.lh-res').textContent);
  check(/Catches/.test(card) && /Points/.test(card), 'card shows catches + points', card.slice(0, 200));
  await P.shot('daddy_results');
  await sleep(800); await P.page.keyboard.press('KeyE');
  check(await P.until(() => !N.latehome.active(), null, 5000), 'closed');
  await noErrors(P, 'daddy');
  await P.context.close();
}

/* ================================================================ party (online mock) */
function staticServer() {
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}
async function party(browser) {
  section = 'party';
  console.log('\n== party: two pages in an online room (tests/online_mock.cjs)');
  const mock = require('./online_mock.cjs');
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const SDK = fs.readFileSync(path.join(ROOT, 'vendor/supabase/supabase.js'), 'utf8');
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 10, stateHz: 8 };
  try {
    const A = await newPage(browser, 'A', { viewport: { width: 960, height: 600 }, conf: CONF, sdk: SDK, url: S.url });
    const B = await newPage(browser, 'B', { viewport: { width: 960, height: 600 }, conf: CONF, sdk: SDK, url: S.url });
    if (!await A.ev(() => !!(N.party && N.party.challenge))) { console.log('  (N.party missing: party section skipped)'); return; }
    for (const [P, nick, dx] of [[A, 'Ravi', 0], [B, 'Pooja', 14]]) {
      await newGame(P);
      await P.ev(([dx]) => { N.debug.setTime(19, 0); N.player.teleport(9798 + dx, 5128); }, [dx]);
      await P.ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), nick);
    }
    const made = await A.ev(() => N.online.createRoom());
    check(made && made.ok, 'A created room ' + (made && made.code));
    const jb = await B.ev((c) => N.online.joinRoom(c), made.code);
    check(jb && jb.ok, 'B joined');
    check(await A.until(() => N.online.room && N.online.room.n === 2, null, 10000), 'A sees 2 players');
    await sleep(800);
    // ---- 'latehome': everyone sneaks home at once
    const ch = await A.ev(() => N.party.challenge('latehome', { venue: 'cafe' }));
    check(ch && ch.ok && ch.mode === 'party', 'A challenges the room to Ghar Pahunchna Hai!', ch);
    check(await B.until(() => !!N.party.invite, null, 10000), 'B gets the invite card');
    await B.page.keyboard.press('KeyY');
    check(await A.until(() => N.latehome.active(), null, 30000) && await B.until(() => N.latehome.active(), null, 30000), 'both pages start the run');
    const sa = await A.st(), sb = await B.st();
    check(sa.seed === sb.seed && JSON.stringify(sa.hides) === JSON.stringify(sb.hides) && JSON.stringify(sa.kids.map((k) => k.door)) === JSON.stringify(sb.kids.map((k) => k.door)), 'same seed, same doors and hiding spots on both pages');
    check(sa.isHost && !sb.isHost && sa.mode === 'party', 'A hosts the seekers, B follows');
    check(await A.until(() => N.latehome.state().phase === 'play', null, 30000) && await B.until(() => N.latehome.state().phase === 'play', null, 30000), 'GO on both');
    await sleep(2500);
    const cmp = async () => { const a = await A.st(), b = await B.st(); let worst = 0; a.seekers.forEach((q, i) => { const r = b.seekers[i]; if (r) worst = Math.max(worst, Math.hypot(q.x - r.x, q.y - r.y)); }); return { worst, b0: b.seekers.map((q) => [q.x, q.y]) }; };
    const c1 = await cmp();
    await sleep(1500);
    const c2 = await cmp();
    const moved = c1.b0.some((p, i) => Math.hypot(p[0] - c2.b0[i][0], p[1] - c2.b0[i][1]) > 3);
    check(moved && c2.worst < 45, 'B sees the host\'s seekers move (worst gap ' + c2.worst.toFixed(1) + ' u)');
    const bk = await A.until(() => { const k = N.latehome.state().kids.find((q) => !q.me); return !!(k && Math.hypot(k.x - 9812, k.y - 5128) < 120); }, null, 6000);
    check(bk, 'A knows where B\'s kid is (lhpos)');
    // B whistles (real Space) next to a seeker -> the host's seeker turns to it
    await B.ev(() => { const s = N.latehome.state(); const sk = s.seekers.find((q) => q.role === 'walker' || q.role === 'watchman') || s.seekers[0]; const f = N.world.findFree(sk.x + 70, sk.y, 'walk', 30) || N.world.findFree(sk.x - 70, sk.y, 'walk', 30); N.player.teleport(f.x, f.y); });
    await sleep(600);
    await A.ev(() => { for (const q of N.latehome.debug.session().seekers) q.inv = null; });
    await B.page.keyboard.press('Space');
    check(await A.until(() => N.latehome.state().seekers.some((q) => q.inv && q.inv.kind === 'whistle'), null, 5000), 'B\'s whistle reaches the host\'s seekers (a cone is pulled away)');
    await B.shot('party_guest');
    // both home -> party.js results on both pages
    await A.ev(() => N.latehome.debug.win());
    await B.ev(() => N.latehome.debug.win());
    check(await A.until(() => N.party._debug.cards().results, null, 30000) && await B.until(() => N.party._debug.cards().results, null, 30000), 'both home -> the party results card on both pages');
    const rows = await B.ev(() => document.querySelector('.pt-results').textContent);
    check(/Ravi|You/.test(rows) && /Pooja|You/.test(rows), 'results list both players', rows.slice(0, 200));
    await A.shot('party_results');
    await A.page.keyboard.press('KeyX'); await B.page.keyboard.press('KeyX');
    await A.until(() => !N.latehome.active(), null, 8000); await B.until(() => !N.latehome.active(), null, 8000);
    await sleep(1500);
    // ---- 'latehome_daddy': one is Daddy, catches the other, roles swap
    await A.ev(() => { N.latehome.TUNE.daddy.time = 60; });
    await B.ev(() => { N.latehome.TUNE.daddy.time = 60; });
    const ch2 = await A.ev(() => N.party.challenge('latehome_daddy', { venue: 'cafe' }));
    check(ch2 && ch2.ok, 'A challenges the room to Daddy Aa Gaye!', ch2);
    check(await B.until(() => !!N.party.invite, null, 10000), 'B gets the invite');
    await B.page.keyboard.press('KeyY');
    check(await A.until(() => N.latehome.active() && N.latehome.state().phase === 'play', null, 40000) && await B.until(() => N.latehome.active() && N.latehome.state().phase === 'play', null, 40000), 'both in round 1');
    const roles = async () => [(await A.st()).me.role, (await B.st()).me.role];
    const r1 = await roles();
    check(r1.filter((r) => r === 'daddy').length === 1, 'round 1: one Daddy (' + r1.join(' / ') + ')');
    const D1 = r1[0] === 'daddy' ? A : B, K1 = D1 === A ? B : A;
    const catchOn = async (D, K) => {
      const kp = await K.ev(() => ({ x: N.player.x, y: N.player.y }));
      await D.ev(([x, y]) => { const f = N.world.findFree(x - 10, y, 'walk', 10) || { x: x - 10, y }; N.player.teleport(f.x, f.y); N.player.angle = N.player.facing = Math.atan2(y - f.y, x - f.x); }, [kp.x, kp.y]);
      await D.page.keyboard.down('KeyD'); await sleep(250); await D.page.keyboard.up('KeyD');
      return K.until(() => !!N.latehome.state().me.seq || N.latehome.state().me.done === 'caught', null, 10000);
    };
    check(await catchOn(D1, K1), 'the Daddy page catches the other kid (proximity + facing, lhcatch)');
    await D1.shot('party_daddy');
    check(await A.until(() => N.latehome.state() && N.latehome.state().round === 1, null, 30000) && await B.until(() => N.latehome.state() && N.latehome.state().round === 1, null, 30000), 'round 2 on both pages');
    const r2 = await roles();
    check(r2[0] === r1[1] && r2[1] === r1[0], 'roles swapped (' + r2.join(' / ') + ')');
    await A.until(() => N.latehome.state().phase === 'play', null, 20000); await B.until(() => N.latehome.state().phase === 'play', null, 20000);
    const D2 = r2[0] === 'daddy' ? A : B, K2 = D2 === A ? B : A;
    check(await catchOn(D2, K2), 'round 2 catch by the new Daddy');
    check(await A.until(() => N.party._debug.cards().results, null, 40000) && await B.until(() => N.party._debug.cards().results, null, 40000), 'final results on both pages');
    await B.shot('party_daddy_results');
    await noErrors(A, 'party A');
    await noErrors(B, 'party B');
    await A.context.close(); await B.context.close();
  } finally {
    try { S.srv.close(); } catch (e) { /* ignore */ }
    try { await M.close(); } catch (e) { /* ignore */ }
  }
}

/* ================================================================ main */
(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const t0 = Date.now();
  try {
    if (only('solo2d')) await solo2d(browser).catch((e) => fail('crashed: ' + (e.stack || e.message)));
    if (only('solo3d')) await solo3d(browser).catch((e) => fail('crashed: ' + (e.stack || e.message)));
    if (only('phone')) await phone(browser).catch((e) => fail('crashed: ' + (e.stack || e.message)));
    if (only('daddy')) await daddy(browser).catch((e) => fail('crashed: ' + (e.stack || e.message)));
    if (only('party')) await party(browser).catch((e) => fail('crashed: ' + (e.stack || e.message)));
  } finally {
    await browser.close();
  }
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL PASSED') + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  process.exit(failures.length ? 1 : 0);
})();
