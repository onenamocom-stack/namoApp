import { useEffect, useRef, useState } from 'react'
import { apiSupportsTags, editContent, publish, uploadMedia } from '../lib/content.js'
import { fetchProducts } from '../lib/shop.js'
import { BackButton } from './Chrome.jsx'
import Icon from './Icon.jsx'
import Plate from './Plate.jsx'
import { PopAvatar, PopButton } from './Pop.jsx'
import { useStore } from '../store.jsx'

/**
 * One composer, Facebook's shape (12 Oct 2026, Rahul — it was four tabs:
 * Text, Photo, Video, Blog).
 *
 * **Create post** is one box for words, with a toolbar under it: Photo/Video
 * from the gallery, Camera, Tag product (consultants only) and Blog. What is
 * published follows from what is in it — the `content.kind` column is still
 * the switch, chosen here rather than by a tab:
 *
 *   words only        → 'post' with no media (the feed sets a short one large)
 *   a photo           → 'post', the words its caption
 *   a video           → 'clip' — only where `kinds` includes it; the server's
 *                       025 policy is the permission, this only offers it
 *   Blog              → its own screen, 'article': title, body, optional cover
 *
 * The file goes to storage FIRST and the row carries its URL, so a publish
 * that fails never leaves a row pointing at nothing.
 *
 * The header — Back, the screen's name and Post — is the composer's own, so
 * the button sits top right as on Facebook. `onClose` puts Back in it; the
 * consultant studio, where the composer is part of the page, has none.
 *
 * Every draft is kept on this phone as it is typed (6 Oct 2026): one for a
 * post and one for a blog, so a blog of eleven thousand characters survives a
 * reload and a video chosen for a post never becomes a blog's cover.
 */

/** Must match MAX_TAGGED_PRODUCTS in backend-django/apps/content/models.py. */
const MAX_TAGS = 3

const EMPTY = { caption: '', title: '', body: '', media: null, tagged: [] }
const DRAFT_KEY = (mode) => `namo.draft.${mode}`

function loadDraft(mode) {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY(mode)) || 'null')
    return saved ? { ...EMPTY, ...saved } : EMPTY
  } catch {
    return EMPTY
  }
}

/* `editing` — an existing piece (the shape lib/content.js gives) to change
   in place: its fields filled in, no draft kept, and Save instead of Post
   (6 Oct 2026). Its kind cannot change, so a photo stays a photo and a reel
   a reel. */
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

const isVideo = (media) => Boolean(media?.type?.startsWith('video/'))

