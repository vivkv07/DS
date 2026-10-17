#!/usr/bin/env bash
# NOSTALGIA — tools/perf/campaign.sh: the measurement campaign behind design/online/delivery_measurements.md
#   WORK=<scratch dir> bash nostalgia/tools/perf/campaign.sh [snapshot]
# 1. snapshot: build (tools/build.mjs) and freeze index.html, style.css, src/, vendor/, dist pages
# 2. fonts: mirror the Google Fonts css2 responses + woff2 files the page asks for (Android Chrome UA)
#    and make self-hosted subsets (needs a python with fonttools + brotli in $PY)
# 3. variants a/b/c/d (tools/perf/variants.mjs), byte budget (tools/perf/sizes.mjs)
# 4. browser runs (tools/perf/measure.cjs), sequential so they do not compete for the CPU
#    (part2 / part3 are the re-runs used for the report: sites2 = b with boot-phase marks,
#     sites3 = the e/f first-play variants; a fresh "snapshot" writes all of them into sites/)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
NOS="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:?set WORK to a scratch directory}"
PY="${PY:-python3}"
mkdir -p "$WORK/results"

if [ "${1:-}" = "snapshot" ]; then
  node "$NOS/tools/build.mjs" || exit 1
  rm -rf "$WORK/snap" && mkdir -p "$WORK/snap/src" "$WORK/snap/vendor/three" "$WORK/snap/assets3d"
  cp "$NOS/dist/nostalgia.html" "$NOS/dist/artifact.html" "$NOS/index.html" "$NOS/style.css" "$WORK/snap/"
  cp "$NOS"/src/*.js "$WORK/snap/src/"; cp "$NOS"/vendor/three/*.js "$WORK/snap/vendor/three/"
  cp "$NOS"/assets3d/*.glb "$WORK/snap/assets3d/" 2>/dev/null
  git -C "$NOS" rev-parse --short HEAD > "$WORK/snap/HEAD"; date -u > "$WORK/snap/WHEN"
  UA='Mozilla/5.0 (Linux; Android 13; SM-A346E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
  mkdir -p "$WORK/fonts" && cd "$WORK/fonts" || exit 1
  curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;600;800&family=Noto+Sans+Telugu:wght@400;700&family=VT323&family=Yatra+One&display=swap" -o fonts.css
  curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" -o kalam.css
  node -e '
    const fs=require("fs");const out=[];
    for(const f of ["fonts.css","kalam.css"]){const css=fs.readFileSync(f,"utf8");for(const m of css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]*)\}/g)){const b=m[2];out.push({subset:m[1],fam:(b.match(/font-family: .([^\x27]+)/)||[])[1],w:(b.match(/font-weight: (\d+)/)||[])[1],url:(b.match(/url\(([^)]+)\)/)||[])[1]});}}
    fs.writeFileSync("list.json",JSON.stringify(out,null,1));
    for(const f of out)console.log(f.url+" "+f.fam.replace(/ /g,"_")+"_"+f.w+"_"+f.subset+".woff2");' | sort -u -k1,1 | while read -r u n; do curl -sS "$u" -o "$n"; done
  node "$NOS/tools/perf/subset_fonts.mjs" --src "$WORK/snap" --in "$WORK/fonts" --out "$WORK/fonts_subset" --python "$PY"
  node "$NOS/tools/perf/variants.mjs" --snap "$WORK/snap" --out "$WORK/sites" --fonts "$WORK/fonts_subset"
  node "$NOS/tools/perf/sizes.mjs" --root "$WORK/snap" --fonts "$WORK/fonts" --json "$WORK/results/sizes.json" > "$WORK/results/sizes.txt"
  exit 0
fi

M() { # variant profile cpu runs steps
  echo "=== $1 $2 cpu$3 runs$4 [$5] $(date -u +%H:%M:%S)"
  node "$NOS/tools/perf/measure.cjs" --sites "${SITES:-$WORK/sites}" --variant "$1" --profile "$2" --cpu "$3" --runs "$4" --steps "$5" \
    --fonts "$WORK/fonts" --tmp "$WORK" --out "$WORK/results/runs" 2>&1 | grep --line-buffered -v '^\s*$'
}
ALL=title,play,frames2d,3d,frames3d
if [ "${1:-}" = "part3" ]; then
  export SITES="$WORK/sites3"
  M e slow4g 4 2 title,play
  M f slow4g 4 2 title,play
  M e 3g 4 1 title,play
  M f 3g 4 1 title,play
  M e fast4g 4 1 title,play
  M f fast4g 4 1 title,play
  echo "=== done $(date -u +%H:%M:%S)"
  exit 0
fi
if [ "${1:-}" = "part2" ]; then
  M a 3g 4 1 title,play,3d
  M a slow4g 4 2 title,repeat,offline
  M c slow4g 4 2 title,play,repeat,offline
  M d slow4g 4 2 title,play,repeat,offline
  M c 3g 4 1 title,play,repeat
  M d 3g 4 1 title,play,repeat,offline
  M a fast4g 4 1 title,repeat
  M c fast4g 4 1 title,play,repeat
  M d fast4g 4 1 title,play,repeat
  SITES="$WORK/sites2" M b none 4 2 title
  SITES="$WORK/sites2" M b none 1 1 title
  echo "=== done $(date -u +%H:%M:%S)"
  exit 0
fi
M b none 4 2 title
M a slow4g 4 2 "$ALL"
M a fast4g 4 1 "$ALL"
M a 3g 4 1 title,play,3d
M a slow4g 4 2 title,repeat,offline
M c slow4g 4 2 title,play,repeat,offline
M d slow4g 4 2 title,play,repeat,offline
M c 3g 4 1 title,play,repeat
M d 3g 4 1 title,play,repeat,offline
M a fast4g 4 1 title,repeat
M c fast4g 4 1 title,play,repeat
M d fast4g 4 1 title,play,repeat
M b none 4 2 title
M b none 1 1 title
M e slow4g 4 2 title,play
M f slow4g 4 2 title,play
M e 3g 4 1 title,play
M f 3g 4 1 title,play
M e fast4g 4 1 title,play
M f fast4g 4 1 title,play
echo "=== done $(date -u +%H:%M:%S)"
