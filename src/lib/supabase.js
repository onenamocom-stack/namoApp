import { createClient } from '@supabase/supabase-js'

/**
 * THE SESSION HAS TO SURVIVE CLOSING THE APP.
 *
 * This client used to be `createClient(url, key)` with no options, which is
 * not wrong — supabase-js already defaults to `persistSession: true` on
 * `localStorage`. It is just not enough here, and the reported symptom was
 * exactly that: sign in, close the browser, come back signed out.
 *
 * `localStorage` is the wrong single bet for how this app is actually opened:
 *
 *   * an in-app browser (WhatsApp, Instagram) hands out storage that the host
 *     app empties when it kills the tab, and that is how most links here get
 *     opened
 *   * the Android WebView wrapper (Namo-debug.apk) clears DOM storage between
 *     launches unless the host explicitly persists it
 *   * iOS Safari evicts script-writable storage after seven idle days (ITP),
 *     so even a real browser forgets eventually
 *   * "clear cookies and site data on exit" is on by default on some Android
 *     builds
 *
 * So the session is written to BOTH `localStorage` and a first-party cookie,
 * and read back from whichever still has it. Cookies outlive all four cases
 * above. Neither store is more secure than the other — both are readable by
 * script on this origin, so this trades nothing away.
 *
 * PATH IS `/`, DELIBERATELY. The seeker app is served from `/namoApp/` and the
 * consultant app from `/namo-pro/` on one github.io origin, so they already
 * shared one `localStorage`. A cookie scoped to either path would sign you out
 * when you crossed between them, which is a thing the UI offers ("Switch to
 * seeking"). Origin-wide keeps the two halves behaving as one account.
 *
 * ponytail: chunked at 3.5 KB because a cookie is capped at ~4 KB and a
 * session with a fat `user_metadata` will exceed it. If a session ever needs
 * more than five chunks, stop mirroring the user object rather than adding a
 * sixth.
 */
const COOKIE_MAX_CHUNKS = 5
const COOKIE_CHUNK = 3500
const COOKIE_DAYS = 400 // the longest Chrome will honour

const canCookie = () => typeof document !== 'undefined'

function writeCookie(name, value, days) {
  if (!canCookie()) return
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  const age = days > 0 ? `; Max-Age=${days * 86400}` : '; Max-Age=0'
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/${age}; SameSite=Lax${secure}`
}

function readCookie(name) {
  if (!canCookie()) return null
  for (const part of document.cookie.split('; ')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1))
      } catch {
        return null // a half-written cookie is no cookie
      }
    }
  }
  return null
}

/* Chunk names are `<key>.0`, `<key>.1`, … and reading stops at the first gap,
   so a partially cleared set reads as absent rather than as truncated JSON. */
function cookieGet(key) {
  const first = readCookie(`${key}.0`)
  if (first === null) return null
  let out = first
  for (let i = 1; i < COOKIE_MAX_CHUNKS; i++) {
    const part = readCookie(`${key}.${i}`)
    if (part === null) break
    out += part
  }
  return out
}

function cookieSet(key, value) {
  const n = Math.ceil(value.length / COOKIE_CHUNK)
  if (n > COOKIE_MAX_CHUNKS) {
    // Better to keep localStorage's copy than to write a session that will
    // read back truncated and fail to parse on every load.
    cookieRemove(key)
    return
  }
  for (let i = 0; i < n; i++) {
    writeCookie(`${key}.${i}`, value.slice(i * COOKIE_CHUNK, (i + 1) * COOKIE_CHUNK), COOKIE_DAYS)
  }
  // clear any chunk left behind by a longer previous session
  for (let i = n; i < COOKIE_MAX_CHUNKS; i++) {
    if (readCookie(`${key}.${i}`) !== null) writeCookie(`${key}.${i}`, '', 0)
  }
}

function cookieRemove(key) {
  for (let i = 0; i < COOKIE_MAX_CHUNKS; i++) writeCookie(`${key}.${i}`, '', 0)
}

/* Every localStorage call is wrapped: in a private window the accessor itself
   throws, and an auth client that throws on boot is an app that never renders. */
const local = {
  get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* cookie is the fallback; carry on */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* nothing to do */
    }
  },
}

const durableStorage = {
  getItem(key) {
    const fromLocal = local.get(key)
    if (fromLocal !== null) return fromLocal
    const fromCookie = cookieGet(key)
    // The cookie won, which means localStorage was wiped. Re-seed it so the
    // rest of the session runs on the fast path.
    if (fromCookie !== null) local.set(key, fromCookie)
    return fromCookie
  },
  setItem(key, value) {
    local.set(key, value)
    cookieSet(key, value)
  },
  removeItem(key) {
    local.remove(key)
    cookieRemove(key)
  },
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: durableStorage,
      persistSession: true,
      autoRefreshToken: true,
      /* OFF, and it has to be. This app is a HashRouter, so every URL carries
         a hash like `#/onboarding/phone?next=pro` — and URL session detection
         parses the hash looking for an auth callback it will never find here,
         because the only way in is a phone OTP. No magic links, no OAuth,
         nothing that arrives in a URL. Leaving it on is a parser pointed at
         the router's own state for no benefit. */
      detectSessionInUrl: false,
    },
  },
)
