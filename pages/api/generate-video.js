// pages/api/generate-video.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_URL = 'https://api.atlascloud.ai/api/v1'

const safeJson = async (response) => {
  const text = await response.text()
  try {
    return { ok: true, data: JSON.parse(text), raw: text }
  } catch {
    return { ok: false, raw: text }
  }
}

/** Atlas resolution strings vary by model family */
function normalizeResolution(model, resolution) {
  const r = String(resolution || '720p').trim()
  const upper = r.toUpperCase().replace(/\s/g, '')
  // Wan 2.7 Spicy docs: 720P | 1080P | 1080P-SR | 1440P-SR
  if (String(model || '').includes('wan-2.7-spicy') || String(model || '').includes('wan-2.6-spicy')) {
    if (upper === '720P' || upper === '720') return '720P'
    if (upper === '1080P' || upper === '1080') return '1080P'
    if (upper.includes('1080') && upper.includes('SR')) return '1080P-SR'
    if (upper.includes('1440')) return '1440P-SR'
    return '720P'
  }
  // Most other models accept lowercase 720p / 1080p
  if (upper === '1080P' || upper === '1080') return '1080p'
  if (upper === '480P' || upper === '480') return '480p'
  return '720p'
}

function extractPredictionId(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  const d = parsed.data !== undefined ? parsed.data : parsed
  return (
    d?.id ||
    d?.prediction_id ||
    d?.predictionId ||
    d?.request_id ||
    d?.task_id ||
    parsed?.id ||
    null
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    imageUrl,
    image,
    prompt,
    model,
    duration,
    resolution,
    negativePrompt,
    negative_prompt,
    seed,
    // seedance / extras
    generate_audio,
    ratio,
    output_format,
    watermark,
    last_image,
    lastImage,
    // lora
    highNoiseLoras,
    lowNoiseLoras,
    // t2v / aspect
    aspectRatio,
    sound,
    // extend / continue
    videoUrl,
    first_clip,
  } = req.body || {}

  const useModel = model || 'alibaba/wan-2.6/image-to-video'
  const useImage = (image || imageUrl || '').trim()
  const usePrompt = String(prompt || '').trim()
  const useDuration = Math.max(2, Math.min(30, parseInt(duration, 10) || 5))
  const useRes = normalizeResolution(useModel, resolution)
  const useNeg = (negative_prompt || negativePrompt || '').trim()

  if (!usePrompt && !useModel.includes('text-to-video')) {
    // most I2V still want a prompt
  }
  if (!usePrompt) {
    return res.status(400).json({ error: 'Prompt is required' })
  }

  // Build Atlas body per model family
  let body = { model: useModel, prompt: usePrompt }

  const isSpicy27 = useModel.includes('wan-2.7-spicy') && useModel.includes('image-to-video')
  const isSpicy26 = useModel.includes('wan-2.6-spicy')
  const isWan27 = useModel === 'alibaba/wan-2.7/image-to-video' || useModel === 'atlascloud/wan-2.7/image-to-video'
  const isSeedance25 = useModel.includes('seedance-2.5')
  const isSeedance = useModel.includes('seedance')
  const isGrok = useModel.includes('grok-imagine')
  const isLora = useModel.includes('image-to-video-lora')
  const isT2V = useModel.includes('text-to-video') && !useImage

  if (isT2V) {
    body.duration = useDuration
    body.resolution = useRes
    if (aspectRatio || ratio) body.ratio = aspectRatio || ratio
    if (generate_audio != null) body.generate_audio = !!generate_audio
    else if (sound != null) body.generate_audio = !!sound
    if (output_format) body.output_format = output_format
    if (watermark != null) body.watermark = !!watermark
  } else if (isSpicy27) {
    // atlascloud/wan-2.7-spicy/image-to-video
    // REQUIRED: model, image, prompt
    // resolution: 720P | 1080P | 1080P-SR | 1440P-SR
    // duration: 2–15
    if (!useImage) {
      return res.status(400).json({ error: 'Wan 2.7 Spicy requires a first-frame image URL' })
    }
    body.image = useImage
    body.duration = Math.max(2, Math.min(15, useDuration))
    body.resolution = useRes // already uppercase for spicy
    if (useNeg) body.negative_prompt = useNeg
    if (seed !== undefined && seed !== null && seed !== '') {
      body.seed = parseInt(seed, 10)
    }
  } else if (isSpicy26) {
    if (!useImage) {
      return res.status(400).json({ error: 'Wan 2.6 Spicy requires a first-frame image URL' })
    }
    body.image = useImage
    body.duration = [5, 10, 15].includes(useDuration) ? useDuration : 5
    body.resolution = String(useRes).toLowerCase()
    if (useNeg) body.negative_prompt = useNeg
    if (generate_audio != null) body.generate_audio = !!generate_audio
  } else if (isSeedance25 || isSeedance) {
    if (useImage) body.image = useImage
    if (last_image || lastImage) body.last_image = last_image || lastImage
    body.duration = Math.max(4, Math.min(30, useDuration))
    body.resolution = useRes === '1080p' ? '720p' : (useRes || '720p') // seedance 2.5: 480p|720p
    if (['480p', '720p'].includes(String(body.resolution).toLowerCase()) === false) {
      body.resolution = '720p'
    }
    body.ratio = ratio || aspectRatio || (useImage ? 'adaptive' : '9:16')
    body.generate_audio = generate_audio != null ? !!generate_audio : true
    body.watermark = watermark != null ? !!watermark : false
    body.output_format = output_format || 'mp4'
  } else if (isGrok) {
    if (useImage) body.image_url = useImage
    body.duration = useDuration
    // grok uses various fields
  } else if (isLora) {
    if (!useImage) {
      return res.status(400).json({ error: 'Image required for LoRA I2V' })
    }
    body.image = useImage
    body.duration = useDuration
    body.resolution = useRes
    if (Array.isArray(highNoiseLoras) && highNoiseLoras.length) {
      body.high_noise_loras = highNoiseLoras
    }
    if (Array.isArray(lowNoiseLoras) && lowNoiseLoras.length) {
      body.low_noise_loras = lowNoiseLoras
    }
  } else if (isWan27) {
    // alibaba/wan-2.7 — start / end / continue
    if (videoUrl || first_clip) {
      body.first_clip = videoUrl || first_clip
    } else if (useImage) {
      body.image = useImage
    }
    if (last_image || lastImage) body.last_image = last_image || lastImage
    body.duration = Math.max(2, Math.min(15, useDuration))
    body.resolution = useRes
    if (useNeg) body.negative_prompt = useNeg
  } else {
    // Generic Wan / turbo / others
    if (useImage) {
      // Prefer `image` (Atlas standard); some older models also accept image_url
      body.image = useImage
    }
    body.duration = useDuration
    body.resolution = useRes
    if (useNeg) body.negative_prompt = useNeg
    if (last_image || lastImage) body.last_image = last_image || lastImage
    if (videoUrl) body.first_clip = videoUrl
  }

  try {
    const submitRes = await fetch(`${BASE_URL}/model/generateVideo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const submitParsed = await safeJson(submitRes)
    if (!submitParsed.ok) {
      return res.status(500).json({
        error: 'Atlas returned non-JSON',
        raw: submitParsed.raw?.slice(0, 400),
        sent: { model: useModel, hasImage: !!useImage, resolution: useRes, duration: useDuration },
      })
    }

    const predictionId = extractPredictionId(submitParsed.data)
    if (!predictionId) {
      // Surface Atlas error message when present
      const detail = submitParsed.data
      const atlasErr =
        detail?.error ||
        detail?.message ||
        detail?.data?.error ||
        detail?.data?.message ||
        null
      return res.status(500).json({
        error: atlasErr || 'No prediction ID',
        detail,
        sent: {
          model: useModel,
          hasImage: !!useImage,
          resolution: body.resolution,
          duration: body.duration,
          keys: Object.keys(body),
        },
      })
    }

    let atlasUrl = null
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 2000))

      const pollRes = await fetch(`${BASE_URL}/model/prediction/${predictionId}`, {
        headers: { Authorization: `Bearer ${process.env.ATLAS_API_KEY}` },
      })
      const pollParsed = await safeJson(pollRes)
      if (!pollParsed.ok) continue

      const pollBody = pollParsed.data.data || pollParsed.data
      const status = pollBody.status

      if (status === 'completed' || status === 'succeeded') {
        atlasUrl = pollBody.outputs?.[0] || pollBody.output || pollBody.video_url
        if (Array.isArray(atlasUrl)) atlasUrl = atlasUrl[0]
        break
      }
      if (status === 'failed' || status === 'error') {
        return res.status(500).json({
          error: pollBody.error || pollBody.message || 'Video generation failed',
          detail: pollBody,
        })
      }
    }

    if (!atlasUrl) {
      return res.status(500).json({ error: 'Timed out waiting for video', predictionId })
    }

    // Download + re-upload to our storage so URLs stay stable
    const vidRes = await fetch(atlasUrl)
    if (!vidRes.ok) {
      // Fall back to Atlas URL if download fails
      return res.status(200).json({ videoUrl: atlasUrl, model: useModel, predictionId })
    }
    const vidBuffer = Buffer.from(await vidRes.arrayBuffer())
    const fileName = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, vidBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      })

    if (uploadError) {
      // Still return Atlas URL so the client isn't blocked
      return res.status(200).json({
        videoUrl: atlasUrl,
        model: useModel,
        predictionId,
        uploadWarning: uploadError.message,
      })
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({
      videoUrl: publicData.publicUrl,
      model: useModel,
      predictionId,
      duration: body.duration,
      resolution: body.resolution,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'generate-video failed' })
  }
}
