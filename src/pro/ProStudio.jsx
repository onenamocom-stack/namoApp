import { useEffect, useState } from 'react'
import { fetchByConsultant, publish, uploadMedia } from '../lib/content.js'
import { TabHeader } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import { Field, Row } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

/**
 * The studio — three things a consultant can publish, and nothing else.
 *
 * Each tab is one row in `content` and the tab IS the `kind` column, so adding
 * a fourth means a value in the migration's check constraint rather than a new
 * table. `live_session` is the fourth value and belongs to phase 11.
 *
 *   Reel   → kind 'clip'     video, required. The format is the video.
 *   Photo  → kind 'post'     image, required, plus what you want to say.
 *   Blog   → kind 'article'  title and body; a cover image is optional.
 *
 * The file goes to storage FIRST and the row carries its URL, so a publish
 * that fails never leaves a row pointing at nothing. The reverse — a file with
 * no row — is a few kilobytes nobody sees, which is the cheaper way to fail.
 */
const TABS = [
  { key: 'clip', label: 'Reel' },
  { key: 'post', label: 'Photo' },
  { key: 'article', label: 'Blog' },
]

/** What each tab uploads, and whether it can be published without one. */
const MEDIA = {
  clip: { accept: 'video/*', required: true, add: 'Choose a video', swap: 'Choose a different video' },
  post: { accept: 'image/*', required: true, add: 'Choose a photo', swap: 'Choose a different photo' },
  article: { accept: 'image/*', required: false, add: 'Add a cover image', swap: 'Change the cover' },
}

export default function ProStudio() {
  const { showToast, session } = useStore()
  const [tab, setTab] = useState('clip')
  const [caption, setCaption] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [published, setPublished] = useState([])
  const [media, setMedia] = useState(null)

  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  const spec = MEDIA[tab]

  /* What this consultant has already published, read back from the same view
     the seeker's feed reads. The studio showing its own optimistic copy is how
     a publish that silently failed still looks like it worked — which is the
     bug this screen shipped with: a toast that wrote nothing. */
  const me = session?.user?.id
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!me) return
    let active = true
    fetchByConsultant(me)
      .then((rows) => active && setPublished(rows))
      .catch((err) => console.error('[studio] load failed:', err.message))
    return () => {
      active = false
    }
  }, [me, reload])

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
    // Cleared either way, so choosing the same file again after a failure
    // still fires a change event.
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadMedia(file)
      setMedia({ url, type: file.type })
    } catch (err) {
      showToast(err.message)
    } finally {
      setUploading(false)
    }
  }

  /* One publish path for all three. The only difference between them is which
     fields carry the words, so three handlers would be the same function three
     times. */
  async function send(fields, done) {
    setBusy(true)
    try {
      await publish({ kind: tab, mediaUrl: media?.url, ...fields })
      done()
      setMedia(null)
      setReload((n) => n + 1)
      showToast('Published to your feed')
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
      if (spec.required && !media) return tab === 'clip' ? 'Choose a video' : 'Choose a photo'
      if (!caption.trim()) return 'Write a caption first'
    }
    return null
  }

  return (
    <>
      <TabHeader />

      <div className="px-4 pt-5">
        {/* Local state, not the URL. Nothing links to a specific composer tab,
            so there is nothing to deep-link or share. */}
        <div role="tablist" className="seg">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => pick(t.key)}
              className="seg-item"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="animate-fade">
        <section className="border-b border-rule px-5 py-6">
          <Kicker>
            {tab === 'clip' ? 'New reel' : tab === 'post' ? 'New photo post' : 'New blog post'}
          </Kicker>

          {/* The preview. A Plate stands in until a file is chosen, which is
              also the whole preview for a blog post with no cover. */}
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
            onClick={() =>
              tab === 'article'
                ? send({ title: title.trim(), body: body.trim() }, () => {
                    setTitle('')
                    setBody('')
                  })
                : send({ caption: caption.trim() }, () => setCaption(''))
            }
          >
            {blockedBecause() ?? `Publish ${tab === 'article' ? 'blog post' : tab === 'clip' ? 'reel' : 'photo'}`}
          </PopButton>
        </section>
      </div>

      <section className="px-5 py-6">
        <Kicker action="See all" to="/pro/profile">
          Already published
        </Kicker>
        <p className="mt-2 caps-sm t-faint tnum">
          {published.filter((c) => c.kind === 'clip').length} reels ·{' '}
          {published.filter((c) => c.kind === 'post').length} photos ·{' '}
          {published.filter((c) => c.kind === 'article').length} blog posts
        </p>
        <div className="mt-3">
          {published.map((c) => (
            <Row
              key={c.id}
              title={c.title || c.caption}
              meta={c.time}
              note={c.kind === 'clip' ? 'Reel' : c.kind === 'post' ? 'Photo' : 'Blog'}
            />
          ))}
          {/* An empty studio says so. The counts above are COUNTED, never
              quoted — the mock said three pieces with 12.1k views against
              nothing at all. */}
          {!published.length && (
            <p className="prose-c">
              Nothing published yet. What you post here appears in the feed.
            </p>
          )}
        </div>
      </section>

      <div className="h-24" />
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
