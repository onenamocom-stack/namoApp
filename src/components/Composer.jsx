import { useEffect, useRef, useState } from 'react'
import { apiSupportsTags, editContent, publish, uploadMedia } from '../lib/content.js'
import { fetchProducts } from '../lib/shop.js'
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
    add: 'Add a cover image (16:9, e.g. 1600 × 900)',
    swap: 'Change the cover',
  },
}

/** Must match MAX_TAGGED_PRODUCTS in backend-django/apps/content/models.py. */
const MAX_TAGS = 3

/**
 * `tagProducts` — the consultant studio's composer can tag shop products on
 * any kind — reel, photo or blog (6 Oct 2026: a blog could not, and a
 * consultant who left the Blog tab to look for the picker lost the blog) —
 * and the server refuses anyone else, so the prop only decides whether the
 * picker is shown.
 */
const EMPTY = { caption: '', title: '', body: '', media: null, tagged: [] }
const DRAFT_KEY = (kind) => `namo.draft.${kind}`

function loadDraft(kind) {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY(kind)) || 'null')
    return saved ? { ...EMPTY, ...saved } : EMPTY
  } catch {
    return EMPTY
  }
}

/* `editing` — an existing piece (the shape lib/content.js gives) to change
   in place: its own kind only, its fields filled in, no draft kept, and the
   button saves instead of publishing (6 Oct 2026). */
function fromPiece(piece) {
  return {
    caption: piece.caption ?? '',
    title: piece.title ?? '',
    body: piece.body ?? '',
    media: piece.mediaUrl
      ? { url: piece.mediaUrl, type: piece.kind === 'clip' ? 'video/mp4' : 'image/*' }
      : null,
    tagged: piece.products ?? [],
  }
}

export default function Composer({ kinds = ['post', 'article'], onPublished, tagProducts = false, editing = null }) {
  const { showToast } = useStore()
  if (editing) kinds = [editing.kind]
  const [tab, setTab] = useState(kinds[0])
  const first = editing ? fromPiece(editing) : loadDraft(kinds[0])
  const [caption, setCaption] = useState(first.caption)
  const [title, setTitle] = useState(first.title)
  const [body, setBody] = useState(first.body)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [media, setMedia] = useState(first.media)
  const [tagged, setTagged] = useState(first.tagged)

  const spec = SPEC[tab]
  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  const canTag = tagProducts

  /* Every tab keeps its own draft, in this phone's storage, as it is typed
     (6 Oct 2026). Switching tabs used to clear the composer, and a blog of
     eleven thousand characters went with it; a reload or a closed tab did
     the same. Each kind is its own draft, so a video chosen for a reel is
     still never carried to a blog's cover. */
  const draft = { caption, title, body, media, tagged }
  const saving = useRef(null)
  useEffect(() => {
    if (editing) return undefined
    clearTimeout(saving.current)
    saving.current = setTimeout(() => {
      try {
        const empty = !caption && !title && !body && !media && !tagged.length
        if (empty) localStorage.removeItem(DRAFT_KEY(tab))
        else localStorage.setItem(DRAFT_KEY(tab), JSON.stringify(draft))
      } catch {
        /* private window or full storage: the draft is still on screen */
      }
    }, 400)
    return () => clearTimeout(saving.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, caption, title, body, media, tagged])

  function pick(next) {
    if (next === tab) return
    try {
      localStorage.setItem(DRAFT_KEY(tab), JSON.stringify(draft))
    } catch {
      /* the draft stays only for this visit */
    }
    const d = loadDraft(next)
    setTab(next)
    setMedia(d.media)
    setCaption(d.caption)
    setTitle(d.title)
    setBody(d.body)
    setTagged(d.tagged)
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
      if (editing) {
        const changes = {
          ...fields,
          mediaUrl: media?.url ?? null,
          ...(canTag ? { productIds: tagged.map((p) => p.id) } : {}),
        }
        await editContent(editing.id, changes)
        showToast('Saved')
        onPublished?.({ ...fields, mediaUrl: media?.url ?? null, products: tagged })
        return
      }
      await publish({
        kind: tab,
        mediaUrl: media?.url,
        productIds: canTag ? tagged.map((p) => p.id) : [],
        ...fields,
      })
      setCaption('')
      setTitle('')
      setBody('')
      setMedia(null)
      setTagged([])
      try {
        localStorage.removeItem(DRAFT_KEY(tab))
      } catch {
        /* nothing to clear */
      }
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
    if (busy) return editing ? 'Saving' : 'Publishing'
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
          <Kicker>{editing ? `Edit ${spec.label.toLowerCase()}` : spec.heading}</Kicker>

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
              {canTag && <ProductPicker tagged={tagged} onChange={setTagged} />}
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
              {canTag && <ProductPicker tagged={tagged} onChange={setTagged} />}
            </>
          )}

          <PopButton
            variant="gold"
            className="mt-6"
            disabled={!ready || busy || uploading}
            onClick={send}
          >
            {blockedBecause() ?? (editing ? 'Save changes' : `Publish ${spec.label.toLowerCase()}`)}
          </PopButton>
        </section>
      </div>
    </>
  )
}

