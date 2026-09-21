/**
 * The profile slice of the store, against the Django API.
 *
 *   GET  {API}/profiles/me/   -> refreshProfile
 *   PATCH{API}/profiles/me/   -> saveProfile
 *
 * `userId` survives in refreshProfile's signature because the store still
 * gates on "is anybody signed in". It is never sent: the JWT is the
 * identity, and the URL carries no id at all (INSTRUCTIONS.md rule 3).
 * That is the whole difference from the PostgREST version, which had to
 * write `.eq('id', userId)` and could get it wrong.
 *
 * A failed read and "no row yet" both land on null here, exactly as they
 * did before — the store logs the first and every screen falls back to
 * seed identity for both. Unchanged, and still the weak spot.
 */
import { supabase } from './supabase.js'

/* VITE_DJANGO_API_URL already carries the /v1 prefix — the deployed libs
   (consultants, chat, content, …) all build `${API_BASE}${path}`. Prepending
   another /v1 here produced /v1/v1/… and a 404 on every call, which the UI
   showed as an em dash and an empty statement rather than an error. */
const API = import.meta.env.VITE_DJANGO_API_URL
if (!API) throw new Error('VITE_DJANGO_API_URL is not set')

/* The module-1 seam: the existing supabase-js session authorizes against
   Django — identity stays in Supabase Auth; getSession() reads the local
   token without a network round trip (wallet.clientlib.js's pattern). */
async function getToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${API}/profiles${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    /* A refusal the server did not shape as JSON — the network, not a rule. */
  }
  return { status: response.status, body: payload }
}

/* The sentence a refusal carries, or an honest generic when nothing
   readable came back (the server's job is a reason the interface can
   show, and dropping it here wastes that). */
function refusalMessage(result, fallback) {
  return result.body?.message ?? fallback
}

/* ── the store.jsx profile api ───────────────────────────────────────────────
   setProfile / setProfileLoading are the store's own setters — the api keeps
   the load-failed-is-not-no-profile semantics store.jsx documents: it logs
   and lands on null, it never throws into the auth effect. */
export function createProfileApi({
  getToken: tokenFn = getToken,
  setProfile,
  setProfileLoading = () => {},
}) {
  /* store.jsx's refreshProfile. `userId` is only the store's own guard for
     "nobody signed in" — the server decides whose row /me/ is from the JWT,
     and the URL carries no id at all (rule 3). */
  async function refreshProfile(userId) {
    if (!userId) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    const { status, body } = await call('/me/', { token: await tokenFn() })
    /* A failed load is not the same as "no profile", but both end up null
       here and every screen falls back — at minimum make it diagnosable,
       exactly like the current console.error path. A 404 means the signup
       trigger has not fired yet; the onboarding write creates the row. */
    if (status !== 200 || !body) {
      console.error('[profile] load failed:', status)
      setProfile(null)
    } else {
      setProfile(body)
    }
    setProfileLoading(false)
  }

  /* Computing.jsx's reveal-screen write (and any later edit): the writable
     columns only — name, email and the eight birth columns. The service
     applies what is present and leaves the rest alone; a refused shape
     (bad email, impossible date) throws the server's sentence so the
     screen's existing error block renders it. Returns the full updated row. */
  async function saveProfile(fields) {
    const token = await tokenFn()
    if (!token) throw new Error('Sign in to continue.')
    const result = await call('/me/', { method: 'PATCH', token, body: fields })
    if (result.status !== 200 || !result.body) {
      throw new Error(
        refusalMessage(result, 'Could not reach your profile. Try again.'),
      )
    }
    return result.body
  }

  return { refreshProfile, saveProfile }
}
