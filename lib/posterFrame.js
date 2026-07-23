// lib/posterFrame.js
// Capture the first frame of a video and store it as a poster image.
// Runs client-side; used wherever a video is created so grids never
// have to download the video itself just to show a thumbnail.
import { supabase } from './supabaseClient'

// grab a frame near the start of the video as a JPEG data URL
export function captureFirstFrame(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    let settled = false
    const fail = (msg) => {
      if (settled) return
      settled = true
      reject(new Error(msg || 'Could not read the video'))
    }

    video.onloadeddata = () => {
      if (!video.duration || !isFinite(video.duration)) {
        fail('No readable duration')
        return
      }
      // a touch into the clip avoids an occasional black first frame
      video.currentTime = Math.min(0.3, video.duration / 2)
    }

    video.onseeked = () => {
      if (settled) return
      setTimeout(() => {
        if (settled) return
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          settled = true
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        } catch (e) {
          fail(e.message)
        }
      }, 120)
    }

    video.onerror = () => fail('Could not load the video')
    video.src = url
    video.load()
  })
}

// capture + upload, returning the public poster URL (or null on failure)
export async function makePoster(videoUrl) {
  try {
    const dataUrl = await captureFirstFrame(videoUrl)
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
