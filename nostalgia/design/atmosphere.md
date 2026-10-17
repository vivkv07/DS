# Atmosphere: wind, rainy nights, birds (user request, binding)

User: "Work on coconut trees and other trees in Blender too! Animate wind. I also want rainy
nights, birds flying."

## Wind (2D and 3D)
- A global wind state `N.wind = {dir, speed, gust(x, y, t)}`: gentle breeze by day, stronger
  gusts before rain and in monsoon storms, calm on winter nights; deterministic per game day.
- 3D: a shared vertex-shader sway for every tree (using the Blender wind weights), grass
  tufts, festival flags, saffron temple flags, shop banners, hanging clothes on clotheslines,
  kites' tails; per-instance phase so trees don't move in lockstep; gusts travel across
  the city as visible waves.
- 2D top-down: tree canopies, palm fronds, flags and clotheslines sway and shimmer too.

## Rainy nights (and rain in general)
- Weather schedule: monsoon (June-September) brings evening and night showers on most days
  and occasional storms; light winter mist; dry summer. Deterministic per date, overridable
  by story flags and by a weather setting.
- 3D look: rain streaks in a camera-centred volume, splashes on roads and footpaths, ripples
  in puddles and on Hussain Sagar, wet asphalt (darker, glossy, reflecting sodium street
  lights, shop signs, headlights and tail lights as long streaky reflections), puddles in
  potholes, dripping eaves, mist halos round lamps, lightning flashes that light the city for
  a frame with thunder a moment later, low clouds and darker sky.
- 2D look: diagonal rain streaks, splash rings, darker wet ground with light reflections,
  lightning flashes.
- Life in the rain: pedestrians with black umbrellas or running for cover under shop awnings
  and bus shelters, autos with side covers down, cyclists in plastic raincoats, traffic slows,
  kids floating paper boats in puddles (a small side activity), steaming chai at the Irani
  cafe feels extra good (bonus energy).
- Sound: rain on tin roofs and asbestos sheets, rain on leaves, gutters, distant and near
  thunder, tyres hissing on wet roads, the smell-of-rain moment captured as a toast
  ("matti ki khushboo").
- Gameplay: slippery roads for cycles and the Scooty (longer braking), potholes hidden under
  water, the Chappal Meter pursuers give up sooner in heavy rain.

## Birds
- Flocks with boids: pigeons at Charminar, Mozamjahi Market and station roofs (burst up
  when you run through), crows on electric wires and rooftops (caw), black kites (cheel)
  soaring in slow circles high over the city on thermals by day, parakeet flocks streaking
  between neem trees, egrets and cormorants over Hussain Sagar and the Musi, mynas on
  lawns, bats at dusk near Golconda and old trees; birds roost at night and shelter in rain.
- 2D: small animated sprites with soft ground shadows; 3D: the Blender bird models.
- Sound: cawing, cooing, parakeet screeches, kite whistles, wing flaps on take-off.
- Performance: pooled and instanced, only near the camera, LOD by distance.

## Electric poles and overhead wires (user request, binding)
- Streets get electric poles with wires strung between them, the way every Hyderabad street
  looked: concrete (PSC) and old steel-rail poles on the footpath edge at regular spacing,
  crossarms with white porcelain insulators, sagging catenary wires between poles (more
  sag on long spans), pole-mounted transformers at some junctions, street-light arms on
  some poles, service wires fanning off to houses, and the early-2000s tangle of black cable
  TV and phone wires looping between buildings and poles (denser in the Old City and
  colonies, tidier on arterials, almost none on new HITEC roads).
- Derived procedurally from the road data (`N.world` roads/footpaths) with a deterministic
  seed, so they line up with the map in both views; wires never cross through buildings and
  stay above vehicle height (buses and lorries pass under).
- 2D top-down: poles drawn with height (they lean outward like the buildings), wires as
  thin dark lines at height with faint ground shadows.
- 3D: Blender pole models (instanced) and wires as thin sagging ribbons/lines that sway
  slightly in the wind (`N.wind`), with insulators catching the light; at night a few
  sodium lamps on poles.
- Life on the wires: crows and pigeons perch on them (and take off when disturbed); after
  Sankranti, torn kites and manja hang tangled on the wires and poles for weeks; the odd
  pair of old chappals thrown over a wire.

## Street-food scenes (user request, binding)
"How can we make dosa bandis real scenes, like people gathering around carts and steam coming
out?" Every food cart and food spot becomes a living scene in both views:
- **Dosa bandi:** the vendor ladles batter, spreads it in circles on the big tawa, drizzles oil,
  flips and folds; steam and smoke rise from the tawa (thicker when batter hits the pan); the
  stove glows at night under a bulb or petromax lamp; steel buckets of chutney and sambar;
  4-10 customers gather in a loose half-ring, some waiting, some eating from steel plates or
  leaf plates standing up, a couple of scooters and cycles parked beside; busiest at morning
  tiffin (06:30-10:00) and late night (21:00-01:00).
- **Samosa / mirchi bajji bandi:** a kadai of bubbling oil with rising steam, fresh batches
  tipped into a tray, evening rush (16:00-20:00), paper-cone servings.
- **Chai bandi:** kettle steam, the long tea-pour from height, small glasses, men standing and
  chatting at all hours with morning and evening peaks.
- **Pani puri cart:** a tight crowd around the vendor handing out puris one by one, evenings.
- **Bhutta cart:** charcoal glow, smoke and sparks fanned by a hand fan, on Necklace Road and
  Tank Bund in the evening breeze.
- **Coconut, ice-gola, banana and flower carts:** smaller groups; the coconut seller's machete
  chop.
- **Gokul Chat, Irani café fronts, Paradise queue, Ramzan haleem bhattis:** bigger crowds
  with their own rhythms.
- Steam and smoke drift with `N.wind`, fade in rain (people crowd under the cart's tarpaulin
  or an awning with umbrellas). Sizzle, clink and chatter sounds; Hyderabadi barks
  ("Ek plain dosa, anna!", "Thoda karam kam", "Do chai").
- Crowd members are real pedestrians (so the 3D view renders them too); the player can walk
  into the crowd and buy (shops.js handles purchases). Only active near the player; pooled.
