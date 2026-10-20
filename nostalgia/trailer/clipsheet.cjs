/* NOSTALGIA trailer — cheap per-clip review sheets (no video encode): K evenly spaced frames of each segment, labelled
 * with the clip frame, the master beat and the timeline time; landscape clips also show the 9:16 window that
 * assemble.cjs crops for the vertical cut (VX, yellow) so the framing can be checked before a render.
 *   node trailer/clipsheet.cjs <segment id> [...]     env: K=8  V=1 (also the portrait-native frames, if any)  F=f1,f2 (explicit frames)
 *   -> out/review/clips/<id>.jpg (and <id>_v.jpg)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const TL = JSON.parse(fs.readFileSync(path.join(__dirname, 'timeline.json'), 'utf8'));
const OUT = path.join(__dirname, 'out', 'review', 'clips'); fs.mkdirSync(OUT, { recursive: true });
const K = +(process.env.K || 8), BF = TL.beatFrames, FPS = TL.fps;
// the vertical framing table lives in assemble.cjs: read it from there (VX = { ... };)
const src = fs.readFileSync(path.join(__dirname, 'assemble.cjs'), 'utf8');
let VX = {}; try { VX = eval('(' + src.match(/const VX = (\{[\s\S]*?\n\});/)[1] + ')'); } catch (e) { /* none */ }
const vxAt = (v, f, nf) => { // same maths as assemble.cjs vxExpr
  if (!Array.isArray(v)) return v || 0;
  const k = Array.isArray(v[0]) ? v : [[0, v[0]], [nf - 1, v[1]]];
  if (f <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i++) if (f < k[i + 1][0]) return k[i][1] + (k[i + 1][1] - k[i][1]) * (f - k[i][0]) / Math.max(1, k[i + 1][0] - k[i][0]);
  return k[k.length - 1][1];
};
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', maxBuffer: 1 << 26 });
for (const id of process.argv.slice(2)) {
  const seg = TL.segments.find((s) => s.id === id);
  if (!seg) { console.log('no segment', id); continue; }
  const nf = seg.n * BF;
  for (const [dirRoot, suf] of [['frames2', ''], ...(process.env.V ? [['frames2_v', '_v']] : [])]) {
    const dir = path.join(__dirname, 'out', dirRoot, id);
    if (!fs.existsSync(dir)) { console.log(id + suf, 'missing'); continue; }
    const files = fs.readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f)).sort();
    if (!files.length) { console.log(id + suf, 'empty'); continue; }
    const picks = process.env.F ? process.env.F.split(',').map(Number) : [...new Set(Array.from({ length: K }, (_, i) => Math.round(i * (nf - 1) / (K - 1))))];
    const tmp = [];
    const port = suf === '_v';
    for (const f of picks) {
      const file = files.find((x) => parseInt(x, 10) === f) || files[Math.min(files.length - 1, f)];
      const t = path.join(OUT, `_${id}${suf}_${f}.jpg`);
      const tw = port ? 270 : 480, th = port ? 480 : 270;
      const args = ['-define', `jpeg:size=${tw * 2}x${th * 2}`, path.join(dir, file), '-resize', `${tw}x${th}!`];
      if (!port) { // the 9:16 window (assemble.cjs: crop w = ih*9/16 centred at (iw-ow)/2*(1+vx))
        const ow = th * 9 / 16, x0 = (tw - ow) / 2 * (1 + vxAt(VX[id], f, nf));
        args.push('-fill', 'none', '-stroke', '#ffd400', '-strokewidth', '2', '-draw', `rectangle ${x0.toFixed(0)},1 ${(x0 + ow).toFixed(0)},${th - 2}`);
      }
      args.push('-stroke', 'none', '-fill', '#ffd400', '-undercolor', '#0008', '-pointsize', '15', '-annotate', '+4+16',
        ` ${id} f${f}  b${(seg.b + f / BF).toFixed(2)}  ${((seg.b * BF + f) / FPS).toFixed(2)}s (${files.length}/${nf}) `, t);
      sh('convert', args); tmp.push(t);
    }
    const out = path.join(OUT, id + suf + '.jpg');
    sh('montage', [...tmp, '-tile', `${port ? Math.min(8, tmp.length) : 4}x`, '-geometry', '+2+2', '-background', '#111', out]);
    for (const t of tmp) fs.unlinkSync(t);
    console.log('->', out, `${files.length}/${nf} frames`);
  }
}
