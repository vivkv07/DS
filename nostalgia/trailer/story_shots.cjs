/* NOSTALGIA trailer v2.1 — the story UI shots (timeline segments of kind 'ui'): the game's real 2026 prologue
 * (cold open) and the story in gameplay (Immu's spy tape + the ● REC moment).
 *   node trailer/story_shots.cjs [W H]      viewport in CSS px (default 1920 1080), rendered at SCALE (default 2)
 *     env: ONLY=prologue,s_story   segment ids
 *          OUTD=dir                (default out/frames2 for landscape, out/frames2_v for portrait)
 *          SCALE=2                 deviceScaleFactor (1920x1080 x2 -> 3840x2160; 1080x1920 x2 -> 2160x3840)
 *          SURVEY=prologue|title   run that sequence with a status log + a low-res still every SURVEY_EVERY frames
 *          CUTS=name,..            re-render only these cuts (PLANS below) into the segment's existing frames
 *          EVERY=n                 preview: capture every n-th frame only (the files keep their frame index)
 *          QA=1                    only build the contact sheet out/qa_story_landscape.jpg | qa_story_portrait.jpg
 *          Q=92                    JPEG quality
 *   -> OUTD/<segment id>/%05d.jpg  exactly n*beatFrames frames per segment
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// the virtual rAF clock of lib.cjs (auto-pumped until __step takes over)
const CLOCK = `(() => {
  const nraf = window.requestAnimationFrame.bind(window);
  let cbs = [], vt = 0, lastT = null;
  window.__vt = () => vt;
  window.__auto = true;
  window.requestAnimationFrame = (cb) => {
    if (window.__auto) return nraf((t) => { if (t !== lastT) { if (lastT != null) vt += Math.min(100, t - lastT); lastT = t; } cb(vt); });
    cbs.push(cb); return 0;
  };
  window.__step = (dt) => { window.__auto = false; vt += dt * 1000; const l = cbs; cbs = []; for (const cb of l) { try { cb(vt); } catch (e) { console.error(e && e.stack || e); } } };
})();`;

// The game's own fonts (Google Fonts: VT323 for the VHS OSD, Baloo 2, Yatra One, Kalam, Noto Sans Telugu): fetched once
// with curl into out/fonts_cache and served from there (lib.cjs stubs them, which would draw the OSD in a fallback face)
const FONTD = path.join(__dirname, 'out', 'fonts_cache');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
async function fontRoute(route) {
  const url = route.request().url();
  const f = path.join(FONTD, crypto.createHash('md5').update(url).digest('hex'));
  const css = /fonts\.googleapis\.com/.test(url);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(FONTD, { recursive: true });
    try { execFileSync('curl', ['-sS', '-f', '-m', '40', '-A', UA, '-o', f + '.tmp', url]); fs.renameSync(f + '.tmp', f); } catch (e) {
      console.log('  font fetch failed (fallback faces):', url.slice(0, 120));
      return route.fulfill({ status: 200, contentType: css ? 'text/css' : 'font/woff2', body: css ? '/* offline */' : '' });
    }
  }
  return route.fulfill({ status: 200, contentType: css ? 'text/css; charset=utf-8' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
}
const FONT_SAMPLES = [['22px VT323', '▶ PLAY 2026 ◀◀ REWIND ● REC SIDE A 083'], ['400 20px "Baloo 2"', 'Hyderabad 2026 ₹'], ['600 20px "Baloo 2"', 'Amma'], ['800 20px "Baloo 2"', 'A'],
  ['20px "Yatra One"', 'Immu Amma'], ['400 20px Kalam', 'Gurthunda'], ['700 20px Kalam', 'NOSTALGIA'], ['700 20px "Noto Sans Telugu"', 'పతంగ్']];

const W = +(process.argv[2] || 1920), H = +(process.argv[3] || 1080);
const SCALE = +(process.env.SCALE || 2);
const PORTRAIT = H > W;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const CUTS = (process.env.CUTS || '').split(',').filter(Boolean); // re-render only these cuts (by name) into the existing frames
const OUTD = process.env.OUTD || path.join(__dirname, 'out', PORTRAIT ? 'frames2_v' : 'frames2');
const Q = +(process.env.Q || 92);
const SURVEY = process.env.SURVEY || '';
const EVERY = +(process.env.EVERY || 1); // preview: capture every n-th frame only (files keep their frame index)
const SURVEY_EVERY = +(process.env.SURVEY_EVERY || 6);
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const FPS = TL.fps || 30, DT = 1 / FPS, BF = TL.beatFrames;

/* ---- what each segment shows: cuts = consecutive moments joined with hard cuts (n frames each, multiples of 18).
 * A cut waits for its anchor (SP.until: {cs: cutscene step}, {line: dialogue text on screen}, {typed: line finished}),
 * steps `off` frames more, then captures n frames. setup / before / each run in the page. */
const PLANS = {
  // The cold open: the game's real prologue "Side B, 2026" (story bible §4.1, src/story.js prologue()), played from
  // New Game, cut down to four moments on the score (editor's beats): b0-2 the ▶ PLAY 2026 OSD over the office (the
  // parcel on the desk), b2-4 Amma "A courier came. From America.", b4-8 the cassette close-up with Immu's note landing
  // on b5, b8-12 ◀◀ REWIND with the OSD year spinning 2026 -> 2003 on the score's 24 year-ticks.
  prologue: {
    sequential: true, // one continuous run of the cutscene: every cut waits for the previous one
    cuts: [
      // b0-1: ▶ PLAY  WED 14 JAN 2026  18:05 over the office at dusk: lamp, the parcel, a last kite in the window.
      // +22: the art (0.7 s) and the card (0.45 s) have faded in, so the first frame is clean; the card holds to +78
      { name: 'play_2026', n: 36, setup: startPrologue, anchor: null, before: (o) => SP.frameArt('wide', o.FR.wide), off: 22 },
      // b2-3: Amma: "Srikanth! A courier came. From America." (typed by +26; held 2.2 s), cut in on the parcel
      { name: 'amma_courier', n: 36, anchor: { line: 'A courier came' }, before: (o) => SP.frameArt('parcel', o.FR.parcel), off: 14 },
      // b4-7: close-up of the cassette (SIDE A - HYDERABAD 2003 / SIDE B - 2026). The game's long description card
      // (step 9) is cut out: hidden, and tapped through like a player would; the note card (step 10) then fades in at
      // ~+4 and is fully in on b5, set above the cassette so it never covers the label
      { name: 'gurthunda', n: 72, anchor: { cs: 9 }, off: 4,
        before: async (o) => { SP.frameArt('cassette', o.FR.cassette); SP.hideCard(); SP.csTap(); await SP.tick(); SP.csTap(); } },
      // b8-11: ◀◀ REWIND on the old 2-in-1, the year big; it changes on the score's ticks (music.js yearTicks(tb(8.4),
      // tb(11.5), 24): 2026 at the first tick, 2003 on the last, b11.5) — the cutscene clock is warped per frame so the
      // game's own tween shows each year on its tick
      { name: 'rewind', n: 72, anchor: { cs: 24 }, off: 0,
        before: (o) => { SP.frameArt('rewind', o.FR.rewind); return SP.rewindPlan(o.TICKS, 72, 0.985); },
        each: (o) => SP.rewindStep(o.i), after: () => SP.rewindEnd() },
    ],
  },
};
// the year ticks as cut-relative frames: t_k = tb(8.4) + (tb(11.5) - tb(8.4)) * (1 - (1 - k/23)^2), k = 0..23 (music.js)
const YEAR_TICKS = Array.from({ length: 24 }, (_, k) => { const u = k / 23; return Math.round((8.4 - 8) * BF + (11.5 - 8.4) * BF * (1 - (1 - u) * (1 - u))); });
// framing of the prologue art, {s: scale, o: transform-origin} (null = as the game shows it)
const FRAME = {
  wide: null,
  parcel: { s: 1.5, o: '32.5% 109%' },   // the parcel (and its pencil label) above the dialogue box, the lamp, the window's foot
  cassette: { s: 1.55, o: '50% 37.6%' }, // art y 24..140: the cassette (label 45% of the width) low, room above for the note
  rewind: null,                          // the whole 2-in-1, the year above it
};
const FRAME_V = { wide: null, parcel: { s: 1.18, o: '30% 64%' }, cassette: null, rewind: null }; // portrait: object-fit cover does the zoom

// ---- the trailer CSS: the editor's legibility notes (UI ~1.4x on top of the 960x540 / 540x960 layouts = ~1.9x the
// 1280x720 stills), the cassette note above the cassette, the REWIND year big and centred. Same elements, fonts, colours.
const UI_CSS = [
  '#overlay .cs-card { zoom: 1.3; }',
  '#overlay .cs-text { zoom: 1.4; }',
  '.dlg { zoom: 1.4; }',
  '.sp-hide { visibility: hidden !important; }',
  "body[data-spcut='cassette'] #overlay .cs-stage { align-items: flex-start; padding-top: calc(9vh + 12px); }",
  "body[data-spcut='cassette'] #overlay .cs-text { width: 440px; }",
  "body[data-spcut='rewind'] #overlay .cs-osd { left: 0; right: 0; top: calc(9vh + 2px); align-items: center; letter-spacing: 4px; }",
  "body[data-spcut='rewind'] #overlay .cs-osd b { font-size: 40px; }",
  "body[data-spcut='rewind'] #overlay .cs-osd span { font-size: 104px; line-height: 0.92; }",
].join('\n');
const UI_CSS_V = [
  // the 320x180 art would be stretched to 9:16 by the game's CSS (width/height 100%): cover the phone screen instead
  '#overlay canvas.st-art { object-fit: cover; object-position: 50% 50%; }',
  "body[data-spcut='wide'] #overlay canvas.st-art, body[data-spcut='parcel'] #overlay canvas.st-art { object-position: 44% 50%; }",
  '#overlay .cs-card { zoom: 1.25; }',
  '#overlay .cs-text { zoom: 1.35; }',
  '.dlg { zoom: 1.45; }',
  '.sp-hide { visibility: hidden !important; }',
  "body[data-spcut='cassette'] #overlay .cs-stage { align-items: flex-start; padding-top: calc(7vh + 18px); }",
  "body[data-spcut='cassette'] #overlay .cs-text { width: 360px; }",
  "body[data-spcut='rewind'] #overlay .cs-osd { left: 0; right: 0; top: calc(7vh + 30px); align-items: center; letter-spacing: 4px; }",
  "body[data-spcut='rewind'] #overlay .cs-osd b { font-size: 46px; }",
  "body[data-spcut='rewind'] #overlay .cs-osd span { font-size: 132px; line-height: 0.92; }",
].join('\n');
// s_story: the story in gameplay (3D third-person view, the HUD and the dialogue box as the player sees them)
PLANS.s_story = {
  cuts: [
    // b40-43: M3 "First Day, First Show" (Sat 8 Feb 2003, dawn): Chinnu at Sandhya 70mm plays the cassette Immu hid in
    // the hero's boot — the spy-tape box (cassette-label skin, VHS type): "Agent Immu to Agent Chinnu. ..."
    { name: 'spy_tape', n: 72, setup: storySandhya, anchor: { line: 'Agent Immu' }, off: 6 },
    // b44-47: M1 "Bo Kaata!" ends (Tue 14 Jan 2003, 17:55, Sankranti dusk on the home terrace, kites everywhere, Immu on
    // his terrace across the ground): ● REC — the first sound goes on Side A, the counter rolls 000 -> 083 and the
    // kite corner goes into the tin. ACTION is pressed 10 frames in.
    { name: 'rec', n: 72, setup: storyTerrace, anchor: { fn: '!!(N.tape.recState)' }, off: 2, each: recPress },
  ],
};
async function storySandhya(o) {
  await SP.start3D(o.SCALE, o.css);
  const T = N.places.sandhya_theatre;
  // the facade faces east: Chinnu stands in the forecourt looking west at the hoardings
  const r = SP.scene({ date: [2003, 2, 8, 5, 55], at: [T.x + 62, T.y + 6], angle: Math.PI, yaw: Math.PI + 0.12, pitch: 0.16, view: 'tps',
    npcs: [['painter', [T.x + 50, T.y - 14], { idle: 'work' }]] });
  N.hud.objective("Get the tape from the hero's boot.");
  await SP.settle3D(60);
  N.dialogue.say('immu_tape', "Agent Immu to Agent Chinnu. If you found this, you're at Sandhya and it's six o'clock.");
  return r;
}
async function storyTerrace(o) {
  await SP.start3D(o.SCALE, o.css);
  try { N.dialogue.cancel(); } catch (e) { /* ignore */ }
  const r = SP.scene({ date: [2003, 1, 14, 17, 55], at: [10112, 4986], roof: 'home_terrace', angle: 0.05, yaw: 0.0, pitch: 0.2, view: 'tps',
    npcs: [['immu', 'friend_terrace'], ['nanna', [10098, 4978], { roof: 'home_terrace' }], ['chitti', [10100, 4996], { roof: 'home_terrace' }]] });
  N.hud.objective('● REC: the first sound for Side A.');
  await SP.settle3D(60);
  window.__rec = N.tape.rec('bo_kaata');
  return r;
}
PLANS.prologue.css = UI_CSS; PLANS.prologue.cssV = UI_CSS_V;
// s_story: the same legibility treatment for the HUD (OSD strip with the tape counter, objective, toasts) and the
// dialogue box; the minimap and stats scale with it
PLANS.s_story.css = ['.dlg { zoom: 1.4; }', '#hud { zoom: 1.35; }'].join('\n');
PLANS.s_story.cssV = ['.dlg { zoom: 1.45; }', '#hud { zoom: 1.3; }'].join('\n');
function recPress(o) { if (o.i === 10) N.input.press('action'); }
function startPrologue(o) {
  SP.setup({ hud: true, css: o.css });
  SP.fixLabel();
  SP.pace = { line: 2.2, prompt: 1.6 };
  N.menus.quickStart = true; // no name card (default names Chinnu / Srikanth); the prologue is then started the way game:new does
  N.debug.newGame({ skipIntro: true });
  N.player.money = 1000;
  SP.world(false); // the prologue art covers the world
  window.__pro = N.story.prologue();
  return SP.status();
}

async function boot() {
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('  [console.error]', m.text().slice(0, 300)); } });
  page.on('pageerror', (e) => { errors.push(e.message); console.log('  [pageerror]', (e.stack || e.message).slice(0, 400)); });
  await page.addInitScript(CLOCK);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, fontRoute);
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate((S) => Promise.all(S.map(([f, t]) => document.fonts.load(f, t).catch(() => null))), FONT_SAMPLES);
  await page.evaluate(() => { try { N.testing.unlimitedMoney = false; } catch (e) { /* ignore */ } N.view.noPointerLock = true; });
  await page.addScriptTag({ path: path.join(__dirname, 'story_page.js') });
  const cdp = await context.newCDPSession(page);
  // full-page capture with CDP (page.screenshot waits for real animation frames, which never come on the virtual
  // clock); clip.scale = DSF gives device pixels (DOM text rasterised at that scale, crisp)
  const shot = async (file, scale) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Q, clip: { x: 0, y: 0, width: W, height: H, scale: scale || SCALE } });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  return { browser, context, page, errors, cdp, shot };
}
async function takeOver(page) { await page.evaluate(() => { window.__auto = false; }); await page.waitForTimeout(400); }

