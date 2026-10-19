/* NOSTALGIA — tests/menus.cjs (owned by the menus agent)
 * Full menu flow in headless Chromium on desktop 1280x720 (keyboard + mouse), phone portrait
 * 390x844 and landscape 844x390 (touch, CDP gestures):
 *   title (J-card) -> PLAY -> name card -> new game -> pause -> map (pan / zoom / place card /
 *   waypoint / legend) -> journal tabs -> settings (persist across a reload) -> save / load
 *   (latest + manual slots) -> quit to title -> continue; a cutscene with every step type
 *   (dialogue, prompt, definitions and credits driven by real input), hold-to-skip,
 *   abortCutscene and pause-in-cutscene. Screenshots go to tests/out/menus/.
 * Fails on any console error, page error or N.err.
 *
 *   node nostalgia/tests/menus.cjs                 (Google Fonts stubbed)
 *   REAL_FONTS=1 node nostalgia/tests/menus.cjs    (fonts through $HTTPS_PROXY)
 *   ONLY=desktop|portrait|landscape node nostalgia/tests/menus.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'menus');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, dpr: 1, touch: false },
  { name: 'portrait', viewport: { width: 390, height: 844 }, dpr: 2, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, dpr: 2, touch: true },
];
const STEP_TYPES = ['card', 'text', 'vhs', 'fade', 'wait', 'say', 'talk', 'camera', 'call', 'jcard', 'credits', 'definitions', 'prompt', 'sfx', 'music', 'osd', 'counter', 'flash', 'title', 'letterbox', 'vhsfx'];

const failures = [];
let section = '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(cond, msg, detail) {
  if (cond) console.log('  ok   ' + msg);
  else { failures.push('[' + section + '] ' + msg + (detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 400) : '')); console.log('  FAIL ' + msg + (detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

async function newPage(browser, V, context) {
  context = context || await browser.newContext({ viewport: V.viewport, deviceScaleFactor: V.dpr, hasTouch: V.touch, isMobile: V.touch, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  // play-testing builds top money up every frame (src/testing.js): the save/continue checks need real pocket money
  await page.addInitScript(() => { try { localStorage.setItem('nostalgia.testing.unlimitedMoney', '0'); } catch (e) { /* storage off */ } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  return { context, page, errors };
}

