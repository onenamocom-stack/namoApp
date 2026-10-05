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
| `/premium` | Premium | Plain |
| `/reports` | Reports | Plain |
| `/tarot` | Tarot | Plain |
| `/home` | Home | **Tab** |
| `/consult` | Consult | **Tab** |
| `/pooja` | Pooja | **Tab** |
| `/academy` | Academy | **Tab** |
| `/shop` | Shop | **Tab** |
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
| 1 | `/onboarding` | Language (English / हिन्दी, remembered on the device), four lines on what the app does, then the mobile number. *Get code* sends the OTP and the same page turns into a six-digit field with resend after 30s and *Change number*. The code auto-fills where the browser offers it (WebOTP) and verifies itself at six digits | number matches `[6-9]` + 9 digits; code accepted by Supabase | account has a birth date → `/home`; otherwise `/onboarding/details` |
| 2 | `/onboarding/details` | Name, gender, birth date, birth time (or *I don't know*), birth place, email (optional), referral code (behind a link) | name non-empty; gender picked; a real calendar date 1900–today; a 12-hour time *or* the box ticked; a place **picked** from the search, carrying lat, lon and IANA zone; email, if given, shape-checked. Missing fields are named above the button | `/onboarding/computing` |
| 3 | `/onboarding/computing` | Writes the profile, computes the charts, and plays the **reveal** once: a turning zodiac ring, then *Welcome, {name}* with Sun, Moon and Lagna. 4.2s, a tap skips. Restored 3 Oct (it was removed 30 Sep) at the owner's request, as a one-time moment | — | `/home` |

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

Re-entry points: *Run onboarding again* restarts at step 1; *Edit birth details*
opens step 2 in edit mode.

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

**Feed** is the stream, where `kind` picks the card. The free-tools row used to
sit above it and is on `/consult` now, as of 7 Sep 2026:

| Card | Actions |
|---|---|
| Post | Like · Comments (sheet) · Reshare (not on your own) · Share (share sheet / copy) · Save. Byline → consultant. A tagged product → `/shop?p=<id>&ref=<author's A code>` |
| Post head (post, reel, article) | Author → their profile · **Follow / Following** beside the name, as on Instagram (5 Oct 2026): the same saved follow the profile pages use, hidden on your own posts and when signed out |
| Reel | **Plays by itself** when 60% of it is on screen — muted, looping, one at a time; scrolling on pauses it and starts the next (5 Oct 2026). The speaker button turns sound on or off for the whole feed. Tap → `/reels/:id` · Like · Comments (sheet) · Reshare · Share (share sheet / copy) · Save · views. A tagged product → `/shop?p=<id>&ref=…` |

A reshared post appears in the feed after every third post under "↻ Name
reshared", and in a **Reshared** list on the resharer's Profile and `/u/:id`.

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
consultant's booking sheet (`/consult/:id?book=1`) and works offline; a slot is
20% under the meter (`01-PRD.md` §4.1), said once above the list and, with the
saving in rupees, in the sheet. The profile page carries the same four.

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

Per consultant: the row opens their profile; a call knob toasts; a message knob
opens the chat overlay; Live goes to a real room when one is running. Nothing is
disabled for being "offline" — there is no presence yet (phase 6), and a dot
that is always green is worse than no dot. The rail above the list counts
`verified`, which is a real column.

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
downloaded.

**Sharing a status composes a picture.** The artwork is the background; the
person's photo goes bottom LEFT in a circle with a gold ring, their name and
today's date beside it, and the Namo mark bottom right. The photo comes from
the gallery, the camera or their profile picture, and it is **optional** —
somebody who only wants to forward the artwork is not made to put their face
on it, and **it is remembered until it is changed** (26 Sep 2026) — a 320px
data URL in `localStorage`, keyed by user id, because posting every morning
should not mean hunting the gallery every morning and a shared phone must not
put the last person's face on this one's status. Storage full or denied leaves
the sheet with no picture, which is the same state as a first visit.

The sheet shows a preview of exactly that arrangement before anything
is handed over, because a share sheet is the last place to discover what you
are sending. Everything except the artwork is drawn only if it loaded: a
photo that fails costs a corner, not the picture.

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

**The whole page is a mandir entrance** (5 Oct 2026, `TempleFrame` in
`PujaProps.jsx`): a photograph of a carved white-marble entrance with pillars,
an elephant frieze, a layered scalloped arch and marble steps
(`public/puja/mandir-marble.webp`, Canva design DAHXKTEtMaA, doorway
green-screened and keyed). It is laid on as a CSS border-image sized in `cqw`,
so the frieze and arch scale with the page's width and only the pillar shafts
stretch to its height. The murti stands **inside the doorway**
(`FRAME_OPENING`) on a lamp-lit dark sanctum, not behind the pillars. It
replaced a sandstone door frame and, before that, a drawn SVG frame the owner
called "AI created".

**No offering buttons: you touch the samagri** (5 Oct 2026, the owner's pick
over brass roundels on the pillars, a samagri tray, or a fan-out from the
thali). The two ghantis hang at the doorway's edges and ring when touched. On the
steps, the agarbatti stand and both diyas light when touched, and a brass bowl
of marigolds (`public/puja/pushpa.webp`) showers flowers. The thali in the
middle still begins the aarti. Until the first offering, each object breathes a
saffron glow, and a one-time toast says "Touch the ghanti, diya, dhoop or
flowers to offer". The `namo.puja.touched` localStorage key remembers it per
device. The rail of dark round buttons down the pillar is gone.

**Four mandirs to choose from** (5 Oct 2026): white marble, pink sandstone, gold
and black granite with brass (`MANDIRS` in `PujaProps.jsx`, files
`public/puja/mandir-{id}.webp` plus a `-thumb`). Each is measured in its own
pixels (top, side, bottom, apex, plate), so the doorway, bells and nameplate
follow whichever is chosen. The choice is in the Darshan sheet under **Mandir**,
changes the page behind the sheet at once, and is remembered per device
(`namo.puja.mandir`).

**Back** and **sangeet** sit in the top corners over the frieze. The deity's
**nameplate** (its murti, its name, one dot per murti) is centred on the band
under the frieze, where the owner placed it on the marble; each mandir's
`plate` says where that band is. The nameplate opens the **Darshan sheet**: deities in a
grid, then that deity's murtis, then the mandir. Tapping a deity changes the doorway behind the
sheet at once and keeps the sheet open on its murtis; tapping a murti closes
it. This sheet replaced the deity chip row and the eye button, and it is **the
only place the image attribution appears**, so it cannot be removed without
removing the images. **Sangeet** opens with the current deity's own bhajans and
mantras first ("For Ganesh"), matched loosely on Bhakti's deity field and title,
then the Bhajans/Mantras tabs. While something plays, the button turns gold
with moving bars. A pushpanjali showers 36 photographed marigolds and loose genda
and rose petals (`public/puja/{flower,petal}-*.webp`) in front of the marble;
petals flutter edge-on as they fall, and each one's size and speed differ. The thali never spins on
the spot: a tap begins or ends the aarti, and it only circles in front of the
murti.

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


### `/academy`
E-book / Courses / Events. E-book leads and opens by default (28 Sep 2026) — it is the only tab reading real content.

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
saffron ring (tap to change), posts · followers · following, your name, your
Sun, Moon and Lagna as coloured chips, then **Edit profile**
(`/onboarding/details?edit=1`), **Share profile** (`/u/<you>`). Under the name,
your bio — "● Available" until you write one; tap to edit, 150 characters.
Choosing a new picture opens an adjuster first: drag to place, slide to zoom,
and only the circle is uploaded. and **+** (the
composer, on the Posts tab). Icon tabs, each its own URL: **posts** (a 3-column
grid — photos open full screen, blog posts and reels open on their pages — then
what you reshared), **saved** (your bookmarked posts), **kundli** (the chart,
*Open full chart*, birth data, *Edit birth details*, then chart, matching,
muhurat and reports), and **influencer** for influencers. Bare `/profile` opens
posts if you have any, kundli if not.

**☰ → `/profile/settings`** (the old Settings tab's address): invite a friend,
then Account (wallet, orders, notification history, phone), More from Namo
(Namo AI, premium, academy, shop), Preferences (language, full deity images,
help and support), and sign out. Back means Home from the profile and the
profile from settings.

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
to checkout is walking to Shop. `/premium` shows prices and grants nothing.
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

A price is **picked from a band**, never typed, and the row it writes cannot
carry a status — the column grant does not include one.

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
Compose a reel, a photo or a blog post. **Already published** lists the
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
Under the bio, the milestone ladder: paid sessions given and how many more to
the next tier and to 1000. Settings → **Payout details** → `/pro/payout-details`.

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

ChatPanel's tabs differ by side: a seeker gets Consultant / Sessions / Alerts —
Sessions is the booked sessions list, with Review on a completed one, moved
from `/consult` on 5 Oct 2026 — a consultant Clients / Alerts, and both open
on the first. The header's wallet knob is an icon, not the balance, since the
same day. **Ask AI left the panel on 30 Sep
2026** for its own page, `/ask` — messages are people.

**CartSheet is the app's main checkout** and the only overlay that moves money.
Under the lines sits **Deliver to**: the saved addresses (the last one chosen
is preselected) or, when there are none, the address form — a six-digit
pincode fills city and state. Choosing an address asks the server for the
delivery charge; the sheet then shows Items, Delivery and Total, and **Pay
stays disabled, reading "Choose an address", until a charge has come back**.
A refused payment asks for the charge again. After a successful Pay the app
asks the server to dispatch the parcel and does not wait for the answer.

**Orders** shows each parcel as four steps — Ordered, Packed, Shipped,
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
| 1 | Cart checkout | Debits the cart total plus the quoted delivery charge, clears the cart |
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
- **Busy** shows beside the consultant's name while a request rings for them or
  a session is live; it clears by itself when that ends.
- **A chat** opens the chat panel on that conversation for both people; **a call**
  opens the call screen. The consultant's request bar says Chat, Video call or
  Audio call, and its button says Accept or Answer.
- **The call screen** reads "Connecting" until both are in, then the minutes left.
- **History:** the chat panel's Consultant tab lists only people you have
  connected with, each with what you last did together ("Video call · 3 min");
  its Sessions tab lists calls and chats (with cost) and booked slots; Alerts
  carries an unread count. Alerts older than six months are deleted by the sweep.

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
| Chat and Call faded, and a line saying so | offline, with Schedule still working |

**The line is said, not implied.** Two faded glyphs and nothing else
produces "nothing happens when I tap". *"<name> is offline right now. You
can still schedule a session."* — and the second sentence is the point,
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
