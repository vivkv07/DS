#!/usr/bin/env node
/* NOSTALGIA — tools/build.mjs (no dependencies)
 * Inlines style.css and every <script src> of index.html (in order) into:
 *   dist/nostalgia.html — a complete standalone page
 *   dist/artifact.html  — the same content without the <!doctype>/<html>/<head>/<body>
 *                         wrapper: <title>, font links, <style>, body markup, scripts.
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

const full = inlineAll(html);
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
for (const [name, out] of [['nostalgia.html', full], ['artifact.html', fragment]]) {
  const opens = (out.match(/<script>/g) || []).length, closes = (out.match(/<\/script>/gi) || []).length;
  if (opens !== expect || closes !== expect) { console.error('build: ' + name + ' has ' + opens + ' <script> / ' + closes + ' </script>, expected ' + expect); process.exit(1); }
}

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'nostalgia.html'), full);
writeFileSync(join(DIST, 'artifact.html'), fragment);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log('build: ' + (html.match(/<script\s+src=/g) || []).length + ' scripts inlined');
console.log('  dist/nostalgia.html  ' + kb(full));
console.log('  dist/artifact.html   ' + kb(fragment));
