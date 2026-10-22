/* NOSTALGIA — tests/record_playthrough.cjs  (gameplay video recorder)
 * Records a watchable video of the whole main story, played by an in-browser autopilot that drives REAL inputs:
 * arrow keys steer along the minimap's pink route (N.hud.route(), else N.npcs.planPath), Shift runs, tank steering
 * on cycles, E for talk / acts / ● REC / J-cards / retry cards, arrows + E for dialogue choices, Space to hail an auto
 * for a trip to a giver over 5200 u (the in-game "AUTO → place" ▶▶ ride; no trip in the story was that long, so the
 * recorded run never needed it). Dialogue is read at a readable pace (the typewriter, then a
 * hold by line length). Minigames run on their built-in autoplay ('win') at game speed, on screen.
 *
 *   title → name card → 2026 prologue → Track 01 … Track 10 → Diwali week (Mithai Run + Deepon ki Raat) → interlude
 *   → Track 11 → Track 12 (Chand Raat) → ending (Eid morning … Charminar) → 2026 epilogue → credits
 *
 * Recording: Playwright chromium (SwiftShader) at 1280x720 / DPR 1, 2D top-down view (two short 3D showcases: the
 * Diwali terrace and Laad Bazaar on Chand Raat, V -> third person -> first person -> top). Video comes from our own CDP
 * screencast -> ffmpeg x264 .mkv (ScreenRecorder: Playwright's recordVideo stretched time when the page painted faster
 * than 25 fps). One file per SESSION; a session ends on a game save, so a crash or a container restart loses at most
 * one session, and the next run resumes from progress.json (the save after each session is in video/saves/).
 * The page is opened WITHOUT #debug (no FPS / POS overlay); src/testing.js's unlimited pocket money is switched off
 * through its own localStorage key before boot (the real economy, and no "Testing build" toast).
 * Every poll writes the autopilot's activity class to a timeline (video seconds): skip / read / cut / act / mg /
 * ride / wait / travel / credits / show3d, plus marks (chapter boundaries, highlights, failures, debug assists).
 * Debug assists (marked 'assist', listed in the timeline): 'unstick' = a hop of ~160 u past an obstacle the route could
 * not get round (cut out of the film, a 0.8 s "▶▶ F.FWD" card covers the jump), 'step skip' = the story's own
 * N.story.debug.skip() after 25-30 s without progress, pocket money topped up for an auto ride, food / energy kept up
 * (feed), the controls unlocked after 25 s stuck, Deepon ki Raat's gentler gusts (as tests/story_full.cjs).
 *
 * Editing (ffmpeg): each chapter is cut from its session's .mkv by the timeline: dead time (boot, the title before
 * CONTINUE, stuck spots) is dropped, travel is sped up 3-4x, waits 2-3x, rides 1.5x, long minigames 1.5x, credits 1.25x;
 * dialogue, cutscenes, acts and 3D shots play at 1x (a stretch where the game itself ran below 20 fps is sped up to
 * game time). A 2.6 s title card (the J-card line from src/storycore.js STORY, fonts converted from vendor/fonts woff2
 * to TTF for drawtext) opens each chapter. Output: H.264 crf 28 preset slow, 30 fps, yuv420p, +faststart. Then the
 * full film (concat + ffmetadata chapter markers) and a ~3.5 min highlights reel (one or two marked moments a chapter).
 *
 *   node tests/record_playthrough.cjs                    record every session not yet done, then edit everything
 *   STAGE=record|edit|full|highlights|frames|all          one stage only (default all)
 *   SESSIONS=s03,s04 / FROM=s05 / TO=s10                  pick sessions to record (re-record = listed explicitly)
 *   CHAPTERS=03_first_day_first_show                      chapters to (re-)edit
 *   REC_PROGRESS=/path/progress.json                       progress file (default video/progress.json)
 *   VERBOSE=1                                             log every autopilot state change
 * Outputs (git-ignored): video/raw/<session>.mkv + .timeline.json + .log, video/saves/after_<session>.json,
 *   video/chapters/NN_name.mp4, video/nostalgia_full_playthrough.mp4, video/nostalgia_highlights.mp4,
 *   video/frames/<chapter>/*.png (one frame every 20 s, for checking) + video/frames/<chapter>_sheetNN.jpg (contact sheets).
 * Debug probes can drive the same autopilot without recording: require() this file (exports pageHelper, travel, play,
 * toGiver, setPage ...; main only runs when the file is executed).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VIDEO = process.env.REC_OUT || path.join(ROOT, 'video');
const RAW = path.join(VIDEO, 'raw');
const SAVES = path.join(VIDEO, 'saves');
const CHAP = path.join(VIDEO, 'chapters');
const WORK = path.join(VIDEO, 'work');
const FRAMES = path.join(VIDEO, 'frames');
const PROGRESS = process.env.REC_PROGRESS || path.join(VIDEO, 'progress.json');
const FONTS = process.env.REC_FONTS || path.join(WORK, 'fonts');
const URL = 'file://' + path.join(ROOT, 'index.html');
const SAVE_KEY = 'nostalgia.save.v1';
const VERBOSE = !!process.env.VERBOSE;
const W = 1280, H = 720;
for (const d of [VIDEO, RAW, SAVES, CHAP, WORK, FRAMES]) fs.mkdirSync(d, { recursive: true });
fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
let logFile = null;
function log(s) {
  const line = '[' + ((Date.now() - T0) / 1000).toFixed(0).padStart(5) + 's] ' + s;
  console.log(line);
  if (logFile) { try { fs.appendFileSync(logFile, line + '\n'); } catch (e) { /* ignore */ } }
}
function readJSON(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJSON(f, o) { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 1)); fs.renameSync(t, f); }
const progress = readJSON(PROGRESS, { sessions: {}, chapters: {} });
// a recording and an edit may run at the same time: each writes back only the entries it changed
const dirty = { sessions: new Set(), chapters: new Set() };
const setProgress = (kind, id, v) => { progress[kind][id] = v; dirty[kind].add(id); saveProgress(); };
function saveProgress() {
  const cur = readJSON(PROGRESS, { sessions: {}, chapters: {} });
  for (const kind of ['sessions', 'chapters']) {
    cur[kind] = cur[kind] || {};
    for (const id of dirty[kind]) cur[kind][id] = progress[kind][id];
    for (const id in cur[kind]) if (!dirty[kind].has(id)) progress[kind][id] = cur[kind][id];
  }
  writeJSON(PROGRESS, cur);
}

/* ============================================================================ chapters */
// titles: the J-card lines of src/storycore.js STORY (track, title, place) + the story beats around them
const CHAPTERS = [
  { id: '00_prologue', top: 'SIDE B · 2026', title: 'Prologue: The Courier', sub: 'Wed 14 Jan 2026 · a box from New Jersey' },
  { id: '01_bo_kaata', top: 'TRACK 01', title: 'Bo Kaata!', sub: 'Terrace, Sankranti · Tue 14 Jan 2003' },
  { id: '02_lost_and_found', top: 'TRACK 02', title: 'Lost and Found', sub: 'Numaish · Sat 25 Jan 2003' },
  { id: '03_first_day_first_show', top: 'TRACK 03', title: 'First Day, First Show', sub: 'Sandhya · Sat 8 Feb 2003' },
  { id: '04_last_man_batting', top: 'TRACK 04', title: 'Last Man Batting', sub: 'Howzaat! · Public Gardens · Sun 23 Mar 2003' },
  { id: '05_right_right', top: 'TRACK 05', title: 'Right, Right!', sub: 'Imlibun · Tue 1 Apr 2003' },
  { id: '06_ammammas_thursday', top: 'TRACK 06', title: "Ammamma's Thursday", sub: 'Thump-thump · Hanuman Pindi Girni · Thu 15 May 2003' },
  { id: '07_the_clap', top: 'TRACK 07', title: 'The Clap', sub: 'Golconda heard us · Fateh Darwaza · Sat 7 Jun 2003' },
  { id: '08_drums_for_amma', top: 'TRACK 08', title: 'Drums for Amma', sub: 'Lashkar Bonalu · Sun 20 Jul 2003' },
  { id: '09_opening_day', top: 'TRACK 09', title: 'Opening Day', sub: 'Prasads · Fri 25 Jul 2003' },
  { id: '10_agle_baras', top: 'TRACK 10', title: 'Agle Baras Jaldi Aana', sub: 'Tank Bund · Tue 9 Sep 2003' },
  { id: '11_diwali_week', top: 'DIWALI WEEK', title: 'Mithai Run · Deepon ki Raat', sub: 'Deepavali · Sat 25 Oct 2003' },
  { id: '12_interlude', top: 'INTERLUDE', title: 'The Tickets', sub: 'Side A ■ PAUSED 812 · Sat 1 Nov 2003' },
  { id: '13_last_bell', top: 'TRACK 11', title: 'Last Bell', sub: 'No bells · Naubat Pahad · Fri 21 Nov 2003' },
  { id: '14_chand_raat', top: 'TRACK 12', title: 'Chand Raat', sub: 'Charminar · Tue 25 Nov 2003' },
  { id: '15_ending', top: 'ENDING', title: 'Eid Mubarak', sub: 'Eid morning · Charminar · 26-27 Nov 2003' },
  { id: '16_epilogue', top: 'SIDE B · 2026', title: 'Epilogue: 1-4-0-1', sub: 'Sat 17 Jan 2026' },
  { id: '17_credits', top: 'THE END', title: 'Credits', sub: 'Nostalgia · Side A · Side B' },
];
const CH = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

