## Verdict: does it read as Hyderabad?

Yes. I checked the overview and close-ups (`tests/out/map_overview.png`, `map_lake.png`, `map_oldcity.png`, `map_core.png`,
`map_secunderabad.png`, `map_west.png`, `map_east.png`, `map_south.png`), plus overlays of the ideal projection against
the map. Someone who grew up in the city finds their way without a legend. Each point the brief asked about, checked
against the real data rather than memory:

| asked | real (from the data) | in the map | verdict |
|---|---|---|---|
| Hussain Sagar's shape and the Buddha | OSM shoreline 3.18 km N-S x 2.59 km E-W (taller than wide); Buddha on the Gibraltar rock in the south-central part (52 % from the W, 76 % from the N of the lake box) | real shoreline; Buddha on its island at 51 % / 73 %; straight Tank Bund edge on the SE, Sanjeevaiah Park peninsula in the north | recognisable, but the lake is **16 % too squat** (height/width 1.03 against 1.23; see "still off") |
| Tank Bund "running NE-SW" | runs SSW to NNE: chord 31 deg, from the Lumbini/Secretariat end to Kavadiguda; the lake on its NW side | chord 37 deg, lake on its NW side, statues 1-12 numbered from the Lumbini end | correct (6 deg steeper) |
| Necklace Road curve | wraps the W and S shore, 158 deg of total turn | 146 deg, lake on the same hand | correct |
| the Musi crossing W-E | enters at Gandipet / Langar Houz, Esi joins at Bapu Ghat, runs between the Old City and Afzalgunj / Koti | x 0 to 15000, Esi at Bapu Ghat, 10 crossings in the right W-to-E order (Gandipet Rd, Bapu Ghat, Purana Pul, Musallam Jung, Naya Pul, Salar Jung Pul, Chaderghat, causeway, Golnaka, Moosarambagh, Nagole) | correct |
| Charminar at the heart of the Old City | Laad Bazaar W (279 deg), Mecca Masjid SW (232 deg), Gulzar Houz N (11 deg), Chowmahalla SW (227 deg) | 279, 235, 9, 222 deg | correct |
| Koti / Abids / Nampally | Nampally NW of Abids (301 deg); Koti ESE of Abids (110 deg); MJ Market SW of Abids (216 deg); MGBS S of Koti (182 deg) | 300, 112, 222 and 176 deg | correct |
| Secunderabad north-east of the lake | Clock Tower NE (54 deg, 3.2 km); the station ENE (70 deg) | 58 deg; 74 deg | correct |
| Begumpet airport north-west of the lake | **north** of the lake (352 deg, 2.7 km), runway 09/27 | 354 deg, E-W runway | correct (the brief's "north-west" is slightly off: the airport is due north, a touch west) |
| Golconda far west | Bala Hissar 8.2 km at 287 deg (W, a little north) from Charminar; Qutb Shahi Tombs NNW of the citadel (338 deg) | 290 deg; tombs 344 deg from the citadel | correct |
| HITEC City / Cyber Towers far north-west | 14 km NW (315 deg) of Charminar, 10.3 km W (286 deg) of the lake | 316 deg / 282 deg | correct |
| Dilsukhnagar south-east | SE of the lake (138 deg), E of Charminar (83 deg) | 137 deg / 79 deg | correct |

Cross-checks against independent OSM data (named building outlines in the Geofabrik-schema Hyderabad extract, ODbL):
Charminar 17.361596, 78.474628 (places.json is 5 m away), Mecca Masjid 17.360382, 78.473125 (30 m), Salar Jung Museum
17.371219, 78.480379 (35 m). The coordinates of the well-known landmarks can be trusted.

## What was wrong, and the fix

| problem found | cause | fix | where |
|---|---|---|---|
| The Pathergatti arcades and the Madina Building stood 110-190 u (~150 m) west of Pathergatti Road. The `pathergatti` place (the stone-arcade tape stall of cassette 9) was at the Madina Building, so 3 compass and 2 "closer" relations failed. | places.json estimates 75-150 m off the OSM road; builder `SITE_PAIR` put the place at the Madina Building, 300 m from the arcades | coordinates corrected from OSM "Pathergatti Road" (trunk); the place now stands at the west arcade on the road (moved 313 u to [9102, 7805]); the Madina Building now stands at Madina circle, north end of the road, at the foot of Naya Pul (moved 252 u to [9056, 7400]); `hotel_madina` (alias) follows | `design/geo/places_fixes.json`, `tools/geo/build_worlddata.cjs` (SITE_PAIR) |
| Naya Pul, Afzalgunj (Salar Jung Pul), Musallam Jung and Chaderghat bridge places were 135-410 m off the OSM bridges; "under Naya Pul" hide spot 150 m off | researchers' "crossing not verified" estimates; the builder had already snapped the places onto the real bridges, so the map was right and the data was wrong | the data now uses OSM bridge midpoints (high confidence); `hide_nayapul_sand` sits beside the real bridge (moved 183 u) | `places_fixes.json` |
| Lower Tank Bund place 180 m east of the road | estimate | on the OSM road (data only; the map spot is unchanged) | `places_fixes.json` |
| "To Chilkur Balaji", "To Mrugavani", "To Himayat Sagar" and "Gandipet road" signposts stood mid-map, 4 km inside the west edge, near Langar Houz, on the north bank | `edgeExit()` read the first piece of `gandipet_rd` after the road was split at the Musi | the edge exit uses the piece that reaches the frame; the signposts now stand at the west edge (x 40-130) on the south side of the river, as the real Chevella / Gandipet road runs | `build_worlddata.cjs` |
| `gandipet_rd_bridge` was one 3.6 km "bridge" running along the river | the estimated straight continuation to the frame edge crossed the meandering Musi three times, and the splitter made one bridge from the first crossing to the last | the estimate keeps to the south bank (the real alignment is 150-430 m south of the river) and leaves the frame 480 m south of it; the splitter now makes one bridge per crossing. Gandipet Road now has a single 70 u bridge near Langar Houz | `build_worlddata.cjs` |

Durability: `tools/geo/apply_place_fixes.cjs` applies `places_fixes.json` to places.json, and `merge_places.cjs` now
runs it as its last step, so a re-merge keeps the corrections. Every corrected entry keeps its old values in
`entry.fix.prev`.

## Still off, and why it stays

1. **The middle of the city is stretched east-west.** This is the projection, not the builder. Along the dense
   north-south band (Abids, Koti, Himayatnagar, the lake, Secunderabad, Begumpet), the warp stretches east-west
   distances 18-30 % more than north-south ones (Jacobian at the lake: 1.33 E-W against 1.02 N-S, anisotropy 0.76).
   The band expands sideways inside the fixed 4:3 frame. The effects:
   - Hussain Sagar is 16 % too squat.
   - Tank Bund tilts 6 deg.
   - Basheerbagh ends up nearer Liberty than Fateh Maidan.
   - 4 compass claims near a sector boundary flip, by 7-13 deg.

   I tried a local, area-preserving shear around the lake (the warp stays the gradient of a convex function, so there
   is still no fold-over and no rotation). Inside a radius that leaves the colony alone, it cannot fix the lake: the
   ring around it absorbs the correction (lake 1.03 to 1.00-1.13; anisotropy down to 0.55 and bearings up to 17 deg
   around it). It would also move Tank Bund by 50-130 u and the colony by up to 22 u. I rejected it and reverted
   `project.cjs` unchanged.

   The proper fix is to re-tune `project.cjs` with an anisotropy term in `tune_projection.cjs`'s objective (for
   example, penalise anisotropy below 0.85 inside the band). That would move nearly every coordinate, so it needs a
   coordinated pass with the teams that convert v1 positions (collectibles F07 jetty-to-Buddha distance, story travel
   times, seasons, menus).
