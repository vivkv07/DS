/* NOSTALGIA — audio.js  (owner: audio engineer)
 * Everything you hear, synthesised live with WebAudio (no samples, no files):
 *   - ~90 one-shot SFX (cycle bell, Chetak putt-putt, auto "pom pom", havaldar whistle, STD ring,
 *     pressure cooker, pindi girni thump, dial-up modem, cassette rewind ...) with distance
 *     attenuation + stereo pan relative to the player,
 *   - continuous engine voices per vehicle type (player + the 2 nearest traffic vehicles),
 *   - ambient beds per district style cross-faded by N.world.districtAt + data-driven place
 *     emitters (Koti bus stand horns, Gokul Chat sizzle, temple bells, stations, girnis, ...),
 *   - an original step-sequencer score (sitar/santoor/tanpura via Karplus-Strong, bansuri,
 *     shehnai, harmonium, strings, brass band, tabla/dholak/dappu/marfa kits, 90s synths),
 *   - a 3-station vehicle radio (fictional stations, songs, DJs) and the Walkman / 2-in-1.
 * Contract: ARCHITECTURE.md §2/§3/§5 (system order 70) and §16 (this module's API, mirrored below).
 *
 * PUBLIC API — N.audio
 *   unlock()                         Create/resume the AudioContext. Call from a user gesture (title START).
 *                                    Also auto-called on the first pointer/key gesture. Never throws.
 *   available, ready (getters)       WebAudio exists / context created and running.
 *   ctx                              the live AudioContext (or null).
 *   setVolume(bus, v) / getVolume(bus)   bus: 'master'|'music'|'sfx'|'radio'|'ambient', v 0..1 (persisted).
 *   mute(bool) / toggleMute() / muted    persisted in localStorage 'nostalgia.audio.v1' (try/catch).
 *   settings                         live settings object {master, music, sfx, radio, ambient, muted}.
 *   duck(on, amount=0.3)             manual music duck (dialogue ducks automatically).
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
 *   tape(amount 0..1)                cassette wow/flutter + muffle on the music bus (flashbacks);
 *                                    also follows N.render.fx.vhs automatically.
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
 *   mission:fail|failed · objective · wanted:change · busted, wasted, player:busted,
 *   player:wasted · dialogue:open|start, dialogue:close|end, dialogue:char|type|blip ·
 *   player:enterVehicle, player:exitVehicle, vehicle:enter, vehicle:exit · footstep, player:step ·
 *   kite:cut · radio:next · flashback, cutscene:vhs · shop:buy, purchase · door · splash · save ·
 *   state (core) · sfx ({name, x, y, ...} generic) · music ({id} or {mood}).
 * POLLED (so audio works even before other modules emit events): N.player(.vehicle), N.state.mode,
 *   N.wanted.level, N.world.districtAt/isWater, N.clock, N.render.fx.vhs, N.input (horn/radio
 *   fallbacks only when no horn/radio events have been seen), N.places (emitters), N.flags (festivals).
 * EMITS: 'audio:unlocked', 'audio:settings', 'radio:station' {station, name}.
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
  function gain(ac, v, dest) { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function filt(ac, type, f, q, dest) {
    const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f;
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
    const os = ac.createOscillator();
    if (o.wave) os.setPeriodicWave(typeof o.wave === 'string' ? wave(ac, o.wave) : o.wave);
    else os.type = o.type || 'sine';
    const a = o.a || 0.002, h = o.h || 0, r = o.r || 0.1, v = o.v == null ? 0.4 : o.v;
    os.frequency.setValueAtTime(o.f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(Math.max(5, o.f2), t + (o.glide || a + h + r * 0.5));
    if (o.detune) os.detune.value = o.detune;
    const end = t + a + h + r * 1.15 + 0.03;
    let lfo = null;
    if (o.vib) {
      lfo = ac.createOscillator(); lfo.frequency.value = o.vib[0];
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
    const fl = ac.createBiquadFilter(); fl.type = o.ft || 'bandpass';
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
      const os = ac.createOscillator(); os.type = 'sawtooth';
      const g = gain(ac, 0, bus);
      const det = (rnd() - 0.5) * (o.spread || 3);
      const jit = rnd() * (o.jitter == null ? 0.05 : o.jitter);
      const vib = ac.createOscillator(); vib.frequency.value = rr(4.5, 6.5);
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
    const f = 2350 * P(o) * rr(0.98, 1.02);
    const g = gain(ac, 0, out);
    const hits = [];
    const rings = o.rings || 2;
    for (let r = 0; r < rings; r++) for (let k = 0; k < 7; k++) hits.push([t + r * 0.36 + k * 0.034, (k ? 0.6 : 1) * (1 - k * 0.07)]);
    pulses(g.gain, hits, 0.55, 0.018);
    const end = t + rings * 0.36 + 0.7;
    g.gain.setTargetAtTime(0, end - 0.45, 0.12);
    for (const p of BELL) { const os = ac.createOscillator(); os.frequency.value = f * p[0]; const pg = gain(ac, p[1], g); os.connect(pg); os.start(t); os.stop(end); }
    return end;
  };
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
    const body = ac.createOscillator(); body.type = 'square'; body.frequency.value = 52 * p;
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
    const st = ac.createOscillator(); st.type = 'sawtooth'; st.frequency.value = 38;
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
    const os = ac.createOscillator(); os.type = 'sawtooth';
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
      const os = ac.createOscillator(); os.frequency.value = 2850 * p;
      const pea = ac.createOscillator(); pea.type = 'square'; pea.frequency.value = rr(31, 38);
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
    const os = ac.createOscillator(); os.type = 'square';
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
      const os = ac.createOscillator(); os.frequency.value = 1750 * P(o) * p[0];
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
    const fl = ac.createOscillator(); fl.type = 'triangle'; fl.frequency.value = rr(11, 15);
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
    const os = ac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = 49;
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
    const os = ac.createOscillator(); os.frequency.setValueAtTime(330, t); os.frequency.linearRampToValueAtTime(390, t + 0.25); os.frequency.linearRampToValueAtTime(300, t + 0.7);
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
    const os = ac.createOscillator(); os.type = 'sawtooth';
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

  // ---- radio static (also used by the radio)
  SFX.radio_static = (ac, out, t, o) => {
    const d = o.dur || 0.45;
    burst(ac, out, t, { ft: 'bandpass', f: 2200, q: 0.4, a: 0.01, h: d, r: 0.05, v: 0.35 });
    tone(ac, out, t, { f: rr(800, 2000), f2: rr(300, 3000), glide: d, a: 0.01, h: d, r: 0.03, v: 0.05 });
    for (let k = 0; k < 6; k++) burst(ac, out, t + rr(0, d), { ft: 'highpass', f: 3000, r: 0.008, v: 0.2 });
    return t + d + 0.08;
  };

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
    bansuri: { wave: 'flute', a: 0.07, sus: 0.85, r: 0.16, v: 0.36, vib: [5.2, 0.007], glide: 0.09, breath: 0.035, chiff: 0.05, scoop: 0.35 },
    shehnai: { wave: 'reed', a: 0.035, sus: 0.9, r: 0.1, v: 0.17, vib: [6.3, 0.011], glide: 0.11, breath: 0.012, filter: ['peaking', 1400, 1.2, 6], scoop: 0.9, legato: true },
    clarinet: { wave: 'clarinet', a: 0.03, sus: 0.85, r: 0.09, v: 0.26, vib: [5.4, 0.005], glide: 0.06, filter: ['lowpass', 2600, 0.7], scoop: 0.4, legato: true },
    trumpet: { wave: 'brass', a: 0.025, sus: 0.8, r: 0.08, v: 0.18, vib: [5.6, 0.005], glide: 0.05, filter: ['lowpass', 2900, 0.9], scoop: 1.2 },
    synlead: { type: 'square', a: 0.01, sus: 0.8, r: 0.12, v: 0.11, vib: [5.8, 0.006], glide: 0.07, filter: ['lowpass', 2400, 2], legato: true },
    whistle: { type: 'sine', a: 0.04, sus: 0.9, r: 0.1, v: 0.26, vib: [5.5, 0.008], glide: 0.06 },
    violin: { type: 'sawtooth', a: 0.12, sus: 0.9, r: 0.22, v: 0.1, vib: [5.6, 0.008], glide: 0.12, filter: ['lowpass', 2800, 0.8], legato: true },
    harmonium1: { wave: 'harmonium', a: 0.03, sus: 0.95, r: 0.08, v: 0.13, glide: 0.04, filter: ['lowpass', 2600, 0.6], legato: true },
  };
  function monoLead(cfg) {
    return (ac, out, t, notes, dur, vel, ev, st) => {
      const midi = notes[notes.length - 1], f = mtof(midi);
      const os = ac.createOscillator();
      if (cfg.wave) os.setPeriodicWave(wave(ac, cfg.wave)); else os.type = cfg.type;
      const fp = os.frequency;
      const leg = cfg.legato && st.lastEnd != null && Math.abs(t - st.lastEnd) < 0.04;
      const from = (ev.glide || leg) && st.lastF ? st.lastF : null;
      if (from && from !== f) { fp.setValueAtTime(from, t); fp.exponentialRampToValueAtTime(f, t + (ev.glide ? cfg.glide * 1.6 : cfg.glide)); }
      else if (cfg.scoop) { fp.setValueAtTime(f * Math.pow(2, -cfg.scoop / 12), t); fp.exponentialRampToValueAtTime(f, t + 0.06); }
      else fp.setValueAtTime(f, t);
      const end = t + dur + cfg.r * 1.3 + 0.03;
      if (cfg.vib && dur > 0.2) {
        const l = ac.createOscillator(); l.frequency.value = cfg.vib[0] * rr(0.94, 1.06);
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
      st.lastF = f; st.lastEnd = t + dur; st.lastMidi = midi;
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
      const os = ac.createOscillator(); os.setPeriodicWave(wave(ac, 'harmonium'));
      os.frequency.value = mtof(m); os.detune.value = det + rr(-1.5, 1.5);
      os.connect(lp); os.start(t); os.stop(end);
    }
  };
  INST.strings = (ac, out, t, notes, dur, vel) => { // filmi violin section
    const g = polyEnv(ac, out, t, dur, (vel * 0.075) / Math.sqrt(notes.length), 0.28, 0.55);
    const lp = filt(ac, 'lowpass', 2600, 0.5, g);
    const end = t + dur + 0.7;
    const vib = ac.createOscillator(); vib.frequency.value = 5.3;
    const vg = gain(ac, 9); vib.connect(vg); vib.start(t); vib.stop(end);
    for (const m of notes) for (const det of [-8, 7]) {
      const os = ac.createOscillator(); os.type = 'sawtooth';
      os.frequency.value = mtof(m); os.detune.value = det; vg.connect(os.detune);
      os.connect(lp); os.start(t); os.stop(end);
    }
  };
  INST.brass = (ac, out, t, notes, dur, vel) => { // band trumpets/trombones: scoop + filter "blat"
    const g = polyEnv(ac, out, t, dur, (vel * 0.11) / Math.sqrt(notes.length), 0.025, 0.1, 0.8);
    const lp = filt(ac, 'lowpass', 500, 1.2, g);
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.05); lp.frequency.setTargetAtTime(1700, t + 0.06, 0.12);
    const end = t + dur + 0.2;
    for (const m of notes) for (const det of [-6, 6]) {
      const os = ac.createOscillator(); os.setPeriodicWave(wave(ac, 'brass'));
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
      const os = ac.createOscillator(); os.type = 'sawtooth'; os.frequency.value = mtof(m); os.detune.value = det;
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
      const c = ac.createOscillator(); c.frequency.value = f;
      const mod = ac.createOscillator(); mod.frequency.value = f;
      const mg = ac.createGain(); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.35, t, 0.25);
      mod.connect(mg); mg.connect(c.frequency);
      const tine = ac.createOscillator(); tine.frequency.value = f * 14;
      const tg = ac.createGain(); tg.gain.setValueAtTime(f * 1.2, t); tg.gain.setTargetAtTime(0, t, 0.02);
      tine.connect(tg); tg.connect(c.frequency);
      c.connect(g);
      for (const o of [c, mod, tine]) { o.start(t); o.stop(end); }
    }
  };
  INST.bass = (ac, out, t, notes, dur, vel) => { // round plucked bass (film-orchestra / upright-ish)
    const m = notes[0], f = mtof(m);
    const g = polyEnv(ac, out, t, Math.min(dur, 0.9), vel * 0.42, 0.006, 0.12, 0.55);
    const lp = filt(ac, 'lowpass', 900, 0.7, g);
    lp.frequency.setValueAtTime(1400, t); lp.frequency.setTargetAtTime(500, t, 0.12);
    const end = t + Math.min(dur, 0.9) + 0.2;
    const a = ac.createOscillator(); a.type = 'triangle'; a.frequency.value = f;
    const b = ac.createOscillator(); b.frequency.value = f; const bg = gain(ac, 0.7, lp); b.connect(bg);
    a.connect(lp); a.start(t); b.start(t); a.stop(end); b.stop(end);
  };
  INST.synbass = (ac, out, t, notes, dur, vel) => { // resonant 90s synth bass
    const f = mtof(notes[0]);
    const g = polyEnv(ac, out, t, dur, vel * 0.22, 0.004, 0.06, 0.7);
    const lp = filt(ac, 'lowpass', 300, 6, g);
    lp.frequency.setValueAtTime(2400, t); lp.frequency.setTargetAtTime(320, t, 0.06);
    const end = t + dur + 0.12;
    const a = ac.createOscillator(); a.type = 'sawtooth'; a.frequency.value = f;
    const b = ac.createOscillator(); b.type = 'square'; b.frequency.value = f / 2; const bg = gain(ac, 0.5, lp); b.connect(bg);
    a.connect(lp); a.start(t); b.start(t); a.stop(end); b.stop(end);
  };
  INST.stab = (ac, out, t, notes, dur, vel) => { // house-piano/orchestra stab
    INST.epiano(ac, out, t, notes, Math.min(dur, 0.25), vel * 1.2);
    INST.brass(ac, out, t, notes, Math.min(dur, 0.18), vel * 0.6);
  };
  INST.bell = (ac, out, t, notes, dur, vel) => { for (const m of notes) strike(ac, out, t, mtof(m), BELL, vel * 0.18, 1.6); };
  INST.glock = (ac, out, t, notes, dur, vel) => { for (const m of notes) strike(ac, out, t, mtof(m), [[1, 0.5, 1], [2.76, 0.12, 0.4], [5.4, 0.05, 0.2]], vel * 0.2, 0.9); };

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
    const os = ac.createOscillator();
    os.frequency.setValueAtTime(76, t); os.frequency.linearRampToValueAtTime(100, t + 0.16); os.frequency.setTargetAtTime(94, t + 0.18, 0.2);
    const g = gain(ac, 0, out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.62 * v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.01, 0.13);
    os.connect(g); os.start(t); os.stop(t + 0.75);
    burst(ac, out, t, { kind: 'brown', ft: 'lowpass', f: 260, a: 0.001, r: 0.05, v: 0.4 * v });
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
    c: (ac, o, t, v) => { for (let k = 0; k < 3; k++) burst(ac, o, t + k * 0.011, { f: 1200, q: 1, a: 0.001, r: k === 2 ? 0.12 : 0.015, v: 0.4 * v }); },
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
    x: (ac, o, t, v) => { for (let k = 0; k < 5; k++) burst(ac, o, t + rr(0, 0.018), { f: rr(950, 1500), q: 1.1, a: 0.001, r: 0.045, v: 0.22 * v }); },
    X: (ac, o, t, v) => { for (let k = 0; k < 8; k++) burst(ac, o, t + rr(0, 0.022), { f: rr(900, 1600), q: 1.1, a: 0.001, r: 0.05, v: 0.22 * v }); },
  };

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
    for (const k in b.parts) if (!(tr.mute || []).includes(k)) parts[k] = b.parts[k];
    return Object.assign({}, b, tr, { parts, base: null });
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
            let notes = voiceChord(ch, center);
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
    const c = { id: key, name: tr.name, tr, meter, total, times, events, loopStep: loopTo, parts: tr.parts,
      tune: mtof(60 + (((tr.root % 12) + 12) % 12)), swing: tr.swing || 0, gain: tr.gain == null ? 1 : tr.gain,
      duration: times[total], loopDur: loop ? times[total] - times[loopTo] : 0, secStart };
    COMPILED.set(key, c);
    return c;
  }

  /* ============================================================ sequencer */
  // Seq plays a compiled track into `dest`, scheduling ahead of ac.currentTime. Part buses are
  // created once per Seq (gain/pan/reverb-send) and torn down after it stops.
  let seqCount = 0;
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
      seqCount++;
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
            const kit = KITS[p.cfg.kit];
            for (const s of ev.strokes) if (kit[s]) kit[s](ac, p.g, t, vel, c.tune);
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
      const out = this.out, parts = this.parts;
      setTimeout(() => { try { out.disconnect(); for (const k in parts) parts[k].pn.disconnect(); } catch (e) { /* ignore */ } }, (fade + 4) * 1000);
      seqCount--;
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
  const T_CH_A = '1 - - - | 6b:M - - - | 4 - - - | 4:m - - - | 1 - - - | 3:m - - - | 2:m - 5 - | 1 - - -';
  const T_MEL_A = '5 - - 3 5 - ^1 - | ^1 - - - 6b - 5 - | 4 - 5 - 6 - 5 4 | 6b - - 5 4 - 3 - | 3 - 5 - ^1 - ^2 - | ^3 - - ^2 ^1 - 7 - | ^1 - 7 6 5 - 7 - | ^1 - - - - - . .';
  const T_CH_B = '6:m - - - | 3:m - - - | 4 - - - | 1 - - - | 6:m - - - | 3:m - - - | 4 - 5 - | 5:s4 - 5 -';
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
      A: { bars: 8, cdiv: 6, chords: '1 - | 2 - | 1 - | 2 - | 6 - | 3 - | 2 - | 5 -', drone: '5 ^1 ^1 1', str: 'x - - - - - - - - - - -', bass: 'r f',
        santoor: 'r f o ^t o f', flute: '3 - - 5 - 3 | 4 - - 6 - 5 | 3 - 2 1 - 3 | 2 - - - - - | 6 - - ^1 - 7 | 5 - - 3 - 5 | 6 - 4 - 2 - | 5 - - - - -', tabla: DADRA, vol: { tabla: 0.7 } },
      B: { bars: 8, cdiv: 6, chords: '6 - | 3 - | 2 - | 1 - | 6 - | 5 - | 2 - | 5:s4 5', drone: '5 ^1 ^1 1', str: 'x - - - - - - - - - - -', bass: 'r f',
        santoor: 'r . o . ^t .', flute: '^1 - - 7 - 6 | 7 - - 5 - 3 | 4 - 6 - ^2 - | ^1 - - - 5 - | 6 - ^1 - ^3 - | ^2 - - 7 - 5 | 6 - 4 - 2 - | ^1 - - 7 - -', tabla: DADRA },
      A2: { bars: 8, cdiv: 6, chords: '1 - | 2 - | 1 - | 2 - | 6 - | 3 - | 2 - | 5 -', drone: '5 ^1 ^1 1', str: 'x - - - - - - - - - - -', bass: 'r f',
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
        shehnai: '1 2 3 2 1 - _7 1 | 2 - 3 4 3 2 1 - | 1 2 3 4 5 - 4 3 | 2 - - - - - . . | 4 - 5 6 5 - 4 3 | 4 - 3 2 3 - - - | 2 3 2 1 _7 - 1 2 | 1 - - - - - . .' },
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
    name: 'Charminar Ki Chaon', bpm: 64, root: 62, scale: 'major', meter: 16, loop: false, gain: 0.95,
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
      alaap: { bars: 4, bpm: 58, chords: '1 - - - | 1 - - - | 4 - - - | 1 - - -', drone: '5 ^1 ^1 1', str: 'x - - -', vol: { str: 0.5 },
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
        mando: '5 - 3 1 - 3 | 5 - - ^1 - - | 6 - 5 4 - 6 | 6 - - - - - | 4 - 6 ^1 - 6 | 5 - 7 ^2 - 7 | ^1 - - 5 - 3 | 2 - - - - -' },
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
    sections: { A: { bars: 2, chords: '1 - - - | 5 - 1 -', drone: '5 ^1 ^1 1', pad: 'x - - - | x - x -', flute: '5 - ^1 - ^3 - ^2 ^1 | ^1 - - - - - - -' } }, order: ['A'] };
  TRACKS.id_band = { name: 'Band Baaja ident', bpm: 120, root: 58, scale: 'major', meter: 16, loop: false, gain: 0.8,
    parts: { band: { kit: 'band', div: 1, vol: 0.7 }, tpt: { inst: 'trumpet', div: 2, oct: 1, vol: 0.85, rev: 0.2 }, brass: { type: 'chord', inst: 'brass', div: 4, vol: 0.6 } },
    sections: { A: { bars: 2, chords: '1 - - - | 1 - - -', band: 'R . R . R . R . R . R . R . R . | B+C . . . . . . . . . . . . . . .', tpt: '1 3 5 ^1 - - 5 - | ^1 - - - - - . .', brass: '. . . . | x - - .' } }, order: ['A'] };
  TRACKS.id_pop = { name: 'Pop Patang ident', bpm: 118, root: 52, scale: 'minor', meter: 16, loop: false, gain: 0.8,
    parts: { kit: { kit: 'kit', div: 1, vol: 0.7 }, ep: { type: 'chord', inst: 'epiano', div: 4, oct: 1, vol: 0.6, rev: 0.3 }, lead: { inst: 'synlead', div: 2, oct: 1, vol: 0.85, rev: 0.3 } },
    sections: { A: { bars: 2, chords: '6 - - - | 1 - - -', kit: 'k . h . s . h . k . h . s . h h | k+x . . . . . . . . . . . . . . .', ep: 'x - - - | x - - -', lead: '^1 - 7 - 5 - 3 - | 5 - - - - - . .' } }, order: ['A'] };

  /*@@SYSTEMS@@*/
})();