/* ============================================================================ the in-page helper */
// installed after every boot: one composite probe of what is on screen, and the navigation state (the route)
function pageHelper() {
  if (window.__R) return;
  const R = (window.__R = { navS: { key: '', pts: null, i: 0, src: '' }, lines: [], passes: {}, fails: [], mgs: [] });
  N.on('mission:pass', (d) => { const k = d && d.id; if (k) R.passes[k] = (R.passes[k] || 0) + 1; });
  N.on('mission:fail', (d) => { R.fails.push({ id: d && d.id, reason: d && d.reason, t: N.time.real }); });
  N.on('minigame:start', (d) => { R.mgs.push({ id: d && d.id, t: N.time.real }); });
  N.on('dialogue:line', (d) => { if (d && R.lines.length < 6000) R.lines.push([d.speaker, String(d.text || '').slice(0, 200)]); });
  const vis = (sel) => { const e = document.querySelector(sel); return !!(e && e.offsetParent !== null); };
  const txt = (sel) => { const e = document.querySelector(sel); return e && e.offsetParent !== null ? (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) : ''; };
  R.target = function () {
    const a = N.missions && N.missions.active;
    let t = null, src = '';
    const s2 = N.story2 && N.story2.probe ? N.story2.probe() : null;
    const s2own = !!(s2 && (s2.scene || (a && N.story2.MISSIONS.concat(N.story2.SIDE).indexOf(a.id) >= 0)));
    if (s2own && s2.target) { t = s2.target; src = 's2'; }
    if (!t && a && N.dwMissions && N.dwMissions.IDS.indexOf(a.id) >= 0) {
      const d = N.dwMissions.debug.state();
      const q = (d.acts || []).find((x) => isFinite(x.x));
      if (q) { t = { x: q.x, y: q.y }; src = 'dw'; }
    }
    if (!t && a && N.story && N.story.debug) { try { const q = N.story.debug.target(); if (q) { t = q; src = 's1'; } } catch (e) { /* ignore */ } }
    if (!t && s2 && s2.target) { t = s2.target; src = 's2'; }
    return t ? { x: t.x, y: t.y, h: t.h || 0, src } : null;
  };
  R.probe = function () {
    const p = N.player, a = N.missions.active, v = p.vehicle;
    const cur = N.dialogue && N.dialogue.current;
    const s1 = N.story && N.story.debug ? N.story.debug.state() : null;
    const s2 = N.story2 && N.story2.probe ? N.story2.probe() : null;
    const dw = N.dwMissions && N.dwMissions.debug ? N.dwMissions.debug.state() : null;
    const dws = N.dwMissions && N.dwMissions.story ? N.dwMissions.story.state() : null;
    const tg = R.target();
    return {
      mode: N.state.mode, mission: a ? a.id : null, attempt: a ? a.attempt : 0, ff: !!(a && a.ff), scene: N.story2 ? N.story2.scene : null,
      obj: N.hud.objectiveText || '', date: N.calendar ? N.calendar.label() + ' ' + N.clock.label() : '',
      p: { x: Math.round(p.x), y: Math.round(p.y), lvl: p.level || null, veh: v ? v.type : null, vcls: v && v.T ? v.T.cls : null, pass: !!(v && v.passenger === p), ang: v ? v.angle : p.angle, spd: v ? Math.abs(v.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0), e: Math.round(p.energy || 0), locked: !!p.controlsLocked, hidden: !!p.hidden },
      act: N.input.actionLabel || '',
      // the ACTION on offer belongs to the story (story.js acts 'st:act:*', Diwali 'dwm:*', story2 / story.js press offers p >= 7)
      storyAct: (() => { const c = N.interact.current; if (!c) return false; if (c.id) return /^(st:|dwm:|s2:)/.test(c.id); return (c.priority || 0) >= 7; })(),
      deck: !!(N.walkman && N.walkman.deck && N.walkman.deck.isOpen),
      ptCard: vis('.pt-card'), // a party activity's start card (Chitti Chase, races): "N" = Not now
      dlgOpen: !!(N.dialogue && N.dialogue.isOpen && N.dialogue.isOpen()),
      dlg: cur ? { s: cur.speaker || null, t: String(cur.text || ''), typing: !!cur.typing, ch: cur.choices ? cur.choices.slice() : null, sel: cur.selected } : null,
      cut: !!(N.menus && N.menus.inCutscene), csPrompt: vis('.mn-cs .cs-card.k-prompt'), csText: txt('.mn-cs'),
      jc: vis('.hud-jcard.show'), jcText: txt('.hud-jcard.show'), prompt: N.missions.prompt, ask: !!N.missions.askOpen || vis('.hud-ask.show'),
      lf: N.missions.lastFailed && N.missions.lastFailed.id,
      rec: N.tape && N.tape.recState ? N.tape.recState.phase : null,
      mg: N.minigames ? N.minigames.active || null : null, mgResult: vis('.mg-card-result'),
      shop: !!(N.shops && N.shops.isOpen && N.shops.isOpen()), journal: N.state.mode === 'journal',
      defs: vis('.mn-defs.show'), credits: vis('.mn-credits.show'), menuTop: N.menus.debugState().top,
      panel: s2 ? s2.panel : null, gallery: s2 ? s2.gallery : null, chase: s2 ? s2.chase : false, lock: s2 ? s2.lock : null, offer: s2 ? s2.offer : null,
      s1: s1 ? { step: s1.step, queue: s1.queue, ride: s1.ride, cargo: s1.cargo, tag: s1.tag } : null,
      dw: dw ? { step: dw.step, panel: dw.panel, terrace: dw.terrace ? { lit: dw.terrace.lit, n: dw.terrace.n } : null, card: dw.card || null } : null,
      dws: dws ? { week: dws.week, card: dws.card ? { x: dws.card.x, y: dws.card.y, kind: dws.card.kind } : null, left: dws.left } : null,
      tgt: tg, wanted: N.wanted ? N.wanted.level | 0 : 0, real: N.time.real, fps: N.perf ? N.perf.fps : 0,
      busy: !!(N.calendar && N.calendar.jumping),
    };
  };
  /** keep him fed (a debug assist: a real player eats at the home door / a cafe; the story does not need it) */
  R.feed = function () {
    const pl = N.player;
    if (pl && pl.tummy != null && pl.tummy < 55) { try { if (pl.feed) pl.feed(60, { quiet: true }); else pl.tummy = 80; } catch (e) { pl.tummy = 80; } }
    if (pl && pl.energy < 45 && !(N.story2 && N.story2.state().epilogue)) pl.energy = 85;
  };
  /** Where to steer toward (tx, ty): the minimap's pink route when it leads there, else N.npcs.planPath. */
  R.nav = function (tx, ty, o) {
    o = o || {};
    const S = R.navS, p = N.player, v = p.vehicle || p;
    const d = Math.hypot(tx - v.x, ty - v.y);
    const key = Math.round(tx / 12) + ',' + Math.round(ty / 12);
    let aim = { x: tx, y: ty }, src = 'direct';
    if (o.replan) S.forcePlan = true; // stuck on the pink route: plan our own way for the rest of this trip
    const rt = N.hud.route ? N.hud.route() : null;
    let hudOk = rt && rt.length > 2 && Math.hypot(rt[rt.length - 1][0] - tx, rt[rt.length - 1][1] - ty) < 30;
    if (hudOk && d < 2000) {
      // the road route round a fort / a park can be a huge detour where a footpath or steps go straight: plan on foot
      let L = 0; for (let k = 0; k < rt.length - 1; k++) L += Math.hypot(rt[k + 1][0] - rt[k][0], rt[k + 1][1] - rt[k][1]);
      if (L > Math.max(2.5 * d, d + 700)) hudOk = false;
    }
    if (o.direct || d < 30) { S.key = ''; }
    else if (p.level) {
      // on the terraces: plan on the roof grid (planks, parapets)
      if (S.key !== key || o.replan || !S.pts) {
        let pts = null;
        try { pts = N.world.roofs.withRoof(() => N.npcs.planPath(v.x, v.y, tx, ty)); } catch (e) { pts = null; }
        S.pts = pts && pts.length ? pts.map((q) => [q.x, q.y]) : [[tx, ty]];
        if (Math.hypot(S.pts[S.pts.length - 1][0] - tx, S.pts[S.pts.length - 1][1] - ty) > 4) S.pts.push([tx, ty]);
        S.i = 0; S.key = key;
      }
      while (S.i < S.pts.length - 1 && Math.hypot(S.pts[S.i][0] - v.x, S.pts[S.i][1] - v.y) < 6) S.i++;
      aim = { x: S.pts[S.i][0], y: S.pts[S.i][1] }; src = 'roof';
    }
    else if (hudOk && d > 380 && !o.plan && !S.forcePlan) {
      // the pink route: the first point further than 30 u ahead
      let k = 1; while (k < rt.length - 1 && Math.hypot(rt[k][0] - v.x, rt[k][1] - v.y) < 30) k++;
      aim = { x: rt[k][0], y: rt[k][1] }; src = 'hud'; S.key = '';
    } else {
      if (S.key !== key || o.replan || !S.pts) {
        let pts = null;
        if (o.replan) { S.road = !!o.road; S.around = !!o.around; }
        if (S.road) {
          // the road graph (stuck on a short cut: a crowd, a stall, a corner the planner thought clear)
          S.road = true;
          try {
            const RR = N.world.roads, a = RR.nearestNode(v.x, v.y), b = RR.nearestNode(tx, ty);
            const path = a && b ? RR.route(a, b, { walk: !p.vehicle, paths: !p.vehicle, costs: { path: 1.15 }, maxExpand: 60000 }) : null;
            if (path && path.length) pts = path.map((nd) => ({ x: nd.x, y: nd.y }));
          } catch (e) { pts = null; }
        }
        if (!pts && (o.around || S.around)) {
          S.around = true;
          try { const q = R.planAround(tx, ty, o.margin); if (q && q.length) pts = q.map((c) => ({ x: c[0], y: c[1] })); } catch (e) { pts = null; }
        }
        if (!pts) try { pts = N.npcs && N.npcs.planPath ? N.npcs.planPath(v.x, v.y, tx, ty) : null; } catch (e) { pts = null; }
        S.pts = pts && pts.length ? pts.map((q) => [q.x, q.y]) : [[tx, ty]];
        if (Math.hypot(S.pts[S.pts.length - 1][0] - tx, S.pts[S.pts.length - 1][1] - ty) > 4) S.pts.push([tx, ty]);
        S.i = 0; S.key = key; S.forcePlan = !!o.replan || S.forcePlan;
      }
      const near = p.vehicle ? 22 : 9;
      while (S.i < S.pts.length - 1 && Math.hypot(S.pts[S.i][0] - v.x, S.pts[S.i][1] - v.y) < near) S.i++;
      aim = { x: S.pts[S.i][0], y: S.pts[S.i][1] }; src = 'plan';
    }
    const calm = /sneak|walk|don.t run|quiet|slow|careful|carry|spill|tiptoe/i.test(N.hud.objectiveText || '') || N.flags.year === 2026 || !!p.noRun;
    // cargo on the carrier (flour, tomatoes, the biryani parcel): bumps above ~40 u/s damage it -> ride gently
    let cargo = /tomato|bruise|parcel|flour|atta|spill|carry|cargo|careful|box|cake|egg/i.test(N.hud.objectiveText || '');
    try { if (N.story && N.story.debug && N.story.debug.state().cargo != null) cargo = true; } catch (e) { /* ignore */ }
    // what is left of the way (a detour first walks AWAY from the goal: progress is measured along the path)
    let rem = d;
    if (src === 'plan' || src === 'roof') { rem = Math.hypot(aim.x - v.x, aim.y - v.y); for (let k = S.i; k < S.pts.length - 1; k++) rem += Math.hypot(S.pts[k + 1][0] - S.pts[k][0], S.pts[k + 1][1] - S.pts[k][1]); }
    else if (src === 'hud' && rt) { let k = 1; while (k < rt.length - 1 && Math.hypot(rt[k][0] - v.x, rt[k][1] - v.y) < 30) k++; rem = Math.hypot(rt[k][0] - v.x, rt[k][1] - v.y); for (; k < rt.length - 1; k++) rem += Math.hypot(rt[k + 1][0] - rt[k][0], rt[k + 1][1] - rt[k][1]); }
    return { x: v.x, y: v.y, d, rem, ax: aim.x, ay: aim.y, da: Math.hypot(aim.x - v.x, aim.y - v.y), src, calm, cargo, mode: N.state.mode, veh: p.vehicle ? (p.vehicle.T && p.vehicle.T.cls) || p.vehicle.type : null, pass: !!(p.vehicle && p.vehicle.passenger === p), ang: v.angle || 0, spd: p.vehicle ? (p.vehicle.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0), lvl: p.level || null, e: p.energy, dlg: !!(N.dialogue.isOpen && N.dialogue.isOpen()), obj: N.hud.objectiveText || '', locked: !!p.controlsLocked, act: N.input.actionLabel || '', prompt: N.missions.prompt, active: N.missions.active ? N.missions.active.id : null, cut: !!(N.menus && N.menus.inCutscene) };
  };
  /** A* round what is in the way right now: the walk grid (6 u cells) with parked / stopped vehicles and standing
   *  people blocked as discs (the stuck cases: a car left in a narrow colony lane, a crowd at a stall). -> [[x, y]] | null */
  R.planAround = function (tx, ty, margin) {
    const p = N.player, v = p.vehicle || p, W = N.world, CS = 6, M = margin || 220;
    const bx0 = Math.min(v.x, tx) - M, by0 = Math.min(v.y, ty) - M, bx1 = Math.max(v.x, tx) + M, by1 = Math.max(v.y, ty) + M;
    const w = Math.ceil((bx1 - bx0) / CS), h = Math.ceil((by1 - by0) / CS), n = w * h;
    if (n > 400000) return null;
    const ok = p.vehicle ? (x, y) => W.isDrivable(x, y) : (x, y) => W.isWalkable(x, y);
    const blocked = new Uint8Array(n); // 0 unknown, 1 free, 2 blocked
    const discs = [];
    const cx = (v.x + tx) / 2, cy = (v.y + ty) / 2, rr = Math.hypot(tx - v.x, ty - v.y) / 2 + M;
    for (const e of N.entities.query(cx, cy, rr)) {
      if (e === p || e === p.vehicle || !e.alive) continue;
      if (e.kind === 'vehicle') { if (Math.abs(e.speed || 0) > 12) continue; const L = e.T ? Math.max(e.T.w || 0, 16) : 20; discs.push([e.x, e.y, L / 2 + (p.vehicle ? 10 : 5)]); }
      else if ((e.kind === 'ped' || e.kind === 'npc' || e.kind === 'animal') && Math.hypot(e.vx || 0, e.vy || 0) < 8) discs.push([e.x, e.y, (e.r || 4) + 4]);
    }
    const free = (i) => {
      let b = blocked[i];
      if (!b) {
        const x = bx0 + ((i % w) + 0.5) * CS, y = by0 + (Math.floor(i / w) + 0.5) * CS;
        b = ok(x, y) ? 1 : 2;
        if (b === 1) for (const d of discs) { const dx = x - d[0], dy = y - d[1]; if (dx * dx + dy * dy < d[2] * d[2]) { b = 2; break; } }
        blocked[i] = b;
      }
      return b === 1;
    };
    const idx = (x, y) => { const i = Math.floor((x - bx0) / CS), j = Math.floor((y - by0) / CS); return i < 0 || j < 0 || i >= w || j >= h ? -1 : j * w + i; };
    let s0 = idx(v.x, v.y), g0 = idx(tx, ty);
    if (s0 < 0 || g0 < 0) return null;
    blocked[s0] = 1;
    if (!free(g0)) { // the goal cell itself (a counter): the nearest free cell
      let best = -1, bd = 1e9; const gi = g0 % w, gj = Math.floor(g0 / w);
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const i = gi + di, j = gj + dj; if (i < 0 || j < 0 || i >= w || j >= h) continue; const k = j * w + i; if (free(k) && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = k; } }
      if (best < 0) return null; g0 = best;
    }
    const gs = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const heap = []; const push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const q = (c - 1) >> 1; if (heap[q][0] <= heap[c][0]) break; [heap[q], heap[c]] = [heap[c], heap[q]]; c = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const gx = g0 % w, gy = Math.floor(g0 / w);
    const hh = (k) => { const dx = Math.abs((k % w) - gx), dy = Math.abs(Math.floor(k / w) - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    gs[s0] = 0; push(s0, hh(s0));
    let found = false, it = 0;
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length && it++ < 250000) {
      const [, k] = pop();
      if (closed[k]) continue; closed[k] = 1;
      if (k === g0) { found = true; break; }
      const i = k % w, j = Math.floor(k / w);
      for (const [di, dj, c] of NB) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nk = nj * w + ni; if (closed[nk] || !free(nk)) continue;
        if (di && dj && (!free(j * w + ni) || !free(nj * w + i))) continue; // no corner cutting
        const g = gs[k] + c; if (g < gs[nk]) { gs[nk] = g; came[nk] = k; push(nk, g + hh(nk)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = g0; k >= 0; k = came[k]) { cells.push(k); if (k === s0) break; }
    cells.reverse();
    const P = (k) => [bx0 + ((k % w) + 0.5) * CS, by0 + (Math.floor(k / w) + 0.5) * CS];
    // line-of-sight smoothing on the same grid
    const los = (a, b) => { const [x0, y0] = P(a), [x1, y1] = P(b); const L = Math.hypot(x1 - x0, y1 - y0), st = Math.max(1, Math.ceil(L / 3)); for (let q = 1; q < st; q++) { const k = idx(x0 + (x1 - x0) * q / st, y0 + (y1 - y0) * q / st); if (k < 0 || !free(k)) return false; } return true; };
    const out = []; let a = 0;
    while (a < cells.length - 1) { let b = Math.min(cells.length - 1, a + 40); while (b > a + 1 && !los(cells[a], cells[b])) b--; out.push(P(cells[b])); a = b; }
    out.push([tx, ty]);
    return out;
  };
  R.unplan = function () { R.navS.key = ''; R.navS.pts = null; R.navS.forcePlan = false; R.navS.road = false; R.navS.around = false; };
  /** Terraces: the roof under (x, y) (or the roof a goal names by its height), and the stairs to use.
   *  -> null (same level) | {kind: 'down', x, y} (the landing on his roof) | {kind: 'up', x, y, roof} (the stairs foot) */
  R.levelPlan = function (tx, ty, th) {
    const RF = N.world.roofs, p = N.player;
    if (!RF || !RF.at) return null;
    const at = RF.at(tx, ty);
    let goalRoof = at && at.roof ? at.roof.id || at.roof : null;
    if (!goalRoof && th > 0) {
      // a goal on a roof whose point is at the edge: the nearest roof by its rectangle
      let best = null, bd = 40;
      for (const r of RF.list) { const [x, y, w, h] = r.rect; const dx = Math.max(x - tx, 0, tx - (x + w)), dy = Math.max(y - ty, 0, ty - (y + h)); const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = r.id; } }
      goalRoof = best;
    }
    const mine = p.level || null;
    if (mine && goalRoof) {
      // roof to roof: the planks when they are one walk (the same roof or the same group), else down and up again
      const a = RF.get(mine), b = RF.get(goalRoof);
      if (mine === goalRoof || (a && b && a.group && a.group === b.group)) return null;
    }
    if (mine && (!goalRoof || goalRoof !== mine)) {
      const r = RF.get(mine);
      if (!r || !r.stairs || !r.stairs.length) return null;
      let s = r.stairs[0], bd = 1e9;
      for (const q of r.stairs) { const d = Math.hypot(q.tx - p.x, q.ty - p.y); if (d < bd) { bd = d; s = q; } }
      return { kind: 'down', x: s.tx, y: s.ty };
    }
    if (!mine && goalRoof) {
      const r = RF.get(goalRoof);
      if (!r || !r.stairs || !r.stairs.length) return null;
      let s = r.stairs[0], bd = 1e9;
      for (const q of r.stairs) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; s = q; } }
      return { kind: 'up', x: s.x, y: s.y, roof: goalRoof };
    }
    return null;
  };
  /** next main-story giver on the map: {id, x, y, r} */
  R.giver = function (id) {
    const d = N.missions.defs[id];
    if (!d) return null;
    const q = N.missions.giverPos(d);
    return q ? { id, x: q.x, y: q.y, r: (d.giver && d.giver.r) || 16, avail: N.missions.available().some((x) => x.id === id), marker: (N.missions.markers() || []).some((m) => m.kind === 'giver' && m.id === id) } : null;
  };
  R.bike = function () {
    const p = N.player, r = N.missions.active;
    if (p.vehicle || !r) return null;
    const v = (r.spawned || []).map((x) => x.e).find((e) => e && e.kind === 'vehicle' && e.alive && !e.noEnter && !e.locked && e.T && e.T.cls === 'bike');
    return v ? { x: Math.round(v.x), y: Math.round(v.y) } : null;
  };
}

