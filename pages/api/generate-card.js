// pages/api/generate-card.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { concept } = req.body

  if (!concept || !concept.trim()) {
    return res.status(400).json({ error: 'No concept provided' })
  }

  const prompt = `You are a trading card designer. Based on this concept, invent a character and return ONLY a JSON object with no markdown, no backticks, no preamble.

Concept: ${concept}

Return exactly this shape:
{
  "name": "character name",
  "title": "a short epithet, e.g. Warden of the Deep",
  "description": "2 sentences describing who they are",
  "flavor_text": "one evocative quote or line, max 15 words",
  "rarity": "one of: common, uncommon, rare, epic, legendary",
  "stats": [
    { "label": "SHORT STAT NAME", "value": number 20-100 },
    { "label": "SHORT STAT NAME", "value": number 20-100 },
    { "label": "SHORT STAT NAME", "value": number 20-100 },
    { "label": "SHORT STAT NAME", "value": number 20-100 }
  ],
  "image_prompt": "FRONT art: a vivid portrait description. appearance, pose, setting, mood",
  "back_image_prompt": "BACK art: the SAME character in a different scene. an alternate pose or dramatic angle. keep appearance details consistent with the front, but change pose, setting and framing"
}

IMPORTANT about stats: invent 4 stat labels that FIT THIS CHARACTER's nature and theme, not generic RPG combat stats. Keep each label short (1 word if possible, max 2). For example a scholar might have Insight, Memory, Cunning, Resolve. A dancer might have Grace, Poise, Rhythm, Allure. Choose labels that suit the concept.

Higher rarity should mean stronger stat values overall. The two image prompts must describe the same character with matching physical features.`

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
        temperature: 0.9,
        max_tokens: 900,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(500).json({ error: data.message || 'Mistral error' })
    }

    let text = data.choices[0].message.content.trim()
    text = text.replace(/```json/g, '').replace(/```/g, '').trim()

    let card
    try {
      card = JSON.parse(text)
    } catch {
      return res.status(500).json({ error: 'Could not parse card JSON', raw: text.slice(0, 300) })
    }

    if (!Array.isArray(card.stats) || card.stats.length === 0) {
      card.stats = [
        { label: 'Power', value: 50 },
        { label: 'Skill', value: 50 },
        { label: 'Spirit', value: 50 },
        { label: 'Speed', value: 50 },
      ]
    }

    return res.status(200).json({ card })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
