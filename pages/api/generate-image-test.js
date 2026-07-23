// pages/api/generate-image-test.js
// Test endpoint supporting multiple text-to-image models.
// Kept separate from generate-image.js so the live app is untouched.
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_URL = 'https://api.atlascloud.ai/api/v1'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    model,
    prompt,
    negativePrompt,
    seed,
    size,           // flux style: "768*1024"
    guidance,
    steps,
    aspectRatio,    // grok style: "2:3"
    resolution,     // grok style: "1k" | "2k"
  } = req.body

  if (!prompt) return res.status(400).json({ error: 'No prompt provided' })
  if (!model) return res.status(400).json({ error: 'No model provided' })

  const safeJson = async (r) => {
    const t = await r.text()
    try { return { ok: true, data: JSON.parse(t) } }
    catch { return { ok: false, raw: t } }
  }

  // build the request body per model family
  let body
  if (model.startsWith('xai/grok-imagine')) {
    body = {
      model,
      prompt,
      num_images: 1,
      aspect_ratio: aspectRatio || '2:3',
      resolution: resolution || '1k',
      enable_base64_output: false,
    }
  } else {
    // flux-dev and similar
    const usedSeed = (seed !== undefined && seed !== null && seed !== '')
      ? parseInt(seed)
      : Math.floor(Math.random() * 2147483647)
    body = {
      model,
      prompt,
      size: size || '768*1024',
      num_images: 1,
      guidance_scale: parseFloat(guidance) || 3.5,
      num_inference_steps: parseInt(steps) || 28,
      seed: usedSeed,
    }
    if (negativePrompt && negativePrompt.trim()) {
      body.negative_prompt = negativePrompt.trim()
    }
  }

  try {
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
      return res.status(500).json({ error: 'Atlas returned non-JSON', raw: submitParsed.raw?.slice(0, 400), sentBody: body })
    }

    const predictionId = submitParsed.data.data?.id
    if (!predictionId) {
      return res.status(500).json({ error: 'No prediction ID', atlasResponse: submitParsed.data, sentBody: body })
    }

    let atlasUrl = null
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1500))
      const pollRes = await fetch(`${BASE_URL}/model/prediction/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${process.env.ATLAS_API_KEY}` },
      })
      const pollParsed = await safeJson(pollRes)
      if (!pollParsed.ok) continue

      const pb = pollParsed.data.data || pollParsed.data
      if (pb.status === 'completed' || pb.status === 'succeeded') {
        atlasUrl = pb.outputs?.[0]
        break
      }
      if (pb.status === 'failed' || pb.status === 'error') {
        return res.status(500).json({ error: pb.error || 'Generation failed', detail: pb })
      }
    }

    if (!atlasUrl) return res.status(500).json({ error: 'Timed out' })

    // re-host to Supabase
    const imgRes = await fetch(atlasUrl)
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
    const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpeg`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, imgBuffer, { contentType: 'image/jpeg', upsert: false })

    if (uploadError) return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })

    const { data: pub } = supabaseAdmin.storage.from('character-images').getPublicUrl(fileName)

    return res.status(200).json({ imageUrl: pub.publicUrl, model, sentBody: body })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
