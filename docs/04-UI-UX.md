# 04 — UI/UX design

The design system as it exists in `src/index.css` and `tailwind.config.js`.

**This document owns everything visual and never mentions data loading.** Routes
and actions are `03-APP-FLOW.md`.

Replaces `DESIGN.md` and `CRED-DESIGN.md`, both deleted. `DESIGN.md` described a
pure-black monochrome build that was replaced several redesigns ago and was
roughly 85% wrong — its token table, its font, its "radius: 0 everywhere" rule
and its "fades only" motion rule are all dead. Everything below was read out of
the code.

---

## 1. What this looks like

**The Sri Mandir look.** A light grey page, flat white cards, charcoal type,
one saffron accent, green for the main action, and bold Poppins headings.
Rounded and tactile — buttons still depress, switches stay down, wells recess.

**Repalette, 30 Sep 2026.** This replaces the 20 Sep set (near-white page,
cream cards, navy ink, a dark tab bar, Plus Jakarta Sans). The reference is
the Sri Mandir app: orange and white everywhere, green on the button you are
meant to press. Only hues, weights and the font moved — the light source,
the radius scale, the type scale and the pressed-state mechanic are
unchanged, and no screen's behaviour changed.

---

## 2. Tokens

### 2.1 Colour

Declared as CSS custom properties on `:root`. **Tailwind's default palette is
replaced, not extended** — apart from `transparent`, `current`, `black` and
`white`, no other colour is reachable from a class name.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f6f6f8` | Page — a cool light grey. The browser theme colour is `#ffffff` |
| `--surface` | `#fff4ea` | Peach tint — highlighted blocks, wells on white. Cards themselves are white (`.pop-card`) |
| `--surface-2` | `#ffe4cc` | One step deeper — inactive tracks, chip wells |
| `--stroke` | `rgba(17,17,17,0.08)` | Hairline on a raised surface |
| `--rule` | `#ebebef` | Divider on the page itself |
| `--ink` | `#262626` | Dark slabs — toasts, scrims, reel backdrop, sent chat bubble — and the logo |
| `--ink-2` | `#363636` | A block sitting on ink |
| `--ink-lit` | `#444444` | The lit top of an ink gradient |
| `--btn` / `--btn-deep` / `--btn-edge` | `#45bd82` / `#2ea56b` / `#27925d` | The green main-action button — two shades lighter since 30 Sep, at the owner's call |
| `--orange-hi` / `--orange-lo` / `--orange-edge` | `#ffa05e` / `#f5782c` / `#e8691f` | Every saffron FILLED surface — secondary button, selected chip, tile, sub-nav thumb. Lightened with the green |
| `--hi` | `rgba(255,255,255,0.9)` | Specular highlight, light surface |
| `--hi-ink` | `rgba(255,255,255,0.14)` | Specular highlight, dark surface |
| `--lo` | `rgba(17,17,17,0.1)` | Shade under a lip |
| `--live` | `#d93025` | Live badge, liked heart, unread dot |
| `--ok` | `#1e9e5a` | Online dot — green, matching the button |

**Buttons.** `.pop-btn-gold` (the `gold` variant of `PopButton`, and
`Button variant="solid"`) is the ONE main action on a screen — pay, buy,
book, add money, begin — and is **green**. The class name is historical: it
means "the voltage CTA". Plain `.pop-btn` is a secondary filled action and
is **saffron**. `.pop-btn-ghost` is the white third. After the 30 Sep
lightening, white on the green deep end is 3.0:1 and on the saffron deep end
2.8:1 — below AA, accepted for a softer look on buttons that carry bold caps
and are never the only way through a screen.

**The Home feed is Instagram-shaped** (30 Sep): a stories strip of the feed's
authors (saffron-to-green ring), then full-bleed posts on white separated by
hairlines — header, edge-to-edge media, an icon action row (heart fills
saffron, bookmark right), the like count, "name caption". A short text-only
post renders as a square peach-to-mint text tile. House suggestions (course,
product) and articles carry a tinted call-to-action strip under the media:
green for a commitment, saffron for a read. The components are in
`Home.jsx`.

**Selected state is saffron.** Pills, sub-nav thumbs and tile faces fill
orange with a white label; the segmented control's thumb stays white with an
orange label; the tab bar is white with the active tab in `--gold`.

