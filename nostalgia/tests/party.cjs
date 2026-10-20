/* NOSTALGIA — tests/party.cjs  (src/party.js + src/party_races.js, ARCHITECTURE §24)
 *
 * The browser cannot reach supabase.co from this machine, so rooms and leaderboards run against
 * tests/online_mock.cjs (the same PostgREST RPC + Realtime protocols and SQL rules, incl. race_put / race_top);
 * the game's real supabase-js runs unchanged. Racing uses REAL key input: a small in-page autopilot only decides
 * which keys to hold (pure pursuit along the race route), and node presses them with page.keyboard.
 *
 * Covers
 *   solo   — every activity against the AI friends: the Tank Bund sprint started from the "E Start ..." prompt and
 *            the start card, the Birla Mandir steps race (no running on the temple steps), the chai run (pour with E,
 *            carry it back without spilling), a Chitti Chase, a pin race whose START / FINISH pins are dropped with
 *            real right-clicks on the full map; AI times believable; results card; tin token; local personal best;
 *            the checkpoint rings in 3D (swiftshader, three.js from vendor/).
 *   party  — three phones in one room: challenge from the start prompt -> invite cards (Y key / a click) -> lobby ->
 *            countdown synced on the shared clock -> race to the finish with real keys on two phones while the third
 *            leaves mid-race -> the same results on every phone; the leaderboard rows in the stand-in database.
 *   chitti — a party Chitti Chase (same riddles + stops on both phones, chits picked with E, same results).
 *   custom — a party pin race: pins on the host's map, the same checkpoints on both phones, raced with real keys.
 *   zero console errors / N.err on every page.
 *
 *   node nostalgia/tests/party.cjs        ONLY=solo,party,chitti,custom,3d   SHOTS=0 (no screenshots)
 * Screenshots: tests/out/party_*.png
 */
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const mock = require('./online_mock.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const SDK_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const SDK_JS = fs.readFileSync(path.join(ROOT, 'vendor/supabase/supabase.js'), 'utf8');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';
const THREE_JS = fs.readFileSync(path.join(ROOT, 'vendor/three/three.min.js'), 'utf8');
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-compositing'];
const SHOT_MS = 180000;

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const ok = (msg) => console.log('  ok   ' + msg);
const info = (msg) => console.log('       ' + msg);
const check = (cond, msg) => { if (cond) ok(msg); else fail(msg); return !!cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = (k) => !process.env.ONLY || process.env.ONLY.split(',').includes(k);
const fmt = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(1) + ' s');

/* ---------------------------------------------------------------- static server */
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png' };
function staticServer() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}

