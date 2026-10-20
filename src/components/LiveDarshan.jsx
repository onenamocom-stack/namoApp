import { useState } from 'react'
import { useStore } from '../store.jsx'

/**
 * Temples' live darshan, in place of the shrine when the darshan page's
 * Live pill is on (20 Oct 2026, Rahul: "temples which offer live darshan
 * on YouTube ... integrate their channel live video in our app").
 *
 * The player is YouTube's own, inside Namo. Only streams that allow it are
 * in the console, and there is no "watch on YouTube" anywhere: Rahul's rule
 * is that nobody is sent to YouTube. A temple outside its hours shows when
 * it is next live and does not play.
 */
export default function LiveDarshan({ rows }) {
  const { lang, t } = useStore()
  const hi = lang === 'hi'
  const first = rows.find((r) => r.live) ?? rows[0]
  const [onId, setOnId] = useState(first?.live ? first.id : null)
  const on = rows.find((r) => r.id === onId)

  return (
    <section className="no-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#2a1a0e] pb-6">
      {on ? (
        <div className="relative aspect-video w-full bg-black">
          <iframe
            key={on.id}
            src={on.embedUrl}
            title={hi ? on.templeHi : on.temple}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      ) : (
        <p className="px-6 py-10 text-center text-meta text-white/70">{t('puja.livePick')}</p>
      )}

      <ul className="mt-3 space-y-2 px-3">
        {rows.map((r) => {
          const selected = r.id === onId
          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={!r.live}
                aria-pressed={selected}
                onClick={() => setOnId(r.id)}
                className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition active:scale-[0.99] ${
                  selected ? 'bg-white/15 ring-1 ring-[#f8df92]/60' : 'bg-white/5'
                }`}
              >
                <span className="relative block aspect-video w-28 flex-none overflow-hidden rounded-xl bg-black/40">
                  {r.imageUrl && (
                    <img src={r.imageUrl} alt="" loading="lazy" className={`h-full w-full object-cover ${r.live ? '' : 'opacity-50'}`} />
                  )}
                  {r.live && (
                    <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-live px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      {t('puja.live')}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta font-semibold text-white">{hi ? r.templeHi : r.temple}</span>
                  {(hi ? r.locationHi : r.location) && (
                    <span className="block truncate text-micro text-white/60">{hi ? r.locationHi : r.location}</span>
                  )}
                  {!r.live && r.nextAt && (
                    <span className="mt-0.5 block text-micro text-[#f8df92]">{t('puja.liveNext', { at: r.nextAt })}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