async function run(browser, V) {
  section = V.name;
  console.log('\n== ' + V.name + ' ' + V.viewport.width + 'x' + V.viewport.height + (V.touch ? ' (touch)' : ' (keyboard)'));
  let { context, page, errors } = await newPage(browser, V);
  const shot = (n) => page.screenshot({ path: path.join(OUT, V.name + '_' + n + '.png') });
  const ms = () => page.evaluate(() => N.menus.debugState());
  const mode = () => page.evaluate(() => N.state.mode);
  const waitFor = (fn, arg, t) => page.waitForFunction(fn, arg, { timeout: t || 5000 }).then(() => true, () => false);
  const tap = async (sel) => { if (V.touch) await page.tap(sel); else await page.click(sel); };
  const cdp = V.touch ? await context.newCDPSession(page) : null;
  const touchDrag = async (pts, holdMs) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts[0] });
    for (let i = 1; i < pts.length; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts[i] }); await sleep(16); }
    if (holdMs) await sleep(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const boot = async () => {
    await page.goto(URL);
    return waitFor(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title' && N.menus && N.menus.debugState().top === 'title', null, 20000);
  };

  /* ------------------------------------------------------------ title */
  check(await boot(), 'boots to the title J-card');
  await page.evaluate(() => { N.menus.quickStart = false; });
  await sleep(700);
  await shot('01_title');
  const tl = await page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    return {
      jc: r('.mn-title .jc'), play: r('#title-start'), cont: !document.querySelector('.trk-cont').hidden,
      osd: document.querySelector('.vcr-st').textContent, ctr: document.querySelector('.vcr-ctr').textContent,
      cam: N.render.camOverride && { x: Math.round(N.render.camOverride.x), y: Math.round(N.render.camOverride.y) },
      sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight,
      focus: document.activeElement && document.activeElement.id, clock: N.clock.label(),
      lm: (() => { const l = (N.WORLD_DATA.landmarks || []).find((q) => q.id === 'charminar'); return l && { x: l.x, y: l.y }; })(),
    };
  });
  check(tl.jc && tl.jc.l >= -12 && tl.jc.r <= V.viewport.width + 12 && tl.jc.t >= 0 && tl.jc.b <= V.viewport.height, 'J-card fits the screen', tl.jc);
  check(tl.play && tl.play.h >= 40, 'PLAY track is a big target (' + (tl.play && Math.round(tl.play.h)) + ' px)');
  check(tl.osd === '■ STOP' && tl.ctr === '000', 'VHS OSD reads ■ STOP and counter 000');
  check(!tl.cont, 'no CONTINUE without a save');
  check(tl.cam && tl.lm && Math.hypot(tl.cam.x - tl.lm.x, tl.cam.y - tl.lm.y) < 700, 'camera drifts over Charminar at dusk (' + tl.clock + ')', { cam: tl.cam, charminar: tl.lm });
  check(tl.sw <= tl.iw && tl.sh <= tl.ih, 'no page scroll', tl);
  if (!V.touch) check(tl.focus === 'title-start', 'PLAY has keyboard focus');

  /* ------------------------------------------------------------ name card */
  if (!V.touch) {
    // keyboard: move down to SETTINGS and back up, then Enter on PLAY
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
    check((await page.evaluate(() => document.activeElement.id)) === 'title-start', 'arrow keys move along the track list');
    await page.keyboard.press('Enter');
  } else await page.tap('#title-start');
  check(await waitFor(() => N.menus.debugState().top === 'name'), 'PLAY opens the name card (no prompt())');
  check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('nc-nick')), 'nickname field focused (on-screen keyboard)');
  if (!V.touch) {
    await page.keyboard.type('Munna7!');
    await page.keyboard.press('Enter');
    check(await page.evaluate(() => document.activeElement.classList.contains('nc-full')), 'Enter moves to the exam-paper name');
    await page.keyboard.type('Ravi Kumar');
  } else {
    await page.fill('.nc-nick', 'Munna7!');
    await page.evaluate(() => document.querySelector('.nc-nick').dispatchEvent(new Event('input', { bubbles: true })));
    await page.tap('.nc-full');
    await page.fill('.nc-full', 'Ravi Kumar');
    await page.evaluate(() => document.querySelector('.nc-full').dispatchEvent(new Event('input', { bubbles: true })));
  }
  await sleep(200);
  const nc = await page.evaluate(() => ({ nick: document.querySelector('.nc-nick').value, preview: document.querySelector('.nc-preview').textContent }));
  check(nc.nick === 'Munna' && /RAVI KUMAR!/.test(nc.preview), 'letters only, live preview "Mummy shouts RAVI KUMAR!"', nc);
  await shot('02_namecard');
  if (!V.touch) await page.keyboard.press('Enter'); else await page.tap('.mn-name [data-act=start]');
  check(await waitFor(() => N.state.mode === 'play' || N.state.mode === 'cutscene', null, 6000), 'START begins a new game');
  if ((await mode()) === 'cutscene') { await page.evaluate(() => N.menus.skipCutscene()); await waitFor(() => N.state.mode === 'play', null, 8000); }
  const nm = await page.evaluate(() => ({ name: N.player.name, nick: N.player.nick, full: N.player.fullName, FULL: N.menus.subst('{FULL}'), flag: N.dialogue.names ? N.dialogue.names().nick : 'Munna', stored: (() => { try { return JSON.parse(localStorage.getItem('nostalgia.profile.v1')); } catch (e) { return null; } })(), mode: N.state.mode }));
  check(nm.name === 'Munna' && nm.nick === 'Munna' && nm.full === 'Ravi Kumar' && nm.FULL === 'RAVI KUMAR' && nm.flag === 'Munna', 'names on N.player / dialogue / subst', nm);
  check(nm.stored && nm.stored.nick === 'Munna', 'name card remembered (localStorage)', nm.stored);
  await page.evaluate(() => { N.debug.setTime(16, 30); N.debug.freezeClock(true); N.menus.osdCard('▶ PLAY', { ms: 10 }); });

  /* ------------------------------------------------------------ pause + missions */
  await page.evaluate(() => {
    N.missions.register({ id: '__mn_test', title: 'Menu test', giver: { x: N.player.x + 9999, y: N.player.y }, script: async (m) => { m.objective('Wait for the test.'); await m.wait(9999); } });
    N.missions.start('__mn_test');
  });
  await sleep(200);
  if (!V.touch) await page.keyboard.press('Escape'); else await page.tap('#touch .t-pause');
  check(await waitFor(() => N.state.mode === 'paused' && N.menus.debugState().top === 'pause'), 'pause opens the cassette deck');
  const pz = await page.evaluate(() => ({ why: document.querySelector('.k-save .why').textContent, qm: !document.querySelector('.k-qm').hidden, cs: N.menus.canSave() }));
  check(!pz.cs.ok && /mission/i.test(pz.why), 'Save refused during a mission, with the reason shown', pz);
  check(pz.qm, '"Quit mission" offered during a mission');
  await shot('03_pause_mission');
  await tap('.mn-pause [data-act=quitmission]');
  check(await waitFor(() => N.state.mode === 'play' && !N.missions.active), 'Quit mission aborts and resumes');
  await page.evaluate(() => { N.debug.setWanted(3); });
  if (!V.touch) await page.keyboard.press('KeyP'); else await page.tap('#touch .t-pause');
  await waitFor(() => N.state.mode === 'paused');
  const pw = await page.evaluate(() => document.querySelector('.k-save .why').textContent);
  check(/Chappal/i.test(pw), 'Save refused in a chase (Chappal Meter >= 3)', pw);
  await page.evaluate(() => { N.debug.setWanted(0); N.menus.pause(); });
  await sleep(150);
  await shot('04_pause');

  /* ------------------------------------------------------------ map */
  if (!V.touch) {
    await page.evaluate(() => document.querySelector('.mn-pause [data-act=resume]').focus());
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  } else await page.tap('.mn-pause [data-act=map]');
  check(await waitFor(() => N.state.mode === 'map' && N.menus.debugState().top === 'map'), 'Map opens from the pause menu (mode map)');
  await sleep(400);
  const mp0 = await page.evaluate(() => {
    const icons = N.menus._mapIcons();
    const ids = new Set(icons.map((i) => i.id));
    const D = N.WORLD_DATA;
    const exists = (id) => !!(N.places[id] || (D.landmarks || []).some((l) => l.id === id) || (D.parks || []).some((p) => p.id === id) || (D.water || []).some((w) => w.id === id));
    const missing = N.menus.MUST.filter((id) => exists(id) && !ids.has(id));
    const absent = N.menus.MUST.filter((id) => !exists(id));
    return { st: N.menus.debugState().map, icons: icons.length, must: N.menus.MUST.length, missing, absent, landmarks: icons.filter((i) => i.layer === 'landmarks').length, services: icons.filter((i) => i.layer === 'services').length, hidden: icons.filter((i) => i.kind === 'hidden' || i.kind === 'giver').length };
  });
  check(mp0.icons > 250 && mp0.landmarks > 150 && mp0.services > 100, 'map icons from world data: ' + mp0.landmarks + ' landmarks, ' + mp0.services + ' shops/services');
  check(mp0.missing.length === 0, 'every must-have place in the world has a map icon (' + (mp0.must - mp0.absent.length) + '/' + mp0.must + '; not in world data yet: ' + mp0.absent.join(', ') + ')', mp0.missing);
  check(mp0.hidden === 0, 'collectible hiding spots never shown');
  await shot('05_map');
  // pan
  const s0 = await page.evaluate(() => N.menus.debugState().map);
  if (!V.touch) { await page.keyboard.down('ArrowRight'); await sleep(450); await page.keyboard.up('ArrowRight'); }
  // (touch: drag the finger east, i.e. pan the map west. On the v2 map home is near the city's east side, and the
  //  landscape map opens on him already at its east clamp, so an eastward pan has no room to move.)
  else { const cx = V.viewport.width / 2, cy = V.viewport.height / 2; await touchDrag([[{ x: cx, y: cy, id: 1 }], [{ x: cx + 40, y: cy, id: 1 }], [{ x: cx + 80, y: cy, id: 1 }], [{ x: cx + 120, y: cy, id: 1 }]]); }
  await sleep(150);
  const s1 = await page.evaluate(() => N.menus.debugState().map);
  check(V.touch ? s1.cx < s0.cx - 40 : s1.cx > s0.cx + 40, 'map pans (' + (V.touch ? 'touch drag' : 'arrow keys') + '): cx ' + s0.cx + ' -> ' + s1.cx);
  // zoom
  if (!V.touch) { await page.mouse.move(V.viewport.width * 0.4, V.viewport.height * 0.5); await page.mouse.wheel(0, -400); }
  else {
    const cx = V.viewport.width / 2, cy = V.viewport.height / 2;
    const pts = []; for (let i = 0; i <= 6; i++) pts.push([{ x: cx - 30 - i * 14, y: cy, id: 1 }, { x: cx + 30 + i * 14, y: cy, id: 2 }]);
    await touchDrag(pts);
  }
  await sleep(200);
  const s2 = await page.evaluate(() => N.menus.debugState().map);
  check(s2.s > s1.s * 1.2, 'map zooms (' + (V.touch ? 'pinch' : 'mouse wheel') + '): ' + s1.s + ' -> ' + s2.s);
  await tap('.mp-zoom [data-z=out]'); await sleep(450);
  const s3 = await page.evaluate(() => N.menus.debugState().map);
  check(s3.s < s2.s, 'the − button zooms out', [s2.s, s3.s]);
  // place card on Charminar, route there
  const chm = await page.evaluate(() => { const l = N.WORLD_DATA.landmarks.find((q) => q.id === 'charminar'); const p = N.places.charminar; return { x: l.x, y: l.y, px: p.x, py: p.y }; });
  await page.evaluate((c) => { N.menus.closeMap(); N.menus.openMap({ x: c.x + 50, y: c.y - 30, zoom: 'district' }); }, chm);
  await sleep(350);
  const hit = await page.evaluate(() => N.menus._mapHit('charminar'));
  check(!!hit, 'Charminar icon drawn on the map', hit);
  if (hit) {
    if (V.touch) await page.touchscreen.tap(hit.x, hit.y); else await page.mouse.click(hit.x, hit.y);
    await sleep(250);
    const card = await page.evaluate(() => { const c = document.querySelector('.mp-card'); return { shown: !c.hidden, title: (c.querySelector('.mc-head b') || {}).textContent, text: c.textContent }; });
    check(card.shown && card.title === 'Charminar', 'tapping a landmark opens its place card', card.text);
    await shot('06_map_card');
    await tap('.mp-card [data-mc=route]');
    await sleep(150);
    const wp = await page.evaluate(() => ({ wp: N.menus.debugState().waypoint, blip: N.hud.blips.has('mn:waypoint'), route: !!(N.hud.blips.get('mn:waypoint') || {}).route }));
    check(wp.wp && Math.hypot(wp.wp.x - chm.px, wp.wp.y - chm.py) < 120 && wp.blip && wp.route, '"Route here" sets a waypoint with a minimap route', wp);
  }
  // waypoint on empty ground: right-click / long-press
  const wpBefore = await page.evaluate(() => N.menus.debugState().waypoint);
  const ex = Math.round(V.viewport.width * 0.3), ey = Math.round(V.viewport.height * 0.62);
  if (!V.touch) await page.mouse.click(ex, ey, { button: 'right' });
  else await touchDrag([[{ x: ex, y: ey, id: 1 }]], 750);
  await sleep(200);
  const wpAfter = await page.evaluate(() => N.menus.debugState().waypoint);
  check(wpAfter && wpBefore && (wpAfter.x !== wpBefore.x || wpAfter.y !== wpBefore.y), (V.touch ? 'long-press' : 'right-click') + ' drops a waypoint', [wpBefore, wpAfter]);
  // legend filter
  const legendOpen = await page.evaluate(() => N.menus.debugState().map.legend);
  if (!legendOpen) await tap('.mp-legbtn');
  await sleep(150);
  await tap('.mp-legend [data-kind=kirana]');
  const kk = await page.evaluate(() => (N.settings.get('mapKinds') || {}).kirana);
  check(kk === true, 'legend filter turns kirana stores on', kk);
  await shot('07_map_legend');
  if (!V.touch) await page.keyboard.press('Escape'); else await page.tap('.mp-close');
  check(await waitFor(() => N.state.mode === 'paused' && N.menus.debugState().top === 'pause'), 'closing the map returns to the pause deck');

  /* ------------------------------------------------------------ journal */
  await page.evaluate(() => { N.missions.done.add('bo_kaata'); N.missions.done.add('lost_and_found'); });
  await tap('.mn-pause [data-act=journal]');
  check(await waitFor(() => N.state.mode === 'journal' && N.menus.debugState().top === 'journal'), 'Journal opens (mode journal)');
  const tabs = await page.evaluate(() => N.menus.journalTabs().map((t) => t.id));
  check(['story', 'side_a', 'tin', 'lock', 'dictionary'].every((t) => tabs.includes(t)), 'built-in tabs: ' + tabs.join(', '));
  const story = await page.evaluate(() => document.querySelector('.jr-page').textContent);
  check(/Forty roofs\? Sach likho/.test(story) && /Loudspeaker, not radio/.test(story) && /RAVI KUMAR/.test(story), 'Story so far: diary + Vimala Ma\'am\'s red ink + the name', story.slice(0, 120));
  await shot('08_journal_story');
  const seen = [];
  for (let i = 0; i < tabs.length; i++) {
    if (!V.touch) await page.keyboard.press('ArrowRight');
    else { const next = tabs[(tabs.indexOf(await page.evaluate(() => N.menus.debugState().journal)) + 1) % tabs.length]; await page.tap('.jr-tab[data-tab="' + next + '"]'); }
    await sleep(120);
    const t = await page.evaluate(() => ({ id: N.menus.debugState().journal, len: document.querySelector('.jr-page').textContent.trim().length }));
    seen.push(t.id + ':' + t.len);
    if (t.id === 'side_a' || t.id === 'lock') await shot('09_journal_' + t.id);
  }
  check(seen.every((s) => +s.split(':')[1] > 20), (V.touch ? 'tapping' : 'arrow keys through') + ' every tab renders content', seen);
  await page.evaluate(() => N.menus.openJournal('dictionary'));
  await sleep(100);
  const total = await page.evaluate(() => document.querySelectorAll('.dc-list dd').length);
  await page.fill('.dc-search', 'pakka');
  await sleep(100);
  const filtered = await page.evaluate(() => ({ n: document.querySelectorAll('.dc-list dd').length, txt: document.querySelector('.dc-list').textContent.slice(0, 200) }));
  check(total > 100 && filtered.n >= 1 && filtered.n < total && /pakka/i.test(filtered.txt), 'Hyderabadi dictionary (' + total + ' words) searches', filtered);
  await shot('10_journal_dictionary');
  await page.evaluate(() => N.menus.addJournalTab({ id: '__ext', title: 'Test page', order: 95, render(el) { el.textContent = 'Hello from another module.'; } }));
  await page.evaluate(() => N.menus.openJournal('__ext'));
  check(/another module/.test(await page.evaluate(() => document.querySelector('.jr-page').textContent)), 'addJournalTab adds a page other modules can render');
  await page.evaluate(() => N.menus.removeJournalTab('__ext'));
  if (!V.touch) await page.keyboard.press('Escape'); else await page.tap('.jr-close');
  check(await waitFor(() => N.state.mode === 'paused' && N.menus.debugState().top === 'pause'), 'closing the journal returns to the pause deck');

  /* ------------------------------------------------------------ settings */
  await tap('.mn-pause [data-act=settings]');
  check(await waitFor(() => N.menus.debugState().top === 'settings'), 'Settings opens');
  if (!V.touch) {
    await page.focus('.st-row[data-id=textSpeed]');
    await page.keyboard.press('ArrowRight');
    await page.focus('.st-row[data-id="vol.music"]');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    check((await page.evaluate(() => document.activeElement.dataset.id)) === 'vol.master', 'arrow up moves between rows');
  } else {
    await page.tap('.st-row[data-id=textSpeed] [data-v=fast]');
    await page.evaluate(() => { const i = document.querySelector('.st-row[data-id="vol.music"] input'); i.value = 50; i.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  await tap('.st-row[data-id=captions] .st-tog');
  await tap('.st-row[data-id=handed] [data-v=left]');
  await tap('.st-row[data-id=btnSize] [data-v=l]');
  await tap('.st-row[data-id=difficulty] [data-v=hard]');
  await sleep(150);
  const st = await page.evaluate(() => ({
    speed: N.settings.get('textSpeed'), dlg: +(N.dialogue.textSpeed || 0).toFixed(2), music: N.audio.getVolume('music'), captions: N.settings.captions,
    left: document.body.classList.contains('touch-left'), big: document.body.classList.contains('tbtn-l'), hard: N.settings.diff('pursuerSpeed'), fine: N.settings.diff('caughtFine'), diffProp: N.settings.difficulty,
    stored: (() => { try { return JSON.parse(localStorage.getItem('nostalgia.settings.v1')); } catch (e) { return null; } })(),
  }));
  check(st.speed === 'fast' && Math.abs(st.dlg - 90 / 46) < 0.02, 'text speed fast -> N.dialogue.textSpeed', st);
  check(st.music < 0.6, 'music volume lowered through N.audio', st.music);
  check(st.captions === true && st.left && st.big, 'captions on, left-handed + large touch buttons (body classes)', st);
  check(st.hard === 1.1 && st.fine === 300 && st.diffProp === 'hard', 'difficulty Full Meter (systems §14.1 table)', st);
  check(st.stored && st.stored.textSpeed === 'fast' && st.stored.handed === 'left', 'settings persisted (try/catch localStorage)');
  await page.evaluate(() => { window.__opt = 'a'; N.menus.addSettingsRow({ id: '__x', label: 'Another module', type: 'seg', opts: [['a', 'Ek'], ['b', 'Do']], get: () => window.__opt, set: (v) => { window.__opt = v; }, section: 'Gameplay' }); });
  await tap('.st-row[data-id=__x] [data-v=b]');
  check(await page.evaluate(() => window.__opt === 'b'), 'addSettingsRow: another module adds a working row');
  await shot('11_settings');
  if (!V.touch) await page.keyboard.press('Escape'); else await page.tap('.mn-settings [data-act=back]');
  check(await waitFor(() => N.menus.debugState().top === 'pause'), 'settings closes back to pause');

  /* ------------------------------------------------------------ save / load */
  await page.evaluate(() => { N.player.money = 4321; });
  await tap('.mn-pause [data-act=save]');
  await sleep(150);
  const sv = await page.evaluate(() => ({ has: N.save.has(), manual: !!localStorage.getItem('nostalgia.save.v1.manual'), why: document.querySelector('.k-save .why').textContent }));
  check(sv.has && sv.manual && /saved/i.test(sv.why), 'Save writes the latest slot + the manual copy', sv);
  await page.evaluate(() => { N.player.money = 1; N.save.save({ reason: 'booth', toast: false }); N.player.money = 2; });
  await tap('.mn-pause [data-act=load]');
  check(await waitFor(() => N.menus.debugState().top === 'slots'), 'Load shows the tapes');
  await shot('12_slots');
  await tap('.sl-load[data-slot=manual]');
  await sleep(100);
  check(await page.evaluate(() => /Sure/.test(document.querySelector('.sl-load[data-slot=manual]').textContent)), 'loading from pause asks "Sure?" first');
  await tap('.sl-load[data-slot=manual]');
  check(await waitFor(() => N.state.mode === 'play'), 'manual tape loads into play');
  const ld = await page.evaluate(() => ({ money: N.player.money, latest: N.save.info().reason, menus: N.menus.debugState().stack.length }));
  check(ld.money === 4321 && ld.latest === 'booth' && ld.menus === 0, 'manual slot restored (₹43.21) and the latest slot is untouched', ld);

  /* ------------------------------------------------------------ quit to title -> continue */
  if (!V.touch) await page.keyboard.press('Escape'); else await page.tap('#touch .t-pause');
  await waitFor(() => N.state.mode === 'paused');
  await tap('.mn-pause [data-act=quit]');
  await sleep(100);
  const qc = await page.evaluate(() => { const c = document.querySelector('.dk-confirm'); return { shown: !c.hidden, text: c.textContent }; });
  check(qc.shown && /Last saved/.test(qc.text), 'Quit to title warns "Last saved …"', qc.text);
  await tap('.mn-pause [data-act=quitnow]');
  check(await waitFor(() => N.state.mode === 'title' && N.menus.debugState().top === 'title'), 'back on the title');
  const tc = await page.evaluate(() => ({ cont: !document.querySelector('.trk-cont').hidden, sub: document.querySelector('.cont-sub').textContent }));
  check(tc.cont && /TRACK \d\d · .*2003/.test(tc.sub), '▶▶ CONTINUE shows the save line', tc.sub);
  await sleep(300);
  const jc2 = await page.evaluate(() => { const b = document.querySelector('.mn-title .jc').getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, tracks: Array.from(document.querySelectorAll('.jc-tracks > li')).filter((li) => !li.hidden).length }; });
  check(jc2.t >= 0 && jc2.b <= V.viewport.height && jc2.r <= V.viewport.width + 12, 'J-card with ' + jc2.tracks + ' tracks still fits the screen', jc2);
  await shot('13_title_continue');
  if (!V.touch) {
    await page.click('#title-start');
    check(await page.evaluate(() => !document.querySelector('.jc-confirm').hidden && /Record over Side A/.test(document.querySelector('.jc-confirm').textContent)), 'PLAY over a save asks "Record over Side A?"');
    await page.keyboard.press('Escape');
    check(await page.evaluate(() => document.querySelector('.jc-confirm').hidden && N.state.mode === 'title'), 'Esc keeps the tape');
  }
  await page.evaluate(() => N.menus.setNames('Bunty', 'Someone'));
  await tap('.trk-cont [data-act=continue]');
  check(await waitFor(() => N.state.mode === 'play'), '▶▶ CONTINUE resumes play');
  const ct = await page.evaluate(() => ({ osd: document.querySelector('.mn-osdcard') && document.querySelector('.mn-osdcard').classList.contains('show'), name: N.player.name, full: N.player.fullName, money: N.player.money }));
  check(ct.osd && ct.name === 'Munna' && ct.full === 'Ravi Kumar' && ct.money === 1, 'continue: OSD ▶ PLAY card, names and money from the latest save', ct);
  await shot('14_continue');

  /* ------------------------------------------------------------ cutscene: every step type */
  // the save was made on the home terrace, a W6 viewpoint: once he has stood there ~1 s after CONTINUE the camera
  // pulls out for 3 s (collectibles.js). Let that play out in game time so it is not mistaken for cutscene state.
  { const t0 = await page.evaluate(() => N.time.now); await waitFor((a) => N.time.now > a + 1.5, t0, 20000); }
  await waitFor(() => !N.render.camOverride && !N.player.controlsLocked, null, 20000);
  await page.evaluate(() => {
    N.dialogue.skip = false;
    window.__types = new Set(); window.__calls = 0; window.__res = null; window.__events = [];
    N.on('cutscene:step', (e) => window.__types.add(e.type));
    N.on('cutscene:start', (e) => window.__events.push('start:' + e.id));
    N.on('cutscene:end', (e) => window.__events.push('end:' + e.id));
    N.menus.cutscene([
      { type: 'letterbox', on: true },
      { type: 'fade', to: 'black', ms: 250 },
      { type: 'card', title: '▶ PLAY  WED 14 JAN 2026  18:05', ms: 1100 },
      { type: 'fade', to: 'clear', ms: 250 },
      { type: 'text', lines: ['Hyderabad, 2026. Makar Sankranti.', 'K. {full}, 34. Fourteenth floor, Madhapur.'], ms: 900 },
      { type: 'say', s: 'amma', t: '{FULL}! A courier came. From America.' },
      { type: 'talk', lines: [{ s: 'srikanth', t: 'Amma, I am in a meeting.' }, { s: 'amma', t: 'The chappal does not know that.' }] },
      { type: 'prompt', label: '▶ PLAY' },
      { type: 'vhs', mode: 'rewind', year: [2026, 2003], ms: 1100 },
      { type: 'vhs', mode: 'ff', ms: 400 }, { type: 'vhs', mode: 'play', ms: 250 }, { type: 'vhs', mode: 'rec', ms: 250 },
      { type: 'vhs', mode: 'pause', ms: 200 }, { type: 'vhs', mode: 'stop', ms: 250 },
      { type: 'camera', target: 'charminar', zoom: 0.9, ms: 500 },
      { type: 'wait', ms: 200 },
      { type: 'call', fn: () => { window.__calls++; } },
      () => { window.__calls++; },
      { type: 'card', title: 'Patang', te: 'పతంగ్', sub: 'Chapter 1 · Kites', ms: 900 },
      { type: 'title', sub: 'a Hyderabad story on one cassette', ms: 700 },
      { type: 'jcard', id: 'bo_kaata', ms: 1000 },
      { type: 'osd', text: '▶ PLAY', sub: 'SIDE B', ms: 300 },
      { type: 'counter', from: 0, to: 999, ms: 500 },
      { type: 'sfx', name: 'tape_click' }, { type: 'music', id: 'title' }, { type: 'music', id: null },
      { type: 'flash' }, { type: 'vhsfx', amount: 0.3 },
      { type: 'fade', to: 'white', ms: 150 }, { type: 'fade', to: 'clear', ms: 150 },
      { type: 'definitions' },
      { type: 'credits' },
      { type: 'letterbox', on: false },
    ], { id: 'menus-test' }).then((r) => { window.__res = r; });
  });
  check(await waitFor(() => N.state.mode === 'cutscene'), 'cutscene pushes the cutscene state');
  const shotAt = { card: '15_cs_osdcard', text: '16_cs_text', say: '17_cs_say', vhs: '18_cs_vhs_rewind', title: '19_cs_title', jcard: '20_cs_jcard', definitions: '21_cs_definitions', credits: '22_cs_credits' };
  const shotDone = new Set();
  const t0 = Date.now();
  let lastAct = 0;
  while (Date.now() - t0 < 60000) {
    const s = await page.evaluate(() => ({ res: window.__res, types: Array.from(window.__types), dlg: N.dialogue.isOpen() && N.dialogue.current, top: N.menus.debugState().top, prompt: !!document.querySelector('.cs-card.k-prompt'), cardText: (document.querySelector('.cs-stage') || {}).textContent || '' }));
    if (s.res) break;
    const last = s.types[s.types.length - 1];
    let key = last === 'card' && /Patang/.test(s.cardText) ? null : last;
    if (key === 'vhs' && !/2026|2025|2024/.test(await page.evaluate(() => document.querySelector('.cs-osd').textContent))) key = null;
    if (key && shotAt[key] && !shotDone.has(key)) {
      await sleep(key === 'text' ? 700 : key === 'definitions' ? 2600 : key === 'credits' ? 1600 : 350);
      shotDone.add(key); await shot(shotAt[key]);
    }
    if (Date.now() - lastAct > 450) {
      if (s.dlg && !s.dlg.typing) { lastAct = Date.now(); if (V.touch) await page.tap('.dlg-box'); else await page.keyboard.press('KeyE'); }
      else if (s.prompt) { lastAct = Date.now(); if (V.touch) await page.touchscreen.tap(V.viewport.width / 2, V.viewport.height / 2); else await page.keyboard.press('KeyE'); }
      else if (s.top === 'defs' && shotDone.has('definitions')) { lastAct = Date.now(); if (V.touch) { await page.tap('.mn-defs'); await sleep(200); await page.tap('.mn-defs'); } else { await page.keyboard.press('KeyE'); await sleep(200); await page.keyboard.press('KeyE'); } }
      else if (s.top === 'credits' && shotDone.has('credits')) {
        lastAct = Date.now();
        if (!V.touch) { await page.keyboard.down('KeyE'); await sleep(500); const y0 = await page.evaluate(() => document.querySelector('.cr-ctr').textContent); await sleep(300); await page.keyboard.up('KeyE'); void y0; await page.keyboard.press('Escape'); }
        else await page.tap('.cr-x');
      }
    }
    await sleep(60);
  }
  const cs = await page.evaluate(() => ({ res: window.__res, types: Array.from(window.__types), calls: window.__calls, mode: N.state.mode, cam: N.render.camOverride, vhs: N.render.fx.vhs, events: window.__events, top: N.menus.debugState().top }));
  check(cs.res && !cs.res.skipped && !cs.res.aborted, 'cutscene ran to the end with real input', cs.res);
  const missingTypes = STEP_TYPES.filter((t) => cs.types.indexOf(t) < 0);
  check(missingTypes.length === 0, 'every step type ran (' + cs.types.length + ')', missingTypes);
  check(cs.calls === 2, 'call steps (object + bare function) ran', cs.calls);
  check(cs.mode === 'play' && !cs.cam && cs.vhs === 0 && cs.top === null, 'state, camera and VHS restored after the cutscene', cs);
  await sleep(600);
  check(await page.evaluate(() => N.render.fx.fade < 0.05), 'fade back to clear after the cutscene');

  // hold-to-skip: the rest fast-forwards, call steps still run
  await page.evaluate(() => { window.__after = 0; window.__res2 = null; window.__t2 = performance.now(); N.menus.cutscene([{ type: 'card', title: 'Hold to skip', ms: 20000 }, { type: 'call', fn: () => { window.__after++; } }, { type: 'say', s: 'immu', t: 'You will never read this.' }, { type: 'wait', ms: 20000 }]).then((r) => { window.__res2 = r; window.__t2 = performance.now() - window.__t2; }); });
  await sleep(300);
  if (!V.touch) { await page.keyboard.down('KeyE'); await sleep(1350); await page.keyboard.up('KeyE'); }
  else await touchDrag([[{ x: V.viewport.width / 2, y: V.viewport.height / 2, id: 1 }]], 1350);
  await waitFor(() => !!window.__res2, null, 4000);
  const sk = await page.evaluate(() => ({ res: window.__res2, after: window.__after, t: Math.round(window.__t2), mode: N.state.mode }));
  check(sk.res && sk.res.skipped && sk.after === 1 && sk.t < 4000 && sk.mode === 'play', 'hold ' + (V.touch ? 'the screen' : 'E') + ' 1 s skips the scene (calls still run)', sk);
  // the SKIP pill
  await page.evaluate(() => { window.__res3 = null; N.menus.cutscene([{ type: 'text', lines: ['Tap the pill.'], ms: 20000 }]).then((r) => { window.__res3 = r; }); });
  await sleep(300);
  await tap('.cs-skip');
  check(await waitFor(() => window.__res3 && window.__res3.skipped, null, 3000), 'the SKIP ▶▶ pill skips');
  // abortCutscene resolves at once
  await page.evaluate(() => { window.__res4 = null; N.menus.cutscene([{ type: 'wait', ms: 30000 }]).then((r) => { window.__res4 = r; }); setTimeout(() => N.menus.abortCutscene(), 200); });
  check(await waitFor(() => window.__res4 && window.__res4.aborted && N.state.mode === 'play', null, 3000), 'abortCutscene() resolves the pending cutscene');
  // pause holds a cutscene in place (keyboard)
  if (!V.touch) {
    await page.evaluate(() => { window.__mark = 0; window.__res5 = null; N.menus.cutscene([{ type: 'wait', ms: 1200 }, { type: 'call', fn: () => { window.__mark = 1; } }]).then((r) => { window.__res5 = r; }); });
    await sleep(200);
    await page.keyboard.press('Escape');
    check(await waitFor(() => N.state.mode === 'paused' && N.menus.debugState().top === 'pause'), 'Esc pauses a cutscene');
    await sleep(1800);
    check(await page.evaluate(() => window.__mark === 0), 'a paused cutscene holds its position');
    await page.keyboard.press('Escape');
    check(await waitFor(() => window.__res5 && window.__mark === 1 && N.state.mode === 'play', null, 4000), 'resume continues the cutscene');
  }
  // the cutscene card in portrait / landscape stays inside the screen
  await page.evaluate(() => { N.menus.cutscene([{ type: 'card', title: '▶ PLAY  TUE 14 JAN 2003  07:10', ms: 30000 }]); });
  await sleep(500);
  const cb = await page.evaluate(() => { const b = document.querySelector('.cs-card').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; });
  check(cb.l >= 0 && cb.r <= V.viewport.width && cb.t >= 0 && cb.b <= V.viewport.height, 'OSD card fits the screen', cb);
  await page.evaluate(() => N.menus.abortCutscene());

  /* ------------------------------------------------------------ settings + names survive a reload */
  await page.reload();
  await boot();
  const rl = await page.evaluate(() => ({ speed: N.settings.get('textSpeed'), left: document.body.classList.contains('touch-left'), names: N.menus.names(), cont: !document.querySelector('.trk-cont').hidden }));
  check(rl.speed === 'fast' && rl.left && rl.cont, 'after a reload: settings kept, CONTINUE offered', rl);
  await page.evaluate(() => N.settings.reset());

  // errors
  const errs = errors.concat(await page.evaluate(() => N.errors.map((e) => 'N.err ' + e.where + ': ' + e.msg.split('\n')[0])));
  check(errs.length === 0, 'no console / page errors', errs.slice(0, 8));
  await context.close();
}

(async () => {
  const opts = {};
  if (process.env.REAL_FONTS && process.env.HTTPS_PROXY) opts.proxy = { server: process.env.HTTPS_PROXY };
  const browser = await chromium.launch(opts);
  try {
    for (const V of VIEWPORTS) {
      if (process.env.ONLY && process.env.ONLY !== V.name) continue;
      try { await run(browser, V); } catch (e) { failures.push('[' + V.name + '] exception: ' + (e.stack || e.message)); console.log('  FAIL exception ' + (e.stack || e.message)); }
    }
  } finally { await browser.close(); }
  console.log('\nScreenshots: ' + OUT);
  if (failures.length) { console.log('\nMENUS FAILED (' + failures.length + '):\n' + failures.join('\n')); process.exit(1); }
  console.log('\nMENUS PASSED');
})();
