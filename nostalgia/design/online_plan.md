# NOSTALGIA online: single-player launch plan

*Launch lead, 2026-10-17. Owner: "For now it should be single player… we can plan on shared later." Scope: 1000+ people playing at once, each in their own browser, plus optional cloud saves and leaderboards; the shared world appears only in the appendix. Inputs: `design/online/hosting_research.md` and `design/online/delivery_measurements.md`. **(measured)** = our scripts, **(est.)** = my estimate, **(unverified)** = third-party source only. Prices are from 2026 searches; check the vendor page before paying. Completeness review, same day: sizes re-measured on the 17:47 build; legal, accessibility, India-network and browser-matrix sections added (§2.10, §2.11, §3.1, §7.1); review log at the end.*

---

## 1. Summary for the owner

**Recommendation.** Host on **Cloudflare (Workers static assets) under our own domain**, deployed by a GitHub Action. Use the **claude.ai artifact link** only for private playtests, and add an itch.io page later. Do not launch on Netlify Free, Vercel Hobby or Firebase Spark: each pauses the site once a small bandwidth quota is used up (hosting_research §3).

**Why 1000 people at once is easy.** There is no game server: each player's city, traffic, story and audio run on their own phone. Our host hands a new visitor static files once (~0.8 MB after the fixes below; 1.2–2.1 MB today, depending on whether the inline 3D pack is counted, §2.1). After that the browser cache or service worker serves repeat visits with **0 bytes** from us (measured). 1000 simultaneous first visits are 0.8–2.1 GB, ~11–28 Mbit/s over a 10-minute WhatsApp wave (est.), which is trivial for a CDN. The real limits are phone CPU, patchy 4G and daily data caps (§3, §3.1).

**Cost at a glance** (maths in §6):

| | Launch day (1000 concurrent) | 10k players/month | 100k players/month |
|---|---|---|---|
| Static hosting (Cloudflare) | **$0** | **$0** | **$0** (static requests are free and unlimited) |
| Domain (`.com`, incl. 18% GST) | ~$12–13/year (est., §2.3) | same | same |
| CI, analytics, error reports | $0 | $0 | $0 |
| Optional cloud saves and leaderboards | $0 | $0 | ~$6–7/month incl. GST (est.) |
| **Total** | **~$1/month** | **~$1/month** | **~$1–8/month** |

