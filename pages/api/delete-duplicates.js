// pages/api/delete-duplicates.js
// Deletes specific duplicate files from storage, and any gallery_media/
// messages rows that pointed at them, matched by exact filename (not
// substring) so unrelated rows are never touched and none are missed.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'

// extract the exact filename Supabase stores at the end of a public URL,
// stripping any query string
const fileNameFromUrl = (url) => {
  if (!url) return null
  const part = String(url).split(`/${BUCKET}/`)[1]
  if (!part) return null
  return part.split('?')[0]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { fileNames } = req.body
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return res.status(400).json({ error: 'No files provided' })
  }
  const safe = fileNames.filter(f => typeof f === 'string' && !f.includes('/'))
  if (safe.length === 0) {
    return res.status(400).json({ error: 'Nothing eligible to delete' })
  }
  const safeSet = new Set(safe)

  try {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(safe)
    if (error) return res.status(500).json({ error: error.message })

    let clearedRows = 0

    // match by the EXACT filename parsed from the stored URL, never a
    // loose substring check, so rows are neither missed nor wrongly caught
    const { data: galRows } = await supabaseAdmin.from('gallery_media').select('id, url, poster_url, thumbnail_url')
    const galDead = (galRows || [])
      .filter(r => safeSet.has(fileNameFromUrl(r.url)))
      .map(r => r.id)
    if (galDead.length) {
      await supabaseAdmin.from('gallery_media').delete().in('id', galDead)
      clearedRows += galDead.length
    }

    const { data: msgRows } = await supabaseAdmin.from('messages').select('id, content')
    const msgDead = (msgRows || [])
      .filter(r => safeSet.has(fileNameFromUrl(r.content)))
      .map(r => r.id)
    if (msgDead.length) {
      await supabaseAdmin.from('messages').delete().in('id', msgDead)
      clearedRows += msgDead.length
    }

    return res.status(200).json({ deleted: safe.length, clearedRows })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
