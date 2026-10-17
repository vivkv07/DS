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

## Round 7 (user, binding)

| id | Place | Notes |
|---|---|---|
| `necklace_road` | Necklace Road | the curving lakeside road along Hussain Sagar's west/south shore: palm and coconut trees, the railway line alongside, evening breeze, families on the parapet, corn-on-the-cob (bhutta) and tender-coconut carts, Prasads IMAX and NTR Gardens along it; perfect for races, evening drives and sunset scenes |
| `tank_bund_statues` | Tank Bund statues | the row of statues of great Telugu personalities on tall pedestals along the Tank Bund (installed 1986), lit at night, the Buddha in the lake behind them; depict respectfully (bronze figures on stone plinths, name plaques). Good spot for clues ("count the statues", "the one pointing at the lake") and trivia cards about real historical figures (verified facts only) |

## Round 8 (user, binding)

| id | Place | Notes |
|---|---|---|
| `hitec_city` | HITEC City, Madhapur | the new IT district rising out of rocky, barren Deccan land in the early 2000s: new glass offices, construction sites and cranes, wide empty roads, giant boulders, Shilparamam nearby; the place the grown-ups talk about ("software job", "onsite to America") |
| `cyber_towers` | Cyber Towers | the iconic curved, ringed glass building (opened 1998) that became the symbol of the new Hyderabad; tall, reflective, dramatic at sunset and lit at night. Recognisable art is a must; use it in the story (e.g. a parent works there, a field trip, a clue seen from its top) |

## Round 9 (user, binding)

| id | Place | Notes |
|---|---|---|
| `golconda_fort` | Golconda Fort | massive granite walls and bastions on a hill, the Fateh Darwaza where a clap at the gate is heard at the Bala Hissar summit (`golconda_fateh_darwaza`, `golconda_bala_hissar`), cannons, steps up the hill, the sound-and-light show in the evening, the old diamond-trade legends; the Charminar–Golconda tunnel legend links it to the finale. Recognisable art + the clap minigame are a must |
| `qutb_shahi_tombs` | Qutb Shahi Tombs | the domed tombs of the Qutb Shahi kings on raised platforms near Golconda, grey granite and stucco, onion domes, quiet gardens; a calm, mysterious place for clues and trivia (verified facts only), depicted respectfully |

## Round 10 (user, binding)