async function survey() {
  const { browser, page, errors, shot } = await boot();
  const dir = path.join(__dirname, 'out', 'story_survey', SURVEY + '_' + W + 'x' + H);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await takeOver(page);
  await page.evaluate(() => SP.setup({ hud: true }));
  if (SURVEY === 'prologue') await page.evaluate(startPrologue, { W, H, SCALE, PORTRAIT, css: PORTRAIT ? UI_CSS_V : UI_CSS });
  const log = [];
  const tS = Date.now();
  if (process.env.STILLS) { // STILLS=f1,f2,...: full-res stills at these survey frames only
    const fr = process.env.STILLS.split(',').map(Number).sort((a, b) => a - b);
    let at = 0;
    for (const f of fr) {
      const ch = await page.evaluate(({ n, dt }) => SP.run(n, dt), { n: f - at, dt: DT });
      at = f;
      for (const [k, st] of ch) log.push(k + ' ' + JSON.stringify(st));
      await shot(path.join(dir, 'f' + String(f).padStart(5, '0') + '.jpg'));
      console.log('still', f, ((Date.now() - tS) / 1000).toFixed(0) + 's');
    }
  } else {
    for (let f = 0; f < +(process.env.SURVEY_N || 2400); f += SURVEY_EVERY) {
      const ch = await page.evaluate(({ n, dt }) => SP.run(n, dt), { n: SURVEY_EVERY, dt: DT });
      for (const [fr, st] of ch) { log.push(fr + ' ' + JSON.stringify(st)); console.log(fr, JSON.stringify(st).slice(0, 260)); }
      await shot(path.join(dir, 's' + String(f + SURVEY_EVERY).padStart(5, '0') + '.jpg'), +(process.env.SURVEY_SCALE || 1));
      const st = ch.length ? ch[ch.length - 1][1] : null;
      if (SURVEY === 'prologue' && st && st.mode === 'play' && f > 100) break;
      if (f % 300 < SURVEY_EVERY) console.log('  frame', f, ((Date.now() - tS) / 1000).toFixed(0) + 's');
    }
  }
  fs.writeFileSync(path.join(dir, 'log.txt'), log.join('\n') + '\n');
  console.log('survey done', errors.length, 'errors');
  await browser.close();
}

