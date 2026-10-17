/* NOSTALGIA — tests/audio_quality.cjs  (owner: audio engineer)
 * Objective audio-quality suite on top of tests/audio.cjs (which covers the API surface):
 * renders SFX, engines, ambience and music offline (OfflineAudioContext inside the real game),
 * writes WAVs + spectrogram/level PNGs to tests/out/aq/ and checks levels, clipping, clicks, DC,
 * spectral character, spatial behaviour and CPU cost. Sections live in tests/aq/<name>.cjs:
 *   module.exports = { name, order, run: async (T) => {...} }   T = {page, L, ev, check, ok, fail, log, sleep, metrics}
 *   node nostalgia/tests/audio_quality.cjs            all sections
 *   AQ=vehicles,music node nostalgia/tests/audio_quality.cjs   only some
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const L = require('./aq/lib.cjs');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const log = (msg) => console.log('       ' + msg);
const check = (cond, msg, extra) => (cond ? ok(msg + (extra !== undefined && process.env.AQ_VERBOSE ? '  ' + JSON.stringify(extra) : '')) : fail(msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const only = process.env.AQ ? process.env.AQ.split(',') : null;
  const sections = fs.readdirSync(path.join(__dirname, 'aq')).filter((f) => f.endsWith('.cjs') && f !== 'lib.cjs')
    .map((f) => Object.assign({ file: f }, require('./aq/' + f))).filter((s) => s && typeof s.run === 'function' && (!only || only.includes(s.name)))
    .sort((a, b) => (a.order == null ? 50 : a.order) - (b.order == null ? 50 : b.order));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto('file://' + path.join(ROOT, 'index.html') + '#debug');
  await page.waitForFunction(() => window.N && N.state && N.state.mode === 'title', null, { timeout: 30000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const T = { page, L, ev, check, ok, fail, log, sleep, metrics: L.metrics, ROOT };
  for (const s of sections) {
    console.log('\n== ' + s.name + '  (' + s.file + ')');
    const t0 = Date.now();
    try { await s.run(T); } catch (e) { fail(s.name + ' threw: ' + (e.stack || e.message)); }
    log((Date.now() - t0) / 1000 + ' s');
  }
  const nerr = await ev(() => (N.errors || N._errors || []).length).catch(() => 0);
  console.log('\n== errors');
  check(errors.length === 0, 'zero console errors / page errors', errors.slice(0, 8));
  check(!nerr, 'no N.err entries', nerr);
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILED' : 'ALL PASSED') + '   (renders + spectrograms in ' + path.relative(process.cwd(), L.OUT) + ')');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
