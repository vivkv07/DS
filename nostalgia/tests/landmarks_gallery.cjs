#!/usr/bin/env node
/* NOSTALGIA — tests/landmarks_gallery.cjs  (owner: monument artist)
 * Boots the real game (index.html#debug), frames every landmark drawn by src/landmarks.js and
 * shoots it at noon and at night into tests/out/landmarks/<id>_noon.png / <id>_night.png
 * (plus <id>_close.png with --close). Fails (exit 1) on any page error, console error,
 * N.errors entry, or a heritage draw id without registered art.
 *
 * Usage: node tests/landmarks_gallery.cjs [--close] [--one-per-draw] [--no-night]
 *   env IDS=charminar,kaman_machli   only these landmark ids
 *   env DRAWS=charminar,qutb_tomb     only these draw ids
 *   env VIEW=1280x720                 browser viewport (internal canvas = viewport / scale)
 *   env TIMES=12:00,21:00             times of day to shoot (default noon + night)
 *   env ZOOM=1                        force a camera zoom
 *   env PERF=1                        also measure the draw time with each landmark in view
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'landmarks');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const has = (f) => args.includes(f);

// draw ids owned by landmarks.js (design/map_plan.md §4a) + the civic ones the brief asked for
const HERITAGE = ['ashurkhana', 'assembly', 'birla_mandir', 'birla_planetarium', 'british_residency', 'buddha_statue', 'charminar',
  'chowmahalla', 'church', 'clock_tower', 'cyber_towers', 'dargah', 'falaknuma', 'fort_gate', 'fort_wall', 'golconda_bala_hissar',
  'gulzar_houz', 'gun_park', 'gurudwara', 'high_court', 'jubilee_hall', 'kakatiya_arch', 'kaman', 'khairatabad_ganesh',
  'madina_building', 'mahankali_temple', 'mecca_masjid', 'memorial', 'mosque', 'museum', 'nizam_college', 'ntr_memorial',
  'osmania_hospital', 'ou_arts_college', 'paigah_tombs', 'palace', 'pathergatti_arcade', 'puranapul_arches', 'purani_haveli',
  'qutb_tomb', 'raj_bhavan', 'sai_temple', 'salar_jung_museum', 'secretariat', 'spanish_mosque', 'state_central_library',
  'statue', 'tank_bund_statue', 'taramati_baradari', 'temple'];
const EXTRA = ['mozamjahi_market', 'railway_station', 'lb_stadium', 'airport_terminal', 'control_tower'];

(async () => {
  const [vw, vh] = (process.env.VIEW || '1280x720').split('x').map(Number);
  const times = (process.env.TIMES || '12:00,21:00').split(',').map((t) => t.split(':').map(Number));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: vw, height: vh } });
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html') + '#debug');
  await page.waitForFunction(() => window.N && N.world && N.world.built && N.debug && N.landmarks, null, { timeout: 30000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  if (process.env.OFF) await page.evaluate((o) => { window.__OFF = o; }, process.env.OFF);
  await page.waitForTimeout(400);

  const info = await page.evaluate(([H, X]) => {
    const all = N.WORLD_DATA.landmarks.map((l) => ({ id: l.id, draw: l.draw, x: l.x, y: l.y, w: l.w, d: l.d, h: l.h }));
    const missing = H.filter((d) => !N.landmarks.defs[d] || !(N.landmarks.defs[d].draw || N.landmarks.defs[d].enqueue));
    const extraMissing = X.filter((d) => !N.landmarks.defs[d]);
    return { all, missing, extraMissing };
  }, [HERITAGE, EXTRA]);
  if (info.missing.length) errs.push('heritage draw ids without art: ' + info.missing.join(', '));
  if (info.extraMissing.length) console.log('note: civic ids without art here (places_art.js may own them):', info.extraMissing.join(', '));

  const ids = process.env.IDS ? process.env.IDS.split(',') : null;
  const draws = process.env.DRAWS ? process.env.DRAWS.split(',') : null;
  let list = info.all.filter((l) => (ids ? ids.includes(l.id) : draws ? draws.includes(l.draw) : HERITAGE.includes(l.draw) || EXTRA.includes(l.draw)));
  if (has('--one-per-draw') && !ids) { const seen = new Set(); list = list.filter((l) => (seen.has(l.draw) ? false : seen.add(l.draw))); }
  console.log('landmarks to shoot:', list.length);

  const perf = [];
  for (const lm of list) {
    const big = Math.max(lm.w, lm.d);
    const zoom = process.env.ZOOM ? +process.env.ZOOM : Math.max(0.55, Math.min(1, 250 / (big + 50)));
    for (const [hh, mm] of times) {
      const tag = hh >= 19 || hh < 6 ? 'night' : hh >= 16 ? 'eve' : hh < 9 ? 'morning' : 'noon';
      await page.evaluate(([lm, zoom, hh, mm]) => {
        // camera south-east of the landmark so it sits up-left of centre (its south/east walls show)
        const R = N.render;
        const off = (window.__OFF || '120,60').split(',').map(Number);
        const cx = lm.x + off[0] / zoom, cy = lm.y + off[1] / zoom + lm.d * 0.15;
        let px = cx, py = cy;
        const f = N.world.findFree(cx, cy, 'walk', 40); if (f) { px = f.x; py = f.y; }
        N.player.teleport(px, py);
        R.camOverride = { x: cx, y: cy, zoom, snap: true };
        N.debug.setTime(hh, mm);
        R.warmChunks(cx, cy, 700);
      }, [lm, zoom, hh, mm]);
      await page.waitForTimeout(260);
      await page.screenshot({ path: path.join(OUT, lm.id + (process.env.SUFFIX || '') + '_' + tag + '.png') });
    }
    if (has('--close')) {
      await page.evaluate((lm) => { const R = N.render; R.camOverride = { x: lm.x + 40, y: lm.y + 30, zoom: 2.2, snap: true }; N.debug.setTime(12, 0); }, lm);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, lm.id + '_close.png') });
    }
    if (process.env.PERF) {
      const ms = await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 1200)); return N.debug.perf(); });
      perf.push([lm.id, ms.drawMs, ms.queued]);
    }
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  if (perf.length) for (const [id, d, q] of perf) console.log('perf', id.padEnd(32), 'draw', d, 'ms  queued', q);
  const st = await page.evaluate(() => N.debug.state());
  if (st.errors && st.errors.length) errs.push(...st.errors.map((e) => 'N.errors: ' + e));
  await browser.close();
  if (errs.length) { console.log('ERRORS:\n' + errs.join('\n')); process.exit(1); }
  console.log('OK: ' + list.length + ' landmarks, screenshots in tests/out/landmarks/');
})().catch((e) => { console.error(e); process.exit(1); });
