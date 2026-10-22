/* NOSTALGIA — sidejobs.js  (owner: shops agent)
 * The odd jobs of systems_design §9: paper boy, girni dabbas, kirana errands, the raddi round, kite
 * lootna, antenna jobs, the Rythu Bazaar shopping list, the cinema cut-out helper and the gully
 * cricket league. Each job (except lootna, which is free-roam street life) runs on the mission
 * runner as `kind: 'job'` (yellow giver markers inside their windows, the "ODD JOB" J-card, goto,
 * markers, retry), pays at once, and levels up with completions: L1 at start, L2 after 2 runs, L3
 * after 5, L4 after 9, L5 after 14 (systems §9). A small job tin-sign on the HUD shows the job,
 * its level, counters and the cargo meter (W3).
 *
 * ================================================================ API (story.js / tests)
 *   N.sidejobs.register(def) -> def     def: {id, title, giver: {place, r}, window: {from, to, dow},
 *       when() -> bool, places: [ids that can start it], start: async (m, job) => {...}, pay: [L1..L5]}
 *   N.sidejobs.start(id, {force}) -> bool   (force: outside its window; never during a main mission)
 *   N.sidejobs.active -> {id, title, level, step, data} | null    N.sidejobs.defs
 *   N.sidejobs.level(id) 1..5 · runs(id) · earned(id) (paise) · best(id) (seconds) · why(id) -> reason | null
 *   N.sidejobs.payText(id) · LEVELS [0, 2, 5, 9, 14] · PAY (pay tables) · TUNE
 *   N.sidejobs.cargo -> {v 0..100, light} | null   (W3 cargo meter while a job carries something)
 *   N.sidejobs.lootna -> {on, kites: [...], carried}  free-roam lootna kites (Sankranti / Jan-Feb evenings)
 *   N.sidejobs.autopilot = true (tests): every step does itself (teleports, perfect throws, minigames
 *       autoplay 'win'); N.sidejobs.debugStep() does just the current step.
 * Events: 'job:start' {id, level}, 'job:done' {id, level, pay, runs}, 'job:level' {id, level},
 *   'job:fail' {id, reason}, 'job:paper' {gate, grade}, 'lootna:catch' {n}, 'cargo' {v, delta}.
 * Save section 'jobs' {runs, earned, best, wins, used}. Journal tab "Jobs" (N.menus.addJournalTab).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;

  /* ================================================================== helpers */
  const hm = (s) => { const r = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return r ? +r[1] * 60 + +r[2] : +s || 0; };
  const mins = () => (N.clock && isFinite(N.clock.minutes) ? N.clock.minutes : 720);
  const day = () => (N.clock && N.clock.day) || 0;
  const rs = (p) => { p = Math.round(p || 0); return p < 100 ? p + ' p' : '₹' + (p % 100 ? (p / 100).toFixed(2) : p / 100); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = (s) => String(s == null ? '' : s).replace(/\*([^*]+)\*/g, '$1');
  function toast(t, ms) { try { if (N.hud && N.hud.toast) N.hud.toast(t, ms || 2600); } catch (e) { /* ignore */ } }
  function sfx(name, o) { try { if (N.audio && N.audio.sfx) N.audio.sfx(name, Object.assign({ ui: true }, o || {})); } catch (e) { /* ignore */ } }
  function dow() { try { if (N.calendar && N.calendar.weekday) return N.calendar.weekday(); } catch (e) { /* stub */ } return (2 + day()) % 7; }
  function inMD(a, b) { try { if (N.calendar && N.calendar.inRange) return N.calendar.inRange(a, b); } catch (e) { /* stub */ } return false; }
  function schoolDay() { try { if (N.calendar && N.calendar.isSchoolDay) return N.calendar.isSchoolDay(); } catch (e) { /* stub */ } return dow() !== 0; }
  const isDone = (id) => { try { return !!(N.missions && N.missions.isDone && N.missions.isDone(id)); } catch (e) { return false; } };
  const respectAt = (x, y) => { try { return !!(N.respect && N.respect.at && N.respect.at(x, y)); } catch (e) { return false; } };
  function earn(paise, why) {
    if (N.shops && N.shops.earn) return N.shops.earn(paise, why);
    const p = N.player; if (!p || !(paise > 0)) return 0;
    p.money = (p.money | 0) + paise; N.emit('money', { delta: paise, total: p.money, why }); return paise;
  }
  function feed(n, o) { const p = N.player; if (p && p.feed) p.feed(n, o); }
  function posOf(t) {
    if (!t) return null;
    if (typeof t === 'string') return N.places[t] || null;
    return isFinite(t.x) && isFinite(t.y) ? t : null;
  }
  function speaker(id, name, look) {
    try { if (N.dialogue && N.dialogue.define && N.dialogue.speakers && !N.dialogue.speakers[id] && !(N.npcs && N.npcs.defs && N.npcs.defs[id])) N.dialogue.define(id, { name, look: look || { kind: 'man', age: 'adult', shirt: '#7a8fa8' } }); } catch (e) { /* ignore */ }
  }

  /* =================================================================== tuning */
  const LEVELS = [0, 2, 5, 9, 14];
  const PAY = {
    job_paper_round: { gates: [6, 8, 10, 12, 14], secs: [100, 110, 120, 125, 130], pay: [400, 500, 600, 800, 1000], perfect: 100, timeout: 100 },
    job_girni_dabbas: { dabbas: [1, 1, 2, 2, 3], per: 200, bonus: 100, secs: 90, perDay: 3 },
    job_kirana_errand: { orders: [2, 2, 3, 3, 4], pay: [300, 300, 400, 500, 600], secs: 120, bottle: 100 },
    job_raddi: { houses: [3, 4, 5, 5, 6], perKg: 200, foot: 6, cycle: 12 },
    job_lootna: { sell: 100, carry: 5 },
    job_antenna: { time: [60, 55, 50, 45, 40], per: 500 },
    job_rythu_list: { items: [3, 3, 4, 4, 5], base: 300, keep: 500 },
    job_cutout: { pay: [800, 800, 1000, 1000, 1200], secs: 150 },
    job_gully_league: { targets: [14, 17, 20, 24, 28], pay: [200, 300, 300, 400, 500], teams: ['Vidyanagar', 'Nallakunta', 'Ashok Nagar (Tiger)', 'Saidabad', 'Barkas'] },
  };
  const TUNE = { throwR: 40, perfect: 10, ok: 20, cargoBump: 8, cargoCrash: 15, cargoDrift: 3, deliverR: 16, lootnaEvery: [15, 30], lootnaH: 120, lootnaFall: [25, 40], lootnaWind: [15, 25], rivalSpeed: 70, catchR: 14, catchH: 12 };

  /* ==================================================================== state */
  const st = { runs: {}, earned: {}, best: {}, wins: 0, used: { day: -1, n: {} } };
  const J = { defs: {}, active: null, cargo: null, hud: null, autopilot: false, offer: null, ladder: null };
  function usedToday(id) { if (st.used.day !== day()) { st.used.day = day(); st.used.n = {}; } return st.used.n[id] | 0; }
  function markUsed(id) { usedToday(id); st.used.n[id] = (st.used.n[id] | 0) + 1; }
  function runs(id) { return st.runs[id] | 0; }
  function level(id) {
    if (id === 'job_gully_league') return Math.min(5, (st.wins | 0) + 1);
    const r = runs(id); let L = 1;
    for (let i = 1; i < LEVELS.length; i++) if (r >= LEVELS[i]) L = i + 1;
    return L;
  }
  function payText(id) {
    const P = PAY[id], L = level(id) - 1;
    if (!P) return '';
    switch (id) {
      case 'job_paper_round': return P.gates[L] + ' gates · ' + rs(P.pay[L]) + ' + ₹1 a perfect throw';
      case 'job_girni_dabbas': return P.dabbas[L] + (P.dabbas[L] > 1 ? ' dabbas' : ' dabba') + ' · ₹2 each';
      case 'job_kirana_errand': return P.orders[L] + ' orders · ' + rs(P.pay[L]);
      case 'job_raddi': return P.houses[L] + ' houses · ₹2 a kilo';
      case 'job_lootna': return 'sell kites at ₹1 each';
      case 'job_antenna': return '3 terraces · ₹5 an antenna';
      case 'job_rythu_list': return P.items[L] + ' items · ₹3 + what you save';
      case 'job_cutout': return rs(P.pay[L]);
      case 'job_gully_league': return st.wins >= 5 ? 'champions! a friendly match' : 'next: ' + P.teams[Math.min(4, st.wins)] + ' · target ' + P.targets[Math.min(4, st.wins)] + ' · ' + rs(P.pay[Math.min(4, st.wins)]);
      default: return '';
    }
  }

  /* ================================================================ job HUD */
  function hudEl() {
    if (J.hud) return J.hud;
    const ui = document.getElementById('ui');
    if (!ui) return null;
    const e = document.createElement('div');
    e.className = 'job-hud';
    e.innerHTML = '<div class="jh-head"><b class="jh-title"></b><span class="jh-lvl"></span></div><div class="jh-line"></div><div class="jh-cargo"><span>CARGO</span><i><b></b></i><em></em></div>';
    ui.appendChild(e);
    J.hud = e;
    return e;
  }
  function hudShow(on) { const e = hudEl(); if (e) e.classList.toggle('show', !!on); }
  function hudSet(line) {
    const e = hudEl(), A = J.active; if (!e || !A) return;
    e.querySelector('.jh-title').textContent = 'ODD JOB · ' + A.title.toUpperCase();
    e.querySelector('.jh-lvl').textContent = 'L' + A.level;
    if (line != null) e.querySelector('.jh-line').textContent = plain(line);
    const C = J.cargo, cg = e.querySelector('.jh-cargo');
    cg.style.display = C ? '' : 'none';
    if (C) { cg.querySelector('b').style.width = Math.round(C.v) + '%'; cg.querySelector('em').textContent = Math.round(C.v) + '%'; cg.classList.toggle('low', C.v < 40); }
  }

  /* ============================================================ cargo (W3) */
  function cargoStart(o) {
    o = o || {};
    J.cargo = { v: 100, light: !!o.light, mul: o.mul || 1, item: o.item || 'cargo' };
    hudSet();
  }
  function cargoHit(n, why) {
    const C = J.cargo; if (!C || n <= 0) return;
    const p = N.player, v = p && p.vehicle;
    let mul = C.mul * (C.light ? 0.5 : 1);
    if (v && v.T) { if (v.T.carrier) mul *= v.T.carrier; else if (v.T.basket) mul *= 0.7; }
    try { if (N.settings && N.settings.diff) mul *= N.settings.diff('cargoDamage') || 1; } catch (e) { /* ignore */ }
    const d = n * mul;
    C.v = Math.max(0, C.v - d);
    N.emit('cargo', { v: C.v, delta: -d, why });
    hudSet();
  }
  N.on('bump', (d) => {
    const C = J.cargo; if (!C || !d) return;
    const p = N.player, v = p && p.vehicle;
    const mine = v ? (d.a === v || d.b === v) : (d.a === p || d.b === p);
    if (!mine) return;
    const sp = +d.speed || 0;
    if (sp > 60) cargoHit(TUNE.cargoCrash, 'crash'); else if (sp > 40) cargoHit(TUNE.cargoBump, 'bump');
  });
  N.on('vehicle:pothole', (d) => { if (J.cargo && d && d.vehicle === (N.player && N.player.vehicle) && d.speed > 40) cargoHit(TUNE.cargoBump, 'pothole'); });
  N.on('vehicle:breaker', (d) => { if (J.cargo && d && d.lead && d.vehicle === (N.player && N.player.vehicle) && d.severity > 0.35) cargoHit(d.severity > 1 ? TUNE.cargoCrash : TUNE.cargoBump, 'breaker'); });
  N.on('player:fall', () => { if (J.cargo) cargoHit(TUNE.cargoCrash, 'fall'); });
  let driftWas = false;
  function cargoTick() {
    const C = J.cargo; if (!C) return;
    const v = N.player && N.player.vehicle;
    const drifting = !!(v && v.ctl && v.ctl.handbrake && Math.abs(v.speed || 0) > 90);
    if (drifting && !driftWas) cargoHit(TUNE.cargoDrift, 'drift');
    driftWas = drifting;
  }

  /* ======================================================== street spots */
  // Points on the footpath edge of colony streets and lanes: gates, houses, raddi doors.
  function streetSpots(cx, cy, rMin, rMax, n, seed, avoid) {
    const W = N.world, D = (W && W.data) || {};
    const rng = U.rng(seed);
    const near = (D.roads || []).filter((r) => (r.kind === 'street' || r.kind === 'lane') && r.pts.some((q) => Math.abs(q[0] - cx) < rMax + 200 && Math.abs(q[1] - cy) < rMax + 200));
    const out = [];
    if (!near.length) return out;
    for (let tries = 0; tries < 600 && out.length < n; tries++) {
      const r = near[(rng.next() * near.length) | 0];
      const s = (rng.next() * (r.pts.length - 1)) | 0, t = rng.next();
      const a = r.pts[s], b = r.pts[s + 1];
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const d = Math.hypot(x - cx, y - cy);
      if (d < rMin || d > rMax) continue;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), side = rng.next() < 0.5 ? 1 : -1;
      const off = (r.w || 20) / 2 + 7;
      const gx = x + Math.sin(ang) * off * side, gy = y - Math.cos(ang) * off * side;
      if (!W.isWalkable(gx, gy) || W.surfaceAt(gx, gy) === N.SURF.ROAD || respectAt(gx, gy)) continue;
      if (out.some((o) => Math.hypot(o.x - gx, o.y - gy) < 55)) continue;
      if (avoid && avoid.some((o) => Math.hypot(o.x - gx, o.y - gy) < 40)) continue;
      out.push({ x: gx, y: gy, rx: x, ry: y });
    }
    return out;
  }
  function chain(start, pts) { // nearest-neighbour order
    const left = pts.slice(), out = [];
    let cur = start;
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) { const d = Math.hypot(left[i].x - cur.x, left[i].y - cur.y); if (d < bd) { bd = d; bi = i; } }
      cur = left.splice(bi, 1)[0]; out.push(cur);
    }
    return out;
  }

  /* ====================================================== step helpers (+ autopilot) */
  function warp(x, y) {
    const p = N.player, v = p.vehicle;
    if (N.world.roofs && p.level && N.world.roofs.descend) { try { N.world.roofs.descend(p, { instant: true }); } catch (e) { /* ignore */ } }
    if (v) {
      const f = N.world.findFree(x, y, 'drive', 24) || { x, y };
      v.x = f.x; v.y = f.y; v.vx = v.vy = 0; v.okX = null; p.x = f.x; p.y = f.y;
      N.render.snapCamera(); N.render.warmChunks(f.x, f.y, 400);
    } else p.teleport(x, y);
  }
  function go(m, target, opts) {
    const p0 = posOf(target);
    if (J.autopilot && p0) warp(p0.x, p0.y);
    return m.goto(target, Object.assign({ r: TUNE.deliverR }, opts || {}));
  }
  /** Wait for ACTION near target (job priority 7). label: the ACTION text. */
  function act(m, target, label, opts) {
    opts = opts || {};
    const p0 = posOf(target);
    if (J.autopilot && p0) { warp(p0.x, p0.y); return m.wait(0.05); }
    const r = opts.r || 18;
    let pressed = false;
    J.offer = { target, label, r, use: () => { pressed = true; }, inVehicle: !!opts.inVehicle };
    return m.until(() => pressed).then((v) => { J.offer = null; return v; });
  }
  function game(m, id, params) {
    const P = Object.assign({}, params || {});
    if (J.autopilot) { P.autoplay = 'win'; P.timeScale = 4; P.skipHowto = true; }
    return m.minigame(id, P);
  }
  function talk(m, lines) { return m.talk(lines.map((l) => ({ s: l[0], t: l[1] }))); }

  /* ============================================================ registration */
  function register(def) {
    if (!def || !def.id || typeof def.start !== 'function') { N.err('sidejobs.register', new Error('bad job ' + (def && def.id))); return null; }
    J.defs[def.id] = def;
    if (def.ambient) return def;
    const tryReg = () => {
      if (!N.missions || !N.missions.register) return;
      N.missions.register({
        id: def.id, kind: 'job', title: def.title, chapter: 'Odd job', giver: def.giver || null, window: def.window || null,
        autosave: false, help: false, color: '#f2c230',
        when: () => !why(def.id, true),
        passText: def.title,
        onPass: () => { try { if (N.missions.done) N.missions.done.delete(def.id); } catch (e) { /* ignore */ } },
        script: (m) => runJob(def, m),
      });
    };
    tryReg();
    return def;
  }
  /** Why a job can't start now (null = it can). gate = true: the giver-marker check (window aside). */
  function why(id, gate) {
    const def = J.defs[id];
    if (!def) return 'No such job';
    if (N.missions && N.missions.active && N.missions.active.id !== id) return 'Finish what you are doing first';
    if (def.requires) { let ok = true; try { ok = def.requires(); } catch (e) { ok = false; } if (!ok) return def.requiresWhy || 'Not yet'; }
    if (def.perDay && usedToday(id) >= def.perDay) return def.perDay > 1 ? 'Enough for today (' + def.perDay + ' runs a day)' : 'Once a day. Come back tomorrow.';
    if (!gate && def.window) {
      const w = def.window, a = hm(w.from), b = hm(w.to), m = mins();
      if (w.dow && w.dow.indexOf(dow()) < 0) return def.dowWhy || 'Not today';
      if (!(a <= b ? m >= a && m < b : m >= a || m < b)) return 'Come back at ' + w.from;
    }
    if (def.when) { let ok = true; try { ok = def.when(); } catch (e) { ok = false; } if (!ok) return def.whenWhy || 'Not now'; }
    return null;
  }
  function start(id, o) {
    o = o || {};
    const def = J.defs[id];
    if (!def) return false;
    if (N.missions && N.missions.active) return false;
    if (!o.force) { const w = why(id); if (w) { toast(plain(w)); return false; } }
    if (def.ambient) return def.start(null, o);
    if (!N.missions || !N.missions.start) return false;
    try { if (N.missions.done) N.missions.done.delete(id); } catch (e) { /* ignore */ }
    return N.missions.start(id);
  }
  async function runJob(def, m) {
    const L = level(def.id);
    J.active = { id: def.id, title: def.title, level: L, step: 'start', data: {}, t0: N.time.now, m };
    N.emit('job:start', { id: def.id, level: L });
    hudShow(true); hudSet(payText(def.id));
    let pay = 0;
    try {
      pay = (await def.start(m, J.active)) | 0;
      finish(def, m, pay);
    } finally {
      if (J.active && J.active.m === m) { J.active = null; J.offer = null; endCargo(); hudShow(false); if (N.hud) N.hud.timer(null); if (N.player) N.player.noRun = false; }
    }
  }
  function endCargo() { J.cargo = null; }
  function finish(def, m, pay) {
    const id = def.id, before = level(id);
    st.runs[id] = runs(id) + 1;
    markUsed(id);
    if (pay > 0) { earn(pay, 'job:' + id); st.earned[id] = (st.earned[id] | 0) + pay; }
    const secs = Math.round(N.time.now - J.active.t0);
    if (!(st.best[id] > 0) || secs < st.best[id]) st.best[id] = secs;
    const after = level(id);
    m.def.passText = def.title + (pay ? ' · ' + rs(pay) : '') + ' · job level ' + after;
    N.emit('job:done', { id, level: after, pay, runs: runs(id) });
    if (after > before) { N.emit('job:level', { id, level: after }); setTimeout(() => toast(def.title + ': level ' + after + '! ' + payText(id), 3200), 2600); }
  }

  /* ===================================================================== jobs */
  // 1. Paper boy (kirana_2's newspaper agent, 05:30–07:00): the paper throw (systems §8.21)
  register({
    id: 'job_paper_round', title: 'Paper Round', giver: { place: 'kirana_2', r: 16 }, window: { from: '05:30', to: '07:00' }, perDay: 1,
    start: async (m, A) => {
      const P = PAY.job_paper_round, L = A.level - 1;
      speaker('paper_agent', 'Paper agent', { kind: 'man', age: 'old', moustache: true, shirt: '#e8e2cc' });
      const k2 = N.places.kirana_2;
      await talk(m, [['paper_agent', 'Bundle is ready. ' + P.gates[L] + ' gates, ' + P.secs[L] + ' seconds. Throw it on the doorstep, not in the drain.'], ['you', 'Doorstep. Not drain. *Pakka.*']]);
      const p = N.player;
      if (!(p.vehicle && p.vehicle.T && p.vehicle.T.cls === 'bike')) {
        const f = N.world.findFree(k2.x + 16, k2.y + 14, 'drive', 20) || k2;
        const cyc = m.vehicle('cycle', f.x, f.y, 0, { color: '#2a2a30', label: "the agent's cycle" });
        m.objective('Take the agent\'s old cycle.');
        if (J.autopilot && cyc) N.vehicles.enter(p, cyc, { quiet: true });
        await m.until(() => p.vehicle && p.vehicle.T && p.vehicle.T.cls === 'bike');
      }
      const gates = chain(k2, streetSpots(k2.x, k2.y, 80, 700, P.gates[L], 'paper:' + day(), null));
      A.data = { gates, done: 0, perfect: 0, left: P.secs[L], timeUp: false };
      gates.forEach((g, i) => { g.mk = m.marker(g, { r: 8, color: '#f2c230' }); g.bl = m.blip(g, { color: '#f2c230', icon: 'square', pulse: false, route: false, id: 'paper:' + i }); });
      m.objective('Throw the papers! (ACTION near a gate, left or right)');
      m.checkpoint('round');
      A.step = 'throw';
      if (J.autopilot) { for (const g of gates) { warp(g.rx, g.ry); throwPaper(g, true); await m.wait(0.02); } }
      await m.until(() => A.data.done >= gates.length || A.data.timeUp);
      const D = A.data;
      const pay = D.timeUp && D.done < gates.length ? D.done * P.timeout : P.pay[L] + D.perfect * P.perfect;
      await talk(m, [['paper_agent', D.timeUp && D.done < gates.length ? 'Half job, half pay. ' + D.done + ' gates.' : 'All delivered! ' + D.perfect + ' perfect. *Shabash.*']]);
      return pay;
    },
    tick: (A, dt) => {
      const D = A.data; if (!D || A.step !== 'throw') return;
      D.left -= dt;
      if (N.hud) N.hud.timer('PAPERS', Math.max(0, D.left), { countdown: false });
      if (D.left <= 0) D.timeUp = true;
      hudSet('Gates ' + D.done + '/' + D.gates.length + ' · perfect ' + D.perfect);
      const p = N.player, v = p.vehicle;
      if (!v) return;
      let best = null, bd = TUNE.throwR;
      for (const g of D.gates) { if (g.done) continue; const d = Math.hypot(g.x - p.x, g.y - p.y); if (d < bd) { bd = d; best = g; } }
      if (best) N.interact.offer({ label: 'Throw paper', priority: 7, dist: bd, use: () => throwPaper(best, false) });
    },
  });
  function throwPaper(g, perfect) {
    const A = J.active; if (!A || !A.data || g.done) return;
    const p = N.player, v = p.vehicle;
    const sp = v ? Math.abs(v.speed || 0) : 0;
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    const err = perfect ? 0 : sp * 0.07 + d * 0.18 + Math.random() * 6;
    const grade = err <= TUNE.perfect ? 'perfect' : err <= TUNE.ok ? 'ok' : 'miss';
    const ang = Math.atan2(g.y - p.y, g.x - p.x) + (Math.random() - 0.5) * (perfect ? 0 : 0.5);
    const land = { x: p.x + Math.cos(ang) * (d + (grade === 'miss' ? 14 : 0)), y: p.y + Math.sin(ang) * (d + (grade === 'miss' ? 14 : 0)) };
    J.papers.push({ x0: p.x, y0: p.y, x1: land.x, y1: land.y, t: 0 });
    sfx('paper', { x: p.x, y: p.y });
    N.emit('job:paper', { gate: g, grade });
    if (grade === 'miss') { toast('*Arre!* Paper in the drain!', 1600); return; }
    g.done = true; A.data.done++;
    if (grade === 'perfect') { A.data.perfect++; toast('Perfect! On the doorstep. (+₹1)', 1400); if (Math.random() < 0.3) sfx('dog_bark', { x: g.x, y: g.y, vol: 0.5 }); }
    else toast('Delivered.', 1000);
    try { A.m.unmarker(g.mk); A.m.unblip(g.bl); } catch (e) { /* ignore */ }
  }

  // 2. Girni dabbas (any pindi_girni_*, 09:00–18:00, up to 3 runs a day)
  register({
    id: 'job_girni_dabbas', title: 'Girni Dabbas', giver: { place: 'pindi_girni_1', r: 16 }, window: { from: '09:00', to: '18:00' }, perDay: 3,
    when: () => !(N.flags && N.flags.power_cut), whenWhy: 'Power cut. The belt is still.',
    start: async (m, A) => {
      const P = PAY.job_girni_dabbas, L = A.level - 1, n = P.dabbas[L];
      const g = nearestOf('pindi_girni_') || N.places.pindi_girni_1;
      await talk(m, [['ramulu', '*Dabba* ready, warm from the stones. ' + (n > 1 ? n + ' houses today.' : 'One house.') + ' Don\'t race, the flour flies.']]);
      const houses = chain(g, streetSpots(g.x, g.y, 300, 800, n, 'girni:' + day() + ':' + runs('job_girni_dabbas'), null));
      cargoStart({ item: 'atta' });
      let pay = 0;
      for (let i = 0; i < houses.length; i++) {
        const h = houses[i];
        A.data = { left: P.secs, i, n: houses.length };
        A.step = 'carry';
        hudSet('Dabba ' + (i + 1) + '/' + houses.length + ' · 90 s');
        const t0 = N.time.now;
        await go(m, h, { label: 'Deliver the flour dabba (' + (i + 1) + '/' + houses.length + ')', r: TUNE.deliverR });
        const late = N.time.now - t0 > P.secs;
        const C = J.cargo ? J.cargo.v : 100;
        if (C < 40) { m.toast('*Atta* on the road? The crows will be very happy.'); }
        else if (late) m.toast('Late! "The rotis are already made, *beta*."');
        else { pay += P.per + (C >= 90 ? P.bonus : 0); m.toast('Delivered' + (C >= 90 ? ', not a speck spilled! +₹1' : '.')); }
        if (J.cargo) J.cargo.v = 100;
      }
      endCargo();
      if (A.level >= 4) { feed(15); m.toast('Ramulu adds a tender coconut. Tummy +15.'); }
      return pay;
    },
    tick: (A) => { if (A.step === 'carry' && A.data && N.hud) { A.data.left = Math.max(0, A.data.left - (N.time.dt || 0)); N.hud.timer('DABBA', A.data.left, { countdown: false }); } },
  });
  function nearestOf(prefix) {
    const p = N.player; let best = null, bd = Infinity;
    for (const id in N.places) { if (id.indexOf(prefix) !== 0) continue; const q = N.places[id]; const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
    return best;
  }

  // 3. Kirana errands (kirana_1, any kirana from L3; 10:00–19:00)
  register({
    id: 'job_kirana_errand', title: 'Kirana Errands', giver: { place: 'kirana_1', r: 16 }, window: { from: '10:00', to: '19:00' },
    start: async (m, A) => {
      const P = PAY.job_kirana_errand, L = A.level - 1, n = P.orders[L];
      const k = (A.level >= 3 && nearestOf('kirana_')) || N.places.kirana_1;
      const ITEMS = [['rice bag', true], ['oil tin', false], ['soap box', false], ['dal packet', false]];
      await talk(m, [['agarwal', n + ' orders, two minutes. Rice bag is heavy, don\'t run with it. Bottles on the way? Pick up. Your rupee.']]);
      const houses = chain(k, streetSpots(k.x, k.y, 90, 420, n, 'errand:' + day() + ':' + runs('job_kirana_errand'), null));
      houses.forEach((h, i) => { h.item = ITEMS[i % ITEMS.length]; h.mk = m.marker(h, { r: 12, color: '#f2c230' }); h.bl = m.blip(h, { color: '#f2c230', icon: 'square', label: h.item[0] }); });
      const bottles = streetSpots(k.x, k.y, 60, 380, 1 + (Math.random() < 0.5 ? 1 : 0), 'bottle:' + day(), houses);
      bottles.forEach((b) => { b.mk = m.marker(b, { r: 6, color: '#6fbf5a' }); });
      A.data = { houses, bottles, left: P.secs, done: 0 };
      A.step = 'errands';
      N.player.noRun = houses.some((h) => h.item[1]);
      m.objective('Deliver the orders (' + houses.map((h) => h.item[0]).join(', ') + ')');
      if (J.autopilot) for (const h of houses) { warp(h.x, h.y); await m.wait(0.05); }
      await m.until(() => A.data.done >= houses.length || A.data.left <= 0);
      N.player.noRun = false;
      const full = A.data.done >= houses.length;
      if (!full) m.toast('Time up! Agarwal-ji pays for what reached.');
      return Math.round((P.pay[L] * A.data.done) / houses.length);
    },
    tick: (A, dt) => {
      const D = A.data; if (!D || A.step !== 'errands') return;
      D.left -= dt;
      if (N.hud) N.hud.timer('ORDERS', Math.max(0, D.left), { countdown: false });
      const p = N.player;
      for (const h of D.houses) {
        if (h.done || Math.hypot(h.x - p.x, h.y - p.y) > TUNE.deliverR) continue;
        h.done = true; D.done++;
        try { A.m.unmarker(h.mk); A.m.unblip(h.bl); } catch (e) { /* ignore */ }
        toast('Delivered: ' + h.item[0] + '.', 1400);
        N.player.noRun = D.houses.some((q) => !q.done && q.item[1]);
      }
      for (const b of D.bottles) {
        if (b.done || Math.hypot(b.x - p.x, b.y - p.y) > 12) continue;
        b.done = true; earn(PAY.job_kirana_errand.bottle, 'bottle');
        try { A.m.unmarker(b.mk); } catch (e) { /* ignore */ }
        toast('An empty bottle! +₹1', 1400);
      }
      hudSet('Orders ' + D.done + '/' + D.houses.length);
    },
  });

  // 4. Raddi round (the raddi-wala's pushcart at the playground_1 gate, Sundays 10:00–13:00)
  register({
    id: 'job_raddi', title: 'Raddi Round', giver: { place: 'playground_1', r: 16 }, window: { from: '10:00', to: '13:00', dow: [0] }, dowWhy: 'Sundays only', perDay: 1,
    start: async (m, A) => {
      const P = PAY.job_raddi, L = A.level - 1, n = P.houses[L];
      speaker('raddi_wala', 'Raddi-wala', { kind: 'man', age: 'old', moustache: true, cap: 'gandhi', shirt: '#d8d0b8' });
      const cart = N.places.playground_1;
      await talk(m, [['raddi_wala', '*Raddi! Paper raddi!* ' + n + ' houses have kept bundles. Two rupees a kilo. Over six kilo on foot? Walk slow. Cycle carrier takes twelve.']]);
      const houses = chain(cart, streetSpots(cart.x, cart.y, 90, 520, n, 'raddi:' + day(), null));
      const rng = U.rng('raddi-kg:' + day());
      houses.forEach((h) => { h.kg = 2 + Math.floor(rng.next() * 3); h.mk = m.marker(h, { r: 10, color: '#f2c230' }); });
      A.data = { houses, kg: 0, sold: 0, got: 0 };
      A.step = 'collect';
      let pay = 0;
      while (A.data.got < houses.length || A.data.kg > 0) {
        const cap = N.player.vehicle && N.player.vehicle.T && N.player.vehicle.T.pedal ? P.cycle : 99;
        const next = houses.find((h) => !h.done && A.data.kg + h.kg <= cap);
        if (next) {
          await go(m, next, { label: 'Collect the old newspapers (' + (A.data.got + 1) + '/' + houses.length + ')', r: TUNE.deliverR });
          next.done = true; A.data.got++; A.data.kg += next.kg;
          try { m.unmarker(next.mk); } catch (e) { /* ignore */ }
          m.toast('+' + next.kg + ' kg of raddi.' + (Math.random() < 0.25 ? ' ' + raddiBonus() : ''));
          N.player.noRun = !N.player.vehicle && A.data.kg > P.foot;
          hudSet('Raddi ' + A.data.kg + ' kg · houses ' + A.data.got + '/' + houses.length);
          continue;
        }
        await go(m, cart, { label: 'Weigh the raddi at the cart (' + A.data.kg + ' kg)', r: 22 });
        pay += A.data.kg * P.perKg; A.data.sold += A.data.kg; A.data.kg = 0; N.player.noRun = false;
        m.toast('The scale swings. ' + A.data.sold + ' kg so far.');
      }
      await talk(m, [['raddi_wala', A.data.sold + ' kilo! Good collection. *Raddi! Paper raddi!*']]);
      return pay;
    },
  });
  function raddiBonus() {
    if (Math.random() < 0.5) {
      const f = N.shops && N.shops.fortune ? N.shops.fortune(N.player.x, N.player.y) : '';
      return f ? 'A goli tip scribbled in the margin: ' + f.replace(/^Your fortune: [^.]*\. /, '') : 'An old comic inside!';
    }
    N.emit('trivia', { source: 'raddi' });
    return 'An old comic inside! (A page of trivia.)';
  }

  // 5. Kite lootna (free roam: 13–15 Jan all day; 1 Jan–15 Feb 16:30–18:30)
  const LT = { on: true, kites: [], rivals: [], nextT: 8, forced: false };
  function lootnaWindow() {
    if (N.flags && N.flags.sankranti) return true;
    const m = mins();
    return inMD('01-13', '01-15') || (inMD('01-01', '02-15') && m >= hm('16:30') && m < hm('18:30'));
  }
  function colonyAt(x, y) { try { const d = N.world.districtAt(x, y); return !!(d && (d.style === 'colony' || d.style === 'oldcity')); } catch (e) { return false; } }
  function spawnKite(near) {
    const p = N.player, W = N.world;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * TAU, r = near ? 60 + Math.random() * 80 : 160 + Math.random() * 380;
      let x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      const f = W.findFree(x, y, 'walk', 20);
      if (!f) continue;
      x = f.x; y = f.y;
      if (W.surfaceAt(x, y) === N.SURF.ROAD && Math.random() < 0.6) continue;
      if (!near && !colonyAt(x, y)) continue;
      if (respectAt(x, y) || (W.roofs && W.roofs.at && W.roofs.at(x, y))) continue;
      const dur = TUNE.lootnaFall[0] + Math.random() * (TUNE.lootnaFall[1] - TUNE.lootnaFall[0]);
      const wind = (TUNE.lootnaWind[0] + Math.random() * (TUNE.lootnaWind[1] - TUNE.lootnaWind[0]));
      const wa = 0.6 + Math.random() * 0.6; // the wind blows roughly south-east
      const kite = { x1: x, y1: y, dur: near ? Math.min(dur, 14) : dur, t: 0, wx: Math.cos(wa) * wind, wy: Math.sin(wa) * wind, col: ['#e2542b', '#f2c230', '#2f6fb0', '#2a8c82', '#c8236a'][(Math.random() * 5) | 0], id: Math.random() };
      kite.x = x - kite.wx * kite.dur; kite.y = y - kite.wy * kite.dur; kite.h = TUNE.lootnaH;
      LT.kites.push(kite);
      // 2-3 rival kids start running for it from further away
      const nr = near ? 1 : 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < nr; i++) {
        const ra = Math.random() * TAU, rr = 260 + Math.random() * 120;
        const s = W.findFree(x + Math.cos(ra) * rr, y + Math.sin(ra) * rr, 'walk', 30);
        if (s && !N.render.inView(s.x, s.y, 20)) LT.rivals.push(new Rival(s.x, s.y, kite));
      }
      return kite;
    }
    return null;
  }
  class Rival extends N.Actor {
    constructor(x, y, kite) {
      super({ kind: 'ped', x, y, r: 3.2, mass: 1, solid: true });
      this.kite = kite; this.look = N.people.randomLook(null, 'kid'); this.anim = { phase: 0, speed: 0, run: true }; this.t = 0;
      N.entities.add(this);
    }
    update(dt) {
      this.t += dt;
      const k = this.kite;
      if (!k || k.gone) { this.alive = this.t < 20 || N.render.inView(this.x, this.y, 30); this.vx *= 0.9; this.vy *= 0.9; return; }
      const a = Math.atan2(k.y1 - this.y, k.x1 - this.x), d = Math.hypot(k.x1 - this.x, k.y1 - this.y);
      // they only sprint once the kite is low
      const sp = k.h < 70 ? TUNE.rivalSpeed : 38;
      this.angle = a;
      this.vx = Math.cos(a) * Math.min(sp, d * 3); this.vy = Math.sin(a) * Math.min(sp, d * 3);
      const c = N.world.collide(this.x + this.vx * dt, this.y + this.vy * dt, this.r, 'walk');
      this.x = c.x; this.y = c.y;
      this.anim.speed = Math.min(1, Math.hypot(this.vx, this.vy) / 45); this.anim.phase += Math.hypot(this.vx, this.vy) * dt * 0.2;
      // a grab needs the same thing Chinnu needs: be under the shadow when it is low (autopilot: tests only)
      if (k.h < TUNE.catchH && !k.gone && !J.autopilot && Math.hypot(k.x - this.x, k.y - this.y) < 8) { k.gone = 'rival'; toast('The Ashok Nagar boys grabbed it! *Lootna* is war.', 2000); }
    }
    draw() {
      const R = N.render, D = N.draw, s = this;
      R.queue('shadow', 0, () => D.shadow(s.x, s.y, 6, 8, s.angle, 1.4));
      R.queue('actors', this.y, () => D.sprite(s.x, s.y, s.angle, 7, (g) => N.people.draw(g, s.look, s.anim)));
    }
  }
  function lootnaTick(dt) {
    const p = N.player;
    const active = LT.on && !(N.flags && N.flags.mg_side_off) && (lootnaWindow() || LT.forced) && !(N.missions && N.missions.active);
    if (active && !p.vehicle) {
      LT.nextT -= dt;
      if (LT.nextT <= 0 && LT.kites.length < 2) { LT.nextT = TUNE.lootnaEvery[0] + Math.random() * (TUNE.lootnaEvery[1] - TUNE.lootnaEvery[0]); if (colonyAt(p.x, p.y) || LT.forced) spawnKite(false); }
    }
    for (let i = LT.kites.length - 1; i >= 0; i--) {
      const k = LT.kites[i];
      k.t += dt;
      const f = Math.min(1, k.t / k.dur);
      k.h = TUNE.lootnaH * (1 - f) * (1 - f * 0.15);
      k.x = k.x1 - k.wx * (k.dur - Math.min(k.t, k.dur)); k.y = k.y1 - k.wy * (k.dur - Math.min(k.t, k.dur));
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (J.autopilot && k.h < TUNE.catchH + 20 && !k.gone && !p.vehicle) { p.teleport(k.x, k.y); }
      if (!k.gone && k.h < TUNE.catchH && d < TUNE.catchR && !p.vehicle) catchKite(k);
      if (k.gone || k.t > k.dur + 6) { LT.kites.splice(i, 1); if (!k.gone && Math.hypot(k.x1 - p.x, k.y1 - p.y) < 300) toast('The kite settles in a tree. Gone.', 1600); }
    }
    for (let i = LT.rivals.length - 1; i >= 0; i--) if (!LT.rivals[i].alive) LT.rivals.splice(i, 1);
  }
  function catchKite(k) {
    k.gone = 'me';
    const n = N.player.addItem ? N.player.itemCount('lootna_kite') : 0;
    if (n >= PAY.job_lootna.carry) { toast('Your hands are full of kites! Sell some at a kite stall.', 2000); return; }
    if (N.player.addItem) N.player.addItem('lootna_kite', 1);
    sfx('kite_wind'); sfx('pickup', { delay: 0.1 });
    toast('*Lootna!* A cut kite, yours. (' + (n + 1) + '/' + PAY.job_lootna.carry + ' · ₹1 each at a kite stall)', 2200);
    const id = 'job_lootna', before = level(id);
    st.runs[id] = runs(id) + 1;
    N.emit('lootna:catch', { n: n + 1 });
    N.emit('job:done', { id, level: level(id), pay: 0, runs: runs(id) });
    if (level(id) > before) N.emit('job:level', { id, level: level(id) });
  }
  register({
    id: 'job_lootna', title: 'Kite Lootna', ambient: true, when: () => lootnaWindow(), whenWhy: 'Kites fall on Sankranti, and on January evenings 16:30–18:30',
    start: (m, o) => { LT.forced = !!(o && o.force) || LT.forced; const k = spawnKite(true); if (k) toast('A cut kite is falling nearby! Get under its shadow.', 2400); return !!k; },
  });
  function drawLootna() {
    const R = N.render, D = N.draw;
    for (const k of LT.kites) {
      if (!R.inView(k.x, k.y, 60)) continue;
      R.queue('ground', 2, (ctx) => {
        const kk = R.k(0), X = R.sx(k.x, kk), Y = R.sy(k.y, kk), s = (3 + (1 - k.h / TUNE.lootnaH) * 5) * kk;
        ctx.fillStyle = 'rgba(20,10,30,' + (0.18 + 0.3 * (1 - k.h / TUNE.lootnaH)).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(X, Y - s); ctx.lineTo(X + s * 0.8, Y); ctx.lineTo(X, Y + s); ctx.lineTo(X - s * 0.8, Y); ctx.closePath(); ctx.fill();
      });
      R.queue('sky', 0, (ctx) => {
        const kk = R.k(k.h), X = R.sx(k.x + k.h * 0.15, kk), Y = R.sy(k.y - k.h * 0.25, kk), s = 6 * kk;
        const sw = Math.sin(N.time.real * 3 + k.id * 10) * 0.35;
        ctx.save(); ctx.translate(X, Y); ctx.rotate(sw);
        ctx.fillStyle = k.col; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.75, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.75, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#1a1214'; ctx.lineWidth = Math.max(1, kk * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.moveTo(-s * 0.75, 0); ctx.lineTo(s * 0.75, 0); ctx.stroke();
        ctx.strokeStyle = 'rgba(240,240,240,0.7)'; ctx.beginPath(); ctx.moveTo(0, s); ctx.quadraticCurveTo(s * 1.5, s * 2.5, -s * 0.5, s * 4); ctx.stroke();
        ctx.restore();
      });
    }
  }

  // 6. Antenna jobs (Cable Babji near kirana_3, after M4, 17:00–20:00): 3 walled terraces
  register({
    id: 'job_antenna', title: 'Antenna Jobs', giver: { place: 'kirana_3', r: 16 }, window: { from: '17:00', to: '20:00' }, perDay: 1,
    requires: () => isDone('last_man_batting') || !!(N.flags && (N.flags.antenna_jobs || N.flags.unlock_antenna_jobs)), requiresWhy: 'Cable Babji needs a helper after the World Cup final',
    start: async (m, A) => {
      const P = PAY.job_antenna, L = A.level - 1;
      await talk(m, [['cable_babji', A.level >= 5 ? '*Ustad!* Three terraces. You know the tower: Ramanthapur, the red light.' : 'Three terraces. Turn the antenna to the tower. *Thoda left... thoda right... AARA!*']]);
      const RF = N.world.roofs;
      const k3 = N.places.kirana_3;
      let roofs = RF && RF.byTag ? RF.byTag('antenna').slice() : [];
      roofs.sort((a, b) => Math.hypot(a.rect[0] - k3.x, a.rect[1] - k3.y) - Math.hypot(b.rect[0] - k3.x, b.rect[1] - k3.y));
      roofs = roofs.slice(0, 3);
      let pay = 0;
      for (let i = 0; i < roofs.length; i++) {
        const r = roofs[i], s = r.stairs && r.stairs[0];
        const foot = s && s.place && N.places[s.place] ? s.place : s ? { x: s.x, y: s.y } : { x: r.rect[0] + r.rect[2] / 2, y: r.rect[1] + r.rect[3] / 2 };
        A.step = 'roof'; hudSet('Terrace ' + (i + 1) + '/3 · ' + r.name);
        if (J.autopilot && RF.climb) { RF.climb(r.id, 0, N.player, { instant: true }); }
        else {
          await go(m, foot, { label: 'Climb to the terrace: ' + r.name + ' (' + (i + 1) + '/3)', r: 18 });
          m.objective('Up the stairs to the terrace (' + (i + 1) + '/3)');
          await m.until(() => !RF.onRoof || RF.onRoof(N.player) === r.id);
        }
        const res = await game(m, 'antenna', { time: P.time[L], caller: 'babji', difficulty: 0.3 + L * 0.08, intro: 'Cable Babji shouts from the street: *thoda left... thoda right...*' });
        if (res && res.win) { pay += P.per; m.toast('Picture clear! +₹5.'); } else m.toast('*Signal gaya!* No money for this one.');
        if (RF.descend && RF.onRoof && RF.onRoof(N.player)) RF.descend(N.player, { instant: true });
      }
      return pay;
    },
  });

  // 7. Rythu list (an aunty at the gate of any rythu_bazaar_*, 07:00–12:00)
  register({
    id: 'job_rythu_list', title: 'Rythu Bazaar List', giver: { place: 'rythu_bazaar_erragadda', r: 18 }, window: { from: '07:00', to: '12:00' }, perDay: 1,
    places: ['rythu_bazaar_mehdipatnam', 'rythu_bazaar_erragadda', 'rythu_bazaar_saroornagar'],
    start: async (m, A) => {
      const P = PAY.job_rythu_list, L = A.level - 1, n = P.items[L];
      const VEG = [['tomatoes', 6], ['onions', 8], ['potatoes', 7], ['brinjal', 6], ['beans', 9]];
      const list = VEG.slice(0, n), listRs = list.reduce((s, v) => s + v[1], 0);
      const bz = nearestOf('rythu_bazaar_') || N.places.rythu_bazaar_erragadda;
      await talk(m, [['aunty', 'My knees, *beta*. ' + list.map((v) => v[0]).join(', ') + ', one kilo each. Here, ₹' + (listRs + 2) + '. Bring the change. Bargain if you can; what you save, you keep. Five rupees, not more!']]);
      const home = streetSpots(bz.x, bz.y, 260, 520, 1, 'rythu-home:' + day(), null)[0] || bz;
      A.step = 'buy';
      await act(m, bz, 'Buy the list', { r: Math.max(20, (bz.r || 30)) });
      let price = listRs;
      if (N.minigames && N.minigames.play) {
        const r = await game(m, 'bargain', { who: 'farmer', list: listRs, what: 'the list: ' + list.map((v) => v[0]).join(', ') });
        if (r && r.win && r.price) price = Math.min(listRs, r.price);
      }
      const saved = Math.max(0, listRs - price);
      m.toast('Bag packed. ' + (saved ? 'You saved ₹' + saved + '!' : 'List price.') + ' Carry it gently, tomatoes bruise.');
      cargoStart({ item: 'vegetables', mul: list.some((v) => v[0] === 'tomatoes') ? 1.3 : 1 });
      A.step = 'carry';
      const hm2 = m.marker(home, { r: 14 });
      await go(m, home, { label: "Take the bag to the aunty's house", r: TUNE.deliverR });
      m.unmarker(hm2);
      const C = J.cargo ? J.cargo.v : 100;
      endCargo();
      let pay = P.base + Math.min(P.keep, saved * 100);
      if (C < 60) { pay = Math.max(0, pay - 100); await talk(m, [['aunty', 'Tomatoes are bruised. Who sat on them? ...One rupee less.']]); }
      else await talk(m, [['aunty', 'Change also correct! *Manchi abbayi.* Take this.']]);
      return pay;
    },
  });

  // 8. Cut-out helper (Bomma-uncle at sudarshan_theatre, Thursdays 14:00–18:00)
  register({
    id: 'job_cutout', title: 'Cut-out Helper', giver: { place: 'sudarshan_theatre', r: 18 }, window: { from: '14:00', to: '18:00', dow: [4] }, dowWhy: 'Thursdays only (before the Friday releases)', perDay: 1,
    start: async (m, A) => {
      const P = PAY.job_cutout, L = A.level - 1;
      await talk(m, [['painter', 'Friday release, hero has no moustache yet! Poster colours from the stationery, brushes from the kirana, chai from the café. Hundred and fifty seconds. Go!']]);
      const stops = [['stationery_2', 'poster colours'], ['kirana_4', 'brushes'], ['irani_cafe_8', 'chai']].filter((s) => N.places[s[0]]);
      A.data = { left: P.secs, got: 0, n: stops.length };
      A.step = 'fetch';
      const marks = stops.map((s) => ({ s, mk: m.marker(s[0], { r: 18, color: '#f2c230' }), bl: m.blip(s[0], { color: '#f2c230', icon: 'square', label: s[1] }) }));
      m.objective('Fetch ' + stops.map((s) => s[1]).join(', ') + ' (any order)');
      const got = (mk) => { mk.done = true; A.data.got++; m.unmarker(mk.mk); m.unblip(mk.bl); toast('Got the ' + mk.s[1] + '.', 1400); };
      if (J.autopilot) for (const mk of marks) { const q = N.places[mk.s[0]]; warp(q.x, q.y); await m.wait(0.05); got(mk); }
      await m.until(() => {
        const p = N.player;
        for (const mk of marks) { if (mk.done) continue; const q = N.places[mk.s[0]]; if (Math.hypot(q.x - p.x, q.y - p.y) < (q.r || 18) + 12) got(mk); }
        return A.data.got >= marks.length || A.data.left <= 0;
      });
      const late = A.data.left <= 0;
      A.step = 'ladder';
      await go(m, 'sudarshan_theatre', { label: 'Back to Bomma-uncle\'s scaffold', r: 40 });
      m.objective('Hold the ladder! Press ACTION when the needle is in the green.');
      const tries = await ladder(m);
      let pay = P.pay[L];
      if (late) pay = Math.round(pay / 2);
      if (A.level >= 3 && N.flags) N.flags.cutout_moustache = true;
      await talk(m, [['painter', (late ? 'Late, but okay. ' : '') + (A.level >= 3 ? 'You paint the moustache today. Steady hand! ' : '') + 'Ladder held in ' + tries + ' tries. Hero is ready for Friday.']]);
      return pay;
    },
    tick: (A, dt) => { if (A.step === 'fetch' && A.data) { A.data.left -= dt; if (N.hud) N.hud.timer('FETCH', Math.max(0, A.data.left), { countdown: false }); hudSet('Fetched ' + A.data.got + '/' + A.data.n); } else if (A.step !== 'fetch' && N.hud && A.data && A.data.left != null) { N.hud.timer(null); A.data.left = null; } },
  });
  // the wobbling-ladder timing strip (3 good presses; a miss just wobbles more)
  function ladder(m) {
    if (J.autopilot) return Promise.resolve(3);
    const ui = document.getElementById('ui');
    const el = document.createElement('div');
    el.className = 'job-ladder';
    el.innerHTML = '<b>HOLD THE LADDER</b><div class="jl-arc"><i class="jl-green"></i><i class="jl-needle"></i></div><span class="jl-n">0 / 3</span>';
    if (ui) ui.appendChild(el);
    const L = J.ladder = { t: 0, good: 0, tries: 0, el, speed: 1.6 };
    N.player.controlsLocked = true;
    return m.until(() => L.good >= 3).then(() => { N.player.controlsLocked = false; el.remove(); J.ladder = null; return L.tries; }, (e) => { N.player.controlsLocked = false; el.remove(); J.ladder = null; throw e; });
  }
  function ladderTick(dt) {
    const L = J.ladder; if (!L) return;
    L.t += dt * L.speed;
    const x = Math.sin(L.t * 2.2) * 0.9 + Math.sin(L.t * 3.7) * 0.1;
    const nd = L.el.querySelector('.jl-needle'); if (nd) nd.style.left = (50 + x * 48) + '%';
    const I = N.input;
    if (I && I.pressed('action')) {
      I.consume('action');
      L.tries++;
      if (Math.abs(x) < 0.2) { L.good++; sfx('ui_select'); L.speed *= 1.12; } else { sfx('bump'); L.el.classList.remove('wob'); void L.el.offsetWidth; L.el.classList.add('wob'); }
      L.el.querySelector('.jl-n').textContent = L.good + ' / 3';
    }
  }

  // 9. Gully league (captains at playground_*; school days 16:00–18:30, holidays 08:00–18:30)
  register({
    id: 'job_gully_league', title: 'Gully League', giver: { place: 'playground_1', r: 18 }, window: { from: '08:00', to: '18:30' }, perDay: 1,
    places: Object.keys(N.places || {}).filter((id) => /^playground_\d+$/.test(id)),
    when: () => !schoolDay() || mins() >= hm('16:00'), whenWhy: 'After school: 16:00 to 18:30',
    start: async (m, A) => {
      const P = PAY.job_gully_league, i = Math.min(4, st.wins), team = P.teams[i];
      speaker('captain', 'Colony captain', { kind: 'kid', age: 'kid', cap: 'cricket', shirt: '#2f6fb0' });
      await talk(m, [['captain', st.wins >= 5 ? 'Champions play a friendly. Barkas wants revenge.' : 'League match! Today: ' + team + '. Target ' + P.targets[i] + '. Owner of the ball bats first.']]);
      const r = await game(m, 'cricket', { target: P.targets[i], difficulty: 0.3 + i * 0.1, intro: 'Gully league vs ' + team });
      if (!(r && r.win)) { await talk(m, [['captain', 'Lost to ' + team + '. Tomorrow, same time. Bring your own ball.']]); return 0; }
      const was = st.wins;
      if (st.wins < 5) st.wins++;
      if (was < 5 && st.wins >= 5 && N.flags) { N.flags.colony_champion = true; await talk(m, [['tiger', 'Fine. You\'re good. ...For Lakshmi Nagar.'], ['captain', 'COLONY CHAMPIONS!']]); }
      else await talk(m, [['captain', 'Beat ' + team + '! Next: ' + P.teams[Math.min(4, st.wins)] + '.']]);
      return P.pay[i];
    },
  });

  /* ============================================================ the system */
  function offerTick() {
    const O = J.offer, p = N.player;
    if (!O || !p) return;
    if (p.vehicle && !O.inVehicle) return;
    const t = posOf(O.target); if (!t) return;
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d <= O.r) N.interact.offer({ label: O.label, priority: 7, dist: d, use: O.use });
  }
  // extra "Odd job" starters where any place of a kind gives the job (rythu bazaars, playgrounds, girnis)
  const STARTERS = [];
  // job givers stand a few steps out of the shop door (towards the road), so standing at the counter
  // never opens the job's J-card by accident
  function giverSpot(pid) {
    const q = N.places[pid]; if (!q || !N.world.built) return null;
    const rp = N.world.nearestRoadPoint(q.x, q.y);
    let dx = 0, dy = 1;
    if (rp && rp.dist > 1) { dx = (rp.x - q.x) / rp.dist; dy = (rp.y - q.y) / rp.dist; }
    const d = rp ? Math.min(rp.dist, 30) : 26;
    const f = N.world.findFree(q.x + dx * d + dy * 14, q.y + dy * d - dx * 14, 'walk', 12);
    return f ? { x: f.x, y: f.y } : null;
  }
  function placeGivers() {
    const D = N.missions && N.missions.defs; if (!D) return;
    for (const id in J.defs) {
      const def = J.defs[id], md = D[id];
      if (!md || !def.giver || !def.giver.place) continue;
      const sp = giverSpot(def.giver.place);
      if (sp) md.giver = { x: sp.x, y: sp.y, r: def.giver.r || 14, place: undefined };
    }
  }
  function installStarters() {
    try { placeGivers(); } catch (e) { N.err('sidejobs.givers', e); }
    const I = N.interact; if (!I) return;
    for (const k of STARTERS) I.remove(k);
    STARTERS.length = 0;
    const add = (pid, jid, label, dx) => {
      const q = N.places[pid]; if (!q) return;
      const key = 'job:' + jid + ':' + pid;
      STARTERS.push(key);
      I.add(key, { x: q.x + (dx || 0), y: q.y + 14, r: 16, priority: 2, label, enabled: () => !why(jid) && !(N.missions && N.missions.active), use: () => start(jid) });
    };
    for (const id of Object.keys(N.places)) {
      if (/^playground_\d+$/.test(id)) add(id, 'job_gully_league', 'Gully league', -20);
      if (/^rythu_bazaar_/.test(id)) add(id, 'job_rythu_list', 'Aunty with a list', -24);
      if (/^pindi_girni_\d+$/.test(id) && id !== 'pindi_girni_1') add(id, 'job_girni_dabbas', 'Dabba deliveries', 0);
    }
  }
  J.papers = [];
  function update(dt) {
    const A = J.active;
    if (A && N.state.mode === 'play') {
      const def = J.defs[A.id];
      if (def && def.tick) { try { def.tick(A, dt); } catch (e) { N.err('sidejobs.tick:' + A.id, e); } }
      offerTick();
      cargoTick();
    }
    if (N.state.mode === 'play') { try { lootnaTick(dt); } catch (e) { N.err('sidejobs.lootna', e); } ladderTick(dt); }
    for (let i = J.papers.length - 1; i >= 0; i--) { J.papers[i].t += dt; if (J.papers[i].t > 0.5) J.papers.splice(i, 1); }
  }
  function draw() {
    const R = N.render;
    if (LT.kites.length) drawLootna();
    for (const P of J.papers) {
      const f = Math.min(1, P.t / 0.5), x = P.x0 + (P.x1 - P.x0) * f, y = P.y0 + (P.y1 - P.y0) * f, h = Math.sin(f * Math.PI) * 14 + 4;
      R.queue('sky', 1, (ctx) => { const k = R.k(h), X = R.sx(x, k), Y = R.sy(y, k); ctx.save(); ctx.translate(X, Y); ctx.rotate(f * 9); ctx.fillStyle = '#efe9dc'; ctx.fillRect(-3 * k, -1.2 * k, 6 * k, 2.4 * k); ctx.fillStyle = '#8a8680'; ctx.fillRect(-0.6 * k, -1.2 * k, 1.2 * k, 2.4 * k); ctx.restore(); });
    }
  }
  function journalTab() {
    try {
      if (!N.menus || !N.menus.addJournalTab) return;
      N.menus.addJournalTab({ id: 'jobs', title: 'Jobs', order: 75, render(el) {
        const rows = Object.values(J.defs).map((d) => '<tr><td><b>' + esc(d.title) + '</b><br><small>' + esc(payText(d.id)) + '</small></td><td>L' + level(d.id) + '</td><td>' + runs(d.id) + '</td><td>' + (st.best[d.id] ? st.best[d.id] + ' s' : '—') + '</td><td>' + rs(st.earned[d.id] | 0) + '</td></tr>').join('');
        el.innerHTML = '<h3 class="jobs-h">Odd jobs</h3><p class="jobs-p">Level 2 after 2 runs, 3 after 5, 4 after 9, 5 after 14.' + (N.flags && N.flags.colony_champion ? ' Title: <b>Colony Champion</b>.' : '') + '</p><table class="jobs-t"><tr><th>Job</th><th>Level</th><th>Runs</th><th>Best</th><th>Earned</th></tr>' + rows + '</table>';
      } });
    } catch (e) { N.err('sidejobs.journal', e); }
  }

  const SJ = (N.sidejobs = {
    register, start, why: (id) => why(id), level, runs, earned: (id) => st.earned[id] | 0, best: (id) => st.best[id] | 0, payText,
    LEVELS, PAY, TUNE, defs: J.defs,
    get active() { const A = J.active; return A ? { id: A.id, title: A.title, level: A.level, step: A.step, data: A.data } : null; },
    get cargo() { return J.cargo ? { v: J.cargo.v, light: J.cargo.light } : null; },
    get lootna() { return { on: LT.on, kites: LT.kites.map((k) => ({ x: k.x1, y: k.y1, h: k.h })), carried: N.player && N.player.itemCount ? N.player.itemCount('lootna_kite') : 0, forced: LT.forced }; },
    setLootna(on, force) { LT.on = on !== false; LT.forced = !!force; },
    get autopilot() { return J.autopilot; }, set autopilot(v) { J.autopilot = !!v; },
    /** debug: do the current step (teleport to the target / press the offer) */
    debugStep() {
      const O = J.offer; if (O) { const t = posOf(O.target); if (t) warp(t.x, t.y); O.use(); return true; }
      const A = J.active; if (A && A.data && A.data.gates) { const g = A.data.gates.find((q) => !q.done); if (g) { warp(g.rx, g.ry); throwPaper(g, true); return true; } }
      return false;
    },
    throwPaper: (perfect) => { const A = J.active; if (!A || !A.data || !A.data.gates) return false; const p = N.player; const g = A.data.gates.filter((q) => !q.done).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; if (!g) return false; throwPaper(g, !!perfect); return true; },
    streetSpots,
  });
  void SJ;

  N.addSystem({
    id: 'sidejobs', order: 12, runIn: ['play'],
    init() {
      try {
        if (N.save && N.save.register) N.save.register('jobs', {
          serialize: () => ({ runs: Object.assign({}, st.runs), earned: Object.assign({}, st.earned), best: Object.assign({}, st.best), wins: st.wins, used: { day: st.used.day, n: Object.assign({}, st.used.n) } }),
          deserialize: (o) => {
            if (!o || typeof o !== 'object') return;
            const ob = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
            const nums = (v) => { const out = {}; for (const k in ob(v)) { const n = +ob(v)[k]; if (isFinite(n) && n >= 0) out[k] = n; } return out; };
            st.runs = nums(o.runs); st.earned = nums(o.earned); st.best = nums(o.best); st.wins = U.clamp(+o.wins || 0, 0, 5) | 0;
            const u = ob(o.used); st.used = { day: isFinite(+u.day) ? +u.day : -1, n: nums(u.n) };
          },
        });
      } catch (e) { N.err('sidejobs.save', e); }
      journalTab();
    },
    update, draw,
    reset() {
      st.runs = {}; st.earned = {}; st.best = {}; st.wins = 0; st.used = { day: -1, n: {} };
      J.active = null; J.offer = null; J.cargo = null; hudShow(false);
      for (const r of LT.rivals) r.alive = false;
      LT.kites.length = 0; LT.rivals.length = 0; LT.nextT = 8; LT.forced = false;
      if (J.ladder) { J.ladder.el.remove(); J.ladder = null; }
    },
  });
  N.on('world:built', installStarters);
  N.on('boot', () => { if (!STARTERS.length) installStarters(); });
  N.on('mission:fail', (d) => { if (d && J.defs[d.id]) { N.emit('job:fail', { id: d.id, reason: d.reason }); hudShow(false); } });
  N.on('mission:abort', (d) => { if (d && J.defs[d.id]) hudShow(false); });
  if (N.world && N.world.built) installStarters();
})();
