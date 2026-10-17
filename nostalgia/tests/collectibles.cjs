/* NOSTALGIA — tests/collectibles.cjs  (owner: collectibles agent)
 * Headless Chromium checks for src/collectibles.js (story_bible §6, systems_design §7):
 *   data      the bible's exact counts / names / hints / 35 trivia cards, ids and aliases
 *   reach     every item (and every frame stand) is inside the map, on a walkable non-road cell, not
 *             in water / solids / respect zones, and connected to the player's spawn on the walk grid
 *             (roof items: on their roof, whose stairs are reachable; Look items: registered interacts)
 *   play      real movement pickups of each series (keyboard + steering), Look via ACTION, the roof
 *             cassette via the stairs, a ticket behind its board, frames via "Click" (+ the boat F07),
 *             "Get out to pick up" in a car, a walk-up viewpoint, time gates, developing prints
 *   rewards   series thresholds + the total-finds ladder (flags, money, items, events, home line)
 *   save      save -> reload -> continue keeps everything
 *   visual    screenshots: glints by day and by night, the frame riddle viewfinder, Journal pages, phone
 * Fails on any console error / page error / N.err. Screenshots: tests/out/collectibles/.
 *
 *   node nostalgia/tests/collectibles.cjs            ONLY=data,reach,play,rewards,save,visual
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'collectibles');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.indexOf(k) >= 0;

const failures = [];
let section = '';
const fail = (msg) => { failures.push('[' + section + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const check = (cond, msg, detail) => { if (cond) ok(msg); else fail(msg + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(browser, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 1280, height: 720 }, deviceScaleFactor: o.dpr || 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  if (!process.env.REAL_FONTS) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  if (o.clearStorage !== false) await page.addInitScript(() => { try { if (!sessionStorage.getItem('__keep')) { localStorage.clear(); sessionStorage.setItem('__keep', '1'); } } catch (e) { /* ignore */ } });
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  return { context, page, errors };
}
async function newGame(page, o) {
  await page.evaluate((o) => {
    N.debug.newGame(Object.assign({ skipIntro: true }, o || {}));
    N.debug.skipDialogue(true);
    N.debug.setTime(12, 0);
    N.debug.freezeClock(true);
    window.__ev = [];
    for (const e of ['collectible', 'collectible:threshold', 'collectible:unlock', 'collectible:reveal', 'collectible:print', 'viewpoint', 'trivia:unlock', 'collectible:homeline']) N.on(e, (d) => window.__ev.push([e, d && (d.id || d.series || d.n)]));
  }, o || {});
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  await sleep(200);
}
async function nerrs(page) { return page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0])); }

