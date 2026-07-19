// pages/api/generate-card.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { concept } = req.body

  if (!concept || !concept.trim()) {
    return res.status(400).json({ error: 'No concept provided' })
  }

  const prompt = `You are designing a collectible card for a sensual contemporary lifestyle series. The characters are sensual ORIGINAL FICTIONAL PEOPLE in a modern real-world setting: models, athletes, performers, artists, entrepreneurs. This is NOT fantasy. No magic, no swords, no mythical creatures, no supernatural powers, no sci-fi.

Concept: ${concept}

Return ONLY a JSON object with no markdown, no backticks, no preamble, in exactly this shape:
{
  "name": "a plausible modern first and last name",
  "title": "a short modern epithet describing their field, e.g. Runway Regular, Sprint Specialist, Studio Veteran",
  "description": "2 sentences about who they are, their discipline, and what sets them apart",
  "flavor_text": "one memorable line they might say, max 15 words",
  "rarity": "one of: common, uncommon, rare, epic, legendary",
  "stats": [
    { "label": "Star Power", "value": 20-100 },
    { "label": "Physique", "value": 20-100 },
    { "label": "Allure", "value": 20-100 },
    { "label": "Charisma", "value": 20-100 }
  ],
  "image_prompt": "FRONT art: an editorial portrait. Give SPECIFIC physical details: approximate age, hair colour and style, eye colour, skin tone, build, and outfit. Then the pose, location, lighting and mood. Modern real-world settings only: studio, city street, gym, track, cafe, beach, backstage",
  "back_image_prompt": "BACK art: the SAME person, different shot. REPEAT the physical description word for word from the front prompt, then change only the pose, location and framing"
}

STATS: always use exactly these four labels, in this order, with no substitutions and no additions:
  "Star Power", "Physique", "Allure", "Charisma"
Only the values change from card to card. Choose values that fit the character and their rarity.

APPEARANCE RULES, these matter:
- The person must be a completely invented individual, not based on or resembling any real public figure. Never reference a real person's name or likeness.
- Vary ethnicity, features, body type and age naturally across cards. Be specific rather than defaulting.
- Everyone depicted is a healthy adult, clearly over 21. Clothing is everyday, athletic, or fashion-editorial and fully appropriate for a general audience.

Both art prompts must describe the same person, with the physical description copied verbatim between them.

Higher rarity should mean stronger overall stat values.`

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

    const STANDARD_LABELS = ['Star Power', 'Physique', 'Allure', 'Charisma']

    // normalise to the standard four, keeping whatever values came back
    if (Array.isArray(card.stats) && card.stats.length > 0) {
      card.stats = STANDARD_LABELS.map((label, i) => {
        const v = parseInt(card.stats[i]?.value)
        return { label, value: isNaN(v) ? 50 : Math.max(1, Math.min(100, v)) }
      })
    }

    if (!Array.isArray(card.stats) || card.stats.length === 0) {
      card.stats = [
        { label: 'Star Power', value: 50 },
        { label: 'Physique', value: 50 },
        { label: 'Allure', value: 50 },
        { label: 'Charisma', value: 50 },
      ]
    }

    return res.status(200).json({ card })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
