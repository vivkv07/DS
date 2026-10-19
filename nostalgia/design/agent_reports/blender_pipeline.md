# Blender pipeline report (conventions for asset artists)

I built a working Blender-to-game pipeline for NOSTALGIA, and its tests pass. The final `node tests/models3d.cjs` run passed all four sections: lazy loading and gameplay, the Charminar proto, the fallbacks, and dist (1411 s on this heavily loaded machine). `tests/smoke.cjs` also passed on desktop, phone portrait and phone landscape. The pack is current (`--check` digest 684d932e5f8b) and `dist/` was rebuilt.

Blender runs headless as the `bpy` 5.2.2 Python module. Every asset is a Python script, so it can be rebuilt and reviewed in git:
- **`tools/blender/kit.py`:** the shared toolkit. It covers units, a library of realistic materials (plaster, granite, rusty tin, chrome, skin, cloth and so on), modelling helpers (Mughal arches, minarets, onion domes, balconies, parapets, grills, stairs, painted signboards), texture and shadow baking, export, preview renders, contact sheets, the shared kid/adult skeleton, walk/run/idle/riding animation, and the manifest writer.
- **`tools/blender/build_all.py`:** builds each asset in a fresh Blender process and prints a summary.
- **`tools/pack_assets3d.cjs`:** shrinks the models and writes them into `src/assets3d_pack.js`. It fails if the pack goes over 8 MB or an asset goes over its triangle budget.
- **`src/models3d.js`:** the in-game side. Nothing loads in the top-down view; the loader and pack load only when 3D starts. It swaps Blender models in per entity and falls back to the existing hand-coded 3D models whenever a model is missing, broken or turned off.

Four assets are built, each with preview renders:
- **`kid_chinnu`:** the player. Rigged, with idle, stroll, walk, run and cycle-riding animations. In the game his feet stay planted: on the 8-frame, 0.1 s strips the soles slide 5.6% when walking and 2.2% when running (the limit is 8%), and running has proper airborne frames.
- **`hero_cycle`:** with wheel, handlebar and seat anchors, and the brand name painted as plain text on the chain guard (no logo). It renders parked and in 3D traffic. Traffic men ride it as `adult_man`, with the feet within 0.04 u of the pedals.
- **`charminar_proto`:** a 31k-triangle blockout that replaces the existing Charminar only while `N.models3d.useProto` is on. It looked right in day, night and third-person screenshots.
- **`adult_man`:** an extra asset I added so traffic cyclists have a rider.

`ARCHITECTURE.md` §21 now holds the binding rules for asset artists, also summarised in the notes below.

