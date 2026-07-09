// pages/api/generate-video.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { imageUrl, prompt } = req.body

  if (!imageUrl) {
    return res.status(400).json({ error: 'No source image provided' })
  }

  const BASE_URL = 'https://api.atlascloud.ai/api/v1';
  const MODEL = 'atlascloud/wan-2.2-turbo-spicy/image-to-video';
  
  // add more: wan-2.6-spicy etc.

  const safeJson = async (response) => {
    const t = await response.text()
    try {
      return { ok: true, data: JSON.parse(t) }
    } catch {
      return { ok: false, raw: t }
    }
  }

  try {
    const submitRes = await fetch(`${BASE_URL}/model/generateVideo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        image: imageUrl,
        prompt: prompt || 'gentle natural motion, subtle movement',
        resolution: '720p',
        duration: 5,
        enable_prompt_expansion: true,
        seed: -1,
      }),
    })

    const submitParsed = await safeJson(submitRes)
    if (!submitParsed.ok) {
      return res.status(500).json({ error: 'Atlas returned non-JSON', raw: submitParsed.raw?.slice(0, 400) })
    }

    const predictionId = submitParsed.data.data?.id
    if (!predictionId) {
      return res.status(500).json({ error: 'No prediction ID', detail: submitParsed.data })
    }

    let atlasUrl = null
    for (let i = 0; i < 100; i++) {
      await new Promise(r => setTimeout(r, 1500))

      const pollRes = await fetch(`${BASE_URL}/model/prediction/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${process.env.ATLAS_API_KEY}` },
      })
      const pollParsed = await safeJson(pollRes)
      if (!pollParsed.ok) continue

      const pollBody = pollParsed.data.data || pollParsed.data
      const status = pollBody.status

      if (status === 'completed' || status === 'succeeded') {
        atlasUrl = pollBody.outputs?.[0]
        break
      }
      if (status === 'failed' || status === 'error') {
        return res.status(500).json({ error: pollBody.error || 'Generation failed', detail: pollBody })
      }
    }

    if (!atlasUrl) {
      return res.status(500).json({ error: 'Timed out waiting for video' })
    }

    const vidRes = await fetch(atlasUrl)
    const vidBuffer = Buffer.from(await vidRes.arrayBuffer())

    const fileName = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, vidBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({ videoUrl: publicData.publicUrl })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
