import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BASE_URL = 'https://api.atlascloud.ai/api/v1'
const MODEL = 'alibaba/wan-2.7-pro/image-edit'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function safeJson(response) {
  const text = await response.text()

  try {
    return {
      ok: true,
      data: JSON.parse(text)
    }
  } catch {
    return {
      ok: false,
      raw: text
    }
  }
}

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    })
  }

  const {
    prompt,
    imageUrl,
    size,
    seed,
    thinkingMode
  } = req.body

  if (!prompt) {
    return res.status(400).json({
      error: 'Prompt is required'
    })
  }

  if (!imageUrl) {
    return res.status(400).json({
      error: 'imageUrl is required'
    })
  }

  const usedSeed =
    seed === undefined ||
    seed === null ||
    seed === ''
      ? -1
      : parseInt(seed)

  const usedSize = size || '2K'

  try {

    const submitBody = {
      model: MODEL,
      prompt,
      images: [imageUrl],
      size: usedSize,
      n: 1,
      seed: usedSeed,
      thinking_mode:
        thinkingMode === undefined
          ? true
          : Boolean(thinkingMode),
      enable_sync_mode: false,
      enable_base64_output: false
    }

    const submitResponse = await fetch(
      `${BASE_URL}/model/generateImage`,
      {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${process.env.ATLAS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitBody)
      }
    )

    const submit = await safeJson(submitResponse)

    if (!submit.ok) {
      return res.status(500).json({
        error: 'Atlas returned invalid JSON',
        raw: submit.raw
      })
    }

    const predictionId =
      submit.data?.data?.id

    if (!predictionId) {
      return res.status(500).json({
        error: 'Prediction ID missing',
        detail: submit.data
      })
    }
        let atlasImageUrl = null

    for (let i = 0; i < 60; i++) {

      await sleep(2000)

      const pollResponse = await fetch(
        `${BASE_URL}/model/prediction/${predictionId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.ATLAS_API_KEY}`
          }
        }
      )

      const poll = await safeJson(pollResponse)

      if (!poll.ok) {
        continue
      }

      const result = poll.data?.data || poll.data
      const status = result?.status

      if (
        status === 'completed' ||
        status === 'succeeded'
      ) {

        atlasImageUrl =
          result.outputs?.[0]

        break
      }

      if (
        status === 'failed' ||
        status === 'error'
      ) {

        return res.status(500).json({
          error:
            result.error ||
            'Image editing failed'
        })
      }
    }

    if (!atlasImageUrl) {

      return res.status(500).json({
        error: 'Generation timed out'
      })
    }

    const imageResponse = await fetch(atlasImageUrl)

    if (!imageResponse.ok) {

      return res.status(500).json({
        error: 'Could not download generated image'
      })
    }

    const imageBuffer = Buffer.from(
      await imageResponse.arrayBuffer()
    )

  const imageBuffer = Buffer.from(
  await imageResponse.arrayBuffer()
)

      const fileName =
      `edited_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}.jpg`

    const { error: uploadError } =
      await supabaseAdmin.storage
        .from('character-images')
        .upload(fileName, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        })

    if (uploadError) {
      return res.status(500).json({
        error:
          'Upload failed: ' +
          uploadError.message,
      })
    }

    const { data: publicData } =
      supabaseAdmin.storage
        .from('character-images')
        .getPublicUrl(fileName)

    return res.status(200).json({
      success: true,
      imageUrl: publicData.publicUrl,
      atlasUrl: atlasImageUrl,
      seed: usedSeed,
      size: usedSize,
      model: MODEL,
    })

    } catch (err) {
    console.error(err)

    return res.status(500).json({
      error: err.message || 'Unknown error',
    })
  }
}
