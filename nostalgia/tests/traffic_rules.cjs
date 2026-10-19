/* NOSTALGIA — tests/traffic_rules.cjs  (pursuer routes, roofs, respect zones, traffic type weights)
 * Headless Chromium (Playwright). Focused checks for traffic.js / wanted.js rules:
 *   route    a pursuer road route across the city (Charminar -> Cyber Towers) on N.world.roads.route,
 *            and the node-pair cache (a repeat call is a cache hit)
 *   roof     Chinnu on a roof (N.player.level): a chaser held right below him never catches him, never
 *            climbs (level stays null), and a foot chaser who saw him go up waits by the stairs
 *   respect  Chinnu in a respect-zone forecourt: the meter is frozen, pursuers stand still and do not grab;
 *            traffic next to a respect zone does not honk at someone blocking it (control: it does elsewhere)
 *            and crawls (cruise <= TUNE.respectCruise)
 *   types    N.traffic.readsTypeWeights, typeWeights() follows N.vehicles.TYPES[t].spawn (live), the spawn
 *            distribution over many samples, the night rule halves every pedal type, driverLook() for the
 *            Hero / Hercules / Scooty riders (and the look survives on a spawned traffic vehicle)
 * Waits are game-time waits (N.time.now), not wall-clock sleeps. Fails on any console error / page error / N.err.
 *   node nostalgia/tests/traffic_rules.cjs
 *   ONLY=roof,types node nostalgia/tests/traffic_rules.cjs
 */
'use strict';
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = process.env.ROOT ? path.resolve(process.env.ROOT) : path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (s) => !ONLY || ONLY.has(s);

const failures = [];
const fail = (sec, msg) => { failures.push('[' + sec + '] ' + msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const note = (msg) => console.log('  ..   ' + msg);
const check = (sec, cond, msg, extra) => (cond ? ok(msg) : fail(sec, msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')));

async function boot(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 45000 });
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 15000 });
  await page.evaluate(() => {
    window.__ev = [];
    for (const n of ['busted', 'wasted', 'traffic:honk', 'wanted:change'])
      N.on(n, (d) => { window.__ev.push({ n, t: N.time.now, d: d && typeof d === 'object' ? { level: d.level, by: d.by, why: d.why, id: d.vehicle && d.vehicle.id } : d }); });
    if (N.dialogue) N.dialogue.skip = true;
    // keep missions / story from taking over mid-test
    try { if (N.missions && N.missions.active && N.missions.abort) N.missions.abort(); } catch (e) { /* ignore */ }
  });
  return { context, page, errors };
}
/** Wait `secs` of game time (N.time.now), with a generous wall-clock cap for a loaded machine. */
async function waitGame(page, secs, capMs) {
  const t0 = await page.evaluate(() => N.time.now);
  await page.waitForFunction((t) => N.time.now >= t, t0 + secs, { timeout: capMs || Math.max(20000, secs * 8000), polling: 50 });
}
async function settle(page) {
  for (let i = 0; i < 40; i++) {
    const md = await page.evaluate(() => N.state.mode);
    if (md === 'play') return true;
    await page.evaluate(() => { try { if (N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()) N.dialogue.advance(); } catch (e) { /* ignore */ } try { if (N.dialogue && N.dialogue.cancel && N.state.mode === 'dialogue') N.dialogue.cancel(); } catch (e) { /* ignore */ } });
    await page.waitForTimeout(100);
  }
  return false;
}

