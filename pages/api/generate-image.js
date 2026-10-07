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
    max_images, maxImages, // Seedream sequential: 1-15
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

  // Collect optional multi-refs (Seedream Lite edit allows up to 14)
  const extraRefs = [
    ...(Array.isArray(referenceImageUrls) ? referenceImageUrls : []),
    referenceImageUrl2,
    referenceImageUrl3,
    referenceImageUrl4,
  ].filter(Boolean)
  const primaryRef = referenceImageUrl || extraRefs[0] || null
  const refCap = /seedream-v4\/edit/.test(String(model || ''))
    ? 10
    : (model && String(model).includes('seedream') && String(model).includes('edit'))
    ? 14
    : 4
  const allRefs = primaryRef
    ? [primaryRef, ...extraRefs.filter(u => u !== primaryRef)].slice(0, refCap)
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

  // Seedream only accepts its own pixel presets (or close). Flux sizes like
  // 576*1024 are invalid and the API silently falls back to ~3:4 (1328*1776).
  const normalizeSeedreamSize = (raw, isLite = false) => {
    const s = String(raw || '').trim().replace(/x/gi, '*').replace(/\s/g, '')
    const presets = {
      // Pro + shared
      '1152*2048': '1152*2048',
      '2048*1152': '2048*1152',
      '1328*1776': '1328*1776',
      '1776*1328': '1776*1328',
      '1728*2304': '1728*2304',
      '2304*1728': '2304*1728',
      '1024*1024': '1024*1024',
      '1536*1536': '1536*1536',
      '2048*2048': '2048*2048',
      '1664*2496': '1664*2496',
      '2496*1664': '2496*1664',
      '1530*2720': '1530*2720',
      '2720*1530': '2720*1530',
      // Seedream 5.0 Lite official 2K/3K presets
      '2848*1600': '2848*1600',
      '1600*2848': '1600*2848',
      '3136*1344': '3136*1344',
      '3072*3072': '3072*3072',
      '3456*2592': '3456*2592',
      '2592*3456': '2592*3456',
      '4096*2304': '4096*2304',
      '2304*4096': '2304*4096',
      '2496*3744': '2496*3744',
      '3744*2496': '3744*2496',
      '4704*2016': '4704*2016',
      // Flux / UI aliases
      '576*1024': '1152*2048',
      '1024*576': '2048*1152',
      '768*1024': '1328*1776',
      '1024*768': '1776*1328',
      '1440*2560': '1600*2848',
      '2560*1440': '2848*1600',
    }
    if (presets[s]) return presets[s]
    if (s === '9:16' || s === '9/16') return isLite ? '1600*2848' : '1152*2048'
    if (s === '16:9' || s === '16/9') return isLite ? '2848*1600' : '2048*1152'
    if (s === '3:4' || s === '3/4') return isLite ? '1728*2304' : '1328*1776'
    if (s === '4:3' || s === '4/3') return isLite ? '2304*1728' : '1776*1328'
    if (s === '1:1') return '2048*2048'
    if (s === '2:3') return '1664*2496'
    if (s === '3:2') return '2496*1664'
    if (/^\d+\*\d+$/.test(s)) {
      const [w, h] = s.split('*').map(Number)
      const px = w * h
      const maxPx = isLite ? 11000000 : 4200000
      if (w >= 512 && h >= 512 && px >= 900000 && px <= maxPx) return s
    }
    return '2048*2048'
  }

  const isSeedreamLite = /seedream-v5\.0-lite/.test(useModel)
  const isSeedreamSeq = useModel.includes('/sequential')

  if (isEdit && useModel.startsWith('bytedance/seedream')) {
    // Seedream edit. v4: images[] up to 10, default 2048*2048. Lite: up to 14.
    const v4 = /seedream-v4/.test(useModel)
    usedSize = normalizeSeedreamSize(size || (v4 ? '2048*2048' : '1664*2496'), isSeedreamLite)
    body = {
      model: useModel,
      prompt,
      images: allRefs,
      size: usedSize,
      output_format: outputFormat || 'jpeg',
      enable_base64_output: false,
    }
    // Pro edit supports thinking. v4 and Lite schemas do not.
    if (!isSeedreamLite && !/seedream-v4/.test(useModel)) body.thinking = thinking || 'disabled'
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
    // Seedream T2I / sequential. Lite sizes go higher; sequential adds max_images.
    usedSize = normalizeSeedreamSize(size || (isSeedreamLite ? '2048*2048' : '1152*2048'), isSeedreamLite)
    body = {
      model: useModel,
      prompt,
      size: usedSize,
      output_format: outputFormat || 'jpeg',
      enable_base64_output: false,
    }
    if (isSeedreamSeq) {
      let n = parseInt(max_images ?? maxImages ?? 1, 10)
      if (isNaN(n)) n = 1
      body.max_images = Math.max(1, Math.min(15, n))
    }
    // Pro text-to-image supports thinking; Lite / sequential schemas do not
    if (!isSeedreamLite && !isSeedreamSeq && useModel.includes('pro')) {
      body.thinking = thinking || 'disabled'
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
        const outs = Array.isArray(pollBody.outputs) ? pollBody.outputs.filter(Boolean) : []
        atlasUrl = outs[0] || null
        // stash all outputs on the poll body for multi-image sequential
        pollBody._allOutputs = outs
        break
      }
      if (status === 'failed' || status === 'error') {
        return res.status(500).json({ error: pollBody.error || 'Generation failed' })
      }
    }

    if (!atlasUrl) {
      return res.status(500).json({ error: 'Timed out' })
    }

    // Re-fetch last completed poll data for multi outputs (store on closure)
    // We re-poll once to get full outputs array reliably
    let allAtlasUrls = [atlasUrl]
    try {
      const finalPoll = await fetch(`${BASE_URL}/model/prediction/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${process.env.ATLAS_API_KEY}` },
      })
      const finalParsed = await safeJson(finalPoll)
      if (finalParsed.ok) {
        const fb = finalParsed.data.data || finalParsed.data
        if (Array.isArray(fb.outputs) && fb.outputs.length) {
          allAtlasUrls = fb.outputs.filter(Boolean)
        }
      }
    } catch (_) {}

    const ext = outputFormat === 'png' ? 'png' : 'jpeg'
    const uploadedUrls = []
    const galleryIds = []

    for (let oi = 0; oi < allAtlasUrls.length; oi++) {
      const src = allAtlasUrls[oi]
      try {
        const imgRes = await fetch(src)
        if (!imgRes.ok) continue
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
        const fileName = `img_${Date.now()}_${oi}_${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: uploadError } = await supabaseAdmin.storage
          .from('character-images')
          .upload(fileName, imgBuffer, {
            contentType: `image/${ext}`,
            upsert: false,
          })
        if (uploadError) {
          // fall back to Atlas URL so client still gets something
          uploadedUrls.push(src)
          continue
        }
        const { data: publicData } = supabaseAdmin.storage
          .from('character-images')
          .getPublicUrl(fileName)
        const imageUrl = publicData.publicUrl
        uploadedUrls.push(imageUrl)

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
          if (gal?.id) galleryIds.push(gal.id)
        }
      } catch (e) {
        console.warn('multi upload fail', e)
      }
    }

    if (!uploadedUrls.length) {
      return res.status(500).json({ error: 'Upload failed for all outputs' })
    }

    return res.status(200).json({
      imageUrl: uploadedUrls[0],
      imageUrls: uploadedUrls,
      seed: usedSeed,
      size: usedSize,
      model: useModel,
      galleryId: galleryIds[0] || null,
      galleryIds,
      count: uploadedUrls.length,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
