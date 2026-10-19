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
        const c = S.camSpec;
        if (!c) return;
        const cam = H.camera;
        cam.position.set(c.x, c.h, c.y);
        cam.up.set(0, 1, 0);
        cam.lookAt(c.tx, c.th, c.ty);
        if (c.roll) cam.rotateZ(c.roll);
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
  S.cam = function (c) { S.camSpec = c; };

  S.summit = function (x, y, r) {
    const H = N.view3d.H, T = H.THREE || window.THREE;
    const rc = new T.Raycaster(), o = new T.Vector3(), d = new T.Vector3(0, -1, 0);
    let best = 0;
    const objs = H.scene.children.filter((c) => c !== H.layer && c.name !== 'sky' && c.name !== 'outer');
    const pts = [[0, 0]];
    for (let k = 0; k < 8 && r; k++) pts.push([Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r]);
    for (const [ox, oy] of pts) {
      o.set(x + ox, 900, y + oy); rc.set(o, d); rc.far = 1000;
      const hits = rc.intersectObjects(objs, true);
      for (const h of hits) { if (h.object.isMesh && h.object.visible && !(h.object.material && h.object.material.transparent)) { if (!ox && !oy) best = Math.max(best, h.point.y); else best = Math.max(best, h.point.y); break; } }
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
