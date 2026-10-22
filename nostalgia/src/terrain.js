/* NOSTALGIA — terrain.js  (N.terrain: the ground's real rise and fall, in both views)
 *
 * Hyderabad is not flat: the granite ridge of Banjara and Jubilee Hills (KBR Park ~610 m) stands a hundred metres
 * over Hussain Sagar (512 m), Golconda and Naubat Pahad rise out of the plain, the old city slopes down to the Musi
 * (~470-480 m). src/terrain_data.js (tools/geo/build_terrain.cjs, from SRTM) holds the real height every 75 world
 * units; this module samples it smoothly and turns it into game heights and grades:
 *   heightAt(x, y)   3D units above Hussain Sagar's level (the city's water line: 0), x TUNE.vscale units per metre
 *                    (a little steeper than the map's 0.6-1.1 u/m so the climbs read in 3D and on a cycle)
 *   gradeAt(x, y, a) the rise per world unit along heading a (game units: the 3D height over the 2D distance)
 *   slopeAt(x, y)    the gradient {gx, gy} (rise per world unit east / south)
 * Gameplay (vehicles.js simulate, entities.js player.update call accelAlong / walkMul): downhill a cycle runs away
 * with him (a little past its top speed), uphill the pedals get heavy and an auto or a loaded lorry crawls (traffic
 * is simulated, so it slows on the climbs by itself); walking up a hill is slower and running it tiring.
 * 2D: a hillshade baked into the cached ground chunks (wraps N.render.setGroundPainter: soft-light, slopes facing
 * the north-west light lighter, the far sides darker, flat ground untouched), so the ridges read from above.
 * A few lines when the ride gets steep (a cycle flying downhill, grinding up), with long cool-downs.
 *
 * API N.terrain = {TUNE, ready, metresAt(x, y), heightAt(x, y), slopeAt(x, y, out?), gradeAt(x, y, a),
 *   accelAlong(x, y, a, cls) (u/s² that gravity adds along heading a), walkMul(x, y, dx, dy), range() -> {lo, hi}
 *   (3D units), data, shade (the 2D hillshade canvas)}. Event 'terrain:steep' {kind: 'down' | 'up' | 'walk', grade}.
 */
