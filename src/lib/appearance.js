/**
 * Banners and the festive theme, set from the console (4 Oct 2026).
 *
 * One public read at start-up (`GET /appearance/`), shared by every screen
 * that asks. If it fails, nothing changes: the screens keep their built-in
 * banners and the app keeps its usual colours. A slow or broken endpoint
 * must never cost a banner rail or a button colour.
 */
import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

let pending = null

export function loadAppearance() {
  if (!pending) {
    pending = fetch(`${API_BASE}/appearance/`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return pending
}

export function useAppearance() {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    loadAppearance().then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [])
  return data
}

/**
 * A screen's banner rail: the console's banners for `placement` first, then
 * the screen's own built-in ones — unless one of the console's says to
 * replace them. Console banners come back with `remote: true` and plain text
 * (Hindi where the console gave it); built-in ones are returned untouched.
 */
export function useBanners(placement, builtIns, lang = 'en') {
  const data = useAppearance()
  const remote = (data?.banners ?? [])
    .filter((b) => b.placement === placement)
    .map((b) => {
      const hi = lang === 'hi' ? b.hi ?? {} : {}
      return {
        id: `remote-${b.id}`,
        remote: true,
        kicker: hi.kicker || b.kicker,
        title: hi.title || b.title,
        note: hi.note || b.note,
        cta: hi.cta || b.cta,
        from: b.from,
        to: b.to,
        image: b.image_url,
        link: b.link,
        art: 'orbit',
      }
    })
  const replace = (data?.banners ?? []).some((b) => b.placement === placement && b.replace_defaults)
  return replace && remote.length ? remote : [...remote, ...builtIns]
}

/** The background of a banner: its gradient, over its picture when it has one. */
export function bannerStyle(b) {
  if (!b.image) return { backgroundImage: `linear-gradient(135deg, ${b.from} 0%, ${b.to} 100%)` }
  return {
    backgroundImage: `linear-gradient(135deg, ${b.from}e6 0%, ${b.to}99 100%), url("${b.image}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

/** Where a console banner goes when tapped: an app path or a website. */
export function followBanner(b, navigate) {
  if (!b.link) return
  if (b.link.startsWith('/')) navigate(b.link)
  else if (b.link.startsWith('https://')) window.open(b.link, '_blank', 'noopener')
}

/**
 * The festive theme, as CSS variables on <html>. Every colour in the app is
 * a token (index.css), so two colours repaint it: the accent replaces the
 * saffron family and the button replaces the green. Shades are mixed from
 * them here, the way the usual palette's are hand-picked.
 */
const THEMED = [
  '--gold-fill', '--orange-hi', '--orange-lo', '--orange-edge', '--gold', '--gold-dim',
  '--gold-wash', '--surface', '--surface-2', '--btn', '--btn-deep', '--btn-edge',
]

export function applyTheme(theme) {
  const root = document.documentElement.style
  if (!theme) {
    THEMED.forEach((v) => root.removeProperty(v))
    return
  }
  const a = theme.accent
  const b = theme.button
  const set = {
    '--gold-fill': a,
    '--orange-hi': `color-mix(in srgb, ${a} 70%, white)`,
    '--orange-lo': a,
    '--orange-edge': `color-mix(in srgb, ${a} 85%, black)`,
    '--gold': `color-mix(in srgb, ${a} 72%, black)`,
    '--gold-dim': `color-mix(in srgb, ${a} 60%, black)`,
    '--gold-wash': `color-mix(in srgb, ${a} 14%, transparent)`,
    '--surface': `color-mix(in srgb, ${a} 8%, white)`,
    '--surface-2': `color-mix(in srgb, ${a} 18%, white)`,
    '--btn': b,
    '--btn-deep': `color-mix(in srgb, ${b} 85%, black)`,
    '--btn-edge': `color-mix(in srgb, ${b} 75%, black)`,
  }
  Object.entries(set).forEach(([k, v]) => root.setProperty(k, v))
}