/** steer the player to (x, y) with analog input until `done()` (in-page) or the timeout */
async function walkTo(page, x, y, o) {
  o = o || {};
  return page.evaluate(async ({ x, y, o }) => {
    const p = N.player;
    const t0 = performance.now();
    while (performance.now() - t0 < (o.ms || 6000)) {
      if (o.until && new Function('return (' + o.until + ')')()) break;
      const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
      if (d < (o.r || 3)) break;
      N.input.setMove(dx / d, dy / d);
      await new Promise((r) => setTimeout(r, 40));
    }
    N.input.setMove(null);
    return { x: p.x, y: p.y };
  }, { x, y, o });
}
/** walk along a grid path (BFS over the walk grid, 4 u cells) to (x, y) with analog steering */
async function walkPath(page, x, y, o) {
  o = o || {};
  const path = await page.evaluate(({ x, y }) => {
    const W = N.world, C = N.CELL, GW = W.GW, S = N.SURF, g = W.grid;
    const walk = (o) => { const v = g[o]; return v !== S.VOID && v !== S.WATER && v !== S.ROCK && v !== S.SOLID; };
    const si = Math.floor(N.player.x / C), sj = Math.floor(N.player.y / C), ti = Math.floor(x / C), tj = Math.floor(y / C);
    const R = 90, prev = new Map(), q = [sj * GW + si];
    prev.set(q[0], -1);
    let found = false;
    for (let h = 0; h < q.length && !found; h++) {
      const o = q[h], i = o % GW, j = (o - i) / GW;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, n = nj * GW + ni;
        if (Math.abs(ni - si) > R || Math.abs(nj - sj) > R || prev.has(n) || !walk(n)) continue;
        prev.set(n, o); q.push(n);
        if (ni === ti && nj === tj) { found = true; break; }
      }
    }
    if (!found) return null;
    const out = []; let o = tj * GW + ti;
    while (o !== -1) { const i = o % GW; out.push([(i + 0.5) * C, ((o - i) / GW + 0.5) * C]); o = prev.get(o); }
    out.reverse();
    return out.filter((p, k) => k % 3 === 0 || k === out.length - 1);
  }, { x, y });
  if (!path) return walkTo(page, x, y, o);
  for (const [px, py] of path) { const r = await walkTo(page, px, py, Object.assign({}, o, { r: 2.5, ms: 1500 })); if (o.until && (await page.evaluate((u) => new Function('return (' + u + ')')(), o.until))) return r; }
  return walkTo(page, x, y, o);
}
/** hold real arrow keys towards (x, y) (keyboard input path) */
async function keysTo(page, x, y, ms) {
  const t0 = Date.now();
  let held = [];
  while (Date.now() - t0 < (ms || 5000)) {
    const s = await page.evaluate(({ x, y }) => ({ dx: x - N.player.x, dy: y - N.player.y }), { x, y });
    if (Math.hypot(s.dx, s.dy) < 3) break;
    const keys = [];
    if (Math.abs(s.dx) > 2) keys.push(s.dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(s.dy) > 2) keys.push(s.dy > 0 ? 'ArrowDown' : 'ArrowUp');
    for (const k of held) if (keys.indexOf(k) < 0) await page.keyboard.up(k);
    for (const k of keys) if (held.indexOf(k) < 0) await page.keyboard.down(k);
    held = keys;
    await sleep(60);
  }
  for (const k of held) await page.keyboard.up(k);
}
/** wait until a viewpoint pull-out / camera click has handed the controls back */
async function waitFree(page) {
  const free = () => page.waitForFunction(() => !N.player.controlsLocked && !N.render.camOverride, null, { timeout: 6000 }).catch(() => null);
  await free(); await sleep(700); await free();
}
const label = (page) => page.evaluate(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
async function itemShot(page, id, file, o) {
  o = o || {};
  const r = await page.evaluate(({ id, o }) => {
    const it = N.collectibles.get(id);
    if (o.twinkle) { const t = N.time.now; it.ph = ((3.5 - (t % 3.5)) + 0.12) % 3.5; }
    const q = N.render.proj(it.x, it.y, it.dh || 0), c = N.render.canvas.getBoundingClientRect();
    return { x: c.left + (q.x / N.render.W) * c.width, y: c.top + (q.y / N.render.H) * c.height, s: c.width / N.render.W };
  }, { id, o });
  await sleep(o.wait == null ? 60 : o.wait);
  const w = (o.w || 200), h = (o.h || 140);
  const vp = page.viewportSize();
  const clip = { x: Math.max(0, Math.min(vp.width - w, r.x - w / 2)), y: Math.max(0, Math.min(vp.height - h, r.y - h / 2)), width: w, height: h };
  await page.screenshot({ path: path.join(OUT, file), clip });
}

/* ======================================================================== data */
async function testData(browser) {
  section = 'data';
  console.log('\n== data');
  const { context, page, errors } = await openPage(browser);
  const d = await page.evaluate(() => {
    const C = N.collectibles;
    const by = (s) => C.items.filter((i) => i.series === s);
    return {
      counts: Object.fromEntries(['kites', 'golis', 'cassettes', 'tickets', 'frames'].map((s) => [s, by(s).length])),
      max: ['kites', 'golis', 'cassettes', 'tickets', 'frames'].map((s) => C.max(s)),
      total93: C.max(),
      md: C.get('G30').md,
      names: { K1: C.get('K1').name, K12: C.get('K12').name, G30: C.get('G30').name, C08: C.get('C08').name, T05: C.get('T05').name, F07: C.get('F07').name },
      hints: { K4: C.get('K4').hint, G18: C.get('G18').hint, C10: C.get('C10').hint, F23: C.get('F23').hint },
      tags: by('kites').map((k) => k.tag),
      trivia: C.trivia().filter((t) => t.core).length, triviaAll: C.trivia().length,
      triviaTexts: C.trivia().filter((t) => t.core).map((t) => t.text),
      aliases: ['K3', 'G07', 'goli_7', 'C05', 'cassette_5', 'T12', 'F09', 'frame-9', 'kite_03'].map((a) => C.norm(a)),
      spots: by('golis').map((g) => g.place),
      cassSpots: by('cassettes').map((c) => c.place),
      tickStops: by('tickets').map((t) => t.stop),
      api: ['unlockSeries', 'found', 'has', 'isFound', 'count', 'total', 'unlocked', 'nearestUnfound', 'reveal', 'viewpoint', 'triviaFor', 'unlockTrivia', 'develop', 'undeveloped', 'click', 'collectAll', 'glintPoints'].filter((k) => typeof C[k] !== 'function'),
      journalTabs: N.menus && N.menus.journalTabs ? N.menus.journalTabs().map((t) => t.id) : [],
      saveKey: !!(N.save && N.save.handlers && (N.save.handlers.collectibles || (N.save.handlers.get && N.save.handlers.get('collectibles')))),
      settingsRows: true,
    };
  });
  check(JSON.stringify(d.counts) === JSON.stringify({ kites: 12, golis: 30, cassettes: 16, tickets: 12, frames: 24 }), 'series sizes 12 / 30 / 16 / 12 / 24 frames', d.counts);
  check(JSON.stringify(d.max) === '[12,30,16,12,23]' && d.total93 === 93, 'counted totals 12+30+16+12+23 = 93', [d.max, d.total93]);
  check(d.names.K1 === 'Moon-and-star, green' && d.names.G30 === 'Raja goli (jackpot)' && d.md === '*Raja goli* (jackpot)' && d.names.C08 === 'Chandni Chhat' && d.names.F07 === 'The man in the lake.', 'bible names', d.names);
  check(d.hints.K4 === "Behind the west stand, in a floodlight's noon shadow." && /Sundays only/.test(d.hints.C10) && d.hints.F23 === 'Twin towers in Gunfoundry.', 'bible hints', d.hints);
  check(d.tags.length === 12 && d.tags[11].startsWith('Last one.'), 'kite tail tags (12)');
  check(d.trivia === 35, '35 core trivia cards (12 ticket backs + 23 prints)', d.trivia);
  check(d.triviaTexts.every((t) => t && t.length > 20), 'every trivia card has its fact text');
  check(d.aliases.join() === 'kite_3,goli_7,goli_7,cassette_5,cassette_5,ticket_12,frame_9,frame_9,kite_3', 'bible codes and aliases resolve', d.aliases);
  check(d.spots[0] === 'hide_home_colony_ground' && d.spots[29] === 'hide_saroornagar_lake', 'goli spots G01..G30');
  check(d.cassSpots[12] === 'home_terrace' && d.cassSpots[13] === 'irani_cafe_7', 'cassette spots C13 terrace / C14 Café Gulistan');
  check(d.tickStops.join() === 'bus_stop_1,bus_stop_2,bus_stop_3,bus_stop_4,bus_stop_5,bus_stop_7,bus_stop_8,bus_stop_9,bus_stop_13,bus_stop_14,bus_stop_17,bus_stop_18', 'ticket stops');
  check(!d.api.length, 'API complete', d.api);
  const tabs = ['cl_kites', 'cl_golis', 'cl_cassettes', 'cl_tickets', 'cl_album', 'cl_trivia'];
  check(tabs.every((t) => d.journalTabs.indexOf(t) >= 0), 'six Journal tabs registered', d.journalTabs);
  check(!errors.length, 'no console errors', errors);
  await context.close();
}

/* ======================================================================== reach */
async function testReach(browser) {
  section = 'reach';
  console.log('\n== reach');
  const { context, page, errors } = await openPage(browser);
  await newGame(page);
  const r = await page.evaluate(() => {
    const W = N.world, S = N.SURF, GW = W.GW, GH = W.GH, C = N.CELL;
    // flood fill the ground walk grid from the player's spawn (walkers: not VOID/WATER/ROCK/SOLID)
    const g = W.grid;
    const walk = (v) => v !== S.VOID && v !== S.WATER && v !== S.ROCK && v !== S.SOLID;
    const seen = new Uint8Array(GW * GH);
    const sx = Math.floor(N.player.x / C), sy = Math.floor(N.player.y / C);
    const q = new Int32Array(GW * GH);
    let h = 0, t = 0;
    q[t++] = sy * GW + sx; seen[sy * GW + sx] = 1;
    while (h < t) {
      const o = q[h++], i = o % GW, j = (o - i) / GW;
      if (i > 0 && !seen[o - 1] && walk(g[o - 1])) { seen[o - 1] = 1; q[t++] = o - 1; }
      if (i < GW - 1 && !seen[o + 1] && walk(g[o + 1])) { seen[o + 1] = 1; q[t++] = o + 1; }
      if (j > 0 && !seen[o - GW] && walk(g[o - GW])) { seen[o - GW] = 1; q[t++] = o - GW; }
      if (j < GH - 1 && !seen[o + GW] && walk(g[o + GW])) { seen[o + GW] = 1; q[t++] = o + GW; }
    }
    const reach = (x, y) => { const o = Math.floor(y / C) * GW + Math.floor(x / C); return !!seen[o]; };
    const nm = (s) => N.debug.surfaceName(s);
    const rows = [];
    const looks = [];
    for (const it of N.collectibles.items) {
      const row = { id: it.code, ok: it.ok, x: Math.round(it.x), y: Math.round(it.y), moved: Math.round(it.moved || 0), tech: it.tech, problems: [] };
      if (!it.ok) row.problems.push('unresolved ' + it.note);
      if (!(it.x > 0 && it.y > 0 && it.x < N.WORLD_W && it.y < N.WORLD_H)) row.problems.push('outside the map');
      const ax = it.ax, ay = it.ay;
      if (it.level) {
        const a = W.roofs.at(ax, ay);
        if (!a || !a.roof || a.roof.id !== it.level) row.problems.push('not on roof ' + it.level);
        if (!W.withRoof(() => W.isWalkable(ax, ay))) row.problems.push('roof cell not walkable');
        const rf = W.roofs.get(it.level);
        if (!rf || !rf.stairs.length || !rf.stairs.some((s) => reach(s.x, s.y))) row.problems.push('roof stairs unreachable');
        row.surf = 'ROOF';
      } else {
        const s = W.surfaceAt(ax, ay);
        row.surf = nm(s);
        if (!W.isWalkable(ax, ay)) row.problems.push('not walkable (' + nm(s) + ')');
        if (s === S.WATER) row.problems.push('in water');
        if (s === S.ROAD) row.problems.push('on the road carriageway');
        if (!reach(ax, ay)) row.problems.push('not connected to the spawn');
      }
      if (N.respect.at(ax, ay)) row.problems.push('inside respect zone ' + N.respect.at(ax, ay).id);
      if (it.series !== 'frames' && !it.level && N.respect.at(it.x, it.y)) row.problems.push('item inside a respect zone');
      if (it.pick === 'look') { const sp = N.interact.get('coll:' + it.id); if (!sp) row.problems.push('Look interact missing'); else looks.push(it.code); }
      if (it.pr && Math.hypot(it.x - ax, it.y - ay) > it.pr) row.problems.push('stand point out of pickup range');
      if (it.series === 'frames' && it.boat) {
        // the boat click: some water within its radius of the subject
        let wet = false; for (let a = 0; a < 24 && !wet; a++) { const rr = it.boat * 0.7; if (W.isWater(it.sx + Math.cos(a / 24 * 6.283) * rr, it.sy + Math.sin(a / 24 * 6.283) * rr)) wet = true; }
        if (!wet) row.problems.push('no water near the subject for the boat click');
      }
      rows.push(row);
    }
    return { rows, looks, reached: t };
  });
  const bad = r.rows.filter((x) => x.problems.length);
  check(r.rows.length === 94, 'resolved 94 positions (93 + F24)', r.rows.length);
  for (const b of bad) fail(b.id + ' at ' + b.x + ',' + b.y + ' (' + b.tech + '): ' + b.problems.join('; '));
  if (!bad.length) ok('every item / stand: in the map, walkable, off the road, dry, no respect zone, connected to the spawn (' + r.reached + ' cells reachable)');
  const moved = r.rows.filter((x) => x.moved > (x.tech === 'board' ? 30 : 24));
  check(!moved.length, 'no spot had to move more than 24 u from its authored anchor (30 u round a board end)', moved.map((m) => m.id + ':' + m.moved));
  check(r.looks.length === 10, 'ten Look interacts (9 in shops / stalls / sheds + the tank lid)', r.looks);
  const surf = {}; for (const x of r.rows) surf[x.surf] = (surf[x.surf] || 0) + 1;
  ok('surfaces: ' + JSON.stringify(surf));
  check(!errors.length && !(await nerrs(page)).length, 'no console errors', errors.concat(await nerrs(page)));
  await context.close();
}

/* ======================================================================== play */
async function testPlay(browser) {
  section = 'play';
  console.log('\n== play');
  const { context, page, errors } = await openPage(browser);
  await newGame(page);
  let s = await page.evaluate(() => ({ kites: N.collectibles.unlocked('kites'), golis: N.collectibles.unlocked('golis'), cass: N.collectibles.unlocked('cassettes'), active: N.collectibles.isActive('K1') }));
  check(!s.kites && !s.golis && s.cass && !s.active, 'new game: kites/golis locked, cassettes on with the walkman', s);
  // a locked kite is neither drawn nor collectable: walk over K1's spot
  const k1 = await page.evaluate(() => { const it = N.collectibles.get('K1'); N.debug.teleport(it.x - 24, it.y); return { x: it.x, y: it.y }; });
  await walkTo(page, k1.x, k1.y, { ms: 2000 });
  check(!(await page.evaluate(() => N.collectibles.has('K1'))), 'locked K1 not picked up');
  // the story unlocks the kites (M1 step 6): walk onto K1 with the real keyboard
  await page.evaluate(() => { N.collectibles.unlockSeries('kites'); N.debug.teleport(N.collectibles.get('K1').x - 26, N.collectibles.get('K1').y + 2); });
  await sleep(250);
  await keysTo(page, k1.x, k1.y, 5000);
  await sleep(150);
  s = await page.evaluate(() => ({ has: N.collectibles.has('K1'), toasts: N.hud.toastQueue().join(' | '), ev: window.__ev.filter((e) => e[0] === 'collectible') }));
  check(s.has && /KITE 1\/12/.test(s.toasts) && s.ev.length === 1, 'K1 picked up by walking (keyboard): "KITE 1/12" toast + event', s);
  // K10 on top of the buffalo boulder: picked from the rock's edge
  const k10 = await page.evaluate(() => { const it = N.collectibles.get('K10'); N.debug.teleport(it.ax + 22, it.ay); return { x: it.ax, y: it.ay }; });
  await walkTo(page, k10.x, k10.y, { until: "N.collectibles.has('K10')" });
  check(await page.evaluate(() => N.collectibles.has('K10')), 'K10 (on the boulder) picked from its edge');

  // golis unlock after M1: walk G01, G02, G09 (riverbed), G06 (under the banyan)
  await page.evaluate(() => N.collectibles.unlockSeries('golis'));
  for (const id of ['G01', 'G02', 'G09', 'G06']) {
    const t = await page.evaluate((id) => { const it = N.collectibles.get(id); N.debug.teleport(it.x + 20, it.y + 14); return { x: it.x, y: it.y }; }, id);
    await sleep(120);
    await walkTo(page, t.x, t.y, { until: "N.collectibles.has('" + id + "')" });
  }
  s = await page.evaluate(() => ({ n: N.collectibles.count('golis'), toasts: N.hud.toastQueue().join(' | ') }));
  check(s.n === 4, '4 golis picked up by walking (ground, lane, riverbed sand, banyan roots)', s);
  // on a cycle (bike) golis still pick up
  const g3 = await page.evaluate(() => { const it = N.collectibles.get('G03'); N.debug.teleport(it.x + 34, it.y); N.debug.enterVehicle('cycle'); return { x: it.x, y: it.y }; });
  await sleep(300);
  await walkTo(page, g3.x, g3.y, { until: "N.collectibles.has('G03')", ms: 5000 });
  check(await page.evaluate(() => N.collectibles.has('G03')), 'G03 picked up while riding a cycle');
  await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });
  // in a car: "Get out to pick up" and no pickup
  await page.evaluate(() => { const it = N.collectibles.get('G13'); N.debug.teleport(it.x + 12, it.y); N.debug.enterVehicle('ambassador'); });
  await sleep(500);
  s = await page.evaluate(() => { const it = N.collectibles.get('G13'); return { d: Math.hypot(N.player.x - it.x, N.player.y - it.y), has: N.collectibles.has('G13'), veh: !!N.player.vehicle }; });
  const lab = await label(page);
  check(s.veh && !s.has && (lab === 'Get out to pick up' || s.d > 16), 'in a car: no pickup, ACTION says "Get out to pick up"', { lab, s });
  await page.evaluate(() => { if (N.player.vehicle) N.vehicles.exit(N.player, true); });

  // cassettes: C16 by walking, C14 with ACTION "Look behind the jukebox" (shop open at noon)
  const c16 = await page.evaluate(() => { const it = N.collectibles.get('C16'); N.debug.teleport(it.x - 20, it.y); return { x: it.x, y: it.y }; });
  await walkTo(page, c16.x, c16.y, { until: "N.collectibles.has('C16')" });
  s = await page.evaluate(() => ({ has: N.collectibles.has('C16'), wk: N.walkman && N.walkman.has('cassette_16') }));
  check(s.has && s.wk, 'C16 picked up and handed to N.walkman.add', s);
  const c14 = await page.evaluate(() => { const it = N.collectibles.get('C14'); N.debug.teleport(it.x, it.y); return { x: it.x, y: it.y }; });
  await sleep(250);
  const lab14 = await label(page);
  await page.keyboard.press('KeyE');
  await sleep(200);
  check(lab14 === 'Look behind the jukebox' && (await page.evaluate(() => N.collectibles.has('C14'))), 'C14 found with ACTION "Look behind the jukebox"', lab14);
  // after it is found the shop menu is the offer again
  await sleep(150);
  const lab14b = await label(page);
  check(lab14b !== 'Look behind the jukebox', 'after the Look, the café menu is offered again', lab14b);
  await page.evaluate(() => { if (N.shops && N.shops.isOpen && N.shops.isOpen()) N.shops.close(); });
  // C13 inside the water-tank lid on the home terrace: climb the stairs with ACTION, then Look up there
  await page.evaluate(() => { const p = N.places.home_stairs; N.debug.teleport(p.x, p.y + 6); });
  await sleep(250);
  const labUp = await label(page);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => N.player.level === 'home_terrace', null, { timeout: 4000 }).catch(() => null);
  const onRoof = await page.evaluate(() => N.player.level);
  check(onRoof === 'home_terrace', 'climbed to the home terrace by the stairs (' + labUp + ')', onRoof);
  await waitFree(page); // arriving on the terrace is a viewpoint (radius 400)
  const c13 = await page.evaluate(() => { const it = N.collectibles.get('C13'); return { x: it.x, y: it.y }; });
  await walkTo(page, c13.x, c13.y, { r: 3, ms: 4000 });
  await sleep(150);
  const lab13 = await label(page);
  await page.keyboard.press('KeyE');
  await sleep(200);
  check(lab13 === 'Open the tank lid' && (await page.evaluate(() => N.collectibles.has('C13'))), 'C13 found on the roof ("Open the tank lid")', lab13);
  await waitFree(page); // arriving on the terrace is a viewpoint (radius 400)
  await page.evaluate(() => N.world.roofs.descend(N.player, { instant: true }));
  await sleep(300);

  // tickets (M5): T02 behind the Abids stop board. From the road side nothing; round the back: found
  await page.evaluate(() => N.collectibles.unlockSeries('tickets'));
  const t2 = await page.evaluate(() => {
    const it = N.collectibles.get('T02'), l = N.WORLD_DATA.landmarks.find((q) => q.id === 'bus_stop_2');
    const f = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[l.face];
    N.debug.teleport(l.x + f[0] * 14, l.y + f[1] * 14);
    return { x: it.x, y: it.y, front: { x: l.x + f[0] * 14, y: l.y + f[1] * 14 }, lx: l.x, ly: l.y, face: l.face };
  });
  await sleep(400);
  check(!(await page.evaluate(() => N.collectibles.has('T02'))), 'T02 not picked from the road side of the board');
  // walk round the end of the board to the back
  const corner = await page.evaluate((t) => { for (const dy of [-26, 26]) { const x = t.front.x, y = t.ly + dy; if (N.world.isWalkable(x, y) && N.world.isWalkable(t.x, y)) return { x, y, x2: t.x, y2: y }; } return null; }, t2);
  if (corner) { await walkTo(page, corner.x, corner.y, { ms: 3000 }); await walkTo(page, corner.x2, corner.y2, { ms: 3000 }); }
  await walkTo(page, t2.x, t2.y, { until: "N.collectibles.has('T02')", ms: 4000 });
  console.log('       (T02 walk ' + JSON.stringify(corner) + ' -> ' + JSON.stringify(await page.evaluate(() => [Math.round(N.player.x), Math.round(N.player.y)])) + ' item ' + Math.round(t2.x) + ',' + Math.round(t2.y) + ')');
  s = await page.evaluate(() => ({ has: N.collectibles.has('T02'), toasts: N.hud.toastQueue().join(' | '), card: N.collectibles.triviaUnlocked('trivia_T02'), flag: !!N.flags.ticket_2 }));
  check(s.has && s.card && s.flag && /Stage 2 unlocked for buses/.test(s.toasts), 'T02 picked behind the board: stage unlocked + trivia card', s);

  // two more tickets round their boards (T09 Charminar, T12 Khairatabad) and one more kite (K4 behind the LB west stand)
  for (const id of ['T09', 'T12', 'K4']) {
    const t = await page.evaluate((id) => {
      const it = N.collectibles.get(id);
      if (it.series !== 'tickets') { N.debug.teleport(it.x + 24, it.y + 6); return { x: it.x, y: it.y, corner: null }; }
      const l = N.WORLD_DATA.landmarks.find((q) => q.id === it.stop), f = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[l.face];
      const fx = l.x + f[0] * 16, fy = l.y + f[1] * 16; N.debug.teleport(fx, fy);
      // round the end of the board: sideways past its end, then to the back
      let corner = null;
      for (const e of [1, -1]) { const cx = fx + (f[1] !== 0 ? e * 26 : 0), cy = fy + (f[0] !== 0 ? e * 26 : 0), bx = it.x + (f[1] !== 0 ? e * 26 : 0), by = it.y + (f[0] !== 0 ? e * 26 : 0); if (N.world.isWalkable(cx, cy) && N.world.isWalkable(bx, by)) { corner = [cx, cy, bx, by]; break; } }
      return { x: it.x, y: it.y, corner };
    }, id);
    await sleep(150);
    await walkPath(page, t.x, t.y, { until: "N.collectibles.has('" + id + "')", ms: 4000 });
  }
  s = await page.evaluate(() => ({ t: N.collectibles.count('tickets'), k: N.collectibles.count('kites') }));
  check(s.t === 3 && s.k === 3, 'T09 + T12 behind their boards and K4 behind the stand, by walking', s);

  // frames: F01 with the real ACTION key, facing the market
  await page.evaluate(() => N.collectibles.unlockSeries('frames'));
  const f1 = await page.evaluate(() => { const it = N.collectibles.get('F01'); N.debug.teleport(it.x, it.y); N.player.angle = N.player.facing = Math.atan2(it.sy - it.y, it.sx - it.x) + Math.PI; return { x: it.x, y: it.y }; });
  await sleep(250);
  const labBack = await label(page);
  check(!/Click/.test(labBack || ''), 'no "Click" while facing away from the subject', labBack);
  await page.evaluate(() => { const it = N.collectibles.get('F01'); N.player.angle = N.player.facing = Math.atan2(it.sy - it.y, it.sx - it.x); });
  await sleep(200);
  const labF = await label(page);
  await page.keyboard.press('KeyE');
  await sleep(250);
  const vf = await page.evaluate(() => ({ show: document.querySelector('.cl-vf.show') !== null, txt: (document.querySelector('.cl-vf .f') || {}).textContent }));
  await page.screenshot({ path: path.join(OUT, 'frame_viewfinder.png') });
  await sleep(1000);
  s = await page.evaluate(() => ({ has: N.collectibles.has('F01'), film: N.collectibles.film(), cam: N.render.camOverride, locked: N.player.controlsLocked, vf: !!document.querySelector('.cl-vf.show') }));
  check(labF === 'Click (F01)' && vf.show && /F01/.test(vf.txt) && s.has && s.film.used === 1 && !s.cam && !s.locked && !s.vf, 'F01 clicked: viewfinder overlay, flash, film 1/24, camera + controls restored', { labF, vf, s });
  // respect: inside a temple compound there is no Click
  const resp = await page.evaluate(() => { const z = N.respect.zones.find((q) => q.id === 'birla_mandir'); return z ? { x: z.gate.x, y: z.gate.y } : null; });
  if (resp) {
    await page.evaluate((r) => { const it = N.collectibles.get('F04'); N.player.teleport(r.x, r.y - 4); N.player.angle = N.player.facing = Math.atan2(it.sy - N.player.y, it.sx - N.player.x); }, resp);
    await sleep(250);
    const inZone = await page.evaluate(() => !!N.respect.at(N.player.x, N.player.y));
    const labR = await label(page);
    check(inZone && !/Click/.test(labR || ''), 'no camera inside the Birla Mandir respect zone', { inZone, labR });
  }
  // F07 from the Lumbini jetty, facing the Buddha
  await waitFree(page); // the Birla Mandir parapet is a viewpoint too
  await page.evaluate(() => { const it = N.collectibles.get('F07'); N.debug.teleport(it.x, it.y); N.player.angle = N.player.facing = Math.atan2(it.sy - it.y, it.sx - it.x); });
  await sleep(250);
  const lab7 = await label(page);
  await page.keyboard.press('KeyE');
  await sleep(1300);
  check(lab7 === 'Click (F07)' && (await page.evaluate(() => N.collectibles.has('F07'))), 'F07 "The man in the lake" clicked from the jetty', lab7);

  // developing: two frames on the roll -> Raj Colour Lab -> ready day after tomorrow
  s = await page.evaluate(() => ({ und: N.collectibles.undeveloped(), dev: N.collectibles.develop(null, { place: 'photo_studio_1' }), pend: N.collectibles.pendingPrints().length }));
  check(s.und.length === 2 && s.dev.length === 2 && s.pend === 2, 'develop() puts the roll at the lab', s);
  await page.evaluate(() => { N.clock.day += 1; });
  await sleep(700);
  check((await page.evaluate(() => N.collectibles.prints().length)) === 0, 'not ready the next day');
  await page.evaluate(() => { N.clock.day += 1; });
  await sleep(800);
  s = await page.evaluate(() => ({ prints: N.collectibles.prints(), t1: N.collectibles.triviaUnlocked('trivia_F01'), t7: N.collectibles.triviaUnlocked('trivia_F07'), toasts: N.hud.toastQueue().join(' | ') }));
  check(s.prints.length === 2 && s.t1 && s.t7, 'prints ready day after tomorrow, with their trivia cards', s);

  // a walk-up viewpoint: Bala Hissar reveals kites/golis around Golconda (camera pulls out, then back)
  const vp = await page.evaluate(() => { const p = N.places.golconda_bala_hissar; N.debug.teleport(p.x + 40, p.y + 10); return { x: p.x, y: p.y }; });
  await sleep(200);
  await walkTo(page, vp.x, vp.y, { until: '!!N.render.camOverride', ms: 4000 });
  await sleep(300);
  s = await page.evaluate(() => ({ cam: N.render.camOverride && N.render.camOverride.zoom, locked: N.player.controlsLocked, ev: window.__ev.filter((e) => e[0] === 'viewpoint').map((e) => e[1]) }));
  await page.screenshot({ path: path.join(OUT, 'viewpoint_bala_hissar.png') });
  await sleep(3200);
  const s2 = await page.evaluate(() => ({ cam: N.render.camOverride, locked: N.player.controlsLocked, known: ['K11', 'G23', 'G24'].map((id) => N.collectibles.isKnown(id)), blips: Array.from(N.hud.blips.keys()).filter((k) => k.startsWith('coll:rv:')).length }));
  check(s.cam === 0.55 && s.locked && s.ev.indexOf('golconda_bala_hissar') >= 0 && !s2.cam && !s2.locked && s2.known.every(Boolean) && s2.blips >= 3, 'Bala Hissar viewpoint: zoom 0.55 for 3 s, then K11/G23/G24 blip on the map', { s, s2 });

  // time gates: C10 only on Sundays; K6 moves on 25 Jul (Prasads opens)
  s = await page.evaluate(() => {
    const C = N.collectibles, out = {};
    out.tue = C.isActive('C10');
    N.calendar.set(2003, 1, 19, 10, 0); // Sunday
    out.sun = C.isActive('C10');
    const k6 = C.get('K6'); out.k6a = [Math.round(k6.x), Math.round(k6.y)];
    N.calendar.set(2003, 7, 26, 10, 0);
    out.k6b = [Math.round(k6.x), Math.round(k6.y)];
    out.f9 = C.isActive('F09');
    N.calendar.set(2003, 1, 14, 12, 0);
    return out;
  });
  check(!s.tue && s.sun, 'C10 only on Sundays (Abids book market)', s);
  check(String(s.k6a) !== String(s.k6b) && s.f9, 'K6 moves to the forecourt and F09 opens once Prasads opens (25 Jul)', s);

  check(!errors.length && !(await nerrs(page)).length, 'no console errors', errors.concat(await nerrs(page)));
  await context.close();
}

