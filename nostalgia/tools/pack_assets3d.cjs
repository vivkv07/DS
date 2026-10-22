#!/usr/bin/env node
/* NOSTALGIA — tools/pack_assets3d.cjs (pipeline technical artist) — ARCHITECTURE §21
 *
 * assets3d/<id>.glb + assets3d/<id>.json (manifests written by tools/blender/kit.py)
 *   -> src/assets3d_pack.js : N.ASSETS3D = {version, built, bytes, manifest: {id: {...}}, glb: {id: base64}}
 *
 * The pack is a classic script (file://-safe) that src/models3d.js loads lazily the first time 3D
 * starts (dev page + artifact: <script src="src/assets3d_pack.js"> injected on demand; dist/nostalgia.html
 * carries it inline as a non-executing <script type="text/plain" id="assets3d-pack">).
 *
 *   node tools/pack_assets3d.cjs            ship mode (assets3d/ship.json, the allowlist): the lazy ids into
 *                                           dist/lazy3d/<id>.glb and src/assets3d_index.js (N.ASSETS3D_INDEX, see
 *                                           below); the core pack src/assets3d_pack.js is kept as it is (frozen:
 *                                           its ids must equal ship.core) — add --repack-core to rebuild it from
 *                                           assets3d/ too; size report, budgets enforced; nothing is written when
 *                                           a budget fails
 *   node tools/pack_assets3d.cjs --repack hero_cycle   ship mode, rebuilding only these core ids from assets3d/ (the rest
 *                                           of the frozen pack is kept byte for byte); a core id new to ship.json is
 *                                           added to the pack this way too
 *   node tools/pack_assets3d.cjs --check    exit 1 if src/assets3d_index.js is stale or the pack's ids differ
 *                                           from ship.core (with --repack-core: also if the pack is stale)
 *   node tools/pack_assets3d.cjs --lazy-only  ship mode, but only (re)write dist/lazy3d/ (tools/build.mjs)
 *   PACK_ONLY=kid_chinnu,hero_cycle node tools/pack_assets3d.cjs     pack a subset (legacy mode: pack only,
 *                                           no index / lazy files; tests build their own test packs this way)
 *   --no-ship                               legacy mode for every GLB in assets3d/ (no allowlist)
 * Budgets: core pack <= ship.budgets.coreKB (8 MB; fails above), lazy GLBs <= ship.budgets.lazyKB[family]
 * each and <= lazyTotalKB together, per-asset triangles <= the manifest budget (fails above unless
 * --allow-over), textures <= 1024 px (warns).
 *
 * src/assets3d_index.js (always loaded, a few KB): N.ASSETS3D_INDEX = {version, digest, manifest: {id: {family,
 * pack: true, bytes} | {...lean manifest, lazy: true, bytes, h (content hash)}}, lazyDir: 'lazy3d/',
 * from (the script's own URL when it ran from a file)}. Every shipped model is listed; models3d.js registers
 * the lazy landmark overrides from it straight away and fetches lazyDir + id + '.glb?v=' + h on demand.
 * A GLB in assets3d/ that is in neither ship list (blockouts, parked work) does not ship.
 * Quantization (default; --no-quantize to skip), only component types core glTF 2.0 allows, so any
 * loader reads them: WEIGHTS_0 -> normalized UNSIGNED_BYTE (sums kept at 255), TEXCOORD_n in [0, 1]
 * -> normalized UNSIGNED_SHORT, COLOR_0 -> normalized UNSIGNED_BYTE, custom integer attributes
 * (_REGION) -> UNSIGNED_BYTE, animation rotations -> normalized SHORT; NORMAL -> normalized BYTE
 * (stride 4) under KHR_mesh_quantization (three r149 GLTFLoader supports it). POSITION stays float
 * (skinned meshes would need the dequantization baked into their inverse bind matrices).
 * The Blender GLBs in assets3d/ are not modified.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets3d');
const OUT = path.join(ROOT, 'src', 'assets3d_pack.js');
const INDEX_OUT = path.join(ROOT, 'src', 'assets3d_index.js');
const LAZY_DIR = path.join(ROOT, 'dist', 'lazy3d');
const SHIP_FILE = path.join(SRC, 'ship.json');
const args = process.argv.slice(2);
const LAZY_ONLY = args.includes('--lazy-only');
const REPACK_CORE = args.includes('--repack-core');
// --repack <id,id>: take only these core ids from assets3d/ again, every other core entry stays as it is in the pack
// (audit round 2: hero_cycle's pack entry predated its riders / pedal / wheels manifest, so models3d_vehicles could not
// seat anyone on a Hero; a full --repack-core needs every core GLB, and adult_man.glb is not in every checkout)
const REPACK_IDS = args.includes('--repack') ? String(args[args.indexOf('--repack') + 1] || '').split(',').map((x) => x.trim()).filter(Boolean) : null;
const CHECK = args.includes('--check');
const ALLOW_OVER = args.includes('--allow-over');
const QUANT = !args.includes('--no-quantize');
const ONLY = process.env.PACK_ONLY ? new Set(process.env.PACK_ONLY.split(',').map((s) => s.trim()).filter(Boolean)) : null;
// ship mode: the allowlist decides what ships (legacy mode when PACK_ONLY / --no-ship is given or there is no ship.json)
const SHIP = !ONLY && !args.includes('--no-ship') && fs.existsSync(SHIP_FILE) ? JSON.parse(fs.readFileSync(SHIP_FILE, 'utf8')) : null;
const BUDGET = Object.assign({ coreKB: 8192, lazyTotalKB: 40960, lazyKB: {} }, (SHIP && SHIP.budgets) || {});
const MAX_BYTES = BUDGET.coreKB * 1024;

function readGlbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.slice(20, 20 + len).toString('utf8'));
}

/* ---------------------------------------------------------------- GLB quantization */
const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function splitGlb(buf) {
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
  let off = 20 + jl, bin = Buffer.alloc(0);
  if (off < buf.length) { const bl = buf.readUInt32LE(off); bin = buf.slice(off + 8, off + 8 + bl); }
  return { json, bin };
}
function joinGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  const jpad = (4 - (js.length % 4)) % 4; if (jpad) js = Buffer.concat([js, Buffer.alloc(jpad, 0x20)]);
  const bpad = (4 - (bin.length % 4)) % 4; if (bpad) bin = Buffer.concat([bin, Buffer.alloc(bpad)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}
/** read accessor `a` as an array of numbers (component values, row-major, unnormalised) */
function readAccessor(json, bin, a) {
  const [TA, size] = CT[a.componentType], n = NC[a.type], bv = json.bufferViews[a.bufferView];
  const stride = bv.byteStride || size * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float64Array(a.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const rd = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[rd](base + i * stride + k * size, true);
  return out;
}
function quantize(buf) {
  const { json, bin } = splitGlb(buf);
  const acc = json.accessors || [];
  const repl = new Map(); // accessor index -> {data: TypedArray, componentType, normalized, stride}
  let useQuant = false;
  const convert = (idx, kind) => {
    if (idx == null || repl.has(idx)) return;
    const a = acc[idx];
    if (!a || a.sparse || a.bufferView == null) return;
    const n = NC[a.type], v = readAccessor(json, bin, a);
    const norm = (x) => (a.normalized ? x / ((1 << (8 * CT[a.componentType][1])) - 1) : x);
    if (kind === 'weights' && a.componentType === 5126) {
      const d = new Uint8Array(v.length);
      for (let i = 0; i < a.count; i++) {
        let sum = 0, big = 0;
        for (let k = 0; k < n; k++) { const q = Math.round(v[i * n + k] * 255); d[i * n + k] = q; sum += q; if (q > d[i * n + big]) big = k; }
        if (sum > 0) d[i * n + big] = Math.max(0, Math.min(255, d[i * n + big] + 255 - sum));
      }
      repl.set(idx, { data: d, componentType: 5121, normalized: true });
    } else if (kind === 'uv' && a.componentType === 5126) {
      let ok = true; for (let i = 0; i < v.length; i++) if (v[i] < -1e-6 || v[i] > 1 + 1e-6) { ok = false; break; }
      if (!ok) return;
      const d = new Uint16Array(v.length); for (let i = 0; i < v.length; i++) d[i] = Math.round(Math.min(1, Math.max(0, v[i])) * 65535);
      repl.set(idx, { data: d, componentType: 5123, normalized: true });
    } else if (kind === 'color' && (a.componentType === 5126 || a.componentType === 5123)) {
      const d = new Uint8Array(v.length); for (let i = 0; i < v.length; i++) d[i] = Math.round(Math.min(1, Math.max(0, norm(v[i]))) * 255);
      repl.set(idx, { data: d, componentType: 5121, normalized: true });
    } else if (kind === 'int' && a.componentType === 5126) {
      for (let i = 0; i < v.length; i++) if (v[i] !== Math.round(v[i]) || v[i] < 0 || v[i] > 255) return;
      repl.set(idx, { data: Uint8Array.from(v), componentType: 5121, normalized: false });
    } else if (kind === 'normal' && a.componentType === 5126 && n === 3) {
      const d = new Int8Array(a.count * 4);
      for (let i = 0; i < a.count; i++) {
        let x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
        const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
        d[i * 4] = Math.round(x * 127); d[i * 4 + 1] = Math.round(y * 127); d[i * 4 + 2] = Math.round(z * 127);
      }
      repl.set(idx, { data: d, componentType: 5120, normalized: true, stride: 4 });
      useQuant = true;
    } else if (kind === 'rot' && a.componentType === 5126) {
      const d = new Int16Array(v.length); for (let i = 0; i < v.length; i++) d[i] = Math.round(Math.max(-1, Math.min(1, v[i])) * 32767);
      repl.set(idx, { data: d, componentType: 5122, normalized: true });
    }
  };
  for (const m of json.meshes || []) for (const p of m.primitives) {
    for (const [k, idx] of Object.entries(p.attributes)) {
      if (k === 'NORMAL') convert(idx, 'normal');
      else if (/^WEIGHTS_/.test(k)) convert(idx, 'weights');
      else if (/^TEXCOORD_/.test(k)) convert(idx, 'uv');
      else if (/^COLOR_/.test(k)) convert(idx, 'color');
      else if (/^_/.test(k)) convert(idx, 'int');
    }
  }
  for (const an of json.animations || []) for (const ch of an.channels) if (ch.target.path === 'rotation') convert(an.samplers[ch.sampler].output, 'rot');
  if (!repl.size) return buf;
  // rebuild the binary chunk: every bufferView copied (or replaced), 4-byte aligned
  const views = json.bufferViews, parts = [], newViews = [];
  let off = 0;
  const push = (b) => { const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } const o = off; parts.push(b); off += b.length; return o; };
  const viewOf = new Map();
  for (let i = 0; i < views.length; i++) {
    const bv = views[i];
    const used = acc.some((a, ai) => a.bufferView === i && !repl.has(ai)) || (json.images || []).some((im) => im.bufferView === i) || !acc.some((a) => a.bufferView === i);
    if (!used) continue;
    const src = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const nb = Object.assign({}, bv, { byteOffset: push(src) });
    viewOf.set(i, newViews.length); newViews.push(nb);
  }
  for (const a of acc) if (a.bufferView != null && viewOf.has(a.bufferView)) a.bufferView = viewOf.get(a.bufferView);
  for (const im of json.images || []) if (im.bufferView != null) im.bufferView = viewOf.get(im.bufferView);
  for (const [ai, r] of repl) {
    const a = acc[ai], b = Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength);
    const nv = { buffer: 0, byteOffset: push(b), byteLength: b.length };
    if (r.stride) nv.byteStride = r.stride;
    const anim = (json.animations || []).some((an) => an.samplers.some((sm) => sm.output === ai));
    if (!anim) nv.target = 34962;   // vertex attribute data
    a.bufferView = newViews.length; newViews.push(nv);
    a.byteOffset = 0; a.componentType = r.componentType;
    if (r.normalized) a.normalized = true; else delete a.normalized;
    delete a.min; delete a.max;
  }
  json.bufferViews = newViews;
  if (useQuant) {
    const E = 'KHR_mesh_quantization';
    json.extensionsUsed = Array.from(new Set((json.extensionsUsed || []).concat([E])));
    json.extensionsRequired = Array.from(new Set((json.extensionsRequired || []).concat([E])));
  }
  const nbin = Buffer.concat(parts);
  json.buffers = [{ byteLength: nbin.length + ((4 - (nbin.length % 4)) % 4) }];
  return joinGlb(json, nbin);
}
// keep only what the runtime needs from a manifest (the rest stays in assets3d/<id>.json)
const KEEP = ['id', 'family', 'tris', 'kb', 'size', 'min', 'max', 'front', 'anchors', 'clips', 'meta', 'tint', 'materials', 'budget'];

