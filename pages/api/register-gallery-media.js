// pages/api/register-gallery-media.js
// Server-side gallery_media insert so rows land even when the phone tab is backgrounded.
// Uses service role when available (bypasses RLS); falls back to anon key.
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function cleanRow(input) {
  const row = input && typeof input === 'object' ? input : {}
  const out = {}
  const allow = [
    'type',
    'url',
    'prompt',
    'negative_prompt',
    'model',
    'seed',
    'size',
    'poster_url',
    'thumbnail_url',
    'character_id',
    'source_prompt',
    'folder',
  ]
  for (const k of allow) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  out.url = String(row.url || '').trim()
  out.type = String(row.type || 'image').trim() || 'image'
  if (row.seed !== undefined && row.seed !== null && row.seed !== '') {
    const n = Number(row.seed)
    out.seed = Number.isFinite(n) ? n : row.seed
  }
  return out
}

async function insertWithFallback(supabase, row) {
  // existing?
  const { data: existing } = await supabase
    .from('gallery_media')
    .select('*')
    .eq('url', row.url)
    .limit(1)
    .maybeSingle()
  if (existing?.id) return { data: existing, created: false }

  const payloads = [
    row,
    {
      type: row.type,
      url: row.url,
      prompt: row.prompt || null,
      model: row.model || null,
      poster_url: row.poster_url || null,
      seed: row.seed ?? null,
      size: row.size || null,
      negative_prompt: row.negative_prompt || null,
      source_prompt: row.source_prompt || null,
      character_id: row.character_id || null,
      thumbnail_url: row.thumbnail_url || null,
    },
    { type: row.type, url: row.url, prompt: row.prompt || null, model: row.model || null },
    { type: row.type, url: row.url },
  ]

  let lastError = null
  for (const payload of payloads) {
    const body = {}
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined && v !== null && v !== '') body[k] = v
    }
    body.url = row.url
    body.type = row.type
    const { data, error } = await supabase.from('gallery_media').insert([body]).select().single()
    if (!error && data) return { data, created: true }
    lastError = error
    if (error && /duplicate|unique/i.test(error.message || '')) {
      const { data: again } = await supabase
        .from('gallery_media')
        .select('*')
        .eq('url', row.url)
        .limit(1)
        .maybeSingle()
      if (again) return { data: again, created: false }
    }
  }
  return { data: null, error: lastError, created: false }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = adminClient()
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase env not configured on server' })
  }

  // support single row or { items: [...] } and sendBeacon text body
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  body = body || {}

  const list = Array.isArray(body.items)
    ? body.items
    : body.url
      ? [body]
      : Array.isArray(body.rows)
        ? body.rows
        : []

  if (!list.length) {
    return res.status(400).json({ error: 'No media rows (need url)' })
  }

  const results = []
  for (const raw of list) {
    const row = cleanRow(raw)
    if (!row.url) {
      results.push({ ok: false, error: 'missing url' })
      continue
    }
    try {
      const { data, error, created } = await insertWithFallback(supabase, row)
      if (data) results.push({ ok: true, created, id: data.id, url: data.url, row: data })
      else results.push({ ok: false, url: row.url, error: error?.message || 'insert failed' })
    } catch (e) {
      results.push({ ok: false, url: row.url, error: e.message || 'server error' })
    }
  }

  const ok = results.filter((r) => r.ok).length
  return res.status(200).json({
    ok: ok > 0,
    registered: ok,
    total: results.length,
    results,
  })
}
