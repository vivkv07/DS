# NOSTALGIA — Research: Places of Hyderabad & Secunderabad, 1990–1999

Purpose: source material for `design/map_plan.md`, `src/worlddata.js`, `src/landmarks.js`,
the story bible and the Journal's trivia ("trump") cards.

**Tags used.** Plain statements are backed by at least one decent source (listed in section 7).
Where sources disagree, the range is given. **(unverified)** = could not confirm; fine for flavour,
not for a trivia card. **(derived)** = worked out from verified facts. **(legend)** = folklore, never
present it in-game as fact. Distances are approximate and come from general map knowledge (±300 m).

**Setting anchor.** The HUD date in ARCHITECTURE.md, *THU 14 JAN 1999*, was a Thursday and is
**Makar Sankranti**, the kite festival. On that day the **Numaish** fair (1 Jan to about 15 Feb) is
running at Nampally. **Cyber Towers** is seven weeks old. **Necklace Road** is new. The **Buddha**
has stood on his rock for six years. The **NTR Gardens** site is still an empty cleared plot, and
the first **Rythu Bazaars** open 12 days later, on Republic Day (26 Jan 1999).

**Era frame (1990s).** Hyderabad is the capital of **Andhra Pradesh**. Telangana state did not
exist until 2014. The red buses belong to **APSRTC**. The city council is the **MCH** (Municipal
Corporation of Hyderabad); GHMC came later, in 2007 (unverified exact year). The development
authority is **HUDA**. The only airport is **Begumpet**. There is no metro, no MMTS, no flyover
network and no multiplex.

---

## 1. Geography for the map

### 1.1 Real offsets from Charminar (E/W = east/west, N/S = north/south, in km)

| Place | Offset | | Place | Offset |
|---|---|---|---|---|
| Mecca Masjid | 0.2 SW | | Lumbini Park (S tip of lake) | 5.4 N |
| Chowmahalla Palace | 0.5 SW | | Buddha statue (in lake) | 6.0 N |
| Gulzar Houz / Char Kaman | 0.2 N | | Hussain Sagar centre | 7.0 N |
| Madina circle | 0.7 N | | Indira Park | 1.0 E, 5.7 N |
| Shah Ali Banda | 0.9 S | | Himayatnagar | 1.3 E, 4.4 N |
| Falaknuma Palace (hill) | 0.8 W, 3.4 S | | Narayanguda | 1.4 E, 3.7 N |
| Nehru Zoo / Mir Alam Tank | 2.5 W, 1.2 S | | RTC X Roads | 2.4 E, 4.9 N |
| Puranapul | 1.6 W, 0.9 N | | Chikkadpally | 2.2 E, 4.4 N |
| High Court (S bank) | 0.4 W, 0.8 N | | Osmania Univ. Arts College | 5.6 E, 5.7 N |
| Naya Pul | 1.1 N | | Tarnaka | 5.9 E, 7.4 N |
| Osmania Gen. Hospital (N bank) | 0.2 W, 1.2 N | | Secunderabad station | 2.8 E, 8.0 N |
| Salar Jung Museum (S bank) | 0.6 E, 1.1 N | | Secunderabad Clock Tower | 2.5 E, 8.7 N |
| State Central Library | 0.3 E, 1.4 N | | Paradise junction | 1.4 E, 9.1 N |
| MGBS (Imlibun) | 0.6 E, 1.9 N | | Parade Grounds | 2.3 E, 9.3 N |
| Chaderghat bridge | 1.4 E, 1.7 N | | Monda Market | 2.9 E, 8.6 N |
| Begum Bazaar | 0.6 W, 1.9 N | | Begumpet Airport | 0.8 W, 10.2 N |
| Koti (British Residency) | 0.9 E, 2.5 N | | Ameerpet | 2.8 W, 8.4 N |
| Moazzam Jahi Market | 0.3 W, 2.6 N | | Panjagutta | 2.6 W, 7.1 N |
| Exhibition Grounds (Numaish) | 0.5 W, 2.9 N | | Banjara Hills Rd No. 1 | 2.9 W, 6.3 N |
| Abids (GPO) | 3.4 N | | KBR Park | 5.7 W, 6.8 N |
| Nampally station | 0.7 W, 3.4 N | | Jubilee Hills Check Post | 6.7 W, 7.5 N |
| Public Gardens / Assembly | 0.4 W, 4.2 N | | Film Nagar | 7.4 W, 5.8 N |
| LB Stadium (Fateh Maidan) | 4.3 N | | Masab Tank | 2.3 W, 4.3 N |
| Basheerbagh | 0.5 E, 4.5 N | | Mehdipatnam | 4.1 W, 3.4 N |
| Birla Mandir (Naubat Pahad) | 0.6 W, 5.0 N | | Tolichowki | 6.4 W, 4.2 N |
| Birla Planetarium | 1.1 W, 4.8 N | | Golconda Fort | 7.8 W, 2.4 N |
| Lakdikapul | 1.3 W, 4.7 N | | Qutb Shahi Tombs | 8.4 W, 3.7 N |
| Khairatabad | 1.6 W, 5.6 N | | Cyber Towers / Shilparamam | 10 W, 10 N |
| | | | Gandipet (Osman Sagar) | 18.5 W, 2 N |
| | | | Ramoji Film City | 22 E, 12 S |

### 1.2 The big shapes (what a top-down player should feel)

- **The spine runs south to north.** Old City (south) → the **Musi** river → the Afzalgunj civic
  buildings → Koti, Abids and Nampally → Basheerbagh, Naubat Pahad and Lakdikapul → **Hussain
  Sagar** → Secunderabad (north-east) and Begumpet (north). Charminar to the Secunderabad Clock
  Tower is about 9 km.
- **The Musi** flows west to east about 1 km north of Charminar. It rises near Gandipet in the far
  west, passes under Puranapul, Naya Pul and Chaderghat, then runs on to Amberpet. In the 90s its
  bed is wide and mostly sand or rock, with a narrow, smelly, weedy channel except after rains
  (unverified detail; good use of `SAND`). The High Court and Salar Jung Museum stand on the south
  bank. Osmania General Hospital, the State Central Library and the bus stations stand on the north
  bank.
- **Hussain Sagar** is a lake of about 4.4 to 5.7 km² (sources differ). Its southern tip is at
  Lumbini Park, near the old Secretariat. The **Tank Bund** road is the dam on the east and
  south-east side, about 3 km long, linking Hyderabad to Secunderabad. **Necklace Road** curves
  round the west and north shore from Khairatabad and the NTR Gardens site to Sanjeevaiah Park.
  The Buddha stands in the southern half of the lake, about 600 m off Lumbini.
- **The rocky west.** Past Masab Tank the land becomes Deccan granite. Banjara Hills, Jubilee
  Hills, Film Nagar, Golconda and Madhapur sit among huge balancing boulders (`ROCK`). In 1999
  Madhapur and HITEC City are scrub and boulders with one shiny new building (Cyber Towers).
