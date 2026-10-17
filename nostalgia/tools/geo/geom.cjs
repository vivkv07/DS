/* NOSTALGIA — tools/geo/geom.cjs   (map builder v2 helpers; node, no deps)
 * Plane geometry in world units: polylines, polygons, Douglas-Peucker, offsets, a segment
 * spatial hash for nearest-road queries, scanline polygon rasters and deterministic hashing.
 */
'use strict';

const hypot = Math.hypot;
const r1 = (v) => Math.round(v);
const r2 = (v) => Math.round(v * 2) / 2;

function len(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function cum(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }

// point at distance d along a polyline (+ unit direction)
function atDist(pts, d, c) {
  c = c || cum(pts);
  const L = c[c.length - 1];
  d = Math.max(0, Math.min(L, d));
  let i = 1; while (i < c.length - 1 && c[i] < d) i++;
  const a = pts[i - 1], b = pts[i], sl = c[i] - c[i - 1] || 1e-9, k = (d - c[i - 1]) / sl;
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: (b[0] - a[0]) / sl, dy: (b[1] - a[1]) / sl, seg: i - 1, d };
}
const atFrac = (pts, t, c) => { c = c || cum(pts); return atDist(pts, t * c[c.length - 1], c); };

function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t, y = ay + dy * t;
  return { x, y, t, d2: (x - px) * (x - px) + (y - py) * (y - py) };
}
// nearest point on a polyline: {x, y, d, seg, t, along, side (+1 = left of travel in screen coords (y down) ... see below), dx, dy}
// side: sign of cross(dir, p - q): > 0 means the point is to the RIGHT of travel on screen (y down)
function nearestOnLine(pts, px, py, c) {
  let best = null;
  for (let s = 0; s < pts.length - 1; s++) {
    const q = closestOnSeg(px, py, pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1]);
    if (!best || q.d2 < best.d2) best = { ...q, seg: s };
  }
  if (!best) return null;
  c = c || cum(pts);
  const a = pts[best.seg], b = pts[best.seg + 1], sl = hypot(b[0] - a[0], b[1] - a[1]) || 1e-9;
  const dx = (b[0] - a[0]) / sl, dy = (b[1] - a[1]) / sl;
  const cr = dx * (py - best.y) - dy * (px - best.x);
  return { x: best.x, y: best.y, d: Math.sqrt(best.d2), seg: best.seg, t: best.t, along: c[best.seg] + sl * best.t, side: cr >= 0 ? 1 : -1, dx, dy, L: c[c.length - 1] };
}

