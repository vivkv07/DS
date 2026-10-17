/* NOSTALGIA — hud.js (STUB)
 * HUD API placeholder (ARCHITECTURE §10). Keeps objectiveText so N.debug.state() works.
 * Replaced by the HUD agent.
 */
(() => {
  'use strict';
  const N = window.N;
  N.hud = {
    objectiveText: null,
    objective(text) { this.objectiveText = text || null; N.emit('hud:objective', this.objectiveText); },
    toast(text, ms) { void text; void ms; },
    banner(title, sub, ms) { void title; void sub; void ms; },
    blip(id, target, opts) { void id; void target; void opts; },
    unblip(id) { void id; },
    districtBanner(name) { void name; },
    timer(label, seconds) { void label; void seconds; },
    show() {},
    hide() {},
  };
})();
