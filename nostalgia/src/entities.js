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
          if (!a.fixed) { a.x -= nx * pen * ta; a.y -= ny * pen * ta; }
          if (!o.fixed) { o.x += nx * pen * to; o.y += ny * pen * to; }
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

  const PEOPLE_SCALE = 1.35;
  function outline(ctx) { ctx.strokeStyle = 'rgba(25,15,20,0.55)'; ctx.lineWidth = 0.55; ctx.stroke(); }
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
  const WALK = 45, RUN = 80;
  const player = new Actor({
    kind: 'ped', r: 3.4, mass: 1, solid: true, selfUpdate: true, isPlayer: true,
    name: 'You', energy: 100, money: 2500, vehicle: null, mode: 'foot', running: false,
    facing: 0, inventory: new Set(), controlsLocked: false, god: false, exhausted: false,
    look: { kind: 'kid', skin: '#a8703f', hair: '#1a1412', shirt: '#d8402a', stripes: '#f2c230', pants: '#6a5a3a' },
    anim: { phase: 0, speed: 0, run: false },
    stepAcc: 0, restT: 0,
  });

  player.reset = function () {
    const sp = (N.WORLD_DATA && N.WORLD_DATA.spawns && N.WORLD_DATA.spawns.player) || [N.WORLD_W / 2, N.WORLD_H / 2];
    this.x = sp[0]; this.y = sp[1]; this.vx = this.vy = 0; this.angle = Math.PI / 2;
    this.energy = 100; this.money = 2500; this.vehicle = null; this.mode = 'foot';
    this.running = false; this.inventory = new Set(); this.controlsLocked = false; this.exhausted = false; this.hidden = false;
    this.alive = true;
    if (N.world.built && !N.world.isWalkable(this.x, this.y)) { const f = N.world.findFree(this.x, this.y, 'walk', 60); if (f) { this.x = f.x; this.y = f.y; } }
  };
  /** Place the player (on foot) at a point, nudged to the nearest walkable spot. */
  player.teleport = function (x, y) {
    if (this.vehicle && N.vehicles && N.vehicles.exit) { try { N.vehicles.exit(this, true); } catch (e) { N.err('teleport.exit', e); } }
    this.vehicle = null; this.mode = 'foot';
    if (N.world.built && !N.world.isWalkable(x, y)) { const f = N.world.findFree(x, y, 'walk', 80); if (f) { x = f.x; y = f.y; } }
    this.x = x; this.y = y; this.vx = this.vy = 0;
    N.render.snapCamera();
    N.render.warmChunks(x, y, 500);
    N.emit('player:teleport', { x, y });
  };

  player.update = function (dt) {
    if (this.vehicle) {
      const v = this.vehicle;
      this.mode = 'drive'; this.x = v.x; this.y = v.y; this.vx = v.vx || 0; this.vy = v.vy || 0;
      this.energy = Math.min(100, this.energy + dt * 8);
      return;
    }
    if (this.mode === 'drive') this.mode = 'foot';
    const inp = N.input;
    const canControl = N.state.mode === 'play' && !this.controlsLocked && this.mode !== 'busy';
    let mx = 0, my = 0;
    if (canControl) { mx = inp.move.x; my = inp.move.y; }
    const mag = Math.min(1, Math.hypot(mx, my));
    if (mag > 0) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
    // energy (stamina)
    const wantRun = canControl && inp.down('run') && mag > 0.15;
    if (this.exhausted && this.energy > 30) this.exhausted = false;
    const running = wantRun && !this.exhausted && this.energy > 0;
    if (running && !this.god) {
      this.energy -= dt * 8.5; this.restT = 0;
      if (this.energy <= 0) { this.energy = 0; this.exhausted = true; N.emit('player:exhausted', this); }
    } else {
      this.restT += dt;
      if (this.restT > 0.6) this.energy = Math.min(100, this.energy + dt * (mag > 0.1 ? 7 : 14));
    }
    this.running = running;
    // velocity with acceleration
    const surf = N.world.surfaceAt(this.x, this.y);
    const top = (running ? RUN : WALK) * N.world.surfaceSpeed(surf, 'walk') * (this.exhausted ? 0.8 : 1);
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
  };

  player.draw = function () {
    if (this.vehicle || this.hidden) return;
    const R = N.render, D = N.draw;
    const self = this;
    R.queue('shadow', 0, () => D.shadow(self.x, self.y, 7, 9, self.angle, 1.5));
    R.queue('actors', this.y, () => D.sprite(self.x, self.y, self.angle, 8, (ctx) => drawPerson(ctx, self.look, self.anim)));
  };

  player.serialize = function () {
    return { x: this.x, y: this.y, energy: this.energy, money: this.money, inventory: Array.from(this.inventory), name: this.name, look: this.look };
  };
  player.deserialize = function (o) {
    if (!o) return;
    this.x = o.x; this.y = o.y; this.energy = o.energy == null ? 100 : o.energy; this.money = o.money || 0;
    this.inventory = new Set(o.inventory || []); if (o.name) this.name = o.name; if (o.look) this.look = o.look;
    this.vehicle = null; this.mode = 'foot'; this.vx = this.vy = 0;
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
