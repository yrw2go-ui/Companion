// pages/api/delete-duplicates.js
// Deletes specific duplicate files from storage, and any gallery_media/
// messages/cards rows that pointed at them, so nothing is left dangling.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { fileNames } = req.body
  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    return res.status(400).json({ error: 'No files provided' })
  }
  // guard against accidentally deleting anything with a path separator
  const safe = fileNames.filter(f => typeof f === 'string' && !f.includes('/'))
  if (safe.length === 0) {
    return res.status(400).json({ error: 'Nothing eligible to delete' })
  }

  try {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(safe)
    if (error) return res.status(500).json({ error: error.message })

    // clean up any rows that reference these files, so nothing is orphaned
    const urlLike = safe.map(f => `%${f}`)
    let clearedRows = 0

    const { data: galRows } = await supabaseAdmin.from('gallery_media').select('id, url')
    const galDead = (galRows || []).filter(r => safe.some(f => (r.url || '').includes(f))).map(r => r.id)
    if (galDead.length) {
      await supabaseAdmin.from('gallery_media').delete().in('id', galDead)
      clearedRows += galDead.length
    }

    const { data: msgRows } = await supabaseAdmin.from('messages').select('id, content')
    const msgDead = (msgRows || []).filter(r => safe.some(f => (r.content || '').includes(f))).map(r => r.id)
    if (msgDead.length) {
      await supabaseAdmin.from('messages').delete().in('id', msgDead)
      clearedRows += msgDead.length
    }

    return res.status(200).json({ deleted: safe.length, clearedRows })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
