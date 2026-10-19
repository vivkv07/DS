/* NOSTALGIA — tests/engine_qa.cjs
 * Adversarial engine review (Playwright, headless Chromium):
 *   contract  — every API in ARCHITECTURE.md §5-§13 exists with the documented shape/behaviour
 *   bugs      — tunnelling, stuck-in-wall, exits into water/solids/behind walls, camera jitter,
 *               input after blur/visibility, joystick release outside / multi-touch, dialogue
 *               double-advance, mission runner leaks, save/load garbage, resize, midnight, NaN
 *   perf      — fast night drive across dense districts (frame times + CDP profile top list)
 *   visual    — day / golden hour / night screenshots on desktop + phone
 *   build     — dist/nostalgia.html from file:// (boot, start, drive, zero errors)
 * Fails on any console / page / engine error.
 *
 *   node nostalgia/tests/engine_qa.cjs                 (all sections)
 *   ONLY=contract,bugs node nostalgia/tests/engine_qa.cjs
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'qa');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const DIST = 'file://' + path.join(ROOT, 'dist', 'nostalgia.html') + '#debug';
const ONLY = (process.env.ONLY || 'contract,bugs,perf,visual,build').split(',');

const failures = [];
let section = '';
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push('[' + section + '] ' + m); console.log('  FAIL ' + m); };
const check = (cond, m, extra) => (cond ? ok(m) : fail(m + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(browser, url, opts) {
  opts = opts || {};
  const context = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, opts.ctx || {}));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(url || URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  return { context, page, errors };
}
async function noErrors(page, errors, label) {
  const eng = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  // the NaN-recovery probe triggers these on purpose (and checks they are reported)
  const expected = (m) => page.__expectNanLogs && /\[N\.err\] (player|vehicle)\.nan:/.test(m);
  const all = errors.filter((m) => !expected(m)).concat(eng.map((e) => 'N.err ' + e));
  check(all.length === 0, 'no console/page/engine errors (' + label + ')', all.slice(0, 6));
}

/* ================================================================ contract */
async function contract(browser) {
  section = 'contract';
  console.log('\n== contract (ARCHITECTURE §5-§13)');
  const { context, page, errors } = await openPage(browser);
  await page.evaluate(() => N.debug.newGame({ skipIntro: true }));
  await sleep(300);
  const res = await page.evaluate(() => {
    const out = [];
    const T = (cond, what) => out.push([!!cond, what]);
    const fn = (o, names, where) => { for (const n of names.split(/\s+/).filter(Boolean)) T(o && typeof o[n] === 'function', where + '.' + n + '()'); };
    const has = (o, names, where) => { for (const n of names.split(/\s+/).filter(Boolean)) T(o && o[n] !== undefined, where + '.' + n); };
    const U = N.util;
    // §5 core
    T(typeof N.VERSION === 'string' && N.WORLD_W === 15000 && N.WORLD_H === 11250 && N.CELL === 4, 'N constants (map v2: 15000 x 11250)');
    const SURF = { VOID: 0, GROUND: 1, ROAD: 2, FOOTPATH: 3, GRASS: 4, PLAZA: 5, WATER: 6, ROCK: 7, SOLID: 8, SAND: 9, BRIDGE: 10 };
    T(Object.keys(SURF).every((k) => N.SURF[k] === SURF[k]), 'N.SURF enum');
    T(typeof N.DEBUG === 'boolean' && N.DEBUG === true, 'N.DEBUG true with #debug');
    fn(U, 'clamp lerp invLerp smooth dist dist2 angleTo angleDiff wrapAngle rand randRange randInt pick chance rng hash2 fmtMoney fmtClock strHash pointInPoly closestOnSeg hexToRgb rgbToHex shade mix', 'N.util');
    T(Math.abs(U.TAU - Math.PI * 2) < 1e-12, 'N.util.TAU');
    T(U.fmtMoney(1250) === '₹ 12.50' && U.fmtMoney(5) === '₹ 0.05' && U.fmtMoney(-250) === '-₹ 2.50', 'fmtMoney format');
    T(U.fmtClock(1062) === '17:42' && U.fmtClock(1440) === '00:00' && U.fmtClock(-1) === '23:59', 'fmtClock wraps');
    const r1 = U.rng(42), r2 = U.rng(42), r3 = U.rng('kite');
    T(r1.next() === r2.next() && typeof r3.chance === 'function' && typeof r3.int === 'function' && typeof r3.pick === 'function' && typeof r3.range === 'function', 'rng deterministic + api');
    let inRange = true; for (let i = 0; i < 200; i++) { const v = r1.int(3, 5); if (v < 3 || v > 5) inRange = false; } T(inRange, 'rng.int inclusive range');
    T(Math.abs(U.angleDiff(0.1, -0.1) + 0.2) < 1e-9 && Math.abs(U.angleDiff(3, -3) - (Math.PI * 2 - 6)) < 1e-9, 'angleDiff signed shortest');
    T(U.wrapAngle(7) <= Math.PI && U.wrapAngle(7) >= -Math.PI, 'wrapAngle range');
    T(U.hash2(3, 4) === U.hash2(3, 4) && U.hash2(3, 4) >= 0 && U.hash2(3, 4) < 1, 'hash2 deterministic 0..1');
    T(U.pointInPoly(1, 1, [[0, 0], [2, 0], [2, 2], [0, 2]]) && !U.pointInPoly(3, 1, [[0, 0], [2, 0], [2, 2], [0, 2]]), 'pointInPoly');
    const cs = U.closestOnSeg(5, 5, 0, 0, 10, 0); T(cs.x === 5 && cs.y === 0 && cs.t === 0.5 && cs.d2 === 25, 'closestOnSeg');
    T(U.shade('#808080', 0.5) === '#404040' && U.mix('#000000', '#ffffff', 0.5) === '#808080', 'shade / mix');
    fn(N, 'on off emit addSystem err loadPlaces', 'N');
    let got = 0; const h = (d) => { got += d; }; N.on('__t', h); N.emit('__t', 2); N.off('__t', h); N.emit('__t', 5); T(got === 2, 'events on/off/emit');
    fn(N.systems, 'get init update draw reset', 'N.systems'); T(Array.isArray(N.systems.list) && N.systems.started === true, 'N.systems.list/started');
    const orders = N.systems.list.map((s) => s.order); T(orders.every((o, i) => i === 0 || orders[i - 1] <= o), 'systems sorted by order');
    const ord = (id) => (N.systems.get(id) || {}).order;
    T(ord('input') === 0 && ord('clock') === 5 && ord('missions') === 10 && ord('player') === 20 && ord('entities') === 25 && ord('vehicles') === 30 && ord('camera') === 60 && ord('interact') === 58 && ord('hud') === 80, 'system order bands', { input: ord('input'), clock: ord('clock'), missions: ord('missions'), hud: ord('hud') });
    fn(N.state, 'push pop is set has', 'N.state'); T(Array.isArray(N.state.MODES) && N.state.MODES.length === 10, 'N.state.MODES');
    has(N.time, 'now dt frame scale', 'N.time');
    fn(N.clock, 'set isNight light hour label dateLabel serialize deserialize', 'N.clock'); has(N.clock, 'minutes day speed frozen', 'N.clock');
    const savedMin = N.clock.minutes, savedDay = N.clock.day;
    N.clock.day = 0; N.clock.set(12, 0); T(Math.abs(N.clock.light() - 1) < 1e-6 && !N.clock.isNight(), 'clock noon light 1');
    N.clock.set(0, 0); T(N.clock.light() === 0 && N.clock.isNight(), 'clock midnight light 0');
    N.clock.set(21, 0); T(N.clock.isNight() && N.clock.label() === '21:00', 'clock 21:00 night');
    T(N.clock.dateLabel() === 'TUE 14 JAN 2003', 'dateLabel base (the story starts Tue 14 Jan 2003, Sankranti)');
    N.clock.minutes = savedMin; N.clock.day = savedDay;
    T(N.flags && typeof N.flags === 'object', 'N.flags');
    const pk = Object.keys(N.places); const p0 = N.places[pk[0]];
    T(pk.length > 50 && p0 && ['id', 'name', 'x', 'y', 'r', 'district', 'kind'].every((k) => k in p0), 'N.places entries', pk.length);
    T(Array.isArray(N.errors), 'N.errors');
    fn(N.game, 'newGame continueGame quitToTitle pause resume snapshot', 'N.game');
    has(N.perf, 'fps frameMs updateMs drawMs', 'N.perf');
    // §6 render
    const R = N.render;
    has(R, 'canvas ctx W H scale cam PERSP lights fx sun view follow camOverride baseZoom shadowEpoch faceShade', 'N.render');
    fn(R, 'proj queue invalidateChunks setGroundPainter shake inView snapCamera k sx sy distKey screenToWorld clientToWorld rectInView warmChunks shadeNormal shaded begin flush', 'N.render');
    T(R.PERSP === 0.0032, 'PERSP 0.0032');
    T(JSON.stringify(R.LAYERS) === JSON.stringify(['ground', 'shadow', 'actors', 'structures', 'sky', 'light', 'fx']), 'layer order');
    const pr = R.proj(R.camX, R.camY, 0); T(Math.abs(pr.x - R.W / 2) < 1e-6 && Math.abs(pr.y - R.H / 2) < 1e-6 && Math.abs(pr.k - R.Z) < 1e-9, 'proj centre');
    const pr2 = R.proj(R.camX + 10, R.camY, 100); T(Math.abs(pr2.k - R.Z * (1 + 100 * R.PERSP)) < 1e-9 && Math.abs(pr2.x - (R.W / 2 + 10 * pr2.k)) < 1e-6, 'proj leans with height');
    const sw = R.screenToWorld(R.W / 2 + 20, R.H / 2); T(Math.abs(sw.x - (R.camX + 20 / R.Z)) < 1e-6, 'screenToWorld inverse');
    has(R.fx, 'vhs flash fade fadeColor grade', 'N.render.fx'); has(R.sun, 'dx dy sx sy elev strength', 'N.render.sun');
    has(R.view, 'x0 y0 x1 y1', 'N.render.view');
    T(R.inView(R.camX, R.camY, 0) && !R.inView(R.camX + 1e5, R.camY, 0), 'inView');
    fn(N.draw, 'box poly cyl dome disc flat sprite text shadow quadPath rectPath visibleWalls plane pixelText pixelTextWidth pixelTextCanvas castBox castPoly castCircle castPole', 'N.draw');
    T(N.draw.pixelTextWidth('AB') === 7, 'pixelTextWidth');
    // §7 world
    const WD = N.WORLD_DATA;
    T(WD && ['districts', 'water', 'roads', 'parks', 'rocks', 'blocks', 'buildings', 'landmarks', 'trees', 'places', 'spawns'].every((k) => k in WD), 'WORLD_DATA keys', WD && Object.keys(WD));
    const W = N.world;
    fn(W, 'surfaceAt isWalkable isDrivable isWater collide raycast districtAt nearestRoadPoint build surfaceSpeed findFree randomRoadPoint queryStructures addStructure renderMap draw', 'N.world');
    has(W, 'built buildMs data trees lamps rocks lots STYLES roads structures', 'N.world');
    const sp = WD.spawns.player;
    const c = W.collide(sp[0], sp[1], 3, 'walk'); T(['x', 'y', 'hit', 'nx', 'ny'].every((k) => k in c), 'collide shape');
    const rc = W.raycast(sp[0], sp[1], sp[0] + 50, sp[1], 'walk'); T(['hit', 'x', 'y', 't', 'surf'].every((k) => k in rc), 'raycast shape');
    const nr = W.nearestRoadPoint(sp[0], sp[1]); T(nr && ['x', 'y', 'dist', 'road', 'seg', 't', 'angle'].every((k) => k in nr), 'nearestRoadPoint shape');
    T(W.districtAt(sp[0], sp[1]) && W.districtAt(sp[0], sp[1]).id, 'districtAt returns district object');
    T(W.surfaceAt(-10, -10) === 0 && W.surfaceAt(1e6, 0) === 0 && !W.isWalkable(-5, 5), 'out of map = VOID');
    T(W.surfaceSpeed(N.SURF.SAND, 'drive') < 1 && W.surfaceSpeed(N.SURF.ROAD, 'drive') === 1, 'surfaceSpeed');
    const RD = W.roads;
    fn(RD, 'isJunction edgeBetween neighbors nearestNode randomRoute laneOffset lanePoint', 'N.world.roads');
    T(Array.isArray(RD.nodes) && Array.isArray(RD.edges) && RD.nodes.length > 50, 'road graph nodes/edges');
    const n0 = RD.nodes.find((n) => n.links && n.links.length); T(n0 && ['id', 'x', 'y', 'links', 'inc', 'deg', 'w'].every((k) => k in n0), 'node shape');
    const e0 = RD.edges[0]; T(e0 && ['id', 'a', 'b', 'road', 'kind', 'w', 'len', 'oneway', 'lanes', 'angle'].every((k) => k in e0), 'edge shape');
    // left-hand traffic: driving from a to b, lane 0 is on the LEFT of the heading
    let lhOK = 0, lhN = 0;
    for (const e of RD.edges.slice(0, 200)) {
      if (e.oneway) continue;
      const A = RD.nodes[e.a], B = RD.nodes[e.b];
      const lp = RD.lanePoint(A.id, B.id, 0.5, 0); if (!lp) continue;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, hx = B.x - A.x, hy = B.y - A.y;
      // left of heading (screen coords, +y south): cross(h, p-m) < 0
      lhN++; if (hx * (lp.y - my) - hy * (lp.x - mx) < 0) lhOK++;
    }
    T(lhN > 0 && lhOK / lhN > 0.9, 'lanePoint is on the left of the heading', { lhOK, lhN });
    const route = RD.randomRoute(n0.id, 6, { rng: U.rng(3) }); T(Array.isArray(route) && route.length >= 2, 'randomRoute');
    T(W.renderMap(0.05) && W.renderMap(0.05) === W.renderMap(0.05), 'renderMap cached');
    let qn = 0; W.queryStructures(sp[0] - 300, sp[1] - 300, sp[0] + 300, sp[1] + 300, () => { qn++; }); T(qn > 0, 'queryStructures');
    // §8 entities
    const E = N.entities;
    fn(E, 'add remove query nearest byKind clear count update draw', 'N.entities'); T(Array.isArray(E.all) && typeof N.Actor === 'function' && E.Actor === N.Actor, 'entities.all / Actor');
    const a = E.add(new N.Actor({ kind: 'prop', x: sp[0] + 500, y: sp[1], r: 3 }));
    T(E.query(sp[0] + 500, sp[1], 5).indexOf(a) >= 0 && E.nearest(sp[0] + 500, sp[1], 5) === a, 'query/nearest find a new actor');
    E.remove(a); T(E.all.indexOf(a) < 0 && a.alive === false, 'remove');
    fn(N.people, 'draw randomLook', 'N.people'); T(N.people.SCALE > 1, 'people SCALE');
    const P = N.player;
    has(P, 'name energy money mode running facing inventory controlsLocked look anim exhausted god', 'N.player');
    T(P.vehicle === null && P.inventory instanceof Set && Number.isInteger(P.money), 'player.vehicle null / inventory Set / money paise');
    fn(P, 'teleport reset serialize deserialize update draw', 'N.player');
    const V = N.vehicles;
    fn(V, 'spawn define remove enter exit exitSpot distTo nearest clearDecals', 'N.vehicles'); T(V.autoSeed === true, 'autoSeed default true');
    const types = 'cycle ladiescycle luna chetak rx100 auto ambassador maruti800 padmini bus lorry boat'.split(' ');
    T(types.every((t) => V.TYPES[t]), 'all 12 vehicle types');
    T(types.every((t) => { const y = V.TYPES[t]; return ['name', 'w', 'd', 'h', 'maxSpeed', 'accel', 'brake', 'turn', 'grip', 'seats', 'colors', 'draw', 'short', 'verb', 'cls', 'mode', 'cr', 'co'].every((k) => y[k] !== undefined) && typeof y.draw === 'function'; }), 'vehicle type fields');
    const spd = { cycle: 115, luna: 120, chetak: 150, auto: 135, ambassador: 165, rx100: 180, bus: 115, boat: 60 };
    T(Object.keys(spd).every((t) => V.TYPES[t].maxSpeed === spd[t]), 'vehicle top speeds per §4');
    const sz = { cycle: [15, 5], chetak: [17, 7], auto: [22, 13], ambassador: [30, 14], bus: [62, 18] };
    T(Object.keys(sz).every((t) => V.TYPES[t].w === sz[t][0] && V.TYPES[t].d === sz[t][1]), 'vehicle sizes per §4');
    fn(N.interact, 'add remove offer get clear', 'N.interact');
    // §9 input
    const I = N.input;
    fn(I, 'down pressed released consume press setMove setActionLabel hold clear anyPressed setLabel showTouch', 'N.input'); has(I, 'move analog device', 'N.input');
    T(JSON.stringify(I.ACTIONS) === JSON.stringify('up down left right action run horn map journal pause radio view'.split(' ')), 'input actions (+ view: the 3D view toggle)');
    const K = I.KEYMAP;
    T(K.KeyE === 'action' && K.KeyF === 'action' && K.Enter === 'action' && K.ShiftLeft === 'run' && K.Space === 'horn' && K.KeyM === 'map' && K.KeyJ === 'journal' && K.Escape === 'pause' && K.KeyP === 'pause' && K.KeyQ === 'radio' && K.KeyR === 'radio' && K.KeyW === 'up' && K.ArrowLeft === 'left', 'key map per §9');
    // §10 HUD / dialogue / menus
    const H = N.hud;
    fn(H, 'objective toast banner blip unblip districtBanner timer show hide ask closeAsk blipPos route mapImage timerValue', 'N.hud'); T(H.blips instanceof Map, 'hud.blips Map');
    H.objective('QA objective'); T(H.objectiveText === 'QA objective' && N.debug.state().objective === 'QA objective', 'objectiveText -> debug.state'); H.objective(null);
    const DL = N.dialogue;
    fn(DL, 'say choice play define paintPortrait cancel advance isOpen speaker', 'N.dialogue'); has(DL, 'speakers glossary textSpeed skip', 'N.dialogue');
    T(DL.speakers.narrator && DL.speakers.you, 'built-in speakers');
    // §10 allows plain assignment: N.dialogue.speakers[id] = {name, color, portrait(ctx, w, h)}
    let painted = 0;
    DL.speakers.__qa_plain = { name: 'Plain', color: '#2a8c82', portrait: (g, w, h) => { painted++; g.fillStyle = '#f00'; g.fillRect(0, 0, w, h); } };
    DL.glossary['qaword'] = 'a test word';
    let pc = null; try { pc = DL.portraitCanvas(DL.speaker('__qa_plain'), 'happy'); } catch (e) { pc = 'threw ' + e.message; }
    T(pc && pc.width === 48 && painted === 1, 'speakers[id] = {...} (plain assignment) works', String(pc));
    fn(N.menus, 'title pause resume hideAll isOpen', 'N.menus');
    // §11 missions
    const M = N.missions;
    fn(M, 'register start available isDone giverPos posOf complete fail abort retry markers', 'N.missions');
    T(M.done instanceof Set && typeof M.defs === 'object' && 'active' in M && 'lastFailed' in M && typeof M.MissionAbort === 'function', 'missions props');
    // §12 save
    const S = N.save;
    fn(S, 'register save load has clear info', 'N.save'); T(S.KEY === 'nostalgia.save.v1' && typeof S.available === 'boolean', 'save key/available');
    // §13 debug
    const DB = N.debug;
    fn(DB, 'newGame teleport give heal setTime setWanted spawnVehicle enterVehicle startMission completeMission skipDialogue collectAll god fps state perf freezeClock', 'N.debug');
    T(DB.errors === N.errors, 'debug.errors is N.errors');
    T(DB.teleport('no_such_place_xyz') === null && DB.teleport(NaN, 5) === null && DB.teleport('charminar') !== null, 'teleport null/landmark');
    const st = DB.state();
    T(['mode', 'mission', 'objective', 'player', 'errors', 'clock', 'day', 'district', 'surface', 'wanted'].every((k) => k in st) && ['x', 'y', 'mode', 'energy', 'money', 'vehicle'].every((k) => k in st.player), 'debug.state() shape');
    const pf = DB.perf(); T(['fps', 'frameMs', 'updateMs', 'drawMs', 'chunks', 'entities', 'queued', 'chunkBuilds', 'buildMs'].every((k) => k in pf), 'debug.perf() shape');
    T(DB.setTime(23, 15) === '23:15', 'setTime returns label');
    return out;
  });
  for (const [c, what] of res) if (!c) fail(what);
  ok(res.filter((r) => r[0]).length + '/' + res.length + ' contract checks passed');
  // m.* API surface + N.game.pause/resume from a real mission run
  const mres = await page.evaluate(async () => {
    const out = {};
    N.missions.register({ id: '__qa_api', title: 'QA', script: async (m) => {
      out.keys = 'objective blip unblip goto wait until say talk choice cutscene minigame spawn timer give money flag fail checkpoint toast marker unmarker vehicle'.split(' ').filter((k) => typeof m[k] !== 'function');
      out.props = ['data', 'attempt', 'retrying'].filter((k) => !(k in m));
      await m.wait(0.05);
    } });
    N.missions.start('__qa_api');
    for (let i = 0; i < 10; i++) { N.time.now += 1 / 60; N.systems.update(1 / 60); await new Promise((r) => setTimeout(r, 0)); }
    out.done = N.missions.isDone('__qa_api');
    out.pause = N.game.pause(); out.mode1 = N.state.mode; out.resume = N.game.resume(); out.mode2 = N.state.mode;
    return out;
  });
  check(mres.keys && mres.keys.length === 0 && mres.props.length === 0, 'm.* API complete', mres);
  check(mres.done, 'tiny mission runs to completion');
  check(mres.pause && mres.mode1 === 'paused' && mres.resume && mres.mode2 === 'play', 'game.pause/resume');
  await noErrors(page, errors, 'contract');
  await context.close();
}

