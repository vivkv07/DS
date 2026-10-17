# assets3d/extra — built props kept OUT of the pack (budget)

The 8 MB pack is shared by every family; the props share is ~500 KB. These Blender props are
built and previewed (`assets3d/previews/<id>*.png`) but not packed, so the game does not load them:

| id | tris | pack cost | clips |
|---|---|---|---|
| goat | 438 | ~39 KB | stand, walk, graze |
| bird_parakeet | 140 | ~20 KB | flap, glide, perch |
| bird_myna | 162 | ~24 KB | flap, glide, perch |
| bird_egret | 186 | ~27 KB | flap, glide, perch |
| bat | 126 | ~21 KB | flap, glide, hang, perch |

To ship one: move its `.glb` + `.json` back to `assets3d/` and run `node tools/pack_assets3d.cjs`
(rebuilding with `tools/blender/build_all.py <id>` also writes it to `assets3d/`).