/* ============================================================================ session runtime */
let browser = null, ctx = null, page = null, TL = null, SESSION = null;
const pageErrors = [];
const ev = (fn, arg) => page.evaluate(fn, arg);
const PROBE = () => page.evaluate(() => window.__R.probe());

/** Timeline: activity classes (video seconds since the page opened) + marks. */
function newTimeline() {
  return { t0: Date.now(), cls: [], marks: [], samples: [], cur: null };
}
const vt = () => (Date.now() - TL.t0) / 1000;
function cls(k) {
  if (!TL || TL.cur === k) return;
  TL.cur = k; TL.cls.push({ t: +vt().toFixed(2), k });
  if (VERBOSE) log('   cls ' + k);
}
function mark(type, data) { if (!TL) return; const m = Object.assign({ t: +vt().toFixed(2), type }, data || {}); TL.marks.push(m); log('   mark ' + type + ' ' + JSON.stringify(data || {})); }
let lastSample = 0;
async function sample(s) {
  if (!TL) return;
  const now = Date.now();
  if (now - lastSample < 1000) return;
  lastSample = now;
  TL.samples.push({ t: +vt().toFixed(2), r: +(s.real || 0).toFixed(2), fps: s.fps });
}

/**
 * Our own screencast recorder (CDP Page.startScreencast -> ffmpeg x264 in .mkv). Playwright's recordVideo writes
 * every frame for at least 1/25 s, so a page painting faster than 25 fps makes its video run longer than the wall
 * clock (13% over in a test session): the timeline could not be cut by it. Here frame k of the 25 fps output shows
 * the newest screencast frame at wall time t0 + k/25 (frames dropped or repeated by their own timestamps).
 */
