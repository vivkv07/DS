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