- **Hills to use as set-pieces:** Naubat Pahad (Birla Mandir and the planetarium), Golconda's
  granite hill (about 120 m), and Falaknuma's hill south of the Old City.
- **Secunderabad** is a separate twin city with a British cantonment feel. It has wide roads,
  parade grounds, churches, a railway hub and the Clock Tower.

### 1.3 Compression suggestion for the 8000 × 6000 u world (advice only)

The real footprint is about 16 km west to east (Golconda to Osmania University) by 14 km south to
north (Falaknuma to Begumpet). That would mean about 0.45 u per metre, which is too sparse. A
better plan is to **keep the order and directions true but squeeze the empty land.**

- Put the central core (Charminar to Hussain Sagar) at about 1.3 u/m.
- Fold the west (Mehdipatnam to Golconda) to about half its real length.
- Pull HITEC City in towards Jubilee Hills, keeping it north-west.
- Treat Gandipet and Ramoji Film City as **off-map destinations** reached by a road edge or a bus
  ride cutscene.

Keep these readable alignments:
- the Charminar → Gulzar Houz → Pathergatti → Madina → Naya Pul line runs straight north;
- the Abids → Nampally → Public Gardens cluster sits just west of north;
- Birla Mandir overlooks Lumbini Park and the Buddha;
- the Tank Bund leads north-east to Secunderabad;
- Begumpet's runway runs west to east, north of the lake.

---

## 2. Place gazetteer (look · kids in the 90s · trump card)

Colours refer to the ARCHITECTURE.md palette. For heights, one storey is about 10 u.

### A. Old City (south of the Musi)