function dp(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, z] = st.pop();
    let best = -1, bi = -1;
    for (let i = a + 1; i < z; i++) {
      const q = closestOnSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[z][0], pts[z][1]);
      if (q.d2 > best) { best = q.d2; bi = i; }
    }
    if (best > tol * tol) { keep[bi] = 1; st.push([a, bi], [bi, z]); }
  }
  return pts.filter((_, i) => keep[i]);
}
// drop vertices closer than minD to the previous kept one (keeps the ends)
function thin(pts, minD) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const p = out[out.length - 1]; if (hypot(pts[i][0] - p[0], pts[i][1] - p[1]) >= minD) out.push(pts[i]); }
  const last = pts[pts.length - 1], p = out[out.length - 1];
  if (out.length > 1 && hypot(last[0] - p[0], last[1] - p[1]) < minD * 0.5) out[out.length - 1] = last; else out.push(last);
  return out;
}
function resample(pts, step) {
  const c = cum(pts), L = c[c.length - 1], n = Math.max(1, Math.round(L / step)), out = [];
  for (let k = 0; k <= n; k++) { const p = atDist(pts, (k / n) * L, c); out.push([p.x, p.y]); }
  return out;
}
// polyline offset to the left (screen: left of travel with y down = (dy, -dx)) by d (negative = right)
function offsetLine(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = hypot(dx, dy) || 1;
    out.push([pts[i][0] + (dy / l) * d, pts[i][1] - (dx / l) * d]);
  }
  return out;
}
// ribbon polygon around a polyline with per-vertex half widths
function ribbon(pts, hw) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = hypot(dx, dy) || 1, w = typeof hw === 'function' ? hw(i) : Array.isArray(hw) ? hw[i] : hw;
    L.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]);
    R.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
  }
  return L.concat(R.reverse());
}
function circle(cx, cy, r, n, ccw, start) {
  const out = []; const a0 = start == null ? Math.PI / 2 : start;
  for (let i = 0; i <= n; i++) { const a = a0 + (ccw ? -1 : 1) * (i / n) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

function inPoly(x, y, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function polyArea(p) { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1]; return s / 2; }
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return [x0, y0, x1, y1];
}
function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += f; cx += (poly[j][0] + poly[i][0]) * f; cy += (poly[j][1] + poly[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) { const b = bbox(poly); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  return [cx / (3 * a), cy / (3 * a)];
}
// distance from a point to a polygon boundary
function polyEdgeDist(x, y, poly) {
  let b = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) b = Math.min(b, closestOnSeg(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]).d2);
  return Math.sqrt(b);
}
function segInter(a, b, c, d) {
  const r1x = b[0] - a[0], r1y = b[1] - a[1], r2x = d[0] - c[0], r2y = d[1] - c[1];
  const den = r1x * r2y - r1y * r2x; if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * r2y - (c[1] - a[1]) * r2x) / den, u = ((c[0] - a[0]) * r1y - (c[1] - a[1]) * r1x) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, u, x: a[0] + r1x * t, y: a[1] + r1y * t };
}
// keyhole: outer ring + holes as one even-odd polygon (zero-width slits)
function keyhole(outer, holes) {
  let ring = outer.slice();
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  for (const h0 of holes || []) {
    const h = h0.slice(); if (h.length > 1 && h[0][0] === h[h.length - 1][0] && h[0][1] === h[h.length - 1][1]) h.pop();
    if (h.length < 3) continue;
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < ring.length; i++) for (let j = 0; j < h.length; j++) { const d = (ring[i][0] - h[j][0]) ** 2 + (ring[i][1] - h[j][1]) ** 2; if (d < bd) { bd = d; bi = i; bj = j; } }
    const hh = h.slice(bj).concat(h.slice(0, bj)); hh.push(h[bj]);
    ring = ring.slice(0, bi + 1).concat(hh, [ring[bi]], ring.slice(bi + 1));
  }
  return ring;
}

/* ------------------------------------------------ spatial hash of road segments */
class SegHash {
  constructor(cell) { this.c = cell || 64; this.m = new Map(); this.items = []; }
  key(i, j) { return j * 100000 + i; }
  add(pts, ref) {
    const c = this.c;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const it = { a, b, ref, s };
      this.items.push(it);
      const i0 = Math.floor(Math.min(a[0], b[0]) / c), i1 = Math.floor(Math.max(a[0], b[0]) / c);
      const j0 = Math.floor(Math.min(a[1], b[1]) / c), j1 = Math.floor(Math.max(a[1], b[1]) / c);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = this.key(i, j); (this.m.get(k) || this.m.set(k, []).get(k)).push(it); }
    }
  }
  // all segment items within r of (x, y) -> [{it, q}]
  near(x, y, r, pred) {
    const c = this.c, out = [], seen = new Set();
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((y - r) / c), j1 = Math.floor((y + r) / c);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = this.m.get(this.key(i, j)); if (!l) continue;
      for (const it of l) {
        if (seen.has(it)) continue; seen.add(it);
        if (pred && !pred(it.ref)) continue;
        const q = closestOnSeg(x, y, it.a[0], it.a[1], it.b[0], it.b[1]);
        if (q.d2 <= r * r) out.push({ it, q });
      }
    }
    return out;
  }
  nearest(x, y, rmax, pred) {
    let r = Math.min(rmax, this.c);
    for (;;) {
      const l = this.near(x, y, r, pred);
      if (l.length) { let b = l[0]; for (const e of l) if (e.q.d2 < b.q.d2) b = e; return b; }
      if (r >= rmax) return null;
      r = Math.min(rmax, r * 2);
    }
  }
}

