# User feedback on the 3D mode (binding)

Round 1 (on preview 4):
1. **"Roads are not clear in 3D… super pixelated."** Cause: the 3D ground reuses the
   top-down pixel-art ground painter as a texture. Required: 3D gets its own ground
   renderer: road ribbons built from the road polylines with crisp, resolution-independent
   asphalt (world-space procedural detail, tyre-worn darker tracks, tar patches, cracks),
   vector lane markings (dashed centre lines, edge lines, stop lines, zebra crossings),
   real 3D kerbs with the black-and-yellow paint, raised footpaths with tiles, medians with
   plants, smooth junctions; terrain (dirt, grass, plazas, sand, water edges) from a smooth
   blended surface map plus high-frequency detail, never visible texels or pixel noise up
   close; potholes as real dips/decals (`N.world.potholes`), wet puddles in rain. The 2D
   painter texture may only be used for distant LOD.
2. **"Main character is just floating, not walking or running as per visualization."**
   Required: feet planted on the ground (no hovering, correct origin and contact shadow),
   a proper walk cycle and a distinct run cycle whose stride matches the actual speed (no
   foot sliding), arm swing, slight body lean when running, idle breathing/looking around,
   smooth turning, riding poses on cycles/Scooty/auto with pedalling, getting on/off, and
   the same quality for NPCs. Verified with frame sequences, not single screenshots.

Round 2 (orchestrator art direction on the Blender `charminar_proto` blockout, binding for the
final Charminar model):
3. The proto reads as an open, skeletal frame with thin poles. The real Charminar is a
   **solid, massive square block** (about 20 m a side) of granite and lime plaster with
   **one great pointed arch cut through each face** (about 11 m wide, 20 m high), the four
   arches meeting in a vaulted crossing under a central floor. Above the arches the facade
   continues as solid wall: an ornate projecting balcony band, then **two upper storeys**
   with rows of small pointed arched openings and a parapet with small merlons; the small
   mosque sits on the top floor at the west side.
4. The **four minarets are thick, fluted/faceted shafts built into the corners** (not separate
   poles), rising about 56 m from the ground, i.e. well above the roof, with **two
   projecting carved balconies (rings)** on the free part and a **bulbous onion dome with a
   lotus-leaf base and a finial** on top.
5. **Clock faces** (added 1889) sit centred above each great arch. Colour: warm lime-plaster
   cream with grey weathering streaks, darker at the base. Proportions: height of the arch
   crown ≈ half the minaret height; the block's top ≈ 0.6 of the minaret height.

Round 3 (user request, binding for the Blender props/animals artist and the runtime):
6. **Trees in Blender, with wind.** Model the city's trees properly: coconut palms (curved,
   ringed trunks, drooping pinnate fronds, coconut clusters), neem (dense rounded crown,
   fine leaves), banyan (wide crown, aerial roots, buttressed trunk), gulmohar (umbrella
   crown, flame-red flowers in summer), ashoka (tall columnar), mango, tamarind, and roadside
   palms; 2-3 LODs each plus a camera-facing far impostor. **Bake wind weights** into a
   vertex colour channel (0 at the trunk base → 1 at frond/branch tips, plus a second channel
   for leaf flutter phase) so the runtime animates wind cheaply in a vertex shader (no
   skeletal rigs for trees). Coconut fronds must sway and flutter visibly; neem crowns
   breathe; banyan roots swing slightly.
7. **Birds.** Blender models with flap/glide/perch clips (or vertex-animation-friendly
   parts): pigeons, crows, black kites (cheel) that soar in circles, rose-ringed parakeets,
   egrets/cormorants for Hussain Sagar, mynas, and bats for dusk. Small, cheap, instancing-
   friendly.
