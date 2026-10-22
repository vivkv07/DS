/* NOSTALGIA — tests/breakers.cjs  (breakers.js: the speed breakers of 2003 Hyderabad)
 * Headless Chromium + SwiftShader WebGL (three.js served from vendor/ like tests/hills.cjs).
 *  1. placement: a few hundred, of every look (painted hump, plain tar hump, rumble strip) and reason (school,
 *     hospital, temple, mosque, church, market, home, colony); each strip on plain road, clear of junctions; the
 *     schools' humps in pairs either side of the gate; deterministic (a rebuild gives the same digest)
 *  2. riding over (a cycle, a Chetak, an Ambassador): gently = a lift and no penalty; fast = speed lost, the body
 *     launched and landed, DHADAK (severity), the camera shaken; through a colony hump's kerb gap = nothing; flat
 *     out on a cycle with the fall forced = he comes off when it lands
 *  3. traffic: limitAhead slows a driver for the hump on his way only (not one behind him or across the road), and
 *     a real AI car driven at a hump crosses it near its comfortable speed after cruising faster
 *  4. the cargo meters (story.js, story2.js, sidejobs.js) take a hard hit without errors
 *  5. screenshots + pixels: 2D (a school's painted pair, a colony tar hump with its gap, a rumble strip) and 3D
 *     (the same, and a cycle in the air over one): the yellow paint is on screen where the hump is; in first person
 *     the seat (the eye) rises over a hump
 *  6. zero console errors, page errors and N.err
 *   node nostalgia/tests/breakers.cjs        (SHOTS=0 skips the screenshots and the pixel checks)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out', 'breakers');
const URL = 'file://' + path.join(ROOT, 'index.html') + '#debug';
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const SHOTS = process.env.SHOTS !== '0';
fs.mkdirSync(OUT, { recursive: true });
const failures = [];
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m); };
const check = (cond, m, detail) => (cond ? ok(m) : fail(m + (detail !== undefined ? ' ' + JSON.stringify(detail).slice(0, 600) : '')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const gwait = (pg, s) => pg.evaluate((s) => window.__gw(s), s);

/** a minimal PNG reader (8-bit RGB / RGBA, not interlaced): {w, h, px(x, y) -> [r, g, b]} */
function readPng(file) {
  const buf = fs.readFileSync(file);
  let o = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, img = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[y * stride + x - bpp] : 0, b = y ? img[(y - 1) * stride + x] : 0, c = x >= bpp && y ? img[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      img[y * stride + x] = v & 255;
    }
  }
  return { w, h, px: (x, y) => { const i = (Math.round(y) * w + Math.round(x)) * bpp; return [img[i], img[i + 1], img[i + 2]]; } };
}
/** how many pixels in a box round (x, y) read as the hump's yellow paint */
function yellowAround(png, x, y, r) {
  let n = 0, tot = 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= png.w || Y >= png.h) continue;
    const [R, G, B] = png.px(X, Y); tot++;
    if (R > 140 && G > 100 && B < 0.6 * G && R > B + 70) n++;
  }
  return { n, tot };
}

