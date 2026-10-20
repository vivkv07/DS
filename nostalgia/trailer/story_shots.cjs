/* NOSTALGIA trailer v2.1 — the story UI shots (timeline segments of kind 'ui'): the game's real 2026 prologue
 * (cold open) and the story in gameplay (Immu's spy tape + the ● REC moment).
 *   node trailer/story_shots.cjs [W H]      viewport in CSS px (default 1920 1080), rendered at SCALE (default 2)
 *     env: ONLY=prologue,s_story   segment ids
 *          OUTD=dir                (default out/frames2 for landscape, out/frames2_v for portrait)
 *          SCALE=2                 deviceScaleFactor (1920x1080 x2 -> 3840x2160; 1080x1920 x2 -> 2160x3840)
 *          SURVEY=prologue|title   run that sequence with a status log + a low-res still every SURVEY_EVERY frames
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
const OUTD = process.env.OUTD || path.join(__dirname, 'out', PORTRAIT ? 'frames2_v' : 'frames2');
const Q = +(process.env.Q || 92);
const SURVEY = process.env.SURVEY || '';
const SURVEY_EVERY = +(process.env.SURVEY_EVERY || 6);
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const FPS = TL.fps || 30, DT = 1 / FPS, BF = TL.beatFrames;

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
  return { browser, context, page, errors, cdp };
}
async function takeOver(page) { await page.evaluate(() => { window.__auto = false; }); await page.waitForTimeout(400); }

(async () => {
  const t0 = Date.now();
  const { browser, page, errors, cdp } = await boot();
  console.log('booted in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  const shot = async (file, scale) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Q, clip: { x: 0, y: 0, width: W, height: H, scale: scale || SCALE } });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  if (SURVEY) {
    const dir = path.join(__dirname, 'out', 'story_survey', SURVEY + '_' + W + 'x' + H);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await takeOver(page);
    await page.evaluate(() => SP.setup({ hud: true }));
    if (SURVEY === 'prologue') {
      await page.evaluate(() => { N.menus.quickStart = true; N.debug.newGame({ skipIntro: true }); N.player.money = 1000; window.__pro = N.story.prologue(); });
    }
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
      fs.writeFileSync(path.join(dir, 'log.txt'), log.join('\n') + '\n');
      await browser.close();
      return;
    }
    for (let f = 0; f < +(process.env.SURVEY_N || 2400); f += SURVEY_EVERY) {
      const ch = await page.evaluate(({ n, dt }) => SP.run(n, dt), { n: SURVEY_EVERY, dt: DT });
      for (const [fr, st] of ch) { log.push(fr + ' ' + JSON.stringify(st)); console.log(fr, JSON.stringify(st).slice(0, 260)); }
      await shot(path.join(dir, 's' + String(f + SURVEY_EVERY).padStart(5, '0') + '.jpg'), +(process.env.SURVEY_SCALE || 1));
      const st = ch.length ? ch[ch.length - 1][1] : null;
      if (SURVEY === 'prologue' && st && st.mode === 'play' && f > 100) break;
      if (f % 300 < SURVEY_EVERY) console.log('  frame', f, ((Date.now() - tS) / 1000).toFixed(0) + 's');
    }
    fs.writeFileSync(path.join(dir, 'log.txt'), log.join('\n') + '\n');
    console.log('survey done', errors.length, 'errors');
    await browser.close();
    return;
  }
  await browser.close();
})();
