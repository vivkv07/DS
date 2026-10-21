# NOSTALGIA: Story Bible (definitive)

*Gurthunda?* (Telugu: "Do you remember?")

This is the story contract. `src/story.js`, `src/npcs.js`, `src/collectibles.js`, `src/shops.js`,
`src/minigames.js` hooks, the HUD and the menus implement it literally. It is built on the winning
pitch A ("Side B"), with the judges' grafts from pitches B and C and every must-fix applied.

**How to read this file**
- `snake_case` in backticks is an id. Place ids are canonical (section 3). Speaker ids are in section 2.
- Dialogue is written `speaker_id: line`. Lines stay under ~120 characters. `*word*` marks slang that
  the dialogue box highlights; every such word is in the glossary (section 10).
- `{nick}` is the player's nickname (default **Chinnu**), `{full}` the formal name (default
  **Srikanth**), `{FULL}` the same in capitals (how Mummy shouts it). **Global rule:** wherever a
  line, tape, email or card below says *Chinnu* as the hero's name ("Agent Chinnu", "Chinnu baba",
  `chinnu_charminar`), the engine substitutes the nickname (lower-case in email ids), and
  *Srikanth* / *SRIKANTH* become `{full}` / `{FULL}`. Speaker ids `chinnu` / `srikanth` never change.
- HUD objective text is given in quotes after each numbered step: `"like this"`.
- Facts marked **[V]** come from the research files and may go on trivia cards. **(legend)** is
  always framed as "they say". Prices are memory ranges and never appear on trivia cards.
- Binding user rules honoured everywhere: **the game ends at Charminar** (final mission M12, the
  ending scene and the 2026 epilogue are all on the Charminar plaza); every must-have place is
  used (matrix in §3.3); Prasads IMAX and NTR Gardens are handled honestly for 2003; religious
  places are walk-only, respectful and never host chases or mischief.

---

## 1. Title card, logline, premise, setting, tone

### 1.1 Title card

```
            N O S T A L G I A
        a Hyderabad story on one cassette
   SIDE A: HYDERABAD 2003      SIDE B: 2026
               Gurthunda?
```
Title screen: VHS OSD `■ STOP  --:--`, a cassette J-card in eleven-year-old capitals, the tape
counter at `000`, Charminar at dusk behind it (the `title` spawn). Menu items are written on the
J-card like track names: `▶ PLAY` (new game), `▶▶ CONTINUE`, `SETTINGS`, `CREDITS`.

### 1.2 Logline

In 2026 a 34-year-old Hyderabad IT manager receives a cassette from New Jersey. Pressing PLAY
rewinds him to Sankranti 2003, when he was eleven and his best friend Immu had ten months left in
the city before his family flew to America after Eid. The two boys swore to record the whole
city's sound on one tape, keep a token from every place in one biscuit tin, and on Chand Raat
hide Immu in the legendary tunnel under Charminar, where no plane could find him.

### 1.3 Premise (what the player does)

You are **Chinnu** (K. Srikanth, 11), a colony kid from Lakshmi Nagar Colony, Himayatnagar.
Across one year of 2003 you run, cycle, ride autos, buses, a lorry and a boat across Hyderabad,
following **Immu's spy-tape clues** ("Agent Immu to Agent Chinnu, over") to famous places. Every
mission ends with **● REC**: one city sound goes onto Side A of the cassette, and one **token** goes
into the Karachi Bakery biscuit tin. The **tape counter (000 to 999)** is the story progress bar.
Between missions the city is open: hidden kites, marbles, cassettes, bus tickets and photo
riddles; odd jobs; Irani chai. Mummy's **Chappal Meter** is the wanted level.

The heart: Chinnu wants to stop the year. He learns to let it go a little, so it flies higher.
The game ends at Charminar on Chand Raat, and then again at Charminar in 2026, when Side B plays.

### 1.4 Setting and binding calendar

The playable story is **Tuesday 14 January to Thursday 27 November 2003** in Hyderabad and
Secunderabad, **Andhra Pradesh** (APSRTC buses, AP number plates, MCH). Chinnu was born on
5 Dec 1991, so he is 11 all through the story (class VI-B until April, VII-B from June) and 34 in
January 2026. The 2026 frame is a short prologue (cutscene cards) and a short playable epilogue.

`N.clock.baseDate` = Tue 14 Jan 2003. Each mission start fast-forwards the clock to its date
(VHS `▶▶` effect, 1.5 s) and sets the festival flags.

