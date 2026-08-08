// pages/api/import-orphans.js
// Lists storage objects not linked from app tables.
// Excludes support files (thumb_*, poster_*) so they never inflate orphan counts
// or get imported as gallery tiles.
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'character-images'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function fileNameOf(pathOrUrl) {
  const s = String(pathOrUrl || '').split('?')[0]
  const parts = s.split('/')
  return parts[parts.length - 1] || ''
}

function isSupportFile(name) {
  return /^(thumb_|poster_)/i.test(String(name || ''))
}

function isMediaFile(name) {
  return /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(String(name || ''))
}

async function listAllFiles(supabase) {
  const out = []
  const queue = ['']
  while (queue.length) {
    const prefix = queue.shift()
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix || undefined, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error || !data?.length) break
      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name
        // folders often have id null and no metadata.size
        if (item.id == null && !item.metadata) {
          queue.push(path)
          continue
        }
        out.push({ path, name: item.name, size: item.metadata?.size || 0 })
      }
      if (data.length < 100) break
      offset += 100
    }
  }
  return out
}

async function collectReferencedUrls(supabase) {
  const refs = new Set()
  const add = (u) => {
    if (!u) return
    const s = String(u).split('?')[0]
    refs.add(s)
    const name = fileNameOf(s)
    if (name) refs.add(name)
    // path after bucket
    const idx = s.indexOf(`/${BUCKET}/`)
    if (idx >= 0) refs.add(s.slice(idx + BUCKET.length + 2))
  }

  const tables = [
    { table: 'gallery_media', cols: ['url', 'poster_url', 'thumbnail_url'] },
    { table: 'cards', cols: ['image_url', 'back_image_url', 'video_url', 'poster_url'] },
    { table: 'character_media', cols: ['url'] },
    { table: 'misc_items', cols: ['url'] },
    { table: 'messages', cols: ['content'] },
  ]

  for (const { table, cols } of tables) {
    let offset = 0
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select(cols.join(','))
        .range(offset, offset + 999)
      if (error || !data?.length) break
      for (const row of data) {
        for (const c of cols) add(row[c])
      }
      if (data.length < 1000) break
      offset += 1000
    }
  }
  return refs
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = admin()
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' })

  const body = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body) } catch { return {} } })()
    : (req.body || {})

  const dryRun = body.dryRun !== false && body.mode !== 'import'
  const mode = body.mode === 'import' ? 'import' : 'scan'
  const forceUrls = Array.isArray(body.forceUrls) ? body.forceUrls.filter(Boolean) : []

  try {
    const files = await listAllFiles(supabase)
    const refs = await collectReferencedUrls(supabase)

    // forceUrls: treat as orphans to import even if heuristics differ
    const forceNames = new Set(forceUrls.map(fileNameOf))

    const candidates = []
    let skippedSupport = 0
    let skippedReferenced = 0
    let skippedNonMedia = 0

    for (const f of files) {
      if (!isMediaFile(f.name)) {
        skippedNonMedia++
        continue
      }
      if (isSupportFile(f.name) && !forceNames.has(f.name)) {
        skippedSupport++
        continue
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(f.path)
      const publicUrl = pub?.publicUrl || ''
      const linked =
        refs.has(publicUrl.split('?')[0]) ||
        refs.has(f.path) ||
        refs.has(f.name)
      if (linked && !forceNames.has(f.name)) {
        skippedReferenced++
        continue
      }
      candidates.push({
        path: f.path,
        name: f.name,
        url: publicUrl,
        size: f.size,
        type: /\.(mp4|webm|mov)$/i.test(f.name) ? 'video' : 'image',
      })
    }

    // forceUrls that might not appear in list (edge cases)
    for (const u of forceUrls) {
      if (candidates.some(c => c.url === u || c.name === fileNameOf(u))) continue
      candidates.push({
        path: fileNameOf(u),
        name: fileNameOf(u),
        url: u,
        size: 0,
        type: /\.(mp4|webm|mov)/i.test(u) ? 'video' : 'image',
      })
    }

    if (mode === 'scan' || dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        orphanCount: candidates.length,
        skippedSupport,
        skippedReferenced,
        skippedNonMedia,
        sample: candidates.slice(0, 20).map(c => c.name),
      })
    }

    let imported = 0
    const errors = []
    for (const c of candidates) {
      if (isSupportFile(c.name)) continue
      try {
        const { data: existing } = await supabase
          .from('gallery_media')
          .select('id')
          .eq('url', c.url)
          .limit(1)
          .maybeSingle()
        if (existing?.id) continue

        const { error } = await supabase.from('gallery_media').insert([{
          type: c.type,
          url: c.url,
          prompt: c.name,
          model: 'orphan-import',
        }])
        if (error) errors.push({ name: c.name, error: error.message })
        else imported++
      } catch (e) {
        errors.push({ name: c.name, error: e.message })
      }
    }

    return res.status(200).json({
      ok: true,
      imported,
      orphanCount: candidates.length,
      skippedSupport,
      errors: errors.slice(0, 10),
    })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'import-orphans failed' })
  }
}
