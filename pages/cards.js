// pages/cards.js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import { downloadCard } from '../lib/renderCard'
import { makePoster } from '../lib/posterFrame'

const DEFAULT_NEGATIVE = 'blurry, (Asian), mature woman, big hips, wide hips, big breasts, unattractive female, low quality, deformed, extra fingers, extra limbs, mutated hands, bad anatomy, disfigured, poorly drawn face, watermark, text, signature, cropped, out of frame'

const SIZES = [
  { value: '768*1024', label: 'Portrait 3:4 (classic card)' },
  { value: '1024*1024', label: 'Square 1:1' },
  { value: '576*1024', label: 'Tall 9:16' },
]

const IMAGE_MODELS = [
  { id: 'z-image/turbo', label: 'Z-Image Turbo', family: 'flux' },
  { id: 'black-forest-labs/flux-dev', label: 'Flux Dev', family: 'flux' },
  { id: 'black-forest-labs/flux-schnell', label: 'Flux Schnell (fast)', family: 'schnell' },
  { id: 'bytedance/seedream-v5.0-pro/text-to-image', label: 'Seedream 5 Pro (hi-res)', family: 'seedream' },
  { id: 'xai/grok-imagine-image-quality/text-to-image', label: 'Grok Imagine', family: 'grok' },
]

const familyOf = (id) => (IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0]).family

const VIDEO_MODELS = [
  { id: 'alibaba/wan-2.6/image-to-video', label: 'Wan 2.6 (5-15s)' },
  { id: 'atlascloud/wan-2.2-turbo/image-to-video', label: 'Wan 2.2 Turbo (fast, 5s)' },
  { id: 'xai/grok-imagine-video-v1.5/image-to-video', label: 'Grok Imagine (up to 1080p)' },
  { id: 'atlascloud/wan-2.2-turbo-spicy/image-to-video', label: 'Wan 2.2 Spicy' },
]

const ART_STYLES = [
  { value: '', label: 'None (use prompt as-is)' },
  { value: 'editorial fashion photography, professional studio lighting, sharp focus, natural skin texture, high end magazine quality', label: 'Editorial Fashion' },
  { value: 'natural light portrait photography, soft window light, shallow depth of field, candid feel, realistic skin', label: 'Natural Light Portrait' },
  { value: 'sports photography, fast shutter, dynamic action, stadium or track setting, crisp detail, athletic', label: 'Sports Action' },
  { value: 'black and white photography, high contrast monochrome, dramatic shadows, classic film grain', label: 'Black & White' },
  { value: 'golden hour photography, warm backlight, sun flare, glowing rim light, outdoor', label: 'Golden Hour' },
  { value: 'street style photography, urban backdrop, candid stride, city environment, documentary feel', label: 'Street Style' },
  { value: 'studio beauty photography, clean seamless backdrop, soft even lighting, crisp detail, minimal', label: 'Studio Beauty' },
  { value: 'cinematic film still, anamorphic look, moody colour grade, shallow focus, narrative feel', label: 'Cinematic' },
  { value: 'analog film photography, 35mm grain, muted colour, slight halation, nostalgic tone', label: 'Film Photography' },
  { value: 'high fashion runway photography, backstage energy, motion, professional lighting', label: 'Runway' },
]

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ultra elite', 'after hours']

// stat value ranges per rarity, used when creating a variant
const RARITY_STAT_RANGE = {
  common:    [40, 62],
  uncommon:  [52, 72],
  rare:      [64, 82],
  epic:      [76, 90],
  legendary: [86, 96],
  'ultra elite': [94, 100],
}

// rarities that carry no ratings at all
const STATLESS = ['after hours']
const isStatless = (r) => STATLESS.includes(String(r || '').toLowerCase())

const rollStats = (labels, rarity) => {
  if (isStatless(rarity)) return []
  const [lo, hi] = RARITY_STAT_RANGE[rarity] || RARITY_STAT_RANGE.common
  return labels.map(label => ({
    label,
    value: Math.floor(lo + Math.random() * (hi - lo + 1)),
  }))
}

const TREAT = {
  common:    { edge: 'edge-common',    glow: '',               badge: 'badge-common',    foil: '',            holo: false, code: 'COM' },
  uncommon:  { edge: 'edge-uncommon',  glow: 'glow-uncommon',  badge: 'badge-uncommon',  foil: '',            holo: false, code: 'UNC' },
  rare:      { edge: 'edge-rare',      glow: 'glow-rare',      badge: 'badge-rare',      foil: 'foil',        holo: false, code: 'RAR' },
  epic:      { edge: 'edge-epic',      glow: 'glow-epic',      badge: 'badge-epic',      foil: 'foil',        holo: true,  code: 'EPI' },
  legendary: { edge: 'edge-legendary', glow: 'glow-legendary', badge: 'badge-legendary', foil: 'foil-strong', holo: true,  code: 'LEG' },
  'ultra elite': { edge: 'edge-ultra', glow: 'glow-ultra', badge: 'badge-ultra', foil: 'foil-ultra', holo: true, code: 'ULT' },
  'after hours': { edge: 'edge-afterhours', glow: 'glow-afterhours', badge: 'badge-afterhours', foil: 'foil-pearl', holo: false, code: 'AFT' },
}

