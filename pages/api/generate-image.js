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
  const MODEL = 'black-forest-labs/flux-kontext-dev-lora/text-to-image'

  try {
    // submit generation request
    const submitRes = await fetch(`${BASE_URL}/model/prediction`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: {
          prompt: prompt,
          width: 768,
          height: 1024,
        },
      }),
    })

    const submitData = await submitRes.json()

    if (!submitRes.ok) {
      return res.status(500).json({ error: submitData.error || submitData.message || 'Submit failed' })
    }

    const predictionId = submitData.id || submitData.prediction_id
    if (!predictionId) {
      // some responses return the image directly
      const directUrl = submitData.output?.[0] || submitData.image_url || submitData.url
      if (directUrl) return res.status(200).json({ imageUrl: directUrl })
      return res.status(500).json({ error: 'No prediction ID returned' })
    }

    // poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1500))

      const pollRes = await fetch(`${BASE_URL}/model/prediction/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${process.env.ATLAS_API_KEY}` },
      })
      const pollData = await pollRes.json()

      const status = pollData.status
      if (status === 'succeeded' || status === 'completed') {
        const imageUrl = pollData.output?.[0] || pollData.image_url || pollData.url || pollData.output
        return res.status(200).json({ imageUrl })
      }
      if (status === 'failed' || status === 'error') {
        return res.status(500).json({ error: 'Generation failed' })
      }
    }

    return res.status(500).json({ error: 'Timed out waiting for image' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
