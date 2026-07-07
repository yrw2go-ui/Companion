// pages/api/summarize.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages, characterName } = req.body

  if (!messages || messages.length === 0) {
    return res.status(200).json({ summary: '' })
  }

  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : characterName}: ${m.content}`)
    .join('\n')

  const prompt = `Summarize the key facts, events, and emotional moments from this conversation that ${characterName} should permanently remember about the user and their relationship. Write 2-4 short bullet points, each a single sentence. Only include things worth remembering long-term. Transcript:\n\n${transcript}`

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 300,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(500).json({ error: data.message || 'Mistral API error' })
    }

    const summary = data.choices[0].message.content
    res.status(200).json({ summary })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
