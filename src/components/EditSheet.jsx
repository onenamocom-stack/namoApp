import Composer from './Composer.jsx'
import { BackButton } from './Chrome.jsx'
import { isPro } from '../side.js'

/**
 * Edit your own post, reel or blog, over whatever screen you are on
 * (6 Oct 2026, Rahul: "edit button in blog and all posts"). The composer in
 * edit mode; `onSaved(fields)` receives what changed so the card underneath
 * can show it without a reload.
 */
export default function EditSheet({ piece, onClose, onSaved }) {
  if (!piece) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="Edit" className="fixed inset-0 z-50 flex justify-center bg-black/40">
      <div className="no-scrollbar h-full w-full max-w-[420px] overflow-y-auto bg-bg">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-rule bg-bg px-4 py-3">
          <BackButton onClick={onClose} />
          <span className="text-meta t-heading">Edit</span>
        </div>
        <Composer
          editing={piece}
          tagProducts={isPro}
          onPublished={(fields) => {
            onSaved?.(fields)
            onClose()
          }}
        />
        <div className="h-16" />
      </div>
    </div>
  )
}
