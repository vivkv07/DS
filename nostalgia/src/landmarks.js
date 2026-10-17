/* NOSTALGIA — landmarks.js (STUB)
 * Default drawing for named landmarks: a plain extruded box with a name plate. The
 * landmarks agent replaces this with custom pseudo-3D art (Charminar, Golconda, Buddha...).
 * API used by world.js each frame for landmarks near the view:
 *   N.landmarks.enqueue(lm, visible)  -> cast shadows (N.draw.cast*) + queue on 'structures'
 *   N.landmarks.paintGround(ctx, lm)  -> optional static ground art (chunk painter, world coords)
 *   N.landmarks.register(drawId, {enqueue, paintGround})
 */
(() => {
  'use strict';
  const N = window.N;
  const L = (N.landmarks = {
    defs: {},
    register(drawId, def) { L.defs[drawId] = def; },
    enqueue(lm, visible) {
      const def = L.defs[lm.draw];
      if (def && def.enqueue) return def.enqueue(lm, visible);
      const R = N.render, D = N.draw;
      if (R.sun.strength > 0.18) D.castBox(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, lm.h);
      if (visible) R.queue('structures', R.distKey(lm.x, lm.y), () => L.drawDefault(lm));
    },
    drawDefault(lm) {
      const D = N.draw;
      D.box(lm.x - lm.w / 2, lm.y - lm.d / 2, lm.w, lm.d, 0, lm.h, { wall: '#e8d9b5', roof: '#f3ead2', outline: '#b8a888' });
      D.pixelText(lm.x, lm.y, lm.h, (lm.name || lm.id || '').toUpperCase(), '#5a3a28');
    },
    paintGround(ctx, lm) {
      const def = L.defs[lm.draw];
      if (def && def.paintGround) def.paintGround(ctx, lm);
    },
  });
})();
