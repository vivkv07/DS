/* NOSTALGIA trailer — the two shots that show the real game HUD (clock, money, energy, Chappal Meter, minimap):
 *   g_top_chase      "MIND THE CHAPPAL METER"   top-down: Chinnu runs from Pochaiah's Luna, the meter ratchets 3 -> 5, Mummy's
 *                                               auto cuts him off, her homing chappal hits: THUP! + PAKDA GAYA! (the game's own)
 *   g_top_charminar  "PLAY IN 3D OR TOP-DOWN"   3D third person on the cycle riding at Charminar, then N.view.set('top') on
 *                                               the beat (f36; the game's switch is instant, it has no transition)
 *   (the shot scripts and every staging liberty are in hud_page.js, SHOTS)
 *
 *   node trailer/hud_shots.cjs [W H]      viewport in CSS px (default 1920 1080), captured at SCALE device px per CSS px
 *     env: ONLY=g_top_chase,chase         segment ids or shot ids
 *          SCALE=n                        deviceScaleFactor (default: 3840 / W landscape, 2160 / W portrait, i.e. 1920x1080
 *                                         x2 -> 3840x2160). Portrait: node trailer/hud_shots.cjs 540 960 (x4 -> 2160x3840):
 *                                         a 540-px-wide viewport is the game's own upright-phone HUD layout (its max-width
 *                                         600 px media query: minimap under the OSD, big stats)
 *          OUTD=dir                       default trailer/out/frames2 (landscape) / trailer/out/frames2_v (portrait)
 *          PR3D=n                         3D renderer pixel ratio (default 2560 / W landscape, 1440 / W portrait: the 3D at
 *                                         ~1440p, the HUD is DOM and always rasterised at SCALE)
 *          EVERY=n                        capture every n-th frame only (quick look; files keep their frame index)
 *          Q=92                           JPEG quality
 *          SHOT_<id>='{json}'             override a shot's options (HUD_SHOTS_OVERRIDE in hud_page.js) for try-outs
 *   -> OUTD/<segment id>/%05d.jpg, exactly n*beatFrames frames (the dir is emptied first)
 *   node trailer/hud_shots.cjs qa          contact sheets out/qa_hud_landscape.jpg, out/qa_hud_portrait.jpg
 * Full-page frames via CDP Page.captureScreenshot (page.screenshot waits for rAF, which the virtual clock owns).
 * One browser per segment (fresh game state: the chase leaves pursuers, traffic and wanted heat behind).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
// QA: node trailer/hud_shots.cjs qa -> out/qa_hud_landscape.jpg + out/qa_hud_portrait.jpg (8 labelled frames per
// clip from frames2 / frames2_v: the meter states, Mummy, the chappal, the hit, the banner; 3D, the switch, top-down)
if (process.argv[2] === 'qa') {
  const QAF = { g_top_chase: [0, 5, 10, 24, 36, 42, 56, 68], g_top_charminar: [0, 12, 24, 35, 36, 48, 60, 71] };
  for (const [od, name, tw] of [['frames2', 'qa_hud_landscape.jpg', 640], ['frames2_v', 'qa_hud_portrait.jpg', 300]]) {
    const args = [];
    for (const id of Object.keys(QAF)) for (const f of QAF[id]) {
      const file = path.join(__dirname, 'out', od, id, String(f).padStart(5, '0') + '.jpg');
      if (fs.existsSync(file)) args.push('-label', id + ' f' + f, file);
    }
    const out = path.join(__dirname, 'out', name);
    execFileSync('montage', [...args, '-resize', tw + 'x', '-tile', '8x', '-geometry', '+3+3', '-background', '#111', '-fill', '#ddd', '-font', 'DejaVu-Sans-Mono', '-pointsize', '12', '-quality', '88', out]);
    console.log('->', out);
  }
  process.exit(0);
}
const { openGame, takeOver } = require('./lib.cjs');
const W = +(process.argv[2] || 1920), H = +(process.argv[3] || 1080);
const PORTRAIT = H > W;
// default: 3840x2160 / 2160x3840 frames whatever the CSS viewport
const SCALE = +(process.env.SCALE || (PORTRAIT ? 2160 : 3840) / W);
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
    // portrait: the same run across the frame (the portrait canvas is 434 internal px wide vs 768: zoom 3 shows ~150 u
    // across, the landscape shot ~200 u at 4); the action stays on the middle band, clear of the HUD at the top and of
    // the lower-third caption (58-73% of the height). The phone layout's bubbles are already big: 1.3x
    if (PORTRAIT) {
      over.chase = Object.assign({ zoom: 3, barkScale: 1.3 }, over.chase || {});
      // (and the top-down half of the Charminar shot a step wider: the roundabout and Charminar stay in the narrow frame)
      over.charminar = Object.assign({ zoom: 1.3 }, over.charminar || {});
    }
    // (HUDDBG=1: the chaser's vehicle controls + obstacle in the per-frame log)
    await page.evaluate(({ o, dbg }) => { window.HUD_SHOTS_OVERRIDE = o; window.HUDDBG = dbg; }, { o: over, dbg: !!process.env.HUDDBG });
    await page.addScriptTag({ path: path.join(__dirname, 'hud_page.js') });
    const pr = +(process.env.PR3D || (PORTRAIT ? 1440 : 2560) / W); // 3D at ~1440p internally (software GL is slow)
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
    for (let f = 0; f < nf; f++) {
      const st = await page.evaluate(() => HUDSHOT.frame());
      if (st.log.length || f % 6 === 0) console.log('  f' + f, JSON.stringify(st));
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