/* ------------------------------------------------ raster (uint8 codes) */
class Raster {
  constructor(W, H, cell) { this.c = cell; this.w = Math.ceil(W / cell); this.h = Math.ceil(H / cell); this.a = new Uint8Array(this.w * this.h); }
  idx(x, y) { const i = Math.floor(x / this.c), j = Math.floor(y / this.c); if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1; return j * this.w + i; }
  get(x, y) { const k = this.idx(x, y); return k < 0 ? 255 : this.a[k]; }
  fillPoly(poly, fn) {
    const c = this.c; let y0 = Infinity, y1 = -Infinity;
    for (const p of poly) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    for (let j = Math.max(0, Math.floor(y0 / c)); j <= Math.min(this.h - 1, Math.floor(y1 / c)); j++) {
      const y = (j + 0.5) * c, xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const ya = poly[a][1], yb = poly[b][1]; if ((ya > y) !== (yb > y)) xs.push(poly[a][0] + ((y - ya) / (yb - ya)) * (poly[b][0] - poly[a][0])); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] / c - 0.5)); i <= Math.min(this.w - 1, Math.floor(xs[k + 1] / c - 0.5)); i++) fn(j * this.w + i);
    }
  }
  fillThick(pts, hw, fn) {
    const c = this.c;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - hw) / c)), i1 = Math.min(this.w - 1, Math.floor((Math.max(a[0], b[0]) + hw) / c));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - hw) / c)), j1 = Math.min(this.h - 1, Math.floor((Math.max(a[1], b[1]) + hw) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (closestOnSeg((i + 0.5) * c, (j + 0.5) * c, a[0], a[1], b[0], b[1]).d2 <= hw * hw) fn(j * this.w + i);
    }
  }
  fillRect(x, y, w, h, fn) {
    const c = this.c;
    for (let j = Math.max(0, Math.floor(y / c)); j <= Math.min(this.h - 1, Math.floor((y + h - 0.01) / c)); j++)
      for (let i = Math.max(0, Math.floor(x / c)); i <= Math.min(this.w - 1, Math.floor((x + w - 0.01) / c)); i++) fn(j * this.w + i);
  }
  fillCircle(x, y, r, fn) {
    const c = this.c;
    for (let j = Math.max(0, Math.floor((y - r) / c)); j <= Math.min(this.h - 1, Math.floor((y + r) / c)); j++)
      for (let i = Math.max(0, Math.floor((x - r) / c)); i <= Math.min(this.w - 1, Math.floor((x + r) / c)); i++) {
        const dx = (i + 0.5) * c - x, dy = (j + 0.5) * c - y; if (dx * dx + dy * dy <= r * r) fn(j * this.w + i);
      }
  }
  // any cell in rect satisfying pred(code)
  anyRect(x, y, w, h, pred) {
    const c = this.c;
    for (let j = Math.max(0, Math.floor(y / c)); j <= Math.min(this.h - 1, Math.floor((y + h - 0.01) / c)); j++)
      for (let i = Math.max(0, Math.floor(x / c)); i <= Math.min(this.w - 1, Math.floor((x + w - 0.01) / c)); i++) if (pred(this.a[j * this.w + i])) return true;
    if (x < 0 || y < 0 || x + w > this.w * c || y + h > this.h * c) return true;
    return false;
  }
}

// deterministic 0..1 hash (same as the v1 expansion step)
const hash = (x, y, s) => {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(((y | 0) + 0x9e3779b9) ^ (s | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

module.exports = { len, cum, atDist, atFrac, closestOnSeg, nearestOnLine, dp, thin, resample, offsetLine, ribbon, circle, inPoly, polyArea, bbox, centroid, polyEdgeDist, segInter, keyhole, SegHash, Raster, hash, strHash, r1, r2 };