const FPS = 25;
class ScreenRecorder {
  constructor(file, t0) {
    this.t0 = t0; this.k = 0; this.last = null; this.file = file; this.frames = 0; this.dups = 0;
    this.proc = cp.spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-vf', 'scale=' + W + ':' + H + ':flags=bicubic,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-threads', '2', '-g', String(FPS * 2), '-r', String(FPS), file], { stdio: ['pipe', 'ignore', 'pipe'] });
    this.err = '';
    this.proc.stderr.on('data', (d) => { this.err += d; });
    this.done = new Promise((r) => this.proc.on('exit', r));
    this.proc.stdin.on('error', () => {});
  }
  frame(buf, ts) {
    this.frames++;
    const first = !this.last;
    while (this.t0 + this.k / FPS < ts) { this.proc.stdin.write(first ? buf : this.last); this.k++; this.dups++; }
    this.last = buf;
  }
  async stop(tEnd) {
    if (this.last) while (this.t0 + this.k / FPS < tEnd) { this.proc.stdin.write(this.last); this.k++; }
    this.proc.stdin.end();
    await this.done;
    if (this.err) log('recorder ffmpeg: ' + this.err.slice(-400));
    return { frames: this.frames, out: this.k };
  }
}
let REC = null, CDP = null;
async function openSession(sess, saveRaw) {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // before boot: the real economy (src/testing.js's own switch; no "Testing build" toast) and the save to CONTINUE
  await ctx.addInitScript(({ raw, key }) => {
    try {
      localStorage.setItem('nostalgia.testing.unlimitedMoney', '0');
      if (raw) { localStorage.setItem(key, raw); localStorage.removeItem(key + '.bak'); }
      else { localStorage.removeItem(key); localStorage.removeItem(key + '.bak'); localStorage.removeItem(key + '.manual'); }
    } catch (e) { /* ignore */ }
  }, { raw: saveRaw || '', key: SAVE_KEY });
  page = await ctx.newPage();
  TL = newTimeline();
  const file = path.join(RAW, sess.id + '.mkv');
  REC = new ScreenRecorder(file, TL.t0 / 1000);
  CDP = await ctx.newCDPSession(page);
  CDP.on('Page.screencastFrame', (f) => {
    CDP.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    const ts = f.metadata && f.metadata.timestamp ? f.metadata.timestamp : Date.now() / 1000;
    if (REC) REC.frame(Buffer.from(f.data, 'base64'), ts);
  });
  await CDP.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  cls('skip');
  page.on('console', (m) => { if (m.type() === 'error') { pageErrors.push('console.error: ' + m.text()); log('   console.error: ' + m.text().slice(0, 200)); } });
  page.on('pageerror', (e) => { pageErrors.push('pageerror: ' + (e.stack || e.message)); log('   pageerror: ' + (e.message || '').slice(0, 300)); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(URL);
  await page.waitForFunction(() => window.N && document.body.classList.contains('booted') && N.state.mode === 'title', null, { timeout: 180000 });
  await ev(pageHelper);
  await page.mouse.move(W - 4, H - 4);
}
async function closeSession() {
  try { await CDP.send('Page.stopScreencast'); } catch (e) { /* ignore */ }
  const r = REC ? await REC.stop(Date.now() / 1000) : null;
  const file = REC ? REC.file : null;
  REC = null;
  log('recorder: ' + JSON.stringify(r));
  try { await ctx.close(); } catch (e) { log('ctx.close: ' + e.message); }
  try { await browser.close(); } catch (e) { /* ignore */ }
  browser = ctx = page = CDP = null;
  return file;
}

/* ============================================================================ input helpers */
let held = new Set();
async function setKeys(want) {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
async function releaseKeys() { await setKeys(new Set()); }
async function press(k, n, gap) { for (let i = 0; i < (n || 1); i++) { await page.keyboard.press(k); await sleep(gap || 110); } }
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Read the open dialogue line at a readable pace, then E (choices: arrows + E by policy). */
const READ = { base: 0.6, perChar: 0.02, min: 1.2, max: 3.2 };
async function readLine(s, o) {
  cls('read');
  o = o || {};
  const t0 = Date.now();
  // the typewriter
  while (Date.now() - t0 < 12000) {
    const d = await ev(() => { const c = N.dialogue.current; return c ? { t: String(c.text || ''), typing: !!c.typing, ch: c.choices ? c.choices.slice() : null, open: N.dialogue.isOpen() } : { open: N.dialogue.isOpen() }; });
    if (!d.open || !d.t) { await sleep(120); if (!(await ev(() => N.dialogue.isOpen()))) return; continue; }
    if (!d.typing) { s = { dlg: { t: d.t, ch: d.ch } }; break; }
    await sleep(100);
  }
  const text = (s.dlg && s.dlg.t) || '';
  // Side B's tail: the cassettes he did not find are "(tape hiss)" lines: nothing to read, they go by quickly
  if (/^\W*tape hiss\W*$/i.test(text.trim())) { cls('wait'); await sleep(700); await press('KeyE'); await sleep(250); return; }
  if (s.dlg && s.dlg.ch && s.dlg.ch.length) {
    await sleep(1600);
    const idx = choicePolicy(text, s.dlg.ch, o);
    log('   choice "' + text.slice(0, 70) + '" -> ' + idx + ' ' + JSON.stringify(s.dlg.ch[idx]));
    // the selection starts on the first option: ArrowDown idx times, then E
    for (let k = 0; k < idx; k++) { await press('ArrowDown', 1, 260); }
    await sleep(500);
    await press('KeyE');
  } else {
    const hold = Math.max(READ.min, Math.min(READ.max, READ.base + text.length * READ.perChar)) * (o.slow || 1);
    await sleep(hold * 1000);
    await press('KeyE');
  }
  // wait for the next line / the box to close (no double press)
  const t1 = Date.now();
  while (Date.now() - t1 < 1600) {
    const d = await ev(() => { const c = N.dialogue.current; return { open: N.dialogue.isOpen(), t: c ? String(c.text || '') : '' }; });
    if (!d.open || d.t !== text) return;
    await sleep(80);
  }
}
const CHOICES = [
  [/How many faces have no clock/, 1], [/At the gate/, 0], [/oldest garden a princess/, 0], [/Tomatoes are/, 0], [/HITEC City is far/, 0],
  [/^Chappals\?/, 0], [/Puja bananas/, 1], [/Twenty rupees more/, 1], [/drum hill a white temple/, 0],
];
function choicePolicy(text, ch, o) {
  if (o && o.choice) { const r = o.choice(text, ch); if (r != null) return r; }
  for (const [re, i] of CHOICES) if (re.test(text)) return Math.min(i, ch.length - 1);
  return 0;
}

/* ============================================================================ travel: real keys along the route */
/**
 * Steer to (tx, ty) with the arrow keys: on foot 8-way (Shift to run), on a cycle tank steering (up = pedal,
 * left / right = steer). Returns {d, why}. Stops when within r, or when the game wants something else
 * (dialogue, mode change, objective change when o.objStop, o.stop()).
 */
async function travel(tx, ty, o) {
  o = o || {};
  const r = o.r || 14, t0 = Date.now(), lim = o.ms || 120000;
  cls(o.cls || 'travel');
  await ev(() => window.__R.unplan());
  let best = 1e9, bestT = Date.now(), replans = 0, lastObj = null, st = null, why = 'timeout', revUntil = 0, lastFeedT = Date.now();
  try {
    for (;;) {
      st = await page.evaluate(([x, y, oo]) => window.__R.nav(x, y, oo), [tx, ty, { direct: !!o.direct, replan: false }]);
      if (lastObj == null) lastObj = st.obj;
      if (st.d <= r) { why = 'arrived'; break; }
      if (st.mode !== 'play') { why = 'mode:' + st.mode; break; }
      if (st.dlg) { why = 'dialogue'; break; }
      if (st.cut) { why = 'cutscene'; break; }
      if (st.pass) { why = 'passenger'; break; }
      if (o.objStop && st.obj !== lastObj) { why = 'objective'; break; }
      if (o.stop && (await o.stop(st))) { why = 'stop'; break; }
      if (Date.now() - t0 > lim) break;
      if (Date.now() - lastFeedT > 8000) { lastFeedT = Date.now(); await ev(() => window.__R.feed()); }
      if (st.rem < best - 3) { best = st.rem; bestT = Date.now(); }
      else if (Date.now() - bestT > (o.stuckMs || 3500)) {
        replans++;
        if (replans > (o.maxReplans || 5)) { why = 'stuck'; break; }
        log('   (travel: no progress at ' + Math.round(st.x) + ',' + Math.round(st.y) + ' d ' + Math.round(st.d) + ' rem ' + Math.round(st.rem) + ' src ' + st.src + ' aim ' + Math.round(st.ax) + ',' + Math.round(st.ay) + ' keys ' + [...held].join('+') + ' -> replan ' + replans + ')');
        // 1st: the road graph instead of the short cut; then sidesteps across the way we were going
        // 1st and 3rd: A* round what is in the way now (parked cars, crowds); 2nd: the road graph; then sidesteps
        await page.evaluate(([x, y, rd, ar, mg]) => window.__R.nav(x, y, { replan: true, road: rd, around: ar, margin: mg }), [tx, ty, replans === 2, replans === 1 || replans === 3 || replans === 4, replans >= 3 ? 420 : 220]);
        bestT = Date.now(); best = 1e9;
        if (st.veh) { revUntil = Date.now() + 700; }
        else {
          const a0 = Math.atan2(st.ay - st.y, st.ax - st.x) + (replans % 2 ? Math.PI / 2 : -Math.PI / 2);
          const k = new Set(); const cx = Math.cos(a0), cy = Math.sin(a0);
          if (cx > 0.38) k.add('ArrowRight'); if (cx < -0.38) k.add('ArrowLeft'); if (cy > 0.38) k.add('ArrowDown'); if (cy < -0.38) k.add('ArrowUp');
          await setKeys(k); await sleep(450);
        }
      }
      const want = new Set();
      const a = Math.atan2(st.ay - st.y, st.ax - st.x);
      if (st.veh) {
        // tank steering
        const diff = wrapA(a - st.ang);
        if (Date.now() < revUntil) { want.add('ArrowDown'); if (diff > 0) want.add('ArrowLeft'); else want.add('ArrowRight'); }
        else {
          if (diff > 0.12) want.add('ArrowRight'); else if (diff < -0.12) want.add('ArrowLeft');
          const ad = Math.abs(diff);
          if (ad < 1.1 || st.spd < 22) want.add('ArrowUp');
          else if (ad > 1.6 && st.spd > 45) want.add('ArrowDown');
          if (st.d < 60 && st.spd > 70) want.delete('ArrowUp');
          if (st.cargo && st.spd > 32) want.delete('ArrowUp'); // gently: no bumps above 40 u/s
          if (st.cargo && ad > 0.6 && st.spd > 24) { want.delete('ArrowUp'); }
        }
      } else {
        const dx = Math.cos(a), dy = Math.sin(a);
        if (dx > 0.38) want.add('ArrowRight'); if (dx < -0.38) want.add('ArrowLeft');
        if (dy > 0.38) want.add('ArrowDown'); if (dy < -0.38) want.add('ArrowUp');
        if (!o.walk && st.d > 40 && st.e > 18 && !st.lvl && !st.calm) want.add('ShiftLeft');
      }
      await setKeys(want);
      await sleep(70);
    }
  } finally { await releaseKeys(); }
  return { d: st ? st.d : 1e9, why, x: st && st.x, y: st && st.y };
}

/* ============================================================================ the autopilot */
// ACTION labels that are never the story's (home comforts, free-roam games, getting off, cameras)
const NOT_STORY = /downstairs|2-in-1|Sleep|Eat \(|REWIND|^Get off|^Park|Chitti Chase|^Start |race|Challenge|Play with|^Click \(|Borrow|Hire|Nakko|Ride auto|fare\)/i;
const STORY_OFFER = /^(CLAP|Clap|Set the self|Drag Nanna|Nanna,|Look down|Leave the cake|Send Immu|Get in the boat|Board the bus|Ask about|▶ PLAY|● REC|Climb to the|Go up|Up to|Ride (Hero|Hercules|Scooty|BSA|cycle|Ladies)|Fly the kite|Give|Light the|Talk|Take|Pick|Open|Count the|Ring|Wave|Buy|Empty|Eat|Drink|Hand|Show|Put|Use|Read)/;
/**
 * Play until done(s) is true. o: {timeout, hook(s) -> true (handled), choice(text, ch), noRetry, label}
 */
async function play(done, o) {
  o = o || {};
  const t0 = Date.now();
  let lastKey = '', same = 0, lastHb = Date.now(), lastFeed = 0, mgResT = 0, nearT = 0, idleT = Date.now();
  let s = null;
  for (;;) {
    s = await PROBE();
    await sample(s);
    if (await done(s)) return s;
    if (Date.now() - t0 > (o.timeout || 900000)) throw new Error('play timeout (' + (o.label || '?') + '): ' + JSON.stringify(s).slice(0, 600));
    if (Date.now() - lastFeed > 8000) { lastFeed = Date.now(); await ev(() => window.__R.feed()); }
    const key = [s.mode, s.mission, s.scene, s.obj, s.act, s.p.x >> 3, s.p.y >> 3, s.dlg && s.dlg.t, s.cut, s.mg].join('|');
    if (key !== lastKey) { same = 0; lastKey = key; idleT = Date.now(); if (VERBOSE) log('   · ' + [s.mode, s.mission || s.scene, s.obj, 'act=' + s.act, JSON.stringify(s.p), s.tgt ? 'tgt ' + Math.round(s.tgt.x) + ',' + Math.round(s.tgt.y) + ' ' + s.tgt.src : '', s.date].join(' | ')); }
    else same++;
    if (Date.now() - lastHb > 45000) { lastHb = Date.now(); log('   … ' + [s.mode, s.mission || s.scene, s.obj, 'act=' + s.act, JSON.stringify(s.p), s.tgt ? JSON.stringify(s.tgt) : '-', s.date, 'fps ' + s.fps].join(' | ')); }
    // ---- modal things first
    if (s.ask) {
      cls('read');
      const why = await ev(() => window.__R.fails.slice(-1)[0] || null);
      mark('fail', { why });
      await sleep(2200);
      if (o.noRetry) return s;
      await press('KeyE'); await sleep(900); continue;
    }
    if (s.shop) {
      // the story asks for a purchase at this counter ("Hire one cycle at Raju Cycle Taxi (₹3)"): the first row he can take, E
      if (o._shopObj !== s.obj) { o._shopObj = s.obj; o._shopTries = 0; }
      if (/hire|buy|rent|ticket|₹/i.test(s.obj) && o._shopTries < 3) {
        o._shopTries++;
        cls('read');
        await sleep(1800);
        const rs = await ev(() => { const rows = Array.from(document.querySelectorAll('.shop-row')); return { first: rows.findIndex((r) => !r.classList.contains('dis')), sel: rows.findIndex((r) => r.classList.contains('sel')), names: rows.slice(0, 5).map((r) => (r.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)) }; });
        log('   (shop for the story: ' + JSON.stringify(rs) + ')');
        if (rs.first >= 0 && rs.sel >= 0) { const k = rs.first - rs.sel; for (let q = 0; q < Math.abs(k); q++) await press(k > 0 ? 'ArrowDown' : 'ArrowUp', 1, 250); }
        await sleep(400); await press('KeyE'); await sleep(1400);
        if ((await PROBE()).shop) { await press('KeyE'); await sleep(1200); }
        continue;
      }
      log('   (a shop card opened: Escape)'); await press('Escape'); await sleep(300);
      o._farActOff = Date.now() + 8000; // no E at a counter for a while (it was not the story's)
      continue;
    }
    if (s.deck) { log('   (the 2-in-1 opened: Escape)'); await press('Escape'); await sleep(300); continue; }
    if (s.ptCard) { log('   (a party start card opened: N, not now)'); await press('KeyN'); await sleep(300); o._farActOff = Date.now() + 8000; continue; }
    if (s.journal || s.menuTop === 'map' || s.menuTop === 'pause') { await press('Escape'); await sleep(300); continue; }
    if (s.mg || s.mode === 'minigame') {
      cls('mg');
      if (s.mg && s.mg !== o._mg) { o._mg = s.mg; mark('hl', { what: 'mg', id: s.mg, w: 3 }); }
      if (s.mgResult) { mgResT = mgResT || Date.now(); if (Date.now() - mgResT > 2600) { await press('Enter'); mgResT = Date.now(); } } else mgResT = 0;
      await sleep(250); continue;
    }
    mgResT = 0;
    if (o.hook && (await o.hook(s))) { idleT = Date.now(); continue; }
    if (s.defs) { cls('read'); await sleep(7000); await press('KeyE'); await sleep(800); continue; }
    if (s.credits) { cls('credits'); await sleep(500); continue; }
    if (s.dlgOpen && s.dlg) { await readLine(s, o); continue; }
    if (s.cut) {
      cls('cut');
      if (s.csPrompt) { await sleep(2200); await press('KeyE'); await sleep(600); continue; }
      await sleep(200); continue;
    }
    if (s.panel) {
      cls('read');
      if (o.panel && (await o.panel(s)) !== false) continue;
      if (/s2-lock/.test(s.panel)) { await lockDial([1, 4, 0, 1]); continue; }
      await sleep(2000); await press('KeyE'); await sleep(500); continue;
    }
    if (s.gallery && s.mode === 'play') { cls('act'); await galleryStep(s.gallery); continue; }
    if (s.mode !== 'play') { await sleep(200); continue; }
    if (s.busy) { cls('cut'); await sleep(200); continue; }
    if (s.rec === 'prompt') { cls('read'); mark('hl', { what: 'rec', w: 3 }); await sleep(1300); await press('KeyE'); await sleep(500); continue; }
    if (s.jc) {
      cls('read');
      if (o.jcard === false) { await sleep(200); continue; }
      mark('hl', { what: 'jcard', w: 1 });
      await sleep(2800); await press('KeyE'); await sleep(900); continue;
    }
    if (s.dw && s.dw.panel) { cls('read'); await sleep(1500); await press('KeyE'); await sleep(500); continue; }
    // ---- in the world
    if (s.s1 && s.s1.queue && !s.s1.queue.done) {
      cls(s.s1.queue.tell ? 'act' : 'wait');
      if (s.s1.queue.tell) { await sleep(500); await press('KeyE'); }
      else if (s.s1.queue.gap) { await press('ArrowUp', 1, 180); }
      await sleep(150); continue;
    }
    if ((s.s1 && s.s1.ride) || (s.p.hidden && s.p.locked)) { cls('ride'); await sleep(250); continue; }
    if (s.p.pass) { cls('ride'); await sleep(250); continue; }
    if (s.p.locked) {
      cls('wait');
      o._lockT = o._lockT || Date.now();
      if (Date.now() - o._lockT > 25000) { mark('assist', { what: 'controls stayed locked 25 s: unlocked', obj: s.obj }); await ev(() => { N.player.controlsLocked = false; }); o._lockT = 0; }
      await sleep(200); continue;
    }
    o._lockT = 0;
    // a mission cycle to get on
    if (!s.p.veh && /get on|cycle|ride|pedal/i.test(s.obj)) {
      const b = await ev(() => window.__R.bike());
      if (b) { await mount(b); continue; }
    }
    // story.js "press" steps (ACTION anywhere: "Empty the tin", "▶ Play the tape")
    if (s.s1 && s.s1.step === 'press' && s.act) { cls('act'); await sleep(600); await press('KeyE'); await sleep(500); continue; }
    let tg = s.tgt;
    if (!tg && o.target) tg = await o.target(s);
    if (tg && (await levelStep(tg, s))) continue;
    if (tg) {
      const d = Math.hypot(tg.x - s.p.x, tg.y - s.p.y);
      // close enough and the goal offers its ACTION (a goal point inside a stall / counter): E
      if (d <= 40 && s.act && s.storyAct && !/downstairs|terrace|Climb|Up to|Go up/i.test(s.act) && Date.now() > (o._farActOff || 0)) {
        cls('act'); await press('KeyE'); await sleep(500);
        if ((await PROBE()).shop) { o._farActOff = Date.now() + 10000; }
        continue;
      }
      if (d > (o.near || 18)) {
        const r = await travel(tg.x, tg.y, { r: o.near ? o.near - 4 : 14, ms: 90000, objStop: true, stop: o.travelStop });
        if (r.why === 'stuck') await unstick(tg, s);
        continue;
      }
      nearT = nearT || Date.now();
      // at the goal: the story's ACTION at once; anything else offered there only after a few seconds of nothing
      // a mission cycle left standing (he must arrive ON it: "Carry the flour home" is a goto inVehicle): back on it
      if (!s.p.veh && !s.storyAct && Date.now() - nearT > 3000) { const b = await ev(() => window.__R.bike()); if (b) { log('   (back on the mission cycle)'); await mount(b); nearT = 0; continue; } }
      if (s.act && (s.storyAct || (!NOT_STORY.test(s.act) && (STORY_OFFER.test(s.act) || Date.now() - nearT > 6000))) && Date.now() > (o._farActOff || 0)) {
        cls('act'); await press('KeyE'); await sleep(500);
        if ((await PROBE()).shop) { o._farActOff = Date.now() + 10000; }
        continue;
      }
      // at the goal, nothing offered: wait for the game (an NPC walking up, a timer)
      cls('wait');
      if (Date.now() - idleT > 25000) { await stuckAssist(s); idleT = Date.now(); }
      await sleep(250); continue;
    }
    nearT = 0;
    if (s.act && (s.storyAct || (STORY_OFFER.test(s.act) && !NOT_STORY.test(s.act) && Date.now() > (o._farActOff || 0)))) { cls('act'); await press('KeyE'); await sleep(500); continue; }
    cls('wait');
    if (Date.now() - idleT > 30000) { await stuckAssist(s); idleT = Date.now(); }
    await sleep(250);
  }
}
/** Terraces: down the stairs to a ground goal, up the stairs to a roof goal (real E on the stairs). true = handled */
async function levelStep(tg, s) {
  const lp = await ev(([x, y, h]) => window.__R.levelPlan(x, y, h), [tg.x, tg.y, tg.h || 0]);
  if (!lp) return false;
  const d = Math.hypot(lp.x - s.p.x, lp.y - s.p.y);
  const want = lp.kind === 'down' ? /downstairs/i : /terrace|Climb|Up to|Go up/i;
  if (want.test(s.act) && d < 16) { cls('act'); await press('KeyE'); await sleep(900); return true; }
  if (d > 7) { await travel(lp.x, lp.y, { r: 5, ms: 60000, walk: d < 40 }); }
  else { await travel(lp.x + (Math.random() - 0.5) * 6, lp.y + (Math.random() - 0.5) * 6, { r: 2, ms: 1500, walk: true, direct: true }); }
  const a = await ev(() => N.input.actionLabel || '');
  if (want.test(a)) { cls('act'); await press('KeyE'); await sleep(900); }
  return true;
}
/** Get on the mission's cycle: walk up, and E only when ACTION offers the ride (next to a hire stand the nearest
 *  cycle may be another one, "Hire cycle": step round the mission's cycle until it is the one on offer). */
async function mount(b) {
  await travel(b.x, b.y, { r: 10, ms: 30000 });
  for (let k = 0; k < 10; k++) {
    const lab = await ev(() => N.input.actionLabel || '');
    if (/^(Ride|Get on|Pedal|Drive)\b/i.test(lab)) { cls('act'); await press('KeyE'); await sleep(700); return true; }
    if (await ev(() => !!N.player.vehicle)) return true;
    const a = k * Math.PI / 4;
    await stepTo(b.x + Math.cos(a) * 8, b.y + Math.sin(a) * 8, 2, 2500);
  }
  return false;
}
/** M12's gallery: pan the camera with the arrow keys to the raincoat, then E. */
async function galleryStep(g) {
  const dx = g.coat.x - g.cam.x, dy = g.coat.y - g.cam.y;
  if (Math.hypot(dx, dy) < 60) { await sleep(700); await press('KeyE'); await sleep(400); return; }
  const keys = new Set();
  if (dx > 20) keys.add('ArrowRight'); if (dx < -20) keys.add('ArrowLeft'); if (dy > 20) keys.add('ArrowDown'); if (dy < -20) keys.add('ArrowUp');
  await setKeys(keys); await sleep(260); await releaseKeys();
}
/** The 2026 lock dial (story2 lockState {sel, digits}): arrows to each digit, up to the number, E. */
async function lockDial(code) {
  mark('hl', { what: 'lock', w: 3 });
  await sleep(1800);
  for (let i = 0; i < code.length; i++) {
    let st = await ev(() => N.story2.lockState);
    if (!st) return;
    let guard = 0;
    while (st.sel !== i && guard++ < 6) { await press('ArrowRight', 1, 220); st = await ev(() => N.story2.lockState); if (!st) return; }
    const now = st.digits[i];
    for (let k = 0; k < (code[i] - now + 10) % 10; k++) await press('ArrowUp', 1, 260);
    await sleep(350);
  }
  await sleep(900);
  await press('KeyE');
  await sleep(1500);
}
/** Short precise steps with the arrow keys (the terrace parapet). */
async function stepTo(x, y, r, maxMs) {
  const t0 = Date.now();
  let d = Infinity;
  try {
    while (Date.now() - t0 < (maxMs || 4000)) {
      const p = await ev(() => ({ x: N.player.x, y: N.player.y, mode: N.state.mode }));
      if (p.mode !== 'play') break;
      const dx = x - p.x, dy = y - p.y; d = Math.hypot(dx, dy);
      if (d <= r) break;
      const th = Math.min(4, Math.max(1.2, d * 0.35)), keys = new Set();
      if (dx > th) keys.add('ArrowRight'); if (dx < -th) keys.add('ArrowLeft'); if (dy > th) keys.add('ArrowDown'); if (dy < -th) keys.add('ArrowUp');
      if (!keys.size) keys.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
      await setKeys(keys);
      await sleep(40);
    }
  } finally { await releaseKeys(); }
  return d;
}
/** Deepon ki Raat: the 21 diyas on the terrace parapet, each lit with a held E (the match), nearest first. */
async function diyaHook(s) {
  if (!(s.dw && s.dw.terrace && s.p.lvl === 'home_terrace') || s.mode !== 'play' || s.dlgOpen) return false;
  cls('act');
  const T = await ev(() => N.dwMissions.debug.state().terrace);
  if (!T || T.lit >= T.n) { await sleep(250); return true; }
  let tgt = null, bd = 1e9;
  for (const d of T.diyas) { if (d.lit) continue; const dd = Math.hypot(d.x - s.p.x, d.y - s.p.y); if (dd < bd) { bd = dd; tgt = d; } }
  if (!tgt) { await sleep(150); return true; }
  if (!/Light the diya/.test(s.act) || bd > 6) await stepTo(tgt.x - tgt.nx * 3, tgt.y - tgt.ny * 3, 2.5, 4000);
  if (/Light the diya/.test(await ev(() => N.input.actionLabel || ''))) {
    const n0 = T.lit;
    await page.keyboard.down('KeyE');
    await page.waitForFunction((n0) => { const d = N.dwMissions.debug.state(); return !d.terrace || d.terrace.lit > n0; }, n0, { timeout: 2500, polling: 50 }).catch(() => {});
    await page.keyboard.up('KeyE');
  }
  return true;
}
/** A short 3D showcase (V): third person for `secs`, a few seconds of first person, then back to top-down.
 *  The engine loading / streaming in is marked 'skip' (cut); the 3D shots play at 1x. */
async function showcase3D(what, secs) {
  await releaseKeys();
  cls('skip');
  await press('KeyV');
  const ok = await page.waitForFunction(() => N.view.mode === 'tps' || N.view.available === false, null, { timeout: 120000, polling: 250 }).then(() => true, () => false);
  if (!ok || !(await ev(() => N.view.mode === 'tps'))) { log('   (3D view did not start)'); await ev(() => N.view.set('top')); return false; }
  try { await ev(() => N.view3d.settle && N.view3d.settle(6000)); } catch (e) { /* ignore */ }
  await sleep(1500);
  const fps0 = await ev(() => N.perf.fps);
  cls('show3d'); mark('hl', { what: '3d', where: what, w: 5 });
  const run = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await PROBE(); if (s.dlgOpen && s.dlg) { await readLine(s); cls('show3d'); continue; } await sleep(200); } };
  await run(secs * 1000);
  cls('skip'); await press('KeyV');
  if (await page.waitForFunction(() => N.view.mode === 'fps', null, { timeout: 20000 }).then(() => true, () => false)) {
    await sleep(600); cls('show3d'); await run(3500); cls('skip');
  }
  await press('KeyV');
  await page.waitForFunction(() => N.view.mode === 'top', null, { timeout: 20000 }).catch(() => ev(() => N.view.set('top')));
  await sleep(900);
  log('   3D showcase "' + what + '" done (fps ' + fps0 + ')');
  return true;
}
/** The route led nowhere: hop over the obstacle (a debug teleport, marked as a cut so the stuck stretch is dropped). */
async function unstick(tg, s) {
  mark('assist', { what: 'unstick', at: s.p, tgt: { x: Math.round(tg.x), y: Math.round(tg.y) }, obj: s.obj });
  cls('skip');
  const hop = await ev(([x, y]) => {
    const p = N.player, v = p.vehicle, x0 = p.x, y0 = p.y;
    // past the obstacle only: ~160 u along a path to the goal (the rest of the way is walked / ridden for real)
    let pts = null;
    try { pts = window.__R.planAround(x, y, 300); } catch (e) { pts = null; }
    if (!pts) { try { const q = N.npcs.planPath(p.x, p.y, x, y); pts = q && q.map((c) => [c.x, c.y]); } catch (e) { pts = null; } }
    let q = { x, y };
    if (pts && pts.length) {
      let acc = 0, px = p.x, py = p.y;
      for (const c of pts) {
        const L = Math.hypot(c[0] - px, c[1] - py);
        if (acc + L >= 160) { const f = (160 - acc) / L; q = { x: px + (c[0] - px) * f, y: py + (c[1] - py) * f }; break; }
        acc += L; px = c[0]; py = c[1]; q = { x: px, y: py };
      }
    }
    const fr = N.world.findFree(q.x, q.y, v ? 'drive' : 'walk', 30); if (fr) q = fr;
    if (N.story2 && N.story2.tp) N.story2.tp(q.x, q.y); else if (v) { v.x = q.x; v.y = q.y; v.vx = v.vy = 0; v.speed = 0; p.x = v.x; p.y = v.y; } else p.teleport(q.x, q.y);
    if (N.render.snapCamera) N.render.snapCamera();
    return Math.round(Math.hypot(p.x - x0, p.y - y0));
  }, [tg.x, tg.y]);
  log('   (unstick hop ' + hop + ' u)');
  await sleep(600);
  cls('travel');
}
/** Nothing has moved for a long time: the story's own skip for the current step (debug), reported. */
const assistN = {};
async function stuckAssist(s) {
  const key = (s.mission || s.scene || '-') + '|' + s.obj;
  assistN[key] = (assistN[key] || 0) + 1;
  if (assistN[key] > 4) throw new Error('hopeless: the same step was skipped 4 times without progress: ' + key);
  const k = await ev(() => (N.story && N.story.debug && N.story.debug.skip()) || (N.dwMissions && N.dwMissions.debug && N.dwMissions.debug.skip && N.dwMissions.debug.skip()) || null);
  mark('assist', { what: 'step skip', step: k, obj: s.obj, mission: s.mission || s.scene, at: s.p });
}

/* ============================================================================ free roam: to the next giver */
/** Long trips: hail an auto with a real horn (Space) and ride it ("AUTO → place", the game's own ▶▶). */
async function autoRide(tx, ty, name) {
  // the waypoint on the full map is what a player taps; the auto card lists it at the top
  const ok = await ev(([x, y]) => { try { N.menus.waypoint(x, y); return true; } catch (e) { return false; } }, [tx, ty]);
  if (!ok) return false;
  // walk to the nearest road first
  const rp = await ev(() => { const r = N.world.nearestRoadPoint(N.player.x, N.player.y); return r ? { x: r.x, y: r.y, d: r.dist } : null; });
  if (rp && rp.d > 30) await travel(rp.x, rp.y, { r: 20, ms: 30000 });
  // the fare: top up the pocket money when short (debug assist; the real economy may not stretch to a cross-city ride)
  const fare = await ev(([x, y]) => { const f = N.shops.autoFare(N.player.x, N.player.y, x, y); return { ask: f.ask, money: N.player.money }; }, [tx, ty]);
  if (fare.money < fare.ask + 500) { await ev((p) => N.debug.give(p), fare.ask + 2000 - fare.money); mark('assist', { what: 'money for the auto', paise: fare.ask + 2000 - fare.money }); }
  cls('act');
  await press('Space'); await sleep(200);
  mark('hl', { what: 'auto', w: 1 });
  // the auto pulls up; its card opens by itself when it is close
  const t0 = Date.now();
  let opened = false;
  while (Date.now() - t0 < 30000) {
    const s = await PROBE();
    if (s.shop) { opened = true; break; }
    if (s.dlgOpen) { await readLine(s); continue; }
    cls('wait');
    await sleep(250);
  }
  if (!opened) { log('   (auto: no card)'); await ev(() => { try { N.menus.waypoint(null); } catch (e) { /* ignore */ } }); return false; }
  cls('read');
  await sleep(1800);
  // the rows: the mission goal (if any) and "your waypoint" come first; pick the waypoint row
  const rows = await ev(() => Array.from(document.querySelectorAll('.shop-row, [data-row], .sh-row')).map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).slice(0, 8));
  const wi = Math.max(0, rows.findIndex((t) => /waypoint/i.test(t)));
  log('   auto rows: ' + JSON.stringify(rows.slice(0, 4)) + ' -> ' + wi);
  for (let k = 0; k < wi; k++) await press('ArrowDown', 1, 250);
  await sleep(400); await press('KeyE'); await sleep(1500);
  // the quote: "Pay ₹X (das upar)" is the first row
  await press('KeyE'); await sleep(400);
  cls('cut');
  // the ▶▶ ride
  const t1 = Date.now();
  while (Date.now() - t1 < 20000) { const s = await PROBE(); if (!s.shop && s.mode === 'play' && !s.busy && Math.hypot(s.p.x - tx, s.p.y - ty) < 400) break; await sleep(200); }
  await sleep(1200);
  await ev(() => { try { N.menus.waypoint(null); } catch (e) { /* ignore */ } });
  mark('travel', { mode: 'auto', to: name });
  return true;
}
/** From wherever the last chapter ended, to the giver of `id` (the next main mission), then E on its J-card. */
async function toGiver(id, o) {
  o = o || {};
  for (let attempt = 0; attempt < 8; attempt++) {
    const g = await ev((id) => window.__R.giver(id), id);
    if (!g) throw new Error('no giver for ' + id);
    const s = await PROBE();
    log('   toGiver ' + id + ' #' + attempt + ': giver ' + JSON.stringify(g) + ' me ' + JSON.stringify(s.p) + ' mode ' + s.mode + ' prompt ' + s.prompt + ' jc ' + s.jc + ' "' + s.jcText.slice(0, 80) + '" mission ' + s.mission);
    if (s.mission === id) return true;
    if (s.mission && s.mission !== id) {
      // an odd job / side activity started under him (its J-card dwell): quit it like a player stepping away
      log('   (a stray mission started: ' + s.mission + ' -> quit)');
      mark('assist', { what: 'quit stray mission', id: s.mission });
      await ev(() => { try { N.missions.abort(); } catch (e) { /* ignore */ } });
      cls('skip'); await sleep(800); continue;
    }
    if (s.prompt === id && s.jc) {
      cls('read'); mark('hl', { what: 'jcard', w: 2 });
      if (await page.waitForFunction((id) => N.missions.active && N.missions.active.id === id, id, { timeout: 3000, polling: 100 }).then(() => true, () => false)) return true;
      if (await ev((id) => N.missions.prompt === id, id)) await press('KeyE');
      const ok = await page.waitForFunction((id) => N.missions.active && N.missions.active.id === id, id, { timeout: 8000 }).then(() => true, () => false);
      if (ok) return true;
      continue;
    }
    if (s.dlgOpen && s.dlg) { await readLine(s); continue; }
    if (s.mode !== 'play') { await sleep(300); continue; }
    const d = Math.hypot(g.x - s.p.x, g.y - s.p.y);
    if (d > (o.autoOver || 5200) && !o.noAuto) {
      const ok = await autoRide(g.x, g.y, o.name || id);
      if (ok) continue;
    }
    if ((d < 60 && attempt > 0) || (!g.avail && d < 140)) {
      // near the ring but no J-card / no giver: step out (story.js: a giver waits until he has stepped 70 u away from
      // where he loaded or passed the last mission) and come back: a walkable spot ~120 u from the giver, far from here
      const out = await ev(([x, y]) => {
        const p = N.player; let best = null, bs = -1;
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, qx = x + Math.cos(a) * 120, qy = y + Math.sin(a) * 120; if (!N.world.isWalkable(qx, qy)) continue; const sc = Math.hypot(qx - p.x, qy - p.y); if (sc > bs) { bs = sc; best = { x: qx, y: qy }; } }
        return best || { x: x + 120, y: y };
      }, [g.x, g.y]);
      log('   (step out to ' + Math.round(out.x) + ',' + Math.round(out.y) + ')');
      await travel(out.x, out.y, { r: 12, ms: 25000, walk: true });
      await sleep(600);
    }
    if (await levelStep(g, s)) continue; // on a terrace: down the stairs first
    const r = await travel(g.x, g.y, { r: Math.max(5, g.r - 6), ms: 240000, stop: async () => (await ev((id) => N.missions.prompt === id || !!N.missions.active, id)) });
    if (r.why === 'stuck') await unstick(g, s);
    await sleep(400);
    // the J-card
    const ok = await page.waitForFunction((id) => N.missions.prompt === id || (N.missions.active && N.missions.active.id === id), id, { timeout: 5000 }).then(() => true, () => false);
    if (!ok) continue;
    const s2 = await PROBE();
    if (s2.mission === id) return true;
    cls('read'); mark('hl', { what: 'jcard', w: 2 });
    // (a J-card also starts by itself after its dwell: then no E, it would reach whatever is next to him)
    if (await page.waitForFunction((id) => N.missions.active && N.missions.active.id === id, id, { timeout: 3000, polling: 100 }).then(() => true, () => false)) return true;
    if (!(await ev((id) => N.missions.prompt === id, id))) continue;
    await press('KeyE');
    if (await page.waitForFunction((id) => N.missions.active && N.missions.active.id === id, id, { timeout: 8000 }).then(() => true, () => false)) return true;
  }
  throw new Error('could not start ' + id + ' from its giver');
}
const passed = (id) => async (s) => !s.mission && !s.scene && !s.ask && (await ev((id) => N.missions.isDone(id), id));
/** after MISSION PASSED: let the banner, the tape counter roll and the autosave play out */
async function afterPass(secs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (secs || 7) * 1000) {
    const s = await PROBE();
    if (s.dlgOpen && s.dlg) { await readLine(s); continue; }
    cls(s.cut ? 'cut' : 'act');
    await sleep(250);
  }
}
async function storyTune() {
  await ev(() => {
    if (N.story && N.story.debug) { N.story.debug.mg = 'win'; N.story.debug.mgTimeScale = 1; N.story.debug.fastRides = false; }
    if (N.story2) N.story2.TUNE.mg = { autoplay: 'win', skipHowto: true, timeScale: 1 };
    N.debug.skipDialogue(false);
    // the player's own setting: fast typewriter (the line then stays up for a read, see READ)
    try { if (N.settings && N.settings.set) N.settings.set('textSpeed', 'fast'); } catch (e) { /* ignore */ }
  });
}
async function continueGame() {
  await sleep(1500);
  cls('skip');
  const has = await ev(() => { const b = document.querySelector('[data-act=continue]'); return !!(b && b.offsetParent !== null); });
  if (!has) throw new Error('no CONTINUE on the title');
  await page.click('[data-act=continue]');
  await page.waitForFunction(() => N.state.mode !== 'title', null, { timeout: 30000 });
  await storyTune();
  await sleep(500);
}
async function saveNow() {
  return ev((key) => { try { return localStorage.getItem(key); } catch (e) { return null; } }, SAVE_KEY);
}

