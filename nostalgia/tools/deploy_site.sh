#!/usr/bin/env bash
# NOSTALGIA — tools/deploy_site.sh: build the playable web copy and publish it to the gh-pages
# branch of this repo, which GitHub Pages serves at https://vivkv07.github.io/DS/.
#
# gh-pages only ever holds the built site. Each deploy is one new commit on top of the last,
# so earlier builds stay in its history (roll back by reverting there).
#
#   tools/deploy_site.sh                 build + assemble + push
#   tools/deploy_site.sh --dry-run       build + assemble dist/site only
#   tools/deploy_site.sh --from-dist     skip the build: publish the dist/web.html already tested
#   DEPLOY_REMOTE=<url> DEPLOY_BRANCH=<branch> tools/deploy_site.sh
set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)
REMOTE=${DEPLOY_REMOTE:-$(git -C "$HERE" remote get-url origin)}
BRANCH=${DEPLOY_BRANCH:-gh-pages}
SITE_URL=${DEPLOY_URL:-https://vivkv07.github.io/DS/}
SITE="$HERE/dist/site"
DRY=0; BUILD=1
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --from-dist) BUILD=0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

[ $BUILD = 1 ] && node "$HERE/tools/build.mjs"
[ -f "$HERE/dist/web.html" ] || { echo "dist/web.html missing: run without --from-dist" >&2; exit 1; }

SRC_REV=$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo unknown)
STAMP=$(date -u +%Y-%m-%dT%H:%MZ)

# Fresh checkout of the public repo (shallow; an empty repo just gets a new branch).
rm -rf "$SITE"
if [ $DRY = 0 ] && git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  git clone -q --depth 1 --branch "$BRANCH" "$REMOTE" "$SITE"
else
  mkdir -p "$SITE"
  git -C "$SITE" init -q -b "$BRANCH"
  [ $DRY = 0 ] && git -C "$SITE" remote add origin "$REMOTE"
fi
find "$SITE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

# dist/web.html plus the files it loads by relative path when 3D (or Online) starts (the core model pack, the lazy
# per-landmark GLBs in lazy3d/ next to index.html, GLTF loader, and the vendored three.js fallback;
# three.js itself comes from jsDelivr first).
mkdir -p "$SITE/src" "$SITE/vendor/three"
cp "$HERE/dist/web.html" "$SITE/index.html"
cp "$HERE/src/assets3d_pack.js" "$SITE/src/"
if [ -d "$HERE/dist/lazy3d" ]; then
  mkdir -p "$SITE/lazy3d"
  cp "$HERE"/dist/lazy3d/*.glb "$SITE/lazy3d/"
else
  echo "warning: dist/lazy3d missing (run tools/build.mjs): lazy landmarks will stay procedural" >&2
fi
cp "$HERE/vendor/three/three.min.js" "$HERE/vendor/three/GLTFLoader.classic.js" "$SITE/vendor/three/"
[ -f "$HERE/vendor/three/LICENSE" ] && cp "$HERE/vendor/three/LICENSE" "$SITE/vendor/three/LICENSE"
# online play (src/online.js): the vendored supabase-js fallback (jsDelivr is tried first)
mkdir -p "$SITE/vendor/supabase"
cp "$HERE/vendor/supabase/supabase.js" "$HERE/vendor/supabase/LICENSE" "$SITE/vendor/supabase/"
touch "$SITE/.nojekyll"
printf '{"build":"%s","source":"%s"}\n' "$STAMP" "$SRC_REV" > "$SITE/build.json"

cat > "$SITE/README.md" <<EOF
# Nostalgia · Side A — Hyderabad 2003

**Play:** ${SITE_URL}

Hyderabad, January 2003. Chinnu is eleven, his best friend Immu leaves for America after Eid,
and there is one last summer of the city to run through: Irani chai and Osmania biscuits,
Koti bus stand, Numaish, Tank Bund, cricket at LB Stadium, and an ending at Charminar.

A top-down open-city adventure for 90s kids, with an optional 3D third/first-person view
(press **V**). Runs in the browser on desktop and phone; progress saves in your browser.
The game sends anonymous play stats (no names, nothing you type) to help us improve it; they can be turned off in
Settings → Privacy.

This branch holds only the built game; the source is in the nostalgia/ folder of the claude/nostalgia-hyderabad-game branch. Build ${STAMP} (source ${SRC_REV}).
This is a play-testing build: pocket money is unlimited for now.

## Credits

- Map geography: GHMC ward boundaries from DataMeet (CC BY 4.0), derived from OpenStreetMap
  (© OpenStreetMap contributors, ODbL); Hyderabad open GIS layers.
- 3D engine: three.js r149 (MIT, see vendor/three/LICENSE).
- Online play: supabase-js 2.118.0 (MIT, see vendor/supabase/LICENSE).
- 3D models made in Blender for this game.
- Fonts from Google Fonts (SIL Open Font License).

All characters, shops, films and songs in the game are fictional. Real landmarks appear as
public places only.
EOF

echo "site assembled: $SITE ($(du -sh "$SITE" --exclude=.git | cut -f1))"
[ $DRY = 1 ] && exit 0

cd "$SITE"
git add -A
if git diff --cached --quiet; then echo "nothing changed; not deploying"; exit 0; fi
# DEPLOY_TRAILER: optional extra lines for the commit message (e.g. co-author attribution)
git commit -q -m "Deploy NOSTALGIA build $STAMP (source $SRC_REV)${DEPLOY_TRAILER:+

$DEPLOY_TRAILER}"
git push -u origin "$BRANCH"
echo "deployed: $SITE_URL (GitHub Pages takes about a minute to update)"