async function run() {
  const browser = await chromium.launch();
  const { context, page, errors } = await boot(browser);
  console.log('== traffic_rules.cjs');

  /* ------------------------------------------------------------------ route */
  if (want('route')) {
    console.log('\n-- route: pursuer road routes on N.world.roads.route');
    const r = await page.evaluate(() => {
      const P = N.places, a = P.charminar, b = P.cyber_towers;
      if (!a || !b || !N.wanted.route) return { missing: true };
      const t0 = performance.now();
      const pts = N.wanted.route({ x: a.x, y: a.y, angle: 0 }, b.x, b.y);
      const ms = performance.now() - t0;
      const st1 = N.wanted.routeStats();
      const pts2 = N.wanted.route({ x: a.x, y: a.y, angle: 0 }, b.x, b.y);
      const st2 = N.wanted.routeStats();
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const lastNode = pts[pts.length - 2];
      return {
        n: pts.length, len: Math.round(len), crow: Math.round(Math.hypot(b.x - a.x, b.y - a.y)), ms: +ms.toFixed(1),
        endGap: Math.round(Math.hypot(lastNode[0] - b.x, lastNode[1] - b.y)), st1, st2, same: pts2.length === pts.length,
      };
    });
    if (r.missing) fail('route', 'N.wanted.route or the places are missing');
    else {
      check('route', r.n > 20 && r.st1.fails === 0, 'Charminar -> Cyber Towers: ' + r.n + ' points, ' + r.len + ' u of road (crow ' + r.crow + ' u), ' + r.st1.expanded + ' nodes expanded, ' + r.ms + ' ms', r);
      check('route', r.endGap < 200 && r.len >= r.crow, 'the route ends at the target road node (gap ' + r.endGap + ' u)');
      check('route', r.st2.hits === r.st1.hits + 1 && r.same, 'a repeat route is a cache hit', r.st2);
    }
  }

  /* ------------------------------------------------------------------ roof */
  if (want('roof')) {
    console.log('\n-- roof: nobody catches Chinnu on a roof');
    await settle(page);
    const setup = await page.evaluate(() => {
      const RF = N.world.roofs, roof = RF && RF.get('home_terrace');
      if (!roof) return { missing: true };
      N.debug.setTime(11, 0);
      N.debug.setWanted(0);
      const st = roof.stairs[0];
      N.player.teleport(st.x, st.y);
      N.debug.setWanted(3);
      return { roof: roof.id, st: { x: st.x, y: st.y, tx: st.tx, ty: st.ty } };
    });
    if (setup.missing) fail('roof', 'no home_terrace roof');
    else {
      // wait for the level-3 chaser (Pochaiah) to turn up
      await page.waitForFunction(() => N.wanted.chaser && N.wanted.chaser.alive, null, { timeout: 30000, polling: 100 }).catch(() => null);
      const has = await page.evaluate(() => !!(N.wanted.chaser && N.wanted.chaser.alive));
      if (!has) fail('roof', 'no chaser at level 3');
      else {
        // he sees Chinnu (brought 30 u away in the open), then Chinnu goes up the stairs
        await page.evaluate((st) => {
          const a = N.wanted.chaser, m = a.mount && (a.vehicle === a.mount || a.passengerOf === a.mount) ? a.mount : null;
          // the nearest open spot 50-90 u away with a clear line of sight to the stair foot
          let f = null;
          for (let r = 50; r <= 90 && !f; r += 10) for (let k = 0; k < 16 && !f; k++) {
            const x = st.x + Math.cos(k / 16 * Math.PI * 2) * r, y = st.y + Math.sin(k / 16 * Math.PI * 2) * r;
            if (N.world.isWalkable(x, y) && !N.world.raycast(x, y, st.x, st.y, 'walk').hit) f = { x, y };
          }
          f = f || { x: st.x + 40, y: st.y };
          if (m) { m.x = f.x; m.y = f.y; m.vx = m.vy = 0; m.speed = 0; } else { a.x = f.x; a.y = f.y; }
          window.__ev.length = 0;
        }, setup.st);
        await page.waitForFunction(() => N.wanted.seen || N.wanted.busy, null, { timeout: 15000, polling: 'raf' }).catch(() => null);
        const seen = await page.evaluate(() => { const r = N.wanted.seen && !N.wanted.busy; N.world.roofs.climb('home_terrace', 0, N.player, { instant: true }); return r; });
        if (!seen) note('the chaser did not see Chinnu go up (the stairs wait is only for chasers who saw him)');
        const up = await page.evaluate(() => N.player.level);
        check('roof', up === 'home_terrace', 'Chinnu is on the home terrace (level ' + up + ')');
        // Chinnu walks to the parapet where the street below is closest; hold the chaser (or his Luna) on that
        // street spot, within arm's reach on the map (< TUNE.catchR) but a storey down, for 4 s of game time
        const edge = await page.evaluate(() => {
          const RF = N.world.roofs, r = RF.get('home_terrace');
          let best = null;
          for (let u = 0; u <= 1.0001; u += 0.05) for (const side of [0, 1, 2, 3]) {
            const x = side === 0 ? r.x + r.w * u : side === 1 ? r.x + r.w - 3 : side === 2 ? r.x + r.w * u : r.x + 3;
            const y = side === 0 ? r.y + 3 : side === 1 ? r.y + r.d * u : side === 2 ? r.y + r.d - 3 : r.y + r.d * u;
            const c = RF.at(x, y);
            if (!c || !c.roof || c.roof.id !== r.id) continue;
            const nx = side === 1 ? 1 : side === 3 ? -1 : 0, ny = side === 0 ? -1 : side === 2 ? 1 : 0;
            for (let k = 4; k <= 9; k += 0.5) {
              const gx = x + nx * k, gy = y + ny * k;
              if (N.world.isWalkable(gx, gy) && !N.world.collide(gx, gy, 3.5, 'walk').hit) { if (!best || k < best.k) best = { x, y, gx, gy, k }; break; }
            }
          }
          if (!best) return null;
          RF.place(N.player, r.id, best.x, best.y);
          window.__gs = best;
          return { k: best.k, level: N.player.level, catchR: N.wanted.TUNE.catchR };
        });
        if (!edge) note('no parapet spot beside a street on home_terrace: holding the chaser right under Chinnu');
        else note('Chinnu at the parapet, the chaser held ' + edge.k + ' u away on the street below (catchR ' + edge.catchR + ', level ' + edge.level + ')');
        await page.evaluate(() => {
          window.__hold = setInterval(() => {
            const a = N.wanted.chaser, p = N.player, g = window.__gs || { gx: p.x + 3, gy: p.y };
            if (!a || !a.alive) return;
            const m = a.mount && (a.vehicle === a.mount || a.passengerOf === a.mount) ? a.mount : null;
            if (m) { m.x = g.gx; m.y = g.gy; m.vx = m.vy = 0; m.speed = 0; a.x = m.x; a.y = m.y; } else { a.x = g.gx; a.y = g.gy; a.vx = a.vy = 0; }
          }, 8);
        });
        await waitGame(page, 4);
        await page.evaluate(() => clearInterval(window.__hold));
        const r1 = await page.evaluate(() => ({
          busted: window.__ev.filter((e) => e.n === 'busted').length, busy: N.wanted.busy, mode: N.state.mode,
          plevel: N.player.level, levels: N.wanted.pursuers.map((a) => a.level || null), wl: N.wanted.level,
        }));
        check('roof', r1.busted === 0 && !r1.busy, 'a chaser held right below the roof does not catch Chinnu (' + JSON.stringify(r1) + ')');
        check('roof', r1.levels.every((l) => l === null), 'pursuers stay on the ground (levels ' + JSON.stringify(r1.levels) + ')');
        // let him go: a foot chaser waits near the stair foot (or the mounted one stays below), still no catch
        await waitGame(page, 4);
        const r2 = await page.evaluate((st) => {
          const a = N.wanted.chaser;
          if (!a || !a.alive) return { gone: true, busted: window.__ev.filter((e) => e.n === 'busted').length };
          const m = a.mount && (a.vehicle === a.mount || a.passengerOf === a.mount);
          return { mounted: !!m, waiting: !!a.waitingBelow, dStair: Math.round(Math.hypot(a.x - st.x, a.y - st.y)), level: a.level || null, busted: window.__ev.filter((e) => e.n === 'busted').length, plevel: N.player.level };
        }, setup.st);
        check('roof', r2.busted === 0 && (r2.gone || r2.level === null), 'still no catch after 8 s on the roof', r2);
        if (!r2.gone && !r2.mounted && seen) check('roof', r2.waiting && r2.dStair < 60, 'the foot chaser waits by the stairs (' + r2.dStair + ' u from the stair foot)', r2);
        else note('chaser ' + (r2.gone ? 'gone' : 'is mounted') + ': the stairs wait applies to foot chasers');
        // the meter keeps dropping while he is up there (unseen)
        await page.evaluate(() => { N.world.roofs.descend(N.player, { instant: true }); N.debug.setWanted(0); });
      }
    }
    await settle(page);
  }

  /* ------------------------------------------------------------------ respect */
  if (want('respect')) {
    console.log('\n-- respect: pursuit pauses, traffic is quiet');
    await settle(page);
    const rz = await page.evaluate(() => {
      const z = (N.respect && N.respect.zones || []).find((q) => q.forecourt && q.forecourt.length && q.kind === 'temple');
      if (!z) return null;
      const f = z.forecourt[0];
      N.debug.setWanted(0); N.debug.setTime(11, 0);
      N.player.teleport(f[0] + f[2] / 2, f[1] + f[3] / 2);
      N.debug.setWanted(3);
      window.__ev.length = 0;
      return { id: z.id, x: N.player.x, y: N.player.y };
    });
    if (!rz) note('no temple respect zone with a forecourt in the data');
    else {
      await waitGame(page, 1);
      // put any pursuer right beside Chinnu: inside the zone they neither move nor grab
      const pos0 = await page.evaluate(() => {
        const p = N.player;
        for (const a of N.wanted.pursuers) { if (!(a.mount && (a.vehicle === a.mount || a.passengerOf === a.mount))) { a.x = p.x + 8; a.y = p.y; } }
        return N.wanted.pursuers.map((a) => [a.x, a.y]);
      });
      await waitGame(page, 4);
      const r = await page.evaluate((pos0) => ({
        inR: N.wanted.inRespect, lvl: N.wanted.level, busted: window.__ev.filter((e) => e.n === 'busted').length,
        moved: N.wanted.pursuers.map((a, i) => (pos0[i] ? Math.round(Math.hypot(a.x - pos0[i][0], a.y - pos0[i][1])) : 0)),
      }), pos0);
      check('respect', r.inR && r.lvl === 3, 'meter frozen at level 3 in the ' + rz.id + ' forecourt', r);
      check('respect', r.busted === 0, 'no grab inside the respect zone (' + pos0.length + ' pursuers)', r);
      check('respect', r.moved.every((d) => d <= 2), 'pursuers stand still while Chinnu is inside (moved ' + JSON.stringify(r.moved) + ')');
      await page.evaluate(() => { N.debug.setWanted(0); });
    }
    // traffic: a vehicle blocked by Chinnu honks on an ordinary road, not beside a respect zone
    const honkTest = async (quiet) => page.evaluate((quiet) => {
      const R = N.world.roads, T = N.traffic;
      const ok = (n) => n.links.length && T.quietAt(n.x, n.y) === quiet && !(N.respect.at(n.x, n.y)) &&
        n.links.some((l) => { const e = R.edges[l.edge]; const B = R.nodes[l.to]; return e && e.kind !== 'path' && e.len > 90 && T.quietAt((n.x + B.x) / 2, (n.y + B.y) / 2) === quiet && N.world.isDrivable(n.x + (B.x - n.x) * 0.5, n.y + (B.y - n.y) * 0.5); });
      const n = R.nodes.find((q) => ok(q) && (!quiet || q.links.every((l) => T.quietAt(R.nodes[l.to].x, R.nodes[l.to].y)) || true));
      if (!n) return null;
      const l = n.links.find((k) => { const e = R.edges[k.edge]; const B = R.nodes[k.to]; return e && e.kind !== 'path' && e.len > 90 && T.quietAt((n.x + B.x) / 2, (n.y + B.y) / 2) === quiet; });
      const B = R.nodes[l.to], L = Math.hypot(B.x - n.x, B.y - n.y), ux = (B.x - n.x) / L, uy = (B.y - n.y) / L;
      N.player.teleport(n.x + ux * 20, n.y + uy * 20);
      T.enabled = false; T.clear();
      // the city-life event director (citylife_events.js) warm-starts junction scenes by clearing ambient cars
      // nearby: hold it off so it can't take the test car (restored in done())
      if (N.citylifeEvents) { window.__cle = N.citylifeEvents.enabled; N.citylifeEvents.enabled = false; }
      const e = R.edges[l.edge], off = T.laneOffset(e, 0);
      const sx = n.x + ux * 22 + uy * off, sy = n.y + uy * 22 - ux * off;
      const v = T.spawnVehicle('maruti800', { x: sx, y: sy, to: B.id });
      if (!v) return { noVehicle: true };
      // Chinnu stands in its lane 34 u ahead
      N.player.teleport(sx + ux * 34, sy + uy * 34);
      N.player.vx = N.player.vy = 0;
      window.__ev.length = 0;
      window.__tv = v;
      return { node: n.id, id: v.id, quietAt: T.quietAt(sx, sy) };
    }, quiet);
    const done = async () => page.evaluate(() => {
      const v = window.__tv;
      const r = { honks: window.__ev.filter((e) => e.n === 'traffic:honk' && e.d && e.d.id === v.id).length, quiet: !!(v.tr && v.tr.quiet), cruise: v.tr ? Math.round(Math.abs(v.speed)) : -1, gap: Math.round(Math.hypot(v.x - N.player.x, v.y - N.player.y)), alive: v.alive !== false, st: v.tr && v.tr.state, blk: v.tr && v.tr.blocked };
      N.traffic.enabled = true;
      if (N.citylifeEvents && window.__cle != null) N.citylifeEvents.enabled = window.__cle;
      return r;
    });
    await page.evaluate(() => { N.debug.setTime(11, 0); });
    const q0 = await honkTest(false);
    if (!q0 || q0.noVehicle) fail('respect', 'could not set up the control honk test ' + JSON.stringify(q0));
    else {
      // hold Chinnu in place in the lane for 6 s of game time
      await page.evaluate(() => { const p = N.player, x = p.x, y = p.y; window.__pin = setInterval(() => { p.x = x; p.y = y; p.vx = p.vy = 0; }, 8); });
      await waitGame(page, 6);
      await page.evaluate(() => clearInterval(window.__pin));
      const c = await done();
      check('respect', c.honks > 0, 'control: a car blocked by Chinnu on an ordinary road honks (' + c.honks + ')', c);
    }
    const q1 = await honkTest(true);
    if (!q1 || q1.noVehicle) note('no road within ' + 40 + ' u of a respect zone to test (' + JSON.stringify(q1) + ')');
    else {
      await page.evaluate(() => { const p = N.player, x = p.x, y = p.y; window.__pin = setInterval(() => { p.x = x; p.y = y; p.vx = p.vy = 0; }, 8); });
      let maxSp = 0;
      for (let i = 0; i < 6; i++) { await waitGame(page, 1); maxSp = Math.max(maxSp, await page.evaluate(() => Math.abs(window.__tv.speed || 0))); }
      await page.evaluate(() => clearInterval(window.__pin));
      const c = await done();
      const cap = await page.evaluate(() => N.traffic.TUNE.respectCruise);
      check('respect', c.quiet, 'the car beside a respect zone knows it is quiet', c);
      check('respect', c.honks === 0, 'no honk beside a respect zone while blocked for 6 s', c);
      check('respect', maxSp <= cap + 6, 'it crawls past (max speed ' + Math.round(maxSp) + ' <= ' + cap + ')');
    }
    await page.evaluate(() => { N.traffic.enabled = true; N.traffic.fill(); });
  }

  /* ------------------------------------------------------------------ types */
  if (want('types')) {
    console.log('\n-- types: TYPES spawn weights, night rule, rider looks');
    const r = await page.evaluate(() => {
      const T = N.traffic, TY = N.vehicles.TYPES;
      const out = { reads: T.readsTypeWeights === true, patched: T.TUNE.mix.colony.hero_cycle != null };
      const day = T.typeWeights('colony', { kind: 'street', minutes: 720 });
      const night = T.typeWeights('colony', { kind: 'street', minutes: 60 });
      out.dayHero = day.hero_cycle; out.specHero = TY.hero_cycle && TY.hero_cycle.spawn.colony;
      out.dayHerc = day.hercules_cycle; out.specHerc = TY.hercules_cycle && TY.hercules_cycle.spawn.colony;
      out.dayScooty = day.scooty; out.specScooty = TY.scooty && TY.scooty.spawn.colony;
      out.pedalNight = {};
      for (const t in day) if (TY[t] && TY[t].pedal && day[t] > 0) out.pedalNight[t] = +(night[t] / day[t]).toFixed(3);
      out.scootyNight = night.scooty / day.scooty;
      // spawn distribution over many samples (the clock at noon, street edges)
      N.debug.setTime(12, 0);
      const W = T.typeWeights('colony', { kind: 'street' });
      let tot = 0; for (const k in W) tot += W[k];
      const n = 30000, cnt = {};
      for (let i = 0; i < n; i++) { const t = T.pickType('colony', 'street'); cnt[t] = (cnt[t] || 0) + 1; }
      out.dist = [];
      for (const k in W) {
        if (!(W[k] > 0)) continue;
        const pexp = W[k] / tot, pobs = (cnt[k] || 0) / n, sd = Math.sqrt(pexp * (1 - pexp) / n);
        out.dist.push({ k, pexp: +pexp.toFixed(4), pobs: +pobs.toFixed(4), z: +((pobs - pexp) / sd).toFixed(2) });
      }
      // live: raise the Scooty's colony weight and the share follows
      const keep = TY.scooty.spawn.colony;
      TY.scooty.spawn.colony = keep * 4;
      let c2 = 0; for (let i = 0; i < 20000; i++) if (T.pickType('colony', 'street') === 'scooty') c2++;
      TY.scooty.spawn.colony = keep;
      const W2 = Object.assign({}, W); W2.scooty = keep * 4; let tot2 = 0; for (const k in W2) tot2 += W2[k];
      out.live = { exp: +(W2.scooty / tot2).toFixed(4), obs: +(c2 / 20000).toFixed(4) };
      return out;
    });
    check('types', r.reads, 'N.traffic.readsTypeWeights = true');
    check('types', !r.patched, 'vehicles.js left TUNE.mix alone (no hero_cycle patched into it)');
    check('types', r.dayHero === r.specHero && r.dayHerc === r.specHerc && r.dayScooty === r.specScooty,
      'typeWeights(colony) uses TYPES[t].spawn: hero ' + r.dayHero + ', hercules ' + r.dayHerc + ', scooty ' + r.dayScooty, r);
    const bad = r.dist.filter((d) => Math.abs(d.z) > 4.5);
    check('types', bad.length === 0, 'spawn distribution over 30000 samples follows the weights (' + r.dist.length + ' types, worst |z| ' + Math.max(...r.dist.map((d) => Math.abs(d.z))).toFixed(2) + ')', bad);
    check('types', Math.abs(r.live.obs - r.live.exp) < 0.02, 'a changed TYPES.scooty.spawn weight is used live (share ' + r.live.obs + ' vs ' + r.live.exp + ')');
    const pn = r.pedalNight, newC = ['hero_cycle', 'hercules_cycle'].filter((t) => pn[t] != null);
    check('types', newC.length === 2 && newC.every((t) => Math.abs(pn[t] - 0.5) < 1e-6), 'night halves the Hero / Hercules cycles ' + JSON.stringify(pn));
    check('types', Math.abs(pn.cycle - 0.5) < 1e-6 && Math.abs(pn.ladiescycle - 0.3) < 1e-6 && Math.abs(r.scootyNight - 1) < 1e-6, 'night: cycle x0.5, ladies cycle x0.3, Scooty unchanged');

    // rider looks
    const looks = await page.evaluate(() => {
      const T = N.traffic, out = {};
      const run = (type, h, m) => {
        N.debug.setTime(h, m || 0);
        const kinds = {}, riders = {};
        for (let i = 0; i < 300; i++) { const L = T.driverLook(type, 'colony'); kinds[L.kind] = (kinds[L.kind] || 0) + 1; riders[L.rider || '-'] = (riders[L.rider || '-'] || 0) + 1; }
        return { kinds, riders };
      };
      for (const t of ['hero_cycle', 'hercules_cycle', 'scooty', 'akka_scooty']) {
        if (!N.vehicles.TYPES[t]) continue;
        out[t] = { dawn: run(t, 6, 30), day: run(t, 12), night: run(t, 23, 30) };
      }
      return out;
    });
    const hero = looks.hero_cycle;
    if (hero) {
      const allKinds = Object.assign({}, hero.dawn.kinds, hero.day.kinds, hero.night.kinds);
      check('types', !allKinds.kid && !allKinds.student, 'Hero cycle riders are grown men (kinds ' + JSON.stringify(allKinds) + ')');
      check('types', (hero.dawn.riders.milkman || 0) > 60 && (hero.day.riders.office || 0) > 60, 'Hero cycle: the milkman at dawn (' + (hero.dawn.riders.milkman || 0) + '/300), office-goers by day (' + (hero.day.riders.office || 0) + '/300)');
      check('types', !hero.day.riders['-'], 'every Hero rider has a role tag', hero.day.riders);
    }
    const herc = looks.hercules_cycle;
    if (herc) {
      const k = Object.assign({}, herc.day.kinds, herc.night.kinds);
      check('types', !k.kid && (herc.day.riders.office || 0) > 50, 'Hercules: office-goers and young men, no small kids (' + JSON.stringify(herc.day.riders) + ')');
      check('types', !herc.night.riders.student, 'no schoolboys on a Hercules at night');
    }
    for (const t of ['scooty', 'akka_scooty']) {
      const s = looks[t];
      if (!s) { if (t === 'scooty') fail('types', 'no scooty type'); continue; }
      const k = Object.assign({}, s.day.kinds, s.night.kinds);
      const male = Object.keys(k).filter((q) => q === 'man' || q === 'kid' || q === 'student' || q === 'uncle');
      check('types', male.length === 0 && (s.day.riders.college || 0) > 60, t + ': women and college girls (' + JSON.stringify(s.day.riders) + ', kinds ' + JSON.stringify(k) + ')');
    }
    // a spawned traffic Hero keeps traffic.js's rider look (vehicles.js does not restyle it)
    const sp = await page.evaluate(async () => {
      N.debug.setTime(12, 0);
      N.debug.teleport('home');
      const p = N.player, n = N.world.roads.nearestNode(p.x + 120, p.y);
      const v = N.traffic.spawnVehicle('hero_cycle', { x: n.x, y: n.y });
      if (!v) return null;
      const before = v.driver && v.driver.look && v.driver.look.rider;
      await Promise.resolve(); await new Promise((r) => setTimeout(r, 30));
      return { before, after: v.driver && v.driver.look && v.driver.look.rider };
    });
    if (!sp) note('could not spawn a traffic Hero cycle near home');
    else check('types', sp.before && sp.after === sp.before, 'a spawned traffic Hero keeps its rider look (' + sp.before + ')', sp);
  }

  const nerr = await page.evaluate(() => (N.errors || []).map((e) => e.where + ': ' + e.msg));
  for (const e of nerr) errors.push('N.err ' + e);
  console.log('\n== errors: ' + errors.length);
  for (const e of errors.slice(0, 10)) console.log('  ' + e);
  if (errors.length) failures.push('console/page errors: ' + errors.length);
  await context.close();
  await browser.close();
  console.log('\n' + (failures.length ? 'FAILED (' + failures.length + ')\n  ' + failures.join('\n  ') : 'ALL OK'));
  process.exit(failures.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(2); });
