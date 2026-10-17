/* NOSTALGIA — tests/traffic.cjs  (city life + the Chappal Meter)
 * Headless Chromium (Playwright). Boots the game, then:
 *   districts  traffic, pedestrians and animals in several districts and times (screenshots, district looks)
 *   lanes      moving traffic keeps to the LEFT of the road centre line
 *   perf       frame time at full density at night (desktop), plus the module's own update cost
 *   meter      drive an Ambassador into pedestrians: they are knocked down, get up, the meter rises
 *   pursuers   the cast per level 1..5 (uncle/Chitti, spotters + uncles, Pochaiah, Luna + havaldar +
 *              roadblock, Mummy in Yadagiri's auto; Mummy pillion on Nanna's Chetak at night)
 *   busted     stand still at level 3 until Pochaiah catches you: PAKDA GAYA!, fine, respawn at home
 *   chappal    level 5: Mummy throws the homing chappal
 *   barber     a haircut clears the meter (shops.js row if present, else wanted.js's fallback)
 *   wasted     tummy 0: THAK GAYA!, wake at an Irani cafe (or home at night with Horlicks)
 *   misc       hide behind the rice sacks, respect-zone freeze, horn scatters pigeons, cows block traffic
 *   rules      home before the street lights, curfew floors, save/load, mission policies, Chitti, claimAuto, bus stops
 *   mobile     phone portrait: caps and frame time
 * Fails on any console error / page error / N.err.
 *   node nostalgia/tests/traffic.cjs                (index.html)
 *   LAB=1 node nostalgia/tests/traffic.cjs          (staging/traffic.js + staging/wanted.js over the real engine)
 *   ONLY=districts,perf node nostalgia/tests/traffic.cjs
 * Screenshots: tests/out/traffic/*.png
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'traffic');
fs.mkdirSync(OUT, { recursive: true });
const LAB = !!process.env.LAB;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (s) => !ONLY || ONLY.has(s);

function labPage() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/href="style.css"/, 'href="../style.css"').replace(/src="src\/([a-z0-9_]+)\.js"/g, (m, f) => {
    if ((f === 'traffic' || f === 'wanted') && fs.existsSync(path.join(ROOT, 'staging', f + '.js'))) return 'src="' + f + '.js"';
    return 'src="../src/' + f + '.js"';
  });
  const p = path.join(ROOT, 'staging', 'traffic_lab.html');
  fs.writeFileSync(p, html);
  return p;
}
const URL = 'file://' + (LAB ? labPage() : path.join(ROOT, 'index.html')) + '#debug';

const failures = [];
const notes = [];
const fail = (sec, msg) => { failures.push('[' + sec + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const note = (msg) => { notes.push(msg); console.log('  ..   ' + msg); };
// Game-clock waits (robust on a loaded machine, where a wall-clock sleep sees fewer game frames):
// window.__gw(secs) resolves after `secs` of GAME time (N.time.now); while the game clock is stopped
// (title, pause menu) it counts frame time (N.time.real) instead. Both advance only as frames run, so a
// slow machine just takes longer. The wall-clock cap (8x + 5 s) only stops a hung page from hanging the suite.
const GW = () => {
  window.__gw = (secs) => new Promise((res) => {
    let acc = 0, n0 = N.time.now, r0 = N.time.real;
    const t0 = performance.now(), cap = secs * 8000 + 5000;
    (function chk() {
      const dn = N.time.now - n0, dr = N.time.real - r0; n0 = N.time.now; r0 = N.time.real;
      acc += dn > 0 ? dn : dr;
      if (acc >= secs || performance.now() - t0 > cap) res(acc); else requestAnimationFrame(chk);
    })();
  });
};
const gwait = (pg, secs) => pg.evaluate((s) => window.__gw(s), secs);

async function boot(browser, vp) {
  const context = await browser.newContext(vp || { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript(GW);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 30000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 10000 });
  // a quiet harness: keep story missions / dialogue from popping up mid-test
  await page.evaluate(() => {
    window.__ev = [];
    for (const n of ['busted', 'wasted', 'wanted:change', 'wanted:seen', 'wanted:report', 'wanted:tattle', 'chappal:throw', 'chappal:hit', 'chappal:dodge', 'ped:knocked', 'ped:dodge', 'traffic:honk', 'pigeons:scatter', 'cow:bump', 'wanted:pursuer'])
      N.on(n, (d) => { window.__ev.push({ n, t: N.time.real, d: d && typeof d === 'object' ? { level: d.level, prev: d.prev, by: d.by, role: d.role, reason: d.reason } : d }); });
    if (N.dialogue) N.dialogue.skip = true;
  });
  return { context, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function go(page, place, h, m, extra) {
  return page.evaluate(([place, h, m, extra]) => {
    if (N.state.mode !== 'play') { try { if (N.dialogue && N.dialogue.cancel) N.dialogue.cancel(); } catch (e) { /* ignore */ } }
    N.debug.setTime(h, m || 0);
    const r = typeof place === 'string' ? N.debug.teleport(place) : N.debug.teleport(place[0], place[1]);
    if (extra && extra.zoom) N.render.baseZoom = extra.zoom; else N.render.baseZoom = 1;
    return r;
  }, [place, h, m || 0, extra || null]);
}
async function settle(page) {
  // close a scolding line / bark dialogue if one is open, get back to play
  for (let i = 0; i < 20; i++) {
    const md = await page.evaluate(() => N.state.mode);
    if (md === 'play') return true;
    await page.evaluate(() => { try { if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.advance(); } catch (e) { /* ignore */ } try { if (N.dialogue && N.dialogue.cancel && N.state.mode === 'dialogue') N.dialogue.cancel(); } catch (e) { /* ignore */ } try { if (N.shops && N.shops.lock && N.state.mode === 'dialogue' && !(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen())) { N.shops.lock(true, 'test'); N.shops.lock(false, 'test'); } } catch (e) { /* ignore */ } });
    await gwait(page, 0.15);
  }
  return false;
}
const evs = (page, n) => page.evaluate((n) => window.__ev.filter((e) => e.n === n), n);
const clearEv = (page) => page.evaluate(() => { window.__ev.length = 0; });

