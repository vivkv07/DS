/* NOSTALGIA — tests/steering.cjs  (entities.js E.steer: people look where they walk; traffic.js: back off, not through)
 * Headless Chromium, 2D. Staged encounters on open ground next to the player (steering works on screen only), with
 * test walkers that walk straight at a goal through N.entities.steer and the world's usual push-apart resolution:
 *  1. head-on: two walkers meet and pass without touching, each on its own left (keep left)
 *  2. a fast walker behind a slow one in the same line: no shove (it slows or goes round)
 *  3. a person standing in the way: walked round, never touched
 *  4. a parked car across the way: walked round its length (an oriented box, not a circle)
 *  5. the city: at busy junctions the moving people touching someone stay well under the old rate
 *  6. zero console errors, page errors and N.err
 *
 *   node nostalgia/tests/steering.cjs
 */
'use strict';
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 400) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// in the page: a test walker heads for (gx, gy) at `spd` through E.steer, like the city's walkers do
const STAGE = () => {
  const E = N.entities, U = N.util;
  class W extends N.Actor {
    constructor(o) { super(Object.assign({ kind: 'ped', r: 3.3, mass: 1, solid: true }, o)); this.minD = Infinity; this.path = []; }
    update(dt) {
      const dx = this.gx - this.x, dy = this.gy - this.y, d = Math.hypot(dx, dy);
      let vx = 0, vy = 0;
      if (d > 1.5 && !this.still) { vx = dx / d * this.spd; vy = dy / d * this.spd; }
      if ((vx || vy) && !this.blind) { const S = E.steer(this, vx, vy, dt, { arrive: d }); vx = S.x; vy = S.y; }
      const a = 1 - Math.exp(-dt * 8);
      this.vx += (vx - this.vx) * a; this.vy += (vy - this.vy) * a;
      const c = N.world.collide(this.x + this.vx * dt, this.y + this.vy * dt, this.r, 'walk');
      if (!c.bad) { this.x = c.x; this.y = c.y; }
      this.path.push([this.x, this.y]);
    }
    draw() {}
  }
  // an open patch near the player, clear of the city's own people and vehicles for the test
  const P = N.player, R = N.render;
  window.__W = W;
  window.__open = () => {
    for (let r = 140; r < 300; r += 40) for (let k = 0; k < 12; k++) { // clear of the player (he is a body too), still on screen
      const a = k / 12 * Math.PI * 2, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
      let okk = true;
      for (let gx = -60; gx <= 60 && okk; gx += 10) for (let gy = -30; gy <= 30 && okk; gy += 10) if (!N.world.isWalkable(x + gx, y + gy)) okk = false;
      if (okk && E.query(x, y, 90, (e) => e.kind !== 'prop').length === 0) return { x, y };
    }
    return null;
  };
  void R; void U;
};

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.goto(URL, { timeout: 180000 });
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await page.mouse.click(2, 2);
  await page.evaluate(() => { N.debug.newGame({ skipIntro: true }); N.debug.freezeClock(true); N.debug.god(true); if (N.dialogue) N.dialogue.skip = true; N.debug.setTime(3, 0); });
  await page.evaluate(STAGE);
  // a quiet place at 3 am: an open patch, the player parked off to the side
  const spot = await page.evaluate(() => {
    for (const id of ['parade_ground', 'necklace_road', 'lb_stadium', 'tank_bund', 'public_gardens']) {
      const q = N.places[id]; if (!q) continue;
      N.player.teleport(q.x, q.y); if (N.render.snapCamera) N.render.snapCamera();
      const o = window.__open(); if (o) return Object.assign({ place: id }, o);
    }
    return null;
  });
  check(!!spot, 'an open patch to stage the encounters', spot);
  if (!spot) { await browser.close(); process.exit(1); }
  await sleep(600);

  const run = (stage) => page.evaluate(async (stage) => {
    const E = N.entities, W = window.__W, o = window.__open() || { x: N.player.x, y: N.player.y - 180 };
    const ws = stage.walkers.map((w) => new W(Object.assign({ x: o.x + w.x, y: o.y + w.y, gx: o.x + w.gx, gy: o.y + w.gy, spd: w.spd || 36, still: !!w.still })));
    for (const w of ws) E.add(w);
    let car = null;
    if (stage.car) { car = N.vehicles.spawn(stage.car.type || 'maruti800', o.x + stage.car.x, o.y + stage.car.y, stage.car.a || 0); if (car) { car.tr = null; car.speed = 0; } }
    const t0 = performance.now();
    let minPair = Infinity, minCar = Infinity;
    const carDist = (w) => {
      const c = Math.cos(car.angle), s = Math.sin(car.angle), dx = w.x - car.x, dy = w.y - car.y;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c, hx = car.T.w / 2, hy = car.T.d / 2;
      const ex = Math.max(0, Math.abs(lx) - hx), ey = Math.max(0, Math.abs(ly) - hy);
      return Math.hypot(ex, ey) - w.r;
    };
    while (performance.now() - t0 < stage.ms) {
      await new Promise((r) => setTimeout(r, 50));
      for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) minPair = Math.min(minPair, Math.hypot(ws[i].x - ws[j].x, ws[i].y - ws[j].y) - ws[i].r - ws[j].r);
      if (car) for (const w of ws) if (!w.still) minCar = Math.min(minCar, carDist(w));
    }
    const out = ws.map((w) => ({ x: w.x - o.x, y: w.y - o.y, end: Math.hypot(w.gx - w.x, w.gy - w.y), side: null, path: w.path.filter((_, i) => i % 6 === 0).map(([x, y]) => [Math.round(x - o.x), Math.round(y - o.y)]) }));
    for (const w of ws) E.remove(w);
    if (car) N.vehicles.remove ? N.vehicles.remove(car) : (car.alive = false);
    return { minPair: +minPair.toFixed(2), minCar: car ? +minCar.toFixed(2) : null, out };
  }, stage);

  console.log('\n== 1. head-on');
  const h = await run({ ms: 4500, walkers: [{ x: -60, y: 0, gx: 60, gy: 0 }, { x: 60, y: 0, gx: -60, gy: 0 }] });
  // each passes on its own left: walking east (+x) the left is -y (up the map); walking west the left is +y
  const midY = (w) => { const p = w.path.reduce((b, q) => (Math.abs(q[0]) < Math.abs(b[0]) ? q : b), w.path[0]); return p[1]; };
  const ya = midY(h.out[0]), yb = midY(h.out[1]);
  check(h.minPair > 0, `two walkers meet head-on without touching (closest gap ${h.minPair} u)`, h);
  check(ya < 0 && yb > 0, `each passes on its own left (east-bound at y ${ya}, west-bound at y ${yb})`, { ya, yb });
  check(h.out.every((w) => w.end < 8), 'both reach their goals', h.out.map((w) => w.end));

  console.log('\n== 2. a fast walker behind a slow one');
  const f = await run({ ms: 4000, walkers: [{ x: -50, y: 0, gx: 70, gy: 0, spd: 14 }, { x: -75, y: 0, gx: 70, gy: 0, spd: 44 }] });
  check(f.minPair > -0.5, `the fast one slows or goes round, no shove (closest gap ${f.minPair} u)`, f.minPair);

  console.log('\n== 3. someone standing in the way');
  const s = await run({ ms: 4000, walkers: [{ x: 0, y: 0, gx: 0, gy: 0, still: true }, { x: -60, y: 0.5, gx: 60, gy: 0.5 }] });
  check(s.minPair > 0 && s.out[1].end < 8, `walked round the standing person (closest gap ${s.minPair} u) and on to the goal`, s);

  console.log('\n== 4. a parked car across the way');
  const c = await run({ ms: 5000, car: { x: 0, y: 0, a: Math.PI / 2 }, walkers: [{ x: -60, y: 2, gx: 60, gy: 2 }] });
  check(c.minCar != null && c.minCar > -0.5 && c.out[0].end < 10, `walked round the car's length (closest ${c.minCar} u from its body) and on`, c);

  console.log('\n== 5. the city');
  await page.evaluate(() => N.debug.setTime(10, 30));
  let touch = 0, ppl = 0;
  for (const place of ['abids', 'rtc_x_roads', 'charminar']) {
    await page.evaluate((pl) => { const q = N.places[pl]; N.player.teleport(q.x, q.y); if (N.render.snapCamera) N.render.snapCamera(); }, place);
    await sleep(4000);
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      const r = await page.evaluate(() => {
        const P = N.player, peo = N.entities.query(P.x, P.y, 420, (e) => e.alive && !e.hidden && (e.kind === 'ped' || e.kind === 'npc' || e.kind === 'animal') && !e.vehicle && !e.roofH && !e.level);
        const mv = (e) => Math.hypot(e.vx || 0, e.vy || 0) > 4;
        let t = 0;
        for (let i = 0; i < peo.length; i++) { const a = peo[i]; if (!mv(a)) continue; for (let j = 0; j < peo.length; j++) { if (j === i) continue; const b = peo[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r || 4) + (b.r || 4) + 0.6 && (j > i || !mv(b))) t++; } }
        return { t, n: peo.length };
      });
      touch += r.t; ppl += r.n;
    }
  }
  const per100 = touch / Math.max(1, ppl) * 100;
  check(per100 < 12, `busy junctions: ${per100.toFixed(1)} moving people touching someone per 100 people (was ~16 before steering)`, { touch, ppl });

  console.log('\n== 6. errors');
  const nerr = await page.evaluate(() => N.errors.map((e) => e.where + ': ' + String(e.msg).split('\n')[0]));
  check(errors.length === 0 && nerr.length === 0, 'no console / page / N.err errors', errors.concat(nerr).slice(0, 5));
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
