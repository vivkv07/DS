# NOSTALGIA — Map plan (MAP_PLAN_FINAL)

The whole of Hyderabad and Secunderabad, early 2000s, as `N.WORLD_DATA`. This document is
the plan the map was authored from and the reference for the engine, the two art modules
and the story team. The tables at the end are generated from the live data, so they are
exact.

| File | What it is | Owner |
|---|---|---|
| `src/worlddata.js` | The map: districts, water, roads, rails, parks, landmarks, places, spawns. Carries the `// MAP_PLAN_FINAL` marker, so the engine never overwrites it. | map |
| `src/world_extras.js` | Paints the railways (and level crossings) into the ground chunks and the minimap, makes rail bridges walkable, adds level-crossing booms. Loaded right after `world.js`. | map |
| `tools/validate_map.cjs` | `node tools/validate_map.cjs` validates the map (ids, must-haves, bounds, district tiling, places on walkable ground, footprints off roads and water, one connected road network). `--tables` prints the tables below. | map |
| `tests/map_preview.cjs` | Renders `tests/out/map_overview.png` (2000 x 1500) plus zoomed crops (`map_core`, `map_oldcity`, `map_lake`, `map_east`, `map_west`, `map_south`), then boots the real game (`index.html#debug`) and teleports to 33 places (`map_tp_<id>.png`). Fails on any console or page error. `TP=id,id` limits the teleports; `--no-engine` / `--only-engine`. | map |

Current numbers: 39 districts, 8 water bodies, 175 roads plus 6 railway lines, 128 parks,
421 landmarks using 122 draw ids, 547 places, ~690 boulders, ~1,700 building blocks
(world.js turns them into ~9,700 lots and ~14,500 structures). The data expansion takes
~60-75 ms in headless Chromium, and world.js builds the city in ~0.3 s.

## 1. Scale and shape

World 8000 x 6000 u, north up, +y south. Real geography (km east / north of Charminar) is
mapped by a piecewise-linear squeeze: about **0.43 u per metre in the core** (Charminar to
Hussain Sagar, Mehdipatnam to Kachiguda), about 0.3 u/m in the rocky west and the outskirts.
Buildings and landmarks are drawn at "game scale" (Charminar 64 x 64 u), so the city is
compressed the way GTA cities are, but every neighbour relation is real: you can navigate it
with a 1999 city map in your head.

| Real (km E, km N of Charminar) | World x, y | Place |
|---|---|---|
| 0, 0 | 3900, 4360 | Charminar (finale) |
| 0, +1.2 | 3915, 3800 | Naya Pul over the Musi |
| +1.0, +2.6 | 4330, 3240 | Koti |
| 0, +3.4 | 3960, 2950 | Abids |
| -0.4, +4.2 | 3700, 2610 | Public Gardens and the Assembly |
| 0, +5.4 | 3880, 1990 | Lumbini Park (south tip of Hussain Sagar) |
| 0, +6.0 | 3880, 1790 | Buddha statue |
| +2.35, +4.95 | 4915, 2230 | RTC X Roads |
| +2.5, +8.7 | 4955, 860 | Secunderabad Clock Tower |
| -0.8, +10.2 | 3480, 360 | Begumpet runway |
| -7.8, +2.4 | 1080, 3300 | Golconda Fort |
| -10, +9.9 | 430, 500 | Cyber Towers |
| +5.5, +0.8 | 6300, 3998 | Dilsukhnagar Sai Baba temple |
| -0.8, -3.4 | 3530, 5450 | Falaknuma Palace |

**The spine runs south to north**, as in real life: the Old City (Charminar, Gulzar Houz,
Pathergatti, Madina) → Naya Pul over the **Musi** (a narrow channel in a wide sandy bed, five
bridges plus Moosarambagh and Nagole) → the Afzalgunj civic trio (Osmania General Hospital,
State Central Library on the north bank; High Court and Salar Jung Museum on the south bank)
→ Imlibun (MGBS) and the Gowliguda hangar → Koti, Sultan Bazaar, Abids, Mozamjahi Market,
Nampally (station, Numaish grounds) → Public Gardens, the Assembly, LB Stadium, Basheerbagh,
Birla Mandir and the Planetarium on Naubat Pahad → **Hussain Sagar**, ringed by the Tank
Bund (east, with 12 statues), Necklace Road (west and north, coconut palms, Prasads IMAX,
NTR Gardens, Sanjeevaiah Park) and Secretariat Road (south, Lumbini Park) → Secunderabad
(Paradise, Clock Tower, station, Parade Grounds, Monda Market) and Begumpet (airport,
Spanish Mosque). East of the lake: Indira Park, Himayatnagar and Narayanguda (the player's
home), RTC X Roads and its four cinemas, Chikkadpally, Vidyanagar, Barkatpura, Kachiguda
station, Osmania University, Tarnaka; south-east: Malakpet, Dilsukhnagar, Kothapet, LB Nagar.
West: Lakdikapul, Khairatabad, Masab Tank, Mehdipatnam, Tolichowki, Golconda and the Qutb
Shahi Tombs, Banjara and Jubilee Hills among the boulders, Ameerpet, Erragadda, and HITEC
City far north-west.

**Railways** (`rails[]`): Nampally terminus → Lakdikapul → Khairatabad → along Necklace Road
→ Sanjeevaiah Park junction → James Street → Secunderabad (east-west platforms); branches to
Begumpet and Wadi (west edge), Bolarum (north edge), Kazipet (east edge), and Secunderabad →
Sitaphalmandi → Arts College (OU) → Vidyanagar → Kachiguda → over the Musi → Malakpet →
Dabeerpura → Yakutpura → Falaknuma → south edge.

## 2. Data conventions (binding for everyone who reads `N.WORLD_DATA`)

- **Landmarks** `{id, name, draw, x, y, w, d, h, face?, ...}`: `x, y` = centre; `w` = east-west,
  `d` = north-south; `h` = suggested art height (10 u = one storey; tall things are kept modest
  because of the pseudo-3D lean). `face` = the side the entrance or shopfront looks at
  (`n|s|e|w`). Extra fields the art can use: `variant`, `sign` (painted signboard text),
  `films` (fictional titles for cinema hoardings), `gated` (closed in the early 2000s: show
  locked gates), `era` (opening-date note), `seasonal` (`ganesh`), `axis` (for arches),
  `idx`, `faceAngle` (Tank Bund statues), `summit`, `hill`, `clap`, `terrace`.
- **Collision**: by default the whole footprint is solid. `noSolid: true` = walk/drive
  through (arches, canopies, sheds) and `solids: [[x, y, w, h], ...]` lists the real posts and
  walls (the Char Kaman piers, MGBS terminal block, LB Stadium stands with gates, rythu bazaar
  counters). The Charminar plaza, Gulzar Houz square, Mecca Masjid courtyard, station
  platforms and bus bays are `plaza` parks. Places of worship and palaces sit in a
  `<id>_compound` park (paved or garden), so generated houses keep a respectful distance and
  crowds have room.
- **Places** `{id, name, x, y, r, district, kind}`: always a walkable point right next to the
  thing it names (on the footpath, a plaza or in a park, never inside a footprint or water).
  Teleporting there never pushes the player. `alias: '<other id>'` marks a second id for the
  same spot (e.g. `irani_cafe_1` = `nimrah_cafe`, `playground_1` = `playground_home`). Extra
  fields: `festival`, `boat`, `offMap`, `final`, `minigame`, `era`, `season`, `roof`, `inWater`.
- **Roads**: real names; kinds `arterial` (52-56 u, painted median), `street` (34-44 u),
  `lane` (20-24 u, colony gallis), `bund` (Tank Bund, 60 u), `bridge`, `path` (park walks and
  the Birla Mandir steps; not in the road graph). T-junction endpoints lie on the other road's
  centreline (world.js snaps them). `spur: true` marks deliberate dead ends that lead to a gate
  (Fateh Darwaza, MGBS, airport terminal, Chowmahalla, Falaknuma...). `trees` is a hint.
- **Districts** tile the world with no gaps or overlaps (rects). `fill` (0..1) and `lot`
  ([min, max] u) steer the block filler; `style` drives world.js's building palette.
- **Expansion step** (bottom of `worlddata.js`, deterministic, no `Math.random`): fills each
  place's `district`, plants avenue trees (coconut palms on Necklace Road, palms on the Tank
  Bund lake edge, banyans in OU, gulmohars on SP Road...), scatters Deccan boulders in the
  rocky districts away from everything, and derives `blocks[]` from the free land between roads
  (square-ish rectangles on a 16 u raster). `noFill[]` keeps land open (the airport).
  `meta = {expandMs, blocks, rocks, trees}`.
- **Spawns**: `player` and `home` = `[4580, 2619]` (the home gate); `title` = a camera spot
  near Charminar for the title screen.

## 3. Notes for the engine (world.js, main.js, index.html)

- `src/world_extras.js` must load right after `src/world.js` (index.html already does). It
  wraps `N.render.setGroundPainter` and `N.world.renderMap` at load time and listens to
  `'world:built'`. Without it the game still runs; the railways are just not drawn.
- Railway cells stay GROUND (walkable, vehicles slowed); where a line crosses water the cells
  become BRIDGE (walkable, boats pass under). Level crossings get painted warning bars and two
  raised red-white boom posts (custom structures).
- The Buddha's island is a keyhole hole in the Hussain Sagar polygon (dry GROUND); the lake
  has `bank: 0` so no sand causeway forms along the slit. The island is reached by boat from
  `lumbini_jetty` (~190 u).