## Notes (binding conventions)
- Commands: build with `/home/user/.venvs/blender/bin/python tools/blender/build_all.py [ids] [--no-preview] [--quick] [--pack] [-j N]` (`--list` shows the registry, `--one id` builds in the current process). Then run `node tools/pack_assets3d.cjs` (`--check` tells you if the pack is current), `node tools/build.mjs` and `node tests/models3d.cjs` (`ONLY=lazy,proto,fallback,dist`; `SHOTS=0` skips screenshots). Rendering is Cycles on CPU only, so bakes and previews use low samples.
- Registering an asset: put `@kit.asset('<id>', '<family>', **meta)` on `def build(A)` in a family script under `tools/blender/` (`characters.py`, `vehicles.py`, `landmarks_<area>.py`, `props.py`). Families are character, vehicle, landmark, hero_landmark and prop; ids are unique snake_case. The builder finishes with `kit.finish_atlas` (characters, vehicles, props, small landmarks) or `kit.finish_tiled` (big landmarks), adds anchors with `A.anchor(name, loc, armature, bone)`, fills `A.clips`, and sets `A.tint` and `A.preview`.
- Units and axes (binding): 1 Blender unit = 1 world unit, Z up (the exporter converts to Y-up). Heights include VS=1.5: a storey is 15 u, kids about 7 u, adults about 9 u. Front = -Y in Blender (+Z in the GLB), so an unrotated model faces south, and the character's left is +X. The origin sits on the ground at the centre of the 2D footprint.
- Landmarks are modelled at the worlddata w x d (for faces e/w, the model's width = lm.d) and turned with FR = {s:0, n:PI, e:PI/2, w:-PI/2}. Manifest meta: `draw` or `landmark`, `face`, `footprint`, `height`, `fit:'footprint'`, `proto`, `floodlit`.
- Vehicle meta: length along -Y equals `TYPES[t].w` (hero_cycle is 16 u with wheel radius 3.0). Also `vehicleTypes`, `length`, `wheelR`, `crankR`, `gear`, `steerAxis`. Character meta: `role`, `rig`, `height`, `look`.
- Names (binding): files are `assets3d/<id>.glb/.json` with previews `assets3d/previews/<id>[_shot].png`. Character bones (from `kit.BONES`): root hips spine chest neck head shoulder_L/R upperarm_L/R forearm_L/R hand_L/R thigh_L/R shin_L/R foot_L/R toe_L/R. Vehicle bones (rigid skin, one draw call): root steer wheel_front wheel_rear crank pedal_L pedal_R saddle.
- Anchors are empties named `anchor_<name>`. Characters: sole_heel_L/R, sole_toe_L/R, grip_L/R, eye, head_top. Vehicles: seat_driver, seat_pillion, handlebar, grip_L/R, pedal_L/R, headlight, wheel_front, wheel_rear, bell, reflector. Landmarks may add door_* and spot_*.
- Mesh and material names: `COL_*` meshes are invisible camera-ray proxies. Each asset has one baked material `M_<id>`, plus `M_<id>_<key>` for unbaked glass or lenses. A material whose name ends in `@night` glows at night.
- Materials: build only from `kit.material(key, name, **overrides)` in the `kit.LIB` library; its procedural detail (grain, rust, chipped edges, grime, ground dirt) gets baked. Textures ship as WebP inside the GLB, at most 1024² for a hero landmark and 512² for everything else.
- Budgets (the packer fails above them): hero landmark 60k triangles, other landmarks 20k, vehicles 6k, characters 4k, props 1.5k, and 8 MB for the whole pack.
- Character tinting: each face gets a tint region (none, skin, hair, shirt, stripes, pants, shoes, accent), exported as the vertex attribute `_REGION`. The runtime multiplies each region by the N.people look colour divided by the default colour, capped at 24.
- Animation clips (binding): names are idle, walk, run, stroll, ride_cycle, ride_scooty, sit, talk, wave, fall, getup, pick (more allowed). Locomotion clips are in place, loop seamlessly, start (phase 0) at left heel strike, are authored with `kit.gait_clip(rig, name, kit.GAITS[...])`, and must keep `slip` under 2%. Their manifest entry carries `{loop, loco, stride, nominal, duty, gait, slip}`.
- How playback works: the runtime blends locomotion clips by speed between neighbouring `nominal` speeds and advances the phase by distance travelled (phase += dist / sum of weight x stride), so feet cannot slide. Adults use the same `GAITS` scaled by leg length / 3.1.
- Riding: author with `kit.ride_clip(rig, vehicles.hero_geom(drop))` in the cycle's model frame; one clip cycle = one crank turn, and phase 0 = left crank pointing back. The cycle geometry riders depend on lives in `vehicles.HERO` / `hero_geom()`; change both together.
- In-game routing: models3d registers its own keys (`m3d:char:<id>`, `m3d:veh:<id>`, `#<landmark>`) and sends entities to them through the documented per-entity key `e.view3d`. It never overwrites the existing procedural renderers, so any entity it cannot handle falls back to them.
- Shipping: `index.html` never loads the pack. `dist/nostalgia.html` inlines the loader and pack as non-executing `<script type="text/plain">` blocks that run only when 3D starts. `dist/artifact.html` stays lazy, and `dist/artifact.files.json` lists the files to publish next to it.
- Change this session: `pack_assets3d.cjs` now writes the pack to a temporary file and renames it, so tests running in parallel never read a half-written pack.

## Known issues
- view3d.js has no unregisterLandmark or landmark-builder hook, so turning the Charminar proto off only puts back the procedural object it remembered. This works in the tests, but the core should add `N.view3d.unregisterLandmark(key)`; models3d already uses it when present.
- Rider models only cover adult men (man, uncle, lungi) on Hero-type cycles and Chinnu on chinnu_cycle. Pillions, women, kids on the Hero cycle (they ride it standing through the frame, 'kainchi' style), and the player on a Hero cycle all stay on the procedural renderer with rider IK.
- Getting on and off a cycle switches models instantly, with no transition (a visible pop).
- Entities that view3d_actors' debug tracker is watching are left on the procedural renderer, so that agent's tests keep passing.
- Unpacking the models is slow on software GL: about 4-15 s on this machine with load around 30. The 3D view keeps running on procedural models until they are ready.
- dist/nostalgia.html is now about 8.1 MB, of which the pack is 2.7 MB and the loader 129 KB. Other agents' 3D tests now load the pack and see the Blender player.
- The Charminar is only a blockout (`proto: true`) and is off by default. A finished hero landmark still needs an asset artist.
- kid_chinnu uses 3936 of its 4000-triangle budget, so there is little room left for more detail.

## Assets so far
- kid_chinnu tris=3936 kb=457.4 preview=/home/user/DS/nostalgia/assets3d/previews/kid_chinnu.png (+ _face, _gait, _ride)
- hero_cycle tris=5818 kb=500.7 preview=/home/user/DS/nostalgia/assets3d/previews/hero_cycle.png (+ _side)
- charminar_proto tris=31160 kb=1525.3 preview=/home/user/DS/nostalgia/assets3d/previews/charminar_proto.png (+ _arch)
- adult_man tris=3176 kb=380.3 preview=/home/user/DS/nostalgia/assets3d/previews/adult_man.png (+ _face, _gait, _ride)
