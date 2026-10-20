/* NOSTALGIA trailer v2 — capture the full-screen minigame clips (timeline segments of kind 'mg').
 *   node trailer/activities.cjs [W H]     viewport in CSS px (default 1920 1080), rendered at SCALE (default 2)
 *     env: ONLY=a_kite,cricket   segment ids or game ids
 *          OUTD=dir              (default trailer/out/frames2 for landscape, trailer/out/frames2_v for portrait)
 *          SCALE=2               deviceScaleFactor (1920x1080 x2 -> 3840x2160; 1080x1920 x2 -> 2160x3840)
 *          EVERY=n               capture every n-th frame only (quick look; frame files keep their index)
 *          PRE_<game>=frames     override a game's pre-roll (frames at 30 fps stepped before the first capture)
 *          SURVEY=k,len          instead of the clip: capture every k-th frame of the first len frames
 *                                (to OUTD/<id>/sNNNNN.jpg) with a status log, to pick a pre-roll
 *          Q=92                  JPEG quality
 *          P_<game>='{json}'     extra N.minigames.play params, T_<game>='{json}' TUNE overrides (try-outs)
 *          TOUCH=0|1             force the touch-button layout off / on (default: per game, portrait only)
 *   -> OUTD/<segment id>/%05d.jpg  exactly n*beatFrames frames per segment
 * The game runs on the virtual rAF clock (lib.cjs); each frame steps 1/30 s and is grabbed with CDP
 * Page.captureScreenshot (the whole page: minigame canvas + its DOM top bar). The minigames are played by
 * their built-in test bot (autoplay 'win') at real speed (timeScale 1), how-to skipped.
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
const SURVEY = process.env.SURVEY ? process.env.SURVEY.split(',').map(Number) : null;
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const FPS = TL.fps || 30, DT = 1 / FPS;

// per game: params for N.minigames.play + pre-roll (frames stepped, not captured, after play());
// preV = portrait pre-roll when the portrait layout plays out differently
const GAMES = {
  kite: { params: { difficulty: 0.4, seed: 11 }, pre: 300 },
  cricket: { params: { difficulty: 0.4, seed: 5 }, pre: 200 },
  marbles: { params: { difficulty: 0.4, seed: 3 }, pre: 120 },
  panipuri: { params: { difficulty: 0.4, seed: 4 }, pre: 200 },
  bargain: { params: { difficulty: 0.4, seed: 2, who: 'auto' }, pre: 200 },
  brickgame: { params: { difficulty: 0.4, seed: 6, mode: 'blocks' }, pre: 300 },
  antenna: { params: { difficulty: 0.4, seed: 8 }, pre: 200 },
  clap: { params: { difficulty: 0.4, seed: 9, skin: 'golconda' }, pre: 200 },
};

(async () => {
  const segs = TL.segments.filter((s) => s.kind === 'mg' && (!ONLY.length || ONLY.includes(s.id) || ONLY.includes(s.game)));
  const t00 = Date.now();
  const { browser, context, page, errors } = await openGame({ width: W, height: H, scale: SCALE });
  await page.addScriptTag({ path: path.join(__dirname, 'activities_page.js') });
  await takeOver(page);
  await page.evaluate(() => ACT.setup());
  const cdp = await context.newCDPSession(page);
  const shot = async (file) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Q });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  console.log('booted in', ((Date.now() - t00) / 1000).toFixed(0), 's; viewport', W + 'x' + H, 'x' + SCALE);
  for (const seg of segs) {
    const cfg = GAMES[seg.game];
    if (!cfg) { console.log('no config for', seg.game); continue; }
    const nf = seg.n * TL.beatFrames, dir = path.join(OUTD, seg.id);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const pre = +(process.env['PRE_' + seg.game] || (PORTRAIT && cfg.preV) || cfg.pre);
    const t0 = Date.now();
    const params = Object.assign({}, cfg.params, JSON.parse(process.env['P_' + seg.game] || '{}'));
    const tune = Object.assign({}, cfg.tune || {}, JSON.parse(process.env['T_' + seg.game] || '{}'));
    if (process.env.TOUCH != null) params.touch = process.env.TOUCH === '1'; else if (PORTRAIT && cfg.touchV != null) params.touch = cfg.touchV;
    const info = await page.evaluate(({ id, p, tune }) => ACT.start(id, p, tune), { id: seg.game, p: params, tune: Object.keys(tune).length ? tune : null });
    console.log(seg.id, 'start', JSON.stringify(info));
    if (SURVEY) {
      // step one frame at a time, log every HUD change (to find the exact frame of a hit / cut / line clear)
      const [k, len] = SURVEY;
      const log = [];
      let last = '';
      for (let fr = 1; fr <= len; fr++) {
        const st = await page.evaluate((dt) => ACT.step(1, dt), DT);
        const key = st.phase + '|' + st.over + '|' + st.hud;
        if (key !== last) { log.push(fr + ' ' + JSON.stringify(st)); last = key; }
        if (fr % k === 0) await shot(path.join(dir, 's' + String(fr).padStart(5, '0') + '.jpg'));
        if (st.phase === 'none' || st.phase === 'result') break;
      }
      fs.writeFileSync(path.join(dir, 'survey.txt'), log.join('\n') + '\n');
      console.log(log.join('\n'));
    } else {
      // pre-roll in chunks (keeps each evaluate short)
      let st;
      for (let done = 0; done < pre;) { const k = Math.min(60, pre - done); st = await page.evaluate(({ k, dt }) => ACT.step(k, dt), { k, dt: DT }); done += k; }
      console.log(seg.id, 'pre-roll', pre, JSON.stringify(st));
      for (let f = 0; f < nf; f++) {
        st = await page.evaluate((dt) => ACT.step(1, dt), DT);
        if (f % EVERY === 0) await shot(path.join(dir, String(f).padStart(5, '0') + '.jpg'));
        if (f % 18 === 17) console.log(' ', seg.id, f + 1, '/', nf, JSON.stringify(st));
      }
      if (st.phase !== 'play') console.log('  WARNING', seg.id, 'ended in phase', st.phase);
    }
    await page.evaluate(() => ACT.end());
    await page.evaluate((dt) => ACT.step(3, dt), DT);
    console.log(seg.id, 'done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  console.log('errors', errors.length, errors.slice(0, 5));
  await browser.close();
})();