(() => {
  'use strict';
  const TUNE = {
    vscale: 1.25,      // 3D units per metre of real height
    g: 120,            // u/s² of "gravity" along a grade of 1 (a 10% game grade: 12 u/s²)
    clsK: { bike: 1, pedal: 1, auto: 0.8, car: 0.6, heavy: 0.75, foot: 0, boat: 0 }, // how much each class feels it
    walkUp: 1.4,       // on foot: speed x (1 - walkUp * uphill grade), down a little faster (x 1 + walkDown * grade)
    walkDown: 0.6, walkMin: 0.62, walkMax: 1.18,
    runDrainUp: 4,     // running uphill: energy drain x (1 + runDrainUp * grade)
    pedalUp: 5,        // pedalling uphill: energy drain x (1 + pedalUp * grade); freewheeling downhill rests the legs
    downTop: 0.4,      // downhill a vehicle may run up to (1 + downTop) x its top speed (gravity past the governor)
    hs: { px: 12, ex: 7, alpha: 0.6, light: [-0.55, -0.62, 0.56] }, // the 2D hillshade: px world units per pixel, slope exaggeration
    lines: { steep: 0.11, every: 180 },
  };
  const D = N.TERRAIN_DATA || null;
  let H = null, cols = 0, rows = 0, step = 75, ref = 0, base = 0, quant = 0.25;
  function init() {
    if (!D) return false;
    cols = D.cols; rows = D.rows; step = D.step; base = D.base; quant = D.quant; ref = D.lakeRef != null ? D.lakeRef : base;
    const bin = atob(D.b64), u16 = new Uint16Array(bin.length >> 1);
    for (let i = 0; i < u16.length; i++) u16[i] = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    H = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) H[i] = base + u16[i] * quant;
    return true;
  }
  const ok = init();
  /** metres above sea level at world (x, y): bilinear between the nodes */
  function metresAt(x, y) {
    if (!H) return ref;
    let fx = x / step, fy = y / step;
    if (fx < 0) fx = 0; else if (fx > cols - 1.0001) fx = cols - 1.0001;
    if (fy < 0) fy = 0; else if (fy > rows - 1.0001) fy = rows - 1.0001;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, o = j * cols + i;
    const a = H[o], b = H[o + 1], c = H[o + cols], d = H[o + cols + 1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  const heightAt = (x, y) => (metresAt(x, y) - ref) * TUNE.vscale;
  const SL = { gx: 0, gy: 0 };
  /** the gradient (3D units of rise per world unit) by central differences half a node apart */
  function slopeAt(x, y, out) {
    out = out || SL;
    const e = step * 0.5;
    out.gx = (heightAt(x + e, y) - heightAt(x - e, y)) / (2 * e);
    out.gy = (heightAt(x, y + e) - heightAt(x, y - e)) / (2 * e);
    return out;
  }
  function gradeAt(x, y, a) { const s = slopeAt(x, y); return s.gx * Math.cos(a) + s.gy * Math.sin(a); }
  /** what gravity adds along heading a for a vehicle / walker class (negative uphill) */
  function accelAlong(x, y, a, cls) { const k = TUNE.clsK[cls] != null ? TUNE.clsK[cls] : 0.7; return k ? -TUNE.g * k * gradeAt(x, y, a) : 0; }
  /** on foot: the speed multiplier walking along (dx, dy) (unit vector) */
  function walkMul(x, y, dx, dy) {
    const s = slopeAt(x, y), g = s.gx * dx + s.gy * dy;
    const m = g > 0 ? 1 - TUNE.walkUp * g : 1 - TUNE.walkDown * g;
    return m < TUNE.walkMin ? TUNE.walkMin : m > TUNE.walkMax ? TUNE.walkMax : m;
  }
  function range() { if (!H) return { lo: 0, hi: 0 }; let lo = Infinity, hi = -Infinity; for (const v of H) { if (v < lo) lo = v; if (v > hi) hi = v; } return { lo: (lo - ref) * TUNE.vscale, hi: (hi - ref) * TUNE.vscale }; }

  /* ---------------------------------------------------------------- 2D: the hillshade */
  const HS = { canvas: null, w: 0, h: 0 };
  function buildShade() {
    const P = TUNE.hs, w = Math.ceil(N.WORLD_W / P.px), h = Math.ceil(N.WORLD_H / P.px);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    let [lx, ly, lz] = P.light; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
    const s = { gx: 0, gy: 0 };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      slopeAt((i + 0.5) * P.px, (j + 0.5) * P.px, s);
      const gx = s.gx * P.ex, gy = s.gy * P.ex;
      // the surface normal (-gx, -gy, 1) against the light, less what flat ground gets: mid grey = no change
      const l = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1) - lz;
      const v = Math.max(0, Math.min(255, 128 + l * 255 * 1.1)), k = (j * w + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    HS.canvas = c; HS.w = w; HS.h = h;
  }
  function paintShade(ctx, x0, y0, w, h) {
    if (!H) return;
    if (!HS.canvas) buildShade();
    const px = TUNE.hs.px;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = TUNE.hs.alpha; ctx.imageSmoothingEnabled = true;
    const sx = Math.max(0, x0 / px), sy = Math.max(0, y0 / px), sw = Math.min(HS.w - sx, w / px), sh = Math.min(HS.h - sy, h / px);
    if (sw > 0 && sh > 0) ctx.drawImage(HS.canvas, sx, sy, sw, sh, sx * px, sy * px, sw * px, sh * px);
    ctx.restore();
  }
  const R = N.render;
  if (R && R.setGroundPainter && ok) {
    const origSet = R.setGroundPainter;
    R.setGroundPainter = function (fn) {
      if (typeof fn !== 'function') return origSet.call(R, fn);
      const composed = function (ctx, x0, y0, w, h) { fn(ctx, x0, y0, w, h); try { paintShade(ctx, x0, y0, w, h); } catch (e) { if (N.err) N.err('terrain.shade', e); } };
      composed.base = fn;
      return origSet.call(R, composed);
    };
  }

  /* ---------------------------------------------------------------- a word on the steep bits */
  const LINES = {
    down: ['*Wheeeee!* No brakes, no brakes!', 'Downhill! The cycle is flying!', '*Arre baap re*, this road just keeps going down!'],
    up: ['Pedal... pedal... *Banjara Hills is a mountain!*', '*Haaf... haaf...* who put this hill here?', 'Uphill. My legs are filing a complaint.'],
    walk: ['*Haaf haaf*... uphill is not for running.', 'This hill again. *Thak gaya.*'],
  };
  let lineT = 30, lineK = 0;
  function update(dt) {
    if (!ok || N.state.mode !== 'play') return;
    lineT -= dt;
    const p = N.player; if (!p || lineT > 0) return;
    const v = p.vehicle, a = v ? v.angle : Math.atan2(p.vy || 0, p.vx || 0), sp = v ? Math.abs(v.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0);
    if (sp < 8) return;
    const g = gradeAt(p.x, p.y, (v && (v.speed || 0) < 0) ? a + Math.PI : a), L = TUNE.lines;
    let kind = null;
    if (v && v.driver === p && v.T && v.T.pedal) kind = g < -L.steep && sp > 55 ? 'down' : g > L.steep && sp < 40 ? 'up' : null;
    else if (!v && p.running && g > L.steep) kind = 'walk';
    if (!kind) return;
    lineT = L.every;
    const arr = LINES[kind];
    if (N.hud && N.hud.toast) N.hud.toast(arr[lineK++ % arr.length], 2400);
    N.emit('terrain:steep', { kind, grade: g });
  }
  if (N.addSystem) N.addSystem({ id: 'terrain', order: 21, runIn: ['play'], update(dt) { try { update(dt); } catch (e) { N.err('terrain.update', e); } } });

  N.terrain = {
    TUNE, ready: ok, metresAt, heightAt, slopeAt, gradeAt, accelAlong, walkMul, range,
    /** 2D: the hillshade canvas (built on the first ground chunk) */
    get shade() { return HS.canvas; },
    get data() { return H ? { H, cols, rows, step, ref, vscale: TUNE.vscale } : null; },
  };
})();
