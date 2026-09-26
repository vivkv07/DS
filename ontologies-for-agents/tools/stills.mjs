// Quick layout check: screenshot each motion page at several timeline points.
import { chromium } from 'playwright';
import { readdirSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2]; const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
for (const f of readdirSync(join(root, 'motion')).filter(f => f.endsWith('.html') && !f.startsWith('_'))) {
  if (only.length && !only.some(o => f.includes(o))) continue;
  const dur = Number((readFileSync(join(root, 'motion', f), 'utf8').match(/name="duration" content="(\d+)"/) || [])[1] || 10000);
  await page.goto('file://' + join(root, 'motion', f)); await page.waitForTimeout(150);
  for (const pct of [30, 60, 97]) {
    await page.evaluate(t => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, dur * pct / 100);
    await page.screenshot({ path: join(out, `${f.replace('.html','')}_${pct}.png`) });
  }
}
await browser.close(); console.log('ok');
