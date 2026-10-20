import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AvatarCropper from '../components/AvatarCropper.jsx'
import { TopBar } from '../components/Chrome.jsx'
import { PopAvatar, PopButton } from '../components/Pop.jsx'
import { GROUP_KINDS, createGroup, editGroup, fetchGroup } from '../lib/groups.js'
import { uploadMedia } from '../lib/content.js'
import { useStore } from '../store.jsx'

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/**
 * Start a group, or edit yours (14 Oct 2026, Phase 15c): `/groups/new` and
 * `/groups/:id/edit`. A name, what it is (mandir, sampradaya, city,
 * other), the city, a line about it and a photo. You become its admin.
 */
export default function NewGroup() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('mandir')
  const [city, setCity] = useState('')
  const [about, setAbout] = useState('')
  const [photo, setPhoto] = useState('')
  const [busy, setBusy] = useState(false)
  const picker = useRef(null)
  const [chosen, setChosen] = useState(null)

  useEffect(() => {
    if (!id) return
    fetchGroup(id)
      .then((g) => {
        setName(g.name)
        setKind(g.kind)
        setCity(g.city || '')
        setAbout(g.about || '')
        setPhoto(g.avatar_url || '')
      })
      .catch((err) => showToast(err.message))
  }, [id, showToast])

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return showToast('Choose a photo.')
    setChosen(file)
  }

  // The chosen photo, placed and zoomed in the circle, then uploaded.
  async function upload(file) {
    setChosen(null)
    setBusy(true)
    try {
      setPhoto(await uploadMedia(file))
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    if (busy || name.trim().length < 3) return
    setBusy(true)
    try {
      const fields = { name: name.trim(), kind, city: city.trim(), about: about.trim(), avatar_url: photo }
      const g = id ? await editGroup(id, fields) : await createGroup(fields)
      navigate(`/groups/${g.id}`, { replace: true })
    } catch (err) {
      showToast(err.message)
      setBusy(false)
    }
  }

  const input =
    'mt-1.5 w-full rounded-xl border border-stroke bg-white px-3 py-2.5 text-body text-t1 outline-none focus:border-gold'

  return (
    <>
      <TopBar title={id ? 'Edit group' : 'New group'} back backTo={id ? `/groups/${id}` : '/messages'} />
      <form onSubmit={save} className="px-5 pb-10 pt-5">
        <button type="button" onClick={() => picker.current?.click()} className="flex items-center gap-4">
          <PopAvatar initials={initialsOf(name)} src={photo || null} size={72} />
          <span className="text-meta font-semibold gold">{photo ? 'Change photo' : 'Add a photo'}</span>
        </button>
        <input ref={picker} type="file" accept="image/*" className="hidden" onChange={pick} />
        {chosen && (
          <AvatarCropper file={chosen} title="Adjust the photo" onCancel={() => setChosen(null)} onDone={upload} />
        )}

        <label className="mt-6 block text-meta font-semibold t-heading">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Shirdi Sai Bhakt, Pune" className={input} />
        </label>

        <p className="mt-5 text-meta font-semibold t-heading">What is it</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {GROUP_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              aria-pressed={kind === k.key}
              className={`rounded-full px-4 py-2 text-meta font-semibold ${kind === k.key ? 'bg-gold-fill text-white' : 'bg-surface-2 t-heading'}`}
            >
              {k.label}
            </button>
          ))}
        </div>

        <label className="mt-5 block text-meta font-semibold t-heading">
          City
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="Pune" className={input} />
        </label>

        <label className="mt-5 block text-meta font-semibold t-heading">
          About
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} maxLength={500} rows={3} placeholder="Who it is for, and what is posted here" className={input} />
        </label>

        <PopButton type="submit" className="mt-7" disabled={busy || name.trim().length < 3}>
          {busy ? 'Saving…' : id ? 'Save' : 'Start the group'}
        </PopButton>
        {!id && <p className="mt-3 text-micro t-faint">You become its admin. Anyone can join; you can remove members and posts.</p>}
      </form>
    </>
  )
}