/* ============================================================================ sessions */
async function sTitleM1() {
  // the title: a few seconds of the cassette J-card, then ▶ PLAY (a real click), the name card (Enter, Enter)
  await ev(() => { N.menus.quickStart = false; });
  mark('chapter', { id: '00_prologue' });
  cls('cut');
  await sleep(4500);
  await page.click('#title-start');
  await page.waitForFunction(() => N.menus.debugState().top === 'name', null, { timeout: 20000 });
  cls('read');
  await sleep(2500);
  await press('Enter', 1, 900); await press('Enter', 1, 400);
  await page.waitForFunction(() => N.state.mode === 'cutscene', null, { timeout: 20000 });
  await storyTune();
  // the 2026 prologue -> ◀◀ REWIND -> Track 01 starts on the terrace
  await play((s) => s.mission === 'bo_kaata' && s.mode === 'play' && !s.cut, { label: 'prologue', timeout: 600000 });
  mark('chapter', { id: '01_bo_kaata' });
  await play(passed('bo_kaata'), { label: 'bo_kaata', timeout: 1200000 });
  mark('hl', { what: 'passed', w: 2 });
  await afterPass(8);
}
function mainSession(id, o) {
  return async () => {
    o = o || {};
    await continueGame();
    if (o.before) await o.before();
    mark('chapter', { id: o.chapter });
    cls('act');
    await sleep(1500);
    await toGiver(id, o);
    await play(passed(id), Object.assign({ label: id, timeout: 1800000 }, o.play || {}));
    mark('hl', { what: 'passed', w: 2 });
    await afterPass(o.after || 8);
  };
}
const SESSIONS = [
  { id: 's00', chapters: ['00_prologue', '01_bo_kaata'], fresh: true, run: sTitleM1 },
  { id: 's02', chapters: ['02_lost_and_found'], run: mainSession('lost_and_found', { chapter: '02_lost_and_found', name: 'Mozamjahi Market' }) },
  { id: 's03', chapters: ['03_first_day_first_show'], run: mainSession('first_day_first_show', { chapter: '03_first_day_first_show', name: 'home' }) },
  { id: 's04', chapters: ['04_last_man_batting'], run: mainSession('last_man_batting', { chapter: '04_last_man_batting', name: 'home' }) },
  { id: 's05', chapters: ['05_right_right'], run: mainSession('right_right', { chapter: '05_right_right', name: 'home' }) },
  { id: 's06', chapters: ['06_ammammas_thursday'], run: mainSession('ammammas_thursday', { chapter: '06_ammammas_thursday', name: 'home', play: { hook: walkmanHook } }) },
  { id: 's07', chapters: ['07_the_clap'], run: mainSession('the_clap', { chapter: '07_the_clap', name: 'home' }) },
  { id: 's08', chapters: ['08_drums_for_amma'], run: mainSession('drums_for_amma', { chapter: '08_drums_for_amma', name: 'home' }) },
  { id: 's09', chapters: ['09_opening_day'], run: mainSession('opening_day', { chapter: '09_opening_day', name: "Immu's house" }) },
  { id: 's10', chapters: ['10_agle_baras'], run: mainSession('agle_baras', { chapter: '10_agle_baras', name: 'the colony ground' }) },
];

