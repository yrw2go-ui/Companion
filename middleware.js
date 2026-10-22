// middleware.js
// Blocks app API calls while the PIN lock is on and the request has no valid
// unlock. Lock state is read from Supabase on every call, so a fresh browser or
// a deleted cookie can't skip it. The lock API itself stays reachable.
import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/api/:path*'],
}

const SECRET = process.env.PIN_LOCK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'pin-lock'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function hmacHex(payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function unlockValid(token) {
  if (!token || !token.includes('.')) return false
  const [payload, sig] = token.split('.')
  const expected = await hmacHex(payload)
  if (expected.length !== (sig || '').length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return false
  const exp = Number(String(payload).replace(/^exp=/, ''))
  return Number.isFinite(exp) && exp > Date.now()
}

// Returns { enabled, until } from user_settings, or null if it can't be read.
async function loadLock() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_settings?id=eq.1&select=pin_hash,pin_salt,pin_enabled,unlocked_until`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, cache: 'no-store' }
    )
    // 400 = PIN columns not created yet, so no PIN can be set: treat as off.
    if (res.status === 400) return { enabled: false, until: 0 }
    if (!res.ok) return null
    const row = (await res.json())[0] || {}
    return {
      enabled: !!row.pin_enabled && !!(row.pin_hash && row.pin_salt),
      until: row.unlocked_until ? new Date(row.unlocked_until).getTime() : 0,
    }
  } catch {
    return null
  }
}

export async function middleware(req) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/api/pin-lock')) return NextResponse.next()

  const lock = await loadLock()
  if (!lock) return NextResponse.json({ error: 'Could not check app lock' }, { status: 503 })
  if (!lock.enabled) return NextResponse.next()

  // Same rule as /api/pin-lock: a valid cookie AND the server-side window still open,
  // so pressing the lock button locks every device at once.
  const ok = lock.until > Date.now() && await unlockValid(req.cookies.get('app_unlock')?.value || '')
  if (ok) return NextResponse.next()

  return NextResponse.json({ error: 'App is locked' }, { status: 423 })
}
