#!/usr/bin/env node
/* NOSTALGIA — tools/build.mjs (no dependencies)
 * Inlines style.css and every <script src> of index.html (in order) into:
 *   dist/nostalgia.html — a complete standalone page
 *   dist/artifact.html  — the same content without the <!doctype>/<html>/<head>/<body>
 *                         wrapper: <title>, font links, <style>, body markup, scripts.
 * Blender models (ARCHITECTURE §21): src/assets3d_pack.js and vendor/three/GLTFLoader.classic.js are
 * NOT executed at boot. dist/nostalgia.html carries them inline as non-executing
 * <script type="text/plain" id="assets3d-pack"> / id="gltfloader-src"> blocks that src/models3d.js
 * runs on demand when 3D starts; dist/artifact.html keeps them lazy (supporting files, listed in
 * dist/artifact.files.json as {published path: source path}).
 * Usage: node nostalgia/tools/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Make inline <script>/<style> content safe: a literal "</script" (or "</style") would end
// the element early and "<!--" can switch the HTML tokenizer into an escaped state.
// "<\/" and "<\!--" mean the same thing inside JS strings, regexes, templates and comments.
const safeJs = (src) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const safeCss = (src) => src.replace(/<\/(style)/gi, '<\\/$1');

const html = read('index.html');
const missing = [];

const inlineAll = (fragment) => fragment
  .replace(/<link\s+rel="stylesheet"\s+href="(?!https?:)([^"]+)"\s*\/?>/g, (m, href) => {
    if (!existsSync(join(ROOT, href))) { missing.push(href); return m; }
    return '<style>\n' + safeCss(read(href)) + '\n</style>';
  })
  .replace(/<script\s+src="(?!https?:)([^"]+)"\s*><\/script>/g, (m, src) => {
    if (!existsSync(join(ROOT, src))) { missing.push(src); return m; }
    return '<script>/* ' + src + ' */\n' + safeJs(read(src)) + '\n</script>';
  });

let full = inlineAll(html);
// lazily-run blocks for the single-file page (models3d.js executes their text when 3D starts)
const LAZY = [['gltfloader-src', 'vendor/three/GLTFLoader.classic.js'], ['assets3d-pack', 'src/assets3d_pack.js']];
const lazyBlocks = LAZY.filter(([, f]) => existsSync(join(ROOT, f)))
  .map(([id, f]) => '<script type="text/plain" id="' + id + '">/* ' + f + ' */\n' + safeJs(read(f)) + '\n</script>');
if (lazyBlocks.length) full = full.replace(/<\/body>/i, lazyBlocks.join('\n') + '\n</body>');
if (missing.length) {
  console.error('build: missing files referenced by index.html:\n  ' + missing.join('\n  '));
  process.exit(1);
}

// Fragment for the artifact host: title, font links, style, body markup, scripts
const pick = (re) => { const m = html.match(re); return m ? m[0] : ''; };
const title = pick(/<title>[\s\S]*?<\/title>/i);
const fontLinks = (html.match(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/gi) || []).join('\n');
const localStyles = (html.match(/<link\s+rel="stylesheet"\s+href="(?!https?:)[^"]+"\s*\/?>/g) || []).join('\n');
const bodyInner = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, ''])[1].trim();
const fragment = [title, fontLinks, inlineAll(localStyles), inlineAll(bodyInner)].filter(Boolean).join('\n') + '\n';

// Sanity: every inlined script must still close exactly once (no early "</script>")
const expect = (html.match(/<script\s+src=/g) || []).length;
for (const [name, out, extra] of [['nostalgia.html', full, lazyBlocks.length], ['artifact.html', fragment, 0]]) {
  const opens = (out.match(/<script>/g) || []).length, closes = (out.match(/<\/script>/gi) || []).length;
  const lazyOpen = (out.match(/<script type="text\/plain" id="/g) || []).length;
  if (opens !== expect || closes !== expect + extra || lazyOpen !== extra) { console.error('build: ' + name + ' has ' + opens + ' <script> / ' + lazyOpen + ' lazy / ' + closes + ' </script>, expected ' + expect + ' + ' + extra); process.exit(1); }
}

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'nostalgia.html'), full);
writeFileSync(join(DIST, 'artifact.html'), fragment);
// supporting files the artifact loads lazily (published next to the page at the same paths)
const artifactFiles = {};
for (const f of ['src/assets3d_pack.js', 'vendor/three/GLTFLoader.classic.js', 'vendor/three/three.min.js']) if (existsSync(join(ROOT, f))) artifactFiles[f] = 'nostalgia/' + f;
writeFileSync(join(DIST, 'artifact.files.json'), JSON.stringify(artifactFiles, null, 1) + '\n');

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log('build: ' + (html.match(/<script\s+src=/g) || []).length + ' scripts inlined');
console.log('  dist/nostalgia.html  ' + kb(full));
console.log('  dist/artifact.html   ' + kb(fragment));
if (lazyBlocks.length) console.log('  lazy inline blocks: ' + LAZY.filter(([, f]) => existsSync(join(ROOT, f))).map(([id, f]) => id + ' (' + kb(read(f)) + ')').join(', '));
console.log('  artifact supporting files (dist/artifact.files.json): ' + Object.keys(artifactFiles).join(', '));
