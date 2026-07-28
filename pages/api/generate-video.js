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

  const {
    imageUrl, prompt, duration, resolution, model, aspectRatio, negativePrompt,
    lastImageUrl, sourceVideoUrl, audioUrl,
    sound, referenceImages, keepOriginalSound, highNoiseLoras, lowNoiseLoras,
  } = req.body

  const BASE_URL = 'https://api.atlascloud.ai/api/v1'
  const useModel = model || 'alibaba/wan-2.6/image-to-video'

  // text-to-video models don't need a source image; everything else does.
  // Wan 2.7 has its own flexible input rules (image, video, or both), so it
  // is excluded from this generic image-required check.
  const KLING_T2V_MODELS = ['kwaivgi/kling-v3.0-pro/text-to-video', 'kwaivgi/kling-video-o3-pro/text-to-video']
  const KLING_EDIT_MODEL = 'kwaivgi/kling-video-o3-pro/video-edit'

  const isT2V = useModel === 'xai/grok-imagine-video/text-to-video' || KLING_T2V_MODELS.includes(useModel)
  const isWan27 = useModel === 'alibaba/wan-2.7/image-to-video'
  const isKlingEdit = useModel === KLING_EDIT_MODEL
  const isWanLora = useModel === 'alibaba/wan-2.2-spicy/image-to-video-lora'

  if (isKlingEdit) {
    if (!sourceVideoUrl) return res.status(400).json({ error: 'A source video is required to edit' })
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'A prompt is required to edit' })
  } else if (!isT2V && !isWan27 && !imageUrl) {
    return res.status(400).json({ error: 'No source image provided' })
  }
  if (isWan27 && !imageUrl && !sourceVideoUrl) {
    return res.status(400).json({ error: 'Wan 2.7 needs a source image or a video to continue' })
  }

  let dur = parseInt(duration) || 5
  if (dur < 5) dur = 5
  if (dur > 15) dur = 15

  const motionPrompt = prompt || 'smooth natural motion, eyes blinking naturally'

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
  } else if (isWan27) {
    // Wan 2.7: flexible input modes -- start image, start+end transition,
    // or continuing an existing video clip. Resolution is 720P/1080P
    // (capitalized, unlike the other Wan models), and the aspect ratio
    // always follows whatever input media was given.
    const wanRes = (resolution || '').toUpperCase() === '1080P' ? '1080P' : '720P'
    body = {
      model: useModel,
      prompt: motionPrompt,
      resolution: wanRes,
      duration: dur,
      seed: -1,
      prompt_extend: true,
    }
    if (imageUrl) body.image = imageUrl
    if (lastImageUrl) body.last_image = lastImageUrl
    if (sourceVideoUrl) body.video = sourceVideoUrl
    if (audioUrl) body.audio = audioUrl
    if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
  } else if (KLING_T2V_MODELS.includes(useModel)) {
    // Kling t2v (both variants): single-prompt mode only here (no
    // multi_shot / elements). Duration 3-15s, native sound toggle.
    let klingDur = parseInt(duration) || 5
    if (klingDur < 3) klingDur = 3
    if (klingDur > 15) klingDur = 15
    dur = klingDur
    body = {
      model: useModel,
      prompt: motionPrompt,
      duration: klingDur,
      aspect_ratio: aspectRatio || '16:9',
      sound: sound !== false,
    }
    if (useModel === 'kwaivgi/kling-v3.0-pro/text-to-video') {
      if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
      body.cfg_scale = 0.5
    }
  } else if (isKlingEdit) {
    // Kling O3 Pro video-edit: edits an EXISTING video, not a new
    // generation. Video capped at 10s per the schema.
    body = {
      model: useModel,
      prompt: motionPrompt,
      video: sourceVideoUrl,
      keep_original_sound: keepOriginalSound !== false,
    }
    if (Array.isArray(referenceImages) && referenceImages.length) {
      body.images = referenceImages.slice(0, 4)
    }
  } else if (isWanLora) {
    // Wan 2.2 i2v with optional LoRA slots (max 3 each). LoRA item shape
    // isn't specified beyond "list", so pass through whatever was given.
    let loraDur = parseInt(duration) === 8 ? 8 : 5
    dur = loraDur
    body = {
      model: useModel,
      image: imageUrl,
      prompt: motionPrompt,
      resolution: resValue === '1080p' ? '720p' : resValue, // only 480p/720p supported
      duration: loraDur,
      seed: -1,
    }
    if (Array.isArray(highNoiseLoras) && highNoiseLoras.length) body.high_noise_loras = highNoiseLoras.slice(0, 3)
    if (Array.isArray(lowNoiseLoras) && lowNoiseLoras.length) body.low_noise_loras = lowNoiseLoras.slice(0, 3)
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

    // Wan 2.7's schema specifies the generateImage endpoint (unlike every
    // other video model here, which use generateVideo) -- honoring that
    // exactly as documented rather than assuming it's a typo.
    const submitEndpoint = isWan27 ? 'generateImage' : 'generateVideo'

    // Kling and Wan 2.7's schemas poll via /model/result/{id}; the earlier
    // video models here poll via /model/prediction/{id}. Honoring each
    // schema exactly rather than assuming they're interchangeable.
    const isKlingFamily = KLING_T2V_MODELS.includes(useModel) || isKlingEdit
    const pollPath = (isWan27 || isKlingFamily) ? 'result' : 'prediction'
    const submitRes = await fetch(`${BASE_URL}/model/${submitEndpoint}`, {
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

      const pollRes = await fetch(`${BASE_URL}/model/${pollPath}/${predictionId}`, {
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
