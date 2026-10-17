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
