// pages/api/generate-image.js

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_URL = 'https://api.atlascloud.ai/api/v1'
const MODEL = 'z-image/turbo'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' })
  }

  const safeJson = async (response) => {
    const text = await response.text()

    try {
      return { ok: true, data: JSON.parse(text) }
    } catch {
      return { ok: false, raw: text }
    }
  }

  try {
    const submitRes = await fetch(`${BASE_URL}/model/generateImage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        prompt_extend: false,
        size: '1024*1536',
        seed: -1,
        enable_sync_mode: false,
        enable_base64_output: false,
      }),
    })

    const submitParsed = await safeJson(submitRes)

    if (!submitParsed.ok) {
      return res.status(500).json({
        error: 'Atlas returned non-JSON',
        raw: submitParsed.raw?.slice(0, 500),
      })
    }

    if (!submitRes.ok) {
      return res.status(submitRes.status).json(submitParsed.data)
    }

    const predictionId = submitParsed.data.data?.id

    if (!predictionId) {
      return res.status(500).json({
        error: 'No prediction ID returned',
        detail: submitParsed.data,
      })
    }

    let atlasUrl = null

    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const pollRes = await fetch(
        `${BASE_URL}/model/prediction/${predictionId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
          },
        }
      )

      const pollParsed = await safeJson(pollRes)

      if (!pollParsed.ok) continue

      const pollBody = pollParsed.data.data || pollParsed.data
      const status = pollBody.status

      if (status === 'completed' || status === 'succeeded') {
        atlasUrl = pollBody.outputs?.[0]
        break
      }

      if (status === 'failed' || status === 'error') {
        return res.status(500).json({
          error: pollBody.error || 'Generation failed',
          detail: pollBody,
        })
      }
    }

    if (!atlasUrl) {
      return res.status(500).json({
        error: 'Timed out waiting for image generation',
      })
    }

    const imageResponse = await fetch(atlasUrl)
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

    const fileName = `img_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.png`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({
        error: 'Upload failed: ' + uploadError.message,
      })
    }

    const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({
      imageUrl: publicData.publicUrl,
      model: MODEL,
    })
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    })
  }
}
