import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Plate from '../components/Plate.jsx'
import { PopAvatar } from '../components/Pop.jsx'
import ProductArt from '../components/ProductArt.jsx'
import { Search } from '../components/Primitives.jsx'
import { listConsultants } from '../lib/consultants.js'
import { fetchFeed } from '../lib/content.js'
import { fetchProducts, productHref } from '../lib/shop.js'
import { fetchAssets } from '../lib/bhakti.js'
import { authorHref } from './Home.jsx'
import VerifiedMark from '../components/VerifiedMark.jsx'
import { searchPeople } from '../lib/people.js'
import { findGroups, kindLabel } from '../lib/groups.js'

/**
 * Search, from Home (6 Oct 2026, Rahul: "search bar in home section").
 * One box over the three things people come for: astrologers, products,
 * and posts and blogs. Matched on this phone, over the lists the other tabs
 * already load — the roster, the catalogue and the newest 200 posts — so it
 * answers as you type and needs no search server. Older posts than those
 * are not found; that is the next step when there are thousands.
 */
// People and Groups joined on 14 Oct 2026 (Rahul), Products fourth. `people`
// stays the astrologers' key, so old `?in=people` links still land there.
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'users', label: 'People' },
  { key: 'people', label: 'Astrologers' },
  { key: 'products', label: 'Products' },
  { key: 'groups', label: 'Groups' },
  { key: 'posts', label: 'Posts' },
  { key: 'bhakti', label: 'Bhakti' },
]
const BHAKTI_KIND = { status: 'Status', wallpaper: 'Wallpaper', bhajan: 'Bhajan', mantra: 'Mantra', tune: 'Tune', aarti: 'Aarti' }

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

const fold = (s) => (s || '').toString().toLowerCase().normalize('NFC')

/* Topics, in both scripts (6 Oct 2026: Rahul looked for his शनि ग्रह
   article). A word typed in Latin letters also finds its Devanagari, and
   the reverse — people write "shani", "Shani dev" and "शनि" for one thing. */
const TOPICS = [
  ['shani', 'saturn', 'शनि'], ['surya', 'sun', 'सूर्य'], ['chandra', 'moon', 'चंद्र', 'चन्द्र'],
  ['mangal', 'mars', 'मंगल'], ['budh', 'mercury', 'बुध'], ['guru', 'brihaspati', 'jupiter', 'गुरु', 'बृहस्पति'],
  ['shukra', 'venus', 'शुक्र'], ['rahu', 'राहु'], ['ketu', 'केतु'], ['grah', 'graha', 'planet', 'ग्रह'],
  ['kundli', 'kundali', 'horoscope', 'कुंडली', 'कुण्डली'], ['rashi', 'sign', 'राशि'], ['dosh', 'dosha', 'दोष'],
  ['bhav', 'bhava', 'house', 'भाव'], ['vivah', 'shaadi', 'marriage', 'विवाह', 'शादी'],
  ['career', 'naukri', 'job', 'करियर', 'नौकरी'], ['dhan', 'money', 'paisa', 'धन', 'पैसा'],
  ['sade sati', 'sadesati', 'साढ़े साती', 'साढ़ेसाती'], ['upay', 'remedy', 'remedies', 'उपाय'],
  ['ratna', 'gem', 'gemstone', 'रत्न'], ['rudraksha', 'रुद्राक्ष'], ['mantra', 'मंत्र', 'मन्त्र'],
  ['puja', 'pooja', 'पूजा'], ['yog', 'yoga', 'योग'], ['nakshatra', 'नक्षत्र'], ['lagna', 'ascendant', 'लग्न'],
  ['neelam', 'blue sapphire', 'नीलम'], ['pukhraj', 'yellow sapphire', 'पुखराज'], ['tarot', 'टैरो'],
]
const ALIASES = new Map()
for (const group of TOPICS) for (const word of group) ALIASES.set(word, group)

function matches(q, ...fields) {
  const hay = fold(fields.flat().join(' '))
  const words = fold(q).split(/\s+/).filter(Boolean)
  // Each word must be found — as typed, or as any spelling of its topic.
  return words.every((w) => (ALIASES.get(w) ?? [w]).some((form) => hay.includes(form)))
}