/**
 * Tag up to three shop products. The whole catalogue, searchable — it is
 * the house's shop, not the consultant's, and it is small enough to load in
 * one request. A seeker who taps a tag lands on that product in the shop
 * with this consultant's code, so the tag earns the same 10% a link from
 * "Your links" does; the note under the field says so.
 */
function ProductPicker({ tagged, onChange }) {
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [supported, setSupported] = useState(null)

  useEffect(() => {
    let alive = true
    apiSupportsTags().then((ok) => alive && setSupported(ok))
    fetchProducts()
      .then((rows) => alive && setAll(rows))
      .catch(() => alive && setAll([]))
    return () => {
      alive = false
    }
  }, [])

  /* Said, not hidden: a consultant told about the feature will look for it,
     and an absent field reads as a bug. Nothing tagged can be lost this way,
     because nothing can be tagged. */
  if (supported === false) {
    return (
      <p className="mt-6 text-meta t-faint">
        Product tagging switches on with the next server update.
      </p>
    )
  }

  const q = query.trim().toLowerCase()
  const picked = new Set(tagged.map((p) => p.id))
  const full = tagged.length >= MAX_TAGS
  const matches = (all ?? [])
    .filter((p) => !picked.has(p.id))
    .filter((p) => !q || `${p.name} ${p.subtitle ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q))
    .slice(0, 6)

  return (
    <div className="mt-6">
      <p className="label text-left">Tag products · {tagged.length}/{MAX_TAGS}</p>
      <p className="mt-1 text-meta t-body">
        Seekers tap through to the shop. You earn 10% on what they buy, as with your links.
      </p>

      {tagged.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tagged.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(tagged.filter((t) => t.id !== p.id))}
              aria-label={`Remove ${p.name}`}
              className="pill"
              data-active="true"
            >
              {p.name} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {!full && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the shop"
            aria-label="Search products to tag"
            className="field-line mt-4"
          />
          {all === null ? (
            <p className="mt-3 text-meta t-faint">Loading the shop.</p>
          ) : matches.length === 0 ? (
            <p className="mt-3 text-meta t-faint">Nothing in the shop matches that.</p>
          ) : (
            <ul className="mt-2">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onChange([...tagged, p])}
                    className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-surface"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="h-10 w-10 flex-none rounded-md object-cover" />
                    ) : (
                      <Plate seed={p.id} className="h-10 w-10 flex-none" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-meta t-heading">{p.name}</span>
                      <span className="block text-meta gold tnum">₹{p.price.toLocaleString('en-IN')}</span>
                    </span>
                    <span className="caps-sm gold">Tag</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

/** The chosen file, or the procedural stand-in until there is one. */
function MediaPreview({ media, tab, seed }) {
  // The shapes the feed and the reader show them in (6 Oct 2026): a blog
  // cover 16:9 on every screen, a photo 4:5.
  const shape = tab === 'article' ? 'aspect-video' : 'aspect-[4/5]'

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