**Charminar (1591).**
- *Look:* A square block about 20 m a side (Telangana Tourism says 31.95 m). It has four huge
  pointed arches facing the four directions, each spanning about 11 m. The upper storeys are
  arcaded galleries and the mosque is on the top floor. Four fluted corner minarets rise to about
  49 to 56 m (sources differ). Each minaret has two ring balconies and is topped by a small onion
  dome on a petal base. Granite core with lime-plaster stucco in cream (#e8d9b5). Four clock faces
  were added above the arches in 1889. Each minaret has 149 winding steps.
- *90s:* Traffic, autos and buses circled it. Pedestrianisation came later (unverified date).
  Pigeons, bangle sellers and pearl shops crowded around it.
- *Kids:* Climbed the stairs to the first-floor gallery (unverified whether open all decade), ate
  at Nimrah next door, and went bangle shopping with ammi.
- *Trump:* "The four clocks were added in 1889, about 300 years after it was built."

**Mecca Masjid (begun 1614/1617, finished 1694 under Aurangzeb).**
- *Look:* About 200 m south-west of Charminar. A massive grey granite prayer hall with a row of
  large arches (about five; unverified count) and two thick octagonal minaret-columns with small
  domes. A big paved courtyard (`PLAZA`) has a pond and an enclosure of Nizams' marble tombs.
  Hundreds of pigeons.
- *Trump:* "Holds about 10,000 worshippers. Some bricks are believed to be made with soil from
  Mecca."

**Laad Bazaar / Choodi Bazaar.**
- *Look:* A crowded strip of about 1 km running west from Charminar towards Chowmahalla. Narrow
  shopfronts glitter with stacked lac bangles in red, green and gold, studded with glass and beads.
  Attar (perfume) and bridal shops, with bulb strings at night. A great narrow chase alley.
- *Trump:* "Lac is made by a tiny insect, *Kerria lacca*."
- *(legend)* The bazaar was founded for a princess's wedding shopping. The name is variously traced
  to a queen called "Ladli Begum" or to *laad* (lac).

**Chowmahalla Palace.**
- *Look:* The Asaf Jahi seat of power behind high walls. Four palaces ("chahar mahallat") set
  around long courtyards with pools and fountains. Ochre and white neo-classical façades. The grand
  **Khilwat Mubarak** durbar hall has 19 Belgian crystal chandeliers. A clock tower stands over the
  gate.
- *90s:* **Closed to the public.** It opened only in January 2005 after restoration. In-game it is
  a locked palace where you only peek over the wall, which is good for a secret-entry mission.
- *Trump:* "Said to be modelled on the Shah of Iran's palace" (unverified exact model).

**Gulzar Houz and Char Kaman (c. 1592–94).**
- *Look:* Just north of Charminar. A square framed by four tall single arches (**Kali Kaman,
  Machli Kaman, Sher-e-Batil ki Kaman, Charminar Kaman**), each with small guard chambers. In the
  centre is a fountain cistern, first 12-sided, then octagonal. Perfume, kite and toy stalls.
- *Kids:* This is **the** Sankranti kite market. Modern reports count about 150 kite stalls in
  season. Dhoolpet and Hussainialam also sell kites and manja.
- *Trump:* "The fountain was once a cistern called Char-Su-ka-Houz that supplied soldiers."

**Pathergatti (c. 1911).**
- *Look:* Runs north from Gulzar Houz to Madina. Two-storey arcaded shop rows in pinkish-grey
  dressed stone, with shops below and homes above. Its name means roughly "stone-built".
- *Trump:* "Hyderabad's first stone-arcaded market street."

**Madina building and Hotel Madina.**
- *Look:* A large Nizam-era block at Madina circle, near the south end of Naya Pul, with about 200
  shops (saris and fabric). It is a waqf property whose rents historically went to residents of
  Medina.
- *90s:* **Hotel Madina** (opened 1947) was open. It burned in 2010 and reopened in 2018.

**Shah Ali Banda.** The road south from Charminar climbs towards Falaknuma. It is lined with dense
two- and three-storey houses, shops and lanes. **Pista House** started at Shalibanda in 1997
(late-90s only).

**Falaknuma Palace (built 1884–1893).**
- *Look:* A white neo-classical palace with Italian marble and columns, seen from the city below
  on its hill about 3.4 km south of Charminar. The plan is shaped like a **scorpion**, with two
  wings as pincers. Designed by William Ward Marrett for a Paigah noble. The Nizam bought it in
  1897 as a royal guest house.
- *90s:* **Closed and silent.** The Taj hotel opened only in November 2010. Perfect as the
  mysterious locked palace on the hill.
- *Trump:* "Falaknuma means 'mirror of the sky'."

### B. The Musi, its bridges and the Afzalgunj civic cluster

**Puranapul (1578).**
- *Look:* The oldest bridge in the city: granite, with a row of about 22 low arches, west of the Old
  City.
- *Trump:* "The only bridge to survive the Great Musi Flood of 28 Sept 1908."
- *(legend)* The Sultan built it to cross the river to meet Bhagmati (see section 5).

**Other bridges.**
- Naya Pul, also called Afzal Gunj bridge or Salar Jung Pul (c. 1859).
- Chaderghat, also called Oliphant bridge (1831).
- Musallam Jung bridge (c. 1901).
- The 1908 flood swept away the Afzal Gunj, Musallam Jung and Chaderghat bridges. The bridges of
  the 90s are their rebuilt versions (unverified details). In-game they are `BRIDGE` roads over a
  wide `SAND` and `WATER` bed.

**Osmania General Hospital (completed c. 1925; sources give 1919–1926).**
- *Look:* On the north bank. A huge three-storey Indo-Saracenic block of granite in lime mortar,
  with domes, chhatris, merlons and chajjas. Designed by Vincent Esch.
- *Trump:* "An old tamarind tree in its grounds saved about 150 people who climbed it in the 1908
  flood."

**High Court (built 1915–1919, opened 20 April 1920).**
- *Look:* On the south bank. Striped red-and-white (some say pink-and-white) stone, with domes and
  minarets. Qutb Shahi palace ruins were found while digging its foundations.

**State Central Library (foundation 1932, opened 1936).**
- *Look:* On the north bank at Afzalgunj. A grand arched Nizam-era building. The library itself
  (Asafia) dates to 1891. It was declared a heritage building in 1998.

**Salar Jung Museum (at this building since 1968).**
- *Look:* On the south bank. A long cream building, possibly semicircular in plan (unverified).
- *Kids:* Every school trip went to watch the **musical clock**: every hour, a little mechanical
  figure strikes the bell. Also the marble **Veiled Rebecca** (by G. B. Benzoni, bought in Rome in
  1876).
- *Trump:* "One family's collection became a national museum."

**MGBS / Imlibun (rebuilt 1994).**
- *Look:* A vast new bus station by the Musi with rows of bays, curved canopies and red APSRTC
  buses.
- Nearby, the **Gowliguda City Bus Station** used a 1930s Nizam-era aircraft hangar (the
  "Mississippi hangar"), a giant curved steel shed. It was still in use in the 90s and collapsed
  only in 2018. This is a fantastic set-piece.

**Begum Bazaar.** The big wholesale market west of Afzalgunj, selling spices, steel vessels and
plastics. Known for **night** kite flying.

### C. Koti, Abids, Nampally, Basheerbagh

**Koti and Sultan Bazaar.**
- The **British Residency** (c. 1803–05) is a Palladian mansion with tall Corinthian columns and
  a pediment, set in gardens. It has been a women's college since 1949.
- **Sultan Bazaar** is a dense lane of clothes, shoes and wedding shops. Koti's footpaths sell
  textbooks (unverified street name, "Badi Chowdi").

**Moazzam Jahi Market (1933–35).**
- *Look:* Grey granite arcades around a two-storey **octagonal clock tower** with clocks on
  alternate faces. Fruit, flowers and dry fruits. Ice cream parlours (*Famous Ice Cream*,
  founding year unverified). **Karachi Bakery's** first shop was here (1953): fruit biscuits.
- *Trump:* "Named after Prince Moazzam Jah, second son of the last Nizam."

**Abids.**
- The commercial heart: the GPO, **St George's Church** (1844), the **Grand Hotel** Irani café
  (1935), and Chermas.
- **Sunday book market:** On Sunday the pavements become a second-hand book bazaar, there since at
  least the mid-1980s. Magazines, comics and novels; textbooks are towards Koti. A perfect Sunday
  collectible hunt.
- *Trump:* "Named after a shop owned by Albert Abid, valet to the 6th Nizam" (his identity is
  disputed).

**Nampally.**
- **Hyderabad Deccan station** (1907). It took passengers only from 1921 and has a Nizam-era
  domed façade.
- **Exhibition Grounds:** home of **Numaish** (All India Industrial Exhibition). It began in 1938
  at Public Gardens and moved here in 1946. It runs every **1 January to about 15 February**.
  Kids: giant wheel, "death-well" motorbike show (unverified 90s presence), toy stalls, papad and
  pickle stalls, *Delhi ka papad* (unverified).
- **Public Gardens (Bagh-e-Aam, 1846 per most sources).** Lawns and old trees. It contains:
  - the white **Assembly** (Town Hall), Indo-Saracenic with Rajasthani-style chhatris, begun 1905
    and finished 1913, paid for by citizens for Nizam Mahbub Ali Khan's 40th birthday;
  - **Jubilee Hall**;
  - the **State Archaeology Museum**.
- **Subhan Bakery** (1948): Osmania biscuits and *dum ke roat*.

**Basheerbagh, Fateh Maidan and LB Stadium.**
- **Fateh Maidan** was named after the Mughal camp in the 1687 siege of Golconda and later used as
  a polo ground. It has hosted cricket since 1950–51 and its first Test was India v New Zealand in
  November 1955. It was renamed **Lal Bahadur Shastri Stadium** (1960 or 1967, sources differ).
  Concrete stands; a small, high-scoring ground.
- **Café Bahar** (1973).
- **Skyline** cinema (English films; unverified).

### D. Naubat Pahad, Lakdikapul, Khairatabad, Panjagutta, Ameerpet

**Birla Mandir (built over ten years, opened 1976).**
- *Look:* A gleaming white temple of about 2,000 t of Rajasthani marble on the rocky Naubat Pahad
  hill, with tall carved towers and stairs up the rock. Dedicated to Lord Venkateswara. It
  overlooks Hussain Sagar.
- *Trump:* "Deliberately has **no bells**, to keep it quiet for meditation."

**Birla Planetarium (8 Sept 1985) and Science Museum (1990).**
- *Look:* A white hemispherical dome on the same ridge.
- *Kids:* School-trip star shows under the dome.
- *Era note:* The **Dinosaurium opened in 2000** and is an anachronism.

**Lakdikapul.** Named after a bridge over the railway that was partly made of wood (1940s per
Wikipedia). Nearby: **Ravindra Bharathi** auditorium (11 May 1961), **Niloufer café** (1978), and
the old Secretariat at Saifabad.

**Khairatabad.**
- The famous **Bada Ganesh**: a 1 ft idol in 1954 that grew about 1 ft every year. In the 90s it
  was about **36 to 45 ft** tall (derived). Kids queued to see it.
- Khairatabad railway station.

**Panjagutta.** A busy flat junction in the 90s with no flyover (unverified), on the road to
Ameerpet and Banjara Hills. *Gutta* is Telugu for hillock.

**Ameerpet.** A middle-class residential and commercial area. It became the "computer course"
coaching hub in the late 1990s and 2000s (unverified start), with banners for C, C++, Java and
"Y2K". Good for a 1999 flavour gag.

### E. The Hussain Sagar ring

**Hussain Sagar (1562).**
- Built across a Musi tributary under Ibrahim Quli Qutb Shah, overseen by Hussain Shah Wali.
  Maximum depth about 9.8 m. Water colour #2f7f86 to #3f9aa0.
- *Kids:* Ganesh **Nimajjanam**: idols paraded along the Tank Bund and lowered into the lake.

**Buddha statue.**
- *Look:* About 18 m tall, about 450 t of white granite from near Bhongir, standing on a lotus
  pedestal on a concrete platform called "Gibraltar Rock".
- *History:* It **capsized off its barge on 10 March 1990**, lay at the bottom of the lake for
  about two years, and stood again in 1992 (erected 12 Apr 1992; dedicated 1 Dec 1992; sources
  differ).
- *Trump:* "The Buddha who sank and rose again."

**Tank Bund.**
- *Look:* A wide road along the top of the dam, with lamps and **33 bronze statues** of Telugu
  greats installed in the 1980s under the then Chief Minister (exact year unverified; a 34th was
  added later). Replicas of the Kakatiya arches stand at both ends.
- *Kids:* Evening cycle rides, roasted *bhutta*, peanuts, watching the sunset over the Buddha.

**Lumbini Park (1994).**
- *Look:* About 3 ha (7.5 acres) at the lake's southern tip, opened by the then Chief Minister
  N. T. Rama Rao.
- *Kids:* **Boats out to the Buddha.**
- *Era note:* The laser show is of uncertain date. Treat it as post-1999 unless it is verified.

**Necklace Road.** A 3.6 km lakeside road built by HUDA. It was developed in 1996 and completed in
1998. In 1999 it is **brand new**. Renamed P. V. Narasimha Rao Marg in 2021; use "Necklace Road".

**The empty plot (future NTR Gardens).**
- The **Hussain Sagar Thermal Power Station** stood here. It was decommissioned in 1992 and
  **demolished in 1995**.
- In 1999 this is cleared wasteland. The NTR memorial land was set aside in 1999 and the gardens
  were built in phases from 1999 to 2001.
- Great for a "ghost of the power station" kid rumour (invented, so label it as fiction).

**Sanjeevaiah Park.** About 90 acres on the north shore. HUDA and the Buddha Purnima project took
it over from the MCH in 2003. Its 90s state is unverified: draw it as a plain municipal park.

**Indira Park.** Foundation laid 1975, opened 1978, 76 acres on Lower Tank Bund, east of the lake.

### F. East: Himayatnagar, Narayanguda, RTC X Roads, Chikkadpally, Osmania University

**Himayatnagar and Narayanguda.** Dense middle-class shopping streets of saris, sweets, tiffin
centres and colleges. Specific 90s shops are unverified, so use generic signboards.

**RTC X Roads ("Charminar Chowrasta").** Tollywood's first-day-first-show cinema district.
- The nickname comes from the nearby VST Charminar cigarette factory, per Wikipedia (citation
  needed). APSRTC's **Bus Bhavan** headquarters is near the junction.
- *Look:* Huge **hand-painted film cut-outs**, garlands, crowds and tickets in black.
- Cinemas: **Sandhya 70mm and 35mm** (among the first 70mm screens in the twin cities),
  **Sudarshan 35mm** (about 50 years old by the 2020s), **Devi 70mm**, **Odeon** (a single screen
  then), Sri Mayuri, Sapthagiri, Usha Mayuri.
- *Trump:* "At Devi 70mm, a 1990 college-gang hit (*Shiva*) ran over 100 days."
- **Bawarchi** biryani (1994) is next to Sandhya.

**Chikkadpally.** Neighbours RTC X Roads; tiffin and music sabhas (unverified).

**Osmania University (founded 1918).**
- The **Arts College** was built 1934–39 and opened on 4 Dec 1939, designed by the Belgian
  architect Ernest Jasper. *Look:* A long, monumental pinkish-granite front mixing Ajanta- and
  Ellora-style pillars and lintels with Indo-Saracenic arches. It sits on a huge rocky, green
  campus.
- **Tarnaka** lies beyond it to the north-east.

### G. Secunderabad and Begumpet

**Secunderabad Junction (opened 9 Oct 1874).** Built by the Nizam's Guaranteed State Railway. A
long Deccan-style station façade, with **Alpha Hotel** (1957) opposite.

**Clock Tower (built 1896, opened 1 Feb 1897).**
- *Look:* A 120 ft stone tower in a park of about 2.5 acres. The clock was donated by a local
  businessman. The **Garden** Irani café (1940s) stands opposite.

**Paradise.** A canteen beside **Paradise cinema** that opened in 1953. The cinema closed in 1987
(so do not show it running in the 90s). The restaurant grew into the city's biryani landmark, and
the junction carries its name.

**Parade Grounds and Gymkhana.** Vast flat army grounds (`GROUND`) used for parades and big public
events, next to the Gymkhana cricket ground (exact sizes unverified).

**Monda Market (1860s–1870s).**
- Built to feed the British cantonment. Old covered market halls of vegetables and flowers, next to
  a jail block of 1826.
- The **wholesale trade moved to Bowenpally in 1998**.

**Other Secunderabad places.** **St Mary's Church** (1850). **Secunderabad Club** (1878, colonnaded
clubhouse). **Sangeet 70mm**, the cinema that brought Hollywood films to the city, closed in 2008.

