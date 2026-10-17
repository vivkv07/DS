# NOSTALGIA: Research on the user's must-have places

Purpose: field notes on every place and everyday element in `design/places_registry.md`, for
map makers (`src/worlddata.js`), landmark artists (`src/landmarks.js`), street-life and
shop builders, the story writers, and the Journal's trivia ("trump") cards.

Read with `design/research_places.md` (city geography, Old City, anachronism list) and
`design/research_culture.md` (prices, games, slang). This file adds detail and does not repeat
them. Where something is already covered there, this file points to it.

**Tags (same as research_places.md).**
- A plain statement was checked against at least one web source during this research (Oct 2026;
  sources in section 7). Where sources disagree, both values are given.
- **(unverified)**: plausible but not confirmed. Fine for flavour, never for a trivia card.
- **(derived)**: worked out from verified facts.
- **[~]**: a memory-range value, mostly prices. Fine for gameplay, never for a trivia card.
- **(legend)**: folklore. Never present it as fact.

**Hard rules for everything below.**
- Several of these places later saw tragic events. Do not reference them or hint at them in
  any text, art, trivia card or rumour.
- Religious places (`birla_mandir`, `dilsukhnagar_sai_temple`, plus any mosque, dargah or temple
  next to a location) are shown with respect. No chases, no mischief, no Chappal Meter gain
  inside them. The player walks, and footwear is left at the stand by the gate.
- No real private individuals: shop founders, owners and cinema owners stay unnamed. Do not name
  living politicians or film stars. Films are referred to obliquely ("a 1989 college-gang hit").
- Signboard text uses the place's name only, with no logos. The generic names suggested for
  everyday shops are invented. Do not use the famous real names listed in each section.

**Scale used for drawing suggestions.**
- Heights: one storey ≈ 3 m ≈ **10 u**, so 1 m of height ≈ 3.3 u.
- Footprints: about Charminar's ratio (≈ 32 m real → 60 u, so ≈ 1.9 u per metre). Big sites
  (parks, stadium, bus station) are compressed further, and the suggested sizes say so.
- All footprint and height numbers are **suggestions**. `map_plan.md` and `worlddata.js` decide.

---

## 0. Map sheet: where everything is

### 0.1 Distances and directions (real city, approximate, ±300 m)

Each cell says how far the place is and in which direction, *as seen from* the reference
column. The "Buddha" column stands for Hussain Sagar. "Offset" is km east (E) and north (N) of
Charminar, matching the table in research_places.md §1.1. All values are **(derived)** from
approximate coordinates.

| id | From Koti bus stand | From Abids (GPO) | From the Buddha | From Charminar | Offset from Charminar |
|---|---|---|---|---|---|
| `koti_bus_stand` | — | 1.4 km SE | 3.6 km SSE | 2.9 km NNE | E 1.2, N 2.6 |
| `gokul_chat` | 0.3 km NE | 1.5 km ESE | 3.5 km SSE | 3.1 km NNE | E 1.4, N 2.8 |
| `birla_mandir` | 2.9 km NW | 1.7 km NNW | 1.2 km SSW | 5.0 km N | W 0.6, N 5.0 |
| `buddha_statue` (lake) | 3.6 km NNW | 2.6 km N | — | 6.0 km N | E 0.0, N 6.0 |
| `prasads_imax` | 3.7 km NNW | 2.5 km NNW | 0.9 km WSW | 5.8 km N | W 0.9, N 5.7 |
| `ntr_gardens` | 3.4 km NNW | 2.2 km NNW | 0.7 km SW | 5.6 km N | W 0.5, N 5.6 |
| `public_gardens` | 2.3 km NW | 1.0 km NW | 1.9 km SSW | 4.2 km N | W 0.6, N 4.2 |
| `assembly` | 2.2 km NW | 0.9 km NNW | 1.8 km SSW | 4.2 km N | W 0.4, N 4.2 |
| `lb_stadium` | 2.0 km NW | 0.9 km N | 1.7 km S | 4.3 km N | E 0.0, N 4.3 |
| `rythu_bazaar_mehdipatnam` | 5.0 km W | 3.9 km W | 4.5 km WSW | 5.2 km NW | W 3.8, N 3.5 |
| `rythu_bazaar_erragadda` | 9.7 km NW | 8.5 km NNW | 6.4 km NW | 11.5 km NNW | W 4.4, N 10.6 |
| `rythu_bazaar_falaknuma` (optional) | 6.1 km SSW | 6.6 km S | 9.2 km S | 3.2 km S | W 0.6, S 3.2 |
| `mozamjahi_market` | 1.5 km W | 0.9 km SSW | 3.4 km S | 2.6 km N | W 0.3, N 2.6 |
| `nampally_station` | 2.0 km WNW | 0.8 km W | 2.7 km SSW | 3.5 km N | W 0.7, N 3.4 |
| `kachiguda_station` | 1.7 km ENE | 2.7 km E | 4.0 km SE | 4.2 km NE | E 2.8, N 3.1 |
| `imlibun_bus_station` | 0.9 km SW | 1.6 km SSE | 4.1 km S | 2.0 km NNE | E 0.6, N 1.9 |
| `dilsukhnagar_sai_temple` | 4.8 km ESE | 6.1 km ESE | 7.7 km SE | 5.6 km E | E 5.6, N 0.7 |
| `rtc_x_roads` (+ 4 cinemas) | 2.6 km NNE | 2.7 km ENE | 2.6 km ESE | 5.5 km NNE | E 2.4, N 4.9 |

### 0.2 Clusters for the compressed map (advice)

Keep these neighbourhoods tight and keep their relative directions true:

1. **Koti cluster:** `koti_bus_stand` and `gokul_chat` share a street. `imlibun_bus_station` is
   a short ride south-west, on the Musi's north bank. Sultan Bazaar and Badi Chowdi
   (clothes and books) lie just west and north-west.
2. **Abids–Nampally cluster:** `mozamjahi_market` is at the big junction south-west of Abids.
   `nampally_station` is west of Abids. `public_gardens` (with `assembly` on its east edge) is
   north of the station. `lb_stadium` is just east of the Assembly, across the road.
3. **Lake cluster:** `birla_mandir` is on a rocky hill at the lake's south-west corner, looking
   down on Lumbini Park and the `buddha_statue`. `ntr_gardens` and `prasads_imax` sit side by
   side on the south-west shore where Necklace Road begins.
4. **East cluster:** `kachiguda_station` is east-north-east of Koti. `rtc_x_roads` with its
   cinemas is about 2 km north of Kachiguda, east of the lake.
5. **Far east:** `dilsukhnagar_sai_temple` sits beyond Malakpet on the highway east. Put it near
   the east edge of the map.
6. **West and north-west:** `rythu_bazaar_mehdipatnam` sits at the Mehdipatnam junction on the
   road to Golconda. `rythu_bazaar_erragadda` is far out (11 km), so fold it in past Ameerpet.
   An optional third, `rythu_bazaar_falaknuma`, would sit about 3 km south of Charminar, near
   the finale.
7. **Charminar** stays the southern anchor (see research_places.md §2A and §2 of this file).

### 0.3 What exists on which in-game date

| Date | State |
|---|---|
| **Thu 14 Jan 1999** (HUD date) | MGBS is 5 years old and Bawarchi about 5. Necklace Road is brand new. The seated Gandhi statue at the Assembly is new (1998). Kachiguda has **no overhead electric wires** (electrified 2003). The NTR Gardens site is a fenced, cleared plot. There is no Prasads, and **no Rythu Bazaars yet**. Ramzan is in its last week: Eid al-Fitr fell on about **19 Jan 1999** (most calendars; one lists 13 Jan; the Indian date depends on the moon sighting). |
| 18 Jan 1999 | Sandhya 70mm turns 20 (derived from an 18 Jan 1979 opening; one source says 1980). |
| 26 Jan 1999 | The first Rythu Bazaars open (one source says the first Hyderabad one opened 20 Jan). |
| 8 Nov 1999 | Record one-day match at `lb_stadium` (see its entry). |
| 2000–Dec 2001 | NTR Gardens built in phases. Work began Jan 2000, was briefly halted by a court case, and the Wikipedia infobox gives 15 Dec 2001 as its creation date. |
| 25 Jul 2003 | Prasads IMAX opens. |

**Story hook (advice; the story team decides).** On 14 Jan 1999, Sankranti kites, the Numaish
fair and the last nights of Ramzan all overlap. Eid's eve (*Chand Raat*, about 18 Jan 1999) is
the traditional all-night bangle-shopping night around Charminar and Laad Bazaar. That night
makes a natural, joyful setting for the Charminar finale (see §2).

---

## 1. Landmark dossiers

Each dossier covers: **Map** · **Dates and 1990s state** · **From above** · **From the street**
· **A 90s kid here** · **Sounds and smells** · **Game use (suggestions)** · **Trump card**.

### 1.1 `koti_bus_stand`: Koti bus stand (city bus terminus)

**Map.** On the main road in front of **Koti Women's College**, which is the old British
Residency compound. A present-day source places the terminus "at women's college of Koti,
opposite Andhra Bank, and government hospital". Neighbours:
- **Sultan Bazaar** (clothes, shoes, wedding shopping) and **Badi Chowdi** (academic books)
  just west.
- `gokul_chat` about 300 m away on Women's College Road.
- MGBS 0.9 km south-west, Abids 1.4 km north-west, Kachiguda 1.7 km east-north-east.

Today's stops at Koti send buses towards Dilsukhnagar, Malakpet, LB Nagar and Uppal (from the
Women's College side), towards Secunderabad (from the stop opposite Andhra Bank), and towards
Afzalgunj and Nampally (from another stop). This is a present-day listing; the 90s routes are
**(unverified)** but plausible.

**Dates and 1990s state.**
- The Residency was commissioned in 1803 (completed around 1805). It became Osmania University
  College for Women in 1949, so "Koti" (from *kothi*, mansion) names the whole area.
- In the 90s this is a busy roadside terminus for red-and-cream APSRTC city buses
  (research_culture §4). It is a set of bays and shelters, not a building.

**From above.**
- A wide apron of oil-stained asphalt (`ROAD`, about 220 × 70 u, compressed).
- Two to four long thin shelters (each about 90 × 10 u, roof at 25–30 u) on steel-pipe posts.
  Roofs are concrete slab or corrugated sheet, grey with rust streaks.
- Painted queue railings in yellow and black, or APSRTC red.
- A tiny controller's booth (about 12 × 12 u, h 25 u) with a window and a register.
- Buses (62 × 18 u) parked nose-in at an angle, in red `#b22b2b` with a cream band.
- Behind runs the long compound wall of the Residency with huge old shade trees.
- The footpath is lined with hawkers' carts and mats.

**From the street.**
- Route-number plates and destination boards on the shelters, in Telugu and English
  (and sometimes Urdu, **(unverified)**).
- Film posters pasted on walls; red paan stains at the base of pillars.
- A conductor with a leather cash bag, a ticket punch and a whistle.
- Through the Women's College gate: a glimpse of the Residency's 40 ft Corinthian columns and
  its stone lions.

**A 90s kid here.**
- Catching the bus to school or tuition; the monthly student bus pass.
- Being yelled off the footboard: show it as a scolding, never as fun.
- Buying second-hand textbooks and guides in Badi Chowdi and Sultan Bazaar.
- Eid, Diwali and Sankranti clothes shopping in Sultan Bazaar, then chaat at `gokul_chat`.
- City ticket ₹1–3 [~].

**Sounds and smells.**
- *Sounds:* idling diesel engines, the conductor's double whistle, "*Right, right!*", destination
  calls ("*Dilsukhnagar! Malakpet! LB Nagar!*"), the clack of the ticket punch, horns, newspaper
  boys.
- *Smells:* diesel, roasted groundnuts, hot samosas, jasmine from the flower sellers, and wet tar
  in the monsoon.

**Game use (suggestions).**
- The hub of the bus fast-travel network.
- A mission start (an uncle arrives with a parcel).
- A collectible punched bus ticket.
- A queue minigame: board before the bus leaves.

**Trump card.** "Koti gets its name from the British Residency's *kothi* (mansion) of 1803,
a women's college since 1949."

---

### 1.2 `gokul_chat`: Gokul Chat

**Map.** Listings place it on **Women's College Road, Koti**, "opposite Koti Women's College",
on the road towards Kachiguda (addresses vary between listings). It is a few minutes' walk from
`koti_bus_stand`.
- Do not confuse it with the separate "Sri Gokul Chat" at Abids.

**Dates and 1990s state.**
- Started in the **1970s** and still family-run; described as "50 years" old.
- In 1999 it is a well-loved 20-something-year-old chaat house. Crowds are heaviest in the
  evening; a guide advises coming before 5 pm.
- Open from about 8:30 am to 11 pm today (90s hours unverified).

**From above.**
- A narrow, deep shop slot in a two- to three-storey row of shops: about 18 × 36 u, enlarged
  so it reads.
- A cloth or tin awning over the footpath.
- A blob of crowd sprites on the footpath, and scooters (Chetaks, Kinetics) parked in a row.
- A kulfi stall right beside the entrance. Reviewers mention it today; whether it was there in
  the 90s is **(unverified)**.

**From the street.**
- Open front with a rolling shutter, no glass.
- A steel counter piled with: a glass box of golden puris, a big steel pot of hot *ragda*
  (white-pea curry), steel cans of spiced *pani* (water), and bowls of green and sweet-tamarind
  chutney.
- Inside: cramped tables and stools, tube lights, a ceiling fan, steel shelves.
- A painted board reading **GOKUL CHAT** in English and Hindi letters (no logo).
- The kulfi man works an earthen pot (*matka*) packed with ice and salt, with cone-shaped
  aluminium moulds.

**A 90s kid here.**
- The pani-puri ritual: the vendor fills and hands puris one by one until you say stop.
- The last free dry puri (*sukha puri*) or "*ek extra*".
- Samosa-ragda, called the must-order dish.
- Dahi puri, bhel, papdi chaat, chole kulcha and mirchi bajji (all named in reviews).
- Kulfi afterwards.
- A treat after Sultan Bazaar shopping with Amma.
- Prices [~]: pani puri ₹3–5 a plate, samosa-ragda ₹5–8, kulfi ₹3–5.

**Sounds and smells.**
- *Sounds:* the crack of a puri, steel spoons on steel pots, "*Bhaiya, teekha kam!*" (less
  spicy!), orders called out, traffic.
- *Smells:* tamarind, roasted cumin, mint, chaat masala, hot ragda, and cardamom from the kulfi.

**Game use (suggestions).**
- A food shop (energy refill).
- A **pani-puri challenge** minigame: tap "one more" before the spice bar fills.
- A gossip source for clues (the counter hears everything in Koti).
- A kulfi-stick collectible.
- Keep it purely joyful (registry rule).

**Trump card.** "Koti's most famous chaat house has been serving samosa-ragda since the
1970s."

---

### 1.3 `birla_mandir`: Birla Mandir (Venkateswara temple)

**Map.** On **Naubat Pahad**, a rocky hillock about **280 ft (85 m)** high, on a 13-acre plot.
- Address today is Hill Fort Road, Khairatabad side, at the south-west corner of Hussain Sagar.
- The neighbouring ridge carries the Birla Planetarium (1985) and Science Museum (1990), about
  0.5 km south-west (research_places).
- Lumbini Park and the old Secretariat are below to the north-east.
- Ravindra Bharathi, the Assembly and Public Gardens are about 1 km south.
- It looks straight out over the lake to the Buddha (1.2 km).

**Dates and 1990s state.**
- Built over **ten years** (start often given as 1966) and opened in **1976** by a senior monk
  of the Ramakrishna Mission. In the 90s it is already a city icon.
