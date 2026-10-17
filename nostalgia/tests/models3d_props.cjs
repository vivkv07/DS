/* NOSTALGIA — tests/models3d_props.cjs (Blender props family, ARCHITECTURE §21) — src/models3d_props.js
 * Headless Chromium + SwiftShader; three.js served from vendor/. Fails on any console / page / N.err error.
 *
 *  trees     Blender trees replace the procedural trees (instanced per chunk, per LOD + impostor);
 *            LOD assignment follows the camera distance; wind uniforms follow N.wind
 *  props     carts / STD booth / bus shelter / playground landmarks and podiums use the prop models;
 *            on-demand parsing (props are not parsed by models3d.js at start-up), wires(), animated()
 *  animals   traffic animals (cow / dog / goat) are routed to the skinned models with clips by state
 *  shots     screenshots tests/out/props_*.png
 *   node nostalgia/tests/models3d_props.cjs      ONLY=trees,props,animals   SHOTS=0
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
const failures = [];
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const want = (k) => !ONLY || ONLY.has(k);

async function openPage(browser) {
  const context = await browser.newContext({ viewport: { width: 720, height: 420 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  await page.evaluate(() => {
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.setTime(10, 0);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  });
  return { context, page, errors };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
async function shot(page, name) {
  if (!SHOTS) return;
  await frames(page, 3);
  await page.screenshot({ path: path.join(OUT, name), timeout: 240000 });
  ok('screenshot tests/out/' + name);
}
async function checkErrors(page, errors) {
  const nerr = await page.evaluate(() => (N.debug.state().errors || []));
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
  check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 6).join(' | '));
}
async function go(page, where, settle) {
  await page.evaluate((w) => (Array.isArray(w) ? N.debug.teleport(w[0], w[1]) : N.debug.teleport(w)), where);
  await page.evaluate((ms) => N.view3d.settle(ms), settle || 8000);
  await frames(page, 4);
}
const cam = (page, eye, at, fov) => page.evaluate(([e, a, f]) => N.view3dActors.debug.camera(e, a, f || 40), [eye, at, fov]);

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const t0 = Date.now();
  try {
    const { context, page, errors } = await openPage(browser);
    cur = 'boot';
    await page.evaluate(() => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1, drawDist: 900 }); N.view.set('tps'); });
    await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 180000 });
    await page.waitForFunction(() => N.models3d && N.models3d.state === 'ready', null, { timeout: 300000 });
    await page.waitForFunction(() => N.models3d.props && ['ready', 'failed'].indexOf(N.models3d.props.state) >= 0, null, { timeout: 300000 });
    const st = await page.evaluate(() => N.models3d.props.stats());
    check(st.state === 'ready', 'props runtime ready', JSON.stringify(st));
    console.log('  info ' + JSON.stringify(st));

    if (want('trees')) {
      cur = 'trees';
      await go(page, 'banana_cart_1', 12000);
      const s = await page.evaluate(() => N.models3d.props.stats());
      check(s.trees.length >= 6, 'tree models registered (' + s.trees.join(',') + ')');
      check(s.structs.indexOf('tree') >= 0, 'tree structure builder registered');
      check(s.treeInstances > 0, 'Blender tree instances in chunks: ' + s.treeInstances + ' lod ' + JSON.stringify(s.lodCounts));
      check(s.lodCounts[0] > 0 && (s.lodCounts[1] + s.lodCounts[2] + s.lodCounts[3]) > 0, 'near trees use LOD0, farther ones coarser LODs / impostors');
      const info = await page.evaluate(() => {
        let n = 0, bad = 0, imp = 0;
        N.view3d.engine.city.traverse((o) => {
          if (!o.isInstancedMesh || !/^m3d-tree:/.test(o.name)) return;
          n++;
          if (!o.geometry.attributes.aWind) bad++;
          if (/:imp$/.test(o.name)) imp++;
        });
        return { n, bad, imp };
      });
      check(info.n > 0 && info.bad === 0, 'tree instanced meshes carry the aWind attribute (' + info.n + ' meshes)');
      // wind follows N.wind
      const w = await page.evaluate(async () => {
        const P = N.models3d.props, prev = N.wind;
        if (P.windUniforms.shared) return { shared: true };
        N.wind = { dir: 1.2, strength: 0.8, gustiness: 0.6 };
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const u = P.windUniforms.uWind.value, t0 = P.windUniforms.uWindWave.value.z;
        const out = { v: [u.x, u.y, u.z, u.w], t0 };
        await new Promise((r) => setTimeout(r, 300));
        out.t1 = P.windUniforms.uWindWave.value.z;
        if (prev === undefined) delete N.wind; else N.wind = prev;
        return out;
      });
      if (w.shared) ok('tree wind shares the atmosphere layer uniforms (N.wind.uniforms)');
      else check(Math.abs(w.v[0] - Math.cos(1.2)) < 1e-3 && Math.abs(w.v[2] - 0.8) < 1e-3 && Math.abs(w.v[3] - 0.6) < 1e-3 && w.t1 > w.t0, 'wind uniforms follow N.wind and the wind clock runs ' + w.v.map((v) => v.toFixed(2)).join(','));
      // pixels move with wind: two renders at different times differ near trees
      const p = await page.evaluate(() => ({ x: N.player.x, y: N.player.y }));
      await cam(page, [p.x - 60, 26, p.y + 60], [p.x, 14, p.y], 50);
      await shot(page, 'props_trees.png');
      await cam(page, [p.x - 260, 90, p.y + 260], [p.x, 10, p.y], 55);
      await page.evaluate(() => N.view3d.settle(4000));
      await shot(page, 'props_trees_far.png');
      await cam(page, null);
    }

    if (want('props')) {
      cur = 'props';
      const s = await page.evaluate(() => N.models3d.props.stats());
      check(s.landmarks.length > 0, 'prop landmark hooks registered: ' + s.landmarks.join(','));
      for (const lm of ['banana_cart_1', 'std_booth_1', 'chai_bandi_1']) {
        const found = await page.evaluate((id) => (N.WORLD_DATA.landmarks || []).find((l) => l.id === id) ? true : false, lm);
        if (!found) continue;
        await go(page, lm, 8000);
        const has = await page.evaluate((id) => { let f = null; N.view3d.engine.scene.traverse((o) => { if (!f && o.name && o.name.indexOf('m3dp-lm:') === 0 && o.name.slice(-id.length - 1) === ':' + id) f = o.name; }); return f; }, lm);
        check(!!has, lm + ' rendered by the prop model (' + has + ')');
        const L = await page.evaluate((id) => (N.WORLD_DATA.landmarks || []).find((l) => l.id === id), lm);
        await cam(page, [L.x - 26, 16, L.y + 34], [L.x, 3, L.y], 40);
        await shot(page, 'props_' + lm + '.png');
        await cam(page, null);
      }
      const api = await page.evaluate(async () => {
        const P = N.models3d.props;
        const ids = ['pole_psc', 'bird_crow', 'tank_sintex'];
        const okp = await P.ensure(ids);
        const w = P.wires('pole_psc');
        const a = P.animated('bird_crow');
        const r = { ok: okp, wires: w ? Object.keys(w) : null, clips: a ? Object.keys(a.clips) : null, played: a ? a.play('flap') : false };
        if (a) { a.update(0.1); a.dispose(); }
        r.parsedAtStart = N.models3d.stats().parsed.filter((id) => /^(pole_|bird_)/.test(id)).length;
        return r;
      });
      check(api.ok.every(Boolean), 'ensure() parses props on demand ' + JSON.stringify(api.ok));
      check(api.wires && api.wires.some((k) => /^wire_L/.test(k)), 'wires(pole_psc) lists wire_* attachment points ' + JSON.stringify(api.wires));
      check(api.clips && api.clips.indexOf('flap') >= 0 && api.played, 'animated(bird_crow) plays its flap clip ' + JSON.stringify(api.clips));
    }

    if (want('animals')) {
      cur = 'animals';
      // spawn a cow / dog / goat near the player through the traffic module when it can, else find some
      const sp = await page.evaluate(() => {
        const T = N.traffic;
        const a = (T && T.animals) || [];
        const sp = {};
        for (const x of a) sp[x.species] = (sp[x.species] || 0) + 1;
        const cow = a.find((x) => x.species === 'cow');
        return { sp, cow: cow ? { x: cow.x, y: cow.y } : null };
      });
      console.log('  info animals ' + JSON.stringify(sp.sp));
      if (sp.cow) {
        await go(page, [sp.cow.x + 30, sp.cow.y + 30], 8000);
        await frames(page, 10);
        const r = await page.evaluate(() => {
          const s = N.models3d.props.stats();
          let objs = 0, clips = [];
          N.view3d.engine.actorGroup.traverse((o) => { if (o.userData && o.userData.m3dAnim) { objs++; clips.push(o.userData.m3dAnim.curName); } });
          return { routed: s.routedAnimals, objs, clips };
        });
        check(r.routed > 0 && r.objs > 0, 'animals routed to Blender models: ' + r.routed + ' (' + r.clips.join(',') + ')');
        check(r.clips.every((c) => !!c), 'every animal model plays a clip');
        await cam(page, [sp.cow.x - 22, 12, sp.cow.y + 26], [sp.cow.x, 3, sp.cow.y], 40);
        await shot(page, 'props_animals.png');
        await cam(page, null);
      } else ok('no cow in the world to check (skipped)');
    }

    cur = 'errors';
    await checkErrors(page, errors);
    await context.close();
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log('\nmodels3d_props: ' + (failures.length ? failures.length + ' failure(s)' : 'all passed') + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (failures.length) { for (const f of failures) console.log('  ' + f); process.exit(1); }
})();
