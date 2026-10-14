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
| `/dashboard` | Dashboard — a Pro's or a Creator's own screens (main app, 14 Oct 2026, Phase 16); anyone else goes to `/profile` | Plain |
| `/dashboard/studio` · `/earnings` · `/profile[/:tab]` · `/affiliate` · `/payout-details` | The pro app's Studio, Earnings and Insights, practice, links and payout details. Studio for a Pro or a Creator, the rest for a Pro | Plain |
| `/desk` · `/desk/ring/:id` | **Namo Consult** — a Pro's calling screen in the main app (14 Oct 2026, Phase 16): online switch, ringing requests, the queue and slots; a notification's Answer / Decline lands on `/desk/ring/:id` | Own shell, no tab bar |
| `/home?compose=1` | Home with the new-post sheet open (14 Oct 2026) | Tab |
| `/tag/:tag` | TagScreen — a hashtag's posts, Newest · Top (both apps) | Plain |
| `/messages` | Messages — Inbox · Requests (both apps) | Plain |
| `/messages/:id` | Conversation — one person, free (both apps) | Plain |
| `/premium` | → `/home` (Premium not offered, 11 Oct 2026) | — |
| `/reports` | Reports | Plain |
| `/tarot` | Tarot | Plain |
| `/home` | Home | **Tab** |
| `/consult` | Consult | **Tab** |
| `/pooja` | Pooja | **Tab** |
| `/shop` | Shop — **Market** tab, with Academy (13 Oct 2026) | **Tab** |
| `/academy` | Academy — **Market** tab, with Shop | **Tab** |
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
posts and more popular posts rank higher. A post you watched in the last two
weeks sinks. The same author never shows twice in a row while there is
another, and every fifth post is a random pick. Signed out, or with nothing
liked or followed yet, the feed is fresh and popular posts. If the ranked
feed fails to load, the old random deal stands in.

**People to follow — 13 Oct 2026 (Phase 15a).** Signed in, the feed carries
one sideways strip after its fifth card: people followed by the people you
follow ("Followed by Tara"), then authors who posted most in the last two
weeks ("Active this week"); never you or anyone you follow. Each card opens
`/consult/:id` or `/u/:id`; Follow is the same saved follow as on a profile.

**Create post — 12 Oct 2026 (Rahul: "like Facebook"; it replaced the tabs
Text · Photo · Video · Blog).** One screen: Back, *Create post* and **Post**
(top right, live once there are words or a picture); your photo and name; one
box for the words; a picked photo or video under it with ✕. The toolbar
pinned under it, one row of pills, icon beside name (lowered the same day,
Rahul: "more modern"): **Photo/Video** (gallery; *Photo* where the account may not
post video, and a video picked there is refused with a sentence), **Camera**,
**Tag** (Tag product; consultants only) and **Blog**. Words alone publish a `post`
with no media, a photo a `post`, a video a `clip`. **Blog** opens *Write a
blog*: a cover box, the title large, the body, and under them Tag product
(consultants) and the word count with read time; **Publish** needs a title
and a body, Back returns to Create post. Each keeps its own draft. Edit uses
the same screen, its kind fixed, with **Save**. A **#hashtag** in a
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
`/bhakti` has no header tag and its search sits above the tiles.
| Panchang | First on the आज का पंचांग tab. No links (the *Full chart* link was removed 30 Sep) |
| Reading | Under the panchang: **the free reading by sign** (30 Sep) — twelve sign chips, opening on the reader's own moon sign; the sign and date, headline, summary and Ujjain's windows; a last line to *Your own predictions* on `/chart`. No heading and no *Read all* |
| Article | → `/read/:id` · Save |
| Live | → `/live/:id` |
| Course | → `/academy` |
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
rate; on a pro's own page they show the rates and press nothing), and its
About tab lists all four rates.

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
Audio, Chat** with the per-minute rate ("3 min free" for a new seeker's
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
camera, profile picture, remove) and the name for the status. **Save keeps
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

`price_paise` is nullable and **null means not priced yet**, which the screen
distinguishes from free. Attribution is three NOT NULL columns and is rendered
on every row — these files are downloaded and some will later be sold, and
several deity images are share-alike.

### `/darshan`
**The one screen that does not scroll.** A fixed-height column: back bar, deity
row, shrine. Reached from Home's Darshan tab; it was `/pooja` on the tab bar
until 9 Sep 2026 and now takes the whole frame. Since 5 Oct 2026 it has no
`TopBar`: back sits on the mandir's frieze (see below).

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