- About **2,000 t of white marble**, sourced from Rajasthan. One source says 200 t was
  imported, so sources conflict.
- Styles: **Dravidian, Rajasthani and Utkala (Odisha)**.
- The presiding deity is **Lord Venkateswara**, a granite idol about **11 ft** tall with a
  carved lotus canopy, with separate shrines for **Padmavati** and **Andal**.
- The walls carry teachings of saints.
- The temple deliberately has **no bells**, to keep it calm for meditation.

**From above.**
- A granite hill (`ROCK` boulders `#8f8a86`, pink granite `#b89a8f`, scrub `GRASS`) about
  280 × 220 u.
- A road loops up one face and a long stair climbs another. Which faces is **(unverified)**:
  pick whatever reads best.
- On top, a white marble complex (about 150 × 110 u) of courtyards and terraces with
  balustrades looking over the lake. It contains:
  - the **main tower** over the sanctum: a tall, ribbed, curving Odisha-style spire, about
    30 × 30 u at the base, drawn about 70–100 u high (exact height unverified);
  - a **Dravidian gateway tower** (gopuram) with stepped tiers at the entrance;
  - smaller shrine towers;
  - pillared marble halls.
- Colours: marble `#f3efe6`, shade `#d9d2c3`, gold finials `#d4a640`, a small saffron flag.
- At night it is floodlit white and visible from Tank Bund (practice, **(unverified)** for the
  90s).

**From the street.** You see a white crown on a dark granite hill, a busy gate below, footwear
counters, flower and coconut stalls outside the gate, and steps rising into the marble.

**A 90s kid here.**
- Climb the steps, leave chappals at the counter for a token, and hop across sun-hot marble in
  socks.
- Look for the Buddha from the parapet; prasadam (exact items unverified).
- An exam-season prayer with Ammamma.
- The same outing usually includes the Birla Planetarium sky show next door.
- Entry is free.

**Sounds and smells.**
- *Sounds:* soft devotional music (instrumental only in-game), murmured prayers, wind, distant
  traffic, and the flap of kites in January. No bells.
- *Smells:* incense, camphor, jasmine and marigold, cool marble.

**Respect rules.** No running or chasing anywhere on the hill-top. The Chappal Meter is frozen
on the hill and cannot rise. Footwear is left at the gate stand.

**Game use (suggestions).**
- A **viewpoint**: reaching the parapet reveals the lake-side landmarks on the full map.
- A calm escort errand: help Ammamma up the steps.
- A trivia card at the gate.

**Trump card.** "Birla Mandir has no temple bells, by design, so it stays quiet for
meditation."

---

### 1.4 `hussain_sagar` and `buddha_statue`

Basics (1562 lake, Tank Bund statues, Lumbini Park 1994, Necklace Road 1996–98) are in
research_places.md §2E. Additions:

**Buddha statue.**
- About **18 m (58 ft)** tall, cut from a **single block of white granite** found near
  **Raigiri, Bhongir**, about 46 km from Hyderabad.
- It weighs **350 t** in some sources and **450 t** in others.
- It stands on a **red lotus pedestal** on a platform built in the lake, nicknamed the
  "**Rock of Gibraltar**". It was erected in 1992 (12 Apr; dedicated 1 Dec; sources differ).
- *From above:* a small island platform (about 40 × 40 u) with steps down to a boat landing.
  The red lotus pedestal ring is about 15 u high. The statue stands about 60 u above the
  pedestal; from above you read the head, shoulders and folded robe in pale granite
  `#e9e4da`. Pigeons sit on its shoulders.
- *Note:* keep the statue's history to "stood up on its rock in 1992".

**The lake from above.**
- Water `#2f7f86` → `#3f9aa0`, with weedy margins near the edges.
- **Tank Bund** is a straight raised road on the east and south-east, with lamp posts and the
  statue plinths of Telugu greats.
- **Lumbini Park** is at the southern tip, with a jetty for the launch boats to the Buddha.
- **Necklace Road** is a new curve along the west and north (palm planting **(unverified)**).
- **NTR Gardens** and **Prasads** sit on the south-west shore (see below).

**A 90s kid here.**
- Evening on Tank Bund: roasted *bhutta* (corn cob), peanuts in paper cones, kulfi carts.
- The boat to the Buddha from Lumbini Park. Paddle and motor boats run from there today;
  90s boat types are **(unverified)**.
- Cycling on the brand-new Necklace Road.
- Ganesh immersion night: lorries carrying idols along Tank Bund.
- Prices [~]: Lumbini entry ₹2–5, boat ride ₹10–20.

**Sounds and smells.**
- *Sounds:* wind, water slapping on stone, the putter of boat motors, the bells of ice-cream
  carts, Tank Bund traffic, crows at dusk.
- *Smells:* lake water near the edges, roasting corn, charcoal smoke from vendors' carts.

**Game use (suggestions).**
- A boat minigame.
- A collectible reachable only by boat on the Buddha's platform.
- The sunset viewpoint from Tank Bund.

**Trump card.** "The Buddha in Hussain Sagar was carved from one single block of white granite,
found near Bhongir."

---

### 1.5 `prasads_imax`: Prasads IMAX (post-90s, era-noted)

**Map.**
- On **Necklace Road**, on the lake's south-west shore, right beside `ntr_gardens` to its
  west and north-west.
- The Khairatabad side and the railway line are behind it; Sanjeevaiah Park is further north.
- About 0.9 km west-south-west of the Buddha.

**Dates.**
- Opened **25 July 2003** as Prasad IMAX (LV Prasad Group). It was **India's third IMAX theatre**.
- The big hall has **630 seats**. Wikipedia gives the screen as **64 × 101.6 ft**, "the biggest
  in India". That figure is reported for the screen as rebuilt in 2022; an older figure of
  about 72 × 92 ft also circulates.
- The complex has about **235,000 sq ft** of floor space with **six screens**, a food court and
  shopping on two levels (three in another source).
- The IMAX name lasted until **2014**, when the hall became Prasads' own large format, "PCX".

**Era handling (registry: must be in, honestly).**
- **In 1999:** a fenced lakeside plot with a corrugated-tin fence, a site-office shed and a big
  painted hoarding reading *"COMING SOON — INDIA'S BIGGEST SCREEN"*. Kids peek through a gap,
  and a collectible can sit inside the fence.
- **Late game or "years later" (2003):** the fence is gone and it is open; it can host a
  flash-forward scene or a postcard in the ending.

**From above (2003).**
Shapes are **(unverified)**; check photos before drawing.
- About 180 × 130 u in all.
- A tall, windowless block for the giant-screen hall: about 70 × 60 u, h about 90 u, dark
  grey-blue.
- A lower, wider block of glass and cladding (about 110 × 110 u, h 40 u) for the mall and food
  court.
- A forecourt car park facing Necklace Road.
- The sign reads just **PRASADS**, plus film banners. The lights reflect in the lake at night.

