// pages/api/empty-storage.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const collect = async (prefix) => {
      const paths = []
      let offset = 0
      while (true) {
        const { data: items, error } = await supabaseAdmin.storage
          .from('character-images')
          .list(prefix || '', { limit: 100, offset })
        if (error) throw new Error(error.message)
        if (!items || items.length === 0) break
        for (const item of items) {
          const full = prefix ? `${prefix}/${item.name}` : item.name
          // folders typically have no id
          const isFolder = item.id == null
          if (isFolder) {
            const nested = await collect(full)
            paths.push(...nested)
          } else {
            paths.push(full)
          }
        }
        if (items.length < 100) break
        offset += 100
      }
      return paths
    }

    const allPaths = await collect('')
    let deleted = 0
    for (let i = 0; i < allPaths.length; i += 100) {
      const batch = allPaths.slice(i, i + 100)
      const { error } = await supabaseAdmin.storage.from('character-images').remove(batch)
      if (error) throw new Error(error.message)
      deleted += batch.length
    }

    return res.status(200).json({ ok: true, deleted, scanned: allPaths.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
