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

  const prompt = `Below is a conversation between a user and ${characterName}.

Write 2-4 short bullet points capturing only the details worth remembering long term: things the user revealed about themselves, decisions made, emotional moments, or facts that changed the relationship.

Write them as plain statements from ${characterName}'s perspective, e.g. "He told me he's afraid of losing his job."

Do not include greetings, small talk, or anything trivial. Return only the bullet points, no preamble.

Conversation:
${transcript}`

  try {
    const response = await fetch('https://api.atlascloud.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v3',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 400,
      }),
    })

    const raw = await response.text()

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(200).json({ summary: '' })
    }

    if (!response.ok) {
      return res.status(200).json({ summary: '' })
    }

    const summary = data.choices?.[0]?.message?.content?.trim() || ''
    return res.status(200).json({ summary })
  } catch (err) {
    return res.status(200).json({ summary: '' })
  }
}
