/* One pattern for every round tile — Consult's tools, Shop's categories,
   Bhakti's shelves (7 Oct 2026, Rahul: "beige base pe colorful icon", the
   three pages had three looks). A warm beige face, the icon in its own
   colour, a hairline of that colour; selected, the ring thickens and glows.
   Nothing is filled with colour any more. */
const BEIGE = '#f8eedf'
const BEIGE_DEEP = '#f1e2cc'

export function tileStyle(hue, on) {
  return on
    ? {
        background: `linear-gradient(150deg, ${BEIGE}, ${BEIGE_DEEP})`,
        color: hue,
        borderColor: hue,
        borderWidth: '2px',
        boxShadow: `0 0 0 3px color-mix(in srgb, ${hue} 18%, transparent), 0 8px 18px -10px ${hue}`,
      }
    : {
        background: `linear-gradient(150deg, ${BEIGE}, ${BEIGE_DEEP})`,
        color: hue,
        borderColor: `color-mix(in srgb, ${hue} 28%, ${BEIGE})`,
      }
}

/** Consult's free tools: the same face as every tile (it was filled with
 *  its colour until 7 Oct 2026). */
export function toolStyle(hue) {
  return tileStyle(hue, false)
}
