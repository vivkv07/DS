/* NOSTALGIA — world_extras.js (owned by the map maker)
 * Extra world data kinds from N.WORLD_DATA that world.js does not handle itself:
 *  - rails[] {id, name, pts, w}: mainline railway. Painted into the static ground chunks
 *    (ballast, sleepers, two steel rails; a girder deck where a line crosses water) and
 *    shown on the minimap / full map. Track cells stay GROUND (walkable, vehicles slowed);
 *    cells where a line crosses water become BRIDGE so you can walk the rail bridge.
 *  - level crossings: where a railway crosses a road we paint the crossing (rails over the
 *    asphalt, yellow/black warning bars) and add raised red/white boom posts as props.
 *
 * Hooks (installed at load time, no edits to core files):
 *  - wraps N.render.setGroundPainter: the painter that world.js installs in
 *    N.world.build() is composed with paintRails (runs after the base ground).
 *  - wraps N.world.renderMap (minimap / full map image) to draw the railway lines.
 *  - listens to 'world:built' to set BRIDGE cells and add the boom props.
 * Load order: after src/world.js, before src/main.js boots (index.html). Safe to omit.
 * Map v2 (world-engine agent): the rail geometry is re-prepared on every 'world:built' (a rebuild or a
 * different map), the over-water test reads the built surface grid (fast with real, many-vertex lake
 * and river polygons) and level crossings are box-filtered first. Works with any world size.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.render || !N.render.setGroundPainter) return;

  const GAUGE = 4;       // half distance between the two rails
  const SLEEPER = 5.5;   // sleeper spacing along the track
  let prepared = null;   // per-rail cached geometry

  function data() { return N.WORLD_DATA || {}; }

  function inPoly(x, y, poly) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  function segInter(a, b, c, d) {
    const r1x = b[0] - a[0], r1y = b[1] - a[1], r2x = d[0] - c[0], r2y = d[1] - c[1];
    const den = r1x * r2y - r1y * r2x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * r2y - (c[1] - a[1]) * r2x) / den;
    const u = ((c[0] - a[0]) * r1y - (c[1] - a[1]) * r1x) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t, u, x: a[0] + r1x * t, y: a[1] + r1y * t };
  }

  // Geometry: segments with bbox, water spans (for decks) and road crossings.
  function prepare() {
    if (prepared) return prepared;
    const D = data();
    const water = (D.water || []).map((w) => w.poly).filter((p) => p && p.length > 2);
    const wbb = water.map((p) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } return [x0, y0, x1, y1]; });
    // over water? the built surface grid when there is one (WATER, or BRIDGE where a road bridge
    // already crosses), else the water polygons
    const W = N.world, S = N.SURF;
    const useGrid = !!(W && W.built && W.grid && W.surfaceAt);
    const wetAt = (x, y) => {
      if (useGrid) { const sf = W.surfaceAt(x, y); return sf === S.WATER || (sf === S.BRIDGE && water.some((p, k) => x >= wbb[k][0] && x <= wbb[k][2] && y >= wbb[k][1] && y <= wbb[k][3] && inPoly(x, y, p))); }
      for (let k = 0; k < water.length; k++) { const b = wbb[k]; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inPoly(x, y, water[k])) return true; }
      return false;
    };
    const roads = (D.roads || []).filter((r) => r.kind !== 'path' && r.kind !== 'bridge' && r.pts && r.pts.length > 1).map((r) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of r.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
      return { rd: r, bb: [x0, y0, x1, y1] };
    });
    prepared = (D.rails || []).map((r) => {
      const segs = [];
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        // spans over water, sampled every 6 u
        const wet = [];
        let start = -1;
        for (let s = 0; s <= L + 0.01; s += 6) {
          const x = a[0] + ux * s, y = a[1] + uy * s;
          const isWet = wetAt(x, y);
          if (isWet && start < 0) start = Math.max(0, s - 14);
          if (!isWet && start >= 0) { wet.push([start, Math.min(L, s + 14)]); start = -1; }
        }
        if (start >= 0) wet.push([start, L]);
        const m = (r.w || 16) + 30;
        segs.push({ a, b, L, ux, uy, wet, bb: [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m] });
      }
      // level crossings with roads
      const xings = [];
      for (const sg of segs) {
        const sx0 = Math.min(sg.a[0], sg.b[0]), sx1 = Math.max(sg.a[0], sg.b[0]), sy0 = Math.min(sg.a[1], sg.b[1]), sy1 = Math.max(sg.a[1], sg.b[1]);
        for (const RB of roads) {
          const bb = RB.bb, rd = RB.rd;
          if (bb[2] < sx0 || bb[0] > sx1 || bb[3] < sy0 || bb[1] > sy1) continue;
          for (let k = 0; k < rd.pts.length - 1; k++) {
            const I = segInter(sg.a, sg.b, rd.pts[k], rd.pts[k + 1]);
            if (!I) continue;
            const p = rd.pts[k], q = rd.pts[k + 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
            xings.push({ x: I.x, y: I.y, rux: sg.ux, ruy: sg.uy, dux: (q[0] - p[0]) / l, duy: (q[1] - p[1]) / l, w: rd.w, road: rd.id });
          }
        }
      }
      return { rail: r, segs, xings };
    });
    return prepared;
  }

  // ------------------------------------------------------------ painting
  function paintRails(ctx, x0, y0, w, h) {
    const P = prepare();
    if (!P.length) return;
    const x1 = x0 + w, y1 = y0 + h;
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const R of P) {
      const hit = R.segs.filter((s) => s.bb[2] >= x0 && s.bb[0] <= x1 && s.bb[3] >= y0 && s.bb[1] <= y1);
      if (!hit.length) continue;
      const bw = R.rail.w || 16;
      // 1. girder decks over water
      for (const s of hit) {
        for (const [s0, s1] of s.wet) {
          const ax = s.a[0] + s.ux * s0, ay = s.a[1] + s.uy * s0, bx = s.a[0] + s.ux * s1, by = s.a[1] + s.uy * s1;
          ctx.strokeStyle = 'rgba(20,30,30,0.35)'; ctx.lineWidth = bw + 10;
          ctx.beginPath(); ctx.moveTo(ax + 3, ay + 4); ctx.lineTo(bx + 3, by + 4); ctx.stroke(); // shadow on the water
          ctx.strokeStyle = '#4c4a4e'; ctx.lineWidth = bw + 6;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.strokeStyle = '#6a676a'; ctx.lineWidth = bw;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          // truss cross-bracing on both edges
          ctx.strokeStyle = '#2f2e33'; ctx.lineWidth = 1.2;
          const nx = -s.uy, ny = s.ux, hw = bw / 2 + 2;
          ctx.beginPath();
          for (let d = s0; d < s1 - 6; d += 12) {
            for (const sd of [-1, 1]) {
              const px = s.a[0] + s.ux * d + nx * hw * sd, py = s.a[1] + s.uy * d + ny * hw * sd;
              ctx.moveTo(px, py); ctx.lineTo(px + s.ux * 6 + nx * 2 * sd, py + s.uy * 6 + ny * 2 * sd); ctx.lineTo(px + s.ux * 12, py + s.uy * 12);
            }
          }
          ctx.stroke();
        }
      }
      // 2. ballast bed (gravel), as one path
      ctx.beginPath();
      for (const s of hit) { ctx.moveTo(s.a[0], s.a[1]); ctx.lineTo(s.b[0], s.b[1]); }
      ctx.strokeStyle = 'rgba(60,45,35,0.35)'; ctx.lineWidth = bw + 3; ctx.stroke();
      ctx.strokeStyle = '#857a6c'; ctx.lineWidth = bw; ctx.stroke();
      ctx.setLineDash([1, 2, 2, 3]); ctx.strokeStyle = 'rgba(210,200,185,0.35)'; ctx.lineWidth = bw - 4; ctx.stroke();
      ctx.setLineDash([2, 3, 1, 4]); ctx.strokeStyle = 'rgba(50,40,30,0.30)'; ctx.lineWidth = bw - 2; ctx.stroke();
      ctx.setLineDash([]);
      // 3. sleepers
      ctx.beginPath();
      for (const s of hit) {
        const nx = -s.uy, ny = s.ux, half = GAUGE + 3;
        for (let d = 2; d < s.L; d += SLEEPER) {
          const cx = s.a[0] + s.ux * d, cy = s.a[1] + s.uy * d;
          if (cx < x0 - 12 || cx > x1 + 12 || cy < y0 - 12 || cy > y1 + 12) continue;
          ctx.moveTo(cx - nx * half, cy - ny * half); ctx.lineTo(cx + nx * half, cy + ny * half);
        }
      }
      ctx.strokeStyle = '#4b3a2c'; ctx.lineWidth = 2.2; ctx.stroke();
      // 4. the two steel rails (dark base, bright top)
      for (const [col, lw] of [['#2c2c31', 1.9], ['#c9ccd2', 1]]) {
        ctx.beginPath();
        for (const s of hit) {
          const nx = -s.uy, ny = s.ux;
          for (const sd of [-1, 1]) { ctx.moveTo(s.a[0] + nx * GAUGE * sd, s.a[1] + ny * GAUGE * sd); ctx.lineTo(s.b[0] + nx * GAUGE * sd, s.b[1] + ny * GAUGE * sd); }
        }
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
      }
      // 5. level crossings: warning bars across the road either side of the track
      for (const X of R.xings) {
        if (X.x < x0 - 60 || X.x > x1 + 60 || X.y < y0 - 60 || X.y > y1 + 60) continue;
        const nx = -X.duy, ny = X.dux; // across the road
        for (const sd of [-1, 1]) {
          const off = 14 * sd;
          const bx = X.x + X.dux * off, by = X.y + X.duy * off;
          const half = X.w / 2 - 2;
          for (let k = -half; k < half; k += 6) {
            ctx.strokeStyle = (Math.floor((k + half) / 6) % 2) ? '#1e1e22' : '#f2c230';
            ctx.lineWidth = 2.4;
            ctx.beginPath(); ctx.moveTo(bx + nx * k, by + ny * k); ctx.lineTo(bx + nx * Math.min(half, k + 6), by + ny * Math.min(half, k + 6)); ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ hooks
  const R = N.render;
  const origSet = R.setGroundPainter;
  R.setGroundPainter = function (fn) {
    if (typeof fn !== 'function') return origSet.call(R, fn);
    const composed = function (ctx, x0, y0, w, h) {
      fn(ctx, x0, y0, w, h);
      try { paintRails(ctx, x0, y0, w, h); } catch (e) { if (N.err) N.err('world_extras.paint', e); }
    };
    composed.base = fn;
    return origSet.call(R, composed);
  };

  function wrapRenderMap() {
    const W = N.world;
    if (!W || !W.renderMap || W.renderMap._rails) return;
    const orig = W.renderMap;
    const done = new WeakSet();
    W.renderMap = function (ppu) {
      const c = orig.apply(W, arguments);
      if (c && !done.has(c)) {
        done.add(c);
        try {
          const g = c.getContext('2d');
          const s = c.ppu || ppu || 0.1; // the image may be rendered below the asked scale (N.world.mapPPU)
          g.save(); g.setTransform(s, 0, 0, s, 0, 0);
          g.lineCap = 'round'; g.lineJoin = 'round';
          for (const r of data().rails || []) {
            g.beginPath(); g.moveTo(r.pts[0][0], r.pts[0][1]);
            for (let i = 1; i < r.pts.length; i++) g.lineTo(r.pts[i][0], r.pts[i][1]);
            g.strokeStyle = '#4a3a30'; g.lineWidth = Math.max(10, 2.2 / s); g.stroke();
            g.setLineDash([Math.max(8, 3 / s), Math.max(8, 3 / s)]);
            g.strokeStyle = '#e8e0d0'; g.lineWidth = Math.max(4, 1 / s); g.stroke();
            g.setLineDash([]);
          }
          g.restore();
        } catch (e) { if (N.err) N.err('world_extras.map', e); }
      }
      return c;
    };
    W.renderMap._rails = true;
  }
  wrapRenderMap();

  // Boom-barrier props (raised) at level crossings
  function drawBoom(ctx, s) {
    const D = N.draw;
    D.box(s.x - 1.5, s.y - 1.5, 3, 3, 0, 9, { wall: '#efe9dc', roof: '#d8402a' });
    D.box(s.x - 0.8, s.y - 0.8, 1.6, 1.6, 9, 26, { wall: '#d8402a', roof: '#f4efe4' });
  }
  function onBuilt(W) {
    W = W || N.world;
    try {
      wrapRenderMap();
      prepared = null; // a new build (maybe a new map): measure the rails again against it
      const P = prepare();
      const S = N.SURF, CELL = N.CELL, grid = W.grid, GW = W.GW, GH = W.GH;
      // rail bridges: water cells under a track become BRIDGE (walkable; boats still pass)
      if (grid) {
        for (const Rr of P) {
          for (const s of Rr.segs) {
            for (const [s0, s1] of s.wet) {
              for (let d = s0; d <= s1; d += CELL * 0.5) {
                const cx = s.a[0] + s.ux * d, cy = s.a[1] + s.uy * d;
                for (let o = -7; o <= 7; o += CELL * 0.5) {
                  const x = cx - s.uy * o, y = cy + s.ux * o;
                  const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
                  if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
                  if (grid[j * GW + i] === S.WATER) grid[j * GW + i] = S.BRIDGE;
                }
              }
            }
          }
        }
      }
      // booms at both road edges of every level crossing
      if (W.addStructure) {
        for (const Rr of P) {
          for (const X of Rr.xings) {
            for (const sd of [-1, 1]) {
              const nx = -X.duy, ny = X.dux;
              const x = X.x + X.dux * 16 * sd + nx * (X.w / 2 + 3) * sd, y = X.y + X.duy * 16 * sd + ny * (X.w / 2 + 3) * sd;
              W.addStructure({ t: 'custom', x0: x - 4, y0: y - 4, x1: x + 4, y1: y + 4, cx: x, cy: y, x, y, draw: drawBoom });
            }
          }
        }
      }
    } catch (e) { if (N.err) N.err('world_extras.built', e); }
  }
  if (N.on) N.on('world:built', onBuilt);
  if (N.world && N.world.built) onBuilt(N.world);

  N.worldExtras = { paintRails, prepare: () => prepare(), version: 1 };
})();