async function run() {
  const browser = await chromium.launch();
  const { context, page, errors } = await boot(browser);
  const T0 = Date.now();
  console.log('== traffic.cjs ' + (LAB ? '(LAB: staging modules)' : '(index.html)'));

  /* ------------------------------------------------------------------ districts */
  if (want('districts')) {
    console.log('\n-- districts');
    const SPOTS = [
      { id: 'koti', place: 'koti_bus_stand', h: 10, style: 'market' },
      { id: 'charminar', place: 'charminar_plaza', h: 17, m: 30, style: 'oldcity', looks: ['burqa', 'skull'] },
      { id: 'colony_morning', place: 'home', h: 8, m: 10, style: 'colony', looks: ['student', 'aunty'] },
      { id: 'hitec', place: 'cyber_towers', h: 11, style: 'hitec', looks: ['office'] },
      { id: 'tank_bund', place: 'lumbini_park', h: 17, m: 15, style: 'colonial', boats: true },
      { id: 'secunderabad', place: 'secunderabad_station', h: 9, style: 'cantonment' },
      { id: 'rtc_night', place: 'rtc_x_roads', h: 21, m: 15, style: 'market' },
      { id: 'osmania', place: 'osmania_university', h: 10, m: 30, looks: ['college'] },
    ];
    for (const s of SPOTS) {
      const at = await go(page, s.place, s.h, s.m);
      if (!at) { fail('districts', 'cannot teleport to ' + s.place); continue; }
      await gwait(page, 3.6);
      await shot(page, 'district_' + s.id);
      const r = await page.evaluate(() => {
        const T = N.traffic, inV = (e) => N.render.inView(e.x, e.y, 0);
        const veh = T.vehicles, peds = T.peds;
        const types = {}, roles = {}, kinds = {}, ani = {};
        for (const v of veh) types[v.type] = (types[v.type] || 0) + 1;
        for (const p of peds) { roles[p.role] = (roles[p.role] || 0) + 1; const L = p.look || {}; kinds[L.kind] = (kinds[L.kind] || 0) + 1; if (L.hat === 'skull') kinds.skull = (kinds.skull || 0) + 1; if (L.lanyardDot) kinds.office = (kinds.office || 0) + 1; }
        for (const a of T.animals) ani[a.species] = (ani[a.species] || 0) + 1;
        return {
          st: T.stats(), vehIn: veh.filter(inV).length, pedIn: peds.filter(inV).length, types, roles, kinds, ani,
          ctl: veh.filter((v) => v.controller && v.tr).length, moving: veh.filter((v) => Math.abs(v.speed) > 8).length,
          district: (N.world.districtAt(N.player.x, N.player.y) || {}).id, boats: T.boats.length,
          errs: N.errors.map((e) => e.where + ': ' + e.msg).slice(0, 3),
        };
      });
      const tag = s.id + ' (' + r.district + ' ' + s.h + ':' + String(s.m || 0).padStart(2, '0') + ')';
      if (r.st.vehicles < 3) fail('districts', tag + ': only ' + r.st.vehicles + ' traffic vehicles');
      if (r.st.peds < 4) fail('districts', tag + ': only ' + r.st.peds + ' pedestrians');
      if (r.ctl !== r.st.vehicles) fail('districts', tag + ': ' + (r.st.vehicles - r.ctl) + ' traffic vehicles without the AI controller');
      if (r.moving < Math.min(2, r.st.vehicles)) fail('districts', tag + ': traffic is not moving (' + r.moving + ' moving)');
      for (const L of s.looks || []) {
        const n = L === 'student' ? (r.roles.student || 0) : L === 'aunty' ? (r.roles.aunty || 0) : L === 'college' ? (r.roles.college || 0) : (r.kinds[L] || 0);
        if (!n) fail('districts', tag + ': no "' + L + '" look among ' + JSON.stringify(r.roles)); else ok(tag + ': ' + n + ' x ' + L);
      }
      if (s.boats && !r.boats) fail('districts', tag + ': no boats on Hussain Sagar');
      ok(tag + ': ' + r.st.vehicles + ' vehicles (' + r.vehIn + ' in view, ' + r.moving + ' moving), ' + r.st.peds + ' peds (' + r.pedIn + ' in view), animals ' + JSON.stringify(r.ani) + (r.boats ? ', ' + r.boats + ' boats' : '') + ', types ' + Object.keys(r.types).join(' '));
    }
    // a close look at the street life (zoomed)
    await go(page, 'koti_bus_stand', 10, 30, { zoom: 2 });
    await gwait(page, 2.5);
    await shot(page, 'zoom_koti');
    await go(page, 'charminar_plaza', 17, 40, { zoom: 2 });
    await gwait(page, 2.5);
    await shot(page, 'zoom_charminar');
    await go(page, 'home', 8, 15, { zoom: 2 });
    await gwait(page, 2.5);
    await shot(page, 'zoom_colony');
    await page.evaluate(() => { N.render.baseZoom = 1; });
  }

  /* ------------------------------------------------------------------ lanes */
  if (want('lanes')) {
    console.log('\n-- lanes (drive on the left)');
    await go(page, 'koti_bus_stand', 11, 0);
    await gwait(page, 3);
    let left = 0, right = 0, samples = 0;
    for (let k = 0; k < 6; k++) {
      const r = await page.evaluate(() => {
        let L = 0, R = 0;
        const J = N.world.junctions || [];
        for (const v of N.traffic.vehicles) {
          if (!v.tr || Math.abs(v.speed) < 15 || v.T.mode === 'boat' || v.tr.inBox >= 0 || v.tr.swerve) continue;
          if (J.some((n) => Math.hypot(n.x - v.x, n.y - v.y) < n.w / 2 + 34)) continue;
          const q = N.world.nearestRoadPoint(v.x, v.y);
          if (!q || q.dist > 40 || q.road.kind === 'path') continue;
          const hx = Math.cos(v.angle), hy = Math.sin(v.angle);
          const ux = Math.cos(q.angle), uy = Math.sin(q.angle);
          if (Math.abs(hx * ux + hy * uy) < 0.8) continue;
          const ox = v.x - q.x, oy = v.y - q.y;
          const cross = hx * oy - hy * ox; // < 0: left of travel (+y is south)
          if (q.dist < 1.5) continue;
          if (cross < 0) L++; else R++;
        }
        return { L, R };
      });
      left += r.L; right += r.R; samples++;
      await gwait(page, 0.9);
    }
    const tot = left + right;
    if (tot < 8) fail('lanes', 'too few vehicle samples (' + tot + ')');
    else if (left / tot < 0.85) fail('lanes', 'only ' + Math.round((100 * left) / tot) + '% of samples keep left (' + left + '/' + tot + ')');
    else ok(Math.round((100 * left) / tot) + '% of ' + tot + ' moving-vehicle samples keep to the left lane');
  }

  /* ------------------------------------------------------------------ perf (night, full density) */
  if (want('perf')) {
    console.log('\n-- perf (night, full density)');
    await page.evaluate(() => N.traffic.setDensity(2));
    for (const place of ['abids', 'charminar_plaza']) {
      await go(page, place, 21, 0);
      await gwait(page, 4);
      // drive slowly through the area while measuring (traffic, peds, lights)
      const r = await page.evaluate(async () => {
        const times = []; let last = performance.now();
        const sysT = { traffic: 0, wanted: 0, entities: 0, vehicles: 0 }, n = { traffic: 0, wanted: 0, entities: 0, vehicles: 0 };
        const wraps = [];
        for (const s of N.systems.list) {
          if (!(s.id in sysT) || !s.update) continue;
          const u = s.update; wraps.push([s, u]);
          s.update = function (dt) { const t0 = performance.now(); const r = u.call(this, dt); sysT[s.id] += performance.now() - t0; n[s.id]++; return r; };
        }
        await new Promise((res) => { let f = 0; const step = () => { const t = performance.now(); times.push(t - last); last = t; if (++f < 240) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
        for (const [s, u] of wraps) s.update = u;
        times.sort((a, b) => a - b);
        const avg = (k) => +(sysT[k] / Math.max(1, n[k])).toFixed(3);
        return { perf: N.debug.perf(), st: N.traffic.stats(), p50: +times[times.length >> 1].toFixed(1), p95: +times[Math.floor(times.length * 0.95)].toFixed(1), sys: { traffic: avg('traffic'), wanted: avg('wanted'), entities: avg('entities'), vehicles: avg('vehicles') }, night: N.render.night };
      });
      await shot(page, 'perf_night_' + place);
      const tag = place + ' 21:00';
      note(tag + ': ' + r.st.vehicles + ' vehicles, ' + r.st.peds + ' peds, ' + r.st.animals + ' animals; CPU frame ' + r.perf.frameMs + ' ms (update ' + r.perf.updateMs + ', draw ' + r.perf.drawMs + '), rAF p50 ' + r.p50 + ' ms / p95 ' + r.p95 + ' ms; per step: traffic ' + r.sys.traffic + ' ms, entities ' + r.sys.entities + ' ms, vehicles ' + r.sys.vehicles + ' ms, wanted ' + r.sys.wanted + ' ms; night ' + (+r.night).toFixed(2));
      if (r.st.vehicles < 12) fail('perf', tag + ': density did not fill (' + r.st.vehicles + ' vehicles)');
      // the machine running the tests is shared: only this module's own cost is a hard limit
      if (r.perf.frameMs > 40) fail('perf', tag + ': CPU frame ' + r.perf.frameMs + ' ms');
      if (r.sys.traffic > 1.0) fail('perf', tag + ': traffic system ' + r.sys.traffic + ' ms per step (budget 1 ms)');
      if (r.sys.wanted > 0.3) fail('perf', tag + ': wanted system ' + r.sys.wanted + ' ms per step (budget 0.3 ms)');
    }
    await page.evaluate(() => N.traffic.setDensity(1));
    ok('perf measured');
  }

  /* ------------------------------------------------------------------ meter: drive into peds */
  if (want('meter')) {
    console.log('\n-- meter: drive into pedestrians');
    await settle(page);
    await page.evaluate(() => { N.debug.setWanted(0); N.wanted._W.heat = 0; });
    // a straight bit of road with room ahead
    const setup = await page.evaluate(() => {
      N.debug.setTime(11, 0);
      const roads = N.world.data.roads.filter((r) => r.kind === 'street' && r.pts.length >= 2);
      for (const r of roads) {
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i], b = r.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (L < 260) continue;
          const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
          const sx = a[0] + ux * 40 + uy * 8, sy = a[1] + uy * 40 - ux * 8;
          if (N.respect && N.respect.near && N.respect.near(sx + ux * 100, sy + uy * 100, 120)) continue;
          let clear = true;
          for (let d = 0; d <= 200; d += 10) if (!N.world.isDrivable(sx + ux * d, sy + uy * d) || N.world.collide(sx + ux * d, sy + uy * d, 8, 'drive').hit) { clear = false; break; }
          if (!clear) continue;
          N.traffic.clear();
          N.traffic.enabled = false;
          N.player.teleport(sx, sy);
          N.player.angle = Math.atan2(uy, ux);
          const v = N.debug.enterVehicle('ambassador');
          if (!v) return null;
          v.x = sx; v.y = sy; v.angle = Math.atan2(uy, ux); v.vx = v.vy = 0;
          const peds = [];
          // a little group crossing: an aunty, an old uncle and a man, side by side across the lane
          for (const [d, lat, role] of [[80, -5, 'aunty'], [80, 0, 'old'], [80, 5, 'man']]) {
            const x = sx + ux * d - uy * lat, y = sy + uy * d + ux * lat;
            const p = N.traffic.spawnPed(role, { x, y });
            if (p) { p.hold = true; p.x = x; p.y = y; peds.push(p.id); }
          }
          window.__peds = peds;
          window.__peak = 0;
          window.__peakT = setInterval(() => { window.__peak = Math.max(window.__peak, N.wanted.heat); }, 30);
          return { x: sx, y: sy, peds: peds.length };
        }
      }
      return null;
    });
    if (!setup || setup.peds < 2) fail('meter', 'could not set up the street test ' + JSON.stringify(setup));
    else {
      await clearEv(page);
      await page.evaluate(() => { N.input.hold('up', true); });
      await gwait(page, 2.3);
      await shot(page, 'meter_knockdown');
      await page.evaluate(() => { N.input.hold('up', false); N.input.hold('down', true); });
      await gwait(page, 0.7);
      await page.evaluate(() => { N.input.hold('down', false); });
      await gwait(page, 1.6);
      const r = await page.evaluate(() => { clearInterval(window.__peakT); return { lvl: N.wanted.level, heat: Math.round(N.wanted.heat), peak: Math.round(window.__peak), knocked: window.__ev.filter((e) => e.n === 'ped:knocked').length, peds: N.traffic.peds.filter((p) => window.__peds.indexOf(p.id) >= 0).map((p) => ({ down: p.down, alive: p.alive })) }; });
      if (r.knocked < 2) fail('meter', 'only ' + r.knocked + ' knock-down(s)');
      else ok(r.knocked + ' pedestrian knock-downs');
      if (r.peak < 150 || r.lvl < 1) fail('meter', 'meter did not rise enough (peak heat ' + r.peak + ', level ' + r.lvl + ')');
      else ok('Chappal Meter: peak heat ' + r.peak + ' -> level ' + r.lvl + ' after driving an Ambassador into an aunty, an old uncle and a man');
      if (r.peds.some((p) => p.down)) fail('meter', 'a pedestrian is still lying down after 2 s: ' + JSON.stringify(r.peds));
      else ok('everybody got up and dusted off');
      await page.evaluate(() => { const v = N.player.vehicle; if (v) N.vehicles.exit(N.player, true); N.traffic.enabled = true; for (const p of N.traffic.peds) p.hold = false; });
    }
  }

  /* ------------------------------------------------------------------ pursuers per level */
  if (want('pursuers')) {
    console.log('\n-- pursuers per level');
    await settle(page);
    const expect = { 1: ['chitti', 'uncle'], 2: ['chitti', 'uncle'], 3: ['pochaiah'], 4: ['pochaiah'], 5: ['mummy'] };
    for (const [label, h] of [['day', 11], ['night', 21]]) {
      for (let L = 1; L <= 5; L++) {
        if (label === 'night' && L !== 2 && L !== 5) continue;
        await page.evaluate(() => { N.debug.setWanted(0); });
        await go(page, 'playground_1', h, 5);
        await gwait(page, 0.4);
        await page.evaluate((L) => { N.debug.setWanted(L); }, L);
        await gwait(page, (L >= 3 ? 1800 : 2600) / 1000);
        const r = await page.evaluate(() => {
          const W = N.wanted, p = N.player;
          return {
            lvl: W.level, chaser: W.chaser ? W.chaser.role : null, mount: W.chaser && W.chaser.mount ? W.chaser.mount.type : null,
            others: W.pursuers.filter((a) => a !== W.chaser).map((a) => a.role), spotters: W.spotters.length, bahadur: !!W._W.bahadur,
            roadblock: !!W._W.roadblock, rbType: W._W.roadblock && W._W.roadblock.v ? W._W.roadblock.v.type : null,
            dist: W.chaser ? Math.round(Math.hypot((W.chaser.mount || W.chaser).x - p.x, (W.chaser.mount || W.chaser).y - p.y)) : null,
          };
        });
        const tag = 'L' + L + ' ' + label;
        if (r.lvl < L) { note(tag + ': level already dropped to ' + r.lvl + ' (' + JSON.stringify(r) + ')'); }
        if (!r.chaser || expect[L].indexOf(r.chaser) < 0) fail('pursuers', tag + ': chaser ' + r.chaser + ' (want ' + expect[L].join('|') + ')');
        else ok(tag + ': ' + r.chaser + (r.mount ? ' on ' + r.mount : '') + ' at ' + r.dist + ' u' + (r.others.length ? ' + ' + r.others.join(', ') : '') + (r.spotters ? ', ' + r.spotters + ' aunty spotters' : '') + (r.bahadur ? ', Bahadur' : '') + (r.roadblock ? ', roadblock (' + r.rbType + ')' : ''));
        if (L === 2 && label === 'day' && !r.spotters && !r.others.length) fail('pursuers', tag + ': no spotters or second uncle at level 2');
        if (L === 2 && label === 'night' && !r.bahadur) note(tag + ': no Bahadur (not a colony district?)');
        if (L === 4 && !(r.others.indexOf('havaldar') >= 0)) fail('pursuers', tag + ': no second havaldar');
        if (L === 4 && !r.roadblock) note(tag + ': no roadblock placed (no road ahead out of view?)');
        if (L === 5 && label === 'day' && r.mount !== 'yadagiri_auto') fail('pursuers', tag + ': Mummy should come in Yadagiri\'s auto (got ' + r.mount + ')');
        if (L === 5 && label === 'night' && !/chetak/.test(r.mount || '')) fail('pursuers', tag + ': Mummy should come pillion on Nanna\'s Chetak (got ' + r.mount + ')');
        if (L === 1 || L === 3 || L === 5) {
          await gwait(page, 1.5);
          await page.evaluate(() => { N.render.baseZoom = 0.85; });
          await shot(page, 'pursuers_L' + L + '_' + label);
          await page.evaluate(() => { N.render.baseZoom = 1; });
        }
        await page.evaluate(() => { N.debug.setWanted(0); });
        await settle(page);
      }
    }
  }

  /* ------------------------------------------------------------------ busted */
  if (want('busted')) {
    console.log('\n-- busted (PAKDA GAYA!)');
    await settle(page);
    await page.evaluate(() => { N.debug.setWanted(0); N.debug.setTime(11, 0); });
    // an open, road-side spot away from home
    await go(page, 'koti_bus_stand', 11, 0);
    await gwait(page, 0.5);
    await clearEv(page);
    const money0 = await page.evaluate(() => { N.debug.give(1000); return N.player.money; });
    await page.evaluate(() => { N.debug.setWanted(3); });
    let busted = false, shotTaken = false;
    for (let i = 0; i < 230; i++) {
      await gwait(page, 0.12);
      const r = await page.evaluate(() => ({ b: window.__ev.some((e) => e.n === 'busted'), mode: N.state.mode, sx: !!N.wanted._W.slipFx }));
      if (r.b && !shotTaken) { await shot(page, 'busted_slipper'); shotTaken = true; }
      if (r.b) { busted = true; break; }
    }
    if (!busted) fail('busted', 'Pochaiah never caught a boy standing still for 28 s');
    else {
      await gwait(page, 0.9);
      const banner = await page.evaluate(() => document.body.innerText.indexOf('PAKDA GAYA') >= 0);
      await shot(page, 'busted_banner');
      await gwait(page, 2.2);
      await shot(page, 'busted_home');
      const r = await page.evaluate(() => {
        const h = N.places.home, p = N.player;
        return { mode: N.state.mode, lvl: N.wanted.level, money: p.money, dHome: Math.round(Math.hypot(p.x - h.x, p.y - h.y)), caught: N.wanted.stats.caught, by: (window.__ev.find((e) => e.n === 'busted') || {}).d };
      });
      if (!banner) note('banner text not found in the DOM (HUD may render it on canvas)'); else ok('"PAKDA GAYA!" banner shown');
      if (r.lvl !== 0) fail('busted', 'meter not cleared after busted (level ' + r.lvl + ')');
      if (r.money !== money0 - 200) fail('busted', 'fine: money ' + money0 + ' -> ' + r.money + ' (want -₹2)'); else ok('fined ₹2');
      if (r.dHome > 60) fail('busted', 'respawned ' + r.dHome + ' u from home'); else ok('respawned at the home gate (' + r.dHome + ' u), caught ' + r.caught + ' time(s), by ' + JSON.stringify(r.by));
      if (r.mode !== 'play' && r.mode !== 'dialogue') fail('busted', 'mode after busted: ' + r.mode);
      await settle(page);
    }
  }

  /* ------------------------------------------------------------------ chappal */
  if (want('chappal')) {
    console.log('\n-- level 5: the homing chappal');
    await settle(page);
    await page.evaluate(() => { N.debug.setWanted(0); });
    await go(page, 'abids', 11, 0);
    await gwait(page, 0.6);
    await clearEv(page);
    await page.evaluate(() => { N.debug.setWanted(5); });
    let thrown = false;
    for (let i = 0; i < 110; i++) {
      await gwait(page, 0.4);
      const r = await page.evaluate(() => { const p = N.player, a = N.wanted.chaser; return { th: window.__ev.filter((e) => e.n === 'chappal:throw').length, fly: !!(N.wanted._W.chappal && N.wanted._W.chappal.ph === 'fly'), b: window.__ev.some((e) => e.n === 'busted'), d: a ? Math.hypot(a.x - p.x, a.y - p.y) : 1e9 }; });
      if (r.fly && !thrown) { thrown = true; await shot(page, 'chappal_flight'); }
      if (r.b) break;
      // wait for Mummy's auto, then dodge about (inside her 150 u throwing range) so the throw happens
      await page.evaluate(([i, near]) => { if (near) { N.input.setMove(Math.sin(i * 0.7), Math.cos(i * 0.5), true); N.input.hold('run', true); } else { N.input.setMove(null); N.input.hold('run', false); } }, [i, r.d < 170]);
    }
    await page.evaluate(() => { N.input.setMove(null); N.input.hold('run', false); });
    const r = await page.evaluate(() => ({ th: window.__ev.filter((e) => e.n === 'chappal:throw').length, hit: window.__ev.some((e) => e.n === 'chappal:hit'), dodge: window.__ev.some((e) => e.n === 'chappal:dodge'), b: window.__ev.find((e) => e.n === 'busted') }));
    if (!r.th) fail('chappal', 'Mummy never threw the chappal in 44 s');
    else ok('chappal thrown (' + r.th + ' throw events)' + (r.dodge ? ', dodged one' : '') + (r.hit ? ', hit -> busted' : r.b ? ', caught by ' + r.b.d.by : ''));
    await gwait(page, 2.6);
    await settle(page);
  }

  /* ------------------------------------------------------------------ barber */
  if (want('barber')) {
    console.log('\n-- barber clears the meter');
    await settle(page);
    // barbers are closed on Tuesdays (TUE 14 JAN 2003): use Wednesday
    await page.evaluate(() => { try { if (N.calendar && N.calendar.set) N.calendar.set(2003, 1, 15, 11, 0); } catch (e) { N.clock.day = 1; } N.debug.setTime(11, 0); });
    const pl = await page.evaluate(() => { const b = Object.values(N.places).find((p) => p.kind === 'barber'); return b ? b.id : null; });
    if (!pl) fail('barber', 'no barber place');
    else {
      await go(page, pl, 11, 0);
      await page.evaluate(() => { N.debug.give(2000); N.debug.setWanted(2); });
      await gwait(page, 0.3);
      const m0 = await page.evaluate(() => N.player.money);
      const how = await page.evaluate(async (pl) => {
        if (N.shops && typeof N.shops.haircut === 'function') { const r = N.shops.haircut(pl); if (r && r.then) await r; return 'shops.haircut'; }
        await N.wanted.haircut(pl);
        return 'wanted.haircut';
      }, pl);
      // a cutscene may play: wait for it
      // (the shops card shows an 8 s progress bar and stays open afterwards; wanted.js's own fallback plays a cutscene)
      for (let i = 0; i < 60; i++) { const st = await page.evaluate(() => ({ md: N.state.mode, l: N.wanted.level })); if (st.md === 'play' || st.l === 0) break; await page.evaluate(() => { try { if (N.menus && N.menus.abortCutscene && N.state.mode === 'cutscene') N.menus.abortCutscene(); } catch (e) { /* ignore */ } }); await gwait(page, 0.25); }
      await gwait(page, 0.4);
      const r = await page.evaluate(() => ({ lvl: N.wanted.level, money: N.player.money, hair: N.player.status && N.player.status.hair ? N.player.status.hair.value : null }));
      await shot(page, 'barber_after');
      if (!(await settle(page))) fail('barber', 'the shop card did not close (mode ' + (await page.evaluate(() => N.state.mode)) + ')');
      if (r.lvl !== 0) fail('barber', how + ': level ' + r.lvl + ' after the haircut');
      else ok(how + ' at ' + pl + ': meter cleared, paid ' + ((m0 - r.money) / 100) + ' rupees, hairstyle ' + r.hair);
    }
  }

  /* ------------------------------------------------------------------ wasted */
  if (want('wasted')) {
    console.log('\n-- THAK GAYA! (tummy 0)');
    await settle(page);
    await page.evaluate(() => { N.debug.setWanted(0); });
    await go(page, 'abids', 15, 0);
    await gwait(page, 0.5);
    await clearEv(page);
    const m0 = await page.evaluate(() => { N.debug.give(500); const p = N.player; p.tummy = 0; p.energy = 0; return p.money; });
    let got = false;
    for (let i = 0; i < 30; i++) { await gwait(page, 0.25); if (await page.evaluate(() => window.__ev.some((e) => e.n === 'wasted'))) { got = true; break; } }
    if (!got) fail('wasted', 'no THAK GAYA after tummy 0 ' + JSON.stringify(await page.evaluate(() => ({ mode: N.state.mode, stack: N.state.stack ? N.state.stack.slice() : null, mission: N.missions && N.missions.active ? N.missions.active.id || true : null, tummy: N.player.tummy, starving: N.player.starving, busy: N.wanted.busy, locked: N.player.controlsLocked }))));
    else {
      await gwait(page, 0.7);
      await shot(page, 'wasted_banner');
      await gwait(page, 3);
      const r = await page.evaluate(() => {
        const p = N.player;
        let near = null, bd = 1e9;
        for (const id in N.places) if (/^irani_cafe_\d+$/.test(id) || id === 'home') { const c = N.places[id], d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; near = id; } }
        return { tummy: Math.round(p.tummy), energy: Math.round(p.energy), money: p.money, near, d: Math.round(bd), mode: N.state.mode };
      });
      await shot(page, 'wasted_cafe');
      if (r.tummy < 40) fail('wasted', 'tummy ' + r.tummy + ' after THAK GAYA');
      if (r.d > 70) fail('wasted', 'woke ' + r.d + ' u from ' + r.near);
      else ok('woke at ' + r.near + ' (' + r.d + ' u) with tummy ' + r.tummy + ', paid ' + ((m0 - r.money) / 100) + ' rupee(s) for glucose water');
      await settle(page);
    }
  }

  /* ------------------------------------------------------------------ misc */
  if (want('misc')) {
    console.log('\n-- misc: hide, respect zones, horns, pigeons, cows');
    await settle(page);
    // hide behind the rice sacks (shops.js row calls this)
    const hide = await page.evaluate(() => { N.debug.setWanted(2); const r = N.wanted.hide('kirana', 'kirana_1'); return { r, lvl: N.wanted.level }; });
    if (!hide.r.ok || hide.lvl !== 1) fail('misc', 'kirana hide: ' + JSON.stringify(hide)); else ok('hide behind the rice sacks: level 2 -> 1');
    // respect zone: the meter freezes at a temple forecourt
    const rz = await page.evaluate(() => {
      const z = (N.respect && N.respect.zones || []).find((q) => q.forecourt && q.forecourt.length && q.kind === 'temple');
      if (!z) return null;
      const f = z.forecourt[0];
      N.debug.setWanted(0); N.debug.setTime(11, 0);
      N.player.teleport(f[0] + f[2] / 2, f[1] + f[3] / 2);
      N.debug.setWanted(2);
      return { id: z.id, heat: N.wanted.heat };
    });
    if (!rz) note('no temple respect zone with a forecourt in the data');
    else {
      await gwait(page, 13.5);
      const r2 = await page.evaluate(() => ({ heat: N.wanted.heat, inR: N.wanted.inRespect, lvl: N.wanted.level, pursuers: N.wanted.pursuers.map((a) => Math.round(N.respect.distance(a.x, a.y, N.respect.at(N.player.x, N.player.y) ? N.respect.at(N.player.x, N.player.y).zone : null) || 0)) }));
      await shot(page, 'respect_freeze');
      if (!r2.inR) fail('misc', 'not inside the respect zone ' + rz.id);
      else if (r2.lvl !== 2) fail('misc', 'meter changed inside the respect zone (level ' + r2.lvl + ')');
      else ok('meter frozen at level 2 for 13 s at the ' + rz.id + ' forecourt');
    }
    await page.evaluate(() => { N.debug.setWanted(0); });
    // the horn scatters pigeons (our flocks: Abids GPO, Secunderabad station, ...)
    const pig = await page.evaluate(async () => {
      for (const id of N.traffic.TUNE.pigeonPlaces) {
        const p = N.places[id];
        if (!p) continue;
        N.player.teleport(p.x, p.y);
        await __gw(1.3);
        const f = N.traffic.flocks.find((q) => q.id === id);
        if (!f) continue;
        const b = f.birds[0];
        N.player.teleport(b.x + 30, b.y);
        await __gw(0.2);
        window.__ev.length = 0;
        N.emit('horn', { x: N.player.x, y: N.player.y, type: 'foot', vehicle: null, who: N.player });
        await __gw(0.3);
        return { id, flying: f.birds.filter((q) => q.st !== 0).length, n: f.birds.length, ev: window.__ev.filter((e) => e.n === 'pigeons:scatter').length };
      }
      return null;
    });
    if (!pig) note('no pigeon flock place found');
    else if (!pig.flying) fail('misc', 'horn did not scatter the pigeons at ' + pig.id);
    else { ok('horn scattered ' + pig.flying + '/' + pig.n + ' pigeons at ' + pig.id); await shot(page, 'pigeons'); }
    // Charminar's landmark flock lifts off when you run through
    const cm = await page.evaluate(async () => {
      const f = (N.landmarks && N.landmarks.flocks || []).find((q) => q.id === 'charminar');
      if (!f) return null;
      const b = f.birds.find((q) => q.st === 0) || f.birds[0];
      N.player.teleport(b.x - 60, b.y);
      await __gw(0.3);
      // run at that bird for 1.4 s of game time, re-aiming every 0.1 s (a straight dash east could be
      // stopped by the monument's piers or a stall when the bird has hopped behind one)
      N.input.hold('run', true);
      for (let i = 0; i < 14 && b.st === 0; i++) { const dx = b.x - N.player.x, dy = b.y - N.player.y, L = Math.hypot(dx, dy) || 1; N.input.setMove(dx / L, dy / L, true); await __gw(0.1); }
      N.input.setMove(null); N.input.hold('run', false);
      return { flying: f.birds.filter((q) => q.st !== 0).length, n: f.birds.length };
    });
    if (cm) { if (!cm.flying) fail('misc', 'Charminar pigeons did not lift off'); else { ok('Charminar pigeons burst into flight (' + cm.flying + '/' + cm.n + ')'); await shot(page, 'charminar_pigeons'); } }
    // a cow lying on the road: traffic stops / goes round, the horn makes her get up
    const cow = await page.evaluate(async () => {
      const T = N.traffic;
      for (let k = 0; k < 6; k++) {
        const c = T.animals.find((a) => a.species === 'cow');
        if (c) {
          N.player.teleport(c.x + 40, c.y + 30);
          await __gw(0.6);
          const st0 = c.state;
          N.emit('horn', { x: N.player.x, y: N.player.y, type: 'foot', vehicle: null, who: N.player });
          await __gw(4.2);
          return { st0, st1: c.state, moved: Math.round(Math.hypot(c.x - c.home.x, c.y - c.home.y)) };
        }
        N.player.teleport(N.places.charminar_plaza.x + 300 * k, N.places.charminar_plaza.y);
        await __gw(1.5);
      }
      return null;
    });
    if (!cow) note('no cow found to honk at');
    else if (cow.st1 === cow.st0 && cow.moved < 5 && cow.st0 !== 'amble') fail('misc', 'cow ignored the horn ' + JSON.stringify(cow));
    else ok('cow got up after the horn (' + cow.st0 + ' -> ' + cow.st1 + ', ambled ' + cow.moved + ' u)');
  }

  /* ------------------------------------------------------------------ rules */
  if (want('rules')) {
    console.log('\n-- rules: home before the street lights, curfew, save/load, mission policy, Chitti, autos, buses');
    await settle(page);
    // home before the street lights (17:00, level 2): the meter clears at the gate
    const home = await page.evaluate(async () => {
      N.debug.setWanted(0); N.debug.setTime(17, 0);
      const h = N.places.home;
      N.player.teleport(h.x + 70, h.y); await __gw(0.4);
      N.debug.setWanted(2); await __gw(0.2);
      N.player.teleport(h.x, h.y); await __gw(0.6);
      return N.wanted.level;
    });
    if (home !== 0) fail('rules', 'home before 18:30 did not clear level 2 (level ' + home + ')'); else ok('home before the street lights: level 2 -> 0 ("Good boy, home on time.")');
    await settle(page);
    // the curfew floor at 21:30 in free roam
    const cur = await page.evaluate(async () => {
      N.debug.setWanted(0);
      N.player.teleport(N.places.abids.x, N.places.abids.y);
      // mid-January is Numaish season: the curfew waits till 22:30 (systems §4.9 exemptions)
      N.debug.setTime(21, 40); await __gw(0.7);
      const numaish = N.wanted.curfewFloor;
      // an ordinary March night
      N.calendar.set(2003, 3, 5, 21, 40); await __gw(0.7);
      const l1 = N.wanted.level, f1 = N.wanted.curfewFloor;
      N.debug.setTime(23, 10); await __gw(0.7);
      const l2 = N.wanted.level;
      const h = N.places.home; N.player.teleport(h.x, h.y); await __gw(0.7);
      return { numaish, l1, f1, l2, after: N.wanted.level, floor: N.wanted.curfewFloor };
    });
    if (cur.numaish !== 0 || cur.l1 < 1 || cur.l2 < 2 || cur.after !== 0) fail('rules', 'curfew: ' + JSON.stringify(cur)); else ok('curfew: Numaish night 21:40 floor 0; March 21:40 floor ' + cur.f1 + ' (level ' + cur.l1 + '), 23:10 level ' + cur.l2 + ', home clears it');
    await settle(page);
    // save / load keeps the meter
    const sv = await page.evaluate(async () => {
      N.debug.setTime(11, 0); N.debug.setWanted(0);
      N.player.teleport(N.places.abids.x, N.places.abids.y);
      N.debug.setWanted(2);
      const ok = N.save.save({ reason: 'mission', toast: false });
      N.debug.setWanted(0);
      const loaded = N.save.load();
      await __gw(0.3);
      return { ok, loaded, lvl: N.wanted.level };
    });
    if (!sv.ok || !sv.loaded || sv.lvl !== 2) fail('rules', 'save/load meter: ' + JSON.stringify(sv)); else ok('save/load keeps the Chappal Meter (level 2)');
    await page.evaluate(() => { if (N.state.mode !== 'play') N.state.set('play'); });
    await settle(page);
    // mission policy: scripted lock, frozen
    const pol = await page.evaluate(() => {
      N.debug.setWanted(0);
      N.wanted.policy('scripted', 4);
      N.wanted.add(1); const a = N.wanted.level;
      N.wanted.clear('test'); const b = N.wanted.level;
      N.wanted.policy('normal'); N.wanted.clear('test');
      N.wanted.policy('frozen'); N.wanted.add(2, 'x'); const c = N.wanted.level;
      N.wanted.policy('normal'); N.wanted.add(1, 'x'); const d = N.wanted.level;
      N.debug.setWanted(0);
      return { a, b, c, d };
    });
    if (pol.a !== 4 || pol.b !== 4 || pol.c !== 0 || pol.d !== 1) fail('rules', 'mission policy: ' + JSON.stringify(pol)); else ok('mission policy: scripted lock holds level 4, frozen ignores offences, normal works');
    // Chitti chases at level 1 in the home colony after school
    const ch = await page.evaluate(async () => {
      try { if (N.calendar && N.calendar.set) N.calendar.set(2003, 1, 19, 17, 0); } catch (e) { /* ignore */ }
      N.debug.setTime(17, 0); N.debug.setWanted(0);
      const pg = N.places.playground_1 || N.places.home;
      N.player.teleport(pg.x, pg.y); await __gw(0.3);
      N.debug.setWanted(1); await __gw(1.2);
      const c = N.wanted.chaser;
      return { role: c && c.role, district: (N.world.districtAt(N.player.x, N.player.y) || {}).id };
    });
    if (ch.role !== 'chitti') fail('rules', 'level 1 in ' + ch.district + ' at 17:00 brought ' + ch.role + ', not Chitti'); else ok('Chitti chases at level 1 in ' + ch.district + ' after school');
    await page.evaluate(() => N.debug.setWanted(0));
    // shops.js asks traffic for an empty auto ("AUTO!")
    const au = await page.evaluate(async () => {
      N.player.teleport(N.places.koti_bus_stand.x, N.places.koti_bus_stand.y); N.debug.setTime(11, 0);
      await __gw(2.5);
      const v = N.traffic.claimAuto(N.player.x, N.player.y, 900);
      return v ? { type: v.type, released: !v.tr && v.controller == null, inList: N.traffic.vehicles.indexOf(v) >= 0 } : null;
    });
    if (!au) note('no free ambient auto near Koti to claim'); else if (au.type !== 'auto' || !au.released || au.inList) fail('rules', 'claimAuto: ' + JSON.stringify(au)); else ok('claimAuto hands shops.js an empty auto released from traffic');
    // buses stop at bus stops
    await clearEv(page);
    const stops = await page.evaluate(async () => {
      let n = 0; const f = () => n++; N.on('bus:stop', f);
      // a bus put on the road just before a stop on its left must pull in (the ambient sample is luck)
      const RI = N.traffic.index, tries = [];
      for (const [eid, l] of RI.stops) { const e = RI.edges[eid]; if (e && !e.oneway) for (const s of l) tries.push({ e, s }); else if (e) for (const s of l) if (s.leftOfAB) tries.push({ e, s }); if (tries.length > 8) break; }
      for (const { e, s } of tries.slice(0, 4)) {
        const A = RI.nodes[s.leftOfAB ? e.a : e.b], B = RI.nodes[s.leftOfAB ? e.b : e.a];
        N.player.teleport(s.place.x + 30, s.place.y + 30); N.debug.setTime(11, 0);
        await __gw(0.3);
        const ang = Math.atan2(B.y - A.y, B.x - A.x);
        N.traffic.spawnVehicle('bus', { x: A.x + Math.cos(ang) * 6, y: A.y + Math.sin(ang) * 6, angle: ang, to: B.id });
        for (let i = 0; i < 24 && !n; i++) await __gw(0.4);
        if (n) break;
      }
      N.off('bus:stop', f);
      return n;
    });
    if (!stops) note('no bus stopped at a stop during the sample (buses are 4-10% of traffic)'); else ok(stops + ' bus stop(s) observed (passengers on and off)');
  }

  /* ------------------------------------------------------------------ errors so far */
  const nErr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
  if (nErr.length) fail('errors', 'N.err: ' + nErr.slice(0, 6).join(' | '));
  if (errors.length) fail('errors', errors.slice(0, 6).join(' | '));
  await context.close();

  /* ------------------------------------------------------------------ mobile */
  if (want('mobile')) {
    console.log('\n-- phone portrait 390x844 (touch)');
    const M = await boot(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await M.page.evaluate(() => { N.input.device = 'touch'; document.body.classList.add('touch-on'); });
    await go(M.page, 'koti_bus_stand', 18, 0);
    await gwait(M.page, 4.5);
    const r = await M.page.evaluate(async () => {
      const times = []; let last = performance.now();
      await new Promise((res) => { let f = 0; const step = () => { const t = performance.now(); times.push(t - last); last = t; if (++f < 180) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      times.sort((a, b) => a - b);
      return { st: N.traffic.stats(), perf: N.debug.perf(), p50: +times[times.length >> 1].toFixed(1) };
    });
    await shot(M.page, 'mobile_koti');
    await M.page.evaluate(() => { N.debug.setWanted(3); });
    await gwait(M.page, 2.5);
    await shot(M.page, 'mobile_chase');
    if (r.st.vehicles > 20 || r.st.peds > 32) fail('mobile', 'caps exceeded: ' + JSON.stringify(r.st));
    else ok('caps respected on touch: ' + r.st.vehicles + ' vehicles, ' + r.st.peds + ' peds');
    note('phone portrait Koti 18:00: CPU frame ' + r.perf.frameMs + ' ms (update ' + r.perf.updateMs + ', draw ' + r.perf.drawMs + '), rAF p50 ' + r.p50 + ' ms');
    const e2 = await M.page.evaluate(() => N.errors.map((e) => e.where + ': ' + e.msg.split('\n')[0]));
    if (e2.length) fail('mobile', 'N.err: ' + e2.slice(0, 4).join(' | '));
    if (M.errors.length) fail('mobile', M.errors.slice(0, 4).join(' | '));
    await M.context.close();
  }

  await browser.close();
  console.log('\n' + (failures.length ? failures.length + ' FAILURE(S):\n  ' + failures.join('\n  ') : 'ALL PASSED') + '   (' + ((Date.now() - T0) / 1000).toFixed(1) + ' s)');
  if (notes.length) console.log('notes:\n  ' + notes.join('\n  '));
  process.exit(failures.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(2); });
