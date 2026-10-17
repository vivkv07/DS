/* NOSTALGIA — tests/aq/lib.cjs: shared helpers for tests/audio_quality.cjs and its sections (tests/aq/*.cjs).
 * Offline renders (OfflineAudioContext inside the real game page) -> Float32 channels in node -> WAV files,
 * spectrogram + level PNGs (no deps: own FFT + PNG encoder) and objective metrics.
 *   const L = require('./lib.cjs');
 *   const r = await L.render(page, 'auto_horn', 2, {pitch: 1});          // SFX / INST / KITS (renderOffline)
 *   const r = await L.renderTrack(page, 'title', 20);                     // music track through the music bus
 *   const r = await L.renderFn(page, `(oc, out, t, X) => {...}`, 3);      // any code (X = N.audio.ext)
 *   L.save(r, 'name')  -> writes tests/out/aq/name.wav + name.png (spectrogram + level), returns metrics
 *   L.metrics(r)       -> {peakDb, rmsDb, crest, dc, clicks, centroid, silentFrac, lowFrac, highFrac, dur}
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'out', 'aq');
fs.mkdirSync(OUT, { recursive: true });

const PAGE_RENDER = async ({ kind, what, sec, opts }) => {
  const A = N.audio;
  let r;
  if (kind === 'sfx') r = await A.renderOffline(what, sec, opts || {});
  else if (kind === 'track') r = await A.renderTrackOffline(what, sec, opts || {});
  else {
    // eslint-disable-next-line no-new-func
    const fn = new Function('return (' + what + ')')();
    r = await A.renderOffline((oc, out, t) => fn(oc, out, t, A.ext), sec, opts || {});
  }
  if (!r) return null;
  const b = r.buffer, chans = [];
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c), i16 = new Int16Array(d.length);
    for (let i = 0; i < d.length; i++) { const v = Math.max(-1, Math.min(1, d[i])); i16[i] = v < 0 ? v * 32768 : v * 32767; }
    let s = ''; const u8 = new Uint8Array(i16.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    chans.push(btoa(s));
  }
  return { sr: b.sampleRate, chans, peak: r.peak, rms: r.rms };
};
function decode(res) {
  if (!res) return null;
  const chans = res.chans.map((b64) => { const buf = Buffer.from(b64, 'base64'); const i16 = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2); const f = new Float32Array(i16.length); for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768; return f; });
  return { sr: res.sr, chans, peak: res.peak, rms: res.rms };
}
const render = async (page, what, sec, opts) => decode(await page.evaluate(PAGE_RENDER, { kind: 'sfx', what, sec, opts }));
const renderTrack = async (page, id, sec, opts) => decode(await page.evaluate(PAGE_RENDER, { kind: 'track', what: id, sec, opts }));
const renderFn = async (page, src, sec, opts) => decode(await page.evaluate(PAGE_RENDER, { kind: 'fn', what: String(src), sec, opts }));

function wav(file, r) {
  const n = r.chans[0].length, nc = r.chans.length;
  const buf = Buffer.alloc(44 + n * nc * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nc * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nc, 22); buf.writeUInt32LE(r.sr, 24);
  buf.writeUInt32LE(r.sr * nc * 2, 28); buf.writeUInt16LE(nc * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * nc * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const v = Math.max(-1, Math.min(1, r.chans[c][i])); buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), o); o += 2; }
  fs.writeFileSync(file, buf);
}
function mono(r) { const n = r.chans[0].length, m = new Float32Array(n); for (const c of r.chans) for (let i = 0; i < n; i++) m[i] += c[i] / r.chans.length; return m; }

function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j], br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br; im[i + j] = ai + bi; re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// magnitude spectra (dB) of overlapping Hann frames
function stft(m, N = 2048, hop = 512) {
  const frames = [], win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  for (let s = 0; s + N <= m.length; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = m[s + i] * win[i];
    fft(re, im);
    const mag = new Float32Array(N / 2);
    for (let k = 0; k < N / 2; k++) mag[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / (N / 4) + 1e-9);
    frames.push(mag);
  }
  return frames;
}
function metrics(r) {
  const m = mono(r), n = m.length, sr = r.sr;
  let pk = 0, ss = 0, dc = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(m[i]); if (a > pk) pk = a; ss += m[i] * m[i]; dc += m[i]; }
  for (const c of r.chans) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > pk) pk = a; }
  const rms = Math.sqrt(ss / n);
  // clicks: a sample step far above the local 2nd-difference noise floor while the signal is otherwise smooth
  let clicks = 0; const W = 256;
  for (const c of r.chans) {
    for (let s = W; s + W < n; s += W) {
      let e = 0; for (let i = s; i < s + W; i++) { const d2 = c[i + 1] - 2 * c[i] + c[i - 1]; e += d2 * d2; }
      const floor = Math.sqrt(e / W);
      for (let i = s; i < s + W; i++) { const d2 = Math.abs(c[i + 1] - 2 * c[i] + c[i - 1]); if (d2 > 0.25 && d2 > floor * 14) { clicks++; break; } }
    }
  }
  // silence + level over time (50 ms windows)
  const win = Math.floor(sr * 0.05); let silent = 0, wins = 0; const level = [];
  for (let s = 0; s + win <= n; s += win) { let e = 0; for (let i = s; i < s + win; i++) e += m[i] * m[i]; const db = 10 * Math.log10(e / win + 1e-12); level.push(db); if (db < -60) silent++; wins++; }
  // spectral balance
  const fr = stft(m, 2048, 2048); const acc = new Float64Array(1024);
  for (const f of fr) for (let k = 0; k < 1024; k++) acc[k] += Math.pow(10, f[k] / 10);
  let tot = 1e-12, cen = 0, low = 0, high = 0;
  for (let k = 1; k < 1024; k++) { const hz = k * sr / 2048; tot += acc[k]; cen += acc[k] * hz; if (hz < 150) low += acc[k]; if (hz > 5000) high += acc[k]; }
  const sorted = level.slice().sort((a, b) => a - b);
  return {
    dur: +(n / sr).toFixed(2), peakDb: +(20 * Math.log10(pk + 1e-12)).toFixed(1), rmsDb: +(20 * Math.log10(rms + 1e-12)).toFixed(1),
    crest: +(20 * Math.log10((pk + 1e-12) / (rms + 1e-12))).toFixed(1), dc: +(dc / n).toFixed(4), clicks,
    centroid: Math.round(cen / tot), lowFrac: +(low / tot).toFixed(3), highFrac: +(high / tot).toFixed(3),
    silentFrac: +(silent / Math.max(1, wins)).toFixed(2), loud95: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(1) : -120,
  };
}

// ---- PNG
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function png(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
function heat(v) { // 0..1 -> inferno-ish
  const s = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const x = Math.max(0, Math.min(1, v)) * (s.length - 1), i = Math.min(s.length - 2, Math.floor(x)), f = x - i;
  return s[i].map((c, k) => Math.round(c + (s[i + 1][k] - c) * f));
}
// Spectrogram (log frequency 40 Hz..sr/2, 100 dB range) on top, level (dBFS, -60..0, red line = -1 dBFS) + L/R balance under it.
function spectrogram(file, r, o) {
  o = o || {};
  const m = mono(r), sr = r.sr, W = o.width || 900, H = o.height || 300, LH = 90;
  const N = 2048, hop = Math.max(64, Math.floor((m.length - N) / W));
  const fr = stft(m, N, hop);
  const img = Buffer.alloc(W * (H + LH) * 3);
  const fmin = 40, fmax = sr / 2;
  for (let x = 0; x < W; x++) {
    const f = fr[Math.min(fr.length - 1, Math.floor(x * fr.length / W))];
    if (!f) continue;
    for (let y = 0; y < H; y++) {
      const hz = fmin * Math.pow(fmax / fmin, 1 - y / H), k = Math.min(N / 2 - 1, Math.round(hz * N / sr));
      const c = heat((f[k] + 100) / 100);
      img.set(c, (y * W + x) * 3);
    }
  }
  // frequency grid lines at 100 Hz, 1 kHz, 10 kHz
  for (const hz of [100, 1000, 10000]) { const y = Math.round(H * (1 - Math.log(hz / fmin) / Math.log(fmax / fmin))); if (y > 0 && y < H) for (let x = 0; x < W; x += 3) img.set([90, 200, 255], (y * W + x) * 3); }
  const n = m.length, per = n / W;
  for (let x = 0; x < W; x++) {
    let pk = 0, e = 0, l = 0, rr = 0;
    for (let i = Math.floor(x * per); i < Math.floor((x + 1) * per); i++) { const a = Math.abs(m[i]); if (a > pk) pk = a; e += m[i] * m[i]; if (r.chans[1]) { l += r.chans[0][i] ** 2; rr += r.chans[1][i] ** 2; } }
    const rms = Math.sqrt(e / Math.max(1, per)), toY = (v) => H + Math.round(LH * (1 - Math.max(0, 60 + 20 * Math.log10(v + 1e-9)) / 60));
    for (let y = toY(pk); y < H + LH; y++) img.set([60, 120, 60], (y * W + x) * 3);
    for (let y = toY(rms); y < H + LH; y++) img.set([120, 230, 120], (y * W + x) * 3);
    const yc = toY(0.891); img.set([255, 40, 40], (yc * W + x) * 3);
    if (r.chans[1] && e > 1e-7) { const bal = (Math.sqrt(rr) - Math.sqrt(l)) / (Math.sqrt(rr) + Math.sqrt(l) + 1e-9); const yb = H + LH - 1 - Math.round((bal + 1) / 2 * (LH - 1)); img.set([255, 255, 255], (Math.max(H, Math.min(H + LH - 1, yb)) * W + x) * 3); }
  }
  png(file, W, H + LH, img);
}
function save(r, name, o) {
  if (!r) return null;
  const base = path.join(OUT, name.replace(/[^\w.-]+/g, '_'));
  wav(base + '.wav', r);
  spectrogram(base + '.png', r, o);
  return metrics(r);
}
module.exports = { OUT, render, renderTrack, renderFn, wav, mono, stft, metrics, spectrogram, save, png };
