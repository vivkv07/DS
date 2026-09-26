// Render infographic.html to a full-page PNG (2x for crispness) and a 1x preview.
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
for (const [scale, name] of [[2, 'infographic.png'], [1, 'infographic_preview.png']]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: scale });
  await page.goto('file://' + join(root, 'infographic.html'));
  await page.waitForTimeout(200);
  const out = name === 'infographic.png' ? join(root, name) : join(process.argv[2] || root, name);
  await page.screenshot({ path: out, fullPage: true });
  console.log(name, await page.evaluate(() => document.body.scrollHeight));
  await page.close();
}
await browser.close();
