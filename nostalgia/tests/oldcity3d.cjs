/* NOSTALGIA — tests/oldcity3d.cjs (Old City Blender landmarks, ARCHITECTURE §21) — the GLB models from
 * tools/blender/landmarks_oldcity.py replace the procedural landmarks in 3D:
 *  - each Old City model in the pack is registered and builds as 'm3d-lm:<asset>:<landmark>' for its
 *    landmarks (the procedural 'lm3d:<id>' is gone), with COL_ camera proxies;
 *  - the model's world bounding box matches the worlddata footprint (x / z within 12 %);
 *  - screenshots: an orbit camera per landmark by day (tests/out/oldcity_<asset>.png), Charminar
 *    also at night, third person and first person; zero console / page / N.err errors.
 *   node nostalgia/tests/oldcity3d.cjs      ONLY=charminar,kaman   SHOTS=0   NIGHT=0
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const SHOTS = process.env.SHOTS !== '0';
const NIGHT = process.env.NIGHT !== '0';
const failures = [];
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (c, m) => { if (c) ok(m); else fail(m); return !!c; };

/** the Old City assets: manifest ids from the family script, read from the json files */
function oldcityAssets() {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'assets3d'))) {
    if (!f.endsWith('.json')) continue;
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets3d', f), 'utf8'));
    if (m.script === 'landmarks_oldcity' || /^oldcity/.test(m.script || '')) out.push(m);
  }
  return out.filter((m) => !ONLY || ONLY.has(m.id));
}

