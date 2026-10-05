/** A shelf tile in its own colour: a soft wash with the icon in the colour,
 *  or, when selected, the colour itself with a white icon and a halo. */
export function tileStyle(hue, on) {
  return on
    ? {
        background: `linear-gradient(160deg, color-mix(in srgb, ${hue} 70%, white), ${hue})`,
        color: '#fff',
        borderColor: hue,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${hue} 22%, transparent), 0 8px 18px -8px ${hue}`,
      }
    : {
        background: `linear-gradient(145deg, #ffffff, color-mix(in srgb, ${hue} 14%, white))`,
        color: hue,
        borderColor: `color-mix(in srgb, ${hue} 25%, white)`,
      }
}


/** A tool tile that is not a choice — Consult's free tools (6 Oct 2026,
 *  "these look dull"). Full colour, a white icon, a soft glow of its own
 *  hue; there is no selected state to confuse it with. */
export function toolStyle(hue) {
  return {
    background: `linear-gradient(150deg, color-mix(in srgb, ${hue} 55%, white) 0%, ${hue} 70%, color-mix(in srgb, ${hue} 80%, black) 100%)`,
    color: '#fff',
    borderColor: 'transparent',
    boxShadow: `inset 0 1px 0 rgba(255,255,255,.35), 0 8px 16px -8px ${hue}`,
  }
}
