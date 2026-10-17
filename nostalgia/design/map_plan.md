# NOSTALGIA — Map plan (MAP_PLAN_FINAL) — Map v2: the real Hyderabad

The whole of Hyderabad and Secunderabad, early 2000s, as `N.WORLD_DATA` — since Map v2 (amendment A1)
laid out on the **real city**: every place at its real latitude / longitude, the roads on their real
alignments, the districts made of real GHMC wards, the real Hussain Sagar shoreline and Musi. This
document is the plan, the reference for the engine, the art modules and the story team, and the
record of where every coordinate came from. The tables at the end are generated from the live data.

**Credits (must appear in the game's credits):** Map reference: DataMeet Municipal Spatial Data
(CC BY 4.0) and © OpenStreetMap contributors (ODbL). Also: road, water and park geometry ©
OpenStreetMap contributors (ODbL) via Overture Maps Foundation and the Hyderabad district OSM extract
(github.com/shivakumar-ui-max/hyderabad-gis-map, Geofabrik free-layer schema); railway stations
datameet/railways (CC0); elevation Terrain Tiles on AWS Open Data (SRTM, public domain).
(`N.WORLD_DATA.geo.credits` / `.attribution` carry the same text.)

| File | What it is | Owner |
|---|---|---|
| `src/worlddata.js` | **Generated** — the map (districts, water, roads, rails, parks, landmarks, places, roofs, respect zones, blocks, trees, boulders, spawns). Sets `N.WORLD_W/H`. Carries the `// MAP_PLAN_FINAL` marker. Never edit by hand. | map builder |
| `tools/geo/build_worlddata.cjs` | The builder: `node tools/geo/build_worlddata.cjs` builds `src/.worlddata.next.js`, runs the map validator and the registry check on it, and only then swaps it into `src/worlddata.js` with an atomic rename. `--out FILE` builds elsewhere, `--no-swap` validates without swapping, `--verbose` explains every move. ~30 s. | map builder |
| `tools/geo/geom.cjs` | Geometry helpers for the builder (polylines, polygons, rasters, segment hash). | map builder |
| `tools/geo/extract_osm.cjs` | Turns the OSM extract (GeoPackage) into `design/geo/osm_streets.json` (street centrelines) and `osm_landuse.json` (park shapes). | map builder |
| `tools/geo/project.cjs` | lat/lon -> world units (base scale + smooth warp); see `design/geo/projection_report.md`. | projection designer |
| `design/geo/*.json` | The real data: `places.json` (651 ids with lat/lon, confidence, source), `districts.json`, `roads.json`, `water.json`, `rail.json`, `terrain.json`, `osm_streets.json`, `osm_landuse.json`. `worlddata_v1.js` = the hand-made v1 map, kept as the source of ids, kinds, names, signs, sizes and local layouts. | geo research / map builder |
| `src/world_extras.js` | Paints the railways (and level crossings) into the ground chunks and the minimap. | map |
| `tools/validate_map.cjs` | `node tools/validate_map.cjs [--file F]`: ids, must-haves, bounds, polygon district tiling + districtGrid, places on walkable ground, footprints off roads and water, one connected road network, **roads cross the Musi only on bridges**. `--tables` prints section 7. | map builder |
| `tools/check_registry.cjs` | Every place id the design documents use, the story structure (roofs, statues, podiums, respect zones) and, for Map v2, **every id of the v1 map**. | map builder |
| `tests/map_preview.cjs` | `tests/out/map_overview.png` (2000 x 1500) + crops (`map_core`, `map_oldcity`, `map_lake`, `map_colony`, `map_secunderabad`, `map_east`, `map_west`, `map_south`), then boots the real game and teleports to 42 places (`map_tp_<id>.png`). `WORLDDATA=file` previews a candidate map (served to the engine instead of the live one). | map builder |

Current numbers: 40 districts (39 game + Balanagar), 66 water bodies (Hussain Sagar, the Musi, the Esi,
Mir Alam, Durgam Cheruvu, Saroornagar, Himayat Sagar's in-frame edge, 50+ tanks, 4 nala channels),
3,403 roads (214 named real alignments, 6 game layouts, 3,183 residential infill lanes from OSM), 6
railway lines, 136 parks, 506 landmarks with 122 draw ids, 566 places, ~1,000 boulders, ~7,100 building
blocks, ~350 trees. worlddata.js is ~825 KB (infill lanes, blocks, boulders and trees are packed and
unpacked at load in a few ms). In headless Chromium world.js builds it in 2.0-2.8 s on a quiet machine (up to
5.6 s measured under load; 35,000 structures, 24,700 lots, 14,600 road nodes, ~80 MB heap); v1 took ~0.8 s.

## 1. Scale and shape

**World 15000 x 11250 u** (`N.WORLD_W/H`, set by worlddata.js; core.js keeps 8000 x 6000 only as a
default). The world is the A1 frame **lon 78.33507-78.56093 E, lat 17.31218-17.47482 N** (24 x 18 km),
north up, +y south. The projection (`tools/geo/project.cjs`, chosen by the projection designer, see
`design/geo/projection_report.md`) is one uniform base scale of **1.6 m per unit** plus a smooth,
monotonic warp (the gradient of a convex function: no fold-overs, no rotation) that gives the dense
cores more room. Compass bearings between neighbouring places change by 3.4° median, at most 13.8°;
the order of places along every road is kept.

| area | u per real metre | m per u |
|---|---|---|
| Charminar, Laad Bazaar, Mecca Masjid | 1.15-1.25 | 0.8-0.87 |
| Afzalgunj / Musi corridor | 0.91 | 1.1 |
| Abids, Koti, Himayatnagar | 0.88-0.98 | 1.0-1.14 |
| Tank Bund, Secunderabad, RTC X Roads | 0.75-0.77 | 1.3 |
| Banjara / Jubilee Hills, Golconda, HITEC, Dilsukhnagar, LB Nagar | 0.58-0.63 | 1.6-1.75 |

Buildings and landmarks keep their v1 game sizes (Charminar 64 x 64 u), which in the cores is now
close to their real size.

**How everything was placed** (`tools/geo/build_worlddata.cjs`):

1. **Real geometry is projected**: the 40 districts (unions of GHMC ward polygons), lakes and tanks
   (OSM shorelines; Hussain Sagar keyholed around the Buddha's rock), the Musi (a 32 u dry-season
   channel in a sandy riverbed park `musi_bed` whose width follows the measured bank-to-bank widths),
   the Esi and the nalas, the 214 named roads (`roads.json`: OSM alignments routed between junction
   waypoints), the railways (`rail.json`), the hills (DEM outlines: Naubat Pahad, Falaknuma, Moula Ali,
   Jalal Pahad, Fakhruddin Gutta) and real park shapes (OSM: Public Gardens, Lumbini Park, NTR Gardens,
   Sanjeevaiah Park, Indira Park, KBR Park, Parade Grounds, Gymkhana Ground, Gun Park, Victory Playground).
2. **Hand-tuned local layouts move as rigid groups** (translation by whole 4 u cells, never warped):
   the Lakshmi Nagar colony (home, friend's house, the six lootna terraces with planks and stairs,
   the colony ground and lanes), the Ashok Nagar terraces, the Charminar plaza (a 240 u square with
   the ring road redrawn at radius 84 u — the real 34 m circle would sit inside the monument's
   footprint), Gulzar Houz with the Char Kaman and Patang Chacha's roof, Mecca Masjid with its
   courtyard and houz, the Numaish grounds, LB Stadium, the Qutb Shahi Tombs, the Begumpet apron and
   Cyber Towers. Each group is anchored at its real position and nudged (<= 125 u) only if a real
   street would cross it. `N.WORLD_DATA.clusters` lists the translations.
3. **Roads**: the curated real roads; near-duplicate lines for one street are trimmed; the Lower
   Tank Bund is a 34 u street pushed to the foot of the bund (it runs only 39 m from it); approach
   roads join the Charminar ring and the Gulzar Houz loop along their axes ("ports"); a curated road
   that crosses the Musi gets an explicit bridge piece. Then **residential infill** from OSM in the
   districts that were built up by 2003 (Old City lanes 28 u apart, colonies 30-40 u, posh and outer
   areas sparser, nothing post-2003 in HITEC / Gachibowli), never through a landmark compound, a real
   park, the airfield or across the Musi. Islands are joined to the network or dropped. Places more
   than 150 u from any road get a short access spur.
4. **Landmarks** sit at their projected real centres (v1 sizes). Shops, carts, bus stops and other
   frontage landmarks are snapped to their real street (the v1 street when it is near, else the nearest)
   on the side the real point lies, facing it. Everything is then moved to the nearest spot clear of
   roads, footpaths, water, rails, roofs and other footprints (median move 4 u for high-confidence
   landmarks, 32 u for estimated ones). Stations stand beside the real track; the Tank Bund statues
   are numbered from the Lumbini end of the real bund; the Golconda wall follows a closed curve
   through the five estimated wall points with Fateh Darwaza (east) and Banjara Darwaza (north) on it.
5. **Places** stand at their building's entrance (v1 offset, turned with the building), junctions on
   their road, givers on the footpath of their v1 street, hidden spots off the roads; then each is
   moved to the nearest walkable cell. Things beyond the frame (KPHB, JNTU, Bolarum, Rashtrapati
   Nilayam, the University of Hyderabad, Harina Vanasthali, Ramoji, Gandipet, Chilkur, Mrugavani) stand
   at the world edge where their road leaves the map.
6. **Regenerated**: compounds and respect zones (v1 rules), avenue trees (coconut palms on Necklace
   Road), boulders in the real rock fields, and building blocks over the real street grid per district.

**Key coordinates** (real lat/lon, confidence and source from `design/geo/places.json`; world x, y
of the landmark centre, else the place; u/m = local scale):

| id | name | lat, lon | conf | source | world x, y | u/m |
|---|---|---|---|---|---|---|
| `charminar` | Charminar | 17.36163, 78.47467 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries); ASI Hyderabad circ | 9020, 8272 | 1.15 |
| `gulzar_houz` | Gulzar Houz | 17.36333, 78.47500 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) (17°21'48"N 78°28'3 | 9052, 8060 | 1.14 |
| `mecca_masjid` | Mecca Masjid | 17.36060, 78.47330 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) + Structurae agree  | 8839, 8398 | 1.17 |
| `laad_bazaar` | Laad Bazaar (Chudi Bazaar) | 17.36190, 78.47280 | medium | Sygic travel POI (17°21'42.9"N 78°28'22.2"E) | 8766, 8233 | 1.25 |
| `naya_pul` | Naya Pul | 17.37070, 78.47520 | medium | on the OSM Musi line where the Pathergatti/Madina road crosses to Afzalgunj; Wikipedia Nay | 9153, 7262 | 0.95 |
| `salar_jung_museum` | Salar Jung Museum | 17.37140, 78.48010 | high | latitude.to, Tripomatic, museum listings agree (~17°22'17"N 78°28'49"E) | 9548, 7308 | 0.93 |
| `high_court` | High Court | 17.36918, 78.47204 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) (17°22'09"N 78°28'1 | 8612, 7428 | 0.96 |
| `osmania_hospital` | Osmania General Hospital | 17.37290, 78.47350 | medium | latlong.net POI (near Afzal Gunj bus stop) | 8761, 7089 | 0.91 |
| `imlibun_bus_station` | Imlibun Bus Station (MGBS) | 17.37800, 78.48350 | medium | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) MGBS 17°22'41"N 78° | 9862, 6747 | 0.84 |
| `koti_bus_stand` | Koti Bus Stand | 17.38510, 78.48360 | low | estimated: Koti terminus by the Residency wall, beside Koti junction (Wikipedia/Wikidata i | 9826, 6125 | 0.88 |
| `abids` | Abids Circle | 17.38827, 78.47636 | medium | junction in front of the GPO | 8994, 5811 | 0.98 |
| `mozamjahi_market` | Mozamjahi Market | 17.38450, 78.47350 | medium | crossroads of Jam Bagh, Begum Bazaar and Station Road (heritage listings); the OSM red met | 8672, 6165 | 0.90 |
| `nampally_station` | Nampally Station (Hyderabad Deccan) | 17.39336, 78.46738 | high | datameet/railways stations.json (CC0) code HYB | 8152, 5327 | 0.79 |
| `public_gardens` | Public Gardens | 17.39820, 78.46950 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) Public Gardens (17° | 8321, 4956 | 0.78 |
| `assembly` | Legislative Assembly | 17.40050, 78.46950 | medium | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) Telangana Legislatu | 8294, 4824 | 0.77 |
| `lb_stadium` | Lal Bahadur Stadium (west gate) | 17.39933, 78.47180 | medium | AroundUs stadium GPS 17.39933,78.47333; place is the WEST gate so moved 160 m west to the  | 8673, 4880 | 0.78 |
| `birla_mandir` | Birla Mandir | 17.40619, 78.46906 | high | midpoint of two high-confidence values 0 m apart: NW [Wikipedia coordinates (17deg24m22s N | 8290, 4347 | 0.75 |
| `lumbini_park` | Lumbini Park | 17.40977, 78.47261 | high | midpoint of two high-confidence values 101 m apart: NW [Wikipedia coordinates (17.410,78.4 | 8639, 4074 | 0.78 |
| `buddha_statue` | Buddha Statue | 17.41556, 78.47503 | high | midpoint of two high-confidence values 6 m apart: NW [OSM waterbody polygon (Lakeer GIS re | 8895, 3606 | 0.82 |
| `tank_bund` | Tank Bund | 17.41687, 78.48119 | high | OSM waterbody polygon (Lakeer GIS repo, (c) OpenStreetMap contributors, ODbL) (straight ea | 9438, 3464 | 0.77 |
| `prasads_imax` | Prasads IMAX | 17.41284, 78.46588 | high | midpoint of two high-confidence values 0 m apart: NW [Wikipedia coordinates (Prasads Multi | 8054, 3848 | 0.74 |
| `sanjeevaiah_park` | Sanjeevaiah Park | 17.43050, 78.47570 | medium | OSM waterbody polygon (Lakeer GIS repo, (c) OpenStreetMap contributors, ODbL) (peninsula o | 8961, 2516 | 0.68 |
| `indira_park` | Indira Park | 17.41475, 78.48305 | medium | Wikipedia coordinates (17deg24m53s N 78deg28m59s E) + researcher knowledge (Domalguda, bes | 9645, 3662 | 0.77 |
| `home` | Home (Lakshmi Nivas, Lakshmi Nagar Colony) | 17.39900, 78.48780 | low | fictional colony anchored in a real residential pocket of GHMC ward 79 Himayath Nagar: the | 10108, 4985 | 0.97 |
| `rtc_x_roads` | RTC X Roads | 17.40520, 78.49600 | medium | on the OSM green-metro alignment (Chikkadpally-Musheerabad road); Wikipedia point 17.40324 | 10860, 4438 | 0.75 |
| `kachiguda_station` | Kachiguda Station | 17.38956, 78.49976 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) Kacheguda railway s | 11305, 5828 | 0.73 |
| `secunderabad_clock_tower` | Secunderabad Clock Tower | 17.44080, 78.49850 | high | Wikipedia coordinates (17deg26m27s N 78deg29m55s E) + trek.zone and travelprofy agree | 10817, 1833 | 0.77 |
| `secunderabad_station` | Secunderabad Station | 17.43370, 78.50160 | high | Wikipedia coordinates (17deg26m01s N 78deg30m06s E) + trainstracking 17.4347,78.5009 (agre | 11112, 2407 | 0.76 |
| `paradise` | Paradise | 17.44280, 78.48680 | medium | Wikipedia coordinates Paradise metro station 17deg26m37s N 78deg29m06s E + OSM rail/metro  | 9816, 1733 | 0.66 |
| `begumpet_airport` | Begumpet Airport | 17.44850, 78.47050 | medium | Wikipedia coordinates airport reference point 17.4531,78.4676 (aviation databases agree) + | 8664, 1388 | 0.61 |
| `ameerpet` | Ameerpet | 17.43450, 78.44570 | medium | OSM rail/metro geometry (Lakeer GIS repo, (c) OpenStreetMap contributors, ODbL) (red/blue  | 6702, 2450 | 0.62 |
| `panjagutta` | Panjagutta | 17.42650, 78.45260 | high | OSM rail/metro geometry (Lakeer GIS repo, (c) OpenStreetMap contributors, ODbL) (red-line  | 7152, 2925 | 0.64 |
| `khairatabad` | Khairatabad | 17.41120, 78.46120 | medium | OSM rail/metro geometry (Lakeer GIS repo, (c) OpenStreetMap contributors, ODbL) (red-line  | 7649, 3996 | 0.71 |
| `mehdipatnam` | Mehdipatnam | 17.39500, 78.43980 | medium | GHMC ward tri-point (Nanal Nagar/Mehdipatnam/Vijay Nagar Colony wards meet at 17.39477,78. | 6087, 5343 | 0.65 |
| `tolichowki` | Tolichowki | 17.39860, 78.41580 | medium | GHMC ward tri-point (Tolichowki/Nanal Nagar/Shaikpet wards meet at 17.39860,78.41552) + la | 4621, 5140 | 0.61 |
| `golconda_fort` | Golconda Fort | 17.38320, 78.40420 | medium | Wikipedia coordinates/ASI fort coordinate + researcher knowledge (Bala Hisar gate is at th | 4164, 6514 | 0.60 |
| `qutb_shahi_tombs` | Qutb Shahi Tombs | 17.39500, 78.39610 | high | Wikipedia coordinates (Qutb Shahi tombs 17deg23m42s N 78deg23m46s E, Ibrahim Bagh) + match | 3456, 5440 | 0.60 |
| `kbr_park` | KBR Park | 17.42060, 78.41930 | medium | Wikipedia coordinates (KBR National Park 17deg25m14s N 78deg25m09s E) + researcher knowled | 4914, 3541 | 0.61 |
| `jubilee_hills` | Jubilee Hills Check Post | 17.42930, 78.41250 | medium | OSM rail/metro geometry (Lakeer GIS repo, (c) OpenStreetMap contributors, ODbL) (blue-line | 4532, 2963 | 0.60 |
| `cyber_towers` | Cyber Towers | 17.45040, 78.38100 | medium | researcher knowledge + Wikivoyage (Shilparamam 17.4515,78.3772 "across the road from Cyber | 2602, 1680 | 0.58 |
| `osmania_university` | Osmania University Arts College | 17.41897, 78.52660 | medium | latlong.net "Osmania University College of Arts and Social Sciences" 17.418974,78.526596 ( | 12840, 3589 | 0.63 |
| `tarnaka` | Tarnaka | 17.42520, 78.53450 | medium | OSM rail/metro geometry (Lakeer GIS repo, (c) OpenStreetMap contributors, ODbL) (blue-line | 13403, 3165 | 0.61 |
| `malakpet` | Malakpet | 17.37700, 78.49550 | medium | datameet/railways stations.json (CC0) Malakpet station 17.3754,78.49424; OSM red-metro lin | 10900, 6862 | 0.74 |
| `dilsukhnagar_sai_temple` | Sai Baba Temple, Dilsukhnagar | 17.36786, 78.52728 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) Sai Baba Temple, Di | 12955, 7512 | 0.63 |
| `lb_nagar` | LB Nagar | 17.34843, 78.55096 | medium | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) L. B. Nagar + LB Na | 14457, 8876 | 0.60 |
| `falaknuma_palace` | Falaknuma Palace gate | 17.33050, 78.46750 | high | Wikipedia/Wikidata infobox coordinates (read via web-search summaries) (17°19'50"N 78°28'0 | 8398, 10267 | 0.57 |
| `nehru_zoo` | Nehru Zoological Park | 17.35111, 78.44972 | medium | Bharatpedia copy of Wikipedia Nehru Zoological Park (17°21'04"N 78°26'59"E) | 6858, 8880 | 0.65 |
| `moula_ali_dargah` | Moula Ali Dargah | 17.46500, 78.55900 | low | Wikipedia coordinates Moula Ali locality 17deg28m05s N 78deg33m22s E (the Moula Ali hill i | 14874, 596 | 0.58 |

Confidence: **high** = from map data or several agreeing sources, **medium** = one source or well
known, **low** = estimated (476 of 651 ids: everyday shops, carts, givers, hidden spots and the
fictional colony are plausible spots in the right neighbourhood, not surveyed). Roads: 82 high, 89
medium, 22 low (`roads[].conf`); the residential infill is OSM geometry (high), its 2003 era is
assumed by district.

**The spine runs south to north**, as in real life: Falaknuma on its hill → the Old City (Charminar,
Gulzar Houz, Pathergatti, Madina) → Naya Pul over the **Musi** (narrow channel in a sandy bed, bridges:
Purana Pul, Musallam Jung, Naya Pul, Afzalgunj, MGBS, Chaderghat, the causeway, Golnaka, Moosarambagh,
Nagole) → the Afzalgunj civic trio (Osmania General Hospital and State Central Library on the north
bank; High Court and Salar Jung Museum on the south bank) → Imlibun (MGBS) and Gowliguda → Koti,
Sultan Bazaar, Abids, Mozamjahi Market, Nampally (station, Numaish) → Public Gardens, the Assembly, LB
Stadium, Basheerbagh, Birla Mandir and the Planetarium on Naubat Pahad → **Hussain Sagar** with the
Tank Bund (east), Necklace Road (west and north), Secretariat Road and Lumbini Park (south) → Begumpet
(airport, Spanish Mosque) and Secunderabad (Paradise, Clock Tower, station, Parade Grounds, Monda
Market). East of the lake: Indira Park, Himayatnagar and Narayanguda (home), RTC X Roads and its
cinemas, Chikkadpally, Vidyanagar, Kachiguda, Osmania University, Tarnaka; south-east Malakpet,
Dilsukhnagar, LB Nagar. West: Khairatabad, Lakdikapul, Masab Tank, Mehdipatnam, Tolichowki, Golconda
and the Qutb Shahi Tombs, Banjara and Jubilee Hills among the boulders, Ameerpet, Erragadda, and
HITEC City with Cyber Towers far north-west.

**Railways** (`rails[]`, OSM track geometry): Nampally → Lakdikapul → Khairatabad → Necklace Road →
Hussain Sagar junction → Sanjeevaiah Park → James Street → Secunderabad (`rail_hyd_sec`); Hussain
Sagar junction → Begumpet → Fatehnagar → Borabanda → HITEC City (`rail_wadi`); Secunderabad →
Sitaphalmandi → Arts College → Vidyanagar → Kachiguda → over the Musi → Malakpet → Dabeerpura →
Yakutpura → Falaknuma (`rail_kachiguda`); Secunderabad → Moula Ali (`rail_kazipet`) and → Malkajgiri
→ Safilguda (`rail_bolarum`).

## 2. Data conventions (binding for everyone who reads `N.WORLD_DATA`)

- **Landmarks** `{id, name, draw, x, y, w, d, h, face?, ...}`: `x, y` = centre; `w` = east-west,
  `d` = north-south; `h` = suggested art height (10 u = one storey). `face` = the side the entrance
  or shopfront looks at (`n|s|e|w`; frontage shops face their real street). Extra fields: `variant`,
  `sign`, `films`, `gated`, `era`, `seasonal`, `axis`, `idx`, `faceAngle`, `summit`, `hill`, `clap`,
  `terrace`; **v2**: `conf` (high/medium/low), `ll` ([lat, lon] used), `v1` ([x, y] in the v1 map),
  `cluster` (the rigid layout it belongs to), `street` (the road a shop fronts), `track` (stations).
- **Collision**: as v1 (`noSolid`, `solids`). Compounds `<id>_compound` around worship places and
  palaces are regenerated from the final footprints.
- **Places** `{id, name, x, y, r, district, kind}`: a walkable point next to the thing it names
  (never inside a footprint, water or a boulder). `alias` = a second id for the same spot. **v2**:
  `conf`, `ll`. Roof places keep `level`, stairs feet `roof`.
- **Roads**: kinds and widths as v1 (`arterial` 48-56 u with `median` where the real road is
  divided, `street` 32-44, `lane` 18-24, `bund` 60, `bridge`, `path`). **v2**: `pothole` (0 smooth ..
  1 cratered, the A2 condition hint: from roads.json for named roads, by district style for infill),
  `conf`, `src` (`roads` real alignment, `cluster` game layout, `osm` / `grid` residential infill),
  `realName`, `spur`. T-junction endpoints lie on the other road's centreline.
- **Districts**: **v2** `poly` (main ring, world units), `polys` (every ring when there are several),
  `holes`, plus `rect` = bounding box (for old consumers) and `wards` (the GHMC wards it is made of).
  `districtGrid = {cell: 32, w, h, rle: [index, run, ...]}` is the exact, gap-free lookup (index into
  `districts[]`, row-major). Districts are sorted largest first, so rect consumers that let "later
  win" get the small ones on top. `fill`, `lot`, `style`, `ground` as v1.
- **Water**: lakes and tanks are real shorelines (islands keyholed); `river: true` for the Musi
  channel and the Esi, `nala: true` for the narrow nala channels; the Musi's sandy bed is the park
  `musi_bed` (`kind: ground, surface: sand`).
- **Rigid layouts**: `clusters{id: {dx, dy, v1Anchor, anchor, moved, conf}}`.
- **`fromV1(x, y)`** -> `[x, y]`: converts a coordinate written against the 8000 x 6000 v1 map
  (exact inside a cluster; elsewhere a moving-least-squares fit through ~180 known places). For module
  constants that still hold v1 coordinates; prefer place / landmark ids.
- **terrain.hills[]** `{id, name, peak, relM, outline, conf}`: real hills (relM = height above the
  surrounding ground in metres) for the 3D view.
- `blocks[]`, `rocks[]`, `trees[]` and the infill `roads` are stored packed and unpacked at load
  (same shapes as v1). `spawns`: `player` / `home` = the home gate, `title` = by Charminar.

## 3. Notes for the engine (world.js, main.js, index.html, view3d.js)

- `N.WORLD_W/H` = 15000 x 11250 are set by worlddata.js before world.js loads. Everything that
  sizes a grid must read them at build time (world.js, render.js, traffic.js and view3d.js do; view3d
  caps its chunk keys at 64 columns of 512 u = 32768 u).
- world.js reads `poly/polys/holes` and `districtGrid`, and the `pothole` hint (A2).
- Modules with hard-coded v1 coordinates must convert them with `N.WORLD_DATA.fromV1(x, y)` or a
  landmark's `v1` field (`lm.x + (oldX - lm.v1[0])`): collectibles.js (agent tape 1 `rxy` on the home
  terrace), seasons.js (Ramzan lights along Pathergatti and Laad Bazaar, a haleem bhatti, a distKey),
  places_art.js and view3d_landmarks.js (parked buses in the bus stations, MGBS bay islands and lines),
  menus.js (title attract-mode camera at Charminar), places_art.js (the NTR memorial fallback).
- Railway cells stay GROUND; where a line crosses water they become BRIDGE (world_extras.js).
- The Buddha's island is a keyhole hole (radius 34 u) at the real Gibraltar Rock; the boat ride from
  `lumbini_jetty` is now ~430 u.
- Nalas are narrow water channels: roads over them become BRIDGE automatically; footpaths stop.
- Tree kinds used in data: `neem`, `palm`, `coconut`, `banyan`, `gulmohar`.

## 4. Notes for the artists: the draw ids

Two modules draw the landmarks. **`src/landmarks.js`** (monuments, heritage, places of
worship) and **`src/places_art.js`** (civic, transport, markets, cinemas, everyday elements).
The full per-landmark table (positions, sizes, faces, signs) is in section 7. Every landmark
gets `N.landmarks.enqueue(lm, visible)` each frame and `paintGround(ctx, lm)` for static ground
art (use it for runway markings, the LB Stadium pitch, platform edges, rangoli, tyre marks).
Footprints below are w x d x h in world units.

### 4a. `src/landmarks.js` — monuments, heritage, worship

| draw | count | footprint | what it should look like (research notes) |
|---|---|---|---|
| `charminar` | 1 | 64 x 64 x 90 | Square block with four huge pointed arches facing N/S/E/W, arcaded upper galleries, mosque on top, four fluted minarets with two ring balconies and small onion domes on petal bases; four clock faces above the arches; lime-plaster cream #e8d9b5 on granite. The finale happens here (night, festive: Chand Raat). |
| `kaman` | 4 | 72 x 12 (or 12 x 72) x 52 | Char Kaman: single tall pointed arch gateway spanning a road, small guard chambers in the piers. `axis` says which way the road runs; only the piers are solid. Ids: `kaman_machli` (N), `kaman_charminar` (S), `kaman_kali` (W), `kaman_sher_e_batil` (E). |
| `gulzar_houz` | 1 | 22 x 22 x 10 | Octagonal fountain cistern in the middle of the square; kite and perfume stalls around. |
| `mecca_masjid` | 1 | 90 x 132 x 50 | Massive grey granite prayer hall, a row of large arches facing east onto the courtyard, two thick octagonal minaret-columns with small domes; pigeons. Courtyard (plaza) with a pond east of it. Walk-only, respectful. |
| `chowmahalla` | 1 | 150 x 170 x 30 | Walled Asaf Jahi palace (closed until 2005: show gated). Ochre-and-white neo-classical facades around long courtyards and pools, clock tower over the north gate. |
| `pathergatti_arcade` | 1 | 44 x 32 x 26 | Two-storey arcaded shop row in pinkish-grey dressed stone, shops below, homes above. |
| `madina_building` | 1 | 80 x 44 x 28 | Big Nizam-era block at Madina circle with ~200 shopfronts (saris, fabric); Hotel Madina in it. |
| `purani_haveli` | 1 | 128 x 66 x 26 | Long U-shaped Nizam palace; Nizam's Museum (opened 2000). |
| `high_court` | 1 | 168 x 62 x 36 | Striped red-and-white (or pink-and-white) stone, domes and minarets, on the Musi's south bank. |
| `salar_jung_museum` | 1 | 150 x 76 x 30 | Long cream building on the south bank; the musical clock (hourly gong). |
| `osmania_hospital` | 1 | 194 x 76 x 34 | Huge three-storey Indo-Saracenic granite block, domes, chhatris, merlons; the old tamarind tree. |
| `state_central_library` | 1 | 100 x 62 x 30 | Grand arched Nizam-era building at Afzalgunj. |
| `puranapul_arches` | 1 | 44 x 150 x 6 (walk-through) | Decorative overlay for Purana Pul: a row of ~22 low granite arches seen on both sides of the old bridge. |
| `british_residency` | 1 | 110 x 60 x 34 | Koti Women's College: Palladian mansion, tall Corinthian columns, pediment, lawns. |
| `assembly` | 1 | 66 x 70 x 40 | White Indo-Saracenic Town Hall with Rajasthani-style chhatris and a dome, facing east onto Public Gardens Road. |
| `jubilee_hall` | 1 | 48 x 34 x 22 | Small domed hall in Public Gardens. |
| `museum` | 1 | 58 x 40 x 24 | State Archaeology Museum (Indo-Saracenic, Public Gardens). `variant: state_museum`. |
| `gun_park` | 1 | 14 x 14 x 26 | Martyrs' memorial pillar in a small garden by the Assembly. |
| `statue` | 1 | 8 x 8 x 16 | Seated Gandhi statue on the Assembly lawn (`variant: gandhi_seated`). |
| `nizam_college` | 1 | 90 x 58 x 30 | Nizam-era college building, Basheerbagh. |
| `birla_mandir` | 1 | 64 x 56 x 52 | Gleaming white Rajasthani-marble temple on the Naubat Pahad rock, tall carved towers, stairs (path `birla_mandir_steps`) from Saifabad Road. No bells. Respectful, no chases. |
| `birla_planetarium` | 1 | 58 x 58 x 36 | White hemispherical dome + science museum block on the same ridge. |
| `secretariat` | 1 | 118 x 58 x 34 | Old Secretariat (exterior only). |
| `khairatabad_ganesh` | 1 | 46 x 36 x 50 | Pandal frame on its ground; the giant idol only when the `ganesh` season flag is on. |
| `raj_bhavan` | 1 | 80 x 54 x 30 | Governor's residence behind walls and lawns (exterior only). |
| `palace` | 5 | various | Gated old palaces, switch on `lm.id`: `hill_fort_palace` (castle-like, locked, Naubat Pahad), `king_kothi` (walled), `errum_manzil` (gate), `rashtrapati_nilayam` (gated, Bolarum), `chiran_palace` (KBR Park). |
| `falaknuma` | 1 | 170 x 110 x 36 | White Italianate scorpion-plan palace with wings as pincers, on its hill (rock park). Closed: gates only. |
| `buddha_statue` | 1 | 20 x 20 x 60 | 18 m white granite Buddha standing on a lotus pedestal on the island platform (`island: 34`). |
| `ntr_memorial` | 1 | 40 x 28 x 18 | NTR Ghat memorial in NTR Gardens (open from about 2000). |
| `tank_bund_statue` | 12 | 8 x 8 x 30 | Bronze figures of Telugu greats on tall stone plinths with name plaques along the lake edge of the real bund (numbered from the Lumbini end); `faceAngle` points at the road; lit at night. |
| `kakatiya_arch` | 2 | 20 x 10 x 30 | Kakatiya thoranam replica at each end of the Tank Bund. |
| `clock_tower` | 2 | 18 x 18 x 72 | Secunderabad Clock Tower (1896, stone, in its park); `variant: mahboob_chowk` for the 1892 Mahboob Chowk tower at the west end of Laad Bazaar (16 x 16 x 52). |
| `spanish_mosque` | 1 | 40 x 40 x 44 | Moorish mosque with pointed spires instead of domes (Begumpet). |
| `ou_arts_college` | 1 | 200 x 70 x 40 | Osmania Arts College: long monumental pinkish-grey granite front mixing Ajanta/Ellora pillars with Indo-Saracenic arches, big arched entrance, in a green rocky campus. |
| `fort_wall` | 5 named + ~80 numbered | wall blocks (12-90 x 12-90) x 28 | Golconda's outer wall as a chain of axis-aligned blocks along a closed curve (~1.2 km across); ids `golconda_wall_n/s/w/e1/e2` + `golconda_wall_<k>`. Sandstone/granite #b98f5e / #8f8a86, crenellations; the blocks touch, so draw each as a wall piece (bastions on the bigger ones). |
| `fort_gate` | 2 | 22 x 60 / 60 x 22 x 44 (walk-through) | `golconda_fateh_darwaza` (east, the clap gate; `clap: true`) and `banjara_darwaza` (north). Only the piers are solid. |
| `golconda_bala_hissar` | 1 | 84 x 64 x 46 | The Bala Hissar pavilion on the hilltop (`summit: true`); path `golconda_steps` climbs to it. |
| `qutb_tomb` | 6 | 44-70 square x 38-64 | Domed tombs on square arcaded bases on raised terraces, grey granite and stucco, a few blue-green tiles left. |
| `taramati_baradari` | 1 | 60 x 44 x 26 | Twelve-doored pavilion west of the fort. |
| `cyber_towers` | 1 | 96 x 96 x 90 | Curved, ringed reflective glass building (four quadrants around a central court), dramatic at sunset, lit at night. |
| `mahankali_temple` | 5 | 34-40 square | Mahankali/Yellamma temples (Bonalu sites): `lal_darwaza_temple`, `ujjaini_mahankali_temple`, `balkampet_yellamma_temple`, `akkanna_madanna_temple`, `golconda_jagadamba_temple`. Neem garlands, bonam pots on festival days. |
| `temple` | 12 | 30-50 square | Neighbourhood temples with a small gopuram (Venkateswara, Hanuman, Shankar Mutt, Pochamma, Sri Rama, Ayyappa, Peddamma, Karmanghat Hanuman, Ashtalakshmi, ISKCON, Katta Maisamma, station Ganesh). Switch on `lm.id` for the named ones. |
| `sai_temple` | 1 | 70 x 48 x 34 | Dilsukhnagar Sai Baba temple facing the main road across its forecourt; Thursday crowds, flower sellers. |
| `mosque` | 10 | 30-36 square | Neighbourhood mosques: white/green dome, two slim minarets; `jama_masjid_charminar`, `khairatabad_mosque` are named ones. |
| `church` | 8 | 44-56 x 40-70 | Spires and compounds: `church_st_josephs` (twin towers, Gunfoundry), `church_st_marys`, `church_wesley`, `st_johns_church_secunderabad`, `holy_trinity_church_bolarum`, `st_georges_church_abids`, colony churches. Christmas stars in December. |
| `dargah` | 3 | 40-44 square | Small domed shrines with chadars: Moula Ali (on its hill), Yousufain, Hussain Shah Wali. |
| `gurudwara` | 1 | 50 x 50 x 32 | Central Gurudwara, Gowliguda: white dome and Nishan Sahib flag. |
| `ashurkhana` | 1 | 50 x 40 x 26 | Badshahi Ashurkhana: mourning hall with glowing tile mosaics. |
| `paigah_tombs` | 1 | 90 x 60 x 22 | White marble lattice ("marble lace") tomb enclosure. |
| `memorial` | 1 | 50 x 40 x 20 | Bapu Ghat Gandhi memorial at Langar Houz. |

### 4b. `src/places_art.js` — civic, transport, markets, cinemas, everyday life

| draw | count | footprint | what it should look like |
|---|---|---|---|
| `railway_station` | 3 | 76-180 x 48-96 | `variant`: `nampally` (Nizam-era domed facade, terminus), `kachiguda` (Gothic 1916, twin towers, faces west), `secunderabad` (long Deccan-style facade facing south onto the forecourt). Platforms are plaza parks; tracks come from `rails[]`. |
| `halt_station` | 5 | ~60 x 26 | Small suburban halts (James Street, Begumpet, Sanjeevaiah Park, Necklace Road, Khairatabad). |
| `mgbs` | 1 | 204 x 120 | Imlibun bus station: terminal block on the north (solid strip), curved canopies over the bays to the south (walk under), red APSRTC buses. |
| `cbs_hangar` | 1 | 110 x 70 | Gowliguda "Mississippi" hangar: giant curved steel shed, open ends, buses inside (walk-through, side walls solid). |
| `bus_terminus` | 3 | 90-130 x 46-66 | Koti bus stand, Rathifile, Mehdipatnam depot: long shelter roof on pillars (back wall solid), route boards, conductors. |
| `bus_stop` | 22 | 32 x 10 | Roadside shelter with a painted stop name (`sign`). |
| `airport_terminal` / `control_tower` / `aeroplane` | 1 / 1 / 1 | 120 x 36; 18 x 18 x 52; 46 x 40 | Begumpet: low terminal, tower, a parked plane on the apron (runway and apron are plaza parks: paint markings in `paintGround`). |
| `mozamjahi_market` | 1 | 70 x 70 x 30 | Grey granite arcades around a two-storey octagonal clock tower, fruit and flowers; Karachi Bakery beside it. |
| `market_hall` | 4 | various | Monda Market halls, Chenoy Trade Centre, Murgi Chowk, Gaddiannaram fruit market (`variant: fruit`). |
| `rythu_bazaar` | 3 | ~150 x 72 | Open sheds on pillars over vegetable heaps; counters are the only solids (walk-through). |
| `numaish_gate` / `numaish_stalls` / `giant_wheel` / `maut_ka_kuan` | 1 / 2 / 1 / 1 | | Numaish (Jan-Feb): gate arch, rows of stalls, giant wheel (70 u tall), the motorbike "well of death". |
| `cinema` | 9 | 64-100 x 50-70 | Single-screen halls with huge hand-painted cut-outs (fictional `films`): `variant` `sandhya` (70mm and 35mm twin), `sudarshan`, `odeon`, `devi` (70mm) at RTC X Roads; also Ramakrishna, Liberty, Sangeet, Shanti, Anand. |
| `film_hoarding` | 2 | 30 x 6 x 40 | Free-standing painted film hoardings at RTC X Roads (posts solid). |
| `prasads_imax` | 1 | 78 x 68 x 44 | Round-ish modern multiplex on Necklace Road (opened July 2003: show new, or opening day). |
| `lb_stadium` | 1 | 198 x 220 x 30 | Concrete stands ring with gates west and south, floodlight towers at the corners; the field is a grass park (paint the pitch). |
| `stadium` | 1 | 200 x 150 | Gachibowli stadium (2002). |
| `restaurant` | 8 | ~44 x 28 | Paradise, Bawarchi, Shadab, Pista House, Shah Ghouse, Hotel Niagara, Taj Mahal Hotel, Hotel Nayaab (use `sign`). |
| `gokul_chat` | 1 | 34 x 24 | Koti chaat house: pani puri counter, crowd, kulfi. Joyful only. |
| `irani_cafe` | 18 | ~44 x 30 | Teal #2a8c82 Irani cafes: bentwood chairs, marble tables, biscuit jars, wall clock; every one serves Irani chai and Osmania biscuits. Named ones: Nimrah (faces Charminar), Grand Hotel, Cafe Bahar, Niloufer, Garden, Alpha, Blue Sea, Sarvi. |
| `bakery`, `iyengar_bakery` | 5, 4 | ~30 x 22 | Glass shelves, biscuit tins (Karachi Bakery, Subhan Bakery); Iyengar: warm yellow light, honey cake, puffs. |
| `kirana` | 20 | 26 x 20 | Kirana store: glass candy jars on the counter, sacks, a radio. |
| `stationery` | 8 | 24 x 18 | Notebooks, geometry boxes, brown cover paper rolls (near schools). |
| `pindi_girni` | 7 | 30 x 24 | Flour mill: thumping machine, flour-dusted doorway and uncle. |
| `std_booth` | 16 | 12 x 12 | Yellow "STD ISD PCO" glass cabin with a pulse-meter display (save points). |
| `barber`, `cycle_rent`, `video_parlour`, `photo_studio`, `medical_shop`, `meat_shop`, `internet_cafe` | 7, 5, 4, 6, 8, 7, 6 | 22-32 x 18-22 | Shopfronts with painted `sign` boards: barber pole; cycles on hire racked outside; arcade cabinets; "Colour Lab"; green cross; "Fresh Chicken & Mutton" with cages and a queue (no gore); beige CRTs in plywood cubicles. |
| `banana_cart`, `flower_cart`, `samosa_bandi`, `dosa_bandi`, `coconut_cart`, `chai_bandi`, `kite_stall`, `book_stall` | 10, 12, 7, 7, 7, 8, 3, 1 | 16 x 9 (rotated with `face`) | Pushcarts and stalls on the footpath. Flower carts cluster at temples (Sai Baba temple, Birla Mandir steps, Mahankali temples). |
| `bangle_shop` | 4 | 22 x 16 | Laad Bazaar: glittering stacks of lac bangles. |
| `school` | 14 | ~80 x 30 | Colony school: two-storey building with a painted name board and gate, a dusty ground behind (ground park). `variant: hps` for The Hyderabad Public School. |
| `college`, `library`, `ashram`, `bal_bhavan`, `campus_gate` | | | Government City College, JNTU; City Central Library; Ramakrishna Math; Jawahar Bal Bhavan; University of Hyderabad gate. |
| `hospital` | 3 | ~90 x 60 | NIMS, Sarojini Devi Eye Hospital, Apollo (no scary imagery). |
| `auditorium`, `radio_station`, `gpo`, `tv_tower` | | | Ravindra Bharathi, All India Radio (with mast), Abids GPO, Doordarshan Kendra tower (120 u). |
| `home_house` | 2 | 40 x 34 | The player's home "Lakshmi Nivas" (`terrace: true`: kites, water tank, clothesline on the roof) and the best friend's house (`variant: friend`). |
| `playground_kit` / `water_tank` | 2 / 7 | 18 x 10; 22 x 22 x 60 | Swings and slide; the colony's overhead municipal water tank. |
| `coaching_centre` | 2 | 60 x 34 | Ameerpet computer-coaching banners ("C C++ JAVA ORACLE"). |
| `film_studio` | 3 | ~120 x 60 | Annapurna, Sarathi, Ramanaidu: studio gates, "shooting in progress" boards. |
| `club_house`, `department_store`, `clothes_store`, `exhibition_hall` | | | Secunderabad Club (gated), Trendz Department Store (invented name), Cherma's, HITEX (construction site before 14 Jan 2003). |
| `zoo_gate`, `shilparamam_gate` | 1, 1 | walk-through | Gate arches (posts solid). |
| `boat_jetty`, `musical_fountain`, `dhobi_ghat`, `idol_workshop` | | | Lumbini jetty (over the water), the fountain, washing lines on the Musi sand, Dhoolpet Ganesh-idol sheds (`seasonal`). |

## 5. Notes for the story team

**Home.** The player lives in the fictional **Lakshmi Nagar Colony, Himayatnagar**, a game-unit
layout anchored in a real residential pocket of GHMC ward 79 (the wedge between Himayatnagar Main
Road and the Narayanguda–Chikkadpally road, north of Narayanguda, south of the Hussain Sagar surplus
nala). Its three lanes run out to the real streets around it. On it, unchanged relative to each
other: `home` (gate, spawn) and `home_terrace`, the lootna terraces `lakshmi_t2..t6`, the colony
ground `playground_home` (alias `playground_1`), `friend_home` with `friend_terrace`, `kirana_1`,
`pindi_girni_1`, `temple_1` with `flower_cart_1`, `chai_bandi_1`, `medical_shop_8`, `barber_7`,
`cycle_rent_5` and the colony water tank. `std_1` now stands on the real Himayatnagar street nearest it.

**Travel times** are about **1.8x the v1 ones** (the city is drawn at its real proportions; road
distance ≈ 1.3 x straight line; run 80 u/s, cycle 115, auto 135):

| From → to | road u | run | cycle | auto |
|---|---|---|---|---|
| home → RTC X Roads | ~1190 | 15 s | 10 s | 9 s |
| home → Koti Bus Stand | ~1570 | 20 s | 14 s | 12 s |
| home → Lal Bahadur Stadium | ~2010 | 25 s | 17 s | 15 s |
| home → Mozamjahi Market | ~2480 | 31 s | 22 s | 18 s |
| home → Tank Bund | ~2130 | 27 s | 19 s | 16 s |
| home → Charminar | ~4450 | 56 s | 39 s | 33 s |
| home → Secunderabad Clock Tower | ~4130 | 52 s | 36 s | 31 s |
| home → Sai Baba Temple, Dilsukhnagar | ~4930 | 62 s | 43 s | 37 s |
| home → Begumpet Airport | ~4960 | 62 s | 43 s | 37 s |
| home → Golconda Fort | ~7990 | 100 s | 69 s | 59 s |
| home → Cyber Towers | ~10580 | 132 s | 92 s | 78 s |
| Charminar → Golconda (the tunnel legend) | ~6680 | 84 s | 58 s | 50 s |
| Lumbini jetty → Buddha (boat 60 u/s) | ~430 | | | ~7 s by boat |

**The finale.** `charminar` (on the ring road north of the monument), `charminar_plaza` (the paved
square, south-east), the ring `charminar_circle` (radius 84 u; traffic can be stopped), Gulzar Houz
~210 u north with the four Char Kaman arches and Patang Chacha's roof, `laad_bazaar` running west
with the bangle shops and the recording centre, Mahboob Chowk at its far end, `nimrah_cafe` (alias
`irani_cafe_1`) and Café Noor-e-Iran by the Charminar–Gulzar Houz road, `mecca_masjid` and its
courtyard south-west (walk-only), `jama_masjid_charminar`, then Pathergatti and Madina ~650 u north,
Naya Pul and the Musi beyond.

**Festivals, givers, hidden spots, era**: as in v1 (`ganesh_immersion_point` on the real Tank Bund,
`bonalu` = Ujjaini Mahankali, Numaish at `nampally_exhibition`; `giver_*` x 36 on the footpath of
their district's street; `hide_*` x 41). Begumpet is the working airport (runway 09/27 on its real
line); no metro, no flyovers (OSM flyovers and the post-2003 expressway are left out). Off-map trips
leave from the world edges where their roads exit: `gandipet`, `chilkur_balaji`, `mrugavani_park`,
`himayat_sagar` (Gandipet road, west), `ramoji_film_city` and `vijayawada_highway` (NH 9, south-east),
JNTU / KPHB (NH 9, north-west), Bolarum (north), the University of Hyderabad (Old Mumbai Highway, west).

## 6. How to change the map

1. **Do not edit `src/worlddata.js`** — it is generated. Change the data in `design/geo/*.json`
   (real positions, roads, water...) or the rules in `tools/geo/build_worlddata.cjs` (clusters,
   infill spacing `INFILL`, avenues `AVENUES`, edge exits `EDGE`, compounds `COMPOUNDS`), or the v1
   source of ids and sizes `design/geo/worlddata_v1.js` (new ids, signs, sizes).
2. `node tools/geo/build_worlddata.cjs` builds, validates (validate_map + check_registry) and swaps
   atomically; on errors the live map is untouched and the candidate stays in `src/.worlddata.next.js`.
3. `node tests/map_preview.cjs` and look at `tests/out/map_*.png` (`WORLDDATA=src/.worlddata.next.js`
   previews a candidate).
4. Regenerate the tables below: replace everything after the marker with the output of
   `node tools/validate_map.cjs --tables`.
5. New OSM extract: unzip it into an empty directory and run `node tools/geo/extract_osm.cjs <dir>`.

## 7. Generated tables

<!-- GENERATED TABLES BELOW (node tools/validate_map.cjs --tables) -->

### Districts (40)

Polygons from real GHMC wards (DataMeet, CC BY 4.0); `bbox` = the compatibility rect [x, y, w, h].

| id | name | Telugu | GHMC wards | bbox | style | ground | block fill | conf |
|---|---|---|---|---|---|---|---|---|
| `rajendranagar` | Rajendranagar Fields | రాజేంద్రనగర్ | Ward 60 Rajendra Nagar, Ward 59 Mailardevpally, gap_sw_outskirts: Narsingi / Manikonda / Rajendranagar outskirts (outside GHMC in 2009 wards) | 0, 6880, 7586, 4370 | rocky | #ad9468 | 0.22 | medium |
| `lb_nagar` | LB Nagar & Nagole | ఎల్బీ నగర్ | Ward 12 Mansoorabad, Ward 18 Lingojiguda, Ward 15 Vanasthalipuram, Ward 14 BN Reddy Nagar, Ward 16 Hasthinapuram, Ward 21 Kothapet, gap_nagole: Nagole (ward 11 missing from the DataMeet layer) | 10403, 6183, 4597, 5067 | colony | #ad966e | 0.6 | high |
| `hitec` | Madhapur & HITEC City | మాదాపూర్ & హైటెక్ సిటీ | Ward 107 Madhapur, Ward 104 Kondapur, Ward 105 Gachibowli, Ward 106 Serilingampally | 0, 0, 4220, 4409 | hitec | #b39b74 | 0.5 | high |
| `golconda` | Golconda & Qutb Shahi Tombs | గోల్కొండ | Ward 67 Golconda, Ward 66 Langar Houz, Ward 94 Shaikpet, gap_sw_outskirts: Narsingi / Manikonda / Rajendranagar outskirts (outside GHMC in 2009 wards) | 0, 3845, 5203, 3038 | rocky | #b0946c | 0.35 | medium |
| `osmania` | Osmania University & Tarnaka | ఉస్మానియా యూనివర్సిటీ | Ward 143 Tarnaka, Ward 144 Mettuguda, Ward 145 Seethaphalmandi, Ward 146 Boudha Nagar, Ward 6 Nacharam, Ward 7 Chilka Nagar, Ward 5 Mallapur, Ward 8 Habsiguda, gap_ou_campus: Osmania University campus (no ward) | 11460, 1633, 3540, 3702 | rocky | #a59a6e | 0.5 | medium |
| `erragadda` | Erragadda & Sanathnagar | ఎర్రగడ్డ | Ward 101 Erragadda, Ward 100 Sanath Nagar, Ward 102 Rahmath Nagar, Ward 103 Borabanda, Ward 116 Allapur, Ward 117 Moosapet, Ward 118 Fateh Nagar | 2415, 0, 5687, 2276 | colony | #ad9670 | 0.9 | high |
| `langar_houz` | Langar Houz & Attapur | లంగర్ హౌస్ | Ward 66 Langar Houz, Ward 61 Attapur, Ward 65 Karwan | 2258, 6282, 4714, 2502 | colony | #ae956c | 0.7 | medium |
| `marredpally` | Marredpally & Malkajgiri | మారేడ్‌పల్లి | Ward 141 Gautham Nagar, Ward 140 Malkajgiri, Ward 142 Addagutta, Ward 137 Vinayak Nagar, Ward 139 East Anand Bagh, Ward 138 Moula Ali, gap_cantonment: Secunderabad Cantonment + Begumpet airport (cantonment board / airport land, not GHMC wards), Ward 136 Neredmet, Ward 135 Venkatapuram, Ward 2 Dr A S Rao Nagar | 10498, 0, 4502, 2589 | cantonment | #a19c70 | 0.7 | medium |
| `zoo` | Nehru Zoo & Mir Alam Tank | మీర్ ఆలం | Ward 55 Ramnaspura, Ward 57 Suleman Nagar, Ward 58 Shastripuram, gap_mir_alam: Mir Alam Tank (water, no ward) | 4677, 8235, 3683, 3015 | rocky | #a99a6c | 0.3 | high |
| `saroornagar` | Saroornagar | సరూర్‌నగర్ | Ward 19 Saroornagar, Ward 17 Champapet, gap_saroornagar_lake: Saroornagar lake (water, no ward), gap_kanchanbagh_karmanghat: Kanchanbagh defence labs / Karmanghat outskirts (outside wards) | 11516, 8029, 3302, 3221 | colony | #ad966e | 0.65 | medium |
| `secunderabad` | Secunderabad | సికింద్రాబాద్ | Ward 150 Monda Market, Ward 148 Ramgopalpet, Ward 147 Bansilapet, gap_cantonment: Secunderabad Cantonment + Begumpet airport (cantonment board / airport land, not GHMC wards) | 9130, 20, 3110, 3412 | cantonment | #a49d74 | 0.9 | medium |
| `amberpet` | Amberpet & Nallakunta | అంబర్‌పేట | Ward 82 Golnaka, Ward 83 Amberpet, Ward 84 Bagh Amberpet, Ward 9 Ramanthapur, Ward 10 Uppal, Ward 8 Habsiguda | 10585, 4555, 4415, 2332 | colony | #ab9670 | 0.8 | medium |
| `tolichowki` | Tolichowki & Mehdipatnam | టోలిచౌకి & మెహదీపట్నం | Ward 94 Shaikpet, Ward 68 Tolichowki, Ward 69 Nanal Nagar, Ward 70 Mehdipatnam, Ward 71 Gudimalkapur | 2943, 4077, 3638, 2795 | colony | #ae966f | 0.9 | medium |
| `chandrayangutta` | Chandrayangutta & Santoshnagar | చాంద్రాయణగుట్ట | Ward 43 Chandrayangutta, Ward 44 Uppuguda, Ward 42 Barkas, Ward 39 Santhosh Nagar, Ward 40 Riyasat Nagar, Ward 41 Kanchanbagh, Ward 36 Lalithabagh, gap_kanchanbagh_karmanghat: Kanchanbagh defence labs / Karmanghat outskirts (outside wards) | 8289, 8632, 3786, 2618 | colony | #ae956d | 0.7 | medium |
| `begumpet` | Begumpet | బేగంపేట | Ward 149 Begumpet, gap_cantonment: Secunderabad Cantonment + Begumpet airport (cantonment board / airport land, not GHMC wards) | 7227, 0, 3589, 2525 | posh | #a39b72 | 0.8 | medium |
| `jubilee` | Jubilee Hills & Film Nagar | జూబ్లీ హిల్స్ | Ward 95 Jubilee Hills | 3369, 1853, 2917, 2677 | rocky | #a8936f | 0.5 | high |
| `balanagar` | Balanagar & Bowenpally | బాలానగర్ | Ward 120 Balanagar, Ward 115 Balaji Nagar, Ward 119 Old Bowenpally, Ward 114 KPHB Colony, Ward 121 Kukatpally | 2696, 0, 7834, 970 | colony | #ab9670 | 0.5 | high |
| `khairatabad` | Panjagutta & Khairatabad | ఖైరతాబాద్ | Ward 97 Somajiguda, Ward 91 Khairatabad | 5759, 2136, 2909, 2514 | colony | #ab9670 | 0.94 | high |
| `bahadurpura` | Bahadurpura & Hussaini Alam | బహదూర్‌పురా | Ward 52 Puranapool, Ward 53 Doodh Bowli, Ward 56 Kishanbagh, Ward 54 Jahanuma | 5927, 7341, 2338, 2749 | oldcity | #b5a082 | 0.92 | high |
| `banjara` | Banjara Hills | బంజారా హిల్స్ | Ward 93 Banjara Hills, Ward 92 Venkateshwara Colony | 4401, 2713, 3228, 1986 | posh | #a19970 | 0.75 | high |
| `masab_tank` | Masab Tank & Lakdikapul | మాసాబ్ ట్యాంక్ | Ward 74 Ahmed Nagar, Ward 73 Vijay Nagar Colony, Ward 72 Asif Nagar, Ward 75 Red Hills | 5351, 4152, 2641, 2382 | colony | #ac9670 | 0.94 | medium |
| `falaknuma` | Falaknuma | ఫలక్‌నుమా | Ward 46 Falaknuma, Ward 45 Jangammet, Ward 47 Nawab Saheb Kunta, Ward 48 Shalibanda, Ward 35 Gowlipura, gap_barkas_south: strip south of Falaknuma / Barkas at the frame edge (no ward) | 7425, 8815, 2555, 2435 | oldcity | #b39c7c | 0.75 | high |
| `charminar` | Charminar | చార్మినార్ | Ward 32 Patthergatti, Ward 49 Ghansi Bazar, Ward 33 Moghalpura | 7351, 7229, 3019, 2055 | oldcity | #b8a384 | 0.98 | medium |
| `malakpet` | Malakpet | మలక్‌పేట | Ward 26 Old Malakpet, Ward 27 Akbarbagh, Ward 25 Moosarambagh, Ward 29 Chawni | 10455, 6106, 2449, 2322 | colony | #ad9771 | 0.92 | high |
| `puranapul` | Puranapul & Dhoolpet | పురానాపూల్ | Ward 63 Mangalhat, Ward 62 Ziaguda, Ward 64 Dattatreya Nagar, Ward 51 Goshamahal | 6081, 6050, 2471, 2145 | oldcity | #b5a081 | 0.96 | high |
| `musheerabad` | Musheerabad & Indira Park | ముషీరాబాద్ | Ward 86 Musheerabad, Ward 88 Bholakpur, Ward 90 Kavadiguda | 8988, 2931, 3152, 1642 | colony | #ab9670 | 0.94 | high |
| `hussain_sagar` | Hussain Sagar & Necklace Road | హుస్సేన్ సాగర్ | (Hussain Sagar + shore band) | 7746, 1995, 2260, 2280 | colonial | #9fa071 | 0.6 | medium |
| `ameerpet` | Ameerpet & SR Nagar | అమీర్‌పేట | Ward 98 Ameerpet, Ward 99 Vengal Rao Nagar, Ward 96 Yousufguda | 4564, 1417, 3540, 1451 | colony | #ac9670 | 0.94 | high |
| `dilsukhnagar` | Dilsukhnagar & Kothapet | దిల్‌సుఖ్‌నగర్ | Ward 22 Chaitanyapuri, Ward 23 Gaddiannaram, Ward 20 RK Puram, Ward 19 Saroornagar | 12664, 6267, 2121, 2394 | colony | #ae9771 | 0.92 | medium |
| `saidabad` | Saidabad | సైదాబాద్ | Ward 24 Saidabad, Ward 38 IS Sadan, Ward 37 Kurmaguda | 10495, 7384, 2344, 1881 | colony | #ad966f | 0.85 | high |
| `himayatnagar` | Himayatnagar & Narayanguda | హిమాయత్‌నగర్ | Ward 79 Himayath Nagar, Ward 89 Gandhinagar | 8894, 3619, 2062, 2077 | colony | #ad9771 | 0.96 | high |
| `kachiguda` | Kachiguda & Barkatpura | కాచిగూడ | Ward 80 Kachiguda, Ward 81 Nallakunta | 10257, 4538, 2005, 1990 | colony | #ad9771 | 0.94 | high |
| `dabeerpura` | Purani Haveli & Dabeerpura | దబీర్‌పురా | Ward 30 Dabeerpura, Ward 37 Rein Bazar, Ward 34 Talab Chanchalam | 9518, 6681, 1338, 2703 | oldcity | #b6a183 | 0.96 | medium |
| `afzalgunj` | Afzalgunj & the Musi | అఫ్జల్‌గంజ్ | Ward 50 Begum Bazar, Ward 49 Ghansi Bazar, Ward 32 Patthergatti | 7304, 6493, 2506, 1185 | colonial | #b19d7e | 0.9 | medium |
| `rtc_x` | RTC X Roads & Chikkadpally | ఆర్టీసీ క్రాస్ రోడ్స్ | Ward 87 Ramnagar, Ward 85 Adikmet | 10799, 3657, 1606, 1635 | market | #b09a7a | 0.96 | high |
| `nampally` | Nampally & Mozamjahi Market | నాంపల్లి | Ward 76 Mallepally, Ward 77 Jambagh, Ward 75 Red Hills | 6974, 5169, 1863, 1372 | market | #b19a7c | 0.96 | medium |
| `abids` | Abids | ఆబిడ్స్ | Ward 77 Jambagh, Ward 78 Gunfoundry | 8327, 5117, 1585, 1542 | market | #b29b7e | 0.97 | medium |
| `chaderghat` | Chaderghat & Imlibun | చాదర్‌ఘాట్ | Ward 30 Dabeerpura, Ward 28 Azampura, Ward 78 Gunfoundry | 9520, 6325, 1594, 1408 | market | #b09a7b | 0.95 | medium |
| `basheerbagh` | Public Gardens & Basheerbagh | బషీర్‌బాగ్ | Ward 78 Gunfoundry, Ward 75 Red Hills | 7953, 4195, 1391, 999 | colonial | #a49c72 | 0.85 | medium |
| `koti` | Koti & Sultan Bazaar | కోఠి | Ward 78 Gunfoundry | 9530, 5352, 1064, 999 | market | #b39b7d | 0.97 | medium |

### Landmarks drawn by src/landmarks.js (113 + 80 numbered Golconda wall blocks)

x, y = centre; w = east-west, d = north-south, h = suggested art height (1 storey = 10 u). lat, lon = the real position used; conf = its confidence (design/geo/places.json has the sources).

| draw | id | name | x | y | w | d | h | face | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ashurkhana | `badshahi_ashurkhana` | Badshahi Ashurkhana | 9058 | 7447 | 50 | 40 | 26 | n | 17.36909, 78.47573 | high |  |
| assembly | `assembly` | Legislative Assembly | 8294 | 4824 | 66 | 70 | 40 | e | 17.40050, 78.46950 | medium |  |
| birla_mandir | `birla_mandir` | Birla Mandir | 8290 | 4347 | 64 | 56 | 52 | s | 17.40619, 78.46906 | high |  |
| birla_planetarium | `birla_planetarium` | Birla Planetarium & Science Museum | 8423 | 4436 | 58 | 58 | 36 | s | 17.40470, 78.47030 | low |  |
| british_residency | `koti_womens_college` | Koti Women's College (British Residency) | 9946 | 6269 | 110 | 60 | 34 | n | 17.38372, 78.48475 | high |  |
| buddha_statue | `buddha_statue` | Buddha Statue (Gibraltar Rock) | 8895 | 3606 | 20 | 20 | 60 | s |  | high |  |
| charminar | `charminar` | Charminar | 9020 | 8272 | 64 | 64 | 90 | n |  | high | 1591; layout charminar |
| chowmahalla | `chowmahalla_palace` | Chowmahalla Palace (closed for restoration) | 8686 | 8646 | 150 | 170 | 30 | n | 17.35929, 78.47208 | medium | gated |
| church | `church_1` | Methodist Church, Marredpally | 11461 | 1474 | 40 | 56 | 40 | e | 17.44700, 78.50720 | low |  |
| church | `church_2` | CSI Church, Chikkadpally | 10315 | 4499 | 34 | 40 | 36 | n | 17.40447, 78.48958 | low | on ln_o760605970 |
| church | `church_st_josephs` | St. Joseph's Cathedral | 9088 | 5156 | 50 | 70 | 44 | e | 17.39556, 78.47744 | high |  |
| church | `church_st_marys` | St. Mary's Church | 11124 | 1752 | 56 | 56 | 46 | s | 17.44210, 78.50220 | medium |  |
| church | `church_wesley` | Wesley Church | 10930 | 1958 | 48 | 60 | 40 | w | 17.43930, 78.49970 | low |  |
| church | `holy_trinity_church_bolarum` | Holy Trinity Church, Bolarum | 11479 | 321 | 44 | 60 | 42 | n | 17.51669, 78.52361 | medium |  |
| church | `st_georges_church_abids` | St. George's Church | 9366 | 5617 | 44 | 56 | 40 | n | 17.39050, 78.48000 | low |  |
| church | `st_johns_church_secunderabad` | St. John's Church | 11827 | 2360 | 52 | 44 | 42 | e | 17.43483, 78.51019 | low | on tarnaka_sec_rd |
| clock_tower | `mahboob_chowk_clock_tower` | Mahboob Chowk Clock Tower | 8506 | 8241 | 16 | 16 | 52 |  | 17.36179, 78.47095 | high | variant mahboob_chowk |
| clock_tower | `secunderabad_clock_tower` | Secunderabad Clock Tower | 10817 | 1833 | 18 | 18 | 72 |  | 17.44080, 78.49850 | high |  |
| cyber_towers | `cyber_towers` | Cyber Towers | 2602 | 1680 | 96 | 96 | 90 | s |  | high | opened Nov 1998; layout cyber_towers |
| dargah | `dargah_yousufain` | Dargah Yousufain | 8050 | 5639 | 40 | 40 | 30 | n | 17.39050, 78.46550 | low | on mallepally_rd |
| dargah | `hussain_shah_wali_dargah` | Hussain Shah Wali Dargah & Shaikpet Sarai | 3290 | 4729 | 40 | 40 | 30 | s | 17.40500, 78.39300 | low |  |
| dargah | `moula_ali_dargah` | Moula Ali Dargah | 14874 | 596 | 44 | 44 | 40 | s | 17.46500, 78.55900 | low |  |
| falaknuma | `falaknuma_palace` | Falaknuma Palace (closed) | 8398 | 10267 | 170 | 110 | 36 | e | 17.33050, 78.46750 | high | gated |
| fort_gate | `banjara_darwaza` | Banjara Darwaza | 3748 | 6057 | 60 | 22 | 40 | n |  | low | walk-through; solids:2 |
| fort_gate | `golconda_fateh_darwaza` | Fateh Darwaza | 4122 | 6544 | 22 | 60 | 44 | e |  | low | walk-through; solids:2 |
| fort_wall | `golconda_wall_e1` | Golconda fort wall | 4140 | 6126 | 24 | 12 | 28 |  |  | low |  |
| fort_wall | `golconda_wall_e2` | Golconda fort wall | 4164 | 6498 | 24 | 12 | 28 |  |  | low |  |
| fort_wall | `golconda_wall_n` | Golconda fort wall | 3810 | 6042 | 60 | 12 | 28 |  |  | low |  |
| fort_wall | `golconda_wall_s` | Golconda fort wall | 3732 | 6678 | 48 | 12 | 28 |  |  | low |  |
| fort_wall | `golconda_wall_w` | Golconda fort wall | 3384 | 6282 | 24 | 60 | 28 |  |  | low |  |
| golconda_bala_hissar | `golconda_bala_hissar` | Bala Hissar pavilion | 3717 | 6331 | 84 | 64 | 46 | s | 17.38306, 78.40111 | medium |  |
| gulzar_houz | `gulzar_houz` | Gulzar Houz fountain | 9052 | 8060 | 22 | 22 | 10 |  |  | high | layout gulzar_houz |
| gun_park | `gun_park` | Gun Park martyrs memorial | 8482 | 4685 | 14 | 14 | 26 |  | 17.40140, 78.47120 | low |  |
| gurudwara | `gurudwara_gowliguda` | Central Gurudwara Sahib, Gowliguda | 9515 | 6433 | 50 | 50 | 32 | n | 17.38150, 78.48100 | low |  |
| high_court | `high_court` | High Court | 8612 | 7428 | 168 | 62 | 36 | s | 17.36918, 78.47204 | high |  |
| jubilee_hall | `jubilee_hall` | Jubilee Hall | 8190 | 4864 | 48 | 34 | 22 | e | 17.39950, 78.46800 | low |  |
| kakatiya_arch | `kakatiya_arch_n` | Kakatiya arch (north) | 9919 | 3010 | 20 | 10 | 30 |  |  | low |  |
| kakatiya_arch | `kakatiya_arch_s` | Kakatiya arch (south) | 9047 | 4108 | 20 | 10 | 30 |  |  | low |  |
| kaman | `kaman_charminar` | Charminar Kaman | 9052 | 8132 | 72 | 12 | 52 |  |  | high | walk-through; solids:2; layout gulzar_houz |
| kaman | `kaman_kali` | Kali Kaman | 8978 | 8060 | 12 | 72 | 52 |  |  | high | walk-through; solids:2; layout gulzar_houz |
| kaman | `kaman_machli` | Machli Kaman | 9052 | 7988 | 72 | 12 | 52 |  |  | high | walk-through; solids:2; layout gulzar_houz |
| kaman | `kaman_sher_e_batil` | Sher-e-Batil ki Kaman | 9126 | 8060 | 12 | 72 | 52 |  |  | high | walk-through; solids:2; layout gulzar_houz |
| khairatabad_ganesh | `khairatabad_ganesh` | Khairatabad Ganesh pandal | 7872 | 4020 | 46 | 36 | 50 | e | 17.41071, 78.46373 | medium | seasonal ganesh |
| madina_building | `madina_building` | Madina Building | 8926 | 7616 | 80 | 44 | 28 | w | 17.36720, 78.47440 | low |  |
| mahankali_temple | `akkanna_madanna_temple` | Akkanna Madanna Mahankali Temple | 9239 | 8898 | 30 | 30 | 30 | s | 17.35450, 78.47650 | low | on ln_shah_ali_banda_e |
| mahankali_temple | `balkampet_yellamma_temple` | Balkampet Yellamma Temple | 6999 | 1608 | 34 | 34 | 30 | e | 17.44750, 78.44920 | medium | on ln_o27908589 |
| mahankali_temple | `golconda_jagadamba_temple` | Jagadamba Temple, Golconda | 3748 | 6246 | 30 | 30 | 26 | s | 17.38370, 78.40130 | low |  |
| mahankali_temple | `lal_darwaza_temple` | Lal Darwaza Mahankali Temple | 9374 | 9176 | 40 | 40 | 34 | n | 17.35050, 78.47900 | low |  |
| mahankali_temple | `ujjaini_mahankali_temple` | Ujjaini Mahankali Temple | 10176 | 2133 | 40 | 40 | 34 | e | 17.43670, 78.49110 | medium |  |
| mecca_masjid | `mecca_masjid` | Mecca Masjid | 8839 | 8398 | 90 | 132 | 50 | e |  | high | layout mecca_masjid |
| memorial | `bapu_ghat` | Bapu Ghat (Gandhi memorial) | 4496 | 7125 | 50 | 40 | 20 | n | 17.37200, 78.41400 | medium |  |
| mosque | `jama_masjid_charminar` | Jama Masjid (Charminar) | 9108 | 8173 | 30 | 30 | 34 | s | 17.36220, 78.47500 | medium |  |
| mosque | `khairatabad_mosque` | Khairatabad Mosque | 7828 | 4185 | 36 | 36 | 38 | e | 17.40858, 78.46328 | medium |  |
| mosque | `mosque_1` | Mallepally Masjid | 7669 | 5592 | 36 | 36 | 36 | n | 17.39175, 78.46158 | low | on ln_o28110560 |
| mosque | `mosque_2` | Tolichowki Masjid | 5253 | 5365 | 36 | 36 | 36 | n | 17.39534, 78.42794 | low | on old_mumbai_rd |
| mosque | `mosque_3` | Musheerabad Jama Masjid | 11171 | 3707 | 36 | 36 | 36 | n | 17.41600, 78.50300 | low | on ln_o213788194 |
| mosque | `mosque_4` | Malakpet Masjid | 11006 | 7850 | 36 | 36 | 36 | e | 17.36517, 78.49792 | low | on ln_o274242298 |
| mosque | `mosque_5` | Saidabad Masjid | 11881 | 8402 | 36 | 36 | 36 | e | 17.35620, 78.50980 | low | on ln_saidabad_v1 |
| mosque | `mosque_6` | Shah Ali Banda Masjid | 8630 | 9157 | 36 | 36 | 36 | s | 17.35050, 78.47180 | low | on ln_o1189606534 |
| mosque | `mosque_7` | Falaknuma Masjid | 8986 | 10027 | 36 | 36 | 36 | s | 17.33499, 78.47614 | low | on ln_o355688356 |
| mosque | `mosque_8` | Begum Bazaar Masjid | 8301 | 6778 | 34 | 34 | 34 | e | 17.37519, 78.47048 | low | on begum_bazaar_rd |
| museum | `state_museum` | State Archaeology Museum | 8294 | 4882 | 58 | 40 | 24 | n | 17.39925, 78.47032 | medium | variant state_museum |
| nizam_college | `nizam_college` | Nizam College | 8938 | 4839 | 90 | 58 | 30 | w | 17.39950, 78.47600 | medium |  |
| ntr_memorial | `ntr_memorial` | NTR Ghat | 8396 | 3927 | 40 | 28 | 18 | s | 17.41170, 78.46990 | low |  |
| osmania_hospital | `osmania_hospital` | Osmania General Hospital | 8761 | 7089 | 194 | 76 | 34 | s | 17.37290, 78.47350 | medium |  |
| ou_arts_college | `osmania_university` | Osmania University Arts College | 12840 | 3589 | 200 | 70 | 40 | s | 17.41897, 78.52660 | medium |  |
| paigah_tombs | `paigah_tombs` | Paigah Tombs | 11314 | 9357 | 90 | 60 | 22 | s | 17.34390, 78.50410 | high |  |
| palace | `chiran_palace` | Chiran Palace | 4862 | 3586 | 60 | 40 | 22 | n | 17.42000, 78.41850 | low |  |
| palace | `errum_manzil` | Errum Manzil (gate) | 7266 | 3410 | 70 | 48 | 30 | e | 17.41944, 78.45500 | medium | gated |
| palace | `hill_fort_palace` | Hill Fort Palace (locked) | 8588 | 4505 | 60 | 44 | 30 | s | 17.40400, 78.47220 | low | gated |
| palace | `king_kothi` | King Kothi Palace (gated) | 9852 | 5488 | 80 | 50 | 26 | n | 17.39250, 78.48450 | low | gated |
| palace | `rashtrapati_nilayam` | Rashtrapati Nilayam (gated) | 11193 | 253 | 180 | 96 | 26 | s | 17.51100, 78.51000 | low | gated |
| pathergatti_arcade | `pathergatti_arcade_w` | Pathergatti arcades | 8975 | 7833 | 44 | 32 | 26 | e | 17.36520, 78.47456 | medium |  |
| puranapul_arches | `puranapul_arches` | Purana Pul arches | 7317 | 7588 | 44 | 150 | 6 |  |  | medium | walk-through |
| purani_haveli | `purani_haveli` | Purani Haveli (Nizam's Museum) | 9844 | 7871 | 128 | 66 | 26 | w | 17.36551, 78.48268 | high |  |
| qutb_tomb | `qutb_tomb_1` | Qutb Shahi tomb | 3186 | 5380 | 56 | 56 | 50 |  |  | high | layout qutb_shahi_tombs |
| qutb_tomb | `qutb_tomb_2` | Qutb Shahi tomb | 3286 | 5372 | 62 | 62 | 58 |  |  | high | layout qutb_shahi_tombs |
| qutb_tomb | `qutb_tomb_3` | Qutb Shahi tomb | 3386 | 5400 | 50 | 50 | 44 |  |  | high | layout qutb_shahi_tombs |
| qutb_tomb | `qutb_tomb_4` | Qutb Shahi tomb | 3176 | 5500 | 46 | 46 | 40 |  |  | high | layout qutb_shahi_tombs |
| qutb_tomb | `qutb_tomb_5` | Qutb Shahi tomb | 3276 | 5510 | 70 | 70 | 64 |  |  | high | layout qutb_shahi_tombs |
| qutb_tomb | `qutb_tomb_6` | Qutb Shahi tomb | 3386 | 5540 | 44 | 44 | 38 |  |  | high | layout qutb_shahi_tombs |
| raj_bhavan | `raj_bhavan` | Raj Bhavan | 7644 | 3414 | 80 | 54 | 30 | e | 17.41890, 78.46020 | medium |  |
| sai_temple | `dilsukhnagar_sai_temple` | Sai Baba Temple, Dilsukhnagar | 12955 | 7512 | 70 | 48 | 34 | n | 17.36786, 78.52728 | high |  |
| salar_jung_museum | `salar_jung_museum` | Salar Jung Museum | 9548 | 7308 | 150 | 76 | 30 | s | 17.37140, 78.48010 | high |  |
| secretariat | `secretariat` | Secretariat | 8402 | 4059 | 118 | 58 | 34 | n | 17.41000, 78.47000 | high |  |
| spanish_mosque | `spanish_mosque` | Spanish Mosque | 8758 | 1735 | 40 | 40 | 44 | s | 17.44381, 78.47262 | medium |  |
| state_central_library | `state_central_library` | State Central Library | 9310 | 6990 | 100 | 62 | 30 | s | 17.37420, 78.47830 | high |  |
| statue | `gandhi_statue_assembly` | Seated Gandhi statue | 8372 | 4818 | 8 | 8 | 16 |  | 17.40020, 78.47010 | low | variant gandhi_seated |
| tank_bund_statue | `tank_bund_statue_1` | Tank Bund statue | 9052 | 3898 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_10` | Tank Bund statue | 9688 | 3189 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_11` | Tank Bund statue | 9744 | 3114 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_12` | Tank Bund statue | 9806 | 3036 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_2` | Tank Bund statue | 9121 | 3818 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_3` | Tank Bund statue | 9185 | 3737 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_4` | Tank Bund statue | 9249 | 3652 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_5` | Tank Bund statue | 9322 | 3571 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_6` | Tank Bund statue | 9395 | 3494 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_7` | Tank Bund statue | 9468 | 3418 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_8` | Tank Bund statue | 9541 | 3342 | 8 | 8 | 30 |  |  | low |  |
| tank_bund_statue | `tank_bund_statue_9` | Tank Bund statue | 9614 | 3265 | 8 | 8 | 30 |  |  | low |  |
| taramati_baradari | `taramati_baradari` | Taramati Baradari | 2415 | 6807 | 60 | 44 | 26 | s | 17.37608, 78.37812 | medium |  |
| temple | `ashtalakshmi_temple` | Ashtalakshmi Temple, Kothapet | 14244 | 7682 | 50 | 50 | 40 | w | 17.36469, 78.54790 | high |  |
| temple | `iskcon_abids` | ISKCON Temple, Abids | 8493 | 5544 | 40 | 34 | 32 | s | 17.39020, 78.47180 | low | on nampally_rd |
| temple | `karmanghat_hanuman_temple` | Karmanghat Hanuman Temple | 12731 | 9462 | 40 | 40 | 34 | s | 17.33972, 78.52472 | medium | on chandrayangutta_rd |
| temple | `katta_maisamma_temple` | Katta Maisamma Temple | 9290 | 3897 | 30 | 30 | 28 | w | 17.41200, 78.47950 | low | on lower_tank_bund |
| temple | `peddamma_temple` | Peddamma Temple | 4074 | 2898 | 40 | 36 | 32 | n | 17.43065, 78.40499 | medium |  |
| temple | `secunderabad_ganesh_temple` | Sri Ganesh Temple (Secunderabad station) | 10954 | 2234 | 30 | 30 | 30 | e | 17.43600, 78.49980 | low | on ln_o215582970 |
| temple | `temple_1` | Sri Venkateswara Temple | 10074 | 4860 | 30 | 30 | 30 | w |  | low | layout lakshmi_nagar_colony |
| temple | `temple_2` | Hanuman Temple | 10011 | 4448 | 30 | 28 | 28 | n | 17.40425, 78.48703 | low |  |
| temple | `temple_3` | Shankar Mutt | 11646 | 4904 | 40 | 34 | 30 | s | 17.40050, 78.50600 | low |  |
| temple | `temple_4` | Pochamma Temple | 6197 | 1327 | 30 | 30 | 28 | w | 17.45243, 78.43625 | low |  |
| temple | `temple_5` | Sri Rama Temple, Tarnaka | 13455 | 3117 | 32 | 30 | 28 | w | 17.42583, 78.53535 | low |  |
| temple | `temple_6` | Ayyappa Temple | 6625 | 5219 | 34 | 30 | 28 | w | 17.39620, 78.44780 | low |  |

### Landmarks drawn by src/places_art.js (313)

x, y = centre; w = east-west, d = north-south, h = suggested art height (1 storey = 10 u). lat, lon = the real position used; conf = its confidence (design/geo/places.json has the sources).

| draw | id | name | x | y | w | d | h | face | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aeroplane | `aeroplane_1` | Parked plane | 8514 | 1330 | 46 | 40 | 14 | e |  | medium | layout begumpet_airport |
| airport_terminal | `begumpet_airport` | Begumpet Airport | 8664 | 1388 | 120 | 36 | 22 | s |  | medium | layout begumpet_airport |
| ashram | `ramakrishna_math` | Ramakrishna Math, Domalguda | 9556 | 3828 | 70 | 50 | 26 | e | 17.41180, 78.48200 | low |  |
| auditorium | `ravindra_bharathi` | Ravindra Bharathi | 8101 | 4581 | 80 | 52 | 30 | n | 17.40330, 78.46720 | medium |  |
| bakery | `bakery_2` | New Deccan Bakery | 6864 | 2474 | 28 | 22 | 24 | s | 17.43387, 78.44843 | low | sign "DECCAN BAKERY"; on ln_o354040845 |
| bakery | `bakery_3` | Golden Bakery | 11069 | 3553 | 22 | 28 | 24 | w | 17.41759, 78.49995 | low | sign "GOLDEN BAKERY"; on musheerabad_rd |
| bakery | `bakery_4` | Malakpet Bakery | 10808 | 7330 | 28 | 22 | 24 | n | 17.37157, 78.49469 | low | sign "BAKERY"; on ln_o28093134 |
| bakery | `karachi_bakery` | Karachi Bakery | 8658 | 6112 | 36 | 24 | 22 | e | 17.38470, 78.47320 | medium | sign "KARACHI BAKERY" |
| bakery | `subhan_bakery` | Subhan Bakery | 8289 | 5498 | 28 | 22 | 24 | s | 17.39150, 78.46900 | low | sign "SUBHAN BAKERY"; on nampally_rd |
| bal_bhavan | `jawahar_bal_bhavan` | Jawahar Bal Bhavan | 8340 | 5052 | 38 | 50 | 20 | e | 17.39700, 78.46980 | low |  |
| banana_cart | `banana_cart_1` | Banana cart | 11013 | 5776 | 16 | 9 | 12 | s | 17.39053, 78.49928 | low | on kachiguda_station_rd |
| banana_cart | `banana_cart_10` | Banana cart | 10596 | 2133 | 16 | 9 | 12 | n | 17.43720, 78.49600 | low | on ln_o281988578 |
| banana_cart | `banana_cart_2` | Banana cart | 9939 | 6468 | 16 | 9 | 12 | s | 17.38174, 78.48470 | low | on jambagh_rd |
| banana_cart | `banana_cart_3` | Banana cart | 8945 | 6281 | 16 | 9 | 12 | n | 17.38339, 78.47443 | low | on jambagh_rd |
| banana_cart | `banana_cart_4` | Banana cart | 6161 | 5489 | 16 | 9 | 12 | s | 17.39470, 78.44050 | low | on ln_mehdipatnam_h1 |
| banana_cart | `banana_cart_5` | Banana cart | 7114 | 2319 | 16 | 9 | 12 | s | 17.43531, 78.45135 | low | on begumpet_ameerpet_rd |
| banana_cart | `banana_cart_6` | Banana cart | 6039 | 1297 | 9 | 16 | 12 | e | 17.45397, 78.43371 | low | on mumbai_hwy |
| banana_cart | `banana_cart_7` | Banana cart | 10813 | 1870 | 9 | 16 | 12 | w | 17.43980, 78.49920 | low | on station_rd |
| banana_cart | `banana_cart_8` | Banana cart (outside the Sai Baba temple lane) | 13047 | 7521 | 9 | 16 | 12 | w | 17.36750, 78.52685 | low | on ln_sai_temple |
| banana_cart | `banana_cart_9` | Banana cart | 9593 | 7532 | 16 | 9 | 12 | s | 17.36865, 78.48021 | low | on ln_o27955572 |
| bangle_shop | `bangle_shop_1` | Bangle shop | 8902 | 8249 | 22 | 16 | 20 | n | 17.36186, 78.47410 | medium | sign "LAAD BANGLES" |
| bangle_shop | `bangle_shop_2` | Bangle shop | 8903 | 8227 | 22 | 16 | 20 | n | 17.36186, 78.47382 | medium | sign "CHUDI MAHAL" |
| bangle_shop | `bangle_shop_3` | Bangle shop | 8871 | 8217 | 22 | 16 | 20 | n | 17.36186, 78.47354 | medium | sign "NOOR BANGLES" |
| bangle_shop | `bangle_shop_4` | Bangle shop | 8826 | 8264 | 22 | 16 | 20 | n | 17.36186, 78.47326 | medium | sign "RANI CHUDI" |
| barber | `barber_1` | Lucky Hair Cutting Saloon | 9761 | 5056 | 22 | 18 | 22 | s | 17.39751, 78.48415 | low | sign "LUCKY SALOON"; on ln_hyderguda_h1 |
| barber | `barber_2` | Sundar Hair Saloon | 11514 | 5495 | 18 | 22 | 22 | e | 17.39323, 78.50418 | low | sign "SUNDAR SALOON"; on ln_o214568048 |
| barber | `barber_3` | Raja Hair Cutting | 7452 | 4989 | 18 | 22 | 22 | e | 17.39857, 78.45949 | low | sign "RAJA HAIR CUTTING"; on ln_o58830791 |
| barber | `barber_4` | Famous Saloon | 10586 | 3398 | 18 | 22 | 22 | w | 17.42003, 78.49393 | low | sign "FAMOUS SALOON"; on ln_o126811767 |
| barber | `barber_5` | Hero Hair Cutting | 13113 | 7504 | 22 | 18 | 22 | n | 17.36735, 78.52900 | low | sign "HERO HAIR CUTTING"; on malakpet_rd |
| barber | `barber_6` | Taj Hair Saloon | 9115 | 9151 | 22 | 18 | 22 | s | 17.35113, 78.47618 | low | sign "TAJ SALOON"; on ln_o420464413 |
| barber | `barber_7` | New Style Hair Dressers | 10316 | 4879 | 18 | 22 | 22 | w |  | low | sign "NEW STYLE HAIR"; layout lakshmi_nagar_colony |
| boat_jetty | `lumbini_jetty` | Lumbini boat jetty | 8707 | 3990 | 14 | 26 | 4 |  |  | medium | walk-through |
| book_stall | `koti_book_bazaar` | Koti pavement book bazaar | 9790 | 6088 | 24 | 10 | 12 | s | 17.38545, 78.48320 | low | sign "OLD BOOKS"; on bank_st |
| bus_stop | `bus_stop_1` | Koti bus stop | 9748 | 6183 | 32 | 10 | 16 | n | 17.38513, 78.48286 | low | sign "KOTI"; on bank_st |
| bus_stop | `bus_stop_10` | Himayatnagar bus stop | 9767 | 4605 | 32 | 10 | 16 | s | 17.40246, 78.48440 | low | sign "HIMAYATNAGAR"; on himayatnagar_rd |
| bus_stop | `bus_stop_11` | Dilsukhnagar bus stop | 13175 | 7490 | 32 | 10 | 16 | n | 17.36819, 78.52996 | low | sign "DILSUKHNAGAR"; on malakpet_rd |
| bus_stop | `bus_stop_12` | Malakpet bus stop | 11570 | 7209 | 32 | 10 | 16 | n | 17.37314, 78.50365 | low | sign "MALAKPET"; on malakpet_rd |
| bus_stop | `bus_stop_13` | Charminar bus stop | 9499 | 8385 | 32 | 10 | 16 | n | 17.36067, 78.47964 | low | sign "CHARMINAR"; on sardar_mahal_rd |
| bus_stop | `bus_stop_14` | Tank Bund bus stop | 9579 | 3470 | 10 | 32 | 16 | w | 17.41776, 78.48202 | low | sign "TANK BUND"; on lower_tank_bund |
| bus_stop | `bus_stop_15` | Tolichowki bus stop | 4674 | 5106 | 32 | 10 | 16 | s | 17.39851, 78.41636 | low | sign "TOLICHOWKI"; on old_mumbai_rd |
| bus_stop | `bus_stop_16` | Tarnaka bus stop | 13422 | 3227 | 32 | 10 | 16 | n | 17.42484, 78.53497 | low | sign "TARNAKA"; on uppal_rd |
| bus_stop | `bus_stop_17` | Afzalgunj bus stop | 8968 | 7009 | 32 | 10 | 16 | n | 17.37360, 78.47520 | low | sign "AFZALGUNJ"; on afzalgunj_rd |
| bus_stop | `bus_stop_18` | Khairatabad bus stop | 7709 | 3949 | 10 | 32 | 16 | w | 17.41174, 78.46129 | low | sign "KHAIRATABAD"; on khairatabad_rd |
| bus_stop | `bus_stop_19` | Chikkadpally bus stop | 10774 | 4846 | 10 | 32 | 16 | e | 17.40041, 78.49477 | low | sign "CHIKKADPALLY"; on chikkadpally_rd |
| bus_stop | `bus_stop_2` | Abids bus stop | 9040 | 6070 | 10 | 32 | 16 | w | 17.38512, 78.47651 | low | sign "ABIDS"; on abids_rd |
| bus_stop | `bus_stop_20` | HITEC City bus stop | 2703 | 1676 | 10 | 32 | 16 | e | 17.44931, 78.38114 | low | sign "HITEC CITY"; on hitec_rd |
| bus_stop | `bus_stop_21` | Uppal bus stop | 14987 | 5161 | 10 | 32 | 16 | w | 17.39843, 78.56087 | low | sign "UPPAL"; on nagole_n_rd |
| bus_stop | `bus_stop_22` | LB Nagar bus stop | 14339 | 8806 | 10 | 32 | 16 | w | 17.34900, 78.55000 | low | sign "LB NAGAR"; on malakpet_rd |
| bus_stop | `bus_stop_3` | Nampally bus stop | 8501 | 5679 | 32 | 10 | 16 | n | 17.38964, 78.47182 | low | sign "NAMPALLY"; on nampally_rd |
| bus_stop | `bus_stop_4` | Lakdikapul bus stop | 7748 | 4556 | 10 | 32 | 16 | w | 17.40382, 78.46422 | low | sign "LAKDIKAPUL"; on mehdipatnam_rd |
| bus_stop | `bus_stop_5` | Mehdipatnam bus stop | 6064 | 5280 | 32 | 10 | 16 | s | 17.39580, 78.43940 | low | sign "MEHDIPATNAM"; on mehdipatnam_rd |
| bus_stop | `bus_stop_6` | Ameerpet bus stop | 6743 | 2405 | 10 | 32 | 16 | w | 17.43504, 78.44608 | low | sign "AMEERPET"; on mumbai_hwy |
| bus_stop | `bus_stop_7` | Paradise bus stop | 9813 | 1621 | 32 | 10 | 16 | s | 17.44316, 78.48624 | low | sign "PARADISE"; on sp_rd |
| bus_stop | `bus_stop_8` | Secunderabad bus stop | 11108 | 2283 | 32 | 10 | 16 | s | 17.43497, 78.50151 | low | sign "SECUNDERABAD"; on ln_o215582970 |
| bus_stop | `bus_stop_9` | RTC X Roads bus stop | 10972 | 4472 | 32 | 10 | 16 | s | 17.40466, 78.49741 | low | sign "RTC X ROADS" |
| bus_terminus | `koti_bus_stand` | Koti Bus Stand | 9826 | 6125 | 92 | 62 | 18 | w | 17.38510, 78.48360 | low | walk-through; solids:1 |
| bus_terminus | `mehdipatnam_bus_terminus` | Mehdipatnam Bus Depot | 6016 | 5312 | 130 | 46 | 16 | s | 17.39530, 78.43880 | low | walk-through; solids:1 |
| bus_terminus | `rathifile_bus_station` | Rathifile City Bus Station | 11160 | 2326 | 90 | 66 | 16 | s | 17.43497, 78.50207 | low | walk-through; solids:1 |
| campus_gate | `university_of_hyderabad` | University of Hyderabad (gate) | 68 | 1371 | 60 | 30 | 20 | e | 17.45650, 78.33450 | low |  |
| cbs_hangar | `cbs_hangar` | Gowliguda City Bus Station (the old hangar) | 9653 | 6538 | 110 | 70 | 26 | e | 17.38040, 78.48180 | low | walk-through; solids:2 |
| chai_bandi | `chai_bandi_1` | Raju's chai bandi | 10192 | 5061 | 9 | 14 | 12 | w |  | low | layout lakshmi_nagar_colony |
| chai_bandi | `chai_bandi_2` | Chai bandi | 6066 | 1336 | 14 | 9 | 12 | n | 17.45496, 78.43691 | low | on ln_erragadda_h1 |
| chai_bandi | `chai_bandi_3` | OU canteen chai | 12935 | 3633 | 9 | 14 | 12 | e | 17.41830, 78.52620 | low | on ou_rd |
| chai_bandi | `chai_bandi_4` | Chai bandi | 8930 | 8454 | 9 | 14 | 12 | e | 17.36008, 78.47400 | low | on shah_ali_banda_rd |
| chai_bandi | `chai_bandi_5` | Chai bandi | 7615 | 8539 | 14 | 9 | 12 | n | 17.35762, 78.46128 | low | on ln_o281272687 |
| chai_bandi | `chai_bandi_6` | Bhutta & chai cart | 9646 | 3362 | 9 | 14 | 12 | w | 17.42086, 78.48420 | low | on tank_bund |
| chai_bandi | `chai_bandi_7` | Construction-site chai | 2755 | 1737 | 9 | 14 | 12 | e | 17.44660, 78.37950 | low | on hitec_rd |
| chai_bandi | `chai_bandi_8` | Chai bandi | 9303 | 2200 | 14 | 9 | 12 | s | 17.43380, 78.48100 | low | on necklace_rd |
| cinema | `anand_theatre` | Anand Theatre | 11701 | 2454 | 76 | 54 | 30 | s | 17.43434, 78.50944 | low | films: JAI HYDERABAD |
| cinema | `devi_theatre` | Devi 70mm | 10964 | 4533 | 66 | 100 | 34 | w | 17.40421, 78.49713 | low | variant devi; films: TOOFAN EXPRESS, JAI HYDERABAD |
| cinema | `liberty_theatre` | Liberty Theatre | 9100 | 4460 | 66 | 64 | 30 | w | 17.40440, 78.47760 | low | films: MEGHA GARJANA |
| cinema | `odeon_theatre` | Odeon | 10682 | 4397 | 64 | 88 | 32 | e | 17.40556, 78.49459 | low | variant odeon; films: PREMA PANDAGA |
| cinema | `ramakrishna_theatre` | Ramakrishna 70mm | 9310 | 5900 | 52 | 64 | 32 | s | 17.38750, 78.47900 | low | films: RANGULA PATANG, TOOFAN EXPRESS |
| cinema | `sandhya_theatre` | Sandhya 70mm & 35mm | 10764 | 4421 | 96 | 68 | 34 | w | 17.40534, 78.49633 | low | variant sandhya; films: CHARMINAR CHINNODU, RANGULA PATANG |
| cinema | `sangeet_theatre` | Sangeet 70mm | 11780 | 2274 | 50 | 66 | 26 | e | 17.43411, 78.50995 | low | sign "SANGEET 70MM"; films: GOLCONDA DIAMOND; on tarnaka_sec_rd |
| cinema | `shanti_theatre` | Shanti Theatre | 10287 | 5414 | 76 | 54 | 30 | s | 17.39380, 78.48950 | low | films: PREMA PANDAGA |
| cinema | `sudarshan_theatre` | Sudarshan 35mm | 10735 | 4630 | 84 | 66 | 30 | e | 17.40448, 78.49534 | low | variant sudarshan; films: GULLY SIMHAM |
| clothes_store | `chermas_abids` | Cherma's | 9100 | 5762 | 24 | 34 | 26 | w | 17.38954, 78.47659 | low | sign "CHERMAS"; on bank_st |
| club_house | `secunderabad_club` | Secunderabad Club (members only) | 10855 | 1195 | 110 | 60 | 26 | w | 17.45080, 78.49950 | low | gated |
| coaching_centre | `coaching_1` | Computer coaching centre | 6732 | 2315 | 60 | 34 | 30 | s | 17.43658, 78.44551 | low | sign "C  C++  JAVA  ORACLE" |
| coaching_centre | `coaching_2` | Computer coaching centre | 6691 | 2244 | 60 | 34 | 30 | s | 17.43658, 78.44504 | low | sign "LEARN JAVA - Y2K READY" |
| coconut_cart | `coconut_cart_1` | Tender coconut cart | 8003 | 3140 | 9 | 16 | 12 | e | 17.42220, 78.46410 | low | on necklace_rd |
| coconut_cart | `coconut_cart_2` | Tender coconut cart | 8167 | 2381 | 9 | 16 | 12 | w | 17.43300, 78.46580 | low | on necklace_rd |
| coconut_cart | `coconut_cart_3` | Tender coconut cart | 8823 | 2218 | 16 | 9 | 12 | n | 17.43500, 78.47300 | low | on necklace_rd |
| coconut_cart | `coconut_cart_4` | Tender coconut cart | 9619 | 3387 | 9 | 16 | 12 | w | 17.41862, 78.48260 | low | on tank_bund |
| coconut_cart | `coconut_cart_5` | Tender coconut cart | 5215 | 3315 | 16 | 9 | 12 | n | 17.42320, 78.42380 | low | on banjara_rd2 |
| coconut_cart | `coconut_cart_6` | Tender coconut cart | 13408 | 7955 | 9 | 16 | 12 | w | 17.36056, 78.53687 | low | on kothapet_rd |
| coconut_cart | `coconut_cart_7` | Tender coconut cart | 9835 | 3185 | 9 | 16 | 12 | w | 17.42184, 78.48490 | low | on lower_tank_bund_2 |
| college | `city_college` | Government City College | 8326 | 7474 | 110 | 60 | 32 | n | 17.36859, 78.46961 | medium |  |
| college | `jntu_kukatpally` | JNTU, Kukatpally | 5416 | 206 | 56 | 120 | 30 | e | 17.49665, 78.39252 | medium |  |
| control_tower | `atc_tower` | Begumpet control tower | 8824 | 1382 | 18 | 18 | 52 |  |  | medium | layout begumpet_airport |
| cycle_rent | `cycle_rent_1` | Lakshmi Cycle Stores (on hire) | 9725 | 4306 | 20 | 28 | 20 | e | 17.40631, 78.48407 | low | sign "CYCLES ON HIRE"; on ln_domalguda_v1 |
| cycle_rent | `cycle_rent_2` | Mohan Cycle Taxi | 9631 | 5398 | 28 | 20 | 20 | n | 17.39249, 78.48232 | low | sign "MOHAN CYCLE TAXI"; on king_koti_rd |
| cycle_rent | `cycle_rent_3` | Raju Cycle Taxi | 10742 | 3992 | 28 | 20 | 20 | n | 17.41126, 78.49525 | low | sign "RAJU CYCLE TAXI"; on ln_musheerabad_h1 |
| cycle_rent | `cycle_rent_4` | Peter Cycle Works (hire) | 11544 | 1331 | 20 | 28 | 20 | e | 17.44927, 78.50894 | low | sign "CYCLES ON HIRE"; on ln_marredpally_h0 |
| cycle_rent | `cycle_rent_5` | Chinna Cycle Taxi | 10139 | 4865 | 20 | 28 | 20 | e |  | low | sign "CYCLE TAXI"; layout lakshmi_nagar_colony |
| department_store | `shoppers_stop_begumpet` | Trendz Department Store, Begumpet | 8119 | 1739 | 80 | 46 | 30 | n | 17.44400, 78.46400 | low | sign "TRENDZ DEPARTMENT STORE" |
| dhobi_ghat | `dhobi_ghat_1` | Dhobi ghat (washing lines) | 7827 | 7426 | 80 | 26 | 6 |  | 17.36930, 78.46450 | low | walk-through |
| dosa_bandi | `dosa_bandi_1` | Dosa bandi | 10122 | 4381 | 9 | 16 | 12 | w | 17.40505, 78.48795 | low | on ln_o419619108 |
| dosa_bandi | `dosa_bandi_2` | Dosa bandi | 11802 | 8048 | 16 | 9 | 12 | n | 17.36173, 78.50907 | low | on ln_o312194162 |
| dosa_bandi | `dosa_bandi_3` | Dosa bandi | 12987 | 7731 | 9 | 16 | 12 | w | 17.36421, 78.52910 | low | on ln_sai_temple |
| dosa_bandi | `dosa_bandi_4` | Dosa bandi | 11679 | 8872 | 9 | 16 | 12 | w | 17.35128, 78.50924 | low | on saidabad_rd |
| dosa_bandi | `dosa_bandi_5` | Dosa bandi | 8180 | 3765 | 16 | 9 | 12 | n | 17.41220, 78.46700 | low | on secretariat_rd |
| dosa_bandi | `dosa_bandi_6` | Dosa bandi | 10035 | 2487 | 9 | 16 | 12 | w | 17.43220, 78.48920 | low | on mg_rd |
| dosa_bandi | `dosa_bandi_7` | Dosa bandi | 12042 | 5621 | 16 | 9 | 12 | s | 17.39210, 78.51155 | low | on amberpet_rd |
| exhibition_hall | `hitex` | HITEX Exhibition Centre (opens Jan 2003) | 2331 | 206 | 160 | 100 | 24 | s | 17.47170, 78.37500 | medium | construction site before 14 Jan 2003 |
| film_hoarding | `hoarding_rtc_1` | Film hoarding | 10794 | 4379 | 30 | 6 | 40 |  | 17.40547, 78.49534 | low | walk-through; solids:2 |
| film_hoarding | `hoarding_rtc_2` | Film hoarding | 10913 | 4498 | 30 | 6 | 40 |  | 17.40466, 78.49666 | low | walk-through; solids:2 |
| film_studio | `annapurna_studios` | Annapurna Studios | 5155 | 2942 | 120 | 70 | 30 | s | 17.42900, 78.42250 | low |  |
| film_studio | `ramanaidu_studios` | Ramanaidu Studios | 4076 | 4153 | 60 | 120 | 28 | n | 17.41350, 78.40600 | low |  |
| film_studio | `sarathi_studios` | Sarathi Studios | 6463 | 2527 | 120 | 50 | 28 | s | 17.43350, 78.44200 | low |  |
| flower_cart | `flower_cart_1` | Jasmine & marigold cart | 10057 | 4902 | 9 | 16 | 12 | w |  | low | layout lakshmi_nagar_colony |
| flower_cart | `flower_cart_10` | Flower cart (Lal Darwaza) | 9376 | 9110 | 9 | 16 | 12 | e | 17.35070, 78.47860 | low | on ln_o28472766 |
| flower_cart | `flower_cart_11` | Flower cart (Birla Mandir steps) | 8364 | 4342 | 16 | 9 | 12 | n | 17.40560, 78.47010 | low | on ln_o281547323 |
| flower_cart | `flower_cart_12` | Flower cart (Peddamma Temple) | 4168 | 2867 | 16 | 9 | 12 | n | 17.43047, 78.40513 | low | on jubilee_rd36 |
| flower_cart | `flower_cart_2` | Flower cart | 9928 | 4466 | 9 | 16 | 12 | w | 17.40411, 78.48636 | low | on ln_o58654296 |
| flower_cart | `flower_cart_3` | Flower cart | 12124 | 5363 | 9 | 16 | 12 | e | 17.39495, 78.51288 | low | on ln_o396689525 |
| flower_cart | `flower_cart_4` | Flower cart (Mahankali) | 10219 | 2153 | 16 | 9 | 12 | n | 17.43652, 78.49129 | low | on ln_o281545849 |
| flower_cart | `flower_cart_5` | Flower cart (Sai Baba temple lane) | 13035 | 7517 | 9 | 16 | 12 | w | 17.36809, 78.52685 | low | on ln_sai_temple |
| flower_cart | `flower_cart_6` | Flower cart (Sai Baba temple lane) | 12974 | 7546 | 9 | 16 | 12 | e | 17.36795, 78.52685 | low | on ln_sai_temple |
| flower_cart | `flower_cart_7` | Flower cart (Sai Baba temple lane) | 13033 | 7541 | 9 | 16 | 12 | w | 17.36782, 78.52685 | low | on ln_sai_temple |
| flower_cart | `flower_cart_8` | Flower cart (Sai Baba temple lane) | 12976 | 7568 | 9 | 16 | 12 | e | 17.36768, 78.52685 | low | on ln_sai_temple |
| flower_cart | `flower_cart_9` | Flower cart | 6600 | 5222 | 9 | 16 | 12 | w | 17.39610, 78.44820 | low | on ln_humayun_v1 |
| giant_wheel | `giant_wheel` | Numaish giant wheel | 8168 | 5799 | 34 | 14 | 70 | s |  | low | layout numaish |
| gokul_chat | `gokul_chat` | Gokul Chat | 9887 | 6101 | 34 | 24 | 26 | s | 17.38580, 78.48420 | low | sign "GOKUL CHAT"; on bank_st |
| gpo | `abids_gpo` | General Post Office, Abids | 8923 | 5846 | 60 | 50 | 30 | w | 17.38800, 78.47650 | medium |  |
| halt_station | `begumpet_station` | Begumpet station | 7695 | 2115 | 60 | 24 | 16 | n |  | high |  |
| halt_station | `james_street_station` | James Street station | 9854 | 2345 | 60 | 28 | 16 | s |  | high |  |
| halt_station | `khairatabad_station` | Khairatabad station | 7712 | 3787 | 26 | 50 | 16 | e |  | high |  |
| halt_station | `necklace_road_station` | Necklace Road station | 7841 | 3008 | 26 | 60 | 16 | e |  | high |  |
| halt_station | `sanjeevaiah_park_station` | Sanjeevaiah Park station | 9012 | 2141 | 60 | 26 | 16 | s |  | high |  |
| home_house | `friend_home` | Friend's house | 10336 | 4992 | 34 | 30 | 22 | w |  | low | variant friend; layout lakshmi_nagar_colony |
| home_house | `home` | Home (Lakshmi Nivas) | 10108 | 4985 | 40 | 34 | 22 | n |  | low | sign "LAKSHMI NIVAS"; layout lakshmi_nagar_colony |
| hospital | `apollo_hospital_jubilee_hills` | Apollo Hospital, Jubilee Hills | 4546 | 3960 | 90 | 60 | 34 | w | 17.41500, 78.41370 | medium |  |
| hospital | `nims_hospital` | NIMS Hospital | 7070 | 3262 | 100 | 66 | 30 | w | 17.42180, 78.45200 | high |  |
| hospital | `sarojini_devi_eye_hospital` | Sarojini Devi Eye Hospital | 6329 | 4995 | 90 | 44 | 26 | s | 17.39890, 78.44360 | medium | sign "SAROJINI DEVI EYE HOSPITAL" |
| idol_workshop | `idol_workshop_1` | Ganesh idol workshop | 7507 | 6961 | 30 | 40 | 22 | e | 17.37470, 78.46040 | low | seasonal ganesh |
| idol_workshop | `idol_workshop_2` | Ganesh idol workshop | 7545 | 6998 | 30 | 40 | 22 | e | 17.37410, 78.46120 | low | seasonal ganesh |
| internet_cafe | `internet_cafe_1` | Cyber Zone Browsing Centre | 9507 | 4764 | 32 | 22 | 24 | s | 17.40102, 78.48191 | low | sign "CYBER ZONE"; on ln_hyderguda_v1 |
| internet_cafe | `internet_cafe_2` | Netway Internet Browsing | 8898 | 6091 | 22 | 32 | 24 | e | 17.38431, 78.47516 | low | sign "NETWAY BROWSING"; on abids_rd |
| internet_cafe | `internet_cafe_3` | Info Highway Browsing Centre | 6783 | 2317 | 32 | 22 | 24 | n | 17.43586, 78.44608 | low | sign "INFO HIGHWAY"; on ln_ameerpet_h1 |
| internet_cafe | `internet_cafe_4` | Sify iWay-style Browsing Centre | 11501 | 2332 | 22 | 32 | 24 | w | 17.43556, 78.50765 | low | sign "BROWSING CENTRE"; on ln_o166508947 |
| internet_cafe | `internet_cafe_5` | Campus Net Cafe | 13271 | 3016 | 32 | 22 | 24 | s | 17.42692, 78.53205 | low | sign "CAMPUS NET CAFE"; on uppal_rd |
| internet_cafe | `internet_cafe_6` | Dial-Up Dreams Net Cafe | 12944 | 7663 | 22 | 32 | 24 | e | 17.36563, 78.52659 | low | sign "NET CAFE"; on ln_sai_temple |
| irani_cafe | `alpha_hotel` | Alpha Hotel | 10990 | 2314 | 30 | 44 | 26 | e | 17.43520, 78.50040 | medium | sign "ALPHA HOTEL"; on ln_o215582970 |
| irani_cafe | `blue_sea_cafe` | Blue Sea Tea & Snacks | 11224 | 2254 | 28 | 40 | 26 | e | 17.43680, 78.50400 | medium | sign "BLUE SEA"; on ln_o28129244 |
| irani_cafe | `cafe_bahar` | Cafe Bahar | 9102 | 4727 | 40 | 28 | 26 | s | 17.39983, 78.47788 | high | sign "CAFE BAHAR"; on raja_reddy_marg |
| irani_cafe | `garden_cafe` | Garden Cafe | 10815 | 1897 | 44 | 30 | 22 | s | 17.44044, 78.49794 | medium | sign "GARDEN CAFE" |
| irani_cafe | `grand_hotel` | Grand Hotel | 9050 | 5898 | 30 | 44 | 26 | w | 17.38791, 78.47622 | low | sign "GRAND HOTEL"; on abids_rd |
| irani_cafe | `irani_cafe_10` | Hotel Sohail | 5143 | 5224 | 44 | 30 | 26 | s | 17.39724, 78.42455 | low | sign "HOTEL SOHAIL"; on old_mumbai_rd |
| irani_cafe | `irani_cafe_11` | Cafe Firdaus | 6949 | 2353 | 44 | 30 | 26 | s | 17.43486, 78.44881 | low | sign "CAFE FIRDAUS"; on begumpet_ameerpet_rd |
| irani_cafe | `irani_cafe_12` | Cafe Bholakpur | 10866 | 3701 | 30 | 44 | 26 | e | 17.41641, 78.49713 | low | sign "CAFE BHOLAKPUR"; on musheerabad_rd |
| irani_cafe | `irani_cafe_13` | Hotel Daulat | 11372 | 7049 | 44 | 30 | 26 | s | 17.37349, 78.50402 | low | sign "HOTEL DAULAT"; on malakpet_rd |
| irani_cafe | `irani_cafe_14` | Cafe Golden Star | 13349 | 7375 | 44 | 30 | 26 | s | 17.36852, 78.53279 | low | sign "CAFE GOLDEN STAR"; on malakpet_rd |
| irani_cafe | `irani_cafe_15` | Cafe Gulzar | 8954 | 8097 | 44 | 30 | 26 | n | 17.36351, 78.47429 | low | sign "CAFE GULZAR"; on gulzar_houz_w |
| irani_cafe | `irani_cafe_16` | Cafe Sohrab | 6248 | 5124 | 30 | 44 | 26 | e | 17.39750, 78.44280 | low | sign "CAFE SOHRAB"; on mehdipatnam_rd |
| irani_cafe | `irani_cafe_19` | Café Noor-e-Iran | 8985 | 8004 | 30 | 32 | 24 | e | 17.36358, 78.47460 | low | variant noor_e_iran; sign "CAFE NOOR-E-IRAN"; invented |
| irani_cafe | `irani_cafe_7` | Café Gulistan | 9868 | 5138 | 30 | 44 | 26 | w | 17.39654, 78.48512 | low | sign "CAFE GULISTAN"; on ln_hyderguda_h1 |
| irani_cafe | `irani_cafe_8` | Cafe Shalimar | 10888 | 4662 | 40 | 30 | 26 | n | 17.40257, 78.49548 | low | sign "CAFE SHALIMAR" |
| irani_cafe | `irani_cafe_9` | Cafe Kohinoor | 10909 | 5535 | 44 | 30 | 26 | s | 17.39216, 78.49631 | low | sign "CAFE KOHINOOR"; on ln_barkatpura_h1 |
| irani_cafe | `niloufer_cafe` | Niloufer Cafe | 7830 | 4651 | 28 | 40 | 22 | w | 17.40250, 78.46360 | low | sign "NILOUFER CAFE" |
| irani_cafe | `nimrah_cafe` | Nimrah Cafe | 8981 | 8151 | 40 | 26 | 22 | w | 17.36199, 78.47448 | medium | sign "NIMRAH CAFE & BAKERY" |
| irani_cafe | `sarvi` | Sarvi | 6944 | 3962 | 30 | 44 | 26 | w | 17.41280, 78.45050 | low | sign "SARVI"; on banjara_rd1 |
| iyengar_bakery | `iyengar_bakery_1` | Sri Krishna Iyengar Bakery | 10989 | 5332 | 30 | 22 | 24 | n | 17.39479, 78.49556 | low | sign "IYENGAR BAKERY"; on narayanguda_rd |
| iyengar_bakery | `iyengar_bakery_2` | Sri Iyengar Bakery | 11358 | 1819 | 30 | 22 | 24 | s | 17.44150, 78.50650 | low | sign "SRI IYENGAR BAKERY"; on sd_rd |
| iyengar_bakery | `iyengar_bakery_3` | Sri Venkateswara Iyengar Bakery | 12709 | 7393 | 22 | 30 | 24 | e | 17.36701, 78.52144 | low | sign "IYENGAR BAKERY"; on ln_dilsukh_v1 |
| iyengar_bakery | `iyengar_bakery_4` | Bangalore Iyengar Bakery | 6963 | 2767 | 30 | 22 | 24 | n | 17.43016, 78.45013 | low | sign "IYENGAR BAKERY"; on ln_o313515077 |
| kirana | `kirana_1` | Sri Lakshmi Kirana & General Stores | 10227 | 4911 | 26 | 20 | 22 | s |  | low | sign "SRI LAKSHMI KIRANA"; layout lakshmi_nagar_colony |
| kirana | `kirana_10` | Raju Kirana | 6027 | 1273 | 26 | 20 | 22 | s | 17.45352, 78.43550 | low | sign "RAJU KIRANA"; on ln_erragadda_h1 |
| kirana | `kirana_11` | Prakash Nagar Stores | 8029 | 1745 | 26 | 20 | 22 | n | 17.44400, 78.46280 | low | sign "PRAKASH STORES"; on sp_rd |
| kirana | `kirana_12` | Ali Kirana & Provisions | 10669 | 3377 | 20 | 26 | 22 | e | 17.42050, 78.49560 | low | sign "ALI KIRANA"; on ln_o126811795 |
| kirana | `kirana_13` | Joseph General Stores | 11600 | 1396 | 26 | 20 | 22 | s | 17.44981, 78.50931 | low | sign "JOSEPH STORES"; on ln_marredpally_h1 |
| kirana | `kirana_14` | Railway Colony Stores | 12694 | 2711 | 26 | 20 | 22 | n | 17.43059, 78.52332 | low | sign "RAILWAY STORES"; on tarnaka_sec_rd |
| kirana | `kirana_15` | Laxmi Narasimha Kirana | 11007 | 7468 | 20 | 26 | 22 | w | 17.37020, 78.49640 | low | sign "LAXMI KIRANA"; on ln_o355709102 |
| kirana | `kirana_16` | Sri Venkateshwara Kirana | 13033 | 7587 | 20 | 26 | 22 | w | 17.36644, 78.52853 | low | sign "VENKATESHWARA KIRANA"; on ln_sai_temple |
| kirana | `kirana_17` | Saidabad Kirana | 11950 | 8267 | 20 | 26 | 22 | w | 17.35850, 78.51250 | low | sign "SAIDABAD KIRANA"; on ln_saidabad_v1 |
| kirana | `kirana_18` | Hyderabad Kirana | 8651 | 7600 | 20 | 26 | 22 | e | 17.36798, 78.47253 | low | sign "KIRANA"; on ln_ghansi_bazaar |
| kirana | `kirana_19` | Chandrayangutta Kirana | 9535 | 10423 | 26 | 20 | 22 | n | 17.32600, 78.48250 | low | sign "KIRANA"; on chandrayangutta_rd |
| kirana | `kirana_2` | Balaji General Stores | 9497 | 4825 | 26 | 20 | 22 | n | 17.39966, 78.48136 | low | sign "BALAJI STORES"; on ln_hyderguda_v1 |
| kirana | `kirana_20` | Kothapet Kirana | 14030 | 7767 | 20 | 26 | 22 | w | 17.36371, 78.54497 | low | sign "KOTHAPET KIRANA"; on malakpet_rd |
| kirana | `kirana_3` | Ganesh Provisions | 10138 | 4310 | 26 | 20 | 22 | s | 17.40602, 78.48830 | low | sign "GANESH PROVISIONS"; on ln_o775317662 |
| kirana | `kirana_4` | Durga Kirana | 11203 | 5019 | 26 | 20 | 22 | s | 17.39884, 78.49963 | low | sign "DURGA KIRANA"; on ln_o355706479 |
| kirana | `kirana_5` | Annapurna Kirana | 11640 | 5358 | 26 | 20 | 22 | s | 17.39470, 78.50482 | low | sign "ANNAPURNA KIRANA"; on narayanguda_rd |
| kirana | `kirana_6` | Sai Ram Kirana | 12191 | 5342 | 20 | 26 | 22 | w | 17.39542, 78.51383 | low | sign "SAI RAM KIRANA"; on ln_o396689525 |
| kirana | `kirana_7` | Hanuman Kirana | 7486 | 4836 | 20 | 26 | 22 | e | 17.40038, 78.45939 | low | sign "HANUMAN KIRANA"; on ln_o1292293845 |
| kirana | `kirana_8` | Noor Kirana & Provisions | 5088 | 5334 | 20 | 26 | 22 | w | 17.39643, 78.42314 | low | sign "NOOR KIRANA"; on ln_o207472302 |
| kirana | `kirana_9` | Mahalakshmi General Stores | 6539 | 2324 | 26 | 20 | 22 | n | 17.43748, 78.44259 | low | sign "MAHALAKSHMI STORES"; on ln_o310015313 |
| kite_stall | `kite_stall_1` | Kite stall | 9136 | 8012 | 12 | 20 | 14 | e | 17.36356, 78.47538 | low | sign "PATANG HOUSE"; on gulzar_houz_e |
| kite_stall | `kite_stall_2` | Kite stall | 9146 | 8039 | 20 | 12 | 14 | s | 17.36338, 78.47589 | low | sign "MANJA & PATANG"; on gulzar_houz_e |
| kite_stall | `kite_stall_3` | Kite stall | 9214 | 8032 | 12 | 20 | 14 | w | 17.36360, 78.47622 | low | sign "KITE BAZAAR"; on gulzar_houz_e |
| lb_stadium | `lb_stadium` | Lal Bahadur Stadium | 8673 | 4880 | 198 | 220 | 30 | w |  | medium | solids:6; layout lb_stadium |
| library | `city_central_library` | City Central Library, Chikkadpally | 10753 | 4768 | 40 | 46 | 24 | e | 17.40120, 78.49420 | low |  |
| market_hall | `chenoy_trade_centre` | Chenoy Trade Centre (CTC) | 10197 | 1948 | 40 | 60 | 24 | n | 17.43950, 78.49150 | low | sign "CHENOY TRADE CENTRE"; on ln_o288592788 |
| market_hall | `gaddiannaram_fruit_market` | Gaddiannaram Fruit Market | 13402 | 7607 | 70 | 140 | 16 | e | 17.36600, 78.53400 | low | variant fruit |
| market_hall | `monda_market` | Monda Market | 10679 | 2366 | 136 | 80 | 22 | n | 17.43417, 78.49667 | high |  |
| market_hall | `murgi_chowk` | Murgi Chowk market | 8463 | 8246 | 50 | 40 | 18 | n | 17.36197, 78.47072 | medium |  |
| maut_ka_kuan | `maut_ka_kuan` | Maut ka Kuan (well of death) | 8253 | 5914 | 40 | 40 | 22 | n |  | low | layout numaish |
| meat_shop | `meat_shop_1` | Fresh Chicken & Mutton | 11691 | 4908 | 22 | 18 | 20 | n | 17.40056, 78.50689 | low | sign "FRESH CHICKEN & MUTTON"; on ln_o213992427 |
| meat_shop | `meat_shop_2` | Al-Habeeb Chicken Centre | 4974 | 5312 | 22 | 18 | 20 | n | 17.39634, 78.42182 | low | sign "AL-HABEEB CHICKEN"; on old_mumbai_rd |
| meat_shop | `meat_shop_3` | New Mutton Shop | 6019 | 1297 | 22 | 18 | 20 | s | 17.45442, 78.43394 | low | sign "MUTTON SHOP"; on ln_erragadda_h1 |
| meat_shop | `meat_shop_4` | Malakpet Mutton Shop | 11026 | 8098 | 18 | 22 | 20 | w | 17.36197, 78.49784 | low | sign "MUTTON SHOP"; on ln_o274242420 |
| meat_shop | `meat_shop_5` | Kothapet Chicken & Mutton | 13942 | 7569 | 18 | 22 | 20 | w | 17.36700, 78.54350 | low | sign "CHICKEN & MUTTON"; on malakpet_rd |
| meat_shop | `meat_shop_6` | Murgi Chowk Chicken Centre | 8423 | 8223 | 22 | 18 | 20 | n | 17.36210, 78.47053 | low | sign "CHICKEN CENTRE"; on hussaini_alam_rd |
| meat_shop | `meat_shop_7` | Bholakpur Chicken Centre | 10751 | 3446 | 18 | 22 | 20 | w | 17.41849, 78.49600 | low | sign "CHICKEN CENTRE"; on ln_o126811795 |
| medical_shop | `medical_shop_1` | Life Line Medicals | 9661 | 5087 | 24 | 18 | 22 | n | 17.39659, 78.48328 | low | sign "LIFE LINE MEDICALS"; on ln_hyderguda_h1 |
| medical_shop | `medical_shop_2` | Sri Venkateswara Medical Hall | 10091 | 5897 | 24 | 18 | 22 | s | 17.38706, 78.48579 | low | sign "MEDICAL HALL"; on koti_kachiguda_rd |
| medical_shop | `medical_shop_3` | Care Medicals | 9007 | 6211 | 18 | 24 | 22 | w | 17.38411, 78.47653 | low | sign "CARE MEDICALS"; on abids_rd |
| medical_shop | `medical_shop_4` | Marredpally Medicals | 11807 | 1507 | 24 | 18 | 22 | s | 17.44954, 78.51308 | low | sign "MEDICALS"; on ln_marredpally_h1 |
| medical_shop | `medical_shop_5` | Malakpet Medicals | 11625 | 7220 | 24 | 18 | 22 | n | 17.37275, 78.50625 | low | sign "MEDICALS"; on malakpet_rd |
| medical_shop | `medical_shop_6` | Sri Sai Medicals | 12736 | 7378 | 18 | 24 | 22 | e | 17.36766, 78.52145 | low | sign "SAI MEDICALS"; on ln_dilsukh_v1 |
| medical_shop | `medical_shop_7` | Banjara Medicals | 6516 | 3674 | 24 | 18 | 22 | n | 17.41680, 78.44450 | low | sign "BANJARA MEDICALS"; on ln_o28475982 |
| medical_shop | `medical_shop_8` | Sai Medical & General Stores | 10358 | 4968 | 24 | 18 | 22 | n |  | low | sign "SAI MEDICAL"; layout lakshmi_nagar_colony |
| mgbs | `imlibun_bus_station` | Imlibun Bus Station (MGBS) | 9862 | 6747 | 204 | 120 | 22 | n | 17.37800, 78.48350 | medium | solids:1 |
| mozamjahi_market | `mozamjahi_market` | Mozamjahi Market | 8672 | 6165 | 70 | 70 | 30 | w | 17.38450, 78.47350 | medium |  |
| musical_fountain | `musical_fountain` | Lumbini musical fountain | 8619 | 4082 | 26 | 18 | 6 |  | 17.40960, 78.47250 | low |  |
| numaish_gate | `numaish_gate` | Numaish gate | 8312 | 5852 | 12 | 60 | 34 | e |  | low | walk-through; solids:2; layout numaish |
| numaish_stalls | `numaish_stalls_1` | Numaish stalls | 8208 | 5844 | 110 | 18 | 14 | s |  | low | layout numaish |
| numaish_stalls | `numaish_stalls_2` | Numaish stalls | 8188 | 5884 | 90 | 18 | 14 | n |  | low | layout numaish |
| photo_studio | `photo_studio_1` | Raj Colour Lab & Studio | 9391 | 4675 | 18 | 24 | 24 | e | 17.40157, 78.48081 | low | sign "RAJ COLOUR LAB" |
| photo_studio | `photo_studio_2` | Studio Lakshmi | 9182 | 5999 | 24 | 18 | 24 | n | 17.38674, 78.47802 | low | sign "STUDIO LAKSHMI"; on bank_st |
| photo_studio | `photo_studio_3` | Prince Photo Studio | 8777 | 5720 | 24 | 18 | 24 | s | 17.38917, 78.47425 | low | sign "PRINCE STUDIO"; on nampally_rd |
| photo_studio | `photo_studio_4` | Sri Sai Photo Studio | 6711 | 2349 | 18 | 24 | 24 | w | 17.43595, 78.44485 | low | sign "SAI PHOTO STUDIO"; on mumbai_hwy |
| photo_studio | `photo_studio_5` | Tarnaka Photo Studio | 13320 | 3060 | 18 | 24 | 24 | e | 17.42638, 78.53309 | low | sign "PHOTO STUDIO"; on ln_o214049991 |
| photo_studio | `photo_studio_6` | Colour Lab & Studio | 12491 | 7387 | 24 | 18 | 24 | s | 17.36927, 78.51888 | low | sign "COLOUR LAB"; on malakpet_rd |
| pindi_girni | `pindi_girni_1` | Hanuman Pindi Girni | 10358 | 4909 | 30 | 24 | 24 | s |  | low | sign "HANUMAN PINDI GIRNI"; layout lakshmi_nagar_colony |
| pindi_girni | `pindi_girni_2` | Lakshmi Flour Mill | 11596 | 4791 | 24 | 30 | 24 | e | 17.40145, 78.50674 | low | sign "LAKSHMI FLOUR MILL"; on ln_o213992494 |
| pindi_girni | `pindi_girni_3` | Ganesh Flour Mill | 7425 | 4922 | 24 | 30 | 24 | e | 17.39947, 78.45921 | low | sign "GANESH FLOUR MILL"; on ln_o58830791 |
| pindi_girni | `pindi_girni_4` | Sri Rama Flour Mill | 6303 | 1394 | 30 | 24 | 24 | s | 17.45089, 78.43785 | low | sign "SRI RAMA FLOUR MILL"; on ln_o305663310 |
| pindi_girni | `pindi_girni_5` | Noor Atta Chakki | 10799 | 3752 | 30 | 24 | 24 | s | 17.41406, 78.49628 | low | sign "NOOR ATTA CHAKKI"; on ln_o28128581 |
| pindi_girni | `pindi_girni_6` | Noor Pindi Girni | 9573 | 8651 | 24 | 30 | 24 | w | 17.35786, 78.48029 | low | sign "NOOR PINDI GIRNI"; on ln_mitti_ka_sher |
| pindi_girni | `pindi_girni_7` | Durga Pindi Girni | 12950 | 7913 | 24 | 30 | 24 | w | 17.36217, 78.52763 | low | sign "DURGA PINDI GIRNI"; on ln_sai_temple |
| playground_kit | `playground_kit_14` | Swings & slide | 10053 | 4163 | 18 | 10 | 14 |  | 17.40798, 78.48745 | low |  |
| playground_kit | `playground_kit_15` | Swings & slide | 6220 | 1396 | 18 | 10 | 14 |  | 17.45148, 78.43681 | low |  |
| playground_kit | `playground_kit_16` | Swings & slide | 5538 | 13 | 18 | 10 | 14 |  | 17.48360, 78.39080 | low |  |
| playground_kit | `playground_kit_home` | Swings & slide | 10258 | 4970 | 18 | 10 | 14 |  |  | low | layout lakshmi_nagar_colony |
| prasads_imax | `prasads_imax` | Prasads IMAX | 8054 | 3848 | 78 | 68 | 44 | s | 17.41284, 78.46588 | high | opened July 2003; show as opening/new |
| radio_station | `all_india_radio` | All India Radio, Saifabad | 7993 | 4448 | 48 | 40 | 24 | w | 17.40550, 78.46500 | low |  |
| railway_station | `kachiguda_station` | Kachiguda Station | 11305 | 5828 | 76 | 96 | 34 | w |  | high | variant kachiguda |
| railway_station | `nampally_station` | Nampally Station (Hyderabad Deccan) | 8152 | 5327 | 50 | 110 | 30 | w |  | high | variant nampally |
| railway_station | `secunderabad_station` | Secunderabad Station | 11112 | 2407 | 180 | 48 | 32 | s |  | high | variant secunderabad |
| restaurant | `bawarchi` | Bawarchi | 10942 | 4426 | 52 | 36 | 24 | w | 17.40570, 78.49638 | low | sign "BAWARCHI" |
| restaurant | `hotel_nayaab` | Hotel Nayaab | 8901 | 7659 | 34 | 26 | 26 | s | 17.36666, 78.47412 | low | sign "HOTEL NAYAAB"; on ln_ghansi_bazaar |
| restaurant | `hotel_niagara` | Hotel Niagara | 10309 | 6599 | 40 | 26 | 26 | n | 17.38050, 78.48850 | low | sign "HOTEL NIAGARA"; on afzalgunj_rd_2 |
| restaurant | `paradise` | Paradise | 9816 | 1733 | 60 | 40 | 26 | n | 17.44280, 78.48680 | medium | sign "PARADISE" |
| restaurant | `pista_house` | Pista House | 8991 | 8590 | 28 | 36 | 26 | w | 17.35850, 78.47520 | low | sign "PISTA HOUSE"; on shah_ali_banda_rd |
| restaurant | `shadab_hotel` | Hotel Shadab | 8834 | 7626 | 28 | 44 | 26 | e | 17.36706, 78.47388 | low | sign "HOTEL SHADAB"; on ln_o355688043 |
| restaurant | `shah_ghouse` | Shah Ghouse Cafe | 8558 | 9304 | 36 | 28 | 26 | s | 17.34806, 78.47000 | medium | sign "SHAH GHOUSE CAFE"; on shah_ali_banda_rd |
| restaurant | `taj_mahal_hotel_abids` | Taj Mahal Hotel, Abids | 8941 | 5729 | 40 | 26 | 26 | s | 17.39008, 78.47716 | low | sign "TAJ MAHAL HOTEL"; on nampally_rd |
| rythu_bazaar | `rythu_bazaar_erragadda` | Rythu Bazaar, Erragadda | 5936 | 1190 | 150 | 70 | 14 | s | 17.45551, 78.43342 | low | walk-through; solids:2 |
| rythu_bazaar | `rythu_bazaar_mehdipatnam` | Rythu Bazaar, Mehdipatnam | 6206 | 5387 | 150 | 72 | 14 | s | 17.39510, 78.44110 | medium | walk-through; solids:2 |
| rythu_bazaar | `rythu_bazaar_saroornagar` | Rythu Bazaar, Kothapet | 13971 | 7534 | 140 | 70 | 14 | n | 17.36600, 78.54200 | low | walk-through; solids:2 |
| samosa_bandi | `samosa_bandi_1` | Samosa bandi | 12319 | 5511 | 9 | 16 | 12 | w | 17.39336, 78.51574 | low | on ln_o213849456 |
| samosa_bandi | `samosa_bandi_2` | Samosa bandi | 5183 | 5342 | 16 | 9 | 12 | n | 17.39589, 78.42531 | low | on old_mumbai_rd |
| samosa_bandi | `samosa_bandi_3` | Samosa bandi | 10752 | 3421 | 9 | 16 | 12 | w | 17.41900, 78.49640 | low | on ln_o126811795 |
| samosa_bandi | `samosa_bandi_4` | Samosa bandi | 11935 | 1430 | 16 | 9 | 12 | n | 17.44882, 78.51477 | low | on ln_o143328829 |
| samosa_bandi | `samosa_bandi_5` | Samosa bandi | 13419 | 7736 | 9 | 16 | 12 | e | 17.36482, 78.53100 | low | on kothapet_rd |
| samosa_bandi | `samosa_bandi_6` | Samosa bandi | 9281 | 8364 | 16 | 9 | 12 | n | 17.36072, 78.47723 | low | on sardar_mahal_rd |
| samosa_bandi | `samosa_bandi_7` | Samosa bandi | 6716 | 2540 | 9 | 16 | 12 | e | 17.43314, 78.44612 | low |  |
| school | `hyderabad_public_school` | The Hyderabad Public School | 7617 | 1744 | 120 | 36 | 30 | s | 17.44419, 78.45730 | high | variant hps; sign "THE HYDERABAD PUBLIC SCHOOL" |
| school | `school_1` | Saraswati Vidya Mandir High School | 9243 | 5103 | 80 | 30 | 28 | n | 17.39657, 78.47922 | low | sign "SARASWATI VIDYA MANDIR" |
| school | `school_10` | Malakpet High School | 11550 | 8246 | 30 | 80 | 28 | w | 17.35925, 78.50498 | low | sign "MALAKPET HIGH SCHOOL" |
| school | `school_11` | Dilsukhnagar Public School | 12715 | 7810 | 80 | 28 | 28 | s | 17.36392, 78.52284 | low | sign "DILSUKHNAGAR PUBLIC SCHOOL" |
| school | `school_12` | Saidabad Government School | 11864 | 8325 | 80 | 28 | 26 | s | 17.35780, 78.51050 | low | sign "GOVT SCHOOL SAIDABAD" |
| school | `school_13` | Government Urdu High School, Shah Ali Banda | 8756 | 9417 | 80 | 28 | 26 | s | 17.34700, 78.47250 | low | sign "GOVT URDU HIGH SCHOOL" |
| school | `school_2` | Vivekananda High School | 11021 | 4920 | 80 | 30 | 28 | s | 17.39979, 78.49737 | low | sign "VIVEKANANDA HIGH SCHOOL" |
| school | `school_3` | Government High School, Kachiguda | 11422 | 5416 | 80 | 30 | 28 | n | 17.39425, 78.50253 | low | sign "GOVT HIGH SCHOOL" |
| school | `school_4` | Nalanda Public School | 7257 | 5164 | 80 | 28 | 28 | s | 17.39640, 78.45666 | low | sign "NALANDA PUBLIC SCHOOL" |
| school | `school_5` | Al-Ameen High School | 4849 | 5336 | 80 | 28 | 28 | n | 17.39589, 78.41975 | low | sign "AL-AMEEN HIGH SCHOOL" |
| school | `school_6` | Sri Chaitanya Vidyalayam | 6407 | 2137 | 28 | 80 | 28 | e | 17.43956, 78.44062 | low | sign "VIDYALAYAM HIGH SCHOOL" |
| school | `school_7` | Government High School, Musheerabad | 11388 | 3621 | 30 | 74 | 26 | e | 17.41700, 78.50400 | low | sign "GOVT HIGH SCHOOL" |
| school | `school_8` | Holy Family Convent School | 11647 | 1369 | 80 | 30 | 30 | s | 17.44909, 78.51006 | low | sign "HOLY FAMILY CONVENT" |
| school | `school_9` | Railway High School, Lalaguda | 12490 | 2733 | 90 | 26 | 28 | n | 17.43050, 78.52050 | low | sign "RAILWAY HIGH SCHOOL" |
| shilparamam_gate | `shilparamam_gate` | Shilparamam gate | 2589 | 1592 | 40 | 12 | 22 | s | 17.45080, 78.37960 | medium | walk-through; solids:2 |
| stadium | `gachibowli_stadium` | Gachibowli Stadium | 551 | 1890 | 200 | 150 | 30 | n | 17.44678, 78.34470 | high |  |
| stationery | `stationery_1` | Vidya Stationery & Book Depot | 9284 | 4868 | 24 | 18 | 22 | n | 17.39726, 78.47883 | low | sign "VIDYA STATIONERY"; on ln_hyderguda_h1 |
| stationery | `stationery_2` | Navyuga Stationers | 11025 | 4951 | 18 | 24 | 22 | e | 17.39937, 78.49778 | low | sign "NAVYUGA STATIONERS"; on ln_o28110951 |
| stationery | `stationery_3` | Student Book House | 11489 | 5430 | 24 | 18 | 22 | n | 17.39511, 78.50300 | low | sign "STUDENT BOOK HOUSE"; on ln_o90391902 |
| stationery | `stationery_4` | Koti textbook stall | 9761 | 6088 | 24 | 18 | 22 | s | 17.38555, 78.48305 | low | sign "TEXT BOOKS"; on bank_st |
| stationery | `stationery_5` | Bharat Book & Stationery | 7285 | 5208 | 24 | 18 | 22 | s | 17.39567, 78.45798 | low | sign "BHARAT STATIONERY"; on mallepally_rd |
| stationery | `stationery_6` | Gita Stationery | 6440 | 2144 | 18 | 24 | 22 | e | 17.43943, 78.44099 | low | sign "GITA STATIONERY"; on ln_o31479286 |
| stationery | `stationery_7` | Saraswati Book Depot | 12918 | 7751 | 18 | 24 | 22 | e | 17.36581, 78.52334 | low | sign "SARASWATI BOOK DEPOT"; on ln_sai_temple |
| stationery | `stationery_8` | Sri Sai Stationery | 11597 | 8003 | 18 | 24 | 22 | e | 17.36289, 78.50537 | low | sign "SAI STATIONERY"; on ln_o118145528 |
| std_booth | `std_1` | STD/ISD/PCO | 10104 | 4825 | 12 | 12 | 15 | n | 17.40142, 78.48780 | low | sign "STD ISD PCO"; on himayatnagar_rd |
| std_booth | `std_10` | STD/ISD/PCO | 11317 | 2315 | 12 | 12 | 15 | w | 17.43500, 78.50380 | low | sign "STD ISD PCO"; on ln_o28129244 |
| std_booth | `std_11` | STD/ISD/PCO | 13072 | 7400 | 12 | 12 | 15 | n | 17.36862, 78.52831 | low | sign "STD ISD PCO" |
| std_booth | `std_12` | STD/ISD/PCO | 8869 | 8936 | 12 | 12 | 15 | w | 17.35456, 78.47371 | low | sign "STD ISD PCO"; on shah_ali_banda_rd |
| std_booth | `std_13` | STD/ISD/PCO | 7749 | 8843 | 12 | 12 | 15 | w | 17.35399, 78.46223 | low | sign "STD ISD PCO"; on ln_o281272574 |
| std_booth | `std_14` | STD/ISD/PCO | 7266 | 3284 | 12 | 12 | 15 | e | 17.42120, 78.45480 | low | sign "STD ISD PCO"; on panjagutta_rd |
| std_booth | `std_15` | STD/ISD/PCO | 3963 | 2921 | 12 | 12 | 15 | s | 17.43083, 78.40358 | low | sign "STD ISD PCO"; on ln_o311210966 |
| std_booth | `std_16` | STD/ISD/PCO | 2994 | 2115 | 12 | 12 | 15 | e | 17.44188, 78.38284 | low | sign "STD ISD PCO"; on hitec_rd |
| std_booth | `std_2` | STD/ISD/PCO | 9774 | 4906 | 12 | 12 | 15 | w | 17.39915, 78.48446 | low | sign "STD ISD PCO"; on ln_himayat_st_011 |
| std_booth | `std_3` | STD/ISD/PCO | 9937 | 6203 | 12 | 12 | 15 | w | 17.38528, 78.48503 | low | sign "STD ISD PCO"; on koti_kachiguda_rd |
| std_booth | `std_4` | STD/ISD/PCO | 9039 | 5627 | 12 | 12 | 15 | w | 17.39012, 78.47723 | low | sign "STD ISD PCO"; on gunfoundry_rd |
| std_booth | `std_5` | STD/ISD/PCO | 7840 | 4500 | 12 | 12 | 15 | s | 17.40463, 78.46412 | low | sign "STD ISD PCO"; on khairatabad_rd |
| std_booth | `std_6` | STD/ISD/PCO | 11025 | 4004 | 12 | 12 | 15 | w | 17.41099, 78.49864 | low | sign "STD ISD PCO"; on musheerabad_rd |
| std_booth | `std_7` | STD/ISD/PCO | 10087 | 4072 | 12 | 12 | 15 | n | 17.40856, 78.48724 | low | sign "STD ISD PCO"; on indira_park_rd |
| std_booth | `std_8` | STD/ISD/PCO | 5233 | 5249 | 12 | 12 | 15 | s | 17.39706, 78.42606 | low | sign "STD ISD PCO"; on old_mumbai_rd |
| std_booth | `std_9` | STD/ISD/PCO | 6698 | 2526 | 12 | 12 | 15 | n | 17.43351, 78.44589 | low | sign "STD ISD PCO"; on mumbai_hwy |
| tv_tower | `doordarshan_kendra` | Doordarshan Kendra, Ramanthapur | 13389 | 5365 | 40 | 40 | 120 | s | 17.39550, 78.53300 | low |  |
| video_parlour | `electronics_shop_1` | Vijaya TV & Radio | 8716 | 4996 | 30 | 8 | 14 | s |  | medium | variant tv_radio; sign "VIJAYA TV & RADIO"; layout lb_stadium |
| video_parlour | `recording_centre_1` | Raag Recording Centre | 8834 | 8283 | 30 | 16 | 22 | n | 17.36185, 78.47335 | low | variant recording; sign "RAAG RECORDING"; on laad_bazaar |
| video_parlour | `video_parlour_1` | Super Video Games | 11055 | 5599 | 30 | 22 | 24 | s | 17.39310, 78.49809 | low | sign "SUPER VIDEO GAMES"; on ln_barkatpura_h1 |
| video_parlour | `video_parlour_2` | Champion Video Games | 9740 | 5692 | 30 | 22 | 24 | n | 17.38872, 78.48277 | low | sign "CHAMPION GAMES"; on hanuman_tekdi_rd |
| video_parlour | `video_parlour_3` | Rocky Video Games | 12929 | 7718 | 22 | 30 | 24 | e | 17.36537, 78.52469 | low | sign "ROCKY VIDEO GAMES"; on ln_sai_temple |
| video_parlour | `video_parlour_4` | Game Zone Video Parlour | 6433 | 2194 | 30 | 22 | 24 | s | 17.43830, 78.44118 | low | sign "GAME ZONE"; on ln_o31479300 |
| water_tank | `water_tank_1` | Colony water tank | 10336 | 4870 | 22 | 22 | 60 |  |  | low | layout lakshmi_nagar_colony |
| water_tank | `water_tank_2` | Colony water tank | 11435 | 4762 | 22 | 22 | 60 |  | 17.40203, 78.50314 | low |  |
| water_tank | `water_tank_3` | Colony water tank | 10482 | 3267 | 22 | 22 | 60 |  | 17.42120, 78.49300 | low |  |
| water_tank | `water_tank_4` | Colony water tank | 11142 | 7732 | 22 | 22 | 60 |  | 17.36648, 78.49911 | low |  |
| water_tank | `water_tank_5` | Colony water tank | 13038 | 7634 | 22 | 22 | 60 |  | 17.36600, 78.52786 | low |  |
| water_tank | `water_tank_6` | Colony water tank | 11875 | 1283 | 22 | 22 | 60 |  | 17.45099, 78.51355 | low |  |
| water_tank | `water_tank_7` | Colony water tank | 6328 | 2028 | 22 | 22 | 60 |  | 17.44137, 78.43930 | low |  |
| zoo_gate | `zoo_gate` | Nehru Zoo gate | 7071 | 8633 | 16 | 50 | 24 | e | 17.35500, 78.45350 | low | walk-through; solids:2 |

### Places (566), grouped by kind

Each place is a walkable point next to the thing it names. `alias` = same spot as another id. lat, lon = the real position (places.json); x, y = where it is in the world after the projection and the move to a walkable spot.

#### bakery (6)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `bakery_1` | Subhan Bakery, Nampally | nampally | 8278 | 5517 | 18 | 17.39150, 78.46900 | low | alias of `subhan_bakery` |
| `bakery_2` | New Deccan Bakery | khairatabad | 6879 | 2491 | 18 | 17.43387, 78.44843 | low |  |
| `bakery_3` | Golden Bakery | musheerabad | 11050 | 3546 | 18 | 17.41759, 78.49995 | low |  |
| `bakery_4` | Malakpet Bakery | chaderghat | 10818 | 7311 | 18 | 17.37157, 78.49469 | low |  |
| `karachi_bakery` | Karachi Bakery | nampally | 8698 | 6112 | 18 | 17.38470, 78.47320 | medium |  |
| `subhan_bakery` | Subhan Bakery | nampally | 8278 | 5517 | 18 | 17.39150, 78.46900 | low |  |

#### banana_cart (10)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `banana_cart_1` | Banana cart | kachiguda | 11014 | 5790 | 18 | 17.39053, 78.49928 | low |  |
| `banana_cart_2` | Banana cart | chaderghat | 9936 | 6479 | 18 | 17.38174, 78.48470 | low |  |
| `banana_cart_3` | Banana cart | abids | 8948 | 6270 | 18 | 17.38339, 78.47443 | low |  |
| `banana_cart_4` | Banana cart | tolichowki | 6164 | 5500 | 18 | 17.39470, 78.44050 | low |  |
| `banana_cart_5` | Banana cart | ameerpet | 7120 | 2330 | 18 | 17.43531, 78.45135 | low |  |
| `banana_cart_6` | Banana cart | erragadda | 6050 | 1290 | 18 | 17.45397, 78.43371 | low |  |
| `banana_cart_7` | Banana cart | secunderabad | 10802 | 1863 | 18 | 17.43980, 78.49920 | low |  |
| `banana_cart_8` | Banana cart (outside the Sai Baba temple lane) | dilsukhnagar | 13025 | 7522 | 18 | 17.36750, 78.52685 | low |  |
| `banana_cart_9` | Banana cart | charminar | 9593 | 7546 | 18 | 17.36865, 78.48021 | low |  |
| `banana_cart_10` | Banana cart | secunderabad | 10598 | 2122 | 18 | 17.43720, 78.49600 | low |  |

#### barber (7)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `barber_1` | Lucky Hair Cutting Saloon | himayatnagar | 9751 | 5072 | 18 | 17.39751, 78.48415 | low |  |
| `barber_2` | Sundar Hair Saloon | amberpet | 11530 | 5501 | 18 | 17.39323, 78.50418 | low |  |
| `barber_3` | Raja Hair Cutting | masab_tank | 7468 | 4984 | 18 | 17.39857, 78.45949 | low |  |
| `barber_4` | Famous Saloon | musheerabad | 10571 | 3400 | 18 | 17.42003, 78.49393 | low |  |
| `barber_5` | Hero Hair Cutting | dilsukhnagar | 13110 | 7487 | 18 | 17.36735, 78.52900 | low |  |
| `barber_6` | Taj Hair Saloon | charminar | 9113 | 9166 | 18 | 17.35113, 78.47618 | low |  |
| `barber_7` | New Style Hair Dressers | himayatnagar | 10302 | 4879 | 18 | 17.40045, 78.49145 | low |  |

#### bridge (5)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `afzalgunj_bridge` | Afzalgunj Bridge | dabeerpura | 9762 | 7078 | 24 | 17.37215, 78.47900 | low |  |
| `chaderghat_bridge` | Chaderghat Bridge | chaderghat | 10601 | 6609 | 28 | 17.37920, 78.48800 | low |  |
| `musallam_jung_bridge` | Musallam Jung Bridge | puranapul | 8234 | 7359 | 22 | 17.36965, 78.46750 | low |  |
| `naya_pul` | Naya Pul | charminar | 9153 | 7262 | 28 | 17.37070, 78.47520 | medium |  |
| `purana_pul` | Purana Pul & Jumerat Bazaar | afzalgunj | 7316 | 7588 | 30 | 17.36755, 78.45828 | high |  |

#### bus_stop (22)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `bus_stop_1` | Koti bus stop | abids | 9750 | 6170 | 18 | 17.38513, 78.48286 | low |  |
| `bus_stop_2` | Abids bus stop | abids | 9029 | 6069 | 18 | 17.38512, 78.47651 | low |  |
| `bus_stop_3` | Nampally bus stop | nampally | 8510 | 5664 | 18 | 17.38964, 78.47182 | low |  |
| `bus_stop_4` | Lakdikapul bus stop | khairatabad | 7729 | 4566 | 18 | 17.40382, 78.46422 | low |  |
| `bus_stop_5` | Mehdipatnam bus stop | tolichowki | 6084 | 5295 | 18 | 17.39580, 78.43940 | low |  |
| `bus_stop_6` | Ameerpet bus stop | ameerpet | 6728 | 2414 | 18 | 17.43504, 78.44608 | low |  |
| `bus_stop_7` | Paradise bus stop | secunderabad | 9813 | 1631 | 18 | 17.44316, 78.48624 | low |  |
| `bus_stop_8` | Secunderabad bus stop | secunderabad | 11096 | 2298 | 18 | 17.43497, 78.50151 | low |  |
| `bus_stop_9` | RTC X Roads bus stop | rtc_x | 10950 | 4472 | 18 | 17.40466, 78.49741 | low |  |
| `bus_stop_10` | Himayatnagar bus stop | himayatnagar | 9761 | 4620 | 18 | 17.40246, 78.48440 | low |  |
| `bus_stop_11` | Dilsukhnagar bus stop | dilsukhnagar | 13175 | 7480 | 18 | 17.36819, 78.52996 | low |  |
| `bus_stop_12` | Malakpet bus stop | malakpet | 11571 | 7197 | 18 | 17.37314, 78.50365 | low |  |
| `bus_stop_13` | Charminar bus stop | charminar | 9501 | 8373 | 18 | 17.36067, 78.47964 | low |  |
| `bus_stop_14` | Tank Bund bus stop | hussain_sagar | 9565 | 3465 | 18 | 17.41776, 78.48202 | low |  |
| `bus_stop_15` | Tolichowki bus stop | tolichowki | 4671 | 5119 | 18 | 17.39851, 78.41636 | low |  |
| `bus_stop_16` | Tarnaka bus stop | osmania | 13426 | 3213 | 18 | 17.42484, 78.53497 | low |  |
| `bus_stop_17` | Afzalgunj bus stop | afzalgunj | 8975 | 6994 | 18 | 17.37360, 78.47520 | low |  |
| `bus_stop_18` | Khairatabad bus stop | khairatabad | 7697 | 3950 | 18 | 17.41174, 78.46129 | low |  |
| `bus_stop_19` | Chikkadpally bus stop | himayatnagar | 10784 | 4846 | 18 | 17.40041, 78.49477 | low |  |
| `bus_stop_20` | HITEC City bus stop | hitec | 2718 | 1667 | 18 | 17.44931, 78.38114 | low |  |
| `bus_stop_21` | Uppal bus stop | amberpet | 14974 | 5158 | 18 | 17.39843, 78.56087 | low |  |
| `bus_stop_22` | LB Nagar bus stop | lb_nagar | 14324 | 8816 | 18 | 17.34900, 78.55000 | low |  |

#### chai_bandi (8)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `chai_bandi_1` | Raju's chai bandi | himayatnagar | 10182 | 5061 | 18 | 17.39716, 78.48919 | low |  |
| `chai_bandi_2` | Chai bandi | erragadda | 6059 | 1322 | 18 | 17.45496, 78.43691 | low |  |
| `chai_bandi_3` | OU canteen chai | osmania | 12945 | 3632 | 18 | 17.41830, 78.52620 | low |  |
| `chai_bandi_4` | Chai bandi | charminar | 8941 | 8457 | 18 | 17.36008, 78.47400 | low |  |
| `chai_bandi_5` | Chai bandi | bahadurpura | 7616 | 8529 | 18 | 17.35762, 78.46128 | low |  |
| `chai_bandi_6` | Bhutta & chai cart | hussain_sagar | 9637 | 3353 | 18 | 17.42086, 78.48420 | low |  |
| `chai_bandi_7` | Construction-site chai | hitec | 2765 | 1729 | 18 | 17.44660, 78.37950 | low |  |
| `chai_bandi_8` | Chai bandi | hussain_sagar | 9303 | 2214 | 18 | 17.43380, 78.48100 | low |  |

#### church (12)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `church_1` | Methodist Church, Marredpally | secunderabad | 11503 | 1474 | 20 | 17.44700, 78.50720 | low |  |
| `church_2` | CSI Church, Chikkadpally | himayatnagar | 10323 | 4471 | 18 | 17.40447, 78.48958 | low |  |
| `church_holy_trinity` | Holy Trinity Church, Bolarum | marredpally | 11479 | 261 | 20 | 17.51669, 78.52361 | medium | alias of `holy_trinity_church_bolarum` |
| `church_st_georges` | St. George's Church | abids | 9366 | 5583 | 18 | 17.39050, 78.48000 | low | alias of `st_georges_church_abids` |
| `church_st_johns` | St. John's Church | osmania | 11862 | 2349 | 18 | 17.43483, 78.51019 | low | alias of `st_johns_church_secunderabad` |
| `church_st_josephs` | St. Joseph's Cathedral | abids | 9123 | 5156 | 22 | 17.39556, 78.47744 | high |  |
| `church_st_marys` | St. Mary's Church | secunderabad | 11124 | 1794 | 22 | 17.44210, 78.50220 | medium |  |
| `church_wesley` | Wesley Church | secunderabad | 10888 | 1958 | 20 | 17.43930, 78.49970 | low |  |
| `holy_trinity_church_bolarum` | Holy Trinity Church, Bolarum | marredpally | 11479 | 261 | 20 | 17.51669, 78.52361 | medium |  |
| `st_georges_church_abids` | St. George's Church | abids | 9366 | 5583 | 18 | 17.39050, 78.48000 | low |  |
| `st_johns_church_secunderabad` | St. John's Church | osmania | 11862 | 2349 | 18 | 17.43483, 78.51019 | low |  |
| `st_josephs_cathedral` | St. Joseph's Cathedral | abids | 9123 | 5156 | 22 | 17.39556, 78.47744 | high | alias of `church_st_josephs` |

#### cinema (10)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `anand_theatre` | Anand Theatre | osmania | 11704 | 2488 | 30 | 17.43434, 78.50944 | low |  |
| `devi_theatre` | Devi 70mm | rtc_x | 10923 | 4533 | 30 | 17.40421, 78.49713 | low |  |
| `liberty_theatre` | Liberty Theatre | himayatnagar | 9047 | 4460 | 30 | 17.40440, 78.47760 | low |  |
| `odeon_theatre` | Odeon | himayatnagar | 10722 | 4377 | 30 | 17.40556, 78.49459 | low |  |
| `prasads_imax` | Prasads IMAX | khairatabad | 8054 | 3900 | 30 | 17.41284, 78.46588 | high |  |
| `ramakrishna_theatre` | Ramakrishna 70mm | abids | 9310 | 5956 | 30 | 17.38750, 78.47900 | low |  |
| `sandhya_theatre` | Sandhya 70mm & 35mm | himayatnagar | 10713 | 4448 | 30 | 17.40534, 78.49633 | low |  |
| `sangeet_theatre` | Sangeet 70mm | marredpally | 11816 | 2248 | 18 | 17.43411, 78.50995 | low |  |
| `shanti_theatre` | Shanti Theatre | himayatnagar | 10287 | 5450 | 24 | 17.39380, 78.48950 | low |  |
| `sudarshan_theatre` | Sudarshan 35mm | himayatnagar | 10793 | 4630 | 30 | 17.40448, 78.49534 | low |  |

#### coconut_cart (7)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `coconut_cart_1` | Tender coconut cart | hussain_sagar | 8013 | 3140 | 18 | 17.42220, 78.46410 | low |  |
| `coconut_cart_2` | Tender coconut cart | hussain_sagar | 8157 | 2372 | 18 | 17.43300, 78.46580 | low |  |
| `coconut_cart_3` | Tender coconut cart | hussain_sagar | 8829 | 2207 | 18 | 17.43500, 78.47300 | low |  |
| `coconut_cart_4` | Tender coconut cart | hussain_sagar | 9606 | 3380 | 18 | 17.41862, 78.48260 | low |  |
| `coconut_cart_5` | Tender coconut cart | banjara | 5219 | 3304 | 18 | 17.42320, 78.42380 | low |  |
| `coconut_cart_6` | Tender coconut cart | dilsukhnagar | 13397 | 7951 | 18 | 17.36056, 78.53687 | low |  |
| `coconut_cart_7` | Tender coconut cart | hussain_sagar | 9824 | 3181 | 18 | 17.42184, 78.48490 | low |  |

#### cycle_rent (5)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `cycle_rent_1` | Lakshmi Cycle Stores (on hire) | musheerabad | 9743 | 4314 | 18 | 17.40631, 78.48407 | low |  |
| `cycle_rent_2` | Mohan Cycle Taxi | koti | 9632 | 5383 | 18 | 17.39249, 78.48232 | low |  |
| `cycle_rent_3` | Raju Cycle Taxi | himayatnagar | 10738 | 3975 | 18 | 17.41126, 78.49525 | low |  |
| `cycle_rent_4` | Peter Cycle Works (hire) | marredpally | 11561 | 1344 | 18 | 17.44927, 78.50894 | low |  |
| `cycle_rent_5` | Chinna Cycle Taxi | himayatnagar | 10154 | 4865 | 18 | 17.40070, 78.48867 | low |  |

#### dargah (2)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `dargah_yousufain` | Dargah Yousufain | nampally | 8052 | 5613 | 18 | 17.39050, 78.46550 | low |  |
| `hussain_shah_wali_dargah` | Hussain Shah Wali Dargah & Shaikpet Sarai | tolichowki | 3290 | 4757 | 18 | 17.40500, 78.39300 | low |  |

#### district (2)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `barkas` | Barkas (the Arab quarter) | chandrayangutta | 8975 | 11025 | 40 | 17.31634, 78.47499 | medium |  |
| `kphb_colony` | KPHB Colony, Kukatpally | erragadda | 5472 | 51 | 40 | 17.48450, 78.39250 | low |  |

#### dosa_bandi (7)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `dosa_bandi_1` | Dosa bandi | himayatnagar | 10111 | 4383 | 18 | 17.40505, 78.48795 | low |  |
| `dosa_bandi_2` | Dosa bandi | saidabad | 11797 | 8034 | 18 | 17.36173, 78.50907 | low |  |
| `dosa_bandi_3` | Dosa bandi | dilsukhnagar | 12976 | 7728 | 18 | 17.36421, 78.52910 | low |  |
| `dosa_bandi_4` | Dosa bandi | saidabad | 11668 | 8878 | 18 | 17.35128, 78.50924 | low |  |
| `dosa_bandi_5` | Dosa bandi | hussain_sagar | 8181 | 3755 | 18 | 17.41220, 78.46700 | low |  |
| `dosa_bandi_6` | Dosa bandi | secunderabad | 10023 | 2490 | 18 | 17.43220, 78.48920 | low |  |
| `dosa_bandi_7` | Dosa bandi | amberpet | 12044 | 5632 | 18 | 17.39210, 78.51155 | low |  |

#### edge (6)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `chilkur_balaji` | To Chilkur Balaji | langar_houz | 4034 | 7042 | 16 | 17.37000, 78.34000 | low | off-map exit |
| `gandipet` | Gandipet (Osman Sagar) road | rajendranagar | 3998 | 7058 | 30 | 17.37900, 78.34000 | low | off-map exit |
| `himayat_sagar` | To Himayat Sagar | langar_houz | 4059 | 6987 | 16 | 17.34000, 78.37000 | low | off-map exit |
| `mrugavani_park` | To Mrugavani deer park | langar_houz | 4000 | 6992 | 16 | 17.36200, 78.34000 | low | off-map exit |
| `ramoji_film_city` | To Ramoji Film City (bus trip) | lb_nagar | 14906 | 9371 | 30 | 17.34050, 78.56120 | medium | off-map exit |
| `vijayawada_highway` | NH 9 to Vijayawada | lb_nagar | 14961 | 9345 | 30 | 17.33950, 78.56120 | medium |  |

#### electronics_shop (1)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `electronics_shop_1` | Vijaya TV & Radio | basheerbagh | 8716 | 5002 | 18 | 17.39633, 78.47570 | low |  |

#### festival (3)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `bonalu` | Lashkar Bonalu, Ujjaini Mahankali | secunderabad | 10228 | 2133 | 26 | 17.43670, 78.49110 | medium | alias of `ujjaini_mahankali_temple` |
| `ganesh_immersion` | Ganesh Nimajjanam on Tank Bund | hussain_sagar | 9257 | 3659 | 30 | 17.41435, 78.47939 | medium | alias of `ganesh_immersion_point` |
| `ganesh_immersion_point` | Tank Bund immersion cranes | hussain_sagar | 9257 | 3659 | 30 | 17.41435, 78.47939 | medium | festival ganesh_immersion |

#### flower_cart (12)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `flower_cart_1` | Jasmine & marigold cart | himayatnagar | 10047 | 4902 | 18 | 17.40003, 78.48665 | low |  |
| `flower_cart_2` | Flower cart | musheerabad | 9917 | 4471 | 18 | 17.40411, 78.48636 | low |  |
| `flower_cart_3` | Flower cart | amberpet | 12135 | 5366 | 18 | 17.39495, 78.51288 | low |  |
| `flower_cart_4` | Flower cart (Mahankali) | secunderabad | 10220 | 2143 | 18 | 17.43652, 78.49129 | low |  |
| `flower_cart_5` | Flower cart (Sai Baba temple lane) | dilsukhnagar | 13024 | 7515 | 18 | 17.36809, 78.52685 | low |  |
| `flower_cart_6` | Flower cart (Sai Baba temple lane) | dilsukhnagar | 12985 | 7548 | 18 | 17.36795, 78.52685 | low |  |
| `flower_cart_7` | Flower cart (Sai Baba temple lane) | dilsukhnagar | 13022 | 7539 | 18 | 17.36782, 78.52685 | low |  |
| `flower_cart_8` | Flower cart (Sai Baba temple lane) | dilsukhnagar | 12987 | 7571 | 18 | 17.36768, 78.52685 | low |  |
| `flower_cart_9` | Flower cart | masab_tank | 6589 | 5217 | 18 | 17.39610, 78.44820 | low |  |
| `flower_cart_10` | Flower cart (Lal Darwaza) | charminar | 9390 | 9119 | 18 | 17.35070, 78.47860 | low |  |
| `flower_cart_11` | Flower cart (Birla Mandir steps) | basheerbagh | 8365 | 4332 | 18 | 17.40560, 78.47010 | low |  |
| `flower_cart_12` | Flower cart (Peddamma Temple) | jubilee | 4176 | 2856 | 18 | 17.43047, 78.40513 | low |  |

#### food (5)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `bawarchi` | Bawarchi | rtc_x | 10890 | 4426 | 30 | 17.40570, 78.49638 | low |  |
| `famous_ice_cream` | Famous Ice Cream | nampally | 8719 | 6170 | 16 | 17.38430, 78.47370 | medium |  |
| `gokul_chat` | Gokul Chat | koti | 9885 | 6120 | 18 | 17.38580, 78.48420 | low |  |
| `hotel_madina` | Hotel Madina | afzalgunj | 8852 | 7616 | 30 | 17.36520, 78.47470 | medium | alias of `pathergatti` |
| `paradise` | Paradise | begumpet | 9816 | 1699 | 26 | 17.44280, 78.48680 | medium |  |

#### giver (36)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `giver_abids` | Abids: GPO corner | abids | 9021 | 5812 | 22 | 17.38809, 78.47631 | medium |  |
| `giver_afzalgunj` | Afzalgunj: library steps | afzalgunj | 9293 | 7036 | 22 | 17.37395, 78.47815 | medium |  |
| `giver_amberpet` | Amberpet | amberpet | 12827 | 5733 | 22 | 17.39060, 78.52380 | low |  |
| `giver_ameerpet` | Ameerpet coaching lane | ameerpet | 6727 | 2290 | 22 | 17.43622, 78.44570 | low |  |
| `giver_bahadurpura` | Bahadurpura: zoo road | zoo | 7165 | 8612 | 22 | 17.35550, 78.45450 | low |  |
| `giver_banjara` | Banjara Hills Road No. 1 | banjara | 6806 | 3748 | 22 | 17.41420, 78.44720 | low |  |
| `giver_basheerbagh` | Basheerbagh: Cafe Bahar corner | himayatnagar | 9101 | 4792 | 22 | 17.39990, 78.47760 | medium |  |
| `giver_begumpet` | Begumpet airport road | begumpet | 8330 | 1626 | 22 | 17.44620, 78.46680 | low |  |
| `giver_chaderghat` | Chaderghat: Imlibun gate | chaderghat | 9768 | 6665 | 22 | 17.37870, 78.48300 | medium |  |
| `giver_chandrayangutta` | Chandrayangutta | chandrayangutta | 9640 | 10363 | 22 | 17.32700, 78.48400 | low |  |
| `giver_charminar` | Charminar: Laad Bazaar mouth | charminar | 8957 | 8259 | 22 | 17.36172, 78.47425 | medium |  |
| `giver_dabeerpura` | Purani Haveli gate | charminar | 9695 | 7791 | 22 | 17.36620, 78.48180 | medium |  |
| `giver_dilsukhnagar` | Dilsukhnagar: Sai Baba temple road | dilsukhnagar | 13440 | 7469 | 22 | 17.36809, 78.53430 | low |  |
| `giver_erragadda` | Erragadda Rythu Bazaar | erragadda | 6054 | 1302 | 22 | 17.45532, 78.43352 | low |  |
| `giver_falaknuma` | Falaknuma: palace road | falaknuma | 8574 | 10118 | 22 | 17.33348, 78.46985 | low |  |
| `giver_golconda` | Golconda: Fateh Darwaza approach | golconda | 4179 | 6581 | 22 | 17.37930, 78.40850 | low |  |
| `giver_himayatnagar` | Himayatnagar: outside Café Gulistan | himayatnagar | 9830 | 5137 | 22 | 17.39709, 78.48542 | low |  |
| `giver_hitec` | Cyber Towers road | hitec | 2692 | 1611 | 22 | 17.45040, 78.38124 | low |  |
| `giver_hussain_sagar` | Tank Bund: by the statues | hussain_sagar | 9627 | 3284 | 22 | 17.41982, 78.48282 | low |  |
| `giver_jubilee` | Jubilee Hills Check Post | jubilee | 4568 | 2956 | 22 | 17.42912, 78.41278 | low |  |
| `giver_kachiguda` | Kachiguda station road | kachiguda | 11008 | 5839 | 22 | 17.38902, 78.49891 | low |  |
| `giver_khairatabad` | Khairatabad: Ganesh ground | khairatabad | 7683 | 4052 | 22 | 17.41030, 78.46300 | low |  |
| `giver_koti` | Koti: by the bus stand | koti | 9891 | 6141 | 22 | 17.38525, 78.48390 | low |  |
| `giver_langar_houz` | Langar Houz | golconda | 4847 | 6638 | 22 | 17.37850, 78.42000 | medium |  |
| `giver_lb_nagar` | LB Nagar circle | lb_nagar | 14401 | 8914 | 22 | 17.34780, 78.55150 | low |  |
| `giver_malakpet` | Malakpet: Hotel Daulat | malakpet | 11891 | 7261 | 22 | 17.37190, 78.50967 | low |  |
| `giver_marredpally` | Marredpally | marredpally | 11584 | 1412 | 22 | 17.44900, 78.50950 | low |  |
| `giver_masab_tank` | Masab Tank junction | masab_tank | 7230 | 4813 | 22 | 17.40083, 78.45601 | low |  |
| `giver_musheerabad` | Musheerabad | musheerabad | 10988 | 3656 | 22 | 17.41600, 78.49880 | low |  |
| `giver_nampally` | Nampally: station road | nampally | 8067 | 5463 | 22 | 17.39241, 78.46764 | low |  |
| `giver_osmania` | OU Arts College road | osmania | 12945 | 3771 | 22 | 17.41700, 78.52500 | low |  |
| `giver_puranapul` | Purana Pul: Jumerat Bazaar | puranapul | 7341 | 7430 | 22 | 17.36880, 78.45900 | low |  |
| `giver_rtc_x` | RTC X Roads: under the film hoardings | himayatnagar | 10819 | 4327 | 22 | 17.40552, 78.49515 | low |  |
| `giver_saidabad` | Saidabad | saidabad | 11906 | 8232 | 22 | 17.35923, 78.51086 | low |  |
| `giver_secunderabad` | Clock Tower road | secunderabad | 10797 | 1859 | 22 | 17.44044, 78.49888 | low |  |
| `giver_tolichowki` | Tolichowki: Hotel Sohail | tolichowki | 5148 | 5256 | 22 | 17.39733, 78.42474 | low |  |

#### hidden (41)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `hide_airport_fence` | Begumpet airport fence | begumpet | 9004 | 1424 | 12 | 17.45080, 78.47350 | low |  |
| `hide_ashok_nagar_ground` | Ashok Nagar ground corner | musheerabad | 9891 | 4391 | 12 | 17.40498, 78.48565 | low |  |
| `hide_banjara_lake` | Banjara Lake edge | banjara | 6601 | 4128 | 12 | 17.41030, 78.44650 | medium |  |
| `hide_chaderghat_sand` | Chaderghat riverbed | chaderghat | 10361 | 6707 | 12 | 17.37870, 78.48900 | low |  |
| `hide_charminar_corner` | Charminar plaza, south-east corner | charminar | 9128 | 8380 | 12 | 17.36122, 78.47509 | medium |  |
| `hide_chowmahalla_wall` | Chowmahalla outer wall | charminar | 8526 | 8652 | 12 | 17.35798, 78.47085 | low |  |
| `hide_clock_tower_park` | Clock Tower park bench | secunderabad | 10803 | 1832 | 12 | 17.44094, 78.49836 | low |  |
| `hide_cyber_fountain` | Cyber Towers forecourt | hitec | 2552 | 1760 | 12 | 17.45026, 78.38109 | low |  |
| `hide_durgam_rocks` | Durgam Cheruvu rocks | hitec | 3232 | 3243 | 12 | 17.42620, 78.39120 | low |  |
| `hide_falaknuma_hill` | Falaknuma hill path | falaknuma | 8422 | 10191 | 12 | 17.33204, 78.46788 | low |  |
| `hide_gachibowli` | Gachibowli stadium car park | hitec | 588 | 1973 | 12 | 17.44579, 78.34526 | low |  |
| `hide_golconda_bastion` | Golconda, a quiet bastion | golconda | 3495 | 6411 | 12 | 17.38120, 78.39580 | low |  |
| `hide_golconda_court` | Golconda inner court | golconda | 3828 | 6265 | 12 | 17.38360, 78.40270 | low |  |
| `hide_gulzar_houz_ledge` | Gulzar Houz, fountain ledge | charminar | 9072 | 8082 | 12 | 17.36333, 78.47500 | high |  |
| `hide_home_colony_ground` | Colony ground, under the slide | himayatnagar | 10262 | 5040 | 12 | 17.39754, 78.49070 | low |  |
| `hide_home_lane` | Behind the colony water tank | himayatnagar | 10313 | 4896 | 12 | 17.40014, 78.49166 | low |  |
| `hide_indira_rock` | Indira Park rock garden | musheerabad | 9704 | 3704 | 12 | 17.41421, 78.48370 | low |  |
| `hide_kbr_trail` | KBR Park trail | banjara | 4760 | 3734 | 12 | 17.41800, 78.41700 | low |  |
| `hide_lb_stand` | LB Stadium, behind the west stand | basheerbagh | 8562 | 4820 | 12 | 17.39975, 78.47225 | low |  |
| `hide_lumbini_hedge` | Lumbini Park hedge maze corner | hussain_sagar | 8583 | 4109 | 12 | 17.40930, 78.47160 | low |  |
| `hide_mecca_masjid_pigeons` | Pigeon square by Mecca Masjid | charminar | 9014 | 8484 | 12 | 17.36074, 78.47382 | medium |  |
| `hide_mir_alam` | Mir Alam Tank bank | zoo | 6760 | 9215 | 12 | 17.34600, 78.44750 | low |  |
| `hide_mj_steps` | Mozamjahi Market back steps | nampally | 8711 | 6159 | 12 | 17.38440, 78.47330 | medium |  |
| `hide_moula_ali` | Moula Ali hill steps | marredpally | 14796 | 632 | 12 | 17.46440, 78.55780 | low |  |
| `hide_nallakunta_ground` | Nallakunta ground, behind the stumps | amberpet | 12123 | 5571 | 12 | 17.39263, 78.51270 | low |  |
| `hide_nayapul_sand` | Under Naya Pul, on the sand | afzalgunj | 8928 | 7280 | 12 | 17.37045, 78.47480 | medium |  |
| `hide_ntr_lawn` | NTR Gardens, under the big tree | khairatabad | 8237 | 3869 | 12 | 17.41249, 78.46806 | low |  |
| `hide_numaish_corner` | Numaish grounds, behind the giant wheel | nampally | 8138 | 5769 | 12 | 17.38827, 78.46828 | low |  |
| `hide_ou_campus` | OU campus boulder | osmania | 13160 | 3884 | 12 | 17.41500, 78.53000 | low |  |
| `hide_parade_grounds` | Parade Grounds, far corner | marredpally | 10643 | 1297 | 12 | 17.44850, 78.49650 | low |  |
| `hide_public_gardens_tree` | Public Gardens, banyan roots | basheerbagh | 8253 | 4993 | 12 | 17.39780, 78.46880 | medium |  |
| `hide_puranapul_sand` | Purana Pul riverbed | charminar | 7375 | 7653 | 12 | 17.36680, 78.45920 | medium |  |
| `hide_race_course` | Malakpet race course rail | malakpet | 11537 | 7422 | 12 | 17.37000, 78.50450 | low |  |
| `hide_safilguda` | Safilguda lake bank | marredpally | 13284 | 687 | 12 | 17.46300, 78.53500 | medium |  |
| `hide_sanjeevaiah_bench` | Sanjeevaiah Park, last bench | hussain_sagar | 8885 | 2602 | 12 | 17.42920, 78.47480 | low |  |
| `hide_saroornagar_lake` | Saroornagar Lake bank | lb_nagar | 13137 | 8487 | 12 | 17.35450, 78.52880 | medium |  |
| `hide_shilparamam_hut` | Shilparamam craft hut | hitec | 2487 | 1541 | 12 | 17.45159, 78.37786 | low |  |
| `hide_taramati` | Taramati Baradari steps | langar_houz | 2430 | 6836 | 12 | 17.37585, 78.37821 | low |  |
| `hide_tombs_garden` | Qutb Shahi Tombs garden | golconda | 3336 | 5620 | 12 | 17.39364, 78.39554 | low |  |
| `hide_vidyanagar_ground` | Vidyanagar ground corner | kachiguda | 11511 | 5070 | 12 | 17.39839, 78.50393 | low |  |
| `hide_zoo_pond` | Nehru Zoo, by the pond | zoo | 6745 | 8905 | 12 | 17.35050, 78.44800 | low |  |

#### home (2)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `friend_home` | Best friend's house | himayatnagar | 10307 | 4992 | 16 | 17.39840, 78.49155 | low |  |
| `home` | Home (Lakshmi Nivas, Lakshmi Nagar Colony) | himayatnagar | 10108 | 4959 | 20 | 17.39900, 78.48780 | low |  |

#### internet_cafe (6)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `internet_cafe_1` | Cyber Zone Browsing Centre | himayatnagar | 9504 | 4782 | 18 | 17.40102, 78.48191 | low |  |
| `internet_cafe_2` | Netway Internet Browsing | abids | 8918 | 6102 | 18 | 17.38431, 78.47516 | low |  |
| `internet_cafe_3` | Info Highway Browsing Centre | ameerpet | 6778 | 2298 | 18 | 17.43586, 78.44608 | low |  |
| `internet_cafe_4` | Sify iWay-style Browsing Centre | marredpally | 11482 | 2339 | 18 | 17.43556, 78.50765 | low |  |
| `internet_cafe_5` | Campus Net Cafe | osmania | 13255 | 3034 | 18 | 17.42692, 78.53205 | low |  |
| `internet_cafe_6` | Dial-Up Dreams Net Cafe | dilsukhnagar | 12963 | 7668 | 18 | 17.36563, 78.52659 | low |  |

#### irani_cafe (29)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `alpha_hotel` | Alpha Hotel | secunderabad | 11015 | 2301 | 18 | 17.43520, 78.50040 | medium |  |
| `blue_sea_cafe` | Blue Sea Tea & Snacks | secunderabad | 11247 | 2261 | 18 | 17.43680, 78.50400 | medium |  |
| `cafe_bahar` | Cafe Bahar | himayatnagar | 9092 | 4751 | 18 | 17.39983, 78.47788 | high |  |
| `cafe_noor_e_iran` | Café Noor-e-Iran (Faramarz uncle) | charminar | 9009 | 8014 | 18 | 17.36358, 78.47460 | low | alias of `irani_cafe_19` |
| `garden_cafe` | Garden Cafe | secunderabad | 10815 | 1918 | 30 | 17.44044, 78.49794 | medium |  |
| `grand_hotel` | Grand Hotel | abids | 9027 | 5900 | 18 | 17.38791, 78.47622 | low |  |
| `grand_hotel_abids` | Grand Hotel, Abids | abids | 9027 | 5900 | 18 | 17.38791, 78.47622 | low | alias of `grand_hotel` |
| `irani_cafe_1` | Nimrah Cafe (facing Charminar) | charminar | 8931 | 8151 | 22 | 17.36199, 78.47448 | medium | alias of `nimrah_cafe` |
| `irani_cafe_2` | Grand Hotel, Abids | abids | 9027 | 5900 | 18 | 17.38791, 78.47622 | low | alias of `grand_hotel` |
| `irani_cafe_3` | Cafe Bahar, Basheerbagh | himayatnagar | 9092 | 4751 | 18 | 17.39983, 78.47788 | high | alias of `cafe_bahar` |
| `irani_cafe_4` | Niloufer Cafe, Lakdikapul | masab_tank | 7798 | 4651 | 30 | 17.40250, 78.46360 | low | alias of `niloufer_cafe` |
| `irani_cafe_5` | Garden Cafe, Clock Tower | secunderabad | 10815 | 1918 | 30 | 17.44044, 78.49794 | medium | alias of `garden_cafe` |
| `irani_cafe_6` | Alpha Hotel, Secunderabad | secunderabad | 11015 | 2301 | 18 | 17.43520, 78.50040 | medium | alias of `alpha_hotel` |
| `irani_cafe_7` | Café Gulistan | himayatnagar | 9844 | 5156 | 18 | 17.39654, 78.48512 | low |  |
| `irani_cafe_8` | Cafe Shalimar | rtc_x | 10885 | 4639 | 18 | 17.40257, 78.49548 | low |  |
| `irani_cafe_9` | Cafe Kohinoor | kachiguda | 10899 | 5560 | 18 | 17.39216, 78.49631 | low |  |
| `irani_cafe_10` | Hotel Sohail | tolichowki | 5139 | 5247 | 18 | 17.39724, 78.42455 | low |  |
| `irani_cafe_11` | Cafe Firdaus | ameerpet | 6956 | 2378 | 18 | 17.43486, 78.44881 | low |  |
| `irani_cafe_12` | Cafe Bholakpur | musheerabad | 10891 | 3708 | 18 | 17.41641, 78.49713 | low |  |
| `irani_cafe_13` | Hotel Daulat | malakpet | 11368 | 7072 | 18 | 17.37349, 78.50402 | low |  |
| `irani_cafe_14` | Cafe Golden Star | dilsukhnagar | 13349 | 7395 | 18 | 17.36852, 78.53279 | low |  |
| `irani_cafe_15` | Cafe Gulzar | charminar | 8954 | 8070 | 18 | 17.36351, 78.47429 | low |  |
| `irani_cafe_16` | Cafe Sohrab | tolichowki | 6273 | 5131 | 18 | 17.39750, 78.44280 | low |  |
| `irani_cafe_17` | Blue Sea Tea & Snacks, Regimental Bazaar | secunderabad | 11247 | 2261 | 18 | 17.43680, 78.50400 | medium | alias of `blue_sea_cafe` |
| `irani_cafe_18` | Sarvi, Banjara Hills | banjara | 6919 | 3946 | 18 | 17.41280, 78.45050 | low | alias of `sarvi` |
| `irani_cafe_19` | Café Noor-e-Iran | charminar | 9009 | 8014 | 18 | 17.36358, 78.47460 | low |  |
| `niloufer_cafe` | Niloufer Cafe | masab_tank | 7798 | 4651 | 30 | 17.40250, 78.46360 | low |  |
| `nimrah_cafe` | Nimrah Cafe | charminar | 8931 | 8151 | 22 | 17.36199, 78.47448 | medium |  |
| `sarvi` | Sarvi | banjara | 6919 | 3946 | 18 | 17.41280, 78.45050 | low |  |

#### iyengar_bakery (4)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `iyengar_bakery_1` | Sri Krishna Iyengar Bakery | kachiguda | 11004 | 5315 | 18 | 17.39479, 78.49556 | low |  |
| `iyengar_bakery_2` | Sri Iyengar Bakery | secunderabad | 11354 | 1838 | 18 | 17.44150, 78.50650 | low |  |
| `iyengar_bakery_3` | Sri Venkateswara Iyengar Bakery | malakpet | 12728 | 7398 | 18 | 17.36701, 78.52144 | low |  |
| `iyengar_bakery_4` | Bangalore Iyengar Bakery | banjara | 6955 | 2748 | 18 | 17.43016, 78.45013 | low |  |

#### jetty (2)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `lumbini_boat` | Lumbini boat jetty | hussain_sagar | 8699 | 4008 | 14 | 17.41030, 78.47320 | medium | alias of `lumbini_jetty` |
| `lumbini_jetty` | Lumbini boat jetty | hussain_sagar | 8699 | 4008 | 14 | 17.41030, 78.47320 | medium | boat |

#### junction (25)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `abids` | Abids Circle | abids | 8994 | 5811 | 40 | 17.38827, 78.47636 | medium | podium |
| `ameerpet` | Ameerpet | khairatabad | 6702 | 2450 | 30 | 17.43450, 78.44570 | medium | podium |
| `banjara_hills` | Banjara Hills Road No. 1 | banjara | 6748 | 3794 | 30 | 17.41380, 78.44820 | low |  |
| `basheerbagh` | Basheerbagh | himayatnagar | 9046 | 4792 | 30 | 17.39980, 78.47700 | medium | podium |
| `begumpet` | Begumpet | ameerpet | 7568 | 2085 | 30 | 17.43850, 78.45750 | medium | podium |
| `dilsukhnagar` | Dilsukhnagar | dilsukhnagar | 12853 | 7446 | 30 | 17.36900, 78.52470 | medium | podium |
| `erragadda` | Erragadda | erragadda | 6019 | 1104 | 30 | 17.45650, 78.43380 | medium | podium |
| `jubilee_hills` | Jubilee Hills Check Post | jubilee | 4532 | 2963 | 30 | 17.42930, 78.41250 | medium | podium |
| `jubilee_hills_check_post` | Jubilee Hills Check Post | jubilee | 4532 | 2963 | 30 | 17.42930, 78.41250 | medium | alias of `jubilee_hills` |
| `khairatabad` | Khairatabad | khairatabad | 7649 | 3996 | 30 | 17.41120, 78.46120 | medium | podium |
| `king_koti` | King Koti | himayatnagar | 9871 | 5327 | 30 | 17.39300, 78.48500 | low |  |
| `koti` | Koti | abids | 9825 | 6145 | 40 | 17.38564, 78.48371 | medium | podium |
| `lakdikapul` | Lakdikapul | masab_tank | 7899 | 4518 | 30 | 17.40400, 78.46450 | high | podium |
| `lb_nagar` | LB Nagar | lb_nagar | 14457 | 8876 | 30 | 17.34843, 78.55096 | medium |  |
| `liberty` | Liberty junction | basheerbagh | 9015 | 4430 | 30 | 17.40483, 78.47671 | medium | podium |
| `malakpet` | Malakpet | malakpet | 10900 | 6862 | 30 | 17.37700, 78.49550 | medium | podium |
| `masab_tank` | Masab Tank | masab_tank | 7239 | 4795 | 30 | 17.40110, 78.45610 | medium | podium |
| `mehdipatnam` | Mehdipatnam | tolichowki | 6087 | 5343 | 30 | 17.39500, 78.43980 | medium | podium |
| `narayanguda_ymca` | Narayanguda YMCA (Sadar festival) | kachiguda | 10380 | 5363 | 24 | 17.39450, 78.49050 | low |  |
| `panjagutta` | Panjagutta | khairatabad | 7152 | 2925 | 30 | 17.42650, 78.45260 | high | podium |
| `ranigunj` | Ranigunj | hussain_sagar | 9991 | 2606 | 26 | 17.43000, 78.48850 | low | podium |
| `rtc_x_roads` | RTC X Roads | rtc_x | 10860 | 4438 | 60 | 17.40520, 78.49600 | medium | podium |
| `tarnaka` | Tarnaka | osmania | 13403 | 3165 | 30 | 17.42520, 78.53450 | medium | podium |
| `tolichowki` | Tolichowki | tolichowki | 4621 | 5140 | 30 | 17.39860, 78.41580 | medium | podium |
| `uppal` | Uppal | amberpet | 14951 | 5081 | 30 | 17.39950, 78.55900 | low |  |

#### kirana (20)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `kirana_1` | Sri Lakshmi Kirana & General Stores | himayatnagar | 10227 | 4926 | 18 | 17.39960, 78.49004 | low |  |
| `kirana_2` | Balaji General Stores | himayatnagar | 9499 | 4808 | 18 | 17.39966, 78.48136 | low |  |
| `kirana_3` | Ganesh Provisions | himayatnagar | 10133 | 4327 | 18 | 17.40602, 78.48830 | low |  |
| `kirana_4` | Durga Kirana | rtc_x | 11190 | 5035 | 18 | 17.39884, 78.49963 | low |  |
| `kirana_5` | Annapurna Kirana | kachiguda | 11638 | 5375 | 18 | 17.39470, 78.50482 | low |  |
| `kirana_6` | Sai Ram Kirana | amberpet | 12173 | 5337 | 18 | 17.39542, 78.51383 | low |  |
| `kirana_7` | Hanuman Kirana | masab_tank | 7503 | 4833 | 18 | 17.40038, 78.45939 | low |  |
| `kirana_8` | Noor Kirana & Provisions | tolichowki | 5071 | 5330 | 18 | 17.39643, 78.42314 | low |  |
| `kirana_9` | Mahalakshmi General Stores | khairatabad | 6541 | 2307 | 18 | 17.43748, 78.44259 | low |  |
| `kirana_10` | Raju Kirana | erragadda | 6045 | 1286 | 18 | 17.45352, 78.43550 | low |  |
| `kirana_11` | Prakash Nagar Stores | begumpet | 8023 | 1727 | 18 | 17.44400, 78.46280 | low |  |
| `kirana_12` | Ali Kirana & Provisions | musheerabad | 10686 | 3374 | 18 | 17.42050, 78.49560 | low |  |
| `kirana_13` | Joseph General Stores | marredpally | 11590 | 1413 | 18 | 17.44981, 78.50931 | low |  |
| `kirana_14` | Railway Colony Stores | osmania | 12708 | 2695 | 18 | 17.43059, 78.52332 | low |  |
| `kirana_15` | Laxmi Narasimha Kirana | chaderghat | 10990 | 7472 | 18 | 17.37020, 78.49640 | low |  |
| `kirana_16` | Sri Venkateshwara Kirana | dilsukhnagar | 13016 | 7582 | 18 | 17.36644, 78.52853 | low |  |
| `kirana_17` | Saidabad Kirana | saidabad | 11935 | 8267 | 18 | 17.35850, 78.51250 | low |  |
| `kirana_18` | Hyderabad Kirana | afzalgunj | 8668 | 7605 | 18 | 17.36798, 78.47253 | low |  |
| `kirana_19` | Chandrayangutta Kirana | chandrayangutta | 9530 | 10406 | 18 | 17.32600, 78.48250 | low |  |
| `kirana_20` | Kothapet Kirana | dilsukhnagar | 14013 | 7771 | 18 | 17.36371, 78.54497 | low |  |

#### kite_stall (3)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `kite_stall_1` | Kite stall | charminar | 9151 | 8005 | 18 | 17.36356, 78.47538 | low |  |
| `kite_stall_2` | Kite stall | charminar | 9149 | 8053 | 18 | 17.36338, 78.47589 | low |  |
| `kite_stall_3` | Kite stall | charminar | 9201 | 8038 | 18 | 17.36360, 78.47622 | low |  |

#### landmark (59)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `all_india_radio` | All India Radio, Saifabad | khairatabad | 7957 | 4448 | 18 | 17.40550, 78.46500 | low |  |
| `annapurna_studios` | Annapurna Studios | jubilee | 5155 | 3003 | 26 | 17.42900, 78.42250 | low |  |
| `apollo_hospital_jubilee_hills` | Apollo Hospital, Jubilee Hills | jubilee | 4489 | 3960 | 20 | 17.41500, 78.41370 | medium |  |
| `assembly` | Legislative Assembly | basheerbagh | 8343 | 4824 | 26 | 17.40050, 78.46950 | medium |  |
| `badshahi_ashurkhana` | Badshahi Ashurkhana | afzalgunj | 9055 | 7418 | 16 | 17.36909, 78.47573 | high |  |
| `bapu_ghat` | Bapu Ghat (Gandhi memorial) | langar_houz | 4496 | 7097 | 18 | 17.37200, 78.41400 | medium |  |
| `buddha_statue` | Buddha Statue | hussain_sagar | 8895 | 3628 | 14 | 17.41556, 78.47503 | high | boat |
| `charminar` | Charminar | charminar | 9020 | 8202 | 70 | 17.36163, 78.47467 | high | FINALE |
| `chowmahalla_palace` | Chowmahalla Palace gate | charminar | 8706 | 8548 | 22 | 17.35929, 78.47208 | medium |  |
| `city_central_library` | City Central Library, Chikkadpally | himayatnagar | 10779 | 4768 | 16 | 17.40120, 78.49420 | low |  |
| `city_college` | Government City College | afzalgunj | 8326 | 7438 | 20 | 17.36859, 78.46961 | medium |  |
| `cyber_towers` | Cyber Towers | hitec | 2622 | 1760 | 30 | 17.45040, 78.38100 | medium |  |
| `doordarshan_kendra` | Doordarshan Kendra, Ramanthapur | amberpet | 13389 | 5435 | 24 | 17.39550, 78.53300 | low |  |
| `errum_manzil` | Errum Manzil (gate) | khairatabad | 7315 | 3410 | 18 | 17.41944, 78.45500 | medium |  |
| `falaknuma_palace` | Falaknuma Palace gate | falaknuma | 8514 | 10179 | 24 | 17.33050, 78.46750 | high |  |
| `film_nagar` | Film Nagar | jubilee | 4255 | 3997 | 30 | 17.41472, 78.40889 | medium |  |
| `gachibowli_stadium` | Gachibowli Stadium | hitec | 551 | 1803 | 30 | 17.44678, 78.34470 | high |  |
| `gandhi_statue_assembly` | Gandhi statue, Assembly lawn | basheerbagh | 8372 | 4834 | 12 | 17.40020, 78.47010 | low |  |
| `golconda_bala_hissar` | Bala Hissar pavilion | golconda | 3717 | 6377 | 22 | 17.38306, 78.40111 | medium |  |
| `golconda_fateh_darwaza` | Fateh Darwaza (clap here) | golconda | 4096 | 6544 | 16 | 17.38000, 78.40750 | low | minigame golconda_clap |
| `golconda_fort` | Golconda Fort | golconda | 4164 | 6514 | 30 | 17.38320, 78.40420 | medium |  |
| `golconda_sound_light` | Sound & light show seats | golconda | 3881 | 6309 | 20 | 17.38300, 78.40360 | low |  |
| `gpo` | General Post Office, Abids | abids | 8885 | 5846 | 30 | 17.38800, 78.47650 | medium |  |
| `gulzar_houz` | Gulzar Houz | charminar | 9052 | 8012 | 30 | 17.36333, 78.47500 | high |  |
| `high_court` | High Court | afzalgunj | 8612 | 7467 | 30 | 17.36918, 78.47204 | high |  |
| `hill_fort_palace` | Hill Fort Palace (locked) | basheerbagh | 8588 | 4545 | 18 | 17.40400, 78.47220 | low |  |
| `hitec_city` | HITEC City | hitec | 2754 | 2201 | 50 | 17.44170, 78.38260 | medium |  |
| `hitex` | HITEX Exhibition Centre (opens Jan 2003) | hitec | 2331 | 270 | 30 | 17.47170, 78.37500 | medium |  |
| `hussain_sagar` | Hussain Sagar (Lumbini shore) | hussain_sagar | 8708 | 4014 | 200 | 17.41050, 78.47330 | high | boat |
| `jawahar_bal_bhavan` | Jawahar Bal Bhavan | basheerbagh | 8370 | 5052 | 18 | 17.39700, 78.46980 | low |  |
| `jntu_kukatpally` | JNTU, Kukatpally | balanagar | 5458 | 206 | 22 | 17.49665, 78.39252 | medium |  |
| `king_kothi` | King Kothi Palace (gated) | himayatnagar | 9852 | 5437 | 18 | 17.39250, 78.48450 | low |  |
| `koti_womens_college` | Koti Women's College (British Residency) | koti | 9946 | 6223 | 30 | 17.38372, 78.48475 | high |  |
| `lb_stadium` | Lal Bahadur Stadium (west gate) | basheerbagh | 8563 | 4880 | 30 | 17.39933, 78.47180 | medium |  |
| `lower_tank_bund` | Lower Tank Bund | hussain_sagar | 9561 | 3407 | 30 | 17.42000, 78.48600 | low |  |
| `moula_ali_dargah` | Moula Ali Dargah | marredpally | 14874 | 638 | 20 | 17.46500, 78.55900 | low |  |
| `nampally_exhibition` | Nampally Exhibition (Numaish) | nampally | 8283 | 5824 | 60 | 17.38800, 78.46950 | low | Jan 1 - mid Feb |
| `necklace_road` | Necklace Road | hussain_sagar | 7973 | 3037 | 40 | 17.42350, 78.46400 | medium |  |
| `nims_hospital` | NIMS Hospital | khairatabad | 7002 | 3262 | 22 | 17.42180, 78.45200 | high |  |
| `nizam_college` | Nizam College | basheerbagh | 8867 | 4839 | 22 | 17.39950, 78.47600 | medium |  |
| `osmania_hospital` | Osmania General Hospital | afzalgunj | 8761 | 7133 | 30 | 17.37290, 78.47350 | medium |  |
| `osmania_university` | Osmania University Arts College | osmania | 12840 | 3650 | 40 | 17.41897, 78.52660 | medium |  |
| `paigah_tombs` | Paigah Tombs | chandrayangutta | 11314 | 9391 | 18 | 17.34390, 78.50410 | high |  |
| `qutb_shahi_tombs` | Qutb Shahi Tombs | golconda | 3456 | 5440 | 30 | 17.39500, 78.39610 | high |  |
| `raj_bhavan` | Raj Bhavan | khairatabad | 7708 | 3414 | 20 | 17.41890, 78.46020 | medium |  |
| `ramakrishna_math` | Ramakrishna Math, Domalguda | musheerabad | 9641 | 3828 | 20 | 17.41180, 78.48200 | low |  |
| `ramanaidu_studios` | Ramanaidu Studios | jubilee | 4076 | 4073 | 20 | 17.41350, 78.40600 | low |  |
| `rashtrapati_nilayam` | Rashtrapati Nilayam (gated) | marredpally | 11193 | 315 | 22 | 17.51100, 78.51000 | low |  |
| `ravindra_bharathi` | Ravindra Bharathi | khairatabad | 8101 | 4547 | 22 | 17.40330, 78.46720 | medium |  |
| `sarathi_studios` | Sarathi Studios | khairatabad | 6463 | 2574 | 20 | 17.43350, 78.44200 | low |  |
| `sarojini_devi_eye_hospital` | Sarojini Devi Eye Hospital | masab_tank | 6332 | 5025 | 18 | 17.39890, 78.44360 | medium |  |
| `secretariat` | Secretariat | khairatabad | 8402 | 4024 | 24 | 17.41000, 78.47000 | high |  |
| `secunderabad_clock_tower` | Secunderabad Clock Tower | secunderabad | 10825 | 1863 | 26 | 17.44080, 78.49850 | high |  |
| `secunderabad_club` | Secunderabad Club (members only) | marredpally | 10750 | 1195 | 18 | 17.45080, 78.49950 | low |  |
| `state_central_library` | State Central Library | afzalgunj | 9310 | 7027 | 30 | 17.37420, 78.47830 | high |  |
| `tank_bund` | Tank Bund | hussain_sagar | 9438 | 3464 | 40 | 17.41687, 78.48119 | high |  |
| `tank_bund_statues` | Tank Bund statues | hussain_sagar | 9439 | 3463 | 30 | 17.41757, 78.48169 | medium |  |
| `taramati_baradari` | Taramati Baradari | langar_houz | 2415 | 6843 | 20 | 17.37608, 78.37812 | medium |  |
| `university_of_hyderabad` | University of Hyderabad (gate) | hitec | 104 | 1371 | 20 | 17.45650, 78.33450 | low |  |

#### market (18)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `abids_book_market` | Abids Sunday book market | abids | 9010 | 5731 | 26 | 17.38909, 78.47650 | low |  |
| `begum_bazaar` | Begum Bazaar | afzalgunj | 8432 | 6908 | 30 | 17.37500, 78.47060 | medium |  |
| `chappal_bazar` | Chappal Bazar (by Kachiguda station) | kachiguda | 11108 | 5877 | 24 | 17.38875, 78.49825 | low |  |
| `chenoy_trade_centre` | Chenoy Trade Centre (CTC) | begumpet | 10204 | 1911 | 18 | 17.43950, 78.49150 | low |  |
| `dhoolpet` | Dhoolpet (Ganesh idol lanes, manja makers) | puranapul | 7528 | 6970 | 30 | 17.37444, 78.46083 | medium |  |
| `gaddiannaram_fruit_market` | Gaddiannaram Fruit Market | dilsukhnagar | 13453 | 7607 | 26 | 17.36600, 78.53400 | low |  |
| `general_bazaar` | General Bazaar | secunderabad | 10462 | 2076 | 26 | 17.43760, 78.49450 | low |  |
| `koti_book_bazaar` | Koti pavement book bazaar | koti | 9785 | 6103 | 18 | 17.38545, 78.48320 | low |  |
| `laad_bazaar` | Laad Bazaar (Chudi Bazaar) | charminar | 8766 | 8233 | 30 | 17.36190, 78.47280 | medium |  |
| `mahboob_chowk_clock_tower` | Mahboob Chowk & Murgi Chowk | charminar | 8494 | 8258 | 20 | 17.36179, 78.47095 | high |  |
| `monda_market` | Monda Market | secunderabad | 10679 | 2312 | 30 | 17.43417, 78.49667 | high |  |
| `mozamjahi_market` | Mozamjahi Market | nampally | 8625 | 6165 | 30 | 17.38450, 78.47350 | medium |  |
| `patang_bazaar` | Patang Bazaar (kite stalls) | charminar | 9104 | 8116 | 20 | 17.36347, 78.47566 | low |  |
| `pathergatti` | Pathergatti & Madina Building | afzalgunj | 8852 | 7616 | 30 | 17.36520, 78.47470 | medium |  |
| `rythu_bazaar_erragadda` | Rythu Bazaar, Erragadda | erragadda | 5936 | 1220 | 30 | 17.45551, 78.43342 | low | Rythu Bazaars since 1999 |
| `rythu_bazaar_mehdipatnam` | Rythu Bazaar, Mehdipatnam | tolichowki | 6206 | 5419 | 30 | 17.39510, 78.44110 | medium | Rythu Bazaars since 1999 |
| `rythu_bazaar_saroornagar` | Rythu Bazaar, Kothapet | dilsukhnagar | 13971 | 7568 | 30 | 17.36600, 78.54200 | low | Rythu Bazaars since 1999 |
| `sultan_bazaar` | Sultan Bazaar | koti | 9871 | 5904 | 30 | 17.38780, 78.48420 | low |  |

#### meat_shop (7)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `meat_shop_1` | Fresh Chicken & Mutton | rtc_x | 11680 | 4893 | 18 | 17.40056, 78.50689 | low |  |
| `meat_shop_2` | Al-Habeeb Chicken Centre | tolichowki | 4977 | 5297 | 18 | 17.39634, 78.42182 | low |  |
| `meat_shop_3` | New Mutton Shop | erragadda | 6026 | 1313 | 18 | 17.45442, 78.43394 | low |  |
| `meat_shop_4` | Malakpet Mutton Shop | malakpet | 11010 | 8089 | 18 | 17.36197, 78.49784 | low |  |
| `meat_shop_5` | Kothapet Chicken & Mutton | dilsukhnagar | 13928 | 7581 | 18 | 17.36700, 78.54350 | low |  |
| `meat_shop_6` | Murgi Chowk Chicken Centre | charminar | 8427 | 8207 | 18 | 17.36210, 78.47053 | low |  |
| `meat_shop_7` | Bholakpur Chicken Centre | musheerabad | 10737 | 3445 | 18 | 17.41849, 78.49600 | low |  |

#### medical_shop (8)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `medical_shop_1` | Life Line Medicals | himayatnagar | 9671 | 5071 | 18 | 17.39659, 78.48328 | low |  |
| `medical_shop_2` | Sri Venkateswara Medical Hall | koti | 10105 | 5911 | 18 | 17.38706, 78.48579 | low |  |
| `medical_shop_3` | Care Medicals | abids | 8992 | 6198 | 18 | 17.38411, 78.47653 | low |  |
| `medical_shop_4` | Marredpally Medicals | secunderabad | 11799 | 1523 | 18 | 17.44954, 78.51308 | low |  |
| `medical_shop_5` | Malakpet Medicals | malakpet | 11627 | 7205 | 18 | 17.37275, 78.50625 | low |  |
| `medical_shop_6` | Sri Sai Medicals | malakpet | 12752 | 7382 | 18 | 17.36766, 78.52145 | low |  |
| `medical_shop_7` | Banjara Medicals | banjara | 6519 | 3658 | 18 | 17.41680, 78.44450 | low |  |
| `medical_shop_8` | Sai Medical & General Stores | himayatnagar | 10358 | 4954 | 18 | 17.39909, 78.49251 | low |  |

#### mosque (14)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `jama_masjid_charminar` | Jama Masjid (Charminar) | charminar | 9108 | 8194 | 14 | 17.36220, 78.47500 | medium |  |
| `khairatabad_mosque` | Khairatabad Mosque | khairatabad | 7854 | 4185 | 18 | 17.40858, 78.46328 | medium |  |
| `mecca_masjid` | Mecca Masjid | charminar | 8944 | 8398 | 30 | 17.36060, 78.47330 | high |  |
| `mosque_1` | Mallepally Masjid | nampally | 7671 | 5568 | 18 | 17.39175, 78.46158 | low |  |
| `mosque_2` | Tolichowki Masjid | tolichowki | 5256 | 5340 | 18 | 17.39534, 78.42794 | low |  |
| `mosque_3` | Musheerabad Jama Masjid | musheerabad | 11172 | 3683 | 18 | 17.41600, 78.50300 | low |  |
| `mosque_4` | Malakpet Masjid | malakpet | 11032 | 7857 | 18 | 17.36517, 78.49792 | low |  |
| `mosque_5` | Saidabad Masjid | saidabad | 11904 | 8403 | 18 | 17.35620, 78.50980 | low |  |
| `mosque_6` | Shah Ali Banda Masjid | falaknuma | 8625 | 9183 | 18 | 17.35050, 78.47180 | low |  |
| `mosque_7` | Falaknuma Masjid | falaknuma | 8983 | 10052 | 18 | 17.33499, 78.47614 | low |  |
| `mosque_8` | Begum Bazaar Masjid | puranapul | 8322 | 6798 | 18 | 17.37519, 78.47048 | low |  |
| `mosque_9` | Khairatabad Mosque | khairatabad | 7854 | 4185 | 18 | 17.40858, 78.46328 | medium | alias of `khairatabad_mosque` |
| `mosque_10` | Jama Masjid (Charminar) | charminar | 9108 | 8194 | 14 | 17.36220, 78.47500 | medium | alias of `jama_masjid_charminar` |
| `spanish_mosque` | Spanish Mosque | begumpet | 8758 | 1769 | 20 | 17.44381, 78.47262 | medium |  |

#### museum (4)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `birla_planetarium` | Birla Planetarium & Science Museum | basheerbagh | 8423 | 4477 | 30 | 17.40470, 78.47030 | low |  |
| `nizams_museum` | Nizam's Museum, Purani Haveli | charminar | 9762 | 7871 | 30 | 17.36649, 78.48285 | high |  |
| `salar_jung_museum` | Salar Jung Museum | afzalgunj | 9548 | 7362 | 30 | 17.37140, 78.48010 | high |  |
| `state_museum` | State Archaeology Museum | basheerbagh | 8329 | 4864 | 20 | 17.39925, 78.47032 | medium |  |

#### park (19)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `durgam_cheruvu` | Durgam Cheruvu (secret lake) | hitec | 3380 | 2921 | 20 | 17.43080, 78.39350 | high |  |
| `exhibition_grounds` | Exhibition Grounds | nampally | 8283 | 5824 | 60 | 17.38800, 78.46950 | low | alias of `nampally_exhibition` |
| `fateh_maidan` | Fateh Maidan (LB Stadium field) | basheerbagh | 8673 | 4880 | 50 | 17.39933, 78.47333 | medium |  |
| `gun_park` | Gun Park | basheerbagh | 8463 | 4696 | 14 | 17.40140, 78.47120 | low |  |
| `gymkhana_ground_secunderabad` | Gymkhana Ground | secunderabad | 10031 | 1558 | 40 | 17.44474, 78.48923 | medium |  |
| `harina_vanasthali` | Mahavir Harina Vanasthali (deer park) | lb_nagar | 14949 | 9301 | 30 | 17.34086, 78.58494 | medium |  |
| `indira_park` | Indira Park | musheerabad | 9645 | 3662 | 40 | 17.41475, 78.48305 | medium |  |
| `kbr_park` | KBR Park | banjara | 4914 | 3541 | 30 | 17.42060, 78.41930 | medium |  |
| `lumbini_park` | Lumbini Park | hussain_sagar | 8639 | 4074 | 36 | 17.40977, 78.47261 | high |  |
| `malakpet_race_course` | Malakpet race course | malakpet | 11633 | 7536 | 40 | 17.36850, 78.50600 | low |  |
| `mir_alam_tank` | Mir Alam Tank | zoo | 6186 | 9243 | 40 | 17.34529, 78.43907 | high |  |
| `musi_riverbed` | Musi riverbed & dhobi ghat | afzalgunj | 8533 | 7288 | 40 | 17.37030, 78.47150 | medium |  |
| `nehru_zoo` | Nehru Zoological Park | zoo | 6858 | 8880 | 36 | 17.35111, 78.44972 | medium |  |
| `ntr_gardens` | NTR Gardens | khairatabad | 8257 | 3876 | 40 | 17.41240, 78.46830 | medium | opened c. 2000 |
| `parade_grounds` | Parade Grounds | marredpally | 10788 | 1457 | 60 | 17.44620, 78.49850 | medium |  |
| `public_gardens` | Public Gardens | basheerbagh | 8321 | 4956 | 60 | 17.39820, 78.46950 | high |  |
| `sanjeevaiah_park` | Sanjeevaiah Park | hussain_sagar | 8961 | 2516 | 40 | 17.43050, 78.47570 | medium |  |
| `saroornagar_lake` | Saroornagar Lake | saroornagar | 12913 | 8489 | 30 | 17.35584, 78.52714 | high |  |
| `shilparamam` | Shilparamam | hitec | 2495 | 1547 | 30 | 17.45150, 78.37800 | high |  |

#### photo_studio (6)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `photo_studio_1` | Raj Colour Lab & Studio | himayatnagar | 9405 | 4675 | 18 | 17.40157, 78.48081 | low |  |
| `photo_studio_2` | Studio Lakshmi | abids | 9193 | 5983 | 18 | 17.38674, 78.47802 | low |  |
| `photo_studio_3` | Prince Photo Studio | abids | 8774 | 5736 | 18 | 17.38917, 78.47425 | low |  |
| `photo_studio_4` | Sri Sai Photo Studio | ameerpet | 6695 | 2359 | 18 | 17.43595, 78.44485 | low |  |
| `photo_studio_5` | Tarnaka Photo Studio | osmania | 13336 | 3065 | 18 | 17.42638, 78.53309 | low |  |
| `photo_studio_6` | Colour Lab & Studio | malakpet | 12487 | 7403 | 18 | 17.36927, 78.51888 | low |  |

#### pindi_girni (7)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `pindi_girni_1` | Hanuman Pindi Girni | himayatnagar | 10358 | 4926 | 18 | 17.39960, 78.49251 | low |  |
| `pindi_girni_2` | Lakshmi Flour Mill | rtc_x | 11615 | 4776 | 18 | 17.40145, 78.50674 | low |  |
| `pindi_girni_3` | Ganesh Flour Mill | masab_tank | 7445 | 4915 | 18 | 17.39947, 78.45921 | low |  |
| `pindi_girni_4` | Sri Rama Flour Mill | erragadda | 6311 | 1414 | 18 | 17.45089, 78.43785 | low |  |
| `pindi_girni_5` | Noor Atta Chakki | musheerabad | 10799 | 3769 | 18 | 17.41406, 78.49628 | low |  |
| `pindi_girni_6` | Noor Pindi Girni | charminar | 9553 | 8639 | 18 | 17.35786, 78.48029 | low |  |
| `pindi_girni_7` | Durga Pindi Girni | dilsukhnagar | 12931 | 7911 | 18 | 17.36217, 78.52763 | low |  |

#### playground (18)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `playground_1` | Lakshmi Nagar colony ground (home) | himayatnagar | 10224 | 5006 | 34 | 17.39815, 78.48998 | low | alias of `playground_home` |
| `playground_2` | Vidyanagar colony ground | kachiguda | 11403 | 5029 | 34 | 17.39881, 78.50245 | low |  |
| `playground_3` | Nallakunta ground | kachiguda | 11972 | 5423 | 34 | 17.39429, 78.51081 | low |  |
| `playground_4` | Bholakpur ground | musheerabad | 10705 | 3551 | 34 | 17.41714, 78.49544 | low |  |
| `playground_5` | Marredpally ground | marredpally | 12048 | 1271 | 34 | 17.45153, 78.51609 | low |  |
| `playground_6` | Lalaguda railway ground | osmania | 12568 | 2801 | 34 | 17.42951, 78.52163 | low |  |
| `playground_7` | Chaitanyapuri ground | dilsukhnagar | 12883 | 7754 | 34 | 17.36453, 78.52547 | low |  |
| `playground_8` | Saidabad maidan | saidabad | 11955 | 8383 | 34 | 17.35700, 78.51180 | low |  |
| `playground_9` | SR Nagar park ground | ameerpet | 6347 | 2160 | 30 | 17.43920, 78.43986 | low |  |
| `playground_10` | Tolichowki maidan | tolichowki | 4756 | 5239 | 34 | 17.39724, 78.41815 | low |  |
| `playground_11` | Amberpet ground | amberpet | 12768 | 6005 | 34 | 17.38718, 78.52276 | low |  |
| `playground_12` | Masab Tank ground | masab_tank | 7090 | 4968 | 30 | 17.39902, 78.45422 | low |  |
| `playground_13` | Shah Ali Banda maidan | falaknuma | 8524 | 9182 | 34 | 17.35059, 78.47030 | low |  |
| `playground_14` | Ashok Nagar ground | musheerabad | 9955 | 4263 | 34 | 17.40663, 78.48645 | low |  |
| `playground_15` | Erragadda colony ground | erragadda | 6207 | 1387 | 30 | 17.45144, 78.43663 | low |  |
| `playground_16` | KPHB colony ground | erragadda | 5461 | 23 | 30 | 17.48350, 78.39050 | low |  |
| `playground_home` | Lakshmi Nagar colony ground | himayatnagar | 10224 | 5006 | 34 | 17.39815, 78.48998 | low |  |
| `victory_playground` | Victory Playground (VPG) | chaderghat | 10567 | 6594 | 40 | 17.38000, 78.49150 | low |  |

#### plaza (1)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `charminar_plaza` | Charminar Plaza (finale) | charminar | 9110 | 8332 | 60 | 17.36131, 78.47500 | medium |  |

#### recording_centre (1)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `recording_centre_1` | Raag Recording Centre | charminar | 8845 | 8267 | 18 | 17.36185, 78.47335 | low |  |

#### restaurant (6)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `hotel_nayaab` | Hotel Nayaab | charminar | 8893 | 7681 | 18 | 17.36666, 78.47412 | low |  |
| `hotel_niagara` | Hotel Niagara | chaderghat | 10310 | 6580 | 18 | 17.38050, 78.48850 | low |  |
| `pista_house` | Pista House | charminar | 8969 | 8584 | 18 | 17.35850, 78.47520 | low |  |
| `shadab_hotel` | Hotel Shadab | afzalgunj | 8858 | 7636 | 18 | 17.36706, 78.47388 | low |  |
| `shah_ghouse` | Shah Ghouse Cafe | falaknuma | 8575 | 9326 | 18 | 17.34806, 78.47000 | medium |  |
| `taj_mahal_hotel_abids` | Taj Mahal Hotel, Abids | abids | 8941 | 5747 | 18 | 17.39008, 78.47716 | low |  |

#### samosa_bandi (7)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `samosa_bandi_1` | Samosa bandi | amberpet | 12308 | 5505 | 18 | 17.39336, 78.51574 | low |  |
| `samosa_bandi_2` | Samosa bandi | tolichowki | 5185 | 5331 | 18 | 17.39589, 78.42531 | low |  |
| `samosa_bandi_3` | Samosa bandi | musheerabad | 10739 | 3426 | 18 | 17.41900, 78.49640 | low |  |
| `samosa_bandi_4` | Samosa bandi | marredpally | 11941 | 1419 | 18 | 17.44882, 78.51477 | low |  |
| `samosa_bandi_5` | Samosa bandi | dilsukhnagar | 13429 | 7737 | 18 | 17.36482, 78.53100 | low |  |
| `samosa_bandi_6` | Samosa bandi | charminar | 9280 | 8351 | 18 | 17.36072, 78.47723 | low |  |
| `samosa_bandi_7` | Samosa bandi | khairatabad | 6729 | 2540 | 18 | 17.43314, 78.44612 | low |  |

#### school (15)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `ameerpet_coaching` | Ameerpet computer coaching lane | ameerpet | 6725 | 2336 | 26 | 17.43640, 78.44542 | low |  |
| `hyderabad_public_school` | The Hyderabad Public School | begumpet | 7617 | 1792 | 26 | 17.44419, 78.45730 | high |  |
| `school_1` | Saraswati Vidya Mandir High School | basheerbagh | 9243 | 5077 | 26 | 17.39657, 78.47922 | low |  |
| `school_2` | Vivekananda High School | rtc_x | 11021 | 4997 | 26 | 17.39979, 78.49737 | low |  |
| `school_3` | Government High School, Kachiguda | kachiguda | 11422 | 5375 | 24 | 17.39425, 78.50253 | low |  |
| `school_4` | Nalanda Public School | masab_tank | 7257 | 5198 | 24 | 17.39640, 78.45666 | low |  |
| `school_5` | Al-Ameen High School | tolichowki | 4849 | 5316 | 22 | 17.39589, 78.41975 | low |  |
| `school_6` | Sri Chaitanya Vidyalayam | ameerpet | 6458 | 2137 | 24 | 17.43956, 78.44062 | low |  |
| `school_7` | Government High School, Musheerabad | musheerabad | 11477 | 3621 | 22 | 17.41700, 78.50400 | low |  |
| `school_8` | Holy Family Convent School | secunderabad | 11647 | 1464 | 24 | 17.44909, 78.51006 | low |  |
| `school_9` | Railway High School, Lalaguda | osmania | 12487 | 2715 | 20 | 17.43050, 78.52050 | low |  |
| `school_10` | Malakpet High School | saidabad | 11525 | 8246 | 22 | 17.35925, 78.50498 | low |  |
| `school_11` | Dilsukhnagar Public School | malakpet | 12715 | 7884 | 24 | 17.36392, 78.52284 | low |  |
| `school_12` | Saidabad Government School | saidabad | 11856 | 8409 | 22 | 17.35780, 78.51050 | low |  |
| `school_13` | Government Urdu High School, Shah Ali Banda | falaknuma | 8756 | 9441 | 20 | 17.34700, 78.47250 | low |  |

#### shop (2)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `chermas_abids` | Cherma's | abids | 9080 | 5777 | 18 | 17.38954, 78.47659 | low |  |
| `shoppers_stop_begumpet` | Trendz Department Store, Begumpet | begumpet | 8116 | 1711 | 20 | 17.44400, 78.46400 | low |  |

#### stairs (11)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `ashok_t1_stairs` | Ashok Nagar terrace (1): stairs | himayatnagar | 10136 | 4218 | 10 | 17.40736, 78.48794 | low |  |
| `ashok_t2_stairs` | Ashok Nagar terrace (2): stairs | himayatnagar | 10190 | 4200 | 10 | 17.40769, 78.48896 | low |  |
| `ashok_t3_stairs` | Ashok Nagar terrace (3): stairs | himayatnagar | 10208 | 4254 | 10 | 17.40671, 78.48929 | low |  |
| `friend_stairs` | Immu's terrace: stairs | himayatnagar | 10336 | 4972 | 10 | 17.39877, 78.49209 | low |  |
| `home_stairs` | Home terrace (Lakshmi Nivas): stairs | himayatnagar | 10132 | 4990 | 10 | 17.39844, 78.48825 | low |  |
| `lakshmi_t2_stairs` | Reddy-garu's terrace: stairs | himayatnagar | 10068 | 4962 | 10 | 17.39895, 78.48705 | low |  |
| `lakshmi_t3_stairs` | Sharma-ji's terrace: stairs | himayatnagar | 10074 | 5043 | 10 | 17.39748, 78.48716 | low |  |
| `lakshmi_t4_stairs` | the Naidus' terrace: stairs | himayatnagar | 10108 | 5043 | 10 | 17.39748, 78.48780 | low |  |
| `lakshmi_t5_stairs` | Pinto aunty's terrace: stairs | himayatnagar | 10140 | 5043 | 10 | 17.39748, 78.48840 | low |  |
| `lakshmi_t6_stairs` | the corner house terrace: stairs | himayatnagar | 10146 | 4962 | 10 | 17.39895, 78.48852 | low |  |
| `patang_chacha_stairs` | Patang Chacha's roof: stairs | charminar | 9168 | 8073 | 10 | 17.36310, 78.47718 | low |  |

#### stationery (8)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `stationery_1` | Vidya Stationery & Book Depot | himayatnagar | 9290 | 4851 | 18 | 17.39726, 78.47883 | low |  |
| `stationery_2` | Navyuga Stationers | rtc_x | 11041 | 4961 | 18 | 17.39937, 78.49778 | low |  |
| `stationery_3` | Student Book House | kachiguda | 11490 | 5412 | 18 | 17.39511, 78.50300 | low |  |
| `stationery_4` | Koti textbook stall | koti | 9758 | 6104 | 18 | 17.38555, 78.48305 | low |  |
| `stationery_5` | Bharat Book & Stationery | masab_tank | 7283 | 5223 | 18 | 17.39567, 78.45798 | low |  |
| `stationery_6` | Gita Stationery | ameerpet | 6458 | 2144 | 18 | 17.43943, 78.44099 | low |  |
| `stationery_7` | Saraswati Book Depot | dilsukhnagar | 12935 | 7758 | 18 | 17.36581, 78.52334 | low |  |
| `stationery_8` | Sri Sai Stationery | malakpet | 11614 | 8003 | 18 | 17.36289, 78.50537 | low |  |

#### std_booth (16)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `std_1` | STD/ISD/PCO | himayatnagar | 10104 | 4810 | 18 | 17.40142, 78.48780 | low |  |
| `std_2` | STD/ISD/PCO | himayatnagar | 9762 | 4900 | 18 | 17.39915, 78.48446 | low |  |
| `std_3` | STD/ISD/PCO | koti | 9927 | 6194 | 18 | 17.38528, 78.48503 | low |  |
| `std_4` | STD/ISD/PCO | abids | 9027 | 5630 | 18 | 17.39012, 78.47723 | low |  |
| `std_5` | STD/ISD/PCO | khairatabad | 7849 | 4510 | 18 | 17.40463, 78.46412 | low |  |
| `std_6` | STD/ISD/PCO | rtc_x | 11011 | 4008 | 18 | 17.41099, 78.49864 | low |  |
| `std_7` | STD/ISD/PCO | musheerabad | 10090 | 4060 | 18 | 17.40856, 78.48724 | low |  |
| `std_8` | STD/ISD/PCO | tolichowki | 5232 | 5261 | 18 | 17.39706, 78.42606 | low |  |
| `std_9` | STD/ISD/PCO | khairatabad | 6707 | 2516 | 18 | 17.43351, 78.44589 | low |  |
| `std_10` | STD/ISD/PCO | secunderabad | 11302 | 2314 | 18 | 17.43500, 78.50380 | low |  |
| `std_11` | STD/ISD/PCO | dilsukhnagar | 13069 | 7386 | 18 | 17.36862, 78.52831 | low |  |
| `std_12` | STD/ISD/PCO | charminar | 8854 | 8935 | 18 | 17.35456, 78.47371 | low |  |
| `std_13` | STD/ISD/PCO | bahadurpura | 7735 | 8847 | 18 | 17.35399, 78.46223 | low |  |
| `std_14` | STD/ISD/PCO | khairatabad | 7277 | 3278 | 18 | 17.42120, 78.45480 | low |  |
| `std_15` | STD/ISD/PCO | jubilee | 3954 | 2931 | 18 | 17.43083, 78.40358 | low |  |
| `std_16` | STD/ISD/PCO | hitec | 3006 | 2111 | 18 | 17.44188, 78.38284 | low |  |

#### temple (24)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `akkanna_madanna_temple` | Akkanna Madanna Mahankali Temple | charminar | 9240 | 8922 | 18 | 17.35450, 78.47650 | low | festival bonalu |
| `ashtalakshmi_temple` | Ashtalakshmi Temple, Kothapet | dilsukhnagar | 14197 | 7682 | 22 | 17.36469, 78.54790 | high |  |
| `balkampet_yellamma_temple` | Balkampet Yellamma Temple | ameerpet | 7024 | 1619 | 22 | 17.44750, 78.44920 | medium | festival bonalu |
| `birla_mandir` | Birla Mandir | basheerbagh | 8290 | 4399 | 30 | 17.40619, 78.46906 | high |  |
| `dilsukhnagar_sai_temple` | Sai Baba Temple, Dilsukhnagar | dilsukhnagar | 12955 | 7470 | 30 | 17.36786, 78.52728 | high |  |
| `golconda_jagadamba_temple` | Jagadamba Temple, Golconda | golconda | 3748 | 6272 | 16 | 17.38370, 78.40130 | low | festival bonalu |
| `gurudwara_gowliguda` | Central Gurudwara Sahib, Gowliguda | abids | 9515 | 6390 | 18 | 17.38150, 78.48100 | low |  |
| `iskcon_abids` | ISKCON Temple, Abids | abids | 8478 | 5570 | 18 | 17.39020, 78.47180 | low |  |
| `karmanghat_hanuman_temple` | Karmanghat Hanuman Temple | saroornagar | 12723 | 9491 | 20 | 17.33972, 78.52472 | medium |  |
| `katta_maisamma_temple` | Katta Maisamma Temple | hussain_sagar | 9267 | 3883 | 18 | 17.41200, 78.47950 | low | festival bonalu |
| `khairatabad_ganesh` | Khairatabad Ganesh | khairatabad | 7872 | 4054 | 30 | 17.41071, 78.46373 | medium | festival ganesh_immersion |
| `lal_darwaza_temple` | Lal Darwaza Mahankali Temple | charminar | 9374 | 9147 | 26 | 17.35050, 78.47900 | low |  |
| `peddamma_temple` | Peddamma Temple | jubilee | 4074 | 2868 | 22 | 17.43065, 78.40499 | medium |  |
| `secunderabad_ganesh_temple` | Sri Ganesh Temple (Secunderabad station) | secunderabad | 10977 | 2224 | 18 | 17.43600, 78.49980 | low |  |
| `shankar_mutt_nallakunta` | Sringeri Shankar Mutt, Nallakunta | rtc_x | 11646 | 4966 | 20 | 17.40050, 78.50600 | low | alias of `temple_3` |
| `temple_1` | Sri Venkateswara Temple | himayatnagar | 10051 | 4860 | 18 | 17.40079, 78.48673 | low |  |
| `temple_2` | Hanuman Temple | musheerabad | 10011 | 4404 | 18 | 17.40425, 78.48703 | low |  |
| `temple_3` | Shankar Mutt | rtc_x | 11646 | 4966 | 20 | 17.40050, 78.50600 | low |  |
| `temple_4` | Pochamma Temple | erragadda | 6107 | 1327 | 18 | 17.45243, 78.43625 | low |  |
| `temple_5` | Sri Rama Temple, Tarnaka | osmania | 13399 | 3117 | 18 | 17.42583, 78.53535 | low |  |
| `temple_6` | Ayyappa Temple | masab_tank | 6528 | 5219 | 18 | 17.39620, 78.44780 | low |  |
| `temple_7` | ISKCON Temple, Abids | abids | 8478 | 5570 | 18 | 17.39020, 78.47180 | low | alias of `iskcon_abids` |
| `temple_8` | Ashtalakshmi Temple, Kothapet | dilsukhnagar | 14197 | 7682 | 22 | 17.36469, 78.54790 | high | alias of `ashtalakshmi_temple` |
| `ujjaini_mahankali_temple` | Ujjaini Mahankali Temple | secunderabad | 10228 | 2133 | 26 | 17.43670, 78.49110 | medium | festival bonalu |

#### terrace (2)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `home_terrace` | Home terrace (kites, sleeping under the stars) | himayatnagar | 10102 | 4984 | 12 | 17.39855, 78.48769 | low | on roof home_terrace |
| `patang_chacha_roof` | Patang Chacha's roof | charminar | 9154 | 8096 | 12 | 17.36268, 78.47692 | low | on roof patang_chacha_roof |

#### transport (10)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `begumpet_airport` | Begumpet Airport | begumpet | 8664 | 1424 | 30 | 17.44850, 78.47050 | medium |  |
| `cbs_hangar` | Gowliguda Hangar (City Bus Station) | chaderghat | 9653 | 6538 | 26 | 17.38040, 78.48180 | low |  |
| `gowliguda_hangar` | Gowliguda "Mississippi" hangar | chaderghat | 9653 | 6538 | 26 | 17.38040, 78.48180 | low | alias of `cbs_hangar` |
| `imlibun_bus_station` | Imlibun Bus Station (MGBS) | chaderghat | 9862 | 6770 | 40 | 17.37800, 78.48350 | medium |  |
| `kachiguda_station` | Kachiguda Station | amberpet | 11249 | 5828 | 30 | 17.38956, 78.49976 | high |  |
| `koti_bus_stand` | Koti Bus Stand | abids | 9826 | 6131 | 36 | 17.38510, 78.48360 | low |  |
| `mehdipatnam_bus_terminus` | Mehdipatnam Bus Depot | tolichowki | 6016 | 5325 | 24 | 17.39530, 78.43880 | low |  |
| `nampally_station` | Nampally Station (Hyderabad Deccan) | nampally | 8158 | 5389 | 30 | 17.39336, 78.46738 | high |  |
| `rathifile_bus_station` | Rathifile City Bus Station | secunderabad | 11160 | 2345 | 28 | 17.43497, 78.50207 | low |  |
| `secunderabad_station` | Secunderabad Station | secunderabad | 11112 | 2443 | 30 | 17.43370, 78.50160 | high |  |

#### video_parlour (4)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `video_parlour_1` | Super Video Games | kachiguda | 11047 | 5618 | 18 | 17.39310, 78.49809 | low |  |
| `video_parlour_2` | Champion Video Games | koti | 9744 | 5674 | 18 | 17.38872, 78.48277 | low |  |
| `video_parlour_3` | Rocky Video Games | dilsukhnagar | 12948 | 7723 | 18 | 17.36537, 78.52469 | low |  |
| `video_parlour_4` | Game Zone Video Parlour | ameerpet | 6435 | 2211 | 18 | 17.43830, 78.44118 | low |  |

#### viewpoint (1)

| id | name | district | x | y | r | lat, lon | conf | notes |
|---|---|---|---|---|---|---|---|---|
| `charminar_gallery` | Charminar first gallery (viewpoint) | charminar | 9020 | 8272 | 20 | 17.36163, 78.47467 | high |  |

### Roads (3403: 220 named / layout roads below, 3183 residential infill lanes)

src: `roads` = real alignment (design/geo/roads.json, OSM), `cluster` = a game layout (colony lanes, the Charminar ring, the Gulzar Houz loop). pothole = the A2 condition hint.

| id | name | kind | width | length (u) | src | conf | pothole |
|---|---|---|---|---|---|---|---|
| `charminar_circle` | Charminar Circle | street | 30 | 525 | cluster | medium | 0.55 |
| `pathergatti_rd` | Pathergatti Road | street | 36 | 112 | cluster | medium | 0.55 |
| `gulzar_houz_loop` | Gulzar Houz | lane | 24 | 288 | cluster | low | 0.8 |
| `pathergatti_n` | Pathergatti Road | street | 36 | 606 | roads | high | 0.55 |
| `naya_pul` | Naya Pul | bridge | 40 | 211 | roads | high | 0.4 |
| `musi_south_rd` | Musi South Bank Road | street | 40 | 3906 | roads | high | 0.55 |
| `laad_bazaar` | Laad Bazaar | lane | 22 | 340 | roads | medium | 0.8 |
| `gulzar_houz_w` | Gulzar Houz West Lane | lane | 22 | 1584 | roads | medium | 0.8 |
| `gulzar_houz_e` | Gulzar Houz East Lane | lane | 22 | 1178 | roads | medium | 0.8 |
| `sardar_mahal_rd` | Sardar Mahal Road | street | 34 | 461 | roads | high | 0.55 |
| `shah_ali_banda_rd` | Shah Ali Banda Road | street | 36 | 2499 | roads | high | 0.55 |
| `hussaini_alam_rd` | Hussaini Alam Road | street | 34 | 1239 | roads | high | 0.55 |
| `khilwat_rd` | Khilwat Road | street | 32 | 802 | roads | high | 0.55 |
| `darulshifa_rd` | Darulshifa Road | street | 34 | 1599 | roads | high | 0.55 |
| `dabeerpura_rd` | Dabeerpura Road | street | 36 | 1754 | roads | high | 0.55 |
| `yakutpura_rd` | Yakutpura Road | street | 34 | 999 | roads | high | 0.55 |
| `lal_darwaza_rd` | Lal Darwaza Road | lane | 24 | 603 | roads | high | 0.8 |
| `bahadurpura_rd` | Bahadurpura Road | arterial | 52 | 4003 | roads | medium | 0.45 |
| `falaknuma_rd` | Falaknuma Road | street | 36 | 263 | roads | medium | 0.55 |
| `chandrayangutta_rd` | Chandrayangutta Road | arterial | 52 | 6037 | roads | high | 0.35 |
| `saidabad_rd` | Saidabad Road | street | 36 | 2593 | roads | high | 0.55 |
| `puranapul` | Purana Pul | bridge | 30 | 199 | roads | high | 0.2 |
| `musallam_jung_bridge` | Musallam Jung Bridge | bridge | 34 | 228 | roads | high | 0.4 |
| `afzalgunj_bridge_rd` | Salar Jung Museum Road | street | 36 | 328 | roads | medium | 0.55 |
| `afzalgunj_bridge` | Afzalgunj Bridge (Salar Jung Pul) | bridge | 36 | 285 | roads | high | 0.4 |
| `chaderghat_bridge` | Chaderghat Bridge | bridge | 48 | 263 | roads | high | 0.4 |
| `moosarambagh_bridge` | Moosarambagh Bridge | bridge | 40 | 88 | roads | high | 0.2 |
| `nagole_bridge` | Nagole Bridge | bridge | 40 | 198 | roads | high | 0.2 |
| `afzalgunj_rd` | Afzalgunj Road | street | 44 | 2065 | roads | high | 0.55 |
| `siddiamber_rd` | Siddiamber Bazaar Road | arterial | 52 | 1155 | roads | medium | 0.55 |
| `abids_rd` | Abids Road | arterial | 52 | 463 | roads | high | 0.25 |
| `gunfoundry_rd` | Gunfoundry Road | arterial | 52 | 1154 | roads | high | 0.25 |
| `basheerbagh_rd` | Basheerbagh Road | arterial | 52 | 242 | roads | high | 0.15 |
| `liberty_rd` | Liberty Road | arterial | 52 | 452 | roads | high | 0.15 |
| `nampally_rd` | Nampally Station Road | street | 40 | 704 | roads | high | 0.35 |
| `mj_market_rd` | Mozamjahi Market Road | street | 40 | 87 | roads | high | 0.35 |
| `jambagh_rd` | Jambagh Road | street | 36 | 1150 | roads | high | 0.35 |
| `begum_bazaar_rd` | Begum Bazaar Road | street | 36 | 710 | roads | high | 0.55 |
| `mangalhat_rd` | Mangalhat Road | street | 34 | 3290 | roads | medium | 0.55 |
| `bank_st` | Bank Street | street | 40 | 967 | roads | high | 0.35 |
| `king_koti_rd` | King Koti Road | street | 40 | 2104 | roads | high | 0.35 |
| `hanuman_tekdi_rd` | Hanuman Tekdi Road | street | 34 | 909 | roads | medium | 0.35 |
| `gowliguda_rd` | Gowliguda Road | street | 36 | 363 | roads | medium | 0.35 |
| `chaderghat_rd` | Koti–Chaderghat Road | arterial | 52 | 891 | roads | high | 0.25 |
| `sultan_bazaar_ln` | Sultan Bazaar | lane | 22 | 201 | roads | medium | 0.6 |
| `koti_kachiguda_rd` | Koti–Kachiguda Road | street | 40 | 624 | roads | high | 0.35 |
| `putlibowli_rd` | Putlibowli Road | lane | 24 | 1176 | roads | medium | 0.8 |
| `assembly_rd` | Public Gardens Road | street | 40 | 677 | roads | high | 0.35 |
| `nampally_assembly_rd` | Nampally–Assembly Road | street | 36 | 859 | roads | medium | 0.35 |
| `saifabad_rd` | Saifabad Road | arterial | 52 | 1436 | roads | medium | 0.25 |
| `secretariat_rd` | Secretariat Road | arterial | 56 | 1897 | roads | medium | 0.15 |
| `khairatabad_rd` | Khairatabad Road | arterial | 56 | 941 | roads | high | 0.15 |
| `naubat_pahad_rd` | Naubat Pahad Road | lane | 22 | 184 | roads | medium | 0.6 |
| `birla_mandir_steps` | Birla Mandir steps | path | 14 | 194 | roads | low | 0.1 |
| `tank_bund` | Tank Bund Road | bund | 60 | 1652 | roads | high | 0.05 |
| `necklace_rd` | Necklace Road | arterial | 48 | 3709 | roads | high | 0.15 |
| `lower_tank_bund` | Lower Tank Bund Road | street | 34 | 996 | roads | high | 0.25 |
| `kavadiguda_rd` | Kavadiguda Road | street | 40 | 741 | roads | medium | 0.35 |
| `indira_park_rd` | Indira Park Road | street | 44 | 1787 | roads | high | 0.35 |
| `lumbini_rd` | Lumbini Park Lane | lane | 22 | 112 | roads | low | 0.6 |
| `himayatnagar_rd` | Himayatnagar Main Road | arterial | 52 | 1620 | roads | high | 0.25 |
| `himayat_chikkadpally_rd` | Himayatnagar–Chikkadpally Road | street | 40 | 834 | roads | medium | 0.35 |
| `chikkadpally_rd` | Chikkadpally Road | arterial | 52 | 1075 | roads | high | 0.25 |
| `narayanguda_rd` | Narayanguda Road | street | 40 | 1214 | roads | medium | 0.35 |
| `vidyanagar_rd` | Vidyanagar Road | arterial | 52 | 1107 | roads | high | 0.25 |
| `nallakunta_rd` | Nallakunta Road | street | 34 | 563 | roads | high | 0.35 |
| `amberpet_rd` | Amberpet Road | arterial | 52 | 5246 | roads | medium | 0.25 |
| `kachiguda_station_rd` | Kachiguda Station Road | street | 36 | 705 | roads | high | 0.35 |
| `musheerabad_rd` | Musheerabad Road | arterial | 52 | 2058 | roads | high | 0.25 |
| `moosarambagh_rd` | Moosarambagh Road | street | 40 | 976 | roads | high | 0.35 |
| `mg_rd` | MG Road | arterial | 52 | 1200 | roads | high | 0.25 |
| `sp_rd` | Sardar Patel Road | arterial | 56 | 2271 | roads | high | 0.15 |
| `sd_rd` | Sarojini Devi Road | arterial | 52 | 1533 | roads | high | 0.25 |
| `rp_rd` | Rashtrapati Road | street | 40 | 1163 | roads | high | 0.35 |
| `station_rd` | Clock Tower Road | street | 36 | 483 | roads | medium | 0.35 |
| `musheerabad_link` | Bholakpur Road | street | 36 | 405 | roads | low | 0.35 |
| `marredpally_rd` | Marredpally Road | street | 36 | 1029 | roads | high | 0.35 |
| `trimulgherry_rd` | Trimulgherry Road | street | 36 | 2373 | roads | medium | 0.35 |
| `begumpet_rd` | Begumpet Road | arterial | 52 | 1225 | roads | high | 0.15 |
| `begumpet_ameerpet_rd` | Ameerpet Road | street | 40 | 734 | roads | high | 0.35 |
| `airport_rd` | Airport Road | street | 40 | 297 | roads | low | 0.35 |
| `mumbai_hwy` | Mumbai Highway (NH 9) | arterial | 56 | 3658 | roads | high | 0.15 |
| `raj_bhavan_rd` | Raj Bhavan Road | arterial | 56 | 1299 | roads | high | 0.25 |
| `banjara_rd1` | Road No. 1, Banjara Hills | arterial | 52 | 1868 | roads | high | 0.25 |
| `banjara_rd2` | Road No. 2, Banjara Hills | street | 40 | 717 | roads | high | 0.35 |
| `banjara_rd12` | Road No. 12, Banjara Hills | street | 40 | 1854 | roads | high | 0.35 |
| `jubilee_rd36` | Road No. 36, Jubilee Hills | arterial | 52 | 1335 | roads | high | 0.25 |
| `film_nagar_rd` | Film Nagar Road | street | 40 | 1618 | roads | high | 0.35 |
| `mehdipatnam_rd` | Mehdipatnam Road | arterial | 56 | 2255 | roads | high | 0.15 |
| `old_mumbai_rd` | Old Mumbai Road | arterial | 52 | 5513 | roads | high | 0.25 |
| `golconda_rd` | Golconda Fort Road | street | 40 | 3038 | roads | medium | 0.35 |
| `tombs_rd` | Seven Tombs Road | street | 36 | 974 | roads | medium | 0.35 |
| `gandipet_rd` | Gandipet Road | street | 40 | 832 | roads | medium | 0.35 |
| `raidurg_rd` | Raidurg Road | street | 40 | 687 | roads | low | 0.35 |
| `hitec_rd` | HITEC City Road | arterial | 56 | 1459 | roads | high | 0.15 |
| `hitec_n_rd` | Kondapur Road | street | 40 | 806 | roads | medium | 0.35 |
| `malakpet_rd` | Malakpet Road | arterial | 56 | 5753 | roads | high | 0.35 |
| `ou_rd` | Osmania University Road | street | 40 | 2565 | roads | high | 0.35 |
| `uppal_rd` | Uppal Road | arterial | 52 | 2273 | roads | high | 0.25 |
| `tarnaka_e_rd` | Habsiguda Road | street | 40 | 1890 | roads | medium | 0.35 |
| `nagole_rd` | Nagole Road | street | 40 | 2611 | roads | medium | 0.35 |
| `nagole_n_rd` | Nagole–Uppal Road | street | 40 | 1303 | roads | medium | 0.35 |
| `lb_nagar_s_rd` | Sagar Road | street | 40 | 1024 | roads | high | 0.35 |
| `kothapet_rd` | Kothapet Road | street | 36 | 1930 | roads | medium | 0.35 |
| `chowmahalla_ln` | Khilwat Lane | lane | 20 | 75 | roads | low | 0.8 |
| `public_gardens_path` | Public Gardens walk | path | 12 | 348 | roads | low | 0.1 |
| `public_gardens_path2` | Public Gardens walk | path | 12 | 220 | roads | low | 0.1 |
| `indira_park_path` | Indira Park walk | path | 12 | 567 | roads | low | 0.1 |
| `general_bazaar_ln` | General Bazaar | lane | 22 | 55 | roads | low | 0.6 |
| `golconda_steps` | Steps to Bala Hissar | path | 12 | 110 | roads | low | 0.1 |
| `asif_nagar_rd` | Asif Nagar Road | street | 36 | 2118 | roads | medium | 0.55 |
| `mallepally_rd` | Mallepally Road | street | 36 | 1151 | roads | medium | 0.35 |
| `karwan_rd` | Karwan Road | street | 36 | 2745 | roads | medium | 0.55 |
| `sanathnagar_rd` | Sanathnagar Road | street | 36 | 2664 | roads | medium | 0.35 |
| `ln_lakshmi_v1` | Lakshmi Nagar Street 1 | lane | 22 | 468 | cluster | low | 0.6 |
| `ln_lakshmi_v2` | Lakshmi Nagar Street 2 | lane | 22 | 480 | cluster | low | 0.6 |
| `ln_lakshmi_h1` | Lakshmi Nagar Main Street | lane | 22 | 557 | cluster | low | 0.6 |
| `ln_hyderguda_h1` | Hyderguda Main Street | lane | 22 | 1211 | roads | medium | 0.6 |
| `ln_hyderguda_v1` | Hyderguda Street 2 | lane | 22 | 390 | roads | medium | 0.6 |
| `ln_domalguda_v1` | Domalguda Street 1 | lane | 22 | 313 | roads | medium | 0.6 |
| `ln_domalguda_v2` | Domalguda Street 2 | lane | 22 | 343 | roads | medium | 0.6 |
| `ln_domalguda_h1` | Ashok Nagar Main Street | lane | 22 | 498 | roads | medium | 0.6 |
| `ln_vidyanagar_v1` | Vidyanagar Street 1 | lane | 22 | 450 | roads | medium | 0.6 |
| `ln_vidyanagar_v2` | Vidyanagar Street 2 | lane | 22 | 222 | roads | medium | 0.6 |
| `ln_vidyanagar_h1` | Vidyanagar Main Street | lane | 22 | 256 | roads | medium | 0.6 |
| `ln_barkatpura_h1` | Barkatpura Main Street | lane | 22 | 456 | roads | medium | 0.6 |
| `ln_barkatpura_v1` | Barkatpura Street 2 | lane | 22 | 188 | roads | medium | 0.6 |
| `ln_nallakunta_v1` | Nallakunta Street | lane | 22 | 486 | roads | medium | 0.6 |
| `ln_nallakunta_h1` | Nallakunta Main Street | lane | 22 | 309 | roads | medium | 0.6 |
| `ln_vijayanagar_v1` | Vijayanagar Colony Road | lane | 22 | 445 | roads | medium | 0.6 |
| `ln_vijayanagar_v2` | Mallepally Street | lane | 22 | 411 | roads | medium | 0.6 |
| `ln_vijayanagar_h1` | Vijayanagar Main Street | lane | 22 | 440 | roads | medium | 0.6 |
| `ln_humayun_v1` | Humayun Nagar Road | lane | 22 | 221 | roads | medium | 0.6 |
| `ln_mehdipatnam_h1` | Mehdipatnam Main Street | lane | 22 | 292 | roads | medium | 0.6 |
| `ln_tolichowki_v1` | Tolichowki Street 1 | lane | 22 | 458 | roads | low | 0.6 |
| `ln_tolichowki_v2` | Tolichowki Street 2 | lane | 22 | 178 | roads | low | 0.6 |
| `ln_tolichowki_h1` | Tolichowki Main Street | lane | 22 | 353 | roads | medium | 0.6 |
| `ln_srnagar_h1` | SR Nagar Main Road | lane | 22 | 423 | roads | medium | 0.6 |
| `ln_srnagar_h2` | SR Nagar Street | lane | 22 | 277 | roads | medium | 0.6 |
| `ln_srnagar_v1` | SR Nagar Cross Road | lane | 22 | 343 | roads | medium | 0.6 |
| `ln_srnagar_v2` | Yousufguda Road | lane | 22 | 1413 | roads | high | 0.6 |
| `ln_ameerpet_v1` | Kumar Basti Road | lane | 22 | 234 | roads | medium | 0.6 |
| `ln_ameerpet_h1` | Ameerpet Street | lane | 22 | 303 | roads | medium | 0.6 |
| `ln_erragadda_h1` | Erragadda Street | lane | 22 | 210 | roads | medium | 0.6 |
| `ln_erragadda_v1` | Erragadda Cross Road | lane | 22 | 445 | roads | medium | 0.6 |
| `ln_musheerabad_v1` | Bholakpur Road | lane | 22 | 632 | roads | medium | 0.6 |
| `ln_musheerabad_h1` | Gandhinagar Road | lane | 22 | 877 | roads | medium | 0.6 |
| `ln_musheerabad_h2` | Musheerabad Street | lane | 22 | 199 | roads | medium | 0.6 |
| `ln_marredpally_v1` | Marredpally Street 1 | lane | 22 | 383 | roads | medium | 0.6 |
| `ln_marredpally_h0` | East Marredpally Road | lane | 22 | 628 | roads | medium | 0.6 |
| `ln_marredpally_h1` | West Marredpally Road | lane | 22 | 502 | roads | medium | 0.6 |
| `ln_marredpally_v2` | Marredpally Street 2 | lane | 22 | 348 | roads | medium | 0.6 |
| `ln_lalaguda_h1` | Lalaguda Road | lane | 22 | 679 | roads | medium | 0.6 |
| `ln_lalaguda_v1` | Lalaguda Street 1 | lane | 22 | 251 | roads | medium | 0.6 |
| `ln_lalaguda_v2` | Lalaguda Street 2 | lane | 22 | 271 | roads | medium | 0.6 |
| `ln_lalaguda_v3` | Tarnaka Street | lane | 22 | 242 | roads | medium | 0.6 |
| `malakpet_race_rd` | Race Course Road | street | 36 | 1185 | roads | high | 0.35 |
| `ln_malakpet_v1` | Malakpet Street | lane | 22 | 231 | roads | medium | 0.6 |
| `ln_malakpet_h1` | Malakpet Colony Road | lane | 22 | 199 | roads | medium | 0.6 |
| `ln_dilsukh_v1` | Dilsukhnagar Street 1 | lane | 22 | 540 | roads | medium | 0.6 |
| `ln_dilsukh_v2` | Dilsukhnagar Street 2 | lane | 22 | 437 | roads | medium | 0.6 |
| `ln_dilsukh_h1` | Dilsukhnagar Colony Road | lane | 22 | 535 | roads | medium | 0.6 |
| `ln_dilsukh_h2` | Chaitanyapuri Road | lane | 22 | 426 | roads | medium | 0.6 |
| `ln_sai_temple` | Sai Baba Temple Lane | lane | 22 | 738 | roads | medium | 0.6 |
| `ln_saidabad_v1` | Saidabad Street | lane | 22 | 410 | roads | medium | 0.6 |
| `ln_saidabad_h1` | Saidabad Colony Road | lane | 22 | 476 | roads | medium | 0.6 |
| `ln_ghansi_bazaar` | Ghansi Bazaar | lane | 22 | 1042 | roads | high | 0.8 |
| `ln_kotla_alijah` | Kotla Alijah Lane | lane | 22 | 437 | roads | low | 0.8 |
| `ln_mitti_ka_sher` | Mitti ka Sher Lane | lane | 22 | 475 | roads | low | 0.8 |
| `ln_shah_ali_banda_e` | Shah Ali Banda East Lane | lane | 22 | 424 | roads | low | 0.8 |
| `ln_shah_ali_banda_w` | Shah Ali Banda West Lane | lane | 22 | 868 | roads | high | 0.8 |
| `bolarum_rd` | Bolarum Road | street | 36 | 934 | roads | medium | 0.35 |
| `club_rd` | Secunderabad Club Road | lane | 24 | 294 | roads | low | 0.6 |
| `hps_ln` | HPS Road | lane | 24 | 205 | roads | low | 0.6 |
| `bapu_ghat_rd` | Bapu Ghat Road | lane | 22 | 296 | roads | low | 0.6 |
| `uoh_rd` | University Road | lane | 24 | 66 | roads | low | 0.6 |
| `purani_haveli_rd` | Purani Haveli Road | lane | 24 | 311 | roads | high | 0.8 |
| `secretariat_saifabad_rd` | Secretariat Road (Saifabad) | arterial | 56 | 328 | roads | high | 0.15 |
| `panjagutta_rd` | Panjagutta–Khairatabad Road | arterial | 56 | 1056 | roads | high | 0.15 |
| `banjara_rd3` | Road No. 3, Banjara Hills | street | 40 | 1610 | roads | high | 0.35 |
| `chaderghat_causeway` | Chaderghat Causeway | bridge | 36 | 168 | roads | high | 0.2 |
| `narayanguda_kachiguda_rd` | Narayanguda–Kachiguda Road | street | 36 | 459 | roads | medium | 0.35 |
| `tolichowki_golconda_rd` | Tolichowki–Golconda Road | street | 36 | 1389 | roads | medium | 0.35 |
| `moula_ali_rd` | Moula Ali Road | street | 40 | 2068 | roads | high | 0.35 |
| `tarnaka_sec_rd` | Secunderabad–Tarnaka Road | arterial | 52 | 2367 | roads | high | 0.25 |
| `chaderghat_amberpet_rd` | Chaderghat–Amberpet Road | arterial | 52 | 494 | roads | medium | 0.25 |
| `raja_reddy_marg` | Hyderguda Road | street | 36 | 818 | roads | high | 0.35 |
| `mj_afzalgunj_link` | Afzalgunj Road (Osmania Hospital) | street | 40 | 399 | roads | high | 0.55 |
| `falaknuma_station_rd` | Falaknuma Station Road | street | 36 | 194 | roads | low | 0.55 |
| `banjara_rd10` | Road No. 10, Banjara Hills | street | 36 | 1448 | roads | high | 0.35 |
| `kbr_jubilee_rd` | Road No. 10, Jubilee Hills | street | 36 | 1490 | roads | medium | 0.35 |
| `golnaka_bridge` | Golnaka Bridge | bridge | 36 | 215 | roads | medium | 0.2 |
| `mgbs_bridge` | Imlibun (MGBS) Bridge | bridge | 36 | 100 | roads | medium | 0.4 |
| `gachibowli_rd` | Old Mumbai Highway (Gachibowli) | arterial | 48 | 2074 | roads | low | 0.5 |
| `ln_kotla_alijah_2` | Kotla Alijah Lane | lane | 22 | 93 | roads | low | 0.8 |
| `nampally_assembly_rd_2` | Nampally–Assembly Road | street | 36 | 56 | roads | medium | 0.35 |
| `begum_bazaar_rd_2` | Begum Bazaar Road | street | 36 | 152 | roads | high | 0.55 |
| `lower_tank_bund_2` | Lower Tank Bund Road | street | 34 | 407 | roads | high | 0.25 |
| `nagole_n_rd_2` | Nagole–Uppal Road | street | 40 | 144 | roads | medium | 0.35 |
| `moosarambagh_rd_2` | Moosarambagh Road | street | 40 | 793 | roads | high | 0.35 |
| `afzalgunj_rd_2` | Afzalgunj Road | street | 44 | 1669 | roads | high | 0.55 |
| `mg_rd_2` | MG Road | arterial | 52 | 71 | roads | high | 0.25 |
| `raj_bhavan_rd_2` | Raj Bhavan Road | arterial | 56 | 96 | roads | high | 0.25 |
| `gandipet_rd_bridge` | Gandipet Road (bridge) | bridge | 32 | 3895 | roads | low | 0.3 |
| `gandipet_rd_2` | Gandipet Road | street | 40 | 417 | roads | medium | 0.35 |
| `bapu_ghat_rd_bridge` | Bapu Ghat Road (bridge) | bridge | 30 | 72 | roads | low | 0.3 |
| `bapu_ghat_rd_2` | Bapu Ghat Road | lane | 22 | 16 | roads | low | 0.6 |
| `bapu_ghat_rd_link` | Bapu Ghat Road | street | 32 | 67 | roads | low | 0.5 |
| `spur_ntr_gardens` | NTR Gardens road | lane | 22 | 144 | roads | low | 0.6 |
| `spur_sanjeevaiah_park` | Sanjeevaiah Park road | lane | 22 | 269 | roads | low | 0.6 |
| `spur_doordarshan_kendra` | Doordarshan Kendra, Ramanthapur road | lane | 22 | 308 | roads | low | 0.6 |
| `spur_nehru_zoo` | Nehru Zoological Park road | lane | 22 | 196 | roads | low | 0.6 |
| `spur_durgam_cheruvu` | Durgam Cheruvu road | lane | 22 | 315 | roads | low | 0.6 |
| `spur_moula_ali_dargah` | Moula Ali Dargah road | lane | 22 | 982 | roads | low | 0.6 |
| `spur_anand_theatre` | Anand Theatre road | lane | 22 | 232 | roads | low | 0.6 |
| `spur_barkas` | Barkas road | lane | 22 | 278 | roads | low | 0.6 |
| `spur_hussain_shah_wali_dargah` | Hussain Shah Wali Dargah & Shaikpet Sarai road | lane | 22 | 295 | roads | low | 0.6 |
| `spur_apollo_hospital_jubilee_hills` | Apollo Hospital, Jubilee Hills road | lane | 22 | 154 | roads | low | 0.6 |
| `spur_hitex` | HITEX Exhibition Centre road | lane | 22 | 874 | roads | low | 0.6 |
| `spur_ashtalakshmi_temple` | Ashtalakshmi Temple, Kothapet road | lane | 22 | 229 | roads | low | 0.6 |

#### Residential infill lanes by district (OSM, ODbL; spacing and minimum length by district, see tools/geo/build_worlddata.cjs INFILL)

| district | lanes | length (u) |
|---|---|---|
| `charminar` | 250 | 38618 |
| `bahadurpura` | 249 | 45831 |
| `puranapul` | 205 | 39898 |
| `secunderabad` | 186 | 44295 |
| `himayatnagar` | 183 | 26073 |
| `dabeerpura` | 155 | 29078 |
| `masab_tank` | 148 | 33945 |
| `falaknuma` | 146 | 32633 |
| `nampally` | 118 | 20424 |
| `rtc_x` | 115 | 21887 |
| `khairatabad` | 114 | 21261 |
| `musheerabad` | 109 | 24074 |
| `malakpet` | 109 | 25591 |
| `kachiguda` | 104 | 21384 |
| `afzalgunj` | 101 | 18233 |
| `abids` | 93 | 14704 |
| `ameerpet` | 91 | 23809 |
| `tolichowki` | 88 | 27094 |
| `chandrayangutta` | 85 | 29053 |
| `chaderghat` | 75 | 14268 |
| `saidabad` | 70 | 18382 |
| `amberpet` | 63 | 18388 |
| `marredpally` | 57 | 16461 |
| `banjara` | 48 | 15553 |
| `erragadda` | 44 | 11653 |
| `koti` | 43 | 5848 |
| `osmania` | 35 | 12867 |
| `jubilee` | 26 | 10855 |
| `basheerbagh` | 25 | 4650 |
| `langar_houz` | 20 | 6598 |
| `zoo` | 14 | 5927 |
| `begumpet` | 9 | 3195 |
| `hussain_sagar` | 4 | 1377 |
| `golconda` | 1 | 397 |

### Railways (6)

| id | name | length (u) |
|---|---|---|
| `rail_hyd_sec` | Hyderabad–Secunderabad line | 6505 |
| `rail_wadi` | Secunderabad–Wadi line (Begumpet, Lingampally) | 10644 |
| `rail_kachiguda` | Secunderabad–Kachiguda–Falaknuma line | 12520 |
| `rail_bolarum` | Bolarum line (Malkajgiri, Safilguda) | 6333 |
| `rail_kazipet` | Kazipet line (Moula Ali) | 2146 |
| `rail_sec_yard` | Secunderabad station loop | 259 |

### Water (66) and parks (136)

| id | name | type |
|---|---|---|
| `himayat_sagar` | Himayat Sagar | water, sand bank 4, high |
| `hussain_sagar` | Hussain Sagar | water, high |
| `mir_alam_tank` | Mir Alam Tank | water, sand bank 8, high |
| `durgam_cheruvu` | Durgam Cheruvu | water, sand bank 4, high |
| `saroornagar_lake` | Saroor Nagar Lake | water, sand bank 6, high |
| `pedda_cheruvu_nacharam` | Pedda Cheruvu | water, sand bank 4, high |
| `pedda_cheruvu_gachibowli` | Pedda Cheruvu | water, sand bank 3, high |
| `ramakrishnapuram_cheruvu` | Ramakrishnapuram Cheruvu | water, sand bank 3, high |
| `talla_cheruvu` | Talla Cheruvu | water, sand bank 3, high |
| `khajaguda_lake` | Khajaguda Lake | water, sand bank 3, high |
| `tank_01` | Tank | water, sand bank 3, high |
| `chinna_maisamma_cheruvu` | Chinna Maisamma Cheruvu | water, sand bank 3, high |
| `bon_cheruvu` | Bon Cheruvu | water, sand bank 3, high |
| `gurram_cheruvu` | Gurram Cheruvu | water, sand bank 3, high |
| `banda_cheruvu` | Banda Cheruvu | water, sand bank 3, high |
| `malkam_cheruvu` | Malakam Cheruvu | water, sand bank 3, high |
| `shah_hatim_talab` | Shah Hatim Talab | water, sand bank 3, high |
| `khajaguda_talab` | Khajaguda Talab | water, sand bank 3, high |
| `mantrala_cheruvu` | Mantrala Cheruvu | water, sand bank 3, high |
| `peeran_cheruvu` | Peeran Cheruvu | water, sand bank 3, high |
| `tank_02` | Tank | water, sand bank 3, high |
| `salkam_cheruvu` | Salkam Cheruvu | water, sand bank 3, high |
| `palle_cheruvu` | Palle Cheruvu | water, sand bank 3, high |
| `chandana_cheruvu` | Chandana Cheruvu | water, sand bank 3, high |
| `manikonda_cheruvu` | Manikonda Cheruvu | water, sand bank 3, high |
| `safilguda_lake` | Safilguda Lake Park | water, sand bank 4, high |
| `tank_03` | Tank | water, sand bank 3, high |
| `langar_houz_tank` | Langar Hauz | water, sand bank 3, high |
| `timber_lake` | Timber Lake | water, sand bank 3, high |
| `bairagiguda_lake` | Bairagiguda Lake | water, sand bank 3, high |
| `nacharam_cheruvu` | Nacharam Cheruvu | water, sand bank 3, high |
| `tank_04` | Tank | water, sand bank 3, high |
| `peacock_lake` | Peacock Lake | water, sand bank 3, high |
| `timmidkunta_lake` | Timmidkunta Lake | water, sand bank 3, high |
| `mullakathuva_cheruvu` | Mullakathuva Cheruvu | water, sand bank 3, high |
| `pushparahil_cheruvu` | pushparahil cheruvu | water, sand bank 3, high |
| `ramanthapur_cheruvu` | Ramanthapur Cheruvu | water, sand bank 3, high |
| `ramanthapur_lake` | ramanthapur lake | water, sand bank 3, high |
| `sunnam_cheruvu` | sunnam cheruvu | water, sand bank 3, high |
| `chinna_cheruvu` | Chinna Cheruvu | water, sand bank 3, high |
| `tank_05` | Tank | water, sand bank 3, high |
| `kamuni_cheruvu` | Kamuni Cheruvu | water, sand bank 3, high |
| `chiraan_kunta` | Chiraan Kunta | water, sand bank 3, high |
| `drdo_tamhankar_lake` | DRDO Tamhankar Lake | water, sand bank 3, high |
| `singos_tank` | Singos Tank | water, sand bank 3, high |
| `hakimpet_kunta` | Hakimpet Kunta | water, sand bank 3, high |
| `tank_06` | Tank | water, sand bank 3, high |
| `kotla_cheruvu` | Kotla Cheruvu | water, sand bank 3, high |
| `sigma_lake` | sigma lake | water, sand bank 3, high |
| `noor_mohammed_cheruvu` | Noor Mohammed Cheruvu | water, sand bank 3, high |
| `banjara_lake` | Banjara Lake | water, sand bank 4, high |
| `chintal_cheruvu` | Chintal Cheruvu | water, sand bank 3, high |
| `wipro_lake` | Wipro Lake | water, sand bank 3, high |
| `tank_07` | Tank | water, sand bank 3, high |
| `kudikunta_lake` | Kudikunta Lake | water, sand bank 3, high |
| `tank_08` | Tank | water, sand bank 3, high |
| `tank_09` | Tank | water, sand bank 3, high |
| `erra_kunta` | Erra Kunta | water, sand bank 3, high |
| `lotus_pond` | Lotus Pond | water, sand bank 3, high |
| `musi` | Musi River | water (river), sand bank 6, high |
| `esi_river` | Esi (Esa) River | water (river), sand bank 4, high |
| `ashoknagar_nala_1` | Ashoknagar Nala | water (nala), sand bank 2, high |
| `ashoknagar_nala_3` | Ashoknagar Nala | water (nala), sand bank 2, high |
| `laxmi_nagar_nala_1` | Laxmi Nagar Nala | water (nala), sand bank 2, high |
| `laxmi_nagar_nala_2` | Laxmi Nagar Nala | water (nala), sand bank 2, high |
| `mecca_masjid_houz` | Mecca Masjid pond | water, medium |
| `musi_bed` | Musi riverbed | park: ground (sand), high |
| `charminar_plaza` | Charminar Plaza | park: plaza |
| `gulzar_houz_sq` | Gulzar Houz Square | park: plaza |
| `mecca_masjid_courtyard` | Mecca Masjid Courtyard | park: plaza |
| `mecca_masjid_pigeons` | Mecca Masjid pigeon square | park: plaza |
| `imlibun_bays` | Imlibun bus bays | park: plaza |
| `koti_bus_bays` | Koti bus bays | park: plaza |
| `koti_womens_college_grounds` | Koti Women's College lawns | park: garden |
| `nampally_platforms` | Nampally station platforms | park: plaza |
| `exhibition_grounds` | Exhibition Grounds (Numaish) | park: ground |
| `public_gardens` | Public Gardens (Bagh-e-Aam) | park: garden, high |
| `gun_park` | Gun Park | park: garden, high |
| `lb_stadium_field` | LB Stadium field | park: grass |
| `naubat_pahad` | Naubat Pahad | park: rock, high |
| `khairatabad_ganesh_ground` | Khairatabad Ganesh ground | park: ground |
| `raj_bhavan_grounds` | Raj Bhavan grounds | park: garden |
| `lumbini_park` | Lumbini Park | park: garden, high |
| `ntr_gardens` | NTR Gardens | park: garden, high |
| `sanjeevaiah_park` | Sanjeevaiah Park | park: grass, high |
| `indira_park` | Indira Park | park: garden, high |
| `parade_grounds` | Parade Grounds | park: ground, high |
| `clock_tower_park` | Clock Tower park | park: garden |
| `secunderabad_platforms` | Secunderabad platforms | park: plaza |
| `begumpet_runway` | Begumpet runway | park: plaza |
| `begumpet_apron` | Begumpet apron | park: plaza |
| `kachiguda_platforms` | Kachiguda platforms | park: plaza |
| `osmania_campus` | Osmania University campus | park: grass, low |
| `golconda_hill` | Golconda hill | park: rock, high |
| `golconda_inner` | Golconda inner court | park: ground |
| `qutb_shahi_gardens` | Qutb Shahi Tombs gardens | park: garden |
| `nehru_zoo` | Nehru Zoological Park | park: garden, low |
| `falaknuma_hill` | Falaknuma hill | park: rock, high |
| `cyber_towers_plaza` | Cyber Towers forecourt | park: plaza |
| `shilparamam` | Shilparamam crafts village | park: garden |
| `kbr_park` | KBR Park | park: rock, high |
| `moula_ali_hill` | Moula Ali hill | park: rock, high |
| `playground_home` | Lakshmi Nagar colony ground | park: ground |
| `school_1_ground` | Saraswati Vidya Mandir ground | park: ground |
| `playground_14` | Ashok Nagar ground | park: ground |
| `school_2_ground` | Vivekananda school ground | park: ground |
| `playground_2` | Vidyanagar colony ground | park: ground |
| `school_3_ground` | Kachiguda school ground | park: ground |
| `playground_3` | Nallakunta ground | park: ground |
| `playground_11` | Amberpet ground | park: ground |
| `school_4_ground` | Vijayanagar school ground | park: ground |
| `playground_12` | Masab Tank ground | park: ground |
| `school_5_ground` | Tolichowki school ground | park: ground |
| `playground_10` | Tolichowki maidan | park: ground |
| `school_6_ground` | SR Nagar school ground | park: ground |
| `playground_9` | SR Nagar park ground | park: ground |
| `school_7_ground` | Musheerabad school ground | park: ground |
| `playground_4` | Bholakpur ground | park: ground |
| `school_8_ground` | Holy Family school ground | park: ground |
| `playground_5` | Marredpally ground | park: ground |
| `school_9_ground` | Railway school ground | park: ground |
| `playground_6` | Lalaguda railway ground | park: ground |
| `malakpet_race_course` | Malakpet race course | park: ground, low |
| `school_10_ground` | Malakpet school ground | park: ground |
| `school_11_ground` | Dilsukhnagar school ground | park: ground |
| `playground_7` | Chaitanyapuri ground | park: ground |
| `school_12_ground` | Saidabad school ground | park: ground |
| `playground_8` | Saidabad maidan | park: ground |
| `school_13_ground` | Shah Ali Banda school ground | park: ground |
| `playground_13` | Shah Ali Banda maidan | park: ground |
| `gymkhana_ground_secunderabad` | Gymkhana Ground | park: grass, high |
| `secunderabad_club_lawns` | Secunderabad Club lawns | park: garden |
| `rathifile_bays` | Rathifile bus bays | park: plaza |
| `hps_campus` | Hyderabad Public School grounds | park: ground |
| `victory_playground` | Victory Playground | park: ground, high |
| `mehdipatnam_depot_bays` | Mehdipatnam bus bays | park: plaza |
| `harina_vanasthali` | Mahavir Harina Vanasthali | park: rock |
| `playground_15` | Erragadda colony ground | park: ground |
| `playground_16` | KPHB colony ground | park: ground |
| `dilsukhnagar_sai_temple_compound` | Sai Baba Temple, Dilsukhnagar compound | park: plaza |
| `ujjaini_mahankali_temple_compound` | Ujjaini Mahankali Temple compound | park: plaza |
| `lal_darwaza_temple_compound` | Lal Darwaza Mahankali Temple compound | park: plaza |
| `temple_1_compound` | Sri Venkateswara Temple compound | park: plaza |
| `temple_2_compound` | Hanuman Temple compound | park: plaza |
| `temple_3_compound` | Shankar Mutt compound | park: plaza |
| `temple_4_compound` | Pochamma Temple compound | park: plaza |
| `temple_5_compound` | Sri Rama Temple, Tarnaka compound | park: plaza |
| `temple_6_compound` | Ayyappa Temple compound | park: plaza |
| `peddamma_temple_compound` | Peddamma Temple compound | park: plaza |
| `karmanghat_hanuman_temple_compound` | Karmanghat Hanuman Temple compound | park: plaza |
| `ashtalakshmi_temple_compound` | Ashtalakshmi Temple, Kothapet compound | park: plaza |
| `balkampet_yellamma_temple_compound` | Balkampet Yellamma Temple compound | park: plaza |
| `akkanna_madanna_temple_compound` | Akkanna Madanna Mahankali Temple compound | park: plaza |
| `katta_maisamma_temple_compound` | Katta Maisamma Temple compound | park: plaza |
| `iskcon_abids_compound` | ISKCON Temple, Abids compound | park: plaza |
| `secunderabad_ganesh_temple_compound` | Sri Ganesh Temple (Secunderabad station) compound | park: plaza |
| `spanish_mosque_compound` | Spanish Mosque compound | park: garden |
| `jama_masjid_charminar_compound` | Jama Masjid (Charminar) compound | park: plaza |
| `khairatabad_mosque_compound` | Khairatabad Mosque compound | park: plaza |
| `mosque_1_compound` | Mallepally Masjid compound | park: plaza |
| `mosque_2_compound` | Tolichowki Masjid compound | park: plaza |
| `mosque_3_compound` | Musheerabad Jama Masjid compound | park: plaza |
| `mosque_4_compound` | Malakpet Masjid compound | park: plaza |
| `mosque_5_compound` | Saidabad Masjid compound | park: plaza |
| `mosque_6_compound` | Shah Ali Banda Masjid compound | park: plaza |
| `mosque_7_compound` | Falaknuma Masjid compound | park: plaza |
| `mosque_8_compound` | Begum Bazaar Masjid compound | park: plaza |
| `dargah_yousufain_compound` | Dargah Yousufain compound | park: plaza |
| `hussain_shah_wali_dargah_compound` | Hussain Shah Wali Dargah & Shaikpet Sarai compound | park: plaza |
| `moula_ali_dargah_compound` | Moula Ali Dargah compound | park: plaza |
| `church_st_josephs_compound` | St. Joseph's Cathedral compound | park: garden |
| `church_st_marys_compound` | St. Mary's Church compound | park: garden |
| `church_wesley_compound` | Wesley Church compound | park: garden |
| `church_1_compound` | Methodist Church, Marredpally compound | park: garden |
| `church_2_compound` | CSI Church, Chikkadpally compound | park: garden |
| `st_johns_church_secunderabad_compound` | St. John's Church compound | park: garden |
| `st_georges_church_abids_compound` | St. George's Church compound | park: garden |
| `holy_trinity_church_bolarum_compound` | Holy Trinity Church, Bolarum compound | park: garden |
| `gurudwara_gowliguda_compound` | Central Gurudwara Sahib, Gowliguda compound | park: plaza |
| `ramakrishna_math_compound` | Ramakrishna Math, Domalguda compound | park: garden |
| `purani_haveli_compound` | Purani Haveli (Nizam's Museum) compound | park: garden |
| `king_kothi_compound` | King Kothi Palace (gated) compound | park: garden |
| `errum_manzil_compound` | Errum Manzil (gate) compound | park: garden |
| `hill_fort_palace_compound` | Hill Fort Palace (locked) compound | park: garden |
| `rashtrapati_nilayam_compound` | Rashtrapati Nilayam (gated) compound | park: garden |
| `falaknuma_palace_compound` | Falaknuma Palace (closed) compound | park: garden |
| `chowmahalla_palace_compound` | Chowmahalla Palace (closed for restoration) compound | park: garden |
| `high_court_compound` | High Court compound | park: garden |
| `salar_jung_museum_compound` | Salar Jung Museum compound | park: garden |
| `osmania_hospital_compound` | Osmania General Hospital compound | park: garden |
| `state_central_library_compound` | State Central Library compound | park: garden |
| `nizam_college_compound` | Nizam College compound | park: grass |
| `city_college_compound` | Government City College compound | park: grass |
| `secretariat_compound` | Secretariat compound | park: garden |
| `kachiguda_station_compound` | Kachiguda Station compound | park: plaza |
| `nampally_station_compound` | Nampally Station (Hyderabad Deccan) compound | park: plaza |
| `secunderabad_station_compound` | Secunderabad Station compound | park: plaza |
| `hill_jalal_pahad` | Jalal Pahad | park: rock, high |
| `hill_fakhruddin_gutta` | Fakhruddin Gutta (Khajaguda rocks) | park: rock, high |
| `jalagam_vengal_rao_park` | Jalagam Vengal Rao Park | park: garden, high |
| `chacha_nehru_park` | Chacha Nehru Park | park: garden, high |
| `ntr_stadium_ground` | NTR Stadium | park: ground, high |

