/* NOSTALGIA trailer — editorial review + technical QA of an assembled cut.
 *   node trailer/review.cjs <video.mp4> [fps]      (fps of the contact sheets, default 3)
 *   env: OUTD=dir (default out/review/<video basename>)  COLS=n (thumbs per row; default 12 landscape / 16 portrait)
 *        NOSHEETS=1 (QA only)  NOAUDIO=1 (skip the waveform/spectrogram)
 * Writes:
 *   <OUTD>/sheet_<n>_<ACT>.jpg  contact sheets per act: every 1/fps s, labelled with time, beat and segment id;
 *                               the first thumb of each segment (the cut) gets a yellow frame
 *   <OUTD>/audio.png            waveform + spectrogram of the mix, cut lines (white), act changes (yellow, labelled),
 *                               the bar grid (grey)
 *   <OUTD>/qa.json              duration, resolution, fps, codecs, loudness (EBU R128 I / LRA / true peak),
 *                               black or near-black stretches, mean luma per segment (placeholders show up as ~16)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const VIDEO = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(VIDEO)) { console.error('usage: node trailer/review.cjs <video.mp4> [fps]'); process.exit(1); }
const SFPS = +(process.argv[3] || 3);
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const OUTD = process.env.OUTD || path.join(__dirname, 'out', 'review', path.basename(VIDEO, path.extname(VIDEO)));
fs.mkdirSync(OUTD, { recursive: true });
const B = 60 / TL.bpm, FPS = TL.fps;
const sh = (cmd, args, opt) => execFileSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 28 }, opt || {}));
const ff = (args) => sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

// ---------------------------------------------------------------- probe
const pr = JSON.parse(sh('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', VIDEO]));
const vs = pr.streams.find((s) => s.codec_type === 'video'), as = pr.streams.find((s) => s.codec_type === 'audio');
const [fn, fd] = vs.r_frame_rate.split('/').map(Number);
const qa = {
  file: VIDEO, sizeMiB: +(fs.statSync(VIDEO).size / 1048576).toFixed(1),
  duration: +(+pr.format.duration).toFixed(3), videoDuration: +(+vs.duration).toFixed(3), frames: +vs.nb_frames,
  width: vs.width, height: vs.height, fps: +(fn / fd).toFixed(3), vcodec: vs.codec_name, profile: vs.profile, pix_fmt: vs.pix_fmt,
  vbitrateMbps: vs.bit_rate ? +(vs.bit_rate / 1e6).toFixed(2) : null,
  acodec: as ? as.codec_name : null, arate: as ? +as.sample_rate : null, achannels: as ? as.channels : null,
  aDuration: as ? +(+as.duration).toFixed(3) : null,
  expected: { duration: (TL.totalBeats + (TL.tailBeats || 0)) * B },
};
const VERT = vs.height > vs.width;

// segment for a time (the end card holds over the tail)
const segs = TL.segments.map((s) => ({ id: s.id, act: s.act || null, kind: s.kind, t0: s.b * B, t1: (s.b + s.n) * B, b: s.b, n: s.n }));
const segAt = (t) => segs.find((s) => t >= s.t0 - 1e-6 && t < s.t1 - 1e-6) || segs[segs.length - 1];
// act blocks for the sheets
const ACTS = [['OPEN', 0], ['EXPLORE', 20], ['STORY', 40], ['PLAY', 48], ['CELEBRATE', 96], ['SURVIVE', 116], ['FINALE', 128]];
const actOf = (b) => { let a = ACTS[0][0]; for (const [n, b0] of ACTS) if (b >= b0) a = n; return a; };
const actChanges = ACTS.slice(1).map(([n, b0]) => ({ name: n, t: b0 * B }));

// ---------------------------------------------------------------- loudness, black frames, luma per segment
if (as) {
  const out = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -i '${VIDEO}' -map 0:a -af ebur128=peak=true -f null - 2>&1 | tail -n 14`], { encoding: 'utf8' });
  const g = (re) => { const m = out.match(re); return m ? +m[1] : null; };
  qa.loudness = { I: g(/I:\s+(-?[\d.]+) LUFS/), LRA: g(/LRA:\s+([\d.]+) LU/), truePeak: g(/Peak:\s+(-?[\d.]+) dBFS/) };
}
{
  // measured on the top 55% of the frame (the captions sit in the lower third)
  const out = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -i '${VIDEO}' -map 0:v -vf "scale=320:-2,crop=iw:ih*0.55:0:0,blackdetect=d=0.25:pix_th=0.06:pic_th=0.97,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>&1`], { encoding: 'utf8', maxBuffer: 1 << 28 });
  qa.black = [...out.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map((m) => ({ start: +m[1], end: +m[2], dur: +m[3], seg: segAt(+m[1] + 0.01).id }));
  // per-frame luma -> per-segment mean / min (a black placeholder reads ~16 in limited range)
  const ys = [...out.matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  qa.segments = segs.map((s) => {
    const v = ys.filter(([t]) => t >= s.t0 && t < s.t1).map(([, y]) => y);
    const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    const black = v.length ? v.filter((y) => y < 18.5).length / v.length : 0; // black placeholder frames (limited-range black = 16)
    return { id: s.id, b: s.b, n: s.n, t0: +s.t0.toFixed(2), lumaMean: mean == null ? null : +mean.toFixed(1), lumaMin: v.length ? +Math.min(...v).toFixed(1) : null, black: +black.toFixed(2), placeholder: black >= 0.6 };
  });
  qa.placeholders = qa.segments.filter((s) => s.placeholder).map((s) => s.id);
}

// ---------------------------------------------------------------- contact sheets per act
if (!process.env.NOSHEETS) {
  const TD = path.join(OUTD, 'thumbs'); fs.mkdirSync(TD, { recursive: true });
  for (const f of fs.readdirSync(TD)) fs.unlinkSync(path.join(TD, f));
  const tw = VERT ? 180 : 320;
  // exact frames: every STEP-th frame from the middle of the first slot (t = (OFF + k*STEP) / fps), so a cut never
  // lands exactly on a sample and the labels are the frames' true times
  const STEP = Math.max(1, Math.round(qa.fps / SFPS)), OFF = Math.floor(STEP / 2);
  ff(['-i', VIDEO, '-vf', `select='not(mod(n-${OFF},${STEP}))*gte(n,${OFF})',scale=${tw}:-2:flags=bicubic`, '-fps_mode', 'passthrough', '-q:v', '3', path.join(TD, '%05d.jpg')]);
  const thumbs = fs.readdirSync(TD).filter((f) => f.endsWith('.jpg')).sort();
  const byAct = {};
  let prevSeg = null;
  thumbs.forEach((f, k) => {
    const t = (OFF + k * STEP) / qa.fps, s = segAt(t), act = actOf(t / B);
    const first = s.id !== prevSeg; prevSeg = s.id;
    (byAct[act] = byAct[act] || []).push({ f: path.join(TD, f), label: `${t.toFixed(1)}s b${(t / B).toFixed(1)} ${s.id}`, first });
  });
  const cols = +(process.env.COLS || (VERT ? 16 : 12));
  let i = 0;
  for (const [act] of ACTS) {
    const list = byAct[act]; if (!list) continue;
    i++;
    // border the cut thumbs (yellow) — draw into a temp copy so the plain thumbs stay reusable
    const items = list.map((it, j) => {
      if (!it.first) return it;
      const p = it.f.replace(/\.jpg$/, '_cut.jpg');
      sh('convert', [it.f, '-bordercolor', '#ffd400', '-border', '3', '-shave', '3x3', '-fill', 'none', '-stroke', '#ffd400', '-strokewidth', '6', '-draw', `rectangle 0,0 ${VERT ? 179 : 319},${VERT ? 319 : 179}`, p]);
      return Object.assign({}, it, { f: p });
    });
    const args = [];
    for (const it of items) args.push('-label', it.label, it.f);
    const out = path.join(OUTD, `sheet_${i}_${act}.jpg`);
    sh('montage', [...args, '-tile', `${cols}x`, '-geometry', '+3+3', '-background', '#111', '-fill', '#ddd', '-font', 'DejaVu-Sans-Mono', '-pointsize', VERT ? '10' : '12', '-title', `${act}  (${path.basename(VIDEO)}, ${SFPS} fps; yellow = cut)`, '-quality', '88', out]);
    console.log('sheet', out, list.length, 'thumbs');
  }
}

// ---------------------------------------------------------------- storyboard: K evenly spaced frames of every segment
if (!process.env.NOSHEETS) {
  const K = +(process.env.K || 6), SD = path.join(OUTD, 'story'); fs.mkdirSync(SD, { recursive: true });
  for (const f of fs.readdirSync(SD)) fs.unlinkSync(path.join(SD, f));
  const picks = [];
  for (const s of segs) {
    const f0 = Math.round(s.t0 * qa.fps), nf = Math.round((s.t1 - s.t0) * qa.fps);
    for (let i = 0; i < K; i++) picks.push({ n: f0 + Math.min(nf - 1, Math.round(i * (nf - 1) / (K - 1))), s, i });
  }
  const tw = VERT ? 216 : 400;
  ff(['-i', VIDEO, '-vf', `select='${picks.map((p) => `eq(n,${p.n})`).join('+')}',scale=${tw}:-2:flags=bicubic`, '-fps_mode', 'passthrough', '-q:v', '3', path.join(SD, '%05d.jpg')]);
  const files = fs.readdirSync(SD).filter((f) => f.endsWith('.jpg')).sort();
  const rows = Math.ceil(picks.length / K), per = VERT ? 8 : 10; // segments per sheet
  for (let r0 = 0, part = 1; r0 < rows; r0 += per, part++) {
    const args = [];
    for (let k = r0 * K; k < Math.min(picks.length, (r0 + per) * K); k++) {
      const p = picks[k]; if (!files[k]) continue;
      args.push('-label', `${p.s.id}  f${p.n - Math.round(p.s.t0 * qa.fps)}  ${(p.n / qa.fps).toFixed(2)}s`, path.join(SD, files[k]));
    }
    const out = path.join(OUTD, `story_${part}.jpg`);
    sh('montage', [...args, '-tile', `${K}x`, '-geometry', '+3+3', '-background', '#111', '-fill', '#ddd', '-font', 'DejaVu-Sans-Mono', '-pointsize', '13', '-quality', '88', out]);
    console.log('storyboard', out);
  }
}

// ---------------------------------------------------------------- waveform + spectrogram with the cuts
if (as && !process.env.NOAUDIO) {
  const AW = 3600, WH = 300, SH = 420, dur = qa.duration;
  const wave = path.join(OUTD, '_wave.png'), spec = path.join(OUTD, '_spec.png'), out = path.join(OUTD, 'audio.png');
  ff(['-i', VIDEO, '-filter_complex', `[0:a]aformat=channel_layouts=mono,showwavespic=s=${AW}x${WH}:colors=#6fc3ff:scale=sqrt`, '-frames:v', '1', wave]);
  ff(['-i', VIDEO, '-filter_complex', `[0:a]showspectrumpic=s=${AW}x${SH}:legend=0:mode=combined:color=intensity:scale=log:fscale=log`, '-frames:v', '1', spec]);
  const x = (t) => Math.round(t / dur * AW);
  const draw = [];
  // bar grid (every 4 beats), cuts, act changes
  for (let b = 0; b * B < dur; b += 4) draw.push('-stroke', '#444', '-strokewidth', '1', '-draw', `line ${x(b * B)},0 ${x(b * B)},${WH + SH}`);
  for (const s of segs) draw.push('-stroke', '#ffffff', '-strokewidth', '2', '-draw', `line ${x(s.t0)},0 ${x(s.t0)},${WH + SH}`);
  for (const a of actChanges) draw.push('-stroke', '#ffd400', '-strokewidth', '4', '-draw', `line ${x(a.t)},0 ${x(a.t)},${WH + SH}`);
  const labels = [];
  for (const s of segs) labels.push('-stroke', 'none', '-fill', '#fff', '-font', 'DejaVu-Sans', '-pointsize', '15', '-annotate', `+${x(s.t0) + 4}+${16 + (s.b % 8 ? 18 : 0)}`, `${s.id} b${s.b}`);
  for (const a of actChanges) labels.push('-stroke', 'none', '-fill', '#ffd400', '-font', 'DejaVu-Sans-Bold', '-pointsize', '22', '-annotate', `+${x(a.t) + 6}+${WH - 10}`, a.name);
  for (let b = 0; b * B < dur; b += 8) labels.push('-stroke', 'none', '-fill', '#aaa', '-font', 'DejaVu-Sans-Mono', '-pointsize', '13', '-annotate', `+${x(b * B) + 3}+${WH + SH - 6}`, `${(b * B).toFixed(1)}s`);
  sh('convert', [wave, spec, '-append', ...draw, ...labels, out]);
  fs.unlinkSync(wave); fs.unlinkSync(spec);
  console.log('audio', out);
}

fs.writeFileSync(path.join(OUTD, 'qa.json'), JSON.stringify(qa, null, 1));
const ok = (c) => (c ? 'ok ' : 'XX ');
console.log(`${ok(Math.abs(qa.duration - qa.expected.duration) < 0.05)}duration ${qa.duration} s (expected ${qa.expected.duration.toFixed(2)})  video ${qa.videoDuration} s, ${qa.frames} frames`);
console.log(`   ${qa.width}x${qa.height} @ ${qa.fps} fps ${qa.vcodec} ${qa.profile} ${qa.pix_fmt} ${qa.vbitrateMbps} Mb/s; ${qa.sizeMiB} MiB`);
if (as) console.log(`${ok(qa.acodec === 'aac' && Math.abs(qa.loudness.I + 14) < 1 && qa.loudness.truePeak <= -0.9)}audio ${qa.acodec} ${qa.arate} Hz x${qa.achannels}: I ${qa.loudness.I} LUFS, LRA ${qa.loudness.LRA} LU, TP ${qa.loudness.truePeak} dBFS`);
console.log(`${ok(!qa.placeholders.length)}placeholders: ${qa.placeholders.join(', ') || 'none'}`);
if (qa.black.length) console.log('   black stretches:', qa.black.map((b) => `${b.start.toFixed(2)}-${b.end.toFixed(2)} (${b.seg})`).join('; '));
console.log('->', OUTD);
