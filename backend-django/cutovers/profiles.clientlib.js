/**
 * CUTOVER — module 9 (profile + avatar): the profile slice of src/store.jsx
 * plus src/lib/avatar.js, rewritten against the Django API. Staged, NOT
 * applied — this is the last of the store split (module 8 took the wallet
 * half; the session/birth-draft/cart/reactions seams that remain are
 * module 10's).
 *
 * ── SAME-COMMIT NOTES FOR THE STORE SPLIT (module 9's half) ────────────────
 * store.jsx keeps its state and every export. Only the profile BLOCK
 * changes, and only its internals:
 *
 *   1. This file lands as `src/lib/profile.js`. store.jsx adds:
 *        import { createProfileApi } from './lib/profile.js'
 *        import { uploadAvatar } from './lib/avatar.js'   // unchanged import;
 *        // avatar.js's CONTENT is replaced by the uploadAvatar half below
 *        const profileApi = createProfileApi({ getToken, setProfile,
 *          setProfileLoading })
 *      near the top of AppProvider. `supabase` stays imported in store.jsx —
 *      the session still comes from Supabase Auth, and the access token IS
 *      the Django credential (the API verifies Supabase JWTs).
 *   2. refreshProfile(userId) -> `return profileApi.refreshProfile(userId)`.
 *      The error-is-not-absent warning in store.jsx still holds: a failed
 *      read logs and lands on null exactly like today's PostgREST error
 *      path, and a 404 (no row yet) is that same null, not an exception.
 *   3. src/lib/avatar.js is REPLACED by this file's uploadAvatar (same
 *      export name, same contract — returns the stored URL, throws an
 *      Error whose message is the sentence Profile.jsx already toasts).
 *      Profile.jsx needs no edit.
 *   4. src/screens/onboarding/Computing.jsx's write block (the
 *      `supabase.from('profiles').update({...})` with .eq('id', ...))
 *      becomes:
 *        await profileApi.saveProfile({
 *          name: birth.name,
 *          email: (birth.email ?? '').trim() || null,
 *          birth_date: toIsoDate(birth.date),
 *          birth_time: birth.timeKnown === false ? null : to24Hour(birth.time),
 *          birth_time_known: birth.timeKnown !== false,
 *          birth_place: birth.place,
 *          birth_lat: birth.lat,
 *          birth_lon: birth.lon,
 *          birth_zone: birth.zone,
 *        })
 *      Same shape, same keys — the service's allow-list is this exact set
 *      plus nothing. clearBirthDraft() and refreshProfile() stay in
 *      Computing, after the write. The `.eq('id', session.user.id)` goes
 *      away: the JWT is the identity (rule 3 — the client never sends one).
 *      On a refusal saveProfile throws Error(server message) so the
 *      existing setSaveError(error.message) path renders it unchanged.
 *   5. The wallet cutover's checkout prefill (module 8) reads
 *      profile?.name / profile?.email — it keeps working: `profile` state
 *      is the same PostgREST-shaped row it always was (the /me/ body is
 *      select('*') key for key).
 *   6. What is LEFT in store.jsx after this commit (module 10): session /
 *      sessionReady (Supabase Auth, never moves), the birth draft and its
 *      sessionStorage, consultant + refreshConsultant (already on the
 *      consultants API), me / useProfileFields / useConsultantFields (they
 *      read state, they never fetch), cart, flags/reactions wiring, chat
 *      overlay state, lang, toast.
 *
 * ── WHAT THE UI SEES ────────────────────────────────────────────────────────
 * Byte-parity is the contract (backend/INSTRUCTIONS.md §2). The /me/ row is
 * the PostgREST select('*') shape key for key, so useProfileFields and the
 * pro header read profile.birth_date / birth_time_known / avatar_url
 * exactly as today. Refusals carry the standard {ok, reason, message}
 * envelope (docs/02-TRD.md §6); the two sentences avatar.js used to mint
 * ('That image is over 25 MB', 'Pick an image file') become the media
 * presign gate's own sentences — and the cap is 10 MB, module 1's image
 * gate, not the old bucket's 25 MB. A face over 10 MB now hears about the
 * 10 MB, which is the limit that will actually refuse it.
 */

import { supabase } from './supabase.js'

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
  const response = await fetch(`${API}/v1/profiles${path}`, {
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

/* ── the avatar.js drop-in ───────────────────────────────────────────────────
   027's flow onto the media spine: the picture is a media asset (kind
   image, owned by the caller, bytes straight to R2 — Django never carries
   them), and the profiles row references the READY asset's public URL with
   a ?v= cache-bust, stored server-side so every reader gets the same busted
   URL. Same name and contract as today's uploadAvatar: resolve to the URL,
   reject with a sentence the AvatarPicker already toasts.

   The fixed `<uid>/avatar` path and its upsert go away — each upload is a
   new asset row and the profile points at the newest, so replacement is a
   pointer change, not a bucket delete, and there is no orphaned file. */
export async function uploadAvatar(file) {
  const token = await getToken()
  if (!token) throw new Error('Sign in to change your picture')

  /* 1. Ask for a presigned PUT — the media app's size/mime gate answers
     here (image/*, 10 MB cap) with a sentence, before anything uploads. */
  const presignResponse = await fetch(`${API}/v1/media/presign/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      kind: 'image',
      filename: file.name,
      size_bytes: file.size,
      mime: file.type,
    }),
  })
  let presign = null
  try {
    presign = await presignResponse.json()
  } catch {
    /* not JSON — the network */
  }
  if (presignResponse.status !== 201 || !presign) {
    throw new Error(
      presign?.message ?? 'Could not start that upload. Try again.',
    )
  }

  /* 2. The bytes go straight to the bucket; Django and Postgres never see
     them. A failed PUT is a network fact, not a refusal. */
  const put = await fetch(presign.upload_url, {
    method: 'PUT',
    headers: presign.headers,
    body: file,
  })
  if (!put.ok) throw new Error('Could not upload that picture. Try again.')

  /* 3. The row flips processing -> ready, owner-scoped and idempotent. */
  const confirm = await fetch(`${API}/v1/media/${presign.asset_id}/confirm/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (confirm.status !== 200) {
    let body = null
    try {
      body = await confirm.json()
    } catch {
      /* not JSON — the network */
    }
    throw new Error(body?.message ?? 'Could not confirm that upload. Try again.')
  }

  /* 4. Point the caller's profile row at the READY asset. The server
     verifies ownership and readiness again — someone else's asset or an
     unconfirmed one is a refusal, never a write. */
  const set = await call('/me/avatar/', {
    method: 'POST',
    token,
    body: { asset_id: presign.asset_id },
  })
  if (set.status !== 200 || !set.body) {
    throw new Error(
      refusalMessage(set, 'Could not set that picture. Try again.'),
    )
  }
  return set.body.avatar_url
}
