/* NOSTALGIA trailer — assemble frames + score into the final video with ffmpeg.
 *   node trailer/assemble.cjs [W H]          (3840 2160 = 4K trailer; 2160 3840 = 4K Reels/Shorts)
 *   env: FRAMES=dir   landscape frames (default out/frames2)     FRAMES_V=dir  portrait-native frames (default out/frames2_v)
 *        OUT=file     (default out/nostalgia_trailer_v2_<H>p.mp4 | out/nostalgia_reels_v2_<W>x<H>.mp4)
 *        CRF=16       final encode           PRESET=x264 preset for clips + final (default: medium clips, slow final at 4K)
 *        CLIPCRF=12   intermediate clips     ASM_TMP=dir  per-segment clips (reused while their inputs and filters are unchanged)
 *        FROM=b TO=b  render only the segments inside beats [FROM, TO), with their audio (a quick look at one stretch)
 *        NOFX=1       no transitions         MAXRATE=32M  VBV ceiling (default 32M at 4K: < 400 MiB; 0 = off)
 *        REMUX=1      reuse <ASM_TMP>/video.mp4 (redo transitions + audio only)   ADOPT=1  adopt pre-signature clips
 *        AUDIO_ONLY=1 reuse this output's encoded picture (<ASM_TMP>/final_<name>.video.mp4): re-mux a new score only
 *        EDL=reels_short.json   the short Reels cut: a bar-aligned edit of the master (picture, captions, score) ->
 *                     out/nostalgia_reels_v2_short_<W>x<H>.mp4 (share ASM_TMP with the 9:16 master: its clips are reused)
 * Per segment: frame sequence -> exact-length clip (n beats x 18 frames @30 fps). 3D/gameplay footage gets the grade
 * and a slow 1.03 -> 1 pull-back (3D drone shots a slow push-in); minigame and UI captures are the game's own screens:
 * no grade, no zoom. 9:16: portrait-native frames from FRAMES_V win; landscape footage is cropped to 9:16 around the
 * action (VX); captions from FRAMES_V. Concat, then the VHS act transitions + drop flashes (TRANS, synced to the score's
 * cues in music.js), then mux the score: two-pass loudnorm to -14 LUFS + an oversampled limiter so the AAC is <= -1 dBTP.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const W = +(process.argv[2] || 3840), H = +(process.argv[3] || 2160);
const OUTDIR = path.join(__dirname, 'out');
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const V2 = TL.version === 2; // v2 (gameplay-led) renders into frames2 / frames2_v
const FR = process.env.FRAMES || path.join(OUTDIR, V2 ? 'frames2' : 'frames');
const VERT = H > W;
const FRV = process.env.FRAMES_V || path.join(OUTDIR, V2 ? 'frames2_v' : 'frames_v');
const CRF = process.env.CRF || '16';
const TAG = V2 ? '_v2' : '';
// EDL=<json>: a bar-aligned edit of the master (reels_short.json): picture, captions and score cut from the master
const EDL = process.env.EDL ? JSON.parse(fs.readFileSync(path.resolve(__dirname, process.env.EDL), 'utf8')) : null;
const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(OUTDIR, VERT ? `nostalgia_reels${TAG}${EDL ? '_short' : ''}_${W}x${H}.mp4` : `nostalgia_trailer${TAG}${EDL ? '_short' : ''}_${H}p.mp4`);
const FPS = TL.fps, BF = TL.beatFrames, B = 60 / TL.bpm;
const TMP = process.env.ASM_TMP ? path.resolve(process.env.ASM_TMP) : path.join(OUTDIR, 'tmp' + TAG + '_' + W + 'x' + H); fs.mkdirSync(TMP, { recursive: true });
const PRESET = process.env.PRESET || 'medium', CLIPCRF = process.env.CLIPCRF || '12';
const FPRESET = process.env.PRESET || (H >= 2000 || W >= 2000 ? 'slow' : 'medium');
const FROM = +(process.env.FROM || 0), TO = +(process.env.TO || 1e9);
// EDL pieces in master beats [b0, b1) and their start in the edit (r0, beats); the last one holds tailBeats more
const PIECES = EDL ? EDL.pieces.map((p) => ({ ...p, b0: 4 * (p.bars[0] - 1), b1: 4 * p.bars[1] })) : null;
if (PIECES) { PIECES[PIECES.length - 1].b1 += EDL.tailBeats || 0; let r = 0; for (const p of PIECES) { p.r0 = r; r += p.b1 - p.b0; } }
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// frames for a segment: <FR>/<id>/%05d.(jpg|png); portrait-native <FRV>/<id> wins in the vertical cut
function seq(seg, id) {
  id = id || seg.id;
  let dir = path.join(FR, id);
  if (VERT && fs.existsSync(path.join(FRV, id)) && fs.readdirSync(path.join(FRV, id)).length) dir = path.join(FRV, id);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f)).sort();
  if (!files.length) return null;
  const ext = path.extname(files[0]);
  const step = files.length > 1 ? (parseInt(files[1], 10) - parseInt(files[0], 10)) : 1;
  const dim = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(dir, files[0])], { encoding: 'utf8' }).trim().split(',').map(Number);
  return { dir, ext, step, count: files.length, w: dim[0], h: dim[1], fp: dirFp(dir) };
}
function dirFp(dir) { // fingerprint for clip reuse: file count + newest mtime
  if (!fs.existsSync(dir)) return 'none';
  const files = fs.readdirSync(dir);
  return files.length + ':' + files.reduce((m, f) => Math.max(m, fs.statSync(path.join(dir, f)).mtimeMs), 0);
}

/* 9:16 framing of landscape footage: the crop window's centre as a fraction of the free travel (-1 = left edge,
 * 0 = centre, +1 = right edge). A number holds; [a, b] pans linearly across the segment; [[f, x], [f, x], ...] are
 * keyframes (segment frames, linear between, held outside). Only for segments without portrait frames. */