**Edit, on your own post, reel or blog** (6 Oct 2026): an **Edit** button
where somebody else's post has the ⋯ report menu — on the feed card, beside
each piece in the Studio's "Already published", and in the blog reader's
top bar. It opens the composer over the screen, that kind only, filled in:
change the text, the image or video, and (a consultant) the tagged
products; **Save changes** updates the card in place. A removed post cannot
be edited.

**Sharing a blog or a product** shows its own card — title, a line of the
text, and the cover (or product photo) as the thumbnail — in WhatsApp and
anywhere else that previews links (6 Oct 2026; every link previewed as
Namo's front page). **So does a Bhakti item** (8 Oct 2026): its share
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

**A new seeker's free first session** (7 Oct 2026): consultants ticked
"free first" in the console come first on Consult with a green "First 3
min free" in place of their rate, and their page says "your first 3 minutes
free"; a request goes through with an empty wallet. After the seeker's first
session they show their rates like everyone else.

**Recharge without leaving the conversation** (7 Oct 2026). A chat or call
has ONE timer and ONE end button, the same row for both people (9 Oct 2026,
Rahul: the call showed three timers and Daily's own Leave behind ours —
Daily's Leave is hidden now). In the last minute a **Recharge** button
appears in that row for the seeker, and nowhere else; it opens up to four amounts — ₹100 when that buys a
minute (10 Oct 2026), then about 5, 10 and 20 minutes at this rate — and Razorpay over the conversation; the minutes
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

**`1namo.com/<username>`** (11 Oct 2026, Rahul) forwards to `/consult/:id`
for a consultant and `/u/:id` for anybody else, signed out too (a seeker's
page still asks a signed-out visitor to sign in). A name nobody has, or a
seeker with no posts, shows *Nobody by that name*. Share profile shares this
address whenever the person has a username, from either app.

**A name in your follow list always opens** (12 Oct 2026, Rahul): `/u/:id`
for somebody who has never posted exists for you when either of you follows
the other; with no posts it says "Nothing published yet". To anybody else,
somebody who has never posted still has no page, and the app goes to Home.

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
in place) or photo they uploaded from Settings → *Intro video or photo*; nothing
when there is none (11 Oct 2026; it was a "Meet X · 1:24" placeholder). Its
**Posts** tab (was "Work", a list of titles) shows each
post in full, as the feed does (11 Oct 2026). **About** is the facts without a
heading (speaks, category, experience, verified). No Rates section since 13
Oct 2026 (Rahul: it repeated the footer); no Book section since 11 Oct. The
footer's four buttons are the way in and carry every rate — a tile that says
"Offline" or "3 min free" shows its per-minute rate on a second line. A reel's caption in the reels viewer folds to two lines; a tap
opens it.

### `/shop/p/:key` — a product's page (6 Oct 2026)

`key` is the slug or the id. Top bar: back to the shop, the brand (or the
category), the cart. Then the gallery — swipe through every photo and
video, thumbnails under it to jump; a video plays in place. Brand, name,
subtitle, price, MRP and the discount, "Inclusive of all taxes. Free
delivery." (8 Oct 2026), "Sold out" only when it is (the stock count and the
SKU chip went on 7 Oct 2026, Rahul), chips for category and subcategory,
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


### `/academy`
E-book / Courses / Events. E-book leads and opens by default (28 Sep 2026) — it is the only tab reading real content.
Each book has the Bhakti row under its title (12 Oct 2026, Rahul): Like,
Comment, Reshare and Share, with Read on the right; a priced book has no
Reshare. A shared book's address (`/bhakti/s/:id`) opens `/academy?book=:id`,
that book first.

Course *Resume* and *Watch* are external links to **YouTube search URLs** — the
only outbound links in the app. *Enrol* toasts. Events show a seat-fill bar and
toggle a flag; full events refuse.

**The third tab was Downloads until 25 Sep 2026**, and the rename took the two
video rows with it: a shelf called E-book listing a 410 MB recording is the
kind of label this codebase keeps deleting. Lessons live inside their course,
which is where somebody looking for one goes. The list is still a prototype
and says so; the real books arrive with the Academy's own materials.

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