- The Musi is a 60 u channel with `bank: 42` (sandy bed). Bridges are `bridge` roads.
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
| `tank_bund_statue` | 12 | 8 x 8 x 30 | Bronze figures of Telugu greats on tall stone plinths with name plaques along the lake edge of the bund; `faceAngle` points at the road; lit at night. |
| `kakatiya_arch` | 2 | 20 x 10 x 30 | Kakatiya thoranam replica at each end of the Tank Bund. |
| `clock_tower` | 2 | 18 x 18 x 72 | Secunderabad Clock Tower (1896, stone, in its park); `variant: mahboob_chowk` for the 1892 Mahboob Chowk tower at the west end of Laad Bazaar (16 x 16 x 52). |
| `spanish_mosque` | 1 | 40 x 40 x 44 | Moorish mosque with pointed spires instead of domes (Begumpet). |
| `ou_arts_college` | 1 | 200 x 70 x 40 | Osmania Arts College: long monumental pinkish-grey granite front mixing Ajanta/Ellora pillars with Indo-Saracenic arches, big arched entrance, in a green rocky campus. |
| `fort_wall` | 5 | long strips x 28 | Golconda curtain walls with semicircular bastions and crenellations (sandstone/granite #b98f5e / #8f8a86). |
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

**Home.** The player lives in **Lakshmi Nagar Colony, Himayatnagar** (the name is just a
string in `places.home.name` and the lane names; rename freely). The colony is the block
between Himayatnagar Main Road (west), the Himayatnagar–Chikkadpally road (north),
Chikkadpally Road (east) and Narayanguda Road (south), with two cross streets and a main
street. On it: `home` (gate, spawn) and `home_terrace`, the colony ground `playground_home`
(alias `playground_1`, swings and slide), `friend_home` across the ground, `kirana_1`
(Sri Lakshmi Kirana), `pindi_girni_1`, `temple_1` with `flower_cart_1`, `chai_bandi_1`,
`std_1`, `medical_shop_8`, `barber_7`, `cycle_rent_5` and the colony water tank. Next door:
Hyderguda (`school_1` with its ground, `stationery_1`, `internet_cafe_1`, `irani_cafe_7`
Hotel Sarvar at Narayanguda), Ashok Nagar (`playground_14`), RTC X Roads five minutes away.

**Travel times** (road distance ≈ 1.3 x straight line; run 80 u/s, cycle 115, auto 135):

| From → to | road u | run | cycle | auto |
|---|---|---|---|---|
| home → RTC X Roads | ~670 | 8 s | 6 s | 5 s |
| home → Koti bus stand | ~870 | 11 s | 8 s | 6 s |
| home → LB Stadium | ~950 | 12 s | 8 s | 7 s |
| home → Mozamjahi Market | ~1230 | 15 s | 11 s | 9 s |
| home → Tank Bund | ~1350 | 17 s | 12 s | 10 s |
| home → Charminar | ~2350 | 29 s | 20 s | 17 s |
| home → Secunderabad Clock Tower | ~2300 | 29 s | 20 s | 17 s |
| home → Dilsukhnagar Sai Baba temple | ~2830 | 35 s | 25 s | 21 s |
| home → Begumpet airport | ~3080 | 39 s | 27 s | 23 s |
| home → Golconda Fort | ~4280 | 54 s | 37 s | 32 s |
| home → Cyber Towers | ~5990 | 75 s | 52 s | 44 s |
| Charminar → Golconda (the tunnel legend) | ~3570 | 45 s | 31 s | 26 s |
| Lumbini jetty → Buddha (boat 60 u/s) | ~190 | | | ~3 s by boat |

**The finale.** `charminar` (north side of the monument, on the plaza), `charminar_plaza`
(the open paved square, south-east), the ring road `charminar_circle` around it (traffic can be
stopped for the scene), the four Char Kaman arches over Gulzar Houz (`gulzar_houz`,
`patang_bazaar` kite stalls), `laad_bazaar` running west to Mahboob Chowk, `nimrah_cafe`
(alias `irani_cafe_1`) facing Charminar, `mecca_masjid` and its courtyard to the south-west
(walk-only, respectful), `jama_masjid_charminar`, `pathergatti` / `hotel_madina` to the north,
then Naya Pul and the Musi.

**Festivals.** `ganesh_immersion` = `ganesh_immersion_point` on the Tank Bund (cranes; the
statues `tank_bund_statues` line the route), idols from `khairatabad_ganesh` and the Dhoolpet
workshops (`dhoolpet`, `idol_workshop_*`). `bonalu` = `ujjaini_mahankali_temple` (General
Bazaar, Secunderabad); also `lal_darwaza_temple`, `akkanna_madanna_temple`,
`golconda_jagadamba_temple` (where the season starts), `balkampet_yellamma_temple`,
`katta_maisamma_temple` all carry `festival: 'bonalu'`. Numaish: `nampally_exhibition`.

**Mission givers.** One anchor per district: `giver_<district>` (36), a footpath spot where an
NPC can stand. **Hidden spots** for collectibles: `hide_*` (41) in parks, on the Musi sand,
behind water tanks, on rocks, in the old gardens.

**Era (story set 2000-2003).** Prasads IMAX opens July 2003; NTR Gardens open from about 2000;
HITEX is a construction site before 14 Jan 2003; Chowmahalla, Falaknuma, King Kothi, Hill Fort
Palace, Rashtrapati Nilayam and Errum Manzil are gated; Begumpet is the working airport; no
metro, no flyovers. Off-map trips leave by road edges: `gandipet`, `chilkur_balaji`,
`mrugavani_park`, `himayat_sagar` (west), `ramoji_film_city` and `vijayawada_highway`
(south-east, bus-trip scenes from `imlibun_bus_station` / `koti_bus_stand`).

## 6. How to change the map

1. Edit `src/worlddata.js` (helpers: `road`, `rail`, `water`, `park`, `lm`, `site` = landmark +
   place at its entrance, `S` = shop beside a road at fraction `t` on side `'L'|'R'`, `shop`,
   `place`, `alias`, `laneV/laneH`, `compound`).
2. `node tools/validate_map.cjs` must say `OK: 0 errors`.
3. `node tests/map_preview.cjs` and look at `tests/out/map_*.png`.
4. Regenerate the tables below: replace everything after the marker with the output of
   `node tools/validate_map.cjs --tables`.

## 7. Generated tables

<!-- GENERATED TABLES BELOW (node tools/validate_map.cjs --tables) -->

### Districts (39)

| id | name | Telugu | rect [x, y, w, h] | style | ground | block fill |
|---|---|---|---|---|---|---|
| `hitec` | Madhapur & HITEC City | మాదాపూర్ & హైటెక్ సిటీ | 0, 0, 1500, 1250 | hitec | #b39b74 | 0.5 |
| `erragadda` | Erragadda & Sanathnagar | ఎర్రగడ్డ | 1500, 0, 1150, 760 | colony | #ad9670 | 0.9 |
| `begumpet` | Begumpet | బేగంపేట | 2650, 0, 1650, 760 | posh | #a39b72 | 0.8 |
| `secunderabad` | Secunderabad | సికింద్రాబాద్ | 4300, 0, 1400, 1250 | cantonment | #a49d74 | 0.9 |
| `marredpally` | Marredpally & Malkajgiri | మారేడ్‌పల్లి | 5700, 0, 2300, 1250 | cantonment | #a19c70 | 0.7 |
| `ameerpet` | Ameerpet & SR Nagar | అమీర్‌పేట | 1500, 760, 1800, 490 | colony | #ac9670 | 0.94 |
| `hussain_sagar` | Hussain Sagar & Necklace Road | హుస్సేన్ సాగర్ | 3300, 760, 1000, 1320 | colonial | #9fa071 | 0.6 |
| `jubilee` | Jubilee Hills & Film Nagar | జూబ్లీ హిల్స్ | 0, 1250, 1700, 900 | rocky | #a8936f | 0.5 |
| `banjara` | Banjara Hills | బంజారా హిల్స్ | 1700, 1250, 1150, 900 | posh | #a19970 | 0.75 |
| `khairatabad` | Panjagutta & Khairatabad | ఖైరతాబాద్ | 2850, 1250, 450, 900 | colony | #ab9670 | 0.94 |
| `musheerabad` | Musheerabad & Indira Park | ముషీరాబాద్ | 4300, 1250, 1000, 830 | colony | #ab9670 | 0.94 |
| `osmania` | Osmania University & Tarnaka | ఉస్మానియా యూనివర్సిటీ | 5300, 1250, 2700, 1450 | rocky | #a59a6e | 0.5 |
| `golconda` | Golconda & Qutb Shahi Tombs | గోల్కొండ | 0, 2150, 1450, 1300 | rocky | #b0946c | 0.35 |
| `tolichowki` | Tolichowki & Mehdipatnam | టోలిచౌకి & మెహదీపట్నం | 1450, 2150, 1150, 1150 | colony | #ae966f | 0.9 |
| `masab_tank` | Masab Tank & Lakdikapul | మాసాబ్ ట్యాంక్ | 2600, 2150, 700, 1200 | colony | #ac9670 | 0.94 |
| `basheerbagh` | Public Gardens & Basheerbagh | బషీర్‌బాగ్ | 3300, 2080, 780, 680 | colonial | #a49c72 | 0.85 |
| `himayatnagar` | Himayatnagar & Narayanguda | హిమాయత్‌నగర్ | 4080, 2080, 680, 680 | colony | #ad9771 | 0.96 |
| `rtc_x` | RTC X Roads & Chikkadpally | ఆర్టీసీ క్రాస్ రోడ్స్ | 4760, 2080, 540, 680 | market | #b09a7a | 0.96 |
| `nampally` | Nampally & Mozamjahi Market | నాంపల్లి | 3300, 2760, 580, 590 | market | #b19a7c | 0.96 |
| `abids` | Abids | ఆబిడ్స్ | 3880, 2760, 320, 590 | market | #b29b7e | 0.97 |
| `koti` | Koti & Sultan Bazaar | కోఠి | 4200, 2760, 500, 590 | market | #b39b7d | 0.97 |
| `kachiguda` | Kachiguda & Barkatpura | కాచిగూడ | 4700, 2760, 600, 590 | colony | #ad9771 | 0.94 |
| `amberpet` | Amberpet & Nallakunta | అంబర్‌పేట | 5300, 2700, 2700, 650 | colony | #ab9670 | 0.8 |
| `langar_houz` | Langar Houz & Attapur | లంగర్ హౌస్ | 1450, 3300, 1150, 1500 | colony | #ae956c | 0.7 |
| `puranapul` | Puranapul & Dhoolpet | పురానాపూల్ | 2600, 3350, 950, 600 | oldcity | #b5a081 | 0.96 |
| `afzalgunj` | Afzalgunj & the Musi | అఫ్జల్‌గంజ్ | 3550, 3350, 600, 600 | colonial | #b19d7e | 0.9 |
| `chaderghat` | Chaderghat & Imlibun | చాదర్‌ఘాట్ | 4150, 3350, 650, 600 | market | #b09a7b | 0.95 |
| `malakpet` | Malakpet | మలక్‌పేట | 4800, 3350, 900, 950 | colony | #ad9771 | 0.92 |
| `dilsukhnagar` | Dilsukhnagar & Kothapet | దిల్‌సుఖ్‌నగర్ | 5700, 3350, 1300, 1050 | colony | #ae9771 | 0.92 |
| `lb_nagar` | LB Nagar & Nagole | ఎల్బీ నగర్ | 7000, 3350, 1000, 2650 | colony | #ad966e | 0.6 |
| `charminar` | Charminar | చార్మినార్ | 3550, 3950, 700, 850 | oldcity | #b8a384 | 0.98 |
| `bahadurpura` | Bahadurpura & Hussaini Alam | బహదూర్‌పురా | 2600, 3950, 950, 850 | oldcity | #b5a082 | 0.92 |
| `dabeerpura` | Purani Haveli & Dabeerpura | దబీర్‌పురా | 4250, 3950, 550, 850 | oldcity | #b6a183 | 0.96 |
| `saidabad` | Saidabad | సైదాబాద్ | 4800, 4300, 900, 500 | colony | #ad966f | 0.85 |
| `rajendranagar` | Rajendranagar Fields | రాజేంద్రనగర్ | 0, 3450, 1450, 2550 | rocky | #ad9468 | 0.22 |
| `zoo` | Nehru Zoo & Mir Alam Tank | మీర్ ఆలం | 1450, 4800, 1850, 1200 | rocky | #a99a6c | 0.3 |
| `falaknuma` | Falaknuma | ఫలక్‌నుమా | 3300, 4800, 1100, 1200 | oldcity | #b39c7c | 0.75 |
| `chandrayangutta` | Chandrayangutta & Santoshnagar | చాంద్రాయణగుట్ట | 4400, 4800, 1300, 1200 | colony | #ae956d | 0.7 |
| `saroornagar` | Saroornagar | సరూర్‌నగర్ | 5700, 4400, 1300, 1600 | colony | #ad966e | 0.65 |

### Landmarks drawn by src/landmarks.js (113)

x, y = centre; w = east-west, d = north-south, h = suggested art height (1 storey = 10 u).

| draw | id | name | x | y | w | d | h | face | notes |
|---|---|---|---|---|---|---|---|---|---|
| ashurkhana | `badshahi_ashurkhana` | Badshahi Ashurkhana | 3700 | 4182 | 50 | 40 | 26 | n |  |
| assembly | `assembly` | Legislative Assembly | 3755 | 2552 | 66 | 70 | 40 | e |  |
| birla_mandir | `birla_mandir` | Birla Mandir | 3722 | 2212 | 64 | 56 | 52 | s |  |
| birla_planetarium | `birla_planetarium` | Birla Planetarium & Science Museum | 3505 | 2296 | 58 | 58 | 36 | s |  |
| british_residency | `koti_womens_college` | Koti Women's College (British Residency) | 4585 | 3318 | 110 | 60 | 34 | n |  |
| buddha_statue | `buddha_statue` | Buddha Statue (Gibraltar Rock) | 3880 | 1790 | 20 | 20 | 60 | s |  |
| charminar | `charminar` | Charminar | 3900 | 4360 | 64 | 64 | 90 | n | 1591 |
| chowmahalla | `chowmahalla_palace` | Chowmahalla Palace (closed for restoration) | 3608 | 4550 | 150 | 170 | 30 | n | gated |
| church | `church_1` | Methodist Church, Marredpally | 5600 | 560 | 40 | 56 | 40 | e |  |
| church | `church_2` | CSI Church, Chikkadpally | 4720 | 2384 | 34 | 40 | 36 | n |  |
| church | `church_st_josephs` | St. Joseph's Cathedral | 3940 | 2812 | 50 | 70 | 44 | e |  |
| church | `church_st_marys` | St. Mary's Church | 4590 | 1005 | 56 | 56 | 46 | s |  |
| church | `church_wesley` | Wesley Church | 5118 | 862 | 48 | 60 | 40 | w |  |
| church | `holy_trinity_church_bolarum` | Holy Trinity Church, Bolarum | 4700 | 125 | 44 | 60 | 42 | s |  |
| church | `st_georges_church_abids` | St. George's Church | 4060 | 3172 | 44 | 56 | 40 | n |  |
| church | `st_johns_church_secunderabad` | St. John's Church | 5986 | 609 | 44 | 52 | 42 | s |  |
| clock_tower | `mahboob_chowk_clock_tower` | Mahboob Chowk Clock Tower | 3600 | 4335 | 16 | 16 | 52 |  | variant mahboob_chowk |
| clock_tower | `secunderabad_clock_tower` | Secunderabad Clock Tower | 4955 | 862 | 18 | 18 | 72 |  |  |
| cyber_towers | `cyber_towers` | Cyber Towers | 430 | 500 | 96 | 96 | 90 | s | opened Nov 1998 |
| dargah | `dargah_yousufain` | Dargah Yousufain | 3358 | 2983 | 40 | 40 | 30 | n |  |
| dargah | `hussain_shah_wali_dargah` | Hussain Shah Wali Dargah & Shaikpet Sarai | 1460 | 2385 | 40 | 40 | 30 | s |  |
| dargah | `moula_ali_dargah` | Moula Ali Dargah | 7420 | 760 | 44 | 44 | 40 | s |  |
| falaknuma | `falaknuma_palace` | Falaknuma Palace (closed) | 3530 | 5450 | 170 | 110 | 36 | e | gated |
| fort_gate | `banjara_darwaza` | Banjara Darwaza | 990 | 3048 | 60 | 22 | 40 | n | walk-through; solids:2 |
| fort_gate | `golconda_fateh_darwaza` | Fateh Darwaza | 1310 | 3300 | 22 | 60 | 44 | e | walk-through; solids:2 |
| fort_wall | `golconda_wall_e1` | Golconda fort wall | 1310 | 3163 | 16 | 214 | 28 |  |  |
| fort_wall | `golconda_wall_e2` | Golconda fort wall | 1310 | 3435 | 16 | 210 | 28 |  |  |
| fort_wall | `golconda_wall_n` | Golconda fort wall | 1075 | 3048 | 470 | 16 | 28 |  |  |
| fort_wall | `golconda_wall_s` | Golconda fort wall | 1075 | 3548 | 470 | 16 | 28 |  |  |
| fort_wall | `golconda_wall_w` | Golconda fort wall | 832 | 3298 | 16 | 516 | 28 |  |  |
| golconda_bala_hissar | `golconda_bala_hissar` | Bala Hissar pavilion | 1040 | 3240 | 84 | 64 | 46 | s |  |
| gulzar_houz | `gulzar_houz` | Gulzar Houz fountain | 3900 | 4120 | 22 | 22 | 10 |  |  |
| gun_park | `gun_park` | Gun Park martyrs memorial | 3767 | 2479 | 14 | 14 | 26 |  |  |
| gurudwara | `gurudwara_gowliguda` | Central Gurudwara Sahib, Gowliguda | 4060 | 3392 | 50 | 50 | 32 | n |  |
| high_court | `high_court` | High Court | 3740 | 3935 | 168 | 62 | 36 | s |  |
| jubilee_hall | `jubilee_hall` | Jubilee Hall | 3648 | 2545 | 48 | 34 | 22 | e |  |
| kakatiya_arch | `kakatiya_arch_n` | Kakatiya arch (north) | 4443 | 1245 | 20 | 10 | 30 |  |  |
| kakatiya_arch | `kakatiya_arch_s` | Kakatiya arch (south) | 4056 | 2055 | 20 | 10 | 30 |  |  |
| kaman | `kaman_charminar` | Charminar Kaman | 3900 | 4192 | 72 | 12 | 52 |  | walk-through; solids:2 |
| kaman | `kaman_kali` | Kali Kaman | 3826 | 4120 | 12 | 72 | 52 |  | walk-through; solids:2 |
| kaman | `kaman_machli` | Machli Kaman | 3900 | 4048 | 72 | 12 | 52 |  | walk-through; solids:2 |
| kaman | `kaman_sher_e_batil` | Sher-e-Batil ki Kaman | 3974 | 4120 | 12 | 72 | 52 |  | walk-through; solids:2 |
| khairatabad_ganesh | `khairatabad_ganesh` | Khairatabad Ganesh pandal | 3132 | 2056 | 46 | 36 | 50 | e | seasonal ganesh |
| madina_building | `madina_building` | Madina Building | 3992 | 4052 | 80 | 44 | 28 | w |  |
| mahankali_temple | `akkanna_madanna_temple` | Akkanna Madanna Mahankali Temple | 3996 | 4726 | 30 | 30 | 30 | s |  |
| mahankali_temple | `balkampet_yellamma_temple` | Balkampet Yellamma Temple | 2936 | 948 | 34 | 34 | 30 | w |  |
| mahankali_temple | `golconda_jagadamba_temple` | Jagadamba Temple, Golconda | 1150 | 3440 | 30 | 30 | 26 | s |  |
| mahankali_temple | `lal_darwaza_temple` | Lal Darwaza Mahankali Temple | 4060 | 4700 | 40 | 40 | 34 | n |  |
| mahankali_temple | `ujjaini_mahankali_temple` | Ujjaini Mahankali Temple | 4862 | 1172 | 40 | 40 | 34 | e |  |
| mecca_masjid | `mecca_masjid` | Mecca Masjid | 3735 | 4586 | 90 | 132 | 50 | e |  |
| memorial | `bapu_ghat` | Bapu Ghat (Gandhi memorial) | 1800 | 3650 | 50 | 40 | 20 | n |  |
| mosque | `jama_masjid_charminar` | Jama Masjid (Charminar) | 4095 | 4308 | 30 | 30 | 34 | s |  |
| mosque | `khairatabad_mosque` | Khairatabad Mosque | 3090 | 1975 | 36 | 36 | 38 | e |  |
| mosque | `mosque_1` | Mallepally Masjid | 3347 | 2874 | 36 | 36 | 36 | s |  |
| mosque | `mosque_2` | Tolichowki Masjid | 2103 | 2917 | 36 | 36 | 36 | n |  |
| mosque | `mosque_3` | Musheerabad Jama Masjid | 4825 | 1813 | 36 | 36 | 36 | s |  |
| mosque | `mosque_4` | Malakpet Masjid | 4987 | 4137 | 36 | 36 | 36 | w |  |
| mosque | `mosque_5` | Saidabad Masjid | 5187 | 5065 | 36 | 36 | 36 | w |  |
| mosque | `mosque_6` | Shah Ali Banda Masjid | 4173 | 4728 | 36 | 36 | 36 | w |  |
| mosque | `mosque_7` | Falaknuma Masjid | 4140 | 5227 | 36 | 36 | 36 | s |  |
| mosque | `mosque_8` | Begum Bazaar Masjid | 3707 | 3531 | 34 | 34 | 34 | w |  |
| museum | `state_museum` | State Archaeology Museum | 3650 | 2652 | 58 | 40 | 24 | n | variant state_museum |
| nizam_college | `nizam_college` | Nizam College | 4232 | 2560 | 90 | 58 | 30 | w |  |
| ntr_memorial | `ntr_memorial` | NTR Ghat | 3672 | 1980 | 40 | 28 | 18 | s |  |
| osmania_hospital | `osmania_hospital` | Osmania General Hospital | 3762 | 3640 | 194 | 76 | 34 | s |  |
| ou_arts_college | `osmania_university` | Osmania University Arts College | 6262 | 1990 | 200 | 70 | 40 | s |  |
| paigah_tombs | `paigah_tombs` | Paigah Tombs | 4900 | 5145 | 90 | 60 | 22 | s |  |
| palace | `chiran_palace` | Chiran Palace | 1740 | 1740 | 60 | 40 | 22 | n |  |
| palace | `errum_manzil` | Errum Manzil (gate) | 2790 | 1570 | 70 | 48 | 30 | e | gated |
| palace | `hill_fort_palace` | Hill Fort Palace (locked) | 3790 | 2290 | 60 | 44 | 30 | s | gated |
| palace | `king_kothi` | King Kothi Palace (gated) | 4180 | 2900 | 80 | 50 | 26 | n | gated |
| palace | `rashtrapati_nilayam` | Rashtrapati Nilayam (gated) | 5000 | 110 | 180 | 96 | 26 | s | gated |
| pathergatti_arcade | `pathergatti_arcade_w` | Pathergatti arcades | 3852 | 4038 | 44 | 32 | 26 | e |  |
| puranapul_arches | `puranapul_arches` | Purana Pul arches | 3200 | 3900 | 44 | 150 | 6 |  | walk-through |
| purani_haveli | `purani_haveli` | Purani Haveli (Nizam's Museum) | 4342 | 4140 | 128 | 66 | 26 | w |  |
| qutb_tomb | `qutb_tomb_1` | Qutb Shahi tomb | 830 | 2720 | 56 | 56 | 50 |  |  |
| qutb_tomb | `qutb_tomb_2` | Qutb Shahi tomb | 930 | 2712 | 62 | 62 | 58 |  |  |
| qutb_tomb | `qutb_tomb_3` | Qutb Shahi tomb | 1030 | 2740 | 50 | 50 | 44 |  |  |
| qutb_tomb | `qutb_tomb_4` | Qutb Shahi tomb | 820 | 2840 | 46 | 46 | 40 |  |  |
| qutb_tomb | `qutb_tomb_5` | Qutb Shahi tomb | 920 | 2850 | 70 | 70 | 64 |  |  |
| qutb_tomb | `qutb_tomb_6` | Qutb Shahi tomb | 1030 | 2880 | 44 | 44 | 38 |  |  |
| raj_bhavan | `raj_bhavan` | Raj Bhavan | 2915 | 1752 | 80 | 54 | 30 | e |  |
| sai_temple | `dilsukhnagar_sai_temple` | Sai Baba Temple, Dilsukhnagar | 6300 | 3998 | 70 | 48 | 34 | n |  |
| salar_jung_museum | `salar_jung_museum` | Salar Jung Museum | 4040 | 3910 | 150 | 76 | 30 | s |  |
| secretariat | `secretariat` | Secretariat | 3930 | 2190 | 118 | 58 | 34 | n |  |
| spanish_mosque | `spanish_mosque` | Spanish Mosque | 3740 | 590 | 40 | 40 | 44 | s |  |
| state_central_library | `state_central_library` | State Central Library | 4040 | 3612 | 100 | 62 | 30 | s |  |
| statue | `gandhi_statue_assembly` | Seated Gandhi statue | 3770 | 2600 | 8 | 8 | 16 |  | variant gandhi_seated |
| tank_bund_statue | `tank_bund_statue_1` | Tank Bund statue | 4013 | 1941 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_10` | Tank Bund statue | 4297 | 1376 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_11` | Tank Bund statue | 4326 | 1314 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_12` | Tank Bund statue | 4354 | 1250 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_2` | Tank Bund statue | 4044 | 1878 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_3` | Tank Bund statue | 4075 | 1815 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_4` | Tank Bund statue | 4106 | 1751 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_5` | Tank Bund statue | 4139 | 1689 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_6` | Tank Bund statue | 4171 | 1627 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_7` | Tank Bund statue | 4204 | 1564 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_8` | Tank Bund statue | 4235 | 1503 | 8 | 8 | 30 |  |  |
| tank_bund_statue | `tank_bund_statue_9` | Tank Bund statue | 4266 | 1439 | 8 | 8 | 30 |  |  |
| taramati_baradari | `taramati_baradari` | Taramati Baradari | 660 | 3620 | 60 | 44 | 26 | s |  |
| temple | `ashtalakshmi_temple` | Ashtalakshmi Temple, Kothapet | 6790 | 4180 | 50 | 50 | 40 | w |  |
| temple | `iskcon_abids` | ISKCON Temple, Abids | 3755 | 2898 | 40 | 34 | 32 | s |  |
| temple | `karmanghat_hanuman_temple` | Karmanghat Hanuman Temple | 6900 | 4482 | 40 | 40 | 34 | n |  |
| temple | `katta_maisamma_temple` | Katta Maisamma Temple | 4260 | 1851 | 30 | 30 | 28 | e |  |
| temple | `peddamma_temple` | Peddamma Temple | 1210 | 1266 | 40 | 36 | 32 | n |  |
| temple | `secunderabad_ganesh_temple` | Sri Ganesh Temple (Secunderabad station) | 5003 | 1013 | 30 | 30 | 30 | e |  |
| temple | `temple_1` | Sri Venkateswara Temple | 4546 | 2520 | 30 | 30 | 30 | w |  |
| temple | `temple_2` | Hanuman Temple | 4590 | 2400 | 30 | 28 | 28 | n |  |
| temple | `temple_3` | Shankar Mutt | 5520 | 2866 | 40 | 34 | 30 | s |  |
| temple | `temple_4` | Pochamma Temple | 2520 | 580 | 30 | 30 | 28 | w |  |
| temple | `temple_5` | Sri Rama Temple, Tarnaka | 6620 | 1430 | 32 | 30 | 28 | w |  |
| temple | `temple_6` | Ayyappa Temple | 2800 | 2980 | 34 | 30 | 28 | w |  |

### Landmarks drawn by src/places_art.js (308)

x, y = centre; w = east-west, d = north-south, h = suggested art height (1 storey = 10 u).

| draw | id | name | x | y | w | d | h | face | notes |
|---|---|---|---|---|---|---|---|---|---|
| aeroplane | `aeroplane_1` | Parked plane | 3330 | 426 | 46 | 40 | 14 | e |  |
| airport_terminal | `begumpet_airport` | Begumpet Airport | 3480 | 484 | 120 | 36 | 22 | s |  |
| ashram | `ramakrishna_math` | Ramakrishna Math, Domalguda | 4400 | 2200 | 70 | 50 | 26 | e |  |
| auditorium | `ravindra_bharathi` | Ravindra Bharathi | 3505 | 2452 | 80 | 52 | 30 | n |  |
| bakery | `bakery_2` | New Deccan Bakery | 2810 | 1070 | 28 | 22 | 24 | s | sign "DECCAN BAKERY" |
| bakery | `bakery_3` | Golden Bakery | 4938 | 1613 | 22 | 28 | 24 | w | sign "GOLDEN BAKERY" |
| bakery | `bakery_4` | Malakpet Bakery | 4884 | 3943 | 28 | 22 | 24 | n | sign "BAKERY" |
| bakery | `karachi_bakery` | Karachi Bakery | 3850 | 3105 | 36 | 24 | 22 | w | sign "KARACHI BAKERY" |
| bakery | `subhan_bakery` | Subhan Bakery | 3667 | 2996 | 28 | 22 | 24 | n | sign "SUBHAN BAKERY" |
| bal_bhavan | `jawahar_bal_bhavan` | Jawahar Bal Bhavan | 3760 | 2680 | 50 | 38 | 20 | n |  |
| banana_cart | `banana_cart_1` | Banana cart | 4959 | 3079 | 9 | 16 | 12 | w |  |
| banana_cart | `banana_cart_10` | Banana cart | 5139 | 816 | 16 | 9 | 12 | n |  |
| banana_cart | `banana_cart_2` | Banana cart | 4383 | 3374 | 9 | 16 | 12 | e |  |
| banana_cart | `banana_cart_3` | Banana cart | 3874 | 3217 | 16 | 9 | 12 | s |  |
| banana_cart | `banana_cart_4` | Banana cart | 2412 | 2924 | 16 | 9 | 12 | n |  |
| banana_cart | `banana_cart_5` | Banana cart | 2981 | 1124 | 16 | 9 | 12 | n |  |
| banana_cart | `banana_cart_6` | Banana cart | 2347 | 541 | 9 | 16 | 12 | w |  |
| banana_cart | `banana_cart_7` | Banana cart | 5015 | 823 | 9 | 16 | 12 | e |  |
| banana_cart | `banana_cart_8` | Banana cart | 5776 | 3955 | 16 | 9 | 12 | n |  |
| banana_cart | `banana_cart_9` | Banana cart | 4097 | 4027 | 16 | 9 | 12 | n |  |
| bangle_shop | `bangle_shop_1` | Bangle shop | 3664 | 4386 | 22 | 16 | 20 | n | sign "LAAD BANGLES" |
| bangle_shop | `bangle_shop_2` | Bangle shop | 3690 | 4386 | 22 | 16 | 20 | n | sign "CHUDI MAHAL" |
| bangle_shop | `bangle_shop_3` | Bangle shop | 3716 | 4386 | 22 | 16 | 20 | n | sign "NOOR BANGLES" |
| bangle_shop | `bangle_shop_4` | Bangle shop | 3742 | 4386 | 22 | 16 | 20 | n | sign "RANI CHUDI" |
| barber | `barber_1` | Lucky Hair Cutting Saloon | 4419 | 2622 | 22 | 18 | 22 | s | sign "LUCKY SALOON" |
| barber | `barber_2` | Sundar Hair Saloon | 5222 | 2982 | 18 | 22 | 22 | e | sign "SUNDAR SALOON" |
| barber | `barber_3` | Raja Hair Cutting | 3178 | 2683 | 18 | 22 | 22 | w | sign "RAJA HAIR CUTTING" |
| barber | `barber_4` | Famous Saloon | 4655 | 1422 | 22 | 18 | 22 | s | sign "FAMOUS SALOON" |
| barber | `barber_5` | Hero Hair Cutting | 6478 | 3998 | 18 | 22 | 22 | w | sign "HERO HAIR CUTTING" |
| barber | `barber_6` | Taj Hair Saloon | 4036 | 4732 | 22 | 18 | 22 | s | sign "TAJ SALOON" |
| barber | `barber_7` | New Style Hair Dressers | 4788 | 2539 | 18 | 22 | 22 | w | sign "NEW STYLE HAIR" |
| boat_jetty | `lumbini_jetty` | Lumbini boat jetty | 3880 | 1980 | 14 | 26 | 4 |  | walk-through |
| book_stall | `koti_book_bazaar` | Koti pavement book bazaar | 4137 | 3155 | 24 | 10 | 12 | n | sign "OLD BOOKS" |
| bus_stop | `bus_stop_1` | Koti bus stop | 4294 | 3263 | 32 | 10 | 16 | n | sign "KOTI" |
| bus_stop | `bus_stop_10` | Himayatnagar bus stop | 4456 | 2409 | 32 | 10 | 16 | s | sign "HIMAYATNAGAR" |
| bus_stop | `bus_stop_11` | Dilsukhnagar bus stop | 6514 | 3882 | 32 | 10 | 16 | s | sign "DILSUKHNAGAR" |
| bus_stop | `bus_stop_12` | Malakpet bus stop | 5280 | 3817 | 32 | 10 | 16 | s | sign "MALAKPET" |
| bus_stop | `bus_stop_13` | Charminar bus stop | 4205 | 4372 | 32 | 10 | 16 | n | sign "CHARMINAR" |
| bus_stop | `bus_stop_14` | Tank Bund bus stop | 4425 | 1734 | 10 | 32 | 16 | w | sign "TANK BUND" |
| bus_stop | `bus_stop_15` | Tolichowki bus stop | 1765 | 2691 | 32 | 10 | 16 | n | sign "TOLICHOWKI" |
| bus_stop | `bus_stop_16` | Tarnaka bus stop | 6585 | 1451 | 10 | 32 | 16 | w | sign "TARNAKA" |
| bus_stop | `bus_stop_17` | Afzalgunj bus stop | 3532 | 3708 | 32 | 10 | 16 | s | sign "AFZALGUNJ" |
| bus_stop | `bus_stop_18` | Khairatabad bus stop | 3192 | 1887 | 10 | 32 | 16 | w | sign "KHAIRATABAD" |
| bus_stop | `bus_stop_19` | Chikkadpally bus stop | 4931 | 2489 | 10 | 32 | 16 | w | sign "CHIKKADPALLY" |
| bus_stop | `bus_stop_2` | Abids bus stop | 4006 | 3169 | 10 | 32 | 16 | w | sign "ABIDS" |
| bus_stop | `bus_stop_20` | HITEC City bus stop | 526 | 712 | 32 | 10 | 16 | n | sign "HITEC CITY" |
| bus_stop | `bus_stop_21` | Uppal bus stop | 7423 | 2967 | 32 | 10 | 16 | n | sign "UPPAL" |
| bus_stop | `bus_stop_22` | LB Nagar bus stop | 7316 | 4491 | 32 | 10 | 16 | n | sign "LB NAGAR" |
| bus_stop | `bus_stop_3` | Nampally bus stop | 3790 | 2990 | 32 | 10 | 16 | n | sign "NAMPALLY" |
| bus_stop | `bus_stop_4` | Lakdikapul bus stop | 3037 | 2515 | 32 | 10 | 16 | n | sign "LAKDIKAPUL" |
| bus_stop | `bus_stop_5` | Mehdipatnam bus stop | 2379 | 2861 | 32 | 10 | 16 | n | sign "MEHDIPATNAM" |
| bus_stop | `bus_stop_6` | Ameerpet bus stop | 2620 | 951 | 32 | 10 | 16 | n | sign "AMEERPET" |
| bus_stop | `bus_stop_7` | Paradise bus stop | 4329 | 758 | 32 | 10 | 16 | n | sign "PARADISE" |
| bus_stop | `bus_stop_8` | Secunderabad bus stop | 5239 | 1060 | 32 | 10 | 16 | s | sign "SECUNDERABAD" |
| bus_stop | `bus_stop_9` | RTC X Roads bus stop | 5114 | 2266 | 32 | 10 | 16 | s | sign "RTC X ROADS" |
| bus_terminus | `koti_bus_stand` | Koti Bus Stand | 4430 | 3262 | 92 | 62 | 18 | w | walk-through; solids:1 |
| bus_terminus | `mehdipatnam_bus_terminus` | Mehdipatnam Bus Depot | 2235 | 2753 | 130 | 46 | 16 | s | walk-through; solids:1 |
| bus_terminus | `rathifile_bus_station` | Rathifile City Bus Station | 5343 | 1039 | 90 | 66 | 16 | s | walk-through; solids:1 |
| campus_gate | `university_of_hyderabad` | University of Hyderabad (gate) | 120 | 1905 | 60 | 30 | 20 | e |  |
| cbs_hangar | `cbs_hangar` | Gowliguda City Bus Station (the old hangar) | 4250 | 3346 | 110 | 70 | 26 | e | walk-through; solids:2 |
| chai_bandi | `chai_bandi_1` | Raju's chai bandi | 4664 | 2721 | 9 | 14 | 12 | w |  |
| chai_bandi | `chai_bandi_2` | Chai bandi | 2545 | 447 | 14 | 9 | 12 | s |  |
| chai_bandi | `chai_bandi_3` | OU canteen chai | 6274 | 2045 | 14 | 9 | 12 | s |  |
| chai_bandi | `chai_bandi_4` | Chai bandi | 3867 | 4581 | 9 | 14 | 12 | e |  |
| chai_bandi | `chai_bandi_5` | Chai bandi | 3259 | 4460 | 9 | 14 | 12 | e |  |
| chai_bandi | `chai_bandi_6` | Bhutta & chai cart | 4301 | 1539 | 9 | 14 | 12 | w |  |
| chai_bandi | `chai_bandi_7` | Construction-site chai | 415 | 680 | 14 | 9 | 12 | n |  |
| chai_bandi | `chai_bandi_8` | Chai bandi | 4100 | 930 | 14 | 9 | 12 | s |  |
| cinema | `anand_theatre` | Anand Theatre | 5320 | 708 | 76 | 54 | 30 | s | films: JAI HYDERABAD |
| cinema | `devi_theatre` | Devi 70mm | 4992 | 2346 | 100 | 66 | 34 | n | variant devi; films: TOOFAN EXPRESS, JAI HYDERABAD |
| cinema | `liberty_theatre` | Liberty Theatre | 4262 | 2262 | 66 | 64 | 30 | w | films: MEGHA GARJANA |
| cinema | `odeon_theatre` | Odeon | 4824 | 2140 | 88 | 64 | 32 | s | variant odeon; films: PREMA PANDAGA |
| cinema | `ramakrishna_theatre` | Ramakrishna 70mm | 3880 | 3030 | 64 | 52 | 32 | e | films: RANGULA PATANG, TOOFAN EXPRESS |
| cinema | `sandhya_theatre` | Sandhya 70mm & 35mm | 5004 | 2172 | 96 | 68 | 34 | w | variant sandhya; films: CHARMINAR CHINNODU, RANGULA PATANG |
| cinema | `sangeet_theatre` | Sangeet 70mm | 5556 | 1203 | 66 | 50 | 26 | n | sign "SANGEET 70MM"; films: GOLCONDA DIAMOND |
| cinema | `shanti_theatre` | Shanti Theatre | 4560 | 2806 | 76 | 54 | 30 | n | films: PREMA PANDAGA |
| cinema | `sudarshan_theatre` | Sudarshan 35mm | 4818 | 2282 | 84 | 66 | 30 | e | variant sudarshan; films: GULLY SIMHAM |
| clothes_store | `chermas_abids` | Cherma's | 4085 | 3008 | 34 | 24 | 26 | s | sign "CHERMAS" |
| club_house | `secunderabad_club` | Secunderabad Club (members only) | 5262 | 560 | 110 | 60 | 26 | w | gated |
| coaching_centre | `coaching_1` | Computer coaching centre | 2640 | 1036 | 60 | 34 | 30 | s | sign "C  C++  JAVA  ORACLE" |
| coaching_centre | `coaching_2` | Computer coaching centre | 2560 | 1036 | 60 | 34 | 30 | s | sign "LEARN JAVA - Y2K READY" |
| coconut_cart | `coconut_cart_1` | Tender coconut cart | 3302 | 1672 | 9 | 16 | 12 | e |  |
| coconut_cart | `coconut_cart_2` | Tender coconut cart | 3360 | 1170 | 9 | 16 | 12 | e |  |
| coconut_cart | `coconut_cart_3` | Tender coconut cart | 3769 | 1001 | 16 | 9 | 12 | n |  |
| coconut_cart | `coconut_cart_4` | Tender coconut cart | 4225 | 1686 | 9 | 16 | 12 | w |  |
| coconut_cart | `coconut_cart_5` | Tender coconut cart | 1797 | 1477 | 16 | 9 | 12 | n |  |
| coconut_cart | `coconut_cart_6` | Tender coconut cart | 6958 | 4195 | 16 | 9 | 12 | n |  |
| coconut_cart | `coconut_cart_7` | Tender coconut cart | 4402 | 1584 | 9 | 16 | 12 | e |  |
| college | `city_college` | Government City College | 3420 | 4066 | 110 | 60 | 32 | n |  |
| college | `jntu_kukatpally` | JNTU, Kukatpally | 1700 | 150 | 120 | 56 | 30 | s |  |
| control_tower | `atc_tower` | Begumpet control tower | 3640 | 478 | 18 | 18 | 52 |  |  |
| cycle_rent | `cycle_rent_1` | Lakshmi Cycle Stores (on hire) | 4471 | 2261 | 20 | 28 | 20 | e | sign "CYCLES ON HIRE" |
| cycle_rent | `cycle_rent_2` | Mohan Cycle Taxi | 4311 | 2876 | 28 | 20 | 20 | n | sign "MOHAN CYCLE TAXI" |
| cycle_rent | `cycle_rent_3` | Raju Cycle Taxi | 4789 | 2032 | 20 | 28 | 20 | w | sign "RAJU CYCLE TAXI" |
| cycle_rent | `cycle_rent_4` | Peter Cycle Works (hire) | 5829 | 475 | 20 | 28 | 20 | w | sign "CYCLES ON HIRE" |
| cycle_rent | `cycle_rent_5` | Chinna Cycle Taxi | 4611 | 2525 | 20 | 28 | 20 | e | sign "CYCLE TAXI" |
| department_store | `shoppers_stop_begumpet` | Trendz Department Store, Begumpet | 3512 | 735 | 80 | 46 | 30 | n | sign "TRENDZ DEPARTMENT STORE" |
| dhobi_ghat | `dhobi_ghat_1` | Dhobi ghat (washing lines) | 3450 | 3912 | 80 | 26 | 6 |  | walk-through |
| dosa_bandi | `dosa_bandi_1` | Dosa bandi | 4649 | 2322 | 16 | 9 | 12 | s |  |
| dosa_bandi | `dosa_bandi_2` | Dosa bandi | 5326 | 4224 | 16 | 9 | 12 | n |  |
| dosa_bandi | `dosa_bandi_3` | Dosa bandi | 6474 | 4209 | 9 | 16 | 12 | w |  |
| dosa_bandi | `dosa_bandi_4` | Dosa bandi | 5342 | 4629 | 9 | 16 | 12 | e |  |
| dosa_bandi | `dosa_bandi_5` | Dosa bandi | 3578 | 2013 | 16 | 9 | 12 | s |  |
| dosa_bandi | `dosa_bandi_6` | Dosa bandi | 4722 | 995 | 9 | 16 | 12 | w |  |
| dosa_bandi | `dosa_bandi_7` | Dosa bandi | 5537 | 3037 | 16 | 9 | 12 | s |  |
| exhibition_hall | `hitex` | HITEX Exhibition Centre (opens Jan 2003) | 900 | 700 | 160 | 100 | 24 | s | construction site before 14 Jan 2003 |
| film_hoarding | `hoarding_rtc_1` | Film hoarding | 4870 | 2186 | 30 | 6 | 40 |  | walk-through; solids:2 |
| film_hoarding | `hoarding_rtc_2` | Film hoarding | 4962 | 2274 | 30 | 6 | 40 |  | walk-through; solids:2 |
| film_studio | `annapurna_studios` | Annapurna Studios | 2300 | 1450 | 120 | 70 | 30 | s |  |
| film_studio | `ramanaidu_studios` | Ramanaidu Studios | 1120 | 1850 | 120 | 60 | 28 | e |  |
| film_studio | `sarathi_studios` | Sarathi Studios | 2535 | 1157 | 120 | 50 | 28 | s |  |
| flower_cart | `flower_cart_1` | Jasmine & marigold cart | 4529 | 2562 | 9 | 16 | 12 | w |  |
| flower_cart | `flower_cart_10` | Flower cart (Lal Darwaza) | 4177 | 4624 | 16 | 9 | 12 | s |  |
| flower_cart | `flower_cart_11` | Flower cart (Birla Mandir steps) | 3859 | 2460 | 16 | 9 | 12 | n |  |
| flower_cart | `flower_cart_12` | Flower cart (Peddamma Temple) | 1318 | 1208 | 16 | 9 | 12 | s |  |
| flower_cart | `flower_cart_2` | Flower cart | 4557 | 2369 | 16 | 9 | 12 | n |  |
| flower_cart | `flower_cart_3` | Flower cart | 5595 | 2917 | 16 | 9 | 12 | s |  |
| flower_cart | `flower_cart_4` | Flower cart (Mahankali) | 4933 | 1215 | 9 | 16 | 12 | e |  |
| flower_cart | `flower_cart_5` | Flower cart (Sai Baba temple) | 6770 | 4059 | 16 | 9 | 12 | n |  |
| flower_cart | `flower_cart_6` | Flower cart (Sai Baba temple) | 6803 | 4085 | 16 | 9 | 12 | n |  |
| flower_cart | `flower_cart_7` | Flower cart (Sai Baba temple) | 6836 | 4112 | 16 | 9 | 12 | n |  |
| flower_cart | `flower_cart_8` | Flower cart (Sai Baba temple) | 6870 | 4138 | 16 | 9 | 12 | n |  |
| flower_cart | `flower_cart_9` | Flower cart | 2724 | 2966 | 9 | 16 | 12 | w |  |
| giant_wheel | `giant_wheel` | Numaish giant wheel | 3540 | 3035 | 34 | 14 | 70 | s |  |
| gokul_chat | `gokul_chat` | Gokul Chat | 4230 | 3123 | 34 | 24 | 26 | s | sign "GOKUL CHAT" |
| gpo | `abids_gpo` | General Post Office, Abids | 4062 | 2905 | 60 | 50 | 30 | w |  |
| halt_station | `begumpet_station` | Begumpet station | 3420 | 800 | 60 | 24 | 16 | s |  |
| halt_station | `james_street_station` | James Street station | 4800 | 920 | 60 | 28 | 16 | n |  |
| halt_station | `khairatabad_station` | Khairatabad station | 3266 | 1880 | 26 | 50 | 16 | w |  |
| halt_station | `necklace_road_station` | Necklace Road station | 3236 | 1450 | 26 | 60 | 16 | w |  |
| halt_station | `sanjeevaiah_park_station` | Sanjeevaiah Park station | 3900 | 800 | 60 | 26 | 16 | n |  |
| home_house | `friend_home` | Friend's house | 4808 | 2652 | 34 | 30 | 22 | w | variant friend |
| home_house | `home` | Home (Lakshmi Nivas) | 4580 | 2645 | 40 | 34 | 22 | n | sign "LAKSHMI NIVAS" |
| hospital | `apollo_hospital_jubilee_hills` | Apollo Hospital, Jubilee Hills | 1462 | 1500 | 90 | 60 | 34 | w |  |
| hospital | `nims_hospital` | NIMS Hospital | 3002 | 1482 | 100 | 66 | 30 | w |  |
| hospital | `sarojini_devi_eye_hospital` | Sarojini Devi Eye Hospital | 2665 | 2566 | 90 | 44 | 26 | s | sign "SAROJINI DEVI EYE HOSPITAL" |
| idol_workshop | `idol_workshop_1` | Ganesh idol workshop | 3240 | 3420 | 30 | 40 | 22 | e | seasonal ganesh |
| idol_workshop | `idol_workshop_2` | Ganesh idol workshop | 3226 | 3480 | 30 | 40 | 22 | e | seasonal ganesh |
| internet_cafe | `internet_cafe_1` | Cyber Zone Browsing Centre | 4360 | 2463 | 22 | 32 | 24 | w | sign "CYBER ZONE" |
| internet_cafe | `internet_cafe_2` | Netway Internet Browsing | 3901 | 3193 | 22 | 32 | 24 | e | sign "NETWAY BROWSING" |
| internet_cafe | `internet_cafe_3` | Info Highway Browsing Centre | 2610 | 970 | 32 | 22 | 24 | s | sign "INFO HIGHWAY" |
| internet_cafe | `internet_cafe_4` | Sify iWay-style Browsing Centre | 5714 | 772 | 32 | 22 | 24 | n | sign "BROWSING CENTRE" |
| internet_cafe | `internet_cafe_5` | Campus Net Cafe | 6196 | 1240 | 32 | 22 | 24 | s | sign "CAMPUS NET CAFE" |
| internet_cafe | `internet_cafe_6` | Dial-Up Dreams Net Cafe | 6326 | 4120 | 32 | 22 | 24 | s | sign "NET CAFE" |
| irani_cafe | `alpha_hotel` | Alpha Hotel | 5343 | 1150 | 44 | 30 | 26 | n | sign "ALPHA HOTEL" |
| irani_cafe | `blue_sea_cafe` | Blue Sea Tea & Snacks | 5657 | 1219 | 40 | 28 | 26 | n | sign "BLUE SEA" |
| irani_cafe | `cafe_bahar` | Cafe Bahar | 4107 | 2370 | 28 | 40 | 26 | e | sign "CAFE BAHAR" |
| irani_cafe | `garden_cafe` | Garden Cafe | 4960 | 721 | 44 | 30 | 22 | s | sign "GARDEN CAFE" |
| irani_cafe | `grand_hotel` | Grand Hotel | 4018 | 3127 | 30 | 44 | 26 | w | sign "GRAND HOTEL" |
| irani_cafe | `irani_cafe_10` | Hotel Sohail | 1997 | 2663 | 44 | 30 | 26 | s | sign "HOTEL SOHAIL" |
| irani_cafe | `irani_cafe_11` | Cafe Firdaus | 2793 | 1034 | 30 | 44 | 26 | w | sign "CAFE FIRDAUS" |
| irani_cafe | `irani_cafe_12` | Cafe Bholakpur | 4948 | 1834 | 30 | 44 | 26 | w | sign "CAFE BHOLAKPUR" |
| irani_cafe | `irani_cafe_13` | Hotel Daulat | 5271 | 3928 | 44 | 30 | 26 | n | sign "HOTEL DAULAT" |
| irani_cafe | `irani_cafe_14` | Cafe Golden Star | 6625 | 3999 | 44 | 30 | 26 | n | sign "CAFE GOLDEN STAR" |
| irani_cafe | `irani_cafe_15` | Cafe Gulzar | 3729 | 4092 | 44 | 30 | 26 | s | sign "CAFE GULZAR" |
| irani_cafe | `irani_cafe_16` | Cafe Sohrab | 2423 | 2709 | 44 | 30 | 26 | s | sign "CAFE SOHRAB" |
| irani_cafe | `irani_cafe_7` | Hotel Sarvar | 4438 | 2691 | 30 | 44 | 26 | e | sign "HOTEL SARVAR" |
| irani_cafe | `irani_cafe_8` | Cafe Shalimar | 4831 | 2378 | 30 | 40 | 26 | e | sign "CAFE SHALIMAR" |
| irani_cafe | `irani_cafe_9` | Cafe Kohinoor | 4957 | 2944 | 30 | 44 | 26 | w | sign "CAFE KOHINOOR" |
| irani_cafe | `niloufer_cafe` | Niloufer Cafe | 3420 | 2400 | 40 | 28 | 22 | n | sign "NILOUFER CAFE" |
| irani_cafe | `nimrah_cafe` | Nimrah Cafe | 3998 | 4206 | 40 | 26 | 22 | w | sign "NIMRAH CAFE & BAKERY" |
| irani_cafe | `sarvi` | Sarvi | 2216 | 1624 | 44 | 30 | 26 | n | sign "SARVI" |
| iyengar_bakery | `iyengar_bakery_1` | Sri Krishna Iyengar Bakery | 4990 | 2812 | 30 | 22 | 24 | n | sign "IYENGAR BAKERY" |
| iyengar_bakery | `iyengar_bakery_2` | Sri Iyengar Bakery | 5559 | 689 | 30 | 22 | 24 | s | sign "SRI IYENGAR BAKERY" |
| iyengar_bakery | `iyengar_bakery_3` | Sri Venkateswara Iyengar Bakery | 5920 | 4051 | 22 | 30 | 24 | e | sign "IYENGAR BAKERY" |
| iyengar_bakery | `iyengar_bakery_4` | Bangalore Iyengar Bakery | 2870 | 1229 | 22 | 30 | 24 | e | sign "IYENGAR BAKERY" |
| kirana | `kirana_1` | Sri Lakshmi Kirana & General Stores | 4699 | 2571 | 26 | 20 | 22 | s | sign "SRI LAKSHMI KIRANA" |
| kirana | `kirana_10` | Raju Kirana | 2452 | 499 | 26 | 20 | 22 | n | sign "RAJU KIRANA" |
| kirana | `kirana_11` | Prakash Nagar Stores | 3179 | 1024 | 20 | 26 | 22 | w | sign "PRAKASH STORES" |
| kirana | `kirana_12` | Ali Kirana & Provisions | 4789 | 1289 | 20 | 26 | 22 | w | sign "ALI KIRANA" |
| kirana | `kirana_13` | Joseph General Stores | 5825 | 421 | 26 | 20 | 22 | s | sign "JOSEPH STORES" |
| kirana | `kirana_14` | Railway Colony Stores | 6310 | 1129 | 26 | 20 | 22 | n | sign "RAILWAY STORES" |
| kirana | `kirana_15` | Laxmi Narasimha Kirana | 4979 | 3997 | 20 | 26 | 22 | w | sign "LAXMI KIRANA" |
| kirana | `kirana_16` | Sri Venkateshwara Kirana | 6421 | 4065 | 20 | 26 | 22 | e | sign "VENKATESHWARA KIRANA" |
| kirana | `kirana_17` | Saidabad Kirana | 5121 | 4905 | 20 | 26 | 22 | e | sign "SAIDABAD KIRANA" |
| kirana | `kirana_18` | Hyderabad Kirana | 3666 | 4095 | 26 | 20 | 22 | n | sign "KIRANA" |
| kirana | `kirana_19` | Chandrayangutta Kirana | 4799 | 5292 | 26 | 20 | 22 | n | sign "KIRANA" |
| kirana | `kirana_2` | Balaji General Stores | 4301 | 2522 | 20 | 26 | 22 | e | sign "BALAJI STORES" |
| kirana | `kirana_20` | Kothapet Kirana | 6671 | 4185 | 20 | 26 | 22 | e | sign "KOTHAPET KIRANA" |
| kirana | `kirana_3` | Ganesh Provisions | 4709 | 2305 | 20 | 26 | 22 | w | sign "GANESH PROVISIONS" |
| kirana | `kirana_4` | Durga Kirana | 5071 | 2616 | 20 | 26 | 22 | e | sign "DURGA KIRANA" |
| kirana | `kirana_5` | Annapurna Kirana | 5279 | 2947 | 20 | 26 | 22 | w | sign "ANNAPURNA KIRANA" |
| kirana | `kirana_6` | Sai Ram Kirana | 5649 | 2886 | 20 | 26 | 22 | w | sign "SAI RAM KIRANA" |
| kirana | `kirana_7` | Hanuman Kirana | 3121 | 2552 | 20 | 26 | 22 | e | sign "HANUMAN KIRANA" |
| kirana | `kirana_8` | Noor Kirana & Provisions | 1929 | 2838 | 20 | 26 | 22 | w | sign "NOOR KIRANA" |
| kirana | `kirana_9` | Mahalakshmi General Stores | 2479 | 1069 | 20 | 26 | 22 | w | sign "MAHALAKSHMI STORES" |
| kite_stall | `kite_stall_1` | Kite stall | 3982 | 4095 | 20 | 12 | 14 | s | sign "PATANG HOUSE" |
| kite_stall | `kite_stall_2` | Kite stall | 4051 | 4145 | 20 | 12 | 14 | n | sign "MANJA & PATANG" |
| kite_stall | `kite_stall_3` | Kite stall | 4117 | 4094 | 20 | 12 | 14 | s | sign "KITE BAZAAR" |
| lb_stadium | `lb_stadium` | Lal Bahadur Stadium | 3961 | 2580 | 198 | 220 | 30 | w | solids:6 |
| library | `city_central_library` | City Central Library, Chikkadpally | 4640 | 2405 | 46 | 40 | 24 | s |  |
| market_hall | `chenoy_trade_centre` | Chenoy Trade Centre (CTC) | 4652 | 840 | 60 | 40 | 24 | w | sign "CHENOY TRADE CENTRE" |
| market_hall | `gaddiannaram_fruit_market` | Gaddiannaram Fruit Market | 6300 | 4462 | 140 | 70 | 16 | n | variant fruit |
| market_hall | `monda_market` | Monda Market | 5308 | 862 | 136 | 80 | 22 | n |  |
| market_hall | `murgi_chowk` | Murgi Chowk market | 3555 | 4300 | 50 | 40 | 18 | s |  |
| maut_ka_kuan | `maut_ka_kuan` | Maut ka Kuan (well of death) | 3625 | 3150 | 40 | 40 | 22 | n |  |
| meat_shop | `meat_shop_1` | Fresh Chicken & Mutton | 5281 | 2532 | 22 | 18 | 20 | s | sign "FRESH CHICKEN & MUTTON" |
| meat_shop | `meat_shop_2` | Al-Habeeb Chicken Centre | 1837 | 2852 | 22 | 18 | 20 | s | sign "AL-HABEEB CHICKEN" |
| meat_shop | `meat_shop_3` | New Mutton Shop | 2360 | 442 | 22 | 18 | 20 | s | sign "MUTTON SHOP" |
| meat_shop | `meat_shop_4` | Malakpet Mutton Shop | 4922 | 4241 | 18 | 22 | 20 | e | sign "MUTTON SHOP" |
| meat_shop | `meat_shop_5` | Kothapet Chicken & Mutton | 6243 | 4352 | 22 | 18 | 20 | s | sign "CHICKEN & MUTTON" |
| meat_shop | `meat_shop_6` | Murgi Chowk Chicken Centre | 4209 | 4268 | 22 | 18 | 20 | n | sign "CHICKEN CENTRE" |
| meat_shop | `meat_shop_7` | Bholakpur Chicken Centre | 4788 | 1571 | 18 | 22 | 20 | w | sign "CHICKEN CENTRE" |
| medical_shop | `medical_shop_1` | Life Line Medicals | 4376 | 2678 | 24 | 18 | 22 | n | sign "LIFE LINE MEDICALS" |
| medical_shop | `medical_shop_2` | Sri Venkateswara Medical Hall | 4484 | 3118 | 24 | 18 | 22 | s | sign "MEDICAL HALL" |
| medical_shop | `medical_shop_3` | Care Medicals | 4008 | 3215 | 18 | 24 | 22 | w | sign "CARE MEDICALS" |
| medical_shop | `medical_shop_4` | Marredpally Medicals | 6050 | 478 | 24 | 18 | 22 | n | sign "MEDICALS" |
| medical_shop | `medical_shop_5` | Malakpet Medicals | 5357 | 3822 | 24 | 18 | 22 | s | sign "MEDICALS" |
| medical_shop | `medical_shop_6` | Sri Sai Medicals | 5922 | 4004 | 18 | 24 | 22 | e | sign "SAI MEDICALS" |
| medical_shop | `medical_shop_7` | Banjara Medicals | 2449 | 1511 | 24 | 18 | 22 | s | sign "BANJARA MEDICALS" |
| medical_shop | `medical_shop_8` | Sai Medical & General Stores | 4830 | 2628 | 24 | 18 | 22 | n | sign "SAI MEDICAL" |
| mgbs | `imlibun_bus_station` | Imlibun Bus Station (MGBS) | 4300 | 3492 | 204 | 120 | 22 | n | solids:1 |
| mozamjahi_market | `mozamjahi_market` | Mozamjahi Market | 3850 | 3160 | 70 | 70 | 30 | w |  |
| musical_fountain | `musical_fountain` | Lumbini musical fountain | 3842 | 2036 | 26 | 18 | 6 |  |  |
| numaish_gate | `numaish_gate` | Numaish gate | 3684 | 3088 | 12 | 60 | 34 | e | walk-through; solids:2 |
| numaish_stalls | `numaish_stalls_1` | Numaish stalls | 3580 | 3080 | 110 | 18 | 14 | s |  |
| numaish_stalls | `numaish_stalls_2` | Numaish stalls | 3560 | 3120 | 90 | 18 | 14 | n |  |
| photo_studio | `photo_studio_1` | Raj Colour Lab & Studio | 4302 | 2440 | 24 | 18 | 24 | n | sign "RAJ COLOUR LAB" |
| photo_studio | `photo_studio_2` | Studio Lakshmi | 4078 | 3115 | 24 | 18 | 24 | n | sign "STUDIO LAKSHMI" |
| photo_studio | `photo_studio_3` | Prince Photo Studio | 3903 | 2994 | 24 | 18 | 24 | n | sign "PRINCE STUDIO" |
| photo_studio | `photo_studio_4` | Sri Sai Photo Studio | 2526 | 972 | 24 | 18 | 24 | s | sign "SAI PHOTO STUDIO" |
| photo_studio | `photo_studio_5` | Tarnaka Photo Studio | 6299 | 1261 | 24 | 18 | 24 | s | sign "PHOTO STUDIO" |
| photo_studio | `photo_studio_6` | Colour Lab & Studio | 5837 | 4178 | 24 | 18 | 24 | n | sign "COLOUR LAB" |
| pindi_girni | `pindi_girni_1` | Hanuman Pindi Girni | 4830 | 2569 | 30 | 24 | 24 | s | sign "HANUMAN PINDI GIRNI" |
| pindi_girni | `pindi_girni_2` | Lakshmi Flour Mill | 5281 | 2500 | 24 | 30 | 24 | w | sign "LAKSHMI FLOUR MILL" |
| pindi_girni | `pindi_girni_3` | Ganesh Flour Mill | 3123 | 2609 | 30 | 24 | 24 | s | sign "GANESH FLOUR MILL" |
| pindi_girni | `pindi_girni_4` | Sri Rama Flour Mill | 2631 | 631 | 24 | 30 | 24 | w | sign "SRI RAMA FLOUR MILL" |
| pindi_girni | `pindi_girni_5` | Noor Atta Chakki | 4729 | 1830 | 24 | 30 | 24 | e | sign "NOOR ATTA CHAKKI" |
| pindi_girni | `pindi_girni_6` | Noor Pindi Girni | 4211 | 4453 | 30 | 24 | 24 | s | sign "NOOR PINDI GIRNI" |
| pindi_girni | `pindi_girni_7` | Durga Pindi Girni | 6463 | 4411 | 30 | 24 | 24 | n | sign "DURGA PINDI GIRNI" |
| playground_kit | `playground_kit_14` | Swings & slide | 4640 | 2200 | 18 | 10 | 14 |  |  |
| playground_kit | `playground_kit_home` | Swings & slide | 4730 | 2630 | 18 | 10 | 14 |  |  |
| prasads_imax | `prasads_imax` | Prasads IMAX | 3480 | 1914 | 78 | 68 | 44 | s | opened July 2003; show as opening/new |
| radio_station | `all_india_radio` | All India Radio, Saifabad | 3420 | 2214 | 48 | 40 | 24 | w |  |
| railway_station | `kachiguda_station` | Kachiguda Station | 4997 | 3136 | 76 | 96 | 34 | w | variant kachiguda |
| railway_station | `nampally_station` | Nampally Station (Hyderabad Deccan) | 3580 | 2895 | 110 | 50 | 30 | s | variant nampally |
| railway_station | `secunderabad_station` | Secunderabad Station | 5200 | 1030 | 180 | 48 | 32 | s | variant secunderabad |
| restaurant | `bawarchi` | Bawarchi | 4990 | 2100 | 52 | 36 | 24 | w | sign "BAWARCHI" |
| restaurant | `hotel_nayaab` | Hotel Nayaab | 3777 | 4098 | 34 | 26 | 26 | n | sign "HOTEL NAYAAB" |
| restaurant | `hotel_niagara` | Hotel Niagara | 4537 | 3426 | 26 | 40 | 26 | w | sign "HOTEL NIAGARA" |
| restaurant | `paradise` | Paradise | 4440 | 786 | 60 | 40 | 26 | n | sign "PARADISE" |
| restaurant | `pista_house` | Pista House | 3937 | 4898 | 28 | 36 | 26 | w | sign "PISTA HOUSE" |
| restaurant | `shadab_hotel` | Hotel Shadab | 4140 | 4034 | 44 | 28 | 26 | n | sign "HOTEL SHADAB" |
| restaurant | `shah_ghouse` | Shah Ghouse Cafe | 3848 | 4864 | 28 | 36 | 26 | e | sign "SHAH GHOUSE CAFE" |
| restaurant | `taj_mahal_hotel_abids` | Taj Mahal Hotel, Abids | 3913 | 2902 | 40 | 26 | 26 | s | sign "TAJ MAHAL HOTEL" |
| rythu_bazaar | `rythu_bazaar_erragadda` | Rythu Bazaar, Erragadda | 2310 | 400 | 150 | 70 | 14 | s | walk-through; solids:2 |
| rythu_bazaar | `rythu_bazaar_mehdipatnam` | Rythu Bazaar, Mehdipatnam | 2480 | 2846 | 150 | 72 | 14 | s | walk-through; solids:2 |
| rythu_bazaar | `rythu_bazaar_saroornagar` | Rythu Bazaar, Kothapet | 6560 | 4262 | 140 | 70 | 14 | n | walk-through; solids:2 |
| samosa_bandi | `samosa_bandi_1` | Samosa bandi | 5709 | 2964 | 16 | 9 | 12 | n |  |
| samosa_bandi | `samosa_bandi_2` | Samosa bandi | 1985 | 2904 | 16 | 9 | 12 | n |  |
| samosa_bandi | `samosa_bandi_3` | Samosa bandi | 4840 | 1474 | 16 | 9 | 12 | n |  |
| samosa_bandi | `samosa_bandi_4` | Samosa bandi | 6177 | 511 | 9 | 16 | 12 | e |  |
| samosa_bandi | `samosa_bandi_5` | Samosa bandi | 6532 | 4174 | 16 | 9 | 12 | n |  |
| samosa_bandi | `samosa_bandi_6` | Samosa bandi | 4142 | 4388 | 16 | 9 | 12 | n |  |
| samosa_bandi | `samosa_bandi_7` | Samosa bandi | 2716 | 1175 | 9 | 16 | 12 | e |  |
| school | `hyderabad_public_school` | The Hyderabad Public School | 3070 | 520 | 120 | 36 | 30 | s | variant hps; sign "THE HYDERABAD PUBLIC SCHOOL" |
| school | `school_1` | Saraswati Vidya Mandir High School | 4210 | 2690 | 80 | 30 | 28 | n | sign "SARASWATI VIDYA MANDIR" |
| school | `school_10` | Malakpet High School | 5170 | 4310 | 30 | 80 | 28 | w | sign "MALAKPET HIGH SCHOOL" |
| school | `school_11` | Dilsukhnagar Public School | 6060 | 4200 | 80 | 28 | 28 | s | sign "DILSUKHNAGAR PUBLIC SCHOOL" |
| school | `school_12` | Saidabad Government School | 5245 | 4720 | 80 | 28 | 26 | s | sign "GOVT SCHOOL SAIDABAD" |
| school | `school_13` | Government Urdu High School, Shah Ali Banda | 4010 | 4905 | 80 | 28 | 26 | s | sign "GOVT URDU HIGH SCHOOL" |
| school | `school_2` | Vivekananda High School | 5000 | 2470 | 80 | 30 | 28 | s | sign "VIVEKANANDA HIGH SCHOOL" |
| school | `school_3` | Government High School, Kachiguda | 5180 | 2950 | 80 | 30 | 28 | n | sign "GOVT HIGH SCHOOL" |
| school | `school_4` | Nalanda Public School | 3060 | 2770 | 80 | 28 | 28 | s | sign "NALANDA PUBLIC SCHOOL" |
| school | `school_5` | Al-Ameen High School | 1775 | 2905 | 80 | 28 | 28 | n | sign "AL-AMEEN HIGH SCHOOL" |
| school | `school_6` | Sri Chaitanya Vidyalayam | 2350 | 1150 | 80 | 28 | 28 | s | sign "VIDYALAYAM HIGH SCHOOL" |
| school | `school_7` | Government High School, Musheerabad | 4672 | 1520 | 30 | 74 | 26 | e | sign "GOVT HIGH SCHOOL" |
| school | `school_8` | Holy Family Convent School | 6050 | 545 | 30 | 80 | 30 | w | sign "HOLY FAMILY CONVENT" |
| school | `school_9` | Railway High School, Lalaguda | 5905 | 1060 | 90 | 26 | 28 | s | sign "RAILWAY HIGH SCHOOL" |
| shilparamam_gate | `shilparamam_gate` | Shilparamam gate | 680 | 596 | 40 | 12 | 22 | s | walk-through; solids:2 |
| stadium | `gachibowli_stadium` | Gachibowli Stadium | 390 | 1890 | 200 | 150 | 30 | n |  |
| stationery | `stationery_1` | Vidya Stationery & Book Depot | 4207 | 2622 | 24 | 18 | 22 | s | sign "VIDYA STATIONERY" |
| stationery | `stationery_2` | Navyuga Stationers | 5019 | 2588 | 24 | 18 | 22 | n | sign "NAVYUGA STATIONERS" |
| stationery | `stationery_3` | Student Book House | 5200 | 2862 | 24 | 18 | 22 | s | sign "STUDENT BOOK HOUSE" |
| stationery | `stationery_4` | Koti textbook stall | 4199 | 3103 | 24 | 18 | 22 | s | sign "TEXT BOOKS" |
| stationery | `stationery_5` | Bharat Book & Stationery | 3150 | 2903 | 24 | 18 | 22 | n | sign "BHARAT STATIONERY" |
| stationery | `stationery_6` | Gita Stationery | 2452 | 1228 | 24 | 18 | 22 | n | sign "GITA STATIONERY" |
| stationery | `stationery_7` | Saraswati Book Depot | 6094 | 4122 | 24 | 18 | 22 | s | sign "SARASWATI BOOK DEPOT" |
| stationery | `stationery_8` | Sri Sai Stationery | 5209 | 4172 | 24 | 18 | 22 | s | sign "SAI STATIONERY" |
| std_booth | `std_1` | STD/ISD/PCO | 4580 | 2496 | 12 | 12 | 15 | n | sign "STD ISD PCO" |
| std_booth | `std_10` | STD/ISD/PCO | 5454 | 1072 | 12 | 12 | 15 | s | sign "STD ISD PCO" |
| std_booth | `std_11` | STD/ISD/PCO | 6432 | 3981 | 12 | 12 | 15 | n | sign "STD ISD PCO" |
| std_booth | `std_12` | STD/ISD/PCO | 3949 | 4686 | 12 | 12 | 15 | w | sign "STD ISD PCO" |
| std_booth | `std_13` | STD/ISD/PCO | 3333 | 4618 | 12 | 12 | 15 | n | sign "STD ISD PCO" |
| std_booth | `std_14` | STD/ISD/PCO | 2870 | 1640 | 12 | 12 | 15 | e | sign "STD ISD PCO" |
| std_booth | `std_15` | STD/ISD/PCO | 1101 | 1194 | 12 | 12 | 15 | n | sign "STD ISD PCO" |
| std_booth | `std_16` | STD/ISD/PCO | 656 | 701 | 12 | 12 | 15 | s | sign "STD ISD PCO" |
| std_booth | `std_2` | STD/ISD/PCO | 4429 | 2568 | 12 | 12 | 15 | e | sign "STD ISD PCO" |
| std_booth | `std_3` | STD/ISD/PCO | 4427 | 3238 | 12 | 12 | 15 | n | sign "STD ISD PCO" |
| std_booth | `std_4` | STD/ISD/PCO | 4058 | 2870 | 12 | 12 | 15 | w | sign "STD ISD PCO" |
| std_booth | `std_5` | STD/ISD/PCO | 3224 | 2342 | 12 | 12 | 15 | s | sign "STD ISD PCO" |
| std_booth | `std_6` | STD/ISD/PCO | 4953 | 2058 | 12 | 12 | 15 | w | sign "STD ISD PCO" |
| std_booth | `std_7` | STD/ISD/PCO | 4632 | 2184 | 12 | 12 | 15 | n | sign "STD ISD PCO" |
| std_booth | `std_8` | STD/ISD/PCO | 2042 | 2699 | 12 | 12 | 15 | s | sign "STD ISD PCO" |
| std_booth | `std_9` | STD/ISD/PCO | 2648 | 1175 | 12 | 12 | 15 | s | sign "STD ISD PCO" |
| tv_tower | `doordarshan_kendra` | Doordarshan Kendra, Ramanthapur | 6560 | 3010 | 40 | 40 | 120 | s |  |
| video_parlour | `video_parlour_1` | Super Video Games | 5023 | 2920 | 30 | 22 | 24 | n | sign "SUPER VIDEO GAMES" |
| video_parlour | `video_parlour_2` | Champion Video Games | 4332 | 3044 | 22 | 30 | 24 | w | sign "CHAMPION GAMES" |
| video_parlour | `video_parlour_3` | Rocky Video Games | 6197 | 4180 | 30 | 22 | 24 | n | sign "ROCKY VIDEO GAMES" |
| video_parlour | `video_parlour_4` | Game Zone Video Parlour | 2384 | 1030 | 30 | 22 | 24 | n | sign "GAME ZONE" |
| water_tank | `water_tank_1` | Colony water tank | 4808 | 2530 | 22 | 22 | 60 |  |  |
| water_tank | `water_tank_2` | Colony water tank | 5175 | 2470 | 22 | 22 | 60 |  |  |
| water_tank | `water_tank_3` | Colony water tank | 4820 | 1380 | 22 | 22 | 60 |  |  |
| water_tank | `water_tank_4` | Colony water tank | 5030 | 4100 | 22 | 22 | 60 |  |  |
| water_tank | `water_tank_5` | Colony water tank | 6400 | 4100 | 22 | 22 | 60 |  |  |
| water_tank | `water_tank_6` | Colony water tank | 6100 | 380 | 22 | 22 | 60 |  |  |
| water_tank | `water_tank_7` | Colony water tank | 2330 | 900 | 22 | 22 | 60 |  |  |
| zoo_gate | `zoo_gate` | Nehru Zoo gate | 2934 | 4740 | 16 | 50 | 24 | e | walk-through; solids:2 |

### Places (547), grouped by kind

Each place is a walkable point next to the thing it names. `alias` = same spot as another id.

#### bakery (6)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `bakery_1` | Subhan Bakery, Nampally | nampally | 3667 | 2980 | 18 | alias of `subhan_bakery` |
| `bakery_2` | New Deccan Bakery | ameerpet | 2810 | 1086 | 18 |  |
| `bakery_3` | Golden Bakery | musheerabad | 4922 | 1613 | 18 |  |
| `bakery_4` | Malakpet Bakery | malakpet | 4884 | 3927 | 18 |  |
| `karachi_bakery` | Karachi Bakery | nampally | 3810 | 3105 | 18 |  |
| `subhan_bakery` | Subhan Bakery | nampally | 3667 | 2980 | 18 |  |

#### banana_cart (10)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `banana_cart_1` | Banana cart | kachiguda | 4949 | 3079 | 18 |  |
| `banana_cart_2` | Banana cart | chaderghat | 4392 | 3374 | 18 |  |
| `banana_cart_3` | Banana cart | nampally | 3874 | 3226 | 18 |  |
| `banana_cart_4` | Banana cart | tolichowki | 2412 | 2914 | 18 |  |
| `banana_cart_5` | Banana cart | ameerpet | 2981 | 1114 | 18 |  |
| `banana_cart_6` | Banana cart | erragadda | 2337 | 541 | 18 |  |
| `banana_cart_7` | Banana cart | secunderabad | 5024 | 823 | 18 |  |
| `banana_cart_8` | Banana cart | dilsukhnagar | 5776 | 3945 | 18 |  |
| `banana_cart_9` | Banana cart | charminar | 4097 | 4017 | 18 |  |
| `banana_cart_10` | Banana cart | secunderabad | 5139 | 806 | 18 |  |

#### barber (7)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `barber_1` | Lucky Hair Cutting Saloon | himayatnagar | 4419 | 2636 | 18 |  |
| `barber_2` | Sundar Hair Saloon | kachiguda | 5236 | 2982 | 18 |  |
| `barber_3` | Raja Hair Cutting | masab_tank | 3164 | 2683 | 18 |  |
| `barber_4` | Famous Saloon | musheerabad | 4655 | 1436 | 18 |  |
| `barber_5` | Hero Hair Cutting | dilsukhnagar | 6464 | 3998 | 18 |  |
| `barber_6` | Taj Hair Saloon | charminar | 4036 | 4746 | 18 |  |
| `barber_7` | New Style Hair Dressers | rtc_x | 4774 | 2539 | 18 |  |

#### bridge (5)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `afzalgunj_bridge` | Afzalgunj Bridge | afzalgunj | 4149 | 3750 | 24 |  |
| `chaderghat_bridge` | Chaderghat Bridge | chaderghat | 4520 | 3600 | 28 |  |
| `musallam_jung_bridge` | Musallam Jung Bridge | afzalgunj | 3612 | 3866 | 22 |  |
| `naya_pul` | Naya Pul | afzalgunj | 3914 | 3800 | 28 |  |
| `purana_pul` | Purana Pul & Jumerat Bazaar | puranapul | 3200 | 3790 | 30 |  |

#### bus_stop (22)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `bus_stop_1` | Koti bus stop | koti | 4294 | 3253 | 18 |  |
| `bus_stop_2` | Abids bus stop | abids | 3996 | 3169 | 18 |  |
| `bus_stop_3` | Nampally bus stop | nampally | 3790 | 2980 | 18 |  |
| `bus_stop_4` | Lakdikapul bus stop | masab_tank | 3037 | 2505 | 18 |  |
| `bus_stop_5` | Mehdipatnam bus stop | tolichowki | 2379 | 2851 | 18 |  |
| `bus_stop_6` | Ameerpet bus stop | ameerpet | 2620 | 941 | 18 |  |
| `bus_stop_7` | Paradise bus stop | secunderabad | 4329 | 748 | 18 |  |
| `bus_stop_8` | Secunderabad bus stop | secunderabad | 5239 | 1070 | 18 |  |
| `bus_stop_9` | RTC X Roads bus stop | rtc_x | 5114 | 2276 | 18 |  |
| `bus_stop_10` | Himayatnagar bus stop | himayatnagar | 4456 | 2419 | 18 |  |
| `bus_stop_11` | Dilsukhnagar bus stop | dilsukhnagar | 6514 | 3892 | 18 |  |
| `bus_stop_12` | Malakpet bus stop | malakpet | 5280 | 3827 | 18 |  |
| `bus_stop_13` | Charminar bus stop | charminar | 4205 | 4362 | 18 |  |
| `bus_stop_14` | Tank Bund bus stop | musheerabad | 4415 | 1734 | 18 |  |
| `bus_stop_15` | Tolichowki bus stop | tolichowki | 1765 | 2681 | 18 |  |
| `bus_stop_16` | Tarnaka bus stop | osmania | 6575 | 1451 | 18 |  |
| `bus_stop_17` | Afzalgunj bus stop | puranapul | 3532 | 3718 | 18 |  |
| `bus_stop_18` | Khairatabad bus stop | khairatabad | 3182 | 1887 | 18 |  |
| `bus_stop_19` | Chikkadpally bus stop | rtc_x | 4921 | 2489 | 18 |  |
| `bus_stop_20` | HITEC City bus stop | hitec | 526 | 702 | 18 |  |
| `bus_stop_21` | Uppal bus stop | amberpet | 7423 | 2957 | 18 |  |
| `bus_stop_22` | LB Nagar bus stop | lb_nagar | 7316 | 4481 | 18 |  |

#### chai_bandi (8)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `chai_bandi_1` | Raju's chai bandi | himayatnagar | 4654 | 2721 | 18 |  |
| `chai_bandi_2` | Chai bandi | erragadda | 2545 | 456 | 18 |  |
| `chai_bandi_3` | OU canteen chai | osmania | 6274 | 2054 | 18 |  |
| `chai_bandi_4` | Chai bandi | charminar | 3876 | 4581 | 18 |  |
| `chai_bandi_5` | Chai bandi | bahadurpura | 3268 | 4460 | 18 |  |
| `chai_bandi_6` | Bhutta & chai cart | hussain_sagar | 4291 | 1539 | 18 |  |
| `chai_bandi_7` | Construction-site chai | hitec | 415 | 670 | 18 |  |
| `chai_bandi_8` | Chai bandi | hussain_sagar | 4100 | 939 | 18 |  |

#### church (12)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `church_1` | Methodist Church, Marredpally | secunderabad | 5642 | 560 | 20 |  |
| `church_2` | CSI Church, Chikkadpally | himayatnagar | 4720 | 2359 | 18 |  |
| `church_holy_trinity` | Holy Trinity Church, Bolarum | secunderabad | 4700 | 185 | 20 | alias of `holy_trinity_church_bolarum` |
| `church_st_georges` | St. George's Church | abids | 4060 | 3138 | 18 | alias of `st_georges_church_abids` |
| `church_st_johns` | St. John's Church | marredpally | 5986 | 640 | 18 | alias of `st_johns_church_secunderabad` |
| `church_st_josephs` | St. Joseph's Cathedral | abids | 3975 | 2812 | 22 |  |
| `church_st_marys` | St. Mary's Church | secunderabad | 4590 | 1047 | 22 |  |
| `church_wesley` | Wesley Church | secunderabad | 5076 | 862 | 20 |  |
| `holy_trinity_church_bolarum` | Holy Trinity Church, Bolarum | secunderabad | 4700 | 185 | 20 |  |
| `st_georges_church_abids` | St. George's Church | abids | 4060 | 3138 | 18 |  |
| `st_johns_church_secunderabad` | St. John's Church | marredpally | 5986 | 640 | 18 |  |
| `st_josephs_cathedral` | St. Joseph's Cathedral | abids | 3975 | 2812 | 22 | alias of `church_st_josephs` |

#### cinema (10)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `anand_theatre` | Anand Theatre | secunderabad | 5320 | 739 | 30 |  |
| `devi_theatre` | Devi 70mm | rtc_x | 4992 | 2305 | 30 |  |
| `liberty_theatre` | Liberty Theatre | himayatnagar | 4209 | 2262 | 30 |  |
| `odeon_theatre` | Odeon | rtc_x | 4824 | 2184 | 30 |  |
| `prasads_imax` | Prasads IMAX | hussain_sagar | 3480 | 1966 | 30 |  |
| `ramakrishna_theatre` | Ramakrishna 70mm | abids | 3936 | 3030 | 30 |  |
| `sandhya_theatre` | Sandhya 70mm & 35mm | rtc_x | 4944 | 2172 | 30 |  |
| `sangeet_theatre` | Sangeet 70mm | secunderabad | 5556 | 1173 | 18 |  |
| `shanti_theatre` | Shanti Theatre | koti | 4560 | 2770 | 24 |  |
| `sudarshan_theatre` | Sudarshan 35mm | rtc_x | 4876 | 2282 | 30 |  |

#### coconut_cart (7)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `coconut_cart_1` | Tender coconut cart | hussain_sagar | 3311 | 1672 | 18 |  |
| `coconut_cart_2` | Tender coconut cart | hussain_sagar | 3369 | 1170 | 18 |  |
| `coconut_cart_3` | Tender coconut cart | hussain_sagar | 3769 | 991 | 18 |  |
| `coconut_cart_4` | Tender coconut cart | hussain_sagar | 4215 | 1686 | 18 |  |
| `coconut_cart_5` | Tender coconut cart | banjara | 1797 | 1467 | 18 |  |
| `coconut_cart_6` | Tender coconut cart | dilsukhnagar | 6958 | 4185 | 18 |  |
| `coconut_cart_7` | Tender coconut cart | musheerabad | 4411 | 1584 | 18 |  |

#### cycle_rent (5)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `cycle_rent_1` | Lakshmi Cycle Stores (on hire) | himayatnagar | 4486 | 2261 | 18 |  |
| `cycle_rent_2` | Mohan Cycle Taxi | koti | 4311 | 2861 | 18 |  |
| `cycle_rent_3` | Raju Cycle Taxi | musheerabad | 4774 | 2032 | 18 |  |
| `cycle_rent_4` | Peter Cycle Works (hire) | marredpally | 5814 | 475 | 18 |  |
| `cycle_rent_5` | Chinna Cycle Taxi | himayatnagar | 4626 | 2525 | 18 |  |

#### dargah (2)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `dargah_yousufain` | Dargah Yousufain | nampally | 3358 | 2958 | 18 |  |
| `hussain_shah_wali_dargah` | Hussain Shah Wali Dargah & Shaikpet Sarai | tolichowki | 1460 | 2413 | 18 |  |

#### district (2)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `barkas` | Barkas (the Arab quarter) | chandrayangutta | 4700 | 5345 | 40 |  |
| `kphb_colony` | KPHB Colony, Kukatpally | hitec | 1420 | 200 | 40 |  |

#### dosa_bandi (7)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `dosa_bandi_1` | Dosa bandi | himayatnagar | 4649 | 2331 | 18 |  |
| `dosa_bandi_2` | Dosa bandi | malakpet | 5326 | 4214 | 18 |  |
| `dosa_bandi_3` | Dosa bandi | dilsukhnagar | 6464 | 4209 | 18 |  |
| `dosa_bandi_4` | Dosa bandi | saidabad | 5351 | 4629 | 18 |  |
| `dosa_bandi_5` | Dosa bandi | hussain_sagar | 3578 | 2022 | 18 |  |
| `dosa_bandi_6` | Dosa bandi | secunderabad | 4712 | 995 | 18 |  |
| `dosa_bandi_7` | Dosa bandi | amberpet | 5537 | 3046 | 18 |  |

#### edge (6)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `chilkur_balaji` | To Chilkur Balaji | rajendranagar | 40 | 3708 | 16 | off-map exit |
| `gandipet` | Gandipet (Osman Sagar) road | rajendranagar | 30 | 3720 | 30 | off-map exit |
| `himayat_sagar` | To Himayat Sagar | rajendranagar | 100 | 3712 | 16 | off-map exit |
| `mrugavani_park` | To Mrugavani deer park | rajendranagar | 70 | 3730 | 16 | off-map exit |
| `ramoji_film_city` | To Ramoji Film City (bus trip) | lb_nagar | 7980 | 4890 | 30 | off-map exit |
| `vijayawada_highway` | NH 9 to Vijayawada | lb_nagar | 7950 | 4840 | 30 |  |

#### festival (3)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `bonalu` | Lashkar Bonalu, Ujjaini Mahankali | secunderabad | 4914 | 1172 | 26 | alias of `ujjaini_mahankali_temple` |
| `ganesh_immersion` | Ganesh Nimajjanam on Tank Bund | hussain_sagar | 4110 | 1800 | 30 | alias of `ganesh_immersion_point` |
| `ganesh_immersion_point` | Tank Bund immersion cranes | hussain_sagar | 4110 | 1800 | 30 | festival ganesh_immersion |

#### flower_cart (12)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `flower_cart_1` | Jasmine & marigold cart | himayatnagar | 4519 | 2562 | 18 |  |
| `flower_cart_2` | Flower cart | himayatnagar | 4557 | 2359 | 18 |  |
| `flower_cart_3` | Flower cart | amberpet | 5595 | 2926 | 18 |  |
| `flower_cart_4` | Flower cart (Mahankali) | secunderabad | 4942 | 1215 | 18 |  |
| `flower_cart_5` | Flower cart (Sai Baba temple) | dilsukhnagar | 6770 | 4049 | 18 |  |
| `flower_cart_6` | Flower cart (Sai Baba temple) | dilsukhnagar | 6803 | 4075 | 18 |  |
| `flower_cart_7` | Flower cart (Sai Baba temple) | dilsukhnagar | 6836 | 4102 | 18 |  |
| `flower_cart_8` | Flower cart (Sai Baba temple) | dilsukhnagar | 6870 | 4128 | 18 |  |
| `flower_cart_9` | Flower cart | masab_tank | 2714 | 2966 | 18 |  |
| `flower_cart_10` | Flower cart (Lal Darwaza) | charminar | 4177 | 4633 | 18 |  |
| `flower_cart_11` | Flower cart (Birla Mandir steps) | basheerbagh | 3859 | 2450 | 18 |  |
| `flower_cart_12` | Flower cart (Peddamma Temple) | hitec | 1318 | 1217 | 18 |  |

#### food (5)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `bawarchi` | Bawarchi | rtc_x | 4938 | 2100 | 30 |  |
| `famous_ice_cream` | Famous Ice Cream | nampally | 3818 | 3240 | 16 |  |
| `gokul_chat` | Gokul Chat | koti | 4230 | 3140 | 18 |  |
| `hotel_madina` | Hotel Madina | charminar | 3918 | 4052 | 30 | alias of `pathergatti` |
| `paradise` | Paradise | secunderabad | 4440 | 752 | 26 |  |

#### giver (36)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `giver_abids` | Abids: GPO corner | abids | 4012 | 2901 | 22 |  |
| `giver_afzalgunj` | Afzalgunj: library steps | afzalgunj | 4032 | 3662 | 22 |  |
| `giver_amberpet` | Amberpet | amberpet | 6330 | 3150 | 22 |  |
| `giver_ameerpet` | Ameerpet coaching lane | ameerpet | 2646 | 1007 | 22 |  |
| `giver_bahadurpura` | Bahadurpura: zoo road | zoo | 2874 | 5026 | 22 |  |
| `giver_banjara` | Banjara Hills Road No. 1 | banjara | 2249 | 1546 | 22 |  |
| `giver_basheerbagh` | Basheerbagh: Cafe Bahar corner | himayatnagar | 4189 | 2329 | 22 |  |
| `giver_begumpet` | Begumpet airport road | begumpet | 3368 | 581 | 22 |  |
| `giver_chaderghat` | Chaderghat: Imlibun gate | chaderghat | 4325 | 3572 | 22 |  |
| `giver_chandrayangutta` | Chandrayangutta | chandrayangutta | 4857 | 5202 | 22 |  |
| `giver_charminar` | Charminar: Laad Bazaar mouth | charminar | 3767 | 4401 | 22 |  |
| `giver_dabeerpura` | Purani Haveli gate | charminar | 4234 | 4156 | 22 |  |
| `giver_dilsukhnagar` | Dilsukhnagar: Sai Baba temple road | dilsukhnagar | 6719 | 3926 | 22 |  |
| `giver_erragadda` | Erragadda Rythu Bazaar | erragadda | 2304 | 477 | 22 |  |
| `giver_falaknuma` | Falaknuma: palace road | falaknuma | 3753 | 5195 | 22 |  |
| `giver_golconda` | Golconda: Fateh Darwaza approach | golconda | 1418 | 3316 | 22 |  |
| `giver_himayatnagar` | Himayatnagar: outside Hotel Sarvar | himayatnagar | 4473 | 2671 | 22 |  |
| `giver_hitec` | Cyber Towers road | hitec | 344 | 616 | 22 |  |
| `giver_hussain_sagar` | Tank Bund: by the statues | hussain_sagar | 4235 | 1635 | 22 |  |
| `giver_jubilee` | Jubilee Hills Check Post | jubilee | 1371 | 1297 | 22 |  |
| `giver_kachiguda` | Kachiguda station road | kachiguda | 4943 | 3181 | 22 |  |
| `giver_khairatabad` | Khairatabad: Ganesh ground | khairatabad | 3201 | 2075 | 22 |  |
| `giver_koti` | Koti: by the bus stand | koti | 4382 | 3233 | 22 |  |
| `giver_langar_houz` | Langar Houz | tolichowki | 1724 | 3262 | 22 |  |
| `giver_lb_nagar` | LB Nagar circle | lb_nagar | 7509 | 4549 | 22 |  |
| `giver_malakpet` | Malakpet: Hotel Daulat | malakpet | 5470 | 3864 | 22 |  |
| `giver_marredpally` | Marredpally | secunderabad | 5675 | 457 | 22 |  |
| `giver_masab_tank` | Masab Tank junction | masab_tank | 2918 | 2533 | 22 |  |
| `giver_musheerabad` | Musheerabad | musheerabad | 4859 | 1668 | 22 |  |
| `giver_nampally` | Nampally: station road | nampally | 3594 | 2968 | 22 |  |
| `giver_osmania` | OU Arts College road | osmania | 6153 | 2146 | 22 |  |
| `giver_puranapul` | Purana Pul: Jumerat Bazaar | puranapul | 3230 | 3716 | 22 |  |
| `giver_rtc_x` | RTC X Roads: under the film hoardings | rtc_x | 4850 | 2195 | 22 |  |
| `giver_saidabad` | Saidabad | malakpet | 5330 | 4295 | 22 |  |
| `giver_secunderabad` | Clock Tower road | secunderabad | 5028 | 889 | 22 |  |
| `giver_tolichowki` | Tolichowki: Hotel Sohail | tolichowki | 1897 | 2706 | 22 |  |

#### hidden (41)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `hide_airport_fence` | Begumpet airport fence | begumpet | 3820 | 520 | 12 |  |
| `hide_ashok_nagar_ground` | Ashok Nagar ground corner | himayatnagar | 4535 | 2320 | 12 |  |
| `hide_banjara_lake` | Banjara Lake edge | banjara | 2480 | 1920 | 12 |  |
| `hide_chaderghat_sand` | Chaderghat riverbed | chaderghat | 4570 | 3540 | 12 |  |
| `hide_charminar_corner` | Charminar plaza, south-east corner | charminar | 4045 | 4505 | 12 |  |
| `hide_chowmahalla_wall` | Chowmahalla outer wall | bahadurpura | 3520 | 4600 | 12 |  |
| `hide_clock_tower_park` | Clock Tower park bench | secunderabad | 4915 | 830 | 12 |  |
| `hide_cyber_fountain` | Cyber Towers forecourt | hitec | 380 | 580 | 12 |  |
| `hide_durgam_rocks` | Durgam Cheruvu rocks | jubilee | 830 | 1290 | 12 |  |
| `hide_falaknuma_hill` | Falaknuma hill path | falaknuma | 3700 | 5440 | 12 |  |
| `hide_gachibowli` | Gachibowli stadium car park | jubilee | 520 | 1980 | 12 |  |
| `hide_golconda_bastion` | Golconda, a quiet bastion | rajendranagar | 880 | 3480 | 12 |  |
| `hide_golconda_court` | Golconda inner court | golconda | 1220 | 3350 | 12 |  |
| `hide_gulzar_houz_ledge` | Gulzar Houz, fountain ledge | charminar | 3920 | 4142 | 12 |  |
| `hide_home_colony_ground` | Colony ground, under the slide | himayatnagar | 4734 | 2700 | 12 |  |
| `hide_home_lane` | Behind the colony water tank | rtc_x | 4785 | 2556 | 12 |  |
| `hide_indira_rock` | Indira Park rock garden | musheerabad | 4610 | 1700 | 12 |  |
| `hide_kbr_trail` | KBR Park trail | banjara | 1700 | 1820 | 12 |  |
| `hide_lb_stand` | LB Stadium, behind the west stand | basheerbagh | 3850 | 2520 | 12 |  |
| `hide_lumbini_hedge` | Lumbini Park hedge maze corner | hussain_sagar | 3812 | 2048 | 12 |  |
| `hide_mecca_masjid_pigeons` | Pigeon square by Mecca Masjid | charminar | 3910 | 4672 | 12 |  |
| `hide_mir_alam` | Mir Alam Tank bank | zoo | 2120 | 5320 | 12 |  |
| `hide_mj_steps` | Mozamjahi Market back steps | abids | 3890 | 3205 | 12 |  |
| `hide_moula_ali` | Moula Ali hill steps | marredpally | 7350 | 820 | 12 |  |
| `hide_nallakunta_ground` | Nallakunta ground, behind the stumps | amberpet | 5585 | 3015 | 12 |  |
| `hide_nayapul_sand` | Under Naya Pul, on the sand | afzalgunj | 3870 | 3730 | 12 |  |
| `hide_ntr_lawn` | NTR Gardens, under the big tree | hussain_sagar | 3600 | 1990 | 12 |  |
| `hide_numaish_corner` | Numaish grounds, behind the giant wheel | nampally | 3510 | 3005 | 12 |  |
| `hide_ou_campus` | OU campus boulder | osmania | 6450 | 1700 | 12 |  |
| `hide_parade_grounds` | Parade Grounds, far corner | secunderabad | 4640 | 450 | 12 |  |
| `hide_public_gardens_tree` | Public Gardens, banyan roots | basheerbagh | 3625 | 2700 | 12 |  |
| `hide_puranapul_sand` | Purana Pul riverbed | puranapul | 3160 | 3850 | 12 |  |
| `hide_race_course` | Malakpet race course rail | malakpet | 5130 | 4130 | 12 |  |
| `hide_safilguda` | Safilguda lake bank | marredpally | 6760 | 560 | 12 |  |
| `hide_sanjeevaiah_bench` | Sanjeevaiah Park, last bench | hussain_sagar | 4060 | 900 | 12 |  |
| `hide_saroornagar_lake` | Saroornagar Lake bank | saroornagar | 6620 | 4800 | 12 |  |
| `hide_shilparamam_hut` | Shilparamam craft hut | hitec | 640 | 850 | 12 |  |
| `hide_taramati` | Taramati Baradari steps | rajendranagar | 620 | 3660 | 12 |  |
| `hide_tombs_garden` | Qutb Shahi Tombs garden | golconda | 980 | 2960 | 12 |  |
| `hide_vidyanagar_ground` | Vidyanagar ground corner | rtc_x | 5230 | 2680 | 12 |  |
| `hide_zoo_pond` | Nehru Zoo, by the pond | langar_houz | 2560 | 4720 | 12 |  |

#### home (2)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `friend_home` | Best friend's house | rtc_x | 4779 | 2652 | 16 |  |
| `home` | Home (Lakshmi Nivas, Lakshmi Nagar Colony) | himayatnagar | 4580 | 2619 | 20 |  |

#### internet_cafe (6)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `internet_cafe_1` | Cyber Zone Browsing Centre | himayatnagar | 4344 | 2463 | 18 |  |
| `internet_cafe_2` | Netway Internet Browsing | abids | 3917 | 3193 | 18 |  |
| `internet_cafe_3` | Info Highway Browsing Centre | ameerpet | 2610 | 986 | 18 |  |
| `internet_cafe_4` | Sify iWay-style Browsing Centre | marredpally | 5714 | 756 | 18 |  |
| `internet_cafe_5` | Campus Net Cafe | osmania | 6196 | 1256 | 18 |  |
| `internet_cafe_6` | Dial-Up Dreams Net Cafe | dilsukhnagar | 6326 | 4136 | 18 |  |

#### irani_cafe (27)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `alpha_hotel` | Alpha Hotel | secunderabad | 5343 | 1130 | 18 |  |
| `blue_sea_cafe` | Blue Sea Tea & Snacks | secunderabad | 5657 | 1200 | 18 |  |
| `cafe_bahar` | Cafe Bahar | himayatnagar | 4126 | 2370 | 18 |  |
| `garden_cafe` | Garden Cafe | secunderabad | 4960 | 742 | 30 |  |
| `grand_hotel` | Grand Hotel | abids | 3998 | 3127 | 18 |  |
| `grand_hotel_abids` | Grand Hotel, Abids | abids | 3998 | 3127 | 18 | alias of `grand_hotel` |
| `irani_cafe_1` | Nimrah Cafe (facing Charminar) | charminar | 3948 | 4206 | 22 | alias of `nimrah_cafe` |
| `irani_cafe_2` | Grand Hotel, Abids | abids | 3998 | 3127 | 18 | alias of `grand_hotel` |
| `irani_cafe_3` | Cafe Bahar, Basheerbagh | himayatnagar | 4126 | 2370 | 18 | alias of `cafe_bahar` |
| `irani_cafe_4` | Niloufer Cafe, Lakdikapul | basheerbagh | 3420 | 2368 | 30 | alias of `niloufer_cafe` |
| `irani_cafe_5` | Garden Cafe, Clock Tower | secunderabad | 4960 | 742 | 30 | alias of `garden_cafe` |
| `irani_cafe_6` | Alpha Hotel, Secunderabad | secunderabad | 5343 | 1130 | 18 | alias of `alpha_hotel` |
| `irani_cafe_7` | Hotel Sarvar | himayatnagar | 4458 | 2691 | 18 |  |
| `irani_cafe_8` | Cafe Shalimar | rtc_x | 4851 | 2378 | 18 |  |
| `irani_cafe_9` | Cafe Kohinoor | kachiguda | 4937 | 2944 | 18 |  |
| `irani_cafe_10` | Hotel Sohail | tolichowki | 1997 | 2683 | 18 |  |
| `irani_cafe_11` | Cafe Firdaus | ameerpet | 2773 | 1034 | 18 |  |
| `irani_cafe_12` | Cafe Bholakpur | musheerabad | 4928 | 1834 | 18 |  |
| `irani_cafe_13` | Hotel Daulat | malakpet | 5271 | 3908 | 18 |  |
| `irani_cafe_14` | Cafe Golden Star | dilsukhnagar | 6625 | 3979 | 18 |  |
| `irani_cafe_15` | Cafe Gulzar | charminar | 3729 | 4112 | 18 |  |
| `irani_cafe_16` | Cafe Sohrab | tolichowki | 2423 | 2729 | 18 |  |
| `irani_cafe_17` | Blue Sea Tea & Snacks, Regimental Bazaar | secunderabad | 5657 | 1200 | 18 | alias of `blue_sea_cafe` |
| `irani_cafe_18` | Sarvi, Banjara Hills | banjara | 2216 | 1604 | 18 | alias of `sarvi` |
| `niloufer_cafe` | Niloufer Cafe | basheerbagh | 3420 | 2368 | 30 |  |
| `nimrah_cafe` | Nimrah Cafe | charminar | 3948 | 4206 | 22 |  |
| `sarvi` | Sarvi | banjara | 2216 | 1604 | 18 |  |

#### iyengar_bakery (4)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `iyengar_bakery_1` | Sri Krishna Iyengar Bakery | kachiguda | 4990 | 2796 | 18 |  |
| `iyengar_bakery_2` | Sri Iyengar Bakery | secunderabad | 5559 | 705 | 18 |  |
| `iyengar_bakery_3` | Sri Venkateswara Iyengar Bakery | dilsukhnagar | 5936 | 4051 | 18 |  |
| `iyengar_bakery_4` | Bangalore Iyengar Bakery | ameerpet | 2886 | 1229 | 18 |  |

#### jetty (2)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `lumbini_boat` | Lumbini boat jetty | hussain_sagar | 3880 | 2002 | 14 | alias of `lumbini_jetty` |
| `lumbini_jetty` | Lumbini boat jetty | hussain_sagar | 3880 | 2002 | 14 | boat |

#### junction (25)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `abids` | Abids Circle | abids | 3962 | 2950 | 40 |  |
| `ameerpet` | Ameerpet | ameerpet | 2720 | 970 | 30 |  |
| `banjara_hills` | Banjara Hills Road No. 1 | banjara | 2400 | 1580 | 30 |  |
| `basheerbagh` | Basheerbagh | himayatnagar | 4160 | 2440 | 30 |  |
| `begumpet` | Begumpet | begumpet | 3300 | 680 | 30 |  |
| `dilsukhnagar` | Dilsukhnagar | dilsukhnagar | 6250 | 3920 | 30 |  |
| `erragadda` | Erragadda | erragadda | 2120 | 330 | 30 |  |
| `jubilee_hills` | Jubilee Hills Check Post | jubilee | 1430 | 1300 | 30 |  |
| `jubilee_hills_check_post` | Jubilee Hills Check Post | jubilee | 1430 | 1300 | 30 | alias of `jubilee_hills` |
| `khairatabad` | Khairatabad | khairatabad | 3220 | 1992 | 30 |  |
| `king_koti` | King Koti | koti | 4250 | 2860 | 30 |  |
| `koti` | Koti | koti | 4330 | 3240 | 40 |  |
| `lakdikapul` | Lakdikapul | basheerbagh | 3380 | 2345 | 30 |  |
| `lb_nagar` | LB Nagar | lb_nagar | 7150 | 4300 | 30 |  |
| `liberty` | Liberty junction | himayatnagar | 4170 | 2290 | 30 |  |
| `malakpet` | Malakpet | malakpet | 5060 | 3842 | 30 |  |
| `masab_tank` | Masab Tank | masab_tank | 2930 | 2500 | 30 |  |
| `mehdipatnam` | Mehdipatnam | tolichowki | 2250 | 2880 | 30 |  |
| `narayanguda_ymca` | Narayanguda YMCA (Sadar festival) | himayatnagar | 4528 | 2712 | 24 |  |
| `panjagutta` | Panjagutta | banjara | 2800 | 1445 | 30 |  |
| `ranigunj` | Ranigunj | secunderabad | 4720 | 1060 | 26 |  |
| `rtc_x_roads` | RTC X Roads | rtc_x | 4915 | 2230 | 60 |  |
| `tarnaka` | Tarnaka | osmania | 6430 | 1330 | 30 |  |
| `tolichowki` | Tolichowki | tolichowki | 1520 | 2560 | 30 |  |
| `uppal` | Uppal | amberpet | 7350 | 2920 | 30 |  |

#### kirana (20)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `kirana_1` | Sri Lakshmi Kirana & General Stores | himayatnagar | 4699 | 2586 | 18 |  |
| `kirana_2` | Balaji General Stores | himayatnagar | 4316 | 2522 | 18 |  |
| `kirana_3` | Ganesh Provisions | himayatnagar | 4694 | 2305 | 18 |  |
| `kirana_4` | Durga Kirana | rtc_x | 5086 | 2616 | 18 |  |
| `kirana_5` | Annapurna Kirana | kachiguda | 5264 | 2947 | 18 |  |
| `kirana_6` | Sai Ram Kirana | amberpet | 5634 | 2886 | 18 |  |
| `kirana_7` | Hanuman Kirana | masab_tank | 3136 | 2552 | 18 |  |
| `kirana_8` | Noor Kirana & Provisions | tolichowki | 1914 | 2838 | 18 |  |
| `kirana_9` | Mahalakshmi General Stores | ameerpet | 2464 | 1069 | 18 |  |
| `kirana_10` | Raju Kirana | erragadda | 2452 | 484 | 18 |  |
| `kirana_11` | Prakash Nagar Stores | ameerpet | 3164 | 1024 | 18 |  |
| `kirana_12` | Ali Kirana & Provisions | musheerabad | 4774 | 1289 | 18 |  |
| `kirana_13` | Joseph General Stores | marredpally | 5825 | 436 | 18 |  |
| `kirana_14` | Railway Colony Stores | marredpally | 6310 | 1114 | 18 |  |
| `kirana_15` | Laxmi Narasimha Kirana | malakpet | 4964 | 3997 | 18 |  |
| `kirana_16` | Sri Venkateshwara Kirana | dilsukhnagar | 6436 | 4065 | 18 |  |
| `kirana_17` | Saidabad Kirana | chandrayangutta | 5136 | 4905 | 18 |  |
| `kirana_18` | Hyderabad Kirana | charminar | 3666 | 4080 | 18 |  |
| `kirana_19` | Chandrayangutta Kirana | chandrayangutta | 4799 | 5277 | 18 |  |
| `kirana_20` | Kothapet Kirana | dilsukhnagar | 6686 | 4185 | 18 |  |

#### kite_stall (3)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `kite_stall_1` | Kite stall | charminar | 3982 | 4106 | 18 |  |
| `kite_stall_2` | Kite stall | charminar | 4051 | 4134 | 18 |  |
| `kite_stall_3` | Kite stall | charminar | 4117 | 4105 | 18 |  |

#### landmark (59)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `all_india_radio` | All India Radio, Saifabad | basheerbagh | 3384 | 2214 | 18 |  |
| `annapurna_studios` | Annapurna Studios | banjara | 2300 | 1511 | 26 |  |
| `apollo_hospital_jubilee_hills` | Apollo Hospital, Jubilee Hills | jubilee | 1405 | 1500 | 20 |  |
| `assembly` | Legislative Assembly | basheerbagh | 3804 | 2552 | 26 |  |
| `badshahi_ashurkhana` | Badshahi Ashurkhana | charminar | 3700 | 4156 | 16 |  |
| `bapu_ghat` | Bapu Ghat (Gandhi memorial) | langar_houz | 1800 | 3622 | 18 |  |
| `buddha_statue` | Buddha Statue | hussain_sagar | 3880 | 1812 | 14 | boat |
| `charminar` | Charminar | charminar | 3900 | 4290 | 70 | FINALE |
| `chowmahalla_palace` | Chowmahalla Palace gate | charminar | 3628 | 4452 | 22 |  |
| `city_central_library` | City Central Library, Chikkadpally | himayatnagar | 4640 | 2427 | 16 |  |
| `city_college` | Government City College | bahadurpura | 3420 | 4030 | 20 |  |
| `cyber_towers` | Cyber Towers | hitec | 450 | 580 | 30 |  |
| `doordarshan_kendra` | Doordarshan Kendra, Ramanthapur | amberpet | 6560 | 3080 | 24 |  |
| `errum_manzil` | Errum Manzil (gate) | banjara | 2839 | 1570 | 18 |  |
| `falaknuma_palace` | Falaknuma Palace gate | falaknuma | 3646 | 5362 | 24 |  |
| `film_nagar` | Film Nagar | jubilee | 1230 | 1900 | 30 |  |
| `gachibowli_stadium` | Gachibowli Stadium | jubilee | 390 | 1803 | 30 |  |
| `gandhi_statue_assembly` | Gandhi statue, Assembly lawn | basheerbagh | 3770 | 2616 | 12 |  |
| `golconda_bala_hissar` | Bala Hissar pavilion | golconda | 1040 | 3286 | 22 |  |
| `golconda_fateh_darwaza` | Fateh Darwaza (clap here) | golconda | 1284 | 3300 | 16 | minigame golconda_clap |
| `golconda_fort` | Golconda Fort | golconda | 1352 | 3270 | 30 |  |
| `golconda_sound_light` | Sound & light show seats | golconda | 1225 | 3395 | 20 |  |
| `gpo` | General Post Office, Abids | abids | 4024 | 2905 | 30 |  |
| `gulzar_houz` | Gulzar Houz | charminar | 3900 | 4072 | 30 |  |
| `high_court` | High Court | charminar | 3740 | 3974 | 30 |  |
| `hill_fort_palace` | Hill Fort Palace (locked) | basheerbagh | 3790 | 2330 | 18 |  |
| `hitec_city` | HITEC City | hitec | 640 | 700 | 50 |  |
| `hitex` | HITEX Exhibition Centre (opens Jan 2003) | hitec | 900 | 764 | 30 |  |
| `hussain_sagar` | Hussain Sagar (Lumbini shore) | hussain_sagar | 3820 | 1995 | 200 | boat |
| `jawahar_bal_bhavan` | Jawahar Bal Bhavan | basheerbagh | 3760 | 2650 | 18 |  |
| `jntu_kukatpally` | JNTU, Kukatpally | erragadda | 1700 | 192 | 22 |  |
| `king_kothi` | King Kothi Palace (gated) | abids | 4180 | 2849 | 18 |  |
| `koti_womens_college` | Koti Women's College (British Residency) | koti | 4585 | 3272 | 30 |  |
| `lb_stadium` | Lal Bahadur Stadium (west gate) | basheerbagh | 3851 | 2580 | 30 |  |
| `lower_tank_bund` | Lower Tank Bund | musheerabad | 4392 | 1700 | 30 |  |
| `moula_ali_dargah` | Moula Ali Dargah | marredpally | 7420 | 802 | 20 |  |
| `nampally_exhibition` | Nampally Exhibition (Numaish) | nampally | 3655 | 3060 | 60 | Jan 1 - mid Feb |
| `necklace_road` | Necklace Road | hussain_sagar | 3345 | 1650 | 40 |  |
| `nims_hospital` | NIMS Hospital | khairatabad | 2934 | 1482 | 22 |  |
| `nizam_college` | Nizam College | himayatnagar | 4161 | 2560 | 22 |  |
| `osmania_hospital` | Osmania General Hospital | afzalgunj | 3762 | 3684 | 30 |  |
| `osmania_university` | Osmania University Arts College | osmania | 6262 | 2051 | 40 |  |
| `paigah_tombs` | Paigah Tombs | chandrayangutta | 4900 | 5179 | 18 |  |
| `qutb_shahi_tombs` | Qutb Shahi Tombs | golconda | 1100 | 2780 | 30 |  |
| `raj_bhavan` | Raj Bhavan | khairatabad | 2979 | 1752 | 20 |  |
| `ramakrishna_math` | Ramakrishna Math, Domalguda | himayatnagar | 4485 | 2200 | 20 |  |
| `ramanaidu_studios` | Ramanaidu Studios | jubilee | 1200 | 1850 | 20 |  |
| `rashtrapati_nilayam` | Rashtrapati Nilayam (gated) | secunderabad | 5000 | 172 | 22 |  |
| `ravindra_bharathi` | Ravindra Bharathi | basheerbagh | 3505 | 2418 | 22 |  |
| `sarathi_studios` | Sarathi Studios | ameerpet | 2535 | 1204 | 20 |  |
| `sarojini_devi_eye_hospital` | Sarojini Devi Eye Hospital | masab_tank | 2665 | 2593 | 18 |  |
| `secretariat` | Secretariat | basheerbagh | 3930 | 2155 | 24 |  |
| `secunderabad_clock_tower` | Secunderabad Clock Tower | secunderabad | 4955 | 892 | 26 |  |
| `secunderabad_club` | Secunderabad Club (members only) | secunderabad | 5157 | 560 | 18 |  |
| `state_central_library` | State Central Library | afzalgunj | 4040 | 3649 | 30 |  |
| `tank_bund` | Tank Bund | hussain_sagar | 4200 | 1655 | 40 |  |
| `tank_bund_statues` | Tank Bund statues | hussain_sagar | 4188 | 1690 | 30 |  |
| `taramati_baradari` | Taramati Baradari | rajendranagar | 660 | 3656 | 20 |  |
| `university_of_hyderabad` | University of Hyderabad (gate) | jubilee | 156 | 1905 | 20 |  |

#### market (18)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `abids_book_market` | Abids Sunday book market | abids | 3994 | 3040 | 26 |  |
| `begum_bazaar` | Begum Bazaar | afzalgunj | 3700 | 3420 | 30 |  |
| `chappal_bazar` | Chappal Bazar (by Kachiguda station) | kachiguda | 4900 | 3240 | 24 |  |
| `chenoy_trade_centre` | Chenoy Trade Centre (CTC) | secunderabad | 4616 | 840 | 18 |  |
| `dhoolpet` | Dhoolpet (Ganesh idol lanes, manja makers) | puranapul | 3282 | 3450 | 30 |  |
| `gaddiannaram_fruit_market` | Gaddiannaram Fruit Market | saroornagar | 6300 | 4411 | 26 |  |
| `general_bazaar` | General Bazaar | secunderabad | 4922 | 1150 | 26 |  |
| `koti_book_bazaar` | Koti pavement book bazaar | abids | 4137 | 3145 | 18 |  |
| `laad_bazaar` | Laad Bazaar (Chudi Bazaar) | charminar | 3700 | 4348 | 30 |  |
| `mahboob_chowk_clock_tower` | Mahboob Chowk & Murgi Chowk | charminar | 3580 | 4352 | 20 |  |
| `monda_market` | Monda Market | secunderabad | 5308 | 808 | 30 |  |
| `mozamjahi_market` | Mozamjahi Market | nampally | 3803 | 3160 | 30 |  |
| `patang_bazaar` | Patang Bazaar (kite stalls) | charminar | 3952 | 4176 | 20 |  |
| `pathergatti` | Pathergatti & Madina Building | charminar | 3918 | 4052 | 30 |  |
| `rythu_bazaar_erragadda` | Rythu Bazaar, Erragadda | erragadda | 2310 | 430 | 30 | Rythu Bazaars since 1999 |
| `rythu_bazaar_mehdipatnam` | Rythu Bazaar, Mehdipatnam | tolichowki | 2480 | 2878 | 30 | Rythu Bazaars since 1999 |
| `rythu_bazaar_saroornagar` | Rythu Bazaar, Kothapet | dilsukhnagar | 6560 | 4296 | 30 | Rythu Bazaars since 1999 |
| `sultan_bazaar` | Sultan Bazaar | koti | 4200 | 2992 | 30 |  |

#### meat_shop (7)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `meat_shop_1` | Fresh Chicken & Mutton | rtc_x | 5281 | 2546 | 18 |  |
| `meat_shop_2` | Al-Habeeb Chicken Centre | tolichowki | 1837 | 2866 | 18 |  |
| `meat_shop_3` | New Mutton Shop | erragadda | 2360 | 456 | 18 |  |
| `meat_shop_4` | Malakpet Mutton Shop | malakpet | 4936 | 4241 | 18 |  |
| `meat_shop_5` | Kothapet Chicken & Mutton | dilsukhnagar | 6243 | 4366 | 18 |  |
| `meat_shop_6` | Murgi Chowk Chicken Centre | charminar | 4209 | 4254 | 18 |  |
| `meat_shop_7` | Bholakpur Chicken Centre | musheerabad | 4774 | 1571 | 18 |  |

#### medical_shop (8)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `medical_shop_1` | Life Line Medicals | himayatnagar | 4376 | 2664 | 18 |  |
| `medical_shop_2` | Sri Venkateswara Medical Hall | koti | 4484 | 3132 | 18 |  |
| `medical_shop_3` | Care Medicals | abids | 3994 | 3215 | 18 |  |
| `medical_shop_4` | Marredpally Medicals | marredpally | 6050 | 464 | 18 |  |
| `medical_shop_5` | Malakpet Medicals | malakpet | 5357 | 3836 | 18 |  |
| `medical_shop_6` | Sri Sai Medicals | dilsukhnagar | 5936 | 4004 | 18 |  |
| `medical_shop_7` | Banjara Medicals | banjara | 2449 | 1525 | 18 |  |
| `medical_shop_8` | Sai Medical & General Stores | rtc_x | 4830 | 2614 | 18 |  |

#### mosque (14)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `jama_masjid_charminar` | Jama Masjid (Charminar) | charminar | 4095 | 4329 | 14 |  |
| `khairatabad_mosque` | Khairatabad Mosque | khairatabad | 3116 | 1975 | 18 |  |
| `mecca_masjid` | Mecca Masjid | charminar | 3840 | 4586 | 30 |  |
| `mosque_1` | Mallepally Masjid | nampally | 3347 | 2897 | 18 |  |
| `mosque_2` | Tolichowki Masjid | tolichowki | 2103 | 2894 | 18 |  |
| `mosque_3` | Musheerabad Jama Masjid | musheerabad | 4825 | 1836 | 18 |  |
| `mosque_4` | Malakpet Masjid | malakpet | 4964 | 4137 | 18 |  |
| `mosque_5` | Saidabad Masjid | chandrayangutta | 5164 | 5065 | 18 |  |
| `mosque_6` | Shah Ali Banda Masjid | charminar | 4150 | 4728 | 18 |  |
| `mosque_7` | Falaknuma Masjid | falaknuma | 4140 | 5250 | 18 |  |
| `mosque_8` | Begum Bazaar Masjid | afzalgunj | 3685 | 3531 | 18 |  |
| `mosque_9` | Khairatabad Mosque | khairatabad | 3116 | 1975 | 18 | alias of `khairatabad_mosque` |
| `mosque_10` | Jama Masjid (Charminar) | charminar | 4095 | 4329 | 14 | alias of `jama_masjid_charminar` |
| `spanish_mosque` | Spanish Mosque | begumpet | 3740 | 624 | 20 |  |

#### museum (4)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `birla_planetarium` | Birla Planetarium & Science Museum | basheerbagh | 3505 | 2337 | 30 |  |
| `nizams_museum` | Nizam's Museum, Purani Haveli | dabeerpura | 4260 | 4140 | 30 |  |
| `salar_jung_museum` | Salar Jung Museum | charminar | 4040 | 3964 | 30 |  |
| `state_museum` | State Archaeology Museum | basheerbagh | 3650 | 2624 | 20 |  |

#### park (19)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `durgam_cheruvu` | Durgam Cheruvu (secret lake) | hitec | 812 | 1190 | 20 |  |
| `exhibition_grounds` | Exhibition Grounds | nampally | 3655 | 3060 | 60 | alias of `nampally_exhibition` |
| `fateh_maidan` | Fateh Maidan (LB Stadium field) | basheerbagh | 3961 | 2580 | 50 |  |
| `gun_park` | Gun Park | basheerbagh | 3748 | 2490 | 14 |  |
| `gymkhana_ground_secunderabad` | Gymkhana Ground | secunderabad | 5040 | 527 | 40 |  |
| `harina_vanasthali` | Mahavir Harina Vanasthali (deer park) | lb_nagar | 7440 | 5150 | 30 |  |
| `indira_park` | Indira Park | musheerabad | 4440 | 2040 | 40 |  |
| `kbr_park` | KBR Park | banjara | 1760 | 1590 | 30 |  |
| `lumbini_park` | Lumbini Park | hussain_sagar | 3905 | 2030 | 36 |  |
| `malakpet_race_course` | Malakpet race course | malakpet | 5250 | 4050 | 40 |  |
| `mir_alam_tank` | Mir Alam Tank | zoo | 2300 | 4978 | 40 |  |
| `musi_riverbed` | Musi riverbed & dhobi ghat | afzalgunj | 3780 | 3765 | 40 |  |
| `nehru_zoo` | Nehru Zoological Park | bahadurpura | 2900 | 4740 | 36 |  |
| `ntr_gardens` | NTR Gardens | hussain_sagar | 3720 | 2010 | 40 | opened c. 2000 |
| `parade_grounds` | Parade Grounds | secunderabad | 4770 | 600 | 60 |  |
| `public_gardens` | Public Gardens | basheerbagh | 3700 | 2610 | 60 |  |
| `sanjeevaiah_park` | Sanjeevaiah Park | hussain_sagar | 3800 | 895 | 40 |  |
| `saroornagar_lake` | Saroornagar Lake | saroornagar | 6430 | 4682 | 30 |  |
| `shilparamam` | Shilparamam | hitec | 680 | 580 | 30 |  |

#### photo_studio (6)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `photo_studio_1` | Raj Colour Lab & Studio | himayatnagar | 4302 | 2426 | 18 |  |
| `photo_studio_2` | Studio Lakshmi | abids | 4078 | 3101 | 18 |  |
| `photo_studio_3` | Prince Photo Studio | abids | 3903 | 2980 | 18 |  |
| `photo_studio_4` | Sri Sai Photo Studio | ameerpet | 2526 | 986 | 18 |  |
| `photo_studio_5` | Tarnaka Photo Studio | osmania | 6299 | 1275 | 18 |  |
| `photo_studio_6` | Colour Lab & Studio | dilsukhnagar | 5837 | 4164 | 18 |  |

#### pindi_girni (7)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `pindi_girni_1` | Hanuman Pindi Girni | rtc_x | 4830 | 2586 | 18 |  |
| `pindi_girni_2` | Lakshmi Flour Mill | rtc_x | 5264 | 2500 | 18 |  |
| `pindi_girni_3` | Ganesh Flour Mill | masab_tank | 3123 | 2626 | 18 |  |
| `pindi_girni_4` | Sri Rama Flour Mill | erragadda | 2614 | 631 | 18 |  |
| `pindi_girni_5` | Noor Atta Chakki | musheerabad | 4746 | 1830 | 18 |  |
| `pindi_girni_6` | Noor Pindi Girni | charminar | 4211 | 4470 | 18 |  |
| `pindi_girni_7` | Durga Pindi Girni | dilsukhnagar | 6463 | 4394 | 18 |  |

#### playground (16)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `playground_1` | Lakshmi Nagar colony ground (home) | himayatnagar | 4696 | 2666 | 34 | alias of `playground_home` |
| `playground_2` | Vidyanagar colony ground | rtc_x | 5176 | 2638 | 34 |  |
| `playground_3` | Nallakunta ground | amberpet | 5508 | 2992 | 34 |  |
| `playground_4` | Bholakpur ground | musheerabad | 4825 | 1735 | 34 |  |
| `playground_5` | Marredpally ground | marredpally | 6325 | 360 | 34 |  |
| `playground_6` | Lalaguda railway ground | marredpally | 6185 | 1175 | 34 |  |
| `playground_7` | Chaitanyapuri ground | dilsukhnagar | 6255 | 4220 | 34 |  |
| `playground_8` | Saidabad maidan | chandrayangutta | 5250 | 4885 | 34 |  |
| `playground_9` | SR Nagar park ground | ameerpet | 2525 | 1075 | 30 |  |
| `playground_10` | Tolichowki maidan | tolichowki | 1775 | 2755 | 34 |  |
| `playground_11` | Amberpet ground | amberpet | 5980 | 3230 | 34 |  |
| `playground_12` | Masab Tank ground | masab_tank | 2885 | 2640 | 30 |  |
| `playground_13` | Shah Ali Banda maidan | charminar | 3795 | 4775 | 34 |  |
| `playground_14` | Ashok Nagar ground | himayatnagar | 4590 | 2255 | 34 |  |
| `playground_home` | Lakshmi Nagar colony ground | himayatnagar | 4696 | 2666 | 34 |  |
| `victory_playground` | Victory Playground (VPG) | kachiguda | 4755 | 3260 | 40 |  |

#### plaza (1)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `charminar_plaza` | Charminar Plaza (finale) | charminar | 3990 | 4420 | 60 |  |

#### restaurant (6)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `hotel_nayaab` | Hotel Nayaab | charminar | 3777 | 4080 | 18 |  |
| `hotel_niagara` | Hotel Niagara | chaderghat | 4519 | 3426 | 18 |  |
| `pista_house` | Pista House | falaknuma | 3918 | 4898 | 18 |  |
| `shadab_hotel` | Hotel Shadab | charminar | 4140 | 4015 | 18 |  |
| `shah_ghouse` | Shah Ghouse Cafe | falaknuma | 3867 | 4864 | 18 |  |
| `taj_mahal_hotel_abids` | Taj Mahal Hotel, Abids | abids | 3913 | 2920 | 18 |  |

#### samosa_bandi (7)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `samosa_bandi_1` | Samosa bandi | amberpet | 5709 | 2954 | 18 |  |
| `samosa_bandi_2` | Samosa bandi | tolichowki | 1985 | 2894 | 18 |  |
| `samosa_bandi_3` | Samosa bandi | musheerabad | 4840 | 1464 | 18 |  |
| `samosa_bandi_4` | Samosa bandi | marredpally | 6186 | 511 | 18 |  |
| `samosa_bandi_5` | Samosa bandi | dilsukhnagar | 6532 | 4164 | 18 |  |
| `samosa_bandi_6` | Samosa bandi | charminar | 4142 | 4378 | 18 |  |
| `samosa_bandi_7` | Samosa bandi | ameerpet | 2725 | 1175 | 18 |  |

#### school (15)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `ameerpet_coaching` | Ameerpet computer coaching lane | ameerpet | 2640 | 1060 | 26 |  |
| `hyderabad_public_school` | The Hyderabad Public School | begumpet | 3070 | 568 | 26 |  |
| `school_1` | Saraswati Vidya Mandir High School | himayatnagar | 4210 | 2664 | 26 |  |
| `school_2` | Vivekananda High School | rtc_x | 5000 | 2547 | 26 |  |
| `school_3` | Government High School, Kachiguda | kachiguda | 5180 | 2905 | 24 |  |
| `school_4` | Nalanda Public School | masab_tank | 3060 | 2804 | 24 |  |
| `school_5` | Al-Ameen High School | tolichowki | 1775 | 2885 | 22 |  |
| `school_6` | Sri Chaitanya Vidyalayam | ameerpet | 2350 | 1189 | 24 |  |
| `school_7` | Government High School, Musheerabad | musheerabad | 4761 | 1520 | 22 |  |
| `school_8` | Holy Family Convent School | marredpally | 5955 | 545 | 24 |  |
| `school_9` | Railway High School, Lalaguda | marredpally | 5905 | 1075 | 20 |  |
| `school_10` | Malakpet High School | saidabad | 5145 | 4310 | 22 |  |
| `school_11` | Dilsukhnagar Public School | dilsukhnagar | 6060 | 4274 | 24 |  |
| `school_12` | Saidabad Government School | chandrayangutta | 5245 | 4804 | 22 |  |
| `school_13` | Government Urdu High School, Shah Ali Banda | falaknuma | 4010 | 4929 | 20 |  |

#### shop (2)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `chermas_abids` | Cherma's | abids | 4085 | 3025 | 18 |  |
| `shoppers_stop_begumpet` | Trendz Department Store, Begumpet | begumpet | 3512 | 710 | 20 |  |

#### stationery (8)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `stationery_1` | Vidya Stationery & Book Depot | himayatnagar | 4207 | 2636 | 18 |  |
| `stationery_2` | Navyuga Stationers | rtc_x | 5019 | 2574 | 18 |  |
| `stationery_3` | Student Book House | kachiguda | 5200 | 2876 | 18 |  |
| `stationery_4` | Koti textbook stall | abids | 4199 | 3117 | 18 |  |
| `stationery_5` | Bharat Book & Stationery | masab_tank | 3150 | 2889 | 18 |  |
| `stationery_6` | Gita Stationery | ameerpet | 2452 | 1214 | 18 |  |
| `stationery_7` | Saraswati Book Depot | dilsukhnagar | 6094 | 4136 | 18 |  |
| `stationery_8` | Sri Sai Stationery | malakpet | 5209 | 4186 | 18 |  |

#### std_booth (16)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `std_1` | STD/ISD/PCO | himayatnagar | 4580 | 2485 | 18 |  |
| `std_2` | STD/ISD/PCO | himayatnagar | 4440 | 2568 | 18 |  |
| `std_3` | STD/ISD/PCO | koti | 4427 | 3227 | 18 |  |
| `std_4` | STD/ISD/PCO | abids | 4047 | 2870 | 18 |  |
| `std_5` | STD/ISD/PCO | masab_tank | 3224 | 2353 | 18 |  |
| `std_6` | STD/ISD/PCO | musheerabad | 4942 | 2058 | 18 |  |
| `std_7` | STD/ISD/PCO | himayatnagar | 4632 | 2173 | 18 |  |
| `std_8` | STD/ISD/PCO | tolichowki | 2042 | 2710 | 18 |  |
| `std_9` | STD/ISD/PCO | ameerpet | 2648 | 1186 | 18 |  |
| `std_10` | STD/ISD/PCO | secunderabad | 5454 | 1083 | 18 |  |
| `std_11` | STD/ISD/PCO | dilsukhnagar | 6432 | 3970 | 18 |  |
| `std_12` | STD/ISD/PCO | charminar | 3938 | 4686 | 18 |  |
| `std_13` | STD/ISD/PCO | bahadurpura | 3333 | 4607 | 18 |  |
| `std_14` | STD/ISD/PCO | khairatabad | 2881 | 1640 | 18 |  |
| `std_15` | STD/ISD/PCO | hitec | 1101 | 1183 | 18 |  |
| `std_16` | STD/ISD/PCO | hitec | 656 | 712 | 18 |  |

#### temple (24)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `akkanna_madanna_temple` | Akkanna Madanna Mahankali Temple | charminar | 3996 | 4746 | 18 | festival bonalu |
| `ashtalakshmi_temple` | Ashtalakshmi Temple, Kothapet | dilsukhnagar | 6743 | 4180 | 22 |  |
| `balkampet_yellamma_temple` | Balkampet Yellamma Temple | ameerpet | 2915 | 948 | 22 | festival bonalu |
| `birla_mandir` | Birla Mandir | basheerbagh | 3722 | 2264 | 30 |  |
| `dilsukhnagar_sai_temple` | Sai Baba Temple, Dilsukhnagar | dilsukhnagar | 6300 | 3956 | 30 |  |
| `golconda_jagadamba_temple` | Jagadamba Temple, Golconda | rajendranagar | 1150 | 3466 | 16 | festival bonalu |
| `gurudwara_gowliguda` | Central Gurudwara Sahib, Gowliguda | abids | 4060 | 3349 | 18 |  |
| `iskcon_abids` | ISKCON Temple, Abids | nampally | 3755 | 2920 | 18 |  |
| `karmanghat_hanuman_temple` | Karmanghat Hanuman Temple | saroornagar | 6900 | 4458 | 20 |  |
| `katta_maisamma_temple` | Katta Maisamma Temple | hussain_sagar | 4280 | 1851 | 18 | festival bonalu |
| `khairatabad_ganesh` | Khairatabad Ganesh | khairatabad | 3132 | 2090 | 30 | festival ganesh_immersion |
| `lal_darwaza_temple` | Lal Darwaza Mahankali Temple | charminar | 4060 | 4671 | 26 |  |
| `peddamma_temple` | Peddamma Temple | hitec | 1210 | 1236 | 22 |  |
| `secunderabad_ganesh_temple` | Sri Ganesh Temple (Secunderabad station) | secunderabad | 5023 | 1013 | 18 |  |
| `shankar_mutt_nallakunta` | Sringeri Shankar Mutt, Nallakunta | amberpet | 5520 | 2928 | 20 | alias of `temple_3` |
| `temple_1` | Sri Venkateswara Temple | himayatnagar | 4523 | 2520 | 18 |  |
| `temple_2` | Hanuman Temple | himayatnagar | 4590 | 2356 | 18 |  |
| `temple_3` | Shankar Mutt | amberpet | 5520 | 2928 | 20 |  |
| `temple_4` | Pochamma Temple | erragadda | 2430 | 580 | 18 |  |
| `temple_5` | Sri Rama Temple, Tarnaka | osmania | 6564 | 1430 | 18 |  |
| `temple_6` | Ayyappa Temple | masab_tank | 2703 | 2980 | 18 |  |
| `temple_7` | ISKCON Temple, Abids | nampally | 3755 | 2920 | 18 | alias of `iskcon_abids` |
| `temple_8` | Ashtalakshmi Temple, Kothapet | dilsukhnagar | 6743 | 4180 | 22 | alias of `ashtalakshmi_temple` |
| `ujjaini_mahankali_temple` | Ujjaini Mahankali Temple | secunderabad | 4914 | 1172 | 26 | festival bonalu |

#### terrace (1)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `home_terrace` | Home terrace (kites, sleeping under the stars) | himayatnagar | 4614 | 2648 | 12 |  |

#### transport (10)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `begumpet_airport` | Begumpet Airport | begumpet | 3480 | 520 | 30 |  |
| `cbs_hangar` | Gowliguda Hangar (City Bus Station) | koti | 4250 | 3346 | 26 |  |
| `gowliguda_hangar` | Gowliguda "Mississippi" hangar | koti | 4250 | 3346 | 26 | alias of `cbs_hangar` |
| `imlibun_bus_station` | Imlibun Bus Station (MGBS) | chaderghat | 4300 | 3515 | 40 |  |
| `kachiguda_station` | Kachiguda Station | kachiguda | 4941 | 3136 | 30 |  |
| `koti_bus_stand` | Koti Bus Stand | koti | 4430 | 3268 | 36 |  |
| `mehdipatnam_bus_terminus` | Mehdipatnam Bus Depot | tolichowki | 2235 | 2766 | 24 |  |
| `nampally_station` | Nampally Station (Hyderabad Deccan) | nampally | 3580 | 2938 | 30 |  |
| `rathifile_bus_station` | Rathifile City Bus Station | secunderabad | 5343 | 1058 | 28 |  |
| `secunderabad_station` | Secunderabad Station | secunderabad | 5200 | 1066 | 30 |  |

#### video_parlour (4)

| id | name | district | x | y | r | notes |
|---|---|---|---|---|---|---|
| `video_parlour_1` | Super Video Games | kachiguda | 5023 | 2904 | 18 |  |
| `video_parlour_2` | Champion Video Games | koti | 4316 | 3044 | 18 |  |
| `video_parlour_3` | Rocky Video Games | dilsukhnagar | 6197 | 4164 | 18 |  |
| `video_parlour_4` | Game Zone Video Parlour | ameerpet | 2384 | 1014 | 18 |  |

### Roads (175)

| id | name | kind | width | length (u) |
|---|---|---|---|---|
| `charminar_circle` | Charminar Circle | street | 34 | 866 |
| `pathergatti_rd` | Pathergatti Road | street | 36 | 84 |
| `gulzar_houz_loop` | Gulzar Houz | lane | 24 | 288 |
| `pathergatti_n` | Pathergatti Road | street | 36 | 206 |
| `naya_pul` | Naya Pul | bridge | 40 | 157 |
| `musi_south_rd` | Musi South Bank Road | street | 40 | 1423 |
| `laad_bazaar` | Laad Bazaar | lane | 22 | 283 |
| `gulzar_houz_w` | Gulzar Houz West Lane | lane | 22 | 448 |
| `gulzar_houz_e` | Gulzar Houz East Lane | lane | 22 | 309 |
| `sardar_mahal_rd` | Sardar Mahal Road | street | 34 | 240 |
| `shah_ali_banda_rd` | Shah Ali Banda Road | street | 36 | 832 |
| `hussaini_alam_rd` | Hussaini Alam Road | street | 34 | 546 |
| `khilwat_rd` | Khilwat Road | street | 32 | 230 |
| `darulshifa_rd` | Darulshifa Road | street | 34 | 366 |
| `dabeerpura_rd` | Dabeerpura Road | street | 36 | 965 |
| `yakutpura_rd` | Yakutpura Road | street | 34 | 1139 |
| `lal_darwaza_rd` | Lal Darwaza Road | lane | 24 | 650 |
| `bahadurpura_rd` | Bahadurpura Road | arterial | 52 | 2295 |
| `falaknuma_rd` | Falaknuma Road | street | 36 | 83 |
| `chandrayangutta_rd` | Chandrayangutta Road | arterial | 52 | 3653 |
| `saidabad_rd` | Saidabad Road | street | 36 | 1325 |
| `puranapul` | Purana Pul | bridge | 30 | 205 |
| `musallam_jung_bridge` | Musallam Jung Bridge | bridge | 34 | 260 |
| `afzalgunj_bridge_rd` | Salar Jung Museum Road | street | 36 | 143 |
| `afzalgunj_bridge` | Afzalgunj Bridge (Salar Jung Pul) | bridge | 36 | 182 |
| `chaderghat_bridge` | Chaderghat Bridge | bridge | 48 | 207 |
| `moosarambagh_bridge` | Moosarambagh Bridge | bridge | 40 | 258 |
| `nagole_bridge` | Nagole Bridge | bridge | 40 | 184 |
| `afzalgunj_rd` | Afzalgunj Road | street | 44 | 1361 |
| `siddiamber_rd` | Siddiamber Bazaar Road | arterial | 52 | 401 |
| `abids_rd` | Abids Road | arterial | 52 | 350 |
| `gunfoundry_rd` | Gunfoundry Road | arterial | 52 | 550 |
| `basheerbagh_rd` | Basheerbagh Road | arterial | 52 | 150 |
| `liberty_rd` | Liberty Road | arterial | 52 | 238 |
| `nampally_rd` | Nampally Station Road | street | 40 | 492 |
| `mj_market_rd` | Mozamjahi Market Road | street | 40 | 293 |
| `jambagh_rd` | Jambagh Road | street | 36 | 172 |
| `begum_bazaar_rd` | Begum Bazaar Road | street | 36 | 560 |
| `mangalhat_rd` | Mangalhat Road | street | 34 | 885 |
| `bank_st` | Bank Street | street | 40 | 470 |
| `king_koti_rd` | King Koti Road | street | 40 | 507 |
| `hanuman_tekdi_rd` | Hanuman Tekdi Road | street | 34 | 388 |
| `gowliguda_rd` | Gowliguda Road | street | 36 | 165 |
| `chaderghat_rd` | Koti–Chaderghat Road | arterial | 52 | 316 |
| `sultan_bazaar_ln` | Sultan Bazaar | lane | 22 | 282 |
| `koti_kachiguda_rd` | Koti–Kachiguda Road | street | 40 | 619 |
| `putlibowli_rd` | Putlibowli Road | lane | 24 | 516 |
| `assembly_rd` | Public Gardens Road | street | 40 | 310 |
| `nampally_assembly_rd` | Nampally–Assembly Road | street | 36 | 535 |
| `saifabad_rd` | Saifabad Road | arterial | 52 | 788 |
| `secretariat_rd` | Secretariat Road | arterial | 56 | 796 |
| `khairatabad_rd` | Khairatabad Road | arterial | 56 | 407 |
| `naubat_pahad_rd` | Naubat Pahad Road | lane | 22 | 117 |
| `birla_mandir_steps` | Birla Mandir steps | path | 14 | 163 |
| `tank_bund` | Tank Bund Road | bund | 60 | 1098 |
| `necklace_rd` | Necklace Road | arterial | 48 | 2081 |
| `lower_tank_bund` | Lower Tank Bund Road | arterial | 48 | 1359 |
| `kavadiguda_rd` | Kavadiguda Road | street | 40 | 180 |
| `indira_park_rd` | Indira Park Road | street | 44 | 713 |
| `lumbini_rd` | Lumbini Park Lane | lane | 22 | 27 |
| `himayatnagar_rd` | Himayatnagar Main Road | arterial | 52 | 604 |
| `himayat_chikkadpally_rd` | Himayatnagar–Chikkadpally Road | street | 40 | 430 |
| `chikkadpally_rd` | Chikkadpally Road | arterial | 52 | 773 |
| `narayanguda_rd` | Narayanguda Road | street | 40 | 1540 |
| `vidyanagar_rd` | Vidyanagar Road | arterial | 52 | 1001 |
| `nallakunta_rd` | Nallakunta Road | street | 34 | 621 |
| `amberpet_rd` | Amberpet Road | arterial | 52 | 3193 |
| `kachiguda_station_rd` | Kachiguda Station Road | street | 36 | 739 |
| `musheerabad_rd` | Musheerabad Road | arterial | 52 | 1129 |
| `moosarambagh_rd` | Moosarambagh Road | street | 40 | 564 |
| `mg_rd` | MG Road | arterial | 52 | 691 |
| `sp_rd` | Sardar Patel Road | arterial | 56 | 1203 |
| `sd_rd` | Sarojini Devi Road | arterial | 52 | 3580 |
| `rp_rd` | Rashtrapati Road | street | 40 | 1738 |
| `station_rd` | Clock Tower Road | street | 36 | 323 |
| `musheerabad_link` | Bholakpur Road | street | 36 | 50 |
| `marredpally_rd` | Marredpally Road | street | 36 | 814 |
| `trimulgherry_rd` | Trimulgherry Road | street | 36 | 770 |
| `begumpet_rd` | Begumpet Road | arterial | 52 | 924 |
| `begumpet_ameerpet_rd` | Ameerpet Road | street | 40 | 655 |
| `airport_rd` | Airport Road | street | 40 | 237 |
| `mumbai_hwy` | Mumbai Highway (NH 9) | arterial | 56 | 1861 |
| `raj_bhavan_rd` | Raj Bhavan Road | arterial | 56 | 691 |
| `banjara_rd1` | Road No. 1, Banjara Hills | arterial | 52 | 1439 |
| `banjara_rd2` | Road No. 2, Banjara Hills | street | 40 | 1092 |
| `banjara_rd12` | Road No. 12, Banjara Hills | street | 40 | 1267 |
| `jubilee_rd36` | Road No. 36, Jubilee Hills | arterial | 52 | 681 |
| `film_nagar_rd` | Film Nagar Road | street | 40 | 1069 |
| `mehdipatnam_rd` | Mehdipatnam Road | arterial | 56 | 1255 |
| `old_mumbai_rd` | Old Mumbai Road | arterial | 52 | 2657 |
| `golconda_rd` | Golconda Fort Road | street | 40 | 1085 |
| `tombs_rd` | Seven Tombs Road | street | 36 | 755 |
| `gandipet_rd` | Gandipet Road | street | 40 | 1800 |
| `raidurg_rd` | Raidurg Road | street | 40 | 1005 |
| `hitec_rd` | HITEC City Road | arterial | 56 | 1015 |
| `hitec_n_rd` | Kondapur Road | street | 40 | 684 |
| `malakpet_rd` | Malakpet Road | arterial | 56 | 3870 |
| `ou_rd` | Osmania University Road | street | 40 | 1371 |
| `uppal_rd` | Uppal Road | arterial | 52 | 1853 |
| `tarnaka_e_rd` | Habsiguda Road | street | 40 | 1655 |
| `nagole_rd` | Nagole Road | street | 40 | 593 |
| `nagole_n_rd` | Nagole–Uppal Road | street | 40 | 622 |
| `lb_nagar_s_rd` | Sagar Road | street | 40 | 1772 |
| `kothapet_rd` | Kothapet Road | street | 36 | 806 |
| `chowmahalla_ln` | Khilwat Lane | lane | 20 | 84 |
| `public_gardens_path` | Public Gardens walk | path | 12 | 188 |
| `public_gardens_path2` | Public Gardens walk | path | 12 | 110 |
| `indira_park_path` | Indira Park walk | path | 12 | 439 |
| `general_bazaar_ln` | General Bazaar | lane | 22 | 192 |
| `golconda_steps` | Steps to Bala Hissar | path | 12 | 256 |
| `asif_nagar_rd` | Asif Nagar Road | street | 36 | 1330 |
| `mallepally_rd` | Mallepally Road | street | 36 | 542 |
| `karwan_rd` | Karwan Road | street | 36 | 1063 |
| `sanathnagar_rd` | Sanathnagar Road | street | 36 | 1571 |
| `ln_lakshmi_v1` | Lakshmi Nagar Street 1 | lane | 22 | 288 |
| `ln_lakshmi_v2` | Lakshmi Nagar Street 2 | lane | 22 | 300 |
| `ln_lakshmi_h1` | Lakshmi Nagar Main Street | lane | 22 | 395 |
| `ln_hyderguda_h1` | Hyderguda Main Street | lane | 22 | 393 |
| `ln_hyderguda_v1` | Hyderguda Street 2 | lane | 22 | 421 |
| `ln_domalguda_v1` | Domalguda Street 1 | lane | 22 | 359 |
| `ln_domalguda_v2` | Domalguda Street 2 | lane | 22 | 294 |
| `ln_domalguda_h1` | Ashok Nagar Main Street | lane | 22 | 651 |
| `ln_vidyanagar_v1` | Vidyanagar Street 1 | lane | 22 | 460 |
| `ln_vidyanagar_v2` | Vidyanagar Street 2 | lane | 22 | 401 |
| `ln_vidyanagar_h1` | Vidyanagar Main Street | lane | 22 | 495 |
| `ln_barkatpura_h1` | Barkatpura Main Street | lane | 22 | 492 |
| `ln_barkatpura_v1` | Barkatpura Street 2 | lane | 22 | 266 |
| `ln_nallakunta_v1` | Nallakunta Street | lane | 22 | 279 |
| `ln_nallakunta_h1` | Nallakunta Main Street | lane | 22 | 424 |
| `ln_vijayanagar_v1` | Vijayanagar Colony Road | lane | 22 | 439 |
| `ln_vijayanagar_v2` | Mallepally Street | lane | 22 | 269 |
| `ln_vijayanagar_h1` | Vijayanagar Main Street | lane | 22 | 355 |
| `ln_humayun_v1` | Humayun Nagar Road | lane | 22 | 480 |
| `ln_mehdipatnam_h1` | Mehdipatnam Main Street | lane | 22 | 759 |
| `ln_tolichowki_v1` | Tolichowki Street 1 | lane | 22 | 441 |
| `ln_tolichowki_v2` | Tolichowki Street 2 | lane | 22 | 735 |
| `ln_tolichowki_h1` | Tolichowki Main Street | lane | 22 | 590 |
| `ln_srnagar_h1` | SR Nagar Main Road | lane | 22 | 525 |
| `ln_srnagar_h2` | SR Nagar Street | lane | 22 | 560 |
| `ln_srnagar_v1` | SR Nagar Cross Road | lane | 22 | 467 |
| `ln_srnagar_v2` | Yousufguda Road | lane | 22 | 562 |
| `ln_ameerpet_v1` | Kumar Basti Road | lane | 22 | 457 |
| `ln_ameerpet_h1` | Ameerpet Street | lane | 22 | 342 |
| `ln_erragadda_h1` | Erragadda Street | lane | 22 | 370 |
| `ln_erragadda_v1` | Erragadda Cross Road | lane | 22 | 402 |
| `ln_musheerabad_v1` | Bholakpur Road | lane | 22 | 1126 |
| `ln_musheerabad_h1` | Gandhinagar Road | lane | 22 | 402 |
| `ln_musheerabad_h2` | Musheerabad Street | lane | 22 | 130 |
| `ln_marredpally_v1` | Marredpally Street 1 | lane | 22 | 450 |
| `ln_marredpally_h0` | East Marredpally Road | lane | 22 | 332 |
| `ln_marredpally_h1` | West Marredpally Road | lane | 22 | 750 |
| `ln_marredpally_v2` | Marredpally Street 2 | lane | 22 | 204 |
| `ln_lalaguda_h1` | Lalaguda Road | lane | 22 | 600 |
| `ln_lalaguda_v1` | Lalaguda Street 1 | lane | 22 | 103 |
| `ln_lalaguda_v2` | Lalaguda Street 2 | lane | 22 | 169 |
| `ln_lalaguda_v3` | Tarnaka Street | lane | 22 | 224 |
| `malakpet_race_rd` | Race Course Road | street | 36 | 623 |
| `ln_malakpet_v1` | Malakpet Street | lane | 22 | 697 |
| `ln_malakpet_h1` | Malakpet Colony Road | lane | 22 | 470 |
| `ln_dilsukh_v1` | Dilsukhnagar Street 1 | lane | 22 | 470 |
| `ln_dilsukh_v2` | Dilsukhnagar Street 2 | lane | 22 | 450 |
| `ln_dilsukh_h1` | Dilsukhnagar Colony Road | lane | 22 | 1287 |
| `ln_dilsukh_h2` | Chaitanyapuri Road | lane | 22 | 733 |
| `ln_saidabad_v1` | Saidabad Street | lane | 22 | 641 |
| `ln_saidabad_h1` | Saidabad Colony Road | lane | 22 | 270 |
| `ln_ghansi_bazaar` | Ghansi Bazaar | lane | 22 | 309 |
| `ln_kotla_alijah` | Kotla Alijah Lane | lane | 22 | 239 |
| `ln_mitti_ka_sher` | Mitti ka Sher Lane | lane | 22 | 320 |
| `ln_shah_ali_banda_e` | Shah Ali Banda East Lane | lane | 22 | 404 |
| `ln_shah_ali_banda_w` | Shah Ali Banda West Lane | lane | 22 | 762 |
| `bolarum_rd` | Bolarum Road | street | 36 | 875 |
| `club_rd` | Secunderabad Club Road | lane | 24 | 316 |
| `hps_ln` | HPS Road | lane | 24 | 219 |
| `bapu_ghat_rd` | Bapu Ghat Road | lane | 22 | 292 |
| `uoh_rd` | University Road | lane | 24 | 191 |

### Railways (6)

| id | name | length (u) |
|---|---|---|
| `rail_hyd_sec` | Hyderabad–Secunderabad line | 3930 |
| `rail_sec_yard` | Secunderabad station loop | 361 |
| `rail_wadi` | Secunderabad–Wadi line | 3826 |
| `rail_bolarum` | Bolarum line | 1048 |
| `rail_kazipet` | Kazipet line | 2751 |
| `rail_kachiguda` | Secunderabad–Kachiguda line | 6120 |

### Water (8) and parks (128)

| id | name | type |
|---|---|---|
| `hussain_sagar` | Hussain Sagar | water |
| `musi` | Musi River | water, sand bank 42 |
| `mir_alam_tank` | Mir Alam Tank | water, sand bank 8 |
| `durgam_cheruvu` | Durgam Cheruvu (the secret lake) | water, sand bank 4 |
| `saroornagar_lake` | Saroornagar Lake | water, sand bank 6 |
| `safilguda_lake` | Safilguda Lake | water, sand bank 4 |
| `banjara_lake` | Banjara Lake | water, sand bank 4 |
| `mecca_masjid_houz` | Mecca Masjid pond | water |
| `charminar_plaza` | Charminar Plaza | park: plaza |
| `gulzar_houz_sq` | Gulzar Houz Square | park: plaza |
| `mecca_masjid_courtyard` | Mecca Masjid Courtyard | park: plaza |
| `mecca_masjid_pigeons` | Mecca Masjid pigeon square | park: plaza |
| `imlibun_bays` | Imlibun bus bays | park: plaza |
| `koti_bus_bays` | Koti bus bays | park: plaza |
| `koti_womens_college_grounds` | Koti Women's College lawns | park: garden |
| `nampally_platforms` | Nampally station platforms | park: plaza |
| `exhibition_grounds` | Exhibition Grounds (Numaish) | park: ground |
| `public_gardens` | Public Gardens (Bagh-e-Aam) | park: garden |
| `gun_park` | Gun Park | park: garden |
| `lb_stadium_field` | LB Stadium field | park: grass |
| `naubat_pahad` | Naubat Pahad | park: rock |
| `khairatabad_ganesh_ground` | Khairatabad Ganesh ground | park: ground |
| `raj_bhavan_grounds` | Raj Bhavan grounds | park: garden |
| `lumbini_park` | Lumbini Park | park: garden |
| `ntr_gardens` | NTR Gardens | park: garden |
| `sanjeevaiah_park` | Sanjeevaiah Park | park: grass |
| `indira_park` | Indira Park | park: garden |
| `parade_grounds` | Parade Grounds | park: ground |
| `clock_tower_park` | Clock Tower park | park: garden |
| `secunderabad_platforms` | Secunderabad platforms | park: plaza |
| `begumpet_runway` | Begumpet runway | park: plaza |
| `begumpet_apron` | Begumpet apron | park: plaza |
| `kachiguda_platforms` | Kachiguda platforms | park: plaza |
| `osmania_campus` | Osmania University campus | park: grass |
| `golconda_hill` | Golconda hill | park: rock |
| `golconda_inner` | Golconda inner court | park: ground |
| `qutb_shahi_gardens` | Qutb Shahi Tombs gardens | park: garden |
| `nehru_zoo` | Nehru Zoological Park | park: garden |
| `falaknuma_hill` | Falaknuma hill | park: rock |
| `cyber_towers_plaza` | Cyber Towers forecourt | park: plaza |
| `shilparamam` | Shilparamam crafts village | park: garden |
| `kbr_park` | KBR Park | park: rock |
| `moula_ali_hill` | Moula Ali hill | park: rock |
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
| `malakpet_race_course` | Malakpet race course | park: ground |
| `school_10_ground` | Malakpet school ground | park: ground |
| `school_11_ground` | Dilsukhnagar school ground | park: ground |
| `playground_7` | Chaitanyapuri ground | park: ground |
| `school_12_ground` | Saidabad school ground | park: ground |
| `playground_8` | Saidabad maidan | park: ground |
| `school_13_ground` | Shah Ali Banda school ground | park: ground |
| `playground_13` | Shah Ali Banda maidan | park: ground |
| `gymkhana_ground_secunderabad` | Gymkhana Ground | park: grass |
| `secunderabad_club_lawns` | Secunderabad Club lawns | park: garden |
| `rathifile_bays` | Rathifile bus bays | park: plaza |
| `hps_campus` | Hyderabad Public School grounds | park: ground |
| `victory_playground` | Victory Playground | park: ground |
| `mehdipatnam_depot_bays` | Mehdipatnam bus bays | park: plaza |
| `harina_vanasthali` | Mahavir Harina Vanasthali | park: rock |
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