async function main() {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(GW);
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
    N.debug.setTime(11, 0);
    N.vehicles.ageRules = false; // (he drives the Ambassador in section 2)
    window.__errs = []; const e0 = N.err; N.err = function (k, e) { window.__errs.push(k + ': ' + (e && e.message)); return e0.apply(this, arguments); };
  });
  await page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 30000 });

  console.log('\n== 1. placement');
  const d1 = await page.evaluate(() => {
    const B = N.breakers, st = B.stats(), S = N.SURF, W = N.world, RG = W.roads;
    let offRoad = 0, inJunction = 0, worst = null;
    const jn = RG.nodes.filter((n) => n.deg >= 3);
    for (const b of B.list) {
      for (const s of [-b.d / 2, 0, b.d / 2]) for (const q of [b.l0 + 0.5, (b.l0 + b.l1) / 2, b.l1 - 0.5]) if (W.surfaceAt(b.x + b.ux * s + b.nx * q, b.y + b.uy * s + b.ny * q) !== S.ROAD) offRoad++;
      // (a junction on a main road: arterialPad; with a street / bund arm (zebras, stop lines): junctionPad; lanes only: lanePad)
      for (const n of jn) {
        const zebra = n.inc.some((id) => !['lane', 'path', 'bridge'].includes(RG.edges[id].kind)), main = n.inc.some((id) => RG.edges[id].kind === 'arterial');
        const d = Math.hypot(n.x - b.x, n.y - b.y), need = n.w / 2 + (main ? B.TUNE.arterialPad : zebra ? B.TUNE.junctionPad : B.TUNE.lanePad) - 1;
        if (d < need) { inJunction++; worst = { b: b.id, d: Math.round(d), need, zebra }; }
      }
    }
    const schools = B.list.filter((b) => b.why === 'school');
    const reach = 2 * Math.max.apply(null, B.TUNE.pairTries) + 10;
    const paired = schools.filter((b) => schools.some((q) => q !== b && Math.hypot(q.x - b.x, q.y - b.y) < reach)).length;
    const h0 = B.hash(); B._build(); const h1 = B.hash();
    return { st, offRoad, inJunction, worst, schools: schools.length, paired, h0, h1, gaps: B.list.filter((b) => b.gap).length };
  });
  const st = d1.st;
  check(st.count >= 200 && st.count <= 700, `${st.count} speed breakers in the city (${Object.entries(st.byWhy).map((e) => e[0] + ' ' + e[1]).join(', ')})`, st);
  check(st.byKind.hump > 20 && st.byKind.tar > 20 && st.byKind.rumble > 2, `every look: painted humps ${st.byKind.hump}, plain tar humps ${st.byKind.tar} (${d1.gaps} with a kerb gap), rumble strips ${st.byKind.rumble}`, st.byKind);
  check(['school', 'hospital', 'temple', 'mosque', 'church', 'market', 'home', 'colony'].every((k) => st.byWhy[k] > 0), 'at schools, hospitals, temples, mosques, churches, markets, home and in the colonies', st.byWhy);
  check(d1.offRoad === 0, `every strip lies on plain road (${d1.offRoad} samples off it)`);
  check(d1.inJunction === 0, `none in a junction's mouth (${d1.inJunction})`, d1.worst);
  check(d1.paired >= 6, `the school gates' humps come in pairs where the road allows (${d1.paired} of ${d1.schools} have their partner; the rest have a junction or a dead end on one side)`);
  check(d1.h0 === d1.h1, `deterministic: a rebuild gives the same digest (${d1.h0})`);

  console.log('\n== 2. riding over');
  // (gently = severity <= 0.1: on the throttle between frames a vehicle can creep a little over its cap)
  // (the ride helper: the vehicle 70 u before the hump on its road, facing over it, held at `speed` up to 12 u before
  // it, then on the throttle with `speed` as a cap (cap = false: no cap), till 40 u past it. Returns the events (each
  // with the speed after the hit), the highest lift and pitch, whether he came off)
  await page.evaluate(() => {
    const B = N.breakers, S = N.SURF, W = N.world;
    const clear = (b) => { for (let s = -90; s <= 60; s += 6) for (const q of [-0.3, 0, 0.3]) { const l = (b.l0 + b.l1) / 2 + q * (b.l1 - b.l0) * 0.5; if (W.surfaceAt(b.x + b.ux * s + b.nx * l, b.y + b.uy * s + b.ny * l) !== S.ROAD) return false; } return true; };
    window.__pick = (f) => B.list.filter((b) => f(b) && clear(b)).sort((a, b) => (b.l1 - b.l0) - (a.l1 - a.l0))[0] || null;
    window.__ride = async (bid, type, speed, cap, lat, from) => {
      const b = B.list[bid], p = N.player;
      if (!p.vehicle || p.vehicle.type !== type) { if (p.vehicle) N.vehicles.exit(p, true); N.debug.enterVehicle(type); }
      const v = p.vehicle; if (!v) return { err: 'no vehicle' };
      // (the road clear: traffic, and the vehicles the earlier rides left parked on this approach)
      for (const q of N.traffic.vehicles.slice()) if (q !== v && q.alive && Math.hypot(q.x - b.x, q.y - b.y) < 260) { q.alive = false; if (N.entities.remove) N.entities.remove(q); }
      for (const q of N.vehicles.list.slice()) if (q !== v && q.alive && !q.driver && Math.hypot(q.x - b.x, q.y - b.y) < 160) { q.alive = false; if (N.entities.remove) N.entities.remove(q); }
      const l = lat != null ? lat : (b.l0 + b.l1) / 2, a = Math.atan2(b.uy, b.ux);
      const back = from || 70;
      v.x = b.x - b.ux * back + b.nx * l; v.y = b.y - b.uy * back + b.ny * l; v.angle = a; v.vx = b.ux * speed; v.vy = b.uy * speed; v.speed = speed; v.av = 0; v.jolt = 0;
      v._bkP = null; v.asleep = false; v.sleepT = 0;
      p.x = v.x; p.y = v.y; if (N.render.snapCamera) N.render.snapCamera();
      const ev = [], on = (d) => { if (d.vehicle === v) ev.push({ wheel: d.wheel, lead: d.lead, sev: +d.severity.toFixed(2), sp: Math.round(d.speed), post: Math.round(Math.abs(v.speed)), air: d.air, b: d.breaker.id }); };
      N.on('vehicle:breaker', on);
      let maxH = 0, maxP = 0, t = 0;
      // (in a 3D view input.js turns the stick by the camera's yaw, "up" = where the camera looks: undo that so the
      // stick points along the road whatever the camera does)
      const steer = (wx, wy) => {
        const V = N.view;
        if (V && V.is3D && V.is3D() && isFinite(V.yaw)) { const c = Math.cos(V.yaw), sn = Math.sin(V.yaw); N.input.setMove(-wx * sn + wy * c, -(wx * c + wy * sn), true); }
        else N.input.setMove(wx, wy, true);
      };
      while (t < 8) {
        const s = (v.x - b.x) * b.ux + (v.y - b.y) * b.uy;
        if (s < -12) { v.angle = a; v.vx = b.ux * speed; v.vy = b.uy * speed; v.speed = speed; v.av = 0; }
        else if (cap !== false && Math.abs(v.speed) > speed) { const k = speed / Math.abs(v.speed); v.vx *= k; v.vy *= k; v.speed *= k; }
        steer(b.ux, b.uy);
        await window.__gw(0.03); t += 0.03;
        if (!p.vehicle) break;
        maxH = Math.max(maxH, v.hump || 0); maxP = Math.max(maxP, Math.abs(v.humpPitch || 0));
        if ((v.x - b.x) * b.ux + (v.y - b.y) * b.uy > 40) break;
      }
      N.input.setMove(null);
      N.off('vehicle:breaker', on);
      return { ev, maxH: +maxH.toFixed(2), maxP: +maxP.toFixed(3), before: speed, fell: !p.vehicle, h: b.h, look: b.look };
    };
  });
  const hump = await page.evaluate(() => { const b = window.__pick((q) => q.look === 'hump' && !q.gap && q.why === 'colony'); return b && { id: b.id, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.l1 - b.l0), h: b.h }; });
  check(!!hump, 'a painted colony hump with a clear straight approach to ride over', hump);
  if (hump) {
    const slow = await page.evaluate((id) => window.__ride(id, 'hero_cycle', 18), hump.id);
    const lead = slow.ev.filter((e) => e.lead), trail = slow.ev.filter((e) => !e.lead), sl = lead[0];
    check(lead.length === 1 && trail.length === 1 && slow.ev.every((e) => e.sev <= 0.1) && !slow.fell, `a cycle over it gently (${slow.before} u/s): both wheels over the crest, severity 0, no fall`, slow);
    // (the body sits on its two wheels: one on the crest, the other on the road lifts it half the hump, pitched)
    check(slow.maxH > hump.h * 0.4 && slow.maxP > 0.04, `the body rides up over it: lift ${slow.maxH} (half the ${hump.h} hump with a wheel on its crest), pitch ${slow.maxP}`, slow);
    check(sl && sl.post >= sl.sp * 0.9, `gently costs little speed (${sl && sl.sp} -> ${sl && sl.post} u/s)`, slow);
    const fast = await page.evaluate((id) => window.__ride(id, 'hero_cycle', 110), hump.id);
    const fl = fast.ev.find((e) => e.lead);
    check(fl && fl.sev > 1 && fl.air, `flat out (${fast.before} u/s): DHADAK, severity ${fl && fl.sev}, the cycle launched`, fast);
    check(fast.maxH > slow.maxH, `in the air higher than the hump (${fast.maxH} vs ${slow.maxH} riding it gently)`, fast);
    const ch = await page.evaluate((id) => window.__ride(id, 'chetak', 95), hump.id);
    const cl = ch.ev.find((e) => e.lead);
    check(cl && cl.sev > 0.8 && cl.post < cl.sp * 0.85, `a Chetak at ${cl && cl.sp} u/s loses speed over it (${cl && cl.sp} -> ${cl && cl.post}), severity ${cl && cl.sev}`, ch);
    const car = await page.evaluate((id) => window.__ride(id, 'ambassador', 20), hump.id);
    check(car.ev.length === 2 && car.ev.every((e) => e.sev <= 0.1) && car.maxP > 0.02, `an Ambassador eased over it at ${car.before} u/s: two gentle crests, the nose up then down (pitch ${car.maxP})`, car);
  }
  const gapHump = await page.evaluate(() => { const b = window.__pick((q) => q.look === 'tar' && q.gap); return b && { id: b.id, gap: b.gap, l0: b.l0, l1: b.l1, half: b.half }; });
  check(!!gapHump, 'a colony tar hump with a kerb gap', gapHump);
  if (gapHump) {
    const lat = gapHump.gap > 0 ? gapHump.l1 + 1.8 : gapHump.l0 - 1.8;
    const thru = await page.evaluate(([id, lat]) => window.__ride(id, 'hero_cycle', 80, true, lat), [gapHump.id, lat]);
    check(thru.ev.length === 0 && thru.maxH === 0, `through the kerb gap at ${thru.before} u/s on a cycle: nothing (${thru.ev.length} hits)`, thru);
    const over = await page.evaluate((id) => window.__ride(id, 'hero_cycle', 80, true), gapHump.id);
    check(over.ev.length >= 1, `the same hump in the middle: ${over.ev.length} hits`, over);
  }
  if (hump) {
    const fall = await page.evaluate(async (id) => {
      N.debug.god(false); const T = N.breakers.TUNE, p0 = T.fallP; T.fallP = 1e3;
      const r = await window.__ride(id, 'hero_cycle', 115);
      T.fallP = p0; N.debug.god(true);
      await window.__gw(2.5);
      return Object.assign(r, { downT: N.player.downT > 0 || !N.player.vehicle });
    }, hump.id);
    check(fall.fell, `flat out with the fall forced: he comes off when it lands (*DHADAAM!*)`, fall);
  }

  console.log('\n== 3. traffic');
  const d3 = await page.evaluate(() => {
    const B = N.breakers, b = window.__pick((q) => q.kind === 'hump' && q.rkind !== 'arterial');
    if (!b) return null;
    const fake = (s, l, dir, cls) => ({ x: b.x + b.ux * s + b.nx * l, y: b.y + b.uy * s + b.ny * l, angle: Math.atan2(b.uy * dir, b.ux * dir), T: { w: 14, cls }, sid: 3 });
    const mid = (b.l0 + b.l1) / 2;
    const ahead = B.limitAhead(fake(-90, mid, 1, 'car'), 140); const a1 = ahead && { d: Math.round(ahead.d), sp: Math.round(ahead.sp) };
    const back = B.limitAhead(fake(-90, mid, -1, 'car'), 140);
    const past = B.limitAhead(fake(30, mid, 1, 'car'), 140);
    const cross = B.limitAhead({ x: b.x - b.nx * 60, y: b.y - b.ny * 60, angle: Math.atan2(b.ny, b.nx), T: { w: 14, cls: 'car' }, sid: 4 }, 140);
    const heavy = B.limitAhead(fake(-60, mid, 1, 'heavy'), 140);
    return { b: b.id, a1, back: !!back, past: !!past, cross: !!cross, heavy: heavy && Math.round(heavy.sp), comfy: B.TUNE.comfy };
  });
  check(d3 && d3.a1 && d3.a1.d > 70 && d3.a1.d < 90 && !d3.back && !d3.past && !d3.cross, `limitAhead: the hump 90 u ahead slows him (room ${d3 && d3.a1 && d3.a1.d}, at ${d3 && d3.a1 && d3.a1.sp} u/s); not one behind him, passed, or across his road`, d3);
  // a real AI car driven over a hump on its route
  const d3b = await page.evaluate(async () => {
    const B = N.breakers, S = N.SURF, W = N.world, tried = [];
    // a hump with 150 u of straight road before it (the car starts there heading over it: spawnVehicle picks the
    // road link that best matches the angle)
    const straight = (b) => { for (let s = -150; s <= 30; s += 10) if (W.surfaceAt(b.x + b.ux * s, b.y + b.uy * s) !== S.ROAD) return false; return true; };
    const cands = B.list.filter((q) => q.kind === 'hump' && q.rkind !== 'arterial' && straight(q));
    for (const b of cands.slice(0, 8)) {
      const x = b.x - b.ux * 150, y = b.y - b.uy * 150;
      N.player.teleport(b.x + b.nx * (b.half + 30), b.y + b.ny * (b.half + 30)); if (N.render.snapCamera) N.render.snapCamera();
      if (N.player.vehicle) N.vehicles.exit(N.player, true);
      const v = N.traffic.spawnVehicle('ambassador', { x, y, angle: Math.atan2(b.uy, b.ux) });
      if (!v) continue;
      // (the approach: its fastest in the 3 s before it reached whichever hump it crossed, but the last half second)
      let at = null, t = 0;
      const hist = [];
      const on = (d) => {
        if (d.vehicle !== v || !d.lead || at) return;
        const app = hist.filter((h) => h[0] > t - 3 && h[0] < t - 0.5).reduce((m, h) => Math.max(m, h[1]), 0);
        if (app < 5) return; // (it started on top of a hump: no run-up to judge)
        at = { sp: Math.round(d.speed), sev: +d.severity.toFixed(2), b: d.breaker.id, app: Math.round(app) };
      };
      N.on('vehicle:breaker', on);
      const track = [];
      while (t < 14 && !at) {
        await window.__gw(0.1); t += 0.1;
        const s = (v.x - b.x) * b.ux + (v.y - b.y) * b.uy, l = (v.x - b.x) * b.nx + (v.y - b.y) * b.ny;
        hist.push([t, Math.abs(v.speed || 0)]);
        if ((Math.round(t * 10) % 5) === 0) track.push([Math.round(s), Math.round(l), Math.round(v.speed || 0), v.kin ? 1 : 0]);
        if (!v.alive) break;
      }
      N.off('vehicle:breaker', on);
      if (at) return { b: b.id, at, comfy: B.comfyFor(v), k: v._bkA && +v._bkA.k.toFixed(2) };
      tried.push({ b: b.id, track: track.slice(0, 14), alive: v.alive });
      v.alive = false; if (N.entities.remove) N.entities.remove(v);
    }
    return { tried };
  });
  const aiOk = d3b && d3b.at && d3b.at.sp <= d3b.comfy * (d3b.k || 1) * 1.3 + 4 && (d3b.at.app - d3b.at.sp >= 4 || d3b.at.app <= d3b.comfy * (d3b.k || 1) * 1.3 + 4);
  check(aiOk, `an AI Ambassador coming in at ${d3b && d3b.at && d3b.at.app} u/s eases off and takes the hump at ${d3b && d3b.at && d3b.at.sp} (its comfortable ${d3b && d3b.comfy} x ${d3b && d3b.k}), severity ${d3b && d3b.at && d3b.at.sev}`, d3b);

  console.log('\n== 4. the cargo meters');
  const d4 = await page.evaluate(() => {
    // story.js / story2.js / sidejobs.js listen for 'vehicle:breaker' (a hard leading-wheel hit = a pothole's)
    const n0 = window.__errs.length, v = N.player.vehicle || N.debug.enterVehicle('hero_cycle');
    N.emit('vehicle:breaker', { vehicle: v, breaker: N.breakers.list[0], speed: 80, severity: 1.2, kind: 'hump', why: 'colony', wheel: 'front', lead: true, air: true, x: v.x, y: v.y, player: true });
    return { errs: window.__errs.length - n0 };
  });
  check(d4.errs === 0, 'the cargo meters take a hard hit without errors');

  console.log('\n== 5. screenshots + pixels');
  if (SHOTS) {
    const shot = async (name) => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, timeout: 240000 }); return f; };
    const pick = (f) => page.evaluate((f) => { const b = window.__pick(new Function('b', 'return ' + f)); return b && { id: b.id, x: b.x, y: b.y, ux: b.ux, uy: b.uy, nx: b.nx, ny: b.ny, a: b.a, l0: b.l0, l1: b.l1 }; }, f);
    const school = await pick("b.why === 'school' && b.paint === 'yb' && b.kind === 'hump'") || await pick("b.paint === 'yb' && b.kind === 'hump'");
    const tar = await pick("b.look === 'tar' && b.gap");
    const rumble = school ? await page.evaluate((s) => { const b = window.__pick((q) => q.kind === 'rumble' && Math.hypot(q.x - s.x, q.y - s.y) < 2600) || N.breakers.list.filter((q) => q.kind === 'rumble').sort((p, q) => Math.hypot(p.x - s.x, p.y - s.y) - Math.hypot(q.x - s.x, q.y - s.y))[0]; return b && { id: b.id, x: b.x, y: b.y, ux: b.ux, uy: b.uy, nx: b.nx, ny: b.ny, a: b.a, l0: b.l0, l1: b.l1 }; }, school) : await pick("b.kind === 'rumble'");
    const go2 = (b) => page.evaluate((b) => { if (N.player.vehicle) N.vehicles.exit(N.player, true); const m = (b.l0 + b.l1) / 2; N.player.teleport(b.x + b.nx * (b.l1 + 14), b.y + b.ny * (b.l1 + 14)); N.render.camOverride = { x: b.x + b.nx * m, y: b.y + b.ny * m, zoom: 3.2, snap: true }; if (N.render.snapCamera) N.render.snapCamera(); }, b);
    // (the 2D canvas draws at its own resolution, scaled up to the page: render.js sx / sy are canvas pixels)
    const scr2 = (b) => page.evaluate((b) => { const R = N.render, k = R.k(0), c = document.querySelector('canvas'), r = c.getBoundingClientRect(), m = (b.l0 + b.l1) / 2; const x = b.x + b.nx * m, y = b.y + b.ny * m; return { x: r.left + R.sx(x, k) * r.width / c.width, y: r.top + R.sy(y, k) * r.height / c.height }; }, b);
    await page.evaluate(() => { N.debug.setTime(11, 0); });
    if (school) {
      await go2(school); await gwait(page, 1.0);
      const f = await shot('2d_school_pair'); const p = await scr2(school); const y = yellowAround(readPng(f), p.x, p.y, 14);
      check(y.n > 6, `2D: the school hump's yellow stripes on screen where it lies (${y.n} of ${y.tot} pixels)`, p);
    }
    if (tar) { await go2(tar); await gwait(page, 1.0); await shot('2d_colony_tar_gap'); }
    if (rumble) { await go2(rumble); await gwait(page, 1.0); await shot('2d_rumble'); }
    await page.evaluate(() => { N.render.camOverride = null; N.debug.setTime(21, 0); });
    if (school) { await go2(school); await gwait(page, 1.0); await shot('2d_school_night'); }
    // 3D
    await page.evaluate(() => { N.render.camOverride = null; N.debug.setTime(11, 0); N.view3d.setQuality({ adaptive: false, pixelRatio: 1 }); N.view.set('tps'); });
    await page.waitForFunction(() => N.view.mode === 'tps' && N.view3d.ready, null, { timeout: 300000 });
    const go3 = async (b, back, side) => {
      await page.evaluate(([b, back, side]) => {
        if (N.player.vehicle) N.vehicles.exit(N.player, true);
        const m = (b.l0 + b.l1) / 2 + side;
        N.player.teleport(b.x - b.ux * back + b.nx * m, b.y - b.uy * back + b.ny * m);
        N.player.angle = N.player.facing = b.a;
        N.view3d.setCamera({ yaw: b.a, pitch: 0.22, snap: true }); N.view3d.settle(60000);
      }, [b, back, side]);
      await sleep(9000);
    };
    if (school) {
      await go3(school, 26, 4);
      const f = await shot('3d_school_hump');
      // (the ground in 3D is the terrain's height: terrain.js heightAt, 3D units)
      const p = await page.evaluate((b) => { const m = (b.l0 + b.l1) / 2, x = b.x + b.nx * m, y = b.y + b.ny * m, T = N.terrain; return N.view3d.project(x, y, (T && T.ready ? T.heightAt(x, y) : 0) + 0.5); }, school);
      const y = yellowAround(readPng(f), p.x, p.y, 40);
      check(p.visible && y.n > 20, `3D: the painted hump stands on the road in front of him (${y.n} yellow pixels round it)`, p);
    }
    if (tar) { await go3(tar, 24, 0); await shot('3d_colony_tar_gap'); }
    if (rumble) { await go3(rumble, 30, 0); await shot('3d_rumble'); }
    if (hump) {
      // a cycle in the air over a hump (the frame grabbed as it leaves the crest)
      await page.evaluate(async (id) => {
        const b = N.breakers.list[id];
        N.view3d.setCamera({ yaw: b.a + Math.PI / 2, pitch: 0.08, snap: true });
        window.__airRide = window.__ride(id, 'hero_cycle', 112);
        // (frozen in the page the moment the front wheel leaves the crest: N.time.scale 0 stops the simulation and the
        // view still draws; software GL draws a few frames a second, too few to catch the top of the hop reliably)
        window.__airShot = new Promise((res) => {
          const on = (d) => { if (d.vehicle !== N.player.vehicle || !d.air) return; N.off('vehicle:breaker', on); N.time.scale = 0; res(+(d.vehicle.humpPitch || 0).toFixed(3)); };
          N.on('vehicle:breaker', on); setTimeout(() => res(null), 300000);
        });
      }, hump.id);
      const pitch = await page.evaluate(() => window.__airShot);
      await sleep(2500);
      await shot('3d_cycle_over_hump');
      await page.evaluate(() => { N.time.scale = 1; });
      check(pitch != null && pitch > 0.03, `3D: the cycle leaving the crest flat out, nose up (pitch ${pitch})`);
      await sleep(3000);
    }
    if (hump) {
      // first person on the cycle, slowly over the hump: the eye (above the ground under the cycle) rises with the seat
      const fp = await page.evaluate(async (id) => {
        const b = N.breakers.list[id], E = N.view3d.engine, T = N.terrain;
        await window.__airRide; // (the flat-out ride for the shot above, done first)
        // (half resolution, from 26 u out at 20 u/s, still gently for a cycle: first person in software GL under load
        // draws a frame every few seconds)
        N.view3d.setQuality({ adaptive: false, pixelRatio: 0.5 });
        N.view.set('fps');
        let base = Infinity, hi = -Infinity, done = false, n = 0, rr = null;
        const near = [], track = [];
        window.__ride(id, 'hero_cycle', 20, true, null, 26).then((r) => { done = true; rr = r && { ev: r.ev.length, fell: r.fell, maxH: r.maxH, err: r.err }; });
        const t0 = performance.now();
        while (!done && performance.now() - t0 < 400000) {
          await new Promise((r) => requestAnimationFrame(r));
          const v = N.player.vehicle; if (!v || !E.camera) break;
          const h = E.camera.position.y - (T && T.ready ? T.heightAt(v.x, v.y) : 0);
          const sAt = (v.x - b.x) * b.ux + (v.y - b.y) * b.uy;
          if (track.length < 30) track.push([Math.round(sAt), Math.round(v.speed || 0), +(N.time.now % 1000).toFixed(1)]);
          // (the eye off the hump: both wheels on the road; on it: the body up more than a quarter)
          if ((v.hump || 0) < 0.02) base = Math.min(base, h);
          else { if (near.length < 12) near.push([Math.round(sAt), +(v.hump || 0).toFixed(2), +h.toFixed(2), Math.round(v.speed || 0)]); if ((v.hump || 0) > 0.25) { hi = Math.max(hi, h); n++; } }
        }
        N.view.set('tps'); N.view3d.setQuality({ adaptive: false, pixelRatio: 1 });
        return { base: +base.toFixed(2), hi: +hi.toFixed(2), rise: +(hi - base).toFixed(2), n, near, rr, track: track.filter((q, i) => i % 3 === 0) };
      }, hump.id);
      check(fp.n > 0 && fp.rise > 0.3, `first person: the seat rises over the hump (the eye ${fp.rise} up, ${fp.n} frames on it)`, fp);
    }
    await page.evaluate(() => N.view.set('top'));
  }

  console.log('\n== 6. errors');
  const errs = await page.evaluate(() => window.__errs);
  check(!errors.length && !errs.length, 'zero console errors, page errors and N.err', { errors: errors.slice(0, 5), errs: errs.slice(0, 5) });
  await browser.close();
  console.log(failures.length ? `\nBREAKERS FAILED (${failures.length}):\n` + failures.join('\n') : '\nBREAKERS PASSED');
  if (SHOTS) console.log('Screenshots: ' + OUT);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
