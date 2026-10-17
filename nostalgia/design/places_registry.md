# Places registry: user requirements (binding)

The user (who grew up in 90s Hyderabad) added these requirements. They override
anything else in the design docs.

1. **The game ends at Charminar.** The final mission and the closing scene happen at
   Charminar (Old City). The ending must build toward it.
2. **Must-have places.** Every one of these must exist in the world, look recognisable,
   and be *used* by the story, a side activity, a shop or a collectible. Use the
   canonical ids below in story scripts, map data and code.

| id | Place | Area | Notes |
|---|---|---|---|
| `koti_bus_stand` | Koti Bus Stand (city bus terminus) | Koti | red city buses, conductors, crowds |
| `gokul_chat` | Gokul Chat | Koti | famous chaat house; pani puri, ragda, kulfi. Keep it joyful; never reference later tragic events |
| `birla_mandir` | Birla Mandir (Birla temple) | Naubat Pahad, south of the lake | white marble on a hill; depict respectfully, no chases inside |
| `hussain_sagar` | Hussain Sagar | city centre | the lake; `buddha_statue` on Gibraltar Rock in it |
| `buddha_statue` | Buddha statue | in Hussain Sagar | |
| `prasads_imax` | Prasads IMAX | Necklace Road | opened 2003 (post-90s); see era note |
| `ntr_gardens` | NTR Gardens | by the lake, near the Secretariat | opened around 2000 (post-90s); see era note |
| `public_gardens` | Public Gardens (Bagh-e-Aam) | Nampally | old gardens, State Museum, Jubilee Hall area |
| `lb_stadium` | Lal Bahadur (LB) Stadium | Basheerbagh / Fateh Maidan | cricket and football |
| `rythu_bazaar_*` | Rythu Bazaars (at least 2) | e.g. Erragadda, Mehdipatnam | farmers' markets, vegetable heaps under sheds; launched 1999 |
| `mozamjahi_market` | Moazzam Jahi (Mozamjahi) Market | near Abids/Nampally | stone clock-tower market; ice cream, fruit, Karachi Bakery nearby |
| `nampally_station` | Nampally (Hyderabad Deccan) railway station | Nampally | |
| `kachiguda_station` | Kachiguda railway station | Kachiguda | Gothic 1916 building with towers |
| `imlibun_bus_station` | Imlibun bus stand (MGBS) | by the Musi river | long-distance bus station |
| `assembly` | Legislative Assembly building | Public Gardens / Nampally | white domed building |
| `dilsukhnagar_sai_temple` | Sai Baba temple | Dilsukhnagar | Thursday crowds, flower sellers; depict respectfully |
| `rtc_x_roads` | RTC X Roads | Chikkadpally / Musheerabad | cinema district, hand-painted film hoardings, Bawarchi |
| `sandhya_theatre`, `sudarshan_theatre`, `odeon_theatre`, `devi_theatre` | RTC X Roads cinemas | RTC X Roads | use fictional film titles on hoardings |
| `charminar` | Charminar | Old City | **final mission + ending** |
| `nampally_exhibition` | Nampally Exhibition (Numaish, All India Industrial Exhibition) | Nampally exhibition grounds | Jan-Feb fair: giant wheel, maut ka kuan, Delhi papad, stalls, loudspeaker lost-and-found announcements |
| `paradise` | Paradise (biryani) | Secunderabad, Paradise circle | the biryani pilgrimage; parcel runs, the queue, the smell from the road |

3. **Everyday elements, many instances across colonies and markets** (ids are
   prefixes; number them, e.g. `irani_cafe_1`):
   `school_*` (colony schools with a ground and gate), `kirana_*` (kirana stores),
   `banana_cart_*` and `flower_cart_*` (pushcart vendors), `stationery_*`
   (stationery shops: notebooks, Camlin/Natraj-style geometry boxes, brown cover paper),
   `pindi_girni_*` (flour mills with their thumping machines and flour-dusted uncle),
   `playground_*` (small colony playgrounds with dusty cricket pitches, swings, slides),
   `irani_cafe_*` (Irani cafes: chai, Osmania biscuits, bun maska, jukebox-era decor).

## Era note (updated by the user, binding)

The protagonist is **11 years old**: a kid who grew up through the 1990s. The user says
the **early 2000s is good** for the main story, so set the main storyline in the early
2000s (writers pick one year between 2000 and 2003 and keep every date consistent; 2003
works well: Prasads IMAX opens on Necklace Road, NTR Gardens is open, the 2003 Cricket
World Cup fever, Numaish in Jan-Feb). Prasads IMAX and NTR Gardens are therefore open
and fully visitable (if the chosen year is before Prasads opened, show it opening during
the story). The kid's memories, toys, TV, games and slang are the 1990s ones they grew up
with, still around in the early 2000s. Anything that arrived after 2003 (Snow World,
Hyderabad Central, Inorbit, the PVNR flyover, the metro, the new airport, Eat Street,
smartphones, etc.) is still an anachronism and must not appear. The research files'
"anachronism blacklist" is relaxed only up to the chosen year.

## Additional must-haves (user, round 2, binding)

More everyday elements and props. They must appear across colonies and markets and be
*used* by the story, errands/odd jobs, shops, collectibles or ambience.

