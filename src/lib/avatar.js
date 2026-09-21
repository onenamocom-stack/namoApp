/**
 * uploadAvatar — the picture, onto the media spine.
 *
 * Same export name and same contract the PostgREST version had: it returns
 * the stored URL and throws an Error whose message is the sentence
 * Profile.jsx already toasts, so that screen needed no edit.
 *
 * What changed underneath is where the bytes go. The browser asks the API
 * to presign, PUTs straight to R2, then confirms — Django never carries
 * the file. The profiles row ends up pointing at the READY asset's public
 * URL.
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
  const presignResponse = await fetch(`${API}/media/presign/`, {
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
  const confirm = await fetch(`${API}/media/${presign.asset_id}/confirm/`, {
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
