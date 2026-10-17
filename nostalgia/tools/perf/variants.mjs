#!/usr/bin/env node
/* NOSTALGIA — tools/perf/variants.mjs (no dependencies)
 * Builds the hosting EXPERIMENTS that tools/perf/measure.cjs compares. It never touches the game
 * sources: it reads a snapshot folder (index.html, style.css, src/, vendor/, nostalgia.html = the
 * output of tools/build.mjs) and writes one folder per variant:
 *
 *   a  single    dist/nostalgia.html as index.html (today's single-file build, 1 request)
 *   b  marks     a + performance.mark() around every inline module (per-module parse+eval cost)
 *   c  split     index.html + every module as its own content-hashed file under assets/
 *                (same order, same classic scripts: no runtime change), immutable caching
 *   d  pwa       c + self-hosted subset fonts (no third-party CSS) + preload of the boot-critical
 *                files + service worker (precache of the boot set, cache-first for hashed files)
 *                + web manifest + Open Graph tags
 *   e  firstplay a minus the modules a lazy build would defer (activities + 3D): critical-path stand-in
 *   f  firstplay+fonts  e + self-hosted subset fonts (inline @font-face + preload, no Google CSS)
 * Lazy 3D files (vendor/three/GLTFLoader.classic.js, src/assets3d_pack.js) are copied next to every
 * variant at the paths src/models3d.js requests them from.
 *
 *   node nostalgia/tools/perf/variants.mjs --snap <snapshot dir> --out <dir> [--fonts <subset dir>]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SNAP = resolve(arg('--snap'));
const OUT = resolve(arg('--out'));
const FONTS = arg('--fonts') ? resolve(arg('--fonts')) : null;
const read = (p) => readFileSync(join(SNAP, p), 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const safeJs = (src) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

const html = read('index.html');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map((m) => m[1]);
const single = read('nostalgia.html');

function lazyFiles(dir) {
  mkdirSync(join(dir, 'vendor/three'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  for (const f of ['vendor/three/GLTFLoader.classic.js', 'vendor/three/three.min.js', 'src/assets3d_pack.js']) {
    if (existsSync(join(SNAP, f))) copyFileSync(join(SNAP, f), join(dir, f));
  }
}
function fresh(name) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  lazyFiles(dir);
  return dir;
}

// ---- a: single file as shipped
{
  const dir = fresh('a');
  writeFileSync(join(dir, 'index.html'), single);
}

// ---- b: single file + per-module marks
{
  const dir = fresh('b');
  let i = 0;
  const out = single.replace(/<script>\/\* (src\/[^ ]+) \*\//g, (m, src) => {
    i++;
    return '<script>performance.mark("mod:' + src + '")</script>\n' + m;
  }).replace('</body>', '<script>performance.mark("mod:end")</script>\n</body>')
    // boot phases: wrap the calls main.js makes between DOMContentLoaded and the title screen
    .replace('<script>performance.mark("mod:src/main.js")</script>', '<script>(' + (function wrapBoot() {
      const W = (o, k, name) => { if (!o || typeof o[k] !== 'function') return; const f = o[k]; o[k] = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { performance.measure('boot:' + name, { start: t, end: performance.now() }); } }; };
      W(N.render, 'init', 'render.init'); W(N.world, 'build', 'world.build'); W(N.systems, 'init', 'systems.init');
      W(N.player, 'reset', 'player.reset'); W(N.render, 'warmChunks', 'render.warmChunks'); W(N.render, 'snapCamera', 'render.snapCamera');
      if (N.menus) W(N.menus, 'title', 'menus.title');
      if (document.fonts && document.fonts.load) { const fl = document.fonts.load.bind(document.fonts); let first = 0; document.fonts.load = function (f) { if (!first) first = performance.now(); const p = fl(f); p.then(() => performance.measure('boot:fonts.load ' + f, { start: first, end: performance.now() }), () => {}); return p; }; }
    }).toString() + ')()</script>\n<script>performance.mark("mod:src/main.js")</script>');
  writeFileSync(join(dir, 'index.html'), out);
  if (!i) throw new Error('variant b: no module markers found');
}

// ---- c / d: split build
function split(name, opts) {
  const dir = fresh(name);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  const manifest = {};
  const emit = (src, body, ext) => {
    const file = 'assets/' + basename(src).replace(/\.(js|css)$/, '') + '.' + hash(body) + ext;
    writeFileSync(join(dir, file), body);
    manifest[src] = file;
    return file;
  };
  const css = emit('style.css', read('style.css'), '.css');
  for (const s of scripts) emit(s, read(s), '.js');
  let page = html;
  page = page.replace(/<link rel="stylesheet" href="style\.css">/, '<link rel="stylesheet" href="' + css + '">');
  for (const s of scripts) page = page.replace('<script src="' + s + '"></script>', '<script src="' + manifest[s] + '"></script>');
  if (opts.pwa) {
    // fonts: self-hosted subsets, no third-party render-blocking CSS
    mkdirSync(join(dir, 'assets/fonts'), { recursive: true });
    const fontCss = readFileSync(join(FONTS, 'fonts.css'), 'utf8').replace(/url\(([^)]+)\)/g, 'url(assets/fonts/$1)');
    for (const f of readdirSync(FONTS).filter((f) => f.endsWith('.woff2'))) copyFileSync(join(FONTS, f), join(dir, 'assets/fonts', f));
    page = page.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n/, '')
      .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n/, '')
      .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">\n/, '<style>' + fontCss + '</style>\n' +
        ['YatraOne-latin-400', 'VT323-latin-400', 'Kalam-latin-400'].map((f) => '<link rel="preload" href="assets/fonts/' + f + '.woff2" as="font" type="font/woff2" crossorigin' +
          // menus.js injects the Kalam css2 link unless a link[data-mn-font] already exists
          (f.startsWith('Kalam') ? ' data-mn-font' : '') + '>').join('\n') + '\n');
    // share preview + install metadata
    page = page.replace('<title>Nostalgia</title>', '<title>Nostalgia</title>\n' + [
      '<meta name="description" content="Hyderabad, 2003. Be Chinnu, 11, and ride your Hero cycle to Charminar.">',
      '<meta property="og:title" content="Nostalgia — Hyderabad, 2003">',
      '<meta property="og:description" content="A free open-world browser game. Tap to play, no install.">',
      '<meta property="og:image" content="og.jpg">',
      '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
      '<link rel="manifest" href="manifest.webmanifest">',
    ].join('\n'));
    writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ name: 'Nostalgia', short_name: 'Nostalgia', start_url: './', display: 'fullscreen', orientation: 'any', background_color: '#120d16', theme_color: '#120d16', icons: [] }, null, 1));
    // service worker: precache the boot set; hashed files cache-first; page network-first (3 s)
    const pre = ['./', css].concat(scripts.map((s) => manifest[s])).concat(readdirSync(join(dir, 'assets/fonts')).filter((f) => /latin(-\d+)?\.woff2$/.test(f)).map((f) => 'assets/fonts/' + f));
    const ver = hash(pre.join('|'));
    writeFileSync(join(dir, 'sw.js'), `/* generated by tools/perf/variants.mjs */
