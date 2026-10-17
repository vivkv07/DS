/* NOSTALGIA — missions.js (STUB)
 * Mission runner placeholder (ARCHITECTURE §11). Replaced by the missions agent.
 */
(() => {
  'use strict';
  const N = window.N;
  N.missions = {
    defs: {},
    active: null,
    done: new Set(),
    register(def) { if (def && def.id) this.defs[def.id] = def; },
    start(id) { void id; return false; },
    available() { return []; },
    complete() { return false; },
    abort() {},
  };
})();
