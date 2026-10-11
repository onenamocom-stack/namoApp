/**
 * The block beside a profile photo, as Instagram lays it out (11 Oct 2026,
 * Rahul): the name on top, then posts, followers and following in three
 * columns, the number over its label. One component so your profile,
 * another person's and a consultant's page cannot drift apart.
 *
 * `stats` is [{ n, label, onClick? }]. A number that has not arrived is
 * null and draws as a dash, never as a 0 that is only a placeholder.
 */
export default function ProfileHead({ name, mark = null, stats }) {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="flex min-w-0 items-center gap-1.5 text-lead font-semibold t-heading">
        <span className="truncate">{name}</span>
        {mark}
      </h1>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {stats.map(({ n, label, onClick }) => {
          const body = (
            <>
              <dt className="sr-only">{label}</dt>
              <dd className="text-lead font-semibold leading-none tnum t-heading">
                {typeof n === 'number' ? n.toLocaleString('en-IN') : '—'}
              </dd>
              <span className="mt-1 block text-[13px] t-sub">{label}</span>
            </>
          )
          return onClick ? (
            <button key={label} type="button" onClick={onClick} className="block text-left">
              {body}
            </button>
          ) : (
            <div key={label}>{body}</div>
          )
        })}
      </dl>
    </div>
  )
}
