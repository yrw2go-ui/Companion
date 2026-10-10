// lib/downloadName.js
// Sequential download names: i/v/g + number. Starts at 5 digits, grows to 12. No dates.

const KEY = 'ga_dl_seq'

function readSeq() {
  try {
    const n = parseInt(localStorage.getItem(KEY) || '', 10)
    if (n >= 10000) return n
  } catch {}
  const start = 10000 + Math.floor(Math.random() * 90000) // random 5-digit start
  try { localStorage.setItem(KEY, String(start)) } catch {}
  return start
}

export function nextDownloadNumber() {
  const n = readSeq()
  const next = n >= 999999999999 ? n : n + 1 // stop at 12 digits
  try { localStorage.setItem(KEY, String(next)) } catch {}
  return String(n)
}

export function prefixFor(itemOrType, url = '', mime = '') {
  const type = String(itemOrType?.type || itemOrType || '').toLowerCase()
  const u = String(url || itemOrType?.url || '').toLowerCase()
  const m = String(mime || '').toLowerCase()
  if (u.includes('.gif') || m.includes('gif') || type === 'gif') return 'g'
  if (type === 'video' || u.includes('.mp4') || u.includes('.webm') || m.startsWith('video/')) return 'v'
  if (type === 'audio' || u.includes('.mp3') || u.includes('.wav') || m.startsWith('audio/')) return 'a'
  if (type === 'model' || u.includes('.glb') || u.includes('.gltf')) return 'm'
  return 'i'
}

export function extFor(itemOrType, url = '', mime = '') {
  const u = String(url || itemOrType?.url || '').toLowerCase()
  const m = String(mime || '').toLowerCase()
  if (u.includes('.gif') || m.includes('gif')) return 'gif'
  if (u.includes('.png') || m.includes('png')) return 'png'
  if (u.includes('.webp') || m.includes('webp')) return 'webp'
  if (u.includes('.webm') || m.includes('webm')) return 'webm'
  if (u.includes('.mp4') || m.includes('mp4')) return 'mp4'
  if (u.includes('.jpeg') || u.includes('.jpg') || m.includes('jpeg')) return 'jpg'
  if (u.includes('.glb')) return 'glb'
  if (u.includes('.mp3') || m.includes('mpeg')) return 'mp3'
  const type = String(itemOrType?.type || itemOrType || '').toLowerCase()
  if (type === 'video') return 'mp4'
  if (type === 'audio') return 'mp3'
  if (type === 'model') return 'glb'
  return 'jpg'
}

export function buildDownloadName(item, extra = {}) {
  const url = extra.url || item?.url || ''
  const mime = extra.mime || ''
  const prefix = prefixFor(item, url, mime)
  const ext = extra.ext || extFor(item, url, mime)
  return `${prefix}${nextDownloadNumber()}.${ext}`
}

export function triggerBlobDownload(blob, fileName) {
  const mime = blob?.type && blob.type !== 'application/octet-stream'
    ? blob.type
    : 'application/octet-stream'
  const typed = blob?.type === mime ? blob : new Blob([blob], { type: mime })
  const objUrl = URL.createObjectURL(typed)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    try { a.remove() } catch {}
    try { URL.revokeObjectURL(objUrl) } catch {}
  }, 60000)
}