| id prefix / item | What | Notes |
|---|---|---|
| `meat_shop_*` | Chicken & mutton shops | shopfront with a painted "Fresh Chicken & Mutton" board, the Sunday-morning queue (Dad's Sunday mutton errand). Kid-friendly: show the shopfront, cages and queue, never gore |
| `medical_shop_*` | Medical shops ("Medical & General Stores") | green cross sign, glass counters; errands for Nani's medicine; Hajmola and Vicks on the counter |
| `iyengar_bakery_*` | Iyengar bakeries | honey cake, dilpasand, egg/veg puffs, cream rolls, fruit bread; warm yellow light, glass shelves |
| `samosa_bandi_*`, `dosa_bandi_*` | Samosa and dosa pushcarts (bandis) | evening/morning street food carts with a stove and steam; cheap energy refills |
| `photo_studio_*` | Passport photo studios | "Colour Lab / Photo Studio" board, backdrop + umbrella light inside; passport, visa or school-ID photos |
| item: `walkman` | Walkman | player item: plays collected cassettes while walking (on-foot radio) |
| item: `cassette_player` | Cassette player / "2-in-1" at home | plays and rewinds cassettes; key story prop is welcome |
| `cassette_*` | Cassettes | collectibles that unlock songs/dedications/messages for the Walkman and 2-in-1 |
| cricket | Cricket everywhere | gully cricket in colony playgrounds, LB Stadium, crowds watching a match on a TV in a shop window, bats/balls from shops, cricket minigame |
| tree kind `coconut` | Coconut trees | along Necklace Road, in colony compounds and gardens; tender-coconut carts (`coconut_cart_*`) |

## Additional must-haves (user, round 3, binding)

| id prefix | What | Notes |
|---|---|---|
| `internet_cafe_*` | Internet cafes ("Internet Browsing Centre", ₹20-30 per hour) | early-2000s magic: beige CRT monitors in plywood cubicles, dial-up/cable modem sounds, email IDs, chat rooms, LAN games after school, the uncle with the timer. Generic shop names only (no real chains). Good for story beats (an email, a chat, printing a photo) and hints |
| `mosque_*` | Neighbourhood mosques, plus `mecca_masjid` near Charminar | white/green domes and minarets, depicted respectfully; part of the city's look and sound of evenings; never a place for chases or mischief |
| `church_*` | Churches, e.g. St. Joseph's Cathedral (Gunfoundry/Abids), St. Mary's (Secunderabad), Wesley Church (Secunderabad) | spires, compounds, Christmas stars and cribs in Secunderabad in December; depicted respectfully |

Temples, mosques and churches together show Hyderabad's ganga-jamuni harmony. Treat
all of them with the same warmth and respect.

## Festivals (user, round 4, binding)

Both must be playable story moments with crowds, sound and decoration in the world,
switched on by story flags (the city looks different on those days).

| id | Festival | Where | Notes |
|---|---|---|---|
| `ganesh_immersion` | Ganesh Nimajjanam (immersion) | `tank_bund` / Hussain Sagar; idols come from colonies and from `khairatabad_ganesh` (the giant Khairatabad idol) | procession of idols on lorries and tractors, teenmaar drums, dancing crowds, gulal, cranes on Tank Bund lowering idols into the lake, all-night traffic jams, colony boys guarding "our" pandal's Ganesh all week. Aug/Sep |
| `bonalu` | Bonalu (Ashada Jatara) | `ujjaini_mahankali_temple` (Secunderabad, Lashkar Bonalu) and `lal_darwaza_temple` (Old City) | women carrying decorated bonam pots on their heads, Pothuraju dancers with turmeric and anklets, drums, neem leaves, the Rangam; a Telangana celebration. Jul/Aug. Depict respectfully; no alcohol/toddy references |

Festivals happen at different times of year, so the story may span several months or
seasons (e.g. chapters from Sankranti and Numaish in January through Bonalu and Ganesh
immersion to a finale at Charminar on a festive night such as Ramzan). Writers choose,
but keep the calendar consistent with the chosen year.

## Round 5 (user, binding)

- **Every Irani cafe serves Irani chai and Osmania biscuits.** This is the signature
  menu at all `irani_cafe_*` places (plus bun maska, samosa, lukmi where fitting). Chai
  and Osmania biscuits are the classic energy refill, a recurring ritual in the story,
  and something characters order by habit ("do chai, ek plate Osmania").
- `osmania_university`: Osmania University, Tarnaka. The grand Arts College building
  (Indo-Saracenic, grey granite, big arched entrance) in a huge green, rocky campus with
  tree-lined roads; students on cycles and scooters, canteen chai. Must appear on the map
  with recognisable art and be used by the story, a side activity or a collectible.

## Round 6 (user, binding)

| id | Place | Area | Notes |
|---|---|---|---|
| `karachi_bakery` | Karachi Bakery | beside `mozamjahi_market` | the original shop: fruit biscuits, Osmania biscuits, dil khush, plum cake; the tin boxes everyone carried to relatives; a must-buy gift run |
| `lumbini_park` | Lumbini Park | south-east shore of Hussain Sagar, near the Secretariat | lawns, musical fountain, the boat jetty for trips to the `buddha_statue`, ice cream and balloon sellers, families on Sunday evenings |
