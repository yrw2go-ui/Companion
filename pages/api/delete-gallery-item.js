// pages/api/delete-gallery-item.js
// Server-side delete using the service role key, so storage removal isn't
// blocked by client RLS. Removes the file(s), the row, and any folder mapping.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'

const fileFromUrl = (url) => {
  if (!url) return null
  const part = String(url).split(`/${BUCKET}/`)[1]
  if (!part) return null
  return part.split('?')[0]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { source, id, itemKey, url, posterUrl } = req.body

  if (source === 'cards') {
    return res.status(400).json({ error: 'Card art must be managed from the Cards page' })
  }

  try {
    // 1. remove storage files (main + poster)
    const files = []
    const mainFile = fileFromUrl(url)
    if (mainFile) files.push(mainFile)
    const posterFile = fileFromUrl(posterUrl)
    if (posterFile) files.push(posterFile)

    if (files.length) {
      const { error: sErr } = await supabaseAdmin.storage.from(BUCKET).remove(files)
      if (sErr) {
        return res.status(500).json({ error: 'Storage removal failed: ' + sErr.message })
      }
    }

    // 2. remove the database row from the right table
    const table = source === 'messages' ? 'messages' : 'gallery_media'
    if (id) {
      const { error: rErr } = await supabaseAdmin.from(table).delete().eq('id', id)
      if (rErr) {
        return res.status(500).json({ error: 'Row delete failed: ' + rErr.message })
      }
    }

    // 3. clear any folder mapping
    if (source && itemKey) {
      await supabaseAdmin.from('folder_items').delete().eq('source', source).eq('item_key', itemKey)
    }

    return res.status(200).json({ ok: true, removedFiles: files.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
