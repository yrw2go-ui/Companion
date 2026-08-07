// pages/api/fix-broken-links.js
// Finds gallery_media rows whose file no longer exists in storage (e.g. from
// the delete-duplicates matching bug) and removes those dangling rows.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'

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

  const dryRun = req.body?.dryRun === true

  try {
    // build the full set of files that currently exist in the bucket
    const existing = new Set()
    let offset = 0
    const pageSize = 100
    while (true) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list('', { limit: pageSize, offset })
      if (error) return res.status(500).json({ error: 'List failed: ' + error.message })
      if (!data || data.length === 0) break
      for (const f of data) if (f.name) existing.add(f.name)
      if (data.length < pageSize) break
      offset += pageSize
    }

    const { data: rows } = await supabaseAdmin
      .from('gallery_media')
      .select('id, url, poster_url, thumbnail_url, type, prompt, created_at')

    // rows whose actual content file is gone -- these get removed entirely
    const broken = (rows || []).filter(r => {
      const f = fileNameFromUrl(r.url)
      return f && !existing.has(f)
    })

    // rows whose content is fine but the poster/thumbnail file is gone --
    // these just get their stale poster reference cleared, not deleted,
    // since the video or model itself is still good
    const staleThumbs = (rows || []).filter(r => {
      if (broken.some(b => b.id === r.id)) return false
      const posterField = r.poster_url || r.thumbnail_url
      if (!posterField) return false
      const f = fileNameFromUrl(posterField)
      return f && !existing.has(f)
    })

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        scanned: (rows || []).length,
        brokenCount: broken.length,
        staleThumbCount: staleThumbs.length,
        sample: broken.slice(0, 10).map(r => ({ id: r.id, type: r.type, prompt: r.prompt })),
        thumbSample: staleThumbs.slice(0, 10).map(r => ({ id: r.id, type: r.type, prompt: r.prompt })),
      })
    }

    if (broken.length) {
      await supabaseAdmin.from('gallery_media').delete().in('id', broken.map(r => r.id))
    }
    for (const r of staleThumbs) {
      const clear = {}
      if (r.poster_url) clear.poster_url = null
      if (r.thumbnail_url) clear.thumbnail_url = null
      await supabaseAdmin.from('gallery_media').update(clear).eq('id', r.id)
    }

    return res.status(200).json({
      scanned: (rows || []).length,
      removed: broken.length,
      thumbsCleared: staleThumbs.length,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
