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
