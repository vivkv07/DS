#!/usr/bin/env node
/* NOSTALGIA — tools/geo/preview.cjs
 * Renders the projected Map v2 reference layers (tools/geo/project.cjs) with Playwright into
 * tests/out/geo/:
 *   geo_world.png        wards + districts + water + roads (game widths) + rail + places, labelled
 *   geo_vs_old.png       the same layers over the OLD map (worlddata.js scaled x1.5 to 12000 x 9000),
 *                        with arrows from each landmark's old position to its new one
 *   geo_warp.png         the warp itself: 500 m graticule in world space, coloured by local scale
 *   geo_zoom_<area>.png  old_city, abids_koti, himayatnagar, secunderabad, tank_bund at ~1 px/u with
 *                        landmark footprints (worlddata w x d) at their projected centres
 * Usage: node tools/geo/preview.cjs [--only world,vs_old,warp,zoom]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'tests/out/geo');
fs.mkdirSync(OUT, { recursive: true });
const G = require('./project.cjs');
const C = require('./check_projection.cjs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const args = process.argv.slice(2);
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? new Set(args[i + 1].split(',')) : null; })();
const want = (k) => !ONLY || ONLY.has(k);

const r1 = (v) => Math.round(v * 10) / 10;
const ptsW = (line) => line.map((p) => [r1(p[0]), r1(p[1])]);

function buildData() {
  const inp = C.loadInputs();
  G.init();
  const D = inp.D;
  const styleColor = {};
  for (const d of D.districts) styleColor[d.id] = d.ground;
  const data = { W: G.WORLD_W, H: G.WORLD_H };
  const OLDK = G.WORLD_W / 8000; // the old 8000 x 6000 map stretched over the new world
  data.oldK = OLDK;
  // districts (fill) and wards (outline)
  data.districts = inp.districts.map((d) => ({
    id: d.id, name: d.name, style: d.style, color: styleColor[d.id] || '#b9a888',
    polys: d.polys.map((p) => ({ outer: ptsW(G.projectRing(p.outer, { maxSegM: 80 })), holes: (p.holes || []).map((h) => ptsW(G.projectRing(h, { maxSegM: 80 }))) })),
  }));
  data.wards = inp.wards.features.map((f) => {
    const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]);
    return { name: f.properties.name, rings: rings.map((r) => ptsW(G.projectRing(r.map((q) => [q[1], q[0]]), { maxSegM: 80 }))) };
  });
  // water
  const W = inp.water;
  data.water = [];
  data.waterLater = true;
  for (const l of W.lakes.concat(W.small_tanks)) data.water.push({ id: l.id, name: l.name, kind: l.kind, outer: ptsW(G.projectRing(l.poly, { maxSegM: 40 })), holes: (l.holes || []).map((h) => ptsW(G.projectRing(h, { maxSegM: 40 }))) });
  data.rivers = [];
  for (const r of W.rivers) {
    data.rivers.push({ id: r.id, name: r.name, line: ptsW(G.projectLine(r.centreline, { maxSegM: 40 })) });
    for (const b of r.riverbed || []) if (b && b.poly) data.water.push({ id: r.id + '_bed', kind: 'riverbed', outer: ptsW(G.projectRing(b.poly, { maxSegM: 40 })), holes: (b.holes || []).map((h) => ptsW(G.projectRing(h, { maxSegM: 40 }))) });
  }
  data.nalas = W.nalas.map((n) => ({ id: n.id, line: ptsW(G.projectLine(n.pts, { maxSegM: 40 })) }));
  // roads
  const grid = C.gridLanesNotDuplicated(G, inp);
  data.roads = inp.roads.concat(grid).map((r) => ({ id: r.id, name: r.name, kind: r.kind, w: C.ROAD_W[r.kind] || 30, grid: /^himayat_st_/.test(r.id), line: ptsW(G.projectLine(r.pts, { maxSegM: 30 })) }));
  data.rail = inp.rail.sections.map((s) => ({ id: s.id, line: ptsW(G.projectLine(s.pts, { maxSegM: 40 })) }));
  data.stations = inp.rail.stations.filter((s) => s.in_frame !== false).map((s) => { const p = G.project(s.latlon[0], s.latlon[1]); return { id: s.id, name: s.name, x: r1(p[0]), y: r1(p[1]) }; });
  data.hills = inp.terrain.hills.map((h) => ({ id: h.id, name: h.name, outline: h.outline ? ptsW(G.projectRing(h.outline, { maxSegM: 40 })) : null }));
  // places + landmarks
  const L = {}; for (const l of D.landmarks) L[l.id] = l;
  const pD = {}; for (const p of D.places) pD[p.id] = p;
  const MUST = new Set(require(path.join(ROOT, 'tools/validate_map.cjs')).MUST.filter((m) => !m.includes('*')));
  data.places = Object.entries(inp.places).map(([id, e]) => {
    const w = G.placeWorld(e);
    const l = L[id], old = pD[id] || l;
    return {
      id, name: e.name || id, conf: e.confidence, x: r1(w[0]), y: r1(w[1]), alias: !!e.alias,
      lm: l ? { w: l.w, d: l.d, draw: l.draw, noSolid: !!l.noSolid } : null,
      old: old ? [old.x * OLDK, old.y * OLDK] : null,
      must: MUST.has(id), kind: (pD[id] && pD[id].kind) || (l ? 'landmark' : ''), layout: !!e.anchor_latlon,
      inFrame: G.inFrame(e.lat, e.lon),
    };
  });
  // warp graticule (every 0.005 deg ~ 530 m) and the local scale field
  const F = G.FRAME;
  data.grat = [];
  for (let lat = Math.ceil(F.latS / 0.005) * 0.005; lat <= F.latN; lat += 0.005) {
    const line = []; for (let lon = F.lonW; lon <= F.lonE + 1e-9; lon += 0.001) line.push(G.project(lat, Math.min(lon, F.lonE)));
    data.grat.push({ major: Math.abs(lat * 100 - Math.round(lat * 100)) < 1e-6, line: ptsW(line) });
  }
  for (let lon = Math.ceil(F.lonW / 0.005) * 0.005; lon <= F.lonE; lon += 0.005) {
    const line = []; for (let lat = F.latS; lat <= F.latN + 1e-9; lat += 0.001) line.push(G.project(Math.min(lat, F.latN), lon));
    data.grat.push({ major: Math.abs(lon * 100 - Math.round(lon * 100)) < 1e-6, line: ptsW(line) });
  }
  const gc = C.gridCheck(G, 100);
  data.field = { nx: gc.nx, ny: gc.ny, step: gc.step, X: Array.from(gc.X, r1), Y: Array.from(gc.Y, r1), m: gc.field.map((f) => +f.m.toFixed(3)), b: gc.field.map((f) => +f.bearingMaxErr.toFixed(1)) };
  // the old map (scaled by OLDK)
  const k = OLDK;
  data.old = {
    districts: D.districts.map((d) => ({ rect: d.rect.map((v) => v * k), color: d.ground })),
    water: D.water.map((w) => ({ poly: w.poly.map((p) => [p[0] * k, p[1] * k]), color: w.color })),
    roads: D.roads.map((r) => ({ kind: r.kind, w: r.w * k, pts: r.pts.map((p) => [p[0] * k, p[1] * k]) })),
    rails: (D.rails || []).map((r) => ({ pts: r.pts.map((p) => [p[0] * k, p[1] * k]) })),
    parks: D.parks.map((p) => ({ kind: p.kind, poly: p.poly.map((q) => [q[0] * k, q[1] * k]) })),
  };
  data.zones = C.zonesWorld(G).map((z) => ({ id: z.id, name: z.name, x: z.wx, y: z.wy, r: z.wr }));
  data.params = G.PARAMS;
  return data;
}

// --------------------------------------------------------------------------------- page side
function pageDraw(data, view) {
  const cv = document.getElementById('c');
  const S = view.scale;
  cv.width = Math.round(view.w * S); cv.height = Math.round(view.h * S + (view.legend ? 70 : 0));
  const g = cv.getContext('2d');
  g.fillStyle = '#1d1a17'; g.fillRect(0, 0, cv.width, cv.height);
  g.save();
  g.beginPath(); g.rect(0, 0, view.w * S, view.h * S); g.clip();
  g.setTransform(S, 0, 0, S, -view.x * S, -view.y * S);
  const px = 1 / S;
  const path = (p, close) => { g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); if (close) g.closePath(); };
  const inV = (x, y, m) => x > view.x - m && x < view.x + view.w + m && y > view.y - m && y < view.y + view.h + m;
  g.fillStyle = '#6b5a48'; g.fillRect(0, 0, data.W, data.H);
  const L = view.layers;

  if (L.old) {
    const O = data.old;
    for (const d of O.districts) { g.fillStyle = d.color; g.fillRect(...d.rect); }
    const PK = { grass: '#5b8a3c', garden: '#4f8a3a', ground: '#c09468', plaza: '#ddd0b2', rock: '#a28468' };
    for (const p of O.parks) { g.fillStyle = PK[p.kind] || '#5b8a3c'; g.beginPath(); path(p.poly, true); g.fill(); }
    for (const w of O.water) { g.fillStyle = w.color || '#2f7f86'; g.beginPath(); path(w.poly, true); g.fill('evenodd'); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of O.roads) { g.strokeStyle = '#4a4850'; g.lineWidth = r.w; g.beginPath(); path(r.pts); g.stroke(); }
    for (const r of O.rails) { g.strokeStyle = '#3a2a20'; g.lineWidth = 12 * data.oldK; g.beginPath(); path(r.pts); g.stroke(); }
    g.fillStyle = 'rgba(20,16,12,0.35)'; g.fillRect(0, 0, data.W, data.H);
  }
  if (L.districts) {
    g.globalAlpha = L.old ? 0.0 : 1;
    for (const d of data.districts) { g.fillStyle = d.color; g.beginPath(); for (const p of d.polys) { path(p.outer, true); for (const h of p.holes) path(h, true); } g.fill('evenodd'); }
    g.globalAlpha = 1;
  }
  if (L.hills) {
    for (const h of data.hills) if (h.outline) { g.fillStyle = 'rgba(150,120,90,0.45)'; g.strokeStyle = 'rgba(90,60,40,0.7)'; g.lineWidth = 1.5 * px; g.beginPath(); path(h.outline, true); g.fill(); g.stroke(); }
  }
  if (L.water) {
    const wl = data.water.filter((w) => w.kind === 'riverbed').concat(data.water.filter((w) => w.kind !== 'riverbed'));
    for (const w of wl) {
      g.fillStyle = w.kind === 'riverbed' ? (L.old ? 'rgba(205,180,137,0.6)' : '#cdb489') : (L.old ? 'rgba(80,190,220,0.55)' : '#2f7f86');
      g.beginPath(); path(w.outer, true); for (const h of w.holes) path(h, true); g.fill('evenodd');
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of data.rivers) { g.strokeStyle = L.old ? 'rgba(80,190,220,0.9)' : '#2f7f86'; g.lineWidth = Math.max(25 * 0.5 * 1.2, 2 * px); g.beginPath(); path(r.line); g.stroke(); }
    for (const n of data.nalas) { g.strokeStyle = L.old ? 'rgba(80,190,220,0.7)' : '#3b8b8a'; g.lineWidth = Math.max(8, 1.5 * px); g.beginPath(); path(n.line); g.stroke(); }
  }
  if (L.wards) {
    g.strokeStyle = L.old ? 'rgba(255,240,200,0.55)' : 'rgba(40,30,20,0.55)'; g.lineWidth = (view.scale < 0.4 ? 1.2 : 1.5) * px; g.setLineDash([6 * px, 4 * px]);
    for (const w of data.wards) for (const r of w.rings) { g.beginPath(); path(r, true); g.stroke(); }
    g.setLineDash([]);
  }
  if (L.grat) {
    for (const gl of data.grat) { g.strokeStyle = gl.major ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)'; g.lineWidth = (gl.major ? 2 : 1) * px; g.beginPath(); path(gl.line); g.stroke(); }
  }
  if (L.field) {
    const F = data.field;
    for (let j = 0; j < F.ny; j++) for (let i = 0; i < F.nx; i++) {
      const k = j * (F.nx + 1) + i, m = F.m[j * F.nx + i], b = F.b[j * F.nx + i];
      const t = Math.max(0, Math.min(1, (Math.log(m) - Math.log(0.7)) / (Math.log(2.9) - Math.log(0.7))));
      const col = L.field === 'bearing' ? `hsl(${120 - Math.min(1, b / 20) * 120},70%,${40 + 10 * (b > 15)}%)` : `hsl(${230 - 230 * t},65%,${35 + 25 * t}%)`;
      g.fillStyle = col; g.beginPath();
      g.moveTo(F.X[k], F.Y[k]); g.lineTo(F.X[k + 1], F.Y[k + 1]); g.lineTo(F.X[k + F.nx + 2], F.Y[k + F.nx + 2]); g.lineTo(F.X[k + F.nx + 1], F.Y[k + F.nx + 1]); g.closePath(); g.fill();
    }
  }
  if (L.roads) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const RC = { arterial: '#34333a', street: '#4b4a52', lane: '#7d7062', bund: '#3f3e46', bridge: '#6b5c4c', path: '#d8c8a0' };
    const order = ['path', 'lane', 'street', 'bridge', 'arterial', 'bund'];
    const wOf = (r) => (L.roads === 'game' ? r.w : ({ arterial: 4.2, bund: 4.2, street: 2.6, bridge: 3.2, lane: 1.4, path: 1 }[r.kind] || 2) * px);
    for (const k of order) for (const r of data.roads) {
      if (r.kind !== k) continue;
      if (L.old) { g.strokeStyle = r.grid ? 'rgba(255,215,120,0.45)' : 'rgba(255,215,120,0.85)'; g.lineWidth = Math.max(wOf(r) * 0.6, 1.5 * px); }
      else { g.strokeStyle = r.grid ? '#8a7c6a' : RC[k] || '#555'; g.lineWidth = wOf(r); }
      g.beginPath(); path(r.line); g.stroke();
    }
    if (L.roads === 'game' && !L.old) for (const r of data.roads) if (r.kind === 'arterial') { g.strokeStyle = 'rgba(240,220,120,0.55)'; g.lineWidth = 1.2 * px; g.setLineDash([10 * px, 8 * px]); g.beginPath(); path(r.line); g.stroke(); g.setLineDash([]); }
  }
  if (L.rail) {
    for (const r of data.rail) {
      g.strokeStyle = L.old ? 'rgba(255,120,120,0.9)' : '#3a2a20'; g.lineWidth = L.roads === 'game' ? 16 : 3.5 * px; g.beginPath(); path(r.line); g.stroke();
      g.strokeStyle = '#d8d0c0'; g.lineWidth = (L.roads === 'game' ? 2 : 1) * px; g.setLineDash([5 * px, 5 * px]); g.beginPath(); path(r.line); g.stroke(); g.setLineDash([]);
    }
    for (const s of data.stations) { g.fillStyle = '#b0382f'; g.fillRect(s.x - 5 * px, s.y - 5 * px, 10 * px, 10 * px); }
  }
  if (L.footprints) {
    for (const p of data.places) {
      if (!p.lm || !inV(p.x, p.y, 200)) continue;
      const a = p.conf === 'low' ? 0.55 : 0.9;
      g.fillStyle = p.lm.noSolid ? `rgba(210,190,150,${a * 0.6})` : `rgba(236,220,186,${a})`;
      g.strokeStyle = p.must ? '#c0392b' : '#5a4030'; g.lineWidth = (p.must ? 2 : 1) * px;
      g.fillRect(p.x - p.lm.w / 2, p.y - p.lm.d / 2, p.lm.w, p.lm.d); g.strokeRect(p.x - p.lm.w / 2, p.y - p.lm.d / 2, p.lm.w, p.lm.d);
    }
  }
  if (L.arrows) {
    g.lineWidth = 2 * px;
    for (const p of data.places) {
      if (!p.old || !(p.must || p.lm && p.lm.w * p.lm.d > 3000) || p.alias || !p.inFrame) continue;
      g.strokeStyle = 'rgba(255,90,60,0.8)'; g.beginPath(); g.moveTo(p.old[0], p.old[1]); g.lineTo(p.x, p.y); g.stroke();
      g.fillStyle = 'rgba(255,90,60,0.9)'; g.beginPath(); g.arc(p.old[0], p.old[1], 4 * px, 0, 7); g.fill();
    }
  }
  // places
  if (L.places) {
    for (const p of data.places) {
      if (!inV(p.x, p.y, 20)) continue;
      const r = (p.must ? 4 : 2.5) * px * (view.scale > 0.6 ? 1.6 : 1);
      g.fillStyle = p.conf === 'high' ? '#ffe14d' : p.conf === 'medium' ? '#ff9f2e' : '#e8e0d0';
      if (p.layout) g.fillStyle = '#7fe0ff';
      g.strokeStyle = '#111'; g.lineWidth = 1 * px;
      g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill(); g.stroke();
    }
  }
  // labels (greedy, no overlaps), in screen space
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (L.labels) {
    const boxes = [];
    const fs = view.fontPx || 13;
    g.font = `600 ${fs}px system-ui, sans-serif`; g.textBaseline = 'middle';
    const cand = data.places.filter((p) => inV(p.x, p.y, 0) && !p.alias && (L.labels === 'all' ? true : L.labels === 'lm' ? (p.must || p.lm) : p.must));
    cand.sort((a, b) => (b.must - a.must) || ((b.lm ? b.lm.w * b.lm.d : 0) - (a.lm ? a.lm.w * a.lm.d : 0)));
    for (const p of cand) {
      const sx = (p.x - view.x) * S, sy = (p.y - view.y) * S;
      const txt = (p.name || p.id).replace(/\s*\(.*\)$/, '');
      const tw = g.measureText(txt).width;
      const tries = [[8, 0], [-8 - tw, 0], [-tw / 2, -fs], [-tw / 2, fs]];
      for (const [ox, oy] of tries) {
        const b = [sx + ox - 2, sy + oy - fs / 2 - 1, tw + 4, fs + 2];
        if (b[0] < 0 || b[1] < 0 || b[0] + b[2] > view.w * S || b[1] + b[3] > view.h * S) continue;
        if (boxes.some((q) => b[0] < q[0] + q[2] && q[0] < b[0] + b[2] && b[1] < q[1] + q[3] && q[1] < b[1] + b[3])) continue;
        boxes.push(b);
        g.fillStyle = 'rgba(20,16,12,0.72)'; g.fillRect(...b);
        g.fillStyle = p.must ? '#fff4c8' : '#e6dccb'; g.fillText(txt, sx + ox, sy + oy);
        break;
      }
    }
  }
  g.restore();
  // title + legend strip
  if (view.legend) {
    const y0 = view.h * S;
    g.fillStyle = '#16130f'; g.fillRect(0, y0, cv.width, 70);
    g.fillStyle = '#f2e6c8'; g.font = '700 18px system-ui, sans-serif'; g.textBaseline = 'top';
    g.fillText(view.title || '', 14, y0 + 8);
    g.font = '13px system-ui, sans-serif'; g.fillStyle = '#c8bca0';
    g.fillText(view.legend, 14, y0 + 36);
    // scale bar: 1 km at the view centre
    if (view.barPx) {
      const bx = cv.width - 30 - view.barPx, by = y0 + 56;
      g.fillStyle = '#f2e6c8'; g.fillRect(bx, by, view.barPx, 4); g.textAlign = 'right'; g.fillText(view.barLabel, cv.width - 30, y0 + 8); g.textAlign = 'left';
    }
  }
}

async function main() {
  const t0 = Date.now();
  const data = buildData();
  console.log('data built in', Date.now() - t0, 'ms');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent('<!doctype html><html><body style="margin:0;background:#111"><canvas id="c"></canvas></body></html>');
  await page.evaluate((d) => { window.DATA = d; }, data);
  const shot = async (name, view) => {
    await page.evaluate(({ src, view }) => { const f = new Function('return ' + src)(); f(window.DATA, view); }, { src: pageDraw.toString(), view });
    const el = await page.$('#c');
    await el.screenshot({ path: path.join(OUT, name) });
    console.log('wrote', path.join('tests/out/geo', name));
  };
  const W = data.W, H = data.H, OV = 2400 / W;
  const kmAt = (lat, lon, scale) => G.scaleAt(lat, lon).upm * 1000 * scale;
  const P = Object.fromEntries(data.places.map((p) => [p.id, p]));
  const par = data.params;
  const parStr = `warp: ${par.mode}, gain ${par.gain}; cores ` + par.cores.map((c) => `${c.id} a${c.a}/s${c.s}m/p${c.p}`).join(', ') + (par.plateau ? `; plateau a${par.plateau.a}/s${par.plateau.s}m` : '');
  if (want('world')) {
    await shot('geo_world.png', { x: 0, y: 0, w: W, h: H, scale: OV, layers: { districts: 1, hills: 1, water: 1, wards: 1, roads: 'thin', rail: 1, places: 1, labels: 'must' }, fontPx: 12,
      title: `NOSTALGIA Map v2 - real Hyderabad projected into the ${W} x ${H} u world (${(1 / G.BASE_UPM).toFixed(2)} m/u base + core warp)`,
      legend: 'GHMC wards (dashed, DataMeet CC BY 4.0) | roads/water/rail (c) OpenStreetMap contributors (ODbL) | places: yellow high, orange medium, white low, cyan = colony layout | ' + parStr.slice(0, 120) });
  }
  if (want('vs_old')) {
    await shot('geo_vs_old.png', { x: 0, y: 0, w: W, h: H, scale: OV, layers: { old: 1, water: 1, wards: 1, roads: 'thin', rail: 1, arrows: 1, labels: 'must' }, fontPx: 12,
      title: `New projection (gold roads, blue water, dashed wards) over the OLD 8000 x 6000 map scaled x${data.oldK}`,
      legend: `red arrows: must-have landmark moves from its old map position (x${data.oldK}) to its real projected position` });
  }
  if (want('warp')) {
    await shot('geo_warp.png', { x: 0, y: 0, w: W, h: H, scale: OV, layers: { field: 'scale', grat: 1, water: 0, roads: 0, places: 1, labels: 'must' }, fontPx: 12,
      title: `Warp: local scale m (blue 0.7x -> red 2.9x of the ${(1 / G.BASE_UPM).toFixed(2)} m/u base); white = 0.005 deg graticule (bold every 0.01 deg)`,
      legend: 'the graticule stays a grid (monotonic, no fold-overs); cells get bigger where the city is dense' });
    await shot('geo_warp_bearing.png', { x: 0, y: 0, w: W, h: H, scale: OV, layers: { field: 'bearing', grat: 1, places: 1, labels: 'must' }, fontPx: 12,
      title: 'Warp: worst bearing change of a short segment (green 0 deg -> red 20+ deg)',
      legend: 'where the scale changes fastest, directions bend most; the cores themselves stay true' });
  }
  if (want('zoom')) {
    // [file id, centre place, view width in real metres, title]
    const Z = [
      ['old_city', 'charminar', 1250, 'Old City: Charminar, Mecca Masjid, Laad Bazaar, Gulzar Houz and the Kamans, Madina, Chowmahalla'],
      ['abids_koti', 'abids', 2000, 'Abids - Koti - Nampally - Sultan Bazaar'],
      ['himayatnagar', 'home', 1500, 'Himayatnagar colony (home, Lakshmi Nagar layout in cyan) and Narayanguda'],
      ['secunderabad', 'secunderabad_clock_tower', 2000, 'Secunderabad: Clock Tower, station, Monda Market, Rathifile'],
      ['tank_bund', 'tank_bund', 3200, 'Tank Bund / Lumbini / Secretariat / Birla Mandir'],
    ];
    const PL = require(path.join(ROOT, 'design/geo/places.json')).places;
    for (const [id, centre, metres, title] of Z) {
      const c = P[centre], e = PL[centre], sa = G.scaleAt(e.lat, e.lon);
      const w = metres * sa.upm, h = w * 0.766, sc = 1600 / w;
      await shot(`geo_zoom_${id}.png`, { x: c.x - w / 2, y: c.y - h / 2, w, h, scale: sc, layers: { districts: 1, hills: 1, water: 1, wards: 1, roads: 'game', rail: 1, footprints: 1, places: 1, labels: 'lm' }, fontPx: 13,
        title, legend: `roads at game widths (arterial 52, street 36, lane 22 u); footprints = worlddata landmark w x d at the projected centre (red outline = must-have); local scale ${sa.m.toFixed(2)}x = ${sa.upm.toFixed(2)} u/m = ${sa.mpu.toFixed(2)} m/u; view ${Math.round(w)} x ${Math.round(h)} u`,
        barPx: kmAt(e.lat, e.lon, sc) / 10, barLabel: '100 m (real) here' });
    }
  }
  await browser.close();
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { buildData };
