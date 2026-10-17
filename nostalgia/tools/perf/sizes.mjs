#!/usr/bin/env node
/* NOSTALGIA — tools/perf/sizes.mjs (no dependencies)
 * Byte budget of the real build: raw / gzip -9 / brotli q11 for dist/*.html, style.css, every
 * src/*.js (grouped by when it is needed), the vendored three.js + GLTFLoader, the Blender GLBs
 * (raw and as base64-in-JS, which is how src/assets3d_pack.js ships them) and, if a folder of
 * downloaded Google Fonts woff2 files is given, the fonts.
 *
 *   node nostalgia/tools/perf/sizes.mjs [--root <snapshot dir>] [--glb <assets3d dir>]
 *        [--fonts <dir with *.woff2 + fonts.css>] [--json out.json]
 *
 * Groups (who needs a module, judged from what it does at runtime, not from load order):
 *   boot   needed to reach the title screen (engine, world, render, menus, audio synthesis)
 *   play   needed in the first minute of play (HUD, player, traffic, dialogue, story)
 *   later  only used once a specific activity starts (minigames, cricket, shops, side jobs ...)
 *   3d     only used after the player switches to the 3D view (view3d*.js, three.js, GLB pack)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants as Z } from 'node:zlib';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
// --root <snapshot>: measure a frozen copy (index.html, style.css, src/, vendor/, nostalgia.html)
const ROOT = arg('--root') ? resolve(arg('--root')) : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const GROUP = {
  'core.js': 'boot', 'input.js': 'boot', 'audio.js': 'boot', 'render.js': 'boot', 'worlddata.js': 'boot',
  'world.js': 'boot', 'world_extras.js': 'boot', 'landmarks.js': 'boot', 'places_art.js': 'boot',
  'menus.js': 'boot', 'save.js': 'boot', 'debug.js': 'boot', 'main.js': 'boot', 'entities.js': 'boot',
  'seasons.js': 'play', 'vehicles.js': 'play', 'traffic.js': 'play', 'npcs.js': 'play', 'wanted.js': 'play',
  'hud.js': 'play', 'dialogue.js': 'play', 'missions.js': 'play', 'storycore.js': 'play', 'story.js': 'play',
  'story2.js': 'later', 'collectibles.js': 'play', 'shops.js': 'later', 'sidejobs.js': 'later',
  'minigames.js': 'later', 'cricket_match.js': 'later', 'playground_games.js': 'later',
  'view3d.js': '3d', 'view3d_ground.js': '3d', 'view3d_landmarks.js': '3d', 'view3d_actors.js': '3d',
  'models3d.js': '3d', 'assets3d_pack.js': '3d',
};

const measure = (buf) => ({
  raw: buf.length,
  gzip: gzipSync(buf, { level: 9 }).length,
  br: brotliCompressSync(buf, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length,
});
const fmt = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB');
const rows = [];
const add = (name, group, buf, note) => { const m = measure(buf); rows.push({ name, group, ...m, note: note || '' }); return m; };

// --- built pages
for (const f of ['dist/nostalgia.html', 'dist/artifact.html', 'nostalgia.html', 'artifact.html']) {
  const p = join(ROOT, f);
  if (existsSync(p)) add(f, 'page', readFileSync(p));
}
add('style.css', 'boot', readFileSync(join(ROOT, 'style.css')));

// --- source modules, in index.html order
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script\s+src="(src\/[^"]+)"/g)].map((m) => m[1]);
const all = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f);
for (const f of order.concat(all.filter((f) => order.indexOf(f) < 0))) {
  const b = basename(f);
  add(f, GROUP[b] || 'unclassified', readFileSync(join(ROOT, f)), order.indexOf(f) < 0 ? 'not in index.html' : '');
}

// --- vendor
for (const f of ['vendor/three/three.min.js', 'vendor/three/GLTFLoader.classic.js']) {
  if (existsSync(join(ROOT, f))) add(f, '3d', readFileSync(join(ROOT, f)), 'lazy');
}

// --- Blender GLBs: raw binary vs base64 inside a JS string (the pack format)
const glbDir = arg('--glb') ? resolve(arg('--glb')) : join(ROOT, 'assets3d');
let glbRaw = Buffer.alloc(0);
if (existsSync(glbDir)) {
  for (const f of readdirSync(glbDir).filter((f) => f.endsWith('.glb'))) {
    const buf = readFileSync(join(glbDir, f));
    glbRaw = Buffer.concat([glbRaw, buf]);
    add('assets3d/' + f, '3d', buf, 'binary GLB');
    add('assets3d/' + f + ' as base64 JS', '3d', Buffer.from('N.ASSETS3D["' + f + '"]="' + buf.toString('base64') + '";'), 'pack format');
  }
}

// --- fonts (optional)
const fontDir = arg('--fonts');
const fonts = [];
if (fontDir && existsSync(fontDir)) {
  for (const f of readdirSync(fontDir).filter((f) => f.endsWith('.woff2')).sort()) {
    const n = statSync(join(fontDir, f)).size;
    fonts.push({ name: f, raw: n });
  }
  const css = join(fontDir, 'fonts.css');
  if (existsSync(css)) add('fonts.googleapis.com css2 (4 families)', 'boot', readFileSync(css), 'render-blocking CSS');
}

// --- group totals (modules only)
const totals = {};
for (const r of rows) {
  if (!r.name.startsWith('src/') && r.name !== 'style.css') continue;
  const t = (totals[r.group] = totals[r.group] || { raw: 0, gzip: 0, br: 0, n: 0 });
  t.raw += r.raw; t.gzip += r.gzip; t.br += r.br; t.n++;
}
// compressing the concatenated group (one chunk per group) is what a split build would ship
const groupConcat = {};
for (const g of Object.keys(totals)) {
  const parts = rows.filter((r) => r.group === g && (r.name.startsWith('src/') || r.name === 'style.css')).map((r) => readFileSync(join(ROOT, r.name)));
  groupConcat[g] = measure(Buffer.concat(parts));
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
console.log(pad('file', 46) + pad('group', 8) + lpad('raw', 11) + lpad('gzip-9', 11) + lpad('brotli-11', 11) + '  note');
for (const r of rows) console.log(pad(r.name, 46) + pad(r.group, 8) + lpad(fmt(r.raw), 11) + lpad(fmt(r.gzip), 11) + lpad(fmt(r.br), 11) + '  ' + r.note);
console.log('\nmodule groups (sum of files | one concatenated chunk per group):');
for (const g of Object.keys(totals)) {
  const t = totals[g], c = groupConcat[g];
  console.log('  ' + pad(g, 8) + pad(t.n + ' files', 10) + lpad(fmt(t.raw), 11) + lpad(fmt(t.gzip), 11) + lpad(fmt(t.br), 11) + '   concat: ' + fmt(c.gzip) + ' gz / ' + fmt(c.br) + ' br');
}
if (fonts.length) {
  console.log('\nfonts (woff2, already compressed):');
  for (const f of fonts) console.log('  ' + pad(f.name, 44) + lpad(fmt(f.raw), 11));
}
const out = arg('--json');
if (out) writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), rows, totals, groupConcat, fonts }, null, 1));
