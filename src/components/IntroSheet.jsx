import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from './Chrome.jsx'
import { saveMyIntro } from '../lib/consultants.js'
import { uploadMediaAsset } from '../lib/content.js'
import { useStore } from '../store.jsx'

/**
 * A consultant's intro on their page (11 Oct 2026, Rahul): one video or one
 * photo, uploaded here, shown above the tabs; Remove takes it down. The
 * server checks the upload is the consultant's own and finished.
 */
export function introNote(consultant) {
  if (!consultant?.intro_url) return 'Not added — your page shows none'
  return consultant.intro_kind === 'video' ? 'A video' : 'A photo'
}

export default function IntroSheet({ onClose }) {
  const { consultant, refreshConsultant, session, showToast } = useStore()
  const [busy, setBusy] = useState(null)
  const current = consultant?.intro_url ? { url: consultant.intro_url, kind: consultant.intro_kind } : null

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
      showToast('Choose a video or a photo.')
      return
    }
    setBusy('Uploading')
    try {
      const asset = await uploadMediaAsset(file)
      setBusy('Saving')
      await saveMyIntro(asset.id)
      await refreshConsultant(session?.user?.id)
      showToast('Intro added to your page.')
      onClose()
    } catch (err) {
      showToast(err.message || 'Could not add the intro.')
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('Removing')
    try {
      await saveMyIntro(null)
      await refreshConsultant(session?.user?.id)
      showToast('Intro removed.')
      onClose()
    } catch (err) {
      showToast(err.message || 'Could not remove the intro.')
      setBusy(null)
    }
  }

  // On the page, in the phone-width frame, as the rates sheet is.
  return createPortal(
    <div className="fixed inset-y-0 left-1/2 z-[60] w-full max-w-[420px] -translate-x-1/2">
      <Sheet open onClose={onClose} title="Intro video or photo">
        <p className="text-meta t-sub">
          Shown on your page above Posts. A short video saying who you are works best: 16:9,
          under a minute.
        </p>
        {current &&
          (current.kind === 'video' ? (
            <video
              src={current.url}
              controls
              playsInline
              className="mt-4 aspect-video w-full rounded-xl bg-ink object-cover"
            />
          ) : (
            <img src={current.url} alt="" className="mt-4 aspect-video w-full rounded-xl object-cover" />
          ))}
        <label
          className={`mt-5 block w-full cursor-pointer rounded-xl bg-gold-fill py-3 text-center text-meta font-semibold text-white ${
            busy ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {busy ?? (current ? 'Choose a different video or photo' : 'Choose a video or photo')}
          <input type="file" accept="video/*,image/*" className="sr-only" disabled={Boolean(busy)} onChange={pick} />
        </label>
        {current && !busy && (
          <button
            type="button"
            onClick={remove}
            className="mt-3 block w-full py-2 text-center text-meta font-semibold text-live"
          >
            Remove the intro
          </button>
        )}
      </Sheet>
    </div>,
    document.body,
  )
}
