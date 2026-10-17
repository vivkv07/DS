/* NOSTALGIA — entities.js
 * Entity registry + spatial hash, Actor base class, N.people.draw (shared top-down person
 * painter with many looks and a walk cycle), N.player on foot, and N.interact (one place
 * that decides what the ACTION button does this frame). Contract: ARCHITECTURE.md §8.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;

  /* ============================================================ Actor */
  let nextId = 1;
  class Actor {
    constructor(props) {
      this.id = nextId++;
      this.kind = 'prop';
      this.x = 0; this.y = 0; this.angle = 0;
      this.vx = 0; this.vy = 0;
      this.r = 4; this.mass = 1;
      this.alive = true; this.solid = true;
      if (props) Object.assign(this, props);
    }
    update(dt) { void dt; }
    draw() {}
  }
  N.Actor = Actor;

  /* ========================================================= registry */
  const HC = 64; // hash cell
  const list = [];
  let hash = new Map();
  const hkey = (i, j) => j * 4096 + i;

  function rebuildHash() {
    hash = new Map();
    for (const e of list) {
      if (!e.alive) continue;
      const k = hkey(Math.floor(e.x / HC), Math.floor(e.y / HC));
      const b = hash.get(k);
      if (b) b.push(e); else hash.set(k, [e]);
    }
  }

  const E = (N.entities = {
    Actor,
    all: list,
    add(e) {
      if (!e.id) e.id = nextId++;
      if (e.alive === undefined) e.alive = true;
      if (list.indexOf(e) < 0) list.push(e);
      const k = hkey(Math.floor(e.x / HC), Math.floor(e.y / HC));
      const b = hash.get(k); if (b) b.push(e); else hash.set(k, [e]);
      N.emit('entity:add', e);
      return e;
    },
    remove(e) {
      if (!e) return;
      e.alive = false;
      const i = list.indexOf(e);
      if (i >= 0) list.splice(i, 1);
      N.emit('entity:remove', e);
    },
    /** Entities within r of (x,y) (centre distance minus their radius), optional predicate. */
    query(x, y, r, pred) {
      const out = [];
      const i0 = Math.floor((x - r - 40) / HC), i1 = Math.floor((x + r + 40) / HC);
      const j0 = Math.floor((y - r - 40) / HC), j1 = Math.floor((y + r + 40) / HC);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const b = hash.get(hkey(i, j)); if (!b) continue;
        for (const e of b) {
          if (!e.alive) continue;
          const rr = r + (e.r || 0);
          if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= rr * rr && (!pred || pred(e))) out.push(e);
        }
      }
      return out;
    },
    nearest(x, y, r, pred) {
      let best = null, bd = Infinity;
      for (const e of E.query(x, y, r, pred)) {
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    byKind(kind) { return list.filter((e) => e.alive && e.kind === kind); },
    clear(pred) {
      for (const e of list.slice()) if (e !== N.player && (!pred || pred(e))) E.remove(e);
    },
    count: () => list.length,
    update(dt) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive || e.selfUpdate) continue;
        try { e.update(dt); } catch (err) { N.err('entity.update:' + (e.kind || '?'), err); }
      }
      for (let i = list.length - 1; i >= 0; i--) if (!list[i].alive) { const e = list[i]; list.splice(i, 1); N.emit('entity:remove', e); }
      rebuildHash();
      resolveOverlaps();
    },
    draw() {
      const R = N.render;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive || e.hidden) continue;
        if (!R.inView(e.x, e.y, (e.r || 8) + 60)) continue;
        try { e.draw(); } catch (err) { N.err('entity.draw:' + (e.kind || '?'), err); }
      }
    },
  });

  // Move an actor that is being shoved, without pushing it into (or through) a wall.
  // Vehicles are moved by vehicles.js; everything else collides like a walker.
  function pushTo(e, x, y) {
    if (e.kind === 'vehicle' || e.noWorld || !N.world.built) { e.x = x; e.y = y; return; }
    const c = N.world.collide(x, y, e.r || 4, e.moveMode || 'walk');
    if (c.bad) return;
    if (c.hit && N.world.raycast(e.x, e.y, c.x, c.y, e.moveMode || 'walk').hit) return; // would cross a wall: stay
    e.x = c.x; e.y = c.y;
  }
  E.pushTo = pushTo;

  // Push overlapping solid actors apart (mass-weighted) and report bumps.
  function resolveOverlaps() {
    for (const [k, b] of hash) {
      void k;
      for (const a of b) {
        if (!a.solid || !a.alive || a.noCollide) continue;
        const near = E.query(a.x, a.y, (a.r || 4) + 2);
        for (const o of near) {
          if (o === a || o.id < a.id || !o.solid || o.noCollide) continue;
          if (a.ignore === o || o.ignore === a) continue;
          const dx = o.x - a.x, dy = o.y - a.y;
          const rr = (a.r || 4) + (o.r || 4);
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 0.01;
          const nx = d2 > 0 ? dx / d : 1, ny = d2 > 0 ? dy / d : 0;
          const pen = rr - d;
          const ma = a.fixed ? 1e9 : a.mass || 1, mo = o.fixed ? 1e9 : o.mass || 1;
          const ta = mo / (ma + mo), to = ma / (ma + mo);
          if (!a.fixed) pushTo(a, a.x - nx * pen * ta, a.y - ny * pen * ta);
          if (!o.fixed) pushTo(o, o.x + nx * pen * to, o.y + ny * pen * to);
          const rel = ((a.vx || 0) - (o.vx || 0)) * nx + ((a.vy || 0) - (o.vy || 0)) * ny; // closing speed
          const info = { a, b: o, nx, ny, speed: Math.max(0, rel) };
          if (a.onBump) { try { a.onBump(o, info); } catch (err) { N.err('onBump', err); } }
          if (o.onBump) { try { o.onBump(a, info); } catch (err) { N.err('onBump', err); } }
          if (info.speed > 30) N.emit('bump', info);
        }
      }
    }
  }

  /* ===================================================== people painter */
  const SKIN = ['#8d5a3b', '#a0683f', '#b97a4f', '#c68b5e', '#7a4a30', '#d29a6a', '#9a6040'];
  const SHIRT = ['#e8e0d0', '#2a5cb8', '#d8402a', '#3a8a3a', '#f2c230', '#7a3a8a', '#efe9dc', '#2a8c82', '#c86a2a', '#5a6a8a', '#e88aa8', '#8a2a2a'];
  const PANTS = ['#3a3a4a', '#5a4a3a', '#2a3a5a', '#7a6a5a', '#4a4a4a', '#c8b89a'];
  const SAREE = ['#d8402a', '#2a8c82', '#f2c230', '#c03a8a', '#3a8a3a', '#f08a24', '#7a3a8a', '#e85a7a', '#2a5cb8'];
  const LUNGI = ['#2a5cb8', '#3a8a3a', '#7a3a3a', '#efe9dc', '#5a3a8a'];

  const PEOPLE_SCALE = 1.5;
  function outline(ctx) { ctx.strokeStyle = 'rgba(25,15,20,0.6)'; ctx.lineWidth = 0.7; ctx.stroke(); }
  function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }

  /**
   * Draw a person top-down, centred at origin facing +x, ~8 units across the shoulders.
   * look: {kind, skin, hair, shirt, pants, cap?, accent?, bag?}; anim: {phase, speed 0..1, run}
   */
  function drawPerson(ctx, look, anim) {
    look = look || {};
    anim = anim || {};
    const kind = look.kind || 'man';
    const skin = look.skin || '#a0683f', hair = look.hair || '#1a1412';
    const shirt = look.shirt || '#e8e0d0', pants = look.pants || '#3a3a4a';
    // People are drawn ~1.35x their collision size so they read at the internal resolution.
    const sc = PEOPLE_SCALE * (kind === 'kid' || kind === 'student' ? 0.84 : kind === 'uncle' ? 1.08 : 1);
    const ph = anim.phase || 0, mv = U.clamp(anim.speed == null ? 0 : anim.speed, 0, 1);
    const stride = (anim.run ? 3.3 : 2.3) * mv;
    const sw = Math.sin(ph) * stride;
    if (sc !== 1) ctx.scale(sc, sc);
    const longLegs = !(kind === 'saree' || kind === 'aunty' || kind === 'burqa' || kind === 'uncle' || kind === 'lungi');

    // legs + feet (chappals)
    if (longLegs) {
      const legCol = kind === 'kid' || (kind === 'student' && !look.girl) ? skin : pants;
      for (const s of [-1, 1]) {
        const lx = s * sw, ly = s * 1.35;
        ctx.fillStyle = '#2a2220'; ell(ctx, lx + 1.6, ly, 1.1, 0.8); ctx.fill();
        ctx.fillStyle = legCol; ell(ctx, lx * 0.6 + 0.4, ly, 1.7, 0.95); ctx.fill();
      }
      if (kind === 'kid' || kind === 'student') { // half-pants / skirt
        ctx.fillStyle = look.girl ? (look.pants || '#2a3a6a') : pants;
        ell(ctx, -0.2, 0, 1.9, 2.6); ctx.fill();
      }
    } else {
      // wrap (lungi / saree / burqa) hides legs; feet peek out
      for (const s of [-1, 1]) { ctx.fillStyle = '#2a2220'; ell(ctx, s * sw * 0.7 + 1.5, s * 1.2, 1.0, 0.75); ctx.fill(); }
      const wrap = kind === 'burqa' ? '#141216' : kind === 'saree' || kind === 'aunty' ? (look.saree || look.shirt || '#d8402a') : (look.lungi || look.pants || '#2a5cb8');
      ctx.fillStyle = wrap;
      ell(ctx, -0.2 + sw * 0.15, 0, 2.6 + mv * 0.4, 3.0); ctx.fill(); outline(ctx);
      if (kind === 'uncle' || kind === 'lungi') { // checks on the lungi
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.35;
        ctx.beginPath(); ctx.moveTo(-2, -2.2); ctx.lineTo(-2, 2.2); ctx.moveTo(0.4, -2.8); ctx.lineTo(0.4, 2.8); ctx.moveTo(-2.4, 0); ctx.lineTo(2, 0); ctx.stroke();
      }
    }

    // arms (swing opposite to legs)
    const armCol = kind === 'uncle' ? skin : kind === 'burqa' ? '#141216' : kind === 'saree' || kind === 'aunty' ? skin : shirt;
    for (const s of [-1, 1]) {
      const ax = -s * sw * 0.8, ay = s * 3.4;
      ctx.fillStyle = armCol; ell(ctx, ax * 0.7, ay, 1.6, 0.95); ctx.fill(); outline(ctx);
      ctx.fillStyle = kind === 'burqa' ? '#141216' : skin; ell(ctx, ax + 1.1 * Math.sign(ax || 1) * 0.6, ay, 0.75, 0.75); ctx.fill();
    }

    // torso
    let torso = shirt;
    if (kind === 'uncle') torso = '#f2efe6'; // banian
    else if (kind === 'police') torso = '#b8a070';
    else if (kind === 'burqa') torso = '#141216';
    else if (kind === 'saree' || kind === 'aunty') torso = look.blouse || U.shade(look.saree || shirt, 0.75);
    ctx.fillStyle = torso;
    ell(ctx, 0, 0, kind === 'uncle' ? 2.6 : 2.15, 3.5); ctx.fill(); outline(ctx);
    if (kind === 'uncle') { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ell(ctx, 0.8, 0, 1.4, 2.2); ctx.fill(); }
    if (look.stripes) {
      ctx.strokeStyle = look.stripes; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let s = -2.4; s <= 2.4; s += 1.6) { ctx.moveTo(-1.8, s); ctx.lineTo(1.8, s); }
      ctx.stroke();
    }
    if (kind === 'saree' || kind === 'aunty') { // pallu over the shoulder
      ctx.fillStyle = look.saree || shirt;
      ctx.beginPath(); ctx.moveTo(1.2, -3.4); ctx.lineTo(2.0, -2.2); ctx.lineTo(-2.4, 3.6); ctx.lineTo(-3.4, 2.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = look.border || '#f2c230'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(2.0, -2.2); ctx.lineTo(-2.4, 3.6); ctx.stroke();
    }
    if (kind === 'woman' && look.dupatta) {
      ctx.strokeStyle = look.dupatta; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0.8, -3.2); ctx.quadraticCurveTo(-1.6, 0, 0.8, 3.2); ctx.lineTo(-3.4 - sw * 0.3, 3.6); ctx.stroke();
    }
    if (kind === 'police') { // belt + shoulder straps
      ctx.fillStyle = '#4a3020'; ctx.fillRect(-0.4, -3.3, 0.8, 6.6);
    }
    if (kind === 'student' || look.bag) { // school bag on the back
      ctx.fillStyle = look.bag || '#2a5cb8'; ctx.fillRect(-3.2, -2.2, 1.6, 4.4);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.4; ctx.strokeRect(-3.2, -2.2, 1.6, 4.4);
      if (kind === 'student') { ctx.fillStyle = look.tie || '#b22b2b'; ctx.fillRect(1.6, -0.35, 0.9, 0.7); }
    }

    // head
    const hx = 0.35;
    if (kind === 'burqa') {
      ctx.fillStyle = '#141216'; ell(ctx, hx, 0, 2.2, 2.2); ctx.fill(); outline(ctx);
      ctx.fillStyle = '#2a262c'; ell(ctx, hx + 1.2, 0, 0.7, 1.1); ctx.fill();
    } else {
      ctx.fillStyle = skin; ell(ctx, hx, 0, 2.0, 2.0); ctx.fill(); outline(ctx);
      ctx.fillStyle = hair;
      if (kind === 'uncle') { // receding: hair ring at the back + sides
        ctx.beginPath(); ctx.arc(hx, 0, 2.0, Math.PI * 0.55, Math.PI * 1.45); ctx.lineWidth = 0.9; ctx.strokeStyle = look.hair || '#7a7570'; ctx.stroke();
      } else {
        ell(ctx, hx - 0.55, 0, 1.6, 1.85); ctx.fill();
      }
      if (kind === 'saree' || kind === 'aunty' || kind === 'woman' || look.girl) {
        if (kind === 'aunty') { ctx.fillStyle = hair; ell(ctx, hx - 2.1, 0, 0.95, 0.95); ctx.fill(); ctx.fillStyle = '#f8f4ea'; for (let a = 0; a < 6; a++) ctx.fillRect(hx - 2.1 + Math.cos(a) * 1.05 - 0.25, Math.sin(a) * 1.05 - 0.25, 0.5, 0.5); }
        else { ctx.strokeStyle = hair; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(hx - 1.8, 0.3); ctx.quadraticCurveTo(hx - 3.6 - sw * 0.2, 0.4, hx - 5.4 - sw * 0.3, 0.9); ctx.stroke(); }
      }
      if (look.cap === 'police' || kind === 'police') {
        ctx.fillStyle = '#6a5a3a'; ell(ctx, hx - 0.1, 0, 2.1, 2.1); ctx.fill();
        ctx.fillStyle = '#1a1a22'; ctx.fillRect(hx + 1.3, -1.4, 1.1, 2.8);
        ctx.fillStyle = '#b22b2b'; ctx.fillRect(hx - 0.4, -2.0, 0.6, 4.0);
      } else if (look.cap === 'topi') {
        ctx.fillStyle = '#f4f2ea'; ell(ctx, hx - 0.3, 0, 1.6, 1.6); ctx.fill();
      } else if (look.cap === 'cricket') {
        ctx.fillStyle = look.capColor || '#2a5cb8'; ell(ctx, hx - 0.2, 0, 1.8, 1.8); ctx.fill();
        ctx.fillRect(hx + 1.0, -1.1, 1.6, 2.2);
      }
    }
  }

  function randomLook(rng, kind) {
    const r = rng || { next: Math.random };
    const pick = (a) => a[Math.floor(r.next() * a.length)];
    kind = kind || pick(['man', 'man', 'woman', 'kid', 'uncle', 'aunty', 'saree', 'burqa', 'lungi', 'student', 'man']);
    const look = { kind, skin: pick(SKIN), hair: r.next() < 0.12 ? '#6a6662' : '#1a1412', shirt: pick(SHIRT), pants: pick(PANTS) };
    if (kind === 'saree' || kind === 'aunty') { look.saree = pick(SAREE); look.border = pick(['#f2c230', '#e8c060', '#d8402a', '#efe9dc']); }
    if (kind === 'woman') { look.shirt = pick(SAREE); look.pants = pick(['#efe9dc', '#f2c230', '#2a5cb8', look.shirt]); look.dupatta = pick(SAREE); }
    if (kind === 'lungi' || kind === 'uncle') { look.lungi = pick(LUNGI); if (kind === 'uncle') look.hair = r.next() < 0.5 ? '#8a8680' : '#1a1412'; }
    if (kind === 'kid') { look.pants = pick(['#7a6a4a', '#2a3a6a', '#5a4a3a']); if (r.next() < 0.4) look.stripes = pick(SHIRT); if (r.next() < 0.15) look.cap = 'cricket'; }
    if (kind === 'student') { look.shirt = '#f2f0ea'; look.pants = pick(['#2a3a6a', '#7a6a4a', '#3a5a3a']); look.girl = r.next() < 0.45; look.bag = pick(['#2a5cb8', '#b22b2b', '#3a8a3a', '#7a3a8a']); }
    if (kind === 'man' && r.next() < 0.15) look.cap = 'topi';
    return look;
  }

  N.people = { draw: drawPerson, randomLook, SKIN, SHIRT, SAREE, SCALE: PEOPLE_SCALE };

  /* ======================================================== interact */
  // Systems either register persistent interactables (shops, doors, NPC entities) or
  // offer() one each update step (e.g. "Ride Chetak" when near a vehicle). The 'interact'
  // system (order 58) picks the best one, shows its label on ACTION and runs use() on press.
  const reg = new Map();
  let offers = [];
  const I = (N.interact = {
    current: null,
    add(id, spec) { spec.id = id; reg.set(id, spec); return spec; },
    remove(id) { reg.delete(id); },
    get(id) { return reg.get(id) || null; },
    /** Per-step offer: {label, priority?, dist?, use(player)} */
    offer(spec) { offers.push(spec); },
    clear() { reg.clear(); offers = []; I.current = null; },
  });
  function resolveInteract() {
    const p = N.player;
    let best = null, bs = -Infinity;
    const active = p && N.state.mode === 'play' && !p.controlsLocked && p.mode !== 'busy';
    if (active) {
      for (const s of offers) {
        const sc = (s.priority || 0) * 1000 - (s.dist || 0);
        if (sc > bs) { bs = sc; best = s; }
      }
      if (!p.vehicle) {
        for (const s of reg.values()) {
          if (s.enabled && !s.enabled(p)) continue;
          const ex = s.entity ? s.entity.x : s.x, ey = s.entity ? s.entity.y : s.y;
          if (ex == null) continue;
          const d = Math.hypot(ex - p.x, ey - p.y);
          if (d > (s.r || 16) + p.r) continue;
          const sc = (s.priority || 0) * 1000 - d;
          if (sc > bs) { bs = sc; best = s; }
        }
      }
    }
    offers = [];
    I.current = best;
    const label = best ? (typeof best.label === 'function' ? best.label(p) : best.label) : null;
    N.input.setActionLabel(label || null);
    if (best && N.input.pressed('action')) {
      N.input.consume('action');
      try { best.use && best.use(p); } catch (e) { N.err('interact.use', e); }
    }
  }

  /* =========================================================== player */
  // Numbers: systems_design §2 (N.player.TUNE). Energy is stamina; tummy (§2.2) is how fed Chinnu is,
  // and energy can never go above it. Statuses (§2.3), falls off bikes (§2.6), counted items (§2.7).
  const TUNE = {
    walk: 45, run: 80, startMoney: 1000, startTummy: 80,
    runDrain: 8.5, restDelay: 0.6, recoverWalk: 7, recoverStand: 14, recoverSit: 25, recoverRide: 10, exhaustedUntil: 30,
    pedalDrain: 2.0, pedalRecover: 5, legsGoneMul: 0.65,
    tummyDrain: { idle: 0.10, run: 0.25, pedal: 0.15, ride: 0.05, sit: 0.06 },
    summerMul: 1.25, hungry: 25, veryHungry: 10, growlEvery: 20,
    fallSpeedCycle: 75, fallSpeedMotor: 90, fallEnergy: 15, fallThrow: 14, fallDown: 1.0, kneeGm: 120,
    difficulty: { relaxed: 0.7, normal: 1, hard: 1.2 },
    starveFallbackS: 4,
  };
  // status ids -> default duration: number = real seconds, {gm} = game minutes, Infinity = until cleared
  const STATUS = {
    warm: 60, coma: 45, knee: { gm: 120 }, limp: Infinity, cool: 120, gola: { gm: 3 }, hair: Infinity,
    balloon: { gm: 5 }, goggles: Infinity, sugar: 30,
  };
  // edible consumables (§2.7); value = tummy+energy, or {energy, tummy}
  const EDIBLES = {
    osmania_packet: { name: 'Osmania biscuits', short: 'Osmania', feed: 15, icon: 'biscuit' },
    samosa_dozen: { name: 'Onion samosas', short: 'Samosa', feed: 14, icon: 'samosa' },
    biscuits: { name: 'Glucose biscuits', short: 'Biscuits', feed: 12, icon: 'biscuit' },
    glucose: { name: 'Glucose powder', short: 'Glucose', energy: 25, tummy: 10, icon: 'glucose' },
    mango_bite: { name: 'Mango Bite', short: 'Mango Bite', feed: 2, icon: 'toffee' },
  };
  const pref = (k, d) => { const st = N.settings || (N.menus && N.menus.settings) || null; return st && st[k] != null ? st[k] : d; };
  const gmNow = () => N.clock.day * 1440 + N.clock.minutes;
  const WALK = TUNE.walk, RUN = TUNE.run;
  const player = new Actor({
    kind: 'ped', r: 3.4, mass: 1, solid: true, selfUpdate: true, isPlayer: true,
    name: 'You', energy: 100, tummy: TUNE.startTummy, money: TUNE.startMoney, vehicle: null, mode: 'foot', running: false,
    facing: 0, inventory: new Set(), items: {}, status: {}, controlsLocked: false, god: false, exhausted: false,
    legsGone: false, hungry: false, starving: false, sitting: false, noRun: false, mood: 'neutral', downT: 0,
    look: { kind: 'kid', skin: '#a8703f', hair: '#1a1412', shirt: '#d8402a', stripes: '#f2c230', pants: '#6a5a3a' },
    anim: { phase: 0, speed: 0, run: false },
    stepAcc: 0, restT: 0, growlT: 0,
  });
  player.TUNE = TUNE;
  player.STATUS = STATUS;
  player.EDIBLES = EDIBLES;

  function spawnPoint() {
    const sp = (N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.player) || [N.WORLD_W / 2, N.WORLD_H / 2];
    const f = N.world.built && !N.world.isWalkable(sp[0], sp[1]) ? N.world.findFree(sp[0], sp[1], 'walk', 60) : null;
    return f || { x: sp[0], y: sp[1] };
  }

  player.reset = function () {
    const sp = (N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.player) || [N.WORLD_W / 2, N.WORLD_H / 2];
    this.x = sp[0]; this.y = sp[1]; this.vx = this.vy = 0; this.angle = Math.PI / 2;
    this.energy = 100; this.tummy = TUNE.startTummy; this.money = TUNE.startMoney; this.vehicle = null; this.mode = 'foot';
    this.running = false; this.inventory = new Set(); this.items = {}; this.status = {}; this.controlsLocked = false; this.exhausted = false; this.hidden = false;
    this.legsGone = false; this.hungry = false; this.starving = false; this.sitting = false; this.noRun = false; this.mood = 'neutral'; this.downT = 0; this.growlT = 0;
    this.alive = true;
    if (N.world.built && !N.world.isWalkable(this.x, this.y)) { const f = N.world.findFree(this.x, this.y, 'walk', 60); if (f) { this.x = f.x; this.y = f.y; } }
  };
  /** Place the player (on foot) at a point, nudged to the nearest walkable spot. */
  player.teleport = function (x, y) {
    if (!isFinite(x) || !isFinite(y)) { N.err('player.teleport', new Error('bad position ' + x + ',' + y)); return; }
    if (this.vehicle && N.vehicles && N.vehicles.exit) { try { N.vehicles.exit(this, true); } catch (e) { N.err('teleport.exit', e); } }
    this.vehicle = null; this.mode = 'foot';
    // stay inside the map, and never end up inside a wall / the lake (fall back to the spawn)
    x = U.clamp(x, N.CELL * 2, N.WORLD_W - N.CELL * 2); y = U.clamp(y, N.CELL * 2, N.WORLD_H - N.CELL * 2);
    if (N.world.built && !N.world.isWalkable(x, y)) {
      const f = N.world.findFree(x, y, 'walk', 80) || spawnPoint();
      x = f.x; y = f.y;
    }
    this.x = x; this.y = y; this.vx = this.vy = 0;
    this.goodX = x; this.goodY = y;
    N.render.snapCamera();
    N.render.warmChunks(x, y, 500);
    N.emit('player:teleport', { x, y });
  };

  /* ---- food, statuses, items */
  /** Eat: n goes to both tummy and energy (capped at 100; energy <= tummy). o: {energy, tummy, status, quiet}. */
  player.feed = function (n, o) {
    o = o || {};
    const dt = o.tummy != null ? +o.tummy : +n || 0, de = o.energy != null ? +o.energy : +n || 0;
    this.tummy = U.clamp((isFinite(this.tummy) ? this.tummy : TUNE.startTummy) + dt, 0, 100);
    this.energy = U.clamp(this.energy + de, 0, 100);
    if (this.energy > this.tummy) this.energy = this.tummy;
    if (this.tummy > 0) this.starving = false;
    if (o.status) this.addStatus(o.status, o.statusFor);
    N.emit('player:feed', { tummy: this.tummy, energy: this.energy, amount: n });
    if (!o.quiet && N.audio && N.audio.sfx) N.audio.sfx('munch', { ui: true });
    return this.tummy;
  };
  /** addStatus('warm') / addStatus('knee', {gm: 120}) / addStatus('hair', {value: 2}); seconds as a number. */
  player.addStatus = function (id, dur, o) {
    if (!id) return null;
    let spec = dur != null ? dur : STATUS[id] != null ? STATUS[id] : 60;
    if (typeof dur === 'object' && dur && !('gm' in dur) && !('secs' in dur)) { o = dur; spec = STATUS[id] != null ? STATUS[id] : 60; }
    const st = { t: Infinity, until: null, value: o && o.value != null ? o.value : true };
    if (typeof spec === 'number') st.t = spec; else if (spec && spec.gm != null) st.until = gmNow() + spec.gm; else if (spec && spec.secs != null) st.t = spec.secs;
    const had = !!this.status[id];
    this.status[id] = st;
    if (!had) {
      if (id === 'coma' && N.hud) N.hud.toast('*Neend aa rahi hai...*', 2400);
      N.emit('player:status', { id, on: true });
    }
    return st;
  };
  player.hasStatus = function (id) { return !!this.status[id]; };
  player.clearStatus = function (id) { if (!this.status[id]) return false; delete this.status[id]; N.emit('player:status', { id, on: false }); return true; };
  /** Seconds (or game minutes for gm statuses) left; Infinity for until-cleared; 0 when off. */
  player.statusLeft = function (id) { const s = this.status[id]; if (!s) return 0; return s.until != null ? Math.max(0, s.until - gmNow()) : s.t; };
  function tickStatus(p, dt) {
    const now = gmNow();
    for (const id in p.status) {
      const s = p.status[id];
      if (s.until != null) { if (now >= s.until) p.clearStatus(id); }
      else if (s.t !== Infinity) { s.t -= dt; if (s.t <= 0) p.clearStatus(id); }
    }
  }
  /** Counted consumables {id: count}. */
  player.addItem = function (id, n) { if (!id) return 0; const c = Math.max(0, (this.items[id] | 0) + (n == null ? 1 : n | 0)); if (c) this.items[id] = c; else delete this.items[id]; N.emit('player:items', { id, count: c }); return c; };
  player.itemCount = function (id) { return this.items[id] | 0; };
  /** The best edible to show in the HUD quick-item slot (or null). */
  player.bestEdible = function () {
    let best = null, bv = -1;
    for (const id in EDIBLES) {
      if (!(this.items[id] > 0)) continue;
      const e = EDIBLES[id], v = e.feed != null ? e.feed : (e.tummy || 0) + (e.energy || 0) * 0.5;
      if (v > bv) { bv = v; best = id; }
    }
    return best;
  };
  /** Eat one of a counted edible. Returns true when eaten. */
  player.eat = function (id) {
    id = id || this.bestEdible();
    const e = EDIBLES[id];
    if (!e || !(this.items[id] > 0)) return false;
    this.addItem(id, -1);
    if (e.feed != null) this.feed(e.feed); else this.feed(0, { energy: e.energy || 0, tummy: e.tummy || 0 });
    if (N.hud) N.hud.toast(e.name + (this.items[id] ? ' (' + this.items[id] + ' left)' : '') + ' — *khaao!*', 1800);
    N.emit('player:eat', { id });
    return true;
  };

  /* ---- falling off a bike (§2.6): DHADAAM! */
  player.fall = function (v, o) {
    o = o || {};
    if (this.downT > 0 || this.god) return false;
    const veh = v || this.vehicle;
    const ang = (veh ? veh.angle : this.angle) + (Math.random() - 0.5) * (Math.PI / 3);
    if (this.vehicle && N.vehicles && N.vehicles.exit) { try { if (!N.vehicles.exit(this)) N.vehicles.exit(this, true); } catch (e) { N.err('player.fall.exit', e); } }
    this.vehicle = null; this.mode = 'foot';
    this.downT = TUNE.fallDown; this.fallA = ang; this.fallLeft = TUNE.fallThrow; this.fallLocked = !!this.controlsLocked;
    this.controlsLocked = true;
    this.vx = this.vy = 0;
    this.energy = Math.max(0, this.energy - TUNE.fallEnergy);
    this.addStatus('knee', { gm: TUNE.kneeGm });
    if (N.hud) N.hud.toast('*DHADAAM!*', 1800);
    if (N.audio && N.audio.sfx) { N.audio.sfx('crash', { ui: true }); N.audio.sfx('bell', { ui: true, delay: 0.55, vol: 0.5 }); }
    if (N.render && N.render.shake && !(document.body && document.body.classList.contains('reduced-motion'))) N.render.shake(0.25, 0.2);
    N.emit('player:fall', { vehicle: veh || null, x: this.x, y: this.y, speed: o.speed || 0 });
    return true;
  };
  N.on('bump', (d) => {
    const p = player, v = p.vehicle;
    if (!v || !d || TUNE.autoFall === false || p.downT > 0) return;
    if (d.a !== v && d.b !== v && d.vehicle !== v) return;
    const T = v.T || (N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[v.type]);
    if (!T || T.cls !== 'bike') return;
    const other = d.a === v ? d.b : d.a;
    const hard = d.wall || (other && other.kind === 'vehicle') || (other && other.kind === 'animal' && /cow|buffalo/.test(String(other.type || other.species || other.sub || '')));
    if (!hard) return;
    const lim = T.pedal ? TUNE.fallSpeedCycle : TUNE.fallSpeedMotor;
    if ((+d.speed || 0) >= lim) p.fall(v, { speed: d.speed });
  });

  /* ---- THAK GAYA fallback (wanted.js owns the full flow; §4.11) */
  function starveFallback(p) {
    if (!p.starving || p.tummy > 0 || N.state.mode !== 'play') return;
    const cafes = Object.values(N.places || {}).filter((q) => /^irani_cafe_\d+$/.test(q.id));
    const m = N.clock.minutes, shut = m >= 23 * 60 + 30 || m < 5 * 60;
    let best = N.places && N.places.home || null, bd = Infinity;
    if (!shut) for (const c of cafes) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bd) { bd = d; best = c; } }
    if (N.hud) N.hud.banner('THAK GAYA!', 'Glucose water at the counter. −₹1', 2600, { kind: 'fail' });
    N.emit('wasted', { x: p.x, y: p.y, fallback: true });
    p.money = Math.max(0, p.money - 100);
    p.tummy = 40; p.energy = 40; p.starving = false;
    if (best) p.teleport(best.x, best.y);
    N.clock.minutes += 45; while (N.clock.minutes >= 1440) { N.clock.minutes -= 1440; N.clock.nextDay(); }
    if (N.wanted && N.wanted.level > 0 && N.wanted.set) N.wanted.set(Math.max(0, N.wanted.level - 2));
  }

  // whoever runs THAK GAYA (wanted.js) cancels the fallback
  N.on('wasted', (d) => { if (!(d && d.fallback)) player.starveT = 99; });

  player.update = function (dt) {
    // a NaN from anywhere (a script, a bad push) must not stick: fall back to the last good spot
    if (!isFinite(this.x) || !isFinite(this.y)) {
      const g = isFinite(this.goodX) && isFinite(this.goodY) ? { x: this.goodX, y: this.goodY } : spawnPoint();
      N.err('player.nan', new Error('player position was not finite; restored'));
      this.x = g.x; this.y = g.y; this.vx = this.vy = 0;
    }
    if (!isFinite(this.vx) || !isFinite(this.vy)) this.vx = this.vy = 0;
    if (!isFinite(this.angle)) this.angle = 0;
    if (!isFinite(this.energy)) this.energy = 100;
    if (!isFinite(this.tummy)) this.tummy = TUNE.startTummy;
    const md = N.state.mode, playing = md === 'play';
    if (playing) tickStatus(this, dt);
    const S = this.status;
    // tummy: drains in play only (not while the clock is held: shop menus, VHS jumps)
    const drainOn = playing && !N.clock.held && !this.god;
    const diff = TUNE.difficulty[pref('difficulty', 'normal')] || 1;
    let summer = 1;
    if (drainOn && !S.cool && N.calendar && N.calendar.inRange && N.clock.minutes >= 720 && N.clock.minutes <= 930) { try { if (N.calendar.inRange('04-24', '06-11')) summer = TUNE.summerMul; } catch (e) { /* ignore */ } }
    const v = this.vehicle;
    const pedal = !!(v && v.T && v.T.pedal);
    let drainKey = 'idle';
    if (v) {
      const v0 = v;
      this.mode = 'drive'; this.x = v0.x; this.y = v0.y; this.vx = v0.vx || 0; this.vy = v0.vy || 0;
      if (pedal) {
        const thr = Math.max(0, +v0.throttle || +(v0.ctl && v0.ctl.throttle) || 0);
        if (thr > 0.05 && !this.god) { this.energy -= dt * TUNE.pedalDrain * thr; drainKey = 'pedal'; }
        else this.energy += dt * TUNE.pedalRecover;
        if (this.energy <= 0) { this.energy = 0; if (!this.legsGone) { this.legsGone = true; if (N.hud) N.hud.toast('Legs gone! *Saans phool gayi!*', 2000); } }
        if (this.legsGone && this.energy >= TUNE.exhaustedUntil) this.legsGone = false;
      } else { this.energy += dt * TUNE.recoverRide; this.legsGone = false; drainKey = 'ride'; }
      this.energy = U.clamp(this.energy, 0, 100);
    } else this.legsGone = false;
    if (drainOn) {
      const runningNow = !v && this.running;
      const key = this.sitting ? 'sit' : runningNow ? 'run' : drainKey;
      this.tummy = Math.max(0, this.tummy - dt * TUNE.tummyDrain[key] * summer * diff);
    }
    // hunger effects (§2.2)
    const hungry = this.tummy < TUNE.hungry, very = this.tummy < TUNE.veryHungry;
    if (hungry && !this.hungry && playing && N.hud) N.hud.toast('*Pet mein chuhe daud rahe hain!*', 2600);
    this.hungry = hungry; this.mood = very ? 'sad' : 'neutral';
    if (hungry && playing) { this.growlT -= dt; if (this.growlT <= 0) { this.growlT = TUNE.growlEvery; if (N.audio && N.audio.sfx) N.audio.sfx('stomach_growl', { ui: true }); N.emit('caption', { text: 'tummy rumbles', kind: 'self', ms: 1600 }); } } else this.growlT = 3;
    if (this.tummy <= 0 && playing && !this.starving) {
      this.starving = true; this.starveT = TUNE.starveFallbackS;
      N.emit('player:starving', { x: this.x, y: this.y });
    }
    if (this.starving && playing) { this.starveT -= dt; if (this.starveT <= 0) { this.starveT = 99; try { starveFallback(this); } catch (e) { N.err('player.starve', e); } } }
    if (this.energy > this.tummy) this.energy = this.tummy;
    if (v) return;
    if (this.mode === 'drive') this.mode = 'foot';
    // knocked down after a fall: slide along the throw, then sit up
    if (this.downT > 0) {
      this.downT -= dt;
      if (this.fallLeft > 0) {
        const st = Math.min(this.fallLeft, dt * 60);
        this.fallLeft -= st;
        const c = N.world.collide(this.x + Math.cos(this.fallA) * st, this.y + Math.sin(this.fallA) * st, this.r, 'walk');
        if (!c.bad) { this.x = c.x; this.y = c.y; }
      }
      this.vx = this.vy = 0; this.anim.speed = 0;
      if (this.downT <= 0) { this.downT = 0; this.controlsLocked = !!this.fallLocked; N.emit('player:up', {}); }
      return;
    }
    const inp = N.input;
    const canControl = playing && !this.controlsLocked && this.mode !== 'busy';
    let mx = 0, my = 0;
    if (canControl) { mx = inp.move.x; my = inp.move.y; }
    const mag = Math.min(1, Math.hypot(mx, my));
    if (mag > 0) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
    // energy (stamina)
    let respect = false;
    try { respect = !!(N.respect && typeof N.respect.at === 'function' && N.respect.at(this.x, this.y)); } catch (e) { respect = false; }
    const noRun = this.noRun || respect || !!S.coma;
    const wantRun = canControl && inp.down('run') && mag > 0.15 && !noRun;
    if (this.exhausted && this.energy > TUNE.exhaustedUntil) this.exhausted = false;
    const running = wantRun && !this.exhausted && this.energy > 0;
    if (running && !this.god) {
      this.energy -= dt * TUNE.runDrain * (S.sugar ? 0.7 : 1); this.restT = 0;
      if (this.energy <= 0) { this.energy = 0; this.exhausted = true; if (N.hud) N.hud.toast('*Saans phool gayi!*', 1800); N.emit('player:exhausted', this); }
    } else {
      this.restT += dt;
      if (this.restT > TUNE.restDelay) this.energy = Math.min(100, this.energy + dt * (this.sitting ? TUNE.recoverSit : mag > 0.1 ? TUNE.recoverWalk : TUNE.recoverStand) * (S.warm ? 1.5 : 1));
    }
    if (this.energy > this.tummy) this.energy = this.tummy;
    this.running = running;
    // velocity with acceleration
    const surf = N.world.surfaceAt(this.x, this.y);
    let mul = this.exhausted ? 0.8 : 1;
    if (S.limp) mul *= 0.8;
    if (very) mul *= 0.9;
    if (S.coma) mul *= 0.9;
    if (running) { if (S.knee) mul *= 0.9; if (hungry) mul *= 0.9; }
    const top = (running ? RUN : WALK) * N.world.surfaceSpeed(surf, 'walk') * mul;
    const tvx = mx * top * mag, tvy = my * top * mag;
    const a = 1 - Math.exp(-dt * (mag > 0.05 ? 11 : 16));
    this.vx += (tvx - this.vx) * a; this.vy += (tvy - this.vy) * a;
    // smooth turning towards the movement / stick direction
    if (mag > 0.1) {
      const ta = Math.atan2(my, mx);
      this.angle += U.angleDiff(this.angle, ta) * Math.min(1, dt * 16);
      this.facing = this.angle;
    }
    // move + slide along walls
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    const c = N.world.collide(nx, ny, this.r, 'walk');
    if (c.hit) {
      const dot = this.vx * c.nx + this.vy * c.ny;
      if (dot < 0) { this.vx -= dot * c.nx; this.vy -= dot * c.ny; }
    }
    this.x = c.x; this.y = c.y;
    if (!c.hit || N.world.isWalkable(this.x, this.y)) { this.goodX = this.x; this.goodY = this.y; }
    // walk cycle + footsteps
    const sp = Math.hypot(this.vx, this.vy);
    this.anim.speed = Math.min(1, sp / WALK);
    this.anim.run = running;
    const prev = this.anim.phase;
    this.anim.phase += sp * dt * (running ? 0.2 : 0.26);
    if (sp > 8 && Math.floor(prev / Math.PI) !== Math.floor(this.anim.phase / Math.PI)) {
      N.emit('footstep', { x: this.x, y: this.y, surf: N.world.surfaceAt(this.x, this.y), run: running, who: this });
    }
    if (sp < 4) this.anim.phase *= 0.8;
    // idle timer drives the "you are here" marker
    this.idleT = sp < 3 && canControl ? (this.idleT || 0) + dt : 0;
  };

  player.draw = function () {
    if (this.vehicle || this.hidden) return;
    const R = N.render, D = N.draw;
    const self = this;
    R.queue('shadow', 0, () => D.shadow(self.x, self.y, 7, 9, self.angle, 1.5));
    if (this.downT > 0) {
      // knocked down: lying along the throw, a dust puff, then sitting up rubbing the knee
      const k = 1 - this.downT / TUNE.fallDown;
      R.queue('ground', 4, (ctx) => {
        const kk = R.k(0), X = R.sx(self.x, kk), Y = R.sy(self.y, kk);
        ctx.fillStyle = 'rgba(214, 190, 150, ' + (0.55 * (1 - k)).toFixed(3) + ')';
        for (let i = 0; i < 5; i++) { const a = i * 1.26 + self.fallA, r = (5 + k * 10) * kk; ctx.beginPath(); ctx.arc(X + Math.cos(a) * r, Y + Math.sin(a) * r, (2.5 + k * 3) * kk, 0, Math.PI * 2); ctx.fill(); }
      });
      R.queue('actors', this.y, () => D.sprite(self.x, self.y, self.fallA + (k < 0.6 ? Math.PI / 2 : Math.PI / 4), 4, (ctx) => drawPerson(ctx, self.look, { phase: 0, speed: 0 })));
      return;
    }
    R.queue('actors', this.y, () => D.sprite(self.x, self.y, self.angle, 8, (ctx) => drawPerson(ctx, self.look, self.anim)));
    // after a few idle seconds a small bobbing chevron marks the player (busy screens, phones)
    const a = Math.min(1, Math.max(0, ((this.idleT || 0) - 2.5) / 0.6));
    if (a > 0 && N.state.mode === 'play') {
      R.queue('sky', 0, (ctx) => {
        const k = R.k(14), bob = Math.sin(N.time.real * 5) * 1.5;
        const X = R.sx(self.x, k), Y = R.sy(self.y, k) - 9 - bob;
        ctx.globalAlpha = a * 0.95;
        ctx.fillStyle = '#1a1214';
        ctx.beginPath(); ctx.moveTo(X - 4.5, Y - 4.5); ctx.lineTo(X + 4.5, Y - 4.5); ctx.lineTo(X, Y + 1.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f2c230';
        ctx.beginPath(); ctx.moveTo(X - 3, Y - 3.6); ctx.lineTo(X + 3, Y - 3.6); ctx.lineTo(X, Y); ctx.closePath(); ctx.fill();
      });
    }
  };

  player.serialize = function () {
    const st = {};
    for (const id in this.status) { const s = this.status[id]; st[id] = { t: s.t === Infinity ? -1 : Math.round(s.t * 10) / 10, until: s.until, value: s.value }; }
    return { x: this.x, y: this.y, energy: this.energy, tummy: this.tummy, money: this.money, inventory: Array.from(this.inventory), items: Object.assign({}, this.items), status: st, name: this.name, look: this.look };
  };
  player.deserialize = function (o) {
    if (!o || typeof o !== 'object') return;
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    // junk / missing fields keep the current (or default) values instead of becoming NaN
    this.x = num(o.x, this.x); this.y = num(o.y, this.y);
    this.tummy = U.clamp(num(o.tummy, TUNE.startTummy), 0, 100);
    this.energy = Math.min(this.tummy, U.clamp(num(o.energy, 100), 0, 100));
    this.money = Math.round(U.clamp(num(o.money, this.money), -1e12, 1e12));
    this.inventory = new Set(Array.isArray(o.inventory) ? o.inventory.filter((i) => typeof i === 'string') : []);
    this.items = {};
    if (o.items && typeof o.items === 'object' && !Array.isArray(o.items)) for (const k in o.items) { const c = num(o.items[k], 0) | 0; if (c > 0 && c < 1000) this.items[k] = c; }
    this.status = {};
    if (o.status && typeof o.status === 'object' && !Array.isArray(o.status)) {
      for (const k in o.status) {
        const s = o.status[k];
        if (!s || typeof s !== 'object') continue;
        this.status[k] = { t: s.t === -1 || s.t == null ? Infinity : num(s.t, 0), until: s.until == null ? null : num(s.until, null), value: s.value == null ? true : s.value };
      }
    }
    if (typeof o.name === 'string') this.name = o.name;
    if (o.look && typeof o.look === 'object') this.look = o.look;
    this.vehicle = null; this.mode = 'foot'; this.vx = this.vy = 0;
    this.downT = 0; this.starving = this.tummy <= 0; this.starveT = TUNE.starveFallbackS; this.legsGone = false;
    this.goodX = this.x; this.goodY = this.y;
  };

  N.player = player;

  N.addSystem({
    id: 'player', order: 20, runIn: ['play', 'dialogue', 'cutscene', 'minigame'],
    init() { if (N.entities.all.indexOf(player) < 0) N.entities.add(player); },
    update(dt) { player.update(dt); },
    reset() { player.reset(); if (N.entities.all.indexOf(player) < 0) N.entities.add(player); },
  });
  N.addSystem({
    id: 'entities', order: 25, runIn: ['play', 'dialogue', 'cutscene'],
    update(dt) { E.update(dt); },
    reset() { E.clear(); offers = []; },
  });
  N.addSystem({ id: 'interact', order: 58, runIn: ['play'], update: resolveInteract });
})();
