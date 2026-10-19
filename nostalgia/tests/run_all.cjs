/* NOSTALGIA — tests/run_all.cjs
 * Runs every test suite in tests/ (one child process each, sequentially by default: the suites
 * measure frame times and boot budgets, so running them in parallel on a small machine makes
 * them lie) and prints a summary table: suite, result, ok / FAIL line counts, wall time.
 *
 *   node nostalgia/tests/run_all.cjs                  every suite
 *   QUICK=1 node nostalgia/tests/run_all.cjs          skip the long ones (story_full, galleries)
 *   ONLY=smoke,shops node nostalgia/tests/run_all.cjs only these suites
 *   SKIP=story_full node nostalgia/tests/run_all.cjs  all but these
 *   JOBS=2 node nostalgia/tests/run_all.cjs           run 2 suites at a time (faster, noisier)
 *   TIMEOUT=900 node nostalgia/tests/run_all.cjs      per-suite timeout in seconds (default 1200)
 * Logs: tests/out/run_all/<suite>.log. Exit code 1 if any suite fails or times out.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DIR = __dirname;
const OUT = path.join(DIR, 'out', 'run_all');
fs.mkdirSync(OUT, { recursive: true });

const LONG = ['story_full', 'landmarks_gallery', 'places_gallery', 'map_preview'];
const list = (s) => (s || '').split(',').map((x) => x.trim().replace(/\.cjs$/, '')).filter(Boolean);
const only = list(process.env.ONLY);
const skip = list(process.env.SKIP).concat(process.env.QUICK ? LONG : []);
const JOBS = Math.max(1, +process.env.JOBS || 1);
const TIMEOUT = (+process.env.TIMEOUT || 1200) * 1000;

const suites = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.cjs') && f !== 'run_all.cjs')
  .map((f) => f.replace(/\.cjs$/, ''))
  .filter((s) => (!only.length || only.includes(s)) && !skip.includes(s))
  .sort();

function runSuite(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const log = fs.createWriteStream(path.join(OUT, name + '.log'));
    // Suites read ONLY= themselves (viewport / section filters): never leak ours into them.
    const env = Object.assign({}, process.env);
    delete env.ONLY; delete env.SKIP; delete env.JOBS; delete env.QUICK;
    const child = spawn(process.execPath, [path.join(DIR, name + '.cjs')], { env, cwd: path.resolve(DIR, '..', '..') });
    let text = '';
    const take = (d) => { const s = d.toString(); text += s; log.write(s); };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      log.end();
      const lines = text.split('\n');
      const oks = lines.filter((l) => /^\s*(ok|PASS)\b/.test(l)).length;
      const fails = lines.filter((l) => /^\s*FAIL\b/.test(l));
      const result = timedOut ? 'TIMEOUT' : code === 0 ? 'pass' : 'FAIL';
      const r = { name, result, code, oks, fails: fails.length, firstFail: (fails[0] || '').trim().slice(0, 90), secs: (Date.now() - t0) / 1000 };
      console.log((result === 'pass' ? '  pass ' : '  ' + result + ' ') + name + '  (' + r.secs.toFixed(0) + ' s, ' + oks + ' ok, ' + fails.length + ' FAIL)');
      resolve(r);
    });
  });
}

(async () => {
  console.log('Running ' + suites.length + ' suites (' + JOBS + ' at a time). Logs: ' + path.relative(process.cwd(), OUT));
  const results = [];
  const queue = suites.slice();
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) results.push(await runSuite(queue.shift()));
  }));
  results.sort((a, b) => a.name.localeCompare(b.name));
  const w = Math.max(5, ...results.map((r) => r.name.length));
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  console.log('\n' + pad('suite', w) + '  result   ' + lpad('ok', 5) + ' ' + lpad('FAIL', 5) + ' ' + lpad('secs', 6) + '  first failure');
  console.log('-'.repeat(w + 34 + 40));
  for (const r of results) {
    console.log(pad(r.name, w) + '  ' + pad(r.result, 7) + '  ' + lpad(r.oks, 5) + ' ' + lpad(r.fails, 5) + ' ' + lpad(r.secs.toFixed(0), 6) + '  ' + r.firstFail);
  }
  const bad = results.filter((r) => r.result !== 'pass');
  console.log('\n' + (results.length - bad.length) + '/' + results.length + ' suites pass' + (bad.length ? '; failing: ' + bad.map((r) => r.name).join(', ') : ''));
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 1));
  process.exit(bad.length ? 1 : 0);
})();
