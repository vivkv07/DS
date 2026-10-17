// Audio lab: renders every SFX / instrument / track offline, prints levels, draws spectrogram sheets.
// node staging/lab.cjs [sfx|inst|tracks|live|all]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, '..', 'tests', 'out', 'audio_lab'); // git-ignored
fs.mkdirSync(OUT, { recursive: true });
const what = process.argv[2] || 'all';

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, 'audio_lab.html'));

  async function sheet(name, items, secs, cols, cellW, cellH, kind) {
    const res = await page.evaluate(async ({ items, secs, cols, cellW, cellH, kind }) => {
      const rows = Math.ceil(items.length / cols);
      const cv = document.getElementById('sheet');
      cv.width = cols * cellW; cv.height = rows * cellH;
      const ctx = cv.getContext('2d');
      const out = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const t0 = performance.now();
        let r;
        try {
          if (kind === 'track') r = await N.audio.renderTrackOffline(it.id, it.secs || secs, it.opts || {});
          else r = await N.audio.renderOffline(it.id, it.secs || secs, it.opts || {});
        } catch (e) { out.push({ id: it.label || it.id, err: String(e && e.stack || e) }); continue; }
        const ms = performance.now() - t0;
        LAB.draw(ctx, r.buffer, (i % cols) * cellW, Math.floor(i / cols) * cellH, cellW - 4, cellH - 4,
          (it.label || it.id) + '  pk ' + r.peak.toFixed(2) + '  rms ' + r.rms.toFixed(3));
        out.push({ id: it.label || it.id, peak: +r.peak.toFixed(3), rms: +r.rms.toFixed(4), ms: Math.round(ms) });
      }
      return out;
    }, { items, secs, cols, cellW, cellH, kind });
    const el = await page.$('#sheet');
    await el.screenshot({ path: path.join(OUT, name + '.png') });
    return res;
  }

  const names = await page.evaluate(() => N.audio.SFX_NAMES);
  if (what === 'sfx' || what === 'all') {
    const items = names.map((id) => ({ id, secs: ['dialup', 'std_ring', 'church_bell', 'temple_bell', 'crowd_cheer', 'applause', 'cooker', 'flour_mill', 'kite_wind', 'chetak_start', 'diesel_start', 'gurkha', 'firework', 'school_bell', 'lorry_horn', 'koel'].includes(id) ? 3.6 : 2 }));
    const half = Math.ceil(items.length / 2);
    const r1 = await sheet('sfx_1', items.slice(0, half), 2, 6, 230, 150, 'sfx');
    const r2 = await sheet('sfx_2', items.slice(half), 2, 6, 230, 150, 'sfx');
    const all = r1.concat(r2);
    console.log('SFX', all.length);
    for (const r of all) console.log((r.err ? 'ERR ' : (r.rms < 0.002 ? 'QUIET ' : r.peak > 1 ? 'CLIP ' : '      ')) + JSON.stringify(r));
  }
  if (what === 'inst' || what === 'all') {
    const inst = ['sitar', 'santoor', 'mandolin', 'tanpura', 'guitar', 'harp', 'bansuri', 'shehnai', 'clarinet', 'trumpet', 'synlead', 'violin', 'harmonium1',
      'harmonium', 'strings', 'brass', 'pad', 'epiano', 'bass', 'synbass', 'stab', 'bell', 'glock'];
    const items = inst.map((id) => ({ id, secs: 2.2, opts: { notes: /harmonium$|strings|brass|pad|epiano|stab/.test(id) ? [62, 66, 69] : /bass/.test(id) ? [38] : [67], dur: 1.2 } }));
    const kits = { tabla: ['dha', 'dhin', 'na', 'tin', 'tun', 'ti', 'ge', 'ka'], dholak: ['D', 'g', 't', 'k', 'c'], kit: ['k', 's', 'h', 'o', 'c', 't', 'x'], band: ['B', 'S', 'R', 'C', 'M', 'P', 'T'], dhol: ['D', 't'], clap: ['x', 'X'] };
    for (const k in kits) for (const s of kits[k]) items.push({ id: k, label: k + '.' + s, secs: 1, opts: { stroke: s, tune: 294 } });
    const r = await sheet('inst', items, 2, 8, 175, 130, 'inst');
    for (const x of r) console.log((x.err ? 'ERR ' : (x.rms < 0.002 ? 'QUIET ' : x.peak > 1 ? 'CLIP ' : '      ')) + JSON.stringify(x));
  }
  if (what === 'tracks' || what === 'all') {
    const ids = await page.evaluate(() => Object.keys(N.audio._internal.TRACKS));
    const items = ids.map((id) => ({ id, secs: /^id_/.test(id) ? 5 : 14, opts: /^r_|^id_/.test(id) ? { radio: true } : {} }));
    const r = await sheet('tracks', items, 14, 3, 460, 170, 'track');
    for (const x of r) console.log((x.err ? 'ERR ' : (x.rms < 0.01 ? 'QUIET ' : x.peak > 1 ? 'CLIP ' : '      ')) + JSON.stringify(x));
    const durs = await page.evaluate(() => Object.keys(N.audio._internal.TRACKS).map((id) => { const c = N.audio._internal.compile(id); return id + ' ' + c.duration.toFixed(1) + 's loop ' + c.loopDur.toFixed(1); }));
    console.log(durs.join('\n'));
  }
  if (what === 'live' || what === 'all') {
    const r = await page.evaluate(async () => {
      const A = N.audio;
      A.unlock();
      await new Promise((r) => setTimeout(r, 200));
      const res = { ok: [], fail: [] };
      for (const n of A.SFX_NAMES) { (A.sfx(n, { force: true }) ? res.ok : res.fail).push(n); await new Promise((r) => setTimeout(r, 15)); }
      for (const id of A.music.TRACKS) { A.music.play(id); await new Promise((r) => setTimeout(r, 120)); }
      A.music.stop(0.1);
      for (let i = 0; i < 4; i++) { A.radio.next(); await new Promise((r) => setTimeout(r, 300)); }
      A.walkman.play('r_neon'); await new Promise((r) => setTimeout(r, 300)); A.walkman.stop();
      A.engine({ type: 'chetak', vx: 80, vy: 0 }); await new Promise((r) => setTimeout(r, 200)); A.engine(null);
      res.stats = A.stats();
      return res;
    });
    console.log('LIVE ok', r.ok.length, 'fail', r.fail, JSON.stringify(r.stats));
  }
  console.log('ERRORS', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
