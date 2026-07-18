// pages/api/extract-frame.js
// Receives a base64 frame captured client-side and stores it in the bucket,
// returning a public URL that the video API can use as a source image.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { dataUrl } = req.body

  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return res.status(400).json({ error: 'No frame provided' })
  }

  try {
    const base64 = dataUrl.split(',')[1]
    const buffer = Buffer.from(base64, 'base64')

    const fileName = `frame_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpeg`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: false })

    if (uploadError) {
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({ imageUrl: publicData.publicUrl, fileName })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
