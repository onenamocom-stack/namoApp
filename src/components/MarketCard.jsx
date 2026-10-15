/**
 * The Market's home layout (15 Oct 2026, Rahul's reference): on All, every
 * category is a section — its name, See all, and two cards side by side.
 * A card is a wide picture, then the name, who sells it, and what it is.
 * No star rating: nothing in the Market is rated yet, and a made-up one on
 * a thing for sale is worse than none.
 */
export function MarketSection({ title, seeAll, onSeeAll, children }) {
  return (
    <section className="px-4 pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lead font-semibold t-heading">{title}</h2>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className="flex-none text-meta t-sub">
            {seeAll}
          </button>
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-3">{children}</ul>
    </section>
  )
}

/** `art` is the picture, already sized by the caller (a product's photo, a
 *  book's cover); `lines` the grey rows under the name. */
export function MarketCard({ art, name, lines = [], onOpen, id }) {
  return (
    <li id={id}>
      <button type="button" onClick={onOpen} className="pop-tap block w-full text-left">
        <span className="block aspect-[16/10] w-full overflow-hidden rounded-lg">{art}</span>
        <span className="mt-2 block line-clamp-2 text-meta t-heading">{name}</span>
        {lines.filter(Boolean).map((l, i) => (
          <span key={i} className="mt-0.5 block truncate text-micro t-faint">
            {l}
          </span>
        ))}
      </button>
    </li>
  )
}