const V = 'nostalgia-${ver}';
const PRE = ${JSON.stringify(pre)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(PRE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k.startsWith('nostalgia-')).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const cacheFirst = async (req) => { const hit = await caches.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok || res.type === 'opaque') { const c = await caches.open(V); c.put(req, res.clone()); } return res; };
const networkFirst = async (req) => {
  const c = await caches.open(V);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
    if (res.ok) c.put('./', res.clone());
    return res;
  } catch (e) { return (await c.match('./')) || (await c.match(req)) || Response.error(); }
};
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') { e.respondWith(networkFirst(e.request)); return; }
  if ((u.origin === location.origin && /\\/(assets|vendor|src)\\//.test(u.pathname)) || u.host === 'cdn.jsdelivr.net') e.respondWith(cacheFirst(e.request));
});
`);
    page = page.replace('</body>', "<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>\n</body>");
  }
  writeFileSync(join(dir, 'index.html'), page);
  writeFileSync(join(dir, 'asset-manifest.json'), JSON.stringify(manifest, null, 1));
  return dir;
}
split('c', {});
if (FONTS) split('d', { pwa: true });

// ---- e / f: what a lazy split would put on the critical path, measured without touching the source:
// e = the single file WITHOUT the modules a lazy build would load later (activity modules + 3D), so
//     the title / PLAY timings show the cost of the first-play payload alone (those features are
//     simply absent in e: it is a measurement stand-in, not a playable build)
// f = e + self-hosted subset fonts declared inline + preload (no fonts.googleapis.com CSS)
const LAZY = ['src/story2.js', 'src/shops.js', 'src/sidejobs.js', 'src/minigames.js', 'src/cricket_match.js', 'src/playground_games.js',
  'src/view3d.js', 'src/view3d_ground.js', 'src/view3d_landmarks.js', 'src/view3d_actors.js', 'src/models3d.js'];
function firstPlayOnly(name, opts) {
  const dir = fresh(name);
  let out = single;
  for (const src of LAZY) {
    const re = new RegExp('<script>\\/\\* ' + src.replace(/[.]/g, '\\.') + ' \\*\\/\\n[\\s\\S]*?<\\/script>\\n?');
    if (!re.test(out)) throw new Error('variant ' + name + ': module not found ' + src);
    out = out.replace(re, '');
  }
  if (opts.fonts) {
    mkdirSync(join(dir, 'assets/fonts'), { recursive: true });
    const fontCss = readFileSync(join(FONTS, 'fonts.css'), 'utf8').replace(/url\(([^)]+)\)/g, 'url(assets/fonts/$1)');
    for (const f of readdirSync(FONTS).filter((f) => f.endsWith('.woff2'))) copyFileSync(join(FONTS, f), join(dir, 'assets/fonts', f));
    out = out.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n/, '')
      .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n/, '')
      .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">\n/, '<style>' + fontCss + '</style>\n' +
        ['YatraOne-latin-400', 'VT323-latin-400', 'Kalam-latin-400'].map((f) => '<link rel="preload" href="assets/fonts/' + f + '.woff2" as="font" type="font/woff2" crossorigin' + (f.startsWith('Kalam') ? ' data-mn-font' : '') + '>').join('\n') + '\n');
    if (/fonts\.googleapis\.com\/css2\?family=Baloo/.test(out)) throw new Error('variant ' + name + ': google fonts link still present');
  }
  writeFileSync(join(dir, 'index.html'), out);
}
firstPlayOnly('e', {});
if (FONTS) firstPlayOnly('f', { fonts: true });
console.log('variants written to ' + OUT + ': ' + readdirSync(OUT).join(', '));
