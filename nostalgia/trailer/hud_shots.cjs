/* NOSTALGIA trailer — the two shots that show the real game HUD (clock, money, energy, Chappal Meter, minimap):
 *   g_top_chase      "MIND THE CHAPPAL METER"   top-down, the meter climbing while the wanted system's pursuers close in
 *   g_top_charminar  "PLAY IN 3D OR TOP-DOWN"   3D third person on the cycle by Charminar, then N.view.set('top') on the beat
 *
 *   node trailer/hud_shots.cjs [W H]      viewport in CSS px (default 1920 1080), captured at SCALE device px per CSS px
 *     env: ONLY=g_top_chase,chase         segment ids or shot ids
 *          SCALE=2                        deviceScaleFactor (1920x1080 x2 -> 3840x2160; portrait 540x960 x4 -> 2160x3840)
 *          OUTD=dir                       default trailer/out/frames2 (landscape) / trailer/out/frames2_v (portrait)
 *          PR3D=1.3333                    3D renderer pixel ratio (CSS px -> GL px; the HUD is DOM, always at SCALE)
 *          EVERY=n                        capture every n-th frame only (quick look; files keep their frame index)
 *          Q=92                           JPEG quality
 *          SHOT_<id>='{json}'             override a shot's options (HUD_SHOTS_OVERRIDE in hud_page.js) for try-outs
 *   -> OUTD/<segment id>/%05d.jpg, exactly n*beatFrames frames (the dir is emptied first)
 * Full-page frames via CDP Page.captureScreenshot (page.screenshot waits for rAF, which the virtual clock owns).
 * One browser per segment (fresh game state: the chase leaves pursuers, traffic and wanted heat behind).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { openGame, takeOver } = require('./lib.cjs');
const W = +(process.argv[2] || 1920), H = +(process.argv[3] || 1080);
const SCALE = +(process.env.SCALE || 2);
const PORTRAIT = H > W;
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean), EVERY = +(process.env.EVERY || 1);
const OUTD = process.env.OUTD || path.join(__dirname, 'out', PORTRAIT ? 'frames2_v' : 'frames2');
const Q = +(process.env.Q || 92);
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const FPS = TL.fps || 30;
// timeline clip id -> shot id in hud_page.js
const SEGS = [{ id: 'g_top_chase', shot: 'chase' }, { id: 'g_top_charminar', shot: 'charminar' }];

(async () => {
  const todo = SEGS.filter((s) => !ONLY.length || ONLY.includes(s.id) || ONLY.includes(s.shot));
  for (const S of todo) {
    const seg = TL.segments.find((s) => s.id === S.id);
    const nf = seg.n * TL.beatFrames;
    const t0 = Date.now();
    const { browser, context, page, errors } = await openGame({ width: W, height: H, scale: SCALE });
    const over = {};
    for (const k of Object.keys(process.env)) if (k.startsWith('SHOT_')) over[k.slice(5)] = JSON.parse(process.env[k]);
    // portrait: the same shots, the chase runs north-south (the frame is tall)
    if (PORTRAIT) {
      over.chase = Object.assign({ dir: -Math.PI / 2 }, over.chase || {});
    }
    await page.evaluate((o) => { window.HUD_SHOTS_OVERRIDE = o; }, over);
    await page.addScriptTag({ path: path.join(__dirname, 'hud_page.js') });
    const pr = +(process.env.PR3D || (PORTRAIT ? 2.6667 : 1.3333));
    await page.evaluate((pr) => { N.view3d.setQuality({ adaptive: false, pixelRatio: pr, antialias: true, drawDist: 1500 }); }, pr);
    const shotView = await page.evaluate((id) => HUDSHOT.SHOTS[id].view, S.shot);
    if (shotView !== 'top') {
      await page.evaluate(() => N.view.set('tps'));
      await page.waitForFunction(() => N.view3d && N.view3d.active && N.models3d && N.models3d.ready, null, { timeout: 300000 });
    }
    await takeOver(page);
    // under load the last native frame can land after takeOver's 400 ms: wait until a virtual step really runs a frame
    for (let k = 0; k < 200; k++) {
      if (await page.evaluate(() => { const r0 = N.time.real; window.__step(1 / 30); return N.time.real > r0; })) break;
      await page.waitForTimeout(100);
    }
    const setup = await page.evaluate(() => HUDSHOT.setup({ money: 1250 }));
    const info = await page.evaluate(({ id, nf }) => HUDSHOT.prep(id, nf), { id: S.shot, nf });
    console.log(S.id, 'ready in', ((Date.now() - t0) / 1000).toFixed(0), 's', JSON.stringify(setup), JSON.stringify(info));
    const cdp = await context.newCDPSession(page);
    const dir = path.join(OUTD, S.id);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    let last = '';
    for (let f = 0; f < nf; f++) {
      const st = await page.evaluate(() => HUDSHOT.frame());
      const key = st.level + '|' + st.view + '|' + st.pursuers.join(',') + '|' + st.chappal;
      if (st.log.length || key !== last || f % 18 === 0) console.log('  f' + f, JSON.stringify(st));
      last = key;
      if (f % EVERY === 0) {
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Q, clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
        fs.writeFileSync(path.join(dir, String(f).padStart(5, '0') + '.jpg'), Buffer.from(r.data, 'base64'));
      }
      if (f % 18 === 17) console.log(' ', S.id, f + 1, '/', nf, ((Date.now() - t0) / 1000).toFixed(0) + 's');
    }
    console.log(S.id, 'done:', nf, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's; errors', errors.length, errors.slice(0, 3));
    await browser.close();
  }
})();
