/* NOSTALGIA — tests/characters3d.cjs (characters artist, ARCHITECTURE §21 "Characters") — the Blender
 * people (tools/blender/characters.py) in the 3D view through src/models3d_people.js.
 * Headless Chromium + SwiftShader (software GL: small viewports, long timeouts); three.js from vendor/.
 * Fails on any console error / page error / N.err.
 *
 *  select    every archetype in the pack is reachable: looks (N.people kinds, traffic roles, the named
 *            cast) choose the right model; accessory slots follow the look (camera, specs, frock, tie...)
 *  lineup    every archetype x preview variant standing in a row: day + night screenshots, faces
 *  gait      binding feedback_3d #2 with frame sequences: Chinnu (the player) walking / running and an
 *            adult (man_shirt_pants) driven at walk / run speeds: 8-frame strips at 0.1 s + dense
 *            sampling of the sole anchors — grounded soles must not slide (< 8 % of the travel), never
 *            sink, the run has flight, standing keeps both feet down
 *  states    sitting on a bench (the bench is drawn), the comic fall and getting up, talking, the
 *            traffic constable, clips asked for by scripts (clap, kite_fly, wave)
 *  crowd     the street in TPS (day + night) and FPS: people routed to the Blender models within the
 *            budget, the procedural renderer for the rest, frame time with the models on / off
 *   node nostalgia/tests/characters3d.cjs     ONLY=select,lineup,...   SHOTS=0   PACK=<pack .js>
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
const PACK = process.env.PACK ? 'file://' + path.resolve(process.env.PACK) : null;
const failures = [];
const report = [];
let cur = '';
const fail = (msg) => { failures.push('[' + cur + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail ? ' — ' + detail : '')); return !!cond; };
const want = (k) => !ONLY || ONLY.has(k);

async function openPage(browser, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 720, height: 420 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 120000 });
  await page.evaluate((pk) => {
    if (pk) N.models3d.packUrls = [pk];
    N.debug.newGame({ skipIntro: true });
    N.debug.freezeClock(true);
    N.debug.god(true);
    N.view.noPointerLock = true;
    if (N.dialogue) N.dialogue.skip = true;
    const d = document.getElementById('debug'); if (d) d.style.display = 'none';
  }, PACK);
  return { context, page, errors };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n || 2);
async function to3D(page, mode) {
  await page.evaluate((m) => { N.view3d.setQuality({ adaptive: false, pixelRatio: 1, drawDist: 420 }); N.view.set(m || 'tps'); }, mode);
  await page.waitForFunction((m) => N.view.mode === (m || 'tps'), mode, { timeout: 240000 });
}
async function waitPeople(page) {
  await page.waitForFunction(() => N.models3d && ['ready', 'missing', 'failed'].indexOf(N.models3d.state) >= 0, null, { timeout: 300000 });
  await page.waitForFunction(() => N.models3d.state !== 'ready' || (N.models3d.people && N.models3d.people.ready), null, { timeout: 60000 });
  await frames(page, 3);
  return page.evaluate(() => ({ m3d: N.models3d.stats(), ppl: N.models3d.people.stats(), models: N.models3d.people.models() }));
}
async function checkErrors(page, errors) {
  const nerr = await page.evaluate(() => (N.debug.state().errors || []));
  const all = errors.concat(nerr.map((e) => 'N.err: ' + e));
  check(all.length === 0, 'no console / page / N.err errors', all.slice(0, 6).join(' | '));
}
const saveData = (name, data) => { if (!data) return; fs.writeFileSync(path.join(OUT, name), Buffer.from(data.split(',')[1], 'base64')); ok('saved tests/out/' + name); };
async function shot(page, name) {
  if (!SHOTS) return;
  await frames(page, 3);
  await page.screenshot({ path: path.join(OUT, name), timeout: 240000 });
  ok('screenshot tests/out/' + name);
}

/* in-page helpers */
const HELPERS = () => {
  const T = () => N.view3d.THREE;
  window.CH = {
    raf(n) { return new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }); },
    person(e) { return N.models3d.people.person(e || N.player); },
    async parse(ids) { for (const id of ids) if (!N.models3d.loaded(id)) await N.models3d.parse(id); return ids.filter((id) => N.models3d.loaded(id)); },
    /** a free-standing person (not an entity): Person over H.layer */
    make(id, look, ctx) {
      const md = N.models3d.debug.S.models.get(id);
      const P = new N.models3d.people.debug.Person(md, look || md.meta.look, ctx || { _r: 0.5 });
      N.view3d.H.layer.add(P.object);
      return P;
    },
    drop(P) { if (P) P.dispose(); },
    lows(P, ground) { const s = P.soles(); return Object.values(s).map((q) => +(q.h - ground).toFixed(3)); },
    /** sliding of grounded sole points between successive samples (like tests/models3d.cjs) */
    gait(F) {
      let slip = 0, travel = 0, pairs = 0, minLow = 9, maxLow = -9, air = 0, n = 0;
      const K = ['sole_heel_L', 'sole_toe_L', 'sole_heel_R', 'sole_toe_R'];
      for (let i = 1; i < F.length; i++) {
        const a = F[i - 1], c = F[i];
        n++;
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        const low = Math.min(...K.map((k) => c.s[k].h)) - c.g;
        minLow = Math.min(minLow, low); maxLow = Math.max(maxLow, low);
        if (low > 0.25) air++;
        for (const side of [[K[0], K[1]], [K[2], K[3]]]) {
          let best = null;
          for (const k of side) {
            const p0 = a.s[k], p1 = c.s[k];
            if (p0.h - a.g < 0.12 && p1.h - c.g < 0.12) { const m = Math.hypot(p1.x - p0.x, p1.y - p0.y); best = best == null ? m : Math.min(best, m); }
          }
          if (best != null) { slip += best; travel += d; pairs++; }
        }
      }
      return { n, pairs, slip: +slip.toFixed(3), travel: +travel.toFixed(2), ratio: travel > 0 ? +(slip / travel).toFixed(4) : null, minLow: +minLow.toFixed(3), maxLow: +maxLow.toFixed(3), air };
    },
    /** copy a cell of the canvas around world point (x, h, y) into a strip */
    strip(n, cw, ch) { const c = document.createElement('canvas'); c.width = cw * n; c.height = ch; return { c, n: 0, cw, ch }; },
    cell(S, x, h, y, label) {
      const cv = N.view3d.engine.renderer.domElement, sc = cv.width / cv.clientWidth;
      const pr = N.view3d.project(x, y, h);
      const g = S.c.getContext('2d');
      if (pr) g.drawImage(cv, Math.round(pr.x * sc - S.cw / 2), Math.round(pr.y * sc - S.ch / 2), S.cw, S.ch, S.n * S.cw, 0, S.cw, S.ch);
      g.strokeStyle = '#000'; g.strokeRect(S.n * S.cw + 0.5, 0.5, S.cw - 1, S.ch - 1);
      g.fillStyle = '#fff'; g.font = '11px monospace'; g.fillText(label || '', S.n * S.cw + 4, 13);
      S.n++;
    },
  };
};