const VX = {
  g_auto_tankbund: [[0, 0], [48, 0], [71, 0.25]], // the auto drifts right of centre at the end
  a_maram: -0.55,                                  // Chinnu plays the left ring (the centre crop loses him)
};

function vxExpr(v, nf) { // VX value -> crop centre expression of the frame number n
  if (!Array.isArray(v)) return `${v || 0}`;
  const k = Array.isArray(v[0]) ? v : [[0, v[0]], [nf - 1, v[1]]];
  let e = `${k[k.length - 1][1]}`;
  for (let i = k.length - 2; i >= 0; i--) {
    const [f0, x0] = k[i], [f1, x1] = k[i + 1];
    e = `if(lt(n,${f1}),${x0}+(${+(x1 - x0).toFixed(4)})*max(0,n-${f0})/${Math.max(1, f1 - f0)},${e})`;
  }
  return `(${e})`;
}

const GRADE = 'eq=contrast=1.07:saturation=1.14:gamma=0.98,vignette=angle=PI/5:mode=forward';
const segs = PIECES ? TL.segments.filter((s) => PIECES.some((p) => s.b < p.b1 && s.b + s.n > p.b0)) : TL.segments.filter((s) => s.b >= FROM && s.b < TO);
const clips = [];
const REMUX = !!process.env.REMUX; // reuse <TMP>/video.mp4: redo only the transitions + the audio
for (const seg of REMUX ? [] : segs) {
  const nf = seg.n * BF, out = path.join(TMP, seg.id + '.mp4');
  const s = seq(seg);
  const filters = [];
  let input;
  if (!s) { // missing: black placeholder (so a partial render still assembles)
    input = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}`];
  } else {
    // frames rendered every n-th: hold each for n frames
    input = ['-framerate', String(FPS / s.step), '-start_number', '0', '-i', path.join(s.dir, '%05d' + s.ext)];
    filters.push(`fps=${FPS}`);
  }
  const pixel = s && s.ext === '.png' && seg.kind === 'game'; // top-down internal canvas -> crisp nearest-neighbour
  if (VERT && s && s.w > s.h) { // landscape master -> 9:16 window, centred or placed by VX
    filters.push(`crop=w=ih*9/16:h=ih:x='(iw-ow)/2*(1+${vxExpr(VX[seg.id], nf)})':y=0`);
  }
  filters.push(`scale=${W}:${H}:flags=${pixel ? 'neighbor' : 'lanczos'}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  // minigame captures (kind 'mg') and UI captures ('ui') are the game's own full-screen UI: no grade, no zoom, no sharpening
  if (seg.kind === '3d' || seg.kind === 'game') filters.push(GRADE);
  // motion: a slow push-in across the drone shots; v2 gameplay: longer shots with a slow pull-back
  // (zoompan: crop w/h are evaluated once, zoompan per frame; on = output frame number)
  if (seg.kind === '3d') filters.push(`zoompan=z='1+0.025*on/${nf}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`);
  if (seg.kind === 'game' && V2 && !pixel) filters.push(`zoompan=z='1.03-0.03*on/${nf}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`);
  else if (seg.kind === 'game' && !V2) filters.push(`zoompan=z='1+0.06*max(0,1-on/8)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`);
  if (seg.shot === 'whip') filters.push('tmix=frames=5:weights=1 1 1 1 1');
  if (!V2 && ['lm_charminar', 'g_cycle_oldcity'].includes(seg.id)) filters.push('fade=t=in:st=0:d=0.2:color=white'); // v1 drop flashes (v2: TRANS)
  if (seg.kind === 'game') filters.push('unsharp=5:5:0.4');
  filters.push(`trim=end_frame=${nf}`, 'setpts=PTS-STARTPTS', `tpad=stop_mode=clone:stop=${nf}`, `trim=end_frame=${nf}`, 'format=yuv420p');
  let fc = `[0:v]${filters.join(',')}[v]`;
  const extra = [];
  // lower-thirds (transparent PNG frames rendered by render_titles.cjs): v1 rain '<id>_overlay', v2 captions '<id>_cap'
  const ov = seg.overlay ? { suf: '_overlay', b: seg.overlay.b } : (seg.cap || fs.existsSync(path.join(FR, seg.id + '_cap'))) ? { suf: '_cap', b: seg.b } : null; // finale_cap: story lines
  let odFp = 'none';
  if (ov) {
    const od = VERT && fs.existsSync(path.join(FRV, seg.id + ov.suf)) ? path.join(FRV, seg.id + ov.suf) : path.join(FR, seg.id + ov.suf);
    if (fs.existsSync(od)) {
      const t0 = (ov.b - seg.b) * BF / FPS;
      extra.push('-framerate', String(FPS), '-start_number', '0', '-i', path.join(od, '%05d.png'));
      fc = `[0:v]${filters.join(',')}[b];[1:v]scale=${W}:${H},setpts=PTS-STARTPTS+${t0}/TB[o];[b][o]overlay=eof_action=pass:format=auto,format=yuv420p[v]`;
      odFp = od + '|' + dirFp(od);
    }
  }
  const args = [...input, ...extra, '-filter_complex', fc, '-map', '[v]', '-frames:v', String(nf), '-r', String(FPS), '-c:v', 'libx264', '-preset', PRESET, '-crf', CLIPCRF, '-pix_fmt', 'yuv420p', out];
  // reuse the clip when nothing that makes it has changed
  const sig = crypto.createHash('md5').update(JSON.stringify([args, s ? s.dir + '|' + s.fp : 'black', odFp])).digest('hex');
  const sigf = out + '.sig';
  // ADOPT=1: a clip made before signatures existed is adopted when it is newer than all its inputs
  if (process.env.ADOPT && fs.existsSync(out) && !fs.existsSync(sigf) && s && fs.statSync(out).mtimeMs > +s.fp.split(':')[1] && (odFp === 'none' || fs.statSync(out).mtimeMs > +odFp.split(':').pop())) fs.writeFileSync(sigf, sig);
  if (fs.existsSync(out) && fs.existsSync(sigf) && fs.readFileSync(sigf, 'utf8') === sig) {
    process.stdout.write(`  ${seg.id} (reused)\n`);
  } else {
    ff(args);
    fs.writeFileSync(sigf, sig);
    process.stdout.write(`  ${seg.id} ${s ? s.count + ' frames' + (s.dir.startsWith(FRV) ? ' (portrait)' : '') : 'MISSING'}\n`);
  }
  clips.push(out);
}
// EDL: cut each piece's frames out of the master's segment clips (reused while unchanged)
if (PIECES && !REMUX) {
  const parts = [];
  for (const p of PIECES) {
    for (const sg of TL.segments) {
      const a = Math.max(p.b0, sg.b), b = Math.min(p.b1, sg.b + sg.n);
      if (a >= b) continue;
      const src = path.join(TMP, sg.id + '.mp4'), part = path.join(TMP, `edl_${sg.id}_${a}-${b}.mp4`);
      const args = ['-i', src, '-vf', `trim=start_frame=${(a - sg.b) * BF}:end_frame=${(b - sg.b) * BF},setpts=PTS-STARTPTS,format=yuv420p`, '-frames:v', String((b - a) * BF), '-r', String(FPS), '-c:v', 'libx264', '-preset', PRESET, '-crf', CLIPCRF, '-pix_fmt', 'yuv420p', part];
      const sig = crypto.createHash('md5').update(JSON.stringify([args, fs.readFileSync(src + '.sig', 'utf8')])).digest('hex');
      if (!(fs.existsSync(part) && fs.existsSync(part + '.sig') && fs.readFileSync(part + '.sig', 'utf8') === sig)) { ff(args); fs.writeFileSync(part + '.sig', sig); }
      parts.push(part);
    }
  }
  clips.length = 0; clips.push(...parts);
  console.log(`  EDL: ${PIECES.length} pieces, ${parts.length} parts, ${PIECES.reduce((t, p) => t + p.b1 - p.b0, 0) * B} s`);
}
// concat (all clips share codec params)
const list = path.join(TMP, PIECES ? 'list_edl.txt' : 'list.txt');
const video = path.join(TMP, PIECES ? 'video_edl.mp4' : 'video.mp4');
if (!REMUX) {
  fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
}

