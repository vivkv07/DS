// Render every motion/*.html page to a looping GIF (and keep an MP4 too).
// Usage: NODE_PATH=$(npm root -g) node tools/render.mjs [name ...]
// Each page declares its loop length in ms via <meta name="duration" content="10000">.
// The renderer pauses all Web Animations and seeks them frame by frame, so the
// output is deterministic regardless of machine speed.
import { chromium } from 'playwright';
import { readdirSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const motionDir = join(root, 'motion');
const gifDir = join(root, 'gifs');
const FPS = 20;
const OUT_W = 800;           // GIF width; source stage is 1200x675
const ffmpeg = process.env.FFMPEG || findFfmpeg();

function findFfmpeg() {
  const base = '/opt/pw-browsers';
  if (existsSync(base)) for (const d of readdirSync(base)) if (d.startsWith('ffmpeg')) {
    for (const f of readdirSync(join(base, d))) if (f.startsWith('ffmpeg')) return join(base, d, f);
  }
  return 'ffmpeg';
}

const only = process.argv.slice(2);
const pages = readdirSync(motionDir).filter(f => f.endsWith('.html') && !f.startsWith('_'))
  .filter(f => only.length === 0 || only.some(o => f.includes(o)));

mkdirSync(gifDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });

for (const file of pages) {
  const name = file.replace(/\.html$/, '');
  const html = readFileSync(join(motionDir, file), 'utf8');
  const duration = Number((html.match(/name="duration" content="(\d+)"/) || [])[1] || 10000);
  const frames = Math.round(duration / 1000 * FPS);
  const tmp = join(root, 'tools', '.frames', name);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  await page.goto('file://' + join(motionDir, file));
  await page.waitForTimeout(150);
  await page.evaluate(() => { for (const a of document.getAnimations()) a.pause(); });

  process.stdout.write(`${name}: ${frames} frames `);
  for (let i = 0; i < frames; i++) {
    const t = i / FPS * 1000;
    await page.evaluate((t) => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; }
      if (typeof window.seek === 'function') window.seek(t);
    }, t);
    await page.screenshot({ path: join(tmp, String(i).padStart(4, '0') + '.png') });
    if (i % 20 === 0) process.stdout.write('.');
  }
  const gif = join(gifDir, name + '.gif');
  const mp4 = join(gifDir, name + '.mp4');
  const vf = `fps=${FPS},scale=${OUT_W}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a`;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(tmp, '%04d.png'), '-vf', vf, '-loop', '0', gif]);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(tmp, '%04d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-vf', 'scale=1200:-2', mp4]);
  rmSync(tmp, { recursive: true, force: true });
  console.log(` -> ${name}.gif / .mp4`);
}
await browser.close();
