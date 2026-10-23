// pages/api/pin-lock.js
// Server-side PIN lock. State lives in Supabase; unlock is an httpOnly cookie
// that expires 5 minutes after the app was last open on screen (the client
// sends 'touch' while visible). Manual lock clears the cookie immediately.
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SECRET = process.env.PIN_LOCK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'pin-lock'
const COOKIE = 'app_unlock'
const PIN_ON = 'pin_on'

const SETUP_SQL = `alter table user_settings add column if not exists pin_hash text;
alter table user_settings add column if not exists pin_salt text;
alter table user_settings add column if not exists pin_enabled boolean default false;
alter table user_settings add column if not exists unlocked_until timestamptz;
alter table user_settings add column if not exists pin_fail_count integer not null default 0;
alter table user_settings add column if not exists pin_retry_at timestamptz;`

// Wrong-PIN limit: after MAX_TRIES misses, PIN entry is blocked for LOCKOUT_MS.
const MAX_TRIES = 5
const LOCKOUT_MS = 15 * 60 * 1000

function hmac(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
}
function sign(exp) {
  const payload = `exp=${exp}`
  return `${payload}.${hmac(payload)}`
}
function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return 0
  const [payload, sig] = token.split('.')
  const expected = hmac(payload)
  const a = Buffer.from(sig || '')
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 0
  const exp = Number(String(payload).replace(/^exp=/, ''))
  return Number.isFinite(exp) && exp > Date.now() ? exp : 0
}
function readCookie(req, name) {
  const raw = req.headers.cookie || ''
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : ''
}
function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex')
}
const IDLE_MS = 5 * 60 * 1000
function unlockWindow() {
  return Date.now() + IDLE_MS
}
function setUnlockCookie(res, exp) {
  const token = sign(exp)
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${new Date(exp).toUTCString()}`,
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  res.setHeader('Set-Cookie', [
    parts.join('; '),
    `${PIN_ON}=1; Path=/; SameSite=Lax; Max-Age=31536000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  ])
}
function clearUnlockCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

async function loadLock() {
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('pin_hash, pin_salt, pin_enabled, unlocked_until, pin_fail_count, pin_retry_at')
    .eq('id', 1)
    .maybeSingle()
  if (error) {
    const missing = /pin_hash|pin_enabled|column/i.test(error.message || '')
    return { error: missing ? 'setup' : error.message, setupSql: missing ? SETUP_SQL : undefined }
  }
  return { row: data || {} }
}

// Claims one PIN try before the PIN is checked. The update only succeeds if the
// counter is unchanged, so parallel guesses can't all slip past the limit.
async function claimTry(row) {
  const retryAt = row.pin_retry_at ? new Date(row.pin_retry_at).getTime() : 0
  if (retryAt > Date.now()) return { blocked: retryAt }
  const count = row.pin_fail_count || 0
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .update({ pin_fail_count: count + 1 })
    .eq('id', 1)
    .eq('pin_fail_count', count)
    .select('id')
  if (error || !data || data.length === 0) return { busy: true }
  return { tryNo: count + 1 }
}

async function pinMiss(tryNo) {
  if (tryNo < MAX_TRIES) return { left: MAX_TRIES - tryNo }
  const until = Date.now() + LOCKOUT_MS
  await supabaseAdmin.from('user_settings')
    .update({ pin_fail_count: 0, pin_retry_at: new Date(until).toISOString() })
    .eq('id', 1)
  return { blocked: until }
}

