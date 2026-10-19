#!/usr/bin/env node
/* NOSTALGIA — tools/build.mjs (no dependencies)
 * Inlines style.css and every <script src> of index.html (in order) into:
 *   dist/nostalgia.html — a complete standalone page
 *   dist/artifact.html  — the same content without the <!doctype>/<html>/<head>/<body>
 *                         wrapper: <title>, font links, <style>, body markup, scripts.
 *   dist/web.html       — the complete page for the website (GitHub Pages, tools/deploy_site.sh):
 *                         like nostalgia.html but loading the 3D files lazily, like the artifact.
 * Blender models (ARCHITECTURE §21): src/assets3d_pack.js and vendor/three/GLTFLoader.classic.js are
 * NOT executed at boot. dist/nostalgia.html carries them inline as non-executing
 * <script type="text/plain" id="assets3d-pack"> / id="gltfloader-src"> blocks that src/models3d.js
 * runs on demand when 3D starts; dist/artifact.html keeps them lazy (supporting files, listed in
 * dist/artifact.files.json as {published path: source path}).
 * Lazy per-GLB models (ARCHITECTURE §21 "Shipping"): src/assets3d_index.js is an ordinary index.html script, so all
 * three pages inline it; the lazy GLBs are (re)written to dist/lazy3d/<id>.glb here (tools/pack_assets3d.cjs
 * --lazy-only), which dist/web.html fetches next to itself (tools/deploy_site.sh copies the folder next to
 * index.html) and dist/artifact.files.json publishes as lazy3d/<id>.glb. dist/nostalgia.html carries only the core
 * pack: opened from file:// its lazy landmarks stay procedural.
 * Online play (src/online.js): the pages carry src/online_config.js + src/online.js like any script; the SDK
 * loads lazily (jsDelivr, then vendor/supabase/supabase.js). From file:// (dist/nostalgia.html) online stays off.
 * Usage: node nostalgia/tools/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const web = full;
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
for (const [name, out, extra] of [['nostalgia.html', full, lazyBlocks.length], ['artifact.html', fragment, 0], ['web.html', web, 0]]) {
  // count the openers build.mjs writes ('<script>/* <file> */'), not a literal "<script>" inside a source comment
  const opens = (out.match(/<script>\/\* /g) || []).length, closes = (out.match(/<\/script>/gi) || []).length;
  const lazyOpen = (out.match(/<script type="text\/plain" id="/g) || []).length;
  if (opens !== expect || closes !== expect + extra || lazyOpen !== extra) { console.error('build: ' + name + ' has ' + opens + ' <script> / ' + lazyOpen + ' lazy / ' + closes + ' </script>, expected ' + expect + ' + ' + extra); process.exit(1); }
}

mkdirSync(DIST, { recursive: true });
// the lazy GLBs (quantised like the pack) next to the pages that fetch them
if (existsSync(join(ROOT, 'assets3d', 'ship.json'))) {
  try { process.stdout.write(execFileSync(process.execPath, [join(ROOT, 'tools', 'pack_assets3d.cjs'), '--lazy-only'], { encoding: 'utf8' })); }
  catch (e) { console.error('build: writing dist/lazy3d failed:\n' + String(e.stdout || '') + String(e.stderr || e.message)); process.exit(1); }
}
writeFileSync(join(DIST, 'nostalgia.html'), full);
writeFileSync(join(DIST, 'artifact.html'), fragment);
writeFileSync(join(DIST, 'web.html'), web);
// supporting files the artifact loads lazily (published next to the page at the same paths)
const artifactFiles = {};
for (const f of ['src/assets3d_pack.js', 'vendor/three/GLTFLoader.classic.js', 'vendor/three/three.min.js', 'vendor/supabase/supabase.js']) if (existsSync(join(ROOT, f))) artifactFiles[f] = 'nostalgia/' + f;
const LAZY3D = join(DIST, 'lazy3d');
const lazyGlbs = existsSync(LAZY3D) ? readdirSync(LAZY3D).filter((f) => f.endsWith('.glb')).sort() : [];
for (const f of lazyGlbs) artifactFiles['lazy3d/' + f] = 'nostalgia/dist/lazy3d/' + f;
writeFileSync(join(DIST, 'artifact.files.json'), JSON.stringify(artifactFiles, null, 1) + '\n');

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log('build: ' + (html.match(/<script\s+src=/g) || []).length + ' scripts inlined');
console.log('  dist/nostalgia.html  ' + kb(full));
console.log('  dist/artifact.html   ' + kb(fragment));
console.log('  dist/web.html        ' + kb(web));
if (lazyBlocks.length) console.log('  lazy inline blocks: ' + LAZY.filter(([, f]) => existsSync(join(ROOT, f))).map(([id, f]) => id + ' (' + kb(read(f)) + ')').join(', '));
console.log('  artifact supporting files (dist/artifact.files.json): ' + Object.keys(artifactFiles).filter((f) => !/^lazy3d\//.test(f)).join(', ') + (lazyGlbs.length ? ' + ' + lazyGlbs.length + ' lazy3d/*.glb' : ''));
