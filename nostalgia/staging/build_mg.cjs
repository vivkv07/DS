/* Concatenate staging/mg/*.js (00_core ... 99_side) into staging/minigames.js and syntax-check it.
 *   node nostalgia/staging/build_mg.cjs [--install]   (--install also copies to src/minigames.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const DIR = path.join(__dirname, 'mg');
const parts = fs.readdirSync(DIR).filter((f) => /^\d\d_.*\.js$/.test(f)).sort();
let out = '';
for (const f of parts) {
  let s = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (!s.endsWith('\n')) s += '\n';
  out += s;
}
const dst = path.join(__dirname, 'minigames.js');
fs.writeFileSync(dst, out);
execFileSync(process.execPath, ['--check', dst], { stdio: 'inherit' });
console.log('built ' + dst + ' (' + parts.join(', ') + ') ' + out.split('\n').length + ' lines, ' + Math.round(out.length / 1024) + ' KB');
if (process.argv.includes('--install')) {
  const src = path.join(__dirname, '..', 'src', 'minigames.js');
  fs.writeFileSync(src, out);
  console.log('installed -> ' + src);
}
