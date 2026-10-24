/* NOSTALGIA — tests/music_style.cjs  (audio.js music styles + audio_marfa.js: the marfa band as background music)
 * Headless Chromium, the real game (file://, a real click on PLAY unlocks the AudioContext):
 *  1. the styles: original score (default), marfa band, both; the marfa tracks registered
 *  2. the B key switches at once: free roam day -> marfa_day (no waiting out a rest), a toast, the ♪ on the HUD
 *  3. the marfa style follows the director's cues: night -> marfa_night, the Old City -> marfa_oldcity, the
 *     Chappal Meter chase -> marfa_chase; a story cue (victory) keeps the score
 *  4. both: taking turns, one free-roam pass each
 *  5. the ♪ button on the HUD switches too; Settings > Sound has the row, Settings > Controls the key (B)
 *  6. persisted across a reload; zero console errors, page errors and N.err
 *   node nostalgia/tests/music_style.cjs
 */
'use strict';
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 600) : '')));

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const music = () => ev(() => N.audio.stats().music);
  const waitMusic = async (want, ms) => {
    const t0 = Date.now(); let m = null;
    while (Date.now() - t0 < (ms || 8000)) { m = await music(); if (typeof want === 'function' ? want(m) : m === want) return m; await new Promise((r) => setTimeout(r, 100)); }
    return m;
  };
  await page.goto(URL);
  await page.waitForFunction(() => window.N && N.state && N.state.mode === 'title', null, { timeout: 60000 });
  await ev(() => { try { localStorage.removeItem('nostalgia.audio.v1'); } catch (e) { /* ignore */ } window.__errs = []; const e0 = N.err; N.err = function (k, e) { window.__errs.push(k + ': ' + (e && e.message)); return e0.apply(this, arguments); }; });

  console.log('\n== 1. the styles');
  const d1 = await ev(() => ({ style: N.audio.music.style, styles: N.audio.music.STYLES.map((s) => s.id + ':' + s.short), tracks: ['marfa_day', 'marfa_night', 'marfa_oldcity', 'marfa_chase'].filter((id) => N.audio.music.TRACKS.includes(id)),
    names: ['marfa_day', 'marfa_night', 'marfa_oldcity', 'marfa_chase'].map((id) => N.audio.music.title(id)), key: N.input.keyFor('music') }));
  check(d1.style === 'score' && d1.styles.join(',') === 'score:ORIGINAL,marfa:MARFA,mix:BOTH', 'original score by default; styles ' + d1.styles.join(', '), d1);
  check(d1.tracks.length === 4, 'the marfa band: ' + d1.names.join(', '), d1);
  check(d1.key === 'KeyB', 'the music key is B', d1.key);

  // PLAY (a real click: the AudioContext starts), then free roam at 11:00 away from the Old City
  await page.click('#title-start');
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });
  await ev(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.god(true); N.debug.freezeClock(true); N.clock.set(11, 0); if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
    const p = N.places.tank_bund || N.places.lumbini_park; if (p) N.player.teleport(p.x, p.y);
  });
  const m0 = await waitMusic((m) => m === 'day', 20000);
  check(m0 === 'day', 'free roam plays the score ("day")', m0);

  console.log('\n== 2. the B key');
  await page.keyboard.press('KeyB');
  const m1 = await waitMusic('marfa_day', 4000);
  const d2 = await ev(() => ({ style: N.audio.music.style, toast: N.hud.toastQueue().filter((t) => /music/i.test(t)).join(' | '), flash: document.querySelector('.osd-mus').classList.contains('flash'),
    btn: document.querySelector('.osd-mus') && document.querySelector('.osd-mus').textContent, shown: !!document.querySelector('.osd-mus.show'), saved: JSON.parse(localStorage.getItem('nostalgia.audio.v1') || '{}').style }));
  check(d2.style === 'marfa' && m1 === 'marfa_day', 'B: the marfa band at once ("Barkas Ki Marfa")', { m1, d2 });
  check(/Marfa/.test(d2.toast) && /B to switch/.test(d2.toast), 'a toast says so: "' + d2.toast + '"', d2);
  check(d2.flash, 'the ♪ flashes', d2);
  check(d2.shown && /MARFA/.test(d2.btn), 'the ♪ on the HUD reads "' + (d2.btn || '').trim() + '"', d2);
  check(d2.saved === 'marfa', 'saved with the audio settings', d2.saved);

  console.log('\n== 3. the director\'s cues');
  // night (the switch cuts the 10 s district hold short: set the style again after the change)
  await ev(() => { N.clock.set(22, 0); N.audio.music.setStyle('marfa', { quiet: true }); });
  const mn = await waitMusic('marfa_night', 6000);
  check(mn === 'marfa_night', 'night: "Raat Ki Marfa"', mn);
  await ev(() => { N.clock.set(17, 0); const p = N.places.charminar_plaza || N.places.charminar; N.player.teleport(p.x, p.y + 30); });
  const mo = await waitMusic((m) => m === 'marfa_oldcity' || false, 1500).then(async (m) => {
    if (m === 'marfa_oldcity') return m;
    for (let i = 0; i < 20 && m !== 'marfa_oldcity'; i++) { await ev(() => N.audio.music.setStyle('marfa', { quiet: true })); m = await waitMusic('marfa_oldcity', 800); }
    return m;
  });
  check(mo === 'marfa_oldcity', 'the Old City: "Charminar Ki Baraat"', mo);
  await ev(() => { if (N.wanted && N.wanted.set) N.wanted.set(3); else N.emit('wanted', 3); });
  const mc = await waitMusic('marfa_chase', 5000);
  check(mc === 'marfa_chase', 'Chappal Meter 3: "Marfa Ki Daud"', mc);
  await ev(() => { if (N.wanted && N.wanted.set) N.wanted.set(0); else N.emit('wanted', 0); N.audio.music.play('victory', { fade: 0.05 }); });
  const mv = await waitMusic('victory', 3000);
  check(mv === 'victory', 'a story cue keeps the score (victory)', mv);
  await ev(() => { N.audio.music.stop(0.05); N.audio.music.lock(null); });

  console.log('\n== 4. both, taking turns');
  await ev(() => { const p = N.places.tank_bund || N.places.lumbini_park; N.player.teleport(p.x, p.y); N.clock.set(11, 0); });
  await page.keyboard.press('KeyB');
  const mm0 = await waitMusic((m) => m === 'day', 8000);
  const st4 = await ev(() => N.audio.music.style);
  check(st4 === 'mix' && mm0 === 'day', 'B again: both, starting with the score after the marfa band', { st4, mm0 });
  // the pass ends (as the director sees it), the rest is cut short: the marfa band's turn
  await ev(() => { const m = N.audio._internal.music; if (m.seq) { m.seq.done = true; m.seq.endTime = -10; } });
  await page.waitForFunction(() => N.audio._internal.music.restUntil > 0, null, { timeout: 5000 }).catch(() => {});
  await ev(() => { N.audio._internal.music.restUntil = 0; });
  const mm1 = await waitMusic('marfa_day', 5000);
  check(mm1 === 'marfa_day', 'the next pass is the marfa band', mm1);

  console.log('\n== 5. the ♪ button, Settings');
  await page.click('.osd-mus');
  const d5 = await ev(() => ({ style: N.audio.music.style, btn: document.querySelector('.osd-mus').textContent }));
  const m5 = await waitMusic('day', 5000);
  check(d5.style === 'score' && /ORIGINAL/.test(d5.btn) && m5 === 'day', 'a click on ♪: back to the original score', { d5, m5 });
  await ev(() => N.menus.openSettings());
  await page.waitForSelector('.st-row[data-id="music.style"]', { timeout: 10000 });
  const d6 = await ev(() => {
    const row = document.querySelector('.st-row[data-id="music.style"]'), keyRow = document.querySelector('.st-row[data-id="key.music"]');
    return { opts: Array.from(row.querySelectorAll('button[data-v]')).map((b) => b.dataset.v + (b.classList.contains('sel') ? '*' : '')), key: keyRow && keyRow.textContent, help: row.textContent };
  });
  check(d6.opts.join(',') === 'score*,marfa,mix', 'Settings > Sound: Background music (' + d6.opts.join(', ') + ')', d6);
  check(/B/.test(d6.key || '') && /marfa/i.test(d6.key || ''), 'Settings > Controls: the key (' + (d6.key || '').replace(/\s+/g, ' ').trim() + ')', d6);
  await page.click('.st-row[data-id="music.style"] button[data-v="marfa"]');
  const d7 = await ev(() => ({ style: N.audio.music.style, sel: document.querySelector('.st-row[data-id="music.style"] button.sel').dataset.v }));
  check(d7.style === 'marfa' && d7.sel === 'marfa', 'picked in Settings: the marfa band', d7);

  console.log('\n== 6. persisted, errors');
  const errs = await ev(() => window.__errs.slice());
  await page.reload();
  await page.waitForFunction(() => window.N && N.state && N.state.mode === 'title', null, { timeout: 60000 });
  const after = await ev(() => N.audio.music.style);
  check(after === 'marfa', 'after a reload: still the marfa band', after);
  check(!errors.length && !errs.length, 'zero console errors, page errors and N.err', { errors: errors.slice(0, 5), errs: errs.slice(0, 5) });
  await ev(() => { try { localStorage.removeItem('nostalgia.audio.v1'); } catch (e) { /* ignore */ } });
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAIL' : 'all ok'));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
