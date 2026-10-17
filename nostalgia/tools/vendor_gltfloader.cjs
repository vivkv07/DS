// Converts three.js 0.149 examples/jsm GLTFLoader (+ BufferGeometryUtils) into a classic
// script that attaches THREE.GLTFLoader, so the game can stay classic-script and file://-safe.
// Usage: node tools/vendor_gltfloader.cjs <path to three package root>
const fs = require('fs');
const path = require('path');
const pkg = process.argv[2];
if (!pkg) { console.error('usage: node tools/vendor_gltfloader.cjs <three package root>'); process.exit(1); }
const read = (p) => fs.readFileSync(path.join(pkg, 'examples/jsm', p), 'utf8');
function strip(src) {
  // import { A, B } from 'three';  ->  const { A, B } = THREE;
  src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'three';/g, (m, names) => 'const {' + names + '} = THREE;');
  src = src.replace(/import\s*\{[^}]*\}\s*from\s*'\.\.\/utils\/BufferGeometryUtils\.js';/g, '');
  src = src.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  src = src.replace(/^export\s+(function|class|const|let)\s/gm, '$1 ');
  return src;
}
const utils = strip(read('utils/BufferGeometryUtils.js'));
const loader = strip(read('loaders/GLTFLoader.js'));
const lic = fs.readFileSync(path.join(pkg, 'LICENSE'), 'utf8');
const out = `/* three.js r149 GLTFLoader + BufferGeometryUtils, converted to a classic script by
 * tools/vendor_gltfloader.cjs. MIT licence (below). Attaches THREE.GLTFLoader. */
/*\n${lic}*/
(function () {
'use strict';
if (!window.THREE) return;
const THREE = window.THREE;
const BufferGeometryUtils = (function () {
${utils}
return { toTrianglesDrawMode };
})();
const toTrianglesDrawMode = BufferGeometryUtils.toTrianglesDrawMode;
${loader}
THREE.GLTFLoader = GLTFLoader;
})();
`;
const dest = path.join(__dirname, '..', 'vendor', 'three', 'GLTFLoader.classic.js');
fs.writeFileSync(dest, out);
console.log('wrote', dest, out.length, 'bytes');
