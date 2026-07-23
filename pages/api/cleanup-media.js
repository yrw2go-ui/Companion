// pages/api/cleanup-media.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'
const CUTOFF_DAYS = 90

const fileFromUrl = (url) => {
  if (!url) return null
  const parts = String(url).split(`/${BUCKET}/`)
  return parts[1] || null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // 1. build the "protected" set — files referenced by cards or characters
    const protectedFiles = new Set()

    const { data: cards } = await supabaseAdmin
      .from('cards')
      .select('image_url, back_image_url, video_url, poster_url')
    for (const c of cards || []) {
      for (const u of [c.image_url, c.back_image_url, c.video_url, c.poster_url]) {
        const f = fileFromUrl(u)
        if (f) protectedFiles.add(f)
      }
    }

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('avatar_url')
    for (const c of chars || []) {
      const f = fileFromUrl(c.avatar_url)
      if (f) protectedFiles.add(f)
    }

    // 2. list every file in the bucket (paginated)
    const cutoff = Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000
    const toDelete = []
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
        scanned++
        // skip folder placeholders
        if (!f.name || f.name === '.emptyFolderPlaceholder') continue
        // keep anything a card or character uses
        if (protectedFiles.has(f.name)) continue

        const created = f.created_at ? new Date(f.created_at).getTime() : null
        if (created !== null && created < cutoff) {
          toDelete.push(f.name)
        }
      }

      if (files.length < pageSize) break
      offset += pageSize
    }

    // 3. delete in batches
    let deleted = 0
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100)
      const { error } = await supabaseAdmin.storage.from(BUCKET).remove(batch)
      if (!error) deleted += batch.length
    }

    // 4. clean up now-dead gallery_media / message rows pointing at deleted files
    const deletedSet = new Set(toDelete)

    const { data: gal } = await supabaseAdmin.from('gallery_media').select('id, url')
    const galDead = (gal || []).filter(g => deletedSet.has(fileFromUrl(g.url))).map(g => g.id)
    if (galDead.length) {
      await supabaseAdmin.from('gallery_media').delete().in('id', galDead)
    }

    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('id, content')
      .in('role', ['image', 'video'])
    const msgDead = (msgs || []).filter(m => deletedSet.has(fileFromUrl(m.content))).map(m => m.id)
    if (msgDead.length) {
      await supabaseAdmin.from('messages').delete().in('id', msgDead)
    }

    return res.status(200).json({
      scanned,
      protectedCount: protectedFiles.size,
      deleted,
      cutoffDays: CUTOFF_DAYS,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
