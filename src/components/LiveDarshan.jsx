import { useStore } from '../store.jsx'

/**
 * Temples' live darshan (20 Oct 2026, Rahul: "temples which offer live
 * darshan on YouTube ... integrate their channel live video in our app").
 *
 * The live video takes the murti's place in the shrine, so the bells, the
 * diyas, the dhoop, the flowers and the aarti thali stand in front of it as
 * they do before a murti (Rahul, same morning: "put aarti diya etc in front
 * of this yt video"). The player is YouTube's own, inside Namo. Only
 * streams that allow it are in the console, and there is no "watch on
 * YouTube" anywhere: nobody is sent to YouTube.
 *
 * `LiveVideo` is what stands in the murti's band; `LiveSheet` the list of
 * temples, opened from the plaque as the murti sheet is.
 */
export function LiveVideo({ row }) {
  const { lang, t } = useStore()
  const name = lang === 'hi' ? row.templeHi : row.temple
  if (!row.live) {
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <span className="caps-sm text-[#f8df92]">{t('puja.liveNext', { at: row.nextAt ?? '' })}</span>
        <span className="mt-1 text-micro text-white/70">{name}</span>
      </span>
    )
  }
  return (
    <span className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '6%' }}>
      <span className="relative block aspect-video w-full overflow-hidden bg-black shadow-[0_8px_24px_rgba(0,0,0,.55)]">
        <iframe
          key={row.id}
          src={row.embedUrl}
          title={name}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </span>
    </span>
  )
}

export function LiveSheet({ rows, onId, onPick, onClose }) {
  const { lang, t } = useStore()
  const hi = lang === 'hi'
  return (
    <div role="dialog" aria-modal="true" aria-label={t('puja.liveTemples')} className="absolute inset-0 z-30 flex flex-col justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="animate-fade absolute inset-0 bg-black/45" />
      <div className="animate-fade-rise relative max-h-[70%] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-6 shadow-xl">
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-black/15" />
        <p className="caps-sm t-faint">{t('puja.liveTemples')}</p>
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={r.id === onId}
                onClick={() => onPick(r.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition active:scale-[0.99] ${
                  r.id === onId ? 'border-ink shadow-md' : 'border-stroke'
                }`}
              >
                <span className="relative block aspect-video w-24 flex-none overflow-hidden rounded-xl bg-black/10">
                  {r.imageUrl && (
                    <img src={r.imageUrl} alt="" loading="lazy" className={`h-full w-full object-cover ${r.live ? '' : 'opacity-50'}`} />
                  )}
                  {r.live && (
                    <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-live px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      {t('puja.live')}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta font-semibold t-heading">{hi ? r.templeHi : r.temple}</span>
                  {(hi ? r.locationHi : r.location) && (
                    <span className="block truncate text-micro t-faint">{hi ? r.locationHi : r.location}</span>
                  )}
                  {!r.live && r.nextAt && (
                    <span className="mt-0.5 block text-micro gold">{t('puja.liveNext', { at: r.nextAt })}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