function collect(list) {
  if (!fs.existsSync(SRC)) return [];
  const ids = list ? list.slice().sort() : fs.readdirSync(SRC).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort();
  const out = [];
  for (const id of ids) {
    if (ONLY && !ONLY.has(id)) continue;
    const glbPath = path.join(SRC, id + '.glb');
    const manPath = path.join(SRC, id + '.json');
    if (list && !fs.existsSync(glbPath)) throw new Error('ship.json lists ' + id + ' but assets3d/' + id + '.glb does not exist');
    if (!fs.existsSync(manPath)) { if (list) throw new Error('assets3d/' + id + '.glb has no manifest'); console.warn('pack: ' + id + '.glb has no manifest (skipped)'); continue; }
    const raw = fs.readFileSync(glbPath);
    let glb = raw;
    if (QUANT) { try { glb = quantize(raw); } catch (e) { console.warn('pack: ' + id + ' quantization failed (' + e.message + '), packed as exported'); glb = raw; } }
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    let j = null;
    try { j = readGlbJson(glb); } catch (e) { throw new Error(id + '.glb: ' + e.message); }
    const lean = {};
    for (const k of KEEP) if (man[k] !== undefined) lean[k] = man[k];
    lean.bytes = glb.length;
    lean.rawBytes = raw.length;
    lean.images = (j.images || []).map((im) => im.mimeType);
    lean.animations = (j.animations || []).map((a) => a.name);
    out.push({ id, glb, raw, man: lean, json: j });
  }
  return out;
}