const treatOf = (r) => TREAT[r] || TREAT.common

const rarityLabel = (r) =>
  String(r || 'common').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

const STANDARD_LABELS = ['Star Power', 'Physique', 'Allure', 'Charisma']

const emptyDraft = () => ({
  name: '', title: '', description: '', flavor_text: '', rarity: 'common',
  stats: rollStats(STANDARD_LABELS, 'common'),
  image_prompt: '', back_image_prompt: '',
})

export default function Cards() {
  const router = useRouter()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('date_desc')
  const [search, setSearch] = useState('')
  const [rarityFilter, setRarityFilter] = useState('all')

  const [selected, setSelected] = useState(null)
  const [side, setSide] = useState('front')
  const [expanded, setExpanded] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [concept, setConcept] = useState('')
  const [conceptRarity, setConceptRarity] = useState('random')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState(null)
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [size, setSize] = useState('768*1024')
  const [artStyle, setArtStyle] = useState((ART_STYLES.find(s => s.label === 'Studio Beauty') || ART_STYLES[1]).value)
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0].id)
  const [seedInput, setSeedInput] = useState('')
  const [guidance, setGuidance] = useState(3.5)
  const [steps, setSteps] = useState(28)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')

  const [editing, setEditing] = useState(null)
  const [editNegative, setEditNegative] = useState(DEFAULT_NEGATIVE)
  const [editSize, setEditSize] = useState('768*1024')
  const [editStyle, setEditStyle] = useState('')
  const [saving, setSaving] = useState(false)
  const [regenProgress, setRegenProgress] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [variantOf, setVariantOf] = useState(null)

  const [showAnimate, setShowAnimate] = useState(false)
  const [animPrompt, setAnimPrompt] = useState(Smooth movement, eyes alive,)
  const [animDuration, setAnimDuration] = useState(5)
  const [animRes, setAnimRes] = useState('720p')
  const [animModel, setAnimModel] = useState('alibaba/wan-2.6/image-to-video')
  const [animating, setAnimating] = useState(false)
  const [view, setView] = useState('static')

  useEffect(() => { loadCards() }, [])

  const loadCards = async () => {
    const { data } = await supabase.from('cards').select('*').order('created_at', { ascending: false })
    setCards(data || [])
    setLoading(false)
  }

  const openCard = (card) => {
    setSelected(card)
    setSide('front')
    setExpanded(false)
    setView('static')
  }

  const normalizeStats = (card) => {
    if (isStatless(card.rarity)) return []
    if (Array.isArray(card.stats) && card.stats.length) return card.stats
    const legacy = []
    if (card.hp != null) legacy.push({ label: 'HP', value: card.hp })
    if (card.attack != null) legacy.push({ label: 'ATK', value: card.attack })
    if (card.defense != null) legacy.push({ label: 'DEF', value: card.defense })
    if (card.speed != null) legacy.push({ label: 'SPD', value: card.speed })
    return legacy
  }

  const draftCard = async () => {
    if (!concept.trim() || drafting) return
    setDrafting(true); setDraft(null)
    try {
      const res = await fetch('/api/generate-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, rarity: conceptRarity }),
      })
      const data = await res.json()
      if (data.card) {
        const rarity = (conceptRarity && conceptRarity !== 'random')
          ? conceptRarity
          : (data.card.rarity || 'common').toLowerCase()
        const labels = Array.isArray(data.card.stats) && data.card.stats.length
          ? data.card.stats.map(s => s.label)
          : ['Star Power', 'Physique', 'Allure', 'Charisma']
        setDraft({ ...data.card, rarity, stats: rollStats(labels, rarity) })
      }
      else alert('Error: ' + (data.error || 'could not draft card'))
    } catch (err) { alert('Error: ' + err.message) }
    setDrafting(false)
  }

  const withStyle = (base, style) => (!style ? base : `${base}, ${style}`)
  const BACK_FRAMING = 'subject in the upper half of the frame, head and shoulders near the top third, open space toward the bottom'
  const withBackFraming = (base) => `${base}, ${BACK_FRAMING}`

  const genImage = async (imgPrompt, seedVal, neg, sz, style, modelId) => {
    const useModel = modelId || imageModel
    const fam = familyOf(useModel)

    const payload = {
      model: useModel,
      prompt: withStyle(imgPrompt, style),
    }

    if (fam === 'grok') {
      payload.aspectRatio = '2:3'
      payload.resolution = '2k'
    } else if (fam === 'seedream') {
      payload.size = '1328*1776'   // portrait, card-friendly
      payload.thinking = 'disabled'
    } else if (fam === 'schnell') {
      payload.size = sz || '768*1024'
      payload.seed = seedVal || undefined
      payload.negativePrompt = neg
    } else {
      // flux / z-image
      payload.size = sz || '768*1024'
      payload.seed = seedVal || undefined
      payload.negativePrompt = neg
      payload.guidance = guidance
      payload.steps = steps
    }

    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.json()
  }

  const makeCardNumber = async (rarity) => {
    const code = treatOf(rarity).code
    // fill the lowest unused number for this rarity
    const { data: existing } = await supabase
      .from('cards')
      .select('card_number')
      .eq('rarity', rarity)

    const used = new Set()
    for (const row of existing || []) {
      const n = parseInt(String(row.card_number || '').split('-')[1])
      if (!isNaN(n)) used.add(n)
    }

    let n = 1
    while (used.has(n)) n++
    return `${code}-${String(n).padStart(3, '0')}`
  }

  const createCard = async () => {
    if (!draft || generating) return
    if (!draft.image_prompt?.trim()) { alert('Front art prompt is required'); return }
    setGenerating(true)
    try {
      setProgress('Generating front art...')
      const front = await genImage(draft.image_prompt, seedInput, negative, size, artStyle)
      if (!front.imageUrl) { alert('Front image error: ' + (front.error || 'failed')); setGenerating(false); setProgress(''); return }

      let back = { imageUrl: null, seed: null }
      if (draft.back_image_prompt?.trim()) {
        setProgress('Generating back art...')
        back = await genImage(withBackFraming(draft.back_image_prompt), '', negative, size, artStyle)
        if (!back.imageUrl) { alert('Back image error: ' + (back.error || 'failed')); setGenerating(false); setProgress(''); return }
      }

      setProgress('Saving...')
      const rarity = (draft.rarity || 'common').toLowerCase()
      const cardNumber = await makeCardNumber(rarity)

      const { error } = await supabase.from('cards').insert([{
        name: draft.name || 'Unnamed',
        title: draft.title,
        description: draft.description,
        flavor_text: draft.flavor_text,
        rarity,
        card_number: cardNumber,
        stats: draft.stats || [],
        image_url: front.imageUrl,
        image_prompt: withStyle(draft.image_prompt, artStyle),
        seed: front.seed,
        back_image_url: back.imageUrl,
        back_image_prompt: draft.back_image_prompt ? withStyle(draft.back_image_prompt, artStyle) : null,
        back_seed: back.seed,
        negative_prompt: negative,
        image_model: imageModel,
      }])
      if (error) { alert('Save error: ' + error.message); setGenerating(false); setProgress(''); return }

      setShowCreate(false); setDraft(null); setConcept(''); setSeedInput(''); setNegative(DEFAULT_NEGATIVE); setVariantOf(null)
      loadCards()
    } catch (err) { alert('Error: ' + err.message) }
    setGenerating(false); setProgress('')
  }

  const openEdit = (card) => {
    setEditing({ ...card, stats: normalizeStats(card) })
    setEditNegative(card.negative_prompt || DEFAULT_NEGATIVE)
    setEditSize('768*1024')
    setEditStyle('')
    setSelected(null)
  }

  const saveEdit = async () => {
    if (!editing || saving) return
    setSaving(true)
    const { error } = await supabase.from('cards').update({
      name: editing.name,
      title: editing.title,
      description: editing.description,
      flavor_text: editing.flavor_text,
      rarity: (editing.rarity || 'common').toLowerCase(),
      card_number: editing.card_number,
      stats: editing.stats,
      image_prompt: editing.image_prompt,
      back_image_prompt: editing.back_image_prompt,
      negative_prompt: editNegative,
    }).eq('id', editing.id)
    setSaving(false)
    if (error) { alert('Save error: ' + error.message); return }
    setEditing(null)
    loadCards()
  }

  const regenSide = async (which) => {
    if (!editing || regenProgress) return
    const promptText = which === 'front' ? editing.image_prompt : editing.back_image_prompt
    if (!promptText?.trim()) { alert('Add an art prompt first'); return }

    setRegenProgress(`Regenerating ${which}...`)
    const finalPrompt = which === 'back' ? withBackFraming(promptText) : promptText
    const result = await genImage(finalPrompt, '', editNegative, editSize, editStyle, editing.image_model || imageModel)
    if (!result.imageUrl) { alert('Error: ' + (result.error || 'failed')); setRegenProgress(''); return }

    const oldUrl = which === 'front' ? editing.image_url : editing.back_image_url
    const patch = which === 'front'
      ? { image_url: result.imageUrl, seed: result.seed }
      : { back_image_url: result.imageUrl, back_seed: result.seed }

    const { error } = await supabase.from('cards').update(patch).eq('id', editing.id)
    if (error) { alert('Save error: ' + error.message); setRegenProgress(''); return }

    if (oldUrl) {
      const f = oldUrl.split('/character-images/')[1]
      if (f) await supabase.storage.from('character-images').remove([f])
    }

    setEditing({ ...editing, ...patch })
    setRegenProgress('')
    loadCards()
  }

  const deleteCard = async (card) => {
    if (!confirm('Delete this card?')) return
    await supabase.from('cards').delete().eq('id', card.id)
    const files = []
    for (const u of [card.image_url, card.back_image_url, card.video_url]) {
      if (u) {
        const f = u.split('/character-images/')[1]
        if (f) files.push(f)
      }
    }
    if (files.length) await supabase.storage.from('character-images').remove(files)
    setSelected(null); setEditing(null); setExpanded(false)
    loadCards()
  }

  const openAnimate = () => {
    if (!selected?.image_url) return
    setAnimPrompt(selected.video_prompt || Smooth movement, eyes alive,)
    setAnimDuration(5)
    setAnimRes('720p')
    setShowAnimate(true)
  }

  const runAnimate = async () => {
    if (!selected || animating) return
    setShowAnimate(false)
    setAnimating(true)

    const oldVideo = selected.video_url

    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: selected.image_url,
          prompt: animPrompt,
          duration: animDuration,
          resolution: animRes,
          model: animModel,
        }),
      })
      const data = await res.json()
      if (!data.videoUrl) {
        alert('Animation error: ' + (data.error || 'failed'))
        setAnimating(false)
        return
      }

      const poster = await makePoster(data.videoUrl)
      const { error } = await supabase
        .from('cards')
        .update({ video_url: data.videoUrl, video_prompt: animPrompt, poster_url: poster })
        .eq('id', selected.id)

      if (error) {
        alert('Save error: ' + error.message)
        setAnimating(false)
        return
      }

      // remove the replaced clip from storage
      if (oldVideo) {
        const f = oldVideo.split('/character-images/')[1]
        if (f) await supabase.storage.from('character-images').remove([f])
      }

      setSelected({ ...selected, video_url: data.videoUrl, video_prompt: animPrompt, poster_url: poster })
      setView('animated')
      loadCards()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setAnimating(false)
  }

  // start a new card for the same character, at a different rarity
  const makeVariant = (card) => {
    // always use the current standard labels, even if the source card
    // predates them (e.g. old HP/ATK/DEF/SPD cards)
    const baseLabels = STANDARD_LABELS

    // default the new one a tier up from the source where possible
    const idx = RARITIES.indexOf((card.rarity || 'common').toLowerCase())
    const nextRarity = RARITIES[Math.min(idx + 1, RARITIES.length - 1)]

    setVariantOf(card)
    setDraft({
      name: card.name || '',
      title: card.title || '',
      description: card.description || '',
      flavor_text: card.flavor_text || '',
      rarity: nextRarity,
      stats: rollStats(baseLabels, nextRarity),
      image_prompt: card.image_prompt || '',
      back_image_prompt: card.back_image_prompt || '',
    })
    setNegative(card.negative_prompt || DEFAULT_NEGATIVE)
    setSeedInput(card.seed != null ? String(card.seed) : '')
    setArtStyle('')
    setImageModel(card.image_model || IMAGE_MODELS[0].id)
    setSelected(null)
    setShowCreate(true)
  }

  const copy = (val) => navigator.clipboard?.writeText(String(val))

  const handleDownload = async (card) => {
    if (downloading) return
    setDownloading(true)
    try {
      await downloadCard(card)
    } catch (err) {
      alert('Download failed: ' + err.message)
    }
    setDownloading(false)
  }

  const handleDownloadVideo = async (card) => {
    if (!card.video_url) return
    try {
      const resp = await fetch(card.video_url)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const safeName = String(card.name || 'card').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      const a = document.createElement('a')
      a.href = url
      a.download = `${card.card_number || 'card'}_${safeName}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      alert('Video download failed: ' + err.message)
    }
  }

  const statEditor = (statsArr, onChange) => (
    <div className="space-y-2 mb-3">
      {statsArr.map((s, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={s.label} placeholder="Label"
            onChange={e => { const c = [...statsArr]; c[i] = { ...c[i], label: e.target.value }; onChange(c) }}
            className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500" />
          <input type="number" value={s.value}
            onChange={e => { const c = [...statsArr]; c[i] = { ...c[i], value: parseInt(e.target.value) || 0 }; onChange(c) }}
            className="w-20 bg-black border border-gray-700 rounded-lg px-2 py-2 text-sm outline-none focus:border-purple-500" />
          <button onClick={() => onChange(statsArr.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-400 px-2 text-sm">✕</button>
        </div>
      ))}
      <button onClick={() => onChange([...statsArr, { label: '', value: 50 }])}
        className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs font-semibold">+ Add Stat</button>
    </div>
  )

  const statBar = (label, value, i, big) => (
    <div key={i} className={`flex items-center gap-2 ${big ? 'text-xs' : 'text-[9px]'}`}>
      <span className={`${big ? 'w-20' : 'w-10'} text-gray-200 truncate uppercase tracking-wide`}>{label}</span>
      <div className="flex-1 bg-white/25 rounded-full h-1">
        <div className="bg-white h-1 rounded-full" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className={`${big ? 'w-7' : 'w-5'} text-right text-gray-100`}>{value}</span>
    </div>
  )

  const cardFront = (card, big = false, animated = false) => {
    const t = treatOf(card.rarity)
    const showVideo = animated && card.video_url
    return (
      <div className={`card-shell ${t.edge} ${t.glow}`}>
        <div className={`card-inner ${t.foil} ${t.holo ? 'holo' : ''}`}>
          <div className="relative aspect-[3/4]">
            {showVideo ? (
              <video
                src={card.video_url}
                autoPlay
                loop
                muted
                playsInline
                poster={card.poster_url || undefined}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : card.image_url ? (
              <img src={card.image_url} alt={card.name} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gray-900" />
            )}
            <span className={`badge ${t.badge}`}>{card.rarity}</span>
            <div className="nameplate">
              <div className={`font-bold leading-tight truncate tracking-wide ${big ? 'text-2xl' : 'text-[15px]'}`}>{card.name}</div>
              {card.title && (
                <div className={`text-gray-300 truncate uppercase tracking-[0.12em] mt-0.5 ${big ? 'text-xs' : 'text-[10px]'}`}>{card.title}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const cardBack = (card, big = false) => {
    const t = treatOf(card.rarity)
    const stats = normalizeStats(card)
    return (
      <div className={`card-shell ${t.edge} ${t.glow}`}>
        <div className={`card-inner ${t.foil} ${t.holo ? 'holo' : ''}`}>
          <div className="relative aspect-[3/4]">
            {card.back_image_url ? (
              <img src={card.back_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-gray-700 text-[10px]">no back art</div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-[68%] bg-gradient-to-t from-black from-45% via-black/90 via-70% to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-[38%] bg-black/60" />
            <span className={`badge ${t.badge}`}>{card.rarity}</span>

            <div className={`absolute inset-0 z-[4] flex flex-col justify-end ${big ? 'p-5' : 'p-3'}`}>
              {card.description && (
                <p className={`text-gray-200 leading-snug mb-2 ${big ? 'text-sm' : 'text-[10px]'}`}>{card.description}</p>
              )}
              {card.flavor_text && (
                <p className={`italic text-gray-400 mb-3 leading-snug ${big ? 'text-xs' : 'text-[9px]'}`}>"{card.flavor_text}"</p>
              )}
              {stats.length > 0 && (
                <div className={`${big ? 'space-y-2' : 'space-y-1'} mb-2`}>
                  {stats.map((s, i) => statBar(s.label, s.value, i, big))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/15">
                <span className={`font-mono text-gray-400 tracking-widest ${big ? 'text-[11px]' : 'text-[9px]'}`}>{card.card_number || '—'}</span>
                <span className={`text-gray-500 tracking-widest uppercase ${big ? 'text-[11px]' : 'text-[9px]'}`}>Companion</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const visibleCards = (() => {
    let list = [...cards]

    if (rarityFilter !== 'all') {
      list = list.filter(c => (c.rarity || 'common').toLowerCase() === rarityFilter)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(c => {
        const hay = [
          c.name, c.title, c.description, c.flavor_text,
          c.card_number, c.rarity, c.image_prompt, c.back_image_prompt,
          ...(Array.isArray(c.stats) ? c.stats.map(s => s.label) : []),
        ].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
    }

    const byName = (a, b) => (a.name || '').localeCompare(b.name || '')
    const byDate = (a, b) => new Date(a.created_at) - new Date(b.created_at)

    if (sortBy === 'name_asc') list.sort(byName)
    else if (sortBy === 'name_desc') list.sort((a, b) => byName(b, a))
    else if (sortBy === 'date_asc') list.sort(byDate)
    else list.sort((a, b) => byDate(b, a)) // date_desc default

    return list
  })()

  const inputRow = (label, value, onChange, multiline = false, rows = 2) => (
    <>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {multiline ? (
        <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows}
          className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />
      ) : (
        <input value={value || ''} onChange={e => onChange(e.target.value)}
          className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />
      )}
    </>
  )

  const viewToggle = () => {
    if (!selected?.video_url) return null
    return (
      <div className="flex gap-2 justify-center mb-3">
        <button onClick={() => setView('static')}
          className={`px-4 py-1 rounded-full text-[11px] font-semibold tracking-wide ${view === 'static' ? 'bg-white text-black' : 'bg-gray-900 text-gray-400'}`}>
          Static
        </button>
        <button onClick={() => setView('animated')}
          className={`px-4 py-1 rounded-full text-[11px] font-semibold tracking-wide ${view === 'animated' ? 'bg-white text-black' : 'bg-gray-900 text-gray-400'}`}>
          Animated
        </button>
      </div>
    )
  }

  const sideToggle = () => (
    <div className="flex gap-2 justify-center mb-3">
      <button onClick={() => setSide('front')}
        className={`px-5 py-1.5 rounded-full text-xs font-semibold tracking-wide ${side === 'front' ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
        Front
      </button>
      <button onClick={() => setSide('back')}
        className={`px-5 py-1.5 rounded-full text-xs font-semibold tracking-wide ${side === 'back' ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
        Back
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white p-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-bold tracking-wide">Cards</h1>
        <button onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold">+ New</button>
      </div>

      {!loading && cards.length > 0 && (
        <div className="mb-4 space-y-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, prompt, rarity..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ['date_desc', 'Newest'],
              ['date_asc', 'Oldest'],
              ['name_asc', 'A–Z'],
              ['name_desc', 'Z–A'],
            ].map(([val, label]) => (
              <button key={val} onClick={() => setSortBy(val)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${sortBy === val ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {['all', ...RARITIES].map(r => (
              <button key={r} onClick={() => setRarityFilter(r)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${rarityFilter === r ? 'bg-purple-600 text-white' : 'bg-gray-900 text-gray-400'}`}>
                {r === 'all' ? 'All' : rarityLabel(r)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : cards.length === 0 ? (
        <p className="text-gray-500 text-sm">No cards yet. Tap "+ New" to summon one.</p>
      ) : visibleCards.length === 0 ? (
        <p className="text-gray-500 text-sm">No cards match "{search}".</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {visibleCards.map(c => (
            <button key={c.id} onClick={() => openCard(c)} className="text-left relative">
              {cardFront(c)}
              {c.video_url && (
                <span className="absolute bottom-2 left-2 z-[5] bg-black/70 rounded-full px-2 py-0.5 text-[9px] tracking-wide">
                  🎬
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* CREATE */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">New Card</h2>

            {!draft ? (
              <>
                <label className="block text-xs text-gray-400 mb-1">Concept</label>
                <textarea value={concept} onChange={e => setConcept(e.target.value)} rows={3}
                  placeholder="e.g. a sprinter who came up through club athletics, quiet and intense"
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

                <label className="block text-xs text-gray-400 mb-1">Rarity</label>
                <select value={conceptRarity} onChange={e => setConceptRarity(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  <option value="random">Random</option>
                  {RARITIES.map(r => <option key={r} value={r}>{rarityLabel(r)}</option>)}
                </select>

                <button onClick={() => setDraft(emptyDraft())} className="text-xs text-gray-500 hover:text-gray-300 mb-4">or build it manually →</button>
                <div className="flex gap-2">
                  <button onClick={() => { setShowCreate(false); setConcept(''); setVariantOf(null) }} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
                  <button onClick={draftCard} disabled={drafting} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                    {drafting ? 'Drafting...' : 'Draft Card'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {variantOf ? (
                  <div className="bg-purple-950/40 border border-purple-900 rounded-lg p-3 mb-3">
                    <p className="text-xs text-purple-300 font-semibold mb-1">
                      New card for {variantOf.name}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Same character, same seed. Pick a rarity and adjust the scene in the art prompts.
                      The face may still differ between cards.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mb-3">Edit anything before generating.</p>
                )}
                {inputRow('Name', draft.name, v => setDraft({ ...draft, name: v }))}
                {inputRow('Title', draft.title, v => setDraft({ ...draft, title: v }))}

                <label className="block text-xs text-gray-400 mb-1">Rarity</label>
                <select value={draft.rarity || 'common'}
                  onChange={e => {
                    const r = e.target.value
                    const labels = (draft.stats || []).map(s => s.label)
                    setDraft({
                      ...draft,
                      rarity: r,
                      stats: labels.length ? rollStats(labels, r) : draft.stats,
                    })
                  }}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500">
                  {RARITIES.map(r => <option key={r} value={r}>{rarityLabel(r)}</option>)}
                </select>
                <p className="text-[10px] text-gray-600 mb-3">Changing rarity re-rolls the stat values to suit that tier.</p>

                {inputRow('Description', draft.description, v => setDraft({ ...draft, description: v }), true, 2)}
                {inputRow('Flavor Text', draft.flavor_text, v => setDraft({ ...draft, flavor_text: v }))}

                {isStatless(draft.rarity) ? (
                  <p className="text-[11px] text-gray-500 mb-3">
                    After Hours cards carry no ratings.
                  </p>
                ) : (
                  <>
                    <label className="block text-xs text-gray-400 mb-1">Stats</label>
                    {statEditor(draft.stats || [], arr => setDraft({ ...draft, stats: arr }))}
                  </>
                )}

                <label className="block text-xs text-gray-400 mb-1">Image Model</label>
                <select value={imageModel} onChange={e => setImageModel(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500">
                  {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <p className="text-[10px] text-gray-600 mb-3">
                  {familyOf(imageModel) === 'seedream' && 'Highest resolution. No seed or negative prompt.'}
                  {familyOf(imageModel) === 'grok' && 'Stylized. No seed or negative prompt.'}
                  {familyOf(imageModel) === 'schnell' && 'Fast, lower cost. Uses seed + negative.'}
                  {familyOf(imageModel) === 'flux' && 'Balanced. Full control (seed, guidance, steps).'}
                </p>

                <label className="block text-xs text-gray-400 mb-1">Art Style</label>
                <select value={artStyle} onChange={e => setArtStyle(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  {ART_STYLES.map(s => <option key={s.label} value={s.value}>{s.label}</option>)}
                </select>

                {inputRow('Front Art Prompt', draft.image_prompt, v => setDraft({ ...draft, image_prompt: v }), true, 4)}
                {inputRow('Back Art Prompt (optional)', draft.back_image_prompt, v => setDraft({ ...draft, back_image_prompt: v }), true, 4)}
                {inputRow('Negative Prompt', negative, setNegative, true, 3)}

                <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
                <select value={size} onChange={e => setSize(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                  {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>

                {inputRow('Front Seed (optional)', seedInput, setSeedInput)}

                <label className="block text-xs text-gray-400 mb-1">Guidance: {guidance}</label>
                <input type="range" min="1" max="10" step="0.5" value={guidance}
                  onChange={e => setGuidance(parseFloat(e.target.value))}
                  className="w-full mb-1 accent-purple-500" />
                <p className="text-[10px] text-gray-600 mb-3">Low (2-4) = softer, more natural. High (6+) = rigid, can look over-cooked. Flux likes 3-4.</p>

                <label className="block text-xs text-gray-400 mb-1">Steps: {steps}</label>
                <input type="range" min="10" max="50" step="1" value={steps}
                  onChange={e => setSteps(parseInt(e.target.value))}
                  className="w-full mb-1 accent-purple-500" />
                <p className="text-[10px] text-gray-600 mb-3">More steps = more detail, slower. 28 is a good default.</p>

                {progress && <p className="text-xs text-purple-400 mb-3">{progress}</p>}

                <div className="flex gap-2">
                  <button onClick={() => { setDraft(null); setVariantOf(null) }} disabled={generating} className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-3 font-semibold">Back</button>
                  <button onClick={createCard} disabled={generating} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                    {generating ? 'Summoning...' : 'Create Card'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* EDIT */}
      {editing && (
        <div className="fixed inset-0 bg-black/85 flex items-start justify-center p-5 z-50 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-3">Edit Card</h2>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>{cardFront(editing)}</div>
              <div>{cardBack(editing)}</div>
            </div>

            {inputRow('Name', editing.name, v => setEditing({ ...editing, name: v }))}
            {inputRow('Title', editing.title, v => setEditing({ ...editing, title: v }))}
            {inputRow('Card Number', editing.card_number, v => setEditing({ ...editing, card_number: v }))}

            <label className="block text-xs text-gray-400 mb-1">Rarity</label>
            <select value={editing.rarity || 'common'} onChange={e => setEditing({ ...editing, rarity: e.target.value })}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {RARITIES.map(r => <option key={r} value={r}>{rarityLabel(r)}</option>)}
            </select>

            {inputRow('Description', editing.description, v => setEditing({ ...editing, description: v }), true, 2)}
            {inputRow('Flavor Text', editing.flavor_text, v => setEditing({ ...editing, flavor_text: v }))}

            {isStatless(editing.rarity) ? (
              <p className="text-[11px] text-gray-500 mb-3">
                After Hours cards carry no ratings.
              </p>
            ) : (
              <>
                <label className="block text-xs text-gray-400 mb-1">Stats</label>
                {statEditor(editing.stats || [], arr => setEditing({ ...editing, stats: arr }))}
              </>
            )}

            <div className="border-t border-gray-800 pt-4 mt-2">
              <p className="text-xs text-gray-400 mb-2 font-semibold">Regenerate Art</p>
              {inputRow('Front Art Prompt', editing.image_prompt, v => setEditing({ ...editing, image_prompt: v }), true, 3)}
              {inputRow('Back Art Prompt', editing.back_image_prompt, v => setEditing({ ...editing, back_image_prompt: v }), true, 3)}
              {inputRow('Negative Prompt', editNegative, setEditNegative, true, 2)}

              <label className="block text-xs text-gray-400 mb-1">Add Art Style</label>
              <select value={editStyle} onChange={e => setEditStyle(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                {ART_STYLES.map(s => <option key={s.label} value={s.value}>{s.label}</option>)}
              </select>

              <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
              <select value={editSize} onChange={e => setEditSize(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              {regenProgress && <p className="text-xs text-purple-400 mb-2">{regenProgress}</p>}

              <div className="flex gap-2 mb-4">
                <button onClick={() => regenSide('front')} disabled={!!regenProgress}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">Regenerate Front</button>
                <button onClick={() => regenSide('back')} disabled={!!regenProgress}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">Regenerate Back</button>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} disabled={saving} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg py-3 font-semibold">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>

            <button onClick={() => deleteCard(editing)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-3">Delete Card</button>
          </div>
        </div>
      )}

      {/* DETAIL — one large card, front/back toggle, tap to expand */}
      {selected && !expanded && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-5 z-50 overflow-y-auto" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm my-6" onClick={e => e.stopPropagation()}>
            {sideToggle()}
            {side === 'front' && viewToggle()}

            <button onClick={() => setExpanded(true)} className="block w-full text-left">
              {side === 'front' ? cardFront(selected, false, view === 'animated') : cardBack(selected)}
            </button>
            <p className="text-center text-[10px] text-gray-600 mt-2">tap the card to expand</p>

            {animating && (
              <p className="text-center text-xs text-purple-400 mt-3">Animating... (1-2 min)</p>
            )}

            <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Card No.</span>
                <span className="font-mono text-gray-300">{selected.card_number || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Front seed</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-300">{selected.seed ?? '—'}</span>
                  {selected.seed && <button onClick={() => copy(selected.seed)} className="text-gray-500 hover:text-white">Copy</button>}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Back seed</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-300">{selected.back_seed ?? '—'}</span>
                  {selected.back_seed && <button onClick={() => copy(selected.back_seed)} className="text-gray-500 hover:text-white">Copy</button>}
                </div>
              </div>
            </div>

            <button onClick={openAnimate} disabled={animating}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-3">
              {animating ? 'Animating...' : selected.video_url ? '🎬 Re-animate Front' : '🎬 Animate Front'}
            </button>
            <button onClick={() => handleDownload(selected)} disabled={downloading}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2">
              {downloading ? 'Rendering...' : '⬇ Download PNG'}
            </button>
            {selected.video_url && (
              <button onClick={() => handleDownloadVideo(selected)}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
                ⬇ Download MP4 (animated)
              </button>
            )}
            <button onClick={() => makeVariant(selected)}
              className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
              ✦ New card for this character
            </button>
            <button onClick={() => openEdit(selected)} className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-2 text-sm font-semibold mt-2">Edit Card</button>
            <button onClick={() => deleteCard(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-2">Delete Card</button>
            <button onClick={() => setSelected(null)} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">Close</button>
          </div>
        </div>
      )}

      {/* ANIMATE MODAL */}
      {showAnimate && selected && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-5 z-[70]">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg">
            <h2 className="font-bold text-lg mb-2">Animate Card Front</h2>
            <p className="text-xs text-gray-500 mb-3">
              Brings the front art to life. Takes 1-2 minutes and costs considerably more than an image.
            </p>

            <img src={selected.image_url} alt="" className="w-24 rounded-lg mb-3" />

            <label className="block text-xs text-gray-400 mb-1">Motion Prompt</label>
            <textarea value={animPrompt} onChange={e => setAnimPrompt(e.target.value)} rows={3}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            <label className="block text-xs text-gray-400 mb-1">Video Model</label>
            <select value={animModel} onChange={e => setAnimModel(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              {VIDEO_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>

            <label className="block text-xs text-gray-400 mb-1">Length</label>
            <select value={animDuration} onChange={e => setAnimDuration(parseInt(e.target.value))}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value={5}>5 seconds</option>
              <option value={8}>8 seconds</option>
              <option value={10}>10 seconds (2x cost)</option>
            </select>

            <label className="block text-xs text-gray-400 mb-1">Resolution</label>
            <select value={animRes} onChange={e => setAnimRes(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-purple-500">
              <option value="720p">720p</option>
              <option value="1080p">1080p (costs more)</option>
            </select>

            <div className="flex gap-2">
              <button onClick={() => setShowAnimate(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
              <button onClick={runAnimate} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-3 font-semibold">Animate</button>
            </div>
          </div>
        </div>
      )}

      {/* EXPANDED — full screen card */}
      {selected && expanded && (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4 z-[60]" onClick={() => setExpanded(false)}>
          <div className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            {sideToggle()}
            {side === 'front' && viewToggle()}
            <button onClick={() => setExpanded(false)} className="block w-full text-left">
              {side === 'front' ? cardFront(selected, true, view === 'animated') : cardBack(selected, true)}
            </button>
            <button onClick={() => handleDownload(selected)} disabled={downloading}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-4">
              {downloading ? 'Rendering...' : '⬇ Download PNG'}
            </button>
            <button onClick={() => setExpanded(false)}
              className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