/* ======================================================================== rewards */
async function testRewards(browser) {
  section = 'rewards';
  console.log('\n== rewards');
  const { context, page, errors } = await openPage(browser);
  await newGame(page);
  const r = await page.evaluate(() => {
    const C = N.collectibles, P = N.player, out = {};
    for (const s of ['kites', 'golis', 'cassettes', 'tickets', 'frames']) C.unlockSeries(s, { silent: true });
    const money0 = P.money;
    // the ladder: 5 finds -> double-gong bell
    ['G01', 'G02', 'G03', 'G04'].forEach((id) => C.found(id));
    out.at4 = !!N.flags.unlock_double_gong;
    C.found('G05');
    out.at5 = !!N.flags.unlock_double_gong && N.flags.bell_reach === 80;
    // kites: 4 -> ₹10, 8 -> charkhi
    ['K1', 'K2', 'K3', 'K4'].forEach((id) => C.found(id));
    out.kite4 = P.money - money0;
    ['K5', 'K6', 'K7', 'K8'].forEach((id) => C.found(id));
    out.charkhi = P.inventory.has('charkhi');
    out.at13 = { total: C.total(), cycle: !!N.flags.unlock_own_cycle };
    // golis 10 -> ₹10 + Marbles vs Tiger
    const m1 = P.money;
    ['G06', 'G07', 'G08', 'G09', 'G10'].forEach((id) => C.found(id));
    out.goli10 = { money: P.money - m1, tiger: !!N.flags.marbles_tiger };
    out.minigameTiger = N.minigames && N.minigames.SIDE ? true : null;
    // cassettes: 6 -> ₹10
    const m2 = P.money;
    ['C01', 'C02', 'C03', 'C04', 'C05', 'C06'].forEach((id) => C.found(id));
    out.cass6 = P.money - m2;
    // tickets: 6 -> ₹20
    const m3 = P.money;
    ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'].forEach((id) => C.found(id));
    out.tick6 = P.money - m3;
    out.at30 = { total: C.total(), dynamo: !!N.flags.unlock_dynamo, chetak: !!N.flags.unlock_chetak };
    // finds ladder 45 / 60 / 75 / 93 and series completions
    C.collectAll();
    out.end = { total: C.total(), flags: ['double_gong', 'own_cycle', 'dynamo', 'chetak', 'call_nanna', 'rx100', 'streamers', 'golden_bell', 'free_chai', 'everything'].filter((k) => !N.flags['unlock_' + k]),
      kitesAll: !!N.flags.kites_all, raja: P.inventory.has('raja_goli'), pouch: !!N.flags.marble_pouch, punch: P.inventory.has('ticket_punch'), farmaish: !!N.flags.farmaish, agent: !!N.flags.agent_promoted,
      captions: !!N.flags.album_captions, framed: !!N.flags.framed_print, titles: N.flags.titles, prints: C.prints().length, trivia: C.trivia().filter((t) => t.unlocked && t.core).length };
    out.thresholds = window.__ev.filter((e) => e[0] === 'collectible:threshold').length;
    out.vehicles = N.vehicles && N.vehicles.finds ? N.vehicles.finds() : null;
    out.homeQ = C.serialize().homeQ;
    return out;
  });
  check(!r.at4 && r.at5, 'ladder 5: double-gong bell (bell reach 80)', r);
  check(r.kite4 === 1000, 'kites 4: ₹10', r.kite4);
  check(r.charkhi, 'kites 8: charkhi in the inventory');
  check(r.at13.total === 13 && r.at13.cycle, 'ladder 12: own cycle', r.at13);
  check(r.goli10.money === 1000 && r.goli10.tiger, 'golis 10: ₹10 + Marbles vs Tiger', r.goli10);
  check(r.cass6 === 1000, 'cassettes 6: ₹10', r.cass6);
  check(r.tick6 === 2000, 'tickets 6: ₹20', r.tick6);
  check(r.at30.total === 30 && r.at30.dynamo && r.at30.chetak, 'ladder 20 + 30: dynamo, Chetak permission', r.at30);
  check(r.end.total === 93 && !r.end.flags.length, 'all 93: every ladder unlock flag', r.end);
  check(r.end.kitesAll && r.end.raja && r.end.pouch && r.end.punch && r.end.farmaish && r.end.agent && r.end.captions && r.end.framed, 'every series reward (kite train, Raja goli, pouch, punch, farmaish, promoted, captions, framed print)', r.end);
  check(Array.isArray(r.end.titles) && r.end.titles.indexOf('Goli King of Hyderabad') >= 0 && r.end.titles.indexOf('Colony Photographer') >= 0 && r.end.titles.indexOf('Hyderabad ka Khabri') >= 0, 'Journal titles', r.end.titles);
  check(r.end.prints === 23 && r.end.trivia === 35, '23 prints and 35 trivia cards', r.end);
  check(r.thresholds >= 20, "'collectible:threshold' events fired (" + r.thresholds + ')');
  check(r.vehicles === null || r.vehicles === 93, 'vehicles.js sees 93 finds', r.vehicles);
  // the family lines wait at home: walk in
  await page.evaluate(() => { N.debug.skipDialogue(false); const p = N.places.home; N.debug.teleport(p.x + 70, p.y); });
  await sleep(200);
  await walkTo(page, (await page.evaluate(() => N.places.home.x)), (await page.evaluate(() => N.places.home.y)), { until: "N.state.mode === 'dialogue'", ms: 5000 });
  await sleep(400);
  const dl = await page.evaluate(() => ({ mode: N.state.mode, text: (document.querySelector('.dlg-text, .dialogue-text, #overlay .dlg') || document.body).textContent.slice(0, 400) }));
  await page.screenshot({ path: path.join(OUT, 'ladder_home_line.png') });
  check(dl.mode === 'dialogue' && /softly|doctor|Physics|colony|booth|Helmet|prettier/.test(dl.text), 'ladder lines play at home', dl);
  await page.evaluate(() => { N.debug.skipDialogue(true); if (N.dialogue && N.dialogue.cancel) N.dialogue.cancel(); });
  check(!errors.length && !(await nerrs(page)).length, 'no console errors', errors.concat(await nerrs(page)));
  await context.close();
}

