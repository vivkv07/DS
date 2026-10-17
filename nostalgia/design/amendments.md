# Amendments (binding; override the story bible and systems design where they conflict)

## A1. Real Hyderabad geography (Map v2)

- The map must match the real city as closely as a playable game allows. Every place gets
  its **real latitude/longitude**, and roads follow their **real alignments** (Tank Bund,
  Necklace Road, Lower Tank Bund, MG Road/Abids, Koti–Chaderghat–Malakpet–Dilsukhnagar,
  Himayatnagar main road, RTC X Roads–Musheerabad, SD Road/SP Road/Begumpet, Masab Tank–
  Mehdipatnam–Tolichowki–Golconda, Banjara/Jubilee Hills roads, Old City lanes around
  Charminar, the Musi bridges, the railway lines...).
- Projection: lat/long → world units with a uniform base scale plus a smooth, monotonic
  local warp that expands dense cores (Old City around Charminar, Abids/Koti/Nampally,
  Secunderabad) so landmarks and lanes fit, and compresses empty outskirts. Topology and
  compass directions are always preserved. The world grows to **12000 x 9000 u**
  (approx. lon 78.335-78.561 E, lat 17.312-17.475 N) if the engine budget allows.
- Reference data: GHMC ward boundaries from DataMeet Municipal Spatial Data
  (https://github.com/datameet/Municipal_Spatial_Data, CC BY 4.0; derived from
  OpenStreetMap, ODbL), cloned at `/home/user/datameet/municipal_spatial_data`. Districts
  become polygons from real wards. Credits must include: "Map reference: DataMeet Municipal
  Spatial Data (CC BY 4.0) and © OpenStreetMap contributors (ODbL)".
- Every canonical place id is kept (the story, collectibles and seasons use ids).

## A2. Potholes

Roads have potholes, worst in colony lanes and the Old City, fewer on arterials and the
Tank Bund, deterministic per road segment. Drawn in top-down (dark ragged patches, gravel,
water-filled after rain) and as real dips in 3D. Riding into one: a jolt ("dhadak!"), speed
loss, camera shake, a bump sound, a small chance of a cycle puncture or a comic fall
(never hurt). API: `N.world.potholeAt(x, y) → {depth, r} | null`.

## A3. Age-appropriate vehicles

Chinnu is 11. He can drive: **Hero cycle** (black roadster with carrier and bell),
**Hercules cycle** (the sporty one), other cycles (BSA SLR, ladies cycle), the **Scooty**
(small scooter, with a comic "feet barely reach" posture) and the **auto-rickshaw** (peeks
over the handlebar, slower top speed, autowalas yell). He does **not** drive cars, buses,
lorries, the Chetak, the RX100 or the Luna: he rides those as a passenger or pillion
(Nanna's Chetak, Bunty-anna's RX100, buses with a ticket, autos as a passenger). Where
the bible/systems mention "permission to ride the family Chetak", it becomes
**permission to ride Akka's Scooty** (or a borrowed Scooty); Nanna's Chetak stays pillion.
Brand names are mentioned in text only, never as logos.

## A4. Best sound

Audio quality is a top priority: realistic procedural engines (2-stroke auto and Scooty,
Chetak putt-putt, RX100 rasp, bus diesel), the right horns, the cycle bell, Doppler on
passing vehicles, positional (HRTF) audio in 3D, reverb zones (Old City lanes, Golconda's
dome and the clap echo, the stadium, the station hall), rich city ambience (crows, koels,
pigeons, hawkers' calls as formant-synth vowels, pressure cookers, temple bells except Birla
Mandir, church bells in Secunderabad), and well-composed original music. No samples of
copyrighted audio; synthesis only (or CC0 sources if ever available).

## A5. Best rendering

Visual quality is a top priority in both top-down and 3D: an art-direction pass across the
whole city at all times of day, landmarks, people, vehicles, effects (dust, exhaust, rain,
festival lights), lighting and readability on phones.