| Date (2003) | Day | Event in the story | Flags / world state | Status |
|---|---|---|---|---|
| 1 Jan to ~15 Feb | | Numaish at `nampally_exhibition` | `numaish` on | [V] |
| 13 Jan | Mon | Bhogi (bonfires at dawn, muggulu) | `sankranti` on 13 to 15 Jan | [V] |
| **14 Jan** | **Tue** | **Sankranti. M1.** HITEX opens today (radio mention only) | kites in every sky | [V] |
| 25 Jan | Sat | M2 at Numaish | | |
| 8 Feb | Sat | M3, second Saturday (no school); the Megastar's film releases | | |
| 9 Feb to 23 Mar | | Cricket World Cup in South Africa; shop-window TVs | | [V] |
| **23 Mar** | **Sun** | **World Cup final, starts 1:30 pm IST. India lose.** M4 | | [V] |
| 1 Apr | Tue | Ugadi eve shopping. M5 | | |
| 2 Apr | Wed | Ugadi (Telugu New Year) | | [V] |
| ~24 Apr to 11 Jun | | Summer holidays | `summer` | [~] |
| 15 May | Thu | M6, Ammamma's Thursday | | |
| 7 Jun | Sat | M7, Golconda (midpoint) | | |
| 12 Jun | Thu | Schools reopen (class VII) | | [~] |
| 20 Jul | Sun | Lashkar Bonalu at `ujjaini_mahankali_temple`. M8 | `bonalu` on | derived* |
| **25 Jul** | **Fri** | **Prasads IMAX opens** (India's third IMAX). M9 | `prasads_open` from 25 Jul | [V] |
| 31 Aug | Sun | Ganesh Chaturthi; pandals go up | `ganesh` 31 Aug to 9 Sep | [V] |
| **9 Sep** | **Tue** | **Ganesh immersion** at Tank Bund. M10 | `ganesh_immersion` on 9 Sep | derived* |
| 10 Sep | Wed | Boat to the Buddha (evening). M10 coda | | |
| 1 Nov | Sat | Interlude: tickets arrive ("Side A paused") | | |
| ~27 Oct to 25 Nov | | Ramzan (haleem bhattis, night bazaars) | `ramzan` on | [V] |
| 21 Nov | Fri | Immu's last school day. M11 | | |
| **25 Nov** | **Tue** | **Chand Raat. M12, the finale at Charminar** | `chand_raat` on | [V] |
| 26 Nov | Wed | Eid ul-Fitr (Eidi, sheer khurma) | | [V] |
| **27 Nov** | **Thu** | **Immu's night flight from Begumpet, 23:40. Ending at Charminar** | | |

\*Derived from the 2003 lunar calendar, not from a dated source: Ashada 2003 ran from about
30 Jun to 29 Jul, and Lashkar Bonalu falls on a mid-Ashada Sunday (we use the third, Sun 20 Jul);
Anant Chaturdashi (the immersion day) works out to Tue 9 Sep 2003. Both sit inside the windows the
judges approved (a July Sunday before 25 Jul; ~9 to 10 Sep). Confirm against a 2003 panchang if one
becomes available; if a date moves, move only that row.

2026 frame: prologue **Wed 14 Jan 2026** (Sankranti, 18:05); epilogue **Sat 17 Jan 2026, 16:00**.

### 1.5 Tone rules (binding)

1. **Warm, funny, specific.** Every scene needs one laugh and one true detail. The sadness is in
   what is not said ("You also.").
2. **Kid-safe.** No weapons, no gore, no killing. "Violence" is bumping, slipping and getting
   scolded. The homing chappal is dodged or lands as a soft bonk on the back: it never hits a face
   and never injures. No falls from height: rooftop routes are walled terraces and planked gaps
   with railings. Footboard riding and triple riding always end in a scolding, never as cool.
3. **Respect zones.** Temples, mosques, dargahs, churches, the gurudwara, the ashurkhana,
   processions and Charminar's top-floor mosque: walk only, footwear at the stand, Chappal Meter
   frozen, pursuers wait at the gate. No spying, stealth, chases, jokes at the faith, or bells at
   Birla Mandir (it has none [V]).
4. **Ganga-jamuni harmony.** A Telugu Hindu family and a Dakhni Muslim family share one year.
   Bonalu, the Sai Baba Thursday, Ganesh immersion, Ramzan and Chand Raat, a church at Christmas, a
   gurudwara langar: all shown with the same warmth.
5. **Real places, invented people.** No real private individuals; real shop owners are never
   named and never get story events (Faramarz uncle's café is invented and has its own id).
   Living celebrities appear only obliquely ("the Megastar"). Film titles are fictional
   (*Toofan Tammudu*, *Mass Maharaju*). No logos. No song lyrics (DJ chatter and dedications only).
6. **Legends are legends.** The Charminar–Golconda tunnel is always "they say". The finale pays
   it off honestly: there is no tunnel, and both boys knew.
7. **Honest era.** Nothing from after 2003 in the playable world (checklist in §11). The 2026
   prologue is text cards; the 2026 epilogue reuses the 2003 Charminar map with nothing modern
   visible.
8. **Gokul Chat is pure joy.** No hint of anything that happened later, anywhere.
9. **Language.** Clear English, sprinkled with Dakhni and Telugu; every non-English word is in the
   glossary. Telugu-first characters (Amma, Ammamma, Ramulu, Yadagiri) lean Telugu; Old City
   characters lean Dakhni; kids code-switch mid-sentence.

### 1.6 Story systems this bible relies on

**The tape (Side A).** The `walkman` item (given at game start) is Chinnu's cheap walkman-type
player-recorder with a built-in mic, worn on a shoelace. At the end of every mission the HUD
shows `● REC` and the player presses ACTION: `N.audio.rec(sfx)` plays the sound. The HUD's VHS
strip gains a **tape counter** (`SIDE A 000`) that only REC moves:

| After | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 | M12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Counter | 083 | 166 | 249 | 332 | 415 | 498 | 581 | 664 | 747 | 812 | 905 | 999 |

Between M10 and M11 the counter is greyed and shows `SIDE A ■ PAUSED` (the low point, §4).

**The tin.** A ½ kg Karachi Bakery fruit-biscuit tin (bought in M2). Each mission's token is
listed in the Journal's "Tin" page. In M12 Immu snaps a brass 4-digit number lock on it and
Faramarz uncle shelves it. The combination is **1-4-0-1** (14-01, Sankranti, the day the pact
began). The player earns each digit from a riddle (Journal page "The Lock"):

| Slot | Riddle (Immu's handwriting) | Answer | Where it is solved | Fact |
|---|---|---|---|---|
| 1 | "In the oldest garden a princess has slept two thousand years. How many princesses?" | **1** | M4, `state_museum` in `public_gardens` | The State Museum keeps one Egyptian mummy, over 2,000 years old [V] |
| 2 | "The tower that talks with half its faces: how many faces stay silent?" | **4** | M2, `mozamjahi_market` | Octagonal tower, clocks on alternate faces [V] |
| 3 | "On the drum hill a white temple stands. How many bells?" | **0** | M11, `birla_mandir` | Built with no bells, for quiet [V] |
| 4 | "The man in the lake: how many stones is he made of?" | **1** | M10, `buddha_statue` | Carved from a single block of white granite [V] |

The player dials it in the 2026 epilogue. A missed digit never blocks: Faramarz says
"*Gurthunda?*" and Immu finally says "Fourteen-one. Sankranti."

**MISSION PASSED card.** The banner reads `MISSION PASSED` and shows the **J-card line** (the
track title in Chinnu's capitals plus Immu's pencil scribble). The Journal's "Story so far" is
Chinnu's school diary *Mera Yaadgaar Saal* (My Memorable Year), set by class teacher Vimala Ma'am
in January and checked every Monday: each mission adds one tall-tale line and her red-ink
comment. Both texts are given at the end of each mission.

**Chappal Meter (wanted level, 5 slippers).**

| Level | Who comes | Lines (section 8.2) | How they move |
|---|---|---|---|
| 1 | **Chitti** the tattler (day) / a colony uncle on a cycle (outside the colony) | "*Mummy ki cheppesta!*" | walks, follows; a 50 p Mango Bite from any `kirana_*` buys her off (−1) |
| 2 | The **aunties' phone tree** (day) / **Bahadur the Gurkha's whistle** (night) | gate gossip | static spotters who raise the level if they see you |
| 3 | **Havaldar Pochaiah** on foot | "*Ruko!*" + whistle | runs (walk speed 70) |
| 4 | Pochaiah on his **Luna** | "Licence?" | Luna, 120 u/s |
| 5 | **MUMMY** (Yadagiri's auto by day; pillion on Nanna's Chetak by night, Nanna driving, mortified; on Chand Raat on foot with Immu's Ammi: two chappal icons of different sizes) | §8.2 | homing chappal every 6 s: dodge sideways; a hit is a soft bonk on the back = caught |

- **Caught: "PAKDA GAYA!"** Scolding line (§8.3), −₹2 pocket money, respawn at `home` gate (or the
  mission checkpoint). Never a mission fail unless the mission says so.
- **Exhausted: "THAK GAYA!"** At energy 0 Chinnu sits down panting; respawn at the nearest Irani
  café, −₹1 (a glucose drink from the counter).
- **Cool-downs:** break line of sight (level drops one step every 12 s unseen); sit in any
  `irani_cafe_*` family room for 10 s (−2); a `barber_*` haircut ₹10 (clears all); home before the
  street lights (clears levels 1 to 3); jasmine from any `flower_cart_*` ₹2 (−2, works on Mummy
  only); a `kotha_chappal` (new chappals for Mummy, ₹25 at `chappal_bazar`, one use, clears level 5).
- **Frozen** inside every respect zone and processions; pursuers stop at the gate and grumble.

**Hints (four tiers, cheapest last).** Each clue in §4 lists all four.
1. **Ammamma** (free, slow): talk to her at `home` (verandah swing), or call home from any `std_*`
   booth for ₹1. She gives a proverb, then a plain hint.
2. **Yadagiri-anna's auto** (₹5): hail his auto anywhere with HORN near a road; he drops you
   within ~150 u of the answer. "*Meter nakko*, for you *paanch*."
3. **Aunty Intelligence Network** (free, costs +1 Chappal Meter): ask any aunty at a colony gate;
   the answer is blipped on the map; Mummy hears within ten minutes.
4. **Ask the city** (Old City only, M12 and Old City clues): ask locals; the **third** one you ask
   always gives the answer (the first two deflect with a funny line).

**Mechanic kernels.** Missions are built from these reusable pieces (max two minigames per mission).

| Kernel | Id | Owner | Used in |
|---|---|---|---|
| Kite fight | `kite` (minigame) | minigames.js | M1; free kite flying from `home_terrace` while `sankranti` is on |
| Clap / rhythm (echo; drum-walk skin) | `clap` (minigame; `params.skin: 'golconda'\|'drums'\|'doorway'`) | minigames.js | M7, M8, M12 |
| Gully cricket batting | `cricket` (minigame) | minigames.js | M4, side games in any `playground_*` |
| Antenna tuning | `antenna` (minigame) | minigames.js | M4, SA2 |
| Pani-puri challenge | `panipuri` (minigame) | minigames.js | M5 |
| Bargain / budget | `bargain` (minigame; `who: 'kite'\|'farmer'\|'auto'\|'banana'\|'flower'`) | minigames.js | M1, M7, SA6 |
| Marbles, brick game | `marbles`, `brickgame` | minigames.js | side only |
| Chase / evade | W1 `chase` | wanted.js | M3, M7 (Pasha), M12 |
| Timed run, ride or delivery | W2 `timed` (`m.timer`) | missions.js | M1, M5, M8, M9, M12 |
| Cargo carry (damage meter 100 → fail below 40; −8 per bump/pothole, −15 per crash) | W3 `cargo` | missions.js | M6, M9 |
| Hot-cold search | W4 `beacon` (`N.audio.beacon`) | audio.js | M2, M5, collectibles |
| Queue cage (zig-zag barricade, line-cutters; ACTION "*Line mein!*" when one leans in; respect variant has no cutters and no timer) | W5 `queue` | missions.js | M3, M6, SA3 |
| Viewpoint reveal (reach a high point: nearby hidden things blip) | W6 `viewpoint` | collectibles.js | M2, M7, M9, M11, M12, collectibles |
| Boat | W7 `boat` (vehicle `boat`) | vehicles.js | M10 |
| Escort / walk-at-pace (no running; stay within 120 u) | W8 `escort` | missions.js | M6, M8, M10, M11, M12 |
| Tag (night watch) | W9 `tag` | missions.js | SA1 |

**Money and energy.** Money is in paise (HUD shows ₹). Start: ₹10. Typical 2003 kid prices [~]:
Irani chai ₹4; plate of Osmania biscuits ₹4; samosa ₹1; pani puri ₹5 a plate; dosa ₹6; tender
coconut ₹6; ice cream scoop ₹8; honey cake ₹4; kite ₹2 to ₹5; city bus ₹3; platform ticket ₹3;
cycle hire ₹3 an hour; floor ticket ₹10; internet café ₹20 an hour; photo print ₹2 a frame.
Energy refills: chai + Osmania +40; samosa/dosa/puff +15 to +25; coconut +20; ice cream +20;
langar at `gurudwara_gowliguda` +50 (free, walk-only, head covered).

**Saving.** Any `std_*` booth, the STD booth inside the base café `irani_cafe_7`, and every
MISSION PASSED.

---

## 2. Characters

**Sprite looks** use `N.people.draw` fields (`kind, skin, hair, shirt, pants, saree, border, blouse,
lungi, dupatta, girl, bag, tie, cap, capColor, stripes`). **Portrait looks** use the dialogue
painter fields (`hairStyle, moustache, beard, specs, cap, dupatta, burqa, bindi, earrings, flowers,
age, bg`). Skin tones are from the dialogue palette. A character marked *2026* has a second look
used when `N.flags.year === 2026`. Name-plate colours are for `N.dialogue.define`.

### 2.1 The player

**`chinnu` — Chinnu (K. Srikanth), 11 (2003) / `srikanth` — K. Srikanth, 34 (2026).** Plate `#f2c230`.
- **Role:** the player. Colony boy, class VI-B then VII-B at `school_1`; lives at `home`.
- **Sprite:** kid; skin `#b97a4f`; hair `#1a1412` spiky cowlick; faded blue cricket T-shirt
  `#3d6fb0` with white shoulder stripes; khaki half-pants `#8a7a55`; blue-and-white hawai
  chappals; scabbed knees; the yellow `walkman` `#f2c230` on a shoelace; from M1 Nanna's black
  camera on a strap. School days (M11): white shirt, navy shorts, striped tie, ID card on a ribbon.
- **Portrait:** `age:'kid', hairStyle:'spiky', shirt:'#3d6fb0', bg:'#2a2034'`; moods: grin,
  sulk (M10 interlude), shout ("BO KAATA!").
- **2026 sprite:** adult; same cowlick going thin; spectacles; checked shirt `#7a8fa8` untucked;
  grey trousers; slight belly. Running drains energy to zero in 4 s ("the knees").
- **Voice:** fast Telugu-Dakhni-English; *pakka* about everything; exaggerates (the diary).
- **Catchphrase:** "*Pakka!*" / "Copy, Agent Immu."
- **Want / arc:** wants to stop the year so Immu never leaves. After the immersion he stops
  recording and plans to help Immu hide (the low point). Ammamma's kite-string proverb turns him;
  at Charminar he chooses to clap Immu out and walk him back himself.
- **Renaming:** New Game shows a DOM card (no `prompt()`): "Your name in the colony" (nickname,
  default `Chinnu`, max 12 letters) and "Your name on the exam paper" (default `Srikanth`). The
  first fills `{nick}` and `N.player.name`; the second fills `{full}` and the adult's name.
  Initial "K." is fixed. The hero stays a boy.

### 2.2 Chinnu's family (home: `home`, Lakshmi Nivas)

**`amma` — Amma, "Mummy" (Padma), 38 / 61.** Plate `#d24d57`.
- **Role:** mother; Chappal Meter level 5; mission giver (M5, M7, M8).
- **Sprite:** aunty; skin `#a0683f`; green cotton saree `#3b7d4f` with maroon border `#7a1f2b`,
  blouse `#7a1f2b`; jasmine in her bun; a chappal in her right hand at level 5. At night (level 5):
  pale-blue floral nightie `#9fb7d8` with a cream dupatta `#e8e0d0` over the shoulders.
- **Portrait:** `kind:'aunty', bindi:'#c0202a', flowers:true, earrings:'#d4a640'`. 2026: grey
  streak at the temple, thin specs.
- **Voice:** Telugu-first; ends on your full name when it is serious: "*{FULL}!*"
- **Catchphrase:** "Home before the street lights!" / "*Intiki raa!*"
- **Arc:** wants Chinnu safe and home; on Chand Raat she raises the chappal, then hugs him without
  putting it down.

**`nanna` — Nanna (K. Sreenivas), 41 / 64.** Plate `#7aa6d8`.
- **Role:** assistant engineer at the colony's electricity sub-station ("the current office"),
  blamed for every power cut. Took every colony photo since 1983 and is in none of them.
- **Sprite:** man; skin `#9a6040`; oiled side parting; thick moustache; light-blue half-sleeve
  shirt `#a9c4e0` tucked into grey trousers `#5a5f66`; two pens in the pocket; black film camera.
  Rides a grey-blue Chetak. 2026: grey hair, specs, same camera.
- **Portrait:** `kind:'man', hairStyle:'oiled', moustache:'thick', shirt:'#a9c4e0'`.
- **Voice:** calm, few words, Telugu. "*Chuddam.*" (We'll see.)
- **Catchphrase:** "*Thoda left... smile please.*"
- **Arc:** steps back to check the focus every time; in M12 Chinnu drags him into the frame
  ("*Nanna, nuvvu kooda!*"). He does it again in 2026.

**`ammamma` — Ammamma (Kamala), 68 / 91 (off-screen in 2026).** Plate `#c9a227`.
- **Role:** maternal grandmother; hint tier 1; solves Immu's Golconda riddle (M6); the kite-string
  proverb (M11).
- **Sprite:** old woman; skin `#8d5a3b`; white bun; cream saree `#efe6d2` with mustard border
  `#c9a227`; round specs on a chain; cloth bag; walks at 30 u/s.
- **Portrait:** `kind:'saree', age:'old', specs:'round', bindi:true, hair:'#e8e4dc'`.
- **Voice:** slow, proverbs first, then the answer. Calls Chinnu "*kanna*".
- **Catchphrase:** "In a queue even God waits, *kanna*."
- **Arc:** wants her Thursday darshan and fine flour; hands Chinnu the way to let go.

**`chitti` — Chitti (K. Lalitha), 6.** Plate `#e88aa8`.
- **Role:** little sister; Chappal Meter level 1; the *doodh-bhaat* fielder whose one-tip
  one-hand catch wins M4.
- **Sprite:** small girl; skin `#b97a4f`; two high "antenna" ponytails with red rubber bands; pink
  frock `#e88aa8` with white dots; plastic clips; a Mango Bite wrapper in hand.
- **Portrait:** `age:'kid', hairStyle:'puff', shirt:'#e88aa8', earrings:'#d4a640'`.
- **Voice:** shrill Telugu-Dakhni. "*Mummy ki cheppesta!*" (I'm telling Mummy!)
- **Arc:** wants to stop being *doodh-bhaat*; after the catch, "She counts."

**`bunty` — Bunty-anna (B. Vamsi "Bunty"), 19.** Plate `#4a6fa5`.
- **Role:** cousin; B.Sc final year at an Osmania University college by day, a Java course in
  `ameerpet_coaching` by evening; gives races (SA6); drives the RX100.
- **Sprite:** teen; skin `#b97a4f`; big puffed hair; aviator sunglasses; denim jacket `#4a6fa5`
  over a white T-shirt (in May, too); jeans; black RX100.
- **Portrait:** `age:'teen', hairStyle:'puff', specs:'thick', shirt:'#4a6fa5'`.
- **Voice:** "Spoken English" confidence. "*Tension nakko*, I'm here."
- **Running gag:** **Word of the day: NOSTALGIA**, defined wrong every time (collected for the
  final card, §9.4).
- **Arc:** dreams of "onsite" in America; on the flight night he decides: "Maybe I'll stay.
  Paradise is here."

### 2.3 Immu's family (home: `friend_home`, across `playground_1`)

**`immu` — Immu (Mohammed Imran), 11 / `imran` — Imran, 34 (2026).** Plate `#2a8c82`.
- **Role:** best friend; leaves for New Jersey after Eid. Sends spy-tape clues; records Side A.
- **Sprite:** kid; skin `#c68b5e`; neat side parting; round specs taped at the bridge; green
  checked half-shirt `#2f8a5a` (stripes); navy shorts `#2c3550`; a "CID" notebook in the pocket;
  red Hero Ranger cycle. Chand Raat (M12): yellow raincoat `#f2c230` over a white kurta ("agents
  wear disguises").
- **Portrait:** `age:'kid', hairStyle:'side', specs:'round', shirt:'#2f8a5a', stripes:true`.
- **2026 sprite:** adult "America uncle": navy windcheater, grey cricket cap, specs, stubble; a
  packet of chocolate-coated sweets in hand (no brand shown).
- **Voice:** radio-spy formal. "Agent Immu to Agent Chinnu. Over."
- **Catchphrase:** "*Pakka.* Over and out."
- **Arc:** wants not to go; failing that, to take Hyderabad with him; plans to hide in "the
  tunnel"; walks out on his own when his friend claps.

**`abba` — Rasheed-saab (Abdul Rasheed), 40 / 63.** Plate `#3a7d6e`.
- **Role:** Immu's father; programmer at `cyber_towers`; got the H-1B (interview in Chennai in
  September; Hyderabad had no US consulate in 2003).
- **Sprite:** man; skin `#c68b5e`; short hair; trimmed beard; thin specs; pale-blue formal shirt
  `#dfe8f2`; dark-grey trousers; plain office ID on a lanyard (no logo). Chand Raat: white skull
  cap. 2026: grey beard.
- **Portrait:** `kind:'man', beard:'stubble', specs:true, shirt:'#dfe8f2'`.
- **Voice:** gentle, practising American words in the mirror: "Gas station. Not petrol bunk."
- **Arc:** wants Immu to have more choices than he had: "Even to come back."

**`ammi` — Immu's Ammi (Nusrat), 36.** Plate `#7a5aa8`.
- **Role:** Immu's mother; maths teacher at a girls' school; "CID-level" (Immu); second mother on
  Chand Raat.
- **Sprite:** woman; skin `#c68b5e`; lilac salwar kameez `#d8c3e8`; purple dupatta `#5a3e8a`
  draped over the head; small gold earrings.
- **Portrait:** `kind:'woman', dupatta:'#5a3e8a', earrings:'#d4a640'`.
- **Voice:** quick Dakhni, quicker eyes. "*Kya karre*, you two?"
- **Arc:** worried about the move; on Eid gives Chinnu *Eidi* and the last bowl of sheer khurma.

**`nani` — Immu's Nani (Zubeida), 70.** Plate `#a88a5a`.
- **Role:** grandmother visiting from Kurnool; leaves from `imlibun_bus_station` (M5).
- **Sprite:** old woman; black burqa with the face open; white dupatta; thick specs; tin trunk.
- **Portrait:** `kind:'burqa', age:'old', specs:'thick'`.
- **Voice:** Dakhni, blessings and orders. "*Hai Allah*, still hot!"

### 2.4 The friends and the rival

**`ayesha` — Ayesha "Bowling" Fatima, 11 / 34.** Plate `#d24d57`.
- **Role:** colony girl, same class; the colony XI's captain and fast bowler.
- **Sprite:** girl; skin `#a0683f`; two plaits with red ribbons; navy cricket cap `#1d4f91`; red
  kurta `#d24d57` with white salwar, white dupatta tied at the waist for bowling; tennis ball.
  2026: adult, dupatta, a coach's whistle.
- **Portrait:** `kind:'woman', age:'kid', hairStyle:'braid', cap:'cricket', capColor:'#1d4f91'`.
- **Voice:** Dakhni, deadpan. "*Hau, ho jaata.*"
- **Catchphrase:** "Girls' batch is badminton? Fine. I'll bowl with a racket."
- **Arc (her own):** wants to bowl in a real match; wins her way into the LB Stadium summer camp
  (SA4). Her family moves 8 km to Tolichowki in December ("It feels like America"), a comic mirror
  of Immu's move; she tells Chinnu the truth about distance in the interlude. 2026: she coaches a
  girls' team.

**`pasha` — Professor Pasha, ~45, and `babloo` — Babloo, 14.** Plates `#c9b27a` / `#d27a3a`.
- **Role:** comic rival. Self-certified "Treasure Scientist", host of *Khazana Hunt* on colony
  cable (ambient TV in shop windows). Hunts the "Qutb Shahi treasure" and the tunnel. Never
  digs, never touches a monument; caretakers shoo his crew. Nephew Babloo secretly helps the kids.
- **Pasha sprite:** man; skin `#b97a4f`; huge moustache; khaki safari suit `#c9b27a`; pith
  helmet `#e8dcc0`; a fishbone TV antenna on a stick as his "metal detector" (`detector` sfx);
  yellow Lambretta. **Babloo:** teen; curly hair; red T-shirt `#d24d57` with "CREW" hand-written;
  camcorder bag.
- **Voice:** Pasha booms in Dakhni at an invisible camera. Babloo mutters the truth.
- **Catchphrase:** "*Khazana Hunt*, every Sunday, Channel Seven, LIVE!"
- **Appears:** M2 (₹5 maps at Numaish), M7 (Golconda; you shake him off), M9 (Prasads lobby), M12
  (Charminar plaza, filming "Live from the tunnel"). He ends up airing "The Real Treasure is Haleem".

### 2.5 City and colony characters

| id | Name, age | Role | Sprite / portrait look | Voice and catchphrase |
|---|---|---|---|---|
| `faramarz` | Faramarz uncle, 58 / 81 | Owner of the invented **Café Noor-e-Iran** (`irani_cafe_19`) facing Charminar; Abba's family friend; keeper of the tin | old man; skin `#d29a6a`; white Irani cap; thick white moustache; round specs; maroon cardigan `#7a2f35` over a white shirt; at the *galla*. 2026: thinner, a walking stick | Dakhni with Persian sighs. "*Do chai, ek plate Osmania!*" / "Hyderabad has two truths: what is, and what they say." |
| `pochaiah` | Havaldar Pochaiah, 50 | RTC X Roads traffic head constable; Chappal Meter levels 3 to 4 | police; skin `#7a4a30`; thick moustache; white shirt, khaki trousers, police cap; whistle on a lanyard; red Luna. No weapon; only a whistle and a notebook | "*Ruko!* Three on one cycle? *Utro!*" Wants one quiet day |
| `yadagiri` | Yadagiri-anna, 45 | Auto driver; hint tier 2 (₹5) | man; skin `#7a4a30`; oiled hair; thin moustache; khaki shirt `#a08a5a`; red-check towel on the shoulder; yellow-black auto with YADAGIRI and "Horn OK Please" on the back | "*Meter nakko, das upar.*" Wants exact change |
| `ramulu` | Ramulu, 47 | Owner of `pindi_girni_1`; flour-white all year, turmeric-yellow as the colony's Pothuraju at Bonalu | uncle; vest and checked lungi; hair, brows and moustache flour-white `#efe9dc`. Bonalu: turmeric `#e8b828` body paint, red waist-cloth, neem at the waist, ankle bells | Telugu. "My hair isn't white, *beta*. It's *atta*." Feuding with Agarwal-ji for 20 years |
| `agarwal` | Agarwal-ji (Gopal), 48 | Owner of `kirana_1`, Sri Lakshmi Kirana; runs the unsigned free-buttermilk stall at Bonalu | uncle; bald; white Gandhi cap; cream kurta-pyjama; thick specs; transistor radio | Hindi-Telugu. "*Aaj nakad, kal udhaar.*" |
| `bahadur` | Bahadur, the Gurkha, 55 | Colony night watchman; level 2 at night | man; skin `#d29a6a`; black topi; khaki jacket; whistle; a bamboo stick he only taps on the road | "*Kaun hai?* ...Arre, Chinnu baba." |
| `kite_chacha` | Patang Chacha, 66 | Kite maker at `patang_bazaar`, Gulzar Houz; released 12 riddle kites; flies the kite train at the end | old man; skin `#a0683f`; long henna-orange beard `#c8642a`; white skull cap; white kurta; a charkhi | Dakhni. "*Saddi mazboot*. Won't snap in a *pech*." |
| `ticket_thatha` | Ticket Thatha (Venkat Rao), 66 | Retired city-bus conductor at `koti_bus_stand`; bus fast travel; hid 12 punched tickets | old man; skin `#8d5a3b`; cropped white hair; faded khaki safari shirt; leather conductor bag; ticket punch on a string | Telugu. Forgets what day it is, never a stop. "*Right, right!*" |
| `salim` | Salim-bhai, 30 | Waiter at the base café `irani_cafe_7` (Café Gulistan); runs its STD booth (save) | man; white skull cap; white shirt; teal apron `#2a8c82`; tray of chai glasses | "*Do pauna*, table *teen*!" |
| `vimala_maam` | Vimala Ma'am, 55 | Class teacher and Hindi teacher at `school_1`; marks the diary in red ink | woman; grey bun; specs; starched cotton saree `#d8c8a0` with blue border; red pen behind her ear | "*Bus udti nahi. Sach likho.*" (Buses don't fly. Write the truth.) |
| `cable_babji` | Cable Babji, 33 | Colony cable-*wala*; antenna and dish jobs (M4, SA2) | man; spiky hair; green shirt `#6b8f3a`; lungi folded up; coil of black cable | "*Thoda left... thoda right... AARA!*" |
| `photo_uncle` | Raj-uncle, 52 | Runs `photo_studio_1` (Raj Colour Lab & Studio, invented); develops Frames | man; side parting going grey; moustache; beige shirt; comb in the pocket | "Ready day after tomorrow." |
| `net_uncle` | Net-uncle, 40 | Runs `internet_cafe_1` (Cyber Zone Browsing Centre, invented) | man; specs; sleeveless sweater `#5a4a7a`; a kitchen timer | "Timer is on." |
| `flower_aunty` | Lakshmamma (*poolamma*), 50 | `flower_cart_1` and `flower_cart_2` in the colony | woman; skin `#8d5a3b`; orange saree `#e07a2e`; nose stud; jasmine in her hair; stringing jasmine | "One *moora*, measured on my own arm. Never short." |
| `tiger` | Tiger, 13 | Captain of the Ashok Nagar boys (`playground_14`); marbles rival | kid; skin `#7a4a30`; red cap backwards; big bat | "*Doodh-bhaat* doesn't count!" |
| `caretaker` | Charminar caretaker, 60 | Lets Chinnu up to the first gallery for five minutes (M12) | old man; khaki uniform; ring of keys | "First gallery only. Upstairs is for prayer." |

**Walk-on speaker ids** (generic looks from `N.people.randomLook`): `loudspeaker` (Numaish
announcer, no portrait), `bakery_man` (Karachi Bakery counter; never named), `gokul_man` (Gokul Chat
counter; never named), `paradise_man`, `bawarchi_man`, `conductor`, `sentry` (Assembly gate police,
whistle only), `mali` (gardener), `watchman`, `guide` (Golconda), `boatman` (Lumbini), `farmer`
(Rythu Bazaar), `chemist`, `painter` (cut-out painter "Bomma-uncle"), `ticket_man` (cinema counter),
`black_ticket` (Odeon tout), `narsimha` (lorry driver), `chappal_man`, `bangle_man`, `attar_man`,
`recording_man` (Raag Recording Centre), `coconut_man`, `dosa_man`, `aunty` (the network),
`stationery_man`, `kirana_kid`, `papad_man`, `bird_man` (Mahboob Chowk), `book_man`, `bakery_lady`
(Iyengar), `meat_man`, `uncle` (queue), `coach` (LB camp), `guard` (museum), `carol_aunty`,
`waiter`, `crowd`, `radio` (DJ voice, toast only), `narrator` (cutscene cards).

---

## 3. Place registry

Developers use exactly these ids. Every canonical id from `places_registry.md` is here, plus the
map ids the story needs and **four new ids** (marked NEW). Districts are `map_plan.md` district
ids. Positions come from `src/worlddata.js`; NEW ids give a suggested position.

**Use codes:** `M1`..`M12` story missions; `SA1`..`SA8` side activities (§7); `K1`..`K12` rooftop
kites, `G01`..`G30` golis, `C01`..`C16` cassettes, `T01`..`T12` bus tickets, `F01`..`F24` photo
frames (§6); `shop` (buy/refill), `save` (STD booth), `travel` (bus fast travel), `amb`
(ambience: sound, crowds, signboards), `view` (viewpoint), `gated` (closed in 2003: gate and
walls only), `respect` (walk-only zone, meter frozen), `off` (off-map exit, cutscene trip).

### 3.1 Id decisions (binding)

- **Home colony** (Lakshmi Nagar Colony, Himayatnagar) uses the map's ids: `home` (Lakshmi Nivas,
  spawn), `home_terrace`, `friend_home` (Immu's house), `playground_1` (canonical; the map alias
  `playground_home` points to the same spot), `kirana_1`, `pindi_girni_1`, `flower_cart_1`,
  `temple_1`, `std_1`, `medical_shop_8`, `school_1`, `stationery_1`, `internet_cafe_1`,
  `photo_studio_1`.
- **Base café** is `irani_cafe_7`. Its sign is renamed from the map's "Hotel Sarvar" to **"Café
  Gulistan"** (invented; avoids a near-collision with the real Sarvi). It has the STD booth.
- **Faramarz uncle's café** is NEW `irani_cafe_19`, **"Café Noor-e-Iran"** (invented). It is
  *not* `irani_cafe_1`, which the map aliases to the real Nimrah Café: no story event, owner or
  cellar is ever attached to `irani_cafe_1` / `nimrah_cafe` (they stay ambience: chai refill).
- `lumbini_jetty` is the boat landing inside `lumbini_park`.
- Real landmark cafés and restaurants (`garden_cafe`, `grand_hotel_abids`, `niloufer_cafe`,
  `cafe_bahar`, `alpha_hotel`, `blue_sea_cafe`, `sarvi`, `nimrah_cafe`, `hotel_madina`,
  `paradise`, `bawarchi`, `karachi_bakery`, `subhan_bakery`, `gokul_chat`, `famous_ice_cream`...)
  are shops and backdrops only; staff are generic walk-ons and owners are never named.
- Pending ids `jubilee_bus_station` and `bhramaramba_mallikarjuna_theatres` stay **out of the
  game** until verified (registry rule). `rythu_bazaar_falaknuma` is not used; the third Rythu
  Bazaar is the map's `rythu_bazaar_saroornagar` (Kothapet).

### 3.2 The registry

**Home colony, Himayatnagar, Narayanguda, Hyderguda, Basheerbagh east (`himayatnagar`, `rtc_x`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `home` | Lakshmi Nivas (home) | himayatnagar | Two-storey colony house, grill gate, Ammamma's verandah swing; spawn | all; hint tier 1; save at night |
| `home_terrace` | Home terrace | himayatnagar | Flat roof: water tank, clothesline, TV antenna, kites | M1, SA2, C13 |
| `friend_home` | Immu's house | rtc_x | Across the colony ground; green gate, jasmine creeper | M9, M10, ending |
| `playground_1` (= `playground_home`) | Lakshmi Nagar colony ground | himayatnagar | Dusty pitch, swings, slide, Ganesh pandal in Sept | M1, M10, SA1, G01, C16 |
| `playground_14` | Ashok Nagar ground | himayatnagar | Rival gang's ground (Tiger) | marbles vs Tiger, G03 |
| `kirana_1` | Sri Lakshmi Kirana & General Stores | himayatnagar | Agarwal-ji's jars, khaata, radio | M1, M6, M8, M11, shop |
| `pindi_girni_1` | Hanuman Pindi Girni | rtc_x | Ramulu's flour mill; thump-thump | M6, M8, shop |
| `flower_cart_1`, `flower_cart_2` | Lakshmamma's flower carts | himayatnagar | Jasmine, marigold, neem bundles | M8, cool-down |
| `temple_1` | Sri Venkateswara Temple | himayatnagar | Colony temple | respect, amb |
| `temple_2` | Hanuman Temple | himayatnagar | Neighbourhood temple | respect, amb |
| `std_1`, `std_2`, `std_7` | STD/ISD/PCO booths | himayatnagar | Yellow glass cabins | save, hint (₹1 call) |
| `school_1` | Saraswati Vidya Mandir High School (E.M.) | himayatnagar | Chinnu, Immu and Ayesha's school; bell, gate vendors | M11, C15 |
| `stationery_1` | Vidya Stationery & Book Depot | himayatnagar | Opposite the school | M11, shop |
| `internet_cafe_1` | Cyber Zone Browsing Centre | himayatnagar | Plywood cubicles, beige CRTs, timer | M11, SA8, shop |
| `photo_studio_1` | Raj Colour Lab & Studio | himayatnagar | Backdrops, darkroom red bulb; develops Frames | M11, M12, Frames |
| `irani_cafe_7` | Café Gulistan (renamed sign) | himayatnagar | Base café: Salim-bhai, family room, STD booth | save, shop, cool-down, C14 |
| `medical_shop_1` | Life Line Medicals | himayatnagar | Green cross, Hajmola jar | M6, shop |
| `medical_shop_8` | Sai Medical & General Stores | rtc_x | Colony chemist | SA3, shop |
| `barber_1`, `barber_7` | Lucky Hair Cutting Saloon; New Style Hair Dressers | himayatnagar, rtc_x | Barber chairs | cool-down |
| `cycle_rent_1`, `cycle_rent_5` | Lakshmi Cycle Stores; Chinna Cycle Taxi | himayatnagar | Cycles on hire, ₹3 an hour | shop |
| `chai_bandi_1` | Raju's chai bandi | himayatnagar | Colony chai cart | shop |
| `dosa_bandi_1` | Dosa bandi | himayatnagar | Morning idli-dosa cart | M8, SA3, shop |
| `kirana_2`, `kirana_3` | Balaji General Stores; Ganesh Provisions | himayatnagar | Kiranas | shop |
| `cafe_bahar` (= `irani_cafe_3`) | Café Bahar | himayatnagar | Real landmark café | shop, amb |
| `liberty_theatre` | Liberty Theatre | himayatnagar | Single screen, fictional hoardings | amb |
| `nizam_college` | Nizam College | himayatnagar | Nizam-era college, Basheerbagh | amb |
| `ramakrishna_math` | Ramakrishna Math, Domalguda | himayatnagar | Calm green campus | amb (quiet zone) |
| `narayanguda_ymca` | Narayanguda YMCA (Sadar) | himayatnagar | Junction; Sadar buffalo carnival after Diwali | amb (Nov radio mention) |
| `city_central_library` | City Central Library, Chikkadpally | himayatnagar | Reading halls | amb |
| `church_2` | CSI Church, Chikkadpally | himayatnagar | Colony church | respect, amb, SA8 |

**RTC X Roads and Chikkadpally (`rtc_x`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `rtc_x_roads` | RTC X Roads ("Charminar Chowrasta") | rtc_x | Cinema crossroads, giant hand-painted cut-outs | M3, T08 |
| `sandhya_theatre` | Sandhya 70mm & 35mm | rtc_x | *Toofan Tammudu* cut-out with 31 garlands; queue cage | M3 |
| `sudarshan_theatre` | Sudarshan 35mm | rtc_x | Cut-out painter's scaffolding | M3 |
| `odeon_theatre` | Odeon (three cinemas) | rtc_x | The "black ticket" tout | M3 |
| `devi_theatre` | Devi 70mm | rtc_x | *Mass Maharaju* 100-days banner | M3 |
| `bawarchi` | Bawarchi | rtc_x | Biryani parcel counter | M3, shop |
| `cycle_rent_3` | Raju Cycle Taxi | musheerabad | Cycle hired for the M3 escape | M3 |
| `irani_cafe_8` | Café Shalimar | rtc_x | Irani café | shop |
| `meat_shop_1` | Fresh Chicken & Mutton | rtc_x | Shopfront, cages, Sunday queue (no gore) | SA3 |
| `school_2`, `stationery_2`, `kirana_4`, `pindi_girni_2` | Vivekananda High School; Navyuga Stationers; Durga Kirana; Lakshmi Flour Mill | rtc_x | Everyday shops | amb, shop |
| `playground_2` | Vidyanagar colony ground | rtc_x | Gully cricket | G04, side cricket |

**Koti, Sultan Bazaar, Abids, Nampally, Mozamjahi (`koti`, `abids`, `nampally`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `koti_bus_stand` | Koti Bus Stand | koti | City bus terminus by the Residency wall; Ticket Thatha's bench | M5, travel, T01 |
| `gokul_chat` | Gokul Chat | koti | Chaat house: pani puri, samosa-ragda, kulfi (joyful only) | M5, shop |
| `sultan_bazaar` | Sultan Bazaar | koti | Clothes, bangles, Ugadi shopping | M5 |
| `koti_womens_college` | Koti Women's College (British Residency) | koti | Palladian mansion, columns | amb, T01 trivia |
| `koti_book_bazaar` | Koti pavement book bazaar | abids | Textbooks on the footpath | SA7 |
| `stationery_4` | Koti textbook stall | abids | Brown cover paper rolls | SA7 |
| `shanti_theatre` | Shanti Theatre | koti | Single screen | amb |
| `king_kothi` | King Kothi Palace | abids | Walled; treasure (legend) | gated, Pasha TV gag |
| `abids` | Abids Circle, GPO | abids | Commercial heart; Sunday book market | T02, amb |
| `abids_book_market` | Abids Sunday book market | abids | Tinkle and Chandamama on the pavement | C10 (Sundays), amb |
| `grand_hotel_abids` (= `irani_cafe_2`) | Grand Hotel | abids | Oldest surviving Irani café (1935) | shop, amb |
| `taj_mahal_hotel_abids` | Taj Mahal Hotel | abids | Veg tiffin, coffee | shop |
| `chermas_abids` | Cherma's | abids | Festival clothes | amb |
| `ramakrishna_theatre` | Ramakrishna 70mm | abids | Single screen | amb |
| `st_georges_church_abids` | St. George's Church | abids | Neo-Gothic, shady compound | respect, amb |
| `st_josephs_cathedral` (= `church_st_josephs`) | St. Joseph's Cathedral, Gunfoundry | abids | Twin towers, clock | F23, SA8, respect |
| `gurudwara_gowliguda` | Central Gurudwara Sahib, Gowliguda | abids | Langar hall, Nishan Sahib | free langar refill, respect |
| `gowliguda_hangar` (= `cbs_hangar`) | Gowliguda "Mississippi" hangar | koti | Curved steel hangar full of city buses | K2, travel, amb |
| `mozamjahi_market` | Mozamjahi Market | nampally | Granite arcades, octagonal clock tower | M2 (lock digit 2), F01 |
| `karachi_bakery` | Karachi Bakery | nampally | Fruit-biscuit tins | M2 (the tin), shop |
| `famous_ice_cream` | Famous Ice Cream | nampally | Under the market arches | M2, shop, cool-down (−1) |
| `nampally_station` | Nampally (Hyderabad Deccan) Station | nampally | Domed Nizam-era terminus | M2, F03 |
| `nampally_exhibition` (= `exhibition_grounds`) | Numaish (Exhibition Grounds) | nampally | Giant wheel, maut ka kuan, Delhi papad | M2, K3, C11, view |
| `subhan_bakery` (= `bakery_1`) | Subhan Bakery | nampally | Osmania biscuits by the tin | shop |
| `iskcon_abids` (= `temple_7`) | ISKCON Temple, Abids | nampally | White temple, sweet shop opposite | respect, amb |
| `dargah_yousufain` | Dargah Yousufain | nampally | Sufi shrine, qawwali Thursdays | respect, amb |
| `mosque_1` | Mallepally Masjid | nampally | Neighbourhood mosque | respect, amb (azaan) |
| `photo_studio_2`, `photo_studio_3`, `internet_cafe_2`, `medical_shop_2`, `medical_shop_3`, `video_parlour_2`, `cycle_rent_2` | everyday shops | abids, koti | Map names | shop |

**Public Gardens, Assembly, LB Stadium, Naubat Pahad, Lakdikapul (`basheerbagh`, `masab_tank`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `public_gardens` | Public Gardens (Bagh-e-Aam) | basheerbagh | Oldest park; back-lawn cricket; the mali | M4, SA4, G06 |
| `state_museum` | State Archaeology Museum | basheerbagh | The Egyptian mummy | M4 (lock digit 1) |
| `jawahar_bal_bhavan` | Jawahar Bal Bhavan & Health Museum | basheerbagh | Summer classes | SA4, amb |
| `assembly` | Legislative Assembly (old Town Hall) | basheerbagh | White domed building; gate and sentry | M4, F20 |
| `gandhi_statue_assembly` | Seated Gandhi statue (1998) | basheerbagh | On the Assembly lawn | M4 |
| `gun_park` | Gun Park | basheerbagh | Memorial pillar | amb |
| `lb_stadium` | Lal Bahadur Stadium | basheerbagh | Four lattice floodlight towers | M4 (clue), SA4, K4, F19 |
| `fateh_maidan` | Fateh Maidan (LB Stadium field) | basheerbagh | The oval; summer camp at dawn | SA4 |
| `electronics_shop_1` | Vijaya TV & Radio (NEW, invented) | basheerbagh | TV in the window, crowd on the footpath; suggested (3960, 2705) on the stadium's south outer road | M4 |
| `birla_mandir` | Birla Mandir | basheerbagh | White marble temple on Naubat Pahad; no bells | M11 (lock digit 3), K5 (stair foot, outside the gate), F04, respect, view |
| `birla_planetarium` | Birla Planetarium & Science Museum | basheerbagh | White dome | M11, F05 |
| `hill_fort_palace` | Hill Fort Palace (locked) | basheerbagh | Castle on the hill; "haunted" is kid fiction | gated, amb |
| `ravindra_bharathi` | Ravindra Bharathi | basheerbagh | Auditorium (school annual days) | amb |
| `all_india_radio` | All India Radio, Saifabad | basheerbagh | Mast | amb, radio bulletins |
| `secretariat` | Secretariat (exterior) | basheerbagh | Where the Khairatabad giant is met | M10 |
| `niloufer_cafe` (= `irani_cafe_4`) | Café Niloufer | basheerbagh | One small café then | shop |
| `flower_cart_11` | Flower cart (Birla Mandir steps) | basheerbagh | Footwear stand nearby | M11 |
| `sarojini_devi_eye_hospital` | Sarojini Devi Eye Hospital | masab_tank | Bus-stop name | amb |
| `school_4`, `stationery_5`, `kirana_7`, `pindi_girni_3`, `barber_3`, `playground_12`, `temple_6`, `flower_cart_9` | everyday places | masab_tank | Map names | shop, amb |

**Hussain Sagar, Necklace Road, Tank Bund, Khairatabad (`hussain_sagar`, `khairatabad`, `musheerabad`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `hussain_sagar` | Hussain Sagar | hussain_sagar | The lake | M9, M10, T10 |
| `buddha_statue` | Buddha statue | hussain_sagar | 18 m granite Buddha on Gibraltar Rock | M10 (lock digit 4), F07 |
| `lumbini_park` | Lumbini Park | hussain_sagar | Lawns, musical fountain | M10, G13 |
| `lumbini_jetty` | Lumbini boat jetty (in `lumbini_park`) | hussain_sagar | Boats to the Buddha | M10 |
| `ntr_gardens` | NTR Gardens | hussain_sagar | Concrete Machan tree, mini train (open since 2001) | M9, K7, F08 |
| `prasads_imax` | Prasads IMAX | hussain_sagar | Tin fence "COMING SOON" until 24 Jul; opens Fri 25 Jul | M9, K6, F09, view |
| `necklace_road` | Necklace Road | hussain_sagar | Lakeside road, coconut palms, railway alongside | M9, SA6 |
| `coconut_cart_1` | Tender coconut cart | hussain_sagar | "Where the palms meet the railway" | M9, shop |
| `coconut_cart_2`..`coconut_cart_7` | Tender coconut carts | various | Refills | shop |
| `tank_bund` | Tank Bund | hussain_sagar | Bund road with lamps and Kakatiya arches | M10, K8, SA6 |
| `tank_bund_statues` | Tank Bund statues | hussain_sagar | 12 bronze Telugu greats on plinths (counted from the Lumbini end) | M10, F21 |
| `ganesh_immersion_point` (= `ganesh_immersion`) | Tank Bund immersion cranes | hussain_sagar | Cranes, water stall | M10 |
| `sanjeevaiah_park` | Sanjeevaiah Park | hussain_sagar | Plain municipal park in 2003 | G15 |
| `katta_maisamma_temple` | Katta Maisamma Temple | hussain_sagar | Roadside temple, Bonalu | respect, amb |
| `chai_bandi_6`, `chai_bandi_8`, `dosa_bandi_5` | Bhutta & chai carts | hussain_sagar | Evening refills | shop |
| `khairatabad_ganesh` | Khairatabad Ganesh | khairatabad | Pandal; the giant idol in season | M10 |
| `khairatabad_mosque` (= `mosque_9`) | Khairatabad Mosque (1626) | khairatabad | Named after a princess | T12, respect |
| `raj_bhavan` | Raj Bhavan (exterior) | khairatabad | Walls and lawns | amb |
| `nims_hospital` | NIMS | khairatabad | Bus-stop landmark | amb |
| `indira_park` | Indira Park | musheerabad | Rock garden | G14 |
| `lower_tank_bund` | Lower Tank Bund | musheerabad | Road below the bund | amb |
| `playground_4`, `school_7`, `mosque_3`, `pindi_girni_5`, `samosa_bandi_3`, `meat_shop_7`, `kirana_12`, `irani_cafe_12`, `barber_4` | everyday places | musheerabad | Map names | shop, amb |

**Secunderabad, Begumpet, Marredpally (`secunderabad`, `begumpet`, `marredpally`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `paradise` | Paradise | secunderabad | Biryani parcel queue; the junction's name | M8, T06 |
| `ujjaini_mahankali_temple` (= `bonalu`) | Ujjaini Mahankali Temple | secunderabad | Lashkar Bonalu | M8, respect |
| `flower_cart_4` | Flower cart (Mahankali) | secunderabad | Neem and marigold | M8 |
| `general_bazaar` | General Bazaar | secunderabad | Busy market around the temple | M8 |
| `secunderabad_clock_tower` | Secunderabad Clock Tower | secunderabad | 1896 stone tower in a park | F15, G16 |
| `secunderabad_station` | Secunderabad Station | secunderabad | Long Deccan-style façade | T07 |
| `rathifile_bus_station` | Rathifile City Bus Station | secunderabad | North bus hub | travel |
| `garden_cafe` (= `irani_cafe_5`) | Garden Café | secunderabad | Opposite the Clock Tower | shop |
| `alpha_hotel` (= `irani_cafe_6`) | Alpha Hotel | secunderabad | Opposite the station | shop |
| `blue_sea_cafe` (= `irani_cafe_17`) | Blue Sea Tea & Snacks | secunderabad | Station chai stop | shop, C08 |
| `secunderabad_ganesh_temple` | Sri Ganesh Temple (station) | secunderabad | Coconut before a journey | respect, amb |
| `church_st_marys` | St. Mary's Church | secunderabad | Christmas star | SA8, respect |
| `church_wesley` | Wesley Church | secunderabad | Christmas carols | SA8, respect |
| `st_johns_church_secunderabad` (= `church_st_johns`) | St. John's Church (1813) | marredpally | Oldest church in the area | SA8, respect |
| `holy_trinity_church_bolarum` (= `church_holy_trinity`) | Holy Trinity Church, Bolarum | secunderabad | "Queen Victoria paid for it" | amb |
| `church_1` | Methodist Church, Marredpally | secunderabad | Colony church | amb, respect |
| `moula_ali_dargah` | Moula Ali Dargah | marredpally | Hilltop shrine up a long stair | respect, amb (no collectible on the hill) |
| `monda_market` | Monda Market | secunderabad | Old covered halls | amb |
| `parade_grounds` | Parade Grounds | secunderabad | Vast flat ground | G17 |
| `gymkhana_ground_secunderabad` | Gymkhana Ground | secunderabad | Ranji ground | side cricket, C12 |
| `secunderabad_club` | Secunderabad Club | secunderabad | Members only | gated |
| `rashtrapati_nilayam` | Rashtrapati Nilayam | secunderabad | President's retreat | gated |
| `chenoy_trade_centre` | Chenoy Trade Centre | secunderabad | PC parts bazaar | C06, amb |
| `sangeet_theatre`, `anand_theatre` | Sangeet 70mm; Anand Theatre | secunderabad | Single screens | amb |
| `iyengar_bakery_2` | Sri Iyengar Bakery | secunderabad | Plum cakes in December | SA8, shop |
| `begumpet_airport` | Begumpet Airport | begumpet | The city's working airport | ending (the flight), G18 |
| `spanish_mosque` | Spanish Mosque | begumpet | Moorish spires | F22, respect |
| `shoppers_stop_begumpet` | Trendz Department Store (invented name) | begumpet | First escalator | amb |
| `hyderabad_public_school` | The Hyderabad Public School | begumpet | Huge campus | amb |
| `balkampet_yellamma_temple` | Balkampet Yellamma Temple | ameerpet | Bonalu crowds | respect, amb |
| `sarathi_studios` | Sarathi Studios | ameerpet | "Shooting going on" | amb |
| `ameerpet_coaching` | Ameerpet computer-coaching lane | ameerpet | "C C++ JAVA ORACLE" banners; Bunty's class | M7, M9, SA6, C05 |
| `iyengar_bakery_4`, `bakery_2`, `irani_cafe_11`, `internet_cafe_3`, `photo_studio_4`, `video_parlour_4`, `school_6`, `stationery_6`, `kirana_9`, `kirana_11`, `samosa_bandi_7`, `banana_cart_5`, `playground_9` | everyday places | ameerpet | Map names | shop, amb |
| `kirana_13`, `kirana_14`, `school_8`, `school_9`, `playground_5`, `playground_6`, `internet_cafe_4`, `medical_shop_4`, `samosa_bandi_4`, `cycle_rent_4`, `iyengar_bakery_2` | everyday places | marredpally, secunderabad | Railway colony life | shop, amb |
| `banana_cart_7`, `banana_cart_10`, `dosa_bandi_6`, `std_10` | carts, booth | secunderabad | | shop, save |

**North-west: HITEC City, Erragadda, Jubilee and Banjara Hills (`hitec`, `erragadda`, `jubilee`, `banjara`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `cyber_towers` | Cyber Towers | hitec | Curved ringed glass (1998); Abba's office | M9, K9, F06 |
| `hitec_city` | HITEC City | hitec | New glass offices, cranes, boulders, empty roads | M9, SA6 |
| `hitex` | HITEX Exhibition Centre | hitec | Opened 14 Jan 2003 (radio mention in M1) | amb |
| `shilparamam` | Shilparamam | hitec | Crafts village | G21 |
| `durgam_cheruvu` | Durgam Cheruvu ("secret lake") | hitec | Hidden among rocks | K10 |
| `kphb_colony` | KPHB Colony | hitec | Housing-board colony | amb |
| `peddamma_temple` | Peddamma Temple | hitec | Jubilee Hills temple | respect, amb |
| `chai_bandi_7`, `std_15`, `std_16` | Construction-site chai; booths | hitec | | shop, save |
| `rythu_bazaar_erragadda` | Rythu Bazaar, Erragadda | erragadda | Big farmers' market | M9 |
| `jntu_kukatpally` | JNTU, Kukatpally | erragadda | EAMCET dreams | amb |
| `kirana_10`, `meat_shop_3`, `pindi_girni_4`, `banana_cart_6`, `chai_bandi_2`, `temple_4` | everyday places | erragadda | | shop, amb |
| `jubilee_hills_check_post` (= `jubilee_hills`) | Jubilee Hills Check Post | jubilee | Boulder junction | amb |
| `film_nagar` | Film Nagar | jubilee | Studio lanes | amb |
| `ramanaidu_studios`, `annapurna_studios` | Film studios | jubilee, banjara | "Shooting in progress" boards | amb |
| `apollo_hospital_jubilee_hills` | Apollo Hospital | jubilee | Landmark | amb |
| `gachibowli_stadium` | Gachibowli Stadium (2002) | jubilee | New stadium | G22 |
| `university_of_hyderabad` | University of Hyderabad (gate) | jubilee | Rocky campus | amb |
| `kbr_park` | KBR Park | banjara | Trails | G20 |
| `errum_manzil` | Errum Manzil (gate) | banjara | Palace on a low hill | gated |
| `sarvi` (= `irani_cafe_18`) | Sarvi | banjara | Irani restaurant and bakery | shop |
| `coconut_cart_5`, `medical_shop_7` | | banjara | | shop |

**West: Mehdipatnam, Tolichowki, Golconda (`tolichowki`, `golconda`, `rajendranagar`, `langar_houz`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `rythu_bazaar_mehdipatnam` | Rythu Bazaar, Mehdipatnam | tolichowki | Sheds of vegetable heaps; kosaru | M7, T05 |
| `mehdipatnam_bus_terminus` | Mehdipatnam Bus Depot | tolichowki | West bus hub | M7, travel |
| `hussain_shah_wali_dargah` | Hussain Shah Wali Dargah & Shaikpet Sarai | tolichowki | Saint who oversaw Hussain Sagar | respect, amb |
| `irani_cafe_10`, `irani_cafe_16` | Hotel Sohail; Café Sohrab | tolichowki | Irani cafés | shop |
| `kirana_8`, `meat_shop_2`, `samosa_bandi_2`, `banana_cart_4`, `school_5`, `mosque_2`, `playground_10`, `std_8` | everyday places | tolichowki | Ayesha's new neighbourhood | shop, amb |
| `golconda_fort` | Golconda Fort | golconda | Walls, bastions, steps | M7, K11 |
| `golconda_fateh_darwaza` | Fateh Darwaza (clap gate) | golconda | The clap minigame | M7, F10 |
| `golconda_bala_hissar` | Bala Hissar | golconda | Summit pavilion | M7, view |
| `golconda_jagadamba_temple` | Jagadamba Temple (on the climb) | rajendranagar | Bonalu begins here | respect |
| `golconda_sound_light` | Sound & light show seats | golconda | Evening show | M7, amb |
| `qutb_shahi_tombs` | Qutb Shahi Tombs | golconda | Domed tombs on terraces | M7 (seen), F11, respect |
| `taramati_baradari` | Taramati Baradari | rajendranagar | Pavilion (legend of the dancer) | G24 |
| `bapu_ghat` | Bapu Ghat | langar_houz | A peaceful memorial | amb |
| `gandipet`, `himayat_sagar`, `chilkur_balaji`, `mrugavani_park` | Off-map west | rajendranagar | Picnic lakes, "Visa Balaji", deer park | off (radio/ambient mentions; Abba's colleague's visa joke) |

**The Musi, Afzalgunj, Chaderghat, Imlibun (`afzalgunj`, `chaderghat`, `puranapul`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `imlibun_bus_station` | Imlibun Bus Station (MGBS) | chaderghat | Long-distance bus station, built 1994 | M5, travel |
| `osmania_hospital` | Osmania General Hospital | afzalgunj | Indo-Saracenic block | amb |
| `state_central_library` | State Central Library | afzalgunj | Arched Nizam-era library | amb |
| `high_court` | High Court | charminar | Striped stone, domes | T11 |
| `city_college` | Government City College | bahadurpura | Arched granite "palace" | amb |
| `musi_riverbed` | Musi riverbed & dhobi ghats | afzalgunj | Sand, washing lines | amb, riverbed cricket |
| `purana_pul` | Purana Pul (1578) & Jumerat Bazaar | puranapul | Oldest bridge | F18 |
| `naya_pul` | Naya Pul | afzalgunj | Bridge to the Old City | M12 route |
| `afzalgunj_bridge`, `chaderghat_bridge` | Musi bridges | afzalgunj, chaderghat | | amb |
| `begum_bazaar` | Begum Bazaar | afzalgunj | Wholesale; night kites | amb |
| `dhoolpet` | Dhoolpet | puranapul | Idol lanes; manja makers | C04, amb |
| `hotel_niagara` | Hotel Niagara | chaderghat | Restaurant | shop |
| `victory_playground` | Victory Playground | kachiguda | Summer sports camps | amb |
| `banana_cart_2`, `mosque_8` | | chaderghat, afzalgunj | | shop, amb |

**Kachiguda, Amberpet, OU (`kachiguda`, `amberpet`, `osmania`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `kachiguda_station` | Kachiguda Station (1916) | kachiguda | Gothic "palace" station, towers; no overhead wires | M10, F02 |
| `chappal_bazar` | Chappal Bazar | kachiguda | Big Ganesh pandal; chappal shops | M10, `kotha_chappal` shop |
| `banana_cart_1` | Banana cart | kachiguda | Puja bananas | M10 |
| `iyengar_bakery_1` | Sri Krishna Iyengar Bakery | kachiguda | Honey cake, puffs | SA3, shop |
| `video_parlour_1` | Super Video Games | kachiguda | Brick game, arcade | brickgame side |
| `irani_cafe_9`, `school_3`, `stationery_3`, `kirana_5`, `barber_2` | everyday places | kachiguda | | shop, amb |
| `osmania_university` | Osmania University Arts College | osmania | Monumental granite front, green rocky campus | SA6 (race start), F14, G27 |
| `chai_bandi_3` | OU canteen chai | osmania | Bunty's canteen | SA6, shop |
| `doordarshan_kendra` | Doordarshan Kendra, Ramanthapur | amberpet | TV tower the antennas point at | SA2 |
| `shankar_mutt_nallakunta` (= `temple_3`) | Sringeri Shankar Mutt | amberpet | Bus-stop name | respect, amb |
| `playground_3`, `playground_11`, `kirana_6`, `samosa_bandi_1`, `dosa_bandi_7`, `flower_cart_3`, `internet_cafe_5`, `photo_studio_5`, `temple_5` | everyday places | amberpet, osmania | | shop, amb |

**Malakpet, Dilsukhnagar, Kothapet, LB Nagar, Saroornagar (`malakpet`, `dilsukhnagar`, `lb_nagar`, `saroornagar`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `dilsukhnagar_sai_temple` | Sai Baba Temple, Dilsukhnagar | dilsukhnagar | Thursday crowds, queue barricades | M6, respect |
| `flower_cart_5`..`flower_cart_8` | Flower carts (Sai Baba temple lane) | dilsukhnagar | Rose garlands | M6 (`flower_cart_5`) |
| `banana_cart_8` | Banana cart | dilsukhnagar | Outside the temple lane | M6 |
| `rythu_bazaar_saroornagar` | Rythu Bazaar, Kothapet | dilsukhnagar | Third Rythu Bazaar | shop (vegetables), amb |
| `ashtalakshmi_temple` (= `temple_8`) | Ashtalakshmi Temple | dilsukhnagar | Navaratri crowds | respect, amb |
| `gaddiannaram_fruit_market` | Gaddiannaram fruit market | saroornagar | Mango lorries | amb |
| `karmanghat_hanuman_temple` | Karmanghat Hanuman Temple | saroornagar | Tuesday queues | respect, amb |
| `saroornagar_lake` | Saroornagar Lake | saroornagar | Neglected lake, work starting | G30 |
| `harina_vanasthali` | Mahavir Harina Vanasthali | lb_nagar | Blackbuck | amb |
| `malakpet_race_course` | Malakpet Race Course | malakpet | Horses (never betting) | G29 |
| `ramoji_film_city` | Ramoji Film City (exit) | lb_nagar | Bus-trip mention | off |
| `irani_cafe_13`, `irani_cafe_14`, `iyengar_bakery_3`, `internet_cafe_6`, `photo_studio_6`, `medical_shop_5`, `medical_shop_6`, `meat_shop_4`, `meat_shop_5`, `samosa_bandi_5`, `dosa_bandi_2`..`dosa_bandi_4`, `school_10`, `school_11`, `stationery_7`, `stationery_8`, `kirana_15`, `kirana_16`, `kirana_20`, `pindi_girni_7`, `playground_7`, `video_parlour_3`, `mosque_4`, `barber_5`, `coconut_cart_6` | everyday places | malakpet, dilsukhnagar | Map names | shop, amb |

**Old City: Charminar, Laad Bazaar, Falaknuma, the Zoo (`charminar`, `dabeerpura`, `bahadurpura`, `falaknuma`, `chandrayangutta`, `zoo`)**

| id | Display name | District | Description | Use |
|---|---|---|---|---|
| `charminar` | Charminar | charminar | Four arches, four minarets, four clocks; floodlit | M1 (seen), **M12, ending, epilogue**, T09, F24 |
| `charminar_plaza` | Charminar plaza | charminar | Open paved square (finale) | M12, ending, epilogue |
| `charminar_gallery` | Charminar first gallery (NEW, virtual viewpoint) | charminar | Camera-only viewpoint inside `charminar` (no walkable floor); first gallery only | M12 view |
| `irani_cafe_19` (alias `cafe_noor_e_iran`) | Café Noor-e-Iran (NEW, invented) | charminar | Faramarz uncle's café: teal, bentwood chairs, a biscuit storeroom one step down. Suggested (3860, 4205), west side of the Charminar–Gulzar Houz road, facing east to the monument, not next to `nimrah_cafe`'s door | M1, M12, epilogue, shop |
| `recording_centre_1` | Raag Recording Centre (NEW, invented) | charminar | "Recording Done Here" cassette shop at the Laad Bazaar mouth; suggested (3790, 4352) | M12, C07 |
| `gulzar_houz` | Gulzar Houz and Char Kaman | charminar | Fountain square under four arches | M1, M12, K1, ending |
| `patang_bazaar` | Patang Bazaar (kite stalls) | charminar | Sankranti kite market | M1, ending |
| `kite_stall_1`..`kite_stall_3` | Kite stalls | charminar | Patang Chacha is at `kite_stall_1` | M1, shop |
| `laad_bazaar` | Laad Bazaar | charminar | Bangles and bulbs | M12 |
| `pathergatti` (= `hotel_madina`) | Pathergatti & Madina Building | charminar | Stone arcades; Hotel Madina's haleem | M12 (route), C09, shop |
| `mecca_masjid` | Mecca Masjid | charminar | Granite prayer hall and courtyard (walk-up only, a watchman at the gate during the M12 chase) | respect, background |
| `jama_masjid_charminar` (= `mosque_10`) | Jama Masjid (Charminar) | charminar | Small old mosque in a lane | respect, amb |
| `nimrah_cafe` (= `irani_cafe_1`) | Nimrah Café | charminar | Real café facing Charminar | shop, amb only |
| `irani_cafe_15` | Café Gulzar | charminar | Irani café | shop |
| `mahboob_chowk_clock_tower` | Mahboob Chowk & Murgi Chowk | charminar | Clock tower; pet birds (no slaughter) | M12 (Ask the city), amb |
| `badshahi_ashurkhana` | Badshahi Ashurkhana | charminar | Seven-colour tile wall | respect, amb |
| `chowmahalla_palace` | Chowmahalla Palace (gate) | charminar | Closed until 2005 | gated, F17, G12 |
| `salar_jung_museum` | Salar Jung Museum | charminar | Musical clock (gong on the hour) | SA5, F12 |
| `lal_darwaza_temple` | Lal Darwaza Mahankali Temple | charminar | Old City Bonalu | respect, amb |
| `akkanna_madanna_temple` | Akkanna Madanna Mahankali Temple | charminar | Bonalu elephant procession | respect, amb |
| `hotel_nayaab`, `shadab_hotel` | Hotel Nayaab; Hotel Shadab | charminar | Old City restaurants | shop |
| `samosa_bandi_6`, `chai_bandi_4`, `kirana_18`, `meat_shop_6`, `banana_cart_9`, `flower_cart_10`, `barber_6`, `std_12`, `mosque_6`, `playground_13` | everyday places | charminar | | shop, amb |
| `pindi_girni_6` | Noor Pindi Girni | charminar | Where Abba's father ground flour (M9 line); passed in M12 | M9 (mention), M12 |
| `nizams_museum` | Nizam's Museum, Purani Haveli (opened 2000) | dabeerpura | Long U-shaped palace | amb |
| `nehru_zoo` | Nehru Zoological Park | bahadurpura | Lion safari, toy train | F13, G25 |
| `mir_alam_tank` | Mir Alam Tank | zoo | 21-arch dam | G26 |
| `falaknuma_palace` | Falaknuma Palace (gate) | falaknuma | Scorpion-plan palace on its hill, closed | gated, view, K12, F16 |
| `shah_ghouse`, `pista_house` | Shah Ghouse; Pista House | falaknuma | Haleem in Ramzan | shop |
| `school_13`, `mosque_7` | | falaknuma | | amb |
| `paigah_tombs` | Paigah Tombs | chandrayangutta | Marble lace screens | respect, amb |
| `barkas` | Barkas | chandrayangutta | Marfa drum bands (radio mention) | amb |
| `kirana_17`, `kirana_19`, `school_12`, `playground_8`, `mosque_5` | | chandrayangutta | | amb |

**Map utility ids (from `map_plan.md`, used by the story)**

| ids | What | Use |
|---|---|---|
| `bus_stop_1`..`bus_stop_22` | Roadside bus shelters with painted stop names | T01 to T12 hide behind their boards; bus fast-travel stops once unlocked |
| `std_1`..`std_16` | STD/ISD/PCO booths | save; ₹1 call home for Ammamma's hint |
| `hide_*` (41) | Hidden spots in parks, riverbed, rocks, gardens | golis and kites (§6) |
| `giver_*` (36) | Footpath anchors for mission givers | where M-giver NPCs stand (§4 lists the giver per mission) |
| `cycle_rent_1`..`cycle_rent_5`, `barber_1`..`barber_7`, `video_parlour_1`..`video_parlour_4`, `chai_bandi_1`..`chai_bandi_8`, `bakery_1`..`bakery_4` | Everyday shops | hire, cool-down, side games, refills |
| `kaman_machli`, `kaman_charminar`, `kaman_kali`, `kaman_sher_e_batil` (landmarks) | The Char Kaman arches | M12 route, ending framing |
| `birla_mandir_steps` (path) | The stair up Naubat Pahad | M11 escort (walk only) |

**Items and non-place ids (registry rounds 2 and 4)**

| id | What | Use |
|---|---|---|
| `walkman` | Chinnu's walkman-type player-recorder | given at game start; plays found cassettes on foot; ● REC |
| `cassette_player` | The family 2-in-1 at `home` (Philips-style, no brand shown) | prologue (2026 loft), M1 morning radio, M10 interlude (■ STOP), plays all cassettes at home |
| `cassette_1`..`cassette_16` | Dedication and agent tapes | §6.3 |
| `coconut` (tree kind) | Coconut palms on Necklace Road, colony compounds | M9 "where the palms meet the railway" |
| cricket | Gully cricket, LB Stadium, shop-window TV | M4, SA4, side games |
| `bonalu` (flag) | Lashkar Bonalu, Sun 20 Jul | M8 |
| `ganesh_immersion` (flag) | Immersion, Tue 9 Sep | M10 |
| `kotha_chappal` | New chappals for Mummy (₹25, `chappal_bazar`) | cool-down item |
| `camera` | Nanna's film camera, roll of 24 | Frames |
| `tin` | Karachi Bakery fruit-biscuit tin + brass number lock | the story's tokens |

### 3.3 Must-have usage matrix (user's list)

| Must-have | Id(s) | Story | Side / shop | Collectibles |
|---|---|---|---|---|
| Koti bus stand | `koti_bus_stand` | M5: Ticket Thatha, catch the bus | bus fast-travel hub | T01 |
| Gokul Chat | `gokul_chat` | M5: pani-puri challenge, Nani's parcel | refill shop | — |
| Birla temple | `birla_mandir` | M11: sunset with Ammamma, viewpoint, lock digit 3 | respect zone | K5 (stairs foot), F04 |
| Hussain Sagar | `hussain_sagar`, `buddha_statue`, `tank_bund`, `lumbini_park` | M9 lakeside race; M10 immersion and boat (lock digit 4) | SA6 races | T10, F07, K7, K8, G13 |
| Prasads IMAX | `prasads_imax` | Fence Jan–Jul; M9 opening day (Fri 25 Jul) | — | K6, F09 |
| NTR Gardens | `ntr_gardens` | M9: mini train, Abba's talk | — | K7, F08 |
| Public Gardens | `public_gardens`, `state_museum` | M4: back-lawn match, mummy (lock digit 1) | SA4 dawn nets | G06 |
| LB Stadium | `lb_stadium`, `fateh_maidan`, `electronics_shop_1` | M4: four-towers clue, the final on the shop TV | SA4 summer camp | K4, F19 |
| Rythu Bazaars | `rythu_bazaar_mehdipatnam`, `rythu_bazaar_erragadda`, `rythu_bazaar_saroornagar` | M7 budget shopping; M9 tomato race | vegetables shop | T05 |
| Mozamjahi Market | `mozamjahi_market`, `karachi_bakery`, `famous_ice_cream` | M2: clock-tower riddle (lock digit 2), the tin | ice-cream cool-down | F01 |
| Nampally station | `nampally_station` | M2: ₹3 platform-ticket cut-through | — | F03, T03 |
| Kachiguda station | `kachiguda_station`, `chappal_bazar` | M10: "station dressed as a palace" clue; the lorry; lost chappal | `kotha_chappal` shop | F02 |
| Imlibun bus stand | `imlibun_bus_station` | M5: Nani's express to Kurnool | bus fast travel | — |
| Assembly | `assembly`, `gandhi_statue_assembly` | M4: the six on the lawn, the polite sentry | — | F20 |
| Dilsukhnagar Sai Baba temple | `dilsukhnagar_sai_temple` | M6: Thursday darshan, riddle solved in the queue | respect zone | — |
| RTC X Roads and cinemas | `rtc_x_roads`, `sandhya_theatre`, `sudarshan_theatre`, `odeon_theatre`, `devi_theatre`, `bawarchi` | M3: four forecourts, queue cage, first show, Bawarchi parcel | Bawarchi refill | T08 |
| Schools | `school_1`..`school_13` | M11: last day, the diary | gate vendors refill | C15 |
| Kirana stores | `kirana_1`..`kirana_20` | M1 kites on khaata; M6/M8 Agarwal-ji; M11 torch | toffees, cricket balls, Mango Bite bribe | — |
| Banana and flower vendors | `banana_cart_*`, `flower_cart_*` | M6 bananas and garland; M8 neem and marigold; M10 puja bananas | jasmine cool-down | — |
| Stationery shops | `stationery_*` | M11 slam book | SA7 brown cover paper | — |
| Flour mills | `pindi_girni_*` | M6 girni and flour run; M8 Ramulu the Pothuraju; M9 Abba's line | — | — |
| Colony playgrounds | `playground_*` | M1 lootna; M10 pandal | SA1, marbles, gully cricket | G01, G03, G04 |
| Irani cafés | `irani_cafe_*` | M1, M12, epilogue (Café Noor-e-Iran); base café | refills, family-room cool-down, save | C14 |
| **Charminar** | `charminar`, `charminar_plaza` | **M12 finale, the ending, the 2026 epilogue** | — | T09, F24 |

---

## 4. Main story

### 4.0 Structure

| Chapter | Card (Telugu / Dakhni + English) | Dates | Missions |
|---|---|---|---|
| Prologue | *Side B, 2026* | Wed 14 Jan 2026 | cutscene cards |
| 1 | *Patang* (Kites) | Jan to Feb 2003 | M1 `bo_kaata`, M2 `lost_and_found`, M3 `first_day_first_show` |
| 2 | *Garmi* (Summer) | Mar to Jun 2003 | M4 `last_man_batting`, M5 `right_right`, M6 `ammammas_thursday`, M7 `the_clap` (midpoint) |
| 3 | *Pandaga* (Festivals) | Jul to Sep 2003 | M8 `drums_for_amma`, M9 `opening_day`, M10 `agle_baras` |
| Interlude | *Side A ■ Paused* | Sat 1 Nov 2003 | cutscene + choice |
| 4 | *Chand Raat* (Night of the moon) | Nov 2003 | M11 `last_bell`, M12 `chand_raat` (finale at Charminar) |
| Ending | *Side A ends* | Thu 27 Nov 2003, Charminar | §9 |
| Epilogue | *Side B* | Sat 17 Jan 2026, Charminar | §9 |

Missions unlock in order (`requires` = the previous mission). Each mission's giver is a pulsing
marker; free roam continues on the current date between missions. Chapter cards are VHS title
cards with the word in Telugu script or Urdu-style lettering plus English.

### 4.1 Prologue: "Side B, 2026" (cutscene, ~60 s)

Plays on New Game after the name card. `N.flags.year = 2026`. Text cards over a dim VHS image
(no modern city art: only a desk lamp, a window of dusk light, a parcel, a loft, a 2-in-1).

```
[card]  ▶ PLAY  WED 14 JAN 2026  18:05
[text]  Hyderabad, 2026. Makar Sankranti. Somewhere outside, a last kite.
[text]  K. {full}, 34. Fourteenth floor, Madhapur. A curved glass building in the window,
        the one he watched being new.
amma:      {full}! A courier came. From America.
srikanth:  Amma, I'm in a meeting.
amma:      Your name is written in pencil. Like a schoolboy wrote it. "Lakshmi Nivas" with two exclamation marks.
srikanth:  ...Immu.
[text]  A cassette. The label in eleven-year-old capitals: SIDE A — HYDERABAD 2003.
        SIDE B — in new ink: 2026. A sketch-pen map with twelve circles. A note:
[text]  "Chinnu. Play Side A first. Then Side B. Gurthunda? — I."
[text]  Amma's house. The loft. The old 2-in-1 under a bedsheet.
amma:      Arre! Not the dust! (her hand goes to her chappal, by reflex, twenty-three years later)
srikanth:  Amma. I'm thirty-four.
amma:      The chappal doesn't know that.
[prompt] ▶ PLAY   (player presses ACTION)
[sound]  tape hiss → far away, a child's voice: "Bo kaata!"
[vhs]    ◀◀ REWIND. The OSD year spins 2026 → 2003.
[card]  ▶ PLAY  TUE 14 JAN 2003  07:10
```
Then `N.flags.year = 2003`; the game starts on `home_terrace` under a sky full of kites.

---

### M1 `bo_kaata` — Bo Kaata!

- **Chapter 1** · **Tue 14 Jan 2003 (Sankranti), 07:10 → 18:20** · **Giver:** auto-start after the
  prologue at `home_terrace` · **Requires:** prologue · **Music:** `kites`, then `oldcity`
- **Places:** `home_terrace`, `home`, `playground_1`, `irani_cafe_7`, `gulzar_houz`,
  `patang_bazaar`, `kite_stall_1`, `irani_cafe_19`, `charminar` (seen)
- **Mechanics:** `kite` minigame; W2 lootna run over walled terraces; ride as passenger in
  Yadagiri's auto; `bargain` minigame (`who:'kite'`); save and refill tutorial.

**Script**

1. `"Fly your kite. Win a pech!"` — On the terrace: Nanna with his camera, Chitti, Immu on his own
   terrace across the ground.
   ```
   nanna:  Sankranti morning, {nick}. Sun behind you, wind from the lake. Perfect.
   nanna:  Thoda left... arre, don't look at the camera. Look at the kite!
   chitti: Nanna, take MY photo! Annayya looks ugly with his mouth open.
   chinnu: Chitti, go down. This is a men's terrace.
   chitti: *Mummy ki cheppesta!*
   amma:   (from below) {FULL}! *Pesarattu* is getting cold!
   immu:   (across the ground) Agent Chinnu! Red kite, two o'clock! Ashok Nagar boys. Over!
   chinnu: Copy, Agent Immu. *Saddi* ready. *Dheel*... *dheel*... *khench!*
   ```
   Minigame `kite` (`target: 1`, `difficulty: 0.25`, intro "Cotton saddi only. Cut one kite.").
   On win the whole colony yells; then scripted: a stray green kite slices Chinnu's string.
   ```
   chinnu: *BO KAATA!*
   immu:   Arre! YOUR kite! It's going down toward the ground! *Lootna!*
   ```
2. `"Lootna! Chase your kite across the terraces."` — W2: a marked route over 6 walled terraces
   joined by planks with handrails (no edges, no falls), 25 s. Failing the time is not a fail:
   either way the kite lands in `playground_1`. On time: +₹2 "Lootna bonus".
3. `"Get to the colony ground."` — Ayesha has the kite.
   ```
   ayesha: Lootna rules, {nick}. Who catches, keeps.
   chinnu: It's MY kite. Look, my name is on the tail.
   ayesha: Your name is spelt wrong. *Hau*, okay, take it. But I bowl first at cricket today.
   immu:   (arrives panting, glasses taped) Agent Chinnu. Need to talk. Private. Over.
   ayesha: Private? Ooh. I'm going. But you owe me one over.
   immu:   Abba's visa came. Yesterday. After Eid, we fly. New Jersey.
   chinnu: *Baigan.* America is for uncles. You're eleven.
   immu:   Abba says eleven is the best age to go. You still learn the accent.
   chinnu: When is Eid?
   immu:   End of November. Ammi checked the calendar three times.
   chinnu: That's... ten months. That's nearly forever.
   immu:   Ten months and eleven days. I counted.
   chinnu: ...So what do we do?
   immu:   We take the city with us. One tape. One tin.
   immu:   Every place we go, *● REC*, one sound. And one thing in the tin. By Chand Raat the city is in my pocket.
   chinnu: And the tin?
   immu:   The tin stays here. With you. Till we come back.
   chinnu: *Pakka?*
   immu:   *Pakka.* Agent rules: I give clues, you find. Over and out.
   ```
4. `"Meet Bunty-anna at Café Gulistan."` — `irani_cafe_7`. Teaches: refill, family room, STD save.
   ```
   salim:  *Do pauna*, one plate Osmania, table *teen*! For Bunty-anna's gang, biscuits hot.
   bunty:  Kids. Word of the day from my Ameerpet sir: NOSTALGIA. Means "very old style". Like my RX100.
   immu:   Your RX100 is a 1990 model, anna.
   bunty:  Exactly. Nostalgia. Now: kites. Colony is sold out. Gulzar Houz, Patang Bazaar.
   salim:  Phone is there, bhai. STD booth. Call home before Mummy calls the police.
   ```
   Tutorial toast: "Save at any STD booth. Chai + Osmania = energy."
5. `"Ride to Gulzar Houz."` — Bunty refuses triple riding and hails Yadagiri (ride as passenger).
   ```
   bunty:    Three on my RX100? Pochaiah will eat me raw. Auto!
   yadagiri: Gulzar Houz? On Sankranti? *Meter nakko, das upar.* The roads are all kites.
   bunty:    Anna, students. Student rate.
   yadagiri: Students eat the most. *Das upar.*
   yadagiri: (to Chinnu) Any day you are lost, find my auto. YADAGIRI on the back. Five rupees, I drop you near.
   radio:    (in the auto) Deccan Vani news: the new HITEX exhibition centre opens today in Madhapur.
   ```
   Arrive under the Char Kaman arches. Charminar fills the screen (district banner "Charminar").
6. `"Buy five kites and a charkhi of saddi (₹20)."` — `kite_stall_1`, minigame `bargain`
   (`who:'kite'`, `start: 30`, `target: 20`).
   ```
   kite_chacha: *Aao, mian.* Paper kites, bamboo spine, and *saddi mazboot.* Won't snap in a *pech.*
   chinnu:      Chacha, five kites and one charkhi. Twenty rupees.
   kite_chacha: Twenty? Today is Sankranti, *beta*. Today even the wind charges extra.
   (bargain)
   kite_chacha: *Theek hai.* Twenty. And no glass manja, *haan*? Glass cuts fingers and birds. Cotton only.
   kite_chacha: Listen. This morning I flew twelve riddle kites from my roof. Each tail has a clue to the next.
   kite_chacha: Find all twelve before Chand Raat, bring them to me. I'll make a train of kites taller than Charminar.
   ```
   Unlocks **Rooftop Kites** (§6.1). Kite K1 is on the fountain railing right here: picking it
   up teaches collectibles ("1/12. Read the tag in the Journal.").
7. `"Have chai at Café Noor-e-Iran."` — `irani_cafe_19`. Plants the finale.
   ```
   faramarz: Arre, Rasheed's boy! Imran! Last time you were this high, you ate my sugar bowl.
   faramarz: *Do chai, ek plate Osmania!* For Rasheed's boy, the Osmania is *phokat.*
   immu:     Uncle, Abba says you know everything about Charminar.
   faramarz: Everything? *Hau.* Four clocks, four arches, four minars. The pigeons' names. And my cellar stair.
   chinnu:   What stair?
   faramarz: (leans in) That stair goes down to Golconda. They say. Only I know the way, and I'm not telling.
   immu:     Is it true? The tunnel?
   faramarz: Hyderabad has two kinds of truth, *beta*: what is, and what they say. Both come free with chai.
   bunty:    Uncle, word of the day: nostalgia.
   faramarz: Nostalgia? Chai gone cold because you were talking. Drink.
   ```
8. `"Home before the street lights."` — Yadagiri drives everyone home (passenger, skip allowed).
   At dusk on `home_terrace`: evening kites, the colony shouting.
   ```
   nanna:  Here. My camera. One roll, twenty-four photos. Think before you click, *ra.*
   nanna:  When the roll is full, Raj-uncle will develop it.
   chinnu: Nanna, why are you never in your photos?
   nanna:  Someone has to hold the camera.
   chitti: Nanna IS the camera.
   immu:   (across the ground, walkman held up) Agent Chinnu. First sound. Over.
   ```
   `● REC` → `N.audio.rec('bo_kaata')`. Counter 000 → 083. Token: **the kite corner** (the torn corner
   of the tail, with his name spelt wrong in sketch pen), kept for the tin. Immu's chit lands on the terrace (next clue).

**Clue for M2 (Immu's chit):** "Every capsule needs a box. Find the clock tower that talks with
half its faces; buy a tin that smells of fruit. Saturday, 4 pm. Over."
- Ammamma: "A tower that talks? Clocks talk, *kanna*. Your Thatha bought my first mangoes under one. Mozamjahi."
- Yadagiri (₹5): drops you at the `mozamjahi_market` junction.
- Aunty network: blips `mozamjahi_market`; +1 meter.

**Fail / checkpoints:** the kite minigame offers retry; nothing else can fail. Checkpoints:
`terrace`, `cafe`, `gulzar_houz`.
**Reward:** ₹10 (+₹2 lootna bonus); `camera` (Frames unlocked); Rooftop Kites; Yadagiri hints;
Café Gulistan save point.
**J-card:** `TRACK 01 · BO KAATA! · TERRACE, SANKRANTI` — Immu's scribble: "your name is spelt wrong. —I"
**Diary:** "Today I cut 100 kites and one cut me back. I flew after it over forty roofs."
Red ink: "*Forty roofs? Sach likho.*"
**Cutscene (end):** "Dusk. A thousand kites come down like tired birds. On the next terrace, Immu
holds up the walkman and gives a thumbs-up. Chitti is still telling Mummy."

---

### M2 `lost_and_found` — Lost and Found

- **Chapter 1** · **Sat 25 Jan 2003, 16:00 → 20:00** · **Giver:** Immu's chit (starts when the
  player reaches `mozamjahi_market` after 16:00) · **Requires:** M1 · **Music:** `day`, `numaish`
- **Places:** `mozamjahi_market`, `karachi_bakery`, `famous_ice_cream`, `nampally_station`,
  `nampally_exhibition`
- **Mechanics:** riddle count (lock digit 2); shop; W4 hot-cold search (loudspeaker); W6
  viewpoint (giant wheel).

**Script**

1. `"Find the clock tower that talks with half its faces."` — at the octagonal tower:
   ```
   chinnu: Clocks on this face... none on this one... clock... none. Half of them are silent.
   ```
   Choice (Journal "The Lock", slot 2): `"How many faces have no clock?"` [2, **4**, 6, 8]. Wrong
   answers: "Count again, walk round it." The lock slot fills: `_ 4 _ _`.
2. `"Buy a tin that smells of fruit (₹40)."` — `karachi_bakery`.
   ```
   bakery_man: Fruit biscuits? Half-kilo tin, forty rupees. For which relative?
   chinnu:     Not for relatives, uncle. For history.
   bakery_man: History also likes fruit biscuits. Take.
   ```
   `"Empty the tin."` (eat: energy +30). Toast: "For the capsule. A sacrifice." Optional:
   `famous_ice_cream` sitaphal scoop ₹8 (energy +20).
3. `"Cut through Nampally station to Numaish (₹3 platform ticket)."` — the platform where trains
   stop for good (the buffer stops are drawn). Porters: "*Coolie? Coolie?*" Station chime plays.
   The exhibition's side gate is at the end of the platform road.
4. `"Find Immu. Listen to the loudspeaker."` — three announcements; each names a stall; W4 beacon
   on Immu after the third.
   ```
   loudspeaker: Attention please! One boy, *chashma wala*, name Imran. He is not lost. He is waiting for Chinnu near the Delhi papad.
   papad_man:   *Chashma wala?* Went to the giant wheel. Took two papads, paid for one.
   loudspeaker: Again! Imran says: Chinnu, giant wheel. And bring change.
   pasha:       *Khazana Hunt!* Every Sunday, Channel Seven! Qutb Shahi treasure map, five rupees only!
   pasha:       You! Little detective! You have the face of a boy who knows a tunnel. Buy a map!
   chinnu:      Is the map real?
   pasha:       As real as my TV show!
   babloo:      (aside) Don't buy. He drew it last night with my sketch pens.
   loudspeaker: Last time! Imran is ON the giant wheel. At the top. Waving.
   ```
5. `"Ride the giant wheel (₹5)."` — W6 viewpoint: reveals kite K3 behind the wheel's ticket box
   and the Nampally/Abids golis.
   ```
   immu:   I'm not lost. I'm strategically located near papad.
   chinnu: You made them announce you to the whole Numaish!
   immu:   Now the whole city knows my name. That's one sound for the tape.
   immu:   From up here Hyderabad looks like a carrom board.
   chinnu: And you're the striker.
   immu:   I'm the queen. Everybody wants me.
   ```
   `● REC` `announce`. Counter → 166. Token: **Numaish entry ticket**.
6. `"Find Immu's Ammi at the gate."` — Ammi's introduction.
   ```
   ammi:   Imran! The loudspeaker? For fun? The announcer uncle also has a mother!
   ammi:   And you, {nick}. You let him.
   chinnu: Aunty, I was buying history.
   ammi:   History, and how much papad? Here, Numaish money. Don't spend it on maps.
   immu:   Next tape I hide myself, Agent. Proper test.
   ```

**Clue for M3 (Immu, on the way out):** "The crossroads named after the red buses shows films,
not buses. Saturday, before sunrise, the most-garlanded hero keeps our tape at his feet. Over."
- Ammamma: "Red buses have a big office near the cinemas, *kanna*. Your Mavayya saw every film there. RTC X Roads."
- Yadagiri (₹5): drops at `rtc_x_roads`. Aunty network: blips `rtc_x_roads` (+1).

**Fail / checkpoints:** none fail. Checkpoints `tin_bought`, `numaish_gate`.
**Reward:** ₹15 (Ammi's Numaish money); **the tin**; lock digit 2.
**J-card:** `TRACK 02 · LOST AND FOUND · NUMAISH` — scribble: "I was NOT lost. —I"
**Diary:** "Today my friend was announced on the radio of the whole of India."
Red ink: "*Loudspeaker, not radio. India, not. Sach likho.*"
**Cutscene:** "Night falls on Numaish. The giant wheel lights up one spoke at a time. The same
closing music plays that plays every night. Chinnu holds the empty tin like a trophy."

---

### M3 `first_day_first_show` — First Day, First Show

- **Chapter 1** · **Sat 8 Feb 2003 (second Saturday, no school), 05:15 → 10:30** · **Giver:**
  `home` (alarm clock, 05:15) · **Requires:** M2 · **Music:** `night` → `chase` → `day`
- **Places:** `home`, `rtc_x_roads`, `sandhya_theatre`, `sudarshan_theatre`, `odeon_theatre`,
  `devi_theatre`, `bawarchi`, `cycle_rent_3`, `irani_cafe_8`
- **Mechanics:** sneak (Chitti, the Gurkha); garland count across four forecourts; W5 queue cage;
  W1 Chappal Meter tutorial chase (levels 1 → 5); delivery of a peace offering.

**Script**

1. `"Sneak out before sunrise."` — Walk (don't run) past Chitti's room; running wakes her
   (level 1). In the lane, Bahadur:
   ```
   bahadur: *Kaun hai?* ...Arre, Chinnu baba. Cinema? *Hau, hau.* I saw nothing. I am only a whistle.
   ```
2. `"Find the most-garlanded hero at RTC X Roads."` — Four forecourts, each with an interaction
   and a garland counter shown over the cut-out: Sandhya **31**, Devi 18, Sudarshan 12, Odeon 4.
   ```
   painter:      (Sudarshan, on his scaffold) New film's hero. I paint the moustache last; it is the most important part.
   black_ticket: (Odeon) Ticket *kaavala*? Fifty rupees, floor.
   chinnu:       Black? *Nakko.* Amma says black tickets are for black hearts.
   black_ticket: Your Amma should write dialogues.
   (Devi) banner: "MASS MAHARAJU — 100 DAYS". A kite (not a riddle kite) hangs off the hero's sword.
   (Sandhya) "TOOFAN TAMMUDU — FIRST DAY". Thirty-one garlands. The hero's boots are as tall as Chinnu.
   ```
   At Sandhya: `"Get the tape from the hero's boot."` The painter holds his ladder.
   ```
   painter: Two steps only. I hold. Don't touch the boots, they're still wet.
   aunty:   (passing) Chinnu! On a ladder? In school shoes? Your Mummy will hear!
   ```
   (+1 meter: aunties' phone tree.) The tape is taped behind the painted buckle. Play on the walkman:
   ```
   immu (tape): Agent Immu to Agent Chinnu. If you found this, you're at Sandhya and it's six o'clock.
   immu (tape): Ayesha is in the queue. Get three floor tickets. Over and out. ...Also, don't tell Ammi.
   ```
3. `"Get three floor tickets: beat the queue cage (₹30)."` — W5 at `sandhya_theatre`: 75 s before
   HOUSEFULL; four line-cutters; Ayesha holds the place ahead. The kids pool ₹10 each.
   ```
   ayesha:     You're late. I've been holding this spot since five. My legs are now part of the cage.
   ticket_man: Floor, three? Last three. Lucky boys. And lucky girl.
   ```
4. `"Watch Toofan Tammudu (first day, first show)."` — cutscene inside (no gameplay in the hall).
   ```
   [text] 06:30. The screen goes white. A boot. A second boot. Then the hero's face, forty feet tall.
   [text] Four hundred people stand up on the seats. Ayesha puts two fingers in her mouth and whistles louder than all of them.
   immu:   Ayesha! Where did you learn that?
   ayesha: Bowlers' secret.
   ```
   `● REC` `finger_whistle`. Counter → 249. Token: **the ticket stub** (TOOFAN TAMMUDU, FLOOR, 8-2-03).
5. `"Get home! Mummy knows."` — At 09:20 the kids hire one cycle from `cycle_rent_3` (₹3) and
   triple-ride. Chappal Meter tutorial, scripted climb 3 → 4 → 5.
   ```
   pochaiah: *Ruko!* Three on one cycle? *Utro!* Licence? ...Arre, you're eleven. *Utro* anyway.
   (level 4: he follows on his Luna)
   yadagiri: (driving Mummy, level 5) Sorry, {nick}! Aunty is paying full meter. FULL meter!
   amma:     {FULL}! Cinema at six in the morning? One month before exams?! *Intiki raa!*
   ```
   Tutorial toast: "CHAPPAL METER: break line of sight, sit in an Irani café family room, or bring
   a peace offering." Objective: `"Lose Mummy, or bring a peace offering: a Bawarchi parcel for Nanna."`
   At `bawarchi`, Bunty-anna appears (the kids have ₹0):
   ```
   bunty:        *Tension nakko*, I'm here. Biryani solves everything. One family parcel, *bhai*.
   bawarchi_man: Family pack, forty rupees. Smell is free, parcel is not.
   ```
   Deliver the parcel to `home` (level 5 clears on arrival; reaching home caught gives the same
   scene with −₹2).
   ```
   amma:   Biryani? You think biryani fixes everything?
   nanna:  ...It fixes a little.
   amma:   Sreenivas!
   nanna:  Sorry. It fixes nothing. Pass the *raita*.
   amma:   No cinema till exams finish. And no Immu on Saturdays.
   chinnu: But Mummy...
   amma:   Sundays, okay.
   ```

**Clue for M4 (end of Immu's tape, played at home):** "PS. Sunday 23 March. Four tall uncles
with light-bulb heads guard a field. Ten o'clock. Bring your bat. Over."
- Ammamma: "Uncles with bulbs for heads? Lights on poles, *kanna*. The big cricket ground. LB Stadium."
- Yadagiri (₹5): `lb_stadium` west gate. Aunty network: blips `lb_stadium` (+1).

**Fail / checkpoints:** queue cage fails if HOUSEFULL → retry from `queue`; being caught is not a
fail. Checkpoints `rtc_x`, `queue`, `escape`.
**Reward:** ₹10 (Bunty, "for your RX100 fund"); Chappal Meter fully live; SA6 Bunty's Races
unlocked.
**J-card:** `TRACK 03 · FIRST DAY FIRST SHOW · SANDHYA` — scribble: "Ayesha's whistle, not yours. —I"
**Diary:** "Today the hero waved at me personally from the screen."
Red ink: "*He waved at four hundred people. Sach likho.*"
**Cutscene:** "Lunchtime. Nanna eats the biryani very slowly, so it lasts. Amma doesn't look at
Chinnu, but she puts the leg piece on his plate."

---

### M4 `last_man_batting` — Last Man Batting

- **Chapter 2** · **Sun 23 Mar 2003 (World Cup final day), 09:30 → 18:00** · **Giver:** `home`
  (Amma at breakfast) · **Requires:** M3 · **Music:** `day`
- **Places:** `lb_stadium`, `public_gardens`, `state_museum`, `assembly`,
  `gandhi_statue_assembly`, `electronics_shop_1`, `fateh_maidan` (seen)
- **Mechanics:** `cricket` minigame; politeness choice at the Assembly gate; lock digit 1;
  `antenna` minigame.

**Script**

0. Breakfast:
   ```
   amma:   TV *nakko* today. *Repu* maths exam, {FULL}. Study at Immu's house.
   chinnu: Yes, Mummy. Study. Maths. *Pakka.*
   chitti: He's taking his bat to study.
   amma:   Bat for what?
   chinnu: ...Geometry. For straight lines.
   amma:   Take Chitti with you. She is bored, and Immu's Ammi has biscuits.
   chinnu: Mummy!
   chitti: (already wearing her chappals) *Doodh-bhaat* is ready.
   ```
1. `"Find the field guarded by four tall uncles with light-bulb heads."` — `lb_stadium` west gate.
   ```
   watchman: Stadium *mein nakko!* No match today. Only the grass is sleeping.
   ayesha:   Told you. Stadium is for real matches. Across the road: Public Gardens back lawn.
   ayesha:   *Mali*-uncle sleeps till ten-thirty. Colony XI versus Ashok Nagar. I'm captain.
   tiger:    Girls' captain? Then we bat first. *Doodh-bhaat* team.
   ```
2. `"Win the match on the back lawn before 1:30."` — Chitti (sent along by Amma, and a level-1
   tattle threat all day) is put at fine leg as *doodh-bhaat*. Scripted first innings (cutscene): Ayesha bowls; Tiger edges;
   Chitti takes a one-tip one-hand catch.
   ```
   tiger:  *Doodh-bhaat* doesn't count!
   ayesha: One-tip, one-hand. She counts.
   chitti: I count! I COUNT!
   ```
   `● REC` `howzat` (the whole lawn shouts "*Howzaaat!*"). Counter → 332.
   Then minigame `cricket` (`target: 18`, `overs: 2`, `wickets: 1`; "Last man batting: Immu at the
   other end"). Mid-game interruption (comic, no penalty):
   ```
   mali: *Ghaas pe nakko khelna!* ...Who is batting? Hit it straight, at least.
   ```
   Final ball (scripted on a win): a six over the hedge, off the roof of a passing red bus, onto
   the Assembly lawn beside the seated Gandhi.
3. `"Ask for the ball at the Assembly gate. Stay outside."` — the kids stay at the gate.
   Choice: ["Uncle, sorry, our ball fell inside. May we please have it?", "Oye uncle, throw the ball!"]
   ```
   (polite)  sentry: Ball next to Gandhi-ji? He was a peaceful man. Take it. *Hallu, hallu.*
   (cheeky)  sentry: "Oye"? To me? Go and learn manners. Then come.   (+1 meter; choice repeats)
   immu:     That statue is new. Abba says it came in 1998.
   ```
   Trivia toast: "The seated Gandhi statue on the Assembly lawn was installed in 1998."
4. `"See the museum mummy with Immu."` — `state_museum` (quiet zone, walk).
   ```
   immu:   Two thousand years old. And nobody sent HER to America.
   chinnu: She's from Egypt. She already came all the way to Hyderabad.
   immu:   ...So you can go far and still end up home.
   chitti: That's a mummy? MUMMY's mummy?
   ```
   Lock slot 1: `"In the oldest garden a princess has slept two thousand years. How many princesses?"`
   [**1**, 2, 4, 0] → `1 4 _ _`.
5. `"Watch the final at the TV shop by LB Stadium (1:30 pm)."` — `electronics_shop_1`: a crowd on
   the footpath, a TV in the window. The picture snows.
   ```
   cable_babji: Signal *gaya!* Somebody go up and turn the antenna! Small boy, you. Up.
   ```
   Minigame `antenna` (`time: 40`). Babji below:
   ```
   cable_babji: *Thoda left... thoda right... AARA!* Bas! Don't breathe!
   crowd:       Score *kya hua*? Score?
   ```
6. Cutscene, evening: "India lose the final. The crowd goes quiet. The shopkeeper turns the TV
   off. Then someone at the back starts clapping for the team anyway, and everyone joins in."
   ```
   immu:   We lost.
   chinnu: We won the colony match.
   immu:   In America they don't even play cricket.
   chinnu: Then you'll be the best one there.
   ```
   Home: `amma: Lost? ...Chalo, eat. Tomorrow maths.` Token: **the signed tennis ball** (every
   colony player's name in ballpoint, Chitti's in the biggest letters).

**Clue for M5 (Immu, at the gate):** "Ugadi eve, Nani goes home on the four o'clock express. Her
bus leaves from a tamarind grove with no trees, only buses. She wants Gokul's samosa-ragda for the
road. Mission: parcel. Over."
- Ammamma: "*Imli* is tamarind, *kanna*. *Imli-bun*, a grove of them. The big bus station by the river."
- Yadagiri (₹5): `imlibun_bus_station`. Aunty network: blips it (+1).

**Fail / checkpoints:** the cricket minigame retries from `match`; the final ends whatever the
player does. Checkpoints `match`, `museum`, `tv_shop`.
**Reward:** ₹10; lock digit 1; side cricket games unlocked in every `playground_*`.
**J-card:** `TRACK 04 · HOWZAAT! · PUBLIC GARDENS` — scribble: "Chitti's catch. Write it BIG. —I"
**Diary:** "Today I hit a six that landed in the Assembly and the government gave it back."
Red ink: "*The sentry gave it back. Still, good manners. Half mark.*"

---

### M5 `right_right` — Right, Right!

- **Chapter 2** · **Tue 1 Apr 2003 (Ugadi eve), 13:30 → 17:00** · **Giver:** `home` (Amma) ·
  **Requires:** M4 · **Music:** `day`
- **Places:** `sultan_bazaar`, `gokul_chat`, `koti_bus_stand`, `imlibun_bus_station`,
  `koti_womens_college` (seen)
- **Mechanics:** `panipuri` minigame; city bus ride (fast-travel tutorial); W4 search by the
  conductors' calls; W2 timed return.

**Script**

1. `"Go Ugadi shopping with Amma at Sultan Bazaar."` — ride with Amma in Yadagiri's auto.
   ```
   amma:   New clothes, mango leaves, neem flowers, jaggery. Stay next to me. Don't vanish.
   amma:   I'll be in Lakshmi Saree Centre for forty minutes. Exactly forty. Don't move from this step.
   chinnu: Not one step, Mummy.
   immu:   (from behind a pillar, whispering) Psst. Agent. Forty minutes. Nani's bus is at four.
   ```
   A 240 s timer starts: `"Back on this step before Amma comes out"`.
2. `"Parcel samosa-ragda at Gokul Chat."` — minigame `panipuri` (`target: 12`).
   ```
   gokul_man: *Teekha ya meetha?* One extra, *phokat!*
   immu:      Loser pays for Nani's parcel.
   chinnu:    *Pakka.*
   (after)
   gokul_man: Samosa-ragda parcel, double chutney, for Nani. Nani's blessings, free.
   ```
3. `"Catch a red bus from Koti to Imlibun."` — `koti_bus_stand`, Ticket Thatha's bench.
   ```
   ticket_thatha: Imlibun? Thirty-one years I punched tickets on these roads. Any bus for Afzalgunj or MGBS.
   ticket_thatha: Here. Old habit. (punches a ticket) Keep it. Tickets are like memory: small, but they take you places.
   ticket_thatha: In my last year I hid twelve tickets behind bus-stop boards. Find them; I'll teach you each stop's bus.
   conductor:     *Footboard pe nakko!* Inside! *Right, right!*
   ```
   Board as a passenger (the bus drives itself, ~15 s). Unlocks **Bus Tickets** (§6.4) and bus
   fast travel from `koti_bus_stand` / `imlibun_bus_station` / `rathifile_bus_station`.
4. `"Find Nani's bus to Kurnool."` — W4: follow the conductors' chant ("*Kurnool! Kurnool!*")
   through the bays.
   ```
   nani:   Imran! You came. And this is the famous {nick}?
   chinnu: *Salaam*, Nani. Samosa-ragda. Double chutney.
   nani:   *Hai Allah*, still hot! Don't forget Hyderabad over there, Imran. And you, {nick}: don't let him.
   nani:   *Imli-bun*. When I was a girl this was all tamarind trees. Now buses. Same shade, different trees.
   conductor: Kurnool! *Right, right!*
   ```
   `● REC` `conductor`. Counter → 415. Token: **Ticket Thatha's punched ticket**.
5. `"Get back to Amma's step before she comes out!"` — the rest of the 240 s timer (bus, run or
   auto). On time:
   ```
   amma:   Good boy. You didn't move.
   chinnu: Not one step, Mummy.
   amma:   Then why are you sweating? And why do you smell of chutney?
   chinnu: ...Ugadi, Mummy. Six tastes.
   ```
   Late: Chappal Meter 3 ("{FULL}! I came out and the step was EMPTY!"); escape or be caught; the
   mission still passes.
6. Cutscene at home, Ugadi morning: the *pachadi*.
   ```
   amma:     Six tastes: sweet, sour, salt, bitter, spicy, tangy. Like a whole year.
   ammamma:  Eat the bitter neem also, *kanna*. Without it the sweet doesn't know it is sweet.
   [text]    A cassette taps on the window, hanging from a string. Immu's handwriting: "PLAY ME."
   immu (tape): Clap at a gate and a king hears you on the hill. Find it before the summer ends. Over.
   chinnu:   What king? What hill?
   ```

**Clue for M6/M7:** "Clap at a gate and a king hears you on the hill." (Solved by Ammamma in M6;
the hint tiers are switched off for this one clue: "Even Yadagiri doesn't know. Ask someone who
was young in 1961.")
**Fail / checkpoints:** the timer never fails the mission (only raises the meter). Checkpoints
`gokul`, `koti`, `imlibun`.
**Reward:** ₹10; bus fast travel; Tickets series.
**J-card:** `TRACK 05 · RIGHT, RIGHT! · IMLIBUN` — scribble: "Nani says I won the pani puri. —I"
**Diary:** "Today I ate fifty pani puris and caught a bus that was flying."
Red ink: "*Bus udti nahi. Sach likho.*"

---

### M6 `ammammas_thursday` — Ammamma's Thursday

- **Chapter 2** · **Thu 15 May 2003 (summer holidays), 10:00 → 19:30** · **Giver:** Ammamma on
  the verandah swing at `home` · **Requires:** M5 · **Music:** `day`, then ambient only at the temple
- **Places:** `pindi_girni_1`, `kirana_1`, `home`, `medical_shop_1`, `dilsukhnagar_sai_temple`,
  `banana_cart_8`, `flower_cart_5`
- **Mechanics:** wait out a power cut (walkman tutorial); W3 cargo carry (5 kg flour on the cycle
  carrier); errand; escort Ammamma in Yadagiri's auto; W5 patient queue (respect variant).

**Script**

1. `"Get Ammamma's wheat ground at the pindi girni."` — `pindi_girni_1`.
   ```
   ammamma: Fine flour, *kanna*. Not *rava*. Your Ammamma's chapatis have a reputation.
   ramulu:  *Dabba* there, in the line. Number forty-seven. Sit.
   chinnu:  Uncle, your hair is all white!
   ramulu:  My hair isn't white, *beta*. It's *atta*.
   ```
   The thump-thump stops: power cut.
   ```
   ramulu: Current *gaya!* Everybody sit, till it comes.
   aunty:  (outside) *Current poyindi!* Sreenivas-garu, *emaindi?!*
   chinnu: Why does everyone shout at Nanna?
   ramulu: Your Nanna brings the current back. When you bring something back, people think you took it.
   ```
   `"Wait for the current. (Play a cassette on your walkman.)"` — tutorial: the walkman menu
   (Q / radio button on foot). Next door, the feud:
   ```
   agarwal: (from kirana_1) Tell your girni uncle his radio is too loud.
   ramulu:  Tell your kirana uncle his radio is too quiet.
   chinnu:  You both have the same radio.
   agarwal + ramulu: ...Hmph.
   ```
   Current returns: the machine thumps back to life. `● REC` `flour_mill`. Counter → 498.
   Token: **brass token No. 47**.
2. `"Carry the flour home without spilling."` — W3 cargo: the bag on the carrier of Nanna's old
   cycle; potholes and bumps spill (meter below 40 = fail).
   Fail line: `ramulu: Atta on the road? The crows will be very happy. Come, I'll grind again.`
3. `"Buy Ammamma's BP tablets at the medical shop."` — `medical_shop_1`.
   ```
   chemist: Doctor's *chitti*? ...Ammamma's tablets, one month's strip. Change two rupees. Or a churan goli?
   chinnu:  Change, uncle. Ammamma counts.
   ```
4. `"Take Ammamma to the Sai Baba temple in Dilsukhnagar."` — Yadagiri's auto (passenger). At
   the lane: `banana_cart_8` (a dozen, ₹12) and `flower_cart_5` (rose garland, ₹8).
   ```
   yadagiri:     Thursday, Sai Baba. For Ammamma, meter only. No *das upar*.
   ammamma:      Yadagiri is a good boy. His meter is a bad boy.
   banana_man:   *Arati pandlu! Chakkarakeli!* Dozen, twelve rupees. One *kosaru* for the little one.
   flower_aunty: Thursday rose garland for Baba. I kept one aside. Two rupees less for Ammamma.
   ```
5. `"Join the Thursday queue. Walk only; chappals at the stand."` — respect zone: meter frozen,
   running disabled; W5 respect queue in the outer barricade lane (step forward when the gap
   opens; no timer). The conversation happens in the outer lane, before the gate.
   ```
   ammamma: What are you two always whispering into that machine?
   chinnu:  Immu's clue, Ammamma. "Clap at a gate and a king hears you on the hill." Nobody knows.
   ammamma: In a queue even God waits, *kanna*. So we also wait. And think.
   ammamma: Heard on a hill... Your Thatha took me there in 1961. He clapped at the big gate, and a man on top clapped back.
   ammamma: I thought it was magic. Your Thatha said it was the walls. Golconda.
   chinnu:  GOLCONDA! Ammamma, you're a genius!
   ammamma: Shh. Baba is listening. He also thinks I'm a genius.
   ```
   Cutscene card (no dialogue inside): "Inside, the white marble Baba. Ammamma folds her hands.
   Chinnu folds his, and asks for something he doesn't say out loud."

**Clue solved:** Golconda. Journal: "Clap at the gate (Fateh Darwaza). Someone answers from the
top (Bala Hissar)."
**Fail / checkpoints:** cargo fail → retry from `girni_done`. Checkpoints `girni_done`,
`medicine`, `temple_lane`.
**Reward:** ₹10 (Ammamma's Thursday rupees: "for the boy who carries flour without spilling").
**J-card:** `TRACK 06 · THUMP-THUMP · HANUMAN PINDI GIRNI` — scribble: "Ramulu-uncle's hair is atta. —I"
**Diary:** "Today I carried 500 kilos of flour on one cycle and solved a mystery older than my
father."
Red ink: "*5 kilos. And your Ammamma solved it. Sach likho.*"

---

### M7 `the_clap` — The Clap (midpoint)

- **Chapter 2** · **Sat 7 Jun 2003, 14:30 → 19:30 (sunset 18:50)** · **Giver:** Amma at `home`
  (shopping list) · **Requires:** M6 · **Music:** `day` → `oldcity`-style fort cue → `night`
- **Places:** `rythu_bazaar_mehdipatnam`, `mehdipatnam_bus_terminus`, `qutb_shahi_tombs` (from the
  bus), `golconda_fort`, `golconda_fateh_darwaza`, `golconda_jagadamba_temple` (passed, respect),
  `golconda_bala_hissar`, `golconda_sound_light`, `ameerpet_coaching` (Bunty, off-screen)
- **Mechanics:** `bargain` minigame (`who:'farmer'`, budget); city bus west; `clap` minigame
  (`skin:'golconda'`); W2 timed climb before sunset; W1 chase-reskin (shake off Pasha on foot).

**Script**

1. `"Shop Amma's list at the Mehdipatnam Rythu Bazaar (₹40)."` — list: tomatoes 2 kg, onions
   2 kg, brinjal 1 kg, coriander, curry leaves. Bunty drops the boys at the gate on his way to
   his Ameerpet class: "Five o'clock at the bus depot. Not one minute late. My Java sir locks the door."
   ```
   farmer: *Tamata kilo aaru!* *Kosaru kaavala, babu?*
   chinnu: *Kosaru*: curry leaves AND coriander, aunty!
   farmer: Smart boy. Take. Your Amma has trained you well.
   ```
   Budget question (choice): "Tomatoes are ₹1 a kilo cheaper at Erragadda, but the auto costs ₹10.
   Buy here or go?" [Buy here ✔ / Go to Erragadda]. "Go" gets: `farmer: Ten rupees to save two?
   Babu, which class are you in?` and returns to the choice.
2. `"Take the bus from Mehdipatnam depot to Golconda."` — ride west. Through the window: the
   Qutb Shahi domes on their terraces (frame F11 opportunity toast). Babloo is on the same bus.
   ```
   babloo: (pretending not to know them) Mamu's coming in the next bus. He heard "tunnel" at Numaish. Just saying.
   ```
3. `"Find the gate where a clap is heard on the hill."` — `golconda_fateh_darwaza`.
   ```
   guide:  Fateh Darwaza, the Victory Gate. Clap under this dome, and up at the Bala Hissar they hear it.
   guide:  They say a *surang* runs from here to Charminar. They say.
   immu:   Agent plan: I run up. You clap here. When I hear you, I clap back. Then we're officially magic.
   pasha:  (arriving with his antenna) Silence! The Professor is detecting! Beep means *khazana!*
   babloo: Beep means your battery, mamu.
   ```
4. `"Clap under the Fateh Darwaza dome."` — Immu's dot climbs the minimap path (~45 s), then
   minigame `clap` (`skin:'golconda'`, `rounds: 3`). Each echo returns from Bala Hissar.
   `● REC` `clap_echo`. Counter → 581. The HUD shows "SIDE A · HALFWAY".
5. `"Climb to the Bala Hissar before sunset."` — W2, walk path `golconda_steps`, 90 s; passing
   `golconda_jagadamba_temple` the path is walk-only (no penalty, just slower). At the top, the
   whole city in golden light.
   ```
   immu:   Three claps came up. Clear. Like you were standing next to me.
   chinnu: Golconda heard us.
   immu:   {nick}. The guide said a tunnel goes from here to Charminar.
   chinnu: "They say." He said "they say" two times.
   immu:   On Chand Raat I go into the tunnel. A plane can't take a boy it can't find.
   chinnu: (a long look at the city) ...*Pakka.* I'll bring Osmania biscuits.
   immu:   Agent rules. The tunnel starts where four towers keep time. Don't forget.
   chinnu: Four towers... that's...
   immu:   Shh. Pasha is coming up the stairs.
   ```
   W6 viewpoint at the summit: reveals K11 (a bastion below) and the west golis.
6. `"Shake off Professor Pasha."` — he follows on foot ("The boys know the entrance!"). Lose him
   (300 u out of sight) or board the bus. Babloo helps:
   ```
   babloo: Mamu! Tunnel entrance! Behind the sound-and-light chairs!
   pasha:  BEHIND THE CHAIRS! Camera, roll!
   ```
7. `"Back to the Mehdipatnam depot by 19:30."` — W2 bus ride. On time:
   ```
   bunty:  Good. Word of the day. Sir says nostalgia means "pain for home". Nostos, algos. Greek.
   immu:   ...Pain for home.
   bunty:  Why is everyone quiet? I got it RIGHT for once!
   ```
   Late: Bunty is at level 2 ("*Tension nakko*... no. TENSION *HAAN!*"). Home: `amma: Tomatoes
   are bruised. Who sat on them?` Token: **Golconda entry ticket**.

**Midpoint card:** "SIDE A · 581. Halfway. The hunt has a secret now: on Chand Raat, Immu
disappears. But the tape is collecting something else, and nobody has noticed yet."
**Clue planted for M12:** "The tunnel starts where four towers keep time." (Journal, with a
padlock icon: "for Chand Raat".)
**Fail / checkpoints:** the clap minigame retries; the climb has no fail (sunset just turns to
dusk); being late is not a fail. Checkpoints `bazaar`, `gate`, `summit`.
**Reward:** ₹10; Golconda bus route.
**J-card:** `TRACK 07 · GOLCONDA HEARD US · FATEH DARWAZA` — scribble: "Officially magic. —I"
**Diary:** "Today I clapped and a king clapped back from 400 years ago."
Red ink: "*It was Imran. Lovely sentence though.*"

---

### M8 `drums_for_amma` — Drums for Amma

- **Chapter 3** · **Sun 20 Jul 2003 (Lashkar Bonalu), 05:30 → 13:30** · **Giver:** Amma at `home`
  (dawn) · **Requires:** M7 · **Flags:** `bonalu` · **Music:** `festival` (the Bonalu procession),
  then `day`
- **Places:** `flower_cart_2`, `dosa_bandi_1`, `pindi_girni_1`, `kirana_1`,
  `ujjaini_mahankali_temple`, `general_bazaar`, `flower_cart_4`, `paradise`, `home`
- **Mechanics:** errands at dawn; W8 escort at walking pace + `clap` minigame (`skin:'drums'`,
  three short drum phrases: "keep step"); W2 hot-parcel delivery (120 s).

**Script**

1. `"At dawn, buy neem leaves and marigolds for Amma's bonam."` — `flower_cart_2`; breakfast at
   `dosa_bandi_1` (optional, energy +25).
   ```
   flower_aunty: One *moora*, measured on my own arm. Never short.
   dosa_man:     Idli, vada, dosa: *tondaraga cheppandi!*
   amma:         (balancing the brass pot) *Nemmadiga*, {nick}. The *bonam* is in no hurry, and neither are we.
   ```
2. `"Bring Ramulu-uncle his turmeric."` — Ramulu is getting ready as the colony's Pothuraju and
   needs turmeric, which only the kirana next door sells.
   ```
   ramulu:  *Ee okka Aadivaaram nenu pindi Ramulu kaadu. Pothuraju.* (This one Sunday I'm not Flour Ramulu.)
   ramulu:  But a Pothuraju with no turmeric is just a man in shorts. Get me a packet. Not from... you know.
   agarwal: Turmeric? For who? ...For Ramulu? (long pause) Take it. Don't tell him it's from me.
   ramulu:  (painting himself gold) Where did you get this? It's very good turmeric.
   chinnu:  ...A shop.
   ```
3. `"Walk with Amma's bonam to Ujjaini Mahankali. Keep step with the drums. Never run."` — W8 from
   the General Bazaar end (Yadagiri drops them there; the procession lanes are closed to autos).
   The procession is a respect zone: running is disabled; drifting > 120 u away from Amma prompts
   `"Stay with Amma"`. Three times the drums swell → minigame `clap` (`skin:'drums'`, one round
   each, `noQuit`). Ramulu-the-Pothuraju dances ahead; the crowd makes way. Immu carries the neem.
   ```
   immu:   Ammi says Bonalu is the city saying thank you to the goddess for the rain.
   amma:   Your Ammi is right. Hold the neem higher, Imran. Not like a cricket bat.
   ```
4. `"The free buttermilk stall."` — halfway, an unsigned stall gives free buttermilk, as every
   year. Agarwal-ji is behind it, pretending not to be.
   ```
   agarwal: Buttermilk, free. For everyone. Even... for everyone.
   ramulu:  (Pothuraju, painted gold, takes a glass) ...Thanks, Gopal.
   agarwal: ...Hmph. Drink slowly. It's cold.
   chinnu:  (aside) Twenty years they didn't talk. Because of one radio.
   immu:    That's not fighting. That's how uncles say sorry.
   ```
5. At the temple (cutscene card, respect): "Amma lifts the bonam down at the gate. Drums. Neem.
   Turmeric. A thousand women, a thousand brass pots, one goddess. Chinnu stands outside with the
   chappals and listens." `● REC` `dappu` (requested SFX; fallback `temple_bell`). Counter → 664.
   Token: **a pressed neem leaf**.
6. `"Bring a Paradise biryani parcel home hot (Sunday lunch)."` — `paradise`; W2 120 s from the
   counter to `home` (Bunty lends the cycle; auto is allowed).
   ```
   paradise_man: Family pack? Fifteen minutes. The smell is free.
   immu:         Does America have Paradise?
   chinnu:       Then it's not paradise, *na*.
   ```
   At home:
   ```
   nanna:  Still hot! Who brought it?
   chinnu: Me. Record time.
   nanna:  Hold it up. Smile. (click) Hero with parcel.
   chinnu: Nanna, come in the photo also.
   nanna:  Then who will click?
   ```
   Late parcel: `amma: Cold biryani is still biryani. But you're still in trouble.` (no fail).

**Clue for M9:** none from Immu. Ammi phones the colony STD booth: Abba forgot his tiffin
(giver for M9 appears at `friend_home` on Fri 25 Jul).
**Fail / checkpoints:** none fail. Checkpoints `turmeric`, `procession`, `paradise`.
**Reward:** ₹15; Ramulu and Agarwal-ji now greet each other (ambient lines change).
**J-card:** `TRACK 08 · DRUMS FOR AMMA · LASHKAR BONALU` — scribble: "Ramulu-uncle was GOLD. —I"
**Diary:** "Today two uncles who hated each other for 100 years became best friends because of me."
Red ink: "*Because of buttermilk. Sach likho. (But I am happy.)*"

---

### M9 `opening_day` — Opening Day

- **Chapter 3** · **Fri 25 Jul 2003 (Prasads opening day), 08:30 → 20:00** · **Giver:** Ammi at
  `friend_home` · **Requires:** M8 · **Flags:** `prasads_open` (from today) · **Music:** `day`
- **Places:** `friend_home`, `bus_stop_20`, `hitec_city`, `cyber_towers`, `rythu_bazaar_erragadda`,
  `necklace_road`, `coconut_cart_1`, `prasads_imax`, `ntr_gardens`, `hussain_sagar`
- **Mechanics:** W2 timed tiffin delivery by bus; W3 cargo race (tomatoes) against Bunty; the
  opening show (cutscene); NTR Gardens mini-train ride (seated scene).

**Script**

1. `"Take Abba's tiffin to Cyber Towers before 1 pm."` — bus to `bus_stop_20` (or cycle; HITEC
   City is far). The road passes boulders, cranes and new glass.
   ```
   ammi:  He forgot his *dabba* again. If he eats canteen oil every day, he'll be fat in America.
   abba:  (at the Cyber Towers forecourt) My tiffin! Ammi sent you two across the whole city for one *dabba*?
   immu:  She said canteen oil will make you fat in America.
   abba:  Look around. Five years ago this was rocks and goats. Now look. Glass.
   abba:  For delivery on time: tickets for today's opening at Prasads. Six o'clock show.
   chinnu: Tickets? For us?
   abba:  Three. I'm also coming. My manager gave half-day. I said "gas station" perfectly.
   abba:  (practising, quietly) Gas station. Gas station. Not petrol bunk.
   ```
2. `"Bunty-anna's challenge: tomatoes from Erragadda Rythu Bazaar to Necklace Road, no bruises."`
   — at `rythu_bazaar_erragadda`. W3 cargo race (3 kg in a cloth bag; cycle vs Bunty's RX100 via
   his Ameerpet class, so the race is close). Finish: `coconut_cart_1`, "where the palms meet the
   railway".
   ```
   bunty:       *Tension nakko.* Tomatoes first, cinema later. My mother also has a chappal.
   coconut_man: *Kobbari bondam!* *Neeru teeyaga undi!* Winner drinks first.
   bunty:       (arriving) You took the railway-side road? *Chee*. Clever.
   ```
   Fail (cargo < 40): `bunty: Tomato chutney. My mother will make ME into chutney. Again!`
3. `"Meet Abba at Prasads. Opening day!"` — the new building, banners "OPENING TODAY", crowds,
   air-conditioning chill, popcorn smell. In the lobby:
   ```
   pasha:  *Khazana Hunt* special! Live from the biggest screen in... er... in this lobby!
   babloo: Mamu, they're asking for your ticket.
   pasha:  The Professor does not need a ticket! ...How much is a ticket?
   ```
   The show: a giant-screen documentary, *Giants of the Deep* (fictional).
   ```
   [text] The lights go down. The screen is so big it has no edges.
   [text] A whale swims over four hundred heads. Immu grips the armrest. Abba laughs out loud, like a boy.
   immu:  Bigger than every TV in our colony put together!
   ```
   `● REC` `applause` (the opening-day audience clapping in the dark). Counter → 747.
   Token: **Prasads ticket stub, 25 JUL 2003**. W6 viewpoint from the lobby window: K7 and the lake.
4. `"Ride the mini train at NTR Gardens with Abba."` — seated ride around the gardens (camera
   follows the train; Machan tree, waterfall). Chinnu sits one seat behind.
   ```
   abba: Imran. You think I'm taking you away from here.
   immu: Aren't you?
   abba: My father ground flour at a girni near Charminar so I could study, *beta*. Atta on his eyebrows every day of his life.
   abba: I'm going so you can choose anything. Even to come back.
   immu: ...Even to come back?
   abba: Especially that.
   ```
   The train whistles. Chinnu looks at the lake and says nothing.

**Clue for M10:** Bunty's flyer: "Colony Ganesh Committee. Lorry for immersion: behind the station
dressed as a palace. Look for the peacock." (giver appears at `playground_1` on Tue 9 Sep)
**Fail / checkpoints:** tiffin late (after 13:00) → retry from `bus`; cargo fail → retry from
`erragadda`. Checkpoints `bus`, `erragadda`, `prasads`.
**Reward:** ₹20 (Abba: "delivery charges"); Prasads opened for free roam; NTR mini train ride (₹5).
**J-card:** `TRACK 09 · OPENING DAY · PRASADS` — scribble: "Abba laughed the loudest. —I"
**Diary:** "Today I saw a whale in Hyderabad."
Red ink: "*On a screen. ...Fine. That one is true enough.*"

---

### M10 `agle_baras` — Agle Baras Jaldi Aana

- **Chapter 3** · **Tue 9 Sep 2003 (Ganesh immersion), 15:00 → Wed 10 Sep 02:30; coda Wed 10 Sep
  17:30** · **Giver:** Bunty at the colony pandal, `playground_1` · **Requires:** M9 (and the
  optional SA1 Pandal Duty nights before it) · **Flags:** `ganesh_immersion` · **Music:**
  `festival` → `night` → calm ambience for the boat
- **Places:** `playground_1`, `kachiguda_station`, `chappal_bazar`, `banana_cart_1`,
  Narayanguda → Liberty → Secretariat Road route, `secretariat`, `khairatabad_ganesh`,
  `tank_bund`, `tank_bund_statues`, `ganesh_immersion_point`, `hussain_sagar`, `lumbini_park`,
  `lumbini_jetty`, `buddha_statue`
- **Mechanics:** riddle navigation; lost-chappal gag (shop); W8 escort the lorry at walking pace;
  statue count (search); W7 boat ride; lock digit 4.

**Script**

1. `"Find the lorry: behind the station dressed as a palace. Look for the peacock."` — Hints:
   Ammamma: "A palace with trains in it? Kachiguda, *kanna*. Your Thatha took the Ajanta Express
   from there." Yadagiri drops near `kachiguda_station`. Behind it, the huge Chappal Bazar pandal
   crowd. In the crush, Chinnu loses a hawai chappal.
   ```
   chinnu:      My chappal! In Chappal Bazar!
   chappal_man: Chappal Bazar *mein* chappal lost? *Mian*, here even chappals have a lost-and-found.
   chappal_man: New pair, fifteen rupees. And for your Mummy? Ladies' *kotha chappal*, twenty-five. Very good for... apologies.
   ```
   Optional purchases: hawai pair ₹15 (else Chinnu limps at 80% speed until home), `kotha_chappal`
   ₹25. Puja bananas from `banana_cart_1` (₹10).
   ```
   narsimha: Peacock lorry, that's me. Your colony paid the advance? ...Bunty paid? Then let's go before he changes his mind.
   ```
   Ride in the lorry cab to `playground_1`.
2. `"Walk with our Ganesh to Tank Bund."` — W8: the idol on the lorry; teenmaar dancers; gulal
   (pink puffs, no harm); no running ahead (> 150 u). Route: colony → Narayanguda → Liberty →
   Secretariat Road. At the Secretariat/Lumbini end the **Khairatabad giant** passes (cutscene):
   "The giant Ganesh glides past on its own huge trailer. Every drum stops. A whole city holds its
   breath. Then the drums start again, twice as loud."
3. `"Wait for our turn at the cranes."` — night on the Tank Bund; the immersion queue. A free
   water stall by the lake: Abba, Ammi and Faramarz uncle.
   ```
   faramarz: *Paani lo, beta.* Ganpati's journey is long. Everybody gets thirsty.
   ammi:     Every year Abba's family gave water here. This year...
   abba:     ...This year also. Next year, someone else. Same water.
   immu:     (handing Chinnu a cassette) Agent tape. Listen.
   immu (tape): Count the great ones from the Lumbini end. At seven, look down. Then ask the man in the lake.
   ```
   `"Count the statues from the Lumbini end. At the seventh, look down."` — walk the bund
   counting plinths (the HUD counts 1..7 as you pass `tank_bund_statue` idx 1..7 from the
   south-west end). At the 7th plinth's base: a paper boat with a note: "Ask the man in the lake
   how many stones he is made of." (Lock slot 4 riddle appears.)
4. `"Say goodbye to our Ganesh."` — 02:10 at the crane.
   ```
   crowd:  *Ganpati Bappa Morya! Agle baras jaldi aana!*
   immu:   (to the lake) *Ganpati Bappa, agle baras jaldi aana!*
   chinnu: (quietly, not to the lake) You also.
   ```
   `● REC` `crowd_cheer`. Counter → 812. Token: **a packet of gulal**.
5. `"Next evening: take the boat from Lumbini jetty to the Buddha."` — fast-forward to Wed 10 Sep
   17:30. `lumbini_jetty` → the boatman rows round the Buddha (W7; the player may steer or let him).
   ```
   boatman: To Buddha-*ji*? Sit *hallu*. He's in no hurry.
   immu:    Uncle, how many stones is he made of?
   boatman: One. One single block of white granite, from near Bhongir. Like a good friend: one piece.
   ```
   Lock slot 4 → `1 4 _ 1`. Frame F07 opportunity toast.

**The low point: Interlude "Side A ■ Paused"** (cutscene + a forced choice; plays at once after
M10 and fast-forwards to **Sat 1 Nov 2003, 19:40**, Ramzan, `home`, the 2-in-1).
```
[card]   SAT 1 NOV 2003. The air smells of haleem from far away.
immu:    (at the window) Agent Chinnu. Tickets came. Thursday the twenty-seventh. Night flight, Begumpet. Over?
chinnu:  ...
immu:    Over?
chinnu:  I'm not recording any more.
immu:    Why?
chinnu:  If the tape gets full, you go. If it doesn't get full...
immu:    That's not how planes work, Chinnu.
```
Choice (both options lead on; the second is the one the story continues with):
["Then we finish the tape.", "Then the tunnel. I'll help you hide. Properly."]
- First option: `chinnu: Then we fin— (he stops. He can't say it.) ...No. Then the tunnel.` and
  the second line plays.
```
chinnu:  The tunnel. Chand Raat. I'll help you hide. Properly. Biscuits AND a torch.
immu:    ...*Pakka?*
chinnu:  *Pakka.*
[text]   Chinnu presses ■ STOP on the 2-in-1. The counter freezes at 812.
```
HUD: the counter greys: `SIDE A ■ PAUSED 812`. Then Ayesha at the colony gate (free-roam bark
that plays once, then M11's giver appears):
```
ayesha:  We're moving to Tolichowki in December. Eight kilometres. Ammi cried for a week.
chinnu:  Eight kilometres is nothing.
ayesha:  Then why is Immu's eight thousand a problem?
chinnu:  It's different.
ayesha:  It's not. It's just more bus tickets.
```

**Fail / checkpoints:** the escort fails only if the player abandons the lorry for 60 s (retry
`procession`). Checkpoints `kachiguda`, `procession`, `tank_bund`, `boat`.
**Reward:** ₹15; lock digit 4; boats at `lumbini_jetty` for free roam (₹10 a ride).
**J-card:** `TRACK 10 · AGLE BARAS · TANK BUND` — scribble: (none. The line is empty.)
**Diary:** "Today our Ganesh went into the lake and I didn't cry."
Red ink: "*It is all right to cry. Sach likho.*"

---

### M11 `last_bell` — Last Bell

- **Chapter 4** · **Fri 21 Nov 2003 (Ramzan), 08:40 → 18:30** · **Giver:** Immu at the
  `school_1` gate · **Requires:** M10 + interlude · **Flags:** `ramzan` · **Music:** `day` →
  silence at the temple → soft `night`
- **Places:** `school_1`, `stationery_1`, `internet_cafe_1`, `photo_studio_1`, `kirana_1`,
  `irani_cafe_7`, `birla_planetarium` (mention), `birla_mandir`, `flower_cart_11`
- **HUD:** `SIDE A ■ PAUSED 812` until the end of the mission.
- **Mechanics:** errands; internet café timer (60 s real); photo; buying "tunnel supplies"; W8
  escort Ammamma up `birla_mandir_steps` (respect); W6 viewpoint reveal (every REC place lights
  up); lock digit 3; Side A resumes.

**Script**

1. `"Immu's last day. Buy a slam book."` — `stationery_1`.
   ```
   stationery_man: Slam book? Twenty-five rupees. "Your crush (optional)" page also there.
   chinnu:         We'll skip that page.
   ```
2. `"Fill the slam book before the last bell."` — a short montage in VII-B (no minigame).
   ```
   vimala_maam: Imran, your diary was the only one with no lies in it. Very boring. I will miss it.
   vimala_maam: And {FULL}. Your diary has a boy who flew over forty roofs. One true line before December, *beta*.
   ayesha:      (writing) Fav place: the crease. Fav person: whoever doesn't call me *doodh-bhaat*.
   immu:        (writing in Chinnu's book) Fav place: where you can see everything we collected at once.
   [sfx]        school_bell: tan-tan-tan
   ```
   The HUD offers `● REC?` Chinnu declines: `chinnu: Not this one.` (No REC.)
3. `"Make email IDs at Cyber Zone (₹20 an hour)."` — `internet_cafe_1`; `dialup` sfx; a 60 s
   on-screen timer the net-uncle sets ("one hour" in story time).
   ```
   net_uncle: One hour, twenty rupees. Timer is on. Don't open any "You have won a lottery" email.
   immu:      Username: agent_immu_2003. Password: bokaata.
   chinnu:    You can't tell me your password!
   immu:      You're my agent. Agents share passwords.
   chinnu:    (typing) chinnu_charminar... it's taken? Who else is Chinnu Charminar?!
   net_uncle: Fifty-nine minutes. No chat rooms. Emails, yes.
   immu:      Now I can write to you from New Jersey. Ten and a half hours late, but I'll write.
   ```
   The addresses are written inside the slam book's back cover (they reappear in 2026).
4. `"Squeeze into one passport photo at Raj Colour Lab."` — `photo_studio_1`.
   ```
   photo_uncle: Sit straight, chin up, *thoda left*... No laughing in passport photos!
   photo_uncle: Arre, both laughing. Again. ...Again. ...Fine. Laughing it is. Ready day after tomorrow.
   ```
5. `"Buy tunnel supplies: a torch and Osmania biscuits."` — Chinnu's plan (the wrong choice, made
   actively): `kirana_1` torch ₹20; `irani_cafe_7` packet of Osmania ₹10.
   ```
   agarwal: Torch? Batteries separate. For what?
   chinnu:  ...Power cuts.
   agarwal: Smart boy. Your Nanna's department, power cuts.
   salim:   Osmania to take away? Going on a journey, chhote?
   chinnu:  Not me.
   ```
6. `"Take Ammamma up Naubat Pahad at sunset."` — W8 up `birla_mandir_steps`: walk only, chappals
   at the stand by `flower_cart_11`; respect zone (meter frozen). On the way, at the
   Planetarium's corner:
   ```
   immu:    (catching up) Planetarium uncle says New Jersey has the same stars. Ten and a half hours late.
   ammamma: Then you will see them first, *kanna*, and tell us if they are fine.
   ```
   At the parapet, W6: the full map dims and **every place where Chinnu pressed ● REC lights up**
   (11 lights), plus nearby hidden kites.
   ```
   ammamma: Listen. What do you hear?
   chinnu:  Nothing. Wind. Traffic, far away.
   ammamma: No bells. They built this temple without bells, so it stays quiet.
   ```
   Lock slot 3: "On the drum hill a white temple stands. How many bells?" [**0**, 1, 4, 108] →
   `1 4 0 1`. The Journal: "Fourteen-one?"
   ```
   ammamma: Your Immu is going, *haa*?
   chinnu:  Ammamma, I'm going to help him hide. In the tunnel. On Chand Raat. He won't have to go.
   ammamma: Kite string, *kanna*. Pull too hard, it snaps. Let it go a little, it flies higher.
   chinnu:  If I let go, he's gone.
   ammamma: If you let go, he flies. And a kite that flies high, the whole city can see. Even from America.
   chinnu:  (a long silence; the lights of the map below)
   chinnu:  Ammamma... can I record here? There's no bell.
   ammamma: Record the wind, *kanna*. God won't mind the wind.
   ```
   `● REC` `kite_wind`. The HUD counter un-greys: `SIDE A 812 → 905`. Toast: "SIDE A ▶ RESUMED".
   Token: **Immu's slam-book page** ("Fav place: where you can see everything we collected at once").

**Clue for M12:** Immu's last tape, dropped through the window on Mon 24 Nov (played at home
when M12 starts).
**Fail / checkpoints:** the internet café timer running out only means "₹20 more, beta" (pay
again or leave); nothing fails. Checkpoints `school`, `net_cafe`, `naubat_pahad`.
**Reward:** ₹10; lock digit 3; Side A resumed.
**J-card:** `TRACK 11 · NO BELLS · NAUBAT PAHAD` — scribble (in Chinnu's hand this time): "the
wind. ammamma says god won't mind."
**Diary:** "Today I heard nothing on a hill, and it was the loudest thing."
Red ink: "*This is almost true. Almost.*"

---

### M12 `chand_raat` — Chand Raat (finale)

- **Chapter 4** · **Tue 25 Nov 2003, 18:30 → 23:30** · **Giver:** `home` (Immu's last tape) ·
  **Requires:** M11 · **Flags:** `ramzan`, `chand_raat` (crescent cut-outs, bulb strings, haleem
  bhattis, bangle crowds; traffic around `charminar_circle` thins after 22:00) · **Music:**
  `oldcity` → `chase` → silence in the storeroom → `ending` (alaap) at the photo
- **Places:** `photo_studio_1` (prints), `laad_bazaar`, `gulzar_houz`, `patang_bazaar`,
  `pathergatti`, `mahboob_chowk_clock_tower`, `charminar`, `charminar_gallery`, `charminar_plaza`,
  `irani_cafe_19`, `recording_centre_1`, `pindi_girni_6` (passed), with `mecca_masjid` and
  `jama_masjid_charminar` as respectful background (during this mission a calm crowd of
  worshippers and a watchman stand at both mosque gates: the player can walk up, the meter
  freezes, but nobody runs in, and the pursuers never path there)
- **Mechanics:** Ask the city (third local answers); W1 chase with **both mothers at level 5**
  (two chappal icons, different sizes; chases stay in the bazaar lanes and plaza); W6 viewpoint
  from the first gallery; dialogue choice; `clap` minigame (`skin:'doorway'`, one round, call and
  answer); W8 walk back; shop (tape dub); W2 ten-second self-timer dash.

**Script**

0. At `photo_studio_1` (on the way): `photo_uncle: Laughing boys, ready. Eight copies. Four each?`
   At home, the tape:
   ```
   immu (tape): Agent Immu to Agent Chinnu. Chand Raat. Both families shopping in Laad Bazaar, seven-thirty.
   immu (tape): At eight o'clock I vanish. The tunnel starts where four towers keep time.
   immu (tape): Don't follow me. ...Okay, follow me. Bring the tin. Over and out.
   ```
   Chinnu takes the tin, the torch and the Osmania packet. Nanna takes his camera ("Frame 24 is
   left. Chand Raat deserves it.").
1. `"Go to Laad Bazaar with both families."` — by auto and Nanna's Chetak to `laad_bazaar`.
   ```
   amma:   Ayesha's mother says the green-and-gold bangles are cheapest here.
   ammi:   "Cheapest" is a lie Laad Bazaar tells every year. Come, I'll show you.
   immu:   (passing Chinnu) Eight o'clock. (he winks behind his taped glasses)
   bangle_man: *Aapa*, new design for Eid! Glass that sings!
   ```
2. 20:00 — `"Immu has vanished. Find him before the mothers find YOU."` A small boy brings the
   families a chit:
   ```
   [chit]  "Imran is safe and eating biscuits. He comes back at eleven. Don't worry. — F."
   ammi:   Safe? Biscuits? Who is F?!
   amma:   {nick} knows. Look at his face. He KNOWS.
   ammi:   {nick}...
   amma:   {FULL}!!
   ```
   Chappal Meter → 5 (Mummy + Ammi, on foot). Both mothers know Immu is safe (an adult has him);
   they are after Chinnu, the accomplice. Clue: "The tunnel starts where four towers keep time."
   **Ask the city** — any three locals (bangle, attar, Patang Chacha, a chai cart at
   `chai_bandi_4`, the `mahboob_chowk_clock_tower` bird-seller); the first two deflect, the third
   always answers:
   ```
   bangle_man:  Four towers? *Mian*, I sell bangles, not towers. Ask the clock man.
   attar_man:   Time? Smell this: timeless. Rose attar. ...Towers? Ask the kite man.
   bird_man:    Mahboob Chowk has ONE clock tower, *beta*. You want four? Count again.
   kite_chacha: Four towers, four clocks: Charminar, *beta*. Every tunnel story in this city starts there.
   kite_chacha: Go up and look. Tell the caretaker Patang Chacha sent you. He owes me a kite.
   ```
   Whoever is asked third gives the answer in their own voice (if it is not Patang Chacha:
   "Four towers, four clocks? Charminar, *beta*. Go up and look. Say Patang Chacha sent you.").
   The first two always deflect with the lines above.
3. `"Climb to Charminar's first gallery. Five minutes."` — at the monument's door:
   ```
   caretaker: Chand Raat, galleries are closed... Patang Chacha sent you? Five minutes. First gallery only.
   caretaker: Walk, don't run. Upstairs is for prayer; nobody goes there.
   ```
   Camera-only climb (fade), then W6 from `charminar_gallery`: the plaza from above, the bulb
   strings, the four clocks lit. The player pans; a **yellow raincoat** ducks into the side door
   of `irani_cafe_19` (mark it). Below, Pasha sets up:
   ```
   pasha:     LIVE from the Charminar tunnel! Camera, roll!
   caretaker: (from the gallery) Camera *band karo!* No tunnel, no nonsense!
   ```
4. `"Get to Café Noor-e-Iran without getting caught."` — W1 through the bazaar lanes and plaza
   (the chase never enters Mecca Masjid or Jama Masjid; their gates are respect zones held by a
   watchman, and pursuers path around them). Pasha follows
   too ("The boy knows the entrance!").
   ```
   babloo: Mamu! Tunnel entrance! Near the haleem bhatti!
   pasha:  (stopping at the bhatti, sniffing) ...One plate. For research.
   amma:   (level 5, the chappal raised) {FULL}! Stop RIGHT there!
   ammi:   {nick}! I can see you behind that bangle shop!
   ```
   The homing chappal is dodgeable as usual. Caught here = `PAKDA GAYA!`, but the scene plays on
   (the mothers march Chinnu to the café: "Show us where he is."). Escaped = Chinnu arrives alone.
5. `"Find Immu."` — `irani_cafe_19`.
   ```
   faramarz: *Aa gaye?* Thirty-five minutes. Imran said you'd take forty.
   chinnu:   Where is he, uncle?
   faramarz: (nods at the back) The stair that goes to Golconda. One step down.
   ```
   The "cellar" is a bright biscuit storeroom one step down: tube light, tins to the ceiling, a
   flour sack. Immu sits on it in his yellow raincoat, eating Osmania.
   ```
   immu:   You're late, Agent.
   chinnu: You're in a biscuit room.
   immu:   It's a biscuit tunnel. Very short.
   chinnu: There's no tunnel, Immu.
   immu:   I know.
   chinnu: You knew?
   immu:   Since Golconda. The guide said "they say" two times.
   immu:   But if I come out, the plane takes me. If I stay, maybe Ammi cries and Abba says okay, stay.
   ```
   **Choice** (Chinnu): ["Clap him out. Walk back together.", "Keep the secret. Stay hidden with him."]
   - *Keep the secret*:
     ```
     [text]  Chinnu sits down on the flour sack. They eat biscuits. Outside, faintly, Ammi's voice: "Imran... beta..."
     [text]  It isn't angry any more.
     immu:   (looking at the door) ...
     chinnu: Ammamma says: pull too hard, the string snaps.
     immu:   Your Ammamma says many things.
     chinnu: Let it go a little, it flies higher.
     ```
     The choice returns with one option: ["Clap him out."]
   - *Clap him out*: minigame `clap` (`skin:'doorway'`, `rounds: 1`): Chinnu claps the Golconda
     rhythm in the storeroom doorway; Immu answers.
     ```
     chinnu: Golconda heard us. America will also hear.
     immu:   (stands, brushes off crumbs) Walk with me? Till the plaza.
     chinnu: Till the plaza. After that I'll walk with you in my head, the rest of the way.
     ```
6. `"Walk Immu back to the plaza."` — W8 (no running): the Chappal Meter drains one slipper every
   5 s while the two walk side by side. On the plaza:
   ```
   [text]  Mummy arrives with the chappal raised. Then she hugs him, without putting the chappal down.
   amma:   {FULL}. ...Idiot. Come here.
   ammi:   Biscuits? In Faramarz-bhai's storeroom? Your Abba used to hide there too.
   abba:   ...1979. Before my SSC exams.
   faramarz: So many boys have hidden in that storeroom. Not all went to America. Some went to Kukatpally.
   ```
7. `"Get Side A copied at Raag Recording Centre (₹30)."` — `recording_centre_1`.
   ```
   recording_man: Copy of a home recording? Thirty rupees. Ten minutes. Chand Raat rush, fifteen.
   immu:          The original comes with me. The copy stays in the tin. Agent rules.
   ```
8. `"Give the tin to Faramarz uncle."` — Chinnu puts in the copy tape, one laughing passport
   photo and Immu's slam-book page with the other tokens. Immu snaps the brass lock.
   ```
   immu:     The combination is the day we started. You'll remember. Agent rules.
   faramarz: (taking the tin) *Kitte din rakhun?* (How long do I keep it?)
   chinnu + immu: Till we come back. *Pakka.*
   faramarz: Top shelf. Next to my father's biscuit tin from Yazd. Good company.
   ```
9. `"The last photo: set Nanna's camera on a tin. Ten seconds."` — Chinnu props the camera on a
   Karachi Bakery tin (Ammi's, bought for relatives) on the café step, Charminar lit behind. He
   presses the self-timer: a 10 s W2 dash. Nanna steps **back** to check the focus, out of
   twenty years' habit. The player must reach Nanna (ACTION) and drag him into the frame before
   the timer ends (failure = the timer resets, "Again!", no penalty).
   ```
   nanna:  I'll just check the focus...
   chinnu: NANNA, *NUVVU KOODA!*
   [text]  Nanna runs. Amma, seeing her son sprint across the plaza, throws, out of pure habit.
   [sfx]   beep-beep-beep... camera_flash
   ```
   `● REC` `bangles` (and pigeons). Counter **999**. Frame **F24** is taken.
   Print card (shown when the prints come back on Thu 27 Nov): "Orange date stamp `'03 11 25`.
   Chinnu a blur. Nanna laughing mid-stride. A chappal frozen in the air above everyone. Immu in
   a yellow raincoat. Ayesha bowling an imaginary ball. Faramarz uncle in the doorway. Charminar
   lit up behind them."

**MISSION PASSED** → the Ending (§9) plays straight on.
**Fail / checkpoints:** nothing in M12 can fail: being caught, losing the self-timer race and the
"keep the secret" choice all loop back. Checkpoints `laad_bazaar`, `gallery`, `cafe`, `photo`.
**Reward:** ₹51 *Eidi* (from Ammi on Eid morning, given in the ending); the `ending` song is
added to the walkman.
**J-card:** `TRACK 12 · CHAND RAAT · CHARMINAR` — scribble: "999. Full. —I & C"
**Diary (last entry, written in December):** "Truth: I did nothing big. I recorded one city on
one tape and walked my friend back to his Ammi. Nanna is in the photo."
Red ink: "*10/10. Pehli baar sach.*" (The first time, the truth.)

---

## 5. Clue chain overview

Every clue points at something drawn and visible on the map or minimap. Each has the four hint
tiers in §1.6 (Ammamma, Yadagiri ₹5, Aunty network +1 meter, Ask the city in the Old City).

| # | Clue (exact text) | Given | Solution | Why it is solvable |
|---|---|---|---|---|
| 1 | "Every capsule needs a box. Find the clock tower that talks with half its faces; buy a tin that smells of fruit." | end of M1 | `mozamjahi_market` + `karachi_bakery` | The octagonal tower with clocks on alternate faces is drawn at the junction and is the area's tallest thing; the bakery sign is beside it; "fruit" = fruit biscuits |
| 2 | "The crossroads named after the red buses shows films, not buses. Saturday, before sunrise, the most-garlanded hero keeps our tape at his feet." | end of M2 | `rtc_x_roads` → `sandhya_theatre` | RTC is the red buses' corporation (glossary card); the four cinemas with giant cut-outs are the map's brightest cluster; garland counts float over each cut-out |
| 3 | "Four tall uncles with light-bulb heads guard a field." | end of M3 | `lb_stadium` | Four lattice floodlight towers stand at the stadium's corners, the tallest objects in Basheerbagh, visible from the colony |
| 4 | "Her bus leaves from a tamarind grove with no trees, only buses." | end of M4 | `imlibun_bus_station` | The map label says Imlibun; *imli* = tamarind is in the glossary; the station is the biggest bus yard by the river |
| 5 | "Clap at a gate and a king hears you on the hill." | end of M5 | `golconda_fateh_darwaza` → `golconda_bala_hissar` | Golconda is the fort on a hill in the west; solved in story by Ammamma's 1961 memory (M6) |
| 6 | "The tunnel starts where four towers keep time." | M7 summit | `charminar` | Four minarets, four clock faces; asked again in M12 with Ask the city |
| 7 | "Lorry behind the station dressed as a palace. Look for the peacock." | end of M9 | `kachiguda_station` → `chappal_bazar` | Kachiguda is the only station drawn with domes, minarets and chhatris; the lorry has a painted peacock |
| 8 | "Count the great ones from the Lumbini end. At seven, look down. Then ask the man in the lake." | M10 | `tank_bund_statues` (7th plinth) → `buddha_statue` | Twelve plinths in a row; the HUD counts; the Buddha is the only figure standing in the water |
| 9 | "Fav place: where you can see everything we collected at once." | M11 slam book | `birla_mandir` parapet | The highest point beside the lake; Ammamma is going there anyway; the viewpoint lights every REC place |
| L1-L4 | The four lock riddles (§1.6) | M2, M4, M10, M11 | 1-4-0-1 | Each is answered on the spot by looking (clocks, the mummy, the bells, the boatman) |

---

## 6. Hidden collectibles

Five series, **93 items** plus the story frame. All appear in the Journal with the hint text once
the series is unlocked; `N.audio.beacon` beeps when the player is within 120 u of an unfound one
(toggle in settings). Collecting plays `pickup`; trivia cards open in the Journal.

### 6.1 Patang Chacha's Rooftop Kites (12) — unlocked in M1

Each kite's tail tag hints at the next. Viewpoints blip nearby kites. **Payoff:** in the ending
every found kite rises from Patang Chacha's roof into the floodlight beside Charminar; with all
12 the train is "a fifth minar of paper".

| # | Kite | Spot (place id) | Journal hint | Tail tag (points to the next) | Revealed by |
|---|---|---|---|---|---|
| K1 | Moon-and-star, green | `gulzar_houz` (`hide_gulzar_houz_ledge`) | "On the fountain railing, tail in the water." | "Next: where the red buses sleep under a tin sky." | M1 (tutorial) |
| K2 | Red half-and-half | `gowliguda_hangar` | "On the hangar's back rib, above the last bus." | "Next: the giant wheel saw me fall behind the papad." | — |
| K3 | Yellow with a black eye | `nampally_exhibition` (`hide_numaish_corner`) | "Behind the giant wheel's ticket box." | "Next: four tall uncles with bulb heads caught my string." | giant wheel (M2) |
| K4 | Tiranga stripes | `lb_stadium` (`hide_lb_stand`) | "Behind the west stand, in a floodlight's noon shadow." | "Next: the drum hill's white crown. The neem at the foot of the stairs." | Birla parapet |
| K5 | Pink paper, white tail | `birla_mandir` (neem at the foot of `birla_mandir_steps`, outside the gate) | "In the neem by the chappal stand. Ask nicely." | "Next: across the water, a fence says COMING SOON. Squeeze through the gap." | Birla parapet |
| K6 | Blue box kite | `prasads_imax` (inside the fence gap before 25 Jul; in the forecourt palm after) | "Through the tin fence, on a sand heap." | "Next: lunch in the tallest tree, made of cement." | Birla parapet, Prasads lobby |
| K7 | Orange tukkal | `ntr_gardens` (`hide_ntr_lawn`) | "Under the concrete tree's lowest branch." | "Next: the bund of great people. The arch at the Secunderabad end holds my string." | Prasads lobby, Birla parapet |
| K8 | Purple with gold edges | `tank_bund` (north Kakatiya arch) | "Tied to the arch's carved bracket." | "Next: the glass building with four quarters and a fountain. A crane caught me." | — |
| K9 | Silver paper | `cyber_towers` (`hide_cyber_fountain`) | "By the forecourt fountain, under a builder's crane." | "Next: a secret lake hides in the rocks behind the glass. Biggest boulder." | — |
| K10 | Sky-blue, no tail | `durgam_cheruvu` (`hide_durgam_rocks`) | "On top of the boulder that looks like a sleeping buffalo." | "Next: the king's clap gate. Climb till the city looks like a carrom board." | — |
| K11 | Maroon with a moon | `golconda_fort` (`hide_golconda_bastion`) | "On a quiet bastion's crenel." | "Next: the palace that is a mirror of the sky. Its gate is locked; its hill is not." | Bala Hissar (M7) |
| K12 | Gold and green, Chacha's best | `falaknuma_palace` (`hide_falaknuma_hill`) | "On the hill path below the locked gate." | "Last one. Bring all twelve to Gulzar Houz before Chand Raat. — Chacha" | Falaknuma gate |

Found kites go to Patang Chacha automatically (they are listed in the Journal). Kites found
after M12 still count for the free-roam total but not for the ending. Rewards: 4 kites → ₹10; 8 → a free charkhi of saddi (kite minigame +difficulty headroom); 12 →
Patang Chacha's line in M12 changes ("All twelve? Then tonight you'll see something.") and the
full kite train in the ending.

### 6.2 Golis (30) — unlocked after M1

Marbles tucked into the city's corners. Rewards: **10** → ₹10 and *Marbles vs Tiger* at
`playground_14` (`marbles` minigame); **20** → the *Raja goli* striker (better aim in `marbles`);
**30** → ₹50, Journal title "Goli King of Hyderabad", a marble pouch on Chinnu's sprite.

| # | Goli | Spot | Hint |
|---|---|---|---|
| G01 | Clear *paani* goli | `hide_home_colony_ground` | "Under the slide, where the steel burns at noon." |
| G02 | Green cat's-eye | `hide_home_lane` | "Behind the colony water tank, where the motor hums." |
| G03 | Red swirl | `hide_ashok_nagar_ground` | "Tiger's ground. Under the bowler's brick at the far end." |
| G04 | Milky *doodhiya* | `hide_vidyanagar_ground` | "In the crack of the Vidyanagar ground's boundary wall." |
| G05 | Blue cat's-eye | `hide_nallakunta_ground` | "Behind the stumps someone chalked on a wall." |
| G06 | Yellow swirl | `hide_public_gardens_tree` | "In the banyan's roots, where the *mali* naps." |
| G07 | Pearl | `hide_mj_steps` | "Mozamjahi's back steps, under the ice-cream boy's stool." |
| G08 | Tiny *chhotu* | `hide_nayapul_sand` | "Under Naya Pul, in the sand where the saris dry." |
| G09 | Brown tiger's-eye | `hide_puranapul_sand` | "On the riverbed beside the oldest bridge." |
| G10 | Two-colour twist | `hide_chaderghat_sand` | "Inside a cricket pitch drawn in the Chaderghat sand." |
| G11 | Orange flame | `hide_charminar_corner` | "Charminar plaza, south-east corner, by the pigeon-feed man." |
| G12 | Smoky grey | `hide_chowmahalla_wall` | "Along the locked palace wall, under a loose stone." |
| G13 | Balloon-pink | `hide_lumbini_hedge` | "Lumbini's hedge corner, where the balloon man sits." |
| G14 | Moss green | `hide_indira_rock` | "Indira Park, in the rock that looks like a sleeping dog." |
| G15 | Lake blue | `hide_sanjeevaiah_bench` | "Sanjeevaiah Park, under the last bench before the water." |
| G16 | Clock-face white | `hide_clock_tower_park` | "Clock Tower park, under the bench that faces the café." |
| G17 | Army khaki | `hide_parade_grounds` | "Far corner of the Parade Grounds, where nobody marches." |
| G18 | Aeroplane silver | `hide_airport_fence` | "Begumpet fence. The planes come so low you can count the windows." |
| G19 | Rock-pink | `hide_banjara_lake` | "Banjara Lake, by the flat rock at the water's edge." |
| G20 | Peacock blue-green | `hide_kbr_trail` | "KBR Park trail, where the peacock crosses." |
| G21 | Clay red | `hide_shilparamam_hut` | "Shilparamam, on the step of the potter's hut." |
| G22 | Brand-new shiny | `hide_gachibowli` | "The new stadium's car park. Very new. Very empty." |
| G23 | Granite speckle | `hide_golconda_court` | "Golconda's inner court, where the guide stops talking." |
| G24 | Rope-gold | `hide_taramati` | "Taramati Baradari steps, where they say a dancer walked on a rope." |
| G25 | Toy-train red | `hide_zoo_pond` | "Nehru Zoo, by the pond where the toy train turns." |
| G26 | Dam-arch grey | `hide_mir_alam` | "Mir Alam Tank, below the arches of the old dam." |
| G27 | Elephant grey | `hide_ou_campus` | "OU campus, the boulder shaped like a sleeping elephant." |
| G28 | Railway black | `hide_safilguda` | "Safilguda lake bank, the railway-colony side." |
| G29 | Horseshoe bronze | `hide_race_course` | "Race course rail, where the horses gallop at dawn." |
| G30 | *Raja goli* (jackpot) | `hide_saroornagar_lake` | "Saroornagar bund, by the first boat. The king of marbles." |

### 6.3 Cassettes (16) — `cassette_1`..`cassette_16`, unlocked with the walkman

Twelve **dedication tapes** (recorded off the radio, with the DJ reading a listener's *farmaish*;
each unlocks a walkman song) and four **Agent tapes** (Immu's voice memos). No lyrics anywhere.
**Payoff:** in the 2026 epilogue, Side B ends with "the tapes you found and gave me in 2003":
each found dedication plays as one line; each missed one is tape hiss. All four Agent tapes
found: Imran says "You found all four? Agent, you are promoted."

| # | Id | Song unlocked (audio `SONGS` id) | Spot | Hint | Dedication / memo (text) |
|---|---|---|---|---|---|
| C01 | `cassette_1` | `r_chandni` Chandni Raat Ka Cycle | `bus_stop_10` | "On the Himayatnagar stop bench, in its paper cover." | "From Pinky of Malakpet, for her Nani in Kurnool: 'Nani, the pickle reached. Send more.'" |
| C02 | `cassette_2` | `r_barish` Baarish Mein Irani Chai | `std_4` | "On top of the Abids STD meter. Somebody talked too long." | "From the Lakdikapul Morning Walkers, for the uncle who walks backwards: 'Get well soon. Your knee is famous.'" |
| C03 | `cassette_3` | `r_baraat` Baraat Express | `playground_8` | "Saidabad maidan, under the band's drum stand." | "For Saidabad's Lucky Star Band, from every baraat they made late: 'Thank you. We are still dancing.'" |
| C04 | `cassette_4` | `festival` Teenmaar Toofan | `dhoolpet` | "In an idol shed, beside a half-painted Ganesh." | "Dhoolpet's idol painters, to the colony boys: 'Bring your lorry on time this year!'" |
| C05 | `cassette_5` | `r_neon` Neon Monsoon | `ameerpet_coaching` | "Under a JAVA banner, dropped by a sleepy student." | "From the 7 pm Java batch to their sir: 'Sir, we understood nothing, but we love you.'" |
| C06 | `cassette_6` | `r_pager` Pager Pe Message | `chenoy_trade_centre` | "In a box of beige keyboards on the cellar stairs." | "From a boy in Parklane to his father: 'Papa, the computer is fine. I only opened it to see inside.'" |
| C07 | `cassette_7` | `day` Cycle Pe Sawaari | `recording_centre_1` | "On the counter: 'Free sample. Take one.'" | "From Raju of the chai bandi, Himayatnagar, to everyone who drinks on credit: 'Please. Pay.'" |
| C08 | `cassette_8` | `night` Chandni Chhat | `blue_sea_cafe` | "Left on a marble table by a man running for a train." | "From a soldier at Secunderabad station to his mother in Warangal: 'Train is late. Heart is on time.'" |
| C09 | `cassette_9` | `oldcity` Gulzar Houz Ki Shaam | `pathergatti` | "In the stone arcade, at the tape stall's 'old stock' basket." | "From the bangle sellers of Laad Bazaar, to every *aapa* who bargained: 'You won. Come again.'" |
| C10 | `cassette_10` | `kites` Patang Ki Pech | `abids_book_market` (Sundays only) | "In a stack of old comics. Sundays only." | "From the Abids Sunday book men, to the boy who reads comics standing up: 'Buy one, at least!'" |
| C11 | `cassette_11` | `numaish` Numaish Ka Jhoola | `nampally_exhibition` | "At the lost-and-found counter (after M2, all year)." | "From the Numaish loudspeaker uncle: 'To all the lost children of 2003: you were never lost. You were near the papad.'" |
| C12 | `cassette_12` | `title` Yaadon Ki Gully | `gymkhana_ground_secunderabad` | "On the old pavilion step." | "From an old ground-man to the girls who bowl at dawn: 'Keep coming.'" |
| C13 | `cassette_13` | Agent tape 1 | `home_terrace` | "Inside the water-tank lid. Immu's handwriting: AGENT." | "Agent Immu's Secret Fact No. 1: Chinnu sleeps with his mouth open. Over." |
| C14 | `cassette_14` | Agent tape 2 | `irani_cafe_7` | "Behind the jukebox at Café Gulistan." | "Fact No. 2: Salim-bhai gives an extra biscuit if you say his chai is the best in Hyderabad. Over." |
| C15 | `cassette_15` | Agent tape 3 | `school_1` | "Taped under the ice-gola cart at the school gate." | "Fact No. 3: Vimala Ma'am smiles once a year. I have seen it. It was a Tuesday. Over." |
| C16 | `cassette_16` | Agent tape 4 | `playground_1` | "Under the cement bench at the colony ground." | "Fact No. 4: best friends don't say goodbye. They say 'over'. Over." |

The `ending` song (`Charminar Ki Chaon`) is added automatically after M12. Rewards: 6 tapes → ₹10;
all 12 dedication tapes → on the flight night Deccan Vani reads Chinnu's own *farmaish* (§9.1).

### 6.4 Ticket Thatha's punched tickets (12) — unlocked in M5

Hidden behind the painted boards of bus stops. The Journal shows Thatha's stage riddle; the
ticket's back is a verified trivia card. Each ticket unlocks that stop for bus fast travel (from
`koti_bus_stand`, `imlibun_bus_station`, `rathifile_bus_station`, `mehdipatnam_bus_terminus`).
**6** → ₹20; **12** → Thatha's old ticket punch (item) and free bus rides.

| # | Stop | Thatha's riddle | Trivia card [V] |
|---|---|---|---|
| T01 | `bus_stop_1` Koti | "Stage 1: where a British mansion became a college." | Koti gets its name from the British Residency's *kothi* (mansion) of 1803, a women's college since 1949. |
| T02 | `bus_stop_2` Abids | "Stage 2: where the footpath turns into a library every Sunday." | Every Sunday the pavements of Abids become a second-hand book market. |
| T03 | `bus_stop_3` Nampally | "Stage 3: where the fair moved to in 1946." | Numaish began in 1938 at Public Gardens and moved to the Nampally grounds in 1946. |
| T04 | `bus_stop_4` Lakdikapul | "Stage 4: the bridge named after wood." | Lakdikapul means "wooden bridge", after a bridge over the railway partly made of wood. |
| T05 | `bus_stop_5` Mehdipatnam | "Stage 5: where farmers sell with no middlemen." | Rythu Bazaars opened on Republic Day 1999 so farmers could sell straight to shoppers. |
| T06 | `bus_stop_7` Paradise | "Stage 6: named after a canteen next to a cinema." | Paradise began in 1953 as a canteen beside the Paradise cinema, and the junction took its name. |
| T07 | `bus_stop_8` Secunderabad | "Stage 7: the station older than every bus." | Secunderabad station opened on 9 October 1874, built by the Nizam's Guaranteed State Railway. |
| T08 | `bus_stop_9` RTC X Roads | "Stage 8: named after my own office." | RTC X Roads takes its name from Bus Bhavan, the bus corporation's headquarters nearby. |
| T09 | `bus_stop_13` Charminar | "Stage 9: where four clocks came three hundred years late." | Charminar's four clocks were added in 1889, about 300 years after it was built. |
| T10 | `bus_stop_14` Tank Bund | "Stage 10: a lake older than Charminar." | Hussain Sagar was built in 1562, almost thirty years before Charminar. |
| T11 | `bus_stop_17` Afzalgunj | "Stage 11: where the judges sit in striped stone." | The High Court on the Musi's south bank opened on 20 April 1920. |
| T12 | `bus_stop_18` Khairatabad | "Stage 12: the place named after a princess." | Khairatabad is named after Princess Khairunnisa, who completed its mosque in 1626. |

### 6.5 Frames (24) — Nanna's camera, unlocked at the end of M1

One roll, 24 exposures. Frames 1 to 23 are photo riddles in any order: stand at the spot (within
40 u, outside any respect zone; temples, mosques and churches are photographed from the road) and
press ACTION "Click" (`camera_flash`). Develop at `photo_studio_1`: ₹2 a frame, "ready day after
tomorrow" (two in-game days, or after the next mission). Each print fills Nanna's album in the
Journal and opens a trivia card. Frame 24 is reserved for Chand Raat (M12). **8** prints → ₹15;
**16** → Nanna's handwritten captions appear in the album; **23** → Raj-uncle frames your best
print on Café Gulistan's wall and the Journal title "Colony Photographer". **Payoff:** in 2026 Amma
brings the album; missed frames are empty photo corners.

| # | Riddle | Spot | Trivia card [V] |
|---|---|---|---|
| F01 | "The market named after a prince." | `mozamjahi_market` | Mozamjahi Market (1935) is named after Prince Moazzam Jah, a son of the last Nizam. |
| F02 | "The station dressed as a palace." | `kachiguda_station` | Kachiguda station opened on 10 June 1916 as the headquarters of the Nizam's own railway. |
| F03 | "The platform where trains stop for good." | `nampally_station` | Nampally station was built in 1907 but waited until 1921 for its first passenger train. |
| F04 | "The white crown on the drum hill (from the road below)." | `birla_mandir` (Saifabad road) | Birla Mandir took about ten years to build and opened in 1976. |
| F05 | "The white dome that keeps a sky inside." | `birla_planetarium` | Birla Planetarium opened on 8 September 1985. |
| F06 | "The glass building the grown-ups call 'the future'." | `cyber_towers` | Cyber Towers was opened on 22 November 1998. |
| F07 | "The man in the lake." | `buddha_statue` (from `lumbini_jetty` or a boat) | The Buddha is about 18 m tall, carved from one block of white granite found near Bhongir. |
| F08 | "Lunch in the tallest tree, made of cement." | `ntr_gardens` | NTR Gardens grew on the site of the old Hussain Sagar power station, demolished in 1995. |
| F09 | "The screen so big it parked beside a lake." (from 25 Jul) | `prasads_imax` | Prasads opened on 25 July 2003 as India's third IMAX theatre. |
| F10 | "The gate that carries a clap up a hill." | `golconda_fateh_darwaza` | A clap under Golconda's entrance dome can be heard at the Bala Hissar, about 1 km away. |
| F11 | "Kings asleep under onion domes (from the road)." | `qutb_shahi_tombs` | The Qutb Shahi Tombs hold five of the seven Qutb Shahi sultans. |
| F12 | "The clock where a little man strikes the hour." | `salar_jung_museum` | At the Salar Jung Museum's musical clock, a small figure comes out every hour and strikes the gong. |
| F13 | "Lions you watch from a bus." | `nehru_zoo` | Nehru Zoological Park opened on 6 October 1963; its lion safari began in 1974. |
| F14 | "The college with a face like a temple and a palace." | `osmania_university` | Osmania University's Arts College, designed by Ernest Jasper, opened on 4 December 1939. |
| F15 | "The stone tower in a park, across the lake." | `secunderabad_clock_tower` | Secunderabad Clock Tower was built in 1896 and opened on 1 February 1897. |
| F16 | "The mirror of the sky (from the gate)." | `falaknuma_palace` | Falaknuma means "mirror of the sky"; the palace is built in the shape of a scorpion. |
| F17 | "Four palaces behind one locked gate." | `chowmahalla_palace` | Chowmahalla's durbar hall, the Khilwat Mubarak, has 19 Belgian crystal chandeliers. |
| F18 | "The bridge that outlived the great flood." | `purana_pul` | Purana Pul (1578) was the only bridge to survive the Great Musi Flood of 1908. |
| F19 | "Four uncles with light-bulb heads." | `lb_stadium` | LB Stadium's old name, Fateh Maidan, comes from the Mughal camp of the 1687 siege of Golconda. |
| F20 | "The white birthday present." | `assembly` | The old Assembly (1905 to 1913) was built as a Town Hall, paid for by citizens for Nizam Mahbub Ali Khan's 40th birthday. |
| F21 | "The great ones in a row." | `tank_bund_statues` | The bronze statues of Telugu greats on Tank Bund went up in the 1980s. |
| F22 | "A mosque with spires instead of domes (from the road)." | `spanish_mosque` | Begumpet's Spanish Mosque, built by a Paigah noble around 1900 to 1906, has pointed spires instead of domes. |
| F23 | "Twin towers in Gunfoundry." | `st_josephs_cathedral` | St. Joseph's Cathedral opened on Christmas Eve 1875; its twin towers came in 1891. |
| F24 | (story) "Chand Raat, Charminar, ten seconds." | `charminar_plaza` | The print: date stamp `'03 11 25`, Nanna in the frame. |

### 6.6 Thresholds and finale payoffs at a glance

| Series | Count | Small rewards | Story payoff |
|---|---|---|---|
| Rooftop Kites | 12 | ₹10 at 4, a charkhi at 8 | The kite train over Charminar on the flight night (§9.1) |
| Golis | 30 | ₹10, marbles game, Raja goli, ₹50 + title | Marble pouch on the sprite |
| Cassettes | 16 | songs; ₹10 at 6 | Side B's tail in 2026; Chinnu's own farmaish on the radio |
| Tickets | 12 | fast travel; ₹20 at 6; punch + free rides at 12 | Ticket Thatha waves the boys off on the flight night |
| Frames | 23 (+1) | ₹15 at 8; captions; framed print | Nanna's album in 2026 |
| The Lock | 4 digits | — | Dialling 1-4-0-1 in 2026 |

---

## 7. Side activities and odd jobs

Six full side activities plus two seasonal ones. Givers are pulsing yellow markers. None can be
failed permanently; a failed attempt can be retried the next valid day or night.

### SA1 `pandal_duty` — Pandal Duty

- **When/where:** nights 31 Aug to 8 Sep, 21:00 to 23:30, `playground_1` (colony Ganesh pandal).
  Giver: Bunty, "Committee President" badge pinned to his denim jacket.
- **Framing:** every colony guards its Ganesh all week; the Ashok Nagar boys try a "laddu raid".
- **Night 1, chanda round (W2, 120 s):** collect donations from `kirana_1` (₹11), `pindi_girni_1`
  (₹11), `irani_cafe_7` (₹21), `medical_shop_8` (₹11) and `friend_home` (₹51).
- **Nights 2 to 4, the watch (W9 tag):** the ground is dark except Chinnu's torch cone; three
  raiders sneak in from the edges; tag each before they reach the laddu (60 s).
- **Reward:** ₹10 a night; laddu prasadam (energy +30); after night 4 Tiger's gang helps push the
  lorry in M10 (cameo).
```
bunty:   Committee rule: one boy guards the laddu all night. Tonight, you. I'm guarding the committee.
agarwal: Chanda? Eleven rupees. And tell Ramulu I gave eleven. Not ten. Eleven.
ramulu:  Eleven? Then I give eleven. And one coconut extra. Tell him that.
salim:   Twenty-one, from the café. Ganpati likes Osmania also, I think.
abba:    Chanda? *Lo.* Ganpati is our neighbour too. Fifty-one. Don't tell Imran, he'll want a commission.
tiger:   We're not stealing. We're... inspecting your laddu.
chinnu:  Inspect from your own ground!
tiger:   (caught, grinning) Okay, okay. Our laddu is smaller. Respect.
```

### SA2 `current_poyindi` — Current Poyindi!

- **When/where:** after M4, any evening 19:00 to 21:00 with a 30% chance (never on festival
  days); the colony goes dark (night overlay at full strength, only lamps and torches).
- **Framing:** Nanna is at the sub-station; the colony shouts his name.
- **Steps:** buy candles at `kirana_1` (₹5), deliver one to five terraces in 90 s (W2, light radius
  only); then on `home_terrace` turn the antenna back toward the `doordarshan_kendra` tower
  (`antenna` minigame) so the Sunday film works when the power returns.
- **Reward:** ₹5 and a toffee; on the third completion Nanna gives Chinnu a pocket torch.
```
aunty:       *Current poyindi!* Sreenivas-garu, *emaindi?!*
chinnu:      Nanna is fixing it. He always fixes it. Then everybody forgets.
agarwal:     Candles? Five rupees. Light one for your Nanna. He works in the dark so we don't sit in it.
cable_babji: Antenna fell again? *Thoda left*... the tower is that way, Ramanthapur, where the red light blinks... AARA!
nanna:       (later, at the gate) Current came. Who is watching TV without me?
```

### SA3 `sunday_mutton` — Sunday Mutton Queue

- **When/where:** Sundays 07:00 to 09:30, from February. `meat_shop_1` (shopfront, cages and
  queue only; nothing gory), `medical_shop_8`, `iyengar_bakery_1`, `dosa_bandi_1`.
- **Framing:** Nanna's Sunday errand. He keeps his place by sending Chinnu to stand in it.
- **Steps:** hold the place (W5 queue: two uncles try to slip in "just to ask the rate"); carry
  the newspaper-wrapped parcel home upright (light W3); pick up Ammamma's balm at the chemist;
  reward stop at the Iyengar bakery.
- **Reward:** ₹5, honey cake (energy +15); the third Sunday unlocks a dosa breakfast with Nanna.
```
nanna:       Hold my place. I'm only going to discuss the score.
uncle:       Score? It's Sunday morning. There's no match.
nanna:       There is always a score.
meat_man:    Don't come inside, *baba*. Stand outside. I'll bring it.
chemist:     Balm for Ammamma? And no, the churan goli is not for Ammamma.
bakery_lady: Honey cake just out. Look at that jam! We're from Bangalore, you're from Hyderabad. Friends, but the cake isn't free.
```

### SA4 `six_balls` — Six Balls

- **When/where:** summer holidays, 26 Apr to 11 Jun, dawn 06:00 to 07:30. `lb_stadium` /
  `fateh_maidan` (the summer camp), `public_gardens` (dawn nets), `jawahar_bal_bhavan` (the camp
  notice board).
- **Framing:** Ayesha's own story. The camp coach turns her away: the girls' batch is badminton.
- **Steps:** three dawn sessions on the Public Gardens back lawn, dodging the *mali*: bat against
  Ayesha (`cricket`, `bowler:'ayesha'`, higher difficulty); win two of three; then the cutscene
  challenge at the camp: Ayesha bowls six balls at the camp's best batsman and takes his stumps
  with the sixth.
- **Reward:** ₹20; Ayesha's cap gets a camp badge; from June she appears in the LB nets at dawn.
```
coach:  Girls' batch is badminton.
ayesha: Girls' batch is badminton? Fine. I'll bowl with a racket.
mali:   *Ghaas pe nakko!* ...Who taught that girl to bowl like that?
ayesha: Nobody. That's why it works.
coach:  (after the sixth ball) ...Next year, there is a girls' batch for cricket. You are its captain.
ayesha: This year.
coach:  ...This year.
```

### SA5 `twelve_oclock` — The Twelve O'Clock Gong

- **When/where:** any day 11:25 to 12:00 after M5. `salar_jung_museum`.
- **Framing:** Chitti's class trip; she insists Annayya must be there when the little man strikes
  twelve.
- **Steps:** a W2 race from wherever you accept it to the museum by 12:00 game time; inside, walk
  only (museum rule); watch the clock as the `gong` sfx strikes twelve times.
- **Reward:** ₹10; F12 is pre-framed (a free development); trivia card: "The marble Veiled
  Rebecca at the Salar Jung Museum was bought in Rome in 1876." [V]
```
chitti: If the little man strikes twelve and you're not there, *Mummy ki cheppesta*.
guard:  Running in the museum? *Nakko.* Walk fast, but walk.
chitti: He hit the gong twelve times and nobody told him to stop!
chinnu: That's his job, Chitti.
chitti: I want that job.
```

### SA6 `bunty_races` — Bunty-anna's Races

- **When/where:** after M3, 16:00 to 19:00. R1 Tank Bund (`tank_bund`), R2 Necklace Road at sunset
  (`necklace_road`), R3 OU campus loop (start at `chai_bandi_3`, `osmania_university`), R4 HITEC
  City's empty new roads (`cyber_towers` to `hitex`). Chinnu on a hired cycle or Luna, Bunty on
  the RX100 with a handicap.
- **Reward:** ₹10 / ₹15 / ₹20 / ₹25; after R4 Bunty lends his RX100 for free roam "only on
  Sundays, only with a helmet, only if Mummy doesn't know" (it never raises the meter by itself).
```
bunty: Word of the day: nostalgia. Means the smell of a new RX100. (R1)
bunty: OU canteen chai is the best chai in Asia. I have not been to Asia, but I'm sure. (R3)
bunty: See these roads? Empty. In ten years, traffic. Onsite, *mamu*. Everybody's going onsite. (R4)
bunty: You beat me? On a cycle? ...I let you. Nostalgia. (lost)
```

### SA7 `new_class_old_books` — New Class, Old Books (seasonal)

- **When/where:** 8 to 11 Jun. `koti_book_bazaar`, `stationery_4`, `home`.
- **Steps:** buy last year's class VII textbooks on the footpath (`bargain`, `who:'books'`, falls
  back to the `auto` skin); brown cover paper (₹10 for ten sheets) and name labels at the Koti
  textbook stall; a home cutscene of covering them (Chitti draws a moustache on one label).
- **Reward:** ₹10; toast: "That new-book smell."
```
book_man:       Seventh class, full set, half price. Guide also? Guide is extra, but guide has the answers.
stationery_man: Brown cover, how many sheets? Take labels also, for your name. Write neat.
amma:           Cover them properly, {nick}. Corners folded. Not like last year, like a samosa.
```

### SA8 `christmas_stars` — Christmas Stars (post-game, December 2003)

- **When/where:** in the post-credits free roam, 20 to 25 Dec. `iyengar_bakery_2` (plum cakes) to
  four church compounds: `church_st_marys`, `church_wesley`, `st_johns_church_secunderabad`,
  `st_josephs_cathedral` (respect zones: leave the cake on the gate table, walk only). Then
  `internet_cafe_1`.
- **Reward:** ₹20, a paper star lantern on `home`'s balcony, and **Immu's first email**:
```
[email] From: agent_immu_2003   To: chinnu_charminar2
        "Agent Chinnu. New Jersey report. It is cold. The gas station is real.
         They have no Osmania biscuits. I clapped in the school gym. Nothing came back. Over.
         PS: tell Faramarz uncle the tin is not a biscuit tin. Don't let him serve it."
carol_aunty: Thank you, *beta*! Come at midnight, there's cake for the carollers also.
net_uncle:   Email from America? Twenty rupees. Reading is free. Crying is also free.
```

### Small activities (always on)

| Activity | Where | Kernel | Reward |
|---|---|---|---|
| Gully cricket | any `playground_*`, `musi_riverbed` | `cricket` | ₹2 to ₹5 |
| Marbles vs Tiger | `playground_14` (after 10 golis) | `marbles` | ₹5 a win |
| Brick game | `video_parlour_1`..`video_parlour_4` (₹1 a game) | `brickgame` | high scores |
| Kite flying | `home_terrace` while `sankranti` | `kite` | ₹2 a cut |
| Numaish rides | giant wheel ₹5 (viewpoint), Jan to mid-Feb | W6 | — |
| Lumbini boats | `lumbini_jetty` ₹10 (after M10) | W7 | F07 |
| Free langar | `gurudwara_gowliguda` (walk-only, head covered with the hankie Amma packs) | refill | energy +50 |
| Ticket Thatha's buses | `koti_bus_stand` and the other hubs | travel | — |
| Irani chai | any `irani_cafe_*` | refill / cool-down | energy +40 |

---

## 8. Ambient content

All lines are kid-friendly. The meaning in brackets is for the glossary tooltip and the
subtitles option; the dialogue box shows the line itself.

### 8.1 Pedestrian barks (48)

Plays when the player bumps into, runs past or stands near a pedestrian (cooldown 8 s, never the
same line twice in a row). Tag = where or when it may play.

| # | Tag | Line | Meaning |
|---|---|---|---|
| 1 | any | "*Hallu chalao, mamu!*" | Go slowly, buddy! |
| 2 | any (player running) | "*Kaiku itta bhaagra?* Train *chhoot ri kya?*" | Why run so much? Missing a train? |
| 3 | any | "*Hau hau, aara!*" | Yes, yes, coming! |
| 4 | day, summer | "*Nakko re baba, dhoop bhot hai.*" | No way, it's too sunny. |
| 5 | colony, evening | "Current *gaya kya* phir se?" | Has the power gone again? |
| 6 | Jan | "*Bo kaata! Lapet, lapet!*" | Cut! Reel in, reel in! |
| 7 | any | "Chai *ku chalte kya?*" | Shall we go for chai? |
| 8 | Feb to Mar | "Score *kitta hua?*" | What's the score? |
| 9 | any | "*Kya bolte miyan*, this heat!" | What can I say, sir, this heat! |
| 10 | any | "*Ainvayich ghoomra.* Just roaming." | Just wandering about. |
| 11 | any (bumped) | "*Light le, mamu.*" | Chill, buddy. |
| 12 | colony (Telugu) | "*Emaindi ra?*" | What happened, man? |
| 13 | bumped (Telugu) | "*Abba!* *Choosi nadavu!*" | Ouch! Watch where you walk! |
| 14 | morning | "*Ammo*, late *ayipoyindi!*" | Oh no, I'm late! |
| 15 | any | "*Meri chappal kidhar gayi?*" | Where did my slipper go? |
| 16 | near bus stops | "Bus *aayi! Bhaago!*" | The bus is here! Run! |
| 17 | RTC X Roads | "*Tondaraga raa*, cinema starts!" | Come quick, the film's starting! |
| 18 | colony | "*Paani aara!* Motor on *karo!*" | Water's coming! Switch on the motor! |
| 19 | Mar 23 evening | "India *jeeta kya?*" ...(silence) | Did India win? |
| 20 | dusk | "*Chalo ghar ku, andhera hora.*" | Let's go home, it's getting dark. |
| 21 | any | "*Baigan!* I don't believe it." | Nonsense! |
| 22 | colony | "*Pakka promise*, I'll return it tomorrow." | Sure promise. |
| 23 | traffic | "*Abbo, enta traffic!*" | Wow, so much traffic! |
| 24 | traffic, cow on road | "*Gaay hatao re*, road is blocked!" | Move the cow! |
| 25 | Mar | "Exam *kab se?* *Baap re!*" | When do exams start? Oh no! |
| 26 | Telugu aunties | "*Thinnava?* *Raa*, eat something." | Did you eat? Come, eat. |
| 27 | Old City | "*Kya re*, chhote, lost?" | What's up, little one, lost? |
| 28 | Old City | "Hotel Madina's haleem has started, *miyan!*" (Ramzan) | |
| 29 | Ramzan nights | "*Chand dikha kya?*" | Has the moon been seen? |
| 30 | Ganesh week | "Our Ganesh is taller than theirs. By one inch." | |
| 31 | Ganesh week | "*Ganpati Bappa Morya!*" | Hail Lord Ganesh! |
| 32 | Bonalu Sunday | "Make way for the *bonam*, *amma*." | |
| 33 | Numaish season | "Numaish *chalre kya*, this Sunday?" | Going to Numaish this Sunday? |
| 34 | Numaish | "Delhi papad! Biggest papad in the world!" | |
| 35 | HITEC City | "Software job, *re*. Onsite. America." | |
| 36 | HITEC City | "Five years ago, goats. Now, glass." | |
| 37 | near any Irani café | "*Ek pauna*, quick, I have a bus." | One small chai, quick. |
| 38 | rain (Jun to Sep) | "Paper boats! Drain race at four o'clock!" | |
| 39 | monsoon | "*Baarish aari*, cover the cycle seat!" | Rain's coming! |
| 40 | kids | "Last over! Only last over! ...Then one more." | |
| 41 | kids | "*Doodh-bhaat* bats last!" | The little kid bats last. |
| 42 | Secunderabad | "Clock Tower *ke paas milo*, six o'clock." | Meet near the Clock Tower. |
| 43 | Koti | "*Footboard nakko*, inside, inside!" | |
| 44 | anywhere, Pasha on a shop TV | "Professor Pasha says the tunnel is real. My uncle says Pasha is real. Both are lying." | |
| 45 | colony aunties | "*Mee abbayi* EAMCET rank *entha?*" | What's your son's EAMCET rank? |
| 46 | old men on a bench | "In our time, one rupee was a rupee." | |
| 47 | Tank Bund evening | "Bhutta! *Garam garam* bhutta! Lemon-chilli!" | Roasted corn! |
| 48 | Charminar | "Pigeons! Mind your head, *miyan*, they have no manners." | |

### 8.2 Chappal Meter lines (per level)

| Level | Speaker | Lines |
|---|---|---|
| 1 | `chitti` | "*Mummy ki cheppesta!*" · "Annayya is outside AGAIN!" · "Give me a Mango Bite or I'm telling." · "I saw. I SAW!" · (bribed) "...I saw nothing. Mango Bite is very good." |
| 1 | colony uncle (cycle) | "*Arre*, Sreenivas's boy! Does your Amma know?" · "I'm going that way anyway. Towards your house." |
| 2 | `aunty` (phone tree) | "Kamala-garu's grandson! At this hour!" · "I'll just phone Padma. Just to say hello." · "*Ayyo*, look at his knees." · "The whole colony knows in ten minutes, *beta*." |
| 2 | `bahadur` (night) | (whistle) "*Kaun hai?*" · "Chinnu baba! *Ghar jao!*" · "I am only a whistle. But I am a LOUD whistle." |
| 3 | `pochaiah` on foot | "*Ruko!*" · "Three on one cycle? *Utro!*" · "Licence? ...You're eleven. *Utro* anyway." · "I have one quiet day a year. Not today." · (escaped) "*Hai*, my knees..." |
| 4 | `pochaiah` on the Luna | "Stop the cycle! Stop the BOY!" · "My Luna is faster than your excuses!" · "Number plate? A cycle has no number plate? Then your FACE is the number plate!" · (escaped) "Luna, you have betrayed me." |
| 5 | `amma` (day, in Yadagiri's auto) | "{FULL}!" · "*Intiki raa!* NOW!" · "Wait till your Nanna hears!" · "One more step and this chappal flies!" · "*Ekkada?* EKKADA?!" |
| 5 | `yadagiri` (driving Mummy) | "Sorry, {nick}! Full meter! FULL meter!" · "Aunty, left or right? ...Okay, straight, through the cows." |
| 5 | `amma` (night, pillion on the Chetak) | "Sreenivas, faster!" · `nanna`: "Padma, it's a Chetak, not a rocket." · `amma`: "{FULL}! In your banyan, at this hour!" |
| 5 | `ammi` (Chand Raat only) | "{nick}! I can see your chappals under that shop!" · "*Kya karre* you two?!" · "I teach maths. I can calculate where you'll run." |
| any | chappal thrown | sfx `chappal`; toast "DODGE!" · on a dodge: "Missed! ...She never misses twice." |
| down | meter falls a level | toast "*Bach gaya!*" (Saved!) · at 0: "Safe. For now." |

### 8.3 Busted and exhausted

**PAKDA GAYA!** (caught: −₹2, respawn at `home` or the checkpoint). One line at random:
1. `amma`: "Two rupees cut from pocket money. And no TV."
2. `amma`: "Do you know how many aunties called me today? FOUR."
3. `amma`: "Sit. Homework. Now. With the door open."
4. `pochaiah`: "First and last warning. Next time I tell your Nanna. ...He's my friend, you know."
5. `ammi`: "Imran's friend means Imran's punishment also. Sit there."
6. `amma`: "*{FULL}.* Look at me. ...Fine. Eat first. Then scolding."
7. `nanna`: "Your Amma is angry. I am also angry. Officially."
8. `amma`: "You want to roam the city? Roam the kitchen. Peel these peas."
9. `ammamma`: "Let him go, Padma. ...After the peas."
10. `chitti`: "I TOLD you I'd tell."

**THAK GAYA!** (exhausted: sit down, respawn at the nearest Irani café, −₹1 for glucose water):
1. "*Thak gaya...* Legs have gone on strike."
2. "Water... chai... Osmania... in that order."
3. `salim`: "*Arre*, sit, sit. Glucose water, one rupee. Then chai."
4. "Even the cow is walking faster than me."
5. "Note to self: running is for the movies."
6. `waiter`: "Two hours you'll sit for one chai? ...Okay, for you, one hour."
7. "My chappal is tired. I am more tired."
8. (2026 epilogue only) `srikanth`: "Four seconds. Four. The knees remember 2003, the rest of me doesn't."

### 8.4 Shopkeeper lines

| Shop (ids) | Lines |
|---|---|
| Irani café waiter (`irani_cafe_*`, Salim at `irani_cafe_7`) | "*Do pauna, ek plate Osmania*, table *teen*!" · "*Paani-kam*? Piping hot, coming." · "Bun-maska finished, samosa is there." · "Family room is upstairs, aunties please." · "Dunk the biscuit, don't drown it. Osmania is delicate." |
| Irani café cashier | "Pay at the *galla*. The bill is in my head." · "Score? Ask the radio. I'm counting." |
| Faramarz (`irani_cafe_19`) | "*Do chai, ek plate Osmania!*" · "One chai, one hour? No. One chai, twenty minutes." · "My father came from Yazd with one tin and one recipe." |
| Kirana (`kirana_*`, Agarwal-ji) | "No change. Take two toffees." · "*Khaate mein likh doon?* Tell your Nanna." · "Don't put your hand in the jar! Say how many." · "Bottle back, or no deposit." · "Mango Bite, fifty paise. For Chitti? Then two." |
| Pindi girni (`pindi_girni_*`, Ramulu) | "*Dabba* in the line, number coming." · "Chilli day today. Stand back, you'll sneeze." · "Keep away from the belt, *baba*. The machine is hungry." · "My hair isn't white. It's *atta*." |
| Flower cart (`flower_cart_*`) | "*Mallepoolu!* Two rupees a *moora*!" · "For your Amma's braid? Jasmine. Always jasmine." · "I sprinkle water; fresh till evening." |
| Banana cart (`banana_cart_*`) | "*Arati pandlu! Chakkarakeli!*" · "One *kosaru* for the little one." · "Peel in the bin, not on the road. Somebody will slip." |
| Stationery (`stationery_*`) | "Long notebook or short? Ruled or plain?" · "Brown cover, how many sheets?" · "Compass broken? Sold separately." · "Xerox one rupee a page. Current gone? Come tomorrow." |
| Medical shop (`medical_shop_*`) | "Doctor's *chitti* first." · "Hajmola, one rupee. Not the whole packet!" · "Take a plaster. Cricket knee?" |
| Iyengar bakery (`iyengar_bakery_*`) | "Honey cake just out!" · "Egg puff or veg puff? Straight from the oven." · "Cream roll in your pocket? It will melt!" |
| Samosa bandi (`samosa_bandi_*`, 16:00 to 20:00) | "*Garam samose!* Small onion ones, five rupees a dozen!" · "Don't come near the *kadai*, oil jumps." |
| Dosa bandi (`dosa_bandi_*`, 06:30 to 10:00) | "Idli, vada, dosa: *tondaraga cheppandi!*" · "*Karam podi* with ghee? A bit spicy." · "After ten, only idli. Dosa batter is finished." |
| Coconut cart (`coconut_cart_*`) | "*Kobbari bondam!* Water is sweet!" · "Watery one or one with *malai*?" · "I made you a spoon from the husk." |
| Meat shop (`meat_shop_*`, shopfront only) | "Sunday queue is long. Come at seven." · "Don't touch the cage, the hen gets cross." · "Wait outside, I'll bring it." |
| Photo studio (`photo_studio_*`) | "Sit straight, chin up, *thoda left*... smile please!" · "Ready day after tomorrow." · "Don't open the darkroom door! The photos will burn!" |
| Internet café (`internet_cafe_*`) | "Twenty rupees an hour. Timer is on." · "No chat rooms. Emails, yes." · "*Kirrr-kshhh*... that's the modem. It's thinking." |
| STD booth (`std_*`) | "Come at night, the rate is less." · "Check the meter, take the bill, next!" |
| Barber (`barber_*`) | "Haircut, ten rupees. Nobody will recognise you. Not even your Mummy." |
| Cycle hire (`cycle_rent_*`) | "Three rupees an hour. Late means double." · "Puncture? That's your problem now." |
| Video parlour (`video_parlour_*`) | "One rupee, one game. Stand in line." · "Your Amma is outside? ...Back door is there." |
| Karachi Bakery (`karachi_bakery`) | "Fruit biscuit, Osmania, dil khush, plum cake. For which relative?" |
| Gokul Chat (`gokul_chat`) | "*Teekha ya meetha?* One extra, *phokat!*" · "Samosa-ragda, double chutney." |
| Bawarchi / Paradise | "Family pack? Fifteen minutes. The smell is free." |
| Patang Chacha (`kite_stall_1`) | "*Saddi mazboot.* Won't snap in a *pech.*" · "Cotton only. Glass manja cuts fingers and birds." |
| Rythu Bazaar farmer (`rythu_bazaar_*`) | "*Tamata kilo aaru!*" · "*Kosaru kaavala, babu?*" · "Straight from my field, no middleman." |

### 8.5 Radio and TV

Three fictional programmes on the vehicle radio and the walkman's radio band. They are made-up
stations with no real brand; DJ lines go to `N.hud.toast`. (They match `audio.js` STATIONS.)

**Deccan Vani 101.2 — "Aapki Farmaish"** (host **Shabnam Aapa**, warm Dakhni):
- "*Namaskar, aadaab*, Hyderabad! This is Shabnam Aapa, and these are your *farmaish*."
- "Postcards to: Aapki Farmaish, Deccan Vani, Post Box 1990, Hyderabad. Neat handwriting, please."
- "Chai time! The next song goes out to every Irani café waiter who remembers your order."
- "Kachiguda's Chintu writes: 'Sonu, return my cycle.' Sonu, are you listening?"
- "Rain in Mehdipatnam, sun in Secunderabad. Hyderabad cannot decide, like my nephew."
- *Farmaish* dedications (random): "From Pinky of Malakpet to her Nani in Kurnool." · "From the
  Amberpet Gully Cricket Club to their ball, lost in Sharma-garu's compound. RIP, ball." · "From
  a mother in Tarnaka to her son in hostel: eat properly." · "From Golu of Saidabad to his best
  friend Golu of Saidabad. Yes, two Golus." · "From the night watchmen of Lakshmi Nagar: please
  close your gates."
- Date-aware bulletins: 14 Jan "The new HITEX exhibition centre opens today in Madhapur." · Feb to
  Mar "World Cup: India are through to the next round! Shop TVs, full crowds." · 23 Mar "Final
  today, half past one. Exams tomorrow. Mothers, be strong." · 20 Jul "Lashkar Bonalu today:
  Secunderabad roads slow, hearts full." · 24 Jul "Tomorrow the new giant screen opens on Necklace
  Road." · 9 Sep "Immersion traffic on Tank Bund all night. Leave early, sing loud." · late Oct to
  Nov "Ramzan *Mubarak*. Haleem queues at the Old City are longer than my nephew's excuses." ·
  25 Nov "Chand Raat! Laad Bazaar is open all night."

**Band Baaja 93.5 — "Shaadi Special"** (host **Bandmaster Bhaskar**, loud Telugu-Hindi):
- "Band Baaja 93.5! Wedding or procession, the band plays FULL!"
- "This tune from Saidabad's Lucky Star Band. Dance, *mamu*!"
- "Teenmaar time! Volume up, whole colony up!"
- "Today's baraat route: Koti to Abids, then straight to the dance floor!"
- "Barkas marfa boys, we hear you! Even the pigeons are dancing."
- *Farmaish*: "From the groom's side to the bride's side: sorry we're late. We're still dancing."
  · "From Dhoolpet's idol painters: the Ganesh is ready, bring your lorry."

**Pop Patang 104.8 — "Countdown Express"** (host **RJ Rocket Ravi**, fast English):
- "Heyyy Hyderabad! You're flying high on Pop Patang 104.8!"
- "Request line is open! Call us, or page us!"
- "Fresh from the countdown, straight into your auto-rickshaw!"
- "Shout-out to the Ameerpet Java batch: 'public static void... sleep'. Haha. Coding jokes."
- "Going onsite? Don't forget us. Coming back? Bring chocolates."
- *Farmaish*: "From a girl in KPHB, Phase 3, to her cousin in New Jersey: send photos of snow." ·
  "From the Cyber Towers night shift: we see the sunrise every day, from the wrong side."

**Shop-window TV (ambient, in `electronics_shop_1` and kirana windows):** cricket (Feb to Mar),
Doordarshan's Sunday film (title cards only), and **Professor Pasha's *Khazana Hunt* promos**:
"Is there a tunnel from Charminar to Golconda? The Professor will find out! Sunday, Channel Seven!"
· "Last week: no treasure. This week: MAYBE treasure!" · (after M12) "*Khazana Hunt* special: The
Real Treasure Is Haleem."

### 8.6 Seasonal world states (flags)

| Flag / dates | What changes |
|---|---|
| `sankranti` 13 to 15 Jan | Kites over every colony, muggulu at gates, bhogi smoke at dawn on 13 Jan, Patang Bazaar crowds |
| `numaish` 1 Jan to 15 Feb | Numaish gate, giant wheel, stalls, loudspeaker announcements |
| World Cup 9 Feb to 23 Mar | Crowds at shop-window TVs, "Score?" barks |
| `summer` 24 Apr to 11 Jun | Ice-gola carts at school gates, mango piles, LB summer camp (SA4) |
| monsoon Jun to Sep | Puddles, paper boats, rain barks, the Musi channel wider |
| `bonalu` Sun 20 Jul | Neem festoons, bonam processions at the Mahankali temples |
| `prasads_open` from 25 Jul | Prasads open (before: tin fence "PRASADS — COMING SOON — THE GIANT SCREEN") |
| `ganesh` 31 Aug to 9 Sep | Pandals in every `playground_*`, the Khairatabad giant in its pandal |
| `ganesh_immersion` 9 Sep | Processions to Tank Bund, cranes, gulal, all-night traffic |
| `ramzan` 27 Oct to 25 Nov | Haleem bhattis at Old City hotels, night bazaars, crescent cut-outs |
| `chand_raat` 25 Nov | Laad Bazaar open all night, bangle crowds, bulb strings |
| December (post-game) | Christmas stars in Secunderabad, cribs at church gates (SA8) |

---

## 9. Ending, epilogue, credits, post-credits

Everything in this section happens **at Charminar** except two short cutscene cards (Eid morning
and the goodbye at the gate). Music: `N.audio.music.play('ending')`, synced to its five sections
(`alaap`, `theme`, `rise`, `lift` (key change), `coda`) via `music.sections('ending')`.

### 9.1 The Ending: "Side A ends" (Thu 27 Nov 2003)

**Card 1, Eid morning (Wed 26 Nov, `friend_home`):**
```
[text]  Eid morning. Sheer khurma in a steel bowl, still too hot.
ammi:   *Eid Mubarak*, {nick}. *Eidi*. Fifty-one rupees. Don't spend it on maps.
chinnu: *Eid Mubarak*, aunty.
[text]  Chinnu gives Immu a shoebox: every cassette he found this year. "A city's radio. For the cold."
[text]  Immu gives Chinnu his CID notebook. The last page says: "Agent Chinnu. Promoted. Over."
```
**Card 2, the gate (Thu 27 Nov, 20:30):**
```
[text]  An Ambassador taxi with a roof carrier full of tin trunks. The whole colony at the gate.
abba:     Gas station. Gas station. ...Petrol bunk. (He gives up and laughs.)
immu:     23:40. Stand at Charminar and look north. I'll look south. Over.
chinnu:   Over.
[text]  Nobody says goodbye. They say "over". The taxi turns the corner.
```
**Playable, 23:20, `gulzar_houz` → `charminar_plaza`.** Bunty brought him on the RX100 (with a
helmet); Nanna came on the Chetak. Traffic is thin, Charminar floodlit, a few Ramzan-season
stalls still lit. Objective: `"Charminar. Look north at 23:40."` Walking only (the plaza is calm).
First, `"Give the Chand Raat print to Faramarz uncle."` (the prints came back this afternoon):
```
faramarz: The tin stays locked. The photo stays with it. (tapes the envelope to the lid) Agent rules, *haan*?
faramarz: Go. Your friend is looking south.
```
Then on Patang Chacha's roof by the Char Kaman:
```
kite_chacha: (if 12 kites) All twelve. Now watch, *beta*.
kite_chacha: (if fewer) {n} kites. Enough to make the sky look busy. Watch.
```
`[alaap]` The found kites rise one after another on one long string into the floodlight beside
the minarets (count = kites found; with all 12: "a fifth minar of paper"). If all 12 dedication
tapes were found, a shop radio:
```
radio:  Deccan Vani, late night. One last farmaish: "From Chinnu of Lakshmi Nagar to Agent Immu, flying tonight. Over and out."
```
If all 12 tickets were found, Ticket Thatha is on the plaza bench: "*Right, right*, Chinnu."
`[theme]` 23:40: far to the north, beyond the minarets, a blinking light climbs out of Begumpet
into the dark.
```
bunty:   ...Onsite. Maybe I'll stay. Paradise is here.
nanna:   (a hand on Chinnu's shoulder; says nothing)
[prompt] CLAP (ACTION ×3)
[text]   Chinnu claps three times at the sky. Nothing comes back. Then the pigeons on the minarets lift, all at once.
```
`[rise]` **Side A plays back:** `N.audio.tapeMontage([...the 12 REC sounds in order])` while the
camera rises above Charminar and the HUD counter runs 000 → 999. Each sound shows its J-card
line for a second. At 999: `[sfx] tape_click`. The 2-in-1 auto-reverses (`tape_stop`, then the
mechanism clunk). `[lift]` The OSD reads `▶ PLAY  SIDE B`. White-out to the VHS 2026 frame.

### 9.2 The Epilogue: "Side B" (Sat 17 Jan 2026, playable, ~4 minutes)

`N.flags.year = 2026`. VHS softness `fx.vhs = 0.35`. The 2003 Charminar map with traffic off
("the plaza is closed to traffic this evening"), no modern objects, no phones, no signs changed.
Adult sprites per §2.

**Side B (text over the loft image, Immu's voice):**
```
imran (tape): Chinnu. It's Immu. Imran. Agent, retired.
imran (tape): I wore Side A thin in New Jersey. Every Sankranti I played track one in the garage.
imran (tape): Abba wants to see Charminar once more. He says his knees remember the cellar stair.
imran (tape): Same café. Saturday. Four o'clock. Bring a clap. Over.
imran (tape): PS. The tapes you gave me in 2003. I put a bit of each at the end. Listen.
```
Then the **tail**: one line per dedication cassette found (the DJ reading it, §6.3); each missed
one is `(tape hiss)`. All four Agent tapes found: "You found all four Agent tapes? Agent, you
are promoted." Then: `▶ PLAY  SAT 17 JAN 2026  16:00`.

**Walk:** `"Café Noor-e-Iran. Four o'clock."` Srikanth starts at the Gulzar Houz arch. Running
drains energy to 0 in 4 s ("THAK GAYA" line 8, no penalty). Pigeons, bangles, the same café.
```
faramarz: (81, at the galla, squinting) You two are late. *Teis saal* late.
srikanth: Uncle. You remember me?
faramarz: I remember a boy who ate my biscuits in my storeroom. And another boy who came to get him.
imran:    (at the corner table, a windcheater, a cap, the same taped-glasses grin) Agent.
srikanth: Agent.
imran:    (holding out a packet) Chocolate? From America. Everyone expects it. I'm sorry.
abba:     (63, standing slowly) *Do chai, ek plate Osmania.* ...Some things you don't say in English.
ayesha:   (arriving, dupatta, a coach's whistle) Eight kilometres. We cried for a week. Then we got a bigger ground.
imran:    Still bowling?
ayesha:   Coaching. Girls' team. Under-14. They call me "Coach Bowling".
srikanth: And Ammamma says: bring back Osmania and a full report. She's ninety-one.
faramarz: Ninety-one and still giving orders. Good. *Accha.* Now. The tin.
```
Faramarz takes the tin down from the top shelf, beside his father's tin from Yazd. A yellowed
envelope is taped to the lid (the Chand Raat print, delivered on 27 Nov 2003). The brass lock.
`"Open the lock."` — a 4-digit dial UI (`0`..`9` ×4). Correct: **1-4-0-1**. Wrong tries:
```
faramarz: *Gurthunda?*            (wrong 1)
srikanth: The day we started...   (wrong 2; the Journal page "The Lock" opens with the riddles)
imran:    Fourteen-one. Sankranti. (wrong 3; the dial sets itself)
```
**The tin** (each item shows as a card; items from missions always present):
the kite corner with a name spelt wrong · the Numaish ticket · the *Toofan Tammudu* floor stub ·
the signed tennis ball (Chitti's name biggest) · Ticket Thatha's punched ticket · brass token
No. 47 · the Golconda ticket · a pressed neem leaf · the Prasads stub, 25 JUL 2003 · a packet of
gulal · Immu's slam-book page with two email addresses on the back · a passport photo of two
boys laughing · the Side A copy · and the envelope: the Chand Raat print, `'03 11 25`, a chappal
frozen in the air.

```
srikanth: Your email still works?
imran:    agent_immu_2003? I forgot the password.
srikanth: Bokaata.
imran:    ...Bokaata. (laughs) You remembered.
```
Amma (61) and Nanna (64) arrive; Amma carries Nanna's old photo album (Frames: every developed
print in its place; missed ones are empty photo corners).
```
amma:     (sees biscuit crumbs on Srikanth's shirt; her hand goes to her chappal) ...Habit.
nanna:    One photo. All of us. I have the old camera, one roll left.
```
`"The last photo. Ten seconds."` Nanna props the camera on a Karachi Bakery tin on the café step,
Charminar behind. He sets the timer and, out of forty years' habit, steps back to check the
focus. So does Rasheed-saab, beside him.
```
srikanth: Nanna, *nuvvu kooda!*
imran:    Abba, *aap bhi!*
[text]    Two old men run. Their knees don't. They make it. Mostly.
[sfx]     beep-beep-beep... camera_flash
[text]    Pigeons lift off the minarets.
```
At the café door, a clap behind Srikanth. He claps back three times without turning round.
`[coda]` `N.audio.tapeStop(2.5)`. OSD: `■ STOP`. Title: **NOSTALGIA**.

### 9.3 The definitions card (after ■ STOP)

```
NOSTALGIA (n.)
  very old style, like my RX100.                          — Bunty-anna, Ameerpet Java batch
  chai gone cold because you were talking.                — Faramarz uncle
  old things getting costly.                              — Agarwal-ji
  when the roads had less traffic.                        — Havaldar Pochaiah
  a sweet? It's not a sweet? Then I don't want it.        — Chitti, age 6
  pain for home. (Greek!)                                 — Bunty-anna, finally right
  gnapakalu: memories that come in without knocking.      — Ammamma
  yaadon ki meethi chubhan, the sweet sting of memories.  — Vimala Ma'am, in red ink
  taking your city in your pocket.                        — Agent Immu
  a tape, a tin, and a clap that comes back.              — K. {full}, age 34
```

### 9.4 Credits (text, scrolling on the J-card)

```
NOSTALGIA
a Hyderabad story on one cassette

SIDE A — HYDERABAD 2003
  Story, places and people of a city that kept every kite.
  Made by a team of AI agents for a 90s kid who grew up here.

THE CAST (in order of appearance)
  Chinnu · Nanna · Chitti · Amma · Immu · Ayesha · Bunty-anna · Salim-bhai · Yadagiri-anna
  Patang Chacha · Faramarz uncle · Ammi · Professor Pasha and Babloo · Havaldar Pochaiah
  Cable Babji · Ticket Thatha · Nani · Ramulu · Agarwal-ji · Ammamma · Rasheed-saab · Vimala Ma'am
  Raj-uncle · Net-uncle · Bahadur · Lakshmamma · Tiger · and every aunty at every gate

THE CITY (in order of the tape)
  Lakshmi Nagar Colony · Gulzar Houz · Numaish · RTC X Roads · Public Gardens · Imlibun
  Hanuman Pindi Girni · Golconda · Lashkar · Prasads · Tank Bund · Naubat Pahad · Charminar

MUSIC
  All music and sound made from scratch in the browser. No real songs were harmed.

WITH THANKS
  To every Irani café that served one chai for two hours.
  To every mother's chappal, which never once actually hit anybody.

  Gurthunda?
```

### 9.5 Post-credits: ◀◀ REWIND

The tape rewinds (VHS ◀◀). A J-card menu: **"Play any season of 2003"**:
- **January** (Sankranti, Numaish): Immu hangs out at `playground_1`; kites in the sky.
- **May** (summer): ice golas, mangoes, the LB summer camp.
- **September** (Ganesh): pandals; Immu at the pandal.
- **December** (post-game): Immu has gone; Christmas stars in Secunderabad (SA8); his first email
  waits at `internet_cafe_1`; Ayesha's moving lorry leaves for Tolichowki on 13 Dec.

Free roam keeps all collectibles, money and unlocks. Any mission can be replayed from the
Journal's track list ("Side A, track N"). Hangout lines for Immu in free roam:
```
immu: Agent Chinnu. Nothing to report. Just reporting. Over.
immu: Ten months and eleven days, I said. Now it's less. Don't count.
immu: Chai? Your treat. You have Eidi money. ...Oh. Not Eid yet. Your treat anyway.
```

---

## 10. Glossary

Every non-English word or phrase used in this bible. Load it into `N.dialogue.glossary` (lower-
case keys; multi-word keys match whole `*phrases*`). Tags: **(Te)** Telugu · **(Dk)** Dakhni /
Hyderabadi Urdu · **(Hi)** Hindi-Urdu shared · **(Pa)** Punjabi · **(IE)** Indian English ·
**(P)** meaning of a place name. The Journal's "Hyderabadi dictionary" shows the same list.

### 10.1 Words and phrases

| Word / phrase | Tag | Meaning |
|---|---|---|
| aa gaye? | Dk | You've come? / Here already? |
| aadaab | Dk | A respectful greeting (with a hand raised) |
| aaj nakad, kal udhaar | Hi | "Cash today, credit tomorrow" (shop sign) |
| aao, mian | Dk | Come, sir |
| aap bhi | Hi | You too (respectful) |
| aapa | Dk | Elder sister; polite for a woman |
| aara / aari / aayi | Dk | Coming (m./f.) / has come ("bus aayi": the bus is here) |
| AARA! | Dk | "It's coming!" (the antenna picture is back) |
| Abba | Dk | Father |
| abba! | Te | Ouch! / Wow! (exclamation; different from *Abba*, father) |
| abbo, enta traffic! | Te | Wow, so much traffic! |
| accha | Hi | Okay, good |
| agle baras jaldi aana | Hi | "Come back soon next year" (farewell to Ganesh) |
| ainvayich ghoomra | Dk | Just roaming, for no reason |
| Amma | Te | Mother |
| Ammamma | Te | Maternal grandmother |
| Ammi | Dk | Mother |
| ammo! | Te | Oh no! |
| -anna / Annayya | Te | Elder brother (suffix of respect) / big brother |
| andhera hora | Dk | It's getting dark |
| arati pandlu | Te | Bananas |
| arre | Hi | Hey! |
| Ashada | Te | The lunar month (Jun–Jul) when Bonalu is held |
| atta | Hi | Wheat flour |
| ayipoyindi | Te | Has become ("late ayipoyindi": I'm late) |
| ayyo | Te | Oh no |
| baap re! | Hi | Oh my! |
| baarish aari | Dk | Rain is coming |
| baba | Dk | Little boy (affectionate) |
| babu | Te | Sonny (affectionate) |
| bach gaya! | Hi | Saved! / Got away! |
| baigan | Dk | "Nonsense! My foot!" (literally, brinjal) |
| band karo | Hi | Switch it off / stop it |
| banyan | IE | A cotton vest |
| beta | Hi | Child (affectionate) |
| bhaago / bhaagra | Dk | Run! / running |
| -bhai, bhai | Hi | Brother; a friendly suffix |
| bhatti | Hi | A brick-and-clay stove (haleem is cooked in one) |
| bhogi | Te | The bonfire day before Sankranti |
| bhot | Dk | Very, a lot |
| bhutta | Hi | Roasted corn on the cob |
| bo kaata! | Dk | "Cut!" (the shout when you cut a kite) |
| bonam / Bonalu | Te | A decorated offering pot carried on the head / the festival |
| bun-maska | Dk | A buttered bun (Irani café) |
| chakkarakeli | Te | A sweet, thin-skinned banana |
| chalo | Hi | Let's go |
| chalre kya? | Dk | Are you going? |
| Chand Raat | Dk | "Night of the moon": the eve of Eid, an all-night shopping night |
| chand dikha kya? | Hi | Has the moon been sighted? |
| chanda | Hi | A festival donation |
| chappal | Hi | Slipper, sandal |
| Chappal Bazar | P | Slipper Market (a neighbourhood by Kachiguda) |
| Char Kaman | P | "Four arches" around Gulzar Houz |
| charkhi | Hi | Spool for kite string |
| chashma wala | Hi | The one with glasses |
| chee | Hi | Yuck! / Tch! |
| chhote / chhotu | Hi | Little one |
| chhoot ri kya? | Dk | Is it leaving without you? (a train) |
| chitti | Dk | A chit, a written note (a doctor's chitti = prescription) |
| Chitti | Te | A pet name: "little one" |
| choosi nadavu | Te | Watch where you walk |
| chowrasta | Dk | Crossroads |
| chuddam | Te | We'll see |
| coolie | IE | Railway porter |
| current poyindi! / current gaya! | Te / Dk | The power's gone! |
| dabba | Hi | Tin box; tiffin box; (cricket) out for zero |
| dappu | Te | A frame drum played in processions |
| darshan | Hi | Seeing the deity at a temple |
| das upar | Dk | Ten extra (₹10 over the meter) |
| dheel / khench | Hi | Give slack / pull hard (kite string) |
| dhoop | Hi | Harsh sunshine |
| dil khush | Dk | "Happy heart": a sweet coconut bun |
| do chai, ek plate Osmania | Dk | Two chais and a plate of Osmania biscuits |
| do pauna | Dk | Two small Irani chais |
| doodh-bhaat | Hi | "Milk-rice": the little kid who plays but doesn't count |
| doodhiya | Hi | Milky (a marble) |
| dosa / idli / vada | Te | South Indian breakfast: crêpe / steamed cake / fritter |
| dupatta | Hi | A long scarf worn with salwar kameez |
| Ee okka Aadivaaram nenu pindi Ramulu kaadu. Pothuraju. | Te | "This one Sunday I am not Flour Ramulu. I am Pothuraju." |
| Eid Mubarak | Dk | Happy Eid |
| Eidi | Dk | Money given to children on Eid |
| ekkada? | Te | Where? |
| emaindi (ra)? | Te | What happened (man)? |
| farmaish | Dk | A listener's request or dedication on the radio |
| footboard | IE | The step at a bus door (riding on it is dangerous) |
| gaay hatao | Hi | Move the cow |
| galla | Dk | Cash till |
| Ganpati Bappa Morya | Hi | "Hail, Lord Ganesh" (festival cry) |
| garam garam | Hi | Piping hot |
| -garu | Te | Respectful suffix ("Sreenivas-garu") |
| Garmi | Hi | Summer heat (chapter card) |
| ghaas pe nakko khelna | Dk | Don't play on the grass |
| ghar jao / ghar ku | Dk | Go home / home-wards |
| girni / pindi girni | Dk / Te | Flour mill (*pindi*, Te: flour) |
| gnapakalu | Te | Memories |
| goli | Hi | A marble |
| gulal | Hi | Coloured festival powder |
| gurthunda? | Te | Do you remember? |
| haa / haan | Dk | Isn't it? / yes |
| hai / Hai Allah | Dk | Oh! / Oh God! |
| haleem | Dk | Slow-cooked wheat-and-meat dish of Ramzan |
| hallu | Dk | Slowly, gently ("hallu chalao": drive slowly) |
| hau | Dk | Yes |
| hau, ho jaata | Dk | Yes, it'll happen |
| hawai chappal | IE | Rubber flip-flops |
| howzaat! | IE | "How's that?": a cricket appeal |
| imli / Imlibun | Hi / P | Tamarind / "tamarind grove" |
| intiki raa | Te | Come home |
| -ji | Hi | Respectful suffix ("Gandhi-ji") |
| kaavala? | Te | Do you want? |
| kab se? | Hi | Since when? |
| kadai | Hi | A deep iron wok |
| kaiku itta bhaagra? | Dk | Why are you running so much? |
| kanna | Te | Dear child |
| karam podi | Te | Spiced lentil powder eaten with ghee |
| karo | Hi | Do ("motor on karo": switch on the motor) |
| kaun hai? | Hi | Who's there? |
| ke paas milo | Hi | Meet near... |
| khaata / khaate mein likh doon? | Hi | Shop credit book / Shall I put it on your account? |
| khazana | Hi | Treasure |
| kitta hua? | Dk | How much? (what's the score?) |
| kitte din rakhun? | Dk | How many days shall I keep it? |
| kobbari bondam | Te | Tender coconut |
| kosaru | Te | The little extra a vendor throws in free |
| kotha chappal | Te + Hi | New chappals |
| kothi | Hi | Mansion (gives Koti its name) |
| ku chalte kya? | Dk | Shall we go for...? |
| kurta / salwar kameez / lungi / topi | Hi | Long shirt / trouser-and-tunic suit / wrap / cap |
| kya bolte, miyan | Dk | "What can I say, sir!" |
| kya karre? | Dk | What are you doing? |
| kya re? | Dk | What's up? |
| laddu | Hi | A round sweet |
| lapet | Dk | Reel in (kite string) |
| light le, mamu | Dk | Chill, buddy |
| line mein! | Hi | Stay in the line! |
| lo | Hi | Here, take it |
| lootna | Dk | To chase and grab a cut kite |
| malai | Hi | Cream; soft coconut flesh |
| mali | Hi | Gardener |
| mallepoolu | Te | Jasmine flowers |
| mamu | Dk | Buddy (literally, maternal uncle) |
| manja / saddi | Dk | Coated kite string / plain cotton string (the game uses saddi only) |
| Mavayya | Te | Maternal uncle |
| mazboot | Hi | Strong |
| Mee abbayi rank entha? | Te | What's your son's (EAMCET) rank? |
| mein / mein nakko | Hi / Dk | In / not in ("stadium mein nakko": not in the stadium) |
| Mera Yaadgaar Saal | Hi | "My Memorable Year" (the diary) |
| meri chappal kidhar gayi? | Dk | Where did my slipper go? |
| meter nakko | Dk | No meter (fare by haggling) |
| mian / miyan | Dk | Sir, mister |
| moora | Te | A forearm's length (how jasmine is sold) |
| Mubarak | Dk | Blessed, congratulations |
| muggulu | Te | Rangoli patterns at the gate |
| Mummy ki cheppesta! | Te + Hi | I'm telling Mummy! |
| na | Hi | Isn't it? / right? |
| nakko | Dk | No, don't |
| namaskar | Hi | A respectful greeting (palms together) |
| Nana / Nani | Hi | Maternal grandfather / grandmother |
| Nanna, nuvvu kooda! | Te | Dad, you too! |
| Naubat Pahad | P | "Drum hill" (where Birla Mandir stands) |
| neeru teeyaga undi | Te | The water is sweet |
| nemmadiga | Te | Slowly |
| nimajjanam | Te | Immersion of Ganesh idols |
| Numaish | Dk | "Exhibition": the Nampally fair |
| onsite | IE | (IT slang) posted abroad to the client's office |
| Osmania biscuit | Dk | The salty-sweet Irani café biscuit |
| paanch | Hi | Five |
| paani / paani aara / paani lo | Hi / Dk | Water / water's coming / have some water |
| paani-kam | Dk | "Less water": strong, milky Irani chai |
| pachadi | Te | Chutney; Ugadi *pachadi* has six tastes |
| pakka | Hi | Sure, promise |
| Pandaga | Te | Festival (chapter card) |
| pandal | Hi | A festival marquee |
| papad | Hi | A crisp fried wafer (Delhi papad is huge) |
| patang | Hi | Kite (chapter card) |
| pauna | Dk | A ¾ cup of Irani chai |
| pech | Dk | A kite fight (crossed strings) |
| pesarattu | Te | Green-gram crêpe |
| petrol bunk | IE | Petrol station (Abba practises "gas station") |
| phokat | Dk | Free, for nothing |
| poolamma | Te | Flower woman (vendor) |
| Pothuraju | Te | The guardian dancer of Bonalu, painted with turmeric |
| prasadam | Te | Blessed food from a temple |
| pul | Hi | Bridge (Purana Pul: old bridge; Naya Pul: new bridge) |
| ra / raa | Te | Hey man (familiar) / come |
| raita | Hi | Yogurt side dish |
| raja goli | Hi | "King marble": the jackpot marble |
| rava | Hi | Semolina |
| re | Hi | Hey (familiar) |
| repu | Te | Tomorrow |
| right, right! | IE | The conductor's "all clear, go!" |
| ruko! | Hi | Stop! |
| Rythu Bazaar | Te | Farmers' market (*rythu*: farmer) |
| -saab | Dk | Sir (suffix) |
| saddi mazboot | Dk | Strong cotton string |
| Salaam | Dk | A greeting |
| samosa-ragda | Hi | Samosa with white-pea curry |
| Sankranti | Te | The January harvest festival of kites |
| sheer khurma | Dk | Eid vermicelli and milk dessert |
| SSC / EAMCET | IE | Class 10 board exam / AP engineering entrance |
| surang | Hi | Tunnel |
| tamata kilo aaru | Te | Tomatoes, six (rupees) a kilo |
| teekha ya meetha? | Hi | Spicy or sweet? |
| teen | Hi | Three ("table teen") |
| teenmaar | Te | A fast processional drumbeat |
| teis saal | Hi | Twenty-three years |
| tension nakko | Dk | Don't worry |
| Thatha | Te | Grandfather |
| thak gaya | Hi | Worn out, exhausted |
| theek hai | Hi | Okay |
| thinnava? | Te | Have you eaten? |
| thoda left / thoda right | Hi | A little left / a little right |
| tondaraga (cheppandi) | Te | Quickly (say it quickly) |
| tukkal | Dk | A Hyderabadi kite shape (flavour name) |
| Ugadi | Te | Telugu New Year |
| utro | Dk | Get off |
| wala | Hi | The one with / the one who (*chashma wala*) |
| yaadon ki meethi chubhan | Hi | The sweet sting of memories |
| Aapki Farmaish | Hi | "Your Requests" (the radio dedication show) |
| baraat / shaadi | Hi | The groom's wedding procession / a wedding |
| bandi | Te / Hi | A pushcart (samosa bandi, dosa bandi) |
| biryani | Dk | Hyderabad's spiced rice-and-meat dish |
| bus udti nahi | Hi | "Buses don't fly" (Ma'am's red ink) |
| chaat / pani puri | Hi | Tangy street snacks / hollow puris dipped in spiced water |
| chhatri | Hi | A small domed kiosk on a rooftop (architecture) |
| dhobi ghat | Hi | Riverside place where washermen wash and dry clothes |
| Irani café / Irani chai | Dk | Cafés started by Iranian families / their strong milky tea |
| Kakatiya | Te | A medieval Telugu dynasty; the Tank Bund arches copy its gateway |
| kirana | Hi | A neighbourhood grocery shop |
| langar / Nishan Sahib | Pa | The free community meal at a gurdwara / its tall saffron flag |
| marfa | Dk | A big flat drum played by Barkas bands |
| maut ka kuan | Hi | "Well of death": the motorbike-on-a-wall show at Numaish |
| Nivas | Te | Home, residence ("Lakshmi Nivas") |
| pakda gaya! | Hi | Caught! |
| pehli baar sach | Hi | "The truth, for the first time" (Ma'am's last red ink) |
| qawwali | Dk | Sufi devotional singing at a dargah |
| sach likho | Hi | Write the truth |
| sitaphal | Hi | Custard apple (an ice-cream flavour) |
| 2-in-1 / J-card | IE | A radio-cassette player / the paper insert in a cassette case, where the track list is written |
| Eid (ul-Fitr) / Ramzan | Dk | The festival that ends the fasting month / the fasting month (Ramadan) |
| garam samose | Hi | Hot samosas |
| hallu chalao | Dk | Drive slowly |
| Churan goli / Mango Bite / Tinkle | IE | A tangy digestive candy / a 50-paise mango toffee / the children's comic (era brands, mentioned only) |
| imli-bun | Dk | Tamarind grove (Imlibun) |
| jeeta kya? | Hi | Did (India) win? |
| Luna / Chetak / RX100 / Ambassador | IE | A pedal-start moped / the family scooter / the cool cousin's motorbike / the classic car |
| STD booth (STD/ISD/PCO) | IE | A public telephone cabin with a metered call counter |
| X Roads | IE | Crossroads |

### 10.2 Names that mean something

*Chinnu* (Te, "little one"), *Immu* (pet name for Imran), *Bunty* (a pet name), *Patang Chacha*
("Uncle Kite"), *Ticket Thatha* ("Grandpa Ticket"), *Faramarz* (a Persian name), *Café
Noor-e-Iran* ("Light of Iran", invented), *Café Gulistan* ("Rose garden", invented),
*Toofan Tammudu* (Hi + Te: "Storm Brother", a fictional film), *Mass Maharaju* (a fictional
film: "King of the Masses"), *Khazana Hunt* ("Treasure Hunt", a fictional cable show), *Fateh
Darwaza* (P: Victory Gate), *Bala Hissar* (P: the upper fort), *Bagh-e-Aam* (P: the public
garden), *Laad Bazaar* (P: lac bazaar, for lac bangles), *Gulzar Houz* (P: the garden cistern),
*Lakdikapul* (P: wooden bridge).

---

## 11. Era-accuracy checklist (2003)

Checked against the anachronism blacklists in `research_places.md` §3, `research_mustplaces.md`
§5 and `research_all_places.md`. ✔ = handled.

| Item | Rule | In this bible |
|---|---|---|
| State and civic names | Andhra Pradesh, APSRTC, AP plates, MCH, HUDA; no Telangana, TS plates or GHMC | ✔ All dialogue and signs say AP / RTC; no TS or GHMC anywhere |
| Metro, MMTS, flyovers, ORR, PVNR Expressway | None in 2003 (MMTS began 9 Aug 2003: kept out entirely) | ✔ Flat junctions with podium cops; mainline trains only |
| Airport | Begumpet is the airport (Shamshabad is 2008) | ✔ The flight leaves Begumpet |
| US consulate | None in Hyderabad until 2008 | ✔ Abba's visa interview was in Chennai |
| Prasads IMAX | Opens Fri 25 Jul 2003; India's third IMAX; no "biggest screen" claim | ✔ Fence before, opening day in M9, fictional documentary, no 3D-glasses claim |
| NTR Gardens | Open (creation date 15 Dec 2001) | ✔ Open all year; ride called a "mini train" |
| Rythu Bazaars | Open since 1999 | ✔ |
| HITEX | Opens 14 Jan 2003 | ✔ Radio mention on M1's day |
| Cyber Towers / HITEC City | 1998 / growing | ✔ Cranes and boulders around new glass |
| Chowmahalla, Falaknuma, King Kothi, Hill Fort Palace, Rashtrapati Nilayam, Errum Manzil | Gated in 2003 | ✔ Gates and views only |
| Nizam's Museum | Opened 2000 | ✔ Fine for 2003 (ambience) |
| Kachiguda | Electrified during 2003 | ✔ Drawn consistently with no overhead wires all year |
| Charminar | Traffic roundabout, floodlit from outside, clocks not claimed to chime | ✔ Buses circle until 22:00; the clock "keeps time", never strikes |
| Charminar–Golconda tunnel | Legend | ✔ Always "they say"; there is no tunnel |
| Gowliguda hangar, Hotel Madina, Garden Café, Koti pavement books, Odeon | Standing and in use in 2003 | ✔ Shown as they were; no later events mentioned |
| Snow World, malls, Eat Street, Lumbini laser show | After 2003 | ✔ None appear |
| Mobile phones, smartphones | Rare; none in story | ✔ STD booths, landlines, a pager joke on the radio only |
| Internet | Browsing centres with dial-up, ₹20 an hour | ✔ Invented café name; no real email providers named |
| Notebooks | No "Classmate" (2003 launch) | ✔ Unbranded slam book and notebooks |
| Iyengar bakeries | One or two "new from Bangalore" | ✔ Used sparingly (SA3, SA8) |
| Glass "Chinese" manja | Banned and dangerous | ✔ Cotton *saddi* only; said in dialogue |
| Tobacco | No cigarettes, no VST, no "Charminar" cigarettes | ✔ RTC X Roads named only after the bus corporation |
| Films and stars | Fictional titles, no living star named | ✔ *Toofan Tammudu*, *Mass Maharaju*, "the Megastar" |
| Songs | No real lyrics or audio | ✔ Fictional stations and songs from `audio.js`; dedications only |
| Real people | No private individuals; real owners never named | ✔ All characters invented; Faramarz's café is invented with its own id |
| Gokul Chat | Joyful only | ✔ Pani puri and samosa-ragda, nothing else |
| Buddha statue history | Only "stood on its rock in 1992" if mentioned | ✔ Only "one single block of granite" |
| Religious places | Walk-only, respectful | ✔ No chases, spying or jokes at faith; mosque gates are walk-up-only respect zones during the M12 chase |
| Dates | Weekdays consistent with 2003 | ✔ §1.4 (two dates derived and flagged) |
| 2026 frame | No modern city art; nothing post-2003 visible in the playable epilogue | ✔ Text-card prologue; epilogue reuses the 2003 map |

---

## 12. Implementation notes for the other modules

1. **New place ids** for `worlddata.js`: `irani_cafe_19` (+ alias `cafe_noor_e_iran`),
   `recording_centre_1`, `electronics_shop_1`, `charminar_gallery` (virtual viewpoint). Rename the
   sign of `irani_cafe_7` to "Café Gulistan".
2. **Clock:** `N.clock.baseDate = [2003, 0, 14]`; mission starts set day/time; `N.flags.year`
   switches 2003/2026 portraits and sprites; `N.flags.prasads_open` swaps the fence for the cinema.
3. **Minigame params used:** `kite {target}`, `clap {skin:'golconda'|'drums'|'doorway', rounds}`,
   `cricket {target, overs, wickets, bowler}`, `antenna {time}`, `panipuri {target}`,
   `bargain {who:'kite'|'farmer'|'books', start, target}` (unknown skins fall back to `'auto'`),
   `marbles`, `brickgame`. All take `intro` with the story line shown on the how-to card.
4. **New SFX request:** `dappu` (a short teenmaar roll) for M8's REC; fallback `temple_bell`.
5. **HUD:** tape counter `SIDE A 000` beside the VHS strip; the greyed `■ PAUSED` state;
   `● REC` prompt; the J-card line on MISSION PASSED; two chappal icons of different sizes on
   Chand Raat.
6. **Journal pages:** Story so far (the diary with red ink), Side A track list (replay), The Tin,
   The Lock, Kites, Golis, Cassettes, Tickets, Nanna's album (Frames), Trivia cards, Hyderabadi
   dictionary (§10).
7. **Respect zones:** a `respect` flag on the compounds of every temple, mosque, dargah, church,
   gurudwara and ashurkhana, Charminar's interior, and procession paths: no running, meter frozen,
   pursuers stop at the boundary. During M12 a watchman and worshippers stand at the Mecca Masjid
   and Jama Masjid gates (walk-up only, no entry during the chase; the pursuer AI avoids them).
8. **Tank Bund statues** are counted 1 to 12 from the Lumbini (south-west) end; M10 uses idx 7.
9. **Renaming:** New Game DOM card (no `prompt()`), tokens `{nick}`, `{full}`, `{FULL}`.
10. **Saving:** the story saves after every MISSION PASSED and at any STD booth; the interlude
    and the ending are not interruptible.