/* ---------------------------------------------------------------------------- Diwali week, the interlude */
/** Ammamma's swing (the Diwali chapter's J-card: "Wait till … ▶▶" / "Sleep ▶▶"): walk in, read it, E. */
async function toSwing(re, what) {
  for (let k = 0; k < 4; k++) {
    const c = await ev(() => { const s = N.dwMissions.story.state(); return s.card ? { x: s.card.x, y: s.card.y } : null; });
    if (!c) { log('   (no swing card: ' + what + ')'); return false; }
    const s0 = await PROBE();
    if (Math.hypot(c.x - s0.p.x, c.y - s0.p.y) < 14 && k > 0) {
      // standing on it with no card: step out and back in
      const out = await ev(([x, y]) => N.world.findFree(x + 50, y + 40, 'walk', 30) || { x: x + 50, y: y + 40 }, [c.x, c.y]);
      await travel(out.x, out.y, { r: 8, ms: 12000, walk: true });
    }
    if (await levelStep(c, s0)) { k--; continue; }
    await travel(c.x, c.y, { r: 5, ms: 120000 });
    const ok = await page.waitForFunction((src) => new RegExp(src).test((document.querySelector('.hud-jcard.show') || {}).innerText || ''), re.source, { timeout: 5000, polling: 100 }).then(() => true, () => false);
    if (!ok) continue;
    cls('read'); mark('hl', { what: 'swing', w: 1 });
    await sleep(3200); await press('KeyE');
    await sleep(1200);
    return true;
  }
  return false;
}
let walkmanDone = false;
/** M6: "Wait for the current" — the walkman tutorial: Q plays a tape while the flour mill waits. */
async function walkmanHook(s) {
  if (walkmanDone || s.mode !== 'play' || !/Wait for the current/i.test(s.obj)) return false;
  walkmanDone = true;
  await sleep(1200); await press('KeyQ'); mark('hl', { what: 'walkman', w: 2 });
  return true;
}
let shown3D = false;
/** Chand Raat: once, a calm moment on foot near Charminar -> the 3D showcase. */
async function charminar3D(s) {
  if (shown3D || s.mode !== 'play' || s.dlgOpen || s.cut || s.chase || s.gallery || s.p.veh || s.p.locked || s.p.lvl) return false;
  const d = await ev(() => { const c = N.places.charminar; return c ? Math.hypot(N.player.x - c.x, N.player.y - c.y) : 1e9; });
  if (d > 260) return false;
  shown3D = true;
  await showcase3D('charminar chand raat', 10);
  return true;
}
async function sDiwali() {
  await continueGame();
  mark('chapter', { id: '11_diwali_week' });
  // the way in (MON 20 OCT 2003): the card, Amma and Ammamma
  await play(async (s) => s.mode === 'play' && !s.cut && !s.dlgOpen && !s.scene && !s.busy && s.dws && s.dws.week === 'week' && !!s.dws.card, { label: 'diwali way in', jcard: false, timeout: 240000 });
  await afterPass(2);
  // ▶▶ to Deepavali afternoon
  await toSwing(/Wait till/, 'Mon 20 Oct');
  await play(async (s) => /SAT 25 OCT/.test(s.date) && !s.busy && s.mode === 'play' && !s.cut && !s.dlgOpen, { label: 'to Sat', jcard: false, timeout: 120000 });
  await afterPass(2);
  await toGiver('mithai_run', { noAuto: true });
  await play(passed('mithai_run'), { label: 'mithai_run', timeout: 1200000 });
  mark('hl', { what: 'passed', w: 2 });
  await afterPass(5);
  // the evening: ▶▶ to 18:30 if needed, then Ammamma's Deepon ki Raat (gentler gusts: the test tune story_full uses)
  await ev(() => { const T = N.dwMissions.TUNE; T.gustFirst = 40; T.gustEvery = [40, 50]; });
  if (await ev(() => N.clock.minutes < 18 * 60 + 30)) {
    await toSwing(/Wait till 18:30/, 'Sat afternoon');
    await play(async (s) => !s.busy && s.mode === 'play' && !s.cut && !s.dlgOpen && (await ev(() => N.clock.minutes >= 18 * 60 + 30)), { label: 'to 18:30', jcard: false, timeout: 60000 });
  }
  mark('assist', { what: 'Deepon ki Raat: gentler gusts (TUNE.gustFirst 40, gustEvery [40, 50], as tests/story_full.cjs)' });
  await toGiver('deepon_ki_raat', { noAuto: true });
  await play(passed('deepon_ki_raat'), { label: 'deepon_ki_raat', timeout: 1200000, hook: diyaHook });
  mark('hl', { what: 'passed', w: 3 });
  await afterPass(6);
  if (await ev(() => N.player.level === 'home_terrace' && N.state.mode === 'play')) await showcase3D('diwali terrace', 9);
  // Diwali's done: Sleep ▶▶ -> the outro -> the interlude
  await toSwing(/Sleep/, "Diwali's done");
  await play(async (s) => s.scene === 'interlude', { label: 'outro', timeout: 240000 });
  mark('chapter', { id: '12_interlude' });
  await play(async (s) => !s.scene && !s.cut && s.mode === 'play' && !s.dlgOpen && (await ev(() => !!N.flags.interlude_done)), { label: 'interlude', timeout: 600000 });
  await afterPass(4);
}
async function sEnding() {
  await continueGame();
  mark('chapter', { id: '15_ending' });
  // Eid morning -> the night at Charminar -> the kites -> ... -> the epilogue (2026, playable) -> definitions -> credits
  await play(async (s) => s.scene === 'epilogue', { label: 'ending', timeout: 1200000, jcard: false });
  mark('chapter', { id: '16_epilogue' });
  await play(async (s) => s.defs || s.credits, { label: 'epilogue', timeout: 1200000, jcard: false });
  mark('chapter', { id: '17_credits' });
  await play(async (s) => !!(s.panel && /s2-rewind/.test(s.panel)), { label: 'credits', timeout: 1200000, jcard: false });
  cls('read');
  mark('hl', { what: 'rewind', w: 1 });
  await sleep(4000);
}
SESSIONS.push(
  { id: 's11', chapters: ['11_diwali_week', '12_interlude'], run: sDiwali, forceSave: true },
  { id: 's13', chapters: ['13_last_bell'], run: mainSession('last_bell', { chapter: '13_last_bell', name: 'school' }) },
  { id: 's14', chapters: ['14_chand_raat'], run: mainSession('chand_raat', { chapter: '14_chand_raat', name: 'home', after: 3.5, play: { hook: charminar3D } }) },
  { id: 's15', chapters: ['15_ending', '16_epilogue', '17_credits'], run: sEnding },
);
SESSIONS.find((q) => q.id === 's10').run = mainSession('agle_baras', { chapter: '10_agle_baras', name: 'the colony ground', after: 3.5 });

