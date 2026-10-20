#!/usr/bin/env bash
# NOSTALGIA trailer v2.1 — the final renders, in order, one heavy process at a time:
#   16:9  4K (assemble) + 1080p (downscale)      -> out/nostalgia_trailer_v2_2160p.mp4, _1080p.mp4
#   9:16  4K (assemble) + 1080x1920 (downscale)  -> out/nostalgia_reels_v2_2160x3840.mp4, _1080x1920.mp4
#   9:16  short Reels cut (EDL reels_short.json, reuses the 9:16 clips) + 1080x1920
#                                                -> out/nostalgia_reels_v2_short_2160x3840.mp4, _1080x1920.mp4
# then QA of every file (review.cjs: duration, resolution, fps, AAC, loudness, placeholders; sheets for the 4K files).
#   bash trailer/render_final.sh [step...]     steps: land land1080 vert vert1080 short short1080 qa   (default: all)
#   env: NICE=10  AUDIO_ONLY=1 (re-mux a re-rendered score.wav into the existing pictures, then redo the downscales + QA)
set -euo pipefail
cd "$(dirname "$0")/.."
O=trailer/out
NICE=${NICE:-10}
LOG=$O/final_render.log
steps=${*:-land land1080 vert vert1080 short short1080 qa}
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }
down() { # 4K master -> 1080 (lanczos, CRF 18 slow; the audio is already normalised and verified: stream copy)
  nice -n "$NICE" ffmpeg -hide_banner -loglevel error -y -i "$1" -vf "scale=$3:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 18 \
    -profile:v high -pix_fmt yuv420p -c:a copy -movflags +faststart "$2"
}
for s in $steps; do
  t0=$(date +%s)
  case $s in
    land)      log "16:9 4K"; nice -n "$NICE" node trailer/assemble.cjs 3840 2160 2>&1 | tee -a "$LOG" ;;
    land1080)  log "16:9 1080p"; down $O/nostalgia_trailer_v2_2160p.mp4 $O/nostalgia_trailer_v2_1080p.mp4 1920:1080 ;;
    vert)      log "9:16 4K"; nice -n "$NICE" node trailer/assemble.cjs 2160 3840 2>&1 | tee -a "$LOG" ;;
    vert1080)  log "9:16 1080x1920"; down $O/nostalgia_reels_v2_2160x3840.mp4 $O/nostalgia_reels_v2_1080x1920.mp4 1080:1920 ;;
    short)     log "9:16 short 4K"; EDL=reels_short.json nice -n "$NICE" node trailer/assemble.cjs 2160 3840 2>&1 | tee -a "$LOG" ;;
    short1080) log "9:16 short 1080x1920"; down $O/nostalgia_reels_v2_short_2160x3840.mp4 $O/nostalgia_reels_v2_short_1080x1920.mp4 1080:1920 ;;
    qa)
      for f in nostalgia_trailer_v2_2160p nostalgia_reels_v2_2160x3840 nostalgia_reels_v2_short_2160x3840; do
        log "QA $f"; nice -n "$NICE" node trailer/review.cjs $O/$f.mp4 2 2>&1 | tail -6 | tee -a "$LOG"
      done
      for f in nostalgia_trailer_v2_1080p nostalgia_reels_v2_1080x1920 nostalgia_reels_v2_short_1080x1920; do
        log "QA $f"; NOSHEETS=1 NOAUDIO=1 nice -n "$NICE" node trailer/review.cjs $O/$f.mp4 2>&1 | tail -6 | tee -a "$LOG"
      done ;;
    *) echo "unknown step $s"; exit 1 ;;
  esac
  log "$s done in $(( $(date +%s) - t0 )) s"
done