/* ---------------------------------------------------------------- select + lineup + gait + states */
async function main(browser) {
  cur = 'load';
  console.log('\n== people: selection, line-up, gait, states (720x420)');
  const { context, page, errors } = await openPage(browser);
  await page.evaluate(HELPERS);
  await to3D(page, 'tps');
  const st = await waitPeople(page);
  check(st.m3d.state === 'ready' && st.ppl.ready, 'models3d + people ready (' + st.m3d.state + ', ' + st.ppl.models + ' character models: ' + st.models.join(', ') + ')');
  // the walking archetypes this page can load: in the pack (lazy ones are not fetchable from file://; PACK= packs them
  // all), not a vehicle's rider model (adult_man: no look picks it, its clips are its own)
  const ALL = await page.evaluate((ids) => ids.filter((id) => { const A = N.ASSETS3D, m = A && A.manifest[id]; return !!(m && A.glb[id]) && (m.meta || {}).role !== 'rider'; }), st.models);
  const lazyOk = await page.evaluate(async (ids) => { const t0 = performance.now(); const got = await CH.parse(ids); return { got, ms: Math.round(performance.now() - t0) }; }, ALL);
  check(lazyOk.got.length === ALL.length, 'every character model parses with its rig clip library (' + lazyOk.got.length + '/' + ALL.length + ', lazy ones in ' + lazyOk.ms + ' ms)');
  const libs = await page.evaluate((ids) => ids.map((id) => { const md = N.models3d.debug.S.models.get(id); return [id, md.lib || '-', md.clips.size]; }), ALL);
  check(libs.every((l) => l[2] >= 18), 'clips bound from the libraries: ' + libs.map((l) => l[0] + '<' + l[1] + ':' + l[2]).join(' '));

  if (want('select')) {
    cur = 'select';
    const sel = await page.evaluate(() => {
      const P = N.models3d.people, out = {};
      const pick = (look, extra) => { const e = Object.assign({ kind: 'ped', look, x: 0, y: 0 }, extra || {}); const c = P.choose(e); return c ? c.id : null; };
      // N.people kinds
      for (const k of ['man', 'woman', 'kid', 'uncle', 'aunty', 'saree', 'burqa', 'lungi', 'student']) out['kind:' + k] = pick(N.people.randomLook({ next: () => 0.3 }, k));
      out['cap:police'] = pick({ kind: 'man', shirt: '#f4f2ea', pants: '#a89060', cap: 'police' });
      out['hat:skull+beard'] = pick({ kind: 'man', shirt: '#f4f2ea', pants: '#f4f2ea', hat: 'skull', beard: '#c8642a' });
      out['old:white hair'] = pick({ kind: 'man', shirt: '#f4f2ea', pants: '#efe9dc', hair: '#e8e4dc', prop: 'stick' });
      out['youth:puff'] = pick({ kind: 'man', shirt: '#d24d57', pants: '#3a4a6a', puff: true });
      out['vendor role'] = pick({ kind: 'man', shirt: '#c86a2a', lungi: '#3a8a3a', towel: '#efe6d0' }, { role: 'vendor' });
      // the named cast
      for (const id of ['nanna', 'amma', 'ammamma', 'faramarz', 'kite_chacha', 'ticket_thatha', 'bunty', 'immu', 'pochaiah', 'chitti']) {
        const look = N.npcs && N.npcs.look ? N.npcs.look(id) : null;
        out['npc:' + id] = look ? pick(look, { kind: 'npc', npcId: id }) : '(no look)';
      }
      out.player = (P.choose(N.player) || {}).id;
      return out;
    });
    const EXP = {
      'kind:man': ['man_shirt_pants', 'student', 'old_man_dhoti', 'man_kurta_skullcap'], 'kind:woman': ['woman_salwar'], 'kind:kid': ['kid_generic'], 'kind:uncle': ['uncle_lungi_banian'],
      'kind:aunty': ['aunty_saree'], 'kind:saree': ['aunty_saree'], 'kind:burqa': ['woman_burqa'], 'kind:lungi': ['uncle_lungi_banian'], 'kind:student': ['kid_generic'],
      'cap:police': ['police_khaki'], 'hat:skull+beard': ['man_kurta_skullcap'], 'old:white hair': ['old_man_dhoti'], 'youth:puff': ['student'], 'vendor role': ['vendor'],
      'npc:nanna': ['man_shirt_pants'], 'npc:amma': ['aunty_saree'], 'npc:ammamma': ['aunty_saree'], 'npc:faramarz': ['man_shirt_pants'], 'npc:kite_chacha': ['man_kurta_skullcap'],
      'npc:ticket_thatha': ['old_man_dhoti'], 'npc:bunty': ['student'], 'npc:immu': ['kid_immu'], 'npc:pochaiah': ['police_khaki'], 'npc:chitti': ['kid_generic'], player: ['kid_chinnu'],
    };
    const bad = Object.keys(EXP).filter((k) => sel[k] !== '(no look)' && EXP[k].indexOf(sel[k]) < 0 && EXP[k].every((id) => ALL.indexOf(id) >= 0));
    check(bad.length === 0, 'looks choose their archetype (' + Object.keys(EXP).length + ' cases)', bad.map((k) => k + ' -> ' + sel[k] + ' (want ' + EXP[k].join('|') + ')').join('; '));
    const reach = new Set(Object.values(sel));
    const missing = ALL.filter((id) => !reach.has(id));
    check(missing.length === 0, 'every archetype in the pack is chosen by some look (' + Array.from(reach).filter(Boolean).join(', ') + ')', 'unreached: ' + missing.join(', '));
    // accessory slots follow the look
    const slots = await page.evaluate(() => {
      const R = N.models3d.people.debug.resolve, M = (id) => N.ASSETS3D.manifest[id], o = {};
      const hid = (id, look, ctx) => (M(id) ? R(M(id).tint, look, M(id).meta.look, ctx || { _r: 0.9 }).hidden : null);
      o.man = hid('man_shirt_pants', { kind: 'man', shirt: '#e8e0d0', pants: '#3a3a4a' });
      o.nanna = hid('man_shirt_pants', { kind: 'man', shirt: '#a9c4e0', camera: true, moustache: true });
      o.faramarz = hid('man_shirt_pants', { kind: 'man', hat: 'irani', specs: true, hair: '#e8e4dc' });
      o.ammamma = hid('aunty_saree', { kind: 'saree', hair: '#e8e4dc', specs: true, prop: 'clothbag' });
      o.girl = hid('kid_generic', { kind: 'kid', girl: true, ponytails: '#d8202a', shirt: '#e88aa8', pants: '#e88aa8' });
      o.school = hid('kid_generic', { kind: 'student', shirt: '#f2f0ea', pants: '#2a3a6a', tie: '#b22b2b', bag: '#2a5cb8' });
      o.chinnuSchool = hid('kid_chinnu', { kind: 'kid', shirt: '#f4f2ea', pants: '#24305a', tieDot: '#24305a', walkman: true });
      o.chinnuCam = hid('kid_chinnu', { kind: 'kid', camera: true, walkman: true });
      return o;
    });
    const has = (a, n) => !!a && a.indexOf(n) >= 0;
    if (slots.man) check(has(slots.man, 'camera') && has(slots.man, 'specs') && has(slots.man, 'cap_irani') && !has(slots.man, 'hair_top'), 'man: camera, specs, Irani cap hidden; hair shown (' + slots.man.join(' ') + ')');
    if (slots.nanna) check(!has(slots.nanna, 'camera') && !has(slots.nanna, 'moustache') && !has(slots.nanna, 'pens'), 'Nanna: camera on its strap, moustache, pens (' + slots.nanna.join(' ') + ')');
    if (slots.faramarz) check(!has(slots.faramarz, 'cap_irani') && !has(slots.faramarz, 'specs') && has(slots.faramarz, 'hair_top'), 'Faramarz uncle: Irani cap + specs, the quiff hidden under the cap');
    if (slots.ammamma) check(!has(slots.ammamma, 'specs') && !has(slots.ammamma, 'clothbag') && has(slots.ammamma, 'jasmine'), 'Ammamma: specs + cloth bag, no jasmine in the white bun');
    if (slots.girl) check(!has(slots.girl, 'frock') && !has(slots.girl, 'ponytails') && has(slots.girl, 'plaits') && has(slots.girl, 'hair_top') && has(slots.girl, 'tie'), 'colony girl: frock + high ponytails (' + slots.girl.join(' ') + ')');
    if (slots.school) check(!has(slots.school, 'tie') && !has(slots.school, 'school_shoes') && !has(slots.school, 'bag') && has(slots.school, 'chappal') && has(slots.school, 'frock'), 'school boy: collar, tie, shoes + socks, bag; chappals hidden');
    if (slots.chinnuSchool) check(!has(slots.chinnuSchool, 'school') && !has(slots.chinnuSchool, 'tie') && has(slots.chinnuSchool, 'camera'), "Chinnu's school uniform variant");
    if (slots.chinnuCam) check(!has(slots.chinnuCam, 'camera') && !has(slots.chinnuCam, 'walkman'), "Chinnu with Nanna's camera and the walkman");
  }

  if (want('lineup')) {
    cur = 'lineup';
    await page.evaluate(() => {
      if (N.traffic) { N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); }
      N.debug.teleport('parade_grounds'); N.debug.setTime(10, 30);
      N.view3d.settle(20000);
      document.getElementById('ui').style.display = 'none';
    });
    await frames(page, 4);
    const L = await page.evaluate(async () => {
      const p = N.player, out = [];
      p.hidden = true;
      const ids = N.models3d.people.models();
      const row = [];
      for (const id of ids) {
        const man = N.ASSETS3D.manifest[id], V = (man.meta && man.meta.variants) || {};
        const looks = Object.entries(V).slice(0, id === 'kid_chinnu' ? 3 : 2);
        if (!looks.length) looks.push(['default', man.meta.look]);
        for (const [n, look] of looks) row.push({ id, n, look });
      }
      const g = N.view3d.elevation(p), gap = 6.2;
      const x0 = p.x - (row.length - 1) * gap / 2;
      window._lineup = row.map((r, i) => { const P = CH.make(r.id, r.look, { _r: 0.8 }); P.object.position.set(x0 + i * gap, g, p.y); P.object.rotation.y = -Math.PI / 2 + 0.35; P.update(0.5, 0, 0); return P; });   // facing the camera (+z), turned a little
      for (let k = 0; k < 6; k++) { for (const P of window._lineup) P.update(0.05, 0, 0); await CH.raf(1); }
      const lows = window._lineup.map((P) => Math.max(...CH.lows(P, g).map(Math.abs)));
      return { n: row.length, names: row.map((r) => r.id + ':' + r.n), worst: Math.max(...lows), x0, g, span: (row.length - 1) * gap, y: p.y };
    });
    check(L.n >= ALL.length, 'line-up of ' + L.n + ' people (' + L.names.join(', ') + ')');
    check(L.worst < 0.12, 'standing in the line-up: every sole within 0.12 u of the ground (worst ' + L.worst.toFixed(3) + ')');
    const cam = (h, dist, fov, x) => page.evaluate((a) => N.view3dActors.debug.camera([a.x, a.g + a.h, a.y + a.dist], [a.x, a.g + a.h * 0.55, a.y], a.fov), { x: x == null ? L.x0 + L.span / 2 : x, y: L.y, g: L.g, h, dist, fov }); // (above the ground there: the terrain)
    if (SHOTS) {
      await cam(9, Math.max(60, L.span * 0.95), 50);
      await shot(page, 'characters3d_lineup_day.png');
      await page.evaluate(() => N.debug.setTime(21, 15));
      await shot(page, 'characters3d_lineup_night.png');
      await page.evaluate(() => N.debug.setTime(10, 30));
      // closer: the first and the last thirds
      await cam(8, 30, 40, L.x0 + L.span * 0.18);
      await shot(page, 'characters3d_lineup_close1.png');
      await cam(8, 30, 40, L.x0 + L.span * 0.5);
      await shot(page, 'characters3d_lineup_close2.png');
      await cam(8, 30, 40, L.x0 + L.span * 0.82);
      await shot(page, 'characters3d_lineup_close3.png');
    }
    await page.evaluate(() => { for (const P of window._lineup) CH.drop(P); window._lineup = null; N.player.hidden = false; N.view3dActors.debug.camera(null); });
  }

  if (want('gait')) {
    cur = 'gait';
    await page.evaluate(() => {
      if (N.traffic) { N.traffic.enabled = false; if (N.traffic.clear) N.traffic.clear(); }
      N.debug.teleport('parade_grounds'); N.debug.setTime(11, 0);
      N.view3d.setQuality({ adaptive: false, drawDist: 320, pixelRatio: 1 });
      N.view3d.settle(20000);
      document.getElementById('ui').style.display = 'none';
    });
    await frames(page, 4);
    // (1) the player, walking and running with the game's own controls
    for (const [name, run] of [['walk', false], ['run', true]]) {
      const g = await page.evaluate(async (run) => {
        const p = N.player;
        N.debug.teleport('parade_grounds');
        let best = 0, bestD = -1;
        for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; let d = 0; for (; d < 260; d += 4) if (!N.world.isWalkable(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d)) break; if (d > bestD) { bestD = d; best = a; } }
        N.view3d.setCamera({ yaw: best, pitch: 0.2, snap: true });
        p.facing = p.angle = best;
        N.time.scale = 0.3;
        N.input.hold('up', true); if (run) N.input.hold('run', true);
        await CH.raf(14);
        const follow = () => { const a = p.facing || 0, ge = N.view3d.elevation(p); N.view3dActors.debug.camera([p.x - Math.sin(a) * 24, ge + 6, p.y + Math.cos(a) * 24], [p.x, ge + 3.4, p.y], 34); };
        N.time.scale = 0.25;
        const S = CH.strip(8, 150, 210);
        let next = null;
        for (let i = 0; i < 400 && S.n < 8; i++) {
          follow(); await CH.raf(1);
          const P = CH.person(p); if (!P) continue;
          if (next == null) next = N.time.now;
          if (N.time.now >= next) { CH.cell(S, p.x, N.view3d.elevation(p) + 3.6, p.y, (S.n * 0.1).toFixed(1) + 's ' + P.clip); next += 0.1; }
        }
        N.view3d.setQuality({ pixelRatio: 0.3 });
        N.time.scale = 0.06;
        const F = [], clips = new Set();
        const t0 = N.time.now;
        for (let i = 0; i < 500 && N.time.now - t0 < 0.3; i++) {
          follow(); await CH.raf(1);
          const P = CH.person(p); if (!P) continue;
          F.push({ x: p.x, y: p.y, g: N.view3d.elevation(p), s: P.soles() }); clips.add(P.clip);
        }
        N.time.scale = 1;
        N.view3d.setQuality({ pixelRatio: 1 });
        N.input.hold('run', false); N.input.hold('up', false);
        N.view3dActors.debug.camera(null);
        await CH.raf(10);
        const P = CH.person(p);
        return { strip: S.n ? S.c.toDataURL('image/png') : null, cells: S.n, stats: CH.gait(F), clips: Array.from(clips), v: P ? P.v : 0 };
      }, run);
      saveData('characters3d_chinnu_' + name + '.png', g.strip);
      const s = g.stats;
      check(g.cells === 8 && g.clips.indexOf(name) >= 0, 'Chinnu ' + name + ': 8-frame strip at 0.1 s, the ' + name + ' clip plays (' + g.clips.join('/') + ', ' + g.v.toFixed(0) + ' u/s)');
      check(s.pairs >= 6 && s.ratio != null && s.ratio < 0.08, 'Chinnu ' + name + ': planted feet — sliding ' + ((s.ratio || 0) * 100).toFixed(1) + '% of ' + s.travel + ' u (' + s.pairs + ' contact pairs, ' + s.n + ' frames)', JSON.stringify(s));
      check(s.minLow > -0.15, 'Chinnu ' + name + ': soles never sink (lowest ' + s.minLow + ' u)');
      if (run) check(s.air > 0, 'Chinnu run: flight phases (' + s.air + ' airborne frames)');
      report.push('Chinnu ' + name + ' ' + g.v.toFixed(0) + ' u/s: sliding ' + ((s.ratio || 0) * 100).toFixed(2) + '%, ' + s.pairs + ' pairs, ' + s.air + '/' + s.n + ' airborne, lowest ' + s.minLow);
    }
    const idle = await page.evaluate(async () => { await CH.raf(40); const P = CH.person(); return { clip: P && P.clip, lows: P ? CH.lows(P, N.view3d.elevation(N.player)) : [] }; });
    check(/^idle/.test(idle.clip) && idle.lows.every((x) => Math.abs(x) < 0.12), 'Chinnu standing: ' + idle.clip + ' with both feet down (' + idle.lows.join(', ') + ')');
    // (2) an adult driven at walking / running / sprint speeds (phase from distance, like the runtime)
    for (const [name, v, id] of [['walk', 45, 'man_shirt_pants'], ['run', 80, 'man_shirt_pants'], ['walk', 40, 'aunty_saree'], ['walk', 45, 'kid_generic']]) {
      if (ALL.indexOf(id) < 0) continue;
      const g = await page.evaluate(async (a) => {
        const p = N.player, gnd = N.view3d.elevation(p);
        p.hidden = true;
        const P = CH.make(a.id);
        const dir = 0; let x = p.x - 40, y = p.y + 12;
        P.object.rotation.y = -dir;
        const cam = () => N.view3dActors.debug.camera([x, gnd + 6, y + 26], [x, gnd + 3.6, y], 34);
        const step = (dt) => { const d = a.v * dt; x += d; P.object.position.set(x, gnd, y); P.update(dt, d, a.v); };
        for (let i = 0; i < 20; i++) step(1 / 30);
        const S = CH.strip(8, 150, 210);
        for (let i = 0; i < 8; i++) { step(0.1); cam(); await CH.raf(2); CH.cell(S, x, gnd + 4, y, (i * 0.1).toFixed(1) + 's ' + P.clip); }
        const F = [];
        for (let i = 0; i < 160; i++) { step(1 / 240); F.push({ x, y, g: gnd, s: P.soles() }); }
        const clip = P.clip;
        CH.drop(P); p.hidden = false; N.view3dActors.debug.camera(null);
        return { strip: S.c.toDataURL('image/png'), stats: CH.gait(F), clip };
      }, { id, v, name });
      saveData('characters3d_' + id + '_' + name + '.png', g.strip);
      const s = g.stats;
      check(s.pairs >= 6 && s.ratio != null && s.ratio < 0.08 && s.minLow > -0.15, id + ' ' + name + ' at ' + v + ' u/s (' + g.clip + '): sliding ' + ((s.ratio || 0) * 100).toFixed(1) + '%, lowest sole ' + s.minLow + ' u', JSON.stringify(s));
      report.push(id + ' ' + name + ' ' + v + ' u/s: sliding ' + ((s.ratio || 0) * 100).toFixed(2) + '%, lowest ' + s.minLow + ', airborne ' + s.air + '/' + s.n);
    }
    await page.evaluate(() => { document.getElementById('ui').style.display = ''; });
  }

  if (want('states')) {
    cur = 'states';
    const S1 = await page.evaluate(async () => {
      const p = N.player, out = {};
      N.debug.teleport('parade_grounds');
      await CH.raf(20);
      p.sitting = true; p.bench = true; await CH.raf(30);
      let P = CH.person(p);
      out.sit = { clip: P && P.clip, seat: !!(P && P.seat && P.seat.visible), key: p.view3d };
      p.sitting = false; p.bench = false;
      p.clip3d = 'clap'; await CH.raf(25); P = CH.person(p); out.clap = P && P.clip;
      p.clip3d = 'kite_fly'; await CH.raf(25); P = CH.person(p); out.kite = P && P.clip;
      delete p.clip3d; await CH.raf(20); P = CH.person(p); out.back = P && P.clip;
      return out;
    });
    check(S1.sit.clip === 'sit' && S1.sit.seat, 'sitting: the sit clip on a bench drawn under him (' + JSON.stringify(S1.sit) + ')');
    check(S1.clap === 'clap' && S1.kite === 'kite_fly' && /^idle/.test(S1.back), 'scripted clips: clap (Golconda), kite_fly, then back to idle (' + [S1.clap, S1.kite, S1.back].join(' -> ') + ')');
    if (SHOTS) {
      await page.evaluate(() => { const p = N.player; p.sitting = true; p.bench = true; const ge = N.view3d.elevation(p); N.view3dActors.debug.camera([p.x + 14, ge + 6, p.y + 14], [p.x, ge + 3, p.y], 34); });
      await shot(page, 'characters3d_sit.png');
      await page.evaluate(() => { const p = N.player; p.sitting = false; p.bench = false; p.clip3d = 'kite_fly'; });
      await shot(page, 'characters3d_kite.png');
      await page.evaluate(() => { delete N.player.clip3d; N.view3dActors.debug.camera(null); });
    }
    // a person falling (comic, never hurt) and getting up; talking; the traffic constable
    const S2 = await page.evaluate(async () => {
      const ids = N.models3d.people.models(), out = {};
      const id = ids.indexOf('man_shirt_pants') >= 0 ? 'man_shirt_pants' : ids[0];
      const P = CH.make(id); const p = N.player, g = N.view3d.elevation(p);
      P.object.position.set(p.x + 10, g, p.y); P.object.rotation.y = 0;
      const run = async (n) => { for (let i = 0; i < n; i++) { P.update(1 / 30, 0, 0); await CH.raf(1); } };
      P.state('fall', 'hold', 0.08); await run(60); out.fall = P.clip; out.fallLow = Math.min(...Object.values(P.soles()).map((q) => q.h - g));
      P.state('getup', 'once', 0.12); await run(70); out.getup = P.clip; P.state(null); await run(20); out.after = P.clip;
      P.state('talk', 'loop'); await run(20); out.talk = P.clip; P.state(null); await run(12);
      out.direct = P.has('direct');
      CH.drop(P);
      return out;
    });
    check(S2.fall === 'fall' && S2.fallLow > -0.3, 'fall: held on the ground, not under it (lowest sole ' + (S2.fallLow || 0).toFixed(2) + ' u)');
    check(/^idle|getup/.test(S2.after) && S2.talk === 'talk' && S2.direct, 'getup -> ' + S2.after + ', talk, the constable clip exists (' + JSON.stringify(S2) + ')');
  }
  await checkErrors(page, errors);
  await context.close();
}

