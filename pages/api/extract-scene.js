// pages/api/extract-scene.js
// Pulls just the current location, outfit, and mood from recent dialogue,
// so image prompts reflect the scene without dumping raw conversation text.
const BASE_URL = 'https://api.atlascloud.ai/v1/chat/completions'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { conversation, model } = req.body

  if (!conversation || !conversation.trim()) {
    // nothing to extract from; return empty fields
    return res.status(200).json({ location: '', outfit: '', mood: '' })
  }

  const useModel = model || 'deepseek-ai/deepseek-v4-pro'

  const sys = `You extract visual scene details from a roleplay conversation for image generation.
Read the recent messages and report ONLY the CURRENT state at the end of the conversation:
- location: where the character physically is right now (short phrase) like livingroom, hallway, kitchen, on the beach, etc.
- outfit: what the character is currently wearing, if mentioned or clearly implied (short phrase)
- mood: the character's current emotional state or expression (one or two words) like happy, aroused, sad, etc.

Rules:
- If something isn't stated or clearly implied, return an empty string for it. Do not invent details.
- Keep each value short and visual. No full sentences.
- Return ONLY a JSON object, no markdown or preamble, exactly: {"location":"","outfit":"","mood":""}`

  try {
    const r = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: useModel,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: conversation.slice(-2000) },
        ],
        temperature: 0.2,
        max_tokens: 150,
      }),
    })

    const data = await r.json()
    if (!r.ok) {
      return res.status(200).json({ location: '', outfit: '', mood: '' })
    }

    let text = (data.choices?.[0]?.message?.content || '').trim()
    text = text.replace(/```json/g, '').replace(/```/g, '').trim()

    let parsed
    try { parsed = JSON.parse(text) }
    catch { return res.status(200).json({ location: '', outfit: '', mood: '' }) }

    return res.status(200).json({
      location: (parsed.location || '').toString().slice(0, 120),
      outfit: (parsed.outfit || '').toString().slice(0, 120),
      mood: (parsed.mood || '').toString().slice(0, 60),
    })
  } catch (err) {
    // never block image generation on extraction failure
    return res.status(200).json({ location: '', outfit: '', mood: '' })
  }
}
