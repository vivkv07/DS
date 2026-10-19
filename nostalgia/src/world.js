/* NOSTALGIA — world.js
 * Builds the world from N.WORLD_DATA: surface grid (collision), district lookup, road graph
 * (nodes at intersections, left-hand lanes), procedural generic buildings per district style,
 * trees, street lamps, Deccan boulders, the chunked ground painter and per-frame structure
 * enqueueing. Contract: ARCHITECTURE.md §7.
 * Roof zones (world-reconcile agent): walkable walled terraces with stairs and planked gaps
 * (WORLD_DATA.roofs / planks) -> N.world.roofs, N.player.level; podium junctions -> N.world.podiums.
 * Interactables and offers carry a level (spec.level = roof id | 'roof' | 'ground' | '*'; by default
 * the level of their point), see ARCHITECTURE §7 "Roof zones".
 * Map v2 (world-engine + potholes agent, amendments A1/A2):
 *  - Every grid / index is sized at build() time from the data: WORLD_DATA.size [w, h] when present
 *    (it then sets N.WORLD_W / N.WORLD_H), else N.WORLD_W / N.WORLD_H (worlddata.js may set them at
 *    its top). Works with the v1 8000 x 6000 map and the v2 real-geography map (15000 x 11250).
 *  - Districts may be polygons: `poly` ([[x, y], ...] or a list of rings) or `polys` ([{outer, holes}]
 *    or a list of rings); `rect` is the fallback. Rasterised on a 32 u lookup grid (later wins), small
 *    gaps between polygons go to the nearest district. N.world.districtLabel(d) -> [x, y].
 *  - Map v2 data as tools/geo/build_worlddata.cjs writes it: district rect (bbox) + poly + polys + holes,
 *    WORLD_DATA.districtGrid (the exact gap-free raster, used as is), road `pothole` hints.
 *  - Potholes (A2): deterministic per road segment, generated off the boot path (a few ms per frame),
 *    N.world.potholeAt(x, y) and N.world.potholes (see "Potholes" below and ARCHITECTURE §7 "Potholes").
 *  - Build speed for the bigger world: road graph on a segment hash, LUT fills, lazy roof items / tree
 *    canopies (Bldg / Tree classes), allocation-free nearest-road lookups; W.buildPhases / graphPhases.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const S = N.SURF;
  const CELL = N.CELL;
  const BK = 256; // structure / decal bucket size (= render chunk size)
  // grid sizes: computed in sizeGrids() at build time (the data decides the world size)
  let GW = 0, GH = 0, BW = 0, BH = 0;

  const W = (N.world = {
    GW, GH, grid: null, data: null, built: false,
    structures: [], trees: [], lamps: [], rocks: [], lots: [],
    roads: null, districts: [],
  });
  /** Size every grid from the data (WORLD_DATA.size) or N.WORLD_W / N.WORLD_H. */
  function sizeGrids(D) {
    const sz = D && D.size;
    if (Array.isArray(sz) && sz[0] > 0 && sz[1] > 0 && isFinite(sz[0]) && isFinite(sz[1])) { N.WORLD_W = +sz[0]; N.WORLD_H = +sz[1]; }
    GW = Math.ceil(N.WORLD_W / CELL); GH = Math.ceil(N.WORLD_H / CELL);
    BW = Math.ceil(N.WORLD_W / BK); BH = Math.ceil(N.WORLD_H / BK);
    DGW = Math.ceil(N.WORLD_W / DG); DGH = Math.ceil(N.WORLD_H / DG);
    W.GW = GW; W.GH = GH; W.size = [N.WORLD_W, N.WORLD_H];
  }

  let grid = null;

  /* ============================================================ surfaces */
  const BLOCK = {
    walk: new Uint8Array(16), drive: new Uint8Array(16), boat: new Uint8Array(16), ghost: new Uint8Array(16),
  };
  for (const s of [S.VOID, S.WATER, S.ROCK, S.SOLID]) { BLOCK.walk[s] = 1; BLOCK.drive[s] = 1; }
  for (let s = 0; s < 16; s++) BLOCK.boat[s] = s === S.WATER || s === S.BRIDGE ? 0 : 1;
  W.BLOCK = BLOCK;

  const SPEED = {
    drive: { [S.ROAD]: 1, [S.BRIDGE]: 1, [S.FOOTPATH]: 0.85, [S.PLAZA]: 0.85, [S.GROUND]: 0.7, [S.GRASS]: 0.6, [S.SAND]: 0.45 },
    walk: { [S.SAND]: 0.8, [S.GRASS]: 0.95 },
  };
  /** Speed multiplier of a surface for a movement mode (vehicles slow on grass/sand/dirt). */
  W.surfaceSpeed = (surf, mode) => { const t = SPEED[mode || 'drive']; const v = t && t[surf]; return v == null ? 1 : v; };

  function surfAt(x, y) {
    const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
    // written so NaN coordinates also land here (VOID = blocked), never on grid[NaN]
    if (!(i >= 0 && j >= 0 && i < GW && j < GH)) return S.VOID;
    return grid[j * GW + i];
  }
  W.surfaceAt = surfAt;
  W.isWalkable = (x, y) => !BLOCK.walk[surfAt(x, y)];
  W.isDrivable = (x, y) => !BLOCK.drive[surfAt(x, y)];
  W.isWater = (x, y) => surfAt(x, y) === S.WATER;

  /* -------------------------------------------------------- rasterising */
  // A surface rule is map(old) -> new surface or -1 to keep. It is turned into a 16-entry lookup
  // table once per fill (lut[old] = new | -1), so the per-cell work is one table read (the bigger
  // v2 world has ~10.5 M cells; a closure call per cell made the fills the slowest build phase).
  const LUT = new Int8Array(16);
  function lutOf(map) { for (let s = 0; s < 16; s++) { const v = map(s); LUT[s] = v >= 0 ? v : -1; } return LUT; }
  const alwaysCache = [];
  const always = (v) => alwaysCache[v] || (alwaysCache[v] = () => v);
  // fill cells i0..i1 of row j through the current LUT
  function spanLUT(j, i0, i1, lut) {
    if (j < 0 || j >= GH) return;
    if (i0 < 0) i0 = 0; if (i1 > GW - 1) i1 = GW - 1;
    const row = j * GW;
    for (let i = i0; i <= i1; i++) { const v = lut[grid[row + i]]; if (v >= 0) grid[row + i] = v; }
  }

  function fillRect(x, y, w, h, map) {
    const i0 = Math.max(0, Math.round(x / CELL)), i1 = Math.min(GW - 1, Math.round((x + w) / CELL) - 1);
    const j0 = Math.max(0, Math.round(y / CELL)), j1 = Math.min(GH - 1, Math.round((y + h) / CELL) - 1);
    if (i1 < i0 || j1 < j0) return;
    const lut = lutOf(map);
    for (let j = j0; j <= j1; j++) spanLUT(j, i0, i1, lut);
  }
  function fillCircle(x, y, r, map) {
    const lut = lutOf(map);
    const j0 = Math.floor((y - r) / CELL), j1 = Math.floor((y + r) / CELL);
    for (let j = j0; j <= j1; j++) {
      // cells whose centre is within r: |cx - x| <= sqrt(r² - dy²)
      const dy = (j + 0.5) * CELL - y, h2 = r * r - dy * dy;
      if (h2 < 0) continue;
      const hw = Math.sqrt(h2);
      spanLUT(j, Math.ceil((x - hw) / CELL - 0.5), Math.floor((x + hw) / CELL - 0.5), lut);
    }
  }
  function fillPoly(poly, map) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of poly) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const j0 = Math.max(0, Math.floor(minY / CELL)), j1 = Math.min(GH - 1, Math.floor(maxY / CELL));
    const xs = polyXs;
    const lut = lutOf(map);
    if (poly.length > 16) { fillPolyAET(poly, j0, j1, lut); return; }
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * CELL;
      let n = 0;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const ya = poly[a][1], yb = poly[b][1];
        if ((ya > y) !== (yb > y)) {
          // insertion sort as we go (rows cross a polygon edge a handful of times; Array#sort allocates)
          const x = poly[a][0] + ((y - ya) / (yb - ya)) * (poly[b][0] - poly[a][0]);
          let k = n++;
          while (k > 0 && xs[k - 1] > x) { xs[k] = xs[k - 1]; k--; }
          xs[k] = x;
        }
      }
      for (let k = 0; k + 1 < n; k += 2) spanLUT(j, Math.ceil(xs[k] / CELL - 0.5), Math.floor(xs[k + 1] / CELL - 0.5), lut);
    }
  }
  const polyXs = [];
  // fillPoly for big polygons (lakes, parks, rock areas: hundreds of vertices): each row tests only the
  // edges whose y range is near it (an active edge list) instead of every edge. The crossing test and the
  // crossing x are the same expressions on the same (a, b) vertex pairs, so the spans are identical.
  let aetE = new Float64Array(0), aetLo = new Int32Array(0), aetHi = new Int32Array(0), aetOrd = new Int32Array(0), aetAct = new Int32Array(0);
  function fillPolyAET(poly, j0, j1, lut) {
    const n = poly.length;
    if (aetLo.length < n) { aetE = new Float64Array(n * 4); aetLo = new Int32Array(n); aetHi = new Int32Array(n); aetOrd = new Int32Array(n); aetAct = new Int32Array(n); }
    const E = aetE, lo = aetLo, hi = aetHi, ord = aetOrd, act = aetAct;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const ya = poly[a][1], yb = poly[b][1];
      E[a * 4] = poly[a][0]; E[a * 4 + 1] = ya; E[a * 4 + 2] = poly[b][0]; E[a * 4 + 3] = yb;
      // rows this edge can cross, widened by a row each side (the exact test below decides)
      lo[a] = Math.floor(Math.min(ya, yb) / CELL) - 1; hi[a] = Math.floor(Math.max(ya, yb) / CELL) + 1;
      if (!(ya === ya && yb === yb)) { lo[a] = -1073741824; hi[a] = 1073741823; } // NaN: test it on every row, as before
      ord[a] = a;
    }
    // edges by first row (insertion sort: polygons are rings, mostly already in runs)
    for (let k = 1; k < n; k++) { const v = ord[k], l = lo[v]; let m = k; while (m > 0 && lo[ord[m - 1]] > l) { ord[m] = ord[m - 1]; m--; } ord[m] = v; }
    const xs = polyXs;
    let next = 0, na = 0;
    for (let j = j0; j <= j1; j++) {
      while (next < n && lo[ord[next]] <= j) act[na++] = ord[next++];
      const y = (j + 0.5) * CELL;
      let c = 0, w = 0;
      for (let q = 0; q < na; q++) {
        const a = act[q];
        if (hi[a] < j) continue; // finished: drop it
        act[w++] = a;
        const o = a * 4, ya = E[o + 1], yb = E[o + 3];
        if ((ya > y) !== (yb > y)) {
          const x = E[o] + ((y - ya) / (yb - ya)) * (E[o + 2] - E[o]);
          let k = c++;
          while (k > 0 && xs[k - 1] > x) { xs[k] = xs[k - 1]; k--; }
          xs[k] = x;
        }
      }
      na = w;
      for (let k = 0; k + 1 < c; k += 2) spanLUT(j, Math.ceil(xs[k] / CELL - 0.5), Math.floor(xs[k + 1] / CELL - 0.5), lut);
    }
  }
  // Thick polyline (a capsule per segment). Each row only visits the cells inside the segment's band
  // (|distance to the line| <= r, widened by a cell), not the segment's whole bounding box.
  function fillThickLine(pts, w, map, closed) {
    const r = w / 2, r2 = r * r;
    const n = closed ? pts.length : pts.length - 1;
    const lut = lutOf(map);
    for (let s = 0; s < n; s++) {
      const a = pts[s], b = pts[(s + 1) % pts.length];
      const ax = a[0], ay = a[1], dx = b[0] - ax, dy = b[1] - ay, l2 = dx * dx + dy * dy || 1, L = Math.sqrt(l2);
      const i0 = Math.max(0, Math.floor((Math.min(ax, b[0]) - r) / CELL)), i1 = Math.min(GW - 1, Math.floor((Math.max(ax, b[0]) + r) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(ay, b[1]) - r) / CELL)), j1 = Math.min(GH - 1, Math.floor((Math.max(ay, b[1]) + r) / CELL));
      // x range of the infinite band on a row: |(x - ax) * dy - (y - ay) * dx| / L <= r
      const steep = Math.abs(dy) > 1e-6;
      const half = steep ? Math.abs((r + CELL) * L / dy) : 0;
      for (let j = j0; j <= j1; j++) {
        const py = (j + 0.5) * CELL;
        let lo = i0, hi = i1;
        if (steep) {
          const xc = ax + ((py - ay) * dx) / dy;
          lo = Math.max(i0, Math.floor((xc - half) / CELL)); hi = Math.min(i1, Math.floor((xc + half) / CELL));
        }
        // the capsule is convex, so the cells inside it on this row are one run: find its two ends
        // with the per-cell test (from the outside in) and fill the run between them untested
        const row = j * GW, ey = py - ay;
        let a0 = lo, a1 = hi;
        for (; a0 <= hi; a0++) {
          const px = (a0 + 0.5) * CELL;
          let t = ((px - ax) * dx + ey * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t - px, qy = ay + dy * t - py;
          if (qx * qx + qy * qy <= r2) break;
        }
        if (a0 > hi) continue;
        for (; a1 > a0; a1--) {
          const px = (a1 + 0.5) * CELL;
          let t = ((px - ax) * dx + ey * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t - px, qy = ay + dy * t - py;
          if (qx * qx + qy * qy <= r2) break;
        }
        for (let i = row + a0, e = row + a1; i <= e; i++) { const v = lut[grid[i]]; if (v >= 0) grid[i] = v; }
      }
    }
  }
  // Is every cell whose centre is inside the rect one of the allowed surfaces?
  function rectAll(x, y, w, h, okSet) {
    const i0 = Math.max(0, Math.round(x / CELL)), i1 = Math.min(GW - 1, Math.round((x + w) / CELL) - 1);
    const j0 = Math.max(0, Math.round(y / CELL)), j1 = Math.min(GH - 1, Math.round((y + h) / CELL) - 1);
    if (i1 < i0 || j1 < j0) return false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (!okSet[grid[j * GW + i]]) return false;
    return true;
  }

  /* ========================================================== collision */
  /** Push a circle (x,y,r) out of blocked cells. mode: 'walk'|'drive'|'boat'|'ghost'. */
  W.collide = function (x, y, r, mode) {
    const blk = BLOCK[mode] || BLOCK.walk;
    let hit = false, nx = 0, ny = 0;
    if (!isFinite(x) || !isFinite(y)) return { x, y, hit: true, nx: 0, ny: 0, bad: true };
    for (let it = 0; it < 5; it++) {
      let best = 0, bx = 0, by = 0, inside = false;
      const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
      const j0 = Math.floor((y - r) / CELL), j1 = Math.floor((y + r) / CELL);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const s = i < 0 || j < 0 || i >= GW || j >= GH ? S.VOID : grid[j * GW + i];
          if (!blk[s]) continue;
          const x0 = i * CELL, y0 = j * CELL;
          const qx = x < x0 ? x0 : x > x0 + CELL ? x0 + CELL : x;
          const qy = y < y0 ? y0 : y > y0 + CELL ? y0 + CELL : y;
          const dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 < 1e-9) { inside = true; continue; }
          const d = Math.sqrt(d2), pen = r - d;
          if (pen > best) { best = pen; bx = dx / d; by = dy / d; }
        }
      }
      if (inside) {
        const f = W.findFree(x, y, mode, 14);
        if (f) {
          const fx = f.x - x, fy = f.y - y, fl = Math.hypot(fx, fy) || 1;
          nx = fx / fl; ny = fy / fl; x = f.x; y = f.y; hit = true; continue;
        }
        break;
      }
      if (best <= 0) break;
      x += bx * (best + 0.01); y += by * (best + 0.01);
      nx = bx; ny = by; hit = true;
    }
    return { x, y, hit, nx, ny };
  };

  /** Nearest free cell centre to (x,y) within maxCells (spiral search). */
  W.findFree = function (x, y, mode, maxCells) {
    const blk = BLOCK[mode] || BLOCK.walk;
    const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL);
    const m = maxCells || 40;
    for (let rad = 0; rad <= m; rad++) {
      let best = null, bd = Infinity;
      for (let j = cj - rad; j <= cj + rad; j++) {
        for (let i = ci - rad; i <= ci + rad; i++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad) continue;
          if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
          if (blk[grid[j * GW + i]]) continue;
          const px = (i + 0.5) * CELL, py = (j + 0.5) * CELL, d = (px - x) * (px - x) + (py - y) * (py - y);
          if (d < bd) { bd = d; best = { x: px, y: py }; }
        }
      }
      if (best) return best;
    }
    return null;
  };

  /** Ray march; returns {hit, x, y, t (0..1), surf}. */
  W.raycast = function (x0, y0, x1, y1, mode) {
    const blk = BLOCK[mode] || BLOCK.walk;
    const L = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(L / (CELL * 0.5)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const sf = surfAt(x, y);
      if (blk[sf]) return { hit: true, x, y, t, surf: sf };
    }
    return { hit: false, x: x1, y: y1, t: 1, surf: surfAt(x1, y1) };
  };

  /* ========================================================== districts */
  const DG = 32; // district lookup resolution
  let distMap = null;
  let DGW = 0, DGH = 0;
  const isPt = (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number';
  /** A district's area as [{outer: [[x, y]...], holes: [[[x, y]...]...]}] (poly / polys), or null (rect). */
  function districtRings(d) {
    if (d._rings !== undefined) return d._rings;
    const out = [];
    const addRing = (r) => { if (Array.isArray(r) && r.length >= 3 && isPt(r[0])) out.push({ outer: r, holes: [] }); };
    const addAny = (v) => {
      if (!Array.isArray(v) || !v.length) return;
      if (isPt(v[0])) { addRing(v); return; }                       // one ring
      for (const q of v) {
        if (q && !Array.isArray(q) && q.outer) out.push({ outer: q.outer, holes: (q.holes || []).filter((h) => Array.isArray(h) && h.length >= 3) });
        else if (Array.isArray(q) && q.length && isPt(q[0])) addRing(q); // list of rings
        else if (Array.isArray(q)) addAny(q);                       // nested (multipolygon)
      }
    };
    // Map v2 builder: `polys` lists every ring (the main one = `poly` too), `holes` the cut-outs
    if (d.polys) addAny(d.polys); else addAny(d.poly);
    if (out.length && Array.isArray(d.holes)) for (const h of d.holes) if (Array.isArray(h) && h.length >= 3 && isPt(h[0])) out[0].holes.push(h);
    d._rings = out.length ? out : null;
    return d._rings;
  }
  W.districtRings = districtRings;
  /** Bounding box [x0, y0, x1, y1] of a district (polygon or rect). */
  function districtBBox(d) {
    if (d._bbox) return d._bbox;
    const rings = districtRings(d);
    if (rings) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of rings) for (const p of r.outer) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      d._bbox = [x0, y0, x1, y1];
    } else if (d.rect) d._bbox = [d.rect[0], d.rect[1], d.rect[0] + d.rect[2], d.rect[1] + d.rect[3]];
    else d._bbox = [0, 0, 0, 0];
    return d._bbox;
  }
  W.districtBBox = districtBBox;
  // Scanline fill of polygon rings (even-odd, so holes cut out) on a grid of `cell` units:
  // cb(j, i0, i1) for every run of cells whose centres are inside.
  function scanRings(rings, cell, gw, gh, cb) {
    let minY = Infinity, maxY = -Infinity;
    const edges = [];
    for (const r of rings) for (const ring of [r.outer].concat(r.holes || [])) {
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const A = ring[a], B = ring[b];
        if (A[1] === B[1]) continue;
        edges.push(A[0], A[1], B[0], B[1]);
        if (A[1] < minY) minY = A[1]; if (A[1] > maxY) maxY = A[1];
      }
    }
    const j0 = Math.max(0, Math.floor(minY / cell)), j1 = Math.min(gh - 1, Math.floor(maxY / cell));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * cell;
      xs.length = 0;
      for (let k = 0; k < edges.length; k += 4) {
        const ya = edges[k + 1], yb = edges[k + 3];
        if ((ya > y) !== (yb > y)) xs.push(edges[k] + ((y - ya) / (yb - ya)) * (edges[k + 2] - edges[k]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil(xs[k] / cell - 0.5)), i1 = Math.min(gw - 1, Math.floor(xs[k + 1] / cell - 0.5));
        if (i1 >= i0) cb(j, i0, i1);
      }
    }
  }
  W.scanRings = scanRings;
  // WORLD_DATA.districtGrid = {cell, w, h, rle: [index, run, ...]} (Map v2 builder): the exact, gap-free
  // district raster (index into districts[], -1 = none). Used as is when it matches the lookup grid.
  function decodeDistrictGrid(G, n) {
    if (!G || G.cell !== DG || G.w !== DGW || G.h !== DGH || !Array.isArray(G.rle)) return false;
    let o = 0;
    for (let k = 0; k + 1 < G.rle.length; k += 2) {
      const v = G.rle[k], run = G.rle[k + 1];
      if (!(run > 0) || o + run > distMap.length) return false;
      if (v >= 0 && v < n) distMap.fill(v + 1, o, o + run);
      o += run;
    }
    return o === distMap.length;
  }
  function buildDistricts(list, grid) {
    distMap = new Uint16Array(DGW * DGH);
    for (const d of list) { d._rings = undefined; d._bbox = null; } // (re)read the shapes on every build
    if (grid && decodeDistrictGrid(grid, list.length)) { districtLabels(list); W.districtSource = 'grid'; return; }
    distMap.fill(0);
    W.districtSource = 'raster';
    list.forEach((d, idx) => {
      const rings = districtRings(d);
      if (rings) { scanRings(rings, DG, DGW, DGH, (j, i0, i1) => distMap.fill(idx + 1, j * DGW + i0, j * DGW + i1 + 1)); return; }
      if (!d.rect) return;
      const [x, y, w, h] = d.rect;
      const i0 = Math.max(0, Math.floor(x / DG)), i1 = Math.min(DGW - 1, Math.floor((x + w - 1) / DG));
      const j0 = Math.max(0, Math.floor(y / DG)), j1 = Math.min(DGH - 1, Math.floor((y + h - 1) / DG));
      for (let j = j0; j <= j1; j++) if (i1 >= i0) distMap.fill(idx + 1, j * DGW + i0, j * DGW + i1 + 1); // later wins
    });
    // polygon districts leave slivers between wards: cells within GAP_FILL cells of a district take
    // the nearest one (breadth-first dilation); the land beyond the city stays null
    if (list.some((d) => districtRings(d))) {
      let front = [];
      for (let o = 0; o < distMap.length; o++) if (distMap[o]) front.push(o);
      const GAP_FILL = 6;
      for (let step = 0; step < GAP_FILL && front.length; step++) {
        const next = [];
        for (const o of front) {
          const v = distMap[o], i = o % DGW, j = (o - i) / DGW;
          if (i > 0 && !distMap[o - 1]) { distMap[o - 1] = v; next.push(o - 1); }
          if (i < DGW - 1 && !distMap[o + 1]) { distMap[o + 1] = v; next.push(o + 1); }
          if (j > 0 && !distMap[o - DGW]) { distMap[o - DGW] = v; next.push(o - DGW); }
          if (j < DGH - 1 && !distMap[o + DGW]) { distMap[o + DGW] = v; next.push(o + DGW); }
        }
        front = next;
      }
    }
    districtLabels(list);
  }
  // label anchors: the district cell nearest to the centroid of its cells
  function districtLabels(list) {
    const sx = new Float64Array(list.length + 1), sy = new Float64Array(list.length + 1), sn = new Float64Array(list.length + 1);
    for (let o = 0; o < distMap.length; o++) { const v = distMap[o]; if (!v) continue; const i = o % DGW; sx[v] += i; sy[v] += (o - i) / DGW; sn[v]++; }
    list.forEach((d, idx) => {
      const v = idx + 1;
      d._cells = sn[v];
      if (!sn[v]) { const bb = districtBBox(d); d._label = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; return; }
      const ci = sx[v] / sn[v], cj = sy[v] / sn[v];
      let best = -1, bd = Infinity;
      const R = 40;
      for (let j = Math.max(0, Math.floor(cj - R)); j <= Math.min(DGH - 1, Math.ceil(cj + R)); j++) {
        for (let i = Math.max(0, Math.floor(ci - R)); i <= Math.min(DGW - 1, Math.ceil(ci + R)); i++) {
          if (distMap[j * DGW + i] !== v) continue;
          const dd = (i - ci) ** 2 + (j - cj) ** 2;
          if (dd < bd) { bd = dd; best = j * DGW + i; }
        }
      }
      if (best < 0) { d._label = [(ci + 0.5) * DG, (cj + 0.5) * DG]; return; }
      d._label = [((best % DGW) + 0.5) * DG, (Math.floor(best / DGW) + 0.5) * DG];
    });
  }
  W.districtAt = function (x, y) {
    if (!distMap) return null;
    const i = Math.floor(x / DG), j = Math.floor(y / DG);
    if (!(i >= 0 && j >= 0 && i < DGW && j < DGH)) return null;
    const v = distMap[j * DGW + i];
    return v ? W.districts[v - 1] || null : null;
  };
  /** Where to write a district's name: [x, y] inside it (the data's `label: [x, y]` if given). */
  W.districtLabel = function (d) {
    if (typeof d === 'string') d = W.districts.find((q) => q.id === d);
    if (!d) return null;
    if (isPt(d.label)) return d.label;
    if (d._label) return d._label;
    const bb = districtBBox(d);
    return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
  };
  /** The district polygon / rect as a canvas path (world units) on ctx g (no beginPath). */
  function districtPath(g, d) {
    const rings = districtRings(d);
    if (rings) {
      for (const r of rings) for (const ring of [r.outer].concat(r.holes || [])) {
        g.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]);
        g.closePath();
      }
    } else if (d.rect) g.rect(d.rect[0], d.rect[1], d.rect[2], d.rect[3]);
  }
  W.districtPath = districtPath;

  /* ========================================================== road graph */
  const FOOT = { arterial: 10, street: 7, bund: 9, lane: 0, bridge: 0, path: 0 };
  W.FOOT = FOOT;

  function cumLen(pts) {
    const c = [0];
    for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return c;
  }
  function segInter(a, b, c, d) {
    const r1x = b[0] - a[0], r1y = b[1] - a[1], r2x = d[0] - c[0], r2y = d[1] - c[1];
    const den = r1x * r2y - r1y * r2x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * r2y - (c[1] - a[1]) * r2x) / den;
    const u = ((c[0] - a[0]) * r1y - (c[1] - a[1]) * r1x) / den;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return { t, u, x: a[0] + r1x * t, y: a[1] + r1y * t };
  }

  function buildRoadGraph(roads) {
    const gp = (W.graphPhases = {}), gt0 = performance.now();
    let gt = gt0;
    const gmark = (k) => { const t = performance.now(); gp[k] = Math.round((t - gt) * 10) / 10; gt = t; };
    const nodes = [], edges = [];
    // node lookup grid (16 u cells) as typed per-cell lists in insertion order (head / tail / next),
    // sized to the roads' bounding box (+1 cell) once the points are final (see the 'nodes' pass)
    let NG0 = 0, NGJ0 = 0, NGW = 0, NGH = 0, nHead = null, nTail = null, nNext = new Int32Array(1024);
    const getNode = (x, y) => {
      const gx = Math.floor(x / 16), gy = Math.floor(y / 16);
      for (let j = gy - 1; j <= gy + 1; j++) {
        const rj = j - NGJ0;
        if (rj < 0 || rj >= NGH) continue;
        for (let i = gx - 1; i <= gx + 1; i++) {
          const ri = i - NG0;
          if (ri < 0 || ri >= NGW) continue;
          for (let id = nHead[rj * NGW + ri]; id >= 0; id = nNext[id]) { const n = nodes[id]; const ex = n.x - x, ey = n.y - y; if (ex * ex + ey * ey < 100) return n; }
        }
      }
      const n = { id: nodes.length, x, y, links: [], inc: [], deg: 0, w: 0 };
      nodes.push(n);
      if (n.id >= nNext.length) { const nn = new Int32Array(nNext.length * 2); nn.set(nNext); nNext = nn; }
      nNext[n.id] = -1;
      const c = (gy - NGJ0) * NGW + (gx - NG0);
      if (nHead[c] < 0) nHead[c] = n.id; else nNext[nTail[c]] = n.id;
      nTail[c] = n.id;
      return n;
    };
    const RR = roads.filter((r) => r.kind !== 'path' && r.pts && r.pts.length > 1).map((r) => {
      const pts = r.pts.map((p) => [p[0], p[1]]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      return { r, pts, cum: cumLen(pts), splits: [], bb: [x0, y0, x1, y1] };
    });
    for (const A of RR) A.pts.forEach((p, i) => A.splits.push({ d: A.cum[i], x: p[0], y: p[1] }));
    // Segment hash (64 u cells; each segment in the cells it passes through): the v2 map has ~3.6k roads
    // and ~15k segments, so the pairwise tests below only look at segments that share a cell.
    const HC = 64;
    const segBase = new Int32Array(RR.length + 1);
    for (let k = 0; k < RR.length; k++) segBase[k + 1] = segBase[k] + RR[k].pts.length - 1;
    const NSEG = segBase[RR.length];
    const segRoad = new Int32Array(NSEG);
    for (let k = 0; k < RR.length; k++) segRoad.fill(k, segBase[k], segBase[k + 1]);
    // The hash as flat arrays (CSR): cell c's segments are cellSeg[cellStart[c] .. cellStart[c + 1]),
    // global segment ids in insertion order (road, then segment), so every scan below sees the same
    // candidates in the same order as a Map of lists did, without ~40k small arrays per pass.
    let I0 = 0, J0 = 0, NI = 1, NJ = 1, cellStart = null, cellSeg = null;
    let tmpCell = new Int32Array(NSEG * 4), tmpSeg = new Int32Array(NSEG * 4);
    const cellOf = (i, j) => (i < I0 || j < J0 || i >= I0 + NI || j >= J0 + NJ ? -1 : (j - J0) * NI + (i - I0));
    const indexSegs = () => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const A of RR) for (const p of A.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      I0 = Math.floor(x0 / HC); J0 = Math.floor(y0 / HC); NI = Math.floor(x1 / HC) - I0 + 1; NJ = Math.floor(y1 / HC) - J0 + 1;
      const near2 = (HC * 0.7072 + 1) * (HC * 0.7072 + 1);
      let n = 0;
      for (let ai = 0; ai < RR.length; ai++) {
        const P = RR[ai].pts;
        for (let s = 0; s < P.length - 1; s++) {
          const a = P[s], b = P[s + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
          const i0 = Math.floor(Math.min(a[0], b[0]) / HC), i1 = Math.floor(Math.max(a[0], b[0]) / HC);
          const j0 = Math.floor(Math.min(a[1], b[1]) / HC), j1 = Math.floor(Math.max(a[1], b[1]) / HC);
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const cx = (i + 0.5) * HC, cy = (j + 0.5) * HC;
            let t = ((cx - a[0]) * dx + (cy - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = a[0] + dx * t - cx, qy = a[1] + dy * t - cy;
            if (qx * qx + qy * qy > near2) continue;
            if (n === tmpCell.length) { const c2 = new Int32Array(n * 2), s2 = new Int32Array(n * 2); c2.set(tmpCell); s2.set(tmpSeg); tmpCell = c2; tmpSeg = s2; }
            tmpCell[n] = (j - J0) * NI + (i - I0); tmpSeg[n] = segBase[ai] + s; n++;
          }
        }
      }
      // stable counting sort by cell
      const nc = NI * NJ;
      cellStart = new Int32Array(nc + 1);
      for (let k = 0; k < n; k++) cellStart[tmpCell[k] + 1]++;
      for (let c = 0; c < nc; c++) cellStart[c + 1] += cellStart[c];
      const fillAt = cellStart.slice(0, nc);
      cellSeg = new Int32Array(n);
      for (let k = 0; k < n; k++) cellSeg[fillAt[tmpCell[k]]++] = tmpSeg[k];
    };
    indexSegs();
    gmark('index');
    // T-junctions: endpoints lying on another road snap onto it (the nearest such segment)
    // snap tolerance per road in a typed array: the road data objects come in a dozen shapes, so `B.r.w`
    // in the inner loop is a megamorphic load
    let maxTol = 0;
    const rTol = new Float64Array(RR.length);
    for (let k = 0; k < RR.length; k++) { rTol[k] = RR[k].r.w / 2 + 6; maxTol = Math.max(maxTol, rTol[k]); }
    // every segment's end points, flat (ax, ay, bx, by per global segment id): the scan below reads
    // these instead of B.pts[sI][0] ...; kept in step with the snapped end points
    const segXY = new Float64Array(NSEG * 4);
    for (let k = 0; k < RR.length; k++) {
      const P = RR[k].pts;
      for (let s2 = 0, o = segBase[k] * 4; s2 < P.length - 1; s2++, o += 4) { segXY[o] = P[s2][0]; segXY[o + 1] = P[s2][1]; segXY[o + 2] = P[s2 + 1][0]; segXY[o + 3] = P[s2 + 1][1]; }
    }
    for (let ai = 0; ai < RR.length; ai++) {
      const A = RR[ai];
      for (let e2 = 0; e2 < 2; e2++) {
        const end = e2 ? A.pts.length - 1 : 0;
        const p = A.pts[end], px = p[0], py = p[1];
        let bi0 = -1, bs = 0, bt = 0, bd2 = Infinity, bx = 0, by = 0;
        for (let j = Math.floor((py - maxTol) / HC); j <= Math.floor((py + maxTol) / HC); j++) {
          for (let i = Math.floor((px - maxTol) / HC); i <= Math.floor((px + maxTol) / HC); i++) {
            const c = cellOf(i, j);
            if (c < 0) continue;
            for (let k = cellStart[c], ke = cellStart[c + 1]; k < ke; k++) {
              const gid = cellSeg[k], bi = segRoad[gid];
              if (bi === ai) continue;
              const o = gid * 4, ax = segXY[o], ay = segXY[o + 1];
              const dx = segXY[o + 2] - ax, dy = segXY[o + 3] - ay, l2 = dx * dx + dy * dy;
              let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
              const qx = ax + dx * t, qy = ay + dy * t, d2 = (qx - px) * (qx - px) + (qy - py) * (qy - py);
              const tol = rTol[bi];
              if (d2 <= tol * tol && d2 < bd2) { bd2 = d2; bi0 = bi; bs = gid - segBase[bi]; bt = t; bx = qx; by = qy; }
            }
          }
        }
        if (bi0 < 0) continue;
        const bB = RR[bi0];
        const segL = bB.cum[bs + 1] - bB.cum[bs];
        bB.splits.push({ d: bB.cum[bs] + segL * bt, x: bx, y: by });
        if (bd2 > 0.01) { // snap the endpoint onto the other road (unless it already is one of its points)
          p[0] = bx; p[1] = by;
          A.splits[end].x = bx; A.splits[end].y = by;
          const o = end ? (segBase[ai] + end - 1) * 4 + 2 : segBase[ai] * 4;
          segXY[o] = bx; segXY[o + 1] = by;
        }
      }
    }
    gmark('tjunctions');
    // proper crossings, once per segment pair (the hash again: snapping moved some endpoints)
    indexSegs();
    const seen = new Int32Array(NSEG);
    let stampS = 0;
    for (let ai = 0; ai < RR.length; ai++) {
      const A = RR[ai], P = A.pts;
      for (let s = 0; s < P.length - 1; s++) {
        const a0 = P[s], a1 = P[s + 1];
        stampS++;
        const i0 = Math.floor(Math.min(a0[0], a1[0]) / HC), i1 = Math.floor(Math.max(a0[0], a1[0]) / HC);
        const j0 = Math.floor(Math.min(a0[1], a1[1]) / HC), j1 = Math.floor(Math.max(a0[1], a1[1]) / HC);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const c = cellOf(i, j);
          if (c < 0) continue;
          for (let k = cellStart[c], ke = cellStart[c + 1]; k < ke; k++) {
            const gid = cellSeg[k], bi = segRoad[gid];
            if (bi <= ai) continue;
            const q = gid - segBase[bi];
            if (seen[gid] === stampS) continue;
            seen[gid] = stampS;
            const B = RR[bi];
            const I = segInter(a0, a1, B.pts[q], B.pts[q + 1]);
            if (!I) continue;
            A.splits.push({ d: A.cum[s] + (A.cum[s + 1] - A.cum[s]) * I.t, x: I.x, y: I.y });
            B.splits.push({ d: B.cum[q] + (B.cum[q + 1] - B.cum[q]) * I.u, x: I.x, y: I.y });
          }
        }
      }
    }
    gmark('crossings');
    {
      // every split lies on a road segment, so inside the points' bounding box
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const A of RR) for (const sp of A.splits) { if (sp.x < x0) x0 = sp.x; if (sp.x > x1) x1 = sp.x; if (sp.y < y0) y0 = sp.y; if (sp.y > y1) y1 = sp.y; }
      if (x0 <= x1) {
        NG0 = Math.floor(x0 / 16) - 1; NGJ0 = Math.floor(y0 / 16) - 1;
        NGW = Math.floor(x1 / 16) + 2 - NG0; NGH = Math.floor(y1 / 16) + 2 - NGJ0;
      }
      nHead = new Int32Array(NGW * NGH).fill(-1); nTail = new Int32Array(NGW * NGH);
    }
    for (const A of RR) {
      // stable insertion sort (same order as Array#sort): the splits are the road's own points, already
      // in order, plus a few junctions appended, so this is ~linear and allocates nothing
      const sp = A.splits;
      for (let k = 1; k < sp.length; k++) {
        const v = sp[k], d = v.d;
        let m = k;
        while (m > 0 && sp[m - 1].d > d) { sp[m] = sp[m - 1]; m--; }
        sp[m] = v;
      }
      let prev = null, prevD = -1e9;
      for (const sp of A.splits) {
        if (sp.d - prevD < 2 && prev) continue;
        const n = getNode(sp.x, sp.y);
        n.w = Math.max(n.w, A.r.w);
        if (prev && prev !== n) {
          const len = Math.hypot(n.x - prev.x, n.y - prev.y);
          const e = {
            id: edges.length, a: prev.id, b: n.id, road: A.r, kind: A.r.kind, w: A.r.w, len,
            oneway: !!A.r.oneway, lanes: A.r.w >= 48 ? 2 : 1, angle: Math.atan2(n.y - prev.y, n.x - prev.x),
          };
          edges.push(e);
          prev.links.push({ to: n.id, edge: e.id });
          if (!e.oneway) n.links.push({ to: prev.id, edge: e.id });
          prev.inc.push(e.id); n.inc.push(e.id);
          prev.deg++; n.deg++;
        }
        prev = n; prevD = sp.d;
      }
    }
    gmark('nodes');
    const api = makeRoadsAPI(nodes, edges, roads);
    gmark('api');
    return api;
  }

  // Accept a bare function (Math.random) or an N.util.rng(seed) object as a random source.
  const toRnd = (r) => (typeof r === 'function' ? r : r && typeof r.next === 'function' ? () => r.next() : Math.random);

  const ROUTE_COSTS = { lane: 1.15 };
  function makeRoadsAPI(nodes, edges, list) {
    const RT = {}; // route() scratch buffers, reused across calls (sized to the graph)
    const nb = new Map();
    for (const n of nodes) {
      const key = Math.floor(n.y / BK) * 1000 + Math.floor(n.x / BK);
      (nb.get(key) || nb.set(key, []).get(key)).push(n);
    }
    const api = {
      nodes, edges, list,
      isJunction: (n) => (typeof n === 'number' ? nodes[n] : n).deg >= 3,
      edgeBetween(a, b) {
        const A = typeof a === 'number' ? nodes[a] : a, bid = typeof b === 'number' ? b : b.id;
        for (const l of A.links) if (l.to === bid) return edges[l.edge];
        return null;
      },
      neighbors: (n) => (typeof n === 'number' ? nodes[n] : n).links.map((l) => nodes[l.to]),
      nearestNode(x, y, pred) {
        let best = null, bd = Infinity;
        const bi = Math.floor(x / BK), bj = Math.floor(y / BK);
        for (let rad = 0; rad < 40; rad++) {
          for (let j = bj - rad; j <= bj + rad; j++) for (let i = bi - rad; i <= bi + rad; i++) {
            if (Math.max(Math.abs(i - bi), Math.abs(j - bj)) !== rad) continue;
            const l = nb.get(j * 1000 + i); if (!l) continue;
            for (const n of l) {
              if (pred && !pred(n)) continue;
              const ex = n.x - x, ey = n.y - y, d = ex * ex + ey * ey;
              if (d < bd) { bd = d; best = n; }
            }
          }
          if (best && Math.sqrt(bd) < rad * BK) break;
        }
        return best;
      },
      /** Random walk along the graph without U-turns. Returns [node, node, ...]. opts: {rng, avoid:[kinds]} */
      randomRoute(fromNode, steps, opts) {
        opts = opts || {};
        const rnd = toRnd(opts.rng);
        let cur = typeof fromNode === 'number' ? nodes[fromNode] : fromNode;
        if (!cur) return [];
        const route = [cur];
        let prev = opts.prev != null ? (typeof opts.prev === 'number' ? opts.prev : opts.prev.id) : -1;
        for (let k = 0; k < (steps || 10); k++) {
          let opt = cur.links.filter((l) => l.to !== prev && !(opts.avoid && opts.avoid.indexOf(edges[l.edge].kind) >= 0));
          if (!opt.length) opt = cur.links.filter((l) => !(opts.avoid && opts.avoid.indexOf(edges[l.edge].kind) >= 0));
          if (!opt.length) break;
          const l = opt[Math.floor(rnd() * opt.length)];
          prev = cur.id; cur = nodes[l.to]; route.push(cur);
        }
        return route;
      },
      /**
       * Shortest route a -> b (nodes or ids) by A* with a binary heap: [node, ...] or null.
       * opts: {walk: true -> every incident edge (one-way rules ignored, like walkers and scripted drivers),
       *        else the traversable links; costs: {kind: factor} (default {lane: 1.15}); avoid: [kinds]
       *        ('path' is always avoided unless opts.paths); maxExpand: node budget (default: the whole graph)}.
       * Map v2 has ~15k nodes (v1: ~500): a cross-city route expands 2-8k of them in a few ms, so callers
       * should not cap it at a v1-sized budget or scan the open list linearly.
       */
      route(a, b, opts) {
        opts = opts || {};
        const A = typeof a === 'number' ? nodes[a] : a, B = typeof b === 'number' ? nodes[b] : b;
        if (!A || !B) return null;
        if (A === B) return [A];
        const n = nodes.length;
        if (!RT.g || RT.g.length < n) { RT.g = new Float64Array(n); RT.from = new Int32Array(n); RT.seen = new Uint32Array(n); RT.shut = new Uint32Array(n); RT.stamp = 0; }
        const g = RT.g, from = RT.from, seen = RT.seen, shut = RT.shut, st = ++RT.stamp;
        const costs = opts.costs || ROUTE_COSTS, avoid = opts.avoid, paths = !!opts.paths, walk = !!opts.walk;
        const maxExpand = opts.maxExpand || n;
        const hf = [], hi = []; // binary heap: f values / node ids
        const push = (f, id) => {
          let i = hf.length; hf.push(f); hi.push(id);
          while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hi[i] = hi[p]; i = p; }
          hf[i] = f; hi[i] = id;
        };
        const pop = () => {
          const top = hi[0], lf = hf.pop(), li = hi.pop(), m = hf.length;
          if (m) {
            let i = 0;
            for (;;) {
              const l = 2 * i + 1; if (l >= m) break;
              const c = l + 1 < m && hf[l + 1] < hf[l] ? l + 1 : l;
              if (hf[c] >= lf) break;
              hf[i] = hf[c]; hi[i] = hi[c]; i = c;
            }
            hf[i] = lf; hi[i] = li;
          }
          return top;
        };
        seen[A.id] = st; g[A.id] = 0; from[A.id] = -1;
        push(Math.hypot(B.x - A.x, B.y - A.y), A.id);
        let expanded = 0;
        while (hf.length) {
          const id = pop();
          if (shut[id] === st) continue;
          if (id === B.id) {
            const out = [];
            for (let c = id; c >= 0; c = from[c]) out.push(nodes[c]);
            RT.last = { expanded, len: g[id] };
            return out.reverse();
          }
          shut[id] = st;
          if (++expanded > maxExpand) break;
          const nd = nodes[id], gn = g[id];
          const list = walk ? nd.inc : nd.links;
          for (let k = 0; k < list.length; k++) {
            const e = edges[walk ? list[k] : list[k].edge];
            if ((e.kind === 'path' && !paths) || (avoid && avoid.indexOf(e.kind) >= 0)) continue;
            const to = walk ? (e.a === id ? e.b : e.a) : list[k].to;
            if (shut[to] === st) continue;
            const ng = gn + (e.len || 1) * (costs[e.kind] || 1);
            if (seen[to] !== st || ng < g[to]) {
              seen[to] = st; g[to] = ng; from[to] = id;
              const T = nodes[to];
              push(ng + Math.hypot(B.x - T.x, B.y - T.y), to);
            }
          }
        }
        RT.last = { expanded, len: Infinity };
        return null;
      },
      /** {expanded, len} of the last route() call (profiling / tests). */
      routeStats: () => RT.last || null,
      /** Offset from the centre line to lane `lane` (0 = inner) on the LEFT of travel. */
      laneOffset(edge, lane) {
        const lanes = edge.lanes || 1;
        return ((Math.min(lane || 0, lanes - 1) + 0.5) * (edge.w / 2)) / lanes;
      },
      /** Point t (0..1) along a->b, shifted into the left lane. Returns {x, y, angle}. */
      lanePoint(a, b, t, lane) {
        const A = typeof a === 'number' ? nodes[a] : a, B = typeof b === 'number' ? nodes[b] : b;
        const e = api.edgeBetween(A, B);
        const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1;
        const off = e ? api.laneOffset(e, lane) : 6;
        const ux = dx / l, uy = dy / l;
        return { x: A.x + dx * t + uy * off, y: A.y + dy * t - ux * off, angle: Math.atan2(dy, dx) };
      },
    };
    return api;
  }

  /** Nearest point on any road centre line: {x, y, dist, road, seg, t, angle}. */
  // Road segments bucketed on a 128u grid so nearest-road queries stay cheap.
  const SG = 64;
  let segGrid = null;
  function buildSegGrid(roads) {
    segGrid = new Map();
    for (const r of roads) {
      if (r.kind === 'path') continue;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const a = r.pts[s], b = r.pts[s + 1];
        const i0 = Math.floor(Math.min(a[0], b[0]) / SG), i1 = Math.floor(Math.max(a[0], b[0]) / SG);
        const j0 = Math.floor(Math.min(a[1], b[1]) / SG), j1 = Math.floor(Math.max(a[1], b[1]) / SG);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          // only cells the segment actually passes near
          const cx = (i + 0.5) * SG, cy = (j + 0.5) * SG;
          const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
          let t = ((cx - a[0]) * dx + (cy - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = a[0] + dx * t - cx, qy = a[1] + dy * t - cy;
          if (qx * qx + qy * qy > SG * SG * 0.6) continue;
          const key = j * 4096 + i;
          let l = segGrid.get(key);
          if (!l) segGrid.set(key, (l = { rs: [], xy: [] }));
          l.rs.push(r, s); l.xy.push(a[0], a[1], b[0], b[1]);
        }
      }
    }
  }
  /** Nearest point on any road centre line: {x, y, dist, road, seg, t, angle} (null if none). */
  W.nearestRoadPoint = function (x, y, pred) {
    if (!nearestRoad(x, y, pred)) return null;
    const a = NR.road.pts[NR.seg], b = NR.road.pts[NR.seg + 1];
    return { x: NR.x, y: NR.y, dist: NR.dist, road: NR.road, seg: NR.seg, t: NR.t, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  // allocation-free core: fills NR and returns true when a road was found
  const NR = { x: 0, y: 0, dist: 0, road: null, seg: 0, t: 0 };
  function nearestRoad(x, y, pred) {
    if (!segGrid) buildSegGrid(W.data.roads || []);
    if (!isFinite(x) || !isFinite(y)) return false;
    const ci = Math.floor(x / SG), cj = Math.floor(y / SG);
    let bd2 = Infinity, br = null, bs = 0, bt = 0, bx = 0, by = 0;
    const maxRing = Math.ceil(Math.max(N.WORLD_W, N.WORLD_H) / SG);
    // after scanning ring r, every segment within r * SG + (distance to the own cell's edge) was seen
    const edge = Math.min(x - ci * SG, (ci + 1) * SG - x, y - cj * SG, (cj + 1) * SG - y);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let j = cj - ring; j <= cj + ring; j++) {
        const rowEdge = j === cj - ring || j === cj + ring;
        for (let i = ci - ring; i <= ci + ring; i += rowEdge || !ring ? 1 : 2 * ring) {
          const cell = segGrid.get(j * 4096 + i);
          if (!cell) continue;
          // the segment end points are read from the cell's own flat copy (xy: ax, ay, bx, by per
          // entry), not through r.pts (road objects come in many shapes: a megamorphic load each)
          const l = cell.rs, xy = cell.xy;
          for (let k = 0; k < l.length; k += 2) {
            const r = l[k];
            if (pred && !pred(r)) continue;
            const o = k * 2, ax = xy[o], ay = xy[o + 1];
            const dx = xy[o + 2] - ax, dy = xy[o + 3] - ay, l2 = dx * dx + dy * dy || 1;
            let t = ((x - ax) * dx + (y - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = ax + dx * t, qy = ay + dy * t, d2 = (qx - x) * (qx - x) + (qy - y) * (qy - y);
            if (d2 < bd2) { bd2 = d2; br = r; bs = l[k + 1]; bt = t; bx = qx; by = qy; }
          }
        }
      }
      // anything in a further ring is farther than ring * SG + edge
      if (br && Math.sqrt(bd2) <= ring * SG + edge) break;
    }
    if (!br) return false;
    NR.x = bx; NR.y = by; NR.dist = Math.sqrt(bd2); NR.road = br; NR.seg = bs; NR.t = bt;
    return true;
  }

  /** A random point on a road (centre line), optionally filtered by road kind. */
  W.randomRoadPoint = function (rnd, kinds) {
    rnd = toRnd(rnd);
    const roads = (W.data.roads || []).filter((r) => r.kind !== 'path' && (!kinds || kinds.indexOf(r.kind) >= 0));
    if (!roads.length) return null;
    const r = roads[Math.floor(rnd() * roads.length)];
    const s = Math.floor(rnd() * (r.pts.length - 1)), t = rnd();
    const a = r.pts[s], b = r.pts[s + 1];
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, road: r, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };

  /* ===================================================== structure index */
  let buckets = null, decals = null, stamp = 0;
  function addStructure(s) {
    s.id = W.structures.length;
    if (s.cx == null) { s.cx = (s.x0 + s.x1) / 2; s.cy = (s.y0 + s.y1) / 2; }
    W.structures.push(s);
    const i0 = Math.max(0, Math.floor(s.x0 / BK)), i1 = Math.min(BW - 1, Math.floor(s.x1 / BK));
    const j0 = Math.max(0, Math.floor(s.y0 / BK)), j1 = Math.min(BH - 1, Math.floor(s.y1 / BK));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * BW + i].push(s);
    s.fn = null; // draw closure, made the first time the structure is queued (sfn)
    s.stamp = 0;
    return s;
  }
  const sfn = (s) => s.fn || (s.fn = (ctx) => DRAW[s.t](ctx, s));
  /** Add a custom structure: {t:'custom', x0,y0,x1,y1, cx?, cy?, draw(ctx, s), cast?(s)} */
  W.addStructure = function (s) {
    if (s.t === 'custom' && typeof s.draw === 'function') DRAW.custom = DRAW.custom || ((ctx, st) => st.draw(ctx, st));
    return addStructure(s);
  };
  function addDecalRect(d, x, y, w, h) {
    const i0 = Math.max(0, Math.floor(x / BK)), i1 = Math.min(BW - 1, Math.floor((x + w) / BK));
    const j0 = Math.max(0, Math.floor(y / BK)), j1 = Math.min(BH - 1, Math.floor((y + h) / BK));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) decals[j * BW + i].push(d);
  }
  /** Iterate structures overlapping a rect (each once). */
  W.queryStructures = function (x0, y0, x1, y1, fn) {
    stamp++;
    const i0 = Math.max(0, Math.floor(x0 / BK)), i1 = Math.min(BW - 1, Math.floor(x1 / BK));
    const j0 = Math.max(0, Math.floor(y0 / BK)), j1 = Math.min(BH - 1, Math.floor(y1 / BK));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (const s of buckets[j * BW + i]) {
        if (s.stamp === stamp) continue; s.stamp = stamp;
        if (s.x1 < x0 || s.x0 > x1 || s.y1 < y0 || s.y0 > y1) continue;
        fn(s);
      }
    }
  };

  /* ========================================================== palettes */
  const STY = {
    oldcity: { walls: ['#e8d9b5', '#efe9dc', '#d9c7a0', '#9fc4d4', '#cdd5de', '#e6b8b0', '#e8d070', '#b8d0c8', '#e8c0b0', '#b8d4a0', '#efe9dc', '#d8a8b8'], roofs: ['#b9ad98', '#a8a092', '#cfc3ac', '#9c9284', '#c8b896', '#b0604a', '#8f877c'], trim: '#f4efe4', lotMin: 16, lotMax: 32, lane: 8, laneP: 0.14, emptyP: 0.03 },
    market: { walls: ['#e8d9b5', '#efe9dc', '#e6cfc0', '#9fc4d4', '#cdd5de', '#f0d890', '#e8b4b8', '#b8d4a0'], roofs: ['#b9ad98', '#a8a092', '#cfc3ac', '#9c9284', '#c8b896', '#8f877c'], trim: '#f4efe4', lotMin: 14, lotMax: 28, lane: 8, laneP: 0.10, emptyP: 0.02 },
    colony: { walls: ['#e8b4b8', '#a8d0c8', '#b8c8e8', '#f0d890', '#d8b0d8', '#f2c6a0', '#efe9dc', '#c8e0a8', '#f4d0c0', '#e0e8f0'], roofs: ['#c9bfb0', '#bdb2a2', '#c7b9a6', '#b9a48f', '#a85a44', '#cfc4b2'], trim: '#f4efe4', lotMin: 24, lotMax: 40, lane: 6, laneP: 0.08, emptyP: 0.07 },
    posh: { walls: ['#f3efe6', '#e8e0cc', '#f0e6d0', '#e6e6e0', '#f2e2c8'], roofs: ['#b8b0a0', '#a85a44', '#c6bba8', '#9a5040'], trim: '#ffffff', lotMin: 56, lotMax: 96, lane: 0, laneP: 0, emptyP: 0.12 },
    colonial: { walls: ['#a5543f', '#b0603f', '#c4ad84', '#d2c09a', '#9a4a38', '#e8d9b5'], roofs: ['#8f8577', '#a39684', '#7f7468', '#b0a490'], trim: '#efe9dc', lotMin: 50, lotMax: 100, lane: 8, laneP: 0.3, emptyP: 0.14 },
    cantonment: { walls: ['#d8c39a', '#e0d0b0', '#cfb88a', '#efe9dc'], roofs: ['#a24b32', '#b0583a', '#8f4030', '#9a4a36'], trim: '#efe9dc', lotMin: 60, lotMax: 130, lane: 10, laneP: 0.4, emptyP: 0.3 },
    hitec: { walls: ['#3f7f96', '#4f8fa6', '#5a9ab0', '#356d84', '#6a8a9a'], roofs: ['#b8b4ac', '#a8a49c', '#c4c0b8'], trim: '#d8dde0', lotMin: 80, lotMax: 170, lane: 12, laneP: 0.4, emptyP: 0.62 },
    rocky: { walls: ['#efe9dc', '#e0d4bc', '#d8c8b0', '#e8c8a8'], roofs: ['#c0b4a0', '#b8a890', '#c8bca8'], trim: '#f4efe4', lotMin: 30, lotMax: 60, lane: 6, laneP: 0.2, emptyP: 0.66 },
  };
  W.STYLES = STY;

  const SIGNS = [
    'SRI SAI KIRANA', 'LAKSHMI TEXTILES', 'NEW STAR TAILORS', 'BALAJI STORES', 'AMBIKA FANCY', 'RAJ BANGLES',
    'MOHAN CYCLE WORKS', 'SRI RAMA MEDICALS', 'DECCAN BAKERY', 'STD ISD PCO', 'XEROX', 'VIDEO PARLOUR', 'PAAN SHOP',
    'TIFFIN CENTRE', 'OPTICALS', 'WATCH CO', 'RADIO REPAIRS', 'CHUDI BAZAAR', 'ATTAR HOUSE', 'FRUIT JUICE', 'SWEET HOUSE',
    'PHOTO STUDIO', 'CASSETTE CORNER', 'BOOK DEPOT', 'STEEL PALACE', 'HARDWARE', 'SAREE KENDRA', 'LUCKY TAILORS',
    'NEW IRANI CAFE', 'PINDI GIRNI', 'STATIONERY', 'GENERAL STORES', 'TV REPAIRS', 'BATA STYLE', 'SHOE MART',
    'KIDS CORNER', 'TOY HOUSE', 'LENDING LIBRARY', 'MUTTON SHOP', 'PAN & BEEDA', 'HOTEL SHALIMAR', 'SODA',
  ];
  const SHORT_SIGNS = ['PAAN', 'CHAI', 'BIRYANI', 'LASSI', 'TOYS', 'BOOKS', 'PHOTO', 'WATCH CO', 'CYCLES', 'FRUITS', 'SWEETS', 'TIFFIN', 'BAKERY',
    'KIRANA', 'BANGLES', 'ATTAR', 'TAILOR', 'MEDICAL', 'OPTICAL', 'VIDEO', 'RADIO', 'HOTEL', 'DOSA', 'STD', 'XEROX', 'SODA', 'SAREES', 'CHUDI', 'PAN SHOP', 'STEEL'];
  const COLONY_SHOPS = ['KIRANA', 'STD ISD PCO', 'XEROX', 'TAILOR', 'MEDICAL', 'PINDI GIRNI', 'CYCLE REPAIR', 'TIFFINS', 'IRANI CHAI', 'STATIONERY', 'GENERAL STORES', 'BAKERY'];
  const SIGN_BG = ['#d8402a', '#2a8c82', '#f2c230', '#2a5cb8', '#3a8a3a', '#c03a8a', '#f08a24', '#efe9dc', '#b22b2b', '#1d6e9a'];
  const fgFor = (bg) => (bg === '#f2c230' || bg === '#efe9dc' || bg === '#f08a24' ? '#2a1a10' : '#fff8e8');
  const AWNINGS = [['#d8402a', '#efe9dc'], ['#2a5cb8', '#efe9dc'], ['#3a8a3a', '#f2c230'], ['#f08a24', '#efe9dc'], ['#2a8c82', '#efe9dc'], ['#7a3a8a', '#f2c230']];
  const CLOTHES = ['#d8402a', '#2a5cb8', '#f2c230', '#efe9dc', '#3a8a3a', '#c03a8a', '#f08a24', '#5a3a8a', '#ffffff'];

  /* ======================================================= generation */
  const OK_LOT = new Uint8Array(16); OK_LOT[S.GROUND] = 1;
  let keepClear = [];
  let keepGrid = new Map(); // 256u buckets of keep-clear circles
  function addKeepClear(k) {
    keepClear.push(k);
    const i0 = Math.floor((k.x - k.r) / 256), i1 = Math.floor((k.x + k.r) / 256), j0 = Math.floor((k.y - k.r) / 256), j1 = Math.floor((k.y + k.r) / 256);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const key = j * 4096 + i; const l = keepGrid.get(key); if (l) l.push(k); else keepGrid.set(key, [k]); }
  }
  function clearOf(x, y, w, h) {
    const i0 = Math.floor(x / 256), i1 = Math.floor((x + w) / 256), j0 = Math.floor(y / 256), j1 = Math.floor((y + h) / 256);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = keepGrid.get(j * 4096 + i);
      if (!l) continue;
      const x1 = x + w, y1 = y + h;
      for (const k of l) {
        const kx = k.x, ky = k.y;
        const qx = kx < x ? x : kx > x1 ? x1 : kx, qy = ky < y ? y : ky > y1 ? y1 : ky; // U.clamp
        const ex = qx - kx, ey = qy - ky;
        if (ex * ex + ey * ey < k.r * k.r) return false;
      }
    }
    return true;
  }
  // Shrink a lot away from roads/water/etc. Returns [x,y,w,h] or null.
  function fitLot(x, y, w, h, minW) {
    let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
    for (let it = 0; it < 10; it++) {
      let ch = false;
      if (!rectAll(x0, y0, x1 - x0, CELL, OK_LOT)) { y0 += CELL; ch = true; }
      if (y1 - y0 < minW) return null;
      if (!rectAll(x0, y1 - CELL, x1 - x0, CELL, OK_LOT)) { y1 -= CELL; ch = true; }
      if (y1 - y0 < minW) return null;
      if (!rectAll(x0, y0, CELL, y1 - y0, OK_LOT)) { x0 += CELL; ch = true; }
      if (x1 - x0 < minW) return null;
      if (!rectAll(x1 - CELL, y0, CELL, y1 - y0, OK_LOT)) { x1 -= CELL; ch = true; }
      if (x1 - x0 < minW) return null;
      if (!ch) break;
    }
    if (!rectAll(x0, y0, x1 - x0, y1 - y0, OK_LOT)) return null;
    if (!clearOf(x0, y0, x1 - x0, y1 - y0)) return null;
    return [x0, y0, x1 - x0, y1 - y0];
  }

  // Which side of a rect faces the nearest road, and how far the road edge is.
  function frontOf(x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2;
    if (!nearestRoad(cx, cy)) return { side: 'S', gap: 999 };
    const rp = NR;
    const dx = rp.x - cx, dy = rp.y - cy;
    let side, edge;
    if (Math.abs(dx) * h > Math.abs(dy) * w) { side = dx > 0 ? 'E' : 'W'; edge = Math.abs(dx) - w / 2; }
    else { side = dy > 0 ? 'S' : 'N'; edge = Math.abs(dy) - h / 2; }
    const gap = edge - rp.road.w / 2 - (FOOT[rp.road.kind] || 0);
    return { side, gap, road: rp.road };
  }

  function makeItems(rng, x, y, w, d, style) {
    const items = [];
    const P = (p) => rng.next() < p;
    const inX = (m) => x + m + rng.next() * Math.max(0, w - 2 * m);
    const inY = (m) => y + m + rng.next() * Math.max(0, d - 2 * m);
    // stains always (weathered concrete)
    for (let i = 0; i < 2 + (rng.next() * 2 | 0); i++) items.push({ t: 'stain', x: inX(3), y: inY(3), r: 2 + rng.next() * Math.min(w, d) * 0.22 });
    const big = w > 14 && d > 14;
    if (style === 'colony' || style === 'rocky' || style === 'oldcity' || style === 'market') {
      if (big && P(style === 'colony' ? 0.6 : 0.35)) {
        const mw = Math.min(10, w * 0.4), md = Math.min(9, d * 0.4);
        items.push({ t: 'mumty', x: x + 2 + rng.next() * (w - mw - 4), y: y + 2 + rng.next() * (d - md - 4), w: mw, d: md, h: 8 });
      }
      if (P(style === 'colony' ? 0.85 : 0.5)) items.push({ t: 'tank', x: inX(4), y: inY(4), r: 2.0 + rng.next() * 0.7, black: style === 'colony' ? P(0.7) : P(0.3) });
      if (P(style === 'colony' ? 0.55 : 0.14)) items.push({ t: 'ant', x: inX(3), y: inY(3), h: 8 + rng.next() * 4, a: rng.next() * Math.PI, kite: P(0.06) ? CLOTHES[(rng.next() * CLOTHES.length) | 0] : null });
      if (big && P(style === 'colony' ? 0.45 : 0.3)) {
        const horiz = w > d;
        const x0 = horiz ? x + 3 : inX(4), y0 = horiz ? inY(4) : y + 3;
        const x1 = horiz ? x + w - 3 : x0, y1 = horiz ? y0 : y + d - 3;
        const cl = [];
        const L = Math.hypot(x1 - x0, y1 - y0);
        for (let u = 2; u < L - 2; u += 2.6 + rng.next() * 1.5) if (P(0.7)) cl.push([u / L, CLOTHES[(rng.next() * CLOTHES.length) | 0], 1.4 + rng.next() * 1.6]);
        items.push({ t: 'line', x0, y0, x1, y1, cl });
      }
      if (big && P(0.05)) items.push({ t: 'chilli', x: inX(5), y: inY(5), w: 6, d: 4 });
      if (big && P(0.05)) items.push({ t: 'cot', x: inX(6), y: inY(6), a: P(0.5) ? 0 : Math.PI / 2 });
      if (P(0.15)) items.push({ t: 'plants', x: x + 1.5, y: y + 1.5, w: w - 3, d: d - 3, n: 3 + (rng.next() * 4 | 0) });
      if (style === 'colony' && P(0.04)) items.push({ t: 'dish', x: inX(4), y: inY(4) });
    }
    if (style === 'posh') {
      if (P(0.6)) items.push({ t: 'tank', x: inX(4), y: inY(4), r: 3, black: P(0.5) });
      if (P(0.3)) items.push({ t: 'dish', x: inX(4), y: inY(4) });
    }
    if (style === 'hitec') {
      for (let i = 0; i < 2 + (rng.next() * 3 | 0); i++) items.push({ t: 'ac', x: inX(6), y: inY(6), w: 5 + rng.next() * 6, d: 4 + rng.next() * 4 });
      if (P(0.3)) items.push({ t: 'helipad', x: x + w / 2, y: y + d / 2, r: Math.min(w, d) * 0.3 });
    }
    if (style === 'colonial' || style === 'cantonment') {
      if (P(0.4)) items.push({ t: 'tank', x: inX(5), y: inY(5), r: 3, black: false });
    }
    return items;
  }

  // shade() results are cached (thousands of buildings share a dozen wall colours)
  const shadeMemo = new Map();
  const shadeC = (hex, f) => { const k = hex + f; let v = shadeMemo.get(k); if (v === undefined) { v = U.shade(hex, f); shadeMemo.set(k, v); } return v; };

  // A generic building. Its roof furniture (`items`: tanks, antennas, clotheslines...) is generated on
  // first use from the building's own seed: the bigger v2 world has ~35k buildings and only the ones
  // drawn near the player (2D roof sprites, 3D chunks) ever need it.
  class Bldg {
    constructor(x, y, w, d, h, style, P, rng) {
      this.t = 'bldg'; this.x = x; this.y = y; this.w = w; this.d = d; this.h = h; this.style = style;
      this.x0 = x; this.y0 = y; this.x1 = x + w; this.y1 = y + d; this.cx = x + w / 2; this.cy = y + d / 2;
      this.wall = rng.pick(P.walls); this.roof = rng.pick(P.roofs); this.trim = P.trim;
      this.seed = (rng.next() * 1e9) | 0; this.lit = 0.25 + rng.next() * 0.4;
      this.win = 'rect'; this.winSp = 7 + rng.next() * 2; this.winW = 3; this.roofType = 'flat'; this.parapet = 1;
      this._items = null; this._extra = null; this.front = null; this.sign = null; this.awning = null; this.gf = null;
      this.id = 0; this.fn = null; this.stamp = 0;
    }
    get items() {
      if (!this._items) {
        const it = this.roofType === 'flat' ? makeItems(U.rng(this.seed ^ 0x5bd1e995), this.x, this.y, this.w, this.d, this.style) : [];
        if (this._extra) for (const e of this._extra) it.push(e);
        this._items = it;
      }
      return this._items;
    }
    set items(v) { this._items = v; }
  }
  function newBuilding(x, y, w, d, h, style, rng, extra) {
    const P = STY[style] || STY.colony;
    const b = new Bldg(x, y, w, d, h, style, P, rng);
    switch (style) {
      case 'oldcity': b.win = rng.next() < 0.4 ? 'arch' : 'rect'; b.parapet = rng.next() < 0.5 ? 2 : 1; b.winSp = 6 + rng.next() * 2; b.gf = rng.next() < 0.5 ? 'arches' : 'door'; break;
      case 'market': b.win = 'rect'; b.parapet = 1; b.gf = 'shutters'; break;
      case 'colony': b.win = 'grill'; b.parapet = 1; b.gf = 'door'; break;
      case 'posh': b.win = 'rect'; b.winSp = 9; b.winW = 4; b.parapet = 1; b.gf = 'door'; if (rng.next() < 0.45) b.roofType = 'hip'; break;
      case 'colonial': b.win = 'arch'; b.winSp = 8; b.winW = 3.2; b.parapet = 2; b.gf = 'arches'; break;
      case 'cantonment': b.win = 'rect'; b.winSp = 9; b.roofType = 'gable'; b.parapet = 0; b.gf = 'door'; break;
      case 'hitec': b.win = 'glass'; b.parapet = 1; b.winSp = 6; break;
      case 'rocky': b.win = 'grill'; b.parapet = 1; b.gf = 'door'; break;
    }
    // parapets/ledges pick up the house colour (white trim stays for colonial / posh / hitec)
    if (style === 'oldcity' || style === 'market' || style === 'colony' || style === 'rocky') b.trim = shadeC(b.wall, 1.12);
    if (extra) Object.assign(b, extra);
    return b;
  }

  // A shop name that fits a board `len` world units long (the 3x5 font is ~1 px per unit at zoom 1)
  const signW = new Map();
  const textW = (t) => { let w = signW.get(t); if (w == null) { w = N.draw.pixelTextWidth(t); signW.set(t, w); } return w; };
  function pickSign(rng, len, bg, list) {
    const fit = (arr) => arr.filter((t) => textW(t) <= len * 1.05);
    let texts = fit(list || SIGNS);
    if (texts.length < 3) texts = texts.concat(fit(SHORT_SIGNS));
    if (!texts.length) return null;
    return { text: rng.pick(texts), bg, fg: fgFor(bg) };
  }

  function solidRect(x, y, w, d) { fillRect(x, y, w, d, always(S.SOLID)); }

  function genLot(lot, style, rng, out) {
    const [x, y, w, h] = lot;
    const P = STY[style];
    if (rng.next() < P.emptyP) {
      if (style === 'rocky' || style === 'hitec') {
        const n = 1 + (rng.next() * 3) | 0;
        for (let i = 0; i < n; i++) out.rocks.push({ x: x + 8 + rng.next() * Math.max(1, w - 16), y: y + 8 + rng.next() * Math.max(1, h - 16), r: 5 + rng.next() * 12, h: 0 });
      }
      if (rng.next() < 0.5) out.trees.push({ x: x + w / 2 + (rng.next() - 0.5) * w * 0.5, y: y + h / 2 + (rng.next() - 0.5) * h * 0.5, style });
      return;
    }
    const fr = frontOf(x, y, w, h);
    const onRoad = fr.gap < 14;
    const sideH = fr.side === 'N' || fr.side === 'S';
    switch (style) {
      case 'oldcity':
      case 'market': {
        const ins = rng.next() < 0.7 ? 0 : 1;
        const bx = x + ins, by = y + ins, bw = w - ins * 2, bd = h - ins * 2;
        if (bw < 8 || bd < 8) return;
        const floors = style === 'market' ? 2 + (rng.next() < 0.45 ? 1 : 0) : 1 + ((rng.next() * 3) | 0) + (rng.next() < 0.08 ? 1 : 0);
        const hh = floors * 10 + (rng.next() * 3 | 0);
        // small mosque now and then in the old city
        if (style === 'oldcity' && bw > 22 && bd > 22 && rng.next() < 0.05) {
          const b = newBuilding(bx, by, bw, bd, 14, style, rng, { wall: '#efe9dc', roof: '#e8e2d4', items: [], parapet: 2, mosque: true, win: 'arch' });
          b.items.push({ t: 'domeItem', x: bx + bw / 2, y: by + bd / 2, r: Math.min(bw, bd) * 0.28, h: 12, col: '#efe9dc' });
          b.items.push({ t: 'minaret', x: bx + 3, y: by + 3, r: 2.2, h: 40 });
          b.items.push({ t: 'minaret', x: bx + bw - 3, y: by + 3, r: 2.2, h: 40 });
          out.bldgs.push(b); return;
        }
        const b = newBuilding(bx, by, bw, bd, hh, style, rng);
        if (onRoad) {
          b.front = fr.side;
          if (rng.next() < (style === 'market' ? 0.6 : 0.25)) {
            const bg = rng.pick(SIGN_BG);
            const len = sideH ? bw : bd;
            b.sign = pickSign(rng, len, bg);
            b.awning = rng.next() < 0.6 ? rng.pick(AWNINGS) : null;
            b.gf = 'shutters';
          }
        }
        if (style === 'oldcity' && rng.next() < 0.1 && bw > 14 && bd > 14) (b._extra || (b._extra = [])).push({ t: 'domeItem', x: bx + bw / 2, y: by + bd / 2, r: 4, h: 6, col: b.wall });
        out.bldgs.push(b);
        return;
      }
      case 'colony':
      case 'rocky': {
        // house set back from the front edge, with a low compound wall and a yard
        const fs = 5 + rng.next() * 4, ss = 1.5 + rng.next() * 2.5, bs = 1.5 + rng.next() * 2;
        let bx = x + ss, by = y + ss, bw = w - ss * 2, bd = h - ss * 2;
        if (fr.side === 'N') { by = y + fs; bd = h - fs - bs; }
        else if (fr.side === 'S') { by = y + bs; bd = h - fs - bs; }
        else if (fr.side === 'W') { bx = x + fs; bw = w - fs - bs; by = y + ss; bd = h - ss * 2; }
        else { bx = x + bs; bw = w - fs - bs; by = y + ss; bd = h - ss * 2; }
        if (bw < 10 || bd < 10) return;
        const r = rng.next();
        const floors = style === 'rocky' ? 1 : r < 0.35 ? 1 : r < 0.82 ? 2 : 3;
        const b = newBuilding(bx, by, bw, bd, floors * 10 + 1, style, rng);
        b.front = fr.side;
        b.yard = { x, y, w, h, kolam: rng.next() < 0.35, col: rng.next() < 0.3 ? '#8aa05a' : null };
        b.cwall = { x, y, w, h, side: fr.side, col: rng.next() < 0.5 ? b.trim : b.wall };
        if (rng.next() < 0.22) b.porch = true; // bulb over the gate at night
        // occasional colony shop at the road edge
        if (onRoad && style === 'colony' && rng.next() < 0.12) {
          const bg = rng.pick(SIGN_BG);
          const len = sideH ? bw : bd;
          b.sign = pickSign(rng, len, bg, COLONY_SHOPS);
          if (b.sign) { b.awning = rng.pick(AWNINGS); b.gf = 'shutters'; }
        }
        out.bldgs.push(b);
        if (rng.next() < 0.4) {
          // a tree in the yard (front setback)
          const tx = fr.side === 'E' ? x + w - fs / 2 : fr.side === 'W' ? x + fs / 2 : x + 4 + rng.next() * (w - 8);
          const ty = fr.side === 'S' ? y + h - fs / 2 : fr.side === 'N' ? y + fs / 2 : y + 4 + rng.next() * (h - 8);
          out.trees.push({ x: tx, y: ty, style, small: true });
        }
        return;
      }
      case 'posh': {
        const inset = 12 + rng.next() * 6;
        const bw = Math.min(w - inset * 2, 30 + rng.next() * 30), bd = Math.min(h - inset * 2, 26 + rng.next() * 26);
        if (bw < 16 || bd < 16) return;
        const bx = x + inset + rng.next() * (w - inset * 2 - bw), by = y + inset + rng.next() * (h - inset * 2 - bd);
        const b = newBuilding(bx, by, bw, bd, 10 + (rng.next() < 0.6 ? 10 : 0) + 2, style, rng);
        b.front = fr.side;
        b.yard = { x, y, w, h, lawn: true };
        out.bldgs.push(b);
        out.walls.push({ x, y, w, h, side: fr.side, h: 6, col: rng.pick(['#efe9dc', '#e8d9b5', '#d8c8a8']), solid: true });
        for (let i = 0; i < 2 + (rng.next() * 3 | 0); i++) {
          const tx = x + 6 + rng.next() * (w - 12), ty = y + 6 + rng.next() * (h - 12);
          if (tx > bx - 6 && tx < bx + bw + 6 && ty > by - 6 && ty < by + bd + 6) continue;
          out.trees.push({ x: tx, y: ty, style });
        }
        return;
      }
      case 'colonial': {
        const inset = 6 + rng.next() * 6;
        const bw = w - inset * 2, bd = h - inset * 2;
        if (bw < 20 || bd < 20) return;
        const floors = 2 + (rng.next() * 2 | 0);
        const b = newBuilding(x + inset, y + inset, bw, bd, floors * 11 + 2, style, rng);
        b.front = fr.side;
        if (bw > 40 && bd > 30 && rng.next() < 0.35) (b._extra || (b._extra = [])).push({ t: 'domeItem', x: b.x + bw / 2, y: b.y + bd / 2, r: Math.min(bw, bd) * 0.16, h: 12, col: b.wall === '#a5543f' || b.wall === '#9a4a38' || b.wall === '#b0603f' ? '#efe9dc' : b.wall, finial: true });
        if (rng.next() < 0.5 && bw > 30) (b._extra || (b._extra = [])).push({ t: 'tower', x: b.x + bw / 2 - 5, y: b.y + (fr.side === 'S' ? bd - 10 : 0), w: 10, d: 10, h: 16 });
        out.bldgs.push(b);
        if (rng.next() < 0.6) for (let i = 0; i < 2; i++) out.trees.push({ x: x + 4 + rng.next() * (w - 8), y: y + 3 + rng.next() * 3 + (i ? h - 9 : 0), style });
        return;
      }
      case 'cantonment': {
        const horiz = w > h;
        const bw = horiz ? Math.min(w - 16, 50 + rng.next() * 70) : 16 + rng.next() * 8;
        const bd = horiz ? 16 + rng.next() * 8 : Math.min(h - 16, 50 + rng.next() * 70);
        if (bw < 14 || bd < 14) return;
        const bx = x + (w - bw) / 2, by = y + (h - bd) / 2;
        const b = newBuilding(bx, by, bw, bd, 12, style, rng, { ridge: horiz ? 'x' : 'y' });
        b.front = fr.side;
        out.bldgs.push(b);
        for (let i = 0; i < 3; i++) {
          const tx = x + 4 + rng.next() * (w - 8), ty = y + 4 + rng.next() * (h - 8);
          if (tx > bx - 8 && tx < bx + bw + 8 && ty > by - 8 && ty < by + bd + 8) continue;
          out.trees.push({ x: tx, y: ty, style });
        }
        return;
      }
      case 'hitec': {
        const inset = 14 + rng.next() * 10;
        const bw = Math.min(w - inset * 2, 40 + rng.next() * 60), bd = Math.min(h - inset * 2, 36 + rng.next() * 50);
        if (bw < 24 || bd < 24) return;
        const bx = x + (w - bw) / 2, by = y + (h - bd) / 2;
        if (rng.next() < 0.4) {
          const floors = 3 + (rng.next() * 6 | 0);
          const b = newBuilding(bx, by, bw, bd, floors * 10, style, rng, { roofType: 'frame', wall: '#b8b4ac', roof: '#a8a49c', floors, items: [] });
          out.bldgs.push(b);
          if (rng.next() < 0.6) out.cranes.push({ x: bx + bw + 6, y: by + 6, h: floors * 10 + 30, a: rng.next() * Math.PI * 2, len: 50 + rng.next() * 20 });
        } else {
          const b = newBuilding(bx, by, bw, bd, 40 + (rng.next() * 7 | 0) * 10, style, rng);
          out.bldgs.push(b);
        }
        return;
      }
    }
  }

  function genBlock(blk, out) {
    const [bx, by, bw, bh] = blk.rect;
    const style = STY[blk.style] ? blk.style : 'colony';
    const P = STY[style];
    const rng = U.rng((blk.seed || 1) * 7919 + bx * 13 + by);
    // recursive halving into lots (an explicit stack, depth-first, first half first: same order and
    // the same rng draws as the recursive version)
    const lots = [];
    const stack = [bx, by, bw, bh, 0];
    const minS = P.lotMin;
    while (stack.length) {
      const depth = stack.pop(), h = stack.pop(), w = stack.pop(), y = stack.pop(), x = stack.pop();
      if ((w <= P.lotMax && h <= P.lotMax) || depth > 18) { lots.push(x, y, w, h); continue; }
      const vert = w >= h; // cut perpendicular to the longer side
      const len = vert ? w : h;
      const lane = rng.next() < P.laneP ? P.lane : 0;
      if (len < minS * 2 + lane) { lots.push(x, y, w, h); continue; }
      const cut = minS + rng.next() * (len - minS * 2 - lane);
      // push the second half first so the first half is split first
      if (vert) stack.push(x + cut + lane, y, w - cut - lane, h, depth + 1, x, y, cut, h, depth + 1);
      else stack.push(x, y + cut + lane, w, h - cut - lane, depth + 1, x, y, w, cut, depth + 1);
    }
    for (let k = 0; k < lots.length; k += 4) {
      const f = fitLot(lots[k], lots[k + 1], lots[k + 2], lots[k + 3], Math.min(10, P.lotMin * 0.6));
      if (!f) continue;
      W.lots.push({ rect: f, style });
      genLot(f, style, rng, out);
    }
  }

  /* ----------------------------------------------------------- trees */
  const TREE_KINDS = {
    neem: { cols: ['#2c5226', '#3a6a2e', '#4a7c36', '#5f9142'], h: 22, flowers: null },
    banyan: { cols: ['#203f1e', '#2d5427', '#3b6830', '#4c7a3a'], h: 26, flowers: null },
    gulmohar: { cols: ['#2f5a28', '#3f7032', '#4f8238', '#628f40'], h: 20, flowers: ['#e0482a', '#f07a2a', '#d83a24'] },
    ashoka: { cols: ['#1f4a24', '#2b5d2e', '#3a7038', '#4a8040'], h: 26, flowers: null },
    palm: { cols: ['#3e6a2a', '#4f7f34', '#6a9440', '#2e5222'], h: 30, flowers: null },
    coconut: { cols: ['#456f2c', '#588a36', '#74a046', '#33582a'], h: 34, flowers: null, palm: true },
    mango: { cols: ['#1c3f1c', '#28522a', '#376636', '#4a7a40'], h: 22, flowers: null },
    tamarind: { cols: ['#2a4f24', '#386230', '#4a763a', '#5f8a46'], h: 24, flowers: null },
    peepal: { cols: ['#25502a', '#326434', '#43783e', '#58904a'], h: 26, flowers: null },
  };
  const isPalm = (kind) => kind === 'palm' || kind === 'coconut';
  const KIND_BY_STYLE = {
    oldcity: ['neem', 'neem', 'neem', 'palm'], market: ['neem', 'neem', 'palm'], colony: ['neem', 'ashoka', 'coconut', 'gulmohar', 'neem', 'palm', 'coconut', 'mango'],
    posh: ['palm', 'ashoka', 'gulmohar', 'coconut', 'neem'], colonial: ['banyan', 'neem', 'ashoka', 'gulmohar'], cantonment: ['banyan', 'neem', 'gulmohar', 'neem'],
    hitec: ['palm', 'neem'], rocky: ['neem', 'neem', 'palm'],
  };
  // A tree. Its canopy parts (blobs / palm fronds / flowers) are made on first use from the same
  // seeded stream as before (identical look), so trees never drawn cost no allocations.
  class Tree {
    constructor(x, y, kind, r, h, seed, rGiven) {
      this.t = 'tree'; this.kind = kind; this.x = x; this.y = y; this.r = r; this.h = h;
      this.x0 = x - r; this.y0 = y - r; this.x1 = x + r; this.y1 = y + r; this.cx = x; this.cy = y;
      this.seed = seed; this.rGiven = rGiven; this._parts = null; this.id = 0; this.fn = null; this.stamp = 0;
    }
    get blobs() { return (this._parts || treeParts(this)).blobs; }
    get fronds() { return (this._parts || treeParts(this)).fronds; }
    get flowers() { return (this._parts || treeParts(this)).flowers; }
  }
  function treeParts(t) {
    const kind = t.kind, K = TREE_KINDS[kind] || TREE_KINDS.neem, r = t.r;
    const rng = U.rng(t.seed);
    if (!t.rGiven) rng.next(); // the radius draw
    rng.next();                // the height draw
    const blobs = [];
    if (!isPalm(kind)) {
      const n = kind === 'banyan' || kind === 'peepal' ? 11 : kind === 'ashoka' ? 5 : 7;
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2, d = rng.next() * r * 0.55;
        blobs.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.38 + rng.next() * 0.3)]);
      }
    }
    const fronds = [];
    if (isPalm(kind)) {
      const n = 7 + (rng.next() * 3 | 0);
      for (let i = 0; i < n; i++) fronds.push([((i + rng.next() * 0.5) / n) * Math.PI * 2, r * (0.8 + rng.next() * 0.35)]);
    }
    const flowers = [];
    if (K.flowers) for (let i = 0; i < 9; i++) { const a = rng.next() * Math.PI * 2, d = rng.next() * r * 0.75; flowers.push([Math.cos(a) * d, Math.sin(a) * d, 1.2 + rng.next() * 1.6, K.flowers[i % K.flowers.length]]); }
    return (t._parts = { blobs, fronds, flowers });
  }
  function makeTree(x, y, kind, r, seed) {
    const K = TREE_KINDS[kind] || TREE_KINDS.neem;
    seed = seed || ((x * 73856093) ^ (y * 19349663));
    const rng = U.rng(seed);
    if (!TREE_KINDS[kind]) kind = 'neem';
    const rGiven = !!r;
    r = r || (kind === 'banyan' ? 16 + rng.next() * 8 : isPalm(kind) ? 9 + rng.next() * 3 : kind === 'ashoka' ? 6 + rng.next() * 2 : 9 + rng.next() * 5);
    const h = K.h * (0.8 + rng.next() * 0.35) * (kind === 'banyan' ? 1 : Math.min(1.15, 0.7 + r / 30));
    return new Tree(x, y, kind, r, h, seed, rGiven);
  }
  const OK_TREE = new Uint8Array(16); OK_TREE[S.GROUND] = 1; OK_TREE[S.GRASS] = 1; OK_TREE[S.FOOTPATH] = 1; OK_TREE[S.PLAZA] = 1; OK_TREE[S.SAND] = 1;
  function treeSpotOK(x, y, r) {
    const s = surfAt(x, y);
    if (!OK_TREE[s]) return false;
    // keep trunks off buildings
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) if (surfAt(x + dx, y + dy) === S.SOLID) return false;
    return true;
  }

  /* ======================================================= world build */
  W.build = function () {
    const t0 = performance.now();
    const phases = (W.buildPhases = {});
    let tp = t0, lastP = 'setup';
    const mark = (name) => { const t = performance.now(); phases[lastP] = Math.round((t - tp) * 10) / 10; tp = t; lastP = name; };
    const D = N.WORLD_DATA || {};
    W.data = D;
    sizeGrids(D);
    D.districts = D.districts || []; D.water = D.water || []; D.roads = D.roads || []; D.parks = D.parks || [];
    D.rocks = D.rocks || []; D.blocks = D.blocks || []; D.buildings = D.buildings || []; D.landmarks = D.landmarks || [];
    D.trees = D.trees || []; D.places = D.places || []; D.spawns = D.spawns || {};
    W.districts = D.districts;
    W.structures = []; W.trees = []; W.lamps = []; W.rocks = []; W.lots = [];
    buckets = []; decals = [];
    for (let i = 0; i < BW * BH; i++) { buckets.push([]); decals.push([]); }

    grid = W.grid && W.grid.length === GW * GH ? W.grid.fill(S.GROUND) : new Uint8Array(GW * GH).fill(S.GROUND);
    W.grid = grid;
    for (let i = 0; i < GW; i++) { grid[i] = S.VOID; grid[(GH - 1) * GW + i] = S.VOID; }
    for (let j = 0; j < GH; j++) { grid[j * GW] = S.VOID; grid[j * GW + GW - 1] = S.VOID; }
    buildDistricts(D.districts, D.districtGrid);
    N.loadPlaces(D.places);

    // bounding boxes for roads (painter + nearest road)
    for (const r of D.roads) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of r.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      const m = r.w / 2 + (FOOT[r.kind] || 0) + 4;
      r._bb = [x0 - m, y0 - m, x1 + m, y1 + m];
    }
    const polyBB = (poly, m) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      return [x0 - m, y0 - m, x1 + m, y1 + m];
    };
    for (const p of D.parks) p._bb = polyBB(p.poly, 4);
    buildSegGrid(D.roads);
    for (const w of D.water) w._bb = polyBB(w.poly, (w.bank || 0) + 30);

    mark('1');
    // 1. parks
    const parkSurf = { grass: S.GRASS, garden: S.GRASS, ground: S.GROUND, plaza: S.PLAZA, rock: S.GROUND };
    for (const p of D.parks) fillPoly(p.poly, always(p.surface === 'sand' ? S.SAND : parkSurf[p.kind] == null ? S.GRASS : parkSurf[p.kind]));
    mark('2');
    // 2. water + sandy banks
    for (const w of D.water) {
      if (w.bank) fillThickLine(w.poly, w.bank * 2, always(S.SAND), true);
      fillPoly(w.poly, always(S.WATER));
    }
    mark('3');
    // 3. footpaths, then roads (bridges over water)
    for (const r of D.roads) {
      const fp = FOOT[r.kind] || 0;
      if (fp > 0) fillThickLine(r.pts, r.w + fp * 2, (o) => (r.kind !== 'bund' && (o === S.WATER || o === S.BRIDGE) ? -1 : S.FOOTPATH));
    }
    for (const r of D.roads) {
      if (r.kind === 'path') fillThickLine(r.pts, r.w, (o) => (o === S.WATER ? -1 : S.FOOTPATH));
      else if (r.kind === 'bridge') fillThickLine(r.pts, r.w + 4, always(S.BRIDGE));
      else if (r.kind === 'bund') fillThickLine(r.pts, r.w, always(S.ROAD));
      else fillThickLine(r.pts, r.w, (o) => (o === S.WATER || o === S.BRIDGE ? S.BRIDGE : S.ROAD));
    }
    mark('4');
    // 4. landmarks: plaza + solid footprint
    for (const lm of D.landmarks) {
      if (lm.plaza) fillCircle(lm.x, lm.y, lm.plaza, always(S.PLAZA));
    }
    for (const lm of D.landmarks) {
      if (lm.solids) for (const s of lm.solids) solidRect(s[0], s[1], s[2], s[3]);
      else if (!lm.noSolid && lm.solid !== false) solidRect(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d);
      lm.x0 = lm.x - lm.w / 2; lm.y0 = lm.y - lm.d / 2; lm.x1 = lm.x + lm.w / 2; lm.y1 = lm.y + lm.d / 2;
    }
    mark('5');
    // 5. keep-clear zones: spawns + places so generation never buries them
    keepClear = []; keepGrid = new Map();
    for (const p of D.places) addKeepClear({ x: p.x, y: p.y, r: Math.min(60, Math.max(14, (p.r || 20) * 0.6)) });
    if (D.spawns.player) addKeepClear({ x: D.spawns.player[0], y: D.spawns.player[1], r: 22 });
    if (D.spawns.home) addKeepClear({ x: D.spawns.home[0], y: D.spawns.home[1], r: 18 });

    mark('6');
    // 6. hand-placed buildings
    const out = { bldgs: [], trees: [], walls: [], rocks: [], cranes: [] };
    const hrng = U.rng(4242);
    for (const hb of D.buildings) {
      const [x, y, w, d] = hb.rect;
      const style = hb.style || (W.districtAt(x + w / 2, y + d / 2) || {}).style || 'colony';
      const b = newBuilding(x, y, w, d, hb.h || 20, STY[style] ? style : 'colony', hrng);
      b.id2 = hb.id;
      if (hb.color) b.wall = hb.color;
      if (hb.roof) b.roof = hb.roof;
      const fr = frontOf(x, y, w, d);
      b.front = fr.side;
      if (hb.sign) { const bg = hb.sign.color || '#d8402a'; b.sign = { text: hb.sign.text, bg, fg: hb.sign.fg || fgFor(bg) }; b.awning = b.awning || hrng.pick(AWNINGS); b.gf = 'shutters'; }
      solidRect(x, y, w, d);
      out.bldgs.push(b);
    }
    // 6b. colony houses under the roof zones (walkable terraces, ARCHITECTURE §7)
    buildRoofHouses(D, out, hrng);
    mark('7');
    // 7. procedural blocks
    for (const blk of D.blocks) {
      const before = out.bldgs.length;
      genBlock(blk, out);
      for (let i = before; i < out.bldgs.length; i++) { const b = out.bldgs[i]; solidRect(b.x, b.y, b.w, b.d); }
    }
    for (const wl of out.walls) {
      // posh compound walls (solid) with a gate opening on the road side
      const g = 18, t = CELL;
      const segs = wallSegments(wl, g);
      wl.segs = segs;
      for (const s of segs) fillRect(s[0], s[1], Math.max(t, s[2]), Math.max(t, s[3]), (o) => (o === S.GROUND || o === S.GRASS ? S.SOLID : -1));
    }
    // lawns / yards become grass where marked
    for (const b of out.bldgs) {
      if (b.yard && b.yard.lawn) fillRect(b.yard.x + 4, b.yard.y + 4, b.yard.w - 8, b.yard.h - 8, (o) => (o === S.GROUND ? S.GRASS : -1));
    }
    mark('8');
    // 8. rocks (data + generated)
    const allRocks = D.rocks.concat(out.rocks.map((r) => ({ x: r.x, y: r.y, r: r.r, h: r.h || r.r * (1 + U.hash2(r.x, r.y) * 0.6) })));
    const OK_ROCK = new Uint8Array(16); OK_ROCK[S.GROUND] = 1; OK_ROCK[S.GRASS] = 1;
    for (const rk of allRocks) {
      if (!rectAll(rk.x - rk.r, rk.y - rk.r, rk.r * 2, rk.r * 2, OK_ROCK)) continue;
      if (!clearOf(rk.x - rk.r, rk.y - rk.r, rk.r * 2, rk.r * 2)) continue;
      fillCircle(rk.x, rk.y, rk.r * 0.85, always(S.ROCK));
      const seed = (U.hash2(rk.x, rk.y) * 1e9) | 0;
      const rr = U.rng(seed);
      const parts = [[0, 0, rk.r, 0, rk.h]];
      if (rk.r > 9 && rr.next() < 0.55) parts.push([(rr.next() - 0.5) * rk.r, (rr.next() - 0.5) * rk.r, rk.r * 0.6, rk.h * 0.7, rk.h * 1.45]); // balanced boulder
      if (rr.next() < 0.6) { const a = rr.next() * 6.28; parts.push([Math.cos(a) * rk.r * 0.85, Math.sin(a) * rk.r * 0.85, rk.r * 0.55, 0, rk.h * 0.55]); }
      const cols = ['#8f8a86', '#9a928c', '#b89a8f', '#a39c94', '#8a807a', '#a8968a'];
      const s = { t: 'rock', x: rk.x, y: rk.y, r: rk.r, h: rk.h, parts, col: cols[(rr.next() * cols.length) | 0], x0: rk.x - rk.r * 1.5, y0: rk.y - rk.r * 1.5, x1: rk.x + rk.r * 1.5, y1: rk.y + rk.r * 1.5, cx: rk.x, cy: rk.y };
      W.rocks.push(s);
      addStructure(s);
    }

    mark('9');
    // 9. structures: buildings, walls, cranes
    for (const b of out.bldgs) {
      addStructure(b);
      // the building is its own ground decal: yard (if any) + contact plinth
      if (b.yard) addDecalRect(b, b.yard.x, b.yard.y, b.yard.w, b.yard.h); else addDecalRect(b, b.x - 1, b.y - 1, b.w + 2, b.d + 2);
    }
    for (const wl of out.walls) {
      for (const sg of wl.segs) addStructure({ t: 'wall', x: sg[0], y: sg[1], w: sg[2], d: sg[3], h: wl.h, col: wl.col, x0: sg[0], y0: sg[1], x1: sg[0] + sg[2], y1: sg[1] + sg[3] });
    }
    for (const c of out.cranes) addStructure({ t: 'crane', x: c.x, y: c.y, h: c.h, a: c.a, len: c.len, x0: c.x - c.len, y0: c.y - c.len, x1: c.x + c.len, y1: c.y + c.len, cx: c.x, cy: c.y });

    mark('10');
    // 10. bridge parapets (3D rails)
    for (const r of D.roads) {
      if (r.kind !== 'bridge') continue;
      for (const side of [-1, 1]) {
        const off = side * (r.w / 2 + 2);
        for (let s = 0; s < r.pts.length - 1; s++) {
          const a = r.pts[s], b = r.pts[s + 1];
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
          const nx = -dy / l, ny = dx / l;
          const p0 = [a[0] + nx * off, a[1] + ny * off], p1 = [b[0] + nx * off, b[1] + ny * off];
          const t = 1.6;
          const pts = [[p0[0] - nx * t, p0[1] - ny * t], [p1[0] - nx * t, p1[1] - ny * t], [p1[0] + nx * t, p1[1] + ny * t], [p0[0] + nx * t, p0[1] + ny * t]];
          const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
          addStructure({ t: 'rail', pts, h: 5, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
        }
      }
    }

    mark('11');
    // 11. road graph
    W.roads = buildRoadGraph(D.roads);

    mark('12');
    // 12. lamps along arterials / bund / bridges (median), streets (side tube lights)
    const junctions = W.roads.nodes.filter((n) => n.deg >= 3);
    indexJunctions(junctions);
    const nearJunction = junctionNear;
    for (const r of D.roads) {
      const median = r.kind === 'arterial' || r.kind === 'bund' || r.kind === 'bridge';
      const side = r.kind === 'street';
      if (!median && !side) continue;
      const spacing = median ? 115 : 150;
      let acc = spacing * 0.5, flip = 1;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const a = r.pts[s], b = r.pts[s + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        for (; acc < L; acc += spacing) {
          const x = a[0] + ux * acc, y = a[1] + uy * acc;
          if (nearJunction(x, y, r.w * 0.5 + 34)) continue;
          if (median) {
            addLamp({ x, y, arms: [[nx * 11, ny * 11], [-nx * 11, -ny * 11]], color: '#ffab40', h: 28 });
          } else {
            flip = -flip;
            const off = r.w / 2 + (FOOT[r.kind] || 0) - 2;
            const lx = x + nx * off * flip, ly = y + ny * off * flip;
            if (surfAt(lx, ly) !== S.FOOTPATH) continue;
            addLamp({ x: lx, y: ly, arms: [[-nx * 6 * flip, -ny * 6 * flip]], color: '#d8f4ff', h: 22, tube: true });
          }
        }
        acc -= L;
      }
    }

    mark('13');
    // 13. trees: data, generated (lots, parks, avenues)
    // spacing hashes (32u cells) for trees and lamps
    const tHash = new Map(), lHash = new Map();
    const hput = (H, o) => { const key = Math.floor(o.y / 32) * 4096 + Math.floor(o.x / 32); const l = H.get(key); if (l) l.push(o); else H.set(key, [o]); };
    const hnear = (H, x, y, d) => {
      for (let j = Math.floor((y - d) / 32); j <= Math.floor((y + d) / 32); j++) for (let i = Math.floor((x - d) / 32); i <= Math.floor((x + d) / 32); i++) {
        const l = H.get(j * 4096 + i); if (l) for (const o of l) if (Math.abs(o.x - x) < d && Math.abs(o.y - y) < d) return true;
      }
      return false;
    };
    for (const l of W.lamps) hput(lHash, l);
    const nearTree = (x, y, d) => hnear(tHash, x, y, d), nearLamp = (x, y, d) => hnear(lHash, x, y, d);
    const placeTree = (x, y, kind, r) => {
      if (!treeSpotOK(x, y)) return;
      const t = makeTree(x, y, kind, r);
      W.trees.push(t); addStructure(t); hput(tHash, t);
    };
    for (const t of D.trees) { const tt = makeTree(t.x, t.y, t.kind || 'neem', t.r); W.trees.push(tt); addStructure(tt); hput(tHash, tt); }
    const trng = U.rng(777);
    for (const t of out.trees) {
      const kinds = KIND_BY_STYLE[t.style] || KIND_BY_STYLE.colony;
      placeTree(t.x, t.y, trng.pick(kinds), t.small ? 6 + trng.next() * 4 : null);
    }
    for (const p of D.parks) {
      if (p.kind === 'plaza') continue;
      const [x0, y0, x1, y1] = p._bb;
      const area = (x1 - x0) * (y1 - y0);
      const dens = p.kind === 'garden' ? 1 / 1500 : p.kind === 'rock' ? 1 / 5000 : 1 / 9000;
      const n = Math.min(400, Math.round(area * dens));
      for (let i = 0; i < n; i++) {
        let x = x0 + trng.next() * (x1 - x0), y = y0 + trng.next() * (y1 - y0);
        if (p.kind === 'ground') { // trees only around the edge of maidans
          const e = trng.next() * 4 | 0;
          if (e === 0) y = y0 + 10; else if (e === 1) y = y1 - 10; else if (e === 2) x = x0 + 10; else x = x1 - 10;
        }
        if (!U.pointInPoly(x, y, p.poly)) continue;
        if (nearTree(x, y, 14)) continue;
        placeTree(x, y, trng.pick(p.kind === 'garden' ? ['neem', 'gulmohar', 'ashoka', 'palm', 'banyan', 'neem'] : ['neem', 'neem', 'palm']));
      }
    }
    // avenue trees along streets/arterials on the footpath edge
    for (const r of D.roads) {
      if (r.kind !== 'street' && r.kind !== 'arterial' && r.kind !== 'bund') continue;
      if (r.trees !== undefined) continue; // the map plants (or forbids) this road's avenue itself
      const off = r.w / 2 + (FOOT[r.kind] || 0) - 3;
      let acc = 30;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const a = r.pts[s], b = r.pts[s + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        for (; acc < L; acc += 46 + trng.next() * 40) {
          const x = a[0] + ux * acc, y = a[1] + uy * acc;
          const dist = W.districtAt(x, y);
          const st = dist ? dist.style : 'colony';
          const p = { oldcity: 0.08, market: 0.12, colony: 0.5, posh: 0.75, colonial: 0.55, cantonment: 0.85, hitec: 0.3, rocky: 0.3 }[st] || 0.4;
          for (const sd of [-1, 1]) {
            if (trng.next() > p) continue;
            const tx = x + nx * off * sd, ty = y + ny * off * sd;
            if (nearJunction(tx, ty, r.w + 30)) continue;
            if (nearLamp(tx, ty, 10)) continue;
            placeTree(tx, ty, trng.pick(KIND_BY_STYLE[st] || KIND_BY_STYLE.colony), 7 + trng.next() * 6);
          }
        }
        acc -= L;
      }
    }

    mark('14');
    // 14. landmarks as structures (drawn by N.landmarks)
    for (const lm of D.landmarks) addStructure({ t: 'landmark', lm, x0: lm.x - lm.w / 2 - 10, y0: lm.y - lm.d / 2 - 10, x1: lm.x + lm.w / 2 + 10, y1: lm.y + lm.d / 2 + 10, cx: lm.x, cy: lm.y });

    W.junctions = junctions;
    // 15. roof zones (terraces, planks, stairs) and the podium junctions
    try { buildRoofs(D); } catch (e) { N.err('world.roofs', e); }
    try { buildPodiums(D); } catch (e) { N.err('world.podiums', e); }
    try { setupRoofRuntime(); } catch (e) { N.err('world.roofsRuntime', e); }
    mark('15');
    // 16. potholes and tar patches (A2), after every surface is final
    try { buildPotholes(D); } catch (e) { N.err('world.potholes', e); }
    mark('16');
    soil = null;
    for (const k in PIX) PIX[k] = null;
    mapCache.clear();
    prepPainter();
    N.render.setGroundPainter(paintGround);
    W.built = true;
    mark('end');
    W.buildMs = Math.round(performance.now() - t0);
    N.emit('world:built', W);
    return W;
  };

  // Junction nodes bucketed on a 128 u grid (lamps, avenue trees and potholes keep clear of them)
  const JG = 128;
  let jGrid = new Map();
  function indexJunctions(list) {
    jGrid = new Map();
    for (const n of list) {
      const key = Math.floor(n.y / JG) * 4096 + Math.floor(n.x / JG);
      const l = jGrid.get(key); if (l) l.push(n); else jGrid.set(key, [n]);
    }
  }
  /** Is a junction node within r of (x, y)? With `pad`, within pad + the node's half width. */
  function junctionNear(x, y, r, pad) {
    const R = pad != null ? r + pad + 40 : r;
    for (let j = Math.floor((y - R) / JG); j <= Math.floor((y + R) / JG); j++) {
      for (let i = Math.floor((x - R) / JG); i <= Math.floor((x + R) / JG); i++) {
        const l = jGrid.get(j * 4096 + i);
        if (!l) continue;
        for (const n of l) {
          const rr = pad != null ? r + pad + n.w / 2 : r;
          if ((n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) < rr * rr) return n;
        }
      }
    }
    return null;
  }

  function wallSegments(wl, gate) {
    const { x, y, w, h, side } = wl;
    const t = 2;
    const segs = [];
    const horiz = (yy, isFront) => {
      if (!isFront) { segs.push([x, yy, w, t]); return; }
      const g0 = x + w / 2 - gate / 2;
      segs.push([x, yy, g0 - x, t]); segs.push([g0 + gate, yy, x + w - g0 - gate, t]);
    };
    const vert = (xx, isFront) => {
      if (!isFront) { segs.push([xx, y, t, h]); return; }
      const g0 = y + h / 2 - gate / 2;
      segs.push([xx, y, t, g0 - y]); segs.push([xx, g0 + gate, t, y + h - g0 - gate]);
    };
    horiz(y, side === 'N'); horiz(y + h - t, side === 'S');
    vert(x, side === 'W'); vert(x + w - t, side === 'E');
    return segs;
  }

  function addLamp(l) {
    l.t = 'lamp';
    l.x0 = l.x - 12; l.y0 = l.y - 12; l.x1 = l.x + 12; l.y1 = l.y + 12; l.cx = l.x; l.cy = l.y;
    W.lamps.push(l);
    addStructure(l);
  }

  /* ===================================================== ground painter */
  let pat = null;
  function makePatterns() {
    const mk = (w, h, fn) => { const c = N.render.makeCanvas(w, h); fn(c.getContext('2d'), w, h); return c; };
    const rng = U.rng(31337);
    const speck = mk(128, 128, (g, w, h) => {
      for (let i = 0; i < 1500; i++) {
        const dark = rng.next() < 0.6;
        g.fillStyle = dark ? 'rgba(70,40,25,' + (0.08 + rng.next() * 0.16) + ')' : 'rgba(255,240,215,' + (0.06 + rng.next() * 0.14) + ')';
        g.fillRect((rng.next() * w) | 0, (rng.next() * h) | 0, rng.next() < 0.2 ? 2 : 1, 1);
      }
    });
    const blot = mk(512, 512, (g, w, h) => {
      // soft, irregular soil variation (clusters of small soft dabs, never a clean circle)
      for (let i = 0; i < 46; i++) {
        const x = rng.next() * w, y = rng.next() * h, light = rng.next() < 0.6;
        const c = light ? '255,235,200' : '110,70,40';
        for (let k = 0; k < 9; k++) {
          const px = x + (rng.next() - 0.5) * 90, py = y + (rng.next() - 0.5) * 60, r = 10 + rng.next() * 26;
          const gr = g.createRadialGradient(px, py, 0, px, py, r);
          gr.addColorStop(0, 'rgba(' + c + ',' + (light ? 0.05 : 0.035) + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)');
          g.fillStyle = gr;
          // the dab and its wrapped copies (seamless tile); copies wholly off the canvas draw nothing: skip them
          for (let ox = -w; ox <= w; ox += w) {
            if (px + r + ox <= 0 || px - r + ox >= w) continue;
            for (let oy = -h; oy <= h; oy += h) if (py + r + oy > 0 && py - r + oy < h) g.fillRect(px - r + ox, py - r + oy, r * 2, r * 2);
          }
        }
      }
    });
    const grass = mk(64, 64, (g, w, h) => {
      for (let i = 0; i < 520; i++) {
        const x = (rng.next() * w) | 0, y = (rng.next() * h) | 0, v = rng.next();
        g.fillStyle = v < 0.45 ? 'rgba(30,60,20,0.35)' : v < 0.85 ? 'rgba(140,180,80,0.30)' : 'rgba(200,190,110,0.30)';
        g.fillRect(x, y, 1, rng.next() < 0.5 ? 2 : 1);
      }
    });
    const asphalt = mk(64, 64, (g, w, h) => {
      for (let i = 0; i < 700; i++) {
        const v = rng.next();
        g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)';
        g.fillRect((rng.next() * w) | 0, (rng.next() * h) | 0, 1, 1);
      }
      for (let i = 0; i < 4; i++) { // patches
        g.fillStyle = 'rgba(0,0,0,0.06)';
        g.beginPath(); g.arc(rng.next() * w, rng.next() * h, 4 + rng.next() * 8, 0, Math.PI * 2); g.fill();
      }
    });
    const tiles = mk(16, 16, (g) => {
      g.fillStyle = 'rgba(80,60,40,0.20)'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(8, 8, 8, 1); g.fillRect(8, 0, 1, 8);
      g.fillStyle = 'rgba(255,250,235,0.12)'; g.fillRect(1, 1, 7, 1); g.fillRect(9, 9, 6, 1);
    });
    const ripple = mk(64, 48, (g, w, h) => {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(200,240,240,' + (0.08 + rng.next() * 0.12) + ')';
        g.fillRect((rng.next() * w) | 0, (rng.next() * h) | 0, 3 + ((rng.next() * 5) | 0), 1);
      }
    });
    const paving = mk(8, 8, (g) => { g.fillStyle = 'rgba(60,50,40,0.18)'; g.fillRect(0, 0, 8, 1); g.fillRect(0, 0, 1, 8); });
    const ctx = N.render.ctx;
    pat = {
      speck: ctx.createPattern(speck, 'repeat'), blot: ctx.createPattern(blot, 'repeat'), grass: ctx.createPattern(grass, 'repeat'),
      asphalt: ctx.createPattern(asphalt, 'repeat'), tiles: ctx.createPattern(tiles, 'repeat'), ripple: ctx.createPattern(ripple, 'repeat'),
      paving: ctx.createPattern(paving, 'repeat'),
    };
  }

  // Offset a polyline by d (left of travel for d > 0 in screen coords, i.e. +normal (-uy, ux))
  function offsetLine(pts, d) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      let nx = 0, ny = 0;
      if (i > 0) { const a = pts[i - 1]; const l = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1; nx += -(p[1] - a[1]) / l; ny += (p[0] - a[0]) / l; }
      if (i < pts.length - 1) { const b = pts[i + 1]; const l = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1; nx += -(b[1] - p[1]) / l; ny += (b[0] - p[0]) / l; }
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      // miter scale
      let m = 1;
      if (i > 0 && i < pts.length - 1) {
        const a = pts[i - 1], b = pts[i + 1];
        const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
        const n1x = -(p[1] - a[1]) / l1, n1y = (p[0] - a[0]) / l1;
        m = 1 / Math.max(0.3, nx * n1x + ny * n1y);
      }
      out.push([p[0] + nx * d * m, p[1] + ny * d * m]);
    }
    return out;
  }
  function pathLine(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }
  function pathPoly(ctx, poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }
  const inBB = (bb, x0, y0, x1, y1) => bb[2] >= x0 && bb[0] <= x1 && bb[3] >= y0 && bb[1] <= y1;

  // Ordered bucket index for the chunk painter: a list's items (by index) bucketed on the BK grid by a
  // bounding box. query() returns the indices of the items in the buckets a rect touches, ascending
  // (= list order, so painting order is unchanged); callers keep their exact overlap test. The painter
  // used to scan every road (3.4k, a megamorphic `r._bb` load each), junction, rock and landmark per chunk.
  function bucketIndex(list, bbOf) {
    const cells = new Array(BW * BH).fill(null);
    for (let k = 0; k < list.length; k++) {
      const bb = bbOf(list[k]);
      if (!bb) continue;
      const i0 = Math.max(0, Math.min(BW - 1, Math.floor(bb[0] / BK))), i1 = Math.max(0, Math.min(BW - 1, Math.floor(bb[2] / BK)));
      const j0 = Math.max(0, Math.min(BH - 1, Math.floor(bb[1] / BK))), j1 = Math.max(0, Math.min(BH - 1, Math.floor(bb[3] / BK)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * BW + i] || (cells[j * BW + i] = [])).push(k);
    }
    return { list, n: list.length, cells, mark: new Uint32Array(list.length), stamp: 0, out: [] };
  }
  function bucketQuery(ix, x0, y0, x1, y1) {
    const out = ix.out, mark = ix.mark, st = ++ix.stamp;
    out.length = 0;
    const i0 = Math.max(0, Math.min(BW - 1, Math.floor(x0 / BK))), i1 = Math.max(0, Math.min(BW - 1, Math.floor(x1 / BK)));
    const j0 = Math.max(0, Math.min(BH - 1, Math.floor(y0 / BK))), j1 = Math.max(0, Math.min(BH - 1, Math.floor(y1 / BK)));
    let sorted = true;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = ix.cells[j * BW + i];
      if (!l) continue;
      for (let k = 0; k < l.length; k++) {
        const v = l[k];
        if (mark[v] === st) continue;
        mark[v] = st;
        if (out.length && out[out.length - 1] > v) sorted = false;
        out.push(v);
      }
    }
    if (!sorted) out.sort((a, b) => a - b);
    return out;
  }
  const PIX = { roads: null, parks: null, water: null, junctions: null, rocks: null, landmarks: null };
  const pix = (k, list, bbOf) => { const ix = PIX[k]; return ix && ix.list === list && ix.n === list.length ? ix : (PIX[k] = bucketIndex(list, bbOf)); };
  const BB_SELF = (o) => o._bb;
  const BB_JUNCTION = (n) => { const R = n.w / 2 + 2 + 30; return [n.x - R, n.y - R, n.x + R, n.y + R]; };
  const BB_ROCK = (rk) => [rk.x - rk.r * 2, rk.y - rk.r * 2, rk.x + rk.r * 2, rk.y + rk.r * 2];
  const BB_LANDMARK = (lm) => { const r = (lm.plaza || 0) + Math.max(lm.w, lm.d); return [lm.x - r, lm.y - r, lm.x + r, lm.y + r]; };

  const ROADCOL = { arterial: '#47464c', street: '#55535a', bund: '#4c4b52', bridge: '#5d5a5c', lane: '#8a7c6a' };
  const FOOTCOL = { arterial: '#a39684', street: '#a89a86', bund: '#b4a690' };
  const PARKCOL = { grass: '#5b8a3c', garden: '#5f9140', ground: '#b38c62', plaza: '#d3c3a2', rock: '#a28468' };

  function prepPainter() {
    if (!pat) makePatterns();
    // pre-compute lane divider offsets for arterials
    for (const r of W.data.roads) {
      if (r.kind === 'arterial') { r._laneL = offsetLine(r.pts, r.w / 4); r._laneR = offsetLine(r.pts, -r.w / 4); }
      if (r.kind === 'bridge') { r._edgeL = offsetLine(r.pts, r.w / 2 + 2); r._edgeR = offsetLine(r.pts, -(r.w / 2 + 2)); }
    }
  }

  // District soil colours on a coarse grid (1 px per DG units); upscaled with bilinear
  // filtering in the chunk painter so neighbouring districts blend instead of meeting in
  // hard straight edges.
  let soil = null;
  function buildSoil() {
    soil = N.render.makeCanvas(DGW, DGH);
    const g = soil.getContext('2d');
    g.fillStyle = '#a98a66'; g.fillRect(0, 0, DGW, DGH);
    for (const d of W.data.districts) {
      g.fillStyle = d.ground || '#a98a66';
      if (districtRings(d)) { // polygon districts: drawn at 1 px per DG units, slightly grown so they meet
        g.save(); g.scale(1 / DG, 1 / DG); g.beginPath(); districtPath(g, d); g.fill('evenodd');
        g.strokeStyle = g.fillStyle; g.lineWidth = DG * 0.9; g.lineJoin = 'round'; g.stroke(); g.restore();
        continue;
      }
      if (!d.rect) continue;
      const [x, y, w, h] = d.rect;
      g.fillRect(Math.round(x / DG), Math.round(y / DG), Math.max(1, Math.round(w / DG)), Math.max(1, Math.round(h / DG)));
    }
  }

  function paintGround(ctx, x0, y0, w, h) {
    const D = W.data, x1 = x0 + w, y1 = y0 + h;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 1. district soil (blended)
    if (!soil) buildSoil();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(soil, x0 / DG - 2, y0 / DG - 2, w / DG + 4, h / DG + 4, x0 - 2 * DG, y0 - 2 * DG, w + 4 * DG, h + 4 * DG);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = pat.blot; ctx.fillRect(x0, y0, w, h);
    // 2. lots: yards, lawns, kolam
    const bi0 = Math.max(0, Math.floor(x0 / BK)), bj0 = Math.max(0, Math.floor(y0 / BK));
    const bi1 = Math.min(BW - 1, Math.floor((x1 - 1) / BK)), bj1 = Math.min(BH - 1, Math.floor((y1 - 1) / BK));
    const seen = new Set();
    const dl = [];
    for (let j = bj0; j <= bj1; j++) for (let i = bi0; i <= bi1; i++) for (const d of decals[j * BW + i]) if (!seen.has(d)) { seen.add(d); dl.push(d); }
    for (const b of dl) {
      if (!b.yard) continue;
      const d = b.yard; // {x, y, w, h}
      if (b.yard.lawn) {
        ctx.fillStyle = '#c9b89a'; ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = '#5f9140'; ctx.fillRect(d.x + 4, d.y + 4, d.w - 8, d.h - 8);
        ctx.fillStyle = pat.grass; ctx.fillRect(d.x + 4, d.y + 4, d.w - 8, d.h - 8);
        // driveway to the gate
        ctx.fillStyle = '#c8bca4';
        const s = b.front;
        if (s === 'N' || s === 'S') ctx.fillRect(d.x + d.w / 2 - 6, s === 'N' ? d.y : b.y + b.d, 12, s === 'N' ? b.y - d.y : d.y + d.h - b.y - b.d);
        else ctx.fillRect(s === 'W' ? d.x : b.x + b.w, d.y + d.h / 2 - 6, s === 'W' ? b.x - d.x : d.x + d.w - b.x - b.w, 12);
      } else {
        ctx.fillStyle = b.yard.col || '#c2a882';
        ctx.fillRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
        if (b.yard.col) { ctx.fillStyle = pat.grass; ctx.fillRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2); }
        if (b.yard.kolam) paintKolam(ctx, b);
      }
    }
    // 3. parks
    for (const pk of bucketQuery(pix('parks', D.parks, BB_SELF), x0, y0, x1, y1)) {
      const p = D.parks[pk];
      if (!inBB(p._bb, x0, y0, x1, y1)) continue;
      pathPoly(ctx, p.poly);
      if (p.surface === 'sand') { ctx.fillStyle = '#cdb489'; ctx.fill(); ctx.fillStyle = pat.speck; ctx.fill(); continue; }
      ctx.fillStyle = PARKCOL[p.kind] || PARKCOL.grass; ctx.fill();
      if (p.kind === 'grass' || p.kind === 'garden') {
        ctx.fillStyle = pat.grass; ctx.fill();
        ctx.strokeStyle = '#3f6a2c'; ctx.lineWidth = 3; ctx.stroke(); // hedge
        if (p.kind === 'garden') paintFlowerbeds(ctx, p, x0, y0, x1, y1);
      } else if (p.kind === 'plaza') {
        ctx.fillStyle = pat.tiles; ctx.fill();
      } else if (p.kind === 'ground') {
        ctx.fillStyle = pat.speck; ctx.fill();
        paintMaidan(ctx, p);
      } else if (p.kind === 'rock') {
        ctx.fillStyle = pat.speck; ctx.fill();
        ctx.fillStyle = 'rgba(90,120,50,0.25)'; ctx.fill();
      }
    }
    ctx.fillStyle = pat.speck; ctx.fillRect(x0, y0, w, h);
    // 4. water: sand banks, depth, foam
    for (const wk of bucketQuery(pix('water', D.water, BB_SELF), x0, y0, x1, y1)) {
      const wt = D.water[wk];
      if (!inBB(wt._bb, x0, y0, x1, y1)) continue;
      if (wt.bank) {
        pathPoly(ctx, wt.poly);
        ctx.strokeStyle = '#cdb489'; ctx.lineWidth = wt.bank * 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(120,90,60,0.18)'; ctx.lineWidth = wt.bank * 1.2; ctx.stroke();
      }
      pathPoly(ctx, wt.poly);
      const base = wt.color || '#2f7f86';
      ctx.fillStyle = U.shade(base, 0.82); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = base; ctx.lineWidth = 60; ctx.stroke();
      ctx.strokeStyle = U.shade(base, 1.12); ctx.lineWidth = 26; ctx.stroke();
      ctx.strokeStyle = U.shade(base, 1.25); ctx.lineWidth = 10; ctx.stroke();
      ctx.fillStyle = pat.ripple; ctx.fillRect(x0, y0, w, h);
      ctx.strokeStyle = 'rgba(235,245,230,0.55)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4, 2, 5]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    // 5. roads
    const roads = [];
    for (const rk of bucketQuery(pix('roads', D.roads, BB_SELF), x0, y0, x1, y1)) { const r = D.roads[rk]; if (inBB(r._bb, x0, y0, x1, y1)) roads.push(r); }
    // bridge shadows on water + decks
    for (const r of roads) {
      if (r.kind !== 'bridge') continue;
      ctx.save(); ctx.translate(7, 9); pathLine(ctx, r.pts);
      ctx.strokeStyle = 'rgba(10,30,30,0.35)'; ctx.lineWidth = r.w + 6; ctx.lineCap = 'butt'; ctx.stroke(); ctx.restore();
    }
    ctx.lineCap = 'round';
    for (const r of roads) { // footpaths
      const fp = FOOT[r.kind] || 0;
      if (!fp) continue;
      pathLine(ctx, r.pts);
      ctx.strokeStyle = FOOTCOL[r.kind] || '#a89a86'; ctx.lineWidth = r.w + fp * 2; ctx.stroke();
      ctx.strokeStyle = pat.paving; ctx.stroke();
    }
    for (const r of roads) { // kerbs
      if (r.kind === 'arterial' || r.kind === 'bund') {
        pathLine(ctx, r.pts);
        ctx.strokeStyle = '#1e1c1e'; ctx.lineWidth = r.w + 4; ctx.stroke();
        ctx.strokeStyle = '#e8c02c'; ctx.setLineDash([5, 5]); ctx.lineCap = 'butt'; ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round';
      } else if (r.kind === 'street') {
        pathLine(ctx, r.pts); ctx.strokeStyle = '#cfc4b0'; ctx.lineWidth = r.w + 3; ctx.stroke();
      } else if (r.kind === 'bridge') {
        pathLine(ctx, r.pts); ctx.strokeStyle = '#a49c90'; ctx.lineWidth = r.w + 7; ctx.lineCap = 'butt'; ctx.stroke(); ctx.lineCap = 'round';
      }
    }
    for (const r of roads) { // asphalt
      pathLine(ctx, r.pts);
      if (r.kind === 'path') { ctx.strokeStyle = '#cdbb98'; ctx.lineWidth = r.w; ctx.stroke(); ctx.strokeStyle = pat.speck; ctx.stroke(); continue; }
      if (r.kind === 'bridge') ctx.lineCap = 'butt';
      ctx.strokeStyle = ROADCOL[r.kind] || ROADCOL.street; ctx.lineWidth = r.w; ctx.stroke();
      ctx.strokeStyle = r.kind === 'lane' ? pat.speck : pat.asphalt; ctx.stroke();
      if (r.kind === 'lane') { ctx.strokeStyle = 'rgba(60,45,30,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.lineCap = 'round';
    }
    // markings
    ctx.lineCap = 'butt';
    for (const r of roads) {
      const median = r.median != null ? r.median : r.kind === 'arterial';
      if (median) {
        // painted median: black + yellow stripes
        pathLine(ctx, r.pts); ctx.strokeStyle = '#1e1c1e'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = '#e8c02c'; ctx.setLineDash([4, 4]); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (r.kind === 'arterial') {
        if (!median) { pathLine(ctx, r.pts); ctx.strokeStyle = 'rgba(236,232,220,0.8)'; ctx.lineWidth = 1.2; ctx.setLineDash([8, 9]); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(236,232,220,0.75)'; ctx.lineWidth = 1.2; ctx.setLineDash([9, 11]);
        pathLine(ctx, r._laneL); ctx.stroke(); pathLine(ctx, r._laneR); ctx.stroke();
        ctx.setLineDash([]);
      } else if (!median && (r.kind === 'street' || r.kind === 'bund' || r.kind === 'bridge')) {
        pathLine(ctx, r.pts); ctx.strokeStyle = 'rgba(236,232,220,0.8)'; ctx.lineWidth = 1.2; ctx.setLineDash([8, 9]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // junctions: re-paint each meeting road near the node in its own colour (narrowest
    // first) to clear dashes/medians, then zebra crossings on street/arterial approaches
    const RANK = { lane: 0, path: 0, bund: 1, street: 1, bridge: 2, arterial: 3 };
    ctx.lineCap = 'butt';
    const JL = W.junctions;
    for (const jk of bucketQuery(pix('junctions', JL, BB_JUNCTION), x0, y0, x1, y1)) {
      const n = JL[jk];
      const R = n.w / 2 + 2;
      if (n.x + R + 30 < x0 || n.x - R - 30 > x1 || n.y + R + 30 < y0 || n.y - R - 30 > y1) continue;
      const inc = n.inc.map((id) => W.roads.edges[id]).sort((a, b) => (RANK[a.kind] - RANK[b.kind]) || a.w - b.w);
      let widest = null;
      for (const e of inc) {
        const o = W.roads.nodes[e.a === n.id ? e.b : e.a];
        let ux = o.x - n.x, uy = o.y - n.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
        const reach = Math.min(L, R + 4);
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x + ux * reach, n.y + uy * reach);
        ctx.lineWidth = e.w; ctx.strokeStyle = ROADCOL[e.kind] || ROADCOL.street; ctx.stroke();
        ctx.strokeStyle = e.kind === 'lane' ? pat.speck : pat.asphalt; ctx.stroke();
        widest = e;
      }
      if (widest) { // fill the centre with the dominant road's surface
        ctx.beginPath(); ctx.arc(n.x, n.y, Math.min(widest.w / 2, R) * 0.98, 0, Math.PI * 2);
        ctx.fillStyle = ROADCOL[widest.kind] || ROADCOL.street; ctx.fill();
        ctx.fillStyle = widest.kind === 'lane' ? pat.speck : pat.asphalt; ctx.fill();
      }
      if (inc.every((e) => e.kind === 'lane')) continue;
      const seenDir = [];
      for (const e of inc) {
        if (e.kind === 'lane' || e.kind === 'bridge') continue;
        const o = W.roads.nodes[e.a === n.id ? e.b : e.a];
        let ux = o.x - n.x, uy = o.y - n.y; const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
        if (L < R + 24) continue;
        if (seenDir.some((d) => d[0] * ux + d[1] * uy > 0.95)) continue;
        seenDir.push([ux, uy]);
        // stand-off: clear of the widest crossing road
        const off = (widest ? widest.w / 2 : R) + 6;
        const cxz = n.x + ux * off, cyz = n.y + uy * off;
        const ca = ux, sa = uy;
        ctx.fillStyle = 'rgba(238,234,222,0.85)';
        for (let t = -e.w / 2 + 3; t <= e.w / 2 - 4; t += 4.5) {
          // stripe: 8 long (along the road) x 2.4 wide, centred on (cxz, cyz) + t * normal
          const px = cxz - sa * t, py = cyz + ca * t;
          ctx.beginPath();
          ctx.moveTo(px - ca * 4, py - sa * 4); ctx.lineTo(px + ca * 4, py + sa * 4);
          ctx.lineTo(px + ca * 4 - sa * 2.4, py + sa * 4 + ca * 2.4); ctx.lineTo(px - ca * 4 - sa * 2.4, py - sa * 4 + ca * 2.4);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    // potholes and tar patches (A2)
    try { paintPotholes(ctx, x0, y0, x1, y1); } catch (e) { N.err('world.paintPotholes', e); }
    // bridge edges (kerb lines)
    for (const r of roads) {
      if (r.kind !== 'bridge') continue;
      ctx.strokeStyle = '#3a3634'; ctx.lineWidth = 1.5;
      pathLine(ctx, r._edgeL); ctx.stroke(); pathLine(ctx, r._edgeR); ctx.stroke();
    }
    // 6. landmark plazas
    ctx.lineCap = 'round';
    for (const lk of bucketQuery(pix('landmarks', D.landmarks, BB_LANDMARK), x0, y0, x1, y1)) {
      const lm = D.landmarks[lk];
      const r = (lm.plaza || 0) + Math.max(lm.w, lm.d);
      if (lm.x + r < x0 || lm.x - r > x1 || lm.y + r < y0 || lm.y - r > y1) continue;
      if (lm.plaza) {
        ctx.beginPath(); ctx.arc(lm.x, lm.y, lm.plaza, 0, Math.PI * 2);
        ctx.fillStyle = '#d6c6a4'; ctx.fill(); ctx.fillStyle = pat.tiles; ctx.fill();
        ctx.strokeStyle = 'rgba(90,70,50,0.35)'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (N.landmarks && N.landmarks.paintGround) { try { N.landmarks.paintGround(ctx, lm); } catch (e) { N.err('landmarks.paintGround', e); } }
    }
    // 7. building plinths (contact darkening) and rock bases
    ctx.fillStyle = 'rgba(40,30,35,0.45)';
    for (const b of dl) ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.d + 2);
    for (const ri of bucketQuery(pix('rocks', W.rocks, BB_ROCK), x0, y0, x1, y1)) {
      const rk = W.rocks[ri];
      if (rk.x + rk.r * 2 < x0 || rk.x - rk.r * 2 > x1 || rk.y + rk.r * 2 < y0 || rk.y - rk.r * 2 > y1) continue;
      ctx.beginPath(); ctx.ellipse(rk.x, rk.y + 1, rk.r * 1.25, rk.r * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60,45,35,0.25)'; ctx.fill();
    }
    paintShadows(ctx, x0, y0, x1, y1);
  }

  // Baked cast shadows of static structures (buildings, trees, rocks, walls, lamps) using
  // the quantised sun; render.js repaints chunks progressively when the sun epoch changes.
  function paintShadows(ctx, x0, y0, x1, y1) {
    const sun = N.render.sun, sx = sun.sx, sy = sun.sy;
    const M = 240;
    ctx.beginPath();
    let n = 0;
    W.queryStructures(x0 - M, y0 - M, x1 + M, y1 + M, (s) => {
      switch (s.t) {
        case 'bldg': case 'wall': {
          const h = s.t === 'bldg' && (s.roofType === 'gable' || s.roofType === 'hip') ? s.h + 4 : s.h;
          const X0 = s.x, Y0 = s.y, X1 = s.x + s.w, Y1 = s.y + s.d, ex = sx * h, ey = sy * h;
          if (Math.min(X0, X0 + ex) > x1 || Math.max(X1, X1 + ex) < x0 || Math.min(Y0, Y0 + ey) > y1 || Math.max(Y1, Y1 + ey) < y0) return;
          if (ex >= 0 && ey >= 0) { ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y0); ctx.lineTo(X1 + ex, Y0 + ey); ctx.lineTo(X1 + ex, Y1 + ey); ctx.lineTo(X0 + ex, Y1 + ey); ctx.lineTo(X0, Y1); }
          else if (ex < 0 && ey >= 0) { ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y0); ctx.lineTo(X1, Y1); ctx.lineTo(X1 + ex, Y1 + ey); ctx.lineTo(X0 + ex, Y1 + ey); ctx.lineTo(X0 + ex, Y0 + ey); }
          else if (ex < 0) { ctx.moveTo(X1, Y0); ctx.lineTo(X1, Y1); ctx.lineTo(X0, Y1); ctx.lineTo(X0 + ex, Y1 + ey); ctx.lineTo(X0 + ex, Y0 + ey); ctx.lineTo(X1 + ex, Y0 + ey); }
          else { ctx.moveTo(X1, Y1); ctx.lineTo(X0, Y1); ctx.lineTo(X0, Y0); ctx.lineTo(X0 + ex, Y0 + ey); ctx.lineTo(X1 + ex, Y0 + ey); ctx.lineTo(X1 + ex, Y1 + ey); }
          ctx.closePath(); n++;
          break;
        }
        case 'tree': case 'rock': {
          const tree = s.t === 'tree';
          const h = tree ? s.h * 0.92 : s.h * 0.7, r = s.r * (tree ? (isPalm(s.kind) ? 0.55 : 0.82) : 0.9);
          const X = s.x + sx * h, Y = s.y + sy * h;
          if (Math.max(X, s.x) + r < x0 || Math.min(X, s.x) - r > x1 || Math.max(Y, s.y) + r < y0 || Math.min(Y, s.y) - r > y1) return;
          ctx.moveTo(X + r, Y); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.closePath(); n++;
          if (tree) { // trunk
            const ex = sx * h * 0.8, ey = sy * h * 0.8, l = Math.hypot(ex, ey) || 1, w = s.kind === 'banyan' ? 1.6 : 0.8;
            let nx = (-ey / l) * w, ny = (ex / l) * w;
            if (ex * ny - ey * nx < 0) { nx = -nx; ny = -ny; }
            ctx.moveTo(s.x + nx, s.y + ny); ctx.lineTo(s.x + ex + nx, s.y + ey + ny); ctx.lineTo(s.x + ex - nx, s.y + ey - ny); ctx.lineTo(s.x - nx, s.y - ny); ctx.closePath();
          }
          break;
        }
        case 'lamp': case 'crane': {
          const ex = sx * s.h, ey = sy * s.h, l = Math.hypot(ex, ey) || 1, w = s.t === 'crane' ? 1.5 : 0.7;
          let nx = (-ey / l) * w, ny = (ex / l) * w;
          if (ex * ny - ey * nx < 0) { nx = -nx; ny = -ny; }
          ctx.moveTo(s.x + nx, s.y + ny); ctx.lineTo(s.x + ex + nx, s.y + ey + ny); ctx.lineTo(s.x + ex - nx, s.y + ey - ny); ctx.lineTo(s.x - nx, s.y - ny); ctx.closePath(); n++;
          break;
        }
      }
    });
    if (!n) return;
    ctx.globalAlpha = 0.30 * sun.strength + 0.04;
    ctx.fillStyle = '#20142a';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function paintKolam(ctx, b) {
    // muggulu / rangoli in front of the gate: dots + loops in white rice-flour
    const y = b.yard;
    let gx, gy;
    if (b.front === 'N') { gx = y.x + y.w / 2; gy = (y.y + b.y) / 2; }
    else if (b.front === 'S') { gx = y.x + y.w / 2; gy = (b.y + b.d + y.y + y.h) / 2; }
    else if (b.front === 'W') { gx = (y.x + b.x) / 2; gy = y.y + y.h / 2; }
    else { gx = (b.x + b.w + y.x + y.w) / 2; gy = y.y + y.h / 2; }
    ctx.strokeStyle = 'rgba(250,248,240,0.9)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.arc(gx, gy, 2.6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx - 2.6, gy); ctx.lineTo(gx + 2.6, gy); ctx.moveTo(gx, gy - 2.6); ctx.lineTo(gx, gy + 2.6); ctx.stroke();
    ctx.fillStyle = (b.seed & 1) ? '#e0482a' : '#f2c230';
    ctx.fillRect(gx - 0.6, gy - 0.6, 1.2, 1.2);
  }
  function paintFlowerbeds(ctx, p, x0, y0, x1, y1) {
    const rng = U.rng(U.strHash(p.id || 'park'));
    const [bx0, by0, bx1, by1] = p._bb;
    const n = Math.min(60, ((bx1 - bx0) * (by1 - by0)) / 4000);
    for (let i = 0; i < n; i++) {
      const x = bx0 + rng.next() * (bx1 - bx0), y = by0 + rng.next() * (by1 - by0);
      if (x < x0 - 10 || x > x1 + 10 || y < y0 - 10 || y > y1 + 10) continue;
      if (!U.pointInPoly(x, y, p.poly)) continue;
      ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.ellipse(x, y, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      const cols = ['#e0482a', '#f2c230', '#f08a24', '#e8e0f0', '#c03a8a'];
      for (let k = 0; k < 8; k++) { ctx.fillStyle = cols[(i + k) % cols.length]; ctx.fillRect(x - 5 + rng.next() * 10, y - 2.5 + rng.next() * 5, 1.4, 1.4); }
    }
  }
  function paintMaidan(ctx, p) {
    // dusty cricket ground: worn centre + a pitch strip with crease lines
    const [x0, y0, x1, y1] = p._bb;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(x1 - x0, y1 - y0) * 0.5);
    gr.addColorStop(0, 'rgba(220,190,140,0.45)'); gr.addColorStop(1, 'rgba(220,190,140,0)');
    ctx.fillStyle = gr; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const horiz = x1 - x0 > y1 - y0;
    ctx.fillStyle = '#d8c09a';
    if (horiz) ctx.fillRect(cx - 22, cy - 3.5, 44, 7); else ctx.fillRect(cx - 3.5, cy - 22, 7, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    if (horiz) { ctx.fillRect(cx - 18, cy - 4, 0.8, 8); ctx.fillRect(cx + 17, cy - 4, 0.8, 8); }
    else { ctx.fillRect(cx - 4, cy - 18, 8, 0.8); ctx.fillRect(cx - 4, cy + 17, 8, 0.8); }
  }

  /* ========================================================== drawing */
  const FACEBIT = { N: 1, S: 2, W: 4, E: 8 };

  /* Small LRU caches of pre-rendered sprites (roof tops, tree canopies). Drawn with one
     drawImage each instead of dozens of path ops; rendered at 2 px per world unit. */
  const SPR_RES = 2;
  function makeLRU(cap) {
    // stamp-based LRU: hits only update a counter; eviction (rare) drops the oldest quarter
    const map = new Map();
    let tick = 0;
    return {
      get(key) { const e = map.get(key); if (!e) return null; e.t = ++tick; return e.c; },
      put(key, w, h) {
        let c = null;
        if (map.size >= cap) {
          const all = Array.from(map.entries()).sort((a, b) => a[1].t - b[1].t);
          for (let i = 0; i < Math.ceil(cap / 4); i++) { if (!c && all[i][1].c instanceof HTMLCanvasElement) c = all[i][1].c; map.delete(all[i][0]); }
        }
        if (w != null) {
          if (!c) c = N.render.makeCanvas(w, h);
          if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
        }
        return c;
      },
      set(key, c) { map.set(key, { c, t: ++tick }); return c; },
      clear() { map.clear(); },
      get size() { return map.size; },
    };
  }
  const roofCache = makeLRU(700);
  const treeCache = makeLRU(500);
  W.spriteCaches = { roofCache, treeCache };

  function wallPx(b, face) {
    const R = N.render;
    const dist = face === 'N' ? b.y - R.camY : face === 'S' ? b.y + b.d - R.camY : face === 'W' ? b.x - R.camX : b.x + b.w - R.camX;
    return Math.abs(dist) * R.Z * b.h * R.PERSP;
  }

  // Windows + ground floor detail on one visible wall. The geometry of each wall is built
  // once as Path2D objects in wall-local units (u along the wall, v = height) and drawn
  // under an affine transform fitted to the wall's projection at its centre (error < ~1px).
  const wallCache = makeLRU(2400);
  let litWalls = [];
  function wallGeom(b, face, L, fh, floors) {
    const key = b.id * 4 + 'NSWE'.indexOf(face);
    let g = wallCache.get(key);
    if (g) return g;
    wallCache.put(key); // may evict old entries
    wstats.wallBuilds++;
    g = wallCache.set(key, { win: new Path2D(), lit: new Path2D(), shade: null, ledge: null, gf: null, gfLit: null, gfCol: null, any: false, anyLit: false });
    const isFront = b.front === face;
    const fc = face.charCodeAt(0);
    if (b.win === 'glass') {
      const cols = Math.max(1, Math.floor(L / b.winSp));
      g.ledge = new Path2D();
      for (let f = 1; f < floors; f++) g.ledge.rect(0, f * fh - 0.4, L, 0.8);
      for (let c = 1; c < cols; c++) g.ledge.rect((c * L) / cols - 0.3, 0, 0.6, b.h);
      g.shade = new Path2D(); g.shade.rect(0, b.h * 0.55, L, b.h * 0.2);
      for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
        if (U.hash2(b.seed + f * 31, c + fc * 7) > b.lit * 0.8) continue;
        g.lit.rect((c * L) / cols + 0.6, f * fh + 0.8, L / cols - 1.2, fh - 1.6); g.anyLit = true;
      }
      g.glass = true;
    } else {
      const sp = b.winSp, ww = b.winW;
      const cols = Math.max(1, Math.floor((L - 2) / sp));
      const m0 = (L - cols * sp) / 2;
      const f0 = b.gf && (isFront || b.gf === 'arches') ? 1 : 0;
      if (floors > 1) { g.ledge = new Path2D(); for (let f = 1; f < floors; f++) g.ledge.rect(0, f * fh - 0.5, L, 0.9); }
      if (b.win === 'arch' || b.win === 'grill') g.shade = new Path2D();
      for (let f = f0; f < floors; f++) {
        const h0 = f * fh + fh * 0.3, h1 = f * fh + fh * (b.win === 'arch' ? 0.82 : 0.72);
        for (let c = 0; c < cols; c++) {
          const u0 = m0 + c * sp + (sp - ww) / 2;
          g.win.rect(u0, h0, ww, h1 - h0); g.any = true;
          if (U.hash2(b.seed + f * 17, c * 3 + fc) < b.lit) { g.lit.rect(u0, h0, ww, h1 - h0); g.anyLit = true; }
          if (g.shade) g.shade.rect(u0 - 0.6, h1, ww + 1.2, 0.9);
        }
      }
      if (b.gf === 'shutters' && isFront) {
        const shops = Math.max(1, Math.round(L / 13)), sw = L / shops;
        g.gf = new Path2D(); g.gfLit = new Path2D(); g.gfLines = new Path2D();
        for (let s = 0; s < shops; s++) {
          g.gf.rect(s * sw + 1, 0, sw - 2, fh * 0.7);
          g.gfLit.rect(s * sw + 1.5, 0.5, sw - 3, fh * 0.6);
          g.gfLines.rect(s * sw + 2, fh * 0.42, sw - 4, 1.2); // goods counter
        }
        g.gfKind = 'shutters';
      } else if (b.gf === 'arches') {
        const n = Math.max(1, Math.floor(L / 7)), aw = L / n;
        g.gf = new Path2D();
        for (let s = 0; s < n; s++) {
          const x0 = s * aw + 1.2, x1 = (s + 1) * aw - 1.2, top = fh * 0.75, r = (x1 - x0) / 2;
          g.gf.moveTo(x0, 0); g.gf.lineTo(x0, top - r); g.gf.arc((x0 + x1) / 2, top - r, r, Math.PI, 0, true); g.gf.lineTo(x1, 0); g.gf.closePath();
        }
        g.gfCol = '#4a3e3a'; g.gfKind = 'arches';
      } else if (b.gf === 'door' && isFront) {
        g.gf = new Path2D(); g.gf.rect(L / 2 - 2, 0, 4, 7); g.gfCol = '#5a3a28'; g.gfKind = 'door';
      }
    }
    return g;
  }
  // affine map wall-local (u, v) -> screen, exact at (uc, vc); sets it on ctx
  function setWallTransform(ctx, ax, ay, ux, uy, uc, vc) {
    const R = N.render, Z = R.Z, P = R.PERSP, k = Z * (1 + vc * P);
    const wx = ax + ux * uc - R.camX, wy = ay + uy * uc - R.camY;
    const jux = ux * k, juy = uy * k, jvx = wx * Z * P, jvy = wy * Z * P;
    const px = R.W / 2 + wx * k, py = R.H / 2 + wy * k;
    const M = wallM;
    M[0] = jux; M[1] = juy; M[2] = jvx; M[3] = jvy; M[4] = px - jux * uc - jvx * vc; M[5] = py - juy * uc - jvy * vc;
    ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    return M;
  }
  // the last wall transform (scratch: drawWallDetail copies it into litWalls when a wall glows)
  const wallM = new Float64Array(6);
  // lit walls this frame, flat: 6 transform numbers, the Path2D, the colour (8 slots per wall)
  function pushLit(m, path, col) {
    litWalls.push(m[0], m[1], m[2], m[3], m[4], m[5], path, col);
  }

  function drawWallDetail(ctx, b, face) {
    const px = wallPx(b, face);
    if (px < 4.5) return; // thin slivers near the screen centre: plain wall reads fine
    const R = N.render;
    // the wall's ground segment (a -> b) in the wall's winding
    let ax, ay, bx, by;
    switch (face) {
      case 'N': ax = b.x; ay = b.y; bx = b.x + b.w; by = b.y; break;
      case 'S': ax = b.x + b.w; ay = b.y + b.d; bx = b.x; by = b.y + b.d; break;
      case 'W': ax = b.x; ay = b.y + b.d; bx = b.x; by = b.y; break;
      default: ax = b.x + b.w; ay = b.y; bx = b.x + b.w; by = b.y + b.d;
    }
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    const floors = b.floors || Math.max(1, Math.round(b.h / 10.5));
    const fh = b.h / floors;
    const g = wallGeom(b, face, L, fh, floors);
    const night = R.night || 0;
    const fs = R.faceShade[face] || 0.7;
    const m = setWallTransform(ctx, ax, ay, ux, uy, L / 2, b.h / 2);
    if (g.glass) {
      ctx.fillStyle = 'rgba(20,40,55,0.45)'; ctx.fill(g.ledge);
      ctx.fillStyle = 'rgba(200,235,245,0.16)'; ctx.fill(g.shade);
    } else {
      if (g.ledge && px > 8) { ctx.fillStyle = R.shaded(b.trim, 0.72 + fs * 0.28); ctx.fill(g.ledge); }
      if (g.any) { ctx.fillStyle = night > 0.3 ? '#1a1826' : b.win === 'grill' ? '#3c3a44' : '#34303a'; ctx.fill(g.win); }
      if (g.shade && px > 9) { ctx.fillStyle = b.win === 'arch' ? b.trim : '#5a5560'; ctx.fill(g.shade); }
      if (g.gf) {
        if (g.gfKind === 'shutters') {
          const open = !(N.clock.minutes < 9 * 60 || N.clock.minutes > 22 * 60);
          ctx.fillStyle = open ? '#3a2a22' : '#7d8088'; ctx.fill(g.gf);
          if (open) { ctx.fillStyle = '#b08850'; ctx.fill(g.gfLines); }
          if (open && night > 0.2) pushLit(m, g.gfLit, '#ffc860');
        } else { ctx.fillStyle = g.gfCol; ctx.fill(g.gf); }
      }
    }
    if (night > 0.2 && g.anyLit) pushLit(m, g.lit, '#ffd27a');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // light layer: lit windows / open shops (warm) over the night overlay
  function drawLitWalls(ctx, night) {
    ctx.globalAlpha = Math.min(1, night * 1.25);
    const lw = litWalls;
    for (let i = 0; i < lw.length; i += 8) {
      ctx.setTransform(lw[i], lw[i + 1], lw[i + 2], lw[i + 3], lw[i + 4], lw[i + 5]);
      ctx.fillStyle = lw[i + 7]; ctx.fill(lw[i + 6]);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Roof top (base colour + all flat details) rendered once into a cached sprite.
  function paintRoof(g, b) {
    const { x, y, w, d } = b;
    g.fillStyle = b.roof; g.fillRect(x, y, w, d);
    g.fillStyle = 'rgba(60,50,40,0.10)';
    g.beginPath();
    for (const it of b.items) if (it.t === 'stain') { g.moveTo(it.x + it.r, it.y); g.arc(it.x, it.y, it.r, 0, Math.PI * 2); }
    g.fill();
    if (b.parapet) {
      g.strokeStyle = b.trim; g.lineWidth = 1.4;
      if (b.parapet === 2) g.setLineDash([2.6, 1.0]);
      g.strokeRect(x + 0.8, y + 0.8, w - 1.6, d - 1.6);
      g.setLineDash([]);
      g.strokeStyle = 'rgba(40,30,30,0.16)'; g.lineWidth = 0.8;
      g.strokeRect(x + 2, y + 2, w - 4, d - 4);
    }
    for (const it of b.items) {
      switch (it.t) {
        case 'line': {
          g.strokeStyle = 'rgba(40,40,40,0.6)'; g.lineWidth = 0.4;
          g.beginPath(); g.moveTo(it.x0, it.y0); g.lineTo(it.x1, it.y1); g.stroke();
          const dx = it.x1 - it.x0, dy = it.y1 - it.y0;
          const horiz = Math.abs(dx) > Math.abs(dy);
          for (const [t, c, s] of it.cl) {
            g.fillStyle = c;
            const px = it.x0 + dx * t, py = it.y0 + dy * t;
            if (horiz) g.fillRect(px, py - 0.3, s, 1.6); else g.fillRect(px - 0.3, py, 1.6, s);
          }
          break;
        }
        case 'chilli': g.fillStyle = '#e8e0d0'; g.fillRect(it.x, it.y, it.w, it.d); g.fillStyle = '#c82a1a'; for (let i = 0; i < 10; i++) g.fillRect(it.x + 0.5 + (i * 2.3) % (it.w - 1), it.y + 0.5 + ((i * 1.7) % (it.d - 1)), 1, 0.7); break;
        case 'cot': {
          const ca = Math.cos(it.a), sa = Math.sin(it.a);
          g.setTransform(SPR_RES * ca, SPR_RES * sa, -SPR_RES * sa, SPR_RES * ca, g._ox + it.x * SPR_RES, g._oy + it.y * SPR_RES);
          g.fillStyle = '#7a5030'; g.fillRect(-4, -2, 8, 4); g.fillStyle = '#d8c8a0'; g.fillRect(-3.4, -1.4, 6.8, 2.8);
          g.setTransform(SPR_RES, 0, 0, SPR_RES, g._ox, g._oy);
          break;
        }
        case 'plants': { g.fillStyle = '#4f8a3a'; g.beginPath(); for (let i = 0; i < it.n; i++) { const t = i / it.n, px = it.x + 1 + t * (it.w - 2); g.moveTo(px + 1.1, it.y + 0.6); g.arc(px, it.y + 0.6, 1.1, 0, Math.PI * 2); } g.fill(); break; }
        case 'ac': g.fillStyle = '#8f8c86'; g.fillRect(it.x, it.y, it.w, it.d); g.fillStyle = '#5a5854'; g.fillRect(it.x + 1, it.y + 1, it.w - 2, 1); break;
        case 'helipad': g.strokeStyle = 'rgba(240,240,240,0.7)'; g.lineWidth = 1; g.beginPath(); g.arc(it.x, it.y, it.r, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(240,240,240,0.75)'; g.fillRect(it.x - 2.5, it.y - 3, 1, 6); g.fillRect(it.x + 1.5, it.y - 3, 1, 6); g.fillRect(it.x - 2, it.y - 0.5, 4, 1); break;
        case 'dish': g.fillStyle = '#d8d8d0'; g.beginPath(); g.arc(it.x, it.y, 1.8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8a8a84'; g.fillRect(it.x - 0.3, it.y - 0.3, 0.6, 0.6); break;
        case 'tank':
          // seen from above: a Sintex drum (black, ribbed lid) or a cement box tank
          g.fillStyle = 'rgba(30,20,20,0.25)';
          if (it.black) {
            g.beginPath(); g.arc(it.x + 0.8, it.y + 0.8, it.r, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#2e3136'; g.beginPath(); g.arc(it.x, it.y, it.r, 0, Math.PI * 2); g.fill();
            g.strokeStyle = '#4c5158'; g.lineWidth = 0.5; g.beginPath(); g.arc(it.x, it.y, it.r * 0.62, 0, Math.PI * 2); g.stroke();
            g.fillStyle = '#5d636b'; g.beginPath(); g.arc(it.x - it.r * 0.35, it.y - it.r * 0.35, it.r * 0.28, 0, Math.PI * 2); g.fill();
          } else {
            g.fillRect(it.x - it.r + 0.8, it.y - it.r + 0.8, it.r * 2, it.r * 1.6);
            g.fillStyle = '#a8a39a'; g.fillRect(it.x - it.r, it.y - it.r, it.r * 2, it.r * 1.6);
            g.fillStyle = '#c4bfb6'; g.fillRect(it.x - it.r + 0.6, it.y - it.r + 0.6, it.r * 2 - 1.2, 0.8);
          }
          break;
      }
    }
    if (b.sign && b.front) {
      const s = b.sign, dep = Math.min(7, (b.front === 'N' || b.front === 'S' ? d : w) * 0.35);
      let rx, ry, rw, rh;
      if (b.front === 'N') { rx = x + 1; ry = y + 0.5; rw = w - 2; rh = dep; }
      else if (b.front === 'S') { rx = x + 1; ry = y + d - dep - 0.5; rw = w - 2; rh = dep; }
      else if (b.front === 'W') { rx = x + 0.5; ry = y + 1; rw = dep; rh = d - 2; }
      else { rx = x + w - dep - 0.5; ry = y + 1; rw = dep; rh = d - 2; }
      g.fillStyle = '#2a201c'; g.fillRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1);
      g.fillStyle = s.bg; g.fillRect(rx, ry, rw, rh);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(rx, ry, rw, 0.8);
      b._signC = [rx + rw / 2, ry + rh / 2, rw, rh];
    }
  }
  // sprite cache misses this frame (count + ms), for profiling: N.world.stats
  const wstats = (W.stats = { roofBuilds: 0, roofMs: 0, wallBuilds: 0, treeBuilds: 0, treeMs: 0 });
  function roofImage(b) {
    let c = roofCache.get(b.id);
    if (c) return c;
    const t0 = performance.now();
    try { return roofImageBuild(b); } finally { wstats.roofBuilds++; wstats.roofMs += performance.now() - t0; }
  }
  function roofImageBuild(b) {
    let c;
    c = roofCache.set(b.id, roofCache.put(b.id, Math.ceil(b.w * SPR_RES) + 2, Math.ceil(b.d * SPR_RES) + 2));
    const g = c.getContext('2d');
    g._ox = -b.x * SPR_RES + 1; g._oy = -b.y * SPR_RES + 1;
    g.setTransform(SPR_RES, 0, 0, SPR_RES, g._ox, g._oy);
    try { paintRoof(g, b); } catch (e) { N.err('paintRoof', e); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  // Live 3D roof furniture: stair rooms (mumty), antennas (one stroke), domes, minarets
  function drawItems3D(ctx, b) {
    const D = N.draw, R = N.render, h = b.h;
    let ant = false;
    for (const it of b.items) {
      switch (it.t) {
        case 'mumty': D.box(it.x, it.y, it.w, it.d, h, h + it.h, { wall: b.wall, roof: R.shaded(b.roof, 0.96) }); break;
        case 'ant': ant = true; break;
        case 'domeItem': D.dome(it.x, it.y, it.r, h, h + it.h, { fill: it.col || '#efe9dc', finial: it.finial ? 4 : 0 }); break;
        case 'minaret': D.cyl(it.x, it.y, it.r, h, it.h, { wall: '#efe9dc', grad: false, bands: [it.h * 0.6] }); D.dome(it.x, it.y, it.r * 1.2, it.h, it.h + 4, { fill: '#efe9dc', finial: 2 }); break;
        case 'tower': D.box(it.x, it.y, it.w, it.d, h, h + it.h, { wall: b.wall, roof: b.roof }); break;
      }
    }
    if (!ant) return;
    ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    let kite = null;
    for (const it of b.items) {
      if (it.t !== 'ant') continue;
      const k0 = R.k(h), k1 = R.k(h + it.h);
      ctx.moveTo(R.sx(it.x, k0), R.sy(it.y, k0)); ctx.lineTo(R.sx(it.x, k1), R.sy(it.y, k1));
      const ca = Math.cos(it.a), sa = Math.sin(it.a);
      for (let i = 0; i < 3; i++) {
        const k = R.k(h + it.h - i * 2.2), L = 4.5 - i;
        ctx.moveTo(R.sx(it.x - ca * L, k), R.sy(it.y - sa * L, k)); ctx.lineTo(R.sx(it.x + ca * L, k), R.sy(it.y + sa * L, k));
      }
      if (it.kite) kite = it;
    }
    ctx.stroke();
    if (kite) { // a kite tangled on the antenna (Sankranti!)
      const k = R.k(h + kite.h - 1), ca = Math.cos(kite.a), sa = Math.sin(kite.a);
      const kx = R.sx(kite.x + ca * 4, k), ky = R.sy(kite.y + sa * 4, k);
      ctx.fillStyle = kite.kite; ctx.beginPath();
      ctx.moveTo(kx, ky - 2.5 * k); ctx.lineTo(kx + 2 * k, ky); ctx.lineTo(kx, ky + 2.5 * k); ctx.lineTo(kx - 2 * k, ky); ctx.fill();
    }
  }

  function drawHipRoof(ctx, b, gable) {
    const R = N.render;
    const { x, y, w, d, h } = b;
    const rise = gable ? Math.min(w, d) * 0.35 : Math.min(w, d) * 0.4;
    const along = gable ? (b.ridge || (w > d ? 'x' : 'y')) : (w > d ? 'x' : 'y');
    const inset = gable ? 0 : Math.min(w, d) / 2;
    const k0 = R.k(h + 0.01), k1 = R.k(h + rise);
    const P = (px, py, k) => [R.sx(px, k), R.sy(py, k)];
    let r0, r1;
    if (along === 'x') { r0 = [x + inset, y + d / 2]; r1 = [x + w - inset, y + d / 2]; }
    else { r0 = [x + w / 2, y + inset]; r1 = [x + w / 2, y + d - inset]; }
    const c = [P(x, y, k0), P(x + w, y, k0), P(x + w, y + d, k0), P(x, y + d, k0)];
    const a = P(r0[0], r0[1], k1), e = P(r1[0], r1[1], k1);
    const faces = along === 'x'
      ? [[c[0], c[1], e, a, 'N'], [c[1], c[2], e, null, 'E'], [c[2], c[3], a, e, 'S'], [c[3], c[0], a, null, 'W']]
      : [[c[0], c[1], a, null, 'N'], [c[1], c[2], e, a, 'E'], [c[2], c[3], e, null, 'S'], [c[3], c[0], a, e, 'W']];
    const base = b.roof;
    const sun = R.faceShade;
    for (const f of faces) {
      ctx.beginPath(); ctx.moveTo(f[0][0], f[0][1]); ctx.lineTo(f[1][0], f[1][1]); ctx.lineTo(f[2][0], f[2][1]);
      if (f[3]) ctx.lineTo(f[3][0], f[3][1]);
      ctx.closePath();
      ctx.fillStyle = R.shaded(base, 0.55 + sun[f[4]] * 0.55); ctx.fill();
    }
    ctx.strokeStyle = R.shaded(base, 0.6); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]);
    if (gable && R.Z > 0.85) { // tile courses
      const n = Math.floor((along === 'x' ? w : d) / 5);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (along === 'x') { const xx = x + w * t, p0 = P(xx, y, k0), pr = P(xx, y + d / 2, k1), p1 = P(xx, y + d, k0); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(pr[0], pr[1]); ctx.lineTo(p1[0], p1[1]); }
        else { const yy = y + d * t, p0 = P(x, yy, k0), pr = P(x + w / 2, yy, k1), p1 = P(x + w, yy, k0); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(pr[0], pr[1]); ctx.lineTo(p1[0], p1[1]); }
      }
      ctx.strokeStyle = 'rgba(60,25,15,0.3)'; ctx.lineWidth = 0.5;
    }
    ctx.stroke();
  }

  // Striped shop awning sloping out over the footpath: affine transform + stripe rects
  function drawAwning(ctx, b) {
    const R = N.render;
    const s = b.front, dep = 5, h0 = 7.2, h1 = 9.4;
    let a0, a1, o0;
    if (s === 'N') { a0 = [b.x + 1, b.y]; a1 = [b.x + b.w - 1, b.y]; o0 = [b.x + 1, b.y - dep]; }
    else if (s === 'S') { a0 = [b.x + 1, b.y + b.d]; a1 = [b.x + b.w - 1, b.y + b.d]; o0 = [b.x + 1, b.y + b.d + dep]; }
    else if (s === 'W') { a0 = [b.x, b.y + 1]; a1 = [b.x, b.y + b.d - 1]; o0 = [b.x - dep, b.y + 1]; }
    else { a0 = [b.x + b.w, b.y + 1]; a1 = [b.x + b.w, b.y + b.d - 1]; o0 = [b.x + b.w + dep, b.y + 1]; }
    const kH = R.k(h1), kL = R.k(h0);
    const A0x = R.sx(a0[0], kH), A0y = R.sy(a0[1], kH), A1x = R.sx(a1[0], kH), A1y = R.sy(a1[1], kH);
    const O0x = R.sx(o0[0], kL), O0y = R.sy(o0[1], kL);
    const L = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    // local x: 0..L along the wall, local y: 0..1 out to the lip
    ctx.setTransform((A1x - A0x) / L, (A1y - A0y) / L, O0x - A0x, O0y - A0y, A0x, A0y);
    ctx.fillStyle = b.awning[0]; ctx.fillRect(0, 0, L, 1);
    ctx.fillStyle = b.awning[1];
    ctx.beginPath();
    for (let u = 1.5; u < L; u += 3) ctx.rect(u, 0, 1.5, 1);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, 0.85, L, 0.15);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Low colony compound wall with a gate gap: one fill for the faces, one for the tops
  function lowWallSegs(c) {
    const t = 1.2, g = 10, segs = [];
    const s = c.side;
    if (s === 'N' || s === 'S') {
      const yy = s === 'N' ? c.y : c.y + c.h - t, g0 = c.x + c.w / 2 - g / 2;
      segs.push([c.x, yy, g0 - c.x, t], [g0 + g, yy, c.x + c.w - g0 - g, t]);
    } else {
      const xx = s === 'W' ? c.x : c.x + c.w - t, g0 = c.y + c.h / 2 - g / 2;
      segs.push([xx, c.y, t, g0 - c.y], [xx, g0 + g, t, c.y + c.h - g0 - g]);
    }
    return segs;
  }
  function drawLowWall(ctx, b) {
    const c = b.cwall, R = N.render, D = N.draw, hh = 3.6;
    const segs = c.segs || (c.segs = lowWallSegs(c));
    ctx.beginPath();
    for (const s of segs) {
      const [x, y, w, d] = s;
      if (R.camY < y) D.quadPath(ctx, x, y, x + w, y, 0, hh);
      if (R.camY > y + d) D.quadPath(ctx, x, y + d, x + w, y + d, 0, hh);
      if (R.camX < x) D.quadPath(ctx, x, y, x, y + d, 0, hh);
      if (R.camX > x + w) D.quadPath(ctx, x + w, y, x + w, y + d, 0, hh);
    }
    ctx.fillStyle = R.shaded(c.col, 0.72); ctx.fill();
    ctx.beginPath();
    for (const s of segs) D.rectPath(ctx, s[0], s[1], s[2], s[3], hh);
    ctx.fillStyle = R.shaded(c.col, 1.04); ctx.fill();
  }

  function drawFrame(ctx, b) {
    // under-construction RCC frame: columns + slabs, rebar stubs on top
    const D = N.draw, R = N.render;
    const floors = b.floors || Math.round(b.h / 10);
    const cols = [[b.x, b.y], [b.x + b.w - 2, b.y], [b.x, b.y + b.d - 2], [b.x + b.w - 2, b.y + b.d - 2], [b.x + b.w / 2 - 1, b.y], [b.x + b.w / 2 - 1, b.y + b.d - 2]];
    for (let f = 0; f < floors; f++) {
      const h0 = f * 10;
      ctx.beginPath();
      for (const c of cols) { D.quadPath(ctx, c[0], c[1] + 1, c[0] + 2, c[1] + 1, h0, h0 + 9); D.quadPath(ctx, c[0] + 1, c[1], c[0] + 1, c[1] + 2, h0, h0 + 9); }
      ctx.fillStyle = '#8f8b84'; ctx.fill();
      D.box(b.x - 0.5, b.y - 0.5, b.w + 1, b.d + 1, h0 + 9, h0 + 10, { wall: '#8f8b84', roof: '#bcb8b0' });
    }
    const k0 = R.k(floors * 10), k1 = R.k(floors * 10 + 3);
    ctx.strokeStyle = '#6a4a3a'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (const c of cols) { ctx.moveTo(R.sx(c[0] + 1, k0), R.sy(c[1] + 1, k0)); ctx.lineTo(R.sx(c[0] + 1, k1), R.sy(c[1] + 1, k1)); }
    ctx.stroke();
  }

  function drawCrane(ctx, s) {
    const R = N.render, D = N.draw;
    D.box(s.x - 1.5, s.y - 1.5, 3, 3, 0, s.h, { wall: '#e0a020', roof: '#f2c230' });
    const k = R.k(s.h + 1);
    const ca = Math.cos(s.a), sa = Math.sin(s.a);
    ctx.strokeStyle = '#e8b030'; ctx.lineWidth = Math.max(1, 1.6 * k);
    ctx.beginPath();
    ctx.moveTo(R.sx(s.x - ca * s.len * 0.3, k), R.sy(s.y - sa * s.len * 0.3, k));
    ctx.lineTo(R.sx(s.x + ca * s.len, k), R.sy(s.y + sa * s.len, k));
    ctx.stroke();
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(R.sx(s.x - ca * s.len * 0.3, k) - 2 * k, R.sy(s.y - sa * s.len * 0.3, k) - 2 * k, 4 * k, 4 * k);
  }

  // Tree canopy sprite (lit from the current sun octant)
  function treeImage(t, oct) {
    const key = t.id * 8 + oct;
    let c = treeCache.get(key);
    if (c) return c;
    const t0 = performance.now();
    try { return treeImageBuild(t, oct, key); } finally { wstats.treeBuilds++; wstats.treeMs += performance.now() - t0; }
  }
  function treeImageBuild(t, oct, key) {
    let c;
    const pad = 3, size = Math.ceil((t.r * 2 + pad * 2) * SPR_RES);
    c = treeCache.set(key, treeCache.put(key, size, size));
    const g = c.getContext('2d');
    const o = (t.r + pad) * SPR_RES;
    g.setTransform(SPR_RES, 0, 0, SPR_RES, o, o);
    const K = TREE_KINDS[t.kind] || TREE_KINDS.neem;
    const sa = (oct / 8) * Math.PI * 2, sdx = Math.cos(sa), sdy = Math.sin(sa);
    if (isPalm(t.kind)) {
      g.lineCap = 'round';
      for (let pass = 0; pass < 3; pass++) {
        g.strokeStyle = pass === 0 ? K.cols[3] : pass === 1 ? K.cols[1] : K.cols[2];
        g.lineWidth = pass === 0 ? 2.8 : pass === 1 ? 1.8 : 0.7;
        g.beginPath();
        for (const [a, L] of t.fronds) {
          const ex = Math.cos(a) * L, ey = Math.sin(a) * L;
          const lift = pass === 2 ? -0.5 : 0;
          g.moveTo(0, 0);
          g.quadraticCurveTo(ex * 0.6 - ey * 0.12 + sdx * lift, ey * 0.6 + ex * 0.12 + sdy * lift, ex, ey);
        }
        g.stroke();
      }
      g.fillStyle = '#6a5030'; g.beginPath(); g.arc(0, 0, 1.6, 0, Math.PI * 2); g.fill();
    } else {
      const layers = [[0, 1.0, 0], [1, 0.84, 0.12], [2, 0.6, 0.25]];
      for (const [ci, sc, off] of layers) {
        g.fillStyle = K.cols[ci];
        g.beginPath();
        for (const [bx, by, br] of t.blobs) {
          const X = bx + sdx * br * off, Y = by + sdy * br * off, rr = br * sc;
          g.moveTo(X + rr, Y); g.arc(X, Y, rr, 0, Math.PI * 2);
        }
        g.fill();
      }
      g.fillStyle = K.cols[3];
      for (let i = 0; i < t.blobs.length; i += 2) {
        const [bx, by, br] = t.blobs[i];
        g.fillRect(bx + sdx * br * 0.45 - 0.6, by + sdy * br * 0.45 - 0.6, 1.2, 1.2);
      }
      if (t.flowers.length) {
        const byCol = {};
        for (const f of t.flowers) (byCol[f[3]] || (byCol[f[3]] = [])).push(f);
        for (const col in byCol) {
          g.fillStyle = col; g.beginPath();
          for (const [fx, fy, fr] of byCol[col]) { g.moveTo(fx + fr, fy); g.arc(fx, fy, fr, 0, Math.PI * 2); }
          g.fill();
        }
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  }

  function drawTree(ctx, t) {
    const R = N.render;
    const p = N.player;
    let alpha = 1;
    if (p && !p.vehicle) {
      const dx = p.x - t.x, dy = p.y - t.y;
      if (dx * dx + dy * dy < (t.r + 5) * (t.r + 5)) alpha = 0.45;
    }
    const kt = R.k(t.h), k0 = R.k(0), km = R.k(t.h * 0.85);
    const palm = isPalm(t.kind);
    ctx.strokeStyle = palm ? '#8a6a4a' : '#5a4030';
    ctx.lineWidth = Math.max(1, (palm ? 1.6 : t.kind === 'banyan' ? 3 : 2) * k0);
    ctx.beginPath(); ctx.moveTo(R.sx(t.x, k0), R.sy(t.y, k0)); ctx.lineTo(R.sx(t.x, km), R.sy(t.y, km)); ctx.stroke();
    const oct = ((Math.round((Math.atan2(R.sun.dy, R.sun.dx) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
    const img = treeImage(t, oct);
    const half = (t.r + 3) * kt;
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, R.sx(t.x, kt) - half, R.sy(t.y, kt) - half, half * 2, half * 2);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
  }

  function drawLamp(ctx, l) {
    const R = N.render;
    const k0 = R.k(0), k1 = R.k(l.h);
    const X0 = R.sx(l.x, k0), Y0 = R.sy(l.y, k0), X1 = R.sx(l.x, k1), Y1 = R.sy(l.y, k1);
    ctx.strokeStyle = l.tube ? '#6a6a70' : '#4a4a52'; ctx.lineWidth = Math.max(1, 1.3 * k0);
    ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1);
    for (const a of l.arms) { ctx.lineTo(R.sx(l.x + a[0], k1), R.sy(l.y + a[1], k1)); ctx.moveTo(X1, Y1); }
    ctx.stroke();
    const night = R.night || 0;
    ctx.fillStyle = night > 0.2 ? (l.tube ? '#f0fbff' : '#ffe0a0') : '#d8d4c8';
    for (const a of l.arms) {
      const hx = R.sx(l.x + a[0], k1), hy = R.sy(l.y + a[1], k1);
      ctx.fillRect(hx - 1.5 * k1, hy - 1 * k1, 3 * k1, 2 * k1);
    }
  }

  // dev-only switches used by profiling scripts (N.world.detail.windows = false, ...)
  const DETAIL = (W.detail = { windows: true, items: true, awnings: true, roofs: true, walls: true });
  const DRAW = {
    bldg(ctx, b) {
      const D = N.draw, R = N.render;
      const vis = D.visibleWalls(b.x, b.y, b.w, b.d);
      const frontVis = b.front ? (vis & FACEBIT[b.front]) !== 0 : false;
      if (b.awning && !frontVis && DETAIL.awnings) drawAwning(ctx, b);
      if (b.roofType === 'frame') { drawFrame(ctx, b); return; }
      if (b.cwall && !frontVis) drawLowWall(ctx, b);
      const pitched = b.roofType === 'hip' || b.roofType === 'gable';
      if (!b._st) b._st = { wall: b.wall, roof: false, wallFn: (c, face) => drawWallDetail(c, b, face) };
      b._st.wallFn = DETAIL.windows ? b._st.wallFn || ((c, face) => drawWallDetail(c, b, face)) : null;
      if (DETAIL.walls) D.box(b.x, b.y, b.w, b.d, 0, b.h, b._st);
      if (pitched) drawHipRoof(ctx, b, b.roofType === 'gable');
      else if (DETAIL.roofs) {
        const k1 = R.k(b.h);
        const img = roofImage(b);
        const p = 1 / SPR_RES;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, R.sx(b.x - p, k1), R.sy(b.y - p, k1), (b.w + 2 * p) * k1, (b.d + 2 * p) * k1);
        ctx.imageSmoothingEnabled = false;
        if (DETAIL.items) drawItems3D(ctx, b);
        if (b.sign && b._signC) {
          const [sx, sy, sw, sh] = b._signC;
          const vert = b.front === 'W' || b.front === 'E';
          const tw = D.pixelTextWidth(b.sign.text);
          if (tw <= (vert ? sh : sw) * k1 + 2) D.pixelText(sx, sy, b.h, b.sign.text, b.sign.fg, vert ? { rot: b.front === 'E' ? -1 : 1 } : null);
        }
      }
      if (b.awning && frontVis && DETAIL.awnings) drawAwning(ctx, b);
      if (b.cwall && frontVis) drawLowWall(ctx, b);
    },
    wall(ctx, s) { N.draw.box(s.x, s.y, s.w, s.d, 0, s.h, { wall: s.col, roof: N.render.shaded(s.col, 1.05) }); },
    rail(ctx, s) { N.draw.poly(s.pts, 0, s.h, { wall: '#b8b0a2', roof: '#d8d0c2' }); },
    tree: drawTree,
    lamp: drawLamp,
    rock(ctx, s) {
      for (const p of s.parts) N.draw.dome(s.x + p[0], s.y + p[1], p[2], p[3], p[4], { fill: s.col, steps: 5 });
    },
    crane: drawCrane,
    roofzone(ctx, s) { drawDeck(ctx, s.roof); },
    podium(ctx, s) { drawPodium(ctx, s); },
    landmark(ctx, s) {
      // landmarks normally enqueue themselves via N.landmarks.enqueue; this is the fallback
      if (N.landmarks && N.landmarks.drawDefault) N.landmarks.drawDefault(s.lm);
    },
  };
  W._fx = { DRAW, treeImage, TREE_KINDS, isPalm, DETAIL }; // [atmosphere hook] wind.js sways trees / clothes through the draw table

  /* ========================================================= roof zones */
  // Walkable walled terraces (ARCHITECTURE §7 "Roof zones"; data: WORLD_DATA.roofs / planks).
  // One extra surface grid (`roofGrid`, same size as the ground grid) holds every roof floor
  // (PLAZA) and every plank (FOOTPATH); everything else is VOID. While an actor that is on a roof
  // updates, `grid` is swapped to roofGrid, so collide / surfaceAt / isWalkable / findFree /
  // raycast work on the roof level unchanged (no fall is possible: off the roof is VOID).
  // The player (and any actor put on a roof with N.world.roofs.place) is drawn at the roof's
  // height by the roof's own render-queue item, right after the building under it.
  let roofGrid = null;
  const roofCell = new Map();   // cell index -> {roof} | {plank}
  const roofActors = new Set(); // actors currently on a roof (the player included)
  const ROOF_IN = 2;            // walkable floor = footprint inset by the parapet (u)
  const PARA_H = 3.6, PARA_T = 1.4;
  const RF = (W.roofs = {
    list: [], planks: [], byId: {},
    /** roof object by id */
    get(id) { return (id && RF.byId[id]) || null; },
    /** {roof, plank, h} for a walkable roof/plank cell at (x, y), or null */
    at(x, y) {
      const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
      if (!(i >= 0 && j >= 0 && i < GW && j < GH)) return null;
      const c = roofCell.get(j * GW + i);
      if (!c) return null;
      return { roof: c.roof || roofOfPlank(c.plank, x, y), plank: c.plank || null, h: heightOn(c, x, y) };
    },
    /** roof floor height at (x, y) (0 = not on a roof) */
    heightAt(x, y) { const a = RF.at(x, y); return a ? a.h : 0; },
    /** roofs in a group / with a tag ('colony', 'lootna', 'antenna', 'candles', 'kites', 'ending'...) */
    byGroup(g) { return RF.list.filter((r) => r.group === g); },
    byTag(t) { return RF.list.filter((r) => r.tags && r.tags.indexOf(t) >= 0); },
    /** the lootna route in order (M1): home_terrace ... lakshmi_t6 */
    route(group) { return RF.byGroup(group || 'lakshmi_lootna').sort((a, b) => (a.order || 0) - (b.order || 0)); },
    /** which roof an actor stands on (id) or null */
    onRoof(actor) { return (actor && actor.level) || null; },
    /** Climb the stairs: put `actor` (default the player) on the landing of roof `id` (stair k). */
    climb(id, k, actor, opts) { return climbRoof(RF.get(id), k || 0, actor || N.player, opts || {}); },
    /** Go down: the actor leaves its roof by the nearest stairs (or to {x, y} on the ground). */
    descend(actor, opts) { return descendRoof(actor || N.player, opts || {}); },
    /** Put an actor (NPC) on a roof at (x, y) (default: the landing); it is drawn at roof height. */
    place(actor, id, x, y) { return putOnRoof(actor, RF.get(id), x, y); },
    /** Take an actor off its roof (to (x, y) on the ground, default the stairs foot). */
    remove(actor, x, y) { return takeOffRoof(actor, x, y); },
    /** Run fn with the world queries switched to the roof level (advanced). */
    withRoof(fn) { return withRoofGrid(fn); },
    actors: roofActors,
    stats: { cells: 0 },
  });

  function roofOfPlank(p, x, y) {
    if (!p) return null;
    const t = plankT(p, x, y);
    return t < 0.5 ? p.ra : p.rb;
  }
  // 0 at the `a` end, 1 at the `b` end of a plank
  function plankT(p, x, y) {
    const [px, py, pw, pd] = p.rect;
    const t = p.horiz ? (x - px) / pw : (y - py) / pd;
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    return p.aFirst ? tt : 1 - tt;
  }
  function heightOn(c, x, y) {
    if (c.roof) return c.roof.h;
    const p = c.plank, t = plankT(p, x, y);
    return p.ra.h + (p.rb.h - p.ra.h) * t;
  }
  function withRoofGrid(fn) {
    if (!roofGrid) return fn();
    const g = grid;
    grid = roofGrid;
    try { return fn(); } finally { grid = g; }
  }
  W.withRoof = withRoofGrid;

  // ---- build: colony houses under data roofs (before the block filler), then the roof grid
  function buildRoofHouses(D, out, rng) {
    for (const r of D.roofs || []) {
      if (r.building) continue;
      const [x, y, w, d] = r.rect;
      const dist = W.districtAt(x + w / 2, y + d / 2);
      const style = r.style || (dist && dist.style === 'oldcity' ? 'oldcity' : 'colony');
      const b = newBuilding(x, y, w, d, r.h, STY[style] ? style : 'colony', rng, { items: [{ t: 'stain', x: x + w * 0.3, y: y + d * 0.6, r: 3 }, { t: 'stain', x: x + w * 0.7, y: y + d * 0.3, r: 2.5 }], parapet: 0, roofZone: r.id });
      if (r.wall) b.wall = r.wall;
      b.roof = r.floor || '#cdbfa6';
      b.trim = U.shade(b.wall, 1.12);
      b.front = (r.stairs && r.stairs[0] && r.stairs[0].face || 's').toUpperCase();
      b.gf = 'door';
      solidRect(x, y, w, d);
      out.bldgs.push(b);
      r._bldg = b;
    }
  }
  function buildRoofs(D) {
    const keep = Array.from(roofActors);
    RF.list = []; RF.planks = []; RF.byId = {};
    roofCell.clear(); roofActors.clear();
    const roofs = D.roofs || [];
    if (!roofs.length) { roofGrid = null; return; }
    if (!roofGrid || roofGrid.length !== GW * GH) roofGrid = new Uint8Array(GW * GH); // (fresh = all VOID)
    else roofGrid.fill(S.VOID);
    const LM = {}; for (const l of D.landmarks) LM[l.id] = l;
    const cellRect = (x0, y0, x1, y1, fn) => { // cells fully inside [x0,x1]x[y0,y1]
      const i0 = Math.ceil(x0 / CELL), i1 = Math.floor(x1 / CELL) - 1, j0 = Math.ceil(y0 / CELL), j1 = Math.floor(y1 / CELL) - 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < GW && j < GH) fn(j * GW + i, i, j);
    };
    const cellTouch = (x0, y0, x1, y1, fn) => { // cells touching the rect
      const i0 = Math.floor(x0 / CELL), i1 = Math.ceil(x1 / CELL) - 1, j0 = Math.floor(y0 / CELL), j1 = Math.ceil(y1 / CELL) - 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < GW && j < GH) fn(j * GW + i, i, j);
    };
    for (const src of roofs) {
      const r = Object.assign({}, src);
      r.data = src;
      const [x, y, w, d] = r.rect;
      r.x = x; r.y = y; r.w = w; r.d = d; r.cx = x + w / 2; r.cy = y + d / 2;
      const lm = r.building ? LM[r.building] : null;
      r.lm = lm || null;
      // sort key reference = whatever draws the building under the roof (same distKey)
      if (lm) { r.kx = lm.x; r.ky = lm.y; } else if (src._bldg) { r.kx = src._bldg.cx; r.ky = src._bldg.cy; r.bldg = src._bldg; } else { r.kx = r.cx; r.ky = r.cy; }
      r.solids = (src.solids || []).map((s) => s.slice());
      r.stairs = (src.stairs || []).map((s) => Object.assign({}, s));
      r.items = [];
      if (!lm) planRoofItems(r);
      else r.antenna = { x: x + 5, y: y + 5, h: 12, a: 0.7 }; // places_art's home_house layout (approx.)
      for (const s of r.solids) r.items.push({ t: 'solid', s });
      RF.list.push(r); RF.byId[r.id] = r;
      cellRect(x + ROOF_IN, y + ROOF_IN, x + w - ROOF_IN, y + d - ROOF_IN, (o) => { roofGrid[o] = S.PLAZA; roofCell.set(o, { roof: r }); });
    }
    for (const r of RF.list) for (const s of r.solids) cellTouch(s[0], s[1], s[0] + s[2], s[1] + s[3], (o) => { if (roofCell.has(o) && roofCell.get(o).roof === r) { roofGrid[o] = S.VOID; roofCell.delete(o); } });
    for (const src of D.planks || []) {
      const ra = RF.byId[src.a], rb = RF.byId[src.b];
      if (!ra || !rb) continue;
      const [px, py, pw, pd] = src.rect;
      const horiz = pw >= pd;
      const p = { id: src.id, a: src.a, b: src.b, ra, rb, rect: src.rect.slice(), horiz, data: src };
      p.aFirst = horiz ? ra.cx < rb.cx : ra.cy < rb.cy;
      p.cx = px + pw / 2; p.cy = py + pd / 2;
      RF.planks.push(p);
      (ra.planks || (ra.planks = [])).push(p); (rb.planks || (rb.planks = [])).push(p);
      cellRect(px, py, px + pw, py + pd, (o) => { const c = roofCell.get(o); if (c && c.roof) return; roofGrid[o] = S.FOOTPATH; roofCell.set(o, { plank: p }); });
    }
    // landings are always walkable (nudge to the nearest roof cell of that roof)
    for (const r of RF.list) {
      for (const s of r.stairs) {
        const c = RF.at(s.tx, s.ty);
        if (!c || c.roof !== r) {
          let best = null, bd = Infinity;
          for (const [o, cc] of roofCell) {
            if (cc.roof !== r) continue;
            const cx = (o % GW + 0.5) * CELL, cy = (Math.floor(o / GW) + 0.5) * CELL, dd = (cx - s.tx) ** 2 + (cy - s.ty) ** 2;
            if (dd < bd) { bd = dd; best = [cx, cy]; }
          }
          if (best) { s.tx = best[0]; s.ty = best[1]; }
        }
      }
      r.door = r.stairs[0] || null;
    }
    RF.stats.cells = roofCell.size;
    // places on roofs: copy the level onto N.places entries (core keeps only the basic fields)
    for (const p of D.places) {
      if (!N.places[p.id]) continue;
      if (p.level) N.places[p.id].level = p.level;
      if (p.roof) N.places[p.id].roof = p.roof;
      if (p.podium) N.places[p.id].podium = true;
      if (p.virtual) N.places[p.id].virtual = true;
    }
    for (const r of RF.list) addStructure({ t: 'roofzone', roof: r, x0: r.x - 12, y0: r.y - 12, x1: r.x + r.w + 12, y1: r.y + r.d + 12, cx: r.kx, cy: r.ky });
    // a rebuild while someone stands on a roof: keep them up there if that roof still exists
    for (const a of keep) {
      const c = RF.at(a.x, a.y);
      if (c && c.roof) { roofActors.add(a); a.level = c.roof.id; a._roofOn = roofCell.get(Math.floor(a.y / CELL) * GW + Math.floor(a.x / CELL)) || null; }
      else { a.level = null; if (a._roofNC) { a._roofNC = false; a.noCollide = a._roofNCWas || false; } }
    }
  }
  // Generated colony-house terrace: stair room (mumty) by the first stairs, Sintex tank on it,
  // TV antenna in the far corner, a clothesline, sometimes a cot or chillies drying.
  function planRoofItems(r) {
    const { x, y, w, d } = r;
    const rng = U.rng('roof:' + r.id);
    const st = r.stairs[0];
    const M = 8;
    if (st) {
      const f = st.face;
      let mx, my, door;
      const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
      if (f === 'n' || f === 's') { mx = cl(st.x - M / 2, x + 2, x + w - 2 - M); my = f === 'n' ? y + 2 : y + d - 2 - M; door = f === 'n' ? 's' : 'n'; }
      else { my = cl(st.y - M / 2, y + 2, y + d - 2 - M); mx = f === 'w' ? x + 2 : x + w - 2 - M; door = f === 'w' ? 'e' : 'w'; }
      r.mumty = { x: mx, y: my, w: M, d: M, h: 8, door };
      r.solids.push([mx, my, M, M]);
      // landing in front of the stair-room door
      if (door === 's') { st.tx = mx + M / 2; st.ty = my + M + 4; }
      else if (door === 'n') { st.tx = mx + M / 2; st.ty = my - 4; }
      else if (door === 'e') { st.tx = mx + M + 4; st.ty = my + M / 2; }
      else { st.tx = mx - 4; st.ty = my + M / 2; }
      r.tank = { x: mx + M / 2, y: my + M / 2, r: 2.3, on: true };
    }
    // antenna in the corner farthest from the stair room
    const corners = [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + d - 4], [x + w - 4, y + d - 4]];
    let far = corners[0], fd = -1;
    for (const c of corners) { const dd = r.mumty ? (c[0] - r.mumty.x - 4) ** 2 + (c[1] - r.mumty.y - 4) ** 2 : rng.next(); if (dd > fd) { fd = dd; far = c; } }
    r.antenna = { x: far[0], y: far[1], h: 10 + rng.next() * 3, a: rng.next() * Math.PI };
    // clothesline across the long side, clear of the stair room
    const horiz = w >= d;
    const cl = [];
    const L = horiz ? w - 8 : d - 8;
    for (let u = 2; u < L - 2; u += 2.4 + rng.next() * 1.6) if (rng.next() < 0.75) cl.push([u / L, CLOTHES[(rng.next() * CLOTHES.length) | 0], 1.4 + rng.next() * 1.6]);
    if (horiz) { const ly = r.mumty && r.mumty.y < y + d / 2 ? y + d * 0.68 : y + d * 0.34; r.line = { x0: x + 4, y0: ly, x1: x + w - 4, y1: ly, cl }; }
    else { const lx = r.mumty && r.mumty.x < x + w / 2 ? x + w * 0.68 : x + w * 0.34; r.line = { x0: lx, y0: y + 4, x1: lx, y1: y + d - 4, cl }; }
    if (rng.next() < 0.35 && w * d > 700) r.chilli = { x: x + w * 0.3, y: y + d * 0.42, w: 6, d: 3.4 };
    if (r.tags && r.tags.indexOf('kites') >= 0) r.kites = { x: x + w * 0.62, y: y + d * 0.55 };
  }

  // ---- actors on roofs
  function setLevel(actor, roof, silent) {
    const prev = actor.level || null, next = roof ? roof.id : null;
    if (prev === next) return;
    actor.level = next;
    if (next) {
      roofActors.add(actor);
      if (!actor._roofNC) { actor._roofNC = true; actor._roofNCWas = !!actor.noCollide; actor.noCollide = true; }
    } else {
      roofActors.delete(actor);
      if (actor._roofNC) { actor._roofNC = false; actor.noCollide = actor._roofNCWas || false; actor._roofOn = null; }
    }
    if (silent) return;
    const pr = prev ? RF.byId[prev] : null;
    if (pr) N.emit('roof:exit', { roof: pr, id: prev, actor });
    if (roof) N.emit('roof:enter', { roof, id: next, actor });
    if (actor === N.player) N.emit('player:level', { level: next, prev });
  }
  function afterRoofMove(actor) {
    const i = Math.floor(actor.x / CELL), j = Math.floor(actor.y / CELL);
    const c = i >= 0 && j >= 0 && i < GW && j < GH ? roofCell.get(j * GW + i) : null;
    if (!c) { // never step off a roof: back to the last good roof spot
      if (isFinite(actor._roofX)) { actor.x = actor._roofX; actor.y = actor._roofY; } else if (actor.level) takeOffRoof(actor);
      actor.vx = actor.vy = 0;
      return;
    }
    actor._roofX = actor.x; actor._roofY = actor.y; actor._roofOn = c;
    const r = c.roof || roofOfPlank(c.plank, actor.x, actor.y);
    if (r && r.id !== actor.level) setLevel(actor, r);
  }
  function putOnRoof(actor, roof, x, y) {
    if (!actor || !roof) return false;
    const st = roof.stairs[0];
    if (x == null || !isFinite(x)) { x = st ? st.tx : roof.cx; y = st ? st.ty : roof.cy; }
    let a = RF.at(x, y);
    if (!a) { // nearest roof cell of that roof
      const f = withRoofGrid(() => W.findFree(x, y, 'walk', 12));
      if (f) { x = f.x; y = f.y; a = RF.at(x, y); }
    }
    if (!a) return false;
    if (actor.vehicle && N.vehicles && N.vehicles.exit) { try { N.vehicles.exit(actor, true); } catch (e) { N.err('roofs.exit', e); } }
    hookActor(actor);
    actor.x = x; actor.y = y; actor.vx = 0; actor.vy = 0;
    actor._roofX = x; actor._roofY = y; actor.goodX = x; actor.goodY = y;
    setLevel(actor, a.roof);
    actor._roofOn = roofCell.get(Math.floor(y / CELL) * GW + Math.floor(x / CELL)) || null;
    return true;
  }
  function takeOffRoof(actor, x, y) {
    if (!actor) return false;
    const r = actor.level ? RF.byId[actor.level] : null;
    if (x == null || !isFinite(x)) {
      let best = null, bd = Infinity;
      const all = r ? r.stairs : [];
      for (const s of all) { const dd = (s.tx - actor.x) ** 2 + (s.ty - actor.y) ** 2; if (dd < bd) { bd = dd; best = s; } }
      if (best) { x = best.x; y = best.y; } else { x = actor.x; y = actor.y; }
    }
    setLevel(actor, null);
    if (!W.isWalkable(x, y)) { const f = W.findFree(x, y, 'walk', 60); if (f) { x = f.x; y = f.y; } }
    actor.x = x; actor.y = y; actor.vx = 0; actor.vy = 0; actor.goodX = x; actor.goodY = y;
    return true;
  }
  // wrap an actor's update/draw once so it works on the roof level
  function hookActor(a) {
    if (!a || a._roofHooked) return;
    a._roofHooked = true;
    if (a.level === undefined) a.level = null;
    const upd = a.update, drw = a.draw;
    a.update = function (dt) {
      if (!this.level) return upd.call(this, dt);
      if (this.vehicle) { setLevel(this, null); return upd.call(this, dt); }
      // moved off the roof by a script (x/y set directly, far from the last roof spot): ground again
      if (!RF.at(this.x, this.y) && !(Math.abs(this.x - this._roofX) < 30 && Math.abs(this.y - this._roofY) < 30)) { setLevel(this, null); return upd.call(this, dt); }
      withRoofGrid(() => upd.call(this, dt));
      afterRoofMove(this);
    };
    a.draw = function () {
      if (this.level && !this.vehicle) return; // drawn by its roof's render-queue item
      return drw.call(this);
    };
  }
  function installPlayerHooks() {
    const p = N.player;
    if (!p || p._roofPlayerHooks) return;
    p._roofPlayerHooks = true;
    hookActor(p);
    const tp = p.teleport, rst = p.reset, ser = p.serialize, des = p.deserialize;
    /** teleport(x, y, {ground}) — a point on a roof puts the player on that roof */
    p.teleport = function (x, y, opts) {
      const a = isFinite(x) && isFinite(y) && !(opts && opts.ground) ? RF.at(x, y) : null;
      if (a) {
        if (this.vehicle && N.vehicles && N.vehicles.exit) { try { N.vehicles.exit(this, true); } catch (e) { N.err('teleport.exit', e); } }
        this.vehicle = null; this.mode = 'foot';
        putOnRoof(this, a.roof, x, y);
        N.render.snapCamera(); N.render.warmChunks(x, y, 500);
        N.emit('player:teleport', { x, y, level: this.level });
        return;
      }
      if (this.level) setLevel(this, null);
      return tp.call(this, x, y, opts);
    };
    p.reset = function () { if (this.level) setLevel(this, null, true); return rst.apply(this, arguments); };
    if (ser) p.serialize = function () { const o = ser.apply(this, arguments); if (o && this.level) o.level = this.level; return o; };
    if (des) p.deserialize = function (o) {
      if (this.level) setLevel(this, null, true);
      const r = des.apply(this, arguments);
      if (o && o.level && RF.byId[o.level]) putOnRoof(this, RF.byId[o.level], this.x, this.y);
      return r;
    };
  }

  // ---- stairs: interactables + the little fade
  const fade = { t: 0, dur: 0, cb: null, done: false, actor: null };
  function climbRoof(roof, k, actor, opts) {
    if (!roof || !actor) return false;
    const st = roof.stairs[k] || roof.stairs[0];
    const go = () => {
      if (!putOnRoof(actor, roof, st ? st.tx : null, st ? st.ty : null)) return;
      if (actor === N.player) { N.render.snapCamera(); N.emit('door', { kind: 'wood', x: actor.x, y: actor.y }); }
      N.emit('roof:climb', { roof, id: roof.id, actor });
    };
    if (opts.instant || actor !== N.player || !N.state.is('play')) { go(); return true; }
    startFade(actor, go);
    return true;
  }
  function descendRoof(actor, opts) {
    if (!actor || !actor.level) return false;
    const roof = RF.byId[actor.level];
    const go = () => {
      takeOffRoof(actor, opts.x, opts.y);
      if (actor === N.player) { N.render.snapCamera(); N.emit('door', { kind: 'wood', x: actor.x, y: actor.y }); }
      N.emit('roof:descend', { roof, id: roof && roof.id, actor });
    };
    if (opts.instant || actor !== N.player || !N.state.is('play')) { go(); return true; }
    startFade(actor, go);
    return true;
  }
  function startFade(actor, cb) {
    if (fade.cb) { try { fade.cb(); } catch (e) { N.err('roofs.fade', e); } }
    fade.t = 0; fade.dur = 0.42; fade.cb = cb; fade.done = false; fade.actor = actor;
    actor._roofLockWas = actor.controlsLocked; actor.controlsLocked = true;
  }
  function tickFade(dt) {
    if (!fade.cb && !fade.done) return;
    fade.t += dt;
    const half = fade.dur / 2;
    if (!fade.done && fade.t >= half) { const cb = fade.cb; fade.cb = null; fade.done = true; try { cb(); } catch (e) { N.err('roofs.fade', e); } }
    const a = fade.t < half ? fade.t / half : Math.max(0, 1 - (fade.t - half) / half);
    N.render.fx.fade = Math.max(0, Math.min(0.85, a * 0.85));
    if (fade.t >= fade.dur) {
      N.render.fx.fade = 0; fade.done = false;
      if (fade.actor) { fade.actor.controlsLocked = !!fade.actor._roofLockWas; fade.actor = null; }
    }
  }
  function addStairInteractables() {
    const I = N.interact;
    if (!I || !I.add) return;
    for (const r of RF.list) {
      r.stairs.forEach((s, k) => {
        const up = r.upLabel || (r.id === 'home_terrace' ? 'Go up to the terrace' : r.id === 'friend_terrace' ? "Up to Immu's terrace" : 'Climb to the terrace');
        I.add('roof:' + r.id + ':up:' + k, { x: s.x, y: s.y, r: 12, priority: 2, level: 'ground', label: up, use: () => climbRoof(r, k, N.player, {}) });
        I.add('roof:' + r.id + ':down:' + k, { x: s.tx, y: s.ty, r: 11, priority: 2, level: r.id, label: 'Go downstairs', use: () => descendRoof(N.player, { x: s.x, y: s.y }) });
      });
    }
  }
  // interactables / offers know their level: spec.level = '<roof id>' | 'roof' | 'ground' | '*';
  // without one, a registered spec is on the level of its point (a roof cell = that roof)
  function levelOK(spec, p) {
    const pl = (p && p.level) || null;
    const lv = spec.level;
    if (lv === '*') return true;
    if (lv === 'ground') return !pl;
    if (lv === 'roof') return !!pl;
    if (lv) return pl === lv;
    const e = spec.entity;
    if (e) return (e.level || null) === pl;
    if (spec.x == null || spec.y == null) return true;
    return RF.at(spec.x, spec.y) ? !!pl : !pl;
  }
  function installInteractLevels() {
    const I = N.interact;
    if (!I || I._levels) return;
    I._levels = true;
    const add = I.add, offer = I.offer;
    I.add = function (id, spec) {
      if (spec && typeof spec === 'object' && !spec._lv) {
        spec._lv = true;
        const en = spec.enabled;
        spec.enabled = function (p) { if (!levelOK(spec, p)) return false; return en ? en.call(this, p) : true; };
      }
      return add.call(this, id, spec);
    };
    I.offer = function (spec) {
      const p = N.player, pl = p && p.level;
      if (spec) {
        const lv = spec.level;
        if (pl) { if (!(lv === '*' || lv === 'roof' || lv === pl || (spec.priority || 0) >= 5)) return; }
        else if (lv && lv !== '*' && lv !== 'ground') return;
      }
      return offer.call(this, spec);
    };
    I.levelOK = levelOK;
  }

  // ---- drawing
  const deckQ = [];
  // project helper (screen coords at height h)
  function P(x, y, h) { const R = N.render, k = R.k(h); return [R.sx(x, k), R.sy(y, k)]; }
  function drawParapet(ctx, r) {
    const D = N.draw, h = r.h, t = PARA_T, top = h + PARA_H;
    const col = r.bldg ? r.bldg.trim : r.lm ? '#efe6d2' : '#e8dcc6';
    const st = r._pst || (r._pst = { wall: col, roof: N.render.shaded(col, 1.08) });
    // gaps where planks rest on the parapet
    const gaps = { N: [], S: [], W: [], E: [] };
    for (const p of r.planks || []) {
      const [px, py, pw, pd] = p.rect;
      if (p.horiz) { if (px < r.x + 1 && px + pw > r.x - 1) gaps.W.push([py, py + pd]); if (px < r.x + r.w + 1 && px + pw > r.x + r.w - 1) gaps.E.push([py, py + pd]); }
      else { if (py < r.y + 1 && py + pd > r.y - 1) gaps.N.push([px, px + pw]); if (py < r.y + r.d + 1 && py + pd > r.y + r.d - 1) gaps.S.push([px, px + pw]); }
    }
    const seg = (a0, a1, list, fn) => {
      let s = a0;
      for (const g of list.sort((u, v) => u[0] - v[0])) { if (g[0] > s) fn(s, Math.min(g[0], a1)); s = Math.max(s, g[1]); }
      if (s < a1) fn(s, a1);
    };
    const R = N.render;
    // far walls first (inner faces visible), near walls last
    const walls = [
      ['N', r.cy - R.camY], ['S', R.camY - r.cy], ['W', r.cx - R.camX], ['E', R.camX - r.cx],
    ].sort((a, b) => b[1] - a[1]);
    for (const [f] of walls) {
      if (f === 'N') seg(r.x, r.x + r.w, gaps.N, (a, b) => D.box(a, r.y, b - a, t, h, top, st));
      else if (f === 'S') seg(r.x, r.x + r.w, gaps.S, (a, b) => D.box(a, r.y + r.d - t, b - a, t, h, top, st));
      else if (f === 'W') seg(r.y, r.y + r.d, gaps.W, (a, b) => D.box(r.x, a, t, b - a, h, top, st));
      else seg(r.y, r.y + r.d, gaps.E, (a, b) => D.box(r.x + r.w - t, a, t, b - a, h, top, st));
    }
  }
  function drawStairDoor(ctx, r, s) {
    const R = N.render, f = s.face;
    // the wall must face the camera
    if (f === 'n' && !(R.camY < r.y)) return; if (f === 's' && !(R.camY > r.y + r.d)) return;
    if (f === 'w' && !(R.camX < r.x)) return; if (f === 'e' && !(R.camX > r.x + r.w)) return;
    const hw = 2.6, hh = 8.4;
    let a, b;
    if (f === 'n') { a = [s.x - hw, r.y]; b = [s.x + hw, r.y]; } else if (f === 's') { a = [s.x - hw, r.y + r.d]; b = [s.x + hw, r.y + r.d]; }
    else if (f === 'w') { a = [r.x, s.y - hw]; b = [r.x, s.y + hw]; } else { a = [r.x + r.w, s.y - hw]; b = [r.x + r.w, s.y + hw]; }
    ctx.beginPath(); N.draw.quadPath(ctx, a[0], a[1], b[0], b[1], 0, hh + 0.8); ctx.fillStyle = '#efe6d4'; ctx.fill();
    const ix = (b[0] - a[0]) * 0.12, iy = (b[1] - a[1]) * 0.12;
    ctx.beginPath(); N.draw.quadPath(ctx, a[0] + ix, a[1] + iy, b[0] - ix, b[1] - iy, 0, hh); ctx.fillStyle = '#6a4228'; ctx.fill();
    // a small step
    ctx.beginPath(); N.draw.quadPath(ctx, a[0] - ix, a[1] - iy, b[0] + ix, b[1] + iy, 0, 0.9); ctx.fillStyle = '#9a9088'; ctx.fill();
  }
  function drawMumty(r) {
    const m = r.mumty, D = N.draw, R = N.render, h = r.h;
    const wall = r.bldg ? r.bldg.wall : '#e8dcc6';
    D.box(m.x, m.y, m.w, m.d, h, h + m.h, r._mst || (r._mst = { wall, roof: R.shaded('#cdbfa6', 0.95) }));
    // the door on the landing side
    const ctx = R.ctx, dw = 2.4;
    let a, b, vis;
    if (m.door === 's') { a = [m.x + m.w / 2 - dw, m.y + m.d]; b = [m.x + m.w / 2 + dw, m.y + m.d]; vis = R.camY > m.y + m.d; }
    else if (m.door === 'n') { a = [m.x + m.w / 2 - dw, m.y]; b = [m.x + m.w / 2 + dw, m.y]; vis = R.camY < m.y; }
    else if (m.door === 'e') { a = [m.x + m.w, m.y + m.d / 2 - dw]; b = [m.x + m.w, m.y + m.d / 2 + dw]; vis = R.camX > m.x + m.w; }
    else { a = [m.x, m.y + m.d / 2 - dw]; b = [m.x, m.y + m.d / 2 + dw]; vis = R.camX < m.x; }
    if (vis) { ctx.beginPath(); N.draw.quadPath(ctx, a[0], a[1], b[0], b[1], h, h + 6.5); ctx.fillStyle = '#5a3a28'; ctx.fill(); }
    if (r.tank) { // Sintex drum on the stair room
      D.cyl(r.tank.x, r.tank.y, r.tank.r, h + m.h, h + m.h + 4.2, { wall: '#2e3136', roof: '#3b4048', grad: false });
    }
  }
  function drawAntenna(ctx, r) {
    const a = r.antenna, R = N.render, h = r.h;
    if (!a) return;
    const k0 = R.k(h), k1 = R.k(h + a.h), ca = Math.cos(a.a), sa = Math.sin(a.a);
    ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = 0.6; ctx.beginPath();
    ctx.moveTo(R.sx(a.x, k0), R.sy(a.y, k0)); ctx.lineTo(R.sx(a.x, k1), R.sy(a.y, k1));
    for (let i = 0; i < 3; i++) {
      const k = R.k(h + a.h - i * 2.2), L = 4.5 - i;
      ctx.moveTo(R.sx(a.x - ca * L, k), R.sy(a.y - sa * L, k)); ctx.lineTo(R.sx(a.x + ca * L, k), R.sy(a.y + sa * L, k));
    }
    ctx.stroke();
  }
  function drawLine(ctx, r) {
    const l = r.line, R = N.render, h = r.h + 5.5;
    if (!l) return;
    const a = P(l.x0, l.y0, h), b = P(l.x1, l.y1, h);
    const a0 = P(l.x0, l.y0, r.h), b0 = P(l.x1, l.y1, r.h);
    ctx.strokeStyle = '#6a6460'; ctx.lineWidth = 0.6; ctx.beginPath();
    ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b0[0], b0[1]); ctx.stroke();
    const k = R.k(h), dx = b[0] - a[0], dy = b[1] - a[1];
    const horiz = Math.abs(l.x1 - l.x0) > Math.abs(l.y1 - l.y0);
    for (const [t, c, s] of l.cl) {
      const px = a[0] + dx * t, py = a[1] + dy * t;
      ctx.fillStyle = c;
      if (horiz) ctx.fillRect(px, py, s * k, 2.2 * k); else ctx.fillRect(px - 1.1 * k, py, 2.2 * k, s * k * 0.6);
    }
  }
  function drawFloorBits(r) {
    if (!r.chilli && !r.kites) return;
    N.draw.plane(r.h, (g) => {
      if (r.chilli) { const c = r.chilli; g.fillStyle = '#e8dcc0'; g.fillRect(c.x, c.y, c.w, c.d); g.fillStyle = '#c82a1a'; for (let i = 0; i < 12; i++) g.fillRect(c.x + 0.4 + ((i * 2.3) % (c.w - 1)), c.y + 0.4 + ((i * 1.7) % (c.d - 1)), 0.9, 0.6); }
      if (r.kites) { const q = r.kites; for (let i = 0; i < 3; i++) { const kx = q.x + i * 3.2, ky = q.y + (i % 2) * 1.6; g.fillStyle = ['#e83a5a', '#2a5cb8', '#f2c230'][i]; g.beginPath(); g.moveTo(kx, ky - 1.6); g.lineTo(kx + 1.2, ky); g.lineTo(kx, ky + 1.6); g.lineTo(kx - 1.2, ky); g.closePath(); g.fill(); } }
    });
  }
  function drawRoofActor(ctx, a, h) {
    const R = N.render, D = N.draw;
    if (a.hidden) return;
    // soft contact shadow on the roof floor
    D.plane(h, (g) => { g.globalAlpha = 0.28; g.fillStyle = '#1a1020'; g.beginPath(); g.ellipse(a.x + 0.8, a.y + 1, 3.6, 3, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; });
    if (typeof a.roofDraw === 'function') { try { a.roofDraw(h); } catch (e) { N.err('roofs.actor', e); } return; }
    if (a.look && N.people) D.sprite(a.x, a.y, a.angle || 0, h + 8, (c) => N.people.draw(c, a.look, a.anim || { phase: 0, speed: 0 }));
    if (a === N.player) { // the idle "you are here" chevron, at roof height
      const al = Math.min(1, Math.max(0, ((a.idleT || 0) - 2.5) / 0.6));
      if (al > 0 && N.state.mode === 'play') {
        const k = R.k(h + 14), bob = Math.sin((N.time.real || 0) * 5) * 1.5;
        const X = R.sx(a.x, k), Y = R.sy(a.y, k) - 9 - bob;
        ctx.globalAlpha = al * 0.95; ctx.fillStyle = '#1a1214';
        ctx.beginPath(); ctx.moveTo(X - 4.5, Y - 4.5); ctx.lineTo(X + 4.5, Y - 4.5); ctx.lineTo(X, Y + 1.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(X - 3, Y - 3.6); ctx.lineTo(X + 3, Y - 3.6); ctx.lineTo(X, Y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }
  function drawDeck(ctx, r) {
    // ground-level stair doors (on the building's walls), then the terrace
    for (const s of r.stairs) drawStairDoor(ctx, r, s);
    drawParapet(ctx, r);
    drawFloorBits(r);
    const list = r._drawList || (r._drawList = []);
    list.length = 0;
    if (r.mumty) list.push({ y: r.mumty.y + r.mumty.d, f: 1 });
    if (r.antenna && !r.lm) list.push({ y: r.antenna.y, f: 2 });
    if (r.line) list.push({ y: Math.max(r.line.y0, r.line.y1), f: 3 });
    for (const a of r._actors) list.push({ y: a.y, a });
    list.sort((p, q) => p.y - q.y);
    for (const it of list) {
      if (it.a) drawRoofActor(ctx, it.a, r.h);
      else if (it.f === 1) drawMumty(r);
      else if (it.f === 2) drawAntenna(ctx, r);
      else drawLine(ctx, r);
    }
    // what roof furniture to draw on top for the seasons layer etc.
    if (RF.onDeck) { try { RF.onDeck(ctx, r); } catch (e) { N.err('roofs.onDeck', e); } }
  }
  function drawPlank(ctx, p) {
    const R = N.render, [x, y, w, d] = p.rect;
    const ha = p.ra.h, hb = p.rb.h;
    // corner heights: along the long axis from the a end to the b end
    const hAt = (px, py) => ha + (hb - ha) * plankT(p, px, py);
    const pad = 1.0;
    const c = p.horiz ? [[x, y + pad], [x + w, y + pad], [x + w, y + d - pad], [x, y + d - pad]] : [[x + pad, y], [x + w - pad, y], [x + w - pad, y + d], [x + pad, y + d]];
    const pts = c.map((q) => P(q[0], q[1], hAt(q[0], q[1]) + 0.2));
    const under = c.map((q) => P(q[0], q[1], hAt(q[0], q[1]) - 1.2));
    // thickness (front edge) then the boards
    ctx.fillStyle = '#5a3c24';
    ctx.beginPath(); ctx.moveTo(under[0][0], under[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(under[i][0], under[i][1]); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9a6a3c';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill();
    // board joints across
    ctx.strokeStyle = 'rgba(60,36,20,0.55)'; ctx.lineWidth = 0.5; ctx.beginPath();
    const L = p.horiz ? w : d;
    for (let u = 2.5; u < L; u += 2.5) {
      const q0 = p.horiz ? [x + u, y + pad] : [x + pad, y + u], q1 = p.horiz ? [x + u, y + d - pad] : [x + w - pad, y + u];
      const s0 = P(q0[0], q0[1], hAt(q0[0], q0[1]) + 0.25), s1 = P(q1[0], q1[1], hAt(q1[0], q1[1]) + 0.25);
      ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
    }
    ctx.stroke();
    // actors on the plank, then the two handrails (posts + rail) on the long sides
    for (const a of p._actors) drawRoofActor(ctx, a, hAt(a.x, a.y));
    ctx.strokeStyle = '#c8a050'; ctx.lineWidth = Math.max(0.8, 0.7 * R.k(ha));
    ctx.beginPath();
    const sides = p.horiz ? [y + pad + 0.3, y + d - pad - 0.3] : [x + pad + 0.3, x + w - pad - 0.3];
    for (const sv of sides) {
      const A = p.horiz ? [x, sv] : [sv, y], B = p.horiz ? [x + w, sv] : [sv, y + d];
      const n = Math.max(2, Math.round(L / 5));
      for (let i = 0; i <= n; i++) {
        const q = [A[0] + (B[0] - A[0]) * (i / n), A[1] + (B[1] - A[1]) * (i / n)], hh = hAt(q[0], q[1]);
        const s0 = P(q[0], q[1], hh), s1 = P(q[0], q[1], hh + 5);
        ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
      }
      const a1 = P(A[0], A[1], hAt(A[0], A[1]) + 5), b1 = P(B[0], B[1], hAt(B[0], B[1]) + 5);
      ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]);
    }
    ctx.stroke();
  }
  // enqueue after every other structure of the frame (same sort key as the building = right after it)
  function beginRoofs() {
    deckQ.length = 0;
    for (const r of RF.list) { if (r._actors) r._actors.length = 0; else r._actors = []; }
    for (const p of RF.planks) { if (p._actors) p._actors.length = 0; else p._actors = []; }
  }
  function enqueueRoofs() {
    const R = N.render;
    // actors on roofs go to the roof / plank they stand on
    for (const a of roofActors) {
      if (!a.level || a.alive === false) continue;
      const c = a._roofOn || roofCell.get(Math.floor(a.y / CELL) * GW + Math.floor(a.x / CELL));
      if (!c) continue;
      if (c.plank) c.plank._actors.push(a); else if (c.roof) { if (deckQ.indexOf(c.roof) < 0) deckQ.push(c.roof); c.roof._actors.push(a); }
    }
    for (const r of deckQ) { const rr = r; R.queue('structures', R.distKey(rr.kx, rr.ky), rr._qfn || (rr._qfn = (ctx) => drawDeck(ctx, rr))); }
    deckQ.length = 0;
    const v = R.view;
    for (const p of RF.planks) {
      const [x, y, w, d] = p.rect;
      if (x + w < v.x0 - 30 || x > v.x1 + 30 || y + d < v.y0 - 30 || y > v.y1 + 30) continue;
      const ka = R.distKey(p.ra.kx, p.ra.ky), kb = R.distKey(p.rb.kx, p.rb.ky);
      const pp = p;
      R.queue('structures', Math.max(ka, kb), pp._qfn || (pp._qfn = (ctx) => drawPlank(ctx, pp)));
    }
  }

  // podium junctions: a painted traffic-police podium with an umbrella (the constable is traffic.js's)
  function buildPodiums(D) {
    W.podiums = [];
    for (const p of D.places) {
      if (!p.podium) continue;
      const n = W.roads && W.roads.nearestNode ? W.roads.nearestNode(p.x, p.y) : null;
      const x = n && Math.hypot(n.x - p.x, n.y - p.y) < 60 ? n.x : p.x, y = n && Math.hypot(n.x - p.x, n.y - p.y) < 60 ? n.y : p.y;
      const pod = { id: p.id, place: p.id, x, y, home: p.podiumHome || null };
      W.podiums.push(pod);
      addStructure({ t: 'podium', pod, x: pod.x, y: pod.y, x0: pod.x - 10, y0: pod.y - 10, x1: pod.x + 10, y1: pod.y + 10, cx: pod.x, cy: pod.y });
    }
  }
  function drawPodium(ctx, s) {
    const D = N.draw, x = s.x, y = s.y;
    D.cyl(x, y, 3.2, 0, 2.6, { wall: '#efe9dc', roof: '#d8402a', grad: false, bands: [1.3], bandColor: '#d8402a' });
    D.cyl(x, y, 0.35, 2.6, 13, { wall: '#5a5a62', grad: false, top: false });
    // striped umbrella
    const R = N.render, k = R.k(13.5), X = R.sx(x, k), Y = R.sy(y, k), rr = 5.2 * k;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.arc(X, Y, rr, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#efe9dc' : '#2a5cb8'; ctx.fill();
    }
  }
  function setupRoofRuntime() {
    installInteractLevels();
    installPlayerHooks();
    addStairInteractables();
  }
  N.addSystem({
    id: 'roofs', order: 21, runIn: ['play', 'dialogue', 'cutscene', 'minigame'],
    update(dt) { tickFade(dt); },
    reset() {
      fade.cb = null; fade.done = false; if (fade.actor) { fade.actor.controlsLocked = !!fade.actor._roofLockWas; fade.actor = null; }
      for (const a of Array.from(roofActors)) if (a !== N.player) setLevel(a, null, true);
    },
  });

  /* ============================================================ potholes (A2) */
  // Hyderabad's roads have potholes: worst in colony lanes and the Old City, fewer on arterials, a
  // handful on Tank Bund, almost none on the new HITEC roads. Deterministic: each road segment draws
  // its own from rand32('pot:' + road id + ':' + segment index), so the same map always has the same
  // potholes. Never inside a junction (zebra crossings, podiums), near a bridge joint or a level
  // crossing, never on a bridge deck, a footpath or a plaza (every rim sample must be ROAD).
  // The monsoon (N.seasons 'monsoon') adds more (rain-only ones) and rain fills them with water that
  // reflects the sky. Tar patches (old repairs) are painted on many roads.
  //   N.world.potholeAt(x, y) -> the pothole {id, x, y, r, depth (0..1), dip (u), wet, ...} | null
  //   N.world.potholes = {list, patches, chunks (256 u chunk lists), chunk(i, j), query(...), ...}
  // Densities and sizes are in N.world.POTHOLE (tunable before the world is built).
  const POT = (W.POTHOLE = {
    KIND: { lane: 1.6, street: 0.8, arterial: 0.36, bund: 0.08 },  // dry potholes per 100 u of road
    STYLE: { oldcity: 1.7, market: 1.35, colony: 1.3, rocky: 1.05, colonial: 0.75, cantonment: 0.5, posh: 0.55, hitec: 0.05 },
    HINT_REF: { lane: 0.65, street: 0.4, arterial: 0.22, bund: 0.05 }, // road.pothole_hint that means "typical"
    MAXF: 1.8,          // the highest district factor (thinning reference)
    RAIN: 0.45,         // monsoon / rain: rain-only potholes, relative to the dry ones
    CLUSTER: 0.3,       // chance that a pothole brings 1-3 neighbours (a bad stretch)
    SIZE: [3, 9],       // diameter (u)
    PATCH: { lane: 0.2, street: 0.7, arterial: 0.85, bund: 0.3 },   // tar patches per 100 u
    PATCH_STYLE: { oldcity: 1.2, market: 1.2, colony: 1.0, rocky: 0.7, colonial: 1.1, cantonment: 0.9, posh: 0.9, hitec: 0.12 },
    JUNCTION_PAD: 16,   // clear of junctions: node half width + this (zebras sit at half width + 2..10)
    LANE_JUNCTION_PAD: 3, // a junction of lanes only (no zebras there): just its centre stays clear
    BRIDGE_PAD: 26,     // clear of bridge ends (expansion joints)
    RAIL_PAD: 20,       // clear of railway lines (level crossings)
    HIT: 0.9,           // hit ellipse = outline ellipse x this (the ragged rim averages ~0.89)
    SLICE_MS: 3,        // generation work per frame (it runs after the world build, off the boot path)
  });
  const PG = 32;        // potholeAt lookup cells (u)
  // one-function mulberry32 (U.rng builds five closures per call; this runs per road segment)
  function rand32(seed) {
    let a = (typeof seed === 'string' ? U.strHash(seed) : seed) >>> 0 || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let potStart = null, potItems = null, PGW = 0, PGH = 0;
  const potList = [], potPatches = [], potChunks = [], patchChunks = []; // filled in place (PH keeps them)
  let rainState = 0;    // 0 dry, 1 monsoon (extra potholes; deep ones hold water), 2 raining (all wet)
  let potVersion = 0;
  const potActive = (p) => !p.rain || rainState >= 1;

  function roadPotFactor(r) {
    if (r.potholes === false || r.potholes === 0) return { f: 0, hinted: false };
    let f = typeof r.potholes === 'number' && r.potholes > 0 ? r.potholes : 1;
    // the condition hint (0 smooth .. 1 cratered): `pothole` (Map v2 builder), `pothole_hint` (roads.json)
    const h = r.pothole != null ? +r.pothole : r.pothole_hint != null ? +r.pothole_hint : r.potholeHint != null ? +r.potholeHint : NaN;
    const ref = POT.HINT_REF[r.kind];
    if (isFinite(h) && ref) { f *= U.clamp(h / ref, 0.2, 1.6); return { f, hinted: true }; }
    return { f, hinted: false };
  }
  // district factor at a point (a district may carry its own `potholes` multiplier)
  function styleFactor(x, y, table) {
    const d = W.districtAt(x, y);
    if (d && typeof d.potholes === 'number') return d.potholes;
    const v = table[(d && d.style) || 'colony'];
    return v == null ? 1 : v;
  }
  // points to keep clear of (bridge ends) and rail segments, bucketed on 256 u
  function avoidIndex(D) {
    const pts = new Map(), rails = new Map();
    const put = (M, x0, y0, x1, y1, v) => {
      for (let j = Math.floor(y0 / 256); j <= Math.floor(y1 / 256); j++) for (let i = Math.floor(x0 / 256); i <= Math.floor(x1 / 256); i++) {
        const k = j * 4096 + i; const l = M.get(k); if (l) l.push(v); else M.set(k, [v]);
      }
    };
    for (const r of D.roads) {
      if (r.kind !== 'bridge' || !r.pts || r.pts.length < 2) continue;
      for (const q of [r.pts[0], r.pts[r.pts.length - 1]]) put(pts, q[0], q[1], q[0], q[1], q);
    }
    for (const r of D.rails || []) {
      if (!r.pts) continue;
      for (let k = 0; k < r.pts.length - 1; k++) {
        const a = r.pts[k], b = r.pts[k + 1];
        put(rails, Math.min(a[0], b[0]) - 40, Math.min(a[1], b[1]) - 40, Math.max(a[0], b[0]) + 40, Math.max(a[1], b[1]) + 40, [a[0], a[1], b[0], b[1], (r.w || 16) / 2]);
      }
    }
    return {
      bridgeNear(x, y, d) { // the joint may sit in a neighbouring bucket (d < 256)
        for (let j = Math.floor((y - d) / 256); j <= Math.floor((y + d) / 256); j++) for (let i = Math.floor((x - d) / 256); i <= Math.floor((x + d) / 256); i++) {
          const m = pts.get(j * 4096 + i); if (!m) continue;
          for (const q of m) if ((q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y) < d * d) return true;
        }
        return false;
      },
      railNear(x, y, d) { // rail segments are bucketed with a 40 u margin (d <= 40)
        const l = rails.get(Math.floor(y / 256) * 4096 + Math.floor(x / 256)); if (!l) return false;
        for (const s of l) { const q = U.closestOnSeg(x, y, s[0], s[1], s[2], s[3]); const rr = d + s[4]; if (q.d2 < rr * rr) return true; }
        return false;
      },
    };
  }

  // Generation runs in passes over every road segment: the dry potholes, the tar patches, and the
  // rain-only extras (only once the monsoon / rain needs them; the dry set never depends on them, so
  // every order gives the same city). It is time-sliced off the boot path: W.build() only resets it,
  // the 'potholes' system runs ~3 ms of it per frame (title screen first), then indexes the potholes
  // and repaints the ground chunks. potholes.ensure() finishes it at once (tests, tools).
  let gen = null, rainDone = false;
  const job = { stage: 'idle', ri: 0, t: 0, frames: 0 };
  function buildPotholes(D) {
    potList.length = 0; potPatches.length = 0; rainDone = false;
    potStart = null; potItems = null; // potholeAt -> null until the first set is indexed
    PGW = Math.ceil(N.WORLD_W / PG); PGH = Math.ceil(N.WORLD_H / PG);
    potChunks.length = BW * BH; patchChunks.length = BW * BH;
    for (let i = 0; i < BW * BH; i++) { potChunks[i] = []; patchChunks[i] = []; }
    const stats = { dry: 0, rain: 0, patches: 0, rejected: { junction: 0, bridge: 0, rail: 0, surface: 0, overlap: 0 }, byKind: {}, byStyle: {}, byDistrict: {}, roadLen: {}, ms: 0, frames: 0 };
    PH.stats = stats; PH.ready = false;
    gen = { D, stats, built: false };
    job.stage = 'dry'; job.ri = 0; job.t = 0; job.frames = 0;
    rainState = readRain();
    PH.cols = BW; PH.rows = BH; PH.rain = rainState;
  }
  /** Run pothole generation for up to `ms` (Infinity = finish). Returns true when nothing is left. */
  function stepGen(ms) {
    if (job.stage === 'idle' || !gen) return true;
    const t0 = performance.now(), deadline = t0 + ms;
    let changed = false;
    if (!gen.built) { // first slice: the helpers (junction mask, bridge / rail index) only
      Object.assign(gen, makeGen(gen.D, gen.stats), { built: true });
      if (ms !== Infinity) { job.t += performance.now() - t0; job.frames++; return false; }
    }
    while (job.stage !== 'idle') {
      if (performance.now() > deadline) break;
      if (job.stage === 'dry' || job.stage === 'rain') {
        job.ri = genPass(job.stage === 'rain', job.ri, deadline);
        if (job.ri >= 0) break;
        if (job.stage === 'rain') { rainDone = true; job.stage = 'index'; } else { job.stage = 'patches'; }
        job.ri = 0;
      } else if (job.stage === 'patches') {
        job.ri = genPatches(job.ri, deadline);
        if (job.ri >= 0) break;
        gen.stats.patches = potPatches.length;
        job.ri = 0; job.stage = rainState >= 1 && !rainDone ? 'rain' : 'index';
      } else if (job.stage === 'index') {
        indexPotholes(); applyWet(); changed = true;
        job.stage = rainState >= 1 && !rainDone ? 'rain' : 'idle';
      }
    }
    job.t += performance.now() - t0; job.frames++;
    const st = gen.stats;
    st.ms = Math.round(job.t * 10) / 10; st.frames = job.frames;
    if (changed) {
      potVersion++;
      const first = !PH.ready;
      PH.ready = true; PH.version = potVersion; PH.rain = rainState;
      if (W.built) repaintPotholes();
      N.emit('potholes:change', { rain: rainState, prev: rainState, version: potVersion, ready: true, first });
    }
    return job.stage === 'idle';
  }
  // the cached ground must show the new set: in 2D stale chunks repaint one per frame (no blank frames)
  let needs3D = false;
  function repaintPotholes() {
    const R = N.render;
    if (N.view3d && N.view3d.active) R.invalidateChunks();
    else { R.shadowEpoch++; needs3D = true; }
  }
  function makeGen(D, stats) {
    const avoid = avoidIndex(D);
    const placed = new Map(); // 32 u buckets of placed potholes (overlap test)
    const near = (x, y, r) => {
      for (let j = Math.floor((y - r - 6) / 32); j <= Math.floor((y + r + 6) / 32); j++) for (let i = Math.floor((x - r - 6) / 32); i <= Math.floor((x + r + 6) / 32); i++) {
        const l = placed.get(j * 4096 + i); if (!l) continue;
        for (const p of l) { const rr = (p.r + r) * 0.95 + 1; if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < rr * rr) return true; }
      }
      return false;
    };
    const place = (p) => { const key = Math.floor(p.y / 32) * 4096 + Math.floor(p.x / 32); const l = placed.get(key); if (l) l.push(p); else placed.set(key, [p]); };
    const ROAD = S.ROAD;
    // every rim sample on plain road (no bridge deck, footpath, plaza, water...): 16 on the rim, 16 just outside
    const onRoad = (x, y, rx, ry, ca, sa, grow) => {
      if (surfAt(x, y) !== ROAD) return false;
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
        for (let g = 0; g < 2; g++) {
          const u = c * (g ? rx * grow + 1 : rx), v = sn * (g ? ry * grow + 1 : ry);
          if (surfAt(x + u * ca - v * sa, y + u * sa + v * ca) !== ROAD) return false;
        }
      }
      return true;
    };
    // Junctions: zebra crossings are painted on the street / arterial / bund approaches of a junction, so
    // those keep JUNCTION_PAD clear; a junction of lanes only has no zebras (colony lane crossings are
    // pothole country) and only keeps its centre clear. A coarse 16 u mask answers "nothing near" fast.
    const edges = W.roads.edges;
    const JM = 16, jmW = Math.ceil(N.WORLD_W / JM), jmH = Math.ceil(N.WORLD_H / JM), jmask = new Uint8Array(jmW * jmH);
    const RMAX = POT.SIZE[1] / 2 + 2;
    for (const n of W.junctions || []) {
      let zebra = false;
      for (const id of n.inc) { const k = edges[id].kind; if (k !== 'lane' && k !== 'path' && k !== 'bridge') { zebra = true; break; } }
      n._potPad = zebra ? POT.JUNCTION_PAD : POT.LANE_JUNCTION_PAD;
      const rad = n.w / 2 + n._potPad + RMAX + JM * 0.75;
      for (let j = Math.max(0, Math.floor((n.y - rad) / JM)); j <= Math.min(jmH - 1, Math.floor((n.y + rad) / JM)); j++) {
        for (let i = Math.max(0, Math.floor((n.x - rad) / JM)); i <= Math.min(jmW - 1, Math.floor((n.x + rad) / JM)); i++) {
          const dx = (i + 0.5) * JM - n.x, dy = (j + 0.5) * JM - n.y;
          if (dx * dx + dy * dy <= rad * rad) jmask[j * jmW + i] = 1;
        }
      }
    }
    const nearJunctionPot = (x, y, R) => {
      const i = Math.floor(x / JM), j = Math.floor(y / JM);
      if (!(i >= 0 && j >= 0 && i < jmW && j < jmH) || !jmask[j * jmW + i]) return false;
      const S2 = R + POT.JUNCTION_PAD + 40;
      for (let gj = Math.floor((y - S2) / JG); gj <= Math.floor((y + S2) / JG); gj++) {
        for (let gi = Math.floor((x - S2) / JG); gi <= Math.floor((x + S2) / JG); gi++) {
          const l = jGrid.get(gj * 4096 + gi);
          if (!l) continue;
          for (const n of l) { const rr = R + n.w / 2 + (n._potPad != null ? n._potPad : POT.JUNCTION_PAD); if ((n.x - x) * (n.x - x) + (n.y - y) * (n.y - y) < rr * rr) return true; }
        }
      }
      return false;
    };
    const clearOfThings = (x, y, R) => {
      if (nearJunctionPot(x, y, R)) { stats.rejected.junction++; return false; }
      if (avoid.bridgeNear(x, y, POT.BRIDGE_PAD + R)) { stats.rejected.bridge++; return false; }
      if (avoid.railNear(x, y, POT.RAIL_PAD + R)) { stats.rejected.rail++; return false; }
      return true;
    };
    return { D, stats, avoid, near, place, onRoad, nearJunctionPot, clearOfThings };
  }
  // one pass over every road segment: the dry potholes, or the rain-only extras
  // potholes of roads ri0.. until the deadline: returns the next road index, or -1 when the pass is done
  function genPass(rain, ri0, deadline) {
    const { D, stats, near, place, onRoad, clearOfThings } = gen;
    for (let ri = ri0 || 0; ri < D.roads.length; ri++) {
      if (ri > (ri0 || 0) && performance.now() > deadline) return ri;
      const r = D.roads[ri];
      if (!r.pts || r.pts.length < 2 || !POT.KIND[r.kind]) continue;
      const rid = r.id || 'road' + ri;
      const { f: rf, hinted } = roadPotFactor(r);
      const base = POT.KIND[r.kind] * rf * (rain ? POT.RAIN : 1);
      const median = r.median != null ? !!r.median : r.kind === 'arterial';
      const hw = r.w / 2;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const a = r.pts[s], b = r.pts[s + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (!(L > 4)) continue;
        if (!rain) stats.roadLen[r.kind] = (stats.roadLen[r.kind] || 0) + L;
        if (!(base > 0)) continue;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, ang = Math.atan2(dy, dx);
        const rng = rand32((rain ? 'potr:' : 'pot:') + rid + ':' + s);
        const lam = (base * POT.MAXF) / 100; // candidates per u (thinned below by the district)
        for (let pos = (-Math.log(1 - rng() * 0.999999) / lam) * 0.5; pos < L; pos += -Math.log(1 - rng() * 0.999999) / lam) {
          const cx = a[0] + ux * pos, cy = a[1] + uy * pos;
          let sf = styleFactor(cx, cy, POT.STYLE);
          if (hinted && sf > 1) sf = Math.sqrt(sf); // the hint already knows a bad neighbourhood (HITEC stays near 0)
          const keep = rng() < sf / POT.MAXF;
          const nClu = rng() < POT.CLUSTER ? 1 + ((rng() * 3) | 0) : 0;
          const sz = rng(), lat = rng(), lat2 = rng(), shp = rng(), dep = rng(), seed = (rng() * 2147483647) | 0;
          if (!keep) { for (let c = 0; c < nClu * 3; c++) rng(); continue; }
          for (let c = 0; c <= nClu; c++) {
            const along = c ? (rng() - 0.5) * 40 : 0, cl1 = c ? rng() : lat, cl2 = c ? rng() : lat2;
            const sizeK = (r.kind === 'lane' ? 1.05 : 1) * (rain ? 0.85 : 1) * (c ? 0.9 : 1);
            let D0 = POT.SIZE[0] + (POT.SIZE[1] - POT.SIZE[0]) * Math.pow(c ? (sz * 0.7 + 0.3 * cl2) : sz, 0.8) * sizeK;
            D0 = U.clamp(D0, POT.SIZE[0], POT.SIZE[1]);
            let rx = D0 / 2, ry = rx * (0.68 + 0.3 * shp);
            const across = shp > 0.82;
            const pa = ang + (across ? Math.PI / 2 : 0) + (cl2 - 0.5) * 0.6;
            let R = Math.max(rx, ry);
            // lateral position: wheel tracks on two-lane roads, anywhere on narrow lanes
            let usable = hw - R - 1.5;
            if (usable < 0) { const k = (hw - 2.5) / R; if (k < 0.45) continue; rx *= k; ry *= k; R = Math.max(rx, ry); usable = 0.5; }
            let off;
            if (r.kind === 'lane' || r.w < 26) off = (cl1 * 2 - 1) * usable;
            else {
              const lanes = r.w >= 48 ? 2 : 1, lw = hw / lanes, side = cl1 < 0.5 ? -1 : 1, k = ((cl1 * 2) % 1) < 0.5 || lanes === 1 ? 0 : 1;
              const track = (k + 0.5) * lw + (cl2 < 0.5 ? -1 : 1) * lw * 0.28 + (cl2 - 0.5) * lw * 0.25;
              off = side * U.clamp(track, median ? 3 + R : 0, usable);
            }
            if (median && Math.abs(off) < 3 + R) off = (off < 0 ? -1 : 1) * Math.min(usable, 3 + R);
            const along2 = U.clamp(pos + along, R + 1, L - R - 1);
            const x = a[0] + ux * along2 + nx * off, y = a[1] + uy * along2 + ny * off;
            if (!clearOfThings(x, y, R)) continue;
            const ca = Math.cos(pa), sa = Math.sin(pa);
            if (!onRoad(x, y, rx, ry, ca, sa, 1.2)) { stats.rejected.surface++; continue; }
            const rr = (rx + ry) / 2;
            if (near(x, y, rr)) { stats.rejected.overlap++; continue; }
            const depth = U.clamp(0.18 + 0.5 * ((D0 - POT.SIZE[0]) / (POT.SIZE[1] - POT.SIZE[0])) + 0.32 * (c ? cl1 : dep), 0.15, 1) * (rain ? 0.7 : 1);
            const dist = W.districtAt(x, y);
            const p = new Pothole(potList.length, x, y, rx, ry, pa, depth, rain, r.kind, rid, s, dist, seed + c * 7919);
            potList.push(p);
            place(p);
            if (rain) { stats.rain++; continue; }
            stats.dry++;
            stats.byKind[r.kind] = (stats.byKind[r.kind] || 0) + 1;
            const st = (dist && dist.style) || 'none', did = (dist && dist.id) || 'none';
            stats.byStyle[st] = (stats.byStyle[st] || 0) + 1; stats.byDistrict[did] = (stats.byDistrict[did] || 0) + 1;
          }
        }
      }
    }
    return -1;
  }
  // tar patches (old repairs; paint only)
  function genPatches(ri0, deadline) {
    const { D, onRoad, nearJunctionPot, avoid } = gen;
    for (let ri = ri0 || 0; ri < D.roads.length; ri++) {
      if (ri > (ri0 || 0) && performance.now() > deadline) return ri;
      const r = D.roads[ri];
      if (!r.pts || r.pts.length < 2 || !POT.PATCH[r.kind]) continue;
      const rid = r.id || 'road' + ri;
      const rf = roadPotFactor(r).f;
      const pd = POT.PATCH[r.kind] * (rf > 0 ? Math.min(1.3, 0.6 + rf * 0.4) : 0.6);
      const hw = r.w / 2;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const a = r.pts[s], b = r.pts[s + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        if (!(L > 4)) continue;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, ang = Math.atan2(dy, dx);
        const rng = rand32('patch:' + rid + ':' + s);
        const lam = (pd * 1.3) / 100;
        for (let pos = (-Math.log(1 - rng() * 0.999999) / lam) * 0.5; pos < L; pos += -Math.log(1 - rng() * 0.999999) / lam) {
          const cx = a[0] + ux * pos, cy = a[1] + uy * pos;
          const keep = rng() < styleFactor(cx, cy, POT.PATCH_STYLE) / 1.3;
          const pl = 8 + rng() * 20, pwW = Math.min(r.w - 4, 6 + rng() * 10), lat = rng(), twist = (rng() - 0.5) * 0.12, seed = (rng() * 2147483647) | 0;
          if (!keep || pwW < 4) continue;
          const lx = U.clamp(pos, pl / 2 + 1, L - pl / 2 - 1);
          const usable = Math.max(0, hw - pwW / 2 - 1);
          const off = (lat * 2 - 1) * usable;
          const x = a[0] + ux * lx + nx * off, y = a[1] + uy * lx + ny * off;
          const R = Math.hypot(pl, pwW) / 2;
          if (nearJunctionPot(x, y, R + 2) || avoid.bridgeNear(x, y, POT.BRIDGE_PAD + R) || avoid.railNear(x, y, POT.RAIL_PAD + R)) continue;
          const pa = ang + twist, ca = Math.cos(pa), sa = Math.sin(pa);
          if (!onRoad(x, y, pl / 2, pwW / 2, ca, sa, 1)) continue;
          potPatches.push(makePatch(potPatches.length, x, y, pl, pwW, pa, seed, r.kind));
        }
      }
    }
    return -1;
  }
  /** The rain-only potholes, made the first time they are needed (monsoon / rain): queue the pass. */
  function ensureRain() {
    if (rainDone || !gen) return false;
    if (job.stage === 'idle') { job.stage = 'rain'; job.ri = 0; }
    return true;
  }
  // lookup grid (CSR: every pothole in each 32 u cell its hit ellipse touches) and the 256 u chunk lists
  function indexPotholes() {
    const counts = new Uint32Array(PGW * PGH + 1);
    const cells = (p, fn) => {
      const R = Math.max(p.rx, p.ry) + 0.5;
      const i0 = Math.max(0, Math.floor((p.x - R) / PG)), i1 = Math.min(PGW - 1, Math.floor((p.x + R) / PG));
      const j0 = Math.max(0, Math.floor((p.y - R) / PG)), j1 = Math.min(PGH - 1, Math.floor((p.y + R) / PG));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * PGW + i);
    };
    for (const p of potList) cells(p, (c) => { counts[c + 1]++; });
    for (let c = 0; c < PGW * PGH; c++) counts[c + 1] += counts[c];
    const items = new Uint32Array(counts[PGW * PGH]);
    const fill = new Uint32Array(PGW * PGH);
    for (const p of potList) cells(p, (c) => { items[counts[c] + fill[c]++] = p.id; });
    potStart = counts; potItems = items;
    const bucket = (arr, o, R) => {
      const i0 = Math.max(0, Math.floor((o.x - R) / BK)), i1 = Math.min(BW - 1, Math.floor((o.x + R) / BK));
      const j0 = Math.max(0, Math.floor((o.y - R) / BK)), j1 = Math.min(BH - 1, Math.floor((o.y + R) / BK));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) arr[j * BW + i].push(o);
    };
    for (let i = 0; i < BW * BH; i++) { potChunks[i].length = 0; patchChunks[i].length = 0; }
    for (const p of potList) bucket(potChunks, p, p.R);
    for (const q of potPatches) bucket(patchChunks, q, q.R + 2);
    wetPaths.clear();
  }

  // A pothole. The ragged outline (`pts`) is made on first use from its seed (paint, puddles, 3D).
  class Pothole {
    constructor(id, x, y, rx, ry, a, depth, rain, kind, rid, seg, dist, seed) {
      this.id = id; this.x = x; this.y = y; this.r = (rx + ry) / 2; this.rx = rx; this.ry = ry; this.R = Math.max(rx, ry) * 1.4 + 9;
      this.a = a; this.ca = Math.cos(a); this.sa = Math.sin(a); this.depth = depth; this.dip = Math.round(depth * 30) / 10;
      this.wet = false; this.rain = rain; this.road = rid; this.kind = kind; this.seg = seg;
      this.district = dist ? dist.id : null; this.style = dist ? dist.style : null; this.seed = seed || 1;
      const hr = POT.HIT; this.hx = 1 / ((rx * hr) * (rx * hr)); this.hy = 1 / ((ry * hr) * (ry * hr));
      this._pts = null; this._q = 0;
    }
    get pts() { return this._pts || (this._pts = potOutline(this)); }
  }
  // ragged outline: per-vertex radius 0.74..1, lightly smoothed, small angular jitter -> [x0, y0, x1, y1, ...]
  function potOutline(p) {
    const rng = rand32(p.seed);
    const n = 10 + ((rng() * 5) | 0);
    const m = new Array(n);
    for (let k = 0; k < n; k++) m[k] = 0.74 + 0.26 * rng();
    const pts = new Array(n * 2);
    for (let k = 0; k < n; k++) {
      const mm = (m[k] * 2 + m[(k + 1) % n] + m[(k + n - 1) % n]) / 4;
      const t = ((k + (rng() - 0.5) * 0.5) / n) * Math.PI * 2;
      const u = Math.cos(t) * p.rx * mm, v = Math.sin(t) * p.ry * mm;
      pts[k * 2] = p.x + u * p.ca - v * p.sa; pts[k * 2 + 1] = p.y + u * p.sa + v * p.ca;
    }
    return pts;
  }
  function makePatch(id, x, y, len, wid, a, seed, kind) {
    const rng = rand32(seed || 1);
    const ca = Math.cos(a), sa = Math.sin(a);
    const hl = len / 2, hw = wid / 2;
    // a slightly wonky rectangle; one in four is an L of two rectangles (a repair of a repair)
    const corners = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
    for (const c of corners) { c[0] += (rng() - 0.5) * 1.6; c[1] += (rng() - 0.5) * 1.2; }
    const polys = [corners];
    if (rng() < 0.25) {
      const u0 = (rng() - 0.5) * len * 0.6, w2 = wid * (0.4 + rng() * 0.3), l2 = len * (0.3 + rng() * 0.3), side = rng() < 0.5 ? -1 : 1;
      const v0 = side * (hw + w2 / 2 - 1);
      polys.push([[u0 - l2 / 2, v0 - w2 / 2], [u0 + l2 / 2, v0 - w2 / 2], [u0 + l2 / 2, v0 + w2 / 2], [u0 - l2 / 2, v0 + w2 / 2]]);
    }
    for (const pl of polys) for (const c of pl) { const u = c[0], v = c[1]; c[0] = x + u * ca - v * sa; c[1] = y + u * sa + v * ca; }
    return { id, x, y, len, wid, a, polys, R: Math.hypot(len, wid) / 2 + wid * 0.5, kind, age: rng(), seed: seed || 1, _q: 0 };
  }

  /** The pothole under (x, y) or null. Allocation-free; ~0.1 µs on an empty cell. */
  function potholeAt(x, y) {
    if (!potStart || grid === roofGrid) return null; // (roof level: no potholes up there)
    const i = Math.floor(x / PG), j = Math.floor(y / PG);
    if (!(i >= 0 && j >= 0 && i < PGW && j < PGH)) return null;
    const c = j * PGW + i;
    for (let k = potStart[c], e = potStart[c + 1]; k < e; k++) {
      const p = potList[potItems[k]];
      if (p.rain && rainState < 1) continue;
      const dx = x - p.x, dy = y - p.y;
      const u = dx * p.ca + dy * p.sa, v = dy * p.ca - dx * p.sa;
      if (u * u * p.hx + v * v * p.hy <= 1) return p;
    }
    return null;
  }
  W.potholeAt = potholeAt;

  // ---- rain / monsoon state
  function readRain() {
    let st = 0;
    try {
      const SE = N.seasons;
      if (SE && SE.is) { if (SE.is('rain')) st = 2; else if (SE.is('monsoon')) st = 1; }
    } catch (e) { /* seasons missing: dry */ }
    if (st < 2 && N.flags && N.flags.rain === true) st = 2;
    return st;
  }
  function applyWet() {
    for (const p of potList) p.wet = potActive(p) && (rainState === 2 || (rainState === 1 && p.depth >= 0.4));
    wetPaths.clear();
  }
  /** Re-read the weather; when the set of potholes changes the ground chunks repaint (one per frame). */
  function refreshRain(force) {
    const st = readRain();
    if (st === rainState && !force) return false;
    const prev = rainState;
    rainState = st;
    if (st >= 1) ensureRain(); // (made over the next frames, then indexed and painted)
    applyWet();
    potVersion++;
    PH.rain = st; PH.version = potVersion;
    // the rain-only potholes appear / vanish: repaint the cached ground
    if (W.built && PH.ready && rainDone && (prev >= 1) !== (st >= 1)) repaintPotholes();
    N.emit('potholes:change', { rain: st, prev, version: potVersion, ready: PH.ready });
    return true;
  }
  N.on('view:change', () => { if (needs3D && N.view3d && N.view3d.active) { needs3D = false; N.render.invalidateChunks(); } });
  for (const ev of ['weather', 'season:change', 'game:new', 'save:loaded', 'calendar:change']) N.on(ev, () => { if (W.built) refreshRain(); });
  let rainAcc = 0;
  N.addSystem({
    id: 'potholes', order: 6, runIn: ['*'],
    update(dt) {
      if (job.stage !== 'idle' && W.built) { try { stepGen(POT.SLICE_MS); } catch (e) { N.err('world.potholes', e); job.stage = 'idle'; } }
      rainAcc += dt; if (rainAcc >= 0.5) { rainAcc = 0; if (W.built) refreshRain(); }
    },
    reset() { if (W.built) refreshRain(); },
  });

  // ---- public API
  let qStamp = 0;
  const PH = (W.potholes = {
    list: potList, patches: potPatches, chunks: potChunks, patchChunks, CH: BK, cols: 0, rows: 0,
    rain: 0, version: 0, stats: null, POT,
    /** potholes listed for render chunk (i, j) (256 u; rain-only ones included, see active(p)) */
    chunk(i, j) { return (i >= 0 && j >= 0 && i < BW && j < BH && potChunks[j * BW + i]) || []; },
    /** active potholes whose painted extent overlaps [x0, x1] x [y0, y1] -> array (opts.all: rain-only too) */
    query(x0, y0, x1, y1, out, all) { return queryPot(potChunks, x0, y0, x1, y1, out || [], all ? null : potActive); },
    /** tar patches overlapping the rect */
    queryPatches(x0, y0, x1, y1, out) { return queryPot(patchChunks, x0, y0, x1, y1, out || [], null); },
    /** is this pothole there now? (rain-only ones need the monsoon / rain) */
    active: potActive,
    at: potholeAt,
    /** re-read the weather now (normally polled twice a second and on 'weather' / 'season:change') */
    refresh: () => refreshRain(true),
    /** finish any pending generation now (dry set, patches, and the rain extras if it rains) */
    ensure() { if (!W.built) return false; return stepGen(Infinity); },
    /** regenerate (after tuning N.world.POTHOLE) and repaint the ground */
    rebuild() { if (!W.built) return null; buildPotholes(W.data); stepGen(Infinity); N.render.invalidateChunks(); return PH.stats; },
    ready: false,
  });
  function queryPot(arr, x0, y0, x1, y1, out, pred) {
    qStamp++;
    const i0 = Math.max(0, Math.floor(x0 / BK)), i1 = Math.min(BW - 1, Math.floor(x1 / BK));
    const j0 = Math.max(0, Math.floor(y0 / BK)), j1 = Math.min(BH - 1, Math.floor(y1 / BK));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = arr[j * BW + i]; if (!l) continue;
      for (const p of l) {
        if (p._q === qStamp) continue; p._q = qStamp;
        const R = p.R;
        if (p.x + R < x0 || p.x - R > x1 || p.y + R < y0 || p.y - R > y1) continue;
        if (pred && !pred(p)) continue;
        out.push(p);
      }
    }
    return out;
  }

  // ---- 2D painting (baked into the ground chunks; the water on top is drawn live, see drawWet)
  function holePath(ctx, p, k, ox, oy) {
    const pts = p.pts, n = pts.length / 2;
    ctx.moveTo(p.x + (pts[0] - p.x) * k + (ox || 0), p.y + (pts[1] - p.y) * k + (oy || 0));
    for (let i = 1; i < n; i++) ctx.lineTo(p.x + (pts[i * 2] - p.x) * k + (ox || 0), p.y + (pts[i * 2 + 1] - p.y) * k + (oy || 0));
    ctx.closePath();
  }
  const POTCOL = {
    asphalt: { apron: 1.55, hole: '#121012', floor: '#2f2a26', wall: '#958b80', chip: '#141215', gravel: ['#b0a79b', '#948b80', '#c8bfb2', '#77706a'] },
    lane: { apron: 1.24, hole: '#1e1610', floor: '#3e3022', wall: '#b39a7c', chip: '#22190f', gravel: ['#c0ad8e', '#9c896c', '#d6c4a4', '#76644e'] },
  };
  // the crumbled apron around a hole: its own ragged ring (1.15-1.5 x the hole), not a scaled copy
  function apronPath(ctx, p, rng) {
    const n = 9 + ((rng() * 5) | 0);
    for (let k = 0; k <= n; k++) {
      const t = ((k % n) / n) * Math.PI * 2, m = 1.22 + rng() * 0.38;
      const u = Math.cos(t) * p.rx * m + (k ? 0 : 0), v = Math.sin(t) * p.ry * m;
      const X = p.x + u * p.ca - v * p.sa, Y = p.y + u * p.sa + v * p.ca;
      if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath();
  }
  const scratch = [];
  function paintPatches(ctx, x0, y0, x1, y1) {
    const list = queryPot(patchChunks, x0 - 4, y0 - 4, x1 + 4, y1 + 4, scratch, null);
    if (!list.length) return;
    for (const q of list) {
      const base = ROADCOL[q.kind] || ROADCOL.street;
      // fresher tar is darker and smoother; old patches fade towards the road colour
      ctx.beginPath();
      for (const pl of q.polys) { ctx.moveTo(pl[0][0], pl[0][1]); for (let i = 1; i < pl.length; i++) ctx.lineTo(pl[i][0], pl[i][1]); ctx.closePath(); }
      ctx.fillStyle = shadeC(base, q.kind === 'lane' ? 0.62 : 0.78 + q.age * 0.12); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = pat.asphalt; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(18,16,20,0.55)'; ctx.stroke();       // the cut seam
      ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(255,250,235,0.10)'; ctx.stroke();   // its worn lip
    }
    scratch.length = 0;
  }
  function paintPotholes(ctx, x0, y0, x1, y1) {
    paintPatches(ctx, x0, y0, x1, y1);
    const list = queryPot(potChunks, x0, y0, x1, y1, scratch, potActive);
    if (!list.length) return;
    const sun = N.render.sun;
    let sx = sun.sx || -0.6, sy = sun.sy || -0.2;
    const sl = Math.hypot(sx, sy) || 1;
    for (const p of list) {
      const lane = p.kind === 'lane';
      const C = lane ? POTCOL.lane : POTCOL.asphalt;
      const base = ROADCOL[p.kind] || ROADCOL.street;
      const rng = rand32(p.seed ^ 0x2c1b3c6d);
      const minR = Math.min(p.rx, p.ry);
      // 1. broken edge: a crumbled, lighter apron of worn asphalt / dry dirt around the hole
      ctx.beginPath(); apronPath(ctx, p, rng);
      ctx.fillStyle = shadeC(base, C.apron); ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = pat.speck; ctx.fill();
      // 2. the hole (in shadow) with a crisp broken edge, 3. its lit floor: the hole shifted away from
      // the sun, clipped (at 1 texel per unit the hole must read as a dark pit with a pale rim)
      ctx.beginPath(); holePath(ctx, p, 1);
      ctx.fillStyle = C.hole; ctx.fill();
      ctx.lineWidth = 0.7; ctx.strokeStyle = C.chip; ctx.stroke();
      ctx.save(); ctx.clip();
      const sh = Math.min(minR * 0.45, p.dip * 0.6 + 0.4);
      ctx.beginPath(); holePath(ctx, p, 0.92, (sx / sl) * sh, (sy / sl) * sh);
      ctx.fillStyle = C.floor; ctx.fill();
      // 4. the far (sunlit) wall: the outline nudged towards the sun shows only on that side
      ctx.beginPath(); holePath(ctx, p, 1, -(sx / sl) * 0.8, -(sy / sl) * 0.8);
      ctx.lineWidth = 1.2; ctx.strokeStyle = C.wall; ctx.stroke();
      // 5. gravel on the floor
      const ng = 3 + ((rng() * 5) | 0);
      for (let k = 0; k < ng; k++) {
        const t = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 0.7, gs = 0.45 + rng() * 0.7;
        const u = Math.cos(t) * p.rx * d, v = Math.sin(t) * p.ry * d;
        ctx.fillStyle = C.gravel[(rng() * C.gravel.length) | 0];
        ctx.fillRect(p.x + u * p.ca - v * p.sa - gs / 2, p.y + u * p.sa + v * p.ca - gs / 2, gs, gs * (0.7 + rng() * 0.5));
      }
      ctx.restore();
      // 6. dark chips along the rim, cracks running off it and loose gravel kicked out by tyres
      ctx.fillStyle = C.chip;
      const nc = 3 + ((rng() * 5) | 0);
      for (let k = 0; k < nc; k++) {
        const t = rng() * Math.PI * 2, d = 1.05 + rng() * 0.25, cs = 0.5 + rng() * 0.6;
        const u = Math.cos(t) * p.rx * d, v = Math.sin(t) * p.ry * d;
        ctx.fillRect(p.x + u * p.ca - v * p.sa - cs / 2, p.y + u * p.sa + v * p.ca - cs / 2, cs, cs);
      }
      if (!lane) {
        ctx.beginPath();
        const ncr = 1 + ((rng() * 3) | 0);
        for (let k = 0; k < ncr; k++) {
          const t = rng() * Math.PI * 2;
          let u = Math.cos(t) * p.rx * 1.05, v = Math.sin(t) * p.ry * 1.05;
          let X = p.x + u * p.ca - v * p.sa, Y = p.y + u * p.sa + v * p.ca;
          ctx.moveTo(X, Y);
          let dir = t + p.a;
          const segs = 2 + ((rng() * 2) | 0);
          for (let q = 0; q < segs; q++) { dir += (rng() - 0.5) * 1.1; const l = 1.0 + rng() * 1.6; X += Math.cos(dir) * l; Y += Math.sin(dir) * l; ctx.lineTo(X, Y); }
        }
        ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(22,20,24,0.65)'; ctx.stroke();
      }
      const nl = 2 + ((rng() * 4) | 0);
      for (let k = 0; k < nl; k++) {
        const t = rng() * Math.PI * 2, d = 1.3 + rng() * 0.9, gs = 0.4 + rng() * 0.5;
        const u = Math.cos(t) * p.rx * d, v = Math.sin(t) * p.ry * d;
        ctx.fillStyle = C.gravel[(rng() * C.gravel.length) | 0];
        ctx.fillRect(p.x + u * p.ca - v * p.sa, p.y + u * p.sa + v * p.ca, gs, gs);
      }
    }
    scratch.length = 0;
  }

  // ---- live water in wet potholes (ground layer): the water sits below the road, so the hole's wall
  // shows as a dark band on the sunny side; the surface mirrors the sky of the hour (a brighter patch
  // on the far side, a thin sheen), wet asphalt darkens around it and drops ring it while it rains.
  // Paths are cached per 256 u chunk (rebuilt when the quantised sun or the weather changes).
  const wetPaths = new Map(); // chunk index -> {key, list, halo, water, mud, glow, sheen}
  function wetChunk(ci) {
    const key = N.render.shadowEpoch * 4 + rainState;
    let w = wetPaths.get(ci);
    if (w && w.key === key) return w;
    const list = potChunks[ci].filter((p) => p.wet && Math.floor(p.x / BK) + Math.floor(p.y / BK) * BW === ci);
    w = { key, list, halo: null, water: null, mud: null, glow: null };
    if (list.length && typeof Path2D !== 'undefined') {
      const sun = N.render.sun, sl = Math.hypot(sun.sx || 0, sun.sy || 0) || 1, ux = (sun.sx || -0.6) / sl, uy = (sun.sy || -0.2) / sl;
      w.halo = new Path2D(); w.water = new Path2D(); w.mud = new Path2D(); w.glow = new Path2D();
      for (const p of list) {
        const o = Math.min(p.rx, p.ry) * 0.12;
        holePath(w.halo, p, 1.4);
        holePath(p.kind === 'lane' ? w.mud : w.water, p, 0.84, ux * o, uy * o);
        holePath(w.glow, p, 0.42, ux * o * 2.4, uy * o * 2.4);
      }
    }
    if (wetPaths.size > 256) wetPaths.clear();
    wetPaths.set(ci, w);
    return w;
  }
  const SKY = [ // [minute, colour of the sky reflected by standing water]
    [0, '#1d2538'], [300, '#232c44'], [345, '#7a6e90'], [390, '#e0a8b0'], [450, '#a9c4dc'], [600, '#8fbde0'],
    [960, '#9cc0da'], [1020, '#f0b070'], [1100, '#e8885c'], [1150, '#7a5a88'], [1200, '#2a3150'], [1440, '#1d2538'],
  ];
  function skyColor(m) {
    for (let i = 1; i < SKY.length; i++) if (m <= SKY[i][0]) { const a = SKY[i - 1], b = SKY[i]; return U.mix(a[1], b[1], (m - a[0]) / (b[0] - a[0])); }
    return SKY[0][1];
  }
  let skyKey = -1;
  const WC = { water: '#5b7890', mud: '#6a5a46', glow: '#a9c4dc', mudGlow: '#9a8a70' };
  function drawWet(ctx) {
    if (rainState === 0 || !potChunks.length) return;
    const R = N.render, v = R.view, Z = R.Z;
    const m = Math.round((N.clock && N.clock.minutes) || 720);
    if (m !== skyKey) {
      skyKey = m;
      const sky = skyColor(m);
      WC.water = U.mix(sky, '#26303a', 0.48); WC.glow = U.mix(sky, '#ffffff', 0.12);
      WC.mud = U.mix(U.mix(sky, '#26303a', 0.4), '#5c4a36', 0.55); WC.mudGlow = U.mix(sky, '#8a7658', 0.4);
    }
    const i0 = Math.max(0, Math.floor((v.x0 - 12) / BK)), i1 = Math.min(BW - 1, Math.floor((v.x1 + 12) / BK));
    const j0 = Math.max(0, Math.floor((v.y0 - 12) / BK)), j1 = Math.min(BH - 1, Math.floor((v.y1 + 12) / BK));
    ctx.setTransform(Z, 0, 0, Z, R.sx(0, Z), R.sy(0, Z));
    const raining = rainState === 2, t = N.time.real || 0;
    let ripples = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const w = wetChunk(j * BW + i);
      if (!w.list.length || !w.water) continue;
      ctx.fillStyle = 'rgba(18,16,30,0.20)'; ctx.fill(w.halo);   // wet road around the hole
      ctx.fillStyle = WC.water; ctx.fill(w.water);
      ctx.fillStyle = WC.mud; ctx.fill(w.mud);
      ctx.globalAlpha = 0.55; ctx.fillStyle = WC.glow; ctx.fill(w.glow); ctx.globalAlpha = 1; // the sky patch
      // a thin sheen line on every puddle
      ctx.fillStyle = 'rgba(250,252,255,0.55)';
      for (const p of w.list) ctx.fillRect(p.x - p.rx * 0.38, p.y - p.ry * 0.3, p.rx * 0.5, 0.35);
      if (raining) {
        if (!ripples) { ripples = true; ctx.beginPath(); }
        for (const p of w.list) {
          const ph = (t * 0.9 + (p.seed % 997) / 997) % 1, rr = Math.min(p.rx, p.ry) * (0.12 + ph * 0.62);
          const cx = p.x + ((p.seed >> 3) % 3 - 1) * 0.5, cy = p.y + ((p.seed >> 5) % 3 - 1) * 0.4;
          ctx.moveTo(cx + rr, cy); ctx.ellipse(cx, cy, rr, rr * 0.85, 0, 0, Math.PI * 2);
        }
      }
    }
    if (ripples) { ctx.lineWidth = 0.45; ctx.strokeStyle = 'rgba(230,238,255,0.5)'; ctx.stroke(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* --------------------------------------------------------- enqueue */
  let lampLights = [], porchLights = [];
  W.draw = function () {
    if (!W.built) return;
    const R = N.render, D = N.draw, v = R.view;
    const night = R.night || 0;
    const m = 140; // landmarks just outside the view may still cast shadows into it
    litWalls.length = 0;
    const lights = R.lights;
    // light records are recycled frame to frame (render.js drains R.lights every flush); if the last
    // frame's were not drained, start new ones rather than rewrite records still in the list
    if (lights.length) { lampLights = []; porchLights = []; }
    let nLamp = 0, nPorch = 0;
    beginRoofs();
    W.queryStructures(v.x0 - m, v.y0 - m, v.x1 + m, v.y1 + m, (s) => {
      const vis = s.x1 >= v.x0 - 6 && s.x0 <= v.x1 + 6 && s.y1 >= v.y0 - 6 && s.y0 <= v.y1 + 6;
      if (s.t === 'roofzone') { if (vis) deckQ.push(s.roof); return; }
      if (s.t === 'landmark') {
        if (N.landmarks && N.landmarks.enqueue) { try { N.landmarks.enqueue(s.lm, vis); } catch (e) { N.err('landmarks.enqueue', e); } }
        else if (vis) R.queue('structures', R.distKey(s.cx, s.cy), sfn(s));
        return;
      }
      if (night > 0.05 && s.t === 'lamp') {
        for (const a of s.arms) {
          const L = lampLights[nLamp] || (lampLights[nLamp] = { x: 0, y: 0, r: 0, color: '', intensity: 0 });
          nLamp++;
          L.x = s.x + a[0] * 1.6; L.y = s.y + a[1] * 1.6; L.r = s.tube ? 46 : 64; L.color = s.tube ? '#bfe8ff' : '#ffa040'; L.intensity = s.tube ? 0.75 : 0.95;
          lights.push(L);
        }
      }
      if (vis) R.queue('structures', R.distKey(s.cx, s.cy), sfn(s));
      if (night > 0.2 && vis && s.porch && s.cwall) {
        const c = s.cwall, f = s.front;
        const gx = f === 'W' ? c.x : f === 'E' ? c.x + c.w : c.x + c.w / 2, gy = f === 'N' ? c.y : f === 'S' ? c.y + c.h : c.y + c.h / 2;
        const L = porchLights[nPorch] || (porchLights[nPorch] = { x: 0, y: 0, r: 24, color: '#ffc870', intensity: 0.5, h: 4 });
        nPorch++;
        L.x = (gx + s.cx) / 2; L.y = (gy + s.cy) / 2;
        lights.push(L);
      }
    });
    enqueueRoofs();
    if (night > 0.2) R.queue('light', 0, (ctx) => drawLitWalls(ctx, night));
    R.queue('ground', 0, drawWaterGlints);
    if (rainState > 0) R.queue('ground', 0, drawWet);
  };

  // Animated glitter on visible water: sampled on a jittered 20u grid (cheap), coloured by
  // the time of day (white noon sparkle, gold at golden hour, faint blue moonlight).
  function drawWaterGlints(ctx) {
    const R = N.render, v = R.view, t = N.time.real, step = 20;
    const m = N.clock.minutes, night = R.night || 0;
    const col = night > 0.6 ? '#a8c4ff' : m > 990 && m < 1150 ? '#ffd48a' : m < 450 ? '#ffc8d8' : '#f2fbff';
    const base = night > 0.6 ? 0.25 : 0.55;
    ctx.fillStyle = col;
    const i0 = Math.floor(v.x0 / step), i1 = Math.floor(v.x1 / step), j0 = Math.floor(v.y0 / step), j1 = Math.floor(v.y1 / step);
    const k = R.Z;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const hsh = U.hash2(i, j);
        const x = (i + hsh) * step, y = (j + U.hash2(j, i)) * step;
        if (surfAt(x, y) !== S.WATER) continue;
        const a = Math.sin(t * (1.2 + hsh * 2) + hsh * 40);
        if (a < 0.35) continue;
        ctx.globalAlpha = (a - 0.35) * base;
        const len = (2 + hsh * 5) * k;
        ctx.fillRect(Math.round(R.sx(x, k)), Math.round(R.sy(y, k)), Math.max(1, len), 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------- map image */
  const mapCache = new Map();
  /** Simplified top-down map image at `ppu` pixels per world unit (cached). For minimap/full map. */
  // Canvas budget for the map image: browsers cap a canvas at ~16 M px (iOS) and big ones are slow
  // to paint, so a request above MAP_MAX_SIDE px on a side is rendered at a lower scale; the
  // returned canvas carries its real scale as `.ppu` (callers should read it).
  const MAP_MAX_SIDE = 4096, MAP_MAX_PX = 12e6;
  W.mapPPU = function (ppu) {
    ppu = ppu || 0.1;
    const side = Math.max(N.WORLD_W, N.WORLD_H) * ppu, area = N.WORLD_W * N.WORLD_H * ppu * ppu;
    if (side > MAP_MAX_SIDE) ppu *= MAP_MAX_SIDE / side;
    if (area > MAP_MAX_PX) ppu = Math.min(ppu, Math.sqrt(MAP_MAX_PX / (N.WORLD_W * N.WORLD_H)));
    return ppu;
  };
  // renderMap(ppu, {fresh: true}) renders a canvas the caller owns (not cached here): a caller that keeps its
  // own graded copy (the HUD minimap) can grade it in place instead of holding a second copy (Map v2 at
  // 0.2 ppu: 3000 x 2250 px = 27 MB of pixels per copy).
  W.renderMap = function (ppu, opts) {
    const want = ppu || 0.1, fresh = !!(opts && opts.fresh);
    const key = want.toFixed(4) + '@' + N.WORLD_W + 'x' + N.WORLD_H;
    if (!fresh && mapCache.has(key)) return mapCache.get(key);
    ppu = W.mapPPU(want);
    const D = W.data;
    const c = N.render.makeCanvas(Math.ceil(N.WORLD_W * ppu), Math.ceil(N.WORLD_H * ppu));
    c.ppu = ppu;
    const g = c.getContext('2d');
    g.scale(ppu, ppu);
    g.fillStyle = '#a98a66'; g.fillRect(0, 0, N.WORLD_W, N.WORLD_H);
    for (const d of D.districts) {
      g.fillStyle = d.ground || '#a98a66';
      g.beginPath(); districtPath(g, d); g.fill('evenodd');
    }
    g.beginPath(); // every lot in one path, one fill
    for (const l of W.lots) g.rect(l.rect[0], l.rect[1], l.rect[2], l.rect[3]);
    g.fillStyle = 'rgba(70,50,40,0.18)'; g.fill();
    for (const p of D.parks) { pathPoly(g, p.poly); g.fillStyle = PARKCOL[p.kind] || PARKCOL.grass; g.fill(); }
    for (const w of D.water) { pathPoly(g, w.poly); if (w.bank) { g.strokeStyle = '#cdb489'; g.lineWidth = w.bank * 2; g.stroke(); } g.fillStyle = w.color || '#2f7f86'; g.fill(); }
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const r of D.roads) {
      if (r.kind === 'path') continue;
      pathLine(g, r.pts);
      g.strokeStyle = r.kind === 'lane' ? '#d8c8a8' : r.kind === 'arterial' || r.kind === 'bund' ? '#f4e8c8' : '#e8dcc0';
      g.lineWidth = Math.max(r.w, (r.kind === 'arterial' ? 3.2 : 2.2) / ppu);
      g.stroke();
    }
    for (const lm of D.landmarks) { g.fillStyle = '#e8d9b5'; g.fillRect(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d); }
    if (!fresh) mapCache.set(key, c);
    return c;
  };
})();