/* ======================================================================== save */
async function testSave(browser) {
  section = 'save';
  console.log('\n== save');
  const { context, page, errors } = await openPage(browser);
  await newGame(page);
  const before = await page.evaluate(() => {
    const C = N.collectibles;
    C.unlockSeries('kites'); C.unlockSeries('golis'); C.unlockSeries('frames');
    ['K1', 'K2', 'G01', 'G02', 'G03', 'G04', 'G05', 'C16', 'F01', 'F02'].forEach((id) => C.found(id));
    C.develop(['F01'], { instant: true });
    C.develop(['F02']);
    C.unlockTrivia('state_museum');
    const ok = N.save.save({ reason: 'test', force: true, toast: false });
    return { ok, total: C.total(), prints: C.prints(), pend: C.pendingPrints().map((p) => p.id), trivia: C.trivia().filter((t) => t.unlocked).map((t) => t.id).sort(), unl: ['kites', 'golis', 'tickets', 'frames'].map((s) => C.unlocked(s)), ladder: C.ladder(), flag: !!N.flags.unlock_double_gong };
  });
  check(before.ok, 'saved');
  await page.reload();
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => N.game.continueGame());
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 8000 });
  await sleep(300);
  const after = await page.evaluate(() => {
    const C = N.collectibles;
    return { total: C.total(), prints: C.prints(), pend: C.pendingPrints().map((p) => p.id), trivia: C.trivia().filter((t) => t.unlocked).map((t) => t.id).sort(), unl: ['kites', 'golis', 'tickets', 'frames'].map((s) => C.unlocked(s)), ladder: C.ladder(), flag: !!N.flags.unlock_double_gong, k1: C.has('K1'), active: C.isActive('K1'), wk: N.walkman && N.walkman.has('cassette_16') };
  });
  check(after.total === before.total && after.k1 && !after.active, 'found items survive a reload (' + after.total + ')', { before, after });
  check(JSON.stringify(after.prints) === JSON.stringify(before.prints) && JSON.stringify(after.pend) === JSON.stringify(before.pend), 'prints and the lab queue survive', after);
  check(JSON.stringify(after.trivia) === JSON.stringify(before.trivia), 'trivia cards survive', after.trivia);
  check(JSON.stringify(after.unl) === JSON.stringify(before.unl) && after.ladder === before.ladder && after.flag, 'series unlocks + ladder survive', after);
  check(after.wk, 'the walkman still has its cassette');
  // garbage in the section never throws
  const g = await page.evaluate(() => { try { N.collectibles.deserialize({ found: [['nope', 1], 'K3', null, 7], prints: ['x'], pending: [null, { id: 'F09', ready: 'a' }], unlocked: ['bogus'], vp: { a: 'b' } }); return { ok: true, total: N.collectibles.total() }; } catch (e) { return { ok: false, e: e.message }; } });
  check(g.ok && g.total === 1, 'junk save data is ignored safely', g);
  check(!errors.length && !(await nerrs(page)).length, 'no console errors', errors.concat(await nerrs(page)));
  await context.close();
}

