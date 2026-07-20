// pages/api/delete-media.js
// Small endpoint so the browser can clean up temporary files
// even as the page is closing, via navigator.sendBeacon.
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

  let files = req.body?.files

  // sendBeacon posts a Blob, which can arrive as a raw string
  if (typeof req.body === 'string') {
    try {
      files = JSON.parse(req.body)?.files
    } catch {
      return res.status(400).json({ error: 'Bad payload' })
    }
  }

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files provided' })
  }

  // only allow the temporary asset types this endpoint is meant for
  const allowed = files.filter(f =>
    typeof f === 'string' &&
    !f.includes('/') &&
    (f.startsWith('audio_') || f.startsWith('speech_') || f.startsWith('frame_'))
  )

  if (allowed.length === 0) {
    return res.status(400).json({ error: 'Nothing eligible to delete' })
  }

  try {
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(allowed)
    if (error) {
      return res.status(500).json({ error: error.message })
    }
    return res.status(200).json({ deleted: allowed.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
