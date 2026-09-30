/**
 * Sri Mandir token set (30 Sep 2026; it replaced the CRED-light navy set).
 *
 * Three rules encoded here rather than left to discipline:
 *   1. Orange and white, green for buttons. A light grey page, white cards, a
 *      charcoal ink and one saffron voltage. The green lives only on
 *      `.pop-btn` in index.css. Colour beyond that is reachable only through
 *      the banner gradients.
 *   2. Radius is the default, not the exception — the scale starts at 8px and
 *      `rounded-full` actually rounds.
 *   3. Elevation is a soft shadow tuned to the ink, never a generic black
 *      blur. Every level is listed; nothing invents its own.
 *
 * Colours resolve through CSS variables (declared in index.css) so the
 * high-contrast accessibility mode can re-point them at runtime.
 *
 * They are wrapped in `alpha()` below, and that wrapper is the whole reason
 * `bg-gold/10` works here. Tailwind's opacity modifier rewrites a colour into
 * `rgb(<channels> / <alpha>)`, which needs the token to BE channels — a token
 * holding `#a85400` produces `rgb(#a85400 / 0.1)`, invalid, and the utility is
 * dropped from the stylesheet silently. Every translucent class in this app
 * used to emit nothing and had to be written as a literal inline `rgba()`.
 * `color-mix()` takes a whole colour rather than channels, so the hex tokens
 * stay hex, every raw `var(--gold)` in index.css keeps working, and the
 * modifier is live on all of them.
 *
 * @type {import('tailwindcss').Config}
 */
/**
 * A theme colour that honours `/opacity`. With no modifier Tailwind
 * substitutes `1`, so `bg-ink` is the flat colour and `bg-ink/40` is 40% of
 * it. Works on hex, rgb() and rgba() tokens alike — `--stroke` is already
 * translucent, and mixing toward transparent scales the alpha it has.
 */
