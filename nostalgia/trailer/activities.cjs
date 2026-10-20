/* NOSTALGIA trailer v2 — capture the full-screen minigame clips (timeline segments of kind 'mg').
 *   node trailer/activities.cjs 1920 1080     landscape -> trailer/out/frames2/<segment id>/%05d.jpg   (3840x2160)
 *   SCALE=4 node trailer/activities.cjs 540 960   portrait at real phone scale -> trailer/out/frames2_v/<id>/%05d.jpg
 *                                             (2160x3840; 1080 1920 at SCALE 2 = the same pixels at tablet scale)
 *   (run landscape first: each portrait clip is lined up with the landscape clip's log, see ALIGN)
 *   W H = viewport in CSS px, rendered at deviceScaleFactor SCALE (default 2); exactly n*beatFrames frames per clip.
 *     env: ONLY=a_kite,cricket   segment ids or game ids
 *          OUTD=dir              output root (default trailer/out/frames2 | frames2_v by orientation)
 *          SCALE=2               deviceScaleFactor (phone-scale portrait: 540 960 with SCALE=4 -> 2160x3840)
 *          CANVAS_DPR=n          minigame canvas resolution (default: SCALE when SCALE > 2, the game's own cap is 2)
 *          Q=92                  JPEG quality
 *          EVERY=n               capture every n-th frame only (quick look; frame files keep their index)
 *          PRE_<game>=frames     override a game's pre-roll (frames at 30 fps stepped before the first capture)
 *          P_<game>='{json}'     extra N.minigames.play params, T_<game>='{json}' TUNE overrides (try-outs)
 *          FAST=0|1              pre-roll frames draw into a 1x1 canvas (fast, default) or for real (default for kite)
 *          TOUCH=0|1             touch-button layout off / on (default: on in portrait = real phone UI, off in landscape)
 *          ALIGN=0               portrait: don't line up with the landscape log (default: capture MARGIN=2 spare frames
 *                                each side and keep the window whose key HUD changes land on the same clip frames as
 *                                trailer/out/mg_logs/1920x1080_<id>.txt — one score for both cuts)
 *          SURVEY=k,len[,from]   instead of the clip: step len frames, capture every k-th (from frame `from`) to
 *                                OUTD/<id>/sNNNNN.jpg, log every HUD change — to pick a pre-roll (SURVEY_FAST=1:
 *                                fast-forward to `from`, for a quick layout look)
 *   logs: trailer/out/mg_logs/<W>x<H>_<id>.txt — frame-numbered HUD changes of the run (header: the pre-roll used)
 * The game runs on the virtual rAF clock (lib.cjs); each frame steps 1/30 s in its own evaluate and is grabbed with
 * CDP Page.captureScreenshot (clip scale = DSF: the minigame canvas at 2x + its DOM top bar). Every clip runs in a
 * fresh browser. The minigames are played by their built-in test bot (autoplay 'win'), how-to and countdown skipped,
 * at real speed — except marbles (timeScale 1.35, and a scripted break shot, see GAMES.marbles).
 * Page side: trailer/activities_page.js (CSS: overlay shown, HUD / touch / debug / toasts / key hints hidden).
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

// per game: params for N.minigames.play + pre-roll (frames stepped, not captured, after play() — the 3-2-1
// countdown is ~10 frames, so every pre-roll skips it); preV = portrait pre-roll where the portrait layout plays
// out differently (kite: the sky is taller, so the pech happen sooner). Picked from SURVEY logs (event frames):
const GAMES = {
  // landscape cuts at f417 / f503 (game won at f570): window 400-544 = two "BO KAATA!" cuts with the pech gauge;
  // portrait cuts at f151 / f225 (won f259): window 108-252
  // kite's draw feeds its simulation, so its pre-roll must really draw (fast: false), else the bot plays out differently
  // portrait: the editor's window 135..278 puts the first cut on the same clip frame as landscape (f16); the second
  // lands on f90 (landscape f102), the third (the win) on f124; the result card only comes at f312
  kite: { params: { difficulty: 0.4, seed: 11 }, pre: 400, preV: 134, fast: false, anchorV: { ev: 'CUT \\d+', clip: 16 } },
  // ball 2 (the bot plays a CUT): end of the bowler's run-up, delivery ~f224, the ball bounces in, PERFECT cut
  // ~f250 (bat flash + sparks), the ball streaks right over the low wall: "SIX! Plot mein!" + confetti and
  // RUNS 6 -> 12 at f258, the ball still flying into the plot
  cricket: { params: { difficulty: 0.4, seed: 5 }, pre: 213, ev: 'RUNS \\d+' },
  // a scripted break shot (through the game's own drag input; the bot plays on afterwards): from the bottom-right
  // of the ring, full power, Chinnu pulls back (f12-17) and flicks (f18); the striker smashes into the cross,
  // the big JACKPOT goli flies out of the ring, then "JACKPOT! +3", the won goli fly to his pile, TUM 3/6 and
  // "PHIR SE MAARO!" (~f65). Found with ACT.mbSearch; robust to +-0.004 rad aim / -1% power. timeScale 1.35 so
  // that the shot, the roll and the payoff all fit in 2.4 s (a real flick takes ~2.4 s to settle).
  marbles: { params: { difficulty: 0.4, seed: 3, timeScale: 1.35, touch: true }, pre: 12, ev: 'TUM \\d+|SHOTS \\d+',
    script: [{ at: 4, kind: 'mbPos', pos: Math.PI / 3 }].concat([0.3, 0.55, 0.75, 0.9, 1, 1].map((pw, i) => ({ at: 12 + i, kind: 'mbDrag', aimOff: 0.0375, power: pw })), [{ at: 18, kind: 'mbRelease' }]) },
  // puris 13-14 eaten at f511 / f546 while TEEKHA climbs 32% -> 86%: red sweating face, steam
  panipuri: { params: { difficulty: 0.4, seed: 4 }, pre: 500, ev: 'PURI \\d+' },
  // the deal: "Apne log ho. Chalo, ₹22.", new line cards (~f176), the bot picks one, the BOLO! needle,
  // "JAMKE BOLA!" and the price board ticks ₹22 -> ₹20 at f194: "Chalo, baitho! ₹20, meter nakko."
  bargain: { params: { difficulty: 0.4, seed: 2, who: 'auto' }, pre: 154, ev: 'BHAAV ₹\\d+' },
  // lines 5 and 6 cleared at f490 / f521 (SPEED 3)
  brickgame: { params: { difficulty: 0.4, seed: 6, mode: 'blocks' }, pre: 468, ev: 'LINES \\d+|SCORE \\d+' },
  // colour bars in, Amma "BAS! BAS! Wahi rakho!", LOCK fills, TOOFAN KID comes on at ~f192
  antenna: { params: { difficulty: 0.4, seed: 8 }, pre: 136, ev: '' }, // align on the lock (over) only: SIGNAL % wobbles by 1 between runs
  // round 3: Chinnu's claps at f916-951 echo up the fort (lanterns lit), "ZABARDAST!" at f964
  clap: { params: { difficulty: 0.4, seed: 9, skin: 'golconda' }, pre: 905, ev: 'TAAL \\d+|SCORE \\d+' },
};
const LOGD = path.join(__dirname, 'out', 'mg_logs');
// a capture log -> {pre, at(frame) = the logged status ({phase, t, over, hud}) at that frame}
function readLog(file) {
  const fr = [], val = [];
  let pre = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('#')) { const m = / pre (\d+)/.exec(line); if (m && !pre) pre = +m[1]; continue; }
    const i = line.indexOf(' ');
    if (i < 0) continue;
    const j = JSON.parse(line.slice(i + 1));
    fr.push(+line.slice(0, i)); val.push(j);
  }
  return { pre, at(f) { let k = -1; for (let n = 0; n < fr.length && fr[n] <= f; n++) k = n; return k < 0 ? null : val[k]; } };
}
// the key event signature of a HUD state for alignment: the fields matching ev (e.g. 'RUNS \\d+') + the won flag
function evKey(st, ev) { return st ? (ev ? (String(st.hud).match(new RegExp(ev, 'g')) || []).join(',') : '') + '|' + st.over : ''; }

// Each segment runs in a fresh browser (boot ~6 s): a minigame then always starts from the same game state, so
// the bot plays out exactly as in the SURVEY run that picked its pre-roll (state left by an earlier minigame —
// stats, inventory loot — can change what follows). Every frame is stepped in its own evaluate, as in SURVEY.
(async () => {
  const segs = TL.segments.filter((s) => s.kind === 'mg' && (!ONLY.length || ONLY.includes(s.id) || ONLY.includes(s.game)));
  fs.mkdirSync(LOGD, { recursive: true });
  let nerr = 0;
  for (const seg of segs) {
    const cfg = GAMES[seg.game];
    if (!cfg) { console.log('no config for', seg.game); continue; }
    const t0 = Date.now();
    const { browser, context, page, errors } = await openGame({ width: W, height: H, scale: SCALE });
    await page.addScriptTag({ path: path.join(__dirname, 'activities_page.js') });
    await takeOver(page);
    await page.evaluate(() => ACT.setup());
    // the game caps its canvas at dpr 2: at SCALE 4 (phone-sized CSS viewport) render the canvas at 4x too
    const CDPR = +(process.env.CANVAS_DPR != null ? process.env.CANVAS_DPR : SCALE > 2 ? SCALE : 0);
    if (CDPR) await page.evaluate((d) => { ACT.canvasDpr = d; }, CDPR);
    const cdp = await context.newCDPSession(page);
    const shot = async (file) => {
      // without a clip CDP returns CSS-px images (1920x1080); clip.scale = DSF gives device px (3840x2160), and the
      // DOM text is rasterised at that scale (crisp), the minigame canvas is already 2x (dpr 2)
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Q, clip: { x: 0, y: 0, width: W, height: H, scale: SCALE } });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    };
    const nf = seg.n * TL.beatFrames, dir = path.join(OUTD, seg.id);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const pre = +(process.env['PRE_' + seg.game] || (PORTRAIT && cfg.preV) || cfg.pre);
    const params = Object.assign({}, cfg.params, JSON.parse(process.env['P_' + seg.game] || '{}'));
    const tune = Object.assign({}, cfg.tune || {}, JSON.parse(process.env['T_' + seg.game] || '{}'));
    if (process.env.TOUCH != null) params.touch = process.env.TOUCH === '1'; else if (PORTRAIT) params.touch = cfg.touchV != null ? cfg.touchV : true; // phone UI: the touch buttons
    const info = await page.evaluate(({ id, p, tune, script }) => ACT.start(id, p, tune, script), { id: seg.game, p: params, tune: Object.keys(tune).length ? tune : null, script: cfg.script || null });
    console.log(seg.id, 'booted + started in', ((Date.now() - t0) / 1000).toFixed(0), 's', JSON.stringify(info), SURVEY ? 'SURVEY ' + SURVEY : 'pre-roll ' + pre);
    // one frame per evaluate; log every HUD change (to find the exact frame of a hit / cut / line clear).
    // ALIGN (portrait, on by default when the landscape log exists): landscape and portrait share one score, so a
    // key event must land on the same clip frame in both. The bot plays out identically in both orientations, but
    // the virtual clock's float rounding can move an event by a frame between runs, so capture MARGIN (2) extra
    // frames each side and keep the nf frames whose HUD changes line up best with the landscape clip's log.
    const refLog = path.join(LOGD, (process.env.ALIGN_REF || '1920x1080') + '_' + seg.id + '.txt');
    // anchorV (kite): the two layouts play out differently, so instead pin the first change of the ev field
    // (the first cut) to clip frame `clip`, as in the landscape clip
    const anchor = PORTRAIT ? cfg.anchorV : null;
    const M = !SURVEY && PORTRAIT && process.env.ALIGN !== '0' && cfg.align !== false && (anchor || fs.existsSync(refLog)) ? +(process.env.MARGIN || 2) : 0;
    const first = SURVEY ? (SURVEY[2] || 1) : pre + 1 - M; // first captured frame
    const total = SURVEY ? SURVEY[1] : pre + nf + M;
    // (SURVEY_FAST=1: a quick look — fast-forward a survey up to its `from` frame too)
    const FAST = (!SURVEY || process.env.SURVEY_FAST === '1') && (process.env.FAST != null ? process.env.FAST !== '0' : cfg.fast !== false) && first > 1;
    if (FAST) await page.evaluate(() => ACT.fast(true));
    const mdir = dir + '.margin';
    if (M) { fs.rmSync(mdir, { recursive: true, force: true }); fs.mkdirSync(mdir, { recursive: true }); }
    const log = [], hudAt = [];
    let last = '', st, ncap = 0, shift = 0;
    for (let fr = 1; fr <= total; fr++) {
      if (FAST && fr === first - 1) await page.evaluate(() => ACT.fast(false)); // the frame before the first capture draws for real
      st = await page.evaluate((dt) => ACT.step(1, dt), DT);
      hudAt[fr] = evKey(st, anchor ? anchor.ev : cfg.ev);
      const key = st.phase + '|' + st.over + '|' + st.hud;
      if (key !== last) { log.push(fr + ' ' + JSON.stringify(st)); last = key; }
      if (SURVEY) {
        if (fr % SURVEY[0] === 0 && fr >= (SURVEY[2] || 0)) await shot(path.join(dir, 's' + String(fr).padStart(5, '0') + '.jpg'));
        if (st.phase === 'none' || st.phase === 'result') break;
      } else if (fr >= first) {
        const f = fr - pre - 1;
        if (M) await shot(path.join(mdir, String(fr).padStart(5, '0') + '.jpg'));
        else if (f % EVERY === 0) { await shot(path.join(dir, String(f).padStart(5, '0') + '.jpg')); ncap++; }
        if (st.phase !== 'play') console.log('  WARNING', seg.id, 'frame', f, 'phase', st.phase);
        if (f % 36 === 35) console.log(' ', seg.id, f + 1, '/', nf, ((Date.now() - t0) / 1000).toFixed(0) + 's', st.hud);
      }
    }
    if (M && anchor) {
      let fe = 0;
      for (let fr = first + 1; fr <= total && !fe; fr++) if (hudAt[fr] !== hudAt[fr - 1]) fe = fr;
      const want = fe ? fe - pre - 1 - anchor.clip : 0;
      shift = Math.max(-M, Math.min(M, want));
      console.log('  anchored: first', anchor.ev, 'change at frame', fe, '-> clip', fe - pre - 1 - shift, '(wanted ' + anchor.clip + '), shift', shift);
    } else if (M) {
      const ref = readLog(refLog);
      let bm = Infinity;
      for (let s = -M; s <= M; s++) {
        let mm = 0;
        for (let i = 0; i < nf; i++) if ((hudAt[pre + 1 + i + s] || '') !== evKey(ref.at(ref.pre + 1 + i), cfg.ev)) mm++;
        if (mm < bm || (mm === bm && Math.abs(s) < Math.abs(shift))) { bm = mm; shift = s; }
      }
      console.log('  aligned with', path.basename(refLog), '(pre ' + ref.pre + '): shift', shift, '-> window', pre + 1 + shift, '..', pre + nf + shift, '; frames whose key HUD fields differ:', bm, '/', nf);
    }
    if (M) {
      for (let i = 0; i < nf; i++) fs.copyFileSync(path.join(mdir, String(pre + 1 + i + shift).padStart(5, '0') + '.jpg'), path.join(dir, String(i).padStart(5, '0') + '.jpg'));
      fs.rmSync(mdir, { recursive: true, force: true });
      ncap = nf;
    }
    const alog = await page.evaluate(() => ACT.log || []);
    if (alog.length) { log.push('# script ' + JSON.stringify(alog)); console.log('  script', JSON.stringify(alog)); }
    const lf = path.join(LOGD, W + 'x' + H + '_' + seg.id + (SURVEY ? '_survey' : '') + '.txt');
    const P0 = pre + shift;
    fs.writeFileSync(lf, '# ' + seg.id + ' ' + W + 'x' + H + ' pre ' + P0 + ' (captured frames ' + (P0 + 1) + '..' + (P0 + nf) + ')' + (M ? ' aligned shift ' + shift : '') + '\n' + log.join('\n') + '\n');
    if (SURVEY) console.log(log.join('\n'));
    console.log(seg.id, 'done:', SURVEY ? 'survey' : ncap + ' frames', 'in', ((Date.now() - t0) / 1000).toFixed(0), 's; errors', errors.length, errors.slice(0, 3));
    nerr += errors.length;
    await browser.close();
  }
  console.log('all done; page errors', nerr);
})();
