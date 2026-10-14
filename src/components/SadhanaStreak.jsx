import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { fetchStreak } from '../lib/streak.js'

/**
 * The sadhana streak on a profile (14 Oct 2026, Phase 15c): "7-day sadhana
 * streak" beside a mala. Somebody else's shows only while it runs; your own
 * also says how to start one.
 */
export default function SadhanaStreak({ profileId = null, own = false, className = '' }) {
  const [s, setS] = useState(null)

  useEffect(() => {
    let live = true
    fetchStreak(own ? null : profileId).then((r) => live && setS(r))
    const onMark = (e) => own && setS(e.detail)
    window.addEventListener('namo-streak', onMark)
    return () => {
      live = false
      window.removeEventListener('namo-streak', onMark)
    }
  }, [profileId, own])

  if (!s) return null
  if (!s.current) {
    if (!own) return null
    return (
      <Link to="/bhakti" className={`flex items-center gap-1.5 text-meta t-faint ${className}`}>
        <Icon name="mala" size={16} />
        <span>Finish a japa in Bhakti to start your sadhana streak</span>
      </Link>
    )
  }
  return (
    <p className={`flex items-center gap-1.5 text-meta t-heading ${className}`}>
      <Icon name="mala" size={16} />
      <span className="tnum">
        <span className="font-semibold">{s.current}-day</span> sadhana streak
        {s.best > s.current && <span className="t-faint"> · best {s.best}</span>}
      </span>
    </p>
  )
}
