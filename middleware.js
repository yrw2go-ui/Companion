// middleware.js
// Blocks app API calls while the PIN lock is on and the unlock cookie is missing
// or past the hour. The PIN screen and the lock API itself stay reachable.
import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/api/:path*'],
}

const SECRET = process.env.PIN_LOCK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'pin-lock'

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

export async function middleware(req) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/api/pin-lock')) return NextResponse.next()

  const pinOn = req.cookies.get('pin_on')?.value === '1'
  if (!pinOn) return NextResponse.next()

  const ok = await unlockValid(req.cookies.get('app_unlock')?.value || '')
  if (ok) return NextResponse.next()

  return NextResponse.json({ error: 'App is locked' }, { status: 423 })
}