function build(items) {
  const manifest = {};
  const glb = {};
  for (const it of items) { manifest[it.id] = it.man; glb[it.id] = it.glb.toString('base64'); }
  const hash = crypto.createHash('sha1');
  for (const it of items) hash.update(it.id).update(it.glb);
  const digest = hash.digest('hex').slice(0, 12);
  const body = [
    '/* NOSTALGIA — src/assets3d_pack.js — GENERATED by tools/pack_assets3d.cjs from assets3d/*.glb; do not edit.',
    ' * Blender-authored 3D models (tools/blender/*.py, ARCHITECTURE §21), loaded lazily by src/models3d.js',
    ' * only when the 3D view starts. digest ' + digest + ' */',
    '(function () {',
    "  'use strict';",
    '  var N = window.N = window.N || {};',
    '  N.ASSETS3D = {',
    '    version: 1,',
    "    digest: '" + digest + "',",
    '    manifest: ' + JSON.stringify(manifest) + ',',
    '    glb: {',
    Object.keys(glb).map((id) => "      '" + id + "': '" + glb[id] + "'").join(',\n'),
    '    }',
    '  };',
    '})();',
    '',
  ].join('\n');
  return { body, digest };
}

/* ---------------------------------------------------------------- index (ship mode) */
const hashOf = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 10);
function buildIndex(coreMans, lazy) {
  const manifest = {};
  // core entries stay short (the pack carries their full manifest); lazy ones carry what models3d.js needs to
  // register overrides before their GLB is fetched
  for (const id of Object.keys(coreMans).sort()) { const m = coreMans[id]; manifest[id] = { family: m.family, pack: true, bytes: m.bytes }; }
  for (const it of lazy) {
    const m = Object.assign({}, it.man, { lazy: true, h: hashOf(it.glb) });
    for (const k of ['anchors', 'clips', 'animations']) if (m[k] && !Object.keys(m[k]).length) delete m[k];
    manifest[it.id] = m;
  }
  const hash = crypto.createHash('sha1');
  for (const id of Object.keys(manifest).sort()) hash.update(id).update(JSON.stringify(manifest[id]));
  const digest = hash.digest('hex').slice(0, 12);
  const body = [
    '/* NOSTALGIA — src/assets3d_index.js — GENERATED by tools/pack_assets3d.cjs from assets3d/ship.json; do not edit.',
    ' * Every Blender model that ships (ARCHITECTURE §21 "Shipping"): pack: true = inside src/assets3d_pack.js;',
    ' * lazy: true = its own GLB, lazyDir + id + ".glb" (dist/lazy3d/ next to the web page), fetched by src/models3d.js',
    ' * when its landmark / entity comes within build range. Always loaded (small). digest ' + digest + ' */',
    '(function () {',
    "  'use strict';",
    '  var N = window.N = window.N || {};',
    '  var cs = document.currentScript;',
    '  N.ASSETS3D_INDEX = {',
    '    version: 1,',
    "    digest: '" + digest + "',",
    "    lazyDir: 'lazy3d/',",
    '    from: (cs && cs.src) || null,',
    '    manifest: {',
    Object.keys(manifest).map((id) => "      '" + id + "': " + JSON.stringify(manifest[id])).join(',\n'),
    '    }',
    '  };',
    '})();',
    '',
  ].join('\n');
  return { body, digest };
}
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
/** dist/lazy3d/<id>.glb for every lazy id (stale files of ids no longer listed are removed) */
function writeLazy(lazy) {
  fs.mkdirSync(LAZY_DIR, { recursive: true });
  const keep = new Set(lazy.map((it) => it.id + '.glb'));
  for (const f of fs.readdirSync(LAZY_DIR)) if (f.endsWith('.glb') && !keep.has(f)) fs.unlinkSync(path.join(LAZY_DIR, f));
  let n = 0;
  for (const it of lazy) {
    const f = path.join(LAZY_DIR, it.id + '.glb');
    if (fs.existsSync(f) && fs.readFileSync(f).equals(it.glb)) continue;
    writeAtomic(f, it.glb); n++;
  }
  return n;
}

