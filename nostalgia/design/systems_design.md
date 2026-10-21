# NOSTALGIA: Systems Design (numbers and rules)

*Gurthunda?* This is the developer spec for the game's systems: controls, the player's body and
purse, vehicles, the Chappal Meter, shops, missions, collectibles, minigames, jobs, time, street
life, sound and screens. It turns `story_bible.md` into numbers.

**Reads with:** `ARCHITECTURE.md` (the technical contract), `story_bible.md` (story, characters,
place registry, collectibles, side activities, lines), `places_registry.md` (binding user rules),
`map_plan.md` (map ids and positions).

**Binding user rules honoured here**
1. **The game ends at Charminar.** M12 *Chand Raat*, the ending and the 2026 epilogue all happen on
   the Charminar plaza. No system may move them. After the credits the post-game free roam
   (bible §9.5) starts, and the Journal track list replays any mission.
2. **Every must-have place is used by a system** with its canonical id. §16 is the matrix.
3. **Prasads IMAX and NTR Gardens** are post-1999 places, handled honestly: the story is set in
   2003. NTR Gardens is open all year. Prasads is a tin fence saying "COMING SOON" until it opens
   on **Fri 25 Jul 2003** (M9). From then on it works as a cinema.
4. **Respect zones.** Temples, mosques, dargahs, churches, the gurudwara and the ashurkhana are
   walk-only. Chases never enter them and no mischief happens inside (§4.8).
5. **Kid-friendly.** There are no weapons, no gore and no killing. The worst that happens is
   bumping, slipping or getting scolded. Nobody is ever injured. Chinnu only "borrows" vehicles,
   always gets scolded for it, and it is never shown as cool. Paan, cigarettes and gutka never
   appear anywhere: there is no paan shop, no tobacco prop and no smoking ped.

**Precedence.** Story beats, dates, mission rewards and dialogue come from the story bible. This
file owns systemic tuning. Where the two disagree, §15 lists the reconciliation each module must
make.

---

## 0. Conventions and quick reference

### 0.1 Units

| Quantity | Unit | Notes |
|---|---|---|
| Distance | world unit **u** | 1 internal pixel at zoom 1. A person is 8 u, a cycle 15 x 5 u, a bus 62 x 18 u |
| Map distance | **map-km ≈ 430 u** | Core-city squeeze from `map_plan.md` §1. Used for fares and race lengths |
| Speed | u/s | Walk 45, run 80, cycle 115 (ARCHITECTURE §4) |
| Game time | **gm** = game minute, **gh** = game hour | Clock speed 1, so 1 gm = 1 real second and 1 gh = 60 real s. A whole day takes 24 real minutes |
| Real time | **s** | Used for timers, cooldowns and animation |
| Money | **paise** (integer) | ₹1 = 100. The HUD shows `N.util.fmtMoney`. Prices below read "₹4 (400)" |
| Energy, tummy | 0..100 | See §2.2 |
| Heat | 0..599 | Chappal Meter points. Level = floor(heat / 100), capped at 5 (§4.1) |

### 0.2 Where the numbers live

Each module keeps its numbers in one plain object called `TUNE`: `N.player.TUNE`,
`N.vehicles.TUNE`, `N.traffic.TUNE`, `N.wanted.TUNE`, `N.shops.PRICES`, `N.collectibles.TUNE`,
`N.minigames.TUNE`, `N.missions.TUNE`. The difficulty preset (§14) multiplies the fields that
§14.1 lists. Do not hard-code tuned numbers anywhere else, so that balancing stays a data edit.

### 0.3 Numbers at a glance

| Thing | Value |
|---|---|
| Starting money | **₹10 (1000)** (bible §1.6) |
| Starting energy / tummy | 100 / 80 |
| Walk / run | 45 / 80 u/s. Running drains 8.5 energy/s, so a full sprint lasts about 12 s |
| Tummy lasts | about 14 real minutes of mixed play. Chai + Osmania refills 40 |
| Chappal Meter | 5 levels. One level drops after **12 s unseen** |
| Caught (PAKDA GAYA!) | −₹2. Respawn at `home` gate or the mission checkpoint. +30 gm |
| Exhausted (THAK GAYA!) | −₹1 glucose water. Respawn at the nearest open Irani café. +45 gm |
| City bus | ₹3 a ride, hubs plus ticket-unlocked stops |
| Auto | ₹6 for the first map-km, then ₹4 per map-km. The driver asks "*das upar*" (₹10 over) |
| Cycle hire | ₹3 per game-hour, capped at ₹10 for the day if returned by 21:00 |
| Mission reward | ₹10 to ₹20 (bible), finale ₹51 *Eidi* |
| Save | Any `std_*` booth, the booth in `irani_cafe_7`, every MISSION PASSED, sleeping at home, "Save & quit" |
| Day length | 24 real minutes. Street lights come on at 18:30. Night runs about 19:45 to 05:00 |
| Collectibles | 93: 12 kites, 30 golis, 16 cassettes, 12 tickets, 23 frames (+ frame 24 in the story) |

---

## 1. Controls

### 1.1 Action map

| Action | Keyboard | Touch | Gamepad | On foot | Cycle / bike | Car, auto | Boat | Menus |
|---|---|---|---|---|---|---|---|---|
| Move | WASD / arrows | Floating joystick, left 52% | Left stick / d-pad | 8-way (keys), analog (stick) | Tank steer (keys), point-to-steer (stick) | Same | Same | Navigate |
| `action` | E, F, Enter | ACTION (context label) | A | Context (§1.4) | Get off / context | Get out / context | Get off at a shore | Select |
| `run` | Shift | RUN, relabelled BRAKE / H-BRAKE | X, RB or RT | Run (hold; can be set to toggle) | Handbrake | Handbrake | Back-paddle | — |
| `horn` | Space | HORN | B | "*Oye!*" / "AUTO!" call (§1.5) | Cycle bell "tring tring" | Horn | Boatman's whistle | Back (minigames) |
| `radio` | Q or R | Tap the cassette icon on the OSD strip | Y | Walkman: next source; hold 0.6 s = off | Walkman | Next station; hold = off | — | — |
| `map` | M | MAP pill | Back / View | Full map | Full map | Full map | Full map | Close |
| `journal` | J | Pause → Journal, or the map screen's tab | LB | Journal | Journal | Journal | Journal | Close |
| `pause` | Esc, P | PAUSE pill | Start | Pause | Pause | Pause | Pause | Back / close |

- Dialogue: ACTION finishes the line, then advances. Choices use ↑/↓ (or W/S) + ACTION, the keys
  1 to 4, or a tap.
- Shop and service menus: ↑/↓ select, ACTION buys, Esc / horn / B closes. **Holding ACTION for
  0.5 s at an Irani café orders the house combo** ("*Do chai, ek plate Osmania*", ₹8, energy and
  tummy +40) without opening the menu.
- Minigames use their own key maps (§8). In every minigame Esc pauses, and gamepad A is the main
  action.

### 1.2 Touch layout (CSS px, 400 px wide baseline)

| Control | Size and position | Notes |
|---|---|---|
| Joystick | Appears where the thumb lands in the left 52% below the top 64 px. Radius 56, dead zone 12% | Point-to-steer in vehicles |
| ACTION | 84 px circle, bottom-right, 20 px from the edges | Shows the context label (max 14 characters, e.g. "Ride Chetak", "Chai ₹4", "Hide") |
| RUN / BRAKE | 64 px, left of ACTION | Relabelled in vehicles |
| HORN | 64 px, above ACTION | On foot near a road it calls "AUTO!" (§1.5) |
| MAP, PAUSE | 56 x 44 pills, top-right | Keep the ~120 x 52 px area there free (ARCHITECTURE §9) |
| Cassette icon | 44 x 44 on the OSD strip, `.interactive` | The radio / walkman action |
| Button size setting | S 0.85x, M 1x, L 1.25x | Accessibility (§14) |
| Handedness | Right (default) or left: mirrors joystick and buttons | Accessibility |

### 1.3 Gamepad

The mapping is ARCHITECTURE §9's (A action, B horn, X/RB/RT run = handbrake in vehicles, Y radio,
LB journal, Back map, Start pause). Stick dead zone 0.22, radial; in vehicles the stick's
magnitude is the throttle (point-to-steer). Vibration (where available): bump 80 ms at 0.3, crash
200 ms at 0.7, chappal hit 250 ms at 0.5, minigame "perfect" 40 ms at 0.2. It can be turned off
in settings.

### 1.4 Context ACTION priorities

`N.interact` scores each offer as `priority * 1000 − distance`, so **the higher number wins** and
ties go to the nearest (entities.js). The labels below are the ACTION button text.

