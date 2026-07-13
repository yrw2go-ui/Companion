// pages/api/chat.js
import { buildSystemPrompt } from '../../lib/buildSystemPrompt'

// exact Atlas model IDs
const ALLOWED_MODELS = [
  // DeepSeek
  'deepseek-ai/deepseek-v4-pro',
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v3.2',
  // Qwen
  'qwen/qwen3.5-plus',
  'qwen/qwen3.7-max',
  'qwen/qwen3.5-27b',
  'qwen/qwen3.5-35b-a3b',
  // GLM
  'zai-org/glm-5',
  'zai-org/glm-4.7',
  // MiniMax
  'minimaxai/minimax-m3',
  'minimaxai/minimax-m2.7',
  // Kimi
  'moonshotai/kimi-k2.6',
  // Grok
  'xai/grok-4.5',
]

const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-pro'

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
        detail: data,
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