// Each segment runs in a fresh browser: the prologue starts from New Game, s_story from a clean game state.
async function renderSegment(seg) {
  const plan = PLANS[seg.id];
  if (!plan) { console.log('no plan for', seg.id); return 0; }
  const nf = seg.n * BF, total = plan.cuts.reduce((a, c) => a + c.n, 0);
  if (total !== nf) throw new Error(seg.id + ': cuts give ' + total + ' frames, the segment needs ' + nf);
  const tS = Date.now();
  const { browser, page, errors, shot } = await boot();
  console.log(seg.id, 'booted in', ((Date.now() - tS) / 1000).toFixed(0), 's');
  await takeOver(page);
  const dir = path.join(OUTD, seg.id);
  if (!CUTS.length) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const arg = { W, H, SCALE, PORTRAIT, css: (PORTRAIT ? plan.cssV : plan.css) || '', FR: PORTRAIT ? FRAME_V : FRAME, TICKS: YEAR_TICKS };
  let f = 0;
  for (const cut of plan.cuts) {
    const want = !CUTS.length || CUTS.includes(cut.name);
    if (!want && !plan.sequential) { f += cut.n; continue; } // an independent moment: skip it entirely
    if (cut.setup) console.log(' ', seg.id, cut.name, 'setup', JSON.stringify(await page.evaluate(cut.setup, arg)));
    const k = await page.evaluate(({ spec, dt }) => SP.until(spec, dt), { spec: cut.anchor || {}, dt: DT });
    if (k < 0) throw new Error(seg.id + ' ' + cut.name + ': anchor never came ' + JSON.stringify(cut.anchor));
    if (cut.before) { const r = await page.evaluate(cut.before, arg); if (r != null) console.log('   ', cut.name, 'before', JSON.stringify(r).slice(0, 400)); }
    if (cut.off) await page.evaluate(({ n, dt }) => SP.step(n, dt), { n: cut.off, dt: DT });
    const first = await page.evaluate(() => SP.status());
    if (!want) { await page.evaluate(({ n, dt }) => SP.step(n, dt), { n: cut.n, dt: DT }); f += cut.n; continue; }
    for (let i = 0; i < cut.n; i++) {
      if (cut.each) await page.evaluate(cut.each, Object.assign({ i, n: cut.n }, arg));
      if (f % EVERY === 0) await shot(path.join(dir, String(f).padStart(5, '0') + '.jpg'));
      f++;
      await page.evaluate((dt) => SP.step(1, dt), DT);
    }
    if (cut.after) await page.evaluate(cut.after, arg);
    const last = await page.evaluate(() => SP.status());
    console.log(' ', seg.id, cut.name, 'frames', f - cut.n, '-', f - 1, '| anchor +' + k, '\n    first', JSON.stringify(first).slice(0, 300), '\n    last ', JSON.stringify(last).slice(0, 300), ((Date.now() - tS) / 1000).toFixed(0) + 's');
  }
  console.log(seg.id, 'done:', f, 'frames in', ((Date.now() - tS) / 1000).toFixed(0), 's; page errors', errors.length, errors.slice(0, 3));
  await browser.close();
  return errors.length;
}

