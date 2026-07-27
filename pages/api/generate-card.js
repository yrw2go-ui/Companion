// pages/api/generate-card.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { concept, rarity: chosenRarity } = req.body

  if (!concept || !concept.trim()) {
    return res.status(400).json({ error: 'No concept provided' })
  }

  const rarityInstruction = (chosenRarity && chosenRarity !== 'random')
    ? `The rarity MUST be exactly "${chosenRarity}". Do not choose a different rarity.`
    : 'Choose a fitting rarity from the allowed list.'

  const prompt = `You are designing a collectible card for a contemporary lifestyle series. The characters are ORIGINAL FICTIONAL PEOPLE in a modern real-world setting: models, athletes, performers, artists, entrepreneurs. This is NOT fantasy. No magic, no swords, no mythical creatures, no supernatural powers, no sci-fi.

Concept: ${concept}

Return ONLY a JSON object with no markdown, no backticks, no preamble, in exactly this shape:
{
  "name": "a plausible modern first and last name",
  "title": "a short modern epithet describing their field, e.g. Runway Regular, Sprint Specialist, Studio Veteran",
  "description": "2 sentences about who they are, their discipline, and what sets them apart",
  "flavor_text": "one memorable line they might say, max 15 words",
  "rarity": "one of: common, uncommon, rare, epic, legendary, ultra elite, after hours",
  // RARITY RULE: ${rarityInstruction}
  "stats": [
    { "label": "Star Power", "value": 20-100 },
    { "label": "Physique", "value": 20-100 },
    { "label": "Allure", "value": 20-100 },
    { "label": "Charisma", "value": 20-100 }
  ],
  "image_prompt": "FRONT art: one concise line covering the key appearance (age, hair, build, outfit) and a modern setting. No photography or lighting style.",
  "back_image_prompt": "BACK art: one concise line. The SAME person (repeat the key appearance words) in a different pose and setting. Composition: subject positioned in the upper half of the frame, head and shoulders near the top third, with open space toward the bottom of the image. No photography or lighting style."
}

AFTER HOURS: if the concept asks for an "after hours" card, this is the rarest type and works differently.
It shows the person away from work, in an ordinary private moment: at home reading, cooking, walking a dog,
at a late diner, on a balcony, at the laundromat, playing an instrument, cooking in the kitchen but all with sensualized outfits or even nude or seminude. Relaxed everyday
clothing but sensual and revealing. The mood is quiet and sensual rather than glamorous. The description should reveal something
personal about who they are off duty. After Hours cards have NO stats, so return "stats": [] for them.

STATS: always use exactly these four labels, in this order, with no substitutions and no additions:
  "Star Power", "Physique", "Allure", "Charisma"
Only the values change from card to card. Choose values that fit the character and their rarity.

APPEARANCE RULES, these matter:
- The person must be a completely invented individual, not based on or resembling any real public figure. Never reference a real person's name or likeness.
- Vary ethnicity, features, body type and age naturally across cards. Be specific rather than defaulting.
- Everyone depicted is a healthy adult, clearly over 19. Clothing is everyday, sensual, leisure, athletic, or fashion, modeling or workout attire and can be suited for adult only audiences.

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
    if (chosenRarity && chosenRarity !== 'random') {
      card.rarity = chosenRarity
    }
    const rarityLower = String(card.rarity || '').toLowerCase()

    // After Hours cards carry no ratings
    if (rarityLower === 'after hours') {
      card.stats = []
      return res.status(200).json({ card })
    }

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