const kb = (n) => (n / 1024).toFixed(1);
function report(items, title) {
  let fail = false;
  console.log('pack: ' + items.length + ' ' + title);
  console.log('  ' + 'id'.padEnd(26) + 'family'.padEnd(15) + 'tris'.padStart(8) + 'budget'.padStart(8) + 'raw KB'.padStart(9) + 'GLB KB'.padStart(9) + 'b64 KB'.padStart(9) + '  clips / images');
  for (const it of items) {
    const m = it.man;
    const b64 = Math.ceil(it.glb.length / 3) * 4;
    const over = m.budget && m.tris > m.budget;
    if (over && !ALLOW_OVER) fail = true;
    const clips = Object.keys(m.clips || {}).join(',') || '-';
    console.log('  ' + it.id.padEnd(26) + String(m.family).padEnd(15) + String(m.tris).padStart(8) + String(m.budget || '-').padStart(8) + kb(it.raw.length).padStart(9) + kb(it.glb.length).padStart(9) + kb(b64).padStart(9) + '  ' + clips + ' / ' + (m.images || []).join(',') + (over ? '  OVER TRIANGLE BUDGET' : ''));
    for (const im of it.json.images || []) {
      if (im.mimeType && im.mimeType !== 'image/webp') console.log('    note: ' + it.id + ' image ' + (im.name || '?') + ' is ' + im.mimeType + ' (WebP preferred)');
    }
  }
  return fail;
}

