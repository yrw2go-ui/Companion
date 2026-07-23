// pages/api/import-orphans.js
// Finds files in the bucket that no database row references,
// and adds them to gallery_media so they show up in the gallery.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'

const fileFromUrl = (url) => {
  if (!url) return null
  const parts = String(url).split(`/${BUCKET}/`)
  return parts[1] || null
}

const typeOf = (name) => {
  const n = name.toLowerCase()
  if (n.endsWith('.mp4') || n.endsWith('.webm') || n.endsWith('.mov')) return 'video'
  if (n.endsWith('.mp3') || n.endsWith('.wav') || n.endsWith('.m4a')) return 'audio'
  return 'image'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dryRun = req.body?.dryRun === true
  const mode = req.body?.mode === 'delete' ? 'delete' : 'import'

  try {
    // 1. every filename already referenced anywhere
    const known = new Set()

    const { data: cards } = await supabaseAdmin
      .from('cards')
      .select('image_url, back_image_url, video_url, poster_url')
    for (const c of cards || []) {
      for (const u of [c.image_url, c.back_image_url, c.video_url, c.poster_url]) {
        const f = fileFromUrl(u)
        if (f) known.add(f)
      }
    }

    const { data: chars } = await supabaseAdmin.from('characters').select('avatar_url')
    for (const c of chars || []) {
      const f = fileFromUrl(c.avatar_url)
      if (f) known.add(f)
    }

    const { data: gal } = await supabaseAdmin.from('gallery_media').select('url, poster_url')
    for (const g of gal || []) {
      for (const u of [g.url, g.poster_url]) {
        const f = fileFromUrl(u)
        if (f) known.add(f)
      }
    }

    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('content')
      .in('role', ['image', 'video'])
    for (const m of msgs || []) {
      const f = fileFromUrl(m.content)
      if (f) known.add(f)
    }

    // 2. walk the bucket
    const orphans = []
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
        if (known.has(f.name)) continue
        // skip the temporary frames used for video extension
        if (f.name.startsWith('frame_')) continue
        if (f.name.startsWith('poster_')) continue
        orphans.push(f)
      }

      if (files.length < pageSize) break
      offset += pageSize
    }

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        scanned,
        orphanCount: orphans.length,
        sample: orphans.slice(0, 10).map(o => o.name),
      })
    }

    // 3a. delete them instead, if that's what was asked
    if (mode === 'delete') {
      const names = orphans.map(o => o.name)
      let deleted = 0
      for (let i = 0; i < names.length; i += 100) {
        const batch = names.slice(i, i + 100)
        const { error } = await supabaseAdmin.storage.from(BUCKET).remove(batch)
        if (!error) deleted += batch.length
      }
      return res.status(200).json({
        mode: 'delete',
        scanned,
        orphanCount: orphans.length,
        deleted,
      })
    }

    // 3b. insert them into gallery_media
    const rows = orphans.map(o => {
      const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(o.name)
      return {
        type: typeOf(o.name),
        url: pub.publicUrl,
        prompt: 'imported from storage',
        created_at: o.created_at || new Date().toISOString(),
      }
    })

    let imported = 0
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error } = await supabaseAdmin.from('gallery_media').insert(batch)
      if (!error) imported += batch.length
    }

    return res.status(200).json({
      mode: 'import',
      scanned,
      orphanCount: orphans.length,
      imported,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
