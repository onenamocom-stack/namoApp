import { useState } from 'react'
import { publish, uploadMedia } from '../lib/content.js'
import Plate from './Plate.jsx'
import { Kicker, PopButton } from './Pop.jsx'
import { Field } from './Primitives.jsx'
import { useStore } from '../store.jsx'

/**
 * One composer, two callers.
 *
 * `/pro/studio` passes all three kinds; a seeker's profile passes two. The
 * difference between a consultant and a seeker is the `kinds` prop and nothing
 * else, which is the point of extracting this — the alternative was the same
 * upload path, the same validation and the same publish call written twice, and
 * drifting the first time one of them got a fix.
 *
 * Each tab IS the `content.kind` column. Adding a fourth means a value in the
 * migration's check constraint rather than a new table.
 *
 *   Reel   → 'clip'     video, required. The format is the video.
 *   Photo  → 'post'     image, required, plus what you want to say.
 *   Blog   → 'article'  title and body; a cover image is optional.
 *
 * The file goes to storage FIRST and the row carries its URL, so a publish that
 * fails never leaves a row pointing at nothing. The reverse — a file with no
 * row — is a few kilobytes nobody sees, which is the cheaper way to fail.
 *
 * **This is not the permission.** `025`'s insert policy decides what may be
 * published: a seeker gets `post` and `article`, only an approved consultant
 * gets `clip`. Passing the wrong `kinds` here shows the wrong tab; it does not
 * grant anything, and the server says so.
 */
const SPEC = {
  clip: {
    label: 'Reel',
    heading: 'New reel',
    accept: 'video/*',
    required: true,
    add: 'Choose a video',
    swap: 'Choose a different video',
    missing: 'Choose a video',
  },
  post: {
    label: 'Photo',
    heading: 'New photo post',
    accept: 'image/*',
    required: true,
    add: 'Choose a photo',
    swap: 'Choose a different photo',
    missing: 'Choose a photo',
  },
  article: {
    label: 'Blog',
    heading: 'New blog post',
    accept: 'image/*',
    required: false,
    add: 'Add a cover image',
    swap: 'Change the cover',
  },
}

export default function Composer({ kinds = ['post', 'article'], onPublished }) {
  const { showToast } = useStore()
  const [tab, setTab] = useState(kinds[0])
  const [caption, setCaption] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [media, setMedia] = useState(null)

  const spec = SPEC[tab]
  const words = body.trim() ? body.trim().split(/\s+/).length : 0

  /* Switching tabs clears the composer. A video chosen for a reel is not a
     cover image for a blog post, and carrying it across is how the wrong file
     gets published. */
  function pick(next) {
    setTab(next)
    setMedia(null)
    setCaption('')
    setTitle('')
    setBody('')
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    // Cleared either way, so choosing the same file again after a failure still
    // fires a change event.
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      setMedia({ url: await uploadMedia(file), type: file.type })
    } catch (err) {
      showToast(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function send() {
    setBusy(true)
    try {
      const fields =
        tab === 'article'
          ? { title: title.trim(), body: body.trim() }
          : { caption: caption.trim() }
      await publish({ kind: tab, mediaUrl: media?.url, ...fields })
      setCaption('')
      setTitle('')
      setBody('')
      setMedia(null)
      showToast('Published to your feed')
      onPublished?.()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const ready =
    tab === 'article'
      ? title.trim() && body.trim()
      : caption.trim() && (!spec.required || media)

  /** Why the button is not offering to publish yet, in one short sentence. */
  function blockedBecause() {
    if (busy) return 'Publishing'
    if (uploading) return 'Uploading'
    if (tab === 'article') {
      if (!title.trim()) return 'Needs a title'
      if (!body.trim()) return 'Needs a body'
    } else {
      if (spec.required && !media) return spec.missing
      if (!caption.trim()) return 'Write a caption first'
    }
    return null
  }

  return (
    <>
      {/* One kind means no switcher. A row of tabs with a single tab in it is
          furniture that says nothing. */}
      {kinds.length > 1 && (
        <div className="px-4 pt-5">
          <div role="tablist" className="seg">
            {kinds.map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={tab === k}
                onClick={() => pick(k)}
                className="seg-item"
              >
                {SPEC[k].label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div key={tab} className="animate-fade">
        <section className="border-b border-rule px-5 py-6">
          <Kicker>{spec.heading}</Kicker>

          {/* A Plate stands in until a file is chosen, which is also the whole
              preview for a blog post with no cover. */}
          <MediaPreview media={media} tab={tab} seed={`draft-${caption.length + title.length}`} />

          <label className="act-link mt-3 inline-block cursor-pointer text-meta">
            {uploading ? 'Uploading…' : media ? spec.swap : spec.add}
            <input
              type="file"
              accept={spec.accept}
              className="sr-only"
              disabled={uploading || busy}
              onChange={onFile}
            />
          </label>

          {tab === 'article' ? (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                aria-label="Title"
                className="mt-4 w-full border-b border-rule bg-transparent pb-2 text-lead outline-none transition-colors placeholder:text-t4 focus:border-gold t-heading"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Pattern first, prescription second. Leave a blank line between paragraphs."
                aria-label="Body"
                className="mt-5 w-full resize-none border-b border-rule bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-t4 focus:border-gold t-sub"
              />
              <div className="mt-4">
                <Field k="Words" v={words.toLocaleString('en-IN')} />
                <Field k="Read time" v={`${Math.max(1, Math.ceil(words / 200))} min`} />
              </div>
            </>
          ) : (
            <>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="Say the thing you would say on a call"
                aria-label="Caption"
                className="mt-4 w-full resize-none border-b border-rule bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-t4 focus:border-gold t-heading"
              />
              <div className="mt-4">
                <Field k="Characters" v={caption.trim().length.toLocaleString('en-IN')} />
              </div>
            </>
          )}

          <PopButton
            variant="gold"
            className="mt-6"
            disabled={!ready || busy || uploading}
            onClick={send}
          >
            {blockedBecause() ?? `Publish ${spec.label.toLowerCase()}`}
          </PopButton>
        </section>
      </div>
    </>
  )
}

/** The chosen file, or the procedural stand-in until there is one. */
function MediaPreview({ media, tab, seed }) {
  const shape = tab === 'article' ? 'aspect-[16/9]' : 'aspect-[4/5]'

  if (!media) return <Plate seed={seed} className={`mt-4 w-full ${shape}`} />

  return media.type.startsWith('video/') ? (
    <video
      src={media.url}
      controls
      playsInline
      className={`mt-4 w-full rounded-lg bg-ink object-cover ${shape}`}
    />
  ) : (
    <img
      src={media.url}
      alt="What you are about to publish"
      className={`mt-4 w-full rounded-lg object-cover ${shape}`}
    />
  )
}
