'use strict';
const path = require('path');
const { openGame, step, takeOver, stepCapture } = require('./lib.cjs');
const OUT = path.join(__dirname, 'out', 'proto');
require('fs').mkdirSync(OUT, { recursive: true });
const W = +(process.env.W || 1920), Hh = +(process.env.H || 1080);

(async () => {
  const t0 = Date.now();
  const { browser, page, errors } = await openGame({ width: W, height: Hh });
  console.log('booted', Date.now() - t0, 'ms');
  await page.addScriptTag({ path: path.join(__dirname, 'stage.js') });
  await page.evaluate((aa) => { window.__AA = aa; }, process.env.AA !== '0');
  await page.evaluate(() => {
    N.view3d.setQuality && N.view3d.setQuality({ adaptive: false, pixelRatio: 1, antialias: window.__AA });
    N.view.set('tps');
  });
  await page.waitForFunction(() => N.view3d && N.view3d.active && N.models3d && N.models3d.ready, null, { timeout: 180000 });
  await takeOver(page);
  const lm = process.env.LM || 'charminar';
  const info = await page.evaluate(async (lmId) => {
    const L = N.world.data.landmarks.find((l) => l.id === lmId);
    N.debug.teleport(L.x + 60, L.y + 60);
    N.debug.setTime(+((window.HOUR) || 7), 10);
    N.render.camOverride = { x: L.x, y: L.y, zoom: 1, snap: true };
    STAGE.setup();
    N.view3d.settle(20000);
    for (let i = 0; i < 30; i++) window.__step(1 / 30);
    N.view3d.settle(20000);
    const h = STAGE.summit(L.x, L.y, 0);
    return { L: { x: L.x, y: L.y, w: L.w, d: L.d, h: L.h }, summit: h, q: N.view3d.stats() };
  }, lm);
  console.log(JSON.stringify(info).slice(0, 600));
  const { L, summit } = info;
  const o = { cx: L.x, cy: L.y, ch: summit + 5, r: 26, h: summit + 9, a0: 0.6, a1: 1.4, dur: 3, fov: 50 };
  for (let f = 0; f < (+process.env.NF || 3); f++) {
    const t = f * 1.4;
    const tt = Date.now();
    await page.evaluate(({ o, t, summit, L }) => {
      STAGE.hero({ x: L.x, y: L.y, h: summit, angle: Math.PI / 2, clip: 'idle' });
      STAGE.orbit(o, t);
    }, { o, t, summit, L });
    const ts = Date.now();
    const sp = await page.evaluate(() => { const a = performance.now(); window.__step(1 / 30); const b = performance.now(); N.view3d.H.renderer.getContext().finish(); const c = performance.now(); const u = N.view3d.H.renderer.domElement.toDataURL('image/jpeg', 0.95); const d = performance.now(); window.__last = u; return [b - a, c - b, d - c]; });
    console.log('  split step/finish/encode', sp.map((x) => x.toFixed(0)).join(' / '));
    await stepCapture(page, 1 / 30, path.join(OUT, `${lm}_${f}.jpg`));
    console.log('frame', f, 'step', ts - tt, 'ms, shot', Date.now() - ts, 'ms');
  }
  console.log('errors', errors.length);
  await browser.close();
})();