Cloudflare has charged Indian GST since 1 Oct 2023 ([sales tax](https://developers.cloudflare.com/billing/understand/sales-tax/)). The 18% rate comes from secondary sources (unverified). The `.com` wholesale price rises on **1 Nov 2026** (§2.3).

**Time to play, mid-range Android** (4x CPU; today measured, targets est. from measured parts):

| Title screen usable | Fast 4G | Slow 4G | 3G | Repeat visit |
|---|---|---|---|---|
| Today | 5.0 s | **12.0 s** | 31–32 s | 4.3–5.5 s, fails offline |
| Launch target | ≤ 4 s | **≤ 8 s** (est. ~7) | ≤ 22 s (est. ~20) | **≤ 3 s** (est. 2–2.5), **works offline** |

**Timeline:**
- **Days 1–4, soft launch to friends and family:** today's build on Cloudflare with domain, share card, analytics, CI, save-on-hide, credits and privacy page (Phase A, ~4 dev-days).
- **Weeks 1–3, launch build:** chunks, offline play, fonts, save export, faster boot, accessibility, a browser gate and a real-phone pass (Phase B, ~20.5–25.5 dev-days, §9). Three weeks assumes **two people (or parallel agents) working at once**. Solo, plan on ~5 weeks (est.).
- **Week 4 (two people) or week 6 (solo):** public WhatsApp launch.
- **Later, optional:** cloud saves and leaderboards (Phase C, ~2 weeks).

---

## 2. Launch checklist for this repo

### 2.1 Build and versioned splitting

Keep `node nostalgia/tools/build.mjs` producing `dist/nostalgia.html` (offline and `file://` copy) and `dist/artifact.html` + `artifact.files.json` **unchanged**. Add a `--web` target (new) writing `dist/web/`.

**Fix this before the soft launch.** Since 16:50 today, `dist/nostalgia.html` inlines the model pack and GLTFLoader as `text/plain` blocks. The 17:47 build is **8.33 MB raw, 2.58 MB gzip -9, 2.00 MB brotli -11** (measured, critic re-run). The pack now holds 4 models (`kid_chinnu`, `hero_cycle`, `adult_man`, `charminar_proto`): `src/assets3d_pack.js` is 2.76 MB raw / 757 KB brotli (measured). That is up from 1.16 MB brotli for the 16:44 file, so every 2D player would download **~0.78 MB of 3D models and loader** they never use. The pack is still growing towards ~8 MB, which would make the single file ~13–14 MB raw (est.). `dist/artifact.html` keeps the pack as a supporting file and is 5.44 MB raw / 1.22 MB brotli (measured).

The Phase A `--web` build therefore leaves those blocks out and copies `src/assets3d_pack.js` and `vendor/three/*` next to `index.html`. `models3d.js` already falls back to that file (`PACK_URLS`, line 51). The itch.io upload, if any, should also use a build without the inline pack (itch serves gzip only, hosting_research §4.6).

**Amend ARCHITECTURE §2 for the web target only.** Today it allows "only Google Fonts" as a fetch and forbids downloads. The web build also fetches its own chunks, fonts and models, the analytics beacon and `/api/*`, and offers a save-file download (§4). The single-file and artifact targets keep today's rules.

**Phase B layout:** a few ordered chunks, not 36 files (that split pushed the Slow 4G splash from 1.6 s to 5.8 s, measured).

```
index.html                 ~7 KB: critical CSS, fonts, OG tags, splash, SW registration
assets/boot.<h>.js         core…main, 488 KB br
assets/play.<h>.js         seasons…collectibles, 273 KB br
assets/activities.<h>.js   story2…playground_games, 295 KB br, lazy
assets/3d.<h>.js           view3d*, models3d, 179 KB br, lazy
assets/three.r149.<h>.js   lazy
models/<id>.<h>.glb        lazy, per model
fonts/  sw.js  manifest.webmanifest  build.json  og.jpg  404.html  status.html  _headers
```

`<h>` is a 10-character content hash. `build.json` (`{build, chunks, date}`) is the client version for the service worker, error reports and a future shared world.

### 2.2 Hosting config (headers, caching, compression, MIME)

**`nostalgia/wrangler.jsonc` (new).** An assets-only Worker with no script, so every request is free static traffic:

```jsonc
{ "name": "nostalgia", "compatibility_date": "2026-10-01",
  "assets": { "directory": "./dist/web", "not_found_handling": "404-page" },
  "workers_dev": true, "preview_urls": true,          // emergency address + per-version previews
  "routes": [{ "pattern": "play.<our-domain>", "custom_domain": true }] }
```

The path is relative to `nostalgia/`, the CI `workingDirectory`. **The first deploy is manual:** `node nostalgia/tools/build.mjs --web && cd nostalgia && npx wrangler@4 deploy`. `versions upload` is meant for a Worker that already exists (est.; [version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) need Wrangler ≥ 3.74 and are public when enabled).

`404-page` serves our `404.html` with a real 404 status, so a mistyped `.glb` URL never returns HTML with a 200 ([routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/index.md)).

**`_headers`**, which Workers static assets supports ([docs](https://developers.cloudflare.com/workers/static-assets/headers/)):

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/models/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: model/gltf-binary
/manifest.webmanifest
  Content-Type: application/manifest+json
```

- **Unhashed files** (`index.html`, `sw.js`, `build.json`) keep Cloudflare's default `max-age=0, must-revalidate`, so a deploy is seen at once.
- **Compression:** automatic for text types, zstd by default on Free with brotli and gzip fallbacks ([docs](https://developers.cloudflare.com/speed/optimization/content/compression/)). `.glb` is not compressed, so compress geometry at build time.
- **When `/api/*` exists:** set `run_worker_first` only for `/api/*`. Requests that invoke the Worker count toward the free 100k per day and then get a 429 ([billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations)).
- **After the first deploy:** run `curl -sI -H 'Accept-Encoding: zstd, br, gzip'` on `/`, a chunk, a `.glb` and `/nope`.

### 2.3 Custom domain (optional but strongly advised)

Put the game, the API and later `/ws` on one domain we own. The 2026 `*.supabase.co` block in India (hosting_research §8.2) showed that a vendor subdomain can vanish for Jio and Airtel users overnight. localStorage saves are per origin, so **the launch domain must never change** (§4).

- **Price:** Cloudflare Registrar sells `.com` at cost ([mystrika](https://blog.mystrika.com/cloudflare-registrar-review/), unverified). Verisign's `.com` fee rises from $10.26 to $10.97 on **1 Nov 2026**, so the at-cost floor with the $0.20 ICANN fee goes from $10.46 to $11.17. Further rises of up to 7% a year are allowed ([Openprovider](https://www.openprovider.com/blog/com-price-increase-domain-resellers), [tldes](https://tldes.com/pages/com-price-increase-2026); secondary sources). With 18% GST that is **~$12.3–13.2/year (est.)**. `.in` support on Cloudflare Registrar is still unconfirmed: its [TLD list](https://developers.cloudflare.com/registrar/top-level-domains/) claims 400+ TLDs but does not show `.in` in what we could see. If we want `.in`, register it elsewhere and point its nameservers to Cloudflare.
- **Buy 3–5 years up front, before 1 Nov 2026 if possible.** One secondary source says terms bought before the rise keep today's price. This also covers an India-specific failure: recurring card charges abroad need an e-mandate under the RBI's 2026 e-mandate framework (the first debit needs extra authentication; later debits up to ₹15,000 do not; [taxmann](https://www.taxmann.com/post/blog/rbi-e-mandate-framework-for-recurring-payments)). Auto-renew can fail silently on a replaced or expired card. **If the domain lapses, every link in every WhatsApp group dies, and every localStorage save on that origin is lost to its player.**
- **Setup:** auto-renew on, a backup card, a calendar reminder 60 days before expiry, and 2FA on the Cloudflare account. `play.<domain>` is canonical; `workers.dev` is the emergency address.

### 2.4 CI deploy from GitHub

`vivkv07/DS` is private: 2,000 free Actions minutes a month ([cicdcost](https://cicdcost.com/github-actions-pricing), unverified; quotas unchanged in 2026 per GitHub's [changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/)), so 300+ deploys at ~5 min each (est.). `.github/workflows/nostalgia-web.yml` at the repo root:

```yaml
name: nostalgia-web
on:
  push:
    branches: [claude/nostalgia-hyderabad-game]   # preview version
    tags: ['nostalgia-v*']                         # production
    paths: ['nostalgia/**', '.github/workflows/nostalgia-web.yml']
concurrency: { group: nostalgia-${{ github.ref }}, cancel-in-progress: true }
permissions: { contents: read }
jobs:
  web:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: node nostalgia/tools/build.mjs --web              # (new flag)
      - run: node nostalgia/tools/perf/sizes.mjs --budget      # (new) fail over the §3 budget
      - run: npm i --no-save playwright@1.56.1 && npx playwright install --with-deps chromium
      - run: node nostalgia/tools/og_card.cjs --page nostalgia/dist/nostalgia.html --out nostalgia/dist/web   # (moved, A3)
      - uses: cloudflare/wrangler-action@v3
        with:
          wranglerVersion: '4.120.0'                         # pin an exact 4.x; the action's own default is older
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: nostalgia
          command: ${{ startsWith(github.ref, 'refs/tags/') && 'deploy' || 'versions upload' }}
```

- **Token:** "Edit Cloudflare Workers" only, scoped to our account ([docs](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)). Add the two secrets with `gh secret set CLOUDFLARE_API_TOKEN -R vivkv07/DS` (and the same for `CLOUDFLARE_ACCOUNT_ID`).
- **Releases:** branch pushes upload previews, a tag ships production, and `wrangler rollback` undoes it.
- **Wrangler pin:** `4.120.0` is a published 4.x release (seen on [unpkg](https://app.unpkg.com/wrangler@4.120.0/files/README.md)). Pin whichever exact 4.x is current at setup time. A third-party page says the action's built-in default is Wrangler 3.90 ([DeepWiki](https://deepwiki.com/cloudflare/wrangler-action/2-installation-and-configuration), unverified).
- **First, these scripts must run in CI.** `tools/perf/measure.cjs`, `og_card.cjs`, `profile_boot.cjs` and `tests/smoke.cjs` all `require('/opt/node22/lib/node_modules/playwright')` (checked). Change them to `require('playwright')`. `og_card.cjs` writes `og_q60/70/80.jpg`, `og.png` and `og.json` today. The moved copy must write only `og.jpg` (q70) into `dist/web`, so the 699 KB PNG and the JSON are never published.

### 2.5 claude.ai artifact preview link

Publish `dist/artifact.html` with the files in `dist/artifact.files.json`. It is private by default and shared from the Share menu. Viewers may need a Claude account ([help](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts)), so use it for testers, not WhatsApp groups. Limits: a 16 MB page, no service worker, its own save origin, and **downloads are blocked inside the frame**, so save export (§4) has a no-download path.

**None of the web-only features exist or are expected to work there**, and the single-file builds must not try them:
- no PWA install
- no analytics beacon, Sentry or `/api/*` beacons
- no OG card
- no `persist()`

`navigator.share`, `navigator.clipboard` and opening a `wa.me` link may also be refused by the frame's permissions (unverified), so the artifact relies on the selected-textarea copy fallback (§4). The build should set one flag for this (e.g. `N.BUILD.target = 'web' | 'single'`) instead of sniffing hostnames.

### 2.6 WhatsApp share card

```html
<meta property="og:title" content="NOSTALGIA: Hyderabad, 2003">
<meta property="og:description" content="Be Chinnu, 11. Ride your cycle from Himayatnagar to Charminar. Free in your browser, no download.">
<meta property="og:image" content="https://play.<our-domain>/og.jpg">
<meta property="og:url" content="https://play.<our-domain>/">
<meta name="twitter:card" content="summary_large_image">
```

- **Image:** `og_card.cjs` (moved out of `tools/perf/`) screenshots the title headless at 1200×630: **103 KB** as JPEG q70 (measured), under WhatsApp's ~300 KB limit (unverified). The PNG would be 699 KB. Nothing binary goes into git.
- **Share button:** "Share with your gang" uses `navigator.share` ([web.dev](https://web.dev/articles/web-share)), else an `<a href="https://wa.me/?text=…">` link (ARCHITECTURE §2 forbids `window.open`). When framed (artifact, itch), it shows "Copy link" instead.
- **No brand names in marketing copy.** The share text, store pages and `og.jpg` should not name brands. The earlier draft said "Hero cycle", a trademark. In-game mentions as cultural references stay allowed (ARCHITECTURE §2).

### 2.7 Privacy-friendly analytics

- **Day one:** the Cloudflare Web Analytics beacon, web build only. Free, no site limit when proxied ([limits](https://developers.cloudflare.com/web-analytics/limits/)), and no cookies or fingerprinting per Cloudflare ([about](https://developers.cloudflare.com/web-analytics/about/)). A launch-era review saw a cookie ([ctrl.blog](https://www.ctrl.blog/entry/review-cloudflare-analytics/)), so check.
  - With automatic setup on a proxied domain, reports go to our own `/cdn-cgi/rum`. A `Cache-Control: no-transform` header stops the injection ([FAQ](https://developers.cloudflare.com/web-analytics/faq/)).
  - The beacon script itself is fetched from Cloudflare's insights domain (unverified). That makes it the one third-party runtime request. It is async and non-critical: if it is blocked we lose counts, never the game.
  - The service worker must pass `/cdn-cgi/*` straight to the network.
- **Later:** ID-free aggregate events (`title_ms`, `chunk_fail`, `view_3d`, `chapter_done`) to `/api/ev`, stored in Workers Analytics Engine (100k points/day free, not billed yet; [pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing)).
- **Why so little:** children play, and India's DPDP Rules restrict tracking minors (hosting_research §7; not legal advice).

### 2.8 Error reporting without personal data

`core.js` already keeps the last 50 errors in `N.errors` (from `window.onerror`, `unhandledrejection` and `N.err`). A new `src/report.js` (~40 lines) sends `navigator.sendBeacon('/api/err', {build, where, msg, mode, view, tier})` on `pagehide`: at most 3 per session, 25% sampled, with URLs and the player's chosen name (`profile.nick`, `profile.full`) stripped.

`src/report.js` also needs a `<script>` line in `index.html`, in the ARCHITECTURE §3 load order. It only runs when `N.BUILD.target === 'web'`.

Until `/api` exists, use Sentry's free Developer plan (5k errors/month; [toolradar](https://toolradar.com/tools/sentry/pricing), [bugnet](https://bugnet.io/blog/sentry-pricing-for-game-studios), unverified; what happens at the quota on the free plan is unconfirmed) with `sendDefaultPii: false` and IP storage off. It is a stopgap on a third-party domain, **web build only**: the artifact's script allow-list would block its SDK anyway. Name it as a processor in the privacy notice (§2.10). The alternative is no stopgap at all: rely on the feedback form until `/api/err` exists.

### 2.9 Status and feedback channel

- **WhatsApp Channel, "NOSTALGIA updates":** one-way, followers' numbers hidden ([guide](https://messengerbot.app/whatsapp-channels-2026-what-they-are-and-how-to-use-them/), unverified). For release notes, outages and the mirror link.
- **`/status.html`:** written by CI, with the build id and known issues.
- **Uptime monitor on another provider:** Better Stack free has 10 monitors and 1 status page ([toolradar](https://toolradar.com/tools/better-stack), unverified).
- **Feedback:** a pause-menu link to a multiple-choice form (bug / slow / loved it / missing place) that collects no email.

### 2.10 Legal basics: credits, licences, privacy (not legal advice)

Going public means redistributing third-party data and code, so each has to be credited correctly. Status is from the repo today.

| What ships | Licence | What we must do | Today |
|---|---|---|---|
| **Map: roads, water, rail, parks, infill streets** in `src/worlddata.js` (from OSM via Overture Maps and the Geofabrik Hyderabad extract, per its header) | **ODbL 1.0** | (1) "© OpenStreetMap contributors" where the map is shown. OSM's guidance for a browsable map is its corner ([attribution advice](https://wiki.openstreetmap.org/Attribution)), so add a small line to the full-screen city-guide map in `menus.js`, plus the credits. (2) Say the data is available under the ODbL (ODbL §4.3). (3) **Share-alike.** `worlddata.js` ships the derived data in machine-readable form. ODbL §4.6 then requires us to offer that derived database, or the method to rebuild it ([OSMF Produced Work guideline](https://osmfoundation.org/wiki/Community_Guidelines/Produced_Work_-_Guideline)). Publish the OSM-derived layers (`design/geo/roads.json`, `osm_streets.json`, `water.json`, `rail.json`, `osm_landuse.json`) as `/data/map-odbl.zip` under the ODbL, and link it from the credits. The game code itself does not become ODbL. | Credit line only in `story2.js`; no corner notice on the map; no data offer |
| Overture Maps Foundation (source of the road layers) | ODbL for the OSM-derived parts ([AWS registry](https://registry.opendata.aws/overture/)) | Use Overture's own line, "© OpenStreetMap contributors, Overture Maps Foundation" ([Overture attribution](https://docs.overturemaps.org/attribution)) | Missing |
| **Ward boundaries** (DataMeet Municipal Spatial Data, GHMC wards) | **CC BY 4.0** per the [project page](https://projects.datameet.org/Municipal_Spatial_Data/). Some DataMeet repos use CC BY-SA 2.5 India instead, so confirm the Hyderabad folder's own licence. | Credit, licence link, and a note that it was changed ("wards merged into game districts and re-projected") | Credit without link or change note (`story2.js`) |
| Stations (datameet/railways, CC0), elevation (SRTM via AWS Terrain Tiles, public domain), landmark coordinates from Wikidata (CC0) and Wikipedia (`design/geo/places.json` cites them per entry) | None for CC0 or public domain; Wikipedia text is CC BY-SA, but we use only individual coordinates | Thank them in the credits (courtesy) | – |
| **three.js r149 + GLTFLoader** | **MIT** | Keep the `@license` header in the hashed `three.r149.<h>.js` (no comment-stripping minifier). Ship `licenses/three.txt` (copy of `vendor/three/LICENSE`). Keep the credit line. Same for meshoptimizer's decoder (MIT) if B7 adds it. | Header and `LICENSE` present (checked); credit only via `story2.js` |
| **Fonts:** Baloo 2, Yatra One, VT323, Kalam (Noto Sans Telugu is dropped in B4) | **SIL OFL 1.1** | Loaded from Google: nothing to do. **Self-hosted subsets (B4) are redistributed, modified fonts:** ship `fonts/OFL.txt` with each family's copyright line. Google's files keep the copyright in the font's name table but carry no licence text (checked on the mirrored WOFF2s). Check each family's `OFL.txt` in google/fonts for a Reserved Font Name; if one is declared, the subset must be renamed (OFL FAQ). | n/a until B4 |
| Blender models, procedural art, synthesised audio | Ours (`tools/blender/*.py`) | Rule: no third-party model, texture or sound without recording its licence here | OK |

**A lazy-loading trap.** The map, ward and three.js credit lines live in `story2.js` (`CREDIT_LINES`, added by `patchCredits()` at boot). The web build moves `story2.js` into the lazy activities chunk, so the title screen's CREDITS would silently lose all attribution. **Move those lines into `menus.js` `CREDITS`** (boot chunk) in Phase A.

**Credits and privacy pages:** add an "About & licences" item on the title. It opens `/credits.html`: full licence texts and the ODbL data link.

**`/privacy.html`** (DPDP; hosting_research §7). Linked from the title and the share page, it says:
- **Stays on this phone:** saves, settings and the photo album.
- **Is sent:** cookieless visit counts (Cloudflare), error reports without names, and later an optional cloud-save blob with a random id. Cloudflare (and Sentry, if the §2.8 stopgap is used) are processors.
- **Is never collected:** accounts, email, names, location or ads.
- **Contact:** an address for questions.

### 2.11 Accessibility

**Already in the game** (`menus.js` settings, checked):
- reduced motion, following `prefers-reduced-motion` by default (`view3d.js` honours it too)
- flash reduction, captions and high contrast
- deutan, protan and tritan colour modes
- left-handed controls and S/M/L touch buttons
- text speed up to instant, and auto-advance
- a relaxed difficulty ("Aaram Se") and an assist option
- `aria-label`s on the panels

**Gaps before the public link** (B12, ~1 day):
1. **`index.html` sets `maximum-scale=1, user-scalable=no`.** This blocks pinch-zoom on every menu and text panel in Chrome (iOS ignores it). Prefer `touch-action: none` on the game canvas and touch controls, and drop the viewport lock. If double-tap zoom then breaks the controls on a real phone, keep the lock and rely on item 2.
2. **There is no text-size setting.** Add S/M/L for dialogue, HUD and menus. The audience is 30–40 with parents playing along.
3. **Mark Telugu text** (`nameTe` labels, glossary) with `lang="te"`. The page is `lang="en"`, so screen readers and font fallback guess wrong.
4. **Touch targets** must be at least 24×24 CSS px ([WCAG 2.2 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)); aim for 44–48 px on the title and the Save & Load panel.
5. **3D stays opt-in** and its menu entry warns about motion. No information is carried by sound alone (captions exist).
6. **QA in B11:**
   - TalkBack through the title, settings and the save-code panel
   - a keyboard-only desktop run
   - 200% browser zoom on desktop
   - colour modes on the city map

A screen-reader-playable action game is not a goal; readable, zoomable menus are.

---

## 3. Performance budget and fixes

Mid-range Android at 4x CPU, Slow 4G unless stated. CI enforces bytes; `tools/perf/campaign.sh` checks times before each release.

| Metric | Today (measured) | Launch budget |
|---|---|---|
| Bytes before title, first visit | 1.21–1.27 MB (16:44 file); **2.00 MB br + ~65 KB fonts** with the inline 4-model pack (17:47 file) | **≤ 0.80 MB** |
| Splash painted | 1.6 s (3G 4.6–5.7 s) | ≤ 1.5 s (3G ≤ 3.0 s) |
| **Title usable** | **12.0 s** (Fast 4G 5.0, 3G 31–32) | **≤ 8 s** (Fast 4G ≤ 4, 3G ≤ 22) |
| Boot CPU, DOMContentLoaded → title | 3.7 s (`world.build` 2.3–2.5 s) | ≤ 2.0 s |
| PLAY → name card / START → first frame | 1.0–1.7 s / 1.5–1.9 s | ≤ 1.0 s each |
| Repeat visit → title | 4.3–5.5 s, offline fails | **≤ 3 s, offline works** |
| V → 3D usable / models in | 9.3 s / 27 s | ≤ 10 s / ≤ 12 s |
| 2D frame rate, Old City | to verify on a phone | ≥ 30 fps |

**Fixes, in order.** Wins are from delivery_measurements §8.
1. **Chunked web build.** 1.16 → 0.75 MB brotli; all scripts run by 5.3 s instead of 7.9 s on Slow 4G, and by 18.0 s instead of 27.2 s on 3G (measured).
2. **Service worker.** Precache the boot set, cache-first for hashed files, network-first (3 s timeout) for the page. Repeat visits move 0 bytes and boot offline (measured). Offer updates **only on the title screen**; never cache `/api/*`.
3. **Self-hosted subset fonts and inline critical CSS; drop Noto Sans Telugu**, which is never downloaded today. The splash comes 1.6 s sooner on 3G (measured).
4. **`world.build` off the critical path.** Cache it in IndexedDB keyed by the worlddata digest, and build the spawn district first: est. −1–2 s.
5. **Lazy-load** activities (after the title or at their trigger), and 3D plus three.js on V, prefetched only on `effectiveType === '4g'` without `saveData`. Ship models as binary `.glb` (−16% bytes, measured), and don't boot returning players straight into 3D. The first V press shows the download size ("3D needs ~3 MB"), because of daily data caps (§3.1).
6. **Small items:** defer the `audio.js` startup work to the first tap, show splash progress, and cap simulation sub-steps at 2–3 on the low tier.

**PWA.** Add a manifest (name, icons, `display: fullscreen`). Offer "Add to Home screen" after chapter 1. Installed apps get persistent storage more readily, and on iOS their own storage counter (§4).

### 3.1 India network realities

- **Medians are fast; our players live in the tail.**
  - Ookla's India mobile median was 96 Mbps in Aug 2024 ([tele.net.in](https://tele.net.in/india-jumps-eight-spots-in-median-mobile-download-speed-says-ookla-study/)), and ~127 Mbps in May 2026 per a secondary site ([laenderdaten](https://www.laenderdaten.info/Asien/Indien/telekommunikation.php), unverified).
  - WhatsApp links get opened indoors, in Old City lanes, on buses and at the evening peak. So the budget targets the Slow 4G column, not the median.
- **Daily data caps.**
  - Common prepaid plans give 1–2 GB a day, then throttle to **64 kbps** ([telecomtalk, 2026 packs](https://telecomtalk.info/fifa-worldcup-2026-airtel-reliance-jio-vi/1008809/); some Airtel packs bill per MB instead).
  - At 64 kbps, the web build's 0.8 MB first visit takes ~100 s, and the 2.6–3.5 MB 3D set takes ~5.5–7.5 min (est. = bytes × 8 ÷ 64 kbit/s).
  - Hence: a small first load, the service worker (repeat visits don't depend on the cap), no automatic 3D download, and the size prompt in fix 5.
- **IPv6 and shared IPv4.**
  - Jio is ~97% IPv6-capable and Airtel mobile ~91% (APNIC figures, 2020–2023, dated; [APNIC](https://blog.apnic.net/2023/06/05/four-of-the-worlds-top-10-populous-economies-driving-ipv6-adoption/)). IPv4 users mostly sit behind carrier NAT (hosting_research §8.2).
  - Cloudflare serves IPv6 by default.
  - Any Phase C rate limit should key IPv6 clients by /64 and keep IPv4 limits loose.
- **Browsers** ([Statcounter, India mobile, July 2026](https://gs.statcounter.com/browser-market-share/mobile/india)):
  - Chrome ~88%
  - **Opera ~4.7%**: Opera Mini's data-saving mode does not run a canvas game (§7.1)
  - Safari ~4.3%
  - UC ~1.7%
  - Samsung Internet ~0.6%
- **WhatsApp's own browser.**
  - WhatsApp has tested an in-app browser for some business links ([WABetaInfo](https://wabetainfo.com/whatsapp-beta-for-android-2-25-14-10-whats-new/)), not confirmed for all links.
  - Custom Tabs share Chrome's storage; a WebView would not. Check on a device (§7).
- **Blocks.** Section 69A orders have hit developer domains (`*.supabase.co` in 2026, GitHub subdomains in 2023; hosting_research §4.2, §8.2). Hence one domain we own, and a mirror link.
- **Paying from India.** GST on Cloudflare invoices, and RBI e-mandate rules for auto-renewals (§2.3).

---

## 4. Save safety

**What is stored, and how big:**
- **The game:** the save `nostalgia.save.v1`, its `.bak` copy, and the `.manual` slot. Each save is 2.0–5.8 KB (measured).
- **Preferences:** `profile`, `settings`, `audio`, `view`, `minigames`, `collectibles.prefs` and `models3d.proto` (all `nostalgia.*.v1` keys except the last; checked by grep).
- **The photo album:** `album.v1`, 23 small JPEG data URLs, est. 70–140 KB.
- **Total:** well under the ~5 MiB localStorage allowance per origin ([MDN](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). **Quota is not the risk.**

**The real risks:**
1. **Android discards the tab** (380–500 MB in play). `main.js:195` pauses on `visibilitychange` but does not save. Fix: autosave on `hidden` and `pagehide`, outside cutscenes and minigames, without a toast.
2. **Safari's 7-day cap** deletes script-written storage after 7 days of Safari use without visiting the site. Home-screen apps keep their own counter ([Search Engine Land](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519); a [WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=237350) reports exceptions; unverified today).
3. **Cleared storage** (by players or cleaner apps): everything is gone unless exported.
4. **Separate saves per origin:** artifact, itch, `workers.dev`, our domain, maybe WhatsApp's in-app browser (unconfirmed).
5. **Private mode:** already handled; `save.js` keeps the save in memory and says so.
6. **A bug to fix:** `parse()` rejects `v > VERSION`, `current()` falls back to `.bak`, and the next save **overwrites newer progress** when a stale cached client meets a newer save.

**Export and import** (`save.js` + the Save & Load panel in `menus.js`):
- **Save code:** `NOS1-` + base64url(gzip(JSON)) + a checksum, built with `CompressionStream`, which has been Baseline since 2023 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/readable)). Est. ~2.5k characters, so it is meant for copying, not typing.
  - **Older Safari:** before iOS 16.4 there is no `CompressionStream`, so emit `NOS0-` + base64url(JSON) instead (est. ~8k characters, still pasteable). Import accepts both.
  - **Buttons:** **Copy code** (`navigator.clipboard`, falling back to a selected textarea plus `execCommand('copy')`, or the player long-pressing it) and **Send to WhatsApp** (`navigator.share({text})`, "Message yourself"; hidden when unsupported).
  - **Inside the artifact frame:** the frame's permissions may refuse clipboard and share (unverified). The selected-textarea path is the one that must always work there, so test it in the artifact before calling export done.
- **File:** **Download `nostalgia-save.json`** appears only on the real host. Hide it when framed (`window.top !== window`) or when `window.claude` exists. Import takes a pasted code or `<input type=file>`. Amend ARCHITECTURE §2 ("no downloads") to allow this.
- **Nudges:** after chapter milestones, "Your progress lives only on this phone. Copy your save code?" The title shows "Last backed up: never".
- **`navigator.storage.persist()`** after the first save. Chrome decides silently, based on engagement and install state ([web.dev](https://web.dev/articles/persistent-storage)).

**Versioned migrations:**
- `MIGRATIONS[v]` in `save.js` steps a blob from `v` up to `VERSION` before deserializing. Before the first migration, the raw string is copied once to `.pre-v<N>`.
- A save that is "too new" becomes its own state: the title says "Saved by a newer version. Tap to update," the service worker updates, and **nothing overwrites it**.
- Each migration gets a fixture test with a real v1 blob in `tests/save.cjs` (new).

---

## 5. Optional Phase 1 (later, still single-player): cloud saves and leaderboards (Phase C in §9)

**Backend: a Cloudflare Worker on our domain (`/api/*`) plus D1.** Saves are 1.6 KB brotli (measured), so D1 alone is enough without R2. The free tier gives 500 MB per database (~150k+ saves, est.), 5M rows read and 100k rows written per day, and queries fail beyond that ([pricing](https://developers.cloudflare.com/d1/platform/pricing/)).

**Guest identity, no accounts:**
- The device creates a random `playerId` and a secret; the server stores only the secret's hash.
- `POST /api/save` runs on explicit save, chapter end or quit (~1–3 per session). It returns a short restore code such as `CHAR-7K2Q-9XDM`.
- Restores are rate-limited and gated by Turnstile, which is free with unlimited challenges ([plans](https://developers.cloudflare.com/turnstile/plans/)). Rate-limit by `playerId`, IPv6 /64 or a loose IPv4 bucket, never a tight per-IPv4 limit: carrier NAT puts whole neighbourhoods behind one address (§3.1).
- **The local save stays the source of truth.** If the API is down, the game carries on.

**Leaderboards:**
- **Boards:** collectibles (of 93), race and side-job times, cricket-match scores, minigame bests (`minigames` already tracks these).
- **Checks:** server-side plausibility (count ≤ 93, time ≥ route length ÷ top speed, one post per board per minute).
- **Reads:** a snapshot `/leaderboard/<board>.json` rebuilt each minute and edge-cached, so 1000 readers do not mean 1000 database reads.

**Family-safe:** no email, login, chat or free text. Leaderboard names come from a **preset list** ("Irani Chai Ace", "Pista Pilot" + 2 digits), never `profile.full`. No IPs are stored; collecting nothing personal is the simplest fit with DPDP's rules on children.

**Cost:** $0 at 10k players a month. A sustained 1000-concurrent month (~15k sessions/day, ~45–60k API calls/day, est.) nears the free 100k Worker requests per day. D1's free 100k rows written per day is the tighter limit: each save writes a row plus its index entries, so 45k saves are ≥ 90k rows (est.). So use **Workers Paid at $5/month** (10M requests; D1 50M rows written a month). That is $5.90 with 18% GST, plus any small overage: **~$6–7/month (est.)**. The $5 is a monthly minimum for the whole account, even when usage is tiny.

**Not chosen:** Supabase (DNS-blocked in India from 24 Feb 2026, pauses when idle, 30/hour/IP anonymous sign-ins trip behind carrier NAT) and Firebase (Spark caps anonymous auth at 3,000 daily users; Storage needs Blaze).

---

## 6. Capacity math

| Per player | Bytes from our host |
|---|---|
| First visit, single file as measured at 16:44 | 1.21–1.27 MB (measured) |
| First visit, current file with inline 4-model pack | ~2.07 MB (2.00 MB br measured on the 17:47 build + ~65 KB fonts) |
| First visit, web build | **~0.80 MB** (measured, variant `f`) |
| 3D on top | +507 KB today (measured); +2.6–3.5 MB with an ~8 MB pack (est.) |
| Repeat, nothing changed | 58 B without the service worker, **0 B** with it (measured) |
| Repeat after a deploy | single file: all 1.2–2.0 MB; web build: changed chunks only, e.g. ~41 KB (est.) |

**1000 simultaneous starts:**
- **Bytes:** 0.8 GB with the web build, 1.27–2.07 GB today.
- **Rate:** 11–28 Mbit/s over 10 minutes, or 107–276 Mbit/s if all in one minute (est. = GB × 8 ÷ seconds).
- **Requests:** ~12k static requests (est.), all free.
- **3D:** if 30% open 3D with the full pack, add ~0.8–1.05 GB.

**Monthly (est.):**
- **Typical player:** 1.3 cold loads × (0.8 MB + 30% × 3 MB for 3D) + 4 deploys × 0.1 MB ≈ **2.6 MB**.
- **Worst case:** 1.5 cold loads × (0.8 + 100% × 3.5 MB) + 4 deploys × 0.3 MB ≈ **7.7 MB**.
- For comparison, hosting_research's single-file model gave 5.2–11.6 MB.
- **Totals:** **26–77 GB at 10k players** and **260–770 GB at 100k**.
- **Assumptions:** the 1.3–1.5 reload factor and the 30% 3D share are assumptions. Replace them with the analytics numbers after launch.

**When you would pay:**

| Service | Limit | Pay when |
|---|---|---|
| Cloudflare static | free, unlimited ([billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations)) | never, for bandwidth |
| Workers API (Phase C) | 100k req/day free, then 429; D1 100k rows written/day, then queries fail | sustained ~1000 concurrent → $5/month + 18% GST |
| Domain | at cost + GST | every year; `.com` rises on 1 Nov 2026, so buy 3–5 years up front (§2.3) |
| Workers Analytics Engine | 100k points/day free, "not billed yet" | if Cloudflare starts billing it: set a budget notification |
| GitHub Pages mirror | 100 GB/month soft; fixed 10-min cache; private repo needs Pro ($4/month) | fine at 10k, over at 100k |
| Netlify Free / Vercel Hobby / Firebase Spark | ~12 GB / 100 GB / ~10 GB, then **paused** | avoid as primary |
| Sentry stopgap | 5k errors/month | Team ~$26/month; replace with `/api/err` instead |
| GitHub Actions | 2,000 min/month | not at our deploy rate |

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Cloudflare outage.** 18 Nov 2025: ~3 h, full recovery ~5.8 h; further incidents 5 Dec 2025 and 20 Feb 2026 ([ilert](https://www.ilert.com/postmortems/cloudflare-global-outage-nov-2025), [pinggy](https://pinggy.io/blog/cloudflare_outage_november_18_2025/)) | Returning players play offline through the service worker. Mirror link (itch single file or a public GitHub Pages repo) pinned in the WhatsApp Channel. Status monitor on another provider. |
| **3D depends on jsDelivr** (tried first in `view3d.js` today) | Web build order: our origin, then jsDelivr, then `vendor/three/`. **Never delete `vendor/three/`**: artifact and `file://` need it. A CI test blocks jsDelivr and checks that 3D starts. |
| **ISP blocks a third-party domain** | Every runtime request goes to our domain and fonts are self-hosted. The one exception is the non-critical analytics beacon script (§2.7), plus the Sentry stopgap if it is used. |
| **Browser support:** Safari iOS (7-day cap), Opera Mini (~4.7% share with Opera), UC, Samsung Internet, the WhatsApp in-app browser, browsers too old to parse `main.js` | Feature-detect `CompressionStream`, `share`, `clipboard` and `persist`. An ES5 inline gate in `index.html` shows an "Open in Chrome" card when boot cannot work. Matrix in §7.1. |
| **Domain lapses** (card or e-mandate renewal fails) | Pay 3–5 years ahead, keep a backup card, set a reminder 60 days out (§2.3). A lapse kills every shared link and orphans every save. |
| **Attribution lost or licence breached at launch** | Credits moved into the boot chunk, an OSM notice on the city map, `/credits.html` with licence texts and the ODbL data offer, and `fonts/OFL.txt` (§2.10). |
| **Players on a data cap (64 kbps)** | 0.8 MB first load, service worker, and 3D only after a size prompt (§3.1). |
| **Low-end phones** (2–3 GB RAM) | Save on hide, cap sub-steps, and don't offer 3D by default when `navigator.deviceMemory ≤ 3`. |
| **Bad deploy reaches everyone** | Preview versions, production by tag only, `wrangler rollback`. The service worker updates only on the title screen. Build id in every error report. |
| **Cost surprise** | No Worker in front of static files. Budget alerts on any paid plan. Known adders:<br>- 18% GST on Cloudflare invoices (unverified rate)<br>- the 1 Nov 2026 `.com` rise and later rises of up to 7%<br>- Workers Paid's $5 account minimum<br>- Analytics Engine "not billed yet"<br>- card forex markups on Indian cards (est., varies by bank) |
| **Leaderboard abuse** | Turnstile, plausibility checks, preset names. |

**Test before the public link** (delivery_measurements §10):
- a Redmi Note / Galaxy A-class phone over `chrome://inspect` (2D ≥ 30 fps, 3D memory)
- tab survival across WhatsApp
- Custom Tabs vs WebView when the link is opened from WhatsApp
- an iPhone on Safari
- Opera for Android
- a 3G cold load

### 7.1 Browser and device support matrix

**The floor comes from the code.** `main.js` uses optional chaining and `??` (lines 202 and 206, checked), so older engines fail to parse it and hang on "LOADING…". The parse floor is Chrome/WebView 80, Safari/iOS 13.4, Firefox 74 and Samsung Internet 13 ([MDN compat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining#browser_compatibility); not re-checked today).

**The inline ES5 gate** in `index.html` (~10 lines) tests `new Function('return a?.b')`, `window.operamini` and canvas support. If any fails, it shows the "Open in Chrome" card instead of an endless splash. Other newer APIs are already guarded or have fallbacks: `ctx.roundRect` in `render.js` and `requestIdleCallback` in `audio.js` (checked).

| Browser (India mobile share, [Statcounter Jul 2026](https://gs.statcounter.com/browser-market-share/mobile/india)) | Status | Notes |
|---|---|---|
| **Chrome Android ≥ 80** (~88%) | **Primary**: everything, including service worker, share, `persist()`, save code and 3D (WebGL1/2) | Calibrate the device tiers below on it |
| Opera for Android (in Opera's ~4.7%) | Supported (Chromium) | Test once |
| **Opera Mini** data-saving mode (in Opera's ~4.7%) | **Not supported**: pages are rendered on Opera's servers | The gate shows the card |
| **Safari iOS ≥ 16.4** (~4.3%) | Supported | 7-day storage cap unless added to the Home Screen (§4) |
| Safari iOS 14.5–16.3 | Plays | No `CompressionStream`, so the save code falls back to `NOS0-` (§4) |
| Safari iOS 13.4–14.4 | Best effort | Parses, but `style.css` relies on flex `gap` and `inset` (~230 matching lines in the CSS and JS-built styles, grep), which need Safari 14.1 (MDN compat, not re-checked) |
| UC Browser (~1.7%) | Best effort | Test once; the gate handles failures |
| Samsung Internet ≥ 13 (~0.6%) | Supported (Chromium) | Test once |
| WhatsApp in-app view | Unconfirmed | Custom Tabs = Chrome's storage, WebView = separate saves (§4) |
| Desktop Chrome, Edge, Firefox ≥ 74, Safari ≥ 14.1 | Supported, keyboard controls | Firefox private mode has no service worker |
| KaiOS / JioPhone | Not supported | The gate shows the card |
| itch.io iframe, claude.ai artifact | Secondary channels only | Storage partitioned or per-artifact; no service worker (§2.5) |

**Device tiers** (RAM from `navigator.deviceMemory`, Chromium only; elsewhere use the screen and pointer heuristic `view3d` already applies):

| Tier | Example | Behaviour |
|---|---|---|
| Low | 2–3 GB, Android Go | 2D only, 3D not offered, 2–3 sub-steps max |
| Mid | 4–6 GB, Redmi Note / Galaxy A (≈ the 4x-CPU emulation) | 2D ≥ 30 fps target, 3D opt-in with a size prompt |
| High | flagship, desktop | 3D offered on the title |

---

## 8. Appendix: shared world later

**Keep these decisions now**, so multiplayer needs no rewrite:
1. **Keep the simulation local and deterministic.** It has a fixed 1/60 s step and `core.js` has a seeded mulberry32 RNG, but 132 `Math.random` calls remain (grep today: minigames 29, vehicles 26, sidejobs 15, seasons 15, npcs 11, shops 6, core 5, others ≤ 3). Move gameplay randomness to seeded streams only when a file is being touched for launch work anyway. This is not scheduled work (§9, row D).
2. **Isolate shared state in `N.player` and `N.vehicles`.** Change them only through methods (`teleport`, `vehicles.enter`, `serialize`) so a future `src/net.js` has one seam. Story, missions and saves stay local.
3. **Stable ids.** Give vehicles an `id` at spawn. Places, collectible codes and mission ids are already stable. Never use array indexes as identity.
4. **Identity and versions.** The random `playerId` arrives with Phase C cloud saves (C2); reuse it later. Keep the save versioned and in sections (it already is). The `build.json` id becomes the connect handshake.
5. **Origins:** `/api` and later `/ws` on our domain only. Design for 6–12 KB/s per player (est.), and client-side prediction over RTTs of ~150–560 ms. That band is an estimate; DevTools preset latencies are not real RTTs (delivery_measurements §1). Preset emotes only (no free-text chat).

**Three candidate architectures:**

- **Managed realtime (Supabase Realtime).** Presence and Broadcast fit "see your friends cycling past" with no server code. Limits: 200 concurrent connections on Free, 500 on Pro ([limits](https://supabase.com/docs/guides/realtime/limits)). Overage pricing is disputed: $10 per 1,000 peak connections per hosting_research, none per a third-party guide ([jetadmin](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)). Clients broadcast their own state, which is fine for a cooperative world. The 2026 India block means a paid custom domain or a proxy through our Worker.

- **A dedicated Node game server** (`ws` or Colyseus on a VPS). Full authority and rooms, in the client's own JavaScript. A 2 vCPU / 4 GB box is ~€5.49/month in Hetzner's EU regions ([wz-it](https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/), unverified), ~120–150 ms from Hyderabad (est.). We would own TLS, scaling and uptime. 1000 players probably fit 1–2 boxes (est.).

- **Cloudflare Durable Objects.** One object per "mohalla" room of 8–16, on the Phase C Worker and domain. SQLite-backed objects run on Free, hibernating rooms accrue no duration, and incoming WebSocket messages bill at 20:1 ([pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)). At 10 Hz the free 100k requests/day lasts minutes, so plan on Workers Paid and send updates on change. **Prototype this one first**: no new vendor, no servers.

---

## 9. Work breakdown

Effort in developer-days (est.). Files marked (new) do not exist yet.

| # | Task | Files | Days |
|---|---|---|---|
| A1 | Cloudflare, domain (multi-year), assets Worker, `_headers`, 404, first manual `wrangler deploy` | `wrangler.jsonc`, `tools/web/_headers`, `tools/web/404.html` (new) | 0.5 |
| A2 | `--web` v0: no inline 3D blocks; three.js from our origin first | `tools/build.mjs`, `src/view3d.js` (`LIB`), `src/models3d.js` | 1 |
| A3 | OG tags, `og.jpg`, share button | `tools/og_card.cjs` (moved), `index.html`, `src/menus.js` | 0.5 |
| A4 | Analytics beacon, Sentry stopgap | `tools/build.mjs` | 0.25 |
| A5 | CI workflow, secrets, Playwright paths | `.github/workflows/nostalgia-web.yml` (new), `tools/perf/*.cjs` | 0.75 |
| A6 | Save on hide; too-new save guard | `src/main.js`, `src/save.js`, `tests/save.cjs` (new) | 0.5 |
| A7 | Credits into the boot chunk, OSM notice on the city map, `/credits.html` + `/privacy.html`, `/data/map-odbl.zip`, `licenses/three.txt`, `N.BUILD.target` flag | `src/menus.js`, `src/story2.js`, `tools/web/credits.html`, `tools/web/privacy.html` (new), `tools/build.mjs` | 0.5 |
| B1 | Hashed chunks, `build.json`, size gate | `tools/build.mjs`, `tools/perf/sizes.mjs` | 2–3 |
| B2 | `N.view` stub and lazy-activity loader | `src/core.js`, `src/view3d.js`, `src/world.js`, the six activity modules | 2–3 |
| B3 | Service worker, manifest, title-screen update | `tools/web/sw.js`, `tools/web/manifest.webmanifest` (new), `src/menus.js` | 1.5 |
| B4 | Subset fonts, critical CSS, drop Telugu, `fonts/OFL.txt` (RFN check) | `tools/perf/subset_fonts.mjs`, `index.html`, `src/menus.js` | 1 |
| B5 | Cached or progressive `world.build` | `src/world.js`, `src/world_extras.js` | 3–5 |
| B6 | Defer audio, splash progress, sub-step cap, no boot into 3D | `src/audio.js`, `index.html`, `style.css`, `src/main.js`, `src/view3d.js` | 1.5 |
| B7 | Binary `.glb` per model, meshopt | `tools/pack_assets3d.cjs`, `src/models3d.js` | 2 |
| B8 | Save code, file export, migrations, persist(), nudge | `src/save.js`, `src/menus.js`, `style.css`, `ARCHITECTURE.md` §2/§12 | 2.5 |
| B9 | Error reporter (web target only) | `src/report.js` (new) + its `<script>` line in `index.html` | 0.5 |
| B10 | Status page, feedback link, Channel, monitor | `tools/web/status.html` (new), `src/menus.js` | 0.5 |
| B11 | Real-device pass and fixes (§7 list + §2.11 QA) | `tools/perf/measure.cjs` | 2–3 |
| B12 | Accessibility gaps: viewport zoom, text size, `lang="te"`, target sizes | `index.html`, `src/menus.js`, `style.css` | 1 |
| B13 | ES5 browser gate and "Open in Chrome" card, `NOS0-` save-code fallback | `index.html`, `src/save.js` | 0.5 |
| C1 | Worker API: save, restore, score, boards, err, ev | `worker/index.js`, `worker/schema.sql` (new) | 4–5 |
| C2 | Client cloud save (creates `playerId`), boards in the journal, preset names, Turnstile | `src/cloud.js` (new) + its `<script>` line in `index.html`, `src/menus.js`, `src/minigames.js`, `src/collectibles.js` | 3–4 |
| D | *Not scheduled.* Shared-world hygiene (seeded RNG, vehicle ids) only when a file is already open for launch work | `src/vehicles.js`, `src/npcs.js`, `src/seasons.js`, `src/sidejobs.js` | 0 planned |

**Totals (est., sums of the rows):**
- **Phase A ≈ 4 days** (soft launch).
- **Phase B ≈ 20.5–25.5 days** (public launch; 3 calendar weeks needs two people in parallel, §1).
- **Phase C ≈ 7–9 days** (optional).
- **D is not part of the single-player scope** (owner's decision).

---

## Review log (completeness critic, 2026-10-17)

- **Re-measured** (gzip -9, brotli -11):
  - `dist/nostalgia.html` (17:47 build): 8,330,703 B raw, 2.58 MB gzip, 2.00 MB br.
  - `dist/artifact.html`: 5.44 MB raw, 1.22 MB br.
  - `src/assets3d_pack.js` (4 models): 2.76 MB raw, 757 KB br.
  - Updated §1, §2.1, §3 and §6 to match.
- **Checked in the repo:**
  - `PACK_URLS` at `models3d.js:51` and `LIB` at `view3d.js:50`.
  - `main.js:195` pauses on hide without saving.
  - The `save.js` `parse()`/`current()` stale-client bug.
  - Error hooks in `core.js`.
  - The `/opt/node22` Playwright paths, now 4 files including `tests/smoke.cjs`.
  - `og_card.cjs` output names.
  - The settings list behind §2.11.
  - 132 `Math.random` calls.
  - The `story2.js` credits patch.
- **Fixed overclaims:**
  - Save-code sharing "works inside the artifact frame" (now unverified, with a textarea fallback).
  - Web-only beacons were not fenced off from the single-file builds.
  - The analytics beacon is a third-party request.
  - Phase D shared-world work was counted in the launch totals.
  - "Weeks 1–3" for ~20–25 dev-days needs two people.
  - "Hero cycle" in the marketing copy.
- **Added:**
  - GST, the 1 Nov 2026 `.com` price rise and RBI e-mandate renewal risk (§1, §2.3, §5, §6).
  - Legal basics (§2.10), accessibility (§2.11), India network realities (§3.1), the browser and device matrix (§7.1).
  - Work rows A7, B12 and B13.
- **Still unverified** (marked inline):
  - the 18% GST rate on Cloudflare invoices
  - Cloudflare `.in` registration
  - the analytics script origin
  - share and clipboard inside the artifact frame
  - the Hyderabad folder's own licence in DataMeet
  - each font's Reserved Font Name
  - WhatsApp's in-app browser
  - the 2026 India speed median
