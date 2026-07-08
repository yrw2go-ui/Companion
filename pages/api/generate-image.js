// pages/api/generate-image.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body

  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' })
  }

  const BASE_URL = 'https://api.atlascloud.ai/api/v1'
  const MODEL = 'black-forest-labs/flux-dev'

  try {
    const submitRes = await fetch(`${BASE_URL}/model/generateImage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: prompt,
        size: '768*1024',
        num_images: 1,
        guidance_scale: 3.5,
        num_inference_steps: 28,
      }),
    })

    const rawText = await submitRes.text()

    // return the entire raw response so we can see the exact structure
    return res.status(200).json({
      debug: true,
      httpStatus: submitRes.status,
      rawResponse: rawText,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
