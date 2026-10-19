/* NOSTALGIA trailer — render the 3D drone shots (timeline segments of kind '3d') to JPEG frames.
 *   node trailer/shots3d.cjs [W H]   env: ONLY=id1,id2  EVERY=n (preview)  OUTD=dir  AA=0|1
 *   -> trailer/out/frames/<segment id>/%05d.jpg  (frame index within the segment, 30 fps)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, takeOver } = require('./lib.cjs');
const W = +(process.argv[2] || 3840), H = +(process.argv[3] || 2160);
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), EVERY = +(process.env.EVERY || 1);
const OUTD = process.env.OUTD || path.join(__dirname, 'out', 'frames');
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const B = 60 / TL.bpm, FPS = TL.fps;

// per-shot staging. hero: 'top' = on the landmark's summit; 'roof' = the tallest flat roof near it
// (religious sites: never on the monument itself); 'spot' = an explicit world point.
const SHOTS = {
  reveal: { lm: 'charminar', hero: 'top', scale: 0.45, clip: 'idle_look', face: Math.PI / 2 },
  whip: { lm: 'charminar', hero: 'top', scale: 0.45, clip: 'idle', face: Math.PI / 2 },
  lm_charminar: { lm: 'charminar', hero: 'top', scale: 0.45, edge: 26, clip: 'idle_look', face: Math.PI / 2, r: [15, 34], h: [13, 22], arc: 1.9, base: 1.2, fov: [42, 52] },
  lm_golconda: { lm: 'golconda_bala_hissar', hero: 'top', scale: 0.5, edge: 14, summitR: 30, clip: 'wave', face: 0.4, r: [16, 40], h: [7, 20], arc: 1.6, base: 1.9, fov: [44, 54] },
  lm_buddha: { lm: 'buddha_statue', hero: 'shore', slide: 14, noWires: true, clip: 'idle_look', r: [14, 26], h: [5, 10], arc: 1.1, fov: [38, 46] },
  lm_birla: { lm: 'birla_mandir', hero: 'roof', noWires: true, ring: [70, 260], clip: 'idle', r: [14, 26], h: [6, 12], arc: 1.2, fov: [40, 48] },
  lm_clock: { lm: 'secunderabad_clock_tower', hero: 'roof', ring: [40, 180], noWires: true, clip: 'idle', r: [14, 30], h: [5, 14], arc: 1.2, fov: [42, 52] }, // the tower's top is a steep pyramid: a nearby roof, the tower behind
  lm_cyber: { lm: 'cyber_towers', hero: 'top', scale: 0.55, edge: 14, clip: 'idle_look', face: Math.PI, r: [20, 40], h: [-14, 6], arc: 1.5, base: Math.PI, fov: [48, 58] },
  lm_mecca: { lm: 'mecca_masjid', hero: 'roof', noWires: true, ring: [80, 220], clip: 'idle_look', r: [14, 26], h: [6, 12], arc: 1.2, fov: [40, 48] },
  lm_tankbund: { lm: 'tank_bund', hero: 'bund', clip: 'kite_fly', r: [18, 34], h: [12, 26], arc: 1.3, fov: [46, 54] },
  rain: { lm: 'charminar', hero: 'top', scale: 0.45, edge: 26, clip: 'idle', face: Math.PI / 2 },
};

(async () => {
  const segs = TL.segments.filter((s) => s.kind === '3d' && (!ONLY.length || ONLY.includes(s.id)));
  const { browser, page, errors } = await openGame({ width: W, height: H });
  await page.addScriptTag({ path: path.join(__dirname, 'stage.js') });
  await page.addScriptTag({ path: path.join(__dirname, 'shots3d_page.js') });
  await page.evaluate((o) => {
    N.view3d.setQuality({ adaptive: false, pixelRatio: 1, antialias: o.aa, drawDist: o.draw }); window.WARM = o.warm;
    N.view.set('tps');
  }, { aa: process.env.AA === '1', draw: +(process.env.DRAW || 1500), warm: +(process.env.WARM || 0) || undefined });
  await page.waitForFunction(() => N.view3d && N.view3d.active && N.models3d && N.models3d.ready, null, { timeout: 300000 });
  await takeOver(page);
  await page.evaluate(() => { STAGE.setup(); if (N.birds) N.birds.enabled = true; });
  for (const seg of segs) {
    const sh = SHOTS[seg.id] || SHOTS[seg.shot];
    const dir = path.join(OUTD, seg.id); fs.mkdirSync(dir, { recursive: true });
    const nf = seg.n * TL.beatFrames;
    const t0 = Date.now();
    // stage: time of day, weather, hero position, warm-up (chunks, birds, traffic, wet roads)
    const st = await page.evaluate(({ seg, sh }) => STAGE_PREP(seg, sh), { seg, sh });
    console.log(seg.id, JSON.stringify(st));
    for (let f = 0; f < nf; f++) {
      const cap = f % EVERY === 0;
      const url = await page.evaluate(({ f, nf, cap }) => STAGE_FRAME(f, nf, cap), { f, nf, cap });
      if (cap && url) fs.writeFileSync(path.join(dir, String(f).padStart(5, '0') + '.jpg'), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      if (cap && f % (EVERY * 24) === 0) process.stdout.write(`  ${seg.id} ${f}/${nf} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    }
    console.log(seg.id, 'done', nf, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  console.log('errors', errors.length, errors.slice(0, 5));
  await browser.close();
})();