// QA=1: contact sheet out/qa_story_<landscape|portrait>.jpg — 8 frames per segment (one row each), frame numbers burnt in
function qaSheet() {
  const segs = TL.segments.filter((x) => x.kind === 'ui');
  const rows = [], tmp = path.join(__dirname, 'out', 'qa_story_tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const FONT = '/usr/share/fonts/opentype/inter/Inter-Bold.otf';
  const th = PORTRAIT ? 480 : 270;
  for (const seg of segs) {
    const dir = path.join(OUTD, seg.id), nf = seg.n * BF;
    if (!fs.existsSync(dir)) { console.log('qa: no frames for', seg.id); continue; }
    const picks = [];
    for (let k = 0; k < 8; k++) picks.push(Math.min(nf - 1, Math.round(k * (nf - 1) / 7)));
    const ins = [], fl = [];
    picks.forEach((f, k) => {
      ins.push('-i', path.join(dir, String(f).padStart(5, '0') + '.jpg'));
      fl.push(`[${k}:v]scale=-2:${th},drawtext=fontfile=${FONT}:text='${seg.id} ${f}':x=8:y=8:fontsize=${PORTRAIT ? 22 : 16}:fontcolor=white:box=1:boxcolor=black@0.6[v${k}]`);
    });
    const row = path.join(tmp, seg.id + '.jpg');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(ins, ['-filter_complex', fl.join(';') + ';' + picks.map((_, k) => `[v${k}]`).join('') + `hstack=inputs=${picks.length}`, '-q:v', '3', row]));
    rows.push(row);
  }
  const out = path.join(__dirname, 'out', 'qa_story_' + (PORTRAIT ? 'portrait' : 'landscape') + '.jpg');
  if (rows.length === 1) fs.copyFileSync(rows[0], out);
  else execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(...rows.map((r) => ['-i', r]), ['-filter_complex', rows.map((_, k) => `[${k}:v]`).join('') + `vstack=inputs=${rows.length}`, '-q:v', '3', out]));
  console.log('qa sheet', out);
}

(async () => {
  if (process.env.QA) return qaSheet();
  if (SURVEY) return survey();
  let nerr = 0;
  for (const seg of TL.segments.filter((x) => x.kind === 'ui' && (!ONLY.length || ONLY.includes(x.id)))) nerr += await renderSegment(seg);
  console.log('all done; page errors', nerr);
})();
