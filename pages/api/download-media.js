// pages/api/download-media.js
// Privacy download proxy: the browser never contacts the media host.
// The host only sees this server's IP, not the user's. Client IP headers
// are never forwarded. Each request gets a unique nonce so downloads are not
// linkable by URL alone.

export const config = {
  api: { responseLimit: false },
}

const ALLOWED_HOST = [
  /\.supabase\.co$/i,
  /\.supabase\.in$/i,
  /(^|\.)atlascloud\.ai$/i,
  /(^|\.)atlascloud\.com$/i,
  /(^|\.)vercel\.app$/i,
  /(^|\.)cloudfront\.net$/i,
  /(^|\.)amazonaws\.com$/i,
]

function hostAllowed(hostname) {
  const own = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .replace(/^https?:\/\//, '')
    .split('/')[0]
  if (own && hostname === own) return true
  return ALLOWED_HOST.some((re) => re.test(hostname))
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const raw = req.method === 'POST' ? req.body?.url : req.query?.u
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'Missing url' })
  }

  let target
  try {
    target = new URL(raw)
  } catch {
    return res.status(400).json({ error: 'Bad url' })
  }
  if (target.protocol !== 'https:') {
    return res.status(400).json({ error: 'HTTPS only' })
  }
  if (!hostAllowed(target.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' })
  }

  try {
    // Fetch with a clean identity. Do not pass X-Forwarded-For, CF-Connecting-IP,
    // cookies, or the client IP. The upstream only sees this server.
    const upstream = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'CompanionDownload/1.0',
        Accept: '*/*',
      },
    })
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Upstream failed' })
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    const ct = upstream.headers.get('content-type') || 'application/octet-stream'
    const name = (req.query?.name && String(req.query.name).slice(0, 180)) || 'download'

    res.setHeader('Content-Type', ct)
    res.setHeader('Content-Length', String(buf.length))
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // Unique per request so downloads are not correlated by a shared URL
    res.setHeader('X-Download-Nonce', Math.random().toString(36).slice(2, 12))
    return res.status(200).send(buf)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Proxy failed' })
  }
}
