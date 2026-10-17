# NOSTALGIA: hosting research for a single-player online launch

*Researched 2026-10-17. Scope: put NOSTALGIA online so 1000+ people can play at the same time, each in their own browser, with optional cloud saves and leaderboards later. A shared multiplayer world is out of scope (owner: "For now it should be single player… we can plan on shared later"). Appendix A lists what to keep in mind for a shared world later.*

**How figures were checked.** Every limit and price below comes from 2026 web-search results, mostly official docs pages, and each one is linked inline. In this environment WebFetch and curl to vendor sites were blocked by the egress proxy, so no page was opened directly and no live response header was inspected. Anything marked **(est.)** is my own estimate or arithmetic. Anything marked **(unverified)** came only from community or third-party sources. Re-check prices on the vendor page before paying for anything.

---

## 0. Summary and recommendation

1. **The game has no per-player server to scale.** The simulation runs entirely in the browser. "1000 people at the same time" therefore means 1000 *downloads* of a static bundle, after which our servers carry zero traffic. Any modern CDN handles that burst easily. The things that actually fail at this scale are **free-tier bandwidth quotas that pause the site**, plus first-load size on patchy 4G.
2. **Primary host: Cloudflare (Workers static assets, or Pages) on our own domain.** Static asset requests and bandwidth are free and unlimited on the free plan ([Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Workers static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). You get a `_headers` file for proper caching, free cookieless Web Analytics, and a straight path to cloud saves and leaderboards on the same origin (Worker + D1 + R2). Cost is **$0/month at 1k, 10k or 100k players**, plus the domain (est. ~$10–15 per year).
3. **Mirror and fallback: GitHub Pages**, but not straight from `vivkv07/DS`. That repo is **private** (checked via `gh api`: `"private": true`, default branch `master`, Pages not enabled). Pages on a private repo needs a paid plan such as GitHub Pro ([GitHub plans](https://docs.github.com/get-started/learning-about-github/githubs-products), Pro listed at $4/month in [GitHub's plan FAQ](https://docs.github.com/en/get-started/learning-about-github/faq-about-changes-to-githubs-plans)). The alternatives are a separate public "site" repo that only receives the built `dist/`, or skipping Pages. Its 100 GB/month soft bandwidth limit fits about 10k players a month but **not** 100k.
4. **Secondary listing: an itch.io page** for discoverability among indie players, using the single-file build plus a prominent "play full-screen at nostalgia.<our-domain>" link. Do not make itch.io the WhatsApp link: it adds an extra tap, and saves inside the itch iframe are unreliable on Safari and Firefox (§4.6).
5. **Private playtests: the claude.ai artifact link.** It is private by default and shared from the Share menu. Viewers may need a Claude account, so it is not a public launch link (§4.7).
6. **Avoid for launch:** Netlify Free (300 credits pause the whole site after about 12 GB, roughly 2k players), Vercel Hobby (non-commercial only, 100 GB, pauses, extra usage cannot be bought), and Firebase Spark (~10 GB/month, after which Hosting is shut off for the rest of the month). Firebase Blaze works but is pay-per-GB with no hard cap.
7. **Cloud saves and leaderboards (later): Cloudflare Worker + D1 (+R2) on the same domain**, guest-first with no accounts. A 90s-style **"save code"** (password save) works even before any backend exists. Supabase is technically excellent, but `*.supabase.co` was **DNS-blocked by Jio/Airtel/ACT in Feb–Mar 2026** under a Section 69A order (§8.2). For an Indian audience, keep every runtime dependency on our own domain.

---

## 1. What we are shipping (measured today)

| Piece | Raw size | On the wire | Source / note |
|---|---|---|---|
| `dist/nostalgia.html` (all JS + CSS inlined) | 5.20 MB | **1.54 MB gzip -9** (measured) · brotli/zstd est. ~1.2–1.4 MB | `node tools/build.mjs`; measured with `gzip -9 -c \| wc -c` |
| three.js r149 `three.min.js` (3D only) | 608 KB | **152 KB gzip** (measured) | today from jsDelivr, falling back to `vendor/three/three.min.js` (`src/view3d.js:50`) |
| GLB model pack `src/assets3d_pack.js` (3D only, lazy) | up to ~8 MB | **est. ~6 MB** if shipped as base64-in-JS (base64 is +33%, and gzip only claws back part of it); **est. 2–3 MB** if shipped as a real `.glb` with meshopt/Draco | not yet in `src/`; sizes from the task brief |
| Google Fonts (Baloo 2, Noto Sans Telugu, VT323, Yatra One) | n/a | est. 100–300 KB, served by Google, not on our bill | Telugu subsets download only when Telugu glyphs render (unicode-range) |
| WebAudio | 0 | 0 | synthesised, no audio files |

**Per-player transfer model (est.)**, used in all the maths below:

- **2D cold load:** ≈ **1.6 MB** from our host.
- **3D extra:** ≈ 0.15 MB (three.js) + ~6 MB (pack, worst case) ≈ **6.15 MB**. Total 3D cold load ≈ **7.75 MB**.
- **Typical monthly player:** 1.5 full cold loads (new device, cache eviction, a release that changes the single file) × (1.6 MB + 30% opt into 3D × 6.15 MB) ≈ **5.2 MB/month**.
- **Worst-case monthly player:** everyone uses 3D: 1.5 × 7.75 ≈ **11.6 MB/month**.

The 1.5× reload factor and the 30% 3D share are assumptions **(est.)**. Measure them with analytics after launch.

---

## 2. What "1000 people at the same time" means for this game

- **Burst.** 1000 cold loads = 1.6 GB (all 2D) to 7.75 GB (all 3D). Spread over 10 minutes (a WhatsApp forward wave), that averages **21–103 Mbit/s**. Compressed into a single minute it is **0.2–1.0 Gbit/s** **(est.)**. CDNs serve terabits, so this is a non-event for every host here. Host requests per cold load are about 2–6 (HTML, three.js, pack, manifest/SW, analytics beacon); fonts go to Google.
- **After load:** zero bytes to our host. Saves go to `localStorage` (`src/save.js`), and the sim, audio and rendering are all local.
- **What 1000 concurrent implies per month (est.).** With ~30-minute sessions and an evening peak, 1000 concurrent at peak ≈ 2,000 sessions in the peak hour ≈ 13–20k sessions/day ≈ **10–15k daily players**. A sustained month like that sits near the **100k monthly** scenario. A one-off launch day is roughly **15k cold loads ≈ 52 GB (typical mix) to 116 GB (all 3D) in one day**.
- **The real bottleneck is the player's phone and network.** On patchy 4G at an effective 2–10 Mbit/s **(est. design band, much lower than national medians)**, the 2D load takes ~1.3–6.4 s and the full 3D load ~6–31 s. Keep the 2D first load at or below ~2 MB and fetch 3D only when the player opts in. That matters more than which CDN we pick.

---

## 3. Bandwidth and cost by scenario (est., from the §1 model)

| Scenario | Data from our host | Cloudflare | GitHub Pages | Netlify | Vercel | Firebase Hosting | itch.io |
|---|---|---|---|---|---|---|---|
| **Burst: 1000 cold loads** | 1.6–7.75 GB | $0 | $0, fine | Free: 13–65% of the month's ~12 GB in one burst | Hobby: fine (100 GB) | Spark: **over the ~360 MB/day** quota after ~50–225 loads | $0 |
| **Launch day** at 1000 concurrent peak (~15k cold loads) | 52–116 GB | $0 | half the month's **100 GB soft** limit, or over it | Free: **paused**. Pro's 3,000 credits cover the day itself (≈1,000–2,300 credits) | Hobby: close to or **over 100 GB → paused** | Spark: **disabled for the rest of the month**. Blaze ≈ $8–17 | $0 |
| **10k players/month** | 52 GB typ. / 116 GB worst | **$0** | $0 typ. (**over** the soft limit at worst) | Free: **paused** after ~2.3k players. Personal $9 (+$5 pack) ≈ $14 | Hobby $0 if non-commercial (worst case over 100 GB) | Blaze ≈ $6 typ. / $16 worst | $0 |
| **100k players/month** | 520 GB typ. / 1.16 TB worst | **$0** | **5–12× over** the soft limit, so throttling or an email is likely | Pro ≈ **$80 typ. / $160 worst** | Pro $20 + Fast Data Transfer overage at $0.15–0.35/GB by region ≈ **$20–200** (India rate unverified) | Blaze ≈ **$77 typ. / $172 worst** | $0 |

How these were worked out:
- **Netlify:** 20 credits/GB, 15 credits per production deploy, 2 credits per 10k requests. Free gives 300 credits with a hard stop. Personal is $9 for 1,000 credits with packs of 500 for $5. Pro is $20 for 3,000 credits with packs of 1,500 for $10 ([How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), [plan update](https://www.netlify.com/changelog/updates-credit-based-personal-and-pro-plans/)). Example for 100k typical: 520 GB × 20 = 10,400 credits, plus ~200 for requests and ~60 for deploys, ≈ 10,700 credits. Pro covers 3,000, and 6 packs ($60) cover the rest.
- **Firebase Blaze:** (GB − ~10 free) × $0.15 ([Firebase pricing](https://firebase.google.com/pricing)).
- **Vercel:** [regional pricing](https://vercel.com/docs/pricing/regional-pricing), plus the [new Pro plan](https://vercel.com/blog/new-pro-pricing-plan) credit model. Exact India overage is **unverified**.

---

## 4. Host by host

### 4.1 Cloudflare Pages / Workers static assets (recommended primary)

**Limits (current):**
- **Per-file size:** 25 MiB per static asset. Cloudflare suggests R2 for bigger files ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/)).
- **Files per site:** 20,000 on Free, 100,000 on paid ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/); [2026-01 changelog](https://developers.cloudflare.com/changelog/post/2026-01-23-pages-file-limit-increase/)).
- **Builds:** 500 per month, one at a time, 20-minute timeout ([Pages limits](https://developers.cloudflare.com/pages/platform/limits/)).
- **`_headers`:** up to 100 rules, 2,000 characters per line ([Headers](https://developers.cloudflare.com/pages/configuration/headers/)).
- **Workers static assets:** the same 25 MiB per file and 20k/100k file counts ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [2025-09 changelog](https://developers.cloudflare.com/changelog/post/2025-09-02-increased-static-asset-limits/)).
- **Bandwidth and requests:** *"requests to static assets are free and unlimited"* on free and paid plans ([Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [Workers static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)). Community answers note that this is subject to the ToS, which frowns on hosting disproportionate large media (**unverified** forum view). A game bundle is ordinary web content.
- **Pages vs Workers:** Cloudflare's current guidance is *"if you are starting a new project, use Workers instead of Pages"*. Pages still works, but new features land in Workers ([Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)). Either one is fine for us.

**Fit for a 5–15 MB game.** Excellent. The current single file (5.2 MB) and an ~8 MB pack are both well under 25 MiB. Keep the pack as its own file; do not inline it into the HTML.

**Bandwidth and cost.** $0 in every scenario in §3. Cloudflare runs edge locations across India, including Hyderabad (HYD), according to a third-party status monitor ([openstatus HYD](https://www.openstatus.dev/status/cloudflare-workers/hyderabad-india-hyd), **unverified** as an official list).

**Custom domain.** A subdomain can stay at any DNS provider via CNAME to `<project>.pages.dev`. An apex domain needs the zone on Cloudflare nameservers, which the free plan allows ([Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)). Workers custom domains require the zone on Cloudflare ([migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)). HTTPS certificates are automatic.

**Analytics.** Cloudflare Web Analytics is free, uses no cookies or localStorage, does no fingerprinting, works on any host via a JS snippet, and is one click on Pages ([Web Analytics docs](https://developers.cloudflare.com/web-analytics/about/)).

**Deploys from the GitHub branch.** Two options:
- **(a) Pages Git integration.** It supports private repos through the Cloudflare GitHub App. Set the production branch to `claude/nostalgia-hyderabad-game`, or later to a `release` branch. Every other branch and every PR gets a preview URL ([GitHub integration](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)). Root `nostalgia`, build command `node tools/build.mjs`, output `dist/web` (a proposed new build target, §6.1).
- **(b) A GitHub Action that runs the build and then `wrangler deploy`**, using a scoped API token secret. This is the better fit if we move to Workers with an `/api` route later.

**Gotchas:**
- **Compression is automatic for text types.** Free-plan zones default to **Zstandard**, falling back to Brotli or gzip by browser support ([compression docs](https://developers.cloudflare.com/speed/optimization/content/compression/)). `model/gltf-binary` is **not** in the default compressed list. Ship the pack meshopt- or Draco-compressed, or add a Compression Rule.
- **Missing-file handling.** On Workers, do not turn on SPA `not_found_handling`. On Pages, add a top-level `404.html`. Without one, Pages falls back to SPA-style serving of `index.html` for unknown paths (**unverified** detail of Pages "Serving Pages" behaviour). Either way, a mistyped `.glb` URL would then return HTML and fail in GLTFLoader with a confusing parse error.
- **Keep static assets out of the Worker.** If we add a Worker for `/api`, use `run_worker_first` *only* for `/api/*`. Requests that invoke the Worker count against the free 100k/day and get a 429 once it is exceeded, while plain static assets stay free ([Workers static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)).
- `_headers` applies to static responses only, not Functions output ([Headers](https://developers.cloudflare.com/pages/configuration/headers/)).

### 4.2 GitHub Pages

**Limits:**
- Published site at most **1 GB**.
- **Soft** bandwidth limit of **100 GB/month**.
- Soft limit of **10 builds/hour**, which does not apply to custom Actions workflows.
- 10-minute deploy timeout.
- Rate limiting can return **HTTP 429**.
- If a site exceeds its quotas, GitHub may suggest a CDN or other hosting ([Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)).
- Not for sites that mainly do commercial transactions; donation links are OK ([Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). Significantly excessive use may be throttled ([Acceptable Use](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)).

**Availability for this repo.** Pages is free only for **public** repos. Private repos need Pro, Team or Enterprise, and the published site is public even when the repo is private ([GitHub plans](https://docs.github.com/get-started/learning-about-github/githubs-products)). `vivkv07/DS` is private, so the options are GitHub Pro (listed at $4/month, [plan FAQ](https://docs.github.com/en/get-started/learning-about-github/faq-about-changes-to-githubs-plans)), making the repo public, or **a separate public repo that only holds the built site**. The built JS is public on any host anyway; this choice is only about keeping design docs and tooling private.

**Fit.** Good for a 5–15 MB site. There is no per-file limit beyond git's own: GitHub warns at 50 MB and blocks at 100 MB per file (general GitHub behaviour, not re-verified here).

**Bandwidth and cost.** $0. At ~5.2 MB per typical player, 100 GB ≈ **19k players/month (est.)**. Fine for 10k, **not** for 100k or a sustained 1000-concurrent month.

**Custom domain and HTTPS.** Supported. GitHub requests a Let's Encrypt certificate automatically. "Enforce HTTPS" can take up to 24 hours to become available. CAA records must allow `letsencrypt.org` ([HTTPS docs](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https), [custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)).

**Deploys.** Set Pages source to "GitHub Actions". The workflow runs `node nostalgia/tools/build.mjs`, then `actions/upload-pages-artifact` and `actions/deploy-pages`, with `pages: write` and `id-token: write` permissions ([custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)). The `github-pages` environment's protection rule normally allows only the **default branch** (`master`). Either add `claude/nostalgia-hyderabad-game` to the allowed branches or deploy from `master` / a release tag.

**Caching headers we cannot control.** Pages serves a fixed `Cache-Control: max-age=600` (10 minutes) with ETag/Last-Modified. Custom headers (Cache-Control, CSP, `immutable`) are **not supported**, and GitHub staff point people to a CDN in front instead ([discussion #11884](https://github.com/orgs/community/discussions/11884), [discussion #60087](https://github.com/orgs/community/discussions/60087)). Consequences:
- Returning players revalidate every asset after 10 minutes. These are 304s and cheap, but they are extra round trips on bad networks.
- The 5 MB single file is re-downloaded in full after every deploy.
- Hashed filenames plus a service worker (§6.4) solve both problems.

**Analytics.** None built in. Use the Cloudflare Web Analytics snippet or GoatCounter (§7).

**Gotchas:**
- gzip is normally applied by GitHub's CDN to text types (common observation, **unverified** here). Check with `curl -sI -H 'Accept-Encoding: gzip'` after the first deploy.
- `*.github.io` has no known blocks. Some Indian ISPs have blocked other GitHub subdomains, such as `raw.githubusercontent.com` in 2023 ([MediaNama](https://www.medianama.com/2023/11/223-github-subdomain-blocked-isps/)). Use our own domain either way.

### 4.3 Netlify

**Limits (credit plans, mandatory for accounts created after Sept 2025):**
- **Free:** 300 credits/month, **hard limit, no top-up**. When credits run out, **all projects on the team are paused** until the next cycle ([credit plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [pricing](https://www.netlify.com/pricing/)).
- **Rates:** bandwidth 20 credits/GB, production deploy 15 credits (deploy previews are free), web requests 2 credits per 10k ([How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)).
- **Paid:** Personal is $9 for 1,000 credits (+500 for $5). Pro is $20 for 3,000 credits (+1,500 for $10) ([plan update](https://www.netlify.com/changelog/updates-credit-based-personal-and-pro-plans/)).
- **Known issue:** community reports in 2026 describe free teams blocked by a stuck credit flag ([forum](https://answers.netlify.com/t/free-plan-stuck-on-operational-credits-despite-29-300-credits-available/165875), **unverified** as an official issue).

**Fit.** Technically fine (`_headers`, `_redirects`, Brotli). Commercially poor on Free: 300 credits minus ~4 deploys leaves ≈ 12 GB, which is **~2,300 typical players/month (est.)** before the whole site pauses. A single WhatsApp wave could pause it mid-launch.

**Custom domain.** Free with automatic Let's Encrypt HTTPS ([domains](https://docs.netlify.com/manage/domains/get-started-with-domains/)). Branch deploys must be enabled per branch ([branch deploys](https://docs.netlify.com/deploy/deploy-types/branch-deploys/)). Private repos owned by **organizations** need Pro. Personal-account private repos appear to work on Free (**unverified**).

**Analytics.** Netlify's own analytics was not verified for 2026. Use Cloudflare Web Analytics or GoatCounter.

**Verdict:** not for the public launch link. Acceptable for PR previews, since deploy previews cost 0 credits.

### 4.4 Vercel

**Limits:**
- **Hobby includes** 100 GB Fast Data Transfer and 10 GB Fast Origin Transfer. It is **non-commercial personal use only**: any deployment made for anyone's financial gain counts as commercial, even a paid contractor writing the code. Hobby **cannot buy extra usage**, and exceeding the free tier **pauses projects** ([Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines), [Hobby plan](https://vercel.com/docs/plans/hobby)).
- **Deploy limits:** 100 deployments/day on Hobby. CLI source uploads up to 100 MB on Hobby and 1 GB on Pro ([limits](https://vercel.com/docs/limits)).
- **Pro:** $20/month with a flexible usage credit. Fast Data Transfer overage is priced per region at **$0.15–0.35/GB** ([regional pricing](https://vercel.com/docs/pricing/regional-pricing), [new Pro plan](https://vercel.com/blog/new-pro-pricing-plan)).

**Fit.** Technically fine. **Terms risk:** if NOSTALGIA ever adds a donation button, sponsor slot or paid contributor, Hobby is out. At 100k players the cost is unpredictable because the India region rate is unverified.

**Custom domain.** Free with HTTPS. Git integration deploys every branch push and PR as a preview automatically.

**Analytics.** Vercel Web Analytics gives 50k events/month on Hobby. Collection stops after a grace period, and add-ons cannot be bought on Hobby ([Web Analytics pricing](https://vercel.com/docs/analytics/limits-and-pricing)).

**Verdict:** fine for previews, not the launch host.

### 4.5 Firebase Hosting

**Limits:**
- Hosting storage free up to 10 GB, then $0.026/GB.
- Data transfer free up to **360 MB/day**, then **$0.15/GB** ([Firebase pricing](https://firebase.google.com/pricing)). The Hosting docs phrase the same allowance as 10 GB/month.
- **On Spark, going over means "a short grace period … after which the sites are disabled"** until next month. Upgrading to Blaze re-enables them ([Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing)).
- Quotas are per project. Files up to 2 GB.
- Free SSL per custom domain; at most ~20 subdomains per apex is recommended ([custom domain](https://firebase.google.com/docs/hosting/custom-domain)).
- gzip/Brotli applied automatically by the CDN ([product page](https://firebase.google.com/products/hosting/)).

**Fit.** Spark's ~10 GB/month is roughly **2,000 typical players (est.)**, and a launch burst would knock the site offline for the rest of the month. Blaze is fine technically: §3 gives ≈ $6 at 10k and ≈ $77–172 at 100k. But Blaze has **no hard spending cap**, so set budget alerts.

**Deploys.** The official [`FirebaseExtended/action-hosting-deploy`](https://github.com/FirebaseExtended/action-hosting-deploy) creates per-PR preview channels and deploys live on merge. `firebase.json` `headers` gives full Cache-Control control.

**Analytics.** Google Analytics for Firebase uses identifiers and cookies, which is a poor match for privacy-light goals (§7).

**Verdict:** only if we standardise on Firebase for saves, and we do not (§8).

### 4.6 itch.io (HTML5 game page)

**Upload limits:**
- ZIP with `index.html` at the root. A single-file HTML game can be uploaded without zipping.
- At most **1,000 files**, **500 MB extracted**, **200 MB per file**.
- Paths are case-sensitive, and only `.zip` archives are accepted ([itch HTML5 docs](https://itch.io/docs/creators/html5)).
- Our 5 MB single file plus an ~8 MB pack fits easily.

**Embed and mobile:**
- The game runs in an **iframe served from `html-classic.itch.zone`**.
- Phones always get click-to-play and launch fullscreen. A "Mobile friendly" flag removes the incompatibility warning. Orientation follows the game's dimensions ([mobile update](https://itch.io/updates/better-support-for-mobile-html-games-more), [embed options](https://itch.io/updates/more-embed-options-for-html5-games)).
- Embed options include a fullscreen button and a "maximized" click-to-play mode.
- Games can be embedded on other sites via the Distribute tab ([game embeds](https://itch.io/updates/introducing-game-embeds)).

**Saves (the biggest gotcha):**
- Safari, both iOS and macOS, with "Prevent cross-site tracking", plus Firefox, treats the itch iframe as third-party. **localStorage is blocked or not persistent**, so saves can vanish ([iPad thread](https://itch.io/t/2636350/localstorage-doesnt-work-for-html5-games-on-ipad-by-default), [save-loss thread](https://itch.io/t/5464689/web-browser-game-randomly-losing-localstorage-data)). Our `save.js` falls back to in-memory storage, so the game won't crash, but progress is lost when the tab closes.
- All itch HTML games appear to share that one origin, and with it the localStorage quota (**inferred, unverified**). Our keys are namespaced (`nostalgia.save.v1`), so collisions are not a concern, but quota pressure from other games is possible.
- **Mitigation:** the save-code export/import feature (§8.1) and an "open full-screen on our site" link.

**Compression.** Community reports say itch's CDN compresses on the fly and handles **gzip** but not pre-compressed Brotli ([forum](https://itch.io/post/7701199), **unverified**). Upload uncompressed files.

**Discoverability.** Real, but crowded: the *free HTML5* listing shows ~709k entries ([listing](https://itch.io/games/new-and-popular/free/html5)). itch's audience is global indie players, not Hyderabadi WhatsApp groups, so it is a nice-to-have channel for devlogs and jams. Cost: $0, and itch bears the bandwidth.

**Analytics.** itch's own creator dashboard reports views and plays (not verified in detail). No personal data leaves our side.

### 4.7 claude.ai artifact link (quick sharing path)

- **Private by default.** Sharing is done from the Share menu. On Free/Pro/Max the options are "Only you" or "Anyone with the link". On Team/Enterprise, external sharing is off until an Owner enables it ([Help: share artifacts](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts), [Claude Code artifacts](https://code.claude.com/docs/en/artifacts)).
- **Viewers may need a Claude account.** Sources conflict: newer help pages say recipients need one, while legacy chat-published artifacts are viewable without an account. Families on WhatsApp will not sign up, so this is a playtest channel, not the launch link.
- **Contract in this environment (from the Artifact tool).** These rules are the reason `dist/artifact.html` exists:
  - Page at most 16 MB.
  - Scripts only from cdnjs, jsDelivr, unpkg and a few others, so three.js from jsDelivr works. Stylesheets only from Google Fonts.
  - Each artifact has its own origin, and its localStorage lives only in that viewer's browser.
  - Adding an inline ~8 MB pack would push the page to ~13+ MB: close to the cap, but under it.
- **Cost:** $0. No custom domain, no analytics, no service worker.
- **Use:** quick builds for the owner and a few trusted testers.

---

## 5. Comparison matrix

| | Cloudflare | GitHub Pages | Netlify | Vercel | Firebase | itch.io | claude.ai artifact |
|---|---|---|---|---|---|---|---|
| Free bandwidth | **Unlimited (static)** | 100 GB/mo soft | ~12 GB (300 credits), then **pause** | 100 GB, then **pause** | ~10 GB/mo, then **off** | itch pays | n/a |
| Per-file cap | 25 MiB | none special (1 GB site) | not verified | 100 MB CLI upload (Hobby) | 2 GB | 200 MB | 16 MB page |
| Cache headers | `_headers` (100 rules) | **fixed max-age=600** | `_headers` | `vercel.json` | `firebase.json` | none | none |
| Compression | zstd/br/gzip auto (not .glb) | gzip (observed) | yes | yes | gzip/br auto | gzip | n/a |
| Private-repo CI | yes (GitHub App) | needs Pro or public repo | yes (orgs need Pro) | yes | via Action | butler/manual | n/a |
| Custom domain + HTTPS | yes | yes | yes | yes | yes | no | no |
| Analytics w/o personal data | **CF Web Analytics** | add snippet | add snippet | 50k events Hobby | GA (not privacy-light) | itch dashboard | none |
| Commercial use OK | yes | not "primarily commercial" | yes | **Hobby: no** | yes | yes | n/a |
| Cost at 100k/mo (est.) | **$0** | over soft limit | ~$80–160 | ~$20–200 | ~$77–172 | $0 | n/a |
| Role | **Primary** | Mirror / fallback | Previews only | Previews only | Not chosen | Listing | Playtests |

---

## 6. Cross-host gotchas and the build changes they imply

### 6.1 Add a multi-file hosting build next to the single file
The current `tools/build.mjs` inlines everything into one 5.2 MB HTML. That is right for the artifact and for itch, but wrong for a CDN, because one changed line forces a full 1.5 MB (gzip) re-download and the HTML cannot be cached long. Proposed `dist/web/` target **(not implemented here)**:
- `index.html`: small, no-cache. Holds OG tags, the boot splash and a script loader.
- `game.<hash>.js`, `style.<hash>.css`: content-hashed. Optionally split into a "core + 2D" bundle and a lazily loaded "3D" bundle, so 2D players never download the 3D code.
- `three.r149.min.js`: **self-hosted on our origin**. Keep jsDelivr only as the artifact-build source.
- `models/pack.<hash>.glb`: real binary GLB with meshopt or Draco compression, not base64 JS. Fetched only when the player switches to 3D.
- `sw.js` (§6.4), `manifest.webmanifest`, icons, `og.jpg` (§6.6), `404.html`.

### 6.2 Cache busting and headers (Cloudflare `_headers`; Netlify uses the same syntax)
```
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
/models/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: model/gltf-binary
```
These rules only work if filenames change on every content change, which is what the hashed names do. On GitHub Pages none of this can be set (fixed 600 s), and the service worker does the long caching instead.

### 6.3 MIME types and compression
- **`.glb`** must be served as `model/gltf-binary`. Cloudflare will not compress it by default, so compress the geometry at build time (meshopt or Draco).
- **`.webmanifest`** must be served as `application/manifest+json`.
- **JS and CSS** are compressed automatically by every host here. Do **not** upload pre-gzipped files with a `.gz` suffix (itch and GitHub Pages won't set `Content-Encoding`).

### 6.4 Service worker (offline replay on patchy 4G)
- After the first visit, cache `index.html` and the hashed assets. The game then starts instantly, and even offline (useful in a metro, or in an Old City lane with no signal).
- Use versioned cache names.
- Show "New version available, tap to update" only on the title screen, never mid-mission.
- Never cache `/api/*`.
- Works on Cloudflare, GitHub Pages, Netlify, Vercel and Firebase. Not on the claude.ai artifact or itch.

### 6.5 CORS, fonts and CDN dependencies
- **Same origin for everything we own** (pack, three.js, API) means no CORS to configure.
- **If the pack ever moves to R2** (only needed if a file exceeds 25 MiB, or for a separate asset domain), set CORS on the bucket. R2 has 10 GB free storage and **no egress fees** ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)).
- **Google Fonts** works cross-origin as-is; keep the `crossorigin` on the gstatic preconnect. Its Web API sets no cookies, but each request sends the visitor's IP and user agent to Google. **Self-hosting the WOFF2 files means Google receives nothing** ([Google Fonts FAQ](https://developers.google.com/fonts/faq)). Recommended for the launch build: it removes a third-party dependency and helps privacy.
- **jsDelivr:** no Indian blocking found. But Indian ISPs have blocked developer domains before, inconsistently ([MediaNama on GitHub](https://www.medianama.com/2023/11/223-github-subdomain-blocked-isps/), Supabase in 2026 in §8.2). The safe rule is **no runtime dependency on a third-party domain**, except Google Fonts if we keep it.
- **SPA routing:** not needed, since there is one page. Don't add catch-all rewrites; ship a real `404.html`.

### 6.6 WhatsApp link previews
- **Required tags:** `og:title`, `og:description`, `og:image` (absolute https URL) and `og:url`, near the top of `<head>`.
- **Image size:** WhatsApp's undocumented limit appears to be **~300 KB**; larger images show no preview at all ([Branch FAQ](https://help.branch.io/faq/docs/why-are-some-quick-link-thumbnails-not-shown-in-whatsapp), **unverified** officially). Use a 1200×630 JPEG/WebP under 300 KB, for example Charminar at dusk with "NOSTALGIA – Hyderabad 2003".
- **Small `index.html`:** a tiny file (§6.1) also keeps link crawlers from choking on a 5 MB HTML. Some crawlers only read the start of large pages (**unverified**), which is another reason for it.

### 6.7 Domain
- Own a domain and put the game, the API, and later the assets on it. That way a platform-subdomain block (`*.supabase.co` in 2026), a vendor switch, or a pricing change never breaks the WhatsApp links already circulating.
- Cost (est.): ~$10–15/year for `.com`; `.in` is similar (not price-checked).

---

## 7. Analytics without personal data

| Option | Cost | Cookies / IDs | Notes |
|---|---|---|---|
| **Cloudflare Web Analytics** | Free, no traffic limits | none: no cookies/localStorage, no fingerprinting; counts "visits" by referrer | snippet works on any host ([docs](https://developers.cloudflare.com/web-analytics/about/)) |
| GoatCounter | free for non-commercial (cap 100k pageviews or unlimited, sources disagree, **unverified**); self-hostable | no cookies; non-identifying hash | open source ([README](https://cdn.jsdelivr.net/gh/zgoat/goatcounter@main/README.md)) |
| Vercel Web Analytics | 50k events/month on Hobby | n/a | only if on Vercel ([pricing](https://vercel.com/docs/analytics/limits-and-pricing)) |
| Game-event counters (later) | Worker free tier | random per-install ID or none | e.g. `chapter_completed`, `3d_enabled`, `load_ms`, aggregated only; no names, no free text |

**Privacy posture.** The audience is adults, but families mean children will play. India's DPDP Rules (notified Nov 2025) require **verifiable parental consent for processing data of anyone under 18** and prohibit **tracking, behavioural monitoring and targeted ads for children** ([K&S summary](https://ksandk.com/data-protection-and-data-privacy/childrens-data-protection-under-indias-dpdp-rules/), [PRIVO](https://www.privo.com/blog/indias-digital-personal-data-protection-act-what-global-businesses-need-to-know); compliance dates not confirmed). The simplest compliant design is to **collect no personal data at all**: cookieless aggregate analytics, guest-only saves, and leaderboard nicknames picked from a preset list. *Not legal advice.*

---

## 8. Optional cloud saves and leaderboards (later)

### 8.1 Do first, with no backend: the "save code"
- `N.save` already serialises one JSON blob.
- Add **Export / Import save**: gzip with `CompressionStream`, then base64url the result, and show it as a copyable code (and optionally a QR). Players can paste it into WhatsApp to move between phone and laptop. It is very 90s (NES-style passwords).
- It rescues itch/Safari players and costs nothing.
- Save size has not been measured yet; est. 10–100 KB raw, a few KB compressed.

### 8.2 Backend comparison

| | **Cloudflare Worker + D1 (+R2/KV)** | **Supabase** | **Firebase (Auth + Firestore)** |
|---|---|---|---|
| Free compute / API | Workers: 100k requests/day; error 1027 when exceeded ([pricing](https://developers.cloudflare.com/workers/platform/pricing/), [limits](https://developers.cloudflare.com/workers/platform/limits/)) | unlimited API requests ([pricing](https://supabase.com/pricing)) | per-product quotas |
| Free DB | D1: 5M rows read/day, 100k rows written/day, 5 GB per account, **500 MB per DB**, 10 DBs. **Queries fail when over the limit since 2026-09-01** ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/), [changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)) | 500 MB DB, 5 GB egress, 1 GB files, 2 free projects; **paused after 1 week inactivity** ([pricing](https://supabase.com/pricing), [billing](https://supabase.com/docs/guides/platform/billing-on-supabase)) | Firestore: 1 GiB, 50k reads/day, 20k writes/day ([quotas](https://docs.cloud.google.com/firestore/quotas)) |
| KV / blobs | KV: 100k reads/day but **only 1k writes/day**, which is unsuitable for saves ([KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)). R2: 10 GB, 1M writes and 10M reads per month, $0 egress ([R2](https://developers.cloudflare.com/r2/pricing/)) | Storage 1 GB free | Cloud Storage **requires Blaze since Feb 2026** ([FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)) |
| Guest identity | none built in. Device-generated random ID + secret (or the save code); **Turnstile** free, unlimited challenges, 20 widgets ([Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)) | **Anonymous sign-ins**, linkable later; default **30 per hour per IP**, CAPTCHA recommended ([anon auth](https://supabase.com/docs/guides/auth/auth-anonymous), [rate limits](https://supabase.com/docs/guides/auth/rate-limits)) | Anonymous auth. **Spark capped at 3,000 DAU**, 50k MAU free on Blaze; auto-cleanup after 30 days ([auth limits](https://firebase.google.com/docs/auth/limits)) |
| Paid step | Workers Paid $5/month: 10M requests/month; D1 25B reads, 50M writes, 5 GB, 10 GB per DB ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)) | Pro $25/month: 100k MAU, 8 GB disk, 250 GB egress; custom domain +$10/month ([pricing](https://supabase.com/pricing), [custom domains](https://supabase.com/docs/guides/platform/custom-domains)) | Blaze pay-as-you-go, no hard cap |
| India reachability | same domain as the game (our zone) | **`*.supabase.co` DNS-blocked on Jio/Airtel/ACT from 24 Feb 2026 (Sec. 69A)**; one account says it was lifted ~4 Mar 2026 ([AIM](https://analyticsindiamag.com/ai-news/supabase-appeals-to-ashwini-vaishnaw-after-access-on-jio-airtel-act-gets-blocked), [NewsBytes](https://www.newsbytesapp.com/news/science/supabase-blocked-in-india-government-silent-on-reasons/story), [LevelUp](https://levelup.gitconnected.com/is-supabase-banned-in-india-heres-what-s-really-happening-2026-ccead9d8dcf2)). Mitigation: paid custom domain or a proxy via our Worker | Google domains; no block found |
| Fit | **Best**: one vendor, one origin, $0 to start | great DX (Postgres, RLS) but India risk, idle pause, per-IP limit | workable; Spark DAU cap and Blaze-only storage make it a paid path early |

**Recommended later design (est. sizing):**
- `POST /api/save`: compressed blob into R2, keyed by a random 128-bit save ID plus a secret hash. Metadata goes in D1.
- `GET /api/save/:code`: restores a save on another device.
- `POST /api/score`: per-minigame scores (cricket match, playground games). Server-side plausibility checks plus Turnstile.
- `GET /leaderboard/*.json`: a snapshot regenerated each minute and served as a **static/cached file**, so the 1000 players reading it don't burn Worker requests.
- Write cloud saves only on explicit save, chapter end or quit: ~1–3 per session, not every 5 minutes.
- **Free-tier math (est.):**
  - A sustained 1000-concurrent month is ~15k sessions/day × 3 = **45k saves/day ≈ 1.35M R2 writes/month**. That is over R2's 1M free Class A operations; the extra ~0.35M costs ≈ $1.60 at $4.50/M.
  - The same 45k saves/day, plus score posts and restores, uses half or more of the Workers free 100k requests/day. D1 metadata upserts (1 row + index rows each) approach its 100k rows written/day.
  - So that month should run on **Workers Paid at $5/month**, about **$5–7/month all-in**.
  - At 10k players a month, everything stays free.
- **CGNAT caveat:** Indian mobile carriers put many users behind shared IPv4 (general industry pattern, **unverified** per operator). Avoid tight per-IP limits such as Supabase's default 30 per hour per IP, which a WhatsApp wave would trip.

---

## 9. Hosting launch checklist

1. Buy the domain. Add it to Cloudflare (free plan). Create the Workers (or Pages) project from `vivkv07/DS` at root `nostalgia`, deploying from the release branch.
2. Add the `dist/web` multi-file build target (§6.1): hashed names, self-hosted three.js, a binary compressed `.glb`, `404.html`, OG tags plus a ≤300 KB `og.jpg`, the manifest, and the service worker.
3. Add `_headers` (§6.2). After the first deploy, verify `content-encoding`, `cache-control` and `content-type` for `.glb` with `curl -sI`.
4. Turn on Cloudflare Web Analytics. Decide whether to self-host fonts.
5. Optional mirror: a public `nostalgia-site` repo plus a GitHub Pages Actions deploy, or GitHub Pro.
6. itch.io page: single-file `index.html`, "Mobile friendly" on, a fullscreen button, a link to the main site, and a note that saves in Safari may not persist.
7. Load test: not needed for static assets. Do test a 2D cold load on a throttled "Slow 4G" profile on a mid-range Android, with a budget of ≤ 2 MB and ≤ 5 s to the title screen.
8. Later: save code (§8.1), then Worker + D1 + R2 cloud saves and leaderboards (§8.2).

---

## Appendix A: Shared world later (keep these doors open)

- **Separate sim state from rendering**, which `N.*` modules largely do already. Keep RNG seeded and deterministic so a server or peer could reproduce events.
- **Stable IDs everywhere.** The save schema is versioned (`v`). Add a `playerId` (random) now, so cloud saves, leaderboards and future presence share one identity with no accounts.
- **Same-origin `/api` and later `/ws`** on our domain. Never hard-code a vendor hostname into the client (the Supabase 2026 lesson).
- **Likely tech: Cloudflare Durable Objects.**
  - SQLite-backed objects are available on the Workers Free plan.
  - The WebSocket Hibernation API lets an idle room sleep while clients stay connected.
  - Up to 32,768 WebSockets per object in theory ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)).
  - Model it as one object per "mohalla" room of ~8–16 kids, not one global world.
- **Supabase Realtime** caps concurrent connections at 200 (Free) and 500 (Pro), with overage at $10 per 1,000 peak connections ([Realtime limits](https://supabase.com/docs/guides/realtime/limits)). 1000 concurrent multiplayer users would need paid overage.
- **Budget the per-player sync bandwidth up front.** Delta-compressed position updates at 10 Hz should run a few KB/s per player (est.).
- **Moderation and DPDP:** chat or free-text names with children present raise consent and moderation issues. Use preset phrases (no free-text chat) and preset nicknames.

## Appendix B: Assumptions to re-verify after launch
- Reload factor 1.5× per monthly player, 3D opt-in at 30%, GLB pack wire size of ~6 MB (target 2–3 MB).
- GitHub Pages gzip behaviour and Cloudflare Pages SPA fallback: check live headers.
- Vercel India Fast Data Transfer rate; GoatCounter free cap; itch.io shared-origin localStorage quota; whether WhatsApp truncates large HTML.
- Supabase reachability from Jio/Airtel today (check before choosing it).