/* ---------------------------------------------------------------- the street: tps / fps, day / night, perf */
async function crowd(browser) {
  cur = 'crowd';
  console.log('\n== the street with people (720x420)');
  const { context, page, errors } = await openPage(browser);
  await page.evaluate(HELPERS);
  await to3D(page, 'tps');
  await waitPeople(page);
  const spot = await page.evaluate(async () => {
    for (const id of ['charminar_plaza', 'laad_bazaar', 'gulzar_houz', 'abids', 'koti']) if (N.places && N.places[id]) { N.debug.teleport(id); N.debug.setTime(17, 30); N.view3d.settle(30000); return id; }
    N.debug.setTime(17, 30); return 'start';
  });
  await page.waitForTimeout(12000);
  await frames(page, 30);
  const c1 = await page.evaluate(async () => {
    const st = N.models3d.people.stats();
    const near = N.entities.query(N.player.x, N.player.y, 240).filter((e) => e.kind === 'ped' || e.kind === 'npc');
    const by = {};
    for (const e of near) if (e.view3d && /^m3d:ppl:/.test(e.view3d)) by[e.view3d.slice(8)] = (by[e.view3d.slice(8)] || 0) + 1;
    return { st, near: near.length, by };
  });
  check(c1.st.routed > 0 && c1.st.persons > 0, spot + ' at 17:30: ' + c1.st.routed + ' people drawn with Blender models of ' + c1.near + ' near (' + JSON.stringify(c1.by) + ')');
  check(c1.st.routed <= N_MAX + 7, 'within the budget (options.max ' + N_MAX + ')');
  // frame time with the people models on / off
  const perf = await page.evaluate(async () => {
    const meas = async (n) => { const t0 = performance.now(); await CH.raf(n); return (performance.now() - t0) / n; };
    await CH.raf(10);
    const on = await meas(40);
    N.models3d.people.options.enabled = false; await CH.raf(20);
    const off = await meas(40);
    N.models3d.people.options.enabled = true; await CH.raf(30);
    return { on: +on.toFixed(1), off: +off.toFixed(1), routedOff: 0 };
  });
  report.push('frame time at ' + spot + ' (software GL, loaded machine): people models ' + perf.on + ' ms vs procedural only ' + perf.off + ' ms');
  check(perf.on < perf.off * 1.8 + 15, 'frame time with the Blender people ' + perf.on + ' ms vs ' + perf.off + ' ms without (software GL)');
  if (SHOTS) {
    await page.evaluate(() => N.view3d.setCamera({ pitch: 0.16, snap: true }));
    await shot(page, 'characters3d_street_tps_day.png');
    await page.evaluate(() => N.debug.setTime(21, 0));
    await page.waitForTimeout(1500);
    await shot(page, 'characters3d_street_tps_night.png');
    await page.evaluate(() => { N.debug.setTime(17, 30); N.view.set('fps'); });
    await page.waitForFunction(() => N.view.mode === 'fps', null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await shot(page, 'characters3d_street_fps.png');
    await page.evaluate(() => N.view.set('tps'));
    await page.waitForFunction(() => N.view.mode === 'tps', null, { timeout: 120000 });
  }
  // switching the models off hands everybody back to the procedural renderer
  const off = await page.evaluate(async () => {
    N.models3d.people.options.enabled = false; await CH.raf(10);
    const n = N.entities.query(N.player.x, N.player.y, 400).filter((e) => e.view3d && /^m3d:ppl:/.test(e.view3d)).length + (/^m3d:ppl:/.test(N.player.view3d || '') ? 1 : 0);
    N.models3d.people.options.enabled = true; await CH.raf(10);
    return n;
  });
  check(off === 0, 'people.options.enabled = false: everybody back on the procedural renderer (' + off + ' left)');
  await checkErrors(page, errors);
  await context.close();
}
const N_MAX = 26;

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  try {
    if (want('select') || want('lineup') || want('gait') || want('states') || want('load')) await main(browser);
    if (want('crowd')) await crowd(browser);
  } catch (e) {
    failures.push('[' + cur + '] exception: ' + (e.stack || e.message));
    console.log('  FAIL exception: ' + (e.stack || e.message));
  }
  await browser.close();
  console.log('\n== report');
  for (const r of report) console.log('  ' + r);
  if (failures.length) { console.log('\n' + failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('\nall characters3d checks passed');
})();
