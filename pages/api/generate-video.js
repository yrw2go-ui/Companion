// pages/api/generate-video.js
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    })
  }

  const {
    imageUrl,
    prompt,
    duration,
    resolution,
    model: customModel,
  } = req.body

  if (!prompt) {
    return res.status(400).json({
      error: 'No prompt provided',
    })
  }

  const BASE_URL = 'https://api.atlascloud.ai/api/v1'

  let MODEL =
    customModel ||
    'atlascloud/wan-2.2-turbo-spicy/image-to-video'

  // If no image supplied, automatically use text-to-video model
  if (!imageUrl) {
    MODEL = 'bytedance/seedance-v1-pro-t2v-720p'
  }

  let dur = parseInt(duration, 10) || 5

  if (dur < 5) dur = 5
  if (dur > 15) dur = 15

  const resValue =
    resolution === '1080p'
      ? '1080p'
      : '720p'

  const safeJson = async (response) => {
    const text = await response.text()

    try {
      return {
        ok: true,
        data: JSON.parse(text),
      }
    } catch {
      return {
        ok: false,
        raw: text,
      }
    }
  }

  try {
    const requestBody = {
      model: MODEL,
      prompt:
        prompt ||
        'smooth natural motion, sensual movement',
      resolution: resValue,
      duration: dur,
      seed: -1,
    }

    if (imageUrl) {
  if (MODEL === 'xai/grok-imagine-video-v1.5/image-to-video') {
    requestBody.image_url = imageUrl
  } else {
    requestBody.image = imageUrl
  }
    }

    const submitRes = await fetch(
      `${BASE_URL}/model/generateVideo`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    )

    const submitParsed = await safeJson(submitRes)

    if (!submitParsed.ok) {
      return res.status(500).json({
        error: 'Atlas returned non-JSON',
        raw: submitParsed.raw?.slice(0, 400),
      })
    }

    const predictionId =
      submitParsed.data.data?.id ||
      submitParsed.data.id

    if (!predictionId) {
      return res.status(500).json({
        error: 'No prediction ID returned',
        detail: submitParsed.data,
      })
    }

    const maxPolls = 80 + dur * 8

    let atlasUrl = null
        for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000))

      const pollRes = await fetch(
        `${BASE_URL}/model/prediction/${predictionId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.ATLAS_API_KEY}`,
          },
        }
      )

      const pollParsed = await safeJson(pollRes)

      if (!pollParsed.ok) {
        continue
      }

      const pollBody =
        pollParsed.data.data || pollParsed.data

      const status = pollBody.status

      if (
        status === 'completed' ||
        status === 'succeeded'
      ) {
        atlasUrl =
          pollBody.outputs?.[0] ||
          pollBody.output?.video ||
          pollBody.output?.url ||
          pollBody.videoUrl ||
          pollBody.url ||
          null

        break
      }

      if (
        status === 'failed' ||
        status === 'error' ||
        status === 'cancelled' ||
        status === 'canceled'
      ) {
        return res.status(500).json({
          error:
            pollBody.error ||
            'Generation failed',
          detail: pollBody,
        })
      }
    }

    if (!atlasUrl) {
      return res.status(500).json({
        error: 'Timed out waiting for video',
      })
    }

    const videoResponse = await fetch(atlasUrl)

    if (!videoResponse.ok) {
      return res.status(500).json({
        error: 'Failed to download generated video',
      })
    }

    const videoBuffer = Buffer.from(
      await videoResponse.arrayBuffer()
    )

    const fileName = `video_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.mp4`

    const { error: uploadError } =
      await supabaseAdmin.storage
        .from('character-images')
        .upload(fileName, videoBuffer, {
          contentType: 'video/mp4',
          upsert: false,
        })

    if (uploadError) {
      return res.status(500).json({
        error:
          'Upload failed: ' +
          uploadError.message,
      })
    }

      const { data: publicData } = supabaseAdmin.storage
      .from('character-images')
      .getPublicUrl(fileName)

    return res.status(200).json({
      success: true,
      videoUrl: publicData.publicUrl,
      atlasUrl,
      predictionId,
      duration: dur,
      resolution: resValue,
      model: MODEL,
    })
  } catch (err) {
    console.error('generate-video error:', err)

    return res.status(500).json({
      error: err.message || 'Unknown server error',
    })
  }
}
