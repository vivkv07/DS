/* NOSTALGIA — tools/perf/og_card.cjs
 * Build-time share preview (Open Graph / WhatsApp card) rendered from the game itself: boots the
 * single-file build headless at 1200x630, waits for the procedural title screen (city + cassette
 * J-card) and saves JPEGs at a few qualities, so the repo never has to carry a binary image.
 * WhatsApp only shows the thumbnail for small images (~300 KB is the commonly reported ceiling),
 * so it prints the sizes against that budget.
 *
 *   node nostalgia/tools/perf/og_card.cjs --page <dist/nostalgia.html> --out <dir> [--fonts <google fonts dir>]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PAGE = path.resolve(arg('--page', path.join(__dirname, '..', '..', 'dist', 'nostalgia.html')));
const OUT = path.resolve(arg('--out', '.'));
const FONTS = arg('--fonts', null);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  // fonts: real Google Fonts files from a local mirror when given, else stubbed (fallback fonts)
  const list = FONTS && fs.existsSync(path.join(FONTS, 'list.json')) ? JSON.parse(fs.readFileSync(path.join(FONTS, 'list.json'), 'utf8')) : [];
  const byPath = {};
  for (const f of list) { const p = path.join(FONTS, f.fam.replace(/ /g, '_') + '_' + f.w + '_' + f.subset + '.woff2'); if (!byPath[new URL(f.url).pathname] && fs.existsSync(p)) byPath[new URL(f.url).pathname] = p; }
  // menus.js asks for Kalam with its own css2 URL
  const cssFor = (u) => { const fam = (new URL(u).searchParams.getAll('family')[0] || '').split(':')[0].toLowerCase().replace(/[^a-z0-9]/g, ''); const own = FONTS && path.join(FONTS, fam + '.css'); return own && fs.existsSync(own) && new URL(u).searchParams.getAll('family').length === 1 ? own : FONTS && path.join(FONTS, 'fonts.css'); };
  await page.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: FONTS ? fs.readFileSync(cssFor(r.request().url()), 'utf8') : '' }));
  await page.route(/fonts\.gstatic\.com/, (r) => { const p = byPath[new URL(r.request().url()).pathname]; return p ? r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(p) }) : r.abort(); });
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.goto('file://' + PAGE);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 600000, polling: 250 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(2500);
  const rows = [];
  for (const q of [80, 70, 60]) {
    const file = path.join(OUT, 'og_q' + q + '.jpg');
    await page.screenshot({ path: file, type: 'jpeg', quality: q });
    rows.push({ file, kb: +(fs.statSync(file).size / 1024).toFixed(1) });
  }
  const png = path.join(OUT, 'og.png');
  await page.screenshot({ path: png, type: 'png' });
  rows.push({ file: png, kb: +(fs.statSync(png).size / 1024).toFixed(1) });
  for (const r of rows) console.log(path.basename(r.file).padEnd(12) + String(r.kb).padStart(8) + ' KB  ' + (r.kb <= 300 ? 'ok for WhatsApp (<= 300 KB)' : 'too big for WhatsApp thumbnails'));
  fs.writeFileSync(path.join(OUT, 'og.json'), JSON.stringify(rows, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
