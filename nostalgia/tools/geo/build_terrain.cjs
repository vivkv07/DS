#!/usr/bin/env node
/* NOSTALGIA — tools/geo/build_terrain.cjs   (the ground's real rise and fall; node >= 22, no npm deps)
 *
 * Generates src/terrain_data.js (N.TERRAIN_DATA): a height grid over the whole world, in metres above sea level,
 * from the SRTM-based Terrain Tiles (Terrarium PNGs, AWS Open Data elevation-tiles-prod, public domain NASA data;
 * the source design/geo/terrain.json's hills and 300 m elevation_grid were made from) sampled through
 * tools/geo/project.cjs, so every world unit sits on the real ground under it: Banjara and Jubilee Hills, Golconda,
 * Naubat Pahad and Moula Ali up high, Hussain Sagar, the Musi and its riverbed down low.
 *
 *  1. Tiles: zoom 14 (~9 m pixels), every tile over the frame (+ a margin), fetched once into
 *     tools/geo/.cache/terrarium (gitignored); Terrarium decoding: m = R * 256 + G + B / 256 - 32768.
 *  2. Each grid node (STEP world units apart) is unprojected to lat / lon and given the MEDIAN of the DEM pixels
 *     within ~R_M metres (SRTM is a surface model: the median looks through buildings and trees to the ground).
 *  3. Water (N.WORLD_DATA.water polygons, in world units): nodes inside a lake / tank take its level (the 20th
 *     percentile of the DEM inside it: SRTM water is flat but noisy); land next to water is kept at least
 *     SHORE m above it (no water plane spilling over its banks in 3D). Rivers and nalas (the Musi, the Esi, the
 *     colony nalas) are channels instead: CHANNEL m below the land either side, falling with it downstream (one
 *     level for the whole Musi would cut a 25 m gorge upstream). Bridges stay level: the ground along each bridge
 *     road runs straight from one bank to the other.
 *  4. A light Gaussian on land only (water levels re-applied after), then quantised to 0.25 m (Uint16, base64).
 *
 * Usage: node tools/geo/build_terrain.cjs [--report]      (~30 s with the tiles cached; ~100 tiles to fetch once)
 * Same input -> same output.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const GEO = require('./project.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE = path.join(__dirname, '.cache', 'terrarium');
const OUT = path.join(ROOT, 'src', 'terrain_data.js');
const Z = 14, STEP = 75, R_M = 70, SIGMA = 0.9, SHORE = 0.6, CHANNEL = 2.5, QUANT = 0.25;
const REPORT = process.argv.includes('--report');
const W = GEO.WORLD_W, H = GEO.WORLD_H;
const log = (...a) => console.log(...a);

/* ---------------------------------------------------------------- PNG (8-bit RGB / RGBA, non-interlaced) */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w = 0, h = 0, ct = 0, bd = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced PNG'); }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error('PNG type ' + ct + '/' + bd);
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/* ---------------------------------------------------------------- tiles */
const lon2x = (lon) => ((lon + 180) / 360) * (1 << Z);
const lat2y = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << Z); };
async function tile(tx, ty) {
  const f = path.join(CACHE, `${Z}_${tx}_${ty}.png`);
  if (!fs.existsSync(f)) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`;
    let ok = false;
    for (let k = 0; k < 4 && !ok; k++) {
      try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); ok = true; }
      catch (e) { if (k === 3) throw new Error(url + ': ' + e.message); await new Promise((res) => setTimeout(res, 1000 * 2 ** k)); }
    }
  }
  return decodePNG(fs.readFileSync(f));
}

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(CACHE, { recursive: true });
  const fr = GEO.FRAME || { lonW: 78.33507, lonE: 78.56093, latS: 17.31218, latN: 17.47482 };
  const m = 0.01;
  const tx0 = Math.floor(lon2x(fr.lonW - m)), tx1 = Math.floor(lon2x(fr.lonE + m)), ty0 = Math.floor(lat2y(fr.latN + m)), ty1 = Math.floor(lat2y(fr.latS - m));
  const TW = tx1 - tx0 + 1, TH = ty1 - ty0 + 1;
  log(`tiles z${Z}: ${TW} x ${TH} = ${TW * TH}`);
  // the mosaic, metres, in global pixel space offset by (tx0, ty0) * 256
  const MW = TW * 256, MH = TH * 256, DEM = new Float32Array(MW * MH);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = await tile(tx, ty), ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * t.bpp, d = t.data;
      DEM[(oy + y) * MW + ox + x] = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
    }
  }
  log(`mosaic ${MW} x ${MH} px (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const pxPerM = (lat) => (1 << Z) * 256 / (40075016.686 * Math.cos((lat * Math.PI) / 180));

  // the world's water polygons (src/worlddata.js)
  const ctx = { window: {}, N: {} }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'worlddata.js'), 'utf8'), ctx);
  const WD = ctx.N.WORLD_DATA;
  const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const polysOf = (w) => (w.poly ? [w.poly] : w.polys || []);
  const waters = WD.water.filter((w) => polysOf(w).some((p) => p && p.length > 2));
  const isChannel = (w) => !!w.river || /nala/.test(w.id);

  // 2. grid nodes: the median of the DEM within R_M metres
  const cols = Math.ceil(W / STEP) + 1, rows = Math.ceil(H / STEP) + 1;
  const G = new Float32Array(cols * rows);
  const buf = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const [lat, lon] = GEO.unproject(Math.min(W, i * STEP), Math.min(H, j * STEP));
    const px = lon2x(lon) * 256 - tx0 * 256, py = lat2y(lat) * 256 - ty0 * 256, r = Math.max(1, Math.round(R_M * pxPerM(lat)));
    buf.length = 0;
    for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = Math.round(px + dx), y = Math.round(py + dy);
      if (x >= 0 && y >= 0 && x < MW && y < MH) buf.push(DEM[y * MW + x]);
    }
    buf.sort((a, b) => a - b);
    G[j * cols + i] = buf.length ? buf[buf.length >> 1] : 0;
  }
  log(`grid ${cols} x ${rows} nodes, ${STEP} u apart (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

  // 3. water: each lake's level, its nodes flat at it
  const WATER = new Int16Array(cols * rows).fill(-1), CHAN = new Uint8Array(cols * rows), levels = [];
  waters.forEach((w, k) => {
    const nodes = [];
    for (const P of polysOf(w)) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of P) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      for (let j = Math.max(0, Math.floor(y0 / STEP)); j <= Math.min(rows - 1, Math.ceil(y1 / STEP)); j++) for (let i = Math.max(0, Math.floor(x0 / STEP)); i <= Math.min(cols - 1, Math.ceil(x1 / STEP)); i++) {
        if (inPoly(i * STEP, j * STEP, P)) nodes.push(j * cols + i);
      }
    }
    if (!nodes.length) { levels.push(null); return; }
    if (isChannel(w)) { levels.push({ id: w.id, channel: true, n: nodes.length }); for (const n of nodes) CHAN[n] = 1; return; }
    const hs = nodes.map((n) => G[n]).sort((a, b) => a - b), lvl = hs[Math.floor(hs.length * 0.2)];
    levels.push({ id: w.id, level: lvl, n: nodes.length });
    for (const n of nodes) WATER[n] = k;
  });
  // channels: the land either side (the nearest non-channel nodes, a widening ring), less CHANNEL
  const landNear = (i, j) => {
    for (let r = 1; r < 12; r++) {
      let s = 0, c = 0;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
        const n = jj * cols + ii; if (CHAN[n] || WATER[n] >= 0) continue;
        s += G[n]; c++;
      }
      if (c >= 2) return s / c;
    }
    return null;
  };
  const chanLevel = new Float32Array(cols * rows).fill(NaN);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const n = j * cols + i; if (CHAN[n]) { const l = landNear(i, j); chanLevel[n] = l == null ? G[n] : Math.min(G[n] + 1, l - CHANNEL); } }
  const applyWater = () => { for (let n = 0; n < G.length; n++) { if (WATER[n] >= 0) G[n] = levels[WATER[n]].level; else if (CHAN[n] && chanLevel[n] === chanLevel[n]) G[n] = chanLevel[n]; } };
  applyWater();

  // 4. a light Gaussian on land (water stays put), the banks kept above their water
  if (SIGMA > 0) {
    const R = Math.ceil(SIGMA * 2.5), K = []; let ks = 0;
    for (let d = -R; d <= R; d++) { const v = Math.exp(-(d * d) / (2 * SIGMA * SIGMA)); K.push(v); ks += v; }
    const tmp = new Float32Array(G.length);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { let s = 0; for (let d = -R; d <= R; d++) { const ii = Math.min(cols - 1, Math.max(0, i + d)); s += G[j * cols + ii] * K[d + R]; } tmp[j * cols + i] = s / ks; }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { let s = 0; for (let d = -R; d <= R; d++) { const jj = Math.min(rows - 1, Math.max(0, j + d)); s += tmp[jj * cols + i] * K[d + R]; } G[j * cols + i] = s / ks; }
    applyWater();
  }
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const n = j * cols + i; if (WATER[n] >= 0 || CHAN[n]) continue;
    let need = -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue; const w = WATER[jj * cols + ii]; if (w >= 0) need = Math.max(need, levels[w].level + SHORE); }
    if (G[n] < need) G[n] = need;
  }
  // bridges: level from bank to bank (the nodes within a node of the deck, set along the straight line)
  const hAt0 = (x, y) => { const fx = Math.min(cols - 1.001, Math.max(0, x / STEP)), fy = Math.min(rows - 1.001, Math.max(0, y / STEP)), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j; return (G[j * cols + i] * (1 - u) + G[j * cols + i + 1] * u) * (1 - v) + (G[(j + 1) * cols + i] * (1 - u) + G[(j + 1) * cols + i + 1] * u) * v; };
  let nBridge = 0;
  for (const r of WD.roads) {
    if (r.kind !== 'bridge' || !r.pts || r.pts.length < 2) continue;
    const A = r.pts[0], B = r.pts[r.pts.length - 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1) continue;
    const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, hA = hAt0(A[0] - ux * STEP, A[1] - uy * STEP), hB = hAt0(B[0] + ux * STEP, B[1] + uy * STEP);
    const set = new Map();
    for (let d = -STEP; d <= L + STEP; d += STEP / 3) {
      const x = A[0] + ux * d, y = A[1] + uy * d, t = Math.min(1, Math.max(0, d / L)), h = hA + (hB - hA) * t;
      for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) { const i = Math.floor(x / STEP) + di, j = Math.floor(y / STEP) + dj; if (i < 0 || j < 0 || i >= cols || j >= rows) continue; const n = j * cols + i; if (WATER[n] >= 0) continue; set.set(n, Math.max(set.get(n) || -Infinity, h)); }
    }
    for (const [n, h] of set) G[n] = Math.max(G[n], h);
    nBridge++;
  }
  log(`bridges levelled: ${nBridge}`);

  // quantise, encode
  let lo = Infinity, hi = -Infinity; for (const v of G) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const base = Math.floor(lo), q = new Uint16Array(G.length);
  for (let n = 0; n < G.length; n++) q[n] = Math.round((G[n] - base) / QUANT);
  const b64 = Buffer.from(q.buffer).toString('base64');
  const lakes = levels.filter((l) => l && !l.channel).sort((a, b) => b.n - a.n).slice(0, 12).map((l) => `${l.id} ${l.level.toFixed(1)}`).join(', ');
  const at = (id) => { const P = WD.places.find((p) => p.id === id); if (!P) return null; const i = Math.round(P.x / STEP), j = Math.round(P.y / STEP); return G[j * cols + i]; };
  const probe = ['charminar', 'koti', 'abids', 'necklace_road', 'tank_bund', 'secretariat', 'liberty', 'public_gardens', 'birla_mandir', 'lb_stadium', 'golconda', 'golconda_fort', 'banjara_hills', 'jubilee_hills', 'jubilee_hills_checkpost', 'kbr_park', 'punjagutta', 'ameerpet', 'mehdipatnam', 'tolichowki', 'hitec_city', 'secunderabad', 'begumpet', 'moula_ali', 'falaknuma', 'osmania_university', 'afzalgunj', 'dilsukhnagar'].map((id) => [id, at(id)]).filter((p) => p[1] != null);
  const js = `/* NOSTALGIA — terrain_data.js   (GENERATED by tools/geo/build_terrain.cjs: do not edit by hand)
 * The ground's height (metres above sea level) every ${STEP} world units over the ${W} x ${H} u world, rows north to
 * south, columns west to east (node (i, j) at x = i * ${STEP}, y = j * ${STEP}): value = base + u16 * ${QUANT}.
 * Source: Terrain Tiles (Terrarium, zoom ${Z}, SRTM-based, public domain NASA data; AWS Open Data elevation-tiles-prod),
 * the median of the DEM within ${R_M} m of each node (through buildings and trees to the ground), lakes flat at their
 * level, banks kept above them, a light smoothing. Range ${lo.toFixed(1)} - ${hi.toFixed(1)} m.
 * Lake levels (m): ${lakes}.
 * Spot heights (m): ${probe.map((p) => p[0] + ' ' + p[1].toFixed(0)).join(', ')}.
 */
N.TERRAIN_DATA = { step: ${STEP}, cols: ${cols}, rows: ${rows}, base: ${base}, quant: ${QUANT}, lakeRef: ${(levels.find((l) => l && l.id === 'hussain_sagar') || { level: base }).level.toFixed(2)}, b64: '${b64}' };
`;
  fs.writeFileSync(OUT, js);
  log(`wrote ${path.relative(ROOT, OUT)} (${(js.length / 1024).toFixed(0)} KB), range ${lo.toFixed(1)} - ${hi.toFixed(1)} m, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  log('lakes: ' + lakes);
  log('spot heights: ' + probe.map((p) => p[0] + ' ' + p[1].toFixed(0)).join(', '));
  if (REPORT) {
    // the steepest roads (rise per world unit along the road, between grid samples)
    const hAt = (x, y) => { const fx = x / STEP, fy = y / STEP, i = Math.min(cols - 2, Math.max(0, Math.floor(fx))), j = Math.min(rows - 2, Math.max(0, Math.floor(fy))), u = fx - i, v = fy - j; return (G[j * cols + i] * (1 - u) + G[j * cols + i + 1] * u) * (1 - v) + (G[(j + 1) * cols + i] * (1 - u) + G[(j + 1) * cols + i + 1] * u) * v; };
    const st = [];
    for (const r of WD.roads) { const P = r.pts || r.path; if (!P) continue; for (let k = 1; k < P.length; k++) { const a = P[k - 1], b = P[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 60) continue; const [la, lo2] = GEO.unproject((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), upm = GEO.scaleAt(la, lo2).upm; st.push({ id: r.id || r.name, g: Math.abs(hAt(b[0], b[1]) - hAt(a[0], a[1])) / (L / upm) * 100 }); } }
    st.sort((a, b) => b.g - a.g);
    log('steepest road segments (real %): ' + st.slice(0, 15).map((s) => s.id + ' ' + s.g.toFixed(1)).join(', '));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