function main() {
  if (!SHIP) return mainLegacy();
  const coreIds = SHIP.core || [], lazyIds = SHIP.lazy || [];
  const dup = coreIds.filter((id) => lazyIds.includes(id));
  if (dup.length) { console.error('pack: ship.json lists ids as both core and lazy: ' + dup.join(', ')); process.exit(1); }
  const lazy = collect(lazyIds);
  if (LAZY_ONLY) {
    const n = writeLazy(lazy);
    console.log('pack: dist/lazy3d/ ' + lazy.length + ' lazy GLB(s), ' + n + ' rewritten, ' + kb(lazy.reduce((a, it) => a + it.glb.length, 0)) + ' KB');
    return;
  }
  // the core: rebuilt from assets3d/ (--repack-core) or the pack as it is (frozen)
  let core = null, pack = null, coreMans = null;
  if (REPACK_CORE) {
    core = collect(coreIds); pack = build(core);
    coreMans = {}; for (const it of core) coreMans[it.id] = it.man;
  } else {
    const cur = readPack();
    if (!cur) { console.error('pack: ' + path.relative(ROOT, OUT) + ' is missing or unreadable (run with --repack-core)'); process.exit(1); }
    const have = Object.keys(cur.glb).sort(), want = coreIds.slice().sort();
    // (a core id new to ship.json joins the frozen pack when --repack names it)
    const adding = want.filter((i) => !have.includes(i) && REPACK_IDS && REPACK_IDS.includes(i));
    if (have.concat(adding).sort().join() !== want.join()) {
      console.error('pack: the core pack ids differ from ship.json core (pack only: ' + have.filter((i) => !want.includes(i)).join(', ') + '; ship only: ' + want.filter((i) => !have.includes(i)).join(', ') + '); run with --repack-core');
      process.exit(1);
    }
    coreMans = cur.manifest;
    if (REPACK_IDS && REPACK_IDS.length) {
      const bad = REPACK_IDS.filter((id) => !coreIds.includes(id));
      if (bad.length) { console.error('pack: --repack ids not in ship.json core: ' + bad.join(', ')); process.exit(1); }
      const fresh = new Map(collect(REPACK_IDS).map((it) => [it.id, it]));
      core = coreIds.slice().sort().map((id) => fresh.get(id) || (() => {
        const glb = Buffer.from(cur.glb[id], 'base64');
        return { id, glb, raw: { length: cur.manifest[id].rawBytes || glb.length }, man: cur.manifest[id], json: readGlbJson(glb) };
      })());
      pack = build(core);
      coreMans = {}; for (const it of core) coreMans[it.id] = it.man;
      console.log('pack: repacking ' + REPACK_IDS.join(', ') + ' from assets3d/ (the other ' + (coreIds.length - REPACK_IDS.length) + ' core entries as they are)');
    }
  }
  const index = buildIndex(coreMans, lazy);
  if (CHECK) {
    let stale = false;
    if (REPACK_CORE) {
      const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
      const m = cur.match(/digest ([0-9a-f]{12})/);
      if (!m || m[1] !== pack.digest) { console.error('pack: src/assets3d_pack.js is stale (run node tools/pack_assets3d.cjs --repack-core)'); stale = true; }
    }
    const ci = fs.existsSync(INDEX_OUT) ? fs.readFileSync(INDEX_OUT, 'utf8') : '';
    const mi = ci.match(/digest ([0-9a-f]{12})/);
    if (!mi || mi[1] !== index.digest) { console.error('pack: src/assets3d_index.js is stale (run node tools/pack_assets3d.cjs)'); stale = true; }
    if (stale) process.exit(1);
    console.log('pack: up to date (index ' + index.digest + (REPACK_CORE ? ', pack ' + pack.digest : ', core pack frozen: ' + coreIds.length + ' ids as listed') + ')');
    return;
  }
  let fail = false;
  if (core) {
    fail = report(core, 'core asset(s) -> ' + path.relative(ROOT, OUT));
    const bytes = Buffer.byteLength(pack.body);
    console.log('  core pack ' + kb(bytes) + ' KB of ' + kb(MAX_BYTES) + ' KB budget');
    if (bytes > MAX_BYTES) { console.error('pack: core pack OVER its ' + kb(MAX_BYTES) + ' KB budget'); fail = true; }
  } else {
    const bytes = fs.statSync(OUT).size;
    console.log('pack: core pack kept as it is (' + coreIds.length + ' ids = ship.json core): ' + kb(bytes) + ' KB of ' + kb(MAX_BYTES) + ' KB budget');
    if (bytes > MAX_BYTES) { console.error('pack: core pack OVER its ' + kb(MAX_BYTES) + ' KB budget'); fail = true; }
    const drift = coreIds.filter((id) => { const f = path.join(SRC, id + '.glb'); return !fs.existsSync(f) || (coreMans[id] && coreMans[id].rawBytes !== fs.statSync(f).size); });
    if (drift.length) console.log('  note: ' + drift.length + ' core id(s) differ from (or are missing in) assets3d/ since the pack was built: ' + drift.join(', ') + ' (--repack-core takes the current files)');
  }
  console.log('');
  if (report(lazy, 'lazy asset(s) -> ' + path.relative(ROOT, LAZY_DIR) + '/<id>.glb')) fail = true;
  let lazyBytes = 0;
  for (const it of lazy) {
    lazyBytes += it.glb.length;
    const cap = (BUDGET.lazyKB || {})[it.man.family];
    if (cap && it.glb.length > cap * 1024) { console.error('pack: lazy ' + it.id + ' is ' + kb(it.glb.length) + ' KB, over the ' + cap + ' KB ' + it.man.family + ' budget'); fail = true; }
  }
  console.log('  lazy total ' + kb(lazyBytes) + ' KB of ' + BUDGET.lazyTotalKB + ' KB budget');
  if (lazyBytes > BUDGET.lazyTotalKB * 1024) { console.error('pack: lazy models OVER their total budget'); fail = true; }
  const ib = Buffer.byteLength(index.body);
  console.log('  index ' + kb(ib) + ' KB (' + Object.keys(coreMans).length + ' core + ' + lazy.length + ' lazy) -> ' + path.relative(ROOT, INDEX_OUT));
  const unlisted = fs.readdirSync(SRC).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).filter((id) => !coreIds.includes(id) && !lazyIds.includes(id));
  if (unlisted.length) console.log('  not shipped (in neither list): ' + unlisted.join(' '));
  if (fail) { console.error('pack: budget check failed (nothing written)'); process.exit(1); }
  // write-then-rename: pages and tests running in parallel never read a half-written pack
  if (pack) writeAtomic(OUT, pack.body);
  writeAtomic(INDEX_OUT, index.body);
  const n = writeLazy(lazy);
  console.log('pack: wrote ' + (pack ? path.relative(ROOT, OUT) + ' (digest ' + pack.digest + '), ' : '') + path.relative(ROOT, INDEX_OUT) + ' (digest ' + index.digest + '), ' + n + ' lazy GLB(s) rewritten in ' + path.relative(ROOT, LAZY_DIR) + '/');
}
/** the current pack's {manifest, glb} (evaluated in a sandbox) or null */
function readPack() {
  if (!fs.existsSync(OUT)) return null;
  try {
    const sb = { window: {} };
    require('vm').runInNewContext(fs.readFileSync(OUT, 'utf8'), sb, { filename: OUT });
    const A = sb.window.N && sb.window.N.ASSETS3D;
    return A && A.manifest && A.glb ? A : null;
  } catch (e) { return null; }
}

function mainLegacy() {
  const items = collect();
  const { body, digest } = build(items);
  if (CHECK) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    const m = cur.match(/digest ([0-9a-f]{12})/);
    if (!m || m[1] !== digest) { console.error('pack: src/assets3d_pack.js is stale (run node tools/pack_assets3d.cjs)'); process.exit(1); }
    console.log('pack: up to date (' + digest + ')');
    return;
  }
  let fail = report(items, 'asset(s)');
  const bytes = Buffer.byteLength(body);
  console.log('  total ' + kb(bytes) + ' KB of ' + kb(MAX_BYTES) + ' KB budget -> ' + path.relative(ROOT, OUT));
  if (bytes > MAX_BYTES) { console.error('pack: OVER the 8 MB pack budget'); fail = true; }
  if (fail) { console.error('pack: budget check failed (nothing written)'); process.exit(1); }
  // write-then-rename: pages and tests running in parallel never read a half-written pack
  const tmp = OUT + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, OUT);
  console.log('pack: wrote ' + path.relative(ROOT, OUT) + ' (digest ' + digest + ')');
}
main();
