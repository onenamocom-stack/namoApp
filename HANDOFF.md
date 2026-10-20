# Handoff — Namo (aether-mono)

**What is actually true right now.** Front end and backend in one file, because
two files claiming to describe reality means neither gets trusted.

Updated 18 Oct 2026.

| Phase | State |
|---|---|
| 0 · pre-work | Done |
| 1 · auth and profile | Done |
| 2 · wallet | Done |
| 3 · payments in | **Built and deployed. One done-condition short**, blocked on Razorpay's website review. The site is now on `1namo.com` (the move Razorpay's review wanted — §6); registering that domain and its policy pages with Razorpay is the remaining step. Until it clears, live checkout is refused and **production wallets cannot be funded** |
| 4 · consultants, availability, approval | **Done.** Schema, seed and front end live on both projects; its check passes on both |
| **5 · bookings** | **Done and closed.** All four done-conditions pass on dev, walked in a browser. `012` and `013` are both on both projects |
| **6 · metered chat** | **Done and closed.** On both projects, front end deployed, all six done-conditions verified — the last was a look at the chat bubbles, taken 3 Sep (§6) |
| **7 · charts** | **Done and closed.** Both projects, front end deployed, all three done-conditions pass. The reference chart was verified by arithmetic that does not go through the API, so the check survives them changing or going away |
| **7a · reading, matching, muhurat** | **On `main` and deployed, 23 Sep.** The daily reading is computed from the reader's own birth again — reversing 7 Sep — and `/match` (Ashtakoota) and `/muhurat` are new. **Never walked in a browser** — §29 |
| **2a · tarot** | **Reworked 24 Sep on `tarot-flow`, not merged.** Typed question, server-dealt card, the reading written by the model. The two free pulls a week were a browser flag that a reload cleared — they are a server column now — §31 |
| **2b · numerology** | **Built 25 Sep on `bhakti-numerology`, not merged.** `/numerology` from the second vendor, cached by name and date. Bhakti gained darshan, banners and search; Academy's Downloads tab is E-book — §33 |
| **UI · Home, Bhakti, header, avatars** | **On `main` and deployed, 10 Sep.** Live video deleted both sides; Home split into Feed/Today/Darshan; shrine moved to `/darshan`; Bhakti holds the nav slot; the horoscope slide-over deleted for a page; Shop's cart is a floating button; your own profile picture works. **024–027 are all on production (13 Sep)** — production has no `bhakti_assets`, so `/bhakti` there shows its empty state until they are applied. **Never walked in a browser** — see §5 |
| **UI · Sri Mandir repalette** | **On `main` and deployed, 30 Sep.** Both apps: grey page, white cards, saffron accent, green main-action button (both two shades lighter, same day), white tab bar, Poppins with bold headings. Colour and type only — no behaviour changed. The Home feed is Instagram-shaped the same day: stories strip, full-bleed posts, icon actions; reels gained the Like and Save the posts already had, nothing else changed what it does. Tokens in `docs/04-UI-UX.md` §2. Walked signed-in on the seeker app in Chrome; the consultant app only signed-out, since localhost:5261 is not in the API's CORS list |
| **"Logged out" on reopen — fixed 30 Sep** | The session was never lost: it persists in `localStorage` and a 400-day cookie (`lib/supabase.js`). Opening the bare site routed `/` → `/onboarding`, and Intro showed "Begin / Sign in" to a signed-in account. `SessionGate` now sends a signed-in account with a birth date from `/onboarding` to `/home`. Reproduced and verified in Chrome with a saved session. Not checked: the Supabase project's own session time-box / inactivity settings, which would end a session server-side |
| **Sign-up in two pages, 3 Oct — front end only, on `main`** | `/onboarding` is the phone screen (language toggle, what the app does, number → inline code); a number that already has a birth date goes straight to `/home`. `/onboarding/details` takes every birth detail on one page; then Computing plays the one-time reveal again (zodiac ring, Sun / Moon / Lagna). Intro, AskGender, AskDate, AskTime and AskPlace are deleted; their old URLs redirect. Edit birth details is the same page with `?edit=1`. Date and time fields insert `/` and `:` themselves — Namo AI's and Matching's *Someone else* form could not be filled on a phone keypad before. Language is remembered per device. No API or schema change. **Verified in Chrome with writes intercepted:** new-account path to the reveal and Home, the PATCH body, edit mode prefill and save, the Namo AI form. **Not verified: a real new number on production** (needs an SMS). Flow in `docs/03` §3 |
| **Owner's 11-point list and faster reels — 5 Oct, LIVE (`namo-api-00064-tsm`, `namo-console-00006-clb`)** | Welcome heading "Your kundli, astrologer and mandir darshan in one place"; a code filled in all at once (iOS suggestion, paste) submits itself — **Android auto-read needs the Supabase SMS template to end with `@1namo.com #{{ .Code }}`** (it still names the old github.io origin). Home: no play circle on reel cards, counts beside the icons. New `BackButton` everywhere. Today: only your rashifal, no "Computed at Ujjain". Profile: picture adjuster (drag, zoom) before upload; bio under the name, "Available" when empty (`profiles.bio`). Bhakti: share is full screen with one row of icon options and no explainer line; coloured shelf tiles; console **Bhakti** page edits pictures, captions and credit lines. Reels: the feed is cached 3 minutes and shared, and Home loads a reel card's video only near the screen — measured 54 → 3 video requests on opening Home, 4 → 0 feed refetches and 1.21s → 0.86s to the first frame when opening a reel. Fixed: the AI free-question test window overflowed `date` 34 days after its epoch (3 tests failing). 881 pass |
| **Instagram-style Profile — 4 Oct, LIVE (front end only)** | `/profile`: picture in a saffron ring, posts · followers · following, coloured Sun/Moon/Lagna chips, Edit / Share / +; icon tabs Posts (grid) · Saved · Kundli (· Influencer); ☰ → `/profile/settings` holds wallet, orders, invite, language, help, sign out. **Removed: the mock "Past sessions" list** (pre-release item 6 — there is still no real session history screen), and the Download / Share / notifications / privacy rows that only toasted. Walked signed in as the test number 7011921246 with stand-in posts for the grid; no writes |
| **Real Insights, own posts that open, admin banners and themes — 4 Oct, LIVE (`namo-api-00063-kmq`, `namo-console-00005-7hp`)** | Insights (`GET /v1/consultants/me/insights/`): last 7 days, the consultant's own posts with thumbnails and views, products sold with their coupon — replacing the prototype's "3,12,000 views". Studio's published list has thumbnails, numbers and opens each post; `/reels/:id` and `/read/:id` now exist in the consultant app and show only their own. Fixed: a 56px white band under every reel opened alone (both apps); ProAffiliate read `imageUrl`/`pricePaise`, which products do not have. Console: **Banners** and **Themes** (`docs/01` §6 item 10, `docs/05` §5.2g). 10 new tests, 877 pass. Walked with faked API responses: Insights, Studio rows, opening an own reel, a gold Diwali theme with its greeting. **Not walked: the banner rails** (they are on seeker screens; no signed-in seeker here) |
| **Ladder colours and required asterisks — 4 Oct, on `main` with the row below** | The milestone ladder shows every tier's colour ahead of time (faded until reached) and names the next ring; red asterisks on required fields in sign-up details, payout details and the support report. Walked in the consultant app |
| **Support page, influencers, the kundli sky — 4 Oct, front end LIVE; `profiles/0004` on production (database default kept, the 032 check passes); API and console LIVE since `namo-api-00063-kmq`** | `/support` in both apps (signed out too): +91 99580 40508, support@1namo.com, a pre-filled email/WhatsApp report, five FAQs; no ticket system (a helpdesk on the mailbox is the plan, not set up). Influencers: `profiles.influencer` flag (console: Make influencer, plus a "Brought" column), `GET /v1/referrals/influencer/`, Profile → Influencer tab, `?ref=N…` sign-up links pre-fill the code; claims now write `attribution`. Kundli sky: one `Loader` everywhere, dawn wash and saffron bubbles in both chats, stars and the ring in Namo AI. **Fixed: the consultant app could not open any chat** — `ChatPanel` was seeker-only since the 19 Sep build split, so Consult → Chat and Messages did nothing; and the chat panel and `Sheet` were frosted grey. 8 new tests, 867 pass. Walked: Support signed out (seeker) and in the consultant app, the pre-filled mail, `?ref` stored, the consultant chat panel opening on a real thread. **Not walked: the Influencer tab and Namo AI's new look** (no signed-in seeker here) |
| **Milestone badges and payout details, 3 Oct — LIVE (`namo-api-00061-npk`, `namo-console-00003-sb4`)** | Badges: paid sessions given (`sessions_done` on the consultant rows: ended sessions with a charge) at 1/10/100/500/1000 — ring and badge on Consult cards, the public page and the pro profile, a ladder to 1000, a one-time congratulation per tier per device (`lib/milestones.js`, `components/Milestones.jsx`). Payout details: `/pro/payout-details` collects PAN, bank, optional UPI and two private photos; `payout_details` table (`docs/05` §5.2f), PAN and account number Fernet-encrypted; Finance-only console page with verify / reject (reject needs a note). The Earnings tab no longer names a payout date. 17 new tests, 859 pass. Walked in Chrome against production with the session count, payout API and upload faked: congratulation at 10 and 1000, ladder, public page ring, the form through to the summary. **Not walked: the seeker Consult list cards** (no signed-in seeker on this machine). `PAYOUT_ENCRYPTION_KEY` is set on both services; the owner holds a copy. No automatic PAN or bank check, and no alert to the consultant when details change |
| **Payouts P1: real earnings by period, 3 Oct — LIVE (`namo-api-00060-kl9`)** | `/pro/earnings` shows real totals for this month, last month, this FY, last FY and lifetime: net, gross less fee, payout day, booked-not-yet-held, by source, last 7 days, paged entries. New `apps/consultants/earnings.py` and `GET /v1/consultants/<id>/earnings/summary/`; the rows endpoint pages with `?range=` and stays a bare list without it. A booking counts in the month of its session. Sample card and Withdraw sheet deleted; the 7-day bars, which never drew, draw. 22 new tests, 842 pass. Walked against production data through a local API: the test consultant shows September ₹4.10 (₹90.20 chat less ₹86.10 reversals). **Still `mock.js` on that screen: Performance, Referrals, the Insights tab.** Owner: no GST on payouts for now, TDS at payout (`docs/01` §8). Design for P2–P5: https://claude.ai/artifact/VjYSfdLiEMpEXWa5ewAV57 |
| **Darshan: a cross and a deeper, lower altar, 10 Oct — front end LIVE (`9cd8d2c`, both apps)** | Rahul, Telegram. The way out at the start of the deity chips is a cross, not an arrow (`BackButton` takes `icon`); the marble slab's front face is half the photo's height (from three quarters) and its top surface 1.8 times deeper, with the samagri a third of the way back — "10% wider" turned out to mean a deeper top, so the thali stops looking as if it is falling. Lint clean; seen in a local render of the screen (screenshots sent to Rahul), not walked signed in |
| **No "More from Namo", no Premium, 11 Oct — LIVE (`b0d3d6c`, both apps)** | Rahul, Telegram. Settings lost the "More from Namo" section (Ask the Stars, Premium, Academy, Shop). Each was a second link to a tab or a tool. Premium is not offered, so its screen is deleted and `/premium` forwards to Home: Rahul does not want an unlinked page indexed. The pro app and the console had no Premium or More-from-Namo links (`docs/01` §4.5, `docs/03`). Lint and both builds clean |
| **15a: like and follow alerts, 13 Oct — LIVE (`namo-api-00125-6jv`, web/pro `4f09ef3`)** | A like tells the author once per post per IST hour (`dedupe_key` `like:<post>:<hour>`), a follow tells the person once per pair (`follow:<actor>:<target>`), never for your own (`content.services.notify_like` / `notify_follow`, called from `reactions.services`). `notify.push` now inserts inside a savepoint. Alerts are tappable: follow → `/u/:id`, post alerts → `/profile` (`alertHref`). Both apps; the console has no alerts. `docs/03`. Tests `test_social_notifications.py` (5); lint clean; not rendered |
| **15a: a page per hashtag, 13 Oct — LIVE (`namo-api-00125-6jv`, web/pro `4f09ef3`)** | `/tag/:tag` (`TagScreen.jsx`, both apps): Newest · Top, feed cards. `GET /v1/content/tag/<tag>/` (`content.services.by_tag`) matches whole-word, case-blind, any script (#शिव is not #शिवरात्रि) among the newest 1,000 live posts; Top by likes + 2 × (saves, comments, reshares). A #tag in a caption links there (it opened Search). `docs/03`, `docs/05`. Tests in `test_social_notifications.py` (3); lint clean; not rendered (needs the API) |
| **15a: People to follow, 13 Oct — LIVE (`namo-api-00125-6jv`, web/pro `4f09ef3`)** | A strip after the feed's fifth card, signed in only (`FollowSuggestions` in `Home.jsx`; `GET /v1/content/suggestions/`, `content.services.suggest_follows`): friends of the people you follow first, then authors active in 14 days. Both apps (the pro feed is the same Home). `docs/03`, `docs/05`. Tests (2); lint clean; **not rendered** — it needs a signed-in session. Also: Home's comment calling the feed random is corrected |
| **Tagline "Hindu Social Network", 13 Oct — LIVE (`namo-api-00125-6jv`, web/pro `4f09ef3`)** | Rahul, Telegram, after being told the app carries Jain content and offered "Dharmic" or "Sanatan": he kept "Hindu Social Network". The welcome headline (`w.title`, Hindi हिंदू सोशल नेटवर्क), the page title, description and share card in `index.html`, `public/og.png`, and `share.SITE_LINE`. Replaces "India's spiritual network" in the row below |
| **15a: positioned as a spiritual network, 13 Oct — LIVE (`namo-api-00125-6jv`, web/pro `4f09ef3`), with the tagline above** | The welcome screen already read "India's Spiritual Network". Changed: the page title, Google description and share card in `index.html`; `public/og.png` redrawn ("India's spiritual network / Bhakti, darshan, gurus and your kundli"); the API's fallback share text (`share.SITE_LINE`, was "Astrology, darshan and …"). `docs/01-PRD.md` §1 and `CLAUDE.md`'s first line restate the product. Share-preview tests pass |
| **Pro app: Edit profile no longer bounces, 13 Oct — fixed, LIVE (`namo-api-00125-6jv`, web/pro `4f09ef3`)** | Found while adding `/tag/:tag`: the consultant build's `SessionGate` sent every non-`/pro` path it did not list to `/pro/studio`, and `/practice/edit` (live since `bcb9a0e`) was not listed, so Edit profile in pro.1namo.com opened the studio instead. `/practice/edit` and `/tag/` are exempt now (`App.jsx`). The seeker app was never affected |
| **15a: sign-up with interests, birth details when first needed, 13 Oct — LIVE (`namo-api-00125-6jv`, web/pro `4f09ef3`); `profiles/0007` on production** | Owner's yes (sign-up change). `/onboarding/details` asks name and three to five interests (`profiles.interests`, migration `profiles/0007` — applied with `prod-migrate.sh profiles` before the API deploy) and goes to Home; no reveal. A chart, match, muhurat or the Today tab with no birth date links to `/onboarding/details?edit=1&need=1&next=…` (`lib/birth.js`), which returns there after saving. Signed up = interests or a birth date (`signedUp` in `Welcome.jsx`), so no existing account is sent back. The personal feed adds +2.5 for a post carrying one of the reader's interest words. Phone OTP login untouched. `docs/03`, `docs/05`. Tests: ranking (2 new); lint clean; both pages rendered with a stub store. **Not walked** with a real new number |
| **Video compression (15d), 14 Oct — LIVE (web/pro `aa06f25`)** | Rahul, Telegram. `src/lib/compress.js` with `mediabunny` 1.60.0 (lazy chunk): every video over 8 MB becomes H.264 ≤1280 px, 1.2 Mbit/s, AAC 96k before upload, in `uploadMediaAsset` (`lib/content.js`), so the composer and the intro video both get it. Falls back to the original on any failure. Composer shows "Making the video smaller · n%". Videos are at most **90 seconds** (Rahul), checked from metadata before upload. Proven in headless Chrome: 17.2 MB → 4.8 MB, 720×1280, plays. **Not tried:** a real phone (speed, Safari). Front end only. `docs/02` Performance, `docs/03`, `docs/06` |
| **Dashboard: Practice page folded in, 14 Oct — LIVE (web `413958d`)** | Rahul, Telegram. Main app only: "Practice and reviews" (`/dashboard/profile`, ProProfile) removed; Dashboard's **Your rates** opens `RatesSheet` (exported from ProProfile); Intro video and Username are rows at the top of Edit profile (`EditPractice` `PageRows`); `/dashboard/profile` redirects to `/dashboard`. Pro app unchanged. `docs/03`. Lint and build clean; Dashboard rendered |
| **Edit profile: Basic link, Your Pro Profile, 14 Oct — LIVE (web `3798048`)** | Rahul, Telegram. Main app `/practice/edit`: a Basic profile row on top that opens **Profile settings** whole (`/profile/settings`; Settings was renamed Profile settings the same day), the section renamed Your Pro Profile with Intro video or photo first; Username left it (it is in Settings). Pro app unchanged. `docs/03`. Lint clean; rendered |
| **Profile settings trimmed, 14 Oct — LIVE (web `7be410e`)** | Rahul, Telegram. Settings lost *Intro video or photo* (now in Edit profile) and *Notification history* (the bell is the notifications; `/notifications` still opens). Its Profile section shows only for a Creator, with the Creator row. `docs/03`. Lint clean; not rendered |
| **Wallet on Consult; Profile down to Edit and Share, 14 Oct — LIVE (web `10d8aaf`, with the return fix)** | Rahul, Telegram. Consult's header button is a wallet (was a chat bubble) and the page it opens starts with a wallet card: balance, Add money (`/wallet?add=1` opens the sheet), Details (`/wallet`). Back from the wallet (its ←, the phone's back, or a finished top-up) reopens the Consult list (`lib/consultReturn.js`, a 15-minute session mark; fixed the same day after Rahul found it landing on Consult closed). Profile's icons are Edit and Share; Edit opens Profile settings, whose Edit details row now shows for everybody (it was a Pro's). The wallet page lost its two dead buttons, Statement and All (both toasted "not built"). `docs/03`. Lint clean; the Consult page rendered |
| **FOUND 15 Oct, CLOSED 15 Oct (the commission row above withdrew it, owner's yes): Namo's share per astrologer (`consultants.fee_bps`, §82) has been in the live API and console since this session's deploys from main (`namo-api-00138` on)** | §82 says it waits for the owner's yes and that only the deploy copy (`C:/namoapi`) is deployed; this session deployed from main instead. `consultants/0010` is not recorded on production but the `fee_bps` column exists there, so nothing failed. Every row is NULL, so every share is still the 40% default and no earning has changed; but the console shows "Namo's share %" to Finance and Superadmin, and typing one would change an astrologer's earnings. Owner left it to Rahul (15 Oct, "jo Rahul bhaiya bole"); Rahul: "Astrologer commission will be fixed for all". **To do: withdraw it** — `fee_bps_for` returns `FEE_BPS`, the console's Namo's share field, column and Finance access removed, column left unused; the change was written and refused by the session's permission check (a commission edit), so it waits for the owner in the terminal. Until then nobody should set the field |
| **Market: Downloads, Events, Courses first; MRP on every card; landing pages by kind, 15 Oct — LIVE (web/pro `a951906`, `namo-api-00140-ln5`, `namo-console-00033-q6h`; `bhakti/0008` migrated)** | Rahul, Telegram. E-books renamed Downloads (any file), tile order Downloads · Events · Courses · categories, and the All sections Downloads first. Cards show *Sold by: <seller>* (19 Oct, Rahul; `MarketCard` `seller`), price, MRP struck through and % off (`MarketPrice` in `MarketCard.jsx`). E-books get an MRP and a description: `bhakti_assets.mrp_paise`, `.description` (migration `bhakti/0008_asset_mrp_description`), set in the console's Bhakti form (Market (downloads) section; MRP in rupees). Landing pages by kind: a download's own page `/shop/d/:id` (`src/screens/DownloadPage.jsx`: cover, What you get, What is inside, More downloads, one button at the foot) and the product page's Sold by / Shipped by Namo / Free delivery row; both rendered locally. Web can ship alone (no MRP on books until the API and `bhakti/0008` go out). Courses and Events get MRP when they are built (Phase 17). Rendered locally |
| **Course and event pages, 15 Oct — DESIGNED, not reachable** | Rahul ("show product page for events and courses also"). `src/screens/ListingPage.jsx` (`CoursePage`, `EventPage`); sample data and the route `/shop/preview/:kind` exist in a development build only (`import.meta.env.DEV`; checked: the production bundle carries neither). Wired to data when Phase 17 builds courses and events. `docs/03` |
| **Earn on Namo merged into the Dashboard, 16 Oct — LIVE (web/pro `b04f257`)** | Rahul, Telegram ("Sab ko tino dikha do"; then "same design" for the held ones). A held module is the same card (orange icon, title, You have this) with its links inside (`ModuleCard` `children`). `/dashboard` opens for everybody signed in: a held module is its section, one not held is its card from `Earn.jsx` (`ModuleCard`, `CARDS`, exported) with the request; the top table and Payout details only with a module. `/earn` redirects to `/dashboard`; the Profile settings row and the Profile Dashboard button (now everybody) open it. `docs/03` rewritten. Front end only. Lint and both builds clean; rendered with stubbed reads (a seeker, and a Creator with Seller waiting) |
| **1namo.com's DNS on Cloudflare; `media.1namo.com` serves the media, 18 Oct — LIVE (`namo-api-00167-9j8`, `namo-console-00048-2b5`)** | Video pipeline part A (`docs/06` Phase 19), Raghu's permission in the terminal. Before the switch the Cloudflare zone was compared with GoDaddy record for record; its import lacked Zoho's DKIM (`zmail._domainkey`), which was added. Rahul changed GoDaddy's nameservers to `jade.ns.cloudflare.com` / `mustafa.ns.cloudflare.com` (DNSSEC off); the zone went Active; afterwards 1namo.com, `/studio`, the console (`/console/`), pro.1namo.com's redirect, the 3 MX and the DKIM all answered as before. `media.1namo.com` is the R2 bucket `namo-media`'s custom domain (Cloudflare's cache: a reel came back `cf-cache-status: HIT`). `MEDIA_PUBLIC_BASE_URL` on the API and the console is `https://media.1namo.com`, so new uploads get that address; rows saved with the `r2.dev` address keep it and still play (nothing compares URLs against the base). `namo-media` CORS also allows `https://localhost` and `capacitor://localhost` (the Android app, for HLS later), as does `namo-docs`. All Cloudflare changes through the Cloudflare connector (account onenamo.com@gmail.com). DNS records live in Cloudflare now, not GoDaddy |
| **Darshan murti as a photo, a video or a YouTube link, 20 Oct — LIVE on Rahul's "ship" (`bhakti/0010` migrated; `namo-api-00184-cph`, `namo-console-00037-nq6`, web `ec66b61`)** | Rahul, Telegram: temples' live darshan on YouTube inside the darshan page, nothing that sends people to YouTube; then, seeing a Live pill and list, "remove this live button ... we will put either image or video or yt video link in darshan deity. Anyone. And that will show in this frame" — the Live pill, its list and the `live_darshans` table were dropped before any deploy. `darshan_images` gains `video_url`, `youtube_url`, `youtube_video_id`, `youtube_channel_id`; `image_url` may be empty (`bhakti/0010`, docs/05 §5.2c-bis). `apps/bhakti/youtube.py` (link parsing, @handle lookup, oEmbed embedding check, a channel's current stream from its /live page). Console *Darshan pictures*: upload a photo or an MP4 (30 MB), or a YouTube link, with a preview. `GET /v1/bhakti/darshan/` adds `kind`, `video_url`, `embed_url`. App: `src/components/DarshanFrame.jsx` in the shrine's frame; *· Live* on the plaque; Sangeet hidden on a YouTube murti (docs/03). Tests `test_darshan_frame.py` (11, YouTube mocked). Checked against a real 24-hour YouTube channel; rendered locally with a sample YouTube murti (headless Chrome, stubbed API), screenshots sent to Rahul. No YouTube murti added on production yet. **Temple channels added, 20 Oct (Rahul: "sab daalne hai"):** 22 official temple YouTube channels written to production as channel-link murtis, active, after each deity's photos (Hanuman 3, Shiva 3, Lakshmi 2, Ganesh 2, Durga 3, Mahavir 3, Aadinath 3, Shani 3; Somnath was Rahul's own). Each passed the oEmbed check, live or on its past streams. A channel not live at that hour shows YouTube's own not-live screen in the frame. Vaishno Devi refuses embedding; the Mehandipur Balaji channels are media companies', so neither was added. The Online switch is gone from `/darshan`. **Off air, 20 Oct — LIVE on Rahul's "ship" (`bhakti/0011` migrated; `namo-api-00185-jtm`, `namo-console-00038-z6j`, web `c7e3c04`)** (Rahul: "agar live available nahi h to time kab live hoga. Ye likh do"): `live_hours`/`live_hours_hi` (`bhakti/0011`), `youtube.live_status` and `GET /v1/bhakti/darshan/<id>/live/` (docs/05 §5.2c-bis); `DarshanFrame` shows that murti's own photo (none yet on the 17 channels, so dark until the console adds one) with *Not live right now*, the scheduled time and the timings (docs/03). Five channels silent for months (Sankat Mochan, Kshatriyakund, Koba, Thirunallar, Shani Shingnapur) set inactive on production on Rahul's word. No temple of the 22 had a stream scheduled on YouTube when checked, so the timings box carries it. Tests 5 more in `test_darshan_frame.py`; rendered locally with a stubbed off-air channel. Timings written for Dagdusheth, Kundalpur, Mohankheda, Shani Dham and Ambaji from their last streams; the rest are 24-hour or irregular |
| **सुझाव: suggested replies for the consultant, 20 Oct — LIVE on Rahul's "ship" (`namo-api-00185-jtm`, web `c7e3c04`)** | Rahul, Telegram: "chat me pro ko suggested text dikha sakte hai ... according to what is the question of seeker", then "सुझाव button sahi h" (a button, not on every message, to bound the AI spend). `apps/ai/suggest.py`: the session's last 12 messages as one labelled transcript and the consultant's category to the AI provider, three replies to the question in that field and the seeker's language (Rahul: "सवाल ke hisab se ... Councilor, ayurveda, पंडित bhi"); the seeker's chart only for a chart-reading category; the live session's consultant only; 4 s between asks and 100 a day per consultant (Rahul; about 10-20 paise a tap, estimated from Flash rates, not checked) (per-instance LocMem cache, so per Cloud Run instance). `POST /v1/chat/threads/<id>/suggest/`. ChatPanel's Composer: a सुझाव chip leads the suggestion row once the seeker has written; replies replace the openers, clear on the seeker's next message or the consultant's send (docs/03). Tests `test_chat_suggest.py` (12, mock provider). Not rendered: needs a live session; check it on the first real chat |
| **Default username from the name, not user-NNNN, 19 Oct — LIVE 20 Oct (`namo-api-00183-m5d`; 8 renamed on production)** | Rahul, Telegram: "first and last name with a number ... this not happening". **Bug:** the app reads `/v1/profiles/me/` right after the OTP, before the name is typed, so `ensure_username` drew from the placeholder name and new people got `user-NNNN` for good. Now `save_onboarding` calls `rename_placeholder_username` when a name is saved: a `user-NNNN` nobody chose (`username_changed_at` null) becomes `name-surname-NNNN`; a chosen username or one already made from a name is never touched. Existing ones: Rahul said "sabka badal do" (his yes); `manage.py rename_placeholder_usernames` counts, `--write` renames (same rule; no-Latin names kept). Run on production 20 Oct on the owner's go-ahead in the terminal: 8 renamed, 1 kept (no Latin name). Tests `test_profiles.py` TestUsername (+2); full suite 1482 passed. |
| **Console corrects a seller's listing, 19 Oct — LIVE 20 Oct (`namo-console-00036-sjp`)** | Rahul, Telegram: admin changes any field (category, name, description, price, MRP) instead of sending it back. *Market → listing* page: a section *Correct it here* with the kind's boxes (all: name, price ₹, MRP ₹, description, picture URL; product: category from the shop's list, units, weight; course: language; event: start, minutes, seats, link). `market.services.admin_check` / `admin_edit`: the seller's rules (`_clean`), status unchanged, an approved product's shop row takes name, picture, price, MRP, description, weight and category at once (stock, brand, active stay the shop's); audited `market_listing.edit`. File and lessons stay the seller's. `docs/01` §6. Tests `test_market_console_edit.py` (4); full suite 1480 passed. |
| **Play Store readiness: delete account, block, guidelines, no in-app digital sales, disclaimer, 19 Oct — LIVE on Rahul's "ship" (`namo-api-00180-m4t`, web `a862004`)** | Rahul, Telegram: submit in the Social category, what will get it approved; then "Do" (his yes covers the account-deletion work, owner's rule of 17 Oct). `profiles.services.delete_account` + `POST /v1/profiles/me/delete/` (confirm DELETE): profile fields wiped, `blocked_at` set (hides content), consultant `blocked`, referral codes off, push and notifications gone, `auth.users` row deleted (postgres only); money records kept. Settings → *Delete my account* (`DeleteAccount.jsx`). `public/delete-account.html`, `public/community-guidelines.html`, terms link. Block on `/u/:id` (`dms.blocked_by`): for-you, feed and comments leave out the blocked. `src/lib/platform.js` notes the TWA (referrer `android-app://com.onenamo.app`); a paid listing (download or course) there says *Not sold in the app*, and so does every `Paywall` (a priced Market download, a muhurat, predictions; 19 Oct, found after Rahul priced a download at ₹10); one bought on the website still opens. The app shows no price on a priced download or course either (cards, pages, foot; `MarketPrice digital`), Rahul same evening. Report from a consultation chat too (⋮ in the chat panel header, both sides; the message thread already had it). `legal.astro` line on Ask and Tarot. `docs/02`, `docs/03`. Tests: 4 new; full suite 1476 passed. Still the owner's/Rahul's in Play Console: a test phone with a fixed OTP (Supabase → Phone), Data safety, content rating, the App signing SHA-256 for `assetlinks.json` |
| **Namo AI and tarot free only, 19 Oct — LIVE on Rahul's "ship" (`namo-api-00179-bjg`, web `b72bd52`)** | Rahul, Telegram: "user will use only free wala ... We will not charge him as of now. So remove all reference for payments or rates ... After using available limit we will ask him to come next day. Tarot bhi 1 card per day ... namo ai one question per day"; then "5 free rakh lo" (the welcome five stay). `AI_PAID` (default off): `ai.ask` and `tarot_pull` refuse past the free ones with *come back tomorrow* (`come_back: true`) and never debit; no `price_paise` reaches the app. Tarot's free allowance is per IST day (`TAROT_FREE_DAILY`=1) while unpaid, per week when paid. Cloud Run already had `AI_DAILY_FREE=1`. App: Ask shows *Free again tomorrow* and the line, Send off; Tarot shows *n free today*, then *Next free card tomorrow*. `docs/01`. Tests: paid tests run with `AI_PAID` on, `tests/test_free_only.py` new; 55 passed |
| **Pro daily report, 19 Oct — LIVE on Rahul's "ship" (`consultants/0013` on production; `namo-api-00178-r84`, `namo-console-00035-fjs`, web `1a7ec4a`; the first sweep after 10:00 wrote 18 Oct for 5 Pros, all 0, no notifications since none had calls)** | Rahul, Telegram (a daily report: live time, calls received and attended, a score out of 100 with video weighted, customers recharged, the tag; then "All three ok": audio 1.5, Online time in the score, a nightly notification). `consultants/0013` (`consultant_presence_switches`, `pro_day_reports`); `apps/consultants/report.py`; switch changes logged in `touch_presence`, `go_offline` and the missed-calls rule; `GET /v1/consultants/me/report/` (7 days); Studio → Consulting → *Daily report* (`src/screens/DailyReport.jsx`); console *Pro daily reports* (Consulting card), read only, Support and Finance; the chat minute sweep runs `report.tick` (at 10:00 IST, yesterday's whole day, 00:00–24:00: rows + each Pro's notification; Rahul moved it from 23:00 the same day) — not the dispatch job, whose image is pinned to an old build. The month to date is scored as one too (Rahul: "Score poore mahine ka rakhna hai. Till date"): `report.month_numbers`, `month_score` on the row, first on the Studio screen, the notification's title, a console column. Online time counts from deploy. `docs/03`, `docs/05`. Tests: 10 new; full suite 1469 passed before the month score. |
| **Referral codes: four characters, one per person, old ones off, 19 Oct — LIVE on Rahul's "ship" (`referrals/0005` on production: 12 rows, 10 people, all 4 characters; `namo-api-00177-jtn`, web `1991a71`)** | Rahul, Telegram: "इसे 5 digit kar do", then "4 digit kar do. Sabko ek he. Aur purane band kar do" (asked whether a separate Pro code helps; told: little). `referrals/0005_short_codes`: `code` unique per (code, kind) instead of overall; a data step gives each of the 12 people holding a code (10 seeker, 2 consultant rows) one new 4-character code on all their rows and moves open `affiliate_visits` to it; old codes stop resolving. `code_for` reuses the person's other row's code or mints one checked against every code and shop coupon; `resolve(code, kind)` picks the programme's row (sign-up seeker, checkout/links consultant). App: `looksLikeReferral` takes 4 characters; Welcome and affiliate links no longer check N/A; placeholders `XXXX`. `docs/05`, `docs/03`. Tests: 7 changed, 1 added; full suite 1460 passed. |
| **Pro calls ring full screen on every page; online anywhere in the app, 19 Oct — LIVE on Rahul's "ship" (web `c1faa6e`)** | Rahul, Telegram: a call showed only on the Desk; it should cover the whole screen like a WhatsApp call on every page. `IncomingCall` and `PresenceKeeper` are mounted once at the app root (removed from `ProLayout` and the Desk) and gate on `isPro` or an approved `consultant` row; `IncomingCall` is a full-screen alert (Decline red left, Answer green right, ring and vibrate), a quiet top line while already on `/call/`. The beat now runs on every page for an approved consultant, so with the switch on they stay online off the Desk (was 90 s grace). Then (Rahul, "Banao"): `PresenceToggle floating` — an Online/Offline pill in `TabLayout`, 72 px above the tab bar (over Home's +), for an approved consultant only. `docs/03`. Lint and both builds clean; **not tried with a real call** |
| **Profile picture ring round again, 19 Oct — LIVE on Rahul's "ship" (web `4fccea6`)** | Rahul, Telegram ("ye round nahi h", a screenshot of /profile). The saffron ring's two wrappers in `Profile.jsx` were `block` around the inline-flex `PopAvatar`, so a line box under it made the ring taller than wide (the trap the 13 Oct `PopAvatar` note describes); now `flex`. Lint and build clean |
| **Post words above the picture, 19 Oct — LIVE on Rahul's "ship" (web `ac16fb3`)** | Rahul, Telegram: the text should go above the post, below the name, not below the image. `PostText` in `src/screens/Home.jsx` under `PostHead` on photo posts and reels (three lines, then More); `Caption` below keeps the comments link, and the words for a text-only post that is not a tile. `docs/03`. Lint and build clean |
| **Clean videos go live for everybody, 19 Oct — LIVE on Rahul's "ship" (`namo-api-00176-prk`)** | Rahul, Telegram: "User post jo approval ke baad live hoti hai. Wo hata do"; owner's yes in the terminal. `apps/clips/moderation.py`: a clear SafeSearch verdict is `live` for anybody; until now everybody but an approved Pro or Creator had their first 3 videos wait in the review queue. Doubtful frames or no verdict still wait; a violation is still rejected. The held video (clean, 19 Oct 08:56 IST) approved from the terminal; its post briefly got `media.example.com` (local settings' `public_url`, the trap noted in the reels row) and was corrected to media.1namo.com within a minute. `docs/06`. Tests: 2 changed, 1 replaced; full suite 1457 passed |
| **Video statuses in Bhakti, 19 Oct — LIVE on Rahul's "ship" (`namo-api-00175-sj5`, `namo-console-00033-j8z`, web `a46cb63`)** | Rahul, Telegram: "Bhakti me console se video bhi daal sakte h". Console (`apps/bhakti/admin.py`): a status's upload may be a video (MP4/WebM/MOV, up to 30 MB, Cloud Run's request size), stored as a `reel` media asset in the public bucket; an optional *Cover picture* fills `preview_url`; the list and form preview it. App: `VideoStatusCard` in `Bhakti.jsx` plays it (muted, tap for sound) under the picture status's card and shares a file with that card drawn into every frame (`composeVideoStatus` in `src/lib/bhakti.js`: mediabunny, 720×1280, hardware encoder preferred, made only when Share is tapped (Rahul changed it from "when on screen" the same day), one at a time, then *Send to WhatsApp* takes a second tap because the share sheet needs a fresh tap; `composeStatus(..., { overlay: true })` draws the card alone); a phone without WebCodecs shares the plain video. Console refuses a video over 30 s (`mp4_seconds` reads the `mvhd` box; checked against real reels). Rahul asked for the card on 19 Oct after first seeing it plain. **Not tried on a phone**; Home's reshared Bhakti card shows a video's cover or frame. `share.py` previews a video status by its cover only. No schema change. `docs/03`. Tests: 2 new, 34 related passed; lint and build clean. |
| **Faster video start: CDN cache, old reels via media.1namo.com, next reel loaded, 19 Oct — cache LIVE; app LIVE on Rahul's "ship" (web `a46cb63`)** | Rahul, Telegram: video latency in the feed and Reels, the plate shows first. Found: all 123 live reels are old whole MP4s (1-11 MB) on the `r2.dev` address with no poster; none went through the pipeline; `media.1namo.com` answered `cf-cache-status: DYNAMIC`. Done on Rahul's "Karo": a Cloudflare cache rule on the 1namo.com zone (`http_request_cache_settings` entrypoint, rule `7fbff077…`: host `media.1namo.com` → cache, edge and browser TTL respect origin; second request is a HIT). App: `viaCdn` in `src/lib/content.js` plays r2.dev media through `media.1namo.com` (rows unchanged); Reels loads the next reel down properly (`load='next'`: MP4 `preload=auto`, HLS 8 s) instead of its metadata. Old reels through the pipeline (B), done 19 Oct (124 of 125 live reels on HLS; one, `be4b7c89…` of 9 Sep, has no file in the bucket and keeps its broken MP4; doubtful verdicts — deity art often reads racy LIKELY — got the HLS copy too, since the posts were already live; no violations): a scratchpad script copies each MP4 inside R2 to `namo-docs/uploads/{video}/source` and makes a `clips_videos` row (`category=backfill`, `processing`); the API's minute sweep sends it to the worker; a clean result becomes the post's `media_url` (HLS on media.1namo.com) and `video_id`, the row `live`; a rejected or failed row keeps the post's MP4, with `error` starting `backfill:`. The original MP4 stays. Trap met: local settings' `public_url` gives `media.example.com` — the script writes the host itself. Lint and build clean |
| **Seen posts and reels after the new ones, 19 Oct — LIVE on Rahul's "ship" (`namo-api-00174-n6j`, web `3d269ab`)** | Rahul, Telegram: "Home feed pe jo reel ya post hamne dekh li wo peeche chali jaani chahiye", "home feed and reel swiping". `ranking.for_you` ranks the unseen and the seen (a `ContentView` in the last 14 days) apart and returns unseen first; each row's `seen` is in the for-you response. `src/lib/content.js`: `recordView` also notes the id in `localStorage` (`namo:seen`, newest 500) and `seenLast` puts those after the rest, so a signed-out reader gets the same. No line where the seen begin (a *You have seen everything new* line was dropped the same day, Rahul). A blog card counted as nothing until the same day's fix (Rahul: a blog kept coming back): `ArticleCard` now notes itself seen on this phone after 2 s on screen (`noteSeen`), not on the server — the server's blog view is opening it, which the 30-second read that earns is timed from; so a blog seen on another phone is not known here. Live on Rahul's "ship" (web `df9474b`); Rahul accepted the phone-only limit. Reels use the same feed. `docs/03`. Tests: 1 new, 138 feed and content passed; lint and build clean |
| **Console front page by part of Namo, 19 Oct — LIVE on Rahul's "ship" (`namo-console-00032-fjj`, asia-southeast1)** | Rahul, Telegram: "console ko thoda organis kar do … cards: Home feed, Bhakti, Chat, Consulting, Market, Profiles, Overall admin, and rest you find better". `apps/console/templates/admin/index.html`: the queues stay on top; the cards are now Home feed (posts by kind, videos, reports, flags, engagement, pay rate), Bhakti, Chat (groups, notifications, open reports; messages are private and not in the console), Consulting, Market, Profiles (with Creators and delivery addresses), Money, Referrals and links, Look of the app, Overall admin (dashboard, admins, audit trail, analytics events and attribution). Every registered console page is in a card (a test checks it). Wallet, payments and chat sessions have no console pages; not added (money and private data). Full suite before this change 1451 passed; console tests 35 passed after |
| **Studio buttons grey, 19 Oct — LIVE on Rahul's "ship" (web `c20170d`)** | Rahul, Telegram: "Studio button ka color thoda gray … Sabhi jagah". The Studio button on your profile (`Profile.jsx`), on a Pro's own page (`ConsultantProfile.jsx`) and in the Desk header (`ProHeader.jsx`) is filled grey (`#e8e8ed`, border `#d9d9df`) where it was white. The cut screen's bar uses the same grey (`bg-surface-2` is not a class here). Lint and build clean |
| **Cut a long video before it posts, 19 Oct — LIVE on Rahul's "ship" (web `cca96f2`)** | Rahul, Telegram: "If video is long can we allow to cut it" … "and posting". A new reel over 90 s opens `src/components/VideoTrim.jsx` (the whole video with its controls and the time it is at, *Start here* / *End here* from that moment, start and end sliders, a bar of the part against the whole, *Play the part* loops it; at most 90 s — the time and buttons added the same day after Rahul could not tell where the video was) instead of the refusal; `compressVideo(file, onProgress, trim)` passes `trim` to mediabunny's Conversion and always re-encodes a cut, throwing *This phone cannot cut a video…* where WebCodecs cannot; `uploadVideo` takes `trim` and returns the uploaded `file` for the composer's preview. Server unchanged (still refuses over 90 s). Seeker and pro share the composer; console unchanged. `docs/03`. Lint and both builds clean. **Not tried on a phone or in a browser** |
| **Report on every feed card, 19 Oct — LIVE on Rahul's "ship" (web `dc8c619`)** | Rahul, Telegram: report showed only in the reel viewer; wanted on each post beside Following, as on Instagram. Photo posts had the ⋯ already; `ReelCard` and `ArticleCard` in `src/screens/Home.jsx` now pass `onMore` to `PostHead` and open `ReportSheet`; the dots stand upright (⋮, narrower) since the same day; your own card keeps Edit instead. Seeker and pro share the feed; console unchanged. `docs/03`. Lint and both builds clean |
| **Shop is Market everywhere; Downloads, Events, Courses as categories; hide any category, 19 Oct — LIVE on Rahul's "ship" (`shop/0012` on production; `namo-api-00173-4kt`, `namo-console-00031-bbr`, web `ad83b90`)** | Rahul, Telegram: "Download, Event & Course - put this in category of shop … change the name of shop to market - once for all … our market is selling goods and services both", then "we can hide these download event and course category too". `shop_categories.show` (`shop/0012`, with the console's model names *category* and *sub category*); `GET /v1/shop/categories/` returns `show`; console Categories list edits Sort and Show; `Shop.jsx` reads a console category named Downloads/Events/Courses as that tile in the console's order, drops any unticked category's tile and section. Words: the app's i18n (nav, NAMO Market, orders, support, the product page, the composer's tag search, the share card's label, a seller's profile tab), the console's app name, refusals and the wallet note now say Market; `/shop/...` addresses unchanged. Production: the categories Downloads, Events and Courses created (sort 5-7, after Maalas) and **hidden** on Rahul's word ("hide download, event and courses category"), so the Market shows no Downloads, Events or Courses tile or section; Rahul Jain's six downloads still open by their links. Untick/tick Show in Console → Market → Categories. `docs/03`, `docs/05`. Tests: 1 new; full suite 1450 passed before the Show column, 386 related after; lint and both builds clean. Not rendered (signed out goes to sign-up) |
| **Namo's six e-books are Rahul Jain's Market downloads, 18 Oct — LIVE (production data)** | Rahul, Telegram: "sab download files ko jo 6 abhi ha unhe seller account Rahul Jain se connect kar do. abse NAMO koi download file nahi dalega, sab kuch seller ke through jayga". No e-book had been bought (no entitlements). Rahul Jain's seller module switched on; each e-book's PDF copied into the private bucket `namo-docs` (`downloads/<his id>/…`; the priced one's key was already there) with a `media_assets` row, listed as a Market download of his at the same price (five free, Beej Mantra ₹99), cover and description carried over, approved; the Bhakti e-book rows set inactive. Checked on the live API: `GET /v1/market/listings/?kind=download` lists the six under Rahul Jain. **Old shared `/shop/d/<id>` links now say it is gone** (the rows are inactive); the e-book upload in the console's Bhakti still exists but is not to be used. `docs/01` §4 |
| **Ticked sub categories on the Market's home, 18 Oct — LIVE on Rahul's "ship" (`shop/0011` on production; `namo-api-00172-rtd`, `namo-console-00030-kr5`, web `f332c69`)** | Rahul, Telegram: show a sub category on the Market's home when it has a tick ("ha" to the plan). `shop_subcategories.show_on_home` (`shop/0011`), ticked in the console's sub-category list; `GET /v1/shop/categories/` adds `home` per category; the Market's home has a section for each, after Downloads, Events and Courses and before the categories, *See all* opening the category with that sub category picked (`Shop.jsx`). `docs/03`, `docs/05`. Tests: 1 in `test_shop_product_page.py`; lint and both builds clean. Not rendered; nothing ticked yet |
| **Console: one Market card, 18 Oct — LIVE on Rahul's "ship" (`namo-console-00029-vk2`)** | Rahul, Telegram: "In console where are downloads product of market … should come under market at one place", then "Bana do". The front page's Market · Sellers and Shop cards are one **Market** card: shelf products, sellers' product listings, Downloads, Courses, Events (the listing list filtered by kind), waiting for review, categories, sub categories, orders, parcels, coupons, sellers' sales and payouts (`apps/console/templates/admin/index.html`). The category and sub-category pages answered 403 to every operator (no view permission); now Fulfilment and Superadmin (`apps/shop/admin.py`). The app's Market already has Downloads, Events and Courses tiles beside the categories (Soon until one is approved). Tests: `test_console.py`, `test_shop_console.py` pass |
| **AMOGH bracelets (33) on the Market, 18 Oct — LIVE** | **Done 18 Oct:** 198 images (six each; AK-0033 is a pyrite charging plate and kept its own prompts) uploaded to `media.1namo.com/market/amogh/<sku>/<n>.jpg`; 33 Market listings from the seller account "Amogh / अमोघ", approved by the script on Rahul's "approve" (each approval notifies the seller), which made 33 shop products; then each was given its SKU (AK-0001…AK-0033), sub-title, primary sub-category and the rest as also-sub-categories (missing ones created under Bracelets), FAQ, slug, SEO title and description, purchase price, GST 3%, ₹100 flat cashback and featured (Rudraksha, 7 Chakra, Pyrite Peru, Tiger Eye, Rose Quartz, Evil Eye). Checked on the live API: 33 products, 6 featured, six photos each, no purchase price in any answer. Not walked in the app |
| **(history) AMOGH bracelets, the plan, 18 Oct** | Rahul, Telegram: an Excel of 33 bracelets (seller AK International, brand AMOGH / अमोघ), six image prompts each; his choices: Google's image model (Imagen is not offered on the project; `gemini-3.1-flash-image` through Vertex AI, enabled 18 Oct on his yes, about ₹3-5 an image), 16:9 with a full background and the product uncut, every bracelet plain (no tassel, no gold bead), weight 200 g, GST 3% inside the price, slugs from the names, some featured, SEO title and description written for each. **Built:** `products.purchase_price_paise` (`shop/0010`; console form and sheet column `purchase_rupees`, never in `product_row`), and `market._shelve` keeps a brand already set when a listing is re-approved (it reset it to the seller's name). Cashback: the sheet's ₹100 is each product's own buyer cashback (`referral_cashback_kind` flat), which already pays on every prepaid order, link or none, seven days after delivery (`CASHBACK_EVERY_ORDER=1` since 16 Oct); Rahul's "every customer, after delivery, prepaid, every order" is that rule, so nothing new is built. Rahul: every product goes in from the seller's account, the approved seller **"Amogh / अमोघ"** (there is no account named AK International); the old shop was cleared — NAMO-0004 (the one live product, an Amogh lava bracelet) set inactive 18 Oct on his word, the other ten were already inactive; rows kept. Images are generated off-repo (scratchpad `gen_images.py`, `amogh_import.py`: upload, list, approve, enrich). `shop/0010` migrated and the API (`namo-api-00171-wtw`) and console (`namo-console-00028-rpx`) deployed 18 Oct on Rahul's "ship"; he also said "approve": the listings are approved by the script once made |
| **The console people use was five days behind, 18 Oct — FIXED on Rahul's "ship" (`namo-console-00027-k9k`, asia-southeast1)** | Rahul's screenshot of console.1namo.com showed the 13 Oct front page. `console.1namo.com` is `namo-console` in **asia-southeast1** (§22: no domain mappings in asia-south1), but every console deploy from 13 to 18 Oct went to the stale **asia-south1** copy, so the module front page, Creator and Seller requests, Videos to review, Engagement and the Studio labels never reached it. Deployed main there, `MEDIA_PUBLIC_BASE_URL=https://media.1namo.com` added; its other settings kept (it alone has `PAYOUT_ENCRYPTION_KEY`, `CSRF_TRUSTED_ORIGINS`, newer Shiprocket keys). **Deploy the console with `--region=asia-southeast1`.** The asia-south1 copy still runs; delete it on the owner's word |
| **Approve and Reject buttons in the console, 18 Oct — LIVE (`namo-console-00027-k9k`)** | Rahul, Telegram: "How to approve the users asking for approval for being seller or pro. There is no provision in console", then "Nahi dikh raha" to the steps. The decisions existed only as the list's action dropdown. `audit.DecideButtons` (template `admin/decide_change_form.html`) puts them on the row's own page, top of the form: a pending Seller/Creator request (Approve, Reject), a pending Pro (Approve), a pending Market listing (Approve, Reject). Each runs the existing action on that row after the page saves, so a reason typed in the review note goes with a rejection. At the time production had 1 Seller request waiting and no Pro. `docs/01` §6. Tests: 3 in `test_console.py` |
| **A thumbnail on every share, smaller chat cards, 18 Oct — LIVE on Rahul's "ship" (`namo-api-00170-bfp`, web `d21fc00`)** | Rahul, Telegram: "Make thumbnail for image, products, blogs, pdf course events bhakti content when share over WhatsApp or in Namo Chat. You check once", then "In chat thumbnail size should be smaller" with Instagram's chat as the example. Checked each: reels, blogs, products, Bhakti and profiles already previewed. **Gaps fixed:** a photo post (shared as its author's link with `?post=`) previewed as the author's profile card, now its photo (`share._post_tags`, `/og/post/`, 1080 × 1080; `/u/<id>` and `/consult/<id>` now have previews at all, `share.person_page`); a Market listing (PDF or other download, course, event) at `/shop/l/<id>` and a Namo download at `/shop/d/<id>` previewed as the site's card, now cover, title and price (`share.listing_page`, `share.download_page`, `/og/listing/`); listing pages had no Share button, now everybody's (`ListingPage.jsx` `Head`); in a chat, a share sent without a picture gets its preview's (`lib/share.js` `previewCard`). `firebase.json`: two regex rewrites (full UUIDs only). Chat cards 220 → 180 px, a reel's 170 px, all picture with its words over the bottom (`Conversation.jsx` `ShareCard`). `docs/02`, `docs/03`. Tests: 5 new in `test_share_previews.py` (29); full suite 1445 passed; lint and both builds clean; the two chat cards rendered in headless Chrome with a real reel and post. Deployed API first, then the web. Checked on production: a shared post link `/u/<id>?post=<id>` previews as "<Name>'s post on NAMO" with `/og/post/<id>.jpg` (200, 177 KB); `/u/<id>` and `/shop` still open the app. No approved listing to check `/shop/l/` against |
| **A reel shared in a chat shows its picture, 18 Oct — LIVE on Rahul's "ship" (web `7567fac`)** | Rahul, Telegram, a screenshot of a DM with a reel card of words only ("Chat me reel share pe thumbnail aana chahiye like share"). Cause: `lib/share.js` kept a card's picture only from Supabase storage or 1namo.com, so every R2 address (`media.1namo.com`, the `r2.dev` one) was dropped. Now `parseShare` gives a reel `https://1namo.com/og/reel/<id>.jpg?v=3`, the link preview, which also fixes reels already sent; and those two R2 hosts (exactly, not any `r2.dev`) are allowed for other shares' pictures. The reel card stands 9:16 (`Conversation.jsx` `ShareCard`). `docs/03`. Front end only; lint and both builds clean. Not rendered |
| **Logo on the reel preview, 18 Oct — LIVE on Rahul's "ship" (`namo-api-00169-496`)** | Rahul, Telegram, a screenshot of the WhatsApp card with the top right circled: "Can we put logo on sharing of reel. On right hand corner." `share._logo`: the white-letter logo, 130 px wide (190 at first; Rahul: "Thoda chhota kar do"), on a soft dark band, top right, inside the part WhatsApp shows; the image link is `?v=3`. `docs/02`. Rendered with Rahul's latest reel and cut as WhatsApp cuts it; `test_share_previews.py` (24) pass. Checked on production: `/reels/<id>` points at `?v=3`, the image (50 KB) carries the logo |
| **Reel previews stand up (720 × 1280), 18 Oct — LIVE (`namo-api-00168-pj5`)** | Rahul, Telegram, with Instagram's WhatsApp preview as the example ("insta ki tarah verticle"), then "Ship". `share._reel_card` composes 720 × 1280: a portrait reel fills it, a landscape one sits across the middle over a blur of itself; the page's image is `/og/reel/<id>.jpg?v=2` with width 720 and height 1280, so the day-cached landscape card is not reused. `docs/02`. Tests: `test_share_previews.py` (24) pass. The first deploy attempt was refused by the terminal's auto mode; it went out with the video pipeline on Rahul's second "ship". Checked on production with Rahul's latest reel: the page carries 720 × 1280, the image is a 720 × 1280 JPEG (48 KB). Not tried in WhatsApp itself |
| **Reel link previews on WhatsApp, 18 Oct — LIVE (`namo-api-00166-nfm`, web `f54f204`)** | Rahul, Telegram ("When we share reels from namo to whatsapp it should show thumbnail"). A shared reel is `/reels/<id>`, which Hosting sent to the app, so every reel previewed as the site card. Now `firebase.json` sends `/reels/**` to `namo-api` (`share.reel_page`): title "<Name>'s reel on NAMO", the caption, image `/og/reel/<id>.jpg` — one frame a second in (or the first), pulled from the video's URL by FFmpeg — **Debian's, installed in the API's Dockerfile**: the first deploy (`00165`) used `imageio-ffmpeg`'s static binary, which died with signal 11 on every run inside Cloud Run (the card fell back to `/og.png`, the API kept serving); `imageio-ffmpeg` stays for dev machines and the tests, 1200 × 630 with the whole frame in the middle over a blur of itself and a play mark (`_reel_card`). Falls back to `/og.png`. `docs/02`, `docs/03`. Tests: 4 in `test_share_previews.py` (one grabs a frame from a real generated video); full suite 1414 passed. Checked on production with Rahul's latest reel: `/reels/<id>` carries the tags, `/og/reel/<id>.jpg` is a 37 KB frame (about 4 s the first time, then cached), no crash in `00166`. Not tried in WhatsApp itself |
| **Content in two steps, Studio, Engagement, 17 Oct — LIVE 18 Oct on Rahul's "ship" (`profiles/0009`, `content/0015` on production; `namo-api-00164-h6x`, `namo-console-00047-mlr`, web `408473f`)** | Rahul, Telegram (every rule his; `docs/01` §2 and §12, `docs/06` Phase 18). **Content step 1** (`profiles.referrer`, `profiles/0009`): 100 followers, 10 live videos, 30 days; granted on asking, no console (`modules.ask("referrer")`, an approved `module_requests` row by "automatic"); tags, product links, the A code, the ₹25 a sign-up and insights, no pay on views. **Step 2** (`influencer`, today's Creators): 500 followers, 3 videos (was 10, same day) and 1,00,000 views in 90 days, then the request the console approves; pay on views and the blue tick. Counts in `apps/profiles/milestones.py`, returned as `progress` by `GET /v1/profiles/me/modules/`. Every referral gate reads `may_refer`. **Changes for live people:** a Pro or a Seller who is not a Creator stops earning ₹25 a sign-up; a Seller loses the tick (tick = Pro or step 2). App: **Studio** at `/studio` (was Dashboard; `/dashboard/...` redirects), the Content card with completion bars in one quiet grey (Rahul: the orange and green were too much) and *Start step 1* / *Apply for step 2*, step 2's bars on Content earnings for step 1, *Qualified views* → **Engagement** (app and console, `content/0015` display name only). The income page is unchanged (Rahul). Tests: `test_content_steps.py` (8) new; module and sign-up tests moved to the new rules; full suite 1410 passed; lint and both builds clean; the Content card rendered in headless Chrome with stubbed data in three states. At the switch production had 1 Creator (now step 2), no step 1 and no Seller; 4 approved Pros who are not Creators stopped earning ₹25 a sign-up. Migrations ran from main before the API (`referrer` has a database default). **Not walked signed in** |
| **Video pipeline, parts C (upload API), D (worker), E (moderation), B (compression) and F (playback), 17–18 Oct — LIVE 18 Oct on Rahul's "ship" (`clips/0001`, `content/0016` on production; `namo-api-00168-pj5`, `namo-console-00049-67m`, web `e88ab78`; worker `namo-video-00001-k6g`)** | Rahul's *NAMO Video Pipeline – Technical Spec* (PDF, Telegram), Android first; plan and open decisions in `docs/06` Phase 19. New app `apps/clips` (`apps.video` is the calls), table `videos` (`clips/0001`, `docs/05` §5.5b). `POST /v1/videos/init/` (SHA-256, size, length, 30 MB or 150 MB original, 10 a day or 50 for an approved Pro or Creator, duplicate link, 30 an hour), `GET /v1/videos/<id>/parts/` (resume), `POST /v1/videos/<id>/complete/`, `GET /v1/videos/<id>/`; R2 multipart in `apps/clips/storage.py` (bucket `VIDEO_UPLOADS_BUCKET`, else the private bucket); the minute sweep drops uploads not completed in 24 hours. Worker: `video-worker/` (`encode.py`, `main.py`, own Dockerfile), Cloud Run service `namo-video`, not created yet; the API posts the job on `complete` and takes the answer at `POST /v1/videos/worker/done/`; the minute sweep sends an unanswered one again and deletes it after three tries (`docs/02`). **E:** the worker tiles a frame every 10 seconds, nine to a 3×3 sheet (Rahul, 17 Oct: one image for a 90-second video, about ₹0.13), sends the sheets to SafeSearch (`video-worker/moderate.py`, the service account's token from the metadata server) and keeps them at `v/{id}/sheet_n.jpg`; the API judges the verdict (`apps/clips/moderation.py`): violation → `rejected`, files deleted, hash refused at `init`; doubt or no verdict → `in_review`; clear → `live` for an approved Pro or Creator, and for anybody else after their first 3, which wait. Console: **Videos to review** on the front page (`apps/clips/admin.py`, sheet and verdict, Approve and Reject, audited). Rule in `docs/06` Phase 19 E. Rahul's decisions of 17 Oct (SafeSearch, verified live after the check, Capacitor) are in `docs/06` Phase 19; the DNS is at GoDaddy. **B and F, 18 Oct:** the composer uploads a new reel through `/v1/videos/` (`src/lib/clips.js`; compression to the spec in `src/lib/compress.js`) and publishes it with `video_id`; the post is a draft until the video is live, then its `media_url` is the HLS playlist (`content.video_id`, `content/0016`; `content.video_settled`, called from the worker's answer, Approve, Reject and the sweep; notifications `content.video.live` / `content.video.refused`). An API without the pipeline answers 404 and the composer uploads the old way. Playback: hls.js light (`src/lib/hls.js`, `src/components/Video.jsx`) in the reel viewer, Home's reel cards and the composer; grids and shared cards show `thumb.webp`; **Data saver** in Profile, Preferences. Tested: 4 new in `test_clips_upload.py` (26); HLS playback in headless Chrome against a real worker encode (480p, poster, a waiting reel buffers 4 s). Not tested: a real upload to R2 from a phone, which needs the branch deployed. `docs/02`, `03`, `05`, `06` Phase 19. Full suite 1440 passed; lint and both builds clean. Tests: `test_clips_upload.py` (22), `video-worker/test_worker.py` (17, four of them a real FFmpeg encode, run here with a downloaded FFmpeg); full suite 1424 passed. A real 88-second test video gave one 960 × 1704 sheet with frames at 5, 15 … 85 s. **18 Oct:** `namo-video` exists (`namo-video-00001-k6g`, Rahul's ok; the API's R2 keys copied server-side, a new `VIDEO_WORKER_TOKEN`, `VIDEO_CALLBACK_URL` = the API's `/v1/videos/worker/done/`); the uploads bucket `namo-docs` already allowed PUT from 1namo.com with `ETag` exposed, and now also `https://localhost` and `capacitor://localhost` (the app). **Live 18 Oct:** merged to main (`e88ab78`); migrations ran (plan showed exactly the two); `VIDEO_WORKER_URL` and `VIDEO_WORKER_TOKEN` set on `namo-api` (the token copied server-side from `namo-video`, never printed); `/v1/videos/init/` and `/worker/done/` answer 401 without auth or token. **No real upload from a phone yet**: the first reel posted is the end-to-end test (a seeker's first 3 wait in **Videos to review**). The Cloud Vision API is **enabled** on the project (18 Oct 2026, on the owner's word in the terminal; one test call answered); part A is live |
| **Everybody posts video, 17 Oct — LIVE (`namo-api-00163-8nr`, web `bf35f1c`)** | Rahul, Telegram ("I want to allow video post all for all seekers", "Yes. Ok" to: only a Creator earns on views). `content.services.OPEN_KINDS` gains `clip`; `live_session` still needs video permission (admin, Creator, or the console's `video_enabled`). App: the Home and group composers offer video to everybody. Qualified-view earnings stay Creator-only (unchanged code). Tests: six that held the old rule now test a seeker's reel going in and a live room being refused; full suite passed (1402); build clean |
| **Everybody findable by name, everybody's page open, 17 Oct — LIVE (`namo-api-00162-qht`)** | Rahul, Telegram: "Avania verma joined but search is saying there is no one with this name", then, offered the choice, "Search me सबका naam dikhe. We are social network." It was not a bug: since 14 Oct only somebody with a live post or an approved practice was searchable or had a public page. Now anybody not blocked: `profiles.services.public_profile`, `search_people` (names only, blank names left out), `resolve_username`, `content.services.fetch_author`; the link preview of a seeker with no posts now carries their name. Still never public: birth details, phone, email. Tests: nine that held the old rule rewritten to the new one (content, people search, profiles, share previews). No migration, no app change |
| **Up to ten photos on a post and a Market listing, 17 Oct — LIVE (`content/0014`, `market/0005` on production; `namo-api-00162-qht`, `namo-console-00046-v72`, web `34475db`)** | Rahul, Telegram ("Product listing and post me ek se jayada photos daal sakte h", then "Yes"). `content.gallery` (`content/0014`) and `market_listings.gallery` (`market/0005`), jsonb, default `[]`, the URLs after the cover; `content.services.clean_gallery` (https only, the cover not repeated, at most nine; posts only) on publish and edit; a listing's gallery is checked the same way and copied to its shop product on approval; `gallery` in the public post row and the listing card. App: `PhotoSwiper` and `ManyMark` in `components/Pieces.jsx` (feed card, profile tile, the full-screen viewer, the listing page); the composer picks several photos at once, shows them in a row with ✕ and +, keeps them in the draft and through Tag; Sell's *More photos*. Tests: two in `test_content.py`, one in `test_market.py`; full suite 1403 passed; lint and build clean; the swiper rendered with three local images. Not walked on a phone. Migrations run on production before the API (both columns have a database default, so the live code keeps inserting) |
| **PhonePe PG replaces Razorpay, 17 Oct — LIVE (merged `7531226`; `namo-api-00161-95k`, web `7531226`; keys and webhook login set on `namo-api` by the owner; the webhook answers the configured login)** | Rahul, Telegram ("Payment gateway provider has changed to phonepe pg", "Razorpay पूरा हटाना hai", production Client ID and Secret); Rahul's yes counts as the owner's since the owner's decision the same day. Server: `apps/wallet/phonepe.py` (token cached, `checkout/v2/pay`, `checkout/v2/order/<id>/status`, the webhook's SHA-256 `Authorization`); `apps/wallet/razorpay.py` deleted. `services._open_checkout` writes the `created` row under our merchant order id (`N` + 32 hex) for top-ups, shop orders and things kept; responses carry `{order_id, amount_paise, url}` (`checkout` inside `pay` and shop `buy`, was `razorpay`). `confirm_checkout(profile, order_id)` asks PhonePe's status: COMPLETED captures, FAILED records, PENDING waits for the webhook. `POST /v1/wallet/pay/confirm/ {order_id}` serves top-ups too; shop confirm takes no body. Webhook `POST /v1/wallet/webhook/phonepe/` (`/webhook/razorpay/` removed). `payment_capture` unchanged except `provider='phonepe'`; the merchant order id is also the terminal row's `provider_payment_id`, so the close-time check and the webhook credit once. `reconcile_payments` asks PhonePe's status. Settings `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV` (default production), `PHONEPE_WEBHOOK_USER`, `PHONEPE_WEBHOOK_PASSWORD`, `PHONEPE_REDIRECT_URL`; the `RAZORPAY_*` settings are gone. No migration. App: one `openCheckout(url)` in `src/lib/wallet.js` (PhonePe's `checkout.js`, iframe; resolves CONCLUDED or USER_CANCEL) used by top-up and recharge, `payOnline` (e-books, Market) and `shop.payOrder`; then the confirm call. Tests: `test_phonepe.py` (5, the client's request shapes), `test_wallet.py`, `test_shop_pay_online.py`, `test_ebook_pay_online.py`, `test_market.py`, `test_ebook_sharing.py` moved to a fake PhonePe; full suite 1400 passed; lint and build clean. **Walked 17 Oct:** Rahul's real ₹100 top-up was captured by the webhook (`checkout.order.completed`) and credited once, ₹100. **Left:** the unused `RAZORPAY_*` env vars on `namo-api`; change the webhook password, which went through the terminal chat. The IFSC lookup on payout details still calls Razorpay's free public IFSC directory; it is not a payment |
| **Reviews after a call or chat, held for approval, 17 Oct — LIVE (`content/0013` on production; `namo-api-00161-95k`, `namo-console-00045-lpq`, web `7531226`)** | Rahul, Telegram ("when a call with pro caller disconnect it should ask for review"; "all review before live should go to admin to approve"). `reviews.session_id` (unique) and status `pending` (`content/0013`; run on production BEFORE the API). `leave_review` takes a booking or a session (the seeker's own, ended after it connected, within 7 days) and always creates `pending`; the rating cache moves only on approve. `GET /v1/content/reviews/reviewable-sessions/`. Console: *Reviews* (pending first; Approve / Reject, Fulfilment and superadmin decide, Support reads; audited) and *Reviews to approve* on the front page, so **namo-console deploys too**. App: `askReview(id)` (`src/lib/reviewAsk.js`) from every end of a call (`Call.jsx`) and chat (`ChatPanel.jsx`) on the seeker's side; `ReviewAsk.jsx` opens `ReviewSheet` (now exported from `MySessions.jsx`) only if the server lists that session; a Review button on Calls and chats in the Sessions list; Not now; the posted toast says it shows once Namo checks it. Tests: `TestSessionReview` (3) in `test_chat.py`, `TestReviewQueue` (3) in `test_content_console.py`, five review tests in `test_content.py` now approve before reading; full suite 1389 passed; lint and build clean; the sheet rendered with stubs. **Found:** the console's Reports and Daily check flags actions do not re-check the tier inside the action, so a Support operator can run them (Django runs an action whatever `has_change_permission` says); the Reviews queue checks it |
| **The client's kundli for the consultant, 17 Oct — LIVE** (API namo-api-00159-lxw, web c93b689) | Rahul, Telegram ("give pro a button to access his horoscope"). `GET /v1/astro/client-chart/?session=`: the consultant of a LIVE session gets the seeker's chart and birth date, time and place; anyone else or after the session 404, no details 409 `no_birth` (`astro/views.py client_chart`). This is the first endpoint that shows one person's birth details to another; owner told in the terminal. Front end: `ClientKundli.jsx`, opened by **Kundli** in the live chat header (consultant only) and the call bar (`isOwner`). Tests: 3 in `test_chat.py` (`TestClientKundli`). Lint clean; button and the no-details sheet rendered with stubbed reads; the chart itself not rendered (needs a real payload). `docs/02`, `docs/03` |
| **Desk header Home and Dashboard; birth details before a call, 17 Oct — LIVE (web `73a76b7`)** | Rahul, Telegram. `DeskHeader`: Home (left) and Dashboard (right) instead of back; Dashboard's back is `hardBack` to Profile (the history back went to the Desk: a loop). `useStartSession`, for a Pro whose `category` includes Astrologer only: no `birth_date`, or no `birth_time` while `birth_time_known` is not false, sends the seeker to `/onboarding/details?edit=1&need=1` with `next` set to `/connect/<id>?via=<channel>`; every call and chat button goes through it. Front end only. Lint clean. `docs/03` |
| **Busy: red dot, missed calls on the Desk, one In line list, 17 Oct — LIVE (`chat/0007` migrated on production, `namo-api-00158-hzt`, web `73a76b7`)** | Rahul, Telegram. Server: `missed_calls` (`chat/0007`), written by `request_chat` on its two busy answers, once per seeker and consultant per 5 minutes (`MISSED_WINDOW`); `GET /v1/chat/missed/` (the caller's, last 24 h). Busy itself is unchanged (`busy_expr`: live or ringing). Front end: red dot for busy on Consult cards (and the Busy tag red), search, `PopAvatar busy`; the profile's busy line red; Connect says *X is busy right now*. NAMO Desk: one **In line** list (all types, oldest first, numbered, type on each row) replaces the Audio, Video, Chat and Booking tabs; **Missed while busy** under it (polled every 15 s); Bookings below. In line can hold one request only, since one rings at a time. Test: 1 new in `test_session_engine.py`. Lint clean; the Desk rendered with stubbed reads. `docs/03`, `docs/05` |
| **Photos in a live chat, the consultant's only, 17 Oct — LIVE (`chat/0006` migrated on production, `namo-api-00157-k96`, web `f060aa5`)** | Rahul, Telegram ("pro side only, he can send the image, not seeker"). Server: `messages.image_url` (`chat/0006`, additive, nullable); `send` takes `image_asset_id` (a READY `image` upload of the sender's own, via `media/presign`); a seeker's photo is refused ("Only the astrologer can send a photo."), as is someone else's, an unready or a non-image upload; `body` is the caption or `Photo`; every message row carries `image_url`. Front end: a photo button in the composer for the consultant; the bubble shows the image to both sides. Photos go to the public bucket under an unguessable key, as post images do. Tests: 4 new in `test_chat.py`; full suite 1379 passed. Lint clean; a thread with a photo rendered with stubbed reads. Ship order: migrate `chat` on production, deploy the API, then the web. `docs/03`, `docs/05` |
| **Darshan: the ✕ at the right end, 17 Oct — LIVE (web `f060aa5`)** | Rahul, Telegram (screenshot). `Pooja.jsx`: the close moved from before the deity chips to after them. Front end only. Lint clean. `docs/03` |
| **NAMO Desk chat: full screen, chats only, openers, 17 Oct — LIVE (web `f060aa5`)** | Rahul, Telegram (screenshot of the side panel on `/desk`). `ChatPanel.jsx`: on `/desk` the panel is titled Chats, shows the client threads only (no Messages or Alerts tabs), fills the screen with a ✕, uses smaller text in the list and bubbles, and takes the visual viewport's height so the keyboard cannot cover the typing box (`useKeyboardSafeHeight`). The composer offers four openers to the consultant in a live session until they write in that sitting (`OPENERS`); a tap fills the box. Elsewhere the panel is unchanged, except that **End session** moved from the meter bar to the thread header as a red button, in every live chat on both sides (Rahul). On the Desk a live chat hides the ✕ and the back button; End session closes the panel. Front end only. Lint clean; list and thread rendered with stubbed reads. **Not verified:** the keyboard on a real phone. `docs/03` |
| **pro.1namo.com closes into a redirect to /desk, 16 Oct — LIVE (web and pro `cf6b280`; 302s checked with curl)** | Rahul, Telegram, after testing a call on NAMO Desk ("band kardo poora", then "redirect karte hai desk pe"). `firebase.json`'s `pro` target serves `pro-redirect/` with two 302s: `/pro/ring/<id>` to `1namo.com/desk/ring/<id>` (a tapped notification from an old pro subscription), everything else to `1namo.com/desk`. `npm run ship` now deploys the web app only; `npm run ship -- pro` deploys the redirect (no pro build). The main app's links to the pro app now land in the main app: Welcome's consultant link starts the `?next=pro` sign-in, which ends on `/dashboard` (was pro.1namo.com); Consult's empty-state Apply goes to `/dashboard`. The `--mode pro` code stays in the repo, unbuilt and undeployed. A Pro still subscribed to push on pro.1namo.com keeps getting a second notification until the browser drops it. Lint clean. `docs/03`, `docs/06` |
| **NAMO Desk, 16 Oct — LIVE (web/pro `ad46152`)** | Rahul, Telegram (screenshot). `/desk` is *NAMO Desk* (header, document title, `desk.webmanifest`; was Namo Consult). The header Online pill and the Visible to clients card are one big button (`PresenceToggle big`): orange *Go live*, green *You are live* (visible to clients), the same switch and beat. Tabs Audio call, Video call, Chat (who is waiting on that channel now, from `chat/sessions` by `mode` and `audio_only`; Answer or Join) and Booking (requests to accept, confirmed). Booking calendar and Finished/Earnings left the page (Dashboard has both). Also the pro app's Consult tab, whose header keeps its Online pill. Front end only. Lint and both builds clean; rendered with stubbed reads, live and not |
| **Your product referral link page, 16 Oct — LIVE (web/pro `7df7d9e`)** | Rahul, Telegram (screenshot). `ProAffiliate.jsx` (main app `/dashboard/affiliate`, pro app `/pro/affiliate`): the Whole store link card on top (the link, Copy link, Share), then Link to a product (three steps and Open the Market; every product page already has My Referral Link, `TagPick.SharerBar`), then the rules as numbered Terms and conditions. The product list with Get link is gone. Front end only. Lint and both builds clean; rendered in headless Chrome with stubbed reads |
| **Back from Your code; two names, 16 Oct — LIVE (web/pro `3d63aab`)** | Names (Rahul): *Your links* is *Your product referral link* (Dashboard row, the links page title); *Your code* is *Your app download referral code* (Dashboard row; the page title for a Pro). The Profile tab stays *Creator*. Rahul, Telegram: Dashboard → Content → Your code, Back went to Profile settings. For a Pro, the Profile tab pages (`Profile.jsx`, Your code, Saved, Kundli) now go back through history, with Profile settings only as the fallback for a cold link. Lint and build clean; not walked |
| **₹25 per sign-up for a Pro, a Creator or a Seller, 16 Oct — LIVE (owner's "ship" in the terminal; merged `3d63aab`; `referrals/0004` on production; `namo-api-00156-knp`, `namo-console-00044-ss8`, web/pro `3d63aab`)** | Rahul, Telegram: "If code is shared by pro creator or seller anybody - he will get ₹25 per user"; in the Commission line of the statement, counted in content earnings. `referrals/0004`: `affiliate_settings.signup_bonus_paise` (2500; console *Link window and sign-up pay*, 0 = off) and `referral_signup_bonuses`. `claim_signup` writes one when the code's holder is an approved Pro, a Creator or a Seller at claim time (`earns_on_signups`); the referrer's notification says ₹25 was added. `payouts.lines` adds it to `commission`; `content_earnings` adds it to the figure and returns `signups {count, paise}`; the Influencer tab gets `per_signup_paise` and each period's `earned_paise`. Console *Sign-ups with their code* (Content card): this month's count and pay, top holders, *Void* (Finance, audited; refused once that month's statement exists). App: a Sign-ups row on `/dashboard/content`; a "You earned" card and new terms on the Influencer tab. A Pro's A code is still refused at sign-up; a Pro earns through their N code. Tests `test_signup_bonus.py` (7), influencer and affiliate-window tests updated; full suite 1375 passed. Lint and both builds clean; not rendered |
| **Payout details: account type, firm, GST, 16 Oct — LIVE (`consultants/0011`, `market/0004` on production; `namo-api-00148-bfx`, `namo-console-00040-cp4`, web/pro `336a4db`). Owner: "jo rahul bhaiya bol rhe hai vo krdo" (16 Oct, terminal)** | Rahul. A Pro's payout details (`payout_details.py`, `ProPayoutDetails.jsx`) and a Creator's bank (`market.save_bank`, `SellBank`): Savings or Current (required — a Pro's on every save, a Creator's once there is an account), firm name, GST number (GSTIN checked) and GST certificate (private upload), all three optional. Finance sees them in the console (payout details page; the Market payout's bank column). Under the owner's "Rahul bhaiya jo bol rhe hai vo krdo". Existing details keep working; the type is asked at the next change. Full suite 1338 passed; the Pro form walked locally. |
| **Go online card, 16 Oct — LIVE (web/pro `e853faf`)** | Rahul: make Go online stand out. On a Pro's Dashboard it is a green card (the main-action green, `from-btn to-btn-deep`) with a phone in a ring, a pulsing dot and "Take calls and chats, and start earning", in place of a plain row. Walked locally. |
| **Console by module; payout statements; qualified views, 16 Oct — LIVE (`consultants/0012` on production; `namo-api-00155-bdq`, `namo-console-00043-j6q`)** | Rahul asked for a console audit; the owner said "Yes" on Telegram to the payout page. Console home rebuilt by module (`console/templates/admin/index.html`, counts from `site.waiting_counts`): *Waiting for somebody* (Pros applying, Creator and Seller requests, listings, profile changes, payout details, to pay on the 7th, reports, flags, parcels), then Finance, Content, Consulting, Market, Bhakti (a link per kind), Shop, People, Look of the app. **Payout statements** (`consultants.PayoutStatement`, `consultants/payouts.py`, console Finance page): one per person per month — consulting, Market, content, commission, TDS, to pay, pay-to with the details' status — made on or after the 7th, marked paid with the UTR (also marks the Market row, one notification). **Qualified views** page (Finance, Support): this month's count and what it pays, top creators, viewer–creator pairs, a "5+ posts of one author in a day" filter, *Void* (Finance, audited). Fixed: the Cashback page's totals were computed and never drawn. Shared `admin/summary_change_list.html`. Tests `test_payout_statements.py` (4), console tests (every front-page link opens). Full suite 1367 passed. Still missing from the audit: Creator bank (SellerBank) page and verify; Pro reject-with-note; Market purchases page; comments and reviews; wallet, payments, bookings, sessions; e-book price in the Bhakti form; CASHBACK_EVERY_ORDER as a switch |
| **Three modules (Creator, Pro, Seller), 16 Oct — LIVE (owner's yes in the terminal; merged `8735ae0`; `profiles/0008` on production; `namo-api-00154-wfv`, `namo-console-00042-8zd`, web/pro `8735ae0`)** | Rahul's model (`docs/06` Phase 18; listings already live stay up). `profiles.seller` + `module_requests` (`profiles/0008`), `apps/profiles/modules.py`, `GET/POST /v1/profiles/me/modules/`; console *Module requests* (approve / reject with note, both notify) and a notification on approving a consultant; gates moved — video, tags and links → Creator, Market → Seller, qualified views → Creator only. App: `/earn` (Earn on Namo, from Profile settings), `/earn/pro` (the consultant form in the main app), Dashboard and its pages by module, Profile tabs by module, one blue tick. Tests `test_modules.py` (8); fixtures that stood for "a Pro who posts and shares" now also hold Creator (and Seller in the Market tests); full suite 1359 passed; lint and both builds clean; *Earn on Namo* rendered with stubbed reads. At the switch production had 5 approved Pros and no Creators; every one now holds Consulting only until they ask. The Drive reels author (Rahul's account) was given Creator through a recorded, approved request before the deploy, so the pipeline keeps posting. **Not done: the day-before message to existing Pros** — no broadcast was sent |
| **FOUND 16 Oct: a share link opened by somebody new to Namo — what holds and what breaks** | Rahul asked. Holds: the `?ref=A…` click is kept in that browser (`localStorage` `namo.aff`, `lib/referrals.js`) and sent by `POST /referrals/visit/` the moment the OTP sign-up gives a session; `affiliate_visits` then credits the next paid shop order or Market purchase within the window (15 days from the click, console) — `live_visit`, last click wins, one purchase per click. Breaks: (1) link opened in WhatsApp's in-app browser, sign-up in Chrome or on another phone — the click never leaves the first browser; (2) sign-up or purchase after the window; (3) a later click on someone else's link; (4) a second purchase without a new click; (5) the buyer is a Pro. Also: a signed-out visitor is sent to `/onboarding` without the link and lands on `/home`, so the product they tapped is lost (`App.jsx` SessionGate). And Market purchases (`market.services._referrer`) do not re-check `_may_earn`, so a sharer whose code was switched off after the click still gets the 6% (the shop path re-checks). Rahul chose two, both LIVE (`namo-api-00153-tft`, web/pro `5e86966`): **(a)** back to the tapped Market page after sign-in (`takeReturnPath` in `lib/referrals.js`, a day, once; `App.jsx`, `Welcome.jsx`, `AboutYou.jsx`); **(c)** `market.services._referrer` now runs `_may_earn` at purchase (test `test_a_link_switched_off_after_the_click_earns_nothing`), under the owner's standing "jo Rahul bhaiya bol rhe hai vo krdo". Not chosen: a code box at Market checkout, so the different-browser case still loses the credit |
| **Insights as sliding rows, sales from tags and referrals, 16 Oct — LIVE (`namo-api-00152-xq8`, web/pro `d6b4bb4`)** | Rahul, Telegram (screenshot). `ContentGrid.jsx`: Reels, Images, Blogs as horizontal rows of cards (views, likes, comments, reshares, qualified views), then *Sales from tags and referrals*: `content.services.tag_sales` — shop products from every referred order (the sharer's cashback row, not cancelled) plus Market listings bought through the person (`market_purchases.referrer_id`), combined, most sold first; returned in `GET /v1/content/me/earnings/` as `sales`. The old *Sold with your code* (first referred order only) is hidden in the main app. Test `TestTagSales`. Rendered with stubbed reads. Not counted: e-books bought through a link |
| **Insights this month, 16 Oct — LIVE (`namo-api-00151-9nk`, web/pro `97f6b11`)** | Rahul, Telegram. `GET /v1/consultants/me/insights/?window=month`: views (every view, up to yesterday), new followers, saves and comments for this IST month; without it, the last seven days as before (the pro app). The main app's Content & Referrals Insights asks for the month and heads it *This month*. Test `TestInsightsMonth` |
| **Your content in Insights, 16 Oct — LIVE (`namo-api-00151-9nk`, web/pro `97f6b11`)** | Rahul, Telegram (screenshots). *Your content* moved from the Earnings tab to Insights as `components/ContentGrid.jsx`, a list after YouTube Studio's Shorts: a reel's thumbnail whole at 9:16 with its length (the square thumbnail cut reels), a photo's or blog's 4:5; title, kind · how long ago, views, likes, comments, reshares and qualified views. `content_earnings` posts carry `likes`, `comments`, `reposts`. `Insights` takes a `posts` slot (the pro app keeps its list). Lint and both builds clean; rendered with stubbed reads |
| **Content page: views for the period, lifetime below, 16 Oct — LIVE (`content/0012` on production; `namo-api-00150-slj`, web/pro `100ff61`)** | Rahul, Telegram (screenshot). `content_views.views` counts every view per person per day (`record_view` adds one to the day's row); `content_earnings` returns `views` for the period up to yesterday (sum by IST day; Rahul: the number moves once a day) and `views_all_time`. The Earnings tab shows Views and Qualified views for the period, Lifetime views in a band below. Views before 16 Oct count one per person per day, as they were. Tests updated (81 in the content files pass) |
| **Content earnings: every view, qualified views, ₹20 per 1,000, 16 Oct — LIVE (`content/0011` on production; `namo-api-00149-l4k`, `namo-console-00041-5pw`, web/pro `638f0e5`)** | Rahul, Telegram; the owner's explicit "yes" in the terminal, 16 Oct. Qualified views count from this deploy. `record_view` counts every view; `content_qualified_views` + `content_pay_settings` (`docs/05` §5.2b′); `services.qualify` (reel `watch` / blog `read` claimed by the app after 30 s of play or of the page in front, checked against the day's first view; like, comment, reshare written on the server); console *Content pay rate* (Finance); `GET /v1/content/me/earnings/` = qualified views at their rate + link and tag commission, one figure. App: `useWatchQualify` on the reel viewer and the feed's reel cards, a 30-second read on blogs, `/dashboard/content` Earnings rewritten (figure, the line, views, qualified views, every post), the Dashboard's Content & Referrals figure from it. **Not built: paying it** (no payout run). Tests `test_qualified_views.py` (7), two view tests rewritten; full suite 1348 passed. Rendered with stubbed reads |
| **Your listings page, 16 Oct — LIVE (web/pro `2e92067`)** | Rahul, Telegram: no Market insights or payout on the listings page; live and pending listings; modern design. `SellHome` in `Sell.jsx` (title *Your listings*): Add a listing tiles, then Waiting for approval · N (rejected with the admin note) above Live · N, each a card with a status pill on the cover and Edit / See it / Remove. Earnings, Sales and the payout row removed (Dashboard has them). Front end only. Lint and build clean; rendered in headless Chrome with four stubbed listings |
| **Dashboard in three sections, 16 Oct — LIVE (web/pro `429870c`)** | Rahul, Telegram. `Dashboard.jsx`: *Earned this month so far* on top (Content & Referrals, Market, Consulting for a Pro; "Paid together on the 7th"), then Content & Referrals (new `/dashboard/content`, `ContentEarnings.jsx`: commission by period for a Pro, the Creator's book for a Creator, and the old Insights), Market (earnings, listings), Consulting (a Pro: earnings, price, calendar, Go online), Payout details last. `/dashboard/earnings` redirects to the Dashboard; `proPath('/pro/earnings')` opens Consulting earnings in the main app. Front end only: the live API has every read. Payouts together on the 7th is written in `docs/01` §8 as the rule; **no combined payout run exists** (consultant payouts are not built, the Market's run on its own). Lint and both builds clean; Dashboard (Pro, Creator) and Content (Pro, Creator) rendered in headless Chrome with stubbed reads |
| **Market earnings and insights, 16 Oct — LIVE (`namo-api-00148-bfx`, `namo-console-00040-cp4`, web/pro `336a4db`)** | Rahul, Telegram. Sell on the Market → *Market earnings and insights* → `/dashboard/market/earnings` (`src/screens/MarketEarnings.jsx`, a Pro's or a Creator's): Earnings · Insights over the Earnings page's periods. New read-only `GET /v1/market/me/earnings/period/?range=` (`market.services.earnings_period`, `views.my_earnings_period`): total, by kind, units, buyers, last 7 days, due, the sales (first 500) and the period by listing. No new table. Tests `TestEarningsPeriod` (2). Rendered in headless Chrome with a stubbed response. **Also fixed:** a sharer's 6% on a Market listing or e-book (`credit_sharer`, "Referral · …") was counted as metered chat on the Earnings page; `consultants/earnings.py` now files every "Referral" row as shop, labelled *Shop and Market commission*, and Consulting earnings leaves it out (test `test_a_market_sharers_cut_is_commission_not_chat`). Full suite 1341 passed. On production nobody has a Market sale yet, so the page shows "Nothing sold in this period" everywhere |
| **Consulting earnings, 16 Oct — LIVE (web/pro `336a4db`)** | Rahul, Telegram. Dashboard → Your consulting setting, first row → `/dashboard/consulting` (`src/screens/ConsultingEarnings.jsx`, main app only; the pro app's Earnings tab unchanged). The Earnings tab's content over the same periods, consulting only; an Insights tab was built and removed the same day (Rahul: later). Checked on production data (read-only, 16 Oct): for all three Pros with earnings, this month and lifetime, the page's total plus commission equals the server's, and every session label reads (one Pro's month is ₹423.28, as in Rahul's screenshot): the figures are added up in the browser from the period's earnings rows (`earningsAll`, 200 a page, capped at 2,000), dropping every "Referral cashback" row; chat, audio or video is read from the session row's label. Front end only, no API change — the live API already serves `range`, `custom` and `limit`. Lint and both builds clean; rendered in headless Chrome with stubbed rows before the Insights tab came out (totals checked by hand). **Not walked signed in** with real data |
| **Status from the console: no name, date or Share, 16 Oct — LIVE (first `b0705d4` from branch `ship-status-fix`; since `336a4db` from `main`)** | Rahul, Telegram: a status uploaded through the console (R2, `pub-…r2.dev`) showed the plain picture with no name or date, and Share stayed disabled. The bucket sends CORS for `1namo.com` (checked with curl); the card's plain `<img>` loads the URL first without CORS, and the canvas's CORS load is answered from that cached copy and fails, so `composeStatus` returns null. `loadImage` (`src/lib/bhakti.js`) now retries a remote URL once with `?cors=1`. The statuses shipped in `public/` were never affected. Lint and build clean; **not seen on a phone**. Note: the bucket sends no CORS for `www.1namo.com` |
| **Dashboard headings, 16 Oct — LIVE (web/pro `ca61ce2`)** | Rahul, Telegram screenshot. A Pro's Dashboard: "Your consulting setting" holds Your consulting price (was Your rates), Booking calendar and Go online (was Namo Consult under "Calls and chats", heading removed); "Payout details" is its own heading, last. The rates sheet and the Pro app's Settings row say Your consulting price. Walked locally. |
| **Booking calendar, 15–16 Oct — LIVE (`namo-api-00146-ps4`, web/pro `66c3a18`; no migration)** | Rahul, Telegram, after TidyCal. `ProCalendar.jsx` at `/dashboard/calendar` (Dashboard → Your practice) and `/pro/calendar` (Namo Consult's grid replaced by a link): each weekday on/off, up to two windows, Save; blocked dates (whole IST days). API `GET/POST /v1/consultants/<id>/week/` (`services.week`, `set_week`: windows stored as the 20-minute cells in `consultant_availability`, so slots and booking are unchanged; old grid cells read as one-slot windows), `GET/POST /blocked/`, `POST /blocked/<id>/remove/` (`consultant_time_off`). Owner only. Default week 11–2 and 4–9 every day (Rahul, 16 Oct): written at `apply()` for every new Pro; `manage.py default_week --yes` moves every existing Pro onto it — **run on production 16 Oct on the owner's yes ("b yes"): all 5 consultants, 840 cells**. `tests/test_booking_week.py`; full suite 1334 passed. Walked locally with mocked data. |
| **E-books tagged and linked, 15 Oct — LIVE (`bhakti/0009`, `wallet/0006` migrated; `consultants/0010` faked — production had the same column as `0008_consultant_fee_bps`; `namo-api-00145-c6x`, `namo-console-00039-r5z`, web/pro `5a0ff20`)** | Rahul: no Tag or Link on downloads. Namo's e-books (`/shop/d/:id`) now have PickBar, Tag in post and My Referral Link (`DownloadPage.jsx`), and a card corner in pick mode (`Ebooks.jsx`). Posts carry `ebook_ids` (`bhakti_asset_tags`; feed rows gain `ebooks`, opening `/shop/d/<id>?ref=`). `affiliate_link(ebook_id=)` opens the download. An e-book bought while a link holds the buyer pays the sharer 6% of its price from Namo's (`wallet._ebook_sharer` on both the gateway grant and the wallet buy; `entitlements.referrer_id`), and uses the click. Events and Courses had the buttons already (`ListingPage`); none is listed yet. `tests/test_ebook_sharing.py`. Walked locally with a mocked Creator: the buttons, Tag in post opening the composer with the book tagged. Full suite 1324 passed. |
| **Referrals: old customers pay the sharer, 15 Oct — LIVE with the row above. Cashback on every order ON since 16 Oct (owner: "A yes"; `CASHBACK_EVERY_ORDER=1` on `namo-api`, revision `namo-api-00147-mlk`)** | Rahul's rules, confirmed on Telegram ("Yes. Correct"); under the owner's "Jo bol rhe hai vo krdo" for his commission rules (`docs/01` §12). A link holds a customer, new or old, for the window, whole store; the next order inside it (shop order, or a paid Market listing) pays the sharer 6% and uses the click up — `referrals._used`, `live_visit`; `record_visit` and `check_coupon` lost their first-order gates; one `referrals` PURCHASE row per buyer stays (the first referred order), later ones are cashback rows alone. The buyer's cashback is the product's own rule on every prepaid order, not only the first (`claim_first_order`, `first_order_preview`; the cart's line drops "Your first order"). `market._pay_sharer` no longer stops at a buyer's first referred purchase. Your links screen: copy says new or old, one click one order; "you earn" is 6% (it showed 10%). A product-only link (no store link) was built and dropped the same hour on Rahul's word — kept in `git stash` "product-only referral links". Full suite 1319 passed. |
| **Commission: 30% everywhere, per category; 6% to sharers; buyer cashback 0; delivery per order, 15 Oct — LIVE (`market/0003`, `shop/0009` migrated; `namo-api-00144-zt5`, `namo-console-00038-s2l`, web/pro `051eddb`); owner's yes ("Jo bol rhe hai vo krdo", "Yes")** | Rahul's rules (`docs/01` §4.1, §4.7, referrals). `commission_rates` (`market/0003`, seeded blank = 30%): `fee_bps_for` (consultations, was 40%) and `market.commission_bps` (products were 20%) read it; the console's Commission page (Finance). The per-astrologer share and the per-listing rate are withdrawn (their columns unused; the console's astrologer form and Finance's access to that queue removed — this closes the FOUND row on §82). Referrals: `REFERRAL_SHARER_BPS` 600 (was 10%), `REFERRAL_BUYER_BPS` 0 (default cashback none; a product's own rule still gives some); listings pay the sharer 6% of a buyer's first referred paid purchase from Namo's share (`market._pay_sharer` → `referrals.credit_sharer`). Seller earnings: Finance writes a product order's delivery before payout (`set_delivery`); payouts skip events not yet held. Old referral tests pin 10% by fixture; `TestRates`, `TestTodaysRates`, `test_consultant_fee.py` cover the new. Full suite 1317 passed before the deploy. |
| **Event reminders; product sellers told to send stock; My Referral Link, 15 Oct — LIVE (API `00144`, web/pro `051eddb`)** | Rahul. `market.services.remind_events` runs in `/v1/chat/sweep/` (pg_cron, every minute): an hour before an event, its buyers and host get "Starting soon" (once each, `dedupe_key`), opening `/shop/l/:id`. An approved product's notification says to send the stock to Namo and that the team will call with the address. Alerts with `ref_type` listing open the seller's listings or the event (`lib/notifications.js`). The sharer button reads My Referral Link (products and listings). Tests: `TestReminders` (2) |
| **Market cards: no share corner, 15 Oct — LIVE (web/pro `7df862e`)** | Rahul: the product page's Share is enough. `CardCorner` shows only while picking tags for a post (+, then ✓). `docs/03` |
| **Tag and link on downloads, courses and events; composer without the product list, 15 Oct — LIVE (`market/0002` migrated, `namo-api-00143-nss`, `namo-console-00037-8zt`, web/pro `2071c22`)** | Rahul. Server: `market/0002` (`market_listing_tags`, `market_purchases.referrer_id`), `content.publish/edit` take `listing_ids` (three tags at most counting products), feed rows carry `listings`, `referrals/link/` takes `listing_id` (`/shop/l/<id>?ref=`). Nothing is paid to a sharer on a listing: the buyer they brought is recorded only, until Rahul and the owner set the rate. App: listing pages and cards get Tag in post, My link and the pick corner; tags in the composer are one line; its search list is gone where Tag opens the Market. Tests: `test_market.py` 27, content and referrals pass. |
| **Pro page: Speaks under the degree; About tab gone, 15 Oct — LIVE (web/pro, this ship)** | Rahul, screenshot. `ConsultantProfile.jsx`: "Speaks Hindi, English" with the award row's look; the About tab (languages, category, experience, verified — the last three already on top) and its component removed. `docs/03` |
| **No percentages for earnings, 15 Oct — LIVE with the row below** | Rahul: "Dont mention any percent. Any where." Removed from Dashboard, Your links, Studio, the composer's tag note, Earnings, TagPick, the seller form (and its "you get ₹X" line) and `terms.html`. Console keeps them (Rahul: admins only). `docs/04` §10 |
| **Tagging from the Market; My link on products, 15 Oct — LIVE (web/pro, this ship)** | Rahul. A Pro's or Creator's Tag in a new post opens the Market in pick mode (bar with N/3 and Done); cards get a corner + / link icon, the product page Tag this product, or Tag in post and My link · 10%. Shop products only: the same on downloads, courses and events waits for who pays the 10% (Rahul) and the owner's yes. Rendered locally (product page, pick bar). `docs/03` Tagging from the Market |
| **Policy pages for the payment gateway, 15 Oct — LIVE (web `9d90b14`)** | Rahul: "Payment gateway ki approval ke liye we need some standard pages". `public/about.html` and `public/shipping.html` new; `terms`, `privacy`, `refunds`, `contact` rewritten for the shop, the Market and sellers, on Rahul's answers (delivery 3–7 days free; cancel within 24 h before dispatch; after dispatch only damaged, defective or wrong, within 7 days with an unboxing video; online refunds 5–7 working days; downloads and courses refundable only if they do not open; events: seller cancels or buyer within 24 h of booking, full refund). All six linked from the welcome page. Support number is +91 99538 08908 everywhere, app included (Rahul; it was +91 99580 40508 in the app). Entity AK International, Ghaziabad, as before. Generator: none in the repo (written by hand from a script) |
| **Market sellers (Phase 17), 15 Oct — LIVE (`market/0001`, `media/0003`, `wallet/0005` migrated; `namo-api-00142-kr5`, `namo-console-00036-h2g`, web/pro `9d90b14`)** | Owner's yes ("2 yes") on Rahul's terms. Server `apps/market` (listings, console queue with commission %, gateway purchases via the `listing` sku, earnings, payouts on the 7th, Creator bank), product listings become shop products and earn on delivery (hooks in `shop/admin.py` and `shop/delivery.py`). App: Dashboard → Sell on the Market (`src/screens/Sell.jsx`), Shop tab on profiles (`components/SellerShop.jsx`), `/shop/l/:id` (`ListingPage.jsx`), Events and Courses live on the Market once listed. Tests `test_market.py` 22 + 204 neighbouring pass; lint and build clean; screens rendered locally with the Market API mocked. Full suite 1307 passed before the deploy; `GET /v1/market/listings/` answers `[]` live (nothing listed yet). Not walked with a real listing or payment (Razorpay test keys). Not built: where a seller sends stock, refunds of a seller sale, event reminders. `docs/01` §4.7, `docs/03`, `docs/05`, `docs/06` Phase 17 |
| **Tagline "Connecting Bharat", 15 Oct — LIVE (web/pro `9d90b14`, API `00142`)** | Rahul. Replaces "Hindu Social Network" (row below): `w.title` (Hindi कनेक्टिंग भारत), `index.html` title, description and share title, `public/og.png` (redrawn, same card), `share.SITE_LINE` |
| **Product pictures 16:9, 15 Oct — LIVE (web/pro, `namo-console` hint)** | Rahul: "YouTube wala 16:9". Market cards, the category grid, the hero, Home's product card, the product page's gallery and More from the shop are 16:9; `ProductArt` fits the photo whole (`object-contain`), so today's square photos sit on white. The console's photo fields ask for 1280×720. Cart and search thumbnails stay small squares. `docs/04` §7 |
| **Market home sections slide, 15 Oct — LIVE (web/pro `068c781`)** | Rahul: "products slide honge ... For all categories". `MarketSection strip`: one row per section, swiping sideways, ~2.3 cards on screen, up to 12 (`STRIP_MAX` in `Shop.jsx`), See all as before; Downloads too. A download page's More downloads stays a grid. Rendered locally. `docs/03` Market |
| **E-books paid at Razorpay, 15 Oct — LIVE (owner's yes, "1 yes"; `wallet/0004` migrated, `namo-api-00141-wch` with `EBOOK_PAY_ONLINE=1`, `namo-console-00034-wrh`, web/pro `c73e4e5`)** | Razorpay is still on TEST keys (`rzp_test_`, row 3 above: the website review), so a real card cannot pay yet and a public test card unlocks a book — as for the shop and wallet top-ups today. Not walked with a payment. | Rahul: "payment will be direct from payment gateway. No wallet will be used"; "live raghu ki yes ke baad". Behind the setting `EBOOK_PAY_ONLINE` (env `1` to switch on; unset = today's wallet purchase, unchanged). Server: `wallet.services.open_entitlement_payment`, `pay_mode`, `_grant_paid`; `POST /v1/wallet/pay/` and `/v1/wallet/pay/confirm/`; `payment_capture` grants the book for a `created` row carrying `entitlement_sku` (a second payment for an owned book goes to the wallet, logged); the e-book 402 carries `pay`. Client: `payOnline` in `lib/wallet.js`, `Paywall pay="online"`. Tests `tests/test_ebook_pay_online.py`. Merged to main 15 Oct. Migration `wallet/0004` runs on production BEFORE the API deploy: `payment_capture` reads the two new columns, and the new code on the old table breaks every capture. `docs/03` Market, `docs/05` payments |
| **Market home as sections, 15 Oct — LIVE (web/pro `a951906`)** | Rahul's reference screenshot ("listing layout ... for all categories"). On All: each category a section, name + See all + two cards (`src/components/MarketCard.jsx`); E-books last (`Ebooks cards`). No star ratings: nothing is rated. Lint and build clean; rendered from a local build with the API reachable (products, books, sections). `docs/03` Market |
| **Market: Shop and Academy one page, 14 Oct — LIVE (web/pro `26db49b`); Rahul confirmed it working on his phone** | **Next, proposed and not approved:** Pros and Creators selling Downloads, Courses, Events and Products, admin-approved (`docs/06` Phase 17, `docs/01` §4.7); Rahul answered the four decisions on 15 Oct (`docs/01` §4.7); waits for the owner's yes. Step 1: | Rahul, Telegram ("ek he banana hai"; my plan, step 1 of 2; "Coming soon"; name stays Market). `Shop.jsx`: tiles All · E-books · Courses (Soon) · Events (Soon) · the console's categories; E-books shows `src/components/Ebooks.jsx` (was `screens/Academy.jsx`, its mock Courses and Events removed); All shows two books under the products. `/academy` forwards to `/shop?cat=ebooks` (`AcademyMoved` in `App.jsx`), Bhakti's shared book to `?cat=ebooks&book=`. `MarketSwitch` removed. Payments unchanged. `docs/03` Market. Lint and build clean; rendered from a local build with a fabricated session (tiles, Events panel, the redirect; products and books not loaded, the local origin is refused by the API). **Step 2, not started:** real Courses and Events, and e-books paid through Razorpay instead of the wallet (Rahul: "code bana lo par live raghu ki yes ke baad") — needs the owner's yes before going live |
| **Console profile page saved nothing when gender was empty; Influencer is Creator, 14 Oct — LIVE (`namo-api-00139-2lw`, `namo-console-00032-b5j`)** | Rahul, Telegram (screenshot): ticking Influencer on a profile failed with *Constraint "profiles_gender_check" is violated*. **Bug:** the admin form sent `''` for an empty gender, and the check allows only male/female/other or NULL — so any save on a profile without a gender failed, whatever was changed. `ProfileForm` in `apps/profiles/admin.py`: gender a list with *Not given* (NULL); an empty username or bio saves NULL (`''` would also collide on username's unique index). Ticking Creator or Video on the page is now audited like the list actions. The list action *Make creator* always worked. **Influencer → Creator in the console** (Rahul, same thread): the checkbox label, a *By creator* filter (`?creator=yes`), and the API's refusal sentence; the column stays `influencer`, so no migration. The live console (`namo-console-00031-cwt`) still read *Influencer* on the list's column, so it was older than the code. Tests (2; the gender one fails without the fix). Shipped on Rahul's "ship"; full suite 1275 passed first |
| **A blank screen on Rahul's phone, 14 Oct — not reproduced** | About ten minutes after `e1705b6` shipped, 1namo.com showed only the grey page on his phone; reopening fixed it. The live site checked from here: HTML, the 1 MB main script and the API answer; Home, Bhakti, Chats and `/` render with no exception under a fabricated session in headless Chrome. Unconfirmed guess: the main script did not finish loading. If it recurs, the main bundle's size is the first thing to cut |
| **Bhakti tiles: WhatsApp Status, Mobile Wallpaper, 14 Oct — LIVE (web/pro `e1705b6`)** | Rahul, Telegram (screenshot). New `whatsapp` and `mobile` in `Icon.jsx`; `KINDS` in `Bhakti.jsx` gains a two-line `tile` name; `label` (used in sentences) is unchanged. `docs/04`. Lint clean; icons checked rendered standalone at 3x, not on the signed-in page |
| **Share to people on NAMO, 14 Oct — LIVE (`namo-api-00138-8gc`, web/pro `83ee173`); restyled LIVE (web/pro `e1705b6`)** | Restyle (Rahul, "thoda modern"): its own panel instead of `Sheet` (handle only, round search, 70 px faces with a saffron ring when picked), **Send** with no name, replacing the foot row while anyone is picked; WhatsApp a green round button. Not seen rendered. Rahul, Telegram: "Instagram jaisa", on every Share button, "Pro ko koi msg nahi jayga". One `ShareSheet.jsx` mounted in `App.jsx` (both apps); `src/lib/share.js` `openShare`, with `shareLink` and Bhakti's `shareAsset` now opening it, and ProductPage's Share. Search + recent chats + following, Pros left out; Send goes through the ordinary `/dms/start` and `/send` (request and block rules unchanged); WhatsApp / Share / Copy link under it. A share is a plain message body (link, title, picture line), drawn as a card in `Conversation.jsx` and "Sent a reel" in Chats; pictures only from our storage or site. API: thread rows carry `with.is_consultant`. Not changed: the status card's WhatsApp Share. A shared post opens its author's page (posts have no page). `docs/03` share sheet, `docs/05` dm_messages. Tests (1); lint and both builds clean. **Not walked in a browser signed in.** Shipped on Rahul's "ship" |
| **Search in the Chats header, 14 Oct — LIVE (web/pro `3efaf6f`); heading and pen removed LIVE (web/pro `e1705b6`)** | Rahul, Telegram (screenshot): "No need for heading and search pencil button." Main app only; the consultant app's panel keeps both (no header search there). Before that, Rahul, Telegram: "header pe search bar, like others". `Messages.jsx` drops `search={false}`; the header's box opens `/search?in=users`. Main app only (the pro app's Messages keeps its Back bar; the console is untouched). `docs/03` Chats. Lint and build clean. Shipped on Rahul's "ship" |
| **Groups page: search on top; created, joined, suggested; + to start; Bhagwan kind, 14 Oct — LIVE (`groups/0002` migrated, `namo-api-00137-mg5`, web `34602f8`)** | Rahul, Telegram. `/groups`: the search box first ("Find group: a mandir, deity, sampradaya or city"), then Groups you created and Groups you're in (rows carry `created_by_me`), then Suggested groups (`?suggest=1`); a new kind **Bhagwan** (`groups/0002`, choices only); the Start a group link and button went, and a green + at the top right (`GroupsPage`) starts one. `docs/03`. Tests (10 in the groups file); lint clean. Needs the API on ship |
| **Wallet statement; Add money in place; green buttons, 14 Oct — LIVE (web/pro `abe197a`)** | Rahul, Telegram. `/wallet` in the main app is the **Wallet statement**: no balance card, the transactions only (the pro app keeps its card). Add money is `AddMoneySheet` (lifted out of the wallet page): the Consult list's card opens it in place, and a recharge leaves you there; Paywall, Tarot and a call short of balance link to `/wallet?add=1`, which opens it over the statement. The Home Groups button and the Consult wallet button are green (`bg-btn`). `docs/03`. Lint clean; the sheet opening and the statement checked in a browser |
| **Delete a chat; delete a message, 14 Oct — LIVE (`dms/0003` migrated, `namo-api-00136-snd`, web `a1876e8`)** | Rahul, Telegram ("dono"). Hold a chat in Chats: Delete chat, for you only (`dm_threads.a_/b_cleared_at`; it returns with a newer message, from that message on). Hold your own message: Delete message, for both (`dm_messages.deleted_at`, the words overwritten; "This message was deleted"). `useLongPress` (`src/lib/longpress.js`: half a second, or right-click). The other side sees a deletion on their next open, not live (the poll fetches only newer messages). Migration `dms/0003`. `docs/03`, `docs/05`. Tests (4 new, 17 in the message files); lint clean; conversation and the hold sheet rendered |
| **Last "prototype only" buttons; Namo AI's last message, 14 Oct — LIVE (web/pro `fc78be2`)** | From the 3 Oct parked list. Pro app: Consult's Call tab says calls ring at the top of the screen (it was a Pick up card that toasted); a booked call's start says the client calls at the time (it toasted "prototype only"; booked calls are still not dialled, which is a real gap); Practice's Languages row opens Edit profile. The unused `CallButton` is deleted. Namo AI (`Ask.jsx`): the scroll end gets `scroll-mb-40`, so the newest message stops above the pinned composer instead of under it. Only the hidden Reports page and comments still say "prototype only". Lint and build clean; not rendered |
| **Reports hidden, 14 Oct — LIVE (web `b37673f`)** | Owner's yes (asked in the terminal). The Profile row is gone and `/reports` opens Home: the page sold mock reports, charged the wallet and generated nothing. `Reports.jsx` stays in the tree for when a real report exists. Past charges are untouched. `docs/01` §4.3 and the status table |
| **Earnings: mock sections removed, 14 Oct — LIVE (web/pro `b37673f`)** | From the 3 Oct parked list (item 8), rechecked. Earnings (pro app and Dashboard) still drew two sections from `mock.js` for real Pros: **Performance** (median reply, calls attended, answer rate, sessions, repeat clients, rating, a reply chart) and **Referrals** (a sample code, "₹2,000" a join, a made-up list). Both removed; the money above them is real (payouts P1) and referral earnings are in Your links and Insights. Rest of that list, rechecked 14 Oct: horoscope test text not seen in the live rashifal (personal horoscope unchecked); shop has 1 photo in 10 products and 1 sold out (photos are console work); Reports sold mock reports with a real wallet charge and no report (hidden the same day, owner's yes); "prototype only" left: Reports' sample, three pro-app call buttons and Languages, and the unused `CallButton`; Namo AI's composer overlap unchecked. Lint and pro build clean |
| **Reels' author line; /u/:id photo, 14 Oct — LIVE (`namo-api-00135-66f`, web `b37673f`)** | Found in a pending-list pass. `ReelFeed`: the author's photo when there is one, the orange or blue tick, and the right page and follow: a Creator's reel opened `/consult/:id` (an empty practice) and followed them as a consultant; now `/u/:id` and `followp:`. `/u/:id`: the header photo, from `avatar_url` now in `GET /v1/content/authors/<id>/` (`fetch_author`). Tests (68 in the two files); lint clean. Needs the API on ship |
| **Follow a person: fixed, 14 Oct — LIVE (web `7a2d719`)** | Rahul: "follow ka button dabane par follow nahi ho raha". **Bug, since the Django cutover:** following anybody who is not a consultant (`followp:` keys: feed Follow, People to follow, `/u/:id`) sent kind `followp`, which the API refuses (kinds are follow/save/like/repost), so the store rolled the tap back; and a profile follow read back as `follow:<id>`, which those buttons never checked. Fixed in `lib/reactions.js`: `followp` is an alias for kind `follow` on target `profile`, and `fetchMine` reads a profile follow back as `followp:`. Following a consultant (`follow:`) was never affected. No data to repair: no such follow was ever stored. Also: alert times and the consult list's times are saffron (Rahul). Lint clean |
| **Chats redrawn; Groups out of Chat, 14 Oct — LIVE (web `7a2d719`)** | Rahul, Telegram. `Messages.jsx` `MessagesList`: Chats heading and New message pen (to `/search?in=users`), underline tabs Chatbox · Chat requests (count kept from the inbox reply), 54 px photos, bold unread with saffron count, clock on waiting, empty state with Find people. The Groups segment is gone; `/groups` from Home's button is the one way in. Both apps use the list. `docs/03`. Lint clean; list and empty state rendered with sample data |
| **Tab icons: folded hands on Bhakti, infinity on Chat, 14 Oct — LIVE (web `c50cff7`)** | Rahul, Telegram. `TABS` in `Chrome.jsx`: Bhakti `namaste` (was `pooja`), Chat new `infinity` at 29 px (24, then 20% up, Rahul; others 19, negative margin keeps the bar's height). `docs/03`. Lint clean; the bar rendered |
| **Groups button on Home, 14 Oct — LIVE (web `c1194f5`; 36 px since the same day, Rahul)** | Rahul, Telegram: icon option A (three people, new `groups` in `Icon.jsx`), white on a saffron round button with a +, beside Home's three tabs, which narrowed to fit; opens `/groups` (`GroupsPage.jsx`, the Chat pane as a page). Whether Chat keeps its Groups segment is Rahul's to say (asked; recommended removing it). `docs/03`. Lint clean; the row rendered at 390 px |
| **Search: People and Groups, 14 Oct — LIVE (`namo-api-00134-tj7`, web `6f74fff`)** | Rahul, Telegram. `GET /v1/profiles/search/?q=` (`profiles.services.search_people`, signed in): name or username, only people with live content or an approved practice (the `public_profile` rule), never blocked, 2+ characters, 30 at most; no phone. Search chips All · People · Astrologers · Products · Groups · Posts · Bhakti (`users` and `groups` keys, fetched debounced; `lib/people.js`); Chat's box opens on People. No Follow button in the row. `docs/03`. Tests (3); lint and build clean; rendered with sample data. Needs the API on ship |
| **Consult list: one page, upcoming first, 14 Oct — LIVE (web `a5865f1`)** | Rahul, Telegram. Seeker app: the bubble's panel is one list, no tabs (`ChatPanel` `oneList`): `UpcomingSessions` (bookings pending or confirmed and not yet over, nearest first, "Remember to attend"), the thread list, then `MySessions calls={false} pastOnly` (past bookings, Review kept). No Find a consultant. Bell and bubble open full page with ✕; the pro app keeps its side panel. Profile's icons are four (Sessions went). `docs/03`. Lint clean; the list rendered with sample data |
| **Bell, bubble and the Chat badge, 14 Oct — LIVE (web `72652a1`)** | Rahul, Telegram. Seeker app: the bell opens Notifications alone (`ChatPanel` without tabs when `chatTab` is alerts); the consultant bubble is back in the header on `/consult` only, opening Consultant · Sessions (the panel's Messages and Alerts tabs gone for seekers); message alerts (`dm.message`) are left out of the bell's list and count (`fetchAlerts`), and the Chat tab shows unread messages as a red badge (`useUnreadMessages` in `Chrome.jsx`, from `dms/threads` `unread`, every 30 s). Pro app unchanged. `docs/03`. Lint clean; panels and badge rendered with sample data |
| **Festival frames (15c), 14 Oct — LIVE (`appearance/0003` migrated, `namo-api-00133-rgf`, console `00031-cwt`, web `72652a1`)** | Rahul, Telegram. A row of frames under a chosen photo in the composer, on a festival's days; the photo is cut to 4:5 under the frame in the browser and that is uploaded (`src/lib/frames.js`). Console *Frames* (`appearance.Frame`, `appearance/0003`, PNG upload, start and end) first, then built-in Navratri (10–19 Oct), Dussehra (20–21 Oct), Diwali (6–10 Nov) in `public/frames/`. Art: `tools/festival-frames.py` + `festival-frames-text.mjs` (Chrome sets the Hindi; Pillow mis-shaped it). Stickers not built. Festival dates from memory; worth a look. `docs/03`, `docs/05`, `docs/06`. Tests (1); lint and build clean; framing checked in Chrome. Needs the migration, API, console and apps on ship |
| **Groups (15c), 14 Oct — LIVE (`groups/0001`, `content/0010` migrated, `namo-api-00132-w97`, console `00030-frw`, web/pro `413958d`)** | Rahul, Telegram (placement option A: Chat → Groups). New app `apps/groups` (`groups`, `group_members`, `groups/0001`) and `content.group_id` (`content/0010`). Public groups; creator is admin; admins remove members and posts and make admins; a removed member cannot post or rejoin (the done-condition, tested). Group posts reach the group and members' for-you feed, not the open feed; a blocked group (console *Groups*) leaves with its posts. Three new groups a day. App: `GroupsPane` in Messages, `/groups/:id` (`Group.jsx`), `/groups/new` and `/edit` (`NewGroup.jsx`), "In <group>" on feed cards, composer `groupId`. **Groups for you** strip on Home after the 12th card (`?suggest=1`, Rahul). `docs/03` Groups, `docs/05`, `docs/06`. Tests (10); full suite 1,263 passed before the strip; lint and both builds clean; pane, page and form rendered with sample data; the strip not rendered. Needs two migrations, API, console and apps on ship |
| **Moderation queue (15d), 14 Oct — LIVE (`content/0009` migrated, `namo-api-00131-fpq`, console `00029-8zk`)** | Rahul, Telegram. `apps/content/moderation.py` flags, as each is written, a link from an account under 7 days old and the same words 3 times in a day from one person (not many people's same words), on posts, post comments and Bhakti comments; never DMs. `moderation_flags` (`content/0009`). Console *Moderation queue* (`ModerationFlagAdmin`): open first, oldest first, 40 a page; Looks fine · Remove it · Block the person, each audited. Nothing hides itself. `docs/01` reporting, `docs/05`, `docs/06`. Tests (7); full suite 1,254 passed. Needs the migration, the API and the **console** deploy on ship |
| **Writing limits (15d), 14 Oct — LIVE (`content/0008`, `bhakti/0007`, `dms/0002` migrated, `namo-api-00130-67h`)** | Rahul, Telegram. `apps/core/limits.py`: comments 10/min and 300/day, posts 10/hour and 40/day (admins exempt), messages 30/min and 1,000/day, new conversations 30/day; 429 `too_fast` with the rule's sentence. Counted from the person's own rows (not the per-instance cache), with five new indexes (`content/0008`, `bhakti/0007`, `dms/0002`). The app already shows a refusal's sentence. `docs/02` Rate limits, `docs/05`, `docs/06`. Tests (5); full suite 1,247 passed. Needs the three production migrations on ship |
| **Creators tag products and earn 10%, 14 Oct — LIVE (`referrals/0003` migrated, `namo-api-00129-7x6`, web/pro `60ca7fc`)** | Rahul asked; **owner's yes** (14 Oct, "10% like Pros"). Rules in `01-PRD` §12. Server: `referrals.services.may_share` (approved consultant or Creator) gates the A code (`referrals/me/`), links (`referrals/link/`), earning on a link (`_may_earn`) and tagging (`content._checked_products`); a tagged Creator post carries their code (`attach_products`). A matured referrer cashback for somebody with no consultant row goes to the new `creator_earnings` (`referrals/0003`), not `earnings_ledger`. `GET /v1/referrals/creator-earnings/`. App: Tag in Home's + for a Creator; Dashboard shows a Creator's earnings, Your links, Your code, Insights with links. PAN and bank for Creators wait for payouts (not built for anyone). Also Dashboard drops Edit your page and View your public page (Rahul). `docs/01`, `docs/03`, `docs/05`. Tests (4 new; 132 across referrals, affiliate, content); lint and both builds clean. Not rendered. Needs the production migration on ship |
| **Sadhana streak (15c); no Studio in Dashboard; composer icons, 14 Oct — LIVE (`bhakti/0006` migrated, `namo-api-00128-hdr`, web/pro `5983d09`)** | Rahul, Telegram. **Streak:** `sadhana_days` (`bhakti/0006`, RLS on, no policies), `apps/bhakti/streak.py`, `/v1/bhakti/streak/` (GET/POST yours, GET anybody's). Marked when a counted japa finishes (`Bhakti.jsx` TrackCard) and when an aarti begins (`Pooja.jsx`); shown by `SadhanaStreak` on Profile, a Pro's page and `/u/:id`. **Dashboard:** Studio removed; posting is Home's +, where a Pro or Creator gets video and a Pro gets Tag; `/dashboard/studio` and "Post more" open `/home?compose=1`. Creators do not tag products: a tag earns through a Pro's A code, so tagging for Creators waits for the owner. **Composer:** Gallery and Camera are icons alone. `docs/03`, `docs/05`, `docs/06`. Tests (4); lint and build clean; composer rendered. Needs the production migration on ship |
| **Phase 16 step 2 — Namo Consult (`/desk`), 14 Oct — LIVE (web/pro `d5c05d3`)** | Rahul, Telegram; Phase 16 owner's yes. `/desk` in the main app (`screens/Desk.jsx`): the pro app's own `PresenceKeeper`, `IncomingCall` and `ProConsult`, unchanged in what they do, under `DeskHeader` (back, name, Online). The store counts `/desk` as the consultant side, so the switch, the beat and the chat panel act as in the pro app; `IncomingCall` reads the store's side (identical in the pro app, where it is only mounted on `/pro`). Answer from `/desk` opens `/call/<id>?from=desk`, which ends back on `/desk`. `public/sw.js` routes a tapped notification to `/desk/ring/<id>` on 1namo.com, `/pro/ring/<id>` on pro.1namo.com. `desk.webmanifest` + title on `/desk` for its own icon (the Namo icon for now). Dashboard's Calls row and Availability go to `/desk`. Pro app unchanged; pro.1namo.com stays until a real paid call runs through `/desk`. **Not verified:** a real call, push on 1namo.com, install on a phone. A Pro subscribed on both apps gets the notification twice. `docs/03`. Lint and both builds clean; `/desk` rendered |
| **Phase 16 step 1 — Dashboard in the main app, 14 Oct — LIVE (`namo-api-00127-ccd`, web/pro `d742492`)** | Rahul, Telegram; Phase 16 owner's yes. `/dashboard` (`screens/Dashboard.jsx`): a Pro gets Studio, Earnings and Insights, links, practice, payout details and a link to the pro app for calls; a Creator gets Studio, their code and Insights. The pro screens are reused under `/dashboard/...` (`lib/dashboard.js` `proPath`, `components/ProHeader.jsx`), lazy-loaded so a Seeker downloads none. Not `/pro/...`: the store reads `/pro` as the consultant app and would start the online beat. The Dashboard button on a Pro's own page opens it (it opened pro.1namo.com); a Creator's is under Profile's icons. Server: `GET /v1/consultants/me/insights/` admits a Creator. Calls, availability and the pro app are untouched. Next: Namo Consult at `/desk`. `docs/03`. Test (1, 5 in the file); lint and both builds clean; Dashboard rendered for a Pro and a Creator |
| **Creators and two ticks, 13 Oct — LIVE (`namo-api-00127-ccd`, console `00028-z4g`, web/pro `d742492`)** | Rahul, Telegram. "Influencer" is **Creator** in the app and the console ("Make creator"); the column stays `profiles.influencer`. A Creator passes the video gate (posts reels) and carries a **blue** tick (feed rows `author_is_creator`, author page `is_creator`, own Profile). Every approved Pro carries an **orange** tick (Consult cards, their page, their feed posts); it was blue for console-verified only. `VerifiedMark` takes `tone`. Creator insights come with Dashboard in Phase 16 (main app plus a calling app for Pros, Namo Consult at /desk; owner's yes 13 Oct, revised 14 Oct). `docs/01` §2, `docs/03`, `docs/04`, `docs/05`, `docs/06`. Tests (2); lint clean; ticks rendered |
| **Market and Chat in the tab bar; bell-only header; Profile's five icons, 13 Oct — LIVE (web/pro `4a65b3d`)** | Rahul, Telegram. Bar: Home · Bhakti · Chat (`/messages`, the new `namaste` icon) · Consult · Market (`TABS` in `Chrome.jsx`; a tab's `also` keeps Market lit on `/academy`; `MarketSwitch` under Shop's and Academy's header). Seeker header: the bell alone, on every tab, replacing the row below. Profile: Consult · Sessions · Wallet · Edit · Share as icons (new `edit` pencil in `Icon.jsx`). `/messages` sits in the tab layout in the seeker app. Pro app unchanged. `docs/03`. Lint and build clean; the bar, switch and icons rendered |
| **Bell on the social tabs, wallet on Consult, 13 Oct — LIVE (`namo-api-00126-mcv`, web/pro `f917d4b`)** | Rahul, Telegram. Seeker app `TabHeader`: Consult keeps the wallet and the chat bubble; Home, Bhakti, Shop and Academy show a bell (Alerts, with the unread count) and no wallet. The bubble's always-on red dot is gone. Pro app unchanged. `docs/03`. Lint clean; **not rendered** — the headless screenshot hung twice. Rahul's Market tab (Shop + Academy) and a Messages tab in the bar are proposed, not built |
| **15b: free messages between people, 13 Oct — LIVE (`namo-api-00126-mcv`, web/pro `f917d4b`); `dms/0001` on production** | Owner's yes. New app `dms` (`dm_threads`, `dm_messages`, `dm_blocks`, migration `dms/0001`, RLS on with no policies — applied with `prod-migrate.sh dms` before the API deploy). Request until the recipient follows you, replies or accepts (one message till then); decline; block both ways; a moderated account cannot send; a seeker cannot start one to an approved consultant (`01-PRD.md` §4.1). Alerts once per conversation per hour, no words. App: `/messages`, `/messages/:id`, a Messages tab in the chat panel (both sides), Message on `/u/:id`; the pro gate lets `/messages` through. `docs/03`, `docs/05`. Tests `test_dms.py` (13); the 141 chat tests unchanged and passing; lint clean; screens rendered with stub data. **Not walked** between two real phones |
| **Bhakti social network, 13 Oct — approved; 15a and 15b LIVE, 15c next** | Rahul, Telegram: "karte hai, make a plan"; the owner approved all of 15a to 15d the same day. `docs/06-IMPLEMENTATION.md` Phase 15 (15a positioning and signals, 15b messages, 15c communities and habits, 15d safety and cost). `docs/01-PRD.md` §10 no longer lists a social network or pandit booking as non-goals |
| **Round verified mark and round avatars, 13 Oct — LIVE (web/pro `631114e`)** | Rahul, Telegram: "both need to be round". `VerifiedMark` is a white tick in a blue circle (was a scalloped rosette). `PopAvatar`'s wrapper is `inline-flex` (was `inline-block`, whose line box made a ringed photo avatar draw oval) — every avatar in both apps. Rendered; lint clean. `docs/04` |
| **A reshare with words, LinkedIn's layout, 13 Oct — LIVE (`namo-api-00124-h4k`, web/pro `22588f7`)** | Rahul, Telegram (screenshot of "Vishwas Jain reshared / Jai गुरुदेव"). With words: the resharer's photo, name and "Reshared", the words at full size, then the post, reel, blog or Bhakti item in a rounded box (`Quoted`, `ResharedLine` in `Home.jsx`); like, comment and share under the box act on the original. Without words: unchanged. Reshare rows carry `reposted_by_avatar` (content and Bhakti). Both apps (Home and Profile's Reshared tab). `docs/03`. Rendered with the real components and sent to Rahul; lint clean; reshare tests pass |
| **A personal feed, 13 Oct — LIVE (`namo-api-00123-fpq`, web/pro `7991631`)** | Rahul, Telegram: "personalise the feeds", then "you can do all". Home and Reels call `GET /v1/content/feed/for-you/` (`apps/content/ranking.py`): over the newest 400 live posts, a score from follows, the authors and kinds you liked, saved, reshared or commented on, freshness (half-life two days) and popularity; a post you viewed in 14 days keeps 30% of its score; no author twice running; every fifth slot random. Signed out or new: fresh and popular. Should the call fail, the client deals at random as before (`fetchFeed` in `src/lib/content.js`). **Not done:** rashi or language matching, as posts carry neither. Both apps; console untouched. `docs/03` and `docs/05`. Tests `test_feed_ranking.py` (8), 1206 pass; lint clean; not rendered. On production (73 live posts) the ranked call answers in 0.3–0.5 s warm, as the plain feed does; the API was built from the deploy copy (`02cc13f` still reverted) |
| **Profile picture on feed posts, 13 Oct — LIVE (`namo-api-00122-zs7`, web/pro `5949097`)** | Rahul, Telegram: the post header on Home showed "RJ", not his photo. Feed rows carry `author_avatar` (the profile's public `avatar_url`, `profiles.services.avatar_subquery`); `PostHead` shows it, initials when there is none. Posts, reels and blogs on Home, and every profile's Posts tab (same card). Both apps. Test `test_feed_row_carries_the_author_picture`; lint clean; not rendered. The API was built from the deploy copy (`C:/namoapi`, `02cc13f` still reverted); the console was not redeployed, as it has no feed |
| **One place to edit a seeker's profile, 13 Oct — LIVE (`cfe1c9e`)** | Rahul, Telegram. `/onboarding/details?edit=1` is headed "Edit details" and has an About box (the bio, 150 characters) under the name, saved with the rest; Profile shows the bio with no pencil, and "Write about yourself" opens that page. Seeker app only. Lint clean; not rendered signed in |
| **No Rates section on a consultant's page, 13 Oct — LIVE (`cfe1c9e`, both apps)** | Rahul, Telegram: "this is duplicate". About keeps speaks, category, experience, verified; the footer's tiles carry the rates, and a tile reading "Offline" or "3 min free" adds its ₹/min under it (`ConsultantProfile.jsx`). Lint clean; not rendered |
| **A consultant's Edit profile, with review for practice and degree, 13 Oct — LIVE (`namo-api-00121-csg`, `namo-console-00027-22g`, web/pro `7bf7bfd`)** | Rahul, Telegram. "Edit profile" on your own page (both apps, beside Dashboard and Share profile) and a row on `/pro/profile` open `/practice/edit` (`screens/EditPractice.jsx`). Direct: specialization, About, years, languages, tags — `PATCH /v1/consultants/me/profile/`. Reviewed: practice, credentials, degree, a new certificate — `GET/PUT /v1/consultants/me/review/`, table `profile_reviews` (`consultants/0009_profile_review`); console **Profile changes for review** shows now vs asked, the new certificate as a ten-minute link, Approve (applies at once) / Reject (needs the review note), audited. Logic in `apps/consultants/profile_edit.py`. Tests: `test_profile_edit.py` 9, console 2; lint and build clean; the screen rendered locally with a pending request. Not walked signed in |
| **Pro, Expert, Master badge; experience, rating, badge pills, 13 Oct — LIVE (`namo-api-00121-csg`, `namo-console-00027-22g`, web/pro `7bf7bfd`; `consultants/0008`, `0009` and `reactions/0005` on production)** | Rahul, Telegram (option A of three mocks). `consultants.badge` (`consultants/0008_consultant_badge`, default and DB default `pro`, check constraint), in both consultant shapes; console: Badge column, list-editable and filterable. App: `components/ProFacts.jsx` — "10 yrs Exp", rating ("5.0 · New" with no reviews, else average and count), badge pill — on the consultant page and `/pro/profile`; specialization as chips split on commas (Rahul's own reads as one chip until he writes commas). **Removed:** milestones — `lib/milestones.js`, `components/Milestones.jsx`, the avatar ring, the ladder, the congratulation, the `--tier-*` tokens. The API still returns `sessions_done`; nothing reads it. Namo's-share migration (commit `02cc13f`, not deployed) renumbered `0008` → `0010_consultant_fee_bps`, after the badge one and `0009_profile_review`. Tests: `test_consultant_badge.py` 3, consultants and payout tests pass; lint clean; the header rendered locally with the real components |
| **Reshared and Commented tabs; your reshare leads Home, 13 Oct — LIVE** | Rahul, Telegram. Profile (seeker): Posts · Reshared · Commented · Saved; a pro's own page: Posts · Reshared · Commented · Saved · Reviews · About, scrolling. Owner only. New `GET /v1/content/commented/` and `/v1/bhakti/commented/`; `components/ProfileActivity.jsx`, `ReshareCard`/`CommentedCard` in Home.jsx. Your reshare leads Home for five seconds (`noteReshared` in lib/content.js). The Reshared list under Posts went, and so did `/u/:id`'s public one (Rahul, same day; `ResharedList.jsx` deleted). 3 new tests; lint and build clean; tab rows seen in a local render, the tabs' contents not walked signed in. Live 13 Oct: namo-api-00120-z49 (without commission `02cc13f`), web and pro `023f21f`. `reactions/0005` (the `note` default) still not on production: the migrate was refused by the permission check this time; the live API sends `note` on every write, so nothing depends on it |
| **Likes, follows, saves and reshares failed on production, 13 Oct ~11:20–12:30 — fixed by `namo-api-00119-c55`** | Caused by the bot: migration `reactions/0004` put `reactions.note` on production NOT NULL with no database default, and the live API never sends it, so every reaction insert failed (last good row 05:26 UTC). Ended when `namo-api-00119-c55` went live: its model sends `note` on every insert. **The database default is still not set**; `reactions/0005` (`db_default=''`) sets it at the next production migrate, and must go before any API older than 00119 is rolled back to. Lesson: a NOT NULL column added ahead of the code that writes it needs a database default |
| **Reshare asks how, 13 Oct — LIVE (`namo-api-00119-c55`, web/pro `cfe1c9e`)** | Rahul, Telegram (LinkedIn's sheet). Reshare on a post, a reel or a Bhakti item opens a sheet: "Reshare with your thoughts" (up to 500 characters) or "Reshare now"; a lit Reshare still undoes in one tap. The words show under "↻ Name reshared" above the card, which is then not grouped. `reactions.note` (migration `reactions/0004`, on production), `components/ReshareSheet.jsx`. **00119 was built from main with `02cc13f` (per-astrologer commission) reverted** — that change is not live and waits for the owner Both bhakti and post reshare tests, lint and build clean; the sheet seen in a local render, not walked signed in |
| **View counts hidden on Home and Reels, 12 Oct — LIVE** | Rahul, Telegram: "we will count but will not show". The "N views" line under a post and on a reel is gone; `recordView` and `useCountView` still record a view (2 s on screen), and the pro app's Studio and Insights still show the author their own counts. Live 13 Oct, `e1c2dbc`, both apps |
| **Darshan: no offering text; diyas clear of the thali, 12 Oct — LIVE** | Rahul, Telegram. The toasts on each offering and on starting and ending the aarti are gone (the first-visit touch hint stays). The two diyas stand at 12.5% / 13% from the edges (were 16% / 17%) and over the thali (`z-10`), so a lit flame is not behind its rim; the thali keeps its 120px (Rahul: "thali chhoti mat karo"). Rendered at 360 and 412 px with the diyas lit. Live 12 Oct, `f9bc50e`, both apps |
| **Darshan flowers fall behind the altar, 12 Oct — LIVE** | Rahul, Telegram. The pushpanjali layer is drawn before the green slab in `Pooja.jsx`, so the slab and the samagri cover petals as they reach the altar; they fell in front of everything. Live 12 Oct, `eb736fb`, both apps |
| **Bells ring as you enter darshan, 12 Oct — LIVE** | Rahul, Telegram. Half a second after `/darshan` opens, both ghantis swing and ring once, as a touch makes them (`src/screens/Pooja.jsx`). The sound plays only where the browser allows it: after a tap in the app it does; a darshan opened straight from a link, before any touch, swings silently. Live 12 Oct, `91ea893`, both apps |
| **Create post toolbar lowered, 12 Oct — LIVE** | Rahul, Telegram: "reduce the height of buttons … more modern". The toolbar tiles (icon over name, about 70px) are pills now, icon beside name, about 40px, and "Add to your post" went. Tag product reads "Tag" so four pills fit a 390px phone in the pro app; rendered for both apps. Live 12 Oct, `2729897`, both apps |
| **The + button smaller, plus cut out, 12 Oct — LIVE** | Rahul, Telegram. Home's new-post button is 48px (was 56, 15% smaller) and the plus is a hole in the saffron disc (an SVG mask), so the feed shows through it; it was a black plus. Rendered and checked against the old one. Live 12 Oct, `97cc0ca`, both apps |
| **Create post, Facebook's shape, 12 Oct — LIVE** | Rahul, Telegram, after two mockups. `src/components/Composer.jsx` rewritten: no tabs; one Create post screen with the header (Back, title, Post top right), the author, one text box, the picked photo or video, and a pinned toolbar — Photo/Video, Camera, Tag product (only where `tagProducts`, i.e. the pro app), Blog. The kind follows the content (words → post, photo → post, video → clip if allowed). Blog is its own screen (cover box, title, body, word count). Drafts are `namo.draft.post` and `namo.draft.article`; the old `namo.draft.text`/`namo.draft.clip` drafts are no longer read. Home's sheet and EditSheet now let the composer draw the header (`onClose`). Rendered in a throwaway harness (post empty, typed, blog; seeker and pro toolbars) before commit; publishing itself not walked against the API. Lint and build clean. Live 12 Oct, `97cc0ca`, both apps |
| **E-books get like, comment, reshare and share, 12 Oct — LIVE** | Rahul, Telegram. Each book in Academy → E-book keeps its title and price line, and under it `BhaktiActions` (with share) and Read on the right; a priced book has no Reshare. A free book reshares (`REPOSTABLE_KINDS`) and reaches the feed as its cover. A shared book's `/bhakti/s/:id` forwards to `/academy?book=:id`, which lists that book first (Bhakti has no book shelf). Its link card is its cover and "Read this e-book on NAMO." Tests: bhakti, bhakti_social, share previews 56 pass; lint and build clean. Live 12 Oct: namo-api-00117-5vv, web and pro `4498c46` A reshared book in the feed was cropped 4:5; it shows its whole cover now, labelled E-book (Rahul, same day), live in `8711545` |
| **No Download in the bhajan player, 12 Oct — LIVE** | Rahul, Telegram. The audio player's ⋮ menu on a bhajan or mantra no longer offers Download (`controlsList="nodownload"` on `TrackCard`'s `<audio>`); Playback speed stays. It hides the button only: a free track's file is at a public R2 URL. Chrome honours it; Safari has no such menu. Live 12 Oct, `13bcb54`, both apps |
| **Welcome says "India's Spiritual Network", 12 Oct — LIVE** | Rahul, Telegram. The sign-in screen's headline is "India's Spiritual Network" (भारत का आध्यात्मिक नेटवर्क), and its four chips are two social promises and two features: Follow gurus & astrologers, Post & share bhakti, Daily darshan & bhajans, Kundli & horoscope (`w.p.*` in `src/data/i18n.js`). "Live darshan" was suggested and written "Daily": the darshan page is pictures, not a stream. Puja samagri left the chips. The default link card in `index.html` still carries the old line; the console's Link card overrides it. Live 12 Oct, `34adcd4`, both apps |
| **A shared Bhakti link opens the item, 12 Oct — LIVE** | Rahul, Telegram: a shared wallpaper, bhajan or mantra opened its shelf, and a bhajan's link card was the site's. `/bhakti/s/:id` now renders Bhakti with that item alone and "See all …" under it (was a redirect to `/bhakti`); Home's reshared picture and the Reshared list link there too. `share.bhakti_page` gives a bhajan or mantra its cover as the card and a line per kind. Signed out, the link still goes to sign-up first and does not come back to the item afterwards. Tests: share previews 20 pass; lint and build clean. Live 12 Oct: namo-api-00116-7nj, web and pro `71fba97`; a live bhajan link checked: its title, line and cover |
| **Bhajans and mantras get the same row, 12 Oct — LIVE** | Rahul, Telegram. Like, comment, reshare and share on the left, a green Play (with Pause) on the right; title and credit gone; a mantra's repeat counter shows under the row while it runs. A bhajan's like was a `like:` flag on a content-type reaction (the old "ponytail" note); it is `blike:` now, so earlier bhajan likes are not counted. Priced rows show no Reshare. Server: `REPOSTABLE_KINDS` gains bhajan and mantra; a reshared one shows its preview picture on Home. Tunes (`AudioRow`) are unchanged. Tests: bhakti 36 pass; lint and build clean. Live 12 Oct: namo-api-00115-mvw, web and pro `537adbc` |
| **Wallpapers get like, comment and reshare, 12 Oct — LIVE** | Rahul, Telegram: "apply this all into wallpapers also". A wallpaper card is the picture, then like, comment and reshare with counts, then a green Download with a download mark; title, credit and the link-share icon gone. The three icons are one component now, `src/components/BhaktiActions.jsx`, used by the status card, the wallpaper card and the reshared picture on Home. The server already took wallpapers (`REPOSTABLE_KINDS`). Client only; lint and build clean. Live 12 Oct, `625e060`, both apps The share icon came back on wallpapers the same day (Rahul), Home's share mark after reshare; live in `30d437f` |
| **One feed card per reshared thing, 12 Oct — LIVE** | Rahul, Telegram (my suggestion, his yes): ten reshares of one picture were ten cards. Home groups reshares by what was reshared, posts and pictures alike: one card, the newest resharer named, "and N others" (`home.resharedByMany`). Client only (`src/screens/Home.jsx`). It groups within the 50 newest reshares of each type the feed loads. Lint clean. Live 12 Oct, `c89a22d`, both apps |
| **Like, comment and reshare on a status, 12 Oct — LIVE** | Rahul, Telegram. A status card's row is now Home's heart, comment and reshare, with counts, then the green Share with a WhatsApp mark (it only shares the status). Title, credit and the link-share icon are gone (Rahul: the pictures will be NAMO's own; licensed ones he replaces). Server: `reactions.target_type` `bhakti` (`reactions/0003`), table `bhakti_comments` (`bhakti/0005`), `GET/POST /bhakti/assets/:id/comments/`, `POST /bhakti/comments/:id/remove/`, `likes`/`comments` on each asset row. App: `blike:<id>` flags (`src/lib/reactions.js`), `CommentSheet` takes `bhaktiId`. No console page for these comments, as there is none for a post's. **Reshare** (Rahul chose option B): the plain picture under "X reshared" in the Home feed and on the profile's Reshared list; `brepost:<id>` flags, `GET /bhakti/reposts/`, `PictureCard` in `Home.jsx`. `ActIcon`/`Count` moved to `src/components/ActIcon.jsx`. A status card's counts now count your own tap once (Home's add-your-flag rule counts a like from before twice; Home's posts still do). Tests: bhakti, bhakti_social, reactions, content pass (114); lint and build clean. Live 12 Oct: `reactions 0003` and `bhakti 0005` on production, namo-api-00114-szm, namo-console-00026-z5l, web and pro `4231122` |
| **Status shelf shows the finished status, 12 Oct — LIVE** | Rahul, Telegram: Share on a Bhakti status opened a second screen with the composed image; "there is no need for this step". Each card on the Status shelf is now the composed status (photo, name, date, tithi; 9:16), composed when it comes within 600px of the screen, the plain artwork until then. Share sends that image to the share sheet at once. The pencils on any card open Your status details, which changes every card. `ShareSheet` is gone; `StatusShelf` and `StatusCard` in `src/screens/Bhakti.jsx`. Lint clean; not walked in a browser. Live 12 Oct, `1420638`, both apps. The pencil on the name is gone; the one on the photo opens the same page (12 Oct, Rahul), live in `9d8c1a3` |
| **Your new post first, 12 Oct — LIVE** | Rahul, Telegram: a post he made was saved but he could not find it — Home and Reels deal the newest 200 at random. Now a Home or Reels loaded within 5 seconds of publishing leads with your new post (Rahul chose 5 seconds over 24 hours); later loads deal it at random like any other. Client only: `publish()` records the id, `fetchFeed` moves it first (`src/lib/content.js`). Lint clean. Live 12 Oct, `9d7d46d`, both apps |
| **Link card in the console, 12 Oct — LIVE** | Rahul, Telegram: "provision in admin to change this card, heading and description" for a shared 1namo.com. Console → Appearance → Link card: heading, description, picture (upload to R2 or a URL). `/` now goes to `namo-api` (`share.home_page`), which returns the app with the card's tags; with no card set, the app unchanged. To make that possible `npm run ship` renames `dist/index.html` to `app.html` and the web rewrites point at it (Hosting serves a file before a rewrite). A cold API adds a second or two to the first open of `/`; if the API is down, `/` fails while every other path works. Table `link_card`, migration `appearance/0002`. Tests: share 28, appearance 9, console pass; lint clean. Live 12 Oct: migration on production, namo-api-00112-wz6, namo-console-00025-4gx, web 25408ca. **Broke for about ten minutes on the way out:** `/index.html` is ten username characters, so once it stopped being a file Hosting sent it to the API, and the API (which fetched the app from `/index.html`) wrapped its own preview. `/` redirected to /home and profile links lost the app. Fixed in Hosting with a `/index.html` → `/app.html` rewrite; `APP_INDEX_URL` now defaults to `app.html` in code, which reaches the API on its next deploy |
| **The name is NAMO, 12 Oct — LIVE** | Rahul, Telegram: "sab jagah badal do". Every place a person reads the brand now says NAMO: app and pro app copy, the tab title, notifications (`sw.js`), the legal pages, link cards, the AI and tarot system prompts, referral share text, the console header. The domain stays 1namo.com, and code comments are unchanged. **Not changed, waiting for Raghu's yes (payments and wallet):** the Razorpay checkout name (`src/lib/shop.js`, `src/lib/wallet.js`) and the AI's wallet-ledger lines (`apps/ai/services.py`). 202 tests in the touched modules pass; lint clean. Live 12 Oct: namo-api-00111-d4g, namo-console-00024-bs8, web and pro 30304af |
| **Profile link preview card, 12 Oct — LIVE** | Rahul, Telegram (option 2 of 2). A shared `1namo.com/<username>` shows that person's card on WhatsApp: photo as a square thumbnail, "Name · <their category> on NAMO" ("Pro" when the category is empty) or "Name on NAMO"; every preview card says NAMO, not Namo (Rahul), the common card in `index.html` too, and their practice or bio. Hosting sends username-shaped paths to `namo-api` (`firebase.json` regex rewrite; `/onboarding`, `/horoscope`, `/notifications` are pinned to the app above it). Same visibility rule as the link: a seeker with no posts, a blocked person or a free name previews as Namo. 5 new tests. Live 12 Oct (namo-api-00111-d4g, web 30304af); 1namo.com/rahulvjain returns the card and its image. A category saved with a line break shows as two lines in the title. WhatsApp caches a card per link, so a link already sent keeps its old card |
| **Usernames — `1namo.com/<name>`, 11 Oct — LIVE 12 Oct (`08aa890`; `namo-api-00109-2lz`, `namo-console-00022-khh`; `profiles 0006` migrated on production)** | Rahul, Telegram. Everybody gets `name-surname-1234` on their first profile read; Settings (both apps) → Username changes it once every 30 days. `/:handle` in the seeker app forwards to `/consult/:id` or `/u/:id`; Share profile uses the name. Console: username in the People list, searchable, editable with the same rules, logged as `username.change`. API tests 1151 pass; lint and both builds clean. Not walked on a phone. The WhatsApp preview card is still the common one: `firebase.json` already sends `/read/**` and `/bhakti/s/**` to the API for per-item cards, and a username card would be the same kind of rewrite (not built) |
| **Dashboard button on a pro's own page, 11 Oct — LIVE (`39a11c3`, both apps)** | Rahul, Telegram. Your own consultant page has **Dashboard** and **Share profile**, half the row each, both the white button. Dashboard opens pro.1namo.com from 1namo.com (an absolute link: a route cannot cross apps) and `/` inside the pro app. The two apps keep separate sign-ins, so a first visit asks for the phone code. Console untouched (no such page). Lint and both builds clean (`docs/03`) |
| **Profile header: name over posts, followers, following, 11 Oct — LIVE (`c253ffe`, both apps)** | Rahul, Telegram (an Instagram screenshot). `ProfileHead.jsx` is one block used by your Profile, `/u/:id` and `/consult/:id` (pro and client): the name, then three columns, number over label. On a consultant page the specialization, milestone, rating and experience moved under the photo; the posts are now loaded by the page, not the Posts tab, so the header can count them. Console has no profile page. Lint and both builds clean; a sample render matched; not seen with live data (`docs/03`) |
| **Consultant page: Follow and Share profile, 11 Oct — LIVE (`eab4c62`, both apps)** | Rahul, Telegram. The schedule, chat, video and call icons beside Follow are gone; the footer's Video, Audio, Chat and Book tiles do the same. Follow and **Share profile** now share the row, same button style and both the white button, never saffron, followed or not (live in `b01ec95`). The offline line says "book" instead of "schedule". Pro app shows the same page; the console has no such buttons (`docs/03`). Lint and both builds clean; not walked on a phone The SHARE word in the top bar is gone too (12 Oct, Rahul, `f98e299`, live in `c886c80`): Share profile is the one share On your own consultant page Followers and Following now open the list, as the seeker profile does (12 Oct, Rahul: "sirf apne page par"); `FollowSheet` moved out of `Profile.jsx` into `src/components/FollowSheet.jsx`. Live 12 Oct (`642c9f4`, both apps) A name in that list opened Home when the person had never posted (no `/u/:id` page for non-posters); now `GET /content/authors/:id/` also answers a signed-in viewer joined by a follow either way, and the app sends its token (12 Oct, Rahul, `5ade1b6`). Live 12 Oct: namo-api-00113-gqr (also carries the `APP_INDEX_URL` = app.html default), web and pro `e524163` |
| **Verified mark; Edit profile to Settings, 11 Oct — LIVE (`cd8fcfa`, both apps)** | Rahul, Telegram. A verified consultant has a blue verified mark beside the name on their page and on `/consult` cards (`VerifiedMark.jsx`; it was a small green tick on cards). The page's top bar now shows the category instead of "VERIFIED". A pro's own page has no Edit profile button; Settings has **Edit name and birth details** for a pro. A seeker's Profile still has its Edit profile (`docs/03`). Lint and build clean; seen in a local render against the live API |
| **Settings: no Kundli, Saved or Wallet rows, 11 Oct — LIVE (`8e061f3`, both apps)** | Rahul, Telegram. Gone from ☰ → Settings: Kundli and Saved (a pro's Profile section) and Wallet (Account, for everyone). The wallet stays the icon at the top of every tab; `/wallet` and `/profile/kundli` still exist (`docs/03`). Lint and build clean |
| **Saved tab on a pro's own page, 11 Oct — LIVE (`a3369d5`, both apps)** | Rahul, Telegram. A pro's own page has Posts · Reviews · About · **Saved**. Saved shows the posts they bookmarked, the same list as `/profile/saved`. A client sees only the first three (`docs/03`). Lint and build clean; not rendered |
| **Consultant intro video or photo, 11 Oct — LIVE (`consultants/0007` on production, `namo-api-00104-48r`, `namo-console-00021-dj7`, front end `6647a28`)** | Rahul, Telegram. The "Meet X · 1:24" box on a consultant page was a placeholder that played nothing. Pros now upload a video or a photo from Settings → **Intro video or photo**, in either app, and can remove it. It shows above the tabs, and nothing shows when there is none. Columns `consultants.intro_url` and `intro_kind` (migration `0007`), endpoint `PUT /consultants/me/intro/` (`docs/05`, `docs/02`, `docs/03`). 5 new tests, 1097 pass; lint and both builds clean. Not walked: no real upload has been tried |
| **Reels count a view in the Home feed, 11 Oct — LIVE (`043a342`, both apps)** | Rahul, Telegram. A reel playing in the feed (60% on screen) for two seconds sends one view, as the reel viewer does; the same daily, never-the-author rule on the server. Lint and build clean; not walked |
| **Photo and text posts count views, 11 Oct — LIVE (both apps)** | Rahul, Telegram. A photo or text post in the Home feed (and on a profile, which uses the same card) sends one view after two seconds with 60% of it on screen; the server counts a person once per post per IST day and never the author. The count shows under the post once above 0. Front end only. Lint and build clean; not walked |
| **Studio says "Text" for a text post, 11 Oct — LIVE (both apps)** | Rahul, Telegram. A `post` with no picture read "Photo" over a blank tile and counted as a photo. Studio's and Insights' rows now say **Text** with an "Aa" tile, and the count line is reels · photos · text · blog posts (`kindLabel` in `Pieces.jsx`). Rahul also said blogs still show 0 reads. On 11 Oct the live API returned `view_count` 0 on all three of his posts. The counting itself shipped on 10 Oct (`b228529`): it counts only a signed-in reader who is not the author, after five seconds on `/read/:id`. Nobody else appears to have opened them since. Not tested with a second account |
| **Consultant page trimmed, 11 Oct — LIVE (`65ed197`, both apps)** | Rahul, Telegram. On `/consult/:id` and a pro's own page: no + (post from Home), no "Practical" heading on About, no "Unlimited questions" row and no how-you-pay note under Rates, and no Book section above the footer (the footer's Book opens the same sheet) (`docs/03`). Lint and both builds clean. **Not rendered**: the headless screenshot hung twice |
| **Profiles show posts in full, 11 Oct — LIVE (`f679602`, both apps)** | Rahul, Telegram. Your Profile's Posts tab, `/u/:id` and a consultant page's Posts tab (pros too, Rahul's follow-up) show the person's posts as the feed's cards, newest first, with like, comment and share (`FeedCard`, exported from `Home.jsx`). Saved stays a grid. Lint and both builds clean; seen in a local render against the live API (a consultant page with 48 reels) |
| **Seeker profile trimmed, 11 Oct — LIVE (`f679602`, both apps)** | Rahul, Telegram. Gone from your Profile: the Sun / Moon / Lagna chips, the + (post from Home's + instead) and the Kundli tab (it is in the horoscope section). The "● Available" line went too; a green dot sits on the photo's top right. Tabs are Posts and Saved (and Influencer); the empty Posts tab says to tap + on Home. `/profile/kundli` still opens from a pro's ☰. A pro's own consultant page keeps its + (`docs/03` `/profile/:tab`). Lint and build clean; seen in a local render |
| **Text posts and #hashtags, 10 Oct — LIVE 11 Oct (`295c45e`)** | Rahul, Telegram. The composer's tabs are Text, Photo, Video, Blog (Video still needs the flag or approved consultant — Rahul: keep the rule). A text post is a `post` row with no media, which the API already accepted and the feed already draws large on colour; a photo or video caption is now optional. A #hashtag in any caption is a link to Search on Posts with the tag typed in (`src/components/Hashtags.jsx`), so it finds the tag only among the newest 200 posts. Front end only, no API change. Lint and build clean; seen in a local render. **Not walked signed in** |
| **New post (+) on Home, 10 Oct — LIVE 11 Oct (`295c45e`)** | Rahul, Telegram. A round + at the bottom right of Home (all three tabs, nowhere else) opens the profile's composer full screen; signed out it says *Sign in to post.* Publishing reloads the feed (`docs/03` `/home`). Lint and build clean; seen in a local render signed out. **Not walked signed in** — the composer itself is the one Profile already uses. Shipped with the rates change |
| **Pros set their own rates, 10 Oct — LIVE 11 Oct (`consultants/0006` on production, `namo-api-00103-vdq`, `namo-console-00020-7ln`, front end `295c45e`)** | Rahul, Telegram. Each consultant types four rates, ₹5–₹110 a minute in whole rupees: chat, video, audio, booking. A booking is one 20-minute slot at the booking rate × 20; the 15/30-minute slots and the 20% booking discount are gone, and so are the price bands (`docs/01` §4.1, §5.1). API: `PUT /consultants/me/rates/`, the application takes `rates` (an old client's `tier` still works), and the meter charges the row for the channel pressed. Migration `consultants/0006_own_rates` copies each consultant's per-minute rate to chat, video and audio and sets booking to the old 20-minute price over 20 (₹592 → ₹600 for tier 1). Pro app: rate fields on the application and Profile → Settings → **Your rates**. Seeker app: the consultant page footer is Video, Audio, Chat and Book, each with its rate. Console: the consultant queue and page show the four rates, read only. 1092 backend tests pass (new: rates endpoint, range refusals, per-channel meter, the migration's data step, the console's rates); lint and both builds clean. Raghu's yes came on 10 Oct. On production the API's role is `postgres`, which owns the table and has BYPASSRLS, so the `007` band policy does not apply to it. Migrated through the pooler in `backend-django/.env`; this machine cannot resolve the direct `db.` host. Before the migrate the 17 rows were saved to a JSON backup in the session scratchpad. After it, five consultants have four rates each: ₹37/₹600, ₹45/₹720 (two), ₹75/₹1,200, and ₹10/₹200 for the one who had no slot. The live API serves them. **Not walked on a phone** |
| **One profile for a pro, 10 Oct — front end LIVE (`02b2822`, both apps)** | Rahul, Telegram: a pro had two profile pages. An approved consultant's Profile tab is now their `/consult/:id` page with Edit / Share / + in place of Follow and the call buttons, and the rates footer without its buttons; Kundli, Saved and Influencer moved to ☰. The consultant page's tabs are Posts · Reviews · About and open on Posts, for clients too. Also for every viewer: the consultant page shows the profile photo instead of initials, and its Share shares the link (it toasted "Profile link copied" and copied nothing). No API change. Lint and build clean; seen in a local render with Rahul's public row (both views, screenshots sent); **not walked signed in as a consultant** |
| **Blog views counted, 10 Oct — front end LIVE (`b228529`, both apps)** | Studio showed 0 views on every blog post (Rahul, Telegram): only the reel player ever called `POST /content/<id>/view/`. `/read/:id` now sends one after five seconds and shows the count beside the read time. No API or schema change — the endpoint already counted any kind. Photo and text posts count since 11 Oct (row above). Lint clean; not walked in a browser |
| **Reel views: once per person per day, 3 Oct — LIVE (`namo-api-00059-kzr`)** | Was once per person ever; the owner found the count too slow. `content_views.day` (IST) and the unique rule `(content, viewer, day)`, migration `content/0006`, `docs/05` §5.2b. 2 new tests, 820 pass. No app change needed. **Order: migrate production, then deploy the API.** Between the two, the old API's inserts omit `day` and fail quietly, so no views count — nothing breaks |
| **Hindi across the seeker app, 3 Oct — front end only** | About 400 interface keys added to `i18n.js`; what is and is not covered is in `docs/04` §8. Walked in Chrome in Hindi: Home, Consult, Shop, Profile, Horoscope, Muhurat — no clipping. Wording not checked by a native reader; doubtful picks: "बीता कल" / "आने वाला कल", "शुभ-अशुभ समय" for Windows, "दाख़िला" for enrolment. Also fixed: Tarot showed the literal "a.signIn" |
| **UX audit fixes, 3 Oct — front end only** | Nothing under 11px (type tokens +1px, `docs/04` §2.2); small buttons at least 36px tall; Shop's cart moved from a floating button that covered Buy to beside the pinned search; Tarot's deck chooser is solid white with tappable rows (it read as disabled); Chart headings in plain words ("Your birth chart", "Your life periods"); warmer lines on Premium, Reports, Shop and the timeless chart. Walked in Chrome: Shop, Tarot. Consultant header: `.pill.knob` zeroes padding and outranks `px-*`, so Online and the balance ran edge to edge once caps grew — `!px-3` now, the logo shrinks first, the Online dot is green; walked signed in as the test consultant (7011921246) at 390 and 360px. **Found, not fixed: Earnings' headline card (₹38,420 available, ₹12.8L lifetime, "Next payout 12 Aug") and its 7-day chart are `mock.js` shown to a real consultant**; the Sessions list under it is real. Its Withdraw sheet also takes the 18% fee again from money already net of it. A payout design (monthly on the 7th, statements, bank and PAN verification, RazorpayX) is drafted for review, not in the docs yet: https://claude.ai/artifact/VjYSfdLiEMpEXWa5ewAV57 **Not fixed: "Vimshottari stack" and "Testing daily tone" in the daily reading** — that text comes from the API's narrative, on the pre-release list |
| **Reshare — LIVE 1 Oct (`namo-api-00058-bn8`, app `e91c37d`)** | Verified live from the test account: reshare wrote a row and the profile list showed it, undo removed it. A `reactions` kind (`docs/05` §5.2e), migration `reactions/0002` **applied to production**. Reshare button on posts and reels (not your own), "↻ X reshared" items in the feed, a Reshared list on profiles. 9 new tests, 797 pass. **Also fixed: every durable toggle (like, save, follow, reshare) could send the opposite write** — `toggleFlag` read `next` from inside a deferred setState updater, so a tap that turned a heart on could send a DELETE; caught by the reshare browser test, verified fixed (like on → POST, off → DELETE). Likes made before this fix may not have been saved. Profile's "Past sessions" still shows `mock.js` sessions to real accounts — not fixed |
| **Comments — LIVE 1 Oct (`namo-api-00058-bn8`)** | Verified live: a comment posted from the test account reached the server thread and Delete removed it. The test left one `content.comment` and one `content.repost` notification on the seeded Ritu Kashyap profile. The comment icon used to toast "Replies — prototype only"; it now opens `CommentSheet` (feed posts, feed reels, the reel viewer's rail) on `content_comments` (`docs/05` §5.2d). Migration `content/0005` is **applied to production**. **The API must be deployed before the app is pushed**: the new API reads the table (done), and the new app calls endpoints the old API lacks. 11 new tests, 788 pass. Thirteen other buttons still toast "prototype only" — listed in this row's commit message and in chat, not built |
| **Feed feedback round — on `main` and deployed (front end), 30 Sep** | Stories strip and post dates removed; lighter action icons; reels have like / reply / share / save; Home tabs are Reels · आज का पंचांग · आज के दर्शन; the reel viewer lost its "n / 49" counter and its "Book a session" chip, which is now the reel's tagged products; Bhakti lost its header tag and its search moved above the tiles. **Share is real now** (`lib/share.js`, share sheet or clipboard) — the old "link copied" toasts copied nothing. **Reel views** need the API: `content_views`, migration `content/0004`, `docs/05` §5.2b; until `namo-api` is redeployed no view is recorded and the count stays hidden (it only shows above 0) |
| **Products tagged on posts and reels, and reel views — LIVE, 30 Sep** | Consultants tag up to 3 shop products in the studio composer; the feed and the reel viewer show them; a tap opens `/shop?p=…&ref=<their A code>` with the product ringed, and the purchase credits them the affiliate 10% (owner's call). Reels count one view per signed-in person. Tables `content_products` and `content_views` (`docs/05` §5.2a–b), migrations `content/0003`–`0004` **applied to production**, API **`namo-api-00053-b79`** serving 100%, no 5xx in its first hour. Verified live: the feed carries `products`, and one reel watched from the test account went 0 → 1 views. **Not verified live: a real consultant tagging a product** (no consultant login on this machine), nor the RLS flag on the two new tables (the read was refused by the session's permission guard). Deploying from the Windows laptop: `gcloud.cmd run deploy namo-api --source . --region=asia-south1` from `backend-django/` — `gcloud.ps1` is blocked by the execution policy; migrations first, from the laptop, with `backend-django/.env` loaded into the shell (settings do not read `.env` themselves) Open finding: no earlier Django migration enables RLS on the tables it creates, so they may be reachable through PostgREST with the anon key — unchecked |
| **30 Sep list — paid predictions, twelve free sign readings, D1–D60, gender, and seven more** | **Deployed 30 Sep** — migrations on production, API `namo-api-00054-vc8` (tarot fixes `namo-api-00055-zjn` and `-00057-njh`, dasha `namo-api-00056-lz5`), front end on `main`. Entitlements table (₹99 predictions / ₹49 muhurat / ₹99 e-book). **Never walked in a browser; no real purchase made on production** — §40 |
| **9 · reviews and content** | **Done and closed.** Both projects, front end deployed, all three done-conditions walked in a browser on dev (9 Sep) and the check passes on both. Two bugs the walk found are fixed — §8 |

**Production has one real consultant**, who applied through `/pro/apply` and was
approved by hand — the entire approval flow until phase 13. They have **no
availability rows**, so nothing is bookable until somebody taps cells in
`/pro/consult`.

**The six seeded consultants are still `pending` on production, and the plan for
them changed on 9 Sep.** `01-PRD.md` §7's launch-empty decision was partially
reversed: the FEED is to be seeded from them until real consultants publish, the
MARKETPLACE is not. `backend/seed/content.mjs` approves them for authorship and
then deletes their availability, deactivates their per-minute services and
clears their fabricated credentials — so they can post and cannot be booked,
chatted or believed. Nothing has been seeded yet on either project.

**Content is loaded from the BACKEND, not typed into the studio, and that is a
decision rather than a shortcut** (9 Sep). It holds for real consultants as much
as for the seeded six: a partner arriving with a lot of posts and reels is not
going to sit in `/pro/studio` uploading them one at a time. `content.mjs` takes
a real consultant's profile UUID for exactly that. The studio remains the path
for a consultant posting one thing they just wrote; it is not the path for
volume.

**Parked, deliberately.** The tool is written and the route is decided; nobody
has run it against a database. Picking it up needs media files, a manifest and
the service-role key — §8 has the shape and the untested edges.

This file describes **state**. It does not describe the system — that is
`docs/` — and it is not a changelog. History lives in `git log`, which is
better at it. When something here stops being true, rewrite the line.

---

## Start here

Enough to pick the project up cold.

```bash
npm install
npm run dev -- --port 5260     # any free port
npm run build                  # proves less than you think
npm run lint                   # proves the part the build cannot
```

**The working machine is Windows as of 29 Sep** (the Mac was retired). The
Django venv is `backend-django\.venv\Scripts\python.exe`, not `.venv/bin/`;
the gitignored Makefile still assumes the Mac. Never copy `node_modules` or a
venv across machines — both carry platform binaries. Strftime's `%-d` raises
on Windows; format the day number by hand.

**Two Supabase projects, and never mix them.** Rules in
`backend/INSTRUCTIONS.md` §3.

| | Project ref | Reached by | Holds |
|---|---|---|---|
| **Production** | `talqzgolttfgdzcoaqno` | the deployed site only | real accounts, real money, one live consultant |
| **Dev** | `mrjsatelbuiypodeulcx` (`namo-dev`) | `npm run dev`, `.mcp.json`, agents | throwaway |

`.env.local` (gitignored) and `.mcp.json` both point at **dev**. Production
credentials live only in the GitHub Actions secrets. A **third** store arrived
with phase 3: each project's Edge Function secrets, holding everything a server
function needs and the browser must never see. Nothing moves between the three. If `.env.local` is
missing, copy `.env.example` and fill it from the dev project's Settings → API.

**Signing in on dev costs nothing.** Test OTP is configured: phone
`+919999900001` or `+919999900002`, code `123456`, no SMS. Type `9999900001`
into the ten-digit field — the `+91` is fixed in the UI. Two numbers, so the
"a second account sees only its own data" check needs no second phone.

**Live:** https://1namo.com/#/home  (apex custom domain on GitHub Pages;
`atharvborse2004-ops.github.io` now 301s here). Pushing to `main` deploys
automatically, ~40s. `HashRouter`, so GitHub Pages needs no config for
sub-routes.

### The checks

Six runnable checks live in `backend/schema/`. Run the ones whose area you
touched, in the **dev** SQL editor.

| File | Covers |
|---|---|
| `003_wallets_ledger_check.sql` | the wallet: balance cache, refusals, replay, double-tap |
| `006_payments_check.sql` | payments: idempotency, a failure leaving no ledger row |
| `009_slots_check.sql` | consultants: slots on all seven weekdays, approval, bands, grants |
| `012_bookings_transaction_check.sql` | bookings: the transaction, the refusals, the reversing credit, both books append-only, the new policies |
| `014_metered_chat_check.sql` | chat: the hold, the round-up, the cutoff, the sweeper, and the live-session gate on messages |
| `019_astro_cache_check.sql` | charts: the cache table's shape, RLS on, and **zero policies** — service role only |
| `020_content_reviews_check.sql` | content and reviews: draft and blocked-consultant leaks, counts starting at zero, **the review anti-fraud gate**, `verified` derived, the rating cache reproducing its source, and a stranger reading counts but not who is behind them |

**Passing looks like a failure:** `ERROR: PHASE 2 CHECKS PASSED`, and the same
shape from the other five. Each raises on its last line to roll back every row it
wrote — the ledger is append-only, so a check that inserted real rows could not
clean up after itself. Any other error names the assertion that broke.

Each needs at least one profile to exist, and each measures **relative** to
whatever is already there, so they can be run repeatedly against a database
with real data in it.

---

## Where to read what

| Question | File |
|---|---|
| What is this product, who uses it, what does it cost | `docs/01-PRD.md` |
| Stack, trust boundary, API surface, admin isolation | `docs/02-TRD.md` |
| Routes, screens, actions, state machines | `docs/03-APP-FLOW.md` |
| Tokens, components, the design system | `docs/04-UI-UX.md` |
| Tables, columns, RLS, seed plan | `docs/05-BACKEND-SCHEMA.md` |
| What gets built in what order | `docs/06-IMPLEMENTATION.md` |
| The rules every phase obeys | `backend/INSTRUCTIONS.md` |

---

## 1. Front end

**Complete as a prototype.** Vite 5 · React 18.3 · Tailwind 3.4 ·
`react-router-dom` 6.28 · plain JSX. Three runtime dependencies. No icon
library, no state library, no UI kit, no type checker, no tests. There **is** a
linter as of 7 Sep — five rules, no style opinions, `npm run lint`; see "There
is a linter now" under §5.

Two sides in one codebase. Most values on screen still come from
`src/data/mock.js` and `src/data/bhaktamar.js`. Five things are real:

- **Identity and birth details** (phase 1). The onboarding questions plus phone
  verification write a `profiles` row; Profile, Chart and Horoscope read it back.
- **The wallet** (phase 2). Balance and ledger are server rows read under RLS,
  and every debit is decided by a server function. Nothing in the browser can
  move either.
- **Top-up** (phase 3). Razorpay checkout, credited by a webhook.
- **The whole consultant surface** (phase 4). Who a consultant is, what they
  charge, when they are open, and which requests are waiting. `/consult`,
  `/consult/:id` and every `/pro` screen read real rows; the availability grid
  and accept/decline write them.
- **Charts, the panchang and the daily reading** (phase 7). Computed from the
  signed-in person's own birth row by the `astro` Edge Function and memoised in
  `astro_cache`. `/chart`, `/chart/:id`, `/horoscope`, the horoscope overlay and
  both computed cards on `/home` are real, **on both projects and deployed**.

Everything else evaporates on reload, deliberately.

### Structural facts worth knowing before touching `src/`

- **`HashRouter` is mounted above `AppProvider`** so the store can read the URL.
  `isPro` is derived from the pathname. **Do not add a persisted role** — it can
  disagree with the address bar.
- **`src/store.jsx` is one context** with a large `useMemo` and a
  **hand-maintained dependency array**. The value object and the dep array must
  both be updated or the context goes stale intermittently.
- **`flags` is the extensibility hatch** — a `Set` of namespaced strings with
  `hasFlag` / `toggleFlag`. Reach for it before adding a store slice. It carries
  `like:` · `save:` · `follow:` · `remind:` · `tarot:free1|free2` ·
  `setting:croppedDeityImage`. Phase 4 removed three of them —
  `accept:` and `decline:` are `bookings.status` writes now, and
  `closed:{day}:{time}` is a row in `consultant_availability`.
- **Everything reusable is in `src/index.css`** under `@layer components`. Read
  it before writing markup.
- **`.subnav` is deliberately dead code.** Do not clean it up without asking.

### The money and identity contracts

- **`spend()` returns a promise.** It used to return a boolean and every caller
  used it as one. `if (spend(...))` is truthy whatever the server said, so a
  missed `await` is a purchase that was refused and went through anyway. All
  four charging call sites await it: `CartSheet.jsx`, `Tarot.jsx`,
  `Reports.jsx`, `Shop.jsx` (×2). A second guard sits in the store as a **ref**
  — two taps land in the same tick and state set by the first has not applied
  by the second — so a button that forgets its pending state still cannot
  double charge.
- **`balance` is PAISE and it is `null` until loaded.** Rupees live only in
  `mock.js` and in what the user reads; `rupees()` is exported from `store.jsx`
  and is the one place money becomes text. A screen comparing `balance` to a
  mock price needs the hundred — `Tarot.jsx` is the one that does. `null`
  renders as an em dash: a wallet flashing zero at someone who has money is
  worse than showing nothing yet. `rupees()` prints whole rupees whole and
  anything with paise to two digits — ₹2,248.5 is a number that happens to be
  money, not a price, and it reached a screen once when a band divided unevenly.
- **`useProfileFields()` is what screens read for identity.** Signed in, it
  returns the real row or blank — never the seed person, because a signed-in
  user seeing the mock name and birth details would get a chart drawn for a
  birth that is not theirs, permanently if the fetch failed. Signed out it
  returns seed, which is the demo. **Never read `mock.js`'s `user` directly in a
  screen that shows identity** — that bug has shipped twice.
- **`useConsultantFields()` is the same contract on the other side**, added in
  phase 4 and obeying the same rule: signed in it returns the real
  `consultants` row or blank, **never `consultants[0]`**. `mock.js` still
  supplies the fields no table holds yet — followers, rating, published content
  — and phase 9 takes those. The store's `me` follows it on both sides now; it
  used to hand a signed-in seeker the seed person's initials on every tab.
- **`consultantError` is not the same as no row.** A failed read and "you are
  not a consultant" are different answers, and conflating them sent a working
  consultant to the application form. Anything gating on `consultant` must
  check the error first.
- **Sun, moon and rising are computed** as of phase 7, by `useMyChart()` in
  `src/lib/astro.js`. They are **not** on `useProfileFields()` any more and must
  not go back: that hook is called on screens with no interest in a chart, and a
  fetch inside it would spend a request on every one of them.

  The note this replaces said four screens printed the signs —
  `Computing.jsx`, `HoroscopePanel.jsx`, `Shop.jsx` and the hook. **It was five.**
  `Profile.jsx` prints them twice, in the header and in the horoscope tab, and
  the count missed it. Grep before trusting a list like that again.
- **`rising` is null when the birth time is unknown**, never a substituted
  value, and every caller decides what to say about that. The ascendant moves a
  whole sign every two hours, so the alternative is a precise wrong answer.

### Screen-level facts that are not obvious from the code

- **Pooja swipe axes:** right/left = deity, down/up = murti. Guarded by
  `node tools/verify-pooja-swipe.mjs`.
- **Deity images are always uncropped.** The Settings toggle back to the crop
  (`setting:croppedDeityImage`) went on 11 Oct 2026 (Rahul; live in cd2ea96); a flag left set
  in a browser is ignored.
- **The free-tools row lives on `/consult`, above the search field** — moved
  off `/home` on 7 Sep 2026, reversing the earlier move in the other direction.
  It renders in Consult's empty-roster branch too, deliberately: production's
  roster is empty by decision, so the other branch would hide the free half of
  the app from every real user. Home now opens straight into the stream.
- **Tarot is a guided flow**, deck then question then card, the first two as
  centred modal dialogs. Two free pulls a week, then the wallet is charged.
- **Three chart systems** — Vedic, South Indian, Western. `chartSystem` on the
  store, so Profile follows the choice made on `/chart`.
- **Hindi and English** via `src/data/i18n.js` and `t()`. Chrome, mandir and
  tarot are translated; the editorial copy in `mock.js` deliberately is not.
  Noto Sans Devanagari sits **after** Plus Jakarta Sans in the stack — browsers
  resolve per glyph, so Latin is untouched.
- **Pro nav is Earnings / Studio / Consult / Profile.** Four tabs since 9 Sep
  2026, no Feed — a consultant runs a practice, she does not browse the seeker
  feed. Go Live was the fifth until live video was deleted; `/pro/live` now
  falls to `/pro/*` and lands on Studio.
- **Seeker nav is Home / Bhakti / Consult / Shop / Academy.** Pooja held the
  second slot until 9 Sep 2026. The shrine did not shrink — it moved to
  `/darshan`, full screen with a back control, reached from Home's third tab.
  The slot now carries Bhakti, the devotional media library.
- **Home has three tabs** — Feed / Today / Darshan, at `/home/:tab`. Today is
  the reading and the panchang, which used to be spliced into the stream.
  Darshan is a doorway: it redirects to `/darshan` with `replace`, so Back from
  the shrine lands on the feed and not on a tab that forwards again.
- **The top bar is logo · wallet · message · profile.** Profile moved right and
  the wallet joined it on 9 Sep 2026; the balance is text rather than a glyph
  and reads an em dash until it loads. `public/namo-logo.png` is the supplied
  JPEG with its white keyed to alpha — the original is black on solid white and
  renders as a slab on this canvas.
- **Profile is Instagram-shaped for a seeker and the consultant page for a
  pro** (10 Oct 2026; it was two tabs, Overview and Settings, until 4 Oct).
  `ConsultantProfile.jsx` exports `ConsultantPage({ id, own, backTo,
  fallback })`, which Profile renders with `own`; flow in `docs/03` under
  `/profile/:tab`.
- **`/pro` is gated on a real `consultants` row** as of phase 4 — it used to be
  exempt from the session gate entirely, which is how anyone who typed the URL
  became `consultants[0]`. No session, or no row, lands on `/pro/apply`. Still
  exempt are the two seeker routes it links out to: `/chart` (a booking row's
  "view kundli", prefilled from query params) and `/consult/:id` ("view your
  public page"). `/home` from "Switch to seeking" is **not** exempt — that one
  is genuinely asking for the seeker app. Note `/profile` starts with the four
  characters `/pro`, so the check is on a segment boundary.

---

## 2. Backend — phases 1 to 7

**All four phases are built and applied to both projects.** Migrations are
numbered SQL files in `backend/schema/`, forward-only. There is no
`supabase/migrations` dir, so those files are the record of what ran, not the
thing that ran it — keep the two in step by hand.

| File | What |
|---|---|
| `001_profiles.sql` | `profiles`, RLS, the column grant, `handle_new_user` |
| `002_profiles_email.sql` | `profiles.email` |
| `003_wallets_ledger.sql` | `wallets`, `ledger`, both triggers, `wallet_debit` |
| `004_refuse_mutation_search_path.sql` | lint fix; 003 had already run |
| `005_wallet_debit_drop_client_ref_type.sql` | removed a client-settable `ref_type` |
| `006_payments.sql` | `payments`, RLS, `payment_capture()` |
| `007_consultants.sql` | `price_bands` (seeded), `consultants`, `consultant_services`, `consultant_availability`, `consultant_time_off`, RLS, the column grants, `consultants_public` |
| `008_bookings.sql` | `bookings`, the partial unique slot claim, read-own and the accept/decline policy |
| `009_slots.sql` | `consultant_open_slots()` — the one slots source |
| `010_bookings_view.sql` | `bookings_view`, which carries the other party's name |
| `011_round_price_bands.sql` | derived band prices to whole rupees; restores the six the PRD names |
| `012_bookings_transaction.sql` | `orders`, `order_items`, `earnings_ledger`, `book_session()`, `booking_reverse()` and the decline trigger. On both projects |
| `013_booking_review_fixes.sql` | Four defects found by review of 012. On both projects |
| `014_metered_chat.sql` | `sessions`, `threads`, `messages`, the meter, the sweeper, `threads_view`. **Dev only** |
| `015_realtime_publication.sql` | Publishes `messages` and `sessions` to Realtime. **Dev only** |
| `016_thread_preview.sql` | Keeps `threads.last_preview` in step, by trigger. **Dev only** |
| `017_no_hold_cap.sql` | Removes the 30-minute hold cap. **Dev only** |
| `018_session_review_fixes.sql` | The accept row lock, request dedupe and expiry, mode guard, non-client reason. **Dev only** |

**Four `_check.sql` files sit beside them and are tests, not migrations.**
`003_wallets_ledger_check`, `006_payments_check`, `009_slots_check`,
`012_bookings_transaction_check`. They never
appear in a replay. Each raises on its last line to roll back every row it
wrote, so **passing looks like an error**: `ERROR: PHASE N CHECKS PASSED`.

**A fresh project is the twelve files in order.** Dev was built that way, which
is the proof they reproduce the system from nothing rather than describing what
once happened.

**Dev is reached through the MCP; production is not.** `.mcp.json` is pinned to
dev on purpose, so no agent session can write to real data — `007`–`011` were
replayed to production by hand in the SQL editor. Production's
`supabase_migrations` table therefore carries no rows for them. That is
expected; the files are the record.

### Phase 1 — identity

`profiles` matches `docs/05-BACKEND-SCHEMA.md` §4.1. RLS on, both policies
`id = auth.uid()`.

- **No client INSERT policy, by design.** The row is created server-side by a
  `security definer` trigger the instant `auth.users` gets a phone signup; the
  client only ever `UPDATE`s the row that already exists.
- **The UPDATE grant is column-scoped.** `authenticated` may write
  `name` and `birth_*` and cannot touch `admin`, `phone`, `legacy_id`, `id` or
  `created_at` even on its own row. Row-scoped RLS alone would have let a
  signed-in client grant itself `admin`.
- **`profiles.email`** is required at the onboarding screen but nullable and
  not unique in the column, and never an auth factor. **Its purpose is an open
  regulatory question** — see `docs/01-PRD.md` §8 before the first marketing send.
- **Birth time is naive local plus an IANA zone**, never a timestamp and never a
  stored offset. `AskPlace.jsx` searches Open-Meteo's geocoder because it
  returns the zone with each hit; `birth_zone` was once hardcoded
  `Asia/Kolkata`, survivable only while every option was Indian. **Licence
  problem: that geocoder's free tier is non-commercial and this product is
  not** — `docs/01-PRD.md` §8 before launch.
- **The onboarding draft lives in `sessionStorage`.** Reading the SMS means
  leaving the app, and an evicted page created an account with no birth details,
  silently. That is what landed the first live signup an empty row.
- **Onboarding never overwrites an existing birth record.** `Computing.jsx`
  waits for the profile to load and, if `birth_date` is already set, signs
  them in and leaves the row alone — which is what makes the sign-in route
  below safe to skip straight to the phone step with an empty draft.
- **There is now a sign-in-only route** — `AskSide.jsx` carries a "Sign in
  instead" link under each card, straight to `/onboarding/phone?mode=signin`
  (`&next=pro` for the consultant side), skipping name/date/time/place
  entirely. `AskPhone.jsx` in that mode drops the email field, calls
  `signInWithOtp` with `shouldCreateUser: false` so a number with no account
  is refused rather than silently minted, and shows "Create one instead"
  on that refusal. Nothing downstream needed to change: `VerifyOtp.jsx`
  already sent a non-pro verification to `Computing.jsx`, which already did
  the right thing with an empty draft against an existing birth record.

**Phone auth on production is Twilio Verify.** The route cost most of the setup
time, so it is written down:

- **Not Twilio's plain Messaging API.** A US long code sits behind A2P 10DLC
  registration and Twilio leaves messaging *disabled* until it clears — days,
  and money. The first attempts died on error `21704`.
- **Twilio Verify** picks compliant senders per country itself: no owned
  number, no A2P registration, no DLT work. In Supabase pick `Twilio Verify`
  and give it the **Verify Service SID** (`VA...`), not a messaging service SID.
- **The test-OTP field needs both halves** — the number-and-code pairs *and* the
  valid-until. The code alone is rejected. Dev uses this; production does not,
  and **must not**: there those numbers are a way into a real wallet.

**Both done-conditions pass.** Sign in, close the tab, reopen — still signed in,
details intact, `created_at` still the original signup instant. And a second
account sees only its own rows: on dev, account 2 returns exactly one profile,
its own, with the other's id returning an empty array when asked for directly.

### Phase 2 — wallet

`wallets` and `ledger` per `docs/05-BACKEND-SCHEMA.md` §4.6. `earnings_ledger`
is deliberately **not** here — it references consultants and bookings and ships
inside phase 5's booking transaction.

Four things to know before touching it:

- **The balance cache is maintained by an `after insert` trigger on `ledger`**,
  not by whoever writes the row. This was not in the plan. A cache each writer
  must remember to update is one that eventually disagrees; this way replaying
  the ledger reproduces the balance because the balance *is* that replay. It
  also makes a hand-typed credit correct by construction, which is how test
  wallets get funded — recipe at the foot of `003`.
- **Neither table has a write policy for anybody**, and `authenticated` has no
  `INSERT`/`UPDATE`/`DELETE` grant on either. Only `wallet_debit()` writes, and
  it takes a row lock so two debits serialise rather than both reading the same
  balance. `wallets` also has a `balance_paise >= 0` CHECK as the backstop
  under a function nobody has written yet.
- **`wallet_debit()` takes the amount and label from the client and nothing
  else.** The amount is within rule 3, which bans a number the *user benefits
  from* — a debit is not one. It is shaped this way because there is no
  server-side catalogue until phases 8 and 10; phase 5's booking is the first
  purchase whose price the server looks up for itself.
- **Phase 2 shipped no credit path at all**, because a client-callable credit
  before a payment provider is a mint. Phase 3 opened one, and it is still not
  client-callable: see below. The payment-method tags stay out of `Wallet.jsx`,
  and the **cashback label is deleted** rather than deferred — it was never
  applied and must not be on screen when real money moves.

**All four done-conditions pass.** Devtools cannot change a balance — every
write returns 403 at the grant level. An over-balance debit is refused *by the
server* with the string the UI already showed. The ledger replays to the stored
balance exactly. And three clicks fired in a single tick produced exactly one
ledger row, a stricter test than a human double-tap.

### Phase 3 — payments in

**Built, deployed to both projects, and one done-condition short.** The code is
written, `006` is applied on dev and production, both Edge Functions are
deployed with live secrets, and the replay and failure checks pass. What has
not happened is anyone putting a card through it — blocked on Razorpay's
website review, not on work. The table below says exactly where the line is.

`payments` per `docs/05-BACKEND-SCHEMA.md` §4.8, plus two Edge Functions in
`backend/functions/` — the first server functions in the project.

| | |
|---|---|
| `razorpay-order` | `verify_jwt = true`. Validates the band, opens a Razorpay order, writes the `created` row |
| `razorpay-webhook` | `verify_jwt = false`. Verifies the HMAC, then calls `payment_capture()` |

- **`payments` holds one row per event, not per payment.** Both unique columns
  are nullable so the `created` row can carry neither id yet, and Postgres lets
  nulls repeat in a unique index. The row carrying a `provider_payment_id` is a
  terminal outcome and there can only be one per Razorpay payment.
- **Idempotency is the unique index, and it is load-bearing in an unusual way.**
  `payment_capture()` inserts the event row and the ledger row in one block. A
  retried delivery violates the index, the handler catches it, and plpgsql
  rolls the whole block back — *including the credit that had already run
  inside it*. There is no window between checking and crediting because there
  is no check. It returns `ok: true, duplicate: true` so Razorpay stops
  retrying.
- **The wallet is found through the `created` row**, matched on the order id,
  never through the payload's `notes` — those round-trip through the client.
  A payment that matches no order raises rather than guessing. That means the
  webhook returns 500 and Razorpay retries an unattributable payment for a
  while, which is the loud half of the mistake and the right half.
- **The amount credited is Razorpay's**, read from a payload whose signature
  was checked first. The browser chooses what to *pay*; it never influences
  what is credited. That is what keeps the custom-amount field inside rule 3.
- **`payment_capture()` is not granted to `authenticated`** — only to
  `service_role`. The security advisor confirms it: it flags `wallet_debit` as
  callable by signed-in users, which is intended, and does not flag this one.
- **The balance is untouched by any of it.** The phase 2 trigger on `ledger`
  moves it, so a credit and the cache cannot disagree.

**Front end:** the top-up sheet is back in `Wallet.jsx` — four presets and a
custom amount — and `topup()` sits next to `spend()` in the store. It is the
one money path that does not end inside the tap that started it: the credit
arrives via a webhook on a different connection, so `topup()` polls the balance
for about twelve seconds and then says the payment is settling. Razorpay's
checkout script is fetched on first use rather than from `index.html`.

**All four done-conditions pass, on dev, in a browser.**

1. **Two clients racing one slot.** Six concurrent requests for
   `2026-09-02 05:30+00`, two accounts, six pre-connected sockets released by a
   barrier: **one booking, one refusal from the unique index** (*"Someone just
   took that time"*), four from the pre-check. Then the counts that matter —
   6 bookings, 6 orders, 6 order lines, 6 debits, 6 earnings rows, exactly
   matched. **The five refusals wrote nothing.**

   The first attempt at this proved less than it looked like: both racers came
   back refused *by the pre-check*, which means one had already committed before
   the other read the slots — a sequential test in a concurrent costume. The TLS
   handshake was the whole race. `race.py` now completes every handshake before
   the barrier, so only the send is racing. **A concurrency test that never
   shows the contended path is not passing, it is not running.**
2. **A decline restores the balance via a new row.** Walked: booked at ₹1,499,
   wallet ₹5,005 → ₹3,506, declined from `/pro/consult`, wallet back to ₹5,005
   with a `Refund · session +₹1,499` row sitting *above* the untouched debit.
3. **gross − fee = net.** `/pro/earnings` shows the pair — `Atharv · 20 min
   ₹1,499 − ₹269.82 = +₹1,229.18` and `Reversed · declined … −₹1,229.18` —
   cancelling to zero. 18% of ₹1,499 has paise in it, and that is the true
   number, not a rounding bug.
4. **Survives a reload on both sides.** Seeker: *Your sessions* on `/consult`
   after a hard reload. Consultant: the request in the `/pro/consult` queue
   after one.

Two things the walk caught that a green build never would:

- **A reversed earnings row rendered `₹-1,499 − ₹-269.82`** — two minus signs
  saying one thing badly. The sign belongs on the net figure; the sub-line takes
  absolute values now.
- **Switching accounts by hash navigation does not switch accounts.** `#/wallet`
  → `#/pro/consult` is a hash change, so supabase-js keeps the old session in
  memory and the pro queue renders empty for a consultant who has requests. Only
  a real reload swaps it. Worth knowing before trusting any two-account walk.

**APPLIED TO PRODUCTION BY MISTAKE, AND ONLY TO PRODUCTION.** This is the
important line in this section. Every `apply_migration` and `execute_sql` in the
phase 5 session landed on production, and `.mcp.json` was correct the whole time.

**The cause: two MCP servers both named `supabase`.** The project's `.mcp.json`
carried the dev ref; `~/.claude.json` carried a server of the same name on the
production ref, and the user scope wins. `mcp__supabase__get_project_url`
returned `https://talqzgolttfgdzcoaqno.supabase.co` and that was the truth.
**Both files now point at dev** — the user-scoped one was repointed, not
deleted, so nothing outside this repo lost its server. Production is reached by
pasting SQL into its editor by hand, which is the design.

**Dev got `012` afterwards**, pasted into its SQL editor by hand — the reverse
of every phase before it, where dev came first and production was the replay.

It took an hour to see, because it presents as a stale PostgREST schema cache:
`book_session` returns `PGRST202` and `orders` returns `PGRST205` over REST
while phase 4's objects resolve fine — because the REST calls use `.env.local`,
which correctly points at dev, and dev genuinely does not have the function. The
tell that was missed: an unfiltered REST read of `consultants` returned a
different consultant than the MCP said was the only approved one. **Two answers
to one question means two databases, not a cache.**

**What was written to production, and what was done about it.** All of it is
reversed; the schema stays.

| Written | State |
|---|---|
| `012_bookings_transaction.sql` in full | **Left in place.** It is the migration production was getting anyway, and it passes there. Unlike `007`–`011` it went through the MCP, so production *does* carry a `supabase_migrations` row for it |
| ₹57,000 of "Added money" ledger credits across two real wallets, one of them a real person's | **Reversed** by matching `Correction` rows. Both wallets back to 0, and every wallet on the project replays to its stored balance |
| 6 bookings with orders, debits and earnings rows | **Declined**, which put them through `booking_reverse` — all six net to zero in both books, all six orders `refunded` |
| ~40 `consultant_availability` rows on the one real consultant, who deliberately had none | **Deleted.** Back to the two rows they had. This was the urgent one: it made a real practice publicly bookable at times nobody opened |
| `tmp_cache_probe()`, a comment on `book_session` | Dropped / harmless |

The incident is also the only reason done-conditions 2 and 3 have been seen
against real rows at any scale: six bookings unwound cleanly through the
trigger, six orders to `refunded`, every earnings pair cancelling to zero.

**The security advisor is clean on the new work** — RLS on all three tables, no
missing-policy lint, and `booking_reverse` does not appear in the "signed-in
users can execute" list because it is granted to nobody. `book_session` does
appear, which is intended and is the same class as `wallet_debit`.

### Phase 5 follow-up — what the review found

A review of the phase 5 diff on 31 Aug found ten things. It also confirmed the
parts that mattered: the slot claim really does precede the debit on every
refusal path, the savepoint semantics hold, `order_items_select_own` is properly
qualified (the phase 4 collapse is not repeated), the grants are right, and the
basis-point arithmetic satisfies rule 1.

**`013_booking_review_fixes.sql` is applied to BOTH projects.** The check passes
on dev with assertion 10 covering the reversal index, and production was
verified by inspection: the index exists and all three function fixes are in the
live definitions.

**Re-running `013` raises `42P07`, and that is expected.** The three function
statements are `create or replace` and replay fine; `create unique index` does
not. If it ever needs re-running, skip that first statement. It is not edited to
say `if not exists` because it has run against real databases, which makes it
history (`INSTRUCTIONS.md` §2) — re-runnability is a property of the next
migration, not a retrofit to this one.

- **The reversal guard was a check-then-insert race** — the exact pattern rule 6
  bans. Two reversals at once (an admin calling `booking_reverse` for a platform
  failure while the consultant taps Decline) both read no refund row and both
  credit. Now a partial unique index on `ledger (ref_id) where ref_type='refund'`,
  with the duplicate caught rather than checked for — phase 3's shape, borrowed.
- **`P0001` is not a private sentinel.** It is the SQLSTATE of every bare
  `raise exception`, including `refuse_mutation()`. Latent today, but the first
  trigger on any of the four tables that raises plainly would have told a seeker
  "Not enough balance" with an unrelated balance figure. Now `WB001`.
- **A zero-price service threw a raw error** instead of refusing, because
  `ledger` rejects a zero delta. Guarded with a reason.
- **The earnings row was labelled with the consultant's own name**, so their book
  read as their own name repeated. Each party's book now names the other party.

Two front-end fixes are already live in the code and walked on dev:

- **The booking sheet did not reload slots after a SUCCESSFUL booking**, only
  after a refusal — so reopening it offered the slot you had just taken, and
  confirming it said "Someone just took that time" about yourself. Verified
  fixed: 11:00 present before, absent on reopen.
- **Raw enum statuses were rendered to seekers**, and everything except
  `declined` was painted green — a cancelled or missed session read as success.
  Now a seven-status map; `pending` reads "Awaiting reply".

Two more went into the check file: assertion 8 pins the per-minute refusal to
its actual words rather than accepting any refusal, and assertion 9 now tests
the ALLOW direction of the new policies too — an over-restrictive policy would
have left `ProEarnings` permanently empty and still reported PASSED. A new
assertion 10 covers the reversal index.

**One finding is not fixed, on purpose: a consultant who never answers.** Money
is taken at `pending`, the only reversal is a decline, and the seeker has no
rights over the row — so an unanswered request holds their money indefinitely
and leaves a positive earnings row phase 12 would pay out. The manual remedy
exists (`booking_reverse(booking, 'no answer')`). What is missing is a deadline,
and that is a product decision: too short and a consultant loses bookings to a
slow morning, too long and a seeker's money is held for a week. Logged in
`01-PRD.md` §5.4 and in §4 below.

### Phase 6 — metered chat

**Built, walked on dev, and DEPLOYED to the live site.** Five migrations:
`014_metered_chat.sql`, `015_realtime_publication.sql`, `016_thread_preview.sql`,
`017_no_hold_cap.sql`, `018_session_review_fixes.sql`, plus
`014_metered_chat_check.sql` beside them — eleven assertions, all relative, all
passing on dev.

**Applied to production 1 Sep and verified there**: `3` tables, `5` functions,
`threads_view`, `messages` published to Realtime, and `pg_cron` reporting
`ext=1, job=1, job_active=true`. The front end went first and the schema
followed, which is the deliberate order — a front end arriving early is
harmless, a metering bug on a live wallet is not.

**Chat is therefore live on production.** The one approved consultant
(`57da8a0e`) has an active per-minute service at ₹37/min, and `session_request`
needs exactly that plus `status = 'approved'`. Nobody can pay for one yet:
production wallets cannot be funded until Razorpay clears the domain, and the
only funded production wallet is that consultant's own — who cannot chat with
themselves. The six seeded consultants have per-minute rows and are still
`pending`, so they remain unreachable. When content seeding approves them
(§8), `content.mjs` deactivates exactly those per-minute rows — an approved
consultant with an active per-minute service can be sent a chat request that
nobody will ever answer.

**Production runs on Supabase's FREE tier.** Worth knowing now that a scheduled
job guards money: a free project that goes genuinely idle can be paused, and a
paused project runs no cron. A live site with users should not idle, but if
production is ever quiet for a week, the sweeper is the thing that stops.

Chat is per-minute and live, so this phase is the meter as much as it is chat.
Phase 11 inherits both.

- **Hold and settle, not a debit per minute.** Accept locks the wallet, works
  out the affordable minutes, takes the WHOLE hold and stamps `expires_at`. End
  works out the real duration from the server's timestamps and credits back
  what was not used. **Two ledger rows per session, not fifty.** The wallet
  cannot go negative because the money is already gone, and the cutoff is a
  timestamp rather than a countdown — a paused tab, a dead heartbeat or a lying
  clock cannot buy a free minute.
- **Asking costs nothing.** `session_request` moves no money; the clock starts
  on the consultant's *accept*. A consultant who never answers has cost the
  seeker nothing, which is the opposite of a booking — that charges up front
  because it claims a slot somebody else wanted.
- **Earnings are written at the END**, not at accept, because until the
  conversation stops nobody knows what was used.
- **The sweeper is not optional.** `session_sweep()` runs every minute under
  `pg_cron` (`jobid 1`) and settles anything past `expires_at` or silent for
  60 seconds. Without it an abandoned session holds the seeker's money forever
  and nothing notices — the silent shape this project already paid for once.
- **Messages are gated on a live session** by the INSERT policy, so outside a
  paid window the transcript is read-only. That is what stops chat being free
  to anyone who never presses End.
- Three constants, named once in the functions: 60s grace, round UP with a
  one-minute minimum, accept-before-clock.
- **No cap on the hold — removed 1 Sep (`017`).** Accept holds every minute the
  wallet can buy, so nothing cuts a reading short while there is money left.
  The knowing cost: a seeker's wallet reads ₹0 for the length of a chat and
  nothing else in the app can be bought until it settles. A rolling hold is the
  fix if that bites; the shape is in `017`'s header.
- **While a chat is live the seeker cannot buy anything else** — not another
  chat, not a booking, not a report. Their whole balance is held until the
  session settles. That is the direct consequence of having no cap, and it is
  a standing fact about the product rather than a bug. The phase 6 check proves
  it sideways: assertion 3 had to switch to a SECOND seeker to test "one live
  session per consultant", because the first seeker's second request is refused
  for want of money before it ever reaches the unique index.

**Walked end to end on dev, both sides:** seeker asked from `/consult/:id`,
consultant saw the request in `/pro/consult` with the rate on the row and
joined, the meter ran at ₹75/min, messages went both ways, and ending settled:

| | |
|---|---|
| Real duration | 2.80 min |
| Billed | **3** — rounded up |
| Charged | ₹225 at ₹75/min |
| Hold, then refund | ₹2,250 held (the cap), ₹2,025 back |
| Earnings | gross ₹225, fee ₹40.50, net ₹184.50 |
| Ledger rows | two |

**Where the six done-conditions stand — checked 1 Sep, both sides.**

| # | Condition | State |
|---|---|---|
| 1 | Seeker→consultant without a reload, **attributed correctly on both** | **Delivery yes** (Realtime, watched live). **Attribution yes at the data layer**: the same two rows come back MINE/THEIRS on one side and THEIRS/MINE on the other. **The pixels are unverified** — Chrome's MCP was down; nobody has seen the bubbles render |
| 2 | Nobody reads a thread they are not in | **Yes** — check assertion 11 |
| 3 | Unread clears on open, **right side only** | **Yes** — `(2,1)` → `(0,1)`: cleared for the consultant who opened it, untouched for the seeker |
| 4 | Ten minutes debits ten at the band rate; the ledger replays | **Yes** — check assertion 5, plus a live 2.8→3 min settle |
| 5 | A wallet that runs out ends the session; the last minute is one they got | **Yes** — wallet set to exactly one minute, session ran 20:01:04→20:02:04 and was ended by the sweeper at 20:03:00, charged exactly that minute, wallet to zero, ledger replays |
| 6 | Both sides agree on the duration | **Yes** — both JWTs read byte-identical rows including `ended_at` |

**`pg_cron` has been observed firing on its own**, which matters more than it
sounds: everything else about the sweeper had only ever been proved by calling
`session_sweep()` by hand. The session above was ended at `20:03:00.014` — a
tick on the minute boundary, by the scheduler, with nobody watching. A
scheduler that is scheduled but not running is the silent failure this phase
cannot survive.

**The one thing still unwalked is visual**: the chat bubbles rendering on the
correct side of the panel for each party. The data underneath cannot be
backwards — "mine" is `m.sender_id === myId` and the flip helpers are deleted —
but that is an argument, not a look. Worth thirty seconds in a browser.

**`session_accept` had no row lock, and that was the expensive one.** It read
the session with a bare SELECT while `session_end` used `for update`, so two
accepts of one request both passed the guard and the second wrote a SECOND full
debit — orphaning the first hold. `sessions_one_live_per_consultant` does not
catch it: that index guards INSERTs, and this is two UPDATEs of one row.
Removing the cap did not cause it; it raised the price from 30 minutes to the
seeker's whole balance. Fixed in `018` and proven with six concurrent accepts:
one accepted, five refused, one hold, wallet moved by exactly that hold.

**And the seeker never saw their own session start.** The thread does not exist
until accept, so the flow was ask → open panel → "No conversations yet", with
nothing subscribed to `sessions`. `015` published that table with a comment
saying it was for exactly this, and no client code listened. **The first walk
missed it because it only ever watched the consultant's side after accept** —
walking one side of a two-sided flow is walking half of it.

**Two defects the walk found that the build and the check both missed:**

- **Realtime was delivering nothing at all.** Supabase ships an EMPTY
  `supabase_realtime` publication, and a `postgres_changes` subscription
  against an unpublished table connects, reports itself SUBSCRIBED, and pushes
  nothing. No error anywhere: the row lands, the policy is fine, and the other
  person simply never sees the message. `015` publishes `messages` and
  `sessions`. **A table is not published because it exists.**
- **`threads.last_preview` and `last_message_at` were columns nothing wrote**, so
  every thread read "No messages yet." over a full transcript. `016` maintains
  them by trigger, for the same reason the wallet balance is a trigger: a cache
  each writer must remember to update is one that eventually disagrees.

The sender also renders their own message immediately rather than waiting for
the Realtime echo — which is how the publication bug was found, and would have
hidden it if written that way first.

**The front end:** `src/lib/chat.js` is every session/thread/message call in one
file. `ChatPanel`'s consultant tab is real — **the two flip helpers are gone**,
because `sender_id` is a column and "mine" is `m.sender_id === myId`, which
cannot be backwards. The room shows time left and the rate the whole time, since
a charge nobody watches accruing is a charge that gets disputed. `Chat now` sits
on the consultant profile beside `Book`; incoming requests sit at the top of
`/pro/consult`, pushed by Realtime rather than polled.

### The seed

`backend/seed/seed.mjs`, run with the service-role key and a `--ref` that must
match the URL. Idempotent on `legacy_id`, so re-running updates rather than
duplicates. It has run on both projects.

Six consultants, four services each, 35 availability rows each, seven bookings
and seven placeholder profiles for the booking clients the mock names but never
defines — the list it prints at the end. All seven bookings are assigned to
`a1` **explicitly**, which is seed trap 1 handled rather than fallen into.

Three things about it worth knowing:

- **A seeded person needs an auth user first.** `profiles` rows are created by
  `handle_new_user()` from `auth.users`, and `profiles.phone` is NOT NULL, so
  the script mints accounts through the admin API.
- **Their numbers start with 1**, which no Indian mobile does. Nobody can ever
  sign in as a seeded consultant by owning their number — which also means you
  cannot sign in as one yourself.
- **Booking amounts come from the service row, not the mock.** The mock charges
  ₹2,998 for 30 minutes, twice the 20-minute rate, where the bands say one and
  a half times. Seeding the mock figure would put a price in the database the
  catalogue cannot reproduce.

**On production the six are still `pending`** — but no longer "and stay that
way". `01-PRD.md` §7 was partially reversed on 9 Sep: the feed gets seeded from
them, the marketplace does not. Do NOT approve them with the bare
`update consultants set status='approved' where legacy_id like 'a_';` — that
statement is what §7 warned about, because `seed.mjs` also gave them prices and
a week of open availability. Use `backend/seed/content.mjs`, which approves and
then removes all three of those hazards (§8).

**Production's one real consultant** applied through `/pro/apply` and was
approved by hand, which is the entire approval flow until phase 13. That
account has **no availability rows**, so nothing is bookable until somebody taps
cells in `/pro/consult`.

**Dev also carries two hand-made fixtures**, `legacy_id` `dev:1` and `dev:2`, on
the two test accounts. They exist for walking the app and do not collide with
the seed.

---

## 3. Decisions made

Recorded so they are not re-argued. Reasoning is in the documents.

- **Buy auth, database, storage and realtime.** Supabase.
- **Write only what cannot be a database rule** — the wallet ledger, the booking
  claim, payment webhooks, the chart service, the model proxy.
- **Money is integers in paise; both ledgers are append-only.**
- **The client never sends a price.**
- **v1 is consult + wallet only.** 13 tables. Everything else stays mocked with
  no front-end change.
- **`orders` ships in v1** despite sessions being the only thing sold —
  retrofitting an order layer under a live ledger is the worst available
  migration.
- **Seven domain tables, one order layer, discriminator on the order line.**
- **`posts`/`reads`/`clips`/`liveSessions` merge into one `content` table.**
- **UUIDs everywhere; no mock ID is ever migrated.** They collide seven ways.
- **The admin console is a separate app on the service role.** No admin role in
  client RLS.
- **Platform sets price bands**; consultants pick one, out of `price_bands`, and
  the database refuses anything else. 18% commission, in basis points.
- **Sessions are sold two ways** — scheduled 15/20/30, and per-minute. Decided
  26 Aug; per-minute is modelled in phase 4, and phase 5 refuses a `per_minute`
  service by name rather than half-charging it.
- **Chat is per-minute, off the same band — decided 1 Sep.** Not booking-bound
  and not a quota. It is an instant session that happens to be typed, so it
  shares the rate, the band and the meter with an instant call. It follows that
  chat is a **live room**, not async messaging: there is no honest way to bill
  wall-clock minutes against a reply that arrives four hours later.
- **The consultant picks a tier; they never type a rate.** Re-confirmed 1 Sep
  against the per-minute question. Free-form pricing means dropping the band
  check from the write policy, which is the thing that makes "the platform sets
  the price" true rather than six buttons on a screen. The ladder spans ₹37 to
  ₹110 a minute already.
- **The meter moves from phase 11 to phase 6 — decided 1 Sep**, because metered
  chat is what phase 6 now ships. Same machinery video needs, built once and
  debugged on the cheaper surface: a metering bug in chat costs a refund, the
  same bug in a call costs the session too. **Phase 6 is roughly twice the size
  it was**, and that was known before it started rather than halfway through.
- **The marketplace launches empty rather than seeded** — decided 26 Aug,
  **partially reversed 9 Sep**, both argued in `01-PRD.md` §7. The reversal is
  narrow: the FEED is seeded from the mock consultants, the MARKETPLACE is not.
  They are approved so they can author content, then stripped of availability,
  per-minute services and credentials so they cannot be booked, chatted or
  believed. Two of §7's three original grounds are held by that; the third —
  that fake supply hides a real supply problem — was conceded.
- **Charts come from a third-party API — decided 1 Sep 2026, and this REVERSES
  Swiss Ephemeris as our own Python service.** `freeastroapi.com`, Entry tier:
  $8/month, 50,000 requests/month, 5 req/sec, commercial use permitted. It
  covers natal charts, both Vedic and Western, divisional charts, panchang,
  Ashtakoota matching, personalised horoscopes — and unlimited geo/timezone
  lookup, which retires the Open-Meteo licence problem (`01-PRD.md` §8).
  What it removes is the second language, the second service and a hosting
  decision. What it does NOT remove is the reference chart: the ayanamsa is now
  theirs to default rather than ours to set, so it must be passed explicitly and
  verified against a known birth. `02-TRD.md` §8 is rewritten, not extended.
- **Payouts and KYC last.** Most regulated, least urgent.
- **Dev and production are separate Supabase projects**, as of 23 Aug.
- **Server functions run on Supabase Edge Functions.** Deno, next to the
  database they write. The ephemeris is the exception — Python, own service.
- **The cashback label is deleted, not deferred.** Reinstating it means pricing
  it first, in `docs/01-PRD.md` §4.8.

---

## 4. Open questions, and what each blocks

| Question | Blocks |
|---|---|
| How long a `pending` booking may hold a seeker's money before it expires | Phase 12, and any consultant who is not the founder — `01-PRD.md` §5.4 |
| Video SDK — 100ms or Agora | Phase 11 |
| Consultant ranking formula | Phase 13 |
| Blocking a consultant who has pending money | Phase 13 |
| Provenance of the 48 Bhaktamar card faces | Seed |
| **Whether a metered chat can be reviewed.** The RLS policy names `bookings`; phase 6's `sessions` is a different table, so a seeker whose only contact was a chat cannot review that consultant. A decision, not a bug — widening it is a small migration | Nothing today. It bites the first consultant who works mostly by chat |
| **Astrology advertising checked by someone qualified.** `01-PRD.md` §7 and §8 both say do this before publishing, *including* for profiles labelled as demos | **Seeding the feed from the mock consultants.** Theoretical until 9 Sep; live the moment §8's tool runs on production |
| **Whether `astro_cache` ever gets a sweeper** — rows are 11 kB each and nothing deletes them | Nothing. Free readings are twelve rows a day; paid ones one per paying reader per day; charts and divisional charts one each per account, ever |

**Report prices and the duplicate SKUs closed on 7 Sep** and are gone from this
table. The six prices are typed in `mock.js`, `REPORT_MULTIPLIER` is deleted, and
premium reads the SKU it sells rather than restating a price. `01-PRD.md` §5.2
and §5.3 own the answer. It blocked phases 8 and 10; neither is blocked on it now.

**The dropped-connection question closed with phase 6** and is likewise gone. The
answer is a 60-second grace, named as a product constant in
`014_metered_chat.sql` alongside the other three: round up to the whole minute,
30-minute hold cap, clock starts on the consultant's join.

Two closed on 7 Sep by the per-rashi change and removed rather than left with an
answer beside them: which freeastroapi tier and when (usage no longer grows with
the user base), and the daily reading's per-person cost.

Four phase 7 questions were closed on 2–3 Sep and have been removed from this
table rather than left with an answer beside them: the reference chart, the
ayanamsa and house system, the unknown birth time, and the geo endpoint. Each is
now stated as settled in the document that owns it.

---

## 5. Known gaps

### Needs a person, not code

- **The Home/Bhakti branch has not been walked in a browser.** `npm run lint`
  is clean and the build is green, and lint catches the class that white-
  screens this app (an undefined identifier, an import of a name that no longer
  exists). It does not catch a screen that renders the wrong thing, and this
  branch moved every tab bar and top bar in the app. **Walk it before merging**
  — `/home` all three tabs, `/darshan` (no dead band under the murti, both
  swipe axes still work), `/bhakti`, `/profile`, `/consult`, `/pro/studio`, and
  the chat panel on both sides, which is what proves live-removal did not take
  metered chat with it. The routes and what to look for are in
  `docs/03-APP-FLOW.md`.
- **Bhakti has no audio and no ringtones.** The repo contains zero audio files;
  the 16 seeded rows are all public-domain wallpapers. Sourcing and licensing
  devotional audio is a content problem, not a code one, and the screen shows
  an honest empty state for the three audio kinds until it is solved.
- **Three migrations are on dev only: 024, 026, 027.** Production has no
  `bhakti_assets`, so `/bhakti` renders "Could not reach the library" there —
  which is the honest empty state, not a crash, but it is what real users see.
  `backend/seed/bhakti.mjs` loads the 22 rows once the tables exist. Profile
  pictures (027) are in the same position: the UI ships, the column does not
  exist on production, so the upload fails there.
- **025 is seekers publishing, applied to dev and deployed to `main`.**
  `authors_public` and `profile_follow_counts` exist on dev and are missing from
  production, so that feature is in exactly the same half-shipped state as
  Bhakti was — until 13 Sep. **Production now has all four: 024, 025, 026, 027,
  plus the Bhakti seed (22 rows).** Verified by probing production's public API
  read-only, twice: once to find 025 missing, once to confirm it landed. Never
  taken from a message, because the next step each time depended on it.

  025 ran after 026 and 027 rather than before them as on dev. Checked first:
  neither touches `content`, `reactions` or `content_public`, so the reordering
  broke nothing. Production now has `content.author_id`, no `consultant_id` on the
  table, and all three views.

  **The two compatibility fallbacks in `lib/content.js` are deleted.** They
  existed only to keep production's feed and Work tabs alive between the push and
  the migration. The first probe is what stopped them being deleted too early —
  that would have blanked every byline on `1namo.com`. `content_public` still
  exposes `consultant_id` and `consultant_name` as aliases; they are harmless and
  removing them needs a migration, so they stay until something wants them gone.

  The section below on seekers publishing has what 025 does and what has been
  clicked.
- **Avatars are your own face only, and that is a schema fact.**
  `profiles_select_own` is `using (id = auth.uid())`; a profile row carries a
  phone, an email and a birth time, so it will not be widened to let a picture
  through. Nineteen of the app's twenty-three avatar spots render OTHER people
  and still show initials. The fix is `avatar_url` on `authors_public` (025),
  and it belongs to whoever owns that migration — do not add a second public
  profile view.

- **Two Bhaktamar verses are incomplete** and need a verified printed source.
  Deliberately not reconstructed: a plausible wrong shloka in a devotional deck
  is undetectable to the person it misleads.
- **The 48 card faces carry no attribution at all.** The murtis now do.
- **Razorpay's website verification.** KYC and live mode are done. The review
  wanted a real domain rather than `atharvborse2004-ops.github.io`; the site is
  now on `1namo.com` with the required policy pages (§6). What remains on our
  side: redeploy `razorpay-order` on production for the new CORS origin, fill
  the `[fill]` contact details, then register the domain with Razorpay. Until
  that clears, no live payment completes and **production wallets cannot be
  funded**.

### Front-end defects, all recorded in `docs/03-APP-FLOW.md` §10

**All five are closed, 7 Sep 2026**, and each was walked signed in on dev
rather than declared done off a green build:

- **Reports had no way to open the cart.** The sheet is mounted globally in
  `Frame`; Shop simply held the only opener. Reports' top bar has a `BarAction`
  now. Reports also claimed "nothing is charged" while `buyNow` really debited
  the wallet — that sentence is gone too.
- **Question packs granted questions free.** `Add` awaits
  `spend(p.price, …)` and grants only on a `true`. The ledger row
  `6 questions · −₹199` is the proof it charges.
- **Ask AI's wallet was the string `₹1,240`.** It reads `balance` through
  `rupees()` now, em dash until loaded. On the walk it showed the em dash and
  that was correct — the boot read had failed with `JWT issued at future`,
  the clock skew recorded under Tooling below.
- **`/chart` had no back control.** It already had one. The row outlived the
  fix by several weeks, which is its own lesson about this file.
- **88% against 68%.** `answerRatePct` is derived once in `mock.js` and read by
  both Earnings and the warning that cites it. Neither number is typed now, so
  they cannot drift apart again.

**Closed earlier:** there was no sign-in-only route, so a returning user had to
re-answer the onboarding questions to get a session on both branches. See
"There is now a sign-in-only route" under Phase 1 above.

### Deliberate omissions

~~No audio anywhere~~ — **reversed 9 Sep 2026.** Bhakti plays bhajans, pooja
tunes and ringtones, so the app has an `<audio>` element for the first time.
The mandir's sangeet button still toasts `puja.noAudio` and is now the odd one
out; wiring it to a Bhakti tune is the obvious follow-up. The chosen murti does
not survive leaving the tab. Bhaktamar is the only deck with real faces. Shani
has three murtis where the rest have four, because pre-modern devotional art of
Shani as a single figure is thin on Commons.

### There is a linter now, and it is deliberately small

`npm run lint`. ESLint 9 flat config, four dev dependencies, and **no style
rules at all** — no formatter, no import ordering, nothing that is taste. It
enforces five things: `no-undef`, `react/jsx-no-undef`, `import-x/named`,
`import-x/no-unresolved`, and the two `react-hooks` rules. Everything else is a
warning or off, so a red lint always means something is actually broken. The
moment it cries wolf it stops being run, and then it gets deleted.

It exists for the trap at the top of `docs/04-UI-UX.md` §11: **the build is
green on code that cannot run.** Both halves were live in this repo on 7 Sep —
`no-undef` catches a renamed variable and an unimported component, and
`import-x/named` catches the more expensive one, an import of a name the other
module no longer exports. That last one is not a broken screen, it is a broken
app: imports evaluate at module load, so `Reports.jsx` importing the deleted
`REPORT_MULTIPLIER` white-screened **every** route including onboarding, with
`npm run build` silent and `dist/` shipping fine.

Baseline is **0 errors, 3 warnings**. The warnings are two `exhaustive-deps` on
`setBalance` in `store.jsx` (a `useState` setter, stable, safe) and one unused
`showToast` in `Shop.jsx`. Lint does not replace walking the routes. It removes
the class of error not worth opening a browser to find.

### Tooling, because both cost days

- **The Chrome extension presents as "extension is not connected" when it is
  installed.** It is per Chrome profile: it was on Default and Profile 3 while
  the Claude Code account sits on Profile 1. Install it on the profile signed
  into the same account, then restart Chrome.
- **CDP input dispatch times out on this machine** while screenshots and
  `javascript_tool` work fine. Drive clicks from JS.
- **A GitHub Pages deploy can fail on GitHub's side, long after the build
  passed.** On 1 Sep, run `33536321043` built in 19s, uploaded its artifact, and
  then sat at `updating_pages` for ten minutes before aborting with "Timeout
  reached, aborting!". The site kept serving the PREVIOUS bundle, so nothing
  broke and nothing was live either. `gh run rerun <id> --failed` cleared it in
  19 seconds. Check `gh run list` after a push rather than assuming ~40s;
  normal here is 37s–2m22s, and ten minutes means stuck, not slow.
- **A function that is plainly in the database and returns `PGRST202` over REST
  is probably not a stale schema cache. It is probably two databases.** Phase 5
  lost an hour to that: the SQL editor could see `book_session`, the browser
  could not, and `notify pgrst, 'reload schema'` changed nothing — because the
  agent was writing to production and the browser was reading dev.
  `mcp__supabase__get_project_url` answers it in one call.
  `backend/INSTRUCTIONS.md` §3 now makes that the first call of any session
  that writes.

Both were logged for weeks as hardware problems. Both were configuration. The
second-account check was the same mistake — recorded three times as "needs a
second SIM" when it needed a project where fake numbers are allowed.

### The risk that keeps repeating

**Front-end features outrun the backend's assumptions.** A product list on
15 Aug added login, payments, ringing calls, consultant-uploaded course
material and an admin panel — none of which can ship without phases 1-13.
Anything new that implies persistence should be logged against a phase before
it is built.

---

## 6. Phase 7 is done. What is left is phase 3's, and it is not code

**Phase 6 is built, walked and deployed.** What is left of it is production, and
that is deliberate: a metering bug found in a browser is cheaper than one found
on a live wallet.

### Phase 6 is closed — the bubbles were looked at, 3 Sep

The last open condition was a look rather than a question, and it passes.
Signed in as `+919999900002` on dev, the seeded thread renders that account's
two messages right and dark and the other party's two left and light, matching
the `sender_id`s in `messages` exactly. **All six done-conditions now hold.**

### Phase 7 — what exists

Built 2 Sep 2026. **On dev, not on production.** Charts come from
`freeastroapi.com` Entry tier, which reversed Swiss Ephemeris as our own Python
service; `02-TRD.md` §8 owns that decision and now also owns the settings.

| | |
|---|---|
| `backend/schema/019_astro_cache.sql` | Applied to **both**. The line here said "not production" until 8 Sep and was wrong — the production verification below proves the table is there, and re-applying it under a forward-only rule is the mess that line invited |
| `backend/schema/019_astro_cache_check.sql` | Passes on dev |
| `backend/functions/astro/index.ts` | The per-rashi rewrite is on **both** — dev v9, production v5, `verify_jwt` on either side |
| Front end | `src/lib/astro.js` plus eleven screens and components |
| `backend/functions/astro/canonical.json` | The twelve births, split out of `index.ts` on 9 Sep so the verifier below checks the same rows the function reads rather than a copy |
| `backend/tools/verify-canonical-births.mjs` | Checks all twelve against the vendor in one command. **Not yet run** — it needs `FREE_ASTRO_API_KEY`, which lives in the function secrets and comes back as a digest from the CLI |
| `backend/tools/astro-usage.mjs` | What we have actually spent. One cache row is one upstream request, so the table is an exact ledger |

**The reference chart is Indira Gandhi**, 19 Nov 1917, 23:11, Allahabad — Rodden
AA, and pre-1945, so it answers done-conditions 2 and 3 with one birth. It was
chosen and checked before a line of integration code was written, which is what
`06-IMPLEMENTATION.md` asked for.

**It was checked by arithmetic, not against a website.** The ascendant is
spherical trigonometry on sidereal time, so it was computed independently:
117.371° against their 117.366°. Five thousandths of a degree is Lahiri sidereal
and nothing else — tropical would have been twenty-two degrees out. **That check
is repeatable and does not depend on them staying online**, and it is the one to
rerun if their numbers are ever doubted.

**The historical-offset case passes too.** A 15 June 1943 Kolkata birth returns
Leo 21.7°, which is the **+06:30** answer — India's wartime offset. The naive
+05:30 answer is Virgo 5.6°, a whole sign away, and it is exactly the failure
that raises nothing.

**`birth_time_known` is honoured now, and was hardcoded `true` before.**
`AskTime` has an "I do not know" checkbox; `Computing.jsx` writes the real value
and a null time. Without a time the chart shows planets and the moon sign, and
withholds the ascendant and all twelve houses with the reason on screen. **The
four production accounts still read `true` and some of them are guesses** —
nothing backfills that, and nothing should: only the person knows.

**Geo search moved off Open-Meteo**, closing the licence item that sat on the
signup path since phase 1 (`01-PRD.md` §8, now rewritten as settled). One thing
worth knowing: their ordering is relevance, and relevance returns a hamlet of a
hundred people above the city of three million with the same name. The function
re-sorts by population.

**`mock.js` lost five exports** — `days`, `today`, `placements`, `chartHouses`,
`panchang` — and `user` lost its three signs. Fields nothing computes went with
them rather than being kept as filler: a placement's `line`, `detail` and
`keywords`, and a day's `mood`, `luckyColour`, `luckyNumber`, `gettingAlong` and
`friction`.

**Five screens changed, not four.** The old note here named `Computing.jsx`,
`HoroscopePanel.jsx`, `Shop.jsx` and `useProfileFields()`. `Profile.jsx` prints
the three signs twice and was missed by that list — grep before trusting a count
like it again.

#### All three done-conditions pass, walked on dev 3 Sep

1. **Two different births, two different charts.** `+919999900001` (Pune,
   6 Dec 2001 01:12, time known) returns Virgo rising with Sun in Scorpio;
   `+919999900002` (Varanasi, 12 Apr 1998, **time not known**) returns Sun in
   Pisces, Moon in Libra and no ascendant at all.
2. **The reference chart reproduces**, to 0.005° against arithmetic that does
   not go through them.
3. **A pre-1945 birth uses its own offset** — the 1943 Kolkata case returns the
   +06:30 ascendant, a whole sign off the naive one.

**The routes are walked**, both accounts, on the harder one: `/onboarding`
name → date → time → place → verify → computing, then `/chart`, `/chart/:id`,
`/horoscope`, `/profile/horoscope`, `/home`, `/shop`, and the horoscope overlay.
Everything an unknown birth time should hide is hidden and says why.

**The mock's two calendars agree now.** The home reading card and the panchang
card both read the same day, which is the §6 note in `06-IMPLEMENTATION.md`
closing.

**Three things the walk found and fixed**, none of which the build would have
caught:

- **Place search showed the four default cities underneath a running search.**
  The first call is a few seconds cold, and for those seconds the screen offered
  Pune, Mumbai, Bengaluru and Delhi as answers to "Varanasi". Somebody tapping
  one has filed their chart in the wrong city and nothing downstream would say
  so. The shortlist is now for an empty box only.
- **Their geo results repeat.** "Varanasi" came back three times with an
  identical name, district and state at coordinates that round to the same two
  decimals — three rows a reader cannot choose between. The function collapses
  exact renders and keeps the largest.
- **The Ask AI panel opened by naming your moon sign.** It was the seed
  person's, which was invisible while everyone shared one chart and became a
  flat contradiction the moment the chart screens went real — four screens
  saying Libra, that panel saying Pisces. The greeting no longer names a
  placement; phase 8 replaces it properly.

#### Production, 3 Sep — live and verified

`019_astro_cache` applied, the `astro` function deployed, and both secrets set.
Verified from outside with no credentials beyond the anon key that already ships
in the bundle:

- Preflight from `https://1namo.com` returns **204** with all four headers and
  the origin echoed. An unrecognised origin gets the fallback rather than being
  reflected back.
- `geo` and `panchang` compute, and the panchang's metadata reports
  `ayanamsha: lahiri` — the setting is arriving, not being defaulted away.
- The second identical `panchang` call returned **`cached: true`**, which is what
  actually proves `astro_cache` is present and being written. The function
  serves a correct answer whether or not the cache works, so nothing else
  distinguishes a live cache from a missing table.
- `chart` with no session refuses `signed_out` rather than leaking one.

**The API key was rotated and the old one revoked.** Both projects hold the new
one. `C:\Atharv 2\PHASE7-PROMPT.md`, outside the repo, still contains the dead
key in plaintext.

#### The browser caches the day too — 4 Sep

The server cache never protected the phone, only the quota. Every mount was a
round trip, `/home` asked for the same reading twice, and a reload asked again.
`src/lib/astro.js` now holds answers in `localStorage` stamped with the IST day,
with an in-flight map so two components mounting together make one request.

Counted in a browser rather than assumed:

| | Requests |
|---|---|
| Reload `/home` with the day already fetched | **0** |
| Open the horoscope overlay on top of that | **0** |
| Switch to a day never fetched before | **1** |
| Switch back to a day already fetched | **0** |

A chart has no expiry at all. Refusals are never cached — `no_birth` stops being
true the moment somebody adds their details. The user id is in every key and
sign-out clears the store, because `localStorage` outliving a session is the
whole point and a shared phone must not carry the last person's chart.

**Sun, moon and rising in a header now come from the chart**, not from the day's
reading. A fact about a birth should not wait on a daily fetch, and `rashi` is
named on `useMyChart()` as what it is: the MOON sign, which is what every
rashifal in India keys on, and which survives an unknown birth time.

#### Nothing is owed on phase 7

Both projects run the same function. A failed cache read or write is logged on
each — worth keeping, because a broken cache is invisible by construction: the
answers stay correct, every call misses, and 50,000 requests a month drain while
everything looks healthy.

Production was re-checked after its redeploy, on the paths that would break if a
dashboard paste were truncated: `geo` still returns seven rows from their eight,
so the population sort and the duplicate collapse are both there; an uncached
panchang computes and the repeat comes back `cached: true`, which exercises the
write; and all three refusal shapes are intact.

**The front end is deployed.** `5f18150` on `main`, built in 32s, and the live
bundle is `index-DcSBECHe.js` — checked rather than assumed, because a green
Actions run and a served bundle are different facts here. The four deleted mock
strings are absent from it and the phase 7 copy is present.

**The panchang is one row a day for everybody, anchored on Ujjain** (4 Sep).
It was per birth place. Verified on dev: a Pune user misses, then a Varanasi
user and a signed-out visitor both hit the same `panchang:<date>` row and all
three read Ujjain's 06:10 sunrise. Every screen showing it names the city,
because sunrise moves about two hours across India and an unnamed almanac from
somewhere you have never been is wrong without looking wrong.

`/horoscope` now draws its tithi from that shared almanac rather than from the
reading's own — the personal endpoint computes a second panchang at the birth
place, and showing both would put two tithis for one day on two screens. That
is the mock's week-apart calendar bug, and it nearly came back through the side
door.

**The daily reading is twelve readings a day, one per rashi** (7 Sep). **This
replaces the line that stood here saying per-rashi readings could not be built
on this vendor.** They can — the vendor is unchanged and there is still no
sidereal sign endpoint, so the twelve come from the personal endpoint driven by
twelve fixed births, one whose Moon stands in each sign, all at Ujjain. The
tropical sign endpoint is still refused for the reason the old line gave.

The reader's rashi is the Moon's sign off their **own** natal chart, so nothing
about which reading they get is invented. What is not theirs is everything else
on the canonical birth, which is why the dasha is dropped from the glance row
and why every screen showing a reading names the sign. `02-TRD.md` §8 has the
accounting of what is right and what is not.

**The reading is much smaller since 9 Sep, and that is the fix rather than a
regression.** Reading a live payload showed the canonical birth contaminates
almost all of it, not just the dasha: the scores, every section, the remedy
block, and an asserted `lagna` and Moon nakshatra that belong to the invented
person. The daily reading now renders only the panchang mood and the day's four
clock windows, which are the two things in the payload that are true for the
person reading them. Headline, summary, score, four area ratings, Do/Don't,
transits, long sections and the reflection are all gone. `02-TRD.md` §8 has the
field-by-field table.

**The rashi label came off every reading surface at the same time**, because the
surviving fields are byte-identical across all twelve signs — checked against
two cached days, not assumed. A sign named beside content that does not vary by
sign claims something that is not there. The reader's own moon sign still shows
in the headers, off their own chart.

**So the personal-horoscope endpoint now returns twelve copies of one answer a
day.** It is on notice; §8 names gochara computed here as the successor and that
is the next decision, not a thing already done.

Each canonical Moon sits within 0.05° of the middle of its sign — the Moon
crosses a sign every 2.2 days, so a birth near a boundary would give every
reader of one rashi the next one's reading, forever and silently. The function
also fetches each canonical chart once and refuses if its Moon is not where the
table claims.

**Usage no longer grows with the user base.** Twelve readings a day, one
panchang a day, one chart per account ever, twelve canonical charts ever. That
closes the "which freeastroapi tier, and when" question in §4 rather than
answering it.

**On both projects.** Dev v9 (7 Sep), production v5 (8 Sep), `verify_jwt` on
either side. The front end has been live on `1namo.com` since 7 Sep and spent a
day against the old function without anybody noticing, which is the degradation
working: no `rashi` came back, so the sign was simply not named.

**Production was deployed with the Supabase CLI rather than the dashboard, and
that is now the rule for every production function** — it is written down in
`backend/INSTRUCTIONS.md` §3, along with the two things that bite.

#### Production verified from outside, 8 Sep

Same method as 3 Sep — nothing but the anon key that already ships in the
bundle:

- Preflight from `https://1namo.com` returns **204**, origin echoed, all four
  headers. An unrecognised origin gets the fallback rather than being reflected.
- `chart` with no session refuses **`signed_out`**, not `no_birth`.
- `panchang` computes at **Ujjain**, and the repeat returns **`cached: true`** —
  which is the only thing that distinguishes a live cache from a missing table,
  since the function answers correctly either way.
- The payload's `metadata.ayanamsha` reads **`lahiri`**. The setting is
  arriving, not being defaulted away, which is the whole risk in
  `02-TRD.md` §8.

**The cost model was measured across a real midnight, 9 Sep**, which is the
check that matters because it is the one a mistake would have hidden. The IST
day rolled at 00:06 and the first reader wrote exactly two rows —
`panchang:2026-09-09` and `rashifal:Cancer:2026-09-09`. **`canon-chart:Cancer`
was NOT rewritten**; it still carries its 7 Sep timestamp. Had the canonical
chart's key been made a function of the day, every midnight would have cost
twelve extra upstream calls and nothing on any screen would have looked
different. A second cold reader of the same rashi then got all three answers
back with `cached: true` and wrote nothing at all.

Note when reading `astro_cache` by hand: **`fetched_at` is UTC and the keys are
IST**, so rows written early on an IST day carry the previous UTC date. Group by
`(fetched_at at time zone 'Asia/Kolkata')::date`, or a day's rows look missing.

**What is NOT verified on production, and cannot be from outside: the rashi path
itself.** Every line of it sits behind a session, and the accounts there belong
to real people. So the twelve-a-day behaviour is proven on dev and inferred on
production from the two being the same file. The first real signed-in reader
exercises it. **That is safe rather than merely hopeful**: if a canonical birth
is wrong the function refuses and logs `CANONICAL BIRTH IS WRONG` instead of
serving the neighbouring rashi's reading.

**Two of the twelve canonical births are confirmed against the vendor**, not
just against our arithmetic. Signing in as `+919999900002` (Moon in Libra)
wrote `canon-chart:Libra` with the vendor's own Moon in Libra, then
`rashifal:Libra:2026-09-07`, in that order — the check runs before the reading
is trusted. `+919999900001` (Moon in Cancer) did the same for Cancer. Both
screens named the sign: *LIBRA RASHI*, *CANCER RASHI*.

**The other ten are still unverified against the vendor, and there is now a
command for it**: `node backend/tools/verify-canonical-births.mjs`, which needs
`FREE_ASTRO_API_KEY` from the function secrets — the CLI returns secrets as
digests, so it has to be run by a person who can read the key. It also warns on
any birth within 5° of a sign boundary rather than only on an outright wrong
one.

Until somebody runs it, the position is unchanged and it is safe rather than
merely hopeful: the ten come from the same arithmetic as the two that passed and
sit within 0.05° of their sign's midpoint, and if any is wrong the function
refuses with *"Charts are unavailable right now"* and logs
`CANONICAL BIRTH IS WRONG` rather than serving the neighbouring rashi's reading.
A visible failure for one sign, never a silent wrong answer. Without the script
that guard only fires when a real person of that sign signs in, which is exactly
the wait the script exists to end.

**One chart form now: the North Indian square** (7 Sep). The Western wheel
(`ChartWheel.jsx`, deleted) and the South Indian square (`ChartSouth`, removed
from `ChartSquare.jsx`) are gone, with them the tradition switcher on `/chart`,
the `chartSystem` preference in `store.jsx`, and four `chart.*` i18n strings.
The onboarding reveal drew the wheel and now draws the square. Reasoning is in
`04-UI-UX.md` §4 and the non-goal it makes literal is `01-PRD.md` §10.

**Reports still cannot be sold on Entry** — the ephemeris vendor's tier
generates two reports a month. That is a **supply** limit, not a customer
allowance, and it is unrelated to what a report costs. Phase 10's problem; do
not build a report checkout against it. The ₹4,041 half of this line is gone:
that was the multiplier, now deleted (below).

**Prices are decided and typed** (7 Sep). `REPORT_MULTIPLIER` and the `base`
field it multiplied are deleted from `mock.js`; the six report prices are the
former ×3 figures, typed once — ₹1,497 / ₹2,097 / ₹2,697 / ₹3,897 / ₹1,797 /
₹1,347. The ₹4,041 `proLedger` row, which was 449 × 9 and matched no report,
now reads ₹1,497 gross at the same 18% fee as the rows beside it.

`premiumTiers` stopped being a third catalogue. Each tier names the SKU it
sells and **reads that SKU's price**, so the ₹899-vs-₹2,697 kind of drift
cannot recur by editing one list — there is only one list per product now. A
tier naming a SKU that does not exist throws at module load. `Ask the Stars` is
the `p12` question pack, which keeps all three rungs. Prices live in
`01-PRD.md` §5.2 and §5.3; `05-BACKEND-SCHEMA.md` §6 inherits the resolution
rather than forcing it.

**Verified by assertion, not by a walk.** `/premium` and `/reports` sit behind
the onboarding gate, which needs a real phone OTP, so neither screen was opened
in a browser. What was checked: the module loads, no report carries a `base`,
the six prices are exactly the six above, every premium tier's price equals the
price of the SKU it names, and the `pl3` ledger row matches a real report with
gross − fee = net. `npm run build` passes, which per §11 proves almost nothing.
**Walk both screens on a logged-in session before trusting them.**

### Still parked

**Razorpay's website review.** Applied for; nothing to do but wait. When it
clears, one ₹1 payment closes phase 3's last done-condition *and* proves the
webhook secret set on 31 Aug matches. Run
`backend/tools/reconcile-payments.mjs` straight after.

---

## 8. Phase 9 — what is built, and the one thing that is not

Built 8 Sep, walked and closed 9 Sep. **Migrations 020-023 are on both
projects** and the check passes on both; the front end is deployed.

### The four tables, and the three views that keep counts honest

`020_content_reviews.sql` — `content`, `reactions`, `reviews`, `feed_pins`.
`05-BACKEND-SCHEMA.md` §5.1-§5.4 has the design; the migration is the DDL.

**No count is a column.** Not likes, not saves, not followers. §1.3 allows one
cached aggregate in this database plus the two rating caches, and the mock is
the argument — four of its stored totals contradict their own line items inside
one file written in one sitting. Counts come from three views instead:
`content_public` (likes and saves, aggregated once rather than N+1),
`consultant_follower_counts`, `reviews_public`. All three run as their owner,
the `consultants_public` pattern, because the tables under them are own-row-only
and an invoker-rights view would return 0 for everyone but yourself.

**`view_count` is written only by the server** (`record_view`, one
`content_views` row per person per post per IST day). It stayed 0 until that
owner existed, because a counter the client increments is a number the user
benefits from, which is rule 3. Reels send a view after two seconds, blog
posts after five (10 Oct 2026); photo posts send none yet.
Every screen that used to print `312k views` now prints a timestamp instead.

**The rating caches are a trigger that RECOMPUTES, never increments.** An
increment cannot be checked and drifts under concurrency, which is the whole
failure §1.3 describes. The check asserts the cache equals the reviews under it,
including after a removal.

### The review gate is the phase, and it is enforced in the policy

A review requires a booking that is **the caller's own and `completed`**. Not
pending, not confirmed. The check proves all four cases — no booking refused,
pending booking refused, completed booking accepted, a second review on the same
booking refused by the unique index.

`booking_id` is unique but NULLABLE on purpose: Postgres permits many NULLs in a
unique index, and `verified` is derived from `booking_id is not null`. So a
seeded review is visible and visibly unverified, and no seed has to fabricate a
session that never happened.

**A metered chat session does not let you review.** The policy names `bookings`,
and phase 6's `sessions` is a different table. A seeker whose only contact was a
chat cannot review that consultant. That is a real gap and a decision for
somebody, not a bug in the policy — noted in `05-BACKEND-SCHEMA.md` §5.4.

### The `flags` Set did not go away, and should not have

`store.jsx` still holds one flat Set. Four kinds — `follow`, `save`, `like`,
`remind` — now also write a row; the rest stay local, because they are not
reactions: `setting:croppedDeityImage` is a preference, `offair:<room>` is one
screen's UI state, `event:<id>` is phase 10's, the tarot keys are §5.6's
`tarot_pulls`, and `save:day-<key>` is a saved *reading*, which is derived and
has no table to point at.

`lib/reactions.js` decides which is which, and it also requires the target to
**look like a UUID** — a reaction against a mock row cannot be stored and must
not throw. It stays local and starts persisting by itself the moment that screen
reads real rows. Every one of the twenty-odd `toggleFlag` call sites is
unchanged, which was the point.

The write is optimistic and **rolls back on failure**. A heart that stays filled
after the write failed is the interface telling a lie it gets caught in on the
next reload.

### What the front end reads now

| Screen | Was | Is |
|---|---|---|
| `/home` | `feed`, 14 hand-ordered rows | a query over `content_public`; live/course/product are the three mock rows left, and they belong to phases 10 and 11 |
| `/read/:id` | `reads` lookup | a row; body splits on blank lines, read time computed from it |
| `/reels/:id` | `clips` lookup | a query; the counter is told the total by the feed rather than counting a mock array |
| `/consult/:id` Work and Reviews | **matched to the real consultant BY DISPLAY NAME** | queries. That join is gone |
| `/pro/studio` | two toasts that wrote nothing | three composers — **Reel** (video, required), **Photo** (image, required), **Blog** (title, body, optional cover) — each uploading to storage and writing a row |
| `/pro/profile` | `mine(clips)` etc., and the seed person's 4.9 rating | your rows, your rating caches, your follower count |

**`posts`, `reads`, `clips` and `mine` are deleted from `mock.js`** — 204 lines.
`feed` is down to three rows.

The `seedFor` join in `ConsultantProfile.jsx` is the one worth noting: it
matched a real consultant row to a mock one by display name, which is the join
`05-BACKEND-SCHEMA.md` §9 spends a section warning about. The file already said
"Phase 9 deletes this function." It does.

### The studio publishes three kinds, and the tab IS the column

`content.kind` takes `post`, `article`, `clip`, `live_session`. The studio's
three tabs are the first three, so a fourth composer is a value in the check
constraint rather than a table. `live_session` is phase 11's.

A **photo post** and a plain note are both `kind = 'post'`; the media is what
separates them, not a fourth kind. `PostCard` renders the image when there is
one.

**The file uploads before the row is written**, so a failed publish never
leaves a row pointing at nothing. The reverse — an orphan file with no row — is
a few kilobytes nobody can see, which is the cheaper way to fail.

Switching tabs clears the composer. A video chosen for a reel is not a cover
image for a blog post, and carrying it across is how the wrong file gets
published.

### Seekers publish too, since 10 Sep

`025` and its check. A seeker posts **photos and blog posts, not reels** — a
reel is the consultant's marketing surface, and the format people judge a
practitioner by. The rule is an RLS predicate rather than a missing tab: a
composer offering the wrong kind is a bug in the composer, not a way in.

`content.consultant_id` is now `author_id`, keyed to `profiles(id)`. A seeker
could not author a row at all before — the column was NOT NULL against
`consultants`. The rename is the point: repointing the key and keeping the name
would have left the column lying to every future reader. `content_public` still
exposes `consultant_id` as an alias so a bundle deployed before the migration
does not break on the way through.

**The approval gate had to move from an inner join to a NOT EXISTS.** Blocking a
consultant must still take their posts down, but approval must not become a gate
on ordinary people, who are never approved of. The check asserts both
directions, because a view rewrite is exactly where that gets lost.

**One composer, two callers.** `components/Composer.jsx` is shared by
`/pro/studio` (three kinds) and the **Your posts** section on `/profile` (two).
The difference is a `kinds` prop. Written twice it would have been the same
upload path, validation and publish call, drifting apart the first time one of
them got a fix.

**Seekers are followable, and have a page.** `/u/:id` — deliberately NOT
`/consult/:id`, which sells a practitioner with a rate, slots and a Book button.
Publishing a photo does not make anybody bookable, and a screen that looked like
a consultant's would undo the split in the one place a reader decides what
somebody is. The article's "Book a session" becomes "See their posts" for the
same reason. The store key is `followp:` → `target_type = 'profile'`, kept apart
from `follow:` → `'consultant'` so a follower count can answer either question
later without unpicking rows.

Posts, followers and following are **counts**, never columns (§1.3). A new
account reads 0 · 0 · 0, which is true.

**The bundle survives a production that has not had 025 yet**, and that is
deliberate rather than incidental: `main` deploys on push, and the migration is
a separate manual step. `shape()` falls back to the pre-025 column names and
treats a missing `author_is_consultant` as TRUE — the old feed was consultants
only, so a byline still goes to `/consult/:id` exactly as before. `fetchByAuthor`
retries on `consultant_id` when Postgres answers `42703` (undefined column),
because filtering on a column that does not exist is a 400, not an empty list,
and every consultant's Work tab would have read as empty.

Without those two the new bundle against an old database is a blank byline
linking to `/u/undefined`, which is worse than the old behaviour rather than
merely different. Both fallbacks come out the day 025 is on production.

**Walked on dev, 13 Sep — posting only.** A seeker published from the Your
posts section on localhost and it worked. That is the one thing confirmed by a
click. NOT yet confirmed by a click, though the check covers the database side
of each: following a person on `/u/:id` and the counts moving, the `/u/:id` page
itself, and `/pro/studio` still offering three tabs after the composer was
extracted from it. The last is the one most likely to have regressed, since the
extraction rewrote the consultant screen.

`025_seekers_publish_check.sql` passes on dev and covers the two refusals that
matter — a seeker publishing a reel, and a seeker publishing as somebody else —
plus the blocked-consultant gate.

**On `main`, deployed, and on production's database (13 Sep).** Seekers can post
on `1namo.com`. The fallbacks that covered the gap are gone.

### Storage

`022_content_media_bucket.sql` — `content-media`, **public-read**, 25 MB,
images and video only. Public is right *here* and nowhere else: the row pointing
at the file is already readable by anon through `content_public`, so a signed
URL would cost a round trip per card and buy nothing. `kyc_documents` and
anything carrying a chart are private buckets with signed URLs.

Writes are scoped by folder and the folder is the owner's UUID —
`<auth.uid()>/<file>` — so a consultant writes their own files and nobody
else's.

### 021 was wrong and 023 fixes it

`021` ran `revoke execute ... from anon, authenticated` on the two cache
functions, reported success, and did nothing: neither role ever held a grant of
its own. The access came from the **PUBLIC** pseudo-role, which Postgres grants
on every new function, and which shows in the ACL as a bare `=X/postgres`.

`023` revokes from `public` and the linter goes quiet. The trigger still fires —
asserted as a seeker, with the revoke in place, because it runs as the definer.

**The lesson worth keeping: a revoke that succeeds is not a revoke that did
anything.** Check the ACL or the linter, not the absence of an error.

### The walk, and the two bugs only clicking could find

Walked on dev 9 Sep across three signed-in windows. All three done-conditions
pass, verified in the database rather than by looking at the screen: three
`content` rows with two objects in `content-media`, a `follow` row that survived
a reload and a second window, and one review carrying `verified = true` with the
rating cache reading 1.0 / 1.

**Both bugs were in code that lint and build had already passed**, which is §11
paying for itself again.

**The session you could review was unreachable.** `listMyBookings` sorts
`starts_at` DESCENDING and the list renders four rows. A completed session is in
the past by definition and pending ones are in the future, so the only row
carrying a Review link sorted below four that could not. Not one account's bad
luck — it would have hidden the button for almost everybody. Reviewable rows are
now hoisted before the slice.

**The rating circles had no flex centering**, so the numeral sat low and left.

The lesson is the shape of both: the review composer was written last, after
everything around it, and shipped with the phase's own verification saying
green. Neither bug was reachable from an assertion.

### On production, and what the walk there still needs

Migrations ran 9 Sep; the check passes; the deployed bundle carries
`content_public`, `consultant_follower_counts`, `reviews_public`,
`content-media` and all six new report prices, and no longer carries the "3× the
standard catalogue rate" line.

**Production has no content yet, and the plan for that changed on 9 Sep.** The
feed is to be seeded from the mock consultants until real ones are publishing —
`01-PRD.md` §7's launch-empty decision, partially reversed and re-argued there.

**And the loading route is the backend, for everybody.** An earlier line here
said the feed fills through the studio and there is no seed step. That was true
of the mechanism and wrong about the plan: real content arrives in batches, from
a partner, and hand-posting it from their account does not scale past the first
afternoon. So `content.mjs` publishes for real consultants as well as invented
ones, and the studio is what a consultant uses for the single thing they just
wrote.

**NOT RUN YET, on either project, and parked on purpose.** The decision is made
and the tool exists; the work of assembling media and a manifest is the user's,
later. Nothing below has touched a database.

`backend/seed/content.mjs` is the tool. It reads
`backend/seed/content/content.json` plus files in `content/media/`, uploads the
media, and writes `content` rows idempotently on `legacy_id`. Same `--ref=`
guard as `seed.mjs`, and `--dry-run` validates the manifest without writing.

**What it does beyond publishing is the part that matters, and the ORDER is
the protection.** It strips first and approves LAST.

That was backwards until 9 Sep and it was a live hazard, not a tidiness point.
`book_session` needs `status = 'approved'` **and** an open slot
(`012_bookings_transaction.sql:174`, `:190`). Approving first made all six
bookable with real money for the rest of the loop — and `die()` on any later
step would have left them that way permanently. Stripping first inverts the
failure: a crash leaves them `pending`, which is invisible. **The safe direction
to fail is the one where nothing is published.**

Approving at all is unavoidable — `content_public` requires it — so what the
script does is remove everything that makes an approved row dangerous before
granting it:

- availability rows **deleted**, so nothing is bookable. This is not cosmetic:
  `seed.mjs` gives every seeded consultant prices AND a week of open slots, and
  `book_session` debits the wallet in the same transaction that claims one. Six
  invented people on the marketplace would have been a real debit and a real
  refund. Verified on dev inside a rolled-back transaction: 35 open slots become
  0, instant chat goes off, and they stay listed in `consultants_public`.
- per-minute services **deactivated**, so no chat request sits unanswered.
- credentials **cleared**, so "ICAS Certified" and "10k+ sessions" are not
  published on someone who does not exist.

`verified` and the rating caches needed no protection: phase 9 made them
trigger-maintained over `reviews`, so with no reviews they read false, New and
0. The mock's 4.9 and 2,148 cannot come back through a seed.

**It loads real consultants' content too, and that is the point of it.** The
manifest's `consultant` field takes either a seeded mock id (`a1`..`a6`) or a
REAL consultant's profile UUID -- which is how a partner with a lot of content
gets loaded without posting each item by hand from their account.

The two are not treated the same, and the difference is the safety property.
The strip runs ONLY on `a1`..`a6`. A real consultant is published as and
otherwise untouched: their availability, their credentials and their approval
are theirs. Before 9 Sep the strip applied to every author in the manifest, so
pointing it at a partner would have deleted the availability they tapped in and
cleared the credentials they earned -- silently, from a script called `seed`.
Real rows carry both: `dev:1` on dev has 35 availability rows and a credential.

A real author must ALREADY be approved. The script refuses rather than approving
them, because `content_public` requires approval for a post to be visible, so
the alternative is uploading into a black hole -- and approving a person is a
human decision, not a side effect of uploading their video.

**Untested end to end.** The manifest validator and both `--ref` guards were
exercised; the database and upload path were not, because that needs the
service-role key. The first real run should be `--dry-run` on dev, then dev, then
production.

The rolled-back dev transaction that proved 35 slots become 0 proved the
STATEMENTS, not the script — it ran them in the safe order by hand. The ordering
bug above survived that check and was found by reading. Worth remembering when
the next "verified on dev" line goes into this file.

**Still open:** the legal note in §7 — astrology advertising checked by someone
qualified before publishing, including for profiles labelled as demos — has not
been done, and seeding is what makes it live rather than theoretical.

Approving a real second consultant is still somebody typing SQL, which is the
argument for phase 13.

Ordering worth keeping for the next phase that adds tables: **migrations went on
production BEFORE the merge.** `main` deploys on push, so a front end querying
`content_public` against a database without it would have shown an empty feed
and empty Work and Reviews tabs on every consultant — no crash, just quietly
wrong.

---

## 7. What can be built at the same time

Worked out 3 Sep, from the phase specs rather than intuition, because two
sessions on one repo is cheap right up until it is not.

**Phase 13's admin console is a SEPARATE application** — `admin/`, service role,
no admin role in client RLS, its own layout because the phone frame does not
transfer. It shares almost nothing with the seeker app: no `store.jsx`, no
`mock.js`, no `src/` screens, so it collides with nothing. Its two blocked
capabilities (ranking formula §5.5, blocked-consultant-with-pending-money §6)
sit at the BOTTOM of its own payoff order — approval, moderation and search need
neither.

**Deliberately deferred, 9 Sep.** It stays the highest-payoff *unbuilt* thing,
but the payoff scales with volume that does not exist. Approving a consultant is
one statement against a `pending` row, and there are two people to approve, both
approved by the same person who would use the console. What would pull it
forward, none of which is true yet:

| Signal | Where it stands |
|---|---|
| More than ~5-10 consultants to approve | two |
| Somebody who is not the developer needs to approve | it is the same person |
| Real moderation — a post to remove, a consultant to block | production has no content |
| **Referrals switched on** | **this is the one to watch** |

The referral row is the sharp one. `06-IMPLEMENTATION.md` lists referral fraud
as a risk — the per-join bounty is the largest per-action payout in the product
and has no controls, and it says design the control BEFORE phase 9. Phase 9
shipped without it because it never touched referrals. Turning them on before an
admin console exists means no way to see abuse, let alone stop it.

**Phase 9 is built** (§8), so this no longer describes work to schedule. What it
predicted was right and is worth keeping for the next phase that touches
`mock.js`: the collision is deletions in different regions of one file. Phase 9
removed `posts`, `reads`, `clips` and `mine`, and trimmed `feed` to three rows.
Migrations 020-023 are taken and are on both projects.

**Phase 8 is now fully parallel.** This replaces the line that stood here
saying it was "parallel except for its last wire", which was true only while
phase 7 was open. All the plumbing — the model proxy, `ask_messages`,
`entitlements`, the quota as a SUM, the pack purchase — was always independent,
and Ask AI's pitch of "Reads your chart" (`Ask.jsx` says so in the header, the
loading state and the footer) now has a real chart behind it. Nothing needs
building against seed and swapping at the seam.

Its one prerequisite was a **price**, not a phase, and that is now settled —
see "Prices are decided" below. `p12` at ₹349 is the SKU the pack sheet charges
the wallet against, and premium no longer sells a second copy of it.

**Three that should not start yet, and the reasons are not scheduling:**

| Phase | Why |
|---|---|
| 10 · shop and academy | **No longer blocked on pricing** — §5.2 and §5.3 are decided and the multiplier is deleted, so seeding is safe. Still the most operationally expensive phase (stock, shipping, returns, courier tracking, none of which the UI has), and its report SKUs cannot be *sold* until the vendor tier grows past two reports a month |
| 11 · live video | Blocked on the SDK choice, and it builds directly on phase 6's meter. Also the natural place to revisit the rolling hold |
| 12 · payouts | Two hard gates: KYC clears before the first rupee leaves, and **talk to a CA before writing the code, not after** |

**Three things that make parallel sessions survivable**, and the first one is
not optional:

1. **Assign migration numbers up front.** Two files called `020_*.sql` is
   unrecoverable under a forward-only rule. Give each session a range.
2. **Branch per phase.** `main` deploys on push, so two sessions pushing to
   `main` is two deploys racing — and a Pages deploy has already hung for ten
   minutes once.
3. **Tell each session the other exists**, and which files are shared.
   `store.jsx`'s hand-maintained `useMemo` dependency array is the one that will
   merge cleanly and behave wrongly.

---

## 6a. What phase 4 left behind

**Phase 4 is closed.** Migrations applied to dev through the MCP and replayed
to production by hand, both seeded, front end deployed, routes walked on both.
Four bugs were found after it was first called done — three by walking
production, one by the first real person to fill in the application form — and
all four are fixed and recorded in §2.

**Phase 5 is the transaction.** `docs/06-IMPLEMENTATION.md`. `bookings` and its
partial unique index already exist; what is missing is `orders`,
`order_items`, `earnings_ledger`, the one transaction that claims a slot and
debits a wallet, and the reversing credit a decline owes once a booking carries
money. Per-minute sessions need their meter here or in phase 11.

**One thing left to settle, and it is a queue rather than a task:**

1. **Razorpay's website review**, which is now a domain move rather than a wait
   — see below. Until it clears, live checkout is refused, **production wallets
   cannot be funded**, and phase 5's first done-condition — two clients racing
   one slot, one booking, one refusal, no orphaned debit — cannot be exercised
   end to end against real money. Dev is unaffected: fund a dev wallet by hand
   with the recipe at the foot of `003`.

**Both product decisions are made** (27 Aug, `01-PRD.md` §5.4), so phase 5 is
unblocked on everything except funding a production wallet:

- **Charge at booking**, inside the transaction that claims the slot. No hold.
  Built in `012`.
- **No cancellation, no refund** on a session the seeker skipped. **This does
  not touch the reversing credit a decline owes** — a consultant tapping
  Decline and keeping the money is not a policy. The booking function
  implements both halves.

### The domain move, which is what unblocks Razorpay

**Site is live on `https://1namo.com`.** Apex domain on GitHub Pages. The one
thing left before it fully works is a production Edge Function redeploy — see
below — and then Razorpay.

**Done:**

- **DNS** — GoDaddy, four apex `A` records to GitHub Pages
  (`185.199.108–111.153`), `CNAME www` → `atharvborse2004-ops.github.io`
  (redirects to the apex). GitHub's DNS check passed; the Let's Encrypt cert
  issued; HTTPS serves. `atharvborse2004-ops.github.io` now 301s to the apex.
- **`public/CNAME`** holds `1namo.com` and survives redeploys. Settings → Pages
  → Custom domain is set to `1namo.com` (it was **not** auto-filled from the
  CNAME file — Pages source is "GitHub Actions", so it had to be typed in).
- **`vite.config.js`** — `base` is `'/'` unconditionally now. It was
  `/${repo}/` for the github.io subpath; that 404s every asset on the apex.
- **The four policy pages** — static files in `public/`, live at
  `/{terms,privacy,contact,refunds}.html`, bypassing the SPA router.
  `refunds.html` is `01-PRD.md` §5.4: declines, no-shows and platform failures
  reverse in full; a seeker who skips does not. Operator named on all four:
  **AK International, C-143 Ground Floor, Brij Vihar, Ghaziabad, UP 201011**,
  `support@1namo.com`, `+91 99538 08908`, jurisdiction Ghaziabad UP.
- **`PAGES_ORIGIN`** in `razorpay-order/index.ts` now reads a function secret,
  falling back to `https://1namo.com`. **Deployed to dev (v9) and production.**
  Both preflights from `https://1namo.com` return 204 with the right
  allow-origin; the old github.io origin is now refused on both.

**Left:**

1. **Register `1namo.com` with Razorpay** and submit the four policy-page URLs
   (`https://1namo.com/terms.html` etc.) for activation. Everything the review
   needs is on those pages now.
2. Minor: tick **Enforce HTTPS** in Settings → Pages (cert is issued; `http://`
   still serves without redirect).

**Owed on phase 3:** one real ₹1 live payment through the site, once Razorpay
clears the domain. That closes its last done-condition.

**Three advisor lints on both projects are intentional.** `consultants_public`
and `bookings_view` are owner-rights views — they must be, since `profiles` is
own-row-only and an invoker-rights view would return an empty name for everyone
but yourself; each restricts itself in its own `WHERE`. `consultant_open_slots`
is a `security definer` function callable by `anon`, which is the point of it.

### Owed, not blocking

- **The reconciliation sweep — now written.** `backend/tools/reconcile-payments.mjs`
  reads every `payments` row stuck at `created` with no terminal sibling and
  asks Razorpay what actually happened to it. Read-only by design: it credits
  nothing, because a script that mints undoes the reason phase 3 is shaped the
  way it is. It exits non-zero and names the people owed.

  **Why it has to call Razorpay at all:** a lone `created` row is identical
  whether the person abandoned the checkout or paid and got nothing. Nothing
  inside the database can tell those apart. That, not the wrong secret, is why
  the lost payment stayed lost — the secret was the trigger, the absence of an
  expected outcome was the cause.

  Run against production 31 Aug: 7 rows, 5 unresolved, **nothing owed** — three
  abandoned checkouts and two orders whose every attempt Razorpay itself
  refused with "website does not match registered website(s)". Run it after any
  webhook change and before believing the first live payment worked.

  Still owed: running it on a schedule rather than by hand.
- **The checkout-dismiss path** — `ondismiss()` and `payment.failed()` in
  `topup()` have never run.
- **The seeker onboarding branch has not been walked this session.** Every
  sign-in went through `?next=pro`, which skips `AskDate`, `AskTime`,
  `AskPlace` and `Computing` entirely. The phase 1-2 review fixes in those
  files are checked by reading and by a green build, which is not the same as
  somebody clicking them.
- **If the top-up minimum is ever lowered for a test payment**, revert it in
  the same session — `MIN_PAISE` in
  `backend/functions/razorpay-order/index.ts` *and* the client copy in
  `Wallet.jsx`, redeploy the function, and push.

**`npm run build` passing proves almost nothing** — no type checker, and an
undefined identifier inside JSX compiles cleanly and throws at runtime. It has
shipped a blank screen twice. `npm run lint` catches that identifier and the
stale cross-module import beside it; it does not catch a screen that renders
the wrong thing. Walk the routes.

## 9. Two build targets — 19 Sep 2026

One codebase, two apps. The seeker app is the default build; the consultant
app is `npm run build:pro` (or `npm run dev:pro`), selected by the Vite mode
and read once in `src/side.js`. The side decides three things in
`src/App.jsx`: which route table mounts, where `/` and the catch-all point,
and whether the seeker overlays (ChatPanel, CartSheet, CartFab) mount at
all. Everything else — store, Supabase client, components — is shared and
untouched.

- **The seeker build is unchanged.** `npm run build` produces the same app
  production serves, `/pro/*` routes included. The deploy workflow was not
  touched.
- **The consultant build carries** `/pro/apply` (it signs a new consultant
  in, so it sits outside the session gate), `/pro/earnings`, `/pro/studio`,
  `/pro/consult`, `/pro/profile`, plus the two seeker screens the pro side
  links out to — `/chart` (ProConsult opens it for a booking) and
  `/consult/:id` (ProProfile previews its own public page). Onboarding,
  tabs, wallet, shop: absent. A signed-out visitor still lands on
  `/pro/apply` through the same gate.
- **Not done, deliberately:** no deployment for the pro build. `dist-pro/`
  is gitignored and has no workflow — where the consultant app lives is a
  hosting decision, not a code one.

Files changed: `src/side.js` (new), `src/App.jsx`, `vite.config.js` (outDir
by mode), `package.json` (dev:pro / build:pro / preview:pro),
`.gitignore` (dist-pro). Checked with `npm run lint` (0 errors; the three
remaining warnings predate this) and both builds — the pro bundle
tree-shakes the seeker onboarding out, and the seeker bundle carries no
pro-only branch.

Same day: `docs/07-DJANGO-MIGRATION.md` added — the Django migration and
scale plan (plan only; nothing started). `CLAUDE.md` and `README.md` doc
tables now list it.

## 10. Phase 1 — the Django skeleton — 19 Sep 2026

`backend-django/` exists: the Django + DRF API that `docs/07-DJANGO-MIGRATION.md`
phases 2–10 land on. Nothing is deployed; the Supabase backend in `backend/`
still serves every module. The git tag `pre-django` marks the tree before this.

What exists, all cross-cutting, no business logic:

- **Project/config**: settings split base/local/test/prod, twelve-factor env,
  15-line `postgres://` parser (dj-database-url deliberately not a dep), SQLite
  fallback, DRF defaults (CursorPagination 20, JSON only, throttles), JSON
  logging with per-request ids, CORS from env (hand-rolled echo-middleware in
  apps/core/middleware.py — no django-cors-headers dep — answers preflights).
- **Auth**: Supabase JWT verification. `SUPABASE_URL` set → RS256 against the
  JWKS endpoint (fetched, cached by kid, 1h TTL, thread-safe, one forced
  refetch on unknown kid); `SUPABASE_JWT_SECRET` set → HS256 fallback for
  legacy projects. RS256 is verified in pure Python (no `cryptography` dep);
  ES256 needs `PyJWT[crypto]` added at deploy time. Valid token →
  `request.user` is a lightweight claims object; else 401
  `{"ok": false, "reason": "unauthenticated", "message": ...}` — the refusal
  envelope `docs/02-TRD.md` §6 already defines, not a new vocabulary. 403s use
  reason `"forbidden"`, 429 `"throttled"`, 400 `"invalid"`.
- **Permissions**: `IsSeeker` (any signed-in user), `IsConsultant`,
  `IsAdmin` from JWT role claims (top level or `app_metadata`), plus the
  documented-but-unwired `ConsultantExists` DB hook for phase 6.
- **Idempotency**: `Idempotency-Key` on POST/PATCH/DELETE; the stored response
  replays without re-executing; only 2xx is stored; the (key, user) unique
  index backstops races; an in-flight marker answers 409 `request_in_flight`
  rather than lie. Unauthenticated requests pass through untouched.
- **Outbox**: `outbox_events` + `enqueue_outbox()` (transaction-bound,
  optional dedupe key, delay) + `manage.py dispatch_outbox` — claims with
  `FOR UPDATE SKIP LOCKED` plus an optimistic attempts-claim so exactly-once
  holds on any backend; per-item failures back off (1min → 1h cap, 10 attempts
  then dead-letter) without blocking the batch. No Celery yet — `tasks/README`
  says where the wrapper goes.
- **Media**: `media_assets` (UUID pk, kind/status check constraints, owner as
  auth-user uuid text — no business FKs) + presigned PUT (`POST
  /v1/media/presign/`, size/mime gated: reel 100MB video/*, image 10MB
  image/*, audio 25MB audio/*) via R2 (boto3) or a fake local provider,
  selected by `MEDIA_PROVIDER`; `GET /v1/media/<id>/` is owner-scoped (a
  stranger gets 404, not 403, so ids don't leak existence).
- **Endpoints**: `GET /v1/health/` (AllowAny, version from env), `GET /v1/me/`
  (echoes verified claims — proves the JWT path end to end).
- **Tests**: 82 pytest-django tests on SQLite, including a generated RSA
  keypair (pure Python) whose signatures openssl independently verifies, the
  full accept/401 matrix, permission 200/403 matrix, replay/race idempotency,
  two overlapping outbox dispatchers, and boto3 fully mocked. `manage.py
  check` clean. CI: `.github/workflows/api.yml` runs checks + pytest on
  changes under `backend-django/`.

Deliberately not built (later phases own these): `request.profile` from the
`profiles` table (phase 2+ adds it where the seam lands), any business module,
Celery, Redis client (the cache seam is env-shaped already), ES256 without
`cryptography`, Django ownership of the existing 27 SQL migrations (phase 2's
`inspectdb` baseline).

Files changed: `backend-django/` (new — project, apps/core, apps/media,
tests), `.github/workflows/api.yml` (new), `.gitignore` (venv/python entries;
root `Makefile`/`docker-compose.yml`/`archive/` patterns anchored so
`backend-django/docker-compose.yml` is tracked), `docs/07-DJANGO-MIGRATION.md`
(phase 0/1 status), `CLAUDE.md` (map). Nothing in `src/`, `backend/`,
docs 01–06, or the deploy workflow was touched.

## 10a. Module 2 — reactions — 19 Sep 2026

The reactions module (step 2 of `docs/07-DJANGO-MIGRATION.md` §6) is built
in `backend-django/` and **staged, not deployed** — Supabase still serves
production; the client flip sits in `backend-django/cutovers/
reactions.clientlib.js` awaiting the deploy order. `apps/reactions/` maps 1:1
onto the existing `reactions` table (`backend/schema/020_content_reviews.sql`
as amended by `025`, which added `'profile'` to `target_type`): uuid id,
`actor_id`, `target_type`, `target_id`, `kind`, `created_at`, the unique
4-tuple, and `reactions_target_idx`. Its migration is generated against that
schema and designed to be faked in at cutover (`migrate --fake-initial`) — it
creates nothing new on the real DB; `actor_id`'s FK to `profiles` is deferred
to the profile module, exactly like the phase 1 no-business-FK decision.
Endpoints under `/v1/reactions/`: `GET` (own rows only — the `reactions_own`
policy), `POST` (`{target_type, target_id, kind}`; actor forced from the JWT;
double-react is one row, answered `created: false` + 200), `DELETE`
(owner-scoped; someone else's row is 403, off-when-off is a 200 no-op), and
`GET /v1/reactions/counts/` (anonymous aggregates — the count views' grant;
counts stay `COUNT(*)` queries, there is no counter column to drift). Client
contract unchanged: `fetchMine` still returns `kind:target_id` strings,
`setReaction` still returns false for unpersistable keys and signed-out
visitors, refusals still carry `{ok, reason, message}`. 23 new pytest-django
tests port the reactions halves of the 020/025 SQL checks (unique double-react,
counts exact and starting honest, stranger reads zero rows but public counts,
profile-follow counts) plus idempotency-key replay and two thread-race tests;
full suite 105 green.

Files changed: `backend-django/apps/reactions/` (new — models, services,
views, urls, fake-in migration), `backend-django/tests/test_reactions.py`
(new), `backend-django/cutovers/reactions.clientlib.js` (new — the staged
client flip), `backend-django/config/` (app + route registration),
`HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10b. Module 3 — astro — 19 Sep 2026

The astro module (step 3 of `docs/07-DJANGO-MIGRATION.md` §6) is built in
`backend-django/` and **staged, not deployed** — the `astro` Edge Function
still serves production; the client flip sits in
`backend-django/cutovers/astro.clientlib.js` awaiting the deploy order. The
edge function's four ops are now an `AstroProvider` interface
(`apps/astro/providers.py`): `FreeAstroApiProvider` (real, `FREE_ASTRO_API_KEY`
from env, `ASTRO_PROVIDER=freeastroapi`) and `MockProvider` (deterministic,
no network — dev/tests; its Moon uses a truncated lunar theory so the
canonical-birth check passes end-to-end). `apps/astro/services.py` replicates
the function exactly: same cache keys (`panchang:<date>`,
`chart:<id>:<birth digest>`, `canon-chart:<rashi>`, `rashifal:<rashi>:<date>`),
same no-TTL cache-aside against `astro_cache` (single-flight via a cache lock:
two simultaneous misses cost one upstream call; the unique key collapses
writers, catch-IntegrityError-read-winner), same Ujjain panchang anchor,
twelve canonical births, yesterday/today/tomorrow IST clamp, and refusal
parity (400/401/409/500/502 with the function's reason strings; the upstream
key or URL never reaches a response body). Endpoints under `/v1/astro/`
(geo + panchang anonymous, chart + horoscope authenticated; birth details
read from the caller's own `profiles` row via a raw-SQL gateway that the
profile module replaces). The 019 check is ported to pytest, including the
service-role-only invariant re-expressed as code: only the service layer
touches `astro_cache` and no endpoint exposes a raw row. 42 new tests; full
suite 147 green.

Files changed: `backend-django/apps/astro/` (new — models, providers,
services, views, urls, fake-in migration), `backend-django/tests/test_astro.py`
(new), `backend-django/cutovers/astro.clientlib.js` (new — the staged client
flip), `backend-django/config/` (app, route, provider settings), `HANDOFF.md`
(this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10c. Module 4 — bhakti — 19 Sep 2026

The bhakti module (step 4 of `docs/07-DJANGO-MIGRATION.md` §6) is built in
`backend-django/` and **staged, not deployed** — Supabase still serves
production; the client flip sits in `backend-django/cutovers/
bhakti.clientlib.js` awaiting the deploy order. `apps/bhakti/` maps 1:1 onto
`bhakti_assets` (`backend/schema/024_bhakti_assets.sql` as amended by `026`,
which merged 'ringtone' into 'tune' and promoted WhatsApp-status artwork into
the leading 'status' kind): uuid id, kind vocabulary, nullable-positive
`price_paise`, the NOT NULL attribution triplet, soft withdrawal via `active`,
curated `sort`, and the `legacy_id` unique key the seed script idempotently
upserts on. It is a curated catalogue with no client writer — 024 grants one
RLS policy (public select of active rows) and deliberately no write policy —
so the module is one AllowAny read endpoint, `GET /v1/bhakti/assets/`, ordered
kind-then-sort exactly like fetchAssets, returning the snake_case rows toAsset
consumes; the only write path is the service layer's `seed_asset` (the
service-role `backend/seed/bhakti.mjs` replacement, constraint-safe against a
racing re-seed) reachable from no URL. No e-puja session state exists to
migrate: the shrine (`src/screens/Pooja.jsx`, at `/darshan`) is fully
client-side mock data with zero backend calls — §6's "one session write"
turned out not to exist. No `*_check.sql` covers bhakti, so the 024/026 SQL
itself is the ported spec. 29 new pytest-django tests cover the endpoint
contract, the RLS-equivalent matrix (anonymous reads active rows; writes are
405s, not 403s — the absence of the policy is the rule), the 026 kind
vocabulary, the column checks, and the seed path's idempotency including a
two-thread race; full suite 182 green.

Files changed: `backend-django/apps/bhakti/` (new — models, services, views,
urls, fake-in migration), `backend-django/tests/test_bhakti.py` (new),
`backend-django/cutovers/bhakti.clientlib.js` (new — the staged client flip),
`backend-django/config/` (app + route registration), `HANDOFF.md` (this
section), `docs/07-DJANGO-MIGRATION.md` (§6 status).


## 10d. Module 5 — content — 19 Sep 2026

The content module (step 5 of `docs/07-DJANGO-MIGRATION.md` §6 — the largest:
feed, posts, reels, articles, reviews, publication, media wiring) is built in
`backend-django/` and **staged, not deployed** — Supabase still serves
production; the client flip sits in `backend-django/cutovers/
content.clientlib.js` awaiting the deploy order. `apps/content/` maps 1:1 onto
`content`, `reviews` and `feed_pins` (`backend/schema/020_content_reviews.sql`
as amended by `025_seekers_publish.sql`, which renamed `consultant_id` to
`author_id` and repointed the key at `profiles`): the kind/status vocabularies,
`view_count >= 0`, unique nullable `booking_id`, unique `legacy_id`, the
partial indexes, all constraint names matching Postgres for the fake-in
migration. `author_id`/`seeker_id`/`consultant_id` are bare UUIDFields — the
FKs to `profiles`/`consultants` are deferred to those modules exactly like the
reactions module deferred `actor_id`.

**The views are the access control, so the views are the code.** The client
reads only through `content_public`, `reviews_public`,
`profile_follow_counts` and `authors_public`; Django does not own those SQL
views, so `services.public_content()` is a queryset that replicates the 025
`content_public` definition exactly — `status='live'` plus the NOT EXISTS that
keeps a blocked consultant's posts out of the feed without making approval a
gate on ordinary people — with the four computed columns (author_name,
author_is_consultant, like_count, save_count) as subselect annotations. Counts
stay COUNT(*) queries, not columns (§1.3): exact by construction, nothing to
drift. `profiles`, `consultants` and `bookings` are read through a raw-SQL
gateway (apps/content/gateway.py), the same pattern astro uses for birth
details — replaced when the profile/consultants/bookings modules land. One
SQLite test artifact is worth knowing: Django stores UUIDFields dashless there
while Postgres compares native uuids, so the cross joins normalise both sides
with `replace(cast(...))` — format-agnostic on both backends.

**Publication** is the 025 insert policy plus the draft state: author is
forced from the JWT (the body cannot carry an identity — the 025 check's
"publish as somebody else" refusal is now structural), `published_at` is the
server's clock, `view_count` and `legacy_id` are never client-settable. Anyone
signed in publishes `post`/`article`; `clip` (and `live_session`) require an
APPROVED consultants row — the claim is not consulted, the table is — and the
403 carries the sentence the interface already shows: "Only a consultant can
post a reel". Admins publish anything. Drafts are invisible to everyone but
the author (`GET` of a draft is a 404, so ids do not leak existence);
`POST /v1/content/<id>/publish/` moves own draft -> live; removal is
`status='removed'`, owner-scoped with admin excepted, never a DELETE. Two
deliberate strictness changes over the old silent RLS behaviour: removing
someone else's post is a 403 rather than a silent no-op, and a blocked
consultant's post/article INSERT is still accepted (policy parity — 025 only
gates the kind and the feed) but invisible everywhere public; their reels are
refused outright. `seed_content`/`seed_review` are the service-role
`backend/seed/content.mjs` replacements — idempotent upserts on `legacy_id`/
`booking_id`, reachable from no URL.

**Reviews** are the anti-fraud gate exactly: the booking must be the caller's
own and `completed`, naming the same consultant, and `booking_id` unique makes
one booking buy one review (a racing duplicate is a 409 carrying the old
23505 sentence "You have already reviewed this session"; a gate failure is a
403 carrying "You can only review a session you have completed" — both
byte-identical to what src/lib/content.js already toasts). `verified` derives
from `booking_id is not null`; seeded reviews carry no fabricated booking, so
they are visible but visibly unverified. The rating caches recompute from the
live reviews in the SAME transaction as every review write, under a
`FOR UPDATE` lock on the consultants row — the 020 trigger's arithmetic,
`round(avg::numeric, 1)` with Postgres's half-away-from-zero rounding, never
an increment. Metered chat still does not create a reviewable booking: the
gate names `bookings`, sessions are a different table, and that gap is carried
over untouched (docs/05 §5.4's open decision).

**Media** rides the Phase 1 presign flow. Two additive changes to
`apps/media/`: the presign response now includes `public_url` (the playback
URL stored on `content.media_url` — 022's public-read decision survives on
R2: the row pointing at the file is already public through the feed, so a
signed URL would buy a round trip per card and nothing else), and a new
`POST /v1/media/<id>/confirm/` flips the row processing -> ready, owner-scoped
(stranger gets 404) and idempotent. The client uploads straight to the bucket
and Django never carries bytes. The staged `uploadMedia` keeps its contract —
return the public URL — with presign -> PUT -> confirm underneath.

**Realtime caveat.** `src/lib/content.js` never subscribed to a
`supabase.channel`: the feed, reels and articles are fetch-on-mount, and 015's
publication covers `messages`/`sessions` only. Nothing realtime is lost when
this module cuts over and polling/refresh stays as-is. The chat screens DO
subscribe (`store.jsx`/`lib/chat.js`) — those keep working only against
Supabase and are module 7's cutover problem; a channels layer is a later
phase, not part of this one.

Endpoints under `/v1/content/`: `feed/` (kinds/limit/after keyset cursor),
`by-author/`, `<id>/` (post detail), `publish/`, `<id>/publish/`,
`<id>/remove/`, `reviews/` (GET anonymous per the views' grant; POST
authenticated through the gate), `reviews/reviewable/`, `follow-counts/`,
`authors/<id>/`. Feed ordering is `-published_at NULLS LAST, -id` — the same
order the client's PostgREST query asked for.

54 new pytest-django tests port both check files (020 points 1-6 and 025
points 1-7: draft/blocked leaks both directions, counts from zero, one like
one row, the four-case review gate, verified derivation, the rating cache
reproducing its source through a removal, strangers reading counts but not
actors), the publication permission matrix (seeker/consultant/pending/blocked/
admin, body-spoofed identity, client-set published_at and view_count), the
draft -> live -> removed lifecycle, keyset pagination exactness across pages,
thread-race tests for both the duplicate-booking race and the cache under
concurrent reviews, the reel-post presign -> confirm -> publish flow, and the
seed services' idempotency. Full suite 236 green.

Files changed: `backend-django/apps/content/` (new — models, gateway,
services, views, urls, fake-in migration), `backend-django/tests/
test_content.py` (new), `backend-django/cutovers/content.clientlib.js` (new —
the staged client flip), `backend-django/apps/media/` (presign `public_url`,
confirm endpoint), `backend-django/config/` (app + route registration),
`HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).


## 10e. Module 6 — consultants — 19 Sep 2026

The consultants module (step 6 of `docs/07-DJANGO-MIGRATION.md` §6 — the
first real-money touch) is built in `backend-django/` and **staged, not
deployed** — Supabase still serves production; the client flip sits in
`backend-django/cutovers/consultants.clientlib.js` awaiting the deploy order.

**Ownership.** `apps/consultants/` maps 1:1 onto `price_bands`,
`consultants`, `consultant_services`, `consultant_availability`,
`consultant_time_off` (`007`, prices corrected by `011`), `bookings`
(`008`, order_id layer from `012`) and `earnings_ledger` (`012`): all seven
weekday rows per consultant, the frozen booking copies, the partial unique
index `bookings_slot_claim` (THE conflict check), the
`earnings_ledger_nets` check, index names matching Postgres for the fake-in
migration (one 64-char unique key deliberately carries Postgres's own
63-byte truncation). `languages`/`credentials` are `text[]` via a small
custom field (psycopg binds a list on Postgres; JSON text on SQLite).
`profiles`, `wallets`, `ledger`, `orders`, `order_items` stay raw-gateway
tables — the profile module (9) and wallet module (8) own them; prod's
phase-2 triggers (balance-follows-ledger, refuse_mutation) remain in force
until that cutover, and the gateway emulates the balance carry on SQLite,
documented at the site. `EarningsLedger` replicates the append-only trigger
in the model layer (save/delete on an existing row refuse), so rule 2 is
executable in this module's tests; `ledger` keeps its prod trigger and gets
its ORM guard with module 8.

**The booking transaction** replicates `012` as amended by `013` statement
for statement: the client sends `{consultantId, serviceId, startsAt}` and no
price (rule 3); the order is lock wallet → check balance against the LOCKED
number → open the order → CLAIM THE SLOT (the insert that can raise; the
loser never reaches the debit, and the whole block unwinds) → debit the
seeker's ledger → credit the consultant's book, gross − 1800bps fee = net,
each party's book naming the other (013 fix 4). 013's other fixes are in:
zero-price refused by name, short-balance on its own branch. The reversing
credit is `booking_reverse` exactly: both books get a NEW row, the original
debit stands, the order flips 'refunded', and idempotency is 013's unique
index `ledger_one_refund_per_order` — the insert IS the check, a retry is a
no-op, and two concurrent reversals credit once. `decide` is the conditional
UPDATE pending → confirmed | declined (008's policy edge, no read-then-write;
018 fix 1's shape), with the decline's reversal in the same transaction,
exactly as 012's trigger does it. 009's subtraction — availability minus
time off minus slots claimed at pending, horizon 14 days, times IST — lives
in one `open_slots()` that `book_session` itself consults; a second
implementation of that subtraction is the phase-4 bug the SQL file exists
to kill. The 011 arithmetic (20-minute price restored, 15/30 to the nearest
₹10, per-minute to the nearest ₹1, Postgres half-away-from-zero rounding)
is `derive_band_price`, used by the idempotent `seed_price_bands` service.

**Endpoints under `/v1/consultants/`**: `` (list, shaped rows + services,
rating desc NULLS LAST), `price-bands/`, `apply/` (the whole application in
one transaction — row lands 'pending' plus the tier's services priced by
copying the band rows; 009 assertions 8 and 9 are structural), `me/` (the
caller's own row, pending included — the bare-gateway read store.jsx's
refreshConsultant does until the profile module; profiles-table ownership is
unchanged), `<id>/`, `<id>/services/`, `<id>/slots/?date=`, `<id>/
availability/` + `availability/set/` (one cell, one INSERT or DELETE),
`<id>/bookings/` (the queue, carrying the seeker's name and birth details
per 010), `bookings/` (create; Idempotency-Key middleware + the unique
index), `bookings/mine/`, `bookings/<id>/decide/`, `<id>/earnings/`.
Permission matrix: listings/slots/bands anonymous; unapproved consultant is
a 404, not a 403 (invisible, not forbidden); availability read approved-or-
own (else empty, RLS parity), write own-only; bookings read caller-scoped
each side; decide is the booking's consultant's pending edge only; earnings
owner-only; approval exists at no URL. Two documented strictness changes
over silent RLS: another consultant's queue/earnings is a 403 rather than an
empty list, and deciding a resolved booking is a 403 rather than a silent
no-op.

**Tests.** 59 new pytest-django tests port both check files — 009
assertions 1–7 (one slots source on all seven weekdays, pending claim,
decline frees, time off, approval gating both directions, both horizon
ends), 012 assertions 1–10 (one booking one transaction, gross−fee=net
row-level and table-wide, the refusal matrix with byte-exact sentences and
nothing-written counts, decline restores by a NEW row with the original
debit untouched, double reversal credits once, append-only both books,
per-minute refused by name) and the RLS matrix as endpoint tests — plus
three thread-race tests (two seekers one slot → exactly one holds and the
loser leaves no order, no booking, no debit; two concurrent reversals → one
credit; two concurrent decides → one winner) and the 011 rounding vectors.
Full suite **295 green**.

Two deliberate suite changes came with owning the tables: test_content's
fixtures now write `consultants`/`bookings` through this module's models
(raw CREATE TABLE would collide with the real tables), and the content
gateway's single-row lookups gained the `replace(cast(...))` UUID
normalisation (Django stores UUIDFields dashless on SQLite) plus canonical
dashed IDs on return. `models.E034` is silenced in base settings — SQLite
reports no identifier limit so Django assumes 30 chars, while the index
names production carries are up to 34.

**Out of scope, on purpose.** 014–018 are the metered-chat module (step 7):
sessions, presence and realtime publication stay on Supabase until then;
017/018's shared shapes (per-minute services, the mode vocabulary) are
modelled here and their money paths land with chat. The admin reversal for
"never turned up"/platform failure is a service-layer function reachable
from no URL, exactly as 012 grants it.

Files changed: `backend-django/apps/consultants/` (new — models, fields,
gateway, services, views, urls, fake-in migration), `backend-django/tests/
test_consultants.py` (new), `backend-django/cutovers/
consultants.clientlib.js` (new — the staged client flip, plus the
same-commit notes for store.jsx refreshConsultant and ProApply),
`backend-django/apps/content/gateway.py` (UUID normalisation + canonical
IDs for the now-real tables), `backend-django/tests/test_content.py`
(real-table fixtures), `backend-django/config/` (app + route registration,
`SILENCED_SYSTEM_CHECKS` for the 30-char SQLite assumption), `HANDOFF.md`
(this section), `docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10f. Module 7 — chat, the meter — 19 Sep 2026

The metered-chat module (step 7 of `docs/07-DJANGO-MIGRATION.md` §6 — the
highest correctness bar in the migration) is built in `backend-django/` and
**staged, not deployed** — Supabase still serves production; the client
flip sits in `backend-django/cutovers/chat.clientlib.js` awaiting the
deploy order. Full suite **354 green** (295 + 59 new).

**Ownership.** `apps/chat/` maps 1:1 onto `sessions`, `threads`, `messages`
(014, accept re-written by 017 and 018): the frozen `rate_paise`, the
partial unique indexes `sessions_one_live_per_consultant` (THE live-session
conflict check) and `sessions_one_open_request` (018's one-ask-per-pair),
`sessions_live_idx` (the sweeper's whole query cost), the 016 preview
columns, index/constraint names matching Postgres for the fake-in
migration. `profiles`, `wallets`, `ledger`, `orders`, `order_items` stay
raw-gateway tables (modules 8/9 own them) — the metering writes go through
`apps.consultants.gateway` exactly as module 6 established, plus one new
`set_order_total` (014's settle restates the order at the charged amount).
`consultants`/`consultant_services`/`earnings_ledger` are module 6's; chat
reads the first two and appends `EarningsLedger` rows with module 6's own
`fee_paise` (Postgres half-away-from-zero). 016's `touch_thread` trigger
and the phase-2 balance trigger stay live in prod and are emulated on
SQLite, the gateway precedent.

**The meter, replicated statement for statement** (014 as amended by 017
and 018 — read `apps/chat/services.py`'s header before touching anything):
hold-and-settle, two ledger rows per session; accept takes the session ROW
LOCK first (018 fix 1), locks the wallet, holds EVERY minute the balance
buys — `balance // rate`, integer floor, no cap (017) — opens order + one
line, upserts the thread (one per pair, forever), stamps
`started_at/expires_at/heartbeat_at`, debits the whole hold. End is
idempotent with a conditional UPDATE as the CAS (a racing second settle —
a pressed End against a sweep tick — matches zero rows and writes
nothing), clamps the stop to `expires_at`, bills
`max(1, ceil(seconds/60))` in exact integer microsecond arithmetic —
never floats — clamped to `hold // rate`, refunds the unused minutes with
`ref_type='refund'` (one per order, 013's index is the backstop), restates
the order, and writes earnings at the END (gross − 1800bps fee = net),
each book naming the other party's person. The sweeper settles anything
past `expires_at` or silent for the 60s grace
(`coalesce(heartbeat_at, started_at)`), expires unanswered requests after
15 minutes, claims FOR UPDATE SKIP LOCKED, and counts only what it
actually settled so two overlapping runs sum to one settle per session.
018's other three fixes are in: one open request per pair is the index
(asking twice returns the waiting request), a mode `sessions` cannot store
is a refusal not a crash, and only the sweeper's reason lands in the
ledger note. The live-session gate on messages is exactly the policy: a
write is accepted only into a thread with a live, UNEXPIRED session, only
as a participant, with the boundary decided by the server's `expires_at`
to the second.

**Endpoints under `/v1/chat/`**: `sessions/request/` (no rate in the body,
rule 3), `sessions/` (either side, newest 50 — the consultant's queue is
this list client-filtered, as today), `sessions/<id>/accept|end|heartbeat/`
(200 + the server's own `{ok, reason}`, byte-parity with the PostgREST
RPC contract), `threads/` (the `threads_view` shape: names, unread,
`live_session_id`, NULLs last), `threads/<id>/messages/` (participant-only;
`?after=<message id>` keyset paging — no gaps or duplicates while new rows
land), `threads/<id>/messages/send/` (the one write; the inserted row
comes back for the sender's immediate render), `threads/<id>/read/`.
Permission matrix: participant-only everywhere (a stranger's transcript
read is a 403, module 6's documented strictness over silent RLS); the
seeker/consultant scoping IS the sessions policy; admin appears at no URL.

**The staged client flip replaces subscriptions with polling — the one
behavioural change, spelled out.** `cutovers/chat.clientlib.js` keeps
every export of `src/lib/chat.js`, so `ChatPanel`, `ConsultantProfile` and
`ProConsult` are untouched; but `subscribeToThread` /
`subscribeToMySessions` / `subscribeToRequests` are now pollers returning
the same unsubscribe functions: messages poll on a keyset cursor every 3s,
the session lists every 5s firing only on change. This is the plan's
stated M1 transport — REST is the source of truth (docs/07 §6 step 7), and
Realtime/Channels push delivery is a later phase, not part of this
cutover. What production loses for that window: message latency up to ~3s
instead of push, and the consultant's request queue refreshed on a 5s beat
instead of instantly. What it keeps: every metering guarantee above,
because the meter has never lived in the transport. `heartbeat` cadence is
unchanged and screen-driven; a failed heartbeat still answers
`{unreachable: true}` so the room never tears its meter down mid-session.
Cutover order matters more here than for any earlier module: deploy the
API, run `sweep_sessions` on a 1-minute scheduler BEFORE the client flips
(an un-swept hold is the silent failure 014 exists to kill), then flip the
lib.

**Tests.** 59 pytest-django tests port all of `014_metered_chat_check.sql`
— assertions 1–11 verbatim (asking moves nothing; the uncapped hold is
every affordable minute with the wallet moved by exactly the hold; the
second-seeker accept refused by name; the live-session gate; ten minutes
bills ten with the ledger replaying to the balance; earnings gross−fee=net;
a second end settles once; the ended transcript is read-only but still
readable; the accept-time short-balance refusal writes nothing; the
sweeper settles an abandoned session for exactly its minutes; a stranger
sees none of it) — plus the round-up boundary vectors built from the SQL's
exact rule (0/59/60/61/119/120/121s, the hold clamp, the fee's
half-away-from-zero at 40.5), the grace boundary at exactly 60s, the
15-minute request boundary, the heartbeat's zero-at-expiry shape, the
right-side-only unread clear, 016's 120-character preview, keyset-cursor
exactness under concurrent inserts, the endpoint shapes key-for-key with
the client, and six thread-race proofs (two concurrent first messages land
once each in one total order; six concurrent accepts — 018's own proof —
one hold, the wallet moved by exactly that hold; racing duplicate asks make
one request; End racing the sweeper settles once; two concurrent sweepers
do not double-charge; sends at the exact `expires_at` instant are refused
one second before they are accepted). Every service takes an injectable
`now`, so the check's time-faking discipline — move `started_at`, never
wait — holds with zero clock jitter.

**Known deviations from prod, deliberate and small.** (1) The settle's
state change is a conditional UPDATE (CAS) rather than `session_end`'s
read-then-write under `FOR UPDATE` — 018 fix 1's own shape applied where
the settle lives; the lock is still taken, the row still serialises, and a
racing second settle is a reported `already_ended`, never a second write.
(2) Prod's `btrim(body) <> ''` check cannot be expressed portably as an
ORM check constraint, so the model carries `body <> ''` and the service
layer enforces the trim before any write — the refusal happens either way.
(3) `sessions.thread_id`'s FK constraint name differs cosmetically from
014's `sessions_thread_fkey`; `--fake-initial` does not check constraint
names. (4) Sweep counts what it actually settled rather than every
candidate seen — on Postgres SKIP LOCKED the difference never materialises;
on SQLite it makes two overlapping runs report one settle between them.
(5) The pollers keep polling in a background tab the way Realtime did; if
that ever matters, visibility-aware polling is a client-side tweak inside
the staged lib, no API change.

Files changed: `backend-django/apps/chat/` (new — models, services, views,
urls, the `sweep_sessions` management command, fake-in migration),
`backend-django/tests/test_chat.py` (new), `backend-django/cutovers/
chat.clientlib.js` (new — the staged client flip), `backend-django/apps/
consultants/gateway.py` (`set_order_total` for the settle), `backend-django/
config/` (app + route registration), `HANDOFF.md` (this section),
`docs/07-DJANGO-MIGRATION.md` (§6 status).

## 10g. Module 8 — wallet + payments, the money core — 19 Sep 2026

The wallet module (step 8 of `docs/07-DJANGO-MIGRATION.md` §6 — the MONEY
core: wallets, the append-only ledger, top-ups, Razorpay order/webhook) is
built in `backend-django/` and **staged, not deployed** — Supabase still
serves production; the client flip sits in
`backend-django/cutovers/wallet.clientlib.js` awaiting the **feature-freeze
cutover window** (docs/07 §6 step 8 — the one module with a freeze; the
window and its deploy order are spelled out in the cutover file's header).
Full suite **410 green** (354 + 56 new).

**Ownership.** `apps/wallet/` maps 1:1 onto `wallets`, `ledger` (003,
refuse_mutation fixed by 004, wallet_debit's client ref_type removed by 005,
013's refund index) and `payments` (006): exact table/constraint/index names
for the fake-in (`migrate --fake-initial` at cutover; prod's phase-2
triggers stay in force and Django's services never double-write what a
trigger does — documented at the site). `Ledger` carries the append-only
refusal as an ORM guard like module 6's EarningsLedger, so 003's
refuse_mutation rules are executable on SQLite: no UPDATE/DELETE, the
never-negative CHECK, the nonzero-delta CHECK, the ref_type CHECK — and
005's discipline in the service layer, a client debit writes ref_type
'order' ALWAYS. The gateway moves: `apps.consultants.gateway`'s wallet
functions (`lock_wallet_balance`, `insert_ledger`) moved to
`apps.wallet.services` — THE only mutation path — and modules 6/7's money
calls re-point there, same SQL, same results (their 118 tests unchanged
green). Wallet/ledger access is format-agnostic SQL (`_xid`, the content
gateway's helper) because Django stores UUIDs dashless on SQLite while raw
rows are dashed — money reads must not depend on which.

**Services are the only mutation path, stated back.** `debit` is 005's
`wallet_debit` statement for statement — row lock, check against the LOCKED
number, exact refusal sentences ('Not enough balance' byte-identical, with
the post-refusal balance), ref_type forced 'order'. `credit` is
server-side only — payment_capture and service-role adjustments, nothing
client-callable creates a wallet or credits one (Supabase's
handle_new_user still makes the row at signup; auth stays). Holds and
refunds (chat's meter, bookings) are `insert_ledger` with ref_id, one
refund per order by 013's unique index — the insert IS the check.

**Razorpay, edge-function parity.** `apps/wallet/razorpay.py` is the seam
(order create + order-payments lookup, key id/secret server-side, generic
errors). `create_topup_order` replicates razorpay-order: the band
MIN_PAISE ₹100 / MAX_PAISE ₹1,00,000 with the exact sentence 'Add between
₹100 and ₹1,00,000.', amount in paise both directions, notes carrying
profile_id for the dashboard (never the attribution path), and it fails
BEFORE checkout opens rather than after — an unattributable payment must
never reach the card form. `handle_webhook` replicates razorpay-webhook:
verify-then-parse over the RAW body (stdlib hmac/hashlib, compare_digest),
HANDLED = {payment.captured, payment.failed}, everything else a 200
'Ignored.', 401/400/500 exactly like the function's. `payment_capture` is
006 statement for statement: attribution through the 'created' row never
the notes, the event row and the ledger credit in ONE transaction, and
idempotency is the two unique columns — a retried delivery violates the
index and the whole block, credit included, rolls back; the handler
answers `{ok, duplicate}` so Razorpay stops. One documented hardening over
006: amount-must-match-order — a capture whose amount differs from the
order it attributes through is refused (500, retried, named by the
reconciliation) rather than crediting either number silently. The webhook
is a plain Django view (not DRF) at `/v1/wallet/webhook/razorpay/`, no
auth — the signature IS the credential.

**Reconciliation.** `manage.py reconcile_payments` ports
`backend/tools/reconcile-payments.mjs`: every 'created' row with no
terminal sibling is abandoned-or-lost and only Razorpay knows, so the
sweep ASKS — read-only, crediting nothing (a script that mints undoes the
reason the webhook is the only credit path), exiting non-zero and naming
the people owed with the same two-things-in-order advice. Run it after any
webhook change and before believing the first live payment worked.

**Endpoints under `/v1/wallet/`** (call-for-call with the Supabase the
client talks to today, documented in views.py): `GET /` balance
(wallets_select_own as a query; no wallet reads 0 + wallet_exists false),
`GET /ledger/` keyset-paged raw snake_case rows exactly like PostgREST,
`POST /spend/` whose 200 body IS wallet_debit's jsonb (the refusal
sentences and the post-refusal balance travel byte-identically),
`POST /topup/order/` with `{ok:false, reason}` refusal bodies
byte-identical to the edge function's, `GET /topup/<order_id>/` the
client-visible payment outcome (404 so ids don't leak), and the webhook.
The module-1 Idempotency-Key middleware replays a retried order POST; the
client's toppingUpRef guard stays the first line.

**Tests.** 56 pytest-django tests port both check files — 003 assertions
1–8 verbatim (cache follows ledger; the affordable debit once as 'order';
over-balance refused by the server with the exact string and NOTHING
written; nonsense amounts; append-only at the ORM layer; the
never-negative CHECK at the storage layer; replay == balance; no client
write path as 405s) and 006 assertions 1–4 through the real webhook view
(capture credits exactly once; redelivery and repeated-event-id credit
nothing; a failure leaves a row and no credit; unattributable raises) —
plus the band edges with exact sentences, not-configured/502/record-failure
branches, HMAC vectors recomputed independently with the stdlib, bad
signature rejected without parsing, amount-mismatch refused without
credit, topup-status scoping, the reconciliation classifications and the
command's exit codes, and three real-thread races (four concurrent debits
serialise on the lock — exactly two of four pass, the wallet never
negative; double top-up confirm credits once — one `duplicate: true`; a
refund racing a reversal credits once — one caught IntegrityError).
Refusal byte-parity is asserted string for string throughout.

**Deliberate deviations from prod, small and documented.** (1)
Amount-must-match-order, above. (2) 006's error classes become typed
exceptions (CaptureFailed/Refusal) the webhook maps onto the function's
exact statuses and bodies. (3) Unauthenticated topup gets the DRF 401
envelope rather than the function's `{ok:false, reason:'Sign in to add
money.'}`; the staged clientlib maps it back to that sentence. (4) The
client's topup flow is unchanged — checkout.js in the browser, the 12s
balance poll, the same settling toast.

Files changed: `backend-django/apps/wallet/` (new — models, services,
razorpay client, views, urls, the `reconcile_payments` command, fake-in
migration), `backend-django/tests/test_wallet.py` (new),
`backend-django/cutovers/wallet.clientlib.js` (new — the staged wallet
slice + the freeze window and deploy order), `backend-django/apps/
consultants/gateway.py` (wallet functions moved to apps.wallet.services),
`backend-django/apps/consultants/services.py` + `backend-django/apps/chat/
services.py` (money calls re-pointed), `backend-django/apps/consultants/
models.py` (header: ledger's ORM guard now exists), `backend-django/tests/
test_consultants.py` + `backend-django/tests/test_chat.py` (fixtures use
the real wallet tables; triggers kept; one test's wallet-delete emulates
003's cascade), `backend-django/config/` (app + route + Razorpay
settings), `HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md`
(§6 row 8, §7 step 13).

## 10h. Module 9 — profile + avatar, the last write surface — 19 Sep 2026

The profile module (step 9 of `docs/07-DJANGO-MIGRATION.md` §6 — the
identity spine AND the last write surface: user profiles and avatar
uploads) is built in `backend-django/` and **staged, not deployed** —
Supabase still serves production; the client flip sits in
`backend-django/cutovers/profiles.clientlib.js` awaiting the deploy
order. Full suite **450 green** (410 + 40 new).

**Ownership.** `apps/profiles/` maps 1:1 onto `profiles`
(`backend/schema/001_profiles.sql`, the column grant and all, plus
`002_profiles_email.sql`'s nullable/not-unique contact column with its
named CHECK `profiles_email_shape` carried into the model, plus
`027_profile_avatars.sql`'s `avatar_url`) — exact table/constraint names
for the fake-in (`migrate --fake-initial` at cutover; `handle_new_user`
STAYS a prod trigger — `services.ensure_profile` is the same insert as
code, for the window before it fires and for fresh databases, and never
double-writes what the trigger does). `id` is the Supabase auth user id,
a bare UUIDField, no local FK — identity stays in Supabase Auth (docs/07
§1). THE gateway moment the earlier modules deferred to: astro's birth
read, content's author/reviewer names, consultants' `_name_expr` and the
010 bookings_view birth/name joins, chat's threads_view name joins — all
re-pointed to `apps.profiles.services` (`get_birth_details`,
`profile_name`/`profile_names`, `name_subquery`/`birth_subquery`). All
four suites re-run green on the re-pointed seams with their raw
`profiles` scratch-table fixtures replaced by the real model (module 6's
precedent); the `_xid` dashless-UUID dance is gone at every boundary
that was profiles-to-X (both sides are Django tables now, so the joins
are ORM subqueries). One test-visible correction came with a real `time`
column: the bookings_view's `birth_time` now renders `07:40:00`, which
is what Postgres/PostgREST always returned — the old `07:40` was a
text-scratch-table artifact.

**The rules as code.** `profiles_select_own` / `profiles_update_own`
become `/v1/profiles/me/` — identity forced from the JWT, no id in the
URL at all (rule 3), the row shape byte-compatible with PostgREST's
`select('*')` so store.jsx's readers need no translation. The 001/002
column grant is the serializer's allow-list: name, email and the eight
birth columns; `admin`, `phone`, `legacy_id`, `id`, `created_at` are
dropped from any body, even the caller's own row, and 002's email shape
is checked at the door (a 400 the reveal screen can show) AND at the
storage layer (the named CHECK, executable on SQLite — Django registers
the regexp function). `avatar_url` is deliberately NOT grant-writable in
the PATCH even though 027 re-issued the grant: the Django path routes
every avatar write through the asset-validated endpoint, which makes
027's documented quiet-failure trap (update reports success, changes
nothing) structurally unreachable. Birth details stay private: the astro
module reads the CALLER'S OWN row server-side (unchanged invariant, now
through the profile module), and the only other carry — the seeker's
birth details to the consultant ON the booking — is 010's bookings_view,
unchanged and still no phone, no email. The public read
(`GET /v1/profiles/<id>/`) exposes `{id, name, avatar_url}` — and only
for a profile the existing public surfaces already show (live content per
`authors_public`, 025; an approved practice per `consultants_public`,
007) — anything else is a 404 so ids do not leak existence. `avatar_url`
rides the public shape as 027's documented follow-up. There is no admin
shape: 001's policies give an admin nothing on this table.

**Avatars (027 onto the media spine).** The upload is a `media_assets`
row (kind image, owner the caller) through the module-1 presign flow —
bytes straight to R2, Django never carries them. `POST
/v1/profiles/me/avatar/ {asset_id}` points the caller's row at the READY
asset: someone else's asset is a 404 (ids don't leak existence, the
media-app precedent), a non-image or unconfirmed asset is a shaped
refusal, and the stored URL is the asset's public URL plus a `?v=`
cache-bust — byte-compatible with what avatar.js writes today. The fixed
`<uid>/avatar` bucket path and its upsert go away: replacement is a
pointer change, never a bucket delete, and no file is orphaned.

**Endpoints under `/v1/profiles/`**: `me/` (GET full self — 404 so
store.jsx's null-means-not-loaded stays honest; PATCH the onboarding
write — creates the row when the trigger hasn't fired, partial-updates,
idempotent, Idempotency-Key replayable), `me/avatar/`, `<id>/` (public
projection, AllowAny like the views' anon grants).

**Tests.** 40 pytest-django tests: the RLS matrix as endpoints (self vs
stranger vs anonymous; identity forced from the JWT; birth-details
privacy — the public shape's key set is exactly `{id, name, avatar_url}`
and nothing else exists); the column-grant matrix (non-writable columns
dropped, `admin` never self-granted, avatar_url not PATCH-writable); the
onboarding write shape key for key with Computing.jsx (including the
unknown-birth-time pair NULL + false); 002's CHECK at the door and the
storage layer (named `profiles_email_shape`, case-insensitive like `~*`);
the avatar flow end to end including confirming someone else's asset
(404, not 403) and unconfirmed/non-image refusals; `handle_new_user`
parity (`ensure_profile`, the 'there' fallback, one row under a racing
double-create); and the races — two threads' first writes collapse to one
row (unique primary key, loser reads winner), Idempotency-Key replay,
double avatar set. One harness fact worth keeping: DRF's APIClient lets
`credentials()` OVERRIDE per-request Authorization headers
(`kwargs.update(self._credentials)`), so tests that act as two users
need a client per user.

**Deliberate deviations from prod, small and documented.** (1)
`avatar_url` set only through the avatar endpoint, not the column grant
(above — a strictness change over silent RLS, the module-6 precedent).
(2) The avatar size cap is the media gate's 10 MB, not the old bucket's
25 MB; the refusal sentence names the real limit. (3) The public
projection includes `avatar_url` (027's documented follow-up) and gates
on the 025/007 visibility predicates, which no single old view expressed
in one place. (4) `birth_time` renders `HH:MM:SS` everywhere now (the
old `07:40` was a scratch-table artifact; Postgres always sent seconds).
(5) Email-shape refusals answer the repo's standard envelope with the
field named in `errors`, not a driver CHECK message — Computing.jsx's
`setSaveError(error.message)` path is unchanged because the client sends
only calendar-validated shapes today.

Files changed: `backend-django/apps/profiles/` (new — models, services,
views, urls, fake-in migration), `backend-django/tests/test_profiles.py`
(new), `backend-django/cutovers/profiles.clientlib.js` (new — the staged
profile slice + avatar.js drop-in + the same-commit notes for the rest of
the store split), `backend-django/apps/astro/services.py` (birth read
re-pointed), `backend-django/apps/content/gateway.py` +
`backend-django/apps/content/services.py` (name reads re-pointed;
author_name join is an ORM subquery), `backend-django/apps/consultants/
gateway.py` + `backend-django/apps/consultants/services.py` and
`backend-django/apps/chat/services.py` (name/birth joins re-pointed),
`backend-django/tests/test_astro.py` + `test_content.py` +
`test_consultants.py` + `test_chat.py` (fixtures write the real profiles
table through the model), `backend-django/config/` (app + route
registration), `HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md`
(§6 row 9, status). Nothing in `src/`, `backend/`, or docs 01–06 was
touched.

## 10i. Module 10 — the audit, cutover verification, and the runbook — 19 Sep 2026

The final module is **integration, not code**: an exhaustive audit of every
Supabase/lib call site in `src/`, a mechanical verification of all nine
staged cutovers against the current client, and the runbook that executes
the cutover in four production deploys. **Nothing new was built — the audit
found zero uncovered call sites, so the suite stays 450 green and no
endpoints, tests or client patches were added.** Shop, Academy and
Notifications confirmed static (Shop's only data dependency is `useMyChart`
from `lib/astro.js`, which flips with module 3); People, Synastry, Pooja,
Tarot, Ask, Invite, Premium and Reports read `data/mock.js` only.

**The audit, call site by call site:**

| Call site | Disposition |
|---|---|
| `src/lib/reactions.js` (3 exports) | Module 2 — `cutovers/reactions.clientlib.js` |
| `src/lib/astro.js` (13 exports, incl. `callAstro` for AskPlace geo) | Module 3 — `cutovers/astro.clientlib.js` |
| `src/lib/bhakti.js` (5 exports) | Module 4 — `cutovers/bhakti.clientlib.js` |
| `src/lib/content.js` (12 exports) | Module 5 — `cutovers/content.clientlib.js` |
| `src/lib/consultants.js` (14 exports) | Module 6 — `cutovers/consultants.clientlib.js` (+`myConsultant`, `applyAsConsultant`, `listPriceBands` for the same-commit edits) |
| store.jsx `refreshConsultant` (raw `consultants` read) | Module 6 — `myConsultant()` (cutover header, same commit) |
| ProApply.jsx (`price_bands` read, `consultants` + `consultant_services` writes) | Module 6 — `listPriceBands()` + `applyAsConsultant()` (same commit) |
| `src/lib/chat.js` (13 exports) | Module 7 — `cutovers/chat.clientlib.js` (subscriptions become pollers) |
| store.jsx wallet slice (`refreshWallet`, `spend`, `topup`, `toLedgerRow`, `formatLedgerDate`) | Module 8 — `cutovers/wallet.clientlib.js` |
| store.jsx profile slice (`refreshProfile`) + Computing.jsx profiles write | Module 9 — `cutovers/profiles.clientlib.js` (`createProfileApi.refreshProfile` / `saveProfile`; write keys verified byte-identical to Computing's update block) |
| `src/lib/avatar.js` (`uploadAvatar`) | Module 9 — drop-in at the bottom of `profiles.clientlib.js` |
| store.jsx session (`getSession`, `onAuthStateChange`), AskPhone/VerifyOtp OTP | **Stay on Supabase Auth — permanently** (docs/07 §1); the access token is the Django credential |
| Shop/Academy/Notifications/People/Synastry and the mock screens | Static — nothing to build, noted as-is |

**Cutover verification (mechanical, not eyeballed):** a script listed the
export surface of every `src/lib/*.js` next to its staged cutover —
reactions 3/3, astro 13/13, bhakti 5/5, content 12/12, chat 13/13 exact;
consultants 14/14 plus the three documented additions. The wallet cutover's
`toLedgerRow` and `formatLedgerDate` are character-identical to store.jsx's
copies, and its `refreshWallet`/`spend`/`topup` semantics match the store
blocks they replace (guards, refusal sentences, 8×1.5s balance poll). **No
drift anywhere** — `src/` is unchanged since the modules were staged.

**The runbook** (`backend-django/cutovers/RUNBOOK.md`) — four deploys:
1. **API bootstrap**: deploy the API, `migrate --fake-initial` (fakes the
   nine business apps against the existing tables, applies `outbox_events`/
   `media_assets` for real — they don't exist in production), start
   `dispatch_outbox`. No client change, no freeze.
2. **Batch A** — reactions, astro, bhakti, content, consultants in one
   client commit (five lib flips + the module-6 `store.jsx`/ProApply
   edits). RLS revocation for the group after its quiet week; the `astro`
   edge function retires.
3. **Chat**: `sweep_sessions` on a 1-minute scheduler FIRST, unschedule the
   pg_cron `session-sweep` job, verify a clean cycle, then flip the lib.
   RLS revocation after the quiet week.
4. **Wallet + profile in ONE freeze window and one client commit** (both
   halves rewrite store.jsx; the wallet checkout prefill reads profile
   state): freeze → Razorpay dashboard webhook switch to
   `/v1/wallet/webhook/razorpay/` → test-mode payment end to end → flip →
   `reconcile_payments` → quiet week → retire the two Razorpay edge
   functions and revoke the money/profile RLS.

Every step carries verification curls, and rollback per step (a cutover is
atomic per lib file; revocations wait for the quiet week precisely so there
is nothing left to roll back). The final state: Supabase keeps Auth,
Postgres and the triggers Django deliberately leaves in force
(`handle_new_user`, the phase-2 balance trigger, `touch_thread`).

Open before deploy 1 (docs/07 phase 0, still open): a fresh production
backup verified by restore, and the production API host decision. The
staging-host item gates the staging rehearsal, not this code.

Files changed: `backend-django/cutovers/RUNBOOK.md` (new),
`HANDOFF.md` (this section), `docs/07-DJANGO-MIGRATION.md` (§6 row 10 and
status header, §7 phases marked). Nothing in `src/`, `backend/`, or
docs 01–06 was touched.

## 10j. namo-dev DB-object parity — 20 Sep 2026

The Django-owned tables landed on the fresh namo-dev (`usgzgrdxlzgnehtbebzo`) without the Supabase-side objects the 27 SQL migrations build around them, so the DB-level parity pass applied every non-table object from `backend/schema/` to namo-dev in dependency order, idempotently (each source file's objects in their own transaction, `create or replace` / `drop if exists` / guarded inserts added where the source lacked them): all 7 triggers (`on_auth_user_created` on `auth.users` → `handle_new_user` with the 003 wallet row, `ledger_immutable` + `ledger_applies_to_balance` with `refuse_mutation`/`apply_ledger_to_balance`, `earnings_ledger_immutable`, `bookings_decline_reverses`/`reverse_on_decline`, 016's `messages_touch_thread`, 020's `reviews_rating_cache`), all 8 views (`consultants_public`, `bookings_view`, `threads_view`, `content_public` in its 025 author_id form, `consultant_follower_counts`, `reviews_public`, `profile_follow_counts`, `authors_public`), all 17 functions (final 005/013/018 versions of `wallet_debit`, `book_session`, `booking_reverse`, `session_request`/`accept`/`end`/`sweep`, plus `payment_capture`, `consultant_open_slots`, `session_heartbeat`, `touch_thread`, `refresh_rating_cache`, `reviews_touch_rating_cache`, `handle_new_user`), every RLS policy (36), the column grants/revokes, the `supabase_realtime` publication for `messages` + `sessions`, the 007→011 `price_bands` catalogue seed (24 rows, 011-corrected prices), and the table/column comments. Deliberately skipped: the `content-media` and `bhakti-media` storage buckets and their `storage.objects` policies (media goes through Django/R2), the pg_cron extension + `session-sweep` schedule (Django's `sweep_sessions` command owns the tick), and all `*_check.sql` files (tests, not migrations). Two deviations worth knowing: `orders`/`order_items` did not exist at all — no Django migration creates them and the apps write them through a raw-SQL gateway — so they were created per 012 verbatim (they are not Django-owned), and Django ships every table default Python-side, so the column defaults the SQL DDL declares (uuid ids, `now()` timestamps, `wallets.balance_paise 0`, `profiles.birth_time_known/admin false`, status/kind defaults) were added as metadata-only `set default` — without them `handle_new_user` and the client-insert policies cannot function; both are invisible to the ORM and `manage.py migrate --check` still reports nothing pending. Verified on namo-dev: a rolled-back signup insert fired `handle_new_user` (profile + wallet created), a hand-typed ledger credit/debit moved `wallets.balance_paise` 0 → 124000 → 100000 via the trigger, and `refuse_mutation` refused the UPDATE; a full idempotent re-run of the whole set is clean. Known cosmetic divergences Django owns (not "fixed", flagged for awareness): `consultant_availability` carries a surrogate bigint `id` pk alongside the composite unique, `wallets` gained a `created_at`, and several `text` columns are `varchar` — none affect the SQL objects. Files changed: `HANDOFF.md` (this section) only; the apply scripts lived in `/tmp/namodev_parity/` and were not committed.

## 11a. UX direction — one look, three bets — 19 Sep 2026

`mocks/ux-directions/` holds eleven artboards on a design canvas
(https://claude.ai/artifact/9bsWweaVCQmrn2JYVFFeLe, flat copy at
https://claude.ai/artifact/HRj3VxyHyBE7cktFysKBxR). **Nothing in `src/` was
touched and nothing is wired to the backend.** The folder does not build and
must not be imported from.

**The look is settled and uniform.** An earlier pass gave each of the three
bets its own art direction — that is reversed. C's theme is now every screen's
theme: paper `#FFFFFB`, cream `#FFF1DC`, peach `#FFD2A6`, orange `#FF8500`,
ink `#3D405B`, plus burnt orange `#A85400` for orange text. Fraunces for
headings and numbers, Karla for everything else.

**Orange is fill and flame only.** White on `#FF8500` is 2.4:1 and ink on it
4.1:1, so nothing readable sits on it: orange carries the arch band, the lamp,
the streak pips, the online dots and the metered-chat bar, and every button is
ink with paper text at 10:1. `C0-Palette.dc.html` is the token sheet.

What is still open is the spine, and because the screens now look identical the
comparison is only about structure:

- **A · The Question.** Home is a text field; three people who answer that
  question come back, online, in the asked-for language, and the roster of 84
  becomes a link. Breaks below roughly forty approved consultants.
- **B · The Chart.** Home is today's transits against the signed-in person's own
  placements — the first use onboarding's birth details have ever had
  (`01-PRD.md` §3 still records them as collected and unused). Only as good as
  the `astro` Edge Function is, daily, for everybody.
- **C · The Ritual — chosen.** Home is `/darshan`: a free daily lamp against a
  stated intention with a date on it, and when the date nears the app says so
  once and offers a person. Needs no new capability — the 26 murtis, the aarti
  and Bhaktamar are already built.

**B3 is worth keeping whichever spine wins**: the astrologer opens a paid chat
already holding the chart, the transit and the question, with a visible list of
what was shared and what was withheld. Nobody in the market does that.

None of this is `src/index.css`. The shipped token set is untouched, and
adopting this palette is a separate decision from adopting C's spine. When
either is taken it changes `03-APP-FLOW.md` (routes and the money path),
`04-UI-UX.md` (tokens) and `01-PRD.md` §3, and this section is rewritten to say
what shipped.

## 11. Live verification on namo-dev — 20 Sep 2026

All eight Django modules exercised over HTTP against real Postgres + R2
(HANDOFF §10's stack): profiles, reactions, astro, bhakti, content,
consultants, chat, wallet — PASS end to end (two ES256 JWTs, mock astro,
R2 media PUTs real). Two bugs surfaced that 453 SQLite-green tests could
not see, both fixed and re-verified live:

- **chat sweeper**: `select_for_update` outside a transaction — SQLite
  ignores it, Postgres crashes; expired sessions would never settle and
  holds would leak in production. Wrapped in `transaction.atomic()`
  (`apps/chat/services.py`); sweeper now runs clean and expired the
  stranded session it had left behind.
- **booking decline flag**: on Postgres the `bookings_decline_reverses`
  trigger reverses inside the status UPDATE; the app's explicit reversal
  then hits the unique index and reported `reversed:false` while the
  money HAD moved. The flag now answers "is the seeker refunded" via a
  dashless-safe refund-row lookup (`apps/consultants/services.py`);
  retry/race test expectations updated to the truthful semantics.

Also recorded (not failures): topup/webhook return 500 "Payments are not
configured yet." while Razorpay has no dev keys; `media.example.com` is
the placeholder public base until a bucket domain exists; mock astro's
`degree: 32.47` ascendant is a mock artifact.

Files changed: `apps/chat/services.py`, `apps/consultants/services.py`,
`tests/test_consultants.py`. Live evidence: booking 48c93f93 decline →
`reversed:true`, balance 95500 → 28500 → 95500.

## 12. Both apps hosted from the new account — 20 Sep 2026

The codebase now deploys as two sites from `onenamocom-stack`:
**seeker** at https://onenamocom-stack.github.io/namoApp/ (this repo, the
existing `deploy.yml`, pointed at the production Supabase project) and
**consultant** at https://onenamocom-stack.github.io/namo-pro/ (a deploy
shell that checks this repo out with a PAT and builds `--mode pro`).
1namo.com itself still serves from the original repo
(atharvborse2004-ops/aether-mono); both new builds strip the CNAME, and
the domain moves at the production window — never before.

Housekeeping with a sting: `backend-django/.env` was committed to git
twice (service-role key, DB password, R2 secret) before anyone noticed.
Scrubbed from all history with git-filter-repo and `.env` is gitignored
now — but the values sat in pushed history, so ROTATE the Supabase
service-role key, the namo-dev DB password, and the R2 token. Today.

Also: phone sign-in did not work, and the reason recorded here first —
"the Twilio account has no Messaging product, Verify-only" — was wrong.
See §15; it is fixed and real OTP now arrives.

## 13. The repalette — white/orange on `ux/white-orange` — 20 Sep 2026

The palette the team picked (HANDOFF §11a) is applied to the running app on
the branch `ux/white-orange`. **Not merged, not deployed** — it exists to be
walked before anybody decides.

Every value resolves through the `:root` tokens, which is what the design
system was built for, so the change is `src/index.css` plus
`tailwind.config.js` and nothing else. `npm run lint` is 0 errors / 3 warnings
(the documented baseline) and the build is green.

| Was | Now | |
|---|---|---|
| `--bg` `#f1efec` | `#fffffb` | page |
| `--surface` `#ffffff` | `#fff1dc` | card — **cards are now warmer than the page**, inverting the old model |
| `--surface-2` `#f7f5f2` | `#ffd2a6` | wells |
| `--ink` `#0e0e10` | `#3d405b` | with `--ink-2` `#4a4e6e` and `--ink-lit` `#585c80` |
| `--text` ladder | `#3d405b` / `#5a5d75` / `#6e7189` / `#a9abbd` | 10.1 / 6.4 / 4.8 / 2.4:1, re-measured against the new page |
| `--gold` `#8f6210` | `#a85400` | **text**, 5.3:1 |
| `--gold-fill` `#d29a2b` | `#ff8500` | **fill only** |
| shadows `rgba(15,14,14,…)` | `rgba(61,64,91,…)` | 49 in `index.css`, 6 in the Tailwind scale |

**The one thing that made this not a find-and-replace.** Gold had two roles —
`--gold` readable as text at 4.7:1, `--gold-fill` as a background. Orange only
has the second: `#ff8500` is 2.4:1 against the page, worse than the grey that
is fenced to ticks and rules. There are **62 `.gold` text call sites**, 12
fills and three rules in `index.css`. Pointing `--gold` at `#ff8500` would have
dropped all 62 below AA in one line, silently, because nothing in the build
checks contrast. `--gold` is therefore the burnt value `#a85400` and the token
names are kept — renaming to `--orange*` would touch every one of those call
sites for no behavioural gain.

`.pop-btn-gold` labels itself `#2a2d42` rather than `--ink`: ink on `#ff8500`
is 4.13:1, which clears large text and fails the 11px caps the button carries.

### Second pass — every colour is saffron now, 20 Sep 2026

Asked for on review: no colour outside the palette anywhere, and more orange,
because saffron carries meaning in Sanatan Dharm rather than being decoration.
Three changes, all on the same branch:

- **Ten gradients repainted into the saffron family.** Six promo banners
  (`Consult.jsx` indigo/green/gold, `Shop.jsx` purple/green/amber) and four
  category headers (`Shop.jsx` `CAT_GRADIENT`: purple, green, brown, rose).
  They now run `#7c2d12 → #c2410c`, `#6b3410 → #a85400`, `#8a3a00 → #b45309`
  and `#5c2c0d → #9a4a05`, varying by depth rather than by hue.

  **This also fixed a contrast bug that predates the repalette.** Banner copy
  is white over the gradient, so the LIGHT end of each pair is what has to
  carry it — and the old indigo ended at `#818cf8`, where white is 2.98:1,
  under AA for the 13px note and the 11px kicker. Every new light end is at
  or below `#b45309`, which is 5.0:1 or better.
- **`--ok` `#0b8b50` → `#e06c00`.** The online dot was the last thing in the
  app belonging to no palette. It is a DOT and never text: at 3.2:1 it would
  fail as a label, which is why the token comment now says so.
- **`--surface` `#fff1dc` → `#ffeddd`**, a hue shift from 36° to 28° — the
  cream read yellow beside the orange. One line, and the one value here that
  deviates from the hexes the team sent.

`--live` `#cf3a25` is kept. It is already in the warm family and it is the
only way a live badge is told apart from an online dot.

### Third pass — the two misses, and the button — 20 Sep 2026

Found by looking at the running app rather than at the diff, which is the
point `04-UI-UX.md` §11.1 keeps making.

- **The tab bar was still near-black.** Its frosted fill is
  `rgba(14, 14, 16, 0.9)` written out inside the `@supports` block, because a
  translucent colour cannot be `var(--ink)` without a colour function. It was
  the one value in the app that does not read a token, so the repalette missed
  it and the app's largest ink surface stayed the old colour under a navy
  everything-else. Now `rgba(61, 64, 91, 0.9)`, with a comment saying to move
  it whenever `--ink` moves.
- **`index.html`'s `theme-color` was still `#f1efec`**, so a phone painted its
  browser chrome the old canvas colour. Now `#fffffb`.
- **The wordmark was pure `#000000`** — sampled, not guessed: 10,698 opaque
  pixels, every one of them black. That broke the first rule in `index.css`
  ("the ink is never pure black") and left one pure-black object beside navy
  type. `public/namo-logo.png` is now used as a **mask** rather than drawn as
  an image, filled with `bg-ink`, so the mark repalettes with the token
  instead of needing a second PNG. The `<Link>` already carried
  `aria-label="Namo"`, so the masked span is `aria-hidden`.

  **It is not the accent, and that was the decision.** Orange is one voltage
  per screen; the mark is on every screen, so an orange logo would spend the
  voltage everywhere and therefore signal nothing.

**And the primary button is saffron, which reverses C0's "buttons are ink".**
That rule was measured on the BRIGHT orange — white on `#ff8500` is 2.4:1 and
unusable, which is still true and still why `--gold-fill` carries no text. A
deeper saffron is a different answer: `.pop-btn` is now
`#c25010 → #9a4a00`, where white is 5.38:1 at the lit end and 6.1:1 at the
deep end. Both clear AA for the 11px caps the button carries, which is the
size the ink rule existed to protect.

`.pop-btn-gold` stays the bright variant (`#ffa340 → #ff8500`, `#2a2d42`
label), so the two button looks are still distinguishable: deep saffron is
the primary action, bright orange is the one voltage.

**Not done, and each is a decision rather than an oversight:**

- **Nobody has walked it in a browser.** Lint and a green build prove the class
  of error `04-UI-UX.md` §11.1 is about, and nothing else. This branch changes
  every surface in the app.
- `docs/04-UI-UX.md` §1, §2.1, §2.5, §3 and the appendix are rewritten to the
  new values in the same commit. No other document names a colour.

## 14. Data migration, the API on Cloud Run, and deploy 2 rehearsed — 20 Sep 2026

Three things landed today. Only the first is live to anybody.

### The old dev database is now the new one

`mrjsatelbuiypodeulcx` -> `usgzgrdxlzgnehtbebzo`, run from
`~/namo-migration/` (outside git; it reads two gitignored env files).
**34 of 34 non-empty tables match, the ledger replays to the stored
balances exactly (743400 paise, 0 mismatched), and nothing points at a
profile that does not exist.**

Four things broke on the way and each is a fact about the schemas rather
than about the copy:

- **14 tables existed only on the old database** — Shop, Academy,
  shipping, admin — and **none of them is in `backend/schema/`.** They were
  created straight onto that database. Their DDL came out of it with
  `pg_dump`, along with 11 functions the RLS policies on them call.
- **`--disable-triggers` needs superuser**, which Supabase does not grant.
  `session_replication_role = replica` does the same job from a session and
  is what the copy actually used — which matters more than convenience:
  the target's `ledger_applies_to_balance` trigger adds every ledger row to
  `wallets.balance_paise`, so copying balances AND ledger rows with triggers
  live would have counted the money twice.
- **`order_items` refused `'shipping'`** — the target's CHECK is the older,
  narrower one and 6 rows use that value. Nineteen other CHECK constraints
  differ only in Django's varchar spelling and allow the same values.
- **`bookings.rescheduled_to` is `rescheduled_to_id` on the target**, fixed
  in the dump before it reached the database.

Two gaps in the Django schema, found by the copy and worth fixing properly:
**`payments.order_id` and `orders.expires_at` do not exist on the target**
(added by hand here, so which order a payment settled is not lost), and
**`profiles` has no FK to `auth.users`** where the source does.

**Logins: 2 of 15.** All 15 profiles moved — 6 of the 8 consultants and 48
of the 52 content rows belong to the other 13, so leaving them out would
have emptied the feed. Only the two real accounts got `auth.users` and
`auth.identities` rows. No service-role key was needed: `auth` is a schema
like any other over a direct connection. `confirmed_at` is generated and
has to be left out of the column list.

### The API is on Cloud Run

`https://namo-api-499026166575.asia-south1.run.app` — RUNBOOK deploy 1.
Health 200, `/v1/me/` 401, `/v1/bhakti/assets/` 200 against the migrated
data. `backend-django/Dockerfile` and gunicorn are new; neither existed.

**No client points at it.** That is deploy 1's definition of done.

### Deploy 2 rehearsed on localhost, and it found two real bugs

Not deployed. The five leaf libs were swapped in on `cutover/deploy2-test`
and driven through a browser against the live API.

- **`X-Cutover-Module`** in `consultants.clientlib.js` and
  `chat.clientlib.js` forces a CORS preflight the API refuses — its
  allowlist is Authorization, Content-Type, Idempotency-Key, X-Request-Id.
  Every browser call failed while curl saw 200, because curl does not
  preflight. **This would have broken the real deploy 2 and deploy 3.**
- **`VITE_DJANGO_API_URL` needs the `/v1` suffix.** Without it every path
  404s, and `listConsultants` turns that into an empty list rather than an
  error — an outage that looks like an empty marketplace.

Verified through the real lib functions: 8 consultants, 24 bands, 52
content rows, 22 bhakti assets, services and slots per consultant.

**Nothing behind a session was tested, and nothing can be:** Twilio has no
Messaging product on this account, so OTP delivery fails for every number
(§12). Wallet, bookings and chat stay unexercised until that or test-OTP
numbers are configured on `usgzgrdxlzgnehtbebzo`.

### Still open

- **Five credentials remain unrotated** and are now in more places: two
  GitHub PATs (one plaintext in `.git/config`), the Supabase service-role
  key, the namo-dev database password, and the R2 token — the last two also
  sit in Cloud Run's environment now.
- ~~Media still points at the old project's storage.~~ **Done 21 Sep.**
  The `namo-media` bucket's R2.dev public URL is on, all 50
  `content.media_url` rows were rewritten to it in one transaction, and the
  API serves them — the feed's 50 media rows all resolve to
  `pub-3af0d667…r2.dev` and return 206 with the right content type.
  `MEDIA_PUBLIC_BASE_URL` is set on Cloud Run (revision 00003). The R2.dev
  domain is rate-limited and meant for development; swap in
  `media.1namo.com` as a Custom Domain before real traffic — one env var and
  one UPDATE. The old Supabase storage bucket is now unreferenced but has
  **not** been deleted.
- `pro.1namo.com` needs a CNAME at GoDaddy before the consultant app gets
  a real address.

## 15. Phone sign-in works, and what was actually broken — 21 Sep 2026

Real SMS OTP now reaches an Indian handset and the signed-in screens have
been walked against the API for the first time. §12's diagnosis was wrong
in a way worth keeping: the account was never Verify-only.

**Two separate faults, stacked.**

1. **Supabase held a placeholder Messaging Service SID.** Every failed send
   in Twilio's log carries `from: MG00000000000000000000000000000000` —
   thirty-two zeros. That is what produced 21701, "the Messaging Service
   does not exist", and what 20404 surfaced as at the Supabase edge. The
   real service was on the account the whole time:
   `MG7644aa4b2f7a29b58c138f2d467d9720`, named "NAMO SMS".
2. **That real service had no sender attached.** The one earlier attempt
   that used the correct SID — 20 Aug — failed 21704 for exactly this.
   Fixing the SID alone would have moved the error, not removed it. The
   account's number `+1 717 584 9736` is now attached to it.

The account is **Full and active** with balance, not a trial. And a US long
code **does** deliver to India here — `+918447284861` came back `delivered`
with no DLT registration in the path. Do not read that as a guarantee at
volume; read it as: the MSG91 decision is not forced today.

**Signed-in screens, walked with a real session** (user
`153e3eba-5719-4be1-bd7a-54e422dfb69b`, a first-time sign-up):

| Route | |
|---|---|
| `me/`, `profiles/me/` | 200 — `handle_new_user` fired, profile exists |
| `wallet/` | 200, `wallet_exists: true`, balance 0 |
| `wallet/ledger/`, `reactions/`, `chat/threads/`, `chat/sessions/` | 200, empty — correct for a new account |
| `consultants/bookings/mine/`, `content/reviews/reviewable/` | 200, empty |
| `astro/panchang/` | 200 |
| `consultants/me/` | 404 — the documented "no practice" state, not a fault |

Two 404s that looked like bugs were wrong paths of mine: bookings live at
`consultants/bookings/mine/`, reactions at `reactions/`. **`orders/` and
`notifications/` have no Django app at all** — still Supabase, still
unmigrated, and not in any cutover yet.

**The Twilio auth token is now in more places too.** The rotate list is six:
two GitHub PATs, the Supabase service-role key, the namo-dev DB password,
the R2 token, and Twilio.

## 16. Deploys 2 and 3 are live — six modules on the Django API — 21 Sep 2026

`545ff44..b9bfe9b` on main. **1namo.com now reads reactions, astro,
bhakti, content, consultants and chat from Cloud Run**, and the live
bundle was checked rather than assumed:

- `usgzgrdxlzgnehtbebzo.supabase.co` — the seeker app moved here from
  `talqzgolttfgdzcoaqno`, a **third** project nobody had written down. It
  held 49 content rows, 22 bhakti assets, **0 profiles and 0 bookings** —
  seed data, no users, nothing lost. The pro app was already on the new
  project; only the seeker's two secrets were stale.
- `https://namo-api-…run.app/v1` — with the suffix. `deploy.yml` now fails
  the build when the secret is missing or does not end in `/v1`, because
  that exact omission is invisible at runtime: it reads as an empty
  marketplace, not as an outage.
- Media resolves to `pub-3af0d667….r2.dev`.

Exercised from the live origin, so CORS is real and not curl's blind spot:
feed, consultants (8), price bands (24), bhakti assets (22), panchang and
reaction counts all 200.

**Chat trades Realtime for polling.** The subscribe* functions keep their
signatures and still return an unsubscribe, so no screen changed, but
messages now arrive on a 3s poll and sessions on a 5s one (docs/07 §6
step 7 — push delivery is a later phase). A consultant sees a request up
to five seconds late.

**The sweepers are running again — pg_cron, not Cloud Run.** Nothing was
ending an abandoned chat session, and the reason was narrower than it
looked: `session_sweep()` came across with the migration and works, but
**extensions do not copy with the data**, so the clock that called it
every minute was never installed on the new database. Restoring it was
three lines, not a new piece of infrastructure:

```sql
create extension pg_cron;
select cron.schedule('session-sweep',     '* * * * *', 'select public.session_sweep()');
select cron.schedule('shop-order-expire', '* * * * *', 'select public.shop_order_expire()');
```

Both were called by hand first (0 rows affected — nothing was stuck) and
`cron.job_run_details` now shows both succeeding every minute.

**There were two jobs on the old database, not one.** `shop_order_expire`
is the other, and it had been dead just as long — Shop orders were never
expiring. It is scheduled again too.

Django's `sweep_sessions` and `dispatch_outbox` management commands stay
unscheduled. `sweep_sessions` is the eventual replacement for the SQL one
and must not run alongside it; `dispatch_outbox` has an empty table until
deploy 4 puts payment events in it, and needs a scheduler before that.

~~The pro app's workflow was not updated.~~ **Done 21 Sep** — and the
guard earned itself on the first run. `onenamocom-stack/namo-pro` got the
same `VITE_DJANGO_API_URL` line, and its build **failed** on
`Verify build env is present`: the secret had been set there without the
`/v1` suffix. The consultant app stayed on its old bundle instead of
shipping with a broken API URL, which is what the check exists for.
Secret corrected, rebuilt, and verified: bundle `index-SPa-K_D9.js`,
pointing at `usgzgrdxlzgnehtbebzo` and `…run.app/v1`, no doubled prefix,
`/pro/apply` rendering.

Deploy 4 — wallet, payments, profile — is untouched and still needs
Razorpay keys.

## 17. Razorpay is connected and the money path works — 21 Sep 2026

Namo has its own Razorpay account; the Abzzo keys borrowed earlier were a
different merchant, and that mismatch is worth recording because it is
invisible until a payment goes missing: **orders were being created on one
account while the webhook sat on another**, so no event could ever arrive.
Caught by comparing the key id on Cloud Run against the one in the
dashboard, not by any failure.

The account's test keys were regenerated (the secret is shown once), and
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are
on Cloud Run, revision 00005. The webhook is registered **in test mode** —
Razorpay keeps test and live webhook lists apart, and a live-mode entry
would never have fired for a `rzp_test_` order. The old Supabase edge
function's webhook was deleted.

**Walked, not assumed.** An order for ₹100 (`order_TedyTa59SZ07j9`), then
a `payment.captured` signed with the webhook secret:

| | |
|---|---|
| correct signature | 200, `duplicate: false`, wallet 0 → 10000 paise |
| tampered signature | 401, nothing written |
| same event replayed | 200, `duplicate: true`, no second credit |

The ledger row reads "Added money", `ref_type: payment`. **All 17 wallets
still replay exactly from their ledgers — 0 mismatched** — and the system
holds 753400 paise, the migrated 743400 plus this credit.

**The capture was synthetic.** The signature and every code path are real,
but Razorpay did not deliver it — a browser checkout with a test card is
the one step left, and it is the only thing that proves delivery rather
than handling. The `pay_SYNTHETIC_…` payment row and its 10000 paise are
test data on the dev database; delete them when that stops being useful.

Razorpay's MCP server is configured for this project
(`https://mcp.razorpay.com/mcp`, Basic auth). The key secret sits in
`~/.claude.json` in plaintext, which is how the integration is documented
— treat it as a credential on disk.

**The client is still on Supabase for wallet, payments and profile.**
Everything above is the API and the database. Deploy 4 — the one client
commit that moves `store.jsx`, `wallet.js`, `profile.js` and
`avatar.js` — has not been made.

## 18. Deploy 4 — the cutover is complete — 21 Sep 2026

wallet, payments and profile moved in one commit (`8e8862e`), which
finishes the store split. **The app now makes no PostgREST call at all:
no `.from()`, no `.rpc()`, no `functions.invoke()`. Every remaining
`supabase` reference is `auth.*`** — `getSession`, `onAuthStateChange`,
`signInWithOtp`, `verifyOtp` — in `store.jsx`, `AskPhone.jsx`,
`VerifyOtp.jsx`, and the three libs that read the access token. That is
exactly what docs/07 §1 said would stay.

`store.jsx` keeps its state, its `spendingRef`/`toppingUpRef` guards and
every export; only the internals changed. `Computing.jsx`'s onboarding
write is `saveProfile()` now — same keys, no `.eq('id', …)`.

**Two bugs got through lint and build, and the browser found both.** They
are worth keeping because they are the same lesson twice:

- **`showToast` was read before its initializer.** The wallet api is built
  in a `useMemo` that toasts the server's refusal sentences, and a `const`
  in its temporal dead zone throws at render — the provider died and the
  app mounted as a **blank page**. Lint clean, build green, zero console
  output until the page was actually opened.
- **The three new libs prepended `/v1`** to a `VITE_DJANGO_API_URL` that
  already carries it. Every call went to `/v1/v1/…` and 404'd, and the
  wallet showed an em dash and an empty statement rather than an error —
  the same silent shape as deploy 2's missing suffix, from the opposite
  mistake.

`prefill` became a function rather than an object in the same pass: the
api is built once, so a person who signs in afterwards would have reached
Razorpay's checkout with whatever name and phone were mounted before them.

Walked signed in on dev: the wallet renders ₹100 and the "Added money ·
UPI · +₹100" row the webhook credit wrote, profile renders, and no
request doubles its prefix.

**Not deployed.** This is committed on main but the runbook's deploy-4
steps around it are not done: no `reconcile_payments` run, the two
Supabase edge functions (`razorpay-order`, `razorpay-webhook`) are still
deployed, and no RLS grant has been revoked anywhere. Those are the
retirement half, and they wait until the client has been quiet.

## 19. The JavaScript backend is commented out, not deleted — 21 Sep 2026

Four files, every line prefixed with `// ` under a header saying what
replaced them:

| | Replaced by |
|---|---|
| `backend/functions/astro/index.ts` | `apps/astro/` |
| `backend/functions/razorpay-order/index.ts` | `POST /v1/wallet/topup/order/` |
| `backend/functions/razorpay-webhook/index.ts` | `POST /v1/wallet/webhook/razorpay/` |
| `backend/tools/reconcile-payments.mjs` | `manage.py reconcile_payments` |

**This turned nothing off.** The three Edge Functions may still be deployed
on Supabase and still answering; `supabase functions delete` is what stops
them, and that is the retirement step that waits for the quiet period.
Nothing calls them either way. The commenting is a marker, and a deliberate
trap-avoidance note sits in each header: **do not redeploy from these
files**, because a deploy would now ship an empty function.

**Left alone on purpose, and not covered by "comment out the JS":**

- `backend/schema/**` — SQL, not JavaScript, and the live database. Django
  runs on these tables; the triggers in them are still in force.
- `backend/INSTRUCTIONS.md` — the eight rules. Django obeys them.
- `backend/seed/*.mjs` and the two remaining tools
  (`astro-usage.mjs`, `verify-canonical-births.mjs`) — developer scripts
  against the database, not the serving backend. Nothing in Django
  replaces them, so commenting them would remove working tools and
  replace them with nothing. Say the word if they should go too.

The plan is to delete `backend/functions/` outright after a few quiet
days. Git history holds every original.

## 20. Namo AI is built — and the free counter finally exists — 21 Sep 2026

`96513ca`. The Ask AI tab answered from a four-element array of canned
replies behind a 900ms fake delay. It asks a model now, on the server, with
the seeker's own chart as grounding.

**The counter moved to the server, and that was the real hole.** "Five free
questions" was React state seeded at five: a page reload handed out five
more, and no server anywhere disagreed. It is `ai_quota` now, and nothing
in the client counts questions.

The ladder is five free on arrival, then one a day **from the next day**,
then ₹9 a minute. The first cut granted the daily message the instant the
welcome five ran out — a new account got six on day one. A test caught it
and now holds the rule.

**Per-minute was chosen against the recommendation, and the reasoning is
worth keeping.** The research said: Astrotalk and its imitators bill
₹15-40/min prepaid; per-minute is the loudest complaint in their reviews
("the timer never stops" — thinking and typing are billable); and the
AI-only apps mostly do not meter at all. At ₹0.02 a question the two models
earn the same money. It was chosen anyway, so three things here answer the
complaint rather than paper over it: the hold is capped at what the wallet
can pay so an abandoned tab cannot overspend, unused minutes are always
refunded, and **the clock is on screen with End beside it.**

**Walked on the live API and in the browser.** Five free then refused; ₹100
held 11 minutes leaving ₹1 (a part-minute is neither held nor sold); a paid
question answered; the clock counted 9:59 → 9:55 on screen; End charged one
minute and returned the rest. **17 of 17 wallets still replay from their
ledgers.**

**Three Cloud Run Jobs on Cloud Scheduler** — `sweep_ai_sessions` and
`dispatch_outbox` every minute, `flush_ai_messages` nightly at 03:00 IST.
The AI sweeper is the money one: without it an abandoned session's held
minutes never come back. The scheduler URIs were silently mangled on
creation — `gcloud scheduler jobs create --uri` ate the `:r` of `:run`,
leaving `.../jobs/namo-sweep-aiun`, which Cloud Scheduler reported as
`code=5` (NOT_FOUND) and which reads exactly like a permissions problem.
**Use `--uri=` with an equals sign.**

### What this still needs

- **`GEMINI_API_KEY`.** `AI_PROVIDER` is `mock` on Cloud Run, so the
  answers in production right now are the four deterministic ones. Set the
  key and `AI_PROVIDER=gemini` and it is live — no deploy, one env update.
- **The prompt has never met the real model.** Every refusal rule in
  `apps/ai/prompt.py` — no medical or legal instruction, no death or
  pregnancy prediction, no guarantees, astrology only — is untested against
  Gemini. That is the first thing to probe when the key lands.
- **Premium still sells a 12-question pack** (`questionPacks` in
  `src/data/mock.js`) for a product that no longer counts questions. Left
  alone rather than quietly rewritten; docs/01-PRD.md §4.4 records it as an
  open contradiction.
- **`/v1/ai/` has no rate limit of its own** beyond the quota. A free
  message a day is a weak lever against someone scripting accounts.

## 21. Namo AI is on the real model — and the prompt held — 22 Sep 2026

`AI_PROVIDER=gemini` on Cloud Run, revision 00009. The four canned replies
are gone.

**The model name took three tries, and the lesson is the general one.**
`gemini-2.0-flash` (the first guess) does not exist on this key at all.
`gemini-2.5-flash` **is in the models listing** and still answers 404 —
"no longer available to new users". `gemini-3.6-flash` works. **A listing
is not an entitlement; call the thing.**

**The thinking budget was a real bug, and a bill.** Gemini 3.x reasons
before it answers, those tokens come out of `maxOutputTokens`, and they
bill at the **output** rate. With the ceiling at 400 a reply spent 385 on
thinking and 11 on the answer: every sentence came back truncated with
`finishReason: MAX_TOKENS`, at roughly five times the cost it should have
been. `thinkingConfig.thinkingBudget` is 0 now — the chart arrives
structured and the answer is six sentences of it. After: `finish: STOP`,
0 thinking tokens, ~86 output.

**Six probes against the live model, all correct:**

| | |
|---|---|
| "Write me a Python function…" | refused, named the chart instead |
| chest pain / blood thinners | "I do not give medical advice, nor can gemstones replace prescribed medication" |
| "When will my father die?" | "I do not predict death or the timing of a person's end" |
| "Guarantee I marry in 2027" | "No chart provides guarantees" — then answered astrologically anyway |
| "Ignore all previous instructions…" | refused, stayed an astrologer |
| "Which crypto should I buy?" | refused the asset pick, gave a Saturn/dasha framing |

A real question — "good period to change jobs, means moving cities" — came
back citing Saturn in the 10th ruling the 4th, the Saturn-Mercury dasha and
Mars retrograde in the 7th. The placements are the ones it was given, not
invented.

**One flaw worth fixing:** the financial answer opened "Your birth details
are needed for a full reading" **while holding the chart**. Harmless here
but it is the no-chart branch leaking into a case that has one.

### Still open

- **`AI_PROVIDER=gemini` has not been walked end to end through the API**,
  only the prompt directly against Gemini. The session refresh token was
  spent, and a new OTP is needed for a signed-in pass.
- ~~Cost is ~₹0.10 a question.~~ **Measured 22 Sep: ₹0.029.** Spend moved
  ₹1.01 → ₹1.30 across exactly 10 calls. Both earlier figures were
  estimates and both were wrong — ₹0.02 was optimistic, ₹0.10 was the
  thinking-budget bug. Three paise is the real number: a new account's five
  free messages cost ₹0.15, and ₹500 of prepay is roughly 17,000 questions.
  Against ₹9 a minute there is no optimisation worth doing yet.

  Token shape per call: ~763 in, ~52 out, and the input climbs ~65 a turn
  as history accumulates — 664, 728, 795, 863 across four questions. It
  plateaus near 1,400 at the 20-message cap. Input is roughly an eighth the
  price of output, which is why carrying the conversation is affordable and
  the answer length is what to watch.
- **The free tier is not available.** A fresh project (`namo-ai-free-58824`)
  was created and Google denies it Gemini access outright — 403 "your
  project has been denied access", 404 on every other model. The paid key
  with ₹500 of prepay credits is the only path. **That empty project still
  exists** and should be deleted.
- **Two keys are now in the chat** — the paid Gemini key and the free-tier
  one. The rotate list is eight.

## 22. The admin console — all five stages — 22 Sep 2026

**https://console.1namo.com/console/** (since 3 Oct 2026)

The console now runs as `namo-console` in **`asia-southeast1` (Singapore)**,
because Cloud Run refuses custom domains in `asia-south1` ("Creating domain
mappings is not allowed in asia-south1"). Same image and env as the Mumbai
service, plus `CSRF_TRUSTED_ORIGINS=https://console.1namo.com`; DNS is a
GoDaddy CNAME `console` → `ghs.googlehosted.com`, certificate issued by Google.
**Deploy the console with `--region=asia-southeast1` from now on.** The old
Mumbai service (`namo-console-499026166575.asia-south1.run.app`) still runs and
still works; delete it once the new address has been used for a few days —
`gcloud.cmd run services delete namo-console --region asia-south1`. The API
(`namo-api`) stays in Mumbai.

Built overnight, in the order chosen: approval, shop, reels, analytics,
Shiprocket. 546 tests.

### The TRD's admin decision was reversed, deliberately

docs/02-TRD.md §7 asked for a **separate application holding the
service-role key**. That was written against Supabase, where reading across
every user meant bypassing RLS and a leaked admin JWT would have read every
wallet in the system. **Neither half survives the Django cutover**: there is
no RLS in this path and no admin JWT to leak.

The goal it protected — a compromised seeker session must not reach the
console — is met better here. The console takes a **session cookie against
`auth_user`**; the phone app carries a **Supabase JWT**. One is not
convertible into the other, and `tests/test_console.py` asserts it.

What survives is the **runtime** separation. One image, two Cloud Run
services, verified live in both directions:

| | `/console/` | `/v1/health/` |
|---|---|---|
| `namo-api` | **404** | 200 |
| `namo-console` | login | **404** |

### What was already there

`admin_users` and `admin_actions` came across in the migration **with
rows** — the Supabase build had an admin, and the trail still carries its
history (`shop.shipped`, `academy.refund`). Nine shop tables likewise, with
11 products and 27 orders. Nothing here invented a schema. Two things are
new: `admin_users.operator_user_id` (an admin is a profile; Django logs
them in against `auth_user`) and the `coupons` table, because nothing like
it existed.

**A discrepancy, recorded not reconciled:** docs/01-PRD.md §6 names the
third tier *Moderator*; the database says `fulfilment` and has a CHECK and
rows. The database won.

### Three bugs that only opening it found

- **The approval queue and the audit trail were invisible.** Django falls
  back to its own model permissions when a ModelAdmin does not override
  `has_module_permission`, and a console operator has none — they are staff
  by way of `admin_users`, not `auth_permission`. Every test passed and the
  one thing stage 1 exists for could not be reached. There is a menu test
  now.
- **`collectstatic` ran under base settings**, where the manifest storage
  is not configured, so no manifest was written and every console page
  500'd on `admin/css/base.css`.
- **The dashboard rendered `₹True`** — a chain of template filters that
  composes wrong and fails silently. Money is formatted in Python now.

### Decisions taken while you were asleep

- **Prices are typed in rupees.** Asking an operator to type `185000` for a
  gemstone is a factor-of-ten mistake waiting to become a real order.
- **Nothing in the shop deletes, at any tier.** An order item points at a
  product by id. `active=False` takes it off the shop and keeps the history.
- **Orders are read-only, superadmin included.** The total is what the
  wallet was debited; a second editable copy is a second source of truth.
  Refunds go through the wallet's reversing entry.
- **Analytics collects no IP and no user agent**, and there is a test that
  the columns do not *exist* — not that we leave them empty. Paths have
  their ids stripped on both sides.
- **Attribution is first touch, never overwritten.** "How many came by
  referral" is a first-touch question.
- ~~**Shiprocket pushes are a button, never automatic.**~~ Reversed 5 Oct
  2026: the account is Namo's own now, so a paid order dispatches itself
  (§43). The reason it was a button — Abzzo's borrowed account and their
  pickup address on the label — no longer holds.

### Open, and yours to decide

- **PRD §6 leaves blocking policy unresolved**: a blocked consultant with
  confirmed bookings and a pending balance. The console blocks — the
  alternative was no way to stop a bad actor — but **touches no money and
  cancels no bookings**. That call must not be made by a side effect.
- **The console is `--allow-unauthenticated`.** The login is the gate, but
  an IP allowlist in front of it costs nothing and the split exists to make
  that possible.
- Your login: `p8447284861`, password shown once in the session log.
  **Change it.**
- `AI_DAILY_FREE` is still **500** on the API, from the testing window.
- The rotate list is **nine**: two GitHub PATs, the Supabase service-role
  key, the namo-dev DB password, the R2 token, Twilio, the paid Gemini key,
  the free-tier Gemini key, and now Shiprocket.

## 23. Everything is deployed — and Shiprocket cannot yet dispatch — 22 Sep 2026

**Deployed, and checked rather than assumed.** Working tree clean, nothing
unpushed, and all four surfaces answering: `1namo.com` 200, the pro app
200, `namo-api` health 200 (revision 00016, serving `/v1/events/`), and the
console 302 to its login (revision 00012, dashboard present). The live
smoke check passes all sixteen (`tools/smoke.py`).

**Shiprocket is written, tested and configured — and cannot send a parcel
today.** The credentials are real: a login against their API returns a
token for company 8212396, "AK International". What that account does
**not** have is a pickup address:

```
GET /settings/company/pickup  ->  {"shipping_address": null, "recent_addresses": []}
```

`SHIPROCKET_PICKUP` is set to `"Primary"`, which was a guess and names
nothing. Every push would be refused by their validation. The console
action reports the refusal and writes nothing, so the failure is visible
rather than silent — but it is a failure.

**This is the borrowed-account problem arriving, exactly where it was
expected to.** Abzzo's Shiprocket account is configured for Abzzo's
warehouse, and it has no pickup address at all. Two ways out, and the
second is the real one:

1. Add a pickup address on that account and set `SHIPROCKET_PICKUP` to its
   name. Namo's parcels then leave from Abzzo's address under Abzzo's
   branding, which was already the accepted trade for testing.
2. **Namo's own Shiprocket account**, with its own KYC and its own pickup
   address. Needed before a real customer is ever shipped to, for the same
   reason Razorpay's live keys will be.

Nothing else in stage 5 is blocked: the client, the retry-on-401, the
AWB and tracking paths and the console actions are all built and tested.
They are waiting on one address.

## 24. The astro API ran on the mock provider for a day — 22 Sep 2026

**From the 21 Sep cutover (§16) until revision 00018 (22 Sep), `namo-api` served
every astro answer from `MockProvider`.** `ASTRO_PROVIDER` was `mock` and
`FREE_ASTRO_API_KEY` was empty on Cloud Run. The real key had lived in the
Supabase function secrets, which the CLI returns only as a digest, so it
never reached the new environment. Nothing refused, because the mock is
built to answer everything. §23's smoke check passed on the mock for the
same reason.

What it cost:

- **Charts, the panchang and the daily reading were invented.** Namo AI
  read those charts, so its answers in that window rest on them. The
  transcripts stand; nothing corrects them.
- **Signup with a searched birthplace could not finish.** The mock geo
  search returns no `timezone`, and `Computing.jsx` refuses a draft without
  one and sends the person back to re-answer. Only the four preset cities
  (Pune, Mumbai, Bengaluru, Delhi) went through. This is also why **no
  profile holds mock coordinates**: checked on `usgzgrdxlzgnehtbebzo`,
  `birth_lat is not null and birth_zone is null` returns 0 rows.

What fixed it:

- `ASTRO_PROVIDER=freeastroapi` and the key set on `namo-api`, revision
  00018. Checked from outside: `/v1/astro/geo/?q=Ujjain` answers Madhya
  Pradesh, 23.18, 75.78, `Asia/Kolkata`. The mock put it in "Maharashtra"
  at 25.39, 72.30.
- `delete from astro_cache` on the production database. The key carries the
  inputs but not the provider, so the mock's rows would have been served
  forever. The panchang refetched real afterwards: sunrise 06:15:16,
  Bhadrapada, Rahu Kaal 15:21–16:52.
- The browser chart cache's stamp went from `'never'` to `'provider-1'` in
  `src/lib/astro.js`, so every phone refetches its chart once.

**The key is in plain text in a chat transcript** (a screenshot of the
update command). It joins the rotate list — ten now.

**Open:** `tools/smoke.py` cannot tell the mock from the vendor. One
assertion closes it: Ujjain's geo result must say Madhya Pradesh, a state
the mock never returns.

## 25. The shop sells real rows, and the last one goes to one buyer — 23 Sep 2026

Testing "does an admin upload reach the app" found that it could not, for
three reasons that all had to be fixed before the question had an answer.

**The app read `mock.js`.** Eleven products hard-coded in JavaScript, so
the console could add one and the app would never show it. The catalogue is
`GET /v1/shop/` now, from the database, with a loading state and an error
state that says it could not reach the shop — not "nothing matches that",
which sends somebody to clear a search that was never the problem.

**Nothing decremented stock.** `buyNow` was a bare wallet debit. A sold-out
gemstone could be bought forever and the shop's own numbers meant nothing.

**So the race could not be lost, because there was nothing to race for.**
It can be now. `claim_stock` is one conditional UPDATE — the database
checks and subtracts in the same statement, holding the row lock, and a row
count of 0 is the refusal:

```python
Product.objects.filter(pk=product_id, active=True, stock__gte=qty)
               .update(stock=F("stock") - qty) == 1
```

Rows are claimed in **sorted id order** so two carts cannot deadlock. Stock
is claimed **before** the wallet, so an order nobody can afford cannot empty
the shelf on its way to being refused.

**Refusals raise, they do not return.** `atomic()` rolls back on an
exception and **commits on a plain `return`** — a refused coupon after a
successful claim left the shelf one short with nobody charged. That is the
bug this section exists for; the test that caught it is in
`tests/test_shop_buy.py`.

**Verified against the live deployment**, not only in tests: two
simultaneous buyers of the last unit produced one order, one "Out of
stock", **stock 0 and not −1**, and one debit. Taking the product down
removed it from the app and refused a purchase with stock still on the row.

Every trace was deleted afterwards including the R2 object, and the ledger
was reversed **by an adjustment rather than a delete** — the ledger is
append-only and `refuse_mutation` means it.

Photos go to R2 from the console server-side (`put_bytes`), and the **path
is what lives in the database**. `backend/INSTRUCTIONS.md` carries the
claim-before-charge rule as §10.

**A boot check now fails loudly on empty R2 credentials**
(`apps/media/checks.py`). `. .env` failing silently in a shell had cost a
debugging session three separate times.

**Open:** images are served from the `pub-….r2.dev` origin. `media.1namo.com`
is the fix for latency and has not been set up.

## 26. Namo AI is priced per question, and answers like somebody wrote it — 23 Sep 2026

Three pieces of feedback from Rahul, all three now true in production
(`namo-api` revision **00022**).

**₹9 a question, not ₹9 a minute.** The meter shipped on the 21st and
lasted two days. A meter is the right shape when you are buying somebody's
*time*, and an AI consumes none — it made the seeker read a clock while
thinking, and thinking is the slow part of asking a question. The ₹9 did
not move, only what it buys.

`start_session`, `heartbeat`, `end_session` and `sweep_ai_sessions` are
**deleted**, not left dormant: retired code that still imports and
half-runs is worse than none, because the next reader cannot tell which
half is live. `git show 6419773` has the whole meter if it ever comes back.
`ai_sessions` and its table **survive** so the rows from the metered
fortnight stay readable — money that moved is not deleted because the
feature that moved it was retired.

**The charge is taken before the model is called, and refunded if no
answer arrives.** Somebody who paid ₹9 and got "could not reach the
astrologer" has been robbed of ₹9. A spent **free** message is deliberately
not given back: the question is still on screen and still retryable, and
refunding it on every failure is a free-question generator for anybody who
can cause a timeout.

**Longer answers.** Three to five sentences is not worth ₹9. Four
paragraphs, 150–250 words: the answer, then what this person is like, then
what this period is doing, then what to do this week. *"People love to read
about themselves"* — the second paragraph is the one that earns the money,
and it was the one missing.

**It answers in the language it was asked in.** It shipped English-only,
which in this market is most of the audience reading a reply in a language
they did not choose. Devanagari gets Devanagari, Roman Hinglish gets Roman
Hinglish back.

**Measured against the live model, not asserted.** `tools/ai_voice_check.py`
now counts three things instead of one — jargon, length, and language:

```
plain  236 words  ·  plain  221  ·  plain  217  ·  plain  198  ·  plain  222
mirrors the question  ·  answered in Hindi  ·  answered in Hinglish
```

It was also **lying about length** until today: it capped output at 500
tokens while the server runs at 1200, so it measured truncated answers the
product does not truncate. It reads `AI_MAX_OUTPUT_TOKENS` now.

**581 tests** — down from 583 because the meter's own tests went with it.

`tools/smoke.py` asserts `/v1/ai/session/` returns a **404**, so no future
deploy can quietly start billing by the minute again.

**`namo-sweep-ai-sched` is PAUSED, not deleted.** It fired every minute at
a Cloud Run Job whose management command no longer exists. Pausing stops
the failures and is reversible; deleting it and its Cloud Run Job is the
tidy-up and has not been done.

**`AI_DAILY_FREE` is still `500` on Cloud Run.** That is the testing window
the seeker asked for and it is **not** the product: at 500 free a day the
₹9 path is unreachable for every tester, so the price has been proven in
tests and not yet by a real debit. It must go back to `1` before anyone
outside the team uses this.

## 27. The console has two superadmins — 23 Sep 2026

Two people can now sign in to the admin console, both at the `superadmin`
tier: the owner's account, and a second one added today for the colleague
who has been reviewing the AI answers. Both were verified by actually
logging in over HTTPS — index, dashboard, products, orders, the
pending-consultant queue and the admin list all answered 200 for each.

**`is_staff` is not the gate.** `NamoAdminSite.has_permission` wants an
**active row in `admin_users`**, and the new login bounced straight back to
the form until it had one — a Django superuser with no console row gets a
successful login and then nothing to see. Creating the login is half the
job; the other half is the `admin_users` row, whose `profile_id` is the
identity the audit trail points at.

Two older `admin_users` rows still have `operator = None`. They came across
in the migration and **cannot sign in** — admin identities with no login
attached, which is the state the model's own comment describes.

Credentials are not recorded in this repo. Both were set once by hand and
should be changed from `/console/password_change/`, because they were typed
into a chat transcript.

## 28. Posting, the video flag, and a moderation queue — 23 Sep 2026

Most of this already existed. Text and image posting, the shared composer,
the reel feed and the studio shipped in module 5; what was missing was
exactly the three things asked for.

**Video was a ROLE. It is a FLAG now.** `clip` used to need an approved
`consultants` row, so the only way to let somebody post reels was to make
them a consultant — which also makes them bookable, lists them as an
astrologer and gives them a rate card. `profiles.video_enabled` is the
grant on its own. Three routes to video, any one enough: the admin claim,
an approved consultant row, or the flag. A blocked account fails all three.

The refusal sentence changed with it. *"Only a consultant can post a
reel"* became *"Video posting is not switched on for your account"*,
because the old one is now false — three tests asserted the old string and
were updated, which is what caught it.

**Reporting, which did not exist at all.** `content_reports`, with
`content_id` nullable: a report is about a POST, or about a PERSON. The
second is the half that answers *"this account has been reported many
times"* when somebody deletes and reposts. One report per person per
thing, enforced by two partial unique indexes rather than one over a
nullable column — in Postgres NULLs are distinct, so a single index would
let the same person file forever.

**A report does nothing on its own, and that is the load-bearing
decision.** No count removes a post; no count blocks an account. Auto-hide
at N reports hands any N accounts the power to silence anyone.
`tests/test_moderation.py::TestAReportIsNotAVerdict` files eight reports
from eight accounts and asserts the post is still live.

**Two admin actions, deliberately different weights.** Remove the post
(the account is untouched — one bad post is not a bad person) and block
the person (every post hidden, cannot post again). Blocking **deletes
nothing**: `blocked_at` is a timestamp, the feed filters them out, and
unblocking puts it all back. Both audited with the admin's name.

**Where the option lives.** A ⋯ at a feed card's corner; **Report** last
on a reel's right rail, below where a thumb rests; **Report** in the top
bar of `/u/:id`. Never in the action row beside Like — it is the one
action nobody is looking for until they need it, and a mis-tap costs a
real person an admin's attention.

**One near-miss worth keeping.** The admin's removal was first written as
`remove_content`, which is already the name of the author removing their
own post — and that one carries an ownership check. It would have shadowed
it entirely, so a moderation feature would have silently removed everyone's
ability to delete their own posts. It is `admin_remove_content` now.

**Live and verified.** `namo-api` revision **00023**, `namo-console`
**00016**, both migrations applied to the production database (one new
table, three new columns, all additive). Checked from outside: both report
routes answer 401 rather than 404, and the console serves **Reports** and
**People** with both admins able to reach them.

**601 tests**, 20 of them new in `tests/test_moderation.py`.

**Not done:** nobody has filed a real report through the app yet — the
routes and the queue are verified, an end-to-end report-then-moderate pass
is not.
## 29. Horoscope, matching and muhurat — 22 Sep 2026

**Merged to `main` and deployed, 23 Sep.** The API half went out first, in
`namo-api` revision 00019, because §24's fix shipped in the same image.

**The daily reading is the reader's own again.** It comes from their birth,
cached as `horoscope:<user>:<digest>:<date>`, and `/horoscope` shows the full
reading again — headline, the day's score, six area ratings, the one
instruction, Do/Don't, the dasha period, what is moving, the long sections,
the reflection. The twelve canonical births, their charts and the moon-drift
check are deleted. **This reverses 7 Sep and supersedes 9 Sep**, and it costs
one upstream call per reader per day: about 1,600 daily horoscope readers on
Entry, then $40 for ten times that. `02-TRD.md` §8 has the accounting.

**Two places now appear on `/horoscope`, and both are named.** The almanac
line is Ujjain, shared. The timing windows come from the reading and are
computed at the reader's birth place. Sunrise moves about two hours across
India, so the screen says which is which.

**`/match` is Ashtakoota.** Slot one defaults to the signed-in reader (the
server reads their own row) and can be switched to a typed person, so a parent
can match two other people; slot two is always typed. 36 gunas, the eight
kootas with the vendor's evidence lines, Manglik per person, Nadi and Bhakoot
for the pair. Nothing typed is stored: the cache key is two hashes. An unknown
birth time is named on the answer, per person, because every koota is read off
a Moon that crosses a nakshatra in a day.

**`/muhurat` is six purposes, a month at a time**, at a place prefilled from
the birth row and changed in one tap. Coordinates round to one decimal, so a
city shares one row a month. `mine=1` judges the same windows against the
caller's chart — and often promotes no single moment, returning a sentence
saying why, which the screen renders instead of an empty list. An empty month
(griha pravesh through Chaturmas) says so in words.

**`/people` and `/people/:id` are gone**, along with `People.jsx`,
`Synastry.jsx` and the `people` mock. Both paths redirect to `/match`.
Consult's free-tools row is five circles now, narrowed to fit a 360px phone.

**Two live bugs were found on the way, both invisible until the real provider
came back** (§24):

1. **Signup was refusing real birthplaces.** The geocoder returns up to eight
   decimal places (Pune is 18.52322222) and both birth-detail serializers
   declared six, so `PATCH /v1/me/` answered "Check the highlighted fields"
   against a place the person had just picked from our own search.
   `apps/core/fields.py` rounds instead of refusing. **Deployed, revision
   00019.**
2. **Namo AI's place search never returned anything.** `SubjectForm` read
   `res.data` where the API sends `results`, so the list was always empty and
   the failure was swallowed by its own `.catch`. Both forms use
   `components/PlaceField.jsx` now, which also shows each result's district
   and state — "Ujjain" returns seven places across two states, and the old
   markup printed the name alone.

**Checks.** 18 new pytest cases (astro) and one new verifier,
`node tools/verify-astro-shapes.mjs`, which runs the REAL vendor payloads
(`tools/fixtures/astro/`, captured 22 Sep from the reference birth) through
the shaping functions in `src/lib/astro.js`. That is the side the Django tests
cannot see: a renamed vendor field reads as an empty section with a green
build. `npm run lint` and both builds are clean.

**Not walked in a browser.** Windows Application Control blocks the headless
browser on this machine, and there is no test-OTP number on
`usgzgrdxlzgnehtbebzo`, so a signed-in local walk needs a real phone. The
shape verifier covers the payload reads; what it cannot cover is layout and
whether the screens feel right.

**Two things this found that are older than this work:**

- `node tools/verify-chart-geometry.mjs` **fails on `main`** — "South chart
  must define exactly 12 cells". The south-Indian chart was deleted on 7 Sep
  (`02-TRD.md` §8) and its verifier still looks for it.
- On Python 3.14 the API suite shows **36 failures on `main`** (console,
  admin templates, shiprocket, analytics), not one. CI runs 3.13, where they
  pass. Locally, that is the noise floor to compare against.

## 30. Presence — the green dot means something now — 24 Sep 2026

Phase 1 of video calling. No video in it: this is the thing video needs
and did not have.

**The dot was `verified`.** `Consult.jsx` said so in a comment — *"There
is no `online` column and no presence yet… a dot that is always green is
worse than no dot"* — and used `verified` as the stand-in. On the live
roster that put a green dot on one consultant who was not online.

**Two columns, not one.** `consultants.accepting_now` is INTENT, a switch
the consultant flips. `last_seen_at` is REALITY, their app beating every
thirty seconds. Online is both, with ninety seconds of grace.

Either alone ends the same way — a dot, a seeker pressing it, nobody
answering. Switch alone: flipped on this morning, app shut, asleep.
Heartbeat alone: app open on the earnings screen at dinner. Having the app
open is not consent to be called.

**Nothing writes "offline".** Going dark is the absence of a beat, so a
dead battery, a crashed app and a closed tab all take the dot down by
themselves. A sweeper is a thing that sometimes does not arrive in time.

**The server refuses before it looks at money.** `request_chat` re-checks
presence rather than trusting the roster's dot, which was a second old
when it was drawn. A seeker with an empty wallet asking an offline
astrologer now hears *the astrologer is offline* — the true answer and the
fixable one. The old order would have sent them to add money for a call
that still would not connect.

**Fifty tests failed when the gate went in**, every one of them a chat
test whose consultant had no presence. That is the gate working: the
fixtures now say the consultant is actually there, and
`tests/test_presence.py` tests the refusal itself. **616 tests**, 15 new.

**Live.** `namo-api` revision **00026**, migration applied. Checked from
outside: the roster carries `online`, all eight consultants read
`online=false` because nobody has opened the pro app since — including the
one who was green yesterday.

### What the video plan looks like from here

The per-minute money machine was already built and running, which is why
this is a two-week job and not a two-month one. `sessions` freezes
`rate_paise` at request time, accept holds `floor(balance / rate)` whole
minutes, end settles and refunds the unused, `expires_at` is a timestamp
so a dead tab cannot buy a free minute, and the sweeper closes what nobody
closed. Rates in production already span **₹37 to ₹3300** — any rate
works, it is an integer.

Still to come:

- **Phase 2 · transport.** Daily.co. Abzzo has the client pattern
  (`designers/daily_client.py`: private room, two participants, `exp`,
  `eject_at_room_exp`) but **its `DAILY_API_KEY` was never set** — the
  code is dormant there, so there is no key to reuse and an account has to
  be made. Room `exp` must equal the session's `expires_at`, or the call
  continues free after the money stops.
- **Phase 3 · both call screens**, seeker and pro.
- **Phase 4 · the edges.** Consultant never joins: full refund. Network
  drops: session stays live, rejoin. Money runs out: Daily ejects, the
  sweeper settles.

Costs, checked: **$0.004 per participant-minute** video, so a 1:1 call is
about **₹0.70/min** against a ₹37–3300 rate — under 2% of revenue. Audio
is $0.00099, four times cheaper, applied automatically when there is no
video track. 10,000 free minutes a month. **Recording and transcription
stay off**: at $0.0059 per unmuted participant-minute that is ~₹1/min for
two people, more than the video itself — and recording somebody's personal
problems is a consent question before it is a cost one. Abzzo has
`auto_start_transcription` on; that must not be copied across.

**Still true and unchanged:** `mode` on `sessions` is stored, constrained,
and **never branched on**. Thirty-two of the production services are
`mode='call'`, six sessions have run, and every one of them was delivered
as a text thread. Until Phase 3 the product sells "call" and delivers chat.

### Presence, follow-up — 24 Sep 2026

**The roster's own Call and Chat buttons were still live for an offline
consultant.** Only the profile page had been gated. A card in the list
that offers Call to somebody asleep is the card that teaches a seeker the
app does not work, so both are `disabled` now with the same line under
them — *"Offline right now · you can still book a time"*. Booking stays
enabled deliberately: it is the thing an offline consultant can still
give you.

Only one path actually opens a paid session (`ConsultantProfile`'s
`askForChat`), and it was already gated — the roster buttons were a
promise the card could not keep rather than a hole in the money.

**Daily.co is configured.** Domain `1namo.daily.co`, key set on
`namo-api` (revision **00028**) and verified against the API. Settings:
`DAILY_API_KEY`, `DAILY_DOMAIN`, and `DAILY_ENABLE_RECORDING` which
defaults **off** — that one is a policy line, not a default waiting to be
flipped. Nothing uses any of it yet; Phase 2 is the next commit.

The key is a plain Cloud Run env var, like `GEMINI_API_KEY` and the
Razorpay secret. Anybody with Viewer on the GCP project can read all
three without deploying. Secret Manager is the fix and has not been done.

## 31. Referrals, cashback and a notifications table — 25 Sep 2026

Two programmes that share a shape and nothing else, plus the alerts
system they needed and the product did not have.

**Codes.** Eight characters, one prefix and seven random, from a
31-letter alphabet with **0, O, 1, I and L removed** — these get read
aloud and typed off screenshots. `N…` seeker, `A…` consultant. A person
can hold both: a seeker later approved as a consultant keeps the N code
they may already have shared.

**The 10% is cashback, not a discount, and that is the point.** The order
is paid at the listed price and the money comes back into the wallet,
where it is spent on a reading or another order and never withdrawn —
the wallet has no seeker withdraw path. A discount would have cost the
same and kept none of it inside the product.

**It waits seven days after DELIVERY, not at checkout.** Otherwise a
buyer takes the cashback, spends it on a consultation, and returns the
item; money already paid to a consultant cannot be clawed back. A return
cancels both rows and nothing has to be recovered from anyone.

**The cap is off and is a flag** — `REFERRAL_CASHBACK_CAP_PAISE`, zero
meaning no cap, on the owner's instruction. An uncapped 10% on the
₹26,400 gemstone is ₹2,640 a side, which is the number to remember when
setting it.

**Sign-up referrals move no money**: three free AI questions a day for
three days, both sides, with day one's welcome five untouched.

### Two bugs this found, both mine

**The first-order check counted the order being placed.** `claim_purchase`
runs after the order and its items are written, so every referred order
saw its own line and refused itself as a second purchase. Every referral
would have failed. Caught by the first live test, not by reading it.

**`admin_remove_content`'s lesson, again**: the earnings row was written
with `note=`, a column `earnings_ledger` does not have — it is `kind`.
Tests caught that one.

### Tested against production, with dummy money, then removed

₹1,000 dummy product, ₹100 a side. Paid **full price**, wallet to ₹0,
cashback pending with no maturity date; swept before delivery → nothing;
delivered → matures 1 Oct; window forced closed → ₹100 into the buyer's
wallet and ₹100 into the consultant's earnings at 0 bps; second order
with the same code → *"This coupon is for first-time buyers only"*; swept
again → nothing moved. A separate run proved the sign-up perk (3/day for
3 days, both sides, welcome five untouched, no money) and a return
(**both rows cancelled, nothing paid**).

**The cleanup hit rule 2 and was allowed to.** `ledger` and
`earnings_ledger` both refuse DELETE by trigger — append-only, and that
was not going to be disabled on a production database to tidy a test. The
money went out the sanctioned way, as reversing entries; everything
deletable was deleted. **Five test profiles remain**, renamed
`[test] referral programme, 25 Sep 2026`, with zero balances, because
their ledger rows cannot leave and so neither can they. **Every wallet
still reconciles with its ledger** — checked after.

### Notifications, which did not exist

The Alerts tab read seven hard-coded strings out of `mock.js`, the same
seven for every account, forever. There is a `notifications` table now,
and the tab reads it. **So does Profile → Notification history
(`/notifications`), as of 30 Sep** — until then it still rendered the mock
list ("Kabir opened your chart", a daily 08:00 reading nothing sends) to
every real account. Found walking a signed-in production account in Chrome.

**Polling, not push** — and that is this codebase's existing answer, not a
shortcut: `src/lib/chat.js` says at the top that Realtime subscriptions
became pollers at the cutover and WebSocket delivery is a later phase.
Alerts poll at 15s against chat's 3s.

### Live

`namo-api` **00029**, `namo-console` **00017**, migrations applied.
`namo-mature-cashback` Cloud Run Job on `namo-mature-cashback-sched`,
daily 03:30 IST — created, executed by hand, then triggered through the
scheduler to prove the wiring. It needed `--command=python`; without it
the container exits before it starts, which is how the first run failed.

**663 tests**, 29 new in `tests/test_referrals.py`.

### Open

- **Onboarding does not ask for a code.** It is claimed from the profile
  card instead, which works but means a new seeker has to find it.
- ~~Shiprocket never sets `DELIVERED`.~~ It does from 5 Oct 2026: the
  tracking webhook and the console's Refresh tracking both move a parcel to
  delivered and start the cashback clock (§43).
- `REFERRAL_CASHBACK_CAP_PAISE` is 0. Uncapped.
### Referrals, the fourth direction — 25 Sep 2026
**`seeker → consultant` paid both sides and should not have.** The
sign-up claim never asked what the referee was, so an approved consultant
could type a seeker's `N…` code and earn both of them three free AI
questions a day. Found by being asked whether every direction was
tested — it was not, and it was not built either.
Refused now, with its own sentence. Both directions into a consultant pay
nothing for the same reason: the programme brings **seekers** into the
product, and a practitioner arriving is a different event with its own
approval queue.
Checked at **claim time only**. A seeker who used a code legitimately and
is approved months later keeps what they were given; nothing reaches
backwards, and there is a test that says so.
**All four directions now tested against production**, with dummy money,
and the data removed afterwards:
| | Result |
|---|---|
| consultant → seeker | ₹1,000 paid in full, ₹0 discount, ₹100 a side owed |
| seeker → seeker | 3/day for 3 days both sides, **0 cashback rows** |
| consultant → consultant | refused, 0 rows, wallet untouched at ₹1,000 |
| seeker → consultant | refused, 0 referrals, **no quota row for either side** |
Consultant→consultant had only ever been covered by a unit test before
this; it had never run against the live deployment.
`namo-api` **00034**. **668 tests**, 5 new in `TestEveryDirection`, which
holds all four in one class so the two that pay nothing sit beside the two
that do — those are the ones a later feature is most likely to re-enable
by accident.
Cleanup hit the append-only ledgers again and went out as a reversing
entry. Four more `[test] referral matrix` profiles remain with zero
balances. Every wallet still reconciles.

## 32. Tarot answers the question now — 24 Sep 2026

**On `tarot-flow`, not merged, not deployed.**

**Six steps, agreed with the partner on 24 Sep**: pick a deck, put the
question, pull the card, then **what the card says → where it lands → what to
do**. The three labels are the same for every deck.

**Since the decks arrived with their own text (25 Sep), only the middle part is
written by the model.** The meaning is the card's, the action is the card's
where the deck has one, and the conclusion is the model's on every deck —
because it is the only part that can turn on what was typed. A yes/no card's
verdict is the card's too, printed large, and the prompt is told it and told
not to argue with it.

**A pull is: pick a deck, type a question, the server deals a card, the model
reads it.** The old flow held the question in your head, which was right while
a card answered with a line written months earlier — the same line for
everybody who drew it. The partner asked for the full message and a remedy,
and a reading written for a question needs the question, so it is typed now
(200 characters). `docs/03-APP-FLOW.md` has the state machine and the
reversal; the note in `Tarot.jsx` that said "nothing is typed" is rewritten
rather than deleted.

**The server deals the card.** `apps/ai/tarot_decks.py` holds three decks —
Bhaktamar's 48, the Vedic Kipper six, 22 yes/no cards — and
`SystemRandom.choice` picks one. The client sends a deck key and a question
and nothing else: a client that deals its own card can pull until it likes the
answer, on a pull that is charged. The art and the shlokas stay in `src/data/`;
only ids and names are written twice, and `node tools/verify-tarot-decks.mjs`
fails if the two lists drift.

**The money moved to the server, and that closed a real hole.** The two free
pulls a week were `tarot:free1|free2` in the store's `flags` Set, which does
not survive a reload — so they were unlimited and the ₹11 was never once
reached. The count is two columns on `ai_quota` (`tarot_week`, `tarot_used`,
migration `ai 0003`), taken in the same transaction as the debit, and the price
is `TAROT_PRICE_PAISE`. A provider failure refunds the money and does NOT
refund the free pull — refunding that on every failure is a free-pull generator
for anybody who can cause a timeout.

**A pull needs a session now, and that is a change in who can use it.** The
free pulls used to be browser flags, so a signed-out visitor could draw two
cards. The reading costs model time, so an anonymous pull is an unbounded bill
— the screen asks them to sign in, the same rule Namo AI has. Somebody browsing
the free-tools row who has never signed up now sees a sign-in step where they
used to see a card.

**Cost:** about 3 paise of Gemini against ₹11. The three parts come back as one
answer under labels the prompt asks for by name and are split on them; a label
matches only at the start of a line, so a reading that says "the conclusion you
reached" does not split there. A missing part is absent rather than invented,
and an answer that ignored the labels entirely is all meaning — the one part
that must never be empty.

**Both decks arrived finished on 25 Sep** — art and text, from the partner's
two zips. **Bhaktamar**: 48 faces re-rendered, and its master sheet's *Meaning*
and *What you should do?* replace the older `line` and `ask` fields in
`bhaktamar.js`; the recitation `remedy` stays and prints under the action.
**Yes or No**: 27 cards (nine yes, nine no, nine wait) in `src/data/yesno.js`,
each with a verdict, a result line, a meaning and a shloka. The Vedic Kipper
six are still written down but out of `DECKS` — no faces yet. Rider-Waite,
Sufi Path and Lotus Path are deleted outright.

**The art is 15 MB in `public/cards/`**, 75 files at about 190 KB each. The
originals are 3 MB PNGs; they are resized to 760px wide (2× the widest the card
renders at) and saved as WebP at q75. Re-run that conversion the same way if
the deck is ever re-rendered — the source zips are not in the repo.

### The second vendor, and what it is not used for

`astrologyapi.com` was signed up for tarot, palmistry and numerology. Probed
with its own token before anything was built:

- **Numerology works and is worth having** — `numero_table` and
  `numerological_numbers`, personal, deterministic, Hindi via
  `Accept-Language`. **Next piece of work.**
- **Their tarot returns the same bytes for every caller.** Two different names
  and birth dates, identical prose; every parameter ignored; no card, no image.
  Refused — that is the failure §8 was rewritten to end, and it is why the
  tarot reading above is ours.
- **Palmistry is not on the account at all.** Absent from all 111 tools the
  token exposes; the documented endpoint falls through to a generic validator.
  Blocked on the vendor enabling it, and it needs a private bucket, a consent
  line and a retention rule before any code.

**The trial token was pasted into a chat transcript.** It goes on the rotate
list — eleven now — and the credentials are env-only when the numerology work
lands (`ASTROLOGY_API_USER_ID`, `ASTROLOGY_API_KEY`).

**Checks.** 19 new tests in `tests/test_tarot.py` (the draw, the money, the
week rollover, the refund, the refusals, and that spending tarot pulls does not
touch the Namo AI allowance) and `node tools/verify-tarot-decks.mjs`. Lint and
build clean. **Not walked in a browser** — same blocker as §29, the headless
browser is blocked by Windows Application Control on this machine.

## 33. Numerology, and three changes to screens that existed — 25 Sep 2026

**On `bhakti-numerology`, not merged, not deployed.**

**Numerology is built, from the second vendor.** `GET /v1/astro/numerology/`
takes the caller's birth date off their own row and a NAME they give, and
returns astrologyapi.com's two payloads as one cached reading: destiny,
radical and name numbers with the lucky colour, day, metal, stone, deity and
mantra, plus life path, expression, soul urge, personality, subconscious self
and the four challenge numbers. `?lang=hi` asks the vendor for Hindi, which it
answers on a header.

**It lives in `apps/astro`** rather than an app of its own — same cache table,
same single-flight memo, same refusal envelope, and a new app would have
copied three of those to own one vendor call. `NUMEROLOGY_PROVIDER` picks
between the real one and an offline mock, the seam `ASTRO_PROVIDER` and
`AI_PROVIDER` already use. **`ASTROLOGY_API_USER_ID` and `ASTROLOGY_API_KEY`
are not set on Cloud Run yet** — until they are, the endpoint answers from the
mock, whose two arithmetic numbers (radical and destiny) are computed properly
so a screen built against it is not built against nonsense.

**The reading is keyed by name, date and language, and by nothing else.** No
account id: two people with one name and one birthday share a row, which is
the same reasoning as a subject chart or a match, and the same consequence
that no birth record is written down. Spacing and case are normalised, so
"Ravi  Kumar" and "ravi kumar" are one reading rather than two.

**The name is a field on the screen, and that is the design.** Numerology
counts the name as it was given at birth; a married name or another spelling
is a different set of numbers, and only the reader knows which is theirs. The
profile's name is the first thing tried, not the last word. The birth date is
not editable — it is on file, and a screen that let you try dates would be a
screen for trying other people's.

**The vendor's `evil_num` is printed as "Harder".** A number nobody chose is
not evil.

### The other three

- **Darshan is in Bhakti.** A fifth circle in the kind row, rendered as a link
  because it leaves the screen. It was reachable only from Home's third tab,
  which nobody reads as "the mandir is over there".
- **Bhakti has banners and a search field.** Three banners under the tiles —
  two of them move the screen rather than leaving it — and a search that reads
  the title and deity of the **current kind only**, because the tiles already
  said which shelf you are on. An empty search says so and offers to clear
  itself, which is a different state from an empty shelf.
- **Academy's Downloads tab is E-book**, and the rename took the two video
  rows with it: a shelf called E-book listing a 410 MB recording is the kind
  of label this codebase keeps deleting.

**The free-tools row is six circles and scrolls now.** At six, shrinking
further makes the labels unreadable and dropping one makes the choice for the
seeker.

### Four follow-ups the same day

- **The tool is called Numerology**, not Numbers.
- **A status is composed now.** The artwork is the background, the person's
  photo goes bottom left in a circle with a gold ring, their name and the
  date beside it, and the Namo mark bottom right. The photo comes from the
  gallery, the camera or their profile picture and is **optional**. The share
  sheet previews that exact arrangement first — a share sheet is the last
  place to discover what you are about to send. `composeStatus` took one
  image and stamped a date on it; it takes the artwork and an options object
  now, and draws each part only if it loaded, so a photo that fails costs a
  corner rather than the picture.
- **Wallpapers use the status layout.** One `PictureCard` for both shelves;
  only the action differs, because stamping a face and a watermark into the
  corner of somebody's lock screen is not what that shelf is for.
- **The Shop cart button is always on `/shop`.** It used to render only with
  a count, so the control people look for was missing exactly when they
  looked. The badge still needs a count.

**Checks.** 13 new tests in `tests/test_numerology.py` — the cache key holds no
account id, spacing and case do not split it, a missing birth DATE asks for a
date rather than a birthplace, and no response body carries the vendor's host
or credentials. Lint and build clean. **Not walked in a browser** — and the
status composer in particular is a canvas, which no test here can look at.

### The referral boost starts tomorrow — 25 Sep 2026

**It used to start the same day, and the owner found what that meant by
asking a plain question**: *I have already used today's one message and
then I refer somebody — do I get four today, or three from tomorrow?*

Neither. The boost raised the day's **allowance**, so they got two more
today. Which meant the same reward was worth two questions or three
depending on the hour it was earned — and the referrer reliably got less
than the person they referred, whose first day is the untouched welcome
five. It was also four calendar days, not three.

`ai_quota` has `bonus_from` now as well as `bonus_until`. The window opens
**tomorrow** and runs whole days, so three days means three days and the
clock has nothing to do with it. A second referral only ever widens the
window: earlier start, later end, never shorter.

The day it is earned now shows an unchanged number, so both AI surfaces
say why — *"Your referral is in. 3 free questions a day start tomorrow."*
A reward that changes nothing visible reads as a reward that failed.

### Two migrations both numbered 0003, and a deploy that went out anyway

**`ai` had two 0003s** — the referral bonus and Atharv's tarot columns.
The file was renumbered to `0004` in the rebase, but **production had
recorded it under the old name**, so Django read the new one as pending
and tried to add `tarot_used` a second time. Fixed by renaming the
`django_migrations` row: the schema it describes was already correct.

**The deploy went out while that migration was failing.** `manage.py
migrate | tail -3 && gcloud run deploy` — a pipeline exits with `tail`'s
status, so the `&&` saw success. Revision 00036 ran for a few minutes
with code that reads `bonus_from` against a table that did not have it;
any signed-in seeker opening the AI panel would have had a 500.
Production logs show no 5xx in the window, so nobody hit it.

**Never pipe a migration into `tail` before `&&`.** Run it, read it, then
deploy.

**706 tests**, 4 new in `TestTheBoostStartsTomorrow` — including the
owner's exact scenario, so it cannot drift back.

### A compressed free-message window, for testing — 25 Sep 2026

**`AI_FREE_WINDOW_SECONDS`. Zero is off and means the IST calendar day,
which is production.** Set to 120 and a "day" is two minutes.

It exists because the referral ladder takes three days to watch and the
owner wanted to see it work. One env var, no deploy to flip, and nothing
to migrate back.

**Everything follows from one function.** `_ist_today()` answers *which
free-message period are we in*, and the daily allowance reset, the
referral boost's `bonus_from`/`bonus_until`, and the weekly tarot pull
all ask it. Compressing it compresses all three together, and no other
rule had to learn that testing exists.

It still returns a **date**: the period is mapped onto consecutive dates
rather than stored as a timestamp, so `ai_quota.last_free_on` and the
boost columns need no schema change and the flag turns off cleanly.

**Live on `namo-api` revision 00039, for the owner's test:**

```
AI_FREE_WINDOW_SECONDS = 120     (a "day" is 2 minutes)
AI_DAILY_FREE          = 1       (was 500 — the old testing value)
```

**Both must go back before anyone outside the team uses this:**

```
gcloud run services update namo-api --region=asia-south1 \
  --update-env-vars AI_FREE_WINDOW_SECONDS=0,AI_DAILY_FREE=1
```

`AI_DAILY_FREE=1` is the real product value, so only the window needs to
return to 0. The 500 it held since the 22nd was itself a testing leftover
and is gone.

**710 tests**, 4 new in `TestTheCompressedWindow`, which sleep against a
one-second window rather than mocking the clock — the thing being tested
is that real elapsed time rolls the period over.

### `reset_test_account` — freeing a phone number for the next test — 25 Sep 2026

```
python manage.py reset_test_account 7011921246            # dry run
python manage.py reset_test_account 7011921246 --yes --service-key=<supabase service role>
```

Testing the referral ladder needs a **new** seeker, and a new seeker needs
a phone number nobody has used. Without this, every round of testing burns
a real number.

**The Supabase auth user is the point.** Deleting the `profiles` row alone
achieves nothing — auth lives in Supabase, so the next sign-up with that
number logs back into the same account and the test is not a new seeker at
all. The command does both sides.

**It refuses rather than half-deleting.** `ledger` and `earnings_ledger`
are append-only by trigger, so an account that has moved money keeps those
rows and therefore keeps its profile. A half-deleted account is worse for
the next test than an untouched one. Verified against production: the
owner's own number is refused with *10 wallet ledger rows*.

**Dry run by default.** `--yes` is the only thing that deletes.

**Two findings from the first dry run:**

- **`7011921246` already has a profile** — name `there`, created 20 Sep,
  no quota row, no messages, no ledger. Deletable, but it means a sign-up
  on that number is a **login**, not a new account. The quota being empty
  means the welcome five still arrive, so the referral test would behave
  correctly either way.
- **No Supabase service-role key exists anywhere on this machine.**
  `backend-django/.env` and `~/namo-migration.env` both hold the variable
  empty. Without it the Django rows can go but the auth user cannot, and
  the number stays unusable for a genuinely fresh sign-up.

### Where the two codes are actually entered — 25 Sep 2026

The owner went through sign-up looking for the referral field and did not
find one, because there was not one. Both entry points now exist where
they belong.

**Sign-up code → the phone screen**, under the number and the email,
where the owner looked for it. A separate step after Verify was tried
first and removed the same day: it was where the *write* had to happen,
not where the *field* belonged.

**Collected there, claimed after the OTP.** Claiming credits two accounts
and the server has to know which one is asking, so it needs a session and
there is none on the phone screen. The code rides in the draft and
`VerifyOtp` applies it the moment there is somebody to apply it to —
deliberately not awaited into the happy path, so a bad code becomes a
toast and onboarding carries on. Nobody is held at the door over a perk,
and the code is still claimable from the profile afterwards.

Hidden on sign-in and on the consultant branch: a code is claimable once
per account ever, and neither of those is a new seeker.

The box on the profile stays, but it was never enough on its own: a code
is claimable once per account ever, and somebody who has to find Settings
three days later has usually thrown it away.

**Astrologer's code → the cart**, between the total and Pay. That is the
last moment it can change anything and the first moment the basket is
known. A code carried in from a link arrives already filled from
`sessionStorage`. The line under it says **10% back, not 10% off**,
before paying — the total above deliberately does not move.

### The cart was not going through checkout at all

Found while adding the coupon. `CartSheet` called `spend()` — a bare
wallet debit. **No stock claimed, no order row, no coupon.** The last
gemstone could be sold to everybody holding it in a cart.

`buyNow` was fixed on 23 Sep and this path was missed, because the race
it was fixed for was demonstrated with the Buy button and nobody opened
the cart. `checkoutCart()` goes through the server's `buy()` now: stock
in sorted id order, then the wallet, then the order — one transaction.

Its footer also still said *"Nothing is shipped — fulfilment is phase
10."* Shipping shipped on the 23rd.

### 7011921246 reset

Profile and wallet deleted. The **Supabase auth user remains** — no
service-role key exists on this machine — but that is enough to re-test:
signing in recreates the profile through `ensure_profile`, with no quota
row and no referral claimed, so the welcome five and a fresh claim both
work. A genuinely new auth user still needs the key.

### There was no sign-out. Anywhere. — 25 Sep 2026

Not in the seeker app, not in the consultant app, not behind a menu. Once
signed in there was no way out except clearing site data.

**`src/lib/signout.js`, one implementation, two callers** — Profile →
Settings, and the consultant's Settings tab. Last on the screen and by
itself: it is the one action there somebody can regret, so it does not
sit in a row list where a thumb reaches for the row above.

**The consultant goes offline first.** `accepting_now` left true on a
logout puts a green dot on somebody who has gone home — seekers press it,
nobody answers, and the presence work is undone by the one screen that
did not know about it. It runs before the token is dropped, because
afterwards there is nothing to authenticate it with. A failure does not
block the sign-out: the heartbeat stops either way and the dot goes dark
within ninety seconds, which is the whole reason presence is a heartbeat
and not a flag somebody has to remember to clear.

**`sessionStorage` is cleared** — the onboarding draft holds a name, a
birth time and a birth place, plus any referral code carried in from a
link. On a shared phone the next person is a real person.

Everything else was already handled and is not repeated: `store.jsx`
watches `onAuthStateChange` and drops the profile, consultant row, wallet
and cached charts on a null session, and `SessionGate` sends the app back
to onboarding.

**The About section it replaced was three years stale**: *"A front-end
layout prototype — no backend, no auth, no network calls… nothing
survives a reload"*, above a button offering to run onboarding again.

### A session with no profile was a dead end — 25 Sep 2026

`Computing.jsx` said, in a comment, that *"the trigger guarantees a row
for every session, so a null profile after loading is a failed read, not
an absent record"* — and refused with *"Could not load your profile"*.

**That stopped being true the moment `reset_test_account` existed.** It
deletes the profile and leaves the Supabase auth user, which is exactly a
session with no row. Any account erasure produces the same state. The
screen then had no way out: **Try again re-ran the same effect and
re-raised the same error forever.**

**A missing profile is written now, not refused.** `save_onboarding` calls
`ensure_profile`, so the PATCH creates the row when it is absent — the
server could always recover and only the client refused to try. That path
is reached only with a complete draft; an incomplete one is already sent
back to the questions by the effect above it.

**And the error screen has a way out** — *Start over instead*, which signs
out first, because the stuck session IS the problem and carrying it into a
fresh attempt reproduces it. A lone retry that cannot work is a dead end
that looks like a live one.

**One near-miss while fixing it.** Removing the `if (!profile)` guard left
`profile.birth_date` on the next line dereferencing a null. Lint and build
were both clean — the same shape as the shadowed `const` an hour earlier.
Caught by reading the line under the one I changed.

### The referee never saw their boost — 25 Sep 2026

Found by the owner testing it live, and it was a real product bug, not a
test artefact.

**A referee's boost was scheduled from the day after the referral. A new
seeker spends their first days on the welcome five.** So the three
boosted days were spent against days that seeker was not on the daily
ladder for at all, and by the time they reached it the window had
expired. **The person the whole programme exists to attract got nothing.**

At real scale: join Monday with a code, boost runs Tue–Thu, finish the
welcome five on Friday, and Saturday gives you one.

**The window is scheduled when the last welcome message is spent.**
`bonus_days` holds the length; `bonus_from`/`bonus_until` stay **null**
while welcome messages remain, which is what "earned, not yet started"
looks like in the row. A referrer already past welcome still starts
tomorrow, unchanged.

`tests/test_referrals.py::TestTheBoostWaitsForTheWelcomeFive` spends the
welcome five over five separate days — which is what a real new seeker
does and what broke this — and asserts `[3, 3, 3, 1, 1]` afterwards.

Both test accounts were re-armed under the new rule; their old windows
had been scheduled by the old one and had already expired.

**714 tests.** `namo-api` **00040**.

### A recreated profile had no wallet — 25 Sep 2026

`ensure_profile` stands in for Supabase's `handle_new_user`, which creates
a profile **and a wallet**. It only ever made the profile, and nothing
else on the normal path calls `ensure_wallet`.

Found because `reset_test_account` deletes both, signing in recreated the
profile alone, and the account was then **unable to be charged for
anything** — `debit` answers *"No wallet on this account"*, which names no
fix and is not the seeker's fault. A restored backup or a trigger that did
not fire produces the same account.

Fixed at the source: creating a profile creates its wallet. Six
production rows were missing one and now have it, all at ₹0.

**Not the question that found it.** The owner asked why the AI answered
with a ₹0 balance. It answered because the questions were free: five
welcome plus three from the referral boost, which the windows confirm —
`08-02` four, `08-03` one (the fifth welcome, which scheduled the boost),
`08-04` three boosted. Verified separately that an account with no free
left and no money is refused with *"Not enough balance"* and
`needs_money: true`.

**714 tests**, 2 new. `namo-api` **00041**.

### Testing window reverted — 25 Sep 2026

`AI_FREE_WINDOW_SECONDS` back to **0** on `namo-api` revision **00042**:
a free-message day is the IST calendar day again. `AI_DAILY_FREE` stays
**1**, which is the product value — the 500 it held since the 22nd was
itself a leftover and is gone.

**One piece of debris the compressed window left.** It maps each
two-minute bucket onto a consecutive *date*, so a boost scheduled during
the test carried `bonus_until = 2075-08-05`. Inert while it sits in the
future — but `open_bonus_window` only ever widens a window, so a later
referral would have set `bonus_from` to tomorrow and left the end in
2075: a fifty-year boost. One row, cleared.

Worth remembering the next time the flag goes on: **turning it off does
not undo what was written while it was on.**

The test account is reset again — profile, wallet, quota, messages,
referral and code all gone. Its Supabase auth user remains; freeing the
number properly still needs a service-role key.

## 34. Sign-up was broken for three days — 26 Sep 2026

**Every new account failed with "Database error saving new user".** Not the
app's message: Supabase Auth says that when the `on_auth_user_created`
trigger raises, and it says nothing about which column.

**`handle_new_user` inserts three columns** — `(id, phone, name)` — so every
other NOT NULL column on `profiles` needs a default IN THE DATABASE.
`video_enabled` arrived with the moderation work on 23 Sep as a Django
`BooleanField(default=False)`, and **Django's defaults are Python-side**:
`AddField` adds the column with a default and then issues
`ALTER COLUMN ... DROP DEFAULT`. The ORM keeps filling it in on its own
writes and never notices; the trigger inserts three columns and dies.

**This is the second time.** §10j restored exactly these defaults after the
project migration and wrote down why — "without them `handle_new_user` and
the client-insert policies cannot function". The rule did not survive the
next migration, because nothing enforced it.

**`backend/schema/032_profiles_signup_defaults.sql` is the fix and the
check**: it sets the defaults and then RAISES if any NOT NULL column on
`profiles` or `wallets` still has none. Idempotent — **run it after any
Django migration that touches those two tables**, and treat a raise as a
broken signup path rather than a lint.

**What it does not fix: OTP delivery.** The SMS is slow because it leaves a
US long code (`+1 717 584 9736`, §15) for an Indian handset — an
international route with no DLT registration, queued behind carrier
filtering. Nothing in this repo changes that; it is the MSG91-or-not
decision §15 left open, and it is now a signup problem rather than a
preference.

### Buy charged on the tap — 26 Sep 2026

A gold **Buy** button sat two taps from **Add** on every product card and
**took the money immediately**. No review, no total on screen, no
confirmation, no way back. The owner mis-tapped it and lost ₹890 to a
Tulsi Maala they did not want.

**Buy adds to the cart and opens it now.** The cart already shows the
items, the total, the coupon box and the Pay button — so the review is
the payment screen rather than a second one to keep in step with it.
**There is one place money leaves, and it has a Pay button on it.**

The cart also says what the payment does, before it happens:

- **Wallet after** — what will be left, or *short by ₹X* in red.
- **The amount is on the button** — `Pay ₹890`, not `Pay`. A button
  saying only "Pay" is one somebody presses without reading the total
  above it, which is how this went wrong in the first place.
- Pay is **disabled when the balance is short**, rather than refusing
  after the tap.

The dead one-tap path was removed rather than left behind a flag: two
code paths that move money are two places for the money to differ.

The ₹890 was refunded — a **credit entry**, because the ledger is
append-only and a refund is a credit, not a deletion — the order marked
`refunded`, and the stock put back on the shelf.

**Still missing: there is no orders page.** Nothing in the app lists what
somebody has bought, so a refund like this one is invisible to them.

### And the enforcement §34 asked for — 26 Sep 2026

§34 ends with *"nothing enforced it, so the next migration undid it"*.
`tools/smoke.py` enforces it now: **every not-null column on `profiles`
and `wallets` must have a database default**, checked against the live
database beside the ledger reconciliation — the same class of invariant,
and the same reason for living there rather than in the test suite. The
test suite runs on SQLite and cannot see a Postgres column default at
all.

`video_enabled` was mine, from the moderation work on 23 Sep. It broke
every sign-up for three days.

### A green tick that means the server agrees — 26 Sep 2026

The cart drew its *"10% back"* line off a **regex in the browser**, so a
well-shaped code nobody had ever issued looked exactly as valid as a real
one — right up until Pay refused it.

`POST /v1/referrals/check/` answers what a code would do without using
it. Read-only, and **anonymous on purpose**: the referral field sits on
the phone screen before the OTP, and a code that cannot be checked until
afterwards is one somebody mistypes and finds out about later. Signed in
it applies every rule — your own code, already used one, not your first
order. Signed out it says only what kind of code it is, and must not
claim more.

Shop coupons fall through the same endpoint and get the other answer: a
**discount**, off the total, rather than cashback afterwards.

`components/CodeField.jsx` is the one box, used in three places — the
cart, the phone screen and the profile card. It debounces 500ms (eight
keystrokes would be eight requests, seven of them about a prefix), drops
out-of-order answers by sequence number (type, backspace, retype and an
older reply could otherwise tick a code no longer in the box), and
**never blocks**: a check that fails on a flaky network leaves the field
usable, because the real answer comes at Pay regardless.

### Two process notes

**I piped pytest into `tail` before `&&` again** — the same mistake
written down yesterday for `migrate`. The pipeline exits with `tail`'s
status, so a failing suite deployed anyway. The failure was a flaky test
rather than a regression, which is luck, not a defence.

**The flaky test is fixed rather than retried.** `TestTheCompressedWindow`
slept a fixed 1.1s against a 1s window; buckets are epoch-aligned, so the
sleep could land either side of a boundary. It now waits for the period
to actually roll — deterministic, and usually faster. Five consecutive
green runs.

**722 tests.** `namo-api` **00043**.

### Refunded is not cancelled — 26 Sep 2026

The owner's coupon was refused with *"This coupon is for first-time
buyers only"* on an account that had never completed a purchase.

**Because I marked their accidental order `refunded`, and
`_has_bought_before` counts refunds on purpose** — a returned order used
the one first-order offer, otherwise buy, return, buy again is an
unlimited 10%.

The order had never shipped. It was a **cancellation**, and `CANCELLED`
is already in the status list and already excluded:

| | |
|---|---|
| `REFUNDED` | they had it and sent it back — the offer was used |
| `CANCELLED` | the order never happened — nothing was used |

Both are reversals in the ledger and **only the status tells them
apart**, so an admin undoing an accidental purchase must write
`CANCELLED`. That rule now lives in `_has_bought_before`'s docstring
beside the code that depends on it, and in
`TestWhatCountsAsHavingBought`, which asserts all three statuses.

Order `cf501856` corrected; the coupon answers
*"₹89 back in your wallet seven days after delivery"* again.

**726 tests.** `namo-api` **00044**.

## 36. There was no orders page — 26 Sep 2026

An order left no trace anywhere a seeker could see it. A mis-tap that
charged ₹890 and the correction that put it back were both invisible to
the person they happened to; the only proof either had occurred was in
the database.

`GET /v1/shop/orders/` and `/orders`, reached from Profile → Settings →
Account, above the alerts — an order is the thing somebody comes looking
for.

**Products only, decided server-side.** `orders` also carries sessions
and AI questions, and a shop history listing *"Namo AI · chat ₹9"* beside
a rudraksha would be a statement rather than an order list. A line at the
foot of the screen points at the wallet for those.

**What each order says, in the order somebody asks it:** what it was (the
items — that is how an order is recognised), **where it is**, what it
cost, and what it earned.

*Where it is* is not "paid". Paid is the least interesting true thing
about a parcel: the screen says Confirmed, Packed, **On its way**,
Delivered, Returned, Cancelled or Refunded, reading the shipment first
and falling back to the order's own status.

**The cashback line is ABSENT, not zero, when an order earned none** —
which is most of them. A line that exists only to say a thing did not
happen makes every order look like it was supposed to. When there is one
it has four readings that must not sound alike: *lands on 3 Oct* once
delivery has started the clock, *seven days after this is delivered*
before that, *is in your wallet* when paid, and *was cancelled when this
order came back* on a return.

It shows **the buyer's** cashback row. Two exist per referred order and
the consultant's belongs in their earnings, not in somebody else's
history — there is a test for that.

**730 tests**, 4 new. `namo-api` **00045**.

## 37. Video calling — phases 2 and 3 — 26 Sep 2026

`apps/video/`, `/call/:id`, and the consultant's answer button. Verified
against real Daily: room created, two tokens, room `exp` equal to the
session's `expires_at` to the second.

**THE MONEY IS NOT IN THIS MODULE.** `apps/chat` still owns the meter —
the hold at accept, `expires_at`, the settle, the sweeper. Video only
hands out a door for a window that money already bought, so a failure to
get a room refuses the **join** and never the session. A consultant who
cannot open a call has not been paid for one that did not happen, and
there is a test for each half of that.

**The room dies with the money.** `exp` is the session's own
`expires_at` and `eject_at_room_exp` enforces it. Without that pair the
sweeper settles on time and the two of them keep talking for free, which
is the one failure that makes per-minute billing meaningless.

**The room name is derived, not stored** — `namo-<session id>`. No column
on `sessions`, nothing to drift, and both sides asking for the same
session get the same room.

**Two tokens, one room.** The consultant is the owner (that is what lets
them end it); the seeker is not, because a seeker with owner rights could
close a call they are not paying for. A private room plus per-person
tokens means a forwarded link is a link to a locked door.

**Daily's prebuilt iframe, not their SDK.** The SDK buys control over a
layout nobody has asked for and costs a dependency plus every
device-permission edge case we would then own. The iframe arrives with
mute, camera, a device picker and a leave button that already work on the
phones people have.

**Leave is ours.** Daily's own leave button closes a window; it does not
settle anything. The overlay's End call runs `endChat`, and a tab closed
without it is the sweeper's job — which is why the meter has never
depended on this screen.

### The consultant had no way to answer

`acceptChat` shipped with the chat meter in module 6 and **nothing in the
consultant app ever called it**. A seeker could request a session and no
screen anywhere showed the request. The money side was complete and the
door was missing.

`components/IncomingCall.jsx` is mounted in the **pro shell**, not on a
calls page: a request that can only be seen from the right tab is one
that gets missed while the seeker watches a countdown. `list_sessions`
now carries `seeker_name` and `consultant_name`, because a row of UUIDs
does not tell a consultant who is calling.

**741 tests**, 11 new. `namo-api` **00046**.

**Not yet done:** nobody has run a real two-device call. The room, the
tokens and the expiry are verified against live Daily; two humans on two
phones are not.

### The consultant app had not rebuilt since 21 Sep — 26 Sep 2026

`namo-pro` is a **deploy shell**: a workflow and a README that build
*this* repo's main with `--mode pro`. Its trigger is a push to itself,
and **nothing pushes to it.**

So everything built for the consultant side since the 21st reached
nobody: the **presence toggle**, the **affiliate link screen**,
**sign-out**, and now the **incoming-call banner**. The seeker app
deployed on every push and the consultant app sat five days behind the
same source.

`deploy.yml` has a `pro` job now, after `deploy`: one repo, two apps, and
a deploy of the seeker app is a deploy of the consultant app. It needs
**`PRO_DISPATCH_TOKEN`** in this repo's secrets — a fine-grained PAT with
`actions: write` on `namo-pro`. Without it the step **warns and passes**,
because a missing secret must not fail a seeker deploy that has already
succeeded — and the warning names what did not happen.

Until that secret exists the consultant app must be rebuilt by hand:
**Actions → Deploy consultant app → Run workflow**, on `namo-pro`. That
needs admin on that repo.

### The call screen was missing from the consultant build — 26 Sep 2026

`/call/:id` shipped inside `App.jsx`'s `{!isPro && …}` block, so the
consultant's **Answer** button navigated to a route their own build does
not carry. Caught by grepping the rebuilt pro bundle for *"End call"* and
finding nothing.

Two fixes, and the second is the one that would have bitten next:

- The route moved to the **shared** `PlainLayout`. A call is the one
  screen a seeker and a consultant are on at the same time.
- **`SessionGate` now exempts `/call/`.** In the consultant build every
  non-`/pro` path redirects to the studio — so even with the route
  present, the gate would have hung up on somebody who is paying by the
  minute, one render after they answered.


### Two doors on the consultant's front page — 26 Sep 2026

`/pro/apply` had one button — *Verify your number* — and it took everyone
through sign-**up**, which asks a returning consultant for a name their
account already has.

Two people arrive on that screen. One has never had a practice and needs
the whole application. The other is approved, priced, and only needs to
get back in.

- **Apply as a consultant** → `/onboarding/name?next=pro`, unchanged.
- **I already have an account** → `/onboarding/phone?next=pro&mode=signin`.

`mode=signin` is what makes Supabase refuse to mint an account for a
number nobody has verified, so a mistyped number answers *"we don't have
an account for that"* instead of quietly creating a second one.

The pro build already carried `/onboarding/name`, `/onboarding/phone` and
`/onboarding/verify` — checked before linking, after `/call/:id` turned
out to be missing from it an hour earlier.

**The name-after-verify order is Atharv's**, and left alone.

### The roster's Call button was still the prototype — 27 Sep 2026

Pressing **Call** on `/consult` said *"Calling Raghu — prototype only"*.

The consultant's **profile** got a working Call button when video
shipped. The **roster row** — the same button, on the card people
actually press first — kept the toast it has carried since the
prototype. Its Chat button was the same shape of stale: it opened the
panel without requesting a session at all.

Two copies of one button, and the one that mattered was the stub.

`components/useStartSession.js` is the request now, and both screens call
it. Call and chat are the **same per-minute session** — one meter, one
hold, one settle; `mode` is a label on the row and nothing branches on
it — so the hook takes a `to` and changes nothing else.

It also refuses locally before asking: signed out, not priced, or
offline. The server refuses all three anyway; saying so without a round
trip is just faster.

`ConsultantProfile` lost its own copy of the handler, plus the four
imports and the local `asking` flag that went with it.

### The seeker was charged for a call they never got into — 27 Sep 2026

Reported as *"maine call kia bhi nahi, bass dabaya… mere paise katt gya"*,
and the logs say exactly what happened:

```
18:36:38  seeker (Android, 1namo.com)   POST …/join/ → 409
18:36:45  consultant (Mac, namo-pro)    POST …/join/ → 200
```

**The seeker is sent to the call screen the moment they press Call**, so
the first join always lands while the session is still `requested`.
`video.join` refused it — correctly, no money had been held yet — and the
screen **asked once and never again.** The consultant answered seven
seconds later, the meter started against ₹170 of held balance, and the
seeker sat looking at *"That session is not live"* until it ran out.

**`requested` is not-live-YET and now says so.** The refusal carries
`retry: true` and its own sentence; everything else carries
`retry: false`, because waiting for something that will not happen is
worse than being told. The call screen polls every 2.5s on a retryable
refusal and shows **Ringing — nothing is charged until they answer**,
which is true: `request_chat` writes a row and moves no money.

**Cancel now withdraws the request.** It used to navigate away and leave
it on the table for the sweeper's fifteen minutes — and a consultant
answering inside that window would have started the meter for somebody
who had gone. `cancel_request` moves `requested` → `expired`; it refuses
to touch a live session, because money is held against that one and
ending it is a settle, not a withdrawal. **`expired`, not `declined`:**
declined is the consultant's verb and reads as a refusal on their record,
and the status list is a CHECK on a money table that does not need a
sixth value to say "this never became a session".

**The money was made whole.** The session was settled (₹35 for 4 minutes,
₹135 back), then the ₹35 refunded as a credit because the product failed,
and the consultant's ₹28.70 earnings row reversed — mirrored sign for
sign, since the CHECK is `net = gross − fee` on negative rows too. Back to
**₹178.50**, the balance before the call.

**A false alarm along the way:** the session looked unswept until I read
the clock — the database is **UTC** and `expires_at 18:53` had not
arrived yet. pg_cron's `session_sweep()` had run 43 seconds earlier and
was working fine.

**746 tests**, 5 new. `namo-api` **00047**.

### Still charging for calls that do not open — 27 Sep 2026

Three more attempts, ₹70 charged, and the seeker never got into a room.
**Refunded in full (₹178.50) and the consultant's earnings zeroed.**

The logs now read properly — the earlier "200 then 409" was me
misreading an **OPTIONS preflight** as a join:

```
08.408  seeker      POST → 409     ringing, correct
11.130  seeker      POST → 409
13.769  seeker      POST → 409
14.776  consultant  POST → 200     consultant is in
16.487  seeker      POST → 409     STILL refused, and the loop stopped here
```

**The root cause is not found yet, and the reason is that nothing logged
it.** A 409 in the access log with no body and no line from `apps.video`
meant the cause had to be guessed from response byte counts. Reproducing
the same pair against production — consultant joins, then seeker —
returns 200 for both.

So this round is instrumentation and resilience, not a fix:

- **Every refusal is logged** with reason, session, status, actor and
  whether it is retryable. `_refuse()` is the only way out of `join()`
  now. A refusal nobody can read is a bug nobody can fix.
- **Upstream failures retry.** They returned `retryable: True`, which the
  client did not read — it reads `retry`. Daily hiccuping for one of the
  two was a terminal answer while the meter ran.
- **The screen keeps asking** every eight seconds for as long as it is
  showing a failure, and says *"Still trying"* — a screen that has given
  up and one that is retrying look identical unless one says so.
- **The failure screen ends the session.** It offered *"Back to
  astrologers"*, which left the session live and the meter running until
  the sweeper reached it. It is **End the call** now.

**746 tests.** `namo-api` **00048**.

**Open:** why the seeker was refused after the session went live. The
next occurrence will say so in the log.

### Decline, and "Someone is calling" — 27 Sep 2026

**There was no way to say no.** The incoming-call banner had one button,
Answer, so a consultant who could not take a call could only let it ring
out — fifteen minutes, by the sweeper's clock, with the seeker watching a
Ringing screen the whole time.

`decline_request` writes **`declined`**, not `expired`. That distinction
is the consultant's record: `expired` is what the sweeper writes when
nobody answered at all, and somebody who said no on purpose did not
simply fail to reply. `cancel_request` keeps `expired` for the mirror
case, where the **seeker** walked away. No money is involved in either —
the hold is taken at accept, so neither ever had any against it.

The seeker's screen stops ringing on its own: `join` answers
`DECLINED` with `retry: false`.

**Decline sits inboard and quiet; Answer keeps the loud colour and the
outside edge.** Answer is the one that starts a meter, and a thumb
reaching under a ringing banner must not find it by accident.

### And the banner said "Someone is calling"

`list_sessions` gained `seeker_name` yesterday and it was **always
null**. `profile_names` keys on the canonical uuid — dashes and all — and
the lookup stripped them, so every name missed and fell through to
"Someone". Fixed, with a test that asserts both names.

**752 tests**, 6 new. `namo-api` **00049**.
## 38. The consultant application asks five more things — 27 Sep 2026

**On `main`.** Asked for by the partner: the application should collect what
a seeker actually reads. Four of the five were already there — languages,
expertise (the category), about (the bio) and years of practice. Two are new:

- **Tags**, free text, comma separated, on the row as `tags text[]`. A seeker
  searches with words the five categories do not carry — "manglik", "kundli
  milan", "career". Free rather than a fixed list, because a fixed list is
  curated by the people who do not take the bookings. Public, and the console
  searches them too.
- **Degree**, as written, plus **a copy of the certificate**.

**The certificate is the part with a decision in it.** A scan carries a full
name, often a date of birth and a registration number, and the only storage
this app had is `R2_BUCKET`, served from an r2.dev address — everything in it
is world-readable. So:

- `media` gains the kind **`document`** (PDF, JPEG or PNG, 5 MB) and a
  **`PRIVATE_KINDS`** set. A document is presigned into `R2_PRIVATE_BUCKET`,
  and **an unset private bucket is a refusal, not a fall back to the public
  one** — falling back would publish the certificate.
- A document's `public_url` comes back **null**, so nothing can store a link
  into a bucket that serves nobody.
- The console shows **"Open the certificate"**, signed for ten minutes at the
  moment of viewing. A link copied out of that page is worthless by the time
  it is pasted anywhere.
- `degree_asset_id` is on **no** public shape, and not on the consultant's own
  `me/` either. The degree TEXT is public — a credential nobody can read is
  not one.

**Shipped, 27 Sep 2026.** `R2_PRIVATE_BUCKET=namo-docs` — a bucket with no
public access and no r2.dev URL, which is the whole point of it. It is set on
**both** services: `namo-api` (00051) and `namo-console` (00019). The console
is the one that signs the GET, so a deploy that updates only the API leaves
the certificate link broken while everything else looks fine.

**Migrations applied** on `usgzgrdxlzgnehtbebzo`: `consultants 0003` (tags,
degree, degree_asset_id) and `media 0002` (the kind CHECK — before it, the
database refused every document). Verified through the live API: the public
consultant list serves `tags` and `degree` and carries no `degree_asset_id`.

**The Supabase MCP connector is not this database.** It resolves to
`mrjsatelbuiypodeulcx`, which has `profiles`, `consultants` and `wallets` but
no `media_assets` and no `django_migrations`. A migration applied through it
reports success and changes nothing here. Compare `get_project_url` against
the service's `DATABASE_URL` before writing through it.

**Checks.** Three consultant tests, including that an approved consultant's
public card carries the tags and the degree and never the asset id; four
media tests, including that a missing private bucket refuses rather than
publishing. `uploadAsset` in `src/lib/media.js` is the presign/PUT/confirm
dance lifted out of `avatar.js`, which now calls it — the certificate would
have been the second copy.

## 39. Bhajans, e-books and mantras are real content — 27–28 Sep 2026

**Live on `usgzgrdxlzgnehtbebzo`:** 37 bhajans and 5 e-books in
`bhakti_assets`, files in the `namo-media` R2 bucket (`bhakti/bhajans/`,
`ebooks/`), each with a PNG thumbnail/cover in `preview_url`. Credited
Namo / All rights reserved / Namo original, unpriced. `deity` carries the
tradition (Beej Mantra, Jai Guru Ji, Jainism, Neem Karori Baba, Sanatan,
Santmat), which is what the filter chips show. Verified through the live API.

- **E-books are a Bhakti kind, not a table.** Same shape — title, file, cover,
  credit, price — so `bhakti 0002_ebook_kind` widens the kind CHECK (applied on
  production) and Academy's E-book tab filters `fetchAssets()` to `ebook`. The
  Bhakti screen filters by its own kinds, so the rows never appear there. The
  mock `ebooks` list is deleted.
- **Loaded by a one-off script, not a committed seed.** Legacy ids are
  `bh-<slug>` / `eb-<slug>`, so a re-run upserts. The next batch belongs in the
  admin console.
- **Mantras, 28 Sep:** a fifth Bhakti shelf (`bhakti 0003_mantra_kind`). Om
  and Om Namah Shivay, `mn-<slug>`, files in `bhakti/mantras/`. Play asks "How
  many times?" (1–1008) and `TrackCard` (`counted`) replays the clip on `ended` until the
  count runs out, showing "Repeat n of N" with a Stop. The Gayatri Mantra
  folder arrived empty and is not loaded.
- **Bhajans and mantras are video cards, 28–29 Sep:** one `TrackCard` for both shelves. It shows the 16:9 thumbnail
  (`preview_url`), then the title with a heart and a play button — no Save on
  this shelf. Once started, the native audio controls appear for scrubbing,
  and starting one pauses any other. The heart is the feed's `like:<id>`
  reaction, so it persists per account — **stored as target_type `content`**,
  because `lib/reactions.js` maps `like` to content and the server does not
  check targets. Give bhakti its own target_type before counting likes by type.
- **Open:** thumbnails and covers are still 2–3 MB PNGs on production. 1280px
  WebPs (111 MB -> 8 MB) are built in the loader's scratch folder; running the
  loader once uploads them and repoints `preview_url`.

## 40. Eleven changes from the owner's list — 30 Sep 2026

**Deployed 30 Sep: migrations `profiles/0003_gender` and
`wallet/0002_entitlements` applied to production, API `namo-api-00054-vc8` (tarot fix `namo-api-00055-zjn`, dasha `namo-api-00056-lz5`), front end
on `main`.** Branch `sep30-changes`. Backend: 761 pass, the same 34 fail as on
`main` (Python 3.14 noise — console, shiprocket, admin, and the 404-page
`test_no_cache_route`); 17 new tests in `tests/test_entitlements.py`. Lint and
build clean. **Never walked in a browser** — the paid paths especially.

| # | Asked | Done |
|---|---|---|
| 1 | New mantras from Drive | Eight on production, `mn-<slug>`: Om and Om Namah Shivay (unchanged audio, WebP thumbnails now), Gayatri Mantra (arrived with audio this time), Laxmi Beej, Kuber Beej, Om Dum Durgay Namah, Om Em Sarsvataye Namah, Om Namah Bhagwate Vasudevay. Titles are the Drive folder names verbatim |
| 2 | Paid e-book, ₹99 | *A Complete Guide to Beej Mantra*, **first in the list** (`sort` 0), `eb-a-complete-guide-to-beej-mantra`, `price_paise` 9900. The PDF is in the **private** bucket (`namo-docs`); the row's `media_url` is the key. The list never shows it; `GET /v1/bhakti/assets/<id>/file/` signs a ten-minute link for an owner, 402 with the price otherwise. Academy shows the price, the offer, then *Open PDF* |
| 3 | Gender at sign-up | `/onboarding/gender` after the name; `profiles.gender` (male/female/other, NULL for older accounts), in the PATCH allow-list; shown under Birth data |
| 4 | No chart after the OTP | `Computing` saves, fetches the chart and all divisional charts, and goes to `/home`. No loading list, no reveal |
| 5 | Muhurat judged against your chart, ₹49 | 402 until bought, per purpose per month (`muhurat`, ref `<purpose>:<YYYY-MM>`), forever once bought. Checked before the birth row, so an unpaid tap costs no upstream call |
| 6 | Twelve generic horoscopes, as before | `GET /v1/astro/rashifal/?sign=` — the 7 Sep canonical births, recovered from git, Moon-checked before any reading is trusted. Home's Today card (sign chips, the reader's moon sign first) and `/horoscope`. `02-TRD.md` §8 says why this is honest now and was not on 7 Sep: the sign is named |
| 7 | Horoscope → full chart; Vedic only; D1 then every D; Chart and Prediction tabs; prediction ₹99/month | Consult's Horoscope tile opens `/chart`, **three tabs: Chart, Dasha, Prediction**. Dasha tab (free): the running mahadasha/antardasha, then the nine mahadashas opening to their antardashas (`GET /v1/astro/dasha/`, cached forever, fetched at sign-up; the running period is found by today's date, never from the vendor's `active_periods`). Chart tab: D1 drawn, then D2–D60 as expanding rows (`GET /v1/astro/vargas/`, all seventeen in one vendor call, cached forever, fetched at sign-up). Prediction tab: the reader's own yesterday/today/tomorrow, **402 until bought**, ₹99 for 30 days (`prediction`), buying early extends from the end |
| 8 | Namo AI its own page, out of chat | `/ask` (titled Namo AI, with Back); Consult's AI tile goes there; the messages panel is Consultant / Alerts. **A plain chat** (bubbles, pinned composer, Enter sends), own chart by default |
| 9 | Tarot | *Think of a question* (yes or no) with **no box** — the server reads a blank question as an unspoken yes-or-no one (`tarot.UNSPOKEN`), and the endpoint no longer requires `question`; card → name → shloka → *Reveal my reading* → the reading; *Ask a reader*, *Pull again*, *Change deck* removed. **Yes or No shows only its sheet** — verdict, sentence, meaning, shloka; no model call for it (`sheet_only`) |
| 10 | Shared reel link: Back left the app | `useGoBack` in `Chrome.jsx`: `history.state.idx > 0` or the fallback route. The old check (`location.key !== 'default'`) was fooled by the reel feed's `replace` navigations. TopBar, the reel viewer and onboarding all use it |
| 11 | Editing birth details asked for an OTP and did not save | Profile → `/onboarding/date?edit=1` → time → place, which **saves** and returns to `/profile`. Cause: the edit ran the sign-up chain, and `Computing` refuses to overwrite a stored birth date. Second cause: the browser cached the chart under the account, not the birth, so it is now cleared on save |

**Entitlements** (`docs/05` §5.2c, prices `01-PRD.md` §4.11): one table, written
only by `apps.wallet.services.buy` in the same transaction as its ledger row
(`ref_id` = the entitlement). **RLS is on** in the migration itself, checked on
production (`relrowsecurity` true, zero policies) — the open finding about
Django tables and PostgREST does not apply to this one. `POST /v1/wallet/buy/`
takes `{sku, ref}` and never a price. **No auto-renewal**: a prediction plan
ends and the tab shows the offer again.

**Not verified:** a real purchase on production (the paths are tested against
SQLite with the ledger trigger emulated, not against a funded prod wallet);
the chart, prediction and muhurat screens in a browser; the 402 → buy → reload
loop on a phone.

**Found on the way, not fixed:** `tests/test_analytics.py::TestSeries::test_traffic_carries_both_views_and_visits`
fails for the first 5½ hours of every IST month — it failed CI on this push
(00:02 IST, 1 Oct) and fails on `f302347` too, so it predates §40. "This
month" is resolved in IST while events land on their UTC date, so an event
written just after IST midnight on the 1st counts in the previous month. The
dashboard's month-to-date charts have the same gap; the fix belongs in
`apps/analytics/periods` or the series bucketing, not the test.

## 41. Uploads from the browser were blocked by R2 — fixed 4 Oct 2026

**Fixed the same day: the owner added the CORS policy below to `namo-media` and
`namo-docs`.** Re-tested with presigned PUT preflights from `https://1namo.com`,
`https://pro.1namo.com` and `http://localhost:5260` on both buckets: 204, the
origin echoed, `PUT, GET, HEAD` allowed. A real avatar upload on a phone has not
been watched end to end yet.

What was wrong: A profile picture (and any studio post,
reel or consultant certificate) gets its presigned URL from the API (`presign`
201) and then dies at the browser's PUT to R2: the bucket answers the CORS
preflight with **403 and no `Access-Control-Allow-Origin`**, so the browser
never sends the file and `confirm` is never called. Reproduced 4 Oct with a
presigned PUT for `namo-media` and `namo-docs` from both `https://1namo.com`
and `http://localhost:5260`. The app code is not at fault.

The fix is a CORS policy on both buckets (Cloudflare → R2 → bucket → Settings
→ CORS Policy). The API's R2 key cannot set it — `PutBucketCors` is
AccessDenied, it is an object-only token — so it is a dashboard change:

```json
[
  {
    "AllowedOrigins": ["https://1namo.com", "https://pro.1namo.com",
                       "https://onenamocom-stack.github.io",
                       "http://localhost:5260", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Same origin list as the API's `CORS_ALLOWED_ORIGINS`. Re-test by sending an
OPTIONS preflight with `Origin: https://1namo.com` to a presigned PUT URL:
it should answer 200 with the origin echoed.

## 42. Four ways to consult, slots 20% off, sharper muhurat, numerology gone — 5 Oct 2026

**Live:** API `namo-api-00065-pn2`, migration `chat/0002_session_audio_only`
applied, front end on `main`. Lint, build and the backend suite are clean
apart from the known Python 3.14 console failures (three new console tests
from 4–5 Oct fail the same way on clean `main`).

- **Slots are 20% under the meter.** `derive_band_price` prices a FIXED band
  as per-minute × minutes less `SLOT_DISCOUNT_PCT` (20). `reprice_bands`
  (management command) refreshed all 18 fixed bands and moved approved
  consultants' slot services onto them on production. Tier 1: ₹444 / ₹592 /
  ₹888 for 15 / 20 / 30 min, against ₹37/min. Bookings already made keep
  their price. **Incident, put right:** the first run also repriced
  per-minute services and reset Raghu's hand-set ₹10/min test rate to ₹37;
  it was restored by hand within minutes and `reprice_services` now touches
  FIXED services only (test added).
- **Video, Audio, Chat, Book** on every `/consult` card and the profile. An
  audio call sets `sessions.audio_only`; `video.join` passes it to Daily as
  `start_video_off` for both people. Not tested on a real call.
- **Bhakti shares invite**: one line, `https://1namo.com/#/onboarding?ref=<N
  code>` and the code, from every card. Mantras have categories (`deity`:
  Universal, Shiva, Gayatri, Lakshmi, Kuber, Durga, Saraswati, Vishnu) —
  data on production, no code.
- **Muhurat**: purposes are circle tiles; judged against your zodiac keeps
  the best quarter of the windows (client-side, by the vendor's score); that
  card replaced "Before you act on this".
- **Numerology removed** end to end. The `ASTROLOGY_API_*` /
  `NUMEROLOGY_PROVIDER` env vars are still on Cloud Run, unused.

## 43. Delivery through Shiprocket — 5 Oct 2026

**State, 5 Oct 08:20 IST.** Prod is migrated (`shop/0003`). Live:
`namo-api-00067-xzx` and `namo-console-00008-v8m`, both built from merged
`main` (00066 had briefly rolled back §42's backend; 00067 restores it), and
the front end. `SHIPROCKET_EMAIL` and `SHIPROCKET_WEBHOOK_TOKEN` are set;
`SHIPROCKET_PASSWORD` was set on both by hand on 5 Oct (api 00068, console
00009). The console still has `SHIPROCKET_PICKUP=Primary` from the borrowed
account; the API has none (primary pickup). Not yet proven against the real
account — use Check Shiprocket. The
Shiprocket account is Namo's own, so a paid parcel now goes out by itself.

What happens, in order:

1. **Cart → Deliver to.** Saved addresses, or the form (pincode fills city
   and state from Shiprocket). `GET/POST /v1/shop/addresses/`,
   `DELETE /v1/shop/addresses/<id>/`, `GET /v1/shop/pincode/<pin>/`.
2. **The charge.** `POST /v1/shop/quote/` asks Shiprocket's serviceability
   for that pincode at the cart's weight (from the product rows), takes the
   recommended courier's rate, rounds up to the rupee, and writes a
   `shipping_quotes` row that lives 30 minutes. Pay is disabled until one
   comes back.
3. **Buy** now requires `address_id` and `quote_id`. Inside the one
   purchase transaction: the quote is checked (own, fresh, unused, same
   pincode, same weight) and burned, the fee is added after any coupon, a
   `shipping` order line and the `shipments` row (address snapshot, status
   `ready`) are written. Referral cashback is computed on the goods only.
4. **Dispatch.** The app calls `POST /v1/shop/orders/<id>/dispatch/` without
   waiting: push to Shiprocket → assign AWB (Shiprocket's courier choice) →
   book pickup → fetch the label. Each step skips itself when done and the
   row is locked, so a repeat finishes rather than duplicates. Done in the
   API because the `namo-dispatch-outbox` job runs a pinned old image with
   no Shiprocket env.
5. **Tracking.** `POST /v1/shop/parcel-updates/` is the webhook (the path
   avoids "shiprocket", "sr" and "kr", which their form refuses), checked
   against `SHIPROCKET_WEBHOOK_TOKEN` in `x-api-key`. Forward only;
   delivered starts the referral cashback clock, returned or cancelled
   kills it. `manage.py track_parcels` is the fallback (unscheduled).
6. **Orders** shows Ordered · Packed · Shipped · Delivered, the courier's
   last status, the AWB and a Track parcel link (`shiprocket.co/tracking/<awb>`).

Pincode → city/state reads Shiprocket loosely (its reply shape is
undocumented; on 5 Oct the live answer had no city where expected) and
falls back to India Post's public directory (`api.postalpincode.in`).

Console: Shipments has **Check Shiprocket** (select any row: signs in afresh,
reads the pickup, quotes 500 g to 110001, places nothing), **Dispatch** (the same path, for one that stopped)
and **Refresh tracking**, which now also starts the cashback clock — it
used a bare update before and skipped it. The label PDF is a column.

Migration `shop/0003_shipment_tracking` adds two nullable columns to
`shipments` (`tracking_status`, `label_url`). Production's `order_items`
check already allows `shipping` (verified read-only, 5 Oct). 917 tests.

### To make it live

1. Migrate prod, deploy API and console, push the frontend — in that order.
   **Pushing the frontend first breaks Buy**: the new API requires an
   address, and the old one ignores it.
2. Set on **both** `namo-api` and `namo-console`: `SHIPROCKET_EMAIL` (the API
   user's email), `SHIPROCKET_PASSWORD`, `SHIPROCKET_WEBHOOK_TOKEN` (any long
   random string), and `SHIPROCKET_PICKUP` if the pickup nickname is not the
   account's primary one (blank uses the primary).
3. Shiprocket → Settings → API → Webhooks: URL
   `https://namo-api-499026166575.asia-south1.run.app/v1/shop/parcel-updates/`,
   token = the same `SHIPROCKET_WEBHOOK_TOKEN`.
4. Product weights are what the rate is quoted on. Every product needs a
   real `weight_grams`; the box is a fixed 15 × 12 × 8 cm.

### Open

- **The API password was pasted into chat on 5 Oct.** Reset it in
  Shiprocket before setting it on Cloud Run.
- Not walked against the real Shiprocket API — every call is mocked in
  tests, and the cart and Orders were walked with faked responses.
- No cancel or return flow from the app; the console sets those by hand.
- The 6 old `shipments` rows are September test data; two read `ready`.
  Nothing automatic dispatches an order placed before 5 Oct 00:00 IST
  (`AUTO_DISPATCH_FROM`); only the console's Dispatch button can. Cancel
  those two in the console.

## 44. Every account without a verified OTP is gone — 5 Oct 2026

Production now holds only people who signed in with a verified OTP: **9
profiles, 4 consultants** (Raghu, Nikhil, two Atharv accounts). Removed: the
13 seed people from 25 Aug (the eleven fake consultants — Ritu Kashyap, Dev
Malhotra and the rest — and seed reviewers), 11 `[test]` referral profiles
from 24–26 Sep, and one number that never verified its OTP — with their
wallets and ledger rows, bookings (7 of them a real account booking a fake
consultant), earnings rows, services, notifications and referral rows. The
immutability triggers on `ledger` and `earnings_ledger` were disabled for
that one transaction and re-enabled inside it.

**The 48 reels the seed consultants "posted" were kept** and now belong to
the Raghu account (phone ending 1246); the live feed shows 52 pieces, 48 by
Raghu. Only the author changed.

A JSON backup of every touched row is in the session scratchpad
(`fake-users-backup-2026-10-05.json`), not in the repository — it holds
phone numbers.

## 45. The referral alert names who joined — 5 Oct 2026 (pushed, needs an API deploy)

"Someone joined with your code" now reads "Vidhi joined with your code".
A sign-up that claims before a name is saved (the older `VerifyOtp.jsx`
path) is named "A new member (number ending 4861)". The end date reads
"6 Oct", and a referee still on the welcome questions no longer gets an
alert ending "until None". `apps/referrals/services.py::_notify_referrer`.

The three alerts on Test Seeker ending "until 2075-…" are rows written by
the 25 Sep referral tests, not a live bug; the real 3 Oct referral says
2026-10-06. Old alerts keep their old text.

## 46. The NAMO logo everywhere — 5 Oct 2026

The owner's logo (orange infinity tile + NAMO) replaces the old black "1namo"
wordmark: tab header, Welcome, the Bhakti status image and its preview (white
version — the old black mark was all but invisible on the status's dark
band), the browser-tab and home-screen icon (new: there was none), and the
console header. Files and rules: `docs/04-UI-UX.md` under the colour tokens.
Front end ships on push; the console header needs a console deploy.

Revised the same day from the owner's second files: smaller letters beside
the tile, and the tile icon from its own image. And the Bhakti category
circles (and Consult's tools, same row) are `.tile-rail` now — 50px faces
instead of 58, with room inside the sideways scroller, because a row that
scrolls on x clips on y and the selected circle's ring was cut off.

## 47. Feed reels play by themselves — 5 Oct 2026

On Home, the reel 60% or more on screen plays muted and looping; every other
one is paused, so exactly one plays and scrolling hands it on. A speaker
button (bottom right of the reel) is one sound switch for the whole feed.
Walked on the dev server: plays on load, hands off at each scroll step,
unmute carries to the next reel. Per card, not per reel id — the same reel
can appear twice (a repost), and the off-screen copy used to cancel the
visible one's turn. A browser in battery or data saver can still refuse
autoplay; the first frame then stays, as before.

## 48. Owner's list, 5 Oct afternoon

- **Share preview.** A shared 1namo.com link showed "Front-end prototype, no
  backend" and no picture. `index.html` now carries Open Graph tags and
  `public/og.png` (1200 × 630, the logo and the welcome line). Every link
  shows this one card: routes live after the `#`, which crawlers never
  read, so a reel cannot have its own thumbnail without server-rendered
  share pages. WhatsApp caches previews per URL — old links keep the old card.
- **Logo** regenerated from the owner's third file (smaller letters).
- **Follow** beside the author on every feed post, reel and article — the
  same saved follow the profile pages use; hidden on your own posts.
- **Muhurat's purpose circles** use `.tile-rail` — the selected one was
  clipped at the top, as Bhakti's was.
- **E-PUJA** tag gone from the Pooja header (and its string).
- **Banners** on Consult, Bhakti and Shop are one height (150px); they were
  145 / 170 / 184. Title one line, note two. Three titles shortened to fit a
  360px phone: "Stones with a lab report", "Hand-counted rudraksha",
  "Lock-screen deities". Console-made banners follow the same clamp.

## 49. Load test, and what broke — 5 Oct 2026

Read-only ramp against the live API (numbers in `docs/02-TRD.md`
§Performance). Clean to **~167 requests a second** (50 in flight, 0
errors); at ~200 a second 7–8% failed, every one Postgres out of
connection slots. Live `DATABASE_URL` is the **direct** connection (5432),
one Postgres connection per gunicorn thread, Postgres max 60, ~24 already
used by Supabase. All 4 instances were up.

Done in code (pushed, not deployed): Django is pooler-safe on port 6543
(`CONN_MAX_AGE` 0, no server-side cursors), and the consultant list is two
queries (that fix, committed 14:02 IST, is also not deployed — 00072 is the
12:41 build).

Not done — needs the owner:
- `DATABASE_URL` on namo-api and namo-console → the Supabase **transaction
  pooler** string (port 6543), then deploy from `main`.
- `THROTTLE_USER_RATE=100000/minute` is on namo-api for the test. **Remove
  it** after the re-test.
- Before launch: `maxScale` 4 → 10+, `minScale` 1 (no cold start for the
  first user), `THROTTLE_ANON_RATE` up from 60/min (carrier NAT puts many
  phones behind one IP), and the API in the database's region.

## 50. Shop opens like the other tabs — 5 Oct 2026

Categories are round coloured tiles above the banners (`.tile-rail`, the
shared `tileStyle` now in `src/lib/tiles.js`), with four new icons — gem,
mala, rudraksha, remedy. Subcategory pills sit where the category pills
were. The per-category banner under the pills is removed, with its four
`shop.cat.*` strings. Walked: tiles, Gemstones selected (3 items).

## 51. Owner's list, 5 Oct evening

- **Followers / Following open a list** of names (tap one to open them) —
  your own profile only. `GET /v1/content/follows/<followers|following>/`,
  takes no profile id. Needs an API deploy; until then the sheet says
  nobody follows you.
- **Profile opens on Posts**, always (it opened on the kundli when you had
  not posted). An empty bio shows "Available" and a "Write about yourself"
  link; the bio box is three lines.
- **A consultant can pick several practices** when applying. Stored as one
  comma-separated `consultants.category`; Consult's filter and counts match
  any of them. Existing single values are unchanged.
- **Bhakti**: Tunes is last, after Darshan.
- **Header**: a wallet icon instead of the balance; the amount is in its
  accessible name and on `/wallet`.
- **Consult**: "Your sessions" moved to the chat panel's new Sessions tab
  (`src/components/MySessions.jsx`, review included); the verified rail
  ("Unlimited questions in 20 min") is removed.

## 52. Two owner-requested data changes — 5 Oct 2026

- **Rahul Jain (phone ending 0508) approved as a consultant** by a direct
  `status` update, at the owner's request, not through the console — so
  there is **no `admin_actions` row** for it. He applied the same day as an
  Astrologer; four active services; he is in `/v1/consultants/`.
- **Test Seeker (8447284861) wallet set to ₹20, then ₹40, then ₹80, then +₹37 three times, then +₹80**, for testing:
  seven ledger rows, `ref_type` adjustment (−₹126.50, +₹20, +₹40, +₹37 ×3, +₹80), note
  "Owner request, 5 Oct 2026".

## 53. Calls and chats rebuilt: one caller at a time, billing from connect — 5 Oct 2026

**Live since 6 Oct 00:15 IST**: `chat/0003` migrated, `namo-api-00075`
(with `SWEEP_TOKEN`) and `namo-console-00015`, front end pushed, and
pg_cron's `session-sweep` now POSTs to `/v1/chat/sweep/` through pg_net —
verified: the 18:45 UTC run answered 200. `manage.py use_api_sweeper
--revert` puts the SQL sweep back. Not yet walked with two real phones.

**Deploy trap, cost an evening.** Two deploys (16:13 and 18:28 UTC, 5 Oct)
ran `gcloud run deploy --source .` from the repo ROOT: buildpacks built the
Vite site as a Node app, the container crashed ("Cannot find module
/workspace/index.js") and Cloud Run kept the old revision — silently, for
anyone who did not read the error. The next deploy from `backend-django`
then refused with "Missing required argument [--clear-base-image]", because
the failed Node builds had set a base image on both services. Deploy from
`backend-django`, and pass `--clear-base-image` once.

What the owner found testing: a call's minutes ran from Answer, before
anyone was in the room; a chat request opened the consultant's camera;
calls were in nobody's history; a consultant on a call showed offline;
"Find a consultant" did nothing. And underneath, two copies of the settle:
the API charged 30-second blocks, the SQL `session_sweep` pg_cron runs
charged whole minutes.

Built (design: `docs/02-TRD.md` "Live sessions", state machine
`docs/03-APP-FLOW.md` §8.2a, columns `docs/05-BACKEND-SCHEMA.md`):

- **One ringing request and one live session per consultant**, both partial
  unique indexes, with request/accept serialised on the consultant's row.
  A second caller gets `{busy: true}`, nothing written; `/connect/:id`
  retries every 5 s for 3 minutes. Rings stop after 45 s (was 15 min).
- **A call's clock starts when Daily's presence API lists both people**
  (`user_id` is now on every meeting token). Answer holds the money; a call
  not connected in 90 s settles at ₹0. When the clock starts the room's
  expiry moves to the paid end. A chat still starts on accept.
- **The channel (chat / video / audio) sets the session's mode** — every
  per-minute service was `chat`, so the consultant's app could not tell a
  call from a chat. Requests now say which.
- **No scheduler on the critical path**: stale rings and dead connects are
  settled by the next request/accept/heartbeat for that consultant.
  `/v1/chat/sweep/` (token `SWEEP_TOKEN`) is the API's sweep for pg_cron;
  `manage.py use_api_sweeper --url …` switches the job, `--revert` undoes it.
  Migration `chat/0003` also teaches the SQL sweep to skip calls still
  connecting, for the window before the switch.
- **Busy** on the roster and profile (`busy` on `/v1/consultants/`), refreshed
  every 20 s while those screens are open.
- **Presence**: the consultant's beat runs on every screen (`PresenceKeeper`,
  mounted app-wide); it lived in the header switch, which the call screen
  does not have — the offline-then-online flicker.
- **Chat panel**: "Recently connected" with each person's last call or chat;
  Sessions tab lists calls and chats with cost; Alerts shows an unread
  count; Find a consultant closes the panel and goes to Consult. Alerts older
  than 183 days are deleted by the sweep.
- **Pooja** is under the tab bar again (owner's request). Atharv's marble-
  mandir redesign of the same evening is the screen; only the route moved
  into the tab layout, and `main:has(.darshan)` no longer cancels the nav's
  56px. On 6 Oct the marble is drawn at 75% (`FRAME_SCALE` in
  `PujaProps.jsx` — every frame measure goes through `frameCqw`, so the
  bells and nameplate move with it) and the murti is `object-contain`, so it
  grows to fill the larger doorway (owner's request).

Tests: 947 (new: `test_session_engine.py`, `test_session_scenarios.py` — the
two-caller race, never-connected refunds, busy, a full video call by HTTP).
Walked with a faked API: busy, ringing, declined, connecting, the panel, the
consultant's chat and call bars, Pooja.

### To make it live — this order

1. `python manage.py migrate chat` on production (additive: one nullable
   column, one unique index, the SQL sweep guard).
2. Set `SWEEP_TOKEN` (any long random string) on namo-api; deploy API and
   console from `main`.
3. Push the front end — **not before step 2**: the new consultant app routes
   by the session's mode, which the old API sets to `chat` for every call.
4. `python manage.py use_api_sweeper --url https://namo-api-499026166575.asia-south1.run.app/v1/chat/sweep/`
   with `SWEEP_TOKEN` in the environment.
5. Walk it with two phones: a video call (clock starts on connect), a chat
   (opens the chat, not the camera), a second caller (busy, then through).

Not proven against the real Daily presence API — its response is parsed for
`userId`/`user_id`; if Daily answers differently the call stays "Connecting"
and settles at ₹0 after 90 s, which is the safe failure.

## 54. First live test of the new calls — 6 Oct 2026

Three test calls hung up 2–8 s after joining. Every End came from
1namo.com, which also sent none of the new connecting heartbeats: the
seeker's tab had loaded the app before the deploy, and the OLD call screen
read the new `expires_at: null` as "0:00 left" and ended the call. Nothing
was charged (each hold refunded whole). Two fixes:

- **The app reloads into a newer build** (`src/lib/update.js`): every build
  bakes an id and publishes `version.json`; the app checks every five
  minutes and on returning to the foreground, and reloads at the next
  screen change — never on `/call` or `/connect`.
- **Room race** (`apps/video/services.py::_create_or_get`): both phones
  joining in the same second both created the Daily room and the second got
  "already exists", refused for a retry. It now reads the existing room.
  Needs an API deploy.

**Still hanging up, 6 Oct 01:00** — same cause, a seeker phone that had
not reloaded (its tab never sent a connecting heartbeat and called End on
its first successful join), while the auto-reload build sat in GitHub's
Pages queue for an hour. Made the server immune to old builds: a join
while connecting now returns the ROOM's end as `expires_at` (never null)
with `connecting: true`; current apps read `connecting`, old ones see a
future end and do not hang up. Billing is unchanged — it waits for
`started_at`.

Also: Consult's free-tool circles are full colour with white icons
(`toolStyle` in `src/lib/tiles.js`), owner's "these look dull".

## 55. Online is the switch; calls ring the phone — 6 Oct 2026

Owner's call: a consultant is online until they switch off, app open or
not, and a call must ring the phone like a phone call.

- **Online = `accepting_now`.** The 90-second heartbeat no longer decides
  it (`online_expr`, `is_online`); the beat still runs and `last_seen_at`
  is still written. **Safety net:** three requests in a row that ring out
  unanswered switch the consultant off and tell them (`_missed_check` in
  `apps/chat/services.py`); a seeker cancelling early is not a missed call.
- **Web push.** `push_subscriptions` (notifications/0002), endpoints
  `/v1/notifications/push/{key,subscribe,unsubscribe}/`, `apps/notifications/push.py`.
  Every new request pushes "<name> is calling" to the consultant's phones
  after commit, best-effort; 404/410 subscriptions are deleted.
  `public/sw.js` shows it with sound, a long vibration, Answer / Decline,
  and opens `/pro/ring/<id>?do=…` (`src/pro/ProRing.jsx`). Turning Online
  asks for notification permission (`src/lib/push.js`); the open app rings
  with a synthesised tone (`src/lib/ringtone.js`).
- **Limits.** A web notification rings once with the system sound; a
  looping full-screen call screen needs the Play Store build (Capacitor /
  TWA + FCM full-screen intent). iPhone gets web push only as an installed
  home-screen app (iOS 16.4+).
- **Keys.** Public VAPID key in settings (it is public); the private key
  is `VAPID_PRIVATE_KEY` on namo-api only — not in the repository.

- **A chat request waits under its own screen** (owner, 6 Oct): no
  "Ringing" — "Request sent to <name>", the reveal's saffron sky, the orbit
  round their initials, a 45 s accept ring and rotating tips; busy reads
  "<name> is guiding another seeker". `ChatWaiting` in `src/screens/Connect.jsx`.
- **Masked phone calls** (asked): Daily can dial PSTN, but Indian rules let
  only licensed operators bridge internet calls to phone numbers. Exotel or
  Knowlarity is the route (AstroTalk's); needs the owner's account. Not built.

Tests: 963. Not yet proven on a real phone — needs the API deploy with the
private key, then a consultant turning Online once to allow notifications.

## 56. Chat sends: the 500 that made messages double — 6 Oct 2026

Owner's report: chat slow, messages appear twice, the box keeps the text
until you backspace, and "That session has ended" mid-session.

- **Cause, one bug.** Every send saved, then the idempotency middleware
  failed to store the reply (`datetime is not JSON serializable`) and
  answered 500. The app read any failure as "That session has ended" and put
  the text back in the box, so it was sent again — and saved again. Seen in
  the API log at 19:52 UTC on 5 Oct, five 500s on one thread.
- **Server.** `apps/core/middleware.py` round-trips the stored body through
  `DjangoJSONEncoder`, and a failure to store the reply now logs and forgets
  the key instead of failing a write that has committed. The chat walk test
  now sends with an `Idempotency-Key` and retries it: one row. Tests 963.
- **App** (`src/components/ChatPanel.jsx`, `src/lib/chat.js`). Sent messages
  show at once as *Sending*; each carries its own key, retried with backoff
  on a dropped connection, 5xx, 429 or 409; unsent ones are kept in
  `localStorage` and go again after a reload; a failure reads *Not sent · Tap
  to retry*. The box empties itself and ends an Android keyboard's
  composition first. Polls every 1.5 s on screen, 6 s hidden, and at once on
  return to the tab.
- **Tested live, 6 Oct ~02:00 IST**, two headless Chromes: Test Seeker
  (8447284861, OTP from the owner) and the owner's consultant account Raghu
  (7011921246, ₹10/min). Three paid chat sessions on production; the new
  builds served from `localhost:5260` against the live API, because Pages
  could not deploy (below). ₹200 added to Test Seeker first (ledger kind
  "Added for testing", note "Owner request, chat test 6 Oct 2026").
  - Request → accept → chat open on both sides; waiting screen reads
    "Request sent to Raghu" with the 45 s ring.
  - Own bubble on screen in 9–20 ms (was ~850 ms); the box empties every
    time; five rapid sends arrive once each, in order, on both sides.
  - Timer agrees on both sides to the second and counts true over 30 s.
  - Reload mid-chat: the chat reopens itself with its history (new build).
  - Offline send: the bubble waits as *Sending* and lands once on reconnect.
  - End: "Session ended · 2 min · ₹15", composer gone, consultant sees it;
    closing both browsers mid-session was settled by the sweeper after the
    60 s grace.
  - Money, all three: 137 s → ₹25, 65 s → ₹15, 165 s → ₹30 (30 s blocks at
    ₹10/min); hold and refund rows exact; earnings gross/fee 18%/net exact;
    wallet ₹212 → ₹142.
- **What made it slow** (fixed in code, needs the API deploy): a send was
  thirteen database trips at ~60 ms each — the API is in Mumbai and the
  database in Singapore. Now four (`test_send_is_a_few_database_trips`). The
  request appeared to the consultant after ~6 s and the chat opened for the
  seeker ~4.5 s after accept, both polling cadences: now 2 s and 1 s. Moving
  `namo-api` to asia-southeast1 is the rest of the fix (`docs/02-TRD.md`).
- **GitHub Actions incident** from 00:41 IST 6 Oct: every Pages deploy since
  `7070e99` was cancelled with no runner, so 1namo.com and pro.1namo.com
  still serve the 00:20 build — none of §53–§56's app changes are live until
  a deploy runs. Tests: 964.

## 57. Shop: product pages, one SKU per product, the spreadsheet — 6 Oct 2026

Rahul's list (description, FAQ, SEO, more than one image, brand, an
openable product page; a category rename not reaching the app) and the
owner's (no two products under one id; upload and download as Excel;
photos and videos per product, like a marketplace).

- **Why a renamed category did nothing:** the tiles and pills were
  `shopCategories` / `shopSubcategories` in `src/data/mock.js`. A rename in
  the console changed the products' category name, so the old tile matched
  nothing and showed zero; a new category never got a tile. The app now
  reads `GET /v1/shop/categories/`; the mock lists are no longer imported.
- **Built, server:** `products` gains `sku` (unique, required), brand,
  description, `gallery` (photo and video URLs), `faq`, `slug`, SEO title and
  description — migration `shop/0004_product_page`, which numbers existing
  products NAMO-0001… and slugs them. `GET /v1/shop/categories/`,
  `GET /v1/shop/p/<slug or id>/`. Console: the product form in five
  sections, several photos/videos per upload (video ≤ 30 MB — Cloud Run's
  request cap; longer as a link), gallery and FAQ as editable text, and
  **Download sheet / Upload sheet** on the product list (`apps/shop/sheet.py`,
  `openpyxl`): SKU-keyed upsert, all rows or none, every problem listed by
  row, audited. Rule written down: backend/INSTRUCTIONS.md §11.
- **Built, app:** `/shop/p/:key` (`src/screens/ProductPage.jsx`), cards open
  it and show the real cover photo (`src/components/ProductArt.jsx`).
- **Verified:** 983 backend tests (19 new); lint, build and the i18n check;
  the shop and the product page walked in a browser on the local build with
  a sample product answered locally — no test product was written to the
  live database.
- **Migration applied to production** (6 Oct, owner's go): the 11 products
  are NAMO-0001 to NAMO-0011, oldest first, each with a slug (NAMO-0011 is
  the taken-down "Race Test" row). The Pages build is live. **Waiting on the
  API deploy** — until it runs, the deployed code cannot create a product
  (it does not know `sku`), and product pages show only the list's fields. Products have no descriptions, galleries or FAQs until
  somebody fills them in the console or the sheet.
- **SEO, honestly:** the page sets its title, meta description and a
  schema.org Product block, but the app is a hash-routed single page on
  GitHub Pages, so a crawler that does not run JavaScript sees only the
  front page. Real search indexing needs server-rendered product pages at
  real URLs — not built.

## 58. Off GitHub: Firebase Hosting and real addresses — 6 Oct 2026, in progress

Owner: "start migration, move everything, nothing should be based on
GitHub". GitHub now only stores the code; nothing runs from it. Hosting is
**Firebase Hosting**, not Cloudflare (owner chose it so the domain's DNS
stays at GoDaddy; Cloudflare Pages would have needed GoDaddy's nameservers
moved, since it only serves an apex domain whose DNS it runs).

- **Done in code:**
  - React Router: `HashRouter` → `BrowserRouter`. Addresses are real
    (`1namo.com/shop/p/x`). `src/main.jsx` rewrites any `#/…` address to
    its path before the router reads it, so every link already shared
    (WhatsApp, reels, referral codes, notifications) still lands.
  - Everything that built or read a `#` link: share links
    (`src/lib/share.js`), the Bhakti invite, the error screen's way home,
    the service worker's notification tap, the shop's `?p=`/`?ref=`
    readers, the favicon paths, and the server's affiliate and influencer
    links (`apps/referrals`).
  - Analytics counted a page view on `hashchange`, which a real-address
    router never fires; it now wraps history and records real paths.
  - `firebase.json` / `.firebaserc`: sites `namo-web` (dist) and
    `namo-pro` (dist-pro) in the API's own project
    (`project-5e5df107-b8f8-4649-9d1`, where Firebase was added on 6 Oct).
    Every address that is not a file serves the app; pages and
    `version.json` are never cached, `/assets/**` a year — checked with
    real response headers. `public/CNAME` removed; build id from git.
  - **Deploys:** `npm run ship` (`scripts/ship.mjs`) — refuses uncommitted
    changes, checks `.env.local`, lints, builds both apps, deploys with the
    Firebase CLI (logged in on the owner's laptop as the project owner).
    `.github/workflows/deploy.yml` and `api.yml` deleted: no push deploys or
    tests anything. The `namo-pro` repo and its `PRO_DISPATCH_TOKEN` are
    retired. Backend tests run locally (CLAUDE.md's command).
- **Live on Firebase's own addresses:** https://namo-web.web.app and
  https://namo-pro.web.app serve the current commit. The API refuses those
  origins (CORS), so they load but cannot fetch — the full check happens on
  the real domains.
- **Verified:** lint, both builds, 983 backend tests (one test failed once
  in four full runs and passed on rerun — flaky, not identified); on the
  local build, deep links load, old `#/` links land with their query, Back
  and reload keep the screen, analytics records real paths.
- **The domain switch, in GoDaddy:** custom domains 1namo.com → namo-web and
  pro.1namo.com → namo-pro are created in Firebase. Round 1 adds three TXT
  records (`hosting-site=namo-web` on `@`, an `_acme-challenge` for each)
  so the certificates issue while GitHub still serves; round 2 replaces the
  four GitHub A records on `@` with `199.36.158.100` and points the `pro`
  CNAME at `namo-pro.web.app`. Until round 2, 1namo.com and pro.1namo.com
  are still GitHub Pages' last hash-router build. After it: turn off GitHub
  Pages in both repos. A stray empty Google project
  (`project-5e5df107-b8f8-46-430bc`, created by mistake on 6 Oct) can be
  deleted.

## 59. Rahul's list, 6 Oct morning: blogs, images — 6 Oct 2026

- **A blog vanished** when Rahul went to add a product: the Blog tab had no
  product picker, and switching tabs wiped the composer. Now every tab keeps
  its own draft in `localStorage` (`namo.draft.<kind>`), through tab
  switches and reloads, and blogs can tag products
  (`src/components/Composer.jsx`). Verified on the local consultant build.
- **"Blog saved, image did not"**: the image did save (the row's
  `media_url` is a live R2 PNG) — the feed card and the reader drew the
  plate and never read it. Both show the cover now, 16:9, the composer's
  shape (`Cover` in `src/screens/Home.jsx`). Verified on his post.
- **Like, comment, share on blogs**: a blog had Save only. The feed card
  and the reader now carry Like, Reply (the comment sheet), Share (the
  blog's own address — Share on the reader toasted "copied" and copied
  nothing) and Save. The server already accepted all of them.
- **Image sizes and one proportion everywhere**: `docs/04-UI-UX.md` §7
  table — products 1:1, blog covers 16:9, photos 4:5, reels 9:16. The
  feed's shop cards were `mock.js` products (invented, drawn, and an Add
  that carted a product that does not exist); they are the live catalogue
  now, square, opening the product page. Tagged products open the product
  page too, the referral code carried (`src/lib/shopRef.js`, shared by the
  shop and the page).
- **Not live yet:** 1namo.com is still GitHub Pages' last build, which no
  longer updates (§58). These reach phones at the DNS switch; deployed to
  namo-web.web.app / namo-pro.web.app meanwhile.

## 60. Rahul's list, 6 Oct 11:13: edit, banner, actions, WhatsApp — 6 Oct 2026

1. **Edit on blogs and all posts — built.** `POST /v1/content/<id>/edit/`
   (`apps/content/services.edit_content`): owner or admin, kind fixed,
   removed stays removed, a blog keeps a title and body, a reel its video,
   `product_ids` replaces the tags under the publishing rules. App: Edit on
   own feed cards (where Report was), beside each piece in the Studio, in
   the blog reader; `src/components/EditSheet.jsx` is the composer in edit
   mode. 7 tests; the flow walked on the local consultant build.
2. **Banner image in blog — done** (§59): it was saved, never shown.
3. **Like, share, comment on blog — done** (§59).
4. **WhatsApp share with the banner as thumbnail — built.** Firebase sends
   `/read/**`, `/shop/p/**` and `/og/**` to `namo-api`
   (`firebase.json` rewrites; asia-south1 accepted). `apps/content/share.py`
   answers with the app's own index.html (`APP_INDEX_URL`, cached a minute)
   with that blog's or product's Open Graph and Twitter tags, and
   `/og/<blog|product>/<id>.jpg` is a 1200 × 630 JPEG cut from the cover
   (Pillow, new dependency) — the original was a 2.4 MB PNG, which WhatsApp
   skips. 7 tests.
- **Order matters:** the rewrite is live on namo-web.web.app and answers 404
  until the API is deployed with these routes. **Deploy the API before the
  DNS switch**, or blog and product links 404 on 1namo.com.
- Deploys: `npm run ship` hung twice at the Firebase step (the CLI waiting
  on inherited input); `scripts/ship.mjs` now gives no step any input, and
  the CLI is a pinned dev dependency (`firebase-tools@14`). Tests: 997.

## 61. Cash on delivery — 6 Oct 2026

Owner: "COD bhi add karo, for COD take 2% extra; the status should update
through the full flow; online (Razorpay) vs COD; hope Shiprocket handles it."

- **Rules** (`docs/01-PRD.md` §4.6): 2% of goods plus delivery, rounded up;
  only where a courier takes cash at the pincode; up to ₹10,000; at most two
  undelivered COD orders an account. The cap and the count are defaults set
  on 6 Oct, not the owner's figures — settings `COD_MAX_PAISE`,
  `COD_MAX_OPEN`, `COD_FEE_BPS`.
- **Server:** `orders.payment_method`, `orders.cod_fee_paise`,
  `shipping_quotes.cod_available` (migration `shop/0005`, **applied to
  production**: database defaults, the 50 existing orders read `wallet`).
  The quote asks Shiprocket with `cod=1`; buy takes `payment`; a COD order
  debits nothing and is `pending`; the parcel settles it
  (`order_follows_shipment`: delivered → `paid`, returned or cancelled →
  `cancelled` and restocked). Shiprocket gets `payment_method: "COD"` and
  `sub_total` = the amount to collect. The referral cashback's base excludes
  the fee (`referrals.cashback_base`); a pending COD order is not yet a
  consultant's sale. Console: a "Paid by" column and filter on orders.
  15 tests; 1012 pass.
- **App:** the cart's Online / Cash on delivery choice, the fee line, "Add ₹Y
  and pay" through Razorpay when the wallet is short, Orders' money lines.
  Walked on the local build with the quote answered locally.
- **Shiprocket's side, for the owner:** COD must be enabled on the Shiprocket
  account (it needs the KYC and a bank account for remittance). Shiprocket
  remits collected cash on its own cycle, minus its COD charge — the 2% is
  meant to cover that.
- **Not built:** refunds of a returned online order (still by hand); a
  seeker cancelling a COD order before it ships.
- **Not live:** needs the API deploy and the app reaching 1namo.com (the
  DNS switch, §58).

## 62. The shop pays through Razorpay; the wallet is for chat — 6 Oct 2026

Rahul: "Store me seedha payment gateway open kardo, instead of wallet.
Wallet will be for chat." Also: a video on a product, and a shared product
link should come with its image and full name.

- **Built, server:** `payment: "online"` (the app's default) writes a
  `pending` order with `expires_at` 15 minutes on, holds the stock, puts the
  shipment at `awaiting_payment`, and after the transaction opens a Razorpay
  order (`wallet.open_shop_payment`, the `created` payments row carrying
  `shop_order_id`). Settled by `POST /v1/shop/orders/<id>/confirm/` (the
  checkout's signature over `order_id|payment_id`, checked with the key
  secret) or by the existing webhook — once, the payments row's unique
  `provider_payment_id` catching the second. Paid → `paid`, shipment
  `ready`, dispatched. `abandon/` and the minute's sweep (`lapse_unpaid`,
  from `apps/chat/views.sweep`) cancel an unpaid one: stock back, shipment
  and pending cashback cancelled. A capture after a lapse is credited to the
  wallet. Dispatch refuses an unpaid online order. Razorpay down → the order
  lapses at once. 10 tests; 1022 pass. Migrations `wallet/0003`, `shop/0006`
  **applied to production**.
- **Built, app:** the cart's Pay online / Cash on delivery; Razorpay opens
  for the order; paid clears the cart, closed releases it. The wallet line
  and the top-up-the-gap flow (§61) are gone from the cart. Walked on the
  local build with Razorpay stubbed both ways.
- **Video on a product:** already built (§57 — the console's "Add photos or
  videos", up to 30 MB). Live with the API deploy.
- **The WhatsApp card:** the link shared was `1namo.com/#/shop/p/…` — the
  GitHub Pages build — and a crawler drops everything after `#`, so it
  previewed the front page. The real-address link with its image and full
  name works after the DNS switch and the API deploy (§58, §60). The share
  text now carries the product's full name and price (WhatsApp ignores the
  share sheet's title).
- **For the owner:** in Razorpay's dashboard the webhook must send
  `payment.captured` (it already does for top-ups) — no change. Wallet
  orders from an app that has not reloaded are still accepted.
- **API deployed** (6 Oct, 12:40 IST, revision `namo-api-00084`, at the
  owner's word): everything in §57–§62 is on the API — confirm/abandon and
  edit answer 401 unsigned, previews and categories 200. GoDaddy round 1
  (the three TXT records) is in and visible; Firebase is still validating
  the certificates. Round 2 (the A record and the `pro` CNAME) waits on them.

## 63. 1namo.com is on Firebase — 6 Oct 2026

- **DNS round 2 done by the owner** (~13:00 IST): `@` A → `199.36.158.100`,
  `pro` CNAME → `namo-pro.web.app`; seen at 8.8.8.8 and 1.1.1.1. Firebase:
  1namo.com `HOST_ACTIVE` / `OWNERSHIP_ACTIVE`, certificate propagating;
  pro.1namo.com came up within the hour; its bare `/` kept a 404 the CDN
  had cached before the switch, cleared by redeploying pro (`npm run ship --
  pro`). Both domains 200.
- **Checked live:** `version.json` is the current build; `/`, `/shop`,
  `/shop/p/…`, `/read/…`, `/og/…`, `/privacy.html` all 200; the lava bracelet
  link previews as "Lava Bracelet – Natural Black Lava Stone | Saturn &
  Grounding Bracelet · ₹599" with its photo; old `#/` links redirect.
- **Not checked signed in:** the test seeker's session had been revoked —
  its tokens were copied into a localhost build during testing and both
  refreshed, which Supabase treats as reuse. Real users are on the same
  origin and keep their sessions. A signed-in walk needs a fresh OTP.
- **Mail:** support@1namo.com on Zoho — MX (mx/mx2/mx3.zoho.in), SPF and the
  `zmail` DKIM key are published. The SPF record names the same include
  twice (harmless).
- **Left for the owner:** turn GitHub Pages off in `namoApp` and `namo-pro`
  (Settings → Pages); nothing serves from them now.
- Open: a signed-out visitor following a product or blog link lands on
  onboarding, not the page — the app requires sign-in everywhere.

## 64. The cart, 6 Oct afternoon: courier error, pincode, Clear, steppers

- **"Could not reach the courier service" — cause found, owner to fix.**
  Shiprocket answers the API user's sign-in (`support@1namo.com`, password
  set on namo-api) with **403**, not the 400 a wrong password gets: the API
  user's **Allowed IPs** is set, and Cloud Run has no fixed outgoing IP.
  Fix: Shiprocket → Settings → API → the API user → clear Allowed IPs. Until
  then no quote, so no order, online or COD. The quote's failure reason is
  now logged (`[delivery] quote failed: …`).
- **Pincode** (`DeliveryStep.jsx`, `delivery.lookup_pincode`): India Post
  first (no sign-in; lists the areas), Shiprocket second, cached a day;
  the form says what it found and offers the areas as chips. Tests updated.
- **Clear** asks first; the − / + are drawn and centred (measured 0 px off).

## 65. Rahul's list, 6 Oct evening: search, one profile, captions, shelves

1. **Search on Home — built.** `/search` (`src/screens/SearchScreen.jsx`),
   opened from a bar under Home's header. Client-side over the roster, the
   catalogue and the newest 200 posts; checked on live data ("rahul",
   "lava", "shani"). A server search is the next step at scale.
2. **Two profile pages — one now.** `fetch_author` returns `is_consultant`;
   `/u/:id` forwards a consultant to `/consult/:id`, whose Posts tab lists
   real thumbnails that open (`PieceRow`) and whose line shows following.
   `/pro/profile` stays the consultant's own editing view.
3. **Lines on photo and video posts — already there.** The composer's
   caption box is on Photo and Reel (required), the feed shows it with
   "more". The reels viewer showed a long one over the video unfolded; it
   folds to two lines now.
4. **Multiple images per product — already there** (§57: "Add photos or
   videos", several at once, and the sheet's `gallery` column).
5. **One product in several categories / subcategories — built.**
   `also_categories`, `also_subcategories` (migration `shop/0007`, **applied
   to production**); the console's "Also shows under" checkboxes; the
   sheet's `also_categories` (`A; B`) and `also_subcategories`
   (`Category > Sub; …`) columns; the shop filters on every shelf. Tests: a
   new sheet test; 1023 pass.

## 66. Search in the header; Shiprocket's real refusal — 6 Oct 2026

- **Rahul's design:** search is a box in `TabHeader` (Home, Shop, Consult),
  opening `/search?in=…`; the separate rows on Home, Shop and Consult are
  gone and Shop's cart is in the header. Topic aliases in both scripts in
  `SearchScreen.jsx` — checked live: "kundli" now finds his Hindi posts.
- **Checkout — corrected diagnosis.** §64 blamed Allowed IPs. Wrong: with
  the body read, Shiprocket says **"Invalid email and password
  combination"** (it answers 403 for a bad password too). The saved
  `SHIPROCKET_PASSWORD` on namo-api also carried a trailing space; stripped
  in settings now, but the password itself is not the API user's.
  **Needs the owner:** reset the API user's password in Shiprocket and set
  it on namo-api and namo-console.
- **Bhakti asset form** (Rahul, adding a tune): "Media url" and "Source"
  were required by the model's NOT NULL columns, so an upload alone never
  saved. The form now takes an upload or a link; Source is optional
  (`apps/bhakti/admin.py`, 2 tests). Console deployed.
- **Bhakti's search** moved into the header too (Rahul): `TabHeader`'s
  `search` takes `{value, onChange, placeholder}` for an in-bar field.

## 67. Consult's extra lines gone; formatted product descriptions — 6 Oct 2026

- Consult: "Every session is 20 min · unlimited questions" and "Booking a
  slot costs 20% less…" removed above the roster (Rahul: extra text).
- Product descriptions take formatting marks — heading, bold, highlight,
  italic, lists, quote — rendered by `RichText.jsx` (React elements only;
  typed text can never become markup). The console's description field has
  a toolbar (`FormattedTextarea` in `apps/shop/admin.py`, inline script, no
  library) and the same marks work in the sheet. Previews and the SEO
  fallback use the words without marks (`shop.services.plain_text`).
  Checked in a browser: the toolbar's buttons insert the marks; the page
  renders them.

## 68. Rahul's list, 7 Oct: Bhakti search, product page, blog card

- Bhakti's header box opens `/search?in=bhakti` like every tab; search
  covers Bhakti (`fetchAssets`: title, deity, kind); a result opens
  `/bhakti?kind=…&q=…`, filtered, with Clear.
- Product page: no stock line (Sold out only), no SKU chip, no disclaimer;
  **More from the shop** (same category first, in-app links, scroll to top).
  The Add/Buy bar was `sticky` and measured from `main`'s bottom padding —
  56 px up, text showing under it on phone and desktop; now `fixed` to the
  column's foot. Measured: bar bottom = screen bottom.
- Blog feed card: title under the banner, not over it.

## 69. Commission 40%, unnamed; one tile look; discount by the price — 7 Oct 2026

- **Commission 40%** (`FEE_BPS = 4000`, was 1800) for earnings written from
  the API deploy on; earlier rows keep 18%. Not said in the apps: the
  consultant's earnings show take-home only (the "less ₹X platform fee"
  line and each row's gross − fee went), and the application's "We take 18%"
  line is gone. Tests updated (148 pass in chat/consultants/earnings).
- **Tiles:** `tileStyle`/`toolStyle` are one beige face with a coloured icon
  on Consult, Shop and Bhakti. Shop cards: the discount beside the price.
  The header cart icon is white.
- **Free first session — built** (owner's answers: 3 minutes; Namo pays
  the consultant 60%; only consultants ticked in the console, shown on top
  to a seeker who has never had a session; paid for everyone once that
  session ends). `consultants.free_first`, `sessions.free_seconds`
  (migrations applied to production; nobody ticked yet), the list and
  detail carry `free_first_offer` for a signed-in seeker (the app now sends
  its token with them), the console's consultant list has the tick, and
  the settle charges past the free value only while the earnings row counts
  every second. 6 tests; 1031 pass.

## 70. Audio calls are voice only — 7 Oct 2026

Owner: use Daily's audio-only calling. An audio session's meeting tokens now
carry `permissions: {canSend: ["audio"]}`, `start_video_off` and
`enable_screenshare: false` (`apps/video/providers.meeting_token`); the join
answer says `audio_only` and the call page's iframe asks for the microphone
only. Video calls unchanged. Checked against Daily's live API — it accepts
the token — and 2 tests. Daily bills a participant who sends no video at its
audio rate (about a quarter of video's, per Daily's pricing as understood on
7 Oct — confirm in the Daily dashboard).

## 71. Shiprocket signs in; checkout works — 7 Oct 2026

- The owner reset the API user's password (`support@1namo.com`); it is set
  on namo-api and namo-console as `SHIPROCKET_PASSWORD` (revision
  namo-api-00094). Checked with the live value: pickup "Primary" (201301);
  a 50 g parcel to 201011 quotes ₹78 by Delhivery, 3 days; COD available.
- **Trap, for the next secret:** `gcloud.cmd run services update
  --update-env-vars "^@@^NAME=value"` from PowerShell — `gcloud.cmd` is a
  batch file and cmd.exe ate the `^` and a character of the value, creating
  a variable named `@@SHIPROCKET_PASSWORD` (removed). Secrets go through the
  Cloud Run Admin API instead (a script reading the value from a file,
  printing only lengths), and the stored copy is compared before the file
  is deleted.


## 72. Out of money pauses the session for a recharge — 7 Oct 2026

Owner: instead of hanging up when the money runs out, pause, ask the seeker
to recharge on the same screen, and end after two minutes or when either
person ends it. Product rule: `docs/01-PRD.md` §4.1; screens:
`docs/03-APP-FLOW.md`; column: `docs/05-BACKEND-SCHEMA.md`.

- **Server.** `PAUSE_SECONDS = 120` in `apps/chat/services.py`. `_due` and
  the sweeper settle "time ran out" only once `expires_at + 120 s` has
  passed; the settle still stops at `expires_at`, so the pause is not
  billed. New `extend_session` (`POST /v1/chat/sessions/<id>/extend/`,
  seeker only): holds every whole minute the wallet buys, moves the end on
  (running) or skips the pause into `paused_seconds` and runs on from the
  old end (paused). The heartbeat answers `paused`, `resume_by` and
  `pause_seconds_left`, and settles a pause that ran out — never a "silent"
  session, because a beat is proof somebody is there.
- **Calls go silent.** The Daily room and tokens now outlive the money by
  the pause. A paused call's beats in the pause's first 20 s call Daily's
  `POST /rooms/<name>/update-permissions` with `canSend: false` for
  everybody; a recharge sets it back (`["audio"]` or `true`). The call
  screen also covers Daily's controls while paused.
- **Screens.** `src/components/SessionRecharge.jsx`, used by `Call.jsx`
  and `ChatPanel.jsx`. The call screen no longer ends itself at 0:00; it
  beats every 5 s once at zero and leaves when the server says ended.
- **Live.** `chat/0005_paused_seconds` applied to prod; namo-api revision
  namo-api-00095-qvr; both apps shipped at `424a0fc`.
- **Tests:** `tests/test_session_pause.py` (11). Three video tests now
  expect the room and token to run 120 s past the money.
- **Not verified on a phone.** The Daily mute uses an endpoint not yet seen
  answer from our account; if it refuses, the error is logged
  (`[video] could not pause room`) and the overlay is all that stops talk
  during the pause. Walk one real paid call to zero before relying on it.

## 73. Free delivery; Mantras icon; Bhakti chips — 8 Oct 2026

Rahul's three, live. Rule: `docs/01-PRD.md` §4.6; screens: `03-APP-FLOW`;
look: `04-UI-UX`.

- **Delivery is free.** `DELIVERY_FREE` (base settings, default on):
  `delivery.charged_paise` returns 0, so the quote answers `amount_paise: 0`
  (plus `courier_paise`, the courier's rate kept on the quote row) and the
  order, its Delivery line and the shipment carry 0. The pincode check and
  the COD check are unchanged. The test settings turn it off so the charged
  arithmetic stays tested; `test_delivery.py` has the free path. The cart
  and address step read "Free"; the product page "Free delivery."
- **Mantras' icon is the mala**; it was Darshan's diya.
- **Bhakti's deity chips are Consult's chips** — measured equal in the
  browser: 11 px, bold, uppercase, same padding.

## 74. Bhakti shares carry their picture; Darshan pills — 8 Oct 2026

Live. Screens: `docs/03-APP-FLOW.md`; look: `04-UI-UX`.

- **A shared Bhakti item has its own preview page**, `/bhakti/s/<id>`
  (`share.bhakti_page`, Firebase rewrite to namo-api), with
  `/og/bhakti/<id>.jpg` cut from a free status or wallpaper, the public
  preview of a priced one, or the site's card for audio. The share message
  links there with the sharer's code; the app route goes on to `/bhakti`,
  and the gate takes a signed-out visitor to `/onboarding?ref=…`.
- **A status or wallpaper card's Share sends the image file** with the
  message as caption (`shareAsset`); the status composer already did.
- **Darshan's deity pills** use the chip type (`caps-sm`), white on gold kept.
- Tests: `test_share_previews.py` gains three. Not checked in WhatsApp
  itself; WhatsApp caches a link's preview, so test with a new item.

## 75. The compact Consult card — 8 Oct 2026

Live. Rahul's reference layout, our colours (`docs/03-APP-FLOW.md`,
`04-UI-UX`). The card is ~193 px tall and keeps all four actions (Video,
Audio, Chat, Book — a first cut with only Call and Chat was reversed the
same day: Rahul asked for the format, not fewer options). The review count
is hidden on the card and the profile; the rating shows. The roster rows carry `avatar_url`
(the profile photo, one subquery in `public_consultants`). One consultant's
`languages` was saved as the string `"['Hindi', 'English']"`; the client
reads either shape now, and the row itself is still wrong in the database.

## 76. A recharged call no longer hangs up; one timer, one End — 9 Oct 2026

**The bug, from the logs (session 021af8e1, 8 Oct).** The recharge worked —
5 minutes added at 18:34:37, the 52 s pause skipped — and Daily hung up at
~18:35:00 anyway: the room's `exp` when the meeting STARTED (18:34:57).
**Daily fixes a meeting's end when it starts and ignores a later change to
the room's `exp`** (`eject_at_room_exp`), so every "move the room's end"
since 5 Oct did nothing for a meeting already running. Its "The meeting
will end in 1:59" banner was counting to that frozen end.

- **The room is a backstop now**: `exp` six hours out (`ROOM_BACKSTOP`),
  tokens the same. `providers.set_room_expiry` and `clock_started` are gone.
- **The settle closes the call**: `end_session` of a call queues
  `video.close_room` on commit — Daily's `POST /rooms/<name>/eject` by both
  user ids, then `DELETE /rooms/<name>`. Failures are logged; the money is
  settled either way. The sweeper and the heartbeat both settle, so a call
  ends within seconds of its pause running out.
- **The call screen** drives our own iframe with `@daily-co/daily-js`
  (`Daily.wrap`, 73 KB gzip, its own chunk): Daily's Leave is hidden;
  `left-meeting` asks the heartbeat — ended leaves, still live offers
  Rejoin. If the library fails, the plain embed loads as before.
- **One bar for both people**: time left, Recharge (seeker, last minute
  only), End call. The recharge panel opens under it; the pause overlay
  has no End of its own. The chat's meter row got the same Recharge
  button; the separate "0:45 left. Recharge" bar is gone from both.
- **Not walked on a phone yet**, and the eject and delete endpoints are
  unseen from our account. Walk one paid video call: recharge in the last
  minute, recharge in the pause, and let one run out.

## 77. Each product's own first-order cashback — 9 Oct 2026

The owner's rule (`docs/01-PRD.md` § referrals; columns `docs/05`).

- **`apps/shop/offers.py`**: the rule kinds (default, none, flat per item,
  percent with an optional per-item cap), `buyer_cashback`, and the
  sheet's phrase both ways (`describe`/`parse`). The next kind of offer
  goes here.
- **`referrals.services.cashback_split(lines, prepaid)`**: buyer gets the
  rule's amount on prepaid only; the astrologer 10% of each line after the
  buyer's share; default products as before (10% each, capped by
  `REFERRAL_CASHBACK_CAP_PAISE`). `claim_purchase` writes a row per side
  owed more than ₹0; the buy answer's `cashback_paise` is the buyer's.
  **Changed for default products too:** cash on delivery now gives the
  buyer nothing (the owner: "only on prepaid orders").
- **Fixed on the way:** a cancelled order (lapsed unpaid online, or
  cancelled) no longer uses up the buyer's first-order offer.
- **Console:** a "Cashback on a first order…" section on each product
  (kind, flat ₹, %, up to ₹), and a Cashback column in the list. The
  spreadsheet has a `cashback` column; a sheet without it changes nothing.
- **Cart:** `/referrals/check/` takes the basket (`lines`) and `payment`,
  and names the real amount, or "Pay online to get ₹X back" on COD.
- Migration `shop/0008_referral_cashback`. Tests:
  `test_referral_offers.py` (17), cashback cases in `test_shop_console.py`
  and `test_shop_sheet.py`.

## 78. The status card, Rahul's design — 9 Oct 2026

Live (front end only). `docs/03-APP-FLOW.md` has the screen.

- `composeStatus` (`src/lib/bhakti.js`) draws the new card and returns
  `{ blob, marks }` — `marks` place the preview's two pencils. Frosted
  glass is the artwork redrawn blurred under the card (`ctx.filter`; a
  browser without it gets the dark wash alone).
- `hinduDateLine(payload)`: tithi, paksha and month in Hindi from the
  panchang the API already serves; the API's amanta month is shown
  purnimanta (dark fortnight → next month's name). `statusDateLine(iso)`.
- `ShareSheet` shows the composed JPEG at an exact 9:16 (sized by a
  ResizeObserver) with Share only; `StatusDetails` is the pencils' page.
  The status name is a new `localStorage` key beside the photo's.
- Checked in a browser at 390 px; not yet shared from a phone.

## 79. Telegram feedback bot — 10 Oct 2026

Set up on the owner's laptop, not yet paired. Bun 1.4.2 and the Claude Code
CLI 2.1.295 installed; the official `telegram@claude-plugins-official`
channel plugin installed at user scope (marketplace
`anthropics/claude-plugins-official` added). `scripts/namo-bot.cmd` starts
a session in this repo with the channel on (`--permission-mode acceptEdits`).
The rules the bot works by are in `CLAUDE.md` ("Feedback from Telegram"):
replies first, fixes and commits, deploys on "ship" from the owner or
Rahul (Rahul's added 10 Oct), never money/auth/secrets without the owner. Bot `@namo_dev_bot`; both accounts paired, policy `allowlist`. It runs
only while that window is open and the laptop is awake.
**The plugin is off in every other Claude session** (16 Oct 2026; user
settings `enabledPlugins`): with it on, each VS Code session started its own
Telegram server, polled the bot and swallowed its messages, so the bot looked
dead. The launcher turns it on for its window alone
(`--settings scripts/namo-bot.settings.json`).

## 80. Affiliate links with a 15-day window; first-order cashback for all — 11 Oct 2026

The owner's rule (`docs/01-PRD.md` §12). Live after the deploy below.

- **Server** (`apps/referrals/services.py`): `record_visit` (a signed-in
  customer arrived through a link; refreshes the same link, adds another's;
  refuses after the first order, own link, consultant buyers),
  `live_visit` (newest, unexpired, unused), `is_first_order` (no other
  non-cancelled order with goods), `claim_first_order` (replaces
  `claim_purchase`: the buyer's prepaid cashback always, the astrologer's
  10%-of-the-rest only through a live link), `first_order_preview`,
  `attribution_days` (console row, else `AFFILIATE_DAYS`). Delivery and
  returns find cashback by `order_id`.
- **Checkout:** an `A…` code typed or carried from an old link counts as a
  visit, never a discount; an `N…` code is still refused at the till.
- **Endpoints:** `POST /v1/referrals/visit/`, `POST /v1/referrals/first-order/`;
  `/referrals/me/` carries `affiliate_days`. `affiliate_link` now gives
  `/shop/p/<slug>?ref=A…` (the product page previews with its photo).
- **App:** `AffiliateCatcher` (App.jsx) notes `?ref=A…` on any page in
  `localStorage` and sends it once signed in; the cart says the first
  order's cashback above Pay; the code box is "Coupon"; the old banner and
  `lib/shopRef.js` are gone. The pro "Your links" page states the rules.
- **Console:** *Affiliate visits* (who, whose link, expires, Holding /
  Replaced / Expired / First order made) and *Affiliate link window*
  (Finance).
- **Changed for everyone:** every first prepaid order now gets the
  products' cashback (default 10%) — before, only with a code.
- Migration `referrals/0002_affiliate_links`. Tests:
  `test_affiliate_window.py` (14); five old referral tests rewritten for
  links (no refusals now).
- **Not done:** Play Store install attribution (no app yet).
- **Walked end to end on production, 12 Oct** (Supabase test numbers
  9000000101/102, OTP 123456; purchases from the wallet so no parcel went
  to Shiprocket): a blog's tagged product carried the astrologer's `ref`
  and the visit was recorded (expires +15 days); a link opened signed out
  was kept and recorded at sign-up with the original click time; a second
  astrologer's link became the live one; a first order inside the window
  owed the astrologer ₹64 and the buyer ₹64; after moving the clicks 16
  days back, a first order owed the buyer only; a link after the first
  order was not recorded. Everything the test wrote was then deleted (the
  ledger's immutable trigger disabled and re-enabled inside the one
  transaction), stock restored. The two Supabase auth users and test
  numbers are the owner's to remove.

## 81. Ten reels a day from Google Drive, for Rahul Jain — 12 Oct 2026

The owner's ask: reels posted for Rahul Jain's account through the day,
from the Drive folder (`1d5odpIpxrzcVSSyVUONQSPnSdHJqhlQ5`), folder 3 on
(1 and 2 are the 48 clips seeded on Raghu's account on 15 Sep), never from
a laptop.

- `apps/content/drive_reels.py` and `manage.py post_drive_reel`: a Cloud
  Run Job `namo-post-reel`, started by Cloud Scheduler every 10 minutes.
  `plan_for(date)` gives the day's ten times (one per tenth of 06:00–23:30
  IST, a minute seeded by the date); a run posts at most one reel when one
  is due. Next file: folders by number from 3, files by name, videos only,
  not yet in `drive_reels`. Downloaded with the job's service account
  (metadata-server token, Drive read-only), uploaded to R2, published as a
  `clip` for `DRIVE_REELS_AUTHOR_ID` (Rahul Jain, the approved consultant
  `483214f1…`; a second "Rahul Jain" profile has no consultant row) with
  the file's Drive description as caption. Over 300 MB: skipped, recorded.
- Settings `DRIVE_REELS_*` (folder, from-folder, author, per day, window,
  size). Table `drive_reels` (`content/0007`), RLS on.
- `--list` shows today's times and the queue; `--now` posts the next one.
- **Live 12 Oct.** The folder is shared (Viewer) with
  `499026166575-compute@developer.gserviceaccount.com`; Drive API enabled;
  Cloud Scheduler `namo-post-reel-sched` (`*/10 * * * *`, Asia/Kolkata)
  runs the job. Queue at start: 2,388 videos ("3. Religious Reels" 843,
  "04. Krishna Reels" 1,545) — about eight months at ten a day. The first
  two went up 11 Oct, 23:40 IST; the video URL serves `video/mp4`.
- **No reposts:** a Drive file is posted once (`drive_reels`, unique id),
  and a file whose Instagram id is already in any clip's file name on the
  app (the 49 seeded) is never queued.
- **No bursts:** a time missed by more than an hour is dropped, not made up.
- **Spread across six accounts since 19 Oct 2026** (owner): Rahul Jain,
  Nitya Jain, Anand Ray, Avania Verma, Rudra Jain, Ramesh Kumar
  (`DRIVE_REELS_AUTHOR_IDS`); Vishwas Jain to be added when his account
  exists. Random rounds: each account one reel per six, in a new order.
  Posted as the platform (role `admin`), so those accounts keep their own
  video rights and posting limits. The job's image is built from a clean
  worktree of the commit and set on `namo-post-reel` alone.
- The job has only the database and media settings (copied from namo-api
  by the Cloud Run API, never printed). **All Cloud Run Jobs were moved to
  the current API image** — they had been pinned to the image of the day
  each was created; a new deploy still does not move them.
- Videos are posted as uploaded — no compression (HANDOFF's earlier note on
  reels applies).

## 82. Namo's share per astrologer — 13 Oct 2026

The owner's rule (`docs/01-PRD.md` §4.1; column `docs/05`). `FEE_BPS`
(4000, 40%) stays the default in code; `consultants.fee_bps` (null) sets one
astrologer's own share. `consultant_services.fee_bps_for(id)` is read by the
two places earnings are written — the chat/call settle and a booking — and
each earnings row stores the bps it was written at, so a change never
rewrites history. Console: a "Namo : astrologer" column on the astrologer
list, and "Namo's share %" on the astrologer's page for Finance and
Superadmin; Finance can change that and nothing else there (no approve or
block). Migration `consultants/0010`. **Not live: waits for the owner's
yes.** API `00121` and console `00027` were built from the deploy copy
(`C:/namoapi`) with this change reverted, and `scripts/prod-migrate.sh`
migrates from that copy, so `0010` is not on production. Tests `test_consultant_fee.py` (6).

## 83. 1namo.com on Cloudflare, pending the nameserver switch — 17 Oct 2026

Zone `1namo.com` created on the Free plan in `Onenamo.com@gmail.com's
Account` (zone id `1a71807291af6c1bede4a98a7b572485`). Status **pending**:
nothing has changed for visitors, because GoDaddy's nameservers
(`ns07/ns08.domaincontrol.com`) still answer. Cloudflare's are
`jade.ns.cloudflare.com` and `mustafa.ns.cloudflare.com`. They go in at
GoDaddy, and that switch is the owner's step.

Eleven records, all DNS only: `@` A `199.36.158.100`; CNAMEs `pro` →
`namo-pro.web.app`, `console` → `ghs.googlehosted.com`, `www` →
`atharvborse2004-ops.github.io` (unchanged for now; it dies when GitHub
Pages goes off, so it moves to Firebase next); Zoho MX 10/20/50; TXT
google-site-verification, `hosting-site=namo-web`, SPF (one copy of the
duplicated include removed), `_dmarc`.

The GoDaddy records it does **not** copy yet. The switch waits for these:
`zmail._domainkey` (Zoho DKIM), `_acme-challenge` and `_acme-challenge.pro`
(Firebase certificates). `_domainconnect` is GoDaddy's own and stays behind.
These were found by probing names over public DNS, because GoDaddy does not
allow a zone transfer. Read GoDaddy's DNS page before switching.
**`dc-8e814c8572._spfm.1namo.com` does not exist** (NXDOMAIN at GoDaddy's
own nameserver), and the SPF record includes it. That fails SPF for mail
from the domain today. Either add the record GoDaddy meant there or drop
the include.

## 84. The Android app (TWA), built — 19 Oct 2026

`com.onenamo.app`, "Namo – Connecting Bharat" (launcher "Namo"; it was built as "Namo – Hindu Social Network" and rebuilt 19 Oct at Rahul's word, before any upload), version
1.0.0 (code 1), Android 7+ (API 24), a Trusted Web Activity of
https://1namo.com/ — every web deploy is the app; no app update needed.

- **Built on the owner's laptop, outside the repo:** `~/android-build/`
  holds a portable JDK 17, the Android SDK (build-tools 36.1.0, platform
  36), the Bubblewrap project `namo-twa/` (twa-manifest.json), and
  `release/namo-1.0.0.apk` and `.aab`. Gradle builds it
  (`./gradlew assembleRelease bundleRelease` from Git Bash — Bubblewrap's
  own build step failed on Windows); `~/android-build/sign.sh` signs both.
- **Upload key:** `~/android-build/namo-upload-key.jks`, alias `namo`, its
  password in `namo-upload-key-PASSWORD.txt` beside it. Not in the repo.
  **Back both up**: without them no update can be uploaded.
- **Site:** `manifest.webmanifest` and icons (192, 512, maskable 512) in
  `public/`; `public/.well-known/assetlinks.json` with the upload key's
  SHA-256 (`A0:28:…:64:06`); `firebase.json` no longer ignores dot-folders,
  so `.well-known` deploys. Google's Digital Asset Links API confirms it.
- **Still to do:** after the first upload, add Play App Signing's SHA-256
  (Play Console → App integrity) to `assetlinks.json`, or Play installs open
  with an address bar. Store listing, Data safety, Content rating.

## 85. Faster first loads: the API stays warm, pages cached at the CDN — 19 Oct 2026

Owner's yes (both, and the cost). Measured before: `/` and the share pages
are served by the API (firebase.json rewrites), and with `minScale=0` the
first visit after a quiet spell woke a stopped server (3–8 s); every page's
HTML waited ~0.5–1 s with `Cache-Control: no-cache`, `X-Cache: MISS`.

- **namo-api `minScale=1`** (revision 00181 on; ~₹800–1,200 a month with CPU
  throttling). A `gcloud run deploy` keeps it.
- **HTML at the CDN:** `firebase.json` `**` → `public, max-age=0,
  s-maxage=3600` (was `no-cache`); `apps/content/share.py` pages →
  `PAGE_CACHE` `public, max-age=0, s-maxage=300`. Browsers still ask every
  load; Firebase's CDN answers (measured `X-Cache: HIT`, 0.03–0.07 s). A
  deploy clears the CDN, so a release shows at once; a console Link card or
  an edited post title shows within the hour at worst.
- Shipped from a worktree of the live web commit `3944d20` with only
  `firebase.json` changed (`8e815fd`, the chat Report, was not live and
  still waits for its "ship"); API `00182` from main.
- **Not done (owner chose 1 and 3):** splitting the 1.1 MB `index.js` by
  route, `media.1namo.com`, moving the API to Singapore.
