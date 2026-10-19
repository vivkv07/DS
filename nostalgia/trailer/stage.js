/* NOSTALGIA trailer — in-page stage (injected by the capture scripts, never shipped in the game).
 * window.STAGE:
 *   setup()                       register the 'trailer' 3D layer (last), hide the player
 *   summit(x, y, r)               highest scene surface near (x, y) (raycasts straight down) -> h (3D units)
 *   hero({x, y, h, angle, clip})  show Chinnu (Blender kid_chinnu) standing at (x, y) on height h, or null
 *   cam({x, y, h, tx, ty, th, fov, roll})  pin the 3D camera this frame (world x/y, 3D height h)
 *   orbit(o, t)                   camera on an orbit: {cx, cy, ch (look height), r, h, a0, a1, dur, fov, ease}
 */
(() => {
  'use strict';
  const N = window.N;
  const S = (window.STAGE = { camSpec: null, heroSpec: null, heroObj: null, chr: null, ready: false });
  let THREE = null;

  S.setup = function () {
    N.player.hidden = true;
    N.view3d.registerLayer('trailer', {
      order: 9999,
      init(T) { THREE = T; },
      update(dt, H) {
        THREE = H.THREE || window.THREE;
        updateHero(dt, H);
        try { updateCrowd(dt, H); updateGulal(dt, H); } catch (e) { console.error('stage crowd', e && e.stack || e); }
        const c = S.camSpec;
        if (!c) return;
        const cam = H.camera;
        cam.position.set(c.x, c.h, c.y);
        cam.up.set(0, 1, 0);
        cam.lookAt(c.tx, c.th, c.ty);
        if (c.roll) cam.rotateZ(c.roll);
        if (c.rollAbs) cam.rotateZ(c.rollAbs);
        if (c.fov && Math.abs(cam.fov - c.fov) > 1e-3) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
        cam.updateMatrixWorld(true);
        H.sky && 0;
      },
    });
    S.ready = true;
  };

  function updateHero(dt, H) {
    const s = S.heroSpec;
    if (!s) { if (S.heroObj) S.heroObj.visible = false; return; }
    if (!S.chr) {
      if (!N.models3d || !N.models3d.ready) return;
      S.chr = N.models3d.character('kid_chinnu', N.player.look);
      if (!S.chr) return;
      S.heroObj = S.chr.object;
      S.heroObj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      H.layer.add(S.heroObj);
    }
    S.heroObj.visible = true;
    S.heroObj.position.set(s.x, s.h, s.y);
    S.heroObj.rotation.y = -(s.angle || 0);
    const clip = s.clip || 'idle';
    if (S.chr.clip !== clip && S.chr.has(clip)) S.chr.play(clip, { fade: 0.2, loop: true });
    S.chr.setSpeed(s.speed || 0);
    S.chr.update(dt, (s.speed || 0) * dt);
  }

  S.hero = function (spec) { S.heroSpec = spec; };

  /* ---------------------------------------------------------------- dancing crowd (teenmaar) */
  // S.crowd([{x, y, a, model, look, clip, ph, dance}] | null): Blender characters; dance = bounce + sway + spin
  const CR = { list: null, chars: [], t: 0 };
  S.crowd = function (list) {
    for (const c of CR.chars) { if (c && c.chr) { c.chr.object.parent && c.chr.object.parent.remove(c.chr.object); } }
    CR.chars = []; CR.list = list; CR.t = 0;
  };
  function updateCrowd(dt, H) {
    if (!CR.list) return;
    if (!CR.chars.length) {
      for (const c of CR.list) {
        const chr = N.models3d.character(c.model, c.look || {});
        if (!chr) { CR.chars.push(null); continue; }
        chr.object.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
        H.layer.add(chr.object);
        CR.chars.push({ chr, c });
      }
    }
    CR.t += dt;
    const t = CR.t;
    for (const e of CR.chars) {
      if (!e) continue;
      const { chr, c } = e, ph = c.ph || 0, d = c.dance == null ? 1 : c.dance;
      // teenmaar: the run cycle stepped in place on the beat (150 BPM, one stride per two beats), a hop on
      // every beat, hip sway and half-turns, each dancer on their own phase
      const beat = t * (150 / 60) * Math.PI;
      const bounce = Math.abs(Math.sin(beat + ph)) * 1.1 * d;
      const turn = Math.sin(beat * 0.25 + ph * 2) * 1.2 * d + (Math.sin(beat * 0.125 + ph) > 0.7 ? Math.PI * 0.5 * d : 0);
      chr.object.position.set(c.x + Math.sin(beat * 0.5 + ph) * 0.5 * d, (c.h || 0) + bounce, c.y);
      chr.object.rotation.set(Math.sin(beat + ph) * 0.08 * d, -(c.a || 0) + turn, Math.sin(beat * 0.5 + ph) * 0.18 * d);
      const clip = chr.has(c.clip) ? c.clip : 'run';
      chr.pose(clip, (t * (150 / 60) * 0.5 + ph * 0.13) % 1);
    }
  }
  /* ---------------------------------------------------------------- gulal (coloured powder clouds) */
  const GL = { pts: null, on: false, cx: 0, cy: 0, h: 0, n: 1600, data: null, t: 0 };
  S.gulal = function (spec) { GL.on = !!spec; if (spec) { GL.cx = spec.x; GL.cy = spec.y; GL.h = spec.h || 0; GL.r = spec.r || 14; GL.t = 0; GL.data = null; } };
  function updateGulal(dt, H) {
    const T = H.THREE || window.THREE;
    if (!GL.on) { if (GL.pts) GL.pts.visible = false; return; }
    if (!GL.pts) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(GL.n * 3), 3));
      geo.setAttribute('color', new T.BufferAttribute(new Float32Array(GL.n * 3), 3));
      const mat = new T.PointsMaterial({ size: 1.5, map: new T.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.7, sizeAttenuation: true });
      GL.pts = new T.Points(geo, mat); GL.pts.frustumCulled = false; GL.pts.renderOrder = 5;
      H.layer.add(GL.pts);
    }
    GL.pts.visible = true;
    const cols = [[1, 0.2, 0.55], [1, 0.45, 0.1], [0.95, 0.15, 0.3], [0.3, 0.85, 0.35], [1, 0.85, 0.2], [0.75, 0.25, 0.85]];
    if (!GL.data) { // particles: [x, y, h, vx, vy, vh, age, life]
      GL.data = new Float32Array(GL.n * 8);
      for (let i = 0; i < GL.n; i++) spawnGulal(i, Math.random() * 3);
      const col = GL.pts.geometry.attributes.color.array;
      for (let i = 0; i < GL.n; i++) { const c = cols[i % cols.length]; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
      GL.pts.geometry.attributes.color.needsUpdate = true;
    }
    const D = GL.data, P = GL.pts.geometry.attributes.position.array;
    for (let i = 0; i < GL.n; i++) {
      const o = i * 8;
      D[o + 6] += dt;
      if (D[o + 6] > D[o + 7]) spawnGulal(i, 0);
      D[o] += D[o + 3] * dt; D[o + 1] += D[o + 4] * dt; D[o + 2] += D[o + 5] * dt;
      D[o + 3] *= 0.97; D[o + 4] *= 0.97; D[o + 5] = D[o + 5] * 0.96 + 0.05;
      P[i * 3] = D[o]; P[i * 3 + 1] = D[o + 2]; P[i * 3 + 2] = D[o + 1];
    }
    GL.pts.geometry.attributes.position.needsUpdate = true;
  }
  function spawnGulal(i, age) {
    const D = GL.data, o = i * 8, a = Math.random() * Math.PI * 2, r = Math.random() * GL.r;
    D[o] = GL.cx + Math.cos(a) * r; D[o + 1] = GL.cy + Math.sin(a) * r; D[o + 2] = GL.h + 6 + Math.random() * 4;
    const s = 1.5 + Math.random() * 4; D[o + 3] = Math.cos(a) * s; D[o + 4] = Math.sin(a) * s; D[o + 5] = 1 + Math.random() * 3;
    D[o + 6] = age; D[o + 7] = 2 + Math.random() * 2.5;
  }
  S.cam = function (c) { S.camSpec = c; };

  S.summit = function (x, y, r) {
    const H = N.view3d.H, T = H.THREE || window.THREE;
    const rc = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3(0, -1, 0);
    rc.camera = H.camera; // sprites in the scene need it
    let best = 0;
    const objs = H.scene.children.filter((c) => c !== H.layer && c.name !== 'sky' && c.name !== 'outer');
    const pts = [[0, 0]];
    for (let k = 0; k < 8 && r; k++) pts.push([Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r]);
    for (const [ox, oy] of pts) {
      o.set(x + ox, 900, y + oy); rc.set(o, d); rc.far = 1000;
      const hits = rc.intersectObjects(objs, true);
      for (const h of hits) { const col = /^COL_/.test(h.object.name || ''); if (h.object.isMesh && (col || (h.object.visible && !(h.object.material && h.object.material.transparent)))) { if (!ox && !oy) best = Math.max(best, h.point.y); else best = Math.max(best, h.point.y); break; } }
    }
    return best;
  };

  const ease = { lin: (t) => t, io: (t) => t * t * (3 - 2 * t), out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t };
  S.orbit = function (o, t) {
    const u = Math.max(0, Math.min(1, t / o.dur)), e = (ease[o.ease || 'lin'])(u);
    const a = o.a0 + (o.a1 - o.a0) * e;
    const r = o.r0 != null ? o.r0 + (o.r - o.r0) * e : o.r;
    const h = o.h0 != null ? o.h0 + (o.h - o.h0) * e : o.h;
    const ch = o.ch0 != null ? o.ch0 + (o.ch - o.ch0) * e : o.ch;
    const fov = o.fov0 != null ? o.fov0 + (o.fov - o.fov0) * e : o.fov;
    S.cam({ x: o.cx + Math.cos(a) * r, y: o.cy + Math.sin(a) * r, h, tx: o.cx + (o.lx || 0), ty: o.cy + (o.ly || 0), th: ch, fov, roll: o.roll ? o.roll * Math.sin(u * Math.PI) : 0 });
  };
})();
