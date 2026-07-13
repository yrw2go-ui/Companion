// pages/api/chat.js
import { buildSystemPrompt } from '../../lib/buildSystemPrompt'

// models we allow, so a bad value can't break the call
const ALLOWED_MODELS = [
  'deepseek-v3',
  'qwen/qwen3-max-2026-01-23',
  'zai-org/GLM-4.6',
  'minimaxai/minimax-m2.7',
]

const DEFAULT_MODEL = 'deepseek-v3'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { character, coreMemories, scenario, messages } = req.body

  if (!character || !messages) {
    return res.status(400).json({ error: 'Missing character or messages' })
  }

  const requested = character.chat_model
  const model = ALLOWED_MODELS.includes(requested) ? requested : DEFAULT_MODEL

  const systemPrompt = buildSystemPrompt(character, coreMemories || [], scenario || '')

  try {
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
        temperature: 0.85,
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
        model,
        raw: raw.slice(0, 300),
      })
    }

    if (!response.ok) {
      return res.status(500).json({
        error: data.error?.message || data.message || 'Atlas error',
        httpStatus: response.status,
        model,
      })
    }

    const reply = data.choices?.[0]?.message?.content
    if (!reply) {
      return res.status(500).json({ error: 'No reply returned', model, detail: data })
    }

    return res.status(200).json({ reply, model })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
