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

  const { imageUrl, prompt, duration, resolution, model, aspectRatio, negativePrompt } = req.body

  const BASE_URL = 'https://api.atlascloud.ai/api/v1'
  const useModel = model || 'wan-2.2-turbo-spicy/image-to-video'

  // text-to-video models don't need a source image; everything else does
  const isT2V = useModel === 'xai/grok-imagine-video/text-to-video'
  if (!isT2V && !imageUrl) {
    return res.status(400).json({ error: 'No source image provided' })
  }

  let dur = parseInt(duration) || 5
  if (dur < 5) dur = 5
  if (dur > 15) dur = 15

  const motionPrompt = prompt || 'smooth natural motion, sensual movement'

  const safeJson = async (response) => {
    const t = await response.text()
    try {
      return { ok: true, data: JSON.parse(t) }
    } catch {
      return { ok: false, raw: t }
    }
  }

  try {
  // build the request per model family
  let body
  let resValue = resolution === '1080p' ? '1080p' : '720p'

  if (useModel === 'atlascloud/wan-2.2-turbo/image-to-video') {
    // Wan 2.2 Turbo: image, prompt, negative_prompt, resolution, duration=5 only
    body = {
      model: useModel,
      image: imageUrl,
      prompt: motionPrompt,
      resolution: resValue,
      duration: 5,
      seed: -1,
    }
    if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
    dur = 5
  } else if (useModel === 'xai/grok-imagine-video-v1.5/image-to-video') {
    // Grok i2v: uses image_url (not image), aspect_ratio, duration default 8
    body = {
      model: useModel,
      image_url: imageUrl,
      prompt: motionPrompt,
      duration: dur,
      resolution: resValue,
      aspect_ratio: aspectRatio || '3:4',
    }
  } else if (useModel === 'xai/grok-imagine-video/text-to-video') {
    // Grok t2v: no image, 480p/720p only
    if (resValue === '1080p') resValue = '720p'
    body = {
      model: useModel,
      prompt: motionPrompt,
      duration: dur,
      resolution: resValue,
      aspect_ratio: aspectRatio || '9:16',
    }
  } else {
    // default: Wan 2.6 i2v (unchanged behavior)
    body = {
      model: useModel,
      image: imageUrl,
      prompt: motionPrompt,
      resolution: resValue,
      duration: dur,
      seed: -1,
    }
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
      return res.status(500).json({
        error: 'Atlas returned non-JSON',
        httpStatus: submitRes.status,
        raw: submitParsed.raw?.slice(0, 400),
        sentBody: body,
      })
    }

    const predictionId = submitParsed.data.data?.id
    if (!predictionId) {
      // surface exactly what Atlas said and what we sent
      return res.status(500).json({
        error: 'No prediction ID',
        httpStatus: submitRes.status,
        atlasResponse: submitParsed.data,
        sentBody: body,
      })
    }

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
      .upload(fileName, vidBuffer, { contentType: 'video/mp4', upsert: false })

    if (uploadError) {
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({
      videoUrl: publicData.publicUrl,
      duration: dur,
      resolution: resValue,
      model: useModel,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
