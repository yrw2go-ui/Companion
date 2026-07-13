// pages/api/list-models.js
export default async function handler(req, res) {
  try {
    const response = await fetch('https://api.atlascloud.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.ATLAS_API_KEY}`,
      },
    })

    const raw = await response.text()

    let data
    try {
      data = JSON.parse(raw)
    } catch {
      return res.status(200).json({
        error: 'non-JSON response',
        httpStatus: response.status,
        raw: raw.slice(0, 500),
      })
    }

    // just the ids, so it's readable
    const ids = (data.data || data.models || [])
      .map(m => m.id || m.name)
      .filter(Boolean)

    return res.status(200).json({
      httpStatus: response.status,
      count: ids.length,
      models: ids,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
