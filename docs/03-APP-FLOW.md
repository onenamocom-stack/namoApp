# 03 — App flow

Every route, what each screen does, where each action goes, and the state
machines behind bookings and money.

**This document owns navigation, actions and state machines. It never mentions a
colour** — anything visual is `04-UI-UX.md`. It names no columns and no
endpoints; those are `05-BACKEND-SCHEMA.md` and `02-TRD.md`. Prices are
`01-PRD.md`.

Described as built. Where a flow ends in a toast instead of an effect, it says
so.

---

## 1. The shell

`src/App.jsx` — `App` → `AppProvider` → `Frame`.

`Frame` is a 420px phone wrapper (`relative`, `overflow-hidden`, `h-[100dvh]`)
holding `<Routes>` plus four always-mounted overlays that gate themselves on
store state.

`HashRouter` is mounted **above** `AppProvider` in `src/main.jsx`, so the store
can call `useLocation()`. Every route lives after the `#`, which is why GitHub
Pages needs no configuration for sub-routes.

### Three layouts

| Layout | Contents | Used by |
|---|---|---|
| `TabLayout` | `<main key={pathname}>` + 5 seeker tabs | The five seeker tabs |
| `ProLayout` | Same, with the consultant tab set | The five `/pro/*` screens |
| `PlainLayout` | Bare `<main>`, no nav | Onboarding and every drill-in |

`key={pathname}` forces a remount on every route change, so no scroll position
or local state leaks between `/home` and `/pro/feed`.

Adding a route is: import the screen, drop a `<Route>` in the right group. There
is no route registry.

---

## 2. Route table

In file order, which is also resolution order.

| Path | Screen | Layout |
|---|---|---|
| `/` | → `/onboarding` | — |
| `/onboarding` | Welcome — language, what the app does, phone, code | Plain |
| `/onboarding/details` | AboutYou — every birth detail on one page | Plain |
| `/onboarding/computing` | Computing — writes the profile, plays the reveal | Plain |
| `/onboarding/{name,gender,date,time,place,phone,verify}` | → `/onboarding` (old links). The **pro** build keeps `name`, `phone`, `verify` as real screens for `?next=pro` | — |
| `/profile` · `/profile/:tab` | Profile | Plain |
| `/wallet` | Wallet | Plain |
| `/horoscope` | Horoscope | Plain |
| `/ask` | Ask | Plain |
| `/chart` | Chart | Plain |
| `/chart/:id` | Placement | Plain |
| `/match` | Match — Ashtakoota for two births | Plain |
| `/muhurat` | Muhurat — auspicious windows | Plain |
| `/people/invite` | Invite | Plain |
| `/people` · `/people/:id` | → `/match` (redirect) | Plain |
| `/read/:id` | Article | Plain |
| `/reels/:id` | ReelViewer | Plain |
| `/live/:id` | LiveRoom | Plain |
| `/consult/:id` | ConsultantProfile | Plain |
| `/notifications` | Notifications | Plain |
| `/studio` | Studio — everybody's own screens (main app, 14 Oct 2026, Phase 16; Dashboard at `/dashboard` until 17 Oct, which still opens it); signed out goes to `/profile` | Plain |
| `/studio/studio` · `/earnings` · `/profile[/:tab]` · `/affiliate` · `/payout-details` | The pro app's Studio, Earnings and Insights, practice, links and payout details. Studio for a Pro or a Creator, the rest for a Pro | Plain |
| `/studio/consulting` | Consulting earnings — chat, calls and bookings only (16 Oct 2026). A Pro | Plain |
| `/desk` · `/desk/ring/:id` | **Namo Consult** — a Pro's calling screen in the main app (14 Oct 2026, Phase 16): online switch, ringing requests, the queue and slots; a notification's Answer / Decline lands on `/desk/ring/:id` | Own shell, no tab bar |
| `/home?compose=1` | Home with the new-post sheet open (14 Oct 2026) | Tab |
| `/tag/:tag` | TagScreen — a hashtag's posts, Newest · Top (both apps) | Plain |
| `/messages` | Chats — Chatbox · Chat requests (both apps) | Plain |
| `/groups` · `/groups/:id` · `/groups/new` · `/groups/:id/edit` | A group's page; start a group; edit yours (14 Oct 2026, Phase 15c) | Plain |
| `/messages/:id` | Conversation — one person, free (both apps) | Plain |
| `/premium` | → `/home` (Premium not offered, 11 Oct 2026) | — |
| `/reports` | Reports | Plain |
| `/tarot` | Tarot | Plain |
| `/home` | Home | **Tab** |
| `/consult` | Consult | **Tab** |
| `/pooja` | Pooja | **Tab** |
| `/shop` | Market — products, E-books, Courses and Events as tiles (one page since 14 Oct 2026) | **Tab** |
| `/academy` | Forwards to `/shop?cat=ebooks` (and a `?book=`) since 14 Oct 2026 | Redirect |
| `/messages` | Messages (seeker app) | **Tab** |
| `/pro/apply` | ProApply | Plain |
| `/pro/consult` | ProConsult | **Pro** |
| `/pro/studio` | ProStudio | Pro |
| `/pro/live` | ProGoLive | Pro |
| `/pro/earnings` | ProEarnings | Pro |
| `/pro/profile` · `/pro/profile/:tab` | ProProfile | Pro |
| `/live` | → `/consult` | — |
| `/pro/*` | → `/pro/studio` | — |
| `*` | → `/home` | — |

### Route-order traps

1. **`/pro/*` must stay above `*`.** Otherwise a mistyped consultant path falls
   through the global catch-all and silently teleports a consultant into the
   seeker app.
2. **`/live` → `/consult` must also stay above `*`.** Live was absorbed into
   Consult as a mode; the legacy path is kept alive deliberately.
3. **`/people/invite` is declared before the `/people/:id` redirect.** React Router v6 ranks
   by specificity so it would work either way, but the order tells a reader
   which is intended.
4. **`/consult` and `/consult/:id` are different layouts** — a tab and a drill-in
   sharing a prefix. **This is why Consult's four modes are local state, not
   routes**: `/consult/call` would resolve as a consultant with the ID `"call"`.
5. **`/chart` has no back affordance.** It sits on `PlainLayout` with no back
   control in its header, reachable from three places, and only browser-back
   leaves it. A real gap, not a deliberate one.

---

## 3. Onboarding

Two pages since 3 Oct 2026, replacing nine one-question screens (Intro, the
side fork, name, gender, date, time, place, phone + email, code). Owner's call:
the phone first, so a returning number signs straight in, and everything else
on one page.

| Step | Route | Asks | Validation | Next |
|---|---|---|---|---|
| 1 | `/onboarding` | Language (English / हिन्दी, remembered on the device), four lines on what the app does, then the mobile number. *Get code* sends the OTP and the same page turns into a six-digit field with resend after 30s and *Change number*. The code auto-fills where the browser offers it (WebOTP) and verifies itself at six digits | number matches `[6-9]` + 9 digits; code accepted by Supabase | account signed up (interests picked, or a birth date on file) → `/home`; otherwise `/onboarding/details` |
| 2 | `/onboarding/details` | Name, three to five interests (bhakti, astrology, yoga, meditation, mantra, ayurveda, festivals, temples, scripture, Jain dharma, vastu, numerology), email (optional), referral code (behind a link). **No birth details** since 13 Oct 2026 (Phase 15a) | name non-empty; three to five interests | `/home` |

**Birth details when first needed (13 Oct 2026, Phase 15a).** Sign-up used to
ask every birth detail and end on `/onboarding/computing`'s reveal; that
reveal now plays only for an old link. A chart, a match, the muhurat and the
Today tab, with no birth date on file, show *Add your birth details*, which
opens `/onboarding/details?edit=1&need=1&next=<where you were>`: "Your birth
details", gender, date, time (or *I don't know*) and place required, then
back to where you were. On `?edit=1` without `need`, birth details are
required only once one is on file or one field is begun, and interests can
be changed (none, or three to five). |

The date and time fields format themselves: digits only, on the number
keypad, with `/` and `:` inserted as you type (`BirthInputs.jsx`). The same
fields serve *Someone else* in Namo AI and Matching, where the keypad had no
`/` or `:` to type.

**Editing birth details** is step 2 with `?edit=1`, prefilled from the profile.
Its button reads *Save*; it writes straight to the profile, clears the
browser's chart cache, recomputes, and returns to `/profile`. **No phone step,
no code, no reveal.**

Edit mode has a back arrow (`useGoBack`, falling back to `/profile`); sign-up has none.

### Two things the fork gets right, and one it does not

The consultant branch **skips the birth questions entirely** — a consultant
should not have to give his own moment of birth to reach his own bookings. And
**nothing about the fork is stored**: the URL is the only record of which side
you are on, so the choice cannot disagree with where you are.

What it does not do: gate anything. Anyone typing `/pro/studio` is a consultant.
Consultant approval (§8.3) is the fix.

### Why the place step carries a timezone

Step 6 is the only moment anyone knows the zone of the birth *place*, so it is
where `birth_zone` is captured — from the geocoder, alongside lat and lon, never
defaulted and never derived later. While the list was four Indian cities a
hardcoded `Asia/Kolkata` was survivable; with worldwide search it would file a
London birth under India's zone and shift every cusp with no error raised
anywhere (`docs/05-BACKEND-SCHEMA.md` §4.1).

This is why the step requires a **picked result** rather than typed text, and
why the zone is shown on each row before it is committed. Two places called
London differ by four hours, and that difference is invisible once stored.

A draft saved before this step carried zones has no zone, so it is treated as
incomplete and routed back to re-answer rather than written with a null.

### The time step can be declined, and what that changes downstream

Step 5 offers "I do not know my birth time". Ticking it disables the hour and
minute fields, allows Continue, and writes a null time with
`birth_time_known: false` — the column existed from phase 1 and the write
hardcoded `true` until phase 7.

The consequence is visible on four screens and is stated on each rather than
inferred:

| Screen | With a time | Without one |
|---|---|---|
| `/onboarding/computing` reveal | Sun, Moon, Rising | Sun and Moon; Rising reads *"Needs your birth time"* |
| `/chart` table | Nine rows including Rising, House column filled | Eight rows, House column dashed |
| `/chart` Houses section | Twelve houses | A line saying they need the minute, and a link to add it |
| `/chart` diagram, `/profile` overview | The chart drawn | The empty frame, with the reason under it |

The rule the table encodes: **planets survive a rough time and the ascendant does
not.** The chart is computed against noon local so the planets have an instant to
be computed from, and that noon never reaches the screen — a rising sign derived
from it would be precise and wrong, which is worse than absent.

A draft from before the checkbox existed has no `timeKnown` at all, and that is
treated as incomplete rather than as "unknown": it still needs a time. Only an
explicit `false` counts as an answer.

### The draft, and where it becomes real

Steps 3–7 fill an in-progress draft. Step 8 creates the account, and step 9
turns the draft into the `profiles` row by `UPDATE` — never an insert, because
the row already exists by then (`docs/05-BACKEND-SCHEMA.md` §7). From that point
Profile, Chart and Horoscope read the real row, not the mock user.

**The draft survives a reload.** It has to: reading the SMS means leaving the
app, and a phone is free to evict the page while you are in Messages. Held in
`sessionStorage`, so an abandoned signup clears itself with the tab. Before
this, an eviction during the code step created an account with no birth details
and said nothing.

Two failures on step 9 are surfaced rather than swallowed, both because the
reveal screen looks identical whether or not the write landed:

- **Draft lost and no details already stored** → back to step 2 to re-answer.
- **The write itself fails** → a "not saved" screen carrying the error, with a
  retry. Never the reveal.

Re-entry points: *Run onboarding again* restarts at step 1; *Edit profile*
opens step 2 in edit mode, headed **Edit details**, with an **About** box (your
bio, 150 characters) under the name — the one place a seeker edits their
profile (13 Oct 2026, Rahul).

---

## 4. Seeker screens

### `/home` and `/home/:tab`
**Three tabs since 9 Sep 2026** — Feed · Today · Darshan — in the URL, so a tab
is linkable and Back undoes the switch. `feed` maps to the bare `/home`.

**Today** is the daily reading and the panchang. Both were previously spliced
into the stream at positions 1 and 4 to be seen before the scroll buried them;
the tab is what that splice was approximating. Both cards fetch for themselves
and memoise through `cachedAstro`, so the move costs nothing.

**Darshan is a doorway, not a panel.** It redirects to `/darshan` with
`replace`, so Back from the shrine returns to the feed rather than bouncing
through a tab that forwards again.

**New post (+), Home only — 10 Oct 2026 (Rahul).** A round + at the bottom
right of every Home tab, above the tab bar. Signed out → toast *Sign in to
post.* Signed in → **Create post** full screen; a blocked account sees the
blocked note instead.
Publishing closes it and reloads the feed. A Home or Reels loaded within
five seconds of your publishing leads with your new post; after that it
takes its place like any other (12 Oct 2026, Rahul).

**The feed's order — 13 Oct 2026 (Rahul: "personalise the feeds").** Home
and Reels are ordered for the reader; they were dealt at random. First come
authors you follow, then authors whose posts you liked, saved, reshared or
commented on, and the kind you engage with most (reel, photo, blog). Newer
posts and more popular posts rank higher. A post or reel you watched (two
seconds on screen) in the last two weeks comes **after everything you have
not seen**, in Home and in Reels alike (19 Oct 2026, Rahul; before, it only
sank), with no line or label where they begin (Rahul). Signed out, the phone remembers its
last 500 seen posts and orders the same way. The same author never shows twice in a row while there is
another, and every fifth post is a random pick. Signed out, or with nothing
liked or followed yet, the feed is fresh and popular posts. If the ranked
feed fails to load, the old random deal stands in.

**Earn on NAMO — 21 Oct 2026 (Rahul).** Signed in, the feed carries a
sideways strip after its second post: three short cards — Join as a Pro,
Join as a Seller, Join as a Content creator — each a heading, one line and
Apply, the next card showing at the edge. Apply opens the Pro form
(`/earn/pro`), Studio with the Seller form open (`/studio?ask=seller`), or
Studio at Content & Referrals (`/studio?ask=content`). The category is chosen
on the Pro form. A card for a role already held (a consultant row, a seller,
a creator) is left out; with none left the strip is gone. A cross hides the
strip on that device. It replaced, the same day, one Pro card with a chip
per category.

**People to follow — 13 Oct 2026 (Phase 15a).** Signed in, the feed carries
one sideways strip after its fifth card: people followed by the people you
follow ("Followed by Tara"), then authors who posted most in the last two
weeks ("Active this week"); never you or anyone you follow. Each card opens
`/consult/:id` or `/u/:id`; Follow is the same saved follow as on a profile.

**Create post — 12 Oct 2026 (Rahul: "like Facebook"; it replaced the tabs
Text · Photo · Video · Blog).** One screen: Back, *Create post* and **Post**
(top right, live once there are words or a picture); your photo and name; one
box for the words; a picked photo or video under it with ✕. **Up to ten
photos** (17 Oct 2026, Rahul): the gallery picks several at once; the first is
the cover; a row of small photos under it, each with ✕ and a **+** while there
is room; a post is photos or one video, never both. In the feed a post with
more than one photo swipes sideways with *1/4* and dots; its tile on a profile
carries a two-squares mark, and the full-screen view swipes too. A Market
listing takes the same: the cover, then *More photos* (up to nine) in the
Sell form, swiped on the listing page. The toolbar
pinned under it, one row of pills, icon beside name (lowered the same day,
Rahul: "more modern"): **Photo/Video** (gallery; everybody may post video since
17 Oct 2026, Rahul; a live room still needs permission), **Camera**,
**Tag** (Tag product; consultants only) and **Blog**. Words alone publish a `post`
with no media, a photo a `post`, a video a `clip`. **Blog** opens *Write a
blog*: a cover box, the title large, the body, and under them Tag product
(consultants) and the word count with read time; **Publish** needs a title
and a body, Back returns to Create post. Each keeps its own draft. Edit uses
the same screen, its kind fixed, with **Save**. On a feed card the
words of a photo post or reel sit **under the author's name, above the
picture or video** (19 Oct 2026, Rahul; they were under it), three lines
then More; a text-only post keeps its tile or its words below. A **#hashtag** in a
caption or text post is a link → `/tag/:tag`, the tag's own page (13 Oct
2026, Phase 15a; it opened Search). Newest or Top, each post as the feed
draws it, matched whole-word in any script among the newest 1,000 posts.

**Feed** is the stream, where `kind` picks the card. The free-tools row used to
sit above it and is on `/consult` now, as of 7 Sep 2026:

| Card | Actions |
|---|---|
| Post | Like · Comments (sheet) · Reshare (not on your own) · Share (share sheet / copy) · Save. **Two seconds mostly on screen counts a view** (11 Oct 2026); the count is not shown on Home or Reels (12 Oct 2026, Rahul), only to the author in the pro app. Byline → consultant. A tagged product → `/shop?p=<id>&ref=<author's A code>` |
| Post head (post, reel, article) | Author → their profile · **Follow / Following** beside the name, as on Instagram (5 Oct 2026): the same saved follow the profile pages use, hidden on your own posts and when signed out |
| Reel | Two seconds playing counts a view (11 Oct 2026) · **Plays by itself** when 60% of it is on screen — muted, looping, one at a time; scrolling on pauses it and starts the next (5 Oct 2026). The speaker button turns sound on or off for the whole feed. Tap → `/reels/:id` · Like · Comments (sheet) · Reshare · Share (share sheet / copy) · Save. A tagged product → `/shop?p=<id>&ref=…` |

A reshared post appears in the feed after every third post under "↻ Name
reshared", and in the **Reshared** tab of the resharer's own Profile. Nobody
else sees a list of your reshares: `/u/:id` has none (13 Oct 2026, Rahul;
it had one). **Your reshare leads Home for five seconds**
(13 Oct 2026, Rahul), as a new post does: made while Home is open, the list is
read again a moment later with it first; opening Home within five seconds also
puts it first.

**Reshare asks how** (13 Oct 2026, Rahul — LinkedIn's sheet), on a post, a
reel and every Bhakti item: a sheet with **Reshare with your thoughts** (a
box for up to 500 characters, then Reshare) and **Reshare now** (the old
single tap). A reshare with words heads its card with the resharer's photo,
name and "Reshared", then the words, then what was reshared in a box; like,
comment and share sit under the box and act on the original (13 Oct 2026,
Rahul: "we can do better", LinkedIn's layout; it replaced the words under the
"↻ Name reshared" line). That card is yours alone — it is not folded into
"Name and N others". A reshare without words keeps the one "↻ Name
reshared" line. Tapping a lit Reshare removes it at once, without the sheet.

Home's three tabs are labelled **Reels · आज का पंचांग · आज के दर्शन** (30 Sep;
keys and URLs unchanged). No stories strip, no dates on posts. In
`/reels/:id` there is no position counter, and the chips under the author are
the reel's tagged products — "Book a session" was removed from there.
A reel that ends scrolls on to the next by itself; the last one loops
(19 Oct 2026, Rahul).
`/bhakti` has no header tag and its search sits above the tiles.
| Panchang | First on the आज का पंचांग tab. No links (the *Full chart* link was removed 30 Sep) |
| Reading | Under the panchang: **the free reading by sign** (30 Sep) — twelve sign chips, opening on the reader's own moon sign; the sign and date, headline, summary and Ujjain's windows; a last line to *Your own predictions* on `/chart`. No heading and no *Read all* |
| Article | → `/read/:id` · Save |
| Live | → `/live/:id` |
| Course | → `/academy`, which opens the Market's E-books |
| Product | **Add → cart** · → `/shop` |

The reading and panchang cards are hoisted to positions 1 and 2 **in the
component**, not by reordering the feed data, so the feed stays a list of
content.

### `/consult`
**Four options on every card** (5 Oct 2026): **Video**, **Audio**, **Chat** and
**Book**. The first three are the per-minute session — an audio call is the
same call joined with cameras off (`sessions.audio_only`). Book opens the
consultant's booking sheet (`/consult/:id?book=1`) and works offline. Each
button shows that consultant's own rate for it — video, audio and chat per
minute, Book the 20-minute price (`01-PRD.md` §4.1, 10 Oct 2026). The booking
sheet has no length picker: a slot is 20 minutes. The profile page carries the
same four as its sticky footer (Video · Audio · Chat · Book, each with its
rate; on a pro's own page they show the rates and press nothing).

**Free-tools row of six circles, above the search field** — all six navigate.
**Horoscope opens `/chart`** and **Ask AI opens `/ask`**, both since 30 Sep 2026
(the first went to `/horoscope`, the second opened the chat panel). Muhurat
joined on 22 Sep 2026 and Numerology on 25 Sep; at six the row **scrolls** rather
than shrinking further, because a seventh 56px circle has an unreadable label
and dropping one makes the choice for the seeker. It sat on `/home`
until 7 Sep 2026. It is here because this is the screen somebody reaches already asking a
question, and the free answer belongs in front of the paid one rather than
buried above a stream.

Then the roster, read from `consultants_public` — so an unapproved practice is
absent because the server never sent it, not because a filter here dropped it.
Search and category counts run over what came back; a practitioner with
several practices counts under each. **Whoever is online right now is listed
first** (5 Oct 2026), then best rated — the API orders it so and the screen
keeps that order through search and filters.

**Not on this screen since 5 Oct 2026:** "Your sessions" (now the chat panel's
Sessions tab) and the verified rail ("Unlimited questions in 20 min"), which
repeated the roster below it.

Per consultant, one compact card (8 Oct 2026, Rahul's reference; it replaced
a card with Video, Audio, Chat and Book buttons, milestone badges and two
sentences): the photo (initials without one) with the online dot, the name
with a tick when verified and "Busy" when they are on a session, the
specialty, the stars and the rating ("New" with none; the review count is
hidden for now, here and on the profile), and experience and languages on
one line. Under a dashed rule, the same four actions as before: **Video,
Audio, Chat** with the per-minute rate ("2 min free" for a new seeker's
free-first consultant) and **Book** with the session price. Offline, the
three live ones read "Offline" and do nothing; Book still opens the booking
sheet. The card opens the profile.

**Its own booking sheet is gone** — deleted as redundant with the one on
`/consult/:id`, which is the only booking flow.

**With nobody approved, the empty state is the whole screen.** Not a line of
grey text under the furniture: the banners, the category chips, the verified
rail, the search field and the session line all describe a roster that does not
exist, so none of them render. **The free-tools row is the exception and does
render there** — it needs no roster, and production's roster is empty by
decision, so dropping it in that branch would take the free half of the app off
production entirely. What remains says the list is empty because the practice is new,
and offers `/pro/apply`. The reasoning, and the rejected alternative of
approving six invented astrologers, is in `01-PRD.md` §7.

### `/bhakti`
**The devotional media library**, in the nav slot the shrine used to hold.
Wallpapers, ringtones, pooja tunes and bhajans, read from `bhakti_assets`
(migration 024) with a kind switcher and a deity filter built from whichever
deities are present in the selected kind.

**Five circles, and the fifth leaves the screen — 25 Sep 2026.** Darshan sits
in the kind row and navigates to `/darshan`: the row answers "pick a
devotional thing to do", and the shrine is the one people came for. It was
reachable only from Home's third tab, which nobody reads as "the mandir is
over there". It renders as a link rather than a button, because it belongs in
browser history and the other four do not.

**Then three banners, then a search field.** The banners sit UNDER the tiles —
the tiles are the navigation, and an offer that pushes navigation off the first
screen is furniture. Two of the three move this screen (to Status, to
Wallpapers) rather than leaving it, and the third opens the shrine. Search
reads the title and the deity of the **current kind only**: the tiles already
said which shelf you are on, and a search that silently jumped shelves would
make them a lie. An empty result says so and offers to clear itself, which is
a different state from a shelf that is genuinely empty.

**No client writes.** The table has a select policy and no other, so RLS denies
inserts by default. Rows come from a service-role script today and the phase 13
admin console later — `02-TRD.md` §7 refuses an admin role in the client, so
there is nothing to add here.

**Status and wallpapers are one layout — 25 Sep 2026.** They were a
full-width list and a two-column grid, which made the same artwork look like
two products and gave the wallpaper thumbnails no room to be looked at. One
card now, and only the ACTION differs: a status is shared, a wallpaper is
downloaded. **Wallpapers** (12 Oct 2026, Rahul): the picture, then Like,
Comment, Reshare and Share (the link) as on a Home post, and a green
**Download** with a download mark; no title or credit. **Bhajans and mantras**
the same day: the same four icons, then a green **Play**; a mantra's "Repeat 3
of 108 · Stop" shows under them while it runs. A priced row has no Reshare. A
reshared bhajan or mantra reaches the feed as its card picture.

**A shared Bhakti link opens that item** (12 Oct 2026, Rahul): `/bhakti/s/:id`
is the Bhakti screen with that item alone on its shelf and "See all …" under
it; it was the shelf, with the item somewhere in it. A reshared picture in the
feed and a Reshared row open the same address. The link's card is the item's:
its picture, or a bhajan's or mantra's cover, and its title. Since 12 Oct 2026 a status card is not the plain artwork: it is
the finished status (below), 9:16, composed as it nears the screen.

**Sharing a status composes a picture** (Rahul's design, 9 Oct 2026; it
replaced a gradient strip with a photo, name and date). The artwork fills the
frame; the NAMO mark sits top right; low on the frame one frosted card carries
the person's photo in a white ring (their initial when there is none), their
name, today's date ("09 OCT 2026 | FRIDAY"), the Hindu date in Hindi from the
day's panchang ("आश्विन कृष्ण पक्ष • चतुर्दशी" — the month named purnimanta,
as North India reads it), a gold rule, and a NAMO badge.

**No second screen** (12 Oct 2026, Rahul: "there is no need for this step").
The Status shelf shows every card as **the image itself** — what is shared
is exactly what is seen — and the card's **Share** hands it straight to the
phone's share sheet. It replaced a full-screen "Share to status" sheet that
opened between the card and the share. Under the image (12 Oct 2026, Rahul):
Like, Comment and **Reshare** as on a Home post, with their counts, and on the
right the green WhatsApp **Share**, which only shares the status; no title, no
credit, no link-share icon. A reshared picture goes to your profile's Reshared
list and into the Home feed as the plain picture under "X reshared", with the
same three icons; a tap on it opens its shelf. **One card per thing
reshared** (12 Oct 2026, Rahul): however many people reshare a picture or a
post, the feed shows it once, naming the newest resharer — "Tara and 9 others
reshared". One pencil, on the photo (the one on
the name went the same day, since both did the same thing), opens **Your
status details**, a page of its own: the photo (gallery,
camera, profile picture, remove) and the name for the status. A photo from
gallery, camera or the profile picture opens the adjust screen first (drag
to place, pinch or slide to zoom, the circle shows what is kept; 21 Oct
2026, Rahul), and tapping the photo adjusts it again. A group's photo
(new or edit group) goes through the same screen. **Save keeps
both for every status after it** — on this phone, keyed by user id, the photo
a 320px data URL (26 Sep 2026); the name is the status's own and does not
rename the account. With nothing saved, the account's name is used.

**What the web cannot do, the screen does not claim.** There is no native
shell, so no API sets a wallpaper or a ringtone: every button reads *Download*
and a line under the grid says what to do with the file.

**WhatsApp status is a share, not a post.** The image is composited to
1080×1920 on a canvas and handed to `navigator.share`; the person picks
WhatsApp, then Status. Their own photo goes through the identical path. Desktop
has no file share, so it falls back to saving the composed image.
**A status can be a video** (19 Oct 2026, Rahul), uploaded in the console
(MP4, up to 30 seconds and 30 MB, with an optional cover picture). Its card
plays it muted, tap for sound, with the same card a picture status has laid
over it (photo, name, date, tithi, the NAMO mark; the pencil changes them).
The phone draws that card into every frame at 720×1280 only when **Share**
is tapped (Rahul: people scroll past most statuses), showing *Preparing n%*;
the ready file's button says **Send to WhatsApp** and a second tap opens the
share sheet, which needs a fresh tap. A phone that cannot encode gets the
plain video the same way and is told so. Reshared to Home it shows its cover
or its own first frame; its WhatsApp link preview is the cover, or the site's
card without one.

`price_paise` is nullable and **null means not priced yet**, which the screen
distinguishes from free. Attribution is three NOT NULL columns and is rendered
on every row — these files are downloaded and some will later be sold, and
several deity images are share-alike.

### `/darshan`
**The one screen that does not scroll.** A fixed-height column: back bar, deity
row, shrine. Reached from Home's Darshan tab; it was `/pooja` on the tab bar
until 9 Sep 2026 and now takes the whole frame. Since 5 Oct 2026 it has no
`TopBar`. The close (a ✕) is at the right end of the deity row, after the chips (17 Oct 2026, Rahul; it was the left end).

Because it is fixed-height and has no nav under it, the 56px that `main`
reserves for the fixed navbar is dead space here — `main:has(.darshan)` in
`index.css` cancels it for this route only. Every other route scrolls, where
that reservation is harmless run-off.

