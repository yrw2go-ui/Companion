// pages/gallery.js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import { makePoster } from '../lib/posterFrame'

const VIDEO_MODELS = [
  { id: 'alibaba/wan-2.6/image-to-video', label: 'Wan 2.6 (5-15s)' },
  { id: 'atlascloud/wan-2.2-turbo-spicy/image-to-video', label: 'Wan 2.2 Turbo Spicy (fast, 5s)' },
  { id: 'xai/grok-imagine-video-v1.5/image-to-video', label: 'Grok Imagine (up to 1080p)' },
]

const T2V_MODEL = 'xai/grok-imagine-video/text-to-video'

const IMAGE_MODELS = [
  { id: 'z-image/turbo', label: 'Z-Image Turbo', family: 'flux' },
  { id: 'black-forest-labs/flux-dev', label: 'Flux Dev', family: 'flux' },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell (fast)', family: 'schnell' },
  { id: 'bytedance/seedream-v5.0-pro/text-to-image', label: 'Seedream 5 Pro (hi-res)', family: 'seedream' },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine', family: 'grok' },
]
const imgFamilyOf = (id) => (IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0]).family

// image-to-image (transform) models
const I2I_MODELS = [
  { id: 'alibaba/wan-2.7-pro/image-edit', label: 'Wan 2.7 Pro (edit)' },
  { id: 'bytedance/seedream-v5.0-pro/edit', label: 'Seedream 5 Pro (edit)' },
  { id: 'xai/grok-imagine-image-quality/edit', label: 'Grok Imagine (edit)' },
]

const DEFAULT_NEGATIVE = 'blurry, (Asian), mature woman, big hips, wide hips, big breasts, unattractive female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

const SIZES = [
  { value: '768*1024', label: 'Portrait 3:4' },
  { value: '1024*768', label: 'Landscape 4:3' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '576*1024', label: 'Tall 9:16' },
  { value: '1024*576', label: 'Wide 16:9' },
]

