/* NOSTALGIA — birds.js (atmosphere layer) — design/atmosphere.md "Birds", ARCHITECTURE §6 / §20 / §21
 *
 * Bird life for both views, one shared simulation:
 *   pigeons   Charminar, Mecca Masjid, Jama Masjid, Gulzar Houz, Mozamjahi Market, the station forecourts
 *             (Nampally, Secunderabad, Kachiguda), Abids, Tank Bund statues and every mosque: they peck on
 *             the plaza, BURST up when the player runs / drives through or honks (or a fast vehicle passes),
 *             circle the place as a boids flock and resettle on the plaza or on nearby flat roofs.
 *   crows     on electric wires (N.wires.perches, when wires.js provides it) or on roof edges / the road
 *             side, hopping and cawing, taking off one by one when disturbed and flying to another perch.
 *   kites     black kites (cheel) soaring in slow, wide, banked circles high over the city on drifting
 *             thermals, by day only (they glide off at dusk and in rain).
 *   parakeets rose-ringed parakeet flocks in neem / banyan / mango trees streaking fast and tight between
 *             trees, screeching.
 *   egrets / cormorants   standing at the shore of Hussain Sagar, the Musi and the bigger tanks, skimming
 *             low over the water from one shore spot to another; cormorants dry their wings spread.
 *   mynas     pairs walking the lawns of parks and gardens.
 *   bats      at dusk / night round Golconda, the Qutb Shahi tombs and old banyan trees (erratic flight).
 * Night: everyone (but bats) roosts on roofs / wires / trees and stays put (nobody flies, a scare only makes
 * them shuffle). Rain (N.weather.rain > 0.35): kites leave, the rest shelter huddled on wires / roof edges /
 * in trees; a scare gives a short flight back to shelter.
 *
 * Pigeons: birds.js TAKES OVER the pigeon flocks of traffic.js (TUNE.pigeonPlaces emptied in place, its
 * flocks cleared) and landmarks.js (N.landmarks.flocks reduced to one empty placeholder so it does not
 * re-create them); both still run harmlessly. Turning N.birds.enabled off gives them back. 'pigeons:scatter'
 * {x, y, n} is still emitted (by us). No edits to those files.
 *
 * Simulation: sites (deterministic per place / water shore / park / 400-1000 u cell, seeded by id) are
 * activated near N.atmos.focus() and released beyond it; birds are pooled objects; far flocks update at
 * a lower rate. Flocks fly with boids (separation / alignment / cohesion + goal seeking + wind drift),
 * never below the roofs they cross (a lazily built 16 u obstacle-height grid).
 *
 * 2D: per species × variant × pose × 16 headings × scale sprites (procedural, anti-aliased, soft dark
 * outline) cached lazily and blitted 1:1 — ground birds on 'actors' (one item per flock, sort by y),
 * flyers and perched birds on 'sky' (one item), soft sun-offset shadows on 'shadow' (one item).
 * 3D: N.view3d.registerLayer('birds'): one InstancedMesh per species (procedural low-poly bird; wing flap,
 * fold and head peck in the vertex shader from per-instance attributes), one Points cloud for far birds
 * (only while fewer than 8 species meshes are visible: ≤ 8 draw calls). Blender models: when
 * N.models3d.has('bird_pigeon' | 'bird_crow' | 'bird_kite' | 'bird_parakeet' | 'bird_egret' |
 * 'bird_cormorant' | 'bird_myna' | 'bat') the first mesh of the GLB replaces the procedural geometry of
 * that species (same instancing + shader flap). Expected from such a GLB: ONE static mesh (clips are
 * ignored, a skinned mesh is used in its bind pose), wings spread flat in the rest pose along GLB ±X
 * (Blender ±X), front = GLB +Z (Blender −Y), origin at the feet, any size (rescaled to the species'
 * wingspan), one material (its map / vertex colours are kept; the bird shader is patched into it).
 *
 * Sound (positional, rate-limited): N.atmosAudio.sfx(name, {x, y, vol, n}) when atmosphere_audio.js
 * provides it ('flap', 'crow', 'parakeet', 'myna', 'egret', 'bat', 'kite_whistle'), else N.audio.sfx
 * fallbacks ('pigeons', 'crow_caw', 'bird', 'cheel'); cooing always N.audio.sfx('coo').
 *
 * API  N.birds = {
 *   enabled (get / set), species (table), flocks (active flocks), count(species?), stats(),
 *   scare(x, y, r) -> n birds that took off, spawnFlock(species, x, y, n) -> flock, clear(), refresh(),
 *   sites() (debug), mode(species) -> 'day' | 'roost' | 'shelter' }
 *   bird record: {sp, x, y, h (2D height units; 3D = h * VS), st (0 rest, 1 orbit, 2 to-spot, 3 soar,
 *   4 erratic, 5 flock flight, 6 leaving), spot {k: 'G' ground | 'R' roof | 'W' wire | 'T' tree | 'S' shore}}
 * Events: 'birds:takeoff' {species, x, y, n}, 'pigeons:scatter' {x, y, n}.
 * Listens: 'horn' {x, y, type}, 'traffic:honk' {vehicle}, 'weather:lightning' {dist, delay}, 'world:built',
 *   'game:new'.
 * Hooks / edits to other files: none.
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N) return;
  const U = N.util;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const nowMs = () => (window.performance ? performance.now() : Date.now());
  const VS = () => (N.view3d && N.view3d.VS) || 1.5;
  const low = () => !!(N.atmos && N.atmos.low);
  const is3D = () => !!(N.atmos ? N.atmos.is3D() : (N.view3d && N.view3d.active));

  /* ================================================================ species */
  // len / span: 2D size (u, exaggerated for the top-down read); l3 / s3: 3D size (u); speed u/s; hz wing
  // beats / s; amp flap amplitude (rad); glide 0..1 share of time gliding; alt [min, max] cruise height
  // (2D units); scare: radius multiplier; walk u/s on the ground.
  const SPECIES = ['pigeon', 'crow', 'kite', 'parakeet', 'egret', 'cormorant', 'myna', 'bat'];
  const SP = {
    pigeon: { len: 4.4, span: 9.2, bw: 2.3, l3: 2.5, s3: 4.8, speed: 64, hz: 4.2, amp: 0.95, glide: 0.25, alt: [24, 58], scare: 1, walk: 6, agi: 3.2, wing: 'point', tail: 'fan',
      pal: [
        { body: '#9aa1ab', wing: '#aab0b9', head: '#5d6973', beak: '#39393b', tip: '#3c4249', tail: '#7b828c', mark: '#3f464e', neck: '#5f8a7e' },
        { body: '#ebe8e1', wing: '#f3f0ea', head: '#e2ded6', beak: '#c79a8a', tip: '#c2bdb3', tail: '#dcd8d0', mark: '#cfcac0', neck: '#e2ded6' },
        { body: '#8f7563', wing: '#a28672', head: '#6c5446', beak: '#3a3030', tip: '#4f3c33', tail: '#76604f', mark: '#5a463a', neck: '#6c5446' },
        { body: '#6f747d', wing: '#7d828a', head: '#454d56', beak: '#2e2e30', tip: '#2c3036', tail: '#5a6068', mark: '#30353b', neck: '#4f7a70' },
      ],
      tint3: [[0.62, 0.66, 0.72], [1, 1, 1], [0.74, 0.6, 0.5], [0.46, 0.49, 0.54]] },
    crow: { len: 4.9, span: 10.2, bw: 2.4, l3: 2.9, s3: 5.4, speed: 56, hz: 3.0, amp: 0.8, glide: 0.35, alt: [14, 40], scare: 1.25, walk: 9, agi: 2.6, wing: 'finger', tail: 'round',
      pal: [{ body: '#2a2a2f', wing: '#1e1e22', head: '#151518', beak: '#0f0f10', tip: '#0f0f12', tail: '#1c1c20', mark: '#7a7c82', neck: '#7a7c82' }] },
    kite: { len: 6.8, span: 16.5, bw: 2.6, l3: 4.4, s3: 10.5, speed: 30, hz: 1.6, amp: 0.55, glide: 0.95, alt: [115, 215], scare: 0, walk: 0, agi: 1.2, wing: 'finger', tail: 'fork',
      pal: [{ body: '#6c5442', wing: '#5f4838', head: '#8e7660', beak: '#e2b438', tip: '#251c16', tail: '#5c4636', mark: '#9c866a', neck: '#8e7660' }] },
    parakeet: { len: 5.8, span: 7.6, bw: 1.7, l3: 3.0, s3: 3.6, speed: 108, hz: 6.5, amp: 0.85, glide: 0.04, alt: [18, 40], scare: 0.8, walk: 0, agi: 4.5, wing: 'point', tail: 'long',
      pal: [{ body: '#5cc84e', wing: '#41ac40', head: '#6ad45a', beak: '#dc342c', tip: '#2c7432', tail: '#3c9a44', mark: '#151515', neck: '#6ad45a' }] },
    egret: { len: 6.4, span: 13, bw: 2.2, l3: 4.0, s3: 7.4, speed: 38, hz: 2.0, amp: 0.85, glide: 0.18, alt: [6, 16], scare: 1.5, walk: 3, agi: 1.8, wing: 'round', tail: 'short', neck: 1,
      pal: [{ body: '#f7f5ee', wing: '#f3f1e8', head: '#faf8f1', beak: '#e8c040', tip: '#e2ded2', tail: '#eeeae0', mark: '#2a2a2a', neck: '#f7f5ee' }] },
    cormorant: { len: 6.4, span: 10.8, bw: 2.2, l3: 3.8, s3: 6.6, speed: 64, hz: 4.2, amp: 0.75, glide: 0.06, alt: [3, 10], scare: 1.3, walk: 3, agi: 2.0, wing: 'point', tail: 'short', neck: 2,
      pal: [{ body: '#24271f', wing: '#36342a', head: '#1c1f1b', beak: '#8a7a58', tip: '#121412', tail: '#171916', mark: '#ddd5bd', neck: '#24271f' }] },
    myna: { len: 3.9, span: 6.8, bw: 2.0, l3: 2.1, s3: 3.5, speed: 55, hz: 6.2, amp: 0.9, glide: 0.1, alt: [6, 16], scare: 0.9, walk: 9, agi: 3.2, wing: 'round', tail: 'round',
      pal: [{ body: '#6e4632', wing: '#5c3b29', head: '#1d1815', beak: '#f4c61a', tip: '#2a1e18', tail: '#2a201a', mark: '#f4f2ea', neck: '#1d1815' }] },
    bat: { len: 2.8, span: 7.8, bw: 1.3, l3: 1.6, s3: 3.8, speed: 42, hz: 9, amp: 1.0, glide: 0, alt: [10, 42], scare: 0, walk: 0, agi: 6, wing: 'bat', tail: 'none',
      pal: [{ body: '#3d302a', wing: '#2b221e', head: '#3d302a', beak: '#3d302a', tip: '#1a1411', tail: '#2b221e', mark: '#4a3c34', neck: '#3d302a' }] },
  };
  SPECIES.forEach((k, i) => { SP[k].id = k; SP[k].i = i; });
  const MODEL_ID = { pigeon: 'bird_pigeon', crow: 'bird_crow', kite: 'bird_kite', parakeet: 'bird_parakeet', egret: 'bird_egret', cormorant: 'bird_cormorant', myna: 'bird_myna', bat: 'bat' };

  // states
  const REST = 0, ORBIT = 1, TOSPOT = 2, SOAR = 3, ERRATIC = 4, FLOCKFLY = 5, LEAVE = 6;

  /* ================================================================ state */
  let enabled = true;
  const active = [];          // active flocks
  const FREE = [];            // bird pool
  const ST = { count: 0, flying: 0, upd: 0, d2: 0, d3: 0, updAvg: 0, d2Avg: 0, d3Avg: 0, calls: 0, inst: 0, pts: 0, takeoffs: 0, spawned: 0, released: 0 };
  let staticSites = null;     // built once per world
  const siteGrid = new Map(); // 512 u bucket -> [site]
  const cellDone = new Set(); // dynamic cell keys already evaluated
  let tickT = 0, frameNo = 0, simT = 0;
  const focus = { x: 0, y: 0 };
  const pending = [];         // delayed startles (thunder)

  /* ================================================================ sound */
  const SND_COOL = { flap: 0.9, crow: 1.6, coo: 2.2, parakeet: 1.4, myna: 2.4, egret: 5, bat: 3, kite_whistle: 6 };
  const sndNext = {};
  const FALLBACK = { flap: 'pigeons', crow: 'crow_caw', coo: 'coo', parakeet: 'bird', myna: 'bird', kite_whistle: 'cheel', egret: null, bat: null };
  function sfx(name, x, y, vol, n) {
    const t = nowMs() / 1000;
    if ((sndNext[name] || 0) > t) return false;
    if (Math.hypot(x - focus.x, y - focus.y) > 650) return false;
    sndNext[name] = t + (SND_COOL[name] || 1) * (0.7 + rnd() * 0.6);
    const opts = { x, y, vol: vol == null ? 0.7 : vol, n: n || 1 };
    try {
      const AA = N.atmosAudio;
      if (AA && typeof AA.sfx === 'function') return AA.sfx(name, opts);
      const fb = FALLBACK[name];
      if (fb && N.audio && N.audio.sfx) return N.audio.sfx(fb, { x, y, vol: opts.vol });
    } catch (e) { N.err('birds.sfx', e); }
    return false;
  }

  /* ================================================================ world helpers */
  const W = () => N.world;
  function surfOkGround(x, y, road) {
    const w = W(); if (!w || !w.surfaceAt) return false;
    const s = w.surfaceAt(x, y), S = N.SURF;
    if (s === S.VOID || s === S.WATER || s === S.ROCK || s === S.SOLID) return false;
    if (!road && (s === S.ROAD || s === S.BRIDGE)) return false;
    const c = w.collide ? w.collide(x, y, 2.5, 'walk') : null;
    return !(c && c.hit);
  }
  // obstacle heights (2D units) on a 16 u grid, tiles of 256 u built lazily from the structures
  const OB = new Map();
  function obstTile(ti, tj) {
    const key = ti * 8192 + tj;
    let a = OB.get(key);
    if (a) return a;
    a = new Uint8Array(256);
    const w = W(), x0 = ti * 256, y0 = tj * 256;
    if (w && w.queryStructures) {
      const put = (bx0, by0, bx1, by1, h) => {
        const v = Math.min(255, Math.ceil(h));
        const i0 = Math.max(0, Math.floor((bx0 - x0) / 16)), i1 = Math.min(15, Math.floor((bx1 - x0) / 16));
        const j0 = Math.max(0, Math.floor((by0 - y0) / 16)), j1 = Math.min(15, Math.floor((by1 - y0) / 16));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (a[j * 16 + i] < v) a[j * 16 + i] = v;
      };
      w.queryStructures(x0, y0, x0 + 256, y0 + 256, (s) => {
        if (s.t === 'bldg') put(s.x, s.y, s.x + s.w, s.y + s.d, (s.h || 10) + (s.parapet ? 1 : 0) + (s.roofType === 'hip' || s.roofType === 'gable' ? 5 : 0));
        else if (s.t === 'landmark' && s.lm && !s.lm.noSolid) put(s.lm.x - s.lm.w / 2, s.lm.y - s.lm.d / 2, s.lm.x + s.lm.w / 2, s.lm.y + s.lm.d / 2, s.lm.h || 24);
        else if (s.t === 'tree') put(s.x - (s.r || 8) * 0.7, s.y - (s.r || 8) * 0.7, s.x + (s.r || 8) * 0.7, s.y + (s.r || 8) * 0.7, (s.h || 20) + 2);
      });
    }
    if (OB.size > 700) OB.clear();
    OB.set(key, a);
    return a;
  }
  function obstH(x, y) {
    if (!(x >= 0 && y >= 0)) return 0;
    const ti = Math.floor(x / 256), tj = Math.floor(y / 256);
    const a = obstTile(ti, tj);
    return a[(Math.floor((y - tj * 256) / 16) & 15) * 16 + (Math.floor((x - ti * 256) / 16) & 15)];
  }

  /* ---------------------------------------------------------------- spots */
  // spot: {k, x, y, a (edge / wire angle), span (along a), r (wander radius), h (2D), h3 (3D)}
  function groundSpot(x, y, r) { return { k: 'G', x, y, a: 0, span: 0, r: r || 10, h: 0, h3: 0 }; }
  function roofSpots(cx, cy, R, max, out, rng) {
    const w = W(); if (!w || !w.queryStructures) return out;
    const VSv = VS(), list = [];
    w.queryStructures(cx - R, cy - R, cx + R, cy + R, (s) => {
      if (s.t !== 'bldg' || !(s.h >= 8) || s.roofType === 'hip' || s.roofType === 'gable' || s.roofType === 'frame') return;
      if (s.w < 10 || s.d < 10) return;
      const d = Math.hypot(s.x + s.w / 2 - cx, s.y + s.d / 2 - cy);
      if (d > R) return;
      list.push([d + rng.next() * 40, s]);
    });
    list.sort((p, q) => p[0] - q[0]);
    for (let i = 0; i < list.length && out.length < max; i++) {
      const s = list[i][1], ins = 0.5;
      const pH = s.parapet ? (s.parapet === 2 ? 4.2 : 3) : 0;
      const h3 = s.h * VSv + pH;
      // the edge facing the site (pigeons like the street side), plus one more
      const ex = cx - (s.x + s.w / 2), ey = cy - (s.y + s.d / 2);
      const edges = [];
      if (Math.abs(ex) / s.w > Math.abs(ey) / s.d) edges.push(ex > 0 ? 'e' : 'w', ey > 0 ? 's' : 'n');
      else edges.push(ey > 0 ? 's' : 'n', ex > 0 ? 'e' : 'w');
      for (let k = 0; k < (rng.next() < 0.5 ? 2 : 1); k++) {
        const e = edges[k];
        let x, y, a, span;
        if (e === 'n') { x = s.x + s.w / 2; y = s.y + ins; a = 0; span = s.w - 3; }
        else if (e === 's') { x = s.x + s.w / 2; y = s.y + s.d - ins; a = 0; span = s.w - 3; }
        else if (e === 'w') { x = s.x + ins; y = s.y + s.d / 2; a = Math.PI / 2; span = s.d - 3; }
        else { x = s.x + s.w - ins; y = s.y + s.d / 2; a = Math.PI / 2; span = s.d - 3; }
        out.push({ k: 'R', x, y, a, span: Math.min(span, 30), r: 0, h: s.h, h3, face: e });
      }
    }
    return out;
  }
  function treeH3(s) {
    const VSv = VS(), h = (s.h || 22) * VSv * 0.95, r = s.r || 9;
    if (s.kind === 'palm' || s.kind === 'coconut') return h * 0.92 + r * 0.35;
    const th = h * (s.kind === 'banyan' ? 0.42 : 0.48);
    return th + r * 1.05 * 0.55 + Math.max(2.4, r * 0.6 * 1.35) * 0.62;
  }
  function treeSpot(s) { return { k: 'T', x: s.x, y: s.y, a: 0, span: 0, r: Math.max(1.5, (s.r || 8) * 0.4), h: (s.h || 20) + 1, h3: treeH3(s), tree: s }; }
  function treesNear(cx, cy, R, kinds, max, rng) {
    const w = W(), list = [];
    if (!w || !w.queryStructures) return list;
    w.queryStructures(cx - R, cy - R, cx + R, cy + R, (s) => {
      if (s.t !== 'tree' || (kinds && kinds.indexOf(s.kind) < 0)) return;
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (d <= R) list.push([d * (0.6 + rng.next() * 0.8), s]);
    });
    list.sort((p, q) => p[0] - q[0]);
    return list.slice(0, max).map((p) => p[1]);
  }
  function wireSpots(cx, cy, R, max, out) {
    const WI = N.wires;
    if (!WI || typeof WI.perches !== 'function' || WI.enabled === false) return out;
    let ps = null;
    try { ps = WI.perches(cx, cy, R, []); } catch (e) { N.err('birds.wires', e); ps = null; }
    if (!ps || !ps.length) return out;
    const VSv = VS(), ok = [];
    for (const p of ps) if (p && isFinite(p.x) && isFinite(p.y) && isFinite(p.h) && p.h > 4) ok.push(p);
    // spread the picks over the perch points (they come span by span, ~3.5 u apart)
    const n = Math.min(max, ok.length);
    for (let i = 0; i < n; i++) {
      const p = ok[Math.floor((i + 0.5) * ok.length / n)];
      // a perch point is good for +-1.5 u along the wire (the sag barely changes the height there)
      out.push({ k: 'W', x: p.x, y: p.y, a: p.ang || 0, span: 3, r: 0, h: p.h, h3: p.h3 != null ? p.h3 : p.h * VSv });
    }
    return out;
  }
  function ringGroundSpots(cx, cy, r0, r1, n, out, rng, road) {
    for (let k = 0; k < n * 8 && out.length < n; k++) {
      const a = rng.next() * TAU, d = r0 + rng.next() * (r1 - r0);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (!surfOkGround(x, y, road)) continue;
      let ok = true;
      for (const s of out) if (s.k === 'G' && Math.hypot(s.x - x, s.y - y) < 14) { ok = false; break; }
      if (ok) { const g = groundSpot(x, y, 9 + rng.next() * 6); g.road = !!road; out.push(g); }
    }
    return out;
  }

  /* ================================================================ sites */
  // site: {id, sp, x, y, n, R (activation radius), opts, flock (active) | null}
  function addSite(s) {
    const key = Math.floor(s.x / 512) * 4096 + Math.floor(s.y / 512);
    let L = siteGrid.get(key); if (!L) siteGrid.set(key, (L = []));
    L.push(s);
    staticSites.push(s);
    return s;
  }
  function buildStatic() {
    staticSites = []; siteGrid.clear(); cellDone.clear(); OB.clear();
    const D = (N.world && N.world.data) || N.WORLD_DATA;
    if (!D) return;
    const P = N.places || {};
    const used = [];
    const pig = (id, x, y, n, extra) => {
      for (const u of used) if (Math.hypot(u[0] - x, u[1] - y) < 90) return;
      used.push([x, y]);
      addSite(Object.assign({ id: 'pigeon:' + id, sp: 'pigeon', x, y, n, r: 30 }, extra || {}));
    };
    const lmById = {};
    for (const l of D.landmarks || []) lmById[l.id] = l;
    const cm = lmById.charminar || P.charminar;
    if (cm) pig('charminar', cm.x, cm.y, 40, { ring: [44, 92], roofR: 190, avoid: 36 });
    const mp = (D.parks || []).find((p) => p.id === 'mecca_masjid_pigeons');
    if (mp) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of mp.poly) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
      pig('mecca', (x0 + x1) / 2, (y0 + y1) / 2, 30, { ring: [0, Math.max(20, (x1 - x0) / 2 + 10)] });
    }
    const gh = lmById.gulzar_houz;
    if (gh) pig('gulzar', gh.x, gh.y, 14, { ring: [18, 50] });
    const big = { mozamjahi_market: 24, nampally_station: 26, secunderabad_station: 28, kachiguda_station: 24, abids: 18, tank_bund_statues: 16, jama_masjid_charminar: 12, mecca_masjid: 16, spanish_mosque: 12, khairatabad_mosque: 12 };
    for (const id in big) { const p = P[id]; if (p) pig(id, p.x, p.y, big[id], { ring: [Math.max(8, (p.r || 30) * 0.4), (p.r || 30) + 50] }); }
    for (const id in P) { const p = P[id]; if (p && p.kind === 'mosque') pig(id, p.x, p.y, 10 + (U.strHash(id) % 5), { ring: [10, (p.r || 18) + 40] }); }
    // water birds along the shores (every ~280 u of shoreline of the bigger water bodies)
    for (const w of D.water || []) {
      const poly = w.poly; if (!poly || poly.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of poly) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
      if (Math.max(x1 - x0, y1 - y0) < 160 || /nala/.test(w.id)) continue;
      const step = w.id === 'hussain_sagar' || w.id === 'musi' ? 240 : 360;
      let acc = step * 0.5, k = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let t = 0;
        while (acc + (L - t) >= step) {
          t += step - acc; acc = 0;
          const x = a[0] + (b[0] - a[0]) * (t / L), y = a[1] + (b[1] - a[1]) * (t / L);
          const h = (U.strHash(w.id + ':' + k++) >>> 0) / 4294967296;
          const sp = h < 0.6 ? 'egret' : 'cormorant';
          if (h < 0.85 || w.id === 'hussain_sagar' || w.id === 'musi') addSite({ id: sp + ':' + w.id + ':' + k, sp, x, y, n: sp === 'egret' ? 2 + Math.floor(h * 8) % 4 : 3 + Math.floor(h * 13) % 4, water: w });
        }
        acc += L - t;
      }
    }
    // mynas on park lawns
    for (const p of D.parks || []) {
      if (p.kind !== 'grass' && p.kind !== 'garden' && p.kind !== 'ground') continue;
      if (!p.poly || p.poly.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [px, py] of p.poly) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
      const big2 = Math.max(x1 - x0, y1 - y0);
      const nSites = clamp(Math.round(big2 / 260), 1, 5);
      const rng = U.rng('myna:' + p.id);
      for (let s = 0; s < nSites; s++) {
        for (let k = 0; k < 20; k++) {
          const x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0);
          if (!U.pointInPoly(x, y, p.poly) || !surfOkGround(x, y)) continue;
          addSite({ id: 'myna:' + p.id + ':' + s, sp: 'myna', x, y, n: rng.next() < 0.4 ? 4 : 2, park: p });
          break;
        }
      }
    }
    // bats at Golconda and the tombs
    for (const id of ['golconda_fort', 'golconda_bala_hissar', 'golconda_fateh_darwaza', 'qutb_shahi_tombs', 'paigah_tombs']) {
      const p = P[id]; if (p) addSite({ id: 'bat:' + id, sp: 'bat', x: p.x, y: p.y, n: 10 + (U.strHash(id) % 7), ah: 22 });
    }
  }
  // dynamic cell sites (crows, parakeets, banyan bats, kites), evaluated once per cell when first near
  function evalCell(kind, ci, cj, C) {
    const key = kind + ':' + ci + ':' + cj;
    if (cellDone.has(key)) return;
    cellDone.add(key);
    if (cellDone.size > 6000) cellDone.clear();
    const rng = U.rng('birds:' + key), x0 = ci * C, y0 = cj * C;
    const w = W(); if (!w || !w.queryStructures) return;
    if (kind === 'kite') {
      if (rng.next() < 0.7) addSite({ id: 'kite:' + ci + ':' + cj, sp: 'kite', x: x0 + rng.next() * C, y: y0 + rng.next() * C, n: rng.next() < 0.35 ? 2 : 1, R: 1100 });
      return;
    }
    let nb = 0, nt = 0, nban = 0, bx = 0, by = 0, bd = 1e9, ban = null;
    const cx = x0 + C / 2, cy = y0 + C / 2;
    const tk = ['neem', 'banyan', 'mango', 'tamarind', 'peepal', 'gulmohar', 'ashoka'];
    w.queryStructures(x0, y0, x0 + C, y0 + C, (s) => {
      if (s.t === 'bldg') {
        nb++;
        const d = Math.hypot(s.x + s.w / 2 - cx, s.y + s.d / 2 - cy) * (0.5 + rng.next());
        if (d < bd) { bd = d; bx = s.x + s.w / 2; by = s.y + s.d / 2; }
      } else if (s.t === 'tree') {
        if (tk.indexOf(s.kind) >= 0) nt++;
        if (s.kind === 'banyan' && s.x >= x0 && s.y >= y0 && s.x < x0 + C && s.y < y0 + C) { nban++; if (!ban || rng.next() < 0.3) ban = s; }
      }
    });
    if (kind === 'crow') {
      if (nb >= 4 && rng.next() < 0.62) {
        // stand on the road side of the chosen building
        const p = w.nearestRoadPoint ? w.nearestRoadPoint(bx, by) : null;
        const x = p && p.dist < 60 ? p.x : bx, y = p && p.dist < 60 ? p.y : by;
        addSite({ id: 'crow:' + ci + ':' + cj, sp: 'crow', x, y, n: 3 + Math.floor(rng.next() * 5) });
      }
    } else if (kind === 'parakeet') {
      if (nt >= 4 && rng.next() < 0.5) addSite({ id: 'parakeet:' + ci + ':' + cj, sp: 'parakeet', x: cx, y: cy, n: 8 + Math.floor(rng.next() * 9), treeR: C * 0.6 });
      if (nban && ban && rng.next() < 0.4) addSite({ id: 'bat:banyan:' + ci + ':' + cj, sp: 'bat', x: ban.x, y: ban.y, n: 5 + Math.floor(rng.next() * 6), ah: (ban.h || 24) + 4, tree: ban });
    }
  }
  function evalCellsNear(fx, fy) {
    let budget = 3;
    const specs = [['crow', 400, 700], ['parakeet', 600, 800], ['kite', 1000, 1200]];
    for (const [kind, C, R] of specs) {
      const i0 = Math.floor((fx - R) / C), i1 = Math.floor((fx + R) / C), j0 = Math.floor((fy - R) / C), j1 = Math.floor((fy + R) / C);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0) continue;
        const key = kind + ':' + i + ':' + j;
        if (cellDone.has(key)) continue;
        if (budget-- <= 0) return;
        evalCell(kind, i, j, C);
      }
    }
  }

  /* ================================================================ time / weather modes */
  function minutes() { return N.clock ? N.clock.minutes : 720; }
  function nightNow() {
    try { if (N.clock && N.clock.isNight) return N.clock.isNight(); } catch (e) { /* fall through */ }
    const m = minutes(); return m < 300 || m > 1185;
  }
  function rainNow() { return (N.weather && N.weather.rain) || 0; }
  function siteWanted(s) {
    const m = minutes();
    if (s.sp === 'kite') return m > 450 && m < 1065 && rainNow() < 0.25;
    if (s.sp === 'bat') return (m > 1110 || m < 330) && rainNow() < 0.5;
    return true;
  }
  function modeFor(sp) {
    if (sp === 'bat' || sp === 'kite') return 'day';
    if (nightNow()) return 'roost';
    if (rainNow() > 0.35) return 'shelter';
    return 'day';
  }

  /* ================================================================ birds + flocks */
  function allocBird(f, spk, vi) {
    const b = FREE.pop() || {};
    b.f = f; b.sp = spk; b.S = SP[spk]; b.vi = vi | 0;
    b.x = f.cx; b.y = f.cy; b.h = 0; b.vx = 0; b.vy = 0; b.vh = 0; b.a = rnd() * TAU; b.roll = 0; b.pitch = 0;
    b.st = REST; b.ph = rnd() * TAU; b.fa = 0; b.flap = 0; b.glideT = rr(0.5, 2); b.t = rr(0.3, 3); b.go = rr(8, 40);
    b.spot = null; b.rx = 0; b.ry = 0; b.wx = 0; b.wy = 0; b.walking = false; b.pk = 0; b.pkT = rr(0.5, 2.5);
    b.alt = 30; b.ft = 0; b.oa = 0; b.orr = 1; b.tgt = null; b.spread = 0; b.sz = 0.9 + rnd() * 0.2;
    b.huddle = false; b.mate = null; b.da = 0; b.leaveT = 0; b.dy3 = 0;
    return b;
  }
  function releaseFlock(f) {
    for (const b of f.birds) { b.f = null; b.spot = null; b.tgt = null; b.mate = null; FREE.push(b); }
    ST.released += f.birds.length;
    f.birds.length = 0;
    if (f.site) f.site.flock = null;
    const i = active.indexOf(f); if (i >= 0) active.splice(i, 1);
  }
  function pickSpot(f, mode, not, rest) {
    const L = mode === 'day' ? f.day : f.roost;
    if (!L || !L.length) return f.day && f.day.length ? f.day[(rnd() * f.day.length) | 0] : null;
    let s = null;
    for (let k = 0; k < 6; k++) {
      s = L[(rnd() * L.length) | 0];
      if (s === not) continue;
      if (rest === 'G' && s.k !== 'G') continue;
      if (rest === 'up' && s.k === 'G') continue;
      break;
    }
    return s;
  }
  /** a position on a spot (huddled close to the spot centre in roost / shelter) */
  function spotPos(b, s, huddle) {
    if (s.k === 'R' || s.k === 'W') {
      const u = huddle ? (rnd() - 0.5) * Math.min(s.span, 6) : (rnd() - 0.5) * s.span;
      b.rx = s.x + Math.cos(s.a) * u; b.ry = s.y + Math.sin(s.a) * u;
    } else {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * (huddle ? Math.min(s.r, 3) : s.r);
      b.rx = s.x + Math.cos(a) * d; b.ry = s.y + Math.sin(a) * d;
      if (s.k === 'G' && !surfOkGround(b.rx, b.ry, s.road)) { b.rx = s.x; b.ry = s.y; }
    }
  }
  function settle(b, s, huddle) {
    b.spot = s; spotPos(b, s, huddle);
    b.x = b.rx; b.y = b.ry; b.h = s.h; b.st = REST; b.vx = b.vy = b.vh = 0; b.roll = 0; b.pitch = 0;
    b.huddle = !!huddle; b.walking = false; b.t = rr(0.5, 3);
    if (s.k === 'R' || s.k === 'W') b.a = s.a + (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (rnd() - 0.5) * 0.5;
    if (s.k === 'R' && s.face) b.a = s.face === 'n' ? -Math.PI / 2 : s.face === 's' ? Math.PI / 2 : s.face === 'e' ? 0 : Math.PI; // look out over the street
    if (s.k === 'R' && s.face) b.a += (rnd() - 0.5) * 0.9;
    b.go = goTime(b);
  }
  function goTime(b) {
    switch (b.sp) {
      case 'pigeon': return rr(14, 50);
      case 'crow': return rr(10, 40);
      case 'parakeet': return 1e9; // the flock decides
      case 'egret': return rr(18, 60);
      case 'cormorant': return rr(15, 45);
      case 'myna': return rr(20, 60);
      default: return 1e9;
    }
  }
  function buildFlock(site) {
    const sp = site.sp, S = SP[sp], rng = U.rng('flock:' + site.id), mode = modeFor(sp);
    const f = { id: site.id, sp, S, site, cx: site.x, cy: site.y, birds: [], day: [], roost: [], mode, cool: 0, callT: rr(2, 8), nextT: rr(15, 40),
      ocx: site.x, ocy: site.y, or: 60, ow: 1, flying: 0, ground: 0, bx0: 0, by0: 0, bx1: 0, by1: 0, near: 0, dying: false, dieT: 0, gx: 0, gy: 0, skip: 0, accDt: 0 };
    f.drawG = () => drawGround(f);
    if (sp === 'pigeon') {
      const ring = site.ring || [10, 60];
      ringGroundSpots(site.x, site.y, ring[0], ring[1], 9, f.day, rng);
      if (f.day.length < 3) ringGroundSpots(site.x, site.y, 0, ring[1] + 40, 6, f.day, rng, true);
      const roofs = roofSpots(site.x, site.y, site.roofR || 150, 7, [], rng);
      const wires = wireSpots(site.x, site.y, 110, 3, []);
      for (const s of roofs) { f.day.push(s); f.roost.push(s); }
      for (const s of wires) { f.day.push(s); f.roost.push(s); }
      if (!f.roost.length) for (const t of treesNear(site.x, site.y, 160, null, 3, rng)) f.roost.push(treeSpot(t));
      f.or = 50 + rng.next() * 40; f.ow = rng.next() < 0.5 ? -1 : 1;
      // circle above whatever stands on the orbit (Charminar's minarets, the station roofs)
      let top = 0;
      for (let k = 0; k < 48; k++) { const a = k * TAU / 48; for (const rf of [0.6, 1, 1.35]) top = Math.max(top, obstH(site.x + Math.cos(a) * f.or * rf, site.y + Math.sin(a) * f.or * rf)); }
      f.orbMin = top + 8;
    } else if (sp === 'crow') {
      wireSpots(site.x, site.y, 140, 6, f.day);
      roofSpots(site.x, site.y, 120, f.day.length >= 3 ? 2 : 5, f.day, rng);
      if (rng.next() < 0.6) ringGroundSpots(site.x, site.y, 4, 60, 2, f.day, rng, false);
      for (const s of f.day) if (s.k !== 'G') f.roost.push(s);
      for (const t of treesNear(site.x, site.y, 140, null, 2, rng)) f.roost.push(treeSpot(t));
    } else if (sp === 'parakeet') {
      const trees = treesNear(site.x, site.y, site.treeR || 360, ['neem', 'banyan', 'mango', 'tamarind', 'peepal', 'gulmohar', 'ashoka'], 6, rng);
      for (const t of trees) { const s = treeSpot(t); f.day.push(s); f.roost.push(s); }
      if (f.day.length < 2) return null;
    } else if (sp === 'egret' || sp === 'cormorant') {
      shoreSpots(site, f.day, rng);
      if (!f.day.length) return null;
      for (const s of f.day) f.roost.push(s);
    } else if (sp === 'myna') {
      const p = site.park;
      for (let k = 0; k < 40 && f.day.length < 5; k++) {
        const a = rng.next() * TAU, d = rng.next() * 70, x = site.x + Math.cos(a) * d, y = site.y + Math.sin(a) * d;
        if (p && !U.pointInPoly(x, y, p.poly)) continue;
        if (surfOkGround(x, y)) f.day.push(groundSpot(x, y, 12));
      }
      if (!f.day.length) f.day.push(groundSpot(site.x, site.y, 8));
      for (const t of treesNear(site.x, site.y, 150, null, 2, rng)) f.roost.push(treeSpot(t));
      if (!f.roost.length) for (const s of f.day) f.roost.push(s);
    } else if (sp === 'kite') {
      f.or = 70 + rng.next() * 60; f.gx = site.x; f.gy = site.y;
    } else if (sp === 'bat') {
      f.ah = site.ah || 24;
    }
    // birds
    const n = sp === 'myna' ? site.n : Math.max(1, Math.round(site.n * (low() ? 0.6 : 1)));
    for (let i = 0; i < n; i++) {
      let vi = 0;
      if (sp === 'pigeon') { const r = rng.next(); vi = r < 0.62 ? 0 : r < 0.76 ? 3 : r < 0.9 ? 2 : 1; }
      const b = allocBird(f, sp, vi);
      f.birds.push(b);
      placeInitial(f, b, i, rng);
    }
    if (sp === 'myna') for (let i = 0; i + 1 < f.birds.length; i += 2) { f.birds[i + 1].mate = f.birds[i]; f.birds[i].mate = f.birds[i + 1]; }
    ST.spawned += f.birds.length;
    return f;
  }
  function shoreSpots(site, out, rng) {
    const w = W(); if (!w) return out;
    const poly = site.water && site.water.poly;
    // walk the shore near the site point: test points on rings for a water / land boundary
    for (let k = 0; k < 60 && out.length < 4; k++) {
      const a = rng.next() * TAU, d = rng.next() * 90;
      const x = site.x + Math.cos(a) * d, y = site.y + Math.sin(a) * d;
      if (w.isWater(x, y) || !surfOkGround(x, y, false)) continue;
      // must have water within ~8 u
      let wa = -1;
      for (let q = 0; q < 8; q++) { const qa = q * TAU / 8; if (w.isWater(x + Math.cos(qa) * 7, y + Math.sin(qa) * 7)) { wa = qa; break; } }
      if (wa < 0) continue;
      let ok = true;
      for (const s of out) if (Math.hypot(s.x - x, s.y - y) < 18) ok = false;
      if (!ok) continue;
      const s = groundSpot(x, y, 4); s.k = 'S'; s.wa = wa; out.push(s);
    }
    void poly;
    return out;
  }
  function placeInitial(f, b, i, rng) {
    const sp = f.sp, mode = f.mode;
    if (sp === 'kite') {
      b.st = SOAR; b.oa = rng.next() * TAU; b.orr = 0.7 + rng.next() * 0.6; b.ow = (rng.next() < 0.5 ? -1 : 1);
      b.x = f.gx + Math.cos(b.oa) * f.or * b.orr; b.y = f.gy + Math.sin(b.oa) * f.or * b.orr;
      b.h = rr(b.S.alt[0], b.S.alt[1]); b.alt = b.h; b.a = b.oa + b.ow * Math.PI / 2; b.fa = 0;
      return;
    }
    if (sp === 'bat') {
      b.st = ERRATIC; b.x = f.cx + rr(-30, 30); b.y = f.cy + rr(-30, 30); b.h = f.ah + rr(-8, 14); b.a = rnd() * TAU; b.fa = 1;
      return;
    }
    let s = null;
    if (mode === 'day') {
      if (sp === 'pigeon') s = pickSpot(f, 'day', null, rng.next() < 0.72 ? 'G' : 'up');
      else if (sp === 'parakeet') s = f.day[0];
      else s = pickSpot(f, 'day');
    } else s = pickSpot(f, 'roost');
    if (sp === 'parakeet' && mode === 'day') s = f.day[(i * 7 + 3) % Math.min(2, f.day.length)];
    if (!s) s = groundSpot(f.cx, f.cy, 6);
    settle(b, s, mode !== 'day');
  }

  /* ---------------------------------------------------------------- take off / scare */
  let burstAcc = null;
  function takeoff(b, fromX, fromY, burst) {
    const f = b.f, S = b.S;
    if (b.st !== REST) return false;
    const mode = f.mode;
    if (mode === 'roost') { // roosting: a shuffle, no flight
      b.a += (rnd() - 0.5) * 1.6; b.t = rr(1, 3);
      return false;
    }
    let ax = b.x - fromX, ay = b.y - fromY;
    const d = Math.hypot(ax, ay) || 1; ax /= d; ay /= d;
    const ja = (rnd() - 0.5) * 1.1, c = Math.cos(ja), s = Math.sin(ja);
    const dx = ax * c - ay * s, dy = ax * s + ay * c;
    const sp = S.speed * (burst ? rr(0.8, 1.15) : rr(0.55, 0.8));
    b.vx = dx * sp; b.vy = dy * sp; b.vh = burst ? rr(38, 62) : rr(16, 30);
    b.a = Math.atan2(dy, dx); b.fa = 1; b.flapBoost = burst ? 1.5 : 1.1; b.glideT = rr(1.2, 2.5);
    const prev = b.spot;
    if (b.sp === 'pigeon' && mode === 'day') {
      b.st = ORBIT; b.ft = rr(5, 11); b.oa = Math.atan2(b.y - f.ocy, b.x - f.ocx); b.orr = rr(0.7, 1.3); b.alt = Math.max(rr(S.alt[0], S.alt[1]), (f.orbMin || 0) + rr(0, 14));
    } else {
      b.st = TOSPOT;
      const ns = mode === 'shelter' ? pickSpot(f, 'roost', prev) : pickSpot(f, 'day', prev);
      b.tgt = ns || prev; spotPos(b, b.tgt, mode !== 'day');
      b.alt = Math.max(b.tgt.h + 6, rr(S.alt[0], S.alt[1]) * (mode === 'shelter' ? 0.6 : 1));
      if (mode === 'shelter') b.ft = rr(1.5, 3);
    }
    b.spot = null;
    ST.takeoffs++;
    if (burstAcc && burstAcc.f === f) burstAcc.n++;
    return true;
  }
  function scareFlock(f, x, y, r, ph) {
    if (!f.birds.length) return 0;
    const S = f.S;
    if (!S.scare) return 0;
    const rad = r * S.scare;
    burstAcc = { f, n: 0 };
    let first = false;
    for (const b of f.birds) {
      if (b.st !== REST) continue;
      const dh = (b.h - (ph || 0)) * 0.6;
      const d = Math.hypot(b.x - x, b.y - y, dh);
      if (d < rad) { takeoff(b, x, y, true); first = true; }
    }
    // pigeons on the plaza go up together: the burst spreads to the neighbours on the ground
    if (first && f.sp === 'pigeon' && f.mode === 'day') {
      for (const b of f.birds) {
        if (b.st !== REST || b.spot.k !== 'G') continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < rad * 2.4 || (d < rad * 4 && rnd() < 0.5)) takeoff(b, x, y, true);
      }
    }
    const n = burstAcc.n;
    burstAcc = null;
    if (n > 0) {
      N.emit('birds:takeoff', { species: f.sp, x: f.cx, y: f.cy, n });
      if (f.cool <= 0) {
        f.cool = 2.5;
        if (f.sp === 'pigeon' || n >= 3) sfx('flap', x, y, Math.min(1, 0.4 + n * 0.04), n);
        if (f.sp === 'crow') sfx('crow', x, y, 0.8);
        else if (f.sp === 'parakeet') sfx('parakeet', x, y, 0.8);
        else if (f.sp === 'myna') sfx('myna', x, y, 0.6);
        else if (f.sp === 'egret' || f.sp === 'cormorant') sfx('egret', x, y, 0.5);
      }
      if (f.sp === 'pigeon' && n > 3) N.emit('pigeons:scatter', { x: f.cx, y: f.cy, n });
    }
    return n;
  }
  function scare(x, y, r, ph) {
    let n = 0;
    for (const f of active) if (Math.abs(f.cx - x) < r + 160 && Math.abs(f.cy - y) < r + 160) n += scareFlock(f, x, y, r, ph);
    return n;
  }

  /* ---------------------------------------------------------------- flight */
  const WIND = { x: 0, y: 0, s: 0 };
  function windAt(x, y) {
    const w = N.wind;
    if (w && w.at) { w.at(x, y, WIND); return WIND; }
    WIND.x = 1; WIND.y = 0; WIND.s = 0; return WIND;
  }
  function steer(b, dvx, dvy, dt, agi) {
    const k = Math.min(1, dt * agi);
    b.vx += (dvx - b.vx) * k; b.vy += (dvy - b.vy) * k;
  }
  function integrate(b, dt, gh, climb) {
    const w = windAt(b.x, b.y), drift = (b.sp === 'kite' ? 9 : 4) * w.s;
    const pa = b.a;
    b.x += (b.vx + w.x * drift) * dt; b.y += (b.vy + w.y * drift) * dt;
    const sp2 = b.vx * b.vx + b.vy * b.vy;
    if (sp2 > 4) {
      const na = Math.atan2(b.vy, b.vx);
      let d = na - b.a; d = Math.atan2(Math.sin(d), Math.cos(d));
      b.a += d * Math.min(1, dt * 10);
    }
    let da = b.a - pa; da = Math.atan2(Math.sin(da), Math.cos(da));
    const turn = dt > 0 ? da / dt : 0;
    b.roll += (clamp(turn * (b.sp === 'kite' ? 0.9 : 0.35), -0.9, 0.9) - b.roll) * Math.min(1, dt * 4);
    const dh = clamp((gh - b.h) * climb, -40, 70);
    b.vh += (dh - b.vh) * Math.min(1, dt * 3);
    const h0 = b.h;
    b.h = Math.max(0, b.h + b.vh * dt);
    b.pitch += (clamp((b.h - h0) / Math.max(1e-3, dt) / Math.max(20, Math.sqrt(sp2)), -0.5, 0.6) - b.pitch) * Math.min(1, dt * 4);
  }
  function floorAt(b, x, y, margin) { return obstH(x, y) + margin; }
  function wingbeat(b, dt, wantFlap) {
    const S = b.S;
    b.fa += ((wantFlap ? 1 : 0) - b.fa) * Math.min(1, dt * 5);
    const boost = b.flapBoost || 1;
    if (b.flapBoost > 1) b.flapBoost = Math.max(1, b.flapBoost - dt * 0.6);
    b.ph += dt * TAU * S.hz * boost * (0.6 + 0.4 * b.fa);
    // glide pose: pigeons hold a V, kites flat with tips up, others flat
    const glidePose = b.sp === 'pigeon' ? 0.32 : b.sp === 'kite' ? 0.08 : 0.12;
    b.flap = S.amp * b.fa * Math.sin(b.ph) + glidePose * (1 - b.fa);
  }
  function flyBird(b, f, dt) {
    const S = b.S;
    let gx = b.x, gy = b.y, gh = b.h, spd = S.speed, flapWant = true, arrive = false;
    if (b.st === ORBIT) {
      b.ft -= dt;
      b.oa += f.ow * dt * (spd * 0.85) / (f.or * b.orr);
      gx = f.ocx + Math.cos(b.oa) * f.or * b.orr; gy = f.ocy + Math.sin(b.oa) * f.or * b.orr; gh = b.alt;
      if (b.ft <= 0) {
        b.st = TOSPOT;
        const up = f.mode === 'day' ? (rnd() < 0.42 ? 'up' : 'G') : null;
        b.tgt = pickSpot(f, f.mode === 'day' ? 'day' : 'roost', null, up) || f.day[0];
        if (!b.tgt) { b.st = LEAVE; return; }
        spotPos(b, b.tgt, f.mode !== 'day');
      }
    }
    if (b.st === TOSPOT || b.st === FLOCKFLY) {
      const t = b.tgt;
      if (!t) { b.st = LEAVE; return; }
      if (b.st === FLOCKFLY) { gx = f.gx; gy = f.gy; } else { gx = b.rx; gy = b.ry; }
      const d = Math.hypot(gx - b.x, gy - b.y);
      if (b.st === FLOCKFLY && d < 40) { b.st = TOSPOT; return; }
      const desc = Math.max(24, (b.h - t.h) * 1.6);
      if (b.st === TOSPOT && d < desc) {
        gh = t.h + (b.alt - t.h) * clamp(d / desc, 0, 1) * 0.9;
        spd = Math.max(8, S.speed * clamp(d / desc, 0.15, 1));
        flapWant = d < 10 || (b.h - t.h) < 4;
        if (d < 1.6 && Math.abs(b.h - t.h) < 1.2) arrive = true;
      } else gh = b.alt;
      if (f.mode === 'shelter' && b.ft > 0) { b.ft -= dt; }
    }
    if (arrive) { settle(b, b.tgt, f.mode !== 'day'); b.tgt = null; return; }
    // seek
    let dx = gx - b.x, dy = gy - b.y;
    const dl = Math.hypot(dx, dy) || 1;
    let dvx = dx / dl * spd, dvy = dy / dl * spd;
    // boids within the flock
    if ((b.st === ORBIT || b.st === FLOCKFLY) && f.near < 2) {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, nn = 0;
      const sepR = b.sp === 'parakeet' ? 4 : 6, cohR = b.sp === 'parakeet' ? 26 : 34;
      for (const o of f.birds) {
        if (o === b || o.st !== b.st) continue;
        const ox = o.x - b.x, oy = o.y - b.y, d2 = ox * ox + oy * oy;
        if (d2 > cohR * cohR) continue;
        nn++; ax += o.vx; ay += o.vy; cx += ox; cy += oy;
        if (d2 < sepR * sepR) { const q = 1 / (Math.sqrt(d2) + 0.5); sx -= ox * q; sy -= oy * q; }
      }
      if (nn) {
        const wa = b.sp === 'parakeet' ? 0.5 : 0.3, wc = b.sp === 'parakeet' ? 1.2 : 0.6;
        dvx += (ax / nn - b.vx) * wa + (cx / nn) * wc + sx * spd * 0.5;
        dvy += (ay / nn - b.vy) * wa + (cy / nn) * wc + sy * spd * 0.5;
      }
    }
    // never through buildings: hold above what lies ahead (not on the final approach)
    const near = b.st === TOSPOT && b.tgt && Math.hypot(b.rx - b.x, b.ry - b.y) < 26;
    if (!near) {
      const fl = Math.max(floorAt(b, b.x, b.y, 4), floorAt(b, b.x + b.vx * 0.6, b.y + b.vy * 0.6, 4));
      if (gh < fl) gh = fl;
    }
    steer(b, dvx, dvy, dt, S.agi);
    // gliding stretches
    b.glideT -= dt;
    if (b.glideT <= 0) { b.gliding = !b.gliding && rnd() < S.glide * 1.6; b.glideT = b.gliding ? rr(0.6, 1.8) : rr(0.8, 2.6); }
    const climbing = gh - b.h > 6;
    wingbeat(b, dt, flapWant && (climbing || !b.gliding || (b.flapBoost || 1) > 1.05));
    integrate(b, dt, gh, b.st === TOSPOT ? 1.6 : 1.1);
    if (b.h < (b.tgt ? b.tgt.h : 0)) b.h = b.tgt ? b.tgt.h : 0;
    // hard floor: a bird that still ended up below a roof / minaret here pops up over it (rare)
    if (!near) { const ob = obstH(b.x, b.y) + 1.5; if (b.h < ob) { b.h += (ob - b.h) * Math.min(1, dt * 10); if (b.vh < 0) b.vh = 0; } }
  }
  function soarBird(b, f, dt) {
    const S = b.S;
    // circle the (drifting) thermal centre
    const rx = b.x - f.gx, ry = b.y - f.gy, d = Math.hypot(rx, ry) || 1;
    const R = f.or * b.orr;
    const ta = Math.atan2(ry, rx) + b.ow * Math.PI / 2;
    const corr = clamp((R - d) / R, -1, 1) * 0.9;
    const spd = S.speed * (0.9 + 0.2 * Math.sin(simT * 0.13 + b.ph));
    const dvx = (Math.cos(ta) + rx / d * corr) * spd, dvy = (Math.sin(ta) + ry / d * corr) * spd;
    steer(b, dvx, dvy, dt, S.agi);
    b.flapT = (b.flapT || rr(4, 12)) - dt;
    let want = false;
    if (b.flapT < 0) { want = true; if (b.flapT < -1.1) b.flapT = rr(6, 16); }
    wingbeat(b, dt, want);
    const gh = b.alt + Math.sin(simT * 0.11 + b.ph * 3) * 12;
    integrate(b, dt, gh, 0.4);
    b.roll += Math.sin(simT * 0.9 + b.ph) * 0.06 * dt * 4;
    if (rnd() < dt / 24) sfx('kite_whistle', b.x, b.y, 0.55);
  }
  function batBird(b, f, dt) {
    const S = b.S;
    b.da += (rnd() - 0.5) * 30 * dt; b.da *= Math.exp(-dt * 3);
    b.a += b.da * dt;
    const rx = f.cx - b.x, ry = f.cy - b.y, d = Math.hypot(rx, ry);
    let dvx = Math.cos(b.a) * S.speed, dvy = Math.sin(b.a) * S.speed;
    if (d > 45) { dvx += rx / d * S.speed * 0.9; dvy += ry / d * S.speed * 0.9; }
    b.vx += (dvx - b.vx) * Math.min(1, dt * S.agi); b.vy += (dvy - b.vy) * Math.min(1, dt * S.agi);
    b.x += b.vx * dt; b.y += b.vy * dt;
    const gh = f.ah + Math.sin(simT * 1.7 + b.ph) * 10 + Math.sin(simT * 3.1 + b.ph * 2) * 4;
    b.h += (Math.max(gh, obstH(b.x, b.y) + 3) - b.h) * Math.min(1, dt * 2.5);
    b.ph += dt * TAU * S.hz; b.fa = 1; b.flap = S.amp * Math.sin(b.ph);
    b.roll = clamp(b.da * 0.25, -0.8, 0.8);
    if (rnd() < dt / 12) sfx('bat', b.x, b.y, 0.4);
  }
  function leaveBird(b, f, dt) {
    const S = b.S;
    const ax = b.x - f.cx, ay = b.y - f.cy, d = Math.hypot(ax, ay) || 1;
    steer(b, ax / d * S.speed * 1.2, ay / d * S.speed * 1.2, dt, S.agi * 0.5);
    wingbeat(b, dt, true);
    integrate(b, dt, b.h + 30, 0.5);
    b.leaveT += dt;
  }
  function restBird(b, f, dt) {
    const S = b.S, s = b.spot;
    if (!s) { b.st = LEAVE; return; }
    b.fa = 0; b.flap = 0;
    b.t -= dt;
    if (s.k === 'G' || s.k === 'S') {
      if (b.walking) {
        const dx = b.wx - b.x, dy = b.wy - b.y, d = Math.hypot(dx, dy);
        if (d < 0.5) b.walking = false;
        else {
          const v = Math.min(S.walk || 4, d * 3) * dt;
          const nx = b.x + dx / d * v, ny = b.y + dy / d * v;
          b.a = Math.atan2(dy, dx);
          b.x = nx; b.y = ny;
          b.ph += dt * 14; // bob
        }
      } else if (b.t < 0 && S.walk > 0 && !b.huddle) {
        b.t = b.sp === 'egret' ? rr(2, 6) : rr(0.6, 3);
        if (rnd() < 0.65) {
          let tx, ty;
          if (b.mate && b.mate.f === f && b.mate.st === REST && rnd() < 0.7) { tx = b.mate.x + rr(-4, 4); ty = b.mate.y + rr(-4, 4); }
          else { const a = b.a + (rnd() - 0.5) * 2.6, st = rr(1.5, b.sp === 'myna' ? 7 : 4.5); tx = b.x + Math.cos(a) * st; ty = b.y + Math.sin(a) * st; }
          if (Math.hypot(tx - s.x, ty - s.y) < s.r + 2 && (s.k === 'S' || surfOkGround(tx, ty, s.road))) { b.wx = tx; b.wy = ty; b.walking = true; }
          else b.a += (rnd() - 0.5) * 2;
        } else b.a += (rnd() - 0.5) * 1.2;
      }
      // pecking
      b.pkT -= dt;
      if (b.pkT < 0) { b.pkT = rr(0.4, 2.2); b.pkOn = !b.walking && rnd() < 0.6; }
      const pkTarget = b.pkOn && !b.huddle ? (Math.sin(simT * 13 + b.ph) > 0 ? 0.9 : 0.35) : 0;
      b.pk += (pkTarget - b.pk) * Math.min(1, dt * 14);
      if (b.sp === 'cormorant' && s.k === 'S' && f.mode === 'day') {
        b.spT = (b.spT == null ? rr(3, 20) : b.spT) - dt;
        if (b.spT < 0) { b.spread = b.spread ? 0 : 1; b.spT = b.spread ? rr(6, 15) : rr(10, 30); }
      } else b.spread = 0;
    } else {
      b.pk += (0 - b.pk) * Math.min(1, dt * 8);
      if (b.t < 0) {
        b.t = rr(1.5, 5);
        if (!b.huddle && (s.k === 'W' || s.k === 'R') && rnd() < 0.35 && s.span > 2) {
          // hop along the wire / edge
          const u = ((b.x - s.x) * Math.cos(s.a) + (b.y - s.y) * Math.sin(s.a)) + (rnd() < 0.5 ? -2 : 2);
          const uu = clamp(u, -s.span / 2, s.span / 2);
          b.x = s.x + Math.cos(s.a) * uu; b.y = s.y + Math.sin(s.a) * uu;
        } else if (rnd() < 0.5) b.a += (rnd() < 0.5 ? Math.PI : 0) + (rnd() - 0.5) * 0.6;
      }
    }
    // spontaneous flights (day only)
    if (f.mode === 'day') {
      b.go -= dt;
      if (b.go < 0) {
        b.go = goTime(b);
        if (b.sp === 'pigeon' && f.flying < f.birds.length * 0.3) {
          // a few birds swap between the plaza and the roofs
          const want = s.k === 'G' ? 'up' : 'G';
          const ns = pickSpot(f, 'day', s, want);
          if (ns && ns !== s) { b.st = TOSPOT; b.tgt = ns; spotPos(b, ns, false); b.alt = Math.max(ns.h, s.h) + rr(8, 20); b.vh = 25; b.fa = 1; b.flapBoost = 1.2; b.spot = null; }
        } else if (b.sp !== 'pigeon' && b.sp !== 'parakeet') {
          const ns = pickSpot(f, 'day', s);
          if (ns && ns !== s) {
            b.st = TOSPOT; b.tgt = ns; spotPos(b, ns, false); b.alt = Math.max(ns.h, s.h) + rr(S.alt[0], S.alt[1]) * 0.6; b.vh = 18; b.fa = 1; b.spot = null;
            if (b.sp === 'crow' && rnd() < 0.5) sfx('crow', b.x, b.y, 0.6);
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- flock update */
  function playerThreat(out) {
    const p = N.player;
    out.ok = false;
    if (!p || !isFinite(p.x) || (N.state && N.state.mode === 'title')) return out;
    const v = p.vehicle;
    const sp = v ? Math.abs(v.speed || 0) : Math.hypot(p.vx || 0, p.vy || 0);
    out.x = v ? v.x : p.x; out.y = v ? v.y : p.y; out.ok = true; out.v = sp;
    if (v) out.r = sp > 25 ? 26 + sp * 0.22 : 9;
    else out.r = sp > 62 ? 36 : sp > 30 ? 14 : 8;
    let ph = 0;
    try { if (p.level && N.world.roofs && N.world.roofs.heightAt) ph = N.world.roofs.heightAt(p.x, p.y) || 0; } catch (e) { ph = 0; }
    out.h = ph;
    return out;
  }
  const THREAT = { ok: false, x: 0, y: 0, r: 0, h: 0, v: 0 };
  let vehScanT = 0;
  function updateFlock(f, dt) {
    f.cool -= dt;
    // mode changes (dusk -> roost, rain -> shelter, dawn / dry -> day)
    const m = modeFor(f.sp);
    if (m !== f.mode) {
      f.mode = m;
      for (const b of f.birds) {
        if (b.st === REST) {
          const cur = b.spot;
          const needMove = m === 'day' ? (f.sp === 'pigeon' ? rnd() < 0.7 : rnd() < 0.3) : f.roost.indexOf(cur) < 0;
          if (needMove) { b.go = m === 'day' ? rr(0, 25) : rr(0, 14); b.forceMove = true; }
          else b.huddle = m !== 'day';
        } else if (b.st === ORBIT && m !== 'day') { b.ft = 0; }
      }
    }
    // the player as a threat
    if (THREAT.ok && f.near < 2 && f.S.scare) {
      const r = THREAT.r * f.S.scare;
      for (const b of f.birds) {
        if (b.st !== REST) continue;
        const d = Math.hypot(b.x - THREAT.x, b.y - THREAT.y, (b.h - THREAT.h) * 0.6);
        if (d < r) { scareFlock(f, THREAT.x, THREAT.y, THREAT.r, THREAT.h); break; }
      }
    }
    // fast traffic through the plaza (pigeons) — checked a few times a second
    if (f.sp === 'pigeon' && f.near < 1 && vehScanT <= 0 && f.ground > 0 && N.entities && N.entities.query) {
      try {
        const list = N.entities.query(f.cx, f.cy, 110);
        for (const e of list) {
          if (e.kind !== 'vehicle' || e === (N.player && N.player.vehicle)) continue;
          if (Math.abs(e.speed || 0) < 45) continue;
          for (const b of f.birds) if (b.st === REST && b.spot.k === 'G' && Math.hypot(b.x - e.x, b.y - e.y) < 20) { scareFlock(f, e.x, e.y, 18, 0); break; }
        }
      } catch (e) { N.err('birds.vehscan', e); }
    }
    // parakeet flock: hop to another tree together
    if (f.sp === 'parakeet' && f.mode === 'day') {
      f.nextT -= dt;
      if (f.nextT < 0 && f.day.length > 1) {
        f.nextT = rr(18, 45);
        const cur = f.birds[0] && f.birds[0].spot;
        let ns = null;
        for (let k = 0; k < 6; k++) { ns = f.day[(rnd() * f.day.length) | 0]; if (ns !== cur) break; }
        if (ns && ns !== cur) {
          f.gx = ns.x; f.gy = ns.y;
          let n = 0;
          for (const b of f.birds) {
            if (b.st !== REST) continue;
            b.st = FLOCKFLY; b.tgt = ns; spotPos(b, ns, false); b.alt = Math.max(ns.h, b.h) + rr(10, 22); b.vh = 30; b.fa = 1; b.flapBoost = 1.2; b.spot = null; n++;
            b.vx = (ns.x - b.x) * 0.1; b.vy = (ns.y - b.y) * 0.1;
          }
          if (n) { sfx('parakeet', f.cx, f.cy, 0.8); N.emit('birds:takeoff', { species: 'parakeet', x: f.cx, y: f.cy, n }); }
        }
      }
    }
    // kites: the thermal drifts with the wind; a new thermal now and then
    if (f.sp === 'kite') {
      const w = windAt(f.gx, f.gy);
      f.gx += w.x * w.s * 7 * dt; f.gy += w.y * w.s * 7 * dt;
      f.nextT -= dt;
      if (f.nextT < 0) { f.nextT = rr(50, 110); const a = rnd() * TAU, d = rr(80, 260); f.gx = clamp(f.site.x + Math.cos(a) * d, 50, (N.WORLD_W || 15000) - 50); f.gy = clamp(f.site.y + Math.sin(a) * d, 50, (N.WORLD_H || 11250) - 50); }
      if (Math.hypot(f.gx - f.site.x, f.gy - f.site.y) > 420) { f.gx = f.site.x; f.gy = f.site.y; }
    }
    // calls
    f.callT -= dt;
    if (f.callT < 0 && f.near < 2) {
      f.callT = rr(4, 12);
      const b = f.birds[(rnd() * f.birds.length) | 0];
      if (b) {
        if (f.sp === 'crow' && f.mode !== 'roost') sfx('crow', b.x, b.y, 0.55);
        else if (f.sp === 'pigeon' && f.mode !== 'roost' && b.st === REST) sfx('coo', b.x, b.y, 0.45);
        else if (f.sp === 'parakeet' && f.mode === 'day' && rnd() < 0.5) sfx('parakeet', b.x, b.y, 0.45);
        else if (f.sp === 'myna' && f.mode === 'day') sfx('myna', b.x, b.y, 0.45);
      }
    }
    // birds
    let flying = 0, ground = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = f.birds.length - 1; i >= 0; i--) {
      const b = f.birds[i];
      if (b.forceMove && b.st === REST) {
        b.go -= dt;
        if (b.go < 0) {
          b.forceMove = false;
          const want = f.mode === 'day' ? (f.sp === 'pigeon' ? (b.spot.k === 'G' ? 'up' : 'G') : null) : null;
          const ns = pickSpot(f, f.mode === 'day' ? 'day' : 'roost', b.spot, want);
          if (ns && ns !== b.spot) { b.st = TOSPOT; b.tgt = ns; spotPos(b, ns, f.mode !== 'day'); b.alt = Math.max(ns.h, b.h) + rr(8, 22); b.vh = 22; b.fa = 1; b.spot = null; }
          else b.huddle = f.mode !== 'day';
        }
      }
      switch (b.st) {
        case REST: restBird(b, f, dt); break;
        case SOAR: soarBird(b, f, dt); break;
        case ERRATIC: batBird(b, f, dt); break;
        case LEAVE: leaveBird(b, f, dt); break;
        default: flyBird(b, f, dt);
      }
      if (b.st === LEAVE && (b.leaveT > 12 || b.h > 260)) { f.birds.splice(i, 1); b.f = null; b.spot = null; FREE.push(b); continue; }
      if (b.st === REST) { if (b.spot && b.spot.k === 'G') ground++; } else flying++;
      if (b.x < x0) x0 = b.x; if (b.x > x1) x1 = b.x; if (b.y < y0) y0 = b.y; if (b.y > y1) y1 = b.y;
    }
    f.flying = flying; f.ground = ground;
    f.bx0 = x0; f.by0 = y0; f.bx1 = x1; f.by1 = y1;
    // a dying flock (kites at dusk / in rain, bats at dawn) leaves
    if (f.dying) {
      f.dieT += dt;
      for (const b of f.birds) if (b.st !== LEAVE) { b.st = LEAVE; b.leaveT = 0; b.spot = null; }
    }
  }

  /* ---------------------------------------------------------------- activation */
  function activationR(s) {
    const base = is3D() ? ((N.view3d && N.view3d.quality && N.view3d.quality.actorDist) || 620) + 80 : 560;
    return s.R ? (is3D() ? s.R : s.R * 0.75) : base;
  }
  function totalBirds() { let n = 0; for (const f of active) n += f.birds.length; return n; }
  function tickSites() {
    if (!staticSites) buildStatic();
    evalCellsNear(focus.x, focus.y);
    const cap = low() ? 150 : 280;
    // release far flocks, end flocks out of their hours
    for (let i = active.length - 1; i >= 0; i--) {
      const f = active[i], s = f.site, R = activationR(s) + 260;
      const d = Math.hypot(s.x - focus.x, s.y - focus.y);
      if (d > R || (f.dying && (!f.birds.length || f.dieT > 14))) { releaseFlock(f); continue; }
      if (!f.dying && !siteWanted(s)) { f.dying = true; f.dieT = 0; }
      if (!f.birds.length && !f.dying) releaseFlock(f);
    }
    // activate near sites
    let n = totalBirds();
    const cand = [];
    const C = 512, Rmax = 1200;
    const i0 = Math.floor((focus.x - Rmax) / C), i1 = Math.floor((focus.x + Rmax) / C), j0 = Math.floor((focus.y - Rmax) / C), j1 = Math.floor((focus.y + Rmax) / C);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const L = siteGrid.get(i * 4096 + j); if (!L) continue;
      for (const s of L) {
        if (s.flock || s.dead) continue;
        const d = Math.hypot(s.x - focus.x, s.y - focus.y);
        if (d > activationR(s) || !siteWanted(s)) continue;
        if (s.coolUntil && s.coolUntil > simT) continue;
        cand.push([d, s]);
      }
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, s] of cand) {
      if (n + s.n > cap) break;
      let f = null;
      try { f = buildFlock(s); } catch (e) { N.err('birds.build', e); f = null; }
      if (!f || !f.birds.length) { s.dead = true; if (f) releaseFlock(f); continue; }
      s.flock = f; active.push(f); n += f.birds.length;
    }
  }

  /* ---------------------------------------------------------------- takeover of the old pigeon flocks */
  let savedPigeonPlaces = null;
  const PLACEHOLDER = { id: 'birds.js', cx: -1e7, cy: -1e7, birds: [], spots: [[-1e7, -1e7, 1]], cool: 0, avoid: null, rng: null };
  function takeover() {
    try {
      const T = N.traffic;
      if (T && T.TUNE && Array.isArray(T.TUNE.pigeonPlaces) && T.TUNE.pigeonPlaces.length) { savedPigeonPlaces = T.TUNE.pigeonPlaces.slice(); T.TUNE.pigeonPlaces.length = 0; }
      if (T && Array.isArray(T.flocks) && T.flocks.length) T.flocks.length = 0;
      const LF = N.landmarks && N.landmarks.flocks;
      if (Array.isArray(LF) && (LF.length !== 1 || LF[0] !== PLACEHOLDER)) {
        if (!PLACEHOLDER.rng) PLACEHOLDER.rng = U.rng('birds.placeholder');
        LF.length = 0; LF.push(PLACEHOLDER);
      }
    } catch (e) { N.err('birds.takeover', e); }
  }
  function giveBack() {
    try {
      const T = N.traffic;
      if (T && T.TUNE && savedPigeonPlaces && Array.isArray(T.TUNE.pigeonPlaces) && !T.TUNE.pigeonPlaces.length) for (const id of savedPigeonPlaces) T.TUNE.pigeonPlaces.push(id);
      const LF = N.landmarks && N.landmarks.flocks;
      if (Array.isArray(LF) && LF[0] === PLACEHOLDER) LF.length = 0; // landmarks.js re-creates its flocks
    } catch (e) { N.err('birds.giveBack', e); }
  }

  /* ---------------------------------------------------------------- system */
  let takeT = 0;
  function update(dt) {
    if (!enabled || !N.world || !N.world.built) return;
    const t0 = nowMs();
    const mode = N.state && N.state.mode;
    if (mode === 'paused' || mode === 'map' || mode === 'journal' || mode === 'boot') dt = 0;
    simT += dt; frameNo++;
    takeT -= dt; if (takeT <= 0) { takeT = 1; takeover(); }
    if (N.atmos) N.atmos.focus(focus); else if (N.player) { focus.x = N.player.x; focus.y = N.player.y; }
    tickT -= dt;
    if (tickT <= 0) { tickT = 0.35; try { tickSites(); } catch (e) { N.err('birds.sites', e); } }
    if (dt <= 0) { ST.upd = nowMs() - t0; return; }
    for (let i = pending.length - 1; i >= 0; i--) { const p = pending[i]; p.t -= dt; if (p.t <= 0) { pending.splice(i, 1); scare(p.x, p.y, p.r, 0); } }
    playerThreat(THREAT);
    vehScanT -= dt;
    let count = 0, flying = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      const f = active[i];
      const d = Math.hypot(f.cx - focus.x, f.cy - focus.y);
      f.near = d < 380 ? 0 : d < 700 ? 1 : 2;
      const every = f.near === 0 || f.sp === 'kite' ? 1 : f.near === 1 ? 2 : 4;
      f.accDt += dt;
      if ((frameNo + i) % every === 0) { const fdt = Math.min(0.1, f.accDt); f.accDt = 0; updateFlock(f, fdt); }
      count += f.birds.length; flying += f.flying;
    }
    if (vehScanT <= 0) vehScanT = 0.25;
    ST.count = count; ST.flying = flying;
    ST.upd = nowMs() - t0;
    ST.updAvg += (ST.upd - ST.updAvg) * 0.05;
  }

  /* ================================================================ 2D sprites */
  const SPR = new Map();
  // poses: 0..3 flight frames (projected span 1, .74, .48, .26), 4 perched / standing, 5 pecking, 6 wings spread
  const SPAN_F = [1, 0.74, 0.48, 0.26];
  function wingOutline(S, pose) {
    // right wing (+y on the canvas = the bird's right), in units of (chord, half span)
    switch (S.wing) {
      case 'finger': return [[0.32, 0], [0.32, 0.5], [0.22, 0.86], [0.08, 1.0], [-0.1, 0.97], [-0.28, 1.0], [-0.5, 0.9], [-0.72, 0.5], [-0.66, 0]];
      case 'round': return [[0.34, 0], [0.3, 0.55], [0.12, 0.92], [-0.18, 1.0], [-0.52, 0.84], [-0.72, 0.42], [-0.64, 0]];
      case 'bat': return [[0.3, 0], [0.28, 0.6], [0.2, 1.0], [-0.12, 0.78], [-0.32, 0.92], [-0.48, 0.6], [-0.66, 0.66], [-0.72, 0.22], [-0.6, 0]];
      default: return [[0.3, 0], [0.24, 0.45], [0.02, 0.82], [-0.36, 1.0], [-0.5, 0.76], [-0.7, 0.36], [-0.66, 0]];
    }
  }
  function paintBird(g, S, P, pose) {
    const L = S.len, half = S.span / 2, bw = S.bw;
    const flying = pose <= 3, spread = pose === 6;
    const sf = flying ? SPAN_F[pose] : spread ? 0.62 : 0;
    const chord = L * (S.wing === 'finger' ? 0.42 : S.wing === 'bat' ? 0.4 : 0.36);
    const neckL = S.neck === 1 ? (flying ? 0.05 : 0.35) : S.neck === 2 ? 0.28 : 0;
    const bodyL = L * (S.tail === 'long' ? 0.27 : 0.33);
    const headX = bodyL + L * (0.08 + neckL) + (pose === 5 ? L * 0.08 : 0);
    // tail
    g.fillStyle = P.tail;
    g.beginPath();
    const tx = -bodyL * 0.75;
    if (S.tail === 'fan') { g.moveTo(tx, -bw * 0.28); g.lineTo(tx - L * 0.3, -bw * 0.42); g.lineTo(tx - L * 0.34, 0); g.lineTo(tx - L * 0.3, bw * 0.42); g.lineTo(tx, bw * 0.28); }
    else if (S.tail === 'fork') { g.moveTo(tx, -bw * 0.25); g.lineTo(tx - L * 0.4, -bw * 0.48); g.lineTo(tx - L * 0.32, 0); g.lineTo(tx - L * 0.4, bw * 0.48); g.lineTo(tx, bw * 0.25); }
    else if (S.tail === 'long') { g.moveTo(tx, -bw * 0.22); g.lineTo(tx - L * 0.52, -bw * 0.1); g.lineTo(tx - L * 0.56, 0); g.lineTo(tx - L * 0.52, bw * 0.1); g.lineTo(tx, bw * 0.22); }
    else if (S.tail === 'round') { g.moveTo(tx, -bw * 0.3); g.lineTo(tx - L * 0.22, -bw * 0.32); g.quadraticCurveTo(tx - L * 0.32, 0, tx - L * 0.22, bw * 0.32); g.lineTo(tx, bw * 0.3); }
    else if (S.tail === 'short') { g.moveTo(tx, -bw * 0.26); g.lineTo(tx - L * 0.16, -bw * 0.22); g.lineTo(tx - L * 0.18, 0); g.lineTo(tx - L * 0.16, bw * 0.22); g.lineTo(tx, bw * 0.26); }
    g.closePath(); g.fill();
    if (S.tail === 'fan') { g.fillStyle = P.mark; g.fillRect(tx - L * 0.32, -bw * 0.38, L * 0.06, bw * 0.76); }
    // egret legs trailing in flight
    if (S.neck === 1 && flying) { g.strokeStyle = P.mark; g.lineWidth = 0.35; g.beginPath(); g.moveTo(-bodyL * 0.6, -0.25); g.lineTo(-bodyL - L * 0.32, -0.3); g.moveTo(-bodyL * 0.6, 0.25); g.lineTo(-bodyL - L * 0.32, 0.3); g.stroke(); }
    // wings
    if (sf > 0) {
      const O = wingOutline(S, pose), sh = bw * 0.36;
      for (const side of [-1, 1]) {
        g.fillStyle = P.wing;
        g.beginPath();
        for (let i = 0; i < O.length; i++) {
          const [cx, zf] = O[i];
          const x = cx * chord + (pose === 2 ? zf * L * 0.06 : pose === 1 ? -zf * L * 0.05 : 0);
          const y = side * (sh + zf * (half - sh) * sf);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.closePath(); g.fill();
        // dark primaries
        g.fillStyle = P.tip;
        g.beginPath();
        let started = false;
        for (let i = 0; i < O.length; i++) {
          const [cx, zf] = O[i];
          if (zf < 0.62) continue;
          const x = cx * chord, y = side * (sh + zf * (half - sh) * sf);
          if (!started) { g.moveTo(x, side * (sh + 0.62 * (half - sh) * sf)); started = true; }
          g.lineTo(x, y);
        }
        if (started) { g.closePath(); g.fill(); }
        // marks: pigeon wing bars, kite pale patch, myna white patch
        if (S.id === 'pigeon' && sf > 0.4) { g.fillStyle = P.mark; g.fillRect(-chord * 0.35, side > 0 ? sh + 0.3 : -sh - 0.3 - (half - sh) * sf * 0.38, chord * 0.18, (half - sh) * sf * 0.38); }
        if (S.id === 'kite' || S.id === 'myna') { g.fillStyle = P.mark; g.beginPath(); g.ellipse(-chord * 0.1, side * (sh + 0.66 * (half - sh) * sf), chord * 0.16, (half - sh) * sf * 0.1 + 0.3, 0, 0, TAU); g.fill(); }
      }
    }
    // body
    g.fillStyle = P.body;
    g.beginPath(); g.ellipse(0, 0, bodyL, bw / 2, 0, 0, TAU); g.fill();
    // folded wings on the back
    if (!flying && !spread) {
      g.fillStyle = P.wing;
      g.beginPath(); g.ellipse(-bodyL * 0.25, 0, bodyL * 0.85, bw * 0.42, 0, 0, TAU); g.fill();
      if (S.id === 'pigeon') { g.fillStyle = P.mark; g.fillRect(-bodyL * 0.45, -bw * 0.36, bodyL * 0.16, bw * 0.72); g.fillRect(-bodyL * 0.05, -bw * 0.36, bodyL * 0.14, bw * 0.72); }
      g.fillStyle = P.tip;
      g.beginPath(); g.ellipse(-bodyL * 0.95, 0, bodyL * 0.32, bw * 0.24, 0, 0, TAU); g.fill();
    }
    // neck + head
    if (neckL > 0) { g.strokeStyle = P.neck; g.lineWidth = S.neck === 1 ? 0.9 : 1.1; g.beginPath(); g.moveTo(bodyL * 0.8, 0); g.lineTo(headX, 0); g.stroke(); }
    if (S.id === 'pigeon' || S.id === 'crow') { g.fillStyle = P.neck; g.beginPath(); g.ellipse(bodyL * 0.78, 0, L * 0.12, bw * 0.36, 0, 0, TAU); g.fill(); }
    const hr = S.id === 'kite' ? bw * 0.36 : S.neck ? bw * 0.26 : bw * 0.34;
    g.fillStyle = P.head;
    g.beginPath(); g.arc(headX, 0, hr, 0, TAU); g.fill();
    if (S.id === 'parakeet') { g.strokeStyle = P.mark; g.lineWidth = 0.3; g.beginPath(); g.arc(headX, 0, hr * 0.95, Math.PI * 0.55, Math.PI * 1.45); g.stroke(); }
    g.fillStyle = P.beak;
    const bl = S.neck === 1 ? L * 0.16 : S.id === 'parakeet' ? L * 0.06 : L * 0.08;
    g.beginPath(); g.moveTo(headX + hr * 0.7, -hr * 0.42); g.lineTo(headX + hr * 0.7 + bl, 0); g.lineTo(headX + hr * 0.7, hr * 0.42); g.closePath(); g.fill();
    if (S.id === 'cormorant' && !flying) { g.fillStyle = P.mark; g.beginPath(); g.arc(headX - hr * 0.2, 0, hr * 0.45, 0, TAU); g.fill(); }
  }
  function sprite(S, vi, pose, dir, scb) {
    const key = ((((S.i * 4 + vi) * 8 + pose) * 16 + dir) * 24 + scb);
    let c = SPR.get(key);
    if (c) return c;
    if (SPR.size > 6000) SPR.clear();
    const sc = scb / 4, ext = Math.max(S.len * 1.25, S.span) * sc;
    const sz = Math.ceil(ext + 4);
    const mk = (w, h) => (N.render && N.render.makeCanvas ? N.render.makeCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
    const A = mk(sz, sz), g = A.getContext('2d');
    g.translate(sz / 2, sz / 2); g.rotate(dir * TAU / 16); g.scale(sc, sc);
    paintBird(g, S, S.pal[vi] || S.pal[0], pose);
    // soft dark outline so the birds read on any ground
    c = mk(sz + 2, sz + 2);
    const o = c.getContext('2d');
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) o.drawImage(A, dx, dy);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = S.id === 'egret' ? 'rgba(40,46,52,0.55)' : 'rgba(18,16,22,0.42)';
    o.fillRect(0, 0, sz + 2, sz + 2);
    o.globalCompositeOperation = 'source-over';
    o.drawImage(A, 1, 1);
    SPR.set(key, c);
    return c;
  }
  function poseOf(b) {
    if (b.st === REST) return b.spread ? 6 : b.pk > 0.5 ? 5 : 4;
    const th = b.flap;
    const f = Math.abs(Math.cos(th * 1.2));
    return f > 0.88 ? 0 : f > 0.62 ? 1 : f > 0.37 ? 2 : 3;
  }
  const dirOf = (a) => (Math.round(a / TAU * 16) % 16 + 16) % 16;

  /* ================================================================ 2D draw */
  function blit(ctx, b, k, X, Y) {
    const scb = clamp(Math.round(k * 4 * b.sz), 2, 23);
    const c = sprite(b.S, b.vi, poseOf(b), dirOf(b.a), scb);
    ctx.drawImage(c, Math.round(X - c.width / 2), Math.round(Y - c.height / 2));
  }
  function drawGround(f) {
    const R = N.render, ctx = R.ctx, k = R.Z || 1;
    for (const b of f.birds) {
      if (b.st !== REST || !b.spot || (b.spot.k !== 'G' && b.spot.k !== 'S')) continue;
      const X = R.sx(b.x, k), Y = R.sy(b.y, k);
      if (X < -10 || Y < -10 || X > R.W + 10 || Y > R.H + 10) continue;
      // contact shadow
      ctx.fillStyle = 'rgba(20,16,26,0.22)';
      ctx.fillRect(Math.round(X - 1.5 * k), Math.round(Y + 0.8 * k), Math.max(2, Math.round(3 * k)), 1);
      blit(ctx, b, k, X, Y - (b.S.neck === 1 ? 1 : 0));
    }
  }
  function drawSky() {
    const R = N.render, ctx = R.ctx;
    for (const f of active) {
      for (const b of f.birds) {
        if (b.st === REST && b.spot && (b.spot.k === 'G' || b.spot.k === 'S')) continue;
        const k = R.k(b.h), X = R.sx(b.x, k), Y = R.sy(b.y, k);
        if (X < -20 || Y < -20 || X > R.W + 20 || Y > R.H + 20) continue;
        blit(ctx, b, k, X, Y);
      }
    }
  }
  function drawShadows() {
    const R = N.render, ctx = R.ctx, sun = R.sun, Z = R.Z || 1;
    if (!sun || sun.strength < 0.15) return;
    const sxk = sun.sx, syk = sun.sy;
    for (let pass = 0; pass < 3; pass++) {
      const hA = pass === 0 ? 0 : pass === 1 ? 45 : 130, hB = pass === 0 ? 45 : pass === 1 ? 130 : 1e9;
      let any = false;
      ctx.beginPath();
      for (const f of active) {
        for (const b of f.birds) {
          if (b.st === REST || b.h < 1.5 || b.h < hA || b.h >= hB) continue;
          const X = R.sx(b.x + sxk * b.h, Z), Y = R.sy(b.y + syk * b.h, Z);
          if (X < -20 || Y < -20 || X > R.W + 20 || Y > R.H + 20) continue;
          const sf = Math.abs(Math.cos(b.flap * 1.2));
          const rx = Math.max(0.8, b.S.len * 0.32 * Z), ry = Math.max(0.8, b.S.span * 0.42 * sf * Z) * (pass === 2 ? 1.3 : 1);
          const ca = Math.cos(b.a), sa = Math.sin(b.a);
          ctx.moveTo(X + ca * rx, Y + sa * rx);
          ctx.ellipse(X, Y, rx, ry, b.a, 0, TAU);
          any = true;
        }
      }
      if (any) { ctx.fillStyle = 'rgba(22,18,30,' + ((pass === 0 ? 0.24 : pass === 1 ? 0.15 : 0.08) * sun.strength).toFixed(3) + ')'; ctx.fill(); }
    }
  }
  let skyFn = null, shFn = null;
  function draw() {
    if (!enabled || !active.length || is3D()) return;
    const R = N.render; if (!R || !R.queue || !R.view) return;
    const t0 = nowMs();
    const v = R.view, m = 40;
    let sky = false;
    for (const f of active) {
      if (!f.birds.length || f.bx1 < v.x0 - 260 || f.bx0 > v.x1 + 260 || f.by1 < v.y0 - 260 || f.by0 > v.y1 + 260) continue;
      if (f.ground > 0 && !(f.bx1 < v.x0 - m || f.bx0 > v.x1 + m || f.by1 < v.y0 - m || f.by0 > v.y1 + m)) R.queue('actors', (f.by0 + f.by1) / 2, f.drawG);
      if (f.birds.length > f.ground) sky = true;
    }
    if (sky) {
      if (!skyFn) { skyFn = () => { const t = nowMs(); drawSky(); ST.d2 += nowMs() - t; }; shFn = () => { const t = nowMs(); drawShadows(); ST.d2 += nowMs() - t; }; }
      R.queue('shadow', 0, shFn);
      R.queue('sky', 0, skyFn);
    }
    ST.d2 = nowMs() - t0; // + the layer callbacks (added when they run)
  }

  /* ================================================================ 3D */
  const G3 = { inited: false, group: null, meshes: {}, mats: {}, points: null, m4: null, q: null, e: null, p: null, s: null, c: null, model: {} };
  const BIRD_GLSL = [
    'attribute vec4 aPart;',
    'attribute vec4 iAnim;',
    'vec3 birdPos(vec3 p, inout vec3 n) {',
    '  float w = abs(aPart.x);',
    '  if (w > 0.001) {',
    '    float side = aPart.x > 0.0 ? 1.0 : -1.0;',
    '    float zr = p.z - aPart.z;',
    '    float yr = p.y - aPart.y;',
    '    float fold = iAnim.y;',
    '    float b = fold * 1.35; float cb = cos(b), sb = sin(b);',
    '    float x2 = p.x * cb - abs(zr) * sb;',
    '    float z2 = zr * cb + side * abs(p.x) * sb * 0.25;',
    '    yr += fold * w * 0.12;',
    '    float th = iAnim.x * (1.0 + 0.45 * w) * (1.0 - fold);',
    '    float c = cos(th), s = sin(th);',
    '    float zs = z2 * side;',
    '    float y3 = yr * c + zs * s;',
    '    float zs3 = zs * c - yr * s;',
    '    float nzs = n.z * side;',
    '    n = vec3(n.x, n.y * c + nzs * s, side * (nzs * c - n.y * s));',
    '    return vec3(x2, aPart.y + y3, aPart.z + side * zs3);',
    '  }',
    '  if (aPart.w > 0.001) {',
    '    float pk = iAnim.z * aPart.w;',
    '    float dx = p.x - aPart.y, dy = p.y - aPart.z;',
    '    float c = cos(pk), s = sin(pk);',
    '    n = vec3(n.x * c + n.y * s, -n.x * s + n.y * c, n.z);',
    '    return vec3(aPart.y + dx * c + dy * s, aPart.z - dx * s + dy * c, p.z);',
    '  }',
    '  return p;',
    '}',
  ].join('\n');
  function patchMaterial(mat, key) {
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + BIRD_GLSL)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 birdP = birdPos(vec3(position), objectNormal);')
        .replace('#include <begin_vertex>', 'vec3 transformed = birdP;');
    };
    mat.customProgramCacheKey = () => 'nostalgia-bird-' + key;
    mat.userData.shared = true;
    return mat;
  }
  /** procedural low-poly bird: x forward, y up, z right, origin at the feet; aPart per vertex */
  function birdGeometry(THREE, H, S, white) {
    const P = S.pal[0], pos = [], nor = [], col = [], part = [];
    const cl = (hex) => { const c = H && H.color ? H.color(hex) : new THREE.Color(hex); return [c.r, c.g, c.b]; };
    const PAL = {};
    for (const k in P) PAL[k] = cl(white ? whiten(k, P[k]) : P[k]);
    const sc = S.l3 / S.len; // 3D proportions from the 2D design
    const L = S.l3, half = S.s3 / 2, bw = S.bw * sc * 1.05, bh = bw * 0.95;
    const legH = S.neck === 1 ? L * 0.62 : S.neck === 2 ? L * 0.22 : S.id === 'bat' ? 0 : L * 0.16;
    const by = legH + bh * 0.5;
    const push = (x, y, z, nx, ny, nz, c, p) => { pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]); part.push(p[0], p[1], p[2], p[3]); };
    const NONE = [0, 0, 0, 0];
    function ell(cx, cy, cz, rx, ry, rz, c, seg, rings, p) {
      p = p || NONE;
      const V = (i, j) => { const th = j / rings * Math.PI, ph = i / seg * TAU; const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph); return [cx + nx * rx, cy + ny * ry, cz + nz * rz, nx / rx, ny / ry, nz / rz]; };
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const a = V(i, j), b = V(i + 1, j), c2 = V(i + 1, j + 1), d = V(i, j + 1);
        for (const q of [a, d, c2, a, c2, b]) { const l = Math.hypot(q[3], q[4], q[5]) || 1; push(q[0], q[1], q[2], q[3] / l, q[4] / l, q[5] / l, c, p); }
      }
    }
    function tri(a, b, c, colA, colB, colC, pa, pb, pc) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      push(a[0], a[1], a[2], nx, ny, nz, colA, pa || NONE); push(b[0], b[1], b[2], nx, ny, nz, colB || colA, pb || NONE); push(c[0], c[1], c[2], nx, ny, nz, colC || colA, pc || NONE);
    }
    const bodyL = L * (S.tail === 'long' ? 0.27 : 0.33);
    // body
    ell(0, by, 0, bodyL, bh / 2, bw / 2, PAL.body, 8, 5);
    // tail
    const tx = -bodyL * 0.8, ty = by + bh * 0.08;
    const tl = S.tail === 'long' ? L * 0.56 : S.tail === 'fork' ? L * 0.4 : S.tail === 'fan' ? L * 0.34 : S.tail === 'round' ? L * 0.3 : S.tail === 'short' ? L * 0.18 : 0;
    if (tl > 0) {
      const tw = S.tail === 'long' ? bw * 0.18 : bw * 0.5;
      const notch = S.tail === 'fork' ? tl * 0.25 : 0;
      tri([tx, ty, -bw * 0.25], [tx - tl, ty - 0.05, -tw], [tx - tl + notch, ty - 0.05, 0], PAL.tail);
      tri([tx, ty, -bw * 0.25], [tx - tl + notch, ty - 0.05, 0], [tx, ty, bw * 0.25], PAL.tail);
      tri([tx, ty, bw * 0.25], [tx - tl + notch, ty - 0.05, 0], [tx - tl, ty - 0.05, tw], PAL.tail);
    }
    // neck + head (the head part pecks: pivot at the neck base)
    const neckL = S.neck === 1 ? L * 0.34 : S.neck === 2 ? L * 0.26 : 0;
    const hr = (S.id === 'kite' ? bw * 0.42 : S.neck ? bw * 0.3 : bw * 0.4);
    const hx = bodyL * 0.85 + (S.neck === 1 ? L * 0.1 : S.neck === 2 ? neckL * 0.9 : hr * 0.4);
    const hy = by + bh * 0.35 + (S.neck === 1 ? neckL * 0.95 : S.neck === 2 ? neckL * 0.35 : hr * 0.2);
    const piv = [0, bodyL * 0.6, by + bh * 0.2, 1];
    if (neckL > 0) {
      ell((bodyL * 0.7 + hx) / 2, (by + hy) / 2, 0, Math.max(bw * 0.18, Math.abs(hx - bodyL * 0.7) / 2 + bw * 0.1), Math.abs(hy - by) / 2 + bw * 0.12, bw * 0.18, PAL.neck, 6, 4, piv);
    } else if (S.id === 'pigeon' || S.id === 'crow') ell(bodyL * 0.72, by + bh * 0.2, 0, bw * 0.34, bh * 0.4, bw * 0.38, PAL.neck, 6, 4, piv);
    ell(hx, hy, 0, hr * 1.05, hr, hr * 0.9, PAL.head, 7, 5, piv);
    const bl = S.neck === 1 ? L * 0.18 : S.id === 'parakeet' ? L * 0.07 : L * 0.09;
    const bx0 = hx + hr * 0.8, bt = hr * 0.38;
    const tip = [bx0 + bl, hy - (S.id === 'parakeet' ? hr * 0.3 : 0), 0];
    const b1 = [bx0, hy + bt, 0], b2 = [bx0, hy - bt * 0.6, -bt], b3 = [bx0, hy - bt * 0.6, bt];
    tri(b1, tip, b2, PAL.beak, null, null, piv, piv, piv); tri(b1, b3, tip, PAL.beak, null, null, piv, piv, piv); tri(b2, tip, b3, PAL.beak, null, null, piv, piv, piv);
    if (S.id === 'parakeet') ell(hx - hr * 0.1, hy - hr * 0.25, 0, hr * 0.5, hr * 0.25, hr * 0.95, PAL.mark, 6, 3, piv);
    // legs
    if (legH > 0.05) {
      const lc = S.neck === 1 ? PAL.mark : S.id === 'myna' ? PAL.beak : cl('#b07a70');
      const lw = Math.max(0.08, L * 0.025);
      for (const z of [-bw * 0.18, bw * 0.18]) {
        tri([-lw, 0, z], [lw, 0, z], [lw * 0.5, by, z], lc); tri([0, 0, z - lw], [0, 0, z + lw], [0, by, z], lc);
        tri([0, 0.01, z], [L * 0.12, 0.01, z - lw * 1.5], [L * 0.12, 0.01, z + lw * 1.5], lc);
      }
    }
    // wings
    const O = wingOutline(S), chord = L * (S.wing === 'finger' ? 0.42 : S.wing === 'bat' ? 0.4 : 0.36), sh = bw * 0.36, wy = by + bh * 0.22;
    for (const side of [-1, 1]) {
      const pts = O.map(([cx, zf]) => [cx * chord, wy, side * (sh + zf * (half - sh)), zf]);
      const root = [(pts[0][0] + pts[pts.length - 1][0]) / 2, wy, side * sh, 0];
      const pw = (q) => [side * Math.max(0.0015, q[3]), wy, side * sh, 0];
      const cw = (q) => (q[3] > 0.7 ? PAL.tip : (S.id === 'kite' || S.id === 'myna') && q[3] > 0.5 && q[3] <= 0.7 ? PAL.mark : PAL.wing);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        tri(root, a, b, PAL.wing, cw(a), cw(b), pw(root), pw(a), pw(b));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 4));
    g.computeBoundingSphere();
    return g;
  }
  function whiten(k, hex) { // pigeons are built light and tinted per instance
    if (k === 'body' || k === 'wing' || k === 'tail') return '#f2f2f2';
    if (k === 'head') return '#cfd3d8';
    if (k === 'neck') return '#c4d8d2';
    if (k === 'tip' || k === 'mark') return '#6a6e74';
    return hex;
  }
  /** geometry from a Blender model (first mesh), turned into the bird frame with aPart from the wing extent */
  function modelGeometry(THREE, obj, S, meta) {
    meta = meta || {};
    let mesh = null;
    obj.traverse((o) => { if (!mesh && o.isMesh && o.geometry && o.geometry.attributes.position) mesh = o; });
    if (!mesh) return null;
    obj.updateMatrixWorld(true);
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    g.rotateY(Math.PI / 2); // GLB +Z front -> +x
    g.computeBoundingBox();
    const bb = g.boundingBox, span = bb.max.z - bb.min.z;
    if (!(span > 0)) return null;
    const s = S.s3 / span;
    g.scale(s, s, s);
    // the pack's birds have their origin at the body centre (bodyZ above the feet): put the feet on y = 0
    g.computeBoundingBox();
    const lift = meta.bodyZ != null ? meta.bodyZ * s : (meta.perchLift != null ? meta.perchLift * s : -g.boundingBox.min.y);
    if (lift) g.translate(0, lift, 0);
    g.computeBoundingBox();
    const p = g.attributes.position, n = p.count, part = new Float32Array(n * 4);
    const half = Math.max(Math.abs(g.boundingBox.min.z), Math.abs(g.boundingBox.max.z)), sh = half * 0.16;
    const wy = (g.boundingBox.min.y + g.boundingBox.max.y) * 0.55;
    const hx0 = g.boundingBox.max.x - (g.boundingBox.max.x - g.boundingBox.min.x) * 0.3;
    for (let i = 0; i < n; i++) {
      const z = p.getZ(i), az = Math.abs(z);
      if (az > sh) { part[i * 4] = Math.sign(z) * clamp((az - sh) / (half - sh), 0.002, 1); part[i * 4 + 1] = wy; part[i * 4 + 2] = Math.sign(z) * sh; }
      else if (p.getX(i) > hx0) { part[i * 4 + 1] = hx0; part[i * 4 + 2] = wy; part[i * 4 + 3] = 1; } // head pecks
    }
    g.setAttribute('aPart', new THREE.BufferAttribute(part, 4));
    if (!g.attributes.normal) g.computeVertexNormals();
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone();
    return { geo: g, mat };
  }
  function makeSpeciesMesh(THREE, H, spk, geo, mat, cap) {
    const S = SP[spk];
    const g = new THREE.BufferGeometry();
    for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
    if (geo.index) g.setIndex(geo.index);
    const iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); iA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iAnim', iA);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.InstancedMesh(g, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.count = 0; m.visible = false; m.castShadow = false; m.receiveShadow = false;
    m.name = 'birds:' + spk;
    G3.group.add(m);
    return { mesh: m, geo, mat, cap, n: 0, iA, S };
  }
  function speciesMesh(spk, need) {
    const THREE = G3.THREE, H = G3.H;
    let r = G3.meshes[spk];
    if (r && r.cap >= need) return r;
    const cap = Math.max(need, r ? r.cap * 2 : (spk === 'pigeon' ? 96 : 32));
    let geo = r ? r.geo : null, mat = r ? r.mat : null;
    if (!geo) {
      geo = birdGeometry(THREE, H, SP[spk], spk === 'pigeon');
      mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'proc');
    }
    if (r) { G3.group.remove(r.mesh); r.mesh.geometry.dispose(); }
    r = G3.meshes[spk] = makeSpeciesMesh(THREE, H, spk, geo, mat, cap);
    return r;
  }
  function tryModels() {
    const M3 = N.models3d;
    if (!M3 || !M3.ready || !M3.has) return;
    for (const spk of SPECIES) {
      const id = MODEL_ID[spk];
      if (G3.model[spk] !== undefined) continue;
      if (!M3.has(id)) { G3.model[spk] = null; continue; }
      G3.model[spk] = 'loading';
      const done = (md) => {
        try {
          const obj = md ? M3.instance(id) : null;
          const man = M3.manifest ? M3.manifest(id) : null;
          const got = obj ? modelGeometry(G3.THREE, obj, SP[spk], (man && man.meta) || null) : null;
          if (!got) { G3.model[spk] = null; return; }
          got.mat.vertexColors = !!got.geo.attributes.color;
          got.mat.side = G3.THREE.DoubleSide;
          patchMaterial(got.mat, 'model-' + spk);
          G3.model[spk] = got;
          const r = G3.meshes[spk];
          if (r) { G3.group.remove(r.mesh); r.mesh.geometry.dispose(); }
          G3.meshes[spk] = makeSpeciesMesh(G3.THREE, G3.H, spk, got.geo, got.mat, r ? r.cap : 64);
        } catch (e) { G3.model[spk] = null; N.err('birds.model', e); }
      };
      try { const pr = M3.parse ? M3.parse(id) : null; if (pr && pr.then) pr.then(done, () => { G3.model[spk] = null; }); else done(M3.loaded(id) ? true : null); } catch (e) { G3.model[spk] = null; }
    }
  }
  function init3D(THREE, H) {
    G3.THREE = THREE; G3.H = H;
    G3.group = new THREE.Group(); G3.group.name = 'birds';
    H.layer.add(G3.group);
    G3.m4 = new THREE.Matrix4(); G3.q = new THREE.Quaternion(); G3.e = new THREE.Euler(0, 0, 0, 'YZX'); G3.p = new THREE.Vector3(); G3.s = new THREE.Vector3(); G3.c = new THREE.Color();
    const PC = 512;
    const pg = new THREE.BufferGeometry();
    const pp = new THREE.BufferAttribute(new Float32Array(PC * 3), 3); pp.setUsage(THREE.DynamicDrawUsage);
    const pc = new THREE.BufferAttribute(new Float32Array(PC * 3), 3); pc.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('position', pp); pg.setAttribute('color', pc);
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const pm = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true });
    pm.userData.shared = true;
    G3.points = new THREE.Points(pg, pm); G3.points.frustumCulled = false; G3.points.name = 'birds:far'; G3.points.visible = false;
    G3.pcap = PC;
    G3.group.add(G3.points);
    G3.inited = true;
  }
  const PCOL3 = {};
  function farColor(spk) {
    if (PCOL3[spk]) return PCOL3[spk];
    const c = G3.H.color ? G3.H.color(SP[spk].pal[0].body) : new G3.THREE.Color(SP[spk].pal[0].body);
    return (PCOL3[spk] = [c.r * 0.7, c.g * 0.7, c.b * 0.7]);
  }
  const ground3 = (x, y) => { try { return N.view3d.groundHeightAt ? N.view3d.groundHeightAt(x, y) || 0 : 0; } catch (e) { return 0; } };
  function update3D(dt, H) {
    if (!G3.inited) return;
    const t0 = nowMs();
    for (const k in G3.meshes) G3.meshes[k].n = 0;
    let pn = 0;
    if (!enabled || !active.length) { finish3D(0); ST.d3 = nowMs() - t0; return; }
    tryModels();
    const VSv = H.VS || VS(), cam = H.camera && H.camera.position;
    const cx = cam ? cam.x : focus.x, cz = cam ? cam.z : focus.y;
    const Q = H.quality || {};
    const meshD = Q.tier === 'low' ? 260 : 420, farD = (Q.drawDist || 1500) * 0.8;
    const need = {};
    for (const f of active) need[f.sp] = (need[f.sp] || 0) + f.birds.length;
    for (const spk in need) speciesMesh(spk, need[spk]);
    const V3 = N.view3d;
    const m4 = G3.m4, q = G3.q, e = G3.e, p = G3.p, s = G3.s;
    const PA = G3.points.geometry.attributes.position.array, PCa = G3.points.geometry.attributes.color.array;
    for (const f of active) {
      const r = G3.meshes[f.sp]; if (!r) continue;
      const S = f.S;
      for (const b of f.birds) {
        let y;
        const sp = b.spot;
        if (b.st === REST && sp) y = sp.k === 'G' || sp.k === 'S' ? ground3(b.x, b.y) : sp.h3;
        else {
          y = b.h * VSv;
          const t = b.tgt;
          if (b.st === TOSPOT && t) {
            const d = Math.hypot(b.rx - b.x, b.ry - b.y);
            const bl = clamp(1 - (d - 2) / 40, 0, 1);
            const tgtY = t.k === 'G' || t.k === 'S' ? ground3(b.rx, b.ry) : t.h3;
            y += (tgtY - t.h * VSv) * bl;
            if (d > 26 && V3 && V3.heightAt) y = Math.max(y, V3.heightAt(b.x, b.y) + 2);
          } else if (V3 && V3.heightAt) y = Math.max(y, V3.heightAt(b.x, b.y) + 2);
        }
        const dx = b.x - cx, dz = b.y - cz, d = Math.sqrt(dx * dx + dz * dz);
        if (d > farD) continue;
        if (d > meshD && b.st !== REST) {
          if (pn < G3.pcap) { const c = farColor(f.sp); PA[pn * 3] = b.x; PA[pn * 3 + 1] = y + 1; PA[pn * 3 + 2] = b.y; PCa[pn * 3] = c[0]; PCa[pn * 3 + 1] = c[1]; PCa[pn * 3 + 2] = c[2]; pn++; }
          continue;
        }
        if (d > meshD * 1.3) continue; // far resting birds: too small to see
        const i = r.n; if (i >= r.cap) continue;
        r.n++;
        e.set(b.st === REST ? 0 : b.roll, -b.a, b.st === REST ? (sp && sp.k === 'G' ? 0 : 0.05) : clamp(b.pitch, -0.45, 0.5));
        q.setFromEuler(e);
        p.set(b.x, y, b.y);
        const fluff = b.huddle ? 1.12 : 1;
        s.set(b.sz, b.sz * fluff, b.sz * fluff);
        m4.compose(p, q, s);
        m4.toArray(r.mesh.instanceMatrix.array, i * 16);
        const A = r.iA.array;
        let flap = b.flap, fold = b.st === REST ? 1 : 0;
        if (b.st === REST && b.spread) { fold = 0.05; flap = 0.3; }
        if (b.st === TOSPOT && b.tgt) { const dd = Math.hypot(b.rx - b.x, b.ry - b.y); if (dd < 3) fold = Math.max(0, 1 - dd / 3) * 0.6; }
        A[i * 4] = flap; A[i * 4 + 1] = fold; A[i * 4 + 2] = b.st === REST ? b.pk * 0.9 : 0; A[i * 4 + 3] = 0;
        const C = r.mesh.instanceColor.array;
        if (f.sp === 'pigeon') { const t3 = S.tint3[b.vi] || S.tint3[0]; C[i * 3] = t3[0]; C[i * 3 + 1] = t3[1]; C[i * 3 + 2] = t3[2]; }
        else { const v = 0.92 + (b.sz - 0.9) * 0.8; C[i * 3] = v; C[i * 3 + 1] = v; C[i * 3 + 2] = v; }
      }
    }
    finish3D(pn);
    ST.d3 = nowMs() - t0;
    ST.d3Avg += (ST.d3 - ST.d3Avg) * 0.05;
  }
  function finish3D(pn) {
    let vis = 0, inst = 0;
    for (const k in G3.meshes) {
      const r = G3.meshes[k], m = r.mesh;
      m.count = r.n; m.visible = r.n > 0;
      if (r.n) { vis++; inst += r.n; m.instanceMatrix.needsUpdate = true; r.iA.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    }
    const P = G3.points;
    if (P) {
      P.visible = pn > 0 && vis < 8;
      P.geometry.setDrawRange(0, pn);
      if (pn) { P.geometry.attributes.position.needsUpdate = true; P.geometry.attributes.color.needsUpdate = true; }
    }
    ST.calls = vis + (P && P.visible ? 1 : 0); ST.inst = inst; ST.pts = P && P.visible ? pn : 0;
  }
  function dispose3D() {
    if (!G3.inited) return;
    for (const k in G3.meshes) { const r = G3.meshes[k]; r.mesh.geometry.dispose(); if (!G3.model[k] || G3.model[k] === 'loading') { /* shared proc geo below */ } }
    for (const k in G3.meshes) { const r = G3.meshes[k]; try { r.geo.dispose(); r.mat.dispose(); } catch (e) { /* ignore */ } }
    G3.meshes = {}; G3.model = {};
    if (G3.points) { G3.points.geometry.dispose(); G3.points.material.dispose(); }
    if (G3.group && G3.group.parent) G3.group.parent.remove(G3.group);
    G3.inited = false;
  }
  if (N.view3d && N.view3d.registerLayer) {
    N.view3d.registerLayer('birds', {
      order: 30,
      init(THREE, H) { try { init3D(THREE, H); } catch (e) { N.err('birds.init3d', e); } },
      update(dt, H) { try { update3D(dt, H); } catch (e) { N.err('birds.update3d', e); } },
      dispose() { try { dispose3D(); } catch (e) { N.err('birds.dispose3d', e); } },
    });
  }

  /* ================================================================ events */
  N.on('horn', (e) => {
    if (!enabled || !e || !isFinite(e.x)) return;
    const t = e.type || 'foot';
    const r = t === 'foot' ? 60 : t === 'cycle' || t === 'ladiescycle' ? 55 : t === 'bus' || t === 'lorry' ? 120 : 90;
    scare(e.x, e.y, r, 0);
  });
  N.on('traffic:honk', (e) => { if (enabled && e && e.vehicle && isFinite(e.vehicle.x)) scare(e.vehicle.x, e.vehicle.y, 45, 0); });
  N.on('weather:lightning', (e) => {
    if (!enabled || !e || !(e.dist < 900)) return;
    for (const f of active) if (f.sp === 'pigeon' || f.sp === 'crow') pending.push({ t: (e.delay || 0.5) + rnd() * 0.3, x: f.cx, y: f.cy, r: 120 });
  });
  N.on('world:built', () => { staticSites = null; for (let i = active.length - 1; i >= 0; i--) releaseFlock(active[i]); });
  N.on('game:new', () => { if (enabled) takeover(); for (let i = active.length - 1; i >= 0; i--) releaseFlock(active[i]); for (const s of staticSites || []) { s.dead = false; } tickT = 0; });

  N.addSystem({
    id: 'birds', order: 44, runIn: ['play', 'dialogue', 'cutscene', 'title', 'gameover', 'minigame'],
    update(dt) { update(dt); },
    draw() { try { draw(); } catch (e) { N.err('birds.draw', e); } },
    reset() { for (let i = active.length - 1; i >= 0; i--) releaseFlock(active[i]); tickT = 0; pending.length = 0; if (enabled) takeover(); },
  });

  /* ================================================================ API */
  function count(sp) { let n = 0; for (const f of active) if (!sp || f.sp === sp) n += f.birds.length; return n; }
  N.birds = {
    get enabled() { return enabled; },
    set enabled(v) {
      v = !!v;
      if (v === enabled) return;
      enabled = v;
      if (!v) { for (let i = active.length - 1; i >= 0; i--) releaseFlock(active[i]); giveBack(); if (G3.inited) finish3D(0); }
      else { takeover(); tickT = 0; }
    },
    species: SP,
    SPECIES,
    flocks: active,
    count,
    mode: modeFor,
    scare(x, y, r) { return scare(x, y, r || 60, 0); },
    spawnFlock(species, x, y, n) {
      if (!SP[species]) return null;
      if (!staticSites) buildStatic();
      const site = { id: 'manual:' + species + ':' + Math.round(x) + ':' + Math.round(y) + ':' + (ST.spawned | 0), sp: species, x, y, n: n || 8, R: 2500, manual: true, ring: [0, 50], treeR: 400, ah: 26 };
      if (species === 'kite') site.R = 2500;
      const f = buildFlock(site);
      if (!f || !f.birds.length) { if (f) releaseFlock(f); return null; }
      addSite(site); site.flock = f; active.push(f);
      return f;
    },
    clear() { for (let i = active.length - 1; i >= 0; i--) releaseFlock(active[i]); for (const s of staticSites || []) s.coolUntil = simT + 2; },
    refresh() { tickT = 0; },
    sites() { return (staticSites || []).map((s) => ({ id: s.id, sp: s.sp, x: Math.round(s.x), y: Math.round(s.y), n: s.n, active: !!s.flock })); },
    stats() {
      const by = {};
      for (const k of SPECIES) by[k] = { n: 0, flying: 0, rest: 0 };
      for (const f of active) for (const b of f.birds) { const o = by[f.sp]; o.n++; if (b.st === REST) o.rest++; else o.flying++; }
      return {
        enabled, count: ST.count, flying: ST.flying, flocks: active.length, sites: staticSites ? staticSites.length : 0, bySpecies: by,
        updMs: +ST.upd.toFixed(3), updAvg: +ST.updAvg.toFixed(3), draw2dMs: +ST.d2.toFixed(3), draw3dMs: +ST.d3.toFixed(3), draw3dAvg: +ST.d3Avg.toFixed(3),
        calls3d: ST.calls, instances3d: ST.inst, points3d: ST.pts, sprites: SPR.size, pool: FREE.length, takeoffs: ST.takeoffs, spawned: ST.spawned, released: ST.released,
        models: Object.fromEntries(Object.entries(G3.model).map(([k, v]) => [k, v && v !== 'loading' ? 'model' : v || 'procedural'])),
      };
    },
    _debug: { obstH, active, SPR, G3 },
  };
})();
