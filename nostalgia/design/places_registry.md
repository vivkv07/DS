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

3. **Everyday elements, many instances across colonies and markets** (ids are
   prefixes; number them, e.g. `irani_cafe_1`):
   `school_*` (colony schools with a ground and gate), `kirana_*` (kirana stores),
   `banana_cart_*` and `flower_cart_*` (pushcart vendors), `stationery_*`
   (stationery shops: notebooks, Camlin/Natraj-style geometry boxes, brown cover paper),
   `pindi_girni_*` (flour mills with their thumping machines and flour-dusted uncle),
   `playground_*` (small colony playgrounds with dusty cricket pitches, swings, slides),
   `irani_cafe_*` (Irani cafes: chai, Osmania biscuits, bun maska, jukebox-era decor).

## Era note

The core of the game is the 1990s. Prasads IMAX (2003) and NTR Gardens (about 2000)
came just after, but the user wants them in, so they are in. Handle it honestly and
with charm: the story may span the late 90s into the very early 2000s, or show them
in a present-day or "years later" scene, or as fenced construction sites with
"coming soon" hoardings that later open. They must still be visitable and recognisable.
Everything else stays true to the 1990s.

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
