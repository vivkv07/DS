# NOSTALGIA, Pitch A: "SIDE B" (Heart)

*Gurthunda?* Do you remember?

**Logline.** In 2026, Srikanth, 34, a manager in a HITEC City glass tower, gets a courier from New Jersey: a worn cassette and a map drawn in sketch pen by his best friend Immu, who flew to America in 2003. He presses PLAY and is rewound to Sankranti 2003. He is eleven again, and Immu has just learned his family leaves the night after Eid. The two boys swear a pact: record the sound of the whole city on one tape, keep one token from each place in a biscuit tin, and hide it on Chand Raat at Charminar, where a legendary tunnel is said to start.

**Era (binding).** The main story runs from Tue 14 Jan to Tue 25 Nov 2003 (Chand Raat; the moon decides). Chinnu is 11, born 1992, so his toys, TV and slang are the 90s ones. Rythu Bazaars and NTR Gardens are open. Prasads IMAX opens *during* the story, on Fri 25 Jul 2003 (mission 9). Kachiguda is getting its overhead wires. Begumpet is the airport. There is no metro, no mall and no mobile phone for kids: STD booths, and one internet cafe at most. 2026 appears only in the prologue and the epilogue.

## Cast

- **Chinnu (K. Srikanth)**, 11 (34 in 2026). Hawai chappals, scabbed knees, a school shirt two sizes up, a hand-me-down Walkman on a shoelace. Speaks quick Telugu-Dakhni and says *pakka* about everything. *Want:* to stop the year. Later: to give Immu the whole city to take along.
- **Immu (Mohammed Imran)**, 11 (34). Glasses taped at the hinge, a CID-style notebook, a Hero Ranger cycle with a playing card in the spokes. Talks in dramatic spy-speak and records every clue as a cassette message ("Agent Immu to Agent Chinnu, over"). *Want:* not to go. If he must, to take Hyderabad with him.
- **Amma, "Mummy" (Padma)**, 38. Cotton saree, jasmine in her bun, the legendary chappal. Telugu-first and fast, and she always ends on your full name. *Want:* you home before the street lights. She is Chappal Meter level 5.
- **Ammamma (Kamala)**, 68. White-bordered saree, glasses on a chain. Talks in slow proverbs and calls everyone *kanna*. *Want:* her Thursday darshan, and her flour ground fine. Secretly the colony's best riddle-solver: the in-game hint giver.
- **Rasheed-saab (Immu's Abba)**, 40. Programmer at Cyber Towers, office ID on a string, a Maruti 800. Practises saying "gas station" in the mirror. Soft and apologetic. *Want:* Immu to have more choices than he had.
- **Bunty-anna**, 19, Chinnu's cousin. RX100, Ameerpet Java course, denim jacket in May. "Tension nakko, main hoon na." *Want:* an "onsite" ticket of his own. Gives races and odd jobs.
- **Faramarz uncle**, 58 (81 in 2026). White cap, a cardigan in every weather, enthroned at the *galla* of Café Noor-e-Iran (fictional), beside Charminar. "Do pauna, ek plate Osmania! Ghanton baithne ka nahi." *Want:* nobody sitting for hours on one chai. For forty years he has told kids that his cellar stair "goes to Golconda".
- **Havaldar Pochaiah**, 50. Works the RTC X Roads podium with a whistle, a Luna and a soft heart. "Ruko! Cycle pe teen log? Utro!" *Want:* one quiet day.
- **Yadagiri-anna**, 45, auto driver. He is the paid hint: ₹5 and he drops you near the answer. "Meter nakko, das upar."

## How it plays

- **Open city.** You run and ride: rental cycles (₹2 an hour, or "borrow" one), Bunty's old Luna, Yadagiri's auto, red city buses (fast travel from `koti_bus_stand` and `imlibun_bus_station`), and the Lumbini boat. Mission givers pulse on the map: Immu (the main hunt), Amma and Ammamma (errands), Bunty (races), Faramarz uncle (cafe jobs). The HQ is `irani_cafe_2` (Café Gulistan) in the colony, with chai, Osmania biscuits and an STD booth to save.
- **The tape.** Every main mission ends with ● REC. Immu records one sound of the city on Side A, and one token goes into the tin. The HUD tape counter (000–999) is the story's progress bar.
- **Clues.** Immu's cassettes (`cassette_*`) hold riddles about landmarks you can see on the map. Hints come from Ammamma at home, from Yadagiri for ₹5, or from the scribbles on the Journal map.
- **Chappal Meter.** Level 1: a colony uncle ("I'll tell your mother!"). Level 2: the Gurkha's whistle and the aunties' phone tree. Level 3: Pochaiah on foot. Level 4: Pochaiah on his Luna. Level 5: MUMMY, who arrives by auto and throws the chappal in a homing arc you have to dodge.
  - **Getting caught:** "PAKDA GAYA!", a scolding, and a ₹2 cut from your pocket money.
  - **Cooling down:** get home before the street lights, sit with a chai in an Irani cafe's family room, or buy Mummy a *moora* of jasmine at any `flower_cart_*` (−2 levels).
  - **Holy places:** inside temples, mosques and churches the meter freezes, and pursuers wait at the gate, grumbling.
- **Hidden things.**
  - 40 golis (marbles) in gullies.
  - 24 dedication cassettes for the Walkman.
  - 12 lost kites on rooftops.
  - Trump (trivia) cards at landmarks.
  - Immu's chalk arrows: trails to secrets, such as the hidden lake at `durgam_cheruvu`, a view of the locked `falaknuma_palace`, and the old Gowliguda hangar.

## Missions

**1. `bo_kaata`: "Bo Kaata!"** · Tue 14 Jan, Sankranti · terrace, `kirana_1` (Balaji Provision Stores), `playground_1`
- **Do:** buy a kite and *charkhi* on the khaata and win a *pech* against the next colony. Then chase (*lootna*) the cut kite across the rooftops into the playground, where Immu breaks the news.
- **Mechanic:** kite-fight minigame, rooftop chase.
- **Clue (tape 1):** "Every capsule needs a box. Go where a clock tower talks with only half its faces, and buy a tin that smells of fruit."
- **REC:** "Bo kaata!" **Token:** the torn kite corner.

> Kirana uncle: "Khaate mein likh diya. Abba ku bolna, khaata full ho gaya."
> Immu: "Agent Chinnu. Abba's visa came. After Eid, we fly. Over."
> Chinnu: "Baigan. America is for uncles. You're eleven."
> Immu: "So we take the city with us. Twelve places, one tape, one tin. Pakka?"

**2. `numaish_paging`: "Lost and Found"** · Jan · `mozamjahi_market`, `karachi_bakery`, `nampally_station`, `nampally_exhibition`
- **Do:** find the octagonal clock tower and buy the fruit-biscuit tin. Then empty it the only honest way: eat everything. Cut through Nampally station on a ₹3 platform ticket and find Immu at Numaish by following the loudspeaker's lost-child announcements. Each one names a stall.
- **Mechanic:** hot-and-cold crowd search.
- **Clue:** Immu has had the loudspeaker page *you*.
- **REC:** the announcement chime. **Token:** a Numaish ticket.

> Loudspeaker: "Attention please. Ek bachcha, chashma wala, naam Imran. Woh khoya nahi hai. Woh Chinnu ko dhoond raha hai, Delhi papad ke saamne."
> Bakery counter: "Dabba relatives ke liye?" Chinnu: "Nahi uncle. History ke liye."
> Immu: "I'm not lost. I'm strategically located near papad."

**3. `first_day_first_show`: "First Day, First Show"** · Feb · `rtc_x_roads`, `sandhya_theatre`, `sudarshan_theatre`, `odeon_theatre`, `devi_theatre`, `bawarchi`
- **Do:** climb the hoarding scaffolding for the tape (a colony aunty sees you: +2) and win the queue-cage shuffle for three floor-class tickets to the Megastar's new film (fictional title on every hoarding) before the counter shutter drops. Then triple-ride away from Pochaiah. At level 5, Mummy arrives. A Bawarchi parcel for Nanna buys forgiveness.
- **Mechanic:** Chappal Meter tutorial, timed queue, chase.
- **Clue:** "Go to the crossroads named after Charminar that has no Charminar. The cut-out hero with the most garlands keeps our tape under his boot."
- **REC:** the hall's roar when the hero walks on. **Token:** the ticket stub.

> Pochaiah: "Cycle pe teen log? Utro! Licence? ...Arre, you're eleven. Utro anyway."
> Yadagiri, driving Mummy: "Sorry Chinnu. Aunty ne meter pe bulaya. Meter pe!"
> Mummy: "Srikanth! Exam mundu cinema?! Intiki raa!"

**4. `world_cup_sunday`: "Last Man Batting"** · Sun 23 Mar, World Cup final day · `lb_stadium`, `assembly`, `public_gardens`
- **Do:** exams are tomorrow and the TV is banned. The colony XI's grudge match on LB Stadium's outer ground has to end before the final starts at 1:30. Field by gully rules while Immu bats last man. His winning shot lands by the seated Gandhi on the Assembly lawn: ask the sentry politely (cheek gets you +1 and no ball). Later, a radio in Public Gardens says India lost. The gang sits under the trees, quiet.
- **Mechanic:** one-tip one-hand cricket minigame, timed run, a politeness choice.
- **Clue:** "Four tall uncles with light-bulb heads guard a field. The last man bats."
- **REC:** "Howzaaat!" **Token:** the tennis ball, signed by the XI.

> Mummy: "TV nakko. Repu maths exam. Padamudu ekkam cheppu!"
> Sentry: "Gandhi-ji ke paas ball? Hallu lo, hallu jao."
> Immu: "The mummy in the museum is two thousand years old, and nobody sent her to America."

**5. `koti_right_right`: "Right, Right!"** · Apr, Ugadi shopping · `sultan_bazaar`, `gokul_chat`, `koti_bus_stand`, `imlibun_bus_station`
- **Do:** slip away from Amma's shopping and parcel samosa-ragda at Gokul Chat for Immu's Nani. Then board the right red bus at Koti (read the route boards; ride the footboard and you get scolded) and reach the platform before Nani's 4 pm express to her *ooru*.
- **Mechanic:** pani-puri challenge for pocket money, route-board puzzle, timed run.
- **Clue:** "Nani's bus leaves from a grove of tamarind trees that has no trees, only buses."
- **REC:** the conductor's double whistle. **Token:** a punched ticket.

> Gokul counter: "Teekha ya meetha? Ek extra phokat!"
> Conductor: "Right, right! Footboard nakko, andar aao!"
> Nani: "Wahan jaake Hyderabad mat bhoolna, Immu. Aur tu, isko bhoolne mat dena."

**6. `ammammas_thursday`: "Ammamma's Thursday"** · May · `pindi_girni_1`, `banana_cart_1` ("Amma Deevena"), `flower_cart_1`, `dilsukhnagar_sai_temple`
- **Do:** take the 5 kg wheat tin to the girni and sit out a power cut. Carry the flour home on the cycle carrier without spilling: potholes drain a flour bar. Buy chakkarakeli bananas and a rose garland, then take Yadagiri's auto with Ammamma to Dilsukhnagar for the Thursday evening darshan. Walk only, chappals at the stand. In the queue, Ammamma hears Immu's tape and solves it.
- **Mechanic:** errand chain, balance carry, patient queue.
- **Clue:** "Clap at a gate and a king hears you on the hill."
- **REC:** the girni's thump-thump. **Token:** brass girni token No. 47.

> Girni uncle: "Mere baal safed nahi, atta hai. Number saintalees, baitho."
> Ammamma: "In a queue even God waits, kanna."
> Ammamma: "Heard on a hill? Mee Thatha took me there in 1961. Golconda."

**7. `golconda_echo`: "The Clap at Fateh Darwaza" (midpoint)** · Jun · `rythu_bazaar_mehdipatnam`, `golconda_fort`, `qutb_shahi_tombs`
- **Do:** buy Amma's list at the Mehdipatnam Rythu Bazaar under budget, and charm a free *kosaru* of curry leaves. Reach Golconda by golden hour, after the domes of the Qutb Shahi tombs. Immu races up to Bala Hissar while you clap his rhythm under the gate dome.
- **Mechanic:** clap-rhythm minigame, timed climb, budget shopping.
- **Clue (Immu's reply):** "The tunnel starts where four towers keep time."
- **REC:** the echo. **Token:** a Golconda entry ticket.

> Guide: "Kehte hain, Charminar se yahan tak surang hai. Kehte hain."
> Immu: "On Chand Raat I go into the tunnel. A plane can't take a boy it can't find."
> Chinnu: "Pakka. I'll bring Osmania biscuits."

**8. `bonam_and_biryani`: "Drums for Amma"** · a July Sunday, Lashkar Bonalu · `flower_cart_2`, `ujjaini_mahankali_temple`, `paradise`
- **Do:** at dawn, fetch neem leaves and marigolds. Then clear a path for Amma as she carries her bonam pot through the crowd: keep step with the teenmaar drums, never run, and make way for the Pothuraju. Afterwards, rush the Paradise parcel home before it cools.
- **Mechanic:** rhythm walk, timed parcel ride.
- **Clue:** "After the drums, the city's most famous queue. Bring home a parcel that smells like Sunday."
- **REC:** the drums. **Token:** a neem leaf pressed in Immu's notebook.

> Flower aunty: "Haath se naap ke deti hoon, kam nahi."
> Amma: "Nemmadiga, Chinnu. Bonam ki thondara ledu."
> Immu: "Does America have Paradise?" Chinnu: "Then it's not paradise, na."

**9. `biggest_screen`: "Opening Day"** · Fri 25 Jul, Prasads opens · `cyber_towers`, `rythu_bazaar_erragadda`, `necklace_road`, `prasads_imax`, `ntr_gardens`
- **Do:** take Abba's forgotten tiffin by bus to Cyber Towers, and he hands over opening-day tickets. Race Bunty along Necklace Road, stopping at Erragadda for his mother's tomatoes (don't bruise them), and make the giant-screen documentary in 3D glasses. Afterwards, lunch in NTR Gardens' concrete tree and a ride on the toy train, where Abba talks.
- **Mechanic:** race with a cargo meter.
- **Clue:** "The new screen is so big it parks beside a lake. Be there before the lights go down."
- **REC:** the bass rumbling through the lobby wall. **Token:** the opening-day stub.

> Bunty: "Tension nakko. Tomatoes first, cinema later. My mother also has a chappal."
> Abba: "My father ground flour at a girni so I could study, beta. I'm going so Immu can choose anything. Even to come back."
> Immu: "It's bigger than every TV in our colony put together."

**10. `nimajjanam_night`: "Agle Baras Jaldi Aana"** · Sep, Ganesh immersion · `playground_1` pandal, `kachiguda_station`, `tank_bund_statues`, `hussain_sagar`, `lumbini_park`, `buddha_statue`, with `khairatabad_ganesh` on the skyline
- **Do:** guard the colony Ganesh from the rival colony's laddu raid, then join the lorry convoy forming by the Chappal Bazar pandal near Kachiguda station and walk with the drums to Tank Bund. Stuck in the all-night jam, follow the statues. At dawn, take the Lumbini boat to the Buddha for the hidden tape.
- **Mechanic:** night watch (stealth tag), procession, counting clue, boat ride.
- **Clue:** "Count the great ones on Tank Bund from the Lumbini end. At number seven, look down. Then ask the man in the lake."
- **REC:** the crowd's farewell to the lake. **Token:** a gulal packet.

> Boatman: "Buddha-ji ke paas? Hallu baitho. Unko koi jaldi nahi."
> Immu, to the lake: "Ganpati Bappa, agle baras jaldi aana!"
> Chinnu, quietly, to Immu: "You also."

**11. `last_bell`: "Last Bell"** · mid-Nov, Ramzan · `school_1` (Little Buds Convent High School, E.M.), `stationery_1` (Students' Corner), `photo_studio_1`, `birla_mandir`, `birla_planetarium`
- **Do:** it's Immu's last school day. Buy a slam book and brown cover paper, and get all of VI-B to sign before the last bell while PT sir patrols. Squeeze both boys into one passport photo. At sunset, take Ammamma up Naubat Pahad, leave your chappals at the gate, and look at every recorded place from the parapet: all eleven tokens light up on the map.
- **Mechanic:** timed signature hunt, photo-pose minigame, viewpoint reveal.
- **Clue (Immu's slam book):** "Fav place: where you can see everything we collected at once. Leave your chappals at the gate."
- **REC:** the peon's *tan-tan-tan*. **Token:** the passport photo. They laughed.

> Photo uncle: "Passport mein hasna nakko! ...Arre, dono has rahe. Phir se."
> Immu: "Planetarium uncle says New Jersey has the same stars. Ten and a half hours late."
> Ammamma: "Kite string, kanna. Pull too hard, it snaps. Let it go a little, it flies higher."

**12. `chand_raat`: "Chand Raat" (finale)** · Tue 25 Nov · `laad_bazaar`, `gulzar_houz`, `charminar`, `irani_cafe_1` (Café Noor-e-Iran), with `mecca_masjid` as respectful background only
- **Do:** see the climax below.
- **Mechanic:** a crowd search with *both* mothers at level 5, a permitted climb to Charminar's first gallery as a vantage point, then a clap call-and-answer.
- **Clue (tape 12):** "The tunnel starts where four towers keep time. Don't follow me. Okay, follow me."
- **REC:** bangles and the old city at night. **Token:** the tape itself. A "Recording Done Here" shop dubs a copy for the tin.

## Key scenes

**Opening (2026).** Rain on a HITEC City tower. From the 14th floor, Srikanth can see Cyber Towers. A courier arrives: a cassette marked SIDE A / SIDE B in an eleven-year-old's capitals, and a map with twelve circles. He drives to Amma's old colony, all apartments now, and finds the 2-in-1 in the loft. Amma, 61, passes it down, then reaches for her chappal by reflex when he coughs up dust. PLAY. "Bo kaata!" The VHS screen rewinds ◀◀ and the OSD reads ▶ PLAY TUE 14 JAN 2003 07:10. He is eleven, on a terrace, and the sky is full of kites.

**Midpoint (Golconda).** Three claps under the dome. A beat later, three claps come down from Bala Hissar, impossibly clear. Then Immu's breathless voice on the tape: the tunnel is real, and on Chand Raat he will hide in it. The hunt flips. The tin becomes a hideout kit, Chinnu becomes a co-conspirator, and the music turns sneaky. The player doesn't know it yet, but from here on they are collecting a goodbye: Abba on the toy train, and the boys shouting *agle baras jaldi aana* to the lake.

**Climax (Chand Raat, Charminar).** Charminar glows, floodlit from below. Crescent cut-outs, bulb strings, bangles stacked like fire, haleem bhattis. Immu slips into the Laad Bazaar crowd. Both mothers mobilise, and the meter shows two chappals of different sizes. Chinnu is the only one with Immu's clues. He begs the caretaker for "five minutes only" and climbs to the first gallery. From there he sees the four clocks, the crowd, and a yellow raincoat ducking into the lane behind Café Noor-e-Iran. Faramarz uncle, at the galla, nods at the cellar stair "that goes to Golconda". Down among the biscuit tins sits Immu, eating Osmania. Chinnu claps three times at the top of the stair, and three claps answer.

> "There's no tunnel, Immu." "I know." "But Golconda heard us. America will also hear."

They hand the tin across the galla. "Kitte din rakhun?" "Till we come back. Pakka." Mummy arrives with the chappal raised and hugs him without putting it down.

**Ending (2003 to 2026, at Charminar).** On Eid night, a blinking light climbs out of Begumpet over the four minarets. Side A clicks to its end, and Side B, recorded in 2026, begins: "Chinnu. I wore Side A thin in New Jersey. Abba wants to see Charminar once more. Same cafe, Saturday, four o'clock. Bring a clap."

You walk the 2026 Charminar plaza as a 34-year-old. Running empties your energy in four seconds: the knees. Faramarz uncle, 81, is still at the galla. He squints: "Tum dono late ho. Teis saal late." He takes the tin down from the shelf: chai steam, dust, the kite corner, girni token 47, the laughing passport photo.

A clap from the doorway. Chinnu claps back without turning round. Immu, now an "America uncle", holds out M&Ms. Abba orders for everyone: "Do chai, ek plate Osmania." Pigeons lift around the minarets. ■ STOP. Title card: NOSTALGIA. Then the OSD offers ◀◀ REWIND: free roam in 2003.

## Every must-have, used

- **Main missions:**
  - `koti_bus_stand`, `gokul_chat`, `imlibun_bus_station`: M5
  - `birla_mandir`: M11
  - `hussain_sagar` and `buddha_statue`: M10
  - `prasads_imax` (opens in-story) and `ntr_gardens`: M9
  - `public_gardens`, `lb_stadium`, `assembly`: M4
  - `rythu_bazaar_mehdipatnam`: M7; `rythu_bazaar_erragadda`: M9
  - `mozamjahi_market` and `nampally_station`: M2
  - `kachiguda_station`: M10
  - `dilsukhnagar_sai_temple`: M6
  - `rtc_x_roads` and its four cinemas: M3
- **Everyday places:**
  - `school_*`: M11
  - `kirana_*`: M1, plus khaata errands
  - `banana_cart_*`: M6
  - `flower_cart_*`: M6, M8 and meter cool-down
  - `stationery_*`: M11
  - `pindi_girni_*`: M6, plus a flour-carry side job
  - `playground_*`: M1, M10, plus gully cricket anywhere
  - `irani_cafe_*`: the HQ, M12 and the epilogue
- **Registry extras:**
  - Ending: `charminar`
  - Festivals: `bonalu` (M8), `ganesh_immersion` (M10)
  - Woven into missions: `nampally_exhibition`, `paradise`, `karachi_bakery`, `golconda_fort`, `cyber_towers`, `photo_studio_*`, `cassette_*`/`walkman`/`cassette_player`
  - Side activities: `internet_cafe_1` (Immu's first email ID, the sender address on the 2026 courier), `salar_jung_museum` (be there for the noon clock), `meat_shop_*` (Nanna's Sunday queue), `medical_shop_*` (Ammamma's BP strip)

## Glossary

- *Pakka*: sure, promise
- *baigan*: nonsense!
- *nakko*: no, don't
- *kanna*: dear child (Telugu)
- *Amma / Nanna*: Mom / Dad (Telugu)
- *Ammi / Abba*: Mom / Dad (Urdu)
- *Ammamma / Thatha*: grandma / grandpa
- *anna*: elder brother
- *khaata*: shop credit book
- *charkhi*: string spool
- *pech*: kite fight
- *lootna*: chase a cut kite
- *bo kaata*: "cut!"
- *phokat*: free
- *teekha / meetha*: spicy / sweet
- *ooru*: home village
- *repu*: tomorrow
- *padamudu ekkam cheppu*: say the 13-times table
- *intiki raa*: come home
- *utro*: get off
- *hallu*: slowly, softly
- *kosaru*: a vendor's free extra
- *bonam*: offering pot
- *Pothuraju*: Bonalu guardian dancer
- *teenmaar*: a drumbeat
- *nemmadiga*: slowly
- *thondara ledu*: no hurry
- *nimajjanam*: immersion
- *agle baras jaldi aana*: come back soon next year
- *surang*: tunnel
- *galla*: cash till
- *pauna*: a ¾ cup of Irani chai
- *Chand Raat*: Eid's eve
- *moora*: a cubit of jasmine
- *kitte din rakhun?*: how many days should I keep it?
- *teis saal*: twenty-three years
