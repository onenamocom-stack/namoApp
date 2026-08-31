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

A warm off-white canvas, white cards, near-black ink, one gold accent, and
**skeuomorphic surfaces lit from directly above.** Rounded, physical, tactile —
buttons that depress, switches that stay down, wells that recess.

---

## 2. Tokens

### 2.1 Colour

Declared as CSS custom properties on `:root`. **Tailwind's default palette is
replaced, not extended** — apart from `transparent`, `current`, `black` and
`white`, no other colour is reachable from a class name.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#f1efec` | Page canvas. Also the browser theme colour |
| `--surface` | `#ffffff` | Card |
| `--surface-2` | `#f7f5f2` | A block inside a card — inputs, inner tiles |
| `--stroke` | `rgba(15,14,14,0.07)` | Hairline on a raised surface |
| `--rule` | `#e4e0da` | Divider on the page itself |
| `--ink` | `#0e0e10` | Tab bar, primary button |
| `--ink-2` | `#1a1a1d` | A block sitting on ink |
| `--ink-lit` | `#232327` | The lit top of an ink gradient |
| `--hi` | `rgba(255,255,255,0.9)` | Specular highlight, light surface |
| `--hi-ink` | `rgba(255,255,255,0.12)` | Specular highlight, dark surface |
| `--lo` | `rgba(14,14,16,0.1)` | Shade under a lip |
| `--live` | `#cf3a25` | Live badge, liked heart, unread dot |
| `--ok` | `#0b8b50` | Online dot |

**Text ladder**, with the contrast ratio *and the surface it was measured
against*:

| Token | Value | On canvas | Use |
|---|---|---|---|
| `--text` | `#0f0e0e` | 17.2:1 | Headings |
| `--text-2` | `#4e4a46` | 8.1:1 | Body |
| `--text-3` | `#6b665f` | 5.1:1 | The readable floor |
| `--text-4` | `#a5a09a` | 2.6:1 | **Non-text only** — ticks, rules, spokes, placeholders |

**Gold**, which is the only accent and appears on two surfaces:

| Token | Value | Note |
|---|---|---|
| `--gold` | `#8f6210` | Text and borders. **4.7:1 on canvas, 5.4:1 on a card** |
| `--gold-fill` | `#d29a2b` | **Backgrounds only.** Ink on it is 7.7:1 |
| `--gold-dim` | `#6f4a0c` | |
| `--gold-wash` | `rgba(210,154,43,0.18)` | |

Two rules that survive from the old design doc and still hold:

1. **Greys are derived against the actual canvas, never arithmetically
   inverted.** The same hex does not hold the same ratio on two backgrounds, and
   flipping a dark set would have quietly dropped body text below AA.
2. **A contrast number must name its surface.** `--gold` once carried the note
   "4.9:1 on canvas". That was its ratio against a white *card*; on the canvas it
   was 4.29:1, under AA — and gold text appears on both.

### 2.2 Type

**Plus Jakarta Sans** (300–800) and **Noto Sans Devanagari** (400–700), one font
request. No Inter, no serif, no mono — `sans`, `display` and `mono` all resolve
to the same stack.

**Devanagari sits *after* Jakarta in the stack, deliberately.** The browser walks
the stack per glyph, so Latin stays Jakarta and only Indic falls through. Putting
Devanagari first would restyle every Latin character it happens to cover.

Nine named sizes, so a screen cannot invent a tenth:

| Token | px | Line height | Tracking |
|---|---|---|---|
| `micro` | 10 | 1.3 | 0.1em |
| `label` | 11 | 1.3 | 0.08em |
| `meta` | 13 | 1.45 | −0.005em |
| `body` | 15 | 1.6 | −0.01em |
| `read` | 17 | 1.6 | −0.011em |
| `lead` | 20 | 1.35 | −0.02em |
| `title` | 26 | 1.2 | −0.03em |
| `display` | 34 | 1.1 | −0.035em |
| `huge` | 44 | 1.05 | −0.04em |

Tracking tokens: `label` 0.10em, `caps` 0.18em.
Measures: `measure` 34ch, `prose2` 44ch.

**Weight is a primary hierarchy lever** — caps labels are 700, display type is
800, the active tab is extrabold. The old doc's "hierarchy almost never from
weight" is dead.

