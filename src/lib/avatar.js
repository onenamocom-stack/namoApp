import { supabase } from './supabase.js'

/**
 * Profile pictures.
 *
 * Its own file rather than a third function in `content.js`, which is "the
 * feed, the studio's publish path, and reviews" by its own header. A face is
 * none of those, and the two paths want opposite things from storage: a post's
 * media is timestamped so re-uploading keeps both files, an avatar is a fixed
 * path so re-uploading replaces the one before it.
 *
 * ── OWN FACE ONLY, AND THAT IS A SCHEMA FACT, NOT A TODO ───────────────────
 * `profiles_select_own` is `using (id = auth.uid())`. A profile row carries a
 * phone number, an email and a birth time, so it is not going to be widened to
 * let a picture through. Everybody else's face needs a narrow public
 * projection — `authors_public` (025) is that projection and gaining an
 * `avatar_url` is the follow-up. Until then this powers the four places that
 * render YOUR OWN avatar and nothing else.
 */

const BUCKET = 'content-media'

/**
 * Upload, point the profile row at it, return the URL.
 *
 * The path is fixed — `<uid>/avatar` — with `upsert`, so a second picture
 * replaces the first instead of leaving the old one orphaned in the bucket
 * forever. `content.js`'s `uploadMedia` deliberately does the opposite, which
 * is why this is not a flag on that function.
 *
 * A fixed path means a fixed URL, which the browser will happily serve from
 * cache after a replacement. The `?v=` is what makes a new face appear without
 * a hard reload; it is stored on the row, so every reader gets the same
 * busted URL rather than each having to know the trick.
 */
export async function uploadAvatar(file) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in to change your picture')

  const path = `${user.id}/avatar`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (upErr) {
    if (/exceeded the maximum allowed size/i.test(upErr.message)) {
      throw new Error('That image is over 25 MB')
    }
    if (/mime type/i.test(upErr.message)) throw new Error('Pick an image file')
    throw upErr
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const url = `${data.publicUrl}?v=${Date.now()}`

  /* `avatar_url` is writable only because `027` re-issued the column grant.
     Without it this UPDATE reports success and changes nothing — the RLS
     policy passes and the privilege layer refuses, which is the quietest
     failure in this schema. */
  const { error: rowErr } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', user.id)

  if (rowErr) throw rowErr
  return url
}