/* ======================================================================== visual */
async function testVisual(browser) {
  section = 'visual';
  console.log('\n== visual');
  const { context, page, errors } = await openPage(browser);
  await newGame(page);
  await page.evaluate(() => { for (const s of ['kites', 'golis', 'cassettes', 'tickets', 'frames']) N.collectibles.unlockSeries(s, { silent: true }); N.render.baseZoom = 1.6; });
  for (const [id, h, tag] of [['K4', 12, 'day'], ['G11', 12, 'day'], ['C01', 12, 'day'], ['T08', 12, 'day'], ['K9', 21, 'night'], ['G16', 21, 'night'], ['K12', 21, 'night']]) {
    await page.evaluate(({ id, h }) => { N.debug.setTime(h, 0); const it = N.collectibles.get(id); N.debug.teleport(it.ax + 14, it.ay + 18); }, { id, h });
    await sleep(900);
    await itemShot(page, id, 'glint_' + tag + '_' + id + '.png', { twinkle: true, w: 260, h: 170 });
  }
  // a full frame with a kite in the sky over the stand at golden hour
  await page.evaluate(() => { N.render.baseZoom = 1; N.debug.setTime(17, 30); const it = N.collectibles.get('K2'); N.debug.teleport(it.ax + 30, it.ay + 40); });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, 'k2_hangar_golden.png') });
  // pickup + HUD counter tin
  const t = await page.evaluate(() => { N.debug.setTime(12, 0); const it = N.collectibles.get('G20'); N.debug.teleport(it.x + 18, it.y); return { x: it.x, y: it.y }; });
  await sleep(300);
  await walkTo(page, t.x, t.y, { until: "N.collectibles.has('G20')" });
  await sleep(120);
  await page.screenshot({ path: path.join(OUT, 'pickup_chip.png') });
  const chip = await page.evaluate(() => { const e = document.querySelector('.cl-chip.show'); return e ? e.textContent : null; });
  check(/GOLI\s*1\/30/.test(chip || ''), 'HUD counter tin flashes "GOLI 1/30"', chip);
  // a real click of F05 (the planetarium) for the album's photo, then journal pages
  await page.evaluate(() => { const it = N.collectibles.get('F05'); N.debug.setTime(16, 50); N.debug.teleport(it.x, it.y); N.player.angle = N.player.facing = Math.atan2(it.sy - it.y, it.sx - it.x); });
  await sleep(700);
  await page.evaluate(() => N.collectibles.click('F05'));
  await sleep(1300);
  await page.evaluate(() => {
    const C = N.collectibles;
    ['K1', 'K2', 'K3', 'G01', 'G05', 'G30', 'C01', 'C13', 'C14', 'T01', 'T09', 'F01', 'F14', 'F21'].forEach((id) => C.found(id, { silent: true }));
    C.develop(['F01', 'F05'], { instant: true }); C.develop(['F14']);
  });
  for (const tab of ['cl_kites', 'cl_golis', 'cl_cassettes', 'cl_tickets', 'cl_album', 'cl_trivia']) {
    await page.evaluate((tab) => N.menus.openJournal(tab), tab);
    await sleep(350);
    const n = await page.evaluate(() => { const p = document.querySelector('.jr-page'); return p ? p.querySelectorAll('li').length : 0; });
    check(n > 0, 'journal page ' + tab + ' renders (' + n + ' rows)');
    await page.screenshot({ path: path.join(OUT, 'journal_' + tab + '.png') });
    await page.evaluate(() => N.menus.closeJournal());
    await sleep(150);
  }
  const img = await page.evaluate(() => { N.menus.openJournal('cl_album'); const i = document.querySelectorAll('.cl-print img').length; N.menus.closeJournal(); return i; });
  check(img >= 1, "Nanna's album shows the photo you framed", img);
  check(!errors.length && !(await nerrs(page)).length, 'no console errors', errors.concat(await nerrs(page)));
  await context.close();

  // phone portrait: the viewfinder and the counter tin fit
  const P = await openPage(browser, { viewport: { width: 390, height: 844 }, dpr: 2, touch: true });
  await newGame(P.page);
  await P.page.evaluate(() => { N.collectibles.unlockSeries('frames', { silent: true }); const it = N.collectibles.get('F12'); N.debug.teleport(it.x, it.y); N.player.angle = N.player.facing = Math.atan2(it.sy - it.y, it.sx - it.x); });
  await sleep(300);
  await P.page.evaluate(() => N.collectibles.click('F12'));
  await sleep(300);
  await P.page.screenshot({ path: path.join(OUT, 'phone_viewfinder.png') });
  await sleep(1100);
  await P.page.screenshot({ path: path.join(OUT, 'phone_after_click.png') });
  const sc = await P.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, chip: !!document.querySelector('.cl-chip.show'), f12: N.collectibles.has('F12') }));
  check(sc.sw <= sc.iw && sc.chip && sc.f12, 'phone: frame clicked, counter tin shown, no page scroll', sc);
  await P.page.evaluate(() => N.menus.openJournal('cl_album'));
  await sleep(350);
  await P.page.screenshot({ path: path.join(OUT, 'phone_album.png') });
  check(!P.errors.length && !(await nerrs(P.page)).length, 'phone: no console errors', P.errors.concat(await nerrs(P.page)));
  await P.context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (want('data')) await testData(browser);
    if (want('reach')) await testReach(browser);
    if (want('play')) await testPlay(browser);
    if (want('rewards')) await testRewards(browser);
    if (want('save')) await testSave(browser);
    if (want('visual')) await testVisual(browser);
  } catch (e) {
    failures.push('[' + section + '] crashed: ' + (e.stack || e.message));
    console.log(e);
  }
  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL COLLECTIBLES CHECKS PASSED') + '\nscreenshots: ' + OUT);
  process.exit(failures.length ? 1 : 0);
})();
