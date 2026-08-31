/* ═══════════════════════════════════════════════════════════════════════════
   Icons.

   Twenty-one glyphs, drawn here rather than pulled from a library. An icon set
   is a dependency, a bundle and a house style someone else picked; a path each
   is cheaper and they can be tuned to this app's stroke weight.

   All of them share one geometry so they sit together in a row: a 24 unit
   box, a ~2 unit optical margin, round caps and joins, and colour inherited
   from the parent. Weight is the only thing a caller varies — the active tab
   thickens rather than changing colour, which is how a line set shows state
   without needing a second filled set.
   ═══════════════════════════════════════════════════════════════════════════ */

const PATHS = {
  home: (
    <>
      <path d="M3.4 10.7 12 3.9l8.6 6.8" />
      <path d="M5.9 9.5v9.7a1.4 1.4 0 0 0 1.4 1.4h9.4a1.4 1.4 0 0 0 1.4-1.4V9.5" />
    </>
  ),
  consult: (
    <>
      <circle cx="9.4" cy="8.4" r="3.3" />
      <path d="M3.6 20.3a5.9 5.9 0 0 1 11.7 0" />
      <path d="M16.4 5.9a3.1 3.1 0 0 1 0 5.9" />
      <path d="M17.8 14.4a5.7 5.7 0 0 1 2.8 5.9" />
    </>
  ),
  /* Broadcast — a source with two pairs of arcs leaving it. */
  live: (
    <>
      <circle cx="12" cy="12" r="2.3" />
      <path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4" />
      <path d="M15.7 15.7a5.2 5.2 0 0 0 0-7.4" />
      <path d="M5.5 5.5a9.2 9.2 0 0 0 0 13" />
      <path d="M18.5 18.5a9.2 9.2 0 0 0 0-13" />
    </>
  ),
  academy: (
    <>
      <path d="M12 4 2.6 8.5 12 13l9.4-4.5L12 4Z" />
      <path d="M6.8 10.6v5c0 1.9 2.3 3.3 5.2 3.3s5.2-1.4 5.2-3.3v-5" />
      <path d="M21.4 8.5v5.2" />
    </>
  ),
  shop: (
    <>
      <path d="M5.4 8h13.2l-.9 11.9a1.4 1.4 0 0 1-1.4 1.3H7.7a1.4 1.4 0 0 1-1.4-1.3L5.4 8Z" />
      <path d="M9 10.3V7a3 3 0 0 1 6 0v3.3" />
    </>
  ),
  /* The daily reading. A sun, because the app's subject is the sky. */
  horoscope: (
    <>
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.6v2M12 19.4v2M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.6 12h2M19.4 12h2M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5" />
    </>
  ),
  chat: <path d="M20.4 11.5c0 4-3.8 7.3-8.4 7.3a9.7 9.7 0 0 1-2.6-.35L4.6 20.4l1.3-3.6a6.9 6.9 0 0 1-2.3-5.3c0-4 3.8-7.3 8.4-7.3s8.4 3.3 8.4 7.3Z" />,
  /* The feed actions. Heart and bookmark are the two that take a filled
     state — a stroke going solid is the clearest "this is now on" a line set
     can manage without a second icon. */
  heart: <path d="M12 20.4S4.5 15.7 4.5 10.6a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.1-7.5 9.8-7.5 9.8Z" />,
  share: (
    <>
      <path d="M21 3.4 10.4 14" />
      <path d="M21 3.4 14.3 21.1l-3.9-7.4-7.4-3.9L21 3.4Z" />
    </>
  ),
  bookmark: <path d="M6.5 3.9h11a.9.9 0 0 1 .9.9v15.4L12 16.3l-6.4 3.9V4.8a.9.9 0 0 1 .9-.9Z" />,
  /* Reaching a person. Call sits beside message everywhere one appears. */
  phone: <path d="M7.3 3.6h3.2l1.6 4-2 1.2a11.4 11.4 0 0 0 5.1 5.1l1.2-2 4 1.6v3.2a1.8 1.8 0 0 1-2 1.8A16.5 16.5 0 0 1 5.5 5.6a1.8 1.8 0 0 1 1.8-2Z" />,
  bell: (
    <>
      <path d="M18 8.7a6 6 0 1 0-12 0c0 5.3-2 6.9-2 6.9h16s-2-1.6-2-6.9Z" />
      <path d="M13.7 19.3a2 2 0 0 1-3.4 0" />
    </>
  ),
  /* The four things the Consult tab opens with. */
  reports: (
    <>
      <path d="M13.9 3.2H7.4a1.6 1.6 0 0 0-1.6 1.6v14.4a1.6 1.6 0 0 0 1.6 1.6h9.2a1.6 1.6 0 0 0 1.6-1.6V7.5l-4.3-4.3Z" />
      <path d="M13.8 3.4v4.2h4.2" />
      <path d="M9 12.6h6M9 16.2h4.3" />
    </>
  ),
  pooja: (
    <>
      <path d="M12 3.3c2.4 3.2 3.6 5.4 3.6 7.1a3.6 3.6 0 0 1-7.2 0c0-1.7 1.2-3.9 3.6-7.1Z" />
      <path d="M4.5 15.2h15a7.5 7.5 0 0 1-15 0Z" />
    </>
  ),
  tarot: (
    <>
      <rect x="9.3" y="4.2" width="9.3" height="14" rx="1.7" />
      <path d="M6.5 7 4.7 7.6a1.7 1.7 0 0 0-1.1 2.1l3.2 9.5a1.7 1.7 0 0 0 2.1 1.1l1.4-.5" />
    </>
  ),
  /* The pro side. Five, not the ten first drafted — Studio's go-live uses a
     badge and a plate, Earnings draws bars rather than a chart glyph, and the
     settings rows already get their arrow from `.act-row::after`. */
  calendar: (
    <>
      <rect x="3.4" y="5" width="17.2" height="15.6" rx="1.8" />
      <path d="M8 2.8v4.2M16 2.8v4.2M3.4 9.8h17.2" />
    </>
  ),
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  rupee: <path d="M7.6 4.4h8.8M7.6 8.6h8.8M15 4.4a4.2 4.2 0 0 1 0 8.4H7.6l7.4 6.8" />,
  check: <path d="m4.6 12.6 5 5 9.8-11" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  eye: (
    <>
      <path d="M2.6 12s3.6-6.4 9.4-6.4S21.4 12 21.4 12s-3.6 6.4-9.4 6.4S2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.6 2.8 19.6h18.4L12 3.6Z" />
      <path d="M12 9.8v4.2M12 16.9v.1" />
    </>
  ),
  /* Kundli — the north-Indian chart: a square with its diagonals. */
  kundli: (
    <>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="1.6" />
      <path d="M3.4 3.4 12 12l8.6-8.6M3.4 20.6 12 12l8.6 8.6" />
    </>
  ),
  ai: (
    <>
      <path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z" />
      <path d="M18.6 16.4l.7 2.2 2.2.7-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.7.7-2.2Z" />
    </>
  ),
  cart: (
    <>
      <path d="M3.2 4.4h2.3l2.4 10.9a1.5 1.5 0 0 0 1.5 1.2h8a1.5 1.5 0 0 0 1.5-1.15l1.6-6.75H6.4" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17.4" cy="20" r="1.3" />
    </>
  ),
}

/**
 * @param name    one of the keys above
 * @param size    px, square. 20 in the tab bar, 18 in the top bar.
 * @param weight  stroke width. 1.6 at rest, 2.1 when active.
 * @param filled  solid fill instead of an outline — the "on" state for the
 *                heart and the bookmark.
 */
export default function Icon({ name, size = 20, weight = 1.7, filled = false, className = '' }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ transition: 'stroke-width .2s ease, fill .2s ease' }}
    >
      {d}
    </svg>
  )
}
