/**
 * One upload, three steps, shared.
 *
 * presign → PUT straight to the bucket → confirm. Django never carries the
 * bytes, which is what makes this usable on Indian mobile data and what
 * keeps a file nobody has vetted out of the app server.
 *
 * Lifted out of `avatar.js` on 27 Sep 2026, when a consultant's degree
 * certificate became the second thing to upload. The steps were identical
 * and only the `kind` differed — the third caller would have been the third
 * copy of a retry-free network dance.
 *
 * The KIND decides where the bytes land, and that is the server's call, not
 * this file's: `image` goes to the public bucket, `document` to the private
 * one (`apps/media/providers.py`). A document therefore has **no public
 * URL**, and this returns null for it rather than inventing a link into a
 * bucket that serves nobody.
 */

import { supabase } from './supabase.js'

const API = import.meta.env.VITE_DJANGO_API_URL

async function token() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export async function uploadAsset(file, kind) {
  const jwt = await token()
  if (!jwt) throw new Error('Sign in first')

  /* 1. The size and mime gate answers HERE, with a sentence, before a byte
     moves — a 6 MB scan is refused in a round trip rather than after an
     upload on a slow connection. */
  const presignResponse = await fetch(`${API}/media/presign/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      kind,
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
    throw new Error(presign?.message ?? 'Could not start that upload. Try again.')
  }

  /* 2. Bytes straight to the bucket. A failed PUT is a network fact, not a
     refusal, so it gets a network sentence. */
  const put = await fetch(presign.upload_url, {
    method: 'PUT',
    headers: presign.headers,
    body: file,
  })
  if (!put.ok) throw new Error('Could not upload that file. Try again.')

  /* 3. processing → ready, owner-scoped and idempotent. Nothing may point
     at an asset that never confirmed. */
  const confirm = await fetch(`${API}/media/${presign.asset_id}/confirm/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
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

  return { assetId: presign.asset_id, publicUrl: presign.public_url ?? null }
}
