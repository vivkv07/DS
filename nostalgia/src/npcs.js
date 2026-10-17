/* NOSTALGIA — npcs.js (STUB)
 * Named story NPC placeholder. Replaced by the npcs agent.
 */
(() => {
  'use strict';
  const N = window.N;
  N.npcs = {
    defs: {},
    list: {},
    define(id, def) { this.defs[id] = def; },
    spawn(id, x, y, opts) { void id; void x; void y; void opts; return null; },
    get(id) { return this.list[id] || null; },
    remove(id) { delete this.list[id]; },
  };
})();