/* ---------------------------------------------------------------- transitions
 * The game's identity is a cassette / VHS tape, so the act changes are tape moments, drawn like the game's own VHS
 * effect (render.js drawVHS): chroma split, a rolling tracking band of sheared lines with noise, scanlines, a blue
 * wash; 'roll' adds a vertical-hold slip as the picture locks; 'snow' an RF noise burst. Gameplay cuts stay clean.
 * Each sits on a cue of the score (music.js): at = beat of the cut, pre/post = frames before/after it. */
const TRANS = V2 ? [
  { at: 0, post: 4, s: 0.9, snow: 0.9 },              // the deck's PLAY clunk: the tape starts
  { at: 12, pre: 5, post: 8, s: 1, roll: 0.32, flash: 0.1 }, // REWIND locks into 2003 (whoosh + impact on the reveal)
  { at: 20, post: 3, s: 0.35, flash: 0.2 },           // EXPLORE: the groove drops (impact + crash)
  { at: 40, pre: 3, post: 6, s: 0.75 },               // STORY: deck clunk, the walkman, filters close
  { at: 48, post: 3, s: 0.35, flash: 0.2 },           // PLAY: the full beat drops (impact + crash)
  { at: 96, post: 3, s: 0.3, flash: 0.2 },            // CELEBRATE (impact + big crash)
  { at: 116, pre: 3, post: 7, s: 1, snow: 0.5, roll: 0.18 }, // SURVIVE: downlifter -> impact + siren, the tape chews
  { at: 128, pre: 3, post: 6, s: 0.6, flash: 0.12 },  // finale: impact + crash, the time-lapse
  { at: 152, pre: 2, post: 5, s: 0.45 },              // end card
] : [];
const f6 = (x) => (+x).toFixed(4);
function vhsFilters(tr, t0) { // t0: time offset of this render (FROM)
  const tc = tr.at * B - t0, pre = (tr.pre || 0) / FPS, post = (tr.post || 0) / FPS;
  const ta = tc - pre, tb = tc + post - 1e-3, out = [];
  if (tb < 0) return out;
  const en = `between(t,${f6(Math.max(0, ta - 1e-3))},${f6(tb)})`;
  if (tr.s) {
    // envelope: rises over the pre frames, peaks on the cut, decays over the post frames
    const s = tr.s;
    const env = pre > 0 ? `if(lt(T,${f6(tc)}),${s}*(T-${f6(ta - 1 / FPS)})/${f6(pre + 1 / FPS)},${s}*pow(max(0,1-(T-${f6(tc)})/${f6(post + 1 / FPS)}),1.3))` : `${s}*pow(max(0,1-(T-${f6(tc)})/${f6(post + 1 / FPS)}),1.3)`;
    const span = Math.max(1e-3, pre + post);
    const band = `(0.88-0.76*(T-${f6(ta)})/${f6(span)})`;              // tracking band rolls up the frame
    const roll = tr.roll ? `if(gte(T,${f6(tc)}),${tr.roll}*pow(max(0,1-(T-${f6(tc)})/${f6(4 / FPS)}),1.6),0)` : '0'; // V-hold slip, locks in 4 frames
    const snow = tr.snow ? `${tr.snow}*ld(0)` : '0';
    // slots: 0 amount, 1 in band, 2 x shift (plane px), 3 rolled y, 4 in VBI bar, 5 snow mix; random(9)
    const pre_ = `st(0,${env});st(1,lt(abs(Y/H-${band}),0.018+0.05*ld(0)));` +
      `st(2,W*(ld(1)*0.012*ld(0)*sin(Y/H*460+T*47)+0.0035*ld(0)*sin(T*83+Y/H*5)));` +
      `st(3,mod(Y+H*${roll},H));st(4,lt(ld(3),H*0.03)*gt(${roll},0.002));st(5,${snow});`;
    const lum = `${pre_}if(ld(4),16,(1-ld(5))*if(ld(1)*gt(random(9),1-0.3*ld(0)),190+50*random(9),p(X+ld(2),ld(3))*(1-0.22*ld(0)*lt(mod(Y/H*360,1),0.4)))+ld(5)*(16+219*random(9)))`;
    const cb = `${pre_}if(ld(4),128,(1-ld(5))*(p(X+ld(2)-W*0.0045*ld(0),ld(3))+7*ld(0))+ld(5)*128)`;
    const cr = `${pre_}if(ld(4),128,(1-ld(5))*(p(X+ld(2)+W*0.0045*ld(0),ld(3))-3*ld(0))+ld(5)*128)`;
    out.push(`geq=lum='${lum}':cb='${cb}':cr='${cr}':enable='${en}'`);
  }
  if (tr.flash) out.push(`fade=t=in:st=${f6(Math.max(0, tc))}:d=${f6(tr.flash)}:color=white:enable='between(t,${f6(Math.max(0, tc - 1e-3))},${f6(tc + tr.flash)})'`);
  return out;
}
const t0 = PIECES ? 0 : FROM * B;
// EDL: master transitions play where they fall inside a piece; a piece's fx (a master transition's beat) plays on its join
const TR = !PIECES ? TRANS.filter((tr) => tr.at >= FROM && tr.at < TO) : PIECES.flatMap((p) => {
  const own = TRANS.filter((tr) => tr.at >= p.b0 && tr.at < p.b1).map((tr) => ({ ...tr, at: p.r0 + tr.at - p.b0 }));
  const fx = p.fx != null && !own.some((tr) => tr.at === p.r0) ? TRANS.filter((tr) => tr.at === p.fx).map((tr) => ({ ...tr, at: p.r0 })) : [];
  return [...fx, ...own];
});
const fxChain = process.env.NOFX ? [] : TR.flatMap((tr) => vhsFilters(tr, t0));