**The three ink steps must stay in this lightness order.** `--ink-lit` is the
top of a raised gradient and `--ink-2` the bottom of a pressed one, so both sit
above `--ink`. Swapping either inverts the light source on every ink surface at
once, which §3 is the whole of.

**Text ladder**, with the contrast ratio *and the surface it was measured
against*:

| Token | Value | On the page | Use |
|---|---|---|---|
| `--text` | `#1b1b1f` | 16:1 | Headings |
| `--text-2` | `#505866` | 6.9:1 | Body and paragraphs — slate, as Sri Mandir's are |
| `--text-3` | `#687080` | 4.8:1 | The readable floor |
| `--text-4` | `#b5bac4` | 2.0:1 | **Non-text only** — ticks, rules, spokes, placeholders |

**The kundli sky** (3 Oct 2026). The sign-up reveal's saffron-to-maroon
palette and turning ring, carried into the waiting and talking moments: every
loader is `Loader` (the turning ring, `components/Cosmos.jsx`); both chats sit
on `.cosmic-dawn` with your own messages in `.bubble-mine` (saffron gradient,
white text) and the other side's in `.bubble-theirs` (white, hairline);
Namo AI adds faint stars and thinks with the ring. Text pages stay plain so
the effect stays special. `.glass-panel` is no longer used for anything over
the dark scrim — the Tarot dialog, the chat panel and `Sheet` are solid white,
because frosted white over a 40% ink scrim reads as grey and disabled.