/* ==================================================================== bugs */
// deterministic stepping inside the page
const STEP_FN = `window.__step = (n, h) => { h = h || 1/60; for (let i = 0; i < n; i++) { N.time.dt = h; N.time.frame++; if ({play:1,dialogue:1,cutscene:1,minigame:1}[N.state.mode]) N.time.now += h; N.systems.update(h); } };`;

async function bugs(browser) {
  section = 'bugs';
  console.log('\n== correctness probes');
  const { context, page, errors } = await openPage(browser);
  await page.evaluate(STEP_FN);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.setTime(12, 0); });
  await sleep(300);

  // ---- 1. tunnelling through thin walls at high speed (incl. impulse-boosted speeds)
  const tun = await page.evaluate(() => {
    const W = N.world, S = N.SURF, CELL = N.CELL, GW = W.GW, GH = W.GH, g = W.grid;
    const drv = (s) => s === S.ROAD || s === S.GROUND || s === S.FOOTPATH || s === S.PLAZA || s === S.GRASS || s === S.SAND || s === S.BRIDGE;
    // thin walls: 1-3 solid cells thick, solid across 3 rows/columns, a clear run-up on both
    // sides; crossed west->east, east->west (vertical walls) and north->south, south->north
    const at = (i, j) => g[j * GW + i];
    const walls = [];
    for (const axis of ['x', 'y']) {
      const A = axis === 'x' ? GW : GH, B = axis === 'x' ? GH : GW;
      const cell = (u, w) => (axis === 'x' ? at(u, w) : at(w, u)); // u = along the crossing, w = across
      let count = 0;
      for (let w = 20; w < B - 20 && count < 25; w += 2) {
        for (let u = 20; u < A - 20 && count < 25; u++) {
          if (cell(u, w) !== S.SOLID || cell(u - 1, w) === S.SOLID) continue;
          let t = 1; while (t < 4 && cell(u + t, w) === S.SOLID) t++;
          if (t > 3) { u += t; continue; }
          let ok = true;
          for (let dw = -1; dw <= 1 && ok; dw++) {
            for (let k = 0; k < t; k++) if (cell(u + k, w + dw) !== S.SOLID) ok = false;
            for (let k = 1; k <= 12 && ok; k++) if (!drv(cell(u - k, w + dw)) || !drv(cell(u + t - 1 + k, w + dw))) ok = false;
          }
          if (ok) { walls.push({ axis, u0: u * CELL, u1: (u + t) * CELL, w: (w + 0.5) * CELL, t }); count++; }
          u += t + 12;
        }
      }
    }
    const res = [];
    const types = ['rx100', 'cycle', 'chetak'];
    for (const wl of walls) {
      for (const dir of [1, -1]) {
        for (const type of types) {
          for (const speed of [180, 520, 900]) {
            const T = N.vehicles.TYPES[type];
            // start just short of the wall face, heading at it
            const u = dir > 0 ? wl.u0 - T.w / 2 - 2 : wl.u1 + T.w / 2 + 2;
            const ang = wl.axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
            const x = wl.axis === 'x' ? u : wl.w, y = wl.axis === 'x' ? wl.w : u;
            const v = N.vehicles.spawn(type, x, y, ang, {});
            v.vx = Math.cos(ang) * speed; v.vy = Math.sin(ang) * speed; v.speed = speed;
            v.controller = (vv) => { vv.ctl.throttle = 1; vv.ctl.steer = 0; };
            for (let i = 0; i < 40; i++) window.__step(1);
            const pos = wl.axis === 'x' ? v.x : v.y;
            const crossed = !isFinite(pos) || (dir > 0 ? pos - T.w / 2 > wl.u1 - 0.5 : pos + T.w / 2 < wl.u0 + 0.5);
            res.push({ type, speed, dir, axis: wl.axis, t: wl.t, crossed, pos: +pos.toFixed(1), wall: [wl.u0, wl.u1] });
            N.vehicles.remove(v);
          }
        }
      }
    }
    return { walls: walls.length, thin: walls.filter((w) => w.t <= 2).length, n: res.length, crossed: res.filter((r) => r.crossed).slice(0, 8), nCrossed: res.filter((r) => r.crossed).length };
  });
  check(tun.walls > 0, 'found thin walls to crash into (' + tun.walls + ', ' + tun.thin + ' of them 1-2 cells)');
  check(tun.nCrossed === 0, 'no vehicle tunnels through a thin wall (' + tun.n + ' runs up to 900 u/s)', tun.crossed);

  // ---- 2. a heavy vehicle shoving a bike into a wall: bike never ends inside / behind solids
  const shove = await page.evaluate(() => {
    const W = N.world, S = N.SURF;
    const sp = N.WORLD_DATA.spawns.player;
    // find a wall face: walk east from spawn until a solid cell
    const out = [];
    for (let trial = 0; trial < 30; trial++) {
      const rp = W.randomRoadPoint(N.util.rng(trial + 11), ['street', 'arterial']);
      if (!rp) continue;
      const r = W.raycast(rp.x, rp.y, rp.x + 300, rp.y, 'drive');
      if (!r.hit) continue;
      const wx = r.x;
      // the bus (62 x 18) must fit on the run-up, or the test is meaningless
      let fits = true;
      for (let k = -2; k <= 2 && fits; k++) if (W.collide(wx - 50 + k * 11, rp.y, 9.5, 'drive').hit) fits = false;
      if (!fits) continue;
      const bike = N.vehicles.spawn('cycle', wx - 6, rp.y, Math.PI / 2, {});
      const bus = N.vehicles.spawn('bus', wx - 50, rp.y, 0, {});
      bus.vx = 260; bus.speed = 260; bus.controller = (v) => { v.ctl.throttle = 1; };
      for (let i = 0; i < 60; i++) window.__step(1);
      const blocked = (x, y) => !W.isDrivable(x, y);
      out.push({ inside: blocked(bike.x, bike.y), behind: bike.x > wx + 4 && W.raycast(wx - 8, rp.y, bike.x, bike.y, 'drive').hit, busInside: blocked(bus.x, bus.y), nan: !isFinite(bike.x + bike.y + bus.x + bus.y) });
      N.vehicles.remove(bike); N.vehicles.remove(bus);
      if (out.length >= 12) break;
    }
    return { n: out.length, bad: out.filter((o) => o.inside || o.behind || o.busInside || o.nan) };
  });
  check(shove.n > 0 && shove.bad.length === 0, 'bus shoving a cycle into a wall: nothing ends in/behind a solid (' + shove.n + ' runs)', shove.bad.slice(0, 4));

  // ---- 3. player pushed into a wall by a vehicle stays walkable
  const pushed = await page.evaluate(() => {
    const W = N.world, P = N.player, out = [];
    for (let trial = 0; trial < 20 && out.length < 10; trial++) {
      const rp = W.randomRoadPoint(N.util.rng(trial + 101), ['street']);
      if (!rp) continue;
      const r = W.raycast(rp.x, rp.y, rp.x, rp.y + 300, 'walk');
      if (!r.hit) continue;
      P.teleport(r.x, r.y - 5);
      const car = N.vehicles.spawn('ambassador', P.x, P.y - 40, Math.PI / 2, {});
      car.vy = 200; car.speed = 200; car.controller = (v) => { v.ctl.throttle = 1; };
      for (let i = 0; i < 50; i++) window.__step(1);
      out.push({ ok: W.isWalkable(P.x, P.y) && isFinite(P.x), x: P.x, y: P.y });
      N.vehicles.remove(car);
    }
    return { n: out.length, bad: out.filter((o) => !o.ok) };
  });
  check(pushed.n > 0 && pushed.bad.length === 0, 'player rammed against a wall stays on walkable ground (' + pushed.n + ' runs)', pushed.bad);

  // ---- 4. exits: never into water / solids / behind walls; boat removal never strands the player
  const exits = await page.evaluate(() => {
    const W = N.world, S = N.SURF, P = N.player, V = N.vehicles, CELL = N.CELL, g = W.grid, GW = W.GW;
    const res = { wall: [], bridge: [], boat: null, removeBoat: null };
    // a car parked tight against a thin (1-2 cell) east-west wall, left door facing it
    let found = 0;
    for (let j = 30; j < W.GH - 30 && found < 10; j += 3) {
      for (let i = 30; i < GW - 30 && found < 10; i += 1) {
        if (g[j * GW + i] !== S.SOLID || g[(j - 1) * GW + i] === S.SOLID) continue;
        const t = g[(j + 1) * GW + i] === S.SOLID ? 2 : 1;
        if (t === 2 && g[(j + 2) * GW + i] === S.SOLID) continue;
        let run = 0;
        while (run < 12 && g[j * GW + i + run] === S.SOLID && g[(j + t - 1) * GW + i + run] === S.SOLID && g[(j - 1) * GW + i + run] !== S.SOLID && g[(j + t) * GW + i + run] !== S.SOLID) run++;
        if (run < 10) continue;
        let clear = true;
        for (let dj = 1; dj <= 6 && clear; dj++) for (let k = 0; k < run; k++) if (!W.isDrivable((i + k + 0.5) * CELL, (j + t - 1 + dj + 0.5) * CELL) || !W.isWalkable((i + k + 0.5) * CELL, (j - dj + 0.5) * CELL)) { clear = false; break; }
        if (!clear) { i += run; continue; }
        // car south of the wall heading west => its left side faces north (the wall)
        const wallS = (j + t) * CELL;
        const cx = (i + run / 2) * CELL, cy = wallS + 7.4;
        const car = V.spawn('ambassador', cx, cy, Math.PI, {});
        P.teleport(cx, cy + 20); V.enter(P, car);
        V.exit(P, false);
        const sameSide = P.y > wallS - 0.01;
        res.wall.push({ sameSide, walk: W.isWalkable(P.x, P.y), x: P.x, y: P.y, wallS, t });
        if (P.vehicle) V.exit(P, true);
        V.remove(car);
        found++; i += run + 40;
      }
    }
    // bridges: exit onto the bridge deck, never into the water below
    let br = 0;
    for (let j = 10; j < W.GH - 10 && br < 6; j += 11) for (let i = 10; i < GW - 10 && br < 6; i += 3) {
      if (g[j * GW + i] !== S.BRIDGE) continue;
      const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
      const rp = W.nearestRoadPoint(x, y);
      const car = V.spawn('maruti800', x, y, rp ? rp.angle : 0, {});
      P.teleport(x, y); V.enter(P, car);
      const okExit = V.exit(P, false);
      res.bridge.push({ okExit, walk: W.isWalkable(P.x, P.y), surf: W.surfaceAt(P.x, P.y) });
      if (P.vehicle) V.exit(P, true);
      V.remove(car); br++; i += 200;
    }
    // a boat in the middle of the lake: exit refused; removing the boat puts the player on land
    // map v2: the boats sail on Hussain Sagar (Lumbini jetty); the water body with the most polygon points is now
    // the Musi, whose centroid is not water
    const jt = N.places.lumbini_jetty || Object.values(N.places).find((p) => p.kind === 'jetty');
    const lake = N.WORLD_DATA.water.find((w) => w.id === 'hussain_sagar') || N.WORLD_DATA.water.slice().sort((a, b) => b.poly.length - a.poly.length)[0];
    let mx = 0, my = 0; for (const q of lake.poly) { mx += q[0]; my += q[1]; } mx /= lake.poly.length; my /= lake.poly.length;
    let spot = null;
    for (let r = 0; r < 600 && !spot; r += 10) for (let a = 0; a < 6.28 && !spot; a += 0.3) { const x = mx + Math.cos(a) * r, y = my + Math.sin(a) * r; if (W.isWater(x, y) && !W.collide(x, y, 60, 'boat').hit) spot = { x, y }; }
    if (spot) {
      const boat = V.spawn('boat', spot.x, spot.y, 0, {});
      P.teleport(jt ? jt.x : spot.x, jt ? jt.y : spot.y); V.enter(P, boat);
      const ex = V.exit(P, false);
      res.boat = { refused: !ex && P.vehicle === boat };
      V.remove(boat);
      res.removeBoat = { walk: W.isWalkable(P.x, P.y), vehicle: !!P.vehicle, x: P.x, y: P.y };
      window.__step(5);
      res.removeBoat.walkAfter = W.isWalkable(P.x, P.y);
    }
    return res;
  });
  check(exits.wall.length > 0 && exits.wall.every((w) => w.sameSide && w.walk), 'exiting next to a thin wall never puts you behind it (' + exits.wall.length + ' cases)', exits.wall.filter((w) => !w.sameSide || !w.walk).slice(0, 3));
  check(exits.bridge.length === 0 || exits.bridge.every((b) => b.walk), 'exiting on a bridge lands on walkable ground (' + exits.bridge.length + ' bridges)', exits.bridge);
  check(exits.boat && exits.boat.refused, 'cannot jump out of a boat mid-lake', exits.boat);
  check(exits.removeBoat && exits.removeBoat.walk && exits.removeBoat.walkAfter && !exits.removeBoat.vehicle, 'despawning the boat under the player puts them on land', exits.removeBoat);

  // ---- 5. camera smoothness while driving (screen position of the car frame to frame)
  await page.evaluate(() => {
    const rp = N.world.randomRoadPoint(N.util.rng(5), ['arterial']);
    N.player.teleport(rp.x, rp.y);
    const v = N.debug.enterVehicle('ambassador');
    v.angle = rp.angle; v.x = rp.x; v.y = rp.y;
    window.__cam = [];
    const fl = N.render.flush;
    N.render.__origFlush = fl;
    N.render.flush = function (dt) {
      const pv = N.player.vehicle || N.player;
      const r = fl.call(this, dt);
      // on-screen position in DEVICE pixels: internal position x scale + the CSS sub-pixel shift
      const R = N.render, sc = R.scale;
      window.__cam.push({ sx: R.sx(pv.x, R.k(0)) * sc + R.subpx.x, sy: R.sy(pv.y, R.k(0)) * sc + R.subpx.y, gx: R.sx(pv.x, R.k(0)) * sc, gy: R.sy(pv.y, R.k(0)) * sc, z: R.Z, dt, sc });
      return r;
    };
  });
  await page.keyboard.down('KeyW');
  { const t0 = await page.evaluate(() => N.time.now); await page.waitForFunction((a) => N.time.now > a + 2.5, t0, { timeout: 30000 }); }
  await page.keyboard.up('KeyW');
  const cam = await page.evaluate(() => { N.render.flush = N.render.__origFlush; return window.__cam.slice(30); });
  // jitter = frame-to-frame change of the car's on-screen velocity (second difference), in
  // device pixels. Rounding to whole device pixels alone gives ~0.7; the old camera (snapped to
  // the internal pixel grid, no sub-pixel shift) gives ~0.8 x scale (gx/gy = without the shift).
  // The loop is variable-step (the world advances by each frame's real dt), so under CPU load an uneven frame
  // moves the car further on screen for a reason that is not the camera. Compare per-frame screen velocities
  // normalised to a 60 fps frame: (d_i / dt_i - d_(i-1) / dt_(i-1)) / 60, which equals the plain second
  // difference when every frame is 1/60 s.
  const jitter = (kx, ky) => {
    let sum = 0, mx = 0, n = 0;
    for (let i = 2; i < cam.length; i++) {
      const a = cam[i], b = cam[i - 1], c = cam[i - 2];
      if (!(a.dt > 0) || !(b.dt > 0)) continue;
      const vx = (a[kx] - b[kx]) / a.dt - (b[kx] - c[kx]) / b.dt, vy = (a[ky] - b[ky]) / a.dt - (b[ky] - c[ky]) / b.dt;
      const j = Math.hypot(vx, vy) / 60;
      sum += j; mx = Math.max(mx, j); n++;
    }
    return [sum / Math.max(1, n), mx];
  };
  const [jit, maxJ] = jitter('sx', 'sy'), [jitGrid] = jitter('gx', 'gy');
  const sc = cam.length ? cam[0].sc : 1;
  check(jit < 1.05 && maxJ < 2.6, 'camera: car glides on screen (mean 2nd diff ' + jit.toFixed(2) + ' device px, max ' + maxJ.toFixed(2) + '; grid-snapped only: ' + jitGrid.toFixed(2) + ', scale ' + sc + ')');
  await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });

  // ---- 6. input after blur / visibility change
  await page.keyboard.down('KeyD');
  await sleep(100);
  const held = await page.evaluate(() => N.input.down('right'));
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.__step(2); });
  const afterBlur = await page.evaluate(() => ({ right: N.input.down('right'), mx: N.input.move.x }));
  await page.keyboard.up('KeyD');
  check(held && !afterBlur.right && afterBlur.mx === 0, 'held key released on window blur', { held, afterBlur });
  await page.keyboard.down('ShiftLeft'); // held when the tab hides (keyup never arrives)
  await sleep(60);
  const vis = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    const paused = N.state.mode === 'paused';
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    window.__step(2);
    const run = N.input.down('run');
    N.game.resume(); N.menus.resume && N.menus.hideAll();
    return { paused, run };
  });
  await page.keyboard.up('ShiftLeft');
  check(vis.paused && !vis.run, 'tab hidden: game pauses and held inputs are dropped', vis);
  await page.evaluate(() => { if (N.state.mode !== 'play') N.game.resume(); });

  // ---- 7. pause while a dialogue is open (tab hidden mid-conversation)
  const dpause = await page.evaluate(() => {
    N.dialogue.say('saleem', 'A long line so that the typewriter is still going when the tab hides, bhai.');
    window.__step(3);
    const m0 = N.state.mode;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const m1 = N.state.mode;
    const shown0 = N.dialogue.current && N.dialogue.current.typing;
    const hidden = getComputedStyle(document.getElementById('dialogue')).display === 'none';
    N.input.press('action'); window.__step(3);
    const stillTyping = N.dialogue.current && N.dialogue.current.typing;
    N.game.resume(); if (N.menus.hideAll) N.menus.hideAll();
    const m2 = N.state.mode;
    N.dialogue.cancel(); window.__step(2);
    const m3 = N.state.mode;
    // the conversation is cancelled while paused (e.g. a load from the pause menu): resuming
    // must land in play, not in a dialogue mode with no dialogue (frozen controls)
    N.dialogue.say('saleem', 'Second conversation.'); window.__step(2);
    N.game.pause();
    N.dialogue.cancel(); window.__step(1);
    N.game.resume(); if (N.menus.hideAll) N.menus.hideAll(); window.__step(2);
    return { m0, m1, m2, shown0, stillTyping, hidden, m3, m4: N.state.mode, stack: N.state.stack.join('>') };
  });
  check(dpause.m0 === 'dialogue' && dpause.m1 === 'paused' && dpause.stillTyping && dpause.m2 === 'dialogue' && dpause.m3 === 'play', 'dialogue can be paused (tab hidden) and ACTION in the pause menu does not advance it', dpause);
  check(dpause.hidden, 'the dialogue box hides under the pause screen');
  check(dpause.m4 === 'play' && dpause.stack === 'play', 'a dialogue cancelled while paused resumes into play', dpause);

  // ---- 8. touch joystick: release outside, lost capture, multi-touch
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const tp = await tctx.newPage();
  const terrs = [];
  tp.on('console', (m) => { if (m.type() === 'error') terrs.push(m.text()); });
  tp.on('pageerror', (e) => terrs.push(e.message));
  await tp.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await tp.goto(URL);
  await tp.waitForFunction(() => window.N && N.state.mode === 'title', null, { timeout: 30000 });
  await tp.evaluate(() => N.debug.newGame({ skipIntro: true }));
  await sleep(300);
  const cdp = await tctx.newCDPSession(tp);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x: 80, y: 600, id: 1 }]);
  await touch('touchMove', [{ x: 140, y: 600, id: 1 }]);
  await sleep(120);
  const mv1 = await tp.evaluate(() => N.input.move.x);
  // second finger lands on the joystick zone too, then the FIRST finger lifts far outside the zone
  await touch('touchStart', [{ x: 140, y: 600, id: 1 }, { x: 60, y: 700, id: 2 }]);
  await touch('touchMove', [{ x: 380, y: 100, id: 1 }, { x: 60, y: 700, id: 2 }]);
  await touch('touchEnd', [{ x: 60, y: 700, id: 2 }]);
  await sleep(120);
  const mv2 = await tp.evaluate(() => ({ x: N.input.move.x, y: N.input.move.y }));
  await touch('touchEnd', []);
  await sleep(120);
  const mv3 = await tp.evaluate(() => ({ x: N.input.move.x, y: N.input.move.y, active: document.querySelector('.t-stick').classList.contains('on') }));
  check(mv1 > 0.5, 'joystick drag right moves right (' + mv1.toFixed(2) + ')');
  check(mv3.x === 0 && mv3.y === 0 && !mv3.active, 'joystick resets after fingers lift (released outside the zone)', { mv2, mv3 });
  // lost pointer capture (e.g. an OS gesture steals the touch) must reset the stick too
  const lost = await tp.evaluate(() => {
    const zone = document.querySelector('.t-zone');
    const mk = (type, x, y) => new PointerEvent(type, { pointerId: 77, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true });
    zone.dispatchEvent(mk('pointerdown', 80, 600));
    zone.dispatchEvent(mk('pointermove', 150, 600));
    window.__step && window.__step(1);
    const a = N.input.move.x;
    zone.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 77, pointerType: 'touch', bubbles: true }));
    return { a };
  });
  await sleep(80);
  const lost2 = await tp.evaluate(() => N.input.move.x);
  check(lost2 === 0, 'joystick resets on lostpointercapture', { before: lost.a, after: lost2 });
  // blur while touch buttons are held
  const btn = await tp.evaluate(() => { const r = document.querySelector('.t-run').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, mode: N.state.mode }; });
  await touch('touchStart', [{ x: btn.x, y: btn.y, id: 6 }]);
  await sleep(80);
  const runDown = await tp.evaluate(() => N.input.down('run'));
  await tp.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(80);
  const runAfter = await tp.evaluate(() => N.input.down('run'));
  await touch('touchEnd', []);
  check(runDown && !runAfter, 'held touch button released on blur', { runDown, runAfter });
  check(terrs.length === 0, 'touch page: no errors', terrs.slice(0, 3));
  await tctx.close();

  // ---- 9. dialogue double-advance (keyboard + programmatic, back-to-back lines)
  const dd = await page.evaluate(async () => {
    const tick = (n) => window.__step(n || 1);
    const res = {};
    const p1 = N.dialogue.say('saleem', 'First line, typed out slowly so we can test.');
    let r2 = false; const p2 = p1.then(() => N.dialogue.say('cafe', 'Second line here.')).then(() => { r2 = true; });
    await Promise.resolve(); tick(2);
    N.input.press('action'); tick(1);           // completes typing of line 1
    res.typing1 = N.dialogue.current && N.dialogue.current.typing;
    res.line1 = N.dialogue.current && N.dialogue.current.speaker;
    N.input.press('action'); tick(1);           // within 120 ms: swallowed (double tap)
    res.stillLine1 = N.dialogue.current && N.dialogue.current.speaker;
    await new Promise((r) => setTimeout(r, 160));
    N.input.press('action'); tick(1);           // advance -> line 2 appears
    await new Promise((r) => setTimeout(r, 0)); tick(1);
    res.line2 = N.dialogue.current && N.dialogue.current.speaker;
    res.line2typing = N.dialogue.current && N.dialogue.current.typing;
    // a single press must not both close line 1 and skip line 2's typing
    N.dialogue.cancel(); await p2; tick(2);
    res.r2 = r2; res.mode = N.state.mode;
    return res;
  });
  check(dd.typing1 === false && dd.line1 === 'saleem' && dd.stillLine1 === 'saleem' && dd.line2 === 'cafe' && dd.line2typing === true && dd.mode === 'play', 'dialogue: one press = one step; double taps swallowed', dd);

  // ---- 10. mission runner leaks on fail / abort / quit / load
  const leak = await page.evaluate(async () => {
    const tick = async (n) => { for (let i = 0; i < (n || 1); i++) { window.__step(1); await new Promise((r) => setTimeout(r, 0)); } };
    const out = {};
    let after = 0;
    N.missions.register({ id: '__qa_leak', title: 'Leak test', script: async (m) => {
      const sp = N.WORLD_DATA.spawns.player;
      const qc = m.vehicle('cycle', sp[0] + 30, sp[1], 0, {}); if (qc) qc.__qaLeak = true;
      m.blip({ x: sp[0] + 400, y: sp[1] }, {});
      m.marker({ x: sp[0] + 500, y: sp[1] });
      m.timer(100, 'QA');
      m.until(() => false); // background watcher, never true
      m.wait(1000);
      m.say('saleem', 'This line is open when the mission fails.');
      await m.goto({ x: sp[0] + 3000, y: sp[1] }, { label: 'Go far away' });
      after++;
    } });
    const snapshot = () => ({
      active: !!N.missions.active,
      blips: Array.from(N.hud.blips.keys()).filter((k) => k.startsWith('__qa_leak')).length,
      markers: N.missions.markers().filter((m) => m.kind === 'goal').length,
      // only the mission's own cycle (traffic now rides plain 'cycle's too)
      ents: N.entities.all.filter((e) => e.kind === 'vehicle' && e.__qaLeak && e.alive !== false).length,
      timer: N.hud.timerValue ? N.hud.timerValue() : null,
      objective: N.hud.objectiveText, dialogue: N.dialogue.isOpen(), mode: N.state.mode,
    });
    for (const how of ['fail', 'abort', 'quit', 'load', 'newGame']) {
      N.missions.start('__qa_leak');
      await tick(3);
      const before = snapshot();
      const run = N.missions.active;
      if (how === 'fail') N.missions.fail('QA fail');
      if (how === 'abort') N.missions.abort();
      if (how === 'quit') N.game.quitToTitle();
      if (how === 'load') { N.save.save({ toast: false }); N.save.load(); }
      if (how === 'newGame') N.debug.newGame({ skipIntro: true });
      await tick(3);
      if (how === 'quit') { N.debug.newGame({ skipIntro: true }); await tick(2); }
      const s = snapshot();
      s.pending = run && run.pending ? run.pending.size : -1;
      s.before = before;
      out[how] = s;
      if (N.missions.lastFailed) { N.missions.retry && null; }
      N.hud.closeAsk && N.hud.closeAsk();
    }
    out.after = after;
    return out;
  });
  for (const how of ['fail', 'abort', 'quit', 'load', 'newGame']) {
    const s = leak[how];
    const clean = s && !s.active && s.blips === 0 && s.markers === 0 && s.ents === 0 && s.pending === 0 && !s.dialogue && s.mode === 'play' && (s.timer == null || s.timer === 0) && !s.objective;
    check(clean && s.before.active && s.before.blips >= 2 && s.before.dialogue, 'mission ' + how + ': no pending promises, blips, markers, spawns, timer, objective or dialogue left', s);
  }
  check(leak.after === 0, 'script code after an aborted await never runs');

  // ---- 11. minigame open when the mission fails is closed too
  const mg = await page.evaluate(async () => {
    const tick = async (n) => { for (let i = 0; i < (n || 1); i++) { window.__step(1); await new Promise((r) => setTimeout(r, 0)); } };
    let aborted = null, resolveGame = null;
    const realMG = N.minigames;
    N.minigames = { has: () => true, defs: { qa: {} }, start: () => new Promise((r) => { resolveGame = r; }), abort: (why) => { aborted = why || true; if (resolveGame) resolveGame({ win: false, aborted: true }); return true; }, isOpen: () => !!resolveGame };
    N.missions.register({ id: '__qa_mg', title: 'MG', script: async (m) => { await m.minigame('qa', {}); } });
    N.missions.start('__qa_mg');
    await tick(3);
    N.missions.fail('boom');
    await tick(3);
    N.minigames = realMG;
    N.hud.closeAsk();
    return { aborted };
  });
  check(mg.aborted, 'a minigame opened by a failing mission is aborted', mg);

  // ---- 12. save/load with missing / corrupt data
  const sv = await page.evaluate(() => {
    const out = {};
    const K = N.save.KEY;
    const put = (o) => { try { localStorage.setItem(K, typeof o === 'string' ? o : JSON.stringify(o)); localStorage.removeItem(K + '.bak'); } catch (e) { /* ignore */ } };
    const tryLoad = (o) => { put(o); let r; try { r = N.save.load(); } catch (e) { return 'threw ' + e.message; } return { r, x: N.player.x, y: N.player.y, money: N.player.money, ok: isFinite(N.player.x) && isFinite(N.player.y) && N.world.isWalkable(N.player.x, N.player.y) && Number.isFinite(N.player.money) && Number.isFinite(N.clock.minutes) && N.player.inventory instanceof Set }; };
    out.empty = tryLoad({ game: 'nostalgia', v: 1, data: {} });
    out.nulls = tryLoad({ game: 'nostalgia', v: 1, data: { player: null, clock: null, flags: null, missions: null } });
    out.garbage = tryLoad({ game: 'nostalgia', v: 1, data: { player: { x: 'abc', y: {}, money: 'lots', energy: -5, inventory: 'x', vehicle: { type: 'ufo' } }, clock: { minutes: 'NaN', day: -3 }, flags: [1, 2], missions: { done: 'nope' } } });
    out.inSolid = tryLoad({ game: 'nostalgia', v: 1, data: { player: { x: -500, y: 99999, money: 100 } } });
    out.hugeMoney = tryLoad({ game: 'nostalgia', v: 1, data: { player: { x: 4000, y: 3000, money: 1e308 * 10 } } });
    out.boatOnLand = tryLoad({ game: 'nostalgia', v: 1, data: { player: { x: N.WORLD_DATA.spawns.player[0], y: N.WORLD_DATA.spawns.player[1], vehicle: { type: 'boat', angle: 'x' } } } });
    out.boatOnLandVeh = N.player.vehicle ? N.player.vehicle.type : null;
    out.proto = tryLoad('{"game":"nostalgia","v":1,"data":{"flags":{"__proto__":{"polluted":1}}}}');
    out.polluted = ({}).polluted === 1;
    out.mode = N.state.mode;
    N.save.clear();
    // hot-reload restore with junk
    try { N.player.deserialize({ x: undefined, y: 'q', money: null }); out.hot = { x: N.player.x, ok: isFinite(N.player.x) && isFinite(N.player.y) && Number.isFinite(N.player.money) }; } catch (e) { out.hot = 'threw'; }
    return out;
  });
  for (const k of ['empty', 'nulls', 'garbage', 'inSolid', 'hugeMoney', 'boatOnLand', 'proto']) check(sv[k] && sv[k].ok, 'load ' + k + ' save: no throw, sane player/clock', sv[k]);
  check(!sv.boatOnLandVeh || sv.boatOnLandVeh !== 'boat', 'a saved boat is not spawned on dry land', sv.boatOnLandVeh);
  check(!sv.polluted, 'flags section cannot pollute Object.prototype');
  check(sv.hot && sv.hot.ok, 'player.deserialize with junk keeps a finite position', sv.hot);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); });

  // ---- 13. clock wrap at midnight
  const ck = await page.evaluate(() => {
    const out = {};
    let days = 0; const h = () => days++; N.on('clock:day', h);
    N.clock.frozen = false; N.clock.day = 0; N.clock.set(23, 59);
    N.clock.update(2.5);
    out.a = { m: N.clock.minutes, day: N.clock.day, label: N.clock.label(), date: N.clock.dateLabel(), days };
    N.clock.set(24, 30); out.b = N.clock.label();
    N.clock.set(-1, 0); out.c = N.clock.label();
    N.clock.minutes = 1439.99; out.d = N.clock.label();
    N.clock.update(1440 * 3 + 1); out.e = { day: N.clock.day, m: N.clock.minutes };
    N.clock.minutes = -30; out.f = { light: N.clock.light(), label: N.clock.label() };
    N.off('clock:day', h);
    N.clock.minutes = 720; N.clock.frozen = true;
    return out;
  });
  check(ck.a.label === '00:01' && ck.a.day === 1 && ck.a.date === 'WED 15 JAN 2003' && ck.a.days === 1, 'clock wraps at midnight to the next day', ck.a);
  check(ck.b === '00:30' && ck.c === '23:00' && ck.d === '23:59' && ck.e.day === 5, 'clock set/label wrap', ck);
  check(isFinite(ck.f.light) && ck.f.label === '23:30', 'negative minutes still sane', ck.f);

  // ---- 14. NaN propagation: a NaN velocity must not poison the camera/world forever
  const nan = await page.evaluate(() => {
    const out = {};
    const P = N.player;
    P.teleport(N.WORLD_DATA.spawns.player[0], N.WORLD_DATA.spawns.player[1]);
    P.vx = NaN; window.__step(2);
    P.x = NaN; window.__step(3);
    out.player = { x: P.x, y: P.y, ok: isFinite(P.x) && isFinite(P.y) };
    const v = N.debug.enterVehicle('chetak');
    v.vx = NaN; v.av = NaN; window.__step(5);
    out.vehicle = { ok: isFinite(v.x) && isFinite(v.y) && isFinite(v.angle) };
    N.vehicles.exit(P, true);
    N.render.cam.x = NaN; window.__step(3);
    out.cam = { ok: isFinite(N.render.cam.x) && isFinite(N.render.cam.zoom) };
    N.render.cam.zoom = 0; window.__step(1); out.zoom = N.render.cam.zoom;
    out.reported = N.errors.filter((e) => /\.nan$/.test(e.where)).length;
    for (let i = N.errors.length - 1; i >= 0; i--) if (/\.nan$/.test(N.errors[i].where)) N.errors.splice(i, 1);
    return out;
  });
  page.__expectNanLogs = true;
  check(nan.player.ok, 'player recovers from a NaN velocity', nan.player);
  check(nan.vehicle.ok, 'vehicle recovers from NaN state', nan.vehicle);
  check(nan.cam.ok, 'camera recovers from NaN', nan.cam);
  check(nan.reported >= 2, 'NaN recoveries are reported through N.err (' + nan.reported + ')');

  // ---- 15. resize / orientation churn
  for (const [w, h] of [[200, 120], [1920, 1080], [390, 844], [844, 390], [1280, 720]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(120);
  }
  const rz = await page.evaluate(() => { const r = N.render.canvas.getBoundingClientRect(); return { W: N.render.W, H: N.render.H, l: r.left, t: r.top, r: r.right, b: r.bottom, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, pad: N.render.PAD * N.render.scale / devicePixelRatio }; });
  check(rz.l <= 0 && rz.t <= 0 && rz.r >= rz.iw && rz.b >= rz.ih && rz.l >= -rz.pad * 2 - 1 && rz.r - rz.iw <= rz.pad * 4 + 2 && rz.sw <= rz.iw && rz.sh <= rz.ih, 'resize churn: canvas covers the viewport (sub-pixel pad only), no page scroll', rz);

  // ---- 16. entering a vehicle that a mission removes / vehicle dies under the player
  const dead = await page.evaluate(() => {
    const v = N.debug.enterVehicle('auto');
    v.alive = false; window.__step(3);
    return { vehicle: N.player.vehicle, mode: N.player.mode, walk: N.world.isWalkable(N.player.x, N.player.y) };
  });
  check(dead.vehicle === null && dead.mode === 'foot' && dead.walk, 'a vehicle that dies under the player drops them on foot', dead);

  // ---- 17. ACTION fires once per press even with several sub-steps per frame (high refresh)
  const once = await page.evaluate(() => {
    let n = 0;
    N.interact.add('__qa_once', { x: N.player.x, y: N.player.y, r: 50, label: 'QA', priority: 9, use: () => { n++; } });
    N.input.press('action');
    window.__step(3, 1 / 180);
    N.interact.remove('__qa_once');
    return n;
  });
  check(once === 1, 'one ACTION press = one use() across sub-steps', once);

  await noErrors(page, errors, 'bugs');
  await context.close();
}

