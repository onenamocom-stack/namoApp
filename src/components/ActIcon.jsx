import Icon from './Icon.jsx'

/** One icon in a post's action row: Like, Comment, Reshare, Share, Save. */
export function ActIcon({ icon, label, onLabel, on = false, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on && onLabel ? onLabel : label}
      aria-pressed={onLabel ? on : undefined}
      className={`-m-1.5 p-1.5 transition-transform active:scale-90 ${
        on && tone ? tone : 'text-t3 hover:text-t2'
      }`}
    >
      <Icon name={icon} size={25} weight={1.7} filled={on} />
    </button>
  )
}

/** A count beside its icon, Instagram's way (4 Oct 2026; the numbers were a
 *  line of text under the row). Nothing at zero. */
export function Count({ n }) {
  return n > 0 ? <span className="-ml-2 text-meta font-semibold tnum text-t1">{n.toLocaleString('en-IN')}</span> : null
}
