/* NOSTALGIA — minigames.js (STUB)
 * Minigame registry placeholder: start() resolves as an instant win. Replaced by the minigames agent.
 */
(() => {
  'use strict';
  const N = window.N;
  N.minigames = {
    defs: {},
    register(id, def) { this.defs[id] = def; },
    start(id, params) { void id; void params; return Promise.resolve({ win: true, score: 0, skipped: true }); },
  };
})();
