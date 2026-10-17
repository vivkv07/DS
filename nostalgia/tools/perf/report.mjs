#!/usr/bin/env node
/* NOSTALGIA — tools/perf/report.mjs
 * Summarises the JSON files written by tools/perf/measure.cjs into the markdown tables used in
 * design/online/delivery_measurements.md (medians across runs; n = number of runs).
 *   node nostalgia/tools/perf/report.mjs <results/runs dir>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
const runs = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  for (const r of j.results) if (!r.failed) runs.push(Object.assign({ hostBI: j.hostBI, loadAvg: j.loadAvg }, r));
}
const med = (a) => { a = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; const v = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; return Math.round(v * 10) / 10; };
const s = (ms) => (ms == null ? '–' : (ms / 1000).toFixed(1) + ' s');
const ms = (v) => (v == null ? '–' : Math.round(v) + ' ms');
const kb = (b) => (b == null ? '–' : b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1024).toFixed(0) + ' KB');
const key = (r) => r.variant + '|' + r.profile + '|' + r.cpu;
const groups = {};
for (const r of runs) (groups[key(r)] = groups[key(r)] || []).push(r);
const order = ['a', 'b', 'c', 'd'], porder = ['none', 'fast4g', 'slow4g', '3g'];
const keys = Object.keys(groups).sort((x, y) => { const [va, pa, ca] = x.split('|'), [vb, pb, cb] = y.split('|'); return order.indexOf(va) - order.indexOf(vb) || porder.indexOf(pa) - porder.indexOf(pb) || ca - cb; });
const G = (k, f) => med(groups[k].map(f));

console.log('\n### Cold load -> title screen\n');
console.log('| variant | network | CPU | n | page BI (throttled) | HTML downloaded | FCP (boot splash) | DCL (all JS parsed+run) | title interactive | bytes | main-thread CPU | V8 compile | world.build |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of keys) {
  const g = groups[k]; const [v, p, c] = k.split('|');
  console.log('| ' + [v, p, c + 'x', g.length, G(k, (r) => r.pageBI), s(G(k, (r) => r.title.nav.htmlEnd)), s(G(k, (r) => r.title.marks.fcp)), s(G(k, (r) => r.title.marks.dcl)), s(G(k, (r) => r.title.marks.booted)), kb(G(k, (r) => r.title.bytes)), s(G(k, (r) => r.title.cpu.threadMs)), ms(G(k, (r) => r.title.cpu.compileMs)), ms(G(k, (r) => r.title.worldBuildMs))].join(' | ') + ' |');
}
console.log('\n### PLAY -> playable\n');
console.log('| variant | network | n | PLAY tap -> name card painted | START tap -> first game frame (mode) | SKIP tap -> free-roam frame |');
console.log('|---|---|---|---|---|---|');
for (const k of keys) {
  const g = groups[k].filter((r) => r.play); if (!g.length) continue; const [v, p] = k.split('|');
  console.log('| ' + [v, p, g.length, ms(med(g.map((r) => r.play.tapToNameFrame))), ms(med(g.map((r) => r.play.startTapToGameFrame))) + ' (' + g[0].play.startedMode + ')', ms(med(g.map((r) => r.play.skipTapToPlayFrame)))].join(' | ') + ' |');
}
console.log('\n### Frame time, top-down (6 s walking each)\n');
console.log('| variant | network | n | scene | rAF p50 | rAF p95 | frames >33 ms | game update ms | game draw ms | game frame ms | JS heap |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of keys) {
  const g = groups[k].filter((r) => r.frames2d); if (!g.length) continue; const [v, p] = k.split('|');
  for (const sc of ['spawn', 'oldcity']) {
    const F = g.map((r) => r.frames2d[sc]);
    console.log('| ' + [v, p, g.length, sc + ' (' + F[0].where + ')', ms(med(F.map((f) => f.rafP50))), ms(med(F.map((f) => f.rafP95))), med(F.map((f) => (f.frames ? Math.round(100 * f.over33 / f.frames) : null))) + '%', ms(med(F.map((f) => f.gameUpdateMs))), ms(med(F.map((f) => f.gameDrawMs))), ms(med(F.map((f) => f.gameFrameMs))), med(g.map((r) => r.frames2d.heapMB)) + ' MB'].join(' | ') + ' |');
  }
}
console.log('\n### 3D\n');
console.log('| variant | network | n | V -> 3D ready | Blender models ready | bytes fetched | main-thread CPU | rAF p50 | rAF p95 | view3d JS ms/frame | draw calls | triangles | pixel ratio | JS heap | renderer PSS | GPU proc PSS |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of keys) {
  const g = groups[k].filter((r) => r.three); if (!g.length) continue; const [v, p] = k.split('|');
  const f3 = g.filter((r) => r.frames3d);
  console.log('| ' + [v, p, g.length, s(med(g.map((r) => r.three.toReadyMs))), s(med(g.map((r) => r.three.modelsMs))), kb(med(g.map((r) => r.three.bytes))), s(med(g.map((r) => r.three.cpu.threadMs))),
    ms(med(f3.map((r) => r.frames3d.rafP50))), ms(med(f3.map((r) => r.frames3d.rafP95))), ms(med(f3.map((r) => r.frames3d.statsAfter.jsAvg))), med(f3.map((r) => r.frames3d.statsAfter.calls)), med(f3.map((r) => r.frames3d.statsAfter.triangles)), med(f3.map((r) => r.frames3d.statsAfter.pixelRatio)),
    med(f3.map((r) => r.frames3d.heapMB)) + ' MB', med(f3.map((r) => r.frames3d.mem.renderer && r.frames3d.mem.renderer.pssMB)) + ' MB', med(f3.map((r) => r.frames3d.mem['gpu-process'] && r.frames3d.mem['gpu-process'].pssMB)) + ' MB'].join(' | ') + ' |');
}
console.log('\n### Memory (renderer process PSS / JS heap)\n');
console.log('| variant | network | at title | in play (2D) | in 3D |');
console.log('|---|---|---|---|---|');
for (const k of keys) {
  const g = groups[k]; const [v, p] = k.split('|');
  const m = (f) => med(g.map(f));
  console.log('| ' + [v, p, m((r) => r.title.mem.renderer && r.title.mem.renderer.pssMB) + ' MB / ' + m((r) => r.title.heapMB) + ' MB',
    g.some((r) => r.frames2d) ? m((r) => r.frames2d && r.frames2d.mem.renderer && r.frames2d.mem.renderer.pssMB) + ' MB / ' + m((r) => r.frames2d && r.frames2d.heapMB) + ' MB' : '–',
    g.some((r) => r.frames3d) ? m((r) => r.frames3d && r.frames3d.mem.renderer && r.frames3d.mem.renderer.pssMB) + ' MB / ' + m((r) => r.frames3d && r.frames3d.heapMB) + ' MB' : '–'].join(' | ') + ' |');
}
console.log('\n### Repeat visits and offline\n');
console.log('| variant | network | n | repeat 1: title | bytes | CPU | compile | repeat 2: title | bytes | CPU | compile | offline |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k of keys) {
  const g = groups[k].filter((r) => r.repeat && r.repeat.length); if (!g.length) continue; const [v, p] = k.split('|');
  const R = (i, f) => med(g.map((r) => r.repeat[i] && f(r.repeat[i])));
  const off = g.filter((r) => r.offline).map((r) => (r.offline.ok ? 'works (' + s(r.offline.booted) + ')' : 'fails'));
  console.log('| ' + [v, p, g.length, s(R(0, (x) => x.marks.booted)), kb(R(0, (x) => x.bytes)), s(R(0, (x) => x.cpu.threadMs)), ms(R(0, (x) => x.cpu.compileMs)), s(R(1, (x) => x.marks.booted)), kb(R(1, (x) => x.bytes)), s(R(1, (x) => x.cpu.threadMs)), ms(R(1, (x) => x.cpu.compileMs)), off.join(', ') || '–'].join(' | ') + ' |');
}
// per-module parse+eval cost (variant b marks)
const b = runs.filter((r) => r.variant === 'b' && r.title.modMarks && r.title.modMarks.length);
for (const cpu of [...new Set(b.map((r) => r.cpu))]) {
  const bb = b.filter((r) => r.cpu === cpu);
  const rows = {};
  for (const r of bb) {
    const mm = r.title.modMarks;
    for (let i = 0; i < mm.length - 1; i++) (rows[mm[i][0]] = rows[mm[i][0]] || []).push(mm[i + 1][1] - mm[i][1]);
  }
  const list = Object.keys(rows).map((k) => [k, med(rows[k])]).sort((x, y) => y[1] - x[1]);
  const tot = list.reduce((t, x) => t + x[1], 0);
  console.log('\n### Per-module parse + top-level run, CPU ' + cpu + 'x (variant b, n=' + bb.length + '), total ' + ms(tot) + '\n');
  console.log('| module | ms | share |');
  console.log('|---|---|---|');
  for (const [k, v] of list) console.log('| ' + k + ' | ' + ms(v) + ' | ' + Math.round(100 * v / tot) + '% |');
  const ph = {};
  for (const r of bb) for (const [n, , d] of (r.title.bootPhases || [])) (ph[n] = ph[n] || []).push(d);
  if (Object.keys(ph).length) {
    console.log('\nBoot phases after DOMContentLoaded (main.js start), CPU ' + cpu + 'x:\n');
    console.log('| phase | ms |');
    console.log('|---|---|');
    for (const n of Object.keys(ph)) console.log('| ' + n + ' | ' + ms(med(ph[n])) + ' |');
  }
  console.log('\nboot after scripts (DCL -> title interactive): ' + ms(med(bb.map((r) => r.title.marks.booted - r.title.marks.dcl))) + ', world.build ' + ms(med(bb.map((r) => r.title.worldBuildMs))) + ', first long task ' + ms(med(bb.map((r) => (r.title.long[0] || [0, 0])[1]))));
}
console.log('\nhost: benchmarkIndex (CPU-time) ' + [...new Set(runs.map((r) => r.hostBI))].join(', ') + '; load avg at start ' + [...new Set(runs.map((r) => r.loadAvg.toFixed(0)))].join(', '));
