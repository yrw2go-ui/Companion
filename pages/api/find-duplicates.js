// pages/api/find-duplicates.js
// Scans the bucket for likely duplicate files: same base filename with a
// (1)/(2)-style suffix, or an exact name collision, matched by file size.
// Read-only scan; deletion is a separate explicit step.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BUCKET = 'character-images'

// strip a trailing " (1)", " (2)", etc. (and its file extension) to get a
// base key that groups likely-duplicate files together
const baseKeyOf = (fileName) => {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > -1 ? fileName.slice(0, dot) : fileName
  const ext = dot > -1 ? fileName.slice(dot) : ''
  const stripped = stem.replace(/\s*\(\d+\)\s*$/, '')
  return stripped + ext
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const files = []
    let offset = 0
    const pageSize = 100

    while (true) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list('', { limit: pageSize, offset, sortBy: { column: 'created_at', order: 'asc' } })

      if (error) return res.status(500).json({ error: 'List failed: ' + error.message })
      if (!data || data.length === 0) break

      for (const f of data) {
        if (!f.name || f.name === '.emptyFolderPlaceholder') continue
        files.push({
          name: f.name,
          size: f.metadata?.size ?? null,
          created_at: f.created_at,
        })
      }

      if (data.length < pageSize) break
      offset += pageSize
    }

    // group by (base key without a (n) suffix) + file size
    const groups = {}
    for (const f of files) {
      const base = baseKeyOf(f.name)
      const key = `${base}::${f.size}`
      if (!groups[key]) groups[key] = []
      groups[key].push(f)
    }

    // only groups with more than one file, AND at least one member actually
    // has a (n) suffix (a plain size collision alone isn't strong enough
    // evidence on its own)
    const suffixPattern = /\(\d+\)/
    const duplicateGroups = Object.entries(groups)
      .filter(([, members]) => members.length > 1)
      .filter(([, members]) => members.some(m => suffixPattern.test(m.name)))
      .map(([key, members]) => ({
        baseKey: key.split('::')[0],
        size: members[0].size,
        files: members.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
      }))

    const totalDuplicateFiles = duplicateGroups.reduce((sum, g) => sum + g.files.length - 1, 0)

    return res.status(200).json({
      scanned: files.length,
      groupCount: duplicateGroups.length,
      totalDuplicateFiles,
      groups: duplicateGroups,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