export default function Gallery() {
  const router = useRouter()
  const [media, setMedia] = useState([])
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [folders, setFolders] = useState([])
  const [activeFolder, setActiveFolder] = useState('all')  // 'all' | 'unfiled' | folderId
  const [folderModal, setFolderModal] = useState(null)  // { mode:'create'|'rename', id?, name }
  const [folderMap, setFolderMap] = useState({})  // item_key -> folder_id
  const downloadCounter = useRef(0)
  const [gSort, setGSort] = useState('date_desc')
  const [gSearch, setGSearch] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [selected, setSelected] = useState(null)

  const [showCreate, setShowCreate] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [seed, setSeed] = useState('')
  const [size, setSize] = useState('768*1024')
  const [charId, setCharId] = useState('')
  const [guidance, setGuidance] = useState(3.5)
  const [steps, setSteps] = useState(28)
  const [creating, setCreating] = useState(false)

  const [showVideo, setShowVideo] = useState(false)
  const [videoSource, setVideoSource] = useState('')
  const [videoPrompt, setVideoPrompt] = useState('smooth natural motion,')
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoRes, setVideoRes] = useState('720p')
  const [videoModel, setVideoModel] = useState('alibaba/wan-2.6/image-to-video')

  const [createModel, setCreateModel] = useState('z-image/turbo')

  const [showTransform, setShowTransform] = useState(false)
  const [transformSource, setTransformSource] = useState(null)
  const [transformPrompt, setTransformPrompt] = useState('')
  const [transformModel, setTransformModel] = useState('alibaba/wan-2.7-pro/image-edit')
  const [transforming, setTransforming] = useState(false)

  const [showT2V, setShowT2V] = useState(false)
  const [t2vPrompt, setT2vPrompt] = useState('')
  const [t2vDuration, setT2vDuration] = useState(8)
  const [t2vRes, setT2vRes] = useState('720p')
  const [t2vAspect, setT2vAspect] = useState('9:16')
  const [t2vBusy, setT2vBusy] = useState(false)
  const [animating, setAnimating] = useState(false)

  const [showExtend, setShowExtend] = useState(false)
  const [extendSource, setExtendSource] = useState(null)
  const [extendPrompt, setExtendPrompt] = useState('')
  const [extendDuration, setExtendDuration] = useState(5)
  const [extendRes, setExtendRes] = useState('720p')
  const [extending, setExtending] = useState(false)
  const [extendStatus, setExtendStatus] = useState('')
  const [framePreview, setFramePreview] = useState('')
  const [grabbingFrame, setGrabbingFrame] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: msgMedia } = await supabase
      .from('messages')
      .select('*')
      .in('role', ['image', 'video'])
      .order('created_at', { ascending: false })

    const { data: galMedia } = await supabase
      .from('gallery_media')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: folderRows } = await supabase
      .from('gallery_folders')
      .select('*')
      .order('created_at', { ascending: true })
    setFolders(folderRows || [])

    const { data: folderItemRows } = await supabase
      .from('folder_items')
      .select('*')
    const fmap = {}
    for (const fi of folderItemRows || []) fmap[fi.item_key] = fi.folder_id
    setFolderMap(fmap)

    const { data: cardRows } = await supabase
      .from('cards')
      .select('id, name, card_number, image_url, back_image_url, video_url, image_prompt, back_image_prompt, video_prompt, seed, back_seed, created_at')
      .order('created_at', { ascending: false })

    const fromChats = (msgMedia || [])
      .filter(m => m.content && m.content !== 'generating')
      .map(m => ({
        key: 'msg_' + m.id,
        id: m.id,
        source: 'messages',
        type: m.role,
        url: m.content,
        seed: m.seed ?? null,
        prompt: m.prompt ?? null,
        negative_prompt: m.negative_prompt ?? null,
        size: m.size ?? null,
        created_at: m.created_at,
      }))

    const fromGallery = (galMedia || []).map(g => ({
      key: 'gal_' + g.id,
      id: g.id,
      source: 'gallery_media',
      is_favorite: !!g.is_favorite,
      poster_url: g.poster_url ?? null,
      folder_id: g.folder_id ?? null,
      type: g.type,
      url: g.url,
      seed: g.seed ?? null,
      prompt: g.prompt ?? null,
      negative_prompt: g.negative_prompt ?? null,
      size: g.size ?? null,
      created_at: g.created_at,
    }))

    const fromCards = []
    for (const c of cardRows || []) {
      const label = `${c.card_number || ''} ${c.name || ''}`.trim()
      if (c.image_url) {
        fromCards.push({
          key: 'card_front_' + c.id,
          id: c.id,
          source: 'cards',
          cardSide: 'front',
          cardId: c.id,
          cardLabel: label,
          protected: true,
          type: 'image',
          url: c.image_url,
          seed: c.seed ?? null,
          prompt: c.image_prompt ?? null,
          negative_prompt: null,
          size: null,
          created_at: c.created_at,
        })
      }
      if (c.back_image_url) {
        fromCards.push({
          key: 'card_back_' + c.id,
          id: c.id,
          source: 'cards',
          cardSide: 'back',
          cardId: c.id,
          cardLabel: label,
          protected: true,
          type: 'image',
          url: c.back_image_url,
          seed: c.back_seed ?? null,
          prompt: c.back_image_prompt ?? null,
          negative_prompt: null,
          size: null,
          created_at: c.created_at,
        })
      }
      if (c.video_url) {
        fromCards.push({
          key: 'card_video_' + c.id,
          id: c.id,
          source: 'cards',
          cardSide: 'animation',
          cardId: c.id,
          cardLabel: label,
          protected: true,
          type: 'video',
          url: c.video_url,
          seed: null,
          prompt: c.video_prompt ?? null,
          negative_prompt: null,
          size: null,
          created_at: c.created_at,
        })
      }
    }

    setMedia([...fromChats, ...fromGallery, ...fromCards].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))

    const { data: chars } = await supabase.from('characters').select('id, name')
    setCharacters(chars || [])
    setLoading(false)
  }

  const openCreate = () => {
    setPrompt('')
    setNegative(DEFAULT_NEGATIVE)
    setSeed('')
    setSize('768*1024')
    setCharId('')
    setGuidance(3.5)
    setSteps(28)
    setCreateModel('z-image/turbo')
    setShowCreate(true)
  }

  // reopen create modal pre-filled from an existing image
  const openRegenerate = (item, keepSeed) => {
    setPrompt(item.prompt || '')
    setNegative(item.negative_prompt || DEFAULT_NEGATIVE)
    setSeed(keepSeed && item.seed ? String(item.seed) : '')
    setSize(item.size || '768*1024')
    setCharId('')
    setGuidance(3.5)
    setSteps(28)
    setCreateModel('z-image/turbo')
    setSelected(null)
    setShowCreate(true)
  }

  const createImage = async () => {
    if (!prompt.trim() || creating) return
    setCreating(true)
    try {
      const fam = imgFamilyOf(createModel)
      const payload = { model: createModel, prompt }
      if (fam === 'grok') {
        payload.aspectRatio = '2:3'; payload.resolution = '2k'
      } else if (fam === 'seedream') {
        payload.size = '1328*1776'; payload.thinking = 'disabled'
      } else if (fam === 'schnell') {
        payload.size = size; payload.seed = seed || undefined; payload.negativePrompt = negative
      } else {
        payload.size = size; payload.seed = seed || undefined
        payload.negativePrompt = negative; payload.guidance = guidance; payload.steps = steps
      }
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.imageUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setCreating(false)
        return
      }

      await supabase.from('gallery_media').insert([{
        type: 'image',
        url: data.imageUrl,
        prompt,
        negative_prompt: negative,
        seed: data.seed,
        size: data.size,
        character_id: charId || null,
      }])

      setShowCreate(false)
      setPrompt('')
      setSeed('')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setCreating(false)
  }

  const openAnimate = (url) => {
    setVideoSource(url)
    setVideoPrompt('smooth natural motion,')
    setVideoDuration(5)
    setVideoRes('720p')
    setShowVideo(true)
    setSelected(null)
  }

  const animate = async () => {
    if (animating) return
    setAnimating(true)
    setShowVideo(false)
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: videoSource, prompt: videoPrompt, duration: videoDuration, resolution: videoRes, model: videoModel }),
      })
      const data = await res.json()
      if (!data.videoUrl) {
        alert('Video error: ' + (data.error || 'failed'))
        setAnimating(false)
        return
      }
      const poster = await makePoster(data.videoUrl)
      await supabase.from('gallery_media').insert([{
        type: 'video',
        url: data.videoUrl,
        prompt: videoPrompt,
        poster_url: poster,
      }])
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setAnimating(false)
  }

  // is this canvas frame effectively blank?
  const frameIsBlank = (canvas) => {
    try {
      const ctx = canvas.getContext('2d')
      const w = canvas.width
      const h = canvas.height
      if (!w || !h) return true
      // sample a grid of pixels and look at brightness spread
      const data = ctx.getImageData(0, 0, w, h).data
      let min = 255
      let max = 0
      const step = Math.max(4, Math.floor((w * h) / 2000)) * 4
      for (let i = 0; i < data.length; i += step) {
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
        if (lum < min) min = lum
        if (lum > max) max = lum
      }
      // almost no variation means a flat/black/white frame
      return (max - min) < 12
    } catch {
      return false
    }
  }

  const drawToCanvas = (video) => {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  // grab a good final frame, backing off from the end if it's blank
  const captureLastFrame = (url) => new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    let attempts = 0
    // try progressively earlier points if the end frame is empty
    const offsets = [0.15, 0.4, 0.8, 1.4, 2.2]
    let settled = false

    const cleanup = () => {
      video.onseeked = null
      video.onerror = null
      video.onloadeddata = null
    }

    const fail = (msg) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(msg || 'Could not read the video'))
    }

    const trySeek = () => {
      if (attempts >= offsets.length) {
        // give up on finding a non-blank frame, use whatever we last had
        try {
          const canvas = drawToCanvas(video)
          settled = true
          cleanup()
          resolve(canvas.toDataURL('image/jpeg', 0.92))
        } catch (e) {
          fail(e.message)
        }
        return
      }
      const back = offsets[attempts]
      attempts++
      const target = Math.max(0, (video.duration || 0) - back)
      video.currentTime = target
    }

    video.onseeked = () => {
      if (settled) return
      // give the decoder a moment to actually paint the frame
      setTimeout(() => {
        if (settled) return
        try {
          const canvas = drawToCanvas(video)
          if (frameIsBlank(canvas) && attempts < offsets.length) {
            trySeek()
            return
          }
          settled = true
          cleanup()
          resolve(canvas.toDataURL('image/jpeg', 0.92))
        } catch (e) {
          fail(e.message)
        }
      }, 120)
    }

    video.onerror = () => fail('Could not load the video')

    // wait for real data, not just metadata
    video.onloadeddata = () => {
      if (!video.duration || !isFinite(video.duration)) {
        fail('Video has no readable duration')
        return
      }
      trySeek()
    }

    video.src = url
    video.load()
  })

  const grabPreview = async (url) => {
    setGrabbingFrame(true)
    setFramePreview('')
    try {
      const dataUrl = await captureLastFrame(url)
      setFramePreview(dataUrl)
    } catch (err) {
      alert('Could not read the last frame: ' + err.message)
    }
    setGrabbingFrame(false)
  }

  const openExtend = (item) => {
    setExtendSource(item)
    setExtendPrompt('')
    setExtendDuration(5)
    setExtendRes('720p')
    setExtendStatus('')
    setFramePreview('')
    setShowExtend(true)
    setSelected(null)
    grabPreview(item.url)
  }

  const runExtend = async () => {
    if (!extendSource || extending) return
    if (!extendPrompt.trim()) {
      alert('Describe what should happen next')
      return
    }

    setShowExtend(false)
    setExtending(true)

    try {
      const dataUrl = framePreview || await captureLastFrame(extendSource.url)

      setExtendStatus('Saving the frame...')
      const frameRes = await fetch('/api/extract-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      })
      const frameData = await frameRes.json()
      if (!frameData.imageUrl) {
        alert('Frame error: ' + (frameData.error || 'failed'))
        setExtending(false); setExtendStatus('')
        return
      }

      setExtendStatus('Generating the continuation (1-2 min)...')
      const vidRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: frameData.imageUrl,
          prompt: extendPrompt,
          duration: extendDuration,
          resolution: extendRes,
        }),
      })
      const vidData = await vidRes.json()

      // the frame was only a stepping stone
      if (frameData.fileName) {
        await supabase.storage.from('character-images').remove([frameData.fileName])
      }

      if (!vidData.videoUrl) {
        const detail = vidData.atlasResponse ? '\n\n' + JSON.stringify(vidData.atlasResponse).slice(0, 300) : ''
        const sent = vidData.sentBody ? '\n\nSent: ' + JSON.stringify(vidData.sentBody).slice(0, 300) : ''
        alert('Video error: ' + (vidData.error || 'failed') + detail + sent)
        setExtending(false); setExtendStatus('')
        return
      }

      const poster = await makePoster(vidData.videoUrl)
      await supabase.from('gallery_media').insert([{
        type: 'video',
        url: vidData.videoUrl,
        prompt: extendPrompt,
        poster_url: poster,
      }])

      setExtendStatus('')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setExtending(false)
    setExtendStatus('')
  }

  const toggleFavorite = async (item) => {
    if (item.source !== 'gallery_media') return
    const next = !item.is_favorite

    // update on screen straight away
    setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, is_favorite: next } : m)))
    setSelected(prev => (prev && prev.key === item.key ? { ...prev, is_favorite: next } : prev))

    const { error } = await supabase
      .from('gallery_media')
      .update({ is_favorite: next })
      .eq('id', item.id)

    if (error) {
      alert('Could not update: ' + error.message)
      // put it back
      setMedia(prev => prev.map(m => (m.key === item.key ? { ...m, is_favorite: !next } : m)))
      setSelected(prev => (prev && prev.key === item.key ? { ...prev, is_favorite: !next } : prev))
    }
  }

  // clear the copied indicator whenever the detail selection changes
  // (kept simple: reset on close/open via the button timeout is enough)

  const openTransform = (item) => {
    setTransformSource(item)
    setTransformPrompt('')
    setTransformModel('alibaba/wan-2.7-pro/image-edit')
    setSelected(null)
    setShowTransform(true)
  }

  const runTransform = async () => {
    if (transforming) return
    if (!transformPrompt.trim()) { alert('Describe the change you want'); return }
    setShowTransform(false)
    setTransforming(true)
    try {
      // always pass the chosen edit model explicitly, whichever it is
      const payload = {
        prompt: transformPrompt,
        referenceImageUrl: transformSource.url,
        model: transformModel,
      }
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.imageUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setTransforming(false)
        return
      }
      await supabase.from('gallery_media').insert([{
        type: 'image',
        url: data.imageUrl,
        prompt: transformPrompt,
      }])
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setTransforming(false)
  }

  const runT2V = async () => {
    if (t2vBusy) return
    if (!t2vPrompt.trim()) { alert('Describe the video you want'); return }
    setShowT2V(false)
    setT2vBusy(true)
    setAnimating(true)
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: T2V_MODEL,
          prompt: t2vPrompt,
          duration: t2vDuration,
          resolution: t2vRes,
          aspectRatio: t2vAspect,
        }),
      })
      const data = await res.json()
      if (!data.videoUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setT2vBusy(false); setAnimating(false)
        return
      }
      const poster = await makePoster(data.videoUrl)
      await supabase.from('gallery_media').insert([{
        type: 'video',
        url: data.videoUrl,
        prompt: t2vPrompt,
        poster_url: poster,
      }])
      setT2vPrompt('')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setT2vBusy(false)
    setAnimating(false)
  }

  const createFolder = () => setFolderModal({ mode: 'create', name: '' })
  const renameFolder = (folder) => setFolderModal({ mode: 'rename', id: folder.id, name: folder.name })

  const saveFolderModal = async () => {
    const name = (folderModal?.name || '').trim()
    if (!name) { alert('Enter a folder name'); return }

    if (folderModal.mode === 'create') {
      const { data, error } = await supabase
        .from('gallery_folders')
        .insert([{ name }])
        .select()
        .single()
      if (error) { alert('Could not create folder: ' + error.message); return }
      setFolders(prev => [...prev, data])
      setActiveFolder(data.id)
    } else {
      const { error } = await supabase
        .from('gallery_folders')
        .update({ name })
        .eq('id', folderModal.id)
      if (error) { alert('Could not rename: ' + error.message); return }
      setFolders(prev => prev.map(f => (f.id === folderModal.id ? { ...f, name } : f)))
    }
    setFolderModal(null)
  }

  const deleteFolder = async (folder) => {
    if (!confirm(`Delete folder "${folder.name}"? The images inside stay, they just become unfiled.`)) return
    const { error } = await supabase.from('gallery_folders').delete().eq('id', folder.id)
    if (error) { alert('Could not delete: ' + error.message); return }
    setFolders(prev => prev.filter(f => f.id !== folder.id))
    setFolderMap(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next)) if (next[k] === folder.id) delete next[k]
      return next
    })
    if (activeFolder === folder.id) setActiveFolder('all')
  }

  const assignFolder = async (item, folderId) => {
    // update the local map immediately
    setFolderMap(prev => {
      const next = { ...prev }
      if (folderId) next[item.key] = folderId
      else delete next[item.key]
      return next
    })

    if (!folderId) {
      const { error } = await supabase
        .from('folder_items')
        .delete()
        .eq('source', item.source)
        .eq('item_key', item.key)
      if (error) alert('Could not unfile: ' + error.message)
      return
    }

    const { error } = await supabase
      .from('folder_items')
      .upsert({ source: item.source, item_key: item.key, folder_id: folderId }, { onConflict: 'source,item_key' })
    if (error) alert('Could not move: ' + error.message)
  }

  const fileNameFrom = (url) => {
    if (!url) return null
    const part = String(url).split('/character-images/')[1]
    if (!part) return null
    // strip any query string
    return part.split('?')[0]
  }

  const remove = async (item) => {
    if (item.source === 'cards') {
      alert('This is card art. Delete or replace it from the Cards page.')
      return
    }
    if (!confirm('Delete this permanently?')) return

    try {
      const res = await fetch('/api/delete-gallery-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: item.source,
          id: item.id,
          itemKey: item.key,
          url: item.url,
          posterUrl: item.poster_url || null,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        alert('Delete failed: ' + (data.error || 'unknown error'))
        return
      }
    } catch (err) {
      alert('Delete failed: ' + err.message)
      return
    }

    setSelected(null)
    load()
  }

  const [copiedUrl, setCopiedUrl] = useState(false)
  const copy = (val) => navigator.clipboard?.writeText(String(val))
  const downloadItem = async (item) => {
    try {
      const res = await fetch(item.url)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      // build a friendly filename
      const isVideo = item.type === 'video'
      const stamp = new Date(item.created_at || Date.now()).toISOString().slice(0, 10)
      const base = (item.prompt ? item.prompt.slice(0, 30).replace(/[^a-z0-9]+/gi, '_') : item.type) || 'media'
      const ext = isVideo ? 'mp4' : (item.url.toLowerCase().includes('.png') ? 'png' : 'jpeg')
      downloadCounter.current += 1
      const seq = String(downloadCounter.current).padStart(3, '0')
      a.href = objUrl
      a.download = `${base}_${stamp}_${seq}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch (err) {
      alert('Download failed: ' + err.message)
    }
  }

  const copyUrl = (val) => {
    navigator.clipboard?.writeText(String(val))
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 1500)
  }

  const shown = (() => {
    let list = media.filter(m => {
      if (filter === 'cards') return m.source === 'cards'
      // card media only appears under the Cards tab
      if (m.source === 'cards') return false
      if (filter === 'images') return m.type === 'image'
      if (filter === 'videos') return m.type === 'video'
      return true
    })

    if (favOnly) {
      list = list.filter(m => m.is_favorite)
    }

    if (activeFolder !== 'all') {
      if (activeFolder === 'unfiled') {
        list = list.filter(m => !folderMap[m.key])
      } else {
        list = list.filter(m => folderMap[m.key] === activeFolder)
      }
    }

    const q = gSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(m => {
        const hay = [m.prompt, m.negative_prompt, m.type, m.cardLabel].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
    }

    const byDate = (a, b) => new Date(a.created_at) - new Date(b.created_at)
    if (gSort === 'date_asc') list.sort(byDate)
    else list.sort((a, b) => byDate(b, a))

    return list
  })()

  const tab = (key, label) => (
    <button onClick={() => setFilter(key)}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold ${filter === key ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Gallery</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowT2V(true)} className="bg-gray-800 hover:bg-gray-700 rounded-full px-3 py-2 text-sm font-semibold" title="Video from text">
            🎬 Text
          </button>
          <button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold">
            + Create
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {tab('all', 'All')}
        {tab('images', 'Images')}
        {tab('videos', 'Videos')}
        {tab('cards', 'Cards')}
      </div>

      <input
        value={gSearch}
        onChange={e => setGSearch(e.target.value)}
        placeholder="Search by prompt..."
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500"
      />

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[['date_desc', 'Newest'], ['date_asc', 'Oldest']].map(([val, label]) => (
          <button key={val} onClick={() => setGSort(val)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${gSort === val ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
            {label}
          </button>
        ))}
        <button onClick={() => setFavOnly(!favOnly)}
          className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${favOnly ? 'bg-amber-500 text-black' : 'bg-gray-900 text-gray-400'}`}>
          ★ Favorites
        </button>
      </div>

      {(
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 items-center">
          {[['all', 'All'], ['unfiled', 'Unfiled']].map(([val, label]) => (
            <button key={val} onClick={() => setActiveFolder(val)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${activeFolder === val ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
              {label}
            </button>
          ))}
          {folders.map(f => (
            <button key={f.id}
              onClick={() => setActiveFolder(f.id)}
              onDoubleClick={() => renameFolder(f)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${activeFolder === f.id ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
              📁 {f.name}
            </button>
          ))}
          <button onClick={createFolder}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-900 text-blue-400 border border-blue-900">
            ＋ Folder
          </button>
          {activeFolder !== 'all' && activeFolder !== 'unfiled' && (
            <button onClick={() => { const f = folders.find(x => x.id === activeFolder); if (f) deleteFolder(f) }}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-red-950 text-red-300">
              🗑 Delete
            </button>
          )}
        </div>
      )}

      {animating && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 text-sm text-gray-400">
          Animating... (1-2 min)
        </div>
      )}

      {transforming && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 text-sm text-gray-400">
          Transforming image... (1-2 min)
        </div>
      )}

      {extending && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 text-sm text-gray-400">
          {extendStatus || 'Extending...'}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="text-gray-500 text-sm">Nothing here yet. Tap "+ Create" to make something.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map(item => (
            <button key={item.key} onClick={() => setSelected(item)}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-900">
              {item.type === 'image' ? (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <>
                  {item.poster_url ? (
                    <img src={item.poster_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <span className="text-3xl text-gray-600">▶</span>
                    </div>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 bg-black/70 rounded-full px-2 py-0.5 text-[10px]">▶ video</span>
                </>
              )}
              {item.source === 'cards' && (
                <span className="absolute top-1.5 left-1.5 bg-black/75 rounded-full px-2 py-0.5 text-[9px] tracking-wide">
                  🃏 {item.cardSide}
                </span>
              )}
              {item.is_favorite && (
                <span className="absolute top-1.5 right-1.5 text-amber-400 text-sm drop-shadow">★</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* CREATE / REGENERATE */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">Create Image</h2>

            <label className="block text-xs text-gray-400 mb-1">Model</label>
            <select value={createModel} onChange={e => setCreateModel(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            <label className="block text-xs text-gray-400 mb-1">Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
              placeholder="describe the image..."
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            {(imgFamilyOf(createModel) === 'flux' || imgFamilyOf(createModel) === 'schnell') && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Negative Prompt</label>
                <textarea value={negative} onChange={e => setNegative(e.target.value)} rows={3}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />
              </>
            )}

            <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
            <select value={size} onChange={e => setSize(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            {(imgFamilyOf(createModel) === 'flux' || imgFamilyOf(createModel) === 'schnell') && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
                <input value={seed} onChange={e => setSeed(e.target.value)} placeholder="leave blank for random"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />
              </>
            )}

            {imgFamilyOf(createModel) === 'flux' && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Guidance: {guidance}</label>
                <input type="range" min="1" max="10" step="0.5" value={guidance}
                  onChange={e => setGuidance(parseFloat(e.target.value))}
                  className="w-full mb-1 accent-purple-500" />
                <p className="text-[10px] text-gray-600 mb-3">Low (2-4) = softer, more natural. High (6+) = rigid, can look over-cooked. Flux likes 3-4.</p>
              </>
            )}

            {imgFamilyOf(createModel) === 'flux' && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Steps: {steps}</label>
                <input type="range" min="10" max="50" step="1" value={steps}
                  onChange={e => setSteps(parseInt(e.target.value))}
                  className="w-full mb-1 accent-purple-500" />
                <p className="text-[10px] text-gray-600 mb-3">More steps = more detail, slower. 28 is a good default.</p>
              </>
            )}

            <label className="block text-xs text-gray-400 mb-1">Tag to Character (optional)</label>
            <select value={charId} onChange={e => setCharId(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="">None</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={createImage} disabled={creating} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                {creating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANIMATE */}
      {showVideo && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-2">Animate Image</h2>
            <p className="text-xs text-gray-500 mb-3">Takes 1-2 min and costs more than an image.</p>
            <img src={videoSource} alt="" className="w-28 rounded-lg mb-3" />
            <label className="block text-xs text-gray-400 mb-1">Motion Prompt</label>
            <textarea value={videoPrompt} onChange={e => setVideoPrompt(e.target.value)} rows={3}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Video Model</label>
            <select value={videoModel} onChange={e => setVideoModel(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {VIDEO_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            <label className="block text-xs text-gray-400 mb-1">Length</label>
            <select value={videoDuration} onChange={e => setVideoDuration(parseInt(e.target.value))}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
              <option value={10}>10 seconds (2x cost)</option>
              <option value={15}>15 seconds (3x cost)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={videoRes} onChange={e => setVideoRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="720p">720p</option>
              <option value="1080p">1080p (costs more)</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowVideo(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={animate} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Animate</button>
            </div>
          </div>
        </div>
      )}

      {/* FOLDER NAME */}
      {folderModal && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-[70]">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="font-bold text-lg mb-3">{folderModal.mode === 'create' ? 'New Folder' : 'Rename Folder'}</h2>
            <input
              autoFocus
              value={folderModal.name}
              onChange={e => setFolderModal({ ...folderModal, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') saveFolderModal() }}
              placeholder="Folder name"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <button onClick={() => setFolderModal(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={saveFolderModal} className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-3 font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSFORM (image-to-image) */}
      {showTransform && transformSource && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-[60] overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-2">Transform Image</h2>
            <p className="text-xs text-gray-500 mb-3">
              Feeds this image into an edit model and changes it by your instruction, keeping the
              subject and composition. Good for tweaks and for keeping a face consistent. Saves as a new image.
            </p>

            <img src={transformSource.url} alt="" className="w-32 rounded-lg mb-3 border border-gray-700" />

            <label className="block text-xs text-gray-400 mb-1">Edit Model</label>
            <select value={transformModel} onChange={e => setTransformModel(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {I2I_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            <label className="block text-xs text-gray-400 mb-1">What should change?</label>
            <textarea value={transformPrompt} onChange={e => setTransformPrompt(e.target.value)} rows={4}
              placeholder="e.g. change the background to a sunlit beach; keep the person exactly the same"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500" />

            <div className="flex gap-2">
              <button onClick={() => setShowTransform(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={runTransform} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Transform</button>
            </div>
          </div>
        </div>
      )}

      {/* TEXT TO VIDEO */}
      {showT2V && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-[60]">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-2">Video from Text</h2>
            <p className="text-xs text-gray-500 mb-3">
              Generates a video from a description alone, no starting image. Uses Grok Imagine. 1-3 min.
            </p>

            <label className="block text-xs text-gray-400 mb-1">Describe the video</label>
            <textarea value={t2vPrompt} onChange={e => setT2vPrompt(e.target.value)} rows={4}
              placeholder="e.g. a woman walking along a rainy neon-lit street at night, cinematic, slow motion"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
            <select value={t2vAspect} onChange={e => setT2vAspect(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value="9:16">9:16 (portrait)</option>
              <option value="16:9">16:9 (landscape)</option>
              <option value="1:1">1:1 (square)</option>
              <option value="3:4">3:4</option>
              <option value="4:3">4:3</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Length</label>
            <select value={t2vDuration} onChange={e => setT2vDuration(parseInt(e.target.value))}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={t2vRes} onChange={e => setT2vRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="480p">480p</option>
              <option value="720p">720p</option>
            </select>
            <p className="text-[10px] text-gray-600 -mt-3 mb-4">Grok text-to-video maxes at 720p.</p>

            <div className="flex gap-2">
              <button onClick={() => setShowT2V(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={runT2V} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Generate</button>
            </div>
          </div>
        </div>
      )}

      {/* EXTEND */}
      {showExtend && extendSource && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-[60]">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-2">Extend Video</h2>
            <p className="text-xs text-gray-500 mb-3">
              Takes the last frame of this clip and generates what happens next, as a new video.
              The original is kept unchanged. The two clips stay separate files.
            </p>

            <div className="mb-3">
              <p className="text-[10px] text-gray-500 mb-1">Continuing from this frame:</p>
              {grabbingFrame ? (
                <div className="w-32 h-24 bg-black border border-gray-700 rounded-lg flex items-center justify-center text-[10px] text-gray-500">
                  reading frame...
                </div>
              ) : framePreview ? (
                <img src={framePreview} alt="last frame" className="w-32 rounded-lg border border-gray-700" />
              ) : (
                <div className="w-32 h-24 bg-black border border-gray-700 rounded-lg flex items-center justify-center text-[10px] text-gray-600">
                  no frame
                </div>
              )}
              <button
                onClick={() => grabPreview(extendSource.url)}
                className="text-[10px] text-gray-500 hover:text-gray-300 mt-1"
              >
                re-read frame
              </button>
            </div>

            <label className="block text-xs text-gray-400 mb-1">What happens next?</label>
            <textarea value={extendPrompt} onChange={e => setExtendPrompt(e.target.value)} rows={3}
              placeholder="e.g. she turns toward the window and smiles"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Length</label>
            <select value={extendDuration} onChange={e => setExtendDuration(parseInt(e.target.value))}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
              <option value={10}>10 seconds (2x cost)</option>
              <option value={15}>15 seconds (3x cost)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={extendRes} onChange={e => setExtendRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="720p">720p</option>
              <option value="1080p">1080p (costs more)</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowExtend(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={runExtend} disabled={!framePreview || grabbingFrame}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                Extend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL */}
      {selected && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-5 z-50 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
            {selected.type === 'image' ? (
              <img src={selected.url} alt="" className="w-full rounded-2xl" />
            ) : (
              <video src={selected.url} controls loop preload="none" playsInline poster={selected.poster_url || undefined} className="w-full rounded-2xl" />
            )}

            {selected.source === 'gallery_media' && (
              <button onClick={() => toggleFavorite(selected)}
                className={`w-full rounded-lg py-2 text-sm font-semibold mt-3 ${selected.is_favorite ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-gray-800 hover:bg-gray-700'}`}>
                {selected.is_favorite ? '★ Favorited' : '☆ Add to favorites'}
              </button>
            )}

            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Folder</label>
              <select
                value={folderMap[selected.key] || ''}
                onChange={e => assignFolder(selected, e.target.value || null)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500">
                <option value="">Unfiled</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>

            <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Seed</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-300">{selected.seed ?? '—'}</span>
                  {selected.seed && <button onClick={() => copy(selected.seed)} className="text-gray-500 hover:text-white">Copy</button>}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Created</span>
                <span className="text-gray-400">{new Date(selected.created_at).toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-500">URL</span>
                  <button
                    onClick={() => copyUrl(selected.url)}
                    className="text-purple-400 hover:text-purple-300 font-semibold"
                  >
                    {copiedUrl ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 font-mono break-all leading-snug">{selected.url}</p>
                <button onClick={() => downloadItem(selected)}
                  className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-3">
                  ⬇ Download {selected.type === 'video' ? 'video' : 'image'}
                </button>
              </div>
              {selected.source === 'cards' && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">From card</span>
                  <span className="text-gray-300">{selected.cardLabel} ({selected.cardSide})</span>
                </div>
              )}
              {selected.prompt && (
                <div className="pt-1 border-t border-gray-800">
                  <p className="text-gray-500 mb-1">Prompt</p>
                  <p className="text-gray-400 leading-snug">{selected.prompt}</p>
                </div>
              )}
            </div>

            {selected.type === 'image' && selected.prompt && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => openRegenerate(selected, true)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs font-semibold">
                  Rerun same seed
                </button>
                <button onClick={() => openRegenerate(selected, false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs font-semibold">
                  Rerun new seed
                </button>
              </div>
            )}

            {selected.type === 'image' && (
              <button onClick={() => openAnimate(selected.url)}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
                🎬 Animate
              </button>
            )}

            {selected.type === 'image' && (
              <button onClick={() => openTransform(selected)}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
                ✎ Transform (edit this image)
              </button>
            )}

            {selected.type === 'video' && (
              <button onClick={() => openExtend(selected)} disabled={extending}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2">
                ⏭ Extend from last frame
              </button>
            )}

            {selected.source === 'cards' ? (
              <p className="text-[11px] text-gray-500 text-center mt-3 mb-1">
                This belongs to a card. Delete or replace it from the Cards page.
              </p>
            ) : (
              <button onClick={() => remove(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-2">Delete</button>
            )}
            <button onClick={() => setSelected(null)} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
