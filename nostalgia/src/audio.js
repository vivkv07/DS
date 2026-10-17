/* NOSTALGIA — audio.js (STUB)
 * Safe no-op audio API so the game runs end to end. Replaced by the audio agent with
 * WebAudio SFX, the music sequencer and the radio. Must never throw without an AudioContext.
 */
(() => {
  'use strict';
  const N = window.N;
  N.audio = {
    ready: false,
    muted: false,
    volume: { master: 0.8, music: 0.6, sfx: 0.9 },
    unlock() { return false; },           // call from the START gesture
    sfx(name, opts) { void name; void opts; },
    play(name, opts) { void name; void opts; },
    music(track) { void track; },
    stopMusic() {},
    engine(vehicle) { void vehicle; },
    setVolume(kind, v) { if (kind in this.volume) this.volume[kind] = v; },
    radio: { on: false, station: 0, toggle() { this.on = !this.on; }, next() {} },
  };
})();
