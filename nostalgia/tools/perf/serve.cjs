/* NOSTALGIA — tools/perf/serve.cjs (no dependencies)
 * A local HTTPS + HTTP/2 static server that stands in for the real hosting setup, so Chromium's
 * DevTools network throttling applies to EVERY request (Playwright route() fulfilments bypass the
 * network stack and are not throttled). Chromium maps the real hostnames onto it with
 *   --host-resolver-rules="MAP nostalgia.test 127.0.0.1:PORT, MAP *.nostalgia.test ..., MAP cdn.jsdelivr.net ...,
 *                          MAP fonts.googleapis.com ..., MAP fonts.gstatic.com ..." --ignore-certificate-errors-spki-list=<pin>
 * Virtual hosts:
 *   <site>.nostalgia.test   a build folder (sites[<site>] = {root, cache(path) -> Cache-Control})
 *   cdn.jsdelivr.net        /npm/three@0.149.0/build/three.min.js -> vendor/three/three.min.js
 *   fonts.googleapis.com    /css2 -> <fontsDir>/fonts.css (a real Android-Chrome css2 response), or
 *                           <fontsDir>/<family>.css for a one-family request (menus.js loads Kalam)
 *   fonts.gstatic.com       /s/... -> <fontsDir>/*.woff2 via <fontsDir>/list.json
 * Text responses are negotiated br > gzip (precompressed once, brotli q11 / gzip 9, cached on disk),
 * with strong ETags and 304s, like a CDN with precompression.
 *
 *   const { startServer } = require('./serve.cjs');
 *   const srv = await startServer({ sites: { a: { root: 'dist' } }, fontsDir, tmp });
 *   CLI: node nostalgia/tools/perf/serve.cjs <root> [port]   (serves https://a.nostalgia.test -> <root>)
 */
'use strict';
const http2 = require('http2');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg|model\/gltf-binary)/;

function ensureCert(tmp) {
  const dir = path.join(tmp, 'perf-cert');
  const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '30',
      '-subj', '/CN=nostalgia.test', '-addext', 'subjectAltName=DNS:nostalgia.test,DNS:*.nostalgia.test,DNS:cdn.jsdelivr.net,DNS:fonts.googleapis.com,DNS:fonts.gstatic.com'], { stdio: 'ignore' });
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