2. **Lower Tank Bund** is drawn 45-55 m from its real line. In reality it runs 39 m from the bund's centre line,
   which is narrower than a 60 u bund plus a 34 u street. The builder pushes it to the foot of the bund on purpose.
   Its order and side relations still pass.
3. **Golconda.** The `golconda_fort` place (where the player arrives) stands at Fateh Darwaza, the outer gate on the
   road from Langar Houz. The researchers' point for it is the Bala Hisar ticket gate, about 550 m north-west. The
   Golconda Fort Road makes a 145 m dog-leg to meet the gate on its axis. Both are game choices. The compass
   relations use the citadel (`golconda_bala_hissar`), which is what "Golconda" means on a map.
4. **7 district claims fail.** All are low-confidence everyday shops (a dosa bandi, two book depots, a medical shop,
   a mosque, Sangeet 70mm) or a lake-bank hide spot. The builder snapped each one to its street, 130-200 u from a
   researcher estimate, across a ward boundary. Their street is better information than the estimate.
5. One STD booth is 30 u out of order with Lakdikapul along Khairatabad Road, after a collision nudge.

## Notes for the other teams

- Moved by this pass:
  - `pathergatti` and its alias `hotel_madina`: [8852, 7616] to [9102, 7805].
  - `madina_building`: [8926, 7616] to [9056, 7400].
  - `pathergatti_arcade_w`: [8975, 7833] to [9036, 7791].
  - `hide_nayapul_sand`: to [9109, 7253].
  - The four west-edge signposts: from about [4000, 7050] to about [40-130, 7200].

  Code that looks these up by id follows automatically. Cassette 9's hint ("in the stone arcade, at the tape stall")
  and the attar man now really stand in the arcade.
- `design/map_plan.md` (map builder's file) still lists the old positions of those ids.
- The rebuild also picked up the concurrent near-miss junction work in `build_worlddata.cjs` / `near_miss.cjs` (not
  mine). That is why dead-end warnings fell from 2,382 to 1,084 and a few places near new connectors moved by under
  30 u.