(async () => {
  const assets = oldcityAssets();
  console.log('Old City assets: ' + assets.map((a) => a.id).join(', '));
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true);
    N.view.noPointerLock = true; if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1, drawDist: 900 }); N.view.set('tps'); });
  await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 180000 });
  await page.waitForFunction(() => N.models3d && ['ready', 'missing', 'failed'].indexOf(N.models3d.state) >= 0, null, { timeout: 300000 });
  check(await page.evaluate(() => N.models3d.state) === 'ready', 'models3d ready');
  const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
  const shot = async (name) => { if (!SHOTS) return; await frames(2); await page.screenshot({ path: path.join(OUT, name), timeout: 240000 }); ok('screenshot tests/out/' + name); };

  for (const a of assets) {
    console.log('\n== ' + a.id);
    const lms = await page.evaluate((meta) => N.world.data.landmarks.filter((l) => (meta.landmark ? l.id === meta.landmark : l.draw === meta.draw)).map((l) => ({ id: l.id, x: l.x, y: l.y, w: l.w, d: l.d, h: l.h, face: l.face, faceAngle: l.faceAngle })), a.meta);
    if (!check(lms.length > 0, a.id + ': landmarks in worlddata (' + lms.map((l) => l.id).join(', ') + ')')) continue;
    check(await page.evaluate((id) => N.models3d.has(id) && N.models3d.loaded(id), a.id), a.id + ': in the pack and parsed');
    const lm = lms[0];
    await page.evaluate((l) => { N.debug.teleport(l.x, l.y + Math.max(l.d, l.w) * 0.5 + 60); N.debug.setTime(10, 30); N.view3d.settle(30000); }, lm);
    await frames(4);
    const geo = await page.evaluate((l) => {
      const ch = N.view3d.engine.lmGroup.children;
      const o = ch.find((c) => c.name.indexOf('m3d-lm:') === 0 && c.name.endsWith(':' + l.id));
      const proc = ch.some((c) => c.name === 'lm3d:' + l.id);
      if (!o) return { names: ch.map((c) => c.name).filter((n) => n.indexOf(l.id) >= 0), proc };
      const T = N.view3d.THREE;
      const b = new T.Box3();
      let col = 0;
      o.updateMatrixWorld(true);
      o.traverse((m) => { if (!m.isMesh) return; if (m.material && m.material.visible === false) { col++; return; } b.expandByObject(m); });
      return { name: o.name, proc, col, min: b.min.toArray(), max: b.max.toArray() };
    }, lm);
    if (!check(!!geo.name && !geo.proc, a.id + ': builds as ' + (geo.name || '(missing: ' + (geo.names || []).join(', ') + ')') + ', procedural model replaced')) continue;
    const wx = geo.max[0] - geo.min[0], wz = geo.max[2] - geo.min[2];
    const cx = (geo.max[0] + geo.min[0]) / 2, cz = (geo.max[2] + geo.min[2]) / 2;
    const fw = lm.w, fd = lm.d;
    // a landmark turned by faceAngle (e.g. Purana Pul along its skewed span): its axis-aligned box is wider by design
    const rotated = isFinite(lm.faceAngle) && Math.abs(Math.cos(lm.faceAngle)) > 0.05;
    const okFoot = (rotated ? Math.max(wx, wz) >= Math.max(fw, fd) * 0.95 && Math.max(wx, wz) <= Math.max(fw, fd) * 1.15
      : Math.abs(wx - fw) <= fw * 0.12 + 2 && Math.abs(wz - fd) <= fd * 0.12 + 2) && Math.abs(cx - lm.x) < 6 && Math.abs(cz - lm.y) < 6;
    check(okFoot, a.id + ': footprint ' + wx.toFixed(1) + ' x ' + wz.toFixed(1) + ' at (' + cx.toFixed(0) + ', ' + cz.toFixed(0) + ') vs ' + fw + ' x ' + fd + ' at (' + lm.x + ', ' + lm.y + '), top ' + geo.max[1].toFixed(1));
    check(geo.col > 0, a.id + ': COL_ camera proxies (' + geo.col + ')');
    if (SHOTS) {
      const R = Math.max(lm.w, lm.d, (lm.h || 20) * 1.5);
      const top = (geo.max[1] - geo.min[1]);
      // from the facade side (face n/s/e/w; none = south), a little to its left and high enough to clear the
      // surrounding lots so the model itself is in view
      await page.evaluate(([l, R, top]) => {
        const F = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[l.face || 's'] || [0, 1];
        const sx = -F[1], sy = F[0];
        const d = R * 1.35 + 30;
        N.view3dActors.debug.camera([l.x + F[0] * d + sx * d * 0.45, Math.max(45, top * 1.1), l.y + F[1] * d + sy * d * 0.45], [l.x, top * 0.4, l.y], 50);
      }, [lm, R, top]);
      await shot('oldcity_' + a.id + '.png');
      if (a.id === 'charminar' && NIGHT) {
        await page.evaluate(() => N.debug.setTime(21, 0));
        await frames(3);
        await shot('oldcity_charminar_night.png');
        await page.evaluate(() => N.debug.setTime(10, 30));
      }
      await page.evaluate(() => N.view3dActors.debug.camera(null));
    }
  }
  if (SHOTS && assets.some((a) => a.id === 'charminar')) {
    console.log('\n== Charminar from the player (tps / fps)');
    await page.evaluate(() => { const l = N.world.data.landmarks.find((x) => x.id === 'charminar'); N.debug.teleport(l.x + 10, l.y + 95); N.debug.setTime(17, 30); N.view3d.settle(30000); });
    await frames(4);
    await page.evaluate(() => N.view3d.setCamera({ yaw: -Math.PI / 2, pitch: 0.18, snap: true }));
    await shot('oldcity_charminar_tps.png');
    await page.evaluate(() => N.view.set('fps'));
    await page.waitForFunction(() => N.view.mode === 'fps', null, { timeout: 60000 });
    await page.evaluate(() => N.view3d.setCamera({ yaw: -Math.PI / 2, pitch: -0.32, snap: true }));
    await shot('oldcity_charminar_fps.png');
    await page.evaluate(() => { const l = N.world.data.landmarks.find((x) => x.id === 'charminar'); N.debug.teleport(l.x, l.y); N.view3d.setCamera({ yaw: -Math.PI / 2, pitch: -0.75, snap: true }); });
    await frames(4);
    await shot('oldcity_charminar_under.png');
    if (NIGHT) {
      await page.evaluate(() => { const l = N.world.data.landmarks.find((x) => x.id === 'charminar'); N.debug.teleport(l.x + 10, l.y + 95); N.debug.setTime(21, 30); N.view3d.setCamera({ yaw: -Math.PI / 2, pitch: -0.3, snap: true }); });
      await frames(4);
      await shot('oldcity_charminar_fps_night.png');
    }
    await page.evaluate(() => N.view.set('tps'));
  }
  const nerr = await page.evaluate(() => (N.debug.state().errors || []));
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
  check(all.length === 0, 'no console / page / N.err errors' + (all.length ? ': ' + all.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log(failures.length ? '\nFAILED ' + failures.length + ':\n  ' + failures.join('\n  ') : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
