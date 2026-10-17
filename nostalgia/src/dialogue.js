/* NOSTALGIA — dialogue.js (STUB)
 * Dialogue API placeholder: every line resolves immediately. Replaced by the dialogue agent.
 */
(() => {
  'use strict';
  const N = window.N;
  N.dialogue = {
    speakers: {},
    glossary: {},
    skip: false,
    active: false,
    say(speakerId, text, opts) { void speakerId; void text; void opts; return Promise.resolve(); },
    choice(speakerId, prompt, opts) { void speakerId; void prompt; void opts; return Promise.resolve(0); },
    play(lines) { void lines; return Promise.resolve(); },
  };
})();