Gestures on the shrine — swipe **right/left for the next/previous deity**
(which resets to that deity's first murti), **down/up for the next/previous
murti**. Both wrap. The nameplate on the arch follows along; its dots are the
murtis, the stack a vertical swipe moves through.

A swipe is refused when it starts on a control, because every prop is a button
and two own gestures already. Under 44px is a tap; an ambiguous diagonal is
ignored rather than guessed.

Four offerings on a rail down the left of the shrine, each an animation and a
toast (a white bar under the image was tried on 3 Oct 2026 and taken out the
same day, the owner's call). The brass on the shrine (bells, diyas, dhoop, thali) is
photographic since 3 Oct 2026: `public/puja/{ghanti,diya,diya-lit,dhoop,thali}.webp`,
generated in the owner's Canva account (Canva media MAHW7lUtQCA, MAHW7vzRMhQ,
MAHW7rZ-rtc, MAHW7g2EYF0, MAHW7pzOLRA — the background-removed cut-outs) and
falling back to the old drawings if a file is missing. The files are Canva's
preview size for now; the thali (the widest) is the one worth replacing with a
full-size download. There is one thali photo: lit, it glows from behind, because
a lit version could not be generated (Canva credit quota, 3 Oct).
Tapping the thali begins the aarti: the plate rises off the altar to in front of
the murti and circles there until tapped again (4 Oct 2026 — it used to light up
and stay put). It still rotates under a finger and settles to the nearest whole
turn. Flowers fall the full height of the shrine, twelve petals a tap.

**Sangeet** (4 Oct 2026): the music knob opens a sheet of Bhakti's own bhajans
and mantras, in two tabs. Tapping one plays it over the puja — a mantra loops,
a bhajan plays once — the knob goes gold while anything plays, and the sheet
shows what is playing with a Stop. Leaving the shrine stops it. Lit, each diya
carries a larger flickering flame over the photo's own; the pair face the thali.

Beginning the aarti lights everything on the altar: five flames on the thali's
lamp, both diyas and the agarbatti. Ending it leaves the diyas and agarbatti
lit. The Bell offering rings a real ghanta: one 4.2 s strike, `public/puja/ghanta.mp3`, cut
from "Indian Temple Bell" by ganiket (Freesound #466652, CC0) on 5 Oct 2026 — the
synthesised bell before it did not sound like one.

**The darshan page, as the owner's reference** (6 Oct 2026, "same to same"):
top to bottom —

- **Deity pills**, white on a gold strip, in a scrolling row with **back** at
  the left end. The row follows a swipe, so the chosen pill stays in view.
  **Sangeet** is a white button on the gold band's right corner, a step below
  the row (7 Oct 2026, Rahul), and turns gold with moving bars while something
  plays.
- A **gold band** across the shrine (`public/puja/gold-band.webp`, Canva design
  DAHXQAKkIg0, keyed). Its two pendants carry the **ghantis**, which ring when
  touched, and once on their own as you come in (12 Oct 2026, Rahul; silent
  where the browser has not yet had a touch).
- The **mandir's plaque** on the band: the temple's name and, under it with a
  pin, its location — **set per murti in the console** (8 Oct 2026, Rahul:
  each murti will be a photo from a different temple). A murti with no temple
  set reads "Shri Ganesh Mandir" and its title. Its place in the stack (1/4)
  follows. Tapping it opens the **murti sheet**, which is **the only place
  the image attribution appears**, so it cannot be removed without removing
  the images.
- **A murti can be a photo, a video or a temple's YouTube video** (20 Oct
  2026, Rahul; set per murti in the console). The video plays on a silent
  loop; the YouTube one plays in YouTube's player inside Namo, nothing links
  out. Either stands in the same frame, with the bells, dhoop, diyas,
  flowers and aarti in front of it. For a YouTube one the plaque takes a
  third line (Rahul, 20 Oct) saying what plays, and Sangeet stops and its
  button hides there (the temple has its own sound). It replaced, the same morning, a
  separate Live pill with its own list of temples.
  A temple's channel is asked first whether it is live. Off air, the frame
  plays the temple's latest finished stream. The plaque's third line reads
  *● Live* while live; off air, *Last live recording · Next live:
  <time>* — the stream the temple scheduled on YouTube, else the console's
  timings, else *not known*. Nothing is laid over the frame. With no
  recording to play, the frame shows that murti's own photo (never another
  murti's; dark without one), the line reads *Not live right now · Next
  live: …*, and Sangeet returns. It asks again every two minutes and plays the
  live stream once it starts. The
  channel link plays whatever the temple streams that day: nobody changes
  the link for a new day's video.
- The deities, their murtis and every plaque come from the console
  (`GET /v1/bhakti/darshan/`, docs/05 §5.2c-bis); until that answers, the
  page shows the eight deities it shipped with. **New temple photos** (told
  to Rahul 13 Oct 2026): 1080 × 1620 (2:3, the shrine's own shape on a phone;
  3:4 works and shows blur above and below), JPG or WebP under 500 KB. The
  plaque and band cover the top eighth, the bells hang at both edges below it,
  and the altar and thali cover the bottom fifth: the murti's face at about
  40% from the top, nothing that matters in those strips, and no lettering —
  the plaque names the temple.
- The **murti** fills the page over a blurred, darkened copy of itself, so a
  painting that does not match the phone's shape still reaches every edge.
  (A cropped option, `setting:croppedDeityImage`, went on 11 Oct 2026.)
- A **marble altar slab** across the bottom, the full width
  (`public/puja/marble-slab.webp`, from the same design), drawn at half the
  photo's height for its front face and 1.8 times the photo's depth for its
  top surface (10 Oct 2026, Rahul: the front face was an empty band, and the
  thali at the lip looked as if it were falling; three quarters, undivided,
  from 8 Oct). The agarbatti, both diyas, the thali and a brass bowl of
  marigolds stand a third of the way back across the top surface, each with a
  soft contact shadow (`onCounter`, `SLAB` measured off the photo).
- The page's way out, at the start of the deity row, **closes rather than
  goes back** (10 Oct 2026, Rahul): an arrow there read as a control that
  scrolls the chips.

This replaced, the same day, a full-page mandir entrance (white marble, then a
choice of marble, sandstone, gold or granite) whose doorway the murti stood in.

**No offering buttons: you touch the samagri** (5 Oct 2026, the owner's pick
over brass roundels on the pillars, a samagri tray, or a fan-out from the
thali). The ghantis ring, the agarbatti and both diyas light, the bowl of
marigolds (`public/puja/pushpa.webp`) showers flowers, and the thali begins or
ends the aarti. It never spins on the spot: it rises and circles in front of the
murti. Until the first offering, each object breathes a saffron glow, and a
one-time toast says what to touch (`namo.puja.touched` remembers it per device).

**Sangeet** opens with the current deity's own bhajans and mantras first ("For
Ganesh"), matched loosely on Bhakti's deity field and title, then the
Bhajans/Mantras tabs. **No sentence on screen for an offering** (12 Oct 2026,
Rahul): ringing, lighting, the flowers and the aarti show themselves; only the
first-visit hint about what to touch is said. A pushpanjali showers 36 photographed marigolds and loose
genda and rose petals (`public/puja/{flower,petal}-*.webp`); petals flutter
edge-on as they fall, and each one's size and speed differ. They fall behind
the green altar and what stands on it (12 Oct 2026, Rahul).

No money anywhere. Nothing books a pandit.

### `/shop`
**The cart button sits beside the search box, and that row stays pinned under
the header** — since 3 Oct 2026. It was a floating button, bottom right, from
10 Sep, and over a two-column grid it always covered some product's Buy. It
is there whenever this screen is open; the badge appears only with a count,
and an empty cart opens a sheet that says it is empty.

**Top to bottom, as on Bhakti and Consult** (5 Oct 2026): search and cart,
then the categories as round coloured tiles (All, Gemstones, Maalas,
Rudraksha, Remedies), then the promo banners, then subcategory pills where
the category pills were — every subcategory on All, picking one also picks
its category; the chosen category's own on any other. The per-category
banner that sat under the pills is gone (it repeated the tile). A
chart-matched hero when unfiltered.

**Add** goes to the cart; **Buy now** charges the wallet immediately. Sold-out
products keep their row with both controls dead.

**The tiles and pills are the console's categories** (6 Oct 2026), in its
order and names; a category with no icon of its own gets one matched on its
name and a colour by position. Until they load, the categories the products
carry. A subcategory pill matches the product's subcategory. **Tapping a
card opens the product's page.** Its cover photo is on the card when it has
one, the engraved plate when it does not.

**Report, on somebody else's post, reel or blog**: the ⋮ beside Follow at
the top of every feed card opens the report sheet (the reel and blog cards
got it on 19 Oct 2026, Rahul; before that only the reel viewer had it for
reels). **Edit, on your own post, reel or blog** (6 Oct 2026): an **Edit** button
where somebody else's post has the ⋯ report menu — on the feed card, beside
each piece in the Studio's "Already published", and in the blog reader's
top bar. It opens the composer over the screen, that kind only, filled in:
change the text, the image or video, and (a consultant) the tagged
products; **Save changes** updates the card in place. A removed post cannot
be edited.

**Sharing a blog or a product** shows its own card — title, a line of the
text, and the cover (or product photo) as the thumbnail — in WhatsApp and
anywhere else that previews links (6 Oct 2026; every link previewed as
Namo's front page). **So does a reel** (18 Oct 2026, Rahul): `/reels/<id>`
previews as "<Name>'s reel on NAMO", the caption, and a frame from a second
into the video, whole, over a blur of itself, with a play mark. **So does a
Bhakti item** (8 Oct 2026): its share
message links to `/bhakti/s/<id>?ref=<code>`, which previews with its title
and, for a status or wallpaper, its picture (a priced one shows only its
public preview); opened, it is the Bhakti screen, or sign-up with the code
for somebody signed out. A status or wallpaper's card Share sends the
picture itself with the message as its caption, where the phone can share
files.

**Blogs on the feed and at `/read/:id`** (6 Oct 2026): the uploaded cover,
16:9 on both, whole — on the feed card the title sits under it, as YouTube
lays out a video (7 Oct 2026; it was set over the picture) (it was saved and never shown — a drawn plate stood in), the
tagged products under it, and **Like, Reply, Share and Save** as a post has
(Save was the only action). Share sends the blog's own page; a blog has no
Reshare. The feed's shop cards are the live catalogue, square, opening the
product's page — they were `mock.js` products. **A read counts as a view**
(10 Oct 2026): five seconds on `/read/:id`, once per person per post per IST
day, never the author — the reel rule with a longer wait. The reader shows the
count beside the read time once it is above zero; it showed none before, and
Studio's blog rows read 0 because nothing sent one.

**A new seeker's free first session** (7 Oct 2026; 21 Oct 2026): consultants
ticked "free first" in the console come first on Consult for a seeker who has
never had a session — online ones above every other online Pro — and their
Video, Audio and Chat buttons read "2 min free" (the console's length) in
place of the rate, on the card and on their page; a request goes through with
an empty wallet. When the free time runs out the session pauses for a
recharge as any session does. Money added in that session, or within 15
minutes of it ending, is a conversion: the Pro's earnings gain a "Conversion
bonus" row, shown as "New customer bonus" under Where it came from. After the
seeker's first session the Pros show their rates like everyone else.

**Recharge without leaving the conversation** (7 Oct 2026). A chat or call
has ONE timer and ONE end button, the same row for both people (9 Oct 2026,
Rahul: the call showed three timers and Daily's own Leave behind ours —
Daily's Leave is hidden now). A video call shows the other person over
the whole screen and you as a small picture in the corner, both apps
(21 Oct 2026, Rahul: "as on WhatsApp"; Daily's speaker view, which
replaced its two-way grid). On a call the timer sits top left and the
buttons (Recharge, Kundli, End) run down the right side, one above the
other, round with their names under them (21 Oct 2026, Rahul); the
microphone and camera switches are Daily's, at the bottom. In the last minute a **Recharge** button
appears in that row for the seeker, and nowhere else; it opens up to four amounts — ₹100 when that buys a
minute (10 Oct 2026), then about 5, 10 and 20 minutes at this rate — and PhonePe over the conversation; the minutes
are added and the clock runs on. At 0:00 the session **pauses**: the call is
muted for both people and covered, the chat's composer is replaced by
"Paused until the balance is recharged", and the seeker sees "Your balance
has run out. If you want to continue talking, please recharge your wallet"
with a two-minute countdown, the amounts, and *Continue with wallet* when
the wallet already covers a minute; the row's End ends it. The consultant sees
"Paused. Waiting for them to recharge" with the same countdown and *End
session*. A recharge resumes both screens on their next beat (five seconds
on a call). The countdown reaching zero ends the session for both.

**Round tiles look the same everywhere** (7 Oct 2026, Rahul): Consult's
tools, Shop's categories and Bhakti's shelves are a beige face with the icon
in its own colour; a selected one gets a ring of that colour. On shop cards
the discount sits beside the price ("68% off"), not on the picture. The
header cart's icon is white. `/pro/earnings` shows take-home only.

### `/search` — from the header's search box (6 Oct 2026)

The box sits **in the header** between the mark and the wallet on Home, Shop
and Consult (Rahul's design: no tab spends a row on search). It opens
`/search` on that tab's kind — Shop on Products, Consult on Astrologers.
Bhakti's box opens `/search` on its **Bhakti** chip like every tab (7 Oct
2026; for a day it filtered in place); a Bhakti result returns to `/bhakti`
on that shelf, filtered to it, with "Showing “…” · Clear". The consultant
app has no search. Shop's cart moved into the header's action slot. Topic words
match in both scripts — "shani" finds शनि, "kundli" finds कुंडली — from a
list of about thirty astrology topics.


One box: astrologers (name, specialization, category, languages), products
(name, subtitle, brand, every category and subcategory) and posts and blogs
(title, caption, body, author). Chips All / Astrologers / Products / Posts,
each with its count; All shows five of each with "See all". Matched on the
phone over the roster, the catalogue and the newest 200 posts — older posts
are not found. A row opens the consultant, the product, the blog, the reel,
or a post's author.

**People and Groups (14 Oct 2026, Rahul).** The chips are All · **People** ·
Astrologers · Products · **Groups** · Posts · Bhakti. People and Groups are
asked of the server as you type (two characters at least, a quarter second
after typing stops): **People** by name or `@username`, each with their
tick, opening `/consult/:id` for a Pro and `/u/:id` for anyone else;
**Groups** by name, city or about, opening the group. **Everybody is found
by name** (17 Oct 2026, Rahul: "Search me सबका naam dikhe. We are social
network."), posts or not; a blocked account never. It replaced the rule of
14 Oct, under which only somebody who had posted or an approved Pro was
findable. The Chat tab's box opens on People.

**`1namo.com/<username>`** (11 Oct 2026, Rahul) forwards to `/consult/:id`
for a consultant and `/u/:id` for anybody else, signed out too (a seeker's
page still asks a signed-out visitor to sign in). A name nobody has, or a
blocked account, shows *Nobody by that name*. Share profile shares this
address whenever the person has a username, from either app.

**Everybody's page opens** (17 Oct 2026, Rahul; it replaced 12 Oct's "only
when one of you follows the other"): `/u/:id` for anybody not blocked, with
"Nothing published yet" when they have no posts. It shows the name, picture,
bio and posts; birth details, phone and email are never on it.

**One public page per consultant** (6 Oct 2026): `/u/:id` forwards to
`/consult/:id` when the person is an approved consultant (the author lookup
says `is_consultant`), so reshare and comment links that pointed at the
thinner page land on the one with bookings. Every profile — yours, `/u/:id` and `/consult/:id` — has the same header
beside the photo (11 Oct 2026, Rahul, Instagram's layout): the name, then
**posts · followers · following** as three columns, number over label. On a
consultant page, under the photo, three pills — years of experience ("10 yrs
Exp"), the rating ("5.0 · New" with no reviews, else the average and count)
and the badge (Pro, Expert or Master, set in the console) — then the
specialization as chips (split on commas), the bio and the credentials
(13 Oct 2026, Rahul; replaced the milestone badge). A verified consultant has a **blue verified mark** beside the
name, here and on `/consult` cards; the top bar's second line is the category,
never the word "Verified" (11 Oct 2026, Rahul). Above the tabs, the consultant's **intro** — the video (plays
in place) or photo they uploaded from Edit profile → *Intro video or photo* (Settings until 14 Oct 2026); nothing
when there is none (11 Oct 2026; it was a "Meet X · 1:24" placeholder). Its
**Posts** tab (was "Work", a list of titles) shows each
post in full, as the feed does (11 Oct 2026). **About** is the facts without a
heading (speaks, category, experience, verified). No Rates section since 13
Oct 2026 (Rahul: it repeated the footer); no Book section since 11 Oct. The
footer's four buttons are the way in and carry every rate — a tile that says
"Offline" or "2 min free" shows its per-minute rate on a second line. A reel's caption in the reels viewer folds to two lines; a tap
opens it.

### `/shop/p/:key` — a product's page (6 Oct 2026)

`key` is the slug or the id. Top bar: back to the shop, the brand (or the
category), the cart. Then the gallery — swipe through every photo and
video, thumbnails under it to jump; a video plays in place. Brand, name,
subtitle, price, MRP and the discount, "Inclusive of all taxes. Free
delivery." (8 Oct 2026), "Sold out" only when it is (the stock count and the
SKU chip went on 7 Oct 2026, Rahul), a row of three for a thing that is
shipped (15 Oct 2026, Rahul: each kind's page suits it) — *Sold by* the
brand (or Namo), *Shipped by Namo*, *Free delivery* — chips for category
and subcategory,
and **Share** (the phone's share sheet, or
the link copied). Then **About this product** — the description with its
formatting (6 Oct 2026): `## heading`, `### smaller heading`, `**bold**`,
`==highlight==` (saffron), `*italic*`, `- ` bullets, `1. ` numbers, `> `
a quote box, a blank line a new paragraph; built as elements, never HTML
(`src/components/RichText.jsx`). The console's description box has buttons
that add the marks; the sheet takes the same marks and **Questions people ask** (each opens in place).
Then **More from the shop** — six others, the same category first, each
opening its page at the top (the disclaimer line that was here is gone).
**Add to cart** and **Buy** are fixed to the screen's foot in the app's
column (they were sticky and sat 56 px up, text showing beneath). A product taken
down, or a key that matches nothing: "That product is no longer in the
shop", with the way back. The tab title, meta description and a
schema.org Product block are set while the page is open.

### `/shop/d/:id` — a download's page (15 Oct 2026, Rahul)

A Downloads card on the Market opens it. Top bar: back to the Downloads
tile. The whole cover on a quiet ground; the format chip (PDF), the name,
*By* the credited name, the price with the MRP struck through and the %
off (or *Free*), and the Bhakti row (Like, Comment, Share). **What you
get**: the format and that it opens on any phone or computer; that it is
yours at once, in the browser; that it is yours to keep (bought once and
reopened from here, or free to keep). **What is inside** — the console's
description, in the product page's marks — when there is one; **Credit**;
**More downloads**, four, with *See all*. Fixed to the foot: the price and
one button — *Download* for a free one, *Get it* for a priced one (asks
the server: a ten-minute link to an owner, else the Paywall opens on the
page), *Open PDF* once the link is in hand. An id that matches nothing:
"This download is no longer here", with the way back.

### `/shop/l/:id` — a seller's listing (15 Oct 2026, Phase 17)

`src/screens/ListingPage.jsx`. A download, course or event a Pro or a
Creator listed and an admin approved (a product listing opens its shop
product page). The Market's Downloads tile and strip carry sellers'
downloads beside Namo's books; Events and Courses stop saying *Soon* once
one is listed, and show theirs as a strip on All and a grid on the tile.
One button at the foot: free is taken, paid opens PhonePe; once yours,
*Start* (the lessons play in place), *Join* (the link shows on the page),
or *Download* (a ten-minute link). Not live yet: an unknown id says it is
no longer on the Market.

- **Course:** the trailer; Course chip, name, *By* the teacher and tick,
  price with MRP; three facts — lessons and hours of video, language, yours
  to keep; *What you will learn*; *Lessons*, numbered with minutes, the
  first a *Free preview*; *About the teacher*. At the foot: the price, "One
  payment. Every lesson.", **Enroll**.
- **Download:** the cover, the file's type and size, What you get, About,
  the seller.
- **Event:** the banner with the date as a calendar leaf and *Online*;
  Event chip, name, host, price with MRP; three facts — day and time,
  online (link after booking), seats left of the total, and "Only N seats
  left" at ten or fewer; *Agenda* as a timeline; *How it works* (book and
  pay, the link on Namo an hour before, join from phone or computer);
  *About the teacher*. At the foot: the price, seats left, **Book seat**.


### Market, `/shop` (Shop and Academy in one page, 14 Oct 2026, Rahul)

One page where somebody buys goods and services. The tiles, after the
header's search, in Rahul's order (15 Oct 2026): **All**, **Downloads**
(was E-books: any file — a PDF, an e-book, a tool), **Events**,
**Courses**, then the console's shop categories. **Since 19 Oct 2026
(Rahul)** Downloads, Events and Courses can be categories in the console
too: a console category named Downloads, Events or Courses is that tile,
in the console's order among the rest, and any category unticked *Show*
(those three included) has no tile and no section; without such a
category the three tiles stay first as before. The word is **Market**
everywhere a person reads it (was Shop; the `/shop/...` addresses stay). `?cat=ebooks` (or
`?cat=downloads`), `?cat=events` or `?cat=courses` opens on that tile; `/academy` forwards to `?cat=ebooks`, and a shared
book's address (`/bhakti/s/:id`) to `?cat=ebooks&book=:id`, that book first.

- **All**: the banners and subcategory pills, then one section per
  category (15 Oct 2026, Rahul's reference layout): its name, *See all*
  (opens that tile), and its first twelve as one strip of cards that swipes
  sideways, about two and a third on screen (15 Oct 2026, Rahul) — picture,
  name, seller, then the price with the MRP struck through and the % off
  when there is an MRP above it. Downloads first (a card opens that
  download's page, `/shop/d/:id`), then Events and Courses once they
  have listings, then each **sub category ticked "Show on Market home"**
  in the console (18 Oct 2026, Rahul), its name as the heading and *See
  all* opening its category with that sub category picked, then the
  console's categories. A product on no console
  category is under *More*; a category with nothing in it has no section.
- **Downloads**: every one. Each has the Bhakti row under its title (12 Oct
  2026, Rahul): Like, Comment, Reshare and Share, with Read on the right; a
  priced book has no Reshare. A priced book is bought from the wallet (the
  Paywall's *Unlock*). Built and switched off (15 Oct 2026, Rahul's ask,
  waiting for the owner's yes): with `EBOOK_PAY_ONLINE` on, the server's
  402 says `pay: online`, the Paywall's button reads *Pay · ₹99* and opens
  PhonePe's checkout, the status check (or the webhook) unlocks the book,
  and the wallet refuses to sell e-books. A closed sheet charges nothing.
- **Courses** and **Events**: a *Soon* under the tile and a coming-soon
  panel. Academy's Courses and Events tabs were mock data and went with it.

The Shop · Academy switch under the header is gone.

### `/tarot`
A guided pull, as a state machine rather than one laid-out screen:

```
deck --pick a tradition--> question --pull--> card --Reveal my reading--> reading
```

**No way back out of a pull since 30 Sep 2026** (owner's call): *Ask a reader*,
*Pull again* and *Change deck* are gone from under the card. A pull is one
question, answered; another pull is another visit.

`deck` and `question` are **centred modal dialogs**, not bottom sheets — a sheet
reads as more of the same screen, and these are questions the screen is asking.
The face-down deck sits behind them; it is the subject of the dialogs, not an
empty state. `deck` has no dismiss: there is no screen behind it to return to.

**The question dialog has no box** (30 Sep 2026, owner's call): *Think of a
question* — *one that can be answered yes or no; hold it in your mind, then
pull.* The server reads the card as the answer to an unspoken yes-or-no
question (`apps/ai/tarot.py`, UNSPOKEN) and never guesses what it was. This
reverses the typed question of 24 Sep, described below.

**The question is typed, as of 24 Sep 2026.** This reverses the rule this screen
was built on — "nothing is typed, the seeker holds it in their head until the
card is face up" — and the reversal is the point of the change. Holding it was
right while a card answered with a line written months earlier: typing into a
box that changed nothing would have been theatre. The reading is now written for
the question, so the question has to reach the reader. 200 characters, and the
pull button stays disabled until something is in the box.

**The server deals the card** (`apps/ai/tarot_decks.py`). The screen sends a
deck key and a question and nothing else; what comes back is a card id, the
reading and one remedy. A client that dealt its own card could pull until it
liked the answer, on a pull that is charged.

**Six steps, agreed with the partner**: pick a deck, put the question, pull the
card, then **what the card says → where it lands → what to do**. The last three
are labelled on screen and the labels do not change between decks, so a seeker
who learns one deck has learned them all.

**Where each of the three comes from**, now that both decks arrived with their
own text (25 Sep 2026): the **meaning** is the card's, written once and true of
the card. The **conclusion** is the model's on every deck — it is the only part
that can turn on what was typed, and it is the reason the question is asked at
all. The **action** is the card's where the deck has one (Bhaktamar's sheet
writes one, and its recitation follows underneath) and the model's where it
does not.

Two decks, both with their faces: **Bhaktamar**, 48 cards carrying the shloka,
the meaning and the action; and **Yes or No**, 27 cards — nine yes, nine no,
nine wait — each with a verdict, a one-line result, a meaning and a shloka. The
verdict is the CARD's and is printed large above the reading; the model is told
it and may not argue with it. The Vedic Kipper six are written down but
unreachable until their faces are drawn. Rider-Waite, Sufi Path and Lotus Path
were deleted outright — six authored lines each and no art.

Card order, fixed since 30 Sep 2026 (owner's): **face (no tradition tag, no
number on it) → name → shloka → *Reveal my reading* → what the card says → the
result (the yes/no verdict and its sentence) → where it lands → what to do.** The card and its verse are
looked at before anything explains them; the reading waits behind one tap. This
reverses the order that put the shloka below the reading.

**The Yes or No deck is its sheet and nothing more** (30 Sep 2026, owner's
call): after *Reveal my reading* it shows the verdict, the sheet's sentence
and the card's meaning — no *Where it lands*, no *What to do*, no closing line,
and no *Still stuck* section under it. None of that was on the partner's sheet.
The server does not call the model for this deck (`sheet_only` in
`apps/ai/tarot_decks.py`); the pull is still counted and charged.

Two free pulls a week, then **the wallet is charged for real** (price in
`01-PRD.md` §4.2). Both the count and the price are the server's and arrive on
the response; the header shows whichever is true. A short balance is a refusal
the server writes, rendered as-is with a way to the wallet. **The price appears
nowhere until the free pulls are gone** — not in the header, not on the button.

### `/chart`
**Where Consult's Horoscope tile lands, since 30 Sep 2026.** Three tabs:
**Chart**, **Dasha** and **Prediction** (`?tab=dasha`, `?tab=prediction`).

**Dasha** is the Vimshottari timeline, free: what is running today (mahadasha
and antardasha, with their end dates) in a raised card, then the nine
mahadashas from birth, the running one open to its antardashas and any other
one tap away. The running period is found on the phone by today's date, from a
timeline cached forever. Without a birth time the screen says the dates are
approximate — every one is measured from the Moon.

**Chart is Vedic only; the placement table is gone.** D1 leads, drawn. Under it,
every other divisional chart the vendor computes — D2, D3, D4, D5, D7, D9, D10,
D12, D16, D20, D24, D27, D30, D40, D45, D60 — each a row with its name that
opens to its own diagram. All of it was computed at sign-up and is cached
forever, so opening the tab computes nothing. Without a birth time every
diagram is drawn empty with the reason. The ayanamsa and house system stay
printed under *Birth data*.

**Prediction** is the reader's own reading for **today only, free** (21 Oct
2026, Rahul) — the full reading that was `/horoscope` from 22 to 30 Sep. No
Yesterday / Today / Tomorrow switch, no plan end date, no offer; from 30 Sep
to 21 Oct it was the three days, paid (`01-PRD.md` §4.11). `/chart/:id` placement pages still exist but nothing on
`/chart` links to them now.

### `/match`
**Two slots, and the first defaults to you.** Slot one is the signed-in
reader's own chart — the server reads their birth row, the client sends
nothing about them — with one tap to type somebody else instead, so a parent
can match two other people. Slot two is always typed. Submitting slot two runs
the match.

**Nothing typed is saved** (`01-PRD.md` §4.4). The result is stored server-side
under a hash of the two births; the names and dates stay in the request. Reload
and the form is empty again, which the form says before it is filled in.

The answer leads with the total out of 36 and the vendor's verdict, then the
pass mark of 18, then the eight kootas one by one with their evidence lines,
then the doshas: Manglik per person, Nadi and Bhakoot for the pair. **The total
is never shown alone** — a pair can clear 18 carrying the one dosha that
matters, and the single number is the part people screenshot.

**An unknown birth time is named on the answer, per person.** Every koota is
read off the Moon, which crosses a nakshatra in about a day, so a substituted
noon can move the score.

### `/muhurat`
**A purpose, a month and a place.** Six purposes as circle tiles (general work,
vehicle, property, griha pravesh, namkaran, mundan — 5 Oct 2026, they were
pills), this month or the next two, and a
place prefilled from the birth row and changeable in one tap — a muhurat is
built from sunrise, and where you were born is rarely where you are buying a
car. The place is named on screen for the same reason the panchang names
Ujjain.

**Judge against your zodiac** is a card at the foot of the screen, where *Before
you act on this* was until 5 Oct 2026. Judged, only the **best quarter** of the
month's windows is shown, ranked by the vendor's score for this chart and listed
by date — fewer and more accurate, the owner's ask. It appears only when a birth row exists, and is paid
since 30 Sep 2026: **₹49 for one purpose in one month** (`01-PRD.md` §4.11).
Unbought, the server answers 402 with the price and the screen shows the offer
with a way back to the free windows; bought, reopening it is free. It switches
to the personalised search, which ranks the same windows against that chart and may
promote one exact moment. **It often promotes none and explains why**, and that
sentence is then the whole answer — the screen renders it rather than an empty
list.

**An empty month is an answer, not a failure**: griha pravesh returns nothing
through Chaturmas, and the screen says so and points at the next month. Windows
that have already passed are dropped in the client, so the server's answer
stays one row a month for everybody in the same 11 km cell. A window running
past midnight is marked `+1d`, and sunrise-to-sunrise windows print their
length, because their two clock times are identical.

### `/profile/:tab`
**Instagram-shaped since 4 Oct 2026** (owner's call). The top: your picture in a
saffron ring (tap to change), beside it your name over posts · followers ·
following (the shared profile header), then
two icons without words since 14 Oct 2026 (Rahul; five the day before):
**Edit**, which opens **Profile settings** (`/profile/settings`: Edit details
for name and birth details, Username, Orders, language — every edit in one
place), and **Share** (`/u/<you>`). Consult, Sessions and Wallet went: they
are all the Consult page's wallet button.

**Sadhana streak** (14 Oct 2026, Phase 15c): under the bio, beside a mala,
"7-day sadhana streak · best 12" on your Profile, a Pro's page and `/u/:id`.
A day counts when a mantra's japa in Bhakti plays through to the count you
chose, or when you begin an aarti in Darshan. Days are IST; the run breaks
once a whole day passes with neither. Somebody else's shows only while it
runs; yours at zero says "Finish a japa in Bhakti to start your sadhana
streak" and opens Bhakti. A green dot on the photo's top right (it was a "● Available" line
under the name until 11 Oct, Rahul). Under the name, your bio — *Write about
yourself* until you write one, which opens Edit profile; the bio itself has no
pencil and is edited only there (13 Oct 2026, Rahul). Choosing a new picture opens an adjuster first: drag to
place, slide to zoom, and only the circle is uploaded. Icon tabs, each its own
URL: **posts** (each post in full, newest first, exactly as the feed draws it —
like, comment, reshare, share; empty, it says to tap + on Home),
**reshared** (what you reshared, each card as the feed draws it under "↻ You
reshared" with your words) and **commented** (somebody else's posts and the
Bhakti items you commented on, each once, your latest comment above it) — both
13 Oct 2026, Rahul — **saved** (your bookmarked posts), and **influencer** for influencers. Bare
`/profile` opens posts, always (5 Oct 2026).

**Posts in full on every profile — 11 Oct 2026 (Rahul: "like the profile page
of Facebook").** Your Profile, `/u/:id` and a consultant page's Posts tab all
show that person's posts as feed cards, newest first. They were a grid of
thumbnails, a list of titles, and a row per piece.

**Removed 11 Oct 2026 (Rahul):** the Sun / Moon / Lagna chips (they said nothing
clear), the **+** (a post is made from Home's +), and the **Kundli** tab (the
horoscope section has it). `/profile/kundli` still exists — the chart, birth
data, matching, muhurat and reports — but nothing in Profile links to it.

**A pro has one profile** (10 Oct 2026, Rahul). For an approved consultant,
`/profile` and `/profile/posts` render the `/consult/:id` page itself — photo,
specialization, rating line, bio, the degree and *Speaks* (the languages,
15 Oct 2026, Rahul), intro, Posts · Shop (when they sell) · Reviews (Posts
opens first, for clients too), and
the footer with the 20-minute price and the per-minute rate — with **Edit
profile** (13 Oct 2026, Rahul; the old one, which edited name and birth
details, went to Settings on 11 Oct), then **Studio**
(11 Oct 2026, Rahul: opens pro.1namo.com from 1namo.com, the pro app's start
inside it; a first visit there asks for the phone code once) and **Share profile**
(`/consult/<you>`) where a client sees Follow and **Share profile**, half
the row each, both the white button (no saffron, Follow or Following) (11 Oct 2026, Rahul: they replaced the schedule, chat, video and
call icons, which did what the footer's four tiles do). The **+** went on 11 Oct 2026 (Rahul): a post is
made from Home's +. Your own page has six tabs, scrolling: Posts ·
**Reshared** · **Commented** (13 Oct 2026, Rahul) · **Saved** (11 Oct) ·
Shop · Reviews; a client sees Posts, Shop when there is one, and Reviews.
The About tab went on 15 Oct 2026 (Rahul): its languages are under the
degree, and its category, experience and verified tick were on top already. On your own page
Followers and Following open the list of those people (12 Oct 2026, Rahul);
on anybody else's they are numbers only — the server lists only your own.
No Book section, no footer buttons, no offline note. Back means Home; ☰ opens
settings. Settings had a first section, Profile → **Creator**
(`/profile/influencer`, which still opens), and *Earn on Namo → Studio*,
until 19 Oct 2026 (Rahul: duplicates of Studio, which is the button on the
profile and holds the sign-ups). The intro row left it for Edit profile, and Settings lost
*Notification history*, on 14 Oct 2026 (Rahul): the bell is the
notifications. Kundli and Saved left that section on 11 Oct 2026 (Rahul): the
horoscope section has the kundli, and Saved is a tab on the page. An applicant who is not approved, or a blocked
consultant, keeps the seeker profile. The consultant app's preview of
`/consult/:id` stays the client's view.

**☰ → `/profile/settings`** (the old Settings tab's address): invite a friend,
then Account (**Username** — a sheet with `1namo.com/` and the name, checked
as you type, saved once every 30 days (11 Oct 2026, Rahul); the pro app's
Settings has the same row under Practice — orders, notification history, phone — no Wallet row since 11 Oct
2026, Rahul: the wallet is the header icon — on Consult only in the seeker
app since 13 Oct 2026, every tab in the pro app), Preferences
(language; **Data saver**, Off / On, kept on the phone: reels play at
480p and nothing loads ahead (18 Oct 2026, Rahul's video spec); help and
support; the full deity image toggle went on 11 Oct
2026, Rahul: the murti is always whole), and sign out. Under it, **Delete my
account** (19 Oct 2026, Google Play's rule): a sheet says what goes (name,
phone, birth details, photo, username, bio, posts, comments, the login, a
Pro or seller practice, the referral code, wallet money) and what the law
keeps (payment, order and earnings records, unnamed), and wants the word
DELETE; then signed out. The same steps without the app are at
`/delete-account.html`; `/community-guidelines.html`, `/terms.html` and
`/privacy.html` are linked there. A person's page (`/u/:id`) has **Block**
beside Report: their posts, reels, comments and messages are hidden from
you (the feed, for-you and comments leave them out). In the Android app a
paid download or course says *Not sold in the app* instead of Buy (Play's
billing rule); Namo AI and tarot say they are guidance, not medical, legal
or financial advice. Back means Home from the profile and the
profile from settings. "More from Namo" (Namo AI, premium, academy, shop) went on
11 Oct 2026 (Rahul): each was a second link to a tab or a tool.

Gone with the old Overview: the prototype's *Past sessions* (mock data shown to
real accounts), the Download and Share buttons that toasted without doing
anything, and the notification and privacy rows that said "prototype only".

### `/support`
Both apps, signed in or out (the session gates let it through). Call, WhatsApp
and email; *Report a problem* — topic chips, an optional order or session ID,
what happened — then **Send by email** or **Send on WhatsApp**, each pre-filled
with the topic, the account and the app, enabled once something is written;
five FAQs. Linked from Profile → Settings in both apps and from the sign-up
screen's footer.

### Banners and the festive theme
`GET /appearance/` once at start-up. Consult, Shop and Bhakti put the
console's banners for them before their own three (or instead of them, when one
says so); a tap follows its link. A live theme repaints the accent and button
colours and puts its greeting under the top bar. If the read fails, nothing
changes.

### Bhakti's share screen
*Share* on a status opens a full screen (4 Oct 2026; it was a bottom sheet
whose Share button sat below the fold): the preview sized to the screen, one
row of icon buttons — Gallery, Camera, Profile photo, Remove — and **Share
this** pinned to the bottom.

### Home, Today
The reading under the panchang is **your rashifal only** — your Moon sign's
day, with no picker for the other eleven (4 Oct 2026; they remain on
`/horoscope`). The panchang header no longer says "Computed at Ujjain".

### Sign-up links
`/onboarding?ref=…` stores the code for the visit; the details page opens its
referral field already filled, and claims it on submit. Codes are four
characters, one per person, since 19 Oct 2026 (Rahul): a Pro's code works at
sign-up too, and the server decides whether it applies.

**A Pro's or Creator's Market link opened signed out** (16 Oct 2026, Rahul):
the app notes the page (`/shop/p/…`, `/shop/l/…`, `/shop/d/…`, with its
`?ref=`) and goes to sign-in; after the OTP — a new account once *About you*
is saved, an existing one at once — it opens that page, not Home. The note
lasts a day and is used once. The link's code reaches the server the moment
there is a session, as before.

### `/wallet`
Balance and history, both read from the server. Since phase 3 *Add money* opens
a sheet: four presets and a custom amount, then PhonePe's own checkout in an
overlay this app does not draw.

**Nothing on this screen credits anything.** The sheet opens an order and
hands off; the balance moves when the provider's webhook reaches the server and
its signature verifies. So the screen cannot await the credit — it polls for a
few seconds, and if the credit has not landed it says the payment is settling
rather than holding a spinner over a number it does not control. Dismissing
PhonePe's overlay, or a card the bank declines, both return to the sheet with
the balance untouched.

The payment-method tags are still gone, and so is the cashback label, which is
deleted rather than deferred — `01-PRD.md` §4.8.

The seeded transaction list is gone too, here and on the profile wallet tab.
It was denominated in rupees while real entries are paise, and a list mixing
the two is off by a hundred on half its lines.

### Others
`/reports` charges for real but **has no way to open the cart** — the only route
to checkout is walking to Shop.
`/ask` spends questions and its pack sheet grants them free, with a hardcoded
wallet figure. `/chart`, `/chart/:id`, `/read/:id`, `/reels/:id`, `/live/:id`,
`/notifications` are read-only or toggle flags.

`/reels/:id` rewrites the URL as you scroll, so the address bar tracks the
visible reel.

### A computed answer is fetched once a day, not once a mount

Every screen below reads through a browser-side cache in `src/lib/astro.js`,
stamped with the IST day. What that changes on screen:

- **A reload costs nothing.** The reading, the panchang and the chart are
  already there and render immediately instead of showing a loading line.
- **Opening the horoscope overlay from `/home` costs nothing**, because the
  reading card on the same screen already fetched that day's reading. Two
  components mounting together produce one request, not two.
- **A chart never refetches at all.** It is a function of a birth.
- **Tomorrow still costs one request**, once, the first time somebody asks for
  it. Verified by counting: a cached day is zero requests, an uncached one is
  exactly one.
- **And the panchang is cached once for everybody, not once per reader.** It is
  the same almanac either way, so a signed-out reader on `/horoscope` gets the
  entry `/home` already wrote.

**The daily reading is two readings since 30 Sep 2026** (`02-TRD.md` §8 owns
the decision). **Free, by sign**: Home's Today card and `/horoscope`, twelve
sign chips opening on the reader's own moon sign, the sign named on every
surface, the dasha line dropped and the windows named as Ujjain's. **Free too
since 21 Oct 2026, your own, today only**: `/chart`'s Prediction tab, computed from the reader's birth, windows at
the birth place.

**`/horoscope` names its places.** The almanac line under the date is Ujjain,
shared by everybody, and so are a sign reading's windows.

The reading still depends on the chart having loaded once, for that header
line. That costs one request per account, ever, and nothing daily.

**The sun, moon and rising line in a header comes from the CHART**, not from the
day's reading. It used to read the reading's `profile` block, which meant a
permanent fact about a birth could not appear until a daily fetch had landed.

### Five states, not two, wherever something is computed

`/chart`, `/chart/:id`, `/horoscope`, the horoscope overlay, the home reading and
panchang cards, and `/profile`'s horoscope tab all read from the `astro` Edge
Function, and all of them handle the same five outcomes. They are listed here
because the last two are the ones that get collapsed into each other, and this
project has already sent a working consultant to a signup form by doing exactly
that.

| State | What the screen says | Where it goes |
|---|---|---|
| Loading | *"Working out where everything was."* | — |
| Computed | The chart, the reading | — |
| Incomplete | Planets yes, houses withheld with the reason | Link to add a birth time |
| **No birth details** | *"Add your birth details to see your chart."* | Link to the birth questions |
| **Service unavailable** | *"Charts are unavailable right now. Try again shortly."* | Nothing to fix; try again |

The last two must never render the same sentence. One is the person's to act on
and the other is ours, and a chart service that is down told somebody they never
entered a birth date would send them to re-enter one they already have.

The panchang is the one exception to needing a session: it is a function of a
date and a place, not of a person, so the home card renders signed-out. It is
anchored on the birth place when there is one, which is also what keeps it from
disagreeing with the reading card beside it.

---

## 5. Consultant screens

### `/pro/apply`
The front door, and the only `/pro` route the gate does not redirect away from.
Four states in one screen: no session (sign up through the seeker's own name and
phone steps, carrying `?next=pro`), session but no `consultants` row (the
application), `pending` or `blocked` (under review), `approved` (straight
through to the studio).

The applicant **types four rates** — chat, video call, audio call, booking —
each ₹5 to ₹110 a minute, whole rupees; the booking line shows the 20-minute
price. Send stays disabled until all four are in range. The row it writes
cannot carry a status — the column grant does not include one.

### `/pro/consult`
Requests with accept and decline, now real status writes rather than flag
toggles: a second tap on Accept changes nothing, because the policy only allows
the move *out of* pending. Confirmed sessions each get a channel button — chat
opens the panel, live navigates to a room, call toasts. Below, **Booking
calendar** opens its own page (15 Oct 2026; it replaced the 7 × 6 grid).

### `/pro/calendar` · `/studio/calendar`
The booking calendar (Studio → Your consulting setting → Booking calendar on the
website). Monday to Sunday, each with a switch; on, a day shows its windows as
From and To times, **+ New window** adds the second (two at most), × removes
one. **Save calendar** sends the whole week (`POST /v1/consultants/<id>/week/`);
the server turns each window into 20-minute starts (9:00 to 12:00 → 9:00 …
11:40) and refuses three windows, a window under 20 minutes, or two that
overlap. **Blocked dates**: a first and an optional last day, **Add blocked
dates**, and the list to come with Remove (`/blocked/`). A booking already made
stands whatever changes. The seeker's booking sheet offers the 20-minute slots
on the day picked, minus blocked days and slots taken.

### `/pro/studio`
Compose a reel, a photo or a blog post — the same Create post screen as Home's
(12 Oct 2026), without Back. **A post and a blog each keep their own draft**,
in the phone's storage as it is typed: a reload, a closed tab or going to the
blog and back loses nothing, and publishing clears that draft (6 Oct 2026 —
switching tabs used to wipe the composer, and a long blog went with it). **Products
can be tagged on all three**, a blog included; a tagged product opens its
own page with the author's code. A blog's cover is 16:9. **Already published** lists the
consultant's own posts only — a thumbnail (a reel's frame at half a second, a
photo, or a plate for a blog post), views, likes and comments — and a tap opens
it: a reel in the reel viewer, a blog post at `/read/:id`, a photo full screen.
In the consultant app both viewers show only the consultant's own reels and
blog posts; `/reels/:id` and `/read/:id` were seeker-only until 4 Oct 2026.

### `/pro/earnings`
Earnings for a period, chosen from five chips: this month, last month, this
financial year, last financial year, lifetime. For the period: the net total,
gross less the platform fee, the payout day (months only), what is booked for
sessions not yet held, a split by source (chat/call/video, booked sessions,
shop commission, reversals), and every entry behind it, paged. Under it, the
last seven days as bars. Real since 3 Oct 2026; the API is
`GET /consultants/<id>/earnings/summary/?range=` and
`GET /consultants/<id>/earnings/?range=&offset=`.

**There is no withdraw.** The sample balance card and its sheet were removed
on 3 Oct: money is paid monthly on the 7th, and the sheet charged the fee a
second time. The Payouts section says how payment works until there is a
payout history to list. Performance metrics and referrals are still
`mock.js`.

**Insights** (the second tab) is real since 4 Oct 2026
(`GET /consultants/me/insights/`): views, new followers, saves and comments in
the last seven days; every post of theirs with its views (and this week's), tap
to open; and the shop products bought with their coupon, units and buyers per
product. Reach, cities and hour-by-hour audience were the prototype's and are
gone — nothing measures them.

### `/pro/profile`
Mirrors the public consultant page and links to it rather than rebuilding it.
Content grid, insights, reviews, settings. No switch to the client app since
4 Oct 2026.
The same experience, rating and badge pills as the public page; no milestone
ladder or congratulation since 13 Oct 2026. Settings → **Payout details** → `/pro/payout-details`.
Settings → **Your consulting price** (16 Oct 2026; it was Your rates) opens a sheet with the same four fields as the
application and **Save rates**; all four save together, and new prices apply to
what is asked or booked afterwards.

### `/studio` — Studio, everybody's own screens (14 Oct 2026, Phase 16)

Named **Studio** at `/studio` since 17 Oct 2026 (Rahul); it was Dashboard
at `/dashboard`, and every `/dashboard/...` address still opens the same
screen at `/studio/...` (`/dashboard/studio` keeps opening Home's
composer). Reached from **Studio** on a Pro's own page (it opened
pro.1namo.com until 14 Oct) and on Profile, under the five icons; the
header of a Studio screen has a Studio button.

Since 16 Oct 2026 (Rahul) it is one layout for both, in this order. It
replaced *Your work* / *Your consulting setting* for a Pro and the Creator's
earnings-and-Insights page.

- **Earned this month so far** (a card): the total after Namo's share, then
  Content & Referrals, Market and (a Pro) Consulting, each this month to
  date; "Paid together on the 7th of next month". A part that does not load
  shows a dash.
- **Content & Referrals:** *Earnings and insights* (`/studio/content`,
  below), *Your links* (`/studio/affiliate`), *Your code* (a Creator, the
  Profile's Influencer tab).
- **Market:** *Earnings and insights* (`/studio/market/earnings`), *Your
  listings* (`/studio/market`).
- **Consulting** (a Pro): *Earnings* (`/studio/consulting`), *Daily
  report* (`/studio/report`, 19 Oct 2026, Rahul: today and the six days
  before — Online time, calls received and answered by chat / audio / video,
  customers who recharged after reaching them, the badge, and a score out of
  100: answered over received with a video weighing 2 and audio 1.5, for 70,
  and Online time for 30, 8 hours full; a day with no calls while Online
  counts the calls part full; first, the **month so far** scored as one —
  every call of the month added up, Online time as the average day; a day
  is 00:00 to 24:00, today shown so far;
  yesterday's numbers come as a notification at 10:00 IST and are in the
  console's *Daily reports*, everybody's; the Pro sees only their own), *Your consulting price*
  (the rates sheet here), *Booking calendar*, *Go online* (`/desk`, the
  green card).
- **Payout details**, last: one row; a Pro's opens payout details, a
  Creator's the Market's bank form.

The mixed *Earnings and Insights* page went: `/studio/earnings` opens the
Studio, and Namo Consult's *Earnings* link opens Consulting earnings. The
pro app keeps its own Earnings tab. "Practice and reviews" went on 14 Oct
2026 (Rahul): reviews are on the Pro's page, Intro video and Username in Edit
profile (`/practice/edit`), slots in Namo Consult. `/studio/profile` opens
Studio. Edit and the public page are not here: Studio opens from
that page, which carries Edit profile.

### The modules in Studio (Phase 18, 16 Oct 2026, Rahul)

`/studio` is open to everybody signed in (signed out goes to Profile).
**Content & Referrals** is always the **Content card** (17 Oct 2026,
Rahul): two steps, each condition a completion bar with what you have and
what it needs (green when met).

- **Step 1 · Earn on referrals** (followers, videos live, days since you
  joined): while not met, "Meet all three and step 1 opens at once. No
  approval needed."; when met, *Start step 1*, which grants it on the spot
  (a toast, and the card turns to step 1). Refused with what is left when
  the numbers moved meanwhile.
- Once step 1 is held: the badge *Step 1*, and its rows — *Earnings and
  insights* (`/studio/content`), *Your product referral link*
  (`/studio/affiliate`), *Your app download referral code* (Profile's code
  tab).
- **Step 2 · Earn on your views** (followers, videos and views in the last
  90 days): greyed with "Opens after step 1" before step 1; then "Meet all
  three, then apply. The team approves it."; when met, *Apply for step 2*,
  which opens the questions (what you post about, Instagram or YouTube,
  followers; why optional) and *Send for approval*; then "Sent. The team is
  looking at it."; a rejection shows "Team:" and the note and *Apply
  again*. Held: the badge *Step 2* and no step 2 block.

Market (Seller) and Consulting (Pro) are their section when the module is
held, and otherwise that module's card: what it opens, and *Waiting for
approval*, or *Not approved* with "Team:" and the note and *Ask again*, or
the request. Seller asks inline: what you will sell, a sample or link
(needed), anything else. *Send for approval*. Pro opens `/earn/pro`, the
consultant application (an approved Pro there lands on Studio). A
decision arrives in the bell. The top table and Payout details show only to
somebody holding a module; the top table has only their rows. The pages
below Studio are gated by module. `/earn` (Earn on Namo, its own page
until the same day) redirects here; Profile settings → *Earn on Namo* and
the Studio button on Profile, shown to everybody, open it. Profile: the
Shop tab for a Seller, the code tab for Content step 1; the blue tick for a
Pro or Content step 2 only.

### `/studio/content` — Content & Referrals (16 Oct 2026, Rahul)

Content step 1 or 2. Header back to Studio; tabs **Earnings · Insights**.

- **Earnings** (since 16 Oct 2026, both): the period chips; **Content
  earnings** for the period, one figure, with "Namo works out your content
  earnings from your views, qualified views and sales through your tags.
  When ads run between posts, they count too."; Views (for the period, up
  to yesterday — "Till yesterday" — so it moves once a day) and
  **Engagement** (for the period; called Qualified views until 17 Oct
  2026), with what engagement is, and **Lifetime views** in a band below
  them (16 Oct 2026, Rahul). **Step 1** (17 Oct 2026) sees no Engagement;
  the line under the figure reads "Step 1 earns on sales through your tags
  and links and on sign-ups with your code. Your views earn from step 2.",
  and under the card **Step 2 · Earn on your views** with its bars and a
  link to apply in Studio.
- **Insights:** **this month** (16 Oct 2026, Rahul; the pro app keeps the
  last seven days): views up to yesterday ("Till yesterday"), new
  followers, saves and comments. Then rows that slide left to right
  (16 Oct 2026, Rahul), each headed with its count: **Reels** (first frame
  whole at 9:16, length), **Images** (photos, and text posts as a saffron
  tile with their words), **Blogs** (cover); each card carries views on the
  picture and, under it, the caption, how long ago, likes, comments,
  reshares and engagement (all time); a reel or blog opens. Last,
  **Sales from tags and referrals**: products and Market listings sold
  through the person's tags and links together, most sold first, each with
  its picture, name, number of sales and buyers; opens the product or
  listing. (*Sold with your code* is not shown here; the pro app keeps it.)

No Studio (14 Oct 2026, Rahul; it was the first row): posting is Home's +.
A chosen video is made smaller on the phone first, under the post as
"Making the video smaller · 40%", then "Uploading · 60%" (Phase 15d; the
video pipeline since 18 Oct 2026, `docs/06` Phase 19). The preview is the
phone's own file. *Publish* answers "Posted. Your reel shows once it is
checked." while the video is encoded and checked; the reel appears in the
feeds when it is live, and the author gets *Your reel is live* or *Your
reel was not posted* in notifications. Editing a reel's video, or an API
without the pipeline, uploads it the old way. A chosen
photo, on a festival's days, shows a row of **festival frames** under it
(below). A new reel
longer than 90 seconds opens **Cut the video** (19 Oct 2026, Rahul; it was
refused until then): the whole video plays with its controls and the
time it is at (1:23 / 4:10); **Start here** and **End here** take that
moment, *Starts at* and *Ends at* sliders fine-tune it, a bar shows the
part against the whole, **Play the part** loops just it; at most 90
seconds, and **Use this part** cuts it
on the phone while it is made smaller, so only that part uploads. A phone
that cannot encode is told to trim it in its gallery. Editing a reel's
video still refuses one over 90 seconds.
In that sheet Content step 1 also gets Tag product (01-PRD §12); everybody
gets photo, video, text and blog. Gallery and Camera are icons
without words. `/studio/studio` and "Post more" open Home with the sheet
up (`/home?compose=1`).

The screens are the pro app's own, at `/studio/...` and not `/pro/...`:
a `/pro` path switches the online beat on, which would show a Pro as online
where no call can ring. A Seeker downloads none of these screens.

### `/studio/consulting` — Consulting earnings (16 Oct 2026, Rahul)

A Pro only, main app. The Earnings tab's shape, holding consulting alone:
metered chat, audio and video, booked sessions and their reversals.
Commission is left out: the shop's ("Referral cashback · …") and, from 16
Oct 2026, a Market listing's or e-book's 6% ("Referral · …"), which the
Earnings tab files under **Shop and Market commission** (it read as Chat,
call and video before).

- Header: back to Studio, "Consulting earnings". The period chips (This
  month, Last month, This FY, Last FY, Lifetime).
- The period's consulting total ("Shop commission is not in this"), what is
  booked ahead (this month and lifetime), Where it came from (Chat, Audio
  call, Video call, Booked sessions, Reversals, each with count and amount),
  Last 7 days bars, the entries, 30 at a time.
- Empty period: "No consulting earned in this period."
- No Insights tab: one was built and taken out the same day (Rahul: insights
  later).

The pro app's Earnings tab is unchanged and keeps everything.

### `/desk` — Namo Consult (14 Oct 2026, Phase 16)

The main app's one screen where a Pro is on duty, reached from Studio
and from Availability in Practice settings. Header: back to Studio, the
name, the **Online** switch. Under it the ringing requests (Decline,
Answer), then the pro app's Consult screen as it is: approval state,
Sessions · Chat · Call, the slots. No tab bar.

**Since 17 Oct 2026 (Rahul)** the page under the Go live button is one
list, **In line**: every call and chat waiting, the first to ask on top,
numbered, each with its type (Audio call, Video call, Chat), rate and time,
and Answer or Join; then Open your chats. No Audio, Video, Chat or Booking
tabs. The server lets one request ring a consultant at a time, so In line
holds one at most; whoever reaches for them meanwhile is told they are busy
and lands in **Missed while busy** (the last day: name, type, time; nothing
to press). Bookings follow (to accept, then confirmed).

**Busy, for the seeker (17 Oct 2026, Rahul).** A Pro in a session or
ringing has a red dot, not green: Consult's cards (and a red Busy tag),
search, every presence avatar. Their page says *X is busy right now, on
another call* in red. Pressing call or chat then shows *X is busy right
now* while the app keeps asking, as before.

**The Desk's header (17 Oct 2026, Rahul):** Home on the left, **Studio**
on the right, no back. The Studio's own back always goes to Profile:
a history back from it returned to the Desk, which led to Studio
again.

**Birth details before a service (21 Oct 2026, Rahul; replaced the
17 Oct rule that asked only before calling an Astrologer, for date and
time only, and, for a few hours on 21 Oct, a gate on opening Consult
itself).** "Missing" is no date of birth, no time of birth (and not marked
unknown), or no place of birth. `/consult` and a Pro's page open freely.
- Pressing video, audio or chat, or Book (any category), with the details
  missing gets a toast and the details page (`need=1&for=consult`);
  saving goes straight on to `/connect` for that Pro and channel, or back
  to the Pro's page with the booking sheet open. Arriving on a Pro's page
  by a card's Book button (`?book=1`) asks the same, in place.
- Opening the full chart (`/chart`, not a Pro's `/chart?name=…`), Ask AI
  (`/ask`), Muhurat or Matching, from anywhere, with the details missing
  is replaced by the details page (`need=1`); saving returns to that
  screen, Back goes to the screen before it. Tarot and the sign-by-sign
  `/horoscope` need none.
- Never in the Pro build or signed out.

**The client's kundli (17 Oct 2026, Rahul).** In a live chat (beside End
session) and on a call (in the bar), the consultant has **Kundli**: a full
sheet over the session with the client's name, birth date, time and place
and their North Indian chart, ✕ to close. Only during the live session;
a client with no birth details reads "They have not added their birth
details."

**Chats on the Desk (17 Oct 2026, Rahul).** The chat panel opened from
`/desk` (Join, Open your inbox) is the client chats alone: no Messages or
Alerts tabs, titled Chats, full screen with a ✕, smaller text, and its
height is what the keyboard leaves, so the typing box stays in sight. In a
live session the consultant gets four openers above the box until they
write: *Namaste. Welcome to your session.*, *Please tell me your
question.*, *Share your date, time and place of birth.*, *Give me a moment
to look at your chart.* A tap puts one in the box to edit or send. Once
the seeker has written, the row starts with a **सुझाव** button (20 Oct 2026,
Rahul): a tap brings three short replies to the seeker's question, as
somebody in the consultant's own field would answer it (counsellor,
ayurveda, pandit, astrologer), in the seeker's language, in place of the
openers. The seeker's chart informs them only for a consultant whose
category reads charts. A tap
on one puts it in the box to edit or send; nothing sends by itself and the
seeker sees none of it. They clear when the seeker writes again or the
consultant sends. Free to the consultant; one ask every few seconds and 100
a day (`POST /v1/chat/threads/<id>/suggest/`, `apps/ai/suggest.py`). In every live chat, both sides, **End session** is a red button in the header beside the other person's name (17 Oct 2026, Rahul; it was small text in the meter bar). On the Desk a live chat has no ✕ and no back: End session is the way out, and it closes the panel back onto the Desk. The ✕ returns once nothing is live. In a live chat the consultant has a photo button left of the box (both apps' panels; the seeker has none): the photo shows at once, uploads, and sends; one that fails is removed with a toast, not kept to retry. Both sides see it in the thread; a tap opens it full size. Right of the
box the consultant also has a **mic** (21 Oct 2026, Rahul; both apps, where
the browser offers speech-to-text, so Chrome and the Android app): a tap
listens, what is said fills the box as it is heard, and a tap again, a
pause, or Send ends it; nothing sends until Send. Beside it **हि / EN**
picks the language listened for, starting from the app's language and
kept on that device. The seeker has neither. The
openers and सुझाव show in the pro app's chat too; the rest is the Desk's only.

Open, the app beats and the Pro can be online; leaving it stops the beat,
so the Pro drops offline as they would by closing the pro app. On this
screen the page names itself Namo Consult and offers `desk.webmanifest`
(start `/desk`), so Add to Home Screen installs it as its own icon.
pro.1namo.com closed on 16 Oct 2026 (Rahul, after a call through
`/desk`): every path on it redirects to 1namo.com/desk, and a tapped call
notification from an old subscription, `/pro/ring/<id>`, to
`/desk/ring/<id>`. The main app's consultant links (Welcome, Consult's
empty state, `?next=pro` sign-in) land on Studio.

### `/practice/edit` — a consultant's Edit profile (13 Oct 2026, Rahul)

**Top, since 14 Oct 2026 (Rahul; main app):** a **Basic profile** row that
opens **Profile settings** (`/profile/settings`, the page called Settings
until that day) whole, so every profile edit starts here; then the section **Your Pro Profile** (it was "Your
profile"), opening with **Intro video or photo**. The username is not here:
it belongs to the Basic profile, in Settings.
In both apps, from **Edit profile** on your own page and from `/pro/profile`.
**Your profile** — specialization (comma-separated, one chip each), About,
years of practice, languages, tags — saves on **Save** and shows at once.
**Checked by NAMO** — practice (category), credentials, degree, a new
certificate — goes out on **Send for review** and reaches your page only
when an operator approves it in the console (Consultants → *Profile changes
for review*: Approve, or Reject with the review note, which the consultant
reads here). A pending request prefills the form; sending again replaces it.

### `/pro/payout-details`
PAN and bank account. With nothing saved, the form: PAN, name on PAN, PAN card
photo, account holder, account number twice, IFSC (the bank and branch are
looked up and shown under it), cheque or passbook photo, optional UPI ID.
**Send for checking** saves and shows the summary: last four digits only,
status (sent, verified, or sent back with Finance's reason). **Change details**
opens the form again with both numbers and both photos empty — they never come
back from the server, and a change is checked again.

### Milestone congratulation (consultant app)
When the consultant's paid sessions cross a tier this device has not
celebrated, a dialog over whatever screen is open: the tier, "Congratulations",
what was reached and what is next. **Keep going** closes it for good on that
device. Only the highest tier crossed is shown.

---

## 6. Overlays

Four, mounted once inside the frame, above every screen. None is a route — which
is the point: they open from any tab without losing the screen underneath.

| Overlay | Opened from |
|---|---|
| **ChatPanel** | The header chat knob on every tab; Consult, Live and ConsultantProfile message knobs; a consultant's chat channel button. **Mounted in both builds** — it was seeker-only from the build split (19 Sep) to 3 Oct 2026, so nothing opened it in the consultant app |
| **HoroscopePanel** | The header horoscope knob, Home's horoscope circle, the reading card's *Read all* |
| **CartSheet** | Shop's cart button (beside search), Shop's view-cart button, Reports' top-bar Cart |
| **Toast** | Every `showToast` and every flag toggle carrying messages |

ChatPanel's tabs differ by side: a seeker gets Consultant / Messages /
Sessions / Alerts — Sessions is the booked sessions list, with Review on a
completed one, moved from `/consult` on 5 Oct 2026 — a consultant Clients /
Messages / Alerts. The header's wallet knob is an icon, not the balance, since
the same day.

**The header's knobs — 13 Oct 2026, revised 14 Oct (Rahul).** In the
seeker app the header has a **bell** on every tab: it opens
**Notifications** alone, no other tabs, with the unread count on it. On
**Consult** only, a **wallet** button sits beside it (a chat bubble until 14
Oct 2026) and opens **Consult**, one list with no tabs: first the **wallet
card** (balance; **Add money** opens the amount sheet right here, so a
recharge leaves you on this list with the new balance; **Details** opens the
**Wallet statement**, `/wallet`, whose back returns to this list), then **Upcoming** (booked sessions still ahead, nearest first,
"Remember to attend", or "Waiting for them to confirm"), **Recently
connected** (the consultants you have talked to), **Past bookings** (with
Review where one is owed). No "Find a consultant": Consult is a tab. Both
the bell and the bubble open a full page with a ✕ in the seeker app (14 Oct
2026, Rahul; they were a side panel). Messages between people are not in either: their unread count is
a red badge on the **Chat** tab in the bar, and a message alert no longer
appears under the bell. The wallet, consultant chat and sessions are also
icons on Profile. The pro app keeps the wallet, the bubble and all its
panel tabs on every tab.

**Ticks — 13 Oct 2026 (Rahul).** After a name: orange for a Pro (every
approved consultant: Consult cards, their page, their posts in the feed),
blue for a Creator (their posts, `/u/:id`, their own Profile). It replaced
one blue mark for console-verified consultants only. The Influencer tab on
Profile is the **Creator** tab.

**The tab bar — 13 Oct 2026 (Rahul).** Home · Bhakti · **Chat** · Consult ·
**Market**. Chat is `/messages`. Icons since 14 Oct 2026 (Rahul): **Bhakti**
under folded hands (the `namaste` icon, drawn from Rahul's reference; it was
the diya) and **Chat** under the Namo infinity as a line (`infinity`, a
29 px against the others' 19; it was the folded hands). Market is Shop and Academy in one page, `/shop` (14 Oct 2026;
one tab with a Shop · Academy switch from 13 Oct); `/academy` forwards to its
E-books tile, so every old link still works. Messages took the freed
slot, in the middle. **Ask AI left the panel on 30 Sep
2026** for its own page, `/ask` — messages are people.

**CartSheet is the app's main checkout** and the only overlay that moves money.
Under the lines sits **Deliver to**: the saved addresses (the last one chosen
is preselected) or, when there are none, the address form — the pincode
first: six digits fill city and state (a typed one is never overwritten), say
"✓ Ghaziabad, Uttar Pradesh" or that it was not found, and offer the areas
that pincode covers as one-tap choices for "Area, landmark" (India Post's
directory, then Shiprocket's; 6 Oct 2026). The quantity steppers are drawn
− and + centred in their circles. **Clear asks first** — "Clear your cart?",
Keep items or Clear cart — since one tap emptied a built cart. Choosing an address asks the server whether a
courier serves it (and for the charge, which is "Free" since 8 Oct 2026); the
sheet then shows Items, Delivery and Total, and **Pay
stays disabled, reading "Choose an address", until a charge has come back**.
An order says its cashback above Pay, for this basket and this way of
paying — every order since 16 Oct 2026 (`CASHBACK_EVERY_ORDER`; it was
the first only): "₹500
back in your wallet seven days after delivery", or on cash on delivery
"This order gets ₹500 back when you pay online. Not on cash on delivery."
Nothing is said when no product in the basket carries a cashback. The code box
is for shop coupons; an astrologer's code is a link now, caught from
`?ref=A…` on any page and held by the server (`docs/01-PRD.md` §12).
Then **Pay**: **Pay online** or **Cash on delivery** (6 Oct 2026). Pay online
— the default — reads "Pay ₹X" and opens PhonePe's checkout for the order
(the name, email and phone filled in). Paid: "Paid · ordered", the cart
clears. Closed or failed: "Payment not completed. Nothing was charged.", the
cart stays and the items are released at once. The wallet plays no part in
the shop. Cash on delivery adds a "Cash on delivery fee · 2%" line, the total
becomes "To pay on delivery", and the button reads "Place order · ₹X on
delivery"; where no courier takes cash it is disabled and says "Not at this
pincode", and over the cap a line says to pay online. A refused payment asks
for the charge again. After a successful order the app asks the server to
dispatch the parcel and does not wait for the answer.

**Orders** says what happened to the money: "Paid", "Waiting for payment" or
"Not paid · nothing charged" for an online order; "Pay in cash on delivery", "Paid in cash" or "Nothing to pay"
for a COD one, with its fee as a line. It shows each parcel as four steps — Ordered, Packed, Shipped,
Delivered — with the courier's last status line, the AWB, and a **Track
parcel** link to the courier's public tracking page.

Local sheets using the shared primitive — Consult booking, ConsultantProfile
booking, wallet top-up, question packs, withdraw, murti picker — are not global
and open only from their own screen.

---

## 7. Money paths

**Stated once, here.** Seven paths move the wallet, and none of them is
arithmetic in the browser any more.

| # | Path | Effect |
|---|---|---|
| 1 | Cart checkout, online | Writes a `pending` order holding the stock for 15 minutes and opens PhonePe for its total; the status check when the page closes (or the webhook) makes it `paid` and sends the parcel; closed or lapsed → `cancelled`, stock back, nothing charged |
| 1a | Cart checkout, cash on delivery | Debits nothing; claims the stock and writes a `pending` order whose total carries the 2% fee; delivered → `paid`, returned or cancelled → `cancelled` and restocked |
| 2 | Shop *Buy now* | Debits the product price |
| 3 | Reports *Buy now* | Debits the report price |
| 4 | Tarot paid pull | Debits the per-pull price |
| 5 | Wallet top-up | **Credits**, and only from a verified webhook |
| 6 | **Booking a session** | Debits the price the SERVER looked up, inside the transaction that claims the slot |
| 7 | **A decline** | **Credits** the full amount back, written by a trigger on the status change |

Paths 5 and 7 are the ones that run backwards. Paths 1–4 and 6 begin and end
inside a tap: the person presses Buy, the server decides, the balance moves. A
top-up begins with a tap and ends somewhere else entirely — in a request
PhonePe makes to a public URL, minutes later if it has to retry. Nothing the
browser does credits a wallet, including reporting that the payment succeeded.
§8.2 is the state machine. A decline is a third party's tap moving somebody
else's balance, which is why it is a trigger rather than a call the consultant's
client makes: there is no second request for a client to forget.

Paths 1–4 go through `wallet_debit()`, which takes the amount from the client
because there is no server-side catalogue for a tarot card yet. **Path 6 is the
first that does not**: `book_session()` is handed
`{ consultantId, serviceId, startsAt }` and reads the price off the service row
itself. Both decide under a row lock and refuse in the app's own words when the
balance is short. The client compares nothing: the balance it holds is a read of
a cache, and a screen that decided for itself would be deciding on a number
devtools can edit.

**Every caller awaits it.** The debit returns a promise, and `if (promise)` is
truthy — a caller that forgets lets through a purchase the server refused. A
second guard sits in the store rather than on the buttons, so a re-entrant tap
is refused even if a button forgets its pending state.

### Displayed but never charged

Academy enrolment · Premium · question packs, which grant questions free · live
room gifts · the consultant withdraw sheet.

**The primary revenue line came off that list in phase 5.** The consultant
profile sheet books for real; the Consult tab's own sheet is a link into it
rather than a second flow.

---

## 8. State machines

### 8.1 Booking

```
                    ┌──────────► declined ──► (reversing credit)
                    │
  [request] ──► pending ──► confirmed ──► completed
                    │            │
                    │            ├──► no_show
                    │            └──► rescheduled ──► (new pending, same order)
                    └──► cancelled ──► (refund per policy)
```

- **The slot is claimed at `pending`**, not at `confirmed` — otherwise two
  seekers hold the same slot while a consultant decides.
- **`declined` writes a reversing credit**; it never edits the original debit.
- **`rescheduled` does not move money.** The charge and the order stay on the
  original booking and the new one inherits them.
- `cancelled` depends on a policy that is still open — see `01-PRD.md` §5.4.

Today: `[request] → pending` is `book_session()`, one transaction that looks up
the price, claims the slot, debits the wallet and writes both books.
`pending → confirmed | declined` is the consultant's own UPDATE, validated by
the policy, and **`declined` now writes the reversing credit** — in both books,
as new rows, from a trigger on the status change rather than a second call a
client could skip. `booking_reverse()` is that movement, and an admin calls it
by hand for the other two cases that reverse in full (`01-PRD.md` §5.4): a
consultant who never turns up, and a platform failure.

**`no_show` does not reverse automatically**, and that is the one asymmetry
worth stating: the column cannot say whose no-show it was, and a seeker who
simply did not attend is refunded nothing.

`completed`, `rescheduled` and `cancelled` are still unreachable from any
client.

### 8.2 Payment

```
  created ──► captured ──► (wallet credit, exactly once)
     │
     └──► failed ──► (no credit, no ledger row)
```

The provider retries, so the same captured event can arrive several times. Only
the first produces a credit; the mechanism is a uniqueness guarantee rather than
a check, because a check races with its own write.

Refunds are a separate forward transition, never a mutation of the original.

### 8.2a A live session — chat, video or audio (5 Oct 2026)

```
 Call / Chat ──► request ──┬─ busy ──► (nothing written; /connect retries every 5 s for 3 min)
                           │
                           └─ requested ──┬─ 45 s, no answer ──► expired      (₹0)
                              (rings for  ├─ consultant declines ──► declined (₹0)
                               ONE seeker ├─ seeker cancels ──► expired       (₹0)
                               at a time) │
                                          └─ accept ──► live
                                             hold taken │
                                   chat: clock starts ──┤
                                   call: connecting ────┼─ 90 s, not both in ──► ended (₹0, hold refunded)
                                     both in the room ──┤
                                                        └─ end / time up / 60 s silent ──► ended
                                                           (charged per 30-second block, rest refunded)
```

- **Online is the consultant's switch alone** (6 Oct 2026) — app open or not.
  Every request rings their phone by web push ("Rahul is calling", Answer /
  Decline, long vibration; `public/sw.js`), and the open app plays a ring
  tone. Three requests in a row that ring out unanswered switch them
  offline and tell them so. Turning Online is the tap that asks for
  notification permission.
- **Where it rings** (14 Oct 2026, Phase 16): in the pro app on every
  screen, and in the main app only in **Namo Consult** (`/desk`). A tapped
  notification opens `/pro/ring/<id>` or `/desk/ring/<id>`, by the app it
  came from. A call answered in Namo Consult returns there when it ends.
- **Busy** shows beside the consultant's name while a request rings for them or
  a session is live; it clears by itself when that ends.
- **Back to a live call** (20 Oct 2026, Rahul). Leaving the call screen
  does not end the call. Off the call screen, either app shows a bar over
  every screen while the person has a live call: *Call with <name> is on*,
  End, Return. Return opens the call screen, which joins the same room. The
  bar appears on leaving the call screen, on opening or returning to the app,
  and on moving between screens; it goes when the call ends. A seeker who
  presses Call or Chat again for a Pro they are already live with is taken to
  that session, not refused.
- **The review ask** (17 Oct 2026, Rahul; 20 Oct: the solved question, and
  only low ratings held). When a call or chat ends, by either person or by
  the clock, the seeker gets the review sheet: a rating of 1 to 5, *Is your
  answer solved?* Yes or No (both required), optional words, Post review or
  Not now. It opens only for a session that connected and is not yet
  reviewed. If the seeker was not on the call or chat screen when it ended,
  the sheet opens the next time they open the app or move to another screen,
  for a session that ended in the last day and was not put off with Not now
  on that device. A skipped one can be reviewed for seven days from Calls and
  chats in the Sessions list. Three stars and up show on the Pro's page at
  once (*Review posted*); 1 or 2 stars wait in the console's *Reviews* queue
  until approved (*It shows once Namo checks it*). The Pro's own Reviews tab
  shows each live review's *Answer solved* or *Answer not solved*; the
  seeker's view of a Pro's page does not.
- **A chat** opens the chat panel on that conversation for both people; **a call**
  opens the call screen. While a chat request waits the seeker sees "Request
  sent to <name>" under the saffron sky with the orbit and a 45-second ring —
  never "Ringing", which is a call's word (6 Oct 2026). The consultant's request bar says Chat, Video call or
  Audio call, and its button says Accept or Answer.
- **The call screen** reads "Connecting" until both are in, then the minutes left.
  **An audio call is voice only** (7 Oct 2026): no camera, no screen share —
  Daily's token lets each person send audio and nothing else, and the page
  asks the browser for the microphone only. It used to start with the camera
  off and let either person switch it on.
- **A paid chat reopens itself.** Opening the app with a chat session live —
  after a reload, a closed tab, a phone that slept — opens the chat panel on
  that conversation, for either side. A call needs nothing: its screen is
  in the URL.
- **How fast each side learns.** A waiting chat asks every second whether it
  was accepted; a consultant's queue is asked every 2 s while the app is on
  screen (8 s hidden; a closed app is rung by web push); an open
  conversation every 1.5 s.
- **Sending a chat message** empties the box at once and puts the bubble in
  the conversation marked *Sending*; it settles to its time when the server
  has it. A dropped connection is retried on its own; if every try fails the
  bubble reads *Not sent · Tap to retry* and stays — on this phone, through
  a reload — until it goes. A refused send (the session ended) keeps the
  bubble marked and shows the server's sentence. Text is never put back in
  the box. One time sits under each run of messages from the same person in
  the same minute. New messages arrive within about 1.5 s (6 Oct 2026).
- **History:** the chat panel's Consultant tab lists only people you have
  connected with, each with what you last did together ("Video call · 3 min");
  its Sessions tab lists calls and chats (with cost) and booked slots; Alerts
  carries an unread count. Alerts older than six months are deleted by the sweep.
- **Social alerts (13 Oct 2026, Phase 15a):** a comment, a reshare, a like
  (one per post per IST hour, named after the first liker) and a follow (once
  per pair, ever) each tell the author or the person followed; never for
  your own post. Tapping a follow alert opens the follower's `/u/:id`; a
  like, comment or reshare opens your `/profile`. Both the Alerts tab and
  `/notifications`.

### 8.3 Consultant approval

```
  apply ──► pending ──► approved ──► (visible, bookable, earning)
                              │
                              └──► blocked ──► (invisible, unbookable)
```

**Pending is invisible**, not merely unlisted: not in search, not bookable, and
producing no earnings. Verified on the server rather than in a screen — an
unapproved consultant returns nothing from the list, from a direct id lookup,
from their prices, from their availability and from their slots.

There is no `rejected` state. This diagram used to show one and the `status`
CHECK never had it; `blocked` covers both refusing an application and closing a
practice, and a state nothing can enter is a state that gets forgotten.

**The applicant cannot move any of this.** `status` and `verified` are outside
the column grant, so approval is an `UPDATE` in the database GUI until the admin
console exists (phase 13).

**Blocking a consultant who has confirmed bookings and a pending balance is an
unresolved policy question** — see `01-PRD.md` §6.

---

## 9. State model

Three places state lives, and the boundaries matter.

### The URL
Which side you are on. `isPro` is derived from the pathname and **is never
stored** — a persisted role could disagree with the address bar. Also: the active
profile tab, the visible reel, and every drill-in identity.

### The store
One context. Most of it still resets on reload.

Server-backed, and therefore surviving a reload: the session, the profile, and
the **wallet balance and ledger**.

Still local, still evaporating: cart lines · questions remaining · chat panel
open state and tab · horoscope panel state · cart sheet state ·
toast · and the flag set. The language survives on the device (`localStorage`). The birth draft is the other exception — it survives in
`sessionStorage` for the length of the signup.

### The flag set
One flat `Set` of namespaced strings, which is the prototype's best idea:

`like:` · `save:` · `follow:` · `remind:` · `event:` · `accept:` · `decline:` ·
`save:day-<key>`

`closed:<day>:<time>`, `accept:<id>` and `decline:<id>` are gone as of phase 4 —
a closed slot is the absence of a `consultant_availability` row, and a decision
is a `bookings.status` write.

`tarot:free1|free2` went the same way on 24 Sep 2026, and for a sharper reason:
a flag set that does not survive a reload cannot hold a count somebody is billed
against. The free pulls are a column on `ai_quota` now.

Sticky toggles and their toasts with no new store surface. It maps cleanly onto a
real reactions table, which is rare for a prototype shortcut.

### What is missing everywhere

**No loading states, no error states, no empty states** — because nothing is ever
absent, slow or failing. Adding them across roughly fifteen screens is the real
front-end cost of the backend migration, and it is UI work, not server work.

Each fetching screen needs: a skeleton or a held layout while loading; a refusal
that names its reason in the app's voice; an empty state that says what to do
next rather than showing an empty list.

---

## 10. Known breaks

| Break | Status |
|---|---|
| **ChatPanel threw on the first tap of the messages knob** — `isPro` was used but never defined, in two places, with no error boundary | **Fixed** |
| The consultant's availability view applied booked slots only on Thursday; the seeker's sheet applied them always and ignored the consultant's own closures | **Closed** — phase 4. Both call `consultant_open_slots()`; there is no second rule left to disagree with, and `009_slots_check.sql` asserts it on all seven weekdays |
| Reports adds to the cart with no way to open the cart from that screen | **Closed** — 7 Sep. The sheet was always mounted globally; Shop simply held the only opener. Reports' top bar has one now |
| Question packs display a price and grant questions free | **Closed** — 7 Sep. `Add` awaits `spend(p.price, …)` and grants only on a `true`. Verified against a real ledger row, `6 questions · −₹199` |
| Ask AI's wallet figure is a hardcoded string, not the live balance | **Closed** — 7 Sep. Reads `balance` through `rupees()`, em dash until loaded, same contract as every other wallet figure |
| `/chart` has no back control | **Closed** — it has `back backTo="/home"`. The row outlived the fix; confirmed in a browser 7 Sep |
| The consultant's feed is the seeker's feed, including shop and free tools | **Closed** — `ProFeed.jsx` deleted, Feed is no longer a concept on the pro side |
| Consultant performance metrics disagree with the warnings that cite them — 88% against 68% for the same figure | **Closed** — 7 Sep. `answerRatePct` is derived once in `mock.js` and read by both. Neither number is typed, so they cannot drift again |
| Birth details are collected in onboarding and never used | **Closed** — phase 1. Written to `profiles`, read back by Profile, Chart and Horoscope |
| `/people/:id` showed the **mock user's initial under the label "You"** — a signed-in Rahul saw Atharv's `A` | **Fixed** — `Synastry.jsx` reads `useProfileFields()`. Found by auditing identity reads, not by the browser walk, which is still owed |
| Sun, moon and rising are the mock's for every account, on four screens — `Computing.jsx`, `HoroscopePanel.jsx`, `Shop.jsx` and via `useProfileFields()` | Open by design — they need the ephemeris service. **Phase 7 must change all four**, not just the hook |
| Two Bhaktamar cards carry incomplete verses | Flagged in data; needs a verified source |

## Namo AI — `/ask` (21 Sep 2026, repriced 23 Sep, own page 30 Sep)

One surface since 30 Sep 2026 — the chat panel's Ask AI tab is gone. `useAskAi`
holds the state; neither it nor the screen owns a number.

**The chat looks like a chat with a Pro since 21 Oct 2026** (Rahul): the
Pro chat's own header (picture, name, and the AI line where "In session"
would be, the free count at the right), its messages with a time mark
between them, and its composer. On open the AI Pro greets ("Namaste, I am
<name>. …" and a question of its own), drawn by the screen, never sent or
counted. Its suggested questions (English or Hindi, by the app's language) sit
over the composer the whole time, until the day's free question is spent. The
seeker can speak a question: with the box empty the round button is the mic
(हि/EN beside it), what is heard lands in the box as text, then Send. The
counsellor's screen always carries the Tele-MANAS line. The astrologer keeps
*Someone else* above the composer.

**The AI Pros since 21 Oct 2026** (Rahul): `/ask` is the astrologer;
`/ask?as=<key>` is any other AI Pro (tarot, life_coach, therapist, or a later
category's slug). Consult shows a card over the roster for the chosen category,
shaped like a Pro's card since 21 Oct 2026 (Rahul) — on All, one per swipe,
each the list's width, also over the empty-roster card — with the console's
picture (or "AI") and an online dot, the name with an AI tag, the AI line as
its tag, what is free ("N free
questions" while the welcome five last, then "Today's free question is
waiting" or "Next free question tomorrow"), "1 free question every day, with
any AI Pro", and under a dashed rule one Chat tile reading "Free" (or "Next
free question tomorrow"). Shown to every seeker. The other AI Pros open straight into the chat (no
birth details, no *Someone else*), with the console's name in the header and
its AI line on the empty screen; the counsellor's empty screen carries the
Tele-MANAS line. With the day's question spent, an AI Pro's chat says to come
back tomorrow, never a price.

**`/ask` is a plain chat since 30 Sep 2026** (owner's call — it was a reading
column with section labels): bubbles, a composer pinned to the bottom, Enter
sends, four suggestions on an empty conversation. It reads the seeker's own
chart by default — no "who is this about?" step first; *Someone else* above the
composer opens the subject form. The free count or the price sits in the header
and under the composer, with the one-line disclaimer.

| State | What the seeker sees |
|---|---|
| loading | "Opening" |
| free left | the count in the header slot; the composer is open |
| out of free | the header slot reads **₹9 each**, and a line under the transcript says the next answer costs ₹9, that one more free one arrives tomorrow, and that a consultant reads the same chart; the composer stays open |
| wallet empty | the server's refusal, and the Add money path |

**The price sits where the count sat.** Same header slot, so the thing
being spent is always in the place the seeker already looks — and it is
read **before** a question is sent, never discovered after the debit.

**There is no wall and no button.** Out of free is a price, not a lock:
the composer stays open, the suggestion rail stays visible, and sending
charges ₹9. The Send button says what it will cost — "Send · ₹9" — which
is the consent. Nothing has to be started first.

That replaced a **Start a session** card and an m:ss clock in the header,
live 21–23 Sep. It is gone: `/v1/ai/session/` no longer exists, and
`tools/smoke.py` asserts the route is a 404 so no deploy can quietly bill
by the minute again.

A refused question goes **back into the composer**, not into the
transcript: it was never asked, and leaving it on screen above a refusal
reads as answered-badly.

A charged answer returns `charged_paise`, and the client refreshes the
wallet on it — the balance in the chrome must not disagree with the debit
that just happened.

Every refusal sentence is the server's. There are none in the client.

## Reporting — where the option lives (23 Sep 2026)

One sheet, `components/ReportSheet.jsx`, raised from these places. Nothing
else in the app reports anything.

| Where | The control | What is reported |
|---|---|---|
| A post card in the feed | **⋮** beside Follow | that post |
| A reel | **Report** at the bottom of the right-hand rail | that reel |
| `/u/:id`, somebody's profile | **Report** in the top bar | that person |
| A message thread (`/messages/:id`) | **⋯** → Report | the other person |
| A consultation chat (chat panel) | **⋮** at the header's right, both sides (19 Oct 2026, Rahul, for Play) | the other person |

**Not in the action row.** Report sits away from Like, Reply, Share and
Save on both surfaces, and the reason is the same in each: it is the one
action nobody is looking for until they need it, and a mis-tap on it costs
a real person an admin's attention. On the reel it is last on the rail,
below where a thumb rests.

**The person option is separate from the post option, and both are
needed.** A per-post report cannot see somebody who deletes and reposts,
and that is what a bad actor does. The profile route is what makes
"reported many times" mean anything.

The sheet: five reasons as a single-select list, then an optional note,
then **Send report**. The reason is required — a free-text-only form
collects "idk it's bad" — and the note is not, because most reports do not
need one and a required box collects "bad".

**What the seeker is told.** *"Reported. Someone will look at this."* The
same words whether it is the first report or the fourth: the server
answers ok either way, and telling somebody they already reported this
invites a second tap hunting for a different outcome. Under the button,
before they send: *reporting does not remove anything on its own*. That
line exists so nobody refreshes the feed waiting for the post to vanish.

**The composer's Reel tab follows the flag.** `/profile` passes
`['clip','post','article']` when `profile.video_enabled` is true and
`['post','article']` otherwise. Drawing the tab grants nothing — the
server's kind gate is the permission and refuses a clip without it
whatever the UI offers, the same relationship `/pro/studio`'s `kinds` prop
has always had with the publish policy.

## Online and offline (24 Sep 2026)

**The consultant's switch** lives in the pro app's header, first of the
controls and visible on every screen — `components/PresenceToggle.jsx`. A
dot and a word, because a consultant who cannot see that they are offline
sits waiting for calls nobody was ever offered, and that is the most
expensive confusion this app can create. Never in a menu.

Flipping it beats immediately, so the switch and the dot agree within the
same tap. The app then beats every thirty seconds and **every beat carries
the switch**, so a toggle whose request failed corrects itself thirty
seconds later rather than leaving somebody visible and absent.

**Anywhere in the app** (19 Oct 2026, Rahul): an approved consultant's beat
runs on every page of the main app, not only on the Desk, so a Pro with the
switch on stays online while browsing Home or the Market (before, leaving the
Desk took them offline after 90 seconds). A call request then **covers the
whole screen** on any page, as a phone call does: the caller's initial and
name, Audio / Video call or Chat and the rate, a red Decline left and a green
Answer right, ringing and vibrating. Others waiting show as a line under it.
On a call already, a new request is a quiet line at the top instead.
The switch is in sight there too: an approved consultant sees a small
**Online / Offline** pill (green when online) over every tab page of the main
app, above Home's + (not on the darshan page, where it sat on Sangeet and the flower bowl). Online, a tap goes offline. Offline, a tap
opens the Desk instead (21 Oct 2026, Rahul), where **Go live** is and,
under it, **What you take**: four switches, Chat, Audio call, Video call
and Booking, all on until changed, each saved on its tap whether live or
not. Live with chat, audio and video all off, the Desk says no client can
reach you live. The pro app's header pill does the same.

**What you take** decides the seeker's buttons: a channel switched off
reads *Not taking* on the Consult card and the Pro's page, greyed, and a
press toasts *<name> is not taking video calls right now*. Booking needs
only its own switch, not Go live; switched off, Book reads *Not taking*
and the offline line drops "You can still book a session". The server
refuses an off channel after the offline check (*They are not taking
chats right now.*) and an off booking before any money (*They are not
taking bookings right now.*).

| What the seeker sees | When |
|---|---|
| Green dot on the avatar | `online` from the roster — the server's boolean, not the client's arithmetic |
| Chat and Call live | online, and that channel switched on |
| Chat and Call faded, and a line saying so | offline, with Book still working while Booking is on |
| One channel faded, *Not taking* | online, that channel switched off on the Desk |

**The line is said, not implied.** Grey tiles and nothing else
produces "nothing happens when I tap". *"<name> is offline right now. You
can still book a session."* — and the second sentence is the point,
because the offline state still has something to offer.

**The dot used to be `verified`.** It stood in while there was no
presence, and one consultant was showing green on a roster where nobody
was online.

**The server refuses too, and refuses first.** `request_chat` re-checks
presence before it looks at any money — the roster's dot was a second old
when it was drawn, and a seeker with an empty wallet asking an offline
astrologer is told *the astrologer is offline*, which is both the true
answer and the fixable one. Telling them to add money would send them to
pay for a call that still would not connect.

## Referrals — where the codes live (25 Sep 2026)

| Screen | What is there |
|---|---|
| `/profile` → Settings, **first section** | The seeker's own `N…` code, tap to copy, and a box for somebody else's — which disappears once used |
| `/pro/affiliate` | The consultant's `A…` code, a per-product **Get link**, and what it pays. Reached from a row at the top of the studio |
| `/shop` arrived at with `?ref=A…` | A line under the header naming the code, before anything is tapped |
| `/shop` arrived at with `?p=<product id>` | That product scrolled to the middle of the screen, ringed, tagged *Linked*. A product no longer in the shop says so in a toast. There is no separate product page (owner's call, 30 Sep) |
| `/pro/studio` composer, Reel or Photo | **Tag products · n/3** — search the shop, tap *Tag*, remove with ×. Seekers tapping a tag arrive at `/shop?p=…&ref=…`, credited as a "Your links" link |
| Chat panel → **Alerts** | Real rows since today. Opening the tab marks them read |

**The Shop banner says cashback, and says it first.** *You pay the full
price and get 10% back in your wallet seven days after delivery — on your
first order only.* All three facts before any Buy button, because a
seeker who discovers after paying that the 10% was not taken off the
total has been surprised by their own money.

**The link code is held in `sessionStorage`, not just the URL.** The
journey from a shared link is rarely one page — arrive, browse, sign in,
then buy — and a code living only in `location.hash` would be gone by the
time it mattered, with nobody able to explain why the consultant went
uncredited. Session, not local: it belongs to this visit.

**Only `A…` codes are read from a link.** An `N…` code is claimed once at
onboarding; treating one as a shop coupon would send a seeker to a till
to be told, correctly and uselessly, that it is the wrong kind.

**The affiliate URL is built by the server.** These get pasted into
WhatsApp and live for months, so the shape of one is a contract with
every link already sent — a template string in a screen cannot be
corrected later without breaking all of them.

**Alerts poll at 15s**, against chat's 3s. An alert is something you find
when you look, not something you are interrupted by.

## Messages between people — 13 Oct 2026 (docs/06 Phase 15b)

- **Start:** **Message** beside Follow on `/u/:id` (signed in, not your own)
  opens the conversation, made if there is none. A refusal is a toast:
  yourself, a blocked person, or an approved consultant (`01-PRD.md` §4.1).
- **Find:** `/messages`, and the chat panel's **Messages** tab on both sides
  (seeker: Consultant · Messages · Sessions · Alerts; consultant: Clients ·
  Messages · Alerts). Inbox lists accepted conversations and the requests you
  sent ("Sent. Waiting for them to accept."); **Requests** lists messages to
  you from people you do not follow, with a count.
- **A request:** the sender has one message until it is accepted. The
  recipient sees *A request: you do not follow {name}. Accept to reply.* with
  **Accept** and **Decline**; replying is accepting. Declined, the sender
  cannot write again.
- **Conversation:** polls every three seconds while open; opening it marks
  the other person's messages read. ⋯ holds View profile, **Block** /
  Unblock (neither person can then write) and **Report** (the person report).
- **Alert:** "{name} sent you a message", at most once per conversation per
  IST hour, without the words; tapping it opens the conversation.

## Groups (14 Oct 2026, Phase 15c)

Rahul's placement was option A, **Chat → Groups**, a third segment; it left
Chat the same day (Rahul), and groups are reached from **Home's Groups
button**. `/groups`: a search box on top ("Find group: a mandir, deity,
sampradaya or city"; typing shows what it finds), then **Groups you created**,
**Groups you're in** and **Suggested groups** (live groups you are not in,
busiest first); the one way to start a group is the green **+** at the top
right (the two Start a group links went, 14 Oct 2026, Rahul). A group's kind
is Mandir, **Bhagwan** (added the same day), Sampradaya, City or Other. The
button: a round saffron button with white people and a small +, to the
right of Reels · Aaj ka panchang · Aaj ke darshan, opening `/groups` (the
same list as a page, back to Home). It lists **Your groups**, the newest
post first, then **Find groups** (a search box, by name, city or about) and
**Start a group**.

- **Start a group** (`/groups/new`): photo, name (3 to 80 characters), what
  it is (Mandir · Sampradaya · City · Other), city, about. You become its
  admin. Three new groups a day at most.
- **A group's page** (`/groups/:id`): photo, name, kind · city, the member
  count (opens Members), about, then **Join** or **Leave** and, for a
  member, **Post in the group** (the same composer as Home's +, posting into
  the group). Its posts follow, newest first.
- **An admin** also sees Edit (`/groups/:id/edit`), **Remove from group**
  under each post, and in Members **Make admin** and **Remove** beside each
  person. A removed member cannot post, rejoin, or leave and rejoin. The
  last admin cannot leave while others remain.
- **In the feed** a group post carries "In <group>" above its author,
  opening the group. It reaches the group's members' Home feeds, not
  everybody's.
- **Groups for you** on Home (14 Oct 2026, Rahul): after the twelfth card,
  the same strip as People to follow — live groups you are not in (nor
  removed from), most members first, each with Join; the card opens the
  group.
- Every group is public: anyone joins. Private groups (join requests) are
  not planned for now, and a profile shows no count of groups (both Rahul,
  14 Oct 2026). Namo blocks a group from the
  console (*Groups*), which takes it and its posts out of the app.

## Festival frames (14 Oct 2026, Phase 15c)

Under a photo chosen in the composer (Home's +, a group's Post), on a
festival's days: a row of frames, "No frame" first. Tapping one draws the
photo cut to 4:5 under the frame, uploads that, and shows it; "No frame"
goes back to the photo as chosen. Not for a video, a blog cover or an edit.

The console's frames (*Frames*: a name, a 1080 × 1350 PNG with a
see-through middle, a start and an end) come first; then the app's own,
each in its IST window: **Shubh Navratri** 10–19 Oct, **Happy Dussehra**
20–21 Oct, **Shubh Deepawali** 6–10 Nov 2026 (`src/lib/frames.js`). The
built-in art is drawn by `tools/festival-frames.py`, with its English and
Hindi set by Chrome in `tools/festival-frames-text.mjs` (this Pillow cannot
shape Devanagari). Stickers are not built.

## The share sheet (14 Oct 2026, Rahul)

Every Share button opens it: reels, posts, articles, products, Bhakti items,
profiles, the invite link. A status card's green WhatsApp Share is the one
exception; it still hands the dated picture to the phone. Signed out, Share
goes straight to the phone's sheet.

- **People on NAMO.** A search box, then your recent chats and whom you
  follow, three to a row. Tap to pick one or more; **Send** (no name on
  it, Rahul) takes the place of the row below while anyone is picked. Each gets it as a message in your chat with them,
  under the ordinary rules: a stranger gets one message as a request, a
  blocked person nothing.
- **Never a Pro.** Approved Pros are left out of the list and the search
  (Rahul: "Pro ko koi msg nahi jayga"); their paid chat is the way to them.
- **Outside NAMO.** Round buttons along the foot: WhatsApp (`wa.me`, the
  title and link; green, Rahul), Share (the phone's sheet, as the button
  did before) and Copy link.

In the chat, a share is a card, about half the screen wide (18 Oct 2026,
Rahul, after Instagram's; it was wider). A reel is all picture: its link
preview standing 9:16 (the frame, NAMO's logo and the play mark, as
WhatsApp shows it; reels sent before then too) with "Reel" and its words
over the bottom. Anything else is its picture — or, sent without one (a
bhajan, an e-book, a listing), its link preview's picture — then
what it is (Market for a listing) (Reel, Post, Article, Shop, Bhakti, Profile) and its title. A tap
opens it. A post has no page, so it opens its author's. The Chats list
reads "Sent a reel", "Sent a post" and so on.

## Chats, `/messages` (redrawn 14 Oct 2026, Rahul)

The header carries the search box like every other tab (14 Oct 2026,
Rahul; Chats had none): it opens Search on People. The large **Chats**
heading and its New message pen went from the main app the same evening
(Rahul: the search does that job); the consultant app's chat panel keeps
both, having no header search. Underline tabs **Chatbox** · **Chat requests** with the
requests count in a saffron pill (they were Inbox · Requests on a pill
switch; Groups was a third tab). Each conversation: a 54 px photo, the name,
the last message and its time; unread shows the name and line in bold, the
time in saffron and a saffron count. A message still waiting to be
accepted reads "Sent · waiting for them to accept" behind a small clock.
Empty, the Chatbox shows the infinity mark, "No chats yet" and **Find
people**.

**Deleting (14 Oct 2026, Rahul).** Hold a chat in the list: **Delete chat**
takes it off your Chats only; the other person keeps theirs, and a new
message brings it back, from that message on. Hold a message you sent in a
conversation: **Delete message** deletes it for both people; each sees
"This message was deleted" in its place (the other person on their next
open of the conversation). Nobody deletes another person's message.

### `/studio/market` — Your listings (15 Oct 2026, Phase 17)

A Pro or a Creator (Studio → Market → *Your listings*, or *Add a listing*
on their profile's Shop tab). Since 16 Oct 2026 (Rahul) the page is the
listings only: the Market earnings, the insights link, the sales and the
payout row went (they are Studio's). *Add a listing* (four tiles) on
top, then **Waiting for approval · N** (a rejected one waits here too, with
"Admin:" and the note) and **Live · N** below it. Each listing is a card: cover with a
Live / Waiting for approval / Needs a change pill, title, kind, price and
(live) how many sold; Edit, See it (live) and Remove along its foot.
*Add a listing*:
Download, Course, Event or Product → `/studio/market/new/:kind`: cover
(16:9), name, price (0 free; not for a product), MRP, description, and the
file; or the language and lessons (each a video or PDF, the first a free
preview); or the start, length, seats and joining link; or the category,
stock to send and packed weight. The form shows what Namo keeps and what the
seller gets. *Send for approval*. Edit sends a listing back to approval.

**`/studio/market/earnings` — Market earnings and insights (16 Oct 2026,
Rahul).** The Earnings page's shape for the Market. Header back to Sell on
the Market; tabs **Earnings · Insights**; the period chips (This month, Last
month, This FY, Last FY, Lifetime), shared by both. A sale counts when it was
paid for (download, course, event) or delivered (product).

- **Earnings:** the period's total after Namo's share, what is due and the
  next 7th, Where it came from (Downloads, Courses, Events, Products, each
  with count and amount), Last 7 days bars, the sales (title × units, date,
  price − Namo's share, Paid once paid out), 30 at a time.
- **Insights:** Sales, Units, Buyers; then *Your listings · N*, what sold in
  the period, most earned first: cover, title, kind · units sold · buyers,
  amount.
- Empty period: "Nothing sold in this period."

**Shop tab on profiles:** a Pro's page (`ConsultantPage`) has *Shop* after
Posts when they sell something, and always on their own page; a Creator's
own Profile has a Shop tab; anybody's `/u/:id` shows *For sale* above the
posts when there is something.

### Tagging from the Market (15 Oct 2026, Rahul)

For a Pro or a Creator only (`src/lib/tagpick.js`, `components/TagPick.jsx`).
In a new post on Home, **Tag** saves the draft and opens the Market in pick
mode: a dark bar under the header, "Tag a product · N/3 tagged", and
**Done**. A product card carries a corner **+** (✓ once tagged); a product
page carries **Tag this product** (tap again to remove) and *Done, back to
my post*. Done returns to Home with the composer open and the products
tagged; three at most, as before. Out of pick mode, a product page carries
**Tag in post** (a new post with it tagged) and **My Referral Link** (the
phone's share sheet, or the link copied); a card carries nothing out of
pick mode (15 Oct 2026, Rahul: the page's Share is enough). Editing a post, a group's composer and the pro app keep the search
list in the composer. The composer no longer lists shop products under the
tags there (15 Oct 2026, Rahul): the chips (one line each, cut at the edge)
and *+ Tag more from the Market*.

**Listings too (15 Oct 2026, Rahul):** downloads, courses and events carry
the same Tag in post and My Referral Link on their page, and the pick corner on
their cards; a post tags up to three things, products and listings together, and
its strip opens a listing's page with the author's code. A buyer a link or
tag brought is recorded on the purchase (`market_purchases.referrer_id`);
nothing is paid on it until the sharer's share of a listing is decided, so
a listing's page does not say it earns.

