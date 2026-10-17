/* NOSTALGIA — audio.js  (owner: audio engineer)
 * Everything you hear, synthesised live with WebAudio (no samples, no files):
 *   - ~96 one-shot SFX (cycle bell, Chetak putt-putt, auto "pom pom", havaldar whistle, STD ring,
 *     pressure cooker, pindi girni thump, dial-up modem, cassette rewind ...) with distance
 *     attenuation + stereo pan relative to the player,
 *   - continuous engine voices per vehicle type (player + the 2 nearest traffic vehicles),
 *   - ambient beds per district style cross-faded by N.world.districtAt + data-driven place
 *     emitters (Koti bus stand horns, Gokul Chat sizzle, temple bells, stations, girnis, ...),
 *   - an original step-sequencer score (sitar/santoor/tanpura via Karplus-Strong, bansuri,
 *     shehnai, harmonium, strings, brass band, tabla/dholak/dappu/marfa kits, 90s synths),
 *   - a 3-station vehicle radio (fictional stations, songs, DJs) and the Walkman / 2-in-1.
 * Contract: ARCHITECTURE.md §2/§3/§5 (system order 70) and §17 (this module's API, mirrored below).
 *
 * PUBLIC API — N.audio
 *   unlock()                         Create/resume the AudioContext. Call from a user gesture (title START).
 *                                    Also auto-called on the first pointer/key gesture. Never throws.
 *   available, ready (getters)       WebAudio exists / context created and running.
 *   ctx                              the live AudioContext (or null).
 *   setVolume(bus, v) / getVolume(bus)   bus: 'master'|'music'|'sfx'|'radio'|'ambient', v 0..1 (persisted).
 *   mute(bool) / toggleMute() / muted    persisted in localStorage 'nostalgia.audio.v1' (try/catch).
 *   settings                         live settings object {master, music, sfx, radio, ambient, muted}.
 *   duck(on, amount=0.32)            manual music duck (dialogue ducks automatically).
 *   sfx(name, {x, y, vol, pitch, pan, surface, variant, ...}) -> true|false
 *                                    one-shot; x/y = world position (omit for UI/non-positional).
 *   SFX_NAMES                        array of every SFX name.
 *   horn(vehicle|type, {x, y})       plays the right horn for a vehicle type.
 *   engine(vehicle|null)             force the player-engine target (null = follow N.player.vehicle).
 *   music.play(id, {fade, lock}) / music.stop(fade) / music.lock(id|null) / music.mood(id|null)
 *   music.current, music.TRACKS (ids), music.title(id)
 *                                    ids: title, day, night, chase, oldcity, tension, victory, ending,
 *                                         flashback, festival, numaish, kites (+ radio songs).
 *   music.ended                      true once a non-looping locked track (e.g. 'ending') finished.
 *   music.mood(id|null) / music.intro(sec|false) / music.sections(id) / music.position()
 *   music(id) / play(name, o) / stopMusic() / volume   aliases kept from the engine stub
 *   tape(amount 0..1)                cassette wow/flutter + muffle on the music bus (flashbacks);
 *                                    also follows N.render.fx.vhs automatically.
 *   rec(sfxName) / tapeMontage([sfxNames], o) -> Promise / tapeStop(sec) -> Promise
 *                                    "● REC" a city sound, play the cassette back, "■ STOP" the score.
 *   beacon(target|placeId|null, {sound, max})   hot/cold proximity beeping for hidden things.
 *   radio.next() / radio.set(i|-1) / radio.off() / radio.on / radio.station / radio.STATIONS
 *   walkman.play(songId?) / walkman.stop() / walkman.next() / walkman.unlock(songId) / walkman.library
 *   SONGS                            {id: {title, artist, station}} every song the Walkman can play.
 *   ambient.set(bedId|null)          force an ambient bed (null = automatic). ambient.BEDS ids.
 *   renderOffline(name|fn, seconds, opts) -> Promise<{peak, rms, buffer}>   (tests/tools)
 *   renderTrackOffline(trackId, seconds) -> Promise<{peak, rms, buffer}>
 *   stats() -> {voices, strips, seqs, ksBuffers, ...}
 *
 * EVENTS LISTENED TO (all optional; every handler is defensive):
 *   horn, vehicle:horn · bump, collision, vehicle:bump, player:bump · pickup, collectible,
 *   collectible:found, item:pickup · money · mission:start · mission:complete|pass|passed ·
 *   mission:fail|failed · objective, hud:objective · wanted, wanted:change · busted, wasted,
 *   player:busted, player:wasted, player:exhausted · dialogue:open|start, dialogue:close|end, dialogue:char|type|blip ·
 *   player:enterVehicle, player:exitVehicle, vehicle:enter, vehicle:exit · footstep, player:step ·
 *   kite:cut · radio:next · flashback, cutscene:vhs · shop:buy, purchase · door · splash · save ·
 *   game:new, game:quit · sfx ({name, x, y, ...} generic) · music ({id} or {mood}).
 * POLLED (so audio works even before other modules emit events): N.player(.vehicle), N.state.mode,
 *   N.wanted.level, N.world.districtAt/isWater, N.clock, N.render.fx.vhs, N.input (horn until a
 *   horn event is seen; RADIO button with a double-press guard), N.places (emitters), N.flags (festivals).
 * EMITS: 'audio:unlocked', 'audio:settings', 'radio:station' {station, name}, 'music:ended' {id}.
 * HOOKS INTO OTHER MODULES: none patched. Reads only (N.player, N.vehicles.TYPES[t].radio/maxSpeed,
 *   N.entities.query, N.world, N.places, N.flags, N.clock, N.wanted, N.missions.active.music,
 *   N.dialogue.speakers[id].pitch) and calls N.hud.toast for radio/Walkman text when present.
 * STORY LAYER (systems §12, §15 row 4; story-core agent): no bells at Birla Mandir (it has none) — its emitter
 *   is wind, a distant city hum and soft steps on marble; NEW SFX freewheel, puncture, pothole, chappal_whoosh,
 *   peel_slip, stomach_growl, weigh_machine, jukebox, goat_bleat, dappu (a teenmaar roll; also the Bonalu
 *   festival emitter), fountain, giant_wheel; 'hitec' (90s-synth) and 'cantonment' (clarinet + snare)
 *   re-voicings of `day` chosen by the music director by district style; walkman.setLibrary(list) (the
 *   storycore walkman owns the found-order song list); the walkman has its own duck (40% under dialogue,
 *   70% for 3 s after 'wanted:seen'); tapeMontage(names, {onItem(i, name), minStep, clicks}); important sounds
 *   emit 'caption' {text, x, y} for the HUD's sound captions. Never any azaan, chant, hymn or bhajan.
 * A2/A3 (vehicles agent): engine profile `scooty` (thin high 2-stroke automatic buzz, above the Chetak);
 *   engProfile(type) follows N.vehicles.TYPES[type].sound (story types inherit their base's voice) and
 *   pedal types are cycles; bell variants by TYPES[type].bell: 'hero' (big chrome double-dome TRRING),
 *   'hercules' (small bright ding-ding), default 'plain'; the Scooty's horn is a higher "peep peep";
 *   sfx('pothole', {vol (speed), variant: 'wet'}) = DHADAK thud + spring rattle (+ a muddy splash).
 * CPU: long-lived buses, pooled channel strips for one-shots (voice cap + per-sound cooldowns),
 *   one shared reverb, noise/KS buffers cached and shared, lookahead scheduler (setInterval 30 ms,
 *   0.18 s ahead) + per-frame top-up, context suspended while the tab is hidden.
 */
