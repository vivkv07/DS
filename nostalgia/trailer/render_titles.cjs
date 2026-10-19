/* NOSTALGIA trailer — render the 2D segments (cards, skyline title, end card) to JPEG frames.
 *   node trailer/render_titles.cjs [W H] [ONLY=segId] [EVERY=n (preview: every n-th frame)]  -> trailer/out/frames/<seg>/%05d.jpg */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const W = +(process.argv[2] || 3840), H = +(process.argv[3] || 2160);
const ONLY = process.env.ONLY || '', EVERY = +(process.env.EVERY || 1);
const OUTD = process.env.OUTD || path.join(__dirname, 'out', 'frames');
(async () => {
  const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
  const B = 60 / TL.bpm, FPS = TL.fps;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.setContent(`<canvas id=c width=${W} height=${H}></canvas>`);
  await p.addScriptTag({ path: path.join(__dirname, 'titles.js') });
  await p.evaluate(() => document.fonts.load('900 100px "Inter Display"').then(() => document.fonts.load('300 100px "Inter Display"')));
  for (const seg of TL.segments) {
    if (seg.overlay && (!ONLY || ONLY === seg.id + '_overlay')) { // transparent lower-third frames for a 3D segment
      const dir = path.join(OUTD, seg.id + '_overlay'); fs.mkdirSync(dir, { recursive: true });
      const nf = seg.overlay.n * TL.beatFrames;
      for (let f = 0; f < nf; f++) {
        const url = await p.evaluate(({ ov, t }) => { const c = document.getElementById('c'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); TITLES.overlay(x, ov, t, c.width, c.height); return c.toDataURL('image/png'); }, { ov: seg.overlay, t: f / FPS });
        fs.writeFileSync(path.join(dir, String(f).padStart(5, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      }
      console.log(seg.id + '_overlay', nf, 'frames');
    }
    if (!['card', 'title', 'end'].includes(seg.kind)) continue;
    if (ONLY && seg.id !== ONLY) continue;
    const dir = path.join(OUTD, seg.id); fs.mkdirSync(dir, { recursive: true });
    const nf = seg.n * TL.beatFrames;
    const t0 = Date.now();
    for (let f = 0; f < nf; f += EVERY) {
      const url = await p.evaluate(({ seg, t, B }) => { const c = document.getElementById('c'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); TITLES.draw(x, seg, t, c.width, c.height, B); return c.toDataURL('image/jpeg', 0.95); }, { seg, t: f / FPS, B });
      fs.writeFileSync(path.join(dir, String(f).padStart(5, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(seg.id, nf, 'frames', Date.now() - t0, 'ms');
  }
  await b.close();
})();
