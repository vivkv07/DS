/* NOSTALGIA trailer — shared capture helpers (Playwright + the real game, frame-stepped).
 * The game runs on a virtual requestAnimationFrame clock: nothing moves between captures, every frame
 * advances exactly 1/FPS s, so renders are deterministic and independent of how slow software GL is.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// virtual rAF: auto-pumped (real time) until the trailer takes over with __step(dt)
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

async function openGame({ width = 1920, height = 1080, scale = 1, log = true } = {}) {
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); if (log) console.log('  [console.error]', m.text().slice(0, 300)); } });
  page.on('pageerror', (e) => { errors.push(e.message); if (log) console.log('  [pageerror]', (e.stack || e.message).slice(0, 400)); });
  await page.addInitScript(CLOCK);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
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
/** leave real-time mode: wait for in-flight native frames, then the virtual clock owns the loop */
async function takeOver(page) {
  await page.evaluate(() => { window.__auto = false; });
  await page.waitForTimeout(400);
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
