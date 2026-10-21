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
 * Website page only (dist/web.html, design/audit/performance.md):
 *  - comments and indentation are stripped from the inlined scripts (stripJs: a JS tokenizer that keeps strings,
 *    template literals, regex literals and every line break; each result is syntax-checked with node:vm and the
 *    original kept if it fails; tests/qa_perf.cjs cross-checks the token streams with TypeScript's scanner):
 *    ~18 % fewer bytes over the wire and less to parse. nostalgia.html / artifact.html keep the readable source.
 *  - N.BUILD = {pack, loader, three, supabase}: content hashes of the files the page loads lazily by relative URL;
 *    models3d.js / view3d.js append ?v=<hash> over http(s), so a redeploy never pairs a new page with a stale cached
 *    pack (GitHub Pages caches every file for 10 minutes). Deterministic: two builds are byte-identical.
 * Usage: node nostalgia/tools/build.mjs [--no-strip]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
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

/* ---- stripJs: drop comments + indentation, keep every token byte-for-byte and every line break.
 * States: code, '..' / ".." strings, `..${..}..` templates (nested), /regex/ (with [classes]), comments.
 * A '/' starts a regex unless the previous significant token ends an expression (identifier / number /
 * string / template / ')' / ']' / '}' — and not one of the keywords after which an expression starts). */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
export function stripJs(src) {
  const out = [];
  const n = src.length, tmpl = []; // brace depth saved for each open ${ } of a template
  let i = 0, line = '', last = '', depth = 0, lineStart = true;
  const isId = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$' || c > '\x7f';
  const space = () => { if (line.length && line[line.length - 1] !== ' ') line += ' '; };
  const flush = () => { const t = line.replace(/[ \t\r]+$/, ''); if (t.length) out.push(t); line = ''; lineStart = true; };
  // last significant token: 'v' value (identifier, number, string, template, regex, ')' / ']' / '}'), 'k' a keyword
  // after which an expression starts, 'p' an operator / punctuation; a '/' after 'v' divides, else starts a regex
  const readTemplate = () => { // inside a template literal: copy verbatim up to the closing ` or the next ${
    while (i < n) {
      const c = src[i];
      if (c === '\\') { line += c + src[i + 1]; i += 2; continue; }
      if (c === '`') { line += c; i++; last = 'v'; return; }
      if (c === '$' && src[i + 1] === '{') { line += '${'; i += 2; tmpl.push(depth); depth = 0; last = 'p'; return; }
      if (c === '\n') { out.push(line); line = ''; i++; continue; } // template text keeps its whitespace and blank lines
      line += c; i++;
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { flush(); i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { if (!lineStart) space(); i++; continue; }
    lineStart = false;
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2), end = e < 0 ? n : e + 2;
      const nl = src.indexOf('\n', i) >= 0 && src.indexOf('\n', i) < end;
      i = end;
      if (nl) flush(); else space(); // a comment is whitespace (a line break if it spanned one: ASI)
      continue;
    }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      line += src.slice(i, j + 1); i = j + 1; last = 'v'; continue;
    }
    if (c === '`') { line += c; i++; readTemplate(); continue; }
    if (c === '}' && tmpl.length && depth === 0) { depth = tmpl.pop(); line += c; i++; readTemplate(); continue; }
    if (c === '{' || c === '(' || c === '[') { if (c === '{') depth++; line += c; i++; last = 'p'; continue; }
    if (c === '}' || c === ')' || c === ']') { if (c === '}') depth--; line += c; i++; last = 'v'; continue; }
    if (c === '/' && last !== 'v') {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (cls) { if (d === ']') cls = false; } else if (d === '[') cls = true; else if (d === '/') break;
        j++;
      }
      if (src[j] === '/') {
        j++;
        while (j < n && isId(src[j])) j++; // flags
        line += src.slice(i, j); i = j; last = 'v'; continue;
      }
      // no closing '/' on the line: an operator after all
    }
    if (isId(c)) {
      let j = i; while (j < n && isId(src[j])) j++;
      if (c >= '0' && c <= '9') while (j < n && (src[j] === '.' || isId(src[j]) || ((src[j] === '+' || src[j] === '-') && /[eE]/.test(src[j - 1])))) j++; // 1.5e-3
      const w = src.slice(i, j);
      line += w; i = j;
      last = REGEX_AFTER_WORD.has(w) && src[i - w.length - 1] !== '.' ? 'k' : 'v';
      continue;
    }
    if ((c === '+' || c === '-') && src[i + 1] === c) { line += c + c; i += 2; if (last !== 'v') last = 'p'; continue; } // x++ / 2: still a value
    if (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9' && last !== 'v') { // .5
      let j = i + 1; while (j < n && (isId(src[j]) || src[j] === '.')) j++;
      line += src.slice(i, j); i = j; last = 'v'; continue;
    }
    line += c; i++; last = 'p';
  }
  flush();
  return out.join('\n');
}
/** strip one inlined script; keep the original if the result does not compile (never ship a broken page) */
const stripped = { n: 0, kept: [], before: 0, after: 0 };
const NO_STRIP = process.argv.includes('--no-strip'); // (before / after comparisons: tools/perf, the audit)
function stripSafe(src, name) {
  if (NO_STRIP) return src;
  let s;
  try { s = stripJs(src); new vm.Script(s, { filename: name }); }
  catch (e) { stripped.kept.push(name + ': ' + String(e.message).slice(0, 80)); return src; }
  stripped.n++; stripped.before += src.length; stripped.after += s.length;
  return s;
}
const hashOf = (f) => (existsSync(join(ROOT, f)) ? createHash('sha1').update(readFileSync(join(ROOT, f))).digest('hex').slice(0, 10) : null);

