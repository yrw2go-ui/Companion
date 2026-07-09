// pages/api/generate-video.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DEFAULT_MODEL = 'atlascloud/wan-2.2-turbo-spicy/image-to-video'
const BASE_URL = 'https://api.atlascloud.ai/api/v1'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    imageUrl,
    prompt,
    model = DEFAULT_MODEL,
  } = req.body

  if (!imageUrl) {
    return res.status(400).json({
      error: 'No source image provided',
    })
  }

  const safeJson = async (response) => {
    const text = await response.text()

    try {
      return JSON.parse(text)
    } catch {
      return {
        error: 'Atlas returned non-JSON',
        raw: text,
      }
    }
  }

  try {
    // Submit generation
    const submitRes = await fetch(`${BASE_URL}/model/generateVideo`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        image: imageUrl,
        prompt: prompt || 'gentle natural motion, subtle movement',
      }),
    })

    const submit = await safeJson(submitRes)

    if (!submitRes.ok) {
      return res.status(submitRes.status).json(submit)
    }

    const predictionId = submit.data?.id

    if (!predictionId) {
      return res.status(500).json({
        error: 'Atlas did not return a prediction ID.',
        detail: submit,
      })
    }

    let atlasVideoUrl = null

    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const pollRes = await fetch(
        `${BASE_URL}/model/prediction/${predictionId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
          },
        }
      )

      const poll = await safeJson(pollRes)
      const data = poll.data || poll

      if (data.status === 'completed' || data.status === 'succeeded') {
        atlasVideoUrl = data.outputs?.[0]
        break
      }

      if (data.status === 'failed' || data.status === 'error') {
        return res.status(500).json(data)
      }
    }

    if (!atlasVideoUrl) {
      return res.status(500).json({
        error: 'Timed out waiting for video generation.',
      })
    }

    // Download generated video
    const videoResponse = await fetch(atlasVideoUrl)
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer())

    const fileName = `video_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.mp4`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('character-images')
      .upload(fileName, videoBuffer, {
        contentType: 'video/mp4',
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({
        error: uploadError.message,
      })
    }

    const { data: publicUrl } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({
      videoUrl: publicUrl.publicUrl,
    })
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    })
  }
}
