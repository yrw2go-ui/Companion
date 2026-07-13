// pages/api/chat.js
import { buildSystemPrompt } from '../../lib/buildSystemPrompt'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { character, coreMemories, scenario, messages, spicyMode } = req.body

  const systemPrompt = buildSystemPrompt(character, coreMemories, scenario)

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  try {
    if (spicyMode) {
      // Atlas spicy LLM
      const response = await fetch('https://api.atlascloud.ai/api/v1/chat/completions', {  // adjust endpoint if needed
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'atlascloud/spicy-llm-model',  // replace with actual spicy model ID
          messages: chatMessages,
          temperature: 0.9,
          max_tokens: 800,
        }),
      })
      const data = await response.json()
      if (!response.ok) return res.status(500).json({ error: data.error || 'Atlas error' })
      const reply = data.choices?.[0]?.message?.content || data.reply
      return res.status(200).json({ reply })
    } else {
      // Mistral regular
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: chatMessages,
          temperature: 0.8,
          max_tokens: 800,
        }),
      })
      const data = await response.json()
      if (!response.ok) return res.status(500).json({ error: data.message || 'Mistral error' })
      const reply = data.choices[0].message.content
      return res.status(200).json({ reply })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