**Begumpet Airport (opened June 1936).**
- The old terminal is from 1937 and the newer south-side terminal from 1972.
- In the 90s it is **the** city airport, cramped and overcrowded. Planes come in low over the
  roads (gameplay: kids watching landings, unverified as a custom).

**Spanish Mosque (Begumpet, about 1900–1906).** Built by the Paigah noble Viqar-ul-Umra. Moorish
style, with pointed spires instead of domes. Paigah palaces stand nearby.

### H. West: Mehdipatnam, Tolichowki, Golconda, the tombs, the Zoo, Gandipet

**Mehdipatnam and Tolichowki.** Growing 90s suburbs on the road to Golconda. Bus depots and army
areas. Tolichowki's name is said to come from a troop post ("toli chowki") (unverified).

**Golconda Fort.**
- *Look:* A granite hill about 120 m high, crowned by the **Bala Hissar** pavilion. It has
  crenellated walls with **87 semicircular bastions**, some up to about 18 m (60 ft), and **8
  gates**. The outer wall is 5 to 10 km round (sources vary). Colour: sandstone and granite
  (#b98f5e, #8f8a86). Main gate: **Fateh Darwaza**.
- **Clap acoustics:** A clap under the entrance dome can be heard at Bala Hissar, about 1 km away.
  It is the minigame.
- **Siege:** Aurangzeb besieged the fort for about 8 months (28 Jan to 22 Sep 1687). It fell
  through an insider opening the way, not by storm.
- **Diamonds:** Diamonds from the Kollur mines were traded here, so "Golconda" came to mean great
  wealth.
- The **Ramdas Bandikhana** cell is inside (see legends).
- **Sound and light show:** Narrated in the booming voice of a Hindi film legend (do not name him).
  The original system dates from the 1990s; the exact start year is unverified.

**Qutb Shahi Tombs (Ibrahim Bagh).**
- Just north of the fort's outer wall by the **Banjara Darwaza**. It holds tombs of 5 of the 7
  sultans plus royals: about 40 mausoleums and 23 mosques.
- *Look:* Domes on square arcaded bases on raised terraces. Grey granite with stucco, once covered
  in blue and green tiles; a few tiles survive. Muhammad Quli's tomb is about 42 m tall. Called
  "Seven Tombs" locally.
- **Taramati Baradari** is a pavilion nearby (see legends).

**Nehru Zoological Park (opened 6 Oct 1963).** 380 acres beside **Mir Alam Tank**, south-west of
the Old City. **Lion safari** since 1974. Kids: safari bus, elephants, nocturnal house.

**Gandipet and Osman Sagar (about 1920–21).** About 18 to 20 km west. A reservoir built after the
1908 flood; Himayat Sagar followed in 1927. The classic weekend **picnic spot** with a dam
promenade and gardens. Make it an off-map trip.

### I. North-west: Banjara Hills, Jubilee Hills, KBR, Film Nagar, Madhapur

**Banjara Hills.** Named after the Banjara (Lambadi) people who lived there before the elite moved
in from the 1920s. In the 90s: granite outcrops, bungalows with compound walls, and lakes.

**Jubilee Hills.** Developed after a 1963 housing-society scheme (the name's origin is unverified).
Huge boulder clusters stand between villas. The Hyderabad **Society to Save Rocks** was
registered in 1996.

**KBR Park.** The Chiran Palace estate, given to Prince Mukarram Jah in 1967. It was declared a
national park in 1998 (one source says 1994). About 390 acres of scrub, rock and walking trails.

**Film Nagar.** **Annapurna Studios** (1976) and **Ramanaidu Studios** (1989; location disputed).
Shooting crowds, "shooting going on" boards and sets.

**Madhapur and HITEC City.**
- **Cyber Towers** was opened by PM Vajpayee on **22 Nov 1998**.
- *Look:* About 8 to 10 storeys of reflective glass in **four quadrants around a central
  fountain**, alone among boulders and scrub.
- **Microsoft's India Development Centre** opened in temporary premises in Aug 1998 and moved into
  Hi-Tec City in early 1999.

**Shilparamam.** A 65-acre crafts village established in 1992. Wikipedia gives its public opening
as 21 June 1998. Crafts stalls and a rural museum.

**Off-map: Ramoji Film City (1996).** About 25 km east, on 1,666 to 2,000 acres. Its Guinness
"largest studio complex" record dates from 2005, so it is anachronistic for 1999.

### J. Food and hang-outs (founding years)

| Place | Founded | Notes |
|---|---|---|
| Grand Hotel, Abids | 1935 | Irani café |
| Garden, Secunderabad | 1940s | Irani café opposite the Clock Tower |
| Hotel Madina | 1947 | Burned 2010 |
| Subhan Bakery | 1948 | |
| Paradise | 1953 | |
| Karachi Bakery | 1953 | |
| Alpha | 1957 | |
| Café Bahar | 1973 | |
| Niloufer | 1978 | |
| Shah Ghouse | 1989 | |
| Nimrah, Charminar | 1993 | |
| Bawarchi | 1994 | |
| Pista House | 1997 | Its haleem dates from about 2002 (unverified); the haleem GI tag is from 2010 |

- **Irani café look:** bentwood chairs, marble-top tables, a glass counter of Osmania biscuits, a
  wall clock, a jukebox (unverified per café), and teal paint (#2a8c82).
- **Order:** "Ek *pauna*, do biscoot!"

---

## 3. Anachronism blacklist (do NOT show in 1990–1999)

| Thing | Date | What to show instead in the 90s |
|---|---|---|
| Telangana state, TS plates, "Telangana" signage | 2 Jun 2014 | Andhra Pradesh, APSRTC, AP plates |
| GHMC | 2007 (unverified) | MCH |
| Buddha Purnima Project Authority | Constituted Dec 2000 | HUDA |
| Dinosaurium at Birla Science Centre | 2000 | Planetarium and Science Museum only |
| Nizam's Museum, Purani Haveli | 18 Feb 2000 | Purani Haveli as a closed old palace |
| Masab Tank flyover | 2001 | Flat junction |
| Panjagutta, Basheerbagh, Begumpet, Telugu Talli flyovers | 2000s (unverified) | Flat junctions with a traffic cop on a podium |
| NTR Gardens / NTR memorial | 1999–2001 | Empty plot of the demolished power station |
| Gachibowli stadiums | Built 2001–02, opened 2003 | Rocky scrub |
| HITEX exhibition centre | 14 Jan 2003 | Rocky scrub |
| Prasads IMAX / multiplex | 25 Jul 2003 | Single-screen cinemas |
| MMTS local trains (incl. Necklace Road and Hitec City stations) | 9 Aug 2003 | Mainline trains only |
| Sanjeevaiah Park tourist makeover | After 2003 | Plain municipal park |
| Snow World | 28 Jan 2004 | |
| Hyderabad Central mall, Panjagutta | 2004 (unverified) | |
| Chowmahalla Palace open to visitors | Jan 2005 | Locked palace |
| Ramoji "Guinness largest studio" claim | 2005 | |
| Jalavihar water park | Land allotted 2000; opened later | |
| Eat Street, Necklace Road | 2000s (unverified) | |
| Lumbini laser show | Unverified | Treat as post-1999 |
| Rajiv Gandhi International Airport (Shamshabad) | 23 Mar 2008 | Begumpet is the airport |
| Outer Ring Road | Nov 2008 first stretch; most by 2012 | |
| Sangeet 70mm closure | 2008 | Sangeet is open in the 90s |
| GVK One mall | 1 May 2009 | |
| Inorbit mall | Oct 2009 | |
| PVNR Expressway | 19 Oct 2009 | |
| Taj Falaknuma hotel | Nov 2010 | Palace closed |
| Haleem GI tag | 2010 | |
| Hyderabad Metro (pillars, stations, viaducts) | 28 Nov 2017 | |
| Gowliguda hangar collapse | 2018 | Hangar standing and in use |
| Durgam Cheruvu cable bridge | 25 Sep 2020 | |
| "P. V. Narasimha Rao Marg" name | 2021 | Necklace Road |
| New Secretariat, 125 ft Ambedkar statue | 2023 | Old Secretariat |
| Lac bangle GI tag | 2024 | |

**Gone by the 90s (do not show running):** Paradise cinema (closed 1987) and the Hussain Sagar
power station after 1995.

**Partial-decade items (check the in-game year):**
- Buddha underwater 10 Mar 1990 to 1992.
- Lumbini Park (1994), MGBS (1994), Bawarchi (1994).
- Gemini TV (9 Feb 1995), ETV Telugu (27 Aug 1995).
- Ramoji Film City (1996), Necklace Road (1996–98), Pista House (1997).
- KBR National Park status and Shilparamam opening (1998), Monda wholesale move (1998).
- Cyber Towers (22 Nov 1998), Rythu Bazaars (26 Jan 1999).

**General era caution:** Mobile phones were very rare (cellular service reached AP in the mid to
late 1990s, unverified). Use **STD/PCO booths** and pagers. No ATMs on every corner and no
internet cafés before about 1998 (unverified). McDonald's entered India in 1996 but a 90s
Hyderabad outlet is unverified, so avoid it.

---

## 4. Real 1990s Hyderabad events (for the timeline and story beats)

| Date | Event |
|---|---|
| 10 Mar 1990 | The Buddha statue topples off its barge into Hussain Sagar while being moved (a fatal accident; keep in-game references gentle). |
| 1990 | Birla Science Museum opens next to the planetarium. |
| 1992 | Hussain Sagar Thermal Power Station decommissioned. Buddha raised and erected on Gibraltar Rock (12 Apr; dedicated 1 Dec, sources differ). Shilparamam established. |
| 30 Sep 1993 | Latur (Killari) earthquake in Maharashtra. Recorded by NGRI's Hyderabad station; whether it was felt in the city is unverified. |
| 1993 | Nimrah café opens beside Charminar. |
| 1994 | Lumbini Park opened by the then CM N. T. Rama Rao. New MGBS at Imlibun. Bawarchi opens at RTC X Roads. |
| 9 Feb 1995 | Gemini TV, the first Telugu satellite channel. |
| 27 Aug 1995 | ETV Telugu launches. Cable TV is the big 90s change; the exact arrival of Hyderabad cable is unverified. |
| 1995 | Government of India buys the **Nizam's jewellery** (about ₹218 crore per the National Museum). It includes the 184.75-carat **Jacob Diamond**, which Nizam VII used as a paperweight. The jewels went to an RBI vault in Mumbai. Power station demolished. |
| 1996 | Ramoji Film City founded. Society to Save Rocks registered. HUDA develops Necklace Road. |
| 1997 | Pista House opens at Shalibanda. |
| Aug 1998 | Microsoft's India Development Centre opens (temporary premises). |
| 1998 | Necklace Road completed (BPPA presentation). Monda wholesale moves to Bowenpally. KBR declared a national park. State Central Library listed as heritage. Shilparamam opens to the public (21 Jun). |
| 22 Nov 1998 | **HITEC City / Cyber Towers** opened by PM Atal Bihari Vajpayee. |
| 14 Jan 1999 | Sankranti, a Thursday. |
| 26 Jan 1999 | First **Rythu Bazaars** (farmers' markets) open. |
| 1999 | Land set aside for the NTR memorial, the start of NTR Gardens. |

**Yearly rhythm for missions:**
- Numaish: 1 Jan to about 15 Feb.
- Sankranti kites: mid-January.
- Ramzan haleem season (moves through the decade).
- Bonalu: July–August (unverified exact months).
- Ganesh Chaturthi and the Tank Bund immersion: Aug–Sep.
- Monsoon: the Musi fills.

**Politics:** Keep it off-stage. NTR (died 1996) can be referred to historically. Do not name or
characterise living politicians or film stars.

---

## 5. Urban legends and folklore (all clearly legends)

1. **The Charminar–Golconda tunnel (legend).** A secret royal escape tunnel is said to link
   Charminar to Golconda, about 8 km away. Decades of rumours and occasional digs (ASI, 2019) found
   only chambers and arches; no tunnel has ever been confirmed. *Ideal main-plot MacGuffin:* kids
   chase the rumour and find something better.
2. **Bhagmati and "Bhagnagar" (legend, disputed).** Prince Muhammad Quli fell in love with
   Bhagmati, a dancer from Chichlam village across the Musi. Puranapul was built so he could cross
   the flooded river to meet her, and the city was named Bhagnagar after her. Many historians say
   there is no contemporary evidence she existed; the city was called Haidarabad.
3. **The Golconda clap (real effect, legendary purpose).** The acoustics are real. The story that it
   warned the king of intruders or assassins is folklore.
4. **Taramati and Premamati (legend).** Two dancer sisters are said to have danced on ropes strung
   from their pavilion (Taramati Baradari) to the Sultan's balcony at Golconda. Another version
   says Taramati's song carried all the way to the fort.
5. **Bhakta Ramdas's coins (legend).** Gopanna (Ramdas) was jailed in Golconda's cell for spending
   tax money on the Bhadrachalam temple. Two mysterious youths, said to be Rama and Lakshmana,
   paid the Sultan in gold "Rama tanka" coins and he was freed. Records give several versions.
6. **Mecca Masjid's bricks (belief).** Bricks above the central arch are said to be made with soil
   brought from Mecca.
7. **Charminar and the plague (theory).** It was built to mark the end of a plague; the ASI says
   there are "various theories".
8. **The Nizam's hidden treasure (legend).** The last Nizam's fortune is said to lie in secret
   chambers under King Kothi. None has been found, though a real Nizam-era chest was once found
   in a chamber near the Secretariat.
9. **The diamond in the slipper (anecdote).** The 7th Nizam found the Jacob Diamond in his father's
   slipper and used it as a paperweight.
10. **Naubat Pahad's drums (tour-guide story).** Proclamations were announced from the hilltop with
    *naubat* drums (it is attributed to Aurangzeb's time).
11. **The tamarind tree of 1908 (attested local story).** About 150 people survived the flood in
    the tree at Osmania Hospital.
12. **Golconda and the great diamonds (popular claim).** Fabled stones are linked to Golconda's
    trade; the Kollur mines are documented. Treat specific claims (e.g. the Koh-i-Noor) as
    legend-level.

---

## 6. Glossary (Dakhni / Telugu / Urdu)

| Word | Meaning |
|---|---|
| *hau* | yes |
| *nakko* | no / don't |
| *kya re* | hey, what's up |
| *baigan* | "nonsense!" (lit. brinjal) |
| *mamu* | uncle / buddy |
| *pul* | bridge |
| *kaman* | arch |
| *houz* | cistern, pool |
| *darwaza* | gate |
| *bagh* | garden |
| *maidan* | open ground |
| *pahad* | hill |
| *gutta* | (Telugu) hillock |
| *cheruvu* | (Telugu) lake, tank |
| *sagar* | big lake (lit. sea) |
| *chowrasta* | crossroads |
| *gunj / ganj* | market town |
| *mandi* | market |
| *kothi / deodi* | mansion / noble's house |
| *baradari* | twelve-doored pavilion |
| *bandikhana* | prison |
| *naubat* | ceremonial kettle-drum |
| *numaish* | exhibition |
| *chudi* | bangle |
| *laad* | lac |
| *patang* / *gaalipatam* (Telugu) | kite |
| *manja* | glass-coated kite string |
| *pauna* | small ("three-quarter") cup of Irani chai |
| *bun maska* | buttered bun |
| *dum ke roat* | Nizam-era semolina cookie |
| *haleem* | slow-cooked wheat-and-meat porridge (Ramzan) |
| *bhutta* | roasted corn cob |
| *nimajjanam* | (Telugu) immersion of Ganesh idols |

---

## 7. Sources (consulted via web search, Oct 2026)

**Lake, statue and lakeside**
- Buddha statue / Hussain Sagar: [en.wikipedia.org/wiki/Buddha_Statue_of_Hyderabad](https://en.wikipedia.org/wiki/Buddha_Statue_of_Hyderabad), [Hussain_Sagar](https://en.wikipedia.org/wiki/Hussain_Sagar), [thenewsminute (Buddha)](https://www.thenewsminute.com/telangana/story-man-behind-hyderabads-famous-buddha-statue-hussain-sagar-60035), [thesouthfirst](https://thesouthfirst.com/telangana/the-buddha-who-sank-and-rose-hyderabads-icon-marks-19-years-since-consecration/)
- Tank Bund: [Tank_Bund_Road](https://en.wikipedia.org/wiki/Tank_Bund_Road), [deccanherald](https://deccanherald.com/features/statues-may-face-axe-hyderabad-2211780)
- Lumbini and Indira parks: [Lumbini_Park](https://en.wikipedia.org/wiki/Lumbini_Park), [incredibleindia Lumbini](https://www.incredibleindia.gov.in/en/telangana/hyderabad/lumbini-park), [Indira_Park](https://en.wikipedia.org/wiki/Indira_Park)
- Necklace Road and Sanjeevaiah Park: [HMDA BPP](https://www.hmda.gov.in/bpp0/), [BPPA note](https://asokji.in/sites/default/files/BPPA2CS.pdf), [Necklace_Road](https://en.wikipedia.org/wiki/Necklace_Road)
- NTR Gardens and the power station: [NTR_Gardens](https://en.wikipedia.org/wiki/NTR_Gardens), [Hussain_Sagar_Thermal_Power_Station](https://en.wikipedia.org/wiki/Hussain_Sagar_Thermal_Power_Station)
- Ganesh: [Khairatabad_Ganesh](https://en.wikipedia.org/wiki/Khairatabad_Ganesh), [thenewsminute](https://www.thenewsminute.com/amp/story/telangana/how-1-foot-idol-set-1954-hyderabad-became-india-s-tallest-ganesh-idol-108620)

**HITEC City and the north-west**
- HITEC City and Microsoft: [HITEC_City](https://en.wikipedia.org/wiki/HITEC_City), [Microsoft 1998](https://news.microsoft.com/source/1998/03/24/microsoft-plans-software-development-center-in-india/), [Microsoft 1999](https://news.microsoft.com/1999/03/08/microsoft-opens-new-product-development-center-in-india/), [myhq Cyber Towers](https://myhq.in/office-space-for-rent/cyber-towers)
- Shilparamam: [Shilparamam](https://en.wikipedia.org/wiki/Shilparamam)
- KBR: [KBR NP](https://en.wikipedia.org/wiki/Kasu_Brahmananda_Reddy_National_Park)
- Studios: [Annapurna](https://en.wikipedia.org/wiki/Annapurna_Studios), [film studios list](https://en.wikipedia.org/wiki/List_of_film_studios_in_Hyderabad)
- Rocks: [Society_to_Save_Rocks](https://en.wikipedia.org/wiki/Society_to_Save_Rocks)
- Locality names: [Etymology of localities](https://en.wikipedia.org/wiki/Etymology_of_localities_of_Hyderabad), [Abids](https://en.wikipedia.org/wiki/Abids)

**Old City and the Musi**
- Charminar and Old City: [Charminar](https://en.wikipedia.org/wiki/Charminar), [Britannica](https://www.britannica.com/topic/Charminar), [Telangana Tourism](https://telanganatourism.gov.in/partials/destinations/heritage-spots/hyderabad/charminar.html), [Makkah Masjid](https://en.wikipedia.org/wiki/Makkah_Masjid,_Hyderabad), [Gulzar_Houz](https://en.wikipedia.org/wiki/Gulzar_Houz), [Pathargatti](https://en.wikipedia.org/wiki/Pathargatti), [Madina building](https://en.wikipedia.org/wiki/Madina_building,_Hyderabad), [Laad Bazaar](https://wikipedia.com/wiki/Laad_Bazar), [Sahapedia bangles](https://www.sahapedia.org/crafted-lac-and-glass-bangle-traditions-hyderabad)
- Palaces and museums: [Chowmahalla](https://en.wikipedia.org/wiki/Chowmahalla_Palace), [Falaknuma](https://en.wikipedia.org/wiki/Falaknuma_Palace), [Nizam's Museum](https://en.wikipedia.org/wiki/The_Nizam%27s_Museum), [Salar Jung Museum](https://en.wikipedia.org/wiki/Salar_Jung_Museum)
- Musi and civic buildings: [Purana pul](https://en.wikipedia.org/wiki/Purana_pul), [Chaderghat](https://en.wikipedia.org/wiki/Chaderghat), [Great Musi Flood](https://en.wikipedia.org/wiki/Great_Musi_Flood_of_1908), [OGH livehistoryindia](https://livehistoryindia.com/story/monuments/osmania-hospital), [High Court](https://en.wikipedia.org/wiki/Telangana_High_Court), [State Central Library](https://en.wikipedia.org/wiki/State_Central_Library,_Hyderabad)
- Bus stations: [MGBS](https://en.wikipedia.org/wiki/Mahatma_Gandhi_Bus_Station), [CBS hangar](https://en.wikipedia.org/wiki/Central_Bus_Station,_Hyderabad)

**Central Hyderabad**
- Nampally: [Numaish](https://en.wikipedia.org/wiki/Numaish), [Public Gardens](https://en.wikipedia.org/wiki/Public_Gardens,_Hyderabad), [Hyderabad Deccan station](https://en.wikipedia.org/wiki/Hyderabad_Deccan_railway_station), [Telangana Legislature](https://en.wikipedia.org/wiki/Telangana_Legislature)
- Koti and Abids: [Moazzam Jahi Market](https://en.wikipedia.org/wiki/Moazzam_Jahi_Market), [British Residency](https://en.wikipedia.org/wiki/British_Residency,_Hyderabad), [Abids book market](https://www.thenewsminute.com/amp/story/telangana/spanning-decades-hyderabad-s-iconic-book-market-abids-has-stood-test-time-58454)
- Basheerbagh and Naubat Pahad: [LB Stadium](https://en.wikipedia.org/wiki/Lal_Bahadur_Shastri_Stadium,_Hyderabad), [Birla Mandir](https://en.wikipedia.org/wiki/Birla_Mandir,_Hyderabad), [Birla Science Museum](https://en.wikipedia.org/wiki/Birla_Science_Museum), [Naubat Pahad walk](https://deccanchronicle.com/151026/lifestyle-offbeat/article/trail-way-crossing)
- Ravindra Bharathi: [Ravindra Bharathi](https://en.wikipedia.org/wiki/Ravindra_Bharathi)
- Osmania University: [OU Arts College](https://nwmindia.org/?p=4518), [Deccan Chronicle](https://deccanchronicle.com/southern-states/telangana/ou-arts-college-to-be-restored-to-its-grandeur-1874551)

**Secunderabad and Begumpet**
- Clock Tower and station: [Clock Tower](https://en.wikipedia.org/wiki/Secunderabad_Clock_Tower), [Sec'bad Jn](https://en.wikipedia.org/wiki/Secunderabad_Junction_railway_station)
- Markets, clubs and churches: [Monda Market](https://en.wikipedia.org/wiki/Monda_Market), [Secunderabad Club](https://en.wikipedia.org/wiki/Secunderabad_Club), [St Mary's](https://en.wikipedia.org/wiki/Basilica_of_Our_Lady_of_the_Assumption,_Secunderabad)
- Irani cafés: [Irani cafés of Secunderabad](https://www.thenewsminute.com/telangana/vanishing-irani-cafes-secunderabad-35374), [Outlook "Well-Read Leaves"](https://www.outlookindia.com/society/well-read-leaves-news-293467)
- Begumpet: [Begumpet Airport](https://en.wikipedia.org/wiki/Begumpet_Airport), [Spanish Mosque](https://en.wikipedia.org/wiki/Spanish_Mosque)

**Golconda and the west**
- Fort and tombs: [Golconda](https://en.wikipedia.org/wiki/Golconda), [Siege of Golconda](https://en.wikipedia.org/wiki/Siege_of_Golconda), [Telangana Tourism Golconda](https://telanganatourism.gov.in/blog/12-may-2017-golkonda-fort.html), [Qutb Shahi tombs](https://en.wikipedia.org/wiki/Qutb_Shahi_tombs), [Deccan Herald necropolis](https://deccanherald.com/lifestyle/travel/the-grandest-necropolis-of-hyderabad-3189366)
- Sound and light show: [Sakshi](https://www.sakshipost.com/new-tech-to-infuse-fresh-life-into-golconda-s-light-sound-show)
- Zoo and reservoirs: [Nehru Zoo](https://en.wikipedia.org/wiki/Nehru_Zoological_Park), [Osman Sagar](https://en.wikipedia.org/wiki/Osman_Sagar)

**Food, cinema and TV**
- Food: [Karachi Bakery](https://en.wikipedia.org/wiki/Karachi_Bakery), [Paradise (Outlook Business)](https://www.outlookbusiness.com/regional-brand/heavenly-delight-3807), [Nimrah (LBB)](https://lbb.in/hyderabad/nimrah-cafe-charminar/), [Cafe Bahar](https://en.wikipedia.org/wiki/Cafe_Bahar), [Cafe Niloufer](https://en.wikipedia.org/wiki/Cafe_Niloufer), [Shah Ghouse](https://en.wikipedia.org/wiki/Shah_Ghouse_Caf%C3%A9), [Siasat Abids/Subhan](https://www.siasat.com/1930s-irani-cafe-to-trendy-new-spots-exploring-abids-food-scene-3290362/)
- Cinema: [RTC X Roads](https://en.wikipedia.org/wiki/RTC_X_Roads), [Hollywood Reporter India](https://www.hollywoodreporterindia.com/features/insight/the-strange-resilience-of-the-telugu-main-theatre), [TNM theatres](https://www.thenewsminute.com/telangana/sangeet-odeon-iconic-hyd-theatres-have-faded-oblivion-86620)
- TV: [Gemini TV](https://en.wikipedia.org/wiki/Gemini_TV), [ETV Telugu](https://en.wikipedia.org/wiki/ETV_(Telugu))

**Events, festivals and legends**
- Events: [Nizam jewels (National Museum)](https://nationalmuseumindia.gov.in/en/exhibitions/index/9/past), [Jacob Diamond](https://en.wikipedia.org/wiki/Jacob_Diamond), [Ramoji Film City](https://en.wikipedia.org/wiki/Ramoji_Film_City), [Rythu bazaar](https://en.wikipedia.org/wiki/Rythu_bazaar)
- Kites: [kite markets (Telangana Today)](https://telanganatoday.com/tag/gulzar-houz-kite-market), [The South First kites](https://thesouthfirst.com/telangana/from-pavement-to-storefronts-the-hands-behind-hyderabads-paper-kites/)
- Legends: [tunnel rumours (Deccan Chronicle)](https://www.deccanchronicle.com/southern-states/telangana/hyderabads-historic-sites-have-a-history-of-secret-tunnel-rumours-1980969), [Bhagmati (TNM)](https://www.thenewsminute.com/article/renaming-hyderabad-and-legend-bhagmati-did-queen-really-exist-92698), [Taramati Baradari](https://en.wikipedia.org/wiki/Taramati_Baradari), [Bhadrachala Ramadasu](https://en.wikipedia.org/wiki/Bhadrachala_Ramadasu)

**Anachronism checks**
- [Prasads](https://en.wikipedia.org/wiki/Prasads_Multiplex), [Snow World](https://en.wikipedia.org/wiki/Snow_World), [MMTS](https://en.wikipedia.org/wiki/Hyderabad_Multi-Modal_Transport_System), [Metro](https://en.wikipedia.org/wiki/Hyderabad_Metro), [RGIA](https://en.wikipedia.org/wiki/Rajiv_Gandhi_International_Airport), [PVNR Expressway](https://en.wikipedia.org/wiki/P._V._Narasimha_Rao_Expressway), [Masab Tank flyover (Siasat)](https://www.siasat.com/hyderabads-masab-tank-flyover-to-remain-closed-partially-at-night-for-6-weeks-3246893/), [Inorbit](https://en.wikipedia.org/wiki/Inorbit_Mall), [GVK One](https://en.wikipedia.org/wiki/GVK_One), [ORR](https://en.wikipedia.org/wiki/Outer_Ring_Road,_Hyderabad), [Gachibowli stadium](https://en.wikipedia.org/wiki/G._M._C._Balayogi_Athletic_Stadium), [Durgam Cheruvu bridge (L&T)](https://www.larsentoubro.com/pressreleases/2020/2020-09-25-lt-built-iconic-durgam-cheruvu-cable-stay-bridge-dedicated-to-the-people-of-hyderbad)
