/* NOSTALGIA — world.js
 * Builds the world from N.WORLD_DATA: surface grid (collision), district lookup, road graph
 * (nodes at intersections, left-hand lanes), procedural generic buildings per district style,
 * trees, street lamps, Deccan boulders, the chunked ground painter and per-frame structure
 * enqueueing. Contract: ARCHITECTURE.md §7.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const S = N.SURF;
  const CELL = N.CELL;
  const GW = Math.ceil(N.WORLD_W / CELL), GH = Math.ceil(N.WORLD_H / CELL);
  const BK = 256; // structure / decal bucket size (= render chunk size)
  const BW = Math.ceil(N.WORLD_W / BK), BH = Math.ceil(N.WORLD_H / BK);

  const W = (N.world = {
    GW, GH, grid: null, data: null, built: false,
    structures: [], trees: [], lamps: [], rocks: [], lots: [],
    roads: null, districts: [],
  });

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
  // map(old) -> new surface or -1 to keep
  function setIJ(i, j, map) {
    if (i < 0 || j < 0 || i >= GW || j >= GH) return;
    const o = j * GW + i;
    const v = map(grid[o]);
    if (v >= 0) grid[o] = v;
  }
  const always = (v) => () => v;

  function fillRect(x, y, w, h, map) {
    const i0 = Math.max(0, Math.round(x / CELL)), i1 = Math.min(GW - 1, Math.round((x + w) / CELL) - 1);
    const j0 = Math.max(0, Math.round(y / CELL)), j1 = Math.min(GH - 1, Math.round((y + h) / CELL) - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) setIJ(i, j, map);
  }
  function fillCircle(x, y, r, map) {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((y - r) / CELL), j1 = Math.floor((y + r) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * CELL - x, cy = (j + 0.5) * CELL - y;
      if (cx * cx + cy * cy <= r * r) setIJ(i, j, map);
    }
  }
  function fillPoly(poly, map) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of poly) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const j0 = Math.max(0, Math.floor(minY / CELL)), j1 = Math.min(GH - 1, Math.floor(maxY / CELL));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const y = (j + 0.5) * CELL;
      xs.length = 0;
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const ya = poly[a][1], yb = poly[b][1];
        if ((ya > y) !== (yb > y)) xs.push(poly[a][0] + ((y - ya) / (yb - ya)) * (poly[b][0] - poly[a][0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), i1 = Math.min(GW - 1, Math.floor(xs[k + 1] / CELL - 0.5));
        for (let i = i0; i <= i1; i++) setIJ(i, j, map);
      }
    }
  }
  function fillThickLine(pts, w, map, closed) {
    const r = w / 2, r2 = r * r;
    const n = closed ? pts.length : pts.length - 1;
    for (let s = 0; s < n; s++) {
      const a = pts[s], b = pts[(s + 1) % pts.length];
      const i0 = Math.floor((Math.min(a[0], b[0]) - r) / CELL), i1 = Math.floor((Math.max(a[0], b[0]) + r) / CELL);
      const j0 = Math.floor((Math.min(a[1], b[1]) - r) / CELL), j1 = Math.floor((Math.max(a[1], b[1]) + r) / CELL);
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) * CELL, py = (j + 0.5) * CELL;
        let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a[0] + dx * t - px, qy = a[1] + dy * t - py;
        if (qx * qx + qy * qy <= r2) setIJ(i, j, map);
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
  const DGW = Math.ceil(N.WORLD_W / DG), DGH = Math.ceil(N.WORLD_H / DG);
  function buildDistricts(list) {
    distMap = new Uint8Array(DGW * DGH);
    list.forEach((d, idx) => {
      const [x, y, w, h] = d.rect;
      const i0 = Math.max(0, Math.floor(x / DG)), i1 = Math.min(DGW - 1, Math.floor((x + w - 1) / DG));
      const j0 = Math.max(0, Math.floor(y / DG)), j1 = Math.min(DGH - 1, Math.floor((y + h - 1) / DG));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) distMap[j * DGW + i] = idx + 1; // later wins
    });
  }
  W.districtAt = function (x, y) {
    if (!distMap) return null;
    const i = Math.floor(x / DG), j = Math.floor(y / DG);
    if (i < 0 || j < 0 || i >= DGW || j >= DGH) return null;
    const v = distMap[j * DGW + i];
    return v ? W.districts[v - 1] : null;
  };

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
    const nodes = [], edges = [];
    const ngrid = new Map();
    const getNode = (x, y) => {
      const gx = Math.floor(x / 16), gy = Math.floor(y / 16);
      for (let j = gy - 1; j <= gy + 1; j++) for (let i = gx - 1; i <= gx + 1; i++) {
        const l = ngrid.get(j * 4096 + i);
        if (l) for (const id of l) { const n = nodes[id]; if ((n.x - x) ** 2 + (n.y - y) ** 2 < 100) return n; }
      }
      const n = { id: nodes.length, x, y, links: [], inc: [], deg: 0, w: 0 };
      nodes.push(n);
      const key = gy * 4096 + gx;
      (ngrid.get(key) || ngrid.set(key, []).get(key)).push(n.id);
      return n;
    };
    const RR = roads.filter((r) => r.kind !== 'path' && r.pts && r.pts.length > 1).map((r) => {
      const pts = r.pts.map((p) => [p[0], p[1]]);
      return { r, pts, cum: cumLen(pts), splits: [] };
    });
    for (const A of RR) A.pts.forEach((p, i) => A.splits.push({ d: A.cum[i], x: p[0], y: p[1] }));
    // T-junctions: endpoints lying on another road snap onto it
    for (const A of RR) {
      for (const end of [0, A.pts.length - 1]) {
        const p = A.pts[end];
        let best = null;
        for (const B of RR) {
          if (B === A) continue;
          for (let s = 0; s < B.pts.length - 1; s++) {
            const q = U.closestOnSeg(p[0], p[1], B.pts[s][0], B.pts[s][1], B.pts[s + 1][0], B.pts[s + 1][1]);
            const tol = B.r.w / 2 + 6;
            if (q.d2 <= tol * tol && (!best || q.d2 < best.q.d2)) best = { B, s, q };
          }
        }
        if (best && best.q.d2 > 0.01) {
          const { B, s, q } = best;
          // only snap when the endpoint isn't already one of B's vertices
          const segL = B.cum[s + 1] - B.cum[s];
          B.splits.push({ d: B.cum[s] + segL * q.t, x: q.x, y: q.y });
          p[0] = q.x; p[1] = q.y;
          A.splits[end].x = q.x; A.splits[end].y = q.y;
        } else if (best) {
          const { B, s, q } = best; const segL = B.cum[s + 1] - B.cum[s];
          B.splits.push({ d: B.cum[s] + segL * q.t, x: q.x, y: q.y });
        }
      }
    }
    // proper crossings
    for (let ai = 0; ai < RR.length; ai++) {
      const A = RR[ai];
      for (let bi = ai + 1; bi < RR.length; bi++) {
        const B = RR[bi];
        for (let s = 0; s < A.pts.length - 1; s++) {
          for (let q = 0; q < B.pts.length - 1; q++) {
            const I = segInter(A.pts[s], A.pts[s + 1], B.pts[q], B.pts[q + 1]);
            if (!I) continue;
            A.splits.push({ d: A.cum[s] + (A.cum[s + 1] - A.cum[s]) * I.t, x: I.x, y: I.y });
            B.splits.push({ d: B.cum[q] + (B.cum[q + 1] - B.cum[q]) * I.u, x: I.x, y: I.y });
          }
        }
      }
    }
    for (const A of RR) {
      A.splits.sort((p, q) => p.d - q.d);
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
    return makeRoadsAPI(nodes, edges, roads);
  }

  // Accept a bare function (Math.random) or an N.util.rng(seed) object as a random source.
  const toRnd = (r) => (typeof r === 'function' ? r : r && typeof r.next === 'function' ? () => r.next() : Math.random);

  function makeRoadsAPI(nodes, edges, list) {
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
              const d = (n.x - x) ** 2 + (n.y - y) ** 2;
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
  const SG = 128;
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
          const l = segGrid.get(key);
          if (l) l.push(r, s); else segGrid.set(key, [r, s]);
        }
      }
    }
  }
  /** Nearest point on any road centre line: {x, y, dist, road, seg, t, angle} (null if none). */
  W.nearestRoadPoint = function (x, y, pred) {
    if (!segGrid) buildSegGrid(W.data.roads || []);
    const ci = Math.floor(x / SG), cj = Math.floor(y / SG);
    let bd2 = Infinity, br = null, bs = 0, bt = 0, bx = 0, by = 0;
    const maxRing = Math.ceil(Math.max(N.WORLD_W, N.WORLD_H) / SG);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let j = cj - ring; j <= cj + ring; j++) {
        for (let i = ci - ring; i <= ci + ring; i++) {
          if (ring && Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
          const l = segGrid.get(j * 4096 + i);
          if (!l) continue;
          for (let k = 0; k < l.length; k += 2) {
            const r = l[k], si = l[k + 1];
            if (pred && !pred(r)) continue;
            const a = r.pts[si], b = r.pts[si + 1];
            const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
            let t = ((x - a[0]) * dx + (y - a[1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = a[0] + dx * t, qy = a[1] + dy * t, d2 = (qx - x) * (qx - x) + (qy - y) * (qy - y);
            if (d2 < bd2) { bd2 = d2; br = r; bs = si; bt = t; bx = qx; by = qy; }
          }
        }
      }
      // anything in a further ring is at least (ring) cells away
      if (br && Math.sqrt(bd2) <= ring * SG) break;
    }
    if (!br) return null;
    const a = br.pts[bs], b = br.pts[bs + 1];
    return { x: bx, y: by, dist: Math.sqrt(bd2), road: br, seg: bs, t: bt, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };

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
    s.fn = (ctx) => DRAW[s.t](ctx, s);
    s.stamp = 0;
    return s;
  }
  /** Add a custom structure: {t:'custom', x0,y0,x1,y1, cx?, cy?, draw(ctx, s), cast?(s)} */
  W.addStructure = function (s) {
    if (s.t === 'custom' && typeof s.draw === 'function') DRAW.custom = DRAW.custom || ((ctx, st) => st.draw(ctx, st));
    return addStructure(s);
  };
  function addDecal(d) {
    const i0 = Math.max(0, Math.floor(d.x / BK)), i1 = Math.min(BW - 1, Math.floor((d.x + d.w) / BK));
    const j0 = Math.max(0, Math.floor(d.y / BK)), j1 = Math.min(BH - 1, Math.floor((d.y + d.h) / BK));
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
      for (const k of l) {
        const qx = U.clamp(k.x, x, x + w), qy = U.clamp(k.y, y, y + h);
        if ((qx - k.x) ** 2 + (qy - k.y) ** 2 < k.r * k.r) return false;
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
    const rp = W.nearestRoadPoint(cx, cy);
    if (!rp) return { side: 'S', gap: 999 };
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

  function newBuilding(x, y, w, d, h, style, rng, extra) {
    const P = STY[style] || STY.colony;
    const b = {
      t: 'bldg', x, y, w, d, h, style,
      x0: x, y0: y, x1: x + w, y1: y + d, cx: x + w / 2, cy: y + d / 2,
      wall: rng.pick(P.walls), roof: rng.pick(P.roofs), trim: P.trim,
      seed: (rng.next() * 1e9) | 0, lit: 0.25 + rng.next() * 0.4,
      win: 'rect', winSp: 7 + rng.next() * 2, winW: 3, roofType: 'flat', parapet: 1, items: null,
      front: null, sign: null, awning: null, gf: null,
    };
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
    if (style === 'oldcity' || style === 'market' || style === 'colony' || style === 'rocky') b.trim = U.shade(b.wall, 1.12);
    Object.assign(b, extra || {});
    if (b.roofType === 'flat' && !b.items) b.items = makeItems(rng, x, y, w, d, style);
    if (!b.items) b.items = [];
    return b;
  }

  // A shop name that fits a board `len` world units long (the 3x5 font is ~1 px per unit at zoom 1)
  function pickSign(rng, len, bg, list) {
    const fit = (arr) => arr.filter((t) => N.draw.pixelTextWidth(t) <= len * 1.05);
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
        if (style === 'oldcity' && rng.next() < 0.1 && bw > 14 && bd > 14) b.items.push({ t: 'domeItem', x: bx + bw / 2, y: by + bd / 2, r: 4, h: 6, col: b.wall });
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
        if (bw > 40 && bd > 30 && rng.next() < 0.35) b.items.push({ t: 'domeItem', x: b.x + bw / 2, y: b.y + bd / 2, r: Math.min(bw, bd) * 0.16, h: 12, col: b.wall === '#a5543f' || b.wall === '#9a4a38' || b.wall === '#b0603f' ? '#efe9dc' : b.wall, finial: true });
        if (rng.next() < 0.5 && bw > 30) b.items.push({ t: 'tower', x: b.x + bw / 2 - 5, y: b.y + (fr.side === 'S' ? bd - 10 : 0), w: 10, d: 10, h: 16 });
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
    const lots = [];
    const split = (x, y, w, h, depth) => {
      if ((w <= P.lotMax && h <= P.lotMax) || depth > 18) { lots.push([x, y, w, h]); return; }
      const vert = w >= h; // cut perpendicular to the longer side
      const len = vert ? w : h;
      const lane = rng.next() < P.laneP ? P.lane : 0;
      const minS = P.lotMin;
      if (len < minS * 2 + lane) { lots.push([x, y, w, h]); return; }
      const cut = minS + rng.next() * (len - minS * 2 - lane);
      if (vert) { split(x, y, cut, h, depth + 1); split(x + cut + lane, y, w - cut - lane, h, depth + 1); }
      else { split(x, y, w, cut, depth + 1); split(x, y + cut + lane, w, h - cut - lane, depth + 1); }
    };
    split(bx, by, bw, bh, 0);
    for (const L of lots) {
      const f = fitLot(L[0], L[1], L[2], L[3], Math.min(10, P.lotMin * 0.6));
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
    oldcity: ['neem', 'neem', 'neem', 'palm'], market: ['neem', 'neem', 'palm'], colony: ['neem', 'ashoka', 'palm', 'gulmohar', 'neem', 'palm'],
    posh: ['palm', 'ashoka', 'gulmohar', 'palm', 'neem'], colonial: ['banyan', 'neem', 'ashoka', 'gulmohar'], cantonment: ['banyan', 'neem', 'gulmohar', 'neem'],
    hitec: ['palm', 'neem'], rocky: ['neem', 'neem', 'palm'],
  };
  function makeTree(x, y, kind, r, seed) {
    const K = TREE_KINDS[kind] || TREE_KINDS.neem;
    const rng = U.rng(seed || ((x * 73856093) ^ (y * 19349663)));
    if (!TREE_KINDS[kind]) kind = 'neem';
    r = r || (kind === 'banyan' ? 16 + rng.next() * 8 : isPalm(kind) ? 9 + rng.next() * 3 : kind === 'ashoka' ? 6 + rng.next() * 2 : 9 + rng.next() * 5);
    const h = K.h * (0.8 + rng.next() * 0.35) * (kind === 'banyan' ? 1 : Math.min(1.15, 0.7 + r / 30));
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
    return { t: 'tree', kind, x, y, r, h, blobs, fronds, flowers, x0: x - r, y0: y - r, x1: x + r, y1: y + r, cx: x, cy: y };
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
    D.districts = D.districts || []; D.water = D.water || []; D.roads = D.roads || []; D.parks = D.parks || [];
    D.rocks = D.rocks || []; D.blocks = D.blocks || []; D.buildings = D.buildings || []; D.landmarks = D.landmarks || [];
    D.trees = D.trees || []; D.places = D.places || []; D.spawns = D.spawns || {};
    W.districts = D.districts;
    W.structures = []; W.trees = []; W.lamps = []; W.rocks = []; W.lots = [];
    buckets = []; decals = [];
    for (let i = 0; i < BW * BH; i++) { buckets.push([]); decals.push([]); }

    grid = new Uint8Array(GW * GH).fill(S.GROUND);
    W.grid = grid;
    for (let i = 0; i < GW; i++) { grid[i] = S.VOID; grid[(GH - 1) * GW + i] = S.VOID; }
    for (let j = 0; j < GH; j++) { grid[j * GW] = S.VOID; grid[j * GW + GW - 1] = S.VOID; }
    buildDistricts(D.districts);
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
      if (b.yard) addDecal({ t: 'yard', x: b.yard.x, y: b.yard.y, w: b.yard.w, h: b.yard.h, b });
      addDecal({ t: 'plinth', x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.d + 2 });
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
    const nearJunction = (x, y, r) => junctions.some((n) => (n.x - x) ** 2 + (n.y - y) ** 2 < r * r);
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
    soil = null;
    prepPainter();
    N.render.setGroundPainter(paintGround);
    W.built = true;
    mark('end');
    W.buildMs = Math.round(performance.now() - t0);
    N.emit('world:built', W);
    return W;
  };

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
          for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) g.fillRect(px - r + ox, py - r + oy, r * 2, r * 2);
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
      const [x, y, w, h] = d.rect;
      g.fillStyle = d.ground || '#a98a66';
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
    for (const d of dl) {
      if (d.t !== 'yard') continue;
      const b = d.b;
      if (d.b.yard.lawn) {
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
    for (const p of D.parks) {
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
    for (const wt of D.water) {
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
    const roads = D.roads.filter((r) => inBB(r._bb, x0, y0, x1, y1));
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
    for (const n of W.junctions) {
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
    // bridge edges (kerb lines)
    for (const r of roads) {
      if (r.kind !== 'bridge') continue;
      ctx.strokeStyle = '#3a3634'; ctx.lineWidth = 1.5;
      pathLine(ctx, r._edgeL); ctx.stroke(); pathLine(ctx, r._edgeR); ctx.stroke();
    }
    // 6. landmark plazas
    ctx.lineCap = 'round';
    for (const lm of D.landmarks) {
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
    for (const d of dl) if (d.t === 'plinth') ctx.fillRect(d.x, d.y, d.w, d.h);
    for (const rk of W.rocks) {
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

  function wallSeg(b, face) {
    switch (face) {
      case 'N': return [b.x, b.y, b.x + b.w, b.y];
      case 'S': return [b.x + b.w, b.y + b.d, b.x, b.y + b.d];
      case 'W': return [b.x, b.y + b.d, b.x, b.y];
      default: return [b.x + b.w, b.y, b.x + b.w, b.y + b.d];
    }
  }
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
    ctx.setTransform(jux, juy, jvx, jvy, px - jux * uc - jvx * vc, py - juy * uc - jvy * vc);
    return [jux, juy, jvx, jvy, px - jux * uc - jvx * vc, py - juy * uc - jvy * vc];
  }

  function drawWallDetail(ctx, b, face) {
    const px = wallPx(b, face);
    if (px < 4.5) return; // thin slivers near the screen centre: plain wall reads fine
    const R = N.render;
    const [ax, ay, bx, by] = wallSeg(b, face);
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
          if (open && night > 0.2) litWalls.push([m, g.gfLit, '#ffc860']);
        } else { ctx.fillStyle = g.gfCol; ctx.fill(g.gf); }
      }
    }
    if (night > 0.2 && g.anyLit) litWalls.push([m, g.lit, '#ffd27a']);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // light layer: lit windows / open shops (warm) over the night overlay
  function drawLitWalls(ctx, night) {
    ctx.globalAlpha = Math.min(1, night * 1.25);
    for (const [m, path, col] of litWalls) {
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.fillStyle = col; ctx.fill(path);
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
    landmark(ctx, s) {
      // landmarks normally enqueue themselves via N.landmarks.enqueue; this is the fallback
      if (N.landmarks && N.landmarks.drawDefault) N.landmarks.drawDefault(s.lm);
    },
  };

  /* --------------------------------------------------------- enqueue */
  W.draw = function () {
    if (!W.built) return;
    const R = N.render, D = N.draw, v = R.view;
    const night = R.night || 0;
    const m = 140; // landmarks just outside the view may still cast shadows into it
    litWalls = [];
    const lights = R.lights;
    W.queryStructures(v.x0 - m, v.y0 - m, v.x1 + m, v.y1 + m, (s) => {
      const vis = s.x1 >= v.x0 - 6 && s.x0 <= v.x1 + 6 && s.y1 >= v.y0 - 6 && s.y0 <= v.y1 + 6;
      if (s.t === 'landmark') {
        if (N.landmarks && N.landmarks.enqueue) { try { N.landmarks.enqueue(s.lm, vis); } catch (e) { N.err('landmarks.enqueue', e); } }
        else if (vis) R.queue('structures', R.distKey(s.cx, s.cy), s.fn);
        return;
      }
      if (night > 0.05 && s.t === 'lamp') {
        for (const a of s.arms) lights.push({ x: s.x + a[0] * 1.6, y: s.y + a[1] * 1.6, r: s.tube ? 46 : 64, color: s.tube ? '#bfe8ff' : '#ffa040', intensity: s.tube ? 0.75 : 0.95 });
      }
      if (vis) R.queue('structures', R.distKey(s.cx, s.cy), s.fn);
      if (night > 0.2 && vis && s.porch && s.cwall) {
        const c = s.cwall, f = s.front;
        const gx = f === 'W' ? c.x : f === 'E' ? c.x + c.w : c.x + c.w / 2, gy = f === 'N' ? c.y : f === 'S' ? c.y + c.h : c.y + c.h / 2;
        lights.push({ x: (gx + s.cx) / 2, y: (gy + s.cy) / 2, r: 24, color: '#ffc870', intensity: 0.5, h: 4 });
      }
    });
    if (night > 0.2) R.queue('light', 0, (ctx) => drawLitWalls(ctx, night));
    R.queue('ground', 0, drawWaterGlints);
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
  W.renderMap = function (ppu) {
    ppu = ppu || 0.1;
    const key = ppu.toFixed(4);
    if (mapCache.has(key)) return mapCache.get(key);
    const D = W.data;
    const c = N.render.makeCanvas(Math.ceil(N.WORLD_W * ppu), Math.ceil(N.WORLD_H * ppu));
    const g = c.getContext('2d');
    g.scale(ppu, ppu);
    g.fillStyle = '#a98a66'; g.fillRect(0, 0, N.WORLD_W, N.WORLD_H);
    for (const d of D.districts) { g.fillStyle = d.ground || '#a98a66'; g.fillRect(d.rect[0], d.rect[1], d.rect[2], d.rect[3]); }
    for (const l of W.lots) { g.fillStyle = 'rgba(70,50,40,0.18)'; g.fillRect(l.rect[0], l.rect[1], l.rect[2], l.rect[3]); }
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
    mapCache.set(key, c);
    return c;
  };
})();
