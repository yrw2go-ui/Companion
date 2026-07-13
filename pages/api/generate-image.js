// pages/api/generate-image.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt, negativePrompt, seed, size } = req.body

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' })
  }

  const BASE_URL = 'https://api.atlascloud.ai/api/v1'
  const MODEL = 'z-image/turbo'

  const safeJson = async (response) => {
    const text = await response.text()
    try {
      return { ok: true, data: JSON.parse(text) }
    } catch {
      return { ok: false, raw: text }
    }
  }

  const usedSeed = (seed !== undefined && seed !== null && seed !== '')
    ? parseInt(seed)
    : Math.floor(Math.random() * 2147483647)

  const usedSize = size || '768*1024'

  try {
    const body = {
      model: MODEL,
      prompt: prompt,
      size: usedSize,
      num_images: 1,
      guidance_scale: 3.5,
      num_inference_steps: 28,
      seed: usedSeed,
    }

    if (negativePrompt && negativePrompt.trim()) {
      body.negative_prompt = negativePrompt.trim()
    }

    const submitRes = await fetch(`${BASE_URL}/model/generateImage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const submitParsed = await safeJson(submitRes)
    if (!submitParsed.ok) {
      return res.status(500).json({ error: 'Atlas returned non-JSON', raw: submitParsed.raw?.slice(0, 300) })
    }

    const predictionId = submitParsed.data.data?.id
    if (!predictionId) {
      return res.status(500).json({ error: 'No prediction ID', detail: submitParsed.data })
    }

    let atlasUrl = null
    for (let i = 0; i < 40; i++) {
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
        return res.status(500).json({ error: pollBody.error || 'Generation failed' })
      }
    }

    if (!atlasUrl) {
      return res.status(500).json({ error: 'Timed out' })
    }

    const imgRes = await fetch(atlasUrl)
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

    const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpeg`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, imgBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({ imageUrl: publicData.publicUrl, seed: usedSeed, size: usedSize })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
