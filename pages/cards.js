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

// Models that accept referenceImageUrl (I2I / edit)
const EDIT_IMAGE_MODELS = [
  { id: 'alibaba/wan-2.7-pro/image-edit', label: 'Wan 2.7 Pro Edit (default)' },
  { id: 'bytedance/seedream-v5.0-pro/edit', label: 'Seedream 5 Pro Edit' },
  { id: 'xai/grok-imagine-image/edit', label: 'Grok Imagine Edit' },
]

const familyOf = (id) => (IMAGE_MODELS.find(m => m.id === id) || IMAGE_MODELS[0]).family

const VIDEO_MODELS = [
  { id: 'alibaba/wan-2.6/image-to-video', label: 'Wan 2.6 (5-15s) 🔊' },
  { id: 'atlascloud/wan-2.2-turbo/image-to-video', label: 'Wan 2.2 Turbo (fast, 5s)' },
  { id: 'xai/grok-imagine-video-v1.5/image-to-video', label: 'Grok Imagine (up to 1080p) 🔊' },
  { id: 'alibaba/wan-2.7/image-to-video', label: 'Wan 2.7 (start/end/continue) 🔊' },
  { id: 'alibaba/wan-2.2-spicy/image-to-video-lora', label: 'Wan 2.2 Spicy (LoRA support)' },
  { id: 'atlascloud/wan-2.2-turbo-spicy/image-to-video', label: 'Wan 2.2 Spicy' },
  { id: 'atlascloud/wan-2.7-spicy/image-to-video', label: 'Wan 2.7 Spicy 🔊' },
  { id: 'bytedance/seedance-v1.5-pro/image-to-video-spicy', label: 'Seedance Spicy I2V 🔊' },
]

const ART_STYLES = [
  { value: '', label: 'None (use prompt as-is)' },
  // Non-realistic / game styles
  { value: 'Fortnite style 3D character render, Epic Games Fortnite aesthetic, stylized cartoony proportions, clean cel-shaded look, bold outlines, vibrant saturated colors, simplified facial features, game character art, not photorealistic, not realistic skin, Unreal Engine game render style', label: 'Fortnite Style (non-realistic)' },
  { value: 'stylized 3D game character, anime-influenced proportions, smooth plastic skin shader, bright saturated palette, clean game-ready render, not photorealistic', label: 'Stylized 3D Game Character' },
  { value: 'anime illustration, clean line art, cel shading, vibrant colors, detailed eyes, not photorealistic, 2D anime style', label: 'Anime Illustration' },
  { value: 'comic book illustration, bold ink outlines, flat color fills, dynamic pose, graphic novel style, not photorealistic', label: 'Comic Book' },
  // Realistic photo styles
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

// Click-to-add prompt extras. Single-select per category; order is fixed for natural prompts.
const PROMPT_EXTRA_CATEGORIES = [
  {
    id: 'skin',
    label: 'Skin',
    options: [
      { id: 'fair', label: 'Fair', text: 'fair light skin' },
      { id: 'porcelain', label: 'Porcelain', text: 'porcelain pale skin' },
      { id: 'light_tan', label: 'Light tan', text: 'light tan skin' },
      { id: 'olive', label: 'Olive', text: 'olive skin tone' },
      { id: 'golden', label: 'Golden', text: 'golden sun-kissed skin' },
      { id: 'medium_brown', label: 'Medium brown', text: 'medium brown skin' },
      { id: 'deep_brown', label: 'Deep brown', text: 'deep rich brown skin' },
      { id: 'ebony', label: 'Ebony', text: 'ebony dark skin' },
    ],
  },
  {
    id: 'hair_color',
    label: 'Hair color',
    options: [
      { id: 'blonde', label: 'Blonde', text: 'blonde hair' },
      { id: 'platinum', label: 'Platinum', text: 'platinum blonde hair' },
      { id: 'brunette', label: 'Brunette', text: 'brunette brown hair' },
      { id: 'black', label: 'Black', text: 'jet black hair' },
      { id: 'red', label: 'Red', text: 'red hair' },
      { id: 'auburn', label: 'Auburn', text: 'auburn hair' },
      { id: 'pink', label: 'Pink', text: 'pink hair' },
      { id: 'silver', label: 'Silver', text: 'silver white hair' },
      { id: 'blue', label: 'Blue', text: 'blue hair' },
    ],
  },
  {
    id: 'hair_style',
    label: 'Hair style',
    options: [
      { id: 'long_straight', label: 'Long straight', text: 'long straight hair' },
      { id: 'long_wavy', label: 'Long wavy', text: 'long wavy hair' },
      { id: 'long_curly', label: 'Long curly', text: 'long curly hair' },
      { id: 'shoulder', label: 'Shoulder length', text: 'shoulder-length hair' },
      { id: 'bob', label: 'Bob', text: 'short bob haircut' },
      { id: 'ponytail', label: 'Ponytail', text: 'high ponytail' },
      { id: 'bun', label: 'Bun', text: 'elegant bun hairstyle' },
      { id: 'braids', label: 'Braids', text: 'braided hair' },
      { id: 'messy', label: 'Messy', text: 'messy tousled hair' },
    ],
  },
  {
    id: 'eye_color',
    label: 'Eye color',
    options: [
      { id: 'brown', label: 'Brown', text: 'brown eyes' },
      { id: 'hazel', label: 'Hazel', text: 'hazel eyes' },
      { id: 'green', label: 'Green', text: 'green eyes' },
      { id: 'blue', label: 'Blue', text: 'blue eyes' },
      { id: 'gray', label: 'Gray', text: 'gray eyes' },
      { id: 'amber', label: 'Amber', text: 'amber eyes' },
      { id: 'violet', label: 'Violet', text: 'violet eyes' },
    ],
  },
  {
    id: 'body_type',
    label: 'Body type',
    options: [
      { id: 'slim', label: 'Slim', text: 'slim athletic build' },
      { id: 'athletic', label: 'Athletic', text: 'athletic toned physique' },
      { id: 'curvy', label: 'Curvy', text: 'curvy hourglass figure' },
      { id: 'voluptuous', label: 'Voluptuous', text: 'voluptuous full figure' },
      { id: 'petite', label: 'Petite', text: 'petite frame' },
      { id: 'tall', label: 'Tall', text: 'tall elegant stature' },
    ],
  },
  {
    id: 'breast_size',
    label: 'Breast size',
    options: [
      { id: 'small', label: 'Small', text: 'small breasts' },
      { id: 'medium', label: 'Medium', text: 'medium breasts' },
      { id: 'large', label: 'Large', text: 'large breasts' },
      { id: 'very_large', label: 'Very large', text: 'very large full breasts' },
    ],
  },
  {
    id: 'hips',
    label: 'Hips',
    options: [
      { id: 'narrow', label: 'Narrow', text: 'narrow hips' },
      { id: 'balanced', label: 'Balanced', text: 'balanced hips' },
      { id: 'wide', label: 'Wide', text: 'wide hips' },
      { id: 'very_wide', label: 'Very wide', text: 'very wide hips and thick thighs' },
    ],
  },
  {
    id: 'card_design',
    label: 'Card design',
    options: [
      { id: 'gold_foil', label: 'Gold foil', text: 'modern gold foil trading card design, fancy gold foil edges, premium collectible card border' },
      { id: 'holographic', label: 'Holographic', text: 'holographic trading card design, iridescent rainbow foil edges, premium collectible border' },
      { id: 'black_luxury', label: 'Black luxury', text: 'black luxury trading card design, matte black frame with silver trim, elegant collectible border' },
      { id: 'neon', label: 'Neon', text: 'neon cyber trading card design, glowing neon edge accents, futuristic collectible border' },
      { id: 'rose_gold', label: 'Rose gold', text: 'rose gold trading card design, soft metallic rose-gold foil edges, glamorous collectible border' },
      { id: 'minimal_white', label: 'Minimal white', text: 'clean minimal white trading card design, thin elegant border, modern collectible layout' },
      { id: 'ornate', label: 'Ornate', text: 'ornate baroque trading card design, intricate decorative gold frame, classic collectible border' },
    ],
  },
]

const PROMPT_EXTRA_ORDER = [
  'skin', 'hair_color', 'hair_style', 'eye_color', 'body_type', 'breast_size', 'hips', 'card_design',
]

const CARD_TEXT_SIZES = [
  { id: 'small', label: 'Small', text: 'small text' },
  { id: 'medium', label: 'Medium', text: 'medium-sized text' },
  { id: 'large', label: 'Large', text: 'large bold text' },
]
const CARD_TEXT_POS = [
  { id: 'top', label: 'Top', text: 'at the top of the card' },
  { id: 'bottom', label: 'Bottom', text: 'at the bottom of the card' },
  { id: 'center', label: 'Center', text: 'centered on the card' },
]
const CARD_TEXT_FONTS = [
  { id: 'sans', label: 'Clean sans', text: 'clean sans-serif lettering' },
  { id: 'serif', label: 'Elegant serif', text: 'elegant serif lettering' },
  { id: 'script', label: 'Script', text: 'cursive script lettering' },
  { id: 'block', label: 'Bold block', text: 'bold block lettering' },
]
const CARD_TEXT_COLORS = [
  { id: 'white', label: 'White', text: 'white' },
  { id: 'gold', label: 'Gold', text: 'gold' },
  { id: 'black', label: 'Black', text: 'black' },
  { id: 'pink', label: 'Pink', text: 'hot pink' },
  { id: 'silver', label: 'Silver', text: 'silver' },
]

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ultra elite', 'after hours', 'mint']

// stat value ranges per rarity, used when creating a variant
const RARITY_STAT_RANGE = {
  common:    [40, 62],
  uncommon:  [52, 72],
  rare:      [64, 82],
  epic:      [76, 90],
  legendary: [86, 96],
  'ultra elite': [94, 100],
  mint:      [98, 100],
}

// rarities that carry no ratings at all
const STATLESS = ['after hours']
const isStatless = (r) => STATLESS.includes(String(r || '').toLowerCase())
const isMint = (r) => String(r || '').toLowerCase() === 'mint'

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
  mint: { edge: 'edge-mint', glow: 'glow-mint', badge: 'badge-mint', foil: 'foil-ultra', holo: true, code: 'MINT' },
}

const treatOf = (r) => TREAT[r] || TREAT.common

const rarityLabel = (r) =>
  String(r || 'common').split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

const STANDARD_LABELS = ['Star Power', 'Physique', 'Allure', 'Charisma']

const EDITION_QTY_OPTIONS = [1, 5, 10, 25, 50, 100, 150, 200, 250, 300, 350, 500, 700, 1000, 2000]

// Default print run by rarity (dropdown still shows numbers only)
const RARITY_EDITION_DEFAULTS = {
  common: 2000,
  uncommon: 1000,
  rare: 500,
  epic: 350,
  legendary: 250,
  'ultra elite': 150,
  'after hours': 50,
  mint: 1,
}
const editionDefaultFor = (rarity) => {
  const key = String(rarity || 'common').toLowerCase()
  return RARITY_EDITION_DEFAULTS[key] ?? 300
}
// Dropdown shows number + which rarities use it as default
const editionOptionLabel = (n) => {
  const num = Number(n)
  const rarities = Object.entries(RARITY_EDITION_DEFAULTS)
    .filter(([, v]) => v === num)
    .map(([k]) => rarityLabel(k))
  if (num === 1) return '1 · Mint (1 of 1)'
  if (rarities.length) return `${num} · ${rarities.join(', ')} default`
  return String(num)
}

const emptyDraft = () => ({
  name: '', title: '', description: '', flavor_text: '', rarity: 'common',
  stats: rollStats(STANDARD_LABELS, 'common'),
  image_prompt: '', back_image_prompt: '',
  edition_size: editionDefaultFor('common'),
  series_name: '',
})