function startServer(opts) {
  opts = opts || {};
  const tmp = opts.tmp || os.tmpdir();
  const zdir = path.join(tmp, 'perf-zcache');
  fs.mkdirSync(zdir, { recursive: true });
  const sites = opts.sites || {};
  const fontsDir = opts.fontsDir;
  const fontMap = {};
  if (fontsDir && fs.existsSync(path.join(fontsDir, 'list.json'))) {
    for (const f of JSON.parse(fs.readFileSync(path.join(fontsDir, 'list.json'), 'utf8'))) {
      const name = f.fam.replace(/ /g, '_') + '_' + f.w + '_' + f.subset + '.woff2';
      const file = path.join(fontsDir, name);
      // variable fonts: several weights share one URL; the mirror stores it once (first weight)
      if (!fontMap[new URL(f.url).pathname] && fs.existsSync(file)) fontMap[new URL(f.url).pathname] = file;
    }
  }
  const threeFile = opts.threeFile || path.join(ROOT, 'vendor/three/three.min.js');
  const log = [];
  const mem = new Map(); // file -> {mtime, buf, etag, br, gz}

  function load(file) {
    const st = fs.statSync(file);
    let e = mem.get(file);
    if (e && e.mtime === st.mtimeMs && e.size === st.size) return e;
    const buf = fs.readFileSync(file);
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    e = { mtime: st.mtimeMs, size: st.size, buf, etag: '"' + hash.slice(0, 20) + '"', hash, type: TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' };
    mem.set(file, e);
    return e;
  }
  function encoded(e, enc) {
    const k = enc === 'br' ? 'br' : 'gz';
    if (e[k]) return e[k];
    const p = path.join(zdir, e.hash + '.' + k);
    if (fs.existsSync(p)) e[k] = fs.readFileSync(p);
    else {
      e[k] = enc === 'br'
        ? zlib.brotliCompressSync(e.buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: e.buf.length } })
        : zlib.gzipSync(e.buf, { level: 9 });
      fs.writeFileSync(p, e[k]);
    }
    return e[k];
  }
  /** precompress a whole folder up front (so the first measured request is not slowed by q11) */
  function warm(dir) {
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else { const e = load(p); if (COMPRESSIBLE.test(e.type)) { encoded(e, 'br'); encoded(e, 'gz'); } } } };
    walk(dir);
  }

  function send(req, res, file, cache, extraHeaders) {
    let e;
    try { e = load(file); } catch (err) { return notFound(req, res); }
    const ae = String(req.headers['accept-encoding'] || '');
    const enc = COMPRESSIBLE.test(e.type) ? (/\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : null) : null;
    const h = Object.assign({ 'content-type': e.type, etag: e.etag, 'cache-control': cache || 'no-cache', vary: 'Accept-Encoding', 'access-control-allow-origin': '*' }, extraHeaders || {});
    if (req.headers['if-none-match'] === e.etag) {
      res.writeHead(304, h); res.end();
      log.push({ host: req.headers.host || req.headers[':authority'], path: req.url, status: 304, bytes: 0 });
      return;
    }
    const body = enc ? encoded(e, enc) : e.buf;
    if (enc) h['content-encoding'] = enc;
    h['content-length'] = body.length;
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : body);
    log.push({ host: req.headers.host || req.headers[':authority'], path: req.url, status: 200, enc, bytes: body.length, raw: e.buf.length });
  }
  function notFound(req, res) {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
    log.push({ host: req.headers.host || req.headers[':authority'], path: req.url, status: 404, bytes: 9 });
  }

  const handler = (req, res) => {
    const host = String(req.headers[':authority'] || req.headers.host || '').replace(/:\d+$/, '');
    const url = new URL(req.url, 'https://' + host);
    let p = decodeURIComponent(url.pathname);
    if (host === 'cdn.jsdelivr.net') {
      if (p === '/npm/three@0.149.0/build/three.min.js') return send(req, res, threeFile, 'public, max-age=31536000, s-maxage=31536000, immutable', { 'timing-allow-origin': '*' });
      return notFound(req, res);
    }
    if (host === 'fonts.googleapis.com') {
      // the page asks for two css2 URLs: index.html (Baloo 2, Noto Sans Telugu, VT323, Yatra One) and
      // menus.js at load (Kalam); a per-family css file sits next to fonts.css (kalam.css)
      if (p === '/css2' && fontsDir) {
        const fam = (url.searchParams.getAll('family')[0] || '').split(':')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const own = path.join(fontsDir, fam + '.css');
        return send(req, res, url.searchParams.getAll('family').length === 1 && fs.existsSync(own) ? own : path.join(fontsDir, 'fonts.css'), 'private, max-age=86400, stale-while-revalidate=604800', { 'timing-allow-origin': '*' });
      }
      return notFound(req, res);
    }
    if (host === 'fonts.gstatic.com') {
      if (fontMap[p]) return send(req, res, fontMap[p], 'public, max-age=31536000', { 'timing-allow-origin': '*' });
      return notFound(req, res);
    }
    const m = host.match(/^(?:([a-z0-9-]+)\.)?nostalgia\.test$/);
    const site = m && sites[m[1] || 'a'];
    if (!site) return notFound(req, res);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(site.root, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
    if (!file.startsWith(path.resolve(site.root))) return notFound(req, res);
    const cache = site.cache ? site.cache(p) : 'no-cache';
    const extra = site.headers ? site.headers(p) : null;
    return send(req, res, file, cache, extra);
  };

  const { key, cert } = opts.key ? opts : ensureCert(tmp);
  const server = http2.createSecureServer({ key, cert, allowHTTP1: true }, handler);
  return new Promise((resolve) => {
    server.listen(opts.port || 0, '127.0.0.1', () => {
      const port = server.address().port;
      const hosts = ['nostalgia.test', '*.nostalgia.test', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
      // SPKI pin for --ignore-certificate-errors-spki-list: Chromium then treats the self-signed cert as
      // valid. (--ignore-certificate-errors is not enough: pages loaded with a certificate error are
      // never revalidated from the HTTP cache, which would break the repeat-visit measurements.)
      const spki = crypto.createHash('sha256').update(new crypto.X509Certificate(cert).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
      resolve({
        port, log, warm, spki,
        resolverRules: hosts.map((h) => 'MAP ' + h + ' 127.0.0.1:' + port).join(', '),
        close: () => new Promise((r) => { server.close(() => r()); setTimeout(r, 500); }),
      });
    });
  });
}

module.exports = { startServer };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
  startServer({ port: +process.argv[3] || 8443, sites: { a: { root } }, fontsDir: process.env.FONTS_DIR }).then((s) => {
    console.log('serving ' + root + ' on https://127.0.0.1:' + s.port + ' (h2). Chromium flags:');
    console.log('  --host-resolver-rules="' + s.resolverRules + '" --ignore-certificate-errors-spki-list=' + s.spki);
  });
}