### 2.3 Spacing

8pt grid. **Exactly two section paddings exist**: `.section` at 32px/20px and
`.section-tight` at 20px/20px. Nothing else sets section padding.

### 2.4 Radius

`sm` 8 · default 12 · `lg` 16 · `xl` 20 · `2xl` 24 · `3xl` 28 · `full` 9999.

In practice: card 20, raised tile 24, inset well 14, button 12 (small 10), plate
16, top bar bottom corners 18, tab bar top corners 32, and pills, tiles and
segmented controls fully round.

### 2.5 Elevation

Every shadow is tuned to the **ink**, `rgba(15,14,14,…)`, never pure black — a
`#000` blur on a warm canvas goes muddy.

| Name | Value |
|---|---|
| `sm` | `0 1px 2px rgba(15,14,14,.04), 0 3px 8px -5px rgba(15,14,14,.12)` |
| default | `0 1px 2px rgba(15,14,14,.04), 0 6px 16px -8px rgba(15,14,14,.10)` |
| `lg` | `0 2px 4px rgba(15,14,14,.04), 0 16px 32px -12px rgba(15,14,14,.16)` |
| `xl` | `0 4px 8px rgba(15,14,14,.05), 0 28px 48px -16px rgba(15,14,14,.22)` |
| `nav` | `0 -2px 6px rgba(15,14,14,.06), 0 -12px 28px -12px rgba(15,14,14,.22)` — casts **upward** |
| `gold` | `0 1px 2px rgba(111,74,12,.22), 0 8px 18px -8px rgba(111,74,12,.52)` |

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
   mid-grey reads as paint. `#0e0e10` graded up to `#232327` reads as dark
   material with light falling on it.

Spheres are the one exception to the angle: circular tile faces use a 145°
gradient, because a sphere catches light off-axis.

### The two bars are different materials, deliberately

The **top bar is white and continuous with the page** — which means it needs no
scoped text overrides, a whole block of CSS that stops existing.

The **tab bar is the only slab of ink in the app**, and it is what anchors a pale
canvas.

Both backgrounds are declared together, after the feature query. Source order
beat specificity once: one bar set its background before an `@supports` block and
the other after, and identical intent produced one opaque bar and one
translucent.

**Frosting goes on chrome only.** A translucent card on a flat canvas has nothing
behind it to refract and just reads as a weaker card. The tab bar's frost is
`rgba(14,14,16,0.9)` — not 0.72, which composited to mid-grey.

---

## 4. Component inventory

### Classes, in `@layer components`

**Type roles** — `.label` · `.label-c` · `.horoscope` (17px centred, 34ch) ·
`.prose-c` (15px centred, 44ch) · `.tnum` (tabular figures) · `.font-display`
(800 / −0.035em — the Tailwind utility only sets family, the *look* lives here) ·
`.caps` (11px/700/0.1em) · `.caps-sm` (10px/700/0.1em)

**Ink ladder**, opacity rather than extra colours — `.t-heading` .95 · `.t-sub`
.74 · `.t-body` .60 · `.t-faint` .45 · `.gold`
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

**Tiles** — `.tile` · `.tile-face` (58px circle) · `.tile-face-on` ·
`.plinth` / `.plinth-on`, a smoked-glass 44px disc for props sitting **on the
shrine painting**, where a near-white disc would vanish. Its lit state goes gold
rather than ink, because the surround is already dark.

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
| `ChartWheel.jsx` · `ReelFeed.jsx` | |

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
2. **Tailwind cannot see runtime-built class names.** Anything interpolated
   produces a class that is never generated. Anything that varies goes in inline
   `style`.
3. **Tailwind's opacity modifier silently does nothing on this palette.** Every
   colour resolves through a variable, so a modifier cannot be computed and
   Tailwind emits **no background at all** rather than failing. Anything
   translucent needs an inline literal `rgba()`.
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
- **One voltage per screen**, spent on gold.
- **Press travel of ~0.12s**, with the press as a physical event.

What was explicitly rejected:

- **Universal zero radius.** This build's radius scale starts at 8px.
- **The neon voltage palette.** One warm gold instead.
- **Zero-blur block shadows.** This build is entirely soft blurred elevation with
  a single light source, which is a different physics and the two do not mix.