export default function Cards() {
  const router = useRouter()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('date_desc')
  const [search, setSearch] = useState('')
  const [rarityFilter, setRarityFilter] = useState('all')
  const [pageMode, setPageMode] = useState('cards') // cards | series
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [seriesFilter, setSeriesFilter] = useState('all') // all | none | series name

  const [selected, setSelected] = useState(null)
  const [side, setSide] = useState('front')
  const [expanded, setExpanded] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [concept, setConcept] = useState('')
  const [conceptRarity, setConceptRarity] = useState('random')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState(null)
  // 'generate' = AI prompts | 'gallery' = pick existing gallery images
  const [createArtSource, setCreateArtSource] = useState('generate')
  const [draftFrontUrl, setDraftFrontUrl] = useState('')
  const [draftBackUrl, setDraftBackUrl] = useState('')
  // gallery image/video picker overlay
  const [galleryPicker, setGalleryPicker] = useState(null) // 'create-front' | 'create-back' | 'edit-front' | 'edit-back' | 'attach-video' | 'char-media' | null
  const [galleryPool, setGalleryPool] = useState([])
  const [galleryPoolLoading, setGalleryPoolLoading] = useState(false)
  const [galleryPoolSearch, setGalleryPoolSearch] = useState('')
  const [posterBusy, setPosterBusy] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  const [negative, setNegative] = useState(DEFAULT_NEGATIVE)
  const [size, setSize] = useState('768*1024')
  const [artStylesList, setArtStylesList] = useState(ART_STYLES)
  const [artStyle, setArtStyle] = useState(
    (ART_STYLES.find(s => /fortnite/i.test(s.label)) || ART_STYLES[1]).value
  )
  // prompt extras: categoryId -> optionId (or null)
  const [promptExtras, setPromptExtras] = useState({})
  const [cardTextOn, setCardTextOn] = useState(false)
  const [cardTextContent, setCardTextContent] = useState('')
  const [cardTextSize, setCardTextSize] = useState('medium')
  const [cardTextPos, setCardTextPos] = useState('bottom')
  const [cardTextFont, setCardTextFont] = useState('sans')
  const [cardTextColor, setCardTextColor] = useState('white')
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
  const [animPrompt, setAnimPrompt] = useState('smooth natural motion, eyes blinking naturally')
  const [animDuration, setAnimDuration] = useState(5)
  const [animRes, setAnimRes] = useState('720p')
  const [animModel, setAnimModel] = useState('alibaba/wan-2.6/image-to-video')
  const [animating, setAnimating] = useState(false)
  const [view, setView] = useState('static')
  const [touchStartX, setTouchStartX] = useState(null)
  const [charMedia, setCharMedia] = useState([])
  const [mediaCounts, setMediaCounts] = useState({}) // character_name lower -> count
  const [mediaTitle, setMediaTitle] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('image')
  const [mediaUnlock, setMediaUnlock] = useState('shop')
  const [mediaCost, setMediaCost] = useState('100')
  const [mediaEdition, setMediaEdition] = useState('300')
  // inline edit for an existing character_media row
  const [editingMediaId, setEditingMediaId] = useState(null)
  const [editMediaTitle, setEditMediaTitle] = useState('')
  const [editMediaUnlock, setEditMediaUnlock] = useState('shop')
  const [editMediaEdition, setEditMediaEdition] = useState('300')
  const [editMediaType, setEditMediaType] = useState('image')
  const [editMediaBusy, setEditMediaBusy] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [showCreateMedia, setShowCreateMedia] = useState(false)
  const [cmMode, setCmMode] = useState('t2i') // t2i | i2i_front | i2i_back | i2v_front | i2v_back
  const [cmPrompt, setCmPrompt] = useState('')
  const [cmSeed, setCmSeed] = useState('')
  const [cmNeg, setCmNeg] = useState(DEFAULT_NEGATIVE)
  const [cmTitle, setCmTitle] = useState('')
  const [cmProgress, setCmProgress] = useState('')
  const [cmBusy, setCmBusy] = useState(false)
  const [cmDuration, setCmDuration] = useState(5)
  const [cmModel, setCmModel] = useState(VIDEO_MODELS[0].id)
  const [cmImageModel, setCmImageModel] = useState(IMAGE_MODELS[0].id)
  const [cmEditModel, setCmEditModel] = useState(EDIT_IMAGE_MODELS[0].id)

  useEffect(() => {
    loadCards()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('user_settings')
          .select('art_styles, default_art_style')
          .eq('id', 1)
          .maybeSingle()
        const styles = Array.isArray(data?.art_styles) && data.art_styles.length
          ? data.art_styles.map(s => ({ label: String(s.label || ''), value: String(s.value ?? '') }))
          : ART_STYLES
        setArtStylesList(styles)
        const def = data?.default_art_style
        if (def != null && styles.some(s => s.value === def)) setArtStyle(def)
        else {
          const ft = styles.find(s => /fortnite/i.test(s.label))
          if (ft) setArtStyle(ft.value)
        }
      } catch (e) {
        console.warn('art styles load', e)
      }
    })()
  }, [])

  // Keep card detail / edit open across refresh via ?card=&edit=
  useEffect(() => {
    if (loading || !router.isReady) return
    if (!cards.length) return
    const cardId = router.query.card
    if (!cardId || typeof cardId !== 'string') return
    const found = cards.find(c => String(c.id) === String(cardId))
    if (!found) return
    const wantEdit = router.query.edit === '1'
    if (wantEdit) {
      setEditing(prev => (prev && prev.id === found.id ? prev : { ...found, stats: normalizeStats(found) }))
      setEditNegative(found.negative_prompt || DEFAULT_NEGATIVE)
      setSelected(null)
    } else {
      setSelected(prev => (prev && prev.id === found.id ? { ...prev, ...found } : found))
      setSide('front')
    }
  }, [loading, cards, router.isReady, router.query.card, router.query.edit])

  const onCardTouchStart = (e) => {
    setTouchStartX(e.changedTouches?.[0]?.clientX ?? e.clientX)
  }
  const onCardTouchEnd = (e) => {
    if (touchStartX == null) return
    const endX = e.changedTouches?.[0]?.clientX ?? e.clientX
    const dx = endX - touchStartX
    setTouchStartX(null)
    if (Math.abs(dx) < 50) return
    // swipe left -> back, swipe right -> front
    if (dx < 0) setSide('back')
    else setSide('front')
  }

  const loadCards = async () => {
    const { data } = await supabase.from('cards').select('*').order('created_at', { ascending: false })
    setCards(data || [])

    // counts of character_media per character_name (case-insensitive key)
    const { data: allMedia } = await supabase
      .from('character_media')
      .select('id, character_name, card_id, type, published')
    const counts = {}
    for (const m of allMedia || []) {
      const key = String(m.character_name || '').trim().toLowerCase()
      if (!key) continue
      counts[key] = (counts[key] || 0) + 1
    }
    setMediaCounts(counts)
    setLoading(false)
  }

  const openCard = async (card) => {
    setSelected(card)
    setSide('front')
    setExpanded(false)
    setView('static')
    setMediaTitle('')
    setMediaUrl('')
    try {
      const q = { ...router.query, card: card.id }
      delete q.edit
      router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true })
    } catch {}
    // media linked by character name so all rarity variants share it
    const { data } = await supabase
      .from('character_media')
      .select('*')
      .ilike('character_name', card.name || '')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    setCharMedia(data || [])
  }

  const syncCardQuery = (cardId, edit = false) => {
    const q = { ...router.query }
    if (cardId) q.card = cardId
    else delete q.card
    if (edit) q.edit = '1'
    else delete q.edit
    try {
      router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true })
    } catch {}
  }

  const closeSelected = () => {
    setSelected(null)
    setExpanded(false)
    setEditing(null)
    syncCardQuery(null, false)
  }

  const addCharMedia = async () => {
    if (!selected || mediaBusy) return
    if (!mediaUrl.trim()) { alert('Paste a media URL'); return }
    setMediaBusy(true)
    const row = {
      character_name: selected.name,
      card_id: selected.id,
      type: mediaType,
      url: mediaUrl.trim(),
      title: mediaTitle.trim() || null,
      unlock_method: mediaUnlock,
      token_cost: 0, // price set in Shop
      edition_size: parseInt(mediaEdition) || 300,
      published: false,
    }
    try {
      const data = await insertWithRetry('character_media', row, 10)
      // Move source gallery file into +media (or leave if not from gallery)
      await claimGalleryMediaByUrl(row.url, 'plusMedia')
      setCharMedia(prev => [data, ...prev])
      const key = String(selected.name || '').trim().toLowerCase()
      if (key) setMediaCounts(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }))
      setMediaTitle('')
      setMediaUrl('')
    } catch (err) {
      enqueuePending({ table: 'character_media', row, plusMedia: true })
      alert(
        'Link save failed after retries — queued to retry on next open.\n\n' +
        (err?.message || err) +
        `\n\nFile is safe at:\n${row.url}`
      )
    }
    setMediaBusy(false)
  }

  const toggleMediaPublish = async (row) => {
    const next = !row.published
    const { error } = await supabase.from('character_media').update({ published: next }).eq('id', row.id)
    if (error) { alert(error.message); return }
    setCharMedia(prev => prev.map(m => m.id === row.id ? { ...m, published: next } : m))
  }

  const deleteCharMedia = async (row) => {
    const who = row.character_name || selected?.name || 'this character'
    const title = row.title || row.type || 'this media'
    const live = !!row.published
    const ok = confirm(
      '⚠️ Delete card +media?\n\n' +
      `"${title}" is linked to ${who}.\n` +
      (live
        ? 'Status: LIVE in the game — players may already own or draw this item.\n\n'
        : 'Status: Off (not published) — still tied to the card character.\n\n') +
      'Removing it frees the edition slot. The file may remain in Gallery/+media until deleted there.\n\n' +
      'Delete this link anyway?'
    )
    if (!ok) return
    const { error } = await supabase.from('character_media').delete().eq('id', row.id)
    if (error) { alert(error.message); return }
    setCharMedia(prev => prev.filter(m => m.id !== row.id))
    if (editingMediaId === row.id) setEditingMediaId(null)
    const key = String(selected?.name || row.character_name || '').trim().toLowerCase()
    if (key) setMediaCounts(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 1) - 1) }))
  }

  const startEditCharMedia = (row) => {
    setEditingMediaId(row.id)
    setEditMediaTitle(row.title || '')
    setEditMediaUnlock(row.unlock_method || 'shop')
    setEditMediaEdition(String(row.edition_size || 300))
    setEditMediaType(row.type === 'video' ? 'video' : 'image')
  }

  const cancelEditCharMedia = () => {
    setEditingMediaId(null)
    setEditMediaTitle('')
  }

  const saveEditCharMedia = async () => {
    if (!editingMediaId || editMediaBusy) return
    setEditMediaBusy(true)
    const patch = {
      title: editMediaTitle.trim() || null,
      unlock_method: editMediaUnlock || 'shop',
      edition_size: parseInt(editMediaEdition, 10) || 300,
      type: editMediaType === 'video' ? 'video' : 'image',
    }
    const { error } = await supabase.from('character_media').update(patch).eq('id', editingMediaId)
    setEditMediaBusy(false)
    if (error) { alert(error.message); return }
    setCharMedia(prev => prev.map(m => m.id === editingMediaId ? { ...m, ...patch } : m))
    setEditingMediaId(null)
  }

  const openCreateMedia = () => {
    if (!selected) return
    setCmMode('t2i')
    setCmPrompt(selected.image_prompt || '')
    setCmSeed(selected.seed != null ? String(selected.seed) : '')
    setCmNeg(selected.negative_prompt || DEFAULT_NEGATIVE)
    setCmTitle('')
    setCmProgress('')
    setCmImageModel(selected.image_model || IMAGE_MODELS[0].id)
    setCmModel(VIDEO_MODELS[0].id)
    setCmDuration(5)
    setShowCreateMedia(true)
  }

  // when mode changes, refresh prompt/seed from the chosen side
  const applyCmMode = (mode) => {
    setCmMode(mode)
    if (!selected) return
    if (mode === 't2i' || mode === 'i2v_front' || mode === 'i2i_front') {
      setCmPrompt(selected.image_prompt || selected.video_prompt || '')
      setCmSeed(selected.seed != null ? String(selected.seed) : '')
    } else if (mode === 'i2v_back' || mode === 'i2i_back') {
      setCmPrompt(selected.back_image_prompt || selected.image_prompt || '')
      setCmSeed(selected.back_seed != null ? String(selected.back_seed) : '')
    }
  }

  const saveLinkedMedia = async ({ url, type, title, seed }) => {
    const row = {
      character_name: selected.name,
      card_id: selected.id,
      type,
      url,
      title: title || null,
      unlock_method: mediaUnlock || 'shop',
      token_cost: 0, // price set in Shop
      edition_size: parseInt(mediaEdition) || 300,
      published: false,
    }
    try {
      const data = await insertWithRetry('character_media', row, 10)
      // Ensure gallery copy (if any) lives under +media — not unfiled / random folders
      await claimGalleryMediaByUrl(url, 'plusMedia')
      // Also mirror into gallery_media under +media so creator can find it there
      try {
        const { data: existingGal } = await supabase.from('gallery_media').select('id').eq('url', url).limit(1).maybeSingle()
        if (!existingGal) {
          const galRow = {
            type: type || 'image',
            url,
            prompt: title || `${selected.name} media`,
            model: 'card-linked',
            seed: seed ?? null,
          }
          const savedGal = await insertWithRetry('gallery_media', galRow, 10)
          if (savedGal?.id) {
            const folderId = await ensurePlusMediaFolderId()
            await supabase.from('folder_items').upsert(
              { source: 'gallery_media', item_key: 'gal_' + savedGal.id, folder_id: folderId },
              { onConflict: 'source,item_key' }
            )
          }
        } else {
          await claimGalleryMediaByUrl(url, 'plusMedia')
        }
      } catch (e) {
        console.warn('gallery mirror for linked media', e)
        enqueuePending({ table: 'gallery_media', row: { type: type || 'image', url, prompt: title || null, model: 'card-linked' }, plusMedia: true })
      }
      setCharMedia(prev => [data, ...prev])
      const key = String(selected.name || '').trim().toLowerCase()
      if (key) setMediaCounts(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }))
      return data
    } catch (lastErr) {
      enqueuePending({ table: 'character_media', row, plusMedia: true })
      throw new Error(
        (lastErr?.message || 'save failed') +
        `\n\nQueued for retry on next open. File is safe:\n${url}`
      )
    }
  }

  const runCreateMedia = async () => {
    if (!selected || cmBusy) return
    setCmBusy(true)
    setCmProgress('Starting...')
    try {
      if (cmMode === 't2i') {
        if (!cmPrompt.trim()) { alert('Prompt required'); setCmBusy(false); return }
        setCmProgress('Generating image (T2I)...')
        const fam = familyOf(cmImageModel)
        const payload = { model: cmImageModel, prompt: cmPrompt }
        if (fam === 'grok') {
          payload.aspectRatio = '2:3'
          payload.resolution = '2k'
        } else if (fam === 'seedream') {
          payload.size = '1328*1776'
          payload.thinking = 'disabled'
        } else if (fam === 'schnell') {
          payload.size = '768*1024'
          payload.seed = cmSeed ? parseInt(cmSeed) : undefined
          payload.negativePrompt = cmNeg
        } else {
          payload.size = '768*1024'
          payload.seed = cmSeed ? parseInt(cmSeed) : undefined
          payload.negativePrompt = cmNeg
          payload.guidance = guidance
          payload.steps = steps
        }
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!data.imageUrl) throw new Error(data.error || 'image failed')
        setCmProgress('Linking to character...')
        await saveLinkedMedia({
          url: data.imageUrl,
          type: 'image',
          title: cmTitle || `${selected.name} media`,
          seed: data.seed ?? (cmSeed ? parseInt(cmSeed) : null),
        })
      } else if (cmMode === 'i2i_front' || cmMode === 'i2i_back') {
        if (!cmPrompt.trim()) { alert('Edit prompt required'); setCmBusy(false); return }
        const src = cmMode === 'i2i_back' ? selected.back_image_url : selected.image_url
        if (!src) throw new Error(cmMode === 'i2i_back' ? 'No back image on this card' : 'No front image on this card')
        setCmProgress('Editing image (I2I)...')
        const payload = {
          model: cmEditModel,
          prompt: cmPrompt,
          referenceImageUrl: src,
          seed: cmSeed ? parseInt(cmSeed) : undefined,
          negativePrompt: cmNeg,
        }
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!data.imageUrl) throw new Error(data.error || 'edit failed')
        setCmProgress('Linking to character...')
        await saveLinkedMedia({
          url: data.imageUrl,
          type: 'image',
          title: cmTitle || `${selected.name} edit`,
          seed: data.seed ?? null,
        })
      } else {
        // I2V from front or back
        const src = cmMode === 'i2v_back' ? selected.back_image_url : selected.image_url
        if (!src) throw new Error(cmMode === 'i2v_back' ? 'No back image on this card' : 'No front image on this card')
        setCmProgress('Generating video (I2V)... 1–2 min')
        const res = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: src,
            prompt: cmPrompt || 'smooth natural motion',
            duration: cmDuration,
            resolution: '720p',
            model: cmModel,
          }),
        })
        const data = await res.json()
        if (!data.videoUrl) throw new Error(data.error || 'video failed')
        setCmProgress('Linking to character...')
        await saveLinkedMedia({
          url: data.videoUrl,
          type: 'video',
          title: cmTitle || `${selected.name} motion`,
          seed: null,
        })
      }
      setShowCreateMedia(false)
      setCmProgress('')
      alert('Media created and linked to this character.')
    } catch (err) {
      alert('Create media failed: ' + err.message)
      setCmProgress('')
    }
    setCmBusy(false)
  }

  const togglePublish = async (card) => {
    const next = !card.published
    const { error } = await supabase.from('cards').update({ published: next }).eq('id', card.id)
    if (error) { alert('Publish failed: ' + error.message); return }
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, published: next } : c))
    setSelected(prev => prev && prev.id === card.id ? { ...prev, published: next } : prev)
  }

  const saveEditionSize = async () => {
    if (!selected) return
    const rarity = String(selected.rarity || '').toLowerCase()
    const size = rarity === 'mint'
      ? 1
      : Math.max(1, parseInt(selected.edition_size, 10) || editionDefaultFor(selected.rarity))
    const { error } = await supabase.from('cards').update({ edition_size: size }).eq('id', selected.id)
    if (error) { alert('Could not save edition size: ' + error.message); return }
    setCards(prev => prev.map(c => c.id === selected.id ? { ...c, edition_size: size } : c))
    setSelected(prev => prev ? { ...prev, edition_size: size } : prev)
    alert(`Edition size set to ${size}. Shop will allow up to ${size} copies of this card.`)
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
        setDraft({
          ...data.card,
          rarity,
          stats: rollStats(labels, rarity),
          edition_size: editionDefaultFor(rarity),
        })
      }
      else alert('Error: ' + (data.error || 'could not draft card'))
    } catch (err) { alert('Error: ' + err.message) }
    setDrafting(false)
  }

  const withStyle = (base, style) => (!style ? base : `${base}, ${style}`)
  const BACK_FRAMING = 'subject in the upper two-thirds of the frame, head near the top, open empty space in the bottom third for text, do not place important details in the lower third'
  const withBackFraming = (base) => `${base}, ${BACK_FRAMING}`

  const togglePromptExtra = (catId, optId) => {
    setPromptExtras(prev => {
      const next = { ...prev }
      if (next[catId] === optId) delete next[catId]
      else next[catId] = optId
      return next
    })
  }

  const clearPromptExtras = () => {
    setPromptExtras({})
    setCardTextOn(false)
    setCardTextContent('')
  }

  const buildCardTextFragment = () => {
    if (!cardTextOn || !cardTextContent.trim()) return ''
    const size = CARD_TEXT_SIZES.find(s => s.id === cardTextSize)?.text || 'medium-sized text'
    const pos = CARD_TEXT_POS.find(s => s.id === cardTextPos)?.text || 'at the bottom of the card'
    const font = CARD_TEXT_FONTS.find(s => s.id === cardTextFont)?.text || 'clean sans-serif lettering'
    const color = CARD_TEXT_COLORS.find(s => s.id === cardTextColor)?.text || 'white'
    return `${size} reading "${cardTextContent.trim()}" in ${color} ${font} ${pos}`
  }

  // base prompt + physical attrs + card design + optional text → logical order
  const composePromptWithExtras = (base) => {
    const parts = []
    const baseTrim = String(base || '').trim()
    if (baseTrim) parts.push(baseTrim)
    for (const catId of PROMPT_EXTRA_ORDER) {
      const optId = promptExtras[catId]
      if (!optId) continue
      const cat = PROMPT_EXTRA_CATEGORIES.find(c => c.id === catId)
      const opt = cat?.options?.find(o => o.id === optId)
      if (opt?.text) parts.push(opt.text)
    }
    const textFrag = buildCardTextFragment()
    if (textFrag) parts.push(textFrag)
    return parts.join(', ')
  }

  // When using stylized / game styles, push the model away from photorealism
  const STYLIZED_NEG =
    'photorealistic, photo, real human, realistic skin pores, DSLR photo, 8k photo, hyperrealistic, uncanny valley'
  const isStylizedArt = (style) =>
    /fortnite|stylized|anime|comic book|not photorealistic|cel-?shad/i.test(String(style || ''))

  const genImage = async (imgPrompt, seedVal, neg, sz, style, modelId) => {
    const useModel = modelId || imageModel
    const fam = familyOf(useModel)
    const useNeg = isStylizedArt(style)
      ? [neg || DEFAULT_NEGATIVE, STYLIZED_NEG].filter(Boolean).join(', ')
      : (neg || DEFAULT_NEGATIVE)

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
      payload.negativePrompt = useNeg
    } else {
      // flux / z-image
      payload.size = sz || '768*1024'
      payload.seed = seedVal || undefined
      payload.negativePrompt = useNeg
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


  // --- claim gallery files when linked to cards / character media ---
  // mode 'card': remove gallery_media row (URL stays on card → not orphaned)
  // mode 'plusMedia': keep row, put in +media folder (character extra content)
  const ensurePlusMediaFolderId = async () => {
    const { data: folders } = await supabase.from('gallery_folders').select('id, name')
    let folder = (folders || []).find(f => String(f.name || '').trim().toLowerCase() === '+media')
    if (!folder) {
      const { data: created, error } = await supabase
        .from('gallery_folders')
        .insert([{ name: '+media' }])
        .select()
        .single()
      if (error) throw new Error('Could not create +media folder: ' + error.message)
      folder = created
    }
    return folder.id
  }

  // Delete a storage object by public URL (posters / thumbs / unused replaces)
  const deleteStorageByUrl = async (url) => {
    if (!url) return
    try {
      const f = String(url).split('/character-images/')[1]
      if (!f) return
      const path = f.split('?')[0]
      if (!path) return
      await supabase.storage.from('character-images').remove([path])
    } catch (err) {
      console.warn('deleteStorageByUrl', err)
    }
  }

  // When a card front/back/video is replaced: keep the old MAIN file, put it in Gallery.
  // Derivative files (posters, thumbs) should be deleted — not left as orphans.
  const releaseCardMediaToGallery = async (url, { type = 'image', prompt = null, model = 'card-retired' } = {}) => {
    if (!url) return null
    try {
      // Posters / banner thumbs are never "content" — delete instead of parking in gallery
      const path = String(url).split('/character-images/')[1]?.split('?')[0] || ''
      if (path.startsWith('thumb_') || path.startsWith('poster_') || path.includes('/thumb') || path.includes('/poster')) {
        await deleteStorageByUrl(url)
        return null
      }

      const { data: existing } = await supabase
        .from('gallery_media')
        .select('id, url, thumbnail_url, poster_url')
        .eq('url', url)
        .limit(1)
        .maybeSingle()
      if (existing?.id) {
        // Drop derivative thumbs for this row if present
        if (existing.thumbnail_url && existing.thumbnail_url !== url) await deleteStorageByUrl(existing.thumbnail_url)
        if (existing.poster_url && existing.poster_url !== url) await deleteStorageByUrl(existing.poster_url)
        return existing
      }

      const row = {
        type: type === 'video' ? 'video' : 'image',
        url,
        prompt: prompt || 'Retired from card',
        model: model || 'card-retired',
      }
      try {
        return await insertWithRetry('gallery_media', row, 10)
      } catch (e) {
        enqueuePending({ table: 'gallery_media', row })
        console.warn('releaseCardMediaToGallery queued', e)
        return null
      }
    } catch (err) {
      console.warn('releaseCardMediaToGallery', err)
      return null
    }
  }

  const claimGalleryMediaByUrl = async (url, mode = 'card') => {
    if (!url) return
    try {
      const { data: rows } = await supabase
        .from('gallery_media')
        .select('id, url, type, thumbnail_url, poster_url')
        .eq('url', url)
      if (!rows?.length) return

      if (mode === 'plusMedia') {
        const folderId = await ensurePlusMediaFolderId()
        for (const r of rows) {
          const key = 'gal_' + r.id
          // clear any other folder assignment first
          await supabase.from('folder_items').delete().eq('item_key', key)
          await supabase.from('folder_items').delete().eq('item_key', String(r.id))
          await supabase.from('folder_items').upsert(
            { source: 'gallery_media', item_key: key, folder_id: folderId },
            { onConflict: 'source,item_key' }
          )
        }
        return
      }

      // mode === 'card': leave gallery; keep main URL on card; delete unused thumbs/posters
      for (const r of rows) {
        if (r.thumbnail_url && r.thumbnail_url !== r.url) await deleteStorageByUrl(r.thumbnail_url)
        if (r.poster_url && r.poster_url !== r.url) await deleteStorageByUrl(r.poster_url)
        const key = 'gal_' + r.id
        await supabase.from('folder_items').delete().eq('item_key', key)
        await supabase.from('folder_items').delete().eq('item_key', String(r.id))
        await supabase.from('folder_items').delete().eq('source', 'gallery_media').eq('item_key', key)
        await supabase.from('gallery_media').delete().eq('id', r.id)
      }
    } catch (err) {
      console.warn('claimGalleryMediaByUrl', err)
    }
  }

  // Persistent queue so failed DB writes retry after refresh / reopen
  const PENDING_KEY = 'ga_pending_media_saves'
  const readPending = () => {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]') } catch { return [] }
  }
  const writePending = (list) => {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(list || [])) } catch {}
  }
  const enqueuePending = (entry) => {
    const list = readPending()
    // dedupe by url + table
    const filtered = list.filter(p => !(p.table === entry.table && p.row?.url === entry.row?.url))
    filtered.push({ ...entry, id: entry.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, attempts: entry.attempts || 0 })
    writePending(filtered)
  }
  const removePending = (id) => {
    writePending(readPending().filter(p => p.id !== id))
  }

  const insertWithRetry = async (table, row, maxAttempts = 10) => {
    let lastErr = null
    for (let i = 0; i < maxAttempts; i++) {
      const { data, error } = await supabase.from(table).insert([row]).select().single()
      if (!error && data) return data
      lastErr = error
      if (error && /duplicate|unique/i.test(error.message || '')) {
        // already there
        if (row.url) {
          const { data: existing } = await supabase.from(table).select('*').eq('url', row.url).limit(1).maybeSingle()
          if (existing) return existing
        }
      }
      await new Promise(r => setTimeout(r, Math.min(4000, 400 * (i + 1))))
    }
    throw lastErr || new Error('insert failed after ' + maxAttempts + ' tries')
  }

  const flushPendingSaves = async () => {
    const list = readPending()
    if (!list.length) return
    const remaining = []
    for (const item of list) {
      try {
        if ((item.attempts || 0) >= 10) {
          console.warn('dropping pending after 10 attempts', item)
          continue
        }
        if (item.table === 'character_media') {
          const data = await insertWithRetry('character_media', item.row, 10)
          if (data && item.row?.url) await claimGalleryMediaByUrl(item.row.url, 'plusMedia')
        } else if (item.table === 'gallery_media') {
          await insertWithRetry('gallery_media', item.row, 10)
          if (item.plusMedia && item.row?.url) await claimGalleryMediaByUrl(item.row.url, 'plusMedia')
        } else {
          remaining.push(item)
          continue
        }
        // success → drop
      } catch (e) {
        remaining.push({ ...item, attempts: (item.attempts || 0) + 1, lastError: e?.message })
      }
    }
    writePending(remaining)
  }

  // Retry queued saves after helpers exist (refresh / reopen)
  useEffect(() => {
    flushPendingSaves().catch(() => {})
  }, [])

  const loadGalleryPool = async (typeFilter = 'image') => {
    setGalleryPoolLoading(true)
    try {
      let rows = []
      let offset = 0
      while (true) {
        let q = supabase
          .from('gallery_media')
          .select('id, url, prompt, type, created_at, thumbnail_url, poster_url')
          .order('created_at', { ascending: false })
          .range(offset, offset + 199)
        // 'all' = images + videos (character media picker)
        if (typeFilter === 'image' || typeFilter === 'video') {
          q = q.eq('type', typeFilter)
        }
        const { data: page, error } = await q
        if (error || !page || page.length === 0) break
        rows = rows.concat(page)
        if (page.length < 200) break
        offset += 200
        if (offset >= 800) break // soft cap for picker UI
      }
      // Fallback: treat .mp4/.webm/.mov as video even if type column is wrong
      rows = rows.map(r => {
        if (r.type === 'video') return r
        const u = String(r.url || '').toLowerCase()
        if (/\.(mp4|webm|mov)(\?|$)/.test(u)) return { ...r, type: 'video' }
        return r
      })
      if (typeFilter === 'video') {
        rows = rows.filter(r => r.type === 'video')
      } else if (typeFilter === 'image') {
        rows = rows.filter(r => r.type !== 'video')
      }
      setGalleryPool(rows)
    } catch (err) {
      console.error(err)
      setGalleryPool([])
    }
    setGalleryPoolLoading(false)
  }

  const openGalleryPicker = async (target) => {
    setGalleryPicker(target)
    setGalleryPoolSearch('')
    let typeFilter = 'image'
    if (target === 'attach-video') typeFilter = 'video'
    // Character media: show images AND animations
    if (target === 'char-media') typeFilter = 'all'
    await loadGalleryPool(typeFilter)
  }

  // Attach any video URL as this card's front animation (+ optional poster)
  const attachFrontAnimation = async (videoUrl, posterUrl = null) => {
    if (!selected?.id || !videoUrl) return
    setAttachBusy(true)
    try {
      const oldVideo = selected.video_url
      const oldPoster = selected.poster_url
      let poster = posterUrl || null
      if (!poster) {
        try {
          if (typeof makePoster === 'function') poster = await makePoster(videoUrl)
        } catch (e) {
          console.warn('poster', e)
        }
      }
      const patch = {
        video_url: videoUrl,
        poster_url: poster || selected.poster_url || null,
      }
      const { error } = await supabase.from('cards').update(patch).eq('id', selected.id)
      if (error) throw new Error(error.message)
      // Old animation → Gallery (not deleted, no longer on card)
      if (oldVideo && oldVideo !== videoUrl) {
        await releaseCardMediaToGallery(oldVideo, {
          type: 'video',
          prompt: selected.video_prompt || `${selected.name || 'Card'} retired animation`,
          model: 'card-retired',
        })
      }
      // Old poster is a derivative — delete (do not orphan)
      if (oldPoster && poster && oldPoster !== poster) {
        await deleteStorageByUrl(oldPoster)
      }
      // New clip leaves gallery — card owns it
      await claimGalleryMediaByUrl(videoUrl, 'card')
      if (poster) await claimGalleryMediaByUrl(poster, 'card')
      setSelected(prev => prev ? { ...prev, ...patch } : prev)
      setCards(prev => prev.map(c => c.id === selected.id ? { ...c, ...patch } : c))
      setView('animated')
      alert('Front animation attached. Previous clip moved to Gallery.')
    } catch (err) {
      alert('Attach failed: ' + err.message)
    }
    setAttachBusy(false)
  }

  // Generate / refresh poster (thumbnail) for the card's current video
  const generateCardPoster = async () => {
    if (!selected?.video_url || !selected?.id) {
      alert('This card has no video yet')
      return
    }
    setPosterBusy(true)
    try {
      const oldPoster = selected.poster_url
      let poster = null
      if (typeof makePoster === 'function') {
        poster = await makePoster(selected.video_url)
      }
      if (!poster) throw new Error('Could not capture a frame (CORS or bad video)')
      const { error } = await supabase.from('cards').update({ poster_url: poster }).eq('id', selected.id)
      if (error) throw new Error(error.message)
      // Delete previous poster file so it does not show up as an orphan
      if (oldPoster && oldPoster !== poster) await deleteStorageByUrl(oldPoster)
      setSelected(prev => prev ? { ...prev, poster_url: poster } : prev)
      setCards(prev => prev.map(c => c.id === selected.id ? { ...c, poster_url: poster } : c))
      alert('Poster saved')
    } catch (err) {
      alert('Poster failed: ' + err.message)
    }
    setPosterBusy(false)
  }

  const applyGalleryPick = async (url, item = null) => {
    if (!galleryPicker || !url) return
    const target = galleryPicker
    setGalleryPicker(null)

    if (target === 'create-front') {
      setDraftFrontUrl(url)
      return
    }
    if (target === 'create-back') {
      setDraftBackUrl(url)
      return
    }
    if (target === 'attach-video') {
      // Optional: front animation vs extra character media only
      const asFront = window.confirm(
        'Use this video as the card FRONT animation?\n\n' +
        'OK = Front animation (replaces current front video)\n' +
        'Cancel = Extra character media only (not the front)'
      )
      if (asFront) {
        await attachFrontAnimation(url, item?.poster_url || null)
      } else if (selected) {
        const title = (item?.prompt || item?.title || '').toString().slice(0, 80) || 'Character video'
        setMediaType('video')
        setMediaUrl(url)
        setMediaTitle(title)
        try {
          await saveLinkedMedia({ url, type: 'video', title })
          alert('Saved as extra character media (not front animation).')
        } catch (err) {
          alert('Could not link media: ' + (err?.message || err))
        }
      }
      return
    }
    if (target === 'char-media') {
      setMediaUrl(url)
      if (item?.type === 'video' || item?.type === 'image') {
        setMediaType(item.type)
      }
      // claim happens when user taps Add (addCharMedia) so cancel is safe
      return
    }
    if (target === 'edit-front' || target === 'edit-back') {
      if (!editing) return
      const which = target === 'edit-front' ? 'front' : 'back'
      const oldUrl = which === 'front' ? editing.image_url : editing.back_image_url
      const patch = which === 'front'
        ? { image_url: url }
        : { back_image_url: url }
      const { error } = await supabase.from('cards').update(patch).eq('id', editing.id)
      if (error) { alert('Save error: ' + error.message); return }
      // Old art → Gallery (unlinked from card, not deleted)
      if (oldUrl && oldUrl !== url) {
        await releaseCardMediaToGallery(oldUrl, {
          type: 'image',
          prompt: (which === 'front' ? editing.image_prompt : editing.back_image_prompt)
            || `${editing.name || 'Card'} retired ${which}`,
          model: 'card-retired',
        })
      }
      // New pick leaves gallery — card owns it
      await claimGalleryMediaByUrl(url, 'card')
      setEditing({ ...editing, ...patch })
      if (selected?.id === editing.id) setSelected(prev => prev ? { ...prev, ...patch } : prev)
      setGalleryPool(prev => (prev || []).filter(g => g.url !== url))
      loadCards()
    }
  }

  const i2iSide = async (which) => {
    if (!editing || regenProgress) return
    const src = which === 'front' ? editing.image_url : editing.back_image_url
    if (!src) { alert('No existing ' + which + ' image to edit'); return }
    const promptText = which === 'front' ? editing.image_prompt : editing.back_image_prompt
    if (!promptText?.trim()) { alert('Add an art prompt describing the change'); return }

    setRegenProgress(`I2I editing ${which}...`)
    try {
      const finalPrompt = which === 'back' ? withBackFraming(promptText) : promptText
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: withStyle(finalPrompt, editStyle),
          referenceImageUrl: src,
          model: 'alibaba/wan-2.7-pro/image-edit',
          negativePrompt: editNegative,
        }),
      })
      const result = await res.json()
      if (!result.imageUrl) { alert('Error: ' + (result.error || 'failed')); setRegenProgress(''); return }

      const oldUrl = src
      const patch = which === 'front'
        ? { image_url: result.imageUrl, seed: result.seed ?? null }
        : { back_image_url: result.imageUrl, back_seed: result.seed ?? null }

      const { error } = await supabase.from('cards').update(patch).eq('id', editing.id)
      if (error) { alert('Save error: ' + error.message); setRegenProgress(''); return }

      // Old front/back → Gallery (not deleted, no longer linked to card)
      if (oldUrl && oldUrl !== result.imageUrl) {
        await releaseCardMediaToGallery(oldUrl, {
          type: 'image',
          prompt: promptText || `${editing.name || 'Card'} retired ${which}`,
          model: 'card-retired',
        })
      }

      setEditing({ ...editing, ...patch })
      if (selected?.id === editing.id) setSelected(prev => prev ? { ...prev, ...patch } : prev)
      setRegenProgress('')
      loadCards()
    } catch (err) {
      alert('Error: ' + err.message)
      setRegenProgress('')
    }
  }

  const makeCardNumber = async (rarity) => {
    const code = treatOf(rarity).code
    const rarityLower = String(rarity || '').toLowerCase()
    // fill the lowest unused number for this rarity
    const { data: existing } = await supabase
      .from('cards')
      .select('card_number')
      .eq('rarity', rarity)

    const used = new Set()
    for (const row of existing || []) {
      // parse MINT-001 or MINT-001 (1 of 1)
      const core = String(row.card_number || '').split(' ')[0]
      const n = parseInt(core.split('-')[1], 10)
      if (!isNaN(n)) used.add(n)
    }

    let n = 1
    while (used.has(n)) n++
    const base = `${code}-${String(n).padStart(3, '0')}`
    // Mint cards are always unique 1-of-1 inserts
    if (rarityLower === 'mint') return `${base} (1 of 1)`
    return base
  }

  const createCard = async () => {
    if (!draft || generating) return

    const fromGallery = createArtSource === 'gallery'
    if (fromGallery) {
      if (!draftFrontUrl) { alert('Pick a front image from the gallery'); return }
    } else {
      if (!draft.image_prompt?.trim()) { alert('Front art prompt is required'); return }
    }

    setGenerating(true)
    try {
      let frontUrl = null
      let frontSeed = null
      let backUrl = null
      let backSeed = null

      const frontComposed = composePromptWithExtras(draft.image_prompt)
      const backComposed = draft.back_image_prompt?.trim()
        ? composePromptWithExtras(draft.back_image_prompt)
        : ''

      if (fromGallery) {
        setProgress('Using gallery images...')
        frontUrl = draftFrontUrl
        backUrl = draftBackUrl || null
      } else {
        setProgress('Generating front art...')
        const front = await genImage(frontComposed || draft.image_prompt, seedInput, negative, size, artStyle)
        if (!front.imageUrl) { alert('Front image error: ' + (front.error || 'failed')); setGenerating(false); setProgress(''); return }
        frontUrl = front.imageUrl
        frontSeed = front.seed

        if (backComposed) {
          setProgress('Generating back art...')
          const back = await genImage(withBackFraming(backComposed), '', negative, size, artStyle)
          if (!back.imageUrl) { alert('Back image error: ' + (back.error || 'failed')); setGenerating(false); setProgress(''); return }
          backUrl = back.imageUrl
          backSeed = back.seed
        }
      }

      setProgress('Saving...')
      const rarity = (draft.rarity || 'common').toLowerCase()
      const cardNumber = await makeCardNumber(rarity)
      // Mint = always 1 of 1; otherwise draft value or rarity default
      const editionSize = rarity === 'mint'
        ? 1
        : (parseInt(draft.edition_size, 10) || editionDefaultFor(rarity))

      const { error } = await supabase.from('cards').insert([{
        name: draft.name || 'Unnamed',
        title: draft.title,
        description: draft.description,
        flavor_text: draft.flavor_text,
        rarity,
        card_number: cardNumber,
        stats: draft.stats || [],
        image_url: frontUrl,
        image_prompt: frontComposed ? withStyle(frontComposed, artStyle) : (draft.image_prompt || null),
        seed: frontSeed,
        back_image_url: backUrl,
        back_image_prompt: backComposed ? withStyle(backComposed, artStyle) : null,
        back_seed: backSeed,
        negative_prompt: fromGallery ? null : negative,
        image_model: fromGallery ? 'gallery' : imageModel,
        edition_size: editionSize,
        series_name: (draft.series_name || '').trim() || null,
      }])
      if (error) { alert('Save error: ' + error.message); setGenerating(false); setProgress(''); return }

      // Gallery → card: leave gallery, card owns the URLs (not orphaned)
      if (fromGallery) {
        await claimGalleryMediaByUrl(frontUrl, 'card')
        if (backUrl) await claimGalleryMediaByUrl(backUrl, 'card')
      }

      setShowCreate(false)
      setDraft(null)
      setConcept('')
      setSeedInput('')
      setNegative(DEFAULT_NEGATIVE)
      setVariantOf(null)
      setCreateArtSource('generate')
      setDraftFrontUrl('')
      setDraftBackUrl('')
      clearPromptExtras()
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
    syncCardQuery(card.id, true)
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
      edition_size: parseInt(editing.edition_size) || 300,
      series_name: (editing.series_name || '').trim() || null,
    }).eq('id', editing.id)
    setSaving(false)
    if (error) { alert('Save error: ' + error.message); return }
    const id = editing.id
    setEditing(null)
    syncCardQuery(id, false)
    loadCards()
    // detail reopens via URL restore when cards refresh
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

    // Old art → Gallery instead of deleting storage
    if (oldUrl && oldUrl !== result.imageUrl) {
      await releaseCardMediaToGallery(oldUrl, {
        type: 'image',
        prompt: promptText || `${editing.name || 'Card'} retired ${which}`,
        model: 'card-retired',
      })
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
    closeSelected()
    loadCards()
  }

  const openAnimate = () => {
    if (!selected?.image_url) return
    setAnimPrompt(selected.video_prompt || 'smooth natural motion, eyes blinking naturally')
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

      // Old animation → Gallery (not deleted, unlinked from card)
      if (oldVideo && oldVideo !== data.videoUrl) {
        await releaseCardMediaToGallery(oldVideo, {
          type: 'video',
          prompt: selected.video_prompt || `${selected.name || 'Card'} retired animation`,
          model: 'card-retired',
        })
      }
      // Old poster is derivative — delete so it is not orphaned
      if (selected.poster_url && poster && selected.poster_url !== poster) {
        await deleteStorageByUrl(selected.poster_url)
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
      edition_size: editionDefaultFor(nextRarity),
      series_name: card.series_name || '',
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
    const mint = isMint(card.rarity)
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
                className="absolute inset-0 w-full h-full object-cover object-top"
              />
            ) : card.image_url ? (
              <img src={card.image_url} alt={card.name} className="absolute inset-0 w-full h-full object-cover object-top" />
            ) : (
              <div className="absolute inset-0 bg-gray-900" />
            )}
            {/* Same overlays as other rarities + mint edge/shimmer */}
            {card.series_name && (
              <span
                className={`absolute top-2 left-2 z-[6] ${big ? 'text-lg' : 'text-sm'} drop-shadow`}
                title={card.series_name}
              >👑</span>
            )}
            <span className={`badge ${t.badge}`}>{card.rarity}</span>
            <div className="nameplate" style={{ zIndex: 8 }}>
              <div className={`font-bold leading-tight truncate tracking-wide ${big ? 'text-2xl pr-28' : 'text-[15px] pr-20'}`}>{card.name}</div>
              {card.title && (
                <div className={`text-gray-300 truncate uppercase tracking-[0.12em] mt-0.5 ${big ? 'text-xs pr-28' : 'text-[10px] pr-20'}`}>{card.title}</div>
              )}
            </div>
            <img
              src="/ga-mark.png"
              alt=""
              className={`absolute bottom-2 right-1.5 z-[20] object-contain drop-shadow-lg pointer-events-none ${big ? 'h-24 w-24' : 'h-16 w-16'}`}
            />
          </div>
        </div>
      </div>
    )
  }

  const cardBack = (card, big = false) => {
    const t = treatOf(card.rarity)
    const mint = isMint(card.rarity)
    const stats = normalizeStats(card)
    return (
      <div className={`card-shell ${t.edge} ${t.glow}`}>
        <div className={`card-inner ${t.foil} ${t.holo ? 'holo' : ''}`}>
          <div className="relative aspect-[3/4]">
            {card.back_image_url ? (
              <img src={card.back_image_url} alt="" className="absolute inset-0 w-full h-full object-cover object-top" />
            ) : (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center text-gray-700 text-[10px]">no back art</div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-[33%] bg-gradient-to-t from-black from-35% via-black/85 to-transparent" />
            <span className={`badge ${t.badge}`}>{card.rarity}</span>

            {card.series_name && (
              <div className={`absolute top-3 inset-x-0 z-[5] text-center px-2`}>
                <span
                  className={`text-black font-bold tracking-[0.18em] uppercase ${big ? 'text-xs' : 'text-[9px]'}`}
                  style={{
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    textShadow: '0 0 4px rgba(255,255,255,0.95), 0 0 10px rgba(255,255,255,0.75), 0 0 18px rgba(255,255,255,0.45)',
                  }}
                >
                  {String(card.series_name).toUpperCase()}
                </span>
              </div>
            )}

            <div className={`absolute inset-0 z-[4] flex flex-col justify-end ${big ? 'p-4' : 'p-2.5'}`}>
              {(card.description || card.flavor_text) && (
                <div
                  className={`mb-2 ${big ? 'p-3' : 'p-2'}`}
                  style={{
                    background: 'rgba(0,0,0,0.72)',
                    borderRadius: 10,
                    boxShadow: '0 0 18px 10px rgba(0,0,0,0.55)',
                  }}
                >
                  {card.description && (
                    <p
                      className={`text-white leading-snug mb-1.5 last:mb-0 ${big ? 'text-sm' : 'text-[10px]'}`}
                      style={{ textAlign: 'justify', textAlignLast: 'center' }}
                    >
                      {card.description}
                    </p>
                  )}
                  {card.flavor_text && (
                    <p
                      className={`italic text-white/80 leading-snug ${big ? 'text-xs' : 'text-[9px]'}`}
                      style={{ textAlign: 'justify', textAlignLast: 'center' }}
                    >
                      "{card.flavor_text}"
                    </p>
                  )}
                </div>
              )}
              {stats.length > 0 && (
                <div className={`${big ? 'space-y-2' : 'space-y-1'} mb-2`}>
                  {stats.map((s, i) => statBar(s.label, s.value, i, big))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/15">
                <span className={`font-mono text-gray-400 tracking-widest ${big ? 'text-[11px]' : 'text-[9px]'}`}>{card.card_number || '—'}</span>
                <span className={`text-gray-500 tracking-widest uppercase ${big ? 'text-[11px]' : 'text-[9px]'}`}>COMP-GA</span>
              </div>
            </div>
            <img
              src="/ga-mark.png"
              alt=""
              className={`absolute bottom-2 right-1.5 z-[20] object-contain drop-shadow-lg pointer-events-none ${big ? 'h-24 w-24' : 'h-16 w-16'}`}
            />
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

  const seriesNames = [...new Set(
    cards.map(c => (c.series_name || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b))

  const seriesStats = seriesNames.map(name => {
    const members = cards.filter(c => (c.series_name || '').trim() === name)
    const byRarity = {}
    let totalPrint = 0
    for (const c of members) {
      const r = (c.rarity || 'common').toLowerCase()
      if (!byRarity[r]) byRarity[r] = { count: 0, print: 0 }
      byRarity[r].count += 1
      const ed = parseInt(c.edition_size) || 500
      byRarity[r].print += ed
      totalPrint += ed
    }
    return {
      name,
      unique: members.length,
      published: members.filter(c => c.published).length,
      totalPrint,
      byRarity,
      members,
    }
  })

  const assignSeries = async (card, seriesName) => {
    const value = (seriesName || '').trim() || null
    const { error } = await supabase.from('cards').update({ series_name: value }).eq('id', card.id)
    if (error) { alert(error.message); return }
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, series_name: value } : c))
    setSelected(prev => prev && prev.id === card.id
      ? { ...prev, series_name: value || '', _seriesNew: false }
      : prev)
    if (editing?.id === card.id) {
      setEditing(prev => prev ? { ...prev, series_name: value || '', _seriesNew: false } : prev)
    }
  }

  // Rename a series across all member cards — does NOT delete media
  const renameSeriesName = async (oldName) => {
    const from = (oldName || '').trim()
    if (!from) return
    const input = prompt(`Rename series “${from}” to:`, from)
    if (input == null) return
    const to = input.trim()
    if (!to) { alert('Name cannot be empty'); return }
    if (to === from) return
    // case-insensitive clash with another series
    const clash = cards.some(c => {
      const n = (c.series_name || '').trim()
      return n && n.toLowerCase() === to.toLowerCase() && n !== from
    })
    if (clash && !confirm(`A series named “${to}” already exists. Merge into it?`)) return
    const members = cards.filter(c => (c.series_name || '').trim() === from)
    const ids = members.map(c => c.id)
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const { error } = await supabase.from('cards').update({ series_name: to }).in('id', chunk)
      if (error) {
        alert('Could not rename series: ' + error.message)
        return
      }
    }
    setCards(prev => prev.map(c =>
      (c.series_name || '').trim() === from ? { ...c, series_name: to } : c
    ))
    setSelected(prev =>
      prev && (prev.series_name || '').trim() === from
        ? { ...prev, series_name: to }
        : prev
    )
    setEditing(prev =>
      prev && (prev.series_name || '').trim() === from
        ? { ...prev, series_name: to }
        : prev
    )
    if (selectedSeries === from) setSelectedSeries(to)
    if (seriesFilter === from) setSeriesFilter(to)
    alert(`Renamed “${from}” → “${to}” on ${members.length} card${members.length === 1 ? '' : 's'}.`)
  }

  // Remove series label from all cards with this name — does NOT delete cards or media
  const deleteSeriesName = async (seriesName) => {
    const name = (seriesName || '').trim()
    if (!name) return
    const members = cards.filter(c => (c.series_name || '').trim() === name)
    const ok = confirm(
      `Remove series “${name}” from ${members.length} card${members.length === 1 ? '' : 's'}?\n\n` +
      `Cards and all media stay. Only the series name / 👑 is cleared.`
    )
    if (!ok) return
    const ids = members.map(c => c.id)
    // batch update
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const { error } = await supabase.from('cards').update({ series_name: null }).in('id', chunk)
      if (error) {
        alert('Could not clear series: ' + error.message)
        return
      }
    }
    setCards(prev => prev.map(c =>
      (c.series_name || '').trim() === name ? { ...c, series_name: null } : c
    ))
    setSelected(prev =>
      prev && (prev.series_name || '').trim() === name
        ? { ...prev, series_name: '', _seriesNew: false }
        : prev
    )
    setEditing(prev =>
      prev && (prev.series_name || '').trim() === name
        ? { ...prev, series_name: '', _seriesNew: false }
        : prev
    )
    if (selectedSeries === name) setSelectedSeries(null)
    if (seriesFilter === name) setSeriesFilter('all')
    alert(`Series “${name}” removed from ${members.length} card${members.length === 1 ? '' : 's'}. Media kept.`)
  }


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
    <div className="min-h-screen bg-black text-white p-5 w-full max-w-lg md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto">
      {/* Card foil / holo / rarity edges — includes Mint shimmer */}
      <style>{`
        .card-shell {
          border-radius: 14px;
          padding: 2px;
          position: relative;
        }
        .card-inner {
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          background: #111;
        }
        .card-inner.foil::before,
        .card-inner.foil-strong::before,
        .card-inner.foil-ultra::before,
        .card-inner.foil-pearl::before {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 3;
          opacity: 0.35;
          mix-blend-mode: color-dodge;
          background: linear-gradient(
            115deg,
            transparent 20%,
            rgba(255,255,255,0.15) 35%,
            rgba(180,220,255,0.35) 42%,
            rgba(255,180,255,0.3) 48%,
            rgba(255,255,200,0.25) 55%,
            transparent 70%
          );
          background-size: 220% 220%;
          animation: ga-foil-shift 5s ease-in-out infinite;
        }
        .card-inner.foil-strong::before { opacity: 0.45; }
        .card-inner.foil-ultra::before { opacity: 0.55; }
        .card-inner.holo::after {
          content: '';
          pointer-events: none;
          position: absolute;
          inset: -20%;
          z-index: 4;
          background: linear-gradient(
            125deg,
            transparent 30%,
            rgba(255,255,255,0.0) 40%,
            rgba(120,220,255,0.45) 46%,
            rgba(255,120,220,0.4) 50%,
            rgba(255,230,120,0.35) 54%,
            rgba(255,255,255,0.0) 60%,
            transparent 70%
          );
          background-size: 200% 200%;
          animation: ga-holo-sweep 3.2s linear infinite;
          mix-blend-mode: soft-light;
        }
        @keyframes ga-foil-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes ga-holo-sweep {
          0% { transform: translateX(-30%) rotate(8deg); opacity: 0.35; }
          50% { transform: translateX(30%) rotate(8deg); opacity: 0.7; }
          100% { transform: translateX(-30%) rotate(8deg); opacity: 0.35; }
        }
        .edge-common { background: linear-gradient(135deg, #555, #333); }
        .edge-uncommon { background: linear-gradient(135deg, #3d8b5a, #1e4d32); }
        .edge-rare { background: linear-gradient(135deg, #3b82f6, #1e3a8a); }
        .edge-epic { background: linear-gradient(135deg, #a855f7, #6b21a8); }
        .edge-legendary { background: linear-gradient(135deg, #f59e0b, #b45309, #fbbf24); }
        .edge-ultra { background: linear-gradient(135deg, #f0abfc, #e879f9, #a21caf, #fbbf24); }
        .edge-afterhours { background: linear-gradient(135deg, #64748b, #1e293b, #94a3b8); }
        .edge-mint {
          background: linear-gradient(135deg, #fef3c7, #fbbf24, #f472b6, #a78bfa, #34d399, #fef3c7);
          background-size: 300% 300%;
          animation: ga-mint-edge 4s ease infinite;
        }
        @keyframes ga-mint-edge {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .glow-rare { box-shadow: 0 0 18px rgba(59,130,246,0.35); }
        .glow-epic { box-shadow: 0 0 22px rgba(168,85,247,0.45); }
        .glow-legendary { box-shadow: 0 0 26px rgba(245,158,11,0.5); }
        .glow-ultra { box-shadow: 0 0 28px rgba(232,121,249,0.55); }
        .glow-mint { box-shadow: 0 0 30px rgba(251,191,36,0.55), 0 0 50px rgba(244,114,182,0.35); }
        .badge {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 999px;
          background: rgba(0,0,0,0.65);
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
        }
        .badge-mint {
          background: linear-gradient(135deg, rgba(251,191,36,0.9), rgba(244,114,182,0.85));
          color: #111;
          border-color: rgba(255,255,255,0.5);
          box-shadow: 0 0 12px rgba(251,191,36,0.6);
        }
        .badge-legendary { background: rgba(180,83,9,0.85); }
        .badge-ultra { background: rgba(162,28,175,0.85); }
        .badge-epic { background: rgba(107,33,168,0.85); }
        .nameplate {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          padding: 28px 12px 10px;
          background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
          z-index: 8;
        }
      `}</style>
{/* end card effect styles */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm">← Back</button>
          <button onClick={() => router.push('/media')} className="text-pink-400 hover:text-pink-300 text-sm font-semibold">Media</button>
          <button onClick={() => router.push('/gallery')} className="text-gray-400 hover:text-white text-sm">Gallery</button>
        </div>
        <h1 className="text-xl font-bold tracking-wide">Cards</h1>
        <button onClick={() => {
          setCreateArtSource('generate')
          setDraftFrontUrl('')
          setDraftBackUrl('')
          clearPromptExtras()
          setShowCreate(true)
        }} className="bg-purple-600 hover:bg-purple-700 rounded-full px-4 py-2 text-sm font-semibold">+ New</button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => { setPageMode('cards'); setSelectedSeries(null) }}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${pageMode === 'cards' ? 'bg-purple-600' : 'bg-gray-900 text-gray-400'}`}
        >
          All cards
        </button>
        <button
          type="button"
          onClick={() => setPageMode('series')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${pageMode === 'series' ? 'bg-purple-600' : 'bg-gray-900 text-gray-400'}`}
        >
          Series 👑
        </button>
      </div>

      {pageMode === 'series' && (
        <div className="mb-8">
          {seriesStats.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-center text-sm text-gray-500">
              <p>No series yet.</p>
              <p className="text-xs mt-2">Open a card → set Series name, or use Edit / Create.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {seriesStats.map(s => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => setSelectedSeries(selectedSeries === s.name ? null : s.name)}
                  className={`w-full text-left rounded-xl border p-4 transition ${selectedSeries === s.name ? 'border-pink-600 bg-pink-950/30' : 'border-gray-800 bg-gray-900'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm truncate">👑 {s.name}</p>
                        <button
                          type="button"
                          title="Rename series"
                          onClick={(e) => { e.stopPropagation(); renameSeriesName(s.name) }}
                          className="shrink-0 text-gray-400 hover:text-pink-300 text-sm px-1"
                        >
                          ✎
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {s.unique} unique card{s.unique === 1 ? '' : 's'}
                        {' · '}{s.published} published
                        {' · '}{s.totalPrint.toLocaleString()} max copies total
                      </p>
                    </div>
                    <span className="text-gray-500 text-xs">{selectedSeries === s.name ? '▲' : '▼'}</span>
                  </div>
                  {selectedSeries === s.name && (
                    <div className="mt-3 pt-3 border-t border-gray-800 space-y-3" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => renameSeriesName(s.name)}
                        className="w-full text-xs text-pink-300 hover:text-pink-200 py-2 border border-pink-900/40 rounded-lg"
                      >
                        ✎ Rename series
                      </button>
                      <p className="text-[10px] tracking-wide uppercase text-gray-500">By rarity</p>
                      <div className="space-y-1">
                        {Object.entries(s.byRarity).map(([r, info]) => (
                          <div key={r} className="flex justify-between text-[11px] text-gray-300">
                            <span className="capitalize">{rarityLabel(r)}</span>
                            <span className="text-gray-500">
                              {info.count} unique · {info.print.toLocaleString()} print capacity
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] tracking-wide uppercase text-gray-500 pt-1">Cards in series</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {s.members.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => openCard(c)}
                            className="text-left bg-black/40 rounded-lg overflow-hidden border border-gray-800"
                          >
                            {c.image_url ? (
                              <img src={c.image_url} alt="" className="w-full aspect-[3/4] object-cover object-top" />
                            ) : (
                              <div className="w-full aspect-[3/4] bg-gray-800" />
                            )}
                            <div className="p-1.5">
                              <p className="text-[10px] font-semibold truncate">{c.name}</p>
                              <p className="text-[9px] text-gray-500 capitalize">{c.rarity} · ed. {c.edition_size || 500}</p>
                              {c.published && <p className="text-[9px] text-emerald-400">Live</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSeriesFilter(s.name); setPageMode('cards') }}
                        className="w-full text-xs text-pink-400 hover:text-pink-300 py-2"
                      >
                        Show these in card grid →
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSeriesName(s.name)}
                        className="w-full text-xs text-red-400 hover:text-red-300 py-2 border border-red-900/40 rounded-lg"
                      >
                        Delete series name only (keep cards &amp; media)
                      </button>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pageMode === 'cards' && !loading && cards.length > 0 && (
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
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setSeriesFilter('all')}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${seriesFilter === 'all' ? 'bg-pink-700 text-white' : 'bg-gray-900 text-gray-400'}`}>
              Any series
            </button>
            <button type="button" onClick={() => setSeriesFilter('none')}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${seriesFilter === 'none' ? 'bg-pink-700 text-white' : 'bg-gray-900 text-gray-400'}`}>
              No series
            </button>
            {seriesNames.map(n => (
              <button key={n} type="button" onClick={() => setSeriesFilter(n)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold ${seriesFilter === n ? 'bg-pink-700 text-white' : 'bg-gray-900 text-gray-400'}`}>
                👑 {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {pageMode === 'cards' && loading && (
        <p className="text-gray-500">Loading...</p>
      )}
      {pageMode === 'cards' && !loading && cards.length === 0 && (
        <p className="text-gray-500 text-sm">No cards yet. Tap "+ New" to summon one.</p>
      )}
      {pageMode === 'cards' && !loading && cards.length > 0 && visibleCards.length === 0 && (
        <p className="text-gray-500 text-sm">No cards match filters.</p>
      )}
      {pageMode === 'cards' && !loading && visibleCards.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {visibleCards.map(c => (
            <button key={c.id} onClick={() => openCard(c)} className="text-left relative">
              {cardFront(c)}
              {c.published && (
                <span className="absolute top-2 right-2 z-[5] bg-emerald-500 text-black rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold shadow">
                  ✓
                </span>
              )}
              {(mediaCounts[String(c.name || '').trim().toLowerCase()] || 0) > 0 && (
                <span className="absolute top-2 left-2 z-[5] bg-pink-600/90 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold shadow">
                  📎 {mediaCounts[String(c.name || '').trim().toLowerCase()]}
                </span>
              )}
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
                      edition_size: editionDefaultFor(r),
                    })
                  }}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500">
                  {RARITIES.map(r => <option key={r} value={r}>{rarityLabel(r)}</option>)}
                </select>
                <p className="text-[10px] text-gray-600 mb-3">Changing rarity re-rolls stats and sets the default edition size for that tier.</p>

                {inputRow('Description', draft.description, v => setDraft({ ...draft, description: v }), true, 2)}
                {inputRow('Flavor Text', draft.flavor_text, v => setDraft({ ...draft, flavor_text: v }))}
                <label className="block text-xs text-gray-400 mb-1">Series (optional)</label>
                <select
                  value={
                    seriesNames.includes(draft.series_name || '')
                      ? draft.series_name
                      : (draft._seriesNew ? '__new__' : '')
                  }
                  onChange={e => {
                    const v = e.target.value
                    if (v === '__new__') setDraft({ ...draft, series_name: '', _seriesNew: true })
                    else setDraft({ ...draft, series_name: v, _seriesNew: false })
                  }}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-purple-500"
                >
                  <option value="">No series</option>
                  {seriesNames.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                  <option value="__new__">＋ New series…</option>
                </select>
                {!!draft._seriesNew && (
                  <input
                    value={draft.series_name || ''}
                    onChange={e => setDraft({ ...draft, series_name: e.target.value, _seriesNew: true })}
                    placeholder="Type new series name"
                    className="w-full bg-black border border-pink-800 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-pink-500"
                  />
                )}
                <p className="text-[10px] text-gray-600 mb-2">
                  Series cards get a 👑 on the front and the name on the back.
                  {draft.series_name && seriesNames.includes(draft.series_name) && (
                    <> · <button type="button" className="text-pink-400 hover:text-pink-300" onClick={() => { setPageMode('series'); setSelectedSeries(draft.series_name); setShowCreate(false) }}>Open in Series tab</button></>
                  )}
                </p>
                <label className="block text-xs text-gray-400 mb-1">
                  How many available (edition size)
                </label>
                <select
                  value={String(
                    EDITION_QTY_OPTIONS.includes(Number(draft.edition_size))
                      ? Number(draft.edition_size)
                      : editionDefaultFor(draft.rarity)
                  )}
                  onChange={e => setDraft({ ...draft, edition_size: Number(e.target.value) })}
                  disabled={String(draft.rarity || '').toLowerCase() === 'mint'}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500 disabled:opacity-60"
                >
                  {EDITION_QTY_OPTIONS.map(n => (
                    <option key={n} value={n}>{editionOptionLabel(n)}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-600 mb-1">
                  {String(draft.rarity || '').toLowerCase() === 'mint'
                    ? 'Mint is always 1 of 1.'
                    : (
                      <>
                        Selected rarity default: <span className="text-pink-300 font-semibold">{editionDefaultFor(draft.rarity)}</span>
                        {' '}({rarityLabel(draft.rarity || 'common')}). Changing rarity auto-fills this.
                      </>
                    )}
                </p>
                <p className="text-[9px] text-gray-600 mb-3 leading-relaxed">
                  Defaults — common 2000 · uncommon 1000 · rare 500 · epic 350 · legendary 250 · ultra elite 150 · after hours 50 · mint 1
                </p>

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
                  {artStylesList.map(s => <option key={s.label + s.value.slice(0, 12)} value={s.value}>{s.label}</option>)}
                </select>

                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setCreateArtSource('generate')}
                    className={`flex-1 rounded-lg py-2 text-xs font-semibold ${createArtSource === 'generate' ? 'bg-purple-600' : 'bg-gray-800 text-gray-400'}`}
                  >
                    Generate art
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateArtSource('gallery')}
                    className={`flex-1 rounded-lg py-2 text-xs font-semibold ${createArtSource === 'gallery' ? 'bg-purple-600' : 'bg-gray-800 text-gray-400'}`}
                  >
                    From gallery
                  </button>
                </div>

                {createArtSource === 'gallery' ? (
                  <>
                    <p className="text-[10px] text-gray-500 mb-2">
                      Pick existing Studio images for front/back. Name, stats, series, and the rest still apply.
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <p className="text-[10px] text-gray-400 mb-1">Front</p>
                        {draftFrontUrl ? (
                          <img src={draftFrontUrl} alt="" className="w-full aspect-[3/4] object-cover object-top rounded-lg border border-gray-700 mb-1" />
                        ) : (
                          <div className="w-full aspect-[3/4] rounded-lg bg-gray-800 border border-dashed border-gray-600 mb-1" />
                        )}
                        <button type="button" onClick={() => openGalleryPicker('create-front')}
                          className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-[11px] font-semibold">
                          {draftFrontUrl ? 'Change front' : 'Pick front'}
                        </button>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 mb-1">Back (optional)</p>
                        {draftBackUrl ? (
                          <img src={draftBackUrl} alt="" className="w-full aspect-[3/4] object-cover object-top rounded-lg border border-gray-700 mb-1" />
                        ) : (
                          <div className="w-full aspect-[3/4] rounded-lg bg-gray-800 border border-dashed border-gray-600 mb-1" />
                        )}
                        <button type="button" onClick={() => openGalleryPicker('create-back')}
                          className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-[11px] font-semibold">
                          {draftBackUrl ? 'Change back' : 'Pick back'}
                        </button>
                        {draftBackUrl && (
                          <button type="button" onClick={() => setDraftBackUrl('')}
                            className="w-full text-[10px] text-gray-500 hover:text-white mt-1">Clear back</button>
                        )}
                      </div>
                    </div>
                    {inputRow('Front note / prompt (optional)', draft.image_prompt, v => setDraft({ ...draft, image_prompt: v }), true, 2)}
                    {inputRow('Back note / prompt (optional)', draft.back_image_prompt, v => setDraft({ ...draft, back_image_prompt: v }), true, 2)}
                  </>
                ) : (
                  <>
                    {inputRow('Front Art Prompt', draft.image_prompt, v => setDraft({ ...draft, image_prompt: v }), true, 4)}
                    {inputRow('Back Art Prompt (optional)', draft.back_image_prompt, v => setDraft({ ...draft, back_image_prompt: v }), true, 4)}

                    {/* Prompt extras — click chips to add/remove in logical order */}
                    <div className="mb-4 border border-gray-800 rounded-xl p-3 bg-black/40">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-pink-300">Prompt extras</p>
                        <button
                          type="button"
                          onClick={clearPromptExtras}
                          className="text-[10px] text-gray-500 hover:text-white"
                        >
                          Clear all
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-600 mb-3">
                        Tap a chip to add it; tap again to remove. Order is fixed: looks → body → card design → text.
                      </p>
                      {PROMPT_EXTRA_CATEGORIES.map(cat => (
                        <div key={cat.id} className="mb-3">
                          <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">{cat.label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {cat.options.map(opt => {
                              const on = promptExtras[cat.id] === opt.id
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => togglePromptExtra(cat.id, opt.id)}
                                  className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition ${
                                    on
                                      ? 'bg-pink-600 border-pink-400 text-white'
                                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}

                      <div className="pt-2 border-t border-gray-800">
                        <button
                          type="button"
                          onClick={() => setCardTextOn(v => !v)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-medium mb-2 ${
                            cardTextOn
                              ? 'bg-pink-600 border-pink-400 text-white'
                              : 'bg-gray-900 border-gray-700 text-gray-400'
                          }`}
                        >
                          {cardTextOn ? '✓ Card text on' : 'Card text overlay'}
                        </button>
                        {cardTextOn && (
                          <div className="space-y-2 mt-1">
                            <input
                              value={cardTextContent}
                              onChange={e => setCardTextContent(e.target.value)}
                              placeholder='Text on card (e.g. character name)'
                              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <select value={cardTextSize} onChange={e => setCardTextSize(e.target.value)}
                                className="bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none">
                                {CARD_TEXT_SIZES.map(s => <option key={s.id} value={s.id}>{s.label} size</option>)}
                              </select>
                              <select value={cardTextPos} onChange={e => setCardTextPos(e.target.value)}
                                className="bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none">
                                {CARD_TEXT_POS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                              </select>
                              <select value={cardTextFont} onChange={e => setCardTextFont(e.target.value)}
                                className="bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none">
                                {CARD_TEXT_FONTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                              </select>
                              <select value={cardTextColor} onChange={e => setCardTextColor(e.target.value)}
                                className="bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none">
                                {CARD_TEXT_COLORS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      {(Object.keys(promptExtras).length > 0 || (cardTextOn && cardTextContent.trim())) && (
                        <div className="mt-3 p-2 rounded-lg bg-gray-950 border border-gray-800">
                          <p className="text-[9px] text-gray-500 mb-1">Final front prompt preview</p>
                          <p className="text-[11px] text-gray-300 leading-relaxed break-words">
                            {composePromptWithExtras(draft.image_prompt) || '(add a base prompt)'}
                            {artStyle ? <span className="text-purple-400">, [art style]</span> : null}
                          </p>
                        </div>
                      )}
                    </div>

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
                  </>
                )}

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
            <label className="block text-xs text-gray-400 mb-1">Series (optional)</label>
            <select
              value={
                seriesNames.includes(editing.series_name || '')
                  ? editing.series_name
                  : (editing._seriesNew ? '__new__' : (editing.series_name ? '__new__' : ''))
              }
              onChange={e => {
                const v = e.target.value
                if (v === '__new__') setEditing({ ...editing, series_name: '', _seriesNew: true })
                else setEditing({ ...editing, series_name: v, _seriesNew: false })
              }}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-purple-500"
            >
              <option value="">No series</option>
              {seriesNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="__new__">＋ New series…</option>
            </select>
            {(editing._seriesNew || (editing.series_name && !seriesNames.includes(editing.series_name))) && (
              <input
                value={editing.series_name || ''}
                onChange={e => setEditing({ ...editing, series_name: e.target.value, _seriesNew: true })}
                placeholder="Type new series name"
                className="w-full bg-black border border-pink-800 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-pink-500"
              />
            )}
            {editing.series_name && seriesNames.includes(editing.series_name) && (
              <button
                type="button"
                className="text-[10px] text-pink-400 hover:text-pink-300 mb-2"
                onClick={() => { setPageMode('series'); setSelectedSeries(editing.series_name); setEditing(null) }}
              >
                Open “{editing.series_name}” in Series tab →
              </button>
            )}
            <label className="block text-xs text-gray-400 mb-1">How many available (edition size)</label>
            <select
              value={String(
                EDITION_QTY_OPTIONS.includes(Number(editing.edition_size))
                  ? Number(editing.edition_size)
                  : editionDefaultFor(editing.rarity)
              )}
              onChange={e => setEditing({ ...editing, edition_size: Number(e.target.value) })}
              disabled={String(editing.rarity || '').toLowerCase() === 'mint'}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-1 outline-none focus:border-purple-500 disabled:opacity-60"
            >
              {EDITION_QTY_OPTIONS.map(n => (
                <option key={n} value={n}>{editionOptionLabel(n)}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-600 mb-3">
              {String(editing.rarity || '').toLowerCase() === 'mint'
                ? 'Mint is always 1 of 1.'
                : `Default for ${rarityLabel(editing.rarity || 'common')}: ${editionDefaultFor(editing.rarity)}. Price is set in the Shop.`}
            </p>

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
              <p className="text-xs text-gray-400 mb-2 font-semibold">Card art</p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <button type="button" onClick={() => openGalleryPicker('edit-front')} disabled={!!regenProgress}
                  className="bg-pink-900/60 hover:bg-pink-800 disabled:opacity-50 rounded-lg py-2 text-[11px] font-semibold">
                  Front from gallery
                </button>
                <button type="button" onClick={() => openGalleryPicker('edit-back')} disabled={!!regenProgress}
                  className="bg-pink-900/60 hover:bg-pink-800 disabled:opacity-50 rounded-lg py-2 text-[11px] font-semibold">
                  Back from gallery
                </button>
              </div>

              {inputRow('Front Art Prompt', editing.image_prompt, v => setEditing({ ...editing, image_prompt: v }), true, 3)}
              {inputRow('Back Art Prompt', editing.back_image_prompt, v => setEditing({ ...editing, back_image_prompt: v }), true, 3)}
              {inputRow('Negative Prompt', editNegative, setEditNegative, true, 2)}

              <label className="block text-xs text-gray-400 mb-1">Add Art Style</label>
              <select value={editStyle} onChange={e => setEditStyle(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                {artStylesList.map(s => <option key={s.label + s.value.slice(0, 12)} value={s.value}>{s.label}</option>)}
              </select>

              <label className="block text-xs text-gray-400 mb-1">Aspect Ratio</label>
              <select value={editSize} onChange={e => setEditSize(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
                {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>

              {regenProgress && <p className="text-xs text-purple-400 mb-2">{regenProgress}</p>}

              <p className="text-[10px] text-gray-500 mb-1">AI regenerate (new image from prompt)</p>
              <div className="flex gap-2 mb-2">
                <button onClick={() => regenSide('front')} disabled={!!regenProgress}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">Regen Front</button>
                <button onClick={() => regenSide('back')} disabled={!!regenProgress}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">Regen Back</button>
              </div>
              <p className="text-[10px] text-gray-500 mb-1">I2I edit (keeps composition, applies prompt change)</p>
              <div className="flex gap-2 mb-4">
                <button onClick={() => i2iSide('front')} disabled={!!regenProgress || !editing.image_url}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">I2I Front</button>
                <button onClick={() => i2iSide('back')} disabled={!!regenProgress || !editing.back_image_url}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">I2I Back</button>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => {
                const id = editing?.id
                setEditing(null)
                if (id) {
                  syncCardQuery(id, false)
                  const found = cards.find(c => c.id === id)
                  if (found) openCard(found)
                } else syncCardQuery(null, false)
              }} disabled={saving} className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold">Cancel</button>
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
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-5 z-50 overflow-y-auto" onClick={closeSelected}>
          <div className="w-full max-w-sm my-6" onClick={e => e.stopPropagation()}>
            {sideToggle()}
            {side === 'front' && viewToggle()}

            <button
              onClick={() => setExpanded(true)}
              onTouchStart={onCardTouchStart}
              onTouchEnd={onCardTouchEnd}
              onMouseDown={onCardTouchStart}
              onMouseUp={onCardTouchEnd}
              className="block w-full text-left select-none"
            >
              {side === 'front' ? cardFront(selected, false, view === 'animated') : cardBack(selected)}
            </button>
            <p className="text-center text-[10px] text-gray-600 mt-2">swipe to flip · tap to expand</p>

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
              <div className="pt-2 border-t border-gray-800">
                <label className="block text-gray-500 mb-1">Series</label>
                <div className="flex gap-2 mb-2">
                  <select
                    value={
                      seriesNames.includes(selected.series_name || '')
                        ? selected.series_name
                        : (selected._seriesNew ? '__new__' : (selected.series_name ? '__new__' : ''))
                    }
                    onChange={e => {
                      const v = e.target.value
                      if (v === '__new__') setSelected({ ...selected, series_name: '', _seriesNew: true })
                      else {
                        setSelected({ ...selected, series_name: v, _seriesNew: false })
                        assignSeries(selected, v)
                      }
                    }}
                    className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-purple-500"
                  >
                    <option value="">No series</option>
                    {seriesNames.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value="__new__">＋ New series…</option>
                  </select>
                  {selected.series_name && seriesNames.includes(selected.series_name) && (
                    <button
                      type="button"
                      onClick={() => { setPageMode('series'); setSelectedSeries(selected.series_name); setSelected(null) }}
                      className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-pink-300"
                      title="Open Series tab"
                    >
                      👑
                    </button>
                  )}
                </div>
                {(selected._seriesNew || (selected.series_name && !seriesNames.includes(selected.series_name))) && (
                  <div className="flex gap-2 mb-2">
                    <input
                      value={selected.series_name || ''}
                      onChange={e => setSelected({ ...selected, series_name: e.target.value, _seriesNew: true })}
                      placeholder="New series name"
                      className="flex-1 bg-black border border-pink-800 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={() => assignSeries(selected, selected.series_name)}
                      className="bg-pink-800 hover:bg-pink-700 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    >
                      Save
                    </button>
                  </div>
                )}
                {selected.series_name && seriesNames.includes(selected.series_name) && (
                  <div className="flex flex-wrap gap-3 mb-2">
                    <button
                      type="button"
                      onClick={() => { setPageMode('series'); setSelectedSeries(selected.series_name); setSelected(null) }}
                      className="text-[10px] text-pink-400 hover:text-pink-300"
                    >
                      View in Series tab →
                    </button>
                    <button
                      type="button"
                      onClick={() => assignSeries(selected, '')}
                      className="text-[10px] text-gray-500 hover:text-white"
                    >
                      Remove from series
                    </button>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-gray-800">
                <label className="block text-gray-500 mb-1">Available copies (edition size)</label>
                <div className="flex gap-2">
                  <select
                    value={String(
                      EDITION_QTY_OPTIONS.includes(Number(selected.edition_size))
                        ? Number(selected.edition_size)
                        : editionDefaultFor(selected.rarity)
                    )}
                    onChange={e => setSelected({ ...selected, edition_size: Number(e.target.value) })}
                    disabled={String(selected.rarity || '').toLowerCase() === 'mint'}
                    className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-purple-500 disabled:opacity-60"
                  >
                    {EDITION_QTY_OPTIONS.map(n => (
                      <option key={n} value={n}>{editionOptionLabel(n)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveEditionSize}
                    disabled={String(selected.rarity || '').toLowerCase() === 'mint'}
                    className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">
                  {String(selected.rarity || '').toLowerCase() === 'mint'
                    ? 'Mint is always 1 of 1.'
                    : (
                      <>
                        Default for <span className="text-gray-400 capitalize">{selected.rarity || 'common'}</span>: {editionDefaultFor(selected.rarity)}.
                        {' '}Buyers get 1/{selected.edition_size || editionDefaultFor(selected.rarity)}, 2/… Price is set in the Shop.
                      </>
                    )}
                </p>
                <p className="text-[9px] text-gray-600 mt-0.5 leading-relaxed">
                  Defaults — common 2000 · uncommon 1000 · rare 500 · epic 350 · legendary 250 · ultra elite 150 · after hours 50 · mint 1
                </p>
              </div>
            </div>

            <button onClick={() => togglePublish(selected)}
              className={`w-full rounded-lg py-2 text-sm font-semibold mt-3 ${selected.published ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}>
              {selected.published ? '✓ Published to game' : 'Publish to game'}
            </button>
            <button onClick={openAnimate} disabled={animating}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2">
              {animating ? 'Animating...' : selected.video_url ? '🎬 Re-animate Front' : '🎬 Animate Front'}
            </button>
            <button
              type="button"
              onClick={() => openGalleryPicker('attach-video')}
              disabled={attachBusy}
              className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2"
            >
              {attachBusy ? 'Working…' : '🎞 Add gallery video…'}
            </button>
            <p className="text-[10px] text-gray-500 text-center mt-1">
              You’ll choose: front animation or extra character media
            </p>
            {selected.video_url && (
              <button
                type="button"
                onClick={generateCardPoster}
                disabled={posterBusy}
                className="w-full bg-amber-900/70 hover:bg-amber-800 disabled:opacity-50 rounded-lg py-2 text-sm font-semibold mt-2"
              >
                {posterBusy ? 'Generating…' : selected.poster_url ? '🖼 Regenerate video poster' : '🖼 Generate video poster'}
              </button>
            )}
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
            <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-xs font-semibold text-pink-300 mb-1">
                Card character media
                {charMedia.length > 0 ? ` · ${charMedia.length}` : ''}
              </p>
              <p className="text-[10px] text-gray-500 mb-3">
                Extra images/videos tied to <span className="text-gray-300">{selected.name}</span> (not card face/back).
                Shared by name across all rarities of this character. Live = available in game media draws.
              </p>

              {charMedia.length > 0 && (
                <div className="space-y-2 mb-3">
                  {charMedia.map(m => (
                    <div key={m.id} className="bg-black/40 rounded-lg p-2">
                      <div className="flex gap-2 items-center">
                        {m.type === 'video' ? (
                          <video src={m.url} className="w-12 h-12 rounded object-cover shrink-0" muted playsInline />
                        ) : (
                          <img src={m.url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{m.title || m.type || 'Untitled'}</p>
                          <p className="text-[10px] text-gray-500">{m.unlock_method} · ed. {m.edition_size || 300}</p>
                          {m.type === 'video' && (
                            <button
                              type="button"
                              disabled={attachBusy}
                              onClick={() => attachFrontAnimation(m.url)}
                              className="text-[10px] text-pink-300 hover:text-pink-200 mt-0.5 font-semibold"
                            >
                              Set as front animation
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => editingMediaId === m.id ? cancelEditCharMedia() : startEditCharMedia(m)}
                          className="text-[10px] px-2 py-1 rounded font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200"
                          title="Edit title / settings"
                        >
                          {editingMediaId === m.id ? 'Close' : 'Edit'}
                        </button>
                        <button onClick={() => toggleMediaPublish(m)}
                          className={`text-[10px] px-2 py-1 rounded font-semibold ${m.published ? 'bg-emerald-700' : 'bg-gray-700'}`}>
                          {m.published ? 'Live' : 'Off'}
                        </button>
                        <button onClick={() => deleteCharMedia(m)} className="text-red-400 text-xs px-1">✕</button>
                      </div>
                      {editingMediaId === m.id && (
                        <div className="mt-2 pt-2 border-t border-gray-800 space-y-2">
                          <input
                            value={editMediaTitle}
                            onChange={e => setEditMediaTitle(e.target.value)}
                            placeholder="Title"
                            className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-purple-500"
                          />
                          <div className="flex gap-2">
                            <select
                              value={editMediaType}
                              onChange={e => setEditMediaType(e.target.value)}
                              className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none"
                            >
                              <option value="image">Image</option>
                              <option value="video">Video</option>
                            </select>
                            <select
                              value={editMediaUnlock}
                              onChange={e => setEditMediaUnlock(e.target.value)}
                              className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none"
                            >
                              <option value="shop">Shop</option>
                              <option value="mine">Mine</option>
                              <option value="both">Both</option>
                            </select>
                            <select
                              value={String(editMediaEdition)}
                              onChange={e => setEditMediaEdition(e.target.value)}
                              className="w-20 bg-black border border-gray-700 rounded-lg px-1 py-1.5 text-xs outline-none"
                            >
                              {EDITION_QTY_OPTIONS.map(n => (
                                <option key={n} value={n}>{editionOptionLabel(n)}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={cancelEditCharMedia}
                              className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-1.5 text-xs font-semibold"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={editMediaBusy}
                              onClick={saveEditCharMedia}
                              className="flex-1 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 rounded-lg py-1.5 text-xs font-semibold"
                            >
                              {editMediaBusy ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <input value={mediaTitle} onChange={e => setMediaTitle(e.target.value)} placeholder="Title (optional)"
                className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs mb-2 outline-none focus:border-purple-500" />
              <input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="Media URL (image or video)"
                className="w-full bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs mb-2 outline-none focus:border-purple-500" />
              {mediaUrl ? (
                <div className="mb-2 flex items-center gap-2">
                  {mediaType === 'video' ? (
                    <video src={mediaUrl} className="w-12 h-12 rounded object-cover" muted playsInline />
                  ) : (
                    <img src={mediaUrl} alt="" className="w-12 h-12 rounded object-cover" />
                  )}
                  <button type="button" onClick={() => setMediaUrl('')} className="text-[10px] text-gray-400 hover:text-white">Clear</button>
                </div>
              ) : null}
              <div className="flex gap-2 mb-2">
                <select value={mediaType} onChange={e => setMediaType(e.target.value)}
                  className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none">
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
                <select value={mediaUnlock} onChange={e => setMediaUnlock(e.target.value)}
                  className="flex-1 bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-xs outline-none">
                  <option value="shop">Shop</option>
                  <option value="mine">Mine</option>
                  <option value="both">Both</option>
                </select>
                <select value={String(mediaEdition)} onChange={e => setMediaEdition(e.target.value)}
                  title="Qty available"
                  className="w-20 bg-black border border-gray-700 rounded-lg px-1 py-1.5 text-xs outline-none">
                  {EDITION_QTY_OPTIONS.map(n => (
                    <option key={n} value={n}>{editionOptionLabel(n)}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => openGalleryPicker('char-media')}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-xs font-semibold mb-2"
              >
                🖼▶ Pick image or video from gallery
              </button>
              <button onClick={openCreateMedia}
                className="w-full bg-pink-600 hover:bg-pink-500 rounded-lg py-2 text-xs font-semibold mb-2">
                ✦ Create +media from this card
              </button>
              <button onClick={addCharMedia} disabled={mediaBusy}
                className="w-full bg-pink-900/60 hover:bg-pink-800 disabled:opacity-50 rounded-lg py-2 text-xs font-semibold">
                {mediaBusy ? 'Saving...' : mediaUrl ? '+ Add selected media' : '+ Paste URL / pick media'}
              </button>
            </div>

            <button onClick={() => openEdit(selected)} className="w-full bg-purple-600 hover:bg-purple-700 rounded-lg py-2 text-sm font-semibold mt-2">Edit Card</button>
            <button onClick={() => deleteCard(selected)} className="w-full bg-red-900 hover:bg-red-800 rounded-lg py-2 text-sm font-semibold mt-2">Delete Card</button>
            <button onClick={closeSelected} className="w-full bg-gray-800 hover:bg-gray-700 rounded-lg py-2 text-sm font-semibold mt-2">Close</button>
          </div>
        </div>
      )}

      {/* CREATE MEDIA FROM CARD */}
      {showCreateMedia && selected && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center p-5 z-[75] overflow-y-auto">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-lg my-8">
            <h2 className="font-bold text-lg mb-1">Create +media</h2>
            <p className="text-xs text-gray-500 mb-3">
              From <span className="text-gray-300">{selected.name}</span>. Saves and auto-links when done.
              Delete later to unlink — edition slots free up for new copies.
            </p>

            <label className="block text-xs text-gray-400 mb-1">Mode</label>
            <select value={cmMode} onChange={e => applyCmMode(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500">
              <option value="t2i">New image · T2I (prompt + seed)</option>
              <option value="i2i_front">Edit front image · I2I</option>
              <option value="i2i_back">Edit back image · I2I</option>
              <option value="i2v_front">Video from front · I2V</option>
              <option value="i2v_back">Video from back · I2V</option>
            </select>

            {(cmMode === 'i2v_front' || cmMode === 'i2v_back' || cmMode === 'i2i_front' || cmMode === 'i2i_back') && (
              <div className="mb-3">
                <img
                  src={(cmMode === 'i2v_back' || cmMode === 'i2i_back')
                    ? (selected.back_image_url || selected.image_url)
                    : selected.image_url}
                  alt=""
                  className="w-24 rounded-lg"
                />
                <p className="text-[10px] text-gray-500 mt-1">Source image for this mode</p>
              </div>
            )}

            <label className="block text-xs text-gray-400 mb-1">Title (optional)</label>
            <input value={cmTitle} onChange={e => setCmTitle(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500"
              placeholder={`${selected.name} extra`} />

            <label className="block text-xs text-gray-400 mb-1">Prompt</label>
            <textarea value={cmPrompt} onChange={e => setCmPrompt(e.target.value)} rows={4}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none focus:border-purple-500" />

            {cmMode === 't2i' && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Image model</label>
                <select value={cmImageModel} onChange={e => setCmImageModel(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                  {IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <label className="block text-xs text-gray-400 mb-1">Seed (from card, editable)</label>
                <input value={cmSeed} onChange={e => setCmSeed(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none" />
                <label className="block text-xs text-gray-400 mb-1">Negative</label>
                <textarea value={cmNeg} onChange={e => setCmNeg(e.target.value)} rows={2}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none" />
              </>
            )}

            {(cmMode === 'i2i_front' || cmMode === 'i2i_back') && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Edit model</label>
                <select value={cmEditModel} onChange={e => setCmEditModel(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                  {EDIT_IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <label className="block text-xs text-gray-400 mb-1">Seed (optional)</label>
                <input value={cmSeed} onChange={e => setCmSeed(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none" />
                <p className="text-[10px] text-gray-500 mb-3 -mt-2">Describe the change (outfit, pose, setting…). Source image is sent as reference.</p>
              </>
            )}

            {(cmMode === 'i2v_front' || cmMode === 'i2v_back') && (
              <>
                <label className="block text-xs text-gray-400 mb-1">Video model</label>
                <select value={cmModel} onChange={e => setCmModel(e.target.value)}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                  {VIDEO_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <label className="block text-xs text-gray-400 mb-1">Length</label>
                <select value={cmDuration} onChange={e => setCmDuration(parseInt(e.target.value))}
                  className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm mb-3 outline-none">
                  <option value={5}>5 seconds</option>
                  <option value={8}>8 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              </>
            )}

            {cmProgress && <p className="text-xs text-purple-400 mb-3">{cmProgress}</p>}

            <div className="flex gap-2">
              <button onClick={() => setShowCreateMedia(false)} disabled={cmBusy}
                className="flex-1 bg-gray-800 hover:bg-gray-700 rounded-lg py-3 font-semibold disabled:opacity-50">Cancel</button>
              <button onClick={runCreateMedia} disabled={cmBusy}
                className="flex-1 bg-pink-600 hover:bg-pink-500 rounded-lg py-3 font-semibold disabled:opacity-50">
                {cmBusy ? 'Working...' : 'Generate & link'}
              </button>
            </div>
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
            <button
              onClick={() => setExpanded(false)}
              onTouchStart={onCardTouchStart}
              onTouchEnd={onCardTouchEnd}
              onMouseDown={onCardTouchStart}
              onMouseUp={onCardTouchEnd}
              className="block w-full text-left select-none"
            >
              {side === 'front' ? cardFront(selected, true, view === 'animated') : cardBack(selected, true)}
            </button>
            <p className="text-center text-[10px] text-gray-600 mt-2">swipe to flip</p>
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

      {/* GALLERY IMAGE / VIDEO PICKER */}
      {galleryPicker && (
        <div className="fixed inset-0 z-[90] bg-black/90 flex items-end sm:items-center justify-center p-0 sm:p-5">
          <div className="bg-gray-950 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div>
                <p className="font-bold text-sm">
                  {galleryPicker === 'attach-video'
                    ? 'Pick a gallery video'
                    : galleryPicker === 'char-media'
                      ? 'Pick image or video for character media'
                      : 'Pick from gallery'}
                </p>
                <p className="text-[10px] text-gray-500">
                  {galleryPicker === 'attach-video'
                    ? 'After you pick, choose front animation or extra character media'
                    : galleryPicker === 'char-media'
                      ? 'Videos show a ▶ badge. Then add a title and save.'
                      : galleryPicker.includes('front')
                        ? 'Front image'
                        : 'Back image'}
                </p>
              </div>
              <button type="button" onClick={() => setGalleryPicker(null)} className="text-gray-400 hover:text-white text-lg px-2">✕</button>
            </div>
            <div className="px-4 py-2">
              <input
                value={galleryPoolSearch}
                onChange={e => setGalleryPoolSearch(e.target.value)}
                placeholder="Search prompts..."
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {galleryPoolLoading ? (
                <p className="text-center text-gray-500 text-sm py-10">Loading…</p>
              ) : galleryPool.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-10">
                  {galleryPicker === 'attach-video'
                    ? 'No gallery videos found.'
                    : galleryPicker === 'char-media'
                      ? 'No gallery images or videos found.'
                      : 'No gallery images found.'}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {galleryPool
                    .filter(g => {
                      const q = galleryPoolSearch.trim().toLowerCase()
                      if (!q) return true
                      return String(g.prompt || '').toLowerCase().includes(q)
                    })
                    .map(g => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => applyGalleryPick(g.url, g)}
                        className="relative aspect-square rounded-lg overflow-hidden bg-gray-900 border border-gray-800 active:scale-95 transition"
                      >
                        {g.type === 'video' ? (
                          g.poster_url || g.thumbnail_url ? (
                            <img src={g.poster_url || g.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <video src={g.url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                          )
                        ) : (
                          <img src={g.thumbnail_url || g.url} alt="" className="w-full h-full object-cover" />
                        )}
                        {g.type === 'video' && (
                          <span className="absolute bottom-1 right-1 bg-black/70 rounded px-1 text-[9px]">▶</span>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}