| Pri | Offer | When | Label | Owner |
|---|---|---|---|---|
| 9 | Dialogue advance / choose | dialogue open (it consumes ACTION itself) | — | dialogue.js |
| 8 | ● REC | end of a mission, 8 s window (then auto) | "● REC" | missions.js |
| 7 | Mission-critical step | a step that needs ACTION (take the tape from the boot, click frame 24, drag Nanna) | step label | story.js |
| 7 | Job action while doing a job | paper throw, deliver dabba | "Throw paper" | jobs (§9) |
| 6 | Give a Mango Masti to Chitti | Chitti chasing within 20 u and the player holds a `mango_bite` | "Mango Masti?" | wanted.js |
| 6 | Give jasmine to Mummy | level 5, Mummy within 24 u, player holds `jasmine` | "Jasmine for Mummy" | wanted.js |
| 6 | Talk to a mission giver | at a giver marker (r 14 u) | "Talk" | missions.js |
| 5 | Retry mission | at the failed mission's marker | "Retry mission" | missions.js (already 5) |
| 4 | Frame "Click" | within 40 u of a frame spot, facing it within 60° | "Click (F07)" | collectibles.js |
| 4 | Look at a hidden-in-shop collectible | within 8 u of the item's own spot, placed 10 u from the counter so the shop menu stays reachable; item unfound | "Look behind jukebox" | collectibles.js |
| 3 | Shop or service menu | on foot within the shop's r (18 u) | the verb: "Chai", "Haircut ₹10", "Save / Call", "Bus routes" | shops.js |
| 3 | Talk to a named NPC / hint NPC | within 18 u | "Talk", "Ask aunty" | npcs.js |
| 2 | Side activity / job giver | yellow marker | "Paper round" | story.js |
| 2 | Hide | level 1 to 5 at a hide spot (§4.7) | "Hide" | wanted.js |
| 2 | Drop banana peel | chased (level ≥ 1), on foot, holding a peel | "Drop peel" | wanted.js |
| 1 | Board a stopped bus / accept the auto ride | bus within 24 u, auto stopped beside you | "Board bus ₹3", "Get in auto" | traffic.js |
| 1 | Pick up a fallen cycle | 1.5 s after a fall, within 18 u | "Pick up cycle" | vehicles.js |
| 1 | Return a hired cycle | at any `cycle_rent_*` while riding a hired cycle | "Return cycle" | shops.js |
| 0 | Enter / borrow a vehicle; get off / out | within 18 u (vehicles.js) | "Ride Chetak", "Borrow auto", "Get off" | vehicles.js |
| −1 | Wave at a pedestrian | within 16 u, nothing else offered | "*Namaste*" / "*Salaam*" (by the ped's look) | traffic.js |

In a vehicle the only offers are "Get off / out" (0), steps flagged `inVehicle` (7) and job
actions (7). Shops, hides and talk need the player on foot. The label hints "Get off to buy" when
the player stops a vehicle within a shop's r.

### 1.5 Horn on foot

- Within 40 u of a road (`N.world.nearestRoadPoint`) the call is **"AUTO!"** (finger whistle).
  The nearest empty traffic auto within 250 u indicates, pulls over beside you, and its driver asks
  "*Kidhar jaana?*" (§3.8). While a clue is active and unsolved, the auto that comes is
  **Yadagiri's**, and its menu adds the ₹5 clue drop (§6.5).
- Anywhere else it is a shout, "*Oye!*". Pigeons within 80 u lift off, cows within 60 u get up,
  and pedestrians within 40 u turn to look. It never raises the meter unless it is aimed at the
  same ped three times in 3 s (§4.2).

---

## 2. Player

### 2.1 On foot

| Parameter | Value | Notes |
|---|---|---|
| Walk / run top speed | 45 / 80 u/s | entities.js `WALK`, `RUN` |
| Acceleration / braking | 400 / 500 u/s² | 0 to walking speed in 0.11 s |
| Turn rate | 12 rad/s | |
| Collision radius | 4 u | |
| Surface factors (walk) | SAND 0.8, GRASS 0.95, everything else 1 | world.js `SPEED.walk` |
| Respect zones and escorts | Running is disabled (clamped to 45) | §4.8, §8.11 |
| Carrying a heavy item (raddi over 6 kg, rice bag, tin trunk) | ×0.8, no running | §9 |
| Limping (lost chappal, M10) | ×0.8 until hawai chappals are bought (₹15) or the player gets home | bible M10 |
| Scraped knee (after a fall) | Run top speed ×0.9 for 120 gm, or until a plaster (₹1) | §2.6 |

### 2.2 Energy and tummy

The HUD energy bar shows two values:
- **`energy`** (the fill) is stamina. Running and pedalling spend it, and it comes back with rest.
- **`tummy`** (a notch, with the bar dimmed above it) is how fed Chinnu is. **Energy can never go
  above tummy.** Tummy only goes down over time and only goes up with food.

This keeps the existing stamina feel in entities.js, and it is why chai, samosas and coconuts
matter.

| Parameter | Value |
|---|---|
| `energy` drain while running | 8.5/s (as built) |
| Exhausted | at energy 0: no running, walk ×0.8, until energy reaches 30 (as built). Toast "*Saans phool gayi!*" |
| Energy recovery | walking 7/s, standing still 14/s (both after 0.6 s without running), sitting (café, bench, swing, cinema, bus, auto) 25/s, riding a motor vehicle or as a passenger 10/s |
| Pedalling (cycle, ladiescycle) | drains 2.0/s × throttle; coasting or stopped recovers 5/s. At energy 0 the cycle's top speed is ×0.65 until energy reaches 30 ("legs gone") |
| Motor bikes and cars | no energy cost |
| `tummy` at a new game | 80 |
| Tummy drain per real second | idle or walking **0.10**, running **0.25**, pedalling **0.15**, motor vehicle or passenger **0.05**, sitting 0.06. Paused, dialogue, cutscene, minigame or shop menu: 0 |
| Summer midday | ×1.25 drain, 24 Apr to 11 Jun, 12:00 to 15:30, outdoors and not under a tree or awning. A tender coconut or gola cancels it for 120 s |
| Hungry, tummy < 25 | `stomach_growl` sfx every 20 s; toast "*Pet mein chuhe daud rahe hain!*"; run top speed ×0.9; the HUD chai-glass icon blinks |
| Very hungry, tummy < 10 | also walk ×0.9; Chinnu's portrait mood is "sad" |
| **THAK GAYA** | at **tummy 0** (§4.11) |
| Eating | every food adds its value to **both** tummy and energy, each capped at 100 (energy stays ≤ tummy) |

Check: walking and cycling average about 0.12/s, so a full tummy lasts about 830 s (≈ 14
minutes). One café stop of ₹8 every 12 to 15 minutes of play is the rhythm we want.

**Free food** (it keeps a broke kid alive and gives reasons to go home):

| Source | When | Effect | Limit |
|---|---|---|---|
| Home meals (Amma's kitchen, ACTION "Eat" at `home`) | breakfast 07:00–09:30, lunch 12:30–14:30, dinner 19:30–21:30 | +60 | once per meal window |
| Sleeping at home | 20:00–05:00 | tummy set to 70 (dinner + breakfast), energy 100 | — |
| Temple *prasadam* at the gate (`temple_*`, `birla_mandir`, `dilsukhnagar_sai_temple`, `ujjaini_mahankali_temple`, `karmanghat_hanuman_temple`, `ashtalakshmi_temple`, `peddamma_temple`, `iskcon_abids`) | 06:00–12:00 and 17:00–20:30 | +10; +15 at the Sai Baba temple on Thursdays | once per temple per game-day |
| *Langar* at `gurudwara_gowliguda` (walk-only, head covered with the hankie Amma packs) | 12:00–15:00, 19:00–21:00 | +50 | once per game-day |
| Pandal *laddu prasadam* (SA1) | Ganesh week nights | +30 | per bible |

### 2.3 Status effects

| Id | Cause | Effect | Duration |
|---|---|---|---|
| `warm` | Irani chai | energy recovery ×1.5 | 60 s (paani-kam chai 90 s) |
| `coma` | a biryani plate or haleem | no running; walk ×0.9; toast "*Neend aa rahi hai...*" | 45 s (haleem 30 s) |
| `knee` | falling off a bike | run ×0.9; plaster on the sprite once fixed | 120 gm or a ₹1 plaster |
| `limp` | lost chappal (M10) | walk and run ×0.8 | until chappals are bought or home |
| `cool` | coconut, gola, sugarcane juice, Prasads lobby AC | cancels the summer drain multiplier | 120 s (lobby: 5 gm) |
| `gola` | ice gola | cosmetic: tongue colour in the portrait | 3 gm |
| `hair` | barber | cosmetic: the next of 4 styles (spiky → army cut → oiled side parting → puff) | until the next haircut |
| `balloon`, `goggles` | Lumbini balloon (₹2), Numaish goggles (₹5) | cosmetic prop on the sprite | 5 gm / until Chinnu enters a respect zone |
| `sugar` | cotton candy at Numaish | running drain ×0.7 | 30 s |

### 2.4 Money

**Earning**

| Source | Amount | Notes |
|---|---|---|
| Starting purse | ₹10 | bible |
| Mission rewards | ₹10–20; M12 *Eidi* ₹51 | bible per mission |
| Side activities SA1–SA8 | ₹5–25 | bible §7 |
| Jobs | ₹2–10 a run plus tips | §9 |
| Side minigames | cricket ₹2–5, marbles ₹2 (₹5 against Tiger), kite ₹2 a cut | at most 3 paid wins per minigame per game-day; kite capped at ₹10 a day |
| Collectible thresholds | bible §6 and §7.5 | |
| Sunday pocket money | ₹5 from Amma at `home`, Sundays 08:00–12:00 (ACTION "Pocket money") | ₹0 if Chinnu was caught 3 or more times that week ("No pocket money this week. Ask Pochaiah.") |
| Festival money from Ammamma | Sankranti (14 Jan) ₹10, Ugadi (2 Apr) ₹5, Dussehra (5 Oct) ₹5 | toast "*Pandaga dabbulu!*" |
| Bottle deposits | ₹1 per empty cool-drink bottle returned at any `kirana_*` | |
| Selling *lootna* kites | ₹1 each at `kite_stall_*` | §9 |

**Spending:** food (§5), travel (§3.8), cool-downs (§4.6), services and tickets (§5), errand
purchases.

**Losses**

| Loss | Amount |
|---|---|
| PAKDA GAYA | −₹2 (preset-dependent, §14) |
| THAK GAYA | −₹1 |
| Hired cycle returned late | +₹3 per late game-hour after 21:00. If it is not returned by 07:00 the next day: ₹16 (the day plus late fee) charged at the next `cycle_rent_*` visit |
| Bottle kept | lose the ₹1 deposit |
| Failed bargain | pay the seller's price, or walk away |
| Internet café overrun | ₹5 per extra 15 minutes |

**Rules**
- Money never goes below 0. A fine larger than the purse takes the whole purse and nothing more.
- **No money soft-locks.** If a mission-critical purchase costs more than Chinnu has, the mission
  companion (Bunty, Immu, Amma or Ammi) pays the difference: "*Udhaar.* Pay me back in Sankranti
  kites." The debt is listed on the Journal's Stats page and repaid automatically from the next
  income ("*Udhaar chukaya*: ₹6 to Bunty-anna"). M1's ₹20 kites are therefore always affordable
  (₹10 start + ₹10 Sankranti money + the ₹2 lootna bonus).
- ***Khaata*** **at `kirana_1`.** Agarwal-ji lets Chinnu buy on credit up to ₹10 (₹20 at job level
  5, §9). It is repaid automatically from the next income ("*Aaj nakad, kal udhaar*"). While the
  khaata is unpaid, his greeting is "*Khaate mein likh diya.* Tell your Nanna."
- **The toffee-for-change gag.** When a kirana payment would leave 50 p of change, there is a 30%
  chance the shopkeeper gives a toffee (+2 energy) instead. Kirana prices are whole rupees, so this
  only happens after buying a 50 p Mango Masti.

### 2.5 Water

Nobody swims. WATER blocks walkers and land vehicles, as solid as a wall. Ghats and riverbeds
are SAND (walkable, slow). Boats need a shore to land. If a script ever leaves the player on water
(debug, or a failed boat landing), the player is teleported to the nearest walkable cell with
`splash` and the toast "*Chapak!*" (−5 energy, no other penalty).

### 2.6 Falling off cycles and bikes

| Rule | Value |
|---|---|
| Trigger | The player is on a `cls: 'bike'` vehicle and hits a wall, vehicle, cow, buffalo or crowd at closing speed **≥ 75 u/s** (cycles) or **≥ 90 u/s** (Luna, Chetak, RX100). Also a pothole decal at ≥ 100 u/s on GROUND: 10% chance |
| Animation | toast "*DHADAAM!*", sfx `crash` then a bell ding; Chinnu is thrown 14 u forward at ±30°, knocked down for 1.0 s (dust puff), then sits up and rubs his knee |
| Cost | −15 energy; `knee` status; cargo −15 if carrying one (W3) |
| Never | no falls from height (terraces are walled and planks have railings); no blood; nobody hurt |
| The bike | lies on its side. ACTION "Pick up cycle" after 1.5 s; it rights itself after 8 s if left |
| A pedestrian hit by the player's bike | knocked down 0.8 s, gets up, dusts off and barks a line. Heat per §4.2 |
| Cars, autos | no ejection. A crash at ≥ 120 u/s shakes the screen (0.35 for 0.25 s) and plays `crash` |

### 2.7 Inventory

`N.player.inventory` is a Set of ids. Counted consumables live in `N.player.items {id: count}`.

| Id | What | Source | Use |
|---|---|---|---|
| `walkman` | walkman-type player-recorder | start | walkman music, ● REC |
| `camera` | Nanna's camera, 24 frames | M1 | Frames (§7) |
| `tin` | Karachi Bakery tin | M2 | story tokens |
| `cassette_1`..`16` | cassettes | collectibles | songs and memos |
| `mango_bite` (max 9) | toffee, 50 p | kirana | bribe Chitti (§4.6) or eat (+2) |
| `jasmine` (max 3) | one *moora*, ₹2 | flower cart | Mummy cool-down (§4.6) |
| `kotha_chappal` (max 1) | new chappals for Mummy, ₹25 | `chappal_bazar` | clears level 5 |
| `osmania_packet` (3 uses) | takeaway biscuits | cafés, bakeries | +15 each (ACTION from the HUD item slot or the pause menu) |
| `biscuits` (1 use) | glucose biscuits | kirana | +12; or feed a dog (§11.3) |
| `samosa_dozen` (3 uses) | small onion samosas | samosa bandi | +14 each |
| `glucose` (3 uses) | glucose powder | medical shop | +25 energy, +10 tummy each |
| `banana_peel` (60 s) | left after eating a banana | banana cart | "Drop peel" (§4.7) or auto-binned |
| `cool_drink_bottle` | empty bottle | after a takeaway cool drink | ₹1 deposit at any kirana |
| `torch` | torch (batteries ₹8 separate) | kirana | night light cone 70° x 110 u; SA1 |
| `cricket_ball` | tennis ball | kirana, ₹10 | gully cricket "owner bats first" bonus (§8.4) |
| `city_map` | "Guide Map of Twin Cities", ₹10 | stationery | shows every shop and service icon on the full map |
| `ticket_punch` | Ticket Thatha's punch | 12 tickets | free bus rides |
| `raja_goli` | the king marble | 20 golis | marbles bonus |
| `charkhi` | saddi reel | 8 kites | kite minigame bonus |

The HUD has **one quick-item slot** (bottom-left above the minimap on desktop, a 44 px button on
touch). It shows the best edible in the inventory; the pause menu lists all of them.

---

## 3. Vehicles

### 3.1 Types and stats

These values match `src/vehicles.js` as built. `w` is the length along the heading and `d` the
width. Speeds are in u/s and acceleration and braking in u/s².

| Type | Name | w x d x h | Top speed | Accel | Brake | Reverse | Turn | Grip | Mass | Seats | Radio | Smoke | Who rides |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `cycle` | Hero-style cycle | 15 x 5 x 6 | 115 | 62 | 170 | 0.12 | 3.4 | 13 | 1.2 | 1 | walkman | — | everyone |
| `ladiescycle` | Ladies cycle (basket) | 15 x 5 x 6 | 108 | 58 | 170 | 0.12 | 3.4 | 13 | 1.2 | 1 | walkman | — | aunties, girls, Chinnu |
| `luna` | TVS-Luna-style moped | 15 x 5.5 x 7 | 120 | 70 | 190 | 0.1 | 3.2 | 12 | 2 | 1 | walkman | light | milkmen, Pochaiah |
| `chetak` | Bajaj-Chetak-style scooter | 17 x 7 x 8 | 150 | 95 | 210 | 0.1 | 3.0 | 11 | 3 | 2 | walkman | 2t | families, Nanna |
| `rx100` | Yamaha-RX100-style bike | 18 x 6 x 8 | 180 | 150 | 230 | 0.1 | 3.1 | 11 | 3 | 2 | walkman | 2t | Bunty, college boys |
| `auto` | Auto-rickshaw | 22 x 13 x 14.5 | 135 | 80 | 210 | 0.3 | 2.7 | 7.5 | 5 | 3 | yes | 2t | autowallahs |
| `ambassador` | Ambassador | 30 x 14 x 12.5 | 165 | 88 | 230 | 0.35 | 2.2 | 8.5 | 10 | 4 | yes | — | taxis, officials |
| `maruti800` | Maruti 800 | 24 x 12 x 11.5 | 165 | 110 | 230 | 0.35 | 2.6 | 8.5 | 6 | 4 | yes | — | families |
| `padmini` | Premier Padmini | 26 x 12 x 11 | 158 | 92 | 230 | 0.35 | 2.4 | 8.5 | 7 | 4 | yes | — | taxis, uncles |
| `bus` | APSRTC city bus | 62 x 18 x 19.5 | 115 | 42 | 150 | 0.25 | 1.25 | 10 | 40 | 50 | driver's cassette | diesel | conductor + driver |
| `lorry` | "Horn OK Please" lorry | 46 x 16 x 16 | 110 | 40 | 150 | 0.25 | 1.2 | 10 | 45 | 2 | yes | diesel | drivers |
| `boat` | Lumbini rowing boat | 28 x 11 x 6 | 60 | 28 | 40 | 0.4 | 1.1 | 2.2 | 12 | 6 | — | — | boatman |

**Kid at the wheel.** When Chinnu drives an auto or a car, its top speed is ×0.9 and its
acceleration ×0.85: he perches on the edge of the seat to reach the pedals. The vehicle's name
plate on the HUD shows a small "L" board, as a joke.

**Surfaces.** Cars, autos, buses and lorries use world.js `SPEED.drive` (FOOTPATH and PLAZA
0.85, GROUND 0.7, GRASS 0.6, SAND 0.45). **Bikes** (cls `bike`) use FOOTPATH and PLAZA 1.0,
GROUND 0.85, GRASS 0.75, SAND 0.55. During monsoon rain (§10.5), grip is ×0.8 on roads and ×0.6
for bikes on puddle decals.

### 3.2 Story and special vehicles (`N.vehicles.define`)

| Id | Base | Changes | Where |
|---|---|---|---|
| `family_chetak` | chetak | grey-blue `#7d9ab0`, seeded at `home` | Nanna's. Rules in §3.3 |
| `chinnu_cycle` | cycle | top 122, accel 66; carrier (cargo damage −25%) | unlocked with 12 finds (§7.5) |
| `old_cycle` | cycle | Nanna's tall black roadster: top 105, turn 3.0 ("*kainchi* style") | M6, then at home |
| `bunty_rx100` | rx100 | black, `seats: 2` | SA6, Sundays (any day with 60 finds) |
| `yadagiri_auto` | auto | label "YADAGIRI", "Horn OK Please" on the back, never borrowable (`noEnter`) | hints, story rides |
| `pochaiah_luna` | luna | red, light-bar decal | Chappal Meter level 4 |
| `pasha_lambretta` | chetak | yellow, top 140, sidecar of camera gear (drawn only) | M2, M7, M9, M12 |
| `peacock_lorry` | lorry | painted peacock, decorated idol bed | M10 |
| `govt_ambassador` | ambassador | white with a red beacon, `noEnter` ("VIP car, *beta*. *Nakko.*") | colonial districts, 3% of Ambassadors |
| `taxi_ambassador` | ambassador | black and yellow, roof carrier of tin trunks | ending card |
| `mini_train` | (scripted, not a vehicle) | runs on a path at 30 u/s, seated ride | `ntr_gardens` (M9, ₹5 in free roam) |
| `safari_bus` | bus | caged windows, inside the zoo only, scripted | `nehru_zoo` (₹10 ride, viewing) |

### 3.3 Riding and borrowing

| Vehicle state | Player may | Chappal Meter (heat, §4) | Other effects |
|---|---|---|---|
| Hired cycle (`cycle_rent_*`) | ride | none | the hire clock runs (§5.6) |
| Owned (`chinnu_cycle`, `old_cycle`) | ride | none | seeded at `home` each morning; if left elsewhere it is back home after sleeping |
| `family_chetak` before unlocking it (30 finds) | ride | **+100 when Nanna is home** (18:30–08:30, Sundays, festival days): Chitti tells. Otherwise +40 | "*Sreenivas-garu ka Chetak kidhar gaya?*" |
| `family_chetak` after unlocking | ride | none | Nanna: "Only in the colony. ...And to Immu's. And back." |
| Parked cycle, no rider | borrow | 25% chance the owner appears within 3 s shouting "*Oye! Meri cycle!*" and chases on foot at 60 u/s for 6 s; if a spotter sees this, +30 | — |
| Parked Luna, Chetak or RX100 | borrow | +100 if any ped within 120 u has line of sight, otherwise +40 | — |
| Parked auto at a stand | borrow | +100 (the driver naps nearby: "*Arre! Mera auto!*") | — |
| Parked car | borrow | +100 if witnessed, otherwise +40 | — |
| **Occupied** vehicle (any borrowable type) | borrow | **+100** (ARCHITECTURE: +1 level) | the driver is put at the door, shouting |
| `bus`, `lorry` (traffic or parked) | **cannot drive** (`noEnter` for the player) | — | buses: board as a passenger (§3.8). Lorries: story cab rides only. Debug `enterVehicle` still works |
| `govt_ambassador`, `yadagiri_auto`, story vehicles | cannot borrow | — | "*Nakko, beta.*" |
| Boats | only hired at `lumbini_jetty` | — | §3.7 |

**Under-age driving.** While Chinnu drives any motor vehicle that is not unlocked (§7.5), a
traffic constable on a junction podium who sees him within 140 u adds +40 heat and shouts
"*Licence dikhao!*". This happens at most once per constable per 60 s. On its own it can only push
the meter to level 2 (§4.2 cap).

### 3.4 Traffic mix per district

Percentages of **moving** ambient traffic. The district style comes from `worlddata.js`. The
overrides apply to the named district ids.

| Style (districts) | cycle | ladies | luna | chetak | rx100 | auto | amb. | m800 | padmini | bus | lorry |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **colony** (himayatnagar, erragadda, ameerpet, khairatabad, musheerabad, tolichowki, masab_tank, kachiguda, amberpet, langar_houz, malakpet, dilsukhnagar, saidabad, chandrayangutta, saroornagar, lb_nagar) | 22 | 8 | 10 | 16 | 6 | 18 | 4 | 8 | 3 | 4 | 1 |
| **market** (rtc_x, nampally, abids, koti, chaderghat) | 12 | 4 | 6 | 14 | 6 | 26 | 6 | 8 | 4 | 10 | 4 |
| **oldcity** (charminar, puranapul, bahadurpura, dabeerpura, falaknuma) | 20 | 3 | 10 | 18 | 8 | 28 | 3 | 4 | 2 | 3 | 1 |
| **colonial** (hussain_sagar, basheerbagh, afzalgunj) | 10 | 4 | 4 | 14 | 6 | 18 | 14 | 12 | 6 | 10 | 2 |
| **posh** (begumpet, banjara) | 6 | 4 | 3 | 12 | 8 | 14 | 12 | 24 | 10 | 4 | 3 |
| **cantonment** (secunderabad, marredpally) | 16 | 8 | 6 | 14 | 6 | 18 | 8 | 10 | 4 | 9 | 1 |
| **hitec** (hitec) | 6 | 2 | 6 | 10 | 10 | 12 | 6 | 22 | 4 | 4 | 18 |
| **rocky** (jubilee, golconda, rajendranagar, zoo) | 14 | 4 | 8 | 14 | 10 | 14 | 6 | 12 | 4 | 6 | 8 |
| override `osmania` (students) | 26 | 8 | 6 | 18 | 12 | 10 | 4 | 6 | 2 | 6 | 2 |

**Density:** the target number of moving vehicles within 700 u of the player.

| Style | colony | market | oldcity | colonial | posh | cantonment | hitec | rocky |
|---|---|---|---|---|---|---|---|---|
| Day target | 12 | 18 | 14 | 14 | 10 | 12 | 6 | 6 |

| Time / event multiplier | Value |
|---|---|
| 08:00–10:00 and 17:30–20:00 rush | ×1.3 (school autos 07:30–08:30 in colony districts: +3 autos packed with kids) |
| 20:00–23:00 | ×0.5 |
| 23:00–05:00 | ×0.25; lorries' share ×2; cycles' share ×0.5 |
| Around `charminar` after 22:00 | ×0.3 (bible: buses stop circling at 22:00) |
| `ganesh_immersion` (9 Sep), Tank Bund and Secretariat Road | ×1.6, mostly idol lorries and tractors at 30 u/s: a jam |
| `bonalu` (20 Jul), roads round `ujjaini_mahankali_temple` | closed to traffic (procession) |
| `chand_raat` (25 Nov), Laad Bazaar lanes | no vehicles (pedestrian bazaar) |
| Epilogue (2026) | 0 around the plaza ("closed to traffic this evening") |

**Parked vehicles** come from the chunks, deterministic per chunk seed, and are borrowable:
- colony chunks: 3 per 256 u chunk (cycles 50%, Chetak 25%, Luna 15%, Maruti 800 10%)
- market chunks: 4, plus **auto stands** of 3 to 6 autos at `koti_bus_stand`, `rtc_x_roads`,
  `nampally_station`, `kachiguda_station`, `secunderabad_station`, `imlibun_bus_station`,
  `abids` and `charminar` (the circle)
- posh chunks: 2 cars
- the depots (`gowliguda_hangar`, `koti_bus_stand`, `rathifile_bus_station`,
  `mehdipatnam_bus_terminus`) show parked buses (scenery, `noEnter`)

**Ambient AI** (traffic.js sets `v.controller`). Traffic keeps to the **left** lane.

| Behaviour | Rule |
|---|---|
| Cruise speed | arterial 0.75 x top (cap 120 u/s), street 0.6 x (cap 95), lane 0.4 x (cap 60), bund 0.7 x, bridge 0.65 x |
| Junctions | slow to 0.4 x; yield to a vehicle already in the junction box; a podium junction with a constable (08:00–21:00) holds one axis 6 s, then the other |
| Buses | stop 4 s at each `bus_stop_*` on their route; the route number shows on the destination board (types' `routes`) |
| Autos | 15% chance per gh to pull over for 3 s (a passenger gets out); answer "AUTO!" calls (§1.5) |
| Cycles and Lunas | hug the left edge; wobble ±2 u at low speed |
| Obstacles | brake for peds, cows and the player within 30 u ahead; horn after 1.5 s blocked; go round a sleeping cow at 20 u/s if the other lane is free |
| Player horn | the vehicle ahead within 70 u moves 6 u left and slows for 2 s; 20% of autos honk back ("pom pom") |
| Never | ambient AI never rams the player, never chases and never leaves the road graph |

### 3.5 Radio and the walkman

| Context | Sound source | Control |
|---|---|---|
| On foot, cycles, Luna, Chetak, RX100 | **Walkman** (from the start): side 1 is found cassette songs (`N.audio.walkman`); side 2 is the radio band (the 3 stations) | `radio` = next source (cassette songs in found order → Vani → Band Baaja → Pop Patang → back); hold 0.6 s = stop |
| Auto, Ambassador, Maruti 800, Padmini, lorry | **Vehicle radio**, 3 stations (bible §8.5, `audio.js` STATIONS). Lorries start on Band Baaja 93.5 | `radio` = next station; hold = off |
| City bus (passenger) | the driver's cassette (`r_baraat` or `r_chandni`); fixed | — |
| Boat | none; the boatman hums (ambient) | — |
| Respect zones, procession escorts, cutscenes | the walkman and radio pause automatically | — |
| Irani café jukebox (§5.1) | any found song, played in the café as an ambient emitter | ₹1 |

Rules:
- Score music yields while the radio or walkman plays (ARCHITECTURE §17).
- DJ lines go to `N.hud.toast`.
- Walkman volume ducks to 40% while a dialogue box is open, and to 70% when a pursuer has seen
  Chinnu in the last 3 s, so he hears the whistle.

### 3.6 Fast travel and passenger rides

| Mode | Where | Price | Rules |
|---|---|---|---|
| **City bus, hub menu** | `koti_bus_stand`, `imlibun_bus_station`, `rathifile_bus_station`, `mehdipatnam_bus_terminus`, `gowliguda_hangar` (ACTION "Bus routes"); unlocked in M5 (Mehdipatnam in M7) | ₹3 (free with `ticket_punch`) | Destinations: every other hub, plus each `bus_stop_*` whose ticket (T01–T12) has been found, plus `golconda_fort` gate (M7 reward). Ride: a VHS ▶▶ (2.5 s, `N.render.fx.vhs`), and the player arrives as the bus pulls away. Game time passes = road distance / 115 u/s in gm |
| **City bus, hop on** | any `bus_stop_*` while a traffic bus is stopped there | ₹3 | ACTION "Board bus ₹3". Passenger view; the bus follows its route; ACTION "Get off at next stop". Open the map to pick a stop on this route and ▶▶ to it. Boarding a moving bus (> 15 u/s) is **footboard**: the conductor pulls him in and scolds, +50 heat, "*Footboard pe nakko!*" |
| **Auto taxi** | horn "AUTO!" near a road (§1.5); auto stands | Meter = ₹6 for the first map-km (430 u of road) + ₹4 per extra map-km, rounded up to ₹1; ×1.5 from 22:00 to 05:00 | The driver asks meter + ₹10 ("*Meter nakko, das upar*"). Choose [Pay] / [Bargain] (`bargain`, `who:'auto'`, target = meter) / [*Nakko*]. Destinations: discovered places and mission targets. Ride as a passenger with ▶▶ (3 s). It refuses at level ≥ 3 ("Pochaiah is my cousin's friend. *Nakko.*") |
| **Yadagiri's clue drop** | horn near a road while a clue is active | ₹5 | Drops Chinnu within 150 u of the answer (§6.5). Never for clue 5 (Golconda; bible) |
| **Nanna's Chetak (pillion)** | call from any `std_*` (₹1); needs 45 finds (§7.5) | ₹1 call | 18:30–21:30 on weekdays, 07:00–21:30 on Sundays and holidays. Nanna arrives in 20 s at the nearest road and drops Chinnu at any discovered place. Once per game-day. If the meter is 1 to 3 it clears ("Your Amma doesn't need to know. ...She will know.") |
| **Lorry cab** | story only (M10) | — | passenger |
| **Trains** | none for travel (no MMTS in 2003; bible §11) | — | stations are cut-throughs and services (§5.17) |
| **Off-map trips** | `ramoji_film_city` via `imlibun_bus_station` / `koti_bus_stand` (post-game) | ₹10 | a cutscene card ("Film City: a whole day of fake streets"), +10 gh, then home |

### 3.7 Boats (`lumbini_jetty`)

| Rule | Value |
|---|---|
| Availability | after M10 (bible), 10:00–19:30 |
| Price | ₹10 a ride (bible) |
| Duration | 120 s real (2 gh shown on the boatman's watch), then the boatman takes over and rows back ("Time up, *beta*") |
| Control | the player steers (boat stats); ACTION toggles "Let the boatman row" (autopilot: one loop round the Buddha at 60 u radius, then back) |
| Limits | Hussain Sagar water only. No landing on Gibraltar Rock (the Buddha's island): its rocks are solid for boats. Frame F07 can be clicked from the boat |
| Getting off | only at the jetty (ACTION "Get off" within 20 u of `lumbini_jetty`) |

---

## 4. Chappal Meter (wanted level 0 to 5)

Mummy's Chappal Meter is the wanted level. The HUD shows 5 slippers. The next slipper fills in
proportion to the heat inside the current level, and on Chand Raat the HUD shows two chappals of
different sizes. Pursuer lines are in bible §8.2.

### 4.1 Model

| Field | Rule |
|---|---|
| `heat` | integer 0..599 |
| `level` | `min(5, floor(heat / 100))` |
| `add(levels, reason)` | `heat += 100 * levels`, capped at 599. ARCHITECTURE's `N.wanted.add(1)` |
| `addHeat(h, reason)` | minor offences. **Minor heat alone cannot lift heat above 299** (level 2). Spotter reports and escalation timers can go higher |
| `set(level)` / `clear(reason)` | scripts and cool-downs; `set` puts heat at `level * 100 + 50` |
| `freeze(on)` | respect zones, cutscenes, dialogue, minigames, shop menus: no gain, no decay, no pursuer movement |
| `lock(level or null)` | missions pin the level (M3's scripted climb, M12 locked at 5) |
| `policy` | `'normal'` (default) / `'frozen'` / `'scripted'` per mission step (§6.2) |

### 4.2 What raises it

| Offence | Heat | Notes |
|---|---|---|
| Running into a ped on foot at > 60 u/s | +10 | the ped barks |
| Knocking a ped down with a bike | +25 | |
| Knocking a ped down with a car, auto or other motor vehicle | +50 | |
| ...when the ped is an aunty, uncle, old person or saree / burqa look | ×1.5 | "*Ayyo*, look at his knees!" |
| Bumping a constable or Pochaiah | +100 | |
| Hitting a vehicle at > 70 u/s (closing speed) | +20 | |
| Horn or "*Oye!*" at the same ped 3 times within 3 s | +10 | "*Kaiku horn bajare?*" |
| Riding or driving on a footpath at > 60 u/s with peds within 30 u | +5 per s | |
| Bumping a cow or buffalo with a vehicle, seen by anyone | +20 | the cow is fine and moos |
| Borrowing a vehicle | §3.3 (+30 to +100) | |
| Footboard on a bus | +50 | |
| Dropping a banana peel that trips someone | +20 | §4.7 |
| Under-age driving seen by a constable | +40 | §3.3 |
| Rude dialogue choice (e.g. M4 Assembly gate "Oye uncle") | +100 | bible "+1 meter" |
| **Aunty network hint** (§6.5) | +100, applied **10 gm later** | "Mummy hears within ten minutes" |
| A spotter reports Chinnu (level ≥ 2, seen for 1.5 s) | +40 | §4.4 |
| Chitti tattles (she stays within 60 u for 8 s in total) | +100 | §4.4 |
| Curfew | raises the floor, see §4.12 | |
| Mission scripts | as written | M3, M5 late, M12 |

**Line of sight.** Each pursuer and spotter checks
`N.world.raycast(px, py, sx, sy, 'walk')` against SOLID, ROCK and VOID cells every 0.25 s,
staggered across actors. The sight radius is per actor (§4.4).
- Night (`N.clock.isNight()`): radius ×0.75, except Bahadur's torch and Mummy.
- Crowd zones (§11.5): radius ×0.6.
- Chinnu is never "seen" while hidden (§4.7), inside a respect zone, or riding inside a bus.

### 4.3 Decay and escalation

| Rule | Value |
|---|---|
| Unseen timer | seconds since any pursuer or spotter last saw Chinnu |
| Level drop | when the unseen timer reaches **12 s**, the level drops by 1 (heat = new level × 100 + 60) and the timer restarts. Each further 12 s unseen drops another level. Toast "*Bach gaya!*"; at 0: "Safe. For now." |
| Level 0 heat | decays 5/s, so minor offences are forgotten in 20 s or less |
| Faster unseen timer | ×2 inside a crowd zone or riding a bus as a passenger |
| Level 1 → 2 | Chitti's tattle, or offences |
| Level 2 → 3 | spotter reports (+40 each, so about 3 reports), or offences |
| Level 3 → 4 | Pochaiah has seen Chinnu for **25 s in total** since level 3 began, or a +100 offence |
| Level 4 → 5 | seen for **30 s in total** at level 4, or a +100 offence ("Pochaiah phoned Lakshmi Nivas.") |
| While seen | no decay |

### 4.4 Pursuers per level

Only **one active chaser** exists at a time, plus spotters. Level 2 has no chaser of its own, so
the level-1 chaser keeps following at level 2, unless Chitti has just tattled and run home. From
level 3 up, the chaser is always the current level's. When the level rises past a chaser, it says
its "escaped" line and leaves; when the level falls, the chaser gives up the same way. Chasers spawn **out of view** (`N.render.inView` margin 40) at the listed
distance along the road graph. They despawn once out of view and more than 500 u away.

| Level | Who (bible) | When / where | Spawn | Move | Sight | Catch | Behaviour |
|---|---|---|---|---|---|---|---|
| **1** | **Chitti** (6) | colony districts (`himayatnagar`, `rtc_x`), 07:00–19:30, not during school hours on school days (08:30–15:30: she is in class) | 260 u, from the direction of `home` | walk 40, run 62, never tires | 160 | **cannot catch.** **Tattle:** within 60 u for 8 s in total → +100 (she runs home) | follows the last-seen point; shouts every 6 s; a Mango Masti bribes her off (§4.6) |
| **1** | **colony uncle on a cycle** | anywhere else, or at night | 300 u by road | cycle 95 | 180 | cannot catch; tattles after 10 s in total within 80 u | "I'm going that way anyway. Towards your house." |
| **2** | **aunties' phone tree** (spotters) | day; ambient `aunty`, `saree`, `woman` peds within 400 u get flagged (at most 4, with a "!" pip) plus the colony-gate aunties | existing peds | stand still or stroll 20 | 130 | none; **report** = seen 1.5 s in total → +40, then a 10 s cooldown for that spotter | gate gossip lines (bible §8.2) |
| **2** | **Bahadur** the Gurkha | night, colony districts | the colony gate | walk 40, patrols toward the last-seen point | torch cone 60° x 200 u, otherwise 150 | none; reports +40; whistle `gurkha` | taps his stick; "*Kaun hai?*" |
| **2** | **traffic constables** (spotters) | 08:00–21:00 at podium junctions (`junction` places) and the `assembly` sentry | static | static | 140 | none; reports +40 | "*Licence dikhao!*" |
| **3** | **Havaldar Pochaiah** on foot | anywhere | the nearest podium junction, else 350 u by road; `rtc_x_roads` is his home podium | run **70**, accel 140, never tires | 220 | **contact ≤ 12 u** when Chinnu is on foot, or on a bike under 35 u/s → **PAKDA GAYA** | whistles every 4 s (`whistle`); after losing sight he searches the last-seen point for 8 s, then walks a 150 u spiral; slips on peels for 2 s |
| **4** | **Pochaiah on his Luna** | anywhere | rides in from 400 u | Luna AI ×0.95 (114 u/s); ×0.6 on GRASS, SAND and `path` | 260 | **box-in:** within 18 u while Chinnu is under 25 u/s for 1.2 s; or contact on foot | follows the road graph to Chinnu's nearest road point. If Chinnu is in a park, plaza or lane narrower than 24 u, he parks at the edge, dismounts and runs at 70 for 6 s, then goes back |
| **5** | **MUMMY in Yadagiri's auto** | day 06:00–19:30 | 450 u by road | auto AI ×0.9 (122 u/s) | 240 | **chappal hit** (§4.9), or a box-in: Mummy steps out and grabs (on foot, run 75, for up to 8 s) | throws a chappal every **6 s** within 150 u with line of sight. Yadagiri: "Sorry, {nick}! Full meter!" |
| **5** | **MUMMY pillion on Nanna's Chetak** | night 19:30–06:00 | 450 u | Chetak AI ×0.85 (128 u/s): "Padma, it's a Chetak, not a rocket." | 200 | as above | Nanna drives, mortified |
| **5** | **Mummy + Ammi on foot** | M12 only, bazaar lanes and plaza | scripted | run 72 each | 200 | chappal (two sizes), contact | they stay in the lanes; they path round `mecca_masjid` and `jama_masjid_charminar` |

All pursuer AI keeps a **40 u buffer around respect zones** and never paths through them (§4.8).

### 4.5 Seen, but kid-sized

- Pursuers never hit, push or knock Chinnu down. A "catch" is a hand on the shoulder, or the
  chappal's soft bonk on the back.
- Chinnu can move past pursuers. They are `solid` but light (mass 2), so he can squeeze by.
- Mummy's chappal never targets the head. It lands on the back as a soft "thup" (`chappal` sfx)
  with a cartoon star.

### 4.6 Cool-downs and clearing

| Method | Where | Cost | Effect | Limits |
|---|---|---|---|---|
| Break line of sight | anywhere | — | −1 level per 12 s unseen | — |
| **Mango Masti for Chitti** | give one to her (ACTION) | 50 p (kirana) | level 1 → 0; Chitti: "...I saw nothing. Mango Masti is very good." | level 1 with Chitti only |
| **Irani café family room** | any `irani_cafe_*`: order something (≥ ₹4), then ACTION "Sit in family room" and stay 10 s | the order | **−2** (bible) | levels 1–4 (at 5: −1, "Mummy checks family rooms"); once per café per game-day; not while a chaser is within 40 u with sight |
| **Barber haircut** | any `barber_*` | ₹10 | **clears everything** (bible); the hairstyle changes | 8 s cutscene; not while a chaser is within 40 u with sight; barbers close on Tuesdays [~] |
| **Home before the street lights** | reach `home` (r 20) before 18:30 | — | levels 1–3 → 0 ("Good boy, home on time.") | after 18:30, any level ≥ 1, or level 4–5 at any time → caught at the door (PAKDA GAYA, no respawn needed) |
| **Jasmine for Mummy** | `flower_cart_*` | ₹2 a *moora* | level 5 → 3 (bible "−2, works on Mummy only") | level 5 only; give within 24 u |
| **Kotha chappal** | `chappal_bazar` | ₹25 | level 5 → 0 (single use) | level 5 only |
| **Famous Ice Cream** | `famous_ice_cream` | ₹8 scoop | −1 (bible) | once per 10 gm |
| **Phone home** | any `std_*`, "Call home" | ₹1 | level 1–2 → −1 ("*Haan Mummy*, I'm at Immu's. Doing homework.") | once per game-day |
| **Cinema show** | any cinema (§5.15) | ticket | −2 (3 hours in the dark) | levels 1–3; not during a chase within 200 u |
| **Prasads lobby AC** | `prasads_imax` from 25 Jul | — | −1 | once per game-day |
| **Call Nanna** | `std_*`, after 45 finds | ₹1 | levels 1–3 → 0 | §3.6 |
| **Sleep at home** | `home`, 20:00–05:00 | — | clears all | — |

### 4.7 Hiding

| Hide spot | Where | Works at | Effect | Limits |
|---|---|---|---|---|
| Behind the rice sacks | any `kirana_*` counter (ACTION "Hide", 8 s) | levels 1–4 | −1 and the unseen timer = 12 s | once per kirana per game-day; at level 5 Mummy asks "Agarwal-ji, is he behind the rice?" and it fails |
| **Video parlour back door** | any `video_parlour_*` | levels 1–5 | Chinnu leaves by the rear lane (teleport to a point 40 u behind the parlour), sight is broken, unseen timer = 6 s ("Your Amma is outside? ...Back door is there.") | once per parlour per game-day |
| Blend into a queue | `sandhya_theatre`, `devi_theatre` queue cages before a show; Thursday Sai temple **outer** lane is **not** a hide (respect) | levels 1–3 | the unseen timer runs ×2; sight radius ×0.5 | while standing still in the queue |
| Ride a city bus | board at a stop | levels 1–3 | sight broken while inside; unseen timer ×2 | not allowed at level 4–5 (the conductor won't take a boy being chased) |
| Crowd zones | Numaish, Laad Bazaar, General Bazaar, Sultan Bazaar, a TV-window crowd | any | sight ×0.6, unseen timer ×2 | — |
| Banana peel | ACTION "Drop peel" while chased on foot | levels 1–4 | the first foot pursuer to step on it slips for 2 s (slide-whistle `peel_slip`), +20 heat | **Mummy never slips**: she steps over it without looking. 1 peel at a time |
| A friendly dog | feed a dog a biscuit (§11.3) | any | the dog follows Chinnu for 2 gm and barks at foot pursuers within 80 u (they stop for 1.5 s) | — |

### 4.8 Respect zones

Every compound of a temple, mosque, dargah, church, the gurudwara and the ashurkhana, Charminar's
interior, and procession paths has a `respect` polygon. The data is the `<id>_compound` park
(map_plan §2) plus a 30 u **forecourt** ring at each gate.

| Rule | Value |
|---|---|
| Movement | walk only (running clamped to 45); vehicles cannot enter (an invisible wall); footwear stand at the gate (a sprite detail) |
| Meter | **frozen** inside the compound and its forecourt: no gain, no decay |
| **During a chase** | if a pursuer saw Chinnu in the last 12 s, the compound gate is **closed to him**: a soft wall and a gentle elder or watchman line, "*Shant ho ke aao, beta*" (come back calm). Chases never go inside. At the forecourt the meter freezes and pursuers stop 40 u away and wait, arms folded; they do not leave, so the gate is never a way to escape |
| Pursuer AI | never paths within 40 u of a respect zone; on Chand Raat a watchman and worshippers stand at the `mecca_masjid` and `jama_masjid_charminar` gates (bible M12) |
| Disabled inside | horn, walkman and radio, banana peels, borrowing, camera clicks (frames are taken from the road), jobs, minigames |
| Allowed | prasadam (§2.2), langar, the escort and queue steps written in the bible (M6, M8, M11), cutscene cards |

### 4.9 The homing chappal (level 5)

| Parameter | Value |
|---|---|
| Throw interval | every 6 s (preset §14), needs line of sight and Chinnu within 150 u |
| Warning | 0.4 s wind-up with a `chappal_whoosh` cue; a ground marker under the chappal |
| Flight | 170 u/s; arc height up to 24 u (shadow on the ground); lifetime 1.4 s (≈ 240 u) |
| Homing | turns at 2.0 rad/s for the first 0.6 s, then 0.8 rad/s, so a **sideways dodge late in the flight** works |
| Hit | within 7 u of Chinnu's centre (12 u when he is on a bike) → **PAKDA GAYA** |
| Near miss (< 20 u) | toast "DODGE!"; bark "Missed! ...She never misses twice." |
| Assist (§14) | optional 0.3 s slow-motion at 0.5x when the chappal is 40 u away |
| After landing | the chappal lies there 3 s, then pops back to Mummy (cartoon) |

### 4.10 PAKDA GAYA! (caught)

1. Freeze for 0.4 s. `N.emit('busted', {by, x, y})`, sfx `busted`, banner **"PAKDA GAYA!"**
   (`kind: 'busted'`, 1.6 s), VHS ◀◀ effect for 1.2 s.
2. One scolding line from bible §8.3, spoken by whoever caught him: `amma` at level 5,
   `pochaiah` at 3–4, `ammi` in M12. Chitti and spotters never catch. Line 10 (`chitti`: "I TOLD
   you I'd tell.") plays only if Chitti tattled earlier that day.
3. **−₹2** (min 0), meter → 0, **+30 gm**, tummy +10 ("Eat first. Then scolding.").
4. **Respawn.** In free roam: at the `home` gate on foot. A borrowed vehicle stays where it was;
   owned vehicles go home. In a mission: at the last checkpoint, unless the mission sets
   `onBusted` (M3: the home scene with −₹2; M12: the mothers walk Chinnu to the café). **Being
   caught never fails a mission** unless the mission sets `failOnBusted`.
5. The Journal's Stats page counts "Times caught".

### 4.11 THAK GAYA! (exhausted)

1. Trigger: **tummy reaches 0.** If the level is ≥ 3 and the chaser is within 250 u, it becomes
   PAKDA GAYA instead.
2. Chinnu sits down and pants (`pant` for 1.5 s); banner **"THAK GAYA!"** (fail style, ochre);
   `N.emit('wasted')`; fade 0.8 s.
3. One line from bible §8.3 THAK GAYA (the café speaker is `salim` at `irani_cafe_7`, otherwise
   `waiter`).
4. **Respawn** at the nearest open `irani_cafe_*` by straight-line distance. Between 23:30 and
   05:00 the cafés are shut, so he respawns at `home` (Amma: "Come, eat.").
5. **−₹1** (glucose water), tummy 40, energy 40, **+45 gm**, meter −2 (min 0; time passed).
6. In a mission: respawn at the last checkpoint with tummy 40. The mission goes on; it is not a
   fail.

### 4.12 Curfew (free roam only)

| Time | Effect |
|---|---|
| 18:30 | street lights; the "home before the street lights" cool-down window closes |
| 21:30 | meter **floor 1** (Mummy is waiting at the gate); toast "Mummy is waiting at the gate." |
| 23:00 | floor 2; Bahadur actively searches the colony districts |
| 00:30 | floor 3 (Pochaiah on his night round) |
| Reaching `home` | the floor is removed. Before 23:00: a scolding line only. After 23:00: −₹2 too. Then "Sleep?" |

The curfew is off during missions, on festival nights until their end time (`numaish` 22:30,
`ganesh_immersion` all night, `ramzan` 23:30, `chand_raat` all night), and in the post-game.

### 4.13 API and events (wanted.js)

```
N.wanted: level, heat, seen (bool), unseenT, chaser (actor|null), spotters [actors], TUNE,
  add(levels, reason), addHeat(h, reason), set(level, reason), clear(reason),
  freeze(on, reason), lock(level|null), policy(name), inRespect (bool), offer hooks (§1.4)
events: 'wanted' {level, prev, reason} (also 'wanted:change'), 'wanted:seen' {by},
  'wanted:report' {by}, 'chappal:throw' {x, y}, 'chappal:dodge', 'chappal:hit',
  'busted' {by, x, y}, 'wasted' {x, y}
save section 'wanted': {heat, curfewFloor, aunty network timers, used-today flags}
```

---

## 5. Shops and services

### 5.1 How shops work (shops.js)

- **Opening.** ACTION on foot within a shop place's r (default 18 u) opens a **tin-sign menu**: a
  DOM `.screen` in `#overlay` that pushes the `dialogue` state. The clock and the Chappal Meter
  pause (§4.1 `freeze`); traffic keeps moving.
  Each row shows the item, its price, an effect icon (chai glass +N, slipper −N, clock ▶▶) and,
  when it can't be bought, a greyed reason ("*Paise kam hain, beta*", "Finished", "Only in
  Ramzan").
- **Buying.** ACTION buys one. Food is eaten on the spot unless marked "carry". Money moves only
  through `N.player.money` and emits `shop:buy {place, item, price}` and `money {delta}`. The
  `shop_bell` / `cash` sfx and one shopkeeper line from bible §8.4 play (each shop has a 10 s line
  cooldown).
- **Quick order.** Holding ACTION for 0.5 s at a shop buys its **house item** (marked ★ below)
  without opening the menu.
- **Hours.** Outside opening hours the shop shows "*BAND*" (closed) with its opening time, and
  ACTION reads "Closed till 07:00". Carts are only present during their hours.
- **During missions** shops work unless the step sets `lockShops`. Mission items (the tin, the
  slam book, the biryani parcel) are scripted rows that show up only in their mission.
- **Shopkeepers are walk-ons.** The owners of real places (`gokul_chat`, `karachi_bakery`,
  `paradise`, `nimrah_cafe`...) are never named and never get story events (bible §1.5).

### 5.2 Irani cafés (`irani_cafe_1`..`irani_cafe_19` and their aliases)

Every Irani café serves **Irani chai and Osmania biscuits** (registry round 5).
- Locations: `nimrah_cafe`, `grand_hotel_abids`, `cafe_bahar`, `niloufer_cafe`, `garden_cafe`,
  `alpha_hotel`, `blue_sea_cafe`, `sarvi`, `irani_cafe_7` (Café Gulistan, the base café),
  `irani_cafe_8`..`16`, and `irani_cafe_19` (Café Noor-e-Iran, usable after M1 step 7).
- Hours: 05:00–23:30. The station cafés (`alpha_hotel`, `blue_sea_cafe`) stay open 04:30–01:00.

| Item | Price | Tummy & energy | Notes |
|---|---|---|---|
| ★ "*Do chai, ek plate Osmania*" | ₹8 (800) | +40 | the house combo (bible: chai ₹4 + Osmania ₹4) |
| Irani chai (*pauna*) | ₹4 (400) | +20 | `warm` 60 s |
| *Paani-kam* chai | ₹5 (500) | +22 | `warm` 90 s |
| Osmania biscuits, plate of 4 | ₹4 (400) | +20 | "Dunk the biscuit, don't drown it." |
| Bun-maska | ₹5 (500) | +25 | |
| Samosa (one) | ₹1 (100) | +10 | |
| Lukmi | ₹3 (300) | +15 | Old City cafés and `irani_cafe_19` only |
| Dil pasand | ₹3 (300) | +15 | |
| Cool drink, glass bottle (generic cola, orange or lemon; no brand shown) | ₹7 (700) | +15 | drink at the counter. Carry it away for +₹1 deposit, refunded at any kirana |
| Glucose water | ₹1 (100) | +40 | the THAK GAYA drink |
| Osmania packet (carry) | ₹10 (1000) | 3 x +15 | item `osmania_packet` |
| Haleem plate (Old City cafés, Ramzan 17:30–01:00) | ₹20 (2000) | +60 | `coma` 30 s |

| Service | Cost | Effect |
|---|---|---|
| **Family room** | an order ≥ ₹4 in the last 2 gm | sit 10 s → Chappal Meter −2 (§4.6) |
| **Sit with one chai** | ₹4 per hour, at most 3 | ▶▶ +1 gh per chai; energy fills. Waiter: "Two hours you'll sit for one chai? ...Okay, for you, one hour." |
| **Jukebox** | ₹1 | plays any found walkman song in the café, as an ambient emitter for 1 song |
| **STD booth** (`irani_cafe_7` only) | §5.4 | save and calls |
| THAK GAYA respawn point | — | §4.11 |

### 5.3 Kirana stores (`kirana_1`..`kirana_20`, 07:00–22:00)

`kirana_1` is Agarwal-ji's Sri Lakshmi Kirana.

| Item | Price | Effect / use |
|---|---|---|
| ★ Mango Masti (toffee) | 50 p | +2, or an item for bribing Chitti (max 9) |
| Poppins-style fruit sweets, roll | ₹1 | +4 |
| Glucose biscuits, small pack (carry) | ₹2 | +12; dogs love it (§11.3) |
| Cool drink, glass bottle | ₹7 + ₹1 deposit | +15 |
| Empty bottle return | — | +₹1 |
| Candles, pack of 4 | ₹5 | SA2 |
| Torch | ₹20 | item `torch` (needs batteries) |
| Batteries, pair | ₹8 | the torch works |
| Tennis ball | ₹10 | item `cricket_ball` (§8.4) |
| Turmeric packet | ₹3 | M8 ("Don't tell him it's from me.") |
| *Khaata* (credit, `kirana_1` only) | — | up to ₹10 (₹20 at job level 5) |

Services: **Hide behind the rice sacks** (§4.7); errands job (§9); the shop-window TV (cricket
Feb–Mar, Pasha's promos); the toffee-for-change gag (§2.4).

### 5.4 STD / ISD / PCO booths (`std_1`..`std_16` and the booth in `irani_cafe_7`, 07:00–23:00)

The yellow glass cabin shows a red digital meter that counts call pulses.

| Option | Cost | Effect |
|---|---|---|
| ★ **Save** | free | full save (`N.save.save({reason:'std'})`). "Check the meter, take the bill, next!" Refused during missions, minigames and chases at level ≥ 3 ("*Pehle* Mummy *ko sambhalo*, then save.") |
| **Call home** | ₹1 local (one 3-minute pulse) | Ammamma: a proverb, then the plain hint for the active clue (hint tier 1, §6.5). With no clue active, a family line. At level 1–2: −1 once per game-day |
| **Call Yadagiri's auto stand** | ₹1 | his auto arrives in 20 s at the nearest road; normal fare, or the ₹5 clue drop |
| **Call Nanna** (after 45 finds) | ₹1 | pillion fast travel (§3.6) |
| **Call Deccan Vani's request line** (after 3 dedication cassettes) | ₹1 | request a found song: it plays next on the radio and walkman band, and Shabnam Aapa reads "a farmaish from {nick} of Lakshmi Nagar" |
| **Trunk call to Kurnool** (Immu's Nani, after M5) | ₹5; ₹2 after 21:00 ("Come at night, the rate is less.") | one of 6 Nani lines (blessings and gossip) |

### 5.5 Barbers (`barber_1`..`barber_7`, 08:00–20:30, closed on Tuesdays [~])

| Item | Price | Effect |
|---|---|---|
| ★ Haircut | ₹10 | clears the Chappal Meter (§4.6); next hairstyle; 8 s with `scissors`. "Nobody will recognise you. Not even your Mummy." |
| *Champi* (head massage) | ₹5 | energy +30 (tummy unchanged); 6 s |

### 5.6 Cycle hire (`cycle_rent_1`..`cycle_rent_5`, 07:00–21:00)

| Option | Price | Vehicle |
|---|---|---|
| ★ Kid's cycle (small frame) | ₹3 per game-hour | `cycle` with `kid: true`: top 110, turn 3.6 |
| Big cycle (*kainchi* style) | ₹3 per game-hour | `cycle` (115) |
| Ladies cycle with basket | ₹3 per game-hour | `ladiescycle` (108); cargo damage −30% |
| Day cap | ₹10 if returned by 21:00 the same day | "*Poora din*, ten rupees." |
| Late | +₹3 per game-hour after 21:00 ("Late means double") | — |
| Not returned by 07:00 the next day | ₹16 charged at the next `cycle_rent_*` visit | the shop boy fetched it |
| **Return** | at any `cycle_rent_*` (ACTION "Return cycle", priority 1) | pay the hours |
| **Puncture fix** | ₹2, 2 s (tub of water, chalk mark) | — |

The cycle comes with the shop's name painted on the frame. Punctures: riding hired or owned
cycles on GROUND or SAND gives a 0.3% chance per second (about one every 5 minutes off-road). A
flat means top speed ×0.55 and a `puncture` hiss until it is fixed.

### 5.7 Video parlours (`video_parlour_1`..`video_parlour_4`, 10:00–21:00)

| Option | Price | Effect |
|---|---|---|
| ★ Brick game, Game A (bricks) or B (race) | ₹1 a game | `brickgame` minigame (§8.3). A win is a "free game": ₹1 back |
| High-score board | — | each parlour has 3 painted scores by colony kids (e.g. `TGR 2140` for Tiger). The first time Chinnu beats a parlour's top score, a parlour kid blips the nearest unfound goli for 60 s |
| "TV game" corner (famiclone with cartridges) | — | flavour only: kids crowd one TV; no gameplay |
| **Back door** | — | hide (§4.7) |

### 5.8 Bakeries

| Shop (ids, hours) | Item | Price | Tummy & energy |
|---|---|---|---|
| **Iyengar bakeries** (`iyengar_bakery_1`..`4`, 07:00–22:00) | ★ honey cake | ₹4 | +15 |
| | veg puff / egg puff | ₹4 / ₹5 | +20 / +22 |
| | cream roll | ₹3 | +12 |
| | fruit bread (carry, 2 uses) | ₹8 | +25 total |
| | dil pasand | ₹3 | +15 |
| | small plum cake (all year; SA8 needs 4 in December) | ₹5 | +15 |
| **Karachi Bakery** (`karachi_bakery`, 09:00–22:00) | ★ fruit biscuits, ¼ kg (carry; a gift for errands) | ₹20 | +30 if eaten |
| | fruit biscuits, ½ kg tin | ₹40 | M2 (the tin) |
| | Osmania biscuits, ¼ kg (carry, 4 uses) | ₹15 | +15 each |
| | dil khush | ₹3 | +15 |
| | plum cake (December) | ₹15 | +30 |
| **Subhan Bakery** (`subhan_bakery` = `bakery_1`, 08:00–21:00) | ★ Osmania biscuits, ¼ kg (cheaper "by the tin") | ₹12 | +15 each, 4 uses |
| | fine biscuits, ¼ kg | ₹10 | +10 each, 4 uses |
| **Other bakeries** (`bakery_2`..`bakery_4`, 08:00–21:00) | bun / cake slice / puff | ₹2 / ₹3 / ₹4 | +12 / +12 / +20 |

### 5.9 Carts (no paan or tobacco anywhere)

| Cart (ids) | Hours | Item | Price | Tummy & energy / effect |
|---|---|---|---|---|
| **Chai bandi** (`chai_bandi_1`..`8`) | 05:30–22:00 | ★ chai | ₹2 | +12 |
| | | bun / glucose biscuit | ₹2 / ₹1 | +12 / +6 |
| | `chai_bandi_6`, `_8` (lake, 16:00–21:00) | *bhutta* (lemon-chilli corn) | ₹3 | +15 |
| **Samosa bandi** (`samosa_bandi_1`..`7`) | 16:00–20:00 | ★ samosa | ₹1 | +10 |
| | | mirchi bajji | ₹1 | +8 |
| | | dozen small onion samosas (carry, 3 uses) | ₹5 | +14 each |
| **Dosa bandi** (`dosa_bandi_1`..`7`) | 06:30–10:00 (idli only until 11:00) | ★ plain dosa | ₹6 | +25 |
| | | idli (two) / vada | ₹3 / ₹2 | +15 / +10 |
| | | *karam podi* ghee dosa | ₹8 | +30 |
| | | *pesarattu* | ₹7 | +28 |
| **Coconut cart** (`coconut_cart_1`..`7`) | 09:00–19:00 | ★ tender coconut | ₹6 | +20, `cool` |
| | | with *malai* | ₹7 | +25, `cool` |
| **Banana cart** (`banana_cart_1`..`10`) | 07:00–20:00 | ★ one banana | ₹1 | +8; leaves a `banana_peel` |
| | | dozen (errands; `bargain who:'banana'`) | ₹12, bargained to ₹10 | +1 free banana (*kosaru*) |
| **Flower cart** (`flower_cart_1`..`12`) | 06:00–20:00 | ★ jasmine, one *moora* | ₹2 | item `jasmine` (§4.6) |
| | | marigold or rose garland (`bargain who:'flower'`) | ₹8 | errands (M6) |
| | | neem bundle | ₹1 | M8 |
| **Ice gola / kulfi cart** (roaming; at `school_*` gates and parks 11:00–18:00, 24 Apr–11 Jun; Numaish) | | gola / kulfi | ₹1 / ₹5 | +8 `cool` `gola` / +15 |
| **Sugarcane juice** (roaming in summer, 10:00–18:00) | | glass | ₹3 | +18, `cool` |
| **School-gate pani puri** (at `school_*` gates 15:30–19:00) | | small plate | ₹3 | +12 |

### 5.10 Gokul Chat (`gokul_chat`, 11:00–22:30, pure joy)

| Item | Price | Tummy & energy |
|---|---|---|
| ★ Pani puri (6) | ₹5 | +15 |
| Samosa-ragda (also as a parcel, M5) | ₹6 | +20 |
| Bhel puri / dahi puri | ₹5 / ₹6 | +15 / +18 |
| Kulfi | ₹5 | +15 |
| **Pani-puri challenge** | ₹5 | `panipuri` minigame (§8.6). A win gives a free plate (+15) and a Journal record ("Most puris: 23") |

### 5.11 Biryani, haleem and restaurants

| Place (ids) | Hours | Item | Price | Effect |
|---|---|---|---|---|
| `paradise`, `bawarchi` | 11:00–23:00 | ★ biryani plate | ₹30 | +70, `coma` 45 s |
| | | family pack (carry; missions) | ₹40 | M3, M8 ("The smell is free.") |
| `cafe_bahar`, `alpha_hotel`, `hotel_niagara`, `shadab_hotel` | 11:00–23:00 | biryani plate | ₹28 | +70, `coma` |
| `pathergatti` (Hotel Madina), `shah_ghouse`, `pista_house`, `sarvi`, `hotel_nayaab` | **Ramzan** (27 Oct–25 Nov) 17:30–01:00 | haleem plate | ₹20 | +60, `coma` 30 s |
| `hotel_nayaab` | 05:00–08:00 | nihari with bread | ₹15 | +50 |
| `taj_mahal_hotel_abids` | 06:30–21:30 | idli, dosa, filter coffee (veg tiffin) | ₹3–8 | +15 to +30 |

### 5.12 Famous Ice Cream (`famous_ice_cream`, 11:00–23:00)

| Item | Price | Effect |
|---|---|---|
| ★ Scoop (sitaphal Sep–Dec, mango May–Jun, otherwise vanilla or kesar) | ₹8 | +20, Chappal Meter −1 (once per 10 gm) |

### 5.13 Rythu Bazaars (`rythu_bazaar_mehdipatnam`, `rythu_bazaar_erragadda`, `rythu_bazaar_saroornagar`, 06:00–13:00)

Farmers' sheds. Every price is 20 to 30% below the kirana's, which is the point of a Rythu Bazaar.
"*Tamata kilo aaru!*"

| Item | Price | Notes |
|---|---|---|
| Tomatoes | ₹6/kg | bible; cargo-sensitive (bruises, §8.13) |
| Onions / potatoes | ₹8 / ₹7 per kg | |
| Brinjal | ₹6/kg | |
| *Kosaru* (coriander + curry leaves) | free with any ₹10 bought | "*Kosaru kaavala, babu?*" |
| Snack: cucumber / guava / mango (May–Jun) | ₹1 / ₹2 / ₹5 | +8 / +10 / +20 |

Services: the aunties' shopping-list job (§9); `bargain who:'farmer'`; M7 and M9.

### 5.14 Everyday services

| Shop (ids, hours) | Items and services | Price | Effect |
|---|---|---|---|
| **Pindi girni** (`pindi_girni_1`..`7`, 08:00–19:00; stops during power cuts) | grind wheat (errands) | ₹2/kg | jobs (§9), M6 |
| | fresh atta, 1 kg | ₹10 | errand item |
| | **chilli day** (Tuesdays): standing within 20 u makes Chinnu sneeze every 6 s | — | cosmetic; "Chilli day today. Stand back, you'll sneeze." |
| **Stationery** (`stationery_1`..`8`, 08:00–20:30) | long notebook / pencil / eraser / sharpener | ₹10 / ₹1 / 50 p / ₹1 | flavour, school errands |
| | brown cover paper, 10 sheets + labels | ₹10 + ₹2 | SA7 |
| | geometry box / sketch pens (12) | ₹30 / ₹15 | flavour |
| | slam book | ₹25 | M11 |
| | xerox | ₹1 a page | flavour |
| | ★ **"Guide Map of Twin Cities"** | ₹10 | item `city_map`: every shop and service icon on the full map, with hours |
| **Medical shop** (`medical_shop_1`..`8`, 08:00–22:30) | ★ plaster | ₹1 | cures `knee` |
| | Churan goli digestive candy (5) | ₹1 | +2 |
| | glucose powder (carry, 3 uses) | ₹10 | +25 energy, +10 tummy each |
| | balm (SA3), Ammamma's tablets (M6) | ₹5 / scripted | errands |
| **Photo studio** (`photo_studio_1`..`6`, 09:30–20:30) | ★ develop frames | ₹2 a frame (bible) | prints ready after 2 game-days or after the next mission |
| | passport photo | ₹15 | M11 (scripted) |
| | studio portrait with a painted backdrop (Kashmir lake, Taj, Charminar) | ₹10 | a Journal sticker per backdrop (cosmetic) |
| **Internet café** (`internet_cafe_1`..`6`, 10:00–22:00; free roam from M9) | 15 minutes (a 15 s on-screen timer) | ₹5 | "Browse": opens one unread trivia card for a place Chinnu has visited |
| | 1 hour (60 s timer) | ₹20 (bible) | read emails (story: M11, SA8). "Reading is free. Crying is also free." |
| **Chappal Bazar** (`chappal_bazar`, 09:00–21:00) | hawai chappals, a pair | ₹15 | cures `limp` (M10) |
| | ★ ladies' *kotha chappal* | ₹25 | item `kotha_chappal` (§4.6) |
| **Kite stalls** (`kite_stall_1`..`3`; 1 Jan–15 Feb 08:00–20:00; rest of the year only `kite_stall_1`, 10:00–18:00) | tukkal / patang / big kite | ₹2 / ₹3 / ₹5 | each kite owned = +1 kite-minigame life, max 5 |
| | ★ charkhi of cotton *saddi* | ₹10 | `bargain who:'kite'`; "Cotton only." |
| | sell *lootna* kites | +₹1 each | §9 |
| **Raag Recording Centre** (`recording_centre_1`, 10:00–23:00) | copy a cassette | ₹30 | M12 (bible) |
| **Meat shops** (`meat_shop_1`..`7`, Sundays 07:00–12:00) | the Sunday queue (shopfront, cages and queue only) | — | SA3 only; Chinnu never buys and the inside is never shown |

### 5.15 Cinemas, shows and outings

**Cinemas**

- Places: RTC X Roads (`sandhya_theatre`, `sudarshan_theatre`, `odeon_theatre`,
  `devi_theatre`), plus `ramakrishna_theatre`, `shanti_theatre`, `liberty_theatre`,
  `sangeet_theatre` and `anand_theatre`.
- Shows: 11:00, 14:30, 18:00 and 21:00, plus a 06:00 first-day show on Fridays (release day).
- Tickets: ★ floor ₹10 (bible), balcony ₹25.
- Watching: a cutscene card with the fictional film's poster (*Toofan Tammudu*, *Mass Maharaju*
  and 6 more invented titles). It takes +3 gh, sets energy to 100, costs −15 tummy and lowers the
  meter by 2 (§4.6).
- Canteen: popcorn ₹5 (+12), samosa ₹2 (+10), cool drink ₹7.
- Queue cage (§8.12) on first-day shows; 30% chance of HOUSEFULL on weekends.
- The Odeon "black ticket" tout only says his line. Black tickets are never for sale.

**Shows and outings**

| Place | Hours | Price | What it does |
|---|---|---|---|
| **`prasads_imax`** | before Fri 25 Jul: tin fence "COMING SOON". From 25 Jul: 10:00–23:00 | giant-screen show ₹50 (kid) [~] | Cutscene ("the screen so big it has no edges") with fictional documentaries rotating: *Giants of the Deep*, *Planet of Ice*, *Into the Volcano*; +1 gh, energy +20. **Lobby AC:** stand 10 s → `cool` 5 gm and meter −1 (once a day). Food counter: popcorn ₹10 (+12), cold coffee ₹15 (+15). Viewpoint from the lobby window (§8.14) |
| **`ntr_gardens`** (open since 2001) | 15:00–21:00 weekdays, 10:00–21:00 weekends | entry ₹5 [~]; **mini train ₹5** (bible) | The train is a 45 s seated ride round the gardens past the concrete Machan tree and the waterfall; it works as a viewpoint for the K7 area. Snack kiosk: corn ₹3, ice cream ₹8 |
| **`lumbini_park`** | 09:00–21:00 | entry ₹2 [~]; boats ₹10 (§3.7) | Musical fountain at 19:00 and 20:00 (a 2-minute show; sitting to watch doubles energy recovery). Balloon seller ₹2 (`balloon`). Ice cream ₹8 |
| **`nampally_exhibition`** (Numaish) | 1 Jan–15 Feb, 16:00–22:30 | entry ₹5 [~] | Giant wheel ₹5 (viewpoint), toy train ₹3 (ride), *maut ka kuan* ₹5 (watch: a loud cutscene), mirror house ₹3 (Chinnu's sprite stretches comically for 10 s), Delhi papad ₹10 (+20), cotton candy ₹3 (+8, `sugar`), whistle, balloon or goggles ₹5 (cosmetic). Lost-and-found counter (C11). Closing music at 22:15 |
| **Museums and parks** | — | — | `state_museum` (10:30–17:00, closed Fridays) ₹2 [~], walk only. `salar_jung_museum` (10:00–17:00, closed Fridays) ₹5 [~]; the musical clock strikes on the hour (SA5). `birla_planetarium` sky show ₹10 [~] at 11:30, 16:00 and 18:00 (a stars cutscene, +30 gm). `nehru_zoo` (08:30–17:00, closed Mondays) entry ₹5, safari bus ₹10, toy train ₹3. `golconda_fort` (09:00–17:30) entry ₹5 (bible token) and the `golconda_sound_light` show at 18:30, ₹10. `qutb_shahi_tombs` ₹2, respect. `public_gardens` is free |
| **Gated in 2003** | — | — | `chowmahalla_palace`, `falaknuma_palace`, `king_kothi`, `hill_fort_palace`, `rashtrapati_nilayam`, `errum_manzil`, `secunderabad_club`: gate and walls only. A watchman says "*Band hai, beta.*" |

### 5.16 Bus hubs and stations

| Place | Services |
|---|---|
| **`koti_bus_stand`** | ★ Bus routes (§3.6). Ticket Thatha's bench: show him found tickets to unlock their stops (automatic) and hear the stop's trivia. Auto stand. `chai_bandi` nearby |
| **`imlibun_bus_station`** | ★ Bus routes. Long-distance enquiry window (flavour: "Kurnool? Bay 12."). Ramoji trip (post-game). Platform chai ₹2 |
| `rathifile_bus_station`, `mehdipatnam_bus_terminus`, `gowliguda_hangar` | ★ Bus routes |
| **`nampally_station`**, **`kachiguda_station`**, `secunderabad_station` | ★ **Platform ticket ₹3** (bible): the platform is a walk-only shortcut, and the gate checker blocks it without a ticket ("Platform ticket, *beta*. Three rupees."). One ticket lasts the game-day at that station. **Weighing machine ₹1**: a printed card with Chinnu's weight and a "fortune" that is really a hint ("Your lucky direction: north-east. Lucky colour: green."): the compass direction and series colour of the nearest unfound collectible. **Railway book stall**: Twinkle Tales ₹8, Chanda Kathalu ₹6 (opens a comic-page trivia card). Railway tea ₹2 (+12) |
| `electronics_shop_1` and kirana windows | A TV in the window with a crowd on the footpath: a crowd zone (§11.5) |

### 5.17 Places of worship (respect zones, §4.8)

Prasadam and langar as in §2.2. Temples, mosques, dargahs, churches, the gurudwara and the
ashurkhana sell nothing and host no jobs or minigames. In December the church compounds take
SA8's plum cakes at their gate tables.

### 5.18 Economy check (1 real hour of normal play)

| | Typical |
|---|---|
| Earn: 2 missions (₹25), 4 job runs (₹20), side wins (₹8), a threshold (₹5) | ≈ ₹58 |
| Spend: 4 café stops (₹32), 4 buses (₹12), one cool-down (₹10) | ≈ ₹54 |
| Result | a little ahead. Money matters, no grinding is needed, and a broke kid can always eat free at home |

---

## 6. Missions framework

### 6.1 Givers and markers

| Rule | Value |
|---|---|
| Main missions | M1 to M12 unlock in order (`requires` = the previous one). **Only one main giver is visible at a time.** Its minimap blip is a yellow `giver` diamond with a pulse, and the full map labels it with the track title ("TRACK 05 · RIGHT, RIGHT!") |
| Giver marker | a yellow pulsing cylinder (`#f2c230`), r 14 u. Goal markers are pink `#ff5fb0` (ARCHITECTURE) |
| Starting | walking into the marker shows a J-card prompt: `TRACK 05 · RIGHT, RIGHT! — ▶ PLAY (ACTION) / Not now (step out)`. ACTION, or standing in the marker for 1.0 s, starts it. Stepping out cancels, so nobody starts a mission by accident |
| **Date jump** | starting a main mission moves the clock to its scheduled date and time (bible §1.4) with a VHS ▶▶ (1.5 s) and sets the festival flags. The clock never goes backwards (the elastic calendar, §10.5, guarantees this) |
| Side activities (SA1–SA8) and jobs | givers show as yellow `giver` blips **only during their time windows** and only while no main mission is running. Up to 3 side blips show at once (the nearest) |
| Time windows | a mission or activity reached outside its window: the marker reads "Come back at 16:00", and ACTION offers "Wait till 16:00 (▶▶)" at a bench, café or `home` |
| Clue givers | M2's giver is Immu's chit: the target place (`mozamjahi_market`). The objective line shows the riddle until it is solved (§6.5) |

### 6.2 While a mission runs

| Rule | Value |
|---|---|
| HUD | objective text at the top centre; a pink route on the minimap for `goto` targets; a timer for W2 steps (§8.13), with a tick sfx and red digits for the last 10 s |
| Shops | allowed unless the step sets `lockShops` |
| STD booths | calls allowed; **saving is refused** ("Save after the mission, *beta*.") |
| Side givers and jobs | hidden |
| Collectibles | still collectible |
| Chappal Meter policy per step | `normal` (default) / `frozen` (escort, respect, cutscene steps) / `scripted` (M3's climb, M12's lock at 5) |
| Abandoning | more than 1500 u from the current objective for 60 s during a non-travel step, or "Quit mission" from pause → the mission aborts silently (no penalty) and its giver marker returns |
| Pausing | Esc works anywhere; the clock and timers stop |

### 6.3 Failing, retrying and checkpoints

| Rule | Value |
|---|---|
| Fail | `m.fail(reason)` → banner **MISSION FAILED** with a reason line written in voice (e.g. "*Atta* on the road? The crows will be very happy."), then `N.hud.ask`: **[Retry from checkpoint]** (ACTION) / **[Free roam]** (Esc) |
| Costs | **failing never costs money**. Purchases made before the checkpoint are kept (fast-forward retries skip `m.money` and `m.give`; ARCHITECTURE §11) |
| Checkpoints | per the bible for each mission (e.g. M1 `terrace`, `cafe`, `gulzar_houz`). Retry teleports to the checkpoint and puts the player back in a vehicle of the same type |
| What can fail (bible) | minigames (they offer their own retry first), the M3 queue cage (HOUSEFULL), M6 and M9 cargo (below 40), M9 tiffin late (after 13:00), M10 escort abandoned for 60 s. Being caught, being late and THAK GAYA **never** fail a mission unless it is flagged |
| **Help after repeated fails** | **3 fails** in a row of the same story minigame → the ask card adds "Let Immu do it" (or Ayesha for cricket, Ammamma for the clap). It passes with 1 star and a teasing line. **2 fails** in a row of a timed step → timer +25% (shown as "Bunty-anna says: extra time"). Settings can switch this off |
| Re-entering after a fail | the player must step out of the marker before it can restart (ARCHITECTURE §11) |

### 6.4 Rewards and the end of a mission

1. **● REC**: the HUD shows `● REC`. Press ACTION within 8 s (it auto-fires after that).
   `N.audio.rec(sfx)` plays and the tape counter rolls to the bible's value (083 … 999).
2. **MISSION PASSED** banner (`kind: 'pass'`, 3.5 s) with the **J-card line** and Immu's scribble.
3. **Reward**: `m.money` (bible amounts) with a `cash` sfx and a "+₹10" money pop, items and
   flags, and a toast list of unlocks (e.g. "Bus fast travel unlocked").
4. **Diary page flip** (1.5 s): Chinnu's tall tale and Vimala Ma'am's red ink, added to the
   Journal.
5. **Autosave** (`reason: 'mission'`) with the toast "SIDE A saved ●".
6. The next giver appears, and free roam goes on at the mission's end time and date.

### 6.5 Clues and hints

Clue text appears as the objective (in Immu's handwriting font) and on the Journal "Clues" page,
which also records the hints taken.

| Tier | Who / where | Cost | What it gives | Limits |
|---|---|---|---|---|
| 1 | **Ammamma**: ACTION on the verandah swing at `home` (06:00–21:00), or "Call home" at any `std_*` | free at home; ₹1 by phone | a proverb, then the plain hint (bible text per clue). The objective line is upgraded to the hint | any time |
| 2 | **Yadagiri-anna's auto**: horn "AUTO!" near a road | ₹5 | a ride to within 150 u of the answer (nearest road point) | not while a chaser at level ≥ 3 is active; never for clue 5 |
| 3 | **Aunty network**: ACTION "Ask aunty" at any aunty ped at a colony gate (colony districts, 07:00–20:00) | free, **+1 meter 10 gm later** | the answer is blipped on the map | — |
| 4 | **Ask the city** (Old City clues and M12): talk to locals | free | **the third different local asked always answers**; the first two deflect with funny lines | Old City districts only |
| — | **Clue 5 (Golconda)** | — | hint tiers switched off: "Even Yadagiri doesn't know. Ask someone who was young in 1961." It is solved in story (M6) | bible |

**Timed nudges** (free, automatic). Real seconds count while the clue is the current objective
and the game is in `play` mode:

| After | Nudge |
|---|---|
| 180 s | the objective line adds "(Stuck? Ammamma knows. Call home from any STD booth, ₹1.)" |
| 360 s | the minimap draws a dashed **search circle** of radius 600 u that contains the answer (centre jittered up to 300 u from it) |
| 600 s | the circle shrinks to 300 u (jitter 120 u) |
| 900 s | the Journal clue page shows Immu's PS: "PS: it's <display name>. Over." |

The setting **Hint nudges: Off / Normal / Fast (half the times)** controls them. Difficulty
presets scale them (§14). Lock riddles (L1–L4) need no hints: wrong answers repeat the choice
("Count again, walk round it.").

### 6.6 Side activities (SA1–SA8)

They follow the bible (§7): windows, rewards and lines. Systemic rules:
- None can fail permanently. A failed attempt can be retried at the next valid window, or the same
  window after 2 gm.
- They pay through `m.money` and do not autosave. A save at an STD booth keeps the progress.
- They use the same marker, fail and retry flow as missions (registered with `kind: 'side'`).

---

## 7. Collectibles

### 7.1 Series

| Series | Count | Unlock (bible) | Pickup | Feedback (sfx + toast) | Journal page |
|---|---|---|---|---|---|
| **Rooftop kites** (`kite_1`..`12`, K1–K12) | 12 | M1 step 6 (K1 on the fountain railing teaches pickups) | walk over, r 10 u | `kite_wind` + `pickup`; "KITE 3/12 · Tag: 'Next: four tall uncles…' (J)" | Kites: the tag riddle for the next kite |
| **Golis** (G01–G30) | 30 | after M1 | walk or cycle over, r 10 u | `marble` (two clicks); "GOLI 14/30 · Red swirl" | Golis: the hint list (bible §6.2) |
| **Cassettes** (`cassette_1`..`16`, C01–C16) | 16 | from the start (with the walkman) | walk over, or ACTION "Look" for those inside shops | `tape_click` + 2 s of the song or memo; "CASSETTE 5/16 · *Neon Monsoon* (Q to play)" | Cassettes: play, plus the dedication text |
| **Ticket Thatha's tickets** (T01–T12) | 12 | M5 | walk round **behind** the bus-stop board, r 10 u | `paper` + punch click (`keys`); "TICKET 7/12 · Stage 7 unlocked for buses" | Tickets: the stage riddle and its trivia card |
| **Frames** (F01–F23, + F24 in M12) | 23 | end of M1 (`camera`) | ACTION **"Click"** within 40 u of the spot, facing the subject within 60°, outside respect zones | `camera_flash` + film advance; "FRAME 9/24 · Develop at Raj Colour Lab" | Nanna's album, filled after developing (₹2 a frame) |

- Total collectibles = **93**. The lock digits (4) are story items solved by choices.
- Items appear in the world only once their series is unlocked (not drawn and not collectible
  before).
- Found state is saved. Missed ones stay collectible in the post-game.

### 7.2 Pickup rules

- Collectibles are picked up on foot and on bikes. In cars and autos the prompt says "Get out to
  pick up" (16 u); picking up at speed would ruin the hunt.
- **Glint:** every 3.5 s a 0.3 s star twinkle, visible within 90 u (setting: Glints on/off). The
  glint is drawn at the item's height, so it is occluded the same way the item is (§7.3).
- **Beacon:** `N.audio.beacon` hot/cold beeps within 120 u of the nearest unfound item of an
  unlocked series (setting: Beacon on/off, default on; bible §6).
- On pickup: a burst of 10 sparkles, the HUD counter flashes, and the Journal tab gets a "!"
  badge until it is opened. Thresholds pay out at once with a toast (§7.4).
- `N.emit('collectible', {series, id, n, total})`.

### 7.3 How things are hidden

| Technique | How it works (engine) | Examples (bible ids) |
|---|---|---|
| **Pseudo-3D occlusion** | Tall walls lean away from the screen centre and cover the ground beyond them (render.js projection). Items sit 6 to 14 u behind a building of height ≥ 20 u, on the side away from the usual approach road. They show only when the player walks round | K4 behind the LB west stand, G07 behind Mozamjahi's back steps, K2 on the hangar's back rib |
| **Roof zones** (walled terraces reached by stairs) | A roof zone is a polygon with a height `h`, entered from a stair strip. On the roof the player is drawn at `h` and collides with the parapet (no edges, no falls). Items on roofs are only pickable from the roof | C13 (`home_terrace` water-tank lid), the M1 lootna terraces, SA2 and antenna-job terraces, the Patang Chacha roof in the ending |
| **Tree canopies** | A canopy at h 12 to 20 covers items under it; it fades to 40% alpha when the player is within 24 u | G06 banyan roots, K5 neem by the Birla stairs, G20 KBR trail |
| **Behind boards and stalls** | the painted panel faces the road; the item is on the back (north) side | all 12 tickets; K3 behind the giant wheel's ticket box |
| **Inside shops** | the item is "in" the shop; ACTION "Look" (priority 4) when the shop's item is unfound | C02 STD meter, C07 recording centre counter, C14 Café Gulistan jukebox, C08 Blue Sea table |
| **Riverbed and under bridges** | SAND under the bridge decks (bridges are drawn above the sand) | G08 Naya Pul, G09 Purana Pul, G10 Chaderghat |
| **Rocks and boulders** | items on top of or in the crack of a `rocks[]` boulder; reachable on foot | K10 the buffalo boulder, G14, G27 |
| **Water / boat only** | seen or clicked from a boat | F07 Buddha |
| **Time-gated** | present only at certain times | C10 Sundays only (Abids book market), K6 moves from the fence gap to the forecourt palm on 25 Jul, C11 after M2 |
| **Gated-place hills** | outside locked gates, on the hill path | K12 below Falaknuma's gate |
| **Viewpoint reveals** | §8.14: at a viewpoint, unfound items within 900 u get blips for 180 s | giant wheel (K3), Bala Hissar (K11), Birla parapet (K4–K7), Prasads lobby (K6, K7), Falaknuma gate (K12) |

Rules for placers: never inside respect zones (bible: no collectible on the Moula Ali hill), never
in water, never needing a fall or a vehicle stunt, never on the road carriageway (footpath,
plaza, park, sand, roof or rock only).

### 7.4 Series rewards (bible §6, restated for implementation)

| Series | Threshold → reward |
|---|---|
| Kites | 4 → ₹10. 8 → `charkhi` (kite minigame: +1 life, green tension band +10%). 12 → Patang Chacha's M12 line changes and the full kite train in the ending |
| Golis | 10 → ₹10 and *Marbles vs Tiger* at `playground_14`. 20 → `raja_goli` (marbles: striker mass +25%, aim guide +30%). 30 → ₹50, Journal title "Goli King of Hyderabad", marble pouch on the sprite |
| Cassettes | each → its song or memo. 6 → ₹10. All 12 dedications → Chinnu's own farmaish on the flight night. All 4 Agent tapes → Imran's "promoted" line in 2026 |
| Tickets | each → its stop for bus fast travel. 6 → ₹20. 12 → `ticket_punch` (free buses) and Ticket Thatha on the plaza in the ending |
| Frames | 8 prints → ₹15. 16 → Nanna's captions in the album. 23 → Raj-uncle frames the best print on Café Gulistan's wall; title "Colony Photographer" |

### 7.5 Total-finds ladder: unlocks at home

The count is all series together (out of 93) and does **not** need the prints to be developed.
Each unlock appears at `home` with a family line and a toast.

| Total finds | Unlock | Line |
|---|---|---|
| 5 | **Double-gong bell** for any cycle Chinnu rides: horn reach 80 u instead of 60 (cows and peds move sooner) | Ammamma: "Ring it softly near old people, *kanna*." |
| 12 | **Chinnu's own cycle** (`chinnu_cycle`: second-hand black roadster, top 122, carrier with cargo damage −25%), parked at home each morning | Nanna: "Second-hand. First owner was a doctor. Ride like one." |
| 20 | **Dynamo light** on Chinnu's cycle: night headlight pool, 70 u | Nanna fits it: "Pedal faster, brighter light. Physics." |
| 30 | **Family Chetak permission** (no meter when taking it, §3.3) | Nanna: "Only in the colony. ...And to Immu's. And back." |
| 45 | **Call Nanna** pillion fast travel from any STD booth (§3.6) | Nanna: "Phone from a booth. I'll come. Don't tell Amma I said yes." |
| 60 | **Bunty's RX100 on any day** (needs SA6 R4; otherwise it waits until R4 is done) | Bunty: "Helmet. Always. Nostalgia means 'helmet' today." |
| 75 | Golden streamers on the handlebars, a golden bell (cosmetic); Journal title "*Hyderabad ka Khabri*" (the city's insider) | Chitti: "Annayya's cycle is prettier than me. Unfair." |
| 93 | **Everything found**: free chai and Osmania for life at `irani_cafe_7`; in the 2026 epilogue Café Noor-e-Iran's wall shows a framed city map with every dot | Salim-bhai: "*Phokat*, forever. Faramarz-bhai will be jealous." |

### 7.6 Collectibles API (collectibles.js)

```
N.collectibles: SERIES {kites, golis, cassettes, tickets, frames} (defs from bible §6),
  isFound(id), found(id) (marks + rewards), count(series), total(), unlocked(series),
  nearestUnfound(x, y, series?), reveal(x, y, r, sec), glints (bool), beacon (bool)
events: 'collectible' {series, id, n, total}, 'collectible:threshold' {series|'total', n}
save section 'collectibles': {found: [ids], prints: [frames developed], pendingPrints: [{id, readyDay}]}
```

---

## 8. Minigames

### 8.0 Shared rules (minigames.js overlay games)

- **Flow:** `N.minigames.play(id, params)` → how-to card (skippable after the first play; `intro`
  carries the story line) → play → result card (stars 0–3, score, a line) → [Retry] / [Done].
  `m.minigame()` resolves with `{win, score, stars, quit, ...}`.
- **Difficulty** `d` runs 0..1 (default 0.4). The final value is the story or job value, plus the
  preset offset (§14), minus 0.15 with **Assist** on, clamped to 0.05–0.95.
- **Assist** (setting, default off): every timing window ×1.5; −0.15 difficulty; in clap and
  cricket the beat marker is shown ahead of time.
- **Pause** with Esc / Start / the pause pill. **Quit** counts as a loss (`quit: true`) unless the
  story passes `noQuit`.
- **Pay:** a free-play win pays at most **3 times per minigame per game-day** (§2.4). Story
  minigames pay through the mission, never through the minigame.
- **Gamepad:** A = the main action; stick or d-pad = directions; B = the secondary action; Start =
  pause.
- **Touch:** each game draws big on-screen buttons (min 64 px) plus tap-anywhere where it fits.

### 8.1 Kite fight, `kite` ("*Bo kaata!*")

| | |
|---|---|
| Used in | M1 (`target: 1`, `d: 0.25`, "Cotton saddi only. Cut one kite."); free play on `home_terrace` and at `gulzar_houz` while `sankranti` is on (13–15 Jan), and on Jan–Feb evenings 16:30–18:30 |
| Controls | ←/→ (A/D) turn; hold Space / ↑ / W / Shift to **pull** (*khench*); let go for slack (*dheel*). Touch: ◀ ▶ and hold KHENCH. Pad: stick turns, A or RT pulls |
| Rules | Chinnu's kite darts where its nose points while pulled and drifts with the *hawa* (wind) when slack. Crossing a rival's manja starts a **pech**. During a pech, **pulse** the pull to keep the tension needle in the **green band** (width 35% − 15%·d of the gauge). The higher kite gains 1.3x cut rate. Over-pull (needle in the red for 0.4 s) **snaps** your own manja. Gusts every 6–10 s spike the tension: give *dheel* |
| Numbers | Lives = **3 patangs**, +1 per extra kite owned (max 5), +1 with `charkhi`. Time limit `95 − 15·d` s. Target cuts `round(2 + 3·d)` unless set. Rivals: 2–4 kites, more aggressive as d rises |
| Win / lose | cut the target before time / lives or time run out |
| Reward | free play ₹2 per cut (max ₹10 a day; bible) |

### 8.2 Clap and rhythm, `clap` (skins `golconda`, `drums`, `doorway`)

| | |
|---|---|
| Used in | M7 (`skin:'golconda'`, `rounds: 3`); M8 (`skin:'drums'`, 1 round each × 3, `noQuit`); M12 (`skin:'doorway'`, `rounds: 1`); free play at `golconda_fateh_darwaza` (09:00–17:30) |
| Controls | Space / J / F / K / D / ↑ / ↓ / Enter claps; click anywhere. Touch: TAALI button or tap anywhere. Pad: A or any face button |
| Rules | **SUNO (listen):** the guide (Immu, the drummers) claps a rhythm of n notes on an 8-slot bar (16 slots from 6 notes up) at **90 + 30·d bpm**. Then 4 count-in ticks. **AB AAP (your turn):** clap the same slots. Timing windows: perfect ±45 ms, good ±90 ms, ok ±140 ms. A missing note or an extra clap is a mistake, and a round with a mistake costs one of the **3 *mauke*** (chances): "*PHIR SE SUNO*" and the round replays. Notes per round = `min(9, 3 + round + (d > 0.7 ? 1 : 0))`. At d ≥ 0.55 the notes are hidden during your turn |
| Skins | **golconda:** every clean round lights a lamp up the hill to the Bala Hissar, and the echo comes back delayed 0.35 s (`clap_echo`). **drums:** dappu strokes; you "keep step" with the Bonalu drummers; a mistake makes Amma's bonam wobble (no fail; the `noQuit` round just replays). **doorway:** one call-and-answer; Immu answers from the storeroom |
| Win / lose | finish all rounds / lose all 3 chances |
| Reward | story only. Free play at the gate: a "Golconda heard you" toast, no money |

### 8.3 Brick game, `brickgame` (the "9999-in-1" handheld)

| | |
|---|---|
| Used in | `video_parlour_1`..`4`, ₹1 a game |
| Controls | ←/→ move; ↓ soft drop; ↑ or Space rotate (race: hold for turbo). Touch: the handheld's ◀ ▶ ▼ and the big red ROTATE. Pad: d-pad, A rotate, B drop |
| Game A, bricks | Falling-block puzzle on a 10 x 20 LCD grid. Clear rows. The speed level starts at `1 + round(3·d)` and rises every 5 lines. Target lines `round(5 + 7·d)`. Lose when the stack reaches the top |
| Game B, race | Dodge oncoming cars across 2 lanes; turbo doubles the speed. Target cars passed `round(22 + 25·d)`. **3 lives** |
| Win / reward | reach the target → "FREE GAME" (₹1 back); high scores on the parlour board; the first time Chinnu beats a parlour's top score, a goli tip (§5.7). **No other money**, so the parlour can never be farmed |

### 8.4 Gully cricket, `cricket`

| | |
|---|---|
| Used in | M4 (`target: 18`, `overs: 2`, `wickets: 1`, "Last man batting"); SA4 (`bowler:'ayesha'`, d +0.2); every `playground_*`, `victory_playground` and `musi_riverbed` (16:00–18:30 on school days; 08:00–18:30 on holidays and Sundays); the job ladder (§9) |
| Controls | ← **pull** (leg side), ↑ / W / Space **drive** (straight), → **cut** (off side). Touch: ◀ PULL, ▲ DRIVE, CUT ▶. Pad: stick left, up or right + A, or X / A / B |
| Rules | The bowler runs in and the ball pitches. Swing when it reaches the glowing ring at your feet. **Windows:** perfect ±(0.045 + 0.02·(1−d)) s, good ±(0.095 + 0.03·(1−d)) s, edge ±(0.15 + 0.03·(1−d)) s. Playing the line (the shot's direction matching the ball's line) is needed for the best results. **Outcomes:** perfect + right line → hits a wall hard = **4**, over the low right wall = **6**; good → 1 or 2 runs; edge → 40% caught; miss on a straight ball → **bowled** (the brick-pile stumps) |
| House rules | **one-tip-one-hand** catches are out; a ball into **Aunty's compound** (the left wall) is OUT and the batter fetches it; no LBW. **Owner of the ball bats first:** with `cricket_ball` in the inventory, the first dismissal is a "trial ball" and doesn't count (free play only) |
| Numbers | Balls = overs × 6 (default 2 overs). Wickets 2 (1 if d > 0.75). Target `round(13 + 14·d)` unless set |
| Win / lose | reach the target / run out of balls or wickets |
| Interruptions | in Public Gardens the *mali* appears once per match ("*Ghaas pe nakko khelna!*"), pausing it 3 s. No penalty |
| Reward | free play: ₹2 a win, ₹5 a 3-star win (3 paid wins a day) |

### 8.5 Antenna tuning, `antenna`

| | |
|---|---|
| Used in | M4 (`time: 40`), SA2, `job_antenna` (§9); free play at `home` and `friend_home` terraces (no money) |
| Controls | hold ←/→ to turn the rusty antenna (40°/s); tap for a 2° nudge; Space / ↑ / W = **SHOO** crows. Touch: hold ◀ ▶, tap to nudge, SHOO! Pad: stick or d-pad, A shoos |
| Rules | The TV shows snow → a ghosted picture → a clear picture as the signal quality rises. Quality peaks at the bearing of the `doordarshan_kendra` tower. There are **1–2 false peaks** (reflections from buildings) at 60–80% height. Amma or Babji call "*thoda left*" / "*thoda right*" from the slope of the quality curve, with a 25% chance of the wrong direction at d > 0.6 ("Reflections fool even Babji"). **Lock:** keep quality ≥ 85% for 2.5 s. **Crows** land every 8–12 s and knock the antenna 5–10° off; SHOO them |
| Numbers | time limit `60 − 15·d` s unless set |
| Win / lose | lock before time / "*Signal gaya!*" at time out |

### 8.6 Pani-puri challenge, `panipuri`

| | |
|---|---|
| Used in | M5 (`target: 12`); `gokul_chat` challenge (₹5); Numaish (₹5) |
| Controls | Space / ↑ / W / Enter / E (or tap the puri) to **eat** (*KHAAO!*); ↓ / S / N / X to skip with **NAKKO**. Pad: A eat, B skip |
| Rules | Bhaiya drops a puri into your *dona* every `1.6 − 0.6·d` s. Each has a ring timer: eat while it is **green** for a crunch; too late and it goes soggy and breaks (a miss). **Red = teekha** (spicy): double points but +34 on the spice meter; skip it with NAKKO. **Brown = meetha** (sweet): −25 spice. Spice falls 6/s. Spice at 100 = "PAANI! PAANI!": a miss and spice resets to 50. **3 misses** and you're out |
| Numbers | target `round(18 + 12·d)` unless set |
| Win / reward | eat the target. At Gokul: a free plate (+15) and the record kept. Story: M5 decides who pays for Nani's parcel |

### 8.7 Bargaining, `bargain` (*mol-bhaav*)

| | |
|---|---|
| Used in | M1 (`who:'kite'`), M7 (`who:'farmer'`), SA7 (`who:'books'`), autos (`who:'auto'`), banana and flower carts, the Rythu Bazaar job |
| Controls | 1 / 2 / 3 (or ←/→) picks a line; Space / Enter / E says it when the confidence needle is **green**. Touch: tap a line, then tap the screen on green. Pad: d-pad, A |
| Rules | The seller starts high. Bring him to the **target** price before his ***SABR*** (patience, 100) runs out. Patience drains `2.2 + 1.8·d` per second. Line types: **LOGIC** (−7 patience), **PYAAR** (charm, +2), **APNAPAN** ("we're local", +3), **FILMY** (−2), **JAATA HOON** (walk away). Each seller likes one type, hinted by his first line, and that type cuts his price more. The needle grade matters: green = full effect, yellow = half, red = no effect and −10 patience. Walking away works only when the price is within ₹2 of his floor; otherwise −38 patience |
| Win / lose | price ≤ target / patience 0: he leaves. In free roam the deal is off for 10 gm. In missions the companion pays the difference (§2.4) |

| `who` | Start | Target | Floor | Liked line |
|---|---|---|---|---|
| `auto` | meter + ₹10 | meter | meter − ₹2 | APNAPAN |
| `banana` (dozen) | ₹15–18 | ₹10 | ₹8–11 | PYAAR |
| `flower` (garland) | ₹20–24 | ₹12 | ₹10–13 | PYAAR |
| `kite` (M1: 5 kites + charkhi) | ₹30 | ₹20 | ₹18–20 | FILMY ("Today even the wind charges extra") |
| `farmer` (Rythu Bazaar list) | list × 1.25 | list price | list × 0.9 | LOGIC |
| `books` (SA7: class VII set) | ₹90 | ₹60 | ₹55 | APNAPAN |

### 8.8 Marbles, `marbles` (goli / *kanche*)

| | |
|---|---|
| Used in | *Marbles vs Tiger* at `playground_14` (after 10 golis); any `playground_*` against a colony kid ("Pappu") |
| Controls | **Drag back** from anywhere and let go to flick the striker (a slingshot); tap outside the ring to move the shooting spot. Keyboard: A/D moves the spot round the ring, ←/→ aims, hold Space for power and release. Pad: LB/RB move, stick aims, hold and release A |
| Rules | The ring holds `count − 1` marbles plus the swirly **jackpot**, worth 3 (count default 9, so 11 points in all). Knock marbles out of the ring to win them. Knock one out and keep the striker inside: **shoot again** from where it stopped. Otherwise the turn passes. **First to `floor(total/2) + 1`** wins (6 by default). With `raja_goli`: striker mass +25% and the aim guide +30% |
| Reward | ₹5 a win against Tiger (bible), ₹2 against others (3 paid wins a day) |

### 8.9 Lootna: the terrace kite chase (M1 step 2; W2 variant)

| | |
|---|---|
| Rules | A marked route over **6 walled terraces** joined by planks with handrails (roof zones, §7.3). The cut kite's shadow drifts ahead at 55 u/s. Reach each terrace's ring in turn (r 20 u). **25 s**. Running is allowed; planks are 10 u wide with rails (no edge, no fall) |
| Result | on time: +₹2 "Lootna bonus". Late: no fail, the kite lands in `playground_1` anyway (bible) |

### 8.10 Cargo carry (W3)

| | |
|---|---|
| Used in | M6 (5 kg flour on the carrier), M9 (3 kg tomatoes vs Bunty), SA3 (the mutton parcel, light), jobs (dabbas, rythu bags, kirana orders) |
| Rules | A cargo meter (100) shows as an icon (atta bag, tomatoes, parcel). **−8** per pothole or kerb bump at > 40 u/s; **−15** per crash (any collision > 60 u/s, or a fall); **−3** per handbrake drift at > 90 u/s. "Light" cargo (SA3) takes half damage. Carriers: `chinnu_cycle` −25%, ladies-cycle basket −30% |
| Fail | below **40** (bible). Jobs: redo the trip with no pay for that item |

### 8.11 Escort / walk at pace (W8)

| | |
|---|---|
| Used in | M6, M8 (Amma's bonam), M10 (the lorry), M11 (Ammamma up `birla_mandir_steps`), M12 (Immu back to the plaza) |
| Rules | Running disabled. Stay within **120 u** (150 u for the lorry) of the escorted actor. Beyond that for 5 s: a warning objective ("Stay with Amma"). The escorted actor waits for you after 8 s. In M10, abandoning for **60 s** fails (bible); elsewhere it only warns. The meter policy is `frozen`, except M12, which drains one slipper every 5 s (bible) |

### 8.12 Queue cage (W5)

| | |
|---|---|
| Used in | M3 (`sandhya_theatre`: 4 line-cutters, 75 s to HOUSEFULL), M6 (respect variant at `dilsukhnagar_sai_temple`), SA3 (two uncles "just asking the rate"); random first-day shows |
| Rules | A zig-zag barricade lane (24 u wide) with 12–20 NPCs. The counter serves every 2.5–4 s and the line advances. **Step forward** (↑ or ACTION) within 1.5 s when the gap opens, or the gap stays open and invites a cutter. A **line-cutter** leans in from the side with a 1.2 s tell (arm on the rail): ACTION "*Line mein!*" sends him back. A miss costs a place. M3 has a 75 s timer: HOUSEFULL = fail, retry from `queue`. **Respect variant:** no cutters, no timer, just step forward; the dialogue plays out |

### 8.13 Timed runs and races (W2)

| | |
|---|---|
| Timed runs | `m.timer(sec, label)`. HUD timer; a tick sfx and red digits for the last 10 s. **Most story timers never fail** (bible: M1 lootna, M5 back to the step, M7 climb and depot, M8 hot parcel, M12 self-timer); they change lines and flags. Fails: M3 queue, M9 tiffin |
| Races (SA6 R1–R4, M9 tomatoes) | Checkpoint rings (r 40 u) along roads, shown as pink rings on the minimap. Missing one draws an arrow back to it. Rival: Bunty on the RX100 with a **handicap**: top speed ×0.72 (R1), ×0.78 (R2), ×0.82 (R3), ×0.86 (R4). **Rubber band:** Bunty drops to ×0.9 of his handicap when more than 250 u ahead, and rises to ×1.05 when more than 250 u behind. Chinnu rides a hired cycle (R1, R2) or a Luna (R3, R4; Bunty brings a friend's Luna). Win: finish first. Lose: retry free |
| Race routes | R1 `tank_bund` end to end (≈ 1.2 map-km); R2 `necklace_road` at sunset (≈ 2 map-km); R3 the OU loop from `chai_bandi_3` (≈ 2.5 map-km); R4 `cyber_towers` → `hitex` empty roads (≈ 2.8 map-km) |

### 8.14 Viewpoints (W6)

| | |
|---|---|
| Rule | Reaching a viewpoint (or a story step) pulls the camera out to zoom 0.55 for 3 s, then marks every unfound collectible within **900 u** on the minimap and full map for **180 s**. Once per viewpoint per game-day |
| Viewpoints | Numaish giant wheel (in season, ₹5); `golconda_bala_hissar`; `birla_mandir` parapet (walk-only); `charminar_gallery` (M12 only); `prasads_imax` lobby window (from 25 Jul); `ntr_gardens` mini train and Machan tree; `home_terrace` (radius 400 only); `falaknuma_palace` gate |

### 8.15 Boat ride (W7)

See §3.7. In story (M10) the boatman rows round the Buddha, and the player may steer or let him
row. Frame F07 shows a "Click" prompt when the statue is within 40 u.

### 8.16 Night watch tag (W9), SA1 nights 2 to 4

| | |
|---|---|
| Arena | `playground_1` in darkness. Chinnu's torch is a 70° x 110 u cone; the pandal's laddu is at the centre |
| Rules | 3 raiders (Tiger's gang) come in from the edges, one every 2 s, walking at 30 u/s toward the laddu. Caught in the torch beam, a raider freezes 1 s then backs off 20 u. **Tag** him (ACTION within 14 u): he giggles and leaves. A raider reaching the laddu (within 10 u) loses the night. Survive **60 s** with all tagged to win |
| Reward | ₹10 a night; laddu prasadam +30 (bible) |

### 8.17 Chanda round, SA1 night 1

Collect from 5 donors (`kirana_1` ₹11, `pindi_girni_1` ₹11, `irani_cafe_7` ₹21, `medical_shop_8`
₹11, `friend_home` ₹51) within **120 s**, ACTION at each. The money goes to the committee, not to
Chinnu. Each donor has the bible line.

### 8.18 Camera click (Frames)

ACTION "Click (Fnn)" within 40 u, facing the subject within 60°, outside respect zones. A
viewfinder overlay shows for 0.6 s, then `camera_flash` (a white flash, or a fade with flash
reduction on), "FRAME n/24", and the film advances. A frame can't be retaken. Frame 24 is kept
for M12.

### 8.19 Self-timer dash (M12 step 9)

A 10 s countdown with `beep` ticks. Nanna walks backwards to 60 u away "to check the focus".
Reach him (ACTION within 14 u). He then follows at your walk speed; get him back into the frame
zone (r 30 u at the café step) before the beep. A miss = "Again!", reset, no penalty (bible).

### 8.20 Lock dial (epilogue)

Four brass wheels, 0–9. ↑/↓ changes a digit, ←/→ moves between wheels, ACTION tries. Touch: swipe
a wheel up or down, tap TRY. Wrong tries 1–3 escalate the bible lines; after the 3rd the dial
sets itself to **1-4-0-1**.

### 8.21 Paper throw (job, §9)

On a cycle, ACTION throws a rolled newspaper at the nearest gate marker within 40 u to the left or
right. It flies on an arc for 0.5 s. Landing within 10 u = **perfect** (+₹1 tip, a dog may bark),
within 20 u = ok, otherwise a miss ("*Arre!* Paper in the drain!").

---

## 9. Side jobs (odd jobs)

Jobs are short, repeatable runs that use the everyday places. Each is registered as a mission with
`kind: 'job'` (story.js or shops.js; no new src file needed). Jobs never fail permanently. They pay
at once and level up with completions.

**Levels:** L1 at start, **L2 after 2 runs, L3 after 5, L4 after 9, L5 after 14**. The Journal's
Jobs page shows each job's level, best time and total earned. One run of each job per window,
unless noted.

| Job (id) | Giver / place | Window | Needs | Rules | Pay by level (L1 → L5) | Level effects |
|---|---|---|---|---|---|---|
| **Paper boy** (`job_paper_round`) | the newspaper agent's bundle at `kirana_2` | daily, start 05:30–07:00 | any cycle | Deliver to N colony gates in `himayatnagar` / `rtc_x` within T s with the paper throw (§8.21). Dawn dogs chase (§11.3) | N: 6/8/10/12/14 · T: 100/110/120/125/130 s · ₹4/5/6/8/10, **+₹1 per perfect throw** | Time out: ₹1 per delivered gate ("half job, half pay") |
| **Girni dabbas** (`job_girni_dabbas`) | any `pindi_girni_*` | 09:00–18:00, not during power cuts; up to 3 runs a day | on foot or cycle | Carry ground-flour *dabbas* to colony houses 300–800 u away (cargo §8.10), 90 s per dabba | dabbas per trip 1/1/2/2/3 · **₹2 per dabba**, +₹1 if cargo ≥ 90 | L4+: Ramulu adds a coconut (+15) |
| **Kirana errands** (`job_kirana_errand`) | `kirana_1` (Agarwal-ji); any `kirana_*` from L3 | 10:00–19:00 | on foot or cycle | 2–4 orders (rice bag = heavy: walk ×0.8, no running; oil tin; soap box) to houses within 120 s. Pick up 1–2 empty bottles on the way (₹1 each to you) | orders 2/2/3/3/4 · ₹3/3/4/5/6 | L5: khaata limit ₹20 |
| **Raddi round** (`job_raddi`) | the raddi-wala's pushcart at the `playground_1` gate | Sundays 10:00–13:00 | — | Collect old-newspaper bundles from 5 houses (2–4 kg each). Over 6 kg on foot: walk ×0.8 and no running; a cycle carrier takes 12 kg. Weigh them at the cart | **₹2 per kg** (≈ ₹30 for a full round at L5) · houses 3/4/5/5/6 | 25% per bundle: an old comic (opens a trivia card) or a goli hint |
| **Kite lootna** (`job_lootna`) | free: just run | 13–15 Jan all day; 1 Jan–15 Feb 16:30–18:30 | on foot | Cut kites drift down over colony streets and playgrounds (one every 15–30 s within 600 u, falling from h 120 over 25–40 s, drifting 15–25 u/s with the wind; the shadow shows where). 2–3 rival kids chase at 70 u/s. Be under it (r 14 u) when h < 12: "*Lootna!*". Carry up to 5. Kites never land on roofs outside M1 | sell ₹1 each at `kite_stall_*`, or keep them as kite-minigame lives | — |
| **Antenna jobs** (`job_antenna`) | Cable Babji (walks near `kirana_3`) | after M4, 17:00–20:00 | — | 3 walled terraces (roof zones) per job; `antenna` minigame each | time 60/55/50/45/40 s · **₹5 per antenna** | L5: Babji calls Chinnu "*ustad*" (ambient line change) |
| **Rythu list** (`job_rythu_list`) | an aunty at the gate of any `rythu_bazaar_*` | 07:00–12:00 | — | Her list: 3–5 items, budget = list prices + ₹2. Buy (optionally bargain, `who:'farmer'`), carry the bag back (cargo; tomatoes bruise) and return the change | ₹3 + **you keep the savings** (up to ₹5) · items 3/3/4/4/5 | Cargo < 60: the aunty keeps ₹1 ("Tomatoes are bruised. Who sat on them?") |
| **Cut-out helper** (`job_cutout`) | the painter ("Bomma-uncle") on his scaffold at `sudarshan_theatre` | Thursdays 14:00–18:00 (before Friday releases) | — | Fetch poster colours from `stationery_2`, brushes from `kirana_4` and chai from `irani_cafe_8` within 150 s; then **hold the ladder**: 3 timing presses when the wobble needle is centred (green 20% of the arc) | ₹8/8/10/10/12 | L3+: Chinnu paints the moustache; next week's cut-out shows "his" moustache (cosmetic) |
| **Gully league** (`job_gully_league`) | captains at `playground_*` | school days 16:00–18:30; holidays and Sundays 08:00–18:30 | — | `cricket` matches against colony teams in order: Vidyanagar → Nallakunta → Ashok Nagar (Tiger) → Saidabad → Barkas | targets 14/17/20/24/28 runs · ₹2/3/3/4/5 | Champion: Journal title "Colony Champion"; Tiger's respect line |

---

## 10. Day, night and the calendar

### 10.1 Clock

| Rule | Value |
|---|---|
| Speed | `N.clock.speed = 1` (1 gm per real second); a full day = 24 real minutes |
| Clock runs in | `play` only. **Frozen** in dialogue, shop menus, minigames, pause, map and journal. Cutscenes set the time explicitly. Missions may freeze it per step |
| New game | the prologue, then M1 sets **Tue 14 Jan 2003, 07:10** (bible) |
| `N.clock.baseDate` | **[2003, 0, 14]** (bible §12). The VHS OSD reads `▶ PLAY  TUE 14 JAN 2003  07:10` |
| **Sleep** | at `home` (ACTION "Sleep") 20:00–05:00 → 07:00 next day; saves; energy 100, tummy 70, meter 0, curfew cleared |
| **Afternoon nap** | at `home` 13:00–16:00 → 16:30; energy 100, tummy −10 |
| **Wait** | café "sit with one chai" (+1 gh each, max 3), a bus-stop bench "Wait for the bus" (until the next bus), mission-window waits (§6.1) |

### 10.2 Day bands and lighting

Lighting follows `N.clock.light()`. The colour grade comes from render.js (dawn pink, noon
neutral, golden-hour orange, night blue). Sodium street lamps glow orange from 18:30; shops show
tube-light white-green.

| Band | Time | Light | What changes |
|---|---|---|---|
| Pre-dawn | 04:30–05:30 | dark blue | milk vans; a soft pre-dawn hush and pigeons at the `mosque_*` emitters (no synthesised azaan, §12.1); Bahadur ends his round |
| Dawn | 05:30–06:30 | pink | temple bells (06:00); morning walkers at parks and `fateh_maidan`; paper boy job; winter mist (Dec–Jan) |
| Morning | 06:30–09:00 | warm | dosa bandis open; school autos 07:30–08:30; milk-packet queues |
| Day | 09:00–12:00 | neutral | shops open; markets busy |
| Hot afternoon | 12:00–15:30 | bleached | summer: streets ×0.6, dogs asleep in the shade, summer drain (§2.2) |
| School's out | 15:30–16:30 | neutral | kids flood colonies; gola and pani-puri carts at `school_*` gates; school bells |
| Golden hour | 16:30–18:30 | orange, long shadows | gully cricket, kites (Jan), families on `necklace_road` and `tank_bund`; samosa bandis open (16:00) |
| Lamps on | 18:30 | — | street lights; "home before the street lights" closes; temple bells (not at Birla Mandir); pigeons settle on the mosque domes |
| Dusk | 18:30–19:45 | dusk blue | rush ×1.3; Lumbini fountain at 19:00 |
| Evening | 19:45–22:00 | night overlay | shops lit; Numaish glows (in season); Irani cafés full; dogs wake |
| Late | 22:00–00:00 | night | most shops shut; peds ×0.3; Bahadur patrols; cinemas let out at 00:00 |
| Deep night | 00:00–04:30 | darkest | peds ×0.1; cows asleep on medians; dog packs bark; lorries ×2; only station cafés open |

### 10.3 Opening hours summary

| Opens | Places |
|---|---|
| 04:30 | `alpha_hotel`, `blue_sea_cafe` (till 01:00) |
| 05:00 | Irani cafés (till 23:30) |
| 05:30 | chai bandis (till 22:00) |
| 06:00 | flower carts, Rythu Bazaars (till 13:00) |
| 06:30 | dosa bandis (till 10:00) |
| 07:00 | kiranas, cycle hire, bakeries, STD booths (till 23:00), banana carts |
| 08:00 | barbers (closed Tuesdays), pindi girnis (till 19:00), stationery, medical shops (till 22:30) |
| 09:00 | Karachi Bakery, coconut carts, `chappal_bazar`, Golconda (till 17:30) |
| 10:00 | video parlours (till 21:00), internet cafés (till 22:00), Prasads (from 25 Jul), recording centre |
| 11:00 | Gokul Chat (till 22:30), biryani houses (till 23:00), cinemas' first regular show |
| 16:00 | samosa bandis (till 20:00), Numaish (1 Jan–15 Feb, till 22:30) |
| 17:30 | Ramzan haleem bhattis (27 Oct–25 Nov, till 01:00) |

### 10.4 Night rules

- Night sight ×0.75 for pursuers and spotters (§4.2), except Bahadur's torch and Mummy.
- Headlight pools on vehicles and the dynamo light; `torch` cone (70° x 110 u).
- The Chappal Meter's level-5 chaser switches from the auto (day) to Nanna's Chetak (night).
- Curfew (§4.12).
- Fewer cycles on the road, more lorries.
- Cows lie on medians, so drive slower. Dogs are active (§11.3).

### 10.5 Calendar

**Story dates** come from the bible §1.4: M1 Tue 14 Jan → M12 Tue 25 Nov 2003; the ending is Thu
27 Nov; the epilogue is Sat 17 Jan 2026.

**The elastic calendar ("the week loops").** Between missions, free-roam days advance normally
until the day before the next mission's date. From then on **the last 7 days before that date
loop**: after day D−1 comes D−7 again. The OSD shows `↻` next to the date, as if the tape replays
the same week. This keeps weekdays true, so Sunday-only things (C10, SA3, raddi, pocket money),
Thursday things (Sai temple, cut-out job) and Friday releases still happen, and the clock never
has to run backwards when a mission starts.
- If the gap since the last mission is shorter than 7 days, the loop starts the day after that
  mission.
- Seasonal flags are worked out from the shown date, so a loop always stays inside its season.

**Weekly rhythm**

| Day | What happens |
|---|---|
| Sunday | pocket money, raddi round, Abids book market (C10), mutton queue (SA3), Bunty's RX100 (SA6), cricket all day |
| Tuesday | barbers closed; girni chilli day; Karmanghat temple queues |
| Thursday | Sai Baba temple crowds and prasadam +15; cut-out job; qawwali at `dargah_yousufain` |
| Friday | film releases (06:00 first-day shows); museums closed |
| Monday | the zoo is closed |
| Second Saturday | no school (M3) |

School days are Mon–Sat in term time (term: 12 Jun to ~24 Apr, with holidays). During school
hours (08:30–15:30), aunty spotters' radius is ×1.25 ("Why aren't you in school?") and Chitti is
at school.

**Seasons and weather** (flags from bible §8.6, plus weather):

| Season | Dates | Systems effect |
|---|---|---|
| Sankranti | 13–15 Jan | kites in every sky (sky layer), lootna job, kite stalls crowded, Ammamma's ₹10 |
| Numaish | 1 Jan–15 Feb | `nampally_exhibition` open 16:00–22:30, a crowd zone |
| World Cup | 9 Feb–23 Mar | TV-window crowds, "Score?" barks |
| Summer | 24 Apr–11 Jun | summer drain at midday, gola and sugarcane carts, mango prices, SA4 |
| Monsoon | 12 Jun–30 Sep | **40% daily chance of rain**, one 2-hour shower starting between 14:00 and 18:00: puddle decals, grip ×0.8 (bikes ×0.6 on puddles), peds ×0.6 with umbrellas, paper boats in drains, `rain` bed, the Musi channel drawn wider |
| Bonalu | Sun 20 Jul | procession roads closed round `ujjaini_mahankali_temple` (respect zone) |
| `prasads_open` | from 25 Jul | Prasads works as a cinema |
| Ganesh | 31 Aug–9 Sep | pandals in every `playground_*`; SA1 nights; immersion jam on 9 Sep |
| Ramzan | 27 Oct–25 Nov | haleem bhattis 17:30–01:00 in the Old City (crowd zone after 20:00), night bazaars |
| Chand Raat | 25 Nov | Laad Bazaar open all night, no vehicles in the lanes |
| December (post-game) | 1–31 Dec | Christmas stars in Secunderabad, SA8; plum cakes at Karachi Bakery |
| Winter mornings | Dec–Jan | mist 05:30–07:30 (overlay alpha 0.15) |

---

## 11. Ambient population (traffic.js)

### 11.1 Budgets and radii

| | Desktop | Mobile (touch device) |
|---|---|---|
| Max pedestrians | 70 | 45 |
| Max moving vehicles | 30 | 22 |
| Max animals (cows, dogs, goats, buffaloes) | 14 | 10 |
| Pigeon flocks (particle systems of 12–30 birds) | 4 | 3 |
| Sky layer (kites in season, cheels, crows) | 24 sprites | 16 |

| | Spawn ring (from the camera centre) | Despawn beyond |
|---|---|---|
| Peds | 360–560 u, **never in view** (`N.render.inView` margin 40) | 700 u |
| Vehicles | 560–820 u, on the road graph, lane-correct | 1000 u |
| Animals | 400–600 u | 800 u |

At most 2 spawns per frame. Despawn only out of view. Story NPCs (npcs.js) are not counted.

### 11.2 Pedestrian density and types

**Target peds within 600 u, by district style (daytime):** oldcity 34, market 30, colony 18,
cantonment 16, colonial 14, posh 8, hitec 6, rocky 5. Time multipliers are in §10.2. Festival
multipliers: Numaish grounds ×2.0, Ramzan nights in the Old City ×1.6 after 20:00, the
`ganesh_immersion` Tank Bund ×2.5, Bonalu at Secunderabad ×2.0, the Sai temple lane on Thursdays
×1.8, colonies at Sankranti ×1.3 (kids on terraces).

Look kinds use `N.people.draw` (`kind`, `skin`, `hair`, `shirt`, `pants`, `saree`, `lungi`,
`dupatta`, `cap`, `bag`...). Shares are per district style.

| Type | Kind | Look | Where (share) | Behaviour |
|---|---|---|---|---|
| School kids | `student` | white shirt, navy shorts or skirt, striped tie, bag on both shoulders, plaits with ribbons | colony 18%, market 8% (07:30–09:00, 15:30–17:00) | walk in pairs; run to the school bell |
| Colony kids | `kid` | vest or T-shirt, half-pants, hawai chappals, scabbed knees; girls in frocks | colony 14%, oldcity 10% | play in lanes and playgrounds; chase lootna kites in season |
| Uncles | `uncle` | half-sleeve shirt tucked in, trousers, moustache, pens in the pocket, a newspaper or tiffin bag | colony 12%, market 14%, colonial 14% | stroll; chat at shop fronts |
| Lungi uncles | `lungi` | checked lungi folded up, vest or shirt, towel on the shoulder | colony 6%, oldcity 10%, rocky 10% | sit on benches; milk and vegetable runs |
| Aunties (Telugu) | `saree` / `aunty` | cotton saree (green, maroon, mustard), bun with jasmine, steel tiffin or vegetable bag, big bindi | colony 20%, market 16% | **spotters** at level 2; gather at colony gates in pairs |
| Dakhni aunties | `burqa` / `woman` | black burqa with the face open, or salwar kameez with a dupatta over the head; shopping bags | oldcity 18%, market 8% | shop in bazaars; spotters too |
| Young men | `man` | bell-ish jeans or trousers, printed shirt, side parting, a comb in the back pocket | market 14%, rtc_x cinema crowd 30% | hang out at cinema forecourts and tea carts |
| College students | `man` / `woman` | jeans, kurtas, files to the chest, a few sunglasses | `osmania` 40%, `ameerpet` (coaching lane) 30% | "C, C++, Java" chatter |
| Office-goers | `man` | formal shirt, lanyard ID (no logo), lunch bag | `hitec` 50%, posh 20% | brisk walk; "onsite" barks |
| Old men | `uncle` (age old) | white kurta-pyjama or dhoti, walking stick, cap (`gandhi`, `topi` or `skull`) | 6% everywhere; benches at parks and the Clock Tower | "In our time, one rupee was a rupee." |
| Old-city elders | `uncle` | white kurta, skull cap, henna-orange beard, sherwani on Fridays and Eid | oldcity 12% | stroll toward the mosques at prayer times (respectful, never in a chase) |
| Vendors on foot | `man` / `lungi` | head basket of fruit, balloon pole, broom seller, knife-sharpener with a wheel | market and colony 4% | ambient calls (`vendor_call`) every 8–15 s |
| Porters (*coolies*) | `man` | red shirt, brass armband, a cloth on the head | stations 30% | "*Coolie? Coolie?*" |
| Police / constables | `police` | white shirt, khaki trousers, police cap, whistle (no weapon) | 1 per podium junction 08:00–21:00 | spotters (§4.4) |
| Gurkha watchmen | `man` | khaki jacket, black topi, bamboo stick | gated colonies at night | night spotters |
| Construction workers | `man` / `woman` | sarees tucked up and headloads of bricks; helmets for the men | `hitec` 30% | carry and walk; cranes nearby |
| Pilgrims (festival / Thursday) | `saree` / `uncle` | marigold garlands, coconuts, prasad bags | temple lanes in season | queue; respect zone |

Peds never die and never stay down: a knocked-down ped (`knockT` 0.6–1.0 s) gets up, dusts off and
walks on.

### 11.3 Animals

| Animal | Where | Count | Behaviour | Player interaction |
|---|---|---|---|---|
| **Cows** | everywhere except posh and hitec | 0–3 per 600 u | 60% of the time lying on the road median or edge; `fixed` (immovable, never harmed). Vehicles stop 20 u short and honk | a horn within 60 u: she gets up after 1.5–3 s, ambles 40 u away at 25 u/s, lies down again after 20–40 s. Bumping her: "moo", the vehicle stops dead, +20 heat if seen (§4.2) |
| **Buffaloes** | oldcity, `chaderghat`, `musi_riverbed` | herds of 3–6 | cross roads at 20 u/s behind a *gowli* (milkman) 06:00–08:00 and 17:00–19:00; fixed like cows | wait for them; horns make no difference ("buffaloes don't care") |
| **Dogs** | everywhere | 1–4 per 600 u | nap under parked cars and in the shade by day; packs of 2–3 at night | **chase bikes**: a bike over 50 u/s within 45 u sets them barking and running at 90 u/s for 4 s; then they give up. They never bite. Stop and they sniff and leave. **Feed one** a biscuit (ACTION with `biscuits` or `osmania_packet`): it follows Chinnu for 2 gm and barks at foot pursuers (§4.7) |
| **Pigeons** | flocks at `charminar_plaza`, `gulzar_houz`, outside `mecca_masjid`, `tank_bund`, `secunderabad_station`, the `abids` GPO, `mozamjahi_market` | 4 flocks | peck on the ground; **lift off** when the player moves over 50 u/s within 40 u, or a horn sounds within 80 u; land again after 6–10 s (`pigeons` sfx) | the ending's story beat (they lift off the minarets) |
| **Goats** | oldcity lanes, `rajendranagar`, `langar_houz` | 2–4 per area by day | graze, nibble posters on walls | bump: "meh" (no heat) |
| **Donkeys** | `musi_riverbed` dhobi ghats | 2–3 | carry laundry bundles slowly | — |
| **Crows** | wires, antennas, roofs (sky layer) | 6–10 | "caw" (`crow_caw`); the antenna minigame's pests | lift off at horns |
| **Cheels** (black kites, the birds) | circling high over the lake and the Old City | 2–4 | slow circles in the sky layer (`cheel` call) | — |
| **Peacocks** | `kbr_park`, `university_of_hyderabad`, `golconda_fort` | 1 each | strut; call at dawn and dusk | G20 hint ("where the peacock crosses") |

### 11.4 Reactions

| Trigger | Reaction |
|---|---|
| A vehicle horn within 70 u ahead (50° cone) | peds sidestep to the footpath edge (12–20 u at 60 u/s), 30% with a bark; cows as §11.3; dogs bark; pigeons lift; cyclists ring back; autos honk back (20%) |
| The player running past within 10 u | 20% chance of bark #2 ("*Kaiku itta bhaagra?* Train *chhoot ri kya?*") |
| The player standing near a ped for 3 s | 25% chance of a tagged bark (bible §8.1: time, season and district tags) |
| A bump (ped, any speed > 30) | knock-down for 0.6–1.0 s (speed-scaled), a bump bark (#11 "*Light le, mamu*", #13 "*Abba! Choosi nadavu!*"), heat per §4.2; bystanders within 60 u turn to look |
| A ped hit by a vehicle | the same, a longer knock-down, `bump` sfx; nobody is ever hurt |
| A constable sees an offence | +heat and his whistle; at level 0 he only shakes his finger ("*Hallu!*") |
| Pochaiah on a shop TV / in the crowd | ambient barks only |

Every bark has an **8 s cooldown per ped**, and the same line is never played twice in a row
(bible §8.1). Barks show as speech bubbles, plus subtitles when that setting is on.

### 11.5 Crowd zones and special crowds

| Zone | Where / when | Rule |
|---|---|---|
| Bazaar crowds | `laad_bazaar`, `general_bazaar`, `sultan_bazaar`, `begum_bazaar`, `pathergatti` (day and evening) | the crowd is a soft solid: it pushes the player gently, walk ×0.85 inside, no running. Sight ×0.6, unseen timer ×2 (§4) |
| Numaish | `nampally_exhibition` in season | as bazaars; the loudspeaker plays |
| Cinema crowds | the 30 min before each show at the RTC X Roads four | crowd zone and queue cage |
| TV-window crowds | `electronics_shop_1` and kirana windows during cricket (Feb–Mar) | a semicircle of 8–14 standing peds; "Score?" barks |
| Processions | Bonalu (M8), Ganesh (M10), the Khairatabad giant (cutscene) | a respect zone path: peds follow it at 25 u/s; teenmaar dancers; gulal puffs (pink particles, harmless) |
| Queues | §8.12 | — |
| Thursday Sai temple lane | `dilsukhnagar_sai_temple` | the outer queue barricades; respect |

---

## 12. Audio direction (audio.js; everything synthesised)

### 12.1 Rules

- Everything is synthesised with WebAudio (ARCHITECTURE §17). There are no real songs, no lyrics
  and no samples.
- **Respect in sound:** no synthesised azaan, chants, hymns or *bhajans*. Prayer times are
  suggested by a soft evening hush, pigeons and bells only: temple bells (`temple_bell`) at
  temples **except Birla Mandir, which has none**, and church bells. Inside respect zones the
  score fades to ambience.
- **Kid-friendly sound:** bumps and the chappal are comic (cartoon "thup", slide whistles), never
  painful. Nobody cries out in pain.
- **Mix priority:** dialogue > story SFX > player SFX > pursuer cues (whistle, whoosh) > music >
  ambience. Music ducks to 0.32 under dialogue. The radio or walkman replaces the score.
- At most 22 voices. Per-sound cooldowns. Sounds beyond ~700 u are culled. `N.audio.sfx` takes
  `x, y` for distance, pan and air absorption.

### 12.2 SFX list

Names marked **NEW** are requests to audio.js. Everything else already exists in `SFX_NAMES`.

| Group | Name | When | Character |
|---|---|---|---|
| Feet and bikes | `step` | footsteps per surface (`footstep` event) | dusty pat, pavement tap, grass swish, sand crunch |
| | `bell` | cycle horn | the classic two-strike "**tring tring**" (double-gong after 5 finds: lower and longer) |
| | `freewheel` **NEW** | cycle coasting | ratchet "tik-tik-tik" at the wheel speed |
| | `puncture` **NEW** | flat tyre | a long "psssss", then a rim thud on bumps |
| | `pothole` **NEW** | a pothole bump | hollow "thunk" plus a spring rattle |
| Engines | voices `luna`, `chetak`, `rx100`, `auto`, `ambassador`, `padmini`, `maruti800`, `bus`, `lorry`, `boat` | player and nearby vehicles | Luna: thin buzzing moped. Chetak: **2-stroke putt-putt**, a tilt-and-kick start (`chetak_start`). RX100: the snappy "ring-ding" two-stroke whose pitch jumps with each gear. Auto: rattly 2-stroke with a chain clank. Ambassador: soft old petrol burble. Bus and lorry: diesel clatter plus `air_brake` |
| Horns | `scooter_horn`, `auto_horn`, `car_horn`, `bus_horn`, `lorry_horn` | horn action and traffic | Auto: the rubber-bulb "**pom pom**". Lorry: the musical "Horn OK Please" multi-tone. Bus: a deep two-tone |
| Impacts | `bump`, `crash`, `skid`, `door`, `door_creak`, `splash`, `water_lap` | physics | crash = a tin-can clatter; skid = a short squeal |
| Meter | `whistle` | **Havaldar Pochaiah's whistle**: a long shrill blast, then two short ones | heard up to 600 u |
| | `gurkha` | Bahadur's stick tap + whistle | a wooden tok-tok-tok on the road |
| | `chappal` | **the chappal slap** on landing | a flat rubbery "**thup**" with a cartoon boing |
| | `chappal_whoosh` **NEW** | the 0.4 s wind-up and flight | a rising whoosh with a little whistle |
| | `peel_slip` **NEW** | a pursuer slips on a peel | slide whistle down, then a soft bump |
| | `wanted_up` / `wanted_down` | level change | two notes up (harmonium) / down |
| | `busted` | PAKDA GAYA | a brass "wah-wah" sting |
| | `wasted` | THAK GAYA | a deflating "phwoo" plus a slow sitar pluck |
| | `pant`, `stomach_growl` **NEW** | exhausted / hungry | panting; a comic gurgle |
| Pickups and money | `pickup`, `marble`, `tape_click`, `paper`, `keys`, `coin`, `cash`, `coin_drop` | collectibles and money | marble = two glass clicks; tape = a cassette lid snap; ticket = paper and a punch "chk" |
| Tape and REC | `rec`, `rewind`, `tape_stop` | ● REC, ◀◀ VHS effect, ■ STOP | **the cassette rewind squeal** (high chirp that speeds up), the REC beep, a tape winding down |
| Camera | `camera_flash` | Frames | shutter, a flash whine, film advance |
| UI | `ui_click`, `ui_back`, `ui_select`, `type`, `page_flip`, `objective`, `mission_passed`, `mission_failed`, `shop_bell` | menus and HUD | soft harmonium and santoor taps; `type` = the typewriter for dialogue |
| Phones and machines | `std_ring`, `dialup`, `arcade`, `weigh_machine` **NEW**, `jukebox` **NEW**, `radio_static`, `detector` | booths, internet café, parlours, stations, cafés, tuning, Pasha's antenna | weighing machine: a coin drop, a whirr and a card "chk"; jukebox: a mechanical arm clunk and a crackle |
| Places and city | `announce` (Numaish loudspeaker), `station_chime`, `train_horn`, `conductor` ("*Right, right!*" double-whistle), `vendor_call`, `kulfi_bell`, `bangles`, `cup_clink`, `plates`, `sizzle`, `chop`, `coconut_chop`, `munch`, `sip`, `flour_mill` (**thump-thump**), `cooker` (pressure cooker, colony lunchtime), `temple_bell`, `church_bell`, `school_bell` (tan-tan-tan), `gong` (Salar Jung clock), `clock_tick`, `airplane` (Begumpet approach), `firework` (festival skies only, distant) | emitters and events | — |
| Nature | `pigeons`, `coo`, `bird`, `koel` (summer mornings), `crow_caw`, `cheel`, `cow_moo` (pitched down for buffaloes), `dog_bark`, `goat_bleat` **NEW** | ambience | — |
| Kites and cricket | `kite_wind`, `kite_cut`, `bo_kaata` (a synth whoop, not a voice), `bat_hit`, `howzat` (crowd-like vowel synth), `kids`, `crowd_cheer`, `applause`, `clap`, `clap_echo`, `finger_whistle` | minigames and REC | — |
| Festival | `dappu` **NEW** | M8's REC; Bonalu processions | a short **teenmaar** roll: dappu frame drum in a 6/8 gallop, rim slaps (bible §12.4; fallback `temple_bell` only outside Birla Mandir) |
| Lake | `fountain` **NEW** | Lumbini musical fountain | rising spray hiss in time with the `festival`-lite fountain tune |
| Numaish | `giant_wheel` **NEW** | the wheel turning | a slow metal creak and a bulb hum |

### 12.3 Ambience beds and emitters

The district beds are already in audio.js (`BEDS`: oldcity, market, colonial, colony, posh,
rocky, cantonment, hitec, lake), and so are the place emitters (`PLACE_SOUNDS`). Additions and
fixes:

| Emitter | Sound |
|---|---|
| `birla_mandir` | **remove `temple_bell`** (it has no bells; bible). Use wind, a distant city hum and soft footsteps on marble |
| `pindi_girni_*` | `flour_mill` thump-thump at 1.6 Hz; silent during power cuts |
| `irani_cafe_*` | `cup_clink`, `plates`, chatter, the jukebox when paid; Salim's "*Do pauna!*" at `irani_cafe_7` |
| `school_*` | `school_bell` at 08:45, 12:30, 15:45 on school days; recess `kids` |
| `playground_*` | `kids`, `bat_hit`, `howzat` (16:00–18:30) |
| `std_*` | a faint meter tick and `std_ring` |
| `video_parlour_*` | `arcade` bleeps |
| `nampally_station`, `kachiguda_station`, `secunderabad_station` | `station_chime`, `announce` (wordless chime-tones), `train_horn`, porters |
| `nampally_exhibition` (season) | `announce`, the giant wheel, music bed `numaish` |
| `lb_stadium` (SA4 dawn) | a coach's whistle, bat and ball |
| `begumpet_airport` | `airplane` every 4–7 gm, the approach roar over Begumpet |
| `rythu_bazaar_*` | `vendor_call` (veg variant), scale clanks |
| `musi_riverbed` | the dhobis' cloth slap on stone (`chop` variant), water trickle |
| Mosques, dargahs (`mosque_*`, `mecca_masjid`, `dargah_yousufain`) | pigeons and `coo` (as built); on Thursday evenings at `dargah_yousufain`, a **wordless** harmonium drone (no song) |

Weather: a `rain` bed in monsoon showers (from the `wind` and `water` generators), with thunder as
a low noise burst.

### 12.4 Music moods (original, step-sequenced; ARCHITECTURE §17 TRACKS)

| Track | Where / when | Scale and harmony | Tempo and rhythm | Instruments | Motif (original) |
|---|---|---|---|---|---|
| `title` *Yaadon Ki Gully* | title screen, first 40 s of a new game | E♭ major pentatonic (Mohanam: S R G P D) | 84 bpm, slow *keherwa* (8 beats) | music-box santoor, tanpura, tape hiss | a four-note hook rising S-R-G-P, falling to D, ending unresolved on R ("a question") |
| `flashback` | prologue, interlude, the 2026 VHS frame | the title hook | 70% tempo, detuned | sitar, wow and flutter (`tape(0.6)`) | the hook half-remembered: two notes missing |
| `day` *Cycle Pe Sawaari* | free roam by day (colony, market, colonial) | D major with a bright Ma (Bilawal flavour) | 104 bpm keherwa | dholak, tabla, mandolin and santoor arpeggios, bansuri lead | a bouncing cycle-bell-like figure (P-D-P-G) |
| `night` *Chandni Chhat* | free roam at night | Yaman flavour (Lydian ♯4 over a tanpura Sa drone) | 72 bpm, rubato phrases | bansuri, soft harmonium pad, crickets | long bansuri notes leaning on the ♯4, resolving home |
| `oldcity` *Gulzar Houz Ki Shaam* | Old City districts, Golconda (a fort-cue variant with more echo) | Bhairav-like (Phrygian dominant: ♭2 and ♭6) | 96 bpm *dadra* (6/8) with **qawwali hand-claps** on beats 1 and 4 | harmonium lead, shehnai answers, dholak, claps, a sarangi-like bowed synth | call (harmonium) and response (shehnai), climbing a step each time |
| `kites` *Patang Ki Pech* | Sankranti days, the kite minigame | G major pentatonic | 120 bpm, brisk | flute trills, mandolin, string stabs on "*khench*" beats | a zig-zag figure like a kite in the wind |
| `numaish` *Numaish Ka Jhoola* | inside Numaish | C major with chromatic passing notes | 3/4 waltz at 128 bpm | calliope-like synth organ, harmonium, glockenspiel | fairground swirl. A slow "closing music" variant at 22:15 |
| `festival` *Teenmaar Toofan* | Bonalu, Ganesh processions | Mixolydian, call and response | 140 bpm, **teenmaar** 6/8 | dappu, tasha, marfa drums, shehnai and clarinet riffs | a four-bar riff that doubles in density each loop |
| `chase` | Chappal Meter ≥ 3 | D Mixolydian | 148 bpm, 2/4 march | **filmi brass band**: trumpets and clarinet in unison, big tom fills | a busy brass run. At level 5 a comic tuba adds the three-note "SRI-KAN-TH!" motif falling a fifth |
| `tension` | spy beats, Agent tapes, M12 storeroom | whole-tone cluster over a low drone | 60 bpm heartbeat (tabla "dha … dha") | pizzicato strings, low tanpura | sneaky staccato steps |
| `victory` | mission passed | major | a 6 s fanfare, then a light loop | brass + dhol, then santoor | a rising arpeggio ending on the title hook's first notes |
| `ending` *Charminar Ki Chaon* | the Charminar finale (5 sections: `alaap`, `theme`, `rise`, `lift`, `coda`) | Kafi (Dorian) alaap → the title hook in full → a key change up a whole tone at `lift` | free time → 76 bpm → building theka | sitar alaap, strings, tabla, choir-like pad (wordless), music box at the coda | the title's unresolved hook finally resolves to Sa at the coda's last note |

**Area mapping** (the music director, ARCHITECTURE §17):

| Area | Day | Night |
|---|---|---|
| colony, market, colonial | `day` | `night` |
| Old City districts and Golconda | `oldcity` | `oldcity` |
| Hussain Sagar, Necklace Road | `day` (`kites` in Jan) | `night` |
| hitec | `day` re-voiced for **90s synths** (request a `hitec` mood: square-wave arpeggio, drum machine, same melody) | `night` |
| cantonment (Secunderabad) | `day` re-voiced for **clarinet and snare** (request a `cantonment` mood: Anglo-Indian band feel) | `night` |

Story cues use `music.play(id)`, and missions may set `music`.

### 12.5 Radio and walkman

Three fictional stations exist (`audio.js` STATIONS; bible §8.5):
- **Deccan Vani 101.2**, "*Aapki Farmaish*": `r_chandni` (filmi romantic ballad: synth strings,
  tabla, 88 bpm), `r_barish` (rainy Irani-café ghazal-pop: harmonium and guitar, 76 bpm).
- **Band Baaja 93.5**, "*Shaadi Special*": `r_baraat` (brass band baraat, 132 bpm), `festival`.
- **Pop Patang 104.8**, "*Countdown Express*": `r_neon` (Indipop synth, 116 bpm, natural minor),
  `r_pager` (Telugu-pop dance, 124 bpm, synth bass, a Mohanam hook).

DJ chatter and dedications are text toasts only, never lyrics. The walkman plays the found
cassette songs in the order found, then the radio band (§3.5).

---

## 13. UI flows

All UI is DOM over the canvas (ARCHITECTURE §10): tin-sign panels, the VHS on-screen display and
the cassette J-card motif. Fonts: Yatra One (display), Baloo 2 (body), VT323 (OSD).

### 13.1 Title and start

1. **Boot splash** → **title** (bible §1.1): the J-card over Charminar at dusk, OSD `■ STOP  --:--`.
   Menu: `▶ PLAY` · `▶▶ CONTINUE` (shown only with a save; subtitle = save meta: "TRACK 05 · TUE
   1 APR 2003 · ₹23") · `SETTINGS` · `CREDITS`.
2. **▶ PLAY** unlocks audio inside the gesture. If a save exists, it first asks "Record over Side
   A? Your saved game will be replaced." [Yes / No].
3. **Name card** (a DOM card, no `prompt()`; bible §2.1): "Your name in the colony" (default
   Chinnu, max 12 letters) and "Your name on the exam paper" (default Srikanth), then
   [▶ START]. Letters and spaces only; trimmed; empty means the default. On touch the on-screen
   keyboard shows.
4. **Prologue** cutscene (≈ 60 s). Hold ACTION for 1 s or tap "SKIP ▶▶" to skip.
5. M1 auto-starts on `home_terrace`.
6. **▶▶ CONTINUE** unlocks audio, runs `N.game.continueGame()`, and resumes at the saved spot with
   the OSD `▶ PLAY` card for 1.5 s.

### 13.2 HUD (in play)

As ARCHITECTURE §10, plus:
- **Top-left:** VHS OSD (`▶ PLAY  TUE 14 JAN 2003  07:10`, `↻` while the week loops), the tape
  counter `SIDE A 083` (greyed `■ PAUSED` in the interlude), and the district name.
- **Top-right (tin signs):**
  - money `₹ 12.50`;
  - the energy bar with the tummy notch and the chai-glass icon;
  - the **Chappal Meter**: 5 slippers, the next one filling with heat, two sizes on Chand Raat.
- **Top-centre column:** objective, timer, toasts (never overlapping).
- **Bottom-left:** minimap with blips (§14.2 shapes) and the quick-item slot.
- **Context prompt:** desktop "E — Ride Chetak"; touch ACTION label.
- **Banners:** MISSION PASSED (with the J-card line), MISSION FAILED, PAKDA GAYA!, THAK GAYA!,
  chapter cards, "SIDE A ▶ RESUMED".
- **REC prompt:** `● REC` pulsing beside the tape counter.

### 13.3 Pause (Esc / P / PAUSE / Start)

The panel is a cassette deck with buttons:
**Resume** · **Map** · **Journal** · **Settings** · **Save & quit to title** (free roam only; "Save
at a booth or finish the mission first" otherwise) · **Quit mission** (during a mission: aborts
to its marker) · **Quit to title** (warns "Last saved 14 minutes ago").

The clock stops. Audio ducks to 50%.

### 13.4 Full map (M / MAP / Back)

| Feature | Rule |
|---|---|
| View | `N.world.renderMap` styled like a 1999 city guide map (paper colour, red arterials, blue lake). District names in English, Telugu and Urdu-style lettering where known |
| Pan / zoom | drag, arrow keys or WASD; mouse wheel, pinch, or + / −; 3 zoom levels (whole city, district, neighbourhood) |
| Layers (toggles) | Story (giver and goal), Services (bus hubs, STD, cafés, barbers; all shops with `city_map`), Collectibles (found ones as ticks; hints during viewpoint reveals), Jobs |
| Place card | tap or ACTION on an icon: name, kind, hours, "Visited ✓", a trivia teaser |
| Waypoint | right-click, long-press, or ACTION on empty ground: a pink route on the minimap (A* over the road graph). Cleared on arrival or by a second press |
| Legend | blip shapes with colour-blind-safe outlines (§14.2) |
| Close | M, Esc, or the ✕ (44 px) |

### 13.5 Journal (J / LB / Pause → Journal)

Tabs come from bible §12.6, plus the systems pages. ←/→ or Q/E switch tabs, ↑/↓ scroll, Esc
closes. On touch the tabs scroll sideways like cassette spines.

| Tab | Content |
|---|---|
| **Story so far** | *Mera Yaadgaar Saal*: the diary lines with Vimala Ma'am's red ink |
| **Side A** | the track list with J-card lines. **Replay** any finished mission after the credits |
| **Clues** | the active clue in Immu's hand, hints taken, nudges unlocked |
| **The Tin** | tokens collected |
| **The Lock** | the 4 riddles and digits found (`_ 4 _ _`) |
| **Kites / Golis / Cassettes / Tickets** | per-series lists with hints and found ticks. The cassette page plays songs and memos |
| **Nanna's album** | developed prints, empty photo corners, captions at 16 |
| **Trivia cards** | verified facts [V], unlocked by places, tickets, frames and books |
| **Hyderabadi dictionary** | bible §10 plus §17 here |
| **Jobs** | levels, best times, earnings |
| **Stats** | money earned and spent, *udhaar*, times caught (PAKDA GAYA), THAK GAYA count, puris eaten, best brick score, km cycled, cows honked at |

### 13.6 Shop, STD and travel menus

- **Shop menu** (§5.1): a tin-sign list with price and effect icons. Hours show when closed.
- **STD booth**: a cabin view with a red meter; options per §5.4. Calls play as a short dialogue
  with the phone's crackle (`radio_static` low).
- **Bus routes**: the route board at the hub, with unlocked destinations in white paint and
  locked ones as "?" plus "Find Ticket Thatha's ticket at this stop".
- **Auto ride**: the destination list (discovered places + objective), then the fare quote with
  [Pay ₹X] [Bargain] [*Nakko*].

### 13.7 Mission, busted and exhausted flows

As §6 and §4.10–4.11. Banners always come before chapter title cards. `N.hud.ask` cards are big
(buttons 56 px tall) and keyboard-reachable (ACTION / Esc).

### 13.8 Settings

| Section | Options |
|---|---|
| Audio | master, music, SFX, radio, ambience (0–100, persisted by audio.js), mute, mono |
| Display | reduced motion; VHS effect strength 0–100 (default 60); screen shake on/off; night darkness (night overlay max 0.55 / 0.7 / 0.8); HUD scale 80–130%; minimap rotates with heading on/off; flash reduction |
| Text | text speed: slow 25 / normal 45 / fast 90 characters per s / instant; auto-advance dialogue off / on (2 s after the line); subtitles for barks on/off; glossary tooltips on/off; large text (+20%) |
| Controls | touch handedness (right / left); joystick floating or fixed; button size S / M / L; run hold or toggle; vibration on/off; key reminders on the HUD on/off |
| Gameplay | difficulty preset (§14.1); hint nudges off / normal / fast; collectible beacon on/off; glints on/off; minigame assist on/off; chappal slow-motion assist on/off; "Let Immu do it" offers on/off |
| Accessibility | colour-blind blips (off / deuteranopia / protanopia / tritanopia; shapes are always on); high-contrast HUD; sound captions on/off |
| Data | "Erase saved game" (2-step confirm). Shows whether storage is available ("Saves last only this session" when localStorage fails) |

### 13.9 Save and load

- **One slot** + `.bak` (ARCHITECTURE §12).
- Save points: STD booths, the booth at `irani_cafe_7`, MISSION PASSED, sleeping at home, and
  "Save & quit".
- No saves during missions, minigames, cutscenes, dialogue, the interlude, the ending or chases at
  level ≥ 3.
- Toast "SIDE A saved ●" with a spinning reel icon.
- **What is saved** (sections): `player` (position, vehicle, energy, tummy, money, inventory,
  items, statuses, hair), `clock` (date, time, loop window), `flags`, `missions`, `wanted`,
  `collectibles`, `shops` (hire state, khaata, daily-use flags, hidden-spot uses, parlour scores),
  `jobs` (levels, earnings), `minigames` (stats), `journal` (diary, trivia unlocked, hints taken),
  `settings` (separate key).
- **Load** validates first, restores, shows the OSD `▶ PLAY` card, and starts the player at the
  saved spot. If that spot is in a respect zone or in water, he is moved to the nearest valid
  cell.

### 13.10 Credits

The J-card scroll (bible §9.4), reachable from the title screen at any time and played after the
epilogue. Hold ACTION to speed up 4x; Esc to leave.

---

## 14. Difficulty and accessibility

### 14.1 Difficulty presets

The default is **Normal**. The preset can be changed at any time in Settings.

| Parameter | *Aaram Se* (relaxed) | Normal | *Full Meter* (hard) |
|---|---|---|---|
| Pursuer speed | ×0.85 | ×1 | ×1.1 |
| Pursuer and spotter sight radius | ×0.8 | ×1 | ×1.15 |
| Unseen time per level drop | 9 s | 12 s | 15 s |
| Chappal throw interval | 8 s | 6 s | 5 s |
| Chappal homing turn rates | ×0.7 | ×1 | ×1.2 |
| Tummy drain | ×0.7 | ×1 | ×1.2 |
| Mission timers (W2) | ×1.25 | ×1 | ×0.9 |
| Cargo damage (W3) | ×0.75 | ×1 | ×1.2 |
| Minigame difficulty offset | −0.15 | 0 | +0.15 |
| PAKDA GAYA fine | ₹1 | ₹2 | ₹3 |
| Hint nudge times | ×0.6 | ×1 | ×1.5 |
| Prices, rewards | same | same | same |

### 14.2 Accessibility features

| Feature | Rule |
|---|---|
| **Reduced motion** | no screen shake; no VHS roll or tracking lines (only a static scanline tint); camera zoom eased over 1.2 s instead of 0.4 s; banners fade instead of sliding; pseudo-3D lean `PERSP` ×0.6; pigeon bursts at half the particles; the clap minigame's lamp flashes become fades |
| **Flash reduction** | camera flash, lightning and "perfect!" flashes become 0.3 s fades at most 30% white. On by default when reduced motion is on |
| **Text speed** | §13.8. "Instant" shows whole lines. ACTION always completes a line first |
| **Colour-blind-safe blips** | every blip has a **unique shape and a dark outline**, never colour alone: giver ◆ diamond (yellow `#f2c230`), goal ◯ ring (pink `#ff5fb0`), shop ■ square (teal `#2a8c82`), STD booth ☎ glyph, bus hub ▭ bar, collectible ★ star, pursuer ▲ triangle (red), spotter ! glyph. Colour-blind modes swap to the Okabe–Ito palette (orange `#E69F00`, sky blue `#56B4E9`, bluish green `#009E73`, vermillion `#D55E00`, reddish purple `#CC79A7`, yellow `#F0E442`) and keep the shapes. The Chappal Meter's slippers fill with a stripe pattern as well as colour |
| **Big touch targets** | minimum 48 CSS px (default M), L = 64 px buttons and a 96 px ACTION. Menu rows at least 48 px tall. Spacing at least 8 px |
| **One-handed / left-handed** | mirrored touch layout; run toggle; auto-advance dialogue |
| **Hold → toggle** | run can be a toggle; held minigame inputs (kite pull, antenna turn) accept a tap-to-toggle in Assist mode |
| **Sound captions** | important sounds show a caption with a direction arrow at the screen edge: "[whistle ↗]", "[chappal whoosh ←]", "[dog barking ↓]", "[bus horn]", "[● REC]". Required for the chase to be fair without sound |
| **Subtitles and glossary** | bark subtitles; `*word*` slang tooltips (tap and hold on touch) |
| **Assists** | minigame assist; chappal slow-motion; "Let Immu do it" after 3 fails; timer +25% after 2 fails |
| **High contrast** | HUD panels go fully opaque dark with white text; outlines on markers |
| **Mono audio** | sums panning; the beacon becomes a rate-only cue |
| **Pause anywhere** | including cutscenes (they hold their position) and minigames |

---

## 15. Reconciliation notes (changes other modules must make)

| # | Module | Change | Why |
|---|---|---|---|
| 1 | entities.js | default `money` **1000** (not 2500); add `tummy` (start 80) with drains and the energy cap (§2.2); `feed(n)`; statuses (§2.3); serialize them | bible start ₹10; food must matter |
| 2 | core.js | `N.clock.baseDate = [2003, 0, 14]` (now 1999); the elastic week loop helper (§10.5); clock frozen outside `play` | bible §12.2 |
| 3 | hud.js | tummy notch on the energy bar; tape counter; heat-filling slipper; two-size chappals; `↻` loop mark; quick-item slot; sound captions | §13.2, §14.2 |
| 4 | audio.js | **remove `temple_bell` from the `birla_mandir` emitter** (it has no bells); add the NEW SFX in §12.2; `hitec` and `cantonment` moods; no azaan or chant synthesis | bible §1.5; respect |
| 5 | minigames (staging) | add `bargain` skins `kite`, `farmer`, `books` (§8.7). Side-list rewards: brickgame **₹0** + refund ₹1 on a win (now pays ₹3 for a ₹1 game: a money printer); kite ₹2 per cut (cap ₹10/day); antenna and clap free play ₹0; cricket ₹2/₹5; marbles ₹2 (₹5 vs Tiger); **max 3 paid wins per minigame per game-day** | §2.4, §8 |
| 6 | worlddata.js | add NEW ids from the bible: `irani_cafe_19` (+ alias `cafe_noor_e_iran`), `recording_centre_1`, `electronics_shop_1`, `charminar_gallery`; `flower_cart_5`..`8` in the Dilsukhnagar Sai temple lane (the bible uses `flower_cart_5`); rename the `irani_cafe_7` sign to "Café Gulistan"; podium flags on the `junction` places that have a constable; `respect` polygons for every worship compound plus a 30 u forecourt | bible §3, §12 |
| 7 | world.js / render.js | **roof zones** (walled terraces with stairs; §7.3) for `home_terrace`, the M1 lootna terraces, antenna jobs and Patang Chacha's roof | M1, collectibles |
| 8 | vehicles.js | `noEnter` for the player on `bus` and `lorry` (debug still works); kid-at-the-wheel factors (§3.1); bike surface factors; falls (§2.6); punctures; story types (§3.2) | tone, §3 |
| 9 | traffic.js | mix, density and AI (§3.4), peds and animals (§11), "AUTO!" hailing, bus stops and boarding | §3, §11 |
| 10 | wanted.js | the full §4 | stub today |
| 11 | shops.js | §5 catalogue, hours, menus, services, hire state, khaata | stub today |
| 12 | missions.js | the J-card start prompt (§6.1); "Let Immu do it" and timer help (§6.3); `kind: 'side' / 'job'`; meter policies; refuse saves during missions | §6 |
| 13 | collectibles.js | §7 (series, glints, beacon, viewpoints, the total-finds ladder) | stub today |
| 14 | menus.js | §13 flows (name card, journal tabs, settings list) | — |

---

## 16. Must-have places → systems (canonical ids)

This complements the bible's story matrix (§3.3). Every row is used by at least one system.

| Must-have | Ids | Systems use (this file) |
|---|---|---|
| Koti bus stand | `koti_bus_stand` | bus hub fast travel (§3.6); Ticket Thatha's ticket trade-in (§5.16, §7); auto stand and `bargain who:'auto'`; T01 at `bus_stop_1` |
| Gokul Chat | `gokul_chat` | chaat shop (§5.10); pani-puri challenge (§8.6); energy refill |
| Birla temple | `birla_mandir`, `flower_cart_11` | respect zone (§4.8); prasadam (§2.2); viewpoint (§8.14); F04 from the road; K5 at the stair foot; **no bell sound** (§12.3) |
| Hussain Sagar | `hussain_sagar`, `buddha_statue`, `tank_bund`, `necklace_road`, `lumbini_park`, `lumbini_jetty` | boats (§3.7); races R1, R2 (§8.13); bhutta and coconut carts (§5.9); musical fountain (§5.15); pigeons; water blocks walking (§2.5) |
| Prasads IMAX | `prasads_imax` | tin fence + K6 gap until 24 Jul; from 25 Jul giant-screen shows ₹50, lobby AC cool-down, viewpoint, food counter (§5.15, §4.6, §8.14) |
| NTR Gardens | `ntr_gardens` | entry, mini train ride ₹5 as a viewpoint, Machan tree, snacks (§5.15); K7, F08 |
| Public Gardens | `public_gardens`, `state_museum`, `jawahar_bal_bhavan` | gully cricket with the mali interruption (§8.4); museum ₹2 walk-only (§5.15); SA4; G06 |
| LB Stadium | `lb_stadium`, `fateh_maidan`, `electronics_shop_1` | SA4 dawn camp; TV-window crowd zone (§11.5); K4 (occlusion), F19 |
| Rythu Bazaars | `rythu_bazaar_mehdipatnam`, `rythu_bazaar_erragadda`, `rythu_bazaar_saroornagar` | vegetable shop (§5.13); the Rythu list job (§9); `bargain who:'farmer'` |
| Mozamjahi Market | `mozamjahi_market`, `karachi_bakery`, `famous_ice_cream` | ice-cream cool-down (§4.6, §5.12); bakery tins (§5.8); pigeons; F01, G07 |
| Nampally station | `nampally_station` | platform-ticket shortcut ₹3; weighing-machine hint; book stall (§5.16); F03; T03 stop |
| Kachiguda station | `kachiguda_station`, `chappal_bazar` | platform ticket, weighing machine (§5.16); `kotha_chappal` level-5 clear (§4.6, §5.14); F02 |
| Imlibun bus stand | `imlibun_bus_station` | bus hub (§3.6); enquiry window; Ramoji off-map trip (post-game) |
| Assembly | `assembly`, `gandhi_statue_assembly`, `gun_park` | the sentry as a constable spotter (§4.4); the rude-choice meter rule (§4.2); F20 |
| Dilsukhnagar Sai Baba temple | `dilsukhnagar_sai_temple`, `flower_cart_5`..`8`, `banana_cart_8` | respect zone; Thursday crowd ×1.8 and prasadam +15 (§2.2, §11.2); flower and banana carts (§5.9) |
| RTC X Roads and cinemas | `rtc_x_roads`, `sandhya_theatre`, `sudarshan_theatre`, `odeon_theatre`, `devi_theatre`, `bawarchi` | cinemas: tickets, time skip, meter −2 (§5.15); Pochaiah's home podium (§4.4); queue cages (§8.12); cut-out helper job (§9); Bawarchi biryani (§5.11); T08 |
| Schools | `school_1`..`school_13` (+ `_ground`) | gate carts (gola, pani puri; §5.9); bell schedule (§12.3); school-hours spotter rule (§10.5); grounds for gully cricket; C15 |
| Kirana stores | `kirana_1`..`kirana_20` | shop (§5.3); Mango Masti bribe (§4.6); hide behind the sacks (§4.7); khaata; bottle deposits; errands job (§9) |
| Banana and flower vendors | `banana_cart_1`..`10`, `flower_cart_1`..`12` | snacks and the peel gag (§4.7, §5.9); jasmine for Mummy (§4.6); garlands; `bargain` |
| Stationery shops | `stationery_1`..`8` | school kit, slam book, brown cover (SA7), the **city map** unlock (§5.14); cut-out job supplies (§9) |
| Flour mills | `pindi_girni_1`..`7` | girni dabbas job (§9); grinding and atta (§5.14); power-cut silence; chilli-day sneeze |
| Colony playgrounds | `playground_1`..`16` | gully cricket and league (§8.4, §9); marbles (§8.8); lootna landing zones (§9); SA1 night watch (§8.16); raddi cart; G01, G03–G05 |
| Irani cafés | `irani_cafe_1`..`19` and aliases | chai and Osmania refills (§5.2); family-room cool-down (§4.6); jukebox; sit-and-wait; THAK GAYA respawn (§4.11); STD save at `irani_cafe_7` |
| **Charminar** (the ending) | `charminar`, `charminar_plaza`, `charminar_gallery`, `irani_cafe_19`, `gulzar_houz` | M12 chase with its respect rules round the masjids (§4.4, §4.8); Ask the city (§6.5); viewpoint (§8.14); self-timer dash (§8.19); pigeons (§11.3); the `ending` music (§12.4); the 2026 lock dial (§8.20) |

---

## 17. Glossary (words used here that are not yet in bible §10)

Add these to `N.dialogue.glossary` and the Journal's Hyderabadi dictionary.

| Word / phrase | Tag | Meaning |
|---|---|---|
| *ab aap* | Hi | "now you" (clap minigame) |
| *apnapan* | Hi | belonging, "we're from the same place" (a bargaining tactic) |
| *band* / *band hai* | Hi | closed / it's closed |
| *bas* | Hi | enough, stop |
| *champi* | Hi | head massage |
| *chapak!* | Hi | splash! (sound word) |
| *dhadaam!* | Hi | crash! thud! (sound word) |
| *ghanta* | Hi | an hour (also "bell") |
| *hawa* | Hi | wind |
| *jaata hoon* | Hi | "I'm leaving" (walking away while bargaining) |
| *khabri* | Dk | an insider who knows all the news |
| *khaao* | Hi | eat! |
| *licence dikhao* | Hi | show your licence |
| *mauke* | Hi | chances |
| *mol-bhaav* | Hi | bargaining |
| *nihari* | Dk | slow-cooked breakfast stew of the Old City |
| *pandaga dabbulu* | Te | festival money given to children |
| *pehle Mummy ko sambhalo* | Hi | "first deal with Mummy" |
| *pet mein chuhe daud rahe hain* | Hi | "rats are running in my stomach": very hungry |
| *phir se suno* | Hi | listen again |
| *poora din* | Hi | the whole day |
| *pyaar* | Hi | love; here, charm |
| *raddi* / *raddi-wala* | Hi | old newspapers / the man who buys them by weight |
| *sabr* | Hi | patience |
| *saans phool gayi* | Hi | out of breath |
| *shant ho ke aao* | Hi | "come back calm" |
| *suno* | Hi | listen |
| *taali* | Hi | a clap |
| *ustad* | Dk | master, expert |
| *udhaar chukaya* | Hi | debt repaid |
| *neend aa rahi hai* | Hi | "I'm getting sleepy" |
| *gowli* | Dk/Te | traditional milkman |
| *dhobi* | Hi | washerman |