/* ==================================================================== perf */
async function perfRun(browser, label, vp) {
  const { context, page, errors } = await openPage(browser, URL, { ctx: vp });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.setTime(21, 30); N.debug.freezeClock(true); });
  await sleep(400);
  // a camera dolly at RX100 speed through the densest districts (Old City, Abids, Koti, Secunderabad)
  const stats = await page.evaluate(async () => {
    const L = (id) => { const p = N.places[id] || (N.WORLD_DATA.landmarks || []).find((l) => l.id === id); return p ? [p.x, p.y] : null; };
    let pts = ['charminar', 'mecca_masjid', 'laad_bazaar', 'chowmahalla', 'afzal_gunj', 'koti', 'abids', 'nampally', 'secunderabad', 'paradise'].map(L).filter(Boolean);
    if (pts.length < 3) pts = N.WORLD_DATA.landmarks.slice(0, 8).map((l) => [l.x, l.y]);
    const dolly = { x: pts[0][0], y: pts[0][1], vx: 0, vy: 0, r: 4 };
    N.player.teleport(pts[0][0], pts[0][1]);
    N.render.follow = dolly;
    // load: 40 moving vehicles with lights around the route
    const vs = [];
    for (let i = 0; i < 40; i++) {
      const q = pts[i % pts.length];
      const f = N.world.findFree(q[0] + (i * 37) % 200 - 100, q[1] + (i * 53) % 200 - 100, 'drive', 30);
      if (!f) continue;
      const v = N.vehicles.spawn(['auto', 'ambassador', 'bus', 'chetak', 'rx100', 'lorry'][i % 6], f.x, f.y, i, { driver: true });
      v.controller = (vv) => { vv.ctl.throttle = 0.5; vv.ctl.steer = Math.sin(N.time.now + i) * 0.5; };
      vs.push(v);
    }
    const SPEED = 180;
    let seg = 0;
    const frames = [];
    // let the one-off teleport warm-up (synchronous chunk builds) settle before measuring
    await new Promise((r) => setTimeout(r, 1500));
    const hist0 = N.perf.hist.length;
    let last = performance.now();
    const t0 = performance.now();
    const chunk0 = N.render.stats.chunkBuilds;
    await new Promise((resolve) => {
      function f() {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        const a = pts[seg], b = pts[(seg + 1) % pts.length];
        const dx = b[0] - dolly.x, dy = b[1] - dolly.y, d = Math.hypot(dx, dy);
        if (d < 20) seg = (seg + 1) % pts.length;
        else { dolly.vx = (dx / d) * SPEED; dolly.vy = (dy / d) * SPEED; dolly.x += dolly.vx * dt; dolly.y += dolly.vy * dt; }
        void a;
        frames.push({ dt: dt * 1000, frameMs: N.perf.frameMs, js: N.perf._lastWork });
        if (now - t0 > 9000) resolve(); else requestAnimationFrame(f);
      }
      requestAnimationFrame(f);
    });
    N.render.follow = null;
    for (const v of vs) N.vehicles.remove(v);
    const dts = frames.slice(20).map((f) => f.dt).sort((p, q) => p - q);
    const p = (q) => dts[Math.min(dts.length - 1, Math.floor(dts.length * q))];
    return { frames: dts.length, avgDt: +(dts.reduce((s, v) => s + v, 0) / dts.length).toFixed(2), p95: +p(0.95).toFixed(1), p99: +p(0.99).toFixed(1), max: +dts[dts.length - 1].toFixed(1), long: dts.filter((v) => v > 34).length, hist: N.perf.hist.slice(hist0 + 1), chunkBuilds: N.render.stats.chunkBuilds - chunk0, night: N.render.night };
  });
  const jsAvg = stats.hist.length ? +(stats.hist.reduce((s, v) => s + v, 0) / stats.hist.length).toFixed(2) : null;
  const jsMax = stats.hist.length ? Math.max(...stats.hist) : null;
  console.log('  perf ' + label + ' ' + JSON.stringify({ jsAvg, jsMax, avgDt: stats.avgDt, p95: stats.p95, p99: stats.p99, maxDt: stats.max, longFrames: stats.long, frames: stats.frames, chunkBuilds: stats.chunkBuilds, night: stats.night }));
  await page.screenshot({ path: path.join(OUT, 'perf_' + label + '.png') });
  await noErrors(page, errors, 'perf ' + label);
  await context.close();
  return { jsAvg, jsMax, stats };
}

