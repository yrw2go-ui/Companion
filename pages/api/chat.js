// pages/api/chat.js
import { buildSystemPrompt } from '../../lib/buildSystemPrompt'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { character, coreMemories, scenario, messages, spicyMode } = req.body

  if (!character || !messages) {
    return res.status(400).json({ error: 'Missing character or messages' })
  }

  const systemPrompt = buildSystemPrompt(character, coreMemories || [], scenario || '')

  try {
    const model = spicyMode ? 'qwen/qwen3.5-27b' : 'deepseek-v3'

    const response = await fetch('https://api.atlascloud.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: spicyMode ? 0.9 : 0.85,
        max_tokens: 800,
      }),
    })

    const raw = await response.text()

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(500).json({
        error: 'Atlas returned non-JSON',
        httpStatus: response.status,
        raw: raw.slice(0, 300),
      })
    }

    if (!response.ok) {
      return res.status(500).json({
        error: data.error?.message || data.message || 'Atlas error',
        httpStatus: response.status,
      })
    }

    const reply = data.choices?.[0]?.message?.content
    if (!reply) {
      return res.status(500).json({ error: 'No reply returned', detail: data })
    }

    return res.status(200).json({ reply })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
