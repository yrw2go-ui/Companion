// pages/api/generate-image.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_URL = 'https://api.atlascloud.ai/api/v1'
const DEFAULT_MODEL = 'z-image/turbo'

async function registerGalleryRow(row) {
  if (!row?.url) return null
  try {
    const { data: existing } = await supabaseAdmin
      .from('gallery_media')
      .select('*')
      .eq('url', row.url)
      .limit(1)
      .maybeSingle()
    if (existing?.id) return existing

    const payloads = [
      row,
      {
        type: row.type || 'image',
        url: row.url,
        prompt: row.prompt || null,
        negative_prompt: row.negative_prompt || null,
        model: row.model || null,
        seed: row.seed ?? null,
        size: row.size || null,
        source_prompt: row.source_prompt || null,
        character_id: row.character_id || null,
      },
      {
        type: row.type || 'image',
        url: row.url,
        prompt: row.prompt || null,
        model: row.model || null,
      },
      { type: row.type || 'image', url: row.url },
    ]

    for (const payload of payloads) {
      const body = {}
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined && v !== null && v !== '') body[k] = v
      }
      body.url = row.url
      body.type = row.type || 'image'
      const { data, error } = await supabaseAdmin
        .from('gallery_media')
        .insert([body])
        .select()
        .single()
      if (!error && data) return data
      if (error && /duplicate|unique/i.test(error.message || '')) {
        const { data: again } = await supabaseAdmin
          .from('gallery_media')
          .select('*')
          .eq('url', row.url)
          .limit(1)
          .maybeSingle()
        if (again) return again
      }
    }
  } catch (e) {
    console.warn('gallery register failed', e)
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    prompt, negativePrompt, seed, size, referenceImageUrl,
    referenceImageUrls, referenceImageUrl2, referenceImageUrl3, referenceImageUrl4,
    model, aspectRatio, resolution, outputFormat, thinking, guidance, steps,
    // optional: client can ask us to skip gallery register (e.g. card-only flows)
    skipGalleryRegister,
    character_id,
    source_prompt,
  } = req.body

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' })
  }

  const safeJson = async (response) => {
    const text = await response.text()
    try { return { ok: true, data: JSON.parse(text) } }
    catch { return { ok: false, raw: text } }
  }

  const randSeed = () => Math.floor(Math.random() * 2147483647)

  // Collect optional multi-refs (gallery create can send up to 4)
  const extraRefs = [
    ...(Array.isArray(referenceImageUrls) ? referenceImageUrls : []),
    referenceImageUrl2,
    referenceImageUrl3,
    referenceImageUrl4,
  ].filter(Boolean)
  const primaryRef = referenceImageUrl || extraRefs[0] || null
  const allRefs = primaryRef
    ? [primaryRef, ...extraRefs.filter(u => u !== primaryRef)].slice(0, 4)
    : []

  // A reference image means image-to-image. Use the explicit edit model if
  // one was passed (e.g. Seedream edit), else default to Wan edit.
  const isEdit = allRefs.length > 0
  const useModel = isEdit
    ? (model && (model.includes('edit') || model.includes('/edit')) ? model : 'alibaba/wan-2.7-pro/image-edit')
    : (model || DEFAULT_MODEL)

  let body
  let usedSeed = null
  let usedSize = size || '768*1024'

  if (isEdit && useModel.startsWith('bytedance/seedream')) {
    // Seedream 5 Pro edit: images[], size enum, output_format, thinking
    body = {
      model: useModel,
      prompt,
      images: allRefs,
      size: '1328*1776',
      output_format: 'jpeg',
      thinking: 'disabled',
      enable_base64_output: false,
    }
  } else if (isEdit && useModel.startsWith('xai/grok-imagine')) {
    // Grok Imagine edit: image_urls[]
    body = {
      model: useModel,
      prompt,
      image_urls: allRefs.slice(0, 1),
      num_images: 1,
      aspect_ratio: aspectRatio || 'auto',
      resolution: resolution || '1k',
      enable_base64_output: false,
    }
    usedSize = aspectRatio || 'auto'
  } else if (isEdit) {
    // Wan 2.7 Pro image-edit: images[], size "1K"/"2K", n, thinking_mode, seed
    usedSeed = (seed !== undefined && seed !== null && seed !== '') ? parseInt(seed) : -1
    body = {
      model: useModel,
      prompt,
      images: allRefs,
      size: '2K',
      n: 1,
      thinking_mode: true,
      seed: usedSeed,
    }
  } else if (useModel.startsWith('xai/grok-imagine')) {
    body = {
      model: useModel,
      prompt,
      num_images: 1,
      aspect_ratio: aspectRatio || '2:3',
      resolution: resolution || '1k',
      enable_base64_output: false,
    }
    usedSize = aspectRatio || '2:3'
  } else if (useModel.startsWith('bytedance/seedream')) {
    usedSize = size || '2048*2048'
    body = {
      model: useModel,
      prompt,
      size: usedSize,
      output_format: outputFormat || 'jpeg',
      thinking: thinking || 'disabled',
      enable_base64_output: false,
    }
  } else if (useModel === 'black-forest-labs/flux-schnell') {
    usedSeed = (seed !== undefined && seed !== null && seed !== '') ? parseInt(seed) : randSeed()
    usedSize = size || '1024*1024'
    body = {
      model: useModel,
      prompt,
      size: usedSize,
      seed: usedSeed,
      num_images: 1,
      enable_base64_output: false,
    }
    if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
  } else {
    // z-image, flux-dev, and similar classic models
    usedSeed = (seed !== undefined && seed !== null && seed !== '') ? parseInt(seed) : randSeed()
    let g = parseFloat(guidance); if (isNaN(g)) g = 6.5; g = Math.max(1, Math.min(12, g))
    let st = parseInt(steps); if (isNaN(st)) st = 28; st = Math.max(10, Math.min(50, st))
    body = {
      model: useModel,
      prompt,
      size: usedSize,
      num_images: 1,
      guidance_scale: g,
      num_inference_steps: st,
      seed: usedSeed,
    }
    if (negativePrompt && negativePrompt.trim()) body.negative_prompt = negativePrompt.trim()
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
      return res.status(500).json({ error: 'Atlas returned non-JSON', raw: submitParsed.raw?.slice(0, 300) })
    }

    const predictionId = submitParsed.data.data?.id
    if (!predictionId) {
      return res.status(500).json({ error: 'No prediction ID', detail: submitParsed.data })
    }

    let atlasUrl = null
    for (let i = 0; i < 60; i++) {
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

    const ext = outputFormat === 'png' ? 'png' : 'jpeg'
    const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, imgBuffer, {
        contentType: `image/${ext}`,
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    const imageUrl = publicData.publicUrl

    // Server-side gallery row — survives the client switching apps mid-response
    let galleryId = null
    if (!skipGalleryRegister) {
      const gal = await registerGalleryRow({
        type: 'image',
        url: imageUrl,
        prompt: String(prompt || '').trim() || null,
        negative_prompt: negativePrompt && String(negativePrompt).trim()
          ? String(negativePrompt).trim()
          : null,
        model: useModel,
        seed: usedSeed,
        size: usedSize,
        character_id: character_id || null,
        source_prompt: source_prompt || null,
      })
      galleryId = gal?.id || null
    }

    return res.status(200).json({
      imageUrl,
      seed: usedSeed,
      size: usedSize,
      model: useModel,
      galleryId,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
