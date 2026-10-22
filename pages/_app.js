// pages/_app.js
import { useEffect, useState } from 'react'
import '../styles/globals.css'

// Pinch + pan on .pinch-zoom images/videos. Page zoom is locked via viewport.
function usePinchZoom() {
  useEffect(() => {
    let state = null
    let lastTap = 0

    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    })
    const num = (el, key, fallback) => {
      const v = parseFloat(el.dataset[key] || '')
      return Number.isFinite(v) ? v : fallback
    }
    const apply = (el, s, x, y) => {
      el.style.transform = `translate(${x}px, ${y}px) scale(${s})`
      el.style.transformOrigin = 'center center'
      el.style.transition = 'none'
    }
    const store = (el, s, x, y) => {
      el.dataset.pzScale = String(s)
      el.dataset.pzX = String(x)
      el.dataset.pzY = String(y)
    }
    const reset = (el) => {
      store(el, 1, 0, 0)
      el.style.transition = 'transform 0.18s ease'
      el.style.transform = ''
    }

    const onStart = (e) => {
      const el = e.target.closest?.('.pinch-zoom')
      if (!el) return
      if (e.touches.length === 2) {
        state = {
          el,
          mode: 'pinch',
          startDist: dist(e.touches),
          startScale: num(el, 'pzScale', 1),
          scale: num(el, 'pzScale', 1),
          startMid: mid(e.touches),
          startTx: num(el, 'pzX', 0),
          startTy: num(el, 'pzY', 0),
          tx: num(el, 'pzX', 0),
          ty: num(el, 'pzY', 0),
        }
        e.preventDefault()
        return
      }
      if (e.touches.length === 1 && num(el, 'pzScale', 1) > 1.02) {
        state = {
          el,
          mode: 'pan',
          scale: num(el, 'pzScale', 1),
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          startTx: num(el, 'pzX', 0),
          startTy: num(el, 'pzY', 0),
          tx: num(el, 'pzX', 0),
          ty: num(el, 'pzY', 0),
        }
        e.preventDefault()
      }
    }

    const onMove = (e) => {
      if (!state) return
      const { el } = state
      if (state.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault()
        const d = dist(e.touches)
        const m = mid(e.touches)
        state.scale = Math.min(6, Math.max(1, state.startScale * (d / (state.startDist || 1))))
        state.tx = state.startTx + (m.x - state.startMid.x)
        state.ty = state.startTy + (m.y - state.startMid.y)
        apply(el, state.scale, state.tx, state.ty)
        return
      }
      if (state.mode === 'pan' && e.touches.length === 1) {
        e.preventDefault()
        state.tx = state.startTx + (e.touches[0].clientX - state.startX)
        state.ty = state.startTy + (e.touches[0].clientY - state.startY)
        apply(el, state.scale, state.tx, state.ty)
      }
    }

    const onEnd = () => {
      if (!state) return
      const { el, scale, tx, ty } = state
      if (scale < 1.05) reset(el)
      else store(el, scale, tx, ty)
      state = null
    }

    const onClick = (e) => {
      const el = e.target.closest?.('.pinch-zoom')
      if (!el) return
      const now = Date.now()
      if (now - lastTap < 280) {
        reset(el)
        lastTap = 0
      } else {
        lastTap = now
      }
    }

    document.addEventListener('touchstart', onStart, { passive: false })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
      document.removeEventListener('click', onClick)
    }
  }, [])
}

function PinLock({ status, onUnlocked, onLock }) {
  const [digits, setDigits] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (value) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/pin-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlock', pin: value, tzOffset: new Date().getTimezoneOffset() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || 'Wrong PIN')
        setDigits('')
      } else {
        onUnlocked(data)
      }
    } catch (e) {
      setErr(e.message || 'Failed')
    }
    setBusy(false)
  }

  const press = (d) => {
    if (busy) return
    const next = (digits + d).slice(0, 6)
    setDigits(next)
    setErr('')
    if (next.length >= 4) {
      // submit on 4; extra digits can be added then confirmed
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black text-white flex flex-col items-center justify-center px-6">
      <div className="text-4xl mb-3">🔒</div>
      <h1 className="text-xl font-bold mb-1">App locked</h1>
      <p className="text-sm text-gray-400 mb-6">Enter your PIN</p>
      <div className="flex gap-3 mb-6">
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`w-3 h-3 rounded-full ${digits.length > i ? 'bg-white' : 'bg-gray-700'}`} />
        ))}
        {digits.length > 4 && <span className="text-xs text-gray-400 self-center">+{digits.length - 4}</span>}
      </div>
      <div className="grid grid-cols-3 gap-3 w-64">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map(k => (
          <button
            key={k || 'blank'}
            type="button"
            disabled={!k || busy}
            onClick={() => {
              if (k === '⌫') setDigits(d => d.slice(0, -1))
              else if (k) press(k)
            }}
            className={`h-14 rounded-full text-xl font-semibold ${k ? 'bg-gray-900 hover:bg-gray-800' : ''}`}
          >{k}</button>
        ))}
      </div>
      <button
        type="button"
        disabled={digits.length < 4 || busy}
        onClick={() => submit(digits)}
        className="mt-5 w-64 rounded-full bg-pink-600 disabled:opacity-40 py-3 font-semibold"
      >{busy ? 'Checking…' : 'Unlock'}</button>
      {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
    </div>
  )
}

export default function App({ Component, pageProps }) {
  usePinchZoom()
  const [lock, setLock] = useState(null) // null = loading

  const refresh = async () => {
    try {
      const res = await fetch('/api/pin-lock')
      const data = await res.json()
      setLock(data)
    } catch {
      setLock({ hasPin: false, enabled: false, locked: false })
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    refresh()
    const id = setInterval(refresh, 20000)
    return () => clearInterval(id)
  }, [])

  const lockNow = async () => {
    if (!lock?.hasPin) return
    await fetch('/api/pin-lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lock' }),
    })
    refresh()
  }

  const locked = !!(lock && lock.locked)

  return (
    <>
      {!locked && <Component {...pageProps} />}
      {locked && <PinLock status={lock} onUnlocked={() => refresh()} />}
      {lock?.hasPin && !locked && (
        <button
          type="button"
          onClick={lockNow}
          title="Lock app"
          aria-label="Lock app"
          className="fixed bottom-5 left-5 z-[60] w-12 h-12 rounded-full bg-black/80 border border-white/25 text-white text-xl shadow-lg"
        >🔒</button>
      )}
    </>
  )
}