export default function Composer({
  kinds: allowed = ['post', 'article'],
  onPublished,
  onClose = null,
  tagProducts = false,
  editing = null,
  groupId = null,
}) {
  const { showToast, me } = useStore()
  const canVideo = editing ? editing.kind === 'clip' : allowed.includes('clip')
  const canBlog = !editing && allowed.includes('article')
  const [mode, setMode] = useState(editing?.kind === 'article' ? 'article' : 'post')
  const first = editing ? fromPiece(editing) : loadDraft(mode)
  const [caption, setCaption] = useState(first.caption)
  const [title, setTitle] = useState(first.title)
  const [body, setBody] = useState(first.body)
  const [media, setMedia] = useState(first.media)
  const [tagged, setTagged] = useState(first.tagged)
  const [tagging, setTagging] = useState(first.tagged.length > 0)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  // 0 to 1 while a video is being made smaller before it uploads (Phase 15d).
  const [shrinking, setShrinking] = useState(null)
  const gallery = useRef(null)
  const camera = useRef(null)
  const blog = mode === 'article'
  const words = body.trim() ? body.trim().split(/\s+/).length : 0

  /* The draft of the screen you are on, saved a moment after typing stops. */
  const draft = { caption, title, body, media, tagged }
  const saving = useRef(null)
  useEffect(() => {
    if (editing) return undefined
    clearTimeout(saving.current)
    saving.current = setTimeout(() => {
      try {
        const empty = !caption && !title && !body && !media && !tagged.length
        if (empty) localStorage.removeItem(DRAFT_KEY(mode))
        else localStorage.setItem(DRAFT_KEY(mode), JSON.stringify(draft))
      } catch {
        /* private window or full storage: the draft is still on screen */
      }
    }, 400)
    return () => clearTimeout(saving.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, caption, title, body, media, tagged])

  /** Between Create post and Write a blog, each keeping its own draft. */
  function switchTo(next) {
    try {
      localStorage.setItem(DRAFT_KEY(mode), JSON.stringify(draft))
    } catch {
      /* the draft stays only for this visit */
    }
    const d = loadDraft(next)
    setMode(next)
    setCaption(d.caption)
    setTitle(d.title)
    setBody(d.body)
    setMedia(d.media)
    setTagged(d.tagged)
    setTagging(d.tagged.length > 0)
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    // Cleared either way, so the same file chosen again still fires.
    e.target.value = ''
    if (!file) return
    const video = file.type.startsWith('video/')
    if (video && (!canVideo || blog)) {
      return showToast(blog ? 'A blog cover is a photo.' : 'Video posts are for Pros and Creators. Choose a photo.')
    }
    if (editing && editing.kind === 'clip' && !video) return showToast('A reel stays a video. Choose a video.')
    setUploading(true)
    try {
      const url = await uploadMedia(file, video ? (p) => setShrinking(p) : null)
      setMedia({ url, type: video ? 'video/mp4' : file.type })
    } catch (err) {
      showToast(err.message)
    } finally {
      setUploading(false)
      setShrinking(null)
    }
  }

  const ready = blog ? title.trim() && body.trim() : caption.trim() || media

  async function send() {
    if (!ready || busy || uploading) return
    setBusy(true)
    try {
      const fields = blog ? { title: title.trim(), body: body.trim() } : { caption: caption.trim() || null }
      if (editing) {
        const changes = {
          ...fields,
          mediaUrl: media?.url ?? null,
          ...(tagProducts ? { productIds: tagged.map((p) => p.id) } : {}),
        }
        await editContent(editing.id, changes)
        showToast('Saved')
        onPublished?.({ ...fields, mediaUrl: media?.url ?? null, products: tagged })
        return
      }
      await publish({
        kind: blog ? 'article' : isVideo(media) ? 'clip' : 'post',
        mediaUrl: media?.url,
        productIds: tagProducts ? tagged.map((p) => p.id) : [],
        groupId,
        ...fields,
      })
      setCaption('')
      setTitle('')
      setBody('')
      setMedia(null)
      setTagged([])
      try {
        localStorage.removeItem(DRAFT_KEY(mode))
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

  // Back from a new blog is back to Create post; anywhere else it closes.
  const back = blog && !editing ? () => switchTo('post') : onClose
  const heading = editing ? 'Edit' : blog ? 'Write a blog' : 'Create post'
  const action = busy ? (editing ? 'Saving' : 'Posting') : uploading ? 'Uploading' : editing ? 'Save' : blog ? 'Publish' : 'Post'
  const accept = blog || !canVideo ? 'image/*' : editing?.kind === 'clip' ? 'video/*' : 'image/*,video/*'
  const sheet = Boolean(onClose)

  return (
    <div className={`flex flex-col bg-white ${sheet ? 'min-h-full' : 'border-b border-rule'}`}>
      <div className={`${sheet ? 'sticky top-0 z-10' : ''} flex items-center gap-3 border-b border-rule bg-white px-4 py-3`}>
        {back && <BackButton onClick={back} />}
        <span className="flex-1 text-meta font-semibold t-heading">{heading}</span>
        <PopButton size="sm" variant="gold" full={false} onClick={send} disabled={!ready || busy || uploading}>
          {action}
        </PopButton>
      </div>

      <div className="flex-1 px-4 pb-6 pt-4">
        {blog ? (
          <>
            {media ? (
              <div className="relative overflow-hidden rounded-2xl">
                <img src={media.url} alt="Your cover" className="aspect-video w-full object-cover" />
                <RemoveMark onClick={() => setMedia(null)} label="Remove the cover" />
                <button
                  type="button"
                  onClick={() => gallery.current?.click()}
                  className="absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  Change cover
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => gallery.current?.click()}
                disabled={uploading}
                className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold-fill/40 bg-gold-fill/5 text-meta font-semibold text-gold"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gold-fill/15">
                  <Icon name="image" size={20} />
                </span>
                {uploading ? 'Uploading…' : 'Add a cover photo'}
              </button>
            )}
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
              rows={2}
              placeholder="Title"
              aria-label="Title"
              className="mt-5 w-full resize-none bg-transparent font-display text-title font-bold leading-tight outline-none placeholder:text-t4 t-heading"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              placeholder="Write what you want to say. Leave a blank line between paragraphs."
              aria-label="Body"
              className="mt-2 w-full resize-none bg-transparent text-body leading-relaxed outline-none placeholder:text-t4 t-sub"
            />
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <PopAvatar initials={me.initials} src={me.avatarUrl} size={44} />
              <div className="min-w-0">
                <p className="truncate text-meta font-semibold t-heading">{me.name}</p>
                <p className="text-[12px] t-faint">Public · Home feed</p>
              </div>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={media ? 3 : 7}
              placeholder={media ? 'Say something about this… #hashtags' : 'What would you like to share today?'}
              aria-label="Post"
              className="mt-4 w-full resize-none bg-transparent text-lead leading-snug outline-none placeholder:text-t4 t-heading"
            />
            {uploading && !media && (
              <p className="mt-2 text-meta t-faint tnum">
                {shrinking !== null && shrinking < 1
                  ? `Making the video smaller · ${Math.round(shrinking * 100)}%`
                  : 'Uploading…'}
              </p>
            )}
            {media && (
              <div className="relative mt-2 overflow-hidden rounded-2xl bg-ink">
                {isVideo(media) ? (
                  <video src={media.url} controls playsInline className="max-h-[60vh] w-full object-contain" />
                ) : (
                  <img src={media.url} alt="What you are about to post" className="max-h-[60vh] w-full object-contain" />
                )}
                <RemoveMark onClick={() => setMedia(null)} label="Remove" />
              </div>
            )}
          </>
        )}

        {tagProducts && tagging && <ProductPicker tagged={tagged} onChange={setTagged} />}
      </div>

      {/* The toolbar: pinned to the bottom of the sheet, as Facebook's is. */}
      <div className={`${sheet ? 'sticky bottom-0' : ''} border-t border-rule bg-white px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5`}>
        {blog ? (
          <div className="flex items-center gap-2 px-1">
            {tagProducts && <ToolChip on={tagging} onClick={() => setTagging((v) => !v)} />}
            <span className="flex-1" />
            <span className="text-[12px] t-faint tnum">
              {words.toLocaleString('en-IN')} words{words > 0 && ` · ${Math.max(1, Math.ceil(words / 200))} min read`}
            </span>
          </div>
        ) : (
          <>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {/* Gallery and Camera are icons alone (14 Oct 2026, Rahul), so
                  the row fits a phone with Tag and Blog beside them. */}
              <Tool icon="image" tone="bg-[#e7f6ee] text-[#2f8f5b]" label={canVideo ? 'Photo or video' : 'Photo'} iconOnly onClick={() => gallery.current?.click()} disabled={uploading || busy} />
              <Tool icon="camera" tone="bg-[#fdeee4] text-[#d9641f]" label="Camera" iconOnly onClick={() => camera.current?.click()} disabled={uploading || busy} />
              {tagProducts && (
                <Tool glyph={<TagGlyph size={16} />} tone="bg-[#fff4d6] text-[#a8740a]" label="Tag" on={tagging} onClick={() => setTagging((v) => !v)} />
              )}
              {canBlog && (
                <Tool glyph={<PenGlyph />} tone="bg-[#eef0fb] text-[#4b57b8]" label="Blog" onClick={() => switchTo('article')} disabled={busy} />
              )}
            </div>
          </>
        )}
      </div>

      <input ref={gallery} type="file" accept={accept} className="hidden" onChange={onFile} aria-hidden="true" tabIndex={-1} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-hidden="true" tabIndex={-1} />
    </div>
  )
}

/** One pill in the toolbar: a tinted round icon beside its name, one line
 *  (12 Oct 2026, Rahul: lower, "more modern"; they were tiles, icon over
 *  name, 70px tall). */
function Tool({ icon, glyph, tone, label, onClick, disabled = false, on = false, iconOnly = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on || undefined}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full py-1.5 pl-1.5 ${iconOnly ? 'pr-1.5' : 'pr-2'} text-[12px] font-semibold text-t1 transition-transform active:scale-95 disabled:opacity-40 ${
        on ? 'bg-gold-fill/10 ring-1 ring-gold-fill/40' : 'bg-[#f4f4f6]'
      }`}
    >
      <span className={`grid h-7 w-7 place-items-center rounded-full ${tone}`}>
        {glyph ?? <Icon name={icon} size={16} weight={2} />}
      </span>
      {!iconOnly && label}
    </button>
  )
}

/** Tag product on a blog's bottom bar, smaller than a tile. */
function ToolChip({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-t1 ${on ? 'bg-gold-fill/10 ring-1 ring-gold-fill/40' : 'bg-[#f4f4f6]'}`}
    >
      <TagGlyph size={15} /> Tag product
    </button>
  )
}

function RemoveMark({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white"
    >
      <Icon name="close" size={16} weight={2.2} />
    </button>
  )
}

function TagGlyph({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </svg>
  )
}

function PenGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
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
