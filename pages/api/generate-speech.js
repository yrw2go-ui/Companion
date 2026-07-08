// pages/api/generate-speech.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { text, voice } = req.body

  if (!text) {
    return res.status(400).json({ error: 'No text provided' })
  }

  const BASE_URL = 'https://api.atlascloud.ai/api/v1'

  try {
    const ttsRes = await fetch(`${BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'xai/tts-v1',
        input: text,
        voice: voice || 'alloy',
        response_format: 'mp3',
      }),
    })

    const contentType = ttsRes.headers.get('content-type') || ''

    // if it's audio, we got the file directly
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      const audioBuffer = Buffer.from(await ttsRes.arrayBuffer())
      const fileName = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('character-images')
        .upload(fileName, audioBuffer, {
          contentType: 'audio/mpeg',
          upsert: false,
        })
      if (uploadError) {
        return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
      }
      const { data: publicData } = supabaseAdmin.storage
        .from('character-images')
        .getPublicUrl(fileName)
      return res.status(200).json({ audioUrl: publicData.publicUrl })
    }

    // otherwise show us what came back (debug)
    const rawText = await ttsRes.text()
    return res.status(200).json({
      debug: true,
      httpStatus: ttsRes.status,
      contentType,
      rawResponse: rawText.slice(0, 500),
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