export default function SearchScreen() {
  const [params] = useSearchParams()
  // `q` arrives from a tapped #hashtag (10 Oct 2026).
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [tab, setTab] = useState(() => (['users', 'people', 'products', 'groups', 'posts', 'bhakti'].includes(params.get('in')) ? params.get('in') : 'all'))
  const [data, setData] = useState(null)
  /* People and groups are asked of the server as you type (there are too
     many to load whole), a moment after the typing stops. */
  const [remote, setRemote] = useState({ q: '', users: [], groups: [] })
  useEffect(() => {
    const q = query.trim()
    if (q.replace(/^@/, '').length < 2) {
      setRemote({ q, users: [], groups: [] })
      return undefined
    }
    let live = true
    const timer = setTimeout(() => {
      Promise.all([searchPeople(q), findGroups(q).catch(() => [])]).then(
        ([users, groups]) => live && setRemote({ q, users, groups }),
      )
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])
  const box = useRef(null)

  useEffect(() => {
    let live = true
    Promise.all([
      listConsultants().catch(() => []),
      fetchProducts().catch(() => []),
      fetchFeed({ kinds: ['post', 'clip', 'article'], limit: 200 }).catch(() => []),
      fetchAssets().catch(() => []),
    ]).then(([people, products, posts, bhakti]) => live && setData({ people, products, posts, bhakti }))
    box.current?.querySelector('input')?.focus()
    return () => {
      live = false
    }
  }, [])

  const found = useMemo(() => {
    if (!data || !query.trim()) return null
    const q = query.trim()
    return {
      users: remote.q === q ? remote.users : [],
      groups: remote.q === q ? remote.groups : [],
      people: data.people.filter((c) => matches(q, c.name, c.specialization, c.category, c.languages)),
      products: data.products.filter((p) => matches(q, p.name, p.subtitle, p.brand, p.categories, p.subcategories)),
      posts: data.posts.filter((p) => matches(q, p.title, p.caption, p.body, p.consultant)),
      bhakti: data.bhakti.filter((a) => matches(q, a.title, a.deity, BHAKTI_KIND[a.kind] || a.kind)),
    }
  }, [data, query, remote])

  const show = (k) => tab === 'all' || tab === k
  const cap = tab === 'all' ? 5 : 50
  const none = found && !found.users.length && !found.groups.length && !found.people.length && !found.products.length && !found.posts.length && !found.bhakti.length

  return (
    <>
      <TopBar title="Search" back backTo="/home" />
      <div ref={box}>
        <Search value={query} onChange={setQuery} placeholder="People, astrologers, products, groups" />
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
          Type a name, a problem like “marriage” or “career”, a stone, a deity, or a word from a post.
        </p>
      ) : none ? (
        <p className="px-6 py-12 text-center text-meta t-faint">Nothing matches “{query.trim()}”.</p>
      ) : (
        <div className="pb-24">
          {show('users') && found.users.length > 0 && (
            <Group title="People" more={tab === 'all' && found.users.length > cap} onMore={() => setTab('users')}>
              {found.users.slice(0, cap).map((u) => (
                <Link key={u.id} to={u.is_consultant ? `/consult/${u.id}` : `/u/${u.id}`} className="flex items-center gap-3 px-4 py-2.5">
                  <PopAvatar initials={initialsOf(u.name)} src={u.avatar_url} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-meta font-semibold t-heading">
                      <span className="truncate">{u.name}</span>
                      {u.is_consultant ? <VerifiedMark size={14} tone="pro" /> : u.is_creator ? <VerifiedMark size={14} tone="creator" /> : null}
                    </span>
                    {u.username && <span className="block truncate text-micro t-faint">@{u.username}</span>}
                  </span>
                </Link>
              ))}
            </Group>
          )}

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
                  {/* The cheapest of chat, video and audio (10 Oct 2026). */}
                  {c.perMinute && <span className="flex-none caps-sm gold tnum">from ₹{c.perMinute.price_paise / 100}/min</span>}
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

          {show('groups') && found.groups.length > 0 && (
            <Group title="Groups" more={tab === 'all' && found.groups.length > cap} onMore={() => setTab('groups')}>
              {found.groups.slice(0, cap).map((g) => (
                <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center gap-3 px-4 py-2.5">
                  <PopAvatar initials={initialsOf(g.name)} src={g.avatar_url} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta font-semibold t-heading">{g.name}</span>
                    <span className="block truncate text-micro t-faint tnum">
                      {kindLabel(g.kind)}
                      {g.city ? ` · ${g.city}` : ''} · {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                    </span>
                  </span>
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
          {show('bhakti') && found.bhakti.length > 0 && (
            <Group title="Bhakti" more={tab === 'all' && found.bhakti.length > cap} onMore={() => setTab('bhakti')}>
              {found.bhakti.slice(0, cap).map((a) => (
                <Link
                  key={a.id}
                  to={`/bhakti?${new URLSearchParams({ kind: a.kind, q: a.title })}`}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  {['status', 'wallpaper'].includes(a.kind) && (a.previewUrl || a.url) ? (
                    <img src={a.previewUrl || a.url} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-lg object-cover" />
                  ) : (
                    <Plate seed={a.id} className="h-12 w-12 flex-none !rounded-lg" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta font-semibold t-heading">{a.title}</span>
                    <span className="block truncate text-micro t-faint">
                      {[BHAKTI_KIND[a.kind] || a.kind, a.deity].filter(Boolean).join(' · ')}
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
