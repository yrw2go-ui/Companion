// lib/posterFrame.js
// Capture a frame of a video and store it as a poster image, client-side.
// Detects blank/black frames and returns null rather than saving a broken
// poster, so callers (and the backfill) can tell a real failure from success.
import { supabase } from './supabaseClient'

// is this canvas essentially a flat/blank frame?
function frameIsBlank(canvas) {
  try {
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    if (!w || !h) return true
    const data = ctx.getImageData(0, 0, w, h).data
    let min = 255, max = 0
    const step = Math.max(4, Math.floor((w * h) / 2000)) * 4
    for (let i = 0; i < data.length; i += step) {
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      if (lum < min) min = lum
      if (lum > max) max = lum
    }
    return (max - min) < 12
  } catch {
    // if we can't read pixels (tainted canvas / CORS), treat as failure
    return true
  }
}

// grab a non-blank frame as a JPEG data URL, trying a few timestamps
export function captureFirstFrame(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    // timestamps to try, in order
    const offsets = [1.0, 1.6, 2.4, 0.6, 3.2]
    let attempt = 0
    let settled = false

    const fail = (msg) => {
      if (settled) return
      settled = true
      reject(new Error(msg || 'Could not read the video'))
    }

    const drawAndCheck = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      // toDataURL throws on a tainted (cross-origin) canvas
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      return { dataUrl, blank: frameIsBlank(canvas) }
    }

    const trySeek = () => {
      if (attempt >= offsets.length) {
        fail('Only blank frames could be captured')
        return
      }
      const t = offsets[attempt]
      attempt++
      video.currentTime = Math.min(t, (video.duration || 1) - 0.05)
    }

    video.onloadeddata = () => {
      if (!video.duration || !isFinite(video.duration)) { fail('No readable duration'); return }
      trySeek()
    }

    video.onseeked = () => {
      if (settled) return
      setTimeout(() => {
        if (settled) return
        try {
          const { dataUrl, blank } = drawAndCheck()
          if (blank) { trySeek(); return }
          settled = true
          resolve(dataUrl)
        } catch (e) {
          // tainted canvas etc. — no point retrying, it will keep throwing
          fail(e.message)
        }
      }, 120)
    }

    video.onerror = () => fail('Could not load the video')
    video.src = url
    video.load()
  })
}

// capture + upload, returning the public poster URL, or null on any failure.
// Never saves a blank/broken poster.
export async function makePoster(videoUrl) {
  try {
    const dataUrl = await captureFirstFrame(videoUrl)
    if (!dataUrl) return null
    const res = await fetch('/api/extract-frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, kind: 'poster' }),
    })
    const data = await res.json()
    return data.imageUrl || null
  } catch (err) {
    return null
  }
}
