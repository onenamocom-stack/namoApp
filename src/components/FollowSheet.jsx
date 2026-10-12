import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Sheet } from './Chrome.jsx'
import { Loader } from './Cosmos.jsx'
import { followList } from '../lib/content.js'
import { useStore } from '../store.jsx'

/** Your followers or whom you follow, by name. Tap one to open them. */
export default function FollowSheet({ which, onClose }) {
  const { t } = useStore()
  const [items, setItems] = useState(null)
  useEffect(() => {
    if (!which) return undefined
    let live = true
    setItems(null)
    followList(which)
      .then((rows) => live && setItems(rows))
      .catch(() => live && setItems([]))
    return () => {
      live = false
    }
  }, [which])
  if (!which) return null
  // Out of the hero and onto the page, in the phone-width frame, as
  // CommentSheet does — inside the hero it opened mid-page.
  return createPortal(
    <div className="fixed inset-y-0 left-1/2 z-[60] w-full max-w-[420px] -translate-x-1/2">
    <Sheet open onClose={onClose} title={t(`prof.${which}`)}>
      {items === null ? (
        <Loader className="py-8" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-meta t-faint">
          {which === 'followers' ? t('prof.noFollowers') : t('prof.noFollowing')}
        </p>
      ) : (
        <ul className="max-h-[60vh] overflow-y-auto">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                to={p.is_consultant ? `/consult/${p.id}` : `/u/${p.id}`}
                onClick={onClose}
                className="flex items-center gap-3 border-b border-rule py-3"
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface text-meta font-semibold t-heading">
                    {(p.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta font-semibold t-heading">{p.name}</span>
                  {p.is_consultant && <span className="block text-[12px] t-faint">{t('prof.consultant')}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
    </div>,
    document.body,
  )
}