/* ============================================================================ record */
async function recordSession(sess) {
  const prevIdx = SESSIONS.indexOf(sess) - 1;
  let raw = '';
  if (!sess.fresh) {
    const prev = SESSIONS[prevIdx];
    const f = path.join(SAVES, 'after_' + prev.id + '.json');
    if (!fs.existsSync(f)) throw new Error('no save after ' + prev.id + ' (record it first)');
    raw = readJSON(f).raw;
  }
  logFile = path.join(RAW, sess.id + '.log');
  fs.writeFileSync(logFile, '');
  log('=== session ' + sess.id + ' (' + sess.chapters.join(', ') + ')');
  pageErrors.length = 0; held = new Set(); lastSample = 0;
  await openSession(sess, raw);
  let ok = false, err = null;
  try {
    await sess.run();
    ok = true;
  } catch (e) { err = e; log('!! session ' + sess.id + ' failed: ' + (e.stack || e.message)); try { await page.screenshot({ path: path.join(RAW, sess.id + '_error.png') }); } catch (e2) { /* ignore */ } }
  mark('end', {});
  let save = null;
  // a session that ends in free roam (no MISSION PASSED autosave since the last scene): save as at an STD booth
  if (ok && sess.forceSave) { try { await ev(() => N.save.save({ reason: 'std', toast: false })); } catch (e) { /* ignore */ } }
  try { save = await saveNow(); } catch (e) { /* ignore */ }
  const stats = await ev(() => ({ passes: window.__R.passes, fails: window.__R.fails, errors: N.debug.state().errors.slice(0, 10), date: N.calendar.label(), counter: N.tape.counter })).catch(() => null);
  const webm = await closeSession();
  const dur = probeDur(webm);
  writeJSON(path.join(RAW, sess.id + '.timeline.json'), { session: sess.id, chapters: sess.chapters, dur, cls: TL.cls, marks: TL.marks, samples: TL.samples, stats, errors: pageErrors.slice(0, 20), ok });
  log('session ' + sess.id + ': ' + (ok ? 'OK' : 'FAILED') + ', video ' + dur.toFixed(1) + ' s, ' + JSON.stringify(stats));
  if (ok && save) {
    writeJSON(path.join(SAVES, 'after_' + sess.id + '.json'), { raw: save, t: new Date().toISOString() });
    setProgress('sessions', sess.id, { done: true, t: new Date().toISOString(), dur, webm });
  }
  TL = null;
  if (!ok) throw err;
}
function probeDur(f) {
  try { return +cp.execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim() || 0; } catch (e) { return 0; }
}