let full = inlineAll(html);
// the website page: stripped scripts + the lazy files' content hashes (cache-busting on redeploy)
const BUILD = { pack: hashOf('src/assets3d_pack.js'), loader: hashOf('vendor/three/GLTFLoader.classic.js'), three: hashOf('vendor/three/three.min.js'), supabase: hashOf('vendor/supabase/supabase.js') };
const web = full
  .replace(/(<script>\/\* ([^*\n]+) \*\/\n)([\s\S]*?)(\n<\/script>)/g, (m, open, name, body, close) => open + safeJs(stripSafe(body, name)) + close)
  .replace(/<script>\/\* /, () => '<script>window.N = window.N || {}; window.N.BUILD = ' + JSON.stringify(BUILD) + ';</script>\n<script>/* ');
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
for (const [name, out, extra, own] of [['nostalgia.html', full, lazyBlocks.length, 0], ['artifact.html', fragment, 0, 0], ['web.html', web, 0, 1]]) {
  // count the openers build.mjs writes ('<script>/* <file> */'), not a literal "<script>" inside a source comment
  // (web.html: + its own N.BUILD block)
  const opens = (out.match(/<script>\/\* /g) || []).length, closes = (out.match(/<\/script>/gi) || []).length;
  const lazyOpen = (out.match(/<script type="text\/plain" id="/g) || []).length;
  if (opens !== expect || closes !== expect + extra + own || lazyOpen !== extra) { console.error('build: ' + name + ' has ' + opens + ' <script> / ' + lazyOpen + ' lazy / ' + closes + ' </script>, expected ' + expect + ' + ' + extra); process.exit(1); }
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
console.log('  dist/web.html        ' + kb(web) + ' (' + (NO_STRIP ? 'scripts not stripped (--no-strip)' : stripped.n + ' scripts stripped, ' + Math.round(100 - stripped.after / Math.max(1, stripped.before) * 100) + ' % less JS') + (stripped.kept.length ? '; kept as is: ' + stripped.kept.join(', ') : '') + '; N.BUILD ' + JSON.stringify(BUILD) + ')');
if (lazyBlocks.length) console.log('  lazy inline blocks: ' + LAZY.filter(([, f]) => existsSync(join(ROOT, f))).map(([id, f]) => id + ' (' + kb(read(f)) + ')').join(', '));
console.log('  artifact supporting files (dist/artifact.files.json): ' + Object.keys(artifactFiles).filter((f) => !/^lazy3d\//.test(f)).join(', ') + (lazyGlbs.length ? ' + ' + lazyGlbs.length + ' lazy3d/*.glb' : ''));
