/* NOSTALGIA trailer — shared capture helpers (Playwright + the real game, frame-stepped).
 * The game runs on a virtual requestAnimationFrame clock: nothing moves between captures, every frame
 * advances exactly 1/FPS s, so renders are deterministic and independent of how slow software GL is.
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

// virtual rAF: auto-pumped (real time) until the trailer takes over with __step(dt). Probes for a clean hand-over:
// __pend() = native frame requests still in flight, __cbs() = callbacks waiting for the next __step
const CLOCK = `(() => {
  const nraf = window.requestAnimationFrame.bind(window);
  let cbs = [], vt = 0, lastT = null, pend = 0;
  window.__vt = () => vt;
  window.__pend = () => pend;
  window.__cbs = () => cbs.length;
  window.__auto = true;
  window.requestAnimationFrame = (cb) => {
    if (window.__auto) { pend++; return nraf((t) => { pend--; if (t !== lastT) { if (lastT != null) vt += Math.min(100, t - lastT); lastT = t; } cb(vt); }); }
    cbs.push(cb); return 0;
  };
  window.__step = (dt) => { window.__auto = false; vt += dt * 1000; const l = cbs; cbs = []; for (const cb of l) { try { cb(vt); } catch (e) { console.error(e && e.stack || e); } } };
})();`;

// The game's own web fonts (VT323 for the VHS OSD, Baloo 2, Yatra One, Noto Sans Telugu, from Google Fonts): fetched
// once with curl into out/fonts_cache and served from there, so UI captures use the real faces (a fetch failure falls
// back to an empty stub = the browser's fallback faces, as before)
const FONTD = path.join(__dirname, 'out', 'fonts_cache');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
async function fontRoute(route) {
  const url = route.request().url();
  const f = path.join(FONTD, crypto.createHash('md5').update(url).digest('hex'));
  const css = /fonts\.googleapis\.com/.test(url);
  if (!fs.existsSync(f)) {
    fs.mkdirSync(FONTD, { recursive: true });
    try { execFileSync('curl', ['-sS', '-f', '-m', '40', '-A', UA, '-o', f + '.tmp', url]); fs.renameSync(f + '.tmp', f); } catch (e) {
      return route.fulfill({ status: 200, contentType: css ? 'text/css' : 'font/woff2', body: css ? '/* offline */' : '' });
    }
  }
  return route.fulfill({ status: 200, contentType: css ? 'text/css; charset=utf-8' : 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
}
const FONT_SAMPLES = [['22px VT323', 'SIDE A 000 12:30'], ['400 20px "Baloo 2"', 'Hyderabad'], ['600 20px "Baloo 2"', 'Amma'], ['800 20px "Baloo 2"', 'A'],
  ['20px "Yatra One"', 'BO KAATA'], ['700 20px "Noto Sans Telugu"', '\u0c2a\u0c24\u0c02\u0c17\u0c4d']];

async function openGame({ width = 1920, height = 1080, scale = 1, log = true } = {}) {
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); if (log) console.log('  [console.error]', m.text().slice(0, 300)); } });
  page.on('pageerror', (e) => { errors.push(e.message); if (log) console.log('  [pageerror]', (e.stack || e.message).slice(0, 400)); });
  await page.addInitScript(CLOCK);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, fontRoute);
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.evaluate((S) => Promise.all(S.map(([f, t]) => document.fonts.load(f, t).catch(() => null))), FONT_SAMPLES);
  await page.evaluate(() => {
    N.menus && (N.menus.quickStart = true);
    N.debug.newGame({ skipIntro: true });
    if (N.world.potholes && N.world.potholes.ensure) N.world.potholes.ensure();
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    if (N.wanted && N.wanted.set) N.wanted.set(0);
    const st = document.createElement('style');
    st.textContent = '#ui,#touch,#debug,#overlay,.toast,.bark{display:none!important}';
    document.head.appendChild(st);
  });
  return { browser, context, page, errors };
}

/** advance the game by n frames of dt seconds (virtual clock), then let the page settle */
async function step(page, n, dt) {
  await page.evaluate(({ n, dt }) => { for (let i = 0; i < n; i++) window.__step(dt); }, { n, dt });
}
/** leave real-time mode: every native frame request still in flight must have fired (it then queues its next frame on
 *  the virtual clock), else the game loop can miss the first __step calls or run twice per step later */
async function takeOver(page) {
  await page.evaluate(() => { window.__auto = false; });
  try { await page.waitForFunction(() => window.__pend() === 0 && window.__cbs() > 0, null, { polling: 100, timeout: 60000 }); }
  catch (e) { await page.waitForTimeout(400); }
}

/** step one frame and grab the 3D canvas in the same task (no preserveDrawingBuffer needed) -> Buffer (jpeg) */
async function stepCapture(page, dt, file, q) {
  const url = await page.evaluate(({ dt, q }) => {
    window.__step(dt);
    const c = N.view3d.H.renderer.domElement;
    return c.toDataURL('image/jpeg', q);
  }, { dt, q: q || 0.95 });
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (file) fs.writeFileSync(file, buf);
  return buf;
}

module.exports = { openGame, step, takeOver, stepCapture, ROOT };
