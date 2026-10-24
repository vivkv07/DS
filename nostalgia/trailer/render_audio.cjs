/* NOSTALGIA trailer — render the score + sound design to trailer/out/score.wav (48 kHz stereo) */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
  await p.goto('about:blank');
  await p.addScriptTag({ path: path.join(__dirname, 'music.js') });
  const t0 = Date.now();
  const r = await p.evaluate((TL) => window.renderTrailerAudio(TL), TL);
  const out = path.join(__dirname, 'out', 'score.wav');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(r.wav, 'base64'));
  console.log('rendered in', Date.now() - t0, 'ms ->', out);
  console.log(JSON.stringify(r.stats, null, 1));
  await b.close();
})();
