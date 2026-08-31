import { useState } from 'react'
import { clips, mine, pro, reads } from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import { Field, Row } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

const TABS = [
  { key: 'reel', label: 'Reel' },
  { key: 'article', label: 'Article' },
]

export default function ProStudio() {
  const { showToast } = useStore()
  const [tab, setTab] = useState('reel')
  const [caption, setCaption] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const words = body.trim() ? body.trim().split(/\s+/).length : 0

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
              onClick={() => setTab(t.key)}
              className="seg-item"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="animate-fade">
        {tab === 'reel' && (
          <section className="border-b border-rule px-5 py-6">
            <Kicker>New reel</Kicker>
            {/* Artwork is procedural everywhere in this app — there are no
                image URLs and no upload path — so the preview is a Plate. */}
            <Plate seed={`draft-${caption.length}`} className="mt-4 aspect-[4/5] w-full" />
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Say the thing you would say on a call"
              aria-label="Caption"
              className="mt-4 w-full resize-none border-b border-rule bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-t4 focus:border-gold t-heading"
            />
            <div className="mt-4">
              <Field k="Audio" v="Original · Ritu Kashyap" />
              <Field k="Length" v="0:48" />
            </div>
            <PopButton
              variant="gold"
              className="mt-6"
              disabled={!caption.trim()}
              onClick={() => {
                setCaption('')
                showToast('Published to your feed')
              }}
            >
              {caption.trim() ? 'Publish reel' : 'Write a caption first'}
            </PopButton>
          </section>
        )}

        {tab === 'article' && (
          <section className="border-b border-rule px-5 py-6">
            <Kicker>New article</Kicker>
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
              placeholder="Pattern first, prescription second."
              aria-label="Body"
              className="mt-5 w-full resize-none border-b border-rule bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-t4 focus:border-gold t-sub"
            />
            <div className="mt-4">
              <Field k="Words" v={words.toLocaleString('en-IN')} />
              <Field k="Read time" v={`${Math.max(1, Math.ceil(words / 200))} min`} />
            </div>
            <PopButton
              variant="gold"
              className="mt-6"
              disabled={!title.trim() || !body.trim()}
              onClick={() => {
                setTitle('')
                setBody('')
                showToast('Article published')
              }}
            >
              {title.trim() && body.trim() ? 'Publish article' : 'Needs a title and a body'}
            </PopButton>
          </section>
        )}

      </div>

      <section className="px-5 py-6">
        <Kicker action="See all" to="/pro/profile">
          Already published
        </Kicker>
        <p className="mt-2 caps-sm t-faint tnum">
          {mine(clips).length} reels · {mine(reads).length} articles · {pro.content.length} pieces
        </p>
        <div className="mt-3">
          {pro.content.map((c) => (
            <Row
              key={c.id}
              onClick={() => showToast(`${c.title} — prototype only`)}
              title={c.title}
              meta={c.views}
              note={c.type}
            />
          ))}
        </div>
      </section>

      <div className="h-24" />
    </>
  )
}
