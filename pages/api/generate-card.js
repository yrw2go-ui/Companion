// pages/api/generate-card.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { concept, rarity: chosenRarity } = req.body || {}

  if (!concept || !String(concept).trim()) {
    return res.status(400).json({ error: 'No concept provided' })
  }

  const allowedRarities = [
    'common',
    'uncommon',
    'rare',
    'epic',
    'legendary',
    'ultra elite',
    'after hours',
    'mint',
  ]

  const rarityInstruction =
    chosenRarity && chosenRarity !== 'random'
      ? `The rarity MUST be exactly "${chosenRarity}". Do not choose a different rarity.`
      : `Choose a fitting rarity from this list only: ${allowedRarities.join(', ')}.`

  const prompt = `You are an EPIC SEXY collectible card creator for a contemporary adult lifestyle series. Every card is sensual-leaning: poses, body language, and wardrobe have mild-to-strong sensual undertones. Descriptions always carry a soft sensual edge even when the setting is everyday.

The characters are ORIGINAL FICTIONAL PEOPLE in a modern real-world setting: models, athletes, performers, artists, influencers, entrepreneurs. This is NOT fantasy. No magic, no swords, no mythical creatures, no supernatural powers, no sci-fi.

Concept: ${concept}

${rarityInstruction}

Return ONLY a valid JSON object. No markdown. No backticks. No comments. No preamble. Use exactly this shape:

{
  "name": "a real, modern first and last name that fits the person's ethnicity (common real-world names people actually use — never invented-sounding or fantasy names)",
  "title": "a short modern epithet describing their field, e.g. Runway Regular, Sprint Specialist, Studio Veteran",
  "description": "2 sentences about who they are, their discipline, and what sets them apart — with mild sensual undertones woven in naturally",
  "flavor_text": "one memorable line they might say, max 15 words, lightly flirty or confident",
  "rarity": "one of: common, uncommon, rare, epic, legendary, ultra elite, after hours, mint",
  "stats": [
    { "label": "Star Power", "value": 50 },
    { "label": "Physique", "value": 50 },
    { "label": "Allure", "value": 50 },
    { "label": "Charisma", "value": 50 }
  ],
  "image_prompt": "FRONT art: one concise line — key appearance (age 18+, hair, build, skin, ethnicity cues), sensual pose, revealing or form-fitting modern outfit, modern setting. No photography or lighting style. No brand logos.",
  "back_image_prompt": "BACK art: one concise line. The SAME person (repeat the key appearance words) in a different sensual pose and setting. Composition: subject in the upper half of the frame, head and shoulders near the top third, open space toward the bottom. No photography or lighting style. No brand logos."
}

SENSUAL / NSFW SCALE BY RARITY (apply in both art prompts and description tone):
- common / uncommon / rare: mild sensual undertones. Flattering, slightly revealing everyday or athletic wear (crop tops, fitted jeans, short dresses, sports bras, open shirts). Suggestive posture, eye contact, soft body language. Never crude.
- epic / legendary / ultra elite: clearly more sexual and NSFW. More revealing attire (lingerie-adjacent fashion, sheer layers, deep necklines, short hemlines, wet-look fabrics, body-conscious fits). Stronger sensual poses (arched back, parted lips, hands on body, seated or leaning, bedroom-eyes). Description language more charged.
- mint: VERY sexual / NSFW by default. Often partial or full nudity, intimate poses, bedroom or private settings. Explicit sensual body focus while remaining tasteful collectible-card framing (not crude pornography captions). Stats at peak band.
- after hours: VERY sexual / NSFW by default. Private off-duty moments that often include nudity or near-nudity (shower, bed, mirror, late-night kitchen, balcony at night). Quiet, intimate, highly sensual. Return "stats": [].

ATTIRE RULES:
- Everyday casual still leans revealing: shorter hems, lower necklines, tighter fits, open layers, lingerie as outerwear when rarity is high.
- NEVER include real-life brand logos, logos, or trademarks (no Nike, Adidas, Gucci, Apple, etc.) on clothes, shoes, bags, phones, posters, or backgrounds. Describe plain or generic items only.

NAME RULES:
- Use real, modern given names and surnames that match the character's ethnicity or mixed background (e.g. Japanese: Yuki Nakamura; Nigerian: Amara Okonkwo; Mexican-American: Sofia Reyes; mixed European: Elena Rossi). Names must sound like people you could meet today — not made-up fantasy names.

ETHNICITY / AGE:
- Everyone is a healthy adult, clearly 18 or older (prefer mid-20s to 30s unless the concept says otherwise).
- Vary ethnicity widely: East Asian, South Asian, Black / African diaspora, Latina / Hispanic, Middle Eastern, White European, mixed-race, etc. Sometimes follow the concept; sometimes pick randomly when the concept is open.

STAT VALUE BANDS BY RARITY (integers inside the band):
- common: 20-45
- uncommon: 35-55
- rare: 45-65
- epic: 55-75
- legendary: 65-85
- ultra elite: 75-95
- mint: 90-100
- after hours: return "stats": []

STATS RULES:
- Always use exactly these four labels in this order: "Star Power", "Physique", "Allure", "Charisma"
- Only values change. After Hours must use an empty array.

APPEARANCE RULES:
- Completely invented individual. Never based on or resembling any real public figure. Never use a real celebrity's name or likeness.
- Be specific about features rather than defaulting to generic beauty.
- Both art prompts must describe the SAME person; copy the physical description verbatim between front and back.`

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
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
      return res.status(500).json({ error: data.message || data.error || 'Mistral error' })
    }

    let text = String(data?.choices?.[0]?.message?.content || '').trim()
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1)
    }

    let card
    try {
      card = JSON.parse(text)
    } catch {
      try {
        const repaired = text.replace(/,\s*([}\]])/g, '$1')
        card = JSON.parse(repaired)
      } catch {
        return res.status(500).json({
          error: 'Could not parse card JSON',
          raw: text.slice(0, 400),
        })
      }
    }

    if (!card || typeof card !== 'object') {
      return res.status(500).json({ error: 'Invalid card payload' })
    }

    const STANDARD_LABELS = ['Star Power', 'Physique', 'Allure', 'Charisma']

    if (chosenRarity && chosenRarity !== 'random') {
      card.rarity = chosenRarity
    }

    let rarityLower = String(card.rarity || 'common').toLowerCase().trim()
    if (rarityLower === 'ultra-elite' || rarityLower === 'ultraelite') rarityLower = 'ultra elite'
    if (rarityLower === 'after-hours' || rarityLower === 'afterhours') rarityLower = 'after hours'
    if (!allowedRarities.includes(rarityLower)) rarityLower = 'common'
    card.rarity = rarityLower

    if (rarityLower === 'after hours') {
      card.stats = []
      card.name = String(card.name || 'Unknown').trim()
      card.title = String(card.title || '').trim()
      card.description = String(card.description || '').trim()
      card.flavor_text = String(card.flavor_text || '').trim()
      card.image_prompt = String(card.image_prompt || '').trim()
      card.back_image_prompt = String(card.back_image_prompt || '').trim()
      return res.status(200).json({ card })
    }

    const BANDS = {
      common: [20, 45],
      uncommon: [35, 55],
      rare: [45, 65],
      epic: [55, 75],
      legendary: [65, 85],
      'ultra elite': [75, 95],
      mint: [90, 100],
    }
    const [lo, hi] = BANDS[rarityLower] || [20, 45]

    const clampBand = (n) => {
      const v = parseInt(n, 10)
      if (isNaN(v)) return Math.round((lo + hi) / 2)
      return Math.max(lo, Math.min(hi, v))
    }

    if (Array.isArray(card.stats) && card.stats.length > 0) {
      card.stats = STANDARD_LABELS.map((label, i) => ({
        label,
        value: clampBand(card.stats[i]?.value),
      }))
    } else {
      const mid = Math.round((lo + hi) / 2)
      card.stats = STANDARD_LABELS.map((label) => ({ label, value: mid }))
    }

    card.name = String(card.name || 'Unknown').trim()
    card.title = String(card.title || '').trim()
    card.description = String(card.description || '').trim()
    card.flavor_text = String(card.flavor_text || '').trim()
    card.image_prompt = String(card.image_prompt || '').trim()
    card.back_image_prompt = String(card.back_image_prompt || '').trim()

    return res.status(200).json({ card })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' })
  }
}
