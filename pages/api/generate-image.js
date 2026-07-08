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

    const submitParsed = await safeJson(submitRes)
    if (!submitParsed.ok) {
      return res.status(500).json({ error: 'Atlas returned non-JSON', raw: submitParsed.raw?.slice(0, 300) })
    }

    const submitBody = submitParsed.data
    const predictionId = submitBody.data?.id
    if (!predictionId) {
      return res.status(500).json({ error: 'No prediction ID', detail: submitBody })
    }

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 1500))

      const pollRes = await fetch(`${BASE_URL}/model/prediction/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${process.env.ATLAS_API_KEY}` },
      })
      const pollParsed = await safeJson(pollRes)
      if (!pollParsed.ok) continue

      const pollBody = pollParsed.data.data || pollParsed.data
      const status = pollBody.status

      if (status === 'completed' || status ===