**Prediction** is the reader's own yesterday / today / tomorrow — the full
reading that was `/horoscope` from 22 to 30 Sep. **₹99 for 30 days**
(`01-PRD.md` §4.11): unbought, the server answers 402 with the price and the tab
shows the offer, with a link to the free reading by sign; bought, it shows when
the plan runs to. `/chart/:id` placement pages still exist but nothing on
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
a row of five icons without words (13 Oct 2026, Rahul; it was Edit profile
and Share profile): **Consult** (the chat panel on Consultant), **Sessions**
(the panel on Sessions), **Wallet** (`/wallet`), **Edit** (`/onboarding/details?edit=1`)
and **Share** (`/u/<you>`), each named to a screen reader and on long press.

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
specialization, rating line, bio, intro, Posts · Reviews · About (Posts
opens first, for clients too), and
the footer with the 20-minute price and the per-minute rate — with **Edit
profile** (13 Oct 2026, Rahul; the old one, which edited name and birth
details, went to Settings on 11 Oct), then **Dashboard**
(11 Oct 2026, Rahul: opens pro.1namo.com from 1namo.com, the pro app's start
inside it; a first visit there asks for the phone code once) and **Share profile**
(`/consult/<you>`) where a client sees Follow and **Share profile**, half
the row each, both the white button (no saffron, Follow or Following) (11 Oct 2026, Rahul: they replaced the schedule, chat, video and
call icons, which did what the footer's four tiles do). The **+** went on 11 Oct 2026 (Rahul): a post is
made from Home's +. Your own page has six tabs, scrolling: Posts ·
**Reshared** · **Commented** (13 Oct 2026, Rahul) · **Saved** (11 Oct) ·
Reviews · About; a client sees three. On your own page
Followers and Following open the list of those people (12 Oct 2026, Rahul);
on anybody else's they are numbers only — the server lists only your own.
No Book section, no footer buttons, no offline note. Back means Home; ☰ opens
settings, which gain a first section, Profile: **Intro video or photo** (and
**Influencer**, at `/profile/influencer` under a plain top bar whose back is
settings). Kundli and Saved left that section on 11 Oct 2026 (Rahul): the
horoscope section has the kundli, and Saved is a tab on the page. An applicant who is not approved, or a blocked
consultant, keeps the seeker profile. The consultant app's preview of
`/consult/:id` stays the client's view.

**☰ → `/profile/settings`** (the old Settings tab's address): invite a friend,
then Account (**Username** — a sheet with `1namo.com/` and the name, checked
as you type, saved once every 30 days (11 Oct 2026, Rahul); the pro app's
Settings has the same row under Practice — orders, notification history, phone — no Wallet row since 11 Oct
2026, Rahul: the wallet is the header icon — on Consult only in the seeker
app since 13 Oct 2026, every tab in the pro app), Preferences
(language, help and support; the full deity image toggle went on 11 Oct
2026, Rahul: the murti is always whole), and sign out. Back means Home from the profile and the
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
`/#/onboarding?ref=N…` stores the code for the visit; the details page opens its
referral field already filled, and claims it on submit. Only N (invite) codes —
an A code is a shop coupon and belongs to the cart.

### `/wallet`
Balance and history, both read from the server. Since phase 3 *Add money* opens
a sheet: four presets and a custom amount, then Razorpay's own checkout in an
overlay this app does not draw.

**Nothing on this screen credits anything.** The sheet opens an order and
hands off; the balance moves when the provider's webhook reaches the server and
its signature verifies. So the screen cannot await the credit — it polls for a
few seconds, and if the credit has not landed it says the payment is settling
rather than holding a spinner over a number it does not control. Dismissing
Razorpay's overlay, or a card the bank declines, both return to the sheet with
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
surface, the dasha line dropped and the windows named as Ujjain's. **Paid, your
own**: `/chart`'s Prediction tab, computed from the reader's birth, windows at
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
opens the panel, live navigates to a room, call toasts. The availability grid
below writes `consultant_availability`, one row per open cell, and reads what is
taken from the same slots function the seeker's booking sheet calls.

An availability grid of weekdays against times; tapping a cell toggles it closed.
**The same booked-slots data the seeker's booking sheet reads** — except this
screen applies it only on Thursday, so the two views already disagree. One
endpoint fixes it.

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
Settings → **Your rates** opens a sheet with the same four fields as the
application and **Save rates**; all four save together, and new prices apply to
what is asked or booked afterwards.

### `/dashboard` — a Pro's and a Creator's own screens (14 Oct 2026, Phase 16)

Reached from **Dashboard** on a Pro's own page (it opened pro.1namo.com
until this day) and on a Creator's Profile, under the five icons.

- **A Pro:** Your work (Studio, Earnings and Insights, Your links), Your
  practice (Practice and reviews, Edit your page, View your public page,
  Payout details), Calls and chats (**Namo Consult**, `/desk`).
- **A Creator:** Your code, then Insights (the last seven days, every post
  with its views, products sold with their code).

No Studio (14 Oct 2026, Rahul; it was the first row): posting is Home's +.
In that sheet a Pro and a Creator also get video, and a Pro gets Tag
product; a Seeker gets photo, text and blog. Gallery and Camera are icons
without words. `/dashboard/studio` and "Post more" open Home with the sheet
up (`/home?compose=1`).

The screens are the pro app's own, at `/dashboard/...` and not `/pro/...`:
a `/pro` path switches the online beat on, which would show a Pro as online
where no call can ring. A Seeker downloads none of these screens.

### `/desk` — Namo Consult (14 Oct 2026, Phase 16)

The main app's one screen where a Pro is on duty, reached from Dashboard
and from Availability in Practice settings. Header: back to Dashboard, the
name, the **Online** switch. Under it the ringing requests (Decline,
Answer), then the pro app's Consult screen as it is: approval state,
Sessions · Chat · Call, the slots. No tab bar.

Open, the app beats and the Pro can be online; leaving it stops the beat,
so the Pro drops offline as they would by closing the pro app. On this
screen the page names itself Namo Consult and offers `desk.webmanifest`
(start `/desk`), so Add to Home Screen installs it as its own icon.
pro.1namo.com keeps working beside it until Namo Consult has carried a
real paid call end to end.

### `/practice/edit` — a consultant's Edit profile (13 Oct 2026, Rahul)
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

**The header's knobs — 13 Oct 2026 (Rahul).** In the seeker app the header
keeps only a **bell**, on every tab: it opens the panel on Alerts, with the
unread count on it (the old chat bubble's red dot was drawn always). The
wallet, the consultant chat and sessions are icons on Profile. The pro app
keeps the wallet and the bubble on every tab.

**Ticks — 13 Oct 2026 (Rahul).** After a name: orange for a Pro (every
approved consultant: Consult cards, their page, their posts in the feed),
blue for a Creator (their posts, `/u/:id`, their own Profile). It replaced
one blue mark for console-verified consultants only. The Influencer tab on
Profile is the **Creator** tab.

**The tab bar — 13 Oct 2026 (Rahul).** Home · Bhakti · **Chat** · Consult ·
**Market**. Chat is `/messages`, under folded hands (the `namaste` icon,
drawn from Rahul's reference). Market is Shop and Academy in one tab: it opens on `/shop`,
stays lit on `/academy`, and both pages carry a Shop · Academy switch under
the header; every old link to either still works. Messages took the freed
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
A customer's first order says its cashback above Pay, for this basket and
this way of paying: "Your first order: ₹500 back in your wallet seven days
after delivery", or on cash on delivery "Your first order gets ₹500 back
when you pay online. Not on cash on delivery." (11 Oct 2026). The code box
is for shop coupons; an astrologer's code is a link now, caught from
`?ref=A…` on any page and held by the server (`docs/01-PRD.md` §12).
Then **Pay**: **Pay online** or **Cash on delivery** (6 Oct 2026). Pay online
— the default — reads "Pay ₹X" and opens Razorpay's checkout for the order
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
| 1 | Cart checkout, online | Writes a `pending` order holding the stock for 15 minutes and opens Razorpay for its total; the checkout's signed answer (or the webhook) makes it `paid` and sends the parcel; closed or lapsed → `cancelled`, stock back, nothing charged |
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
Razorpay makes to a public URL, minutes later if it has to retry. Nothing the
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

One sheet, `components/ReportSheet.jsx`, raised from three places. Nothing
else in the app reports anything.

| Where | The control | What is reported |
|---|---|---|
| A post card in the feed | **⋯** at the card's top-right corner | that post |
| A reel | **Report** at the bottom of the right-hand rail | that reel |
| `/u/:id`, somebody's profile | **Report** in the top bar | that person |

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

| What the seeker sees | When |
|---|---|
| Green dot on the avatar | `online` from the roster — the server's boolean, not the client's arithmetic |
| Chat and Call live | online |
| Chat and Call faded, and a line saying so | offline, with Book still working |

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