const alpha = (v) => `color-mix(in srgb, ${v} calc(<alpha-value> * 100%), transparent)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // `colors` is REPLACED, not extended — Tailwind's default palette is gone.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: alpha('#000000'),
      white: alpha('#FFFFFF'),
      bg: alpha('var(--bg)'),
      surface: alpha('var(--surface)'),
      surface2: alpha('var(--surface-2)'),
      stroke: alpha('var(--stroke)'),
      t1: alpha('var(--text)'),
      t2: alpha('var(--text-2)'),
      t3: alpha('var(--text-3)'),
      t4: alpha('var(--text-4)'), // non-text only: ticks, spokes, placeholders
      rule: alpha('var(--rule)'),
      // The single voltage accent. NeoPOP allows one per screen; this app
      // spends it on gold to keep the astrology identity.
      gold: alpha('var(--gold)'),
      'gold-fill': alpha('var(--gold-fill)'), // background only — never small text
      'gold-dim': alpha('var(--gold-dim)'),
      'gold-wash': alpha('var(--gold-wash)'),
      live: alpha('var(--live)'),
      ok: alpha('var(--ok)'),
      // The grey-black. Bottom bar, primary CTA, raised Live button.
      ink: alpha('var(--ink)'),
      ink2: alpha('var(--ink-2)'),
    },
    borderRadius: {
      none: '0',
      sm: '8px',
      DEFAULT: '12px',
      md: '12px',
      lg: '16px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '28px',
      full: '9999px',
    },
    // Neutral and faint. Since 30 Sep the ink is a charcoal rather than navy,
    // so the shadow is a near-black at low alpha — the flat, white-card look
    // of Sri Mandir, where a card is lifted by a whisper, not a slab of blur.
    boxShadow: {
      none: 'none',
      sm: '0 1px 2px rgba(17,17,17,0.04), 0 3px 8px -5px rgba(17,17,17,0.12)',
      DEFAULT: '0 1px 2px rgba(17,17,17,0.04), 0 6px 16px -8px rgba(17,17,17,0.10)',
      md: '0 1px 2px rgba(17,17,17,0.04), 0 6px 16px -8px rgba(17,17,17,0.10)',
      lg: '0 2px 4px rgba(17,17,17,0.04), 0 16px 32px -12px rgba(17,17,17,0.16)',
      xl: '0 4px 8px rgba(17,17,17,0.05), 0 28px 48px -16px rgba(17,17,17,0.22)',
      // Cast upward — the bottom bar throws its shadow onto the content above.
      nav: '0 -2px 6px rgba(17,17,17,0.06), 0 -12px 28px -12px rgba(17,17,17,0.22)',
      gold: '0 1px 2px rgba(242,106,27,0.22), 0 8px 18px -8px rgba(242,106,27,0.52)',
    },
    extend: {
      fontFamily: {
        // ONE family, Poppins, since 30 Sep (it replaced Plus Jakarta Sans to
        // match Sri Mandir's rounded geometric sans). Hierarchy comes from
        // weight, size and case. `display` and `mono` stay mapped to it so the
        // existing `font-display` call sites keep working; the weight rule in
        // index.css is what makes a display heading one.
        // Poppins carries Devanagari itself, so Hindi and English set in one
        // face. Noto stays behind it as the fallback for any glyph it lacks.
        sans: [
          'Poppins',
          '"Noto Sans Devanagari"',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'sans-serif',
        ],
        display: [
          'Poppins',
          '"Noto Sans Devanagari"',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['Poppins', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // Named to the role, so a screen cannot invent a nineteenth size.
        // Poppins is wide and round; the tight negative tracking Jakarta
        // needed crushes it, so text sizes set at zero and only display
        // sizes pull in, and by half as much.
        micro: ['10px', { lineHeight: '1.3', letterSpacing: '0.08em' }],
        label: ['11px', { lineHeight: '1.3', letterSpacing: '0.06em' }],
        meta: ['13px', { lineHeight: '1.5', letterSpacing: '0' }],
        body: ['15px', { lineHeight: '1.6', letterSpacing: '0' }],
        read: ['17px', { lineHeight: '1.6', letterSpacing: '0' }],
        lead: ['20px', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        title: ['26px', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
        display: ['34px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        huge: ['44px', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
      },
      letterSpacing: {
        label: '0.10em',
        caps: '0.18em',
      },
      spacing: {
        // 8pt grid, extended into the unusually large vertical gaps the layout
        // leans on (32 / 40 / 48 / 56).
        13: '3.25rem',
        18: '4.5rem',
      },
      maxWidth: {
        measure: '34ch',
        prose2: '44ch',
      },
      keyframes: {
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-in': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.85' },
        },
        // Lands with a settle rather than a snap. The overshoot is 2%, which
        // is enough to read as physical and small enough not to look bouncy.
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.94) translateY(10px)' },
          '70%': { opacity: '1', transform: 'scale(1.02) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        // Diagonal sheen across a banner gradient. One pass, long pause.
        sweep: {
          '0%': { transform: 'translateX(-150%) skewX(-16deg)' },
          '50%, 100%': { transform: 'translateX(320%) skewX(-16deg)' },
        },
        // The live dot, and anything else that needs a heartbeat.
        pulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        // A meter or bar drawing itself in from the left.
        grow: {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        // The same, for anything that fills upward — ruler ticks, bar charts.
        'grow-y': {
          '0%': { transform: 'scaleY(0)' },
          '100%': { transform: 'scaleY(1)' },
        },
        /* ── E-puja ────────────────────────────────────────────────────
           A shrine is the one place in this app where motion is the point
           rather than the polish, so these are livelier than the rest. */
        // A flame does not pulse evenly — it leans, narrows, and recovers.
        flicker: {
          '0%, 100%': { transform: 'scaleY(1) scaleX(1) translateX(0)', opacity: '1' },
          '25%': { transform: 'scaleY(1.14) scaleX(0.94) translateX(-0.4px)', opacity: '0.92' },
          '50%': { transform: 'scaleY(0.92) scaleX(1.06) translateX(0.5px)', opacity: '1' },
          '75%': { transform: 'scaleY(1.08) scaleX(0.97) translateX(0.2px)', opacity: '0.95' },
        },
        // Petals do not drop straight down; they slip sideways and turn over.
        petal: {
          '0%': { transform: 'translateY(-12%) translateX(0) rotate(0deg)', opacity: '0' },
          '10%': { opacity: '1' },
          '100%': { transform: 'translateY(360%) translateX(18px) rotate(220deg)', opacity: '0' },
        },
        swing: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '15%': { transform: 'rotate(13deg)' },
          '35%': { transform: 'rotate(-10deg)' },
          '55%': { transform: 'rotate(6deg)' },
          '75%': { transform: 'rotate(-3deg)' },
        },
        // The aarti lamp travels the traditional circle in front of the idol.
        aarti: {
          '0%': { transform: 'rotate(0deg) translateX(34px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(34px) rotate(-360deg)' },
        },
        halo: {
          '0%, 100%': { opacity: '0.25', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.06)' },
        },
        // One expanding ring when an offering lands.
        ripple: {
          '0%': { transform: 'scale(0.6)', opacity: '0.55' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        smoke: {
          '0%': { transform: 'translateY(0) scaleX(1)', opacity: '0' },
          '20%': { opacity: '0.5' },
          '100%': { transform: 'translateY(-38px) scaleX(2.2)', opacity: '0' },
        },

        // Slow vertical drift for the decorative art inside banners.
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        fade: 'fade 0.4s ease-out both',
        'fade-slow': 'fade 0.9s ease-out both',
        'fade-rise': 'fade-rise 0.5s cubic-bezier(.2,.7,.3,1) both',
        'sheet-in': 'sheet-in 0.34s cubic-bezier(.2,.7,.3,1) both',
        'slide-in': 'slide-in 0.24s cubic-bezier(.2,.7,.3,1) both',
        breathe: 'breathe 3.2s ease-in-out infinite',
        'pop-in': 'pop-in 0.46s cubic-bezier(.2,.7,.3,1) both',
        sweep: 'sweep 6s linear infinite',
        pulse: 'pulse 1.8s ease-in-out infinite',
        grow: 'grow 0.7s cubic-bezier(.2,.7,.3,1) both',
        'grow-y': 'grow-y 0.5s cubic-bezier(.2,.7,.3,1) both',
        float: 'float 5s ease-in-out infinite',
        flicker: 'flicker 1.1s ease-in-out infinite',
        petal: 'petal 3.4s linear forwards',
        swing: 'swing 1.4s ease-out',
        aarti: 'aarti 2.6s linear infinite',
        halo: 'halo 3s ease-in-out infinite',
        ripple: 'ripple 0.9s ease-out forwards',
        smoke: 'smoke 3.6s ease-out infinite',
      },
    },
  },
  plugins: [],
}