async function profile(browser) {
  const { context, page } = await openPage(browser);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.setTime(21, 30); N.debug.freezeClock(true); N.debug.teleport('charminar'); });
  await sleep(600);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.evaluate(async () => {
    const pts = [[N.player.x, N.player.y]];
    const dolly = { x: pts[0][0], y: pts[0][1], vx: 180, vy: -40, r: 4 };
    N.render.follow = dolly;
    const t0 = performance.now(); let last = t0;
    await new Promise((res) => { (function f() { const now = performance.now(); const dt = (now - last) / 1000; last = now; dolly.x += dolly.vx * dt; dolly.y += dolly.vy * dt; if (((now - t0) / 1500 | 0) % 2) dolly.vx = -180; else dolly.vx = 180; if (now - t0 > 6000) res(); else requestAnimationFrame(f); })(); });
    N.render.follow = null;
  });
  const { profile: prof } = await cdp.send('Profiler.stop');
  const self = new Map();
  const total = prof.samples.length;
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const counts = new Map();
  for (const s of prof.samples) counts.set(s, (counts.get(s) || 0) + 1);
  for (const [id, c] of counts) {
    const n = byId.get(id); const cf = n.callFrame;
    const key = (cf.functionName || '(anon)') + ' ' + path.basename(cf.url || '') + ':' + (cf.lineNumber + 1);
    self.set(key, (self.get(key) || 0) + c);
  }
  const top = Array.from(self.entries()).sort((a, b) => b[1] - a[1]).slice(0, 18);
  console.log('  CPU profile (self time, % of samples):');
  for (const [k, c] of top) console.log('    ' + (100 * c / total).toFixed(1).padStart(5) + '%  ' + k);
  await context.close();
}

