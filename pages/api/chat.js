// pages/api/chat.js
import { buildSystemPrompt } from '../../lib/buildSystemPrompt'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { character, coreMemories, scenario, messages } = req.body

  const systemPrompt = buildSystemPrompt(character, coreMemories, scenario)

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: chatMessages,
        temperature: 0.8,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(500).json({ error: data.message || 'Mistral API error' })
    }

    const reply = data.choices[0].message.content
    res.status(200).json({ reply })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
