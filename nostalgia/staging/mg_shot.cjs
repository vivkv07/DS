/* Dev harness: open staging/mg_lab.html, play one minigame, take screenshots.
 *   node nostalgia/staging/mg_shot.cjs <id> [vp=desktop|portrait|landscape] [mode=howto|play|win|lose] [params-json]
 * Screenshots -> nostalgia/tests/out/minigames/dev_<id>_<vp>_<n>.png
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const OUT = path.join(__dirname, '..', 'tests', 'out', 'minigames');
fs.mkdirSync(OUT, { recursive: true });
const id = process.argv[2] || 'kite';
const vpName = process.argv[3] || 'desktop';
const mode = process.argv[4] || 'win';
const extra = process.argv[5] ? JSON.parse(process.argv[5]) : {};
const VPS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(VPS[vpName]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (process.env.LOG) console.log('log:', m.text()); });
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('file://' + path.join(__dirname, 'mg_lab.html'));
  await page.waitForFunction(() => window.N && N.minigames && N.minigames.list().length > 0);
  const params = Object.assign({ difficulty: 0.4, seed: 7, autoClose: false }, extra);
  if (mode === 'win' || mode === 'lose') params.autoplay = mode;
  await page.evaluate(([id, p]) => { window.__res = null; N.minigames.play(id, p).then((r) => { window.__res = r; }); }, [id, params]);
  let n = 0;
  const shot = async (tag) => { const f = path.join(OUT, 'dev_' + id + '_' + vpName + '_' + (n++) + '_' + tag + '.png'); await page.screenshot({ path: f }); console.log('shot', f); };
  await sleep(500);
  await shot('howto');
  if (mode === 'howto') { await browser.close(); return; }
  await page.click('.mg-card button.primary');
  const times = (process.env.T || '1500,3000,5000').split(',').map(Number);
  let lastT = 0;
  for (const t of times) {
    await sleep(t - lastT); lastT = t;
    await shot('t' + t);
  }
  if (mode === 'win' || mode === 'lose') {
    await page.waitForFunction(() => N.minigames.game && N.minigames.game.phase === 'result', null, { timeout: 90000 }).catch(() => console.log('NO RESULT'));
    await sleep(800);
    await shot('result');
    await page.click('.mg-card button[data-do=done]');
    await page.waitForFunction(() => window.__res, null, { timeout: 5000 }).catch(() => {});
    console.log('result', JSON.stringify(await page.evaluate(() => window.__res)));
  }
  const errs = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n').slice(0, 3).join(' | ')));
  console.log('errors:', errors.length + errs.length, errors.concat(errs).join('\n'));
  await browser.close();
})();