async function perf(browser) {
  section = 'perf';
  console.log('\n== perf: fast night drive across dense districts with 40 lit vehicles');
  const d = await perfRun(browser, 'desktop', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const p = await perfRun(browser, 'portrait', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  // regression guards for this stress case (40 lit vehicles add ~2 ms on top of the §16 budget)
  check(d.jsAvg != null && d.jsAvg < 8.5, 'desktop night drive JS per frame < 8.5 ms (' + d.jsAvg + ', max 1 s avg ' + d.jsMax + ')');
  check(p.jsAvg != null && p.jsAvg < 12.5, 'portrait night drive JS per frame < 12.5 ms (' + p.jsAvg + ', max 1 s avg ' + p.jsMax + ')');
  if (process.env.PROFILE !== '0') await profile(browser);
}

/* ================================================================== visual */
async function visual(browser) {
  section = 'visual';
  console.log('\n== visual: day / golden hour / night, desktop + phone');
  const sizes = [
    ['desktop', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }],
    ['portrait', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
  ];
  for (const [name, ctx] of sizes) {
    const { context, page, errors } = await openPage(browser, URL, { ctx });
    await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); });
    for (const [tag, h, m, where] of [['day', 11, 0, 'charminar'], ['golden', 17, 30, 'tank_bund'], ['night', 21, 15, null], ['night_old', 22, 0, 'charminar']]) {
      await page.evaluate(([h, m, where]) => { N.debug.setTime(h, m); if (where) N.debug.teleport(where); else N.player.teleport(N.WORLD_DATA.spawns.player[0], N.WORLD_DATA.spawns.player[1]); }, [h, m, where]);
      await sleep(700);
      await page.screenshot({ path: path.join(OUT, 'vis_' + name + '_' + tag + '.png') });
    }
    // in a car at speed (zoomed out) at golden hour
    await page.evaluate(() => { N.debug.setTime(17, 45); N.debug.teleport('tank_bund'); const v = N.debug.enterVehicle('ambassador'); const rp = N.world.nearestRoadPoint(v.x, v.y); if (rp) { v.x = rp.x; v.y = rp.y; v.angle = rp.angle; } });
    if (name === 'desktop') { await page.keyboard.down('KeyW'); await sleep(1600); await page.screenshot({ path: path.join(OUT, 'vis_' + name + '_driving.png') }); await page.keyboard.up('KeyW'); }
    else { await page.evaluate(() => N.input.setMove(1, 0)); await sleep(1600); await page.screenshot({ path: path.join(OUT, 'vis_' + name + '_driving.png') }); await page.evaluate(() => N.input.setMove(null)); }
    // dialogue + objective + toast + banner together on top of the HUD
    await page.evaluate(() => { N.vehicles.exit(N.player, true); N.hud.objective('Find the kite seller near Gulzar Houz before sunset.'); N.hud.toast('Got: Manja (glass thread)', 5000); N.hud.timer('KITE RUN', 42); N.dialogue.say('saleem', 'Arre *pilla*, the *patang* market closes at six. *Jaldi* chalo!'); });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'vis_' + name + '_ui.png') });
    await page.evaluate(() => { N.dialogue.cancel(); N.hud.timer(null); });
    await noErrors(page, errors, 'visual ' + name);
    await context.close();
  }
  ok('screenshots in ' + OUT);
}