/* ---------------------------------------------------------------- the in-page autopilot (decides keys only) */
function installAutopilot() {
  if (window.__ap) return;
  const U = N.util;
  const A = { sid: null, path: null, to: null, back: null, stuckT: 0, revT: 0, lastT: performance.now(), actT: 0, sideT: 0 };
  function mk(pts) {
    const P = pts.map((p) => ({ x: p.x, y: p.y })), cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    const total = cum[cum.length - 1];
    const at = (s) => { s = Math.max(0, Math.min(total, s)); let i = 0; while (i < P.length - 2 && cum[i + 1] < s) i++; const L = cum[i + 1] - cum[i] || 1, t = (s - cum[i]) / L; return { x: P[i].x + (P[i + 1].x - P[i].x) * t, y: P[i].y + (P[i + 1].y - P[i].y) * t, a: Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x) }; };
    let hint = 0;
    // forward-only progress (a course that doubles back near itself, like the steps -> the gate, must not skip ahead)
    const scan = (x, y, s0, s1) => { let best = null; for (let i = 0; i < P.length - 1; i++) { if (cum[i + 1] < s0 || cum[i] > s1) continue; const q = U.closestOnSeg(x, y, P[i].x, P[i].y, P[i + 1].x, P[i + 1].y); if (!best || q.d2 < best.d2) best = { d2: q.d2, s: cum[i] + (cum[i + 1] - cum[i]) * q.t }; } return best; };
    const project = (x, y) => { let best = scan(x, y, hint - 40, hint + 140); if (!best || best.d2 > 150 * 150) best = scan(x, y, hint - 40, Infinity) || best; if (best) hint = Math.max(hint - 40, best.s); return best || { d2: 0, s: hint }; };
    return { at, project, total, reset() { hint = 0; } };
  }
  function setup(S) {
    A.sid = S.sid; A.path = null; A.to = null; A.back = null;
    const R = N.partyRaces;
    if (S.id === 'race_custom') A.path = mk(R.custom(S.opts).pts);
    else if (S.id === 'race_birla_steps') A.path = mk(R.birla().pts);
    else if (S.id === 'chai_run') { const d = R.chai(); A.to = mk(d.pts); A.back = mk(d.pts.slice().reverse()); }
    else if (/^race_/.test(S.id)) { const id = S.id.replace(/^race_/, ''); A.path = mk(R.route(id === 'necklace' ? 'necklace_loop' : id).pts); }
  }
  window.__ap = {
    step() {
      const S = N.party._debug.session();
      const now = performance.now(), dt = Math.min(0.25, (now - A.lastT) / 1000); A.lastT = now;
      const out = { up: false, down: false, left: false, right: false, run: false, action: false };
      if (!S || !S.ctx) return Object.assign(out, { done: true, phase: 'none' });
      out.phase = S.phase;
      if (S.phase === 'done') { out.done = true; return out; }
      if (S.phase !== 'running' || N.state.mode !== 'play') return out;
      if (A.sid !== S.sid) setup(S);
      const p = N.player, v = p.vehicle, st = S.handle && S.handle.st;
      if (!st || st.done) { out.idle = true; return out; }
      let path = A.path;
      if (S.id === 'chai_run') {
        if (st.phase === 'pour') return out;
        path = st.phase === 'carry' ? A.back : A.to;
        const D = N.partyRaces.chai();
        if (st.phase === 'to' && Math.hypot(p.x - D.cafe.x, p.y - D.cafe.y) < 16) { if ((A.actT -= dt) <= 0) { A.actT = 0.4; out.action = true; } return out; }
      }
      if (!path) return out;
      let tgt;
      const cycleRace = !!(st.vtype);
      if (cycleRace && !v) {
        // fell off: back to the cycle
        const b = st.bike && st.bike.alive ? st.bike : null;
        const cur = N.interact.current, lab = cur ? String(typeof cur.label === 'function' ? cur.label(p) : cur.label) : '';
        if (b && Math.hypot(b.x - p.x, b.y - p.y) < 14 && /Ride|Pick up|cycle/i.test(lab)) { if ((A.actT -= dt) <= 0) { A.actT = 0.4; out.action = true; } return out; }
        tgt = b ? { x: b.x, y: b.y } : path.at(path.project(p.x, p.y).s + 20);
      } else {
        const e = v || p;
        const pj = path.project(e.x, e.y);
        const look = v ? 24 + Math.abs(v.speed || 0) * 0.3 : 12;
        tgt = path.at(pj.s + look);
        if (v) {
          const a1 = path.at(pj.s + 8).a, a2 = path.at(pj.s + 70).a;
          const turn = Math.abs(U.angleDiff(a1, a2));
          A.want = Math.min(window.__apCap || 999, turn > 1.1 ? 42 : turn > 0.55 ? 70 : 999);
        }
      }
      if (v) {
        const diff = U.angleDiff(v.angle, Math.atan2(tgt.y - v.y, tgt.x - v.x));
        const db = window.__apCap ? 0.1 : 0.05; // a wider deadband when the phone runs at a few frames a second
        out.right = diff > db; out.left = diff < -db;
        // misaligned: let it slow down (steering is far more precise slow, and the keys only change once a frame)
        const lim = Math.abs(diff) > 0.35 ? 30 : (A.want || 999);
        out.up = Math.abs(diff) < 1.25 ? (v.speed || 0) < lim : (v.speed || 0) < 22;
        out.down = (v.speed || 0) > (A.want || 999) + 22;
        if (Math.abs(v.speed || 0) < 4 && (out.up || A.revT > 0)) A.stuckT += dt; else A.stuckT = 0;
        if (A.stuckT > 1.0) { A.revT = 0.8; A.stuckT = 0; }
        if (A.revT > 0) { A.revT -= dt; out.up = false; out.down = true; const l = out.left; out.left = out.right; out.right = l; }
      } else {
        let dx = tgt.x - p.x, dy = tgt.y - p.y;
        // wedged against a wall / a crowd: sidestep for a moment
        const moved = A.fx != null ? Math.hypot(p.x - A.fx, p.y - A.fy) : 9;
        A.fx = p.x; A.fy = p.y;
        if (moved < 0.4 * dt * 45 && A.sideT <= 0) A.stuckF = (A.stuckF || 0) + dt; else A.stuckF = 0;
        if (A.stuckF > 0.8) { A.sideT = 0.7; A.stuckF = 0; A.side = -(A.side || 1); }
        if (A.sideT > 0) { A.sideT -= dt; const ndx = -dy * A.side, ndy = dx * A.side; dx = ndx; dy = ndy; }
        const d = Math.hypot(dx, dy) || 1;
        out.up = dy / d < -0.38; out.down = dy / d > 0.38; out.left = dx / d < -0.38; out.right = dx / d > 0.38;
        out.run = !(S.id === 'chai_run' && st.phase === 'carry');
      }
      return out;
    },
  };
}
// node side: press / release the keys the autopilot asks for, until fn() is true or ms pass
async function drive(P, o) {
  const held = new Set();
  const page = P.page;
  const set = async (key, on) => { if (on && !held.has(key)) { held.add(key); await page.keyboard.down(key); } else if (!on && held.has(key)) { held.delete(key); await page.keyboard.up(key); } };
  const t0 = Date.now();
  let last = null, n = 0;
  try {
    while (Date.now() - t0 < o.ms) {
      let s;
      try { s = await P.ev(() => window.__ap.step()); } catch (e) { break; }
      last = s; n++;
      if (s.done || (o.until && (await P.ev(o.until).catch(() => true)))) break;
      await set('ArrowUp', s.up); await set('ArrowDown', s.down); await set('ArrowLeft', s.left); await set('ArrowRight', s.right); await set('ShiftLeft', s.run);
      if (s.action) await page.keyboard.press('e');
      await sleep(35);
    }
  } finally { for (const k of Array.from(held)) { try { await page.keyboard.up(k); } catch (e) { /* closed */ } } }
  return { last, steps: n, ms: Date.now() - t0 };
}

/* ---------------------------------------------------------------- page helpers */
async function newPhone(browser, name, conf, o) {
  o = o || {};
  const context = await browser.newContext({ viewport: o.viewport || { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '/* stubbed */' }));
  await page.route(SDK_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: SDK_JS }));
  await page.route(THREE_CDN, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_JS }));
  await page.addInitScript((c) => { window.NOSTALGIA_ONLINE_CONFIG = c; }, conf);
  await page.goto(o.url + '#debug');
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 90000 });
  const P = { name, page, context, errors };
  P.ev = (fn, arg) => page.evaluate(fn, arg);
  P.shot = async (n) => { if (process.env.SHOTS === '0') return; await page.screenshot({ path: path.join(OUT, 'party_' + n + '.png'), timeout: SHOT_MS }); };
  P.errs = async () => errors.concat(await page.evaluate(() => (N.debug.state().errors || []).map((e) => 'N.err ' + e)).catch(() => []));
  return P;
}
async function play(P, x, y) {
  await P.ev(() => { N.debug.newGame({ skipIntro: true }); });
  await P.page.waitForFunction(() => N.state.mode === 'play', null, { timeout: 20000 });
  await P.ev(([px, py]) => {
    N.debug.setTime(11, 0); N.debug.freezeClock(true); N.player.teleport(px, py); N.player.energy = 100;
    window.__goAt = 0; window.__res = null; window.__invites = 0;
    N.on('party:go', () => { window.__goAt = Date.now(); const S = N.party.active; window.__goLocal = S ? S.ctx.startAt - N.party._debug.clock().offset : null; window.__goFps = N.perf.fps; });
    N.on('party:end', (d) => { (window.__ends = window.__ends || []).push(d.id + ':' + d.reason); });
    N.on('party:results', (d) => { window.__res = d; });
    N.on('party:invite', () => { window.__invites++; });
  }, [x, y]);
  await P.ev(installAutopilot);
  await P.page.waitForFunction(() => N.world.potholes && (N.world.potholes.ready || (N.world.potholes.ensure(), true)), null, { timeout: 30000 }).catch(() => {});
}
const until = async (P, fn, arg, ms) => P.page.waitForFunction(fn, arg, { timeout: ms || 8000, polling: 100 }).then(() => true, () => false);
const actionLabel = (P) => P.ev(() => { const c = N.interact.current; return c ? (typeof c.label === 'function' ? c.label(N.player) : c.label) : null; });
const standings = (P) => P.ev(() => (window.__res ? window.__res.standings.map((r) => ({ nick: r.nick, rank: r.rank, timeMs: r.timeMs, dnf: r.dnf, left: r.left, score: r.score, note: r.note })) : null));