function sendTryError(res, t, label) {
  if (t.busy) return res.status(429).json({ error: 'Too many tries at once. Wait a moment.' })
  if (t.blocked) {
    const mins = Math.max(1, Math.ceil((t.blocked - Date.now()) / 60000))
    return res.status(429).json({ error: `Too many wrong PINs. Try again in ${mins} min.`, retryAt: t.blocked })
  }
  return res.status(401).json({ error: `${label}. ${t.left} ${t.left === 1 ? 'try' : 'tries'} left.` })
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const loaded = await loadLock()
  if (loaded.error) {
    return res.status(loaded.error === 'setup' ? 409 : 500).json({
      error: loaded.error === 'setup' ? 'PIN lock columns missing. Run the setup SQL in Supabase.' : loaded.error,
      setupSql: loaded.setupSql,
    })
  }
  const row = loaded.row
  const hasPin = !!(row.pin_hash && row.pin_salt)
  const enabled = !!row.pin_enabled && hasPin
  const cookieExp = verifyToken(readCookie(req, COOKIE))
  const until = row.unlocked_until ? new Date(row.unlocked_until).getTime() : 0
  // Unlocked only with BOTH a valid cookie on this device and an open window in the DB.
  const unlockExp = cookieExp && until ? Math.min(cookieExp, until) : 0
  const locked = enabled && !(unlockExp > Date.now())

  if (req.method === 'GET') {
    return res.status(200).json({
      hasPin,
      enabled,
      locked,
      unlocksAt: locked ? null : (unlockExp || null),
    })
  }

  const { action, pin, currentPin } = req.body || {}

  if (action === 'set') {
    const next = String(pin || '').replace(/\D/g, '')
    if (next.length < 4 || next.length > 6) {
      return res.status(400).json({ error: 'PIN must be 4 to 6 digits' })
    }
    if (hasPin) {
      const t = await claimTry(row)
      if (!t.tryNo) return sendTryError(res, t)
      const cur = String(currentPin || '').replace(/\D/g, '')
      if (hashPin(cur, row.pin_salt) !== row.pin_hash) {
        return sendTryError(res, await pinMiss(t.tryNo), 'Current PIN is wrong')
      }
    }
    const salt = crypto.randomBytes(16).toString('hex')
    const exp = unlockWindow()
    const { error } = await supabaseAdmin.from('user_settings').upsert({
      id: 1,
      pin_hash: hashPin(next, salt),
      pin_salt: salt,
      pin_enabled: true,
      unlocked_until: new Date(exp).toISOString(),
      pin_fail_count: 0,
      pin_retry_at: null,
    })
    if (error) return res.status(500).json({ error: error.message, setupSql: SETUP_SQL })
    setUnlockCookie(res, exp)
    return res.status(200).json({ ok: true, locked: false, unlocksAt: exp })
  }

  if (action === 'unlock') {
    if (!hasPin) return res.status(400).json({ error: 'No PIN set' })
    const t = await claimTry(row)
    if (!t.tryNo) return sendTryError(res, t)
    const attempt = String(pin || '').replace(/\D/g, '')
    if (hashPin(attempt, row.pin_salt) !== row.pin_hash) {
      return sendTryError(res, await pinMiss(t.tryNo), 'Wrong PIN')
    }
    const exp = unlockWindow()
    await supabaseAdmin.from('user_settings').upsert({
      id: 1,
      pin_enabled: true,
      unlocked_until: new Date(exp).toISOString(),
      pin_fail_count: 0,
      pin_retry_at: null,
    })
    setUnlockCookie(res, exp)
    return res.status(200).json({ ok: true, locked: false, unlocksAt: exp })
  }

  if (action === 'touch') {
    // Keep an already-unlocked app unlocked while it is on screen. Never unlocks.
    if (!enabled || locked) return res.status(200).json({ hasPin, enabled, locked, unlocksAt: null })
    const exp = unlockWindow()
    await supabaseAdmin.from('user_settings').upsert({ id: 1, unlocked_until: new Date(exp).toISOString() })
    setUnlockCookie(res, exp)
    return res.status(200).json({ hasPin, enabled, locked: false, unlocksAt: exp })
  }

  if (action === 'lock' || action === 'toggle') {
    if (!hasPin) return res.status(400).json({ error: 'Set a PIN first' })
    if (action === 'toggle' && locked) {
      return res.status(200).json({ locked: true, needsPin: true })
    }
    await supabaseAdmin.from('user_settings').upsert({
      id: 1,
      pin_enabled: true,
      unlocked_until: new Date(Date.now() - 1000).toISOString(),
    })
    clearUnlockCookie(res)
    return res.status(200).json({ ok: true, locked: true })
  }

  return res.status(400).json({ error: 'Unknown action' })
}