/* =================================================================== build */
async function build(browser) {
  section = 'build';
  console.log('\n== build: dist/nostalgia.html from file://');
  const { execFileSync } = require('child_process');
  const outp = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs')], { encoding: 'utf8' });
  console.log('  ' + outp.trim().split('\n').slice(-2).join('\n  '));
  const { context, page, errors } = await openPage(browser, DIST);
  const info = await page.evaluate(() => ({ scripts: document.querySelectorAll('script[src]').length, links: Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => l.href) }));
  check(info.scripts === 0 && info.links.every((h) => /fonts\.googleapis/.test(h)), 'dist page has no external scripts / stylesheets except Google Fonts', info);
  // PLAY opens the story's prologue (menus.quickStart skips the name card under automation): SKIP it
  await page.click('#title-start');
  await page.waitForFunction(() => N.state.mode === 'play' || N.state.mode === 'cutscene', null, { timeout: 15000 });
  if (await page.evaluate(() => N.state.mode === 'cutscene')) await page.click('.cs-skip');
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 15000 });
  await page.evaluate(() => N.debug.enterVehicle('auto'));
  await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
  const s = await page.evaluate(() => N.debug.state());
  check(s.mode === 'play' && s.player.vehicle === 'auto', 'dist: start + drive an auto', s.player);
  await page.screenshot({ path: path.join(OUT, 'dist.png') });
  await noErrors(page, errors, 'dist');
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    if (ONLY.includes('contract')) await contract(browser);
    if (ONLY.includes('bugs')) await bugs(browser);
    if (ONLY.includes('perf')) await perf(browser);
    if (ONLY.includes('visual')) await visual(browser);
    if (ONLY.includes('build')) await build(browser);
  } catch (e) {
    failures.push('harness: ' + (e.stack || e.message));
    console.log('  FAIL harness: ' + (e.stack || e.message));
  } finally {
    await browser.close();
  }
  console.log(failures.length ? '\nENGINE QA FAILED (' + failures.length + ')\n  ' + failures.join('\n  ') : '\nENGINE QA PASSED');
  process.exit(failures.length ? 1 : 0);
})();
