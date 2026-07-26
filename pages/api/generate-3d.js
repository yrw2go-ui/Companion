// pages/api/generate-3d.js
// Text-to-3D and image-to-3D, across multiple providers. Always resolves to
// a GLB so results can be shown in an in-browser viewer (model-viewer only
// renders GLB). Seed3D returns a zip archive, which is unzipped server-side
// to extract the GLB inside.
import { createClient } from '@supabase/supabase-js'
import AdmZip from 'adm-zip'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_URL = 'https://api.atlascloud.ai/api/v1'
const BUCKET = 'character-images'

// text-to-3D providers
const T2_3D_MODELS = {
  hunyuan: 'tencent/hunyuan3d-rapid/text-to-3d',
  tripo: 'tripo-h3.1/text-to-3d',
}
// image-to-3D providers
const I2_3D_MODELS = {
  hunyuan: 'tencent/hunyuan3d-rapid/image-to-3d',
  seed3d: 'bytedance/seed3d-v2.0/image-to-3d',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt, imageUrl, enablePbr, enableGeometry, provider } = req.body

  const fromImage = !!imageUrl
  const useProvider = provider || 'hunyuan'

  if (!fromImage && (!prompt || !prompt.trim())) {
    return res.status(400).json({ error: 'No prompt provided' })
  }
  if (fromImage && !imageUrl.trim()) {
    return res.status(400).json({ error: 'No image provided' })
  }

  const modelId = fromImage
    ? (I2_3D_MODELS[useProvider] || I2_3D_MODELS.hunyuan)
    : (T2_3D_MODELS[useProvider] || T2_3D_MODELS.hunyuan)

  const safeJson = async (r) => {
    const t = await r.text()
    try { return { ok: true, data: JSON.parse(t) } }
    catch { return { ok: false, raw: t } }
  }

  // build the request body per provider
  let body
  if (fromImage && useProvider === 'seed3d') {
    body = {
      model: modelId,
      image: imageUrl,
      subdivision_level: 'medium',
      file_format: 'glb',
    }
  } else if (fromImage) {
    body = {
      model: modelId,
      image: imageUrl,
      enable_pbr: !!enablePbr,
      enable_geometry: !!enableGeometry,
      format: 'GLB',
    }
  } else if (useProvider === 'tripo') {
    body = {
      model: modelId,
      prompt,
      texture: true,
      pbr: !!enablePbr,
      texture_quality: 'standard',
      geometry_quality: 'standard',
    }
  } else {
    body = {
      model: modelId,
      prompt,
      enable_pbr: !!enablePbr,
      enable_geometry: !!enableGeometry,
      format: 'GLB',
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
      return res.status(500).json({ error: 'Atlas returned non-JSON', raw: submitParsed.raw?.slice(0, 300) })
    }

    const predictionId = submitParsed.data.data?.id
    if (!predictionId) {
      return res.status(500).json({ error: 'No prediction ID', detail: submitParsed.data, sentBody: body })
    }

    // 3D generation can take longer than images; poll generously
    let result = null
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const pollRes = await fetch(`${BASE_URL}/model/result/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${process.env.ATLAS_API_KEY}` },
      })
      const pollParsed = await safeJson(pollRes)
      if (!pollParsed.ok) continue
      const pb = pollParsed.data.data || pollParsed.data
      if (pb.status === 'completed' || pb.status === 'succeeded') { result = pb; break }
      if (pb.status === 'failed' || pb.status === 'error') {
        return res.status(500).json({ error: pb.error || 'Generation failed', detail: pb })
      }
    }

    if (!result) return res.status(500).json({ error: 'Timed out' })

    let modelBuffer = null
    let atlasThumbUrl = result.thumbnail || null

    if (fromImage && useProvider === 'seed3d') {
      // Seed3D always returns a single URL to a .zip archive
      const zipUrl = result.outputs?.[0]
      if (!zipUrl) {
        return res.status(500).json({ error: 'No archive in the response', detail: result })
      }
      const zipRes = await fetch(zipUrl)
      const zipBuffer = Buffer.from(await zipRes.arrayBuffer())

      const zip = new AdmZip(zipBuffer)
      const entries = zip.getEntries()
      const glbEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.glb'))
      if (!glbEntry) {
        return res.status(500).json({ error: 'No GLB file found inside the archive', detail: entries.map(e => e.entryName) })
      }
      modelBuffer = glbEntry.getData()
      // Seed3D doesn't provide a separate thumbnail
    } else {
      // Hunyuan / Tripo: find the GLB directly among the outputs
      const glbFile = (result.files || []).find(f => (f.type || '').toUpperCase() === 'GLB')
      const atlasModelUrl = glbFile?.url || result.outputs?.[0]
      if (!atlasModelUrl) {
        return res.status(500).json({ error: 'No model file in the response', detail: result })
      }
      if (!atlasThumbUrl) {
        atlasThumbUrl = result.outputs?.[result.outputs.length - 1]
      }
      const modelRes = await fetch(atlasModelUrl)
      modelBuffer = Buffer.from(await modelRes.arrayBuffer())
    }

    // re-host the model file
    const modelFileName = `model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.glb`
    const { error: modelUploadErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(modelFileName, modelBuffer, { contentType: 'model/gltf-binary', upsert: false })
    if (modelUploadErr) {
      return res.status(500).json({ error: 'Model upload failed: ' + modelUploadErr.message })
    }
    const { data: modelPub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(modelFileName)

    // re-host the thumbnail, if one came back
    let thumbUrl = null
    if (atlasThumbUrl) {
      try {
        const thumbRes = await fetch(atlasThumbUrl)
        const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer())
        const thumbFileName = `poster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpeg`
        const { error: thumbErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(thumbFileName, thumbBuffer, { contentType: 'image/jpeg', upsert: false })
        if (!thumbErr) {
          const { data: thumbPub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(thumbFileName)
          thumbUrl = thumbPub.publicUrl
        }
      } catch {
        // thumbnail is a nice-to-have; don't fail the whole request over it
      }
    }

    return res.status(200).json({
      modelUrl: modelPub.publicUrl,
      thumbnailUrl: thumbUrl,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