(async () => {
  const S = await staticServer();
  const M = await mock.start({ key: 'test-publishable-key' });
  const CONF = { provider: 'supabase', url: M.url, key: M.key, sdk: [SDK_CDN, 'vendor/supabase/supabase.js'], maxPlayers: 10, stateHz: 8 };
  const browser = await chromium.launch({ args: ARGS });
  const phones = [];
  try {
    /* ============================================================ SOLO against the AI friends */
    if (only('solo') || only('3d')) {
      console.log('\n== solo: the gang (Immu, Ayesha, Pappu, Bunty-anna)');
      const Z = await newPhone(browser, 'solo', null, { url: S.url });
      phones.push(Z);
      const TB = [8930, 4140];
      await play(Z, TB[0], TB[1]);
      await Z.ev(() => N.party._debug.resetStats());
      const reg = await Z.ev(() => ['race_tank_bund', 'race_koti_charminar', 'race_necklace', 'race_rtc_narayanguda', 'race_golconda_tombs', 'race_custom', 'race_birla_steps', 'chai_run', 'chitti_chase'].filter((id) => N.party.get(id)));
      check(reg.length === 9, 'all 9 activities registered (' + reg.join(', ') + ')');
      const routes = await Z.ev(() => N.partyRaces.ROUTES.map((R) => { const d = N.partyRaces.route(R.id); return d && { id: R.id, len: Math.round(d.total), cps: d.cps.length, onRoad: d.cps.every((c) => N.world.surfaceAt(c.x, c.y) === N.SURF.ROAD || N.world.surfaceAt(c.x, c.y) === N.SURF.BRIDGE) }; }));
      check(routes.every((r) => r && r.len > 1000 && r.cps >= 3 && r.onRoad), 'preset routes on real roads (A*): ' + routes.map((r) => r && r.id + ' ' + r.len + 'u/' + r.cps + 'cp').join(', '));
      const avail = await Z.ev(([x, y]) => N.party.available(x, y).filter((a) => a.here).map((a) => a.id), TB);
      check(avail.includes('race_tank_bund') && avail.includes('chitti_chase'), 'available() at the Ambedkar statue end: ' + avail.join(', '));

      if (only('solo')) {
        // 1. Tank Bund sprint from the "E Start ..." prompt + the start card (real keys)
        console.log('  -- cycle race: Tank Bund sprint (prompt -> card -> 3-2-1 -> real keys)');
        check(await until(Z, () => { const c = N.interact.current; return c && /Start Tank Bund sprint/.test(typeof c.label === 'function' ? c.label(N.player) : c.label); }, null, 5000), 'prompt "E Start Tank Bund sprint" at the start line');
        await Z.page.keyboard.press('e');
        check(await until(Z, () => N.party._debug.cards().card, null, 3000), 'start card opens');
        await Z.shot('solo_start_card');
        const cardTxt = await Z.ev(() => document.querySelector('.pt-card').textContent);
        check(/Ambedkar statue → Sailing Club/.test(cardTxt) && /Play with Immu/.test(cardTxt), 'card: route + "Play with Immu & gang"');
        await Z.page.keyboard.press('1');
        check(await until(Z, () => N.party.active && N.party.active.phase === 'countdown', null, 4000), 'solo race starts: countdown');
        const pre = await Z.ev(() => ({ players: N.party.active.players.map((p) => p.nick + (p.isAI ? '(AI)' : '')), v: N.player.vehicle && N.player.vehicle.type, locked: N.player.controlsLocked, ai: N.npcs.all().filter((a) => a.partyAI).map((a) => a.npcId + ':' + (a.vehicle && a.vehicle.type)), marks: N.party._debug.marks().length }));
        check(pre.players.length === 4 && pre.ai.length === 3, 'me + 3 AI friends on the grid: ' + pre.players.join(', ') + ' · AI cycles ' + pre.ai.join(', '));
        check(/cycle/.test(pre.v || '') && pre.locked, 'I am on a ' + pre.v + ' (age-appropriate), frozen until GO');
        check(pre.marks >= 4, 'checkpoint rings placed (' + pre.marks + ')');
        await sleep(1500);
        await Z.shot('solo_countdown');
        check(await until(Z, () => N.party.active && N.party.active.phase === 'running' && !N.player.controlsLocked, null, 8000), 'GO: controls released');
        const r1 = await drive(Z, { ms: 200000 });
        const fin1 = await until(Z, () => !!window.__res, null, 90000);
        check(fin1, 'Tank Bund sprint finished (' + r1.steps + ' key steps, ' + (r1.ms / 1000).toFixed(0) + ' s)');
        const st1 = await standings(Z);
        if (st1) {
          info('standings: ' + st1.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs) + (r.note ? ' (' + r.note + ')' : '')).join(' | '));
          const me = st1.find((r) => r.nick !== 'Immu' && r.nick !== 'Ayesha' && r.nick !== 'Pappu' && r.nick !== 'Bunty-anna');
          check(me && me.timeMs > 9000 && me.timeMs < 60000, 'my time ' + fmt(me && me.timeMs));
          const ai = st1.filter((r) => r !== me);
          // 1.55 km: flat out a cycle needs ~14 s; traffic at the Indira Park and Lower Tank Bund junctions can cost a lot
          check(ai.every((r) => r.timeMs != null && r.timeMs > 12500 && r.timeMs < 80000), 'AI times believable for 1.55 km on a cycle in traffic: ' + ai.map((r) => r.nick + ' ' + fmt(r.timeMs)).join(', '));
          check(st1.every((r, i) => i === 0 || st1[i - 1].timeMs <= r.timeMs), 'ranked by finish time');
          await until(Z, () => !!document.querySelector('.pt-results'), null, 6000);
          const res = await Z.ev(() => ({ card: !!document.querySelector('.pt-results'), rows: document.querySelectorAll('.pt-results tr').length, pb: N.partyRaces.best('tank_bund'), tin: N.tape && N.tape.tin ? N.tape.tin.has('party_cycle_race') : null, won: (N.party.stats.wins.race_tank_bund | 0) }));
          check(res.card && res.rows === 4, 'results card with 4 rows');
          check(res.pb === Math.round(me.timeMs), 'personal best stored locally (offline): ' + fmt(res.pb));
          if (me.rank === 1) check(res.tin === true && res.won === 1, 'first win: tin token "Cycle race pennant"');
          else info('(I did not win this one, rank ' + me.rank + ': no token expected)');
          await Z.shot('solo_results');
        }
        await Z.ev(() => { N.party.closeCards(); window.__res = null; if (N.party.active) N.party.cancel(); });

        // 2. Birla Mandir steps race (on foot; walk on the temple steps)
        console.log('  -- foot race: Birla Mandir steps');
        const b0 = await Z.ev(() => N.party.solo('race_birla_steps'));
        check(b0.ok, 'steps race starts');
        await until(Z, () => N.party.active && N.party.active.phase === 'running', null, 8000);
        const onFoot = await Z.ev(() => !N.player.vehicle);
        check(onFoot, 'everyone on foot');
        let sawSteps = false, ranOnSteps = false;
        const r2 = await drive(Z, { ms: 150000, until: () => { const S = N.party._debug.session(); const z = N.respect && N.respect.at(N.player.x, N.player.y); if (z) { window.__steps = (window.__steps || 0) + 1; if (N.player.running && window.__inZone) window.__ranSteps = true; } window.__inZone = !!z; return !S || S.phase === 'done' || (S.handle.st && S.handle.st.done); } });
        sawSteps = await Z.ev(() => (window.__steps || 0) > 0); ranOnSteps = await Z.ev(() => !!window.__ranSteps);
        check(sawSteps && !ranOnSteps, 'on the temple steps the player walks (Mandir rules): samples ' + (await Z.ev(() => window.__steps || 0)));
        await Z.shot('solo_birla_steps');
        check(await until(Z, () => window.__res && window.__res.id === 'race_birla_steps', null, 60000), 'steps race finished (' + (r2.ms / 1000).toFixed(0) + ' s)');
        const st2 = await standings(Z);
        if (st2) info('standings: ' + st2.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs)).join(' | '));
        check(st2 && st2.filter((r) => r.timeMs != null).length === 4 && st2.every((r) => r.timeMs == null || (r.timeMs > 5000 && r.timeMs < 40000)), 'all four finished with believable times');
        await Z.ev(() => { N.party.closeCards(); window.__res = null; if (N.party.active) N.party.cancel(); });

        // 3. the chai run
        console.log('  -- foot race: the chai run');
        await Z.ev(() => N.party.solo('chai_run'));
        await until(Z, () => N.party.active && N.party.active.phase === 'running', null, 8000);
        const r3 = await drive(Z, { ms: 180000, until: () => { const S = N.party._debug.session(); if (S && S.handle && S.handle.st && S.handle.st.phase === 'carry' && !window.__chaiShot) { window.__chaiShot = 1; } return !S || S.phase === 'done' || (S.handle.st && S.handle.st.done); } });
        await Z.shot('solo_chai_run');
        check(await until(Z, () => window.__res && window.__res.id === 'chai_run', null, 60000), 'chai run finished (' + (r3.ms / 1000).toFixed(0) + ' s)');
        const st3 = await standings(Z);
        if (st3) info('standings: ' + st3.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs) + ' ' + (r.note || '')).join(' | '));
        const meChai = st3 && st3.find((r) => !['Immu', 'Ayesha', 'Pappu', 'Bunty-anna'].includes(r.nick));
        check(meChai && meChai.score >= 30 && meChai.timeMs > 6000, 'I delivered a cutting chai: ' + (meChai && meChai.note) + ' in ' + fmt(meChai && meChai.timeMs));
        const adj = (r) => r.timeMs + (100 - r.score) * 80;
        check(st3 && st3.filter((r) => r.rank).every((r, i, a) => i === 0 || adj(a[i - 1]) <= adj(r)), 'ranked by time + 0.08 s per 1% spilled');
        check(st3 && st3.filter((r) => r.score != null).length === 4, 'the AI friends carried theirs too');
        await Z.ev(() => { N.party.closeCards(); window.__res = null; if (N.party.active) N.party.cancel(); });

        // 4. Chitti Chase (teleport between the chits; pick each with E)
        console.log('  -- Chitti Chase');
        const cc = await Z.ev(() => { const st = N.partyRaces.pickStops(9110, 8332, 4, 11); return { st, r: N.party.solo('chitti_chase', { n: 4, start: { x: 9110, y: 8332 }, stops: st }) }; });
        check(cc.r.ok && cc.st.length === 4, 'Chitti Chase with 4 Old City stops: ' + cc.st.join(', '));
        await until(Z, () => N.party.active && N.party.active.phase === 'running', null, 8000);
        const riddle = await Z.ev(() => N.hud.objectiveText);
        check(/Chit 1\/4: "/.test(riddle || ''), 'first riddle shown: ' + riddle);
        await Z.shot('solo_chitti_riddle');
        for (let k = 0; k < 4; k++) {
          const spot = await Z.ev((i) => N.partyRaces.chitSpot(N.party._debug.session().opts.stops[i]), k);
          await Z.ev(([x, y]) => N.player.teleport(x + 6, y), [spot.x, spot.y]);
          const got = await until(Z, () => /chit/i.test(String((N.interact.current && N.interact.current.label) || '')), null, 4000);
          if (k === 1) { await sleep(400); await Z.shot('solo_chitti_chit'); }
          await Z.page.keyboard.press('e');
          check(got && await until(Z, (i) => N.party._debug.session() ? N.party._debug.session().handle.st.k > i : true, k, 3000), 'chit ' + (k + 1) + ' picked at ' + spot.name + ' (E)');
          await sleep(600);
        }
        const aiProg = await Z.ev(() => { const S = N.party._debug.session(); return S ? Array.from(S.handle.st.prog.entries()).map(([u, k]) => u + ':' + k) : []; });
        info('AI chits when I finished: ' + aiProg.join(' '));
        check(await until(Z, () => window.__res && window.__res.id === 'chitti_chase', null, 70000), 'Chitti Chase results');
        const st4 = await standings(Z);
        if (st4) info('standings: ' + st4.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs) + ' ' + (r.note || '')).join(' | '));
        check(st4 && st4[0].rank === 1 && st4[0].score === 4, 'the first to all four chits wins');
        await Z.ev(() => { N.party.closeCards(); window.__res = null; if (N.party.active) N.party.cancel(); });

        // 5. pin race: START / FINISH pins with real right-clicks on the full map
        console.log('  -- pin race (custom route from map pins)');
        await Z.ev(() => N.player.teleport(9000, 5830));
        await Z.ev(() => N.party.start('race_custom'));
        check(await until(Z, () => N.party._debug.cards().card, null, 3000), 'pin race card');
        await Z.page.keyboard.press('1');
        check(await until(Z, () => N.state.mode === 'map' && !!N.partyRaces._debug.mapView(), null, 6000), 'the map opens for the pins');
        const clickAt = async (x, y) => {
          const q = await Z.ev(([wx, wy]) => { const v = N.partyRaces._debug.mapView(); const r = document.querySelector('.mp-over').getBoundingClientRect(); const s = v.w2s(wx, wy); return { x: r.left + s[0], y: r.top + s[1] }; }, [x, y]);
          await Z.page.mouse.click(q.x, q.y, { button: 'right' });
        };
        await clickAt(9000, 5815);
        check(await until(Z, () => /FINISH pin/.test((document.querySelector('.pt-pinbar') || {}).textContent || ''), null, 3000), 'START pin dropped (right-click); asks for the FINISH pin');
        await Z.shot('solo_pin_map');
        await clickAt(9820, 6140);
        check(await until(Z, () => N.party.active && N.party.active.id === 'race_custom', null, 6000), 'FINISH pin dropped: the pin race starts');
        const cust = await Z.ev(() => { const S = N.party._debug.session(); const d = N.partyRaces.custom(S.opts); return { opts: S.opts, len: Math.round(d.total), cps: d.cps.length }; });
        check(cust.len > 700 && cust.cps >= 2, 'route by A* between the pins: ' + cust.opts.from + ' → ' + cust.opts.to + ', ' + cust.len + ' u, ' + cust.cps + ' checkpoints');
        await until(Z, () => N.party.active && N.party.active.phase === 'running', null, 8000);
        const r5 = await drive(Z, { ms: 200000 });
        check(await until(Z, () => window.__res && window.__res.id === 'race_custom', null, 90000), 'pin race finished (' + (r5.ms / 1000).toFixed(0) + ' s)');
        const st5 = await standings(Z);
        if (st5) info('standings: ' + st5.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs) + ' ' + (r.note || '')).join(' | '));
        check(st5 && st5.filter((r) => r.timeMs != null).length >= 3, 'riders finished the pin race');
        await Z.ev(() => N.party.closeCards());
      }

      /* the rings in 3D */
      if (only('3d') || only('solo')) {
        console.log('  -- 3D: checkpoint rings + AI riders');
        await Z.ev(() => { if (N.party.active) N.party.cancel(); N.player.teleport(9450, 3480); });
        await Z.ev(() => N.party.solo('race_tank_bund'));
        await until(Z, () => N.party.active && N.party.active.phase === 'countdown', null, 6000);
        await Z.ev(() => N.view.set('tps'));
        const in3d = await until(Z, () => N.view3d && N.view3d.active, null, 120000);
        check(in3d, '3D view on');
        if (in3d) {
          await Z.ev(() => { try { N.view3d.settle(5000); } catch (e) { /* ignore */ } });
          await until(Z, () => N.party.active && N.party.active.phase === 'running', null, 60000);
          // for the picture: put the cycle 70 u before the first ring, facing it (3D keyboard input is camera-relative)
          await Z.ev(() => { const cp = N.party._debug.marks().find((m) => m.state === 'next'); const v = N.player.vehicle; if (!cp || !v) return; const R = N.partyRaces.route('tank_bund'); const a = R.cps[0].a; v.x = cp.x - Math.cos(a) * 70; v.y = cp.y - Math.sin(a) * 70; v.angle = a; v.vx = v.vy = 0; v.speed = 0; N.player.x = v.x; N.player.y = v.y; try { N.view3d.snapCamera(); N.view3d.settle(3000); } catch (e) { /* ignore */ } });
          await sleep(1500);
          await Z.ev(() => { const cp = N.party._debug.marks().find((m) => m.state === 'next') || N.party._debug.marks()[0]; const p = N.player; try { N.view3d.setCamera({ yaw: Math.atan2(cp.y - p.y, cp.x - p.x), pitch: 0.3, snap: true }); } catch (e) { /* ignore */ } });
          await sleep(800);
          const v3 = await Z.ev(() => N.party._debug.v3());
          check(v3.ok && v3.visible >= 2, '3D layer "party" draws the rings (' + v3.visible + ' visible)');
          await Z.shot('3d_rings');
          await Z.ev(() => N.view.set('top'));
        }
        await Z.ev(() => N.party.cancel());
      }
      const ze = await Z.errs();
      check(!ze.length, 'solo page: zero errors' + (ze.length ? ': ' + ze.slice(0, 4).join(' | ') : ''));
      await Z.context.close();
    }

    /* ============================================================ PARTY: three phones, one room */
    let A = null, B = null, C = null;
    if (only('party') || only('chitti') || only('custom')) {
      console.log('\n== party: three phones in one room');
      // three phones share this machine's CPU: a slightly smaller window keeps them at a usable frame rate
      A = await newPhone(browser, 'A', CONF, { url: S.url, viewport: { width: 760, height: 480 } });
      B = await newPhone(browser, 'B', CONF, { url: S.url, viewport: { width: 760, height: 480 } });
      C = await newPhone(browser, 'C', CONF, { url: S.url, viewport: { width: 400, height: 720 } });
      phones.push(A, B, C);
      for (const [P, nick, dx] of [[A, 'Ravi', 0], [B, 'Pooja', 30], [C, 'Imran', -30]]) {
        await play(P, 8919 + dx, 4128);
        await P.ev((n) => N.online.goOnline().then(() => N.online.setNick(n)), nick);
      }
      const made = await A.ev(() => N.online.createRoom());
      await B.ev((c) => N.online.joinRoom(c), made.code);
      await C.ev((c) => N.online.joinRoom(c), made.code);
      check(await until(A, () => N.online.room && N.online.room.n === 3, null, 10000), 'room ' + made.code + ' with Ravi, Pooja, Imran');
      check(await A.ev(() => typeof N.online.channelSend === 'function' && N.online.players().length === 3), '[party hook] N.online.channelSend / onMessage / players()');
    }
    const tidy = async () => { for (const P of [A, B]) if (P) await P.ev(() => { if (N.party.active) N.party.cancel(); N.party.closeCards(); if (N.shops && N.shops.isOpen && N.shops.isOpen()) N.shops.close(); window.__res = null; }).catch(() => {}); await sleep(600); };
    if (only('party') && A) {
      console.log('  -- challenge -> invite -> accept -> countdown sync');
      check(await A.ev(() => N.party.TUNE.lobbyMs) === 20000, 'lobby timeout is 20 s');
      await A.ev(() => { N.party.TUNE.lobbyMs = 60000; }); // screenshots are slow on this loaded machine
      const promptA = await until(A, () => { const c = N.interact.current; return c && /Start Tank Bund sprint/.test(c.label); }, null, 30000);
      if (!promptA) info('A interact: ' + JSON.stringify(await A.ev(() => ({ cur: N.interact.current && N.interact.current.label, mode: N.state.mode, pos: [Math.round(N.player.x), Math.round(N.player.y)], veh: N.player.vehicle && N.player.vehicle.type, locked: N.player.controlsLocked, mission: N.missions.active && N.missions.active.id, sess: !!N.party.active, cards: N.party._debug.cards() }))));
      check(promptA, 'A: prompt "E Start Tank Bund sprint"');
      await A.page.keyboard.press('e');
      await until(A, () => N.party._debug.cards().card, null, 3000);
      const card = await A.ev(() => document.querySelector('.pt-card').textContent);
      check(/Challenge the room \(2\)/.test(card), 'A: start card offers "Challenge the room (2)"');
      await A.page.keyboard.press('1');
      check(await until(B, () => N.party._debug.cards().invite, null, 6000) && await until(C, () => N.party._debug.cards().invite, null, 6000), 'B and C see the invite card');
      const invTxt = await B.ev(() => document.querySelector('.pt-invite').textContent);
      check(/Ravi challenges you to Tank Bund sprint/.test(invTxt) && /Accept/.test(invTxt) && /Skip/.test(invTxt), 'invite: "' + invTxt.slice(0, 60) + '…"');
      await B.shot('invite_B');
      await B.page.keyboard.press('y');
      check(await until(A, () => document.querySelector('.pt-lobby') && /✓ Pooja/.test(document.querySelector('.pt-lobby').textContent), null, 5000), 'A\'s lobby: Pooja ✓ (accepted with the Y key)');
      await A.shot('lobby_A');
      await C.page.click('.pt-invite [data-a=acc]');
      const started = await until(A, () => N.party.active && N.party.active.phase !== 'lobby', null, 8000);
      check(started, 'everyone answered: the host starts');
      const sync = await Promise.all([A, B, C].map((P) => P.ev(() => ({ clk: N.party._debug.clock(), startAt: N.party.active && N.party.active.ctx.startAt, players: N.party.active && N.party.active.players.map((p) => p.nick), seed: N.party.active && N.party.active.ctx.seed }))));
      check(sync.every((s) => s.startAt === sync[0].startAt && s.seed === sync[0].seed), 'same seed (' + sync[0].seed + ') and start time on all three');
      check(sync.every((s) => JSON.stringify(s.players) === JSON.stringify(sync[0].players)), 'same player order: ' + sync[0].players.join(', '));
      info('clock offsets (ms): ' + sync.map((s) => s.clk.offset + ' rtt ' + (isFinite(s.clk.rtt) ? s.clk.rtt : '-')).join(' | '));
      await sleep(1700);
      await A.shot('countdown_A');
      await Promise.all([A, B, C].map((P) => until(P, () => window.__goAt > 0, null, 10000)));
      // each phone's GO instant on its own clock = startAt (host clock) - its measured offset; the GO frame comes at most a
      // frame or two later (these headless phones share a loaded CPU and run at a few frames a second)
      const go = await Promise.all([A, B, C].map((P) => P.ev(() => ({ at: window.__goAt, local: window.__goLocal, fps: window.__goFps, active: !!N.party.active, ends: window.__ends || [] }))));
      if (go.some((g) => !g.active)) info('sessions: ' + JSON.stringify(go));
      const localSpread = Math.max(...go.map((g) => g.local)) - Math.min(...go.map((g) => g.local));
      const late = go.map((g) => g.at - g.local);
      info('GO frames: ' + go.map((g, i) => '+' + late[i] + ' ms at ' + g.fps + ' fps').join(' | '));
      const rtts = (await Promise.all([B, C].map((P) => P.ev(() => N.party._debug.clock().rtt)))).filter(isFinite);
      const bound = 120 + Math.max(0, ...rtts) / 2; // a ping / pong offset is good to half the round trip
      check(localSpread <= bound, '3-2-1-GO synced on the shared clock: the GO instant agrees within ' + localSpread + ' ms on the three phones (bound ' + Math.round(bound) + ' ms: 120 + rtt/2)');
      check(late.every((l) => l >= 0 && l < 2500), 'each phone showed GO on its next frame after that instant (frames are slow on this loaded machine: ' + late.join(' / ') + ' ms)');
      check(go.every((g) => isFinite(g.local)) && (await Promise.all([B, C].map((P) => P.ev(() => isFinite(N.party._debug.clock().rtt))))).every(Boolean), 'both guests measured their clock offset (ping / pong)');
      console.log('  -- the race (real keys on A and B; C leaves mid-race)');
      for (const P of [A, B, C]) await P.ev(() => { window.__apCap = 60; });
      const dA = drive(A, { ms: 320000 });
      const dB = drive(B, { ms: 320000 });
      const dC = drive(C, { ms: 6000 });
      await dC;
      await sleep(500);
      await C.shot('race_C');
      const ce = await C.errs();
      check(!ce.length, 'C: zero errors before leaving' + (ce.length ? ': ' + ce.slice(0, 4).join(' | ') : ''));
      await C.context.close();
      check(await until(A, () => { const S = N.party._debug.session(); return S && S.left.size === 1; }, null, 8000), 'Imran left mid-race: marked "left" on A');
      await sleep(3000);
      await B.shot('race_B');
      const [ra, rb] = await Promise.all([dA, dB]);
      info('A drove ' + (ra.ms / 1000).toFixed(0) + ' s, B ' + (rb.ms / 1000).toFixed(0) + ' s');
      // the slower rider has max(30 s, 60% of the winning time) after the winner, then DNF: wait that out
      const done = await until(A, () => !!window.__res, null, 240000) && await until(B, () => !!window.__res, null, 30000);
      check(done, 'results on A and B');
      const sa = await standings(A), sb = await standings(B);
      if (sa) info('A: ' + sa.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs) + (r.left ? ' (left)' : '')).join(' | '));
      if (sb) info('B: ' + sb.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs) + (r.left ? ' (left)' : '')).join(' | '));
      check(sa && sb && JSON.stringify(sa) === JSON.stringify(sb), 'results agree on both phones');
      check(sa && sa.filter((r) => r.timeMs != null).length === 2 && sa.find((r) => r.nick === 'Imran' && r.left && r.rank == null), 'Ravi and Pooja finished; Imran left (no place)');
      await until(A, () => !!document.querySelector('.pt-results'), null, 6000); await until(B, () => !!document.querySelector('.pt-results'), null, 6000);
      await A.shot('results_A');
      await B.shot('results_B');
      // leaderboard (stand-in database: same rules as race_put / race_top)
      await sleep(1500);
      const rows = [...M.db.races.entries()].filter(([k]) => k.endsWith(':tank_bund'));
      check(rows.length === 2, 'leaderboard: both finishers in race_times (' + rows.map(([, r]) => r.best).join(', ') + ' ms)');
      const top = await A.ev(() => N.partyRaces.fetchTop('tank_bund').then(() => N.partyRaces.top('tank_bund')));
      check(top && top.top && top.top.length === 2 && top.top.some((q) => q.nick === 'Ravi') && top.top.some((q) => q.nick === 'Pooja'), 'race_top: ' + (top && top.top ? top.top.map((q) => q.nick + ' ' + fmt(q.ms)).join(', ') : '?'));
      const calls = M.calls.filter((c) => c.kind === 'rpc' && /^race_/.test(c.fn));
      check(calls.length >= 2 && !calls.some((c) => c.reason === 'rate'), 'race_* calls: ' + calls.length + ', none rate-limited');
      await tidy();
      // the Online panel's "Challenge friends" list + the 🏁 quick-chat button
      await A.ev(() => { N.game.pause(); });
      await sleep(300);
      await A.ev(() => N.online.open({ from: 'pause' }));
      await sleep(400);
      const panel = await A.ev(() => Array.from(document.querySelectorAll('.mn-online [data-act=party]')).map((b) => b.textContent));
      check(panel.length >= 5, 'Online panel lists "Challenge friends": ' + panel.slice(0, 6).join(' · '));
      await A.page.evaluate(() => { const b = document.querySelector('.mn-online .ol-body'); const h = Array.from(b.querySelectorAll('h4')).find((x) => /Challenge/.test(x.textContent)); if (h) h.scrollIntoView(); });
      await A.shot('panel_A');
      await A.ev(() => { N.online.close(); N.game.resume(); });
      await sleep(300);
      await A.page.click('.ol-chat-tg');
      await A.page.click('.ol-chat [data-ol=party]');
      check(await until(A, () => document.querySelectorAll('.pt-card .pt-pick').length >= 5, null, 3000), '🏁 in the quick-chat strip opens the challenge picker');
      await A.shot('picker_A');
      await A.ev(() => N.party.closeCards());
    }
    const cAlive = async () => { try { return !!(C && !C.page.isClosed() && await C.ev(() => !!N.online.room)); } catch (e) { return false; } };
    const cSkips = async (label) => {
      if (!(await cAlive())) return;
      if (await until(C, () => N.party._debug.cards().invite, null, 8000)) { await C.page.keyboard.press('n'); check(await until(A, () => { const S = N.party._debug.session(); return !S || S.phase !== 'lobby' || S.skip.size > 0; }, null, 6000), 'C skips the ' + label + ' invite (N key): the host sees it'); }
    };
    if (only('chitti') && A) {
      await tidy();
      console.log('  -- party Chitti Chase (A + B)');
      await A.ev(() => N.player.teleport(9110, 8332)); await B.ev(() => N.player.teleport(9130, 8332));
      const stops = await A.ev(() => N.partyRaces.pickStops(9110, 8332, 4, 5));
      await A.ev((st) => N.party.challenge('chitti_chase', { n: 4, start: { x: 9110, y: 8332 }, stops: st }), stops);
      check(await until(B, () => N.party._debug.cards().invite, null, 6000), 'B: invite to the Chitti Chase');
      await B.page.keyboard.press('y');
      await cSkips('Chitti Chase');
      check(await until(B, () => N.party.active && N.party.active.phase !== 'lobby', null, 8000), 'started on B');
      const same = await Promise.all([A, B].map((P) => P.ev(() => JSON.stringify(N.party.active.ctx.opts.stops))));
      check(same[0] === same[1], 'same stops (riddles) on both: ' + JSON.parse(same[0]).join(', '));
      await Promise.all([A, B].map((P) => until(P, () => N.party.active && N.party.active.phase === 'running', null, 10000)));
      const pickAll = async (P, n, delay) => {
        for (let k = 0; k < n; k++) {
          const spot = await P.ev((i) => N.partyRaces.chitSpot(N.party._debug.session().opts.stops[i]), k);
          await P.ev(([x, y]) => N.player.teleport(x + 4, y + 4), [spot.x, spot.y]);
          await until(P, () => /chit/i.test(String((N.interact.current && N.interact.current.label) || '')), null, 4000);
          await P.page.keyboard.press('e');
          await sleep(delay);
        }
      };
      await Promise.all([pickAll(B, 4, 500), pickAll(A, 3, 1200)]);
      await sleep(800);
      await A.shot('chitti_A');
      const boardA = await A.ev(() => document.querySelector('.pt-strip') && document.querySelector('.pt-strip').textContent);
      info('A board: ' + boardA);
      await pickAll(A, 0, 0);
      // A has 3 of 4: finish the last one
      const spot4 = await A.ev(() => N.partyRaces.chitSpot(N.party._debug.session().opts.stops[3]));
      await A.ev(([x, y]) => N.player.teleport(x + 4, y + 4), [spot4.x, spot4.y]);
      await until(A, () => /chit/i.test(String((N.interact.current && N.interact.current.label) || '')), null, 4000);
      await A.page.keyboard.press('e');
      check(await until(A, () => !!window.__res && window.__res.id === 'chitti_chase', null, 20000) && await until(B, () => !!window.__res && window.__res.id === 'chitti_chase', null, 10000), 'Chitti Chase results on both');
      const ca = await standings(A), cb = await standings(B);
      if (ca) info('A: ' + ca.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs)).join(' | '));
      check(ca && cb && JSON.stringify(ca) === JSON.stringify(cb), 'Chitti Chase results agree');
      check(ca && ca[0].nick === 'Pooja' && ca[0].rank === 1, 'Pooja found all four first');
      await B.shot('chitti_results_B');
      await A.ev(() => N.party.closeCards()); await B.ev(() => N.party.closeCards());
    }
    if (only('custom') && A) {
      await tidy();
      console.log('  -- party pin race (A drops the pins on the map; A + B race with real keys)');
      await A.ev(() => N.player.teleport(10860, 4450)); await B.ev(() => N.player.teleport(10880, 4450));
      await A.ev(() => N.party.start('race_custom'));
      await until(A, () => N.party._debug.cards().card, null, 3000);
      await A.page.keyboard.press('1');
      await until(A, () => N.state.mode === 'map' && !!N.partyRaces._debug.mapView(), null, 6000);
      const clickAt = async (x, y) => {
        const q = await A.ev(([wx, wy]) => { const v = N.partyRaces._debug.mapView(); const r = document.querySelector('.mp-over').getBoundingClientRect(); const s = v.w2s(wx, wy); return { x: r.left + s[0], y: r.top + s[1] }; }, [x, y]);
        await A.page.mouse.click(q.x, q.y, { button: 'right' });
      };
      await clickAt(10860, 4445);
      await until(A, () => /FINISH pin/.test((document.querySelector('.pt-pinbar') || {}).textContent || ''), null, 3000);
      await clickAt(10500, 4700);
      check(await until(B, () => N.party._debug.cards().invite, null, 8000), 'B: invite to the pin race');
      const invC = await B.ev(() => document.querySelector('.pt-invite').textContent);
      info('invite: ' + invC);
      await B.page.keyboard.press('y');
      await cSkips('pin race');
      await Promise.all([A, B].map((P) => until(P, () => N.party.active && N.party.active.phase === 'countdown', null, 8000)));
      const cpsAB = await Promise.all([A, B].map((P) => P.ev(() => JSON.stringify(N.party._debug.marks().map((m) => [Math.round(m.x), Math.round(m.y), m.r])))));
      check(cpsAB[0] === cpsAB[1] && JSON.parse(cpsAB[0]).length >= 2, 'the same checkpoints on both phones (' + JSON.parse(cpsAB[0]).length + ')');
      await Promise.all([A, B].map((P) => until(P, () => N.party.active && N.party.active.phase === 'running', null, 10000)));
      for (const P of [A, B]) await P.ev(() => { window.__apCap = 60; });
      await Promise.all([drive(A, { ms: 320000 }), drive(B, { ms: 320000 })]);
      check(await until(A, () => !!window.__res && window.__res.id === 'race_custom', null, 240000) && await until(B, () => !!window.__res && window.__res.id === 'race_custom', null, 30000), 'pin race results on both');
      const pa = await standings(A), pb = await standings(B);
      if (pa) info('A: ' + pa.map((r) => (r.rank || '-') + ' ' + r.nick + ' ' + fmt(r.timeMs) + (r.dnf ? ' DNF' : '')).join(' | '));
      check(pa && pb && JSON.stringify(pa) === JSON.stringify(pb), 'pin race results agree');
      await A.shot('pin_results_A');
    }
    for (const P of [A, B]) if (P) { const er = await P.errs(); check(!er.length, P.name + ': zero errors' + (er.length ? ': ' + er.slice(0, 4).join(' | ') : '')); }
  } catch (e) {
    fail('exception: ' + (e.stack || e.message));
  } finally {
    for (const P of phones) { try { await P.context.close(); } catch (e) { /* ignore */ } }
    await browser.close();
    await M.close();
    S.srv.close();
  }
  console.log('\nScreenshots: ' + OUT + '/party_*.png');
  if (failures.length) { console.log('\nPARTY FAILED (' + failures.length + '):\n' + failures.join('\n')); process.exit(1); }
  console.log('\nPARTY PASSED');
})();