**A kid here (2003+).**
- The first giant-screen documentaries (space, oceans, dinosaurs) and 3D glasses.
- The food court; popcorn (the multiplex era's signature smell).

**Sounds and smells.** The bass rumble leaking from the hall, crowds, the chill of the air
conditioning, popcorn and new carpet.

**Trump card.** "Prasads opened on 25 July 2003 as India's third IMAX theatre."

---

### 1.6 `ntr_gardens`: NTR Gardens (post-90s, era-noted)

**Map.** At the south-west corner of the lake, where Necklace Road begins, next to the old
Secretariat and Lumbini Park, with `prasads_imax` on its far side. About 0.7 km south-west of
the Buddha.

**Dates and site history.**
- The site was the **Hussain Sagar Thermal Power Station**, decommissioned in 1992 and
  **demolished in 1995** (research_places).
- **1999:** land set aside for a memorial to N. T. Rama Rao (film star and former Chief Minister,
  died 1996).
- Work began in **January 2000** and was briefly halted by a court case. It was built in phases
  from 1999 to 2001; Wikipedia's infobox gives **15 Dec 2001** (a travel site says 2002).
- Size: **36 acres** (55 acres is the whole plot).

**Features (today; the opening year of each is unverified).**
- The memorial.
- An entrance plaza with **Nandi (bull) statues**.
- Fountains and a **waterfall**.
- A **Japanese garden**, bonsai and a **desert (cactus) garden**.
- The **"Machan" tree-house restaurant**: a multi-storey eatery built to look like a tree, with
  a trunk of concrete and branches of green-painted fibreglass.
- A **car café**.
- A **mini train** round the park. Sources disagree: one calls it a toy train ("Pearl City
  Express"), another a monorail.
- A children's play area and souvenir shops.

**Era handling.**
- **14 Jan 1999:** a fenced, levelled plot of red soil (`GROUND #b5694a`) with chunks of old
  concrete foundation and a HUDA hoarding (*"NTR Gardens — Work in Progress"*).
- An optional kids' rumour about "the old power station's ghost" is invented and must be
  labelled as fiction.
- **2000–01:** bulldozers (JCBs), saplings in rows, half-built waterfall rocks.
- **Open (2001+):** the giant concrete tree is the signature silhouette.

**From above (open).**
- About 300 × 220 u (compressed), with curving paths through lawns.
- The Machan tree: a brown trunk about 12 u wide, a canopy disc about 34 u across in mottled
  green, h about 50 u.
- A waterfall rock pile with blue spill; a thin loop of toy-train track round the edge.
- Nandi statues flank the entrance plaza (`PLAZA`).

**A kid here (2001+).** A toy-train ride, eating "in a tree", photos by the waterfall.

**Sounds and smells.** Fountains, a toy-train whistle, birds; cut grass, wet soil.

**Trump card.** "NTR Gardens grew on the site of the old Hussain Sagar power station,
demolished in 1995."

---

### 1.7 `public_gardens`: Public Gardens (Bagh-e-Aam)

**Map.** In Nampally, north of Nampally station and south of Lakdikapul and Ravindra Bharathi.
- The `assembly` sits on its **east edge**, facing the road to Basheerbagh and `lb_stadium`.
- About 1.0 km north-west of Abids and 4.2 km north of Charminar.

**Dates.**
- Laid out in **1846** according to most sources (an MIT architecture record says 1872). It is
  the **oldest park in the city**.
- Things inside or on its edge:
  - the **old Assembly** (Town Hall, 1905–1913; see `assembly`);
  - **Jubilee Hall**: Wikipedia's infobox says completed 1913; one source says built 1905 for
    the 6th Nizam's coronation jubilee; extended for the 7th Nizam's silver jubilee in 1937;
  - the **State Archaeology Museum**;
  - **Jawahar Bal Bhavan**;
  - **Lalitha Kala Thoranam** (open-air theatre), Indira Priyadarshini Auditorium and Telugu
    University.
- The museum was set up in 1930 or 1931, and its exhibits moved to the present building in 1952.
  It has two floors of **semicircular galleries** and an **Ajanta gallery** of replica cave
  paintings.
- The museum also holds an **Egyptian mummy** believed to be **Princess Naishu** (Ptolemaic
  era), about 2,100–2,400 years old. It was gifted to the 7th Nizam and is the school-trip star.
- Jawahar Bal Bhavan is in an **iron bungalow** that was the Nizam-era "Ajanta Pavilion". It
  became a children's recreational home in the **1950s**.
- The Numaish fair itself began at Public Gardens in 1938 before moving next door
  (research_places).

**From above.**
- About 380 × 300 u (compressed): lawns (`GRASS`), red-gravel paths, flower beds, a fountain
  circle.
- Big old shade trees (rain trees, banyans, palms; species **(unverified)**).
- Low walls with iron gates.
- Cream and white lime-plaster Nizam-era buildings with arches and small domes. The museum is a
  curved, semicircular block.
- The Bal Bhavan bungalow has iron verandahs painted green or grey **(unverified)**.

**From the street.** Iron gates, a watchman, ice-fruit and peanut carts at the gate, and
morning walkers in white canvas shoes.

**A 90s kid here.**
- A school trip to the museum ("the mummy!").
- **Bal Bhavan** weekend classes and summer camps: painting, dance, music, clay (specific
  classes **(unverified)**).
- Picnics on the lawn and kite flying in January.
- Then a walk across the road to the Numaish fair in season.

**Sounds and smells.**
- *Sounds:* koels, parakeets, crows, the fountain, kids' shouts, the watchman's whistle.
- *Smells:* wet lawn, neem, frangipani (*champa*), roasting peanuts at the gate.

**Game use (suggestions).**
- A hide-and-seek collectible hunt.
- A museum clue (match a replica Ajanta painting).
- A Bal Bhavan friend NPC who gives an art or drawing minigame.

**Trump card.** "The State Museum in Public Gardens keeps a 2,000-year-old Egyptian mummy."

---

### 1.8 `assembly`: Legislative Assembly (old Town Hall)

**Map.**
- On the east edge of `public_gardens`, about 0.4 km west of `lb_stadium`.
- About 0.9 km north-north-west of Abids.

**Dates and 1990s state.**
- Built **1905–1913** as the **Town Hall**, with funds raised from citizens to mark the
  **40th birthday of Nizam Mahbub Ali Khan**.
- Style: Indo-Saracenic, described as a mix of **Rajasthani and Persian** styles, **all white**.
- A **newer Assembly building** stands right beside it. It was inaugurated in 1985 (one source
  says 1980) and is set in green lawns.
- In the 90s this was Andhra Pradesh's legislature. Which chamber met in which building that
  decade is **(unverified)**.
- To every kid the white 1913 building *is* "the Assembly": draw that one as the landmark, with
  the plainer modern block behind it.
- A massive **seated Gandhi statue** at the entrance park was added in **1998**, so it is brand
  new in 1999.
- The old building was later restored as the Legislative Council (2020s). That is post-era;
  ignore it.

**From above.**
- A long, symmetrical white block about 150 × 60 u, walls h about 30 u.
- A large central **portico** projecting towards the road.
- **Cupolas and domes**: a main dome rising to about 55 u, plus small domed kiosks (*chhatris*)
  at the corners and along the parapet (layout **(unverified)**).
- Arched verandahs.
- Front lawn with the seated Gandhi on a plinth (about 12 × 12 u).
- Iron railings, a gate and police sentry boxes.
- Colours: white `#f2efe8`, shade `#dcd6ca`, slightly warm domes.
- Optional: outlined in light bulbs on 26 Jan, 15 Aug and 1 Nov (AP Formation Day)
  **(unverified practice)**.

**A 90s kid here.**
- Seen from the bus window; craning to see the lights on Republic Day.
- Never a place to play. Keep politics off-stage.

**Game use (suggestions).**
- The "Republic Day lights" photo side activity on 26 Jan.
- A collectible on the lawn edge outside the fence. The gate is guarded and cannot be entered.
- If the player loiters at the gate, a police whistle sends them away; the Chappal Meter does
  not need to rise.

**Trump card.** "The old Assembly was built as a Town Hall, paid for by citizens as a 40th
birthday gift for the Nizam."

---

### 1.9 `lb_stadium`: Lal Bahadur Shastri Stadium (Fateh Maidan)

**Map.** In Basheerbagh / Fateh Maidan.
- About 0.9 km north of Abids and 0.4 km east of the Assembly.
- Basheerbagh junction is to the north-east. Other neighbours (Nizam College, Gun Foundry) are
  **(unverified)**.

**Dates and 1990s state.**
- **Fateh Maidan** ("victory ground") was the Mughal camp during the 1687 siege of Golconda,
  and later a polo ground.
- First Test: India v New Zealand, **November 1955**.
- Renamed after Lal Bahadur Shastri in 1967 (some sources say 1960).
- Capacity is usually given as **25,000** (other sources say 30,000 or 40,000).
- It has **floodlights** (installation year unverified).
- Part of the complex: an **indoor stadium** (badminton, tennis), a **swimming pool** and a
  **shopping complex**.
- 1990s matches:
  - one-day internationals;
  - a women's Test, India v England, **10–13 Dec 1995**;
  - **8 Nov 1999, India v New Zealand**: India made 376/2, two batsmen put on a **331-run
    second-wicket stand** (then the highest partnership for any wicket in one-day
    internationals), one scored **186 not out** (the ground's highest score), and India won by
    **174 runs**.
- It also hosted football. Fateh Hyderabad FC is listed as a tenant (era unverified).
- Its last international match was in 2005, after the Uppal stadium opened (post-era).

**From above.**
- About 260 × 220 u (compressed) in all.
- An oval field (`GRASS #4f7a3a`, mowing stripes) with a pale pitch strip (`#c9b27a`) in the
  middle.
- A ring of grey concrete terraced stands (`#9a958c`, about 30 u thick, stepping up to
  40–60 u).
- A covered pavilion stand on one side (which side **(unverified)**).
- **Four lattice floodlight towers** at the corners: the tallest things in the district
  (h about 120–140 u; real height unverified).
- An outer road ringed by the shops of the shopping complex.
- The indoor-stadium box and the pool block nearby.

**From the street.** Ticket windows with iron queue cages, painted stand numbers,
sports-goods and other shops in the shopping complex (90s tenants **(unverified)**), and crowds
with flags on match days.

**A 90s kid here.**
- Queueing at dawn for a match ticket; a transistor radio pressed to the ear for the
  commentary.
- Paper flags, face paint, Mexican waves.
- Watching from nearby rooftops when tickets are sold out.
- Buying a tennis ball or a "stitch ball" nearby.
- Prices [~]: ODI ticket ₹50–250.

**Sounds and smells.**
- *Sounds:* the roar of the crowd, whistles, *dappu* drums, PA announcements, the "tock" of
  bat on ball.
- *Smells:* roasted peanuts, samosas wrapped in newspaper, cut grass, dust.

**Game use (suggestions).**
- Venue for the **cricket minigame** and the "lost match ticket" errand.
- A "ticket stub, 8 Nov 1999" collectible.
- The crowd's roar can be heard across the district on match days.

**Trump card.** "On 8 Nov 1999, two Indian batsmen added 331 runs here: then the biggest
partnership in one-day cricket."

---

### 1.10 `rythu_bazaar_*`: Rythu Bazaars (farmers' markets)

**Dates.**
- Launched **26 January 1999** (Republic Day) by the then Chief Minister of undivided Andhra
  Pradesh. One study says the first Hyderabad market opened on 20 January 1999.
- Government-run markets where **small and marginal farmers sell perishables directly to
  shoppers, with no commission agents**.
- Planned on at least **one acre**, with **sheds, drinking water, toilets, weighing scales and
  storage for unsold produce**.
- Each is run by an **Estate Officer** under the agricultural marketing department.
- **Erragadda** was observed with about **300–400 farmers trading on weekdays**.
- A study names Erragadda and Falaknuma (Hyderabad district), and Mehdipatnam, Kukatpally,
  Saroornagar and Vanasthalipuram (Rangareddy district). Each market's opening year is
  **(unverified)**.
- A **daily price board** at the gate is a common memory but **(unverified)**.

**Recommended instances.**
- `rythu_bazaar_mehdipatnam`: west, at the Mehdipatnam junction on the road to Golconda.
- `rythu_bazaar_erragadda`: north-west, the big one; fold it in past Ameerpet.
- Optional third: `rythu_bazaar_falaknuma` (south of Charminar, close to the finale) or
  `rythu_bazaar_saroornagar` (east, near Dilsukhnagar).
- **Gate them to open on 26 Jan 1999.** Before that date, show the site with a painted banner:
  *"Rythu Bazar — Opening Republic Day"*.

**From above.**
- A rectangular plot of about 160 × 120 u inside a compound wall, with an arched gate and a
  painted board reading **RYTHU BAZAR** in Telugu and English.
- Inside, four to six long parallel open sheds (each about 140 × 18 u, roof h 20–25 u):
  steel trusses with grey corrugated asbestos or GI roofs (`#9aa0a3`) streaked with rust.
- Each shed is split into numbered stalls on knee-high platforms.
- Bright heaps of produce: tomato red, brinjal purple, okra and leafy greens, onion pink,
  potato tan.
- Gunny sacks and blue and red plastic crates.
- A small office with the price board and a water tank.
- Cycle and scooter stands outside the gate, and autos waiting.

**From the street.** Mornings are packed. Farmers in white shirts and *lungis* or *panche*
(dhoti), women farmers in cotton saris, beam balances with brass pans and iron weights, and
customers with cloth bags.

**A 90s kid here.**
- Carrying Amma's cloth bag and hunting for the cheapest tomatoes.
- Getting a free bunch of curry leaves or coriander as *kosaru* (Telugu: the little extra
  thrown in).
- Munching a raw carrot or green peas.
- Prices [~] in 1999: tomatoes ₹4–8/kg, onions ₹5–10/kg, potatoes ₹6–9/kg, brinjal ₹4–8/kg,
  leafy greens ₹1 a bunch, coriander 50 p–₹1 a bunch, bananas ₹6–12 a dozen.

**Sounds and smells.**
- *Sounds:* Telugu price calls ("*Tamata kilo aidu rupaayalu!*", tomatoes ₹5 a kilo), the
  clink of iron weights on the scale pans, crates being dumped, a tempo truck reversing.
- *Smells:* coriander, curry leaves, crushed tomato, wet gunny sacks, earthy potatoes.

**Game use (suggestions).**
- A **budget errand**: buy a shopping list under a money limit.
- An odd job: help a farmer unload a tempo.
- A collectible hidden in a stack of crates.

**Trump card.** "Rythu Bazaars opened on Republic Day 1999 so farmers could sell straight to
shoppers, with no middlemen."

---

### 1.11 `mozamjahi_market`: Moazzam Jahi Market

**Map.**
- At the busy traffic junction about 0.9 km south-south-west of Abids, 1.5 km west of Koti and
  2.6 km north of Charminar.
- Roads lead to Abids, Nampally, Afzalgunj and Begum Bazaar. Exact road names are
  **(unverified)**.
- **Karachi Bakery's** first shop (1953) is here.
- Nampally and the Exhibition Grounds are a short walk north-west.

**Dates.**
- Built **1933–35** by the City Improvement Board as a produce market.
- Named after **Prince Moazzam Jah**, the junior prince who was the Board's president (son of
  the last Nizam).
- **Exposed granite** in the Osmanian / Indo-Saracenic style.
- A **two-storey octagonal clock tower** shows **clocks on alternate faces** and is the
  market's tallest part.
- The fruit market moved to **Kothapet** in the **1980s**, so the 90s market is shops, dry
  fruits, flowers and ice cream.
- It was neglected for decades and restored in **2018**. In the 90s it is weathered and dusty,
  and the clocks may or may not run **(unverified)**.
- **Famous Ice Cream** has served from the market's arches since **1951**. Flavours include
  mango, sitaphal (custard apple), chikoo and malai, served in steel bowls (weak source).

**From above.**
- A roughly polygonal block (about 140 × 110 u) of single-storey granite shop arcades around an
  inner courtyard.
- The **octagonal clock tower** stands on the corner facing the junction: about 18 u across,
  h about 50 u, with a small cupola. The tower's top shape is **(unverified)**.
- Arched shop bays with rolling shutters; a parapet with small battlement-like crenellations.
- Colours: granite `#8f8a86` with darker joints. Painted shop boards in primary colours. At
  night the ice-cream fridges glow white.
- Traffic swirls round the block.

**A 90s kid here.**
- **Ice cream** after Sunday shopping at Abids.
- **Fruit biscuits** from Karachi Bakery as a gift box for relatives.
- Dry fruits before festivals; mangoes in May.
- Prices [~]: a scoop ₹5–10; fruit biscuits ₹10–20 for ¼ kg (research_culture).

**Sounds and smells.**
- *Sounds:* traffic circling the junction, shutters rattling up, the scoop's click on steel
  bowls, rickshaw horns.
- *Smells:* ripe mango, warm butter biscuits, cardamom milk, exhaust.

**Game use (suggestions).**
- An ice-cream shop (energy and cool-down).
- A gift-box errand to Karachi Bakery.
- A clue: "meet me when the tower's clock says four" (whether it works is a puzzle).

**Trump card.** "Moazzam Jahi Market's octagonal clock tower (1935) shows clocks on alternate
faces only."

---

### 1.12 `nampally_station`: Nampally (Hyderabad Deccan) station

**Map.**
- At Nampally, about 0.8 km west of Abids.
- Public Gardens is to the north-east and the Exhibition Grounds (Numaish) to the south-east
  (derived).
- Mozamjahi Market is a short walk south-east.

**Dates.**
- Built **1907** in the Nizam's era. It began as a goods siding and saw its **first passenger
  train only in 1921**.
- The name is popularly traced to *nam* (wet) + *pally* (place) **(unverified etymology)**.
- Style is described as Deccan or a European / Indo-Saracenic blend, with an **arched,
  symmetrical entrance**.
- It is a **terminus**: trains end here **(unverified this session; widely known)**.
- The **Charminar Express** (named after the monument) runs between Hyderabad Deccan and
  Chennai (its year of introduction is unverified).

**From above.**
- A long, low station building of about 160 × 36 u (h about 30 u) with a symmetrical front.
- A central entrance block with arches; corner turrets or small domes **(unverified)**.
- Behind it, four to six platforms (each about 300 × 12 u) under long canopies of corrugated
  sheet on cast-iron columns. Use railway red-brown `#7a3b2e` for the canopies.
- Tracks end in **buffer stops** at the building end.
- A forecourt (about 160 × 60 u) packed with autos.
- The facade colour is **(unverified)**: check a photo. Use pale ochre or cream with white trim
  until then.

**From the street.** Red-shirted porters with brass arm badges, a station bookstall
(comics, Chandamama, film magazines), chai vendors with kettles, and families with tin trunks
and holdalls.

**A 90s kid here.**
- Seeing off relatives; a platform ticket costs ₹2–3 [~].
- Buying a comic for the journey; watching the engine reverse onto the train.
- The thrill of the Charminar Express name.

**Sounds and smells.**
- *Sounds:* PA announcements in Telugu, Hindi and English after the chime, diesel horns,
  porters calling "*Coolie? Coolie?*", "*Chai, garam chai!*", steel wheels squealing.
- *Smells:* diesel, fried snacks, sweet tea, jasmine in passengers' hair.

**Game use (suggestions).**
- A train-arrival mission (meet Nani; carry the trunk).
- A collectible on the last platform.
- A Numaish shortcut next door.

**Trump card.** "Nampally station was built in 1907 but waited until 1921 for its first
passenger train."

---

### 1.13 `kachiguda_station`: Kachiguda (Kacheguda) station

**Map.**
- In Kachiguda, about 1.7 km east-north-east of `koti_bus_stand` and 4.2 km north-east of
  Charminar.
- RTC X Roads is about 2 km north.
- **Chappal Bazar** is a neighbourhood in Kachiguda. That is a gift for a Chappal Meter joke;
  the origin of its name was not found.
- The area's name is popularly traced to the **Kachhi** community **(unverified etymology)**.

**Dates.**
- Inaugurated **10 June 1916** under the 7th Nizam, built as the **headquarters of the Nizam's
  Guaranteed State Railway**.
- Most sources call it **Gothic** with **domes and minarets**. Others say Indo-Saracenic with
  Gothic touches: *chhatris* (small domed kiosks), *chajjas* (sloping sun-shades), carved
  brackets, *jalis* (stone lattices), domes with lotus motifs and finials, and wooden staircases
  inside.
- One source credits the architect Vincent Esch **(unverified)**.
- **Metre-gauge heritage:** part of a line first called the Godavari Valley Light Railway.
- In **1967** the Ajanta Express from Kachiguda to Manmad was **India's fastest metre-gauge
  train**.
- The station was **electrified in 2003**, so in 1999 there are **no overhead wires** and
  trains are diesel.
- Today it is the headquarters of the railway's Hyderabad division and is being modernised.
  Facade lighting and the redevelopment are post-era.

**From above.**
- A long symmetrical two-storey facade (about 180 × 40 u, h about 25 u).
- A big **central dome** (radius about 12 u, top at about 55 u) flanked by smaller domes.
- Slender **minaret towers** at the corners and ends (radius about 3 u, h about 60 u).
- *Chhatris* along the roofline and an arched ground-floor verandah.
- Platforms with canopies behind; a forecourt with a small garden and autos.
- Colour: **(unverified)**; check a photo. Placeholder: walls `#e6d3a3`, white trim, domes
  `#d9c8a0`.

**A 90s kid here.**
- Trains south and west; metre-gauge rattle.
- "*Kachiguda*" said fast by the conductor.
- In the Ganesh festival, a big idol at Chappal Bazar. One source calls it the city's second
  biggest; its 90s status is **(unverified)**.

**Sounds and smells.** Diesel horns, the clatter of narrow-gauge wheels, announcements,
pigeons in the domes; diesel, chai, jasmine.

**Game use (suggestions).**
- A timetable-puzzle clue.
- A "find the station's founding date on the foundation plaque" trivia pickup.
- Chappal Bazar can host a comic Chappal Meter side mission (a lost chappal hunt).

**Trump card.** "Kachiguda station opened on 10 June 1916 as the headquarters of the Nizam's
own railway."

---

### 1.14 `imlibun_bus_station`: Imlibun bus stand (MGBS)

**Map.**
- On the **north bank of the Musi** at Imlibun, between Afzalgunj and Chaderghat.
- About 0.9 km south-west of Koti, 1.6 km south-south-east of Abids and 2.0 km north-north-east
  of Charminar.
- The State Central Library and Osmania General Hospital lie west along the bank
  (research_places).
- The old **Gowliguda "Mississippi hangar"** city bus depot is nearby and still standing in the
  90s.

**Dates.**
- *Imli-bun* = **"grove of tamarind trees"**.
- The old **Central Bus Station** was a **converted 1930s aircraft hangar**, a US-made
  prefabricated structure (Butler), used for the Nizam's single- and double-decker buses.
  Sources disagree on whether it came from the US or the UK and on its transfer date
  (1932 or 1946).
- The present station was **built in 1994**, partly on filled-in Musi riverbed, and named
  **Mahatma Gandhi Bus Station**.
- Today it covers about **20 acres** with **79 platforms** (one source says 150) and is India's
  fifth-largest bus station.

**1990s state.** Brand new and the pride of APSRTC. Long-distance buses leave for the whole of
Andhra Pradesh (Vijayawada, Tirupati, Srisailam, Warangal, Kurnool and so on) and neighbouring
states. Bus colours for each service class are **(unverified)**; use APSRTC red for express
buses.

**From above.**
- A very large rectangle of about 300 × 170 u (compressed), circled by roads.
- A long central concourse building.
- Rows of parallel or angled platform bays under long canopies (canopy and roof shape
  **(unverified)**; check a photo).
- The **Musi** along the south edge: a wide `SAND` bed with a thin weedy channel.
- The old hangar nearby: a long curved steel shed. One source calls it "dome-shaped".

**From the street.** Destination boards per platform in Telugu, Urdu and English. A reservation
counter, a waiting hall, magazine stalls, and families sitting on trunks.

**A 90s kid here.**
- The summer-holiday trip "to the village" (*ooru*, Telugu); window-seat fights.
- *Chandamama*, *Champak* or *Tinkle* bought for the ride.
- Cucumber with chilli salt; Amma's tamarind rice (*pulihora*) in a steel box.
- Prices [~]: Hyderabad–Vijayawada express ₹60–90.

**Sounds and smells.**
- *Sounds:* PA calls by platform number, conductors chanting "*Warangal! Warangal!*", engines
  revving, the hiss of air brakes, porters.
- *Smells:* diesel, mirchi bajji frying, jasmine, the river.

**Game use (suggestions).**
- Off-map trips by long-distance bus (cutscene).
- A meet-the-uncle-from-the-village mission.
- The hangar as a secret set-piece (it is in research_places).

**Trump card.** "'Imlibun' means a grove of tamarind trees, and the Nizam's first buses lived
in an imported aircraft hangar."

---

### 1.15 `dilsukhnagar_sai_temple`: Sai Baba temple, Dilsukhnagar

**Map.**
- In **Dilsukhnagar**, at about 17.368 N, 78.527 E: about **5.6 km east of Charminar**,
  4.8 km east-south-east of Koti, out past Malakpet on the highway east.
- A travel guide places it on a **busy lane** with a small parking area and **iron barricades**
  separating it from the road.
- The Kothapet fruit market is nearby. It moved there from Jambagh in 1980, which matches
  Mozamjahi's fruit trade leaving.
- The locality is named after **Dilsukh Ram Pershad**, a landowner who turned his farmland
  into a residential colony.

**Dates.**
- Wikipedia gives the building as **completed in 1980**; another source dates devotees'
  visits from 1989.
- It has been very popular **since the 1990s, especially on Thursdays**, Sai Baba's day.
- Daily pooja and aarti in the Marathi tradition of Shirdi.
- A Thursday-evening palanquin procession at about 7:15 pm **(single travel source)**.

**From above.**
- A compact temple block (about 50 × 40 u), described as **modern and three-tiered**.
- Stack three stepped roofs (h 15, 28, 40 u) with a small crowning top and a saffron flag.
- Iron queue barricades snake out to the lane (a 40 u zigzag).
- Flower and offering stalls (8 × 6 u each) line the lane.
- Colours: cream and white walls, saffron and red accents **(unverified)**; check a photo.

**Inside (for a respectful cutscene card only).**
- A **white marble statue of Sai Baba** in the sanctum, which is part of the main hall.
- The walls carry pictures from his life.

**A 90s kid here.**
- Thursday evening with Ammamma: buying a rose garland, standing patiently in the queue,
  receiving prasadam.
- Buying a small Sai Baba photo or locket at a stall.
- Prices [~]: rose garland ₹5–10, marigold string ₹2–5, coconut ₹5.

**Sounds and smells.**
- *Sounds:* aarti singing (instrumental only in-game; no lyrics), a murmured "*Om Sai Ram*"
  in the queue, traffic on the main road.
- *Smells:* incense, roses, marigolds, camphor, ghee lamps.

**Respect rules.**
- No chases or mischief in the temple, the queue or the lane in front.
- The Chappal Meter is frozen here and cannot rise.
- Footwear is left at the stand. The player walks.
- Pursuers give up at the barricades and wait outside, grumbling.

**Game use (suggestions).**
- A Thursday side activity: help Ammamma through the queue.
- Buy the garland from a `flower_cart_*` outside.
- A trivia card from the flower aunty.

**Trump card.** "Thursday is Sai Baba's day, so this temple's biggest crowds come every Thursday
evening."

---

### 1.16 `rtc_x_roads` and its cinemas (`sandhya_theatre`, `sudarshan_theatre`, `odeon_theatre`, `devi_theatre`)

**Map.**
- The junction is at Chikkadpally / Musheerabad: about 2.6 km north-north-east of Koti,
  2.7 km east-north-east of Abids, 2.6 km east-south-east of the Buddha and 5.5 km
  north-north-east of Charminar.
- **Bus Bhavan** (APSRTC headquarters) is in **Musheerabad**, near the junction. It gives the
  crossroads its "RTC" name.
- The other name is **"Charminar Chowrasta"**, after the nearby **Charminar cigarette factory**
  of VST (Vazir Sultan Tobacco) in the Azamabad industrial belt. Mention the name origin only;
  show no smoking or cigarette brands.
- Which road runs to which neighbourhood (Musheerabad, Narayanguda, Ashok Nagar, Vidyanagar) is
  **(unverified)**.

**The cinemas (all single screens in the 1990s).**

| id | Facts | Notes |
|---|---|---|
| `sandhya_theatre` | **Sandhya 70mm** opened **18 Jan 1979** (one source says 1980); its first film was a Hindi one, with *Sholay* next. **Sandhya 35mm** next door, 1981. | **Bawarchi** biryani (**1994**) is next door. |
| `sudarshan_theatre` | **Sudarshan 35mm**, "nearly 50 years old" today, so it opened in the mid-1970s (derived). A first-day-first-show hall where film people come to watch the crowd react. | A separate Sudarshan 70mm site later became a multiplex (post-era). |
| `devi_theatre` | **Devi 70mm**. Films ran **over 100 days** here: a 1989 college-gang hit, a 1996 family romance and a 1997 devotional epic. | Same owner as Sudarshan 35mm (unnamed). |
| `odeon_theatre` | The **Odeon complex**: **Odeon 70mm, Odeon Deluxe and Mini Odeon**, the city's **first complex with three cinemas**. Its first film was reportedly the Hollywood musical *Camelot* **(unverified)**, which would date it to the late 1960s (derived). It closed in 2008. | The Odeon Mall that replaced it is post-era. |

Also at the junction: Sri Mayuri 70mm, Sapthagiri, and Usha Mayuri (Musheerabad). Hoardings
show **fictional film titles** only (registry rule).

**From above.**
- A big four-way junction (arterials 56–70 u wide) with a traffic island and a policeman's
  podium.
- Each cinema is a big box set back behind a forecourt, about 70 × 110 u:
  - the auditorium is a long windowless block (h about 45 u);
  - the front block (two to three storeys) carries the hall's name in giant letters.
- In the forecourt: **ticket counters with iron-bar queue cages** zig-zagging up to a tiny
  window, plus cycle and scooter stands.
- **Giant hand-painted cut-outs** of fictional heroes on scaffolding (planks about 4 × 20 u,
  h 50–60 u) face the junction, hung with garlands, flags and strings of festoon lights.
- Bawarchi: a small two-storey restaurant beside Sandhya with a painted board and a crowd at
  the takeaway counter.
- Colours: pastel or white facades with huge red and blue lettering; saturated poster colours
  on the cut-outs.
- At night: tube lights, neon, and bulbs chasing round the names.

**A 90s kid here.**
- The **first-day-first-show** at dawn on a Sankranti release: drums, cheering crowds,
  crackers drawn as harmless cartoon puffs.
- "Black" tickets (always a scolding moment); floor or bench class; the queue-cage shuffle.
- At the interval: samosa and a cool drink, peanut cones.
- The "100 days" celebration banners.
- A biryani parcel from Bawarchi for Abba.
- Prices [~] late 90s: floor or bench ₹2–5, first class ₹8–15, balcony ₹15–30; biryani ₹30–60 a
  plate (unverified).

**Sounds and smells.**
- *Sounds:* whistles and claps from inside when the hero appears, *dappu* drums, film songs
  from loudspeakers before the show (a common practice, **(unverified)** here; use original
  music only), auto horns.
- *Smells:* biryani steam (saffron, fried onion, ghee), samosas, petrol.

**Era guard.** No multiplexes, no digital posters, and no Odeon Mall or AMB-branded screens
(post-era).

**Game use (suggestions).**
- A "get the tickets before the show starts" crowd mission (no chase inside the halls).
- A **cut-out painting** art minigame.
- Bawarchi as a shop (a big energy refill).
- A collectible "film song booklet" (a cover only, never lyrics).

**Trump cards.**
- `odeon_theatre`: "The Odeon was Hyderabad's first complex with three cinemas under one roof."
- `sandhya_theatre`: "Sandhya 70mm opened in January 1979, and *Sholay* was its second film."

---

## 2. Charminar: notes for the finale

Charminar's architecture, dates and neighbours are in research_places.md §2A. These additions
are for the final mission and the closing scene.

- **The 1999 Charminar is a traffic roundabout.** The pedestrianisation project only had money
  sanctioned in **1999** (₹9.5 crore by the then MCH), and little work followed. City buses ran
  round it until the project was revived in 2006, when RTC buses were stopped.
  - So the finale can have buses, autos and cycle-rickshaws circling, then thinning out late at
    night.
- **Lighting.** Charminar's illumination is done **from outside** (floodlights), so at night
  draw it washed in warm light from below.
- **The four clock faces** (added 1889) can be read from all four approaches. They are useful
  for a "meet at midnight" beat.
- **Inside.** There are **149 steps** in each minaret to the gallery levels, and a mosque on
  the top floor. Whether the stairs were open to visitors in 1999 is **(unverified)**, so a
  climb should be a special, permitted moment. The top floor is a place of worship: no mischief
  there.
- **Around it.**
  - Laad Bazaar's bangle shops glitter to the west.
  - Gulzar Houz and its four arches are just north. Sankranti kites are sold there in January.
  - The Mecca Masjid courtyard and its pigeons are to the south-west; treat it with respect.
  - Nimrah café (1993) is beside it for an Irani chai.
- **The season.** Mid-January 1999 is the **last week of Ramzan**: Eid al-Fitr fell on about
  **19 Jan 1999** (most calendars). Charminar is a traditional Eid gathering place next to the
  Mecca Masjid.
  - The night before Eid (*Chand Raat*) is traditionally an all-night shopping night for
    bangles, mehendi and attar around Charminar and Laad Bazaar.
  - Show it with crescent-moon cut-outs, bulb strings, mehendi artists and families (keep the
    religious detail respectful and background).
- **Sensory palette for the ending.**
  - *Sounds:* bangles clinking in shop stacks, bargaining, pigeons' wings, and (respectfully,
    distant) the call to prayer.
  - *Smells:* attar (perfume oils), haleem steam in the season, jasmine, *gajra* (flower
    strings).

---

## 3. Everyday elements (many instances)

Each entry gives: **Look** (from above and from the street) · **Sounds** · **What they sold**
(with prices) · **Signboards** (invented and generic; use these, not famous real names) ·
**Ten lines** from the people who ran them, each with its meaning.

### 3.1 `school_*`: colony schools

**Look.**
- *From above:* a compound wall enclosing a dusty ground (`GROUND #b5694a`) with a flagpole and
  a small raised platform (*podium*) for assembly.
- An L- or U-shaped two- to three-storey building with long open verandahs. Classrooms open off
  them; railings are painted green or blue.
- Many colony schools were converted houses with an extra floor added.
- A water tank with a row of taps; a little canteen window; a cycle stand under a tin roof.
- *From the street:* an iron gate with a watchman's stool.
  - Painted mottoes on the wall: "Knowledge is Power", "Work is Worship".
  - Alphabet and cartoon murals for the primary section.
  - Vendors outside the gate at 12:30 and 3:30.
  - School autos (8–12 kids, bags hanging outside) and cycle-rickshaws waiting.
- Uniforms: white shirts with navy or grey shorts or pinafores, striped ties with an elastic
  band, belts, black shoes, white socks.
  - A "white uniform day" on Monday or Saturday was common **(unverified per school)**.
  - ID cards on a ribbon or clipped on (some schools).
- The **school bell** is a hanging iron plate or a length of rail, struck with a rod by the peon
  ("*tan-tan-tan*").

**Sounds.**
- The bell; morning prayer and pledge (original music only in-game).
- A chorus reciting times tables; chalk squeak; the PT whistle.
- 3:30 pm chaos at the gate.

**What was sold at the gate (school-gate vendors).**
- Ice gola (*kala khatta*, rose).
- **Ice Pepsi** (frozen coloured sachets and tubes, 50 p–₹1).
- **Fatafat** (tangy black pellets in paper twists).
- Candy floss.
- Pulled-sugar sweets shaped into rings and wristwatches.
- Coconut sweets, raw tamarind and *ber*, boiled groundnuts, cucumber with chilli.

Prices [~]: 25 p–₹2. Inside, the canteen sold samosa, biscuits and Rasna.

**Signboards (invented).**
- Format: **"\<Name\> High School (E.M.)"**. *E.M.* = English Medium; *T.M.* = Telugu Medium.
  Add "Recognised by Govt. of A.P.", "Estd. 1984" and an "ADMISSIONS OPEN" banner.
- Example names:
  - Little Buds Convent High School (E.M.)
  - Sri Vani Vidya Niketan (E.M. & T.M.)
  - Bright Star Grammar School
  - Morning Glory High School
  - Rose Garden Public School
  - Kalpana Vidya Mandir
  - Noble Pearl High School
  - Sunrise Model School
  - Vijaya Bharathi Vidyalayam
  - New Horizon Convent
- Avoid real school chains and famous real school names.

**Ten lines.**
1. **Watchman:** "*Gate band ho gaya! Late aaye toh principal ke paas jao.*" (Gate's shut! Late?
   Go to the principal.)
2. **PT sir:** "*Line mein! Attention! Stand at ease! Peeche wala, baatein nakko!*" (In line!
   You at the back, no talking!)
3. **Class teacher:** "*Silence! Monitor, talkers ke naam board pe likho.*" (Monitor, write the
   talkers' names on the board.)
4. **Telugu teacher:** "*Padyam appaginchu, tappulu lekunda.*" (Recite the poem by heart,
   without mistakes.)
5. **Maths sir:** "*Padamudu ekkam cheppu! Thirteen ones are thirteen...*" (Say your
   thirteen-times table!)
6. **English teacher:** "*Homework ekkada? Kukka tinesinda?*" (Where's the homework? Did the dog
   eat it?)
7. **Drawing teacher:** "*Camlin box nikalo. Compass se circle banao, kisi ko chubhana nahi!*"
   (Out with your geometry box. Draw circles with the compass, don't poke anyone!)
8. **Headmistress:** "*Shoes polish nahi kiye? Kal se white socks, white uniform, saaf!*" (Shoes
   not polished? From tomorrow: white socks, white uniform, clean!)
9. **Aaya (helper):** "*Baba, tiffin box bhool gaye? Amma gate pe khadi hai.*" (Forgot your tiffin
   box? Your mother's at the gate.)
10. **Peon at the bell:** "*Tan-tan-tan! Last bell! Dheere jao, bhaago mat!*" (Last bell! Walk,
    don't run!)

---

### 3.2 `kirana_*`: kirana (grocery) stores

**Look.**
- *From above:* a small shop (about 20 × 18 u) at the corner of a colony house or a market row.
  - A tin or concrete sunshade over the front.
  - Open gunny sacks on the step (rice, dal, sugar) with steel scoops.
  - A bicycle leaning on the wall.
- *From the street:* a wooden counter crowded with **glass jars with red plastic lids**
  (toffees, Kismi, Mango Bite, Poppins, Phantom, Fatafat, Hajmola).
  - The owner sits cross-legged on a raised platform behind it.
  - A brass-pan **beam balance** with iron weights.
  - **A cone of thread hanging from the ceiling**, used to tie paper packets folded from
    newspaper.
  - Wooden shelves up to the ceiling: soap stacks, tooth powder, Parle-G, bread, eggs in trays,
    Rasna, Boost/Bournvita/Horlicks jars, matchboxes, incense, *Lijjat*-style papad.
  - A red cool-drink fridge with glass bottles in crates; a kerosene-free **oil tin with a hand
    pump**.
  - A free calendar from a wholesaler on the wall; a small transistor radio.
  - Signs "*Aaj nakad, kal udhaar*" (cash today, credit tomorrow) and "No credit".

**Sounds.** The radio (cricket commentary or old film songs), paper tearing, the thread
snapping, coins on the counter, the fridge door's suck and thump.

**What they sold.** Everything from rice to razor blades. Kid buys [~]:
- toffees 25–50 p;
- Parle-G ₹1–2;
- a cool drink ₹4–7 with a bottle deposit;
- Rasna ₹10–15;
- a loaf of bread ₹5–8.
There is a *khaata* (credit book) for each family, settled at month's end.

**Signboards (invented).** Sri Lakshmi Kirana & General Stores · Balaji Provision Stores ·
Noor Kirana Merchant · Mahalaxmi Kirana · Agarwal Provisions · Sai Krishna General Stores ·
Zamzam General Stores · New Bharat Kirana · Hanuman Provision & Fancy · Raju Kirana & Bangles.
Painted on tin in red, blue and yellow, with "Prop:" and a 6- or 7-digit phone number.

**Ten lines.**
1. "*Kya chahiye, baba? Jaldi bolo, line hai.*" (What do you want, kid? Quick, there's a queue.)
2. "*Amma ne chitti di kya? Dikhao... ek kilo chawal, aadha kilo toor dal.*" (Did your mother
   give you a list? Show me... a kilo of rice, half a kilo of dal.)
3. "*Chillara ledu, rendu Kismi teesko.*" (Telugu: No change; take two toffees instead.)
4. "*Khaate mein likh diya. Mahine ke end mein abba aayenge na?*" (Put it on the account. Your
   dad's coming at month's end, right?)
5. "*Bottle wapas lana, warna deposit katega.*" (Bring the bottle back or you lose the deposit.)
6. "*Score kitna hua? Radio thoda zor se karo!*" (What's the score? Turn the radio up!)
7. "*Haath mat dalo barni mein! Kitte chahiye bolo.*" (Don't put your hand in the jar! Say how
   many.)
8. "*Naya Rasna aaya hai, orange wala. Garmi mein ek dum first class.*" (New orange Rasna's in.
   First class for summer.)
9. "*Ek baje dukaan band, chaar baje khulega. Beech mein nakko aana.*" (Shut 1 to 4. Don't come
   in between.)
10. "*Ruko, potli bandh deta... arre, ye dhaaga bhi kitta ulajh gaya!*" (Wait, I'll tie the
    packet... oh, this thread's all tangled!)

---

### 3.3 `banana_cart_*`: banana pushcarts

**Look.**
- *From above:* a four-wheeled wooden pushcart (*bandi*, about 26 × 14 u) with cycle wheels.
  - A sloping plank bed piled with banana "hands" in yellow, green and red.
  - A bamboo frame over it with whole bunches hanging from hooks.
  - Sometimes a faded umbrella or a sack-cloth shade.
- *From the street:* the vendor in a vest or shirt and a lungi, a cloth on his shoulder, and a
  hand-painted name on the cart's side panel.

**What they sold.** Chakkarakeli (sweet, thin-skinned), small *elaichi* bananas, green
*pacha arati* (raw bananas for curry), and the rarer red bananas. Sold **by the dozen** (*dazan*).
Prices [~]: ₹6–12 a dozen; red ones more. Puja bunches and leaves at festivals.

**Sounds.** His call, the cart's squeaky axle, the thump of a bunch landing on the plank.

**Signboards (painted on the cart).** "Amma Deevena" (Telugu: Mother's Blessing) · "Mother's
Blessings" · "Lucky Fruits" · "Sri Rama Fruit Bandi" · "Raju Bandi" · "Bismillah Fruits" ·
"Jai Bajrang" · "Shiva Sai Fruits" · "No. 1 Banana" · "Horn OK Please" (for fun).

**Ten lines.**
1. "*Arati pandlu! Chakkarakeli! Dazan aaru rupaayalu!*" (Bananas! Sweet chakkarakeli! Six
   rupees a dozen!)
2. "*Pakke hain, rang dekho. Kal tak aur meethe.*" (Ripe, look at the colour. Sweeter by
   tomorrow.)
3. "*Ganesh puja ke liye? Achhe wale alag rakhe hain.*" (For the Ganesh puja? I kept the good
   ones aside.)
4. "*Dazan pe ek kosaru, chhotu.*" (One extra free with the dozen, little one.)
5. "*Bandi ko dhakka mat do! Sab gir jaayenge.*" (Don't push the cart! They'll all fall.)
6. "*Pacha arati kooraki manchidi, amma ki cheppu.*" (Telugu: Green bananas are good for curry,
   tell your mum.)
7. "*Laal kele, special! Thoda mehenga, par taakat dekho.*" (Red bananas, special! A bit pricey,
   but full of strength.)
8. "*Chhilka sadak pe nakko phenkna, koi phisal jaayega!*" (Don't throw the peel on the road,
   someone will slip!)
9. "*Dopahar ko neem ke neeche khada hota hoon, dhoondna wahan.*" (At noon I stand under the
   neem tree; look for me there.)
10. "*Bandi pe likha hai 'Amma Deevena'. Amma ki dua se chalti hai.*" (My cart says Mother's
    Blessing. It runs on her prayers.)

---

### 3.4 `flower_cart_*`: flower vendors (carts and baskets)

**Look.**
- *From above:* a small cart or a flat bamboo basket on a stool (about 16 × 12 u), set near
  temple gates, bus stops and market corners.
  - Heaps of white jasmine, orange *kanakambaram* (firecracker flower), yellow *chamanthi*
    (chrysanthemum), marigold (*banthi*), red and pink roses, and green tulsi and leaves.
  - A wet cloth over the heaps; a steel mug of water for sprinkling.
  - Garlands hang from a bamboo pole.
- *From the street:* usually a woman vendor ("flower aunty", *poolamma*) **stringing jasmine with
  thread at lightning speed**, measuring each length **from elbow to fingertip** (*moora*, a
  cubit). Flowers are wrapped in a banana leaf or newspaper.

**What they sold.**
- Jasmine strings for hair and *gajra* (flower bracelets).
- Garlands for temples, weddings and photos of elders; loose flowers for daily puja.
- Prices [~]: jasmine ₹2–5 a *moora*, marigold garland ₹5–10, rose garland ₹10–25, single rose
  ₹1.

**Sounds and smells.** Her call, water drops, temple bells nearby; overwhelming **jasmine at
dusk**, marigold's bitter green smell, roses.

**Signboards.** Usually none. At most a painted tin: "Sri Lakshmi Flower Stall" · "Sai Flower
Merchants" · "Gulshan Phool Wale" · "Mallepoolu Corner" · "Shubh Vivah Flower Decorators" ·
"Rose & Jasmine" · "Padma Flowers" · "Noor Gajra House" · "Temple Flowers" ·
"Kalyana Pushpa".

**Ten lines.**
1. "*Mallepoolu! Moora rendu rupaayalu!*" (Jasmine! Two rupees a cubit!)
2. "*Haath se naap ke deti hoon, kam nahi.*" (I measure it with my arm, never short.)
3. "*Kanakambaram, chamanthi, banthi... amma jada ki edi kavali?*" (Telugu: Which one for your
   mother's braid?)
4. "*Paani chhidakti hoon, shaam tak taaze rahenge.*" (I sprinkle water; they'll stay fresh till
   evening.)
5. "*Guruvaar ko Sai Baba ke liye gulab ka haar, pehle bol ke rakhna!*" (Thursday's rose garland
   for Sai Baba: order it early!)
6. "*Gajra bandh rahi hoon, do minute ruko beta.*" (Tying a gajra; wait two minutes, dear.)
7. "*Shaadi ka order aaya, aaj saari mallepoolu khatam!*" (A wedding order came; all the jasmine's
   sold out today!)
8. "*Phool todna nahi, sirf soongho.*" (Don't pluck, just smell.)
9. "*Tulsi bhi hai, puja ka poora saamaan.*" (There's tulsi too: everything for the puja.)
10. "*Baarish aane wali hai, jaldi le lo!*" (Rain's coming, buy quick!)

---

### 3.5 `stationery_*`: stationery shops

**Look.**
- *From above:* a narrow shop (about 16 × 24 u) in a market row or opposite a school.
  - Rolls of chart paper standing in a bin outside.
  - A rack of greeting cards on the footpath (Diwali, New Year, friendship cards late in the
    decade).
- *From the street:*
  - Glass-topped counters packed with pens, pencils, erasers, sharpeners, refills and ink
    bottles.
  - Walls stacked with notebooks: long and short, ruled, unruled, four-line, graph, drawing and
    "record" books.
  - **Rolls of brown cover paper** and sheets of name labels.
  - Glaze paper in red, blue and green; sticker packs on strings.
  - From the late 90s, a **photocopy ("Xerox") machine** in the corner.

**What they sold (brands are era-checked).**
- **Camlin** geometry boxes: Camlin added geometry boxes in **1964**; the classic one is an
  orange-and-yellow tin.
- **Nataraj** and **Apsara** pencils: Hindustan Pencils, founded **1958**; Apsara added in
  **1970**.
- Fountain pens with blue ink bottles; ballpoint refills.
- Brown paper, labels, chart and glaze paper for projects.
- Exam pads, wrestling and cricket sticker packs, slam books (late 90s).
- **Do not show "Classmate"** notebooks: the brand launched in **2003**.
- Prices [~]: notebook ₹5–15; pencil ₹1; eraser 50 p–₹1; geometry box ₹25–50; brown paper
  ₹1–2 a sheet; photocopy 50 p–₹1 a page.

**Sounds.** The rip of brown paper, the click of a stapler, the hum and flash of the photocopier,
the creak of the card spinner.

**Signboards (invented).** Students' Corner · Sri Sai Stationery & Xerox · Vidya Book Depot ·
Saraswathi Stationers · New Friends Stationery · Lucky Stationery & Gifts · Ganesh Stationery &
Fancy · Bharat Book & Stationery Mart · Pen & Paper · Hamid Book House & Xerox.

**Ten lines.**
1. "*Long notebook ya short? Ruled ya unruled?*" (Long or short notebook? Ruled or plain?)
2. "*Brown cover kitte sheet? Label bhi le lo, naam likhne ke liye.*" (How many sheets of brown
   cover? Take labels too, for your name.)
3. "*Camlin box ka compass toota? Sirf compass alag milta hai.*" (Broke the compass? Sold
   separately.)
4. "*Nataraj ya Apsara? Apsara dark likhta, teacher khush.*" (Nataraj or Apsara? Apsara writes
   dark; teacher's happy.)
5. "*Chart paper roll karke le jao, mod ke nahi. Project kharab ho jaayega.*" (Roll the chart
   paper, don't fold it, or your project's ruined.)
6. "*Xerox ek rupaya page. Current gaya toh kal aana.*" (Xerox ₹1 a page. If the power's gone,
   come tomorrow.)
7. "*Glaze paper laal, neela, hara: science fair ke liye?*" (Glaze paper, red, blue, green: for
   the science fair?)
8. "*Kal exam? Do refill le lo, ek backup.*" (Exam tomorrow? Take two refills, one spare.)
9. "*Naye stickers aaye: cricket wale, wrestling wale. Ek rupaya mein teen.*" (New stickers:
   cricket, wrestling. Three for a rupee.)
10. "*Pen mein ink bharo, par haath pe nahi, shirt pe toh bilkul nahi!*" (Fill the pen with ink,
    not your hand, and definitely not your shirt!)

**Trump card.** "Camlin began making geometry boxes in 1964."

---

### 3.6 `pindi_girni_*`: flour mills

*Pindi* is Telugu for flour; *girni* is the Deccani and Marathi word for mill. The name itself is
a Telugu–Dakhni mix **(derived)**.

**Look.**
- *From above:* a square shop (about 22 × 22 u) with a wide door. Everything near it is lightly
  white-dusted: draw a pale flour halo `#efe9dc` on the ground outside.
  - Steel tins and cloth bags wait in a queue along the wall outside.
- *From the street, inside:* two or three **grinding machines (chakki)**.
  - Each is a cast-iron body on a concrete base with a **hopper on top**.
  - Each is driven by a long **flat belt** from a big electric motor that runs over pulleys.
  - Flour shoots from a **spout** into a cloth bag tied under it, or into a tin tray.
  - A **platform scale** stands by the door.
  - The miller (*girni-wale uncle*) is **white from head to toe**: eyebrows, moustache and hair.
  - A separate machine for **chilli and turmeric** (*karam*, *pasupu*) makes everyone sneeze.
  - A wall clock, a calendar and a small shrine shelf.

**Sounds.** The defining sound is a deep, rhythmic **thump-thump** with a whine, and the
**slap of the belt** ("*thap-thap-thap*"). Grain rattles down the hopper. When the power cuts,
everything sighs to a stop and the room goes silent except for the radio.

**What they did.**
- Ground the family's own grain: wheat for *atta* (roti flour), jowar, ragi, rice (for
  *rava* or flour), chilli, turmeric and festival spice mixes.
- Charged by weight. Prices [~]: 50 p–₹1 per kg.
- Kids carried the 5 kg tin on the cycle carrier, waited for their number, and carried warm
  flour home.

**Signboards (invented).** "Sri Lakshmi Ganapathi Flour Mill (Pindi Girni)" · "Laxmi Flour &
Chilly Mill" · "Noor Flour Mill" · "Raghavendra Pindi Mara" · "New Hyderabad Flour Mill" ·
"Sai Ram Atta Chakki" · "Venkateswara Flour & Masala Mill" · "Durga Pindi Girni" ·
"Al-Kareem Flour Mill" · "Anjaneya Flour Mill". Sub-line: *"Wheat, Jowar, Rice, Ragi, Chilli,
Turmeric Grinding Done Here."*

**Ten lines.**
1. "*Dabba wahan line mein rakho. Number aayega toh pukarta.*" (Put your tin in the line; I'll
   call your number.)
2. "*Godhumalu? Jonnalu? Ragulu? Separate cheppu.*" (Telugu: Wheat? Jowar? Ragi? Say which.)
3. "*Aaj karam ka din hai, chheenk aayegi, door khade raho!*" (Chilli day today, you'll sneeze,
   stand back!)
4. "*Belt se door, baba! Machine bhookhi hai.*" (Keep away from the belt, kid! The machine's
   hungry.)
5. "*Ek kilo aath aane. Paanch kilo dhai rupaye.*" (One kilo, 50 paise. Five kilos, ₹2.50.)
6. "*Bareek ya mota? Roti ke liye bareek, upma ke liye rava.*" (Fine or coarse? Fine for roti,
   rava for upma.)
7. "*Current gaya! Sab baitho, aane tak.*" (Power's gone! Everyone sit till it's back.)
8. "*Mere baal safed nahi, atta hai.*" (My hair isn't white, it's flour.)
9. "*Thaila neeche se pakdo, phat jaayega.*" (Hold the bag from the bottom or it'll tear.)
10. "*Pasupu rangu chudu, bangaram la undi.*" (Telugu: Look at the turmeric's colour, like
    gold.)

---

### 3.7 `playground_*`: small colony playgrounds

**Look.**
- *From above:* a square or odd-shaped plot (about 120 × 90 u) between houses, behind a low wall
  or iron fence with a narrow gate.
  - Mostly **dusty red soil** (`#b5694a`) with patches of tired grass at the edges.
  - A **bald, hard pitch strip** worn into the middle.
  - Neem and gulmohar trees along the edge (`trees` kinds `neem`, `gulmohar`); one cement bench.
  - **Iron swings** (two to four seats on chains), a **steel slide**, a see-saw, a rusty
    **merry-go-round**, and a sand pit.
  - Stumps are three bricks, a stone pile, or chalk lines on the colony water tank's wall.
- *From the street:*
  - A colony welfare association board: *"Park Timings 6–9 am, 4–8 pm. No Cricket on Sundays."*
  - A mali (gardener) with a hose.
  - Mothers calling from balconies.
  - The Ganesh pandal frame in Aug–Sep.

**Sounds.** Squeaking swing chains, a tennis ball "tok" and the shout "*Howzaaat!*", arguments
about whether it was out, a cycle bell, crows, and a mother's call of a kid's full name (always
a bad sign).

**What happened there.**
- Gully cricket with a tennis ball. House rules:
  - *one-tip one-hand* (a one-handed catch after one bounce is out);
  - *direct house out* (hit it into a house and you're out, and you fetch it);
  - *last man batting* (sometimes allowed);
  - *doodh-bhaat* (a little kid who plays but "doesn't count").
- Other games: gilli-danda, lagori (seven stones), kho-kho, hide-and-seek, marbles (*goli*),
  and kite flying in January.
- Prices [~] for kit: tennis ball ₹10–15, rubber ball ₹5, a cheap bat ₹50–150, a "Kashmir
  willow" bat ₹150–400.

**Signboards.** "\<Colony Name\> Welfare Association: Children's Park". Invented colony names:
Vani Nagar, Snehapuri Colony, Gayatri Nagar, Sai Enclave, Rahmat Nagar, Shanti Nagar,
Sri Rama Colony, Teachers' Colony, Green Park Colony, Bank Colony.

**Ten lines (the people who ran or guarded them).**
1. **Mali:** "*Ghaas pe nakko khelna! Cricket beech mein, mitti pe.*" (Not on the grass! Cricket
   in the middle, on the dirt.)
2. **Colony uncle:** "*Ball mere ghar mein aayi toh seedha out, aur ball mera!*" (Ball in my
   house = out, and I keep it!)
3. **Senior bhaiyya (captain):** "*One-tip one-hand, direct wall out, last man nahi khelega.*"
   (One-bounce one-hand catches, off the wall is out, no last-man batting.)
4. **Watchman:** "*Aath baje gate band. Ghar jao, amma dhoond rahi.*" (Gate shuts at eight. Go
   home, your mum's looking for you.)
5. **Association secretary:** "*Sunday ko Ganesh mandap ki meeting, sab parents ko bolna.*"
   (Sunday's Ganesh pandal meeting: tell all your parents.)
6. **Mali:** "*Jhoola ek-ek karke! Zanjeer purani hai.*" (One at a time on the swing! The chain's
   old.)
7. **Walking uncle:** "*Arre, slide dopahar ko garam hai, shaam ko aao.*" (The slide's hot at
   noon; come in the evening.)
8. **Senior bhaiyya:** "*Team banate: tum, tum... aur chhotu doodh-bhaat.*" (Teams: you, you...
   and the little one plays doodh-bhaat.)
9. **Watchman:** "*Goli khelna hai toh kinare pe. Pitch mat khodo.*" (Marbles at the edge only.
   Don't dig up the pitch.)
10. **Mother from a balcony:** "*Ravi! Khana thanda ho raha! 'Last over' bolke teen ghante ho
    gaye!*" (Ravi! Dinner's going cold! You said 'last over' three hours ago!)

---

### 3.8 `irani_cafe_*`: Irani cafés

Basics are in research_places.md §2J and research_culture.md §2 and §6c. Additions:

**Look.**
- *From above:* a corner building (cafés love corners), often with a high ceiling. Two
  street-facing sides open to the street with wide arched doors, about 40 × 30 u, h 15–20 u.
- *From the street:*
  - **Round-seated bentwood chairs** and small tables **topped with marble or glass**.
  - High ceilings with slow fans; mirrors; a big wall clock.
  - A **glass counter and jars** of Osmania biscuits, *khara* (salted) biscuits, fine biscuits,
    *lukhmi* (meat-filled puff) and onion samosas.
  - A cashier at the *galla* (till) on a raised seat.
  - A curtained **"Family Room"** or cabin at the back or upstairs.
  - Teal paint `#2a8c82` with cream.
- Some cafés had a **jukebox** (two Hyderabad cafés are documented with them, so "some" is safe)
  playing Hindi film songs and English hits. In-game it plays original tunes only.

**Sounds.** Waiters shouting orders to the counter (no notepads), cups on saucers, the jukebox,
the radio's cricket score, the hiss of the boiler.

**What they sold.**
- Irani chai: *pauna* (a ¾ cup), *paani-kam* (less water, extra milky).
- Osmania biscuits. Their name is said to come from the 7th Nizam, Mir Osman Ali Khan; the
  "invented at Osmania Hospital" story is folklore.
- Bun-maska, lukhmi, samosa, *dil khush* (a sweet bun), cream rolls, cool drinks.
- Prices [~]: chai ₹1–3; biscuit 25 p–₹1; a jukebox song ₹1 **(unverified)**.

**Signboards (invented).** Café Shiraz Pearl · New Yazd Café & Bakery · Hotel Persia Deluxe ·
Café Gulistan · Hotel Golden Cup & Restaurant · Café Noor-e-Iran · New Light Café · Hotel
Firozi · Café Arzoo · Hotel Sitara Irani. Painted in green or maroon with cream letters,
English plus Urdu.
- **Do not use** the famous real names: Grand, Garden, Alpha, Niloufer, Bahar, Sarvi, Nimrah,
  Shah Ghouse, Paradise, Hilltop, Omega, Subhan, Karachi.

**Ten lines.**
1. **Waiter:** "*Do pauna, ek Osmania, ek bun-maska: table teen!*" (Two small chais, one Osmania,
   one bun-maska: table three!)
2. **Cashier:** "*Galla pe paise do, bill zubaani hai.*" (Pay at the till. The bill's in my head.)
3. **Waiter:** "*Paani-kam? Ek dum garam, abhi laaya.*" (Extra milky? Piping hot, coming.)
4. **Owner:** "*Jukebox mein ek rupaya daalo, gaana tumhari pasand ka.*" (A rupee in the jukebox,
   your choice of song.)
5. **Waiter:** "*Family room upar hai, aunty log udhar baithiye.*" (The family room's upstairs,
   ladies please sit there.)
6. **Owner:** "*Ghanton baithne ka nahi. Chai khatam, table khaali.*" (No sitting for hours. Chai
   done, table free.)
7. **Waiter:** "*Biscuit dunk karo, girne nahi dena. Osmania naazuk hai.*" (Dunk the biscuit, don't
   drop it. Osmania's delicate.)
8. **Cashier:** "*Score? Do sau teen, chaar wicket. Ab chai piyo.*" (Score? 203 for 4. Now drink
   your chai.)
9. **Waiter:** "*Lukhmi garam-garam nikli! Kitte?*" (Lukhmi just out of the oven! How many?)
10. **Owner:** "*Mere abba Yazd se aaye the. Ye chai unki tareeqe ki hai.*" (My father came from
    Yazd. This chai is made his way.) Many Hyderabad Irani café families trace their roots to
    Iran's Yazd region **(unverified per family)**.

**Trump card.** "Osmania biscuits are said to be named after the last Nizam, Mir Osman Ali Khan."
The word "said" is needed because the origin is disputed.

---

### 3.9 Round-2 must-haves (registry: "Additional must-haves")

#### `meat_shop_*`: chicken and mutton shops (kid-friendly)

- **Look.**
  - A small open-fronted shop with a painted board: "**Fresh Chicken & Mutton**", with a
    cartoon rooster and goat.
  - Stacked **wire cages** of white chickens at the side; a chalkboard of the day's rates.
  - A tiled counter and a weighing scale.
  - Show **only the shopfront, the cages and the queue**: no carcasses, no chopping, nothing
    gory.
  - The Sunday-morning queue of dads with cloth bags is the image.
- **Sounds.** Clucking, the scale, dads discussing cricket in the queue.
- **Sold.** Chicken by the kilo, mutton, *keema* (mince), eggs. Prices [~] late 90s: broiler
  ₹40–60/kg, mutton ₹70–120/kg **(unverified)**.
- **Signboards (invented).** New Star Chicken Centre · Sri Durga Mutton & Chicken ·
  Al-Hamd Meat Shop · Fresh Farm Chicken · Raja Poultry · Saleem Chicken & Egg Centre ·
  Lucky Chicken House · Ganesh Mutton Shop.
- **Lines.**
  1. "*Sunday ko line lambi hoti, subah saat baje aao.*" (Sunday's queue is long; come at 7 am.)
  2. "*Ek kilo, curry cut? Keema alag?*" (One kilo, curry cut? Mince separately?)
  3. "*Andar mat aao baba, bahar khade raho, main laake deta.*" (Don't come in, wait outside;
     I'll bring it.)
  4. "*Pinjre ko haath mat lagao, murgi naraaz hoti.*" (Don't touch the cage; the hen gets
     cross.)
  5. "*Dawat hai kya? Do kilo le jao, kam padega.*" (A dinner party? Take two kilos, one won't
     be enough.)
  6. "*Akhbaar mein lapet diya, thaile mein seedha rakhna.*" (Wrapped in newspaper; keep it
     upright in the bag.)
  7. "*Chillar rakho, bill gol kar diya.*" (Keep the change; I rounded it off.)
  8. "*Abba ko bolna, agle Sunday pehle number unka.*" (Tell your dad he's first next Sunday.)

#### `medical_shop_*`: medical shops ("Medical & General Stores")

- **Look.**
  - A **green cross** sign (do not use the red cross: it is a protected emblem).
  - Glass-fronted counters and wooden shelves to the ceiling with labelled drawers.
  - A tube-lit, clean, white-blue interior; a small fridge; a calendar.
  - On the counter: jars of **Hajmola**, Vicks, cough lozenges and glucose powder.
- **Sold.** Prescription strips, cough syrups, balms, glucose powder, ORS, plasters, cotton,
  Dettol.
- **Kid errand.** Carry the doctor's chit for Nani's medicine, and bring back the exact change
  (or a Hajmola).
- **Signboards (invented).** Sri Sai Medical & General Stores · Life Line Medicals · Apna
  Medical Hall · Sanjeevani Medicals · Shifa Medical Stores · Krishna Pharmacy · Care & Cure
  Medicals · Amrutha Medical Hall.
- **Lines.**
  1. "*Doctor ka chitti dikhao, bina chitti nahi milegi.*" (Show the doctor's chit; nothing
     without it.)
  2. "*Nani ki BP ki goli, mahine ki strip. Khatam hone se pehle aana.*" (Nani's BP tablets, a
     month's strip. Come before they run out.)
  3. "*Hajmola chahiye? Ek rupaya. Poora packet ek saath nahi!*" (Want Hajmola? ₹1. Not the
     whole packet at once!)
  4. "*Vicks lagao, bhaap lo, kal school jaana hai.*" (Rub Vicks, take steam; school tomorrow.)
  5. "*Garmi mein Glucon-D, do chammach paani mein.*" (Glucose powder in summer: two spoons in
     water.)
  6. "*Pehle doctor ko dikhao, phir dawa. Seedha mere paas nahi.*" (See the doctor first, then
     medicine. Not straight to me.)
  7. "*Band-Aid le jao. Cricket mein ghutna phoota na?*" (Take a plaster. Scraped your knee at
     cricket?)
  8. "*Raat das baje tak khula. Emergency mein shutter pe khatkhatao.*" (Open till 10 pm. In an
     emergency, knock on the shutter.)

#### `iyengar_bakery_*`: Iyengar bakeries

- **Era note.**
  - The first Iyengar bakery is said to have opened in **Bangalore in 1898**. They spread across
    Bangalore in the 1990s.
  - When they arrived in Hyderabad is **(unverified)**. Today Hyderabad has many "Bangalore
    Iyengar Bakery" shops.
  - Use only one or two in 1999, framed as "the new bakery from Bangalore". Hyderabad's own 90s
    bakeries were mostly Irani-style.
- **Look.**
  - Warm yellow bulbs; **glass shelves and a glass counter** of honey cake (red-jam glazed,
    coconut on top), dilpasand, egg and veg puffs, cream rolls, fruit bread, *khara* buns and
    coconut biscuits.
  - A birthday-cake fridge; a painted board with a red-and-yellow scheme.
  - A smell of baking that reaches the bus stop.
- **Prices [~].** Puff ₹2–5, honey cake ₹3–5, cream roll ₹2–3, fruit bread ₹8–12,
  ½ kg birthday cake ₹60–100.
- **Signboards (invented).** Sri Bangalore Iyengar's Bakery · New Iyengar Bakery & Sweets ·
  Hassan Iyengar Bakes · Sri Krishna Iyengar Bakery · Bengaluru Hot Breads · Iyengar Cake
  Palace · Sri Ranga Iyengar Bakery · Fresh Bake Iyengar's.
- **Lines.**
  1. "*Honey cake abhi nikla, jam ka rang dekho!*" (Honey cake just out; look at that jam!)
  2. "*Egg puff ya veg puff? Oven se seedha.*" (Egg or veg puff? Straight from the oven.)
  3. "*Birthday cake order? Naam ki spelling likh ke do.*" (Cake order? Write the name's
     spelling.)
  4. "*Dilpasand mein nariyal aur tutti-frutti: Bangalore style.*" (Dilpasand has coconut and
     tutti-frutti: Bangalore style.)
  5. "*Cream roll jeb mein nakko, pighal jaayega!*" (Not in your pocket, the cream roll will
     melt!)
  6. "*Fruit bread dadi ke liye, naram hai.*" (Fruit bread for Grandma; it's soft.)
  7. "*Subah chaar baje se oven garam.*" (The oven's been hot since 4 am.)
  8. "*Hum Bangalore se, aap Hyderabad se. Dosti pakki, honey cake free nahi!*" (We're from
     Bangalore, you're from Hyderabad. Friends for sure, but the honey cake isn't free!)

#### `samosa_bandi_*`: samosa carts (evening)

- **Look.**
  - A wooden pushcart with a **big iron kadai** on a pressure stove (the roar!), a tray heaped
    with samosas, and a bowl of chutney.
  - Plates are newspaper squares or leaf plates. A tube light runs off a battery or a borrowed
    wire.
  - Open from about 4 to 8 pm.
- **Sold.**
  - **Hyderabadi small onion samosas** (thin, crisp, sold by the dozen).
  - Mirchi bajji (stuffed chilli fritters) and *punugulu* (Telugu batter balls).
  - Prices [~]: samosa 50 p–₹1, a dozen small ₹5–8, mirchi bajji ₹1–2.
- **Lines.**
  1. "*Garam samose! Pyaaz wale chhote, darjan paanch rupaye!*" (Hot samosas! Little onion ones,
     ₹5 a dozen!)
  2. "*Mirchi bajji bharwa, imli chutney ke saath.*" (Stuffed chilli fritters with tamarind
     chutney.)
  3. "*Kadhai ke paas nakko aana, tel uchhalta.*" (Don't come near the kadai, the oil spits.)
  4. "*Akhbaar mein doon ya pattal mein?*" (In newspaper or on a leaf plate?)
  5. "*Punugulu plate, palli chutney extra?*" (A plate of punugulu, extra peanut chutney?)
  6. "*Baarish mein bhi khada hoon, chhatri ke neeche.*" (I'm here even in the rain, under the
     umbrella.)
  7. "*Samosa yahan, chai bagal wale bhaiyya se.*" (Samosa here; chai from the fellow next to
     me.)
  8. "*Aakhri chaar bache, sab le lo, sasta kar deta.*" (Last four, take them all, I'll make it
     cheap.)

#### `dosa_bandi_*`: dosa and idli carts (morning)

- **Look.**
  - A cart with a big **iron griddle** (*tawa*) on a gas or kerosene stove, an idli steamer pot,
    a vada pan, and steel buckets of chutneys.
  - Customers stand around eating from steel plates lined with paper or leaf.
  - Open from about 6:30 to 10 am, then gone.
- **Sold.**
  - Idli, vada, plain and onion dosa, and Andhra **pesarattu-upma** (green-gram crêpe with
    semolina inside).
  - Chutneys: peanut (*palli*), coconut, **ginger (*allam pachadi*)**, and **karam podi**
    (spiced powder) with ghee.
  - Prices [~]: idli (2) ₹2–4, dosa ₹3–6, pesarattu ₹6–10.
- **Lines (Telugu-heavy).**
  1. "*Idli, vada, dosa: tondaraga cheppandi!*" (Idli, vada, dosa: say it quick!)
  2. "*Pesarattu-upma special, Andhra style!*"
  3. "*Karam podi neyyi tho? Konchem karam ekkuva.*" (Spice powder with ghee? It's a bit hot.)
  4. "*Plate seedha pakdo, chutney beh jaayegi.*" (Hold the plate straight or the chutney will
     run.)
  5. "*Allam pachadi aipoyindi, palli chutney undi.*" (Ginger chutney's finished; there's peanut
     chutney.)
  6. "*Tawa pe paani: tsss! Ab dosa crisp banega.*" (Water on the griddle: tsss! Now the dosa
     will be crisp.)
  7. "*School ke pehle khao, khaali pet padhai nahi hoti.*" (Eat before school; you can't study
     on an empty stomach.)
  8. "*Das baje ke baad sirf idli, dosa pindi aipoyindi.*" (After ten, only idli; the dosa
     batter's finished.)

#### `photo_studio_*`: passport photo studios

- **Look.**
  - A board: "**\<Name\> Photo Studio & Colour Lab**".
  - A window display of wedding portraits and smiling babies.
  - A tiny studio with **painted backdrops on rollers**: plain blue or white for passports, and
    scenic ones (a Kashmir lake, a waterfall, a garden).
  - **Umbrella flash lights**, a stool, a comb on a string, and a **darkroom with a red bulb**
    and a "Do Not Open" sign.
  - Era brands of film and colour labs may be *named* in text (no logos).
- **Sold.** Passport and visa photos, school-ID photos, the big stack of photos for the
  EAMCET application, family portraits, film-roll developing and printing.
  - Prices [~]: 8 passport photos ₹20–40 (ready "day after tomorrow"); developing and printing
    a 36-exposure roll ₹100–150.
- **Signboards (invented).** Studio Rainbow & Colour Lab · Chitra Photo Studio · Sri Sai Digital
  Studio (only after 1999) · Kodandaram Photos · Noor Studio · Moments Colour Lab · Venus Photo
  Studio · Snap Shot Studio.
- **Lines.**
  1. "*Seedha baitho, chin upar, thoda left... smile please!*" (Sit straight, chin up, a little
     left... smile please!)
  2. "*Passport size, aath copy: parson shaam ko ready.*" (Passport size, eight copies: ready the
     evening after next.)
  3. "*School ID ke liye white background. Baal theek karo, kanghi wahan hai.*" (White background
     for the school ID. Fix your hair; the comb's there.)
  4. "*Aankh band ho gayi! Ruko, flash charge hone do... ek aur.*" (Eyes closed! Wait for the
     flash to charge... one more.)
  5. "*Darkroom ka darwaza mat kholna, photo jal jaayegi!*" (Don't open the darkroom door; the
     photos will burn!)
  6. "*Family photo: Kashmir wala parda ya waterfall?*" (Family photo: the Kashmir backdrop or the
     waterfall?)
  7. "*Roll dhulai teen din. Slip sambhaal ke rakhna.*" (Developing takes three days. Keep the
     receipt safe.)
  8. "*Mooh pe haath nakko, passport mein hasna bhi nakko.*" (No hand on your face, and no
     laughing in a passport photo.)

#### `coconut_cart_*` and coconut trees

- **Trees.** Coconut palms grow in colony compounds and gardens across Hyderabad (common
  knowledge). Planting along Necklace Road is **(unverified)**: draw palms there anyway, sparing
  and tall. Tree kind is `coconut`.
- **Cart.**
  - A pushcart or tricycle heaped with **green tender coconuts**.
  - The vendor lops off the top with deft chops (show it as a quick, safe "chop" animation of a
    tool, never as a weapon), hands it over with a straw, then splits it and **carves a spoon
    from the husk** to scoop the soft flesh (*malai*).
  - Prices [~]: ₹3–6.
- **Signboards (invented, painted on the cart).** "Kerala Tender Coconut" · "Kobbari Bondam
  Corner" · "Coco Fresh" · "Sri Rama Coconuts" · "Gulshan Naariyal Paani" · "Cool Coco".
- **Lines.**
  1. "*Kobbari bondam! Neeru teeyaga undi!*" (Tender coconut! The water's sweet!)
  2. "*Paani wala ya malai wala?*" (Watery one or one with soft flesh?)
  3. "*Straw lo, khatam karo, phir todke malai khilata.*" (Take a straw, finish it, then I'll split
     it for the malai.)
  4. "*Chhilke ka chammach bana diya. Khurach ke khao.*" (Made you a spoon from the husk. Scrape
     and eat.)
  5. "*Garmi mein cool drink nakko, naariyal paani lo.*" (No fizzy drinks in this heat; have
     coconut water.)
  6. "*Chhilka kachre ke dabbe mein, sadak pe nahi.*" (Husk in the bin, not on the road.)
  7. "*Ek rupaya kam? Chalo, regular customer ho.*" (A rupee short? Fine, you're a regular.)
  8. "*Maine khud chadh ke utaare? Nahi baba, gaon se lorry mein aaye!*" (Did I climb up and pick
     them? No, kid, they came by lorry from the village!)

#### Cassette shops, `walkman`, `cassette_player` and `cassette_*`

- **Era facts.**
  - Cassettes were India's most popular music format in the 1990s.
  - One buyer remembers a Sony Walkman with bass boost costing **₹1,250 in 1996** (a single
    memory, so treat as [~]).
  - A 1980s Philips ad showed radio-cassette players from **₹1,025 to ₹3,400**.
  - Cheaper local "walkman-type" players ran about ₹250–500 [~].
  - Prerecorded cassettes cost ₹20–40 (budget labels) to ₹40–60 [~]. Blank cassettes ₹15–30 [~].
- **The shop.** A narrow "Audio & Video" shop:
  - walls of cassette spines in glass cases;
  - posters of fictional film albums;
  - a counter deck playing the newest soundtrack loud;
  - a "**Recording Done Here**" board: you list songs and they record a mix tape on a blank
    [~ ₹30–50 with tape].
- **Rituals to use in-game.**
  - Rewinding with a pencil to save the batteries.
  - Gently pulling out tangled tape.
  - Writing the song list on the J-card (the paper inlet).
  - Recording songs off the radio and catching the presenter's voice by mistake.
- **Signboards (invented).** Melody Music Centre · Sur Sangam Audios · Sri Sai Audio & Video ·
  Jhankar Cassette Corner · Raag Recording Centre · Star Audios · Sargam Music House ·
  Tarang Audio Vision.
- **Lines.**
  1. "*Naya album aaya, side A pehla gaana suno.*" (New album's in; hear the first track on side
     A.)
  2. "*List do, Saturday tak recording ready.*" (Give me your list; the recording will be ready
     by Saturday.)
  3. "*Tape phansa? Pencil se dheere ghumao, kheencho mat!*" (Tape stuck? Turn it gently with a
     pencil, don't yank!)
  4. "*Walkman ki battery do din chalti, rewind pencil se karo.*" (Walkman batteries last two
     days; rewind with a pencil.)
  5. "*Original cassette, duplicate nahi. Cover dekho.*" (Original cassette, not a copy. Look at
     the cover.)
  6. "*Head saaf karo, awaaz first class aayegi.*" (Clean the tape head and the sound will be
     first class.)

#### Cricket everywhere

- **In-era moments to reference (no player names).**
  - 1996: the World Cup was co-hosted by India.
  - Apr 1998: the Sharjah "sandstorm" innings (research_culture).
  - **8 Nov 1999 at `lb_stadium`**: the 331-run stand.
- **Street pictures.**
  - **A crowd on the footpath watching a TV in an electronics shop's window**, asking passers-by
    "*Score kya hua?*".
  - A transistor radio held to the ear at a kirana counter.
  - Gully cricket in every `playground_*` (rules in §3.7).
  - Bats and tennis balls bought at sports shops or kiranas.
- **Game use.** A cricket minigame in playgrounds and at LB Stadium; ambient crowd gatherings at
  shop TVs on match days; the "score" as a running joke in shop dialogue.

---

## 4. Glossary (new words in this file)

| Word | Language | Meaning |
|---|---|---|
| *kothi* | Urdu | mansion (gives Koti its name) |
| *ragda* | Hindi | white-pea curry served over samosa or patties |
| *matka* | Hindi | earthen pot (kulfi is kept in one, packed with ice and salt) |
| *sukha puri* | Hindi | the last "dry" puri the pani-puri man gives free |
| *teekha* | Hindi | spicy |
| *gopuram* | Telugu/Tamil | tiered gateway tower of a South Indian temple |
| *prasadam* | Telugu/Sanskrit | blessed food given at a temple |
| *kosaru* | Telugu | the little extra a vendor throws in free |
| *panche* | Telugu | dhoti (a man's wrap) |
| *ooru* | Telugu | home town or village |
| *pulihora* | Telugu | tamarind rice (travel food) |
| *Chand Raat* | Urdu | "night of the moon": the eve of Eid, a shopping night |
| *attar* | Urdu | perfume oil |
| *gajra* | Hindi/Urdu | a string or bracelet of flowers |
| *moora* | Telugu | a cubit (elbow to fingertip): how jasmine strings are measured |
| *mallepoolu* | Telugu | jasmine flowers |
| *kanakambaram* | Telugu | orange firecracker flower |
| *chamanthi* | Telugu | chrysanthemum |
| *banthi* | Telugu | marigold |
| *jada* | Telugu | braid |
| *poolamma* | Telugu | flower woman (a vendor) |
| *arati pandlu* | Telugu | bananas |
| *chakkarakeli* | Telugu | a sweet, thin-skinned banana variety |
| *pacha arati* | Telugu | raw green banana (for curry) |
| *dazan* | Hyderabadi | dozen |
| *bandi* | Telugu/Hindi | pushcart |
| *pindi* | Telugu | flour |
| *girni* | Dakhni/Marathi | mill |
| *chakki* | Hindi | grinding mill |
| *godhumalu / jonnalu / ragulu* | Telugu | wheat / jowar (sorghum) / ragi (finger millet) |
| *karam* | Telugu | chilli powder (also "spicy") |
| *pasupu* | Telugu | turmeric |
| *bangaram* | Telugu | gold |
| *atta / rava* | Hindi | wheat flour / semolina |
| *khaata* | Hindi | shop credit book |
| *aaj nakad, kal udhaar* | Hindi | "cash today, credit tomorrow" (shop sign) |
| *potli* | Hindi | small tied bundle or packet |
| *chillara* | Telugu | small change |
| *barni* | Hindi | jar |
| *galla* | Hindi/Urdu | cash till |
| *pauna* | Hyderabadi | ¾ cup of Irani chai |
| *paani-kam* | Hyderabadi | "less water": extra-milky Irani chai |
| *lukhmi* | Hyderabadi | square savoury puff with a meat filling |
| *padyam* | Telugu | verse or poem |
| *appaginchu* | Telugu | recite from memory |
| *ekkam* | Telugu | multiplication table |
| *kukka* | Telugu | dog |
| *E.M. / T.M.* | AP signboards | English Medium / Telugu Medium school |
| *doodh-bhaat* | Hindi | "milk-rice": a little kid who plays but doesn't count |
| *one-tip one-hand* | gully cricket | caught one-handed after one bounce = out |
| *tondaraga* | Telugu | quickly |
| *karam podi* | Telugu | spiced lentil "gunpowder" eaten with ghee |
| *allam pachadi* | Telugu | ginger chutney |
| *palli* | Telugu | peanut |
| *pesarattu* | Telugu | green-gram crêpe |
| *aipoyindi* | Telugu | it's finished |
| *kobbari bondam* | Telugu | tender coconut |
| *neeru / teeyaga* | Telugu | water / sweet |
| *malai* | Hindi | cream; here, soft coconut flesh |
| *dappu* | Telugu | frame drum played at processions and film releases |
| *Charminar Chowrasta* | Hyderabadi | another name for RTC X Roads |

---

## 5. Anachronism additions (on top of research_places.md §3)

| Thing | Date | Show instead in 1999 |
|---|---|---|
| Rythu Bazaars | Open 26 Jan 1999 (one source says 20 Jan) | Before that: site with "Opening Republic Day" banner |
| NTR Gardens open | Built 2000–01 (infobox: 15 Dec 2001) | Fenced, cleared plot with HUDA hoarding |
| Prasads IMAX | 25 Jul 2003; IMAX name until 2014 | Fenced lakeside plot with "Coming Soon" hoarding |
| "Classmate" notebooks | 2003 | Unbranded or invented notebook brands |
| Kachiguda overhead electric wires | Electrified 2003 | Diesel trains, no overhead wires |
| Kachiguda facade lighting and redevelopment | 2025+ | Plain old station |
| Assembly restored as Legislative Council | 2020s | Old white building as "the Assembly" |
| Odeon Mall, AMB or PVR multiplexes at RTC X Roads | 2020s | Single-screen halls |
| Sudarshan 70mm conversion | 2020s | Single screen |
| Charminar pedestrian zone and bollards | Project revived 2006; bollards later | Traffic and buses circling Charminar |
| Moazzam Jahi Market restoration | 2018 | Weathered granite, clocks possibly stopped |
| Metro pillars at Koti, Sultan Bazaar, MGBS | 2017+ | Open streets |
| Gowliguda hangar collapse | 2018 | Hangar standing |
| Widespread Iyengar bakeries in Hyderabad | Unverified (likely 2000s) | One or two "new from Bangalore" shops at most |
| Digital studios, instant prints | Late 1990s at the earliest | Film, darkroom, "ready day after tomorrow" |

---

## 6. Quick verification log (what was *not* confirmed)

These are useful for flavour, but keep them off trivia cards:
- Koti 90s bus routes.
- Gokul Chat's kulfi stall in the 90s.
- Birla Mandir tower heights and stair side.
- Boat types to the Buddha in the 90s.
- Prasads' building shape.
- NTR Gardens' train type.
- Public Gardens tree species.
- The Assembly's chhatri layout and which chamber met where in the 90s.
- LB Stadium floodlight year, stand roofs and shop tenants.
- Rythu Bazaar price-board rule and each market's opening date.
- Mozamjahi clock condition in the 90s.
- Nampally facade colour and whether it is a terminus.
- Kachiguda colours and architect.
- MGBS roof shape and bus colours by service class.
- Dilsukhnagar temple colours and the palanquin time.
- Opening years for Sudarshan, Devi and Odeon.
- Cinema ticket prices and loudspeaker songs.
- Whether Charminar's stairs were open in 1999.
- Jukebox prices.
- Iyengar bakeries in 90s Hyderabad.
- All prices marked [~].

---

## 7. Sources (consulted via web search, Oct 2026)

**Koti, Gokul Chat, Sultan Bazaar**
- [Koti, Hyderabad (Wikipedia)](https://en.wikipedia.org/wiki/Koti,_Hyderabad), [Sultan Bazar (Wikipedia)](https://en.wikipedia.org/wiki/Sultan_Bazar), [British Residency (Wikipedia)](https://en.wikipedia.org/wiki/British_Residency,_Hyderabad), [OU College for Women: origin and history](https://www.oucwkoti.ac.in/aboutus-originandhistory.html), [TNM on Sultan Bazaar and Badi Chowdi](https://thenewsminute.com/article/hyderabad-metro-cuts-through-sultan-bazaar-city-has-lost-part-its-soul-118100)
- [LBB: Gokul Chat, 50-year-old chaat joint](https://lbb.in/hyderabad/gokul-chat-hyderabad/), [LBB listing](https://lbb.in/places/Gokul-Chat-koti-070139), [Siasat: iconic chaat spots](https://www.siasat.com/tangy-tales-of-hyderabad-6-iconic-chaat-spots-you-should-visit-3322567/), [Slurrp: chaat spots](https://www.slurrp.com/article/top-spots-for-chaat-in-hyderabad-as-per-local-foodies-1730220674189), [Yappe listing](https://yappe.in/telangana/hyderabad/gokul-chat/12285), [Tripadvisor reviews](https://www.tripadvisor.in/Restaurant_Review-g297586-d3783228-Reviews-Gokul_Chat_Bhandar-Hyderabad_Hyderabad_District_Telangana.html)

**Birla Mandir, lake, Buddha, NTR Gardens, Prasads**
- [Birla Mandir (Wikipedia)](https://en.wikipedia.org/wiki/Birla_Mandir,_Hyderabad), [Structurae](https://structurae.net/en/structures/birla-mandir), [Incredible India: Birla temple](https://www.incredibleindia.gov.in/en/telangana/hyderabad/birla-temple), [Telangana Tourism: Birla Mandir](https://telanganatourism.gov.in/partials/destinations/divine-destinations/hyderabad/birla-mandir.html)
- [Buddha Statue of Hyderabad (Wikipedia)](https://en.wikipedia.org/wiki/Buddha_Statue_of_Hyderabad), [The South First](https://thesouthfirst.com/telangana/the-buddha-who-sank-and-rose-hyderabads-icon-marks-19-years-since-consecration/), [Incredible India: Lumbini Park](https://www.incredibleindia.gov.in/en/telangana/hyderabad/lumbini-park), [Telangana Tourism boating](https://telanganatourism.gov.in/partials/destinations/boating-units/hyderabad/cruiser-on-hire-at-hussain-sagar.html)
- [NTR Gardens (Wikipedia)](https://en.wikipedia.org/wiki/NTR_Gardens), [telangana360: NTR Gardens](https://www.telangana360.com/2017/04/ntr-gardens.html), [Trip101 guide](https://trip101.com/article/ntr-gardens-hyderabad), [trawell](https://www.trawell.in/andhra/hyderabad/ntr-gardens)
- [Prasads Multiplex (Wikipedia)](https://en.wikipedia.org/wiki/Prasads_Multiplex), [Gulte: largest screen](https://www.gulte.com/movienews/213001/largest-screen-in-india-now-at-prasads), [Wego: IMAX screens](https://blog.wego.com/largest-imax-screens-india/), [Deccan Chronicle: IMAX return](https://deccanchronicle.com/southern-states/telangana/imax-set-to-return-to-hyderabad-after-12-years-1960165)

**Public Gardens, Assembly, LB Stadium**
- [Public Gardens (Wikipedia)](https://en.wikipedia.org/wiki/Public_Gardens,_Hyderabad), [Jubilee Hall (Wikipedia)](https://en.wikipedia.org/wiki/Jubilee_Hall,_Hyderabad), [State Archaeology Museum (Wikipedia)](https://en.wikipedia.org/wiki/Telangana_State_Archaeology_Museum), [Telangana Tourism: State Museum](https://telanganatourism.gov.in/blog/04-04-2018-state-archaeology-museum.html), [MIT Dome record (Public Gardens / Bal Bhavan)](https://dome.mit.edu/handle/1721.3/21535)
- [trawell: Assembly](https://www.trawell.in/telangana/hyderabad/assembly), [Siasat: Town Hall restoration](https://www.siasat.com/historic-town-hall-now-legislative-council-inaugurated-after-restoration-3426565/), [Deccan Chronicle: Assembly restoration](https://deccanchronicle.com/southern-states/telangana/telangana-assembly-gets-heritage-restoration-1895763), [Deccan Chronicle: old Assembly building](https://www.deccanchronicle.com/southern-states/telangana/cm-to-inaugurate-renovated-old-assembly-building-today-legislative-council-to-be-shifted-1942245), [MIT Dome (Assembly images)](https://dome.mit.edu/handle/1721.3/20297)
- [LB Stadium (Wikipedia)](https://en.wikipedia.org/wiki/Lal_Bahadur_Shastri_Stadium,_Hyderabad), [Basheerbagh (Wikipedia)](https://en.wikipedia.org/wiki/Basheerbagh), [Sportskeeda](https://www.sportskeeda.com/cricket/3-international-stadiums-india-that-never-hosted-ipl-game/2), [Cricinfo 9 Nov 1999 report](https://i.imgci.com/link_to_database/ARCHIVE/CRICKET_NEWS/1999/NOV/008497_CI_09NOV1999.html), [Wisden 2002 note](https://i.imgci.com/link_to_database/ARCHIVE/CRICKET_NEWS/2002/MAR/517160_WISDEN_15MAR2002.html), [The Tribune, 9 Nov 1999](https://www.tribuneindia.com/1999/99nov09/sports.htm)

**Rythu Bazaars, Mozamjahi Market**
- [Rythu bazaar (Wikipedia)](https://en.wikipedia.org/wiki/Rythu_bazaar), [LEISA India](https://www.leisaindia.org/rythu-bazaars-the-alternative-marketing-channel/), [ResearchGate study (markets list)](https://www.researchgate.net/publication/260555269_KEY_DRIVERS_FOR_FARMERS_AND_CONSUMERS_OF_RYTHU_BAZAARS_-_A_STUDY_OF_THE_FARMERS'_MARKETS_OF_ANDHRA_PRADESH), [IUP supply-chain paper](https://www.iupindia.in/1208/Operations%20Management/Rythu_Bazaar.html), [Vedantu note (20 Jan 1999)](https://www.vedantu.com/question-answer/in-which-year-rythu-bazaars-were-established-in-class-8-social-science.-cbse-5fd68a80147a833c29cf152d)
- [Uniquely Telangana: clock tower](https://uniquelytelangana.in/?p=2333), [Uniquely Telangana: market](https://uniquelytelangana.in/?p=4262), [Siasat: Famous Ice Cream since 1951](https://www.siasat.com/mashoor-since-1951-inside-hyderabads-beloved-famous-ice-cream-3209504/), [TNM: restoration](https://www.thenewsminute.com/article/ktr-visits-moazzam-jahi-market-restoration-be-completed-4-months-79702)

**Stations and bus stations**
- [Hyderabad Deccan station (Wikipedia)](https://en.wikipedia.org/wiki/Hyderabad_Deccan_railway_station), [Nampally (Wikipedia)](https://en.wikipedia.org/wiki/Nampally,_Hyderabad), [telangana360: Nampally station](https://www.telangana360.com/2026/05/nampally-hyderabad-deccan-railway.html), [Charminar Express (Wikipedia)](https://en.wikipedia.org/wiki/Charminar_Express)
- [Kacheguda station (Wikipedia)](https://en.wikipedia.org/wiki/Kacheguda_railway_station), [Telangana Today: 110 years](https://telanganatoday.com/kacheguda-railway-station-completes-110-years-of-heritage), [Construction World](https://www.constructionworld.in/transport-infrastructure/metro-rail-and-railways-infrastructure/kacheguda-railway-station-marks-110-years-of-service/93999), [Deccan Chronicle: makeover](https://www.deccanchronicle.com/southern-states/telangana/railways-seeks-13-acres-of-rtc-land-for-kacheguda-station-makeover-1975556), [Deccan Chronicle: hundred years](https://deccanchronicle.com/lifestyle/travel/020616/hundred-years-of-history-and-connectivity.html), [Sahapedia: Indo-Saracenic stations](https://www.sahapediaexperiences.org/index.php/blog/indian-railways-heritage-buildings-indo-saracenic-architecture-specimens), [Kachiguda (Wikipedia)](https://en.wikipedia.org/wiki/Kachiguda)
- [MGBS (Wikipedia)](https://en.wikipedia.org/wiki/Mahatma_Gandhi_Bus_Station), [Central Bus Station / hangar (Wikipedia)](https://en.wikipedia.org/wiki/Central_Bus_Station,_Hyderabad), [TNM: Mississippi hangar](https://www.thenewsminute.com/telangana/88-year-old-hyderabad-bus-stand-mississippi-hanger-collapses-84232), [HMRL MGBS write-up](https://hmrl.co.in/wp-content/uploads/2025/06/2020-02-06-MGBS-Interchange-Station-Write-up.pdf)

**Dilsukhnagar temple**
- [Sai Baba Temple, Dilsukhnagar (Wikipedia)](https://en.wikipedia.org/wiki/Sai_Baba_Temple,_Dilsukhnagar), [Astroved temple guide](https://www.astroved.com/astropedia/en/temples/south-india/dilsukhnagar-sai-baba-temple-in-hyderabad), [Dilsukhnagar (Wikipedia)](https://en.wikipedia.org/wiki/Dilsukhnagar), [Etymology of localities (Wikipedia)](https://en.wikipedia.org/wiki/Etymology_of_localities_of_Hyderabad)

**RTC X Roads and cinemas**
- [RTC X Roads (Wikipedia)](https://en.wikipedia.org/wiki/RTC_X_Roads), [Hollywood Reporter India: the Telugu "main" theatre](https://www.hollywoodreporterindia.com/features/insight/the-strange-resilience-of-the-telugu-main-theatre), [LBB: iconic cinema halls](https://lbb.in/hyderabad/top-cinema-halls-hyderabad/), [TNM: Sangeet to Odeon](https://www.thenewsminute.com/telangana/sangeet-odeon-iconic-hyd-theatres-have-faded-oblivion-86620), [Andhravilas: Sandhya 70MM history](https://andhravilas.net/sandhya-70mm-secrets-rtc-x-roads-iconic-cinema-history/), [Only Movies News on X: Sandhya opened 18-01-1979](https://x.com/onlymoviesnews/status/1615653526226751490), [Telugu Funda: Sandhya 45 years](https://telugufunda.com/45-years-of-cinematic-excellence-at-sandhya-70mm-theatre/), [Hyderabad Real Estate & Infra on X: Odeon complex](https://x.com/HydREGuide/status/1915624450088948195), [Siasat: RTC X Roads theatres](https://www.siasat.com/hyderabads-iconic-rtc-x-roads-theatre-is-currently-closed-why-3374714/), [Siasat: new mall at RTC X Roads](https://www.siasat.com/new-mall-and-luxurious-theatre-open-at-rtc-x-roads-in-hyderabad-3307633/)
- Bawarchi: [Edition.mv](https://edition.mv/hdc/38695), [Wanderlog](https://wanderlog.com/place/details/38067), [LBB](https://lbb.in/delhi/bawarchi-restaurant-hyderabad)

**Charminar finale context**
- [Deccan Chronicle: Charminar pedestrianisation fund (1999 sanction)](https://deccanchronicle.com/151007/nation-current-affairs/article/rs-13-crore-charminar-fund-unused), [TNM: electric bollards](https://www.thenewsminute.com/article/electric-bollards-installed-hyderabads-charminar-ghmc-105647), [Lok Sabha answer on illumination](https://eparlib.nic.in/bitstream/123456789/543866/1/4681.pdf), [Drik Panchang: Eid al-Fitr 1999](https://www.drikpanchang.com/calendars/indian/muslim-festivals/eid-al-fitr/eid-al-fitr-date-time.html?year=1999), [Alhabib Islamic calendar 1999](https://www.al-habib.info/islamic-calendar/global/global-islamic-calendar-year-1999-ce.htm), [Charminar (Wikipedia)](https://en.wikipedia.org/wiki/Charminar)

**Everyday elements**
- Irani cafés and Osmania biscuits: [Scroll: last Irani chai cafés (jukeboxes)](https://scroll.in/article/739529/beyond-biryani-a-taste-that-lingers-the-last-irani-chai-cafes-of-hyderabad), [Scroll: where have the cafés gone](https://scroll.in/magazine/872563/where-have-hyderabads-irani-cafes-gone-theyve-been-replaced-by-biryani-joints), [Irani café (Wikipedia)](https://en.wikipedia.org/wiki/Irani_caf%C3%A9), [TNM: "Ek pauna, do biscoot"](https://www.thenewsminute.com/amp/story/features/ek-pauna-do-biscoot-why-hyderabads-irani-cafes-are-disappearing-115625), [Osmania biscuit (Wikipedia)](https://en.wikipedia.org/wiki/Osmania_biscuit), [The Federal: Osmania biscuit](https://thefederal.com/category/the-eighth-column/osmania-biscuit-hyderabad-irani-chai-mr-osman-ali-khan-nizam-osmania-hospital-207126)
- Stationery: [Classmate (Wikipedia)](https://en.wikipedia.org/wiki/Classmate_(stationery)), [afaqs: Classmate launch 2003](https://www.afaqs.com/company-briefs/1180_itc-expands-portfolio-with-classmate-notebooks), [Hindustan Pencils (Wikipedia)](https://en.wikipedia.org/wiki/Hindustan_Pencils), [YourStory: Camlin](https://yourstory.com/2016/09/of-stationary-and-memories-the-camlin-story), [ThePrint: Camlin](https://theprint.in/feature/brandma/camlin-a-stationery-stalwart-that-popularised-art-education-in-indian-schools/1270011/)
- School-gate treats: [Siasat: 90s childhood treats](https://www.siasat.com/top-12-iconic-90s-childhood-treats-every-hyderabadi-remembers-3273752/), [Siasat: school-gate treats](https://www.siasat.com/churan-to-gola-a-map-of-hyderabads-nostalgic-school-gate-treats-3443958/), [Deccan Chronicle: ice gola](https://www.deccanchronicle.com/lifestyle/food-and-recipes/290522/ice-gola-a-craze-in-the-past-is-now-almost-forgotten.html), [Sharmis Passions: pepsi ice memory](https://sharmispassions.com/indian-pepsi-ice-recipe)
- Iyengar bakeries: [LBB: story of the humble Bangalore Iyengar bakery](https://lbb.in/pune/story-of-the-humble-bangalore-68ebd5), [LBB: a 90s kid's Iyengar treats](https://lbb.in/bangalore/iyengar-bakery-bangalore/), [Slurrp: legacy of Iyengar bakeries](https://www.slurrp.com/article/the-legacy-of-iyengar-bakeries-and-what-to-buy-there-1717079305242)
- Cassettes and Walkman: [hifivision forum memory (₹1,250 in 1996)](https://www.hifivision.com/threads/walkman-anyone-remember-this.4926/post-638948), [Siasat: 1980s Philips tape recorder prices](https://www.siasat.com/1980s-philips-tape-recorder-prices-go-viral-netizens-shocked-3432618/), [Aaj Tak: cassettes in the 90s](https://www.aajtak.in/trending/story/afghanistan-market-cassette-video-brings-back-90s-memories-india-tstf-dskc-2579828-2026-06-16)