// score: two-pass loudness normalisation to -14 LUFS, linear (a clean gain: the score is already mastered), then a
// 4x-oversampled peak limiter at -3 dBFS: ffmpeg's AAC encoder overshoots transients by up to +1.6 dB depending on
// where they fall in its frames (the thunder measured -0.1 dBTP in one alignment, -1.5 in another), so the PCM peaks
// sit low enough that the delivered AAC measures <= -1 dBTP; the encode is measured and trimmed if it ever does not.
let wav = path.join(OUTDIR, 'score.wav');
if (PIECES) { // the score cut on the same bar lines: contiguous pieces stay one run; 6 ms de-click fades on the real joins
  const total = PIECES.reduce((t, p) => t + p.b1 - p.b0, 0) * B, fo = EDL.fadeOut || 0;
  const runs = [];
  for (const p of PIECES) { const r = runs[runs.length - 1]; if (r && r.b1 === p.b0) r.b1 = p.b1; else runs.push({ b0: p.b0, b1: p.b1 }); }
  const fc = runs.map((r, i) => `[0:a]atrim=start=${f6(r.b0 * B)}:end=${f6(r.b1 * B)},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st=${f6((r.b1 - r.b0) * B - 0.006)}:d=0.006[a${i}]`).join(';') +
    `;${runs.map((r, i) => `[a${i}]`).join('')}concat=n=${runs.length}:v=0:a=1${fo ? `,afade=t=out:st=${f6(total - fo)}:d=${fo}` : ''}[a]`;
  console.log(`  EDL audio: ${runs.length} runs (${runs.map((r) => `b${r.b0}-${r.b1}`).join(' ')})`);
  const ew = path.join(TMP, 'score_edl.wav');
  ff(['-i', wav, '-filter_complex', fc, '-map', '[a]', '-c:a', 'pcm_s24le', ew]);
  wav = ew;
}
let m = {};
try { m = JSON.parse(execFileSync('bash', ['-c', `ffmpeg -hide_banner -i '${wav}' -af loudnorm=I=-14:TP=-1:LRA=9:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p'`], { encoding: 'utf8' })); } catch (e) { m = {}; }
const ln = m.input_i ? `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true` : 'loudnorm=I=-14:TP=-1:LRA=11';
const LIMIT = 'aresample=192000:resampler=soxr,alimiter=limit=0.708:attack=0.5:release=40:level=false,aresample=48000:resampler=soxr';
const full = (TL.totalBeats + (TL.tailBeats || 0)) * B;
const last = segs[segs.length - 1], isEnd = !PIECES && last === TL.segments[TL.segments.length - 1];
const tail = isEnd ? (TL.tailBeats || 0) * B : 0; // hold the end card over the audio tail
const dur = PIECES ? PIECES.reduce((t, p) => t + p.b1 - p.b0, 0) * B : isEnd ? full - t0 : (last.b + last.n) * B - t0;
const vchain = [`tpad=stop_mode=clone:stop_duration=${tail}`, ...fxChain, 'format=yuv420p'].join(',');
// 4K: CRF-driven with a VBV ceiling, so the 97.8 s file is guaranteed to stay under 400 MiB (32 Mb/s x 97.8 s + audio
// = 395 MB = 377 MiB at most); MAXRATE=0 lifts it
const MAXRATE = process.env.MAXRATE != null ? process.env.MAXRATE : (W * H >= 3840 * 2160 * 0.9 ? '32M' : '0');
const vbv = MAXRATE && MAXRATE !== '0' ? ['-maxrate', MAXRATE, '-bufsize', (parseFloat(MAXRATE) * 2) + 'M'] : [];
// 1. picture (the expensive part; AUDIO_ONLY=1 reuses it to re-mux a new score), 2. audio, 3. mux (stream copy)
const vOut = path.join(TMP, 'final_' + path.basename(OUT, '.mp4') + '.video.mp4');
if (!(process.env.AUDIO_ONLY && fs.existsSync(vOut))) {
  ff(['-i', video, '-filter_complex', `[0:v]${vchain}[v]`, '-map', '[v]', '-t', String(dur), '-c:v', 'libx264', '-preset', FPRESET, '-crf', CRF, ...vbv,
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-an', vOut]);
}
const aOut = path.join(TMP, 'final_' + path.basename(OUT, '.mp4') + '.audio.m4a');
const truePeak = (f) => { const o = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -i '${f}' -map 0:a -af ebur128=peak=true -f null - 2>&1 | tail -n 14`], { encoding: 'utf8' }); const g = (re) => +((o.match(re) || [])[1]); return { I: g(/I:\s+(-?[\d.]+) LUFS/), TP: g(/Peak:\s+(-?[\d.]+) dBFS/) }; };
let trim = 0, meas;
for (let k = 0; k < 4; k++) {
  ff(['-ss', String(PIECES ? 0 : t0), '-i', wav, '-af', `${ln},${LIMIT}${trim ? `,volume=${trim.toFixed(2)}dB` : ''}`, '-t', String(dur), '-c:a', 'aac', '-b:a', '320k', aOut]);
  meas = truePeak(aOut);
  if (!(meas.TP > -1.0)) break;
  trim -= meas.TP + 1.1; // rare: shave the overshoot off and encode again
}
ff(['-i', vOut, '-i', aOut, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-t', String(dur), '-movflags', '+faststart', OUT]);
console.log('->', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1), 'MiB', fxChain.length ? `(${fxChain.length} transition filters)` : '', vbv.length ? `(VBV ${MAXRATE})` : '',
  `audio ${meas.I} LUFS, ${meas.TP} dBTP${trim ? ` (trim ${trim.toFixed(2)} dB)` : ''}`);
