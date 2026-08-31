/**
 * CRED-light token set.
 *
 * Three rules encoded here rather than left to discipline:
 *   1. Near-neutral. A warm canvas, white surfaces, a grey-black ink and one
 *      gold voltage. Colour beyond that is reachable only through the banner
 *      gradients, which are named below and nowhere else.
 *   2. Radius is the default, not the exception — the scale starts at 8px and
 *      `rounded-full` actually rounds.
 *   3. Elevation is a soft shadow tuned to the ink, never a generic black
 *      blur. Every level is listed; nothing invents its own.
 *
 * Colours resolve through CSS variables (declared in index.css) so the
 * high-contrast accessibility mode can re-point them at runtime.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // `colors` is REPLACED, not extended — Tailwind's default palette is gone.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      black: '#000000',
      white: '#FFFFFF',
      bg: 'var(--bg)',
      surface: 'var(--surface)',
      surface2: 'var(--surface-2)',
      stroke: 'var(--stroke)',
      t1: 'var(--text)',
      t2: 'var(--text-2)',
      t3: 'var(--text-3)',
      t4: 'var(--text-4)', // non-text only: ticks, spokes, placeholders
      rule: 'var(--rule)',
      // The single voltage accent. NeoPOP allows one per screen; this app
      // spends it on gold to keep the astrology identity.
      gold: 'var(--gold)',
      'gold-fill': 'var(--gold-fill)', // background only — never small text
      'gold-dim': 'var(--gold-dim)',
      'gold-wash': 'var(--gold-wash)',
      live: 'var(--live)',
      ok: 'var(--ok)',
      // The grey-black. Bottom bar, primary CTA, raised Live button.
      ink: 'var(--ink)',
      ink2: 'var(--ink-2)',
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
    // Tuned to the ink, not to pure black — a #000 blur on a warm canvas goes
    // grey and muddy, which is what makes most light UIs look unfinished.
    boxShadow: {
      none: 'none',
      sm: '0 1px 2px rgba(15,14,14,0.04), 0 3px 8px -5px rgba(15,14,14,0.12)',
      DEFAULT: '0 1px 2px rgba(15,14,14,0.04), 0 6px 16px -8px rgba(15,14,14,0.10)',
      md: '0 1px 2px rgba(15,14,14,0.04), 0 6px 16px -8px rgba(15,14,14,0.10)',
      lg: '0 2px 4px rgba(15,14,14,0.04), 0 16px 32px -12px rgba(15,14,14,0.16)',
      xl: '0 4px 8px rgba(15,14,14,0.05), 0 28px 48px -16px rgba(15,14,14,0.22)',
      // Cast upward — the bottom bar throws its shadow onto the content above.
      nav: '0 -2px 6px rgba(15,14,14,0.06), 0 -12px 28px -12px rgba(15,14,14,0.22)',
      gold: '0 1px 2px rgba(111,74,12,0.22), 0 8px 18px -8px rgba(111,74,12,0.52)',
    },
    extend: {
      fontFamily: {
        // ONE family. CRED sets its whole interface in a single geometric sans
        // and gets hierarchy from weight, size and case — no serif anywhere,
        // and no separate mono. `display` and `mono` stay mapped to it so the
        // existing `font-display` call sites keep working; what makes a
        // display heading a display heading is the weight rule in index.css.
        // Devanagari sits *after* Jakarta on purpose: a browser walks the
        // stack per glyph, so Latin keeps Jakarta and only Indic characters
        // fall through to Noto. Reversing these two would restyle the whole
        // English UI.
        sans: [
          '"Plus Jakarta Sans"',
          '"Noto Sans Devanagari"',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'sans-serif',
        ],
        display: [
          '"Plus Jakarta Sans"',
          '"Noto Sans Devanagari"',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['"Plus Jakarta Sans"', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        // Named to the role, so a screen cannot invent a nineteenth size.
        // A geometric sans needs the negative tracking pulled in harder than a
        // serif did — it sets loose by default at display sizes.
        micro: ['10px', { lineHeight: '1.3', letterSpacing: '0.1em' }],
        label: ['11px', { lineHeight: '1.3', letterSpacing: '0.08em' }],
        meta: ['13px', { lineHeight: '1.45', letterSpacing: '-0.005em' }],
        body: ['15px', { lineHeight: '1.6', letterSpacing: '-0.01em' }],
        read: ['17px', { lineHeight: '1.6', letterSpacing: '-0.011em' }],
        lead: ['20px', { lineHeight: '1.35', letterSpacing: '-0.02em' }],
        title: ['26px', { lineHeight: '1.2', letterSpacing: '-0.03em' }],
        display: ['34px', { lineHeight: '1.1', letterSpacing: '-0.035em' }],
        huge: ['44px', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
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