| id | Place | Notes |
|---|---|---|
| `falaknuma_palace` | Falaknuma Palace | the Nizam's scorpion-shaped Italianate palace on a hill south of the Old City, "mirror of the sky". In the early 2000s it was closed to the public (restoration started around 2000; it reopened only in 2010), so for a kid it is a mysterious, gated palace on the hilltop seen from afar: perfect for legends, a view-point clue, or a secret. Do not show it as a hotel |
| `salar_jung_museum` | Salar Jung Museum | on the south bank of the Musi near Afzalgunj; the school-trip classic: the famous musical clock where a little figure comes out and strikes the gong on the hour (crowds gather at 12 o'clock), the Veiled Rebecca marble statue, the double-sided wooden figure. Good for a timed mission (be there when the clock strikes), clues and trivia cards (verified facts only) |

## Round 11 (user, binding): Birla Planetarium, Nehru Zoo, and all other important places

| id | Place | Notes |
|---|---|---|
| `birla_planetarium` | Birla Planetarium + Birla Science Museum | on Naubat Pahad next to `birla_mandir`; the white dome, sky shows in the dark dome, the dinosaur/science museum; school-trip staple |
| `nehru_zoo` | Nehru Zoological Park | Bahadurpura, south-west of the Old City by Mir Alam tank; lion safari bus, toy train, the elephant, peacocks, the natural history museum, Sunday family picnics |

The user wants **all other important places** of the era too. The list below is the
baseline (a completeness sweep will extend it in `research_all_places.md`). Each needs a
canonical id on the map, recognisable art for the big ones, and a use (story, side
activity, shop, clue, collectible or ambience). Era status matters (story is early 2000s).

| id | Place | Era status / notes |
|---|---|---|
| `laad_bazaar` | Laad Bazaar (Chudi Bazaar) | bangles lane from Charminar; glittering lac bangles |
| `chowmahalla_palace` | Chowmahalla Palace | closed to the public until 2005: show gated in the early 2000s |
| `gulzar_houz` | Gulzar Houz fountain | north of Charminar |
| `pathergatti` | Pathergatti / Madina building | stone arcades, shops |
| `purana_pul` | Purana Pul (old bridge, 1578) + Jumerat Bazaar (Thursday flea market) | |
| `naya_pul`, `chaderghat_bridge`, `afzalgunj_bridge` | Musi bridges | |
| `osmania_hospital`, `high_court`, `state_central_library` | Afzalgunj Indo-Saracenic trio on the Musi | |
| `abids` | Abids circle, GPO, the Sunday book market | |
| `sultan_bazaar` | Sultan Bazaar (Koti) | clothes, bangles, school-shopping crowds |
| `koti_womens_college` | Koti Women's College (old British Residency) | |
| `begum_bazaar` | Begum Bazaar | wholesale market |
| `secunderabad_clock_tower`, `secunderabad_station`, `parade_grounds`, `monda_market`, `general_bazaar`, `alpha_hotel` | Secunderabad | |
| `ujjaini_mahankali_temple`, `lal_darwaza_temple`, `khairatabad_ganesh` | festival sites (see Festivals) | |
| `begumpet_airport` | Begumpet Airport | the city's working airport in the early 2000s (until 2008): planes landing over the city, the terminal, families seeing people off to America |
| `spanish_mosque` | Spanish Mosque, Begumpet | |
| `sanjeevaiah_park` | Sanjeevaiah Park | by the lake |
| `indira_park`, `lower_tank_bund` | Indira Park / Lower Tank Bund | |
| `ravindra_bharathi` | Ravindra Bharathi auditorium, Saifabad | culture shows, school annual days |
| `secretariat`, `raj_bhavan` | Secretariat / Raj Bhavan (exteriors only) | |
| `gun_park` | Gun Park (Martyrs' memorial) near the Assembly | |
| `fateh_maidan`, `nizam_college` | Basheerbagh | |
| `cafe_bahar` | Café Bahar, Basheerbagh | Irani cafe/biryani |
| `bawarchi` | Bawarchi, RTC X Roads | |
| `ameerpet_coaching` | Ameerpet computer-coaching centres | early-2000s "learn Java/Oracle" boards everywhere |
| `kbr_park`, `film_nagar`, `annapurna_studios`, `peddamma_temple` | Banjara/Jubilee Hills | film shootings, rocks, Chiran palace in KBR |
| `shilparamam` | Shilparamam crafts village (1992) | near HITEC City |
| `durgam_cheruvu` | Durgam Cheruvu, the "secret lake" | hidden among rocks near HITEC City: perfect for a hidden collectible |
| `gachibowli_stadium` | Gachibowli stadium (2002, National Games 2002 / Afro-Asian Games 2003) | |
| `gandipet` | Gandipet (Osman Sagar) | picnic lake at the far west edge |
| `doordarshan_kendra` | Doordarshan Kendra, Ramanthapur (tower) | ties to the antenna minigame |
| `all_india_radio` | All India Radio, Saifabad | ties to the radio |
| `ramoji_film_city` | Ramoji Film City (1996) | far east, beyond the map edge: reachable as a bus-trip scene from `imlibun_bus_station` or `koti_bus_stand` |
| `nizams_museum` | Nizam's Museum, Purani Haveli (opened 2000) | |
| `taramati_baradari`, `moula_ali_dargah` | heritage sites (exteriors) | |
| cinemas | `ramakrishna_theatre` (Abids), `shanti_theatre` (Narayanguda), `sangeet_theatre` (Secunderabad), `liberty_theatre` (Basheerbagh) plus the RTC X Roads four | hand-painted fictional film hoardings |
| food landmarks | `nimrah_cafe` (facing Charminar), `shah_ghouse`, `pista_house` (haleem), `shadab_hotel`, `hotel_niagara`, `alpha_hotel` | generic depiction, Irani chai + Osmania biscuits at Irani cafes |

## Round 11b: completeness sweep (binding)

Completes round 11's "all other important places". Full detail for every id below (era status,
why kids remember it, look for the artist, map neighbours, suggested game use, sources) is in
**`research_all_places.md`**. 74 places survive (12 proposals were dropped as duplicate,
unverifiable for 2000-2003 or weak; see that file). None of these ids repeats an earlier id.
Sub-locations sit inside an existing registry place. All religious places are walk-only and
shown with respect; founders and owners stay unnamed in game text.

**Secunderabad and the Cantonment**

| id | Place | Note |
|---|---|---|
| `garden_cafe` | Garden Cafe (Irani cafe, 1941) | opposite `secunderabad_clock_tower`; show the original full-size cafe |
| `blue_sea_cafe` | Blue Sea Tea & Snacks (Irani cafe) | St John's Road by the station; early and late chai stop |
| `secunderabad_ganesh_temple` | Sri Ganesh Temple, Secunderabad station | coconut before a journey or exam; bus-stop name |
| `st_johns_church_secunderabad` | St. John's Church (1813) | "oldest church" trivia; Christmas |
| `holy_trinity_church_bolarum` | Holy Trinity Church, Bolarum (1847) | "the church Queen Victoria paid for" |
| `rashtrapati_nilayam` | Rashtrapati Nilayam | gated only (opened to visitors 2023); President's winter-visit day |
| `secunderabad_club` | Secunderabad Club (1878) | exterior and gate only; members-only |
| `gymkhana_ground_secunderabad` | Gymkhana Ground (1928) | cricket minigame venue beside `parade_grounds` |
| `rathifile_bus_station` | Rathifile city bus station | north hub of the city bus network |
| `chenoy_trade_centre` | Chenoy Trade Centre (CTC), Parklane | PC parts shop; legal goods only |
| `anand_theatre` | Anand Theatre, SD Road | Hindi single screen, sister to `sangeet_theatre`; fictional hoardings |

**Begumpet, Ameerpet, Balkampet**

| id | Place | Note |
|---|---|---|
| `shoppers_stop_begumpet` | Begumpet department store (May 1998) | invented name on the sign; first escalator ride |
| `hyderabad_public_school` | The Hyderabad Public School (1923) | inter-school quiz or sports meet venue |
| `balkampet_yellamma_temple` | Balkampet Yellamma Temple | Bonalu and Yellamma Kalyanam crowds |
| `sarathi_studios` | Sarathi Studios (1956) | "shooting jaruguthondi!" crowd at the gate |

**Lakdikapul, Naubat Pahad, Khairatabad, Panjagutta**

| id | Place | Note |
|---|---|---|
| `niloufer_cafe` | Cafe Niloufer (by Niloufer Hospital) | one small cafe then; refill after `birla_planetarium` |
| `hill_fort_palace` | Hill Fort Palace (old Ritz) | empty and locked; the castle on the hill |
| `khairatabad_mosque` | Khairatabad Mosque (1626) | "named after a princess" trivia |
| `errum_manzil` | Errum Manzil (1870) | exterior only; bus-stop name |
| `nims_hospital` | NIMS, Panjagutta | bus-stop landmark; hospital-visit errand |

**East of the lake: Lower Tank Bund to Nallakunta**

| id | Place | Note |
|---|---|---|
| `katta_maisamma_temple` | Katta Maisamma Temple | Lower Tank Bund; Bonalu |
| `ramakrishna_math` | Ramakrishna Math, Domalguda | summer language classes; calm zone |
| `narayanguda_ymca` | Narayanguda YMCA and the Sadar festival | decorated-buffalo carnival after Diwali |
| `city_central_library` | City Central Library, Chikkadpally | library cards, old newspapers (clues) |
| `shankar_mutt_nallakunta` | Sringeri Shankar Mutt (1960) | Navaratri; bus-stop name on OU Road |

**Abids, Nampally, Gunfoundry, Koti, King Koti**

| id | Place | Note |
|---|---|---|
| `grand_hotel_abids` | Grand Hotel (1935) | oldest surviving Irani cafe |
| `taj_mahal_hotel_abids` | Taj Mahal Hotel (1948) | veg tiffin and coffee; not the Taj chain |
| `chermas_abids` | Cherma's (1980) | festival clothes shop |
| `st_georges_church_abids` | St. George's Church and Grammar School | Christmas in Abids; school rivals |
| `st_josephs_cathedral` | St. Joseph's Cathedral, Gunfoundry (1875) | midnight Mass; the registry's example church |
| `iskcon_abids` | ISKCON temple (1976) + sweet shop opposite | Janmashtami; sweets errand |
| `subhan_bakery` | Subhan Bakery (1948) | rival biscuit run to `karachi_bakery` |
| `dargah_yousufain` | Dargah Yousufain | qawwali, threads for wishes; harmony beat |
| `jawahar_bal_bhavan` | Jawahar Bal Bhavan + Health Museum | sub-location of `public_gardens`; summer classes, school trip |
| `famous_ice_cream` | Famous Ice Cream (1951) + Hameedi | sub-location of `mozamjahi_market`; reward refill |
| `king_kothi` | King Kothi Palace | gated; the last Nizam's home; treasure legend |
| `koti_book_bazaar` | Koti pavement book bazaar | June textbook errand (on the footpath until 2007) |

**The Musi and its banks**

| id | Place | Note |
|---|---|---|
| `musi_riverbed` | Musi riverbed and dhobi ghats | dry sandy bed, drying clothes, the "Musi smell" joke |
| `city_college` | Government City College (1921) | same architect as the High Court |
| `gowliguda_hangar` | Gowliguda "Mississippi hangar" city bus station | standing and in use; bus set-piece |
| `gurudwara_gowliguda` | Central Gurudwara Sahib, Gowliguda (1926) | langar; harmony beat |
| `dhoolpet` | Dhoolpet idol lanes and manja makers | pick up the colony Ganesh; Sankranti manja |
| `victory_playground` | Victory Playground, Chaderghat | summer sports camps, skating |

**Old City**

| id | Place | Note |
|---|---|---|
| `mahboob_chowk_clock_tower` | Mahboob Chowk Clock Tower (1892) + Murgi Chowk | pet-bird side quest; no slaughter imagery |
| `badshahi_ashurkhana` | Badshahi Ashurkhana (1594) | seven-colour tile wall; quiet, respectful |
| `jama_masjid_charminar` | Jama Masjid (1597-98) | small mosque in a lane beside `charminar` |
| `hotel_madina` | Hotel Madina (1947) | sub-location of the Madina building (`pathergatti`); Ramzan haleem |
| `hotel_nayaab` | Hotel Nayaab | pre-dawn nihari outing |
| `akkanna_madanna_temple` | Akkanna Madanna Mahankali Temple | Old City Bonalu elephant procession |
| `paigah_tombs` | Paigah Tombs | marble-lace screens; secret collectible |
| `barkas` | Barkas | marfa drum band for a wedding scene |

**West: Zoo side, Mehdipatnam, Shaikpet, Golconda, Langar Houz**

| id | Place | Note |
|---|---|---|
| `mir_alam_tank` | Mir Alam Tank (1804-06) | lake beside `nehru_zoo`; 21-arch dam |
| `sarojini_devi_eye_hospital` | Sarojini Devi Eye Hospital (1967) | bus-stop name; spectacles errand |
| `mehdipatnam_bus_terminus` | Mehdipatnam bus depot | west bus hub (Golconda, Gandipet, HITEC City) |
| `hussain_shah_wali_dargah` | Hussain Shah Wali Dargah + Shaikpet Sarai | clue linking `hussain_sagar` to the west |
| `golconda_jagadamba_temple` | Jagadamba (Mahankali) Temple | sub-location of `golconda_fort`; Bonalu begins here |
| `bapu_ghat` | Bapu Ghat | Gandhi Jayanti school trip; "a peaceful memorial" only |

**Banjara Hills, Jubilee Hills, Film Nagar**

| id | Place | Note |
|---|---|---|
| `sarvi` | Sarvi (Irani restaurant and bakery) | Ramzan haleem errand |
| `jubilee_hills_check_post` | Jubilee Hills Check Post | boulder junction; gateway to `film_nagar` |
| `apollo_hospital_jubilee_hills` | Apollo Hospital (1988) | landmark and bus stop |
| `ramanaidu_studios` | Ramanaidu Studios (1989) | be an extra for a day |

**North-west: HITEC City, Gachibowli, Kukatpally**

| id | Place | Note |
|---|---|---|
| `hitex` | HITEX Exhibition Centre | opens 14 Jan 2003; a building site before |
| `university_of_hyderabad` | University of Hyderabad + Mushroom Rock | hidden collectible at the rock; peacocks |
| `jntu_kukatpally` | JNTU campus | older-cousin and EAMCET beat |
| `kphb_colony` | KPHB Colony | home colony option; gully cricket, kites |

**East and south-east**

| id | Place | Note |
|---|---|---|
| `malakpet_race_course` | Malakpet Race Course | horses from the bus window; never betting |
| `ashtalakshmi_temple` | Ashtalakshmi Temple, Kothapet (1996) | the "new" grand temple; Navaratri |
| `saroornagar_lake` | Saroornagar Lake + Victoria Memorial Home | neglected lake; restoration starts 2003 |
| `karmanghat_hanuman_temple` | Karmanghat Hanuman Temple | Tuesday queues; legend card |
| `gaddiannaram_fruit_market` | Gaddiannaram (Kothapet) fruit market | summer mango errand |
| `harina_vanasthali` | Mahavir Harina Vanasthali deer park (1975) | blackbuck spotting; east map edge |

**Off-map west edge**

| id | Place | Note |
|---|---|---|
| `chilkur_balaji` | Chilkur Balaji ("Visa Balaji") | an uncle's US-visa subplot |
| `mrugavani_park` | Mrugavani National Park (1994) | deer spotting trip |
| `himayat_sagar` | Himayat Sagar (1927) | picnic; monsoon floodgates |

Pending, not in the game until a source confirms they were running in 2000-2003:
`jubilee_bus_station`, `bhramaramba_mallikarjuna_theatres` (see `research_all_places.md`).

## Round 12 (user, binding): a cricket match at LB Stadium

A full, playable **cricket match at `lb_stadium`** is a must-have story event: Chinnu's
side plays on the real stadium ground (e.g. the inter-school under-12 final or the colony
league final that gets its final at LB Stadium), with stands and crowds, floodlight
towers, the scoreboard, an umpire, fielders, a 90s TV-broadcast look (score bug, replays
announced in text, Hinglish/Telugu commentary lines, no real players' names) and both
**batting and bowling**. Ayesha "Bowling" Fatima and Immu should be part of it. It is
replayable afterwards as an exhibition match. Engine: `src/cricket_match.js`
(minigame id `match`); the story wires it in (bible M4 or a side activity, writers' call).
