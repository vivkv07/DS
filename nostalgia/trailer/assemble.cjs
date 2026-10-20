/* NOSTALGIA trailer — assemble frames + score into the final video with ffmpeg.
 *   node trailer/assemble.cjs [W H]   env: FRAMES=dir (default out/frames)  EVERY=n (frames rendered every n-th)
 *                                         OUT=file (default out/nostalgia_trailer_<H>p.mp4)  CRF=16
 * Per segment: frame sequence -> exact-length clip (n beats x 12 frames @30 fps), effects (whip motion blur,
 * drop flashes, rain overlay text), grade + vignette on game footage; concat; mux the loudness-normalised score.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const W = +(process.argv[2] || 3840), H = +(process.argv[3] || 2160);
const OUTDIR = path.join(__dirname, 'out');
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const V2 = TL.version === 2; // v2 (gameplay-led) renders into frames2 / frames2_v
const FR = process.env.FRAMES || path.join(OUTDIR, V2 ? 'frames2' : 'frames');
// vertical (Reels / Shorts): portrait-native frames from FRAMES_V win (titles, cards, top-down clips, overlays);
// landscape 3D frames are centre-cropped (the hero is always centred)
const VERT = H > W;
const FRV = process.env.FRAMES_V || path.join(OUTDIR, V2 ? 'frames2_v' : 'frames_v');
const EVERY = +(process.env.EVERY || 1);
const CRF = process.env.CRF || '16';
const TAG = V2 ? '_v2' : '';
const OUT = process.env.OUT || path.join(OUTDIR, H > W ? `nostalgia_reels${TAG}_${W}x${H}.mp4` : `nostalgia_trailer${TAG}_${H}p.mp4`);
const FPS = TL.fps, BF = TL.beatFrames;
const TMP = path.join(OUTDIR, 'tmp' + TAG + '_' + W + 'x' + H); fs.mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// frames for a segment: <FR>/<id>/%05d.(jpg|png); 2D segments (cards/titles) are always full-rate
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
  return { dir, ext, step, count: files.length, w: dim[0], h: dim[1] };
}

const GRADE = 'eq=contrast=1.07:saturation=1.14:gamma=0.98,vignette=angle=PI/5:mode=forward';
const clips = [];
for (const seg of TL.segments) {
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
  if (VERT && s && s.w > s.h) filters.push('crop=ih*9/16:ih'); // landscape master -> centre 9:16
  filters.push(`scale=${W}:${H}:flags=${pixel ? 'neighbor' : 'lanczos'}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  // minigame captures (kind 'mg') are the game's own full-screen UI: no grade, no zoom, no sharpening
  if (seg.kind === '3d' || seg.kind === 'game') filters.push(GRADE);
  // motion in the edit: a slow push-in across every drone shot; a zoom punch (1.12 -> 1) on each gameplay cut
  // (zoompan: crop w/h are evaluated once, zoompan per frame; on = output frame number)
  if (seg.kind === '3d') filters.push(`zoompan=z='1+0.025*on/${nf}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`);
  if (seg.kind === 'game' && V2 && !pixel) filters.push(`zoompan=z='1.03-0.03*on/${nf}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`); // v2: longer shots, a slow pull-back
  else if (seg.kind === 'game' && !V2) filters.push(`zoompan=z='1+0.06*max(0,1-on/8)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS}`);
  if (seg.shot === 'whip') filters.push('tmix=frames=5:weights=1 1 1 1 1');
  // drop flashes: the first frames of the first shot after each drop
  const flash = V2 ? ['g_cycle_oldcity', 'a_kite', 'f_ganesh'] : ['lm_charminar', 'g_cycle_oldcity'];
  if (flash.includes(seg.id)) filters.push(`fade=t=in:st=0:d=0.2:color=white`);
  if (seg.kind === 'game') filters.push('unsharp=5:5:0.4');
  filters.push(`trim=end_frame=${nf}`, 'setpts=PTS-STARTPTS', `tpad=stop_mode=clone:stop=${nf}`, `trim=end_frame=${nf}`, 'format=yuv420p');
  let fc = `[0:v]${filters.join(',')}[v]`;
  const extra = [];
  // lower-thirds (transparent PNG frames rendered by render_titles.cjs): v1 rain '<id>_overlay', v2 captions '<id>_cap'
  const ov = seg.overlay ? { suf: '_overlay', b: seg.overlay.b } : (seg.cap || fs.existsSync(path.join(FR, seg.id + '_cap'))) ? { suf: '_cap', b: seg.b } : null; // finale_cap: story lines
  if (ov) {
    const od = VERT && fs.existsSync(path.join(FRV, seg.id + ov.suf)) ? path.join(FRV, seg.id + ov.suf) : path.join(FR, seg.id + ov.suf);
    if (fs.existsSync(od)) {
      const t0 = (ov.b - seg.b) * BF / FPS;
      extra.push('-framerate', String(FPS), '-start_number', '0', '-i', path.join(od, '%05d.png'));
      fc = `[0:v]${filters.join(',')}[b];[1:v]scale=${W}:${H},setpts=PTS-STARTPTS+${t0}/TB[o];[b][o]overlay=eof_action=pass:format=auto,format=yuv420p[v]`;
    }
  }
  ff([...input, ...extra, '-filter_complex', fc, '-map', '[v]', '-frames:v', String(nf), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', out]);
  clips.push(out);
  process.stdout.write(`  ${seg.id} ${s ? s.count + ' frames' : 'MISSING'}\n`);
}
// concat (all clips share codec params)
const list = path.join(TMP, 'list.txt');
fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
const video = path.join(TMP, 'video.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
// score: two-pass loudness normalisation to -14 LUFS / -1 dBTP
const wav = path.join(OUTDIR, 'score.wav');
let m = {};
try { m = JSON.parse(execFileSync('bash', ['-c', `ffmpeg -hide_banner -i '${wav}' -af loudnorm=I=-14:TP=-1:LRA=9:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p'`], { encoding: 'utf8' })); } catch (e) { m = {}; }
const ln = m.input_i ? `loudnorm=I=-14:TP=-1:LRA=9:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true` : 'loudnorm=I=-14:TP=-1:LRA=9';
const dur = (TL.totalBeats + (TL.tailBeats || 0)) * 60 / TL.bpm;
// hold the end card over the audio tail
ff(['-i', video, '-i', wav, '-filter_complex', `[0:v]tpad=stop_mode=clone:stop_duration=${(TL.tailBeats || 0) * 60 / TL.bpm}[v];[1:a]${ln},aresample=48000[a]`, '-map', '[v]', '-map', '[a]',
  '-t', String(dur), '-c:v', 'libx264', '-preset', H >= 2000 ? 'slow' : 'medium', '-crf', CRF, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '320k', OUT]);
console.log('->', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1), 'MB');
