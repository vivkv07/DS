/* NOSTALGIA — wanted.js (STUB)
 * The Chappal Meter (wanted level 0..5) without pursuers. Replaced by the wanted agent.
 */
(() => {
  'use strict';
  const N = window.N;
  N.wanted = {
    level: 0,
    set(n) { this.level = Math.max(0, Math.min(5, n | 0)); N.emit('wanted', this.level); },
    add(n) { this.set(this.level + (n == null ? 1 : n)); },
    clear() { this.set(0); },
  };
  N.addSystem({ id: 'wanted', order: 50, runIn: ['play'], reset() { N.wanted.level = 0; } });
})();
