/* NOSTALGIA trailer — render the 2D graphics from timeline.json:
 *   - cards / skyline title / end card            -> <OUTD>/<seg>/%05d.jpg (opaque)
 *   - v2 caption lower-thirds (segments with cap)  -> <OUTD>/<seg>_cap/%05d.png (transparent, whole segment: n*beatFrames)
 *   - v1 rain lower-third (segments with overlay)  -> <OUTD>/<seg>_overlay/%05d.png
 *   node trailer/render_titles.cjs [W H]
 *   env: OUTD=dir (default out/frames2 for landscape, out/frames2_v for portrait; out/frames for a v1 timeline)
 *        ONLY=id[,id...] (segment ids, '<id>_cap' / '<id>_overlay' for overlays; 'caps' = all captions, 'titles' = cards+title+end)
 *        EVERY=n (preview: every n-th frame of the cards/title/end card) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const W = +(process.argv[2] || 3840), H = +(process.argv[3] || 2160);
const EVERY = +(process.env.EVERY || 1);
const ONLY = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const OUTD = process.env.OUTD || path.join(__dirname, 'out', (TL.version || 1) >= 2 ? (H > W ? 'frames2_v' : 'frames2') : 'frames');
const want = (id, group) => !ONLY.length || ONLY.includes(id) || ONLY.includes(group);
const freshDir = (dir) => { fs.mkdirSync(dir, { recursive: true }); for (const f of fs.readdirSync(dir)) if (/\.(png|jpg)$/.test(f)) fs.unlinkSync(path.join(dir, f)); };
const fname = (f, ext) => String(f).padStart(5, '0') + ext;
(async () => {
  const B = 60 / TL.bpm, FPS = TL.fps;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.setContent(`<canvas id=c width=${W} height=${H}></canvas>`);
  await p.addScriptTag({ path: path.join(__dirname, 'titles.js') });
  await p.evaluate(() => Promise.all([300, 500, 600, 700, 800, 900].map((w) => document.fonts.load(w + ' 100px "Inter Display"'))));
  console.log('->', OUTD, W + 'x' + H);
  let prevAct = null;
  for (const seg of TL.segments) {
    // v2 captions: kicker (act) + caption; the first segment of an act gets the prominent kicker
    const first = !!seg.act && seg.act !== prevAct;
    if (seg.act) prevAct = seg.act;
    if (seg.cap && want(seg.id + '_cap', 'caps')) {
      const dir = path.join(OUTD, seg.id + '_cap'); freshDir(dir);
      const nf = seg.n * TL.beatFrames, opt = { first, fps: FPS }, t0 = Date.now();
      let blank = null, hold = null, drawn = 0;
      for (let f = 0; f < nf; f++) {
        const t = f / FPS, out = path.join(dir, fname(f, '.png'));
        const ph = await p.evaluate(({ seg, t, B, opt }) => TITLES.capPhase(seg, t, B, opt), { seg, t, B, opt });
        if (ph === 'blank' && blank) { fs.copyFileSync(blank, out); continue; }
        if (ph === 'hold' && hold) { fs.copyFileSync(hold, out); continue; }
        const url = await p.evaluate(({ seg, t, B, opt }) => { const c = document.getElementById('c'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.clearRect(0, 0, c.width, c.height); TITLES.caption(x, seg, t, c.width, c.height, B, opt); return c.toDataURL('image/png'); }, { seg, t, B, opt });
        fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); drawn++;
        if (ph === 'blank') blank = out; else if (ph === 'hold') hold = out;
      }
      console.log(seg.id + '_cap', nf, 'frames', first ? '(act opener)' : '', drawn, 'drawn', Date.now() - t0, 'ms');
    }
    if (seg.overlay && want(seg.id + '_overlay', 'overlays')) { // v1: transparent lower-third frames for a 3D segment
      const dir = path.join(OUTD, seg.id + '_overlay'); freshDir(dir);
      const nf = seg.overlay.n * TL.beatFrames;
      for (let f = 0; f < nf; f++) {
        const url = await p.evaluate(({ ov, t }) => { const c = document.getElementById('c'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); TITLES.overlay(x, ov, t, c.width, c.height); return c.toDataURL('image/png'); }, { ov: seg.overlay, t: f / FPS });
        fs.writeFileSync(path.join(dir, fname(f, '.png')), Buffer.from(url.split(',')[1], 'base64'));
      }
      console.log(seg.id + '_overlay', nf, 'frames');
    }
    if (!['card', 'title', 'end'].includes(seg.kind)) continue;
    if (!want(seg.id, 'titles')) continue;
    const dir = path.join(OUTD, seg.id); freshDir(dir);
    const nf = seg.n * TL.beatFrames;
    const t0 = Date.now();
    for (let f = 0; f < nf; f += EVERY) {
      const url = await p.evaluate(({ seg, t, B }) => { const c = document.getElementById('c'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; TITLES.draw(x, seg, t, c.width, c.height, B); return c.toDataURL('image/jpeg', 0.95); }, { seg, t: f / FPS, B });
      fs.writeFileSync(path.join(dir, fname(f, '.jpg')), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(seg.id, nf, 'frames', Date.now() - t0, 'ms');
  }
  await b.close();
})();
