// pages/api/clear-audio.js
// Removes every audio file from the bucket regardless of age.
// Voice clips are disposable, so nothing here needs preserving.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'

const isAudio = (name) => {
  const n = name.toLowerCase()
  return n.endsWith('.mp3') || n.endsWith('.wav') || n.endsWith('.m4a') || n.endsWith('.ogg')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dryRun = req.body?.dryRun === true

  try {
    const audioFiles = []
    let scanned = 0
    let offset = 0
    const pageSize = 100

    while (true) {
      const { data: files, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list('', {
          limit: pageSize,
          offset,
          sortBy: { column: 'created_at', order: 'asc' },
        })

      if (error) {
        return res.status(500).json({ error: 'List failed: ' + error.message })
      }
      if (!files || files.length === 0) break

      for (const f of files) {
        if (!f.name || f.name === '.emptyFolderPlaceholder') continue
        scanned++
        if (isAudio(f.name)) audioFiles.push(f.name)
      }

      if (files.length < pageSize) break
      offset += pageSize
    }

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        scanned,
        audioCount: audioFiles.length,
      })
    }

    let deleted = 0
    for (let i = 0; i < audioFiles.length; i += 100) {
      const batch = audioFiles.slice(i, i + 100)
      const { error } = await supabaseAdmin.storage.from(BUCKET).remove(batch)
      if (!error) deleted += batch.length
    }

    // clear any gallery rows that pointed at those files
    const deletedSet = new Set(audioFiles)
    const { data: gal } = await supabaseAdmin.from('gallery_media').select('id, url')
    const deadIds = (gal || [])
      .filter(g => {
        const f = String(g.url || '').split(`/${BUCKET}/`)[1]
        return f && deletedSet.has(f)
      })
      .map(g => g.id)
    if (deadIds.length) {
      await supabaseAdmin.from('gallery_media').delete().in('id', deadIds)
    }

    return res.status(200).json({ scanned, audioCount: audioFiles.length, deleted })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