/* ============================================================================ edit (ffmpeg) */
const SPEED = { read: 1, cut: 1, act: 1, mg: 1, ride: 1.5, wait: 2, travel: 3, credits: 1.25, show3d: 1 };
function ff(args, o) {
  // FF_THREADS=1: leave the cores to a recording that runs at the same time
  if (process.env.FF_THREADS) { const k = args.indexOf('-c:v'); if (k >= 0) args = args.slice(0, k).concat(['-threads', process.env.FF_THREADS], args.slice(k)); }
  const r = cp.spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y'].concat(args), Object.assign({ encoding: 'utf8', maxBuffer: 1 << 26 }, o || {}));
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + (r.stderr || '').slice(-1500) + '\nargs: ' + args.join(' ').slice(0, 800));
  return r;
}
function ensureFonts() {
  fs.mkdirSync(FONTS, { recursive: true });
  const want = ['YatraOne-latin-400', 'VT323-latin-400', 'Baloo2-latin'];
  if (want.every((n) => fs.existsSync(path.join(FONTS, n + '.ttf')))) return;
  // woff2 -> TTF (fontTools + brotli): drawtext cannot read woff2
  const py = "import sys\nfrom fontTools.ttLib import TTFont\nfor n in sys.argv[2:]:\n  f=TTFont(sys.argv[1]+'/'+n+'.woff2'); f.flavor=None; f.save(n+'.ttf')\n";
  cp.execFileSync('python3', ['-I', '-c', py, path.join(ROOT, 'vendor', 'fonts')].concat(want), { cwd: FONTS });
}
/** The chapter's segments from its session timeline: [{a, b, k, sp}] (video seconds). */
function chapterSegments(tl, chId) {
  const marks = tl.marks.filter((m) => m.type === 'chapter');
  const i = marks.findIndex((m) => m.id === chId);
  if (i < 0) throw new Error('chapter ' + chId + ' not in ' + tl.session);
  const a0 = marks[i].t;
  const endM = tl.marks.find((m) => m.type === 'end');
  const b0 = i + 1 < marks.length ? marks[i + 1].t : Math.min(tl.dur || 1e9, endM ? endM.t + 0.5 : 1e9);
  // class runs inside [a0, b0]
  const runs = [];
  const C = tl.cls;
  for (let j = 0; j < C.length; j++) {
    const a = Math.max(a0, C[j].t), b = Math.min(b0, j + 1 < C.length ? C[j + 1].t : b0);
    if (b > a) runs.push({ a, b, k: C[j].k });
  }
  // the class active at a0 (a run that started before the chapter mark)
  if (runs.length && runs[0].a > a0) { const prev = C.filter((c) => c.t <= a0).slice(-1)[0]; if (prev) runs.unshift({ a: a0, b: runs[0].a, k: prev.k }); }
  // game-time compensation: a stretch where the game ran slower than the wall clock (fps < 20) plays faster
  const rate = (a, b) => {
    const S = tl.samples.filter((q) => q.t >= a - 1 && q.t <= b + 1);
    if (S.length < 2) return 1;
    const dw = S[S.length - 1].t - S[0].t, dr = S[S.length - 1].r - S[0].r;
    return dw > 0 && dr > 0 ? Math.min(1, dr / dw) : 1;
  };
  let segs = [];
  for (const r of runs) {
    if (r.k === 'skip') continue;
    let sp = SPEED[r.k] || 1;
    if (r.k === 'travel' && r.b - r.a > 45) sp = 4;
    if (r.k === 'mg' && r.b - r.a > 25) sp = 1.5;
    if (r.k === 'wait' && r.b - r.a > 20) sp = 3;
    if (r.k !== 'read' && sp > 1) sp = sp / Math.max(0.5, rate(r.a, r.b));
    segs.push({ a: r.a, b: r.b, k: r.k, sp: +sp.toFixed(3) });
  }
  // tiny runs take their neighbour's speed; equal speeds that touch merge
  for (let j = 0; j < segs.length; j++) if (segs[j].b - segs[j].a < 0.6 && j > 0 && Math.abs(segs[j - 1].b - segs[j].a) < 0.01) segs[j].sp = segs[j - 1].sp;
  const out = [];
  for (const s of segs) {
    const L = out[out.length - 1];
    if (L && Math.abs(L.b - s.a) < 0.01 && L.sp === s.sp) { L.b = s.b; L.k = L.k === s.k ? L.k : L.k + '+' + s.k; }
    else out.push(Object.assign({}, s));
  }
  return out.filter((s) => s.b - s.a > 0.05);
}
function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%'); }
/** 2.6 s title card over a blurred, darkened still of the chapter. */
function titleCard(ch, still, out) {
  ensureFonts();
  const F = (n) => path.join(FONTS, n + '.ttf');
  const D = 2.6;
  const vf = [
    'scale=' + W + ':' + H, 'boxblur=12:2', 'eq=brightness=-0.28:saturation=0.7', 'format=yuv420p',
    "drawbox=x=0:y=ih/2-120:w=iw:h=240:color=0x1a1214@0.55:t=fill",
    "drawtext=fontfile='" + F('VT323-latin-400') + "':text='" + esc(ch.top) + "':fontsize=46:fontcolor=0xf2c230:x=(w-text_w)/2:y=h/2-104",
    "drawtext=fontfile='" + F('YatraOne-latin-400') + "':text='" + esc(ch.title) + "':fontsize=72:fontcolor=0xfff4dc:shadowcolor=0x1a1214:shadowx=3:shadowy=3:x=(w-text_w)/2:y=h/2-48",
    "drawtext=fontfile='" + F('Baloo2-latin') + "':text='" + esc(ch.sub) + "':fontsize=30:fontcolor=0xe8d9b5:x=(w-text_w)/2:y=h/2+50",
    "drawtext=fontfile='" + F('VT323-latin-400') + "':text='NOSTALGIA':fontsize=28:fontcolor=0xff5fb0:x=w-text_w-28:y=h-44",
    'fade=t=in:st=0:d=0.5', 'fade=t=out:st=' + (D - 0.45) + ':d=0.45',
  ].join(',');
  ff(['-loop', '1', '-t', String(D), '-i', still, '-vf', vf, '-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out]);
  return D;
}
function editChapter(chId) {
  const sess = SESSIONS.concat(LATE_SESSIONS).find((s) => s.chapters.indexOf(chId) >= 0);
  const tl = readJSON(path.join(RAW, sess.id + '.timeline.json'));
  if (!tl) throw new Error('no timeline for ' + sess.id);
  const webm = path.join(RAW, sess.id + '.mkv');
  const segs = chapterSegments(tl, chId);
  const wd = path.join(WORK, chId);
  fs.rmSync(wd, { recursive: true, force: true }); fs.mkdirSync(wd, { recursive: true });
  // a still for the title card: a few seconds into the first non-skip segment
  const st0 = segs.length ? Math.min(segs[0].b - 0.1, segs[0].a + 2) : 1;
  const still = path.join(wd, 'still.png');
  ff(['-ss', String(st0.toFixed(2)), '-i', webm, '-frames:v', '1', still]);
  const list = [];
  const td = titleCard(CH[chId], still, path.join(wd, 'c000.mp4'));
  list.push('c000.mp4');
  let tOut = td;
  const map = [];
  // a debug hop over an obstacle (unstick) is a jump in the picture: a 0.8 s "▶▶" VCR card makes it a travel cut
  const cutAt = new Set();
  for (const m of tl.marks) if (m.type === 'assist' && m.what === 'unstick') { const k = segs.findIndex((g) => g.a >= m.t - 0.05); if (k > 0) cutAt.add(k); }
  const ffCard = (i, at) => {
    const st = path.join(wd, 'ff' + i + '.png'), f = 'f' + String(i).padStart(3, '0') + '.mp4';
    ff(['-ss', at.toFixed(2), '-i', webm, '-frames:v', '1', st]);
    ff(['-loop', '1', '-t', '0.8', '-i', st, '-vf', 'scale=' + W + ':' + H + ",eq=brightness=-0.18:saturation=0.6,noise=alls=18:allf=t,drawtext=fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf':text='▶▶  F.FWD':fontsize=60:fontcolor=white:shadowcolor=black:shadowx=3:shadowy=3:box=1:boxcolor=black@0.45:boxborderw=18:x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p", '-r', '30', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', path.join(wd, f)]);
    return f;
  };
  segs.forEach((s, i) => {
    if (cutAt.has(i)) { const cf = ffCard(i, s.a + 0.2); list.push(cf); tOut += 0.8; }
    const f = 'c' + String(i + 1).padStart(3, '0') + '.mp4';
    const dur = s.b - s.a;
    ff(['-ss', s.a.toFixed(3), '-t', dur.toFixed(3), '-i', webm, '-an', '-vf', 'setpts=(PTS-STARTPTS)/' + s.sp + ',fps=30,scale=' + W + ':' + H + ',format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', path.join(wd, f)]);
    list.push(f);
    map.push({ a: s.a, b: s.b, sp: s.sp, o: tOut, k: s.k });
    tOut += dur / s.sp;
  });
  fs.writeFileSync(path.join(wd, 'list.txt'), list.map((f) => "file '" + f + "'").join('\n') + '\n');
  const out = path.join(CHAP, chId + '.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(wd, 'list.txt'), '-c:v', 'libx264', '-crf', process.env.CRF || '28', '-preset', 'slow', '-r', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  const dur = probeDur(out);
  const size = fs.statSync(out).size;
  setProgress('chapters', chId, { file: out, dur, size, segs: segs.length, title: td, map, t: new Date().toISOString() });
  writeJSON(path.join(wd, 'map.json'), { map, title: td });
  log('chapter ' + chId + ': ' + dur.toFixed(1) + ' s, ' + (size / 1048576).toFixed(1) + ' MB, ' + segs.length + ' segments');
  // clean the intermediates (the map is kept)
  for (const f of list) fs.rmSync(path.join(wd, f), { force: true });
  return out;
}
/** session time -> chapter video time */
function mapTime(chId, t) {
  const c = progress.chapters[chId];
  if (!c) return null;
  for (const m of c.map) if (t >= m.a && t <= m.b) return m.o + (t - m.a) / m.sp;
  return null;
}
function frames(chId) {
  ensureFonts();
  const f = path.join(CHAP, chId + '.mp4');
  for (const q of fs.readdirSync(FRAMES)) if (q.startsWith(chId + '_sheet')) fs.rmSync(path.join(FRAMES, q));
  const d = path.join(FRAMES, chId);
  fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
  ff(['-i', f, '-vf', 'fps=1/20,scale=640:360', path.join(d, 'f%03d.png')]);
  // contact sheets (4 x 5 thumbnails each) for a quick look at the whole chapter
  ff(['-i', f, '-vf', "fps=1/20,scale=320:180,drawtext=fontfile='" + path.join(FONTS, 'VT323-latin-400.ttf') + "':text='%{pts\\:hms}':fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6:x=4:y=4,tile=4x5", path.join(FRAMES, chId + '_sheet%02d.jpg')]);
  return fs.readdirSync(d).length;
}
function fullFilm(ids) {
  const list = ids.map((id) => "file '" + path.join(CHAP, id + '.mp4') + "'").join('\n') + '\n';
  const lf = path.join(WORK, 'full_list.txt');
  fs.writeFileSync(lf, list);
  let t = 0;
  let meta = ';FFMETADATA1\ntitle=NOSTALGIA - full story playthrough\n';
  for (const id of ids) {
    const d = probeDur(path.join(CHAP, id + '.mp4'));
    const c = CH[id];
    meta += '[CHAPTER]\nTIMEBASE=1/1000\nSTART=' + Math.round(t * 1000) + '\nEND=' + Math.round((t + d) * 1000) + '\ntitle=' + (c.top + ' - ' + c.title).replace(/[=;#\\\n]/g, ' ') + '\n';
    t += d;
  }
  const mf = path.join(WORK, 'full_meta.txt');
  fs.writeFileSync(mf, meta);
  const out = path.join(VIDEO, 'nostalgia_full_playthrough.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', lf, '-i', mf, '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', out]);
  log('full film: ' + probeDur(out).toFixed(1) + ' s, ' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
  return out;
}
/** ~3.5 min: the best marked moments of each chapter (MISSION PASSED, ● REC, minigames, 3D), captioned. */
function highlights(ids) {
  ensureFonts();
  const wd = path.join(WORK, 'hl');
  fs.rmSync(wd, { recursive: true, force: true }); fs.mkdirSync(wd, { recursive: true });
  const F = (n) => path.join(FONTS, n + '.ttf');
  const list = [];
  let n = 0;
  for (const id of ids) {
    const sess = SESSIONS.concat(LATE_SESSIONS).find((s) => s.chapters.indexOf(id) >= 0);
    const tl = readJSON(path.join(RAW, sess.id + '.timeline.json'));
    const c = progress.chapters[id];
    if (!tl || !c) continue;
    const dur = c.dur;
    const cand = tl.marks.filter((m) => m.type === 'hl').map((m) => ({ m, t: mapTime(id, m.t) })).filter((q) => q.t != null);
    const chosen = hlPicks(id, cand, dur);
    for (const q of chosen) {
      const a = Math.max(c.title + 0.2, Math.min(dur - q.len - 0.5, q.t + q.off));
      const f = 'h' + String(++n).padStart(3, '0') + '.mp4';
      const cap = esc(CH[id].top + ' · ' + CH[id].title);
      ff(['-ss', a.toFixed(2), '-i', path.join(CHAP, id + '.mp4'), '-t', String(q.len), '-an', '-vf',
        "drawbox=x=0:y=ih-54:w=iw:h=54:color=0x1a1214@0.7:t=fill:enable='lt(t,2.6)',drawtext=fontfile='" + F('YatraOne-latin-400') + "':text='" + cap + "':fontsize=30:fontcolor=0xfff4dc:x=24:y=h-44:enable='lt(t,2.6)'," +
        'fade=t=in:st=0:d=0.3,fade=t=out:st=' + (q.len - 0.3) + ':d=0.3,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', path.join(wd, f)]);
      list.push(f);
    }
  }
  // an opening card
  const still = path.join(wd, 'still.png');
  ff(['-ss', '3', '-i', path.join(CHAP, ids[0] + '.mp4'), '-frames:v', '1', still]);
  titleCard({ top: 'HIGHLIGHTS', title: 'Nostalgia', sub: 'Hyderabad 2003 · the whole story in a few minutes' }, still, path.join(wd, 'h000.mp4'));
  list.unshift('h000.mp4');
  fs.writeFileSync(path.join(wd, 'list.txt'), list.map((f) => "file '" + f + "'").join('\n') + '\n');
  const out = path.join(VIDEO, 'nostalgia_highlights.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(wd, 'list.txt'), '-c:v', 'libx264', '-crf', process.env.CRF || '26', '-preset', 'slow', '-r', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  log('highlights: ' + probeDur(out).toFixed(1) + ' s, ' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
  return out;
}
/** Highlight clips for a chapter: the best moment (3D > minigame > lock > ● REC > J-card > MISSION PASSED), 8 s,
 *  and a second, shorter one (● REC or MISSION PASSED). -> [{t, len, off}] in chapter seconds. */
const HL_OFF = { '3d': [1, 8], mg: [2.5, 8], lock: [0, 8], rec: [-3, 7], jcard: [-0.5, 6], passed: [-2.5, 6], swing: [-0.5, 5], auto: [0, 6], rewind: [-1, 5] };
const HL_FIX = { '00_prologue': [{ frac: 0.32, len: 8 }, { frac: 0.86, len: 6 }], '17_credits': [{ frac: 0.25, len: 7 }] };
function hlPicks(id, cand, dur) {
  if (HL_FIX[id]) return HL_FIX[id].map((q) => ({ t: dur * q.frac, len: q.len, off: 0 }));
  const first = (what) => cand.find((q) => q.m.what === what);
  const out = [];
  for (const w of ['3d', 'mg', 'lock', 'rec', 'jcard', 'passed']) { const q = first(w); if (q) { out.push({ t: q.t, off: HL_OFF[w][0], len: HL_OFF[w][1], what: w }); break; } }
  for (const w of ['rec', 'passed', 'mg']) { const q = first(w); if (q && !out.some((o) => o.what === w || Math.abs(o.t - q.t) < 12)) { out.push({ t: q.t, off: HL_OFF[w][0], len: Math.min(5, HL_OFF[w][1]), what: w }); break; } }
  if (!out.length) out.push({ t: dur * 0.5, off: 0, len: 8 });
  return out.sort((a, b) => a.t - b.t);
}
const LATE_SESSIONS = [];

/* ============================================================================ main */
module.exports = { pageHelper, chapterSegments, CHAPTERS, SESSIONS, travel, play, toGiver, levelStep, readLine, passed, continueGame, storyTune, afterPass, PROBE: () => PROBE(), setPage: (p) => { page = p; } };
if (require.main === module) (async () => {
  const STAGE = process.env.STAGE || 'all';
  const ALL = SESSIONS.concat(LATE_SESSIONS);
  const pickS = () => {
    if (process.env.SESSIONS) return process.env.SESSIONS.split(',').map((id) => ALL.find((s) => s.id === id)).filter(Boolean);
    let L = ALL.slice();
    if (process.env.FROM) L = L.slice(L.findIndex((s) => s.id === process.env.FROM));
    if (process.env.TO) L = L.slice(0, L.findIndex((s) => s.id === process.env.TO) + 1);
    return L.filter((s) => !(progress.sessions[s.id] && progress.sessions[s.id].done));
  };
  if (STAGE === 'record' || STAGE === 'all') {
    for (const s of pickS()) await recordSession(s);
  }
  const doneCh = ALL.filter((s) => progress.sessions[s.id] && progress.sessions[s.id].done).flatMap((s) => s.chapters);
  const chs = process.env.CHAPTERS ? process.env.CHAPTERS.split(',') : doneCh;
  if (STAGE === 'edit' || STAGE === 'all') for (const id of chs) editChapter(id);
  if (STAGE === 'frames' || STAGE === 'edit' || STAGE === 'all') for (const id of chs) log('frames ' + id + ': ' + frames(id));
  const order = CHAPTERS.map((c) => c.id).filter((id) => progress.chapters[id] && fs.existsSync(path.join(CHAP, id + '.mp4')));
  if (STAGE === 'full' || STAGE === 'all') fullFilm(order);
  if (STAGE === 'highlights' || STAGE === 'all') highlights(order);
  log('done');
})().catch((e) => { console.error(e); process.exit(1); });