**Milestone tiers** (3 Oct 2026) have their own five hues, used only for the
ring around a consultant's avatar, the badge, and the ladder:
`--tier-1` green · `--tier-10` blue · `--tier-100` saffron · `--tier-500`
purple · `--tier-1000` gold, the top and the only gradient ring. Each has an
`-ink` twin dark enough for 11px badge text on its own 14% wash. No ring at
all below the first paid session. On the ladder every tier shows its colour
from the start, at 40% until reached, and the sentence names the next ring
("5 more to 10 sessions and a blue ring") — something to look forward to,
not a row of grey circles (owner's call, 4 Oct).

**Required fields** carry a red asterisk (`text-live`) after the label, with a
"* Required" key at the top of a long form — sign-up details, payout details,
the support report (4 Oct 2026).

The opacity ladder is solid slate now: `.t-heading` = `--text`, `.t-sub`
`#3f4653`, `.t-body` = `--text-2`, `.t-faint` `#858c99` (3.3:1, asides only).
A `Kicker` (a section heading like "Today's reading") is `.t-heading`;
`.label` (section labels, key/value keys) is `--gold` at 600; the top bar's
screen title is `--text`, bold.

**Saffron**, the only accent. The token names stay `--gold*`: they are read
by dozens of call sites, and the name has meant "the one voltage" since the
first build, whatever its hue.

| Token | Value | Note |
|---|---|---|
| `--gold` | `#c0500d` | Text and borders. **4.4:1 on the page, 4.7:1 on white** |
| `--gold-fill` | `#f5782c` | Fills, icons, bars. **No small text.** See the rule below |
| `--gold-dim` | `#a3440a` | |
| `--gold-wash` | `rgba(245,120,44,0.14)` | |

**No small text sits on `--gold-fill`.** It is 2.7:1 against the page, so
pointing `--gold` at it would drop every orange label below AA in one line,
and no build step checks contrast. Badges on the fill use `text-ink`
(charcoal, well above AA); filled orange surfaces use the `--orange-*`
gradient with white bold caps.

Two rules that survive from the old design doc and still hold:

1. **Greys are derived against the actual canvas, never arithmetically
   inverted.** The same hex does not hold the same ratio on two backgrounds, and
   flipping a dark set would have quietly dropped body text below AA.
2. **A contrast number must name its surface.** Under the gold palette
   `--gold` carried the note "4.9:1 on canvas". That was its ratio against a
   white *card*; on the canvas it was 4.29:1, under AA — and the accent
   appeared as text on both. The values are dead and the lesson is why the
   orange table above quotes two surfaces rather than one.

### 2.2 Type

**Poppins** (300–800) and **Noto Sans Devanagari** (400–700), one font request
(30 Sep 2026; it replaced Plus Jakarta Sans to match Sri Mandir's rounded
geometric sans). No serif, no mono — `sans`, `display` and `mono` all resolve
to the same stack. The canvas that draws Bhakti status images (`lib/bhakti.js`)
names Poppins too.

**Poppins carries Devanagari itself**, so Hindi and English set in one face;
Noto sits after it as the fallback for any glyph Poppins lacks.

Nine named sizes, so a screen cannot invent a tenth. Poppins is wide, so text
sizes carry no negative tracking and display sizes pull in half as hard as
Jakarta needed:

| Token | px | Line height | Tracking |
|---|---|---|---|
| `micro` | 11 | 1.35 | 0.06em |
| `label` | 12 | 1.35 | 0.05em |
| `meta` | 13 | 1.5 | 0 |
| `body` | 15 | 1.6 | 0 |
| `read` | 17 | 1.6 | 0 |
| `lead` | 20 | 1.4 | −0.01em |
| `title` | 26 | 1.25 | −0.015em |
| `display` | 34 | 1.15 | −0.02em |
| `huge` | 44 | 1.1 | −0.025em |

Tracking tokens: `label` 0.10em, `caps` 0.18em.
Measures: `measure` 34ch, `prose2` 44ch.

**Weight is a primary hierarchy lever** — caps labels are 700, `.font-display`
is 700, and large headings are **semibold (600)**: every `font-light` heading
became `font-semibold` on 30 Sep, because Sri Mandir's headlines are bold. The
active tab is bold.

### 2.3 Spacing

8pt grid. **Exactly two section paddings exist**: `.section` at 32px/20px and
`.section-tight` at 20px/20px. Nothing else sets section padding.

### 2.4 Radius

`sm` 8 · default 12 · `lg` 16 · `xl` 20 · `2xl` 24 · `3xl` 28 · `full` 9999.

In practice: card 20, raised tile 24, inset well 14, button 12 (small 10), plate
16, top bar bottom corners 18, tab bar top corners 32, and pills, tiles and
segmented controls fully round.

### 2.5 Elevation

Every shadow is a neutral near-black at low alpha, `rgba(17,17,17,…)`. A
white card on a grey page is lifted mostly by the contrast between the two;
the shadow is a whisper, as it is in Sri Mandir.

| Name | Value |
|---|---|
| `sm` | `0 1px 2px rgba(17,17,17,.04), 0 3px 8px -5px rgba(17,17,17,.12)` |
| default | `0 1px 2px rgba(17,17,17,.04), 0 6px 16px -8px rgba(17,17,17,.10)` |
| `lg` | `0 2px 4px rgba(17,17,17,.04), 0 16px 32px -12px rgba(17,17,17,.16)` |
| `xl` | `0 4px 8px rgba(17,17,17,.05), 0 28px 48px -16px rgba(17,17,17,.22)` |
| `nav` | `0 -2px 6px rgba(17,17,17,.06), 0 -12px 28px -12px rgba(17,17,17,.22)` — casts **upward** |
| `gold` | `0 1px 2px rgba(242,106,27,.22), 0 8px 18px -8px rgba(242,106,27,.52)` |

### 2.6 Motion

House easing `cubic-bezier(0.2, 0.7, 0.3, 1)`.

Durations: button 0.12s · pill 0.16s · tile and row 0.18s · segmented 0.2s ·
card press 0.22s.

Entrance: `.deal > *` rises 12px and fades over 0.5s, staggered 50ms. **The
stagger caps at 8 children** — anything past the eighth top-level section lands
together.

`.deal > header` and `.deal > .subnav` get a fade with **no transform**, because
a transform on a sticky element makes it a containing block and un-sticks the
bar.

Named animations include `fade`, `fade-rise`, `sheet-in`, `slide-in`, `breathe`,
`pop-in` (a 2% overshoot), `sweep`, `pulse`, `grow`, `float`, plus the e-puja
set: `flicker`, `petal`, `swing`, `aarti`, `halo`, `ripple`, `smoke`.

The old doc's "fades, nothing else, no bounce, no spring" is dead — `pop-in`
overshoots, `swing` oscillates, and the mandir set is deliberately lively.

---

## 3. The one-light-source rule

**This is the whole system.** Stated once in `index.css` and obeyed everywhere.

> One light source, directly above.

| State | How it is built |
|---|---|
| **Raised** | ~3% 180° gradient, light top to darker bottom · `inset 0 1px 0` specular top edge · a soft drop shadow |
| **Recessed** | The exact inverse — `inset` shade at the top, a lit bottom lip, and **no drop shadow** |
| **Pressed** | The gradient **flips** and the drop shadow collapses |

Three consequences worth stating outright:

1. **Mixing raised and recessed cues is what makes soft-UI look muddy rather than
   physical.** A surface is one or the other.
2. **A press is a change in light direction, never a change in colour.** Nothing
   darkens on tap; the gradient inverts.
3. **Grey comes from the gradient, not from lightening the token.** A flat
   mid-grey reads as paint. `#262626` graded up to `#444444` reads as dark
   material with light falling on it. Cards and the two bars are the
   exception since 30 Sep: they are flat white, Sri Mandir's paper, with no
   gradient at all.

Spheres are the one exception to the angle: circular tile faces use a 145°
gradient, because a sphere catches light off-axis.

### Both bars are white

Since 30 Sep the **tab bar is white too**, with a hairline top border — Sri
Mandir's bottom bar. It was the one slab of ink in the app. Tab labels are
`text-t3` at rest and `text-gold` when active, with the orange indicator bar
and a heavier icon stroke; those classes are in `Tab` in `Chrome.jsx`.

Both backgrounds are declared after the feature query. Source order beat
specificity once: one bar set its background before an `@supports` block and
the other after, and identical intent produced one opaque bar and one
translucent.

**Frosting goes on chrome only.** A translucent card on a flat canvas has nothing
behind it to refract and just reads as a weaker card. The tab bar's frost is
`rgba(255,255,255,0.94)` — nearly opaque, so busy imagery does not bleed
through the labels.

---

## 4. Component inventory

### Classes, in `@layer components`

**Type roles** — `.label` · `.label-c` · `.horoscope` (17px centred, 34ch) ·
`.prose-c` (15px centred, 44ch) · `.tnum` (tabular figures) · `.font-display`
(700 / −0.02em — the Tailwind utility only sets family, the *look* lives here) ·
`.caps` (12px/700/0.1em) · `.caps-sm` (11px/700/0.1em) · `.pop-btn-sm` (11px,
at least 36px tall)

**Nothing renders under 11px** since 3 Oct 2026. An audit that day counted 144
elements under 11px on Consult and Shop buttons 24px tall; every size above
went up one pixel and `text-[10px]` literals went to 11.

**Text ladder** (§2.1) — `.t-heading` · `.t-sub` · `.t-body` · `.t-faint` ·
`.gold`
**On ink** — `.on-ink` .95 · `.on-ink-sub` .72 · `.on-ink-faint` .48

**Structure** — `.section` · `.section-tight` · `.rule-b` · `.rule-t` ·
`.rule-stub`

**Surfaces** — `.pop-card` (r20) · `.pop-raised` (r24, one per screen) ·
`.pop-tap` (hover lifts 3px, press settles 1px and scales to 0.995) ·
`.pop-inset` (r14 well)

**Buttons** — `.pop-btn` (ink fill, white caps) · `.pop-btn-sm` · `.pop-btn-gold`
(the one voltage) · `.pop-btn-ghost` · disabled sits flush with the page with no
gradient at all

**Chrome** — `.topbar` · `.navbar` · `.glass-panel` · `.pill.knob`. Tab-bar icons
take a hard engraved shadow; top-bar icons take a soft lift.

**Selection** — `.seg` and `.seg-item` (recessed track, raised thumb) ·
`.pill[aria-pressed='true']` (ink fill, inset shadow, **stays down**)

**Rails and banners** — `.rail` (x-scroll with snap) · `.banner` (r20) ·
`.sheen`

`.banner` carries only the radius, shadow and press — height comes from what is
inside it. Consult's are **kicker, title, CTA**, at ~95px; they were ~197px and
were halved on 7 Sep 2026. The line that went was the descriptive `note`, which
is where most of that height lived: two lines of 13px, plus its margin. The
field is still on the banner objects, so restoring it is one span. Shop's
banners keep the taller four-part shape — halve them only on the same
instruction, not for consistency's sake.

**Tiles** — `.tile` · `.tile-face` (58px circle) · `.tile-face-on` ·
`.plinth` / `.plinth-on`, a smoked-glass 44px disc for props sitting **on the
shrine painting**, where a near-white disc would vanish. Its lit state goes gold
rather than ink, because the surround is already dark. (A white version in a bar
under the shrine was tried on 3 Oct 2026 and reverted the same day.)

**Rows and links** — `.act-row` (full-bleed, hover shifts 3px, and its trailing
arrow is drawn by CSS so no row can ship without one) · `.act-link` (gold,
underlined, 3px offset)

**Imagery** — `.grain` (fractal-noise overlay, multiply) · `.plate` (recessed
mount). Greyscale is applied to the *artwork*, not the container, so overlaid
badges keep their colour.

**Meters and badges** — `.badge-live` · `.tick` / `.tick-on` · `.deal`

### Components

| File | Exports |
|---|---|
| `Pop.jsx` | `PopCard` · `PopButton` · `Kicker` · `PopTag` · `Stat` · `PopBar` · `PopAvatar` |
| `Primitives.jsx` | `Label` · `Section` · `Stub` · `Button` · `Row` · `TextLink` · `Segmented` · `Ticks` · `Ruler` · `Avatar` · `Field` · `Acts` · `Search` · `Tag` · `firstName` |
| `Icon.jsx` | 25 hand-drawn glyphs |
| `Plate.jsx` | Procedural greyscale artwork |
| `PujaProps.jsx` | `Ghanti` · `Thali` · `Marigold` · `Diya` · `Dhoop` |
| `Chrome.jsx` | `TopBar` · `TabHeader` · `BottomNav` · `Sheet` · `Toast` |
| `ChartSquare.jsx` | `ChartNorth` |
| `ReelFeed.jsx` | |

**There is one chart form, and it is the North Indian square** — decided
7 Sep 2026. A South Indian square and a Western wheel used to sit beside it
behind a switcher; `ChartWheel.jsx` is deleted and `ChartSouth` is gone from
`ChartSquare.jsx`. The wheel because the product is Vedic-first
(`01-PRD.md` §10) and a tropical diagram invites reading a tropical sign off a
Lahiri chart; the square because a second Indian form was a preference to keep
in step across screens rather than anything anybody asked for. **Reinstating
either is a product decision, not a revert.**

In the North Indian square the twelve **houses** are fixed to the page — house 1
is the top diamond, the rest run anticlockwise — and what moves is the sign, so
each compartment carries a sign *number*. It draws its empty frame when `houses`
is null, which is both while the chart loads and when the birth time is
unknown.

**Read `index.css` before writing markup.** Most of what a new screen needs
already exists.

---

## 5. Affordances

**Three interactive shapes, and nothing else is tappable.** The reference
design's most-cited failure was that some links were underlined, some were caps,
some were bare text, and nothing said which could be tapped.

| Shape | Means |
|---|---|
| `<Button>` | Commits to something |
| `<Row>` | Navigates somewhere |
| `<TextLink>` | Navigates from inside a sentence |

If an element wears none of these, it is text and does nothing.

**`.act-btn` no longer exists.** `Button` borrows `pop-btn` instead — one button
look in the app, two layouts of it, rather than a parallel class set kept alive
in sympathy.

`<Acts>` is the fourth, **non-navigational** shape — like, save, share, reply,
follow. Nothing in an `Acts` row moves you to another screen, so it cannot be
mistaken for a `Row`. It is icon-based, with filled states for heart and
bookmark, and only its transform is transitioned: **the colour arrives
instantly, on purpose.**

### Selection is a physical state, not a colour

Pills, segmented items and tile faces **stay pressed**. Nothing gets a tint.
This is one mechanic across every selector in the app, and it replaces the old
doc's "tracked caps with a 1px underline on the active item".

---

## 6. Icons

**25 hand-drawn glyphs. There is no icon library and one is not wanted.**

One geometry for all: a 24-unit box with ~2 units of optical margin,
`currentColor` stroke, no fill unless explicitly filled, round caps and joins.

**State is shown by thickening the stroke** — 1.6 at rest, 2.1 active — not by
maintaining a second filled set. Only heart and bookmark have a filled variant.

**An unknown name renders nothing.** A missing glyph is a silent blank, not a
crash.

---

## 7. Imagery

### Generated, by default

`Plate.jsx` draws greyscale SVG procedurally from a seed string: a deterministic
hash picks one of four variants — orbital rings, engraved hatching, a halftone
grid, or contour loops — and drives every parameter, so the same ID always yields
the same plate. Strokes use the text token, so artwork re-tints with the theme.

Used by four of the five tarot decks and by every card and course cover.

`PujaProps.jsx` draws the mandir's brass as **modelled objects rather than
icons** — a line glyph on a shrine reads as a toolbar. They share one brass ramp
and one light direction, because a bell lit from the left beside a thali lit from
above is what makes drawn props look pasted on.

Every gradient ID goes through `useId`. These render two and three at a time, and
duplicate IDs mean the second instance silently borrows the first's fill.

### Photographs, in exactly two places

| Where | What | Weight |
|---|---|---|
| `public/cards/` | 48 Bhaktamar deck faces, 600×900 | 5.8 MB |
| `public/deities/` | 26 murtis, 3–4 per deity, up to 840×1260 | 3.6 MB |

Both are **referenced by filename, never imported**, so they stay out of the
bundle graph and only the one on screen is fetched. That property must survive
any move to remote storage.

### The shrine box

**420 × (device height − 200).** The 200 is measured — header, deity row, tab bar
— not estimated, and it puts the box between 0.574 on a tall Android and 0.899 on
a small iPhone.

No single aspect ratio fits all of them, so the murti is `object-cover` at
`object-position: 50% 32%`: it fills exactly, never bars, and the trim comes off
marble floor rather than off the crown.

**Supply art at 2:3.** It lands mid-range and costs 2–13% on any current phone.
Keep the figure inside the middle 74% of the width and between 8% and 80% of the
height and it survives every device.

### Attribution is not decoration

Murti attribution is three fields — artist, licence, source — rendered by a
single helper. Of the 26 murtis, **four are CC BY and three are share-alike**, and
the processing script produces derivatives that inherit the obligation.

The shrine itself carries no text, so **the murti picker is the only place the
credit appears.** If that sheet goes, the images have to go with it.

---

## 8. Language

English and Hindi, toggled in the store, which also sets the document language.
The choice is offered on the first screen of sign-up and remembered on the
device (`localStorage` `namo:lang`); before 3 Oct it reset to English on every
reload. Interface strings live in `src/data/i18n.js`; a key missing in Hindi
falls back to English rather than showing the key.

**What is translated** (3 Oct 2026, about 400 keys): the tab bar, sign-up,
Home (all three tabs), Horoscope and the reading layout Chart shares, Profile,
Consult, Shop, Academy, Matching, Muhurat, Namo AI, Premium, Orders, Wallet,
Tarot. Sign names use the `sign.*` keys; the English name is still what goes
to the API. **What is not:** anything from the API or `mock.js` (readings,
product and consultant names, categories, dates), aria-labels, and the
consultant app.

**Content carries its own twin** rather than going through the interface
dictionary — deity names, tarot traditions and similar hold both forms as data.
Only genuinely interface-level strings are keyed.

**Sanskrit is never translated.** The Devanagari verse is scripture, the IAST
line is its transliteration, and the English rendering sits alongside as a gloss —
never as a replacement, and never regenerated to match the house voice.

Two of the 48 Bhaktamar verses are currently incomplete and are flagged as such
in the data rather than reconstructed. A plausible wrong shloka is undetectable
to the person it misleads.

---

## 9. Accessibility

### Present

- `:focus-visible` outlines globally, in gold, with offset. The search field uses
  a border treatment instead of an outline.
- `prefers-reduced-motion` collapses every animation and transition to ~0ms.
- `prefers-reduced-transparency` reverts all three chrome surfaces to solid
  fills. **All frosting sits inside a feature query with an opaque default**,
  because the failure mode of transparency without blur is unreadable chrome.
- Contrast ratios documented per token, **with the surface named**, and the
  2.6:1 grey explicitly fenced to non-text marks.
- ARIA throughout: `aria-selected` on tabs, `aria-pressed` on pills and toggles,
  `aria-label` on every icon-only control, `aria-hidden` plus `focusable="false"`
  on every decorative glyph. Active nav state comes free from the router.
- Tap targets: nav rows ~57px, knobs 36px, plinths 44px.
- The tab bar's active state was measured and designed around — gold caps on that
  surface come to 2.8:1, so the active signal is the indicator bar and the icon
  stroke weight, and **both label states stay bright enough to read.**

### Absent

**There is no high-contrast toggle.** The old design doc claimed one, and
`tailwind.config.js` still carries a comment saying colours resolve through
variables "so the high-contrast accessibility mode can re-point them at runtime".

**The mechanism is in place. The mode is not.** No attribute is set anywhere, and
no control exists. Either build it or delete the comment; leaving both is how the
next reader concludes it works.

---

## 10. Voice

Second person, present tense, imperative where possible. Short declarative
sentences. No hedging, no emoji, no exclamation marks. Blunt rather than
reassuring, ranging from practical to cryptic.

> *"A stone does not fix a transit. It is a reminder you paid for."*

The rules are restated at the top of `src/data/mock.js`, where the copy lives.

**The tension between a cold system and a personal callout is the whole
product.** Warm, supportive horoscope copy over this design would make it read as
a template. Documentation in this repo matches the same voice.

---

## 11. Traps

Nine that have already cost time.

1. **A green build proves almost nothing.** An undefined identifier inside JSX is
   a runtime error, not a compile error. It has shipped a blank screen once and
   silently dropped an import once. **Always load the app and walk the routes.**

   `npm run lint` now catches the two forms that are pure oversight —
   an identifier that was never defined, and an import of a name the other
   module no longer exports. The second is the expensive one: imports are
   evaluated at module load, so a single stale name in a single screen white-
   screens **every** route, onboarding included. Lint does not replace the
   walk; it removes the errors not worth a browser to find.
2. **Tailwind cannot see runtime-built class names.** Anything interpolated
   produces a class that is never generated. Anything that varies goes in inline
   `style`.
3. ~~**Tailwind's opacity modifier silently does nothing on this palette.**~~
   **Fixed, 7 Sep 2026.** It used to emit nothing: the modifier rewrites a
   colour into `rgb(<channels> / <alpha>)`, which needs the token to be
   channels, and every token here holds a whole colour like `#a85400`. The
   result was invalid and the utility was dropped from the stylesheet without
   an error. Every translucent surface had to be an inline literal `rgba()`.

   `tailwind.config.js` wraps each token in `color-mix()`, which takes a whole
   colour rather than channels, so the tokens stay hex, every raw `var(--gold)`
   in `index.css` keeps working, and `bg-gold/10` is live on all of them.
   Inline `rgba()` is no longer needed and new markup should not use it.
4. **Scripted multi-edit passes corrupt files.** A sequence of index-based
   splices once duplicated half a screen. Beyond one or two replacements, rewrite
   the block.
5. **Say which surface a contrast number belongs to.** See §2.1.
6. **CSS source order beat specificity once.** See §3.
7. **The entrance stagger caps at 8 children.**
8. **`setPointerCapture` throws when the pointer is not active, and it takes the
   whole gesture with it.** Both mandir gestures once had the capture call ahead
   of the state it depended on, so one throw left the swipe with no origin and
   the thali unable to turn — silently. **Record first, capture second, and wrap
   it.**
9. **Display strings are not numbers.** Follower and view counts are formatted
   strings in the mock. Do not parse them back to chart them.

---

## 12. Deliberate dead code

**`.subnav` is intentionally unused.** Consult's modes used to live in a bar
pinned above the tab bar; they are circles at the top now. The CSS stays so
reverting is a markup change. **Do not clean it up without asking.**

One genuine offcut: a class applied in two avatar components is not defined
anywhere. Harmless — the utilities beside it carry the look — but it is a no-op.

---

## 13. The admin console does not inherit this

A 420px phone frame of skeuomorphic tiles is the wrong instrument for a desktop
console showing 2,000-row tables with filters, sorting and bulk actions.

Admin should share the **palette and the type stack** so the two products look
related, and share nothing else. Dense table styling, compact controls and
multi-column layouts are a different set of problems, and forcing `pop-card`
around a data grid would produce something worse than either.

---

## Appendix — where this came from

The system is a light reading of CRED's NeoPOP. What was taken:

- **The text opacity ladder** — one ink, stepped by opacity, rather than a set of
  grey tokens. Shipped here at .95 / .74 / .60 / .45.
- **CAPS as the signature** for every label, tag, kicker and button string.
- **One voltage per screen** — spent on gold until 20 Sep 2026, on orange since.
- **Press travel of ~0.12s**, with the press as a physical event.

What was explicitly rejected:

- **Universal zero radius.** This build's radius scale starts at 8px.
- **The neon voltage palette.** One warm gold instead.
- **Zero-blur block shadows.** This build is entirely soft blurred elevation with
  a single light source, which is a different physics and the two do not mix.
