/* NOSTALGIA — view3d_actors.js (3D actors + parity developer) — ARCHITECTURE §20 "3D view mode"
 *
 * Everything that moves in the 3D view, plus the 3D parity of the 2D world overlays:
 *  - PEOPLE: stylised low-poly Hyderabadis driven by the N.people looks (entities.js / npcs.js /
 *    traffic.js / wanted.js looks): kids in half-pants, school uniforms with ties, bags and plaits,
 *    uncles in lungi + banian, aunties in sarees with borders, pallu, bun and jasmine, burqas,
 *    salwar-kameez with dupattas, police khaki with peaked caps, vendors, porters, elders with
 *    skull caps and henna beards, Chinnu with his walkman headphones. One universal rig: every
 *    variant part is in one template and switched per instance (feature bits), limbs swing in the
 *    vertex shader (bone-less part rotation about hip / knee / shoulder / elbow pivots). Walk, run,
 *    stand, sit (benches), knocked down, sitting up, waving (constables), carrying on the head,
 *    and riding poses solved with 2-bone IK onto each vehicle's grips, pedals and foot boards.
 *    Gait (feedback_3d.md #2): a procedural planted-foot walk / run — each leg's flat foot moves
 *    backwards relative to the hip at exactly the body's speed while in stance (no sliding), rolls
 *    heel -> toe through an ankle joint (feet are their own parts, ankle angles packed in J[15]),
 *    swings forward with lift (heel kick when running); the cadence follows from stride and speed
 *    (stride capped by the leg's reach), the hip rides on the stance leg (pendulum bob walking,
 *    compression + ballistic flight running), legs by IK; arms counter-swing, run lean; standing
 *    still blends into a relaxed stance with breathing, weight shift and glances; turning on the
 *    spot steps; getting on / off a vehicle blends seat <-> standing beside it. Timing follows the
 *    simulation clock (slow motion / pause freeze it with the game). Contact shadows under the feet.
 *    Idle habits per person (uncles and constables clasp their hands behind the back, aunties hold
 *    them in front or fold their arms, students hold their bag straps, kids swing their arms; they
 *    come and go), talking gestures while a dialogue line or bark of theirs is up (hand raised in
 *    small emphatic arcs, the other lifting, head nods), paunchy uncles get a swelling torso.
 *    KAINCHI: a kid on an adult's roadster (T.kainchi) rides standing beside the frame, the right leg
 *    through the triangle to the far pedal (hip abduction joint), the cycle leaning away.
 *    Two LODs (near / far), instanced: all people are 2 draw calls (+ shadows).
 *  - VEHICLES: a model per type of vehicles.js / traffic.js (cycle, ladies cycle, Hero roadster,
 *    Hercules, kid cycle, Scooty, Luna, Chetak, RX100, auto-rickshaw, Ambassador, Maruti 800,
 *    Padmini, APSRTC-style city bus, lorry, boat, cycle-rickshaw + the story variants), instanced per
 *    type with per-instance paint, turning / steering wheels (one instanced mesh for all wheels of a
 *    kind), leaning two-wheelers, pothole jolts, head / tail / brake lamps, beacons, light pools on
 *    the road and glow points at night, real point lights for the nearest lamps, painted decals from
 *    one atlas (HORN OK PLEASE, USE DIPPER AT NIGHT, CITY BUS, route boards, number plates), the
 *    rider / driver / pillion / passenger visible where the vehicle is open (cars, bus and lorry
 *    cabs have translucent fresnel glass: a second instanced draw of the glass triangles sharing the
 *    pool's instance buffers, so drivers show through; from inside, in first person, it turns nearly
 *    clear), and first-person cockpits (car / bus / lorry interiors with the steering wheel and
 *    hands, dials with ticks and a live speedometer needle; handlebar + hands, the headset speedo and
 *    mirrors on two-wheelers and autos come from the vehicle model itself).
 *  - ANIMALS: cows (standing, ambling, lying on the road chewing), stray dogs (napping, trotting),
 *    goats; pigeon flocks (N.traffic.flocks + N.landmarks.flocks) pecking and bursting into flight.
 *  - PARITY LAYERS: mission markers (cylinders of light at objectives and givers), the interaction
 *    target pointer, collectible glints (N.collectibles.glintPoints), NPC emotes and spotter "!",
 *    dialogue barks re-anchored to the 3D heads, season overlays from N.seasons.scene() (Sankranti
 *    kites with strings, Ganesh idols on lorries and the immersion cranes, Bonalu pots and drums,
 *    Ramzan bulb strings, stalls and haleem bhattis, chalivendrams, cribs, Christmas stars on
 *    Secunderabad houses, festival crowds), vendors' push carts, umbrellas in the rain, balloon
 *    sellers, the cement benches NPCs sit on, the NTR Gardens mini train, LB Stadium match-day
 *    dressing (N.cricketMatch.dressing), blob shadows on phones.
 *
 * Registration (view3d.js API): registerActorRenderer 'player', 'ped', 'npc', 'vehicle', 'animal',
 * 'prop'; registerLayer 'actors.parity' (order 100) and 'actors.commit' (order 1000). The actor
 * specs return an empty proxy Object3D and write instance data into shared pools each frame; the
 * commit layer uploads the instance buffers once per frame (after the core's syncActors and every
 * other layer). Specs set fps: true, so the core never hides the player / his vehicle: this file
 * decides (first person: head hidden, car / bus interiors; third person: the player fades when
 * the camera is inside him).
 *
 * Hooks into modules this file does not own (installed from here; nothing else is edited):
 *  - N.dialogue.bark is wrapped at boot to remember which DOM bubble belongs to which target; in 3D
 *    the bubbles are re-placed over the 3D heads every frame (after dialogue.js placed them with the
 *    3D-shimmed R.proj), hidden behind the camera / beyond ~300 u.
 *  - vehicles.js riderLook() is mirrored (v._look = N.people.randomLook(U.rng(v.seed), 'man')) so a
 *    rider looks the same in both views.
 *
 * Public: N.view3dActors = {stats(), lookSpec(look), pools, F (feature ids), MODELS, models(),
 *   setOptions({glows, pools, decals, seasons, blobs, fx, habits: true | false | 'always'}),
 *   debug {camera, track, rec, counts, glints, fx, feet, riderAnkles, ...}}.
 * Listens to (read only): 'dialogue:bark' / 'dialogue:line' (who is talking), 'vehicle:enter' /
 * 'vehicle:exit' (mount blends).
 * Coordinates: model space +x forward, +y up, +z right (world angle a -> yaw -a); three (x, y, z) =
 * world (x, height, y). People template: an adult 9 u tall (kids are scaled 0.78 with a 1.16 head).
 */
(() => {
  'use strict';
  const N = window.N;
  if (!N || !N.view3d) return;
  const U = N.util;
  const V3 = N.view3d;
  const H = V3.H;
  const TAU = Math.PI * 2;
  const VS = V3.VS || 1.5;
  let THREE = null;
  let READY = false;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const now = () => performance.now();

  /* ================================================================ options + stats */
  const DBG = { cam: null, track: null, rec: null, riderNext: false }; // tests: camera override {pos, look, fov}; track(entity) records its pose
  const OPT = { glows: true, decals: true, seasons: true, blobs: true, pools: true, fx: true, habits: true }; // habits: true | false | 'always' (tests)
  const ST = { people: 0, peopleFar: 0, vehicles: 0, wheels: 0, glows: 0, pools: 0, decals: 0, animals: 0, birds: 0, markers: 0, kites: 0, skids: 0, puffs: 0, ms: 0, msAvg: 0, frame: 0, culled: 0 };
  let tFrame0 = 0;

  /* ================================================================ colour helpers */
  const packCache = new Map();
  /** '#rrggbb' (sRGB) -> 0xRRGGBB integer (exact in a float32 instance attribute) */
  function pack(hex) {
    if (typeof hex === 'number') return hex;
    if (typeof hex !== 'string') return 0x888888;
    let v = packCache.get(hex);
    if (v != null) return v;
    let s = hex.trim();
    if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    v = s.length >= 6 ? parseInt(s.slice(0, 6), 16) : NaN;
    if (!isFinite(v)) v = 0x888888;
    packCache.set(hex, v);
    return v;
  }
  function shadeHex(hex, f) { try { return U.shade(hex, f); } catch (e) { return hex; } }
  function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  /* ================================================================ geometry builder */
  // Vertex attributes: position, normal, color (linear float: shade for slot vertices, the colour for
  // fixed ones), aSP (slot, part, feature), aPiv (pivot for vehicle parts). One draw call per build.
  let TV = null, TN = null;
  class AB {
    constructor() {
      this.p = []; this.n = []; this.c = []; this.s = []; this.v = []; this.idx = [];
      this.cc = [1, 1, 1]; this.sl = 0; this.pt = 0; this.ft = 0; this.pv = [0, 0, 0];
      this.m = null; this.nm = null;
    }
    color(hex) { const c = H.color(hex); this.cc = [c.r, c.g, c.b]; return this; }
    shade(k) { this.cc = [k, k, k]; return this; }
    slot(s) { this.sl = s; return this; }
    part(p, pv) { this.pt = p; if (pv) this.pv = pv; return this; }
    feat(f) { this.ft = f || 0; return this; }
    xf(m) { this.m = m || null; this.nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null; return this; }
    vert(x, y, z, nx, ny, nz) {
      if (this.m) {
        TV.set(x, y, z).applyMatrix4(this.m); x = TV.x; y = TV.y; z = TV.z;
        TN.set(nx, ny, nz).applyMatrix3(this.nm).normalize(); nx = TN.x; ny = TN.y; nz = TN.z;
      }
      this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(this.cc[0], this.cc[1], this.cc[2]);
      this.s.push(this.sl, this.pt, this.ft); this.v.push(this.pv[0], this.pv[1], this.pv[2]);
      return this.p.length / 3 - 1;
    }
    tri(a, b, c) { this.idx.push(a, b, c); return this; }
    /** flat quad a, b, c, d ([x, y, z]) counter-clockwise seen from the front */
    quad(a, b, c, d) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const i = this.vert(a[0], a[1], a[2], nx, ny, nz); this.vert(b[0], b[1], b[2], nx, ny, nz);
      this.vert(c[0], c[1], c[2], nx, ny, nz); this.vert(d[0], d[1], d[2], nx, ny, nz);
      this.tri(i, i + 1, i + 2); this.tri(i, i + 2, i + 3);
      return this;
    }
    /** double-sided quad (two faces) */
    quad2(a, b, c, d) { this.quad(a, b, c, d); return this.quad(d, c, b, a); }
    triF(a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const i = this.vert(a[0], a[1], a[2], nx, ny, nz); this.vert(b[0], b[1], b[2], nx, ny, nz); this.vert(c[0], c[1], c[2], nx, ny, nz);
      this.tri(i, i + 1, i + 2);
      return this;
    }
    /** 8 corners: 0..3 bottom (-x-z, +x-z, +x+z, -x+z), 4..7 top (same order); flat faces */
    hexa(c, o) {
      o = o || {};
      if (o.top !== false) this.quad(c[4], c[7], c[6], c[5]);
      if (o.bottom) this.quad(c[0], c[1], c[2], c[3]);
      if (o.front !== false) this.quad(c[1], c[5], c[6], c[2]);
      if (o.back !== false) this.quad(c[0], c[3], c[7], c[4]);
      if (o.right !== false) this.quad(c[3], c[2], c[6], c[7]);
      if (o.left !== false) this.quad(c[0], c[4], c[5], c[1]);
      return this;
    }
    box(x0, y0, z0, x1, y1, z1, o) {
      return this.hexa([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], o);
    }
    /** box with a smaller top (taper: inset of the top rect on x / z, shift dx of the top) */
    tbox(x0, y0, z0, x1, y1, z1, ix, iz, dx, o) {
      dx = dx || 0;
      return this.hexa([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0 + ix + dx, y1, z0 + iz], [x1 - ix + dx, y1, z0 + iz], [x1 - ix + dx, y1, z1 - iz], [x0 + ix + dx, y1, z1 - iz]], o);
    }
    /** ellipsoid (smooth); o: {lat0, lat1 (-1..1 fractions of PI/2), t0, t1 (longitude range, 0 = +x)} */
    ell(cx, cy, cz, rx, ry, rz, seg, rings, o) {
      seg = seg || 8; rings = rings || 6; o = o || {};
      const l0 = (o.lat0 == null ? -1 : o.lat0) * Math.PI / 2, l1 = (o.lat1 == null ? 1 : o.lat1) * Math.PI / 2;
      const t0 = o.t0 == null ? 0 : o.t0, t1 = o.t1 == null ? TAU : o.t1;
      const base = this.p.length / 3;
      for (let j = 0; j <= rings; j++) {
        const t = l0 + (l1 - l0) * (j / rings), cr = Math.cos(t), sr = Math.sin(t);
        for (let i = 0; i <= seg; i++) {
          const a = t0 + (t1 - t0) * (i / seg), ca = Math.cos(a), sa = Math.sin(a);
          let nx = ca * cr / rx, ny = sr / ry, nz = sa * cr / rz;
          const l = (Math.hypot(nx, ny, nz) || 1) * (o.inside ? -1 : 1);
          this.vert(cx + ca * cr * rx, cy + sr * ry, cz + sa * cr * rz, nx / l, ny / l, nz / l);
        }
      }
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        if (o.inside) { this.tri(a, a + 1, b + 1); this.tri(a, b + 1, b); } else { this.tri(a, b + 1, a + 1); this.tri(a, b, b + 1); }
      }
      return this;
    }
    /** cylinder / cone between points A and B (smooth sides), radii r0 at A and r1 at B; caps: 0 none, 1 A, 2 B, 3 both */
    cyl(A, B, r0, r1, seg, caps) {
      seg = seg || 8;
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], L = Math.hypot(ux, uy, uz) || 1e-6;
      const u = [ux / L, uy / L, uz / L];
      const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      let v = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
      const lv = Math.hypot(v[0], v[1], v[2]); v = [v[0] / lv, v[1] / lv, v[2] / lv];
      const w = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]];
      const slope = (r0 - r1) / L;
      const base = this.p.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const dx = v[0] * ca + w[0] * sa, dy = v[1] * ca + w[1] * sa, dz = v[2] * ca + w[2] * sa;
        let nx = dx + u[0] * slope, ny = dy + u[1] * slope, nz = dz + u[2] * slope;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        this.vert(A[0] + dx * r0, A[1] + dy * r0, A[2] + dz * r0, nx, ny, nz);
        this.vert(B[0] + dx * r1, B[1] + dy * r1, B[2] + dz * r1, nx, ny, nz);
      }
      // winding: outward normal check on the first quad
      const P = this.p, o0 = base * 3, o1 = (base + 1) * 3, o2 = (base + 2) * 3;
      const ax = P[o1] - P[o0], ay = P[o1 + 1] - P[o0 + 1], az = P[o1 + 2] - P[o0 + 2];
      const bx = P[o2] - P[o0], by = P[o2 + 1] - P[o0 + 1], bz = P[o2 + 2] - P[o0 + 2];
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      const flip = (cx * this.n[o0] + cy * this.n[o0 + 1] + cz * this.n[o0 + 2]) < 0; // (a, b, c) faces against the normal
      for (let i = 0; i < seg; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (flip) { this.tri(a, c, b); this.tri(b, c, d); } else { this.tri(a, b, c); this.tri(b, d, c); }
      }
      if (caps) {
        for (const end of [0, 1]) {
          if (!(caps & (end ? 2 : 1))) continue;
          const C = end ? B : A, r = end ? r1 : r0, sgn = end ? 1 : -1;
          if (r < 0.005) continue;
          const nx = u[0] * sgn, ny = u[1] * sgn, nz = u[2] * sgn;
          const c0 = this.vert(C[0], C[1], C[2], nx, ny, nz);
          for (let i = 0; i <= seg; i++) {
            const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
            this.vert(C[0] + (v[0] * ca + w[0] * sa) * r, C[1] + (v[1] * ca + w[1] * sa) * r, C[2] + (v[2] * ca + w[2] * sa) * r, nx, ny, nz);
          }
          // orient the fan along the cap normal
          const q1 = (c0 + 1) * 3, q2 = (c0 + 2) * 3, q0 = c0 * 3;
          const ex = P[q1] - P[q0], ey = P[q1 + 1] - P[q0 + 1], ez = P[q1 + 2] - P[q0 + 2];
          const fx = P[q2] - P[q0], fy = P[q2 + 1] - P[q0 + 1], fz = P[q2 + 2] - P[q0 + 2];
          const gx = ey * fz - ez * fy, gy = ez * fx - ex * fz, gz = ex * fy - ey * fx;
          const fl = gx * nx + gy * ny + gz * nz < 0;
          for (let i = 0; i < seg; i++) { if (fl) this.tri(c0, c0 + 2 + i, c0 + 1 + i); else this.tri(c0, c0 + 1 + i, c0 + 2 + i); }
        }
      }
      return this;
    }
    /** surface of revolution around the vertical axis through (cx, cz): profile [[r, y], ...] bottom -> top;
     *  sx / sz scale the section (ellipses); o: {t0, t1, capTop, capBottom} */
    lathe(prof, seg, cx, cz, sx, sz, o) {
      o = o || {}; seg = seg || 10; sx = sx || 1; sz = sz || 1; cx = cx || 0; cz = cz || 0;
      if (prof[0][1] > prof[prof.length - 1][1]) prof = prof.slice().reverse();
      const t0 = o.t0 == null ? 0 : o.t0, t1 = o.t1 == null ? TAU : o.t1;
      const n = prof.length;
      const base = this.p.length / 3;
      for (let j = 0; j < n; j++) {
        const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(n - 1, j + 1)];
        const dr = pb[0] - pa[0], dy = pb[1] - pa[1];
        const nl = Math.hypot(dy, dr) || 1, nr = dy / nl, ny = -dr / nl;
        for (let i = 0; i <= seg; i++) {
          const a = t0 + (t1 - t0) * (i / seg), ca = Math.cos(a), sa = Math.sin(a);
          let nx = ca * nr / sx, nz = sa * nr / sz, nyy = ny;
          const l = Math.hypot(nx, nyy, nz) || 1;
          this.vert(cx + ca * prof[j][0] * sx, prof[j][1], cz + sa * prof[j][0] * sz, nx / l, nyy / l, nz / l);
        }
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        this.tri(a, b + 1, a + 1); this.tri(a, b, b + 1);
      }
      if (o.capTop) { const y = prof[n - 1][1], r = prof[n - 1][0]; if (r > 0.01) this.disc(cx, y, cz, r * sx, r * sz, seg, true); }
      if (o.capBottom) { const y = prof[0][1], r = prof[0][0]; if (r > 0.01) this.disc(cx, y, cz, r * sx, r * sz, seg, false); }
      return this;
    }
    /** horizontal ellipse disc facing up (or down) */
    disc(cx, y, cz, rx, rz, seg, up) {
      seg = seg || 10;
      const ny = up ? 1 : -1;
      const c0 = this.vert(cx, y, cz, 0, ny, 0);
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU; this.vert(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz, 0, ny, 0); }
      for (let i = 0; i < seg; i++) { if (up) this.tri(c0, c0 + 2 + i, c0 + 1 + i); else this.tri(c0, c0 + 1 + i, c0 + 2 + i); }
      return this;
    }
    /** quad oriented so its normal points along (ox, oy, oz) */
    quadO(a, b, c, d, ox, oy, oz) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      return nx * ox + ny * oy + nz * oz >= 0 ? this.quad(a, b, c, d) : this.quad(d, c, b, a);
    }
    /** vertical prism of a top-view polygon [[x, z], ...] from y0 to y1 (walls + top, optional bottom) */
    prism(poly, y0, y1, o) {
      o = o || {};
      const n = poly.length;
      let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
      if (o.walls !== false) for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
        this.quadO([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], mx, 0, mz);
      }
      const pts = poly.map((p) => new THREE.Vector2(p[0], p[1]));
      let tris = [];
      try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { tris = []; }
      for (const [y, up] of [[y1, true], [y0, false]]) {
        if (up && o.top === false) continue;
        if (!up && !o.bottom) continue;
        for (const t of tris) {
          const A = [poly[t[0]][0], y, poly[t[0]][1]], B = [poly[t[1]][0], y, poly[t[1]][1]], C = [poly[t[2]][0], y, poly[t[2]][1]];
          const cr = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]); // y of (B-A)x(C-A)
          if ((cr > 0) === up) this.triF(A, B, C); else this.triF(A, C, B);
        }
      }
      return this;
    }
    /** closed cross-section [[r, z], ...] revolved around the z axis (tyres, rims, hubs) */
    ringZ(prof, seg, cx, cy) {
      cx = cx || 0; cy = cy || 0;
      const n = prof.length;
      let rc = 0, zc = 0; for (const p of prof) { rc += p[0]; zc += p[1]; } rc /= n; zc /= n;
      const base = this.p.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        for (let j = 0; j < n; j++) {
          let nr = prof[j][0] - rc, nz = prof[j][1] - zc; const l = Math.hypot(nr, nz) || 1; nr /= l; nz /= l;
          this.vert(cx + ca * prof[j][0], cy + sa * prof[j][0], prof[j][1], ca * nr, sa * nr, nz);
        }
      }
      for (let i = 0; i < seg; i++) for (let j = 0; j < n; j++) {
        const a = base + i * n + j, b = base + i * n + (j + 1) % n, c = base + (i + 1) * n + (j + 1) % n, d = base + (i + 1) * n + j;
        this.orientTri(a, b, c); this.orientTri(a, c, d);
      }
      return this;
    }
    /** triangle wound so its face normal agrees with the stored vertex normals */
    orientTri(a, b, c) {
      const P = this.p, Nn = this.n;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const sx = Nn[a * 3] + Nn[b * 3] + Nn[c * 3], sy = Nn[a * 3 + 1] + Nn[b * 3 + 1] + Nn[c * 3 + 1], sz = Nn[a * 3 + 2] + Nn[b * 3 + 2] + Nn[c * 3 + 2];
      if (nx * sx + ny * sy + nz * sz >= 0) this.tri(a, b, c); else this.tri(a, c, b);
      return this;
    }
    /** a curved strip (mudguard) along a circle in the x-y plane centred (cx, cy), radius r, angles a0..a1, z from -hw to hw */
    arc(cx, cy, r, a0, a1, hw, seg, thick) {
      seg = seg || 8; thick = thick || 0.12;
      for (let i = 0; i < seg; i++) {
        const t0 = a0 + (a1 - a0) * (i / seg), t1 = a0 + (a1 - a0) * ((i + 1) / seg);
        const x0 = cx + Math.cos(t0) * r, y0 = cy + Math.sin(t0) * r, x1 = cx + Math.cos(t1) * r, y1 = cy + Math.sin(t1) * r;
        const mx = (Math.cos(t0) + Math.cos(t1)) / 2, my = (Math.sin(t0) + Math.sin(t1)) / 2;
        this.quadO([x0, y0, -hw], [x1, y1, -hw], [x1, y1, hw], [x0, y0, hw], mx, my, 0);
        const xi0 = cx + Math.cos(t0) * (r - thick), yi0 = cy + Math.sin(t0) * (r - thick), xi1 = cx + Math.cos(t1) * (r - thick), yi1 = cy + Math.sin(t1) * (r - thick);
        this.quadO([xi0, yi0, -hw], [xi1, yi1, -hw], [xi1, yi1, hw], [xi0, yi0, hw], -mx, -my, 0);
        for (const s of [-1, 1]) this.quadO([x0, y0, s * hw], [x1, y1, s * hw], [xi1, yi1, s * hw], [xi0, yi0, s * hw], 0, 0, s);
      }
      return this;
    }
    /** a tube (thin cylinder) between two points */
    tube(A, B, r, seg) { return this.cyl(A, B, r, r, seg || 5, 0); }
    /** side profile [[x, y], ...] (any winding) extruded across z from -hw to +hw with chamfered edges (bev) */
    sweep(prof, hw, bev, o) {
      o = o || {};
      bev = bev || 0;
      // profile area sign -> outward normals
      let area = 0; const n = prof.length;
      for (let i = 0, j = n - 1; i < n; j = i++) area += prof[j][0] * prof[i][1] - prof[i][0] * prof[j][1];
      const ccw = area > 0; // counter-clockwise in the x-y plane
      const inner = bev > 0 ? offsetPoly(prof, bev, ccw) : prof;
      const zi = hw - bev;
      // main sides between +-zi along the full profile
      for (let i = 0; i < n; i++) {
        const a = prof[i], b = prof[(i + 1) % n];
        if (o.skip && o.skip(i)) continue;
        // outward = right of a->b for a ccw polygon
        if (ccw) this.quad([a[0], a[1], -zi], [b[0], b[1], -zi], [b[0], b[1], zi], [a[0], a[1], zi]);
        else this.quad([a[0], a[1], zi], [b[0], b[1], zi], [b[0], b[1], -zi], [a[0], a[1], -zi]);
      }
      if (bev > 0) {
        for (const s of [-1, 1]) {
          for (let i = 0; i < n; i++) {
            const a = prof[i], b = prof[(i + 1) % n], a2 = inner[i], b2 = inner[(i + 1) % n];
            const A = [a[0], a[1], s * zi], B = [b[0], b[1], s * zi], A2 = [a2[0], a2[1], s * hw], B2 = [b2[0], b2[1], s * hw];
            if ((s > 0) === ccw) this.quad(A, B, B2, A2); else this.quad(B, A, A2, B2);
          }
        }
      }
      // caps at +-hw
      const pts = inner.map((p) => new THREE.Vector2(p[0], p[1]));
      let tris = [];
      try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { tris = []; }
      for (const s of [-1, 1]) {
        const base = this.p.length / 3;
        for (const p of inner) this.vert(p[0], p[1], s * hw, 0, 0, s);
        for (const t of tris) {
          const A = inner[t[0]], B = inner[t[1]], C = inner[t[2]];
          const cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); // +: ccw in x-y => normal +z
          if ((cr > 0) === (s > 0)) this.tri(base + t[0], base + t[1], base + t[2]); else this.tri(base + t[0], base + t[2], base + t[1]);
        }
      }
      return this;
    }
    /** append another builder's buffers */
    append(b) {
      const base = this.p.length / 3;
      this.p.push(...b.p); this.n.push(...b.n); this.c.push(...b.c); this.s.push(...b.s); this.v.push(...b.v);
      for (const i of b.idx) this.idx.push(i + base);
      return this;
    }
    get count() { return this.p.length / 3; }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aSP', new THREE.Float32BufferAttribute(this.s, 3));
      g.setAttribute('aPiv', new THREE.Float32BufferAttribute(this.v, 3));
      const nv = this.p.length / 3;
      g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
      g.computeBoundingSphere();
      return g;
    }
  }
  /** inset a polygon by d (miter offsets, clamped) */
  function offsetPoly(P, d, ccw) {
    const n = P.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
      let e1x = b[0] - a[0], e1y = b[1] - a[1], e2x = c[0] - b[0], e2y = c[1] - b[1];
      const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1; e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
      // inward normals (left of the edge for ccw)
      const s = ccw ? 1 : -1;
      const n1x = -e1y * s, n1y = e1x * s, n2x = -e2y * s, n2y = e2x * s;
      let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k = clamp(1 / Math.max(0.35, mx * n1x + my * n1y), 1, 2.5);
      out.push([b[0] + mx * d * k, b[1] + my * d * k]);
    }
    return out;
  }

  /* ================================================================ frames + matrices */
  /** a rigid frame (position + rotation Ry(yaw) * Rx(roll) * Rz(pitch)) for composing children */
  class Frame {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.m = new Float64Array(9); this.set(0, 0, 0, 0, 0, 0); }
    set(x, y, z, yaw, roll, pitch) {
      this.x = x; this.y = y; this.z = z;
      rot3(this.m, yaw, roll || 0, pitch || 0);
      return this;
    }
    /** local (lx, ly, lz) -> world, into out[0..2] */
    apply(lx, ly, lz, out) {
      const m = this.m;
      out[0] = this.x + m[0] * lx + m[1] * ly + m[2] * lz;
      out[1] = this.y + m[3] * lx + m[4] * ly + m[5] * lz;
      out[2] = this.z + m[6] * lx + m[7] * ly + m[8] * lz;
      return out;
    }
    /** write (frame * T(lx, ly, lz) * R(yaw2, roll2, pitch2) * S) as a column-major mat4 */
    write(arr, o, lx, ly, lz, yaw2, roll2, pitch2, sx, sy, sz) {
      const m = this.m;
      let r = m;
      if (yaw2 || roll2 || pitch2) { rot3(R2, yaw2 || 0, roll2 || 0, pitch2 || 0); mul3(R3, m, R2); r = R3; }
      arr[o] = r[0] * sx; arr[o + 1] = r[3] * sx; arr[o + 2] = r[6] * sx; arr[o + 3] = 0;
      arr[o + 4] = r[1] * sy; arr[o + 5] = r[4] * sy; arr[o + 6] = r[7] * sy; arr[o + 7] = 0;
      arr[o + 8] = r[2] * sz; arr[o + 9] = r[5] * sz; arr[o + 10] = r[8] * sz; arr[o + 11] = 0;
      arr[o + 12] = this.x + m[0] * lx + m[1] * ly + m[2] * lz;
      arr[o + 13] = this.y + m[3] * lx + m[4] * ly + m[5] * lz;
      arr[o + 14] = this.z + m[6] * lx + m[7] * ly + m[8] * lz;
      arr[o + 15] = 1;
    }
  }
  const R2 = new Float64Array(9), R3 = new Float64Array(9);
  /** row-major 3x3 of Ry(yaw) * Rx(roll) * Rz(pitch) */
  function rot3(m, yaw, roll, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
    m[0] = cy * cp + sy * sr * sp; m[1] = -cy * sp + sy * sr * cp; m[2] = sy * cr;
    m[3] = cr * sp; m[4] = cr * cp; m[5] = -sr;
    m[6] = -sy * cp + cy * sr * sp; m[7] = sy * sp + cy * sr * cp; m[8] = cy * cr;
    return m;
  }
  function mul3(o, a, b) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  const P3 = [0, 0, 0];

  /* ================================================================ instanced pools */
  let ROOT = null; // Group under H.layer holding every pool
  const POOLS = [];
  class Pool {
    constructor(name, geo, mat, cap, attrs, o) {
      this.name = name; this.base = geo; this.mat = mat; this.attrs = attrs || {}; this.o = o || {};
      this.n = 0; this.cap = 0; this.max = this.o.max || 4096; this.mesh = null; this.A = {};
      this.alloc(cap || 16);
      POOLS.push(this);
    }
    alloc(cap) {
      const old = this.mesh, oldA = this.A, oldN = this.n;
      const g = new THREE.BufferGeometry();
      for (const k in this.base.attributes) g.setAttribute(k, this.base.attributes[k]);
      if (this.base.index) g.setIndex(this.base.index);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const A = {};
      for (const k in this.attrs) {
        const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * this.attrs[k]), this.attrs[k]);
        a.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute(k, a); A[k] = a;
      }
      const m = new THREE.InstancedMesh(g, this.mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (A.instanceColor) m.instanceColor = A.instanceColor;
      m.frustumCulled = false; m.count = 0; m.name = 'actors:' + this.name;
      if (this.o.depth) m.customDepthMaterial = this.o.depth;
      m.castShadow = !!(this.o.cast && H.quality.shadows);
      m.receiveShadow = this.o.receive !== false;
      if (this.o.order != null) m.renderOrder = this.o.order;
      if (old) {
        m.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, oldN * 16));
        for (const k in A) A[k].array.set(oldA[k].array.subarray(0, oldN * this.attrs[k]));
        if (old.parent) old.parent.remove(old);
        // dispose only the instanced buffers (the template attributes are shared)
        old.geometry.dispose();
      }
      (this.o.parent || ROOT).add(m);
      this.mesh = m; this.A = A; this.M = m.instanceMatrix.array; this.cap = cap;
      // a second draw of the same instances with another index + material (vehicle glass)
      if (this.o.glassIndex && this.o.glassMat) {
        if (this.glass) { if (this.glass.parent) this.glass.parent.remove(this.glass); this.glass.geometry.dispose(); }
        const g2 = new THREE.BufferGeometry();
        for (const k in this.base.attributes) g2.setAttribute(k, this.base.attributes[k]);
        for (const k in A) g2.setAttribute(k, A[k]);
        g2.setIndex(this.o.glassIndex);
        g2.boundingSphere = g.boundingSphere;
        const m2 = new THREE.InstancedMesh(g2, this.o.glassMat, cap);
        m2.instanceMatrix = m.instanceMatrix;
        m2.frustumCulled = false; m2.count = 0; m2.name = 'actors:' + this.name + ':glass'; m2.renderOrder = 2;
        (this.o.parent || ROOT).add(m2);
        this.glass = m2;
      }
    }
    /** next instance index (-1 when full) */
    add() {
      if (this.n >= this.cap) { if (this.cap >= this.max) return -1; this.alloc(Math.min(this.max, this.cap * 2)); }
      return this.n++;
    }
    commit() {
      const m = this.mesh, n = this.n;
      m.count = n;
      m.visible = n > 0;
      if (this.glass) { this.glass.count = n; this.glass.visible = n > 0 && !OPT.opaqueGlass; }
      if (n) {
        const im = m.instanceMatrix; im.needsUpdate = true; im.updateRange.offset = 0; im.updateRange.count = n * 16;
        for (const k in this.A) { const a = this.A[k]; a.needsUpdate = true; a.updateRange.offset = 0; a.updateRange.count = n * this.attrs[k]; }
      }
      const c = n; this.n = 0;
      return c;
    }
  }

  /* ================================================================ shader snippets */
  const GLSL_UNPACK = 'vec3 aUnpack(float c){ float r = floor(c / 65536.0); float g = floor((c - r * 65536.0) / 256.0); float b = c - r * 65536.0 - g * 256.0; return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }\n';
  const GLSL_ROT = [
    'vec3 aRotZ(vec3 p, vec2 c, float a){ float s = sin(a), k = cos(a); vec2 q = p.xy - c; return vec3(q.x * k - q.y * s + c.x, q.x * s + q.y * k + c.y, p.z); }',
    'vec3 aRotX(vec3 p, vec2 c, float a){ float s = sin(a), k = cos(a); vec2 q = p.yz - c; return vec3(p.x, q.x * k - q.y * s + c.x, q.x * s + q.y * k + c.y); }',
    'vec3 aRotY(vec3 p, vec2 c, float a){ float s = sin(a), k = cos(a); vec2 q = p.xz - c; return vec3(q.x * k - q.y * s + c.x, p.y, q.x * s + q.y * k + c.y); }',
    'vec3 aRotAx(vec3 v, vec3 u, float a){ float s = sin(a), k = cos(a); return v * k + cross(u, v) * s + u * dot(u, v) * (1.0 - k); }',
    'float aBit(float m, float b){ return mod(floor(m / exp2(b) + 0.0001), 2.0); }',
  ].join('\n') + '\n';

  /* ================================================================ PEOPLE */
  // template pivots (adult, 9 u tall, facing +x, right = +z)
  const HIP_Y = 4.5, HIP_Z = 0.42, KNEE_Y = 2.45, ANK_Y = 0.36, SH_Y = 7.05, SH_Z = 1.1, EL_Y = 5.6, HAND_Y = 3.98, NECK_Y = 7.5;
  const THIGH = HIP_Y - KNEE_Y, SHIN = KNEE_Y - ANK_Y, UARM = SH_Y - EL_Y, FARM = EL_Y - HAND_Y;
  // colour slots (vertex aSP.x): 0 = fixed vertex colour
  const SK = 1, HR = 2, TOP = 3, BOT = 4, ACC = 5, HAT = 6, BAG = 7, XTR = 8;
  // feature ids (aSP.z), 1-based; bits: iFlags.x 1-20, .y 21-40, .z 41-60, .w 61-75 + pattern bits
  const F = {
    LEG_BARE: 1, LEG_PANTS: 2, SKIRT: 3, TUNIC: 4, WRAP: 5, PALLU: 6, DUPATTA: 7, SLEEVES: 8, NO_SLEEVE: 9, SLEEVE_SHORT: 10,
    SLEEVE_LONG: 11, BELLY: 12, HAIR_SHORT: 13, HAIR_LONG: 14, BUN: 15, JASMINE: 16, PLAIT_ONE: 17, PLAITS_TWO: 18, PONYTAILS: 19, PUFF: 20,
    BALD_RING: 21, COWLICK: 22, CAP_POLICE: 23, CAP_TOPI: 24, CAP_CRICKET: 25, CAP_BACK: 26, CAP_GANDHI: 27, CAP_PITH: 28, HOOD: 29, HEAD_COVER: 30,
    FACE_VEIL: 31, SPECS: 32, BEARD: 33, LONGBEARD: 34, MOUSTACHE: 35, BINDI: 36, TIE: 37, BELT: 38, BAG: 39, TOWEL: 40,
    APRON: 41, WALKMAN: 42, CAMERA: 43, SHOES: 44, P_STICK: 45, P_BASKET: 46, P_CLOTHBAG: 47, P_TRAY: 48, P_TRUNK: 49, P_POT: 50,
    P_BAT: 51, P_BALL: 52, P_NOTEBOOK: 53, P_PACKET: 54, P_RADIO: 55, P_CHAPPAL: 56, P_CHARKHI: 57, P_DAPPU: 58, P_NEEM: 59, P_TIFFIN: 60,
    SHORTS: 61, FACE: 62, HAIR_FRINGE: 63, SLIM: 64,
  };
  // pattern / logic bits in iFlags.w (bit index)
  const BIT_STRIPES = 15, BIT_BORDER = 16, BIT_CHECKS = 17, BIT_KID = 18, BIT_FPS = 19, BIT_ARMS = 20, BIT_NOBODY = 21; // first person: ARMS = only the arms drawn, NOBODY = no torso / neck (the eye sits behind them)

  function personVertexHeader(depth) {
    return [
      'attribute vec3 aSP;', 'attribute vec4 iJ0;', 'attribute vec4 iJ1;', 'attribute vec4 iJ2;', 'attribute vec4 iJ3;', 'attribute vec4 iFlags;',
      depth ? '' : 'attribute vec4 iColA;\nattribute vec4 iColB;\nvarying vec3 vPat;\nvarying vec3 vAcc;\nvarying vec3 vLP;\nvarying float vSlot;',
      GLSL_UNPACK, GLSL_ROT,
      'float pFeat(float f){ if (f < 0.5) return 1.0; float i = f - 1.0; float w = floor(i / 20.0 + 0.0001); float b = i - w * 20.0;',
      '  float m = w < 0.5 ? iFlags.x : (w < 1.5 ? iFlags.y : (w < 2.5 ? iFlags.z : iFlags.w)); return aBit(m, b); }',
      // two angles packed in one float (12 bits each, 1/1000 rad, +-2.048): head yaw / pitch, leg abduction
      'vec2 pUnp2(float v){ if (v < 0.5) return vec2(0.0); float hi = floor(v / 4096.0 + 0.00001); return vec2((hi - 2048.0) / 1000.0, (v - hi * 4096.0 - 2048.0) / 1000.0); }',
      'void pAnim(inout vec3 p, inout vec3 n){',
      '  float part = aSP.y;',
      '  if (pFeat(aSP.z) < 0.5 || (part > 8.5 && part < 9.5 && aBit(iFlags.w, ' + BIT_FPS + '.0) > 0.5) || ((part < 4.5 || part > 8.5) && aBit(iFlags.w, ' + BIT_ARMS + '.0) > 0.5) || (part < 0.5 && aBit(iFlags.w, ' + BIT_NOBODY + '.0) > 0.5)) { p = vec3(0.0, -60.0, 0.0); return; }',
      '  bool foot = part > 9.5;',
      '  if ((part > 0.5 && part < 4.5) || foot) {',
      '    float side = foot ? (part < 10.5 ? -1.0 : 1.0) : ((part < 1.5 || (part > 2.5 && part < 3.5)) ? -1.0 : 1.0);',
      '    float hip = side < 0.0 ? iJ0.x : iJ0.y; float knee = side < 0.0 ? iJ0.z : iJ0.w;',
      '    if (foot && iJ3.w > 0.5) { float hi = floor(iJ3.w / 4096.0 + 0.00001); float ank = side < 0.0 ? (hi - 2048.0) / 1000.0 : (iJ3.w - hi * 4096.0 - 2048.0) / 1000.0;',
      '      p = aRotZ(p, vec2(0.0, ' + ANK_Y.toFixed(3) + '), ank); n = aRotZ(n, vec2(0.0), ank); }',
      '    if (part > 2.5) { p = aRotZ(p, vec2(0.0, ' + KNEE_Y.toFixed(3) + '), knee); n = aRotZ(n, vec2(0.0), knee); }',
      '    p = aRotZ(p, vec2(0.0, ' + HIP_Y.toFixed(3) + '), hip); n = aRotZ(n, vec2(0.0), hip);',
      // hip abduction (+ = the leg swings out sideways), about the forward axis through the hip joint
      '    vec2 abd2 = pUnp2(iJ3.y); float abd = side < 0.0 ? abd2.x : abd2.y;',
      '    if (abs(abd) > 0.0005) { p = aRotX(p, vec2(' + HIP_Y.toFixed(3) + ', side * ' + HIP_Z.toFixed(3) + '), -side * abd); n = aRotX(n, vec2(0.0), -side * abd); }',
      '  } else if (part > 4.5 && part < 8.5) {',
      '    float side = (part < 5.5 || (part > 6.5 && part < 7.5)) ? -1.0 : 1.0;',
      '    float sh = side < 0.0 ? iJ1.x : iJ1.y; float el = side < 0.0 ? iJ1.z : iJ1.w; float ab = side < 0.0 ? iJ2.x : iJ2.y;',
      '    if (part > 6.5) { p = aRotZ(p, vec2(0.0, ' + EL_Y.toFixed(3) + '), el); n = aRotZ(n, vec2(0.0), el); }',
      '    p = aRotZ(p, vec2(0.0, ' + SH_Y.toFixed(3) + '), sh); n = aRotZ(n, vec2(0.0), sh);',
      // swing out of the sagittal plane about the horizontal axis perpendicular to shoulder -> hand
      // (a hanging arm lifts sideways; an arm reaching forward swings out to a wide handlebar)
      '    vec2 hd = aRotZ(aRotZ(vec3(0.0, ' + HAND_Y.toFixed(3) + ', 0.0), vec2(0.0, ' + EL_Y.toFixed(3) + '), el), vec2(0.0, ' + SH_Y.toFixed(3) + '), sh).xy - vec2(0.0, ' + SH_Y.toFixed(3) + ');',
      '    vec2 dn = normalize(hd + vec2(0.0, -0.0001)); vec3 ax = vec3(-dn.y, dn.x, 0.0); vec3 sp = vec3(0.0, ' + SH_Y.toFixed(3) + ', side * ' + SH_Z.toFixed(3) + ');',
      '    p = aRotAx(p - sp, ax, -side * ab) + sp; n = aRotAx(n, ax, -side * ab);',
      '  } else if (part > 8.5 && part < 9.5) {',
      '    if (aBit(iFlags.w, ' + BIT_KID + '.0) > 0.5) { p.xy = (p.xy - vec2(0.05, ' + NECK_Y.toFixed(3) + ')) * 1.16 + vec2(0.05, ' + NECK_Y.toFixed(3) + '); p.z *= 1.16; }',
      '    vec2 hpy = pUnp2(iJ3.x);',
      '    p = aRotY(p, vec2(0.05, 0.0), hpy.x); n = aRotY(n, vec2(0.0), hpy.x);',
      '    p = aRotZ(p, vec2(0.05, ' + NECK_Y.toFixed(3) + '), hpy.y); n = aRotZ(n, vec2(0.0), hpy.y);',
      '  }',
      // wraps / skirts / tunics: each side of the hem follows its leg (the cloth strides with the legs)
      '  if (part < 0.5 && aSP.z > 2.5 && aSP.z < 5.5 && p.y < ' + HIP_Y.toFixed(3) + ') {',
      '    float axL = ' + THIGH.toFixed(3) + ' * sin(iJ0.x) + ' + SHIN.toFixed(3) + ' * sin(iJ0.x + iJ0.z);',
      '    float axR = ' + THIGH.toFixed(3) + ' * sin(iJ0.y) + ' + SHIN.toFixed(3) + ' * sin(iJ0.y + iJ0.w);',
      '    float k = clamp((' + HIP_Y.toFixed(3) + ' - p.y) / ' + (HIP_Y - ANK_Y).toFixed(3) + ', 0.0, 1.1);',
      '    p.x += mix(axL, axR, smoothstep(-0.75, 0.75, p.z)) * k * 0.92;',
      '  }',
      '  if ((part < 0.5 && p.y > 5.6) || (part > 4.5 && part < 9.5)) p.y += iJ3.z;',
      '  if (part < 0.5 || (part > 4.5 && part < 9.5)) { p = aRotZ(p, vec2(0.0, ' + HIP_Y.toFixed(3) + '), -iJ2.z); n = aRotZ(n, vec2(0.0), -iJ2.z); }',
      '  p.y += iJ2.w;',
      '}',
    ].join('\n') + '\n';
  }
  function personCompile(shader) {
    if (H.lamps) H.lamps.apply(shader); // lit by the street lamps round him at night
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + personVertexHeader(false))
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 pPos = vec3(position);\npAnim(pPos, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = pPos;')
      .replace('#include <color_vertex>', [
        '#include <color_vertex>',
        '{ float sl = aSP.x; vSlot = sl;',
        '  if (sl > 0.5) { float c = sl < 1.5 ? iColA.x : (sl < 2.5 ? iColA.y : (sl < 3.5 ? iColA.z : (sl < 4.5 ? iColA.w : (sl < 5.5 ? iColB.x : (sl < 6.5 ? iColB.y : (sl < 7.5 ? iColB.z : iColB.w))))));',
        '    vColor = aUnpack(c) * vColor; }',
        '  vAcc = aUnpack(iColB.x);',
        '  vPat = vec3(aBit(iFlags.w, ' + BIT_STRIPES + '.0), aBit(iFlags.w, ' + BIT_BORDER + '.0), aBit(iFlags.w, ' + BIT_CHECKS + '.0));',
        '  vLP = position; }',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPat;\nvarying vec3 vAcc;\nvarying vec3 vLP;\nvarying float vSlot;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'if (vSlot > 2.5 && vSlot < 3.5 && vPat.x > 0.5) { float st = step(0.55, fract(vLP.y * 1.75)); diffuseColor.rgb = mix(diffuseColor.rgb, vAcc, st * 0.9); }',
        'if (vSlot > 3.5 && vSlot < 4.5) {',
        '  if (vPat.y > 0.5 && (vLP.y < 0.92 || (vLP.y > 4.95 && vLP.y < 5.12))) diffuseColor.rgb = vAcc;',
        '  if (vPat.z > 0.5) { float g = max(step(fract((vLP.x + vLP.z) * 1.25), 0.12), step(fract(vLP.y * 1.25), 0.12)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), g * 0.45); }',
        '}',
      ].join('\n'));
  }
  function personDepthCompile(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + personVertexHeader(true))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec3 nn = vec3(0.0, 1.0, 0.0); pAnim(transformed, nn); }');
  }

  /** the universal person template; lod 0 = near (all variants), 1 = far (simplified) */
  function buildPersonTemplate(lod) {
    const near = lod === 0;
    const b = new AB();
    const sL = near ? 8 : 5, sS = near ? 6 : 4, sH = near ? 14 : 7, rH = near ? 10 : 5;
    const W = '#ffffff';
    const fx = (f) => (near ? f : 0);
    // ---------------------------------------------------------------- legs
    for (const sd of [-1, 1]) {
      const z = sd * HIP_Z;
      // foot (skin) + chappal sole: parts 10 / 11 (ankle joint)
      b.part(sd < 0 ? 10 : 11).feat(0);
      b.slot(0).color('#2a2220').box(-0.42, 0, z - 0.3, 1.06, 0.17, z + 0.3);
      b.slot(SK).color(W);
      if (near) b.ell(0.32, 0.3, z, 0.66, 0.2, 0.25, 8, 4, { lat0: 0 }); else b.box(-0.3, 0.17, z - 0.24, 0.9, 0.42, z + 0.24);
      if (near) { b.feat(F.SHOES).slot(0).color('#16141a').ell(0.3, 0.26, z, 0.74, 0.3, 0.32, 8, 5, { lat0: -0.2 }).feat(0); }
      b.part(sd < 0 ? 3 : 4).feat(0);
      // shin: bare (skin) or trouser
      b.feat(F.LEG_BARE).slot(SK).color(W).cyl([0, ANK_Y - 0.05, z], [0, KNEE_Y + 0.05, z], 0.26, 0.31, sS, 0);
      if (near) b.ell(0.06, KNEE_Y + 0.02, z, 0.3, 0.3, 0.3, 6, 4);
      b.feat(F.LEG_PANTS).slot(BOT).color(W).cyl([0, ANK_Y + 0.02, z], [0, KNEE_Y + 0.08, z], 0.36, 0.4, sS, 1);
      // thigh (trousers / shorts in the bottom colour)
      b.part(sd < 0 ? 1 : 2).feat(F.LEG_PANTS).slot(BOT).color(W).cyl([0, KNEE_Y - 0.12, z], [0, HIP_Y + 0.08, z * 0.96], 0.41, 0.49, sL, 0);
      b.feat(F.SHORTS).slot(BOT).color(W).cyl([0, KNEE_Y + 0.35, z * 1.02], [0, HIP_Y + 0.08, z * 0.96], 0.5, 0.52, sL, 1);
      b.feat(F.SHORTS).slot(SK).color(W).cyl([0, KNEE_Y - 0.05, z], [0, KNEE_Y + 0.5, z], 0.33, 0.38, sS, 0);
    }
    // ---------------------------------------------------------------- hips, torso, belly, neck
    b.part(0).feat(0).slot(BOT).color(W).ell(0, 4.72, 0, 0.62, 0.52, 0.86, sL, near ? 5 : 3);
    const torso = [[0.8, 4.82], [0.86, 5.3], [0.92, 5.95], [0.98, 6.55], [0.94, 6.95], [0.62, 7.3], [0.3, 7.42]];
    b.feat(F.SLIM).slot(TOP).color(W).lathe(near ? torso : [[0.8, 4.82], [0.95, 6.3], [0.9, 6.95], [0.32, 7.42]], near ? 12 : 6, 0, 0, 0.66, 1);
    // paunch: the torso itself swells forward over the waist (one smooth surface, not a ball stuck on)
    const paunch = [[0.84, 4.82], [0.98, 5.12], [1.1, 5.5], [1.12, 5.88], [1.05, 6.3], [0.99, 6.62], [0.94, 6.95], [0.62, 7.3], [0.3, 7.42]];
    b.feat(F.BELLY).slot(TOP).color(W).lathe(near ? paunch : [[0.84, 4.82], [1.1, 5.6], [1.0, 6.4], [0.9, 6.95], [0.32, 7.42]], near ? 14 : 6, 0.1, 0, 0.74, 0.9).feat(0);
    b.slot(SK).color(W).cyl([0, 7.15, 0], [0, 7.85, 0], 0.3, 0.27, sS, 0);
    // shoulders: shirt (sleeves) or skin (banian / sleeveless)
    for (const sd of [-1, 1]) {
      b.feat(F.SLEEVES).slot(TOP).color(W).ell(0, SH_Y - 0.06, sd * 0.98, 0.38, 0.34, 0.38, sS, 4);
      b.feat(F.NO_SLEEVE).slot(SK).color(W).ell(0, SH_Y - 0.08, sd * 1.0, 0.33, 0.3, 0.33, sS, 4);
    }
    b.feat(0);
    // ---------------------------------------------------------------- arms
    for (const sd of [-1, 1]) {
      const z = sd * SH_Z, ze = sd * (SH_Z + 0.06);
      b.part(sd < 0 ? 5 : 6).feat(0).slot(SK).color(W).cyl([0, SH_Y, z], [0, EL_Y, ze], 0.3, 0.27, sS, 0);
      b.feat(F.SLEEVE_SHORT).slot(TOP).color(W).cyl([0, SH_Y + 0.08, z], [0, 6.12, z + sd * 0.03], 0.39, 0.36, sS, 1);
      b.feat(F.SLEEVE_LONG).slot(TOP).color(W).cyl([0, SH_Y + 0.08, z], [0, EL_Y - 0.05, ze], 0.37, 0.33, sS, 0);
      b.part(sd < 0 ? 7 : 8).feat(0).slot(SK).color(W).cyl([0, EL_Y + 0.05, ze], [0, 4.3, ze], 0.27, 0.22, sS, 0);
      if (near) b.ell(0, EL_Y, ze, 0.28, 0.28, 0.28, 6, 4);
      b.ell(0.05, HAND_Y, ze, 0.22, 0.34, 0.17, near ? 7 : 4, near ? 5 : 3);
      b.feat(F.SLEEVE_LONG).slot(TOP).color(W).cyl([0, EL_Y + 0.08, ze], [0, 4.42, ze], 0.33, 0.29, sS, 1);
      b.feat(0);
    }
    // ---------------------------------------------------------------- clothing over the body
    b.part(0);
    b.feat(F.SKIRT).slot(BOT).color(W).lathe([[0.84, 5.06], [0.98, 4.5], [1.16, 3.15], [1.22, 2.78]], near ? 12 : 6, 0, 0, 0.82, 1, { capBottom: true });
    b.feat(F.TUNIC).slot(TOP).color(W).lathe([[0.86, 5.1], [0.98, 4.3], [1.1, 3.05], [1.12, 2.75]], near ? 12 : 6, 0, 0, 0.8, 1, { capBottom: true });
    b.feat(F.WRAP).slot(BOT).color(W).lathe([[0.86, 5.18], [0.94, 4.5], [1.0, 3.2], [1.03, 1.6], [1.08, 0.5], [1.04, 0.32]], near ? 14 : 7, 0, 0, 0.84, 1, { capBottom: true });
    if (near) {
      // saree pallu: a sash from the left shoulder across the chest to the right hip, and down the back
      b.feat(F.PALLU).slot(BOT).color(W);
      const sash = (pts, w) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], c = pts[i + 1];
          b.quad2([a[0], a[1] - w, a[2] - w * 0.4], [c[0], c[1] - w, c[2] - w * 0.4], [c[0], c[1] + w, c[2] + w * 0.4], [a[0], a[1] + w, a[2] + w * 0.4]);
        }
      };
      sash([[0.3, 7.2, -0.82], [0.62, 6.75, -0.45], [0.72, 6.2, 0.05], [0.72, 5.6, 0.5], [0.6, 5.1, 0.84]], 0.32);
      sash([[-0.62, 5.2, -0.6], [-0.66, 6.0, -0.72], [-0.58, 6.8, -0.82], [0.0, 7.36, -0.9], [0.3, 7.2, -0.82]], 0.36);
      b.slot(ACC).color(W);
      sash([[0.33, 7.06, -0.66], [0.66, 6.6, -0.29], [0.76, 6.05, 0.21], [0.76, 5.45, 0.66]], 0.07);
      // dupatta: over both shoulders, ends hanging in front, a loop behind the neck
      b.feat(F.DUPATTA).slot(ACC).color(W);
      for (const sd of [-1, 1]) sash([[0.0, 7.35, sd * 0.78], [0.5, 7.0, sd * 0.8], [0.68, 6.2, sd * 0.72], [0.66, 5.2, sd * 0.68]], 0.22);
      sash([[-0.1, 7.38, -0.75], [-0.62, 7.0, -0.3], [-0.62, 7.0, 0.3], [-0.1, 7.38, 0.75]], 0.18);
      // tie, belt, school bag, towel, apron, walkman, camera
      b.feat(F.TIE).slot(ACC).color(W).tbox(0.6, 5.55, -0.12, 0.74, 7.12, 0.12, 0, 0.02, 0.02);
      b.feat(F.BELT).slot(0).color('#4a3020').lathe([[0.84, 4.98], [0.85, 5.24]], 12, 0, 0, 0.7, 1.02).color('#c9a227').box(0.58, 5.0, -0.16, 0.66, 5.22, 0.16);
      b.feat(F.BAG).slot(BAG).color(W).box(-1.12, 5.15, -0.66, -0.55, 6.95, 0.66).slot(0).color('#2a2a30').box(-0.66, 6.6, -0.62, 0.62, 7.3, -0.44).box(-0.66, 6.6, 0.44, 0.62, 7.3, 0.62);
      b.feat(F.TOWEL).slot(XTR).color(W).box(-0.5, 7.2, 0.62, 0.5, 7.42, 1.22).box(0.48, 6.05, 0.72, 0.66, 7.32, 1.12).box(-0.66, 6.3, 0.72, -0.48, 7.32, 1.12);
      b.feat(F.APRON).slot(ACC).color(W).box(0.6, 3.9, -0.62, 0.74, 6.5, 0.62);
      b.feat(F.WALKMAN).slot(0).color('#f2c230').box(0.05, 4.86, 0.84, 0.55, 5.38, 1.0).color('#3a3020').box(0.15, 5.0, 0.99, 0.45, 5.26, 1.02);
      b.feat(F.CAMERA).slot(0).color('#1d1d20').box(0.72, 5.75, -0.32, 1.02, 6.25, 0.28).color('#4a5a6a').cyl([1.0, 6.0, -0.02], [1.22, 6.0, -0.02], 0.15, 0.13, 6, 2);
      b.feat(F.P_NEEM).slot(0).color('#3a7a2a');
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; b.ell(Math.cos(a) * 0.72, 4.85, Math.sin(a) * 0.98, 0.34, 0.5, 0.26, 4, 2); }
      b.feat(F.P_DAPPU).slot(0).color('#7a3a1a').cyl([0.95, 5.6, -0.9], [1.25, 5.6, -0.1], 0.95, 0.95, 12, 3).color('#e8dcb8').cyl([1.26, 5.6, -0.08], [1.27, 5.6, -0.06], 0.9, 0.9, 12, 3);
      b.feat(F.P_NOTEBOOK).slot(0).color('#c03030').box(0.66, 5.2, 0.15, 0.84, 6.05, 0.95);
    }
    b.feat(0);
    // ---------------------------------------------------------------- head
    b.part(9).slot(SK).color(W);
    b.ell(0.05, 8.3, 0, 0.7, 0.8, 0.66, sH, rH);
    if (near) {
      b.feat(F.FACE);
      b.ell(0.3, 7.96, 0, 0.44, 0.36, 0.5, 8, 4);
      b.ell(-0.02, 8.24, -0.66, 0.13, 0.21, 0.1, 6, 4).ell(-0.02, 8.24, 0.66, 0.13, 0.21, 0.1, 6, 4);
      b.ell(0.74, 8.18, 0, 0.13, 0.17, 0.1, 6, 4);
      b.slot(0).color('#1a1214').ell(0.66, 8.38, -0.25, 0.07, 0.11, 0.09, 6, 4).ell(0.66, 8.38, 0.25, 0.07, 0.11, 0.09, 6, 4);
      b.color('#f4efe6').ell(0.63, 8.38, -0.25, 0.06, 0.1, 0.13, 6, 3).ell(0.63, 8.38, 0.25, 0.06, 0.1, 0.13, 6, 3);
      b.slot(HR).color(W).box(0.6, 8.55, -0.4, 0.74, 8.62, -0.12).box(0.6, 8.55, 0.12, 0.74, 8.62, 0.4);
      b.slot(0).color('#7a3a30').box(0.66, 7.88, -0.14, 0.73, 7.94, 0.14);
      b.feat(F.MOUSTACHE).slot(HR).color(W).tbox(0.64, 7.98, -0.24, 0.8, 8.1, 0.24, 0.02, 0.04);
      b.feat(F.BINDI).slot(0).color('#c0202a').ell(0.69, 8.6, 0, 0.04, 0.06, 0.06, 5, 3);
      b.feat(F.BEARD).slot(XTR).color(W).ell(0.3, 7.88, 0, 0.47, 0.44, 0.62, 10, 5, { lat1: 0.25 });
      b.feat(F.LONGBEARD).slot(XTR).color(W).ell(0.46, 7.55, 0, 0.32, 0.72, 0.44, 8, 5);
      b.feat(F.SPECS).slot(0).color('#2a2420');
      for (const sd of [-1, 1]) {
        const zc = sd * 0.25;
        b.box(0.74, 8.24, zc - 0.17, 0.79, 8.28, zc + 0.17).box(0.74, 8.48, zc - 0.17, 0.79, 8.52, zc + 0.17);
        b.box(0.74, 8.24, zc - 0.19, 0.79, 8.52, zc - 0.15).box(0.74, 8.24, zc + 0.15, 0.79, 8.52, zc + 0.19);
        b.box(0.0, 8.44, sd * 0.66, 0.76, 8.48, sd * 0.69);
      }
      b.box(0.74, 8.42, -0.08, 0.79, 8.46, 0.08);
      b.feat(0);
    }
    // hair
    b.slot(HR).color(W);
    b.feat(F.HAIR_SHORT).ell(-0.07, 8.47, 0, 0.77, 0.66, 0.72, sH, near ? 6 : 3, { lat0: 0.32 })
      .ell(-0.07, 8.47, 0, 0.77, 0.66, 0.72, near ? 12 : 6, near ? 6 : 3, { lat0: -0.08, lat1: 0.36, t0: 1.05, t1: TAU - 1.05 })
      .ell(-0.3, 8.15, 0, 0.55, 0.5, 0.66, near ? 10 : 5, near ? 5 : 3);
    if (near) b.feat(F.HAIR_FRINGE).ell(0.38, 8.82, 0.12, 0.38, 0.2, 0.5, 8, 4);
    b.feat(F.HAIR_LONG).ell(-0.07, 8.5, 0, 0.78, 0.62, 0.73, sH, near ? 6 : 3, { lat0: 0.3 })
      .ell(-0.07, 8.5, 0, 0.78, 0.62, 0.73, near ? 12 : 6, near ? 6 : 3, { lat0: -0.15, lat1: 0.34, t0: 0.95, t1: TAU - 0.95 })
      .ell(-0.24, 8.05, 0, 0.62, 0.78, 0.74, near ? 10 : 6, near ? 6 : 4, { t0: 1.3, t1: TAU - 1.3 });
    if (near) {
      b.feat(F.BUN).ell(-0.84, 8.12, 0, 0.36, 0.34, 0.38, 8, 6);
      b.feat(F.JASMINE).slot(0).color('#f8f4ea');
      for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; b.ell(-0.86 + Math.cos(a) * 0.1, 8.12 + Math.sin(a) * 0.4, Math.cos(a) * 0.38, 0.11, 0.11, 0.11, 4, 2); }
      b.slot(HR).color(W);
      b.feat(F.PLAIT_ONE).cyl([-0.72, 8.0, 0], [-0.92, 6.05, 0], 0.2, 0.13, 6, 2).slot(BAG).ell(-0.93, 6.0, 0, 0.14, 0.18, 0.14, 5, 3).slot(HR);
      b.feat(F.PLAITS_TWO);
      for (const sd of [-1, 1]) { b.slot(HR).cyl([-0.32, 8.05, sd * 0.58], [-0.45, 6.75, sd * 0.68], 0.17, 0.12, 6, 0).slot(BAG).ell(-0.45, 6.72, sd * 0.68, 0.18, 0.13, 0.26, 6, 3); }
      b.feat(F.PONYTAILS);
      for (const sd of [-1, 1]) { b.slot(HR).ell(-0.2, 8.42, sd * 0.86, 0.24, 0.34, 0.22, 6, 4).slot(BAG).ell(-0.18, 8.68, sd * 0.74, 0.12, 0.12, 0.12, 5, 3); }
      b.slot(HR).color(W);
      b.feat(F.PUFF).ell(0.12, 8.95, 0, 0.66, 0.4, 0.7, 10, 5);
      b.feat(F.BALD_RING).ell(-0.12, 8.22, 0, 0.73, 0.42, 0.71, 12, 5, { t0: Math.PI * 0.42, t1: Math.PI * 1.58 });
      b.feat(F.COWLICK).ell(0.05, 9.12, -0.08, 0.24, 0.2, 0.17, 6, 4);
    }
    // caps / hats / head covers
    b.feat(F.CAP_POLICE).slot(0).color('#6a5a3a').lathe([[0.74, 8.7], [0.8, 8.95], [0.92, 9.24], [0.0, 9.3]], near ? 12 : 6, 0, 0, 1, 1)
      .color('#b22b2b').lathe([[0.76, 8.66], [0.77, 8.86]], near ? 12 : 6, 0, 0, 1, 1)
      .color('#16161c').tbox(0.42, 8.66, -0.55, 1.12, 8.74, 0.55, 0, 0.18, 0);
    b.slot(HAT).color(W);
    b.feat(F.CAP_TOPI).ell(-0.04, 8.74, 0, 0.7, 0.36, 0.68, near ? 12 : 6, 4, { lat0: 0 });
    b.feat(F.CAP_CRICKET).ell(-0.04, 8.68, 0, 0.78, 0.55, 0.74, near ? 12 : 6, 5, { lat0: 0 }).tbox(0.45, 8.68, -0.5, 1.32, 8.76, 0.5, 0, 0.15, 0);
    b.feat(F.CAP_BACK).ell(-0.04, 8.68, 0, 0.78, 0.55, 0.74, near ? 12 : 6, 5, { lat0: 0 }).tbox(-1.32, 8.68, -0.5, -0.45, 8.76, 0.5, 0, 0.15, 0);
    if (near) {
      b.feat(F.CAP_GANDHI).tbox(-0.72, 8.82, -0.36, 0.72, 9.25, 0.36, 0.2, 0.28, 0);
      b.feat(F.CAP_PITH).ell(-0.04, 8.75, 0, 0.82, 0.62, 0.8, 12, 5, { lat0: 0 }).lathe([[1.2, 8.68], [0.8, 8.84]], 12, -0.04, 0, 1, 1, { capBottom: true });
      b.feat(F.HOOD).ell(-0.06, 8.36, 0, 0.84, 0.92, 0.8, 14, 8, { t0: 0.95, t1: TAU - 0.95, lat0: -0.35 });
    }
    b.feat(F.HEAD_COVER).slot(ACC).color(W).ell(-0.05, 8.38, 0, 0.82, 0.9, 0.78, sH, rH, { t0: near ? 0.9 : 0.8, t1: TAU - (near ? 0.9 : 0.8), lat0: -0.3 })
      .lathe([[1.18, 6.9], [0.98, 7.35], [0.78, 7.85]], near ? 12 : 6, -0.08, 0, 0.82, 1, { t0: 0.7, t1: TAU - 0.7 });
    if (near) b.feat(F.FACE_VEIL).slot(ACC).color(W).ell(0.06, 8.12, 0, 0.74, 0.5, 0.7, 10, 4, { t0: -1.0, t1: 1.0, lat0: -0.6, lat1: 0.35 });
    // things carried on the head (porter's trunk, bonam pot)
    if (near) {
      b.feat(F.P_TRUNK).slot(0).color('#6a7a8a').box(-0.6, 9.08, -0.85, 0.6, 9.85, 0.85).color('#c9a227').box(-0.62, 9.38, -0.87, 0.62, 9.5, 0.87);
      b.feat(F.P_POT).slot(0).color('#c9a227').lathe([[0.25, 9.05], [0.62, 9.3], [0.7, 9.6], [0.5, 9.95], [0.3, 10.05], [0.38, 10.18]], 10, 0, 0, 1, 1)
        .color('#3a7a2a').ell(0, 10.32, 0, 0.42, 0.26, 0.42, 7, 4).color('#ffd060').ell(0, 10.6, 0, 0.08, 0.14, 0.08, 4, 3);
    }
    b.feat(0);
    // ---------------------------------------------------------------- props in the right hand (right forearm)
    if (near) {
      const hz = SH_Z + 0.06;
      b.part(8);
      b.feat(F.P_STICK).slot(0).color('#7a5a32').cyl([0.14, HAND_Y + 0.25, hz], [0.85, 0.02, hz + 0.18], 0.08, 0.07, 5, 0);
      b.feat(F.P_BASKET).slot(0).color('#b0864a').lathe([[0.3, 3.15], [0.55, 3.35], [0.62, 3.75]], 9, 0.3, hz + 0.32, 1, 1, { capBottom: true }).color('#4f8a3a').ell(0.3, 3.72, hz + 0.32, 0.5, 0.18, 0.5, 7, 3, { lat0: 0 });
      b.feat(F.P_CLOTHBAG).slot(0).color('#b8a888').box(-0.18, 2.75, hz - 0.08, 0.35, 3.85, hz + 0.28);
      b.feat(F.P_TRAY).slot(0).color('#c8ccd0').lathe([[0.72, 3.95], [0.75, 4.05]], 12, 0.55, hz - 0.35, 1, 1, { capBottom: true, capTop: true }).color('#e08a2a').ell(0.5, 4.12, hz - 0.3, 0.2, 0.12, 0.2, 5, 3).color('#f2e8c8').ell(0.75, 4.12, hz - 0.5, 0.18, 0.1, 0.18, 5, 3);
      b.feat(F.P_BAT).slot(0).color('#3a2a2a').cyl([0.1, HAND_Y + 0.2, hz + 0.05], [0.12, HAND_Y - 0.55, hz + 0.05], 0.11, 0.11, 5, 0).color('#d8b878').tbox(-0.05, 0.75, hz - 0.12, 0.28, HAND_Y - 0.5, hz + 0.24, 0.04, 0.0, 0.0);
      b.feat(F.P_BALL).slot(0).color('#d8e04a').ell(0.22, HAND_Y - 0.05, hz, 0.22, 0.22, 0.22, 6, 4);
      b.feat(F.P_PACKET).slot(0).color('#6a3a1a').box(0.05, 3.55, hz - 0.12, 0.55, 3.95, hz + 0.22);
      b.feat(F.P_RADIO).slot(0).color('#3a3a3a').box(-0.05, 3.5, hz - 0.12, 0.85, 4.05, hz + 0.24).color('#c9c9c4').cyl([0.4, 3.78, hz + 0.24], [0.4, 3.78, hz + 0.27], 0.18, 0.18, 8, 2);
      b.feat(F.P_CHAPPAL).slot(0).color('#f4f0e8').box(0.0, HAND_Y + 0.15, hz - 0.2, 1.25, HAND_Y + 0.28, hz + 0.25).color('#2a5cb8').box(0.4, HAND_Y + 0.28, hz - 0.15, 0.6, HAND_Y + 0.4, hz + 0.2);
      b.feat(F.P_CHARKHI).slot(0).color('#b07a3a').cyl([0.25, HAND_Y - 0.1, hz - 0.45], [0.25, HAND_Y - 0.1, hz + 0.45], 0.42, 0.42, 9, 3).color('#f4f0e8').cyl([0.25, HAND_Y - 0.1, hz - 0.2], [0.25, HAND_Y - 0.1, hz + 0.2], 0.47, 0.47, 9, 0);
      b.feat(F.P_TIFFIN).slot(0).color('#c8ccd0').cyl([0.2, 2.9, hz + 0.1], [0.2, 3.7, hz + 0.1], 0.38, 0.38, 9, 3).color('#9a9ea4').cyl([0.2, 3.7, hz + 0.1], [0.2, 3.9, hz + 0.1], 0.08, 0.08, 4, 0);
      b.feat(0);
    }
    return b.build();
  }

  /* ---------------------------------------------------------------- look -> instance spec */
  const lookCache = new WeakMap();
  const PROP_FEAT = {
    stick: F.P_STICK, basket: F.P_BASKET, clothbag: F.P_CLOTHBAG, tray: F.P_TRAY, trunk: F.P_TRUNK, pot: F.P_POT, bat: F.P_BAT, ball: F.P_BALL,
    notebook: F.P_NOTEBOOK, packet: F.P_PACKET, radio: F.P_RADIO, chappal: F.P_CHAPPAL, charkhi: F.P_CHARKHI, tiffin: F.P_TIFFIN,
    tin: F.P_PACKET, parcel: F.P_PACKET, torch: F.P_PACKET, wrapper: F.P_PACKET, satchel: F.P_CLOTHBAG, antenna: F.P_STICK, dappu: F.P_DAPPU, neem: F.P_NEEM, bonam: F.P_POT,
  };
  const HEAD_PROPS = { trunk: 1, pot: 1, bonam: 1 };
  /** look -> {f: [4 floats], c: [8 packed colours], size, wide, kid, wrap, headCarry, lungi} */
  function lookSpec(look, seed) {
    const L = look || {};
    let s = lookCache.get(L);
    if (s && s.seed === (seed | 0)) return s;
    const bits = new Set();
    const on = (f) => bits.add(f);
    const kind = L.kind || 'man';
    const kid = kind === 'kid' || kind === 'student';
    const girl = !!L.girl;
    const r = hash1((seed | 0) * 0.137 + 3.1);
    const skin = L.skin || '#a0683f', hair = L.hair || '#1a1412';
    let top = L.shirt || '#e8e0d0', bottom = L.pants || '#3a3a4a', accent = '#f2c230', hat = L.hatColor || L.capColor || '#f4f2ea', bag = L.bag || '#2a5cb8', extra = L.beard || L.towel || '#efe6d0';
    let wrap = false, lungi = false, wide = 1, sleeves = 'short', hairStyle = 'short', patt = { stripes: false, border: false, checks: false };
    switch (kind) {
      case 'kid': case 'student':
        if (girl) { on(F.SKIRT); on(F.LEG_BARE); hairStyle = L.plaits ? 'plaits' : L.ponytails ? 'ponytails' : 'long'; }
        else { on(F.SHORTS); on(F.LEG_BARE); }
        if (kind === 'student') { on(F.SHOES); on(F.TIE); accent = L.tie || '#b22b2b'; on(F.BAG); bag = L.bag || '#2a5cb8'; }
        break;
      case 'uncle':
        wrap = lungi = true; bottom = L.lungi || L.pants || '#2a5cb8'; top = '#f2efe6'; sleeves = 'none'; hairStyle = 'bald';
        if (L.belly || r < 0.5) on(F.BELLY);
        if (r > 0.25) on(F.MOUSTACHE);
        wide = 1.07;
        break;
      case 'lungi':
        wrap = lungi = true; bottom = L.lungi || L.pants || '#2a5cb8';
        if (r > 0.35) on(F.MOUSTACHE);
        break;
      case 'aunty': case 'saree': {
        wrap = true; bottom = L.saree || L.shirt || '#d8402a'; top = L.blouse || shadeHex(bottom, 0.72); accent = L.border || '#f2c230';
        patt.border = true; on(F.PALLU); on(F.BINDI); hairStyle = kind === 'aunty' ? 'bun' : 'plait';
        if (kind === 'aunty') wide = 1.04;
        break;
      }
      case 'woman':
        on(F.TUNIC); on(F.LEG_PANTS); hairStyle = 'plait';
        if (L.dupatta) { on(F.DUPATTA); accent = L.dupatta; }
        if (r < 0.5) on(F.BINDI);
        break;
      case 'burqa':
        wrap = true; bottom = '#141216'; top = '#141216'; sleeves = 'long'; hairStyle = 'none'; accent = '#141216';
        on(F.HEAD_COVER); on(F.FACE_VEIL);
        break;
      case 'police':
        on(F.LEG_PANTS); on(F.CAP_POLICE); on(F.BELT); on(F.SHOES); on(F.MOUSTACHE);
        top = '#b8a070'; bottom = '#9a8656';
        break;
      default: // man
        on(F.LEG_PANTS);
        if (r > 0.42) on(F.MOUSTACHE);
    }
    if (wrap) on(F.WRAP);
    if (!wrap && !bits.has(F.LEG_PANTS) && !bits.has(F.LEG_BARE)) on(F.LEG_PANTS);
    if (bits.has(F.TUNIC) && !bits.has(F.LEG_PANTS)) on(F.LEG_PANTS);
    // uniform cues
    if (L.cap === 'police' || L.pants === '#a89060' && L.cap === 'police') { on(F.CAP_POLICE); on(F.BELT); on(F.SHOES); }
    // sleeves
    if (L.body) { top = L.body; sleeves = 'none'; }
    if (sleeves === 'short') { on(F.SLEEVES); on(F.SLEEVE_SHORT); } else if (sleeves === 'long') { on(F.SLEEVES); on(F.SLEEVE_LONG); } else on(F.NO_SLEEVE);
    // hair
    if (L.headCover) { on(F.HEAD_COVER); accent = L.headCover; }
    let capOn = false;
    if (L.cap === 'police') capOn = true;
    else if (L.cap === 'topi') { on(F.CAP_TOPI); capOn = true; hat = L.capColor || '#f4f2ea'; }
    else if (L.cap === 'cricket') { on(F.CAP_CRICKET); capOn = true; hat = L.capColor || '#2a5cb8'; }
    switch (L.hat) {
      case 'skull': case 'topi': case 'irani': on(F.CAP_TOPI); capOn = true; hat = L.hatColor || '#f4f2ea'; break;
      case 'dhaka': on(F.CAP_TOPI); capOn = true; hat = L.hatColor || '#1d1a1e'; break;
      case 'gandhi': on(F.CAP_GANDHI); capOn = true; hat = L.hatColor || '#f4f2ea'; break;
      case 'pith': on(F.CAP_PITH); capOn = true; hat = L.hatColor || '#e8dcc0'; break;
      case 'backcap': on(F.CAP_BACK); capOn = true; hat = L.hatColor || '#c03030'; break;
      case 'hood': on(F.HOOD); capOn = true; hat = L.hatColor || '#f2c230'; hairStyle = 'none'; break;
      default: break;
    }
    if (bits.has(F.CAP_POLICE)) capOn = true;
    if (bits.has(F.HEAD_COVER)) hairStyle = 'none';
    switch (hairStyle) {
      case 'short': on(F.HAIR_SHORT); if (!capOn && kind !== 'uncle') on(F.HAIR_FRINGE); break;
      case 'bald': on(F.BALD_RING); if (L.hair == null) { /* keep */ } break;
      case 'bun': on(F.HAIR_LONG); on(F.BUN); on(F.JASMINE); break;
      case 'plait': on(F.HAIR_LONG); on(F.PLAIT_ONE); bag = L.plaits || '#d8202a'; break;
      case 'plaits': on(F.HAIR_LONG); on(F.PLAITS_TWO); bag = L.plaits || '#d8202a'; break;
      case 'ponytails': on(F.HAIR_LONG); on(F.PONYTAILS); bag = L.ponytails || '#d8202a'; break;
      case 'long': on(F.HAIR_LONG); break;
      default: break;
    }
    if (L.plaits && hairStyle !== 'none' && !bits.has(F.PLAITS_TWO)) { on(F.PLAITS_TWO); bag = L.plaits; }
    if (L.ponytails && hairStyle !== 'none' && !bits.has(F.PONYTAILS)) { on(F.PONYTAILS); bag = L.ponytails; }
    if (L.puff && !capOn) on(F.PUFF);
    if (L.cowlick && !capOn) on(F.COWLICK);
    if (capOn) { bits.delete(F.HAIR_FRINGE); bits.delete(F.PUFF); }
    // face + body extras
    if (L.specs) on(F.SPECS);
    if (L.beard) { on(F.BEARD); extra = L.beard; if (L.longBeard) on(F.LONGBEARD); bits.delete(F.MOUSTACHE); }
    if (L.moustache) on(F.MOUSTACHE);
    if (kid || kind === 'woman' || kind === 'aunty' || kind === 'saree' || kind === 'burqa') bits.delete(F.MOUSTACHE);
    if (L.belly) on(F.BELLY);
    if (L.bag && kind !== 'student') { on(F.BAG); bag = L.bag; }
    if (L.tie || L.tieDot) { on(F.TIE); accent = L.tie || L.tieDot; }
    if (L.towel) { on(F.TOWEL); if (!L.beard) extra = L.towel; }
    if (L.apron) { on(F.APRON); accent = L.apron; }
    if (L.stripes) { patt.stripes = true; accent = L.stripes; }
    if (L.walkman) { on(F.WALKMAN); }
    if (L.camera) on(F.CAMERA);
    if (L.neem) on(F.P_NEEM);
    if (lungi) patt.checks = true;
    if (kind === 'student' || kind === 'police' || kind === 'man' && (L.lanyardDot || L.shoes)) on(F.SHOES);
    // props
    const prop = L.prop;
    const pf = prop && PROP_FEAT[prop];
    if (pf) on(pf);
    if (bits.has(F.P_TRUNK) || bits.has(F.P_POT)) { bits.delete(F.CAP_TOPI); bits.delete(F.CAP_CRICKET); bits.delete(F.CAP_BACK); }
    on(F.FACE);
    if (!bits.has(F.BELLY)) on(F.SLIM);
    // pack
    const f = [0, 0, 0, 0];
    for (const id of bits) { const i = id - 1, w = (i / 20) | 0, bb = i - w * 20; f[w] += Math.pow(2, bb); }
    if (patt.stripes) f[3] += Math.pow(2, BIT_STRIPES);
    if (patt.border) f[3] += Math.pow(2, BIT_BORDER);
    if (patt.checks) f[3] += Math.pow(2, BIT_CHECKS);
    if (kid) f[3] += Math.pow(2, BIT_KID);
    const size = (L.size || 1) * (kid ? 0.78 : kind === 'uncle' ? 1.02 : 1);
    // seated / riding: a wrap (lungi, saree, burqa) drapes over the legs instead of hanging as a cone
    const fSeat = f.slice();
    if (bits.has(F.WRAP)) { fSeat[0] -= Math.pow(2, F.WRAP - 1); if (!bits.has(F.LEG_PANTS)) fSeat[0] += Math.pow(2, F.LEG_PANTS - 1); }
    s = {
      seed: seed | 0, f, fSeat, c: [pack(skin), pack(hair), pack(top), pack(bottom), pack(accent), pack(hat), pack(bag), pack(extra)],
      size, wide, kid, wrap, girl, headCarry: !!HEAD_PROPS[prop], prop: prop || null, kind, belly: bits.has(F.BELLY),
    };
    lookCache.set(L, s);
    return s;
  }

  /* ---------------------------------------------------------------- poses (joint angles) */
  // J: [hipL, hipR, kneeL, kneeR, shL, shR, elL, elR, abL, abR, lean, bob, headYaw, headPitch, breathe,
  //     ankles (packed), legAbdL, legAbdR]; the instance packs head yaw + pitch and the two leg abductions
  const J = new Float32Array(18);
  function poseRest(j) { j.fill(0); j[8] = j[9] = 0.07; j[6] = j[7] = 0.12; return j; }
  /** lowest point of a foot sole (template y) for hip angle h and knee angle k (feet planting) */
  function soleMin(h, k) {
    const ay = HIP_Y - THIGH * Math.cos(h) - SHIN * Math.cos(h + k);
    const sn = Math.sin(h + k), cs = Math.cos(h + k);
    return ay + Math.min(-0.42 * sn - 0.36 * cs, 1.06 * sn - 0.36 * cs);
  }
  /** lift / drop the whole body so the lowest foot touches the ground */
  function ground(j) { j[11] = -Math.min(soleMin(j[0], j[2]), soleMin(j[1], j[3])); return j; }
  /** 2-bone IK in the sagittal plane: root at (rx, ry), target (tx, ty), bones a, b; bend +1 knee-forward / -1 elbow-back */
  function ik2(rx, ry, tx, ty, a, b, bend, out, oi) {
    let dx = tx - rx, dy = ty - ry;
    let d = Math.hypot(dx, dy);
    const dmax = (a + b) * 0.999, dmin = Math.abs(a - b) + 0.05;
    if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; } else if (d < dmin) { d = dmin; }
    const base = Math.atan2(dx, -dy);
    const A = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    const B = Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
    if (bend > 0) { out[oi] = base + A; out[oi + 1] = -(Math.PI - B); } else { out[oi] = base - A; out[oi + 1] = Math.PI - B; }
  }
  const IKO = [0, 0];
  /** arms to hand targets (template coords, already relative to the person root) with torso lean;
   *  maxLean: lean further forward (up to it) until both hands reach their targets (a kid on an
   *  adult's cycle or an auto stretches over the handlebar instead of grabbing at the air) */
  const ARM_REACH = (UARM + FARM) * 0.985;
  function armNeed(lean, x, y, z) {
    const c = Math.cos(lean), s = Math.sin(lean), qy = y - HIP_Y;
    return Math.hypot(x * c - qy * s, x * s + qy * c + HIP_Y - SH_Y, Math.abs(z) - SH_Z);
  }
  /** one arm (k 0 = left, z < 0; 1 = right) to a 3D hand target in the unleaned body frame: 2-bone IK
   *  in the sagittal plane at the full 3D distance, then the out-of-plane swing (j[8 + k], see the
   *  shader) carries the hand out to the target's lateral offset */
  function armIK(j, k, x, y, z, abMin) {
    const side = k ? 1 : -1, dy = y - SH_Y, ds = Math.hypot(x, dy) || 1e-6;
    const lat = side * z - SH_Z, d3 = Math.hypot(ds, lat);
    ik2(0, SH_Y, x / ds * d3, SH_Y + dy / ds * d3, UARM, FARM, -1, IKO, 0);
    j[4 + k] = IKO[0]; j[6 + k] = IKO[1];
    j[8 + k] = clamp(Math.atan2(lat, ds), abMin == null ? -0.6 : abMin, 1.3);
  }
  function armsTo(j, lean, lx, ly, lz, rx, ry, rz, maxLean, abMin) {
    if (maxLean > lean) for (let k = 0; k < 16 && lean < maxLean && Math.max(armNeed(lean, lx, ly, lz), armNeed(lean, rx, ry, rz)) > ARM_REACH; k++) lean = Math.min(maxLean, lean + 0.05);
    const c = Math.cos(lean), s = Math.sin(lean);
    const un = (x, y) => { const qx = x, qy = y - HIP_Y; return [qx * c - qy * s, qx * s + qy * c + HIP_Y]; }; // undo the forward lean
    const L = un(lx, ly), R = un(rx, ry);
    armIK(j, 0, L[0], L[1], lz, abMin); armIK(j, 1, R[0], R[1], rz, abMin);
    j[10] = lean;
  }
  /* talking: whoever speaks a dialogue line or a bark gestures while the words are up (one hand
   * raised palm-up in small emphatic arcs, the other lifting now and then, the head nodding) */
  const TALK = new WeakMap(); // actor -> {t0, until}
  function talkStart(a, secs) {
    if (!a || typeof a !== 'object' || !a.look) return;
    const t = nowS(), r = TALK.get(a);
    TALK.set(a, { t0: r && r.until > t ? r.t0 : t, until: t + clamp(secs, 0.8, 7) });
  }
  N.on('dialogue:bark', (d) => { try { if (d && d.target) talkStart(d.target, 1.6 + String(d.text || '').length * 0.05); } catch (e) { /* cosmetic */ } });
  N.on('dialogue:line', (d) => {
    try {
      if (!d || d.skipped) return;
      const id = d.as || d.speaker;
      const a = id === 'player' || id === 'chinnu' ? N.player : (N.npcs && N.npcs.get ? N.npcs.get(id) : null);
      if (a) talkStart(a, 1.2 + String(d.text || '').length * 0.045);
    } catch (e) { /* cosmetic */ }
  });
  /** 0..1 talking weight now (eased in and out) */
  function talkW(a) {
    const r = TALK.get(a); if (!r) return 0;
    const t = nowS();
    if (t > r.until + 0.4) { TALK.delete(a); return 0; }
    return clamp((t - r.t0) / 0.25, 0, 1) * clamp((r.until + 0.4 - t) / 0.4, 0, 1);
  }
  function talkArms(j, t, seed, rightFree) {
    const a = t * 2.3 + seed, b = t * 1.55 + seed * 2.3;
    const g = 0.5 + 0.5 * Math.sin(a * 0.9) * Math.sin(b * 0.7 + 1);
    if (rightFree) {
      j[5] = 0.42 + 0.3 * g + 0.08 * Math.sin(a * 1.9);
      j[7] = 1.3 + 0.38 * Math.sin(a);
      j[9] = 0.22 + 0.16 * Math.sin(b);
    }
    const l = Math.max(0, Math.sin(b * 0.8 + 2));
    j[4] = 0.1 + 0.32 * l; j[6] = 0.3 + 0.9 * l; j[8] = 0.12 + 0.1 * l;
    j[12] += 0.1 * Math.sin(t * 3.1 + seed); j[13] += 0.05 * Math.sin(t * 4.4 + seed);
    return j;
  }
  /* idle arm habits: what people do with their hands while standing about (feedback_3d.md #2,
   * "idle"): uncles and constables clasp their hands behind the back, aunties and women hold them
   * in front, men fold their arms, students hold their bag straps, kids swing their arms. A habit
   * comes and goes (habitOn) and blends in with the standing weight. */
  const HABIT_KINDS = {
    police: [['behind', 1]], uncle: [['behind', 0.75], ['fold', 1]], lungi: [['behind', 0.5], ['fold', 0.8]],
    aunty: [['front', 0.55], ['fold', 0.8]], saree: [['front', 0.5], ['fold', 0.7]], woman: [['front', 0.55]], burqa: [['front', 1]],
    man: [['fold', 0.35], ['behind', 0.6]], kid: [['swing', 0.45], ['behind', 0.6]], student: [['straps', 0.85], ['swing', 1]],
  };
  function habitOf(s, seed) {
    const L = HABIT_KINDS[s.kind];
    if (!L) return null;
    const r = hash1(seed * 0.731 + 5.3);
    for (const h of L) if (r < h[1]) return h[0];
    return null;
  }
  /** 0..1: is the habit on now (slow, per person: held for tens of seconds, eased in / out) */
  function habitOn(t, seed) {
    if (OPT.habits !== true) return OPT.habits === 'always' ? 1 : 0;
    const v = 0.5 + 0.5 * Math.sin(t * 0.083 + seed * 1.71) * Math.cos(t * 0.031 + seed * 0.37);
    const k = clamp((v - 0.3) / 0.22, 0, 1);
    return k * k * (3 - 2 * k);
  }
  const JH = new Float32Array(18);
  function habitArms(j, hab, s, t, seed) {
    const belly = !!s.belly;
    const fx = belly ? 1.12 : 0.8, bx = s.wrap || belly ? -1.2 : -1.06;
    switch (hab) {
      // hands joined low behind the back: nearly straight arms swung back and in (elbows tucked by the
      // back, not winged out at shoulder height)
      case 'behind': armsTo(j, j[10], bx, 4.35, -0.18, bx - 0.04, 4.45, 0.14, 0, -0.9); break;
      case 'front': armsTo(j, j[10], fx, belly ? 4.8 : 5.0, -0.14, fx + 0.04, belly ? 4.92 : 5.1, 0.1, 0, -0.9); break;
      case 'fold': armsTo(j, j[10], belly ? 1.12 : 0.95, 6.12, 0.42, belly ? 1.16 : 1.0, 5.92, -0.42, 0, -0.95); break;
      case 'straps': armsTo(j, j[10], 0.74, 6.42, -0.52, 0.74, 6.5, 0.52, 0, -0.9); break;
      case 'swing': { const a = Math.sin(t * 1.9 + seed) * 0.42; j[4] = a; j[5] = a * 0.85; j[6] = j[7] = 0.25 + Math.max(0, a) * 0.4; j[8] = j[9] = 0.1; break; }
      case 'work': // a shopkeeper / chai-wala busy at the counter: both hands working at waist height
        armsTo(j, j[10], 1.3 + 0.16 * Math.sin(t * 2.1 + seed), 5.3 + 0.14 * Math.sin(t * 3.3 + seed), -0.5,
          1.36 + 0.16 * Math.sin(t * 1.7 + seed + 1), 5.25 + 0.12 * Math.sin(t * 2.9 + 1), 0.48, 0, -0.9);
        break;
      default: break;
    }
    return j;
  }
  function legsTo(j, lx, ly, rx, ry) {
    ik2(0, HIP_Y, lx, ly, THIGH, SHIN, 1, IKO, 0); j[0] = IKO[0]; j[2] = IKO[1];
    ik2(0, HIP_Y, rx, ry, THIGH, SHIN, 1, IKO, 0); j[1] = IKO[0]; j[3] = IKO[1];
  }
  function poseSit(j, armRest) {
    j.fill(0); j[14] = 0;
    j[0] = j[1] = 1.5; j[2] = j[3] = -1.5;
    j[4] = j[5] = armRest == null ? 0.45 : armRest; j[6] = j[7] = 0.75; j[8] = j[9] = 0.12;
    return j;
  }
  /** both ankle angles packed into J[15] (0 = feet rigid with the shins) */
  function encAnk(a, b) { return (Math.round(clamp(a, -2, 2) * 1000) + 2048) * 4096 + Math.round(clamp(b, -2, 2) * 1000) + 2048; }
  function decAnk(v) { if (!(v > 0.5)) return [0, 0]; const hi = Math.floor(v / 4096); return [(hi - 2048) / 1000, (v - hi * 4096 - 2048) / 1000]; }
  /** feet flat (plus tilt) for the current hip / knee angles */
  function flatFeet(j, tl, tr) { j[15] = encAnk((tl || 0) - j[0] - j[2], (tr || 0) - j[1] - j[3]); }

  /* ---------------------------------------------------------------- planted-foot gait
   * Procedural walk / run in template units (adult, legs THIGH + SHIN from hip to ankle).
   * Each leg spends the fraction `beta` of a cycle in stance: its flat foot moves backwards
   * relative to the hip at exactly the body's speed (2X per beta of a cycle), so it stays
   * still on the ground (no sliding); it rolls onto the heel at contact and over the toe at
   * push-off (ankle joint, J[15]). The cadence follows from the stride: f = v * beta / 2X, with a
   * floor (short strides when slow) and X capped by the leg's reach. The hip height follows
   * the stance leg (inverted pendulum when walking, compression + ballistic flight when
   * running), legs are solved by 2-bone IK to the ankle targets. */
  const LEG = THIGH + SHIN;
  const GP = { beta: 0.5, X: 0, lift: 0, thH: 0, thT: 0, kst: 0.98, cap: HIP_Y, run: false, f: 0, bump: 0 };
  const FA = { ax: 0, ay: 0, th: 0, c: 0 }, FB = { ax: 0, ay: 0, th: 0, c: 0 }, F0 = { ax: 0, ay: 0, th: 0 }, F1 = { ax: 0, ay: 0, th: 0 };
  function gaitParams(vt, run, wrapK, P) {
    P.run = run;
    if (run) {
      P.beta = clamp(0.36 - vt * 0.0016, 0.2, 0.34);
      P.X = Math.min(0.6 * LEG * wrapK, vt * P.beta / (2 * 2.2));
      P.lift = 2.1 * wrapK; P.thH = 0.12; P.thT = 0.8; P.kst = 0.935; P.cap = HIP_Y - 0.42; P.bump = 0.55;
    } else {
      P.beta = clamp(0.64 - vt * 0.0064, 0.34, 0.62);
      P.X = Math.min(0.6 * LEG * wrapK, vt * P.beta / (2 * 1.5));
      P.lift = 0.6 * wrapK; P.thH = 0.3 * wrapK; P.thT = 0.55 * wrapK; P.kst = 0.985; P.cap = HIP_Y - 0.2; P.bump = 0.08;
    }
    P.f = P.X > 0.01 ? vt * P.beta / (2 * P.X) : 0;
    P.lift *= clamp(P.X / 1.1, 0, 1);
    return P;
  }
  /** ankle position (x forward, y above the ground) and foot pitch th (+ toes up) of a foot whose
   *  flat-foot ankle would be at xr: th > 0 pivots on the heel, th < 0 on the toe */
  function rollFoot(xr, th, out) {
    const c = Math.cos(th), s = Math.sin(th);
    const px = th >= 0 ? xr - 0.42 : xr + 1.06, dx = th >= 0 ? 0.42 : -1.06, dy = ANK_Y;
    out.ax = px + dx * c - dy * s; out.ay = dx * s + dy * c; out.th = th;
    return out;
  }
  const sq = (x) => x * x;
  /** one foot at cycle position u in [0, 1): stance (c = 1) then swing */
  function footAt(u, P, out) {
    const X = P.X;
    if (u < P.beta) {
      const s = u / P.beta;
      let th = 0;
      if (s < 0.2) th = P.thH * sq(1 - s / 0.2);
      else if (s > 0.62) th = -P.thT * sq((s - 0.62) / 0.38);
      rollFoot(X - 2 * X * s, th, out); out.c = 1; out.s = s;
    } else {
      const s = (u - P.beta) / (1 - P.beta);
      rollFoot(-X, -P.thT, F0); rollFoot(X, P.thH, F1);
      // Hermite swing whose end tangents equal the stance speed: the foot leaves and meets the
      // ground moving with it (no skid at toe-off / heel strike), overshooting behind (heel kick)
      // and in front (reach) before it retracts onto the ground
      const m = -2 * X * (1 - P.beta) / P.beta, s2 = s * s, s3 = s2 * s;
      const e = (1 - Math.cos(Math.PI * s)) / 2;
      out.ax = (2 * s3 - 3 * s2 + 1) * F0.ax + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * F1.ax + (s3 - s2) * m;
      out.ay = F0.ay + (F1.ay - F0.ay) * s + P.lift * Math.sin(Math.PI * (P.run ? Math.pow(s, 0.7) : s));
      out.th = F0.th + (F1.th - F0.th) * e + (P.run ? -0.35 * Math.sin(Math.PI * s) : 0);
      out.c = 0; out.s = s;
    }
    return out;
  }
  /** highest the hip may be with this stance foot on the ground */
  function hipFor(F, P) {
    const k = P.run ? P.kst - 0.05 * Math.sin(Math.PI * F.s) : P.kst;
    const L = LEG * k, d = Math.min(Math.abs(F.ax), L * 0.995);
    return Math.min(P.cap, F.ay + Math.sqrt(L * L - d * d));
  }
  /** full-body gait pose for cycle position ph (cycles) */
  function gaitPose(j, ph, P, wrapK) {
    j[12] = j[13] = j[14] = j[16] = j[17] = 0;
    const uL = ph - Math.floor(ph), uR = (ph + 0.5) - Math.floor(ph + 0.5);
    footAt(uL, P, FA); footAt(uR, P, FB);
    let hy;
    if (FA.c || FB.c) hy = Math.min(FA.c ? hipFor(FA, P) : 99, FB.c ? hipFor(FB, P) : 99);
    else { // flight: from the push-off height to the landing height, a ballistic arc
      const h2 = ph * 2 - Math.floor(ph * 2), q = clamp((h2 * 0.5 - P.beta) / Math.max(0.01, 0.5 - P.beta), 0, 1);
      rollFoot(-P.X, -P.thT, F0); F0.s = 1; // the foot that pushed off, at the end of its stance
      rollFoot(P.X, P.thH, F1); F1.s = 0;   // the foot about to land
      const a = hipFor(F0, P), b = hipFor(F1, P);
      hy = a + (b - a) * q + 4 * P.bump * q * (1 - q);
    }
    const bob = hy - HIP_Y;
    legsTo(j, FA.ax, FA.ay - bob, FB.ax, FB.ay - bob);
    j[15] = encAnk(FA.th - j[0] - j[2], FB.th - j[1] - j[3]);
    // arms swing against the legs: forward when the opposite foot is forward
    const g = clamp(P.X / (0.6 * LEG), 0, 1), cs = Math.cos(TAU * ph);
    const aamp = (P.run ? 0.95 : 0.6) * g * (wrapK < 1 ? 0.8 : 1);
    j[4] = -cs * aamp; j[5] = cs * aamp;
    j[6] = P.run ? 1.45 + 0.25 * cs : 0.12 + 0.3 * g + 0.18 * Math.max(0, -cs) * g;
    j[7] = P.run ? 1.45 - 0.25 * cs : 0.12 + 0.3 * g + 0.18 * Math.max(0, cs) * g;
    j[8] = j[9] = 0.07 + 0.05 * g;
    j[10] = P.run ? 0.16 + 0.1 * g : 0.025 + 0.035 * g;
    j[11] = bob;
    return j;
  }
  /** standing still, weight a little on one leg */
  function poseStand(j, t, seed) {
    poseRest(j);
    const w = Math.sin(t * 0.37 + seed) * 0.5 + 0.5;
    const hy = HIP_Y - 0.06 - 0.04 * w;
    legsTo(j, 0.18 - 0.1 * w, ANK_Y - (hy - HIP_Y), -0.12 + 0.08 * w, ANK_Y - (hy - HIP_Y));
    j[11] = hy - HIP_Y;
    j[15] = encAnk(-j[0] - j[2], -j[1] - j[3]);
    return j;
  }
  const JS = new Float32Array(18);
  /** blend everything but the packed ankles (re-derived so feet stay flat) */
  function blendPose(j, from, k) {
    const af = decAnk(from[15]), aj = decAnk(j[15]);
    for (let i = 0; i < 15; i++) j[i] = from[i] + (j[i] - from[i]) * k;
    j[16] = (from[16] || 0) + ((j[16] || 0) - (from[16] || 0)) * k; j[17] = (from[17] || 0) + ((j[17] || 0) - (from[17] || 0)) * k;
    j[15] = encAnk(af[0] + (aj[0] - af[0]) * k, af[1] + (aj[1] - af[1]) * k);
  }

  /* ---------------------------------------------------------------- people pools + submission */
  let PEOPLE = null, PEOPLE_FAR = null, PERSON_MAT = null;
  const FR = new Frame(), FR2 = new Frame();
  let FRUST = null, FRUST_FRAME = -1, CAMP = null;
  function frustum() {
    if (FRUST_FRAME !== ST.frame) {
      FRUST_FRAME = ST.frame;
      const cam = H.camera;
      cam.updateMatrixWorld();
      if (!FRUST) { FRUST = new THREE.Frustum(); FRUST.m = new THREE.Matrix4(); FRUST.s = new THREE.Sphere(); }
      FRUST.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      FRUST.setFromProjectionMatrix(FRUST.m);
      CAMP = cam.position;
    }
    return FRUST;
  }
  /** is a sphere at world (x, h, y) with radius r worth drawing? (frustum, or close to the player for shadows) */
  // [terrain] the ground under (x, y) (terrain.js through view3d.js): things placed at a height above the ground
  // (vehicles, props, parked dressing) stand on it; H.elev(e) already includes it for entities
  const TH = (x, y) => (H.terrainAt ? H.terrainAt(x, y) : 0);
  function visible(x, h, y, r) {
    if (DBG.cam) return true;
    const f = frustum();
    f.s.center.set(x, h, y); f.s.radius = r;
    if (f.intersectsSphere(f.s)) return true;
    const p = N.player;
    if (H.quality.shadows && p && Math.abs(p.x - x) < 70 && Math.abs(p.y - y) < 70) return true;
    ST.culled++;
    return false;
  }
  function camDist(x, h, y) { if (!CAMP) frustum(); return Math.hypot(CAMP.x - x, CAMP.y - h, CAMP.z - y); }
  /** write one person instance: frame F (rotation + position of the root), local offset, scale, joints, look */
  function submitPerson(look, seed, fr, lx, ly, lz, j, o) {
    if (!PEOPLE) return -1;
    const s = lookSpec(look, seed);
    fr.apply(lx, ly, lz, P3);
    const sc = s.size * ((o && o.scale) || 1);
    if (!(o && o.noCull) && !visible(P3[0], P3[1] + 4.5 * sc, P3[2], 6 * sc + 2)) return -1;
    const d = camDist(P3[0], P3[1] + 5, P3[2]);
    const pool = d < 150 || (o && o.near) ? PEOPLE : PEOPLE_FAR;
    const i = pool.add();
    if (i < 0) return -1;
    fr.write(pool.M, i * 16, lx, ly, lz, o && o.yaw || 0, o && o.roll || 0, o && o.pitch || 0, sc * s.wide, sc, sc * s.wide);
    const A = pool.A;
    const a0 = A.iJ0.array, a1 = A.iJ1.array, a2 = A.iJ2.array, a3 = A.iJ3.array, fl = A.iFlags.array, ca = A.iColA.array, cb = A.iColB.array, k = i * 4;
    a3[k] = encAnk(j[12], j[13]); a3[k + 1] = encAnk(j[16] || 0, j[17] || 0); a3[k + 2] = j[14]; a3[k + 3] = j[15] || 0;
    a0[k] = j[0]; a0[k + 1] = j[1]; a0[k + 2] = j[2]; a0[k + 3] = j[3];
    a1[k] = j[4]; a1[k + 1] = j[5]; a1[k + 2] = j[6]; a1[k + 3] = j[7];
    a2[k] = j[8]; a2[k + 1] = j[9]; a2[k + 2] = j[10]; a2[k + 3] = j[11];
    const ff = o && o.seated ? s.fSeat : s.f;
    fl[k] = ff[0]; fl[k + 1] = ff[1]; fl[k + 2] = ff[2]; fl[k + 3] = ff[3] + (o && o.fpsHide ? Math.pow(2, BIT_FPS) : 0) + (o && o.fpsHide && o.armsOnly ? Math.pow(2, BIT_ARMS) : 0) + (o && o.fpsHide && o.noBody ? Math.pow(2, BIT_NOBODY) : 0);
    ca[k] = s.c[0]; ca[k + 1] = s.c[1]; ca[k + 2] = s.c[2]; ca[k + 3] = s.c[3];
    cb[k] = s.c[4]; cb[k + 1] = s.c[5]; cb[k + 2] = s.c[6]; cb[k + 3] = s.c[7];
    if (pool === PEOPLE) ST.people++; else ST.peopleFar++;
    if (!(o && o.noBlob)) {
      if (BLOBS) blob(P3[0], P3[2], 5.5 * sc, 5.5 * sc, 0, P3[1]);
      else if (pool === PEOPLE && !(o && o.seated)) blob(P3[0], P3[2], 3.4 * sc, 3.0 * sc, 0, P3[1]); // contact shadow under the feet
    }
    return i;
  }
  function initPeople() {
    PERSON_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
    PERSON_MAT.onBeforeCompile = personCompile;
    PERSON_MAT.customProgramCacheKey = () => 'nostalgia-person';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = personDepthCompile;
    depth.customProgramCacheKey = () => 'nostalgia-person-depth';
    const attrs = { iJ0: 4, iJ1: 4, iJ2: 4, iJ3: 4, iFlags: 4, iColA: 4, iColB: 4 };
    const gNear = buildPersonTemplate(0), gFar = buildPersonTemplate(1);
    ST.personVerts = [gNear.attributes.position.count, gFar.attributes.position.count];
    PEOPLE = new Pool('people', gNear, PERSON_MAT, 96, attrs, { depth, cast: true, max: 1024 });
    PEOPLE_FAR = new Pool('peopleFar', gFar, PERSON_MAT, 64, attrs, { max: 1024 });
  }

  /* ================================================================ VEHICLES */
  // vertex slots: 0 fixed colour, 1 paint (x vertex shade), 2 paint2 (x shade), 3 head lamp, 4 tail lamp,
  // 5 beacon red, 6 glass, 7 chrome, 8 beacon blue, 10 dial / meter (lit at night)
  const VP = 1, VP2 = 2, VHEAD = 3, VTAIL = 4, VBEACON = 5, VGLASS = 6, VCHROME = 7, VBEACON2 = 8, VLIT = 10;
  const DARK = '#1c1a1c', BLACK = '#121214', SEAT = '#1e1a1a', CHROMEC = '#c9cdd2', GLASSC = '#24303a', CREAM = '#efe6cf', RUBBER = '#2a2828';
  function vehicleCompile(shader) {
    shader.uniforms.uNight = H.uniforms.uNight; shader.uniforms.uHor = H.uniforms.uHor;
    if (H.lamps) H.lamps.apply(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSP;\nattribute vec3 aPiv;\nattribute vec4 iVA;\nattribute vec4 iVB;\nuniform float uNight;\nuniform vec3 uHor;\nvarying vec3 vEm;\n' + GLSL_UNPACK + GLSL_ROT)
      .replace('#include <beginnormal_vertex>', [
        '#include <beginnormal_vertex>',
        'vec3 vPos = vec3(position);',
        'if (aSP.y > 0.5 && aSP.y < 1.5) { vPos = aRotY(vPos, aPiv.xz, iVB.x); objectNormal = aRotY(objectNormal, vec2(0.0), iVB.x); }',
        'else if (aSP.y > 1.5 && aSP.y < 2.5) { vPos = aRotZ(vPos, aPiv.xy, iVB.y); objectNormal = aRotZ(objectNormal, vec2(0.0), iVB.y); }',
        // part 3: dial needles of the first-person interiors turn about x by iVB.w (the speedometer)
        'else if (aSP.y > 2.5 && aSP.y < 3.5) { vPos = aRotX(vPos, aPiv.yz, iVB.w); objectNormal = aRotX(objectNormal, vec2(0.0), iVB.w); }',
      ].join('\n'))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = vPos;')
      .replace('#include <color_vertex>', [
        '#include <color_vertex>',
        '{ float sl = aSP.x; vEm = vec3(0.0);',
        '  if (sl > 0.5) {',
        '    if (sl < 1.5) vColor = aUnpack(iVA.x) * vColor;',
        '    else if (sl < 2.5) vColor = aUnpack(iVA.y) * vColor;',
        '    else if (sl < 3.5) vEm = vColor * iVA.z * (0.12 + 2.8 * uNight);',
        '    else if (sl < 4.5) vEm = vec3(1.0, 0.07, 0.03) * (iVA.w * 1.6 + iVA.z * (0.1 + 1.2 * uNight));',
        '    else if (sl < 5.5) vEm = vec3(1.0, 0.1, 0.05) * mod(iVB.z, 2.0) * 3.0;',
        '    else if (sl < 6.5) vEm = uHor * 0.17 * (1.0 - uNight) + vec3(0.015, 0.02, 0.025);',
        '    else if (sl < 7.5) vEm = uHor * 0.12 * (1.0 - uNight * 0.7);',
        '    else if (sl < 8.5) vEm = vec3(0.1, 0.3, 1.0) * floor(iVB.z / 2.0 + 0.01) * 3.0;',
        '    else if (sl > 9.5 && sl < 10.5) vEm = vColor * uNight * 0.9;',
        '    else if (sl > 10.5 && sl < 11.5) { vColor = aUnpack(iVA.x) * vColor; vEm = vColor * (0.12 + 1.7 * uNight); }',
        '  } }',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEm;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEm;');
  }
  let VEH_MAT = null, WHEEL_MAT = null, GLASS_MAT = null;
  /** vehicle glass: the vehicle shader, translucent with a fresnel rise towards grazing angles */
  function glassCompile(shader) {
    vehicleCompile(shader);
    // iVB.w = 1 on the body the first-person camera sits in: seen from inside, the windscreen is
    // nearly clear (a faint tint and reflections at grazing angles), so the road ahead reads
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vIns;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvIns = iVB.w;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vIns;')
      .replace('#include <output_fragment>', [
        '{ vec3 vd = normalize(vViewPosition); float fr = 1.0 - abs(dot(normal, vd));',
        '  diffuseColor.a = vIns > 0.5 ? mix(0.05, 0.3, fr * fr) : mix(0.34, 0.94, fr * fr); }',
        '#include <output_fragment>',
      ].join('\n'));
  }
  const P1 = (b, k) => b.slot(VP).shade(k == null ? 1 : k);
  const P2 = (b, k) => b.slot(VP2).shade(k == null ? 1 : k);
  const FX = (b, hex) => b.slot(0).color(hex);
  const CH = (b) => b.slot(VCHROME).color(CHROMEC);
  const GL = (b) => b.slot(VGLASS).color(GLASSC);
  const HL = (b) => b.slot(VHEAD).color('#fff4d6');
  const TL = (b) => b.slot(VTAIL).color('#b8221a');
  /** glass (or any) panel inset inside the quad A-B-C-D (A, B bottom; D, C top), pushed out by off along n */
  function panel(b, A, B, C, D, iu0, iu1, iv0, iv1, off, n, ctr) {
    if (ctr) {
      const mx = (A[0] + B[0] + C[0] + D[0]) / 4 - ctr[0], my = (A[1] + B[1] + C[1] + D[1]) / 4 - ctr[1], mz = (A[2] + B[2] + C[2] + D[2]) / 4 - ctr[2];
      if (mx * n[0] + my * n[1] + mz * n[2] < 0) n = [-n[0], -n[1], -n[2]];
    }
    const P = (u, v) => {
      const x0 = A[0] + (B[0] - A[0]) * u, y0 = A[1] + (B[1] - A[1]) * u, z0 = A[2] + (B[2] - A[2]) * u;
      const x1 = D[0] + (C[0] - D[0]) * u, y1 = D[1] + (C[1] - D[1]) * u, z1 = D[2] + (C[2] - D[2]) * u;
      return [x0 + (x1 - x0) * v + n[0] * off, y0 + (y1 - y0) * v + n[1] * off, z0 + (z1 - z0) * v + n[2] * off];
    };
    return b.quadO(P(iu0, iv0), P(iu1, iv0), P(iu1, iv1), P(iu0, iv1), n[0], n[1], n[2]);
  }
  /** a quad face A B C D (u along A->B, v along A->D) minus rectangular holes [[u0, u1, v0, v1]], both sides */
  function frameFace(b, A, B, C, D, holes) {
    const P = (u, v) => {
      const x0 = A[0] + (B[0] - A[0]) * u, y0 = A[1] + (B[1] - A[1]) * u, z0 = A[2] + (B[2] - A[2]) * u;
      const x1 = D[0] + (C[0] - D[0]) * u, y1 = D[1] + (C[1] - D[1]) * u, z1 = D[2] + (C[2] - D[2]) * u;
      return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v, z0 + (z1 - z0) * v];
    };
    const us = [0, 1], vs = [0, 1];
    for (const h of holes) { us.push(h[0], h[1]); vs.push(h[2], h[3]); }
    const U = [...new Set(us)].sort((p, q) => p - q), V = [...new Set(vs)].sort((p, q) => p - q);
    for (let i = 0; i + 1 < U.length; i++) for (let j = 0; j + 1 < V.length; j++) {
      const mu = (U[i] + U[i + 1]) / 2, mv = (V[j] + V[j + 1]) / 2;
      if (holes.some((h) => mu > h[0] && mu < h[1] && mv > h[2] && mv < h[3])) continue;
      b.quad2(P(U[i], V[j]), P(U[i + 1], V[j]), P(U[i + 1], V[j + 1]), P(U[i], V[j + 1]));
    }
    return b;
  }
  function faceN(A, B, D) {
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], wx = D[0] - A[0], wy = D[1] - A[1], wz = D[2] - A[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }
  /** dark wheel-arch half discs on both flanks */
  function arches(b, wheels, hw, yMax) {
    FX(b, '#141214');
    for (const w of wheels) for (const s of [-1, 1]) {
      const r = w.r + 0.55, cx = w.x, cy = w.r, z = s * (hw + 0.03), n = 9;
      const c0 = b.vert(cx, cy, z, 0, 0, s);
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; b.vert(cx + Math.cos(a) * r, Math.min(yMax || 99, cy + Math.sin(a) * r), z, 0, 0, s); }
      for (let i = 0; i < n; i++) { if (s > 0) b.tri(c0, c0 + 1 + i, c0 + 2 + i); else b.tri(c0, c0 + 2 + i, c0 + 1 + i); }
    }
  }

  const MODELS = {};
  function defModel(key, fn) { MODELS[key] = { key, fn, md: null }; }
  /** move the glass triangles (slot VGLASS) of a vehicle geometry into their own index (drawn
   *  translucent so drivers and passengers show through); returns that index or null */
  function splitGlass(g) {
    const sp = g.attributes.aSP.array, idx = g.index.array, keep = [], glass = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const isG = Math.abs(sp[a * 3] - 6) < 0.5 && Math.abs(sp[b * 3] - 6) < 0.5 && Math.abs(sp[c * 3] - 6) < 0.5;
      (isG ? glass : keep).push(a, b, c);
    }
    if (!glass.length) return null;
    const big = g.attributes.position.count > 65535;
    g.setIndex(big ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
    return big ? new THREE.Uint32BufferAttribute(glass, 1) : new THREE.Uint16BufferAttribute(glass, 1);
  }
  function model(key) {
    const m = MODELS[key] || MODELS.ambassador;
    if (!m.md) {
      const b = new AB();
      const meta = m.fn(b) || {};
      meta.key = m.key; meta.geo = b.build(); meta.verts = b.count; meta.pool = null;
      meta.glassIndex = splitGlass(meta.geo);
      meta.L = meta.L || 20; meta.W = meta.W || 8; meta.H = meta.H || 8;
      meta.wheels = meta.wheels || []; meta.seats = meta.seats || []; meta.lamps = meta.lamps || { head: [], tail: [] };
      meta.decals = meta.decals || [];
      m.md = meta;
    }
    return m.md;
  }

  /* ---------------------------------------------------------------- two-wheelers */
  /** pedal cycles: o {L, R, inset, W, ladies, carrier, guard, chainGuard, dynamo, basket, bar: 'swept'|'flat', fat, saddle, sprung, kid} */
  function mkCycle(b, o) {
    const L = o.L, R = o.R, rx = -L / 2 + o.inset, fx = L / 2 - o.inset;
    const bbX = rx + (fx - rx) * 0.43, bbY = R * 0.76;
    const sY = o.saddle || bbY + 2.9, sX = bbX - 1.32;
    const ht = [fx - 1.45, sY + 0.1], hb = [fx - 1.12, bbY + 1.7];
    const tr = o.tube || 0.19;
    const cl = [sX + 0.3, sY - 0.7];
    b.part(0); P1(b);
    b.tube([bbX, bbY, 0], [cl[0], cl[1], 0], tr);
    if (o.ladies) {
      b.tube([bbX, bbY + 0.15, 0], [hb[0] - 1.6, bbY + 0.75, 0], tr * 1.05).tube([hb[0] - 1.6, bbY + 0.75, 0], [hb[0] + 0.05, hb[1] + 0.1, 0], tr * 1.05);
      b.tube([bbX + 0.25, bbY + 0.75, 0], [hb[0] - 1.2, bbY + 1.25, 0], tr * 0.9).tube([hb[0] - 1.2, bbY + 1.25, 0], [ht[0] + 0.05, ht[1] - 0.6, 0], tr * 0.9);
    } else {
      b.tube([cl[0], cl[1] + 0.05, 0], [ht[0], ht[1] - 0.45, 0], tr);
      b.tube([bbX, bbY, 0], [hb[0], hb[1], 0], tr * 1.12);
    }
    b.tube([hb[0], hb[1] - 0.2, 0], [ht[0], ht[1] + 0.05, 0], 0.27, 6);
    for (const s of [-1, 1]) {
      b.tube([bbX, bbY, s * 0.28], [rx, R, s * 0.33], 0.12, 4);
      b.tube([cl[0], cl[1], s * 0.15], [rx, R, s * 0.33], 0.11, 4);
    }
    // bottom bracket shell, seat post, saddle
    FX(b, DARK).cyl([bbX, bbY, -0.38], [bbX, bbY, 0.38], 0.32, 0.32, 8, 3);
    CH(b).tube([cl[0], cl[1], 0], [sX + 0.12, sY - 0.25, 0], 0.12);
    FX(b, o.saddleCol || '#3a2418').hexa([[sX - 0.9, sY - 0.32, -0.62], [sX + 1.15, sY - 0.25, -0.18], [sX + 1.15, sY - 0.25, 0.18], [sX - 0.9, sY - 0.32, 0.62], [sX - 0.95, sY + 0.08, -0.66], [sX + 1.2, sY + 0.02, -0.2], [sX + 1.2, sY + 0.02, 0.2], [sX - 0.95, sY + 0.08, 0.66]]);
    if (o.sprung) { CH(b); for (const s of [-1, 1]) b.cyl([sX - 0.7, sY - 0.95, s * 0.42], [sX - 0.7, sY - 0.32, s * 0.42], 0.15, 0.15, 6, 0); }
    // rear mudguard + reflector, carrier, chain guard
    if (o.guard) { FX(b, o.guard).arc(rx, R, R + 0.32, Math.PI * 0.12, Math.PI * 0.98, 0.34, 9, 0.1); }
    FX(b, '#c0281e').box(rx - R - 0.45, R + 0.6, -0.18, rx - R - 0.3, R + 0.95, 0.18);
    if (o.carrier) {
      CH(b);
      const cy = R * 2 + 0.3;
      for (const s of [-1, 1]) { b.tube([rx - R + 0.2, cy, s * 0.62], [cl[0] - 0.25, cy, s * 0.62], 0.09, 4); b.tube([rx - 0.2, cy, s * 0.62], [rx, R, s * 0.36], 0.08, 4); }
      for (let k = 0; k < 5; k++) { const x = rx - R + 0.4 + k * ((cl[0] - rx + R - 0.8) / 4); b.tube([x, cy, -0.62], [x, cy, 0.62], 0.07, 4); }
    }
    if (o.chainGuard) { FX(b, o.chainGuard).box(rx + 0.4, bbY - 0.5, 0.36, bbX + 1.0, bbY + 0.5, 0.44); }
    // crank: chainring + crank arms + pedals (part 2, pivot at the bottom bracket)
    b.part(2, [bbX, bbY, 0]);
    CH(b).cyl([bbX, bbY, 0.44], [bbX, bbY, 0.52], 1.0, 1.0, 12, 3);
    CH(b).tube([bbX, bbY, 0.56], [bbX + 1.05, bbY, 0.6], 0.12).tube([bbX, bbY, -0.56], [bbX - 1.05, bbY, -0.6], 0.12);
    FX(b, '#2a2626').box(bbX + 0.8, bbY - 0.12, 0.62, bbX + 1.35, bbY + 0.12, 1.15).box(bbX - 1.35, bbY - 0.12, -1.15, bbX - 0.8, bbY + 0.12, -0.62);
    // steering: fork, stem, bar, grips, bell, (basket, dynamo lamp, front guard)
    b.part(1, [hb[0], 0, 0]);
    CH(b);
    for (const s of [-1, 1]) b.tube([hb[0] + 0.02, hb[1] - 0.15, s * 0.22], [fx, R, s * 0.33], 0.11, 4);
    const bx = ht[0] - 0.05, by = sY + (o.barH || 0.75);
    b.tube([ht[0], ht[1], 0], [bx, by, 0], 0.13, 5);
    let grip;
    if (o.bar === 'flat') {
      FX(b, DARK).tube([bx + 0.1, by, -2.0], [bx + 0.1, by, 2.0], 0.13, 5);
      FX(b, o.grips || '#1a1a1e'); for (const s of [-1, 1]) b.cyl([bx + 0.1, by, s * 1.5], [bx + 0.1, by, s * 2.1], 0.2, 0.2, 6, 3);
      grip = [bx + 0.1, by, 1.8];
    } else {
      CH(b);
      for (const s of [-1, 1]) { b.tube([bx, by, 0], [bx + 0.15, by + 0.05, s * 0.85], 0.12, 4).tube([bx + 0.15, by + 0.05, s * 0.85], [bx - 0.85, by - 0.1, s * 1.7], 0.12, 4); }
      FX(b, o.grips || '#e9e2cf'); for (const s of [-1, 1]) b.cyl([bx - 0.7, by - 0.08, s * 1.6], [bx - 1.25, by - 0.14, s * 1.95], 0.2, 0.2, 6, 3);
      grip = [bx - 0.95, by - 0.1, 1.75];
    }
    CH(b).cyl([bx + 0.05, by + 0.08, -0.9], [bx + 0.05, by + 0.32, -0.9], 0.28, 0.24, 8, 2);
    if (o.basket) { FX(b, '#b0864a').box(fx - 1.75, sY - 0.55, -1.05, fx - 0.15, sY + 0.55, 1.05); FX(b, '#8a6a3a').box(fx - 1.65, sY + 0.5, -0.95, fx - 0.25, sY + 0.56, 0.95); }
    if (o.guard) FX(b, o.guard).arc(fx, R, R + 0.32, Math.PI * 0.05, Math.PI * 0.82, 0.34, 8, 0.1);
    const lamps = { head: [], tail: [] };
    if (o.dynamo) { HL(b).cyl([fx - 0.55, R * 1.62, -0.5], [fx - 0.05, R * 1.62, -0.5], 0.3, 0.38, 8, 3); lamps.head.push([fx, R * 1.62, -0.5]); }
    b.part(0);
    const seats = [{ x: sX - 0.1, y: sY + 0.05, z: 0, pose: 'cycle', grip, kidDrop: o.kid ? 0 : 0.45 }];
    if (o.carrier) seats.push({ x: rx - 0.4, y: R * 2 + 0.55, z: 0, pose: 'pillion', foot: [rx + 1.2, R * 0.9] });
    return {
      L, W: o.W || 5, H: by + 0.5, bike: true, pedal: true, show: true, steerX: hb[0], crank: [bbX, bbY, 1.05], rearR: R,
      wheels: [{ x: rx, z: 0, r: R, w: o.fat ? 0.8 : 0.42, kind: 'spoke' }, { x: fx, z: 0, r: R, w: o.fat ? 0.8 : 0.42, kind: 'spoke', front: true }],
      seats, lamps, standLean: 0.2,
    };
  }
  defModel('cycle', (b) => mkCycle(b, { L: 15, R: 2.95, inset: 3, guard: '#1d1d22', bar: 'swept', carrier: true, sprung: true }));
  defModel('ladies', (b) => mkCycle(b, { L: 15, R: 2.95, inset: 3, ladies: true, guard: '#e8e2d8', bar: 'swept', basket: true, grips: '#f0e0e8', saddleCol: '#4a2a2a' }));
  defModel('hero', (b) => mkCycle(b, { L: 16, R: 3.05, inset: 3, guard: '#121214', bar: 'swept', carrier: true, chainGuard: '#121214', dynamo: true, sprung: true }));
  defModel('hero_low', (b) => mkCycle(b, { L: 16, R: 3.05, inset: 3, guard: '#121214', bar: 'swept', carrier: true, chainGuard: '#121214', dynamo: true, sprung: true, saddle: 4.9, kid: true }));
  defModel('hercules', (b) => mkCycle(b, { L: 14.5, R: 2.9, inset: 2.9, bar: 'flat', fat: true, tube: 0.23, grips: '#1a1a1e', saddleCol: '#18181c', W: 5.5 }));
  defModel('kid', (b) => mkCycle(b, { L: 13.5, R: 2.35, inset: 2.5, bar: 'swept', grips: '#d8402a', saddle: 4.15, kid: true, guard: '#e8e2d8' }));

  /** scooters (Chetak, Scooty, Lambretta): o {L, W, R, rx, fx, cowl:[x, y, rx, ry, rz], floor:[x0, x1, y, hw], shield:[x, y0, y1, hw0, hw1],
   *  seat:[x0, x1, y0, y1, hw], tail:[x, y], bar:[x, y, hw], steerX, spare, sidecar} */
  function mkScooter(b, o) {
    const R = o.R, c = o.cowl, fl = o.floor, sh = o.shield, se = o.seat, ba = o.bar;
    b.part(0);
    P1(b).ell(c[0], c[1], 0, c[2], c[3], c[4], 14, 8, { lat0: -0.42 });
    P1(b, 0.82).ell(c[0] - c[2] * 0.15, c[1] + c[3] * 0.1, 0, c[2] * 0.9, c[3] * 0.85, c[4] * 0.6, 10, 5, { lat0: 0.3 });
    FX(b, DARK).box(c[0] - c[2] * 0.75, R * 0.55, -c[4] * 0.55, c[0] + c[2] * 0.75, c[1] - c[3] * 0.3, c[4] * 0.55);
    P1(b, 0.92).box(fl[0], fl[2] - 0.45, -fl[3], fl[1], fl[2], fl[3]);
    FX(b, '#2a2a2a'); for (let k = -2; k <= 2; k++) b.box(fl[0] + 0.3, fl[2], k * fl[3] * 0.33 - 0.1, fl[1] - 0.3, fl[2] + 0.06, k * fl[3] * 0.33 + 0.1);
    // leg shield / apron
    P1(b).hexa([[sh[0], sh[1], -sh[3]], [sh[0] + 0.55, sh[1], -sh[3]], [sh[0] + 0.55, sh[1], sh[3]], [sh[0], sh[1], sh[3]],
      [sh[0] + 0.35, sh[2], -sh[4]], [sh[0] + 0.85, sh[2], -sh[4]], [sh[0] + 0.85, sh[2], sh[4]], [sh[0] + 0.35, sh[2], sh[4]]]);
    CH(b).cyl([sh[0] + 0.6, sh[1] + (sh[2] - sh[1]) * 0.55, 0], [sh[0] + 0.72, sh[1] + (sh[2] - sh[1]) * 0.55, 0], 0.32, 0.3, 8, 2);
    // seat + tail lamp + number plate holder
    FX(b, SEAT).tbox(se[0], se[2], -se[4], se[1], se[3], se[4], 0.25, 0.18, 0);
    TL(b).box(o.tail[0] - 0.12, o.tail[1] - 0.28, -0.42, o.tail[0] + 0.08, o.tail[1] + 0.28, 0.42);
    if (o.spare) { FX(b, '#1c1a1c').xf(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(o.spare[0], o.spare[1], 0)).ringZ([[1.25, -0.35], [1.6, -0.3], [1.6, 0.3], [1.25, 0.35]], 12).xf(null); CH(b).cyl([o.spare[0] - 0.36, o.spare[1], 0], [o.spare[0] - 0.2, o.spare[1], 0], 0.6, 0.6, 8, 1); }
    if (o.sidecar) {
      const sc = o.sidecar;
      P1(b).ell(sc[0], sc[1], sc[2], sc[3], sc[4], sc[5], 12, 6, { lat0: -0.3 });
      FX(b, '#1a1a1e').ell(sc[0] - sc[3] * 0.2, sc[1] + sc[4] * 0.5, sc[2], sc[3] * 0.5, sc[4] * 0.4, sc[5] * 0.6, 8, 4);
      FX(b, '#1c1a1c').xf(new THREE.Matrix4().makeTranslation(sc[0] - 0.5, R, sc[2] + sc[5] * 0.6)).ringZ([[R * 0.7, -0.3], [R, -0.3], [R, 0.3], [R * 0.7, 0.3]], 10).xf(null);
      CH(b).tube([sc[0], R + 1, 0.8], [sc[0], R + 1, sc[2]], 0.12);
      FX(b, '#3a3a3a').box(sc[0] - 1.2, sc[1] + sc[4] * 0.6, sc[2] - 0.8, sc[0] + 0.2, sc[1] + sc[4] * 0.6 + 0.9, sc[2] + 0.6);
    }
    // steering: front mudguard, link, bar housing, headlamp, grips, mirrors
    b.part(1, [o.steerX, 0, 0]);
    P1(b).ell(o.fx, R + 0.1, 0, R * 0.95, R * 0.8, Math.max(0.75, R * 0.48), 10, 5, { lat0: 0 });
    FX(b, DARK).tube([o.steerX + 0.1, fl[2] + 0.8, -0.45], [o.fx, R, -0.5], 0.17, 5).tube([o.steerX + 0.15, sh[2] - 0.3, 0], [o.steerX + 0.05, fl[2] + 0.8, 0], 0.2, 5);
    P1(b).tbox(ba[0] - 0.75, ba[1] - 0.5, -ba[2] * 0.48, ba[0] + 0.8, ba[1] + 0.22, ba[2] * 0.48, 0.15, 0.12, 0);
    const gb = o.gripBack || 0;
    FX(b, DARK).tube([ba[0], ba[1] - 0.1, -ba[2] * 0.48], [ba[0] - gb, ba[1] - 0.1, -ba[2]], 0.13).tube([ba[0], ba[1] - 0.1, ba[2] * 0.48], [ba[0] - gb, ba[1] - 0.1, ba[2]], 0.13);
    FX(b, '#1a1a1e'); for (const s of [-1, 1]) b.cyl([ba[0] - gb * 0.75, ba[1] - 0.1, s * ba[2] * 0.82], [ba[0] - gb - 0.1, ba[1] - 0.1, s * (ba[2] + 0.35)], 0.21, 0.21, 6, 3);
    HL(b).cyl([ba[0] + 0.72, ba[1] - 0.12, 0], [ba[0] + 0.92, ba[1] - 0.12, 0], 0.42, 0.42, 10, 2);
    CH(b).cyl([ba[0] + 0.68, ba[1] - 0.12, 0], [ba[0] + 0.78, ba[1] - 0.12, 0], 0.52, 0.5, 10, 0);
    FX(b, '#141418').box(ba[0] - 0.3, ba[1] + 0.22, -0.45, ba[0] + 0.35, ba[1] + 0.32, 0.45);
    // speedometer set into the headset top (what the rider sees between the grips in first person)
    FX(b, '#2a2a2e').cyl([ba[0] + 0.02, ba[1] + 0.3, 0], [ba[0] + 0.02, ba[1] + 0.36, 0], 0.34, 0.32, 14, 2);
    b.slot(VLIT).color('#efe6c8').cyl([ba[0] + 0.02, ba[1] + 0.36, 0], [ba[0] + 0.02, ba[1] + 0.38, 0], 0.27, 0.27, 14, 2);
    FX(b, '#1a1616'); for (let k = 0; k <= 6; k++) { const a = Math.PI * (0.15 + k * 0.7 / 6) + Math.PI / 2; b.box(ba[0] + 0.02 + Math.cos(a) * 0.21 - 0.02, ba[1] + 0.38, Math.sin(a) * 0.21 - 0.02, ba[0] + 0.02 + Math.cos(a) * 0.21 + 0.02, ba[1] + 0.395, Math.sin(a) * 0.21 + 0.02); }
    FX(b, '#e0501c').tube([ba[0] + 0.02, ba[1] + 0.395, 0], [ba[0] - 0.1, ba[1] + 0.395, -0.17], 0.025, 3);
    // mirrors: chrome backs with dark glass faces towards the rider
    for (const s of [-1, 1]) {
      CH(b).tube([ba[0] - 0.1, ba[1], s * ba[2] * 0.62], [ba[0] - 0.25, ba[1] + 1.1, s * ba[2] * 0.8], 0.06, 4).ell(ba[0] - 0.25, ba[1] + 1.25, s * ba[2] * 0.8, 0.08, 0.28, 0.35, 10, 5);
      FX(b, '#4a5864').ell(ba[0] - 0.3, ba[1] + 1.25, s * ba[2] * 0.8, 0.05, 0.23, 0.29, 10, 5);
    }
    b.part(0);
    return {
      L: o.L, W: o.W, H: ba[1] + 1.4, bike: true, show: true, steerX: o.steerX, rearR: R,
      wheels: [{ x: o.rx, z: 0, r: R, w: 0.95, kind: 'solid' }, { x: o.fx, z: 0, r: R, w: 0.95, kind: 'solid', front: true }],
      seats: [
        { x: se[1] - 0.55, y: se[3], z: 0, pose: 'scooter', grip: [ba[0] - (o.gripBack || 0) - 0.05, ba[1] - 0.1, ba[2] * 0.95], foot: [fl[0] + (fl[1] - fl[0]) * 0.5, fl[2] + 0.05] },
        { x: se[0] + 1.3, y: se[3] + 0.05, z: 0, pose: 'pillion', foot: [c[0] + c[2] * 0.75, R * 0.95] },
      ],
      lamps: { head: [[ba[0] + 0.95, ba[1] - 0.12, 0]], tail: [[o.tail[0] - 0.1, o.tail[1], 0]] },
      standLean: 0.0,
    };
  }
  defModel('chetak', (b) => mkScooter(b, { L: 17, W: 7, R: 1.85, rx: -4.9, fx: 4.7, cowl: [-3.7, 3.0, 2.8, 1.75, 2.4], floor: [-0.6, 2.9, 1.3, 1.65], shield: [2.9, 0.95, 5.8, 1.85, 1.3], seat: [-5.6, -0.4, 4.55, 5.15, 1.0], tail: [-6.45, 3.9], bar: [3.35, 6.6, 2.9], steerX: 3.2, spare: [-7.0, 2.3], gripBack: 0.9 }));
  defModel('scooty', (b) => mkScooter(b, { L: 14.5, W: 5.6, R: 1.55, rx: -4.4, fx: 4.2, cowl: [-2.7, 2.55, 2.35, 1.35, 1.5], floor: [-0.3, 2.25, 1.05, 1.3], shield: [2.25, 0.85, 4.8, 1.35, 1.0], seat: [-4.4, -0.2, 3.85, 4.38, 0.85], tail: [-5.0, 3.4], bar: [2.75, 5.4, 2.2], steerX: 2.6, gripBack: 0.8 }));
  defModel('lambretta', (b) => mkScooter(b, { L: 17, W: 7, R: 1.85, rx: -4.9, fx: 4.7, cowl: [-3.6, 3.0, 2.9, 1.7, 2.3], floor: [-0.6, 2.9, 1.3, 1.65], shield: [2.9, 0.95, 5.7, 1.8, 1.3], seat: [-5.6, -0.4, 4.55, 5.15, 1.0], tail: [-6.45, 3.9], bar: [3.35, 6.6, 2.9], steerX: 3.2, gripBack: 0.9, sidecar: [-1.0, 3.0, 6.2, 5.0, 1.9, 2.0] }));

  /** mopeds and motorcycles */
  function mkLuna(b, police) {
    const R = 2.3, rx = -4.6, fx = 4.6, hx = 2.9, hy = 5.4;
    b.part(0);
    P1(b).tube([hx, hy, 0], [1.4, 2.6, 0], 0.36, 7).tube([1.4, 2.6, 0], [-0.6, 1.9, 0], 0.36, 7).tube([-0.6, 1.9, 0], [-1.9, 3.3, 0], 0.32, 7);
    P1(b, 0.9).ell(-1.0, 3.75, 0, 1.0, 0.7, 0.62, 8, 5);
    FX(b, '#8a8a8e').box(-3.3, 1.55, -0.55, -0.9, 2.75, 0.55); FX(b, '#5a5a60').box(-3.2, 2.5, 0.5, -1.0, 3.0, 0.62);
    FX(b, SEAT).tbox(-2.6, 4.25, -0.75, 0.0, 4.85, 0.75, 0.3, 0.15, 0);
    CH(b).tube([-1.2, 3.3, 0], [-1.1, 4.25, 0], 0.12);
    CH(b); for (const s of [-1, 1]) { b.tube([-3.6, R * 2 + 0.2, s * 0.6], [-1.6, 4.0, s * 0.6], 0.08, 4).tube([rx, R, s * 0.35], [-3.5, R * 2 + 0.2, s * 0.6], 0.08, 4); }
    for (let k = 0; k < 4; k++) b.tube([-5.6 + k * 0.6, R * 2 + 0.2, -0.6], [-5.6 + k * 0.6, R * 2 + 0.2, 0.6], 0.06, 4);
    CH(b).tube([-5.8, R * 2 + 0.2, -0.6], [-3.5, R * 2 + 0.2, -0.6], 0.07, 4).tube([-5.8, R * 2 + 0.2, 0.6], [-3.5, R * 2 + 0.2, 0.6], 0.07, 4);
    FX(b, '#1c1a1c').arc(rx, R, R + 0.3, Math.PI * 0.15, Math.PI * 0.9, 0.36, 8, 0.1);
    TL(b).box(-6.0, R * 2 - 0.15, -0.3, -5.85, R * 2 + 0.2, 0.3);
    if (police) { b.slot(VBEACON).color('#ff3020').box(-5.4, R * 2 + 0.3, -0.62, -4.4, R * 2 + 0.8, -0.05); b.slot(VBEACON2).color('#2050ff').box(-5.4, R * 2 + 0.3, 0.05, -4.4, R * 2 + 0.8, 0.62); }
    for (const s of [-1, 1]) FX(b, DARK).tube([-0.2, 1.9, s * 0.25], [rx, R, s * 0.35], 0.12, 4);
    b.part(2, [-0.4, 1.9, 0]);
    CH(b).tube([-0.4, 1.9, 0.62], [0.55, 1.9, 0.62], 0.11).tube([-0.4, 1.9, -0.62], [-1.35, 1.9, -0.62], 0.11);
    FX(b, '#2a2626').box(0.35, 1.78, 0.68, 0.85, 2.02, 1.1).box(-1.65, 1.78, -1.1, -1.15, 2.02, -0.68);
    b.part(1, [hx, 0, 0]);
    CH(b); for (const s of [-1, 1]) b.tube([hx + 0.05, hy, s * 0.32], [fx, R, s * 0.36], 0.14, 5);
    FX(b, '#1c1a1c').arc(fx, R, R + 0.3, Math.PI * 0.08, Math.PI * 0.75, 0.36, 7, 0.1);
    CH(b).tube([hx, hy, 0], [hx - 0.1, 6.5, 0], 0.13);
    for (const s of [-1, 1]) CH(b).tube([hx - 0.1, 6.5, 0], [hx - 0.25, 6.55, s * 0.9], 0.12, 4).tube([hx - 0.25, 6.55, s * 0.9], [hx - 0.75, 6.5, s * 1.6], 0.12, 4);
    FX(b, '#1a1a1e'); for (const s of [-1, 1]) b.cyl([hx - 0.65, 6.5, s * 1.5], [hx - 0.95, 6.5, s * 2.05], 0.2, 0.2, 6, 3);
    HL(b).cyl([hx + 0.25, 6.05, 0], [hx + 0.75, 6.05, 0], 0.42, 0.45, 10, 3); CH(b).cyl([hx + 0.1, 6.05, 0], [hx + 0.5, 6.05, 0], 0.48, 0.5, 10, 0);
    b.part(0);
    return {
      L: 15, W: 5.5, H: 7.2, bike: true, show: true, steerX: hx, crank: [-0.4, 1.9, 0.95], rearR: R, pedal: true,
      wheels: [{ x: rx, z: 0, r: R, w: 0.5, kind: 'spoke' }, { x: fx, z: 0, r: R, w: 0.5, kind: 'spoke', front: true }],
      seats: [{ x: -0.7, y: 4.85, z: 0, pose: 'scooter', grip: [hx - 0.8, 6.5, 1.8], foot: [0.9, 1.95] }, { x: -4.4, y: R * 2 + 0.45, z: 0, pose: 'pillion', foot: [-2.6, 1.6] }],
      lamps: { head: [[hx + 0.8, 6.05, 0]], tail: [[-6.0, R * 2, 0]] }, police: !!police, standLean: 0.2,
    };
  }
  defModel('luna', (b) => mkLuna(b, false));
  defModel('luna_police', (b) => mkLuna(b, true));
  defModel('rx100', (b) => {
    const R = 2.55, rx = -6.0, fx = 6.1, hx = 4.1, hy = 5.9;
    b.part(0);
    P1(b).ell(2.2, 5.25, 0, 1.75, 0.78, 0.98, 12, 6);
    P2(b).ell(2.4, 5.3, 0, 0.8, 0.42, 1.0, 8, 4);
    FX(b, SEAT).tbox(-3.4, 4.6, -0.85, 0.6, 5.2, 0.85, 0.35, 0.12, 0.1);
    P1(b, 0.85).box(-2.4, 3.4, -0.98, -0.2, 4.6, 0.98);
    FX(b, '#9a9ca0').box(-1.3, 1.5, -0.85, 2.4, 3.6, 0.85);
    FX(b, '#5a5c60'); for (let k = 0; k < 5; k++) b.box(1.2, 2.5 + k * 0.32, -0.95, 2.6, 2.62 + k * 0.32, 0.95);
    FX(b, DARK).tube([hx, hy, 0], [1.6, 3.4, 0], 0.22).tube([hx - 0.2, hy - 0.2, 0], [-0.8, 4.5, 0], 0.2).tube([-0.8, 4.5, 0], [-4.4, 4.7, 0], 0.18);
    for (const s of [-1, 1]) FX(b, DARK).tube([-0.6, 2.0, s * 0.35], [rx, R, s * 0.38], 0.15, 4).tube([-3.6, 4.6, s * 0.45], [rx + 0.2, R + 0.1, s * 0.4], 0.13, 4);
    CH(b).tube([2.4, 2.6, 0.75], [1.4, 1.35, 1.05], 0.22).tube([1.4, 1.35, 1.05], [-3.6, 1.6, 1.1], 0.22).cyl([-3.6, 1.65, 1.1], [-6.6, 2.2, 1.1], 0.35, 0.32, 8, 3);
    CH(b).arc(rx, R, R + 0.32, Math.PI * 0.2, Math.PI * 0.92, 0.42, 8, 0.1);
    TL(b).box(-6.85, 4.0, -0.38, -6.6, 4.5, 0.38);
    FX(b, '#2a2626').box(0.2, 1.85, 1.0, 1.1, 2.05, 1.55).box(0.2, 1.85, -1.55, 1.1, 2.05, -1.0);
    b.part(1, [hx, 0, 0]);
    CH(b); for (const s of [-1, 1]) b.tube([hx + 0.05, hy + 0.2, s * 0.4], [fx, R, s * 0.42], 0.16, 6);
    CH(b).arc(fx, R, R + 0.3, Math.PI * 0.12, Math.PI * 0.72, 0.42, 7, 0.1);
    for (const s of [-1, 1]) FX(b, DARK).tube([hx - 0.1, hy + 0.9, 0], [hx - 0.25, hy + 0.95, s * 1.0], 0.13, 4).tube([hx - 0.25, hy + 0.95, s * 1.0], [hx - 0.75, hy + 0.85, s * 1.7], 0.13, 4);
    FX(b, '#1a1a1e'); for (const s of [-1, 1]) b.cyl([hx - 0.65, hy + 0.85, s * 1.55], [hx - 0.95, hy + 0.85, s * 2.2], 0.21, 0.21, 6, 3);
    FX(b, '#141418').cyl([hx - 0.2, hy + 0.8, -0.5], [hx - 0.2, hy + 1.2, -0.5], 0.3, 0.3, 8, 2).cyl([hx - 0.2, hy + 0.8, 0.5], [hx - 0.2, hy + 1.2, 0.5], 0.3, 0.3, 8, 2);
    CH(b).cyl([hx + 0.4, hy + 0.3, 0], [hx + 1.0, hy + 0.3, 0], 0.55, 0.62, 10, 1); HL(b).cyl([hx + 1.0, hy + 0.3, 0], [hx + 1.08, hy + 0.3, 0], 0.55, 0.55, 10, 2);
    b.part(0);
    return {
      L: 18, W: 6, H: 7.8, bike: true, show: true, steerX: hx, rearR: R,
      wheels: [{ x: rx, z: 0, r: R, w: 0.62, kind: 'spoke' }, { x: fx, z: 0, r: R, w: 0.55, kind: 'spoke', front: true }],
      seats: [{ x: -0.1, y: 5.2, z: 0, pose: 'moto', grip: [hx - 0.8, hy + 0.85, 1.9], foot: [0.6, 2.05] }, { x: -2.3, y: 5.25, z: 0, pose: 'pillion', foot: [-1.4, 2.4] }],
      lamps: { head: [[hx + 1.1, hy + 0.3, 0]], tail: [[-6.85, 4.25, 0]] }, standLean: 0.2,
    };
  });

  /* ---------------------------------------------------------------- auto-rickshaw */
  defModel('auto', (b) => {
    const tub = [[11, -2.4], [11, 2.4], [6.5, 5.6], [-10.4, 6.3], [-11, 4.6], [-11, -4.6], [-10.4, -6.3], [6.5, -5.6]];
    b.part(0);
    P2(b).prism(tub, 1.35, 2.5, { bottom: true });
    FX(b, '#141214'); for (const s of [-1, 1]) { const z = s * 6.24; const c0 = b.vert(-6.4, 1.2, z, 0, 0, s); for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; b.vert(-6.4 + Math.cos(a) * 2.2, Math.min(2.45, 1.2 + Math.sin(a) * 2.2), z, 0, 0, s); } for (let i = 0; i < 8; i++) { if (s > 0) b.tri(c0, c0 + 1 + i, c0 + 2 + i); else b.tri(c0, c0 + 2 + i, c0 + 1 + i); } }
    // passenger compartment walls (black) with the yellow lip
    for (const s of [-1, 1]) {
      P2(b).box(-10.6, 2.5, s > 0 ? 5.7 : -6.15, -2.6, 4.1, s > 0 ? 6.15 : -5.7);
      P1(b).box(-10.7, 4.1, s > 0 ? 5.65 : -6.2, -2.5, 4.65, s > 0 ? 6.2 : -5.65);
    }
    P2(b).box(-11.1, 2.5, -5.9, -10.5, 4.1, 5.9); P1(b).box(-11.2, 4.1, -5.95, -10.45, 4.65, 5.95);
    P2(b).box(-10.2, 2.5, -5.6, -3.2, 4.4, 5.6);
    // nose cowl (yellow) over the front wheel, rising to the windscreen
    P1(b).hexa([[4.4, 2.5, -5.4], [11, 2.5, -2.4], [11, 2.5, 2.4], [4.4, 2.5, 5.4], [4.6, 6.3, -4.6], [10.6, 4.0, -1.7], [10.6, 4.0, 1.7], [4.6, 6.3, 4.6]]);
    P2(b, 1).box(10.4, 1.6, -2.0, 11.4, 2.8, 2.0);
    HL(b).cyl([10.75, 3.75, 0], [11.15, 3.75, 0], 0.62, 0.62, 10, 2); CH(b).cyl([10.68, 3.75, 0], [10.9, 3.75, 0], 0.72, 0.72, 10, 0);
    // footwell floor + driver seat + passenger bench (red rexine) + engine cover
    FX(b, '#2a2626').box(1.0, 2.5, -4.4, 4.6, 2.62, 4.4);
    FX(b, '#5a1e1e').box(1.0, 4.1, -2.6, 3.4, 4.75, 2.6); FX(b, '#6a2424').box(0.6, 4.75, -2.6, 1.15, 6.6, 2.6);
    FX(b, '#7a2626').box(-9.7, 4.4, -5.5, -3.2, 5.4, 5.5); FX(b, '#6a1e1e').box(-10.5, 5.4, -5.5, -9.6, 8.9, 5.5);
    // fare meter on the driver's left, pillars, canopy (rexine top with black piping), rear panel
    FX(b, '#141214').box(4.9, 6.0, -4.7, 5.6, 8.3, -3.9); FX(b, '#c03030').box(5.0, 8.3, -4.5, 5.4, 9.2, -4.2);
    b.slot(VLIT).color('#ffc070').box(5.55, 6.9, -4.55, 5.62, 7.4, -4.05);
    FX(b, BLACK); for (const p of [[6.6, -5.55], [6.6, 5.55], [-10.6, -5.75], [-10.6, 5.75]]) b.tube([p[0], 4.0, p[1]], [p[0] + (p[0] > 0 ? 0.25 : 0), 10.75, p[1] * 1.02], 0.17, 5);
    P1(b).sweep([[-11.4, 10.55], [7.2, 10.55], [7.8, 10.9], [7.8, 11.3], [5.6, 11.85], [-9.4, 11.95], [-11.2, 11.6], [-11.85, 11.0]], 6.55, 0.45);
    P2(b).box(-10.6, 11.9, -0.8, 5.6, 12.02, 0.8);
    P2(b).box(-11.4, 10.55, -6.62, 7.0, 10.75, -6.4).box(-11.4, 10.55, 6.4, 7.0, 10.75, 6.62);
    for (const s of [-1, 1]) P1(b).box(-10.6, 9.35, s > 0 ? 6.4 : -6.52, 5.6, 10.6, s > 0 ? 6.52 : -6.4);
    P2(b).box(-10.6, 9.25, 6.38, 5.6, 9.4, 6.54).box(-10.6, 9.25, -6.54, 5.6, 9.4, -6.38);
    P1(b).box(-11.55, 4.6, -6.1, -11.15, 10.7, 6.1);
    P2(b).box(-11.62, 6.0, -6.15, -11.5, 6.6, 6.15);
    GL(b).box(-11.62, 7.9, -2.6, -11.55, 9.5, 2.6);
    FX(b, BLACK).box(6.3, 10.0, -5.4, 7.2, 10.7, 5.4).box(6.85, 6.1, -4.9, 7.25, 6.4, 4.9).box(6.85, 6.2, -0.08, 7.2, 10.1, 0.08);
    GL(b).box(6.88, 6.4, -4.7, 6.98, 10.0, 4.7); // the windscreen (translucent: the road shows through in first person)
    FX(b, BLACK).tube([7.0, 6.5, -0.4], [7.05, 9.3, -2.6], 0.07, 4); // the single wiper
    TL(b).box(-11.3, 3.2, -5.4, -11.05, 3.9, -4.4).box(-11.3, 3.2, 4.4, -11.05, 3.9, 5.4);
    // handlebar (steering column at x 6.0)
    b.part(1, [6.0, 0, 0]);
    FX(b, DARK).tube([6.6, 3.0, 0], [5.9, 6.85, 0], 0.2, 5);
    for (const s of [-1, 1]) FX(b, DARK).tube([5.9, 6.85, 0], [5.7, 6.9, s * 1.2], 0.14, 4).tube([5.7, 6.9, s * 1.2], [4.95, 6.8, s * 2.3], 0.14, 4);
    FX(b, '#1a1a1e'); for (const s of [-1, 1]) b.cyl([5.1, 6.8, s * 2.05], [4.75, 6.8, s * 2.7], 0.22, 0.22, 6, 3);
    FX(b, '#141418').box(5.6, 6.9, -0.5, 6.3, 7.3, 0.5); b.slot(VLIT).color('#e8e0b0').box(5.58, 7.0, -0.35, 5.62, 7.22, 0.35);
    b.part(0);
    return {
      L: 22, W: 13, H: 11.8, show: true, steerX: 6.0, auto: true, rearR: 1.65,
      wheels: [{ x: 8.6, z: 0, r: 1.6, w: 1.05, kind: 'solid', front: true }, { x: -6.4, z: -5.85, r: 1.65, w: 1.1, kind: 'solid' }, { x: -6.4, z: 5.85, r: 1.65, w: 1.1, kind: 'solid' }],
      seats: [
        { x: 2.0, y: 4.75, z: 0, pose: 'auto', grip: [4.9, 6.8, 2.35], foot: [5.0, 2.62] },
        { x: -6.6, y: 5.4, z: 2.6, pose: 'bench', foot: [-3.6, 2.5] },
        { x: -6.6, y: 5.4, z: -2.6, pose: 'bench', foot: [-3.6, 2.5] },
        { x: -6.6, y: 5.4, z: 0, pose: 'bench', foot: [-3.6, 2.5] },
      ],
      lamps: { head: [[11.2, 3.75, 0]], tail: [[-11.3, 3.55, -4.9], [-11.3, 3.55, 4.9]] },
      decals: [{ cell: 'plate_y', x: -11.66, y: 2.6, z: 0, w: 3.6, h: 1.0, face: 'B' }, { cell: 'auto_slogan', x: -11.66, y: 6.3, z: 0, w: 7.6, h: 1.6, face: 'B' }],
    };
  });

  /* ---------------------------------------------------------------- cars */
  /** o: {L, W, prof, bev, gh: {x0, x1, rx0, rx1, y0, y1, w0, w1, bp}, wheels, bump, grille, lampR, lampZ, lampY, round, tailY, roofP2, beacon, trunks} */
  function mkCar(b, o) {
    const L = o.L, W = o.W, hw = W / 2;
    b.part(0);
    P1(b).sweep(o.prof, hw, o.bev || 0.8);
    arches(b, o.wheels, hw, o.archTop);
    // greenhouse: pillars + roof in paint, glass panels on each face
    const g = o.gh;
    const c = [[g.x0, g.y0, -g.w0], [g.x1, g.y0, -g.w0], [g.x1, g.y0, g.w0], [g.x0, g.y0, g.w0], [g.rx0, g.y1, -g.w1], [g.rx1, g.y1, -g.w1], [g.rx1, g.y1, g.w1], [g.rx0, g.y1, g.w1]];
    // pillars and frames only (double-sided): the cabin is hollow behind the translucent glass
    const bp = g.bp || 0.5;
    P1(b, 0.98);
    frameFace(b, c[1], c[2], c[6], c[5], [[0.07, 0.93, 0.06, 0.92]]);
    frameFace(b, c[3], c[0], c[4], c[7], [[0.1, 0.9, 0.12, 0.9]]);
    frameFace(b, c[0], c[1], c[5], c[4], [[0.06, bp - 0.035, 0.1, 0.9], [bp + 0.035, 0.93, 0.1, 0.9]]);
    frameFace(b, c[2], c[3], c[7], c[6], [[0.07, 1 - bp - 0.035, 0.1, 0.9], [1 - bp + 0.035, 0.94, 0.1, 0.9]]);
    if (o.roofP2) P2(b); else P1(b, 1.04);
    b.quad(c[4], c[7], c[6], c[5]);
    FX(b, '#cfc6b4').quad(c[4], c[5], c[6], c[7]); // headliner
    // interior seen through the glass: dashboard, seat backs, steering wheel (right-hand drive)
    const sy = Math.min(o.seatY, g.y1 - 5.5), dz = hw * 0.36;
    const dashX = g.x1 - 0.3 - (g.x1 - g.rx1) * 0.8 / (g.y1 - g.y0); // behind the raked windscreen
    FX(b, '#2a2420').box(dashX - 2.0, g.y0 - 0.4, -g.w0 + 0.35, dashX, g.y0 + 0.7, g.w0 - 0.35);
    FX(b, '#4a2a22');
    for (const sd of [-1, 1]) b.box(o.seatX - 1.45, g.y0 - 0.6, sd * dz - 1.35, o.seatX - 0.75, sy + 3.2, sd * dz + 1.35).box(o.seatX - 1.25, sy + 3.2, sd * dz - 0.7, o.seatX - 0.85, sy + 4.0, sd * dz + 0.7);
    const rxw = g.x0 + (g.rx0 - g.x0) * (2.3 / (g.y1 - g.y0)); // the raked rear window at the bench-back top
    b.box(rxw + 0.2, g.y0 - 0.6, -g.w0 + 0.5, rxw + 0.9, g.y0 + 2.3, g.w0 - 0.5);
    FX(b, '#5a4638').quad([g.x0 + 0.1, g.y0 + 0.03, g.w0 - 0.1], [dashX, g.y0 + 0.03, g.w0 - 0.1], [dashX, g.y0 + 0.03, -g.w0 + 0.1], [g.x0 + 0.1, g.y0 + 0.03, -g.w0 + 0.1]); // the cabin tub
    {
      const ca = Math.cos(0.5), sa = Math.sin(0.5), cx = o.seatX + 3.1, cy = sy + 1.65, R = 1.1;
      const P = (f) => [cx + R * Math.sin(f) * sa, cy + R * Math.sin(f) * ca, dz + R * Math.cos(f)];
      FX(b, '#1a1816');
      for (let k = 0; k < 10; k++) b.tube(P(k / 10 * TAU), P((k + 1) / 10 * TAU), 0.12, 4);
      b.tube([cx, cy, dz], [cx + 1.6, cy - 0.9, dz], 0.12, 4);
    }
    if (o.gutter !== false) { CH(b); b.box(g.rx0, g.y1 - 0.08, -g.w1 - 0.06, g.rx1, g.y1 + 0.02, -g.w1 + 0.06).box(g.rx0, g.y1 - 0.08, g.w1 - 0.06, g.rx1, g.y1 + 0.02, g.w1 + 0.06); }
    GL(b);
    const cc = [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, 0];
    let n = faceN(c[1], c[2], c[5]); panel(b, c[1], c[2], c[6], c[5], 0.07, 0.93, 0.06, 0.92, 0.05, n, cc);
    n = faceN(c[3], c[0], c[7]); panel(b, c[3], c[0], c[4], c[7], 0.1, 0.9, 0.12, 0.9, 0.05, n, cc);
    n = faceN(c[0], c[1], c[4]); panel(b, c[0], c[1], c[5], c[4], 0.06, bp - 0.035, 0.1, 0.9, 0.05, n, cc); panel(b, c[0], c[1], c[5], c[4], bp + 0.035, 0.93, 0.1, 0.9, 0.05, n, cc);
    n = faceN(c[2], c[3], c[6]); panel(b, c[2], c[3], c[7], c[6], 0.07, 1 - bp - 0.035, 0.1, 0.9, 0.05, n, cc); panel(b, c[2], c[3], c[7], c[6], 1 - bp + 0.035, 0.94, 0.1, 0.9, 0.05, n, cc);
    // bumpers, grille, lamps, rubbing strip, door seams + handles, mirrors
    const fx = L / 2, bz = o.bump || hw - 0.4;
    (o.chromeBump ? CH(b) : FX(b, '#2a2a2e'));
    b.box(fx - 0.3, 1.9, -bz, fx + 0.45, 2.85, bz).box(-fx - 0.45, 1.9, -bz, -fx + 0.3, 2.85, bz);
    const gr = o.grille;
    if (gr) { (o.chromeBump ? CH(b) : FX(b, '#1a1a1e')); b.box(fx - 0.2 + (gr.dx || 0), gr.y0, -gr.hw, fx + 0.12 + (gr.dx || 0), gr.y1, gr.hw); FX(b, '#2a2a30'); for (let k = 0; k < 4; k++) { const y = gr.y0 + (gr.y1 - gr.y0) * (0.2 + k * 0.2); b.box(fx + 0.1 + (gr.dx || 0), y - 0.06, -gr.hw + 0.25, fx + 0.16 + (gr.dx || 0), y + 0.06, gr.hw - 0.25); } }
    for (const s of [-1, 1]) {
      const lz = s * o.lampZ, lx = fx + (o.lampDx || 0);
      if (o.round) { CH(b).cyl([lx - 0.25, o.lampY, lz], [lx + 0.05, o.lampY, lz], o.lampR + 0.18, o.lampR + 0.18, 10, 0); HL(b).cyl([lx - 0.2, o.lampY, lz], [lx + 0.12, o.lampY, lz], o.lampR, o.lampR, 10, 2); }
      else { HL(b).box(lx - 0.25, o.lampY - o.lampR * 0.6, lz - o.lampR, lx + 0.1, o.lampY + o.lampR * 0.6, lz + o.lampR); }
      TL(b).box(-fx - 0.12 + (o.tailDx || 0), o.tailY - 0.4, s * (hw - 1.5) - 0.6, -fx + 0.2 + (o.tailDx || 0), o.tailY + 0.4, s * (hw - 1.5) + 0.6);
      FX(b, '#e8a020').box(lx - 0.2, o.lampY - o.lampR - 0.6, lz - 0.35, lx + 0.12, o.lampY - o.lampR - 0.25, lz + 0.35);
    }
    CH(b).box(-fx + 1.2, 3.55, hw - 0.02, fx - 1.6, 3.75, hw + 0.06).box(-fx + 1.2, 3.55, -hw - 0.06, fx - 1.6, 3.75, -hw + 0.02);
    FX(b, '#2a2a2e');
    for (const x of o.doors || []) for (const s of [-1, 1]) b.box(x - 0.06, 2.1, s > 0 ? hw - 0.02 : -hw - 0.04, x + 0.06, g.y0 - 0.15, s > 0 ? hw + 0.04 : -hw + 0.02);
    CH(b); for (const x of o.doors || []) for (const s of [-1, 1]) b.box(x - 1.3, 4.6, s > 0 ? hw - 0.02 : -hw - 0.12, x - 0.6, 4.78, s > 0 ? hw + 0.12 : -hw + 0.02);
    CH(b); for (const s of [-1, 1]) { b.box(g.x1 - 0.6, g.y0 + 0.4, s * (g.w0 + 0.1) - 0.08, g.x1 - 0.4, g.y0 + 0.9, s * (g.w0 + 0.1) + 0.08).box(g.x1 - 0.8, g.y0 + 0.75, s * (g.w0 + 0.5) - 0.35, g.x1 - 0.5, g.y0 + 1.2, s * (g.w0 + 0.5) + 0.35); }
    if (o.ornament) CH(b).ell(fx - 2.5, o.hoodY + 0.15, 0, 0.35, 0.2, 0.12, 6, 3);
    const decals = [{ cell: o.plateFront || 'plate', x: fx + 0.5, y: 2.35, z: 0, w: 3.2, h: 0.85, face: 'F' }, { cell: o.plateBack || 'plate', x: -fx - 0.5, y: 3.2, z: 0, w: 3.2, h: 0.85, face: 'B' }];
    const meta = {
      L, W, H: g.y1 + 0.2, show: false, cockpit: o.cockpit || 'car', rearR: o.wheels[0].r,
      wheels: o.wheels.flatMap((w) => [{ x: w.x, z: -(hw - w.w / 2 + 0.12), r: w.r, w: w.w, kind: 'solid', front: !!w.front }, { x: w.x, z: hw - w.w / 2 + 0.12, r: w.r, w: w.w, kind: 'solid', front: !!w.front }]),
      seats: [{ x: o.seatX, y: sy, z: dz, pose: 'car', foot: [o.seatX + 4, 2.4], grip: [o.seatX + 3.05, sy + 1.62, 1.05] }, { x: o.seatX, y: sy, z: -dz, pose: 'bench', foot: [o.seatX + 3.5, 2.4] }],
      lamps: { head: [[fx + 0.15, o.lampY, -o.lampZ], [fx + 0.15, o.lampY, o.lampZ]], tail: [[-fx - 0.15, o.tailY, -(hw - 1.5)], [-fx - 0.15, o.tailY, hw - 1.5]] },
      decals, gh: g, hoodY: o.hoodY, dash: o.dash,
    };
    if (o.beacon) { b.slot(VBEACON).color('#ff2a1a').ell((g.rx0 + g.rx1) / 2, g.y1 + 0.1, 0, 0.55, 0.75, 0.55, 8, 4, { lat0: 0 }); CH(b).cyl([(g.rx0 + g.rx1) / 2, g.y1 - 0.05, 0], [(g.rx0 + g.rx1) / 2, g.y1 + 0.15, 0], 0.7, 0.7, 8, 0); }
    if (o.trunks) {
      CH(b); const y = g.y1 + 0.35;
      for (const s of [-1, 1]) b.tube([g.rx0 + 0.3, y, s * (g.w1 - 0.3)], [g.rx1 - 0.3, y, s * (g.w1 - 0.3)], 0.08, 4);
      for (const x of [g.rx0 + 0.4, g.rx1 - 0.4]) b.tube([x, g.y1, 0], [x, y, 0], 0.08, 4);
      FX(b, '#5a6a7a').box(g.rx0 + 0.5, y, -g.w1 + 0.5, g.rx0 + 4.2, y + 1.6, 0.4); FX(b, '#8a3a2a').box(g.rx0 + 4.5, y, -g.w1 + 0.6, g.rx1 - 0.5, y + 1.3, g.w1 - 0.8);
      FX(b, '#c9a227').box(g.rx0 + 0.45, y + 0.6, -g.w1 + 0.45, g.rx0 + 4.25, y + 0.75, 0.45);
    }
    if (o.taxiSign) { FX(b, '#1a1a1a').box((g.rx0 + g.rx1) / 2 - 1.0, g.y1, -1.8, (g.rx0 + g.rx1) / 2 + 1.0, g.y1 + 1.0, 1.8); b.slot(VLIT).color('#f2c230').box((g.rx0 + g.rx1) / 2 - 0.9, g.y1 + 0.1, -1.85, (g.rx0 + g.rx1) / 2 + 0.9, g.y1 + 0.9, 1.85); }
    return meta;
  }
  const AMB = {
    L: 30, W: 14, bev: 0.75, curvy: true,
    prof: [[-15.0, 2.0], [-15.3, 3.6], [-14.7, 5.0], [-12.2, 5.6], [-9.6, 5.78], [5.4, 5.78], [8.2, 5.62], [12.6, 5.25], [14.6, 4.7], [15.25, 3.5], [15.05, 2.0], [13.5, 1.55], [-13.6, 1.55]],
    gh: { x0: -9.5, x1: 5.4, rx0: -6.9, rx1: 2.2, y0: 5.78, y1: 9.65, w0: 6.1, w1: 5.05, bp: 0.48 },
    wheels: [{ x: -9.6, r: 2.5, w: 1.6, inset: 1.5 }, { x: 9.4, r: 2.5, w: 1.6, inset: 1.5, front: true }],
    grille: { y0: 3.0, y1: 4.5, hw: 3.4, dx: 0.05 }, chromeBump: true, round: true, lampR: 0.85, lampZ: 5.0, lampY: 3.95, tailY: 3.8, doors: [-2.6, 4.9], ornament: true, hoodY: 5.4,
    seatX: -1.2, seatY: 4.6, archTop: 5.0, dash: { x: 4.6, y: 6.2 },
  };
  defModel('ambassador', (b) => mkCar(b, AMB));
  defModel('ambassador_govt', (b) => mkCar(b, Object.assign({}, AMB, { beacon: true })));
  defModel('ambassador_taxi', (b) => mkCar(b, Object.assign({}, AMB, { roofP2: true, trunks: true, plateFront: 'plate_y', plateBack: 'plate_y' })));
  defModel('maruti', (b) => mkCar(b, {
    L: 24, W: 12, bev: 0.7,
    prof: [[-12.0, 1.9], [-12.15, 4.5], [-11.7, 5.3], [-11.2, 5.42], [6.4, 5.28], [10.4, 4.95], [11.95, 4.3], [12.1, 2.8], [11.7, 1.85], [10.6, 1.45], [-11.2, 1.45]],
    gh: { x0: -11.3, x1: 6.3, rx0: -10.8, rx1: 1.4, y0: 5.36, y1: 9.05, w0: 5.45, w1: 4.7, bp: 0.42 },
    wheels: [{ x: -7.6, r: 2.0, w: 1.3, inset: 1.2 }, { x: 7.6, r: 2.0, w: 1.3, inset: 1.2, front: true }],
    grille: { y0: 3.3, y1: 4.0, hw: 2.4 }, lampR: 0.75, lampZ: 4.1, lampY: 3.7, tailY: 3.9, doors: [-1.2], hoodY: 5.1,
    seatX: -1.6, seatY: 4.3, archTop: 4.7, dash: { x: 5.2, y: 6.0 },
  }));
  // Banjara / Jubilee drives (hills.js): a "foreign car" (long, low, curvy, chrome) and an SUV (tall, boxy)
  defModel('luxsedan', (b) => mkCar(b, {
    L: 34, W: 13.5, bev: 0.8, curvy: true,
    prof: [[-17.0, 2.2], [-17.2, 4.3], [-16.2, 5.3], [-12.6, 5.65], [6.4, 5.55], [12.6, 5.05], [16.6, 4.35], [17.1, 3.0], [16.6, 1.9], [-15.8, 1.6]],
    gh: { x0: -11.6, x1: 6.2, rx0: -8.2, rx1: 1.6, y0: 5.6, y1: 9.1, w0: 6.2, w1: 5.2, bp: 0.46 },
    wheels: [{ x: -11.0, r: 2.3, w: 1.6, inset: 1.4 }, { x: 10.8, r: 2.3, w: 1.6, inset: 1.4, front: true }],
    grille: { y0: 3.0, y1: 4.4, hw: 2.4 }, chromeBump: true, lampR: 0.75, lampZ: 4.7, lampY: 3.9, tailY: 4.0, doors: [-3.2, 4.6], ornament: true, hoodY: 5.4,
    seatX: -2.2, seatY: 4.6, archTop: 5.0, dash: { x: 5.2, y: 6.2 },
  }));
  defModel('suv', (b) => mkCar(b, {
    L: 30, W: 14.5, bev: 0.6,
    prof: [[-15.0, 2.6], [-15.1, 6.8], [-14.6, 7.2], [8.4, 7.2], [13.4, 6.6], [15.0, 5.6], [15.1, 3.0], [14.4, 2.2], [-14.4, 2.2]],
    gh: { x0: -14.0, x1: 8.4, rx0: -13.8, rx1: 5.4, y0: 7.2, y1: 11.4, w0: 6.8, w1: 6.4, bp: 0.42 },
    wheels: [{ x: -9.6, r: 2.8, w: 1.9, inset: 1.5 }, { x: 9.6, r: 2.8, w: 1.9, inset: 1.5, front: true }],
    grille: { y0: 3.4, y1: 5.6, hw: 3.4 }, lampR: 0.9, lampZ: 5.0, lampY: 5.0, tailY: 5.4, doors: [-4.8, 3.2], hoodY: 6.8,
    seatX: -2.6, seatY: 6.0, archTop: 6.4, dash: { x: 7.2, y: 8.0 },
  }));
  defModel('padmini', (b) => mkCar(b, {
    L: 26, W: 12, bev: 0.85,
    prof: [[-13.0, 2.0], [-13.15, 4.4], [-12.4, 5.25], [-8.4, 5.5], [5.3, 5.5], [10.6, 5.12], [12.8, 4.45], [13.15, 2.8], [12.7, 1.8], [-12.4, 1.65]],
    gh: { x0: -8.2, x1: 5.2, rx0: -5.7, rx1: 2.1, y0: 5.5, y1: 9.2, w0: 5.5, w1: 4.6, bp: 0.47 },
    wheels: [{ x: -8.4, r: 2.15, w: 1.4, inset: 1.3 }, { x: 8.2, r: 2.15, w: 1.4, inset: 1.3, front: true }],
    grille: { y0: 3.1, y1: 4.2, hw: 3.0 }, chromeBump: true, round: true, lampR: 0.7, lampZ: 4.25, lampY: 3.85, tailY: 3.7, doors: [-2.0, 4.6], hoodY: 5.25,
    seatX: -1.4, seatY: 4.5, archTop: 4.8, dash: { x: 4.5, y: 6.1 },
  }));

  /* ---------------------------------------------------------------- bus + lorry */
  function mkBus(b, safari) {
    const L = 62, hw = 9;
    b.part(0);
    P1(b).sweep([[-31, 1.8], [31, 1.8], [31.35, 3.0], [31.35, 15.6], [30.7, 16.6], [-30.7, 16.6], [-31.25, 15.8], [-31.25, 3.0]], hw, 0.7);
    arches(b, [{ x: 22, r: 3.0 }, { x: -18, r: 3.0 }], hw, 6);
    FX(b, '#d6d0c2').box(-30.2, 16.55, -8.4, 30.0, 17.2, 8.4); FX(b, '#bdb6a6').box(-22, 17.2, -2.8, -15, 17.6, 2.8).box(4, 17.2, -2.8, 11, 17.6, 2.8);
    FX(b, CREAM);
    for (const s of [-1, 1]) b.box(-30.8, 8.4, s > 0 ? hw - 0.05 : -hw - 0.08, 30.9, 10.2, s > 0 ? hw + 0.08 : -hw + 0.05).box(-30.8, 15.5, s > 0 ? hw - 0.05 : -hw - 0.08, 30.9, 15.9, s > 0 ? hw + 0.08 : -hw + 0.05);
    GL(b);
    for (const s of [-1, 1]) for (let k = 0; k < 9; k++) {
      const x0 = -28.5 + k * 6.0, x1 = x0 + 5.4;
      if (s < 0 && ((x0 < 26 && x1 > 21.5) || (x0 < -6 && x1 > -10.5))) continue;
      b.quadO([x0, 10.6, s * (hw + 0.06)], [x1, 10.6, s * (hw + 0.06)], [x1, 15.1, s * (hw + 0.06)], [x0, 15.1, s * (hw + 0.06)], 0, 0, s);
    }
    b.quadO([31.4, 9.4, -8.2], [31.4, 9.4, -0.25], [31.4, 15.5, -0.25], [31.4, 15.5, -8.2], 1, 0, 0).quadO([31.4, 9.4, 0.25], [31.4, 9.4, 8.2], [31.4, 15.5, 8.2], [31.4, 15.5, 0.25], 1, 0, 0);
    b.quadO([-31.3, 11.4, -7.6], [-31.3, 11.4, 7.6], [-31.3, 15.2, 7.6], [-31.3, 15.2, -7.6], -1, 0, 0);
    FX(b, '#141214').box(31.2, 15.6, -6.5, 31.45, 16.5, 6.5);
    FX(b, '#1c1a1e'); for (const x of [21.6, -10.4]) b.box(x, 2.0, -hw - 0.1, x + 4.4, 15.2, -hw + 0.04);
    FX(b, '#9aa0a6'); for (const x of [21.6, -10.4]) b.box(x + 2.15, 2.0, -hw - 0.14, x + 2.25, 15.2, -hw + 0.05);
    FX(b, '#3a3a3e'); for (const x of [21.6, -10.4]) b.box(x + 0.1, 1.85, -hw - 1.25, x + 4.3, 2.25, -hw + 0.05); // footboard steps
    FX(b, '#2a2628').box(30.9, 1.4, -8.6, 32.1, 3.0, 8.6).box(-32.0, 1.4, -8.6, -30.9, 3.0, 8.6);
    FX(b, '#1a1a1e').box(31.3, 4.4, -4.0, 31.5, 7.4, 4.0);
    for (const s of [-1, 1]) { CH(b).cyl([31.2, 3.9, s * 6.6], [31.5, 3.9, s * 6.6], 0.85, 0.85, 10, 0); HL(b).cyl([31.25, 3.9, s * 6.6], [31.55, 3.9, s * 6.6], 0.7, 0.7, 10, 2); TL(b).box(-31.45, 3.4, s * 7.0 - 0.7, -31.2, 4.8, s * 7.0 + 0.7); }
    if (safari) { FX(b, '#2a2a2a'); for (const s of [-1, 1]) { for (let x = -28; x <= 26; x += 1.2) b.box(x, 10.4, s > 0 ? hw + 0.1 : -hw - 0.16, x + 0.1, 15.3, s > 0 ? hw + 0.16 : -hw - 0.1); for (let y = 10.8; y < 15.3; y += 1.1) b.box(-28.6, y, s > 0 ? hw + 0.1 : -hw - 0.16, 27, y + 0.1, s > 0 ? hw + 0.16 : -hw - 0.1); } }
    return {
      L, W: 18, H: 17.6, show: false, cockpit: 'bus', rearR: 3.0,
      wheels: [{ x: 22, z: -8.12, r: 3.0, w: 2.0, kind: 'solid', front: true }, { x: 22, z: 8.12, r: 3.0, w: 2.0, kind: 'solid', front: true }, { x: -18, z: -7.82, r: 3.0, w: 2.6, kind: 'solid' }, { x: -18, z: 7.82, r: 3.0, w: 2.6, kind: 'solid' }],
      seats: [], lamps: { head: [[31.6, 3.9, -6.6], [31.6, 3.9, 6.6]], tail: [[-31.5, 4.1, -7.0], [-31.5, 4.1, 7.0]] }, busLife: true,
      decals: [
        { cell: 'citybus', x: -4, y: 5.6, z: hw + 0.1, w: 15, h: 3.2, face: 'R' }, { cell: 'citybus', x: -4, y: 5.6, z: -hw - 0.1, w: 15, h: 3.2, face: 'L' },
        { cell: 'route', x: 31.5, y: 15.95, z: 0, w: 4.6, h: 1.0, face: 'F' }, { cell: 'route', x: -31.35, y: 16.05, z: 0, w: 4.0, h: 0.9, face: 'B' },
        { cell: 'plate_y', x: 32.15, y: 2.2, z: 0, w: 3.6, h: 0.9, face: 'F' }, { cell: 'plate_y', x: -32.05, y: 2.2, z: 0, w: 3.6, h: 0.9, face: 'B' },
      ],
    };
  }
  defModel('bus', (b) => mkBus(b, false));
  /* the double-decker (APSRTC's last ones, 2003): the city bus two decks tall. A half cab (the driver's windscreen on
   * the right, the radiator on the left), the cream band with A.P.S.R.T.C. between the decks, two upper front windows
   * over the route board, the open rear platform on the kerb side with its pole. The lower deck is a closed body like
   * the city bus; the upper deck is framework round its windows (double-sided) about a furnished top deck (floor,
   * the seat rows, the front rail, the stairwell: decker.js's layout), so its passengers show through the glass, and
   * with the player up there in third person the roof comes off (bus_decker_open) to look down on him walking about.
   * `upper` is the top deck's seats (decker.js SEATS: the same people in the same seats as the 2D cutaway). */
  const DD_FALLBACK = { floor: 15.4, seatY: 17.8, top: 25.4, hw: 9, aisle: 2.0, front: 28.2, rows: [25.6, 20.2, 14.8, 9.4, 4.0, -1.4, -6.8, -12.2, -17.6], stairs: { x0: -28.4, x1: -20.0, z0: -8.6, z1: -0.8 } };
  const DDL = () => (N.decker && N.decker.LAYOUT) || DD_FALLBACK;
  const DD_WIN = [17.4, 23.5]; // the upper side windows (y)
  /** the top deck's furniture: floor, panels under / over the windows, the seat rows, the front rail, the stairwell
   *  (o.pillars: the pillars between the windows too, for the first-person interior that has no body round it) */
  function deckFurniture(b, o) {
    const Y = DDL(), hw = 9, fl = Y.floor, x0 = -30.9, x1 = 31.1, top = Y.top - 0.6, PANEL = '#c9b48a', PILLAR = '#8a7a5a', S = Y.stairs;
    FX(b, '#4a3a30').box(x0, fl, -hw + 0.2, x1, fl + 0.1, hw - 0.2);
    FX(b, '#3a2c24'); for (let x = x0 + 1; x < x1; x += 2.2) b.box(x, fl + 0.1, -hw + 0.2, x + 0.12, fl + 0.13, hw - 0.2);
    for (const sd of [-1, 1]) {
      const za = sd > 0 ? hw - 0.6 : -hw + 0.2, zb = sd > 0 ? hw - 0.2 : -hw + 0.6;
      FX(b, PANEL).box(x0, fl, za, x1, DD_WIN[0], zb).box(x0, DD_WIN[1], za, x1, top, zb);
      if (o.pillars) { FX(b, PILLAR); for (let k = 0; k <= 9; k++) { const x = -28.5 + k * 6.0 - 0.6; b.box(x, DD_WIN[0], za, x + 0.6, DD_WIN[1], zb); } }
    }
    FX(b, PANEL).box(x1 - 0.4, fl, -hw + 0.2, x1, DD_WIN[0], hw - 0.2).box(x0, fl, -hw + 0.2, x0 + 0.4, 18.0, hw - 0.2);
    // the front rail (hands and knees on it at the front window)
    const rx = Y.front + 1.3, ry = fl + 3.6;
    CH(b).tube([rx, ry, -hw + 0.6], [rx, ry, hw - 0.6], 0.12, 6);
    for (const z of [-hw + 0.7, hw - 0.7]) CH(b).tube([rx, ry, z], [x1 - 0.4, ry - 1.2, z], 0.1, 4);
    // the stairwell at the back on the left, railed off on its aisle and front sides
    FX(b, '#1a1410').box(S.x0, fl + 0.11, S.z0 + 0.6, S.x1, fl + 0.15, S.z1);
    CH(b);
    b.tube([S.x0, fl + 3.4, S.z1], [S.x1, fl + 3.4, S.z1], 0.1, 4).tube([S.x1, fl + 3.4, S.z1], [S.x1, fl + 3.4, S.z0 + 0.8], 0.1, 4);
    for (const q of [[S.x1, S.z1], [S.x0 + 0.4, S.z1], [S.x1, S.z0 + 0.8]]) b.tube([q[0], fl, q[1]], [q[0], fl + 3.4, q[1]], 0.1, 4);
    // the seats: a moquette cushion and back with a chrome grab rail, two each side of the aisle, every row
    for (const x of Y.rows) for (const sd of [-1, 1]) {
      const zA = sd * Y.aisle, zB = sd * (hw - 0.6), zlo = Math.min(zA, zB), zhi = Math.max(zA, zB);
      FX(b, '#2f5e72').box(x - 1.8, Y.seatY - 0.6, zlo, x + 1.6, Y.seatY - 0.05, zhi);
      FX(b, '#21434f').box(x - 2.4, Y.seatY - 0.6, zlo, x - 1.7, Y.seatY + 4.0, zhi);
      CH(b).tube([x - 2.1, Y.seatY + 4.1, zlo + 0.2], [x - 2.1, Y.seatY + 4.1, zhi - 0.2], 0.09, 4);
      FX(b, '#3a3a3e').box(x - 1.2, fl, (zA + zB) / 2 - 0.2, x + 1.0, Y.seatY - 0.6, (zA + zB) / 2 + 0.2);
    }
  }
  function mkDecker(b, open) {
    const L = 62, hw = 9, Y = DDL(), fl = Y.floor, top = Y.top, wt = top - 0.6, xF = 31.35, xB = -31.25;
    b.part(0);
    // the lower deck: a closed body
    P1(b).sweep([[-31, 1.8], [31, 1.8], [xF, 3.0], [xF, fl], [xB, fl], [xB, 3.0]], hw, 0.7);
    arches(b, [{ x: 22, r: 3.0 }, { x: -18, r: 3.0 }], hw, 6);
    // the upper deck: framework round the windows (double-sided, so the deck shows through), a rim along the top
    const vW = (y) => (y - fl) / (wt - fl), span = xF - xB;
    P1(b);
    for (const sd of [-1, 1]) {
      const z = sd * hw, holes = [];
      for (let k = 0; k < 9; k++) { const x0 = -28.5 + k * 6.0; holes.push([(x0 - xB) / span, (x0 + 5.4 - xB) / span, vW(DD_WIN[0]), vW(DD_WIN[1])]); }
      frameFace(b, [xB, fl, z], [xF, fl, z], [xF, wt, z], [xB, wt, z], holes);
    }
    frameFace(b, [xF, fl, -hw], [xF, fl, hw], [xF, wt, hw], [xF, wt, -hw], [[0.8 / 18, 8.75 / 18, vW(17.4), vW(23.6)], [9.25 / 18, 17.2 / 18, vW(17.4), vW(23.6)]]);
    frameFace(b, [xB, fl, -hw], [xB, fl, hw], [xB, wt, hw], [xB, wt, -hw], [[1.4 / 18, 16.6 / 18, vW(18.0), vW(23.2)]]);
    P1(b, 0.92).box(xB, wt - 0.05, -hw - 0.05, xF, wt + 0.2, -hw + 0.35).box(xB, wt - 0.05, hw - 0.35, xF, wt + 0.2, hw + 0.05).box(xF - 0.4, wt - 0.05, -hw, xF + 0.05, wt + 0.2, hw).box(xB - 0.05, wt - 0.05, -hw, xB + 0.4, wt + 0.2, hw);
    if (!open) { FX(b, '#d6d0c2').box(xB + 0.1, wt, -hw + 0.1, xF - 0.1, top, hw - 0.1).box(xB + 0.8, top, -8.2, xF - 0.8, top + 0.35, 8.2); }
    FX(b, CREAM);
    for (const sd of [-1, 1]) {
      const z0 = sd > 0 ? hw - 0.05 : -hw - 0.1, z1 = sd > 0 ? hw + 0.1 : -hw + 0.05;
      b.box(-30.8, 13.6, z0, 30.9, 16.6, z1).box(-30.8, 7.4, z0, 30.9, 7.9, z1).box(-30.8, 23.9, z0, 30.9, 24.3, z1);
    }
    b.box(31.25, 13.6, -hw + 0.4, 31.45, 16.6, hw - 0.4).box(-31.4, 13.6, -hw + 0.4, -31.2, 16.6, hw - 0.4);
    GL(b);
    for (const sd of [-1, 1]) for (let k = 0; k < 9; k++) {
      const x0 = -28.5 + k * 6.0, x1 = x0 + 5.4, zz = sd * (hw + 0.06);
      if (!(sd < 0 && x0 < -24)) b.quadO([x0, 8.3, zz], [x1, 8.3, zz], [x1, 13.2, zz], [x0, 13.2, zz], 0, 0, sd); // no window over the platform
      // (roof off: the upper windows open, no glass: seen from above at a grazing angle it would whiten the deck)
      if (!open) b.quadO([x0, DD_WIN[0], zz], [x1, DD_WIN[0], zz], [x1, DD_WIN[1], zz], [x0, DD_WIN[1], zz], 0, 0, sd);
    }
    b.quadO([31.4, 8.0, 0.4], [31.4, 8.0, 8.2], [31.4, 13.3, 8.2], [31.4, 13.3, 0.4], 1, 0, 0); // the cab's windscreen
    b.quadO([31.4, 10.8, -8.2], [31.4, 10.8, -0.6], [31.4, 13.3, -0.6], [31.4, 13.3, -8.2], 1, 0, 0);
    if (!open) {
      b.quadO([31.42, 17.4, -8.2], [31.42, 17.4, -0.25], [31.42, 23.6, -0.25], [31.42, 23.6, -8.2], 1, 0, 0).quadO([31.42, 17.4, 0.25], [31.42, 17.4, 8.2], [31.42, 23.6, 8.2], [31.42, 23.6, 0.25], 1, 0, 0);
      b.quadO([-31.32, 18.0, -7.6], [-31.32, 18.0, 7.6], [-31.32, 23.2, 7.6], [-31.32, 23.2, -7.6], -1, 0, 0);
    }
    b.quadO([-31.3, 9.0, 0.6], [-31.3, 9.0, 7.6], [-31.3, 13.0, 7.6], [-31.3, 13.0, 0.6], -1, 0, 0);
    // the radiator (half cab: the engine sits left of the driver), the route board between the decks
    CH(b).box(31.3, 3.6, -5.4, 31.62, 9.9, -0.8);
    FX(b, '#1a1a1e'); for (let y = 4.1; y < 9.5; y += 0.7) b.box(31.6, y, -5.0, 31.7, y + 0.32, -1.2);
    FX(b, '#141214').box(31.3, 14.0, -6.5, 31.5, 16.2, 6.5).box(-31.45, 14.0, -5.5, -31.25, 16.2, 5.5);
    // the open rear platform (kerb side): the dark doorway, its pole, the step
    FX(b, '#1c1a1e').box(-31.0, 2.0, -hw - 0.1, -24.4, 13.2, -hw + 0.04).box(-31.42, 2.0, -hw + 0.2, -31.2, 13.2, -0.6);
    CH(b).tube([-27.6, 2.2, -hw - 0.12], [-27.6, 13.2, -hw - 0.12], 0.16, 6);
    FX(b, '#3a3a3e').box(-31.0, 1.85, -hw - 1.1, -24.6, 2.25, -hw + 0.05);
    FX(b, '#2a2628').box(30.9, 1.4, -8.6, 32.1, 3.0, 8.6).box(-32.0, 1.4, -8.6, -30.9, 3.0, -0.4);
    for (const sd of [-1, 1]) { CH(b).cyl([31.2, 3.9, sd * 6.9], [31.5, 3.9, sd * 6.9], 0.85, 0.85, 10, 0); HL(b).cyl([31.25, 3.9, sd * 6.9], [31.55, 3.9, sd * 6.9], 0.7, 0.7, 10, 2); TL(b).box(-31.45, 3.4, sd * 7.0 - 0.7, -31.2, 4.8, sd * 7.0 + 0.7); }
    deckFurniture(b, {});
    const upper = N.decker ? N.decker.SEATS : [];
    return {
      L, W: 18, H: top + 0.4, show: false, cockpit: 'decker', rearR: 3.0,
      wheels: [{ x: 22, z: -8.12, r: 3.0, w: 2.0, kind: 'solid', front: true }, { x: 22, z: 8.12, r: 3.0, w: 2.0, kind: 'solid', front: true }, { x: -18, z: -7.82, r: 3.0, w: 2.6, kind: 'solid' }, { x: -18, z: 7.82, r: 3.0, w: 2.6, kind: 'solid' }],
      seats: [BUS_DRIVER, upper[N.decker ? N.decker.FRONT : 0] || { x: 25.6, y: 17.8, z: -6.0, pose: 'bench', foot: [28.4, 15.4] }], upper,
      lamps: { head: [[31.6, 3.9, -6.9], [31.6, 3.9, 6.9]], tail: [[-31.5, 4.1, -7.0], [-31.5, 4.1, 7.0]] }, busLife: true, bus: { rail: 13.0, doorX: -27.6 },
      decals: [
        { cell: 'apsrtc', x: -2, y: 15.1, z: hw + 0.14, w: 20, h: 2.6, face: 'R' }, { cell: 'apsrtc', x: -2, y: 15.1, z: -hw - 0.14, w: 20, h: 2.6, face: 'L' },
        { cell: 'route', x: 31.55, y: 15.1, z: 0, w: 6.0, h: 1.6, face: 'F' }, { cell: 'route', x: -31.5, y: 15.1, z: 0, w: 5.0, h: 1.4, face: 'B' },
        { cell: 'plate_y', x: 32.15, y: 2.2, z: 0, w: 3.6, h: 0.9, face: 'F' }, { cell: 'plate_y', x: -32.05, y: 2.2, z: 3.4, w: 3.6, h: 0.9, face: 'B' },
      ],
    };
  }
  defModel('bus_decker', (b) => mkDecker(b, false));
  defModel('bus_decker_open', (b) => mkDecker(b, true));
  defModel('bus_safari', (b) => mkBus(b, true));
  function mkLorry(b, open) {
    const L = 46, hw = 8;
    b.part(0);
    // chassis + fuel tank + steps
    FX(b, '#1c1a1c').box(-22.5, 2.9, -4.6, 12.5, 4.3, 4.6);
    FX(b, '#5a5c60').cyl([1, 3.2, -5.8], [7, 3.2, -5.8], 1.0, 1.0, 10, 3);
    // cab
    P1(b).sweep([[12.0, 2.6], [22.7, 2.6], [23.4, 3.6], [23.4, 8.7], [22.6, 9.9], [21.4, 16.6], [13.4, 17.2], [12.0, 16.6]], 7.6, 0.7);
    arches(b, [{ x: 17, r: 2.5 }], 7.6, 6.2);
    GL(b).quadO([22.75, 10.2, -6.6], [22.75, 10.2, 6.6], [21.65, 16.0, 6.6], [21.65, 16.0, -6.6], 0.98, 0.2, 0);
    FX(b, '#141214').box(21.5, 10.0, -0.12, 22.9, 16.1, 0.12);
    for (const s of [-1, 1]) GL(b).quadO([15.0, 10.4, s * 7.64], [20.6, 10.4, s * 7.64], [20.1, 15.8, s * 7.64], [15.0, 15.8, s * 7.64], 0, 0, s);
    FX(b, '#f4e8c8').box(20.8, 16.1, -7.2, 22.3, 17.3, 7.2);
    FX(b, '#c0392b'); for (let z = -6.8; z < 6.6; z += 1.4) b.hexa([[22.28, 16.2, z], [22.36, 16.2, z], [22.36, 16.2, z + 1.2], [22.28, 16.2, z + 1.2], [22.28, 17.2, z + 0.6], [22.36, 17.2, z + 0.6], [22.36, 17.2, z + 0.62], [22.28, 17.2, z + 0.62]]);
    FX(b, '#2a2a2e').box(23.2, 2.0, -7.5, 24.2, 3.5, 7.5); FX(b, '#1a1a1e').box(23.35, 4.2, -4.4, 23.55, 8.2, 4.4);
    for (const s of [-1, 1]) { CH(b).cyl([23.3, 6.0, s * 5.6], [23.6, 6.0, s * 5.6], 0.85, 0.85, 10, 0); HL(b).cyl([23.35, 6.0, s * 5.6], [23.65, 6.0, s * 5.6], 0.7, 0.7, 10, 2); }
    FX(b, '#2a2a2e'); for (const s of [-1, 1]) b.box(15.8, 2.4, s > 0 ? 7.6 : -8.2, 17.6, 2.7, s > 0 ? 8.2 : -7.6);
    // cargo box: wooden sides with painted bands, rims, tailgate
    const bx0 = -23, bx1 = 11.2, fl = 4.9, top = open ? 8.2 : 13.6;
    P2(b, 0.8).box(bx0, 4.3, -hw, bx1, fl, hw);
    P2(b).box(bx0, fl, -hw, bx1, top, -hw + 0.35).box(bx0, fl, hw - 0.35, bx1, top, hw).box(bx1 - 0.35, fl, -hw, bx1, top, hw).box(bx0, fl, -hw, bx0 + 0.35, top, hw);
    FX(b, '#7a3a1a'); for (const s of [-1, 1]) b.box(bx0, top - 0.6, s > 0 ? hw - 0.02 : -hw - 0.06, bx1, top, s > 0 ? hw + 0.06 : -hw + 0.02).box(bx0, fl, s > 0 ? hw - 0.02 : -hw - 0.06, bx1, fl + 0.8, s > 0 ? hw + 0.06 : -hw + 0.02);
    if (!open) {
      for (const s of [-1, 1]) { FX(b, '#c0392b').box(bx0, 8.6, s > 0 ? hw - 0.02 : -hw - 0.08, bx1, 9.4, s > 0 ? hw + 0.08 : -hw + 0.02); FX(b, '#2a8a4a').box(bx0, 9.4, s > 0 ? hw - 0.02 : -hw - 0.08, bx1, 10.2, s > 0 ? hw + 0.08 : -hw + 0.02); }
      FX(b, '#7a3a1a').box(bx0 - 0.06, top - 0.6, -hw, bx0, top, hw).box(bx0 - 0.06, fl, -hw, bx0, fl + 0.8, hw);
      // tarpaulin (olive) with ropes
      FX(b, '#56603f').xf(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition((bx0 + bx1) / 2, 0, 0)).sweep([[-hw, top], [hw, top], [hw - 1.2, top + 1.1], [0, top + 1.6], [-hw + 1.2, top + 1.1]], (bx1 - bx0) / 2 - 0.1, 0.3).xf(null);
      FX(b, '#d8d0a8'); for (let x = bx0 + 2.5; x < bx1 - 1; x += 5.2) b.box(x, top - 0.1, -hw - 0.1, x + 0.18, top + 1.62, hw + 0.1);
    } else {
      FX(b, '#ff9a1a'); for (const s of [-1, 1]) for (let x = bx0 + 1; x < bx1 - 0.6; x += 1.4) b.ell(x, top - 0.9 - Math.sin(((x - bx0) / 2.8) * Math.PI) * 0.6, s * (hw + 0.25), 0.38, 0.38, 0.38, 5, 3);
    }
    FX(b, '#2a2a2e').box(-23.6, 3.0, -7.6, -22.6, 4.1, 7.6);
    for (const s of [-1, 1]) TL(b).box(-23.75, 3.15, s * 6.4 - 0.7, -23.55, 3.95, s * 6.4 + 0.7);
    FX(b, '#141214').box(-23.0, 0.9, -7.4, -22.4, 3.0, -5.4).box(-23.0, 0.9, 5.4, -22.4, 3.0, 7.4);
    const decals = [{ cell: 'plate_y', x: 24.25, y: 2.75, z: 0, w: 3.6, h: 0.9, face: 'F' }];
    if (!open) decals.push({ cell: 'hornok', x: -23.12, y: 7.3, z: 0, w: 11.5, h: 2.9, face: 'B' }, { cell: 'dipper', x: -23.12, y: 10.9, z: 0, w: 9.0, h: 1.6, face: 'B' }, { cell: 'plate_y', x: -23.65, y: 3.55, z: 0, w: 3.0, h: 0.8, face: 'B' });
    return {
      L, W: 16, H: 17.4, show: false, cockpit: 'lorry', rearR: 2.5, open,
      wheels: [{ x: 17, z: -6.82, r: 2.5, w: 1.8, kind: 'solid', front: true }, { x: 17, z: 6.82, r: 2.5, w: 1.8, kind: 'solid', front: true },
        { x: -15, z: -6.7, r: 2.5, w: 2.4, kind: 'solid' }, { x: -15, z: 6.7, r: 2.5, w: 2.4, kind: 'solid' }, { x: -8, z: -6.7, r: 2.5, w: 2.4, kind: 'solid' }, { x: -8, z: 6.7, r: 2.5, w: 2.4, kind: 'solid' }],
      seats: [], lamps: { head: [[23.7, 6.0, -5.6], [23.7, 6.0, 5.6]], tail: [[-23.8, 3.55, -6.4], [-23.8, 3.55, 6.4]] }, decals, bed: [bx0, bx1, fl],
    };
  }
  defModel('lorry', (b) => mkLorry(b, false));
  defModel('lorry_open', (b) => mkLorry(b, true));

  /* ---------------------------------------------------------------- boat, cycle-rickshaw, mini train */
  defModel('boat', (b) => {
    const hull = [[14.2, 0], [11, 3.9], [4, 5.4], [-8, 5.4], [-12.6, 4.6], [-14, 2.4], [-14.2, 0], [-14, -2.4], [-12.6, -4.6], [-8, -5.4], [4, -5.4], [11, -3.9]];
    const sc = (k) => hull.map((p) => [p[0] * k, p[1] * k]);
    b.part(0);
    P1(b, 0.92).prism(sc(0.82), -1.2, 0.6, { bottom: true });
    P1(b).prism(hull, 0.6, 2.4);
    P2(b).prism(sc(1.015), 1.8, 2.5, { top: false });
    FX(b, '#8a6a42').prism(sc(0.9), 2.4, 2.5);
    FX(b, '#6a4a2a'); for (const x of [-7, -1, 5]) b.box(x - 0.6, 2.5, -4.6, x + 0.6, 3.6, 4.6);
    FX(b, '#c9c4b8'); for (const p of [[-7.6, -4.6], [-7.6, 4.6], [6.2, -4.2], [6.2, 4.2]]) b.tube([p[0], 2.5, p[1]], [p[0], 8.4, p[1]], 0.14, 4);
    P2(b).sweep([[-8.4, 8.3], [7.0, 8.3], [7.4, 8.6], [6.6, 9.1], [-7.8, 9.1], [-8.8, 8.6]], 5.2, 0.4);
    FX(b, '#f4f0e6'); for (let x = -7.5; x < 6.6; x += 3) b.box(x, 8.28, -5.25, x + 1.4, 8.36, 5.25);
    FX(b, '#2a2a2e').box(-15.2, 1.2, -0.9, -13.8, 4.4, 0.9);
    HL(b).ell(13.6, 3.0, 0, 0.35, 0.35, 0.35, 6, 4);
    return { L: 28, W: 11, H: 9.2, show: true, boat: true, wheels: [], seats: [{ x: -11.4, y: 3.0, z: 0, pose: 'boatman' }, { x: -1, y: 3.6, z: 2.4, pose: 'bench', foot: [1, 2.5] }, { x: 5, y: 3.6, z: -2.4, pose: 'bench', foot: [7, 2.5] }], lamps: { head: [[13.9, 3.0, 0]], tail: [] } };
  });
  defModel('rickshaw', (b) => {
    const R1 = 2.4, R2 = 2.6, fxw = 9.8, rxw = -7.4, bbX = 5.4, bbY = 2.0, hx = 8.2, sX = 3.8, sY = 6.4;
    b.part(0);
    P1(b).tube([bbX, bbY, 0], [sX + 0.4, sY - 0.8, 0], 0.22).tube([sX + 0.4, sY - 0.9, 0], [hx - 0.2, sY - 0.5, 0], 0.22).tube([bbX, bbY, 0], [hx, 4.3, 0], 0.24).tube([bbX - 0.2, bbY + 0.2, 0], [-3.0, 3.2, 0], 0.24);
    FX(b, '#3a2418').hexa([[sX - 0.8, sY - 0.3, -0.6], [sX + 1.1, sY - 0.25, -0.2], [sX + 1.1, sY - 0.25, 0.2], [sX - 0.8, sY - 0.3, 0.6], [sX - 0.85, sY + 0.1, -0.65], [sX + 1.15, sY + 0.05, -0.2], [sX + 1.15, sY + 0.05, 0.2], [sX - 0.85, sY + 0.1, 0.65]]);
    FX(b, DARK).box(-11.4, 2.9, -5.6, -2.2, 3.3, 5.6);
    P1(b).box(-11.2, 3.3, -5.3, -3.0, 5.4, 5.3);
    FX(b, '#c8302a').box(-10.4, 5.4, -4.6, -4.4, 6.3, 4.6).box(-11.0, 6.3, -4.6, -10.2, 8.6, 4.6);
    P2(b).box(-3.1, 2.6, -4.8, -1.0, 2.9, 4.8);
    FX(b, '#e8e2d8').box(-11.25, 4.3, -5.32, -3.0, 4.6, 5.32);
    FX(b, '#1d1d22').ell(-8.6, 6.4, 0, 3.4, 5.2, 5.5, 12, 6, { lat0: 0, t0: Math.PI * 0.5, t1: Math.PI * 1.5 });
    FX(b, '#3a3a40').ell(-8.6, 6.4, 0, 3.32, 5.12, 5.42, 12, 6, { lat0: 0, t0: Math.PI * 0.5, t1: Math.PI * 1.5, inside: true });
    P2(b); for (let k = 0; k < 14; k++) { const a = Math.PI * (0.5 + k / 13); b.box(-8.6 + Math.cos(a) * 3.45 - 0.12, 6.0, Math.sin(a) * 5.55 - 0.12, -8.6 + Math.cos(a) * 3.45 + 0.12, 6.6, Math.sin(a) * 5.55 + 0.12); }
    for (const s of [-1, 1]) FX(b, DARK).tube([-3.0, 3.1, 0], [rxw, R2, s * 5.0], 0.16, 4);
    FX(b, '#c0281e').box(-11.5, 3.6, -5.0, -11.35, 4.2, -4.2).box(-11.5, 3.6, 4.2, -11.35, 4.2, 5.0);
    b.part(2, [bbX, bbY, 0]);
    CH(b).cyl([bbX, bbY, 0.44], [bbX, bbY, 0.52], 0.95, 0.95, 10, 3).tube([bbX, bbY, 0.56], [bbX + 1.0, bbY, 0.6], 0.12).tube([bbX, bbY, -0.56], [bbX - 1.0, bbY, -0.6], 0.12);
    FX(b, '#2a2626').box(bbX + 0.75, bbY - 0.12, 0.62, bbX + 1.3, bbY + 0.12, 1.15).box(bbX - 1.3, bbY - 0.12, -1.15, bbX - 0.75, bbY + 0.12, -0.62);
    b.part(1, [hx, 0, 0]);
    CH(b); for (const s of [-1, 1]) b.tube([hx, 4.3, s * 0.22], [fxw, R1, s * 0.32], 0.11, 4);
    CH(b).tube([hx, 4.3, 0], [hx - 0.1, sY + 0.9, 0], 0.13);
    for (const s of [-1, 1]) CH(b).tube([hx - 0.1, sY + 0.9, 0], [hx - 0.9, sY + 0.8, s * 1.7], 0.12, 4);
    FX(b, '#2a2426'); for (const s of [-1, 1]) b.cyl([hx - 0.75, sY + 0.82, s * 1.55], [hx - 1.25, sY + 0.78, s * 1.95], 0.2, 0.2, 6, 3);
    FX(b, '#1d1d22').arc(fxw, R1, R1 + 0.3, Math.PI * 0.05, Math.PI * 0.8, 0.34, 7, 0.1);
    CH(b).cyl([hx - 0.05, sY + 1.0, -0.9], [hx - 0.05, sY + 1.25, -0.9], 0.26, 0.22, 8, 2);
    b.part(0);
    return {
      L: 24, W: 11, H: 11.4, show: true, steerX: hx, crank: [bbX, bbY, 1.0], rearR: R2, pedal: true,
      wheels: [{ x: fxw, z: 0, r: R1, w: 0.42, kind: 'spoke', front: true }, { x: rxw, z: -5.4, r: R2, w: 0.45, kind: 'spoke' }, { x: rxw, z: 5.4, r: R2, w: 0.45, kind: 'spoke' }],
      seats: [{ x: sX - 0.1, y: sY + 0.05, z: 0, pose: 'cycle', grip: [hx - 1.0, sY + 0.8, 1.75], kidDrop: 0.4 }, { x: -7.0, y: 6.3, z: 1.8, pose: 'bench', foot: [-2.6, 2.9] }, { x: -7.0, y: 6.3, z: -1.8, pose: 'bench', foot: [-2.6, 2.9] }],
      lamps: { head: [], tail: [] }, pass: true,
    };
  });
  defModel('train_engine', (b) => {
    b.part(0);
    FX(b, '#1a1214').box(-7.5, 0.8, -4.5, 7.5, 1.6, 4.5);
    P1(b).box(-7, 1.6, -4, 7, 5.2, 4); P2(b).box(-7.05, 1.6, -4.05, 7.05, 2.2, 4.05).box(-7.05, 4.6, -4.05, 7.05, 5.2, 4.05);
    FX(b, '#1a1214').cyl([3.5, 5.2, 0], [3.5, 8.8, 0], 1.0, 1.4, 10, 3);
    FX(b, '#e8d9b5').box(-7.1, 5.2, -3.6, -2.0, 8.6, 3.6); FX(b, '#1a1214').box(-7.3, 8.6, -4.0, -1.8, 9.0, 4.0);
    CH(b).cyl([-0.5, 5.2, 0], [-0.5, 6.2, 0], 0.6, 0.6, 8, 3);
    HL(b).cyl([7.0, 4.0, 0], [7.4, 4.0, 0], 0.7, 0.7, 10, 2);
    return { L: 15, W: 9, H: 9, show: false, wheels: [-4.5, 0, 4.5].flatMap((x) => [{ x, z: -4.3, r: 1.1, w: 0.6, kind: 'solid' }, { x, z: 4.3, r: 1.1, w: 0.6, kind: 'solid' }]), seats: [], lamps: { head: [[7.4, 4.0, 0]], tail: [] } };
  });
  defModel('train_coach', (b) => {
    b.part(0);
    FX(b, '#1a1214').box(-6.5, 0.8, -4.5, 6.5, 1.6, 4.5);
    P1(b).box(-6, 1.6, -4, 6, 3.8, -3.6).box(-6, 1.6, 3.6, 6, 3.8, 4).box(-6, 1.6, -4, -5.6, 3.8, 4).box(5.6, 1.6, -4, 6, 3.8, 4);
    FX(b, '#7a2626').box(-5.6, 1.6, -3.6, 5.6, 2.6, 3.6);
    FX(b, '#e8e0d0'); for (const p of [[-5.8, -3.8], [-5.8, 3.8], [5.8, -3.8], [5.8, 3.8]]) b.tube([p[0], 3.8, p[1]], [p[0], 8.0, p[1]], 0.15, 4);
    P2(b).sweep([[-6.6, 7.9], [6.6, 7.9], [6.8, 8.3], [6.2, 8.7], [-6.2, 8.7], [-6.8, 8.3]], 4.5, 0.35);
    return { L: 13, W: 9, H: 8.8, show: false, wheels: [-3.8, 3.8].flatMap((x) => [{ x, z: -4.3, r: 1.1, w: 0.6, kind: 'solid' }, { x, z: 4.3, r: 1.1, w: 0.6, kind: 'solid' }]), seats: [{ x: -2.5, y: 2.6, z: 0, pose: 'bench', foot: [0, 1.6] }, { x: 2.5, y: 2.6, z: 0, pose: 'bench', foot: [5, 1.6] }], lamps: { head: [], tail: [] } };
  });

  /* ---------------------------------------------------------------- first-person interiors */
  // drawn instead of the body when the player drives a car / bus / lorry in first person (the body
  // has no inside). Built in the vehicle's local frame; the hood seen through the windscreen is a copy.
  /** a round dial facing -x (towards the driver) centred at (x, y, z), radius r: dark bezel, cream
   *  face (lit at night), 9 ticks over a 270 degree sweep (lower left -> lower right, clockwise as
   *  the driver sees it) and an orange needle. live: the needle is part 3, turned about x by iVB.w
   *  (the speedometer); else it rests at angle `rest` (radians, 0 = pointing right, PI/2 = up) */
  function dial(b, x, y, z, r, live, rest) {
    b.part(0);
    FX(b, '#141212').cyl([x + 0.08, y, z], [x - 0.05, y, z], r * 1.2, r * 1.12, 16, 3);
    b.slot(VLIT).color('#efe6c8').cyl([x - 0.03, y, z], [x - 0.07, y, z], r, r, 16, 2);
    FX(b, '#1a1616');
    for (let k = 0; k <= 8; k++) {
      const a = (225 - k * 33.75) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), r0 = k % 2 ? 0.74 : 0.64;
      b.tube([x - 0.08, y + sn * r * r0, z + c * r * r0], [x - 0.08, y + sn * r * 0.9, z + c * r * 0.9], r * 0.045, 3);
    }
    const a0 = live ? 225 * Math.PI / 180 : (rest == null ? Math.PI / 2 : rest), c0 = Math.cos(a0), s0 = Math.sin(a0);
    if (live) b.part(3, [0, y, z]);
    FX(b, '#e0501c').tube([x - 0.1, y - s0 * r * 0.16, z - c0 * r * 0.16], [x - 0.1, y + s0 * r * 0.82, z + c0 * r * 0.82], r * 0.045, 3);
    b.part(0);
    FX(b, '#141212').cyl([x - 0.09, y, z], [x - 0.12, y, z], r * 0.12, r * 0.12, 6, 2);
  }
  function mkCarInterior(b, md) {
    const g = md.gh, hw = md.W / 2, L = md.L, dash = md.dash || { x: g.x1 - 0.8, y: g.y0 + 0.5 };
    b.part(0);
    // hood + front fenders as seen through the windscreen
    P1(b).quadO([g.x1, g.y0 - 0.02, -g.w0 - 0.3], [g.x1, g.y0 - 0.02, g.w0 + 0.3], [L / 2 - 2.4, md.hoodY, g.w0 - 0.4], [L / 2 - 2.4, md.hoodY, -g.w0 + 0.4], 0, 1, 0);
    P1(b, 0.92).quadO([L / 2 - 2.4, md.hoodY, -g.w0 + 0.4], [L / 2 - 2.4, md.hoodY, g.w0 - 0.4], [L / 2, md.hoodY - 1.2, g.w0 - 0.8], [L / 2, md.hoodY - 1.2, -g.w0 + 0.8], 1, 0.6, 0);
    for (const s of [-1, 1]) P1(b, 0.96).quadO([g.x1, g.y0 - 0.02, s * (g.w0 + 0.3)], [L / 2 - 2.4, md.hoodY, s * (g.w0 - 0.4)], [L / 2 - 2.6, md.hoodY - 0.4, s * hw], [g.x1 - 0.2, g.y0 - 0.4, s * hw], s * 0.3, 1, 0);
    // dashboard, instrument cluster, glovebox
    FX(b, '#3a2f2c').box(dash.x - 0.2, dash.y - 1.4, -g.w0 + 0.1, g.x1 + 0.1, dash.y, g.w0 - 0.1);
    FX(b, '#2a2220').box(dash.x - 0.6, dash.y - 0.1, -g.w0 + 0.2, dash.x + 0.5, dash.y + 0.25, g.w0 - 0.2);
    // instrument cluster behind the wheel: speedometer (live needle) + fuel / temperature
    FX(b, '#201a18').box(dash.x - 0.66, dash.y - 0.38, hw * 0.36 - 1.12, dash.x - 0.5, dash.y + 0.62, hw * 0.36 + 1.02);
    dial(b, dash.x - 0.66, dash.y + 0.14, hw * 0.36 - 0.5, 0.4, true);
    dial(b, dash.x - 0.66, dash.y + 0.12, hw * 0.36 + 0.5, 0.32, false, 1.15);
    FX(b, '#4a3a34').box(dash.x - 0.66, dash.y - 1.0, -hw * 0.6, dash.x - 0.6, dash.y - 0.3, -hw * 0.2);
    // A-pillars, roof liner, header, door panels with sills, B-pillars, rear-view mirror + nimbu-mirchi
    const top = g.y1 - 0.15;
    for (const s of [-1, 1]) {
      P1(b).tube([g.x1 - 0.2, g.y0 + 0.2, s * (g.w0 - 0.2)], [g.rx1 + 0.1, top, s * (g.w1 - 0.1)], 0.28, 6);
      FX(b, '#6a5a50').box(g.x0, 2.2, s > 0 ? g.w0 - 0.45 : -g.w0, g.x1, g.y0 + 0.35, s > 0 ? g.w0 : -g.w0 + 0.45);
      P1(b, 0.8).box(g.x0, g.y0 + 0.25, s > 0 ? g.w0 - 0.5 : -g.w0, g.x1 - 0.3, g.y0 + 0.5, s > 0 ? g.w0 : -g.w0 + 0.5);
      P1(b).tube([(g.x0 + g.x1) / 2 - 1, g.y0 + 0.3, s * (g.w0 - 0.2)], [(g.rx0 + g.rx1) / 2 - 1, top, s * (g.w1 - 0.15)], 0.32, 6);
    }
    FX(b, '#d8cdb8').box(g.rx0 - 0.5, top, -g.w1, g.rx1 + 0.3, top + 0.2, g.w1);
    P1(b, 0.85).box(g.rx1 - 0.2, top - 0.35, -g.w1, g.rx1 + 0.35, top + 0.05, g.w1);
    FX(b, '#1a1a1a').box(g.rx1 - 0.6, top - 0.95, -0.85, g.rx1 - 0.45, top - 0.45, 0.85);
    FX(b, '#e8e8e0').tube([g.rx1 - 0.55, top - 0.95, 0.2], [g.rx1 - 0.6, top - 2.3, 0.25], 0.025, 3);
    FX(b, '#e8d020').ell(g.rx1 - 0.6, top - 2.45, 0.25, 0.24, 0.3, 0.24, 6, 4);
    FX(b, '#3a8a2a'); for (let k = 0; k < 4; k++) b.cyl([g.rx1 - 0.6, top - 2.7, 0.18 + k * 0.05], [g.rx1 - 0.58, top - 3.5, 0.12 + k * 0.08], 0.07, 0.03, 4, 0);
    // front bench seat
    FX(b, '#6a2a24').box(md.seats[0].x - 1.8, 2.4, -g.w0 + 0.5, md.seats[0].x + 1.2, md.seats[0].y - 0.2, g.w0 - 0.5).box(md.seats[0].x - 2.3, md.seats[0].y - 0.2, -g.w0 + 0.5, md.seats[0].x - 1.5, md.seats[0].y + 2.6, g.w0 - 0.5);
    FX(b, '#2a2a2a').box(g.x0, 2.0, -g.w0, g.x1, 2.4, g.w0);
    return { wheelAt: [dash.x - 1.1, dash.y + 0.6, hw * 0.36], wheelTilt: 0.55, wheelR: 1.25 };
  }
  function mkHeavyInterior(b, md, bus) {
    const hw = md.W / 2 - 0.5;
    const fx = bus ? 31.0 : 22.4, dashY = bus ? 12.0 : 10.8, top = bus ? 16.4 : 16.7, base = bus ? 9.2 : 9.8;
    b.part(0);
    FX(b, '#2c2a2c').box(fx - 2.0, dashY - 2.4, -hw, fx, dashY, hw);
    FX(b, '#1e1c1e').box(fx - 2.4, dashY - 0.1, -hw, fx - 1.4, dashY + 0.3, hw);
    dial(b, fx - 2.42, dashY + 0.3, -1.25, 0.46, true);
    dial(b, fx - 2.42, dashY + 0.26, 1.2, 0.38, false, 1.3);
    P1(b).box(fx - 0.6, base, -hw - 0.4, fx + 0.3, top, -hw).box(fx - 0.6, base, hw, fx + 0.3, top, hw + 0.4).box(fx - 0.6, base - 0.05, -0.18, fx + 0.2, top, 0.18);
    P1(b, 0.85).box(fx - 1.2, top - 0.8, -hw, fx + 0.3, top, hw);
    FX(b, '#cfc8b8').box(fx - 18, top, -hw - 0.3, fx + 0.2, top + 0.25, hw + 0.3);
    for (const s of [-1, 1]) { P1(b, 0.9).box(fx - 18, 2.4, s > 0 ? hw : -hw - 0.5, fx - 0.5, base + 0.4, s > 0 ? hw + 0.5 : -hw); for (let x = fx - 18; x < fx - 1; x += 6) P1(b).box(x, base, s > 0 ? hw : -hw - 0.5, x + 0.6, top, s > 0 ? hw + 0.5 : -hw); }
    FX(b, '#5a5a5e').box(fx - 6, 2.4, 2.2, fx - 2.4, 6.4, 6.0);
    if (bus) { CH(b); for (const s of [-1, 1]) b.tube([fx - 18, top - 0.8, s * 3.0], [fx - 3, top - 0.8, s * 3.0], 0.1, 5); FX(b, '#c9a227').box(fx - 1.4, top - 1.3, -1.6, fx - 1.2, top - 0.9, 1.6); }
    else { // a marigold string across the top of the windscreen (above the eye line), orange and yellow
      let k = 0;
      for (let z = -hw + 0.5; z < hw - 0.3; z += 0.34, k++) FX(b, k % 3 === 2 ? '#f2c230' : '#ff8a1a').ell(fx - 1.0, top - 0.32 - Math.sin(((z + hw) / (2 * hw)) * Math.PI) * 0.32, z, 0.15, 0.15, 0.15, 6, 3);
      FX(b, '#c03030').ell(fx - 1.0, top - 0.9, 0, 0.22, 0.3, 0.22, 6, 4); // the little hanging tassel
    }
    FX(b, '#2a2a2a').box(fx - 18, 2.0, -hw, fx, 2.4, hw);
    return { wheelAt: [fx - 4.0, dashY + 0.8, 0], wheelTilt: 1.15, wheelR: 2.0 };
  }
  // the double-decker's top deck in first person (wherever he stands or sits): the deck's furniture with the pillars
  // between the open windows, the front and back window frames, the ceiling. No body round it, no steering wheel.
  function mkDeckerInterior(b) {
    const Y = DDL(), hw = 9, top = Y.top - 0.6, x0 = -30.9, x1 = 31.1, PILLAR = '#8a7a5a';
    b.part(0);
    deckFurniture(b, { pillars: true });
    FX(b, '#e6dfcc').box(x0, top, -hw, x1, top + 0.3, hw);
    FX(b, PILLAR).box(x1 - 0.5, DD_WIN[0], -0.3, x1, 23.6, 0.3).box(x1 - 0.5, 23.6, -hw, x1, top, hw).box(x1 - 0.5, DD_WIN[0], -hw, x1, 23.6, -8.2).box(x1 - 0.5, DD_WIN[0], 8.2, x1, 23.6, hw);
    FX(b, PILLAR).box(x0, 18.0, -hw, x0 + 0.4, 23.2, -7.6).box(x0, 18.0, 7.6, x0 + 0.4, 23.2, hw).box(x0, 23.2, -hw, x0 + 0.4, top, hw);
    return { wheelAt: null };
  }
  const INTERIORS = {};
  function interior(md) {
    let it = INTERIORS[md.key];
    if (it) return it;
    const b = new AB();
    const meta = md.cockpit === 'car' ? mkCarInterior(b, md) : md.cockpit === 'decker' ? mkDeckerInterior(b) : mkHeavyInterior(b, md, md.cockpit === 'bus');
    it = INTERIORS[md.key] = Object.assign({ geo: b.build(), pool: null }, meta);
    it.pool = new Pool('int:' + md.key, it.geo, VEH_MAT, 1, { iVA: 4, iVB: 4 }, { max: 4 });
    return it;
  }
  let STEER_POOL = null;
  function buildSteeringWheel() {
    const b = new AB();
    b.part(0);
    FX(b, '#1c1a1a').xf(new THREE.Matrix4()).ringZ([[0.86, -0.1], [0.94, -0.13], [1.03, -0.1], [1.06, 0], [1.03, 0.1], [0.94, 0.13], [0.86, 0.1]], 32).xf(null);
    FX(b, '#2a2626'); for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * (TAU / 3); b.tube([0, 0, 0], [Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.02], 0.09, 5); }
    FX(b, '#262222').cyl([0, 0, -0.08], [0, 0, 0.14], 0.3, 0.27, 12, 3);
    FX(b, '#6a6a70').cyl([0, 0, 0.14], [0, 0, 0.16], 0.075, 0.075, 8, 2); // the small horn emblem
    FX(b, '#2a2626').cyl([0, 0, -0.1], [0, 0, -1.8], 0.12, 0.12, 5, 0);
    return b.build();
  }

  /* ---------------------------------------------------------------- wheels */
  function buildWheel(kind) {
    const b = new AB();
    if (kind === 'spoke') {
      FX(b, '#1c1a1c').ringZ([[0.84, -0.42], [0.95, -0.5], [1.0, 0], [0.95, 0.5], [0.84, 0.42]], 18);
      CH(b).ringZ([[0.8, -0.25], [0.86, -0.3], [0.86, 0.3], [0.8, 0.25]], 18);
      CH(b).cyl([0, 0, -0.5], [0, 0, 0.5], 0.09, 0.09, 6, 3);
      FX(b, '#a8acb0'); for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, s = k % 2 ? 1 : -1; b.tube([Math.cos(a + 0.2) * 0.06, Math.sin(a + 0.2) * 0.06, s * 0.4], [Math.cos(a) * 0.82, Math.sin(a) * 0.82, s * 0.08], 0.022, 3); }
    } else {
      FX(b, '#1c1a1c').ringZ([[0.6, -0.48], [0.9, -0.5], [1.0, -0.3], [1.0, 0.3], [0.9, 0.5], [0.6, 0.48]], 16);
      FX(b, '#3a3a3e').cyl([0, 0, -0.44], [0, 0, 0.44], 0.62, 0.62, 12, 0);
      CH(b).cyl([0, 0, 0.44], [0, 0, 0.5], 0.5, 0.42, 12, 2).cyl([0, 0, -0.44], [0, 0, -0.5], 0.5, 0.42, 12, 2);
      FX(b, '#5a5a60'); for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; b.ell(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.52, 0.06, 0.06, 0.04, 4, 2).ell(Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.52, 0.06, 0.06, 0.04, 4, 2); }
    }
    return b.build();
  }
  let WHEELS = null;

  /* ---------------------------------------------------------------- decal atlas (painted lettering) */
  const DEC = { canvas: null, g: null, tex: null, cells: new Map(), n: 0, CW: 256, CHh: 64, cols: 4, rows: 16, dirty: false, pool: null };
  const SLOGANS = ["Mother's Gift", 'Sound Horn', 'Hum Do Hamare Do', 'Buri Nazar Wale Tera Muh Kala', 'Wait for Signal', 'Jai Bolo'];
  function decalFont(px, w) { return (w || '800') + ' ' + px + "px 'Baloo 2', 'Yatra One', system-ui, sans-serif"; }
  function paintDecal(g, key, x, y, W, Hh) {
    const [kind, arg] = key.split(':');
    g.save(); g.beginPath(); g.rect(x, y, W, Hh); g.clip();
    const text = (t, col, px, yy, weight) => { g.font = decalFont(px, weight); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; let s = 1; const tw = g.measureText(t).width; if (tw > W - 12) s = (W - 12) / tw; g.save(); g.translate(x + W / 2, yy); g.scale(s, 1); g.fillText(t, 0, 0); g.restore(); };
    if (kind === 'hornok') {
      g.fillStyle = '#f4e8c8'; g.fillRect(x, y, W, Hh); g.strokeStyle = '#7a3a1a'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, W - 4, Hh - 4);
      g.font = decalFont(26); g.textBaseline = 'middle'; g.textAlign = 'left';
      const parts = [['HORN ', '#b22b2b'], ['OK ', '#1a3a8a'], ['PLEASE', '#b22b2b']];
      let tw = 0; for (const p of parts) tw += g.measureText(p[0]).width;
      let cx = x + (W - tw) / 2; for (const p of parts) { g.fillStyle = p[1]; g.fillText(p[0], cx, y + Hh / 2 + 2); cx += g.measureText(p[0]).width; }
      g.fillStyle = '#2a8a4a'; g.fillRect(x + 8, y + Hh - 9, W - 16, 3);
    } else if (kind === 'dipper') {
      g.fillStyle = '#1a1214'; g.fillRect(x, y, W, Hh); text('USE DIPPER AT NIGHT', '#f2c230', 22, y + Hh / 2 + 2);
    } else if (kind === 'apsrtc') {
      g.clearRect(x, y, W, Hh); text('A.P.S.R.T.C.', '#a8201c', 40, y + Hh / 2 + 3);
    } else if (kind === 'citybus') {
      g.clearRect(x, y, W, Hh); text('CITY BUS', '#fff4dc', 40, y + Hh / 2 + 3);
    } else if (kind === 'route') {
      g.fillStyle = '#141214'; g.fillRect(x, y, W, Hh); g.fillStyle = '#f2c230'; g.fillRect(x + 6, y + 6, W - 12, Hh - 12); text(arg || '127K', '#141214', 40, y + Hh / 2 + 3);
    } else if (kind === 'plate' || kind === 'plate_y') {
      g.fillStyle = '#1a1a1a'; g.fillRect(x + 24, y + 6, W - 48, Hh - 12); g.fillStyle = kind === 'plate_y' ? '#f2c230' : '#f4f2ea'; g.fillRect(x + 28, y + 10, W - 56, Hh - 20);
      text(arg, '#141214', 30, y + Hh / 2 + 2, '700');
    } else if (kind === 'slogan') {
      g.clearRect(x, y, W, Hh); text(arg, '#141214', 30, y + Hh / 2 + 2);
    } else if (kind === 'name') {
      g.clearRect(x, y, W, Hh); text(arg, '#141214', 38, y + Hh / 2 + 2);
    }
    g.restore();
  }
  function decalUV(key) {
    let c = DEC.cells.get(key);
    if (c) return c;
    if (DEC.n >= DEC.cols * DEC.rows) return DEC.cells.values().next().value;
    const i = DEC.n++, cx = (i % DEC.cols) * DEC.CW, cy = Math.floor(i / DEC.cols) * DEC.CHh;
    paintDecal(DEC.g, key, cx, cy, DEC.CW, DEC.CHh);
    DEC.dirty = true;
    const W = DEC.canvas.width, Hh = DEC.canvas.height;
    c = [cx / W + 0.5 / W, 1 - (cy + DEC.CHh) / Hh + 0.5 / Hh, DEC.CW / W - 1 / W, DEC.CHh / Hh - 1 / Hh];
    DEC.cells.set(key, c);
    return c;
  }
  function plateText(seed, y) {
    const r = Math.abs(seed | 0);
    const L = 'ABCDEGHKMNPTVWXYZ'[r % 17];
    return 'AP ' + (y ? ['09', '10', '11', '13', '28'][r % 5] : ['09', '10', '11', '12', '13'][(r >> 3) % 5]) + ' ' + (y ? 'T' : L) + ' ' + String(1000 + ((r * 7919) % 9000));
  }
  function decalKey(cell, v) {
    const seed = (v.seed | 0) % 12;
    switch (cell) {
      case 'plate': return 'plate:' + plateText(seed * 97 + 11, false);
      case 'plate_y': return 'plate_y:' + plateText(seed * 131 + 5, true);
      case 'route': return 'route:' + (v.route || (v.T && v.T.routes && v.T.routes[0]) || '127K');
      case 'auto_slogan': return v.label ? 'name:' + v.label : 'slogan:' + SLOGANS[Math.abs(v.seed | 0) % SLOGANS.length];
      default: return cell;
    }
  }
  const FACE_YAW = { F: Math.PI / 2, B: -Math.PI / 2, R: 0, L: Math.PI };

  /* ---------------------------------------------------------------- glows (night lamps) + light pools + blobs */
  const GLOW = { n: 0, cap: 1536, pos: null, col: null, size: null, geo: null, pts: null, mat: null };
  function glow(x, h, y, r, g, bl, size) {
    if (!GLOW.pts || GLOW.n >= GLOW.cap) return;
    const i = GLOW.n++, o = i * 3;
    GLOW.pos[o] = x; GLOW.pos[o + 1] = h; GLOW.pos[o + 2] = y;
    GLOW.col[o] = r; GLOW.col[o + 1] = g; GLOW.col[o + 2] = bl;
    GLOW.size[i] = size;
  }
  const GLOW_VS = [
    'attribute vec3 gCol; attribute float gSize; uniform float uScale; uniform float uFogNear; uniform float uFogFar; varying vec3 vC;',
    'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(1.0, -mv.z);',
    '  gl_PointSize = clamp(gSize * uScale / d, 0.0, 220.0); vC = gCol * (1.0 - smoothstep(uFogNear, uFogFar, d)); }',
  ].join('\n');
  const GLOW_FS = 'uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).r; gl_FragColor = vec4(vC * a, 1.0); }';
  function initGlows() {
    const g = new THREE.BufferGeometry();
    GLOW.pos = new Float32Array(GLOW.cap * 3); GLOW.col = new Float32Array(GLOW.cap * 3); GLOW.size = new Float32Array(GLOW.cap);
    g.setAttribute('position', new THREE.BufferAttribute(GLOW.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('gCol', new THREE.BufferAttribute(GLOW.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('gSize', new THREE.BufferAttribute(GLOW.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: H.materials.glow.map }, uScale: { value: 400 }, uFogNear: { value: 400 }, uFogFar: { value: 1500 } } });
    const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 8; p.name = 'actors:glows';
    ROOT.add(p);
    GLOW.geo = g; GLOW.pts = p; GLOW.mat = m;
  }
  function commitGlows() {
    const n = GLOW.n, g = GLOW.geo;
    g.setDrawRange(0, n);
    GLOW.pts.visible = n > 0;
    if (n) for (const k of ['position', 'gCol', 'gSize']) { const a = g.attributes[k]; a.needsUpdate = true; a.updateRange.offset = 0; a.updateRange.count = n * a.itemSize; }
    const cam = H.camera, r = H.renderer;
    const hgt = r.domElement.height || 720;
    GLOW.mat.uniforms.uScale.value = hgt / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const fog = H.scene.fog;
    if (fog) { GLOW.mat.uniforms.uFogNear.value = fog.near; GLOW.mat.uniforms.uFogFar.value = fog.far; }
    ST.glows = n; GLOW.n = 0;
  }
  let LPOOL = null, BLOB = null, BLOBS = false;
  function initLightPools() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(64, 128);
    for (let j = 0; j < 128; j++) for (let i = 0; i < 64; i++) {
      const u = (i + 0.5) / 64 - 0.5, v = 1 - (j + 0.5) / 128; // v: 0 at the vehicle, 1 far
      const wdt = 0.16 + v * 0.34;
      const side = Math.max(0, 1 - Math.pow(Math.abs(u) / wdt, 2));
      const along = Math.pow(Math.sin(Math.min(1, v * 1.15) * Math.PI) , 0.7) * (1 - v * 0.55);
      const a = Math.max(0, Math.min(1, side * along));
      const o = (j * 64 + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.round(a * 255); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
    LPOOL = new Pool('lightPools', geo, mat, 32, { instanceColor: 3 }, { receive: false, order: 3, max: 256 });
    LPOOL.mesh.castShadow = false;
    // blob shadows (phones: no shadow map)
    BLOBS = !H.quality.shadows;
    const bgeo = new THREE.PlaneGeometry(1, 1); bgeo.rotateX(-Math.PI / 2);
    const bmat = new THREE.MeshBasicMaterial({ map: H.materials.blob.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    BLOB = new Pool('blobs', bgeo, bmat, 64, {}, { receive: false, order: 1, max: 1024 });
    BLOB.mesh.castShadow = false;
  }
  function lightPool(fr, lx, len, wid, k) {
    if (!LPOOL || !OPT.pools) return;
    const i = LPOOL.add(); if (i < 0) return;
    fr.write(LPOOL.M, i * 16, lx, 0.18 - fr.y, 0, 0, 0, 0, len, 1, wid);
    const c = LPOOL.A.instanceColor.array; c[i * 3] = 1.0 * k; c[i * 3 + 1] = 0.86 * k; c[i * 3 + 2] = 0.62 * k;
  }
  function blob(x, z, w, d, a, h) {
    if (!BLOB || !OPT.blobs) return;
    const i = BLOB.add(); if (i < 0) return;
    FR2.set(x, (h || 0) + 0.1, z, -(a || 0), 0, 0).write(BLOB.M, i * 16, 0, 0, 0, 0, 0, 0, w, 1, d);
  }

  /* ---------------------------------------------------------------- vehicle submission */
  const MODEL_OF = {
    cycle: 'cycle', bsa_cycle: 'cycle', ladiescycle: 'ladies', hero_cycle: 'hero', old_cycle: 'hero', chinnu_cycle: 'hero_low', hercules_cycle: 'hercules', hercules_gears: 'hercules',
    kid_cycle: 'kid', scooty: 'scooty', akka_scooty: 'scooty', luna: 'luna', pochaiah_luna: 'luna_police', chetak: 'chetak', family_chetak: 'chetak', pasha_lambretta: 'lambretta',
    rx100: 'rx100', bunty_rx100: 'rx100', auto: 'auto', yadagiri_auto: 'auto', ambassador: 'ambassador', govt_ambassador: 'ambassador_govt', taxi_ambassador: 'ambassador_taxi',
    maruti800: 'maruti', padmini: 'padmini', lux_sedan: 'luxsedan', suv: 'suv', bus: 'bus', decker_bus: 'bus_decker', safari_bus: 'bus_safari', lorry: 'lorry', peacock_lorry: 'lorry_open', boat: 'boat', rickshaw: 'rickshaw',
  };
  const LOOK_MODEL = { hero: 'hero', cycle: 'cycle', hercules: 'hercules', kid: 'kid', scooty: 'scooty', luna: 'luna', chetak: 'chetak', rx100: 'rx100', ladies: 'ladies' };
  const CLS_MODEL = { bike: 'cycle', car: 'ambassador', auto: 'auto', heavy: 'lorry', boat: 'boat' };
  function modelKeyFor(T) {
    if (!T) return 'ambassador';
    if (T._m3d) return T._m3d;
    let k = MODEL_OF[T.id];
    if (!k && T.bikeLook && LOOK_MODEL[T.bikeLook]) k = LOOK_MODEL[T.bikeLook];
    let base = T.base, guard = 0;
    const TY = (N.vehicles && N.vehicles.TYPES) || {};
    while (!k && base && guard++ < 6) { k = MODEL_OF[base]; base = TY[base] && TY[base].base; }
    if (!k) k = CLS_MODEL[T.cls] || 'ambassador';
    if (k === 'cycle' && T.pedal && T.cls === 'bike' && T.basket) k = 'ladies';
    T._m3d = k;
    return k;
  }
  function vpool(md) {
    if (!md.pool) md.pool = new Pool('veh:' + md.key, md.geo, VEH_MAT, 8, { iVA: 4, iVB: 4 }, { cast: true, max: 512, glassIndex: md.glassIndex, glassMat: GLASS_MAT });
    return md.pool;
  }
  const A0 = [0, 0], A1 = [0, 0];
  function riderLookOf(v) {
    const d = v.driver;
    if (d && d.look) return d.look;
    if (!v._look) { try { v._look = N.people.randomLook(U.rng(v.seed), 'man'); } catch (e) { v._look = { kind: 'man' }; } }
    return v._look;
  }
  function extraLook(v, k) {
    if (!v._x3d) v._x3d = [];
    if (!v._x3d[k]) { const r = U.rng((v.seed | 0) + 17 * (k + 1)); v._x3d[k] = N.people.randomLook(r, r.next() < 0.35 ? 'aunty' : r.next() < 0.5 ? 'kid' : r.next() < 0.5 ? 'man' : 'woman'); }
    return v._x3d[k];
  }
  /** seat a person (look) on a vehicle in the vehicle frame FR */
  /* KAINCHI ("scissors"): a kid too small for an adult's roadster rides standing on the pedals beside
   * the frame, the right leg through the triangle to the far pedal, both hands on the bar, the cycle
   * leaning away to the right so the body stays upright over the wheels, rising and falling with the
   * stroke (vehicles.js draws the same in 2D). The numbers come from an offline search over the Hero
   * geometry for a kid (every crank angle reachable, the right leg crossing the frame plane >= 0.6 u
   * under the top tube, the grips reachable with the least forward lean, body turned a little
   * towards the bar). Writes J (legs by IK + hip abduction, arms to the grips);
   * returns the person root [x, y, z, yaw, roll] in the vehicle frame. */
  const KAINCHI = { dx: 1.0, hy: 4.1, bob: 0.08, hz: -0.7, yaw: -0.2, roll: -0.2, pz: 0.88, tilt: 0.2 };
  const KF = new Frame(), KQ = [0, 0, 0], KR = [0, 0, 0, 0, 0], KL = [0, 0, 0, 0];
  const KAI_J = new WeakMap(); // actor -> its last kainchi pose (getting off blends from it)
  function kainchiPose(md, seat, sc, sx, o) {
    const K = KAINCHI, c = o.crank || 0, Rk = md.crank[2], bxk = md.crank[0] * sx, byk = md.crank[1];
    KF.set(0, 0, 0, K.yaw, K.roll, 0);
    const m = KF.m, hx = bxk + K.dx, hz = K.hz;
    let hy = K.hy + K.bob * Math.cos(2 * c), rx = 0, ry = 0, rz = 0;
    const loc = (x, y, z) => { // vehicle frame -> the person's template coordinates
      const dx = x - rx, dy = y - ry, dz = z - rz;
      KQ[0] = (m[0] * dx + m[3] * dy + m[6] * dz) / sc; KQ[1] = (m[1] * dx + m[4] * dy + m[7] * dz) / sc; KQ[2] = (m[2] * dx + m[5] * dy + m[8] * dz) / sc;
      return KQ;
    };
    for (let it = 0; it < 3; it++) { // root (feet point) from the hip centre; drop the hips if the low pedal is out of reach
      KF.apply(0, HIP_Y * sc, 0, P3); rx = hx - P3[0]; ry = hy - P3[1]; rz = hz - P3[2];
      let over = 0;
      for (const sd of [-1, 1]) {
        loc(bxk + sd * Math.cos(c) * Rk - 0.25, byk + sd * Math.sin(c) * Rk + 0.18 + ANK_Y * sc, sd * K.pz);
        const dx = KQ[0], dy = KQ[1] - HIP_Y, dz = KQ[2] - sd * HIP_Z, k = sd < 0 ? 0 : 1;
        KL[k * 2] = dx; KL[k * 2 + 1] = HIP_Y - Math.hypot(dy, dz);
        J[16 + k] = Math.atan2(sd * dz, -dy); // the right leg swings out through the frame, the left one in
        over = Math.max(over, Math.hypot(dx, dy, dz) - LEG * 0.975);
      }
      if (over <= 0) break;
      hy -= over * sc;
    }
    legsTo(J, KL[0], KL[1], KL[2], KL[3]);
    flatFeet(J, -0.1 + 0.15 * Math.sin(c), -0.1 - 0.15 * Math.sin(c));
    // hands on the grips, turned with the bar
    const gx = seat.grip ? seat.grip[0] * sx : bxk + 3.2, gy = seat.grip ? seat.grip[1] : 5.9, gz = seat.grip ? seat.grip[2] : 1.75;
    let lx = gx, lz = -gz, gxr = gx, rz2 = gz;
    const st = o.steer || 0;
    if (st && md.steerX != null) {
      const px = md.steerX * sx, cs = Math.cos(st), sn = Math.sin(st);
      lx = px + (gx - px) * cs + gz * sn; lz = (gx - px) * sn - gz * cs;
      gxr = px + (gx - px) * cs - gz * sn; rz2 = (gx - px) * sn + gz * cs;
    }
    loc(lx, gy, lz); const qx = KQ[0], qy = KQ[1], qz = KQ[2];
    loc(gxr, gy, rz2);
    armsTo(J, 0.35, qx, qy, qz, KQ[0], KQ[1], KQ[2], 0.95, -0.9);
    J[13] = J[10] * 0.7; // eyes up the road past the bar
    KR[0] = rx; KR[1] = ry; KR[2] = rz; KR[3] = K.yaw; KR[4] = K.roll;
    return KR;
  }
  function submitRider(md, seat, look, seed, sx, o) {
    if (!look || !seat) return;
    const s = lookSpec(look, seed), sc = s.size;
    let hy = seat.y; if (s.kid && seat.kidDrop) hy -= seat.kidDrop;
    const hx = seat.x * sx, hz = seat.z || 0;
    const rootY = hy - HIP_Y * sc;
    const T = (x, y, out) => { out[0] = (x - hx) / sc; out[1] = (y - rootY) / sc; return out; };
    let yaw2 = 0, roll2 = 0, seated = true, tx = hx, ty = rootY, tz = hz;
    poseRest(J);
    const pose = seat.pose;
    if (pose === 'cycle' && o.kainchi && md.crank) {
      const K = kainchiPose(md, seat, sc, sx, o);
      tx = K[0]; ty = K[1]; tz = K[2]; yaw2 = K[3]; roll2 = K[4]; seated = false;
      if (o.actor) { let kj = KAI_J.get(o.actor); if (!kj) { kj = new Float32Array(18); KAI_J.set(o.actor, kj); } kj.set(J); }
    } else if (pose === 'cycle' || pose === 'scooter' || pose === 'moto' || pose === 'auto' || pose === 'car') {
      const lean = pose === 'cycle' ? 0.3 : pose === 'moto' ? 0.38 : pose === 'scooter' ? 0.08 : pose === 'auto' ? 0.12 : 0.06;
      let gx = seat.grip ? seat.grip[0] * sx : hx + 3, gy = seat.grip ? seat.grip[1] : hy + 1.5, gz = seat.grip ? seat.grip[2] : 1.2;
      let lx = gx, lz = hz - gz, rx = gx, rz = hz + gz; // grips either side of the seat's centre line
      if (o.grips) { lx = o.grips[0]; gy = o.grips[1]; lz = o.grips[2]; rx = o.grips[3]; rz = o.grips[5]; T(lx, gy, A0); T(rx, o.grips[4], A1); }
      else {
        const st = o.steer || 0;
        if (st && md.steerX != null) {
          const px = md.steerX * sx, c = Math.cos(st), sn = Math.sin(st);
          lx = px + (gx - px) * c - (-gz) * sn; lz = (gx - px) * sn + (-gz) * c;
          rx = px + (gx - px) * c - gz * sn; rz = (gx - px) * sn + gz * c;
        }
        T(lx, gy, A0); T(rx, gy, A1);
      }
      armsTo(J, lean, A0[0], A0[1], (lz - hz) / sc, A1[0], A1[1], (rz - hz) / sc, pose === 'car' ? 0.32 : pose === 'cycle' || pose === 'moto' ? 0.8 : 0.62);
      if (md.crank && pose === 'cycle') {
        const c = o.crank || 0, R = md.crank[2], bx = md.crank[0] * sx, by = md.crank[1];
        const pxr = bx + Math.cos(c) * R, pyr = by + Math.sin(c) * R, pxl = bx - Math.cos(c) * R, pyl = by - Math.sin(c) * R;
        T(pxl - 0.25, pyl + 0.18 + ANK_Y * sc, A0); T(pxr - 0.25, pyr + 0.18 + ANK_Y * sc, A1);
        legsTo(J, A0[0], A0[1], A1[0], A1[1]);
        flatFeet(J, -0.12 + 0.18 * Math.sin(c), -0.12 - 0.18 * Math.sin(c)); // ankling through the pedal stroke
      } else if (seat.foot) {
        T(seat.foot[0] * sx, seat.foot[1] + ANK_Y * sc, A0);
        legsTo(J, A0[0], A0[1], A0[0], A0[1]); flatFeet(J);
        if (pose === 'moto' || pose === 'scooter') { J[8] += 0.02; }
      } else { J[0] = J[1] = 1.45; J[2] = J[3] = -1.4; }
      if (pose === 'scooter' || pose === 'moto') { J[0] += 0.04; J[1] += 0.04; }
    } else if (pose === 'pillion') {
      if (s.wrap && s.kind !== 'uncle' && s.kind !== 'lungi') { // aunties ride side-saddle, legs over the left side
        yaw2 = Math.PI / 2; seated = false; poseSit(J, 0.5); J[0] = J[1] = 1.35; J[2] = J[3] = -1.5; J[6] = J[7] = 1.1;
      } else {
        poseSit(J, 0.5);
        if (seat.foot) { T(seat.foot[0] * sx, seat.foot[1] + ANK_Y * sc, A0); legsTo(J, A0[0], A0[1], A0[0], A0[1]); flatFeet(J); }
        const d0 = md.seats[0];
        if (d0) { T(d0.x * sx + 0.6, d0.y + 1.3, A0); armsTo(J, 0.12, A0[0], A0[1], -0.95, A0[0], A0[1], 0.95); }
      }
    } else if (pose === 'bench') {
      poseSit(J, 0.25);
      if (seat.foot) { T(seat.foot[0] * sx, seat.foot[1] + ANK_Y * sc, A0); legsTo(J, A0[0], A0[1], A0[0], A0[1]); flatFeet(J); }
    } else if (pose === 'boatman') {
      poseSit(J, 0.3);
      T(-14.0 * sx, seat.y + 0.4, A0); armsTo(J, 0.05, 0.6, 5.0, -0.9, A0[0], A0[1], 0.9);
    }
    // getting on: from standing beside the vehicle (its left side) onto the seat
    let rx = tx, ry = ty, rz = tz;
    const m = o.actor ? MOUNT.get(o.actor) : null;
    if (m && m.on) {
      const k = (nowS() - m.t0) / MOUNT_S;
      if (k < 1) {
        const q = ease(Math.max(0, k));
        const sj = J.slice(); poseStand(J, H.time, seed); // standing beside it -> the riding pose
        blendPose(J, sj, 1 - q);
        J[12] = sj[12]; J[13] = sj[13]; J[14] = sj[14];
        const sideZ = -(md.W / 2 + 2.2);
        rx = tx; rz = sideZ + (tz - sideZ) * q;
        ry = (-FR.y) * (1 - q) + ty * q + Math.sin(q * Math.PI) * 1.0;
        seated = seated && q > 0.5; roll2 *= q; yaw2 *= q;
      } else MOUNT.delete(o.actor);
    }
    if (DBG.riderNext && DBG.rec) { DBG.rec.riders = DBG.rec.riders || []; DBG.rec.riders.push({ pose: o.kainchi && pose === 'cycle' ? 'kainchi' : pose, J: Array.from(J), seated, fpsHide: !!o.fpsHide, kid: s.kid, root: [rx, ry, rz], yaw: yaw2, roll: roll2, size: sc }); }
    // first person on a kainchi ride: the eye sits over the saddle, not where his head is, so only his
    // arms are drawn (hands on the grips), not his back hanging off the side below the camera
    // on two-wheelers / autos the core's eye sits a little behind his head: no torso or neck in the
    // way (hands on the grips and the knees stay); in a car cockpit the body is below the eye
    submitPerson(look, seed, FR, rx, ry, rz, J, { yaw: yaw2, roll: roll2, fpsHide: o.fpsHide, armsOnly: !!(o.kainchi && pose === 'cycle'), noBody: pose !== 'car', noBlob: true, near: o.near, seated });
  }
  /* ---------------------------------------------------------------- the city bus crowd
   * Traffic / parked buses carry life the 2D roof hides: the driver at the wheel (right-hand drive)
   * seen through the windscreen, passengers standing in the aisle holding the overhead rail and
   * swaying with the bus (heads and shoulders in the windows), and up to three footboard boys
   * hanging off the rear door step, one hand on the door pole, leaning out. Looks are per bus
   * (seeded), the crowd size too; only near the camera (cheap instanced people). */
  const BUS_DRIVER = { x: 26.4, y: 9.0, z: 5.0, pose: 'car', grip: [29.0, 10.5, 1.0], foot: [29.6, 5.2] };
  const BF = new Frame(), BQ = [0, 0, 0];
  function busLook(v, k, kind) {
    if (!v._bus) v._bus = [];
    if (!v._bus[k]) { const r = U.rng((v.seed | 0) * 31 + 7 * k + 3); v._bus[k] = N.people.randomLook(r, kind || (r.next() < 0.3 ? 'aunty' : r.next() < 0.3 ? 'student' : r.next() < 0.5 ? 'man' : 'uncle')); }
    return v._bus[k];
  }
  function busLife(v, md, sx, steer) {
    const d = camDist(v.x, 8 + TH(v.x, v.y), v.y);
    if (d > 300 || v.fallen) return;
    const seed = (v.seed | 0) & 0xffff, t = H.time, pl = N.player;
    const low = H.quality.tier === 'low';
    const crowdN = (low ? 2 + (seed % 4) : 4 + (seed % 9)) * (d < (low ? 120 : 170) ? 1 : 0), boys = v.driver ? (seed >> 3) % 4 : 0;
    const accel = clamp((v.throttle || 0) * 0.5 - (v.ctl && v.ctl.brake ? 0.6 : 0), -0.6, 0.5);
    const rail = md.bus ? md.bus.rail : 15.1;
    if (DBG.track === v && DBG.rec) DBG.rec.bus = { crowd: crowdN, boys };
    if (v.driver && v.driver !== pl && d < 220) submitRider(md, BUS_DRIVER, riderLookOf(v), v.seed, sx, { steer });
    // standing in the aisle, one hand up on the rail (inside: only near enough to see through the glass)
    {
      for (let k = 0; k < crowdN; k++) {
        const look = busLook(v, k), s = lookSpec(look, seed + k), sc = s.size;
        const x = (-24 + (k * 37 % 47)) * sx, z = ((k * 13) % 5 - 2) * 0.9, floor = 4.4;
        poseStand(J, t, seed + k);
        const sway = Math.sin(t * 1.3 + k) * 0.03 - accel * 0.18;
        armsTo(J, sway, 0.25, (rail - floor) / sc, 0.5, 0.2, (rail - floor) / sc - 0.2, 0.9, 0, -0.9);
        J[4] = 0.1 + 0.05 * Math.sin(t + k); J[6] = 0.3; J[8] = 0.1; // the other hand down (a bag, a tiffin)
        J[12] = Math.sin(t * 0.3 + k * 1.7) * 0.6;
        submitPerson(look, seed + k, FR, x, floor, z, J, { yaw: k % 3 === 0 ? Math.PI / 2 : k % 3 === 1 ? -Math.PI / 2 : 0, noBlob: true });
      }
    }
    // footboard boys at the rear door (left side): standing on the step, a hand on the door pole, leaning out
    for (let k = 0; k < boys; k++) {
      const look = busLook(v, 20 + k, k % 2 ? 'student' : 'man'), s = lookSpec(look, seed + 50 + k), sc = s.size;
      const doorX = (md.bus ? md.bus.doorX : -8.2) * sx, hw = md.W / 2, rx = doorX + (k - (boys - 1) / 2) * 1.5, rz = -hw - 0.75 - (k === 1 ? 0.3 : 0);
      BF.set(0, 0, 0, -Math.PI / 2, 0, 0); // facing +z: into the bus
      const loc = (x, y, z) => { const m = BF.m, dx = x - rx, dy = y - 2.25, dz = z - rz; BQ[0] = (m[0] * dx + m[3] * dy + m[6] * dz) / sc; BQ[1] = (m[1] * dx + m[4] * dy + m[7] * dz) / sc; BQ[2] = (m[2] * dx + m[5] * dy + m[8] * dz) / sc; return BQ; };
      poseStand(J, t, seed + 50 + k);
      const back = -0.22 - 0.06 * Math.sin(t * 2.1 + k) - Math.abs(accel) * 0.12; // hanging back off the pole
      loc(doorX, 11.6 - k * 0.5, -hw - 0.05); const lx = BQ[0], ly = BQ[1], lz = BQ[2]; // the door pole
      loc(doorX, 10.2 - k * 0.4, -hw - 0.05);
      armsTo(J, back, lx, ly, lz, BQ[0], BQ[1], BQ[2], 0, -0.9);
      if (k === boys - 1 && boys > 1) { J[5] = 0.35 + 0.25 * Math.sin(t * 3 + k); J[7] = 0.2; J[9] = 0.9; } // the last one waves an arm free
      J[12] = -0.7 + 0.2 * Math.sin(t * 0.7 + k); // looking along the road ahead
      submitPerson(look, seed + 50 + k, FR, rx, 2.25, rz, J, { yaw: -Math.PI / 2, noBlob: true });
    }
  }
  // the double-decker's top deck: about half its seats taken (decker.js: the same people as the 2D cutaway), drawn in
  // first person too (they sit behind him); the player in the seat he took, or (DECK_P) walking about / standing,
  // drawn at the end of vehicleEntity through personEntity (which sets its own frame)
  let DECK_P = null;
  function deckerUpper(v, md, sx, fps) {
    const DK = N.decker;
    if (!DK || v.fallen) return;
    const pl = N.player, deck = DK.onDeck(pl) && DK.state.v === v, d = camDist(v.x, 20, v.y);
    if (!deck && d > (H.quality.tier === 'low' ? 140 : 230)) return;
    const looks = DK.looks(v);
    for (const s of DK.SEATS) { const look = looks[s.i]; if (look && (deck || d < 200 || s.i % 2)) submitRider(md, s, look, (v.seed | 0) + 101 + s.i, sx, {}); }
    if (!deck) return;
    const st = DK.state;
    if (st.sit >= 0) submitRider(md, DK.SEATS[st.sit], pl.look, 7, sx, { fpsHide: fps, near: true, actor: pl });
    else DECK_P = v;
    // the passengers walking the aisle (getting off at a stop, finding a seat): drawn like him, at the end
    let k = 0;
    for (const w of DK.walkers(v)) {
      const e = w.ent || (w.ent = { id: 70000 + ((v.seed | 0) & 0xfff) * 16 + (k & 15), look: w.look, anim: { phase: 0, speed: 0, run: false }, vx: 0, vy: 0, alive: true });
      const q = DK.toWorld(v, w.x, w.z);
      e.x = q.x; e.y = q.y; e.angle = e.facing = (v.angle || 0) + w.a; e.speed3 = w.sp;
      DECK_W.push(e); k++;
    }
  }
  const DECK_W = [];
  const SW = [0, 0, 0, 0, 0, 0];
  function vehicleEntity(v) {
    const T = v.T || (N.vehicles && N.vehicles.TYPES[v.type]) || null;
    const pl = N.player, mine = !!pl && pl.vehicle === v;
    const fps = H.mode === 'fps' && mine;
    // up on a double-decker's top deck in third person: the roof comes off
    const md = model(mine && !fps && T && T.topDeck && pl.passenger === 'deck' ? 'bus_decker_open' : modelKeyFor(T));
    const sx = T && T.w ? T.w / md.L : 1, sz = T && T.d && md.W ? clamp(T.d / md.W, 0.7, 1.4) : 1;
    const t = H.time;
    let roll = 0, pitch = 0, yOff = 0;
    const dLook = v.driver ? (v.driver === pl ? pl.look : riderLookOf(v)) : null;
    const kainchi = !!(dLook && md.crank && md.pedal && T && T.kainchi && !v.fallen && lookSpec(dLook, v.driver === pl ? 7 : v.seed).kid);
    if (md.bike) {
      if (v.fallen) { roll = -1.3; yOff = 0.5; } else if (!v.driver) roll = -(md.standLean || 0); else roll = clamp(v.lean || 0, -0.6, 0.6);
      if (kainchi) roll += KAINCHI.tilt; // the cycle leans away from the kid hanging off its left side
    }
    if (kainchi) v._kainchi = true; else if (v._kainchi && v.driver) v._kainchi = false;
    const j = v.jolt || 0;
    if (j > 0) { const ph = (1 - j) * Math.PI * 3.2, big = md.bike ? 1 : 0.7; yOff += -Math.sin(ph) * j * 0.8 * big; pitch += Math.sin(ph * 1.3) * j * 0.05 * big; roll += Math.sin(ph * 1.7) * j * 0.04 * (v.joltSide || 1); }
    if (md.boat) { const ph = t + ((v.seed | 0) % 100); yOff = 0.15 + Math.sin(ph * 1.3) * 0.22; roll = Math.sin(ph * 0.9) * 0.035; pitch = Math.sin(ph * 1.1 + 1) * 0.02 - clamp((v.speed || 0) / 600, -0.02, 0.06); }
    const th = TH(v.x, v.y);
    if (N.terrain && N.terrain.ready && !md.boat) {
      const sl = N.terrain.slopeAt(v.x, v.y), ca = Math.cos(v.angle || 0), sa = Math.sin(v.angle || 0);
      pitch += Math.atan(sl.gx * ca + sl.gy * sa); // nose up the hill
      roll -= Math.atan(-sl.gx * sa + sl.gy * ca) * (md.bike ? 0.35 : 1); // the high side up (a rider keeps his bike nearly upright)
    }
    FR.set(v.x, yOff + th, v.y, -(v.angle || 0), roll, pitch);
    vehicleFx(v, T, md);
    if (!visible(v.x, md.H * 0.5 + th, v.y, md.L * 0.55 * sx + 3)) {
      if (DBG.track === v) DBG.rec = { kind: 'vehicle', model: md.key, spin: -((v.wheelPhase || 0) * 2) / (md.rearR || 2), culled: true, frame: ST.frame };
      return;
    }
    ST.vehicles++;
    const night = H.night;
    const sp = Math.abs(v.speed || 0);
    const dyn = !!(T && !T.lights && T.dynamo && v.driver && sp > 10);
    const on = !!(T && (T.lights || dyn) && (v.driver || v.controller || v.lightsOn));
    const ctl = v.ctl || {};
    const braking = on && (ctl.throttle < -0.1 || ctl.brake || ctl.handbrake) ? 1 : 0;
    // A3: a kid on a Scooty near top speed: the handlebar shakes with v.wobble (the lean already follows it)
    const steerVis = ((v.steerVis || 0) + (md.bike ? (v.wobble || 0) * 0.45 : 0)) * (md.bike ? 0.8 : 0.9);
    const R0 = md.rearR || 2;
    const spin = -((v.wheelPhase || 0) * 2) / R0;
    const crank = md.crank ? spin * R0 / (md.crank[2] * 2.4) : 0;
    let beacon = 0;
    if (v.beacon && Math.sin(t * 9) > 0) beacon += 1;
    if (md.police && v.driver) beacon = Math.sin(t * 7) > 0 ? 1 : 2;
    const c1 = pack(v.color || '#c0392b');
    let c2 = pack(v.color2 || shadeHex(v.color || '#c0392b', 0.7));
    if (md.key === 'ambassador_taxi') c2 = pack('#f2c230');
    const cockpit = fps && md.cockpit;
    if (DBG.track === v) { DBG.rec = { kind: 'vehicle', model: md.key, spin, steer: steerVis, crank, lights: on, brake: braking, beacon, roll, cockpit: !!cockpit, frame: ST.frame }; DBG.riderNext = true; }
    // body (or the interior in first person)
    let pool, it = null;
    if (cockpit) { it = interior(md); pool = it.pool; } else pool = vpool(md);
    const i = pool.add();
    if (i >= 0) {
      FR.write(pool.M, i * 16, 0, 0, 0, 0, 0, 0, sx, 1, sz);
      const a = pool.A.iVA.array, b2 = pool.A.iVB.array, k = i * 4;
      a[k] = c1; a[k + 1] = c2; a[k + 2] = on ? (dyn ? clamp(sp / 80, 0.3, 1) : 1) : 0; a[k + 3] = braking;
      // iVB.w: the speedometer needle of a cockpit interior; on a body: 1 = the camera sits inside
      // it (first person on an auto / scooter: the windscreen glass turns nearly clear)
      b2[k] = steerVis; b2[k + 1] = crank; b2[k + 2] = beacon;
      b2[k + 3] = cockpit ? clamp(sp / (((T && T.maxSpeed) || 150) * 1.1), 0, 1) * 4.4 : (fps ? 1 : 0);
      if (DBG.track === v && DBG.rec) { DBG.rec.needle = cockpit ? b2[k + 3] : null; DBG.rec.inside = !cockpit && fps ? 1 : 0; }
    }
    // wheels
    if (!cockpit) {
      for (const w of md.wheels) {
        const P = w.kind === 'spoke' ? WHEELS.spoke : WHEELS.solid;
        const wi = P.add(); if (wi < 0) continue;
        let wx = w.x * sx, wz = w.z * sz, wy = w.r;
        let yaw = 0;
        if (w.front) {
          yaw = -steerVis;
          if (md.bike && md.steerX != null) { const px = md.steerX * sx, d = wx - px; wx = px + d * Math.cos(steerVis); wz = d * Math.sin(steerVis); }
        }
        const ws = md.boat ? 0 : (v.fallen ? 0 : spin * (R0 / w.r));
        FR.write(P.M, wi * 16, wx, wy, wz, yaw, 0, ws, w.r, w.r, w.w);
        ST.wheels++;
      }
    }
    // a city bus at rush hour: the driver, a standing crowd inside, footboard boys at the rear door
    if (md.busLife && !cockpit) busLife(v, md, sx, steerVis);
    if (md.upper) deckerUpper(v, md, sx, fps);
    // riders: driver, pillion, passengers
    const near = mine;
    // closed cars: seen through the translucent glass when the camera is close enough to tell
    const seeIn = !md.show && !!md.glassIndex && !cockpit && md.seats.length > 0 && camDist(v.x, 6 + th, v.y) < 170;
    if (md.show || fps || seeIn) {
      const seats = md.seats;
      if (v.driver && seats[0] && !v.fallen && !cockpit && !md.busLife) {
        submitRider(md, seats[0], dLook, v.driver === pl ? 7 : v.seed, sx, { steer: steerVis, crank, fpsHide: fps && (v.driver === pl || mine), near, actor: v.driver.look ? v.driver : null, kainchi });
      }
      const pil = v.pillion;
      if (pil && seats[1] && !v.fallen) submitRider(md, seats[1], pil.look || pil, pil === pl ? 7 : (v.seed | 0) + 3, sx, { fpsHide: fps && pil === pl, near, actor: pil.look ? pil : null });
      const pass = v.passenger;
      if (pass && pass !== pil && seats[1] && !v.fallen && !(pass === pl && pl.passenger === 'deck') && (md.show || seeIn || pass === pl)) submitRider(md, seats[1], pass.look || pass, pass === pl ? 7 : (v.seed | 0) + 5, sx, { fpsHide: fps && pass === pl, near, actor: pass.look ? pass : null });
      // ambient passengers in traffic autos / rickshaws (3D life; the 2D sprite shows the canopy)
      if ((md.key === 'auto' || md.key === 'rickshaw') && v.driver && !pass && !mine && ((v.seed | 0) % 3 === 0)) {
        const n = 1 + ((v.seed | 0) % 2);
        for (let k = 0; k < n && k + 1 < seats.length; k++) submitRider(md, seats[k + 1], extraLook(v, k), (v.seed | 0) + 11 * k, sx, {});
      }
      if (md.boat && !v.driver && v.T && v.T.id === 'boat' && (v.seed | 0) % 2) submitRider(md, seats[0], extraLook(v, 3), v.seed, sx, {});
    }
    // first person in a car / bus / lorry: the steering wheel with the player's hands on it
    if (cockpit && it && it.wheelAt) {
      if (!STEER_POOL) STEER_POOL = new Pool('steerwheel', buildSteeringWheel(), VEH_MAT, 2, { iVA: 4, iVB: 4 }, { max: 4 });
      const si = STEER_POOL.add();
      const wa = it.wheelAt, tilt = it.wheelTilt, wr = it.wheelR;
      const turn = -steerVis * 2.2;
      if (si >= 0) {
        FR.write(STEER_POOL.M, si * 16, wa[0], wa[1], wa[2], -Math.PI / 2, -tilt, turn, wr, wr, 1);
        const a = STEER_POOL.A.iVA.array, k = si * 4; a[k] = c1; a[k + 1] = c2; a[k + 2] = 0; a[k + 3] = 0;
      }
      // grip points on the rim at ten-to-two, turned with the wheel, then tilted like the wheel
      const gp = (ang) => {
        const qx = Math.cos(ang + turn) * wr, qy = Math.sin(ang + turn) * wr;
        const cb = Math.cos(-tilt), sb = Math.sin(-tilt);
        const y2 = qy * cb, z2 = qy * sb;      // Rx(-tilt) on (qx, qy, 0)
        return [wa[0] - z2, wa[1] + y2, wa[2] + qx]; // Ry(-PI/2): (x, y, z) -> (-z, y, x)
      };
      const L = gp(Math.PI * 0.82), Rr = gp(Math.PI * 0.18);
      SW[0] = L[0]; SW[1] = L[1]; SW[2] = L[2]; SW[3] = Rr[0]; SW[4] = Rr[1]; SW[5] = Rr[2];
      const cls = (T && T.cls) || 'car';
      const eyeF = cls === 'heavy' ? T.w * 0.36 : 1.2, eyeS = cls === 'car' ? T.d * 0.18 : 0, eyeH = cls === 'heavy' ? 15 : 8.2;
      const s = lookSpec(pl.look, 7).size;
      const seat = { x: (eyeF - 0.55) / sx, y: eyeH - (8.3 - HIP_Y) * s * 1.02 - 0.15, z: eyeS, pose: 'car', foot: [(eyeF + 3.2) / sx, cls === 'heavy' ? 9.9 : 2.6] };
      if (v.driver === pl) submitRider(md, seat, pl.look, 7, sx, { grips: SW, fpsHide: true, near: true });
    }
    // lamps at night: glows, light pools on the road, point lights for the nearest
    if (night > 0.04 && OPT.glows) {
      const lm = md.lamps;
      if (on) {
        for (const p of lm.head) { FR.apply(p[0] * sx + 0.3, p[1], p[2] * sz, P3); glow(P3[0], P3[1], P3[2], 1.0 * night, 0.92 * night, 0.7 * night, dyn ? 3.2 : md.bike ? 4.2 : 5.2); }
        if (!(T && T.pedal)) for (const p of lm.tail) { FR.apply(p[0] * sx - 0.2, p[1], p[2] * sz, P3); const k = braking ? 1.6 : 0.8; glow(P3[0], P3[1], P3[2], 1.0 * night * k, 0.08 * night * k, 0.04 * night * k, braking ? 3.4 : 2.4); }
        if (lm.head.length && !md.boat) {
          const len = md.bike ? 30 : md.key === 'auto' ? 34 : md.key.indexOf('bus') === 0 || md.key.indexOf('lorry') === 0 ? 54 : 44;
          const wid = md.bike ? 13 : md.key === 'auto' ? 16 : 24;
          lightPool(FR, md.L * sx * 0.5 - 1, len, wid, night * (dyn ? 0.55 : 0.9));
          const d = Math.hypot(v.x - pl.x, v.y - pl.y);
          if (mine || d < 120) { const c = Math.cos(v.angle || 0), s = Math.sin(v.angle || 0); H.light({ x: v.x + c * (md.L * sx * 0.5 + 18), y: v.y + s * (md.L * sx * 0.5 + 18), h: 5, color: '#fff0d0', intensity: mine ? 1.3 : 0.8, r: md.bike ? 60 : 80 }); }
        }
      }
      if (beacon) { FR.apply(0, md.H + 0.6, 0, P3); glow(P3[0], P3[1], P3[2], beacon === 2 ? 0.2 : 1.0, beacon === 2 ? 0.4 : 0.15, beacon === 2 ? 1.0 : 0.08, 7); }
    }
    // painted lettering
    if (OPT.decals && DEC.pool && md.decals.length && !cockpit && camDist(v.x, 5 + th, v.y) < 260) {
      for (const d of md.decals) {
        const di = DEC.pool.add(); if (di < 0) break;
        const fy = FACE_YAW[d.face] || 0;
        FR.write(DEC.pool.M, di * 16, d.x * sx, d.y, d.z * sz, fy, 0, 0, d.w, d.h, 1);
        const uv = decalUV(decalKey(d.cell, v)), u = DEC.pool.A.iUV.array, k = di * 4;
        u[k] = uv[0]; u[k + 1] = uv[1]; u[k + 2] = uv[2]; u[k + 3] = uv[3];
        ST.decals++;
      }
    }
    if (BLOBS && !md.boat) blob(v.x, v.y, md.L * sx * 1.05, md.W * sz * 1.15, v.angle || 0, th);
    DBG.riderNext = false;
    // (each on the ground under his own spot: on a slope the pitched deck rises with it, near enough)
    if (DECK_P === v) { DECK_P = null; personEntity(pl, 0, { el: DDL().floor + yOff + TH(pl.x, pl.y), v: N.decker.speed() }); }
    if (DECK_W.length) { for (const e of DECK_W) personEntity(e, 0, { el: DDL().floor + yOff + TH(e.x, e.y), v: e.speed3 }); DECK_W.length = 0; }
  }

  /* ================================================================ ANIMALS + PIGEONS */
  function animalCompileFactory(depth) {
    return function (shader) {
      if (!depth) { shader.uniforms.uNight = H.uniforms.uNight; }
      const head = [
        'attribute vec3 aSP;', 'attribute vec3 aPiv;', 'attribute vec4 iA;', depth ? '' : 'attribute vec4 iC;', GLSL_UNPACK, GLSL_ROT,
        'void aAnim(inout vec3 p, inout vec3 n){ float part = aSP.y;',
        '  if (part > 0.5 && part < 4.5) { float ph = iA.x + ((part < 1.5 || part > 3.5) ? 0.0 : 3.14159); float a = sin(ph) * iA.y; p = aRotZ(p, aPiv.xy, a); n = aRotZ(n, vec2(0.0), a); }',
        '  else if (part > 4.5 && part < 5.5) { p = aRotZ(p, aPiv.xy, iA.z); n = aRotZ(n, vec2(0.0), iA.z); }',
        '  else if (part > 5.5 && part < 6.5) { p = aRotX(p, aPiv.yz, iA.w); n = aRotX(n, vec2(0.0), iA.w); }',
        '  else if (part > 6.5 && part < 7.5) { p = aRotX(p, aPiv.yz, iA.w); n = aRotX(n, vec2(0.0), iA.w); }',
        '  else if (part > 7.5 && part < 8.5) { p = aRotX(p, aPiv.yz, -iA.w); n = aRotX(n, vec2(0.0), -iA.w); }',
        '}',
      ].join('\n');
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + head);
      if (depth) shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec3 nn = vec3(0.0, 1.0, 0.0); aAnim(transformed, nn); }');
      else {
        shader.vertexShader = shader.vertexShader
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 anPos = vec3(position);\naAnim(anPos, objectNormal);')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = anPos;')
          .replace('#include <color_vertex>', '#include <color_vertex>\n{ float sl = aSP.x; if (sl > 0.5) vColor = aUnpack(sl < 1.5 ? iC.x : (sl < 2.5 ? iC.y : iC.z)) * vColor; }');
      }
    };
  }
  let ANIMAL_MAT = null, ANIMAL_DEPTH = null;
  const AP = {}; // animal pools by template key
  function legsQuad(b, pts, y0, r0, r1, hoof) {
    for (let k = 0; k < 4; k++) {
      const [x, z] = pts[k];
      b.part(k + 1, [x, y0, z]).slot(1).shade(0.94).cyl([x, y0 + 0.4, z], [x, 0.38, z], r0, r1, 6, 0);
      if (hoof) b.slot(0).color(hoof).cyl([x, 0.42, z], [x, 0, z], r1 * 1.02, r1 * 1.1, 6, 1);
    }
    b.part(0, [0, 0, 0]);
  }
  function buildAnimal(key) {
    const b = new AB();
    b.part(0).slot(1).shade(1);
    switch (key) {
      case 'cow': {
        legsQuad(b, [[4.4, -1.35], [4.4, 1.35], [-4.6, -1.35], [-4.6, 1.35]], 3.6, 0.58, 0.38, '#3a3028');
        b.slot(1).shade(1).ell(-0.3, 4.65, 0, 6.4, 1.75, 2.2, 14, 8).ell(0.2, 4.0, 0, 5.2, 1.2, 1.85, 10, 5);
        b.shade(0.96).ell(3.7, 6.0, 0, 1.55, 1.15, 1.1, 8, 6).ell(-5.3, 4.9, 0, 1.6, 1.5, 1.9, 8, 5);
        b.slot(2).shade(1).ell(-2.6, 5.4, 1.62, 1.6, 0.95, 0.7, 7, 4).ell(1.4, 4.6, -1.75, 1.3, 0.8, 0.6, 7, 4).ell(-4.4, 5.6, -1.4, 1.1, 0.8, 0.9, 7, 4);
        b.slot(1).shade(0.97).cyl([4.9, 5.2, 0], [6.7, 5.0, 0], 1.15, 0.85, 8, 0).ell(5.5, 3.9, 0, 1.2, 1.0, 0.42, 7, 4);
        b.part(5, [6.4, 5.2, 0]).slot(1).shade(0.95).ell(7.75, 4.8, 0, 1.5, 0.92, 0.88, 10, 6);
        b.slot(0).color('#c8a8a0').ell(9.0, 4.35, 0, 0.66, 0.6, 0.7, 8, 5).color('#2a1a18').ell(9.55, 4.4, -0.3, 0.1, 0.12, 0.1, 4, 3).ell(9.55, 4.4, 0.3, 0.1, 0.12, 0.1, 4, 3);
        b.color('#1a1214').ell(8.1, 5.25, -0.8, 0.12, 0.14, 0.1, 5, 3).ell(8.1, 5.25, 0.8, 0.12, 0.14, 0.1, 5, 3);
        b.slot(1).shade(0.9).ell(7.0, 5.35, -1.15, 0.45, 0.22, 0.7, 6, 3).ell(7.0, 5.35, 1.15, 0.45, 0.22, 0.7, 6, 3);
        b.slot(0).color('#d8cfb8').cyl([7.25, 5.6, -0.55], [7.15, 6.5, -0.85], 0.2, 0.08, 5, 0).cyl([7.25, 5.6, 0.55], [7.15, 6.5, 0.85], 0.2, 0.08, 5, 0);
        b.part(6, [-6.4, 5.4, 0]).slot(1).shade(0.9).cyl([-6.4, 5.4, 0], [-7.0, 1.8, 0], 0.16, 0.12, 5, 0).slot(0).color('#2a2420').ell(-7.05, 1.6, 0, 0.25, 0.5, 0.25, 5, 3);
        break;
      }
      case 'cow_lie': {
        b.slot(1).shade(1).ell(-0.3, 2.35, 0, 6.4, 1.85, 2.45, 14, 8).ell(-5.0, 2.3, 0.4, 1.6, 1.6, 2.0, 8, 5);
        b.slot(2).shade(1).ell(-2.6, 3.2, 1.9, 1.6, 0.9, 0.7, 7, 4).ell(1.4, 2.6, -2.0, 1.3, 0.8, 0.6, 7, 4);
        b.slot(1).shade(0.92).ell(3.6, 0.6, -1.5, 2.2, 0.55, 0.55, 6, 4).ell(3.3, 0.6, 1.5, 2.2, 0.55, 0.55, 6, 4).ell(-4.2, 0.7, 2.4, 1.8, 0.6, 0.7, 6, 4);
        b.slot(0).color('#3a3028').ell(5.6, 0.45, -1.5, 0.35, 0.3, 0.35, 4, 3).ell(5.3, 0.45, 1.5, 0.35, 0.3, 0.35, 4, 3);
        b.slot(1).shade(0.96).ell(3.3, 3.6, 0, 1.4, 1.1, 1.05, 8, 5).cyl([4.2, 3.3, 0], [5.9, 3.9, 0], 1.05, 0.8, 8, 0);
        b.part(5, [5.7, 3.9, 0]).slot(1).shade(0.95).ell(7.0, 3.9, 0, 1.45, 0.9, 0.86, 10, 6);
        b.slot(0).color('#c8a8a0').ell(8.25, 3.5, 0, 0.62, 0.56, 0.66, 8, 5).color('#1a1214').ell(7.4, 4.35, -0.78, 0.12, 0.14, 0.1, 5, 3).ell(7.4, 4.35, 0.78, 0.12, 0.14, 0.1, 5, 3);
        b.slot(1).shade(0.9).ell(6.3, 4.45, -1.1, 0.45, 0.22, 0.68, 6, 3).ell(6.3, 4.45, 1.1, 0.45, 0.22, 0.68, 6, 3);
        b.slot(0).color('#d8cfb8').cyl([6.5, 4.7, -0.55], [6.4, 5.6, -0.85], 0.2, 0.08, 5, 0).cyl([6.5, 4.7, 0.55], [6.4, 5.6, 0.85], 0.2, 0.08, 5, 0);
        b.part(6, [-6.4, 2.6, 0]).slot(1).shade(0.9).cyl([-6.4, 2.6, 0], [-8.2, 0.3, 1.2], 0.15, 0.12, 5, 0).slot(0).color('#2a2420').ell(-8.3, 0.3, 1.25, 0.45, 0.22, 0.25, 5, 3);
        break;
      }
      case 'dog': {
        legsQuad(b, [[2.0, -0.55], [2.0, 0.55], [-2.1, -0.55], [-2.1, 0.55]], 2.4, 0.3, 0.22, null);
        b.slot(1).shade(1).ell(-0.1, 2.85, 0, 2.8, 0.95, 0.9, 10, 6).ell(1.7, 3.0, 0, 1.25, 1.05, 0.95, 8, 5);
        b.slot(2).shade(1).ell(-0.6, 3.4, 0, 1.5, 0.45, 0.75, 7, 4).ell(1.9, 2.5, 0, 0.9, 0.55, 0.7, 6, 4);
        b.slot(1).cyl([2.4, 3.3, 0], [3.2, 4.2, 0], 0.62, 0.5, 6, 0);
        b.part(5, [3.1, 4.1, 0]).slot(1).ell(3.8, 4.35, 0, 0.9, 0.72, 0.68, 8, 5).ell(4.7, 4.1, 0, 0.62, 0.38, 0.38, 6, 4);
        b.slot(0).color('#141012').ell(5.3, 4.15, 0, 0.14, 0.12, 0.14, 4, 3).ell(4.25, 4.6, -0.42, 0.08, 0.1, 0.08, 4, 3).ell(4.25, 4.6, 0.42, 0.08, 0.1, 0.08, 4, 3);
        b.slot(2).tbox(3.3, 4.8, -0.75, 3.8, 5.7, -0.3, 0.2, 0.18).tbox(3.3, 4.8, 0.3, 3.8, 5.7, 0.75, 0.2, 0.18);
        b.part(6, [-2.7, 3.2, 0]).slot(1).cyl([-2.7, 3.2, 0], [-3.4, 4.3, 0], 0.22, 0.18, 5, 0).cyl([-3.4, 4.3, 0], [-2.9, 5.0, 0], 0.18, 0.1, 5, 0);
        b.part(0);
        for (let k = 0; k < 4; k++) { const p = [[2.0, -0.55], [2.0, 0.55], [-2.1, -0.55], [-2.1, 0.55]][k]; b.part(k + 1, [p[0], 2.4, p[1]]).slot(2).ell(p[0] + 0.15, 0.15, p[1], 0.32, 0.18, 0.25, 5, 3); }
        break;
      }
      case 'dog_nap': {
        b.slot(1).ell(0, 0.95, 0, 2.5, 0.95, 1.9, 10, 6).slot(2).ell(-0.6, 1.35, 0.2, 1.4, 0.5, 1.0, 7, 4);
        b.part(5, [1.6, 1.0, 0.9]).slot(1).ell(1.9, 0.85, 1.3, 0.85, 0.6, 0.75, 8, 5).ell(2.55, 0.7, 1.75, 0.55, 0.32, 0.38, 6, 4);
        b.slot(2).tbox(1.4, 1.35, 0.8, 1.9, 2.0, 1.2, 0.18, 0.14).tbox(1.6, 1.35, 1.5, 2.1, 2.0, 1.9, 0.18, 0.14);
        b.part(6, [-2.2, 0.8, 0]).slot(1).cyl([-2.2, 0.8, 0], [-1.2, 0.6, 1.9], 0.24, 0.12, 5, 0);
        break;
      }
      case 'goat': {
        legsQuad(b, [[1.8, -0.5], [1.8, 0.5], [-1.9, -0.5], [-1.9, 0.5]], 2.8, 0.22, 0.16, '#2a2018');
        b.slot(1).ell(0, 3.4, 0, 2.5, 1.05, 0.95, 10, 6).slot(2).ell(-0.9, 3.5, 0, 1.2, 0.95, 0.98, 7, 4);
        b.slot(1).cyl([2.0, 3.7, 0], [2.7, 4.5, 0], 0.55, 0.42, 6, 0);
        b.part(5, [2.6, 4.4, 0]).slot(1).ell(3.3, 4.55, 0, 0.85, 0.5, 0.48, 8, 5);
        b.slot(0).color('#141012').ell(3.25, 4.75, -0.42, 0.08, 0.1, 0.08, 4, 3).ell(3.25, 4.75, 0.42, 0.08, 0.1, 0.08, 4, 3);
        b.slot(2).ell(2.9, 4.4, -0.6, 0.25, 0.55, 0.12, 5, 3).ell(2.9, 4.4, 0.6, 0.25, 0.55, 0.12, 5, 3).ell(3.6, 3.95, 0, 0.14, 0.32, 0.14, 5, 3);
        b.slot(0).color('#8a7a60').cyl([2.95, 4.95, -0.25], [2.4, 5.55, -0.35], 0.1, 0.05, 4, 0).cyl([2.95, 4.95, 0.25], [2.4, 5.55, 0.35], 0.1, 0.05, 4, 0);
        b.part(6, [-2.4, 3.9, 0]).slot(2).cyl([-2.4, 3.9, 0], [-2.8, 4.6, 0], 0.18, 0.08, 4, 0);
        break;
      }
      case 'bird': {
        b.slot(1).ell(0, 0.6, 0, 0.78, 0.44, 0.44, 8, 5).ell(-0.2, 0.75, 0, 0.6, 0.3, 0.38, 6, 3);
        b.slot(2).ell(0.62, 0.98, 0, 0.32, 0.31, 0.29, 7, 5).ell(0.4, 0.8, 0, 0.3, 0.3, 0.33, 6, 4);
        b.slot(0).color('#3a2a2a').cyl([0.9, 0.98, 0], [1.12, 0.94, 0], 0.07, 0.02, 4, 0).color('#1a1214').ell(0.78, 1.05, -0.2, 0.05, 0.05, 0.05, 4, 3).ell(0.78, 1.05, 0.2, 0.05, 0.05, 0.05, 4, 3);
        b.slot(3).tbox(-1.3, 0.52, -0.25, -0.6, 0.64, 0.25, 0, -0.08);
        b.slot(0).color('#c86a5a').cyl([0.1, 0.25, -0.15], [0.12, 0, -0.15], 0.05, 0.05, 3, 0).cyl([0.1, 0.25, 0.15], [0.12, 0, 0.15], 0.05, 0.05, 3, 0);
        b.part(7, [0, 0.82, -0.2]).slot(1).shade(0.92).tbox(-0.65, 0.78, -1.75, 0.45, 0.86, -0.2, 0, 0.0).slot(3).box(-0.6, 0.79, -1.5, -0.3, 0.87, -0.4);
        b.part(8, [0, 0.82, 0.2]).slot(1).shade(0.92).tbox(-0.65, 0.78, 0.2, 0.45, 0.86, 1.75, 0, 0.0).slot(3).box(-0.6, 0.79, 0.4, -0.3, 0.87, 1.5);
        break;
      }
      default: b.box(-2, 1, -1, 2, 3, 1);
    }
    return b.build();
  }
  function apool(key) {
    let p = AP[key];
    if (!p) p = AP[key] = new Pool('ani:' + key, buildAnimal(key), ANIMAL_MAT, key === 'bird' ? 48 : 8, { iA: 4, iC: 4 }, { depth: ANIMAL_DEPTH, cast: key !== 'bird', max: key === 'bird' ? 1024 : 256 });
    return p;
  }
  function submitAnimal(key, x, h, y, yaw, scale, a0, a1, a2, a3, c1, c2, c3, pitch) {
    const P = apool(key), i = P.add();
    if (i < 0) return;
    FR2.set(x, h, y, yaw, 0, pitch || 0).write(P.M, i * 16, 0, 0, 0, 0, 0, 0, scale, scale, scale);
    const A = P.A.iA.array, C = P.A.iC.array, k = i * 4;
    A[k] = a0; A[k + 1] = a1; A[k + 2] = a2; A[k + 3] = a3;
    C[k] = c1; C[k + 1] = c2; C[k + 2] = c3 || 0; C[k + 3] = 0;
  }
  const ASTATE = new WeakMap();
  function animalEntity(a) {
    const sp = a.species || a.type || 'dog';
    const t = H.time;
    const col = Array.isArray(a.col) ? a.col : ['#b8864a', '#8a6030'];
    const c1 = pack(col[0]), c2 = pack(col[1] || col[0]);
    const vx = a.vx || 0, vy = a.vy || 0, v = Math.hypot(vx, vy);
    const el = H.elev(a);
    let st = ASTATE.get(a); if (!st) { st = { ph: Math.random() * 6 }; ASTATE.set(a, st); }
    st.ph += Math.min(0.1, (N.time && N.time.dt) || 0.016) * (v * 0.35 + 0.0001);
    const yaw = -(a.angle || 0);
    const sd = (a.seed | 0) % 1000;
    if (!visible(a.x, el + 3, a.y, sp === 'cow' ? 12 : 6)) return;
    ST.animals++;
    if (sp === 'cow') {
      const lying = a.state === 'lie' && a.getUpT == null;
      if (lying) submitAnimal('cow_lie', a.x, el, a.y, yaw, 1, 0, 0, Math.sin(t * 3.1 + sd) * 0.05 - 0.04, Math.sin(t * 1.7 + sd) * 0.35, c1, c2);
      else submitAnimal('cow', a.x, el, a.y, yaw, 1, st.ph * 1.6, a.moving ? 0.32 : 0, (a.moving ? -0.12 : -0.05) + Math.sin(t * 0.9 + sd) * 0.06, Math.sin(t * 1.7 + sd) * 0.4, c1, c2);
      if (BLOBS) blob(a.x, a.y, 17, 6.5, a.angle, el);
    } else if (sp === 'dog') {
      if (a.state === 'nap') submitAnimal('dog_nap', a.x, el, a.y, yaw, 1, 0, 0, Math.sin(t * 1.2 + sd) * 0.03, Math.sin(t * 0.8 + sd) * 0.15, c1, c2);
      else submitAnimal('dog', a.x, el, a.y, yaw, 1, st.ph * 2.6, Math.min(0.6, v / 60), v > 40 ? 0.12 : Math.sin(t * 0.7 + sd) * 0.08, Math.sin(t * (v > 5 ? 14 : 9) + sd) * (a.fedT > 0 ? 0.7 : 0.35), c1, c2);
      if (BLOBS) blob(a.x, a.y, 7, 3, a.angle, el);
    } else {
      const nib = a.state === 'nibble' || a.state === 'graze';
      submitAnimal('goat', a.x, el, a.y, yaw, 1, st.ph * 2.4, Math.min(0.55, v / 45), nib && v < 3 ? -0.65 + Math.sin(t * 5 + sd) * 0.12 : 0, Math.sin(t * 6 + sd) * 0.25, c1, c2);
      if (BLOBS) blob(a.x, a.y, 6, 3, a.angle, el);
    }
  }
  const PCOL = [['#a3a6ad', '#7e828c', '#4d5560'], ['#e4e1da', '#bdb9b1', '#77736e'], ['#9a7f6c', '#76604f', '#4f3c33']].map((p) => p.map(pack));
  function pigeons() {
    const lists = [];
    try { if (N.traffic && N.traffic.flocks) lists.push(N.traffic.flocks); } catch (e) { /* stub */ }
    try { if (N.landmarks && N.landmarks.flocks) lists.push(N.landmarks.flocks); } catch (e) { /* stub */ }
    const p = N.player; if (!p) return;
    const range = H.quality.actorDist || 600;
    for (const L of lists) for (const f of L) {
      if (!f || !f.birds || Math.abs(f.cx - p.x) > range || Math.abs(f.cy - p.y) > range) continue;
      for (const b of f.birds) {
        const h = (b.h || 0) * VS;
        if (!visible(b.x, h + 1, b.y, 3)) continue;
        const c = PCOL[b.col | 0] || PCOL[0];
        const flying = b.st && b.st !== 0;
        const peck = !flying && Math.sin(b.ph || 0) > 0.6 ? -0.45 : 0;
        const flap = flying ? 0.25 + Math.sin((b.ph || 0) * 1.0) * 0.85 : -1.35;
        submitAnimal('bird', b.x, h, b.y, -(b.a || 0), 1.15, 0, 0, 0, flap, c[0], c[1], c[2], flying ? Math.max(-0.3, Math.min(0.3, (b.vh || 0) * 0.004)) : peck);
        ST.birds++;
      }
    }
  }

  /* ================================================================ PEOPLE as entities */
  const PSTATE = new WeakMap();
  const SIM = { frame: -1, last: 0, dt: 0 };
  const EMOTES = [];       // [{x, h, y, kind, a}] collected this frame
  const EXTRAS = { umb: [], balloons: [], carts: [], benches: [] };
  function seedOf(e) { return e === N.player ? 7 : (e.id | 0) || 1; }
  // getting on / off a vehicle: a short blend between standing beside it and the seat
  const MOUNT = new WeakMap();
  const nowS = () => (N.time && N.time.now) || 0; // simulation seconds (pauses / slow motion with the game)
  const MOUNT_S = 0.4;
  N.on('vehicle:enter', (d) => { if (d && d.actor && d.vehicle) MOUNT.set(d.actor, { t0: nowS(), v: d.vehicle, on: true }); });
  N.on('vehicle:exit', (d) => {
    try {
      const v = d && d.vehicle, a = d && d.actor;
      if (!v || !a || !READY) return;
      const md = model(modelKeyFor(v.T)), seat = md.seats[d.passenger && md.seats[1] ? 1 : 0];
      if (!seat) return;
      const c = Math.cos(v.angle || 0), sn = Math.sin(v.angle || 0);
      const kj = !d.passenger && v._kainchi ? KAI_J.get(a) : null; // stepping off a kainchi ride: from that pose
      const sxk = kj && md.crank ? md.crank[0] * ((v.T && v.T.w) ? v.T.w / md.L : 1) + KAINCHI.dx : seat.x, lz = kj ? KAINCHI.hz : (seat.z || 0);
      MOUNT.set(a, { t0: nowS(), on: false, x: v.x + c * sxk - sn * lz, y: v.y + sn * sxk + c * lz, hip: kj ? KAINCHI.hy : seat.y, yaw: -(v.angle || 0), show: md.show, kj });
    } catch (e) { /* no blend */ }
  });
  const SEATED_J = new Float32Array([1.35, 1.35, -1.4, -1.4, 0.6, 0.6, 0.6, 0.6, 0.1, 0.1, 0.08, 0, 0, 0, 0, 0, 0, 0]);
  const ease = (k) => k * k * (3 - 2 * k);
  function wrapA(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  /** simulation seconds since the last frame (0 while paused; slow motion slows it) */
  function simDt() {
    if (SIM.frame !== ST.frame) { const t = nowS(); SIM.dt = clamp(t - SIM.last, 0, 0.1); SIM.last = t; SIM.frame = ST.frame; }
    return SIM.dt;
  }
  function personEntity(e, dt, deck) {
    if (e.hidden || (e.vehicle && !deck)) return;
    const p = N.player, isP = e === p;
    const look = e.look;
    if (!look) return;
    // simulation time of this frame (slow motion / pause freeze the gait with the sim)
    dt = simDt();
    let el = deck ? deck.el : H.elev(e);
    if (!el && e.roofH) el = e.roofH * VS;
    const face = isFinite(e.facing) && isP ? e.facing : (e.angle || 0);
    const t = H.time, seed = seedOf(e);
    let roll = 0, pitch = 0, x = e.x, y = e.y, rootY = el;
    const s = lookSpec(look, seed);
    let st = PSTATE.get(e);
    if (!st) { st = { cyc: Math.random(), v: 0, lx: x, ly: y, yaw: face, hy: 0, gw: 0, yawRate: 0 }; PSTATE.set(e, st); }
    // speed: the entity's velocity, else its position change
    if (dt > 1e-5) {
      let v = deck ? deck.v : Math.hypot(e.vx || 0, e.vy || 0);
      if (!deck && !(v > 0)) v = Math.min(200, Math.hypot(x - st.lx, y - st.ly) / dt);
      if (!deck && Math.hypot(x - st.lx, y - st.ly) > 40) v = 0; // teleported
      st.lx = x; st.ly = y;
      st.v += (v - st.v) * Math.min(1, dt * 12);
      // smooth turning
      const dy0 = wrapA(face - st.yaw) * Math.min(1, dt * 14);
      st.yaw += dy0; st.yawRate += (dy0 / dt - st.yawRate) * Math.min(1, dt * 10);
    }
    let yaw = -st.yaw;
    const fps = H.mode === 'fps';
    const o = { fpsHide: false, near: isP, seated: false };
    let idle = false;
    const down = e.down || (isP && e.downT > 0) || (!isP && e.knockT > 0 && e.kind !== 'ped');
    if (down) {
      const sitUp = (e.getupT > 0) || (isP && e.downT > 0 && e.downT < 0.45);
      const a = isP && isFinite(e.fallA) ? e.fallA : face;
      if (sitUp) { poseSit(J, 0.6); J[0] = J[1] = 1.5; J[2] = J[3] = -0.25; J[13] = -0.3; rootY = el - HIP_Y * s.size + 0.6 * s.size; yaw = -a; o.seated = true; }
      else { poseRest(J); J[4] = 0.6; J[5] = -0.4; J[0] = 0.25; J[3] = -0.4; yaw = -(a + Math.PI); pitch = 1.5; rootY = el + 0.7 * s.size; }
      st.yaw = -yaw;
    } else if ((e.idle === 'sit' && !e.walk && !e.followSt && st.v < 4) || (isP && e.sitting)) {
      poseSit(J, 0.35); o.seated = true; idle = true;
      rootY = el + (e.bench ? 2.6 : 2.2) - HIP_Y * s.size;
      EXTRAS.benches.push(x - Math.cos(face) * 0.9, y - Math.sin(face) * 0.9, face, el, e.bench ? 0 : 1);
    } else if (e.constable) {
      const pod = e.pod || {};
      const ang = (pod.axisA || 0) + (pod.green ? Math.PI / 2 : 0) + Math.sin(t * 2) * 0.3;
      yaw = -ang; st.yaw = ang;
      poseRest(J); J[9] = 1.45; J[5] = 0.1; J[7] = 0.7 + Math.sin(t * 5) * 0.55; J[4] = -0.25; J[6] = 1.7; J[8] = 0.55;
      ground(J);
    } else {
      // planted-foot gait (gaitPose): the stance foot moves back exactly as fast as the body moves
      // forwards; the cadence follows the stride; standing still blends to a relaxed stance
      const vv = st.v, run = vv > 62 || (e.anim && e.anim.run && vv > 30);
      let vt = vv / (s.size * (s.wide || 1));
      const turnV = Math.min(14, Math.abs(st.yawRate || 0) * 3.5); // turning on the spot: small steps
      if (vt < turnV) vt = turnV;
      const wrapK = s.wrap ? 0.85 : 1;
      gaitParams(vt, run, wrapK, GP);
      const moving = vt > 1.2;
      if (moving) st.cyc += GP.f * dt;
      gaitPose(J, st.cyc, GP, wrapK);
      st.gw += ((moving ? 1 : 0) - st.gw) * Math.min(1, dt * (moving ? 9 : 5));
      if (st.gw < 0.999) { poseStand(JS, t, seed); blendPose(J, JS, st.gw); }
      idle = st.gw < 0.05;
      st.beta = GP.beta; st.X = GP.X; st.f = GP.f; st.run = run;
      if (idle) { J[4] += Math.sin(t * 1.3 + seed) * 0.025; J[5] -= Math.sin(t * 1.1 + seed) * 0.025; }
      if (s.headCarry) { armsTo(J, J[10], 0.25, 9.2, -0.62, 0.25, 9.2, 0.62); }
      else if (s.prop === 'tray' || s.prop === 'notebook') { J[5] = 0.45; J[7] = 1.35; }
      else if (s.prop === 'dappu') { J[4] = 0.9; J[6] = 1.2; J[5] = 0.8 + Math.sin(t * 9) * 0.25; J[7] = 1.4; }
      if (e.spotter && e.spotter.stick) { J[5] = 2.55 + Math.sin(t * 9) * 0.35; J[7] = 0.35; }
      if (e.balloons) { J[5] = 0.5; J[7] = 1.6; }
      // idle hands: a habit per person (not with a prop in hand, not the player, not a spotter)
      if (!isP && !s.prop && !s.headCarry && !e.spotter && !e.balloons && st.gw < 0.95) {
        const work = e.idle === 'work' && !e.talking;
        const hab = work ? 'work' : habitOf(s, seed);
        const on = hab ? (work && OPT.habits !== false ? 1 : habitOn(t, seed)) * (1 - st.gw) : 0;
        if (on > 0.01) {
          JH.set(J); habitArms(JH, hab, s, t, seed);
          for (let q = 4; q < 10; q++) J[q] += (JH[q] - J[q]) * on;
          st.hab = hab; st.habW = on;
        } else st.habW = 0;
      }
    }
    // head: look at what they look at; the player looks where the camera looks; idle glances; breathing
    if (!down) {
      let tg = null;
      if (e.lookT > 0 && e.lookAt && isFinite(e.lookAt.x)) tg = e.lookAt;
      else if (e.lookTarget && isFinite(e.lookTarget.x)) tg = e.lookTarget;
      let rel;
      if (tg) rel = wrapA(Math.atan2(tg.y - y, tg.x - x) - st.yaw);
      else {
        rel = isP && N.view && N.view.mode === 'tps' ? wrapA(N.view.yaw - st.yaw) * 0.6 : 0;
        // standing about: slow glances left and right
        if (idle) rel += (Math.sin(t * 0.5 + seed * 1.3) * 0.42 + Math.sin(t * 0.21 + seed * 2.1) * 0.3) * (1 - st.gw);
      }
      st.hy += (clamp(rel, -1.1, 1.1) - st.hy) * Math.min(1, dt * 5);
      J[12] = st.hy; J[13] = idle ? Math.sin(t * 0.45 + seed) * 0.05 : (st.v > 62 ? -0.08 : 0);
      J[14] = Math.sin(t * (st.v > 62 ? 5 : 1.7) + seed) * (st.v > 62 ? 0.05 : 0.04);
      // talking: gestures blend over the stance or the seat (subtler while walking; not with a load on the head)
      const tw = !s.headCarry && !e.constable ? talkW(e) * (1 - 0.65 * (st.gw || 0)) : 0;
      if (tw > 0.01) {
        JH.set(J); talkArms(JH, t, seed, !s.prop || s.prop === 'notebook');
        for (let q = 4; q < 14; q++) if (q !== 10 && q !== 11) J[q] += (JH[q] - J[q]) * tw;
        st.talk = tw;
      } else st.talk = 0;
    }
    // getting off a vehicle: blend from the seat
    const m = MOUNT.get(e);
    let bx = x, by = y;
    if (m && !m.on) {
      const k = (nowS() - m.t0) / MOUNT_S;
      if (k < 1) {
        const q = ease(Math.max(0, k));
        blendPose(J, m.kj || SEATED_J, q);
        bx = m.x + (x - m.x) * q; by = m.y + (y - m.y) * q;
        rootY = (m.hip - HIP_Y * s.size) * (1 - q) + rootY * q + Math.sin(q * Math.PI) * 0.8;
        yaw = m.yaw + wrapA(yaw - m.yaw) * q;
        o.seated = q < 0.5;
      } else MOUNT.delete(e);
    }
    if (isP) {
      if (fps) o.fpsHide = true;
      else if (CAMP && Math.hypot(CAMP.x - bx, CAMP.y - (el + 6), CAMP.z - by) < 4.5) return;
    }
    FR.set(bx, rootY, by, yaw, roll, pitch);
    if (DBG.track === e) DBG.rec = { kind: 'person', J: Array.from(J), x: bx, y: by, h: rootY, yaw, pitch, size: s.size, wide: s.wide, seated: o.seated, fpsHide: o.fpsHide, v: st.v, cyc: st.cyc, beta: st.beta, X: st.X, f: st.f, run: !!st.run, gw: st.gw, hab: st.hab || null, habW: st.habW || 0, talk: st.talk || 0, frame: ST.frame };
    const i = submitPerson(look, seed, FR, 0, 0, 0, J, o);
    if (i < 0) return;
    const head = el + 9.4 * s.size + (s.headCarry ? 1.4 : 0);
    // extras: umbrella, balloons, push cart, emotes / spotter pip
    if (e.umb) EXTRAS.umb.push(x, head + 1.2, y, pack(e.umb));
    if (e.balloons) EXTRAS.balloons.push({ x: x + Math.cos(face + 1.2) * 1.3, y: y + Math.sin(face + 1.2) * 1.3, h: el + 5.8 * s.size, cols: e.balloons, seed });
    if (e.cart) EXTRAS.carts.push(x + Math.cos(face) * 11.5, y + Math.sin(face) * 11.5, face, e.cart.kind || 'banana_cart', el);
    if (e.spotter) EMOTES.push({ x, y, h: head + 3, kind: '!', a: 1 });
    else if (e.emoteSt) { const em = e.emoteSt; EMOTES.push({ x, y, h: head + 3, kind: em.kind, a: clamp(Math.min(em.t * 6, (em.secs - em.t) * 4), 0, 1) }); }
  }
  /** tests: world positions of the heel and toe of both soles of a tracked person record, mirroring
   *  the vertex shader (ankle, knee, hip rotations, bob, then the instance scale / yaw) */
  function rotZ2(px, py, cx, cy, a) { const c = Math.cos(a), s = Math.sin(a), qx = px - cx, qy = py - cy; return [qx * c - qy * s + cx, qx * s + qy * c + cy]; }
  function feetOf(r) {
    if (!r || r.kind !== 'person') return null;
    const out = [], ank = decAnk(r.J[15]);
    const sc = r.size || 1, wd = r.wide || 1, c = Math.cos(r.yaw), sn = Math.sin(r.yaw);
    for (const sd of [-1, 1]) {
      const h = sd < 0 ? r.J[0] : r.J[1], k = sd < 0 ? r.J[2] : r.J[3], an = sd < 0 ? ank[0] : ank[1];
      const pts = [];
      for (const q of [[-0.42, 0], [1.06, 0]]) {
        let p = rotZ2(q[0], q[1], 0, ANK_Y, an);
        p = rotZ2(p[0], p[1], 0, KNEE_Y, k);
        p = rotZ2(p[0], p[1], 0, HIP_Y, h);
        const lx = p[0] * sc * wd, lz = sd * HIP_Z * sc * wd, ly = (p[1] + r.J[11]) * sc;
        // three's rotation about +y by yaw: x' = x cos + z sin, z' = -x sin + z cos (world y = three z)
        pts.push({ x: r.x + lx * c + lz * sn, y: r.y - lx * sn + lz * c, h: r.h + ly });
      }
      out.push({ heel: pts[0], toe: pts[1], low: Math.min(pts[0].h, pts[1].h) });
    }
    return out;
  }
  function riderAnkles(vr, sx) {
    const rd = vr && vr.riders && vr.riders[0];
    if (!rd || !rd.root) return null;
    const md = model(vr.model), j = rd.J, sc = rd.size || 1, ank = [];
    const M = rot3(new Float64Array(9), rd.yaw || 0, rd.roll || 0, 0);
    for (const sd of [-1, 1]) {
      const k = sd < 0 ? 0 : 1;
      let p = [0, ANK_Y, sd * HIP_Z];
      let q = rotZ2(p[0], p[1], 0, KNEE_Y, j[2 + k]); p = [q[0], q[1], p[2]];
      q = rotZ2(p[0], p[1], 0, HIP_Y, j[k]); p = [q[0], q[1], p[2]];
      const a = -sd * (j[16 + k] || 0), c = Math.cos(a), s = Math.sin(a), qy = p[1] - HIP_Y, qz = p[2] - sd * HIP_Z;
      p = [p[0], qy * c - qz * s + HIP_Y, qy * s + qz * c + sd * HIP_Z];
      p[1] += j[11] || 0;
      const x = p[0] * sc, y = p[1] * sc, z = p[2] * sc;
      ank.push([rd.root[0] + M[0] * x + M[1] * y + M[2] * z, rd.root[1] + M[3] * x + M[4] * y + M[5] * z, rd.root[2] + M[6] * x + M[7] * y + M[8] * z]);
    }
    const out = { ankles: ank, pose: rd.pose };
    if (md.crank) {
      const c = vr.crank || 0, R = md.crank[2], bx = md.crank[0] * sx, by = md.crank[1];
      out.targets = [-1, 1].map((sd) => [bx + sd * Math.cos(c) * R - 0.25, by + sd * Math.sin(c) * R + 0.18 + ANK_Y * sc, sd * KAINCHI.pz]);
      out.err = out.targets.map((t, i) => +Math.hypot(t[0] - ank[i][0], t[1] - ank[i][1], t[2] - ank[i][2]).toFixed(3));
    }
    return out;
  }
  function propEntity(e) {
    if (e.cars && Array.isArray(e.cars)) { // the mini train (shops.js)
      for (let k = 0; k < e.cars.length; k++) {
        const c = e.cars[k]; if (!c || !isFinite(c.x)) continue;
        const md = model(k === 0 ? 'train_engine' : 'train_coach');
        const tc = TH(c.x, c.y);
        FR.set(c.x, tc, c.y, -(c.a || 0), 0, 0);
        if (!visible(c.x, 4 + tc, c.y, 10)) continue;
        const P = vpool(md), i = P.add(); if (i < 0) continue;
        FR.write(P.M, i * 16, 0, 0, 0, 0, 0, 0, 1, 1, 1);
        const A = P.A.iVA.array, B = P.A.iVB.array, q = i * 4;
        A[q] = pack(k === 0 ? '#c8231d' : ['#2a5cb8', '#2a8c82', '#f2c230'][(k - 1) % 3]); A[q + 1] = pack(k === 0 ? '#f2c230' : '#f4efe2'); A[q + 2] = 1; A[q + 3] = 0;
        B[q] = 0; B[q + 1] = 0; B[q + 2] = 0; B[q + 3] = 0;
        const sp = (e.T && e.T.t) || H.time;
        for (const w of md.wheels) { const W = WHEELS.solid, wi = W.add(); if (wi >= 0) FR.write(W.M, wi * 16, w.x, w.r, w.z, 0, 0, -sp * 4, w.r, w.r, w.w); }
        if (k > 0) for (let q2 = 0; q2 < md.seats.length; q2++) {
          const pl = N.player, withP = k === 1 && q2 === 0 && e.T && e.T.withPlayer;
          submitRider(md, md.seats[q2], withP ? pl.look : extraLook(c, q2 + k), withP ? 7 : 31 * k + q2, 1, { fpsHide: withP && H.mode === 'fps' });
        }
      }
      return;
    }
    // anything else: a small crate (the core's generic fallback look)
    FR.set(e.x, H.elev(e), e.y, -(e.angle || 0), 0, 0);
    const md = model('crate'), P = vpool(md), i = P.add(); if (i < 0) return;
    FR.write(P.M, i * 16, 0, 0, 0, 0, 0, 0, 1, 1, 1);
    const A = P.A.iVA.array, q = i * 4; A[q] = pack(e.color || '#f2c230'); A[q + 1] = A[q]; A[q + 2] = 0; A[q + 3] = 0;
  }
  defModel('crate', (b) => { P1(b).box(-1.5, 0, -1.5, 1.5, 3, 1.5); FX(b, '#5a4a3a').box(-1.55, 1.3, -1.55, 1.55, 1.7, 1.55); return { L: 3, W: 3, H: 3 }; });
  defModel('cart', (b) => {
    FX(b, '#6a4a2a').box(-4.2, 3.0, -2.6, 4.2, 3.5, 2.6); P1(b).box(-3.9, 3.5, -2.3, 3.9, 4.1, 2.3);
    P1(b, 0.9).ell(0, 4.1, 0, 3.6, 1.1, 2.0, 10, 5, { lat0: 0 });
    FX(b, '#5a3a1a').tube([-4.2, 3.2, -2.0], [-6.8, 3.4, -2.2], 0.15).tube([-4.2, 3.2, 2.0], [-6.8, 3.4, 2.2], 0.15).tube([3.8, 3.0, 0], [3.8, 0.1, 0], 0.15);
    FX(b, '#7a5a3a').tube([0, 3.0, -2.7], [0, 3.0, 2.7], 0.12);
    return { L: 14, W: 6, H: 5.5, wheels: [{ x: 0, z: -2.9, r: 2.6, w: 0.35, kind: 'spoke' }, { x: 0, z: 2.9, r: 2.6, w: 0.35, kind: 'spoke' }] };
  });
  defModel('umbrella', (b) => {
    FX(b, '#c8c8c8').tube([0, -2.2, 0], [0, 0.3, 0], 0.07, 4);
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU, r = 3.4;
      (k % 2 ? P1(b, 1.0) : P1(b, 1.25)).triF([0, 0.9, 0], [Math.cos(a1) * r, -0.3, Math.sin(a1) * r], [Math.cos(a0) * r, -0.3, Math.sin(a0) * r]);
      (k % 2 ? P1(b, 0.7) : P1(b, 0.85)).triF([0, 0.88, 0], [Math.cos(a0) * r, -0.32, Math.sin(a0) * r], [Math.cos(a1) * r, -0.32, Math.sin(a1) * r]);
    }
    return { L: 7, W: 7, H: 1 };
  });
  defModel('bench', (b) => { FX(b, '#a8a49c').box(-1.4, 2.1, -3.4, 1.4, 2.6, 3.4); FX(b, '#8a867e').box(-1.2, 0, -3.0, 1.2, 2.1, -2.4).box(-1.2, 0, 2.4, 1.2, 2.1, 3.0); return { L: 3, W: 7, H: 2.6 }; });
  defModel('stool', (b) => { FX(b, '#7a5232').box(-1.2, 1.7, -1.3, 1.2, 2.2, 1.3); FX(b, '#5a3a22'); for (const p of [[-0.9, -1.0], [-0.9, 1.0], [0.9, -1.0], [0.9, 1.0]]) b.box(p[0] - 0.18, 0, p[1] - 0.18, p[0] + 0.18, 1.7, p[1] + 0.18); return { L: 2.4, W: 2.6, H: 2.2 }; });
  defModel('balloon', (b) => { P1(b).ell(0, 0, 0, 1.25, 1.5, 1.25, 8, 6); P1(b, 0.8).cyl([0, -1.45, 0], [0, -1.8, 0], 0.15, 0.25, 5, 0); return { L: 2.5, W: 2.5, H: 3 }; });
  function submitProp(key, x, h, y, yaw, c1, c2, s, roll) {
    const md = model(key), P = vpool(md), i = P.add(); if (i < 0) return;
    FR2.set(x, h, y, yaw, roll || 0, 0).write(P.M, i * 16, 0, 0, 0, 0, 0, 0, s || 1, s || 1, s || 1);
    const A = P.A.iVA.array, B = P.A.iVB.array, q = i * 4; A[q] = c1; A[q + 1] = c2 == null ? c1 : c2; A[q + 2] = 0; A[q + 3] = 0; B[q] = 0; B[q + 1] = 0; B[q + 2] = 0; B[q + 3] = 0;
    return md;
  }
  const CART_COL = { banana_cart: ['#f2d23a', '#4f8a3a'], flower_cart: ['#f4f0e8', '#e86a8a'], coconut_cart: ['#5f8a2a', '#8a6a3a'] };
  function flushExtras() {
    const E = EXTRAS;
    for (let k = 0; k < E.umb.length; k += 4) submitProp('umbrella', E.umb[k], E.umb[k + 1], E.umb[k + 2], 0, E.umb[k + 3]);
    for (let k = 0; k < E.carts.length; k += 5) {
      const c = CART_COL[E.carts[k + 3]] || CART_COL.banana_cart;
      const md = submitProp('cart', E.carts[k], E.carts[k + 4], E.carts[k + 1], -E.carts[k + 2], pack(c[0]), pack(c[1]));
      if (md) { FR2.set(E.carts[k], E.carts[k + 4], E.carts[k + 1], -E.carts[k + 2], 0, 0); for (const w of md.wheels) { const W = WHEELS.spoke, wi = W.add(); if (wi >= 0) FR2.write(W.M, wi * 16, w.x, w.r, w.z, 0, 0, 0, w.r, w.r, w.w); } }
    }
    for (let k = 0; k < E.benches.length; k += 5) submitProp(E.benches[k + 4] ? 'stool' : 'bench', E.benches[k], E.benches[k + 3], E.benches[k + 1], -E.benches[k + 2], 0);
    if (E.balloons.length) {
      if (!BAL_LINES) initBalloonLines();
      let n = 0; const pos = BAL_LINES.pos;
      for (const bb of E.balloons) {
        const cols = bb.cols || [];
        for (let i = 0; i < cols.length && n < 120; i++) {
          const a = (i / Math.max(1, cols.length)) * TAU + Math.sin(H.time * 0.7 + i) * 0.2;
          const bx = bb.x + Math.cos(a) * 2.2, by = bb.y + Math.sin(a) * 2.2, bh = bb.h + 9 + (i % 3) * 1.4;
          submitProp('balloon', bx, bh, by, 0, pack(cols[i]));
          const o = n * 6; pos[o] = bb.x; pos[o + 1] = bb.h; pos[o + 2] = bb.y; pos[o + 3] = bx; pos[o + 4] = bh - 1.8; pos[o + 5] = by; n++;
        }
      }
      BAL_LINES.geo.setDrawRange(0, n * 2); BAL_LINES.geo.attributes.position.needsUpdate = true; BAL_LINES.obj.visible = n > 0;
    } else if (BAL_LINES) BAL_LINES.obj.visible = false;
    E.umb.length = 0; E.carts.length = 0; E.benches.length = 0; E.balloons.length = 0;
  }
  let BAL_LINES = null;
  function initBalloonLines() {
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(240 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#e8e4dc' })); obj.frustumCulled = false; ROOT.add(obj);
    BAL_LINES = { geo, pos, obj };
  }

  /* ================================================================ season + festival props */
  defModel('idol', (b) => { // a seated, garlanded festival idol on its platform (pandal style), 10 u tall at scale 1
    FX(b, '#c03030').box(-3.2, 0, -3.2, 3.2, 1.0, 3.2); FX(b, '#e8b828').box(-3.3, 0.9, -3.3, 3.3, 1.1, 3.3);
    P2(b).ell(0.2, 2.2, 0, 2.3, 1.3, 2.5, 10, 6);
    P1(b).ell(0.5, 3.6, 0, 1.75, 1.85, 1.8, 12, 8).ell(0.1, 4.9, 0, 1.25, 1.0, 1.55, 10, 6);
    for (const s of [-1, 1]) { P1(b).cyl([0.2, 5.2, s * 1.4], [1.2, 6.2, s * 2.2], 0.32, 0.26, 6, 0).cyl([0.2, 4.6, s * 1.5], [1.4, 3.6, s * 1.8], 0.32, 0.28, 6, 0); P2(b).ell(1.3, 3.5, s * 1.85, 0.3, 0.3, 0.3, 6, 4); }
    P1(b).ell(0.55, 6.6, 0, 1.15, 1.15, 1.05, 10, 7);
    for (const s of [-1, 1]) P1(b, 0.92).ell(0.1, 6.6, s * 1.35, 0.25, 1.05, 0.85, 8, 5);
    P1(b).cyl([1.45, 6.4, 0], [1.75, 5.2, 0], 0.42, 0.3, 7, 0).cyl([1.75, 5.2, 0], [1.6, 4.4, 0.35], 0.3, 0.18, 7, 0);
    FX(b, '#f4f0e8').cyl([1.3, 6.1, -0.45], [1.75, 5.8, -0.6], 0.12, 0.05, 5, 0);
    FX(b, '#1a1214').ell(1.5, 6.95, -0.48, 0.08, 0.12, 0.1, 4, 3).ell(1.5, 6.95, 0.48, 0.08, 0.12, 0.1, 4, 3);
    FX(b, '#d8a838').lathe([[0.95, 7.45], [0.75, 8.3], [0.45, 9.1], [0.08, 9.8]], 10, 0.45, 0, 1, 1).lathe([[1.0, 7.35], [1.02, 7.6]], 10, 0.45, 0, 1, 1);
    FX(b, '#e8b828').xf(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-0.9, 6.6, 0)).ringZ([[2.4, -0.1], [2.75, -0.1], [2.75, 0.1], [2.4, 0.1]], 18).xf(null);
    FX(b, '#ff9a1a'); for (let k = 0; k < 12; k++) { const a = Math.PI * (0.15 + 0.7 * (k / 11)); b.ell(1.75 + Math.sin(a) * 0.3, 5.6 - Math.sin(a) * 1.6, Math.cos(a) * 1.7, 0.22, 0.22, 0.22, 5, 3); }
    return { L: 6.6, W: 6.6, H: 10 };
  });
  defModel('crane', (b) => {
    P1(b).box(-8, 1.6, -3.6, 8, 4.4, 3.6); FX(b, '#1c1a1c').box(-8.2, 0.6, -3.4, 8.2, 1.8, 3.4);
    P1(b, 0.9).box(4, 4.4, -3.4, 8, 8.6, 3.4); GL(b).quadO([8.05, 5.4, -2.8], [8.05, 5.4, 2.8], [8.05, 8.0, 2.8], [8.05, 8.0, -2.8], 1, 0, 0);
    b.part(1, [-2, 0, 0]);
    P1(b, 0.8).cyl([-2, 4.4, 0], [-2, 6.4, 0], 2.2, 2.0, 10, 2);
    P2(b).box(-5.5, 5.6, -1.2, -1.6, 7.6, 1.2);
    P2(b); for (const s of [-1, 1]) b.tube([-2, 6.6, s * 0.7], [22, 30, s * 0.25], 0.32, 4);
    FX(b, '#1c1a1c'); for (let k = 1; k < 8; k++) { const f = k / 8; b.tube([-2 + 24 * f, 6.6 + 23.4 * f, -0.7 + 0.45 * f], [-2 + 24 * f, 6.6 + 23.4 * f, 0.7 - 0.45 * f], 0.12, 3); }
    b.part(0);
    return { L: 16, W: 7.2, H: 30, wheels: [-5.5, 5.5].flatMap((x) => [{ x, z: -3.7, r: 1.9, w: 1.2, kind: 'solid' }, { x, z: 3.7, r: 1.9, w: 1.2, kind: 'solid' }]) };
  });
  defModel('stall', (b) => {
    FX(b, '#c8c0b0'); for (const p of [[-3.4, -2.6], [-3.4, 2.6], [3.4, -2.6], [3.4, 2.6]]) b.tube([p[0], 0, p[1]], [p[0], p[0] > 0 ? 9.2 : 8.2, p[1]], 0.14, 4);
    for (let k = 0; k < 6; k++) { (k % 2 ? P1(b) : FX(b, '#f4f0e6')); const z0 = -3.0 + k, z1 = z0 + 1; b.quad2([-3.9, 7.9, z0], [3.9, 9.4, z0], [3.9, 9.4, z1], [-3.9, 7.9, z1]); }
    FX(b, '#7a5a3a').box(1.4, 0, -2.6, 3.6, 3.4, 2.6); FX(b, '#e8d8a8').box(1.5, 3.4, -2.4, 3.5, 3.9, 2.4);
    P1(b, 0.8); for (let k = 0; k < 5; k++) b.ell(2.5, 4.1, -2 + k, 0.35, 0.35, 0.35, 5, 3);
    b.slot(11).color('#fff0d0').ell(0, 7.6, 0, 0.35, 0.45, 0.35, 6, 4);
    return { L: 8, W: 6, H: 9.4, bulb: [0, 7.6, 0] };
  });
  defModel('bhatti', (b) => {
    FX(b, '#8a4a2a').box(-3, 0, -3, 3, 3.4, 3); FX(b, '#6a3418').box(-3.05, 3.2, -3.05, 3.05, 3.5, 3.05);
    b.slot(10).color('#ff7a2a').box(2.98, 0.6, -1.0, 3.06, 2.2, 1.0);
    FX(b, '#b8733a').lathe([[2.0, 3.5], [2.6, 4.6], [2.4, 5.6], [2.0, 5.9], [2.1, 6.1]], 12, 0, 0, 1, 1);
    FX(b, '#8a5a3a').ell(0, 6.0, 0, 2.0, 0.25, 2.0, 10, 3, { lat0: 0 });
    return { L: 6, W: 6, H: 6.2 };
  });
  defModel('shed', (b) => {
    FX(b, '#8a6a42'); for (const p of [[-3.6, -3], [-3.6, 3], [3.6, -3], [3.6, 3]]) b.tube([p[0], 0, p[1]], [p[0], 8, p[1]], 0.2, 4);
    FX(b, '#c8a860').quad2([-4.4, 8.6, -3.8], [4.4, 7.4, -3.8], [4.4, 7.4, 3.8], [-4.4, 8.6, 3.8]);
    FX(b, '#b89850'); for (let z = -3.6; z <= 3.6; z += 0.8) b.box(-4.4, 7.35, z - 0.05, 4.4, 8.65, z + 0.05);
    FX(b, '#7a5a3a').box(-2.6, 0, -2.2, 2.6, 2.6, 2.2);
    FX(b, '#b8603a'); for (let k = -1; k <= 1; k++) b.lathe([[0.3, 2.6], [0.95, 3.2], [1.05, 3.8], [0.5, 4.5], [0.42, 4.7]], 9, k * 1.6, 0, 1, 1);
    return { L: 9, W: 8, H: 8.6 };
  });
  defModel('crib', (b) => {
    FX(b, '#7a5a3a').box(-3, 0, -3, -2.6, 6, 3).box(-3, 0, -3, 3, 6, -2.6).box(-3, 0, 2.6, 3, 6, 3);
    FX(b, '#c8a860').quad2([-3.4, 6.0, -3.4], [0, 8.2, -3.4], [0, 8.2, 3.4], [-3.4, 6.0, 3.4]).quad2([0, 8.2, -3.4], [3.4, 6.0, -3.4], [3.4, 6.0, 3.4], [0, 8.2, 3.4]);
    FX(b, '#e8dcc0').box(-1.2, 0, -0.8, 0.4, 0.8, 0.8); FX(b, '#2a5cb8').ell(0.8, 1.8, -1.4, 0.5, 1.8, 0.5, 6, 4); FX(b, '#c8a080').ell(0.8, 3.7, -1.4, 0.35, 0.4, 0.35, 6, 4);
    FX(b, '#6a4a2a').ell(0.8, 1.9, 1.4, 0.55, 1.9, 0.55, 6, 4); FX(b, '#c8a080').ell(0.8, 3.9, 1.4, 0.35, 0.4, 0.35, 6, 4);
    b.slot(11).color('#ffffff'); starShape(b, 0, 9.4, 0, 1.0, 0.3);
    return { L: 7, W: 7, H: 10.5 };
  });
  function starShape(b, cx, cy, cz, r, t) {
    const pts = [];
    for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + (k / 10) * TAU, rr = k % 2 ? r * 0.42 : r; pts.push([cx + Math.cos(a) * rr * 0.001, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr]); }
    for (const s of [-1, 1]) for (let k = 0; k < 10; k++) {
      const p0 = pts[k], p1 = pts[(k + 1) % 10], C = [cx + s * t, cy, cz];
      b.triF(C, p0, p1).triF(C, p1, p0);
    }
  }
  defModel('star', (b) => {
    b.slot(11).shade(1); starShape(b, 0, 0, 0, 2.2, 0.6);
    P1(b, 0.8); for (const z of [-0.6, 0, 0.6]) b.box(-0.03, -4.6, z - 0.12, 0.03, -1.0, z + 0.12);
    return { L: 1, W: 4.4, H: 4.4 };
  });
  defModel('kite', (b) => {
    P1(b).quad2([0, 0, -2.2], [0, 2.6, 0], [0, 0, 2.2], [0, -2.9, 0]);
    P2(b).quad2([0.02, 0, -0.9], [0.02, 1.0, 0], [0.02, 0, 0.9], [0.02, -1.2, 0]);
    FX(b, '#6a4a2a').box(-0.05, -2.9, -0.06, 0.05, 2.6, 0.06).xf(new THREE.Matrix4().makeTranslation(0, 0.9, 0)).tube([0, 0, -2.0], [0, 0, 2.0], 0.05, 3).xf(null);
    P2(b).quad2([0, -2.9, -0.5], [0, -2.9, 0.5], [0, -4.4, 0.3], [0, -4.4, -0.3]);
    return { L: 1, W: 4.4, H: 5.5 };
  });
  defModel('bulb', (b) => { b.slot(11).shade(1).ell(0, 0, 0, 0.32, 0.4, 0.32, 6, 4); return { L: 0.7, W: 0.7, H: 0.8 }; });

  /* ================================================================ markers, pointer, glints, emotes */
  const MK = { groups: [], geo: null, t: 0 };
  const MARK_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const MARK_FS = [
    'uniform vec3 uColor; uniform float uTime; uniform float uMode; uniform float uAlpha; varying vec2 vUv;',
    'void main(){ float v = vUv.y; float a;',
    '  if (uMode < 0.5) { a = pow(1.0 - v, 1.35) * (0.5 + 0.22 * sin((v * 3.0 - uTime * 1.1) * 6.2831)) + smoothstep(0.92, 1.0, 1.0 - v) * 0.35; }',
    '  else if (uMode < 1.5) { a = pow(1.0 - v, 1.1) * 0.32 * (0.8 + 0.2 * sin(uTime * 3.0)); }',
    '  else { float r = length(vUv - 0.5) * 2.0; a = smoothstep(0.55, 0.88, r) * (1.0 - smoothstep(0.94, 1.0, r)) * (0.65 + 0.35 * sin(uTime * 4.0)) + (1.0 - smoothstep(0.0, 0.9, r)) * 0.18; }',
    '  gl_FragColor = vec4(uColor * a * uAlpha, 1.0); }',
  ].join('\n');
  function markerGroup() {
    const g = new THREE.Group(); g.name = 'marker';
    const mk = (geo, mode) => {
      const m = new THREE.ShaderMaterial({ vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color() }, uTime: H.uniforms.uTime, uMode: { value: mode }, uAlpha: { value: 1 } } });
      const o = new THREE.Mesh(geo, m); o.frustumCulled = false; o.renderOrder = 9; g.add(o); return o;
    };
    g.userData.cyl = mk(MK.geo.cyl, 0); g.userData.beam = mk(MK.geo.beam, 1); g.userData.ring = mk(MK.geo.ring, 2);
    const d = new THREE.Mesh(MK.geo.dia, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); d.renderOrder = 9; g.add(d); g.userData.dia = d;
    g.visible = false; ROOT.add(g);
    return g;
  }
  function initMarkers() {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true); cyl.translate(0, 0.5, 0);
    const beam = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); beam.translate(0, 0.5, 0);
    const ring = new THREE.CircleGeometry(1, 40); ring.rotateX(-Math.PI / 2);
    const dia = new THREE.OctahedronGeometry(1, 0); dia.scale(0.8, 1.25, 0.8);
    MK.geo = { cyl, beam, ring, dia };
    const ptr = new THREE.ConeGeometry(1.0, 2.0, 4); ptr.rotateX(Math.PI); ptr.translate(0, 1.0, 0);
    MK.ptr = new THREE.Mesh(ptr, new THREE.MeshBasicMaterial({ color: '#ffd84a', toneMapped: false })); MK.ptr.visible = false; MK.ptr.renderOrder = 9; ROOT.add(MK.ptr);
    const pe = new THREE.Mesh(ptr, new THREE.MeshBasicMaterial({ color: '#1a1214', side: THREE.BackSide })); pe.scale.setScalar(1.18); MK.ptr.add(pe);
  }
  function markerList() {
    const M = N.missions, p = N.player, out = [];
    if (!M || !p) return out;
    try {
      const act = M.active;
      if (act && act.markers && !act.ended) { for (const mk of act.markers.values()) { const q = M.posOf ? M.posOf(mk.target) : null; if (q && isFinite(q.x)) out.push({ x: q.x, y: q.y, r: mk.r || 18, color: mk.color || '#ff5fb0', kind: 'goal', base: markerBase(mk, q) }); } }
      else if (M.markers) for (const q of M.markers()) if (q && isFinite(q.x)) out.push({ x: q.x, y: q.y, r: 14, color: q.color || '#f2c230', kind: q.kind || 'giver', base: markerBase(q, q) });
    } catch (e) { return out; }
    for (const o of out) o.d = Math.hypot(o.x - p.x, o.y - p.y);
    out.sort((a, b) => a.d - b.d);
    return out.filter((o) => o.d < 1700).slice(0, 8);
  }
  function roofH(x, y) { try { const RF = N.world && N.world.roofs; const h = RF && RF.heightAt ? RF.heightAt(x, y) : 0; return h ? h * VS : 0; } catch (e) { return 0; } }
  /** a marker's floor in 3D: the roof its target names (an explicit h, the target's level, a terrace place's roof:
   *  the story's own rule, story.js roofH), else the roof under its spot, else the street. (Journey audit J16: the
   *  M1 kite spot on the home terrace glowed at street level: N.places entries carry no roof, and the spot is not
   *  inside a roof cell.) */
  let rawPlaces = null;
  N.on('world:built', () => { rawPlaces = null; });
  function markerBase(mk, q) {
    try {
      const RF = N.world && N.world.roofs, get = (id) => (RF && RF.get && typeof id === 'string' ? RF.get(id) : null);
      if (mk && isFinite(mk.h) && mk.h > 0) return mk.h * VS;
      let t = mk && mk.target !== undefined ? mk.target : q;
      if (typeof t === 'function') t = q;
      if (typeof t === 'string') {
        if (!rawPlaces) { rawPlaces = new Map(); for (const pl of (N.WORLD_DATA && N.WORLD_DATA.places) || []) rawPlaces.set(pl.id, pl); }
        t = rawPlaces.get(t) || q;
      }
      for (const p of [t, q]) {
        if (!p) continue;
        if (p.h > 0 && p.roof) return p.h * VS;
        if (p.level && get(p.level)) return (get(p.level).h || 0) * VS;
        if (p.roof && get(p.roof) && p.kind === 'terrace') return (get(p.roof).h || 0) * VS;
      }
    } catch (e) { /* fall through */ }
    return roofH(q.x, q.y);
  }
  function updateMarkers() {
    const mode = N.state && N.state.mode;
    const list = mode === 'title' || mode === 'boot' ? [] : markerList();
    const t = H.time;
    for (let i = 0; i < Math.max(list.length, MK.groups.length); i++) {
      let g = MK.groups[i];
      const m = list[i];
      if (!m) { if (g) g.visible = false; continue; }
      if (!g) g = MK.groups[i] = markerGroup();
      const base = m.base != null ? m.base : roofH(m.x, m.y);
      const r = clamp(m.r * 0.62, 6, 16);
      g.visible = true; g.position.set(m.x, base, m.y);
      const UD = g.userData;
      for (const o of [UD.cyl, UD.beam, UD.ring]) o.material.uniforms.uColor.value.set(m.color);
      UD.cyl.scale.set(r, m.kind === 'goal' ? 18 : 14, r);
      UD.beam.scale.set(m.kind === 'goal' ? 2.2 : 1.6, 260, m.kind === 'goal' ? 2.2 : 1.6);
      UD.beam.material.uniforms.uAlpha.value = clamp((m.d - 60) / 200, 0.15, 1);
      UD.ring.scale.set(m.r * 1.0, 1, m.r * 1.0); UD.ring.position.y = 0.3;
      UD.dia.material.color.set(m.color);
      UD.dia.position.y = (m.kind === 'goal' ? 17 : 14) + Math.sin(t * 2.4 + i) * 1.1;
      UD.dia.rotation.y = t * 1.6 + i; const sd = m.kind === 'goal' ? 2.6 : 2.1; UD.dia.scale.set(sd, sd, sd);
      ST.markers++;
    }
  }
  function updatePointer() {
    const I = N.interact, p = N.player;
    const cur = I && I.current;
    let tg = null;
    if (cur && N.state.mode === 'play' && p && !p.vehicle) tg = cur.target || cur.entity || (isFinite(cur.x) && isFinite(cur.y) ? cur : null);
    if (!tg || !isFinite(tg.x)) { MK.ptr.visible = false; return; }
    let h = 7;
    if (tg.kind === 'vehicle') { const T = tg.T || {}; h = model(modelKeyFor(T)).H + 2.5; }
    else if (tg.look) h = H.elev(tg) + (tg.roofH ? tg.roofH * VS : 0) + 9.6 * lookSpec(tg.look, seedOf(tg)).size + 2.6;
    else h = roofH(tg.x, tg.y) + 6;
    const t = H.time;
    MK.ptr.visible = true;
    MK.ptr.position.set(tg.x, h + Math.sin(t * 4) * 0.5, tg.y);
    MK.ptr.rotation.y = t * 2.2;
  }
  // collectible glints (additive star points)
  const GL2 = { pts: null, n: 0 };
  function initGlints() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(32, 1); g.lineTo(35, 29); g.lineTo(63, 32); g.lineTo(35, 35); g.lineTo(32, 63); g.lineTo(29, 35); g.lineTo(1, 32); g.lineTo(29, 29); g.closePath(); g.fill();
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(96 * 3), col = new Float32Array(96 * 3), size = new Float32Array(96);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('gCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('gSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, uniforms: { map: { value: tex }, uScale: GLOW.mat.uniforms.uScale, uFogNear: GLOW.mat.uniforms.uFogNear, uFogFar: GLOW.mat.uniforms.uFogFar } });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 9; ROOT.add(pts);
    Object.assign(GL2, { pts, geo, pos, col, size });
  }
  function updateGlints() {
    const C = N.collectibles;
    let list = [];
    try { if (C && C.glintPoints && C.glints !== false) list = C.glintPoints(150) || []; } catch (e) { list = []; }
    let n = 0;
    for (const it of list) {
      if (n >= 96 || !isFinite(it.x)) continue;
      let base = 0;
      if (it.level) { try { const r = N.world.roofs.get(it.level); if (r) base = r.h * VS; } catch (e) { /* ignore */ } }
      const tw = clamp(it.tw || 0, 0, 1);
      const o = n * 3;
      GL2.pos[o] = it.x; GL2.pos[o + 1] = base + 1.4 + (it.h || 0) * VS; GL2.pos[o + 2] = it.y;
      const k = 0.55 + 0.9 * tw;
      GL2.col[o] = k; GL2.col[o + 1] = 0.92 * k; GL2.col[o + 2] = 0.62 * k;
      GL2.size[n] = 1.8 + 5.2 * tw;
      n++;
    }
    GL2.geo.setDrawRange(0, n); GL2.pts.visible = n > 0;
    if (n) for (const k of ['position', 'gCol', 'gSize']) GL2.geo.attributes[k].needsUpdate = true;
  }
  // emotes ('!', '?', '♪', '...', '♥', 'zzz', 'anger', 'sweat', '*', '!!') as camera-facing bubbles
  const EMO = { tex: new Map(), sprites: [] };
  function emoteTex(kind) {
    let t = EMO.tex.get(kind);
    if (t) return t;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1a1214'; g.fillRect(6, 8, 52, 40); g.fillRect(26, 48, 12, 6); g.fillRect(29, 54, 6, 4);
    g.fillStyle = '#fff8e6'; g.fillRect(9, 11, 46, 34); g.fillRect(29, 45, 6, 6);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(32 + x * 4, 11 + y * 3.4, w * 4, h * 3.4); };
    switch (kind) {
      case '!': P(-0.5, 1.5, 1, 5, '#e2483a'); P(-0.5, 7.5, 1, 1.2, '#e2483a'); break;
      case '!!': P(-2.5, 1.5, 1, 5, '#e2483a'); P(-2.5, 7.5, 1, 1.2, '#e2483a'); P(1.5, 1.5, 1, 5, '#e2483a'); P(1.5, 7.5, 1, 1.2, '#e2483a'); break;
      case '?': P(-2, 1.5, 4, 1, '#2a5cb8'); P(1, 2.5, 1, 2, '#2a5cb8'); P(-1, 4.5, 2, 1, '#2a5cb8'); P(-1, 5.5, 1, 1, '#2a5cb8'); P(-1, 7.5, 1, 1, '#2a5cb8'); break;
      case '♪': P(0, 1.5, 1, 6, '#7a3a8a'); P(1, 1.5, 2, 1, '#7a3a8a'); P(2, 2.5, 1, 1, '#7a3a8a'); P(-2, 6.5, 2, 2, '#7a3a8a'); break;
      case '♥': P(-3, 2.5, 2, 2, '#e2483a'); P(1, 2.5, 2, 2, '#e2483a'); P(-3, 3.5, 6, 2, '#e2483a'); P(-2, 5.5, 4, 1, '#e2483a'); P(-1, 6.5, 2, 1, '#e2483a'); break;
      case 'zzz': P(-3, 1.5, 3, 1, '#3a5a9a'); P(-2, 2.5, 1, 1, '#3a5a9a'); P(-3, 3.5, 3, 1, '#3a5a9a'); P(1, 4.5, 3, 1, '#3a5a9a'); P(2, 5.5, 1, 1, '#3a5a9a'); P(1, 6.5, 3, 1, '#3a5a9a'); break;
      case 'anger': P(-3, 2.5, 2, 1, '#e2483a'); P(1, 2.5, 2, 1, '#e2483a'); P(-3, 5.5, 2, 1, '#e2483a'); P(1, 5.5, 2, 1, '#e2483a'); P(-2, 1.5, 1, 2, '#e2483a'); P(1, 1.5, 1, 2, '#e2483a'); P(-2, 5.5, 1, 2, '#e2483a'); P(1, 5.5, 1, 2, '#e2483a'); break;
      case 'sweat': P(0, 1.5, 1, 1, '#4a9ad8'); P(-1, 2.5, 3, 3, '#4a9ad8'); P(0, 5.5, 1, 1, '#4a9ad8'); break;
      case '*': P(0, 1.5, 1, 6, '#e8a020'); P(-3, 3.5, 7, 2, '#e8a020'); break;
      default: for (let i = 0; i < 3; i++) P(-4 + i * 3, 4.5, 2, 2, '#3a3034');
    }
    t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
    EMO.tex.set(kind, t);
    return t;
  }
  function updateEmotes() {
    const t = H.time;
    let n = 0;
    for (const e of EMOTES) {
      if (n >= 12) break;
      let s = EMO.sprites[n];
      if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false })); s.renderOrder = 10; s.center.set(0.5, 0.15); ROOT.add(s); EMO.sprites[n] = s; }
      const tex = emoteTex(e.kind);
      if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
      s.material.opacity = e.a == null ? 1 : e.a;
      s.position.set(e.x, e.h + Math.sin(t * 4 + n) * 0.3, e.y);
      s.scale.set(4.2, 4.2, 1);
      s.visible = true;
      n++;
    }
    for (let i = n; i < EMO.sprites.length; i++) EMO.sprites[i].visible = false;
    EMOTES.length = 0;
  }

  /* ================================================================ dialogue barks over 3D heads */
  const BARKS = new Map(); // DOM bubble -> {target, h}
  function barkTarget(t) {
    if (t == null) return null;
    if (t === 'player') return N.player;
    if (typeof t === 'string') { const a = N.npcs && N.npcs.get ? N.npcs.get(t) : null; if (a) return a; return (N.places && N.places[t]) || null; }
    return typeof t.x === 'number' ? t : null;
  }
  function wrapBarks() {
    const D = N.dialogue;
    if (!D || D._bark3d || typeof D.bark !== 'function') return;
    const orig = D.bark;
    D.bark = function (target, text, opts) {
      const h = orig.apply(this, arguments);
      try {
        const host = document.getElementById('barks'), el = host && host.lastElementChild;
        if (el && h && !h.closed && !BARKS.has(el)) BARKS.set(el, { target: barkTarget(target), h: opts && opts.h });
        if (BARKS.size > 24) for (const k of Array.from(BARKS.keys())) if (!k.isConnected) BARKS.delete(k);
      } catch (e) { /* the 2D placement still works */ }
      return h;
    };
    D._bark3d = true;
  }
  wrapBarks();
  N.on('boot', wrapBarks);
  // two passes: every bark's size is read first, then every style written (reading offsetWidth after the previous
  // bark's style writes forced a style + layout pass per bark per frame). The sizes are the ones dialogue.js measured
  // in its read phase at the start of the frame (el._bw / el._bh, audit PERF-15): this runs after the HUD and the 2D
  // bark pass wrote styles, so any layout read here would be a forced one. A bubble not measured yet stays hidden.
  const BARKQ = [];
  const BVP = { w: window.innerWidth, h: window.innerHeight };
  window.addEventListener('resize', () => { BVP.w = window.innerWidth; BVP.h = window.innerHeight; });
  function updateBarks() {
    if (!BARKS.size) return;
    const p = N.player, vw = BVP.w, vh = BVP.h;
    BARKQ.length = 0;
    for (const [el, rec] of BARKS) {
      if (!el.isConnected) { BARKS.delete(el); continue; }
      const t = rec.target;
      if (!t || !isFinite(t.x)) continue;
      const v = t.vehicle && t.vehicle.alive !== false ? t.vehicle : t;
      let h;
      if (t.look) h = H.elev(t) + (t.roofH && !t.level ? t.roofH * VS : 0) + 9.4 * lookSpec(t.look, seedOf(t)).size + 2.4 + (t.vehicle ? 3.5 : 0);
      else if (t.kind === 'vehicle') h = model(modelKeyFor(t.T)).H + 2;
      else h = roofH(t.x, t.y) + 11;
      if (rec.h != null && !t.look) h = rec.h * VS;
      const d = p ? Math.hypot(v.x - p.x, v.y - p.y) : 0;
      const q = V3.project(v.x, v.y, h);
      const hide = q.behind || !q.visible || d > 320 || !el._bw;
      BARKQ.push(el, hide, q.x, q.y, d, hide ? 0 : el._bw, hide ? 0 : el._bh || 30);
    }
    for (let i = 0; i < BARKQ.length; i += 7) {
      const el = BARKQ[i];
      if (BARKQ[i + 1]) { el.style.visibility = 'hidden'; continue; }
      const qx = BARKQ[i + 2], qy = BARKQ[i + 3], d = BARKQ[i + 4], w = BARKQ[i + 5], hh = BARKQ[i + 6];
      const left = clamp(qx - w / 2, 6, Math.max(6, vw - w - 6)), top = clamp(qy - 6 - hh, 6, Math.max(6, vh - hh - 6));
      el.style.visibility = '';
      el.style.opacity = d > 250 ? String(clamp(1 - (d - 250) / 70, 0, 1)) : '';
      el.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
      el.style.setProperty('--tail', Math.round(clamp(qx - left, 10, w - 10)) + 'px');
    }
    BARKQ.length = 0;
  }

  /* ================================================================ seasons in 3D (N.seasons.scene) */
  const SEA = { t: 0, sc: null, strings: null, carry: new WeakMap(), lastQ: 0 };
  function initStrings() {
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(2400 * 3), col = new Float32Array(2400 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })); obj.frustumCulled = false; ROOT.add(obj);
    SEA.strings = { geo, pos, col, obj, n: 0 };
  }
  function line(x0, h0, y0, x1, h1, y1, sag, r, g, bl, seg) {
    const S = SEA.strings; seg = seg || 6;
    for (let k = 0; k < seg; k++) {
      if (S.n >= 2398) return;
      const a = k / seg, b2 = (k + 1) / seg;
      const o = S.n * 3;
      S.pos[o] = x0 + (x1 - x0) * a; S.pos[o + 1] = h0 + (h1 - h0) * a - Math.sin(a * Math.PI) * sag; S.pos[o + 2] = y0 + (y1 - y0) * a;
      S.pos[o + 3] = x0 + (x1 - x0) * b2; S.pos[o + 4] = h0 + (h1 - h0) * b2 - Math.sin(b2 * Math.PI) * sag; S.pos[o + 5] = y0 + (y1 - y0) * b2;
      S.col[o] = S.col[o + 3] = r; S.col[o + 1] = S.col[o + 4] = g; S.col[o + 2] = S.col[o + 5] = bl;
      S.n += 2;
    }
  }
  function carryLook(look, carry) {
    if (!carry || !look) return look;
    let m = SEA.carry.get(look); if (!m) { m = {}; SEA.carry.set(look, m); }
    if (!m[carry]) m[carry] = Object.assign({}, look, { prop: carry === 'bonam' ? 'pot' : carry });
    return m[carry];
  }
  const KCOLS = ['#e8402a', '#f2c230', '#2a5cb8', '#3aa04a', '#e86aa8', '#7a3db8', '#f4efe2', '#e07a2e'];
  function updateSeasons(dt) {
    const S = N.seasons;
    if (SEA.strings) SEA.strings.n = 0;
    if (!S || !S.scene || !OPT.seasons) return;
    const p = N.player; if (!p) return;
    SEA.t -= dt;
    if (SEA.t <= 0 || !SEA.sc) {
      const t0 = now();
      try { SEA.sc = S.scene(p.x, p.y, 560); } catch (e) { SEA.sc = null; N.err('view3d_actors.seasons', e); }
      SEA.lastQ = now() - t0;
      SEA.t = SEA.lastQ > 1.2 ? 0.2 : 0.05;
    }
    const sc = SEA.sc; if (!sc) return;
    if (!SEA.strings) initStrings();
    const t = H.time, night = H.night;
    // kites + strings to the kids on the roofs
    for (let i = 0; i < sc.kites.length; i++) {
      const k = sc.kites[i];
      const kh = k.h * VS + TH(k.x, k.y), ah = (k.ah != null ? k.ah - 9 : 0) * VS + 6.5 + TH(k.ax, k.ay); // (above the ground under each end)
      const yaw = -Math.atan2(k.ay - k.y, k.ax - k.x);
      submitProp('kite', k.x, kh, k.y, yaw, pack(k.color || KCOLS[i % KCOLS.length]), pack(KCOLS[(i + 3) % KCOLS.length]), 1.25, Math.sin(t * 2.1 + i) * 0.25);
      line(k.ax, ah, k.ay, k.x, kh, k.y, Math.hypot(k.x - k.ax, k.y - k.ay) * 0.06, 0.9, 0.88, 0.8, 7);
      ST.kites++;
    }
    // people: kite flyers on roofs, processions, crowds
    for (let i = 0; i < sc.people.length; i++) {
      const q = sc.people[i];
      if (!q.look || !isFinite(q.x)) continue;
      const look = carryLook(q.look, q.carry === 'neem' ? null : q.carry);
      const el = (q.h || 0) * VS;
      if (el > 0) { poseRest(J); armsTo(J, -0.05, 1.3, 8.4, -0.35, 1.5, 9.0, 0.35); }
      else if (q.carry) { const wk = q.carry === 'bonam' ? 0.85 : 1; gaitParams(6, false, wk, GP); gaitPose(J, t * GP.f + i * 0.37, GP, wk); if (q.carry === 'bonam') armsTo(J, 0.02, 0.25, 9.2, -0.62, 0.25, 9.2, 0.62); else if (q.carry === 'dappu') { J[4] = 0.9; J[6] = 1.2; J[5] = 0.8 + Math.sin(t * 10 + i) * 0.3; J[7] = 1.4; } }
      else { poseRest(J); J[4] += Math.sin(t * 1.3 + i) * 0.05; J[5] += Math.sin(t * 1.1 + i * 2) * 0.05; }
      FR.set(q.x, el + TH(q.x, q.y), q.y, -(q.a || 0), 0, 0);
      submitPerson(look, 1000 + i, FR, 0, 0, 0, J, {});
    }
    // props
    for (let i = 0; i < sc.props.length; i++) {
      const pr = sc.props[i];
      const yaw = -(pr.a || 0);
      switch (pr.kind) {
        case 'lorry': case 'tractor': case 'giant': {
          const s = pr.kind === 'tractor' ? 0.75 : pr.kind === 'giant' ? 1.2 : 1;
          const md = model('lorry_open');
          const tp = TH(pr.x, pr.y);
          FR.set(pr.x, tp, pr.y, yaw, 0, 0);
          if (!visible(pr.x, 8 + tp, pr.y, 30 * s)) break;
          const P = vpool(md), vi = P.add();
          if (vi >= 0) { FR.write(P.M, vi * 16, 0, 0, 0, 0, 0, 0, s, s, s); const A = P.A.iVA.array, B = P.A.iVB.array, q2 = vi * 4; A[q2] = pack(['#e8742a', '#2a5cb8', '#c8202a', '#3a8a3a', '#f2c230'][i % 5]); A[q2 + 1] = pack('#e8c060'); A[q2 + 2] = night > 0.1 ? 1 : 0; A[q2 + 3] = 0; B[q2] = 0; B[q2 + 1] = 0; B[q2 + 2] = 0; B[q2 + 3] = 0; }
          for (const w of md.wheels) { const W = WHEELS.solid, wi = W.add(); if (wi >= 0) FR.write(W.M, wi * 16, w.x * s, w.r * s, w.z * s, 0, 0, 0, w.r * s, w.r * s, w.w * s); }
          if (pr.idol) { const cols = pr.idol.colors || ['#e8a87c', '#c8202a']; const isz = clamp((pr.idol.size || 16) * VS / 10, 1.2, 6.5); FR.apply(-6 * s, md.bed[2] * s, 0, P3); submitProp('idol', P3[0], P3[1], P3[2], yaw, pack(cols[0] || '#e8a87c'), pack(cols[1] || '#c8202a'), isz); if (night > 0.05) glow(P3[0], P3[1] + isz * 7, P3[2], 1.0 * night, 0.7 * night, 0.4 * night, isz * 7); }
          break;
        }
        case 'crane': {
          const phase = (pr.t || 0) % 16;
          const slew = phase < 4 ? 0 : phase < 8 ? (phase - 4) / 4 * 1.3 : phase < 11 ? 1.3 : 1.3 * (1 - (phase - 11) / 5);
          const lake = Math.atan2(pr.oy || 0, pr.ox || 1);
          const cy = -(lake - Math.PI / 2);
          const md = model('crane');
          FR.set(pr.x, TH(pr.x, pr.y), pr.y, cy, 0, 0);
          const P = vpool(md), vi = P.add();
          if (vi >= 0) { FR.write(P.M, vi * 16, 0, 0, 0, 0, 0, 0, 1, 1, 1); const A = P.A.iVA.array, B = P.A.iVB.array, q2 = vi * 4; A[q2] = pack('#e0b020'); A[q2 + 1] = pack('#c8901a'); A[q2 + 2] = 0; A[q2 + 3] = 0; B[q2] = slew; B[q2 + 1] = 0; B[q2 + 2] = 0; B[q2 + 3] = 0; }
          for (const w of md.wheels) { const W = WHEELS.solid, wi = W.add(); if (wi >= 0) FR.write(W.M, wi * 16, w.x, w.r, w.z, 0, 0, 0, w.r, w.r, w.w); }
          // boom tip (local, after the slew about x = -2) and the hook with an idol on the way down
          const bx = -2 + Math.cos(slew) * 24, bz = Math.sin(slew) * 24;
          FR.apply(bx, 30, bz, P3);
          const tipX = P3[0], tipH = P3[1], tipY = P3[2];
          const hookH = phase < 4 ? 6 + phase * 3 : phase < 8 ? 18 : phase < 11 ? 18 - (phase - 8) * 7 : 20;
          line(tipX, tipH, tipY, tipX, hookH + 2, tipY, 0, 0.15, 0.15, 0.15, 1);
          if (pr.idol && phase < 10.5) { const cols = Array.isArray(pr.idol) ? pr.idol : (pr.idol.colors || ['#e8a87c', '#c8202a']); submitProp('idol', tipX, hookH - 9, tipY, cy, pack(cols[0] || '#e8a87c'), pack(cols[1] || '#c8202a'), 1.3); }
          break;
        }
        case 'stall': {
          const tp = TH(pr.x, pr.y), md = submitProp('stall', pr.x, tp, pr.y, yaw, pack(pr.color || '#2a8c82'));
          if (md && night > 0.1) { FR2.set(pr.x, tp, pr.y, yaw, 0, 0).apply(0, 7.6, 0, P3); glow(P3[0], P3[1], P3[2], night, 0.85 * night, 0.6 * night, 6); }
          break;
        }
        case 'haleem_bhatti': { const tp = TH(pr.x, pr.y); submitProp('bhatti', pr.x, tp, pr.y, 0, 0); if (night > 0.1) glow(pr.x + 3.2, tp + 1.4, pr.y, night, 0.45 * night, 0.15 * night, 5); break; }
        case 'chalivendram': submitProp('shed', pr.x, TH(pr.x, pr.y), pr.y, yaw, 0); break;
        case 'crib': { const tp = TH(pr.x, pr.y); submitProp('crib', pr.x, tp, pr.y, 0, pack('#f2e8a0')); if (night > 0.1) glow(pr.x, tp + 9.4, pr.y, night, night, 0.8 * night, 5); break; }
        case 'bulbs': {
          const h0 = (pr.h || 14) * VS + TH(pr.x, pr.y), h1 = (pr.h1 || 14) * VS + TH(pr.x1, pr.y1), n = clamp(Math.round(Math.hypot(pr.x1 - pr.x, pr.y1 - pr.y) / 5), 3, 24);
          const cols = pr.colors || ['#40ff80', '#ffffff'];
          line(pr.x, h0, pr.y, pr.x1, h1, pr.y1, 2.5, 0.12, 0.12, 0.12, 8);
          for (let k = 1; k < n; k++) {
            const a = k / n, x = pr.x + (pr.x1 - pr.x) * a, y = pr.y + (pr.y1 - pr.y) * a, h = h0 + (h1 - h0) * a - Math.sin(a * Math.PI) * 2.5 - 0.5;
            const cc = cols[k % cols.length];
            submitProp('bulb', x, h, y, 0, pack(cc));
            if (night > 0.1) { const c = H.color(cc); glow(x, h, y, c.r * night, c.g * night, c.b * night, 3.2); }
          }
          break;
        }
        default: break;
      }
    }
    // Christmas stars on Secunderabad houses
    if (S.is && (S.is('christmas') || (N.flags && N.flags.christmas))) christmasStars(p, night);
  }
  const XMAS = { cache: null, cx: 1e9, cy: 1e9 };
  function christmasStars(p, night) {
    if (!N.world || !N.world.queryStructures) return;
    if (!XMAS.cache || Math.abs(p.x - XMAS.cx) > 150 || Math.abs(p.y - XMAS.cy) > 150) {
      XMAS.cx = p.x; XMAS.cy = p.y; XMAS.cache = [];
      const R = 520;
      try {
        N.world.queryStructures(p.x - R, p.y - R, p.x + R, p.y + R, (s) => {
          if (XMAS.cache.length >= 48 || s.t !== 'bldg' || !(s.h > 8)) return;
          const d = N.world.districtAt ? N.world.districtAt(s.x + s.w / 2, s.y + s.d / 2) : null;
          const st = d && (d.style || ''), id = d && (d.id || '');
          if (!(st === 'cantonment' || /secunderabad|bolarum|trimulgherry|marredpally|cantonment|begumpet/.test(id))) return;
          if (U.hash2(s.x * 0.37, s.y * 0.53) > 0.3) return;
          XMAS.cache.push([s.x + s.w / 2, s.h * VS - 3.5 + (H.terrainBase ? H.terrainBase(s.x, s.y, s.x + s.w, s.y + s.d) : 0), s.y + s.d + 0.8, ['#e8402a', '#f2c230', '#f4f0e8', '#2a8ad8'][(s.x * 7 + s.y) % 4 | 0]]);
        });
      } catch (e) { /* no stars */ }
    }
    for (const st of XMAS.cache) {
      if (!visible(st[0], st[1], st[2], 4)) continue;
      submitProp('star', st[0], st[1] + Math.sin(H.time * 1.4 + st[0]) * 0.15, st[2], 0, pack(st[3]));
      if (night > 0.1) { const c = H.color(st[3]); glow(st[0], st[1], st[2] + 0.6, c.r * night, c.g * night, c.b * night, 6); }
    }
  }
  // LB Stadium match day (N.cricketMatch.dressing, built by the 2D painter): parked two-wheelers + fans at the gates
  const DRESS_MODEL = { chetak: 'chetak', luna: 'luna', cycle: 'hero', rx: 'rx100' };
  function updateDressing() {
    const CM = N.cricketMatch, D = CM && CM.dressing;
    if (!D || !D.on || !D.built || !(N.flags && N.flags.lb_match)) return;
    const p = N.player; if (!p || !D.lm || Math.hypot(D.lm.x - p.x, D.lm.y - p.y) > 700) return;
    for (const v of D.parked || []) {
      const md = model(DRESS_MODEL[v.kind] || 'chetak');
      const tv = TH(v.x, v.y);
      FR.set(v.x, tv, v.y, -(v.a || 0), -(md.standLean || 0), 0);
      if (!visible(v.x, 3 + tv, v.y, 10)) continue;
      const P = vpool(md), i = P.add(); if (i < 0) continue;
      FR.write(P.M, i * 16, 0, 0, 0, 0, 0, 0, 1, 1, 1);
      const A = P.A.iVA.array, B = P.A.iVB.array, q = i * 4; A[q] = pack(v.col); A[q + 1] = pack(shadeHex(v.col, 0.7)); A[q + 2] = 0; A[q + 3] = 0; B[q] = 0; B[q + 1] = 0; B[q + 2] = 0; B[q + 3] = 0;
      for (const w of md.wheels) { const W = w.kind === 'spoke' ? WHEELS.spoke : WHEELS.solid, wi = W.add(); if (wi >= 0) FR.write(W.M, wi * 16, w.x, w.r, w.z, 0, 0, 0, w.r, w.r, w.w); }
    }
    const t = H.time;
    for (let k = 0; k < (D.peds || []).length; k++) {
      const q = D.peds[k]; if (!q.look) continue;
      poseRest(J); J[4] += Math.sin(t * 1.2 + (q.ph || 0)) * 0.08; J[5] = 0.2 + Math.sin(t * 2 + k) * 0.1;
      FR.set(q.x, TH(q.x, q.y), q.y, -(q.a || 0), 0, 0);
      submitPerson(q.look, 2000 + k, FR, 0, 0, 0, J, {});
    }
  }

  /* ================================================================ skid marks, dust, exhaust smoke, wake foam
   * 3D parity of vehicles.js's private 2D decals / particles (not exposed): skid marks follow the
   * rear-wheel points vehicles.js itself tracks while a vehicle skids (v.skidding, v.skL / v.skR)
   * and fade over 40 s of game time; puffs mirror its effects() rules: two-stroke blue smoke from
   * autos, diesel soot from buses and lorries, dust behind fast wheels on dirt / sand / grass, tyre
   * smoke when skidding on tarmac, foam behind boats. Two draw calls in all. */
  const SK_MAX = 720, PT_MAX = 384, SK_LIFE = 40;
  const FXS = { sk: null, skHead: 0, skN: 0, skDirty: false, pt: null, ptHead: 0, live: 0, E: { x: 0, y: 0 } };
  const PCOL3 = {};
  function fxCol(hex) { let c = PCOL3[hex]; if (!c) { const k = parseInt(hex.slice(1), 16); c = PCOL3[hex] = [(k >> 16 & 255) / 255, (k >> 8 & 255) / 255, (k & 255) / 255]; } return c; }
  function initFx() {
    // skid marks: a ring of ground quads, faded by age in the shader
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(SK_MAX * 12), birth = new Float32Array(SK_MAX * 4).fill(-1e9), idx = new Uint16Array(SK_MAX * 6);
    for (let i = 0; i < SK_MAX; i++) { const v = i * 4, o = i * 6; idx[o] = v; idx[o + 1] = v + 2; idx[o + 2] = v + 1; idx[o + 3] = v + 1; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({
      uniforms: { uNow: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      vertexShader: 'attribute float aBirth; uniform float uNow; varying float vA; void main(){ float age = uNow - aBirth; vA = (age < 0.0 || age > ' + SK_LIFE.toFixed(1) + ') ? 0.0 : 0.5 * (1.0 - smoothstep(' + (SK_LIFE * 0.5).toFixed(1) + ', ' + SK_LIFE.toFixed(1) + ', age)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main(){ if (vA < 0.004) discard; gl_FragColor = vec4(0.06, 0.05, 0.055, vA); }',
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.name = 'actors:skids'; mesh.visible = false;
    ROOT.add(mesh);
    FXS.sk = { g, pos, birth, mesh, mat: m };
    // puffs: soft points with normal blending (smoke / dust / foam), simulated on the CPU
    const pg = new THREE.BufferGeometry();
    const P = { x: new Float32Array(PT_MAX), h: new Float32Array(PT_MAX), y: new Float32Array(PT_MAX), vx: new Float32Array(PT_MAX), vh: new Float32Array(PT_MAX), vy: new Float32Array(PT_MAX),
      t: new Float32Array(PT_MAX).fill(1e9), life: new Float32Array(PT_MAX).fill(1), r: new Float32Array(PT_MAX), a: new Float32Array(PT_MAX), c: new Float32Array(PT_MAX * 3) };
    P.pos = new Float32Array(PT_MAX * 3); P.col = new Float32Array(PT_MAX * 4); P.size = new Float32Array(PT_MAX);
    pg.setAttribute('position', new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('pCol', new THREE.BufferAttribute(P.col, 4).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('pSize', new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const pm = new THREE.ShaderMaterial({
      uniforms: { map: { value: H.materials.glow.map }, uScale: { value: 400 }, uFogNear: { value: 400 }, uFogFar: { value: 1500 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec4 pCol; attribute float pSize; uniform float uScale; uniform float uFogNear; uniform float uFogFar; varying vec4 vC; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(1.0, -mv.z); gl_PointSize = clamp(pSize * uScale / d, 0.0, 260.0); vC = vec4(pCol.rgb, pCol.a * (1.0 - smoothstep(uFogNear, uFogFar, d))); }',
      fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ float a = texture2D(map, gl_PointCoord).r; a = a * a * vC.a; if (a < 0.004) discard; gl_FragColor = vec4(vC.rgb, a); }',
    });
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; pts.renderOrder = 6; pts.name = 'actors:puffs'; pts.visible = false;
    ROOT.add(pts);
    P.g = pg; P.pts = pts; P.mat = pm;
    FXS.pt = P;
  }
  function skidSeg(x0, y0, x1, y1, w, t) {
    const S = FXS.sk; if (!S) return;
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, px = -(y1 - y0) / L * w / 2, py = (x1 - x0) / L * w / 2;
    FXS.E.x = x0; FXS.E.y = y0; const h0 = (V3.elevation ? V3.elevation(FXS.E) : 0) + 0.07;
    FXS.E.x = x1; FXS.E.y = y1; const h1 = (V3.elevation ? V3.elevation(FXS.E) : 0) + 0.07;
    const i = FXS.skHead, o = i * 12;
    const q = S.pos;
    q[o] = x0 - px; q[o + 1] = h0; q[o + 2] = y0 - py;
    q[o + 3] = x0 + px; q[o + 4] = h0; q[o + 5] = y0 + py;
    q[o + 6] = x1 - px; q[o + 7] = h1; q[o + 8] = y1 - py;
    q[o + 9] = x1 + px; q[o + 10] = h1; q[o + 11] = y1 + py;
    S.birth[i * 4] = S.birth[i * 4 + 1] = S.birth[i * 4 + 2] = S.birth[i * 4 + 3] = t;
    FXS.skHead = (i + 1) % SK_MAX; if (FXS.skN < SK_MAX) FXS.skN++;
    FXS.skDirty = true; ST.skids++;
  }
  function puff(x, h, y, vx, vh, vy, life, r, hex, a) {
    const P = FXS.pt; if (!P) return;
    const i = FXS.ptHead; FXS.ptHead = (i + 1) % PT_MAX;
    P.x[i] = x; P.h[i] = h; P.y[i] = y; P.vx[i] = vx; P.vh[i] = vh; P.vy[i] = vy; P.t[i] = 0; P.life[i] = life; P.r[i] = r; P.a[i] = a;
    const c = fxCol(hex); P.c[i * 3] = c[0]; P.c[i * 3 + 1] = c[1]; P.c[i * 3 + 2] = c[2];
  }
  /** per vehicle, every frame (also off screen, so marks and smoke stay continuous) */
  function vehicleFx(v, T, md) {
    if (!FXS.pt || OPT.fx === false || !T) return;
    if (camDist(v.x, 3 + TH(v.x, v.y), v.y) > 320) { v._sk3 = null; return; }
    const tnow = nowS();
    // skid marks along vehicles.js's own rear-wheel track points
    if (v.skidding && (v.skL || v.skR) && T.mode !== 'boat') {
      const st = v._sk3 || (v._sk3 = { L: null, R: null });
      const w = T.cls === 'bike' ? 0.9 : T.cls === 'heavy' ? 2.3 : 1.7;
      for (let k = 0; k < 2; k++) {
        const p = k ? v.skR : v.skL, q = k ? st.R : st.L;
        if (!p) { if (k) st.R = null; else st.L = null; continue; }
        if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.8) continue;
        if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 30) skidSeg(q[0], q[1], p[0], p[1], w, tnow);
        const n2 = [p[0], p[1]]; if (k) st.R = n2; else st.L = n2;
      }
    } else if (v._sk3) v._sk3 = null;
    const dt = simDt(); if (!(dt > 0)) return;
    const sp = Math.abs(v.speed || 0), c = Math.cos(v.angle || 0), s = Math.sin(v.angle || 0);
    const len = T.w || md.L, wd = T.d || md.W;
    const rearX = v.x - c * len * 0.5, rearY = v.y - s * len * 0.5;
    if (md.boat || T.mode === 'boat') {
      if (sp > 8 && Math.random() < dt * (6 + sp * 0.25)) {
        const sd = Math.random() < 0.5 ? -1 : 1;
        puff(rearX + s * sd * 2, 0.35, rearY - c * sd * 2, -c * 8 + s * sd * 10, 0.4, -s * 8 - c * sd * 10, 1.6 + Math.random(), 2.2 + Math.random() * 1.6, '#e8f6f4', 0.8);
      }
      return;
    }
    if (T.smoke && v.driver && !v.fallen) {
      v._smk3 = (v._smk3 || 0) - dt * (0.6 + Math.abs(v.throttle || 0) * 2.2 + sp / 90);
      if (v._smk3 <= 0) {
        v._smk3 = T.smoke === 'diesel' ? 0.32 : T.smoke === 'light' ? 0.6 : 0.4;
        const hex = T.smoke === 'diesel' ? '#4a4648' : T.smoke === '2t' ? '#b8c4d4' : '#d0d4dc';
        const ex = v.x - c * (len * 0.5 + 1) + s * (wd * 0.22), ey = v.y - s * (len * 0.5 + 1) - c * (wd * 0.22);
        const heavy = T.cls === 'heavy';
        puff(ex, heavy ? 2.6 : 1.4, ey, -c * 10 + (Math.random() - 0.5) * 6, 3 + Math.random() * 2, -s * 10 + (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.6, heavy ? 4.2 : 2.4, hex, T.smoke === 'diesel' ? 0.55 : 0.42);
      }
    }
    let surf = null; try { surf = N.world.surfaceAt(v.x, v.y); } catch (e) { surf = null; }
    const S = N.SURF || {};
    const dirt = surf != null && (surf === S.GROUND || surf === S.SAND || surf === S.GRASS);
    if ((dirt && sp > 35) || v.skidding) {
      if (Math.random() < dt * (dirt ? 4 + sp * 0.12 : 18)) {
        const hex = surf === S.SAND ? '#d8c49a' : surf === S.GRASS ? '#a8b88a' : dirt ? '#c4a07a' : '#d6d2d0';
        puff(rearX + (Math.random() - 0.5) * wd, 0.9, rearY + (Math.random() - 0.5) * wd, -(v.vx || 0) * 0.15 + (Math.random() - 0.5) * 10, 3.5 + Math.random() * 2.5, -(v.vy || 0) * 0.15 + (Math.random() - 0.5) * 10, 0.9 + Math.random() * 0.6, 3.6, hex, dirt ? 0.5 : 0.38);
      }
    }
  }
  function commitFx() {
    const S = FXS.sk, P = FXS.pt; if (!S || !P) return;
    const tnow = nowS();
    S.mat.uniforms.uNow.value = tnow;
    if (FXS.skDirty) { S.g.attributes.position.needsUpdate = true; S.g.attributes.aBirth.needsUpdate = true; FXS.skDirty = false; }
    S.mesh.visible = FXS.skN > 0 && OPT.fx !== false;
    // puffs: drift, rise, grow, fade (game time)
    const dt = simDt(), night = H.night || 0, lit = 1 - 0.72 * night;
    const dr = Math.exp(-dt * 2.5), dh = Math.exp(-dt * 1.2);
    let n = 0;
    for (let i = 0; i < PT_MAX; i++) {
      if (P.t[i] >= P.life[i]) continue;
      P.t[i] += dt;
      const f = P.t[i] / P.life[i]; if (f >= 1) continue;
      P.x[i] += P.vx[i] * dt; P.h[i] += P.vh[i] * dt; P.y[i] += P.vy[i] * dt;
      P.vx[i] *= dr; P.vy[i] *= dr; P.vh[i] *= dh;
      const o = n * 3, q = n * 4;
      P.pos[o] = P.x[i]; P.pos[o + 1] = P.h[i]; P.pos[o + 2] = P.y[i];
      P.col[q] = P.c[i * 3] * lit; P.col[q + 1] = P.c[i * 3 + 1] * lit; P.col[q + 2] = P.c[i * 3 + 2] * lit;
      P.col[q + 3] = P.a[i] * (1 - f) * Math.min(1, f * 8 + 0.2);
      P.size[n] = P.r[i] * (1 + f * 2.2);
      n++;
    }
    P.g.setDrawRange(0, n);
    P.pts.visible = n > 0 && OPT.fx !== false;
    if (n) for (const k of ['position', 'pCol', 'pSize']) { const a = P.g.attributes[k]; a.needsUpdate = true; a.updateRange.offset = 0; a.updateRange.count = n * a.itemSize; }
    P.mat.uniforms.uScale.value = GLOW.mat ? GLOW.mat.uniforms.uScale.value : 400;
    const fog = H.scene.fog; if (fog) { P.mat.uniforms.uFogNear.value = fog.near; P.mat.uniforms.uFogFar.value = fog.far; }
    FXS.live = n; ST.puffs = n;
  }

  /* ================================================================ init, frame commit, registration */
  let FAILED = false;
  function initDecals() {
    const c = document.createElement('canvas'); c.width = DEC.CW * DEC.cols; c.height = DEC.CHh * DEC.rows;
    DEC.canvas = c; DEC.g = c.getContext('2d');
    DEC.tex = new THREE.CanvasTexture(c); DEC.tex.encoding = THREE.sRGBEncoding; DEC.tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: DEC.tex, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 iUV;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = uv * iUV.zw + iUV.xy;\n#endif');
    };
    mat.customProgramCacheKey = () => 'nostalgia-decal';
    DEC.pool = new Pool('decals', geo, mat, 32, { iUV: 4 }, { receive: true, max: 1024 });
  }
  function ensure() {
    if (READY) return true;
    if (FAILED || !V3.ready || !H.THREE || !H.layer) return false;
    THREE = H.THREE;
    try {
      TV = new THREE.Vector3(); TN = new THREE.Vector3();
      ROOT = new THREE.Group(); ROOT.name = 'actors3d'; H.layer.add(ROOT);
      VEH_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
      VEH_MAT.onBeforeCompile = vehicleCompile; VEH_MAT.customProgramCacheKey = () => 'nostalgia-vehicle';
      GLASS_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
      GLASS_MAT.onBeforeCompile = glassCompile; GLASS_MAT.customProgramCacheKey = () => 'nostalgia-vehicle-glass';
      GLASS_MAT.userData.shared = true;
      WHEEL_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
      ANIMAL_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
      ANIMAL_MAT.onBeforeCompile = animalCompileFactory(false); ANIMAL_MAT.customProgramCacheKey = () => 'nostalgia-animal';
      ANIMAL_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      ANIMAL_DEPTH.onBeforeCompile = animalCompileFactory(true); ANIMAL_DEPTH.customProgramCacheKey = () => 'nostalgia-animal-depth';
      for (const m of [VEH_MAT, WHEEL_MAT, ANIMAL_MAT, ANIMAL_DEPTH]) m.userData.shared = true;
      initPeople();
      WHEELS = { spoke: new Pool('wheelSpoke', buildWheel('spoke'), WHEEL_MAT, 32, {}, { cast: true, max: 2048 }), solid: new Pool('wheelSolid', buildWheel('solid'), WHEEL_MAT, 48, {}, { cast: true, max: 2048 }) };
      initGlows(); initLightPools(); initDecals(); initMarkers(); initGlints(); initFx();
      READY = true;
    } catch (e) {
      FAILED = true;
      N.err('view3d_actors.init', e);
    }
    return READY;
  }
  function mark() { if (!tFrame0) tFrame0 = now(); }
  function spec(fn, name) {
    return {
      fps: true, shadow: false,
      create() { ensure(); return new H.THREE.Object3D(); },
      update(obj, e, dt) { if (!READY) return; mark(); fn(e, dt); },
      name,
    };
  }
  V3.registerActorRenderer('player', spec(personEntity, 'player'));
  V3.registerActorRenderer('ped', spec(personEntity, 'ped'));
  V3.registerActorRenderer('npc', spec(personEntity, 'npc'));
  V3.registerActorRenderer('vehicle', spec(vehicleEntity, 'vehicle'));
  V3.registerActorRenderer('animal', spec(animalEntity, 'animal'));
  V3.registerActorRenderer('prop', spec(propEntity, 'prop'));
  V3.registerLayer('actors.parity', {
    order: 100,
    init() { ensure(); },
    update(dt) {
      if (!ensure()) return;
      mark();
      if (DBG.cam && DBG.cam.pos) {
        const c = H.camera, q = DBG.cam;
        c.position.set(q.pos[0], q.pos[1], q.pos[2]); c.lookAt(q.look[0], q.look[1], q.look[2]);
        if (q.fov && c.fov !== q.fov) { c.fov = q.fov; c.updateProjectionMatrix(); }
        c.updateMatrixWorld();
      }
      try { pigeons(); } catch (e) { N.err('view3d_actors.pigeons', e); }
      try { updateSeasons(dt); } catch (e) { N.err('view3d_actors.seasons', e); }
      try { updateDressing(); } catch (e) { N.err('view3d_actors.dressing', e); }
      try { updateMarkers(); updatePointer(); } catch (e) { N.err('view3d_actors.markers', e); }
      try { updateGlints(); } catch (e) { N.err('view3d_actors.glints', e); }
      try { updateEmotes(); } catch (e) { N.err('view3d_actors.emotes', e); }
      try { updateBarks(); } catch (e) { N.err('view3d_actors.barks', e); }
    },
  });
  V3.registerLayer('actors.commit', {
    order: 1000,
    update() {
      if (!READY) return;
      try { flushExtras(); } catch (e) { N.err('view3d_actors.extras', e); }
      if (SEA.strings) { const S = SEA.strings; S.geo.setDrawRange(0, S.n); S.obj.visible = S.n > 0; if (S.n) { S.geo.attributes.position.needsUpdate = true; S.geo.attributes.color.needsUpdate = true; } }
      for (const P of POOLS) P.commit();
      try { commitFx(); } catch (e) { N.err('view3d_actors.fx', e); }
      commitGlows();
      ROOT.visible = !OPT.hidden;
      if (DEC.dirty) { DEC.tex.needsUpdate = true; DEC.dirty = false; }
      const ms = tFrame0 ? now() - tFrame0 : 0;
      ST.ms = ms; ST.msAvg += (ms - ST.msAvg) * 0.05;
      LAST = Object.assign({}, ST);
      ST.people = ST.peopleFar = ST.vehicles = ST.wheels = ST.decals = ST.animals = ST.birds = ST.markers = ST.kites = ST.culled = ST.skids = 0;
      ST.frame++; tFrame0 = 0;
    },
  });
  let LAST = Object.assign({}, ST);
  N.on('view:change', (d) => { if (d && d.mode === 'top') { for (const [el] of BARKS) { if (el.isConnected) el.style.opacity = ''; } } });

  N.view3dActors = {
    F, MODELS, OPT,
    get ready() { return READY; },
    get pools() { return POOLS; },
    lookSpec,
    models() { return Object.keys(MODELS); },
    model: (k) => (READY ? model(k) : null),
    modelKeyFor,
    setOptions(o) { Object.assign(OPT, o || {}); return OPT; },
    /** last committed frame: instance counts, draw-call-ish pool usage, JS ms of the actor pass */
    stats() {
      const out = Object.assign({}, LAST);
      out.pools = POOLS.filter((p) => p.mesh && p.mesh.count > 0).length;
      out.instances = POOLS.reduce((s, p) => s + (p.mesh ? p.mesh.count : 0), 0);
      out.msAvg = +ST.msAvg.toFixed(3); out.ms = +LAST.ms.toFixed(3);
      out.personVerts = ST.personVerts; out.decalCells = DEC.n; out.bark3d = BARKS.size;
      return out;
    },
    debug: { BARKS, EMOTES, SEA, MK, GLOW, DEC, DBG,
      /** tests: look from world (x, h, y) at (x2, h2, y2); camera(null) gives the camera back */
      camera(pos, look, fov) { DBG.cam = pos ? { pos, look, fov } : null; },
      /** tests: record the pose / wheel state of one entity each frame (debug.rec) */
      track(e) { DBG.track = e || null; DBG.rec = null; },
      get rec() { return DBG.rec; },
      /** instance counts per pool (name -> count) of the last committed frame */
      counts() { const o = {}; for (const P of POOLS) if (P.mesh && P.mesh.count) o[P.name] = P.mesh.count; o.glows = LAST.glows; return o; },
      glints() { return GL2.geo ? GL2.geo.drawRange.count : 0; },
      /** live skid-mark quads (fading over 40 s of game time) and smoke / dust puffs */
      fx() { return { skids: FXS.skN, puffs: FXS.live }; },
      feet: (r) => feetOf(r || DBG.rec),
      /** tests: the rider's ankles (mirroring the vertex shader: knee, hip, abduction, then the
       *  person's roll / yaw / scale / root) and the pedal ankle targets, in the vehicle frame */
      riderAnkles(vrec, sx) { return riderAnkles(vrec || DBG.rec, sx || 1); },
    },
  };
})();
