// pages/gallery.js
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Script from 'next/script'
import { supabase } from '../lib/supabaseClient'
import { makePoster } from '../lib/posterFrame'

// prices are only shown where Atlas's docs confirmed a figure.
// null means the price wasn't listed in the schema we have, so we say so
// rather than guess.
const VIDEO_MODELS = [
  { id: 'alibaba/wan-2.6/image-to-video', label: 'Wan 2.6 (5-15s) 🔊', price: null },
  { id: 'atlascloud/wan-2.2-turbo/image-to-video', label: 'Wan 2.2 Turbo (fast, 5s)', price: null },
  { id: 'xai/grok-imagine-video-v1.5/image-to-video', label: 'Grok Imagine (up to 1080p) 🔊', price: null },
  { id: 'alibaba/wan-2.7/image-to-video', label: 'Wan 2.7 (start/end/continue) 🔊', price: null },
  { id: 'alibaba/wan-2.2-spicy/image-to-video-lora', label: 'Wan 2.2 Spicy (LoRA support)', price: null },
  { id: 'atlascloud/wan-2.2-turbo-spicy/image-to-video', label: 'Wan 2.2 Spicy', price: null },
  { id: 'atlascloud/wan-2.7-spicy/image-to-video', label: 'Wan 2.7 Spicy 🔊', price: null },
  { id: 'bytedance/seedance-v1.5-pro/image-to-video-spicy', label: 'Seedance Spicy I2V 🔊', price: null },
]

// text-to-video options
const T2V_MODELS = [
  { id: 'xai/grok-imagine-video/text-to-video', label: 'Grok Imagine', price: null },
  { id: 'kwaivgi/kling-v3.0-pro/text-to-video', label: 'Kling V3.0 Pro (sound, 3-15s)', price: null },
  { id: 'kwaivgi/kling-video-o3-pro/text-to-video', label: 'Kling O3 Pro (sound, 3-15s)', price: null },
]
const T2V_MODEL = T2V_MODELS[0].id
const T2V_PRICE = null

// video-edit (existing video in, edited video out)
const VIDEO_EDIT_MODEL = 'kwaivgi/kling-video-o3-pro/video-edit'

const IMAGE_MODELS = [
  { id: 'z-image/turbo', label: 'Z-Image Turbo', family: 'flux', price: null },
  { id: 'black-forest-labs/flux-dev', label: 'Flux Dev', family: 'flux', price: null },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell (fast)', family: 'schnell', price: null },
  { id: 'bytedance/seedream-v5.0-pro/text-to-image', label: 'Seedream 5 Pro (hi-res)', family: 'seedream', price: null },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine', family: 'grok', price: { '1k': 0.05, '2k': 0.07 } },
]
const imgFamilyOf = (id) => (IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0]).family

// image-to-image (transform) models
const I2I_MODELS = [
  { id: 'alibaba/wan-2.7-pro/image-edit', label: 'Wan 2.7 Pro (edit)', price: null },
  { id: 'bytedance/seedream-v5.0-pro/edit', label: 'Seedream 5 Pro (edit)', price: null },
  { id: 'xai/grok-imagine-image-quality/edit', label: 'Grok Imagine (edit)', price: 0.01 },
]

