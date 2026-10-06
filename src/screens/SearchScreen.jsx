import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Plate from '../components/Plate.jsx'
import { PopAvatar } from '../components/Pop.jsx'
import ProductArt from '../components/ProductArt.jsx'
import { Search } from '../components/Primitives.jsx'
import { listConsultants } from '../lib/consultants.js'
import { fetchFeed } from '../lib/content.js'
import { fetchProducts, productHref } from '../lib/shop.js'
import { authorHref } from './Home.jsx'

/**
 * Search, from Home (6 Oct 2026, Rahul: "search bar in home section").
 * One box over the three things people come for: astrologers, products,
 * and posts and blogs. Matched on this phone, over the lists the other tabs
 * already load — the roster, the catalogue and the newest 200 posts — so it
 * answers as you type and needs no search server. Older posts than those
 * are not found; that is the next step when there are thousands.
 */
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'people', label: 'Astrologers' },
  { key: 'products', label: 'Products' },
  { key: 'posts', label: 'Posts' },
]

const fold = (s) => (s || '').toString().toLowerCase().normalize('NFKD')

function matches(q, ...fields) {
  const words = fold(q).split(/\s+/).filter(Boolean)
  const hay = fold(fields.flat().join(' '))
  return words.every((w) => hay.includes(w))
}

export default function SearchScreen() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [data, setData] = useState(null)
  const box = useRef(null)

  useEffect(() => {
    let live = true
    Promise.all([
      listConsultants().catch(() => []),
      fetchProducts().catch(() => []),
      fetchFeed({ kinds: ['post', 'clip', 'article'], limit: 200 }).catch(() => []),
    ]).then(([people, products, posts]) => live && setData({ people, products, posts }))
    box.current?.querySelector('input')?.focus()
    return () => {
      live = false
    }
  }, [])

  const found = useMemo(() => {
    if (!data || !query.trim()) return null
    const q = query.trim()
    return {
      people: data.people.filter((c) => matches(q, c.name, c.specialization, c.category, c.languages)),
      products: data.products.filter((p) => matches(q, p.name, p.subtitle, p.brand, p.categories, p.subcategories)),
      posts: data.posts.filter((p) => matches(q, p.title, p.caption, p.body, p.consultant)),
    }
  }, [data, query])

  const show = (k) => tab === 'all' || tab === k
  const cap = tab === 'all' ? 5 : 50
  const none = found && !found.people.length && !found.products.length && !found.posts.length

  return (
    <>
      <TopBar title="Search" back backTo="/home" />
      <div ref={box}>
        <Search value={query} onChange={setQuery} placeholder="Astrologers, products, posts" />
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {TABS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)} className="pill caps-sm flex-none">
            {t.label}
            {found && t.key !== 'all' ? ` · ${found[t.key].length}` : ''}
          </button>
        ))}
      </div>

      {!data ? (
        <Loader className="py-16" />
      ) : !found ? (
        <p className="px-6 py-12 text-center text-meta t-faint">
          Type a name, a problem like “marriage” or “career”, a stone, or a word from a post.
        </p>
      ) : none ? (
        <p className="px-6 py-12 text-center text-meta t-faint">Nothing matches “{query.trim()}”.</p>
      ) : (
        <div className="pb-24">
          {show('people') && found.people.length > 0 && (
            <Group title="Astrologers" more={tab === 'all' && found.people.length > cap} onMore={() => setTab('people')}>
              {found.people.slice(0, cap).map((c) => (
                <Link key={c.id} to={`/consult/${c.id}`} className="flex items-center gap-3 px-4 py-2.5">
                  <PopAvatar initials={c.initials} size={40} online={c.online} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta font-semibold t-heading">{c.name}</span>
                    <span className="block truncate text-micro t-faint">
                      {[c.specialization, (c.languages || []).join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {c.perMinute && <span className="flex-none caps-sm gold tnum">₹{c.perMinute.price_paise / 100}/min</span>}
                </Link>
              ))}
            </Group>
          )}

          {show('products') && found.products.length > 0 && (
            <Group title="Products" more={tab === 'all' && found.products.length > cap} onMore={() => setTab('products')}>
              {found.products.slice(0, cap).map((p) => (
                <Link key={p.id} to={productHref(p)} className="flex items-center gap-3 px-4 py-2.5">
                  <ProductArt product={p} className="h-12 w-12 flex-none rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta font-semibold t-heading">{p.name}</span>
                    <span className="block truncate text-micro t-faint">{p.brand || p.category}</span>
                  </span>
                  <span className="flex-none text-meta gold tnum">₹{p.price.toLocaleString('en-IN')}</span>
                </Link>
              ))}
            </Group>
          )}

          {show('posts') && found.posts.length > 0 && (
            <Group title="Posts and blogs" more={tab === 'all' && found.posts.length > cap} onMore={() => setTab('posts')}>
              {found.posts.slice(0, cap).map((p) => (
                <Link
                  key={p.id}
                  to={p.kind === 'article' ? `/read/${p.id}` : p.kind === 'clip' ? `/reels/${p.id}` : authorHref(p)}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  {p.mediaUrl && p.kind !== 'clip' ? (
                    <img src={p.mediaUrl} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-lg object-cover" />
                  ) : (
                    <Plate seed={p.id} className="h-12 w-12 flex-none !rounded-lg" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta font-semibold t-heading">{p.title || p.caption || p.body}</span>
                    <span className="block truncate text-micro t-faint">
                      {p.kind === 'article' ? 'Blog' : p.kind === 'clip' ? 'Reel' : 'Post'} · {p.consultant}
                    </span>
                  </span>
                </Link>
              ))}
            </Group>
          )}
        </div>
      )}
    </>
  )
}

function Group({ title, more, onMore, children }) {
  return (
    <section className="border-b border-rule py-2">
      <div className="flex items-baseline justify-between px-4 py-2">
        <h2 className="caps-sm t-faint">{title}</h2>
        {more && (
          <button type="button" onClick={onMore} className="caps-sm gold">
            See all
          </button>
        )}
      </div>
      {children}
    </section>
  )
}
