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

  const { imageUrl, prompt, duration, resolution, negativePrompt } = req.body

  if (!imageUrl) {
    return res.status(400).json({ error: 'No source image provided' })
  }

  const BASE_URL = 'https://api.atlascloud.ai/api/v1'
  const MODEL = 'alibaba/wan-2.7-spicy/image-to-video'

  // clamp duration to what the model supports
  let dur = parseInt(duration) || 5
  if (dur < 5) dur = 5
  if (dur > 15) dur = 15

  const res720or1080 = resolution === '1080p' ? '1080p' : '720p'

  const safeJson = async (response) => {
    const t = await response.text()
    try {
      return { ok: true, data: JSON.parse(t) }
    } catch {
      return { ok: false, raw: t }
    }
  }

  try {
    const body = {
      model: MODEL,
      image: imageUrl,
      prompt: prompt || 'gentle natural motion, subtle movement',
      resolution: res720or1080,
      duration: dur,
      enable_prompt_expansion: true,
      seed: -1,
    }

    if (negativePrompt && negativePrompt.trim()) {
      body.negative_prompt = negativePrompt.trim()
    }

    const submitRes = await fetch(`${BASE_URL}/model/generateVideo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const submitParsed = await safeJson(submitRes)
    if (!submitParsed.ok) {
      return res.status(500).json({ error: 'Atlas returned non-JSON', raw: submitParsed.raw?.slice(0, 400) })
    }

    const predictionId = submitParsed.data.data?.id
    if (!predictionId) {
      return res.status(500).json({ error: 'No prediction ID', detail: submitParsed.data })
    }

    // longer clips take longer; scale the polling window
    const maxPolls = 80 + dur * 8

    let atlasUrl = null
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 2000))

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

    return res.status(200).json({
      videoUrl: publicData.publicUrl,
      duration: dur,
      resolution: res720or1080,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