// small helper to render a price, or an honest "not listed" note
const priceLabel = (model, resolution) => {
  if (!model || model.price == null) return 'price not listed'
  if (typeof model.price === 'number') return `~$${model.price.toFixed(2)}/image`
  const p = model.price[resolution] ?? Object.values(model.price)[0]
  return `~$${p.toFixed(2)}/image`
}

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
  const [savingFolder, setSavingFolder] = useState(false)
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
  const [videoPrompt, setVideoPrompt] = useState('smooth natural motion, eyes blinking naturally')
  const [videoDuration, setVideoDuration] = useState(5)
  const [videoRes, setVideoRes] = useState('720p')
  const [videoModel, setVideoModel] = useState('alibaba/wan-2.6/image-to-video')
  const [highNoiseLoras, setHighNoiseLoras] = useState('')
  const [lowNoiseLoras, setLowNoiseLoras] = useState('')

  const [createModel, setCreateModel] = useState('z-image/turbo')

  const [showTransform, setShowTransform] = useState(false)
  const [transformSource, setTransformSource] = useState(null)
  const [transformPrompt, setTransformPrompt] = useState('')
  const [transformModel, setTransformModel] = useState('bytedance/seedream-v5.0-pro/edit')
  const [transforming, setTransforming] = useState(false)

  const [show3D, setShow3D] = useState(false)
  const [prompt3D, setPrompt3D] = useState('')
  const [enablePbr, setEnablePbr] = useState(false)
  const [enableGeometry, setEnableGeometry] = useState(false)
  const [busy3D, setBusy3D] = useState(false)
  const [provider3D, setProvider3D] = useState('hunyuan')
  const [imgProvider3D, setImgProvider3D] = useState('hunyuan')
  const [show3DFromImage, setShow3DFromImage] = useState(null)  // holds the source item, or null

  const [showT2V, setShowT2V] = useState(false)
  const [t2vModel, setT2vModel] = useState(T2V_MODEL)
  const [t2vPrompt, setT2vPrompt] = useState('')
  const [t2vDuration, setT2vDuration] = useState(8)
  const [t2vRes, setT2vRes] = useState('720p')
  const [t2vAspect, setT2vAspect] = useState('9:16')
  const [t2vSound, setT2vSound] = useState(true)
  const [t2vBusy, setT2vBusy] = useState(false)

  const [showVideoEdit, setShowVideoEdit] = useState(false)
  const [videoEditSource, setVideoEditSource] = useState(null)
  const [videoEditPrompt, setVideoEditPrompt] = useState('')
  const [videoEditKeepSound, setVideoEditKeepSound] = useState(true)
  const [videoEditing, setVideoEditing] = useState(false)
  const [animating, setAnimating] = useState(false)

  const [showExtend, setShowExtend] = useState(false)
  const [extendSource, setExtendSource] = useState(null)
  const [extendPrompt, setExtendPrompt] = useState('')
  const [extendDuration, setExtendDuration] = useState(5)
  const [extendRes, setExtendRes] = useState('720p')
  const [extendModel, setExtendModel] = useState('alibaba/wan-2.6/image-to-video')
  const [extendHighNoiseLoras, setExtendHighNoiseLoras] = useState('')
  const [extendLowNoiseLoras, setExtendLowNoiseLoras] = useState('')
  const [extending, setExtending] = useState(false)
  const [extendStatus, setExtendStatus] = useState('')
  const [framePreview, setFramePreview] = useState('')
  const [grabbingFrame, setGrabbingFrame] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkStatus, setBulkStatus] = useState('')
  const [showMiscModal, setShowMiscModal] = useState(false)
  const [miscSets, setMiscSets] = useState([])
  const [miscMode, setMiscMode] = useState('standalone') // standalone | existing | new
  const [miscSetId, setMiscSetId] = useState('')
  const [miscSetName, setMiscSetName] = useState('')
  const [miscPrefix, setMiscPrefix] = useState('')
  const [miscBusy, setMiscBusy] = useState(false)


  useEffect(() => { load() }, [])

  // saves a completed generation to gallery_media with retry.
  // Atlas already uploaded the file; this only writes the DB row so it appears in Gallery.
  const saveWithRetry = async (row, label) => {
    // drop undefined/null optional fields that can trip strict schemas
    const clean = {}
    for (const [k, v] of Object.entries(row || {})) {
      if (v !== undefined && v !== null && v !== '') clean[k] = v
    }
    if (row?.url) clean.url = row.url
    if (row?.type) clean.type = row.type

    let lastErr = null
    for (let i = 0; i < 3; i++) {
      const { data, error } = await supabase
        .from('gallery_media')
        .insert([clean])
        .select()
        .single()
      if (!error && data) {
        // optimistically prepend so UI updates even before full reload
        setMedia(prev => {
          const entry = {
            ...data,
            source: 'gallery_media',
            created_at: data.created_at || new Date().toISOString(),
          }
          return [entry, ...(prev || []).filter(x => x.url !== data.url)]
        })
        return data
      }
      lastErr = error
      console.error('gallery_media insert attempt', i + 1, error)
      await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }

    const detail = lastErr?.message || lastErr?.code || 'unknown error'
    alert(
      `${label} was created in storage, but the gallery row failed to save.\n\n` +
      `Error: ${detail}\n\n` +
      `Direct link (not lost):\n${row.url}\n\n` +
      `Use Settings → Import Orphaned Media, or fix RLS on gallery_media.`
    )
    return null
  }

  // generic pager for any table read that could exceed Supabase's 1000-row cap
  const fetchAllRows = async (table, selectCols, applyFilters) => {
    let rows = []
    let offset = 0
    while (true) {
      let q = supabase.from(table).select(selectCols)
      if (applyFilters) q = applyFilters(q)
      const { data: page, error } = await q.range(offset, offset + 999)
      if (error || !page || page.length === 0) break
      rows = rows.concat(page)
      if (page.length < 1000) break
      offset += 1000
    }
    return rows
  }

  const load = async () => {
    const msgMedia = await fetchAllRows(
      'messages', '*',
      q => q.in('role', ['image', 'video']).order('created_at', { ascending: false })
    )

    const galMedia = await fetchAllRows(
      'gallery_media', '*',
      q => q.order('created_at', { ascending: false })
    )

    const { data: folderRows } = await supabase
      .from('gallery_folders')
      .select('*')
      .order('created_at', { ascending: true })
    setFolders(folderRows || [])

    // paginate: a plain select() caps at 1000 rows, and this table can
    // grow well past that as more items get filed
    let folderItemRows = []
    let fiOffset = 0
    while (true) {
      const { data: page, error } = await supabase
        .from('folder_items')
        .select('*')
        .range(fiOffset, fiOffset + 999)
      if (error || !page || page.length === 0) break
      folderItemRows = folderItemRows.concat(page)
      if (page.length < 1000) break
      fiOffset += 1000
    }
    const fmap = {}
    for (const fi of folderItemRows) fmap[fi.item_key] = fi.folder_id
    setFolderMap(fmap)

    const cardRows = await fetchAllRows(
      'cards',
      'id, name, card_number, image_url, back_image_url, video_url, image_prompt, back_image_prompt, video_prompt, seed, back_seed, created_at, published, poster_url',
      q => q.order('created_at', { ascending: false })
    )

    const { data: mSets } = await supabase.from('misc_sets').select('*').order('name')
    setMiscSets(mSets || [])

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
      thumbnail_url: g.thumbnail_url ?? null,
      source_prompt: g.source_prompt ?? null,
      folder_id: g.folder_id ?? null,
      type: g.type,
      url: g.url,
      seed: g.seed ?? null,
      prompt: g.prompt ?? null,
      negative_prompt: g.negative_prompt ?? null,
      size: g.size ?? null,
      model: g.model ?? null,
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
          published: !!c.published,
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
          published: !!c.published,
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
          published: !!c.published,
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

      await saveWithRetry({
        type: 'image',
        url: data.imageUrl,
        prompt,
        negative_prompt: negative,
        seed: data.seed,
        size: data.size,
        character_id: charId || null,
        model: createModel,
      }, 'Your image')

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
    setVideoPrompt('smooth natural motion, eyes blinking naturally')
    setVideoDuration(5)
    setVideoRes('720p')
    setShowVideo(true)
    setSelected(null)
  }

  const parseLoras = (text) =>
    String(text || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 3)

  const animate = async () => {
    if (animating) return
    setAnimating(true)
    setShowVideo(false)
    try {
      const payload = { imageUrl: videoSource, prompt: videoPrompt, duration: videoDuration, resolution: videoRes, model: videoModel }
      if (videoModel === 'alibaba/wan-2.2-spicy/image-to-video-lora') {
        const high = parseLoras(highNoiseLoras)
        const low = parseLoras(lowNoiseLoras)
        if (high.length) payload.highNoiseLoras = high
        if (low.length) payload.lowNoiseLoras = low
      }
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.videoUrl) {
        alert('Video error: ' + (data.error || 'failed'))
        setAnimating(false)
        return
      }
      const poster = await makePoster(data.videoUrl)
      await saveWithRetry({
        type: 'video',
        url: data.videoUrl,
        prompt: videoPrompt,
        poster_url: poster,
        model: videoModel,
      }, 'Your video')
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

  const openVideoEdit = (item) => {
    setVideoEditSource(item)
    setVideoEditPrompt('')
    setVideoEditKeepSound(true)
    setSelected(null)
    setShowVideoEdit(true)
  }

  const runVideoEdit = async () => {
    if (!videoEditSource || videoEditing) return
    if (!videoEditPrompt.trim()) { alert('Describe the change you want'); return }
    setShowVideoEdit(false)
    setVideoEditing(true)
    setAnimating(true)
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: VIDEO_EDIT_MODEL,
          prompt: videoEditPrompt,
          sourceVideoUrl: videoEditSource.url,
          keepOriginalSound: videoEditKeepSound,
        }),
      })
      const data = await res.json()
      if (!data.videoUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setVideoEditing(false); setAnimating(false)
        return
      }
      const poster = await makePoster(data.videoUrl)
      await saveWithRetry({
        type: 'video',
        url: data.videoUrl,
        prompt: videoEditPrompt,
        poster_url: poster,
        source_prompt: videoEditSource.prompt || null,
        model: VIDEO_EDIT_MODEL,
      }, 'Your edited video')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setVideoEditing(false)
    setAnimating(false)
  }

  const openExtend = (item) => {
    setExtendModel('alibaba/wan-2.6/image-to-video')
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

    const isWan27Extend = extendModel === 'alibaba/wan-2.7/image-to-video'

    try {
      let vidData

      if (isWan27Extend) {
        // Wan 2.7 can continue a video natively -- no need for the fragile
        // client-side last-frame capture this feature otherwise relies on
        setExtendStatus('Continuing the video (1-2 min)...')
        const vidRes = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceVideoUrl: extendSource.url,
            prompt: extendPrompt,
            duration: extendDuration,
            resolution: extendRes,
            model: extendModel,
            ...(extendModel === 'alibaba/wan-2.2-spicy/image-to-video-lora' ? {
              highNoiseLoras: parseLoras(extendHighNoiseLoras),
              lowNoiseLoras: parseLoras(extendLowNoiseLoras),
            } : {}),
          }),
        })
        vidData = await vidRes.json()
      } else {
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
            model: extendModel,
            ...(extendModel === 'alibaba/wan-2.2-spicy/image-to-video-lora' ? {
              highNoiseLoras: parseLoras(extendHighNoiseLoras),
              lowNoiseLoras: parseLoras(extendLowNoiseLoras),
            } : {}),
          }),
        })
        vidData = await vidRes.json()

        // the frame was only a stepping stone
        if (frameData.fileName) {
          await supabase.storage.from('character-images').remove([frameData.fileName])
        }
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
        model: extendModel,
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
    setTransformModel('bytedance/seedream-v5.0-pro/edit')
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
      await saveWithRetry({
        type: 'image',
        url: data.imageUrl,
        prompt: transformPrompt,
        source_prompt: transformSource.prompt || null,
        model: transformModel,
      }, 'Your transformed image')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setTransforming(false)
  }

  const openImage3D = (item) => {
    setShow3DFromImage(item)
    setSelected(null)
  }

  const run3DFromImage = async () => {
    const item = show3DFromImage
    if (!item || busy3D) return
    setShow3DFromImage(null)
    setBusy3D(true)
    setAnimating(true)
    try {
      const res = await fetch('/api/generate-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: item.url, enablePbr: true, enableGeometry: false, provider: imgProvider3D }),
      })
      const data = await res.json()
      if (!data.modelUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setBusy3D(false); setAnimating(false)
        return
      }
      await saveWithRetry({
        type: 'model',
        url: data.modelUrl,
        prompt: item.prompt || '3D from image',
        thumbnail_url: data.thumbnailUrl || null,
      }, 'Your 3D model')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setBusy3D(false)
    setAnimating(false)
  }

  const run3D = async () => {
    if (busy3D) return
    if (!prompt3D.trim()) { alert('Describe the 3D object you want'); return }
    setShow3D(false)
    setBusy3D(true)
    setAnimating(true)  // reuse the generic "working" banner
    try {
      const res = await fetch('/api/generate-3d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt3D, enablePbr, enableGeometry, provider: provider3D }),
      })
      const data = await res.json()
      if (!data.modelUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setBusy3D(false); setAnimating(false)
        return
      }
      await saveWithRetry({
        type: 'model',
        url: data.modelUrl,
        prompt: prompt3D,
        thumbnail_url: data.thumbnailUrl || null,
      }, 'Your 3D model')
      setPrompt3D('')
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setBusy3D(false)
    setAnimating(false)
  }

  const runT2V = async () => {
    if (t2vBusy) return
    if (!t2vPrompt.trim()) { alert('Describe the video you want'); return }
    setShowT2V(false)
    setT2vBusy(true)
    setAnimating(true)
    try {
      const isKlingT2V = t2vModel.startsWith('kwaivgi/kling')
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: t2vModel,
          prompt: t2vPrompt,
          duration: t2vDuration,
          resolution: t2vRes,
          aspectRatio: t2vAspect,
          sound: isKlingT2V ? t2vSound : undefined,
        }),
      })
      const data = await res.json()
      if (!data.videoUrl) {
        alert('Error: ' + (data.error || 'failed'))
        setT2vBusy(false); setAnimating(false)
        return
      }
      const poster = await makePoster(data.videoUrl)
      await saveWithRetry({
        type: 'video',
        url: data.videoUrl,
        prompt: t2vPrompt,
        poster_url: poster,
        model: t2vModel,
      }, 'Your video')
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
    // update the local map immediately so the UI feels instant, but the
    // actual write below is what makes it durable across a refresh, so we
    // track "saving" and warn if the tab is closed before it lands.
    setFolderMap(prev => {
      const next = { ...prev }
      if (folderId) next[item.key] = folderId
      else delete next[item.key]
      return next
    })

    setSavingFolder(true)
    const warnBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)

    try {
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
    } finally {
      window.removeEventListener('beforeunload', warnBeforeUnload)
      setSavingFolder(false)
    }
  }

  const fileNameFrom = (url) => {
    if (!url) return null
    const part = String(url).split('/character-images/')[1]
    if (!part) return null
    // strip any query string
    return part.split('?')[0]
  }

  const togglePublish = async (item) => {
    if (item.source !== 'cards' || !item.cardId) return
    const next = !item.published
    const { error } = await supabase.from('cards').update({ published: next }).eq('id', item.cardId)
    if (error) { alert('Publish failed: ' + error.message); return }
    setMedia(prev => prev.map(m =>
      m.source === 'cards' && m.cardId === item.cardId ? { ...m, published: next } : m
    ))
    setSelected(prev => prev && prev.cardId === item.cardId ? { ...prev, published: next } : prev)
  }


  const openAddMisc = () => {
    if (!selected) return
    if (selected.source === 'cards') {
      alert('Card art stays on Cards. Pick a normal gallery image/video for Misc Beauties.')
      return
    }
    setMiscMode('standalone')
    setMiscSetId('')
    setMiscSetName('')
    setMiscPrefix('')
    setShowMiscModal(true)
  }

  const nextPublicId = async (prefix) => {
    const p = (prefix || 'MX').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'MX'
    const { data } = await supabase
      .from('misc_items')
      .select('public_id')
      .ilike('public_id', p + '%')
      .order('public_id', { ascending: false })
      .limit(50)
    let maxN = 102000
    for (const row of data || []) {
      const m = String(row.public_id || '').match(/(\d+)$/)
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
    }
    return p + String(maxN + 1)
  }

  const addToMisc = async () => {
    if (!selected || miscBusy) return
    setMiscBusy(true)
    try {
      let setId = null
      let prefix = 'MX'
      let setName = null

      if (miscMode === 'existing') {
        if (!miscSetId) throw new Error('Pick a set')
        const s = miscSets.find(x => x.id === miscSetId)
        if (!s) throw new Error('Set not found')
        setId = s.id
        prefix = s.code_prefix
        setName = s.name
      } else if (miscMode === 'new') {
        if (!miscSetName.trim()) throw new Error('Set name required')
        prefix = (miscPrefix || miscSetName).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'SET'
        const { data: created, error } = await supabase.from('misc_sets').insert([{
          name: miscSetName.trim(),
          code_prefix: prefix,
        }]).select().single()
        if (error) throw new Error(error.message)
        setId = created.id
        setName = created.name
        setMiscSets(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      }

      // sort index within set
      let sortIndex = 1
      if (setId) {
        const { count } = await supabase
          .from('misc_items')
          .select('id', { count: 'exact', head: true })
          .eq('set_id', setId)
        sortIndex = (count || 0) + 1
      }

      const publicId = await nextPublicId(prefix)
      const { data: item, error: iErr } = await supabase.from('misc_items').insert([{
        set_id: setId,
        type: selected.type === 'video' ? 'video' : 'image',
        url: selected.url,
        title: selected.prompt ? String(selected.prompt).slice(0, 80) : null,
        public_id: publicId,
        sort_index: sortIndex,
        published: true,
      }]).select().single()
      if (iErr) throw new Error(iErr.message)

      setShowMiscModal(false)
      alert(
        setName
          ? `Live in Misc: ${publicId} · ${setName} · item ${sortIndex}`
          : `Live in Misc (standalone): ${publicId}`
      )
    } catch (err) {
      alert('Add to Misc failed: ' + err.message)
    }
    setMiscBusy(false)
  }

  const remove = async (item) => {
    if (item.source === 'cards') {
      alert('This is card art. Delete or replace it from the Cards page.')
      return
    }
    if (item.linkedPublished) {
      const links = (item.publishedLinks || []).join('\n• ')
      const ok = confirm(
        '⚠️ This file is used by PUBLISHED game content:\n\n• ' + links +
        '\n\nDeleting it can break cards or media drops in the live game.\n\nDelete anyway?'
      )
      if (!ok) return
    } else if (!confirm('Delete this permanently?')) {
      return
    }

    try {
      const res = await fetch('/api/delete-gallery-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: item.source,
          id: item.id,
          itemKey: item.key,
          url: item.url,
          posterUrl: item.poster_url || item.thumbnail_url || null,
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
      const isModel = item.type === 'model'
      const stamp = new Date(item.created_at || Date.now()).toISOString().slice(0, 10)
      const base = (item.prompt ? item.prompt.slice(0, 30).replace(/[^a-z0-9]+/gi, '_') : item.type) || 'media'
      const ext = isModel ? 'glb' : isVideo ? 'mp4' : (item.url.toLowerCase().includes('.png') ? 'png' : 'jpeg')
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

  const downloadAll = async () => {
    if (bulkBusy) return
    const list = media.filter(m => m.url)
    if (!list.length) { alert('Nothing to download'); return }
    if (!confirm(`Download ${list.length} items (including card art)? Browser may block multiple downloads — allow popups if asked.`)) return
    setBulkBusy(true)
    let ok = 0
    for (let i = 0; i < list.length; i++) {
      setBulkStatus(`Downloading ${i + 1}/${list.length}...`)
      try {
        await downloadItem(list[i])
        ok++
        await new Promise(r => setTimeout(r, 400))
      } catch {}
    }
    setBulkBusy(false)
    setBulkStatus('')
    alert(`Downloaded ${ok} of ${list.length}`)
  }

  const shown = (() => {
    let list = media.filter(m => {
      if (filter === 'cards') return m.source === 'cards'
      // card media only appears under the Cards tab
      if (m.source === 'cards') return false
      if (filter === 'images') return m.type === 'image'
      if (filter === 'videos') return m.type === 'video'
      if (filter === 'models') return m.type === 'model'
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
        const fileName = fileNameFrom(m.url) || ''
        const hay = [m.prompt, m.negative_prompt, m.type, m.cardLabel, fileName].filter(Boolean).join(' ').toLowerCase()
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
      <Script
        type="module"
        src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"
        strategy="lazyOnload"
      />
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold">Gallery</h1>
        <button onClick={() => router.push('/media')} className="text-pink-400 hover:text-pink-300 text-sm font-semibold ml-2">Media</button>
        <button onClick={() => router.push('/cards')} className="text-gray-400 hover:text-white text-sm ml-2">Cards</button>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={downloadAll} disabled={bulkBusy} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-full px-3 py-2 text-sm font-semibold" title="Download all media">
            ⬇ All
          </button>
          <button onClick={() => router.push('/settings')} className="bg-red-950 hover:bg-red-900 rounded-full px-3 py-2 text-sm font-semibold text-red-300" title="Reset all data in Settings">
            🗑 Reset
          </button>
          <button onClick={() => setShowT2V(true)} className="bg-gray-800 hover:bg-gray-700 rounded-full px-3 py-2 text-sm font-semibold" title="Video from text">
            🎬 Text
          </button>
          <button onClick={() => setShow3D(true)} className="bg-gray-800 hover:bg-gray-700 rounded-full px-3 py-2 text-sm font-semibold" title="3D model from text">
            🧊 3D
          </button>
          <button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold">
            + Create
          </button>
        </div>
      </div>
      {bulkBusy && bulkStatus && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 text-sm text-gray-400">
          {bulkStatus}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {tab('all', 'All')}
        {tab('images', 'Images')}
        {tab('videos', 'Videos')}
        {tab('models', '3D')}
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
              ) : item.type === 'model' ? (
                <>
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <span className="text-3xl text-gray-600">🧊</span>
                    </div>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 bg-black/70 rounded-full px-2 py-0.5 text-[10px]">🧊 3D</span>
                </>
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
              {item.linkedPublished && item.source !== 'cards' && (
                <span className="absolute top-1.5 left-1.5 bg-pink-600/90 rounded-full px-2 py-0.5 text-[9px] tracking-wide font-semibold">
                  📡 Live
                </span>
              )}
              {item.source === 'cards' && item.published && (
                <span className="absolute bottom-1.5 left-1.5 bg-pink-600/90 rounded-full px-2 py-0.5 text-[9px] font-semibold">
                  Live
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
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500">
              {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="text-[10px] text-gray-600 mb-3">
              {priceLabel(IMAGE_MODELS.find(m => m.id === createModel), '2k')}
            </p>

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
            <p className="text-[10px] text-gray-600 mb-3">
              {priceLabel(VIDEO_MODELS.find(m => m.id === videoModel))}
            </p>

            {videoModel === 'alibaba/wan-2.2-spicy/image-to-video-lora' && (
              <div className="mb-3 space-y-2 border border-purple-900/50 rounded-lg p-3 bg-gray-950">
                <p className="text-[10px] text-purple-300">LoRA slots (one URL per line, max 3 each)</p>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">High-noise LoRAs</label>
                  <textarea rows={2} value={highNoiseLoras} onChange={e => setHighNoiseLoras(e.target.value)}
                    placeholder="https://.../lora.safetensors"
                    className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Low-noise LoRAs</label>
                  <textarea rows={2} value={lowNoiseLoras} onChange={e => setLowNoiseLoras(e.target.value)}
                    placeholder="https://.../lora.safetensors"
                    className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-purple-500" />
                </div>
              </div>
            )}

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
            <p className="text-[10px] text-gray-600 mb-3">
              {priceLabel(I2I_MODELS.find(m => m.id === transformModel))}
            </p>

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

      {/* 3D FROM IMAGE: provider choice */}
      {show3DFromImage && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-[65]">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h2 className="font-bold text-lg mb-2">Make 3D Model</h2>
            <p className="text-xs text-gray-500 mb-3">Takes a couple of minutes.</p>

            <img src={show3DFromImage.url} alt="" className="w-24 rounded-lg mb-3 border border-gray-700" />

            <label className="block text-xs text-gray-400 mb-1">Provider</label>
            <select value={imgProvider3D} onChange={e => setImgProvider3D(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500">
              <option value="hunyuan">Hunyuan 3D Rapid</option>
              <option value="seed3d">Seed3D v2.0 (higher detail)</option>
            </select>
            <p className="text-[10px] text-gray-600 mb-4">
              Works best on a simple background with the subject filling most of the frame.
            </p>

            <div className="flex gap-2">
              <button onClick={() => setShow3DFromImage(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={run3DFromImage} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Generate</button>
            </div>
          </div>
        </div>
      )}

      {/* TEXT TO 3D */}
      {show3D && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-[60]">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-2">3D Model from Text</h2>
            <p className="text-xs text-gray-500 mb-3">
              Generates a rotatable 3D model (GLB) from a description. Takes a couple of minutes.
            </p>

            <label className="block text-xs text-gray-400 mb-1">Describe the object</label>
            <textarea value={prompt3D} onChange={e => setPrompt3D(e.target.value)} rows={3}
              placeholder="e.g. a worn leather messenger bag with brass buckles"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Provider</label>
            <select value={provider3D} onChange={e => setProvider3D(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value="hunyuan">Hunyuan 3D Rapid</option>
              <option value="tripo">Tripo H3.1</option>
            </select>

            <label className="flex items-center gap-2 text-xs text-gray-400 mb-2">
              <input type="checkbox" checked={enablePbr} onChange={e => setEnablePbr(e.target.checked)} />
              Realistic materials (PBR textures)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-400 mb-4">
              <input type="checkbox" checked={enableGeometry} onChange={e => setEnableGeometry(e.target.checked)} />
              Also generate an untextured mesh
            </label>

            <p className="text-[10px] text-gray-600 -mt-2 mb-4">price not listed</p>

            <div className="flex gap-2">
              <button onClick={() => setShow3D(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={run3D} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Generate</button>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO EDIT */}
      {showVideoEdit && videoEditSource && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-[65] overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-2">Edit This Video</h2>
            <p className="text-xs text-gray-500 mb-3">
              Uses Kling O3 Pro to edit an existing video by instruction. Source video must be 10s or shorter.
              Saves as a new video; the original is kept.
            </p>

            <video src={videoEditSource.url} className="w-32 rounded-lg mb-3 border border-gray-700" muted controls />

            <label className="block text-xs text-gray-400 mb-1">What should change?</label>
            <textarea value={videoEditPrompt} onChange={e => setVideoEditPrompt(e.target.value)} rows={3}
              placeholder="e.g. change the background to a snowy forest"
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="flex items-center gap-2 text-xs text-gray-400 mb-4">
              <input type="checkbox" checked={videoEditKeepSound} onChange={e => setVideoEditKeepSound(e.target.checked)} />
              Keep the original audio
            </label>

            <div className="flex gap-2">
              <button onClick={() => setShowVideoEdit(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={runVideoEdit} disabled={videoEditing} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                {videoEditing ? 'Editing...' : 'Edit'}
              </button>
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
              Generates a video from a description alone, no starting image. 1-3 min.
            </p>

            <label className="block text-xs text-gray-400 mb-1">Model</label>
            <select value={t2vModel} onChange={e => setT2vModel(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {T2V_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            {t2vModel.startsWith('kwaivgi/kling') && (
              <label className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                <input type="checkbox" checked={t2vSound} onChange={e => setT2vSound(e.target.checked)} />
                Generate sound with the video
              </label>
            )}

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
              {t2vModel.startsWith('kwaivgi/kling')
                ? Array.from({ length: 13 }, (_, i) => i + 3).map(s => (
                    <option key={s} value={s}>{s} seconds</option>
                  ))
                : (
                  <>
                    <option value={5}>5 seconds</option>
                    <option value={8}>8 seconds</option>
                  </>
                )}
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={t2vRes} onChange={e => setT2vRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="480p">480p</option>
              <option value="720p">720p</option>
            </select>
            <p className="text-[10px] text-gray-600 -mt-3 mb-4">Grok text-to-video maxes at 720p. {priceLabel({ price: T2V_PRICE })}</p>

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

            <label className="block text-xs text-gray-400 mb-1">Video Model</label>
            <select value={extendModel} onChange={e => setExtendModel(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {VIDEO_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="text-[10px] text-gray-600 mb-3">
              {priceLabel(VIDEO_MODELS.find(m => m.id === extendModel))}
            </p>

            {extendModel === 'alibaba/wan-2.2-spicy/image-to-video-lora' && (
              <div className="mb-3 space-y-2 border border-purple-900/50 rounded-lg p-3 bg-gray-950">
                <p className="text-[10px] text-purple-300">LoRA slots (one URL per line, max 3 each)</p>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">High-noise LoRAs</label>
                  <textarea rows={2} value={extendHighNoiseLoras} onChange={e => setExtendHighNoiseLoras(e.target.value)}
                    placeholder="https://.../lora.safetensors"
                    className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Low-noise LoRAs</label>
                  <textarea rows={2} value={extendLowNoiseLoras} onChange={e => setExtendLowNoiseLoras(e.target.value)}
                    placeholder="https://.../lora.safetensors"
                    className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-purple-500" />
                </div>
              </div>
            )}

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
            ) : selected.type === 'model' ? (
              /* eslint-disable-next-line react/no-unknown-property */
              <model-viewer
                src={selected.url}
                camera-controls
                auto-rotate
                shadow-intensity="1"
                style={{ width: '100%', height: '360px', borderRadius: '1rem', background: '#111' }}
              />
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-gray-500">Folder</label>
                {savingFolder && <span className="text-[10px] text-gray-500">Saving...</span>}
              </div>
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
                <span className="text-gray-500">Model</span>
                <span className="text-gray-300 text-right max-w-[65%] truncate" title={selected.model || ''}>
                  {selected.model
                    ? (VIDEO_MODELS.find(m => m.id === selected.model)?.label
                        || IMAGE_MODELS.find(m => m.id === selected.model)?.label
                        || I2I_MODELS.find(m => m.id === selected.model)?.label
                        || T2V_MODELS.find(m => m.id === selected.model)?.label
                        || selected.model)
                    : '—'}
                </span>
              </div>
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
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-500">Prompt</p>
                    <button
                      onClick={() => copyUrl(selected.prompt)}
                      className="text-purple-400 hover:text-purple-300 font-semibold"
                    >
                      {copiedUrl ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-gray-400 leading-snug">{selected.prompt}</p>
                </div>
              )}
              {selected.source_prompt && (
                <div className="pt-1 border-t border-gray-800">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-gray-500">Original Prompt</p>
                    <button
                      onClick={() => copyUrl(selected.source_prompt)}
                      className="text-purple-400 hover:text-purple-300 font-semibold"
                    >
                      {copiedUrl ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-gray-400 leading-snug">{selected.source_prompt}</p>
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

            {selected.type === 'image' && (
              <>
                <button onClick={() => openImage3D(selected)} disabled={busy3D}
                  className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2">
                  🧊 Make 3D Model
                </button>

              </>
            )}

            {selected.type === 'video' && (
              <button onClick={() => openExtend(selected)} disabled={extending}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2">
                ⏭ Extend from last frame
              </button>
            )}

            {selected.type === 'video' && (
              <button onClick={() => openVideoEdit(selected)} disabled={videoEditing}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2">
                ✎ Edit This Video
              </button>
            )}

            {selected.source === 'cards' && (
              <button
                onClick={() => togglePublish(selected)}
                className={`w-full rounded-lg py-2 text-sm font-semibold mt-2 ${selected.published ? 'bg-pink-600 hover:bg-pink-500 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                {selected.published ? '✓ Published to game' : 'Publish to game'}
              </button>
            )}

            {selected.linkedPublished && selected.source !== 'cards' && (
              <div className="mt-3 mb-1 rounded-lg border border-pink-800/50 bg-pink-950/40 px-3 py-2">
                <p className="text-[11px] text-pink-300 font-semibold">📡 Used by published content</p>
                <ul className="mt-1 text-[10px] text-gray-400 list-disc list-inside">
                  {(selected.publishedLinks || []).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
            {selected.source === 'cards' && selected.published && (
              <p className="text-[11px] text-pink-300 text-center mt-3 mb-1 font-semibold">📡 Published card art</p>
            )}

            {selected.source !== 'cards' && (
              <button
                onClick={openAddMisc}
                className="w-full bg-pink-800 hover:bg-pink-700 rounded-lg py-2 text-sm font-semibold mt-2"
              >
                ✦ Add to Misc Beauties
              </button>
            )}

            {selected.source === 'cards' ? (
              <p className="text-[11px] text-gray-500 text-center mt-3 mb-1">
                This belongs to a card. Delete or replace it from the Cards page.
              </p>
            ) : (
              <button onClick={() => remove(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-2">
                {selected.linkedPublished ? 'Delete (breaks live content)…' : 'Delete'}
              </button>
            )}
            <button onClick={() => setSelected(null)} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">Close</button>
          </div>
        </div>
      )}

      {/* ADD TO MISC BEAUTIES */}
      {showMiscModal && selected && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-5">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-md">
            <h2 className="font-bold text-lg mb-1">Add to Misc Beauties</h2>
            <p className="text-xs text-gray-500 mb-4">Publishes this file to the game shop (unlimited supply).</p>

            <label className="block text-xs text-gray-400 mb-1">Placement</label>
            <select value={miscMode} onChange={e => setMiscMode(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
              <option value="standalone">Standalone (no set)</option>
              <option value="existing">Add to existing set</option>
              <option value="new">Create new set</option>
            </select>

            {miscMode === 'existing' && (
              <select value={miscSetId} onChange={e => setMiscSetId(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                <option value="">Select set…</option>
                {miscSets.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code_prefix})</option>
                ))}
              </select>
            )}

            {miscMode === 'new' && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Set name</label>
                <input value={miscSetName} onChange={e => setMiscSetName(e.target.value)}
                  placeholder="Tasha Dukes Set"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none" />
                <label className="block text-xs text-gray-400 mb-1">ID prefix (2–4 letters)</label>
                <input value={miscPrefix} onChange={e => setMiscPrefix(e.target.value)}
                  placeholder="TD"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none" />
              </>
            )}

            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setShowMiscModal(false)} disabled={miscBusy}
                className="flex-1 bg-gray-800 rounded-lg py-3 font-semibold">Cancel</button>
              <button type="button" onClick={addToMisc} disabled={miscBusy}
                className="flex-1 bg-pink-600 hover:bg-pink-500 rounded-lg py-3 font-semibold disabled:opacity-50">
                {miscBusy ? 'Saving…' : 'Publish to Misc'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