(() => {
  'use strict';
  const N = window.N;
  const U = N.util;
  const clamp = U.clamp;

  const AC = window.AudioContext || window.webkitAudioContext || null;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext || null;
  const KEY = 'nostalgia.audio.v1';
  const LOOKAHEAD = 0.18;
  const TICK_MS = 30;
  const KS_RATE = 24000;
  const MAX_STRIPS = 22;
  const TAU = Math.PI * 2;
  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (a) => a[(rnd() * a.length) | 0];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const A = {};
  N.audio = A;

  /* ============================================================ settings */
  const S = { master: 0.85, music: 0.6, sfx: 0.85, radio: 0.75, ambient: 0.65, muted: false };
  (function loadSettings() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      for (const k in S) if (o && typeof o[k] === typeof S[k]) S[k] = typeof S[k] === 'number' ? clamp(o[k], 0, 1) : o[k];
    } catch (e) { /* storage unavailable: defaults */ }
  })();
  function saveSettings() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
    try { N.emit('audio:settings', Object.assign({}, S)); } catch (e) { /* ignore */ }
  }

  /* ============================================================ state */
  let ctx = null;          // live AudioContext
  let G = null;            // live graph
  let unlocked = false;
  let timer = 0;
  let hidden = false;

  /* ============================================================ shared resources */
  // Noise + IR buffers cached per sample rate; PeriodicWaves per context; KS buffers global
  // (AudioBuffers are context-independent).
  const NOISE = new Map();   // sr -> {white, pink, brown}
  const IRS = new Map();     // sr -> AudioBuffer
  const WAVECACHE = new WeakMap();
  const CURVES = new Map();

  function noiseSet(ac) {
    const sr = ac.sampleRate;
    let n = NOISE.get(sr);
    if (n) return n;
    const len = Math.floor(sr * 2.5);
    const mk = (kind) => {
      const b = ac.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
        for (let i = 0; i < len; i++) {
          const w = rnd() * 2 - 1;
          if (kind === 'white') d[i] = w * 0.9;
          else if (kind === 'pink') {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
            b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
            b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          } else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.2; }
        }
        // crossfade the loop seam
        const fade = Math.min(2048, len >> 4);
        for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = d[i] * k + d[len - fade + i] * (1 - k); }
      }
      return b;
    };
    n = { white: mk('white'), pink: mk('pink'), brown: mk('brown') };
    NOISE.set(sr, n);
    return n;
  }
  const noiseBuf = (ac, kind) => noiseSet(ac)[kind || 'white'];

  function makeIR(ac) {
    const sr = ac.sampleRate;
    let b = IRS.get(sr);
    if (b) return b;
    const dur = 1.7, len = Math.floor(sr * dur);
    b = ac.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const damp = 0.35 + 0.6 * Math.min(1, t / dur); // darker tail
        lp += (rnd() * 2 - 1 - lp) * (1 - damp);
        d[i] = lp * Math.exp(-t * 3.6) * (t < 0.008 ? t / 0.008 : 1);
      }
      // a few early reflections (courtyard / galli walls)
      const refl = ch ? [0.013, 0.029, 0.047, 0.071] : [0.017, 0.023, 0.053, 0.083];
      refl.forEach((rt, k) => { const i = Math.floor(rt * sr); if (i < len) d[i] += (0.5 - k * 0.09) * (ch ? 1 : -1); });
    }
    IRS.set(sr, b);
    return b;
  }

  // PeriodicWave tables: harmonic amplitudes (sine series)
  const WAVES = {
    flute: [1, 0.2, 0.07, 0.025, 0.01],
    reed: [1, 0.92, 0.85, 0.72, 0.66, 0.52, 0.44, 0.38, 0.3, 0.24, 0.18, 0.14, 0.1, 0.08, 0.06],
    harmonium: [1, 0.62, 0.55, 0.42, 0.48, 0.3, 0.28, 0.22, 0.2, 0.14, 0.12, 0.09, 0.08, 0.06, 0.05, 0.04],
    clarinet: [1, 0.04, 0.62, 0.03, 0.42, 0.03, 0.28, 0.02, 0.17, 0.02, 0.1, 0.01, 0.06],
    brass: [1, 0.8, 0.66, 0.55, 0.46, 0.38, 0.31, 0.25, 0.2, 0.16, 0.13, 0.1, 0.08, 0.06],
    organ: [1, 0.5, 0.0, 0.25, 0, 0.12, 0, 0.06],
    hollow: [1, 0, 0.3, 0, 0.12, 0, 0.05],
  };
  function wave(ac, name) {
    let c = WAVECACHE.get(ac);
    if (!c) { c = {}; WAVECACHE.set(ac, c); }
    if (c[name]) return c[name];
    const h = WAVES[name];
    const real = new Float32Array(h.length + 1), imag = new Float32Array(h.length + 1);
    for (let i = 0; i < h.length; i++) imag[i + 1] = h[i];
    return (c[name] = ac.createPeriodicWave(real, imag));
  }
  function curve(k) {
    let c = CURVES.get(k);
    if (c) return c;
    c = new Float32Array(1024);
    const n = Math.tanh(k);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(k * x) / n; }
    CURVES.set(k, c);
    return c;
  }
  // pulse curve: sawtooth -> narrow positive pulse once per cycle (engine firing)
  function pulseCurve(width) {
    const key = 'p' + width;
    let c = CURVES.get(key);
    if (c) return c;
    c = new Float32Array(512);
    const th = 1 - 2 * width;
    for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; c[i] = x > th ? Math.sin(((x - th) / (1 - th)) * Math.PI) : 0; }
    CURVES.set(key, c);
    return c;
  }

  /* ============================================================ primitives (context-agnostic) */
  // k-rate automation for pitch/filter params: Chrome otherwise recomputes biquad coefficients and
  // oscillator phase increments per sample whenever those params are automated (measured ~3x cost).
  function kr(param) { try { if (param && 'automationRate' in param) param.automationRate = 'k-rate'; } catch (e) { /* not allowed: keep a-rate */ } return param; }
  function osc0(ac, type) { const o = ac.createOscillator(); if (type) o.type = type; kr(o.frequency); kr(o.detune); return o; }
  function gain(ac, v, dest) { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function filt(ac, type, f, q, dest) {
    const b = ac.createBiquadFilter(); b.type = type; kr(b.frequency); kr(b.Q); kr(b.gain); b.frequency.value = f;
    if (q != null) b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  function shaper(ac, k, dest) { const w = ac.createWaveShaper(); w.curve = curve(k); if (dest) w.connect(dest); return w; }
  function panner(ac, dest) {
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); if (dest) p.connect(dest); return p; }
    const g = gain(ac, 1, dest); g.pan = { value: 0, setTargetAtTime() {}, setValueAtTime() {} }; return g;
  }
  // set an AudioParam smoothly
  function sp(param, v, t, tc) { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc || 0.05); }

  // Oscillator with envelope. o: {type|wave, f, f2, glide, a, h, r, v, detune, vib:[rate, depth]}
  function tone(ac, dest, t, o) {
    const os = osc0(ac);
    if (o.wave) os.setPeriodicWave(typeof o.wave === 'string' ? wave(ac, o.wave) : o.wave);
    else os.type = o.type || 'sine';
    const a = o.a || 0.002, h = o.h || 0, r = o.r || 0.1, v = o.v == null ? 0.4 : o.v;
    os.frequency.setValueAtTime(o.f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(Math.max(5, o.f2), t + (o.glide || a + h + r * 0.5));
    if (o.detune) os.detune.value = o.detune;
    const end = t + a + h + r * 1.15 + 0.03;
    let lfo = null;
    if (o.vib) {
      lfo = osc0(ac); lfo.frequency.value = o.vib[0];
      const lg = gain(ac, o.vib[1], os.frequency); lfo.connect(lg);
      lfo.start(t); lfo.stop(end);
    }
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (h) g.gain.setValueAtTime(v, t + a + h);
    g.gain.setTargetAtTime(0, t + a + h, r / 5);
    os.connect(g); g.connect(dest);
    os.start(t); os.stop(end);
    return end;
  }
  // Filtered noise burst. o: {kind, ft, f, q, f2, sweep, a, h, r, v}
  function burst(ac, dest, t, o) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf(ac, o.kind || 'white'); s.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = o.ft || 'bandpass'; kr(fl.frequency); kr(fl.Q);
    fl.frequency.setValueAtTime(o.f || 1000, t);
    if (o.q != null) fl.Q.value = o.q;
    const a = o.a || 0.002, h = o.h || 0, r = o.r || 0.08, v = o.v == null ? 0.4 : o.v;
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.sweep || a + h + r));
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (h) g.gain.setValueAtTime(v, t + a + h);
    g.gain.setTargetAtTime(0, t + a + h, r / 5);
    s.connect(fl); fl.connect(g); g.connect(dest);
    const end = t + a + h + r * 1.15 + 0.03;
    s.start(t, rnd() * 1.5); s.stop(end);
    return end;
  }
  // inharmonic struck partials. list: [[ratio, amp, decayMul]]
  function strike(ac, dest, t, f, list, v, dec) {
    let end = t;
    for (const p of list) end = Math.max(end, tone(ac, dest, t, { f: f * p[0], a: 0.0015, r: dec * (p[2] || 1), v: v * p[1] }));
    return end;
  }
  const BELL = [[1, 0.5, 1], [2.41, 0.3, 0.7], [3.87, 0.18, 0.5], [5.3, 0.1, 0.35]];
  const BIGBELL = [[0.5, 0.35, 1.3], [1, 0.5, 1], [1.19, 0.3, 0.8], [1.5, 0.22, 0.7], [2, 0.25, 0.6], [2.61, 0.12, 0.45], [3.3, 0.08, 0.35]];
  const METAL = [[1, 0.5, 1], [1.73, 0.35, 0.7], [2.62, 0.25, 0.5], [3.9, 0.12, 0.35]];
  const CERAMIC = [[1, 0.5, 1], [1.68, 0.3, 0.7], [2.71, 0.2, 0.5]];

  // A rapid series of amplitude "hits" on one gain param (trills, putts, wing flaps...)
  function pulses(param, times, peak, tc) {
    for (const p of times) {
      const tt = p[0], a = p[1] == null ? 1 : p[1];
      param.setValueAtTime(peak * a, tt);
      param.setTargetAtTime(0, tt + 0.001, tc);
    }
  }
  // Looping noise source -> filter -> gain(automatable); returns {src, f, g, end(t)}
  function noiseVoice(ac, dest, t, dur, kind, ft, f, q) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf(ac, kind); src.loop = true;
    const fl = filt(ac, ft, f, q);
    const g = gain(ac, 0);
    src.connect(fl); fl.connect(g); g.connect(dest);
    src.start(t, rnd() * 1.5); src.stop(t + dur);
    return { src, f: fl, g };
  }

  // Formant "voices" for crowds and vendor calls (wordless, vowel-shaped).
  const VOW = { a: [800, 1200, 2500], aa: [760, 1150, 2450], o: [480, 820, 2400], u: [330, 760, 2300],
    e: [520, 1800, 2500], i: [300, 2250, 2950], ay: [640, 1700, 2500], ho: [560, 920, 2400] };
  // o: {n voices, f0, spread (semis), sy: [[t, dur, vowel, semis, vol]], v, jitter}
  function crowd(ac, dest, t, o) {
    const n = o.n || 5, sy = o.sy, f0 = o.f0 || 200;
    const last = sy[sy.length - 1];
    const end = t + last[0] + last[1] + 0.35;
    const bus = gain(ac, 1);
    const fs = [0, 1, 2].map((k) => filt(ac, 'bandpass', VOW[sy[0][2]][k], k ? 7 : 4));
    const fg = [1, 0.6, 0.22].map((v) => gain(ac, v, dest));
    fs.forEach((f, k) => { bus.connect(f); f.connect(fg[k]); });
    // formant automation per syllable
    for (const s of sy) {
      const vw = VOW[s[2]];
      fs.forEach((f, k) => f.frequency.setTargetAtTime(vw[k], t + s[0], 0.03));
    }
    for (let i = 0; i < n; i++) {
      const os = osc0(ac); os.type = 'sawtooth';
      const g = gain(ac, 0, bus);
      const det = (rnd() - 0.5) * (o.spread || 3);
      const jit = rnd() * (o.jitter == null ? 0.05 : o.jitter);
      const vib = osc0(ac); vib.frequency.value = rr(4.5, 6.5);
      const vg = gain(ac, f0 * 0.012, os.frequency); vib.connect(vg);
      for (const s of sy) {
        const st = t + s[0] + jit, f = f0 * Math.pow(2, (s[3] + det) / 12);
        os.frequency.setTargetAtTime(f, st, 0.02);
        if (s[5]) os.frequency.setTargetAtTime(f * Math.pow(2, s[5] / 12), st + s[1] * 0.4, s[1] * 0.3);
        g.gain.setTargetAtTime((o.v || 0.2) * (s[4] == null ? 1 : s[4]) / Math.sqrt(n), st, 0.025);
        g.gain.setTargetAtTime(0, st + s[1], 0.05);
      }
      os.frequency.setValueAtTime(f0 * Math.pow(2, (sy[0][3] + det) / 12), t);
      os.connect(g); os.start(t); os.stop(end); vib.start(t); vib.stop(end);
    }
    return end;
  }

  /* ============================================================ SFX library */
  // Each: (ac, out, t, o) => end time. o: {pitch, vol, variant, surface, run, dur, ...}
  const SFX = {};
  const P = (o) => (o && o.pitch) || 1;

  // ---- vehicles: horns, bells, starts
  SFX.bell = (ac, out, t, o) => { // cycle bell: "tring tring" — a fast clapper trill on a domed bell
    if (o.variant === 'hero') return heroBell(ac, out, t, o);
    if (o.variant === 'hercules') return herculesBell(ac, out, t, o);
    const f = 2350 * P(o) * rr(0.98, 1.02);
    const g = gain(ac, 0, out);
    const hits = [];
    const rings = o.rings || 2;
    for (let r = 0; r < rings; r++) for (let k = 0; k < 7; k++) hits.push([t + r * 0.36 + k * 0.034, (k ? 0.6 : 1) * (1 - k * 0.07)]);
    pulses(g.gain, hits, 0.55, 0.018);
    const end = t + rings * 0.36 + 0.7;
    g.gain.setTargetAtTime(0, end - 0.45, 0.12);
    for (const p of BELL) { const os = osc0(ac); os.frequency.value = f * p[0]; const pg = gain(ac, p[1], g); os.connect(pg); os.start(t); os.stop(end); }
    return end;
  };
  // A3: the Hero roadster's big chrome double-dome bell: a lower, fuller "TRRING-TRRING" whose two domes
  // beat against each other, rung with a slower lever clapper and a long shimmer
  function heroBell(ac, out, t, o) {
    const f = 1820 * P(o) * rr(0.985, 1.015);
    const g = gain(ac, 0, out);
    const rings = o.rings || 2, hits = [];
    for (let r = 0; r < rings; r++) for (let k = 0; k < 6; k++) hits.push([t + r * 0.42 + k * 0.045, (k ? 0.7 : 1) * (1 - k * 0.06)]);
    pulses(g.gain, hits, 0.5, 0.03);
    const end = t + rings * 0.42 + 1.0;
    g.gain.setTargetAtTime(0, end - 0.6, 0.18);
    for (const det of [1, 1.012]) for (const p of BELL) { const os = osc0(ac); os.frequency.value = f * det * p[0]; const pg = gain(ac, p[1] * 0.62, g); os.connect(pg); os.start(t); os.stop(end); }
    return end;
  }
  // A3: the sporty Hercules' small thumb-flick bell: two bright, clean "ding-ding"s
  function herculesBell(ac, out, t, o) {
    const f = 3150 * P(o) * rr(0.98, 1.02);
    const rings = o.rings || 2;
    let e = t;
    for (let r = 0; r < rings; r++) e = strike(ac, out, t + r * 0.17, f, [[1, 0.5, 1], [2.76, 0.28, 0.6], [5.4, 0.12, 0.4], [8.9, 0.05, 0.25]], 0.34, 0.38);
    return e;
  }
  SFX.scooter_horn = (ac, out, t, o) => { // Chetak/Luna/RX100: weedy buzzy "meep meep"
    const f = 440 * P(o);
    let end = t;
    const n = o.dur ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.2, d = o.dur || 0.12;
      const bp = filt(ac, 'bandpass', 1100, 1.4, out);
      end = tone(ac, bp, tt, { type: 'square', f, a: 0.006, h: d, r: 0.05, v: 0.5 });
    }
    return end;
  };
  SFX.auto_horn = (ac, out, t, o) => { // rubber-bulb horn: nasal "pom pom" with a squeeze scoop
    const f = 330 * P(o);
    const lp = filt(ac, 'lowpass', 3200, 0.7, out);
    const pk = filt(ac, 'peaking', 820, 2, lp); pk.gain.value = 9;
    const sh = shaper(ac, 2.2, pk);
    let end = t;
    const n = o.dur ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.27, d = o.dur || 0.14;
      end = tone(ac, sh, tt, { type: 'sawtooth', f: f * 0.9, f2: f, glide: 0.06, a: 0.035, h: d, r: 0.06, v: 0.35 });
      tone(ac, sh, tt, { type: 'square', f: f * 1.5 * 0.9, f2: f * 1.5, glide: 0.06, a: 0.035, h: d, r: 0.06, v: 0.12 });
      burst(ac, out, tt, { f: 1400, q: 1, a: 0.03, h: d * 0.6, r: 0.05, v: 0.05 });
    }
    return end;
  };
  SFX.car_horn = (ac, out, t, o) => { // Ambassador dual-tone electric horn
    const d = o.dur || 0.42, p = P(o);
    const bp = filt(ac, 'bandpass', 1600, 0.9, out);
    const sh = shaper(ac, 3, bp);
    tone(ac, sh, t, { type: 'square', f: 405 * p, a: 0.008, h: d, r: 0.04, v: 0.3 });
    return tone(ac, sh, t, { type: 'square', f: 507 * p, a: 0.008, h: d, r: 0.04, v: 0.3 });
  };
  SFX.bus_horn = (ac, out, t, o) => { // APSRTC air horn: low, brassy blat
    const d = o.dur || 0.75, p = P(o);
    const lp = filt(ac, 'lowpass', 500, 2, out);
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.06); lp.frequency.setTargetAtTime(1800, t + 0.1, 0.2);
    const sh = shaper(ac, 2, lp);
    tone(ac, sh, t, { type: 'sawtooth', f: 196 * p, f2: 190 * p, glide: d, a: 0.02, h: d, r: 0.12, v: 0.3 });
    tone(ac, sh, t, { type: 'sawtooth', f: 247 * p, f2: 240 * p, glide: d, a: 0.02, h: d, r: 0.12, v: 0.25 });
    return tone(ac, sh, t, { type: 'sawtooth', f: 294 * p, f2: 286 * p, glide: d, a: 0.02, h: d, r: 0.12, v: 0.18 });
  };
  const LORRY_TUNES = [[0, 4, 7, 9, 7, 4, 0], [0, 3, 5, 7, 5, 3, 7, 12], [7, 5, 4, 2, 4, 0], [0, 0, 7, 7, 9, 9, 7]];
  SFX.lorry_horn = (ac, out, t, o) => { // musical multi-tone "Horn OK Please" lorry horn
    const tune = o.variant != null ? LORRY_TUNES[o.variant % LORRY_TUNES.length] : pick(LORRY_TUNES);
    const base = 392 * P(o), step = 0.13;
    const lp = filt(ac, 'lowpass', 2600, 1.2, out);
    const sh = shaper(ac, 2.5, lp);
    let end = t;
    tune.forEach((s, i) => {
      const last = i === tune.length - 1;
      end = tone(ac, sh, t + i * step, { type: 'sawtooth', f: base * Math.pow(2, s / 12), a: 0.01, h: last ? 0.3 : step * 0.8, r: 0.05, v: 0.22 });
      tone(ac, sh, t + i * step, { type: 'square', f: base * Math.pow(2, s / 12) * 1.005, a: 0.01, h: last ? 0.3 : step * 0.8, r: 0.05, v: 0.1 });
    });
    return end;
  };
  SFX.chetak_start = (ac, out, t, o) => { // kick-start clunk + ratchet, engine catches: phut... phut-phut-put-put-putputput
    const p = P(o);
    burst(ac, out, t, { f: 1300, q: 1.5, r: 0.05, v: 0.35 });
    tone(ac, out, t, { f: 170, f2: 90, a: 0.002, r: 0.12, v: 0.4 });
    for (let k = 0; k < 6; k++) burst(ac, out, t + 0.06 + k * 0.035, { f: 2600, q: 3, r: 0.012, v: 0.15 });
    const st = t + 0.38, end = st + (o.dur || 1.5);
    const nv = noiseVoice(ac, out, st, end - st + 0.1, 'brown', 'bandpass', 420 * p, 1.1);
    const body = osc0(ac); body.type = 'square'; body.frequency.value = 52 * p;
    const blp = filt(ac, 'lowpass', 260, 1); const bg = gain(ac, 0); body.connect(blp); blp.connect(bg); bg.connect(out);
    body.start(st); body.stop(end + 0.1);
    const times = []; let tt = st;
    const gaps = [0.16, 0.13, 0.11, 0.09];
    for (const gp of gaps) { times.push([tt, 1]); tt += gp; }
    while (tt < end) { times.push([tt, rr(0.6, 0.85)]); tt += rr(0.062, 0.072) / p; }
    pulses(nv.g.gain, times, 1.5, 0.014);
    pulses(bg.gain, times, 0.35, 0.02);
    return end + 0.1;
  };
  SFX.auto_start = (ac, out, t, o) => { // auto driver yanks the lever: ratchet + rough two-stroke catch
    for (let k = 0; k < 9; k++) burst(ac, out, t + k * 0.03, { f: 1800, q: 2, r: 0.015, v: 0.16 });
    return SFX.chetak_start(ac, out, t + 0.05, { pitch: 0.82 * P(o), dur: o.dur || 1.2 });
  };
  SFX.car_start = (ac, out, t, o) => { // starter motor "rrr-rrr" then vroom
    const lp = filt(ac, 'lowpass', 700, 1, out);
    const st = osc0(ac); st.type = 'sawtooth'; st.frequency.value = 38;
    const sg = gain(ac, 0, lp); st.connect(sg);
    const am = []; for (let k = 0; k < 6; k++) am.push([t + k * 0.11, 1]);
    pulses(sg.gain, am, 0.35, 0.05);
    st.start(t); st.stop(t + 0.75);
    const v = t + 0.7;
    tone(ac, lp, v, { type: 'sawtooth', f: 32, f2: 75, glide: 0.25, a: 0.03, h: 0.25, r: 0.35, v: 0.4 });
    return tone(ac, lp, v, { type: 'square', f: 48, f2: 110, glide: 0.25, a: 0.03, h: 0.2, r: 0.3, v: 0.15 });
  };
  SFX.diesel_start = (ac, out, t, o) => {
    const lp = filt(ac, 'lowpass', 500, 1, out);
    const end = t + 1.3;
    const nv = noiseVoice(ac, lp, t, 1.4, 'brown', 'lowpass', 300, 1);
    const times = []; for (let tt = t; tt < end; tt += 0.09 - (tt - t) * 0.04) times.push([tt, 1]);
    pulses(nv.g.gain, times, 2.2, 0.03);
    tone(ac, lp, t + 0.5, { type: 'sawtooth', f: 28, f2: 40, glide: 0.4, a: 0.1, h: 0.4, r: 0.3, v: 0.35 });
    SFX.air_brake(ac, out, end - 0.1, { vol: 0.6 });
    return end + 0.6;
  };
  SFX.air_brake = (ac, out, t, o) => burst(ac, out, t, { ft: 'highpass', f: 2500, q: 0.5, a: 0.01, h: 0.12, r: 0.45, v: 0.25 * ((o && o.vol) || 1) });
  SFX.skid = (ac, out, t, o) => {
    const d = o.dur || 0.55;
    const nv = noiseVoice(ac, out, t, d + 0.2, 'white', 'bandpass', 1500, 9);
    nv.g.gain.setValueAtTime(0, t); nv.g.gain.linearRampToValueAtTime(0.9, t + 0.03); nv.g.gain.setTargetAtTime(0, t + d, 0.05);
    nv.f.frequency.setValueAtTime(1650 * P(o), t); nv.f.frequency.linearRampToValueAtTime(1250 * P(o), t + d);
    return tone(ac, out, t, { type: 'sawtooth', f: 980 * P(o), f2: 820 * P(o), glide: d, a: 0.03, h: d - 0.05, r: 0.06, v: 0.03 });
  };
  SFX.bump = (ac, out, t, o) => {
    const v = clamp((o && o.vol) || 1, 0.1, 1.5);
    tone(ac, out, t, { f: 95 * P(o), f2: 42, glide: 0.16, a: 0.002, r: 0.2, v: 0.7 * v });
    return burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 500, r: 0.1, v: 0.6 * v });
  };
  SFX.crash = (ac, out, t, o) => { // comic "dhaang" — metal panel + rattle, no glass
    SFX.bump(ac, out, t, o);
    strike(ac, out, t + 0.005, 330 * P(o), METAL, 0.3, 0.45);
    for (let k = 0; k < 4; k++) burst(ac, out, t + 0.05 + k * rr(0.03, 0.06), { f: rr(1800, 3500), q: 4, r: 0.04, v: 0.12 });
    return t + 0.6;
  };
  SFX.door = (ac, out, t, o) => { // car/auto door: latch click + thunk
    burst(ac, out, t, { ft: 'highpass', f: 2500, r: 0.02, v: 0.25 });
    tone(ac, out, t + 0.04, { f: 110 * P(o), f2: 60, a: 0.002, r: 0.16, v: 0.55 });
    return burst(ac, out, t + 0.04, { kind: 'brown', ft: 'lowpass', f: 600, r: 0.12, v: 0.5 });
  };
  SFX.door_creak = (ac, out, t, o) => { // old wooden door / colony gate
    const d = o.dur || 0.8;
    const bp = filt(ac, 'bandpass', 900, 3, out);
    const os = osc0(ac); os.type = 'sawtooth';
    os.frequency.setValueAtTime(140 * P(o), t);
    for (let k = 1; k < 8; k++) os.frequency.linearRampToValueAtTime(rr(110, 210) * P(o), t + (d * k) / 8);
    const g = gain(ac, 0, bp);
    const hits = []; for (let tt = t; tt < t + d; tt += rr(0.012, 0.03)) hits.push([tt, rr(0.4, 1)]);
    pulses(g.gain, hits, 0.5, 0.008);
    os.connect(g); os.start(t); os.stop(t + d + 0.1);
    burst(ac, out, t + d, { kind: 'brown', ft: 'lowpass', f: 400, r: 0.1, v: 0.35 });
    return t + d + 0.2;
  };

  // ---- people, police, money
  SFX.whistle = (ac, out, t, o) => { // havaldar pea whistle: "pheeeeet — pheet!"
    const p = P(o);
    const blasts = o.short ? [[0, 0.2]] : [[0, 0.55], [0.72, 0.16]];
    let end = t;
    for (const b of blasts) {
      const tt = t + b[0], d = b[1];
      const os = osc0(ac); os.frequency.value = 2850 * p;
      const pea = osc0(ac); pea.type = 'square'; pea.frequency.value = rr(31, 38);
      const pd = gain(ac, 110 * p, os.frequency); pea.connect(pd);
      const g = gain(ac, 0, out);
      const am = gain(ac, 0.12, g.gain); pea.connect(am);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.28, tt + 0.02); g.gain.setValueAtTime(0.28, tt + d); g.gain.linearRampToValueAtTime(0, tt + d + 0.03);
      os.connect(g); os.start(tt); pea.start(tt); os.stop(tt + d + 0.05); pea.stop(tt + d + 0.05);
      burst(ac, out, tt, { f: 2900 * p, q: 5, a: 0.01, h: d, r: 0.03, v: 0.05 });
      end = tt + d + 0.06;
    }
    return end;
  };
  SFX.finger_whistle = (ac, out, t, o) => // kid's two-finger whistle (horn on foot)
    tone(ac, out, t, { f: 1700 * P(o), f2: 2500 * P(o), glide: 0.12, a: 0.02, h: 0.28, r: 0.08, v: 0.22, vib: [7, 30] });
  SFX.gurkha = (ac, out, t, o) => { // night watchman: whistle trill + lathi taps on the road
    SFX.whistle(ac, out, t, { pitch: 0.9, short: true });
    for (let k = 0; k < 3; k++) { tone(ac, out, t + 0.5 + k * 0.45, { f: 700, a: 0.001, r: 0.04, v: 0.3 }); burst(ac, out, t + 0.5 + k * 0.45, { f: 2200, q: 2, r: 0.02, v: 0.2 }); }
    return t + 1.9;
  };
  SFX.chappal = (ac, out, t, o) => { // chappal slap
    burst(ac, out, t, { f: 1700 * P(o), q: 0.8, a: 0.001, r: 0.035, v: 0.75 });
    return tone(ac, out, t, { f: 230 * P(o), f2: 120, a: 0.001, r: 0.05, v: 0.4 });
  };
  SFX.coin = (ac, out, t, o) => { // 1-rupee coin clink + bounce
    const f = 2950 * P(o) * rr(0.97, 1.03);
    strike(ac, out, t, f, METAL, 0.35, 0.18);
    strike(ac, out, t + 0.085, f * 1.01, METAL, 0.16, 0.1);
    return strike(ac, out, t + 0.14, f * 1.02, METAL, 0.07, 0.07);
  };
  SFX.cash = (ac, out, t, o) => { // kirana drawer "ching" + coins
    strike(ac, out, t, 2600 * P(o), BELL, 0.3, 0.6);
    SFX.coin(ac, out, t + 0.12, { pitch: 1.1 });
    return t + 0.8;
  };
  SFX.pickup = (ac, out, t, o) => { // sparkle: rising pentatonic tings + shimmer
    const base = 1046 * P(o), steps = [0, 4, 7, 12, 16, 19];
    let end = t;
    steps.forEach((s, i) => {
      const f = base * Math.pow(2, s / 12);
      tone(ac, out, t + i * 0.045, { f, a: 0.002, r: 0.35, v: 0.16 });
      end = tone(ac, out, t + i * 0.045, { type: 'triangle', f: f * 2, a: 0.002, r: 0.15, v: 0.05 });
    });
    burst(ac, out, t, { ft: 'highpass', f: 7000, a: 0.05, h: 0.1, r: 0.35, v: 0.06 });
    return Math.max(end, t + 0.6);
  };
  SFX.marble = (ac, out, t, o) => { // goli (glass marble) click
    strike(ac, out, t, 4300 * P(o), [[1, 0.5, 1], [1.5, 0.3, 0.6], [2.3, 0.2, 0.4]], 0.3, 0.06);
    return strike(ac, out, t + 0.07, 4400 * P(o), [[1, 0.5, 1], [1.5, 0.3, 0.6]], 0.15, 0.05);
  };

  // ---- story / UI stingers
  SFX.mission_passed = (ac, out, t, o) => { // original brass-band fanfare + tabla flourish (F major)
    const r = 65; // F4 = 65
    const mel = [[0, 0, 0.12], [0.13, 5, 0.12], [0.26, 9, 0.12], [0.39, 12, 0.32], [0.75, 9, 0.12], [0.88, 12, 0.75]];
    const out2 = gain(ac, 0.9, out);
    for (const m of mel) INST.brass(ac, out2, t + m[0], [r + m[1]], m[2], 0.75, {}, {});
    INST.brass(ac, out2, t + 0.88, [r - 12, r - 5, r], 0.9, 0.55, {}, {});
    INST.clarinet(ac, out2, t + 0.88, [r + 16], 0.8, 0.4, {}, {});
    const tb = mtof(r);
    const K = KITS.tabla;
    K.dha(ac, out2, t, 0.9, tb); K.ti(ac, out2, t + 0.39, 0.6, tb); K.ra(ac, out2, t + 0.46, 0.5, tb);
    K.ki(ac, out2, t + 0.53, 0.5, tb); K.ta(ac, out2, t + 0.6, 0.7, tb); K.dha(ac, out2, t + 0.88, 1, tb);
    KITS.band.C(ac, out2, t + 0.88, 0.5);
    return t + 2.4;
  };
  SFX.mission_failed = (ac, out, t, o) => { // sad trombone-ish wah descending + dhum
    const lp = filt(ac, 'lowpass', 900, 4, out);
    const notes = [[0, 67, 0.32], [0.36, 66, 0.32], [0.72, 65, 0.32], [1.08, 64, 0.9]];
    for (const n of notes) {
      tone(ac, lp, t + n[0], { wave: 'brass', f: mtof(n[1] - 12), a: 0.03, h: n[2], r: 0.12, v: 0.4, vib: n[2] > 0.5 ? [5, 3] : null });
      lp.frequency.setValueAtTime(400, t + n[0]); lp.frequency.linearRampToValueAtTime(1300, t + n[0] + 0.15); lp.frequency.linearRampToValueAtTime(500, t + n[0] + n[2]);
    }
    KITS.dholak.D(ac, out, t + 1.95, 1);
    return t + 2.4;
  };
  SFX.busted = (ac, out, t, o) => { // "PAKDA GAYA!": whistle + two dhol hits + falling tone
    SFX.whistle(ac, out, t, {});
    KITS.dholak.D(ac, out, t + 0.9, 1); KITS.dholak.D(ac, out, t + 1.15, 1);
    tone(ac, out, t + 0.9, { wave: 'reed', f: 520, f2: 260, glide: 0.8, a: 0.02, h: 0.6, r: 0.2, v: 0.15 });
    return t + 1.9;
  };
  SFX.wasted = (ac, out, t, o) => { // "THAK GAYA!": exhausted slide-whistle down + soft flop
    tone(ac, out, t, { f: 1100, f2: 180, glide: 1.1, a: 0.02, h: 1.0, r: 0.15, v: 0.2, vib: [6, 25] });
    return SFX.bump(ac, out, t + 1.2, { vol: 0.6 });
  };
  SFX.pant = (ac, out, t, o) => { // out of breath after running (stamina empty)
    let e = t;
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 0.42;
      burst(ac, out, tt, { kind: 'pink', f: 1100 * P(o), q: 1.4, a: 0.05, h: 0.08, r: 0.12, v: 0.22 });   // in
      e = burst(ac, out, tt + 0.2, { kind: 'pink', f: 750 * P(o), q: 1.2, a: 0.03, h: 0.06, r: 0.14, v: 0.3 }); // out
    }
    return e;
  };
  SFX.wanted_up = (ac, out, t, o) => { // Chappal Meter up: ta-ta + rising reed
    KITS.dholak.t(ac, out, t, 0.9); KITS.dholak.t(ac, out, t + 0.1, 0.9);
    tone(ac, out, t + 0.2, { wave: 'reed', f: mtof(76), a: 0.02, h: 0.1, r: 0.05, v: 0.15 });
    return tone(ac, out, t + 0.35, { wave: 'reed', f: mtof(81), a: 0.02, h: 0.18, r: 0.1, v: 0.17, vib: [6, 8] });
  };
  SFX.wanted_down = (ac, out, t, o) => {
    strike(ac, out, t, mtof(88), BELL, 0.18, 0.5);
    return strike(ac, out, t + 0.16, mtof(83), BELL, 0.16, 0.7);
  };
  SFX.objective = (ac, out, t, o) => { // soft santoor two-note ding
    INST.santoor(ac, out, t, [79], 0.5, 0.5, {}, {});
    INST.santoor(ac, out, t + 0.12, [86], 0.8, 0.55, {}, {});
    return t + 1.2;
  };
  SFX.ui_click = (ac, out, t, o) => { tone(ac, out, t, { f: 1250 * P(o), a: 0.001, r: 0.03, v: 0.18 }); return burst(ac, out, t, { ft: 'highpass', f: 4000, r: 0.01, v: 0.08 }); };
  SFX.ui_back = (ac, out, t, o) => tone(ac, out, t, { f: 700 * P(o), f2: 520, a: 0.002, r: 0.06, v: 0.18 });
  SFX.ui_select = (ac, out, t, o) => { tone(ac, out, t, { type: 'triangle', f: 880 * P(o), a: 0.002, r: 0.08, v: 0.16 }); return tone(ac, out, t + 0.05, { type: 'triangle', f: 1320 * P(o), a: 0.002, r: 0.12, v: 0.16 }); };
  SFX.type = (ac, out, t, o) => { // dialogue typewriter blip
    const f = 760 * P(o) * rr(0.94, 1.06);
    const bp = filt(ac, 'bandpass', f * 1.6, 1.2, out);
    tone(ac, bp, t, { type: 'square', f, a: 0.001, r: 0.03, v: 0.25 });
    return burst(ac, out, t, { ft: 'highpass', f: 5000, r: 0.008, v: 0.04 });
  };
  SFX.page_flip = (ac, out, t, o) => burst(ac, out, t, { kind: 'pink', f: 2500, f2: 5000, q: 0.8, a: 0.04, h: 0.05, r: 0.12, v: 0.3 });
  SFX.paper = (ac, out, t, o) => { let e = t; for (let k = 0; k < 5; k++) e = burst(ac, out, t + k * rr(0.03, 0.07), { f: rr(2500, 5500), q: 1, r: 0.04, v: 0.18 }); return e; };

  // ---- cassettes, phones, internet cafe
  SFX.tape_click = (ac, out, t, o) => { // play-key "ka-chak" + capstan hum
    burst(ac, out, t, { ft: 'highpass', f: 2000, r: 0.015, v: 0.45 });
    tone(ac, out, t, { f: 1700, a: 0.001, r: 0.012, v: 0.2 });
    burst(ac, out, t + 0.03, { ft: 'highpass', f: 1500, r: 0.02, v: 0.35 });
    tone(ac, out, t + 0.03, { f: 140, f2: 90, a: 0.001, r: 0.06, v: 0.35 });
    return burst(ac, out, t + 0.06, { ft: 'highpass', f: 5000, a: 0.05, h: 0.15, r: 0.15, v: 0.04 });
  };
  SFX.rewind = (ac, out, t, o) => { // cassette rewind: motor whine speeding up + chipmunk chatter + stop clunk
    const d = o.dur || 1.25;
    SFX.tape_click(ac, out, t, {});
    const st = t + 0.08;
    const bp = filt(ac, 'bandpass', 1500, 0.8, out);
    const os = osc0(ac); os.type = 'square';
    os.frequency.setValueAtTime(400, st); os.frequency.exponentialRampToValueAtTime(1400, st + d * 0.7);
    // chatter: random-stepped pitch modulation (squeaky voices whizzing by)
    const nz = ac.createBufferSource(); nz.buffer = noiseBuf(ac, 'white'); nz.loop = true;
    const nlp = filt(ac, 'lowpass', 26, 0.7); const ng = gain(ac, 2600, os.frequency);
    nz.connect(nlp); nlp.connect(ng);
    const g = gain(ac, 0, bp);
    g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.12, st + 0.1); g.gain.setValueAtTime(0.12, st + d - 0.05); g.gain.linearRampToValueAtTime(0, st + d);
    os.connect(g); os.start(st); os.stop(st + d + 0.05); nz.start(st, rnd()); nz.stop(st + d + 0.05);
    tone(ac, out, st, { type: 'sawtooth', f: 90, f2: 240, glide: d, a: 0.05, h: d - 0.1, r: 0.05, v: 0.05 });
    burst(ac, out, st, { ft: 'highpass', f: 4000, a: 0.05, h: d - 0.1, r: 0.05, v: 0.05 });
    burst(ac, out, st + d, { ft: 'highpass', f: 1800, r: 0.02, v: 0.5 });
    tone(ac, out, st + d, { f: 160, f2: 80, a: 0.001, r: 0.08, v: 0.4 });
    return st + d + 0.15;
  };
  SFX.std_ring = (ac, out, t, o) => { // STD/PCO desk phone: "trrring-trrring"
    const cycles = o.cycles || 1;
    const g = gain(ac, 0, out);
    const hits = [];
    for (let c = 0; c < cycles; c++) {
      const c0 = t + c * 3;
      for (const seg of [0, 0.6]) for (let tt = c0 + seg; tt < c0 + seg + 0.4; tt += 0.045) hits.push([tt, 1]);
    }
    pulses(g.gain, hits, 0.35, 0.02);
    const end = t + (cycles - 1) * 3 + 1.3;
    for (const p of [[1, 0.5], [2.1, 0.3], [3.3, 0.15]]) {
      const os = osc0(ac); os.frequency.value = 1750 * P(o) * p[0];
      const pg = gain(ac, p[1], g); os.connect(pg); os.start(t); os.stop(end);
    }
    return end;
  };
  SFX.coin_drop = (ac, out, t, o) => { // coin into a PCO box: slot, rattle down the chute, thunk
    burst(ac, out, t, { f: 3200, q: 2, a: 0.01, h: 0.04, r: 0.04, v: 0.2 });
    let tt = t + 0.08, f = 3400, gap = 0.08;
    for (let k = 0; k < 5; k++) { strike(ac, out, tt, f, METAL, 0.18 * (1 - k * 0.12), 0.07); tt += gap; gap *= 0.75; f *= 0.92; }
    strike(ac, out, tt + 0.05, 620, METAL, 0.25, 0.12);
    return tone(ac, out, tt + 0.05, { f: 160, a: 0.002, r: 0.08, v: 0.3 });
  };
  SFX.dialup = (ac, out, t, o) => { // early-2000s internet cafe modem: dial tone, DTMF, ring, handshake screech
    const bp = filt(ac, 'bandpass', 1500, 0.4, out);
    tone(ac, bp, t, { f: 350, a: 0.01, h: 0.45, r: 0.02, v: 0.15 }); tone(ac, bp, t, { f: 440, a: 0.01, h: 0.45, r: 0.02, v: 0.15 });
    const ROWS = [697, 770, 852, 941], COLS = [1209, 1336, 1477];
    let tt = t + 0.55;
    for (let k = 0; k < 7; k++) { tone(ac, bp, tt, { f: pick(ROWS), a: 0.003, h: 0.07, r: 0.01, v: 0.13 }); tone(ac, bp, tt, { f: pick(COLS), a: 0.003, h: 0.07, r: 0.01, v: 0.13 }); tt += 0.11; }
    tt += 0.25;
    tone(ac, bp, tt, { f: 440, a: 0.01, h: 0.5, r: 0.02, v: 0.12 }); tone(ac, bp, tt, { f: 480, a: 0.01, h: 0.5, r: 0.02, v: 0.12 });
    tt += 0.7;
    tone(ac, bp, tt, { f: 2100, a: 0.01, h: 0.45, r: 0.02, v: 0.12 });
    tt += 0.5;
    for (let k = 0; k < 10; k++) { tone(ac, bp, tt, { type: 'square', f: pick([980, 1180, 1650, 1850, 2400]), a: 0.003, h: 0.06, r: 0.01, v: 0.07 }); tt += 0.075; }
    burst(ac, bp, tt, { f: 1800, q: 0.3, a: 0.02, h: 0.7, r: 0.05, v: 0.3 });
    tone(ac, bp, tt, { type: 'square', f: 1200, f2: 1700, glide: 0.7, a: 0.02, h: 0.7, r: 0.05, v: 0.05 });
    return tt + 0.85;
  };
  SFX.keys = (ac, out, t, o) => { let e = t; for (let k = 0; k < 6; k++) { const tt = t + k * rr(0.07, 0.14); e = burst(ac, out, tt, { f: rr(2500, 4000), q: 2, r: 0.02, v: 0.2 }); tone(ac, out, tt, { f: 420, a: 0.001, r: 0.02, v: 0.06 }); } return e; };
  SFX.camera_flash = (ac, out, t, o) => { // photo studio: flash charge whine + shutter + pop
    tone(ac, out, t, { f: 1900, f2: 6500, glide: 0.6, a: 0.05, h: 0.5, r: 0.05, v: 0.04 });
    burst(ac, out, t + 0.66, { ft: 'highpass', f: 3000, r: 0.02, v: 0.35 });
    burst(ac, out, t + 0.7, { ft: 'highpass', f: 2000, r: 0.03, v: 0.3 });
    return burst(ac, out, t + 0.68, { kind: 'pink', ft: 'lowpass', f: 1200, r: 0.08, v: 0.3 });
  };
  SFX.shop_bell = (ac, out, t, o) => { strike(ac, out, t, mtof(88) * P(o), BELL, 0.2, 0.7); return strike(ac, out, t + 0.28, mtof(84) * P(o), BELL, 0.2, 1); };
  SFX.announce = (ac, out, t, o) => { // Numaish/station loudspeaker chime through a horn speaker + crackle
    const bp = filt(ac, 'bandpass', 1300, 1.2, out);
    const sh = shaper(ac, 3, bp);
    strike(ac, sh, t, mtof(76), BELL, 0.25, 0.8);
    strike(ac, sh, t + 0.45, mtof(72), BELL, 0.25, 1.1);
    for (let k = 0; k < 8; k++) burst(ac, out, t + rr(0, 1.4), { ft: 'highpass', f: 3000, r: 0.01, v: 0.08 });
    return t + 1.7;
  };
  SFX.station_chime = (ac, out, t, o) => { // generic three-note station announcement chime
    [72, 76, 79].forEach((m, i) => strike(ac, out, t + i * 0.32, mtof(m), [[1, 0.5, 1], [2, 0.2, 0.6], [3, 0.08, 0.4]], 0.22, 1.2));
    return t + 2;
  };

  // ---- water, wind, kites
  SFX.splash = (ac, out, t, o) => {
    burst(ac, out, t, { ft: 'lowpass', f: 4500, f2: 500, sweep: 0.5, q: 0.7, a: 0.004, r: 0.6, v: 0.55 * ((o && o.vol) || 1) });
    burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 300, r: 0.15, v: 0.5 });
    for (let k = 0; k < 6; k++) { const f = rr(600, 1700); tone(ac, out, t + rr(0.08, 0.7), { f, f2: f * 1.8, glide: 0.05, a: 0.003, r: 0.05, v: 0.08 }); }
    return t + 0.9;
  };
  SFX.water_lap = (ac, out, t, o) => burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 400, f2: 1100, sweep: 0.5, a: 0.35, h: 0.1, r: 0.8, v: 0.4 });
  SFX.kite_wind = (ac, out, t, o) => { // kite paper flutter in the wind + manja whoosh
    const d = o.dur || 2;
    const nv = noiseVoice(ac, out, t, d + 0.2, 'pink', 'bandpass', 900, 0.7);
    const fl = osc0(ac); fl.type = 'triangle'; fl.frequency.value = rr(11, 15);
    const fg = gain(ac, 0.25, nv.g.gain); fl.connect(fg); fl.start(t); fl.stop(t + d + 0.2);
    nv.g.gain.setValueAtTime(0, t); nv.g.gain.linearRampToValueAtTime(0.3, t + d * 0.4); nv.g.gain.linearRampToValueAtTime(0, t + d);
    nv.f.frequency.setValueAtTime(700, t); nv.f.frequency.linearRampToValueAtTime(1300, t + d * 0.5); nv.f.frequency.linearRampToValueAtTime(800, t + d);
    return burst(ac, out, t, { f: 500, f2: 2000, q: 0.6, a: d * 0.3, h: 0.1, r: d * 0.5, v: 0.12 });
  };
  SFX.kite_cut = (ac, out, t, o) => { // manja snaps: sharp tak + a twang
    burst(ac, out, t, { ft: 'highpass', f: 3000, r: 0.02, v: 0.5 });
    return tone(ac, out, t, { type: 'triangle', f: 1300, f2: 600, glide: 0.25, a: 0.001, r: 0.3, v: 0.15 });
  };
  SFX.bo_kaata = (ac, out, t, o) => { // the terrace crowd: "Bo... KAATA!" plus a cheering swell
    crowd(ac, out, t, { n: 6, f0: 210 * P(o), spread: 4, v: 0.5, sy: [[0, 0.28, 'o', 0, 0.9, 2], [0.36, 0.34, 'aa', 4, 1, 1], [0.74, 0.3, 'a', 2, 0.85, -3]] });
    burst(ac, out, t + 0.05, { kind: 'pink', f: 1300, q: 0.6, a: 0.25, h: 0.6, r: 0.7, v: 0.22 });
    burst(ac, out, t + 0.36, { f: 3000, q: 2, r: 0.03, v: 0.12 });
    return t + 1.9;
  };
  SFX.howzat = (ac, out, t, o) => crowd(ac, out, t, { n: 5, f0: 260 * P(o), spread: 3, v: 0.45, sy: [[0, 0.22, 'ho', 0, 0.9, 1], [0.26, 0.42, 'a', 3, 1, -2]] });
  SFX.kids = (ac, out, t, o) => { // distant kids shouting/playing
    return crowd(ac, out, t, { n: 4, f0: 330 * P(o), spread: 5, jitter: 0.25, v: 0.3, sy: [[0, 0.25, pick(['ay', 'e', 'o']), 0, 1, 3], [0.35, 0.3, pick(['aa', 'i', 'o']), 2, 0.8, -2]] });
  };
  SFX.crowd_cheer = (ac, out, t, o) => { // stadium / first-day-first-show roar
    const d = o.dur || 2.2;
    burst(ac, out, t, { kind: 'pink', f: 1000, q: 0.5, a: 0.35, h: d * 0.5, r: d * 0.5, v: 0.4 });
    crowd(ac, out, t + 0.1, { n: 6, f0: 230, spread: 7, jitter: 0.2, v: 0.35, sy: [[0, d * 0.6, 'ay', 0, 1, 3]] });
    for (let k = 0; k < 4; k++) SFX.finger_whistle(ac, out, t + rr(0.2, d * 0.7), { pitch: rr(0.9, 1.15) });
    return t + d + 0.3;
  };
  SFX.applause = (ac, out, t, o) => {
    const d = o.dur || 2.5;
    const nv = noiseVoice(ac, out, t, d + 0.3, 'white', 'bandpass', 1500, 0.9);
    const hits = []; for (let tt = t; tt < t + d; tt += rr(0.012, 0.04)) hits.push([tt, rr(0.3, 1) * Math.min(1, (t + d - tt) / (d * 0.4))]);
    pulses(nv.g.gain, hits, 0.6, 0.012);
    return t + d + 0.2;
  };
  SFX.clap_echo = (ac, out, t, o) => { // Golconda clap at the gate, heard echoing to the top
    let e = t;
    for (let k = 0; k < 5; k++) e = burst(ac, out, t + k * 0.32, { f: 1600 - k * 220, q: 1, a: 0.001, r: 0.06 + k * 0.02, v: 0.6 * Math.pow(0.55, k) });
    return e;
  };
  SFX.bat_hit = (ac, out, t, o) => { // gully cricket "tock"
    tone(ac, out, t, { f: 1150 * P(o), a: 0.001, r: 0.04, v: 0.4 });
    tone(ac, out, t, { f: 430 * P(o), a: 0.001, r: 0.07, v: 0.3 });
    return burst(ac, out, t, { f: 1900, q: 1.2, r: 0.03, v: 0.35 });
  };

  // ---- city life, vendors, shops
  const CALLS = { // wordless vendor melodies: [time, dur, vowel, semis, vol, bendSemis]
    banana: [[0, 0.22, 'e', 0, 1], [0.24, 0.5, 'aa', 3, 1, -1], [0.95, 0.2, 'e', 0, 0.9], [1.17, 0.6, 'aa', 3, 0.9, -3]],
    flower: [[0, 0.5, 'u', 5, 1, -2], [0.6, 0.25, 'e', 3, 0.8], [0.88, 0.5, 'o', 0, 0.9, -1]],
    veg: [[0, 0.2, 'aa', 0, 1], [0.22, 0.4, 'u', 2, 1], [0.7, 0.2, 'a', 4, 0.9], [0.92, 0.2, 'aa', 4, 0.9], [1.14, 0.5, 'a', 0, 0.9, -2]],
    kulfi: [[0, 0.3, 'u', 0, 1], [0.32, 0.7, 'i', 5, 1, 1]],
    chai: [[0, 0.3, 'ay', 3, 1], [0.35, 0.6, 'aa', 0, 1, -2]],
    paper: [[0, 0.25, 'aa', 0, 1], [0.27, 0.25, 'a', 2, 1], [0.55, 0.6, 'aa', 0, 1, -3]],
  };
  SFX.vendor_call = (ac, out, t, o) => {
    const k = o.variant && CALLS[o.variant] ? o.variant : pick(Object.keys(CALLS));
    return crowd(ac, out, t, { n: 2, f0: rr(145, 190) * P(o), spread: 0.3, jitter: 0.01, v: 0.5, sy: CALLS[k] });
  };
  SFX.kulfi_bell = (ac, out, t, o) => { // pushcart hand bell
    let e = t; for (let k = 0; k < 5; k++) e = strike(ac, out, t + k * rr(0.11, 0.16), 2900 * P(o) * rr(0.99, 1.01), BELL, 0.16 * rr(0.6, 1), 0.35); return e;
  };
  SFX.bangles = (ac, out, t, o) => { // Laad Bazaar glass bangles
    let e = t; for (let k = 0; k < 9; k++) e = strike(ac, out, t + rr(0, 0.5), rr(3800, 6200), CERAMIC, 0.08, 0.08); return e;
  };
  SFX.cup_clink = (ac, out, t, o) => { // Irani chai cup on saucer
    strike(ac, out, t, rr(2100, 2500) * P(o), CERAMIC, 0.25, 0.12);
    return strike(ac, out, t + rr(0.06, 0.1), rr(2600, 3000), CERAMIC, 0.12, 0.08);
  };
  SFX.plates = (ac, out, t, o) => { let e = t; for (let k = 0; k < 3; k++) e = strike(ac, out, t + k * rr(0.06, 0.15), rr(1700, 3200), METAL, 0.12, 0.18); return e; };
  SFX.sizzle = (ac, out, t, o) => { // tawa / kadhai sizzle (Gokul Chat, samosa & dosa bandis)
    const d = o.dur || 1.6;
    burst(ac, out, t, { ft: 'highpass', f: 3500, q: 0.5, a: 0.1, h: d - 0.3, r: 0.3, v: 0.12 });
    for (let k = 0; k < 14; k++) burst(ac, out, t + rr(0, d), { ft: 'highpass', f: rr(2500, 6000), r: 0.006, v: rr(0.05, 0.15) });
    return t + d;
  };
  SFX.chop = (ac, out, t, o) => { let e = t; for (let k = 0; k < 2; k++) { e = tone(ac, out, t + k * 0.3, { f: 230, a: 0.001, r: 0.06, v: 0.35 }); burst(ac, out, t + k * 0.3, { f: 2000, q: 1, r: 0.03, v: 0.2 }); } return e; };
  SFX.coconut_chop = (ac, out, t, o) => { let e = t; for (let k = 0; k < 3; k++) { e = tone(ac, out, t + k * 0.28, { f: 320 - k * 30, a: 0.001, r: 0.08, v: 0.35 }); burst(ac, out, t + k * 0.28, { f: 1100, q: 1.2, r: 0.04, v: 0.3 }); } return e; };
  SFX.conductor = (ac, out, t, o) => { // bus conductor: two-tweet whistle + ticket punch
    SFX.whistle(ac, out, t, { short: true, pitch: 1.1 }); SFX.whistle(ac, out, t + 0.25, { short: true, pitch: 1.1 });
    burst(ac, out, t + 0.6, { ft: 'highpass', f: 2500, r: 0.015, v: 0.3 }); burst(ac, out, t + 0.72, { ft: 'highpass', f: 2500, r: 0.015, v: 0.3 });
    return t + 0.9;
  };
  SFX.munch = (ac, out, t, o) => { let e = t; for (let k = 0; k < 4; k++) e = burst(ac, out, t + k * rr(0.12, 0.18), { f: rr(1500, 3000), q: 0.6, a: 0.002, r: 0.06, v: 0.35 }); return e; };
  SFX.sip = (ac, out, t, o) => burst(ac, out, t, { f: 600, f2: 2600, sweep: 0.35, q: 3, a: 0.04, h: 0.25, r: 0.08, v: 0.25 });
  SFX.flour_mill = (ac, out, t, o) => { // pindi girni: belt-driven thump-thump + grinding whirr
    const d = o.dur || 2;
    const nv = noiseVoice(ac, out, t, d + 0.2, 'brown', 'lowpass', 260, 1);
    const hits = []; for (let tt = t; tt < t + d; tt += 0.27) hits.push([tt, 1]);
    pulses(nv.g.gain, hits, 2.2, 0.04);
    const os = osc0(ac); os.type = 'sawtooth'; os.frequency.value = 49;
    const lp = filt(ac, 'lowpass', 200, 2); const og = gain(ac, 0, out); os.connect(lp); lp.connect(og);
    pulses(og.gain, hits, 0.22, 0.06);
    os.start(t); os.stop(t + d + 0.2);
    burst(ac, out, t, { f: 900, q: 0.8, a: 0.1, h: d - 0.2, r: 0.1, v: 0.05 });
    return t + d + 0.1;
  };
  SFX.cooker = (ac, out, t, o) => { // pressure-cooker whistle: weight jiggle, then the steam scream
    const d = o.dur || 1.2;
    const nj = noiseVoice(ac, out, t, 0.5, 'white', 'bandpass', 3000, 3);
    const hits = []; for (let tt = t; tt < t + 0.35; tt += 0.032) hits.push([tt, rr(0.5, 1)]);
    pulses(nj.g.gain, hits, 0.4, 0.008);
    const st = t + 0.3;
    const nv = noiseVoice(ac, out, st, d + 0.5, 'white', 'bandpass', 1500, 28);
    nv.f.frequency.setValueAtTime(1500, st); nv.f.frequency.exponentialRampToValueAtTime(2350, st + 0.4); nv.f.frequency.linearRampToValueAtTime(2250, st + d);
    nv.g.gain.setValueAtTime(0, st); nv.g.gain.linearRampToValueAtTime(3.0, st + 0.15); nv.g.gain.setValueAtTime(3.0, st + d); nv.g.gain.linearRampToValueAtTime(0, st + d + 0.35);
    tone(ac, out, st, { f: 1500, f2: 2350, glide: 0.4, a: 0.15, h: d - 0.1, r: 0.3, v: 0.05 });
    burst(ac, out, st, { ft: 'highpass', f: 4500, a: 0.1, h: d, r: 0.3, v: 0.07 });
    return st + d + 0.4;
  };
  SFX.temple_bell = (ac, out, t, o) => { // ghanta, rung gently twice
    const f = 620 * P(o);
    strike(ac, out, t, f, BIGBELL, 0.22, 2.6);
    return strike(ac, out, t + 0.9, f, BIGBELL, 0.18, 2.8);
  };
  SFX.church_bell = (ac, out, t, o) => { let e = t; for (let k = 0; k < 3; k++) e = strike(ac, out, t + k * 1.1, 310 * P(o), BIGBELL, 0.22, 3); return e; };
  SFX.school_bell = (ac, out, t, o) => { // brass plate struck with a hammer: "tang tang tang..."
    let e = t; for (let k = 0; k < (o.n || 6); k++) e = strike(ac, out, t + k * 0.3, 640 * P(o), [[1, 0.5, 1], [2.32, 0.35, 0.6], [3.74, 0.2, 0.4], [5.1, 0.1, 0.3]], 0.22, 0.6); return e;
  };
  SFX.train_horn = (ac, out, t, o) => { // diesel loco two-tone horn
    const d = o.dur || 1.3;
    const lp = filt(ac, 'lowpass', 1800, 1, out);
    tone(ac, lp, t, { type: 'sawtooth', f: 311 * P(o), a: 0.08, h: d, r: 0.25, v: 0.2 });
    return tone(ac, lp, t, { type: 'sawtooth', f: 370 * P(o), a: 0.08, h: d, r: 0.25, v: 0.17 });
  };
  SFX.firework = (ac, out, t, o) => { // festive night: whoosh up, pop, crackle sparkle
    burst(ac, out, t, { f: 500, f2: 3500, sweep: 0.7, q: 2, a: 0.1, h: 0.5, r: 0.05, v: 0.15 });
    const tp = t + 0.75;
    tone(ac, out, tp, { f: 120, f2: 50, a: 0.002, r: 0.3, v: 0.5 });
    burst(ac, out, tp, { kind: 'pink', ft: 'lowpass', f: 2000, r: 0.25, v: 0.5 });
    for (let k = 0; k < 16; k++) burst(ac, out, tp + 0.15 + rr(0, 0.9), { ft: 'highpass', f: rr(3000, 7000), r: 0.01, v: rr(0.04, 0.12) });
    return tp + 1.2;
  };

  // ---- animals & birds
  SFX.pigeons = (ac, out, t, o) => { // a flock taking off: wing claps, then a soft coo
    const d = o.dur || 0.9;
    const nv = noiseVoice(ac, out, t, d + 0.1, 'white', 'bandpass', rr(1400, 2400), 0.9);
    const hits = []; let tt = t, gap = 0.05;
    while (tt < t + d) { hits.push([tt, rr(0.5, 1) * (1 - (tt - t) / (d * 1.2))]); tt += gap * rr(0.7, 1.3); gap *= 1.04; }
    pulses(nv.g.gain, hits, 0.9, 0.014);
    if (o.coo !== false && rnd() < 0.6) SFX.coo(ac, out, t + d * 0.6, {});
    return t + d + 0.8;
  };
  SFX.coo = (ac, out, t, o) => { // "gutar-goo"
    const os = osc0(ac); os.frequency.setValueAtTime(330, t); os.frequency.linearRampToValueAtTime(390, t + 0.25); os.frequency.linearRampToValueAtTime(300, t + 0.7);
    const g = gain(ac, 0, out);
    pulses(g.gain, [[t, 0.6], [t + 0.12, 0.8], [t + 0.3, 1]], 0.12, 0.08);
    os.connect(g); os.start(t); os.stop(t + 0.9);
    return t + 0.9;
  };
  SFX.bird = (ac, out, t, o) => { // small bird chirps (bulbul / sparrow)
    const n = 2 + ((rnd() * 4) | 0), f = rr(2600, 4200) * P(o);
    let e = t;
    for (let k = 0; k < n; k++) e = tone(ac, out, t + k * rr(0.08, 0.13), { f: f * rr(0.9, 1.1), f2: f * rr(1.2, 1.5), glide: 0.04, a: 0.004, r: 0.05, v: 0.1 });
    return e;
  };
  SFX.koel = (ac, out, t, o) => { // the summer koel: "koo-OO" rising, repeated
    let e = t;
    for (let k = 0; k < 3; k++) {
      const f = 820 * Math.pow(1.09, k) * P(o);
      tone(ac, out, t + k * 0.6, { f: f * 0.9, f2: f, glide: 0.05, a: 0.02, h: 0.08, r: 0.06, v: 0.12 });
      e = tone(ac, out, t + k * 0.6 + 0.17, { f: f * 1.15, f2: f * 1.35, glide: 0.18, a: 0.02, h: 0.15, r: 0.08, v: 0.14 });
    }
    return e;
  };
  SFX.crow_caw = (ac, out, t, o) => {
    const bp = filt(ac, 'bandpass', 1300, 1.5, out);
    const sh = shaper(ac, 3, bp);
    let e = t;
    for (let k = 0; k < (o.n || 2); k++) e = tone(ac, sh, t + k * 0.32, { type: 'sawtooth', f: 620 * P(o), f2: 470 * P(o), glide: 0.2, a: 0.01, h: 0.12, r: 0.06, v: 0.25 });
    return e;
  };
  SFX.cheel = (ac, out, t, o) => // black kite circling over the rocks: descending tremolo whistle
    tone(ac, out, t, { f: 2700 * P(o), f2: 1700 * P(o), glide: 0.9, a: 0.03, h: 0.7, r: 0.2, v: 0.08, vib: [17, 160] });
  SFX.dog_bark = (ac, out, t, o) => {
    let e = t;
    for (let k = 0; k < (o.n || 2); k++) {
      const tt = t + k * rr(0.22, 0.32);
      const bp = filt(ac, 'bandpass', 900 * P(o), 1.2, out);
      tone(ac, bp, tt, { type: 'sawtooth', f: 330 * P(o), f2: 210 * P(o), glide: 0.1, a: 0.005, r: 0.12, v: 0.5 });
      e = burst(ac, out, tt, { f: 1200, q: 1, a: 0.003, r: 0.09, v: 0.15 });
    }
    return e;
  };
  SFX.cow_moo = (ac, out, t, o) => {
    const lp = filt(ac, 'lowpass', 400, 3, out);
    lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(950, t + 0.6); lp.frequency.linearRampToValueAtTime(500, t + 1.2);
    const os = osc0(ac); os.type = 'sawtooth';
    os.frequency.setValueAtTime(100 * P(o), t); os.frequency.linearRampToValueAtTime(122 * P(o), t + 0.5); os.frequency.linearRampToValueAtTime(92 * P(o), t + 1.25);
    const g = gain(ac, 0, lp); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.15); g.gain.setValueAtTime(0.4, t + 1.0); g.gain.linearRampToValueAtTime(0, t + 1.3);
    os.connect(g); os.start(t); os.stop(t + 1.35);
    return t + 1.35;
  };

  // ---- footsteps (by surface). Kids wear hawai chappals: heel tap + a little flap on hard ground
  const SURF_NAMES = ['void', 'dirt', 'road', 'stone', 'grass', 'stone', 'water', 'stone', 'stone', 'sand', 'wood'];
  SFX.step = (ac, out, t, o) => {
    let s = o.surface;
    if (typeof s === 'number') s = SURF_NAMES[s] || 'road';
    s = s || 'road';
    const v = (o.run ? 1 : 0.7) * rr(0.8, 1);
    const p = P(o) * rr(0.92, 1.08);
    if (s === 'grass') return burst(ac, out, t, { kind: 'pink', ft: 'lowpass', f: 1800 * p, a: 0.01, r: 0.09, v: 0.35 * v });
    if (s === 'dirt' || s === 'sand') { let e = t; for (let k = 0; k < 3; k++) e = burst(ac, out, t + k * 0.012, { f: rr(900, 1700) * p, q: 0.8, r: 0.03, v: 0.3 * v }); return e; }
    if (s === 'wood') { burst(ac, out, t, { f: 600 * p, q: 1, r: 0.05, v: 0.25 * v }); return tone(ac, out, t, { f: 180 * p, f2: 150, a: 0.001, r: 0.09, v: 0.35 * v }); }
    if (s === 'water') return burst(ac, out, t, { ft: 'lowpass', f: 2600, f2: 700, q: 1, a: 0.005, r: 0.14, v: 0.35 * v });
    const f = s === 'stone' ? 3200 : 2400;
    burst(ac, out, t, { f: f * p, q: 1, a: 0.001, r: 0.03, v: 0.4 * v });
    tone(ac, out, t, { f: 140 * p, a: 0.001, r: 0.04, v: 0.25 * v });
    return burst(ac, out, t + 0.055, { f: 1500 * p, q: 0.9, a: 0.001, r: 0.02, v: 0.2 * v }); // chappal flap
  };

  SFX.scissors = (ac, out, t, o) => { // barber shop: snip-snip
    let e = t;
    for (let k = 0; k < (o.n || 4); k++) {
      const tt = t + k * rr(0.16, 0.22);
      strike(ac, out, tt, rr(4800, 5600), [[1, 0.5, 1], [1.5, 0.3, 0.6]], 0.12, 0.03);
      e = burst(ac, out, tt + 0.012, { ft: 'highpass', f: 6000, a: 0.002, r: 0.03, v: 0.12 });
    }
    return e;
  };
  SFX.arcade = (ac, out, t, o) => { // video parlour: chiptune blips + a "pew"
    const sc = [0, 3, 5, 7, 10, 12, 15];
    let e = t;
    for (let k = 0; k < 8; k++) e = tone(ac, out, t + k * 0.06, { type: 'square', f: mtof(76 + pick(sc)), a: 0.002, h: 0.03, r: 0.02, v: 0.08 });
    return tone(ac, out, e + 0.05, { type: 'square', f: 1800, f2: 300, glide: 0.18, a: 0.002, h: 0.15, r: 0.04, v: 0.07 });
  };
  SFX.airplane = (ac, out, t, o) => { // Begumpet airport: a jet passing over
    const d = o.dur || 6;
    const nv = noiseVoice(ac, out, t, d + 0.2, 'brown', 'lowpass', 300, 0.8);
    nv.g.gain.setValueAtTime(0, t); nv.g.gain.linearRampToValueAtTime(1.6, t + d * 0.45); nv.g.gain.linearRampToValueAtTime(0, t + d);
    nv.f.frequency.setValueAtTime(250, t); nv.f.frequency.linearRampToValueAtTime(900, t + d * 0.45); nv.f.frequency.linearRampToValueAtTime(220, t + d);
    return tone(ac, out, t, { f: 3100, f2: 2500, glide: d, a: d * 0.4, h: 0.2, r: d * 0.4, v: 0.012 });
  };

  SFX.clap = (ac, out, t, o) => { // one crisp hand clap (Golconda call-and-answer)
    burst(ac, out, t, { f: 1500 * P(o), q: 1, a: 0.001, r: 0.05, v: 0.6 });
    return burst(ac, out, t + 0.004, { kind: 'pink', f: 900 * P(o), q: 0.8, a: 0.001, r: 0.08, v: 0.35 });
  };
  SFX.gong = (ac, out, t, o) => strike(ac, out, t, 196 * P(o), [[1, 0.5, 1], [1.52, 0.3, 0.8], [2.17, 0.25, 0.6], [2.9, 0.15, 0.5], [4.1, 0.08, 0.3]], 0.3, 3.5);
  SFX.clock_tick = (ac, out, t, o) => { let e = t; for (let k = 0; k < (o.n || 4); k++) e = burst(ac, out, t + k * 0.5, { f: k % 2 ? 2600 : 3200, q: 4, a: 0.001, r: 0.025, v: 0.7 }); return e; };
  SFX.rec = (ac, out, t, o) => { // "● REC": key clunk + a little confirmation beep
    SFX.tape_click(ac, out, t, {});
    return tone(ac, out, t + 0.12, { type: 'square', f: 1320, a: 0.002, h: 0.07, r: 0.02, v: 0.06 });
  };
  SFX.tape_stop = (ac, out, t, o) => { // "■ STOP": motor winds down + key release
    const d = o.dur || 0.6;
    tone(ac, out, t, { type: 'sawtooth', f: 240, f2: 40, glide: d, a: 0.01, h: d * 0.8, r: 0.05, v: 0.05 });
    burst(ac, out, t + d, { ft: 'highpass', f: 1800, r: 0.02, v: 0.45 });
    return tone(ac, out, t + d, { f: 150, f2: 80, a: 0.001, r: 0.08, v: 0.35 });
  };
  SFX.detector = (ac, out, t, o) => // hot/cold beacon beep (pitch rises as you get close)
    tone(ac, out, t, { type: 'triangle', f: 900 * P(o), a: 0.003, h: 0.05, r: 0.04, v: 0.22 });

  // ---- radio static (also used by the radio)
  SFX.radio_static = (ac, out, t, o) => {
    const d = o.dur || 0.45;
    burst(ac, out, t, { ft: 'bandpass', f: 2200, q: 0.4, a: 0.01, h: d, r: 0.05, v: 0.35 });
    tone(ac, out, t, { f: rr(800, 2000), f2: rr(300, 3000), glide: d, a: 0.01, h: d, r: 0.03, v: 0.05 });
    for (let k = 0; k < 6; k++) burst(ac, out, t + rr(0, d), { ft: 'highpass', f: 3000, r: 0.008, v: 0.2 });
    return t + d + 0.08;
  };

  // ---- story-layer requests (systems §12.2 NEW). Comic and kid-friendly; nothing painful.
  SFX.freewheel = (ac, out, t, o) => { // cycle coasting: ratchet "tik-tik-tik" at the wheel speed
    const n = o.n || 10, rate = o.rate || 14;
    let e = t;
    for (let k = 0; k < n; k++) e = burst(ac, out, t + k / rate, { ft: 'highpass', f: 4200 * P(o), q: 1.2, a: 0.0008, r: 0.012, v: 0.22 * (1 - (k / n) * 0.5) });
    return e;
  };
  SFX.puncture = (ac, out, t, o) => { // flat tyre: a long "psssss", then a rim thud
    const d = o.dur || 1.6;
    burst(ac, out, t, { ft: 'highpass', f: 3800, f2: 2200, sweep: d, q: 0.6, a: 0.02, h: d * 0.7, r: d * 0.3, v: 0.3 });
    return tone(ac, out, t + d + 0.05, { f: 110, f2: 70, a: 0.001, r: 0.12, v: 0.4 });
  };
  SFX.pothole = (ac, out, t, o) => { // A2 "DHADAK!": hollow "thunk" (wheel drops, tyre bottoms out) + a spring rattle
    tone(ac, out, t, { f: 95 * P(o), f2: 55, glide: 0.1, a: 0.001, r: 0.18, v: 0.6 });
    burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 500, r: 0.08, v: 0.4 });
    tone(ac, out, t + 0.07, { f: 72 * P(o), f2: 48, glide: 0.08, a: 0.001, r: 0.14, v: 0.42 }); // "-dak": the wheel climbs out
    let e = t;
    for (let k = 0; k < 5; k++) e = strike(ac, out, t + 0.05 + k * 0.035, rr(1800, 2600), METAL, 0.05 * (1 - k * 0.15), 0.06);
    if (o.variant === 'wet') { // rain-filled: a muddy splash and droplets
      burst(ac, out, t + 0.01, { ft: 'lowpass', f: 3800, f2: 600, sweep: 0.35, q: 0.7, a: 0.003, r: 0.45, v: 0.62 });
      tone(ac, out, t + 0.03, { f: 210, f2: 120, glide: 0.12, a: 0.004, r: 0.12, v: 0.18 }); // the "gloop" of the water
      for (let k = 0; k < 4; k++) { const f = rr(700, 1600); tone(ac, out, t + rr(0.08, 0.45), { f, f2: f * 1.7, glide: 0.04, a: 0.002, r: 0.04, v: 0.06 }); }
      e = Math.max(e, t + 0.6);
    }
    return e;
  };
  SFX.chappal_whoosh = (ac, out, t, o) => { // the 0.4 s wind-up + flight: a rising whoosh with a little whistle
    const d = o.dur || 0.55;
    burst(ac, out, t, { kind: 'pink', f: 500, f2: 2600, sweep: d, q: 1.4, a: d * 0.6, h: 0.02, r: 0.12, v: 0.85 });
    return tone(ac, out, t + d * 0.2, { f: 900 * P(o), f2: 1900, glide: d * 0.8, a: d * 0.4, h: 0.05, r: 0.1, v: 0.11 });
  };
  SFX.peel_slip = (ac, out, t, o) => { // a pursuer slips on a peel: slide whistle down, then a soft bump
    tone(ac, out, t, { f: 1500, f2: 300, glide: 0.55, a: 0.02, h: 0.45, r: 0.08, v: 0.16, vib: [9, 12] });
    tone(ac, out, t + 0.62, { f: 120, f2: 70, a: 0.001, r: 0.12, v: 0.45 });
    return burst(ac, out, t + 0.62, { kind: 'brown', ft: 'lowpass', f: 380, r: 0.08, v: 0.35 });
  };
  SFX.stomach_growl = (ac, out, t, o) => { // hungry: a comic gurgle
    const d = 0.9 * (o.dur || 1);
    const os = osc0(ac); os.type = 'sawtooth';
    os.frequency.setValueAtTime(70 * P(o), t); os.frequency.linearRampToValueAtTime(115 * P(o), t + d * 0.4); os.frequency.linearRampToValueAtTime(58 * P(o), t + d);
    const g = gain(ac, 0, out), fl = filt(ac, 'lowpass', 380, 5, g);
    for (let k = 0; k < 9; k++) g.gain.setTargetAtTime(k % 2 ? 0.06 : 0.24, t + (k * d) / 9, 0.02);
    g.gain.setTargetAtTime(0, t + d, 0.05);
    os.connect(fl); os.start(t); os.stop(t + d + 0.3);
    return t + d + 0.3;
  };
  SFX.weigh_machine = (ac, out, t, o) => { // station weighing machine: coin drop, a whirr, the fortune card "chk"
    SFX.coin_drop(ac, out, t, {});
    const nv = noiseVoice(ac, out, t + 0.5, 0.95, 'pink', 'bandpass', 900, 3);
    nv.g.gain.setValueAtTime(0, t + 0.5); nv.g.gain.linearRampToValueAtTime(0.25, t + 0.6); nv.g.gain.setTargetAtTime(0, t + 1.25, 0.05);
    tone(ac, out, t + 0.5, { type: 'sawtooth', f: 120, f2: 160, glide: 0.7, a: 0.05, h: 0.6, r: 0.05, v: 0.04 });
    burst(ac, out, t + 1.45, { ft: 'highpass', f: 2500, q: 1, a: 0.001, r: 0.025, v: 0.5 });
    return tone(ac, out, t + 1.45, { f: 600, a: 0.001, r: 0.03, v: 0.15 });
  };
  SFX.jukebox = (ac, out, t, o) => { // Irani café jukebox: the arm clunks over, motor hum, record crackle
    tone(ac, out, t, { f: 160, f2: 90, a: 0.001, r: 0.1, v: 0.45 });
    burst(ac, out, t, { f: 900, q: 1, r: 0.05, v: 0.3 });
    tone(ac, out, t + 0.25, { type: 'sawtooth', f: 60, f2: 75, glide: 0.4, a: 0.05, h: 0.35, r: 0.05, v: 0.03 });
    tone(ac, out, t + 0.75, { f: 210, f2: 120, a: 0.001, r: 0.06, v: 0.3 });
    let e = t + 0.8;
    for (let k = 0; k < 10; k++) e = Math.max(e, burst(ac, out, t + 0.8 + rr(0, 0.9), { ft: 'highpass', f: 3500, r: 0.006, v: 0.18 }));
    return e;
  };
  SFX.goat_bleat = (ac, out, t, o) => { // "meh-eh-eh": a reedy voice with a fast tremolo
    const d = 0.7, f0 = 330 * P(o) * rr(0.92, 1.08);
    const os = osc0(ac); os.type = 'sawtooth';
    os.frequency.setValueAtTime(f0, t); os.frequency.linearRampToValueAtTime(f0 * 1.08, t + 0.15); os.frequency.linearRampToValueAtTime(f0 * 0.86, t + d);
    const env = gain(ac, 0, out), trem = gain(ac, 0.6, env);
    const f1 = filt(ac, 'bandpass', 700, 5, trem), f2 = filt(ac, 'bandpass', 1800, 6, gain(ac, 0.6, trem));
    os.connect(f1); os.connect(f2);
    const lfo = osc0(ac); lfo.frequency.value = 17; const lg = gain(ac, 0.4, trem.gain); lfo.connect(lg);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.7, t + 0.04); env.gain.setTargetAtTime(0, t + d - 0.1, 0.06);
    os.start(t); os.stop(t + d + 0.3); lfo.start(t); lfo.stop(t + d + 0.3);
    return t + d + 0.3;
  };
  SFX.dappu = (ac, out, t, o) => { // a short teenmaar roll: dappu frame drum in a 6/8 gallop with rim slaps (bible §12.4)
    const st = 0.105 / P(o), pat = 'P.pP.T P.pPTT P.pP.T PpPpTT P.pPTR B..M..';
    let e = t, i = 0;
    for (const ch of pat.replace(/ /g, '')) {
      const tt = t + i * st; i++;
      if (ch === '.') continue;
      const fn = KITS.band[ch];
      if (fn) { fn(ac, out, tt + rr(0, 0.006), ch === 'p' ? 0.7 : ch === 'B' ? 1.1 : 1); e = tt + 0.45; }
    }
    return e;
  };
  SFX.fountain = (ac, out, t, o) => { // Lumbini musical fountain: rising spray hiss + a few music-box notes
    const d = o.dur || 2.4;
    const nv = noiseVoice(ac, out, t, d + 0.4, 'white', 'highpass', 1800, 0.5);
    nv.g.gain.setValueAtTime(0, t); nv.g.gain.linearRampToValueAtTime(0.3, t + d * 0.5); nv.g.gain.linearRampToValueAtTime(0.12, t + d); nv.g.gain.linearRampToValueAtTime(0, t + d + 0.35);
    nv.f.frequency.setValueAtTime(1200, t); nv.f.frequency.linearRampToValueAtTime(3800, t + d * 0.5);
    let e = t;
    [72, 76, 79, 84, 79, 76].forEach((m, k) => { e = strike(ac, out, t + k * 0.3, mtof(m) * P(o), [[1, 0.5, 1], [2.76, 0.12, 0.4]], 0.08, 0.6); });
    return Math.max(e, t + d + 0.4);
  };
  SFX.giant_wheel = (ac, out, t, o) => { // Numaish giant wheel: slow metal creaks over a bulb hum
    const d = o.dur || 2.2;
    tone(ac, out, t, { type: 'sawtooth', f: 100, a: 0.2, h: d, r: 0.3, v: 0.018 });
    let e = t;
    for (let k = 0; k < 3; k++) e = tone(ac, out, t + 0.2 + k * 0.7, { type: 'sawtooth', f: rr(380, 520), f2: rr(260, 340), glide: 0.45, a: 0.08, h: 0.25, r: 0.15, v: 0.07, vib: [23, 18] });
    return Math.max(e, t + d + 0.3);
  };

  // Loudness trims so one-shots sit together in the mix (measured with tests: horns/whistles were ~10 dB hot)
  const SFX_TRIM = { auto_horn: 0.55, car_horn: 0.7, bus_horn: 0.55, lorry_horn: 0.65, diesel_start: 0.6, flour_mill: 0.65, mission_passed: 0.8,
    mission_failed: 0.75, busted: 0.75, cow_moo: 0.5, train_horn: 0.75, whistle: 0.6, conductor: 0.65, bell: 1.3, bird: 1.6, step: 1.5,
    chappal: 0.8, crowd_cheer: 0.7, dialup: 0.9, koel: 1.2, cheel: 1.6, coo: 1.4, kids: 1.2 };
  for (const k in SFX_TRIM) {
    const fn = SFX[k], g0 = SFX_TRIM[k];
    SFX[k] = (ac, out, t, o) => fn(ac, gain(ac, g0, out), t, o || {});
  }

  /* ============================================================ Karplus-Strong sampler */
  // Plucked strings are rendered in JS (Karplus-Strong with an allpass fractional delay and,
  // for sitar/tanpura, a one-sided "jawari" bridge nonlinearity that keeps the buzz alive while
  // the string is loud), cached as AudioBuffers at 24 kHz every 2 semitones, and played back
  // with playbackRate (which also gives us meend slides). Buffers are context-independent.
  const KS_DEF = {
    sitar: { dur: 1.9, t60: 3.2, S: 0.2, jaw: 0.25, jawTh: 0.2, exc: 'pick', pos: 7 },
    santoor: { dur: 1.5, t60: 2.4, S: 0.3, exc: 'hammer', pos: 5, detune: 1.0045 },
    mandolin: { dur: 0.9, t60: 0.9, S: 0.3, exc: 'pick', pos: 8, detune: 1.003 },
    tanpura: { dur: 4.0, t60: 7, S: 0.16, jaw: 0.3, jawTh: 0.14, exc: 'soft', pos: 4 },
    guitar: { dur: 1.6, t60: 2.0, S: 0.45, exc: 'soft', pos: 6 },
    harp: { dur: 1.6, t60: 2.4, S: 0.38, exc: 'soft', pos: 3 },
  };
  const KS = new Map();
  function excite(buf, kind, pos) {
    const n = buf.length;
    if (kind === 'hammer') {
      const w = Math.max(2, n >> 2), c = Math.floor(n / pos);
      for (let i = 0; i < n; i++) buf[i] = (rnd() * 2 - 1) * 0.2;
      for (let i = 0; i < w; i++) buf[(c + i) % n] += 0.5 - 0.5 * Math.cos((TAU * i) / w);
    } else {
      for (let i = 0; i < n; i++) buf[i] = rnd() * 2 - 1;
      const k = kind === 'soft' ? 0.35 : 0.8;
      for (let pass = 0; pass < (kind === 'soft' ? 2 : 1); pass++) { let s = 0; for (let i = 0; i < n; i++) { s += (buf[i] - s) * k; buf[i] = s; } }
    }
    if (pos) { const d = Math.max(1, Math.round(n / pos)); const c = buf.slice(); for (let i = 0; i < n; i++) buf[i] = c[i] - c[(i - d + n) % n]; }
    let m = 0; for (let i = 0; i < n; i++) m += buf[i]; m /= n;
    let pk = 1e-6; for (let i = 0; i < n; i++) { buf[i] -= m; pk = Math.max(pk, Math.abs(buf[i])); }
    for (let i = 0; i < n; i++) buf[i] /= pk;
  }
  function ksRender(def, freq) {
    const sr = KS_RATE, len = Math.floor(def.dur * sr);
    const out = new Float32Array(len);
    const voices = def.detune ? [freq, freq * def.detune] : [freq];
    for (const f of voices) {
      const Pd = sr / f - def.S;
      const Ni = Math.max(2, Math.floor(Pd)), frac = Pd - Ni;
      const C = (1 - frac) / (1 + frac);
      const rho = Math.pow(10, -3 / (def.t60 * f));
      const buf = new Float32Array(Ni);
      excite(buf, def.exc, def.pos);
      let idx = 0, prev = 0, ax = 0, ay = 0;
      const S1 = 1 - def.S, S2 = def.S, jaw = def.jaw, th = def.jawTh;
      for (let i = 0; i < len; i++) {
        const x = buf[idx];
        const y = rho * (S1 * x + S2 * prev); prev = x;
        let v = C * y + ax - C * ay; ax = y; ay = v;
        if (jaw && v > th) v = th + (v - th) * jaw;
        buf[idx] = v;
        out[i] += x;
        if (++idx >= Ni) idx = 0;
      }
    }
    // DC block, normalise, fade the tail
    let x1 = 0, y1 = 0, pk = 1e-6;
    for (let i = 0; i < len; i++) { const y = out[i] - x1 + 0.995 * y1; x1 = out[i]; y1 = y; out[i] = y; pk = Math.max(pk, Math.abs(y)); }
    const fade = Math.floor(len * 0.25);
    for (let i = 0; i < len; i++) { out[i] *= 0.8 / pk; if (i > len - fade) out[i] *= (len - i) / fade; }
    return out;
  }
  function ksBuffer(ac, inst, midi) {
    const key = inst + ':' + midi;
    let b = KS.get(key);
    if (b) { KS.delete(key); KS.set(key, b); return b; } // LRU touch
    const data = ksRender(KS_DEF[inst], mtof(midi));
    b = ac.createBuffer(1, data.length, KS_RATE);
    if (b.copyToChannel) b.copyToChannel(data, 0); else b.getChannelData(0).set(data);
    KS.set(key, b);
    if (KS.size > 90) KS.delete(KS.keys().next().value);
    return b;
  }
  function ksPlay(ac, out, t, inst, midi, dur, vel, o) {
    const anchor = midi - (((midi % 2) + 2) % 2);
    const buf = ksBuffer(ac, inst, anchor);
    const rate = Math.pow(2, (midi - anchor) / 12);
    const src = ac.createBufferSource(); src.buffer = buf;
    const pr = src.playbackRate;
    if (o.from != null && o.from !== midi) {
      pr.setValueAtTime(rate * Math.pow(2, (o.from - midi) / 12), t);
      pr.setTargetAtTime(rate, t + 0.015, o.glideT || 0.05);
    } else if (o.twang) { pr.setValueAtTime(rate * 1.01, t); pr.setTargetAtTime(rate, t, 0.03); }
    else pr.setValueAtTime(rate, t);
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(vel, t);
    const ring = Math.min(buf.duration / rate - 0.05, dur + (o.ring == null ? 0.6 : o.ring));
    g.gain.setTargetAtTime(0, t + Math.max(0.03, ring - 0.08), 0.04);
    src.connect(g); src.start(t); src.stop(t + ring + 0.2);
  }

  /* ============================================================ instruments */
  // INST[name](ac, out, t, notes[], durSec, vel 0..1+, ev {glide, trem, ...}, st partState)
  const INST = {};
  const plucked = (inst, gainMul, ring, twang) => (ac, out, t, notes, dur, vel, ev, st) => {
    const from = ev.glide && st.lastMidi != null ? st.lastMidi : null;
    for (const m of notes) {
      if (ev.trem) {
        for (let tt = 0; tt < dur - 0.02; tt += 0.07) ksPlay(ac, out, t + tt, inst, m, 0.07, vel * gainMul * (tt ? 0.55 : 0.85), { ring: 0.05 });
      } else ksPlay(ac, out, t, inst, m, dur, vel * gainMul, { from, twang, ring });
    }
    st.lastMidi = notes[notes.length - 1];
  };
  INST.sitar = plucked('sitar', 0.75, 1.1, true);
  INST.santoor = plucked('santoor', 0.55, 0.9, false);
  INST.mandolin = plucked('mandolin', 0.6, 0.25, false);
  INST.tanpura = plucked('tanpura', 0.5, 2.8, false);
  INST.guitar = plucked('guitar', 0.6, 0.5, false);
  INST.harp = plucked('harp', 0.5, 1.2, false);

  // Monophonic breath/reed leads with meend (glide), delayed vibrato and breath noise.
  const LEADS = {
    bansuri: { wave: 'flute', a: 0.07, sus: 0.85, r: 0.16, v: 0.16, vib: [5.2, 0.007], glide: 0.09, breath: 0.035, chiff: 0.05, scoop: 0.35 },
    shehnai: { wave: 'reed', a: 0.035, sus: 0.9, r: 0.1, v: 0.17, vib: [6.3, 0.011], glide: 0.11, filter: ['peaking', 1400, 1.2, 6], scoop: 0.9, legato: true },
    clarinet: { wave: 'clarinet', a: 0.03, sus: 0.85, r: 0.09, v: 0.16, vib: [5.4, 0.005], glide: 0.06, filter: ['lowpass', 2600, 0.7], scoop: 0.4, legato: true },
    trumpet: { wave: 'brass', a: 0.025, sus: 0.8, r: 0.08, v: 0.18, vib: [5.6, 0.005], glide: 0.05, filter: ['lowpass', 2900, 0.9], scoop: 1.2 },
    synlead: { type: 'square', a: 0.01, sus: 0.8, r: 0.12, v: 0.11, vib: [5.8, 0.006], glide: 0.07, filter: ['lowpass', 2400, 2], legato: true },
    whistle: { type: 'sine', a: 0.04, sus: 0.9, r: 0.1, v: 0.26, vib: [5.5, 0.008], glide: 0.06 },
    violin: { type: 'sawtooth', a: 0.12, sus: 0.9, r: 0.22, v: 0.16, vib: [5.6, 0.008], glide: 0.12, filter: ['lowpass', 2800, 0.8], legato: true },
    harmonium1: { wave: 'harmonium', a: 0.03, sus: 0.95, r: 0.08, v: 0.19, glide: 0.04, filter: ['lowpass', 2600, 0.6], legato: true },
  };
  function monoLead(cfg) {
    return (ac, out, t, notes, dur, vel, ev, st) => {
      const midi = notes[notes.length - 1], f = mtof(midi);
      const os = osc0(ac);
      if (cfg.wave) os.setPeriodicWave(wave(ac, cfg.wave)); else os.type = cfg.type;
      const fp = os.frequency;
      const leg = cfg.legato && st.lastEnd != null && t - st.lastEnd > -0.05 && t - st.lastEnd < 0.05 + 0.06 * (st.lastDur || 0);
      const from = (ev.glide || leg) && st.lastF ? st.lastF : null;
      if (from && from !== f) { fp.setValueAtTime(from, t); fp.exponentialRampToValueAtTime(f, t + (ev.glide ? cfg.glide * 1.6 : cfg.glide)); }
      else if (cfg.scoop) { fp.setValueAtTime(f * Math.pow(2, -cfg.scoop / 12), t); fp.exponentialRampToValueAtTime(f, t + 0.06); }
      else fp.setValueAtTime(f, t);
      const end = t + dur + cfg.r * 1.3 + 0.03;
      if (cfg.vib && dur > 0.2) {
        const l = osc0(ac); l.frequency.value = cfg.vib[0] * rr(0.94, 1.06);
        const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * cfg.vib[1], t + Math.min(dur, 0.5));
        l.connect(lg); lg.connect(fp); l.start(t); l.stop(end);
      }
      const g = ac.createGain();
      const a = from ? 0.02 : cfg.a, pk = vel * cfg.v;
      g.gain.setValueAtTime(from ? pk * 0.6 : 0, t);
      g.gain.linearRampToValueAtTime(pk, t + a);
      g.gain.setTargetAtTime(pk * cfg.sus, t + a, 0.2);
      g.gain.setTargetAtTime(0, t + dur, cfg.r / 4);
      let node = os;
      if (cfg.filter) { const fl = filt(ac, cfg.filter[0], cfg.filter[1], cfg.filter[2]); if (cfg.filter[3]) fl.gain.value = cfg.filter[3]; os.connect(fl); node = fl; }
      node.connect(g); g.connect(out);
      os.start(t); os.stop(end);
      if (cfg.breath) burst(ac, out, t, { f: Math.min(9000, f * 2.2), q: 1.5, a: 0.02, h: Math.max(0, dur - 0.05), r: 0.06, v: vel * cfg.breath });
      if (cfg.chiff && !from) burst(ac, out, t, { f: Math.min(9000, f * 3), q: 2, r: 0.035, v: vel * cfg.chiff });
      st.lastF = f; st.lastEnd = t + dur; st.lastDur = dur; st.lastMidi = midi;
    };
  }
  for (const k in LEADS) INST[k] = monoLead(LEADS[k]);

  // Polyphonic pads/sections
  function polyEnv(ac, out, t, dur, peak, a, r, sus) {
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (sus != null) g.gain.setTargetAtTime(peak * sus, t + a, 0.3);
    g.gain.setTargetAtTime(0, t + Math.max(a, dur), r / 4);
    return g;
  }
  INST.harmonium = (ac, out, t, notes, dur, vel) => { // two reeds per key, one slightly sharp ("male/female" reed beating)
    const g = polyEnv(ac, out, t, dur, (vel * 0.14) / Math.sqrt(notes.length), 0.05, 0.12, 0.85);
    const lp = filt(ac, 'lowpass', 2300, 0.6, g);
    const end = t + dur + 0.3;
    for (const m of notes) for (const det of [0, 6]) {
      const os = osc0(ac); os.setPeriodicWave(wave(ac, 'harmonium'));
      os.frequency.value = mtof(m); os.detune.value = det + rr(-1.5, 1.5);
      os.connect(lp); os.start(t); os.stop(end);
    }
  };
  INST.strings = (ac, out, t, notes, dur, vel) => { // filmi violin section
    const g = polyEnv(ac, out, t, dur, (vel * 0.075) / Math.sqrt(notes.length), 0.28, 0.55);
    const lp = filt(ac, 'lowpass', 2600, 0.5, g);
    const end = t + dur + 0.7;
    const vib = osc0(ac); vib.frequency.value = 5.3;
    const vg = gain(ac, 9); vib.connect(vg); vib.start(t); vib.stop(end);
    for (const m of notes) for (const det of [-8, 7]) {
      const os = osc0(ac); os.type = 'sawtooth';
      os.frequency.value = mtof(m); os.detune.value = det; vg.connect(os.detune);
      os.connect(lp); os.start(t); os.stop(end);
    }
  };
  INST.brass = (ac, out, t, notes, dur, vel) => { // band trumpets/trombones: scoop + filter "blat"
    const g = polyEnv(ac, out, t, dur, (vel * 0.11) / Math.sqrt(notes.length), 0.025, 0.1, 0.8);
    const lp = filt(ac, 'lowpass', 500, 1.2, g);
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.05); lp.frequency.setTargetAtTime(1700, t + 0.06, 0.12);
    const end = t + dur + 0.2;
    for (const m of notes) for (const det of notes.length >= 3 ? [rr(-6, 6)] : [-6, 6]) {
      const os = osc0(ac); os.setPeriodicWave(wave(ac, 'brass'));
      os.frequency.value = mtof(m);
      os.detune.setValueAtTime(det - 45, t); os.detune.setTargetAtTime(det, t, 0.025);
      os.connect(lp); os.start(t); os.stop(end);
    }
  };
  INST.pad = (ac, out, t, notes, dur, vel) => { // 90s string-machine pad
    const g = polyEnv(ac, out, t, dur, (vel * 0.07) / Math.sqrt(notes.length), 0.35, 0.6);
    const lp = filt(ac, 'lowpass', 1500, 0.8, g);
    const end = t + dur + 0.8;
    for (const m of notes) for (const det of [-11, 10]) {
      const os = osc0(ac); os.type = 'sawtooth'; os.frequency.value = mtof(m); os.detune.value = det;
      os.connect(lp); os.start(t); os.stop(end);
    }
  };
  INST.epiano = (ac, out, t, notes, dur, vel) => { // two-operator FM electric piano (the 90s ballad sound)
    const pk = (vel * 0.16) / Math.sqrt(notes.length);
    const end = t + dur + 0.6;
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.004); g.gain.setTargetAtTime(pk * 0.45, t + 0.01, 0.5); g.gain.setTargetAtTime(0, t + dur, 0.12);
    for (const m of notes) {
      const f = mtof(m);
      const c = osc0(ac); c.frequency.value = f;
      const mod = osc0(ac); mod.frequency.value = f;
      const mg = ac.createGain(); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.35, t, 0.25);
      mod.connect(mg); mg.connect(c.frequency);
      const tine = osc0(ac); tine.frequency.value = f * 14;
      const tg = ac.createGain(); tg.gain.setValueAtTime(f * 1.2, t); tg.gain.setTargetAtTime(0, t, 0.02);
      tine.connect(tg); tg.connect(c.frequency);
      c.connect(g);
      for (const o of [c, mod, tine]) { o.start(t); o.stop(end); }
    }
  };
  INST.bass = (ac, out, t, notes, dur, vel) => { // round plucked bass (film-orchestra / upright-ish)
    const m = notes[0], f = mtof(m);
    const g = polyEnv(ac, out, t, Math.min(dur, 0.9), vel * 0.21, 0.006, 0.12, 0.55);
    const lp = filt(ac, 'lowpass', 900, 0.7, g);
    lp.frequency.setValueAtTime(1400, t); lp.frequency.setTargetAtTime(500, t, 0.12);
    const end = t + Math.min(dur, 0.9) + 0.2;
    const a = osc0(ac); a.type = 'triangle'; a.frequency.value = f;
    const b = osc0(ac); b.frequency.value = f; const bg = gain(ac, 0.7, lp); b.connect(bg);
    a.connect(lp); a.start(t); b.start(t); a.stop(end); b.stop(end);
  };
  INST.synbass = (ac, out, t, notes, dur, vel) => { // resonant 90s synth bass
    const f = mtof(notes[0]);
    const g = polyEnv(ac, out, t, dur, vel * 0.17, 0.004, 0.06, 0.7);
    const lp = filt(ac, 'lowpass', 300, 6, g);
    lp.frequency.setValueAtTime(2400, t); lp.frequency.setTargetAtTime(320, t, 0.06);
    const end = t + dur + 0.12;
    const a = osc0(ac); a.type = 'sawtooth'; a.frequency.value = f;
    a.connect(lp); a.start(t); a.stop(end);
    if (dur > 0.25) { const b = osc0(ac); b.type = 'square'; b.frequency.value = f / 2; const bg = gain(ac, 0.5, lp); b.connect(bg); b.start(t); b.stop(end); }
  };
  INST.stab = (ac, out, t, notes, dur, vel) => { // house-piano/orchestra stab
    INST.epiano(ac, out, t, notes, Math.min(dur, 0.25), vel * 1.2);
    INST.brass(ac, out, t, notes, Math.min(dur, 0.18), vel * 0.6);
  };
  INST.bell = (ac, out, t, notes, dur, vel) => { for (const m of notes) strike(ac, out, t, mtof(m), BELL, vel * 0.18, 1.6); };
  INST.glock = (ac, out, t, notes, dur, vel) => { for (const m of notes) strike(ac, out, t, mtof(m), [[1, 0.5, 1], [2.76, 0.12, 0.4], [5.4, 0.05, 0.2]], vel * 0.34, 0.9); };

  /* ============================================================ drum kits */
  // KITS[kit][stroke](ac, out, t, vel, tuneHz)
  function dayan(ac, out, t, v, f, kind) {
    if (kind === 'ti') {
      burst(ac, out, t, { f: 3000, q: 1.4, a: 0.001, r: 0.03, v: 0.32 * v });
      tone(ac, out, t, { f: f * 2, a: 0.001, r: 0.035, v: 0.1 * v });
      return;
    }
    const parts = kind === 'na' ? [[1, 0.22, 0.3], [2, 0.5, 0.28], [3, 0.32, 0.2], [4.02, 0.18, 0.14]]
      : kind === 'tin' ? [[1, 0.45, 0.26], [2, 0.2, 0.18], [3, 0.07, 0.12]]
        : [[1, 0.75, 0.75], [2, 0.12, 0.35]];
    for (const p of parts) tone(ac, out, t, { f: f * p[0], a: 0.001, r: p[2], v: v * p[1] * 0.5 });
    burst(ac, out, t, { ft: 'highpass', f: 2600, a: 0.001, r: 0.012, v: 0.22 * v });
  }
  function bayan(ac, out, t, v, kind) {
    if (kind === 'ka') {
      burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 650, a: 0.001, r: 0.05, v: 0.6 * v });
      tone(ac, out, t, { f: 150, a: 0.001, r: 0.05, v: 0.25 * v });
      return;
    }
    const os = osc0(ac);
    os.frequency.setValueAtTime(76, t); os.frequency.linearRampToValueAtTime(100, t + 0.16); os.frequency.setTargetAtTime(94, t + 0.18, 0.2);
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.46 * v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.01, 0.13);
    os.connect(g); os.start(t); os.stop(t + 0.75);
    burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 260, a: 0.001, r: 0.05, v: 0.28 * v });
  }
  const KITS = {};
  KITS.tabla = {
    na: (ac, o, t, v, f) => dayan(ac, o, t, v, f, 'na'),
    ta: (ac, o, t, v, f) => dayan(ac, o, t, v, f, 'na'),
    tin: (ac, o, t, v, f) => dayan(ac, o, t, v, f, 'tin'),
    tun: (ac, o, t, v, f) => dayan(ac, o, t, v, f, 'tun'),
    ti: (ac, o, t, v, f) => dayan(ac, o, t, v, f, 'ti'),
    ge: (ac, o, t, v) => bayan(ac, o, t, v, 'ge'),
    ka: (ac, o, t, v) => bayan(ac, o, t, v, 'ka'),
    dha: (ac, o, t, v, f) => { bayan(ac, o, t, v, 'ge'); dayan(ac, o, t, v, f, 'na'); },
    dhin: (ac, o, t, v, f) => { bayan(ac, o, t, v, 'ge'); dayan(ac, o, t, v, f, 'tin'); },
    dhit: (ac, o, t, v, f) => { bayan(ac, o, t, v * 0.8, 'ge'); dayan(ac, o, t, v, f, 'ti'); },
  };
  Object.assign(KITS.tabla, { tu: KITS.tabla.tun, te: KITS.tabla.ti, ra: KITS.tabla.ti, re: KITS.tabla.ti, ri: KITS.tabla.ti, tit: KITS.tabla.ti,
    ghe: KITS.tabla.ge, ga: KITS.tabla.ge, ke: KITS.tabla.ka, ki: KITS.tabla.ka, kat: KITS.tabla.ka, dhi: KITS.tabla.dhin });
  KITS.dholak = {
    D: (ac, o, t, v) => { tone(ac, o, t, { f: 118, f2: 66, glide: 0.08, a: 0.002, r: 0.34, v: 0.7 * v }); burst(ac, o, t, { kind: 'brown', ft: 'lowpass', f: 320, r: 0.06, v: 0.45 * v }); },
    g: (ac, o, t, v) => tone(ac, o, t, { f: 88, f2: 124, glide: 0.15, a: 0.002, r: 0.38, v: 0.5 * v }),
    t: (ac, o, t, v) => { burst(ac, o, t, { f: 1900, q: 1.2, a: 0.001, r: 0.07, v: 0.5 * v }); tone(ac, o, t, { f: 430, a: 0.001, r: 0.06, v: 0.28 * v }); },
    k: (ac, o, t, v) => { burst(ac, o, t, { ft: 'highpass', f: 3500, r: 0.015, v: 0.35 * v }); tone(ac, o, t, { f: 950, a: 0.001, r: 0.02, v: 0.12 * v }); },
    c: (ac, o, t, v) => { burst(ac, o, t, { ft: 'highpass', f: 7000, a: 0.002, r: 0.08, v: 0.2 * v }); strike(ac, o, t, 5200, [[1, 0.5, 1], [1.4, 0.3, 0.7]], 0.04 * v, 0.07); },
  };
  KITS.kit = {
    k: (ac, o, t, v) => { tone(ac, o, t, { f: 150, f2: 45, glide: 0.09, a: 0.001, r: 0.32, v: 0.85 * v }); burst(ac, o, t, { ft: 'highpass', f: 3000, r: 0.006, v: 0.2 * v }); },
    s: (ac, o, t, v) => { tone(ac, o, t, { type: 'triangle', f: 190, f2: 160, a: 0.001, r: 0.1, v: 0.35 * v }); burst(ac, o, t, { ft: 'highpass', f: 1500, q: 0.7, a: 0.001, r: 0.17, v: 0.42 * v }); },
    h: (ac, o, t, v) => burst(ac, o, t, { ft: 'highpass', f: 7500, a: 0.001, r: 0.035, v: 0.2 * v }),
    o: (ac, o, t, v) => burst(ac, o, t, { ft: 'highpass', f: 7000, a: 0.001, r: 0.26, v: 0.17 * v }),
    c: (ac, o, t, v) => { for (let k = 0; k < 3; k++) burst(ac, o, t + k * 0.011, { f: 1200, q: 1, a: 0.001, r: k === 2 ? 0.12 : 0.015, v: 0.8 * v }); },
    t: (ac, o, t, v) => tone(ac, o, t, { f: 165, f2: 110, glide: 0.12, a: 0.001, r: 0.25, v: 0.5 * v }),
    r: (ac, o, t, v) => burst(ac, o, t, { ft: 'highpass', f: 5000, a: 0.008, r: 0.05, v: 0.14 * v }),
    x: (ac, o, t, v) => { burst(ac, o, t, { ft: 'highpass', f: 4500, a: 0.002, r: 1.3, v: 0.22 * v }); strike(ac, o, t, 1150, METAL, 0.05 * v, 0.9); },
  };
  KITS.band = { // Hyderabadi band-baaja + teenmaar
    B: (ac, o, t, v) => { tone(ac, o, t, { f: 105, f2: 50, glide: 0.12, a: 0.002, r: 0.5, v: 0.8 * v }); burst(ac, o, t, { kind: 'brown', ft: 'lowpass', f: 450, r: 0.1, v: 0.5 * v }); burst(ac, o, t, { f: 1800, q: 1, r: 0.01, v: 0.15 * v }); },
    S: (ac, o, t, v) => { tone(ac, o, t, { type: 'triangle', f: 210, a: 0.001, r: 0.08, v: 0.3 * v }); burst(ac, o, t, { ft: 'highpass', f: 1700, q: 0.5, a: 0.001, r: 0.22, v: 0.45 * v }); },
    R: (ac, o, t, v) => { for (let k = 0; k < 4; k++) burst(ac, o, t + k * 0.035, { ft: 'highpass', f: 1800, q: 0.5, a: 0.001, r: 0.06, v: (0.15 + k * 0.05) * v }); },
    C: (ac, o, t, v) => { burst(ac, o, t, { ft: 'highpass', f: 5200, a: 0.002, r: 1.5, v: 0.26 * v }); strike(ac, o, t, 1100, METAL, 0.06 * v, 1.0); },
    M: (ac, o, t, v) => { tone(ac, o, t, { f: 145, f2: 92, glide: 0.08, a: 0.002, r: 0.25, v: 0.65 * v }); burst(ac, o, t, { f: 700, q: 1, a: 0.001, r: 0.08, v: 0.45 * v }); },
    P: (ac, o, t, v) => { burst(ac, o, t, { f: 1150, q: 1.8, a: 0.001, r: 0.09, v: 0.7 * v }); tone(ac, o, t, { f: 390, a: 0.001, r: 0.09, v: 0.35 * v }); burst(ac, o, t, { ft: 'highpass', f: 4000, r: 0.01, v: 0.25 * v }); },
    p: (ac, o, t, v) => burst(ac, o, t, { f: 1250, q: 1.8, a: 0.001, r: 0.05, v: 0.3 * v }),
    T: (ac, o, t, v) => { burst(ac, o, t, { f: 2500, q: 2, a: 0.001, r: 0.05, v: 0.42 * v }); tone(ac, o, t, { f: 610, a: 0.001, r: 0.05, v: 0.2 * v }); },
  };
  KITS.dhol = {
    D: (ac, o, t, v) => { tone(ac, o, t, { f: 98, f2: 58, glide: 0.1, a: 0.002, r: 0.42, v: 0.8 * v }); burst(ac, o, t, { kind: 'brown', ft: 'lowpass', f: 380, r: 0.07, v: 0.5 * v }); },
    t: (ac, o, t, v) => { burst(ac, o, t, { f: 2300, q: 2, a: 0.001, r: 0.05, v: 0.45 * v }); tone(ac, o, t, { f: 520, a: 0.001, r: 0.05, v: 0.2 * v }); },
    R: (ac, o, t, v) => { for (let k = 0; k < 4; k++) burst(ac, o, t + k * 0.03, { f: 2300, q: 2, a: 0.001, r: 0.04, v: (0.2 + k * 0.05) * v }); },
  };
  KITS.clap = { // qawwali ensemble claps
    x: (ac, o, t, v) => { for (let k = 0; k < 5; k++) burst(ac, o, t + rr(0, 0.018), { f: rr(950, 1500), q: 1.1, a: 0.001, r: 0.05, v: 0.5 * v }); },
    X: (ac, o, t, v) => { for (let k = 0; k < 8; k++) burst(ac, o, t + rr(0, 0.022), { f: rr(900, 1600), q: 1.1, a: 0.001, r: 0.055, v: 0.48 * v }); },
  };

  // Drum-stroke cache: each stroke is synthesised once (2 variants) into a mono AudioBuffer with an
  // OfflineAudioContext, so a hit costs one buffer source + gain instead of 3-9 live nodes. Until a
  // stroke's buffers exist it is synthesised live (and its render is queued).
  const DRUMS = new Map();
  const drumQueue = [];
  let drumBusy = false;
  function drumKey(kit, stroke, tune) { return kit + '.' + stroke + (kit === 'tabla' ? '@' + Math.round(tune) : ''); }
  let drumCacheOff = false;
  function queueDrum(kit, stroke, tune, sr) {
    const key = drumKey(kit, stroke, tune);
    if (DRUMS.has(key) || !OAC || drumCacheOff) return;
    DRUMS.set(key, null);
    drumQueue.push([key, KITS[kit][stroke], tune, sr]);
    if (!drumBusy) pumpDrums();
  }
  function pumpDrums() {
    const job = drumQueue.shift();
    if (!job) { drumBusy = false; return; }
    drumBusy = true;
    const [key, fn, tune, sr] = job;
    const bufs = [];
    const one = () => {
      const len = Math.ceil(sr * 1.9);
      const oc = new OAC(1, len, sr);
      try { fn(oc, oc.destination, 0, 1, tune); } catch (e) { return Promise.reject(e); }
      const pr = oc.startRendering();
      if (!pr || typeof pr.then !== 'function') { drumCacheOff = true; return Promise.reject(new Error('no promise-based OfflineAudioContext')); }
      return pr.then((b) => {
        const d = b.getChannelData(0);
        let end = d.length - 1;
        while (end > 64 && Math.abs(d[end]) < 2e-4) end--;
        const n = Math.min(d.length, end + 64);
        const o = oc.createBuffer(1, n, sr);
        const od = o.getChannelData(0);
        for (let i = 0; i < n; i++) od[i] = d[i] * (i > n - 64 ? (n - i) / 64 : 1);
        bufs.push(o);
      });
    };
    one().then(one).then(() => { DRUMS.set(key, bufs); }, () => { DRUMS.delete(key); })
      .then(() => setTimeout(pumpDrums, 8));
  }
  function drumHit(ac, out, t, kit, stroke, vel, tune) {
    const K = KITS[kit], fn = K && K[stroke];
    if (!fn) return;
    const bufs = DRUMS.get(drumKey(kit, stroke, tune));
    if (bufs && bufs.length && bufs[0].sampleRate === ac.sampleRate) {
      const s = ac.createBufferSource(); s.buffer = bufs[(rnd() * bufs.length) | 0];
      s.playbackRate.value = rr(0.988, 1.012);
      const g = gain(ac, vel, out);
      s.connect(g); s.start(t);
      return;
    }
    fn(ac, out, t, vel, tune);
    queueDrum(kit, stroke, tune, ac.sampleRate);
  }
  function warmDrums(sr) { // pre-render the common strokes after unlock
    for (const kit in KITS) for (const st in KITS[kit]) if (kit !== 'tabla') queueDrum(kit, st, 0, sr);
    for (const id of ['title', 'day', 'night', 'oldcity', 'ending']) { const tune = compile(id).tune; for (const st of ['dha', 'ge', 'na', 'ti', 'ka', 'dhin', 'tun', 'tin']) queueDrum('tabla', st, tune, sr); }
  }

  /* ============================================================ score notation + compiler */
  // A track = { name, bpm, root (MIDI of Sa/tonic), scale, meter (16ths per bar: 16 = 4/4, 12 = 6/8 or 3/4),
  //   swing, gain, loop (default true), loopTo (index into order), tape, parts: {name: cfg}, sections: {name: sec}, order: [...] }
  // part cfg = { inst | kit, type: 'note' (default) | 'chord' | 'drums', div (16ths per token), oct, vol, pan, rev, trem }
  // sec = { bars, bpm (number | [from, to] ritardando), tp (transpose semis), cdiv (chord token div, default 4),
  //   chords: 'tokens', vol: {part: mul}, <partName>: 'tokens' }   (part strings repeat cyclically to fill the section)
  // Tokens (space separated, '|' is just a bar marker):
  //   note parts:  1..7 scale degree, ^ / _ prefix = octave up/down, b/# suffix = flat/sharp, ~ prefix = meend glide,
  //                r t f s o = root/third/fifth/seventh/octave of the current chord, ! accent, ? ghost,
  //                '-' extends the previous note, '.' rest.
  //   chord parts: 'x' plays the current chord (voice-led around the part's octave), '-' hold, '.' rest.
  //   chords:      degree[b|#][:quality]  (no quality = diatonic triad of the scale). Qualities: M m 7 m7 M7 s4 s2 d a 5 6 add9
  //   drum parts:  stroke names of the kit, '+' to layer (k+h), '.' rest.
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], kafi: [0, 2, 3, 5, 7, 9, 10], bhairavi: [0, 1, 3, 5, 7, 8, 10],
    yaman: [0, 2, 4, 6, 7, 9, 11], khamaj: [0, 2, 4, 5, 7, 9, 10], bhairav: [0, 1, 4, 5, 7, 8, 11],
    kirwani: [0, 2, 3, 5, 7, 8, 11], charukesi: [0, 2, 4, 5, 7, 8, 10], minor: [0, 2, 3, 5, 7, 8, 10],
  };
  const QUAL = { M: [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], s4: [0, 5, 7], s2: [0, 2, 7],
    d: [0, 3, 6], a: [0, 4, 8], 5: [0, 7], 6: [0, 4, 7, 9], add9: [0, 4, 7, 14] };
  const toks = (s) => String(s || '').replace(/\|/g, ' ').trim().split(/\s+/).filter(Boolean);
  const degSemi = (scale, deg) => { const d = deg - 1, o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return scale[i] + 12 * o; };
  const NOTE_RE = /^(~)?([\^_]*)([1-7]|[rtfso])([b#]?)([!?]?)$/;
  const CHORD_RE = /^([1-7])([b#]?)(?::(\w+))?$/;

  function parseChord(tok, scale) {
    const m = CHORD_RE.exec(tok);
    if (!m) return null;
    const deg = +m[1], acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
    const root = degSemi(scale, deg) + acc;
    let iv;
    if (m[3] && QUAL[m[3]]) iv = QUAL[m[3]].slice();
    else iv = [0, degSemi(scale, deg + 2) - degSemi(scale, deg), degSemi(scale, deg + 4) - degSemi(scale, deg)];
    return { root: ((root % 12) + 12) % 12, iv };
  }
  function chordTone(ch, letter) {
    if (!ch) return 0;
    const iv = ch.iv;
    switch (letter) {
      case 'r': return ch.root;
      case 't': return ch.root + (iv[1] != null ? iv[1] : 4);
      case 'f': return ch.root + (iv[2] != null ? iv[2] : 7);
      case 's': return ch.root + (iv[3] != null ? iv[3] : 10);
      default: return ch.root + 12;
    }
  }
  function voiceChord(ch, center) {
    const out = [];
    for (const v of ch.iv) {
      let m = center - 6 + ((((ch.root + v - (center - 6)) % 12) + 12) % 12);
      if (v >= 12) m += 12;
      out.push(m);
    }
    return out.sort((a, b) => a - b);
  }

  const COMPILED = new Map();
  function resolveTrack(id) {
    const tr = typeof id === 'string' ? TRACKS[id] : id;
    if (!tr) return null;
    if (!tr.base) return tr;
    const b = resolveTrack(tr.base);
    const parts = {};
    // re-voicing (story layer): voice {part: cfg overrides}, addParts {name: cfg}, addPat {section|'*': {part: pattern}}
    for (const k in b.parts) if (!(tr.mute || []).includes(k)) parts[k] = tr.voice && tr.voice[k] ? Object.assign({}, b.parts[k], tr.voice[k]) : b.parts[k];
    if (tr.addParts) Object.assign(parts, tr.addParts);
    let sections = b.sections;
    if (tr.addPat) { sections = {}; for (const sn in b.sections) sections[sn] = Object.assign({}, b.sections[sn], tr.addPat['*'] || {}, tr.addPat[sn] || {}); }
    return Object.assign({}, b, tr, { parts, sections, base: null });
  }
  function compile(id) {
    const key = typeof id === 'string' ? id : id.id || id.name;
    if (COMPILED.has(key)) return COMPILED.get(key);
    const tr = resolveTrack(id);
    const meter = tr.meter || 16, scale = SCALES[tr.scale] || SCALES.major;
    const order = tr.order;
    let total = 0;
    const secStart = [];
    for (const name of order) { secStart.push(total); total += tr.sections[name].bars * meter; }
    const events = new Array(total);
    const chords = new Array(total); // absolute chord per step (for tools/audits)
    const times = new Float64Array(total + 1);
    // timing (per-section bpm, optional ritardando)
    let tt = 0, s = 0;
    order.forEach((name) => {
      const sec = tr.sections[name], len = sec.bars * meter;
      const b0 = Array.isArray(sec.bpm) ? sec.bpm[0] : sec.bpm || tr.bpm, b1 = Array.isArray(sec.bpm) ? sec.bpm[1] : b0;
      for (let i = 0; i < len; i++) { times[s++] = tt; tt += 60 / U.lerp(b0, b1, i / len) / 4; }
    });
    times[total] = tt;
    order.forEach((name, si) => {
      const sec = tr.sections[name], len = sec.bars * meter, base0 = secStart[si];
      const tp = sec.tp || 0;
      // chord timeline
      const chordAt = new Array(len).fill(null);
      if (sec.chords) {
        const ct = toks(sec.chords), cd = sec.cdiv || 4;
        let cur = null;
        for (let i = 0, st = 0; st < len; i++, st += cd) {
          const tk = ct[i % ct.length];
          if (tk !== '-' && tk !== '.') cur = parseChord(tk, scale) || cur;
          for (let k = 0; k < cd && st + k < len; k++) chordAt[st + k] = cur;
        }
      }
      for (let k = 0; k < len; k++) chords[base0 + k] = chordAt[k] ? { pc: (((chordAt[k].root + tr.root + tp) % 12) + 12) % 12, iv: chordAt[k].iv } : null;
      for (const pname in tr.parts) {
        const pat = sec[pname];
        if (!pat) continue;
        const cfg = tr.parts[pname];
        const type = cfg.type || (cfg.kit ? 'drums' : 'note');
        const div = (sec.div && sec.div[pname]) || cfg.div || (type === 'drums' ? 1 : type === 'chord' ? 4 : 2);
        const tk = toks(pat);
        if (!tk.length) continue;
        const vmul = (sec.vol && sec.vol[pname] != null ? sec.vol[pname] : 1);
        const baseMidi = tr.root + tp + (cfg.oct || 0) * 12;
        let last = null;
        for (let i = 0, st = 0; st < len; i++, st += div) {
          const t = tk[i % tk.length];
          if (t === '-') { if (last) last.dur += div; continue; }
          last = null;
          if (t === '.') continue;
          let ev = null;
          let vel = vmul;
          if (type === 'drums') {
            let core = t;
            if (/[!?]$/.test(core)) { vel *= core.endsWith('!') ? 1.3 : 0.5; core = core.slice(0, -1); }
            ev = { k: 'd', strokes: core.split('+'), vel };
          } else if (type === 'chord') {
            const ch = chordAt[st];
            if (!ch) continue;
            const center = baseMidi + 5;
            let notes = voiceChord({ root: ch.root + tr.root + tp, iv: ch.iv }, center); // absolute pitch classes
            if (cfg.bassNote) notes = [baseMidi - 12 + ch.root].concat(notes);
            ev = { k: 'n', notes, vel: vel * (t === 'X' ? 1.25 : 1) };
          } else {
            const m = NOTE_RE.exec(t);
            if (!m) continue;
            let oct = 0;
            for (const c of m[2]) oct += c === '^' ? 1 : -1;
            let semi;
            if (/[rtfso]/.test(m[3])) semi = chordTone(chordAt[st], m[3]);
            else semi = degSemi(scale, +m[3]);
            semi += (m[4] === 'b' ? -1 : m[4] === '#' ? 1 : 0) + oct * 12;
            if (m[5]) vel *= m[5] === '!' ? 1.3 : 0.55;
            ev = { k: 'n', notes: [baseMidi + semi], vel, glide: !!m[1] };
          }
          ev.part = pname; ev.dur = div;
          const at = base0 + st;
          (events[at] || (events[at] = [])).push(ev);
          last = ev;
        }
      }
    });
    // tremolo flags for long mandolin notes etc.
    for (const evs of events) if (evs) for (const ev of evs) { const cfg = tr.parts[ev.part]; if (cfg.trem && ev.dur >= cfg.trem) ev.trem = true; }
    const loop = tr.loop !== false;
    const loopTo = loop ? secStart[tr.loopTo || 0] : -1;
    const c = { id: key, name: tr.name, tr, meter, total, times, events, chords, loopStep: loopTo, parts: tr.parts,
      tune: mtof(60 + (((tr.root % 12) + 12) % 12)), swing: tr.swing || 0, gain: tr.gain == null ? 1 : tr.gain,
      duration: times[total], loopDur: loop ? times[total] - times[loopTo] : 0, secStart };
    COMPILED.set(key, c);
    return c;
  }

  /* ============================================================ sequencer */
  // Seq plays a compiled track into `dest`, scheduling ahead of ac.currentTime. Part buses are
  // created once per Seq (gain/pan/reverb-send) and torn down after it stops.
  class Seq {
    constructor(ac, id, dest, o) {
      o = o || {};
      this.ac = ac; this.c = compile(id); this.id = this.c.id;
      this.out = gain(ac, 0, dest);
      const t = o.startTime != null ? o.startTime : ac.currentTime + 0.06;
      const vol = (o.vol == null ? 1 : o.vol) * this.c.gain;
      this.out.gain.setValueAtTime(0, t);
      this.out.gain.linearRampToValueAtTime(vol, t + (o.fadeIn || 0.02));
      this.vol = vol;
      this.parts = {};
      for (const k in this.c.parts) {
        const cfg = this.c.parts[k];
        const pg = gain(ac, cfg.vol == null ? 0.8 : cfg.vol);
        const pn = panner(ac, this.out);
        if (cfg.pan) pn.pan.value = cfg.pan;
        pg.connect(pn);
        if (cfg.rev && o.revIn) { const sg = gain(ac, cfg.rev, o.revIn); pn.connect(sg); }
        this.parts[k] = { cfg, g: pg, st: {}, pn };
      }
      this.step = o.offsetStep || 0;
      this.t0 = t - this.c.times[this.step];
      this.loop = o.loop == null ? this.c.loopStep >= 0 : o.loop && this.c.loopStep >= 0;
      this.maxPasses = o.maxPasses || 0;
      this.passes = 0;
      this.done = false; this.stopped = false;
      this.endTime = Infinity;
      this.onEnd = o.onEnd || null;
      this.live = !!o.live;
    }
    timeOf(step) { return this.t0 + this.c.times[step]; }
    schedule(until) {
      if (this.done) return;
      const c = this.c, now = this.ac.currentTime;
      if (this.live && this.timeOf(this.step) < now - 1) this.t0 = now + 0.05 - c.times[this.step]; // resync after a stall
      let guard = 0;
      while (!this.done && guard++ < 4096) {
        const ts = this.timeOf(this.step);
        if (ts >= until) break;
        if (ts >= now - 0.05) this.play(this.step, ts);
        this.step++;
        if (this.step >= c.total) {
          this.passes++;
          if (this.loop && (!this.maxPasses || this.passes < this.maxPasses)) {
            this.t0 += c.times[c.total] - c.times[c.loopStep];
            this.step = c.loopStep;
          } else {
            this.done = true;
            this.endTime = this.t0 + c.times[c.total];
          }
        }
      }
    }
    play(step, t) {
      const evs = this.c.events[step];
      if (!evs) return;
      const c = this.c, ac = this.ac;
      const sd = c.times[Math.min(c.total, step + 1)] - c.times[step];
      if (c.swing && step % 4 === 2) t += c.swing * sd;
      for (const ev of evs) {
        const p = this.parts[ev.part];
        if (!p) continue;
        const vel = ev.vel * rr(0.9, 1.04);
        try {
          if (ev.k === 'd') {
            for (const s of ev.strokes) drumHit(ac, p.g, t, p.cfg.kit, s, vel, c.tune);
          } else {
            const endStep = step + ev.dur;
            const dur = endStep <= c.total ? c.times[endStep] - c.times[step] : sd * ev.dur;
            const fn = INST[p.cfg.inst];
            if (fn) fn(ac, p.g, t + (p.cfg.type === 'chord' ? 0 : rr(0, 0.006)), ev.notes, dur * (p.cfg.gate || 0.95), vel, ev, p.st);
          }
        } catch (e) { N.err('audio.seq.' + this.id, e); }
      }
    }
    stop(fade) {
      if (this.stopped) return;
      this.stopped = true; this.done = true;
      const t = this.ac.currentTime, g = this.out.gain;
      fade = fade == null ? 1 : fade;
      try {
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
      } catch (e) { /* ignore */ }
      this.released = false;
      this.release(fade + 4);
    }
    // free the part buses once the tail has rung out (natural end or after stop)
    release(after) {
      if (this.released) return;
      this.released = true;
      const out = this.out, parts = this.parts;
      const ms = (after != null ? after : Math.max(0, this.endTime - this.ac.currentTime) + 4) * 1000;
      setTimeout(() => { try { out.disconnect(); for (const k in parts) parts[k].pn.disconnect(); } catch (e) { /* ignore */ } }, ms);
    }
  }

  /* ============================================================ the score (all original) */
  const R = (s, n) => Array(n).fill(s).join(' | ');
  const sec = (base, over) => Object.assign({}, base, over);
  // shared rhythms
  const KEHERWA = 'dha ge na ti na ka dhi na';
  const KEH_FILL = 'dha ti ra ki ta ka dha .';
  const DADRA = 'dha dhi na dha tu na';
  // Title leitmotif ("Yaadon Ki Gully") — reprised in the Charminar ending
  const T_CH_A = '1 - - - | 6b:M - - - | 4 - - - | 4:m - - - | 1 - - - | 6:m - - - | 2:m - 5 - | 1 - - -';
  const T_MEL_A = '5 - - 3 5 - ^1 - | ^1 - - - 6b - 5 - | 4 - 5 - 6 - 5 4 | 6b - - 5 4 - 3 - | 3 - 5 - ^1 - ^2 - | ^3 - - ^2 ^1 - 7 - | ^1 - 7 6 5 - 7 - | ^1 - - - - - . .';
  const T_CH_B = '6:m - - - | 3:m - - - | 4 - - - | 1 - - - | 6:m - - - | 3:m - - - | 4 - 5 - | 5:s4 - - 5';
  const T_MEL_B = '6 - - 5 6 - ^1 - | 7 - ^1 7 6 - 3 - | 4 - 6 - ^1 - 6 - | 5 - - - 3 - - - | 6 - ^1 - ^3 - - ^2 | 7 - - ^1 7 - 5 - | 6 - 5 4 5 - 7 - | ^2 - - - ^1 - 7 -';

  const TRACKS = {};

  TRACKS.title = {
    name: 'Yaadon Ki Gully', bpm: 76, root: 62, scale: 'major', meter: 16, loopTo: 1, gain: 0.95,
    parts: {
      drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.55, rev: 0.3, pan: -0.1 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: 0, vol: 0.8, rev: 0.25, pan: 0.1 },
      str: { type: 'chord', inst: 'strings', div: 4, oct: 0, vol: 0.85, rev: 0.45 },
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 0.6, rev: 0.3, pan: -0.3 },
      flute: { inst: 'bansuri', div: 2, oct: 0, vol: 0.85, rev: 0.4, pan: 0.15 },
      bass: { inst: 'bass', div: 4, oct: -2, vol: 0.6 },
      tabla: { kit: 'tabla', div: 2, vol: 0.75, rev: 0.12, pan: 0.2 },
    },
    sections: {
      intro: { bars: 4, chords: '1 - - - | 6b:M - - - | 4 - - - | 5:s4 - 5 -', drone: '5 ^1 ^1 1', pad: 'x - - - | x - - - | x - - - | x - x -',
        sitar: '1 - - ~2 3 - - - | 5 - - - ~6b - 5 - | 4 - 3 - ~4 - - - | 2 - - - 5 - - -' },
      A: { bars: 8, chords: T_CH_A, drone: '5 ^1 ^1 1', pad: 'x - - -', bass: 'r - - -', sitar: 'r . f . o . f .', flute: T_MEL_A,
        tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL, vol: { tabla: 0.6 } },
      B: { bars: 8, chords: T_CH_B, drone: '5 ^1 ^1 1', pad: 'x - - -', bass: 'r - f -', sitar: 'r t f t o f t f', flute: T_MEL_B,
        str: 'x - - -', tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL },
      A2: { bars: 8, chords: T_CH_A, drone: '5 ^1 ^1 1', pad: 'x - - -', str: 'x - - -', bass: 'r - f -', sitar: 'r t f o f t f t', flute: T_MEL_A,
        tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL },
      tag: { bars: 2, chords: '1 - - - | 1 - - -', drone: '5 ^1 ^1 1', pad: 'x - - - | x - - -', flute: '^1 - - - - - - - | . . . . . . . .',
        sitar: '5 - 3 - 2 - 1 - | 1 - - - . . . .' },
    },
    order: ['intro', 'A', 'B', 'A2', 'tag'],
  };

  TRACKS.flashback = { base: 'title', name: 'Purani Cassette', bpm: 66, mute: ['tabla', 'bass', 'str'], tape: 0.7, gain: 0.85 };

  const DAY_MEL = '5 - 5 6 5 3 2 3 | 5 - - - . . 3 5 | 7 - 7 ^1 7 6 5 6 | 7 - - - . . 6 7 | ^1 - 6 5 4 - 5 6 | 4 - - 3 2 - - - | 2 - 2 3 4 - 2 _7 | 1 - - - . . . .';
  TRACKS.day = {
    name: 'Cycle Pe Sawaari', bpm: 108, root: 55, scale: 'khamaj', meter: 16, loopTo: 1, gain: 0.85, roam: true,
    parts: {
      dholak: { kit: 'dholak', div: 2, vol: 0.7, rev: 0.1, pan: 0.15 },
      shaker: { kit: 'kit', div: 1, vol: 0.5, pan: -0.3 },
      bass: { inst: 'bass', div: 2, oct: -1, vol: 0.75 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: 1, vol: 0.55, rev: 0.2, pan: -0.15 },
      mando: { inst: 'mandolin', div: 2, oct: 1, vol: 0.55, rev: 0.2, pan: -0.35, trem: 4 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.8, rev: 0.3, pan: 0.2 },
      shehnai: { inst: 'shehnai', div: 2, oct: 1, vol: 0.75, rev: 0.3, pan: 0.15 },
    },
    sections: {
      intro: { bars: 2, chords: '1 - - - | 7 - - -', dholak: 'D c t c D D t c', bass: 'r . . r . . f .', mando: 'r t f t o f t f', shaker: 'r . r r r . r r' },
      A: { bars: 8, chords: '1 - - - | 1 - - - | 7 - - - | 7 - - - | 4 - - - | 4 - - - | 2 - 7 - | 1 - - -',
        dholak: 'D c t c D D t c', shaker: 'r . r r r . r r', bass: 'r . . r . . f .', pad: 'x - x -', mando: 'r . f . o . f .', flute: DAY_MEL, vol: { mando: 0.7 } },
      B: { bars: 8, chords: '4 - - - | 1 - - - | 4 - - - | 1 - - - | 2 - - - | 7 - - - | 4 - 5:M - | 5:M - - -',
        dholak: R('D c t c D D t c', 7) + ' | D t D t D t t t', shaker: 'r . r r r . r r', bass: 'r . . r . . f .', pad: 'x - x -', mando: 'r t f t r t f t',
        shehnai: '^1 - - 6 ^1 - ^2 ^1 | 5 - 3 - 5 - - - | 6 - - 5 6 - ^1 6 | 5 - 3 2 1 - - - | 2 - 4 - 6 - 4 2 | 4 - - 2 _7 - 2 4 | ^1 - 6 - 5 - 7# - | 2 - - - 7# - 5 -' },
      brk: { bars: 4, chords: '1 - - - | 7 - - - | 4 - - - | 5:M - - -', dholak: 'D . t D . t D t', bass: 'r . . r . . f .', pad: 'x - - -',
        mando: '5 - 6 5 3 - 2 3 | 7 - ^1 7 6 - 5 6 | ^1 - 6 5 4 - 3 4 | 5 - 7# - ^2 - 7# -' },
    },
    order: ['intro', 'A', 'B', 'brk', 'A'],
  };

  // District re-voicings of `day` (systems §12.4): HITEC City in 90s synths, Secunderabad as a cantonment band.
  TRACKS.hitec = {
    base: 'day', name: 'Cycle Pe Sawaari (Cyber Towers Mix)', bpm: 112, gain: 0.8, mute: ['dholak'],
    voice: { flute: { inst: 'synlead', vol: 0.7 }, shehnai: { inst: 'synlead', vol: 0.62 }, mando: { inst: 'epiano', vol: 0.55 }, pad: { inst: 'pad', vol: 0.5 }, bass: { inst: 'synbass', vol: 0.7 } },
    addParts: { dm: { kit: 'kit', div: 1, vol: 0.62 } },
    addPat: { '*': { dm: 'k . h . s . h . k k h . s . h h' }, intro: { dm: 'k . h . k . h . k . h . k . h h' }, brk: { dm: 'k . . . s . . . k . k . s . s s' } },
  };
  TRACKS.cantonment = {
    base: 'day', name: 'Cycle Pe Sawaari (Cantonment Band)', bpm: 100, gain: 0.82, mute: ['dholak', 'shaker'],
    voice: { flute: { inst: 'clarinet', vol: 0.82 }, shehnai: { inst: 'clarinet', vol: 0.7 }, mando: { inst: 'guitar', vol: 0.45 }, pad: { inst: 'brass', vol: 0.35 } },
    addParts: { snare: { kit: 'band', div: 1, vol: 0.55, pan: 0.1 } },
    addPat: { '*': { snare: 'B . S . . S S . B . S . R . S .' }, intro: { snare: 'R . R . R . R . R . R . R R R R' } },
  };

  TRACKS.night = {
    name: 'Chandni Chhat', bpm: 72, root: 57, scale: 'yaman', meter: 12, loopTo: 0, gain: 0.9, roam: true,
    parts: {
      drone: { inst: 'tanpura', div: 3, oct: -1, vol: 0.45, rev: 0.4 },
      str: { type: 'chord', inst: 'strings', div: 6, oct: 0, vol: 0.75, rev: 0.5 },
      santoor: { inst: 'santoor', div: 2, oct: 1, vol: 0.45, rev: 0.45, pan: -0.3 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.75, rev: 0.5, pan: 0.15 },
      tabla: { kit: 'tabla', div: 2, vol: 0.5, rev: 0.2, pan: 0.2 },
      bass: { inst: 'bass', div: 6, oct: -1, vol: 0.5 },
    },
    sections: {
      A: { bars: 8, cdiv: 6, chords: '1 - | 2 - | 1 - | 2 - | 6 - | 3 - | 2 - | 5 -', drone: '5 ^1 ^1 1', str: 'x -', bass: 'r f',
        santoor: 'r f o ^t o f', flute: '3 - - 5 - 3 | 4 - - 6 - 5 | 3 - 2 1 - 3 | 2 - - - - - | 6 - - ^1 - 7 | 5 - - 3 - 5 | 6 - 4 - 2 - | 5 - - - - -', tabla: DADRA, vol: { tabla: 0.7 } },
      B: { bars: 8, cdiv: 6, chords: '6 - | 3 - | 2 - | 1 - | 6 - | 5 - | 2 - | 5:s4 5', drone: '5 ^1 ^1 1', str: 'x -', bass: 'r f',
        santoor: 'r . o . ^t .', flute: '^1 - - 7 - 6 | 7 - - 5 - 3 | 4 - 6 - ^2 - | ^1 - - - 5 - | 6 - ^1 - ^3 - | ^2 - - 7 - 5 | 6 - 4 - 2 - | ^1 - - 7 - -', tabla: DADRA },
      A2: { bars: 8, cdiv: 6, chords: '1 - | 2 - | 1 - | 2 - | 6 - | 3 - | 2 - | 5 -', drone: '5 ^1 ^1 1', str: 'x -', bass: 'r f',
        santoor: 'r f o ^t ^f ^t', flute: '3 - - 5 - 3 | 4 - - 6 - 5 | 3 - 2 1 - 3 | 2 - - - - - | 6 - - ^1 - 7 | 5 - - 3 - 5 | 6 - 4 - 2 - | 5 - - - - -', tabla: DADRA },
    },
    order: ['A', 'B', 'A2', 'B'],
  };

  TRACKS.chase = {
    name: 'Chappal Meter Full!', bpm: 150, root: 52, scale: 'bhairav', meter: 16, loopTo: 0, gain: 0.8,
    parts: {
      kit: { kit: 'kit', div: 1, vol: 0.7 },
      dhol: { kit: 'dhol', div: 1, vol: 0.7, pan: 0.2 },
      bass: { inst: 'synbass', div: 1, oct: -1, vol: 0.75 },
      brass: { type: 'chord', inst: 'brass', div: 2, oct: 1, vol: 0.6, rev: 0.15, pan: -0.2 },
      shehnai: { inst: 'shehnai', div: 2, oct: 1, vol: 0.8, rev: 0.2, pan: 0.1 },
      str: { type: 'chord', inst: 'strings', div: 16, oct: 1, vol: 0.5, rev: 0.3 },
    },
    sections: {
      A: { bars: 8, cdiv: 16, chords: '1:M | 2:M | 1:M | 2:M | 4:m | 4:m | 2:M | 1:M', kit: 'k . h . s . h . k k h . s . h h', dhol: 'D . t . . t D . D . t . . t t t',
        bass: 'r . r r . r r . r . r r . r o .', brass: 'x . . x . . x .',
        shehnai: '1 2 3 2 1 - _7 1 | 2 - 3 4 3 2 1 - | 1 2 3 4 5 - 4 3 | 2 - - - - - . . | 4 - 5 6 5 - 4 3 | 4 - 3 2 1 - - - | 2 3 2 1 _7 - 1 2 | 1 - - - - - . .' },
      B: { bars: 8, cdiv: 16, chords: '4:m | 4:m | 2:M | 2:M | 4:m | 4:m | 2:M | 1:M', kit: 'k . h . s . h . k k h . s . h h',
        dhol: R('D . t . . t D . D . t . . t t t', 7) + ' | D . t . D . t . R . R . R . R .', bass: 'r . r r . r r . r . r r . r o .', brass: '. . x . . . x x',
        shehnai: '4 - - 6 ^1 - 7 6 | ^1 - 6 5 6 - 4 - | 2 - 4 6 ^2 - ^1 7 | 6 - - - 4 - 2 - | 4 5 6 7 ^1 - 7 6 | 7 6 5 4 3 - 4 - | 2 - 3 4 3 - 2 - | 1 - - - _7 - 1 -' },
    },
    order: ['A', 'B', 'A'],
  };
  TRACKS.chase.sections.A2 = sec(TRACKS.chase.sections.A, { str: 'x' });
  TRACKS.chase.order = ['A', 'B', 'A2'];

  const OC_A = { bars: 8, chords: '1 - - - | 1 - - - | 7 - - - | 7 - - - | 3 - - - | 4 - - - | 5 - - - | 1 - - -',
    claps: 'x . . x . . x .', dholak: 'D c t D c t D t', bass: 'r . . r . . f .', hc: 'x . x x',
    hl: '5 - 5 4 3 - 2 1 | 3 - 2 - 1 - - - | _7 - 1 2 3 - 2 - | 2 - 1 - _7 - - - | 3 - 5 - 7 - 5 - | 4 - 6 - ^1 - 6 - | 5 - 7 - ^2 - ^1 7 | ^1 - - - - - . .',
    sh: '. . . . . . . . | . . . . 5 - 3 - | . . . . . . . . | . . . . 3 - 2 - | . . . . . . . . | . . . . 6 - 5 - | . . . . . . . . | . . . . 5 - ^1 -' };
  TRACKS.oldcity = {
    name: 'Gulzar Houz Ki Shaam', bpm: 92, root: 62, scale: 'kafi', meter: 16, loopTo: 0, gain: 0.85, roam: true,
    parts: {
      claps: { kit: 'clap', div: 2, vol: 0.8, rev: 0.25, pan: -0.15 },
      dholak: { kit: 'dholak', div: 2, vol: 0.75, rev: 0.1, pan: 0.15 },
      marfa: { kit: 'band', div: 2, vol: 0.55, rev: 0.15 },
      bass: { inst: 'bass', div: 2, oct: -2, vol: 0.65 },
      hc: { type: 'chord', inst: 'harmonium', div: 4, oct: 0, vol: 0.5, rev: 0.15, pan: -0.25 },
      hl: { inst: 'harmonium1', div: 2, oct: 0, vol: 0.9, rev: 0.25, pan: 0.05 },
      sh: { inst: 'shehnai', div: 2, oct: 1, vol: 0.6, rev: 0.3, pan: 0.3 },
    },
    sections: {
      A: OC_A,
      A2: sec(OC_A, { bpm: 96, claps: 'x . . x . . X .' }),
      B: sec(OC_A, { bpm: 100, chords: '3 - - - | 3 - - - | 7 - - - | 7 - - - | 4 - - - | 4 - - - | 5 - - - | 1 - - -',
        hl: '^3 - - ^2 ^3 - ^5 - | ^3 - ^2 - ^1 - 7 - | 7 - ^2 - ^3 - ^2 - | ^2 - ^1 - 7 - - - | 6 - ^1 - 6 - 4 - | ^1 - - - 6 - 4 - | 5 - 7 - ^2 - 7 - | ^1 - - - 5 - - -',
        sh: '. . . . . . . . | . . . . 3 - 5 - | . . . . . . . . | . . . . 3 - 2 - | . . . . . . . . | . . . . 6 - 4 - | . . . . . . . . | . . . . 5 - 3 -',
        marfa: 'M . . M . . M .' }),
      A3: sec(OC_A, { bpm: 104, claps: 'X . . x . . X .', marfa: 'M . . M . . M .' }),
      C: sec(OC_A, { bpm: 110, claps: 'X . x X . x X x', marfa: 'M . . M . . M M', dholak: 'D c t D c t D t | D t D t D t t t' }),
    },
    order: ['A', 'A2', 'B', 'A3', 'C'],
  };

  TRACKS.tension = {
    name: 'Ek Clue, Do Raaste', bpm: 84, root: 59, scale: 'kirwani', meter: 16, loopTo: 0, gain: 0.85,
    parts: {
      drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.5, rev: 0.35 },
      pulse: { inst: 'synbass', div: 2, oct: -1, vol: 0.55 },
      tick: { kit: 'kit', div: 1, vol: 0.4, pan: 0.3 },
      tabla: { kit: 'tabla', div: 1, vol: 0.6, rev: 0.2, pan: -0.2 },
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 0.7, rev: 0.4, pan: -0.1 },
      str: { type: 'chord', inst: 'strings', div: 16, oct: -1, vol: 0.7, rev: 0.4 },
    },
    sections: {
      A: { bars: 8, cdiv: 16, chords: '1 | 1 | 6 | 5:M | 1 | 1 | 4 | 5:M', drone: '5 ^1 ^1 1', pulse: 'r! r r r r! r r r', tick: 'h . r . h . r . h . r . h . r .',
        tabla: '. . . . . . . . . . . . ti ra ki ta | dha . . . . . . . ge . . . . . . .', str: 'x',
        sitar: '1 - - - . . ~2 - | ~3 - - - 2 - 1 - | 6 - - - ~5 - - - | 7 - - - . . . . | 1 - 3 - 5 - ~6 - | 5 - - - ~4 - 3 - | 4 - - 3 4 - 6 - | 7 - - - 5 - - -' },
      B: { bars: 8, cdiv: 16, chords: '6 | 4 | 5:M | 5:M | 6 | 4 | 5:M | 5:M', drone: '5 ^1 ^1 1', pulse: 'r! r r r r! r r! r', tick: 'h r h r h r h r h r h r h r h r',
        tabla: 'dha . ti ra ki ta dha . ge . ti ra ki ta ka .', str: 'x',
        sitar: '^1 - - 7 6 - 5 - | 4 - - - 3 - 4 - | 5 - 7 - ^2 - - - | ^1 - 7 - 5 - - - | ^1 - - 7 6 - ^3 - | ^2 - ^1 - 6 - 4 - | 5 - 7 - ^2 - 7 - | 5 - - - - - . .' },
    },
    order: ['A', 'B'],
  };

  TRACKS.victory = {
    name: 'Shabaash!', bpm: 126, root: 53, scale: 'major', meter: 16, loop: false, gain: 0.85,
    parts: {
      band: { kit: 'band', div: 1, vol: 0.7, rev: 0.15 },
      brass: { type: 'chord', inst: 'brass', div: 2, oct: 1, vol: 0.55, rev: 0.2, pan: -0.2 },
      tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.85, rev: 0.25, pan: 0.1 },
      cl: { inst: 'clarinet', div: 2, oct: 1, vol: 0.5, rev: 0.25, pan: 0.3 },
      bass: { inst: 'bass', div: 2, oct: -1, vol: 0.7 },
    },
    sections: {
      A: { bars: 8, cdiv: 8, chords: '1 - | 4 - | 5 - | 1 - | 4 - | 5 - | 1 5 | 1 -',
        band: R('B . S . B B S . B . S . B B S S', 7) + ' | B+C . . . . . . . . . . . . . . .', brass: 'x . x . x x . x | x . x . x x . x | x . x . x x . x | x . x . x x . x | x . x . x x . x | x . x . x x . x | x . x . x x . x | x - - - . . . .',
        tpt: '1 - 3 - 5 - ^1 - | ^1 - 6 - ^1 - 6 - | 7 - 5 - 7 - ^2 - | ^1 - - - . . 5 5 | 6 - 6 - 6 5 4 6 | 5 - 5 - 5 4 3 5 | 4 - 3 - 2 - _7 - | 1 - - - - - . .',
        cl: '3 - - - 5 - - - | 4 - - - 6 - - - | 5 - - - 7 - - - | 5 - - - - - - - | 6 - - - - - - - | 7 - - - - - - - | 5 - - - 7 - - - | ^1 - - - - - . .',
        bass: 'r . f . r . f . | r . f . r . f . | r . f . r . f . | r . f . r . f . | r . f . r . f . | r . f . r . f . | r . f . r . f . | r . . . . . . .' },
    },
    order: ['A'],
  };

  TRACKS.ending = {
    name: 'Charminar Ki Chaon', bpm: 64, root: 62, scale: 'major', meter: 16, loop: false, gain: 1.05,
    parts: {
      drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.5, rev: 0.35, pan: -0.1 },
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 0.6, rev: 0.35, pan: -0.3 },
      santoor: { inst: 'santoor', div: 1, oct: 1, vol: 0.4, rev: 0.5, pan: 0.35 },
      flute: { inst: 'bansuri', div: 2, oct: 0, vol: 0.85, rev: 0.45, pan: 0.1 },
      vln: { inst: 'violin', div: 2, oct: 0, vol: 0.9, rev: 0.5, pan: 0.05 },
      str: { type: 'chord', inst: 'strings', div: 4, oct: 0, vol: 0.85, rev: 0.5 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: 0, vol: 0.6, rev: 0.3, pan: -0.15 },
      tabla: { kit: 'tabla', div: 2, vol: 0.65, rev: 0.2, pan: 0.2 },
      bass: { inst: 'bass', div: 4, oct: -2, vol: 0.6 },
      bell: { inst: 'glock', div: 4, oct: 1, vol: 0.6, rev: 0.6 },
    },
    sections: {
      alaap: { bars: 4, bpm: 58, chords: '1 - - - | 1 - - - | 4 - - - | 1 - - -', drone: '5 ^1 ^1 1', str: 'x - - -', vol: { str: 1.1, sitar: 1.5, drone: 1.3 },
        sitar: '1 - - - - - ~2 - | 3 - - - ~4 - 3 - | 5 - - - - - ~6 - | 5 - - - - - - -' },
      theme: { bars: 8, chords: T_CH_A, drone: '5 ^1 ^1 1', pad: 'x - - -', bass: 'r - - -', flute: T_MEL_A,
        santoor: 'r . . . f . . . o . . . f . . .', tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL, vol: { tabla: 0.55 } },
      rise: { bars: 8, bpm: 66, chords: T_CH_B, drone: '5 ^1 ^1 1', str: 'x - - -', pad: 'x - - -', bass: 'r - f -', vln: T_MEL_B,
        sitar: 'r t f o f t f t', tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL },
      lift: { bars: 8, bpm: 68, tp: 2, chords: T_CH_A, drone: '5 ^1 ^1 1', str: 'x - - -', pad: 'x - - -', bass: 'r - f -', flute: T_MEL_A, sitar: T_MEL_A,
        santoor: 'r f o f ^t f o f r f o f ^t f o f', tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL, vol: { sitar: 0.6, santoor: 0.8 } },
      coda: { bars: 4, bpm: [64, 46], tp: 2, chords: '1 - - - | 4 - - - | 1 - - - | 1 - - -', drone: '5 ^1 ^1 1', str: 'x - - - | x - - - | x - - - | x - - -',
        flute: '5 - - 3 5 - ^1 - | ^1 - - - - - - - | . . . . . . . . | . . . . . . . .',
        sitar: '. . . . . . . . | . . . . . . . . | 5 - 3 - 2 - 1 - | 1 - - - - - - -',
        santoor: '. . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . . | . . . . . . . . r f o ^t ^f ^o ^^t . | . . . . . . . . . . . . . . . .',
        bell: '. . . . | . . . . | . . . . | ^1 - - -' },
    },
    order: ['alaap', 'theme', 'rise', 'lift', 'coda'],
  };

  TRACKS.festival = { // teenmaar procession: Ganesh immersion, Bonalu (also on Band Baaja radio)
    name: 'Teenmaar Toofan', bpm: 138, root: 62, scale: 'major', meter: 16, loopTo: 0, gain: 0.8,
    parts: {
      band: { kit: 'band', div: 1, vol: 0.75, rev: 0.15 },
      cl: { inst: 'clarinet', div: 2, oct: 0, vol: 0.85, rev: 0.25, pan: 0.15 },
      tpt: { inst: 'trumpet', div: 2, oct: 0, vol: 0.5, rev: 0.25, pan: -0.2 },
      bass: { inst: 'bass', div: 2, oct: -2, vol: 0.65 },
    },
    sections: {
      A: { bars: 4, cdiv: 16, chords: '1 | 1 | 4 | 1', band: 'B+P . . P . . P . B+P . . P . . P p | B+P . T P . T P . B+P . T P T T P T', bass: 'r . . r . . r .',
        cl: '5 - 6 5 3 - 2 3 | 5 - - - 5 6 5 3 | 6 - 5 6 ^1 - 6 5 | 3 - 2 - 1 - - -', tpt: '. . . . . . . . | 3 - - - 3 - - - | . . . . . . . . | 1 - - - - - - -' },
      B: { bars: 4, cdiv: 16, chords: '1 | 1 | 1 | 1', band: 'B+P . . P . . P . B+P . . P . . P p | B+P . T P . T P . B+P . T P T T P T', bass: 'r . . r . . r .',
        cl: '^1 - 6 5 6 - ^1 6 | 5 - - - 3 5 6 5 | 3 - 2 1 2 - 3 5 | 1 - - - - - . .', tpt: '5 - - - . . . . | 5 - - - . . . . | 3 - - - . . . . | 1 - - - . . . .' },
    },
    order: ['A', 'A', 'B', 'B'],
  };

  TRACKS.numaish = { // fairground waltz for the Numaish (3/4)
    name: 'Numaish Ka Jhoola', bpm: 132, root: 55, scale: 'major', meter: 12, loopTo: 0, gain: 0.8,
    parts: {
      glock: { inst: 'glock', div: 4, oct: 1, vol: 0.8, rev: 0.3, pan: 0.2 },
      org: { type: 'chord', inst: 'harmonium', div: 4, oct: 0, vol: 0.6, rev: 0.2, pan: -0.2 },
      bass: { inst: 'bass', div: 4, oct: -1, vol: 0.7 },
      cl: { inst: 'clarinet', div: 4, oct: 0, vol: 0.5, rev: 0.2 },
    },
    sections: {
      A: { bars: 8, cdiv: 12, chords: '1 | 1 | 5:7 | 5:7 | 5:7 | 5:7 | 1 | 1', bass: 'r . .', org: '. x x',
        glock: '1 3 5 | ^1 - 5 | 7 2 4 | ^2 - 7 | 5 7 ^2 | ^4 - ^2 | ^3 - ^1 | ^1 - -' },
      B: { bars: 8, cdiv: 12, chords: '4 | 4 | 1 | 1 | 5:7 | 5:7 | 1 | 1', bass: 'r . .', org: '. x x',
        cl: '6 - 4 | ^1 - 6 | 5 - 3 | 5 - - | 4 - 2 | 7 - 5 | 3 - 5 | 1 - -', glock: '. . . | ^1 . . | . . . | ^1 . . | . . . | 7 . . | . . . | ^1 . .' },
    },
    order: ['A', 'B'],
  };

  TRACKS.kites = { // Sankranti terrace kite fight (6/8)
    name: 'Patang Ki Pech', bpm: 112, root: 53, scale: 'major', meter: 12, loopTo: 0, gain: 0.85,
    parts: {
      dholak: { kit: 'dholak', div: 2, vol: 0.7, pan: 0.15 },
      claps: { kit: 'clap', div: 2, vol: 0.6, pan: -0.2, rev: 0.2 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.8, rev: 0.3 },
      mando: { inst: 'mandolin', div: 2, oct: 1, vol: 0.5, pan: -0.3 },
      bass: { inst: 'bass', div: 2, oct: -1, vol: 0.7 },
    },
    sections: {
      A: { bars: 8, cdiv: 6, chords: '1 - | 4 - | 5 - | 1 - | 1 - | 4 - | 5 - | 1 -', dholak: 'D . t D t c', claps: 'x . . x . .', bass: 'r . . f . .', mando: 'r f o r f o',
        flute: '1 2 3 5 - 3 | 4 - 6 ^1 - 6 | 5 - 7 ^2 - 7 | ^1 - - 5 - - | 3 - 5 ^1 - 5 | 6 - 4 6 - ^1 | ^2 - 7 5 - 2 | 1 - - - - -' },
    },
    order: ['A'],
  };

  // ---- radio songs (fictional songs, films and artists)
  TRACKS.r_chandni = {
    name: 'Chandni Raat Ka Cycle', bpm: 100, root: 65, scale: 'major', meter: 12, loop: false, gain: 0.85,
    parts: {
      mando: { inst: 'mandolin', div: 2, oct: 0, vol: 0.75, rev: 0.25, pan: -0.15, trem: 6 },
      flute: { inst: 'bansuri', div: 2, oct: 0, vol: 0.75, rev: 0.3, pan: 0.2 },
      acc: { type: 'chord', inst: 'harmonium', div: 2, oct: 0, vol: 0.45, pan: -0.3 },
      str: { type: 'chord', inst: 'strings', div: 12, oct: 0, vol: 0.6, rev: 0.4 },
      bass: { inst: 'bass', div: 2, oct: -2, vol: 0.7 },
      dholak: { kit: 'dholak', div: 2, vol: 0.6, pan: 0.2 },
    },
    sections: {
      intro: { bars: 2, cdiv: 12, chords: '1 | 5', mando: '1 3 5 ^1 5 3 | 7 5 2 7 5 2', bass: 'r . . f . .', dholak: 'D . t D t .' },
      A: { bars: 8, cdiv: 12, chords: '1 | 1 | 6 | 6 | 4 | 5 | 1 | 5', acc: 'x . . x . .', bass: 'r . . f . .', dholak: 'D . t D t .',
        mando: '5 - 3 1 - 3 | 5 - - ^1 - - | 6 - 5 6 - ^1 | 6 - - - - - | 4 - 6 ^1 - 6 | 5 - 7 ^2 - 7 | ^1 - - 5 - 3 | 2 - - - - -' },
      B: { bars: 8, cdiv: 12, chords: '4 | 4 | 1 | 1 | 2 | 5 | 1 | 1', acc: 'x . . x . .', str: 'x', bass: 'r . . f . .', dholak: 'D . t D t c', mando: 'r . f . o .',
        flute: '^1 - - 6 - 4 | 6 - - 5 - 4 | 3 - - 5 - ^1 | 5 - - - - - | 2 - 4 6 - 4 | 5 - 7 ^2 - 7 | ^1 - 5 3 - 5 | ^1 - - - - -' },
    },
    order: ['intro', 'A', 'B', 'A', 'B'],
  };
  TRACKS.r_barish = {
    name: 'Baarish Mein Irani Chai', bpm: 80, root: 57, scale: 'minor', meter: 16, loop: false, gain: 0.85,
    parts: {
      sitar: { inst: 'sitar', div: 2, oct: 0, vol: 0.65, rev: 0.35, pan: -0.3 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.8, rev: 0.4, pan: 0.15 },
      str: { type: 'chord', inst: 'strings', div: 4, oct: 0, vol: 0.7, rev: 0.45 },
      pad: { type: 'chord', inst: 'harmonium', div: 4, oct: 0, vol: 0.5, pan: 0.2 },
      tabla: { kit: 'tabla', div: 2, vol: 0.65, rev: 0.15, pan: 0.25 },
      bass: { inst: 'bass', div: 4, oct: -1, vol: 0.6 },
    },
    sections: {
      intro: { bars: 2, chords: '1 - - - | 1 - - -', sitar: '1 - - ~2 3 - - - | 5 - - - ~4 - 3 -', str: 'x - - -' },
      A: { bars: 8, chords: '1 - - - | 6 - - - | 3 - - - | 7 - - - | 1 - - - | 4 - - - | 5 - - - | 1 - - -', pad: 'x - - -', bass: 'r - - f',
        tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL, sitar: 'r . . . f . . .',
        flute: '5 - 4 3 1 - 3 - | 3 - - 1 _6 - - - | 5 - 3 5 ^1 - 7 - | 7 - 5 - 2 - - - | 1 - 3 5 ^1 - 7 6 | 6 - - 4 6 - ^1 - | 5 - 7 - ^2 - 7 - | ^1 - - - - - . .' },
      B: { bars: 8, chords: '4 - - - | 4 - - - | 1 - - - | 1 - - - | 6 - - - | 7 - - - | 3 - - - | 5:M - - -', str: 'x - - -', pad: 'x - - -', bass: 'r - f -',
        tabla: R(KEHERWA, 7) + ' | ' + KEH_FILL, sitar: 'r t f t r t f t',
        flute: '4 - 6 - ^1 - 6 - | 4 - - - 6 - 4 - | 3 - 5 - ^1 - 5 - | 3 - - - 1 - - - | 6 - ^1 - ^3 - ^1 - | 7 - ^2 - ^4 - ^2 - | ^3 - - ^1 7 - 5 - | 5 - 7# - ^2 - 7# -' },
    },
    order: ['intro', 'A', 'B', 'A'],
  };
  TRACKS.r_baraat = {
    name: 'Baraat Express', bpm: 132, root: 58, scale: 'major', meter: 16, loop: false, gain: 0.8,
    parts: {
      band: { kit: 'band', div: 1, vol: 0.7, rev: 0.12 },
      cl: { inst: 'clarinet', div: 2, oct: 1, vol: 0.85, rev: 0.2, pan: 0.15 },
      tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.8, rev: 0.2, pan: -0.1 },
      brass: { type: 'chord', inst: 'brass', div: 2, oct: 0, vol: 0.5, pan: -0.3 },
      bass: { inst: 'bass', div: 2, oct: -1, vol: 0.7 },
    },
    sections: {
      A: { bars: 8, cdiv: 16, chords: '1 | 1 | 5 | 5 | 5 | 5 | 1 | 1', band: 'B . S . B B S . B . S . B B S R', brass: '. x . x . x . x', bass: 'r . f . r . f .',
        cl: '1 2 3 5 5 - 5 - | 6 5 4 3 5 - - - | 2 3 4 2 _7 - 2 - | 2 - _7 - _5 - - - | 5 6 7 ^2 ^2 - ^1 7 | ^2 - 7 - 5 - - - | 3 - 2 - 1 - 3 5 | 1 - - - - - . .' },
      B: { bars: 8, cdiv: 16, chords: '4 | 4 | 1 | 1 | 4 | 4 | 5 | 5:7', band: 'B . S . B B S . B . S . B B S R', brass: '. x . x . x . x', bass: 'r . f . r . f .',
        tpt: '^1 - 6 - 4 - 6 - | ^1 - - - ^2 - ^1 - | 5 - 3 - 1 - 3 - | 5 - - - - - . . | 6 - - 4 6 - ^1 - | ^1 - - - 6 - 4 - | 5 - 7 - ^2 - 7 - | 5 - - - 4 - 2 -' },
    },
    order: ['A', 'A', 'B', 'A'],
  };
  TRACKS.r_neon = {
    name: 'Neon Monsoon', bpm: 116, root: 52, scale: 'minor', meter: 16, loop: false, gain: 0.8,
    parts: {
      kit: { kit: 'kit', div: 1, vol: 0.7 },
      dholak: { kit: 'dholak', div: 2, vol: 0.55, pan: 0.3 },
      bass: { inst: 'synbass', div: 2, oct: -1, vol: 0.7 },
      ep: { type: 'chord', inst: 'epiano', div: 2, oct: 1, vol: 0.6, rev: 0.3, pan: -0.2 },
      pad: { type: 'chord', inst: 'pad', div: 16, oct: 1, vol: 0.6, rev: 0.4 },
      gtr: { inst: 'guitar', div: 2, oct: 0, vol: 0.45, rev: 0.25, pan: 0.35 },
      lead: { inst: 'synlead', div: 2, oct: 1, vol: 0.8, rev: 0.3, pan: 0.05 },
    },
    sections: {
      intro: { bars: 4, cdiv: 16, chords: '1 | 6 | 3 | 7', ep: 'x . . x . . x .', gtr: 'r f o f r f o f', kit: 'h . h . h . h . h . h . h . h h' },
      verse: { bars: 8, cdiv: 16, chords: '1 | 6 | 3 | 7 | 1 | 6 | 3 | 7', ep: 'x . . x . . x .', gtr: 'r f o f r f o f', kit: 'k . h . s . h k . k h . s . h .', bass: 'r . . r . r . .',
        lead: '. . 1 2 3 - 2 1 | 3 - - - . . 3 5 | 5 - 3 - 2 1 2 3 | 2 - - - . . . . | . . 1 2 3 - 2 1 | 3 - - - . . 5 6 | 5 - 3 - 2 - 1 - | 2 - - - . . . .' },
      chorus: { bars: 8, cdiv: 16, chords: '6 | 7 | 1 | 1 | 6 | 7 | 3 | 7', ep: 'x . x . x . x .', pad: 'x', kit: 'k . h . s . h k . k h . s . h h', bass: 'r . r . r . r r',
        lead: '3 - 3 5 6 - 5 3 | 2 - 2 3 4 - 3 2 | 1 - - - . . 5 5 | 5 - 3 - 1 - - - | 3 - 3 5 6 - ^1 - | 7 - 6 5 4 - 2 - | 5 - - 3 2 - 3 - | 2 - - - . . . .' },
    },
    order: ['intro', 'verse', 'chorus', 'verse', 'chorus2'],
  };
  TRACKS.r_neon.sections.chorus2 = sec(TRACKS.r_neon.sections.chorus, { dholak: 'D c t c D D t c', gtr: 'r f o f r f o f' });
  TRACKS.r_pager = {
    name: 'Pager Pe Message', bpm: 124, root: 57, scale: 'khamaj', meter: 16, loop: false, gain: 0.8,
    parts: {
      kit: { kit: 'kit', div: 1, vol: 0.65 },
      dhol: { kit: 'dhol', div: 1, vol: 0.7, pan: 0.2 },
      bass: { inst: 'synbass', div: 2, oct: -1, vol: 0.7 },
      stab: { type: 'chord', inst: 'stab', div: 2, oct: 1, vol: 0.55, rev: 0.2, pan: -0.2 },
      flute: { inst: 'bansuri', div: 2, oct: 1, vol: 0.85, rev: 0.3, pan: 0.1 },
      lead: { inst: 'synlead', div: 2, oct: 1, vol: 0.6, rev: 0.3 },
    },
    sections: {
      A: { bars: 8, cdiv: 16, chords: '1 | 7 | 4 | 1', kit: 'k . h . k . h . k . h . k . h h', dhol: 'D . t . . t D . D . t . D t t .', bass: 'r . r r . r . r', stab: '. . x . . x . .',
        flute: '5 - 5 6 ^1 - 6 5 | 4 - - 2 4 - 5 - | 6 - 6 5 4 - 2 - | 1 - - - . . . . | 5 - 5 6 ^1 - ^2 ^1 | 7 - - 5 4 - 2 - | 6 - 6 5 4 - 6 - | 5 - - - . . . .' },
      B: { bars: 8, cdiv: 16, chords: '1 | 7 | 4 | 1', kit: 'k . h . k . h . k . h . k . h h', dhol: 'D . t t D . t . D t D t D t t t', bass: 'r . r r . r . r', stab: 'x . . x . . x .',
        lead: '^1 - ^1 - 7 - 6 - | 5 - - - . . . . | 6 - 6 - 5 - 4 - | 5 - - - . . . .' },
    },
    order: ['A', 'B', 'A'],
  };

  // ---- station idents (2 bars)
  TRACKS.id_vani = { name: 'Deccan Vani ident', bpm: 90, root: 62, scale: 'major', meter: 16, loop: false, gain: 0.8,
    parts: { drone: { inst: 'tanpura', div: 4, oct: -1, vol: 0.5 }, pad: { type: 'chord', inst: 'harmonium', div: 4, vol: 0.6 }, flute: { inst: 'bansuri', div: 2, vol: 0.85, rev: 0.4 } },
    sections: { A: { bars: 2, chords: '1 - - - | 4 - 1 -', drone: '5 ^1 ^1 1', pad: 'x - - - | x - x -', flute: '5 - ^1 - ^3 - ^2 ^1 | ^1 - - - - - - -' } }, order: ['A'] };
  TRACKS.id_band = { name: 'Band Baaja ident', bpm: 120, root: 58, scale: 'major', meter: 16, loop: false, gain: 0.8,
    parts: { band: { kit: 'band', div: 1, vol: 0.7 }, tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.85, rev: 0.2 }, brass: { type: 'chord', inst: 'brass', div: 4, vol: 0.6 } },
    sections: { A: { bars: 2, chords: '1 - - - | 1 - - -', band: 'R . R . R . R . R . R . R . R . | B+C . . . . . . . . . . . . . . .', tpt: '1 3 5 ^1 - - 5 - | ^1 - - - - - . .', brass: '. . . . | x - - .' } }, order: ['A'] };
  TRACKS.id_pop = { name: 'Pop Patang ident', bpm: 118, root: 52, scale: 'minor', meter: 16, loop: false, gain: 0.8,
    parts: { kit: { kit: 'kit', div: 1, vol: 0.7 }, ep: { type: 'chord', inst: 'epiano', div: 4, oct: 1, vol: 0.6, rev: 0.3 }, lead: { inst: 'synlead', div: 2, oct: 1, vol: 0.85, rev: 0.3 } },
    sections: { A: { bars: 2, chords: '6 - - - | 1 - - -', kit: 'k . h . s . h . k . h . s . h h | k+x . . . . . . . . . . . . . . .', ep: 'x - - - | x - - -', lead: '^1 - 7 - 5 - 3 - | 5 - - - - - . .' } }, order: ['A'] };

  // Every song the Walkman / 2-in-1 can play (fictional titles/artists)
  const SONGS = {
    title: { title: 'Yaadon Ki Gully', artist: 'Nostalgia OST' },
    day: { title: 'Cycle Pe Sawaari', artist: 'Nostalgia OST' },
    night: { title: 'Chandni Chhat', artist: 'Nostalgia OST' },
    oldcity: { title: 'Gulzar Houz Ki Shaam', artist: 'Nostalgia OST' },
    kites: { title: 'Patang Ki Pech', artist: 'Nostalgia OST' },
    numaish: { title: 'Numaish Ka Jhoola', artist: 'Nostalgia OST' },
    ending: { title: 'Charminar Ki Chaon', artist: 'Nostalgia OST' },
    r_chandni: { title: 'Chandni Raat Ka Cycle', artist: 'from the film "Cycle Wala Pyaar" (1987)', station: 0 },
    r_barish: { title: 'Baarish Mein Irani Chai', artist: 'from the film "Deccan Ki Shaam" (1991)', station: 0 },
    r_baraat: { title: 'Baraat Express', artist: 'Lucky Star Brass Band, Saidabad', station: 1 },
    festival: { title: 'Teenmaar Toofan', artist: 'Mohalla Dappu Party', station: 1 },
    r_neon: { title: 'Neon Monsoon', artist: 'Kaveri & The Kites', station: 2 },
    r_pager: { title: 'Pager Pe Message', artist: 'DJ Double Ka Meetha', station: 2 },
  };

  const STATIONS = [
    { id: 'vani', name: 'Deccan Vani 101.2', show: 'Aapki Farmaish', ident: 'id_vani', songs: ['r_chandni', 'r_barish'],
      lines: [
        'Namaskar! Aap sun rahe hain Deccan Vani, aur yeh hai "Aapki Farmaish".',
        'Agla geet farmaish kiya hai Malakpet se Pinky, Bunty aur unki Nani ne.',
        'Kachiguda se Chintu likhte hain: "Mera cycle wapas kar do, Sonu!" Sonu, sun rahe ho?',
        'Yeh geet Amberpet ke Golu aur poore Gully Cricket Club ki taraf se.',
        'Postcard bhejiye: Aapki Farmaish, Deccan Vani, Post Box 1990, Hyderabad.',
        'Chai ka samay ho gaya! Agla geet, sabhi Irani cafe waalon ke naam.',
      ] },
    { id: 'band', name: 'Band Baaja 93.5', show: 'Shaadi Special', ident: 'id_band', songs: ['r_baraat', 'festival'],
      lines: [
        'Band Baaja 93.5! Shaadi ho ya jaloos, baaja bajega full!',
        'Yeh dhun Saidabad ki Lucky Star Band ki taraf se. Naacho, mamu!',
        'Teenmaar time! Volume badhao, poora mohalla nachao!',
        'Agli baraat ka route: Koti se Abids, phir seedha dance floor!',
      ] },
    { id: 'pop', name: 'Pop Patang 104.8', show: 'Countdown Express', ident: 'id_pop', songs: ['r_neon', 'r_pager'],
      lines: [
        'Heyyy Hyderabad! You are flying high on Pop Patang 104.8!',
        'Shout-out to Rocky from Secunderabad, who paged us: "Bunk mat karna, exam hai!" Too late, Rocky!',
        'Request line chalu hai! Call karo, ya pager pe message karo!',
        'Fresh from the countdown, straight to your auto-rickshaw!',
      ] },
  ];

  /* ============================================================ live graph */
  function buildGraph(ac, dest) {
    const g = {};
    g.master = gain(ac, 1);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25;
    g.master.connect(comp); comp.connect(dest);
    g.revIn = gain(ac, 1);
    const conv = ac.createConvolver(); conv.buffer = makeIR(ac);
    g.revIn.connect(conv);
    g.revOut = gain(ac, 0.42, g.master); conv.connect(g.revOut);
    // world (sfx + ambient): pause muffle + duck
    g.worldDuck = gain(ac, 1, g.master);
    g.worldLP = filt(ac, 'lowpass', 20000, 0.5, g.worldDuck);
    g.sfx = gain(ac, 1, g.worldLP);
    g.amb = gain(ac, 1, g.worldLP);
    g.engine = gain(ac, 1, g.sfx);
    g.ui = gain(ac, 1, g.master);
    // music (+ walkman): duck -> tape wow/flutter delay -> tape lowpass -> master
    g.musicFade = gain(ac, 1, g.master);
    g.tapeLP = filt(ac, 'lowpass', 20000, 0.5, g.musicFade);
    g.tape = ac.createDelay(2.5); g.tape.delayTime.value = 0.012; g.tape.connect(g.tapeLP);
    g.musicDuck = gain(ac, 1, g.tape);
    g.music = gain(ac, 1, g.musicDuck);
    g.walkDuck = gain(ac, 1, g.tape);           // the walkman has its own duck (systems §3.5)
    g.walk = gain(ac, 1, g.walkDuck);
    g.wow = osc0(ac); g.wow.frequency.value = 0.55; g.wowD = gain(ac, 0, g.tape.delayTime); g.wow.connect(g.wowD); g.wow.start();
    g.flut = osc0(ac); g.flut.frequency.value = 7.1; g.flutD = gain(ac, 0, g.tape.delayTime); g.flut.connect(g.flutD); g.flut.start();
    const hs = ac.createBufferSource(); hs.buffer = noiseBuf(ac, 'white'); hs.loop = true;
    g.hiss = gain(ac, 0, g.musicFade); hs.connect(filt(ac, 'highpass', 5000, 0.5, g.hiss)); hs.start();
    // radio: transistor speaker (band-limited, a little saturated)
    g.radioOut = gain(ac, 1, g.master);
    const rsh = shaper(ac, 1.5, g.radioOut);
    g.radioLP = filt(ac, 'lowpass', 5000, 0.8, rsh);
    const pk = filt(ac, 'peaking', 1700, 0.9, g.radioLP); pk.gain.value = 4;
    g.radioHP = filt(ac, 'highpass', 220, 0.7, pk);
    g.radioDuck = gain(ac, 1, g.radioHP);
    g.radio = gain(ac, 1, g.radioDuck);
    return g;
  }
  const v2 = (v) => v * v; // perceptual volume curve
  function applyVolumes() {
    if (!G) return;
    const t = ctx.currentTime;
    sp(G.master.gain, S.muted ? 0 : v2(S.master), t, 0.03);
    sp(G.music.gain, v2(S.music), t, 0.03);
    sp(G.sfx.gain, v2(S.sfx), t, 0.03);
    sp(G.ui.gain, v2(S.sfx), t, 0.03);
    sp(G.amb.gain, v2(S.ambient), t, 0.03);
    sp(G.radio.gain, v2(S.radio), t, 0.03);
    sp(G.walk.gain, v2(S.radio), t, 0.03);
  }

  /* ============================================================ spatial one-shots (pooled strips) */
  function listener() {
    const p = N.player;
    if (p && typeof p.x === 'number') { const v = p.vehicle; return v && typeof v.x === 'number' ? v : p; }
    const r = N.render;
    if (r && r.cam && typeof r.cam.x === 'number') return r.cam;
    return null;
  }
  function spatial(x, y, ref, max) {
    const L = listener();
    if (!L) return { g: 1, pan: 0, d: 0 };
    const dx = x - L.x, dy = y - L.y, d = Math.hypot(dx, dy);
    ref = ref || 80; max = max || 700;
    if (d >= max) return null;
    let g = d <= ref ? 1 : ref / (ref + (d - ref) * 1.1);
    g *= 1 - U.smooth((d - max * 0.65) / (max * 0.35));
    return { g, pan: clamp(dx / 280, -1, 1) * 0.85, d };
  }
  class Strip {
    constructor(ac) {
      this.in = gain(ac, 1); this.lp = filt(ac, 'lowpass', 18000, 0.5); this.pn = panner(ac); this.send = gain(ac, 0, G.revIn);
      this.in.connect(this.lp); this.lp.connect(this.pn); this.pn.connect(this.send);
      this.busy = 0; this.dest = null;
    }
    route(dest) {
      if (this.dest === dest) return;
      if (this.dest) { try { this.pn.disconnect(this.dest); } catch (e) { /* ignore */ } }
      this.pn.connect(dest); this.dest = dest;
    }
  }
  const strips = [];
  function getStrip(now) {
    for (const s of strips) if (s.busy <= now) return s;
    if (strips.length < MAX_STRIPS) { const s = new Strip(ctx); strips.push(s); return s; }
    return null;
  }
  const COOLDOWN = { detector: 0.05, clap: 0.05, pant: 3, step: 0.07, type: 0.04, bell: 0.3, car_horn: 0.3, bus_horn: 0.5, lorry_horn: 1.2, auto_horn: 0.45, scooter_horn: 0.35,
    finger_whistle: 0.4, coin: 0.05, pickup: 0.1, objective: 1.2, mission_passed: 2, mission_failed: 2, bump: 0.08, crash: 0.15, whistle: 0.6,
    wanted_up: 0.5, wanted_down: 0.5, busted: 2, wasted: 2, chetak_start: 0.8, car_start: 0.8, auto_start: 0.8, diesel_start: 1, door: 0.2 };
  const UI_SFX = new Set(['rec', 'tape_stop', 'ui_click', 'ui_back', 'ui_select', 'page_flip', 'paper', 'type', 'objective', 'mission_passed', 'mission_failed',
    'busted', 'wasted', 'wanted_up', 'wanted_down', 'rewind', 'tape_click', 'radio_static']);
  const SFX_GAIN = { step: 0.8, type: 0.45, bump: 0.9, pigeons: 0.8, vendor_call: 0.7, cooker: 0.6, kids: 0.8 };
  const cool = Object.create(null);
  let sfxPlayed = 0;

  // Sound captions (systems §14.2): important gameplay sounds tell the HUD, even when audio is off.
  const CAPTIONS = { whistle: 'whistle', gurkha: 'lathi tok-tok', chappal_whoosh: 'chappal whoosh', chappal: 'thup!', peel_slip: 'slip!',
    dog_bark: 'dog barking', bus_horn: 'bus horn', lorry_horn: 'lorry horn', train_horn: 'train horn', std_ring: 'phone ringing',
    school_bell: 'school bell', dappu: 'dappu drums', conductor: '"Right, right!"', pothole: 'dhadak!' };
  const CAP_MAX = { dog_bark: 260, bus_horn: 320, lorry_horn: 320, train_horn: 600, school_bell: 400, std_ring: 160, conductor: 260, pothole: 90 };
  function captionFor(name, o) {
    const text = CAPTIONS[name];
    if (!text || o.bus === 'amb' || o.noCaption) return;
    if (o.x != null && o.y != null) { const L = listener(); if (L && Math.hypot(o.x - L.x, o.y - L.y) > (CAP_MAX[name] || 600)) return; }
    try { N.emit('caption', { text, x: o.x, y: o.y, kind: 'sound', ms: 1700 }); } catch (e) { /* ignore */ }
  }
  function playSfx(name, o) {
    const fn = SFX[name];
    if (!fn) return false;
    o = o || {};
    captionFor(name, o);
    if (!G || !unlocked) return false;
    const now = ctx.currentTime;
    const cd = COOLDOWN[name] != null ? COOLDOWN[name] : 0.03;
    const ck = name + (o.key != null ? ':' + o.key : '');
    if (cool[ck] != null && now - cool[ck] < cd && !o.force) return false;
    let g = 1, pan = o.pan || 0, d = 0;
    if (o.x != null && o.y != null) {
      const s = spatial(o.x, o.y, o.ref, o.max);
      if (!s) return false;
      g = s.g; pan = s.pan; d = s.d;
    }
    const vol = (o.vol == null ? 1 : o.vol) * g * (SFX_GAIN[name] || 1);
    if (vol < 0.008) return false;
    const strip = getStrip(now);
    if (!strip) return false;
    cool[ck] = now;
    const bus = o.bus === 'amb' ? G.amb : (o.ui || (UI_SFX.has(name) && o.x == null)) ? G.ui : G.sfx;
    strip.route(bus);
    strip.in.gain.setValueAtTime(vol, now);
    if (strip.pn.pan) strip.pn.pan.setValueAtTime(clamp(pan, -1, 1), now);
    strip.lp.frequency.setValueAtTime(d > 0 ? clamp(17000 * Math.exp(-d / 320), 900, 18000) : 18000, now);
    strip.send.gain.setValueAtTime(clamp(0.04 + d / 1500, 0, 0.45) * (o.rev == null ? 1 : o.rev), now);
    try {
      const end = fn(ctx, strip.in, now + (o.delay || 0) + 0.004, o);
      strip.busy = (typeof end === 'number' && isFinite(end) ? end : now + 1) + 0.12;
    } catch (e) { N.err('audio.sfx.' + name, e); strip.busy = now + 0.2; return false; }
    sfxPlayed++;
    return true;
  }

  /* ============================================================ engines */
  const ENGINES = {
    cycle: { kind: 'pedal' }, ladiescycle: { kind: 'pedal' }, hero_cycle: { kind: 'pedal' }, hercules_cycle: { kind: 'pedal' },
    // A3: the Scooty — a small 2-stroke automatic: a thin high buzz that rises smoothly (variomatic, no gear steps)
    scooty: { kind: '2t', idle: 34, max: 112, gears: [1], bp: 1650, q: 1.4, noise: 0.62, body: 0.28, lp: 640, pw: 0.32, vol: 0.27 },
    luna: { kind: '2t', idle: 30, max: 88, gears: [1], bp: 1300, q: 1.2, noise: 0.55, body: 0.25, lp: 520, pw: 0.3, vol: 0.26 },
    chetak: { kind: '2t', idle: 21, max: 80, gears: [0.28, 0.52, 0.78, 1], bp: 620, q: 1.1, noise: 0.8, body: 0.5, lp: 280, pw: 0.22, vol: 0.36 },
    rx100: { kind: '2t', idle: 26, max: 125, gears: [0.2, 0.38, 0.56, 0.76, 1], bp: 1250, q: 1.6, noise: 0.7, body: 0.45, lp: 420, pw: 0.18, vol: 0.38 },
    auto: { kind: '2t', idle: 18, max: 62, gears: [0.3, 0.6, 0.85, 1], bp: 520, q: 0.9, noise: 0.9, body: 0.5, lp: 240, pw: 0.25, vol: 0.4, rattle: 1 },
    ambassador: { kind: '4t', idle: 24, max: 105, gears: [0.25, 0.5, 0.75, 1], bp: 380, q: 0.8, noise: 0.35, body: 0.75, lp: 220, pw: 0.4, vol: 0.34, hum: 0.5 },
    padmini: { kind: '4t', idle: 26, max: 110, gears: [0.25, 0.5, 0.75, 1], bp: 420, q: 0.8, noise: 0.35, body: 0.7, lp: 240, pw: 0.4, vol: 0.32, hum: 0.5 },
    maruti800: { kind: '4t', idle: 30, max: 128, gears: [0.22, 0.45, 0.7, 1], bp: 520, q: 0.9, noise: 0.4, body: 0.6, lp: 300, pw: 0.35, vol: 0.3, hum: 0.4 },
    bus: { kind: 'diesel', idle: 28, max: 76, gears: [0.18, 0.36, 0.55, 0.78, 1], bp: 260, q: 0.8, noise: 0.6, body: 0.9, lp: 160, pw: 0.35, vol: 0.46, rattle: 0.7, hum: 0.6 },
    lorry: { kind: 'diesel', idle: 25, max: 68, gears: [0.18, 0.36, 0.55, 0.78, 1], bp: 230, q: 0.8, noise: 0.65, body: 0.95, lp: 150, pw: 0.35, vol: 0.48, rattle: 0.9, hum: 0.7 },
    boat: { kind: '2t', idle: 16, max: 42, gears: [1], bp: 450, q: 1, noise: 0.7, body: 0.5, lp: 250, pw: 0.25, vol: 0.34, water: 1 },
  };
  const DEFAULT_MAX = { cycle: 115, ladiescycle: 110, hero_cycle: 110, hercules_cycle: 120, scooty: 122, luna: 120, chetak: 150, rx100: 180, auto: 135, ambassador: 165, padmini: 165, maruti800: 165, bus: 115, lorry: 105, boat: 60 };
  function engProfile(type) {
    if (ENGINES[type]) return ENGINES[type];
    // story / special types inherit their base's voice: TYPES[t].sound (vehicles.js), pedal = cycle
    const VT = N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[type];
    if (VT) { if (VT.sound && ENGINES[VT.sound]) return ENGINES[VT.sound]; if (VT.pedal) return ENGINES.cycle; }
    const t = String(type || '');
    if (/scooty/.test(t)) return ENGINES.scooty;
    if (/cycle/.test(t)) return ENGINES.cycle;
    if (/bus/.test(t)) return ENGINES.bus;
    if (/lorry|truck|tractor/.test(t)) return ENGINES.lorry;
    if (/auto/.test(t)) return ENGINES.auto;
    if (/boat/.test(t)) return ENGINES.boat;
    if (/scooter|bike|moped|vespa|lambretta/.test(t)) return ENGINES.chetak;
    return ENGINES.ambassador;
  }
  function engineF(pr, sf, thr) {
    const gears = pr.gears || [1];
    let g = 0;
    while (g < gears.length - 1 && sf > gears[g]) g++;
    const lo = g ? gears[g - 1] : 0, hi = gears[g];
    const local = clamp((sf - lo) / Math.max(0.01, hi - lo), 0, 1);
    let rf = g === 0 ? local : 0.35 + 0.65 * local;
    rf = Math.max(rf, thr * 0.3);
    return { f: pr.idle + (pr.max - pr.idle) * rf, rf };
  }
  function vSpeed(v) { return v.speed != null ? Math.abs(v.speed) : Math.hypot(v.vx || 0, v.vy || 0); }
  function vMax(v) {
    const T = N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[v.type];
    return (T && T.maxSpeed) || DEFAULT_MAX[v.type] || 150;
  }
  class EngineVoice {
    constructor(ac, dest, type) {
      this.ac = ac; this.type = type;
      const pr = (this.pr = engProfile(type));
      this.out = gain(ac, 0); this.pn = panner(ac, dest); this.out.connect(this.pn);
      this.srcs = [];
      const t = ac.currentTime;
      const loopNoise = (kind) => { const s = ac.createBufferSource(); s.buffer = noiseBuf(ac, kind); s.loop = true; s.start(t, rnd() * 2); this.srcs.push(s); return s; };
      if (pr.kind === 'pedal') {
        const nz = loopNoise('pink');
        const bp = filt(ac, 'bandpass', 2600, 1.3);
        this.whirr = gain(ac, 0, this.out);
        nz.connect(bp); bp.connect(this.whirr);
        this.nextTick = 0;
      } else {
        const osc = osc0(ac); osc.type = 'sawtooth'; osc.frequency.value = pr.idle;
        const pul = ac.createWaveShaper(); pul.curve = pulseCurve(pr.pw || 0.25);
        osc.connect(pul);
        const nz = loopNoise(pr.kind === '2t' ? 'white' : 'brown');
        const bp = filt(ac, 'bandpass', pr.bp, pr.q || 1);
        const nAmp = gain(ac, 0, this.out);
        nz.connect(bp); bp.connect(nAmp);
        pul.connect(gain(ac, pr.noise, nAmp.gain));
        const lp = filt(ac, 'lowpass', pr.lp, 1.5, gain(ac, pr.body, this.out));
        pul.connect(lp);
        if (pr.hum) {
          const h = osc0(ac); h.type = 'sawtooth'; h.frequency.value = pr.idle / 2;
          h.connect(filt(ac, 'lowpass', pr.lp * 1.5, 1, gain(ac, pr.hum * 0.22, this.out)));
          h.start(t); this.hum = h; this.srcs.push(h);
        }
        if (pr.rattle) {
          const rz = loopNoise('white');
          const ra = gain(ac, 0, this.out);
          rz.connect(filt(ac, 'highpass', 3500, 0.7, ra));
          pul.connect(gain(ac, pr.rattle * 0.07, ra.gain));
        }
        if (pr.water) {
          const wz = loopNoise('brown');
          this.water = gain(ac, 0, this.out);
          wz.connect(filt(ac, 'lowpass', 900, 0.7, this.water));
        }
        osc.start(t); this.srcs.push(osc);
        this.osc = osc; this.bp = bp;
      }
      this.last = { f: 0, v: -1, pan: 9 };
      this.alive = true;
    }
    update(sf, thr, g, pan) {
      const ac = this.ac, t = ac.currentTime, pr = this.pr;
      if (pr.kind === 'pedal') {
        const v = 0.05 * sf * g;
        if (Math.abs(v - this.last.v) > 0.002) { this.whirr.gain.setTargetAtTime(v, t, 0.1); this.last.v = v; }
        if (sf > 0.08 && thr < 0.15 && g > 0.05) { // freewheel ratchet ticks while coasting
          if (this.nextTick < t) this.nextTick = t + 0.02;
          while (this.nextTick < t + 0.12) {
            burst(ac, this.out, this.nextTick, { ft: 'highpass', f: 4200, a: 0.001, r: 0.008, v: 0.5 });
            this.nextTick += clamp(0.06 / sf, 0.035, 0.25);
          }
        }
        this.out.gain.setTargetAtTime(g, t, 0.05);
      } else {
        const e = engineF(pr, sf, thr);
        if (Math.abs(e.f - this.last.f) > 0.3) {
          this.osc.frequency.setTargetAtTime(e.f, t, 0.07);
          if (this.hum) this.hum.frequency.setTargetAtTime(e.f / 2, t, 0.07);
          this.bp.frequency.setTargetAtTime(pr.bp * (0.8 + 0.5 * e.rf), t, 0.1);
          this.last.f = e.f;
        }
        const v = pr.vol * (0.55 + 0.25 * e.rf + 0.25 * thr) * g;
        if (Math.abs(v - this.last.v) > 0.004) { this.out.gain.setTargetAtTime(v, t, 0.08); this.last.v = v; }
        if (this.water) this.water.gain.setTargetAtTime(0.25 * sf * g, t, 0.2);
      }
      if (this.pn.pan && Math.abs(pan - this.last.pan) > 0.02) { this.pn.pan.setTargetAtTime(pan, t, 0.05); this.last.pan = pan; }
    }
    stop() {
      if (!this.alive) return;
      this.alive = false;
      const t = this.ac.currentTime;
      try { this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(0, t, 0.08); } catch (e) { /* ignore */ }
      for (const s of this.srcs) { try { s.stop(t + 0.5); } catch (e) { /* ignore */ } }
      const pn = this.pn;
      setTimeout(() => { try { pn.disconnect(); } catch (e) { /* ignore */ } }, 900);
    }
  }
  const eng = { player: null, forced: undefined, playerVeh: null, startAt: 0, traffic: [null, null], trafficVeh: [null, null], scanT: 0 };
  function startDelayFor(type) {
    const pr = engProfile(type);
    if (pr.kind === 'pedal') return 0;
    if (type === 'auto') return 1.25;
    if (pr.kind === '2t') return 1.5;
    if (pr.kind === 'diesel') return 1.3;
    return 1.0;
  }
  function engineUpdate(dt, mode) {
    const now = ctx.currentTime;
    const v = (eng.forced !== undefined ? eng.forced : N.player && N.player.vehicle) || null;
    const active = mode === 'play' || mode === 'cutscene' || mode === 'dialogue';
    // player engine
    if (v !== eng.playerVeh) {
      if (eng.player) { eng.player.stop(); eng.player = null; }
      eng.playerVeh = v || null;
      if (v) { eng.player = new EngineVoice(ctx, G.engine, v.type); eng.startAt = now + (eng.forced !== undefined ? 0 : startDelayFor(v.type)); }
    }
    if (eng.player && v) {
      const sf = clamp(vSpeed(v) / vMax(v), 0, 1.2);
      let thr = v.throttle != null ? Math.abs(v.throttle) : 0;
      if (v.throttle == null && N.input && N.player && N.player.vehicle === v) {
        const mv = N.input.move || { x: 0, y: 0 };
        thr = N.input.down && (N.input.down('up') || N.input.down('down')) ? 1 : N.input.analog ? Math.min(1, Math.hypot(mv.x, mv.y)) : 0;
      }
      const on = now >= eng.startAt && active ? 1 : 0;
      eng.player.update(sf, thr, on, 0);
    }
    // two nearest traffic vehicles
    eng.scanT -= dt;
    if (eng.scanT <= 0) {
      eng.scanT = 0.25;
      const L = listener();
      let cands = [];
      if (L && N.entities && typeof N.entities.query === 'function' && active) {
        try {
          cands = N.entities.query(L.x, L.y, 320, (e) => e && e.kind === 'vehicle' && e !== v && vSpeed(e) > 6 && engProfile(e.type).kind !== 'pedal') || [];
        } catch (e) { cands = []; }
        cands = cands.map((e) => [e, Math.hypot(e.x - L.x, e.y - L.y)]).sort((a, b) => a[1] - b[1]).slice(0, 2).map((p) => p[0]);
      }
      for (let i = 0; i < 2; i++) { // drop voices whose vehicle is no longer a candidate
        if (eng.trafficVeh[i] && cands.indexOf(eng.trafficVeh[i]) < 0) { if (eng.traffic[i]) eng.traffic[i].stop(); eng.traffic[i] = null; eng.trafficVeh[i] = null; }
      }
      for (const tv of cands) { // give new candidates a free slot
        if (eng.trafficVeh.indexOf(tv) >= 0) continue;
        const i = eng.trafficVeh[0] ? 1 : 0;
        if (eng.trafficVeh[i]) continue;
        eng.trafficVeh[i] = tv; eng.traffic[i] = new EngineVoice(ctx, G.engine, tv.type);
      }
    }
    for (let i = 0; i < 2; i++) {
      const tv = eng.trafficVeh[i], ev = eng.traffic[i];
      if (!ev) continue;
      if (!tv || tv.alive === false) { ev.stop(); eng.traffic[i] = null; eng.trafficVeh[i] = null; continue; }
      const s = spatial(tv.x, tv.y, 60, 340);
      const sf = clamp(vSpeed(tv) / vMax(tv), 0, 1.2);
      ev.update(sf, sf > 0.3 ? 0.6 : 0.2, s && active ? s.g * 0.55 : 0, s ? s.pan : 0);
    }
  }

  /* ============================================================ ambience */
  const LEVEL = { murmur: 0.24, chatter: 0.05, wind: 0.22, water: 0.32, traffic: 0.26, crickets: 0.016 };
  const BEDS = {
    oldcity: { murmur: 0.6, chatter: 0.45, wind: 0.06, traffic: 0.2, ev: { pigeons: 3, bell: 4, auto_horn: 3, vendor_call: 2.5, bangles: 1.2, scooter_horn: 2, kulfi_bell: 0.6, crow_caw: 1, cow_moo: 0.2 } },
    market: { murmur: 0.65, chatter: 0.5, traffic: 0.25, ev: { vendor_call: 5, bell: 3, auto_horn: 3, coin: 1.5, scooter_horn: 2, kulfi_bell: 1, cow_moo: 0.3, pigeons: 1 } },
    colonial: { murmur: 0.35, chatter: 0.15, wind: 0.08, traffic: 0.5, ev: { car_horn: 3, bus_horn: 1.2, auto_horn: 2.5, bell: 2, scooter_horn: 2, whistle: 0.4, crow_caw: 1, pigeons: 0.6 } },
    colony: { murmur: 0.12, chatter: 0.05, wind: 0.2, traffic: 0.1, ev: { bird: 6, koel: 0.8, crow_caw: 2, bell: 1.5, cooker: 1, dog_bark: 0.4, kulfi_bell: 0.4, vendor_call: 0.8, scooter_horn: 0.6, kids: 0.6 } },
    posh: { wind: 0.25, traffic: 0.22, ev: { bird: 4, koel: 0.5, car_horn: 1, crow_caw: 0.8, dog_bark: 0.3 } },
    rocky: { wind: 0.5, ev: { cheel: 1.2, bird: 2, crow_caw: 0.5 } },
    cantonment: { murmur: 0.3, chatter: 0.1, traffic: 0.45, ev: { train_horn: 0.6, bus_horn: 1.5, car_horn: 2, bell: 1.5, auto_horn: 2, crow_caw: 0.8 } },
    hitec: { wind: 0.35, traffic: 0.15, ev: { bird: 1.5, car_horn: 0.6, cheel: 0.4 } },
    lake: { wind: 0.3, water: 0.6, ev: { bird: 2, crow_caw: 0.5 } },
  };
  const BED_ALIAS = { charminar: 'oldcity', lake: 'lake' };
  const DAY_ONLY = new Set(['bird', 'koel', 'kids', 'vendor_call', 'kulfi_bell', 'cheel', 'school_bell', 'bat_hit', 'howzat', 'cow_moo']);
  // Place emitters: m = exact id, or prefix when it ends with '_' (or pre:true), or suffix (suf:true).
  const PLACE_SOUNDS = [
    { m: 'charminar', r: 450, ev: [['pigeons', 6], ['bangles', 4], ['vendor_call', 3], ['bell', 3]], bed: { murmur: 0.3, chatter: 0.3 } },
    { m: 'mecca_masjid', r: 300, ev: [['pigeons', 5], ['coo', 3]] },
    { m: 'mosque_', r: 220, ev: [['pigeons', 2.5], ['coo', 2]] },
    { m: 'church_', r: 260, ev: [['church_bell', 0.25], ['bird', 2]] },
    { m: 'koti_bus_stand', r: 380, ev: [['bus_horn', 5], ['conductor', 3], ['air_brake', 2], ['vendor_call', 1.5, { variant: 'paper' }]], bed: { murmur: 0.3, traffic: 0.3 } },
    { m: 'imlibun_bus_station', r: 420, ev: [['bus_horn', 5], ['conductor', 2.5], ['air_brake', 2], ['announce', 0.8]], bed: { murmur: 0.3, traffic: 0.25 } },
    { m: 'gokul_chat', r: 200, ev: [['sizzle', 4], ['plates', 3], ['vendor_call', 1, { variant: 'chai' }]], bed: { chatter: 0.35 } },
    // Birla Mandir has no bells (bible §1.5, systems §12.3): wind, a distant city hum, soft steps on marble
    { m: 'birla_mandir', r: 320, ev: [['step', 1.4, { surface: 'stone', vol: 0.35 }], ['bird', 0.6]], bed: { traffic: -0.15, wind: 0.22, murmur: 0.08 } },
    { m: 'dilsukhnagar_sai_temple', r: 280, ev: [['temple_bell', 3], ['vendor_call', 1.2, { variant: 'flower' }]], bed: { murmur: 0.25 } },
    { m: 'ujjaini_mahankali_temple', r: 280, ev: [['temple_bell', 2.5]] },
    { m: 'lal_darwaza_temple', r: 260, ev: [['temple_bell', 2.5]] },
    { m: 'temple_', r: 220, ev: [['temple_bell', 2]] },
    { m: 'hussain_sagar', r: 700, bed: { water: 0.25, wind: 0.1 } },
    { m: 'buddha_statue', r: 400, bed: { water: 0.2 } },
    { m: 'necklace_road', r: 400, ev: [['vendor_call', 1.2, { variant: 'veg' }], ['kulfi_bell', 1]], bed: { wind: 0.15, water: 0.1 } },
    { m: 'tank_bund', r: 400, bed: { wind: 0.15, water: 0.15 } },
    { m: 'tank_bund_statues', r: 300, ev: [['pigeons', 1.5], ['crow_caw', 1]] },
    { m: 'lumbini_park', r: 300, ev: [['bird', 3], ['kulfi_bell', 1.5], ['kids', 2]], bed: { water: 0.2 } },
    { m: 'ntr_gardens', r: 320, ev: [['bird', 5], ['kids', 2.5]], bed: { water: 0.1 } },
    { m: 'prasads_imax', r: 300, ev: [['kids', 1], ['car_horn', 1]], bed: { chatter: 0.25 } },
    { m: 'public_gardens', r: 380, ev: [['bird', 7], ['koel', 1.2], ['crow_caw', 1]] },
    { m: 'assembly', r: 300, ev: [['bird', 3], ['car_horn', 0.6], ['whistle', 0.3]] },
    { m: 'lb_stadium', r: 450, ev: [['crowd_cheer', 1.5], ['bat_hit', 1], ['applause', 0.6]], bed: { murmur: 0.25 } },
    { m: 'rythu_bazaar_', r: 260, ev: [['vendor_call', 6, { variant: 'veg' }], ['coin', 3], ['cow_moo', 0.3]], bed: { chatter: 0.4 } },
    { m: 'mozamjahi_market', r: 320, ev: [['vendor_call', 4], ['kulfi_bell', 2], ['bell', 2]], bed: { chatter: 0.3 } },
    { m: 'karachi_bakery', r: 180, ev: [['shop_bell', 1.5]] },
    { m: 'nampally_station', r: 450, ev: [['train_horn', 1.5], ['station_chime', 1.2], ['whistle', 0.8], ['announce', 0.6]], bed: { murmur: 0.25 } },
    { m: 'kachiguda_station', r: 450, ev: [['train_horn', 1.5], ['station_chime', 1.2], ['whistle', 0.8]], bed: { murmur: 0.25 } },
    { m: 'rtc_x_roads', r: 380, ev: [['finger_whistle', 2], ['auto_horn', 3], ['crowd_cheer', 0.4]], bed: { chatter: 0.3 }, music: 'r_chandni' },
    { m: '_theatre', suf: true, r: 200, ev: [['finger_whistle', 1.5], ['crowd_cheer', 0.5]] },
    { m: 'school_', r: 240, day: true, ev: [['school_bell', 0.4], ['kids', 3]] },
    { m: 'kirana_', r: 120, ev: [['coin', 1.5], ['cash', 0.5]] },
    { m: 'banana_cart_', r: 140, ev: [['vendor_call', 3, { variant: 'banana' }]] },
    { m: 'flower_cart_', r: 140, ev: [['vendor_call', 2.5, { variant: 'flower' }]] },
    { m: 'coconut_cart_', r: 130, ev: [['coconut_chop', 2]] },
    { m: 'stationery_', r: 100, ev: [['paper', 1]] },
    { m: 'pindi_girni_', r: 230, loop: ['flour_mill', 2.05] },
    { m: 'playground_', r: 260, day: true, ev: [['bat_hit', 3], ['kids', 3], ['howzat', 0.8]] },
    { m: 'irani_cafe_', r: 170, ev: [['cup_clink', 5], ['coin', 1], ['vendor_call', 0.5, { variant: 'chai' }]], bed: { chatter: 0.2 } },
    { m: 'internet_cafe_', r: 120, ev: [['dialup', 0.6], ['keys', 4]] },
    { m: 'medical_shop_', r: 100, ev: [['shop_bell', 0.6]] },
    { m: 'iyengar_bakery_', r: 120, ev: [['shop_bell', 0.8]] },
    { m: 'samosa_bandi_', r: 130, ev: [['sizzle', 4], ['vendor_call', 1]] },
    { m: 'dosa_bandi_', r: 130, ev: [['sizzle', 4]] },
    { m: 'photo_studio_', r: 100, ev: [['camera_flash', 0.5]] },
    { m: 'meat_shop_', r: 120, ev: [['chop', 1.5]] },
    { m: 'nampally_exhibition', r: 520, ev: [['announce', 1], ['crowd_cheer', 1], ['kulfi_bell', 2], ['kids', 3]], bed: { murmur: 0.35 }, music: 'numaish' },
    { m: 'paradise', r: 260, ev: [['plates', 3], ['car_horn', 1]], bed: { chatter: 0.35 } },
    { m: 'osmania_university', r: 520, ev: [['bird', 6], ['bell', 2], ['koel', 1]] },
    { m: 'golconda', pre: true, r: 500, ev: [['clap_echo', 0.8], ['cheel', 1]] },
    { m: 'secunderabad_station', r: 450, ev: [['train_horn', 1.5], ['station_chime', 1.2], ['whistle', 0.8], ['announce', 0.6]], bed: { murmur: 0.25 } },
    { m: 'spanish_mosque', r: 220, ev: [['pigeons', 2], ['coo', 2]] },
    { m: 'moula_ali_dargah', r: 350, ev: [['pigeons', 2]], music: 'oldcity' },
    { m: 'gulzar_houz', r: 220, ev: [['pigeons', 3], ['bangles', 2]], bed: { water: 0.12 } },
    { m: 'laad_bazaar', r: 240, ev: [['bangles', 7], ['vendor_call', 3]], bed: { chatter: 0.3 } },
    { m: 'patang_bazaar', r: 200, ev: [['paper', 3], ['vendor_call', 2]] },
    { m: 'kite_stall_', r: 120, ev: [['paper', 2], ['kite_wind', 0.6]] },
    { m: 'chai_bandi_', r: 130, ev: [['cup_clink', 3], ['vendor_call', 1, { variant: 'chai' }]] },
    { m: 'bus_stop_', r: 170, ev: [['bus_horn', 0.8], ['conductor', 0.5], ['air_brake', 0.5]] },
    { m: 'cbs_hangar', r: 380, ev: [['bus_horn', 4], ['conductor', 2], ['air_brake', 2]], bed: { murmur: 0.25 } },
    { m: 'std_', r: 100, ev: [['std_ring', 0.4], ['coin_drop', 0.6]] },
    { m: 'barber_', r: 110, ev: [['scissors', 2]] },
    { m: 'cycle_rent_', r: 120, ev: [['bell', 1.5]] },
    { m: 'video_parlour_', r: 120, ev: [['arcade', 3], ['kids', 1]] },
    { m: 'bakery_', r: 110, ev: [['shop_bell', 0.8]] },
    { m: 'famous_ice_cream', r: 150, ev: [['kulfi_bell', 1.5], ['kids', 1]] },
    { m: 'sultan_bazaar', r: 260, ev: [['vendor_call', 4], ['coin', 2], ['bell', 2]], bed: { chatter: 0.3 } },
    { m: 'begum_bazaar', r: 260, ev: [['vendor_call', 4], ['coin', 2]], bed: { chatter: 0.3 } },
    { m: 'monda_market', r: 260, ev: [['vendor_call', 5, { variant: 'veg' }], ['coin', 2]], bed: { chatter: 0.35 } },
    { m: 'general_bazaar', r: 240, ev: [['vendor_call', 3], ['bell', 2]], bed: { chatter: 0.25 } },
    { m: 'nimrah_cafe', r: 160, ev: [['cup_clink', 5], ['coin', 1]], bed: { chatter: 0.2 } },
    { m: '_cafe', suf: true, r: 150, ev: [['cup_clink', 4]], bed: { chatter: 0.15 } },
    { m: 'bawarchi', r: 180, ev: [['plates', 3]], bed: { chatter: 0.25 } },
    { m: 'pista_house', r: 180, ev: [['plates', 2], ['vendor_call', 1]] },
    { m: 'shah_ghouse', r: 180, ev: [['plates', 2]] },
    { m: 'shadab_hotel', r: 180, ev: [['plates', 2]] },
    { m: 'lumbini_jetty', r: 220, ev: [['water_lap', 4], ['bell', 0.5]], bed: { water: 0.3 } },
    { m: 'begumpet_airport', r: 900, ev: [['airplane', 0.6]] },
    { m: 'durgam_cheruvu', r: 300, bed: { water: 0.3 } },
    { m: 'nehru_zoo', r: 500, ev: [['bird', 6], ['koel', 1.5], ['kids', 2]] },
    { m: 'qutb_shahi_tombs', r: 350, ev: [['bird', 3], ['cheel', 0.8]], bed: { wind: 0.15 } },
    { m: 'peddamma_temple', r: 260, ev: [['temple_bell', 2.5]] },
    { m: 'ameerpet_coaching', r: 200, ev: [['kids', 2]], bed: { chatter: 0.25 } },
    { m: 'home', r: 140, ev: [['cooker', 0.8]] },
  ];
  // Festival soundscapes switched on by story flags: N.flags[id] truthy, N.flags.festival === id, or in N.flags.festivals[].
  const FESTIVALS = {
    ganesh_immersion: { near: ['ganesh_immersion_point', 'tank_bund', 'khairatabad_ganesh', 'tank_bund_statues', 'necklace_road'], r: 650, music: 'festival', ev: [['crowd_cheer', 2], ['whistle', 1]] },
    bonalu: { near: ['ujjaini_mahankali_temple', 'lal_darwaza_temple'], r: 500, music: 'festival', ev: [['dappu', 2], ['temple_bell', 0.8], ['crowd_cheer', 1]] },
    ramzan: { near: ['charminar', 'mecca_masjid'], r: 650, ev: [['bangles', 6], ['vendor_call', 6], ['firework', 0.8], ['crowd_cheer', 0.5]] },
    numaish: { near: ['nampally_exhibition'], r: 600, music: 'numaish' },
    sankranti: { global: true, ev: [['bo_kaata', 1.2], ['kite_wind', 1]] },
  };
  const amb = { L: null, bed: null, override: null, mixT: 0, scanT: 0, active: [], ruleCache: new Map(), waterFrac: 0, nextLap: 0, nextGust: 0, spatial: null, loopT: Object.create(null), lastVals: {} };

  function buildAmbient() {
    const L = {};
    const t = ctx.currentTime;
    const mk = (kind, ft, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx, kind); s.loop = true;
      const fl = filt(ctx, ft, f, q); const mod = gain(ctx, 1); const g = gain(ctx, 0, G.amb);
      s.connect(fl); fl.connect(mod); mod.connect(g); s.start(t, rnd() * 2);
      return { s, f: fl, mod, g };
    };
    L.murmur = mk('pink', 'bandpass', 480, 0.6);
    L.chatter = mk('pink', 'bandpass', 1350, 1.4);
    L.wind = mk('brown', 'lowpass', 420, 0.8);
    L.water = mk('brown', 'lowpass', 750, 0.7);
    L.traffic = mk('brown', 'lowpass', 200, 0.9);
    // crickets: two tone generators double-gated (fast chirp pulses inside slow phrases)
    const cg = gain(ctx, 0, G.amb);
    for (const c of [[4600, 29, 1.6], [5300, 34, 2.3]]) {
      const co = ctx.createOscillator(); co.frequency.value = c[0];
      const a1 = gain(ctx, 0.5), a2 = gain(ctx, 0.5);
      const l1 = ctx.createOscillator(); l1.type = 'square'; l1.frequency.value = c[1]; l1.connect(gain(ctx, 0.5, a1.gain));
      const l2 = ctx.createOscillator(); l2.frequency.value = c[2]; l2.connect(gain(ctx, 0.5, a2.gain));
      co.connect(a1); a1.connect(a2); a2.connect(cg);
      co.start(t); l1.start(t); l2.start(t);
    }
    L.crickets = { g: cg };
    return L;
  }
  function districtInfo(x, y) {
    let d = null;
    try { if (N.world && typeof N.world.districtAt === 'function') d = N.world.districtAt(x, y); } catch (e) { d = null; }
    const W = N.WORLD_DATA;
    if (typeof d === 'string' && W && W.districts) d = W.districts.find((q) => q.id === d) || { id: d };
    if (!d && W && W.districts) {
      for (let i = W.districts.length - 1; i >= 0; i--) {
        const q = W.districts[i], r = q.rect;
        if (r && x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) { d = q; break; }
      }
    }
    return d || null;
  }
  function isWaterAt(x, y) {
    const w = N.world;
    try {
      if (w && typeof w.isWater === 'function') return !!w.isWater(x, y);
      if (w && typeof w.surfaceAt === 'function') return w.surfaceAt(x, y) === N.SURF.WATER;
    } catch (e) { /* ignore */ }
    return false;
  }
  function placeRule(id) {
    if (amb.ruleCache.has(id)) return amb.ruleCache.get(id);
    let r = null;
    for (const p of PLACE_SOUNDS) {
      if (p.suf ? id.endsWith(p.m) : (p.pre || p.m.endsWith('_')) ? id.startsWith(p.m) : id === p.m) { r = p; break; }
    }
    amb.ruleCache.set(id, r);
    return r;
  }
  function festivalOn(k) {
    const f = N.flags || {};
    return !!(f[k] || f.festival === k || (Array.isArray(f.festivals) && f.festivals.indexOf(k) >= 0));
  }
  function scanPlaces(L) {
    const out = [];
    const P = N.places || {};
    for (const id in P) {
      const p = P[id];
      if (!p || typeof p.x !== 'number') continue;
      const rule = placeRule(id);
      if (!rule) continue;
      const d = Math.hypot(p.x - L.x, p.y - L.y);
      if (d <= rule.r) out.push({ id, p, rule, d, k: 1 - d / rule.r });
    }
    for (const k in FESTIVALS) {
      if (!festivalOn(k)) continue;
      const F = FESTIVALS[k];
      if (F.global) { out.push({ id: 'festival:' + k, p: null, rule: F, d: 0, k: 1 }); continue; }
      for (const pid of F.near) {
        const p = P[pid];
        if (!p) continue;
        const d = Math.hypot(p.x - L.x, p.y - L.y);
        if (d <= F.r) out.push({ id: 'festival:' + k + ':' + pid, p, rule: F, d, k: 1 - d / F.r });
      }
    }
    return out;
  }
  function ambientUpdate(dt, mode) {
    if (!amb.L) return;
    const t = ctx.currentTime;
    const L = listener();
    const playing = mode === 'play' || mode === 'dialogue' || mode === 'cutscene' || mode === 'minigame';
    const night = !!(N.clock && N.clock.isNight && N.clock.isNight());
    const hour = N.clock && N.clock.minutes != null ? N.clock.minutes / 60 : 12;
    amb.scanT -= dt;
    if (amb.scanT <= 0 && L) {
      amb.scanT = 0.45;
      const d = districtInfo(L.x, L.y);
      amb.district = d;
      let bed = amb.override || (d && (BED_ALIAS[d.id] || d.style)) || null;
      if (!BEDS[bed]) bed = amb.override ? null : (L ? 'colony' : null);
      amb.bed = bed;
      let wc = 0;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; if (isWaterAt(L.x + Math.cos(a) * 170, L.y + Math.sin(a) * 170)) wc++; }
      amb.waterFrac = wc / 8;
      amb.active = playing ? scanPlaces(L) : [];
    }
    // layer mix
    amb.mixT -= dt;
    if (amb.mixT <= 0) {
      amb.mixT = 0.3;
      const B = (amb.bed && BEDS[amb.bed]) || {};
      const mix = { murmur: B.murmur || 0, chatter: B.chatter || 0, wind: B.wind || 0, water: B.water || 0, traffic: B.traffic || 0, crickets: 0 };
      const wf = amb.waterFrac;
      mix.water = Math.max(mix.water, wf * 0.7); mix.wind = Math.max(mix.wind, wf * 0.3);
      for (const a of amb.active) if (a.rule.bed) for (const k in a.rule.bed) mix[k] = clamp((mix[k] || 0) + a.rule.bed[k] * Math.min(1, a.k * 1.6), 0, 1);
      if (night) {
        mix.murmur *= 0.35; mix.chatter *= 0.2; mix.traffic *= 0.45;
        mix.crickets = amb.bed === 'oldcity' || amb.bed === 'market' ? 0.35 : 1;
      } else if (hour < 7.5 && hour > 5) { mix.traffic *= 0.5; mix.murmur *= 0.6; }
      const on = playing && L ? 1 : 0;
      for (const k in mix) {
        const lay = amb.L[k];
        const v = on * mix[k] * LEVEL[k];
        if (Math.abs((amb.lastVals[k] || 0) - v) > 0.001) { lay.g.gain.setTargetAtTime(v, t, 1.2); amb.lastVals[k] = v; }
      }
    }
    spatialMusicUpdate(L);
    if (!playing || !L) return;
    // slow life in the beds: gusts, water lapping, passing traffic, crowd surges
    if (t > amb.nextGust) {
      amb.nextGust = t + rr(1.5, 3.5);
      amb.L.wind.f.frequency.setTargetAtTime(rr(260, 760), t, 1.2);
      amb.L.wind.mod.gain.setTargetAtTime(rr(0.6, 1.4), t, 1);
      amb.L.traffic.mod.gain.setTargetAtTime(rr(0.5, 1.5), t, 0.8);
      amb.L.traffic.f.frequency.setTargetAtTime(rr(150, 320), t, 0.8);
      amb.L.murmur.f.frequency.setTargetAtTime(rr(380, 620), t, 2);
      amb.L.chatter.mod.gain.setTargetAtTime(rr(0.4, 1.5), t, 0.5);
    }
    if (t > amb.nextLap) {
      amb.nextLap = t + rr(0.9, 2.2);
      amb.L.water.mod.gain.setTargetAtTime(amb.L.water.mod.gain.value > 1 ? rr(0.3, 0.7) : rr(1.2, 1.8), t, 0.35);
    }
    // random one-shots of the bed
    const B = (amb.bed && BEDS[amb.bed]) || null;
    const dawn = hour > 5 && hour < 7.5, meal = (hour > 11.5 && hour < 13.5) || (hour > 19 && hour < 21);
    const fire = (name, rate, o, x, y, ref, max) => {
      if (rnd() >= (rate * dt) / 60) return;
      let px = x, py = y;
      if (px == null) { const a = rnd() * TAU, r = rr(130, 420); px = L.x + Math.cos(a) * r; py = L.y + Math.sin(a) * r; }
      playSfx(name, Object.assign({ x: px + rr(-25, 25), y: py + rr(-25, 25), bus: 'amb', vol: 0.75, ref: ref || 70, max: max || 650 }, o || {}));
    };
    if (B && B.ev) {
      for (const name in B.ev) {
        let r = B.ev[name];
        if (night) { if (DAY_ONLY.has(name)) r = 0; else if (/horn|bell/.test(name)) r *= 0.35; }
        if (dawn && (name === 'bird' || name === 'koel')) r *= 2.5;
        if (name === 'cooker') r = meal ? r * 4 : night ? 0 : r * 0.5;
        if (r > 0) fire(name, r);
      }
      if (night) {
        fire('dog_bark', amb.bed === 'colony' || amb.bed === 'posh' ? 0.8 : 0.3);
        if (amb.bed === 'colony' || amb.bed === 'posh') fire('gurkha', 0.35);
      }
    }
    for (const a of amb.active) {
      const R0 = a.rule;
      if (R0.day && night) continue;
      const px = a.p ? a.p.x : null, py = a.p ? a.p.y : null;
      if (R0.ev) for (const e of R0.ev) {
        if (night && DAY_ONLY.has(e[0])) continue;
        fire(e[0], e[1], e[2], px, py, 60, R0.r * 1.25);
      }
      if (R0.loop && a.p) {
        const lt = amb.loopT[a.id] || 0;
        if (t >= lt) { amb.loopT[a.id] = t + R0.loop[1]; playSfx(R0.loop[0], { x: a.p.x, y: a.p.y, bus: 'amb', ref: 50, max: R0.r * 1.2, key: a.id, force: true }); }
      }
    }
  }
  // one distant song at a time from a place (theatres at RTC X Roads, the Numaish, a procession)
  function spatialMusicUpdate(L) {
    let best = null;
    for (const a of amb.active) if (a.rule.music && a.p && (!best || a.d < best.d)) best = a;
    const S0 = amb.spatial;
    if (S0 && (!best || best.id !== S0.key)) {
      S0.seq.stop(1.2); const ch = S0.chain;
      setTimeout(() => { try { ch.pn.disconnect(); } catch (e) { /* ignore */ } }, 3000);
      amb.spatial = null;
    }
    if (best && !amb.spatial) {
      const g = gain(ctx, 0); const lp = filt(ctx, 'lowpass', 1300, 0.7); const pn = panner(ctx, G.amb);
      g.connect(lp); lp.connect(pn);
      amb.spatial = { key: best.id, id: best.rule.music, place: best.p, r: best.rule.r, chain: { g, lp, pn }, seq: new Seq(ctx, best.rule.music, g, { live: true, revIn: G.revIn, fadeIn: 1.5 }) };
    }
    const sm = amb.spatial;
    if (sm) {
      if (sm.seq.done && ctx.currentTime > sm.seq.endTime) sm.seq.release(), sm.seq = new Seq(ctx, sm.id, sm.chain.g, { live: true, revIn: G.revIn, startTime: ctx.currentTime + 2 });
      const s = L ? spatial(sm.place.x, sm.place.y, 90, sm.r * 1.3) : null;
      const t = ctx.currentTime;
      sm.chain.g.gain.setTargetAtTime(s ? s.g * 0.6 : 0, t, 0.3);
      if (sm.chain.pn.pan) sm.chain.pn.pan.setTargetAtTime(s ? s.pan : 0, t, 0.2);
    }
  }

  /* ============================================================ music director */
  const music = { cur: null, seq: null, lockId: null, lockDone: false, moodId: null, restUntil: 0, victoryAt: 0, victoryUntil: 0, stingUntil: 0, introUntil: 0, chaseUntil: 0, roamDiffSince: 0, ended: false, trackTape: 0 };
  function wantedLevel() {
    const w = N.wanted;
    if (w) { const l = w.level != null ? w.level : w.value != null ? w.value : w.meter; if (typeof l === 'number') return l; }
    return hooks.wanted || 0;
  }
  function currentRoamTrack() {
    if (N.clock && N.clock.isNight && N.clock.isNight()) return 'night';
    const d = amb.district;
    if (d && (d.style === 'oldcity' || d.id === 'oldcity' || d.id === 'charminar')) return 'oldcity';
    if (d && (d.style === 'hitec' || /hitec|madhapur|cyber/.test(String(d.id)))) return 'hitec';
    if (d && (d.style === 'cantonment' || /secunderabad|cantonment/.test(String(d.id)))) return 'cantonment';
    return 'day';
  }
  function desiredTrack(mode) {
    const now = ctx.currentTime;
    if (music.lockId) return music.lockDone ? null : music.lockId;
    if (mode === 'boot') return null;
    if (mode === 'title') return 'title';
    if (mode === 'gameover') return null;
    if (radio.on && radio.seq) return null;
    if (walkman.seq) return null;
    if (music.stingUntil > now) return null;
    if (wantedLevel() >= 3) music.chaseUntil = now + 4; // keep the chase going a moment after escaping
    if (music.chaseUntil > now) return 'chase';
    if (music.victoryUntil > now) return now >= music.victoryAt ? 'victory' : null;
    if (music.moodId) return music.moodId;
    if (music.introUntil > now) return 'title';
    const m = N.missions && N.missions.active;
    if (m && typeof m === 'object' && typeof m.music === 'string' && TRACKS[m.music]) return m.music;
    if (music.restUntil > now) return null;
    // free roam: don't flip-flop at district borders; switch only after the new area held for 10 s
    const r = currentRoamTrack();
    const cur = music.cur, curRoam = cur && TRACKS[cur] && TRACKS[cur].roam;
    if (curRoam && r !== cur) {
      if (!music.roamDiffSince) music.roamDiffSince = now;
      if (now - music.roamDiffSince < 10) return cur;
    } else music.roamDiffSince = 0;
    return r;
  }
  function startMusic(id, fadeIn) {
    if (music.seq) { music.seq.stop(id ? 1.4 : 2.2); liveSeqs.delete(music.seq); }
    music.seq = null; music.cur = id || null; music.trackTape = 0;
    if (!id || !TRACKS[id]) { music.cur = null; return; }
    const tr = resolveTrack(id);
    music.seq = new Seq(ctx, id, G.music, { startTime: ctx.currentTime + 0.1, fadeIn: fadeIn != null ? fadeIn : id === 'title' || id === 'ending' ? 2.5 : 0.8,
      revIn: G.revIn, live: true, maxPasses: tr.roam ? 1 : 0 });
    liveSeqs.add(music.seq);
    music.trackTape = tr.tape || 0;
  }
  function musicUpdate(mode) {
    const now = ctx.currentTime;
    const sq = music.seq;
    if (sq && sq.done && !sq.stopped && now > sq.endTime + 0.3) {
      const id = music.cur;
      liveSeqs.delete(sq); sq.release(); music.seq = null; music.cur = null;
      if (id && id === music.lockId) { music.lockDone = true; music.ended = true; try { N.emit('music:ended', { id }); } catch (e) { /* ignore */ } }
      else if (TRACKS[id] && TRACKS[id].roam) music.restUntil = now + rr(25, 50);
      if (id === 'victory') music.victoryUntil = 0;
      return;
    }
    const want = desiredTrack(mode);
    if (want !== music.cur) startMusic(want);
  }

  /* ============================================================ radio */
  const radio = { on: false, idx: 0, seq: null, item: 0, frame: -1e9, epoch: STATIONS.map(() => rnd() * 600), veh: null, lastText: '' };
  function playlist(i) {
    const st = STATIONS[i], items = [];
    for (const s of st.songs) { items.push({ id: st.ident, ident: true }); items.push({ id: s }); }
    for (const it of items) { const c = compile(it.id); it.dur = c.loopStep >= 0 ? c.duration + c.loopDur : c.duration; it.dur += 0.6; }
    return items;
  }
  const PLAYLISTS = [];
  function vehicleHasRadio(v) {
    if (!v) return false;
    const T = N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[v.type];
    if (T && typeof T.radio === 'boolean') return T.radio;
    return /^(auto|ambassador|padmini|maruti800|bus|lorry)$/.test(v.type) || /car|taxi|jeep|van/.test(String(v.type));
  }
  function toast(text, ms) {
    radio.lastText = text;
    try { if (N.hud && typeof N.hud.toast === 'function') N.hud.toast(text, ms || 4500, { key: 'radio' }); } catch (e) { /* ignore */ }
  }
  function radioStartItem(k, startTime, offset) {
    const pl = PLAYLISTS[radio.idx];
    k = ((k % pl.length) + pl.length) % pl.length;
    radio.item = k;
    const it = pl[k];
    const c = compile(it.id);
    let step = 0;
    if (offset > 0) { while (step < c.total - 1 && c.times[step] < offset) step++; }
    if (radio.seq) { if (radio.seq.done) radio.seq.release(); else radio.seq.stop(0.05); liveSeqs.delete(radio.seq); }
    radio.seq = new Seq(ctx, it.id, G.radio, { startTime, offsetStep: step, live: true, maxPasses: c.loopStep >= 0 ? 2 : 0, fadeIn: offset > 0 ? 0.3 : 0.02 });
    liveSeqs.add(radio.seq);
    const st = STATIONS[radio.idx];
    if (it.ident) {
      const next = pl[(k + 1) % pl.length];
      const song = SONGS[next.id];
      const line = pick(st.lines);
      setTimeout(() => { if (radio.on && radio.item === k) toast(st.name + ' — ' + line + (song ? '  Agla geet: "' + song.title + '"' : ''), 5200); }, Math.max(0, (startTime - ctx.currentTime) * 1000));
    }
  }
  function radioTune(i, quiet) {
    if (!ctx || !G) return;
    radio.idx = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    radio.on = true;
    if (!PLAYLISTS[radio.idx]) PLAYLISTS[radio.idx] = playlist(radio.idx);
    const pl = PLAYLISTS[radio.idx];
    const total = pl.reduce((a, b) => a + b.dur, 0);
    let pos = (ctx.currentTime + radio.epoch[radio.idx]) % total, k = 0;
    while (pos > pl[k].dur) { pos -= pl[k].dur; k++; }
    const now = ctx.currentTime;
    if (!quiet) SFX.radio_static(ctx, G.radio, now, { dur: 0.35 });
    if (pl[k].ident) radioStartItem(k + 1, now + 0.4, 0);
    else radioStartItem(k, now + 0.4, pos);
    const st = STATIONS[radio.idx];
    toast('♪ ' + st.name + ' — ' + st.show, 2600);
    try { N.emit('radio:station', { station: radio.idx, name: st.name }); } catch (e) { /* ignore */ }
  }
  function radioOff(quiet) {
    if (radio.seq) { radio.seq.stop(quiet ? 0.4 : 0.05); liveSeqs.delete(radio.seq); radio.seq = null; }
    if (radio.on && !quiet && ctx) SFX.radio_static(ctx, G.radio, ctx.currentTime, { dur: 0.12 });
    radio.on = false;
  }
  function radioUpdate() {
    const sq = radio.seq;
    if (!radio.on || !sq) return;
    if (sq.done && ctx.currentTime > sq.endTime - LOOKAHEAD - 0.05 && sq.endTime !== Infinity) {
      radioStartItem(radio.item + 1, Math.max(ctx.currentTime + 0.05, sq.endTime + 0.6), 0);
    }
  }
  A.radio = {
    STATIONS: STATIONS.map((s) => ({ id: s.id, name: s.name, show: s.show, songs: s.songs.slice() })),
    get on() { return radio.on; },
    get station() { return radio.on ? radio.idx : -1; },
    get text() { return radio.lastText; },
    next() {
      if (!ctx) return -1;
      const pnow = performance.now();
      if (pnow - radio.frame < 80) return radio.on ? radio.idx : -1;
      radio.frame = pnow;
      const nxt = !radio.on ? 0 : radio.idx + 1;
      if (nxt >= STATIONS.length) { radioOff(); toast('Radio off', 1500); }
      else radioTune(nxt);
      if (radio.veh) radio.veh._radioStation = radio.on ? radio.idx : -1;
      return radio.on ? radio.idx : -1;
    },
    set(i) { if (!ctx) return; if (i == null || i < 0) radioOff(); else radioTune(i); if (radio.veh) radio.veh._radioStation = radio.on ? radio.idx : -1; },
    off() { radioOff(); if (radio.veh) radio.veh._radioStation = -1; },
    toggle() { if (radio.on) A.radio.off(); else A.radio.set(radio.idx || 0); return radio.on; },
  };

  /* ============================================================ walkman / 2-in-1 */
  const walkman = { seq: null, cur: null, idx: 0, library: ['title'], paused: null, speaker: false };
  function walkmanStart(id, quiet) {
    if (!ctx || !TRACKS[id]) return false;
    if (walkman.seq) { walkman.seq.stop(0.1); liveSeqs.delete(walkman.seq); }
    if (!quiet) SFX.tape_click(ctx, G.ui, ctx.currentTime, {});
    walkman.cur = id;
    const k = walkman.library.indexOf(id); if (k >= 0) walkman.idx = k;
    walkman.seq = new Seq(ctx, id, G.walk, { startTime: ctx.currentTime + 0.35, live: true, loop: false, revIn: G.revIn, fadeIn: 0.1 });
    liveSeqs.add(walkman.seq);
    const s = SONGS[id];
    toast('▶ ' + (s ? s.title + ' — ' + s.artist : id), 3200);
    return true;
  }
  function walkmanUpdate() {
    const sq = walkman.seq;
    if (radio.on && radio.seq && sq) { walkman.paused = walkman.cur; sq.stop(0.3); liveSeqs.delete(sq); walkman.seq = null; return; }
    if (!sq && walkman.paused && !(radio.on && radio.seq)) { const id = walkman.paused; walkman.paused = null; walkmanStart(id); return; }
    if (sq && sq.done && ctx.currentTime > sq.endTime + 0.8) {
      liveSeqs.delete(sq); sq.release(); walkman.seq = null;
      const lib = walkman.library;
      if (lib.length) walkmanStart(lib[(walkman.idx + 1) % lib.length]);
    }
  }
  A.walkman = {
    get playing() { return walkman.seq ? walkman.cur : null; },
    get library() { return walkman.library.slice(); },
    unlock(id) { if (TRACKS[id] && walkman.library.indexOf(id) < 0) walkman.library.push(id); return walkman.library.slice(); },
    /** Replace the song list (storycore: the found cassettes' songs in found order). */
    setLibrary(list) { walkman.library = (Array.isArray(list) ? list : []).filter((id) => TRACKS[id]); if (walkman.idx >= walkman.library.length) walkman.idx = 0; return walkman.library.slice(); },
    play(id) { id = id || walkman.library[walkman.idx] || 'title'; A.walkman.unlock(id); walkman.paused = null; return walkmanStart(id); },
    stop() { walkman.paused = null; if (walkman.seq) { walkman.seq.stop(0.2); liveSeqs.delete(walkman.seq); walkman.seq = null; if (ctx) SFX.tape_click(ctx, G.ui, ctx.currentTime, {}); } walkman.cur = null; },
    next() { const lib = walkman.library; if (!lib.length) return false; walkman.idx = (walkman.idx + 1) % lib.length; return walkmanStart(lib[walkman.idx]); },
    rewind() { if (!ctx) return false; playSfx('rewind', { ui: true }); const id = walkman.cur || walkman.library[walkman.idx]; if (walkman.seq) { walkman.seq.stop(0.05); liveSeqs.delete(walkman.seq); walkman.seq = null; } setTimeout(() => { if (id) walkmanStart(id, true); }, 1400); return true; },
  };

  /* ============================================================ event hooks + fallbacks */
  const hooks = { objText: null, hornEvt: false, hornFrame: -1, footEvt: -10, bumpEvt: false, wantedEvt: false, wanted: 0, dialogue: false, lastSpeed: 0, footT: 0, hornRepeat: 0, prevWanted: 0, lastVeh: null };
  function hornFor(type) {
    const t = String(type || '');
    if (!t || t === 'foot') return 'finger_whistle';
    const pr = engProfile(t);
    if (pr.kind === 'pedal') return 'bell';
    if (t === 'auto') return 'auto_horn';
    if (/luna|chetak|rx100|scooter|scooty|bike|moped/.test(t) || pr === ENGINES.scooty) return 'scooter_horn';
    if (t === 'bus') return 'bus_horn';
    if (t === 'lorry' || /truck|tractor/.test(t)) return 'lorry_horn';
    if (t === 'boat') return 'bus_horn';
    return 'car_horn';
  }
  A.horn = function (v, o) {
    const type = typeof v === 'string' ? v : v && v.type;
    const pos = {};
    if (o && o.x != null) { pos.x = o.x; pos.y = o.y; } else if (v && typeof v === 'object' && v.x != null && v !== (N.player && N.player.vehicle)) { pos.x = v.x; pos.y = v.y; }
    const name = hornFor(type);
    const VT = N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[type];
    const extra = {};
    if (name === 'bell' && VT && VT.bell) extra.variant = VT.bell;           // A3: Hero vs Hercules bells
    if (name === 'scooter_horn' && engProfile(type) === ENGINES.scooty) extra.pitch = 1.35; // the Scooty's thin "peep peep"
    return playSfx(name, Object.assign(pos, type === 'boat' ? { pitch: 0.7 } : {}, extra, o && o.dur ? { dur: o.dur } : {}));
  };
  function speakerPitch(id) {
    try { const sp0 = N.dialogue && N.dialogue.speakers && N.dialogue.speakers[id]; if (sp0 && sp0.pitch) return sp0.pitch; } catch (e) { /* ignore */ }
    if (!id) return 1;
    return 0.8 + U.strHash(String(id)) % 1000 / 1000 * 0.5;
  }
  function onVehicleEnter(v) {
    if (!v || !G) return;
    const type = v.type, pr = engProfile(type);
    const o = { x: v.x, y: v.y };
    const VT = N.vehicles && N.vehicles.TYPES && N.vehicles.TYPES[type];
    if (pr.kind === 'pedal') playSfx('bell', Object.assign({ rings: 1, vol: 0.5, variant: VT && VT.bell }, o));
    else if (type === 'auto') playSfx('auto_start', o);
    else if (pr.kind === '2t') playSfx('chetak_start', Object.assign({ pitch: pr === ENGINES.scooty ? 1.55 : type === 'luna' ? 1.35 : type === 'rx100' ? 1.2 : type === 'boat' ? 0.8 : 1, dur: pr === ENGINES.scooty ? 0.8 : undefined }, o));
    else if (pr.kind === 'diesel') playSfx('diesel_start', o);
    else { playSfx('door', o); playSfx('car_start', Object.assign({ delay: 0.25 }, o)); }
    radio.veh = v;
    if (vehicleHasRadio(v)) {
      if (v._radioStation == null) v._radioStation = type === 'auto' ? pick([0, 1]) : type === 'bus' || type === 'lorry' ? pick([0, 1]) : (rnd() * 3) | 0;
      if (v._radioStation >= 0) setTimeout(() => { if (radio.veh === v && N.player && N.player.vehicle === v) radioTune(v._radioStation); }, 900);
    }
  }
  function onVehicleExit(v) {
    if (!G) return;
    const pr = engProfile(v && v.type);
    if (v && pr.kind !== 'pedal' && !/2t/.test(pr.kind)) playSfx('door', { x: v.x, y: v.y });
    if (radio.on && vehicleHasRadio(v)) radioOff(true); // the walkman's radio band (bikes, on foot) keeps playing
    radio.veh = null;
  }
  function pollVehicle() {
    const v = (N.player && N.player.vehicle) || null;
    if (v !== hooks.lastVeh) {
      if (hooks.lastVeh) onVehicleExit(hooks.lastVeh);
      if (v) onVehicleEnter(v);
      hooks.lastVeh = v;
    }
  }
  function fallbacks(dt, mode) {
    const p = N.player;
    if (mode !== 'play' || !p || typeof p.x !== 'number') return;
    const now = ctx.currentTime;
    const I = N.input;
    const v = p.vehicle;
    // horn (only if nobody emits horn events)
    if (I && !hooks.hornEvt) {
      if (I.pressed && I.pressed('horn')) { A.horn(v ? v : 'foot'); hooks.hornRepeat = now + 0.38; }
      else if (v && I.down && I.down('horn') && now > hooks.hornRepeat && /car_horn|bus_horn/.test(hornFor(v.type))) { playSfx(hornFor(v.type), { force: true, dur: 0.42 }); hooks.hornRepeat = now + 0.38; }
    }
    // radio button
    if (I && I.pressed && I.pressed('radio') && v && vehicleHasRadio(v)) A.radio.next();
    // footsteps (only if no footstep events lately)
    if (!v && now - hooks.footEvt > 1.5) {
      const sp0 = Math.hypot(p.vx || 0, p.vy || 0);
      if (sp0 > 12) {
        hooks.footT -= dt;
        if (hooks.footT <= 0) {
          hooks.footT = clamp(17 / sp0, 0.2, 0.55);
          let surf = 'road';
          try { if (N.world && N.world.surfaceAt) surf = N.world.surfaceAt(p.x, p.y); } catch (e) { /* ignore */ }
          playSfx('step', { surface: surf, run: sp0 > 60 || p.running });
        }
      } else hooks.footT = 0.05;
    }
    // bumps for the player's vehicle (sudden speed loss) when nobody emits bump events
    if (v && !hooks.bumpEvt) {
      const s = vSpeed(v);
      const dv = hooks.lastSpeed - s;
      if (dt > 0 && dt < 0.1 && dv > Math.max(55, hooks.lastSpeed * 0.45)) playSfx(dv > 90 ? 'crash' : 'bump', { vol: clamp(dv / 120, 0.3, 1.2) });
      hooks.lastSpeed = s;
    } else hooks.lastSpeed = 0;
    // wanted level changes (when nobody emits wanted:change)
    if (!hooks.wantedEvt) {
      const w = wantedLevel();
      if (w > hooks.prevWanted) playSfx('wanted_up');
      else if (w < hooks.prevWanted) playSfx('wanted_down');
      hooks.prevWanted = w;
    }
  }
  function bindEvents() {
    const on = (names, fn) => names.forEach((n) => N.on(n, (d) => { try { if (G) fn(d == null ? {} : d); } catch (e) { N.err('audio.evt.' + n, e); } }));
    on(['horn', 'vehicle:horn'], (d) => {
      hooks.hornEvt = true;
      const v = d.vehicle || (d.type ? d : null);
      A.horn(v || (N.player && N.player.vehicle) || 'foot', d.x != null && (!N.player || d.vehicle !== N.player.vehicle) ? { x: d.x, y: d.y, dur: d.dur } : { dur: d.dur });
    });
    on(['bump', 'collision', 'vehicle:bump', 'player:bump'], (d) => {
      // entities.js emits {a, b, nx, ny, speed} for every solid pair; only vehicles and the player make noise
      const a = d.a, b = d.b, pl = N.player, pv = pl && pl.vehicle;
      if (d.type === 'chappal' || d.kind === 'chappal') { playSfx('chappal', { x: d.x, y: d.y }); return; }
      const mine = !!pl && (a === pl || b === pl || (!!pv && (a === pv || b === pv)));
      const veh = (a && a.kind === 'vehicle') || (b && b.kind === 'vehicle') || d.vehicle;
      if (mine && pv) hooks.bumpEvt = true;
      if (!mine && !veh && d.x == null) return;
      let x = d.x, y = d.y;
      if (x == null && a && b && typeof a.x === 'number' && typeof b.x === 'number') { x = (a.x + b.x) / 2; y = (a.y + b.y) / 2; }
      const f = d.force != null ? d.force : d.impact != null ? d.impact : d.speed != null ? d.speed : 60;
      const o = { vol: clamp(f / 110, 0.25, 1.2) * (veh ? 1 : 0.5) };
      if (!(mine && pv)) { o.x = x; o.y = y; }
      playSfx(veh && f > 70 ? 'crash' : 'bump', o);
    });
    on(['pickup', 'collectible', 'collectible:found', 'item:pickup'], (d) => {
      const k = String(d.kind || d.type || d.id || '');
      if (/money|coin|rupee|cash/.test(k)) playSfx('coin', { ui: true });
      else if (/goli|marble/.test(k)) { playSfx('marble', { ui: true }); playSfx('pickup', { ui: true, delay: 0.1 }); }
      else if (/cassette|tape/.test(k)) { playSfx('tape_click', { ui: true }); playSfx('pickup', { ui: true, delay: 0.1 }); }
      else playSfx('pickup', { ui: true });
    });
    on(['money'], (d) => { if ((d.delta || d.amount || 0) > 0) playSfx('coin', { ui: true }); });
    on(['mission:start'], () => { playSfx('objective', { ui: true }); music.victoryUntil = 0; });
    on(['objective'], () => playSfx('objective', { ui: true }));
    on(['hud:objective'], (d) => { if (typeof d === 'string' && d && d !== hooks.objText) playSfx('objective', { ui: true }); hooks.objText = typeof d === 'string' ? d : null; });
    on(['mission:complete', 'mission:pass', 'mission:passed'], () => {
      playSfx('mission_passed', { ui: true });
      const now = ctx.currentTime;
      music.victoryAt = now + 2.4; music.victoryUntil = now + 2.4 + compile('victory').duration + 0.5;
      music.moodId = null;
    });
    on(['mission:fail', 'mission:failed'], () => { playSfx('mission_failed', { ui: true }); music.stingUntil = ctx.currentTime + 3; music.moodId = null; music.victoryUntil = 0; });
    on(['wanted:change', 'wanted'], (d) => {
      hooks.wantedEvt = true;
      const l = typeof d === 'number' ? d : d.level != null ? d.level : d.value != null ? d.value : d.to;
      const prev = d.prev != null ? d.prev : d.from != null ? d.from : hooks.wanted;
      if (typeof l === 'number') { if (l > prev) playSfx('wanted_up'); else if (l < prev) playSfx('wanted_down'); hooks.wanted = l; }
    });
    on(['wanted:seen'], () => { hooks.seenAt = ctx.currentTime; });
    on(['busted', 'player:busted'], () => { playSfx('busted', { ui: true }); music.stingUntil = ctx.currentTime + 4; music.victoryUntil = 0; });
    on(['wasted', 'player:wasted'], () => { playSfx('wasted', { ui: true }); music.stingUntil = ctx.currentTime + 4; music.victoryUntil = 0; });
    on(['player:exhausted'], () => playSfx('pant'));
    on(['dialogue:open', 'dialogue:start'], () => { hooks.dialogue = true; });
    on(['dialogue:close', 'dialogue:end'], () => { hooks.dialogue = false; });
    on(['dialogue:char', 'dialogue:type', 'dialogue:blip'], (d) => playSfx('type', { ui: true, pitch: d.pitch || speakerPitch(d.speaker || d.s) }));
    on(['player:enterVehicle', 'vehicle:enter', 'player:exitVehicle', 'vehicle:exit'], () => pollVehicle());
    on(['footstep', 'player:step'], (d) => {
      const pl = N.player;
      if (d.who && pl && d.who !== pl) { playSfx('step', { x: d.x, y: d.y, surface: d.surface != null ? d.surface : d.surf, run: d.run, vol: 0.6, max: 260 }); return; }
      hooks.footEvt = ctx.currentTime;
      playSfx('step', { surface: d.surface != null ? d.surface : d.surf, run: d.run });
    });
    on(['kite:cut'], (d) => { playSfx('kite_cut', { x: d.x, y: d.y }); playSfx('bo_kaata', { x: d.x, y: d.y, delay: 0.25 }); });
    on(['radio:next'], () => A.radio.next());
    on(['flashback', 'cutscene:vhs'], (d) => { playSfx('rewind', { ui: true }); if (d.tape != null) A.tape(d.tape); });
    on(['shop:buy', 'purchase'], () => playSfx('cash', { ui: true }));
    on(['door'], (d) => playSfx(d.kind === 'wood' || d.creak ? 'door_creak' : 'door', { x: d.x, y: d.y }));
    on(['splash', 'player:splash'], (d) => playSfx('splash', { x: d.x, y: d.y, vol: d.vol }));
    on(['save', 'save:done', 'game:saved'], () => playSfx('tape_click', { ui: true }));
    on(['sfx'], (d) => { if (d.name) playSfx(d.name, d); });
    // A fresh game (with its intro) opens on the title theme until the story asks for something else or ~40 s pass.
    on(['game:new'], (d) => { music.introUntil = d.skipIntro ? 0 : ctx.currentTime + 40; music.restUntil = 0; });
    on(['mission:start', 'game:quit'], () => { music.introUntil = 0; });
    on(['music'], (d) => { if (d.mood !== undefined) A.music.mood(d.mood); else if (d.id !== undefined) A.music.play(d.id, d); });
  }
  bindEvents();

  /* ============================================================ unlock, buses, system */
  const liveSeqs = new Set();
  let manualTape = 0;
  const busState = { duck: -1, muffle: -1, tape: -1, wduck: -1 };
  function pump() {
    if (!ctx || hidden) return;
    const until = ctx.currentTime + LOOKAHEAD;
    for (const s of liveSeqs) {
      try { s.schedule(until); } catch (e) { N.err('audio.pump', e); }
      if (s.stopped) liveSeqs.delete(s);
    }
    if (amb.spatial) { try { amb.spatial.seq.schedule(until); } catch (e) { N.err('audio.pump', e); } }
  }
  function busUpdate(mode) {
    const t = ctx.currentTime;
    const dlg = hooks.dialogue || mode === 'dialogue';
    const menu = mode === 'paused' || mode === 'map' || mode === 'journal';
    const duck = menu ? 2 : dlg || A._duck ? 1 : 0;
    if (duck !== busState.duck) {
      busState.duck = duck;
      const md = duck === 2 ? 0.55 : duck === 1 ? A._duckAmt : 1;
      G.musicDuck.gain.setTargetAtTime(md, t, 0.18);
      G.radioDuck.gain.setTargetAtTime(duck ? 0.45 : 1, t, 0.18);
      G.worldDuck.gain.setTargetAtTime(duck === 2 ? 0.5 : duck === 1 ? 0.8 : 1, t, 0.2);
    }
    // walkman: 40% under dialogue, 70% for 3 s after a pursuer sees Chinnu (so he hears the whistle)
    let seen = t - (hooks.seenAt || -10) < 3;
    try { if (N.wanted && N.wanted.seen && (N.wanted.level | 0) > 0) seen = true; } catch (e) { /* ignore */ }
    const wd = menu ? 0.55 : dlg ? 0.4 : seen ? 0.7 : 1;
    if (wd !== busState.wduck && G.walkDuck) { busState.wduck = wd; G.walkDuck.gain.setTargetAtTime(wd, t, 0.15); }
    const muffle = menu ? 1 : 0;
    if (muffle !== busState.muffle) { busState.muffle = muffle; G.worldLP.frequency.setTargetAtTime(muffle ? 650 : 20000, t, 0.12); }
    let vhs = 0;
    try { vhs = (N.render && N.render.fx && N.render.fx.vhs) || 0; } catch (e) { vhs = 0; }
    const tape = clamp(Math.max(manualTape, vhs, music.trackTape, walkman.seq ? 0.22 : 0), 0, 1);
    if (Math.abs(tape - busState.tape) > 0.01) {
      busState.tape = tape;
      G.wowD.gain.setTargetAtTime(tape * 0.0019, t, 0.1);
      G.flutD.gain.setTargetAtTime(tape * 0.00025, t, 0.1);
      G.tapeLP.frequency.setTargetAtTime(tape > 0.01 ? 20000 * (1 - 0.72 * tape) : 20000, t, 0.1);
      G.hiss.gain.setTargetAtTime(tape * 0.012, t, 0.1);
    }
  }
  A._duck = false; A._duckAmt = 0.32;

  // Idle-time warm-up after unlock: compile every track, then render the Karplus-Strong buffers the
  // score needs (roam tracks first), a few ms per slice, so first plays never hitch a frame.
  function warmup() {
    const order = ['title', 'day', 'night', 'oldcity', 'hitec', 'cantonment', 'chase', 'tension', 'ending', 'victory', 'flashback', 'festival', 'numaish', 'kites',
      'r_chandni', 'r_barish', 'r_baraat', 'r_neon', 'r_pager', 'id_vani', 'id_band', 'id_pop'];
    const jobs = [];
    const seen = new Set();
    for (const id of order) {
      jobs.push(() => {
        const c = compile(id);
        for (const evs of c.events) if (evs) for (const e of evs) {
          const inst = c.parts[e.part].inst;
          if (!KS_DEF[inst] || e.k !== 'n') continue;
          for (const m of e.notes) {
            const a = m - (((m % 2) + 2) % 2), key = inst + ':' + a;
            if (!seen.has(key)) { seen.add(key); jobs.push(() => { if (ctx) ksBuffer(ctx, inst, a); }); }
          }
        }
      });
    }
    const ric = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 6 }), 60));
    const slice = (dl) => {
      const t0 = performance.now();
      while (jobs.length && performance.now() - t0 < Math.min(6, Math.max(2, dl.timeRemaining()))) {
        try { jobs.shift()(); } catch (e) { N.err('audio.warmup', e); }
      }
      if (jobs.length) ric(slice, { timeout: 500 });
    };
    ric(slice, { timeout: 500 });
  }

  function initContext() {
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    G = buildGraph(ctx, ctx.destination);
    applyVolumes();
    amb.L = buildAmbient();
    timer = setInterval(pump, TICK_MS);
    setTimeout(() => { try { warmDrums(ctx.sampleRate); warmup(); } catch (e) { N.err('audio.warm', e); } }, 400);
    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden;
      if (!ctx) return;
      try { if (hidden) ctx.suspend(); else if (unlocked) ctx.resume(); } catch (e) { /* ignore */ }
    });
  }
  A.unlock = function () {
    try {
      if (!AC) return false;
      if (!ctx) initContext();
      if (ctx.state !== 'running' && ctx.resume) { const pr = ctx.resume(); if (pr && pr.catch) pr.catch(() => {}); }
      // iOS: play one silent sample inside the gesture
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      if (!unlocked) { unlocked = true; try { N.emit('audio:unlocked', {}); } catch (e) { /* ignore */ } }
      return true;
    } catch (e) { N.err('audio.unlock', e); return false; }
  };
  // First gesture anywhere unlocks; later gestures resume a context the OS suspended/interrupted (iOS calls, Bluetooth switches).
  const gesture = () => {
    if (!unlocked) { A.unlock(); return; }
    if (ctx && ctx.state !== 'running' && !hidden) { try { const pr = ctx.resume(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ } }
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, gesture, { capture: true, passive: true });

  const STAGES = [['pump', () => pump()], ['bus', (dt, m) => busUpdate(m)], ['vehicle', () => pollVehicle()], ['engine', (dt, m) => engineUpdate(dt, m)],
    ['ambient', (dt, m) => ambientUpdate(dt, m)], ['radio', () => radioUpdate()], ['walkman', () => walkmanUpdate()], ['music', (dt, m) => musicUpdate(m)],
    ['fallbacks', (dt, m) => fallbacks(dt, m)], ['beacon', (dt, m) => beaconUpdate(m)]];
  function update(dt) {
    if (!ctx || !unlocked || hidden) return;
    const mode = (N.state && N.state.mode) || 'play';
    dt = dt || 0;
    const prof = A._profile;
    for (const st of STAGES) {
      if (!prof) { st[1](dt, mode); continue; }
      const t0 = performance.now(); st[1](dt, mode); const d = performance.now() - t0;
      const r = prof[st[0]] || (prof[st[0]] = { tot: 0, max: 0, n: 0 }); r.tot += d; r.n++; if (d > r.max) r.max = d;
    }
  }
  function reset() {
    if (!ctx) return;
    music.lockId = null; music.lockDone = false; music.ended = false; music.moodId = null; music.victoryUntil = 0; music.stingUntil = 0; music.restUntil = 0; music.introUntil = 0; music.chaseUntil = 0;
    radioOff(true); A.walkman.stop(); manualTape = 0; beacon.target = null;
    hooks.wanted = 0; hooks.prevWanted = 0; hooks.dialogue = false;
  }
  N.addSystem({ id: 'audio', order: 70, runIn: ['*'], update, reset });

  /* ============================================================ beacon, REC, tape montage, tape stop */
  // Hot/cold beacon: beeps faster and higher as the player nears a hidden thing ("tracking by sound").
  const beacon = { target: null, sound: 'detector', max: 900, next: 0 };
  function beaconUpdate(mode) {
    const b = beacon.target;
    if (!b || mode !== 'play') return;
    let tx, ty;
    if (typeof b === 'string') { const p = N.places && N.places[b]; if (!p) return; tx = p.x; ty = p.y; } else { tx = b.x; ty = b.y; }
    const L = listener();
    if (!L || typeof tx !== 'number') return;
    const d = Math.hypot(tx - L.x, ty - L.y);
    const k = clamp(d / beacon.max, 0, 1);
    const now = ctx.currentTime;
    if (now < beacon.next) return;
    beacon.next = now + U.lerp(0.09, 1.5, k);
    const dx = tx - L.x;
    playSfx(beacon.sound, { ui: true, pan: clamp(dx / 300, -1, 1) * 0.7, pitch: U.lerp(1.7, 0.75, k), vol: U.lerp(1, 0.45, k), force: true });
  }
  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
  // Play a list of SFX as if from a cassette (through the tape wow/flutter chain), e.g. Side A of the city's sounds.
  async function tapeMontage(names, o) {
    o = o || {};
    if (!ctx || !G) return false;
    const prevTape = manualTape;
    manualTape = Math.max(manualTape, o.tape == null ? 0.35 : o.tape);
    playSfx('tape_click', { ui: true });
    await delay(400);
    const list = names || [];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (!SFX[n]) continue;
      if (o.onItem) { try { o.onItem(i, n); } catch (e) { N.err('audio.montage.onItem', e); } }
      const strip = getStrip(ctx.currentTime);
      if (!strip) { await delay(Math.max(300, o.minStep || 0)); continue; }
      strip.route(G.walk);
      const now = ctx.currentTime;
      strip.in.gain.setValueAtTime(o.vol || 0.9, now);
      if (strip.pn.pan) strip.pn.pan.setValueAtTime(0, now);
      strip.lp.frequency.setValueAtTime(9000, now);
      strip.send.gain.setValueAtTime(0.12, now);
      let end = now + 1;
      try { end = SFX[n](ctx, strip.in, now + 0.02, o.opts && o.opts[n] || {}); } catch (e) { N.err('audio.montage', e); }
      strip.busy = end + 0.12;
      await delay(Math.max(300, o.minStep || 0, (end - now) * 1000 * (o.overlap || 0.8) + (o.gap || 250)));
    }
    playSfx('tape_click', { ui: true });
    manualTape = prevTape;
    return true;
  }
  // "■ STOP": the score slows down and stops like a tape deck (a long delay-line ramp drops the pitch).
  async function tapeStop(sec) {
    if (!ctx || !G) return false;
    sec = clamp(sec || 1.3, 0.2, 2.4);
    const t = ctx.currentTime, d = G.tape.delayTime;
    d.cancelScheduledValues(t); d.setValueAtTime(0.012, t); d.linearRampToValueAtTime(0.012 + sec * 0.92, t + sec);
    G.musicFade.gain.cancelScheduledValues(t); G.musicFade.gain.setValueAtTime(1, t); G.musicFade.gain.linearRampToValueAtTime(0, t + sec);
    G.tapeLP.frequency.setTargetAtTime(1500, t, sec / 3);
    playSfx('tape_stop', { ui: true, dur: sec * 0.8 });
    await delay(sec * 1000 + 60);
    A.music.stop(0.01);
    if (walkman.seq) A.walkman.stop();
    const t2 = ctx.currentTime;
    d.cancelScheduledValues(t2); d.setValueAtTime(0.012, t2 + 0.05);
    G.musicFade.gain.cancelScheduledValues(t2); G.musicFade.gain.setValueAtTime(0, t2); G.musicFade.gain.setValueAtTime(1, t2 + 0.1);
    busState.tape = -1;
    return true;
  }

  /* ============================================================ public API */
  Object.defineProperty(A, 'available', { get: () => !!AC });
  Object.defineProperty(A, 'ready', { get: () => !!ctx && ctx.state === 'running' && unlocked });
  Object.defineProperty(A, 'ctx', { get: () => ctx });
  Object.defineProperty(A, 'muted', { get: () => S.muted });
  A.settings = S;
  A.setVolume = function (bus, v) {
    if (!(bus in S) || bus === 'muted') return;
    S[bus] = clamp(+v || 0, 0, 1);
    applyVolumes(); saveSettings();
  };
  A.getVolume = (bus) => S[bus];
  A.mute = function (m) { S.muted = m == null ? true : !!m; applyVolumes(); saveSettings(); };
  A.toggleMute = function () { A.mute(!S.muted); return S.muted; };
  A.duck = function (on, amount) { A._duck = !!on; if (amount != null) A._duckAmt = clamp(amount, 0, 1); busState.duck = -1; };
  A.sfx = (name, o) => playSfx(name, o);
  A.SFX_NAMES = Object.keys(SFX);
  A.engine = function (v) { eng.forced = v === null ? undefined : v; };
  A.tape = function (amount) { manualTape = clamp(+amount || 0, 0, 1); };
  A.SONGS = SONGS;
  A.beacon = function (target, o) { beacon.target = target || null; beacon.sound = (o && o.sound && SFX[o.sound]) ? o.sound : 'detector'; beacon.max = (o && o.max) || 900; beacon.next = 0; };
  A.rec = function (name, o) { playSfx('rec', { ui: true }); if (name && SFX[name]) playSfx(name, Object.assign({ delay: 0.35, force: true }, o || {})); return name || null; };
  A.tapeMontage = (names, o) => tapeMontage(names, o);
  A.tapeStop = (sec) => tapeStop(sec);
  // N.audio.music is callable for compatibility with the stub: music('title') plays, music(null) stops.
  const musicApi = function (id, o) { return id == null || id === false ? musicApi.stop() : musicApi.play(id, o); };
  Object.defineProperty(musicApi, 'current', { get: () => music.cur });
  Object.defineProperty(musicApi, 'ended', { get: () => music.ended });
  A.music = Object.assign(musicApi, {
    TRACKS: Object.keys(TRACKS).filter((k) => !/^id_/.test(k)),
    title(id) { const t = TRACKS[id]; return t ? t.name || (TRACKS[t.base] && TRACKS[t.base].name) : null; },
    play(id, o) {
      if (!TRACKS[id]) return false;
      music.lockId = id; music.lockDone = false; music.ended = false;
      if (ctx && G) startMusic(id, o && o.fade);
      return true;
    },
    lock(id) { if (id == null) { music.lockId = null; music.lockDone = false; return; } A.music.play(id); },
    stop(fade) { music.lockId = null; music.lockDone = false; music.moodId = null; if (ctx && G) { if (music.seq) { music.seq.stop(fade == null ? 1.5 : fade); liveSeqs.delete(music.seq); } music.seq = null; music.cur = null; music.restUntil = ctx.currentTime + 6; } },
    mood(id) { music.moodId = id && TRACKS[id] ? id : null; if (music.moodId) music.victoryUntil = 0; },
    intro(on) { music.introUntil = on && ctx ? ctx.currentTime + (typeof on === 'number' ? on : 40) : 0; },
    // section start times (s) of a track, e.g. to sync the Charminar finale to the ending's key-change "lift"
    sections(id) { const c = TRACKS[id] && compile(id); return c ? c.tr.order.map((name, i) => ({ name, start: +c.times[c.secStart[i]].toFixed(3) })) : []; },
    position() { const sq = music.seq; return sq && ctx ? Math.max(0, ctx.currentTime - sq.t0) : 0; },
  });
  A.play = (name, o) => playSfx(name, o);     // stub alias of sfx()
  A.stopMusic = (fade) => A.music.stop(fade); // stub alias
  A.volume = S;                               // stub alias (same object as settings)
  A.ambient = {
    BEDS: Object.keys(BEDS),
    set(id) { amb.override = id && BEDS[id] ? id : null; amb.scanT = 0; amb.mixT = 0; },
    get bed() { return amb.bed; },
    get emitters() { return amb.active.map((a) => a.id); },
  };

  // ---- offline rendering (tests / tools)
  function analyse(buf) {
    let pk = 0, sum = 0, n = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) { const v = d[i], a = v < 0 ? -v : v; if (a > pk) pk = a; sum += v * v; n++; }
    }
    return { peak: pk, rms: Math.sqrt(sum / Math.max(1, n)), buffer: buf, duration: buf.duration };
  }
  A.renderOffline = function (what, seconds, opts) {
    if (!OAC) return Promise.resolve(null);
    seconds = seconds || 2; opts = opts || {};
    const sr = 44100, oc = new OAC(2, Math.ceil(sr * seconds), sr);
    const out = gain(oc, opts.gain || 1, oc.destination);
    try {
      if (typeof what === 'function') what(oc, out, 0.02);
      else if (SFX[what]) SFX[what](oc, out, 0.02, opts);
      else if (INST[what]) INST[what](oc, out, 0.02, opts.notes || [opts.midi || 62], opts.dur || 1, opts.vel || 1, opts.ev || {}, {});
      else if (KITS[what] && opts.stroke) KITS[what][opts.stroke](oc, out, 0.02, 1, opts.tune || 294);
      else return Promise.reject(new Error('renderOffline: unknown ' + what));
    } catch (e) { return Promise.reject(e); }
    return oc.startRendering().then(analyse);
  };
  A.renderTrackOffline = function (id, seconds, opts) {
    if (!OAC) return Promise.resolve(null);
    seconds = seconds || 8; opts = opts || {};
    const sr = 44100, oc = new OAC(2, Math.ceil(sr * seconds), sr);
    const g = buildGraph(oc, oc.destination);
    if (opts.radio) { const s = new Seq(oc, id, g.radio, { startTime: 0.05 }); s.schedule(seconds + 0.5); }
    else { const s = new Seq(oc, id, g.music, { startTime: 0.05, revIn: g.revIn, offsetStep: opts.offsetStep || 0 }); s.schedule(seconds + 0.5); }
    return oc.startRendering().then(analyse);
  };
  A.stats = function () {
    const now = ctx ? ctx.currentTime : 0;
    return {
      state: ctx ? ctx.state : 'none', unlocked, time: now, strips: strips.length, busyStrips: strips.filter((s) => s.busy > now).length,
      sfxPlayed, ksBuffers: KS.size, drumBuffers: DRUMS.size, music: music.cur, musicLock: music.lockId, radio: radio.on ? STATIONS[radio.idx].name : null,
      walkman: walkman.seq ? walkman.cur : null, bed: amb.bed, emitters: amb.active.length, spatialMusic: amb.spatial ? amb.spatial.id : null,
      engines: [eng.player, eng.traffic[0], eng.traffic[1]].filter(Boolean).map((e) => e.type), seqs: liveSeqs.size,
      beacon: beacon.target ? (typeof beacon.target === 'string' ? beacon.target : 'xy') : null,
    };
  };
  // live output meter (tests): RMS of the master output over the last ~46 ms
  let analyser = null, abuf = null;
  function meter() {
    if (!G) return 0;
    if (!analyser) { analyser = ctx.createAnalyser(); analyser.fftSize = 2048; G.master.connect(analyser); abuf = new Float32Array(analyser.fftSize); }
    analyser.getFloatTimeDomainData(abuf);
    let s0 = 0; for (let i = 0; i < abuf.length; i++) s0 += abuf[i] * abuf[i];
    return Math.sqrt(s0 / abuf.length);
  }
  // internals for tests/tools (not a gameplay API)
  A._internal = { TRACKS, SFX, INST, KITS, compile, Seq, STATIONS, BEDS, PLACE_SOUNDS, FESTIVALS, ENGINES, engineF, EngineVoice, buildGraph, ksBuffer, liveSeqs, DRUMS, warmDrums, drumQueue, meter, placeRule, amb, music, radio, eng, bus: () => G };
})();
