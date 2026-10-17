/* NOSTALGIA — tools/perf/profile_boot.cjs
 * Where the boot CPU goes: loads the split variant (one URL per module, so V8 profile nodes name
 * their module), with CDP CPU throttling and the V8 sampling profiler running from navigation to
 * the interactive title screen. Prints self time per module and the top functions.
 *
 *   node nostalgia/tools/perf/profile_boot.cjs --sites <dir> [--variant c] [--cpu 4] [--fonts <dir>] [--tmp <dir>]
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { startServer } = require('./serve.cjs');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SITES = path.resolve(arg('--sites'));
const VARIANT = arg('--variant', 'c');
const CPU = +arg('--cpu', '4');

(async () => {
  try { fs.writeFileSync('/proc/' + process.pid + '/autogroup', '-10'); } catch (e) { /* not root */ }
  const server = await startServer({ tmp: arg('--tmp', os.tmpdir()), fontsDir: arg('--fonts', null), sites: { [VARIANT]: { root: path.join(SITES, VARIANT) } } });
  server.warm(path.join(SITES, VARIANT));
  const env = Object.assign({}, process.env); for (const k of Object.keys(env)) if (/proxy/i.test(k)) delete env[k];
  const browser = await chromium.launch({ env, args: ['--host-resolver-rules=' + server.resolverRules, '--ignore-certificate-errors-spki-list=' + server.spki, '--no-proxy-server', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.goto('https://' + VARIANT + '.nostalgia.test/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title' && document.getElementById('title-start'), null, { timeout: 600000, polling: 200 });
  const wall = Date.now() - t0;
  const { profile } = await cdp.send('Profiler.stop');
  // self time per node from samples
  const dt = {}; const ts = profile.timeDeltas; let i = 0;
  for (const id of profile.samples) { dt[id] = (dt[id] || 0) + (ts[i++] || 0) / 1000; }
  const byMod = {}, byFn = {};
  for (const n of profile.nodes) {
    const ms = dt[n.id] || 0; if (!ms) continue;
    const cf = n.callFrame; const url = cf.url || ''; const mod = url ? url.replace(/^https:\/\/[^/]+\//, '').replace(/\.[0-9a-f]{10}\.js$/, '.js') : '(' + (cf.functionName || 'native') + ')';
    byMod[mod] = (byMod[mod] || 0) + ms;
    const fk = (cf.functionName || '(anonymous)') + ' @ ' + mod + ':' + (cf.lineNumber + 1);
    byFn[fk] = (byFn[fk] || 0) + ms;
  }
  const total = Object.values(byMod).reduce((a, b) => a + b, 0);
  console.log('variant ' + VARIANT + ', CPU ' + CPU + 'x, wall ' + wall + ' ms to title, sampled ' + Math.round(total) + ' ms');
  console.log('\nself time by module:');
  for (const [k, v] of Object.entries(byMod).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log('  ' + k.padEnd(40) + String(Math.round(v)).padStart(7) + ' ms ' + String(Math.round(100 * v / total)).padStart(3) + '%');
  console.log('\ntop functions (self time):');
  for (const [k, v] of Object.entries(byFn).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('  ' + String(Math.round(v)).padStart(6) + ' ms  ' + k);
  await browser.close(); await server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
