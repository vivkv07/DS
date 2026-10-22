/* NOSTALGIA — tests/people2003.cjs  (the 2003 wardrobe: entities.js N.people.dress, traffic.js makeLook, view3d_actors.js)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/graphics_ultra.cjs).
 *  1. the street on a January morning: most grown men with a moustache, checked and full-sleeve shirts, kurtas,
 *     safari suits, the old men's white dhotis, teenage girls in half-sarees with jasmine, sweaters and monkey caps
 *     in the cold (fewer at noon)
 *  2. randomLook stays deterministic for a seeded rng, and gets the same details
 *  3. 2D: each detail is painted (checks, the sweater, the monkey cap, jasmine in
 *     the plait, the dhoti's border, the kurta's flare)
 *  4. 3D: each detail reaches the person mesh (lookSpec: the tunic, full sleeves, the hood, jasmine, the wrap, the
 *     checked shirt's pattern bit); the line-up screenshot
 *  5. zero console errors, page errors and N.err
 *   node nostalgia/tests/people2003.cjs          (SHOTS=0 skips the screenshots)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'people2003');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 500) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// sample looks for the paintings and the line-up (the 2003 details on plain bases)
const SAMPLES = [
  { kind: 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#efe2c4', pants: '#3a3a4a', checks: '#7a1f2b', moustache: true },
  { kind: 'man', skin: '#8d5a3b', hair: '#1a1412', shirt: '#dfe8f2', pants: '#4a4a52', sleeves: 'long', moustache: true, specs: true },
  { kind: 'man', skin: '#b97a4f', hair: '#1a1412', shirt: '#b8ab8a', pants: '#b8ab8a', safari: true, moustache: true, belly: true },
  { kind: 'man', skin: '#a0683f', hair: '#1a1412', shirt: '#f4f2ea', pants: '#efe9dc', kurta: true, sleeves: 'long', moustache: true },
  { kind: 'man', skin: '#9a6040', hair: '#e8e4dc', shirt: '#f4f2ea', pants: '#efe9dc', lungi: '#f4f2ea', dhoti: true, border: '#c9a227', hat: 'monkey', hatColor: '#7a1f2b', sweater: '#5a5a62' },
  { kind: 'man', skin: '#c68b5e', hair: '#1a1412', shirt: '#22305a', pants: '#3a5070', sweater: '#c8a020', moustache: true },
  { kind: 'saree', girl: true, size: 0.9, skin: '#b97a4f', hair: '#1a1412', saree: '#c03a8a', border: '#f2c230', blouse: '#2a8c82', gajra: true },
  { kind: 'woman', skin: '#a0683f', hair: '#1a1412', shirt: '#e8742a', pants: '#efe9dc', dupatta: '#2a8c82', gajra: true },
  { kind: 'aunty', skin: '#8d5a3b', hair: '#1a1412', saree: '#1f6a4a', border: '#c9a227', blouse: '#155030', sweater: '#7a1f2b' },
  { kind: 'uncle', skin: '#9a6040', hair: '#8a8680', lungi: '#2a5cb8', moustache: true, sweater: '#22305a', hat: 'monkey', hatColor: '#3a5a3a' },
];

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 620 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });

  console.log('\n== 1. the street on a January morning');
  const st = await page.evaluate(() => {
    const roles = ['man', 'uncle', 'youth', 'college', 'office', 'old', 'elder', 'lungi', 'aunty', 'woman', 'kid', 'student', 'teen', 'vendor', 'police', 'porter', 'pilgrim', 'worker'];
    const styles = ['colony', 'oldcity', 'market', 'colonial', 'posh'];
    const sample = (t) => {
      N.debug.setTime(t[0], t[1]);
      const out = [];
      for (let k = 0; k < 1400; k++) { const role = roles[k % roles.length], r = N.traffic.makeLook(role, styles[(k / roles.length | 0) % styles.length]); out.push({ role, L: r.look }); }
      return out;
    };
    const share = (arr, f) => arr.length ? arr.filter(f).length / arr.length : 0;
    const morning = sample([7, 30]), noon = sample([13, 0]);
    const men = morning.filter((q) => q.L.kind === 'man' && q.role !== 'police' && q.role !== 'kid' && q.role !== 'student');
    const adults = (a) => a.filter((q) => q.role !== 'kid' && q.role !== 'student' && q.L.kind !== 'burqa' && q.role !== 'police');
    const has = (f) => morning.filter((q) => f(q.L)).length;
    return {
      moustache: +share(morning.filter((q) => q.L.kind === 'man' && !q.L.beard && q.role !== 'kid' && q.role !== 'student'), (q) => q.L.moustache).toFixed(2),
      checks: +share(men, (q) => q.L.checks).toFixed(2), long: +share(men, (q) => q.L.sleeves === 'long').toFixed(2),
      kurta: has((L) => L.kurta), safari: has((L) => L.safari), dhoti: has((L) => L.dhoti && L.kind === 'man'),
      teen: morning.filter((q) => q.role === 'teen').every((q) => q.L.kind === 'saree' && q.L.girl && q.L.blouse !== q.L.saree), teenGajra: +share(morning.filter((q) => q.role === 'teen'), (q) => q.L.gajra).toFixed(2),
      sweaterAM: +share(adults(morning), (q) => q.L.sweater).toFixed(2), sweaterPM: +share(adults(noon), (q) => q.L.sweater).toFixed(2),
      monkey: morning.filter((q) => q.L.hat === 'monkey').length, teenRole: (() => { let n = 0; for (let i = 0; i < 400; i++) if (N.traffic.pickRole && N.traffic.pickRole('colony') === 'teen') n++; return N.traffic.pickRole ? n : -1; })(),
    };
  });
  check(st.moustache >= 0.6, `most grown men wear a moustache (${Math.round(st.moustache * 100)}%)`, st);
  check(st.checks >= 0.12 && st.long >= 0.15, `checked shirts (${Math.round(st.checks * 100)}% of the men) and full sleeves (${Math.round(st.long * 100)}%)`, st);
  check(st.kurta > 20 && st.safari > 3 && st.dhoti > 3, `kurtas (${st.kurta}), safari suits (${st.safari}), old men's white dhotis (${st.dhoti})`, st);
  check(st.teen && st.teenGajra > 0.4, `teenage girls in half-sarees (the voni a different colour), jasmine in ${Math.round(st.teenGajra * 100)}% of the plaits`, st);
  check(st.sweaterAM >= 0.15 && st.sweaterPM < st.sweaterAM * 0.7 && st.monkey > 3, `a January morning: sweaters on ${Math.round(st.sweaterAM * 100)}% (noon ${Math.round(st.sweaterPM * 100)}%), ${st.monkey} monkey caps`, st);
  if (st.teenRole >= 0) check(st.teenRole > 0, `the colony's streets have teenage girls (${st.teenRole} of 400 picks)`, st);

  console.log('\n== 2. randomLook');
  const rl = await page.evaluate(() => {
    N.debug.setTime(7, 30);
    const a = JSON.stringify(N.people.randomLook(N.util.rng(42), 'man')), b = JSON.stringify(N.people.randomLook(N.util.rng(42), 'man'));
    let m = 0, n = 0; for (let i = 0; i < 300; i++) { const L = N.people.randomLook(N.util.rng(i * 13 + 5), 'man'); n++; if (L.moustache) m++; }
    return { same: a === b, share: +(m / n).toFixed(2) };
  });
  check(rl.same && rl.share >= 0.6, `randomLook stays the same for a seed, and dresses the same way (moustaches ${Math.round(rl.share * 100)}%)`, rl);

  console.log('\n== 3. 2D');
  const d2 = await page.evaluate((S) => {
    const cnt = (L) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.translate(32, 32); g.scale(2.6, 2.6); N.people.draw(g, L, { phase: 0, speed: 0 });
      const d = g.getImageData(0, 0, 64, 64).data, map = new Map();
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; const k = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''); map.set(k, (map.get(k) || 0) + 1); }
      return map;
    };
    const near = (map, hex, tol) => { const t = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); let n = 0; for (const [k, v] of map) { const c = [1, 3, 5].map((i) => parseInt(k.slice(i, i + 2), 16)); if (Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) + Math.abs(c[2] - t[2]) <= (tol || 40)) n += v; } return n; };
    const plain = Object.assign({}, S[0]); delete plain.checks;
    const out = {};
    out.checks = near(cnt(S[0]), '#7a1f2b', 90) - near(cnt(plain), '#7a1f2b', 90);
    const sw = cnt(S[5]); out.sweater = near(sw, '#c8a020', 60);
    out.monkey = near(cnt(S[4]), '#7a1f2b', 30); out.dhotiBorder = near(cnt(S[4]), '#c9a227', 40);
    const gj = Object.assign({}, S[7]), ng = Object.assign({}, S[7]); delete ng.gajra; out.gajra = near(cnt(gj), '#f8f4ea', 20) - near(cnt(ng), '#f8f4ea', 20);
    const k1 = Object.assign({}, S[3]), k0 = Object.assign({}, S[3]); delete k0.kurta; out.kurta = near(cnt(k1), '#f4f2ea', 12) - near(cnt(k0), '#f4f2ea', 12);
    return out;
  }, SAMPLES);
  check(d2.checks > 6, `a checked shirt shows its checks (${d2.checks} px of the line colour)`, d2);
  check(d2.sweater > 30, `the sweater over the shirt (${d2.sweater} px of wool)`, d2);
  check(d2.monkey > 20 && d2.dhotiBorder > 0, `the monkey cap (${d2.monkey} px) and the dhoti's border (${d2.dhotiBorder} px)`, d2);
  check(d2.gajra > 0 && d2.kurta > 0, `jasmine down the plait (+${d2.gajra} px), the kurta's flare (+${d2.kurta} px)`, d2);
  if (SHOTS) {
    // the 2D wardrobe sheet: each sample big, walking
    const b64 = await page.evaluate((S) => {
      const c = document.createElement('canvas'); c.width = S.length * 90; c.height = 120; const g = c.getContext('2d');
      g.fillStyle = '#c8b898'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
      S.forEach((L, i) => { g.save(); g.translate(45 + i * 90, 60); g.rotate(-Math.PI / 2); g.scale(4.2, 4.2); N.people.draw(g, L, { phase: 0.8, speed: 0.6 }); g.restore(); });
      return c.toDataURL('image/png').split(',')[1];
    }, SAMPLES);
    fs.writeFileSync(path.join(OUT, 'wardrobe_2d.png'), Buffer.from(b64, 'base64'));
    ok('2D wardrobe sheet: tests/out/people2003/wardrobe_2d.png');
  }

  console.log('\n== 4. 3D');
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
  const d3 = await page.evaluate((S) => {
    const A = N.view3dActors, F = A.F, has = (s, id) => { const i = id - 1, w = (i / 20) | 0, b = i - w * 20; return Math.floor(s.f[w] / Math.pow(2, b)) % 2 === 1; };
    const bit = (s, b) => Math.floor(s.f[3] / Math.pow(2, b)) % 2 === 1;
    const sp = S.map((L, i) => A.lookSpec(Object.assign({}, L), i + 1));
    return {
      checks: bit(sp[0], 22), longSleeves: has(sp[1], F.SLEEVE_LONG) && !has(sp[1], F.SLEEVE_SHORT), kurta: has(sp[3], F.TUNIC),
      dhoti: has(sp[4], F.WRAP) && !has(sp[4], F.LEG_PANTS) && bit(sp[4], 16), monkey: has(sp[4], F.HOOD), sweater: has(sp[5], F.SLEEVE_LONG),
      gajra: has(sp[6], F.JASMINE) && has(sp[7], F.JASMINE), teen: sp[6].size < 0.95,
    };
  }, SAMPLES);
  check(d3.checks && d3.longSleeves && d3.kurta, '3D: the checked shirt (pattern bit), full sleeves, the kurta (tunic)', d3);
  check(d3.dhoti && d3.monkey && d3.sweater, '3D: the dhoti (a wrap with its border), the monkey cap (hood), the sweater (full sleeves)', d3);
  check(d3.gajra && d3.teen, '3D: jasmine in the plaits, the half-saree girl a little smaller', d3);
  if (SHOTS) {
    await page.evaluate((S) => {
      N.debug.teleport('fateh_maidan'); N.debug.setTime(10, 30); N.view3d.settle(20000);
      const p = N.player, b = { x: p.x, y: p.y };
      window.__peds = S.map((L, i) => { const e = new N.Actor({ kind: 'ped', x: b.x - 30 + i * 6.6, y: b.y + 12, r: 3.4 }); e.look = Object.assign({}, L); e.anim = { phase: i, speed: 0, run: false }; e.angle = -Math.PI / 2; N.entities.add(e); return e; });
      p.hidden = true;
      const g = N.view3d.elevation(p);
      N.view3dActors.debug.camera([b.x, g + 9, b.y - 26], [b.x, g + 5, b.y + 12], 50);
    }, SAMPLES);
    await sleep(6000);
    await page.screenshot({ path: path.join(OUT, 'wardrobe_3d.png'), timeout: 240000 });
    await page.evaluate(() => { for (const e of window.__peds) N.entities.remove(e); N.player.hidden = false; N.view3dActors.debug.camera(null); });
    ok('3D line-up: tests/out/people2003/wardrobe_3d.png');
  }
  await page.evaluate(() => { N.view.set('top'); });

  console.log('\n== 5. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 6));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
