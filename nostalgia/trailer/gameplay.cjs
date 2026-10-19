/* NOSTALGIA trailer — render the gameplay clips (timeline segments of kind 'game').
 *   node trailer/gameplay.cjs [W H]   env: ONLY=clip1,clip2  EVERY=n  OUTD=dir
 *   -> trailer/out/frames/<segment id>/%05d.(jpg|png)  3D: full-res JPEG; top-down: the game's internal canvas (PNG,
 *      upscaled with nearest-neighbour at assembly so the pixel art stays crisp) */
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, takeOver } = require('./lib.cjs');
const W = +(process.argv[2] || 3840), H = +(process.argv[3] || 2160);
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), EVERY = +(process.env.EVERY || 1);
const OUTD = process.env.OUTD || path.join(__dirname, 'out', 'frames');
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
(async () => {
  const segs = TL.segments.filter((s) => s.kind === 'game' && (!ONLY.length || ONLY.includes(s.clip) || ONLY.includes(s.id)));
  const { browser, page, errors } = await openGame({ width: W, height: H });
  await page.addScriptTag({ path: path.join(__dirname, 'stage.js') });
  await page.addScriptTag({ path: path.join(__dirname, 'gameplay_page.js') });
  await page.evaluate((aa) => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1, antialias: aa, drawDist: 2200 }); N.view.set('tps'); }, process.env.AA === '1');
  await page.waitForFunction(() => N.view3d && N.view3d.active && N.models3d && N.models3d.ready, null, { timeout: 300000 });
  await takeOver(page);
  await page.evaluate(() => { STAGE.setup(); N.player.hidden = false; });
  for (const seg of segs) {
    const nf = seg.n * TL.beatFrames, dir = path.join(OUTD, seg.id);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    const info = await page.evaluate(({ id, nf }) => CLIP_PREP(id, nf), { id: seg.clip, nf });
    console.log(seg.id, JSON.stringify(info));
    for (let f = 0; f < nf; f++) {
      const cap = f % EVERY === 0;
      const url = await page.evaluate((cap) => CLIP_FRAME(cap), cap);
      if (cap && url) fs.writeFileSync(path.join(dir, String(f).padStart(5, '0') + (url.startsWith('data:image/png') ? '.png' : '.jpg')), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    }
    console.log(seg.id, 'done', nf, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  console.log('errors', errors.length, errors.slice(0, 5));
  await browser.close();
})();
